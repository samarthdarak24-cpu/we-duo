"""Tesseract adapter: TSV parsing, provider selection and honest reporting."""
from __future__ import annotations

from pathlib import Path

import pytest

from app import ocr
from services.ai.ocr import tesseract_engine

TSV = "\n".join(
    [
        "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
        "1\t1\t0\t0\t0\t0\t0\t0\t900\t500\t-1\t",
        "5\t1\t1\t1\t1\t1\t20\t20\t180\t30\t96.5\tTRUSTDRIVE",
        "5\t1\t1\t1\t1\t2\t210\t20\t110\t30\t91.0\tOCR",
        "5\t1\t1\t1\t2\t1\t20\t70\t120\t30\t88.0\tInvoice",
        "5\t1\t1\t1\t2\t2\t150\t70\t90\t30\t-1\t",
    ]
)


def test_tsv_parser_keeps_lines_and_real_confidence():
    text, confidence, words = tesseract_engine._parse_tsv(TSV)
    assert text == "TRUSTDRIVE OCR\nInvoice"
    # Only words with a real confidence participate; blank/structural rows do not.
    assert confidence == round((96.5 + 91.0 + 88.0) / 3 / 100.0, 3)
    assert words == 3


def test_tesseract_is_preferred_and_named(monkeypatch, tmp_path: Path):
    pytest.importorskip("PIL")
    from PIL import Image

    path = tmp_path / "document.png"
    Image.new("RGB", (400, 200), (255, 255, 255)).save(path)

    monkeypatch.setenv("TD_OCR_PROVIDER", "tesseract")
    monkeypatch.setattr(ocr.RapidOcrBackend, "available", lambda self: False)
    monkeypatch.setattr(ocr.PaddleOcrBackend, "available", lambda self: False)
    monkeypatch.setattr(ocr.tesseract_engine, "available", lambda: True)
    monkeypatch.setattr(
        ocr.tesseract_engine,
        "run",
        lambda p: {
            "available": True,
            "engine": "tesseract",
            "text": "Invoice No: TD-1\nOdometer: 42000 km",
            "confidence": 0.93,
            "method": "tesseract-cli-lstm-v5.4.0",
            "is_ocr": True,
            "warnings": [],
            "words": 6,
        },
    )

    result = ocr.run_ocr(path)
    assert result.engine == "tesseract"
    assert result.method.startswith("tesseract-cli-lstm")
    assert result.is_ocr is True
    assert result.confidence == 0.93
    assert "Invoice No" in result.text


def test_tesseract_missing_is_reported_not_faked(monkeypatch, tmp_path: Path):
    pytest.importorskip("PIL")
    from PIL import Image

    path = tmp_path / "document.png"
    Image.new("RGB", (100, 100), (255, 255, 255)).save(path)

    monkeypatch.setenv("TD_OCR_PROVIDER", "tesseract")
    monkeypatch.setattr(ocr.RapidOcrBackend, "available", lambda self: False)
    monkeypatch.setattr(ocr.PaddleOcrBackend, "available", lambda self: False)
    monkeypatch.setattr(ocr.tesseract_engine, "available", lambda: False)
    monkeypatch.setattr(ocr.PdfTextBackend, "available", lambda self: False)
    monkeypatch.setattr(ocr.OpenCVPreprocessBackend, "available", lambda self: False)

    result = ocr.run_ocr(path)
    assert result.is_ocr is False
    assert any("No OCR engine produced text" in w for w in result.warnings)
