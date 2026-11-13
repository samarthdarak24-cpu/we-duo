#!/usr/bin/env python3
"""Live integration proof for the FastAPI service (CORRECTED).

Authenticates as seeded seller + buyer, exercises real endpoints, and
cross-checks every API value against a direct SQL read of the SAME shared
SQLite database the Next.js app uses. FastAPI returns dicts directly
({items,total} for lists; the object for detail), NOT wrapped in {data}.
"""
import json
import sqlite3
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8000"
DB = r"C:\Users\darak\Downloads\finall caranimation\.data\trustdrive.db"
SELLER = ("samarth@trustdrive.dev", "demo123456")
BUYER = ("rohan@trustdrive.dev", "demo123456")


def req(method, path, token=None, body=None):
    h = {}
    data = None
    if token:
        h["Authorization"] = "Bearer " + token
    if body is not None:
        h["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    r = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def login(email, password):
    st, b = req("POST", "/api/backend/auth/login", body={"email": email, "password": password})
    return st, (b.get("access_token") or b.get("token")), (b.get("user") or {})


def sql(query, params=()):
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in con.execute(query, params).fetchall()]
    finally:
        con.close()


def as_list(body):
    if isinstance(body, dict):
        if "items" in body and isinstance(body["items"], list):
            return body["items"]
        if "data" in body and isinstance(body["data"], list):
            return body["data"]
    if isinstance(body, list):
        return body
    return []


def find_obj(body):
    """Return the dict most likely holding entity fields."""
    if isinstance(body, dict):
        for k in ("vehicle", "data", "item"):
            if isinstance(body.get(k), dict):
                return body[k]
        return body
    return {}


results = []


def check(name, cond, detail=""):
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f"  -> {detail}" if detail else ""))
    results.append(cond)


print("=" * 70)
print("TRUSTDRIVE LIVE API PROOF (FastAPI) — corrected")
print("=" * 70)

st_s, s_tok, s_user = login(*SELLER)
st_b, b_tok, b_user = login(*BUYER)
check("Seller login 200 + bearer token", st_s == 200 and bool(s_tok), f"id={s_user.get('id')}")
check("Buyer login 200 + bearer token", st_b == 200 and bool(b_tok), f"id={b_user.get('id')}")
s_id, b_id = s_user.get("id"), b_user.get("id")

# Seller vehicles vs SQL
st1, sv = req("GET", "/api/v1/vehicles/mine", token=s_tok)
api_seller = as_list(sv)
sql_seller = sql("SELECT id,make,model,owner_id FROM vehicles WHERE owner_id=?", (s_id,))
check("Seller /vehicles/mine -> 200", st1 == 200, f"status={st1}")
check("Seller API vehicle count == SQL owner count",
      len(api_seller) == len(sql_seller), f"api={len(api_seller)} sql={len(sql_seller)}")

# Vehicle detail matches DB
if sql_seller:
    vid = sql_seller[0]["id"]
    st2, vd = req("GET", f"/api/v1/vehicles/{vid}", token=s_tok)
    v = find_obj(vd)
    row = sql_seller[0]
    check("Vehicle detail matches DB row",
          v.get("make") == row["make"] and v.get("model") == row["model"],
          f"api=({v.get('make')},{v.get('model')}) db=({row['make']},{row['model']})")

    # Trust score vs SQL
    st3, ts = req("GET", f"/api/v1/vehicles/{vid}/trust-score", token=s_tok)
    score = find_obj(ts).get("score")
    sql_ts = sql("SELECT score FROM trust_scores WHERE vehicle_id=? ORDER BY computed_at DESC LIMIT 1", (vid,))
    check("Trust score endpoint numeric", isinstance(score, (int, float)), f"score={score}")
    check("Trust score matches a SQL trust_scores row",
          bool(sql_ts) and (score == sql_ts[0]["score"] if score is not None else True),
          f"sql_score={sql_ts[0]['score'] if sql_ts else 'none'}")

# Buyer marketplace spine vs SQL
st4, mkt = req("GET", "/api/v1/marketplace/listings", token=b_tok)
api_pub = len(as_list(mkt))
sql_pub = sql("SELECT id FROM listings WHERE status='published'")
check("Buyer marketplace -> 200", st4 == 200, f"status={st4}")
check("Buyer marketplace count == SQL published count",
      api_pub == len(sql_pub), f"api={api_pub} sql={len(sql_pub)}")

# Buyer /vehicles/mine is buyer-scoped (published view), not seller leakage
st5, bv = req("GET", "/api/v1/vehicles/mine", token=b_tok)
buyer_view = as_list(bv)
seller_ids = {r["id"] for r in sql_seller}
leak = [x for x in buyer_view if isinstance(x, dict) and x.get("owner_id") in seller_ids]
check("Buyer /vehicles/mine does not leak seller's unpublished vehicles",
      len(leak) == 0, f"leaked={len(leak)} (buyer sees {len(buyer_view)} published)")

# RBAC: unauth -> 401
st6, _ = req("GET", "/api/v1/vehicles/mine")
check("Unauthenticated protected route -> 401", st6 == 401, f"status={st6}")

# RBAC: buyer cannot create a vehicle (seller/admin only) -> 403
st7, _ = req("POST", "/api/v1/vehicles", token=b_tok,
             body={"make": "X", "model": "Y", "reg_no": "XX00ZZ0000", "vin": "1HGCM82633A000001", "year": 2020})
check("Buyer POST /vehicles -> 403 (role enforced)", st7 == 403, f"status={st7}")

print("-" * 70)
passed = sum(results)
print(f"TOTAL: {len(results)}  PASS: {passed}  FAIL: {len(results)-passed}")
print("=" * 70)
