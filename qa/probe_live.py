"""Broad, read-mostly live probe over the running TrustDrive runtimes.

Outputs machine-readable JSON so the formal pytest suite can be targeted at the
real failures instead of guessing. Uses HTTPX with proxies disabled.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
NEXT = "http://127.0.0.1:3000"
INTEL = "http://127.0.0.1:8000"

ACCOUNTS = {
    "seller_a": ("samarth@trustdrive.dev", "demo1234"),
    "seller_b": ("aditya@trustdrive.dev", "demo1234"),
    "buyer": ("rohan@trustdrive.dev", "demo1234"),
    "buyer_b": ("priya@trustdrive.dev", "demo1234"),
    "admin": ("admin@trustdrive.dev", "demo1234"),
}


def client(base: str) -> httpx.Client:
    return httpx.Client(base_url=base, timeout=30.0, trust_env=False, follow_redirects=False)


def login_next(c: httpx.Client, email: str, password: str) -> str | None:
    r = c.post("/api/v1/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        return None
    return c.cookies.get("td_token")


def login_intel(c: httpx.Client, email: str, password: str) -> str | None:
    r = c.post("/api/v1/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        return None
    return r.json().get("data", {}).get("access_token") or r.json().get("access_token")


def main() -> None:
    report: dict = {"generated_at": time.strftime("%Y-%m-%d %H:%M:%S"), "checks": [], "errors": []}

    # --- auth on both runtimes ---
    tokens_next: dict[str, str | None] = {}
    tokens_intel: dict[str, str | None] = {}
    for role, (email, pw) in ACCOUNTS.items():
        with client(NEXT) as c:
            tokens_next[role] = login_next(c, email, pw)
        with client(INTEL) as c:
            tokens_intel[role] = login_intel(c, email, pw)
        report["checks"].append({
            "kind": "auth", "role": role, "email": email,
            "next_token": bool(tokens_next[role]), "intel_token": bool(tokens_intel[role]),
        })

    hdr = lambda t: {"Authorization": f"Bearer {t}"} if t else {}

    # --- Next.js: all GET API routes for each role, detect 5xx ---
    next_routes = sorted(
        "/" + str(p.relative_to(ROOT / "app" / "api")).replace("\\", "/")
        for p in (ROOT / "app" / "api").rglob("route.ts")
    )
    # substitute real ids harvested from the DB
    import sqlite3
    con = sqlite3.connect(ROOT / ".data" / "trustdrive.db")
    con.row_factory = sqlite3.Row
    def q(sql, *a):
        try:
            return [dict(r) for r in con.execute(sql, a).fetchall()]
        except Exception:
            return []
    ids = {
        "[id]": (q("select id from vehicles limit 1") or [{}])[0].get("id", "v-audi"),
        "[vehicleId]": (q("select id from vehicles limit 1") or [{}])[0].get("id", "v-audi"),
        "[listingId]": (q("select id from listings limit 1") or [{}])[0].get("id", "l-1"),
        "[token]": "unknown-token",
        "[runId]": "run-unknown",
        "[userId]": "u-seller",
    }
    vehicles = [r["id"] for r in q("select id from vehicles limit 3")]
    seller_b_vehicle = (q("select id from vehicles where owner_id='u-seller-2' limit 1") or [{}])[0].get("id")
    con.close()
    report["ids"] = {"vehicles": vehicles, "seller_b_vehicle": seller_b_vehicle, "substitutions": ids}

    def concrete(route: str) -> str:
        out = route
        for k, v in ids.items():
            out = out.replace(k, str(v))
        return out

    # Only probe GET-ish routes; collect every non-2xx/4xx (i.e. 5xx) as a bug.
    with client(NEXT) as c:
        for role in ("seller_a", "buyer", "admin"):
            for route in next_routes:
                url = "/api" + concrete(route)
                if "[action]" in url or "[" in url:
                    continue
                try:
                    r = c.get(url, headers=hdr(tokens_next[role]))
                    if r.status_code >= 500:
                        report["errors"].append({
                            "runtime": "next", "role": role, "method": "GET", "url": url,
                            "status": r.status_code, "body": r.text[:400],
                        })
                except Exception as exc:
                    report["errors"].append({"runtime": "next", "role": role, "method": "GET",
                                             "url": url, "status": "EXC", "body": repr(exc)})

    # --- FastAPI: every GET path, each role ---
    with client(INTEL) as c:
        spec = c.get("/openapi.json").json()
        get_paths = [p for p, ops in spec["paths"].items() if "get" in ops]
        for role in ("seller_a", "buyer", "admin"):
            for p in get_paths:
                url = p
                for k, v in {**ids, "{vehicle_id}": vehicles[0], "{vehicleId}": vehicles[0],
                             "{report_id}": "rpt-unknown", "{listing_id}": ids["[listingId]"],
                             "{inquiry_id}": "inq-unknown", "{job_id}": "job-unknown",
                             "{investigation_id}": "inv-unknown", "{document_id}": "doc-unknown",
                             "{dispute_id}": "d-unknown", "{review_id}": "rev-unknown",
                             "{user_id}": "u-seller", "{session_id}": "s-unknown",
                             "{image_id}": "img-unknown", "{event_id}": "evt-unknown"}.items():
                    url = url.replace(k, str(v))
                if "{" in url:
                    continue
                try:
                    r = c.get(url, headers=hdr(tokens_intel[role]))
                    if r.status_code >= 500:
                        report["errors"].append({
                            "runtime": "fastapi", "role": role, "method": "GET", "url": url,
                            "status": r.status_code, "body": r.text[:400],
                        })
                except Exception as exc:
                    report["errors"].append({"runtime": "fastapi", "role": role, "method": "GET",
                                             "url": url, "status": "EXC", "body": repr(exc)})

    # --- Forged-token probes using the public fallback secret ---
    import base64, hashlib, hmac
    secret = "trustdrive-dev-secret-change-in-prod"
    def b64(raw: bytes) -> str:
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
    def forge(sub: str, role: str, name: str = "Forged") -> str:
        h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
        b = b64(json.dumps({"sub": sub, "role": role, "name": name,
                            "iat": int(time.time()), "exp": int(time.time()) + 3600}).encode())
        return f"{h}.{b}.{b64(hmac.new(secret.encode(), f'{h}.{b}'.encode(), hashlib.sha256).digest())}"
    forged_admin = forge("qa-forged", "admin")
    forged_seller = forge("qa-forged", "seller")
    with client(NEXT) as c:
        for label, tok in (("forged_admin", forged_admin), ("forged_seller", forged_seller),
                           ("garbage", "x.y.z")):
            for url in ("/api/v1/admin/audit", "/api/v1/me", "/api/v1/seller/overview"):
                r = c.get(url, headers=hdr(tok))
                report["checks"].append({"kind": "forged", "label": label, "runtime": "next",
                                         "url": url, "status": r.status_code, "body": r.text[:200]})
    with client(INTEL) as c:
        for label, tok in (("forged_admin", forged_admin), ("forged_seller", forged_seller),
                           ("garbage", "x.y.z")):
            for url in ("/api/backend/audit", "/api/backend/users", "/api/v1/vehicles/mine"):
                r = c.get(url, headers=hdr(tok))
                report["checks"].append({"kind": "forged", "label": label, "runtime": "fastapi",
                                         "url": url, "status": r.status_code, "body": r.text[:200]})

    out = ROOT / "qa" / "results" / "probe_live.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"checks={len(report['checks'])} 5xx_errors={len(report['errors'])} -> {out}")
    for e in report["errors"][:40]:
        print("  ", e["runtime"], e["role"], e["url"], e["status"], e["body"][:120].replace("\n", " "))


if __name__ == "__main__":
    main()
