"""Deterministic rule entry points (single source: app.detectors)."""
from app.detectors import detect_all, document_findings, mileage_findings

__all__ = ["mileage_findings", "document_findings", "detect_all"]
