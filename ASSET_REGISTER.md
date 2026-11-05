# TrustDrive — Asset Register

> Source, licence and attribution for media and model assets. Where a licence is
> not embedded in the file, it is marked **UNCONFIRMED** and must be resolved by
> the project owner before public distribution.

## 1. 3D model

| Asset | Path | Size | Source | Licence | Status |
| --- | --- | --- | --- | --- | --- |
| Vehicle GLB | `public/models/car.glb` | 38,997,992 B | supplied by project owner (`20261030003857_416fb9b8puru_colored.glb`) | **UNCONFIRMED** — no metadata embedded | ⚠️ owner must record licence before release |
| Class map | `models/car_damage_classes.json` | — | to be supplied with damage weights | — | absent |

The GLB is a generic vehicle asset, not a scan of any specific car. The UI says
so. See `docs/3D_ASSET_MAPPING.md`.

## 2. Photography and video

| Asset group | Path | Count | Source | Licence |
| --- | --- | --- | --- | --- |
| Hero frames | `public/frames/*.jpg` | 291 | derived from `ezgif-*.zip` supplied by owner | **UNCONFIRMED** |
| Vehicle/marketing photos | `public/*.jpg` | 303 | owner-supplied; `next.config.mjs` allows `images.unsplash.com` | treat as Unsplash-style stock — verify per image |
| Site images | `public/*.png` | 2 | owner-supplied | **UNCONFIRMED** |
| Reference screenshots | `docs/*.png`, `docs/reference/*.png` | 4 | owner-supplied dashboards | internal reference only |

**Action required:** produce a per-image licence list before publishing. The
`next.config.mjs` remote pattern `hostname: '**'` is permissive and should be
narrowed to the actual image hosts in production.

## 3. Fonts

| Asset | Path | Source | Licence |
| --- | --- | --- | --- |
| Web fonts | `app/*.woff` (2 files) | bundled | **UNCONFIRMED** — record the font licence (e.g. OFL) |

## 4. AI model assets

| Asset | Path | Source | Licence | Status |
| --- | --- | --- | --- | --- |
| Damage weights | `models/car_damage.pt` | `github.com/ReverendBayes/YOLO11m-Car-Damage-Detector` (MIT) | **MIT** | ✅ 40.5 MB, YOLO11m, CarDD classes: dent, scratch, crack, shattered_glass, broken_lamp, flat_tire |
| Mileage XGBoost | `models/mileage_xgb.json` | trained locally on synthetic rows | project-owned | ✅ demo model (not used by findings) |
| Local LLM | HF cache (`HuggingFaceTB/SmolLM2-360M-Instruct`) | Hugging Face | Apache-2.0 | ✅ local demo; `TD_LLM_MODEL` configurable |
| Model register | `models/MODEL_REGISTER.json` | generated | — | written on fetch |

No unlicensed weights are bundled. See `docs/MODEL_ASSETS.md` for the Hugging
Face research and the governance rules.

## 5. Software licences

Third-party packages are declared in `package.json` and
`services/intelligence/requirements.txt`. Notable runtime licences: Next.js and
React (MIT), Tailwind (MIT), three.js (MIT), FastAPI (MIT), SQLAlchemy (MIT),
PyMuPDF (AGPL/commercial — **verify before commercial distribution**),
OpenCV (Apache-2.0), scikit-learn (BSD-3), onnxruntime (MIT).

PyMuPDF's AGPL/commercial dual licence is the main distribution consideration.
If the product is closed-source, obtain a commercial PyMuPDF licence or replace
the PDF text/report path.

## 6. Attribution policy

- Never present a stock photo as the actual vehicle being sold.
- Never present the generic GLB as a photograph or scan of the specific car.
- Demo data is labelled as demo data in the UI and in `README.md`.
