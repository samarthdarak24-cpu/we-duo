"""System / AI capability status endpoints.

These expose honest, structured capability reports: which providers are active,
and whether experimental models are present. No endpoint claims a real external
result without a successful call; unavailable integrations report clearly.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from ..intelligence import fraud
from ..integrations.notifications import get_notification_status
from ..integrations.registry import get_registry_status
from ..integrations.storage import get_storage_status
from ..security import current_user

router = APIRouter(prefix="/api/v1", tags=["system", "ai"])


@router.get("/ai/fraud/model-status")
def fraud_model_status(user: dict = Depends(current_user)) -> dict:
    meta = fraud.get_model_metadata()
    return {**meta, "available": meta.get("available")}


@router.get("/system/notifications")
def notifications_status(user: dict = Depends(current_user)) -> dict:
    return {"service": "notifications", **get_notification_status()}


@router.get("/system/registry")
def registry_status(user: dict = Depends(current_user)) -> dict:
    return {"service": "registry", **get_registry_status()}


@router.get("/system/storage")
def storage_status(user: dict = Depends(current_user)) -> dict:
    return {"service": "storage", **get_storage_status()}
