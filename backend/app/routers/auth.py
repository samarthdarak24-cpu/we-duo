"""Authentication — compatible with the Next.js scrypt + HS256 implementation."""
from __future__ import annotations

import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, Field

from .. import db, repository
from ..config import settings
from ..ratelimit import enforce_auth_limit
from ..security import (current_user, hash_password, public_user, require_role,
                        sign_token, verify_password, verify_token)

router = APIRouter(prefix="/api/backend/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ROLES = ("buyer", "seller")


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str
    password: str = Field(min_length=8, max_length=128)
    role: str = "buyer"


class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotRequest(BaseModel):
    email: str


class ResetRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def _initials(name: str) -> str:
    parts = [p for p in name.split() if p]
    return "".join(p[0].upper() for p in parts[:2]) or "TD"


def _issue(user: dict, user_agent: str = "", ip: str = "") -> dict:
    refresh = secrets.token_urlsafe(32)
    sid = db.new_id("sess")
    now = db.now_iso()
    db.insert("sessions", {
        "id": sid, "user_id": str(user["id"]), "refresh_hash": _sha(refresh),
        "user_agent": user_agent[:300], "ip": ip[:64],
        "created_at": now, "last_seen_at": now,
    })
    token = sign_token(str(user["id"]), str(user["role"]), str(user["name"]), sid=sid)
    return {
        "access_token": token, "token_type": "bearer",
        "expires_in": 7 * 24 * 60 * 60, "refresh_token": refresh,
        "user": public_user(user),
    }


@router.post("/register", status_code=201, dependencies=[Depends(enforce_auth_limit)])
def register(req: RegisterRequest) -> dict:
    if not EMAIL_RE.match(req.email):
        raise HTTPException(status_code=422, detail="Invalid email address.")
    role = req.role if req.role in ROLES else "buyer"
    if db.read("users", where="LOWER(email) = :e", params={"e": req.email.lower()}, limit=1):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user_id = db.new_id("u")
    now = db.now_iso()
    ok, reason = db.insert("users", {
        "id": user_id, "name": req.name.strip(), "role": role,
        "email": req.email.strip().lower(), "password_hash": hash_password(req.password),
        "initials": _initials(req.name), "phone": "", "city": "",
        "kyc_status": "not_started", "preferences": "{}", "email_verified": 0,
        "twofa_enabled": 0, "created_at": now,
    })
    if not ok:
        raise HTTPException(status_code=422, detail=f"Could not create the account: {reason}")
    user = repository.get_row("users", user_id)
    repository.audit(user_id, "user.registered", "user", user_id, {"role": role})
    return _issue(user)


@router.post("/login", dependencies=[Depends(enforce_auth_limit)])
def login(req: LoginRequest, user_agent: str | None = Header(default=None),
          x_forwarded_for: str | None = Header(default=None)) -> dict:
    rows = db.read("users", where="LOWER(email) = :e", params={"e": req.email.strip().lower()}, limit=1)
    user = rows[0] if rows else None
    # Constant-ish response for unknown user and wrong password.
    if (not user or user.get("deleted_at")
            or not verify_password(req.password, str(user.get("password_hash")))):
        repository.audit(None, "auth.login_failed", "user", req.email, None)
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    db.update("users", str(user["id"]), {"last_login_at": db.now_iso()})
    repository.audit(str(user["id"]), "auth.login", "user", str(user["id"]), None)
    return _issue(user, user_agent or "", x_forwarded_for or "")


@router.post("/refresh")
def refresh(req: RefreshRequest) -> dict:
    rows = db.read("sessions", where="refresh_hash = :h", params={"h": _sha(req.refresh_token)}, limit=1)
    if not rows or rows[0].get("revoked_at"):
        raise HTTPException(status_code=401, detail="Refresh token is invalid or revoked.")
    user = repository.get_row("users", str(rows[0]["user_id"]))
    if user.get("deleted_at"):
        raise HTTPException(status_code=401, detail="Account is no longer active.")
    db.update("sessions", str(rows[0]["id"]), {"last_seen_at": db.now_iso()})
    token = sign_token(str(user["id"]), str(user["role"]), str(user["name"]),
                       sid=str(rows[0]["id"]))
    return {"access_token": token, "token_type": "bearer",
            "expires_in": 7 * 24 * 60 * 60, "user": public_user(user)}


@router.post("/logout", status_code=204, response_class=Response)
def logout(authorization: str | None = Header(default=None)) -> Response:
    payload = verify_token(authorization[7:].strip()) if authorization and authorization.lower().startswith("bearer ") else None
    if payload and payload.get("sid"):
        db.update("sessions", str(payload["sid"]), {"revoked_at": db.now_iso()})
    return Response(status_code=204)


@router.get("/me")
def me(user: dict = Depends(current_user)) -> dict:
    return {"user": public_user(user)}


@router.get("/sessions")
def sessions(user: dict = Depends(current_user)) -> dict:
    rows = db.read("sessions", where="user_id = :u", params={"u": user["id"]}, limit=100)
    return {"items": [{k: v for k, v in r.items() if k != "refresh_hash"} for r in rows]}


@router.delete("/sessions/{session_id}", status_code=204, response_class=Response)
def revoke_session(session_id: str, user: dict = Depends(current_user)) -> Response:
    row = repository.get_row("sessions", session_id)
    if str(row["user_id"]) != str(user["id"]) and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Cannot revoke another user's session.")
    db.update("sessions", session_id, {"revoked_at": db.now_iso()})
    return Response(status_code=204)


@router.post("/change-password", status_code=204, response_class=Response)
def change_password(req: ChangePasswordRequest, user: dict = Depends(current_user)) -> Response:
    if not verify_password(req.current_password, str(user.get("password_hash"))):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    db.update("users", str(user["id"]), {"password_hash": hash_password(req.new_password)})
    repository.audit(str(user["id"]), "auth.password_changed", "user", str(user["id"]))
    return Response(status_code=204)


@router.post("/forgot-password", status_code=202, dependencies=[Depends(enforce_auth_limit)])
def forgot_password(req: ForgotRequest) -> dict:
    rows = db.read("users", where="LOWER(email) = :e", params={"e": req.email.strip().lower()}, limit=1)
    response = {"status": "accepted",
                "message": "If an account exists for that email, a reset link has been issued."}
    if not rows:
        return response
    raw = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(timespec="seconds")
    db.insert("auth_tokens", {
        "id": db.new_id("token"), "user_id": str(rows[0]["id"]), "type": "password_reset",
        "token_hash": _sha(raw), "expires_at": expires, "created_at": db.now_iso(),
    })
    repository.audit(str(rows[0]["id"]), "auth.reset_requested", "user", str(rows[0]["id"]))
    if settings.environment == "local":
        # Email delivery is not configured locally; the token is returned ONLY
        # in local mode and is explicitly labelled as a demo convenience.
        response["demo_token"] = raw
        response["demo_note"] = "Local mode only: email delivery is not configured."
    return response


@router.post("/reset-password", status_code=204, response_class=Response)
def reset_password(req: ResetRequest) -> Response:
    rows = db.read("auth_tokens", where="token_hash = :h", params={"h": _sha(req.token)}, limit=1)
    if not rows:
        raise HTTPException(status_code=400, detail="Reset token is invalid.")
    token = rows[0]
    if token.get("used_at"):
        raise HTTPException(status_code=400, detail="Reset token has already been used.")
    if str(token.get("expires_at", "")) < datetime.now(timezone.utc).isoformat(timespec="seconds"):
        raise HTTPException(status_code=400, detail="Reset token has expired.")
    db.update("users", str(token["user_id"]), {"password_hash": hash_password(req.password)})
    db.update("auth_tokens", str(token["id"]), {"used_at": db.now_iso()})
    repository.audit(str(token["user_id"]), "auth.password_reset", "user", str(token["user_id"]))
    return Response(status_code=204)
