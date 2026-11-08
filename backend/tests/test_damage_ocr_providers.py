"""Tests for damage CV detection, document OCR, fraud metadata, and provider status.

The test DB is built and seeded by ``conftest`` (which also runs the additive
AI-field migration), so the new columns (detection_*, ocr_*) are present.
"""
from __future__ import annotations

import io
import json

from fastapi.testclient import TestClient
from PIL import Image  # type: ignore

from app.main import app
from app.security import sign_token

# Mint a real seller JWT for the seeded u-seller account (owns every demo vehicle).
SELLER_TOKEN = sign_token("u-seller", "seller", "Samarth Darak")
client = TestClient(app, headers={"Authorization": f"Bearer {SELLER_TOKEN}"})


def _make_image(file_key: str, color=(120, 90, 60)):
    """Write a tiny PNG under the test upload dir and return its file_key."""
    from app.config import settings
    path = settings.upload_dir / file_key
    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (32, 32), color)
    img.save(path, format="PNG")
    return file_key


def _add_photo(vehicle_id: str, file_key: str) -> str:
    r = client.post(f"/api/v1/vehicles/{vehicle_id}/images", json={
        "file_key": file_key, "kind": "photo", "sha256": "a" * 64,
    })
    return r.json()["photo"]["id"]


def test_detect_returns_unavailable_for_non_car_category():
    # v-demo-bike is a petrol_motorcycle -> no car damage CV detector.
    fk = _make_image("test-noncar.png")
    photo_id = _add_photo("v-demo-bike", fk)
    r = client.post(f"/api/v1/vehicles/v-demo-bike/photos/{photo_id}/detect")
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is False
    assert "car categories" in body["reason"]


def test_detect_creates_candidate_damage_records_for_car(monkeypatch):
    # v-demo-car is a passenger_car -> car damage CV applies. Avoid loading the
    # 40MB weights by stubbing the YOLO adapter.
    import app.routers.vehicles as vmod

    monkeypatch.setattr(vmod.yolo, "status", lambda: {
        "available": True, "engine": "ultralytics", "version": "yolo-1.0"})
    monkeypatch.setattr(vmod.yolo, "detect", lambda path, conf=0.35, iou=0.45: {
        "available": True, "version": "yolo-1.0", "limitations": [],
        "detections": [
            {"label": "dent", "class_id": 0, "confidence": 0.82, "box": [10, 20, 30, 40]},
            {"label": "scratch", "class_id": 1, "confidence": 0.61, "box": [5, 5, 12, 12]},
        ],
    })

    fk = _make_image("test-car.png")
    photo_id = _add_photo("v-demo-car", fk)
    r = client.post(f"/api/v1/vehicles/v-demo-car/photos/{photo_id}/detect")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["available"] is True
    assert len(body["candidateDamageIds"]) == 2
    assert body["modelVersion"] == "yolo-1.0"
    for cid in body["candidateDamageIds"]:
        # Each candidate can be reviewed (verified / rejected).
        rev = client.patch(f"/api/v1/vehicles/v-demo-car/damage/{cid}/review",
                           json={"status": "verified", "severity": "high"})
        assert rev.status_code == 200
        assert rev.json()["status"] == "verified"


def test_detect_review_rejects_candidate(monkeypatch):
    import app.routers.vehicles as vmod

    # Build a candidate row through the detect path on a car (electric_car).
    monkeypatch.setattr(vmod.yolo, "status", lambda: {
        "available": True, "engine": "ultralytics", "version": "yolo-1.0"})
    monkeypatch.setattr(vmod.yolo, "detect", lambda path, conf=0.35, iou=0.45: {
        "available": True, "version": "yolo-1.0", "limitations": [],
        "detections": [{"label": "crack", "class_id": 2, "confidence": 0.9, "box": [1, 1, 2, 2]}]})
    fk = _make_image("test-car2.png")
    photo_id = _add_photo("v-demo-ecar", fk)
    det = client.post(f"/api/v1/vehicles/v-demo-ecar/photos/{photo_id}/detect").json()
    cid = det["candidateDamageIds"][0]
    rev = client.patch(f"/api/v1/vehicles/v-demo-ecar/damage/{cid}/review",
                       json={"status": "rejected"})
    assert rev.status_code == 200
    assert rev.json()["status"] == "rejected"


def test_ocr_endpoint_returns_structured_json():
    # The seeded document doc1 (v-test) has no file on disk, so we add a real
    # image document owned by the seller. Whether PaddleOCR is installed or not,
    # the response is a structured JSON (200 with fields, or 409 available:False).
    fk = _make_image("test-doc.png")
    # register a document with a real file key
    resp = client.post("/api/v1/vehicles/v-test/documents", json={
        "type": "rc", "file_name": "rc.png", "file_key": fk, "sha256": "b" * 64})
    doc_id = resp.json()["document"]["id"]
    r = client.post(f"/api/v1/vehicles/v-test/documents/{doc_id}/ocr")
    assert r.status_code in (200, 409)
    body = r.json()
    assert isinstance(body, dict)
    if r.status_code == 200:
        assert "fields" in body and "text" in body
    else:
        assert body["available"] is False
        assert "reason" in body


def test_ocr_manual_correction_persists_and_marks_reviewed():
    fk = _make_image("test-doc2.png")
    resp = client.post("/api/v1/vehicles/v-test/documents", json={
        "type": "insurance", "file_name": "ins.png", "file_key": fk, "sha256": "c" * 64})
    doc_id = resp.json()["document"]["id"]
    r = client.patch(f"/api/v1/vehicles/v-test/documents/{doc_id}/ocr", json={
        "fields": {"registrationNo": "MH01AB1234", "ownerName": "Samarth Darak"}})
    assert r.status_code == 200
    assert r.json()["ocr_status"] == "reviewed"


def test_fraud_model_status_is_experimental():
    r = client.get("/api/v1/ai/fraud/model-status")
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "experimental"
    assert body["name"] == "mileage_xgb"
    assert "disclaimer" in body
    # The synthetic-demo model file exists in the repo, so available should be True.
    assert body["available"] is True
    assert "synthetic" in body["training_data"]


def test_provider_status_endpoints_return_structured_json():
    for path in ("/api/v1/system/notifications", "/api/v1/system/registry",
                 "/api/v1/system/storage"):
        r = client.get(path)
        assert r.status_code == 200, (path, r.text)
        assert isinstance(r.json(), dict)
    # Storage backend must be one of the two real backends.
    storage = client.get("/api/v1/system/storage").json()
    assert storage["backend"] in ("local", "s3")
    # Registry enumerates each source as available|blocked (honest status).
    registry = client.get("/api/v1/system/registry").json()
    for src in ("vahan", "insurer", "theft"):
        assert registry["sources"][src]["status"] in ("available", "blocked")
    # Notifications always report an active provider.
    notifications = client.get("/api/v1/system/notifications").json()
    assert notifications["provider"] in ("log-only", "smtp")
