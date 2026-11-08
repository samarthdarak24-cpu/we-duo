"""Deterministic-first, CATEGORY-AWARE fraud detection with optional ML detectors.

Every finding carries the checklist's required payload: anomaly type, readings
involved, severity, evidence, explanation, detection method, model/rule
version, confidence and recommended review action. No LLM decides anything.

Thresholds, distance labels, required documents and battery rules come from the
single shared taxonomy (`frontend/lib/vehicle-categories.json`). Legacy car
rows with no explicit `vehicle_category_id` keep the original car thresholds
byte-for-byte, so pre-existing car functionality and reports are unchanged.
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime
from pathlib import Path
from statistics import median
from typing import Any

from pydantic import BaseModel, Field

from . import categories, db
from .logging import emit

RULES_VERSION = "fraud-rules-2.0.0-multicategory"
LEGACY_RULES_VERSION = "fraud-rules-1.1.0"
ML_VERSION = "sklearn-iforest-lof-1.0.0"


class Finding(BaseModel):
    anomaly_type: str
    severity: str  # low | medium | high
    explanation: str
    evidence: list[str] = Field(default_factory=list)
    readings: list[dict] = Field(default_factory=list)
    method: str
    model_version: str
    confidence: float
    recommended_review_action: str


class DetectorReport(BaseModel):
    vehicle_id: str
    detector: str
    findings: list[Finding]
    active_backends: list[str]
    sample_count: int
    limitations: list[str] = Field(default_factory=list)
    generated_at: str
    category_id: str = categories.DEFAULT_CATEGORY_ID
    rules_version: str = RULES_VERSION
    # True only for legacy car rows that carry no explicit category column.
    legacy_car_profile: bool = False


def _rows(table: str, vehicle_id: str, limit: int = 200) -> list[dict]:
    if not db.has_table(table):
        return []
    cols = db.columns(table)
    if "vehicle_id" not in cols:
        return []
    return db.read(table, where="vehicle_id = :v", params={"v": vehicle_id}, limit=limit)


def _km(r: dict) -> int | None:
    for key in ("km", "odometer_km", "reading_km", "value"):
        if isinstance(r.get(key), (int, float)):
            return int(r[key])
    return None


def _date(r: dict) -> str:
    for key in ("date", "recorded_at", "reading_date", "created_at"):
        if r.get(key):
            return str(r[key])[:10]
    return ""


def _year(r: dict) -> int | None:
    d = _date(r)
    m = re.match(r"(\d{4})", d)
    return int(m.group(1)) if m else None


def _days_between(a: dict, b: dict) -> int | None:
    try:
        d1 = datetime.strptime(_date(a)[:10], "%Y-%m-%d")
        d2 = datetime.strptime(_date(b)[:10], "%Y-%m-%d")
        return max(0, (d2 - d1).days)
    except (ValueError, TypeError):
        return None


def _category_context(vehicle_id: str, category_id: str | None = None) -> tuple[dict, bool, bool]:
    """Return (profile, legacy_car, explicit).

    `explicit` is True when the caller asked for a category or the DB row has
    the new authoritative `vehicle_category_id`. Legacy car rows keep the
    original v1 rules so no previously published car finding changes.
    """
    if category_id:
        cat = categories.get_category(category_id) or categories.get_category(categories.DEFAULT_CATEGORY_ID)
        return cat, False, True  # type: ignore[return-value]
    cat = categories.resolve_vehicle_category(vehicle_id)
    try:
        rows = db.read("vehicles", where="id = :v", params={"v": vehicle_id}, limit=1)
    except Exception:
        rows = []
    explicit = categories.is_explicit_category_row(rows[0] if rows else None)
    legacy = not explicit and str(cat["id"]) == categories.DEFAULT_CATEGORY_ID
    return cat, legacy, explicit


def mileage_findings(vehicle_id: str, category_id: str | None = None) -> DetectorReport:
    cat, legacy_car, _ = _category_context(vehicle_id, category_id)
    cid = str(cat["id"])
    rules = categories.mileage_rules_for(cid)
    distance_label = str(rules.get("label") or "Odometer")
    rules_version = LEGACY_RULES_VERSION if legacy_car else RULES_VERSION
    # Legacy car rows keep the original v1 thresholds exactly.
    rollback_tolerance = 0 if legacy_car else int(rules.get("rollbackToleranceKm") or 0)
    annual_ceiling = 50_000 if legacy_car else int(rules.get("annualPlausibleMax") or 40_000)
    daily_ceiling = 0 if legacy_car else int(rules.get("dailyMaxKm") or 400)

    readings = _rows("mileage_readings", vehicle_id)
    ordered = sorted(
        [r for r in readings if _km(r) is not None],
        key=lambda r: (_date(r), str(r.get("id", ""))),
    )
    findings: list[Finding] = []
    backends = ["deterministic-rules"]

    # A. Distance decrease (rollback). A small drop inside the category's
    # documented tolerance is still reported, just at a lower severity.
    for prev, cur in zip(ordered, ordered[1:]):
        km_prev, km_cur = _km(prev), _km(cur)
        if km_prev is None or km_cur is None:
            continue
        if km_cur < km_prev:
            drop = km_prev - km_cur
            within_tolerance = (not legacy_car) and drop <= rollback_tolerance
            if legacy_car:
                explanation = f"Odometer fell from {km_prev:,} km ({_date(prev)}) to {km_cur:,} km ({_date(cur)}). A mechanical odometer cannot go backwards."
            elif within_tolerance:
                explanation = (f"{distance_label} fell by {drop:,} km between {_date(prev)} and {_date(cur)}. "
                               f"This is within the {cid} tolerance of {rollback_tolerance:,} km but is still a data conflict, not clean history.")
            else:
                explanation = (f"{distance_label} fell from {km_prev:,} km ({_date(prev)}) to {km_cur:,} km ({_date(cur)}), "
                               f"a {drop:,} km drop beyond the {cid} tolerance of {rollback_tolerance:,} km. "
                               "A distance reading cannot go backwards without explanation.")
            findings.append(Finding(
                anomaly_type="minor_distance_decrease" if within_tolerance else "mileage_decrease",
                severity="low" if within_tolerance else "high",
                explanation=explanation,
                evidence=[str(prev.get("id")), str(cur.get("id"))],
                readings=[{"id": prev.get("id"), "date": _date(prev), "km": _km(prev)},
                          {"id": cur.get("id"), "date": _date(cur), "km": _km(cur)}],
                method="monotonicity-check", model_version=rules_version,
                confidence=0.7 if within_tolerance else 0.98,
                recommended_review_action="Verify both source documents with an inspector; request clarification from the seller.",
            ))

    # B. Unusual jumps / implausible annual usage (category ceiling, or the
    # original 50,000 km/year car floor for legacy rows).
    deltas: list[int] = []
    for prev, cur in zip(ordered, ordered[1:]):
        y1, y2 = _year(prev), _year(cur)
        km_prev, km_cur = _km(prev), _km(cur)
        dy = (y2 - y1) if (y1 and y2) else 1
        if dy > 0 and km_prev is not None and km_cur is not None:
            deltas.append(max(0, (km_cur - km_prev) // dy))
    if len(deltas) >= 2:
        med = median(deltas) or 1
        for prev, cur, per_year in zip(ordered, ordered[1:], deltas):
            if per_year > max(annual_ceiling, med * 4):
                findings.append(Finding(
                    anomaly_type="implausible_usage", severity="medium",
                    explanation=f"{per_year:,} km/year between {_date(prev)} and {_date(cur)} is far above this vehicle's median ({int(med):,} km/year) and the {cid} ceiling ({annual_ceiling:,} km/year).",
                    evidence=[str(prev.get("id")), str(cur.get("id"))],
                    readings=[{"date": _date(prev), "km": _km(prev)}, {"date": _date(cur), "km": _km(cur)}],
                    method="annual-usage-threshold", model_version=rules_version, confidence=0.72,
                    recommended_review_action="Cross-check service invoices for the intervening period.",
                ))

    # B2. Per-day plausibility. Two-wheelers and EVs have much lower daily
    # ceilings than cars; car-scale usage must not be assumed for a scooter.
    if not legacy_car:
        for prev, cur in zip(ordered, ordered[1:]):
            days = _days_between(prev, cur)
            km_prev, km_cur = _km(prev), _km(cur)
            if not days or km_prev is None or km_cur is None or km_cur <= km_prev:
                continue
            per_day = (km_cur - km_prev) / days
            if per_day > daily_ceiling:
                findings.append(Finding(
                    anomaly_type="implausible_daily_distance", severity="medium",
                    explanation=(f"{per_day:,.0f} km/day between {_date(prev)} and {_date(cur)} exceeds the "
                                 f"{cid} ceiling of {daily_ceiling:,} km/day for a {cat['label']}."),
                    evidence=[str(prev.get("id")), str(cur.get("id"))],
                    readings=[{"date": _date(prev), "km": km_prev}, {"date": _date(cur), "km": km_cur}],
                    method="daily-distance-threshold", model_version=rules_version, confidence=0.7,
                    recommended_review_action="Confirm the interval with dated service or inspection records.",
                ))

    # C. Conflicting readings on the same date
    by_date: dict[str, list[int]] = {}
    for r in ordered:
        km_r = _km(r)
        if km_r is not None:
            by_date.setdefault(_date(r), []).append(km_r)
    for d, vals in by_date.items():
        if len(set(vals)) > 1:
            findings.append(Finding(
                anomaly_type="conflicting_readings", severity="high",
                explanation=f"Two different {distance_label.lower()} values ({', '.join(f'{v:,}' for v in sorted(set(vals)))} km) are recorded on {d}.",
                evidence=[d], readings=[{"date": d, "km": v} for v in sorted(set(vals))],
                method="same-date-conflict", model_version=rules_version, confidence=0.95,
                recommended_review_action="Inspector must decide which source is authoritative.",
            ))

    # D. Duplicate readings with conflicting dates
    seen: dict[int, set[str]] = {}
    for r in ordered:
        k = _km(r)
        if k is None:
            continue
        seen.setdefault(k, set()).add(_date(r))
    for k, dates in seen.items():
        if len(dates) > 1 and k > 0:
            findings.append(Finding(
                anomaly_type="duplicate_reading_different_dates", severity="low",
                explanation=f"{k:,} km appears on {len(dates)} different dates — possibly a duplicated record.",
                evidence=sorted(dates), readings=[{"km": k, "date": d} for d in sorted(dates)],
                method="duplicate-value-check", model_version=rules_version, confidence=0.6,
                recommended_review_action="Confirm whether these are genuine repeat readings.",
            ))

    # E. Optional ML: Isolation Forest + Local Outlier Factor.
    ml_note = "ML not run: scikit-learn unavailable or fewer than 8 readings."
    try:
        import numpy as np  # type: ignore
        from sklearn.ensemble import IsolationForest  # type: ignore
        from sklearn.neighbors import LocalOutlierFactor  # type: ignore
        if len(ordered) >= 8:
            years = np.array([_year(r) or 0 for r in ordered], dtype=float)
            kms = np.array([_km(r) or 0 for r in ordered], dtype=float)
            idx = np.arange(len(ordered), dtype=float)
            X = np.column_stack([years, kms, np.gradient(kms) if len(kms) > 1 else idx])
            iso = IsolationForest(contamination=0.15, random_state=42).fit(X)
            lof = LocalOutlierFactor(n_neighbors=min(5, len(ordered) - 1)).fit_predict(X)
            flagged = [i for i in range(len(ordered)) if iso.predict([X[i]])[0] == -1 or lof[i] == -1]
            if flagged:
                findings.append(Finding(
                    anomaly_type="statistical_outlier", severity="medium",
                    explanation=f"{len(flagged)} of {len(ordered)} readings are outliers under Isolation Forest / LOF on (year, km, delta).",
                    evidence=[str(ordered[i].get("id")) for i in flagged],
                    readings=[{"id": ordered[i].get("id"), "date": _date(ordered[i]), "km": _km(ordered[i])} for i in flagged],
                    method="isolation-forest+lof", model_version=ML_VERSION, confidence=0.65,
                    recommended_review_action="Treat as a lead for human review, never as proof of fraud.",
                ))
            backends.append("isolation-forest")
            backends.append("local-outlier-factor")
            ml_note = f"ML evaluated {len(ordered)} readings; {len(flagged)} outliers."
    except Exception as exc:
        emit("detector.ml_unavailable", detector="mileage", error=str(exc))

    category_limits = [
        f"Rules resolved from category '{cid}' ({cat['label']}); spec {categories.spec_version()}, rules {rules_version}.",
        f"Distance label: {distance_label}. Annual ceiling {annual_ceiling:,} km/year, daily ceiling {daily_ceiling or 'n/a'} km/day, rollback tolerance {rollback_tolerance:,} km.",
    ]
    soh = categories.soh_note(cid)
    if soh:
        category_limits.append(soh)
    if legacy_car:
        category_limits.append("Legacy car row without vehicle_category_id: original v1 car thresholds retained.")
    return DetectorReport(
        vehicle_id=vehicle_id, detector="mileage", findings=findings,
        active_backends=backends, sample_count=len(ordered),
        limitations=[
            "Deterministic rules and statistical outliers are leads, not proof of tampering.",
            ml_note,
            "No labelled fraud corpus is present, so XGBoost is deliberately not fitted.",
            *category_limits,
        ],
        generated_at=db.now_iso(),
        category_id=cid, rules_version=rules_version, legacy_car_profile=legacy_car,
    )


def document_findings(vehicle_id: str, category_id: str | None = None) -> DetectorReport:
    cat, legacy_car, _ = _category_context(vehicle_id, category_id)
    cid = str(cat["id"])
    rules_version = LEGACY_RULES_VERSION if legacy_car else RULES_VERSION
    docs = _rows("documents", vehicle_id)
    hash_col = next((c for c in ("sha256", "hash", "file_hash", "content_hash")
                     if c in db.columns("documents")), None)
    num_col = next((c for c in ("invoice_no", "doc_number", "policy_number", "number")
                    if c in db.columns("documents")), None)
    findings: list[Finding] = []

    if hash_col:
        groups: dict[str, list[str]] = {}
        for d in docs:
            groups.setdefault(str(d.get(hash_col) or ""), []).append(str(d.get("id")))
        for h, ids in groups.items():
            if h and len(ids) > 1:
                findings.append(Finding(
                    anomaly_type="duplicate_document", severity="high",
                    explanation=f"{len(ids)} documents share the identical SHA-256 hash ({h[:16]}…).",
                    evidence=ids, method="sha256-equality", model_version=rules_version,
                    confidence=0.99, recommended_review_action="Inspector must confirm whether these are distinct originals.",
                ))
    if num_col:
        groups = {}
        for d in docs:
            n = str(d.get(num_col) or "").strip()
            if n:
                groups.setdefault(n, []).append(str(d.get("id")))
        for n, ids in groups.items():
            if len(ids) > 1:
                findings.append(Finding(
                    anomaly_type="repeated_invoice_number", severity="medium",
                    explanation=f"Invoice/policy number {n} appears on {len(ids)} documents.",
                    evidence=ids, method="identifier-uniqueness", model_version=rules_version,
                    confidence=0.85, recommended_review_action="Request the original invoices from the seller.",
                ))

    # VIN / chassis / frame / registration mismatch from persisted findings.
    # The identity keyword set is category-aware: a two-wheeler has a stamped
    # frame number, not a 17-character car VIN.
    identity_keywords = r"vin|registration|mismatch|chassis|frame|motor|battery"
    for f in _rows("findings", vehicle_id):
        title = str(f.get("title") or "") + str(f.get("type") or "")
        if re.search(identity_keywords, title, re.I):
            findings.append(Finding(
                anomaly_type="identity_mismatch", severity="high",
                explanation=f"Persisted finding: {f.get('title') or f.get('type')}. {f.get('explanation') or ''}",
                evidence=[str(f.get("id"))], method="persisted-finding", model_version=rules_version,
                confidence=0.8, recommended_review_action="Inspector must reconcile identity documents.",
            ))
    for a in _rows("ai_analysis", vehicle_id):
        if "mismatch" in str(a.get("result") or ""):
            findings.append(Finding(
                anomaly_type="extraction_mismatch", severity="medium",
                explanation=f"Document extraction flagged: {a.get('result')}",
                evidence=[str(a.get("id"))], method="extraction-flag", model_version=str(a.get("version") or "unknown"),
                confidence=0.7, recommended_review_action="Re-read the source document with an inspector.",
            ))

    missing = [str(d.get("id")) for d in docs if not d.get("status") or str(d.get("status")) == "pending"]
    if missing:
        findings.append(Finding(
            anomaly_type="missing_expected_fields", severity="low",
            explanation=f"{len(missing)} document(s) still have no verification status.",
            evidence=missing, method="completeness-check", model_version=rules_version,
            confidence=1.0, recommended_review_action="Complete document verification before publishing.",
        ))

    # Category-specific required document coverage. Missing documents are
    # UNVERIFIED COVERAGE, never a fraud allegation and never clean history.
    required = categories.required_document_ids(cid)
    present_types = {str(d.get("type") or "").lower() for d in docs}
    absent = [d for d in required if d.lower() not in present_types]
    doc_limitations = [
        "Document matching is deterministic; no authenticity claim is made.",
        "Metadata checks are indicative only and cannot prove forgery.",
        f"Required document set for {cid}: {', '.join(required) or 'none declared'}.",
    ]
    if not legacy_car and absent:
        findings.append(Finding(
            anomaly_type="unverified_required_documents", severity="low",
            explanation=(f"{len(absent)} required {cat['label']} document type(s) are not on record "
                         f"({', '.join(absent)}). This is missing evidence, NOT evidence of a clean history."),
            evidence=absent, readings=[], method="category-document-coverage",
            model_version=rules_version, confidence=1.0,
            recommended_review_action="Request the missing category-specific documents before publishing.",
        ))
        doc_limitations.append("Missing required documents are reported as unverified coverage, not as fraud.")
    if categories.has_battery_pack(cid):
        doc_limitations.append(categories.soh_note(cid) or
                               "Battery State of Health is never treated as an odometer reading.")

    return DetectorReport(
        vehicle_id=vehicle_id, detector="document", findings=findings,
        active_backends=["deterministic-matching", "sha256-hashing"], sample_count=len(docs),
        limitations=doc_limitations,
        generated_at=db.now_iso(),
        category_id=cid, rules_version=rules_version, legacy_car_profile=legacy_car,
    )


def battery_findings(vehicle_id: str, category_id: str | None = None) -> DetectorReport:
    """Battery evidence check for battery-electric AND hybrid vehicles.

    Never invents a State of Health value. Only rows actually persisted in
    `battery_records` with a source document count as evidence. Absence is
    reported as unverified, not as a healthy battery and not as fraud.
    """
    cat, legacy_car, _ = _category_context(vehicle_id, category_id)
    cid = str(cat["id"])
    electric = categories.has_battery_pack(cid)
    records = _rows("battery_records", vehicle_id) if db.has_table("battery_records") else []
    findings: list[Finding] = []
    limitations = [
        f"Category '{cid}' has a battery pack; battery checks "
        f"{'apply' if electric else 'do not apply'}.",
        "Battery State of Health is never inferred, estimated or substituted for a distance reading.",
    ]
    if electric:
        sourced = [r for r in records if r.get("source_document_id") or r.get("source_doc_id")]
        if not sourced:
            findings.append(Finding(
                anomaly_type="unverified_battery_health", severity="low",
                explanation=("No battery health record with a source document exists for this vehicle. "
                             "Battery condition is UNVERIFIED; no SOH value has been invented."),
                evidence=[], readings=[], method="battery-evidence-coverage",
                model_version=RULES_VERSION, confidence=1.0,
                recommended_review_action="Request a dated battery health report from an authorised service centre.",
            ))
        for r in records:
            if r.get("soh_percent") is not None and not (r.get("source_document_id") or r.get("source_doc_id")):
                findings.append(Finding(
                    anomaly_type="unsourced_battery_claim", severity="medium",
                    explanation=("A State of Health value is recorded without a linked source document. "
                                 "It is a seller claim, not verified battery evidence."),
                    evidence=[str(r.get("id"))], readings=[{"soh_percent": r.get("soh_percent")}],
                    method="battery-provenance-check", model_version=RULES_VERSION, confidence=0.9,
                    recommended_review_action="Attach the original battery test report or discard the claim.",
                ))
        limitations.append(f"{len(sourced)} of {len(records)} battery record(s) carry a source document.")
    else:
        limitations.append("No battery assertions are made for a combustion vehicle.")

    return DetectorReport(
        vehicle_id=vehicle_id, detector="battery", findings=findings,
        active_backends=["evidence-provenance"], sample_count=len(records),
        limitations=limitations, generated_at=db.now_iso(),
        category_id=cid,
        rules_version=LEGACY_RULES_VERSION if legacy_car else RULES_VERSION,
        legacy_car_profile=legacy_car,
    )


def damage_signals(image_path: Path, category_id: str | None = None) -> dict:
    """Validated OpenCV signals only. Requires human inspector confirmation.

    `category_id` selects the declared damage-detector profile. Two-wheeler
    and EV profiles are explicitly unavailable; no car detector is substituted
    and no AI damage prediction is claimed for them.
    """
    cid = category_id or categories.DEFAULT_CATEGORY_ID
    detector = categories.damage_detector_for(cid)
    result: dict[str, Any] = {
        "engine": "unavailable", "method": "none", "sha256": "",
        "category_id": cid,
        "damage_detector": detector,
        "signals": {}, "limitations": [
            "A single photograph cannot establish accident severity or hidden structural damage.",
            "No trained damage weights are present; YOLO is an adapter slot, not an active detector.",
            "All findings require human inspector validation.",
            str(detector.get("note") or ""),
        ],
    }
    if detector.get("status") != "available":
        result["limitations"].append(
            f"Category '{cid}' has no trained damage detector. Only low-level image statistics are reported; "
            "no damage class, severity or authenticity prediction is produced."
        )
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
        img = cv2.imread(str(image_path))
        if img is None:
            result["warnings"] = ["Could not decode image."]
            return result
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 80, 180)
        laplacian = cv2.Laplacian(gray, cv2.CV_64F).var()
        h = hashlib.sha256(image_path.read_bytes()).hexdigest()
        result.update({
            "engine": "opencv", "method": "edge-gradient-anomaly", "sha256": h,
            "signals": {
                "edge_density": round(float(edges.mean() / 255), 4),
                "focus_measure": round(float(laplacian), 2),
                "dimensions": [int(img.shape[1]), int(img.shape[0])],
            },
            "confidence": 0.4,
            "recommended_review_action": "Human inspector must confirm any damage claim.",
        })
    except Exception as exc:
        result["warnings"] = [f"OpenCV unavailable: {type(exc).__name__}: {exc}"]

    # Optional YOLO/ONNX damage adapter. Inactive without licensed weights, and
    # never upgrades a detection into a severity verdict.
    try:
        from .intelligence.damage import yolo
        detection = yolo.detect(image_path)
        result["object_detection"] = detection
        if detection.get("available") and detection.get("detections"):
            result["engine"] = f"{result.get('engine', 'opencv')}+{detection.get('engine')}"
            result["signals"]["detections"] = detection["detections"]
    except Exception as exc:
        result["object_detection"] = {
            "available": False, "engine": "none",
            "reason": f"{type(exc).__name__}: {exc}",
        }
    return result


def detect_all(vehicle_id: str, category_id: str | None = None) -> dict:
    """One shared detector pipeline, with category-selected rules.

    The battery report is included for every vehicle so the platform can state
    honestly that battery health was not assessed for combustion vehicles and
    was not invented for electric ones.
    """
    cat = (categories.get_category(category_id) if category_id else None) \
        or categories.resolve_vehicle_category(vehicle_id)
    cid = str(cat["id"])
    # Pass through only an EXPLICIT caller override. Resolving internally and
    # then re-passing the id would make legacy car rows look "new" and would
    # silently replace their original v1 thresholds.
    mileage = mileage_findings(vehicle_id, category_id)
    documents = document_findings(vehicle_id, category_id)
    battery = battery_findings(vehicle_id, category_id)
    reports = [mileage, documents, battery]
    all_findings = [f for r in reports for f in r.findings]
    return {
        "vehicle_id": vehicle_id,
        "generated_at": db.now_iso(),
        "category_id": cid,
        "category_label": cat["label"],
        "category_spec_version": categories.spec_version(),
        "rules_version": mileage.rules_version,
        "legacy_car_profile": mileage.legacy_car_profile,
        "reports": [r.model_dump() for r in reports],
        "finding_count": len(all_findings),
        "high_severity_count": sum(1 for f in all_findings if f.severity == "high"),
        "capabilities": {
            "damage_detector": categories.damage_detector_for(cid),
            "model3d": categories.model_asset_for(cid),
            "agent_nodes": categories.agent_nodes_for(cid),
        },
        "disclaimer": "Detector outputs are leads for human review, never proof of fraud or authenticity. "
                      "Missing history is unverified coverage, never clean history.",
    }
