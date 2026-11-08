"""Trust-score entry points (single source: app.explain)."""
from app.explain import SCORE_VERSION, WEIGHTS, compute, persist

__all__ = ["compute", "persist", "WEIGHTS", "SCORE_VERSION"]
