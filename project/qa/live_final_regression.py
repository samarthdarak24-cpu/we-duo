"""
TrustDrive final live full-stack regression (Phase 17).
Hits the RUNNING stack (Next.js :3000 + Python :8000) and reports PASS/FAIL per item.
No external credentials required. The OCR doc row seeded here is cleaned up at the end.

Auth model: cookie-based. Login sets the `td_token` cookie (a JWT).
- Next.js proxy routes (categories, vehicles detect/ocr/review) -> send td_token as Cookie header.
- Python-native endpoints (/api/v1/system/*, /api/v1/ai/*) -> send td_token as Bearer.
"""
import json, os, sqlite3, urllib.request, urllib.error, http.cookiejar, uuid, shutil, hashlib

ROOT = os.path.dirname(__file__)
BASE = "http://localhost:3000"
PY   = "http://127.0.0.1:8000"
DB   = os.path.join(ROOT, "..", ".data", "trustdrive.db")
UPLOAD = os.path.join(ROOT, "..", ".data", "uploads")
VEH = "v-bmw"
SELLER = "samarth@trustdrive.dev"

results = []
def record(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))

PY_PREFIXES = ("/api/v1/system/", "/api/v1/ai/", "/health")

def make_opener():
    cj = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj)), cj

def call(method, path, opener=None, token=None, body=None):
    host = PY if path.startswith(PY_PREFIXES) else BASE
    url = host + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        if host == PY:
            req.add_header("Authorization", f"Bearer {token}")
        else:
            req.add_header("Cookie", f"td_token={token}")
    try:
        if opener is not None:
            resp = opener.open(req, timeout=180)
        else:
            resp = urllib.request.urlopen(req, timeout=180)
        return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def td_token_from(jar):
    return next((c.value for c in jar if c.name == "td_token"), None)

# 1) Public health
s, _ = call("GET", "/")
record("Next.js public homepage", s == 200, f"status={s}")

# 2) Login (cookie-based) — use opener to capture Set-Cookie
opener, jar = make_opener()
s, b = call("POST", "/api/v1/auth/login", opener=opener, body={"email": SELLER, "password": "demo123456"})
token = td_token_from(jar)
record("Seller login (cookie auth)", s == 200 and bool(token), f"status={s} token={'yes' if token else 'no'}")
record("td_token cookie issued", bool(token), "cookie present" if token else "MISSING")

# 3) Vehicle categories (correct shape: data.implemented / data.matrix)
s, b = call("GET", "/api/v1/categories", token=token)
try:
    data = json.loads(b).get("data", {})
    n = len(data.get("implemented") or data.get("matrix") or [])
    record("Vehicle categories served (>=20 implemented)", s == 200 and n >= 20, f"status={s} implemented={n}")
except Exception as e:
    record("Vehicle categories served (>=20 implemented)", False, str(e))

# 4) Python fraud model-status (honest experimental)
s, b = call("GET", "/api/v1/ai/fraud/model-status", token=token)
try:
    fs = json.loads(b)
    honest = fs.get("mode") == "experimental" and fs.get("training_data") == "synthetic-demo"
    record("Fraud model-status honest", s == 200 and honest, f"mode={fs.get('mode')} data={fs.get('training_data')}")
except Exception as e:
    record("Fraud model-status honest", False, str(e))

# 5) System status endpoints
for ep in ("storage", "registry", "notifications"):
    s, b = call("GET", f"/api/v1/system/{ep}", token=token)
    record(f"System status /system/{ep}", s == 200, f"status={s}")

# 6) YOLO detect via Next.js proxy on an EXISTING vehicle_images photo (real file on disk).
# The Python detect endpoint reads the `vehicle_images` table, not `listing_images`.
con2 = sqlite3.connect(DB); con2.row_factory = sqlite3.Row
PHOTO = None
for r in con2.execute("SELECT id, file_key FROM vehicle_images WHERE vehicle_id=? AND file_key IS NOT NULL", (VEH,)):
    fk = r["file_key"]
    p = os.path.join(UPLOAD, fk) if not os.path.isabs(fk) else fk
    if os.path.isfile(p):
        PHOTO = r["id"]; break
con2.close()
if PHOTO:
    s, b = call("POST", f"/api/v1/vehicles/{VEH}/photos/{PHOTO}/detect", token=token)
    try:
        dd = json.loads(b)
        dets = dd.get("detections") or dd.get("candidates") or []
        real = any((d.get("confidence") or 0) > 0.2 for d in dets) if dets else False
        record("YOLO detect via proxy (REAL)", s == 200 and real, f"status={s} detections={len(dets)}")
    except Exception as e:
        record("YOLO detect via proxy (REAL)", False, str(e))
else:
    record("YOLO detect via proxy (REAL)", False, "no vehicle_images photo with file found")

# 7) OCR via Next.js proxy on a freshly-seeded doc with a real PDF (file under upload_dir)
con = sqlite3.connect(DB); con.row_factory = sqlite3.Row
src_pdf = None
for root, _, files in os.walk(UPLOAD):
    for f in files:
        if f.lower().endswith(".pdf"):
            src_pdf = os.path.join(root, f); break
    if src_pdf: break
if src_pdf:
    did = "doc-reg-" + uuid.uuid4().hex[:8]
    dest_rel = f"documents/{VEH}/{did}.pdf"
    dst = os.path.join(UPLOAD, dest_rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src_pdf, dst)
    sha = hashlib.sha256(open(dst, "rb").read()).hexdigest()
    con.execute("INSERT INTO documents (id, vehicle_id, type, status, file_key, file_name, mime, size_bytes, sha256, uploaded_at) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))",
                (did, VEH, "rc", "uploaded", dest_rel, f"{did}.pdf", "application/pdf", os.path.getsize(dst), sha))
    con.commit()
    s, b = call("POST", f"/api/v1/vehicles/{VEH}/documents/{did}/ocr", token=token)
    try:
        od = json.loads(b)
        txt = (od.get("ocr_text") or od.get("text") or "")
        conf = od.get("ocr_confidence") or od.get("confidence") or 0
        record("OCR via proxy (REAL)", s == 200 and len(txt) > 20, f"status={s} conf={conf} chars={len(txt)}")
    except Exception as e:
        record("OCR via proxy (REAL)", False, str(e))
    s2, _ = call("PATCH", f"/api/v1/vehicles/{VEH}/documents/{did}/ocr", token=token, body={"fields": {"policyNo": "POLQA886421", "insurer": "ICICI LOMBARD"}})
    record("OCR review via proxy (PATCH fields)", s2 == 200, f"status={s2}")
    # cleanup
    con.execute("DELETE FROM documents WHERE id=?", (did,)); con.commit()
    try: os.remove(dst)
    except OSError: pass
else:
    record("OCR via proxy (REAL)", False, "no source PDF found")
con.close()

# Summary
print("\n=== REGRESSION SUMMARY ===")
passed = sum(1 for _, ok, _ in results if ok)
print(f"{passed}/{len(results)} checks passed")
failed = [n for n, ok, _ in results if not ok]
print("FAILED:", failed if failed else "NONE — ALL GREEN")
