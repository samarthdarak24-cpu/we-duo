"""Exact feature attribution for the CATEGORY-AWARE, versioned trust score.

The score is additive and linear by construction, so per-feature contributions
can be computed exactly. SHAP is unnecessary here (and would be less precise
for an opaque model). This is a deliberate, documented decision.

Weights, factor names and the score version come from the single shared
taxonomy. A combustion car, a scooter and an electric scooter therefore use
different weight sets while sharing ONE scoring function. Missing evidence is
always reported as unverified coverage — never as proof of fraud and never as
clean history.
"""
from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field

from . import categories, db

SCORE_VERSION = "trust-v2-multicategory"
LEGACY_SCORE_VERSION = "trust-score-2.0.0"
BASE_SCORE = 50

# Default (passenger car) profile. Kept as a module-level dict because the
# capabilities endpoint and older integrations read `explain.WEIGHTS` directly.
# Weights sum to 50 so the final score lands in 0..100.
WEIGHTS = {
    "document_coverage": 12,
    "identity_consistency": 10,
    "mileage_consistency": 10,
    "service_history": 6,
    "inspection_evidence": 6,
    "record_integrity": 6,
}

# Taxonomy factor name -> internal evidence ratio. Several names share one
# ratio (e.g. "distance_consistency" and "mileage_consistency" are the same
# evidence viewed through a different category's vocabulary).
FACTOR_ALIASES = {
    "document_coverage": "document_coverage",
    "identity_consistency": "identity_consistency",
    "mileage_consistency": "mileage_consistency",
    "distance_consistency": "mileage_consistency",
    "service_history": "service_history",
    "inspection_evidence": "inspection_evidence",
    "damage_inspection": "inspection_evidence",
    "record_integrity": "record_integrity",
    "battery_health_evidence": "battery_health_evidence",
    "battery_replacement_history": "battery_replacement_history",
    "motor_service_information": "motor_service_information",
}

UNVERIFIED_NOTE = (
    "Missing data is reported as unverified coverage, NOT as proof of fraud and "
    "NOT as clean history. A vehicle is never penalised for missing information "
    "as though fraud were proven, and battery health is never invented."
)


class Contribution(BaseModel):
    factor: str
    weight: float
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
    category_id: str = categories.DEFAULT_CATEGORY_ID
    category_label: str = ""
    weights: dict[str, float] = Field(default_factory=dict)
    category_spec_version: str = ""


