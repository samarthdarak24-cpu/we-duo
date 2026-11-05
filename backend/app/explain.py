"""Exact feature attribution.

The trust score is additive and linear by construction, so per-feature
contributions can be computed exactly. SHAP is unnecessary here (and would be
less precise for an opaque model). This is a deliberate, documented decision.
"""
from __future__ import annotations

from pydantic import BaseModel

from . import db

SCORE_VERSION = "trust-score-2.0.0"
BASE_SCORE = 50

# Weights sum to 50 so the final score lands in 0..100.
WEIGHTS = {
    "document_coverage": 12,
    "identity_consistency": 10,
    "mileage_consistency": 10,
    "service_history": 6,
    "inspection_evidence": 6,
    "record_integrity": 6,
}
UNVERIFIED_NOTE = (
    "Missing data is reported as unverified coverage, NOT as proof of fraud. "
    "A vehicle is never penalised for missing information as though fraud were proven."
)


class Contribution(BaseModel):
    factor: str
    weight: int
    ratio: float
    points: float
    evidence: list[str]
    status: str  # verified | partial | unverified | negative


class TrustExplanation(BaseModel):
    vehicle_id: str
    score: int
    band: str
    band_label: str
    version: str
    base_score: int
    contributions: list[Contribution]
    positive_evidence: list[str]
    negative_findings: list[str]
    unverified_areas: list[str]
    missing_data_policy: str
    last_updated: str
    limitations: list[str]


