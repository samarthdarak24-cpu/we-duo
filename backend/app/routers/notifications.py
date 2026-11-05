"""In-app notifications."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import db, repository
from ..security import current_user

router = APIRouter(prefix="/api/backend/notifications", tags=["notifications"])


@router.get("")
def list_notifications(limit: int = 50, offset: int = 0, unread_only: bool = False,
                       user: dict = Depends(current_user)) -> dict:
    rows = db.read("notifications", where="user_id = :u", params={"u": user["id"]}, limit=500)
    if unread_only:
        rows = [r for r in rows if not r.get("read")]
    rows.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
    unread = len([r for r in rows if not r.get("read")])
    return {"items": rows[offset:offset + limit], "total": len(rows),
            "unread": unread, "limit": limit, "offset": offset}


@router.post("/{notification_id}/read")
def mark_read(notification_id: str, user: dict = Depends(current_user)) -> dict:
    row = repository.get_row("notifications", notification_id)
    if str(row.get("user_id")) != str(user["id"]):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Not your notification.")
    updated = repository.update_row("notifications", notification_id, {"read": 1})
    return {"notification": updated}


@router.post("/read-all")
def mark_all_read(user: dict = Depends(current_user)) -> dict:
    rows = db.read("notifications", where="user_id = :u", params={"u": user["id"]}, limit=500)
    changed = 0
    for row in rows:
        if not row.get("read"):
            db.update("notifications", str(row["id"]), {"read": 1})
            changed += 1
    return {"updated": changed}
