"""TrustDrive intelligence service.

Additive Python runtime that shares the SAME relational database as the Next.js
application. It owns document intelligence, fraud/anomaly detection, the
stateful investigation agent and background jobs. It never replaces the
Next.js REST API and never fabricates verification results.

The AI/ML model layer (OCR, YOLO damage detection, XGBoost mileage model, LLM
evaluation) lives in ``services/ai`` at the repository root. This package makes
that directory importable regardless of whether the process was started with
``uvicorn --app-dir backend``, ``python -m pytest`` from ``backend/`` or the
combined Docker image.
"""
from __future__ import annotations

import sys
from pathlib import Path

# backend/app/__init__.py -> backend/app -> backend -> repository root
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
