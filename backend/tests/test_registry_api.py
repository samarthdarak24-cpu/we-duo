"""HTTP contract tests for the registry consent + lookup endpoints.

These prove the endpoint-level guarantees, not just the adapter internals:
consent is required, the source must be known, an unconfigured source reports
`blocked`, and no response ever claims a verification it did not obtain.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.integrations import registry_consent
from app.main import app
from app.security import sign_token

SELLER_TOKEN = sign_token("u-seller", "seller", "Samarth Darak")
BUYER_TOKEN = sign_token("u-buyer", "buyer", "Rohan Mehta")
AUTH = {"Authorization": f"Bearer {SELLER_TOKEN}"}


def _client() -> TestClient:
    return TestClient(app)


def test_status_requires_authentication() -> None:
    r = _client().get("/api/v1/registry/status")
    assert r.status_code == 401


def test_status_reports_blocked_sources() -> None:
    r = _client().get("/api/v1/registry/status", headers=AUTH)
    assert r.status_code == 200
    body = r.json()
    assert set(body["sources"]) == {"vahan", "insurer", "theft"}
    # No provider credentials exist in this environment, so every source must
    # report itself as blocked — never as available or verified.
    for source in body["sources"].values():
        assert source["configured"] is False
        assert source["status"] != "available"


def test_consent_requires_identifiers() -> None:
    r = _client().post("/api/v1/registry/consent", json={}, headers=AUTH)
    assert r.status_code == 400


def test_consent_is_recorded_and_readable() -> None:
    registry_consent.reset_store()
    c = _client()
    r = c.post(
        "/api/v1/registry/consent",
        json={"reg_no": "MH01AB1234", "source": "vahan"},
        headers=AUTH,
    )
    assert r.status_code == 200
    consent = r.json()["consent"]
    assert consent["reg_no"] == "MH01AB1234"
    assert consent["consent_version"]

    r = c.get("/api/v1/registry/consent", params={"reg_no": "MH01AB1234"}, headers=AUTH)
    assert r.status_code == 200
    assert r.json()["has_consent"] is True


def test_lookup_without_consent_is_refused() -> None:
    registry_consent.reset_store()
    r = _client().post(
        "/api/v1/registry/lookup",
        json={"source": "vahan", "reg_no": "MH99ZZ0000"},
        headers=AUTH,
    )
    assert r.status_code == 200
    body = r.json()
    # No provider credentials exist here, so the source is blocked before the
    # consent gate is even reached. Either gate refuses the lookup; what must
    # never happen is a verification. (The consent gate itself is proven in
    # tests/test_registry_adapters.py against a configured provider.)
    assert body["outcome"] in ("blocked", "consent_required")
    assert body["verified"] is False
    assert body.get("record") is None


def test_lookup_with_consent_on_unconfigured_source_is_blocked() -> None:
    registry_consent.reset_store()
    c = _client()
    granted = c.post(
        "/api/v1/registry/consent",
        json={"reg_no": "MH01AB1234", "source": "vahan"},
        headers=AUTH,
    )
    assert granted.status_code == 200
    consent_id = granted.json()["consent"]["consent_id"]

    r = c.post(
        "/api/v1/registry/lookup",
        json={"source": "vahan", "reg_no": "MH01AB1234", "consent_id": consent_id},
        headers=AUTH,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["outcome"] == "blocked"
    assert body["verified"] is False
    assert "not configured" in (body.get("reason") or "").lower()


def test_lookup_requires_an_identifier() -> None:
    r = _client().post("/api/v1/registry/lookup", json={"source": "vahan"}, headers=AUTH)
    assert r.status_code == 400


def test_unknown_source_is_rejected() -> None:
    r = _client().post(
        "/api/v1/registry/lookup",
        json={"source": "not-a-registry", "reg_no": "MH01AB1234"},
        headers=AUTH,
    )
    assert r.status_code in (400, 422)


def test_user_document_is_never_government_verified() -> None:
    r = _client().post(
        "/api/v1/registry/lookup",
        json={
            "source": "vahan",
            "reg_no": "MH01AB1234",
            "document": {"file_name": "rc.pdf", "type": "rc"},
        },
        headers=AUTH,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["verified"] is False
    assert body["provider_kind"] == "user_document"


def test_buyer_may_record_consent_for_their_own_vehicle() -> None:
    registry_consent.reset_store()
    r = _client().post(
        "/api/v1/registry/consent",
        json={"vin": "WBA8E9G50GNU12345"},
        headers={"Authorization": f"Bearer {BUYER_TOKEN}"},
    )
    assert r.status_code == 200
    assert r.json()["consent"]["vin"] == "WBA8E9G50GNU12345"
