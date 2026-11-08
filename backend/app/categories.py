"""Category rules for the multi-vehicle verification engine.

This module is the Python side of the SAME canonical specification consumed by
Next.js (`frontend/lib/vehicle-categories.json` -> `lib/vehicle-categories.ts`).
There is deliberately no second copy of the taxonomy: adding a category means
adding a profile to the JSON, never rewriting the verification engine.

Nothing here decides that a vehicle is genuine. It only decides which rules,
fields, documents, components and thresholds apply to a given vehicle class.
"""
from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

DEFAULT_SPEC_PATH = Path(__file__).resolve().parents[2] / "frontend" / "lib" / "vehicle-categories.json"
DEFAULT_CATEGORY_ID = "passenger_car"


def spec_path() -> Path:
    return Path(os.getenv("TD_CATEGORY_SPEC", str(DEFAULT_SPEC_PATH)))


@lru_cache(maxsize=1)
def spec() -> dict[str, Any]:
    with spec_path().open("r", encoding="utf-8") as fh:
        return json.load(fh)


def spec_version() -> str:
    return str(spec().get("version", "unknown"))


def trust_version() -> str:
    return str(spec().get("trustVersion", "trust-v2-multicategory"))


def categories() -> list[dict[str, Any]]:
    return list(spec().get("categories", []))


def planned_categories() -> list[dict[str, Any]]:
    return list(spec().get("plannedCategories", []))


def get_category(category_id: str | None) -> dict[str, Any] | None:
    if not category_id:
        return None
    return next((c for c in categories() if c["id"] == category_id), None)


def _norm(value: str | None) -> str:
    return re.sub(r"[_\s-]+", " ", str(value or "").strip().lower())


def _electric_variant(category_id: str) -> str:
    """Map a combustion profile onto its electric counterpart (legacy rows only)."""
    return {
        "petrol_motorcycle": "electric_motorcycle",
        "petrol_scooter": "electric_scooter",
        "passenger_car": "electric_car",
        "moped": "electric_bike",
        "auto_rickshaw": "electric_three_wheeler",
        "passenger_three_wheeler": "electric_three_wheeler",
        "cargo_three_wheeler": "electric_three_wheeler",
        "hatchback": "electric_car",
        "suv": "electric_car",
        "muv": "electric_car",
    }.get(category_id, category_id)


def match_category_id(raw: str | None, fuel: str | None = None) -> str | None:
    """STRICT resolver: returns None for an unknown category instead of
    silently applying car rules. Use this at API/registration boundaries.

    Accepts explicit ids, human labels, legacy free-text body styles and the
    legacy type strings. "Sedan" + "Electric" maps to electric_car so an EV
    never gets a PUC or an engine-number requirement. An explicit new id is
    authoritative and is never remapped by fuel.
    """
    if not raw:
        return None
    exact = get_category(raw)
    if exact:
        return exact["id"]
    norm = _norm(raw)
    if not norm:
        return None
    candidate: str | None = None
    for cat in categories():
        labels = {_norm(cat["label"]), _norm(cat.get("shortLabel")), _norm(cat.get("type"))}
        if norm in labels:
            candidate = cat["id"]
            break
    if candidate is None:
        for cat in categories():
            if any(_norm(legacy) == norm for legacy in cat.get("legacyCategories", [])):
                candidate = cat["id"]
                break
    if candidate is None:
        if re.search(r"moped", raw, re.I):
            candidate = "moped"
        elif re.search(r"electric\s*bike|e-?bike|electric\s*bicycle|e-?bicycle", raw, re.I):
            candidate = "electric_bike"
        elif re.search(r"electric\s*(auto|rickshaw|three)|e-?rickshaw", raw, re.I):
            candidate = "electric_three_wheeler"
        elif re.search(r"auto\s*rickshaw|rickshaw|tuk\s*tuk", raw, re.I):
            candidate = "auto_rickshaw"
        elif re.search(r"cargo.*three|goods.*three|loader\s*rickshaw", raw, re.I):
            candidate = "cargo_three_wheeler"
        elif re.search(r"three[\s-]?wheeler|3[\s-]?wheeler|tricycle", raw, re.I):
            candidate = "passenger_three_wheeler"
        elif re.search(r"hatchback", raw, re.I):
            candidate = "hatchback"
        elif re.search(r"suv|sport utility", raw, re.I):
            candidate = "suv"
        elif re.search(r"muv|mpv|multi utility", raw, re.I):
            candidate = "muv"
        elif re.search(r"hybrid", raw, re.I):
            candidate = "hybrid_car"
        elif re.search(r"electric commercial|e-?truck|electric\s*truck|electric van|electric lcv|electric bus|electric lorry", raw, re.I):
            candidate = "electric_commercial"
        elif re.search(r"light commercial|\blcv\b|pickup|delivery van", raw, re.I):
            candidate = "light_commercial"
        elif re.search(r"truck|lorry|heavy vehicle", raw, re.I):
            candidate = "truck"
        elif re.search(r"\bbus\b|coach|stage carriage", raw, re.I):
            candidate = "bus"
        elif re.search(r"bike|motorcycle|superbike", raw, re.I):
            candidate = "petrol_motorcycle"
        elif re.search(r"scooter", raw, re.I):
            candidate = "petrol_scooter"
        elif re.search(r"car|sedan|coupe", raw, re.I):
            candidate = "passenger_car"
    if candidate and not get_category(candidate):
        return None
    if candidate and fuel and "electric" in str(fuel).lower():
        candidate = _electric_variant(candidate)
    return candidate


