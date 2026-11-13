import json, urllib.request, urllib.error, http.cookiejar, os, shutil, sqlite3, uuid

F = "http://localhost:3000"
REPO = "C:/Users/darak/Downloads/finall caranimation"
DB = os.path.join(REPO, ".data", "trustdrive.db")
UPLOAD = os.path.join(REPO, ".data", "uploads")
VEH = "v-bmw"


def call(method, path, jar, body=None):
    url = F + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        resp = opener.open(req, timeout=180)
        return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

# 1) frontend login on localhost -> sets td_token cookie
s, b = call("POST", "/api/v1/auth/login", jar, {"email": "samarth@trustdrive.dev", "password": "demo123456"})
print("frontend login", s)
cookies = [c.name for c in jar]
print("cookies after login:", cookies)
if s != 200 or "td_token" not in cookies:
    print("LOGIN BODY:", b[:300]); raise SystemExit(1)

# 2) create a real photo row for v-bmw
src = "frontend/public/images/cars/audi-sedan.jpg"
dst_key = f"vehicles/{VEH}/photos/proxy-car.jpg"
dst = os.path.join(UPLOAD, dst_key)
os.makedirs(os.path.dirname(dst), exist_ok=True)
shutil.copy(src, dst)
con = sqlite3.connect(DB)
con.execute(
    "INSERT OR REPLACE INTO vehicle_images(id, vehicle_id, file_key, kind, sha256, bytes, mime, uploaded_by, created_at) "
    "VALUES (?,?,?,?,?,?,?,?,?)",
    (f"vi-px-{uuid.uuid4().hex[:8]}", VEH, dst_key, "exterior", "px", os.path.getsize(dst), "image/jpeg", "u-seller", "2026-01-01T00:00:00Z"),
)
pid = con.execute("SELECT id FROM vehicle_images WHERE vehicle_id=? AND file_key=?", (VEH, dst_key)).fetchone()[0]
con.commit()

# 3) call the Next.js PROXY route (forwards the td_token cookie to Python as the user)
# urllib's CookieJar refuses to SEND a host-only localhost cookie (no dot in domain),
# so extract the token and attach it explicitly as a Cookie header to mimic the browser.
td_token_val = None
for c in jar:
    if c.name == "td_token":
        td_token_val = c.value
print("extracted td_token:", (td_token_val or "NONE")[:24], "...")
detect_req = urllib.request.Request(
    F + f"/api/v1/vehicles/{VEH}/photos/{pid}/detect",
    data=json.dumps({}).encode(),
    method="POST",
    headers={"Content-Type": "application/json", "Cookie": f"td_token={td_token_val}"},
)
try:
    dr = urllib.request.urlopen(detect_req, timeout=180)
    s, b = dr.status, dr.read().decode()
except urllib.error.HTTPError as e:
    s, b = e.code, e.read().decode()
print("\nPROXY detect ->", s)
print(b[:400])
j = json.loads(b) if b.startswith("{") else {}
if j.get("candidateDamageIds"):
    print("candidates created via proxy:", j["candidateDamageIds"])

# cleanup
con.execute("UPDATE damage_records SET status='rejected' WHERE description LIKE 'Auto-detected%' AND vehicle_id=?", (VEH,))
con.execute("DELETE FROM damage_records WHERE description LIKE 'Auto-detected%' AND vehicle_id=?", (VEH,))
con.execute("DELETE FROM vehicle_images WHERE id=?", (pid,))
con.commit()
if os.path.exists(dst):
    os.remove(dst)
print("\nproxy test cleanup done")
