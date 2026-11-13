"""HTTP contract tests with FastAPI TestClient (HTTPX under the hood)."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, headers={"X-Service-Token": "qa-test-service-token"})


def test_health_is_ok_and_names_active_backends():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["database"]["database"] == "connected"
    assert len(body["ocr_backends"]) == 5
    assert any(b["engine"] == "rapidocr" and b["available"] for b in body["ocr_backends"])
    assert len(body["agent"]["nodes"]) == 16
    assert body["agent"]["conditional"] is True
    assert body["agent"]["category_profiles"]["passenger_car"]["count"] == 15
    assert body["agent"]["category_profiles"]["electric_scooter"]["count"] == 16
    assert body["vehicle_categories"]["trust_version"] == "trust-v2-multicategory"
    assert len(body["vehicle_categories"]["implemented"]) == 20
    assert body["worker"]["backend"] == "db-backed"
    assert body["llm"]["active"] is False


def test_root_points_at_openapi():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["openapi"] == "/openapi.json"
    assert client.get("/openapi.json").status_code == 200


def test_capabilities_reports_real_entity_counts():
    r = client.get("/api/intelligence/capabilities")
    assert r.status_code == 200
    body = r.json()
    assert body["entity_counts"]["vehicles"] >= 1
    assert body["entity_counts"]["documents"] >= 3
    assert body["trust_score"]["version"] == "trust-v2-multicategory"
    assert body["trust_score"]["profiles"]["electric_scooter"] != \
        body["trust_score"]["profiles"]["passenger_car"]
    assert "electric_scooter" in body["categories"]["implemented"]
    assert body["policy"]


def test_fraud_detection_finds_seeded_rollback():
    r = client.post("/api/intelligence/fraud/detect", json={"vehicle_id": "v-test"})
    assert r.status_code == 200
    body = r.json()
    assert body["finding_count"] > 0
    types = {f["anomaly_type"] for rep in body["reports"] for f in rep["findings"]}
    assert "mileage_decrease" in types
    assert "duplicate_document" in types
    assert "identity_mismatch" in types
    assert "disclaimer" in body


def test_trust_score_is_deterministic_and_versioned():
    a = client.get("/api/intelligence/trust-score/v-test").json()
    b = client.get("/api/intelligence/trust-score/v-test").json()
    assert 0 <= a["score"] <= 100
    assert a["score"] == b["score"]
    assert len(a["contributions"]) == 6
    assert a["version"]
    assert "not" in a["missing_data_policy"].lower()


def test_investigation_runs_all_conditional_nodes_and_requests_human_review():
    r = client.post("/api/intelligence/investigate", json={
        "vehicle_id": "v-test",
        "question": "Is this BMW safe to consider buying?",
    })
    assert r.status_code == 200
    body = r.json()
    assert len(body["nodes"]) == 15
    assert body["category_id"] == "passenger_car"
    assert body["orchestrator"] in ("langgraph", "sequential-fallback")
    assert body["human_review"]["required"] is True
    assert body["evidence_ids"]
    assert body["model_versions"]["trust_score"]
    assert body["answer"]["recommended_next_action"]
    assert "no LLM conclusion" in body["answer"]["disclaimer"] or "llm_status" in body["answer"]


def test_job_lifecycle_enqueue_run_and_read():
    created = client.post("/api/intelligence/jobs", json={
        "type": "ai_analysis", "vehicle_id": "v-test",
    })
    assert created.status_code == 200
    jid = created.json()["job_id"]

    dup = client.post("/api/intelligence/jobs", json={
        "type": "ai_analysis", "vehicle_id": "v-test",
        "idempotency_key": "fixed-key",
    })
    dup2 = client.post("/api/intelligence/jobs", json={
        "type": "ai_analysis", "vehicle_id": "v-test",
        "idempotency_key": "fixed-key",
    })
    assert dup.json()["job_id"] == dup2.json()["job_id"]

    run = client.post("/api/intelligence/jobs/run-one")
    assert run.status_code == 200
    assert run.json()["result"] is not None

    listed = client.get("/api/intelligence/jobs")
    assert listed.status_code == 200
    assert any(j["id"] == jid for j in listed.json()["jobs"])


def test_unsupported_job_type_is_rejected():
    r = client.post("/api/intelligence/jobs", json={"type": "nope", "vehicle_id": "v-test"})
    assert r.status_code == 422


def test_review_queue_and_human_resolution():
    client.post("/api/intelligence/investigate", json={"vehicle_id": "v-test"})
    queue = client.get("/api/intelligence/review").json()
    assert queue["count"] >= 1
    rid = queue["pending"][0]["id"]
    r = client.post(f"/api/intelligence/review/{rid}/resolve", json={
        "decision": "approved", "reviewer": "inspector-1", "note": "Verified original RC",
    })
    assert r.status_code == 200
    assert r.json()["decision"] == "approved"
    # DB status vocabulary is open|assigned|resolved|rejected.
    assert r.json()["status"] == "resolved"
    bad = client.post(f"/api/intelligence/review/{rid}/resolve", json={
        "decision": "invented", "reviewer": "x",
    })
    assert bad.status_code == 422


def test_integrity_endpoint_never_claims_a_missing_file_is_verified():
    r = client.get("/api/intelligence/integrity/v-test")
    assert r.status_code == 200
    body = r.json()
    assert body["integrity_status"] in ("drift_detected", "partially_verified", "verified")
    assert body["files_unavailable"]
    assert "does NOT prove" in body["disclaimer"]


def test_damage_endpoint_requires_inspector_validation():
    r = client.get("/api/intelligence/damage/v-test")
    assert r.status_code == 200
    assert r.json()["damage_records"]
    assert "inspector" in r.json()["damage_cv"]


def test_sync_document_processing_validates_the_file():
    r = client.post("/api/intelligence/documents/process", json={
        "document_id": "doc1", "vehicle_id": "v-test", "path": "does-not-exist.pdf",
        "async": False,
    })
    assert r.status_code == 422


def test_chat_uses_grounded_llm_answer(monkeypatch):
    from app import llm

    class Result:
        available = True
        provider = "local-transformers"
        model = "stub-model"
        conclusion = "The mileage decreased; the insurance record is missing."
        grounded = True
        reason = "Grounded in supplied evidence."
        unsupported_claims: list[str] = []

    monkeypatch.setattr(llm, "generate_explanation", lambda q, f: Result())
    r = client.post("/api/intelligence/chat",
                    json={"vehicle_id": "v-test", "question": "Summarise the records."})
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "local-transformers"
    assert body["grounded"] is True
    assert body["answer"].startswith("The mileage decreased")
    assert body["citations"]


def test_chat_falls_back_when_llm_rejects(monkeypatch):
    from app import llm

    class Result:
        available = True
        provider = "local-transformers"
        model = "stub-model"
        conclusion = None
        grounded = False
        reason = "Rejected: policy"
        unsupported_claims = ["policy:safe"]

    monkeypatch.setattr(llm, "generate_explanation", lambda q, f: Result())
    r = client.post("/api/intelligence/chat",
                    json={"vehicle_id": "v-test", "question": "Is it safe to buy?"})
    body = r.json()
    assert body["llm_rejected"] is True
    assert body["provider"] == "deterministic"
    assert "Sources:" in body["answer"]


def test_chat_facts_prefer_latest_canonical_trust_snapshot():
    """The AI narrative must quote the same score as the Next.js vehicle page.

    Regression: Python recomputed its own score (75/100) while the persisted
    Next.js snapshot said 0/100, so chat contradicted the report. `_chat_facts`
    now reads the newest `trust_scores` row, and returns a plain dict (the
    previous `.model_dump()` double-call raised AttributeError).
    """
    from app import db
    from app.main import _chat_facts

    for row in (
        {"id": "ts-old", "vehicle_id": "v-test", "score": 88, "band": "strong",
         "version": "trust-v2-multicategory", "computed_at": "2025-01-01T00:00:00Z"},
        {"id": "ts-new", "vehicle_id": "v-test", "score": 7, "band": "high_risk",
         "version": "trust-v2-multicategory", "computed_at": "2026-01-01T00:00:00Z"},
    ):
        written, reason = db.insert("trust_scores", row)
        assert written, reason

    facts = _chat_facts("v-test")
    assert isinstance(facts["trust"], dict)
    assert facts["trust"]["score"] == 7
    assert facts["trust"]["band"] == "high_risk"
    assert facts["trust"]["band_label"] == "High risk"
    assert facts["trust"]["snapshot_id"] == "ts-new"
    assert facts["trust"]["snapshot_version"] == "trust-v2-multicategory"
    assert facts["vehicle_identity_status"] == "verified"


def test_blockchain_adapter_is_honest_and_not_claimed():
    body = client.get("/api/intelligence/blockchain/status").json()
    assert body["anchoring_claimed"] is False
    assert "not claimed" in body["note"].lower() or "NOT claimed" in body["note"]


def test_local_chain_integrity_is_reported_without_anchoring():
    body = client.get("/api/intelligence/blockchain/integrity/v-test").json()
    assert body["method"] == "local-sha256-chain"
    assert body["status"] in ("intact", "broken", "no_records")
    assert "not an on-chain anchor" in body["note"]
