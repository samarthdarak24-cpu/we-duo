"""Security gate: RBAC, privacy, uploads, injection, rate limiting, v1 contract."""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.ratelimit import RateLimiter

client = TestClient(app, headers={"X-Service-Token": "qa-test-service-token"})


def login(email: str, password: str = "demo1234") -> str:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


SELLER = login("seller@test.dev")
BUYER = login("buyer@test.dev")
ADMIN = login("admin@test.dev")


# ---- rate limiting --------------------------------------------------------
class _FakeClient:
    host = "203.0.113.9"


class _FakeRequest:
    headers: dict = {}
    client = _FakeClient()


def test_rate_limiter_blocks_after_limit():
    limiter = RateLimiter(limit=2, window_seconds=60)
    limiter(_FakeRequest())  # type: ignore[arg-type]
    limiter(_FakeRequest())  # type: ignore[arg-type]
    with pytest.raises(HTTPException) as exc:
        limiter(_FakeRequest())  # type: ignore[arg-type]
    assert exc.value.status_code == 429
    assert exc.value.headers and "Retry-After" in exc.value.headers


def test_auth_routes_are_wired_to_the_limiter():
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/v1/auth/login" in paths
    assert "/api/backend/auth/login" in paths


# ---- authentication -------------------------------------------------------
def test_unauthenticated_requests_are_rejected():
    assert client.get("/api/v1/users/me").status_code == 401
    assert client.post("/api/v1/vehicles", json={}).status_code == 401
    assert client.get("/api/backend/vehicles").status_code == 401
    assert client.get("/api/v1/inquiries").status_code == 401


def test_sql_injection_in_login_is_parameterised():
    r = client.post("/api/v1/auth/login",
                    json={"email": "' OR 1=1 --", "password": "' OR 1=1 --"})
    assert r.status_code == 401


# ---- RBAC -----------------------------------------------------------------
def test_buyer_cannot_access_seller_only_apis():
    assert client.post("/api/v1/vehicles", json={
        "make": "X", "model": "Y", "year": 2020, "reg_no": "MH09ZZ0001",
    }, headers=auth(BUYER)).status_code == 403
    assert client.get("/api/v1/vehicles/mine", headers=auth(BUYER)).status_code == 403
    assert client.post("/api/v1/vehicles/v-test/verification-runs",
                       headers=auth(BUYER)).status_code == 403
    assert client.post("/api/v1/vehicles/v-test/mileage-records", json={
        "km": 10, "date": "2024-01-01",
    }, headers=auth(BUYER)).status_code == 403


def test_seller_cannot_edit_another_sellers_vehicle():
    reg = client.post("/api/v1/auth/register", json={
        "name": "Other Seller", "email": "other-seller@test.dev",
        "password": "demo1234", "role": "seller",
    })
    assert reg.status_code == 201
    other = reg.json()["access_token"]
    r = client.patch("/api/v1/vehicles/v-test", json={"asking_price": 1},
                     headers=auth(other))
    assert r.status_code == 403


def test_admin_can_read_audit_but_seller_cannot():
    assert client.get("/api/v1/users/me", headers=auth(SELLER)).status_code == 200
    assert client.get("/api/backend/audit", headers=auth(SELLER)).status_code == 403
    assert client.get("/api/backend/audit", headers=auth(ADMIN)).status_code == 200


# ---- privacy --------------------------------------------------------------
def test_buyer_cannot_read_private_documents():
    assert client.get("/api/v1/documents/doc1", headers=auth(BUYER)).status_code == 403
    assert client.get("/api/v1/documents/doc1", headers=auth(SELLER)).status_code == 200


def test_public_qr_reveals_only_permitted_summary():
    share = client.post("/api/v1/vehicles/v-test2/qr-tokens", headers=auth(SELLER))
    assert share.status_code == 200, share.text
    token = share.json()["token"]
    public = client.get(f"/api/v1/public/vehicle-verification/{token}")
    assert public.status_code == 200
    body = public.json()
    assert body["status"] == "valid"
    for forbidden in ("email", "phone", "password_hash", "owner_id", "kyc_status"):
        assert forbidden not in str(body.get("vehicle", {}))
    assert "disclosure" in body


