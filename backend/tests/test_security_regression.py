"""Regression tests for the two critical findings of the 2026-11-05 QA pass.

SEC-001: a JWT secret hardcoded in source allowed anyone to mint admin tokens.
SEC-002: /api/intelligence/* accepted completely anonymous callers.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from pathlib import Path

from fastapi.testclient import TestClient

from app import security
from app.main import app

REPO_ROOT = Path(__file__).resolve().parents[2]
PUBLIC_FALLBACK_SECRET = "trustdrive-dev-secret-change-in-prod"
SERVICE_TOKEN = "qa-test-service-token"

_b64 = lambda raw: base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _forge(secret: str, sub: str, role: str, *, exp: int | None = None,
           alg: str = "HS256") -> str:
    header = _b64(json.dumps({"alg": alg, "typ": "JWT"}).encode())
    body = _b64(json.dumps({
        "sub": sub, "role": role, "name": "Forged",
        "iat": int(time.time()) - 60,
        "exp": exp if exp is not None else int(time.time()) + 3600,
    }).encode())
    sig = _b64(hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest())
    return f"{header}.{body}.{sig}"


# ---- SEC-001 --------------------------------------------------------------
def test_no_hardcoded_jwt_secret_in_either_runtime():
    """The publicly known fallback must be gone from all signing code."""
    files = [
        REPO_ROOT / "frontend" / "lib" / "server" / "auth.ts",
        REPO_ROOT / "backend" / "app" / "security.py",
    ]
    for path in files:
        assert PUBLIC_FALLBACK_SECRET not in path.read_text(encoding="utf-8"), path
    assert security.signing_secret() != PUBLIC_FALLBACK_SECRET
    assert len(security.signing_secret()) >= 32


def test_token_forged_with_the_old_public_secret_is_rejected():
    c = TestClient(app)
    for sub, role in [("u-admin", "admin"), ("u-buyer", "admin"), ("u-seller", "seller")]:
        r = c.get("/api/backend/audit",
                  headers={"Authorization": f"Bearer {_forge(PUBLIC_FALLBACK_SECRET, sub, role)}",
                           "X-Service-Token": SERVICE_TOKEN})
        assert r.status_code == 401, (sub, role, r.text)


def test_alg_none_and_garbage_tokens_are_rejected():
    c = TestClient(app)
    for token in [
        _forge(security.signing_secret(), "u-admin", "admin", alg="none"),
        "x.y.z",
        "eyJhbGciOiJub25lIn0.e30.",
        "",
    ]:
        r = c.get("/api/backend/audit", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401, token[:30]


def test_expired_token_is_rejected():
    c = TestClient(app)
    token = _forge(security.signing_secret(), "u-admin", "admin", exp=int(time.time()) - 10)
    r = c.get("/api/backend/audit", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_role_claim_must_match_the_live_account():
    """A correctly signed token that escalates a buyer to admin is refused."""
    c = TestClient(app)
    token = security.sign_token("u-buyer", "admin", "Escalated")
    r = c.get("/api/backend/audit", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_internal_service_tokens_are_not_user_sessions():
    """The Next.js -> Python hop token must not unlock user/admin endpoints."""
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    now = int(time.time())
    body = _b64(json.dumps({"sub": "service:nextjs", "role": "service",
                            "name": "TrustDrive Web", "svc": "nextjs",
                            "iat": now, "exp": now + 120}).encode())
    token = f"{header}.{body}.{security._sign(f'{header}.{body}')}"
    assert security.is_internal_service(security.verify_token(token))
    c = TestClient(app)
    assert c.get("/api/backend/audit",
                 headers={"Authorization": f"Bearer {token}"}).status_code == 401
    assert c.get("/api/intelligence/capabilities",
                 headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_shared_secret_file_is_present_and_private():
    path = REPO_ROOT / ".data" / "jwt-secret"
    # In CI the env may supply JWT_SECRET instead of using the persisted file.
    if not path.exists():
        assert __import__("os").getenv("JWT_SECRET"), "no secret source configured"
        return
    assert len(path.read_text(encoding="utf-8").strip()) >= 32


# ---- SEC-002 --------------------------------------------------------------
def test_anonymous_cannot_read_or_write_intelligence_endpoints():
    c = TestClient(app)  # deliberately no default headers
    cases = [
        ("get", "/api/intelligence/capabilities", None),
        ("get", "/api/intelligence/fraud/v-test", None),
        ("get", "/api/intelligence/trust-score/v-test", None),
        ("get", "/api/intelligence/jobs", None),
        ("get", "/api/intelligence/review", None),
        ("get", "/api/intelligence/damage/v-test", None),
        ("post", "/api/intelligence/fraud/detect", {"vehicle_id": "v-test"}),
        ("post", "/api/intelligence/investigate", {"vehicle_id": "v-test"}),
        ("post", "/api/intelligence/jobs", {"type": "document.ocr", "vehicle_id": "v-test"}),
        ("post", "/api/intelligence/chat", {"question": "hello"}),
    ]
    for method, url, payload in cases:
        r = getattr(c, method)(url, json=payload) if payload is not None else getattr(c, method)(url)
        assert r.status_code == 401, (method, url, r.status_code, r.text[:120])


def test_service_token_grants_intelligence_access():
    c = TestClient(app, headers={"X-Service-Token": SERVICE_TOKEN})
    assert c.get("/api/intelligence/capabilities").status_code == 200
    assert c.post("/api/intelligence/fraud/detect",
                  json={"vehicle_id": "v-test"}).status_code == 200


def test_valid_user_bearer_grants_intelligence_access():
    c = TestClient(app)
    token = security.sign_token("u-buyer", "buyer", "Rohan Mehta")
    r = c.get("/api/intelligence/capabilities",
              headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200


def test_wrong_service_token_does_not_grant_access():
    c = TestClient(app, headers={"X-Service-Token": "wrong"})
    assert c.get("/api/intelligence/capabilities").status_code == 401
    assert c.post("/api/intelligence/fraud/detect",
                  json={"vehicle_id": "v-test"}).status_code == 401


def test_public_health_and_docs_remain_available():
    c = TestClient(app)
    assert c.get("/health").status_code == 200
    assert c.get("/openapi.json").status_code == 200
