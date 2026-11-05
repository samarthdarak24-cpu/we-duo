"""Backend contract tests: every feature category, RBAC and persistence."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app import db
from app.main import app

client = TestClient(app, headers={"X-Service-Token": "qa-test-service-token"})


def login(email: str, password: str = "demo1234") -> str:
    r = client.post("/api/backend/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


SELLER = login("seller@test.dev")
BUYER = login("buyer@test.dev")
ADMIN = login("admin@test.dev")


def test_backend_index_lists_every_category():
    body = client.get("/api/backend").json()
    for key in ("authentication", "users", "vehicles", "documents", "history", "mileage",
                "verification", "ai_analysis", "damage_inspection", "listings", "search",
                "saved", "comparisons", "inquiries", "reports", "qr_verification",
                "notifications", "audit_logs"):
        assert key in body["categories"]


def test_login_me_and_bad_password():
    me = client.get("/api/backend/auth/me", headers=auth(SELLER))
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "seller@test.dev"
    assert "password_hash" not in me.json()["user"]
    bad = client.post("/api/backend/auth/login",
                      json={"email": "seller@test.dev", "password": "wrong-pass"})
    assert bad.status_code == 401


def test_register_new_buyer_issues_token():
    r = client.post("/api/backend/auth/register", json={
        "name": "New Buyer", "email": "new-buyer@test.dev",
        "password": "demo1234", "role": "buyer",
    })
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    me = client.get("/api/backend/auth/me", headers=auth(token))
    assert me.json()["user"]["role"] == "buyer"
    dup = client.post("/api/backend/auth/register", json={
        "name": "Dup", "email": "new-buyer@test.dev", "password": "demo1234",
    })
    assert dup.status_code == 409


def test_seller_creates_vehicle_and_duplicate_is_rejected():
    payload = {
        "make": "Tata", "model": "Nexon", "year": 2021, "reg_no": "MH03EF9012",
        "vin": "1HGCM82633A004353", "fuel": "petrol", "transmission": "manual",
        "km_claimed": 30000, "asking_price": 800000, "location": "Mumbai",
    }
    created = client.post("/api/backend/vehicles", json=payload, headers=auth(SELLER))
    assert created.status_code == 201, created.text
    vid = created.json()["vehicle"]["id"]
    dup = client.post("/api/backend/vehicles", json=payload, headers=auth(SELLER))
    assert dup.status_code == 409
    bad_vin = client.post("/api/backend/vehicles", json={
        **payload, "reg_no": "MH03EF9013", "vin": "TOO-SHORT",
    }, headers=auth(SELLER))
    assert bad_vin.status_code == 422
    # Persisted: readable again.
    got = client.get(f"/api/backend/vehicles/{vid}", headers=auth(SELLER))
    assert got.status_code == 200 and got.json()["vehicle"]["reg_no"] == "MH03EF9012"


def test_buyer_cannot_create_vehicle_or_read_admin_audit():
    r = client.post("/api/backend/vehicles", json={
        "make": "X", "model": "Y", "year": 2020, "reg_no": "MH04GH3456",
    }, headers=auth(BUYER))
    assert r.status_code == 403
    audit = client.get("/api/backend/audit", headers=auth(SELLER))
    assert audit.status_code == 403
    admin_audit = client.get("/api/backend/audit", headers=auth(ADMIN))
    assert admin_audit.status_code == 200
    assert admin_audit.json()["total"] >= 1


def test_mileage_decrease_is_flagged_and_creates_finding():
    before = client.get("/api/backend/vehicles/v-test/findings", headers=auth(SELLER)).json()["total"]
    r = client.post("/api/backend/vehicles/v-test/mileage", json={
        "km": 1000, "date": "2024-01-15", "source": "seller_claim",
    }, headers=auth(SELLER))
    assert r.status_code == 201, r.text
    assert r.json()["flagged"] is True
    after = client.get("/api/backend/vehicles/v-test/findings", headers=auth(SELLER)).json()["total"]
    assert after == before + 1


def test_listing_publish_and_marketplace_browse():
    created = client.post("/api/backend/seller/listings", json={
        "vehicle_id": "v-test2", "headline": "Honda City 2020",
        "description": "Reliable sedan", "location": "Pune",
    }, headers=auth(SELLER))
    # l-test2 already exists for v-test2 in the seed.
    assert created.status_code == 409
    publish = client.post("/api/backend/seller/listings/l-test2/publish", headers=auth(SELLER))
    assert publish.status_code == 200, publish.text
    assert publish.json()["listing"]["status"] == "published"
    browse = client.get("/api/backend/marketplace/listings")
    assert browse.status_code == 200
    assert browse.json()["total"] >= 1
    assert all(i["listing_status"] == "published" for i in browse.json()["items"])


def test_saved_save_list_and_unsave():
    saved = client.post("/api/backend/saved", json={"listing_id": "l-test2"}, headers=auth(BUYER))
    assert saved.status_code == 201
    again = client.post("/api/backend/saved", json={"listing_id": "l-test2"}, headers=auth(BUYER))
    assert again.json()["created"] is False
    listed = client.get("/api/backend/saved", headers=auth(BUYER)).json()
    assert listed["total"] >= 1
    removed = client.delete("/api/backend/saved/l-test2", headers=auth(BUYER))
    assert removed.status_code == 204
    assert client.get("/api/backend/saved", headers=auth(BUYER)).json()["total"] == 0


def test_compare_two_to_four_vehicles():
    r = client.post("/api/backend/compare", json={"vehicle_ids": ["v-test", "v-test2"]})
    assert r.status_code == 200
    assert r.json()["count"] == 2
    too_many = client.post("/api/backend/compare",
                           json={"vehicle_ids": ["v-test", "v-test2", "v-test", "v-test2"]})
    assert too_many.status_code == 422


def test_inquiry_flow_buyer_to_seller():
    created = client.post("/api/backend/inquiries", json={
        "listing_id": "l-test2", "message": "Is the service history complete?",
    }, headers=auth(BUYER))
    assert created.status_code == 201, created.text
    iid = created.json()["inquiry"]["id"]
    seller_list = client.get("/api/backend/inquiries", headers=auth(SELLER)).json()
    assert any(i["id"] == iid for i in seller_list["items"])
    msg = client.post(f"/api/backend/inquiries/{iid}/messages", json={
        "body": "Yes, all services are documented.",
    }, headers=auth(SELLER))
    assert msg.status_code == 201
    status = client.patch(f"/api/backend/inquiries/{iid}/status",
                          json={"status": "accepted"}, headers=auth(SELLER))
    assert status.status_code == 200
    assert status.json()["inquiry"]["status"] == "accepted"
    # A third party cannot read the thread.
    outsider = client.get(f"/api/backend/inquiries/{iid}", headers=auth(ADMIN))
    assert outsider.status_code == 200  # admin is allowed


def test_report_generates_real_pdf_and_verifies_hash():
    created = client.post("/api/backend/reports", json={"vehicle_id": "v-test"},
                          headers=auth(SELLER))
    assert created.status_code == 201, created.text
    report = created.json()["report"]
    assert report["pdf_hash"] and report["file_key"]
    download = client.get(f"/api/backend/reports/{report['id']}/download")
    assert download.status_code == 200
    assert download.headers["content-type"] == "application/pdf"
    assert download.content.startswith(b"%PDF")


def test_share_token_and_public_verification():
    share = client.post("/api/backend/listings/l-test2/share", headers=auth(SELLER))
    assert share.status_code == 200, share.text
    token = share.json()["token"]
    verify = client.get(f"/api/backend/verify/{token}")
    assert verify.status_code == 200
    assert verify.json()["status"] == "valid"
    assert "disclosure" in verify.json()
    revoke = client.delete("/api/backend/listings/l-test2/share", headers=auth(SELLER))
    assert revoke.status_code == 204
    after = client.get(f"/api/backend/verify/{token}")
    assert after.status_code == 410


def test_notifications_are_owner_scoped():
    rows = client.get("/api/backend/notifications", headers=auth(SELLER)).json()
    assert rows["total"] >= 1
    first = rows["items"][0]
    assert client.post(f"/api/backend/notifications/{first['id']}/read",
                       headers=auth(BUYER)).status_code == 403
    assert client.post(f"/api/backend/notifications/{first['id']}/read",
                       headers=auth(SELLER)).status_code == 200
    assert client.post("/api/backend/notifications/read-all",
                       headers=auth(SELLER)).json()["updated"] >= 0


def test_history_correction_appends_and_never_overwrites():
    r = client.post("/api/backend/vehicles/v-test/history/h1/correction", json={
        "title": "Corrected service date", "description": "Invoice shows a different date.",
        "reason": "Original OCR misread the year.",
    }, headers=auth(SELLER))
    assert r.status_code == 201, r.text
    assert r.json()["supersedes"] == "h1"
    original = client.get("/api/backend/vehicles/v-test/history", headers=auth(SELLER)).json()
    original_event = next(e for e in original["items"] if e["id"] == "h1")
    assert original_event["status"] == "verified"  # unchanged


def test_verification_run_persists_results_and_trust():
    r = client.post("/api/backend/vehicles/v-test/verify", headers=auth(SELLER))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["run_id"] and body["checks"]
    assert 0 <= body["trust"]["score"] <= 100
    listed = client.get("/api/backend/vehicles/v-test/verification", headers=auth(SELLER)).json()
    assert listed["runs"] and listed["results"]


def test_admin_kyc_and_job_retry():
    kyc = client.patch("/api/backend/users/u-buyer/kyc",
                       json={"status": "verified", "note": "documents checked"},
                       headers=auth(ADMIN))
    assert kyc.status_code == 200
    assert kyc.json()["user"]["kyc_status"] == "verified"
    seller_kyc = client.patch("/api/backend/users/u-buyer/kyc",
                              json={"status": "verified"}, headers=auth(SELLER))
    assert seller_kyc.status_code == 403


def test_document_soft_delete_hides_row_but_retains_evidence():
    created = client.post("/api/backend/vehicles/v-test/documents", json={
        "type": "puc", "file_name": "puc-soft.pdf", "file_key": "vehicles/puc-soft.pdf",
        "sha256": "c" * 64,
    }, headers=auth(SELLER))
    assert created.status_code == 201, created.text
    doc_id = created.json()["document"]["id"]

    deleted = client.delete(f"/api/backend/vehicles/v-test/documents/{doc_id}",
                            headers=auth(SELLER))
    assert deleted.status_code == 204

    listed = client.get("/api/backend/vehicles/v-test/documents", headers=auth(SELLER)).json()
    assert all(d["id"] != doc_id for d in listed["items"])

    row = db.read("documents", where="id = :id", params={"id": doc_id}, limit=1)[0]
    assert row["deleted_at"], "the row must be retained with deleted_at set"

    again = client.delete(f"/api/backend/vehicles/v-test/documents/{doc_id}",
                          headers=auth(SELLER))
    assert again.status_code == 404


def test_user_soft_delete_revokes_access_immediately():
    email = "soft-delete@test.dev"
    reg = client.post("/api/v1/auth/register", json={
        "name": "Soft Delete", "email": email, "password": "demo1234", "role": "buyer",
    })
    assert reg.status_code == 201, reg.text
    token = reg.json()["access_token"]
    uid = reg.json()["user"]["id"]

    assert client.get("/api/v1/users/me", headers=auth(token)).status_code == 200
    assert client.delete("/api/backend/users/me", headers=auth(token)).status_code == 204

    assert client.get("/api/v1/users/me", headers=auth(token)).status_code == 401
    assert client.post("/api/v1/auth/login", json={
        "email": email, "password": "demo1234",
    }).status_code == 401

    row = db.read("users", where="id = :id", params={"id": uid}, limit=1)[0]
    assert row["deleted_at"]


def test_notifications_support_offset_pagination():
    body = client.get("/api/backend/notifications",
                      params={"limit": 1, "offset": 0},
                      headers=auth(SELLER)).json()
    assert body["total"] >= 1
    assert len(body["items"]) <= 1
    assert body["limit"] == 1 and body["offset"] == 0
    assert "unread" in body
