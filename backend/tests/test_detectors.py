"""Unit tests for deterministic rules, ML adapter, scoring and the LLM adapter."""
from __future__ import annotations

import pytest

from app import detectors, explain, llm


def test_mileage_rollback_is_explained_with_full_payload():
    report = detectors.mileage_findings("v-test")
    # The shared test DB may have extra readings added by backend tests.
    assert report.sample_count >= 5
    decreases = [f for f in report.findings if f.anomaly_type == "mileage_decrease"]
    assert decreases
    f = decreases[0]
    assert f.severity == "high"
    assert f.evidence and f.readings and f.explanation
    assert f.method and f.model_version and 0 <= f.confidence <= 1
    assert f.recommended_review_action
    assert "deterministic-rules" in report.active_backends


def test_document_duplicates_come_from_sha256_equality():
    report = detectors.document_findings("v-test")
    dupes = [f for f in report.findings if f.anomaly_type == "duplicate_document"]
    assert dupes and dupes[0].confidence > 0.9
    assert len(dupes[0].evidence) == 2


def test_trust_score_is_additive_and_reports_unverified_areas():
    e = explain.compute("v-test")
    assert e.base_score + sum(c.points for c in e.contributions) == pytest.approx(e.score, abs=1)
    assert len(e.contributions) == len(explain.WEIGHTS)
    assert e.missing_data_policy
    assert e.band in ("high", "moderate", "limited", "low")
    assert e.limitations


def test_score_does_not_penalise_missing_data_as_fraud():
    e = explain.compute("v-missing")
    assert e.unverified_areas
    assert e.score >= 50, "missing data must not be treated as proven fraud"
    assert all(c.points >= 0 for c in e.contributions)


def test_llm_offline_never_fabricates_a_conclusion():
    r = llm.generate_explanation("Is this safe?", {"sources": ["doc1"]})
    assert r.available is False
    assert r.conclusion is None
    assert "fabricated" in r.reason


def test_policy_rejects_safety_and_authenticity_judgements():
    assert llm.policy_violations("This car is safe to buy.")
    assert llm.policy_violations("No fraud found, genuine vehicle.")
    assert llm.policy_violations("Accident-free and stolen-free.")
    assert not llm.policy_violations(
        "Mileage decreased from 58,000 km to 25,000 km; insurance record unavailable; "
        "an independent inspection is recommended."
    )


def test_llm_guardrails_reject_contradictions_and_missing_citations():
    facts = {"mileage_findings": [{"anomaly_type": "mileage_decrease"}],
             "sources": ["doc1"], "require_inline_citations": True}
    assert llm.contradiction_violations("There is no recorded mileage decrease.", facts)
    assert llm.missing_citations("The mileage dropped sharply.", facts) == ["policy:no_citation"]
    assert llm.missing_citations("The mileage dropped sharply (doc1).", facts) == []
    # Inline citation is opt-in (the chat API attaches citations structurally).
    assert llm.missing_citations("The mileage dropped sharply.", {"sources": ["doc1"]}) == []
    assert not llm.is_coherent("'unavailable'")
    assert llm.is_coherent(
        "The odometer reading decreased between 2022 and 2023; an inspection is recommended."
    )


def test_grounding_validation_rejects_unsupported_numbers():
    grounded, unsupported = llm.validate_grounding(
        "The car did 999999 km and 1234567 owners.", {"facts": [58000, 25000]}
    )
    assert grounded is False
    assert unsupported


def test_llm_describe_is_false_by_default():
    d = llm.describe()
    assert d["active"] is False
    assert d["provider"] == "none"


def test_damage_signals_are_adapter_only():
    import tempfile
    from pathlib import Path
    p = Path(tempfile.mkdtemp()) / "no-image.png"
    p.write_bytes(b"not-an-image")
    r = detectors.damage_signals(p)
    assert r["engine"] in ("opencv", "unavailable")
    assert any("single photograph" in x for x in r["limitations"])
    assert "Human inspector" in r["limitations"][-1] or "inspector" in str(r["limitations"])
