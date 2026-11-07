# TrustDrive — OCR Integration Report

**Date:** 2026-11-07 · **Result: PASS for RapidOCR/PyMuPDF/OpenCV; PaddleOCR BLOCKED.**
**Active engine:** RapidOCR (`rapidocr-onnx-crnn`) · **Python endpoint:** `POST /api/intelligence/documents/process` · **Bridge:** `frontend/lib/server/document-ocr.ts`

## 1. Actual integration chain

```text
DocumentsManager file input
  → multipart POST /api/v1/vehicles/:id/documents
  → Next validates extension/MIME/size, stores private file, computes SHA-256
  → document-ocr.ts calls FastAPI with X-Service-Token
  → Python: PyMuPDF text layer for PDFs / OpenCV preprocess + RapidOCR for images
  → category-aware field extraction, comparison, duplicate/date/confidence checks
  → Next persists documents.extracted, documents.status, verified_at, document_extractions
  → UI reads the persisted result (engine, method, confidence, fields, flags)
```

The frontend does not hardcode OCR values. The focused live run read the same field values from the API response, the UI after refresh, and SQLite.

## 2. Positive proof

| Check | Observed |
|---|---|
| Upload response | HTTP 201, `doc-1793989171647` |
| OCR status | `processed` |
| Engine / method | `rapidocr` / `rapidocr-onnx-crnn` |
| `isOcr` | `true` |
| Confidence | `0.778` |
| Flags | `[]` |
| Extracted fields | 8 rows (`registration_number`, `vin`, owner, model, dates, odometer, …) |
| Registration match | `MH12QA7132` = vehicle |
| VIN match | `MAT3989149185KLJS` = vehicle |
| Document status | `verified`, `verified_at` set |
| UI after refresh | engine `rapidocr`, registration `MH12QA7132` |

Six-category proof: 4 × `rc_2w` + 2 × `rc`, all `verified`, 8–9 extraction rows each, confidence 0.776–0.787.

## 3. Negative proof (10/10)

| Input | Result |
|---|---|
| Unsupported `.txt` | HTTP 415, no document row |
| Corrupt PDF | `needs_correction` with reason, no fake extraction |
| Blank image | low-confidence `needs_correction` |
| Clean RC | `verified` via real OCR |
| Duplicate RC | `needs_correction` + `duplicate_of` |

## 4. Honesty controls

- `verified` means **automated extraction checks passed**, not that the document is authentic.
- Every extraction carries the warning: machine-read text is not proof of authenticity.
- If Python/OCR is unavailable, the document stays `pending` with a real `status_reason`; it is never auto-verified.
- PaddleOCR is not installed; `/health` reports `paddleocr=false`, and the UI/report names RapidOCR as active.
- A matching SHA-256 proves file integrity, not document authenticity.

## 5. Field mapping by category

| Category | Identity field compared | RC document type |
|---|---|---|
| `petrol_motorcycle` | chassis / frame number | `rc_2w` |
| `petrol_scooter` | chassis / frame number | `rc_2w` |
| `electric_scooter` | chassis / frame number | `rc_2w` |
| `electric_motorcycle` | chassis / frame number | `rc_2w` |
| `passenger_car` | 17-char VIN | `rc` |
| `electric_car` | 17-char VIN | `rc` |

EVs additionally support battery capacity, battery serial and motor number fields; no petrol engine fields are required or persisted.

## 6. Verdict

**OCR integration: PASS.** Real extraction, real persistence, real failure states, category-aware comparison, duplicate detection and honest engine attribution.
