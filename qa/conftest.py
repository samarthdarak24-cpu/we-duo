"""Shared fixtures + machine-readable result capture for the live QA suite.

Unlike the unit suites, these tests hit REAL running servers over HTTPX and
verify that writes land in the real SQLite database. Proxies are disabled so
the environment's HTTP_PROXY never intercepts 127.0.0.1.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[1]
NEXT_URL = os.getenv("QA_NEXT_URL", "http://127.0.0.1:3300")
INTEL_URL = os.getenv("QA_INTEL_URL", "http://127.0.0.1:8000")
DB_FILE = ROOT / ".data" / "trustdrive.db"
RESULTS_FILE = ROOT / "qa" / "results" / "live_api.json"

ACCOUNTS = {
    "seller_a": ("samarth@trustdrive.dev", "u-seller"),
    "seller_b": ("weduo@trustdrive.dev", "u-seller2"),
    "buyer_a": ("rohan@trustdrive.dev", "u-buyer2"),
    "buyer_b": ("priya@trustdrive.dev", "u-buyer3"),
    "admin": ("admin@trustdrive.dev", "u-admin"),
}

SELLER_A_VEHICLE = "v-bmw"
SELLER_B_VEHICLE = "v-audi"
PUBLISHED_LISTING = "l-bmw"
BUYER_A_INQUIRY = "q1"
BUYER_B_INQUIRY = "q2"

_REPORTS: list[dict] = []


def pytest_runtest_logreport(report):
    if report.when == "call" or (report.when == "setup" and report.outcome != "passed"):
        _REPORTS.append({
            "nodeid": report.nodeid,
            "outcome": report.outcome,
            "duration_ms": round(report.duration * 1000, 1),
            "longrepr": str(report.longrepr)[:600] if report.failed else "",
        })


def pytest_sessionfinish(session, exitstatus):
    payload = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "next_url": NEXT_URL,
        "intel_url": INTEL_URL,
        "exitstatus": int(exitstatus),
        "total": len(_REPORTS),
        "passed": sum(1 for r in _REPORTS if r["outcome"] == "passed"),
        "failed": sum(1 for r in _REPORTS if r["outcome"] == "failed"),
        "skipped": sum(1 for r in _REPORTS if r["outcome"] == "skipped"),
        "tests": _REPORTS,
    }
    RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def mkclient(base: str) -> httpx.Client:
    return httpx.Client(base_url=base, timeout=45.0, trust_env=False, follow_redirects=False)


@pytest.fixture(scope="session")
def next_url() -> str:
    return NEXT_URL


@pytest.fixture(scope="session")
def intel_url() -> str:
    return INTEL_URL


@pytest.fixture(scope="session")
def tokens() -> dict[str, dict[str, str]]:
    """Log in once per role per runtime; reuse tokens for the whole session."""
    out: dict[str, dict[str, str]] = {}
    for name, (email, _uid) in ACCOUNTS.items():
        with mkclient(NEXT_URL) as c:
            r = c.post("/api/v1/auth/login", json={"email": email, "password": "demo1234"})
            assert r.status_code == 200, f"Next login failed for {name}: {r.status_code} {r.text[:200]}"
            out.setdefault(name, {})["next"] = c.cookies.get("td_token") or ""
        with mkclient(INTEL_URL) as c:
            r = c.post("/api/v1/auth/login", json={"email": email, "password": "demo1234"})
            assert r.status_code == 200, f"FastAPI login failed for {name}: {r.status_code} {r.text[:200]}"
            body = r.json()
            tok = body.get("access_token") or body.get("data", {}).get("access_token")
            assert tok, f"FastAPI login returned no access_token for {name}: {body}"
            out[name]["intel"] = tok
    return out


@pytest.fixture
def nxt(tokens):
    """Next.js client prefilled with the seller-A session by default."""
    with mkclient(NEXT_URL) as c:
        c.headers.update({"Authorization": f"Bearer {tokens['seller_a']['next']}"})
        yield c


@pytest.fixture
def intel(tokens):
    with mkclient(INTEL_URL) as c:
        c.headers.update({"Authorization": f"Bearer {tokens['seller_a']['intel']}"})
        yield c


@pytest.fixture
def auth(tokens):
    def _header(who: str, runtime: str = "next") -> dict[str, str]:
        return {"Authorization": f"Bearer {tokens[who][runtime]}"}
    return _header


@pytest.fixture
def db():
    con = sqlite3.connect(DB_FILE)
    con.row_factory = sqlite3.Row
    yield con
    con.close()


def rows(con, sql: str, *params) -> list[dict]:
    try:
        return [dict(r) for r in con.execute(sql, params).fetchall()]
    except sqlite3.Error:
        return []
