# TrustDrive — Browser Screenshot Evidence

Captured with headless Chromium (Playwright) against the running Next.js app and the real shared SQLite database. These are not mockups or composited images.

## Main live-run evidence (29 canonical files)

| Area | Files |
|---|---|
| Seller dashboard | `seller-dashboard.png` |
| Six category wizard steps | `cat-petrol_motorcycle-step0.png`, `cat-petrol_scooter-step0.png`, `cat-electric_scooter-step0.png`, `cat-electric_motorcycle-step0.png`, `cat-passenger_car-step0.png`, `cat-electric_car-step0.png` |
| Six category investigations | `cat-<category>-investigation.png` (6 files) |
| Six category published listings | `cat-<category>-published.png` (6 files) |
| Buyer dashboards / details | `buyer-dashboard.png`, `buyer-<category>-detail.png` (6 files) |
| 3D / hotspot | `buyer-car-3d-hotspot.png`, `verify-passenger_car-glb.png`, `verify-electric_scooter-schematic.png` |
| Inquiries / security | `seller-inquiry-reply.png`, `security-category-taxonomy.png` |

## Focused six-feature proof (`MW5ATBQ1`)

| File | Feature |
|---|---|
| `feat1-rc-ocr.png` | Real RC upload + RapidOCR fields/engine/confidence |
| `feat2-mileage-rollback.png` | 52,000 → 41,000 km rollback finding |
| `feat3-ai-investigation.png` | LangGraph node timeline + findings |
| `feat4-damage-record.png` | Damage record saved |
| `feat5-marketplace-3d.png` | Published listing + 3D damage hotspot |
| `feat6-seller-inbox-reply.png` | Buyer inquiry + seller reply |
| `ocr-negative.png` | Invalid/corrupt/blank/duplicate OCR handling |

## Subdirectories

| Directory | Contents |
|---|---|
| `live/` | 8 public/seller/buyer screenshots from the live walkthrough |
| `independent/` | 10 screenshots from the independent pass: registration, seller dashboard after register, persistence after refresh, bug retests, responsive desktop/mobile checks |

## How to reproduce

```powershell
# with the app on :3000 and intelligence on :8000
node qa/live_e2e.mjs
node qa/live-browser/prove_six.mjs
node qa/live-browser/ocr_negative.mjs
node qa/live-browser/security.mjs
```

Evidence JSON: `qa/live-e2e-summary.json`, `qa/live-browser/six_features_results.json`, `qa/live-browser/ocr_negative_results.json`, `qa/live-browser/security_results.json`, `qa/indep-*.json`.
