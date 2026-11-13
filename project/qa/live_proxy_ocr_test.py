import json, urllib.request, urllib.error, http.cookiejar, os, sqlite3, uuid

F = "http://localhost:3000"
REPO = "C:/Users/darak/Downloads/finall caranimation"
DB = os.path.join(REPO, ".data", "trustdrive.db")
UPLOAD = os.path.join(REPO, ".data", "uploads")
VEH = "v-bmw"
SRC_PDF = os.path.join(UPLOAD, "documents", VEH, "42acddfd-8c9a-48c3-a235-3a6f18221a48.pdf")

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def call(method, path, body=None, extra=None):
    req = urllib.request.Request(
        F + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Content-Type": "application/json", **(extra or {})},
    )
    try:
        r = opener.open(req, timeout=240)
        return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

# 1) login seller -> td_token cookie
s, b = call("POST", "/api/v1/auth/login", {"email": "samarth@trustdrive.dev", "password": "demo123456"})
print("login", s)
td_token = next((c.value for c in jar if c.name == "td_token"), None)
assert td_token, "no td_token cookie"
cookie_hdr = f"td_token={td_token}"

# 2) seed a temp document row with a real file_key
file_key = f"documents/{VEH}/ocr-proxy-{uuid.uuid4().hex[:8]}.pdf"
dst = os.path.join(UPLOAD, file_key)
os.makedirs(os.path.dirname(dst), exist_ok=True)
import shutil
shutil.copy(SRC_PDF, dst)
con = sqlite3.connect(DB)
con.execute(
    "INSERT INTO documents(id, vehicle_id, type, file_name, mime, size_bytes, status, sha256, uploaded_at, file_key) "
    "VALUES (?,?,?,?,?,?,?,?,?,?)",
    (f"doc-ocr-{uuid.uuid4().hex[:8]}", VEH, "rc", "ocr-proxy.pdf", "application/pdf",
     os.path.getsize(dst), "pending", "proxy", "2026-01-01T00:00:00Z", file_key),
)
doc_id = con.execute("SELECT id FROM documents WHERE file_key=?", (file_key,)).fetchone()[0]
con.commit()
print("seeded doc", doc_id, "->", file_key)

# 3) OCR via Next.js PROXY (forwards td_token cookie as user bearer)
s, b = call("POST", f"/api/v1/vehicles/{VEH}/documents/{doc_id}/ocr", {}, {"Cookie": cookie_hdr})
print("\nPROXY OCR POST ->", s)
print(b[:500])
j = json.loads(b) if b.startswith("{") else {}
if j.get("text") is not None:
    print("OCR extracted text length:", len(j["text"]), "| confidence:", j.get("confidence"))

# 4) OCR correction via PROXY PATCH
s2, b2 = call("PATCH", f"/api/v1/vehicles/{VEH}/documents/{doc_id}/ocr",
              {"fields": {"registration_number": "MH01AB1234", "owner_name": "Test Owner"}},
              {"Cookie": cookie_hdr})
print("\nPROXY OCR PATCH ->", s2, b2[:200])

# cleanup
con.execute("DELETE FROM documents WHERE id=?", (doc_id,))
con.commit()
if os.path.exists(dst):
    os.remove(dst)
print("\nocr proxy test cleanup done")
