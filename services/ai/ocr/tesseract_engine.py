"""Tesseract CLI adapter for memory-constrained hosts.

RapidOCR (ONNX Runtime) is the higher-accuracy default, but its models peak at
roughly 250-330 MB. On a 512 MB combined Next.js + FastAPI container that
overlaps the cgroup limit and the kernel kills the service. Tesseract 5 runs as
a short-lived native process with a ~30-60 MB peak, so it is a genuine OCR
engine that fits where ONNX does not.

This adapter only reports what Tesseract actually produced. When the binary or
English language data is missing, ``available()`` is false and callers must show
the honest reason instead of substituting sample text. PDFs are never sent here:
their real text layer is read by PyMuPDF and is not OCR.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any

DEFAULT_PSM = "6"
DEFAULT_LANG = "eng"
TIMEOUT_SECONDS = 120


def binary_path() -> str | None:
    return shutil.which("tesseract")


def available() -> bool:
    return binary_path() is not None


@lru_cache(maxsize=1)
def binary_version() -> str:
    exe = binary_path()
    if not exe:
        return "unavailable"
    try:
        proc = subprocess.run(
            [exe, "--version"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return "unknown"
    first = (proc.stdout or proc.stderr or "").splitlines()
    if not first:
        return "unknown"
    # "tesseract 5.3.0" -> "5.3.0"
    parts = first[0].strip().split()
    return parts[1] if len(parts) > 1 else first[0].strip()


def method() -> str:
    return f"tesseract-cli-lstm-{binary_version()}"


def _prepare_image(path: Path) -> tuple[Path, str | None, dict[str, Any]]:
    """Downscale a large photo before Tesseract reads it.

    Returns ``(path_to_use, temp_path_to_delete, metadata)``. The OpenCV decode
    is transient and small compared with ONNX; Tesseract itself then reads a
    bounded image whose peak memory and runtime stay predictable on a 512 MB
    container. When OpenCV is unavailable or cannot decode the file, the
    original path is used and the metadata says so.
    """
    try:
        max_side = int(os.getenv("TD_OCR_MAX_IMAGE_SIDE", "1024"))
    except ValueError:
        max_side = 1024
    try:
        import cv2  # type: ignore
    except Exception:
        return path, None, {"downscaled": False, "max_side": max_side, "prepared": "original"}
    try:
        cv2.setNumThreads(1)
        img = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if img is None:
            return path, None, {"downscaled": False, "max_side": max_side, "prepared": "original"}
        height, width = img.shape[:2]
        meta: dict[str, Any] = {
            "source_width": int(width),
            "source_height": int(height),
            "max_side": max_side,
            "downscaled": False,
            "prepared": "original",
        }
        if max(height, width) <= max_side:
            return path, None, meta
        scale = max_side / float(max(height, width))
        resized = cv2.resize(
            img,
            (max(1, int(round(width * scale))), max(1, int(round(height * scale)))),
            interpolation=cv2.INTER_AREA,
        )
        handle = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        handle.close()
        if not cv2.imwrite(handle.name, resized):
            os.unlink(handle.name)
            return path, None, meta
        meta.update(
            {
                "width": int(resized.shape[1]),
                "height": int(resized.shape[0]),
                "downscaled": True,
                "prepared": "resized-png",
            }
        )
        return Path(handle.name), handle.name, meta
    except Exception:
        return path, None, {"downscaled": False, "max_side": max_side, "prepared": "original"}


def _parse_tsv(raw: str) -> tuple[str, float | None, int]:
    """Return (text, mean confidence, word count) from Tesseract TSV output."""
    lines: dict[tuple[str, str, str, str], list[str]] = {}
    confidences: list[float] = []
    header: list[str] | None = None
    for row in raw.splitlines():
        if not row.strip():
            continue
        cols = row.split("\t")
        if cols and cols[0] == "level":
            header = cols
            continue
        if header is None:
            continue
        record = dict(zip(header, cols))
        # Level 5 is a word; -1 confidence marks a non-text structural row.
        if record.get("level") != "5":
            continue
        word = (record.get("text") or "").strip()
        if not word:
            continue
        try:
            conf = float(record.get("conf") or "-1")
        except ValueError:
            conf = -1.0
        if conf >= 0:
            confidences.append(conf)
        key = (
            record.get("page_num", "1"),
            record.get("block_num", "0"),
            record.get("par_num", "0"),
            record.get("line_num", "0"),
        )
        lines.setdefault(key, []).append(word)

    ordered = [" ".join(words) for _, words in sorted(lines.items(), key=lambda kv: tuple(int(v) for v in kv[0]))]
    text = "\n".join(line for line in ordered if line.strip())
    confidence = round(sum(confidences) / len(confidences) / 100.0, 3) if confidences else None
    return text, confidence, len(confidences)


def run(path: Path) -> dict[str, Any]:
    """Run Tesseract and return text/confidence with the real engine version."""
    exe = binary_path()
    if not exe:
        return {
            "available": False,
            "engine": "tesseract",
            "reason": "The tesseract binary is not installed.",
            "text": "",
            "confidence": None,
            "method": "none",
            "is_ocr": False,
        }
    psm = (os.environ.get("TD_TESSERACT_PSM") or DEFAULT_PSM).strip() or DEFAULT_PSM
    lang = (os.environ.get("TD_TESSERACT_LANG") or DEFAULT_LANG).strip() or DEFAULT_LANG
    prepared_path, temp_path, prep_meta = _prepare_image(path)
    try:
        proc = subprocess.run(
            [exe, str(prepared_path), "stdout", "--psm", psm, "-l", lang, "tsv"],
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {
            "available": True,
            "engine": "tesseract",
            "reason": f"Tesseract exceeded the {TIMEOUT_SECONDS}s timeout.",
            "text": "",
            "confidence": None,
            "method": method(),
            "is_ocr": True,
            "preprocessing": prep_meta,
        }
    except OSError as exc:
        return {
            "available": False,
            "engine": "tesseract",
            "reason": f"Tesseract could not start: {type(exc).__name__}: {exc}",
            "text": "",
            "confidence": None,
            "method": "none",
            "is_ocr": False,
            "preprocessing": prep_meta,
        }
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass

    text, confidence, words = _parse_tsv(proc.stdout or "")
    warnings: list[str] = []
    if proc.returncode != 0:
        detail = (proc.stderr or "").strip().splitlines()
        warnings.append(
            f"Tesseract exited with code {proc.returncode}"
            + (f": {detail[-1]}" if detail else ".")
        )
    if not text.strip():
        warnings.append("Tesseract returned no text.")
    return {
        "available": True,
        "engine": "tesseract",
        "reason": None,
        "text": text.strip(),
        "confidence": confidence,
        "words": words,
        "method": method(),
        "is_ocr": True,
        "preprocessing": prep_meta,
        "warnings": warnings,
    }