# ---- uploads --------------------------------------------------------------
def test_invalid_file_content_is_rejected(tmp_path: Path):
    bad = tmp_path / "evil.pdf"
    bad.write_bytes(b"MZ\x90\x00 this is an executable, not a pdf")
    r = client.post("/api/intelligence/documents/process", json={
        "document_id": "doc1", "vehicle_id": "v-test", "path": str(bad), "async": False,
    })
    assert r.status_code == 422
    assert "magic" in r.json()["detail"]


def test_oversized_document_metadata_is_rejected():
    r = client.post("/api/v1/vehicles/v-test/documents", json={
        "type": "rc", "file_name": "huge.pdf", "file_key": "vehicles/huge.pdf",
        "sha256": "a" * 64, "size_bytes": 30 * 1024 * 1024,
    }, headers=auth(SELLER))
    assert r.status_code == 422


def test_invalid_sha256_is_rejected():
    r = client.post("/api/v1/vehicles/v-test/documents", json={
        "type": "rc", "file_name": "rc.pdf", "file_key": "vehicles/rc.pdf",
        "sha256": "not-a-hash",
    }, headers=auth(SELLER))
    assert r.status_code == 422


# ---- output safety --------------------------------------------------------
def test_stored_markup_is_returned_as_data_not_executed():
    payload = "<script>alert(1)</script>"
    r = client.patch("/api/v1/vehicles/v-test", json={"description": payload},
                     headers=auth(SELLER))
    assert r.status_code == 200
    assert r.json()["vehicle"]["description"] == payload  # JSON data, not HTML


# ---- contract -------------------------------------------------------------
def test_v1_contract_paths_exist():
    paths = client.get("/openapi.json").json()["paths"]
    expected = [
        "/api/v1/auth/register", "/api/v1/auth/login", "/api/v1/auth/refresh",
        "/api/v1/auth/logout", "/api/v1/auth/password/forgot", "/api/v1/auth/password/reset",
        "/api/v1/users/me", "/api/v1/vehicles", "/api/v1/vehicles/mine",
        "/api/v1/vehicles/{vehicle_id}", "/api/v1/vehicles/{vehicle_id}/archive",
        "/api/v1/vehicles/{vehicle_id}/images", "/api/v1/vehicles/{vehicle_id}/documents",
        "/api/v1/vehicles/{vehicle_id}/history", "/api/v1/vehicles/{vehicle_id}/history-events",
        "/api/v1/vehicles/{vehicle_id}/mileage-records",
        "/api/v1/vehicles/{vehicle_id}/inspections",
        "/api/v1/vehicles/{vehicle_id}/damage-records",
        "/api/v1/vehicles/{vehicle_id}/verification-runs",
        "/api/v1/vehicles/{vehicle_id}/verification-results",
        "/api/v1/vehicles/{vehicle_id}/investigations",
        "/api/v1/investigations/{investigation_id}",
        "/api/v1/vehicles/{vehicle_id}/trust-score",
        "/api/v1/vehicles/{vehicle_id}/evidence",
        "/api/v1/listings/{listing_id}/publish",
        "/api/v1/listings/{listing_id}/pause",
        "/api/v1/listings/{listing_id}/mark-sold",
        "/api/v1/marketplace/listings",
        "/api/v1/saved-vehicles", "/api/v1/comparisons",
        "/api/v1/inquiries", "/api/v1/inquiries/{inquiry_id}",
        "/api/v1/vehicles/{vehicle_id}/reports",
        "/api/v1/reports/{report_id}/download",
        "/api/v1/vehicles/{vehicle_id}/qr-tokens",
        "/api/v1/public/vehicle-verification/{token}",
        "/api/v1/notifications", "/api/v1/health/live", "/api/v1/health/ready",
    ]
    missing = [p for p in expected if p not in paths]
    assert not missing, f"missing contract paths: {missing}"


def test_health_endpoints():
    assert client.get("/api/v1/health/live").json()["status"] == "alive"
    ready = client.get("/api/v1/health/ready")
    assert ready.status_code == 200
    assert ready.json()["status"] == "ready"
