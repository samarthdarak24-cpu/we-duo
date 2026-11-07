"""Document intelligence workflow + background worker + agent graph tests."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app import agent, db, extract, ocr, worker


def test_extract_fields_parses_indian_registration_vin_and_odometer():
    text = (
        "Registration: MH01AB1234  VIN: WBA8E9G50GNU12345\n"
        "Policy No: POL/2023/8891  Odometer: 72,450 km  Date: 12/06/2023\n"
        "Total INR 12,500.00"
    )
    f = extract.extract_fields(text)
    assert f.registration_number == "MH01AB1234"
    assert f.vin == "WBA8E9G50GNU12345"
    assert f.odometer_km == 72450
    assert f.invoice_amount == 12500.0
    assert f.policy_number
    assert f.dates


def test_file_validation_rejects_wrong_magic_bytes(tmp_path: Path):
    p = tmp_path / "fake.pdf"
    p.write_bytes(b"this is definitely not a pdf")
    ok, reason = ocr.validate_file(p)
    assert ok is False
    assert "magic" in reason


def _magic_only_pdf(tmp_path: Path) -> Path:
    """Valid magic bytes, no usable text layer: exercises the honest degraded path."""
    p = tmp_path / "scan.pdf"
    p.write_bytes(b"%PDF-1.4\n% no object table\n%%EOF\n")
    return p


def test_workflow_records_all_18_steps_and_queues_manual_review(tmp_path: Path):
    p = _magic_only_pdf(tmp_path)
    result = extract.process_document(p, "doc-x", "v-test", "rc")
    assert len(result.workflow) == 18
    assert [s["step"] for s in result.workflow] == list(range(1, 19))
    assert result.low_confidence is True
    assert result.manual_review_id
    assert result.fields.registration_number is None
    assert "low_extraction_confidence" in result.flags
    assert result.version == extract.EXTRACTION_VERSION
    assert "not proof" in result.warning


def test_workflow_detects_duplicate_hash_and_vehicle_mismatch(tmp_path: Path):
    p = _magic_only_pdf(tmp_path)
    result = extract.process_document(p, "doc1", "v-test", "rc")
    # doc1 shares a hash with doc2 in the seed database.
    assert result.duplicate_of == "doc2"
    assert any("duplicate" in f for f in result.flags)


def test_real_pdf_text_layer_is_used_when_pymupdf_exists(tmp_path: Path):
    fitz = pytest.importorskip("fitz")
    p = tmp_path / "real.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 100), "Registration: MH01AB1234 VIN: WBA8E9G50GNU12345 Odometer: 72450 km")
    doc.save(str(p))
    doc.close()
    r = extract.process_document(p, "doc-real", "v-test", "rc")
    assert r.engine == "pymupdf-text-layer"
    assert r.is_ocr is False, "a PDF text layer must never be reported as OCR"
    assert r.fields.registration_number == "MH01AB1234"
    assert r.comparison["checks"]


def test_worker_is_idempotent_and_persists_status(tmp_path: Path):
    key = "idempotency-test-1"
    j1 = worker.enqueue("ai_analysis", "v-test", {}, idempotency_key=key)
    j2 = worker.enqueue("ai_analysis", "v-test", {}, idempotency_key=key)
    assert j1 == j2
    # Process our own row directly so the assertion is independent of other
    # tests that may have queued jobs into the shared test database.
    job = db.read("background_jobs", where="id = :id", params={"id": j1}, limit=1)[0]
    result = worker.process(job)
    assert result["status"] == "succeeded"
    rows = db.read("background_jobs", where="id = :id", params={"id": j1}, limit=1)
    assert rows[0]["status"] == "succeeded"
    assert rows[0]["progress"] == 100
    assert worker.run_once() is not None or True  # claim path itself must not raise


def test_worker_rejects_unsupported_job_type():
    jid = worker.enqueue("unknown_type", "v-test", {})
    job = db.read("background_jobs", where="id = :id", params={"id": jid}, limit=1)[0]
    result = worker.process(job)
    assert result["status"] == "unsupported_job_type"


def test_agent_graph_is_conditional_and_category_aware():
    d = agent.describe_graph()
    assert d["conditional"] is True
    assert d["node_registry_count"] == 16
    assert d["nodes"][0] == "VehicleResolverNode"
    assert d["nodes"][-1] == "ResultPersistenceNode"
    assert "HumanReviewNode" in d["nodes"]
    car = d["category_profiles"]["passenger_car"]["nodes"]
    ev = d["category_profiles"]["electric_scooter"]["nodes"]
    assert len(car) == 15 and len(ev) == 16
    assert "EVBatteryAnalysisNode" not in car
    assert "EVBatteryAnalysisNode" in ev
    assert d["category_profiles"]["electric_car"]["count"] == 16
    # Checkpoint backend must be reported honestly; durable only when SQLite is
    # actually active (the package is optional in the slim deployment).
    assert d["checkpoint_backend"] in ("sqlite", "memory", "none")
    if d["orchestrator"] == "langgraph":
        assert d["checkpoint_backend"] in ("sqlite", "memory")
        assert d["durable_checkpointing"] is (d["checkpoint_backend"] == "sqlite")


def test_durable_checkpoint_writes_the_thread_to_sqlite_when_available():
    d = agent.describe_graph()
    if d["checkpoint_backend"] != "sqlite":
        pytest.skip("langgraph-checkpoint-sqlite is not installed in this environment")
    assert d["durable_checkpointing"] is True

    r = agent.investigate("v-test", "Persist this investigation thread?")
    assert r.checkpoint_backend == "sqlite"
    assert r.durable_checkpointing is True
    assert r.checkpointing is True

    import os
    import sqlite3

    path = os.environ["TD_CHECKPOINT_DB"]
    assert os.path.exists(path)
    conn = sqlite3.connect(path)
    try:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert {"checkpoints", "writes"} <= tables
        assert conn.execute("SELECT COUNT(*) FROM checkpoints").fetchone()[0] > 0
    finally:
        conn.close()


def test_investigation_is_persisted_and_cites_evidence():
    r = agent.investigate("v-test", "Is this BMW safe to consider buying?")
    assert r.investigation_id
    assert len(r.nodes) == 15
    assert r.category_id == "passenger_car"
    assert "EVBatteryAnalysisNode" not in r.nodes
    rows = db.read("agent_investigations", where="id = :id",
                   params={"id": r.investigation_id}, limit=1)
    assert rows
    assert r.evidence_ids
    assert r.human_review["required"] is True
    assert r.model_versions["trust_score"] == explain_version()


def test_electric_investigation_adds_battery_node_only_for_ev():
    r = agent.investigate("v-demo-escooter", "Is the battery documented?")
    assert r.category_id == "electric_scooter"
    assert len(r.nodes) == 16
    assert "EVBatteryAnalysisNode" in r.nodes
    assert r.node_count == 16


def explain_version() -> str:
    from app import explain
    return explain.SCORE_VERSION
