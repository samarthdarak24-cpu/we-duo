"""Multi-category verification engine tests (Python intelligence layer).

These prove ONE shared engine with category-selected rules: no universal VIN
rule, no invented battery health, no car-scale distance ceiling on a scooter,
no car 3D asset for a two-wheeler, and conditional agent node execution.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import agent, categories, db, detectors, explain, extract
from app.main import app

client = TestClient(app, headers={"X-Service-Token": "qa-test-service-token"})


def _vehicle(category_id: str, fuel: str = "petrol") -> str:
    vid = db.new_id("v-cat")
    db.insert("vehicles", {
        "id": vid, "owner_id": "u-seller", "reg_no": "MH12AB3456",
        "vin": "ME4JC259E8T000123", "make": "Test", "model": "Probe",
        "year": 2022, "fuel": fuel, "category": category_id,
        "vehicle_category_id": category_id, "status": "draft",
        "trustdrive_id": f"TD-{vid}", "created_at": db.now_iso(),
        "updated_at": db.now_iso(),
    })
    return vid


def _readings(vid: str, points: list[tuple[str, int]]) -> None:
    for date, km in points:
        db.insert("mileage_readings", {
            "id": db.new_id("m"), "vehicle_id": vid, "km": km, "date": date,
            "flagged": 0, "verified": 1, "source": "service_invoice",
        })


# --- Canonical taxonomy ----------------------------------------------------

EXPECTED_CATEGORIES = [
    "petrol_motorcycle", "petrol_scooter", "electric_scooter", "electric_motorcycle",
    "passenger_car", "electric_car", "moped", "electric_bike", "auto_rickshaw",
    "electric_three_wheeler", "passenger_three_wheeler", "cargo_three_wheeler",
    "hatchback", "suv", "muv", "hybrid_car", "light_commercial", "truck", "bus",
    "electric_commercial",
]


def test_one_canonical_taxonomy_has_twenty_implemented_profiles():
    assert categories.spec_version() == "multicategory-2.0.0"
    assert categories.trust_version() == "trust-v2-multicategory"
    implemented = [c for c in categories.categories() if c.get("status") == "implemented"]
    assert [c["id"] for c in implemented] == EXPECTED_CATEGORIES
    assert categories.planned_categories() == []


@pytest.mark.parametrize("raw,fuel,expected", [
    ("Sedan", "Petrol", "passenger_car"),
    ("Sedan", "Electric", "electric_car"),
    ("Scooter", "Electric", "electric_scooter"),
    ("electric_scooter", "Petrol", "electric_scooter"),  # explicit id is authoritative
    ("Hatchback", "Petrol", "hatchback"),
    ("SUV", "Diesel", "suv"),
    ("MUV", "Petrol", "muv"),
    ("Hybrid", "Hybrid", "hybrid_car"),
    ("Moped", "Petrol", "moped"),
    ("E-Bike", "Electric", "electric_bike"),
    ("Auto Rickshaw", "Petrol", "auto_rickshaw"),
    ("E-Rickshaw", "Electric", "electric_three_wheeler"),
    ("Cargo Three-Wheeler", "Diesel", "cargo_three_wheeler"),
    ("LCV", "Diesel", "light_commercial"),
    ("Lorry", "Diesel", "truck"),
    ("Coach", "Diesel", "bus"),
    ("Electric Truck", "Electric", "electric_commercial"),
])
def test_category_resolution_handles_legacy_and_explicit_ids(raw, fuel, expected):
    assert categories.resolve_category_id(raw, fuel) == expected
    assert categories.match_category_id(raw, fuel) == expected


def test_identifier_validation_is_category_specific():
    car = categories.validate_identity("passenger_car", reg="MH12AB3456",
                                       identifier="WBA8E9G50GNU12345", require_all=True)
    assert car[0] is True
    bad_car = categories.validate_identity("passenger_car", reg="MH12AB3456",
                                           identifier="ME4JC259", require_all=True)
    assert bad_car[0] is False and "VIN" in " ".join(bad_car[1])

    bike = categories.validate_identity("petrol_motorcycle", reg="MH12AB3456",
                                        identifier="ME4JC259E8T000123", require_all=True)
    assert bike[0] is True, "a 17-char frame number must not be forced into the car VIN rule"
    short = categories.validate_identity("petrol_scooter", reg="MH12AB3456",
                                         identifier="MD2DS123", require_all=True)
    assert short[0] is True, "8-character scooter frame numbers are valid"

    for cid in ("moped", "auto_rickshaw", "passenger_three_wheeler", "cargo_three_wheeler",
                "light_commercial", "truck", "bus", "electric_commercial"):
        ok = categories.validate_identity(cid, reg="MH12AB3456",
                                          identifier="MAT12345678901234", require_all=True)
        assert ok[0] is True, cid
        bad = categories.validate_identity(cid, reg="MH12AB3456",
                                           identifier="ABC", require_all=True)
        assert bad[0] is False, cid

    for cid in ("hatchback", "suv", "muv", "hybrid_car"):
        assert categories.validate_identity(
            cid, reg="MH12AB3456", identifier="WBA8E9G50GNU12345", require_all=True)[0] is True
        assert categories.validate_identity(
            cid, reg="MH12AB3456", identifier="ME4JC259", require_all=True)[0] is False


def test_electric_vehicles_never_require_an_engine_number():
    for cid in ("electric_scooter", "electric_bike", "electric_three_wheeler", "electric_commercial"):
        bad = categories.validate_identity(cid, reg="MH12AB3456",
                                           identifier="MAT12345678901234",
                                           engine_number="ENG123", require_all=True)
        assert bad[0] is False, cid
        assert any("Engine number is not applicable" in e for e in bad[1]), cid
        fields = {f["name"] for f in categories.fields_for(cid)}
        assert "engine_number" not in fields and "engine_cc" not in fields, cid
        assert "motor_number" in fields, cid
        assert categories.puc_applicable(cid) is False, cid
        assert categories.has_battery_pack(cid) is True, cid
    assert categories.puc_applicable("petrol_scooter") is True
    assert categories.has_engine("electric_car") is False


def test_hybrid_keeps_engine_fields_and_requires_battery_evidence():
    fields = {f["name"] for f in categories.fields_for("hybrid_car")}
    assert "engine_cc" in fields
    assert "battery_soh" in fields
    assert categories.has_engine("hybrid_car") is True
    assert categories.has_battery_pack("hybrid_car") is True
    assert categories.has_battery_pack("passenger_car") is False
    assert categories.puc_applicable("hybrid_car") is True
    docs = {d["id"] for d in categories.documents_for("hybrid_car")}
    assert {"battery_health", "battery_warranty", "puc"} <= docs


def test_commercial_and_three_wheeler_documents_are_category_specific():
    three = {d["id"] for d in categories.documents_for("cargo_three_wheeler")}
    assert {"rc_3w", "insurance_3w", "fitness", "goods_permit"} <= three
    auto = categories.required_document_ids("auto_rickshaw")
    assert {"rc_3w", "insurance_3w", "fitness", "permit"} <= set(auto)
    truck = {d["id"] for d in categories.documents_for("truck")}
    assert {"rc_commercial", "insurance_commercial", "fitness", "road_tax", "goods_permit"} <= truck
    assert {"passenger_permit"} <= {d["id"] for d in categories.documents_for("bus")}
    assert "rc_commercial" not in {d["id"] for d in categories.documents_for("petrol_scooter")}


def test_category_component_sets_cover_three_wheelers_and_commercial_vehicles():
    three = categories.component_ids_for("auto_rickshaw")
    assert "canopy" in three and "cargo_box" in three
    commercial = categories.component_ids_for("truck")
    assert "chassis_frame" in commercial and "load_body" in commercial
    assert "battery_pack" in categories.component_ids_for("electric_commercial")
    assert "pedals" in categories.component_ids_for("electric_bike")
    assert categories.damage_detector_for("passenger_car")["status"] == "available"
    for cid in ("auto_rickshaw", "electric_three_wheeler", "cargo_three_wheeler",
                "truck", "bus", "electric_commercial"):
        detector = categories.damage_detector_for(cid)
        assert detector["status"] == "unavailable", cid
        assert detector["classes"] == [], cid


# --- Category-aware deterministic detectors --------------------------------

def test_scooter_has_a_lower_distance_ceiling_than_a_car():
    scooter = _vehicle("petrol_scooter")
    car = _vehicle("passenger_car")
    # 22,500 km in 60 days = 375 km/day: below the car ceiling, above scooter's.
    _readings(scooter, [("2024-01-01", 10_000), ("2024-03-01", 32_500)])
    _readings(car, [("2024-01-01", 10_000), ("2024-03-01", 32_500)])
    s = detectors.mileage_findings(scooter)
    c = detectors.mileage_findings(car)
    assert s.category_id == "petrol_scooter"
    assert s.rules_version == detectors.RULES_VERSION
    assert c.category_id == "passenger_car"
    assert "implausible_daily_distance" in {f.anomaly_type for f in s.findings}
    assert "implausible_daily_distance" not in {f.anomaly_type for f in c.findings}


def test_legacy_car_rows_keep_the_original_rules_version():
    report = detectors.mileage_findings("v-test")
    assert report.legacy_car_profile is True
    assert report.rules_version == detectors.LEGACY_RULES_VERSION


def test_electric_distance_is_labelled_and_soh_is_never_a_reading():
    report = detectors.mileage_findings("v-demo-escooter")
    assert report.category_id == "electric_scooter"
    assert any("NEVER" in x for x in report.limitations)


def test_battery_findings_report_provenance_and_never_invent_soh():
    ev = detectors.battery_findings("v-demo-escooter")
    types = {f.anomaly_type for f in ev.findings}
    assert "unsourced_battery_claim" in types
    assert "unverified_battery_health" not in types, "one sourced record exists in the fixture"
    assert any("UNVERIFIED" in x for x in ev.limitations) or \
        any("never" in x.lower() for x in ev.limitations)
    combustion = detectors.battery_findings("v-test")
    assert combustion.findings == []
    assert any("do not apply" in x for x in combustion.limitations)

    hybrid_id = _vehicle("hybrid_car", "hybrid")
    hybrid = detectors.battery_findings(hybrid_id)
    assert hybrid.category_id == "hybrid_car"
    assert any("battery pack" in x for x in hybrid.limitations)
    assert any(f.anomaly_type == "unverified_battery_health" for f in hybrid.findings)


def test_detect_all_is_category_aware_and_reports_capabilities():
    report = detectors.detect_all("v-demo-ebike")
    assert report["category_id"] == "electric_motorcycle"
    assert len(report["reports"]) == 3  # mileage + document + battery
    assert len(report["capabilities"]["agent_nodes"]) == 16
    assert report["capabilities"]["model3d"]["status"] == "unavailable"
    assert report["capabilities"]["damage_detector"]["status"] == "unavailable"


def test_damage_detector_is_honest_for_two_wheelers(tmp_path):
    p = tmp_path / "photo.png"
    p.write_bytes(b"not-an-image")
    car = detectors.damage_signals(p, "passenger_car")
    bike = detectors.damage_signals(p, "petrol_motorcycle")
    assert car["damage_detector"]["status"] == "available"
    assert bike["damage_detector"]["status"] == "unavailable"
    assert any("no trained damage detector" in x.lower() for x in bike["limitations"])


# --- Category-aware versioned trust score ----------------------------------

def test_trust_weights_are_versioned_and_category_specific():
    car = explain.compute("v-test")
    ev = explain.compute("v-demo-escooter")
    assert car.version == ev.version == "trust-v2-multicategory"
    assert len(car.contributions) == 6
    assert len(ev.contributions) == 8
    assert {c.factor for c in ev.contributions} >= {
        "battery_health_evidence", "battery_replacement_history", "motor_service_information"}
    assert car.weights != ev.weights
    assert car.base_score == 50 and 0 <= car.score <= 100 and 0 <= ev.score <= 100
    assert explain.persist(ev) is True


def test_no_battery_evidence_is_unverified_not_clean():
    # A fresh EV with no battery rows at all: the score must report UNVERIFIED,
    # never a healthy battery and never a fraud penalty.
    vid = _vehicle("electric_motorcycle", "electric")
    ev = explain.compute(vid)
    battery = next(c for c in ev.contributions if c.factor == "battery_health_evidence")
    assert battery.ratio == 0.0 and battery.points == 0.0
    assert battery.status == "unverified"
    assert any("UNVERIFIED" in x for x in ev.unverified_areas)
    assert any("never invented" in x or "never" in x.lower() for x in ev.limitations)


# --- Category-aware OCR extraction -----------------------------------------

def test_car_document_extracts_a_17_character_vin():
    text = "Registration: MH12AB3456 VIN: WBA8E9G50GNU12345 Odometer: 12,000 km"
    f = extract.extract_fields(text, "passenger_car")
    assert f.vin == "WBA8E9G50GNU12345"
    assert f.primary_identifier == f.vin
    assert f.chassis_number is None


def test_two_wheeler_document_extracts_chassis_not_vin():
    text = ("Registration: MH12AB3456 Chassis No: ME4JC259E8T000123 "
            "Engine No: JC25E8000123 Odometer: 12,000 km")
    f = extract.extract_fields(text, "petrol_motorcycle")
    assert f.vin is None, "the car VIN rule must not be applied to a motorcycle"
    assert f.chassis_number == "ME4JC259E8T000123"
    assert f.primary_identifier == f.chassis_number
    assert f.engine_number == "JC25E8000123"


def test_ev_document_extracts_motor_and_battery_but_no_engine():
    text = ("Registration: MH12EF1234 Frame No: MD2DSB123K1A00421 "
            "Motor No: MTR9A2024 Battery Serial: BAT-2024-0099 "
            "Battery Capacity: 3.7 kWh Total Distance: 8,000 km")
    f = extract.extract_fields(text, "electric_scooter")
    assert f.vin is None
    assert f.frame_number == "MD2DSB123K1A00421"
    assert f.motor_number == "MTR9A2024"
    assert f.battery_serial == "BAT-2024-0099"
    assert f.battery_capacity_kwh == 3.7
    assert f.odometer_km == 8000
    assert f.engine_number is None


def test_extraction_workflow_is_category_aware_and_still_18_steps(tmp_path):
    p = tmp_path / "bike-rc.pdf"
    p.write_bytes(b"%PDF-1.4\n% no object table\n%%EOF\n")
    r = extract.process_document(p, "doc-cat-test", "v-demo-bike", "rc_2w")
    assert len(r.workflow) == 18
    assert r.category_id == "petrol_motorcycle"
    assert r.fields.category_id == "petrol_motorcycle"
    assert r.comparison["category_id"] == "petrol_motorcycle"
    assert "not proof" in r.warning.lower()


# --- Conditional LangGraph investigator ------------------------------------

def test_agent_node_lists_are_conditional():
    assert len(agent.nodes_for("passenger_car")) == 15
    assert len(agent.nodes_for("petrol_scooter")) == 15
    assert len(agent.nodes_for("truck")) == 15
    assert len(agent.nodes_for("electric_scooter")) == 16
    assert len(agent.nodes_for("hybrid_car")) == 16
    assert len(agent.nodes_for("electric_commercial")) == 16
    assert "EVBatteryAnalysisNode" not in agent.nodes_for("petrol_motorcycle")
    assert "EVBatteryAnalysisNode" not in agent.nodes_for("truck")
    assert "EVBatteryAnalysisNode" in agent.nodes_for("electric_motorcycle")
    assert "EVBatteryAnalysisNode" in agent.nodes_for("hybrid_car")


def test_investigation_executes_only_relevant_nodes_and_names_category():
    bike = agent.investigate("v-demo-bike", "Any recorded frame-number conflict?")
    assert bike.category_id == "petrol_motorcycle"
    assert bike.node_count == 15
    assert "EVBatteryAnalysisNode" not in bike.nodes
    ev = agent.investigate("v-demo-ecar", "Is the battery health documented?")
    assert ev.category_id == "electric_car"
    assert ev.node_count == 16
    assert "EVBatteryAnalysisNode" in ev.nodes
    assert ev.orchestrator in ("langgraph", "sequential-fallback")
    assert ev.explanation["version"] == "trust-v2-multicategory"


def test_describe_graph_reports_fallback_honestly():
    d = agent.describe_graph()
    assert d["version"].endswith("multicategory")
    assert d["orchestrator"] in ("langgraph", "sequential-fallback")
    if d["orchestrator"] == "sequential-fallback":
        assert d["checkpointing"] is False
        assert d["error"]


# --- HTTP surface -----------------------------------------------------------

def test_category_catalogue_endpoint_is_public_and_complete():
    r = client.get("/api/intelligence/categories")
    assert r.status_code == 200
    body = r.json()
    ids = {c["id"] for c in body["categories"]}
    assert set(EXPECTED_CATEGORIES) <= ids
    scooter = next(c for c in body["categories"] if c["id"] == "electric_scooter")
    assert "EVBatteryAnalysisNode" in scooter["agent_nodes"]
    assert scooter["model3d"]["status"] == "unavailable"
    assert scooter["damage_detector"]["status"] == "unavailable"
    truck = next(c for c in body["categories"] if c["id"] == "truck")
    assert {"rc_commercial", "fitness", "goods_permit"} <= {d["id"] for d in truck["documents"]}
    assert truck["damage_detector"]["status"] == "unavailable"


def test_category_profile_endpoint_resolves_legacy_labels():
    r = client.get("/api/intelligence/categories/Sedan")
    assert r.status_code == 200
    assert r.json()["id"] == "passenger_car"
    assert client.get("/api/intelligence/categories/not-a-category").status_code == 404


def test_category_override_is_honoured_on_fraud_and_trust_endpoints():
    r = client.get("/api/intelligence/fraud/v-test?category_id=petrol_scooter")
    assert r.status_code == 200
    assert r.json()["category_id"] == "petrol_scooter"
    t = client.get("/api/intelligence/trust-score/v-test?category_id=electric_scooter")
    assert t.status_code == 200
    assert t.json()["category_id"] == "electric_scooter"
    assert len(t.json()["contributions"]) == 8
