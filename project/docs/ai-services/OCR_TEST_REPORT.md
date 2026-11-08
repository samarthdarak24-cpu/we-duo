# TrustDrive — OCR Test Report

**Date:** 2026-11-05 · **Result: PASS (engines installed & active; pipeline tested)**

## Live engine inventory (`/health` → `ocr_backends`)
- `paddleocr` — `available:true`
- `rapidocr` — `available:true`
- `pymupdf-text-layer` — `available:true` (PDF text extraction)
- `opencv-preprocess` — `available:true`

This corrects any earlier assumption that OCR was a stub: the OCR backends are **actually installed**
in this environment and report available.

## Pipeline (code-verified)
- Upload → validate (magic-byte sniff) → secure store → `documents` row → SHA-256 computed → OCR job
  queued → fields extracted → confidence stored → verification receives results.
- `/health` reports the worker as `db-backed` with job type `document.ocr`/`document_processing`.
- SHA-256 proves a stored file is **unchanged**, *not* that the original document was genuine
  (explicitly documented; never over-claimed).
- A PDF text layer is **never** reported as OCR output; the OCR engine and the text-layer extractor are
  separate, and the UI labels the active engine.

## Test coverage
- Pytest covers the 18-step document pipeline (`test_pipeline.py`, `test_models.py::
  test_paddleocr_backend_reads_rendered_text`).
- Low-confidence / duplicate-file / invalid-file / retry paths are exercised in the suite.

## Not executed this pass
- A live multipart file upload through the running server + worker round-trip was not scripted (would
  need a sample file + worker poll). Covered by Pytest against the same code path.
