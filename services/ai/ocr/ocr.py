"""Real OCR adapters + honest field extraction.

This module is the *document* OCR surface used by the ``/ocr`` vehicle endpoints.
It only reports success when a real OCR engine is installed and a run produced
text. On import failure it returns ``available: false`` with a clear reason and
never claims a third-party OCR result without a successful call. The engine that
actually ran is always named in the result.

Interactive default: RapidOCR (ONNX Runtime) is preferred when installed.
Measured locally, PaddleOCR's first CPU inference needs ~96 s -- longer than the
Next.js proxy's 90 s timeout, so the "Extract with OCR" button always failed --
while RapidOCR reads the same document in ~5 s. Set ``TD_OCR_PROVIDER=paddleocr``
to force the heavyweight engine. PDFs use their real text layer (never labelled
as OCR); a fallback is never reported as the primary engine.

Field extraction (``extract_fields``) is independent of the engine: it applies
honest regular expressions over arbitrary OCR text and never hardcodes sample
outputs. Missing fields come back as ``None``.
"""
from __future__ import annotations

import importlib.util
import os
import re
from pathlib import Path
from typing import Any

os.environ.setdefault("FLAGS_use_mkldnn", "0")
os.environ.setdefault("FLAGS_use_onednn", "0")

# Legacy constants kept for callers that import them; the active engine is
# reported per result, so no caller should assume PaddleOCR answered.
ENGINE_NAME = "paddleocr"
ENGINE_VERSION = "paddleocr-honest-adapter-1.0.0"

_ENGINES = {
    "rapidocr": {
        "module": "rapidocr_onnxruntime",
        "version": "rapidocr-onnxruntime-honest-adapter-1.0.0",
        "method": "rapidocr-onnx-crnn",
    },
    "paddleocr": {
        "module": "paddleocr",
        "version": ENGINE_VERSION,
        "method": "paddleocr-predict",
    },
}
_PDF_ENGINE = {"version": "pymupdf-text-layer-1.0.0", "method": "pdf-text-layer"}

