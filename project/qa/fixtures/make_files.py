"""Synthetic TrustDrive test files.

Everything here is clearly labelled DEMO DATA. It is a text-layer PDF that the
project's own extraction pipeline can read; it is not a government form, an
insurance policy or a scanned certificate, and it must never be presented as one.

Usage:
  python make_files.py --out DIR --reg GJ01QA1234 --identifier ME4JC259E8T000123 \
      --make "Royal Enfield" --model "Classic 350" --year 2022 --km 18500 \
      --powertrain petrol [--engine ME4JC259E8] [--motor ...] [--battery ...]
"""
from __future__ import annotations

import argparse
from pathlib import Path

import fitz  # PyMuPDF — the same text-layer engine the OCR pipeline uses

BANNER = "TRUSTDRIVE QA SYNTHETIC DEMO DOCUMENT - NOT A REAL CERTIFICATE"


def _pdf(path: Path, title: str, lines: list[str]) -> None:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_textbox(fitz.Rect(48, 48, 548, 120),
                        [BANNER, title], fontsize=12, fontname="hebo")
    page.insert_textbox(fitz.Rect(48, 150, 548, 760), lines, fontsize=10, fontname="helv")
    doc.save(path)
    doc.close()


def _png(path: Path, label: str) -> None:
    doc = fitz.open()
    page = doc.new_page(width=800, height=600)
    page.draw_rect(fitz.Rect(0, 0, 800, 600), color=(0.1, 0.12, 0.15), fill=(0.15, 0.18, 0.22))
    page.draw_rect(fitz.Rect(60, 200, 740, 420), color=(0.85, 0.72, 0.35), fill=(0.25, 0.28, 0.33), width=4)
    page.insert_textbox(fitz.Rect(60, 60, 740, 160), [BANNER, label], fontsize=16, fontname="hebo")
    pix = page.get_pixmap()
    pix.save(path)
    doc.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--reg", required=True)
    ap.add_argument("--identifier", required=True, help="VIN for cars, chassis/frame number for two-wheelers")
    ap.add_argument("--make", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--year", required=True)
    ap.add_argument("--km", required=True)
    ap.add_argument("--powertrain", choices=["petrol", "electric"], required=True)
    ap.add_argument("--engine", default="")
    ap.add_argument("--motor", default="")
    ap.add_argument("--battery", default="")
    ap.add_argument("--ident-label", default="", help="VIN | Chassis No | Frame No")
    ap.add_argument("--owner", default="QA Test Owner")
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    ident_label = args.ident_label or ("VIN" if len(args.identifier) == 17 else "Chassis No")

    rc_lines = [
        f"Registration No: {args.reg}",
        f"{ident_label}: {args.identifier}",
        f"Make: {args.make}",
        f"Model: {args.model}",
        f"Year Of Manufacturing: {args.year}",
        f"Owner: {args.owner}",
        f"Odometer: {args.km}",
    ]
    if args.powertrain == "petrol":
        rc_lines.append(f"Fuel Type: Petrol")
        if args.engine:
            rc_lines.append(f"Engine No: {args.engine}")
    else:
        rc_lines.append("Fuel Type: Electric")
        if args.motor:
            rc_lines.append(f"Motor No: {args.motor}")
        if args.battery:
            rc_lines.append(f"Battery Serial: {args.battery}")
    _pdf(out / "rc.pdf", "REGISTRATION CERTIFICATE (SYNTHETIC SAMPLE)", rc_lines)

    _pdf(out / "insurance.pdf", "INSURANCE CERTIFICATE (SYNTHETIC SAMPLE)", [
        f"Registration No: {args.reg}",
        f"Policy No: QA-POL-{args.reg[-4:]}-2026",
        f"{ident_label}: {args.identifier}",
        "Insurer: Demo Insurer (synthetic)",
        "Valid Upto: 31/12/2027",
        f"Sum Insured: Rs {args.km}",
    ])

    if args.powertrain == "petrol":
        _pdf(out / "puc.pdf", "PUC CERTIFICATE (SYNTHETIC SAMPLE, COMBUSTION ONLY)", [
            f"Registration No: {args.reg}",
            f"{ident_label}: {args.identifier}",
            "Valid Upto: 30/06/2028",
        ])
    else:
        _pdf(out / "battery.pdf", "BATTERY HEALTH RECORD (SYNTHETIC SAMPLE)", [
            f"Registration No: {args.reg}",
            f"Motor No: {args.motor or 'QAMOTOR0001'}",
            f"Battery Serial: {args.battery or 'QAPACK-0001'}",
            "Battery Capacity: 40.0",
            "State Of Health: 92",
        ])

    _pdf(out / "service.pdf", "SERVICE INVOICE (SYNTHETIC SAMPLE)", [
        f"Registration No: {args.reg}",
        f"{ident_label}: {args.identifier}",
        "Odometer: 5,000",
        "Model: Demo Service Centre",
        "Date: 15/01/2026",
    ])

    for i, label in enumerate(["front three-quarter view", "right side view", "rear view"], start=1):
        _png(out / f"photo-{i}.png", f"DEMO VEHICLE PHOTO {i} - {args.make} {args.model} ({label})")

    print(f"wrote fixtures for {args.reg} into {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
