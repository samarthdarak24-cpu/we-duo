"""Auth compatible with the Next.js runtime.

The Next.js app hashes with Node's `scryptSync(password, salt, 64)` and stores
`"<salt>:<hex>"`; it signs HS256 JWTs with the same base64url scheme. This module
reproduces BOTH exactly, so one user row and one token work across the two
runtimes. No second password store is created.

SECURITY (SEC-001): the signing secret is never a constant in source. `JWT_SECRET`
wins; otherwise both runtimes share a random secret persisted at
`<repo>/.data/jwt-secret` (gitignored). A secret copied from the repository can
therefore no longer mint admin tokens.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from pathlib import Path

from fastapi import Depends, Header, HTTPException

from . import db

REPO_ROOT = Path(__file__).resolve().parents[2]
SECRET_FILE = REPO_ROOT / ".data" / "jwt-secret"


def _resolve_secret() -> str:
    from_env = os.getenv("JWT_SECRET")
    if from_env and len(from_env) >= 16:
        return from_env
    try:
        SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
        try:
            fd = os.open(SECRET_FILE, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            pass  # Next.js (or another worker) created it first.
        else:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(secrets.token_hex(32))
        for _ in range(20):
            value = SECRET_FILE.read_text(encoding="utf-8").strip()
            if len(value) >= 32:
                return value
            time.sleep(0.05)
    except OSError:
        pass
    if os.getenv("TD_ENV", "local") == "production":
        raise RuntimeError(
            "JWT_SECRET is not configured and .data/jwt-secret is unreadable. "
            "Set JWT_SECRET to a strong random value before starting in production."
        )
    logging.getLogger(__name__).warning(
        "JWT_SECRET is unset and the shared secret file is unavailable; "
        "using a process-local random secret. Cross-runtime tokens will not match."
    )
    return secrets.token_hex(32)


SECRET = _resolve_secret()
ROLES = ("buyer", "seller", "admin")
TOKEN_TTL = 7 * 24 * 60 * 60


# ---- password -------------------------------------------------------------
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    key = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64)
    return f"{salt}:{key.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, key = stored.split(":", 1)
    except ValueError:
        return False
    derived = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64)
    return hmac.compare_digest(derived.hex(), key)


# ---- JWT (HS256, base64url, no padding) -----------------------------------
def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(data: str) -> str:
    return _b64(hmac.new(SECRET.encode(), data.encode(), hashlib.sha256).digest())


def sign_token(sub: str, role: str, name: str, sid: str | None = None,
               ttl: int = TOKEN_TTL) -> str:
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    now = int(time.time())
    body = _b64(json.dumps({"sub": sub, "role": role, "name": name,
                            **({"sid": sid} if sid else {}),
                            "iat": now, "exp": now + ttl}).encode())
    return f"{header}.{body}.{_sign(f'{header}.{body}')}"


def verify_token(token: str) -> dict | None:
    parts = token.split(".")
    if len(parts) != 3:
        return None
    header, body, sig = parts
    # Reject "alg: none" / algorithm-confusion attempts before trusting the MAC.
    try:
        parsed_header = json.loads(_unb64(header))
    except Exception:
        return None
    if parsed_header.get("alg") != "HS256" or parsed_header.get("typ") != "JWT":
        return None
    if not hmac.compare_digest(sig, _sign(f"{header}.{body}")):
        return None
    try:
        payload = json.loads(_unb64(body))
    except Exception:
        return None
    if not isinstance(payload.get("sub"), str) or not isinstance(payload.get("exp"), (int, float)):
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    return payload


def is_internal_service(payload: dict) -> bool:
    """A short-lived Next.js -> Python hop token, not a user session."""
    return (
        payload.get("svc") == "nextjs"
        and payload.get("sub") == "service:nextjs"
        and int(payload.get("exp", 0)) - int(payload.get("iat", 0)) <= 600
    )


# ---- dependencies ---------------------------------------------------------
def _bearer(authorization: str | None) -> dict | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return verify_token(authorization[7:].strip())


def current_user(authorization: str | None = Header(default=None)) -> dict:
    payload = _bearer(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Missing or invalid bearer token.")
    rows = db.read("users", where="id = :id", params={"id": payload["sub"]}, limit=1)
    if not rows:
        raise HTTPException(status_code=401, detail="User no longer exists.")
    user = rows[0]
    if user.get("deleted_at"):
        raise HTTPException(status_code=401, detail="Account is no longer active.")
    if str(user.get("role")) != payload.get("role"):
        raise HTTPException(status_code=401, detail="Token role no longer matches the account.")
    return user


def optional_user(authorization: str | None = Header(default=None)) -> dict | None:
    payload = _bearer(authorization)
    if not payload:
        return None
    rows = db.read("users", where="id = :id", params={"id": payload["sub"]}, limit=1)
    if not rows or rows[0].get("deleted_at"):
        return None
    return rows[0]


def require_role(*roles: str):
    def dependency(user: dict = Depends(current_user)) -> dict:
        if str(user.get("role")) not in roles:
            raise HTTPException(status_code=403, detail=f"Requires role: {', '.join(roles)}")
        return user
    return dependency


def assert_owner(user: dict, owner_id: str | None) -> None:
    if str(user.get("role")) == "admin":
        return
    if str(owner_id) != str(user.get("id")):
        raise HTTPException(status_code=403, detail="You do not own this record.")


def public_user(user: dict) -> dict:
    safe = {k: v for k, v in user.items() if k not in ("password_hash", "kyc_doc_key")}
    return safe