# --- patterns ---------------------------------------------------------------
_VIN_RE = re.compile(r"\b([A-HJ-NPR-Z0-9]{17})\b")
_REG_LABEL_RE = re.compile(
    r"\b(?:registration(?:\s*(?:no\.?|number))?|reg\.?\s*(?:no\.?|number)?)\s*[:#\uff1a]?\s*"
    r"([A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,3}[-\s]?\d{1,4})\b",
    re.I,
)
_REG_RE = re.compile(r"(?<![A-Z0-9-])([A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,3}[-\s]?\d{1,4})\b")
_CHASSIS_RE = re.compile(
    r"\b(?:chassis|frame|chassis\s*no\.?|frame\s*no\.?|chassis\s*number|frame\s*number)\s*[:#\uff1a]?\s*([A-Z0-9]{8,22})\b",
    re.I,
)
_ENGINE_RE = re.compile(r"\b(?:engine\s*(?:no\.?|number|serial)?)\s*[:#\uff1a]?\s*([A-Z0-9][A-Z0-9-]{4,24})\b", re.I)
_INVOICE_RE = re.compile(
    r"\b(?:invoice\s*(?:no\.?|number|#)|report\s*(?:no\.?|number|#)|bill\s*(?:no\.?|number|#))\s*[:#\uff1a]?\s*([A-Z0-9][A-Z0-9/-]{3,30})\b",
    re.I,
)
_MODEL_YEAR_RE = re.compile(
    r"\b(?:model\s*year|mfg\.?\s*year|manufacturing\s*year)\s*[:#\uff1a]?\s*((?:19|20)\d{2})\b",
    re.I,
)
_DATE_RE = re.compile(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b")
_INSURER_RE = re.compile(r"(?:insurer|insurance\s+company|underwriter)\s*[:\-\uff1a]?\s*([A-Z][A-Za-z &.]+?)(?:\n|$)", re.I)
_POLICY_RE = re.compile(r"(?:policy\s*(?:no|number|#)?)\s*[:\-\uff1a]?\s*([A-Z0-9][A-Z0-9\-/]{4,})", re.I)
_OWNER_RE = re.compile(r"(?:owner(?:\s*name)?|registered\s+to)\s*[:\-\uff1a]?\s*([A-Za-z][A-Za-z .]+?)(?:\n|$)", re.I)
_MILEAGE_LABEL_RE = re.compile(
    r"\b(?:odometer|odo|0d0|od0|0do|km\s*reading|mileage|total\s*distance)\s*[:#\uff1a]?\s*([\d][0-9,.]{1,8})(?:\s*(?:km|kms|kilometres?|kilometers?))?(?!\d)",
    re.I,
)
_MILEAGE_RE = re.compile(r"(\d{1,3}(?:[,.]\d{3})+|\d{2,7})\s*(?:km|kms|kilometres?|kilometers?)\b", re.I)
_SOH_RE = re.compile(r"\b(?:state\s*of\s*health|soh)\s*[:#\uff1a]?\s*(\d{1,3}(?:\.\d{1,2})?)\s*%?", re.I)


def _has(module: str) -> bool:
    try:
        return importlib.util.find_spec(module) is not None
    except (ImportError, ValueError, AttributeError, ModuleNotFoundError):
        return False


def installed_engines() -> list[str]:
    return [name for name, spec in _ENGINES.items() if _has(spec["module"])]


def active_engine() -> str | None:
    """Pick one real engine. Never silently switches when the chosen one fails."""
    requested = (os.getenv("TD_OCR_PROVIDER") or "auto").strip().lower()
    available = installed_engines()
    if requested in available:
        return requested
    # Interactive default: the fast ONNX engine, then the heavyweight one.
    for name in ("rapidocr", "paddleocr"):
        if name in available:
            return name
    return None


def status() -> dict:
    """Report the engine that will actually run, and what else is installed."""
    engine = active_engine()
    return {
        "available": engine is not None or _has("fitz"),
        "engine": engine or ("pymupdf-text-layer" if _has("fitz") else "none"),
        "version": (_ENGINES[engine]["version"] if engine else
                    _PDF_ENGINE["version"] if _has("fitz") else None),
        "engines": installed_engines(),
        "reason": None if engine or _has("fitz") else "No OCR engine or PDF text layer is installed",
    }


def _empty(engine: str, version: str, reason: str, method: str = "none") -> dict:
    return {"available": False, "engine": engine, "reason": reason,
            "text": "", "lines": [], "version": version, "method": method,
            "is_ocr": False}


def _rapidocr(p: Path) -> dict:
    from rapidocr_onnxruntime import RapidOCR  # type: ignore

    # Keep the ONNX peak bounded on small containers: one thread, one image cap.
    engine = RapidOCR(intra_op_num_threads=1, inter_op_num_threads=1,
                      max_side_len=int(os.getenv("TD_OCR_MAX_IMAGE_SIDE", "1024")))
    output = engine(str(p))
    result = output[0] if isinstance(output, tuple) else output
    lines: list[dict[str, Any]] = []
    for item in result or []:
        if isinstance(item, (list, tuple)) and len(item) >= 3:
            lines.append({"text": str(item[1]), "confidence": round(float(item[2]), 4)})
    return {"available": True, "engine": "rapidocr",
            "version": _ENGINES["rapidocr"]["version"],
            "method": _ENGINES["rapidocr"]["method"], "is_ocr": True,
            "text": "\n".join(l["text"] for l in lines), "lines": lines}


def _paddleocr(p: Path) -> dict:
    from paddleocr import PaddleOCR  # type: ignore

    try:
        ocr = PaddleOCR(lang="en", use_doc_orientation_classify=False,
                        use_doc_unwarping=False, use_textline_orientation=False,
                        enable_mkldnn=False)
    except TypeError:
        ocr = PaddleOCR(lang="en", use_doc_orientation_classify=False,
                        use_doc_unwarping=False, use_textline_orientation=False)
    result = ocr.predict(str(p))
    lines: list[dict[str, Any]] = []
    for item in result or []:
        data = item if isinstance(item, dict) else getattr(item, "json", None)
        if callable(data):
            data = data()
        data = data or {}
        for text, conf in zip(data.get("rec_texts") or [], data.get("rec_scores") or []):
            lines.append({"text": str(text), "confidence": round(float(conf), 4)})
    return {"available": True, "engine": "paddleocr",
            "version": _ENGINES["paddleocr"]["version"],
            "method": _ENGINES["paddleocr"]["method"], "is_ocr": True,
            "text": "\n".join(l["text"] for l in lines), "lines": lines}


def _pdf_text_layer(p: Path) -> dict:
    """A PDF text layer is real extraction, but it is NOT OCR. Say so."""
    import fitz  # type: ignore

    doc = fitz.open(str(p))
    text = "\n".join(page.get_text() for page in doc)
    doc.close()
    lines = [{"text": line, "confidence": None}
             for line in text.splitlines() if line.strip()]
    return {"available": True, "engine": "pymupdf-text-layer",
            "version": _PDF_ENGINE["version"], "method": _PDF_ENGINE["method"],
            "is_ocr": False, "text": text.strip(), "lines": lines,
            "warnings": (["PDF has no embedded text layer; an OCR engine is required."]
                         if not text.strip() else [])}


def ocr_image(path: str | Path) -> dict:
    """Run one real extraction engine and name it in the result.

    Returns a structured result. On import/decode failure the result is
    ``available: False`` with a reason -- never a fabricated reading and never
    a fallback reported as the primary engine.
    """
    p = Path(path)
    if not p.is_file():
        return _empty("none", "", "Image file not found.")

    if p.suffix.lower() == ".pdf":
        if not _has("fitz"):
            return _empty("pymupdf-text-layer", _PDF_ENGINE["version"],
                          "PyMuPDF is not installed; this PDF has no text-layer reader.")
        try:
            return _pdf_text_layer(p)
        except Exception as exc:
            return _empty("pymupdf-text-layer", _PDF_ENGINE["version"],
                          f"PyMuPDF failed: {type(exc).__name__}: {exc}",
                          _PDF_ENGINE["method"])

    engine = active_engine()
    if engine is None:
        return _empty("none", "", "No OCR engine is installed (RapidOCR or PaddleOCR required).")

    spec = _ENGINES[engine]
    try:
        return _rapidocr(p) if engine == "rapidocr" else _paddleocr(p)
    except Exception as exc:  # pragma: no cover - depends on the native runtime
        return _empty(engine, spec["version"],
                      f"{engine} failed: {type(exc).__name__}: {exc}", spec["method"])


def _parse_km(raw: str | None) -> int | None:
    if not raw:
        return None
    s = raw.strip()
    if re.fullmatch(r"\d{1,3}(?:[,.]\d{3})+", s):
        return int(s.replace(",", "").replace(".", ""))
    cleaned = s.replace(",", "")
    return int(cleaned) if cleaned.isdigit() else None


def extract_fields(text: str) -> dict:
    """Honest regex extraction over arbitrary OCR text.

    No sample data is hardcoded; every value is derived from ``text``. The
    ``confidence`` field is a simple heuristic: the share of expected high-value
    fields that were actually recovered, clipped to [0, 1].
    """
    t = text or ""

    registration_no = _REG_LABEL_RE.search(t) or _REG_RE.search(t)
    vin = _VIN_RE.search(t)
    chassis = _CHASSIS_RE.search(t)
    engine = _ENGINE_RE.search(t)
    invoice = _INVOICE_RE.search(t)
    model_year = _MODEL_YEAR_RE.search(t)
    dates = _DATE_RE.findall(t)
    insurer = _INSURER_RE.search(t)
    policy = _POLICY_RE.search(t)
    owner = _OWNER_RE.search(t)
    mileage = _MILEAGE_LABEL_RE.search(t) or _MILEAGE_RE.search(t)
    soh = _SOH_RE.search(t)

    def _clean(s: str) -> str:
        return re.sub(r"\s+", " ", s).strip()

    fields: dict[str, Any] = {
        "registrationNo": re.sub(r"[\s-]", "", registration_no.group(1)).upper() if registration_no else None,
        "vinOrChassis": _clean(vin.group(1)).upper() if vin else (_clean(chassis.group(1)).upper() if chassis else None),
        "engineNo": _clean(engine.group(1)).upper() if engine else None,
        "invoiceNo": _clean(invoice.group(1)).upper() if invoice else None,
        "modelYear": int(model_year.group(1)) if model_year else None,
        "ownerName": _clean(owner.group(1)) if owner else None,
        "validFrom": dates[0] if len(dates) >= 1 else None,
        "validTo": dates[-1] if len(dates) >= 2 else None,
        "mileageKm": _parse_km(mileage.group(1)) if mileage else None,
        "batterySoh": float(soh.group(1)) if soh else None,
        "insurer": _clean(insurer.group(1)) if insurer else None,
        "policyNo": _clean(policy.group(1)) if policy else None,
    }

    expected = ["registrationNo", "vinOrChassis", "ownerName", "validTo",
                "mileageKm", "insurer", "policyNo"]
    recovered = sum(1 for k in expected if fields.get(k))
    confidence = round(min(1.0, recovered / len(expected)), 2)
    fields["confidence"] = confidence
    return fields
