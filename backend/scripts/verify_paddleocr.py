#!/usr/bin/env python
"""Re-verify the real PaddleOCR backend on ANY host (cross-host checklist).

The oneDNN workaround (FLAGS_use_mkldnn=0 / FLAGS_use_onednn=0 and
enable_mkldnn=False) was verified on one Windows CPU host only. Run this script
on a second host and attach the JSON output to docs/MODEL_ASSETS.md. It makes
no claim it cannot prove: it prints the active engine, method, confidence and
host details, and exits non-zero if OCR did not actually run.

Usage:
  python backend/scripts/verify_paddleocr.py
  python backend/scripts/verify_paddleocr.py --json > ai-services/shared/data/paddleocr_host_check.json
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.ocr import PaddleOcrBackend  # noqa: E402  (sets the CPU flags on import)


def _version(module: str) -> str | None:
    try:
        mod = __import__(module)
        return getattr(mod, "__version__", None)
    except Exception as exc:
        return f"unavailable ({type(exc).__name__})"


def make_plate(tmp: Path) -> Path:
    import cv2  # type: ignore
    import numpy as np  # type: ignore

    img = np.full((200, 700, 3), 255, np.uint8)
    cv2.putText(img, "MH01AB1234", (20, 120), cv2.FONT_HERSHEY_SIMPLEX,
                2.0, (0, 0, 0), 5)
    out = tmp / "paddle_cross_host_plate.png"
    cv2.imwrite(str(out), img)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="machine-readable report")
    ap.add_argument("--fixture", help="use an existing plate image instead of a rendered one")
    args = ap.parse_args()

    import tempfile
    with tempfile.TemporaryDirectory(prefix="trustdrive-paddle-") as td:
        path = Path(args.fixture) if args.fixture else make_plate(Path(td))
        backend = PaddleOcrBackend()
        report = {
            "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "host": {
                "system": platform.system(),
                "release": platform.release(),
                "machine": platform.machine(),
                "processor": platform.processor() or "unknown",
                "python": platform.python_version(),
            },
            "versions": {
                "paddleocr": _version("paddleocr"),
                "paddle": _version("paddle"),
            },
            "cpu_workaround": {
                "FLAGS_use_mkldnn": os.environ.get("FLAGS_use_mkldnn"),
                "FLAGS_use_onednn": os.environ.get("FLAGS_use_onednn"),
                "enable_mkldnn_argument": False,
            },
            "fixture": str(path),
            "available": backend.available(),
        }
        if backend.available() and path.is_file():
            result = backend.run(path)
            report["result"] = {
                "engine": result.engine,
                "method": result.method,
                "text": result.text,
                "confidence": result.confidence,
                "is_ocr": result.is_ocr,
                "warnings": result.warnings,
            }
            r = report["result"]
            report["passed"] = bool(
                r["is_ocr"] and r["engine"] == "paddleocr"
                and r["method"].startswith("paddleocr")
                and not r["method"].endswith("-error")
                and "1234" in r["text"].replace(" ", "")
                and (r["confidence"] or 0) >= 0.8
            )
        else:
            report["passed"] = False
            report["result"] = {"error": "paddleocr not installed or fixture missing"}

    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        h = report["host"]
        print(f"Host: {h['system']} {h['release']} {h['machine']} / {h['processor']}")
        print(f"Python {h['python']} · paddleocr {report['versions']['paddleocr']} "
              f"· paddle {report['versions']['paddle']}")
        print(f"CPU workaround: {report['cpu_workaround']}")
        print(f"Result: {report['result']}")
        print("PASS" if report["passed"] else "FAIL")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
