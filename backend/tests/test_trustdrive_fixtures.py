"""Verification tests driven by the TrustDrive synthetic fixture dataset (manifest.csv).

Exercises both inline/generated equivalents (for CI portability) and the actual
fixture files under D:\\Downloads\\trustdrive_test_fixtures when available.
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path

import pytest

from app import db, detectors, extract, ocr

FIXTURE_ROOT = Path(r"D:\Downloads\trustdrive_test_fixtures\trustdrive_test_fixtures")


def _new_vehicle(
    reg: str,
    chassis: str,
    category_id: str,
    year: int = 2020,
    make: str = "Veloxa",
    model: str = "Strider 150",
    fuel: str = "Petrol",
) -> str:
    vid = f"v-fix-{uuid.uuid4().hex[:10]}"
    now = db.now_iso()
    db.insert(
        "vehicles",
        {
            "id": vid,
            "owner_id": "u-seller",
            "reg_no": reg,
            "vin": chassis,
            "make": make,
            "model": model,
            "variant": "",
            "year": year,
            "fuel": fuel,
            "transmission": "Manual" if fuel != "Electric" else "Direct drive",
            "category": category_id,
            "color": "Black",
            "ownership_count": 1,
            "location": "Pune",
            "km_claimed": 0,
            "last_verified_km": 0,
            "asking_price": 75000,
            "status": "draft",
            "trustdrive_id": f"TD-{vid[-6:].upper()}",
            "qr_token": f"qr-{vid}",
            "description": "SYNTHETIC TEST VEHICLE",
            "condition": "Good",
            "created_at": now,
            "updated_at": now,
            "vehicle_category_id": category_id,
        },
    )
    return vid


def _insert_doc(vid: str, doc_type: str, path: Path, sha: str | None = None) -> str:
    did = f"doc-fix-{uuid.uuid4().hex[:10]}"
    digest = sha or (ocr.sha256_file(path) if path.is_file() else uuid.uuid4().hex * 2)
    db.insert(
        "documents",
        {
            "id": did,
            "vehicle_id": vid,
            "status": "pending",
            "sha256": digest,
            "file_name": path.name,
            "file_key": f"documents/{vid}/{path.name}",
            "mime": "application/pdf" if path.suffix.lower() == ".pdf" else "image/png",
            "size_bytes": path.stat().st_size if path.is_file() else 0,
            "type": doc_type,
            "consent": 1,
            "version": 1,
            "extracted": "{}",
            "uploaded_at": db.now_iso(),
        },
    )
    return did


def _save_extracted(did: str, result: extract.ExtractionResult) -> None:
    db.update(
        "documents",
        did,
        {
            "extracted": json.dumps(
                {
                    "fields": result.fields.model_dump(),
                    "confidence": result.confidence,
                    "method": result.method,
                    "engine": result.engine,
                    "flags": result.flags,
                }
            )
        },
    )


def test_extract_fields_handles_compact_km_ocr_0d0_fullwidth_colon_and_ev():
    # Covers B02 (42,000km), B03 (0D0:042100km), G01 (44.100km), F01 (fullwidth colon & SOH)
    b02 = extract.extract_fields(
        "Invoice No\n:TD-INV-B-002\nInvoice Date\n:05-02-2024\nRegistration\n：MH12TD2002\n"
        "Chassis No\nTDSYN00000000B02\nModel Year\n2019\nOdometer\n: 42,000km",
        "petrol_motorcycle",
    )
    assert b02.registration_number == "MH12TD2002"
    assert b02.primary_identifier == "TDSYN00000000B02"
    assert b02.invoice_number == "TD-INV-B-002"
    assert b02.odometer_km == 42000

    b03 = extract.extract_fields(
        "ODOMETER READING (SYNTHETIC IMAGE)\nPhotodate:20-03-2024\nVehicle\n：MH12TD2002\n0D0:042100km",
        "petrol_motorcycle",
    )
    assert b03.registration_number == "MH12TD2002"
    assert b03.odometer_km == 42100

    g01 = extract.extract_fields(
        "Registration:MH12TD1001\nChassis No\n:TDSYN00000000A01\nOdometer\n44.100km",
        "petrol_motorcycle",
    )
    assert g01.odometer_km == 44100

    f01 = extract.extract_fields(
        "EV BATTERY SERVICE REPORT\nReport No\n:TD-EV-001\nReport Date\n12-07-2024\n"
        "Registration\nMH12TD4004\nChassis No\n：TDSYN00000000D04\nBattery Capacity: 3.0 kwh\n"
        "Battery Chemistry: Li-ion\nBattery Serial: TDBAT-000123\nState of Health : 91 %\nOdometer\n: 18,250 km",
        "electric_scooter",
    )
    assert f01.registration_number == "MH12TD4004"
    assert f01.primary_identifier == "TDSYN00000000D04"
    assert f01.invoice_number == "TD-EV-001"
    assert f01.battery_capacity_kwh == 3.0
    assert f01.battery_chemistry == "Li-ion"
    assert f01.battery_serial == "TDBAT-000123"
    assert f01.battery_soh == 91.0
    assert f01.odometer_km == 18250


@pytest.mark.skipif(not FIXTURE_ROOT.is_dir(), reason="Local trustdrive_test_fixtures dataset not present")
def test_manifest_pdf_and_security_cases_against_real_fixtures():
    docs_dir = FIXTURE_ROOT / "documents"
    sec_dir = FIXTURE_ROOT / "file_security"
    qual_dir = FIXTURE_ROOT / "ocr_quality"

    # H01-H06 file security validation in Python ocr.validate_file
    assert ocr.validate_file(sec_dir / "H01_empty.pdf")[0] is False
    assert ocr.validate_file(sec_dir / "H02_text_renamed.pdf")[0] is False
    assert ocr.validate_file(sec_dir / "H04_disallowed_extension.exe")[0] is False
    assert ocr.validate_file(sec_dir / "H05_oversize_26MB.pdf")[0] is False
    assert ocr.validate_file(sec_dir / "H06_double_extension.pdf.txt")[0] is False

    # Vehicle A (MH12TD1001) - A00..A03, D01, D02, E01, E02
    vid_a = _new_vehicle("MH12TD1001", "TDSYN00000000A01", "petrol_motorcycle", year=2020)
    d_a00 = _insert_doc(vid_a, "rc_2w", docs_dir / "A00_registration_sheet.pdf")
    r_a00 = extract.process_document(docs_dir / "A00_registration_sheet.pdf", d_a00, vid_a, "rc_2w")
    _save_extracted(d_a00, r_a00)
    assert r_a00.fields.registration_number == "MH12TD1001"
    assert r_a00.fields.primary_identifier == "TDSYN00000000A01"
    assert r_a00.fields.engine_number == "TDENG-A-0001"
    assert not any("mismatch" in f or "date" in f for f in r_a00.flags)

    d_a02 = _insert_doc(vid_a, "service_2w", docs_dir / "A02_service_invoice.pdf")
    r_a02 = extract.process_document(docs_dir / "A02_service_invoice.pdf", d_a02, vid_a, "service_2w")
    _save_extracted(d_a02, r_a02)
    assert r_a02.fields.invoice_number == "TD-INV-A-002"
    assert r_a02.fields.odometer_km == 28900

    # D01: future date
    d_d01 = _insert_doc(vid_a, "service_2w", docs_dir / "D01_invoice_future_date.pdf")
    r_d01 = extract.process_document(docs_dir / "D01_invoice_future_date.pdf", d_d01, vid_a, "service_2w")
    assert "future_document_date" in r_d01.flags

    # D02: before manufacture year 2020
    d_d02 = _insert_doc(vid_a, "service_2w", docs_dir / "D02_invoice_before_manufacture.pdf")
    r_d02 = extract.process_document(docs_dir / "D02_invoice_before_manufacture.pdf", d_d02, vid_a, "service_2w")
    assert "date_before_manufacture_year" in r_d02.flags

    # E01: exact SHA-256 duplicate of A02
    d_e01 = _insert_doc(vid_a, "service_2w", docs_dir / "E01_exact_duplicate_of_A02.pdf")
    r_e01 = extract.process_document(docs_dir / "E01_exact_duplicate_of_A02.pdf", d_e01, vid_a, "service_2w")
    assert r_e01.duplicate_of == d_a02

    # E02: different bytes, same invoice number TD-INV-A-002
    d_e02 = _insert_doc(vid_a, "service_2w", docs_dir / "E02_same_invoice_no_reuploaded.pdf")
    r_e02 = extract.process_document(docs_dir / "E02_same_invoice_no_reuploaded.pdf", d_e02, vid_a, "service_2w")
    _save_extracted(d_e02, r_e02)
    assert any(f.startswith("duplicate_reference_same_vehicle:") for f in r_e02.flags)
    doc_rep_a = detectors.document_findings(vid_a)
    assert any(f.anomaly_type == "repeated_invoice_number" for f in doc_rep_a.findings)

    # Vehicle C (MH12TD3003) - C01, C02, C03, E03
    vid_c = _new_vehicle("MH12TD3003", "TDSYN00000000C03", "petrol_motorcycle", year=2020)
    d_c01 = _insert_doc(vid_c, "service_2w", docs_dir / "C01_invoice_wrong_registration.pdf")
    r_c01 = extract.process_document(docs_dir / "C01_invoice_wrong_registration.pdf", d_c01, vid_c, "service_2w")
    assert "registration_number_mismatch" in r_c01.flags

    d_c02 = _insert_doc(vid_c, "service_2w", docs_dir / "C02_invoice_wrong_chassis.pdf")
    r_c02 = extract.process_document(docs_dir / "C02_invoice_wrong_chassis.pdf", d_c02, vid_c, "service_2w")
    assert "chassis_number_mismatch" in r_c02.flags

    d_c03 = _insert_doc(vid_c, "service_2w", docs_dir / "C03_invoice_model_year_conflict.pdf")
    r_c03 = extract.process_document(docs_dir / "C03_invoice_model_year_conflict.pdf", d_c03, vid_c, "service_2w")
    assert "model_year_mismatch" in r_c03.flags

    d_e03 = _insert_doc(vid_c, "service_2w", docs_dir / "E03_same_invoice_no_other_vehicle.pdf")
    r_e03 = extract.process_document(docs_dir / "E03_same_invoice_no_other_vehicle.pdf", d_e03, vid_c, "service_2w")
    assert any(f.startswith(f"cross_vehicle_reference_reuse:{vid_a}:") for f in r_e03.flags)

    # Vehicle D (MH12TD4004) - F01 EV battery service
    vid_d = _new_vehicle("MH12TD4004", "TDSYN00000000D04", "electric_scooter", year=2022, make="Zephyr", model="Glide EV", fuel="Electric")
    d_f01 = _insert_doc(vid_d, "battery_health", docs_dir / "F01_ev_battery_service.pdf")
    r_f01 = extract.process_document(docs_dir / "F01_ev_battery_service.pdf", d_f01, vid_d, "battery_health")
    assert r_f01.fields.battery_soh == 91.0
    assert r_f01.fields.battery_serial == "TDBAT-000123"
    assert r_f01.fields.battery_capacity_kwh == 3.0

    # G02 rotated 7 deg, G03 low res, G05 blank page
    d_g02 = _insert_doc(vid_a, "service_2w", qual_dir / "G02_rotated_7deg.png")
    r_g02 = extract.process_document(qual_dir / "G02_rotated_7deg.png", d_g02, vid_a, "service_2w")
    assert r_g02.fields.odometer_km == 44100
    assert "low_image_quality" in r_g02.flags

    d_g05 = _insert_doc(vid_a, "service_2w", qual_dir / "G05_blank_page.png")
    r_g05 = extract.process_document(qual_dir / "G05_blank_page.png", d_g05, vid_a, "service_2w")
    assert r_g05.low_confidence is True
    assert "unreadable_no_text" in r_g05.flags
    assert r_g05.fields.odometer_km is None