def _ratio(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return max(0.0, min(1.0, numerator / denominator))


def compute(vehicle_id: str) -> TrustExplanation:
    contributions: list[Contribution] = []
    positive: list[str] = []
    negative: list[str] = []
    unverified: list[str] = []

    docs = db.read("documents", where="vehicle_id = :v", params={"v": vehicle_id}, limit=200)
    verified_docs = [d for d in docs if str(d.get("status")) == "verified"]
    r = _ratio(len(verified_docs), max(4, len(docs)))
    contributions.append(Contribution(
        factor="document_coverage", weight=WEIGHTS["document_coverage"], ratio=r,
        points=round(WEIGHTS["document_coverage"] * r, 2),
        evidence=[str(d.get("id")) for d in verified_docs][:10],
        status="verified" if r >= 0.75 else ("partial" if r > 0 else "unverified"),
    ))
    if not docs:
        unverified.append("No documents uploaded.")

    vehicle_rows = db.read("vehicles", where="id = :v", params={"v": vehicle_id}, limit=1)
    vehicle = vehicle_rows[0] if vehicle_rows else None
    findings = db.read("findings", where="vehicle_id = :v", params={"v": vehicle_id}, limit=200)
    identity = [f for f in findings if any(k in str(f.get("title", "")).lower()
                                           for k in ("vin", "registration", "identity"))]
    open_findings = [f for f in findings if str(f.get("status")) != "cleared"]
    # No vehicle / no identity fields = UNVERIFIED, never free full credit.
    has_identity_fields = bool(vehicle and (vehicle.get("vin") or vehicle.get("reg_no")))
    if not vehicle:
        r = 0.0
    elif identity:
        r = _ratio(len([f for f in identity if str(f.get("status")) == "cleared"]), len(identity))
    else:
        r = 0.75 if has_identity_fields else 0.0
    contributions.append(Contribution(
        factor="identity_consistency", weight=WEIGHTS["identity_consistency"], ratio=r,
        points=round(WEIGHTS["identity_consistency"] * r, 2),
        evidence=[str(f.get("id")) for f in identity],
        status=("negative" if identity else
                ("partial" if r == 0.75 else ("unverified" if r == 0 else "verified"))),
    ))
    for f in identity[:5]:
        negative.append(f"Open identity finding: {f.get('title')}")
    if not vehicle:
        unverified.append("Vehicle identity record not found.")

    readings = db.read("mileage_readings", where="vehicle_id = :v", params={"v": vehicle_id}, limit=200)
    mileage_flags = [x for x in readings if x.get("flagged")]
    # No readings = unverified (0 points), NOT a perfect consistency score.
    r = 0.0 if not readings else (max(0.0, 1.0 - 0.35 * len(mileage_flags)) if mileage_flags else 1.0)
    contributions.append(Contribution(
        factor="mileage_consistency", weight=WEIGHTS["mileage_consistency"], ratio=r,
        points=round(WEIGHTS["mileage_consistency"] * r, 2),
        evidence=[str(x.get("id")) for x in readings][:10],
        status="negative" if mileage_flags else ("verified" if readings else "unverified"),
    ))
    for m in mileage_flags[:5]:
        negative.append(f"Flagged odometer reading: {m.get('km')} km on {m.get('date')}")
    if not readings:
        unverified.append("No mileage history available.")

    history = db.read("history_events", where="vehicle_id = :v", params={"v": vehicle_id}, limit=200)
    r = _ratio(len(history), 6)
    contributions.append(Contribution(
        factor="service_history", weight=WEIGHTS["service_history"], ratio=r,
        points=round(WEIGHTS["service_history"] * r, 2),
        evidence=[str(h.get("id")) for h in history][:10],
        status="verified" if r >= 0.6 else ("partial" if history else "unverified"),
    ))
    if not history:
        unverified.append("Service history is not available.")

    inspections = db.read("vehicle_inspections", where="vehicle_id = :v", params={"v": vehicle_id}, limit=50)
    r = 1.0 if inspections else 0.0
    contributions.append(Contribution(
        factor="inspection_evidence", weight=WEIGHTS["inspection_evidence"], ratio=r,
        points=WEIGHTS["inspection_evidence"] * r,
        evidence=[str(i.get("id")) for i in inspections][:10],
        status="verified" if inspections else "unverified",
    ))
    if not inspections:
        unverified.append("No third-party inspection on record.")

    chain = db.read("chain_records", where="vehicle_id = :v", params={"v": vehicle_id}, limit=200)
    broken = [c for c in chain if c.get("broken") or c.get("integrity") == "broken"]
    r = 0.0 if broken else (1.0 if chain else 0.0)
    contributions.append(Contribution(
        factor="record_integrity", weight=WEIGHTS["record_integrity"], ratio=r,
        points=WEIGHTS["record_integrity"] * r,
        # chain_records has no id column; record_hash is the stable identifier.
        evidence=[str(c.get("id") or c.get("record_hash") or c.get("seq") or "")[:24]
                  for c in chain][:10],
        status="negative" if broken else ("verified" if chain else "unverified"),
    ))
    if not chain:
        unverified.append("Hash chain has not been initialised for this vehicle.")
    if broken:
        negative.append("Hash chain integrity broken.")

    # Unresolved anomalies are reported, not double-penalised as fraud.
    for f in open_findings[:5]:
        if str(f.get("severity")) in ("high", "critical"):
            negative.append(f"Open high-severity finding: {f.get('title')}")

    score = int(round(BASE_SCORE + sum(c.points for c in contributions)))
    score = max(0, min(100, score))
    if score >= 80:
        band, label = "high", "High trust"
    elif score >= 60:
        band, label = "moderate", "Moderate trust"
    elif score >= 40:
        band, label = "limited", "Limited evidence"
    else:
        band, label = "low", "Low evidence"

    if verified_docs:
        positive.append(f"{len(verified_docs)} verified document(s).")
    if readings and not mileage_flags:
        positive.append(f"{len(readings)} consistent odometer reading(s).")
    if history:
        positive.append(f"{len(history)} recorded history event(s).")
    if chain and not broken:
        positive.append(f"{len(chain)} intact hash-chain record(s).")

    return TrustExplanation(
        vehicle_id=vehicle_id, score=score, band=band, band_label=label,
        version=SCORE_VERSION, base_score=BASE_SCORE, contributions=contributions,
        positive_evidence=positive, negative_findings=negative,
        unverified_areas=unverified, missing_data_policy=UNVERIFIED_NOTE,
        last_updated=db.now_iso(),
        limitations=[
            "Score is deterministic and additive; no ML model or LLM sets or adjusts it.",
            "Evidence coverage is not the same as authenticity.",
            "Score versioning is explicit; older reports must cite their version.",
        ],
    )


def persist(explanation: TrustExplanation) -> bool:
    import json
    ok, _ = db.insert("trust_scores", {
        "id": db.new_id("score"), "vehicle_id": explanation.vehicle_id,
        "score": explanation.score, "band": explanation.band,
        "version": explanation.version, "method": "additive-deterministic",
        # Real schema stores the breakdown in typed JSON columns.
        "weights_json": json.dumps(WEIGHTS),
        "factors_json": json.dumps([c.model_dump() for c in explanation.contributions]),
        "positive_json": json.dumps(explanation.positive_evidence),
        "negative_json": json.dumps(explanation.negative_findings),
        "unverified_json": json.dumps(explanation.unverified_areas),
        "missing_policy": explanation.missing_data_policy,
        # Real schema: INTEGER percentage (0-100). computed_by is a users FK,
        # so it is left NULL for the service account rather than faked.
        "evidence_coverage": int(round(100 * sum(c.ratio for c in explanation.contributions)
                                       / max(1, len(explanation.contributions)))),
        "computed_at": db.now_iso(),
        "explanation": explanation.model_dump_json(),
        "created_at": db.now_iso(),
    })
    return ok
