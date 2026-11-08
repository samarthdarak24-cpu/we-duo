#!/usr/bin/env python
"""Download and register an AI model for the intelligence service.

Governance:
  * A licence string is REQUIRED (`--license`). We do not bundle unlicensed weights.
  * The download is size-capped and SHA-256 is recorded (and verified if supplied).
  * Every fetch is appended to `services/ai/shared/models/MODEL_REGISTER.json`.

Examples:
  python backend/scripts/fetch_models.py --list
  python backend/scripts/fetch_models.py --verify
  python backend/scripts/fetch_models.py --hf <repo_id> --file car_damage.onnx \
      --name car_damage.onnx --license "Apache-2.0" --purpose "damage detection"
  python backend/scripts/fetch_models.py --url https://.../model.onnx --name car_damage.onnx \
      --license "MIT" --sha256 <64-hex>

`--verify` checks every committed asset in the register against its SHA-256 and
reports missing files (use the recorded fetch command to restore them). The
MIT-licensed YOLO11m weights ARE committed so damage detection works offline;
the other researched candidates below were unusable. See docs/MODEL_ASSETS.md.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MODELS = REPO_ROOT / "services" / "ai" / "shared" / "models"
REGISTER = MODELS / "MODEL_REGISTER.json"
MAX_BYTES = 800 * 1024 * 1024

CANDIDATES = [
    {
        "repo": "Mariofm02/YOLOv8m_Car_Parts_Damaged",
        "status": "empty repository (no weights uploaded)",
        "usable": False,
    },
    {
        "repo": "AdamGie/CV_damaged_car_detection",
        "status": "real Keras VGG16 classifier (214 MB, unlicense); needs TensorFlow, no ONNX",
        "usable": False,
    },
    {
        "repo": "gg-insoore/detr-finetuned-cardamage-v2",
        "status": "DETR object detection (transformers + torch); no ONNX export",
        "usable": False,
    },
]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, dest: Path) -> int:
    req = urllib.request.Request(url, headers={"User-Agent": "trustdrive-model-fetch/1.0"})
    total = 0
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(req, timeout=60) as resp, dest.open("wb") as out:
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_BYTES:
                out.close()
                dest.unlink(missing_ok=True)
                raise SystemExit(f"Refusing download larger than {MAX_BYTES} bytes.")
            out.write(chunk)
    return total


def register(entry: dict) -> None:
    MODELS.mkdir(parents=True, exist_ok=True)
    data = {"models": []}
    if REGISTER.is_file():
        data = json.loads(REGISTER.read_text(encoding="utf-8"))
    data["models"] = [m for m in data.get("models", []) if m.get("name") != entry["name"]]
    data["models"].append(entry)
    REGISTER.write_text(json.dumps(data, indent=2), encoding="utf-8")


def verify_register() -> int:
    """Check committed assets against their registered size/hash. Read-only."""
    if not REGISTER.is_file():
        print(f"Register not found: {REGISTER}")
        return 2
    data = json.loads(REGISTER.read_text(encoding="utf-8"))
    checks = [(m["name"], MODELS / m["name"], m.get("sha256"))
              for m in data.get("models", [])]
    def asset_path(name: str) -> Path:
        parts = Path(name).parts
        if parts and parts[0] in ("models", "data"):
            return REPO_ROOT / "services" / "ai" / "shared" / parts[0] / Path(*parts[1:])
        return REPO_ROOT / name
    checks += [(f["name"], asset_path(f["name"]), f.get("sha256"))
               for f in data.get("fixtures", [])]
    problems = 0
    print("Committed assets (SHA-256):")
    for name, path, expected in checks:
        if not path.is_file():
            print(f"  MISSING   {name}")
            problems += 1
            continue
        digest = sha256_file(path)
        if expected and digest.lower() != expected.lower():
            print(f"  MISMATCH  {name}: expected {expected}, got {digest}")
            problems += 1
        else:
            print(f"  OK        {name}  {path.stat().st_size:,} bytes")
    print("\nHost-cached weights (auto-downloaded, not committed):")
    for m in data.get("auto_downloaded", []):
        cached = Path(m.get("path", "")).expanduser() / m.get("weights_file", "")
        status = "present" if cached.is_file() else "not on this host"
        print(f"  {m['name']:28s} {status}")
    print(f"\n{len(checks) - problems}/{len(checks)} committed assets verified.")
    return 0 if problems == 0 else 1


def list_status() -> None:
    print("Local models/")
    if MODELS.is_dir():
        for f in sorted(MODELS.iterdir()):
            if f.is_file() and f.name != "MODEL_REGISTER.json":
                print(f"  {f.name:40s} {f.stat().st_size:>12,d} bytes")
    else:
        print("  (missing)")
    print("\nKnown candidate sources (none bundled):")
    for c in CANDIDATES:
        print(f"  {c['repo']:48s} usable={c['usable']}  {c['status']}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--verify", action="store_true",
                    help="check committed assets against the register (read-only)")
    ap.add_argument("--hf", help="Hugging Face repo id, e.g. owner/model")
    ap.add_argument("--file", help="file path inside the HF repo")
    ap.add_argument("--url", help="direct download URL")
    ap.add_argument("--name", help="destination filename in services/ai/shared/models/")
    ap.add_argument("--license", dest="licence", help="SPDX licence of the weights")
    ap.add_argument("--purpose", default="damage detection")
    ap.add_argument("--sha256", help="expected SHA-256 (optional)")
    args = ap.parse_args()

    if args.verify:
        return verify_register()
    if args.list:
        list_status()
        return 0
    if not args.name:
        ap.error("--name is required")
    if not args.licence:
        ap.error("--license is required: unlicensed weights are not downloaded")

    if args.hf and args.file:
        url = f"https://huggingface.co/{args.hf}/resolve/main/{args.file}"
        source = f"hf:{args.hf}/{args.file}"
    elif args.url:
        url = args.url
        source = args.url
    else:
        ap.error("provide --hf + --file, or --url")

    dest = MODELS / args.name
    print(f"Downloading {url}\n -> {dest}")
    size = download(url, dest)
    digest = sha256_file(dest)
    if args.sha256 and digest.lower() != args.sha256.lower():
        dest.unlink(missing_ok=True)
        print(f"SHA-256 mismatch: expected {args.sha256}, got {digest}", file=sys.stderr)
        return 2
    register({
        "name": args.name, "source": source, "license": args.licence,
        "purpose": args.purpose, "bytes": size, "sha256": digest,
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    })
    print(f"OK {size:,} bytes  sha256={digest}")
    print(f"Registered in {REGISTER.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
