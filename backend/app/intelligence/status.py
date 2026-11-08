"""Honest capability snapshot of the AI/ML layer.

Reported by `GET /health`. Each adapter is probed live; a component that is not
installed is reported as ``available: False`` with a reason, never as a silent
success. The three top-level keys are a stable contract consumed by the health
payload and the backend test suite.
"""
from __future__ import annotations

from .damage import yolo
from .mileage import xgboost_adapter
from .retrieval import embeddings

VERSION = "intelligence-layer-2.0.0"


def status() -> dict:
    """Live state of the damage, mileage and retrieval adapters."""
    return {
        "damage": yolo.status(),
        "xgboost": xgboost_adapter.status(),
        "retrieval": embeddings.status(),
    }
