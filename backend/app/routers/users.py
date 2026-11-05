"""Users, profiles, KYC and activity."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import text

from .. import db, repository
from ..security import current_user, public_user, require_role

router = APIRouter(prefix="/api/backend/users", tags=["users"])


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    phone: str | None = Field(default=None, max_length=20)
    city: str | None = Field(default=None, max_length=60)
    initials: str | None = Field(default=None, max_length=4)
    preferences: dict | None = None
    avatar_url: str | None = None


class KycUpdate(BaseModel):
    status: str
    note: str = ""


@router.get("/me")
def my_profile(user: dict = Depends(current_user)) -> dict:
    return {"user": public_user(user)}


@router.patch("/me")
def update_profile(req: ProfileUpdate, user: dict = Depends(current_user)) -> dict:
    data = req.model_dump(exclude_none=True)
    if "preferences" in data:
        import json
        data["preferences"] = json.dumps(data["preferences"])
    updated = repository.update_row("users", str(user["id"]), data)
    repository.audit(str(user["id"]), "user.profile_updated", "user", str(user["id"]),
                     {"fields": list(data)})
    return {"user": public_user(updated)}


@router.get("/me/activity")
def my_activity(user: dict = Depends(current_user)) -> dict:
    rows = db.read("activity", where="user_id = :u", params={"u": user["id"]}, limit=1)
    if rows:
        return {"activity": rows[0]}
    return {"activity": {"user_id": user["id"], "explored": 0, "saved": 0,
                         "recently_viewed": 0, "pending_reports": 0}}


@router.delete("/me", status_code=204, response_class=Response)
def delete_me(user: dict = Depends(current_user)) -> Response:
    """Soft delete the account and revoke every session immediately."""
    repository.soft_delete("users", str(user["id"]))
    with db.engine().begin() as conn:
        conn.execute(text(
            "UPDATE sessions SET revoked_at = :t WHERE user_id = :u AND revoked_at IS NULL"
        ), {"t": db.now_iso(), "u": user["id"]})
    repository.audit(str(user["id"]), "user.self_deleted", "user", str(user["id"]))
    return Response(status_code=204)


@router.get("")
def list_users(limit: int = 50, offset: int = 0, role: str | None = None,
               user: dict = Depends(require_role("admin"))) -> dict:
    return repository.list_rows("users", filters={"role": role}, limit=limit, offset=offset,
                                order_by="created_at", search=None)


@router.get("/{user_id}")
def get_user(user_id: str, user: dict = Depends(current_user)) -> dict:
    if user_id != str(user["id"]) and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="You may only read your own profile.")
    return {"user": public_user(repository.get_row("users", user_id))}


@router.delete("/{user_id}", status_code=204, response_class=Response)
def delete_user(user_id: str, admin: dict = Depends(require_role("admin"))) -> Response:
    if user_id == str(admin["id"]):
        raise HTTPException(status_code=400,
                            detail="Use DELETE /users/me to delete your own account.")
    repository.soft_delete("users", user_id)
    with db.engine().begin() as conn:
        conn.execute(text(
            "UPDATE sessions SET revoked_at = :t WHERE user_id = :u AND revoked_at IS NULL"
        ), {"t": db.now_iso(), "u": user_id})
    repository.audit(str(admin["id"]), "admin.user_soft_deleted", "user", user_id)
    return Response(status_code=204)


@router.patch("/{user_id}/kyc")
def review_kyc(user_id: str, req: KycUpdate, admin: dict = Depends(require_role("admin"))) -> dict:
    if req.status not in ("not_started", "pending", "verified", "rejected"):
        raise HTTPException(status_code=422,
                            detail="status must be not_started | pending | verified | rejected")
    updated = repository.update_row("users", user_id, {"kyc_status": req.status})
    repository.audit(str(admin["id"]), "admin.kyc_reviewed", "user", user_id,
                     {"status": req.status, "note": req.note})
    return {"user": public_user(updated)}
