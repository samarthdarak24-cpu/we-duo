"""Live, dependency-free probe of the running app. No docs, no mocks.

Logs in through the real /api/v1/auth/login route, then exercises every
Next.js API route that exists on disk with real HTTP requests and records
status + body snippet. Read-only GETs plus a small set of explicit writes.
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend"
BASE = "http://127.0.0.1:3000"
PYBASE = "http://127.0.0.1:8000"

# Never use the ambient corporate proxy for localhost.
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

CREDS = {
    "seller": ("samarth@trustdrive.dev", "demo1234"),
    "buyer": ("aditya@trustdrive.dev", "demo1234"),
    "admin": ("admin@trustdrive.dev", "demo1234"),
}


def request(method: str, url: str, body=None, cookie: str = "", token: str = "",
            headers: dict | None = None, timeout: int = 25):
    data = None
    hdr = dict(headers or {})
    if cookie:
        hdr["Cookie"] = cookie
    if token:
        hdr["Authorization"] = f"Bearer {token}"
    if body is not None:
        data = json.dumps(body).encode()
        hdr["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdr, method=method)
    try:
        with OPENER.open(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8", "replace")
            return r.status, raw, dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), dict(e.headers)
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}", {}


def login(role: str):
    email, pw = CREDS[role]
    status, raw, hdrs = request("POST", f"{BASE}/api/v1/auth/login",
                                {"email": email, "password": pw})
    cookies = []
    for k, v in hdrs.items():
        if k.lower() == "set-cookie":
            cookies.append(v.split(";")[0])
    cookie = "; ".join(c for c in cookies if c.startswith("td_"))
    token = ""
    try:
        token = json.loads(raw).get("data", {}).get("accessToken", "") or ""
    except Exception:
        pass
    return status, cookie, raw[:300]


def route_urls():
    """Turn app/api/**/route.ts paths into concrete URLs using seed IDs."""
    ids = {
        "[id]": "v-seller", "[vehicleId]": "v-seller", "[vehicle_id]": "v-seller",
        "[docId]": "d-seller-rc", "[doc_id]": "d-seller-rc", "[documentId]": "d-seller-rc",
        "[damageId]": "dm-1", "[damage_id]": "dm-1", "[photoId]": "ph-1",
        "[photo_id]": "ph-1", "[listingId]": "v-seller", "[listing_id]": "v-seller",
        "[runId]": "run-1", "[token]": "TD-7H2P4R1S", "[userId]": "u-seller",
        "[action]": "publish", "[...key]": "sample.pdf",
    }
    out = []
    for p in sorted((FRONT / "app" / "api").rglob("route.ts")):
        rel = p.relative_to(FRONT / "app").as_posix()
        url = "/" + rel.replace("/route.ts", "")
        for k, v in ids.items():
            url = url.replace(k, v)
        out.append(url)
    return out


def main():
    print("=== LOGIN ===")
    sessions = {}
    for role in CREDS:
        st, ck, body = login(role)
        sessions[role] = ck
        print(f"  {role}: HTTP {st} cookie={'yes' if ck else 'NO'} {body[:140]}")

    print("\n=== GET SWEEP (117 routes, seller session) ===")
    urls = route_urls()
    results = []
    for u in urls:
        st, body, _ = request("GET", BASE + u, cookie=sessions["seller"], timeout=20)
        snippet = body[:180].replace("\n", " ")
        results.append((u, "GET", st, snippet))
        print(f"  {st:>4} GET {u}  {snippet[:110]}")
    print(f"\n  total={len(results)} "
          f"ok2xx={sum(1 for r in results if 200 <= r[2] < 300)} "
          f"404={sum(1 for r in results if r[2] == 404)} "
          f"500={sum(1 for r in results if r[2] >= 500)} "
          f"401={sum(1 for r in results if r[2] == 401)} "
          f"0={sum(1 for r in results if r[2] == 0)}")

    out = ROOT / "qa" / "live_probe_results.json"
    out.write_text(json.dumps({"logins": {k: bool(v) for k, v in sessions.items()},
                               "results": results}, indent=2), encoding="utf-8")
    print(f"\nSaved {out}")


if __name__ == "__main__":
    main()
