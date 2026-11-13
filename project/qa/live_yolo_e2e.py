import json, urllib.request, urllib.error, os, shutil, sqlite3, uuid

BASE = "http://127.0.0.1:8000"
REPO = "C:/Users/darak/Downloads/finall caranimation"
DB = os.path.join(REPO, ".data", "trustdrive.db")
UPLOAD = os.path.join(REPO, ".data", "uploads")
VEH = "v-bmw"  # a seeded Sedan


def req(method, path, token=None, body=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(r, timeout=180)
        return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


# 1) login
s, b = req("POST", "/api/v1/auth/login", body={"email": "samarth@trustdrive.dev", "password": "demo123456"})
tok = json.loads(b)["access_token"]

# 2) place a real car image on disk + register a photo row
src = "frontend/public/images/cars/audi-sedan.jpg"
dst_key = f"vehicles/{VEH}/photos/e2e-car.jpg"
dst = os.path.join(UPLOAD, dst_key)
os.makedirs(os.path.dirname(dst), exist_ok=True)
shutil.copy(src, dst)
print("copied image ->", dst, "exists:", os.path.exists(dst))

con = sqlite3.connect(DB)
con.execute(
    "INSERT OR REPLACE INTO vehicle_images(id, vehicle_id, file_key, kind, sha256, bytes, mime, uploaded_by, created_at) "
    "VALUES (?,?,?,?,?,?,?,?,?)",
    (f"vi-e2e-{uuid.uuid4().hex[:8]}", VEH, dst_key, "exterior", "e2e", os.path.getsize(dst), "image/jpeg", "u-seller", "2026-01-01T00:00:00Z"),
)
pid = con.execute("SELECT id FROM vehicle_images WHERE vehicle_id=? AND file_key=?", (VEH, dst_key)).fetchone()[0]
con.commit()
print("photo row:", pid)

# 3) trigger detection
s, b = req("POST", f"/api/v1/vehicles/{VEH}/photos/{pid}/detect", token=tok)
print("\nPOST detect ->", s)
j = json.loads(b)
print("  available:", j.get("available"), "detections:", len(j.get("detections", [])), "candidates:", j.get("candidateDamageIds"))
for d in j.get("detections", [])[:3]:
    print("   ", d)
cands = j.get("candidateDamageIds", [])

# 4) confirm persisted + review one
rows = con.execute("SELECT id, status, damage_type, severity FROM damage_records WHERE vehicle_id=? AND status='detected_candidate'", (VEH,)).fetchall()
print("\npersisted candidate damage_records:", len(rows))
if cands:
    s, b = req("PATCH", f"/api/v1/vehicles/{VEH}/damage/{cands[0]}/review", token=tok, body={"status": "verified", "severity": "minor"})
    print("PATCH review ->", s, b[:160])

# cleanup
con.execute("DELETE FROM damage_records WHERE id IN (SELECT id FROM damage_records WHERE vehicle_id=? AND status IN ('detected_candidate','verified') AND description LIKE 'Auto-detected%')", (VEH,))
con.execute("DELETE FROM vehicle_images WHERE id=?", (pid,))
con.commit()
if os.path.exists(dst):
    os.remove(dst)
print("\ncleaned up test photo + candidate records")
