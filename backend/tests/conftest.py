"""Isolated test database. Set env BEFORE any app module is imported."""
from __future__ import annotations

import hashlib
import os
import sqlite3
import tempfile
from pathlib import Path

TMP = Path(tempfile.mkdtemp(prefix="trustdrive-test-"))
DB_FILE = TMP / "test.db"

os.environ["TD_DB_URL"] = f"sqlite+pysqlite:///{DB_FILE.as_posix()}"
os.environ["TD_UPLOAD_DIR"] = str(TMP / "uploads")
os.environ["TD_LLM_PROVIDER"] = "none"
os.environ["TD_ENV"] = "local"
os.environ["TD_RATE_LIMIT_AUTH"] = "1000"
# SEC-002: intelligence endpoints now require a service token (or a valid user
# JWT). Test clients send this header by default; the security suite proves that
# anonymous callers are rejected.
os.environ["TD_SERVICE_TOKEN"] = "qa-test-service-token"
os.environ.pop("TD_BROKER_URL", None)


def _hash(password: str) -> str:
    salt = "0123456789abcdef0123456789abcdef"
    key = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64)
    return f"{salt}:{key.hex()}"


SCHEMA = """
CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, role TEXT, email TEXT UNIQUE,
  password_hash TEXT, initials TEXT, phone TEXT DEFAULT '', city TEXT DEFAULT '',
  seller_type TEXT, business_name TEXT, kyc_status TEXT DEFAULT 'not_started',
  preferences TEXT DEFAULT '{}', avatar_url TEXT, email_verified INTEGER DEFAULT 0,
  twofa_enabled INTEGER DEFAULT 0, kyc_doc_key TEXT, last_login_at TEXT, created_at TEXT,
  deleted_at TEXT);
CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT, refresh_hash TEXT,
  user_agent TEXT DEFAULT '', ip TEXT DEFAULT '', created_at TEXT, last_seen_at TEXT, revoked_at TEXT);
CREATE TABLE auth_tokens (id TEXT PRIMARY KEY, user_id TEXT, type TEXT, token_hash TEXT,
  expires_at TEXT, used_at TEXT, created_at TEXT);
CREATE TABLE vehicles (id TEXT PRIMARY KEY, owner_id TEXT, reg_no TEXT, vin TEXT, make TEXT,
  model TEXT, variant TEXT, year INTEGER, fuel TEXT, transmission TEXT, category TEXT,
  color TEXT, ownership_count INTEGER DEFAULT 1, location TEXT, km_claimed INTEGER DEFAULT 0,
  last_verified_km INTEGER, asking_price INTEGER DEFAULT 0, status TEXT DEFAULT 'draft',
  base_value INTEGER, condition_score REAL, trustdrive_id TEXT, qr_token TEXT,
  description TEXT DEFAULT '', condition TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE documents (id TEXT PRIMARY KEY, vehicle_id TEXT, status TEXT, sha256 TEXT,
  file_name TEXT, file_key TEXT, mime TEXT, size_bytes INTEGER, type TEXT, consent INTEGER DEFAULT 1,
  version INTEGER DEFAULT 1, supersedes_id TEXT, extracted TEXT DEFAULT '{}', uploaded_at TEXT,
  verified_at TEXT, status_reason TEXT, deleted_at TEXT);
CREATE TABLE mileage_readings (id TEXT PRIMARY KEY, vehicle_id TEXT, year TEXT, km INTEGER,
  date TEXT, flagged INTEGER DEFAULT 0, verified INTEGER DEFAULT 1, source TEXT,
  is_seller_claim INTEGER DEFAULT 0, document_id TEXT);
CREATE TABLE findings (id TEXT PRIMARY KEY, vehicle_id TEXT, rule_key TEXT, code TEXT,
  title TEXT, explanation TEXT, recommendation TEXT, status TEXT, severity TEXT,
  type TEXT, evidence TEXT DEFAULT '{}', points INTEGER DEFAULT 0, created_at TEXT);
CREATE TABLE history_events (id TEXT PRIMARY KEY, vehicle_id TEXT, category TEXT,
  event_date TEXT, mileage_km INTEGER, title TEXT, description TEXT, source TEXT,
  evidence_document_id TEXT, status TEXT, supersedes_id TEXT, created_by TEXT, created_at TEXT);
CREATE TABLE damage_records (id TEXT PRIMARY KEY, vehicle_id TEXT, zone_id TEXT, component TEXT,
  description TEXT, severity TEXT, repair_status TEXT, repair_details TEXT, inspection_date TEXT,
  status TEXT, photo_keys TEXT DEFAULT '[]', repair_invoice_doc_id TEXT, supersedes_id TEXT,
  created_by TEXT, created_at TEXT);
CREATE TABLE vehicle_inspections (id TEXT PRIMARY KEY, vehicle_id TEXT, inspector_id TEXT,
  inspector_name TEXT, inspection_type TEXT, inspection_date TEXT, odometer_km INTEGER,
  structural_damage INTEGER, passed INTEGER, score REAL, status TEXT, summary TEXT,
  findings_json TEXT DEFAULT '[]', evidence_json TEXT DEFAULT '[]', report_document_id TEXT,
  reviewed_by TEXT, reviewed_at TEXT, review_note TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT);
CREATE TABLE accident_records (id TEXT PRIMARY KEY, vehicle_id TEXT, event_date TEXT,
  severity TEXT, description TEXT, repair_status TEXT, damage_zones TEXT DEFAULT '[]',
  estimated_cost INTEGER, created_by TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT);
CREATE TABLE vehicle_images (id TEXT PRIMARY KEY, vehicle_id TEXT, file_key TEXT, kind TEXT,
  caption TEXT, position INTEGER DEFAULT 0, sha256 TEXT, bytes INTEGER, mime TEXT,
  taken_at TEXT, uploaded_by TEXT, created_at TEXT, deleted_at TEXT);
CREATE TABLE verification_evidence (id TEXT PRIMARY KEY, vehicle_id TEXT, source_type TEXT,
  source_id TEXT, kind TEXT, label TEXT, source TEXT, reliability TEXT, sha256 TEXT, hash TEXT,
  payload TEXT DEFAULT '{}', disclosed_to_buyer INTEGER DEFAULT 0, run_id TEXT, created_at TEXT);
CREATE TABLE verification_runs (id TEXT PRIMARY KEY, vehicle_id TEXT, status TEXT,
  started_at TEXT, finished_at TEXT, summary TEXT DEFAULT '{}');
CREATE TABLE verification_results (id TEXT PRIMARY KEY, run_id TEXT, vehicle_id TEXT,
  check_key TEXT, status TEXT, details TEXT, evidence_ids TEXT DEFAULT '[]');
CREATE TABLE trust_scores (id TEXT PRIMARY KEY, vehicle_id TEXT, score INTEGER, band TEXT,
  version TEXT, method TEXT, weights_json TEXT, factors_json TEXT, positive_json TEXT,
  negative_json TEXT, unverified_json TEXT, missing_policy TEXT, evidence_coverage INTEGER,
  computed_at TEXT, computed_by TEXT, explanation TEXT, created_at TEXT);
CREATE TABLE ai_analysis (id TEXT PRIMARY KEY, vehicle_id TEXT, kind TEXT, analysis_type TEXT,
  anomaly_type TEXT, title TEXT, explanation TEXT, severity TEXT, method TEXT, engine TEXT,
  model_version TEXT, version TEXT, confidence REAL, result TEXT, readings_json TEXT,
  evidence_json TEXT, contributions_json TEXT, recommended_action TEXT, review_state TEXT,
  disclaimer TEXT, created_at TEXT);
CREATE TABLE background_jobs (id TEXT PRIMARY KEY, type TEXT, status TEXT, vehicle_id TEXT,
  subject_type TEXT, subject_id TEXT, priority INTEGER DEFAULT 5, payload TEXT, progress INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0, idempotency_key TEXT, max_attempts INTEGER DEFAULT 3,
  timeout_seconds INTEGER DEFAULT 120, result TEXT, last_error TEXT, error TEXT,
  finished_at TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE human_review_queue (id TEXT PRIMARY KEY, document_id TEXT, vehicle_id TEXT,
  reason TEXT, status TEXT, confidence REAL, kind TEXT, payload TEXT, reviewer TEXT, note TEXT,
  resolution TEXT, resolved_by TEXT, resolved_at TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE agent_investigations (id TEXT PRIMARY KEY, vehicle_id TEXT, question TEXT,
  status TEXT, version TEXT, result TEXT, thread_id TEXT, answer TEXT, citations_json TEXT,
  conflicts_json TEXT, missing_json TEXT, node_trace_json TEXT, graph_version TEXT,
  started_at TEXT, finished_at TEXT, created_at TEXT);
CREATE TABLE chain_records (id TEXT PRIMARY KEY, vehicle_id TEXT, broken INTEGER DEFAULT 0,
  hash TEXT, record_hash TEXT, seq INTEGER, created_at TEXT);
CREATE TABLE notifications (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, body TEXT,
  type TEXT, data TEXT DEFAULT '{}', read INTEGER DEFAULT 0, created_at TEXT);
CREATE TABLE audit_logs (id TEXT PRIMARY KEY, actor_id TEXT, action TEXT, entity_type TEXT,
  entity_id TEXT, before TEXT, after TEXT, details TEXT, ip TEXT, user_agent TEXT, at TEXT,
  created_at TEXT);
CREATE TABLE listings (id TEXT PRIMARY KEY, vehicle_id TEXT, status TEXT, headline TEXT,
  description TEXT, condition TEXT, location TEXT, views INTEGER DEFAULT 0, saves INTEGER DEFAULT 0,
  inquiries INTEGER DEFAULT 0, cover_image TEXT, published_at TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE inquiries (id TEXT PRIMARY KEY, listing_id TEXT, buyer_id TEXT, seller_id TEXT,
  buyer_name TEXT, initials TEXT, message TEXT, type TEXT, status TEXT, created_at TEXT,
  last_activity_at TEXT);
CREATE TABLE inquiry_messages (id TEXT PRIMARY KEY, inquiry_id TEXT, sender_id TEXT,
  sender_name TEXT, body TEXT, offer_amount INTEGER, scheduled_at TEXT, attachments TEXT DEFAULT '[]',
  created_at TEXT);
CREATE TABLE saved_vehicles (id TEXT PRIMARY KEY, buyer_id TEXT, listing_id TEXT,
  price_at_save INTEGER, list_name TEXT, created_at TEXT);
CREATE TABLE saved_searches (id TEXT PRIMARY KEY, buyer_id TEXT, name TEXT, filters TEXT,
  alerts_enabled INTEGER DEFAULT 0, created_at TEXT);
CREATE TABLE reports (id TEXT PRIMARY KEY, vehicle_id TEXT, requested_by TEXT, type TEXT,
  status TEXT, file_key TEXT, report_id TEXT, generated_at TEXT, created_at TEXT,
  pdf_hash TEXT, snapshot TEXT, version TEXT);
CREATE TABLE qr_tokens (jti TEXT PRIMARY KEY, vehicle_id TEXT, token TEXT, revoked_at TEXT,
  created_by TEXT, created_at TEXT);
CREATE TABLE pricing (vehicle_id TEXT PRIMARY KEY, low INTEGER, estimate INTEGER, high INTEGER,
  confidence REAL, comparables TEXT, method TEXT, computed_at TEXT);
CREATE TABLE listing_events (id TEXT PRIMARY KEY, listing_id TEXT, type TEXT, actor_id TEXT, at TEXT);
CREATE TABLE theft_checks (vehicle_id TEXT PRIMARY KEY, status TEXT, source TEXT,
  checked_at TEXT, details TEXT);
CREATE TABLE disputes (id TEXT PRIMARY KEY, finding_id TEXT, seller_id TEXT, explanation TEXT,
  evidence_doc_ids TEXT DEFAULT '[]', status TEXT, reviewed_by TEXT, review_note TEXT, created_at TEXT);
CREATE TABLE report_access (id TEXT PRIMARY KEY, report_id TEXT, token_hash TEXT,
  expires_at TEXT, created_at TEXT, used_at TEXT);
CREATE TABLE activity (user_id TEXT PRIMARY KEY, explored INTEGER DEFAULT 0, saved INTEGER DEFAULT 0,
  recently_viewed INTEGER DEFAULT 0, pending_reports INTEGER DEFAULT 0);
"""