def resolve_category_id(raw: str | None, fuel: str | None = None) -> str:
    """Lenient resolver for LEGACY DB rows: unknown/empty text means a car.

    New registration and API boundaries must use `match_category_id()` so a
    typo can never be silently treated as a passenger car.
    """
    return match_category_id(raw, fuel) or DEFAULT_CATEGORY_ID


def category_for_vehicle(row: dict[str, Any] | None) -> dict[str, Any]:
    """Resolve a category from a DB row without rewriting any legacy car row."""
    row = row or {}
    explicit = row.get("vehicle_category_id")
    if explicit and get_category(str(explicit)):
        return get_category(str(explicit))  # type: ignore[return-value]
    cid = resolve_category_id(row.get("category"), row.get("fuel"))
    return get_category(cid) or get_category(DEFAULT_CATEGORY_ID)  # type: ignore[return-value]


def is_explicit_category_row(row: dict[str, Any] | None) -> bool:
    """True when the DB row carries the new authoritative category column."""
    explicit = (row or {}).get("vehicle_category_id")
    return bool(explicit and get_category(str(explicit)))


def resolve_vehicle_category(vehicle_id: str) -> dict[str, Any]:
    """Read the shared DB and resolve one vehicle's category profile.

    Lazy import avoids a module cycle: db.py imports settings only. A missing
    vehicle (or a legacy test schema without the category column) resolves to
    the car profile, so existing car behaviour is never broken.
    """
    from . import db  # noqa: WPS433 (deliberate lazy import)

    try:
        rows = db.read("vehicles", where="id = :v", params={"v": vehicle_id}, limit=1)
    except Exception:
        rows = []
    return category_for_vehicle(rows[0] if rows else None)


def category_id_for_vehicle(vehicle_id: str) -> str:
    return str(resolve_vehicle_category(vehicle_id)["id"])


def identity_for(category_id: str) -> dict[str, Any]:
    cat = get_category(category_id) or get_category(DEFAULT_CATEGORY_ID)
    assert cat is not None
    return dict(cat["identity"])


def required_document_ids(category_id: str) -> list[str]:
    cat = get_category(category_id) or get_category(DEFAULT_CATEGORY_ID)
    assert cat is not None
    return list(cat.get("requiredDocuments") or [])


def soh_note(category_id: str) -> str | None:
    rules = mileage_rules_for(category_id)
    return rules.get("sohNote")


def class_label(class_id: str) -> str:
    return next((c["label"] for c in spec().get("classes", []) if c["id"] == class_id), class_id)


def powertrain(cat: dict[str, Any]) -> dict[str, Any]:
    return next(
        (p for p in spec().get("powertrains", []) if p["id"] == cat.get("powertrain")),
        {"id": "petrol", "hasEngine": True, "hasBatteryPack": False, "pucApplicable": True},
    )