def _ratio(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return max(0.0, min(1.0, numerator / denominator))


def weights_for(category_id: str | None = None) -> tuple[str, str, dict[str, float]]:
    """Return (category_id, score_version, weights) for one profile."""
    cid = category_id or categories.DEFAULT_CATEGORY_ID
    version, weights = categories.trust_weights_for(cid)
    if not weights:
        cid = categories.DEFAULT_CATEGORY_ID
        version, weights = SCORE_VERSION, dict(WEIGHTS)
    return cid, version, {str(k): float(v) for k, v in weights.items()}


def _safe_read(table: str, vehicle_id: str, limit: int = 200) -> list[dict]:
    try:
        if not db.has_table(table) or "vehicle_id" not in db.columns(table):
            return []
        return db.read(table, where="vehicle_id = :v", params={"v": vehicle_id}, limit=limit)
    except Exception:
        return []


def _build_ratios(vehicle_id: str, cid: str) -> dict[str, dict[str, Any]]:
    """Compute every evidence ratio from real rows only. Never fabricates data."""
    def entry(ratio: float, evidence: list[str], note: str, status: str | None = None):
        return {
            "ratio": ratio,
            "evidence": evidence[:10],
            "note": note,
            "status": status or ("verified" if ratio >= 1.0 else ("partial" if ratio > 0 else "unverified")),
        }

    out: dict[str, dict[str, Any]] = {}

    docs = _safe_read("documents", vehicle_id)
    verified_docs = [d for d in docs if str(d.get("status")) == "verified"]
    required = categories.required_document_ids(cid)
    # Category-specific required documents define the coverage denominator;
    # uploaded-but-optional documents can never hide a missing required one.
    denominator = max(4, len(required), len(docs))
    out["document_coverage"] = entry(
        _ratio(len(verified_docs), denominator),
        [str(d.get("id")) for d in verified_docs],
        "No documents uploaded." if not docs else
        f"{len(verified_docs)} of {len(docs)} uploaded document(s) verified; required set: {', '.join(required) or 'none'}.",
    )

    vehicle_rows = _safe_read("vehicles", vehicle_id, 1)
    vehicle = vehicle_rows[0] if vehicle_rows else None
    findings = _safe_read("findings", vehicle_id)
    identity = [f for f in findings if any(k in str(f.get("title", "")).lower()
                                           for k in ("vin", "registration", "identity", "chassis", "frame", "motor"))]
    has_identity_fields = bool(vehicle and (vehicle.get("vin") or vehicle.get("reg_no")))
    if not vehicle:
        r = 0.0
    elif identity:
        r = _ratio(len([f for f in identity if str(f.get("status")) == "cleared"]), len(identity))
    else:
        r = 0.75 if has_identity_fields else 0.0
    out["identity_consistency"] = entry(
        r, [str(f.get("id")) for f in identity],
        "Vehicle identity record not found." if not vehicle else "",
        status="negative" if identity else ("partial" if r == 0.75 else ("unverified" if r == 0 else "verified")),
    )

    readings = _safe_read("mileage_readings", vehicle_id)
    mileage_flags = [x for x in readings if x.get("flagged")]
    r = 0.0 if not readings else (max(0.0, 1.0 - 0.35 * len(mileage_flags)) if mileage_flags else 1.0)
    out["mileage_consistency"] = entry(
        r, [str(x.get("id")) for x in readings],
        "No distance history available." if not readings else "",
        status="negative" if mileage_flags else ("verified" if readings else "unverified"),
    )

    history = _safe_read("history_events", vehicle_id)
    out["service_history"] = entry(
        _ratio(len(history), 6), [str(h.get("id")) for h in history],
        "Service history is not available." if not history else "",
        status="verified" if _ratio(len(history), 6) >= 0.6 else ("partial" if history else "unverified"),
    )

    inspections = _safe_read("vehicle_inspections", vehicle_id, 50)
    out["inspection_evidence"] = entry(
        1.0 if inspections else 0.0, [str(i.get("id")) for i in inspections],
        "No third-party inspection on record." if not inspections else "",
    )

    chain = _safe_read("chain_records", vehicle_id)
    broken = [c for c in chain if c.get("broken") or c.get("integrity") == "broken"]
    out["record_integrity"] = entry(
        0.0 if broken else (1.0 if chain else 0.0),
        [str(c.get("id") or c.get("record_hash") or c.get("seq") or "")[:24] for c in chain],
        "Hash chain has not been initialised for this vehicle." if not chain else "",
        status="negative" if broken else ("verified" if chain else "unverified"),
    )

    # EV-only factors. Every one of them is derived from persisted rows; a
    # missing table or missing source document is UNVERIFIED, never a value.
    battery_rows = _safe_read("battery_records", vehicle_id)
    sourced = [b for b in battery_rows if b.get("source_document_id") or b.get("source_doc_id")]
    out["battery_health_evidence"] = entry(
        _ratio(len(sourced), 2), [str(b.get("id")) for b in sourced],
        "No battery health record with a source document; State of Health is UNVERIFIED and was not estimated.",
    )
    battery_events = [h for h in history if "battery" in str(h.get("title", "")).lower()
                      or "battery" in str(h.get("description", "")).lower()
                      or "battery" in str(h.get("type", "")).lower()]
    out["battery_replacement_history"] = entry(
        1.0 if battery_events else 0.0, [str(h.get("id")) for h in battery_events],
        "No battery replacement / battery service event on record." if not battery_events else "",
    )
    motor_events = [h for h in history if any(k in (str(h.get("title", "")) + str(h.get("description", ""))).lower()
                                              for k in ("motor", "controller", "charging", "battery"))]
    out["motor_service_information"] = entry(
        _ratio(len(motor_events), 2), [str(h.get("id")) for h in motor_events],
        "No motor / controller / charging service record on file." if not motor_events else "",
    )

    return out


def compute(vehicle_id: str, category_id: str | None = None) -> TrustExplanation:
    if category_id:
        profile = categories.get_category(category_id) or categories.get_category(categories.DEFAULT_CATEGORY_ID)
    else:
        profile = categories.resolve_vehicle_category(vehicle_id)
    cid = str(profile["id"])
    _, version, weights = weights_for(cid)
    ratios = _build_ratios(vehicle_id, cid)

    contributions: list[Contribution] = []
    positive: list[str] = []
    negative: list[str] = []
    unverified: list[str] = []

    for factor, weight in weights.items():
        key = FACTOR_ALIASES.get(factor)
        if not key or key not in ratios:
            # An unknown factor is reported as unverified, never silently
            # dropped and never given free credit.
            contributions.append(Contribution(
                factor=factor, weight=weight, ratio=0.0, points=0.0, evidence=[],
                status="unverified",
            ))
            unverified.append(f"No evidence source is registered for factor '{factor}'.")
            continue
        item = ratios[key]
        contributions.append(Contribution(
            factor=factor, weight=weight, ratio=item["ratio"],
            points=round(weight * item["ratio"], 2),
            evidence=item["evidence"], status=item["status"],
        ))
        if item["note"] and item["ratio"] == 0:
            unverified.append(item["note"])
        if item["status"] == "negative":
            negative.append(f"Open evidence conflict affecting '{factor}'.")

    # Preserve the original human-readable narrative, grounded in real rows.
    docs = _safe_read("documents", vehicle_id)
    verified_docs = [d for d in docs if str(d.get("status")) == "verified"]
    readings = _safe_read("mileage_readings", vehicle_id)
    mileage_flags = [x for x in readings if x.get("flagged")]
    history = _safe_read("history_events", vehicle_id)
    chain = _safe_read("chain_records", vehicle_id)
    broken = [c for c in chain if c.get("broken") or c.get("integrity") == "broken"]
    findings = _safe_read("findings", vehicle_id)
    open_findings = [f for f in findings if str(f.get("status")) != "cleared"]

    if verified_docs:
        positive.append(f"{len(verified_docs)} verified document(s).")
    if readings and not mileage_flags:
        positive.append(f"{len(readings)} consistent distance reading(s).")
    if history:
        positive.append(f"{len(history)} recorded history event(s).")
    if chain and not broken:
        positive.append(f"{len(chain)} intact hash-chain record(s).")
    for m in mileage_flags[:5]:
        negative.append(f"Flagged distance reading: {m.get('km')} km on {m.get('date')}")
    if broken:
        negative.append("Hash chain integrity broken.")
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

    limitations = [
        "Score is deterministic and additive; no ML model or LLM sets or adjusts it.",
        "Evidence coverage is not the same as authenticity.",
        "Score versioning is explicit; older reports must cite their version.",
        f"Weights resolved from category '{cid}' ({profile['label']}); spec {categories.spec_version()}.",
        "Missing history is unverified coverage, never clean history.",
    ]
    soh = categories.soh_note(cid)
    if soh:
        limitations.append(soh)

    return TrustExplanation(
        vehicle_id=vehicle_id, score=score, band=band, band_label=label,
        version=version, base_score=BASE_SCORE, contributions=contributions,
        positive_evidence=positive, negative_findings=negative,
        unverified_areas=list(dict.fromkeys(unverified)),
        missing_data_policy=UNVERIFIED_NOTE, last_updated=db.now_iso(),
        limitations=limitations,
        category_id=cid, category_label=str(profile["label"]),
        weights=weights, category_spec_version=categories.spec_version(),
    )


def persist(explanation: TrustExplanation) -> bool:
    ok, _ = db.insert("trust_scores", {
        "id": db.new_id("score"), "vehicle_id": explanation.vehicle_id,
        "score": explanation.score, "band": explanation.band,
        "version": explanation.version, "method": "additive-deterministic",
        # Persist the ACTIVE category's weights, never a global constant.
        "weights_json": json.dumps(explanation.weights or dict(WEIGHTS)),
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


def describe() -> dict:
    """Reported in /health so active scoring rules are never a guess."""
    return {
        "version": SCORE_VERSION,
        "legacy_version": LEGACY_SCORE_VERSION,
        "method": "additive-deterministic",
        "base_score": BASE_SCORE,
        "default_weights": dict(WEIGHTS),
        "profiles": {
            c["id"]: weights_for(c["id"])[2]
            for c in categories.categories()
        },
        "note": "One scoring function, category-selected versioned weights. Missing evidence is unverified, never invented.",
    }
