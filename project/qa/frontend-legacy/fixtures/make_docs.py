"""Generate vehicle documents whose contents MATCH the vehicle being created.

The TrustDrive extraction pipeline compares the machine-read registration number
and the category primary identifier against the vehicle record. A document that
does not match is (correctly) marked `needs_correction`, so the live audit needs
documents that agree with the vehicle for the happy path.

Usage:
    python make_docs.py --spec specs.json --out outdir

specs.json: [{ "name": "...", "reg": "MH12QA2901", "identifier": "MA3FJE61S1...",
                "identifier_label": "VIN (17 characters)", "model": "Baleno",
                "make": "Maruti", "year": 2021, "km": 24500, "kind": "rc" },
              ...]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


def _pdf(path: Path, title: str, lines: list[str]) -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    y = 72
    page.insert_text((72, y), title, fontsize=17, fontname="hebo")
    y += 34
    for line in lines:
        page.insert_text((72, y), line, fontsize=11, fontname="cour")
        y += 17
    doc.save(str(path))
    doc.close()


def rc(spec: dict, out: Path) -> None:
    two_wheeler = "Chassis" in spec["identifier_label"] or "Frame" in spec["identifier_label"]
    lines = [
        "REGISTRATION CERTIFICATE",
        "",
        f"Registration No: {spec['reg']}",
    ]
    if two_wheeler:
        lines.append(f"Chassis No: {spec['identifier']}")
    else:
        lines.append(f"VIN: {spec['identifier']}")
    if spec.get("engine_number"):
        lines.append(f"Engine No: {spec['engine_number']}")
    if spec.get("motor_number"):
        lines.append(f"Motor No: {spec['motor_number']}")
    lines += [
        f"Model: {spec['make']} {spec['model']}",
        f"Manufacturer Year: {spec['year']}",
        "Owner Name: TrustDrive QA Test Owner",
        "Date of Registration: 12/03/2021",
        "Date of Expiry: 12/03/2031",
        f"Odometer: {spec['km']}",
        "Address: 12 Test Street, Pune, Maharashtra",
        "",
        "Generated for the TrustDrive live functional audit.",
    ]
    _pdf(out, "VEHICLE REGISTRATION CERTIFICATE", lines)


def insurance(spec: dict, out: Path) -> None:
    lines = [
        "MOTOR INSURANCE POLICY",
        "",
        f"Policy Number: TDQA-POL-{spec['reg'].replace('-', '')}",
        f"Registration No: {spec['reg']}",
        f"Model: {spec['make']} {spec['model']}",
        "Insured: TrustDrive QA Test Owner",
        "Premium Amount: INR 12,500.00",
        "Date: 12/03/2028",
        "",
        "Generated for the TrustDrive live functional audit.",
    ]
    _pdf(out, "MOTOR INSURANCE POLICY", lines)


def service_invoice(spec: dict, out: Path) -> None:
    lines = [
        "SERVICE INVOICE",
        "",
        f"Registration No: {spec['reg']}",
        f"Model: {spec['make']} {spec['model']}",
        f"Odometer: {spec['km']}",
        "Total Amount: INR 4,250.00",
        "Service Details: Periodic maintenance, engine oil and filter replacement.",
        "Date of Service: 18/07/2026",
        "",
        "Generated for the TrustDrive live functional audit.",
    ]
    _pdf(out, "SERVICE INVOICE", lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    specs = json.loads(Path(args.spec).read_text(encoding="utf-8"))

    for spec in specs:
        kind = spec.get("kind", "rc")
        out = out_dir / f"{spec['name']}.pdf"
        if kind == "rc":
            rc(spec, out)
        elif kind == "insurance":
            insurance(spec, out)
        elif kind == "service":
            service_invoice(spec, out)
        else:
            raise SystemExit(f"unknown kind {kind}")
        print(f"{out.name}\t{out.stat().st_size}")


if __name__ == "__main__":
    main()
