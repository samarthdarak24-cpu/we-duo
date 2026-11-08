"""Exploratory cross-tenant / RBAC / injection probe (live HTTP, both runtimes).

Produces qa/results/probe_security.json. Every case records the observed status
and a short body excerpt; the formal pytest suite asserts on these behaviours.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
NEXT = "http://127.0.0.1:3000"
INTEL = "http://127.0.0.1:8000"

ACCOUNTS = {
    "seller_a": ("samarth@trustdrive.dev", "u-seller"),
    "seller_b": ("weduo@trustdrive.dev", "u-seller2"),
    "buyer_a": ("rohan@trustdrive.dev", "u-buyer2"),
    "buyer_b": ("priya@trustdrive.dev", "u-buyer3"),
    "admin": ("admin@trustdrive.dev", "u-admin"),
}
SELLER_A_VEHICLE = "v-bmw"
SELLER_B_VEHICLE = "v-audi"
SELLER_B_LISTING = "l-audi"
BUYER_A_INQUIRY = "q1"
BUYER_B_INQUIRY = "q2"


def cli(base: str) -> httpx.Client:
    return httpx.Client(base_url=base, timeout=30.0, trust_env=False, follow_redirects=False)


def tokens() -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    for name, (email, _uid) in ACCOUNTS.items():
        with cli(NEXT) as c:
            r = c.post("/api/v1/auth/login", json={"email": email, "password": "demo1234"})
            out.setdefault(name, {})["next"] = c.cookies.get("td_token") or ""
        with cli(INTEL) as c:
            r = c.post("/api/v1/auth/login", json={"email": email, "password": "demo1234"})
            body = r.json()
            tok = body.get("access_token") or body.get("data", {}).get("access_token")
            out[name]["intel"] = tok or ""
    return out


def main() -> None:
    t = tokens()
    h = lambda rt, who: {"Authorization": f"Bearer {t[who][rt]}"}
    results: list[dict] = []

    def rec(case: dict) -> None:
        results.append(case)
        print(f"{case.get('verdict','?'):8s} {case['runtime']:7s} {case['method']:6s} "
              f"{case['url']:62s} {case['status']:>5} {case['who']:9s} {case.get('note','')}")

    def call(runtime: str, method: str, url: str, who: str, *, json_body=None,
             expect=None, note="", headers=None, files=None):
        base = NEXT if runtime == "next" else INTEL
        with cli(base) as c:
            try:
                r = c.request(method, url, headers={**h(runtime, who), **(headers or {})},
                              json=json_body, files=files)
                status, body = r.status_code, r.text[:220].replace("\n", " ")
            except Exception as exc:
                status, body = "EXC", repr(exc)
        verdict = "?"
        if expect is not None:
            if isinstance(expect, (list, tuple, set)):
                verdict = "PASS" if status in expect else "FAIL"
            else:
                verdict = "PASS" if status == expect else "FAIL"
        rec({"runtime": runtime, "method": method, "url": url, "who": who,
             "status": status, "body": body, "expect": str(expect),
             "verdict": verdict, "note": note})
        return status, body

    # ---------- 1. Unauthenticated access ----------
    for runtime, urls in {
        "next": ["/api/v1/admin/audit", "/api/v1/seller/overview", "/api/v1/me",
                 "/api/v1/notifications", "/api/v1/reports"],
        "intel": ["/api/backend/audit", "/api/backend/users", "/api/v1/vehicles/mine",
                  "/api/backend/notifications", "/api/backend/reports"],
    }.items():
        base = NEXT if runtime == "next" else INTEL
        with cli(base) as c:
            for url in urls:
                r = c.get(url)
                rec({"runtime": runtime, "method": "GET", "url": url, "who": "anonymous",
                     "status": r.status_code, "body": r.text[:160],
                     "expect": "401/403", "verdict": "PASS" if r.status_code in (401, 403) else "FAIL",
                     "note": "unauthenticated"})

    # ---------- 2. Cross-tenant: seller A -> seller B's records ----------
    next_cases = [
        ("PATCH", f"/api/v1/vehicles/{SELLER_B_VEHICLE}", {"make": "HACKED"}),
        ("POST", f"/api/v1/vehicles/{SELLER_B_VEHICLE}/damage", {"component": "hood", "severity": "major", "description": "x"}),
        ("POST", f"/api/v1/vehicles/{SELLER_B_VEHICLE}/mileage", {"km": 1, "date": "2026-01-01"}),
        ("POST", f"/api/v1/vehicles/{SELLER_B_VEHICLE}/history", {"category": "service", "title": "x", "event_date": "2026-01-01"}),
        ("POST", f"/api/v1/vehicles/{SELLER_B_VEHICLE}/documents", {"type": "rc", "file_name": "x.pdf"}),
        ("POST", f"/api/v1/vehicles/{SELLER_B_VEHICLE}/claims", {"claim": "x"}),
    ]
    for method, url, body in next_cases:
        call("next", method, url, "seller_a", json_body=body,
             expect=[401, 403, 404], note="seller A writes seller B vehicle")

    intel_cases = [
        ("PATCH", f"/api/backend/vehicles/{SELLER_B_VEHICLE}", {"make": "HACKED"}),
        ("POST", f"/api/backend/vehicles/{SELLER_B_VEHICLE}/damage", {"zone_id": "hood", "description": "x"}),
        ("POST", f"/api/backend/vehicles/{SELLER_B_VEHICLE}/mileage", {"km": 1, "date": "2026-01-01"}),
        ("POST", f"/api/backend/vehicles/{SELLER_B_VEHICLE}/history", {"category": "service", "title": "x", "event_date": "2026-01-01"}),
        ("POST", f"/api/backend/vehicles/{SELLER_B_VEHICLE}/documents", {"type": "rc", "file_name": "x.pdf", "sha256": "a" * 64}),
        ("POST", f"/api/backend/vehicles/{SELLER_B_VEHICLE}/verify", {}),
    ]
    for method, url, body in intel_cases:
        call("intel", method, url, "seller_a", json_body=body,
             expect=[401, 403, 404], note="seller A writes seller B vehicle (fastapi)")

    # ---------- 3. Buyer cannot mutate seller records ----------
    for method, url, body in next_cases[:4]:
        call("next", method, url, "buyer_a", json_body=body,
             expect=[401, 403, 404, 405], note="buyer writes vehicle")
    for method, url, body in intel_cases[:4]:
        call("intel", method, url, "buyer_a", json_body=body,
             expect=[401, 403, 404, 405], note="buyer writes vehicle (fastapi)")

    # ---------- 4. Inquiry ownership ----------
    for runtime, url in [("next", f"/api/v1/inquiries/{BUYER_B_INQUIRY}"),
                         ("intel", f"/api/backend/inquiries/{BUYER_B_INQUIRY}")]:
        call(runtime, "GET", url, "buyer_a", expect=[403, 404],
             note="buyer A reads buyer B inquiry")
        call(runtime, "POST", url + "/messages" if runtime == "next" else url + "/messages",
             "buyer_a", json_body={"body": "unauthorized"}, expect=[403, 404],
             note="buyer A posts into buyer B inquiry")
    # seller A owns q1/q2 so should be able to read
    call("next", "GET", f"/api/v1/inquiries/{BUYER_A_INQUIRY}", "seller_a", expect=200,
         note="seller owner reads inquiry")
    call("next", "GET", f"/api/v1/inquiries/{BUYER_A_INQUIRY}", "buyer_a", expect=200,
         note="buyer owner reads inquiry")

    # ---------- 5. Admin-only endpoints ----------
    for runtime, urls in {
        "next": ["/api/v1/admin/audit", "/api/v1/admin/queue", "/api/v1/admin/kyc"],
        "intel": ["/api/backend/audit", "/api/backend/users", "/api/backend/admin/queue"],
    }.items():
        for url in urls:
            for who in ("buyer_a", "seller_a"):
                call(runtime, "GET", url, who, expect=[401, 403],
                     note="non-admin reads admin endpoint")
            call(runtime, "GET", url, "admin", expect=200, note="admin reads admin endpoint")

    # ---------- 6. Injection attempts ----------
    payloads = [
        "' OR 1=1 --",
        "'; DROP TABLE users; --",
        "<script>alert(1)</script>",
        "%27%20OR%201%3D1--",
    ]
    for runtime, url in [("next", "/api/v1/marketplace/search"),
                         ("intel", "/api/backend/marketplace/search")]:
        for p in payloads:
            call(runtime, "POST", url, "buyer_a", json_body={"brand": p, "limit": 5},
                 expect=[200, 400, 422], note="SQLi/XSS in search")
    # URL-based injection
    call("next", "GET", "/api/v1/marketplace/listings?make=' OR 1=1 --", "buyer_a",
         expect=[200, 400, 422], note="SQLi in query param")

    # ---------- 7. Tokens ----------
    import base64, hashlib, hmac
    secret = "trustdrive-dev-secret-change-in-prod"
    b64 = lambda x: base64.urlsafe_b64encode(x).rstrip(b"=").decode()
    def forge(sub, role, exp=None):
        hd = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
        bd = b64(json.dumps({"sub": sub, "role": role, "name": "forged",
                             "iat": int(time.time()) - 60,
                             "exp": exp or int(time.time()) + 3600}).encode())
        return f"{hd}.{bd}.{b64(hmac.new(secret.encode(), f'{hd}.{bd}'.encode(), hashlib.sha256).digest())}"
    forged_cases = [
        ("buyer->admin", forge("u-buyer2", "admin")),
        ("impersonate-admin", forge("u-admin", "admin")),
        ("impersonate-seller", forge("u-seller", "seller")),
        ("expired", forge("u-seller", "seller", int(time.time()) - 10)),
        ("alg-none", "eyJhbGciOiJub25lIn0." + b64(json.dumps({"sub": "u-admin", "role": "admin", "exp": int(time.time()) + 3600}).encode()) + ".x"),
        ("garbage", "x.y.z"),
    ]
    for label, tok in forged_cases:
        with cli(NEXT) as c:
            r = c.get("/api/v1/admin/audit", headers={"Authorization": f"Bearer {tok}"})
            rec({"runtime": "next", "method": "GET", "url": "/api/v1/admin/audit",
                 "who": label, "status": r.status_code, "body": r.text[:160],
                 "expect": "401", "verdict": "PASS" if r.status_code == 401 else "FAIL",
                 "note": "forged token (SEC-001)"})
        with cli(INTEL) as c:
            r = c.get("/api/backend/audit", headers={"Authorization": f"Bearer {tok}"})
            rec({"runtime": "intel", "method": "GET", "url": "/api/backend/audit",
                 "who": label, "status": r.status_code, "body": r.text[:160],
                 "expect": "401", "verdict": "PASS" if r.status_code == 401 else "FAIL",
                 "note": "forged token (SEC-001)"})

    # ---------- 8. Private document consent ----------
    import sqlite3
    con = sqlite3.connect(ROOT / ".data" / "trustdrive.db")
    con.row_factory = sqlite3.Row
    docs = [dict(r) for r in con.execute(
        "select id,vehicle_id,file_key,consent,type from documents where consent=0 limit 3")]
    con.close()
    for d in docs:
        call("next", "GET", f"/api/v1/files/{d['file_key']}", "buyer_a",
             expect=[401, 403, 404, 400], note="buyer downloads private (consent=0) document")
        call("next", "GET", f"/api/v1/documents/{d['id']}", "buyer_a",
             expect=[401, 403, 404], note="buyer reads private document metadata")

    # ---------- 9. Validation / bad payloads ----------
    bad = [
        ("next", "POST", "/api/v1/seller/vehicles", {"make": ""}, "seller_a"),
        ("next", "POST", "/api/v1/auth/login", {"email": "not-an-email"}, "seller_a"),
        ("intel", "POST", "/api/backend/vehicles", {"make": "X"}, "seller_a"),
        ("intel", "POST", "/api/backend/marketplace/search", {"price_min": "abc"}, "buyer_a"),
        ("intel", "POST", "/api/intelligence/fraud/detect", {"vehicle_id": "../etc/passwd"}, "seller_a"),
    ]
    for runtime, method, url, body, who in bad:
        call(runtime, method, url, who, json_body=body, expect=[400, 401, 403, 404, 422],
             note="invalid payload rejected")

    out = ROOT / "project" / "qa" / "results" / "probe_security.json"
    out.write_text(json.dumps(results, indent=2), encoding="utf-8")
    fails = [r for r in results if r["verdict"] == "FAIL"]
    print(f"\nTOTAL={len(results)} FAIL={len(fails)} -> {out}")
    for f in fails:
        print(f"  {f['runtime']} {f['method']} {f['url']} who={f['who']} got={f['status']} expected={f['expect']} :: {f['body'][:110]}")


if __name__ == "__main__":
    main()
