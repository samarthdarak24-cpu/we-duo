# models/

Runtime model assets for the intelligence service. Weights are bundled only
where a licence permits it and an automated test needs them offline; large
first-use downloads (PaddleOCR) stay in the host cache and are not committed.

| File | Purpose | Status |
| --- | --- | --- |
| `car_damage.pt` | YOLO11m car-damage detection | ✅ present — 40.5 MB, MIT, 6 classes |
| `car_damage.onnx` | ONNX damage detection (optional alternative) | not present |
| `car_damage_classes.json` | Class names: dent, scratch, crack, shattered_glass, broken_lamp, flat_tire | ✅ present |
| `mileage_xgb.json` | XGBoost mileage model | ✅ present — synthetic-demo, not used by findings |
| `mileage_xgb.meta.json` | Training provenance and metrics | ✅ present |
| `MODEL_REGISTER.json` | Source, licence, SHA-256, size, purpose | ✅ present |

The YOLO weights come from
`github.com/ReverendBayes/YOLO11m-Car-Damage-Detector` (MIT), fine-tuned on
CarDD_COCO. They are **assistive**: every detection requires inspector
validation and never establishes severity.

## Repository policy

- `car_damage.pt` (40.5 MB, MIT) is committed because damage detection is part
  of the product. If repository size is a concern, delete it and re-fetch with
  `scripts/fetch_models.py` (source and SHA-256 are in `MODEL_REGISTER.json`).
- `data/yolo_sample.png` (1.1 MB) is the inference test fixture.
- `data/mileage_training.csv` is regenerable with
  `scripts/build_mileage_dataset.py`.
- PaddleOCR models are auto-downloaded to `~/.paddlex/official_models`
  (`PP-OCRv6_medium_det`, `PP-OCRv6_medium_rec`) and listed under
  `auto_downloaded` in `MODEL_REGISTER.json`.

## Rules

1. **Licence first.** `scripts/fetch_models.py` refuses to download without
   `--license`. Record the exact licence string.
2. **Integrity.** The SHA-256 of every file is recorded; pass `--sha256` to verify.
3. **No claims without weights.** The damage adapter reports
   `available: false` and the OpenCV signal path remains active. No result is
   presented as YOLO detection when no model is loaded.
4. **No severity verdicts.** Detections are candidates for human inspector
   validation; one photo cannot establish accident severity.

## Commands

```bash
python scripts/fetch_models.py --list
python scripts/fetch_models.py --hf <repo> --file <file.onnx> \
  --name car_damage.onnx --license "Apache-2.0"
python scripts/train_mileage_xgb.py data/mileage_labelled.csv
```

A licensed car-damage model **was** found and is committed: MIT-licensed YOLO11m
weights from `ReverendBayes/YOLO11m-Car-Damage-Detector` (40.5 MB). The other
researched candidates were unusable (empty repo, Keras-only classifier, or no
exported weights). See `docs/MODEL_ASSETS.md` for the research matrix.

## Distribution decision (2026-11-05)

| Asset | Decision | Why |
| --- | --- | --- |
| `models/car_damage.pt` (40.5 MB, MIT) | **commit** | Damage detection and its tests must work offline from a fresh clone; under the 100 MB per-file limit; MIT allows redistribution. Fetch-on-demand alternative is recorded in `MODEL_REGISTER.json` → `asset_policy.car_damage.pt.fetch_on_demand_alternative`. |
| `data/yolo_sample.png` (1.1 MB) | **commit** | Small, deterministic fixture for `test_damage_adapter_detects_on_a_real_sample`. |
| `data/mileage_training.csv` (17 KB) | **commit** | Reproduces the exact shipped demo model and its provenance; regenerable with `scripts/build_mileage_dataset.py`. |
| `data/eval_llm.log`, `data/paddle_test.png` | **commit** | Saved verification evidence for the 10-case LLM eval and the PaddleOCR plate check. |
| PaddleOCR `PP-OCRv6_medium_{det,rec}` (~134 MB in `~/.paddlex`) | **never commit** | Auto-downloaded on first use; recorded in `MODEL_REGISTER.json` → `auto_downloaded` with licence, size, SHA-256 and host-verification note. |

`python scripts/fetch_models.py --verify` checks every committed asset against
its registered SHA-256 and reports missing files. Re-fetch the YOLO weights with
the `--hf` command in `MODEL_REGISTER.json` if a fork chooses not to commit them.
