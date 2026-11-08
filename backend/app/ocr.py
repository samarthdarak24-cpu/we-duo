"""Document OCR with honest adapter selection.

Checklist rule: "For unavailable external APIs, implement an adapter and clearly
label demo data instead of claiming real verification." Every result reports the
ACTIVE engine and method. A PDF text layer is never reported as OCR; a fallback
is never reported as PaddleOCR; extraction is never proof of authenticity.
"""
from __future__ import annotations

import hashlib
import importlib.util
import os
import re
from pathlib import Path
from typing import Protocol

# Some Paddle builds crash in the oneDNN instruction path on certain CPUs
# ("ConvertPirAttribute2RuntimeAttribute not support"). Disabling oneDNN keeps
# the CPU kernels usable; it is harmless when the flags are unknown.
os.environ.setdefault("FLAGS_use_mkldnn", "0")
os.environ.setdefault("FLAGS_use_onednn", "0")

from pydantic import BaseModel, Field

from .logging import emit

MAX_FILE_BYTES = 25 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"}
MAGIC = {
    b"%PDF": "application/pdf",
    b"\x89PNG": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
    b"RIFF": "image/webp",
}


class OcrResult(BaseModel):
    text: str = ""
    engine: str = "unavailable"
    method: str = "none"
    pages: int = 0
    confidence: float | None = None
    warnings: list[str] = Field(default_factory=list)
    preprocessing: dict = Field(default_factory=dict)
    sha256: str = ""
    is_ocr: bool = False


class OcrBackend(Protocol):
    name: str
    def available(self) -> bool: ...
    def run(self, path: Path) -> OcrResult: ...


def validate_file(path: Path) -> tuple[bool, str | None]:
    if not path.is_file():
        return False, "file not found"
    if path.suffix.lower() not in ALLOWED_EXTENSIONS:
        return False, f"extension {path.suffix} is not allowed"
    size = path.stat().st_size
    if size > MAX_FILE_BYTES:
        return False, f"file exceeds {MAX_FILE_BYTES} bytes"
    if size == 0:
        return False, "file is empty"
    head = path.open("rb").read(8)
    if not any(head.startswith(m) for m in MAGIC):
        return False, "magic bytes do not match an accepted document/image type"
    return True, None


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _module_present(name: str) -> bool:
    """Cheap availability probe that does NOT import the package.

    `import paddleocr` / `import cv2` / `import fitz` load native libraries and
    cost ~25 s on a cold interpreter. `available_backends()` is called by
    `/health` on the very first request, so importing there made the service
    look dead (and made `/api/v1/ai/stack`'s 4 s probe report disconnected).
    `find_spec` only resolves the module on disk; the real import still happens
    inside `run()`, whose try/except already reports failures honestly.
    """
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError, AttributeError, ModuleNotFoundError):
        return False


class PaddleOcrBackend:
    """Real OCR, only active when paddleocr + paddlepaddle are installed."""
    name = "paddleocr"

    def available(self) -> bool:
        return _module_present("paddleocr")

    def run(self, path: Path) -> OcrResult:
        # PDFs are handled by the real text layer (PyMuPDF) before OCR: running
        # OCR on a text PDF is slower and less accurate than reading its layer.
        if path.suffix.lower() == ".pdf":
            return OcrResult(engine=self.name, method="not-applicable")
        try:
            from paddleocr import PaddleOCR  # type: ignore
            lines: list[str] = []
            scores: list[float] = []
            try:
                # PaddleOCR 3.x
                try:
                    ocr = PaddleOCR(lang="en", use_doc_orientation_classify=False,
                                    use_doc_unwarping=False,
                                    use_textline_orientation=False,
                                    enable_mkldnn=False)
                except TypeError:
                    ocr = PaddleOCR(lang="en", use_doc_orientation_classify=False,
                                    use_doc_unwarping=False,
                                    use_textline_orientation=False)
                result = ocr.predict(str(path))
                for item in result or []:
                    data = item if isinstance(item, dict) else getattr(item, "json", None)
                    if callable(data):
                        data = data()
                    data = data or {}
                    texts = data.get("rec_texts") or []
                    confs = data.get("rec_scores") or []
                    for text, conf in zip(texts, confs):
                        lines.append(str(text))
                        try:
                            scores.append(float(conf))
                        except (TypeError, ValueError):
                            pass
                method = "paddleocr-v3-predict"
            except TypeError:
                # PaddleOCR 2.x
                ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
                result = ocr.ocr(str(path), cls=True)
                for page in result or []:
                    for line in page or []:
                        if len(line) >= 2:
                            lines.append(str(line[1][0]))
                            scores.append(float(line[1][1]))
                method = "paddleocr-v2-ocr"
            return OcrResult(
                text="\n".join(lines),
                engine=self.name,
                method=method,
                pages=1,
                confidence=round(sum(scores) / len(scores), 3) if scores else None,
                is_ocr=True,
                warnings=[] if lines else ["PaddleOCR returned no text."],
                sha256=sha256_file(path),
            )
        except Exception as exc:
            return OcrResult(
                engine=self.name, method="paddleocr-error", is_ocr=True,
                warnings=[f"PaddleOCR failed: {type(exc).__name__}: {exc}"],
                sha256=sha256_file(path),
            )


