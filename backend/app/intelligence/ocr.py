"""Document OCR adapter, re-exported from services/ai/ocr.

`services/ai/ocr/ocr.py` is the document-OCR surface used by the /ocr vehicle
endpoints. It reports the engine that actually ran and never labels a PDF text
layer as OCR.
"""
from services.ai.ocr.ocr import (  # noqa: F401
    active_engine,
    extract_fields,
    installed_engines,
    ocr_image,
    status,
)

__all__ = ["active_engine", "extract_fields", "installed_engines", "ocr_image", "status"]
