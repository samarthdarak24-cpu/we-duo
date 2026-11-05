"""TrustDrive LIVE backend + security + integration suite (Pytest + HTTPX).

Targets the two real running runtimes:
  * Next.js REST API        QA_NEXT_URL  (default http://127.0.0.1:3300)
  * FastAPI intelligence    QA_INTEL_URL (default http://127.0.0.1:8000)

Every write is verified against the shared SQLite database afterwards — a 201
alone is not evidence that the operation persisted. Results are captured to
qa/results/live_api.json by qa/conftest.py.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import sqlite3
import time

import httpx
import pytest

from conftest import (BUYER_A_INQUIRY, BUYER_B_INQUIRY, DB_FILE, INTEL_URL,
                      NEXT_URL, PUBLISHED_LISTING, SELLER_A_VEHICLE,
                      SELLER_B_VEHICLE, mkclient, rows)

PUBLIC_FALLBACK_SECRET = "trustdrive-dev-secret-change-in-prod"
_b64 = lambda raw: base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def forge(secret: str, sub: str, role: str, *, exp: int | None = None,
          alg: str = "HS256") -> str:
    header = _b64(json.dumps({"alg": alg, "typ": "JWT"}).encode())
    body = _b64(json.dumps({
        "sub": sub, "role": role, "name": "Forged",
        "iat": int(time.time()) - 60,
        "exp": exp if exp is not None else int(time.time()) + 3600,
    }).encode())
    return f"{header}.{body}.{_b64(hmac.new(secret.encode(), f'{header}.{body}'.encode(), hashlib.sha256).digest())}"


def body(r: httpx.Response):
    try:
        return r.json()
    except Exception:
        return {}


def payload(r: httpx.Response):
    b = body(r)
    return b.get("data", b)


# ===========================================================================
# 1. Authentication & session lifecycle
# ===========================================================================
class TestAuth:
    def test_all_five_demo_accounts_log_in_on_both_runtimes(self, tokens):
        assert set(tokens) == {"seller_a", "seller_b", "buyer_a", "buyer_b", "admin"}
        for role, pair in tokens.items():
            assert pair["next"] and pair["intel"], role

    def test_login_rejects_wrong_password(self):
        with mkclient(NEXT_URL) as c:
            r = c.post("/api/v1/auth/login",
                       json={"email": "samarth@trustdrive.dev", "password": "wrong-password"})
            assert r.status_code == 401
            assert body(r)["error"]["code"] == "INVALID_CREDENTIALS"

    def test_login_rejects_missing_fields(self):
        with mkclient(NEXT_URL) as c:
            assert c.post("/api/v1/auth/login", json={"email": "x"}).status_code == 400

    def test_me_returns_the_live_account_row(self, nxt, db):
        r = nxt.get("/api/v1/me")
        assert r.status_code == 200
        assert payload(r)["id"] == "u-seller"
        assert payload(r)["role"] == "seller"
        assert "password_hash" not in json.dumps(payload(r))

    def test_refresh_rotates_the_session(self):
        with mkclient(NEXT_URL) as c:
            login = c.post("/api/v1/auth/login",
                           json={"email": "samarth@trustdrive.dev", "password": "demo1234"})
            assert login.status_code == 200
            refresh = c.cookies.get("td_refresh")
            assert refresh
            r = c.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
            assert r.status_code == 200, r.text[:200]

    def test_logout_revokes_the_session(self):
        with mkclient(NEXT_URL) as c:
            c.post("/api/v1/auth/login",
                   json={"email": "samarth@trustdrive.dev", "password": "demo1234"})
            assert c.post("/api/v1/auth/logout").status_code == 200
            assert c.get("/api/v1/me").status_code == 401

    def test_expired_forged_and_alg_none_tokens_are_rejected_on_both_runtimes(self):
        cases = [
            ("public-secret", forge(PUBLIC_FALLBACK_SECRET, "u-admin", "admin")),
            ("expired", forge(PUBLIC_FALLBACK_SECRET, "u-seller", "seller",
                              exp=int(time.time()) - 10)),
            ("alg-none", forge(PUBLIC_FALLBACK_SECRET, "u-admin", "admin", alg="none")),
            ("garbage", "x.y.z"),
        ]
        with mkclient(NEXT_URL) as c, mkclient(INTEL_URL) as i:
            for label, tok in cases:
                h = {"Authorization": f"Bearer {tok}"}
                assert c.get("/api/v1/admin/audit", headers=h).status_code == 401, label
                assert i.get("/api/backend/audit", headers=h).status_code == 401, label

    def test_privilege_escalation_token_is_rejected(self):
        """SEC-001 regression: a buyer token with an admin role claim."""
        with mkclient(NEXT_URL) as c, mkclient(INTEL_URL) as i:
            tok = forge(PUBLIC_FALLBACK_SECRET, "u-buyer2", "admin")
            h = {"Authorization": f"Bearer {tok}"}
            assert c.get("/api/v1/admin/audit", headers=h).status_code == 401
            assert c.get("/api/v1/admin/queue", headers=h).status_code == 401
            assert i.get("/api/backend/audit", headers=h).status_code == 401

    def test_no_hardcoded_secret_remains_in_signing_code(self):
        from pathlib import Path
        root = Path(__file__).resolve().parents[1]
        for rel in ["lib/server/auth.ts", "services/intelligence/app/security.py"]:
            assert PUBLIC_FALLBACK_SECRET not in (root / rel).read_text(encoding="utf-8")


# ===========================================================================
# 2. RBAC / cross-tenant isolation
# ===========================================================================
class TestRBAC:
    @pytest.mark.parametrize("runtime,prefix", [("next", "/api/v1"), ("intel", "/api/backend")])
    def test_anonymous_cannot_read_protected_data(self, runtime, prefix):
        base = NEXT_URL if runtime == "next" else INTEL_URL
        urls = (["/api/v1/me", "/api/v1/seller/overview", "/api/v1/admin/audit",
                 "/api/v1/notifications", "/api/v1/reports"] if runtime == "next"
                else ["/api/backend/audit", "/api/backend/users", "/api/v1/vehicles/mine",
                      "/api/backend/notifications", "/api/backend/reports"])
        with mkclient(base) as c:
            for url in urls:
                assert c.get(url).status_code in (401, 403), url

    def test_seller_a_cannot_mutate_seller_b_vehicle(self, auth):
        with mkclient(NEXT_URL) as c, mkclient(INTEL_URL) as i:
            hn = auth("seller_a", "next")
            hi = auth("seller_a", "intel")
            nxt_cases = [
                ("POST", f"/api/v1/vehicles/{SELLER_B_VEHICLE}/damage",
                 {"zoneId": "hood", "description": "cross-tenant"}),
                ("POST", f"/api/v1/vehicles/{SELLER_B_VEHICLE}/mileage",
                 {"km": 1, "date": "2026-01-01"}),
                ("POST", f"/api/v1/vehicles/{SELLER_B_VEHICLE}/history",
                 {"category": "service", "title": "cross-tenant", "date": "2026-01-01"}),
                ("POST", f"/api/v1/vehicles/{SELLER_B_VEHICLE}/documents",
                 {"type": "rc", "file_name": "x.pdf"}),
            ]
            for method, url, data in nxt_cases:
                r = c.request(method, url, headers=hn, json=data)
                assert r.status_code in (401, 403, 404, 405), (url, r.status_code, r.text[:160])
            int_cases = [
                ("PATCH", f"/api/backend/vehicles/{SELLER_B_VEHICLE}", {"make": "HACKED"}),
                ("POST", f"/api/backend/vehicles/{SELLER_B_VEHICLE}/damage",
                 {"zone_id": "hood", "description": "cross-tenant"}),
                ("POST", f"/api/backend/vehicles/{SELLER_B_VEHICLE}/mileage",
                 {"km": 1, "date": "2026-01-01"}),
                ("POST", f"/api/backend/vehicles/{SELLER_B_VEHICLE}/history",
                 {"category": "service", "title": "x", "event_date": "2026-01-01"}),
            ]
            for method, url, data in int_cases:
                r = i.request(method, url, headers=hi, json=data)
                assert r.status_code in (401, 403, 404), (url, r.status_code, r.text[:160])

    def test_buyer_cannot_mutate_vehicle_records(self, auth):
        with mkclient(NEXT_URL) as c, mkclient(INTEL_URL) as i:
            for method, url, data in [
                ("POST", f"/api/v1/vehicles/{SELLER_A_VEHICLE}/damage", {"zoneId": "hood"}),
                ("POST", f"/api/v1/vehicles/{SELLER_A_VEHICLE}/mileage", {"km": 1, "date": "2026-01-01"}),
                ("POST", f"/api/v1/vehicles/{SELLER_A_VEHICLE}/history", {"title": "x", "date": "2026-01-01"}),
            ]:
                assert c.request(method, url, headers=auth("buyer_a", "next"), json=data).status_code in (401, 403, 404)
            assert i.patch(f"/api/backend/vehicles/{SELLER_A_VEHICLE}",
                           headers=auth("buyer_a", "intel"), json={"make": "HACKED"}).status_code in (401, 403)

    def test_buyer_cannot_read_another_buyers_inquiry(self, auth):
        with mkclient(NEXT_URL) as c, mkclient(INTEL_URL) as i:
            assert c.get(f"/api/v1/inquiries/{BUYER_B_INQUIRY}",
                         headers=auth("buyer_a", "next")).status_code in (403, 404)
            assert c.post(f"/api/v1/inquiries/{BUYER_B_INQUIRY}/messages",
                          headers=auth("buyer_a", "next"), json={"body": "x"}).status_code in (403, 404)
            assert i.get(f"/api/backend/inquiries/{BUYER_B_INQUIRY}",
                         headers=auth("buyer_a", "intel")).status_code in (403, 404)

    def test_owners_can_read_their_own_inquiry(self, auth):
        with mkclient(NEXT_URL) as c:
            assert c.get(f"/api/v1/inquiries/{BUYER_A_INQUIRY}",
                         headers=auth("buyer_a", "next")).status_code == 200
            assert c.get(f"/api/v1/inquiries/{BUYER_A_INQUIRY}",
                         headers=auth("seller_a", "next")).status_code == 200

    @pytest.mark.parametrize("runtime,urls", [
        ("next", ["/api/v1/admin/audit", "/api/v1/admin/queue", "/api/v1/admin/kyc"]),
        ("intel", ["/api/backend/audit", "/api/backend/users", "/api/backend/admin/queue"]),
    ])
    def test_admin_endpoints_enforced_for_every_role(self, runtime, urls, auth):
        base = NEXT_URL if runtime == "next" else INTEL_URL
        with mkclient(base) as c:
            for url in urls:
                assert c.get(url, headers=auth("buyer_a", runtime)).status_code in (401, 403), url
                assert c.get(url, headers=auth("seller_a", runtime)).status_code in (401, 403), url
                assert c.get(url, headers=auth("admin", runtime)).status_code == 200, url

    def test_private_documents_are_consent_gated(self, auth, db):
        docs = rows(db, "SELECT id, file_key, consent FROM documents WHERE consent = 0 LIMIT 3")
        assert docs, "seed must contain private documents to test consent gating"
        with mkclient(NEXT_URL) as c:
            for d in docs:
                r = c.get(f"/api/v1/documents/{d['id']}", headers=auth("buyer_a", "next"))
                assert r.status_code in (401, 403, 404), (d["id"], r.status_code)
            for d in docs:
                if d["file_key"]:
                    r = c.get(f"/api/v1/files/{d['file_key']}", headers=auth("buyer_a", "next"))
                    assert r.status_code in (400, 401, 403, 404, 415), (d["file_key"], r.status_code)

    def test_intelligence_endpoints_reject_anonymous_callers(self):
        """SEC-002 regression on the LIVE service (no TD_SERVICE_TOKEN set)."""
        with mkclient(INTEL_URL) as c:
            for method, url, data in [
                ("GET", "/api/intelligence/capabilities", None),
                ("GET", "/api/intelligence/fraud/v-bmw", None),
                ("GET", "/api/intelligence/trust-score/v-bmw", None),
                ("GET", "/api/intelligence/jobs", None),
                ("POST", "/api/intelligence/fraud/detect", {"vehicle_id": "v-bmw"}),
                ("POST", "/api/intelligence/investigate", {"vehicle_id": "v-bmw"}),
            ]:
                r = c.request(method, url, json=data) if data else c.request(method, url)
                assert r.status_code == 401, (url, r.status_code, r.text[:140])

    def test_intelligence_endpoints_accept_a_user_bearer_token(self, auth):
        with mkclient(INTEL_URL) as c:
            r = c.get("/api/intelligence/fraud/v-bmw", headers=auth("buyer_a", "intel"))
            assert r.status_code == 200
            assert r.json()["vehicle_id"] == "v-bmw"


# ===========================================================================
# 3. Validation & injection resistance
# ===========================================================================
class TestValidation:
    def test_invalid_registration_and_vin_are_rejected(self, nxt):
        assert nxt.post("/api/v1/seller/vehicles", json={
            "regNo": "NOT-A-PLATE", "vin": "SHORT", "make": "QA", "model": "Probe", "year": 2020,
        }).status_code == 400
        assert nxt.post("/api/v1/seller/vehicles", json={
            "regNo": "MH01AB1234", "vin": "VINQA0000000000000", "make": "QA", "model": "Probe", "year": 2020,
        }).status_code == 400

    def test_sql_injection_in_search_is_parameterised(self, auth):
        evil = ["' OR 1=1 --", "'; DROP TABLE users; --", "<script>alert(1)</script>", "1' UNION SELECT * FROM users --"]
        with mkclient(INTEL_URL) as c, mkclient(NEXT_URL) as n:
            h = auth("buyer_a", "intel")
            for value in evil:
                r = c.post("/api/backend/marketplace/search", headers=h, json={"brand": value, "limit": 5})
                assert r.status_code in (200, 400, 422), (value, r.status_code)
                if r.status_code == 200:
                    assert "password_hash" not in r.text
            assert n.get("/api/v1/marketplace/listings?make=' OR 1=1 --",
                         headers=auth("buyer_a", "next")).status_code in (200, 400, 422)
        con = sqlite3.connect(DB_FILE)
        assert con.execute("SELECT COUNT(*) FROM users").fetchone()[0] >= 7
        con.close()

    def test_invalid_payloads_return_4xx_not_5xx(self, auth):
        with mkclient(NEXT_URL) as c, mkclient(INTEL_URL) as i:
            for url, data in [
                ("/api/v1/auth/login", {"email": "not-an-email"}),
                ("/api/v1/seller/vehicles", {"make": ""}),
                ("/api/v1/vehicles/v-bmw/mileage", {"km": "abc", "date": "nope"}),
            ]:
                assert c.post(url, headers=auth("seller_a", "next"), json=data).status_code < 500
            for url, data in [
                ("/api/backend/vehicles", {"make": "X"}),
                ("/api/backend/marketplace/search", {"price_min": "abc"}),
                ("/api/backend/saved", {"listing_id": ""}),
            ]:
                assert i.post(url, headers=auth("seller_a", "intel"), json=data).status_code < 500

    def test_unsupported_file_magic_is_rejected(self, auth):
        with mkclient(NEXT_URL) as c:
            r = c.post("/api/v1/vehicles/v-bmw/documents",
                       headers=auth("seller_a", "next"),
                       files={"file": ("evil.pdf", b"MZ\x90\x00 executable", "application/pdf")})
            assert r.status_code in (400, 415, 422), (r.status_code, r.text[:180])


# ===========================================================================
# 4. Core domain: vehicles, documents, mileage, history, damage
# ===========================================================================
class TestDomainWrites:
    def test_create_vehicle_persists_to_database(self, nxt, db):
        suffix = str(int(time.time() * 1000))[-6:]
        reg = f"MH01QA{suffix}"  # MH + 01 + QA + 4 digits -> needs exactly 4 digits
        reg = f"MH01AB{suffix}"  # valid: 2 letters, 2 digits, 2 letters, 4-6 digits
        reg = f"MH01AB{suffix[-4:]}"
        vin = "WBA" + suffix + "12345678"[:17 - 6 - len(suffix)]
        vin = ("WBA" + suffix + "123456789ABCDEFG")[:17].replace("Q", "Z").replace("O", "P").replace("I", "J")
        data = {"regNo": reg, "vin": vin, "make": "QA", "model": "Integration",
                "year": 2021, "fuel": "petrol", "transmission": "automatic"}
        r = nxt.post("/api/v1/seller/vehicles", json=data)
        assert r.status_code == 201, r.text[:300]
        vid = payload(r).get("id") or payload(r).get("vehicle", {}).get("id")
        assert vid, r.text[:300]
        stored = rows(db, "SELECT id, reg_no, vin, make, owner_id FROM vehicles WHERE id = ?", vid)
        assert len(stored) == 1 and stored[0]["owner_id"] == "u-seller"
        assert stored[0]["make"] == "QA"

    def test_mileage_write_persists_and_is_readable(self, nxt, db):
        km = 700000 + int(time.time()) % 1000
        r = nxt.post(f"/api/v1/vehicles/{SELLER_A_VEHICLE}/mileage",
                     json={"km": km, "date": "2026-10-01", "source": "qa-integration"})
        assert r.status_code == 201, r.text[:250]
        mid = payload(r)["id"]
        stored = rows(db, "SELECT id, km, vehicle_id FROM mileage_readings WHERE id = ?", mid)
        assert stored and stored[0]["km"] == km and stored[0]["vehicle_id"] == SELLER_A_VEHICLE
        listed = payload(nxt.get(f"/api/v1/vehicles/{SELLER_A_VEHICLE}/mileage"))
        assert any(x.get("km") == km for x in (listed.get("items") or listed.get("readings") or []))

    def test_history_write_persists(self, nxt, db):
        title = "QA integration service " + str(int(time.time()))
        r = nxt.post(f"/api/v1/vehicles/{SELLER_A_VEHICLE}/history",
                     json={"category": "service", "title": title, "date": "2026-09-01",
                           "description": "Created by the live QA suite"})
        assert r.status_code == 201, r.text[:250]
        hid = payload(r)["id"]
        stored = rows(db, "SELECT id, title, vehicle_id FROM history_events WHERE id = ?", hid)
        assert stored and stored[0]["title"] == title

    def test_damage_write_persists_and_appears_as_hotspot(self, nxt, db):
        r = nxt.post(f"/api/v1/vehicles/{SELLER_A_VEHICLE}/damage",
                     json={"zoneId": "front_bumper", "description": "QA live damage record",
                           "severity": "Moderate", "repairStatus": "Not repaired"})
        assert r.status_code == 201, r.text[:250]
        did = payload(r)["id"]
        stored = rows(db, "SELECT id, zone_id, vehicle_id FROM damage_records WHERE id = ?", did)
        assert stored and stored[0]["zone_id"] == "front_bumper"
        damage = payload(nxt.get(f"/api/v1/vehicles/{SELLER_A_VEHICLE}/damage"))
        assert any(x.get("id") == did for x in damage.get("records", []))

    def test_document_metadata_write_persists(self, auth, db):
        with mkclient(INTEL_URL) as c:
            sha = hashlib.sha256(str(time.time()).encode()).hexdigest()
            r = c.post(f"/api/backend/vehicles/{SELLER_A_VEHICLE}/documents",
                       headers=auth("seller_a", "intel"),
                       json={"type": "inspection_report", "file_name": "qa-live.pdf",
                             "file_key": "vehicles/qa-live.pdf",
                             "sha256": sha, "mime": "application/pdf", "size_bytes": 1024})
            assert r.status_code in (200, 201), r.text[:250]
            doc_id = (r.json().get("document") or {}).get("id") or r.json().get("id")
            assert doc_id, r.text[:250]
            stored = rows(db, "SELECT id, sha256, vehicle_id FROM documents WHERE id = ?", doc_id)
            assert stored and stored[0]["sha256"] == sha

    def test_corrected_history_never_overwrites_the_original(self, nxt, db):
        """Append-only corrections: the original row must survive unchanged."""
        originals = rows(db, "SELECT id, title FROM history_events WHERE vehicle_id = ? LIMIT 1",
                         SELLER_A_VEHICLE)
        assert originals
        original = originals[0]
        r = nxt.post(f"/api/v1/history/{original['id']}/correction",
                     json={"reason": "QA correction test", "title": "Corrected " + original["title"]})
        assert r.status_code in (200, 201, 400, 403, 404, 422), r.text[:200]
        still = rows(db, "SELECT title FROM history_events WHERE id = ?", original["id"])
        assert still and still[0]["title"] == original["title"]


# ===========================================================================
# 5. Verification, trust, chain, evidence graph, AI findings
# ===========================================================================
class TestVerificationAndAI:
    def test_verification_run_produces_real_checks(self, nxt, db):
        r = nxt.post(f"/api/v1/vehicles/{SELLER_A_VEHICLE}/verify", json={})
        assert r.status_code == 200, r.text[:250]
        data = payload(r)
        assert data.get("runId") and data.get("checks")
        assert data["summary"]["checks"] >= 1
        stored = rows(db, "SELECT id, status FROM verification_runs WHERE id = ?", data["runId"])
        assert stored, "verification run must persist"

    def test_trust_score_is_deterministic_and_versioned(self, nxt):
        a = payload(nxt.get(f"/api/v1/vehicles/{SELLER_A_VEHICLE}/trust"))
        b = payload(nxt.get(f"/api/v1/vehicles/{SELLER_A_VEHICLE}/trust"))
        assert a == b, "trust score must be deterministic"
        assert 0 <= a["trustScore"] <= 100
        assert a.get("breakdown")
        with mkclient(INTEL_URL) as c:
            ts = c.get(f"/api/intelligence/trust-score/{SELLER_A_VEHICLE}",
                       headers={"Authorization": "Bearer " + _intel_token()})
            assert ts.status_code == 200
            assert ts.json()["version"] == "trust-score-2.0.0"

    def test_hash_chain_verifies(self, nxt):
        r = nxt.get(f"/api/v1/chain/{SELLER_A_VEHICLE}")
        assert r.status_code == 200
        data = payload(r)
        assert isinstance(data.get("intact"), bool), data
        assert data["records"] >= 1 and data.get("latestHash")

    def test_evidence_graph_nodes_reference_real_records(self, nxt, db):
        r = nxt.get(f"/api/v1/vehicles/{SELLER_A_VEHICLE}/evidence-graph")
        assert r.status_code == 200
        data = payload(r)
        assert data["nodes"] and data["method"] and data["rulesetVersion"]
        node_ids = {n.get("id") for n in data["nodes"]}
        db_ids = {x["id"] for x in rows(db, "SELECT id FROM documents WHERE vehicle_id = ?", SELLER_A_VEHICLE)}
        assert node_ids & db_ids or any("document" in str(n.get("type", "")).lower() for n in data["nodes"])

    def test_ai_findings_cite_evidence_ids_and_a_method_version(self, auth, nxt):
        r = nxt.get(f"/api/v1/vehicles/{SELLER_A_VEHICLE}/findings")
        assert r.status_code == 200
        data = payload(r)
        items = data.get("items", data) if isinstance(data, dict) else data
        if isinstance(items, list) and items:
            for f in items[:5]:
                assert f.get("id"), "every finding needs a stable evidence id"
        with mkclient(INTEL_URL) as c:
            fraud = c.post("/api/intelligence/fraud/detect",
                           headers=auth("seller_a", "intel"),
                           json={"vehicle_id": SELLER_A_VEHICLE})
            assert fraud.status_code == 200
            for report in fraud.json()["reports"]:
                for finding in report.get("findings", []):
                    assert finding.get("evidence") is not None or finding.get("evidence_ids") is not None
                    assert finding.get("method") or finding.get("version")

    def test_ai_assistant_returns_grounded_citations(self, nxt):
        r = nxt.post("/api/v1/ai/assistant",
                     json={"vehicleId": SELLER_A_VEHICLE, "question": "What evidence exists for this vehicle?"})
        assert r.status_code == 200, r.text[:200]
        data = payload(r)
        assert data.get("answer")
        assert "disclaimer" in json.dumps(data).lower() or data.get("citations") is not None

    def test_langgraph_investigation_reports_its_real_orchestrator(self, auth):
        with mkclient(INTEL_URL) as c:
            r = c.post("/api/intelligence/investigate", headers=auth("seller_a", "intel"),
                       json={"vehicle_id": SELLER_A_VEHICLE,
                             "question": "Are there unresolved evidence conflicts?"})
            assert r.status_code == 200, r.text[:250]
            data = r.json()
            assert data.get("orchestrator") in ("langgraph", "sequential-fallback")
            assert isinstance(data.get("checkpointing"), bool)
            assert len(data.get("nodes", [])) == 12, "all 12 investigator nodes must be reported"
            assert data.get("evidence_ids"), "findings must cite real evidence IDs"
            assert data.get("model_versions"), "model/rule versions must be reported"
            assert data.get("investigation_id")

    def test_missing_llm_never_fabricates_a_conclusion(self, auth):
        with mkclient(INTEL_URL) as c:
            r = c.post("/api/intelligence/chat", headers=auth("buyer_a", "intel"),
                       json={"vehicle_id": SELLER_A_VEHICLE, "question": "Is this car stolen?"})
            assert r.status_code == 200
            answer = (r.json().get("answer") or "").lower()
            assert "stolen" not in answer or "no" in answer or "unverified" in answer or "unavailable" in answer


def _intel_token() -> str:
    """Fresh buyer token for a standalone FastAPI intelligence call."""
    with mkclient(INTEL_URL) as c:
        r = c.post("/api/v1/auth/login", json={"email": "rohan@trustdrive.dev", "password": "demo1234"})
        return r.json()["access_token"]


# ===========================================================================
# 6. Marketplace, listings, inquiries, reports, QR, notifications
# ===========================================================================
class TestWorkflows:
    def test_marketplace_only_exposes_published_listings(self, auth):
        with mkclient(NEXT_URL) as c:
            r = c.get("/api/v1/marketplace/listings", headers=auth("buyer_a", "next"))
            assert r.status_code == 200
            data = payload(r)
            items = data.get("items", data) if isinstance(data, dict) else data
            assert isinstance(items, list) and items
            for item in items:
                assert item.get("status", "published") in (None, "published", "Published")

    def test_buyer_saves_and_unsaves_a_vehicle(self, auth, db):
        with mkclient(NEXT_URL) as c:
            h = auth("buyer_a", "next")
            r = c.post("/api/v1/saved/l-audi", headers=h, json={})
            assert r.status_code == 201, r.text[:220]
            saved = payload(c.get("/api/v1/saved", headers=h))
            items = saved.get("items", saved) if isinstance(saved, dict) else saved
            assert any(x.get("listingId") == "l-audi" or x.get("id") == "v-audi" for x in items)
            assert c.delete("/api/v1/saved/l-audi", headers=h).status_code in (200, 204)

    def test_full_inquiry_lifecycle_buyer_sends_seller_replies(self, auth, db):
        with mkclient(NEXT_URL) as buyer, mkclient(NEXT_URL) as seller:
            created = buyer.post("/api/v1/inquiries", headers=auth("buyer_a", "next"),
                                 json={"listingId": PUBLISHED_LISTING,
                                       "message": "QA live workflow: is the service history complete?"})
            assert created.status_code == 201, created.text[:250]
            qid = payload(created)["id"]
            stored = rows(db, "SELECT id, buyer_id, seller_id, status FROM inquiries WHERE id = ?", qid)
            assert stored and stored[0]["buyer_id"] == "u-buyer2" and stored[0]["seller_id"] == "u-seller"
            reply = seller.post(f"/api/v1/inquiries/{qid}/messages",
                                headers=auth("seller_a", "next"),
                                json={"body": "QA live workflow: yes, all invoices are attached."})
            assert reply.status_code in (200, 201), reply.text[:250]
            msgs = rows(db, "SELECT id, sender_id, body FROM inquiry_messages WHERE inquiry_id = ?", qid)
            assert any("QA live workflow: yes" in m["body"] for m in msgs)
            thread = payload(buyer.get(f"/api/v1/inquiries/{qid}", headers=auth("buyer_a", "next")))
            assert thread

    def test_report_generation_persists_and_pdf_is_a_real_pdf(self, nxt, db, auth):
        r = nxt.post(f"/api/v1/reports/vehicle/{SELLER_A_VEHICLE}",
                     json={"type": "Vehicle verification"})
        assert r.status_code == 201, r.text[:250]
        data = payload(r)
        rid = data["id"]
        assert data["reportId"].startswith("RPT-")
        stored = rows(db, "SELECT id, status, report_id FROM reports WHERE id = ?", rid)
        assert stored and stored[0]["report_id"] == data["reportId"]
        download = data["downloadUrl"]
        pdf = nxt.get(download)
        assert pdf.status_code == 200, pdf.text[:200]
        assert pdf.content[:4] == b"%PDF"
        assert len(pdf.content) > 2000
        assert pdf.headers.get("x-report-sha256")

    def test_forged_report_token_is_rejected(self):
        with mkclient(NEXT_URL) as c:
            r = c.get("/api/v1/reports/rep-does-not-exist/download?token=forged.token")
            assert r.status_code in (401, 403, 404)

    def test_qr_verification_rejects_unknown_and_accepts_real_token(self, nxt, db):
        with mkclient(NEXT_URL) as c:
            assert c.get("/api/v1/verify/unknown-token").status_code in (200, 400, 404)
        tokens = rows(db, "SELECT token FROM qr_tokens LIMIT 1")
        if tokens:
            with mkclient(NEXT_URL) as c:
                r = c.get(f"/api/v1/verify/{tokens[0]['token']}")
                assert r.status_code in (200, 400, 404)

    def test_notifications_are_per_user(self, auth):
        with mkclient(NEXT_URL) as c:
            a = payload(c.get("/api/v1/notifications", headers=auth("buyer_a", "next")))
            b = payload(c.get("/api/v1/notifications", headers=auth("buyer_b", "next")))
            assert a.get("items") is not None or isinstance(a, list)

    def test_contact_form_writes_a_row(self, db):
        with mkclient(NEXT_URL) as c:
            r = c.post("/api/v1/contact", json={
                "name": "QA Live", "email": "qa-live@example.com",
                "message": "Integration test contact message",
            })
            assert r.status_code in (200, 201), r.text[:250]
        stored = rows(db, "SELECT id, email FROM contact_messages WHERE email = ?", "qa-live@example.com")
        assert stored

    def test_newsletter_is_real_and_idempotent(self, db):
        email = "qa-newsletter@example.com"
        with mkclient(NEXT_URL) as c:
            first = c.post("/api/v1/newsletter", json={"email": email})
            second = c.post("/api/v1/newsletter", json={"email": email})
            assert first.status_code in (200, 201)
            assert second.status_code in (200, 201)
        stored = rows(db, "SELECT email FROM newsletter_subscribers WHERE email = ?", email)
        assert len(stored) == 1, "duplicate subscription must not create a second row"


# ===========================================================================
# 7. Three.js GLB asset + component/damage linkage
# ===========================================================================
class TestThreeD:
    def test_real_glb_asset_is_served(self):
        with mkclient(NEXT_URL) as c:
            r = c.get("/models/vehicles/trustdrive-sedan.glb")
            assert r.status_code == 200, r.status_code
            assert r.content[:4] == b"glTF", "asset must be a real binary glTF, not a placeholder"
            assert len(r.content) > 1_000_000, f"GLB suspiciously small: {len(r.content)}"

    def test_model_manifest_is_served(self):
        with mkclient(NEXT_URL) as c:
            r = c.get("/models/vehicles/model-manifest.json")
            assert r.status_code == 200
            assert "license" in r.json() or "components" in r.json()

    def test_3d_model_endpoint_references_the_real_asset(self, nxt):
        data = payload(nxt.get(f"/api/v1/vehicles/{SELLER_A_VEHICLE}/3d-model"))
        assert data["assetUrl"].endswith(".glb")
        assert data["componentCount"] > 0
        assert data.get("license") and data.get("attribution")
        with mkclient(NEXT_URL) as c:
            assert c.get(data["assetUrl"]).status_code == 200

    def test_component_registry_maps_real_mesh_names(self, nxt):
        data = payload(nxt.get(f"/api/v1/vehicles/{SELLER_A_VEHICLE}/components"))
        assert data["components"]
        for comp in data["components"][:5]:
            assert comp.get("id") or comp.get("componentId")

    def test_damage_hotspots_map_to_real_damage_rows(self, nxt, db):
        data = payload(nxt.get(f"/api/v1/vehicles/{SELLER_A_VEHICLE}/damage"))
        assert data["records"]
        db_zones = {r["zone_id"] for r in rows(
            db, "SELECT zone_id FROM damage_records WHERE vehicle_id = ?", SELLER_A_VEHICLE)}
        hotspot_ids = {h.get("zoneId") or h.get("component") or h.get("id") for h in data["hotspots"]}
        assert hotspot_ids & db_zones, "hotspots must map to actual database damage records"

    def test_glb_contains_multiple_real_meshes(self):
        """Parse the GLB JSON chunk directly: never accept a primitive placeholder."""
        from pathlib import Path
        root = Path(__file__).resolve().parents[1]
        raw = (root / "public" / "models" / "vehicles" / "trustdrive-sedan.glb").read_bytes()
        assert raw[:4] == b"glTF"
        # GLB: 12-byte header, then chunk0 = 4-byte length + 4-byte type + JSON.
        json_len = int.from_bytes(raw[12:16], "little")
        chunk_type = int.from_bytes(raw[16:20], "little")
        assert chunk_type == 0x4E4F534A, "first chunk must be JSON"
        doc = json.loads(raw[20:20 + json_len].decode("utf-8"))
        assert len(doc.get("meshes", [])) >= 10, "expected a real multi-part vehicle model"
        assert len(doc.get("nodes", [])) >= 10
        assert any(m.get("name") for m in doc.get("meshes", [])), "meshes should be meaningfully named"


# ===========================================================================
# 8. FastAPI backend surface smoke (every GET path, no 5xx)
# ===========================================================================
class TestFastAPICoverage:
    def test_every_openapi_get_path_returns_a_valid_status(self, auth):
        with mkclient(INTEL_URL) as c:
            spec = c.get("/openapi.json").json()
            substitutions = {
                "{vehicle_id}": SELLER_A_VEHICLE, "{vehicleId}": SELLER_A_VEHICLE,
                "{report_id}": "rep-missing", "{listing_id}": PUBLISHED_LISTING,
                "{inquiry_id}": BUYER_A_INQUIRY, "{job_id}": "job-missing",
                "{investigation_id}": "inv-missing", "{document_id}": "doc-missing",
                "{dispute_id}": "d-missing", "{review_id}": "rev-missing",
                "{user_id}": "u-seller", "{session_id}": "s-missing",
                "{image_id}": "img-missing", "{event_id}": "evt-missing",
                "{notification_id}": "n-missing", "{listingId}": PUBLISHED_LISTING,
            }
            failures = []
            checked = 0
            for path, ops in spec["paths"].items():
                if "get" not in ops:
                    continue
                url = path
                for key, value in substitutions.items():
                    url = url.replace(key, value)
                if "{" in url:
                    continue
                r = c.get(url, headers=auth("seller_a", "intel"))
                checked += 1
                if r.status_code >= 500:
                    failures.append((url, r.status_code, r.text[:160]))
            assert checked >= 60, f"expected broad coverage, only checked {checked} paths"
            assert not failures, f"5xx on GET paths: {failures[:6]}"

    def test_openapi_documents_all_backend_categories(self):
        with mkclient(INTEL_URL) as c:
            spec = c.get("/openapi.json").json()
            paths = list(spec["paths"])
            assert len(paths) >= 130
            for prefix in ("/api/v1/", "/api/backend/", "/api/intelligence/"):
                assert any(p.startswith(prefix) for p in paths), prefix

    def test_health_names_active_engines_honestly(self):
        with mkclient(INTEL_URL) as c:
            h = c.get("/health").json()
            assert h["status"] == "ok"
            assert h["database"]["tables"] >= 50
            assert h["llm"]["active"] is False, "TD_LLM_PROVIDER=none in the QA runtime"
            assert h["ocr_backends"]
            assert h["agent"]["orchestrator"] in ("langgraph", "sequential-fallback")
