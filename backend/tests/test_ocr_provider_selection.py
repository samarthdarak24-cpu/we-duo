"""OCR provider selection: preference, fallback disclosure and disable switch."""
from __future__ import annotations

from pathlib import Path

import pytest

from app import ocr


def test_provider_preference_aliases(monkeypatch):
    for raw, expected in {
        "paddle": "paddleocr",
        "PaddleOCR": "paddleocr",
        "rapid": "rapidocr",
        "text-layer": "pymupdf-text-layer",
        "none": "none",
        "unknown-value": "auto",
    }.items():
        monkeypatch.setenv("TD_OCR_PROVIDER", raw)
        assert ocr.provider_preference() == expected


def test_available_backends_marks_the_preferred_engine(monkeypatch):
    monkeypatch.setenv("TD_OCR_PROVIDER", "rapidocr")
    backends = ocr.available_backends()
    assert len(backends) == 4
    assert [b["engine"] for b in backends if b["preferred"]] == ["rapidocr"]


def test_ordered_backends_puts_the_preference_first(monkeypatch):
    monkeypatch.setenv("TD_OCR_PROVIDER", "pymupdf-text-layer")
    ordered = ocr._ordered_backends()
    assert ordered[0].name == "pymupdf-text-layer"
    assert {b.name for b in ordered} == {
        "paddleocr", "rapidocr", "pymupdf-text-layer", "opencv-preprocess"
    }


def test_none_disables_ocr_and_says_so(monkeypatch, tmp_path: Path):
    pytest.importorskip("PIL")
    from PIL import Image

    monkeypatch.setenv("TD_OCR_PROVIDER", "none")
    path = tmp_path / "blank.png"
    Image.new("RGB", (40, 40), (255, 255, 255)).save(path)
    result = ocr.run_ocr(path)
    assert result.is_ocr is False
    assert result.engine == "opencv-preprocess"
    assert any("No OCR engine produced text" in w for w in result.warnings)


def test_fallback_names_the_engine_that_actually_ran(monkeypatch, tmp_path: Path):
    pytest.importorskip("rapidocr_onnxruntime")
    cv2 = pytest.importorskip("cv2")
    np = pytest.importorskip("numpy")

    # Exercise the honest fallback deterministically. Machines with PaddleOCR
    # installed must still prove that a missing preferred engine is disclosed
    # and that RapidOCR is named as the engine that actually ran, so simulate
    # the "not installed" state instead of skipping the whole assertion.
    monkeypatch.setattr(ocr.PaddleOcrBackend, "available", lambda self: False)
    monkeypatch.setenv("TD_OCR_PROVIDER", "paddleocr")
    img = np.full((200, 700, 3), 255, np.uint8)
    cv2.putText(img, "MH01AB1234", (20, 120), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (0, 0, 0), 5)
    path = tmp_path / "plate.png"
    cv2.imwrite(str(path), img)

    result = ocr.run_ocr(path)
    assert result.engine == "rapidocr"
    assert result.is_ocr is True
    assert any("Requested OCR provider paddleocr is not installed" in w for w in result.warnings)
