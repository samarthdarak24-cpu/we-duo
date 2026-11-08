"""Live RBAC / security verification against the running TrustDrive app.

Every check is an HTTP call to the real server with a real session cookie.
Nothing is asserted from source code — each line is the observed status code.

Usage:
    python verify_security.py --base http://127.0.0.1:3000 --state frontend/qa/live-state.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import httpx

RESULTS: list[dict] = []


def record(check: str, expected: str, observed: str, ok: bool, detail: str = "") -> None:
    RESULTS.append(
        {
            "check": check,
            "expected": expected,
            "observed": observed,
            "result": "PASS" if ok else "FAIL",
            "detail": detail,
        }
    )


def login(client: httpx.Client, email: str, password: str) -> bool:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    return r.status_code == 200


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:3000")
    ap.add_argument("--state", required=True)
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    state = json.loads(Path(args.state).read_text(encoding="utf-8"))
    base = args.base.rstrip("/")
    password = "QaLive2026pass"
    vehicle_id = state.get("vehicleId", "")
    reg = state.get("regNo", "")

    # ---------------------------------------------------------------- anonymous
    with httpx.Client(base_url=base, timeout=45.0, follow_redirects=False) as anon:
        for path in [
            "/api/v1/seller/vehicles",
            "/api/v1/seller/overview",
            "/api/v1/seller/listings",
            "/api/v1/admin/audit",
            "/api/v1/admin/users",
            "/api/v1/users/me",
            "/api/v1/inquiries",
            "/api/v1/saved",
        ]:
            r = anon.get(path)
            ok = r.status_code in (401, 403)
            record(f"anonymous GET {path}", "401/403", str(r.status_code), ok)

        r = anon.get("/api/v1/seller/vehicles", headers={"Authorization": "Bearer forged.token.value"})
        record(
            "forged bearer token on seller API",
            "401/403",
            str(r.status_code),
            r.status_code in (401, 403),
        )

        r = anon.post("/api/v1/seller/vehicles", json={"make": "X", "model": "Y"})
        record(
            "anonymous POST seller vehicle",
            "401/403",
            str(r.status_code),
            r.status_code in (401, 403),
        )

        # the marketplace stays public on purpose
        r = anon.get("/api/v1/marketplace/listings?pageSize=3")
        record("anonymous GET marketplace", "200", str(r.status_code), r.status_code == 200)

    # ------------------------------------------------------------------- buyer
    with httpx.Client(base_url=base, timeout=45.0, follow_redirects=False) as buyer:
        ok_login = login(buyer, state["buyerEmail"], password)
        record("buyer login", "200", "200" if ok_login else "failed", ok_login)
        if not ok_login:
            return 1

        for path in [
            "/api/v1/seller/vehicles",
            "/api/v1/seller/overview",
            "/api/v1/seller/listings",
            "/api/v1/seller/inquiries",
            "/api/v1/admin/audit",
            "/api/v1/admin/users",
        ]:
            r = buyer.get(path)
            ok = r.status_code in (401, 403)
            record(f"buyer GET {path}", "401/403", str(r.status_code), ok)

        for path, method, payload in [
            ("/api/v1/seller/vehicles", "POST", {"make": "Hack", "model": "Hack"}),
            ("/api/v1/seller/vehicles", "PATCH", {"make": "Hack"}),
            ("/api/v1/seller/listings", "POST", {"vehicleId": vehicle_id, "price": 1}),
        ]:
            r = buyer.request(method, path, json=payload)
            ok = r.status_code in (401, 403)
            record(f"buyer {method} {path}", "401/403", str(r.status_code), ok)

        # a buyer may not create a document on a vehicle they do not own
        r = buyer.post(
            f"/api/v1/vehicles/{vehicle_id}/documents",
            files={"file": ("x.pdf", b"%PDF-1.4 broken", "application/pdf")},
            data={"type": "rc", "consent": "true"},
        )
        record(
            "buyer uploads a document to a seller vehicle",
            "401/403",
            str(r.status_code),
            r.status_code in (401, 403),
        )

        # a buyer may not download another account's report
        r = buyer.get("/api/v1/reports/rep-1/download")
        record(
            "buyer downloads a seeded report owned by someone else",
            "403/404",
            str(r.status_code),
            r.status_code in (403, 404),
        )

        # cross-account inquiry read
        r = buyer.get("/api/v1/inquiries/q1")
        record("buyer reads a non-owner inquiry", "403/404", str(r.status_code), r.status_code in (403, 404))

    # ------------------------------------------------------------------ seller
    with httpx.Client(base_url=base, timeout=45.0, follow_redirects=False) as seller:
        ok_login = login(seller, state["sellerEmail"], password)
        record("seller login", "200", "200" if ok_login else "failed", ok_login)
        if not ok_login:
            return 1

        for path in ["/api/v1/admin/audit", "/api/v1/admin/users", "/api/v1/admin/kyc"]:
            r = seller.get(path)
            ok = r.status_code in (401, 403)
            record(f"seller GET {path}", "401/403", str(r.status_code), ok)

        r = seller.get("/api/v1/seller/vehicles")
        record("seller GET own vehicles", "200", str(r.status_code), r.status_code == 200)

        # a seller must not be able to read another seller's vehicle
        with httpx.Client(base_url=base, timeout=45.0, follow_redirects=False) as seller2:
            if state.get("seller2Email"):
                ok_login = login(seller2, state["seller2Email"], password)
                record("second seller login", "200", "200" if ok_login else "failed", ok_login)
                if ok_login:
                    r = seller2.get(f"/api/v1/vehicles/{vehicle_id}")
                    record(
                        "seller B reads seller A vehicle",
                        "403/404",
                        str(r.status_code),
                        r.status_code in (403, 404),
                    )
                    r = seller2.get(f"/api/v1/vehicles/{vehicle_id}/documents")
                    record(
                        "seller B reads seller A documents",
                        "403/404",
                        str(r.status_code),
                        r.status_code in (403, 404),
                    )
                    r = seller2.post(f"/api/v1/vehicles/{vehicle_id}/photos")
                    record(
                        "seller B adds a photo to seller A vehicle",
                        "401/403/404",
                        str(r.status_code),
                        r.status_code in (401, 403, 404),
                    )

        # an invalid body must not create a vehicle
        r = seller.post("/api/v1/seller/vehicles", json={})
        record(
            "seller POST an empty vehicle body",
            "400/422",
            str(r.status_code),
            r.status_code in (400, 422),
        )

        # a duplicate registration must be refused
        if reg:
            r = seller.post(
                "/api/v1/seller/vehicles",
                json={
                    "make": "Dup",
                    "model": "Dup",
                    "regNo": reg,
                    "vin": "MA3FJE61S10000099",
                    "year": 2021,
                    "categoryId": "passenger_car",
                },
            )
            record(
                "seller POST a duplicate registration number",
                "400/409",
                str(r.status_code),
                r.status_code in (400, 409),
                (r.json().get("error", {}) or {}).get("code", "") if r.headers.get("content-type", "").startswith("application/json") else "",
            )

        # SQL injection attempts in a filter parameter must not 500
        for payload in ["' OR 1=1--", "'; DROP TABLE vehicles;--", "%' UNION SELECT * FROM users--"]:
            r = seller.get("/api/v1/seller/vehicles", params={"q": payload})
            record(
                f"seller list with injection payload {payload[:24]!r}",
                "200 (no crash) or 4xx",
                str(r.status_code),
                r.status_code in (200, 400, 422),
            )

        # XSS-ish payload in a headline must be stored, not executed
        r = seller.post(
            "/api/v1/seller/vehicles",
            json={
                "make": "<script>alert(1)</script>",
                "model": "Xss",
                "regNo": "MH12ZZ9999",
                "vin": "MA3FJE61S1ZZZZZZZZ",
                "year": 2021,
                "categoryId": "passenger_car",
            },
        )
        record(
            "seller posts a script tag as a vehicle name",
            "4xx (rejected) or 200 (stored as text)",
            str(r.status_code),
            r.status_code in (200, 400, 422),
        )

    # ------------------------------------------------------------------ output
    passed = sum(1 for r in RESULTS if r["result"] == "PASS")
    failed = len(RESULTS) - passed
    print(f"{'RESULT':6}  {'CHECK':58}  {'EXPECTED':18}  OBSERVED")
    for r in RESULTS:
        flag = "PASS" if r["result"] == "PASS" else "FAIL"
        print(f"{flag:6}  {r['check'][:58]:58}  {r['expected']:18}  {r['observed']}")
    print()
    print(f"security checks: {passed} passed, {failed} failed, {len(RESULTS)} total")

    if args.out:
        Path(args.out).write_text(json.dumps(RESULTS, indent=2), encoding="utf-8")
        print(f"written: {args.out}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
