"""Live page-render sweep with real session cookies (no docs, no mocks)."""
from __future__ import annotations
import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:3000"
OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
CREDS = {
    "seller": ("samarth@trustdrive.dev", "demo1234"),
    "buyer": ("aditya@trustdrive.dev", "demo1234"),
    "admin": ("admin@trustdrive.dev", "demo1234"),
}
PAGES = {
    "public": ["/", "/marketplace", "/login", "/register", "/contact", "/faq",
               "/technology", "/resources", "/verify/TD-7H2P4R1S", "/vehicle/v-seller"],
    "seller": ["/seller", "/seller/vehicles", "/seller/vehicles/v-seller", "/seller/add-vehicle",
               "/seller/listings", "/seller/listings/l-seller", "/seller/documents",
               "/seller/history", "/seller/fraud", "/seller/inquiries", "/seller/inquiries/q1",
               "/seller/reports", "/seller/notifications", "/seller/settings", "/seller/verification"],
    "buyer": ["/buyer", "/buyer/explore", "/buyer/search", "/buyer/saved", "/buyer/compare",
              "/buyer/history", "/buyer/inquiries", "/buyer/inquiries/q1", "/buyer/reports",
              "/buyer/risk", "/buyer/verification", "/buyer/notifications", "/buyer/settings"],
    "admin": ["/admin", "/admin/queue", "/admin/users", "/admin/kyc", "/admin/audit",
              "/admin/listings", "/admin/disputes"],
}


def login(role):
    d = json.dumps({"email": CREDS[role][0], "password": CREDS[role][1]}).encode()
    r = urllib.request.Request(BASE + "/api/v1/auth/login", data=d,
                               headers={"Content-Type": "application/json"}, method="POST")
    with OP.open(r, timeout=30) as x:
        return "; ".join(v.split(";")[0] for k, v in x.headers.items()
                         if k.lower() == "set-cookie" and v.startswith("td_"))


def get(path, cookie=""):
    req = urllib.request.Request(BASE + path, headers={"Cookie": cookie} if cookie else {})
    try:
        with OP.open(req, timeout=45) as r:
            return r.status, r.read().decode("utf-8", "replace"), r.geturl()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), ""
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}", ""


def main():
    cookies = {r: login(r) for r in CREDS}
    issues = []
    for group, paths in PAGES.items():
        print(f"\n=== {group} ===")
        ck = cookies.get(group, "")
        for p in paths:
            st, body, final = get(p, ck)
            err = ""
            low = body.lower()
            if "application error" in low or "internal server error" in low or "digest" in low and st >= 500:
                err = "RENDER_ERROR"
            if st >= 500 or st == 0 or err:
                issues.append((group, st, p, body[:200]))
            print(f"  {st:>4} {p:48} {err} {('redirect->'+final.replace(BASE,'')) if final and final != BASE+p else ''}")
    print(f"\n=== HARD ISSUES ({len(issues)}) ===")
    for g, st, p, b in issues:
        print(f"  {g} {st} {p}: {b[:200]}")


if __name__ == "__main__":
    main()
