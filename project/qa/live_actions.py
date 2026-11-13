"""Live write-action probe against the running app. Real HTTP, real DB writes."""
from __future__ import annotations
import json
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = "http://127.0.0.1:3000"
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

CREDS = {
    "seller": ("samarth@trustdrive.dev", "demo123456"),
    "buyer": ("aditya@trustdrive.dev", "demo123456"),
    "admin": ("admin@trustdrive.dev", "demo123456"),
}


def request(method, url, body=None, cookie="", timeout=60):
    hdr = {}
    if cookie:
        hdr["Cookie"] = cookie
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        hdr["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdr, method=method)
    try:
        with OPENER.open(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"


def login(role):
    email, pw = CREDS[role]
    st, raw = request("POST", f"{BASE}/api/v1/auth/login", {"email": email, "password": pw})
    # re-issue to grab cookie headers
    data = json.dumps({"email": email, "password": pw}).encode()
    req = urllib.request.Request(BASE + "/api/v1/auth/login", data=data,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with OPENER.open(req, timeout=30) as r:
        cookies = [v.split(";")[0] for k, v in r.headers.items() if k.lower() == "set-cookie"]
    return "; ".join(c for c in cookies if c.startswith("td_"))


# (role, method, path, body, note)
# IDs are real rows from the shared demo DB; roles match each route's RBAC.
import random
UNIQUE = f"{random.randint(1000, 9999)}"
ACTIONS = [
    # --- auth / profile ---
    ("seller", "POST", "/api/v1/auth/refresh", {}, "refresh session"),
    ("seller", "PATCH", "/api/v1/me", {"name": "Samarth Darak", "phone": "+91 98200 22002"}, "update profile"),
    ("seller", "GET", "/api/v1/me", None, "read profile"),
    ("seller", "POST", "/api/v1/newsletter", {"email": "qa-live@example.com"}, "newsletter"),
    ("seller", "POST", "/api/v1/contact", {"name": "QA", "email": "qa-live@example.com", "message": "live probe message for integration check"}, "contact"),
    # --- seller vehicles / listings ---
    ("seller", "POST", "/api/v1/seller/vehicles", {"make": "Honda", "model": "City", "year": 2019, "km": 41000, "price": 950000, "categoryId": "passenger_car", "regNo": f"MH12QA{UNIQUE}", "vin": f"WBAPG76081A{UNIQUE}12", "variant": "VX", "fuel": "Petrol", "transmission": "Manual", "colour": "White", "ownershipCount": 1, "location": "Mumbai"}, "create vehicle"),
    ("seller", "PATCH", "/api/v1/seller/vehicles/v-seller", {"city": "Mumbai"}, "update vehicle"),
    ("seller", "POST", "/api/v1/seller/listings/l-seller/generate-description", {}, "generate listing description"),
    ("seller", "POST", "/api/v1/seller/listings/l-seller/share", {}, "share listing"),
    # --- documents / OCR (Python proxies) ---
    ("seller", "POST", "/api/v1/vehicles/v-seller/documents/doc-1793860075618/ocr", {}, "run OCR (proxy POST)"),
    ("seller", "PATCH", "/api/v1/vehicles/v-seller/documents/doc-1793860075618/ocr", {"fields": {"policyNo": "QA-LIVE-1"}}, "save OCR corrections (proxy PATCH)"),
    ("seller", "POST", "/api/v1/documents/v-seller-rc/reverify", {}, "reverify document"),
    ("seller", "POST", "/api/v1/damage/d-s1/correction", {"description": "QA live correction", "repairStatus": "Repaired"}, "damage correction"),
    # --- damage review + photo detect (Python proxies) ---
    ("seller", "PATCH", "/api/v1/vehicles/v-seller/damage/d-s1/review", {"status": "verified"}, "damage review (proxy PATCH)"),
    # --- verification / AI ---
    ("seller", "POST", "/api/v1/vehicles/v-seller/verify", {}, "run verification"),
    ("seller", "POST", "/api/v1/vehicles/v-seller/ai/explain", {"question": "Explain the trust score"}, "AI explain"),
    ("seller", "POST", "/api/v1/vehicles/v-seller/ai-investigations", {"question": "Is this vehicle safe?"}, "AI investigation (Python)"),
    ("seller", "POST", "/api/v1/ai/assistant", {"question": "What is the trust score of this vehicle?", "vehicleId": "v-seller"}, "AI assistant"),
    ("seller", "POST", "/api/v1/findings/f-s2/dispute", {"explanation": "QA live dispute evidence"}, "dispute finding"),
    # --- inquiries (seller side) ---
    ("seller", "PATCH", "/api/v1/inquiries/q1/status", {"status": "replied"}, "inquiry status"),
    ("seller", "POST", "/api/v1/inquiries/q1/messages", {"message": "QA live reply"}, "inquiry message"),
    # --- buyer ---
    ("buyer", "POST", "/api/v1/saved/l-seller", {}, "save listing"),
    ("buyer", "DELETE", "/api/v1/saved/l-seller", None, "unsave listing"),
    ("buyer", "POST", "/api/v1/alerts/evaluate", {}, "evaluate alerts"),
    ("buyer", "POST", "/api/v1/inquiries", {"listingId": "l-seller", "message": "QA live inquiry"}, "create inquiry"),
    ("buyer", "POST", "/api/v1/compare", {"ids": ["v-seller", "v-bmw"]}, "compare vehicles"),
    ("buyer", "POST", "/api/v1/reports/vehicle/v-seller", {"type": "Vehicle verification"}, "vehicle report"),
    ("buyer", "POST", "/api/v1/saved-searches", {"name": "QA live search", "filters": {"make": "Honda"}}, "saved search"),
    ("buyer", "POST", "/api/v1/vehicles/v-seller/save", {}, "save vehicle"),
    ("buyer", "POST", "/api/v1/notifications/read-all", {}, "read all notifications"),
    ("buyer", "POST", "/api/v1/listings/l-seller/report-suspicious", {"reason": "QA live report"}, "report suspicious"),
    ("buyer", "POST", "/api/v1/verification/lookup", {"type": "reg", "value": "MH01XY4321"}, "verification lookup"),
    # --- admin ---
    ("admin", "GET", "/api/v1/health/integrations", None, "integration health"),
    ("admin", "POST", "/api/v1/admin/disputes/disp-1794077210526/resolve", {"decision": "rejected", "note": "QA live"}, "resolve dispute"),
    ("admin", "PATCH", "/api/v1/admin/kyc/u-seller", {"status": "verified"}, "KYC update"),
    ("admin", "GET", "/api/v1/admin/queue", None, "admin queue"),
]


def main():
    cookies = {r: login(r) for r in CREDS}
    print("cookies:", {k: bool(v) for k, v in cookies.items()})
    out = []
    for role, method, path, body, note in ACTIONS:
        st, raw = request(method, BASE + path, body, cookies[role])
        snippet = raw.replace("\n", " ")[:230]
        flag = "OK " if 200 <= st < 300 else ("WARN" if 400 <= st < 500 else "FAIL")
        print(f"  {flag} {st:>4} {method:6} {path:70} [{note}] {snippet[:150]}")
        out.append({"role": role, "method": method, "path": path, "note": note,
                    "status": st, "body": raw[:600]})
    (ROOT / "project" / "qa" / "live_actions_results.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    bad = [o for o in out if o["status"] >= 500 or o["status"] == 0]
    print(f"\nTOTAL={len(out)} 2xx={sum(1 for o in out if 200<=o['status']<300)} "
          f"4xx={sum(1 for o in out if 400<=o['status']<500)} 5xx/0={len(bad)}")
    print("\n=== HARD FAILURES ===")
    for o in bad:
        print(f"  {o['status']} {o['method']} {o['path']} [{o['note']}] {o['body'][:300]}")


if __name__ == "__main__":
    main()