def is_electric(category_id: str) -> bool:
    cat = get_category(category_id) or get_category(DEFAULT_CATEGORY_ID)
    return bool(cat and cat.get("powertrain") == "electric")


def has_battery_pack(category_id: str) -> bool:
    """True for battery-electric AND hybrid profiles (battery evidence applies)."""
    cat = get_category(category_id) or get_category(DEFAULT_CATEGORY_ID)
    return bool(cat and powertrain(cat).get("hasBatteryPack"))


def has_engine(category_id: str) -> bool:
    cat = get_category(category_id) or get_category(DEFAULT_CATEGORY_ID)
    return bool(cat and powertrain(cat).get("hasEngine"))


def puc_applicable(category_id: str) -> bool:
    cat = get_category(category_id) or get_category(DEFAULT_CATEGORY_ID)
    return bool(cat and "puc" in (cat.get("documents") or []))


def normalize_identifier(value: str | None) -> str:
    return re.sub(r"[\s-]", "", str(value or "").upper())


def normalize_reg(value: str | None) -> str:
    return re.sub(r"[\s-]", "", str(value or "").upper())


def registration_pattern(jurisdiction: str | None = None) -> str:
    j = spec().get("jurisdictions", {})
    key = jurisdiction or spec().get("defaultJurisdiction", "IN")
    return str((j.get(key) or j.get("IN") or {}).get("registrationPattern", r"^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$"))


def validate_identity(
    category_id: str,
    reg: str | None = None,
    identifier: str | None = None,
    engine_number: str | None = None,
    motor_number: str | None = None,
    jurisdiction: str | None = None,
    require_all: bool = False,
) -> tuple[bool, list[str], str, str]:
    """Category-specific identifier validation. No universal 17-char VIN rule.

    Returns (ok, errors, normalised_reg, normalised_identifier).
    `require_all=False` tolerates omitted values for partial/PATCH payloads.
    """
    cat = get_category(category_id) or get_category(DEFAULT_CATEGORY_ID)
    assert cat is not None
    ident = cat["identity"]
    errors: list[str] = []
    nreg = normalize_reg(reg)
    nid = normalize_identifier(identifier)

    if nreg:
        if not re.match(registration_pattern(jurisdiction), nreg):
            example = (spec().get("jurisdictions", {}).get(jurisdiction or "IN") or {}).get("registrationExample", "MH12AB1234")
            errors.append(f"Registration must look like {example}.")
    elif require_all:
        errors.append("Registration number is required.")

    if nid:
        if not re.match(ident["primaryPattern"], nid):
            errors.append(
                "VIN must be 17 characters and must not contain I, O or Q."
                if ident.get("vinApplicable")
                else f"{ident['primaryLabel']} must be 8-22 letters/digits; the 17-character car VIN rule does not apply here."            )
    elif require_all:
        errors.append(f"{ident['primaryLabel']} is required.")

    if engine_number and ident.get("engineNumberPattern") and not re.match(ident["engineNumberPattern"], normalize_identifier(engine_number)):
        errors.append("Engine number has an unexpected format.")
    if motor_number and ident.get("motorNumberPattern") and not re.match(ident["motorNumberPattern"], normalize_identifier(motor_number)):
        errors.append("Motor number has an unexpected format.")

    # An electric vehicle must never be required to provide a combustion-engine number.
    if has_engine(cat["id"]) is False and engine_number:
        errors.append("Engine number is not applicable to an electric vehicle; use the motor number instead.")

    return (not errors, errors, nreg, nid)


def fields_for(category_id: str) -> list[dict[str, Any]]:
    cat = get_category(category_id) or get_category(DEFAULT_CATEGORY_ID)
    assert cat is not None
    catalog = spec().get("fieldCatalog", {})
    ev = is_electric(cat["id"])
    out: list[dict[str, Any]] = []
    for group in cat.get("fieldGroups", []):
        for name in group["fields"]:
            base = catalog.get(name)
            if not base:
                continue
            if name in ("engine_number", "engine_cc") and ev:
                continue
            if name == "motor_number" and not ev:
                continue
            field = {**base, "name": name, "group": group["label"]}
            if name == "primary_identifier":
                field["label"] = cat["identity"]["primaryLabel"]
                field["placeholder"] = cat["identity"]["primaryExample"]
                field["help"] = cat["identity"]["primaryNote"]
            if name == "odometer_km":
                field["label"] = f"{cat.get('labels', {}).get('odometer', 'Odometer')} reading (km)"
            out.append(field)
    return out


