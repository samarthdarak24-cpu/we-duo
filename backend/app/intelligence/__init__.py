"""Runtime view of the AI/ML layer.

The implementation lives in ``services/ai`` (OCR, YOLO damage detection,
XGBoost mileage model, LangChain retrieval/scoring, LLM evaluation). These
modules are thin re-exports so the backend keeps a stable ``app.intelligence.*``
import surface while the actual AI code has one home.

Nothing here fabricates a result: every adapter reports the engine that actually
ran and degrades honestly when a model or dependency is missing.
"""

from .status import status  # noqa: E402,F401  (callable, shadows the submodule name)

__all__ = ["status"]
