"""XGBoost mileage model, re-exported from services/ai/xgboost/xgboost_adapter."""
from services.ai.xgboost.xgboost_adapter import (  # noqa: F401
    FEATURES,
    MODEL_PATH,
    NotConfigured,
    build_features,
    predict,
    status,
    train,
)

__all__ = ["FEATURES", "MODEL_PATH", "NotConfigured", "build_features", "predict", "status", "train"]