def documents_for(category_id: str) -> list[dict[str, Any]]:
    cat = get_category(category_id) or get_category(DEFAULT_CATEGORY_ID)
    assert cat is not None
    catalog = spec().get("documentCatalog", {})
    required = set(cat.get("requiredDocuments") or [])
    return [
        {"id": d, "label": catalog.get(d, {}).get("label", d), "required": d in required}
        for d in cat.get("documents", [])
    ]


def allowed_document_ids(category_id: str) -> set[str]:
    return {d["id"] for d in documents_for(category_id)} | {d["id"] for d in documents_for(DEFAULT_CATEGORY_ID)}


def component_ids_for(category_id: str) -> list[str]:
    cat = get_category(category_id) or get_category(DEFAULT_CATEGORY_ID)
    assert cat is not None
    set_id = (cat.get("damage") or {}).get("componentSet", "car")
    return list(spec().get("componentSets", {}).get(set_id, {}).get("components", []))


def damage_detector_for(category_id: str) -> dict[str, Any]:
    cat = get_category(category_id) or get_category(DEFAULT_CATEGORY_ID)
    assert cat is not None
    key = (cat.get("damage") or {}).get("detector", "car")
    return dict(spec().get("damageDetectors", {}).get(key) or {"status": "unavailable", "note": "No detector configured."})


def model_asset_for(category_id: str) -> dict[str, Any]:
    cat = get_category(category_id) or get_category(DEFAULT_CATEGORY_ID)
    assert cat is not None
    key = (cat.get("model3d") or {}).get("asset", "labelled_schematic")
    asset = dict(spec().get("modelAssets", {}).get(key) or spec()["modelAssets"]["labelled_schematic"])
    asset["categoryId"] = cat["id"]
    asset["interactionsAvailable"] = bool((cat.get("model3d") or {}).get("interactionsAvailable"))
    asset["note"] = (cat.get("model3d") or {}).get("note", asset.get("note", ""))
    return asset


def mileage_rules_for(category_id: str) -> dict[str, Any]:
    cat = get_category(category_id) or get_category(DEFAULT_CATEGORY_ID)
    assert cat is not None
    return dict(cat.get("mileage") or {})


def trust_weights_for(category_id: str) -> tuple[str, dict[str, float]]:
    cat = get_category(category_id) or get_category(DEFAULT_CATEGORY_ID)
    assert cat is not None
    trust = cat.get("trust") or {}
    return str(trust.get("version", trust_version())), dict(trust.get("weights") or {})


def agent_nodes_for(category_id: str) -> list[str]:
    cat = get_category(category_id) or get_category(DEFAULT_CATEGORY_ID)
    assert cat is not None
    return list(cat.get("agentNodes") or [])


def labels_for(category_id: str) -> dict[str, str]:
    cat = get_category(category_id) or get_category(DEFAULT_CATEGORY_ID)
    assert cat is not None
    return dict(cat.get("labels") or {"primaryIdentifier": "VIN", "odometer": "Odometer", "propulsion": "Engine", "puc": "PUC certificate"})


def ocr_fields() -> list[str]:
    return list(spec().get("ocrFields", []))


def describe() -> dict[str, Any]:
    """Reported in /health so the active category engine is never a guess."""
    return {
        "version": spec_version(),
        "spec_path": str(spec_path()),
        "implemented": [c["id"] for c in categories() if c.get("status") == "implemented"],
        "planned": [c["id"] for c in planned_categories()],
        "trust_version": trust_version(),
        "agent_node_counts": {c["id"]: len(c.get("agentNodes") or []) for c in categories()},
        "note": "One shared verification engine. Category profiles supply rules only; unavailable 3D/CV capabilities are reported, never fabricated.",
    }
