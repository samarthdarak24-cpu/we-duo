import json, urllib.request, urllib.error, os, sqlite3

BASE = "http://127.0.0.1:8000"
REPO = "C:/Users/darak/Downloads/finall caranimation"
DB = os.path.join(REPO, ".data", "trustdrive.db")
UPLOAD = os.path.join(REPO, ".data", "uploads")


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


print("== login ==")
s, b = req("POST", "/api/v1/auth/login", body={"email": "samarth@trustdrive.dev", "password": "demo1234"})
assert s == 200, (s, b)
tok = json.loads(b)["access_token"]
print("login 200 OK; token len", len(tok))

print("\n== fraud/model-status ==")
s, b = req("GET", "/api/v1/ai/fraud/model-status", token=tok)
print(s, b[:240])

print("\n== system status ==")
for p in ["storage", "registry", "notifications"]:
    s, b = req("GET", f"/api/v1/system/{p}", token=tok)
    print(f"system/{p}", s, b[:160])

con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row


def fp(key):
    return key if key.startswith("/") else os.path.join(UPLOAD, key)


print("\n== detect on a CAR photo (should run YOLO) ==")
car = con.execute(
    "select v.id veh, v.category cat, p.id pid, p.file_key fk from vehicles v "
    "join vehicle_images p on p.vehicle_id=v.id "
    "where v.category in ('Sedan','SUV','Hatchback','MUV') and p.kind='exterior' limit 1"
).fetchone()
if not car:
    car = con.execute(
        "select v.id veh, v.category cat, p.id pid, p.file_key fk from vehicles v "
        "join vehicle_images p on p.vehicle_id=v.id where v.category in ('Sedan','SUV') limit 1"
    ).fetchone()
print("car:", dict(car) if car else None)
if car:
    print("photo file exists:", os.path.exists(fp(car["fk"])), fp(car["fk"]))
    s, b = req("POST", f"/api/v1/vehicles/{car['veh']}/photos/{car['pid']}/detect", token=tok)
    print("detect(car)", s, b[:500])

print("\n== detect on a MOTORCYCLE photo (should be 409 unavailable) ==")
mc = con.execute(
    "select v.id veh, p.id pid from vehicles v join vehicle_images p on p.vehicle_id=v.id "
    "where v.category='Motorcycle' limit 1"
).fetchone()
if mc:
    s, b = req("POST", f"/api/v1/vehicles/{mc['veh']}/photos/{mc['pid']}/detect", token=tok)
    print("detect(motorcycle)", s, b[:220])

print("\n== OCR on a document ==")
doc = con.execute(
    "select id, vehicle_id, file_key, mime from documents where file_key is not null limit 1"
).fetchone()
print("doc:", dict(doc) if doc else None)
if doc:
    print("doc file exists:", os.path.exists(fp(doc["file_key"])), fp(doc["file_key"]))
    s, b = req("POST", f"/api/v1/vehicles/{doc['vehicle_id']}/documents/{doc['id']}/ocr", token=tok)
    print("ocr", s, b[:500])
print("\nDONE")