class RapidOcrBackend:
    """Real OCR for images via RapidOCR (ONNX Runtime, no torch/paddle needed)."""
    name = "rapidocr"

    def available(self) -> bool:
        return _module_present("rapidocr_onnxruntime")

    def run(self, path: Path) -> OcrResult:
        if path.suffix.lower() == ".pdf":
            return OcrResult(engine=self.name, method="not-applicable")
        try:
            from rapidocr_onnxruntime import RapidOCR  # type: ignore
            engine = RapidOCR()
            output = engine(str(path))
            result = output[0] if isinstance(output, tuple) else output
            lines: list[str] = []
            scores: list[float] = []
            for item in result or []:
                if isinstance(item, (list, tuple)) and len(item) >= 3:
                    lines.append(str(item[1]))
                    try:
                        scores.append(float(item[2]))
                    except (TypeError, ValueError):
                        pass
                elif isinstance(item, dict):
                    lines.append(str(item.get("text", "")))
                    try:
                        scores.append(float(item.get("score", 0)))
                    except (TypeError, ValueError):
                        pass
            text = "\n".join(line for line in lines if line.strip())
            return OcrResult(
                text=text, engine=self.name, method="rapidocr-onnx-crnn", pages=1,
                confidence=round(sum(scores) / len(scores), 3) if scores else None,
                warnings=[] if text else ["RapidOCR returned no text for this image."],
                sha256=sha256_file(path), is_ocr=True,
            )
        except Exception as exc:
            return OcrResult(
                engine=self.name, method="rapidocr-error", is_ocr=True,
                warnings=[f"RapidOCR failed: {type(exc).__name__}: {exc}"],
                sha256=sha256_file(path),
            )


class PdfTextBackend:
    """Extracts the REAL text layer of a PDF with PyMuPDF. Not OCR."""
    name = "pymupdf-text-layer"

    def available(self) -> bool:
        return _module_present("fitz")

    def run(self, path: Path) -> OcrResult:
        if path.suffix.lower() != ".pdf":
            return OcrResult(engine=self.name, method="not-applicable")
        try:
            import fitz  # type: ignore
            doc = fitz.open(str(path))
            text = "\n".join(page.get_text() for page in doc)
            meta = doc.metadata or {}
            pages = doc.page_count
            doc.close()
            return OcrResult(
                text=text.strip(),
                engine=self.name,
                method="pdf-text-layer",
                pages=pages,
                confidence=0.95 if text.strip() else None,
                warnings=(
                    ["PDF has no embedded text layer; an OCR backend is required for this file."]
                    if not text.strip() else []
                ),
                preprocessing={"pdf_metadata_suspicious": _suspicious_metadata(meta)},
                sha256=sha256_file(path),
                is_ocr=False,
            )
        except Exception as exc:
            return OcrResult(
                engine=self.name, method="pdf-text-layer-error",
                warnings=[f"PyMuPDF failed: {type(exc).__name__}: {exc}"],
                sha256=sha256_file(path),
            )


class OpenCVPreprocessBackend:
    """Real image preprocessing + layout signals via OpenCV. Not OCR."""
    name = "opencv-preprocess"

    def available(self) -> bool:
        return _module_present("cv2")

    def run(self, path: Path) -> OcrResult:
        if path.suffix.lower() == ".pdf":
            return OcrResult(engine=self.name, method="not-applicable")
        try:
            import cv2  # type: ignore
            import numpy as np  # type: ignore
            img = cv2.imread(str(path), cv2.IMREAD_COLOR)
            if img is None:
                return OcrResult(engine=self.name, method="decode-failed",
                                 warnings=["OpenCV could not decode the image."],
                                 sha256=sha256_file(path))
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            denoised = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)
            binary = cv2.adaptiveThreshold(denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                           cv2.THRESH_BINARY, 31, 10)
            edges = cv2.Canny(denoised, 60, 160)
            contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
            # Skew estimate from min-area rectangles of large contours.
            angles = []
            for c in contours:
                if cv2.contourArea(c) < 500:
                    continue
                rect = cv2.minAreaRect(c)
                if rect[1][0] > rect[1][1]:
                    angles.append(rect[2])
                elif rect[2] > 45:
                    angles.append(rect[2] - 90)
            skew = round(float(np.median(angles)), 2) if angles else 0.0
            return OcrResult(
                text="",
                engine=self.name,
                method="deskew-denoise-adaptive-threshold-contours",
                pages=1,
                warnings=["Image preprocessing is not OCR: no text was extracted from this file."],
                preprocessing={
                    "skew_degrees": skew,
                    "width": int(img.shape[1]),
                    "height": int(img.shape[0]),
                    "edge_density": round(float(edges.mean() / 255), 4),
                    "large_contours": sum(1 for c in contours if cv2.contourArea(c) >= 500),
                },
                sha256=sha256_file(path),
                is_ocr=False,
            )
        except Exception as exc:
            return OcrResult(
                engine=self.name, method="opencv-error",
                warnings=[f"OpenCV failed: {type(exc).__name__}: {exc}"],
                sha256=sha256_file(path),
            )


