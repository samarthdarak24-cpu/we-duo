# YOLO Damage Detection & PaddleOCR Report

**Status:** PASS (both) · **Basis:** live end-to-end execution through the Next.js proxy against the running Python service.

## A. YOLO damage detection (Phase 4)

**Architecture**
- Additive FastAPI service (`backend/app/routers/v1.py::v1_detect_damage` → `vehicles.detect_damage_on_photo`).
- Uses real Ultralytics YOLO weights `ai-services/shared/models/car_damage.pt` (adapter `yolo-damage-adapter-1.0.0`).
- `POST /vehicles/{id}/photos/{photo_id}/detect` runs the model, returns detections + creates candidate `damage_records` with `detection_confidence`, `detection_box`, `provenance`.
- `PATCH /vehicles/{id}/damage/{damage_id}/review` lets a human inspector verify/reject a candidate (with `component_id`, `severity`, `repair_status`).

**Proxy wiring (verified)**
- Route `frontend/app/api/v1/vehicles/[id]/photos/[photoId]/detect/route.ts` (note: relocated from a broken `[vehicleId]` slug to `[id]` to fix a Next.js build conflict).
- Pattern: `requireRole(req,"seller","admin")` → `userBearer(req)` (reads `td_token` cookie) → `callBackendAsUser(...)` forwards it as `Authorization: Bearer` to Python.
- Same pattern for `PATCH …/damage/[damageId]/review`.

**Live evidence**
```
POST /api/v1/vehicles/v-bmw/photos/{pid}/detect  -> 200
{
  "available": true,
  "detections": [{"label":"scratch","class_id":1,"confidence":0.5778,
                  "box":[944.2,596.3,1319.2,704.4]}],
  "candidateDamageIds": ["dama-74fe18678c73"],
  "modelVersion": "yolo-damage-adapter-1.0.0",
  "limitations": ["A single photograph cannot establish accident severity …",
                  "Detections require human inspector validation …",
                  "No licensed damage assessor sign-off …"]
}
```
Non-car categories correctly return 409 `{available:false, reason}`.

**Honest limitations**
- The model reports bounding boxes + a coarse label (scratch/dent/etc.); it is **not** a licensed assessor. Every candidate **must** be human-verified before appearing to a buyer (enforced by the review gate).
- Training data provenance of `car_damage.pt` is not documented in-repo; treat accuracy as demo-grade until validated on a labelled, licensed dataset.

## B. PaddleOCR document extraction (Phase 6)

**Architecture**
- `backend/app/integrations/ocr.py` wraps PaddleOCR (installed) with `ocr_image()` + `extract_fields()` (registration no., VIN/chassis, owner, insurer, policy no., dates, mileage).
- `POST /vehicles/{id}/documents/{doc_id}/ocr` runs OCR, persists `ocr_text`, `ocr_extracted`, `ocr_confidence`, `ocr_status`.
- `PATCH …/ocr` stores manually-corrected fields and marks the document `reviewed`.

**Proxy wiring (verified)** — identical cookie-forwarding pattern at
`frontend/app/api/v1/vehicles/[id]/documents/[docId]/ocr/route.ts` (POST + PATCH).

**Live evidence**
```
POST /api/v1/vehicles/v-bmw/documents/{docId}/ocr  -> 200
{
  "text": "TRUSTDRIVE QA INSURANCE POLICY NO POLQA886421 INSURER ICICI LOMBARD VALID TILL 2028 REG N …",
  "fields": {"policyNo":"POLQA886421", "registrationNo":null, …},
  "confidence": 0.9963
}
PATCH …/ocr  -> 200  (corrected fields stored, status=reviewed)
```

**Honest limitations**
- Field extraction is regex/keyword based on top of OCR text; structured fields can be `null` on poor scans (seen: `registrationNo:null`). The UI surfaces raw text + a correction form, so this is a human-in-the-loop flow, not auto-trust.
- OCR confidence is line-average; it does not validate that extracted values are *correct*, only that they were read clearly.

## C. Verdict

Both capabilities are **genuinely functional and verified end-to-end**, not mocks. They are correctly gated behind human review and carry explicit limitations in their API responses. The remaining work is model-quality validation on licensed data, not integration.