def _seed(conn: sqlite3.Connection) -> None:
    now = "2026-01-01T00:00:00+00:00"
    users = [
        ("u-seller", "Samarth Darak", "seller", "seller@test.dev"),
        ("u-buyer", "Rohan Mehta", "buyer", "buyer@test.dev"),
        ("u-admin", "Admin", "admin", "admin@test.dev"),
    ]
    for uid, name, role, email in users:
        conn.execute(
            "INSERT INTO users(id,name,role,email,password_hash,initials,kyc_status,preferences,created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (uid, name, role, email, _hash("demo1234"), name[:2].upper(),
             "verified" if role != "buyer" else "not_started", "{}", now),
        )
    conn.execute(
        "INSERT INTO vehicles(id,owner_id,reg_no,vin,make,model,year,status,asking_price,km_claimed,"
        "fuel,transmission,location,trustdrive_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ("v-test", "u-seller", "MH01AB1234", "WBA8E9G50GNU12345", "BMW", "3 Series", 2019,
         "verified", 1800000, 72450, "petrol", "automatic", "Mumbai", "TD-TEST0001", now, now),
    )
    conn.execute(
        "INSERT INTO vehicles(id,owner_id,reg_no,vin,make,model,year,status,asking_price,km_claimed,"
        "fuel,transmission,location,trustdrive_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ("v-test2", "u-seller", "MH02CD5678", "1HGCM82633A004352", "Honda", "City", 2020,
         "verified", 900000, 40000, "petrol", "manual", "Pune", "TD-TEST0002", now, now),
    )
    readings = [
        ("m1", "v-test", 12000, "2019-01-15"),
        ("m2", "v-test", 28000, "2020-01-15"),
        ("m3", "v-test", 41000, "2021-01-15"),
        ("m4", "v-test", 58000, "2022-01-15"),
        ("m5", "v-test", 25000, "2023-01-15"),
    ]
    for i, r in enumerate(readings):
        conn.execute(
            "INSERT INTO mileage_readings (id,vehicle_id,km,date,flagged,verified,source) VALUES (?,?,?,?,?,?,?)",
            (*r, 1 if i == 4 else 0, 1, "service_invoice"),
        )
    conn.execute("INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                 ("doc1", "v-test", "verified", "a" * 64, "rc.pdf", None, "application/pdf", 1024,
                  "rc", 1, 1, None, "{}", now, now, None, None))
    conn.execute("INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                 ("doc2", "v-test", "pending", "a" * 64, "rc-copy.pdf", None, "application/pdf", 1024,
                  "rc", 1, 1, None, "{}", now, now, None, None))
    conn.execute("INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                 ("doc3", "v-test", "verified", "b" * 64, "insurance.pdf", None, "application/pdf", 1024,
                  "insurance", 1, 1, None, "{}", now, now, None, None))
    conn.execute(
        "INSERT INTO findings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ("f1", "v-test", "identity", "vin_mismatch", "VIN mismatch on insurance",
         "VIN differs from RC", "Request the original insurance", "open", "high",
         "vin_mismatch", "{}", 10, now),
    )
    # (the tuple above includes created_at as its 13th value)
    conn.execute("INSERT INTO history_events VALUES ('h1','v-test','service','2021-01-01',30000,'Service','','invoice','doc1','verified',NULL,'u-seller','2021-01-01')")
    conn.execute("INSERT INTO history_events VALUES ('h2','v-test','ownership','2020-01-01',NULL,'Transfer','','rc',NULL,'verified',NULL,'u-seller','2020-01-01')")
    conn.execute("INSERT INTO damage_records VALUES ('d1','v-test','front-bumper','Front Bumper','Scratch','medium','repaired',NULL,'2023-01-01','reported','[]',NULL,NULL,'u-seller',?)", (now,))
    conn.execute("INSERT INTO vehicle_inspections(id,vehicle_id,inspection_date,status,inspector_name,created_at,updated_at) VALUES ('i1','v-test','2023-02-01','approved','inspector-1',?,?)", (now, now))
    conn.execute("INSERT INTO verification_evidence VALUES ('e1','v-test','document','doc1','document_hash','RC','document:doc1','medium',NULL,'cccccccccccccccccccccccccccccccc','{}',0,NULL,?)", (now,))
    conn.execute("INSERT INTO chain_records VALUES ('c1','v-test',0,'d'*64,'dddddddddddddddddddddddddddddddd',1,?)", (now,))
    conn.execute("INSERT INTO chain_records VALUES ('c2','v-test',0,'e'*64,'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',2,?)", (now,))
    conn.execute("INSERT INTO accident_records(id,vehicle_id,event_date,severity,description,repair_status,created_at,updated_at) VALUES ('a1','v-test','2022-06-01','minor','Rear bumper','repaired',?,?)", (now, now))
    conn.execute("INSERT INTO listings(id,vehicle_id,status,headline,description,condition,location,views,saves,inquiries,created_at,updated_at) VALUES ('l-test','v-test','draft','BMW 3 Series','Clean sedan','used','Mumbai',10,2,1,?,?)", (now, now))
    conn.execute("INSERT INTO listings(id,vehicle_id,status,headline,description,condition,location,views,saves,inquiries,published_at,created_at,updated_at) VALUES ('l-test2','v-test2','draft','Honda City','Reliable','used','Pune',20,3,2,NULL,?,?)", (now, now))
    conn.execute("INSERT INTO activity VALUES ('u-buyer',5,1,2,0)")
    conn.commit()


_conn = sqlite3.connect(DB_FILE)
_conn.executescript(SCHEMA)
_seed(_conn)
_conn.close()

(TMP / "uploads").mkdir(parents=True, exist_ok=True)