def _suspicious_metadata(meta: dict) -> list[str]:
    flags = []
    for key in ("producer", "creator", "modDate", "creationDate"):
        val = str(meta.get(key, ""))
        if val and any(term in val.lower() for term in ("photoshop", "editor", "illustrator")):
            flags.append(f"{key}={val}")
    return flags


BACKENDS: tuple[OcrBackend, ...] = (
    RapidOcrBackend(),
    PaddleOcrBackend(),
    PdfTextBackend(),
    OpenCVPreprocessBackend(),
)

# ---------------------------------------------------------------------------
# Provider selection
#
# TD_OCR_PROVIDER selects the preferred engine. It never fabricates a result:
# the response still names the engine that actually produced the text, and a
# fallback adds an explicit warning so a caller can see that its preference was
# not honoured.
#
# RapidOCR is the default ("auto") because on this hardware it returns in
# seconds with accurate results, whereas PaddleOCR can take minutes (see the
# OCR comparison report). PaddleOCR remains installed, available and selectable
# via TD_OCR_PROVIDER=paddleocr; it is never silently substituted for rapidocr.
#   auto (default) | paddleocr | rapidocr | text-layer | none
# ---------------------------------------------------------------------------
_PROVIDER_ALIASES = {
    "auto": "auto",
    "paddle": "paddleocr",
    "paddleocr": "paddleocr",
    "rapid": "rapidocr",
    "rapidocr": "rapidocr",
    "text": "pymupdf-text-layer",
    "text-layer": "pymupdf-text-layer",
    "pymupdf": "pymupdf-text-layer",
    "none": "none",
}


def provider_preference() -> str:
    raw = (os.getenv("TD_OCR_PROVIDER") or "auto").strip().lower()
    # Accept an engine name directly, or one of its aliases.
    if raw in {backend.name for backend in BACKENDS}:
        return raw
    return _PROVIDER_ALIASES.get(raw, "auto")


def _ordered_backends() -> tuple[OcrBackend, ...]:
    pref = provider_preference()
    by_name = {backend.name: backend for backend in BACKENDS}
    if pref == "none":
        return (by_name["opencv-preprocess"],)
    if pref in by_name:
        rest = tuple(b for b in BACKENDS if b.name != pref)
        return (by_name[pref], *rest)
    return BACKENDS


def available_backends() -> list[dict]:
    preferred = provider_preference()
    return [
        {
            "engine": b.name,
            "available": b.available(),
            "preferred": preferred == b.name,
        }
        for b in BACKENDS
    ]


def run_ocr(path: Path) -> OcrResult:
    """Pick the strongest available backend. Never claim a fallback is OCR."""
    ok, reason = validate_file(path)
    if not ok:
        return OcrResult(method="validation-failed", warnings=[reason or "invalid file"])
    emit("ocr.start", file=path.name, bytes=path.stat().st_size)
    preferred = provider_preference()
    results: list[OcrResult] = []
    for backend in _ordered_backends():
        if not backend.available():
            continue
        r = backend.run(path)
        results.append(r)
        if r.is_ocr and r.text.strip():
            if preferred not in ("auto", "none") and r.engine != preferred:
                installed = next((b.available() for b in BACKENDS if b.name == preferred), False)
                r.warnings.append(
                    f"Requested OCR provider {preferred} "
                    f"{'produced no text' if installed else 'is not installed'}; "
                    f"the {r.engine} result was used instead."
                )
            emit("ocr.complete", engine=r.engine, method=r.method, chars=len(r.text))
            return r
    # No OCR engine produced text. Return the most informative non-OCR result
    # and explicitly state that extraction is unavailable.
    best = next((r for r in results if r.text.strip()), None) or (
        results[0] if results else OcrResult()
    )
    if preferred not in ("auto", "none"):
        installed = next((b.available() for b in BACKENDS if b.name == preferred), False)
        best.warnings.append(
            f"Requested OCR provider {preferred} "
            f"{'produced no usable text' if installed else 'is not installed'}."
        )
    best.warnings.append(
        "No OCR engine produced text. Field extraction is unavailable for this "
        "document; it has been queued for manual review. This is not a verification."
    )
    emit("ocr.no_engine", engine=best.engine, method=best.method)
    return best
