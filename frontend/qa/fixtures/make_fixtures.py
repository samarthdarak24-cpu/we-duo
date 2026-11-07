"""Generate real test fixtures for the TrustDrive live audit.

The documents are genuine PDFs with a real text layer so the production OCR
pipeline (PyMuPDF text layer / RapidOCR) has actual machine-readable content to
extract. Nothing here fakes a result - the fixtures only give the real engine
something real to read.
"""
from __future__ import annotations

import os
import shutil
import zlib
from pathlib import Path

import fitz  # PyMuPDF

HERE = Path(__file__).resolve().parent
PUBLIC_IMAGES = HERE.parent.parent / "public" / "images" / "cars"


def _pdf(path: Path, title: str, lines: list[str]) -> None:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4
    y = 72
    page.insert_text((72, y), title, fontsize=17, fontname="hebo")
    y += 34
    for line in lines:
        page.insert_text((72, y), line, fontsize=11, fontname="cour")
        y += 17
    doc.save(str(path))
    doc.close()


def rc_pdf(path: Path, reg: str, identifier: str, label: str, engine_line: str | None) -> None:
    lines = [
        "REGISTRATION CERTIFICATE (R.C.)",
        "",
        f"Registration No: {reg}",
        f"{label}: {identifier}",
    ]
    if engine_line:
        lines.append(engine_line)
    lines += [
        "Owner Name: TrustDrive QA Test Owner",
        "Vehicle Model: Honda Activa 6G",
        "Manufacturer Year: 2021",
        "Date of Registration: 12/03/2021",
        "Date of Expiry: 12/03/2031",
        "Odometer Reading: 12450",
        "Address: 12 Test Street, Pune, Maharashtra",
        "",
        "This is a generated test document for automated verification testing.",
    ]
    _pdf(path, "VEHICLE REGISTRATION CERTIFICATE", lines)


def service_pdf(path: Path, reg: str, km: int, amount: str) -> None:
    lines = [
        "SERVICE INVOICE",
        "",
        f"Registration No: {reg}",
        f"Model: Honda Activa 6G",
        f"Odometer: {km}",
        f"Total Amount: INR {amount}",
        "Service Details: Periodic maintenance, engine oil and filter replacement.",
        "Date of Service: 18/07/2024",
        "",
        "Generated test document for automated verification testing.",
    ]
    _pdf(path, "SERVICE INVOICE", lines)


def insurance_pdf(path: Path, reg: str, policy: str) -> None:
    lines = [
        "MOTOR INSURANCE POLICY",
        "",
        f"Policy Number: {policy}",
        f"Registration No: {reg}",
        "Insured: TrustDrive QA Test Owner",
        "Vehicle Model: Honda Activa 6G",
        "Date: 01/04/2025",
        "",
        "Generated test document for automated verification testing.",
    ]
    _pdf(path, "MOTOR INSURANCE POLICY", lines)


def main() -> None:
    HERE.mkdir(parents=True, exist_ok=True)

    # --- real photographs taken from the project's own public assets ---
    photos = {
        "photo-front.jpg": "bmw-silver.jpg",
        "photo-side.jpg": "audi-sedan.jpg",
        "photo-interior.jpg": "merc-luxury.jpg",
    }
    for dest_name, src_name in photos.items():
        src = PUBLIC_IMAGES / src_name
        if src.exists():
            shutil.copyfile(src, HERE / dest_name)
            print("photo:", dest_name, src.stat().st_size, "bytes")
        else:
            print("photo MISSING:", src)

    # --- vehicle registration certificates, one per category ---
    rc_pdf(HERE / "rc-petrol-motorcycle.pdf", "MH12QA1001", "ME4JC259E8T100001", "Chassis No", "Engine No: ME4JC259ET100001")
    rc_pdf(HERE / "rc-petrol-scooter.pdf", "MH12QA1002", "ME4JF401H9T100002", "Chassis No", "Engine No: ME4JF401HT100002")
    rc_pdf(HERE / "rc-petrol-car.pdf", "MH12QA1003", "MA3FJE61S10000003", "VIN", "Engine No: MA3FJE61S1000003")
    rc_pdf(HERE / "rc-electric-scooter.pdf", "MH12QA1004", "MD2DSB123K1A10004", "Frame No", "Motor No: MD2DSB123K1AM10004")
    rc_pdf(HERE / "rc-electric-motorcycle.pdf", "MH12QA1005", "MD2DSA001K2B10005", "Frame No", "Motor No: MD2DSA001K2BM10005")
    rc_pdf(HERE / "rc-electric-car.pdf", "MH12QA1006", "MAT625289NPE10006", "VIN", "Motor No: MAT625289NPEM10006")

    service_pdf(HERE / "service-invoice.pdf", "MH12QA1001", 12450, "4,250.00")
    insurance_pdf(HERE / "insurance.pdf", "MH12QA1001", "TDQA-POL-88991234")

    # --- negative fixtures -------------------------------------------------
    # 1. A file that claims to be a PDF but is not parseable content.
    (HERE / "corrupt.pdf").write_bytes(b"%PDF-1.4\nthis is not a valid pdf body\n" + os.urandom(64))

    # 2. A genuine but oversized PDF (> 10 MB limit) built with random bytes.
    blob = os.urandom(11 * 1024 * 1024)
    (HERE / "oversized.pdf").write_bytes(b"%PDF-1.4\n" + blob)

    # 3. An unsupported extension/content type.
    (HERE / "unsupported.txt").write_text("not an accepted document type", encoding="utf-8")

    for p in sorted(HERE.iterdir()):
        if p.is_file() and p.suffix.lower() in {".pdf", ".jpg"}:
            print(f"fixture: {p.name:32s} {p.stat().st_size:>10,} bytes")


if __name__ == "__main__":
    main()
