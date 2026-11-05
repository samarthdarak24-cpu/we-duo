// ---------------------------------------------------------------------------
// SQLite data layer (node:sqlite). Postgres/Prisma is the production target
// (§2.1); SQLite is the simpler runnable option here (§0.7) with the same
// relational shape. Schema v2 covers every entity in design.md §7.
// Idempotent: a schema-version bump recreates the demo database and re-seeds.
// Server-only (never import in client code).
// ---------------------------------------------------------------------------
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { hashPassword } from "./auth";
import { upgradeCoreForeignKeys } from "./schema-fk";
import { buildChain, recordHash } from "./chain";
import { signQrToken } from "./qr";
import { ensureUploadFromPublic } from "./files";
import { getComponentById, mapZoneToComponentId } from "@/lib/vehicle-registry";

export const SCHEMA_VERSION = 3;

export interface UserRow {
  id: string;
  name: string;
  role: string;
  email: string;
  password_hash: string;
  initials: string;
  phone: string;
  city: string;
  seller_type: string | null;
  business_name: string | null;
  kyc_status: string;
  preferences: string;
  avatar_url: string | null;
  email_verified: number;
  twofa_enabled: number;
  kyc_doc_key: string | null;
  last_login_at: string | null;
  created_at: string;
}

export interface VehicleRow {
  id: string;
  owner_id: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  reg_no: string;
  vin: string;
  fuel: string;
  transmission: string;
  category: string;
  color: string;
  ownership_count: number;
  location: string;
  km_claimed: number;
  last_verified_km: number;
  asking_price: number;
  status: string;
  base_value: number;
  condition_score: number;
  trustdrive_id: string;
  qr_token: string;
  description: string;
  condition: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentRow {
  id: string;
  vehicle_id: string;
  type: string;
  file_name: string;
  mime: string;
  size_bytes: number;
  status: string;
  status_reason: string | null;
  sha256: string;
  consent: number;
  version: number;
  supersedes_id: string | null;
  extracted: string;
  verified_at: string | null;
  uploaded_at: string;
  file_key: string | null;
}

export interface FindingRow {
  id: string;
  vehicle_id: string;
  rule_key: string;
  code: string;
  severity: string;
  title: string;
  explanation: string;
  recommendation: string;
  evidence: string;
  responsible_doc: string | null;
  points: number;
  status: string;
  created_at: string;
}

export interface MileageRow {
  id: string;
  vehicle_id: string;
  year: string;
  km: number;
  source: string;
  date: string;
  flagged: number;
  verified: number;
  is_seller_claim: number;
  document_id: string | null;
}

export interface PricingRow {
  vehicle_id: string;
  low: number;
  estimate: number;
  high: number;
  confidence: string;
  comparables: number;
  method: string;
  computed_at: string;
}

export interface ListingRow {
  id: string;
  vehicle_id: string;
  status: string;
  headline: string;
  description: string;
  condition: string;
  location: string;
  views: number;
  saves: number;
  inquiries: number;
  cover_image: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InquiryRow {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  buyer_name: string;
  initials: string;
  message: string;
  type: string;
  status: string;
  created_at: string;
  last_activity_at: string;
}

export interface MessageRow {
  id: string;
  inquiry_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  offer_amount: number | null;
  scheduled_at: string | null;
  attachments: string;
  created_at: string;
}

export interface HistoryRow {
  id: string;
  vehicle_id: string;
  category: string;
  event_date: string;
  mileage_km: number;
  title: string;
  description: string;
  source: string;
  evidence_document_id: string | null;
  status: string;
  supersedes_id: string | null;
  created_by: string;
  created_at: string;
}

export interface DamageRow {
  id: string;
  vehicle_id: string;
  zone_id: string;
  description: string;
  severity: string;
  repair_status: string;
  repair_details: string;
  inspection_date: string;
  status: string;
  photo_keys: string;
  repair_invoice_doc_id: string | null;
  supersedes_id: string | null;
  created_by: string;
  created_at: string;
  /** Canonical component ID from the 3D registry (added by schema v3.1). */
  component_id?: string | null;
  /** "Scratch", "Dent", … only when an inspector actually recorded one. */
  damage_type?: string | null;
  /** Asset-space position on the model, in metres. */
  local_x?: number | null;
  local_y?: number | null;
  local_z?: number | null;
  /** How the position was obtained — never implied. */
  position_source?: string | null;
}

export interface SavedRow {
  id: string;
  buyer_id: string;
  listing_id: string;
  price_at_save: number;
  list_name: string;
  created_at: string;
}

export interface SavedSearchRow {
  id: string;
  buyer_id: string;
  name: string;
  filters: string;
  alerts_enabled: number;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: string;
  read: number;
  created_at: string;
}

export interface ReportRow {
  id: string;
  vehicle_id: string;
  requested_by: string;
  type: string;
  status: string;
  file_key: string | null;
  report_id: string;
  generated_at: string | null;
  created_at: string;
  pdf_hash: string | null;
  snapshot: string;
  version: number;
}

export interface DisputeRow {
  id: string;
  finding_id: string;
  seller_id: string;
  explanation: string;
  evidence_doc_ids: string;
  status: string;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
}

export interface RunRow {
  id: string;
  vehicle_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  summary: string;
}

export interface AuditRow {
  id: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before: string;
  after: string;
  ip: string;
  user_agent: string;
  at: string;
}

export interface AuthTokenRow {
  id: string;
  user_id: string;
  type: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  refresh_hash: string;
  user_agent: string;
  ip: string;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

const g = globalThis as unknown as {
  __tdDb?: DatabaseSync;
  __tdFkReport?: unknown;
  __tdDamageBackfill?: number;
};

const TABLES = [
  "report_access", "auth_tokens", "sessions", "login_attempts",
  "chain_records", "audit_logs", "qr_tokens", "listing_events", "reports",
  "verification_results", "verification_runs", "disputes", "theft_checks",
  "damage_records", "history_events", "saved_searches", "saved_vehicles",
  "inquiry_messages", "inquiries", "listing_images", "listings", "pricing",
  "mileage_readings", "findings", "documents", "vehicles", "notifications",
  "activity", "users",
];

function migrate(conn: DatabaseSync) {
  const current = (conn.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (current === SCHEMA_VERSION) return;
  for (const t of TABLES) conn.exec(`DROP TABLE IF EXISTS ${t}`);
  conn.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE users(
    id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, initials TEXT NOT NULL, phone TEXT DEFAULT '', city TEXT DEFAULT '',
    seller_type TEXT, business_name TEXT, kyc_status TEXT DEFAULT 'not_started',
    preferences TEXT DEFAULT '{}', avatar_url TEXT, email_verified INTEGER DEFAULT 0,
    twofa_enabled INTEGER DEFAULT 0, kyc_doc_key TEXT, last_login_at TEXT, created_at TEXT NOT NULL);

  CREATE TABLE vehicles(
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, make TEXT, model TEXT, variant TEXT,
    year INTEGER, reg_no TEXT UNIQUE, vin TEXT UNIQUE, fuel TEXT, transmission TEXT,
    category TEXT, color TEXT, ownership_count INTEGER DEFAULT 1, location TEXT,
    km_claimed INTEGER DEFAULT 0, last_verified_km INTEGER DEFAULT 0, asking_price INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft', base_value INTEGER DEFAULT 0, condition_score REAL DEFAULT 0.7,
    trustdrive_id TEXT, qr_token TEXT, description TEXT DEFAULT '', condition TEXT DEFAULT 'Good',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

  CREATE TABLE documents(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, type TEXT NOT NULL, file_name TEXT NOT NULL,
    mime TEXT, size_bytes INTEGER, status TEXT NOT NULL, status_reason TEXT, sha256 TEXT NOT NULL,
    consent INTEGER DEFAULT 1, version INTEGER DEFAULT 1, supersedes_id TEXT, extracted TEXT DEFAULT '{}',
    verified_at TEXT, uploaded_at TEXT NOT NULL, file_key TEXT);

  CREATE TABLE findings(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, rule_key TEXT, code TEXT NOT NULL,
    severity TEXT NOT NULL, title TEXT, explanation TEXT, recommendation TEXT, evidence TEXT DEFAULT '{}',
    responsible_doc TEXT, points INTEGER DEFAULT 0, status TEXT DEFAULT 'open', created_at TEXT NOT NULL);

  CREATE TABLE mileage_readings(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, year TEXT, km INTEGER NOT NULL, source TEXT,
    date TEXT NOT NULL, flagged INTEGER DEFAULT 0, verified INTEGER DEFAULT 1,
    is_seller_claim INTEGER DEFAULT 0, document_id TEXT);

  CREATE TABLE pricing(
    vehicle_id TEXT PRIMARY KEY, low INTEGER, estimate INTEGER, high INTEGER, confidence TEXT,
    comparables INTEGER DEFAULT 0, method TEXT, computed_at TEXT);

  CREATE TABLE listings(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, status TEXT NOT NULL, headline TEXT,
    description TEXT DEFAULT '', condition TEXT, location TEXT, views INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0, inquiries INTEGER DEFAULT 0, cover_image TEXT, published_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

  CREATE TABLE listing_images(
    id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, file_key TEXT, position INTEGER, kind TEXT DEFAULT 'photo');

  CREATE TABLE inquiries(
    id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, buyer_id TEXT NOT NULL, seller_id TEXT NOT NULL,
    buyer_name TEXT, initials TEXT, message TEXT, type TEXT, status TEXT DEFAULT 'open',
    created_at TEXT NOT NULL, last_activity_at TEXT NOT NULL);

  CREATE TABLE inquiry_messages(
    id TEXT PRIMARY KEY, inquiry_id TEXT NOT NULL, sender_id TEXT NOT NULL, sender_name TEXT,
    body TEXT NOT NULL, offer_amount INTEGER, scheduled_at TEXT, attachments TEXT DEFAULT '[]',
    created_at TEXT NOT NULL);

  CREATE TABLE saved_vehicles(
    id TEXT PRIMARY KEY, buyer_id TEXT NOT NULL, listing_id TEXT NOT NULL,
    price_at_save INTEGER, list_name TEXT DEFAULT 'All', created_at TEXT NOT NULL,
    UNIQUE(buyer_id, listing_id));

  CREATE TABLE saved_searches(
    id TEXT PRIMARY KEY, buyer_id TEXT NOT NULL, name TEXT, filters TEXT, alerts_enabled INTEGER DEFAULT 1,
    created_at TEXT NOT NULL);

  CREATE TABLE notifications(
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT, title TEXT, body TEXT DEFAULT '',
    data TEXT DEFAULT '{}', read INTEGER DEFAULT 0, created_at TEXT NOT NULL);

  CREATE TABLE activity(
    user_id TEXT PRIMARY KEY, explored INTEGER DEFAULT 0, saved INTEGER DEFAULT 0,
    recently_viewed INTEGER DEFAULT 0, pending_reports INTEGER DEFAULT 0);

  CREATE TABLE history_events(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, category TEXT, event_date TEXT, mileage_km INTEGER,
    title TEXT, description TEXT, source TEXT, evidence_document_id TEXT, status TEXT,
    supersedes_id TEXT, created_by TEXT, created_at TEXT NOT NULL);

  CREATE TABLE damage_records(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, zone_id TEXT, description TEXT, severity TEXT,
    repair_status TEXT, repair_details TEXT, inspection_date TEXT, status TEXT,
    photo_keys TEXT DEFAULT '[]', repair_invoice_doc_id TEXT, supersedes_id TEXT,
    created_by TEXT, created_at TEXT NOT NULL);

  CREATE TABLE chain_records(
    vehicle_id TEXT, seq INTEGER, entity_type TEXT, entity_id TEXT, payload TEXT,
    prev_hash TEXT, record_hash TEXT, created_at TEXT, PRIMARY KEY(vehicle_id, seq));

  CREATE TABLE verification_runs(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, status TEXT, started_at TEXT,
    finished_at TEXT, summary TEXT DEFAULT '{}');

  CREATE TABLE verification_results(
    id TEXT PRIMARY KEY, run_id TEXT NOT NULL, vehicle_id TEXT NOT NULL, check_key TEXT,
    status TEXT, details TEXT, evidence_ids TEXT DEFAULT '[]');

  CREATE TABLE reports(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, requested_by TEXT NOT NULL, type TEXT,
    status TEXT, file_key TEXT, report_id TEXT, generated_at TEXT, created_at TEXT NOT NULL,
    pdf_hash TEXT, snapshot TEXT DEFAULT '{}', version INTEGER DEFAULT 1);

  CREATE TABLE auth_tokens(
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL);

  CREATE TABLE sessions(
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, refresh_hash TEXT NOT NULL, user_agent TEXT DEFAULT '',
    ip TEXT DEFAULT '', created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, revoked_at TEXT);

  CREATE TABLE login_attempts(
    key TEXT PRIMARY KEY, attempts INTEGER DEFAULT 0, locked_until TEXT, updated_at TEXT NOT NULL);

  CREATE TABLE report_access(
    id TEXT PRIMARY KEY, report_id TEXT NOT NULL, token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL, created_at TEXT NOT NULL, used_at TEXT);

  CREATE TABLE theft_checks(
    vehicle_id TEXT PRIMARY KEY, status TEXT, source TEXT, checked_at TEXT, details TEXT);

  CREATE TABLE qr_tokens(
    jti TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, token TEXT NOT NULL, revoked_at TEXT,
    created_by TEXT, created_at TEXT NOT NULL);

  CREATE TABLE disputes(
    id TEXT PRIMARY KEY, finding_id TEXT NOT NULL, seller_id TEXT NOT NULL, explanation TEXT,
    evidence_doc_ids TEXT DEFAULT '[]', status TEXT DEFAULT 'pending', reviewed_by TEXT,
    review_note TEXT, created_at TEXT NOT NULL);

  CREATE TABLE audit_logs(
    id TEXT PRIMARY KEY, actor_id TEXT, action TEXT, entity_type TEXT, entity_id TEXT,
    before TEXT DEFAULT '{}', after TEXT DEFAULT '{}', ip TEXT, user_agent TEXT, at TEXT NOT NULL);

  CREATE TABLE listing_events(
    id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, type TEXT, actor_id TEXT, at TEXT NOT NULL);

  CREATE INDEX idx_vehicles_owner ON vehicles(owner_id, status);
  CREATE INDEX idx_vehicles_reg ON vehicles(reg_no);
  CREATE INDEX idx_vehicles_vin ON vehicles(vin);
  CREATE INDEX idx_docs_vehicle ON documents(vehicle_id, type, status);
  CREATE INDEX idx_findings_vehicle ON findings(vehicle_id, status, severity);
  CREATE INDEX idx_mileage_vehicle ON mileage_readings(vehicle_id, date);
  CREATE INDEX idx_history_vehicle ON history_events(vehicle_id, event_date);
  CREATE INDEX idx_listings_status ON listings(status);
  CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at);
  CREATE INDEX idx_inquiries_seller ON inquiries(seller_id, status, last_activity_at);
  CREATE INDEX idx_inquiries_buyer ON inquiries(buyer_id, status, last_activity_at);
  CREATE INDEX idx_auth_tokens_hash ON auth_tokens(token_hash);
  CREATE INDEX idx_sessions_user ON sessions(user_id, revoked_at);
  CREATE INDEX idx_report_access_hash ON report_access(token_hash);

  -- Immutability: the hash chain is append-only.
  CREATE TRIGGER chain_no_update BEFORE UPDATE ON chain_records
  BEGIN SELECT RAISE(ABORT, 'chain_records are immutable'); END;
  CREATE TRIGGER chain_no_delete BEFORE DELETE ON chain_records
  BEGIN SELECT RAISE(ABORT, 'chain_records are immutable'); END;

  -- Verified evidence is append-only: corrections supersede, never mutate.
  CREATE TRIGGER documents_verified_immutable BEFORE UPDATE OF sha256, vehicle_id, type ON documents
  WHEN OLD.status = 'verified'
  BEGIN SELECT RAISE(ABORT, 'verified document identity is immutable — upload a new version'); END;
  CREATE TRIGGER documents_verified_no_delete BEFORE DELETE ON documents
  WHEN OLD.status = 'verified'
  BEGIN SELECT RAISE(ABORT, 'verified documents cannot be deleted'); END;

  CREATE TRIGGER history_verified_immutable BEFORE UPDATE OF vehicle_id, category, event_date, mileage_km, evidence_document_id ON history_events
  WHEN OLD.status = 'verified'
  BEGIN SELECT RAISE(ABORT, 'verified history events are immutable — supersede instead'); END;
  CREATE TRIGGER history_verified_no_delete BEFORE DELETE ON history_events
  WHEN OLD.status = 'verified'
  BEGIN SELECT RAISE(ABORT, 'verified history events cannot be deleted'); END;

  CREATE TRIGGER damage_verified_no_delete BEFORE DELETE ON damage_records
  WHEN OLD.status = 'verified'
  BEGIN SELECT RAISE(ABORT, 'verified damage records cannot be deleted'); END;
  `);
}

/**
 * Additive public-site tables. Kept outside the versioned drop/recreate path so
 * existing demo data survives upgrades.
 */
function ensurePublicTables(conn: DatabaseSync) {
  conn.exec(`
  CREATE TABLE IF NOT EXISTS contact_messages(
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT DEFAULT '',
    subject TEXT DEFAULT 'General Inquiry', message TEXT NOT NULL, ip TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS newsletter_subscribers(
    email TEXT PRIMARY KEY, created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_contact_created ON contact_messages(created_at);
  `);
}

// ---------------------------------------------------------------------------
// Intelligence + profile entities (checklist §6 / Phase 4).
// Additive DDL only: nothing here drops or rewrites a populated table, so
// verified history is never overwritten by a schema change.
// ---------------------------------------------------------------------------
function ensureIntelligenceTables(conn: DatabaseSync) {
  conn.exec(`
  CREATE TABLE IF NOT EXISTS seller_profiles(
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT, business_name TEXT, seller_type TEXT DEFAULT 'individual',
    gstin TEXT, aadsha_masked TEXT, pan TEXT, address_line TEXT, city TEXT, state TEXT, pincode TEXT,
    phone TEXT, verified_dealer INTEGER DEFAULT 0, trust_badge TEXT DEFAULT 'none',
    rating REAL DEFAULT 0, total_sales INTEGER DEFAULT 0, avg_response_hours REAL,
    bio TEXT, joined_at TEXT, updated_at TEXT NOT NULL, deleted_at TEXT);

  CREATE TABLE IF NOT EXISTS buyer_profiles(
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT, city TEXT, state TEXT, phone TEXT,
    budget_min INTEGER, budget_max INTEGER, preferred_makes TEXT DEFAULT '[]',
    preferred_fuel TEXT, notification_prefs TEXT DEFAULT '{}',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);

  CREATE TABLE IF NOT EXISTS vehicle_images(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    file_key TEXT NOT NULL, kind TEXT DEFAULT 'photo', caption TEXT DEFAULT '', position INTEGER DEFAULT 0,
    sha256 TEXT, bytes INTEGER, mime TEXT, taken_at TEXT, uploaded_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL, deleted_at TEXT);

  CREATE TABLE IF NOT EXISTS accident_records(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    event_date TEXT NOT NULL, severity TEXT NOT NULL CHECK (severity IN ('minor','moderate','severe','structural','unknown')),
    description TEXT NOT NULL, police_fir TEXT, damage_zones TEXT DEFAULT '[]', impact_zone TEXT,
    airbag_deployed INTEGER, repair_status TEXT NOT NULL DEFAULT 'unknown'
      CHECK (repair_status IN ('unknown','inspected','repaired','replaced','ongoing','not_repaired')),
    estimated_cost INTEGER, repair_invoice_doc_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
    source_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
    source TEXT DEFAULT 'seller_reported', verified INTEGER DEFAULT 0, verified_at TEXT,
    supersedes_id TEXT, created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);

  CREATE TABLE IF NOT EXISTS vehicle_inspections(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    inspector_id TEXT REFERENCES users(id) ON DELETE SET NULL, inspector_name TEXT,
    inspection_type TEXT NOT NULL DEFAULT 'pre_purchase',
    inspection_date TEXT NOT NULL, odometer_km INTEGER,
    structural_damage INTEGER CHECK (structural_damage IN (0,1)),
    passed INTEGER CHECK (passed IN (0,1)), score REAL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','superseded')),
    summary TEXT DEFAULT '', findings_json TEXT DEFAULT '[]', evidence_json TEXT DEFAULT '[]',
    report_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
    reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT, review_note TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);

  CREATE TABLE IF NOT EXISTS verification_evidence(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    run_id TEXT, result_id TEXT, finding_id TEXT REFERENCES findings(id) ON DELETE SET NULL,
    document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
    inspection_id TEXT REFERENCES vehicle_inspections(id) ON DELETE SET NULL,
    accident_id TEXT REFERENCES accident_records(id) ON DELETE SET NULL,
    kind TEXT NOT NULL, label TEXT NOT NULL, source TEXT NOT NULL,
    reliability TEXT NOT NULL DEFAULT 'unknown'
      CHECK (reliability IN ('high','medium','low','self_reported','unknown')),
    excerpt TEXT DEFAULT '', payload TEXT DEFAULT '{}', sha256 TEXT, disclosed_to_buyer INTEGER DEFAULT 0,
    created_at TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS ai_analysis(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    run_id TEXT, session_id TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('odometer','document','damage','conflict','agent','market','inspection')),
    anomaly_type TEXT, title TEXT NOT NULL, explanation TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info'
      CHECK (severity IN ('info','low','medium','high','critical')),
    method TEXT NOT NULL, model_version TEXT NOT NULL,
    confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    readings_json TEXT DEFAULT '[]', evidence_json TEXT DEFAULT '[]', features_json TEXT DEFAULT '{}',
    contributions_json TEXT DEFAULT '[]', recommended_action TEXT,
    review_state TEXT NOT NULL DEFAULT 'auto'
      CHECK (review_state IN ('auto','pending_review','confirmed','dismissed','corrected')),
    reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT, review_note TEXT,
    disclaimer TEXT DEFAULT 'Deterministic analysis of stored records. Not proof of fraud.',
    created_at TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS trust_scores(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
    band TEXT NOT NULL, version TEXT NOT NULL, method TEXT NOT NULL,
    weights_json TEXT NOT NULL, factors_json TEXT NOT NULL,
    positive_json TEXT DEFAULT '[]', negative_json DEFAULT '[]', unverified_json DEFAULT '[]',
    missing_policy TEXT NOT NULL, evidence_coverage INTEGER DEFAULT 0,
    computed_at TEXT NOT NULL, computed_by TEXT REFERENCES users(id));

  CREATE TABLE IF NOT EXISTS background_jobs(
    id TEXT PRIMARY KEY, type TEXT NOT NULL, subject_type TEXT, subject_id TEXT,
    status TEXT NOT NULL DEFAULT 'queued'
      CHECK (status IN ('queued','running','succeeded','failed','dead','cancelled')),
    priority INTEGER NOT NULL DEFAULT 5, attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3, timeout_ms INTEGER NOT NULL DEFAULT 60000,
    idempotency_key TEXT UNIQUE, payload TEXT NOT NULL DEFAULT '{}', result TEXT, error TEXT,
    progress INTEGER NOT NULL DEFAULT 0, progress_label TEXT,
    run_after TEXT, locked_by TEXT, locked_at TEXT, started_at TEXT, finished_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS agent_investigations(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    question TEXT NOT NULL, actor_id TEXT REFERENCES users(id),
    thread_id TEXT, status TEXT NOT NULL DEFAULT 'running'
      CHECK (status IN ('running','awaiting_review','completed','failed')),
    answer TEXT, citations_json TEXT DEFAULT '[]', conflicts_json TEXT DEFAULT '[]',
    missing_json TEXT DEFAULT '[]', node_trace_json TEXT DEFAULT '[]',
    tokens_json TEXT DEFAULT '{}', graph_version TEXT NOT NULL,
    started_at TEXT NOT NULL, finished_at TEXT);

  CREATE TABLE IF NOT EXISTS human_review_queue(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    analysis_id TEXT REFERENCES ai_analysis(id) ON DELETE SET NULL,
    document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
    inspection_id TEXT REFERENCES vehicle_inspections(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('low_confidence_ocr','conflicting_documents','suspicious_fraud','damage_validation','manual_correction')),
    reason TEXT NOT NULL, payload TEXT DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','resolved','rejected')),
    assigned_to TEXT REFERENCES users(id), resolved_by TEXT REFERENCES users(id),
    resolution TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, resolved_at TEXT);

  CREATE INDEX IF NOT EXISTS idx_seller_profiles_city ON seller_profiles(city, seller_type);
  CREATE INDEX IF NOT EXISTS idx_vimages_vehicle ON vehicle_images(vehicle_id, position);
  CREATE INDEX IF NOT EXISTS idx_accident_vehicle ON accident_records(vehicle_id, event_date);
  CREATE INDEX IF NOT EXISTS idx_accident_severity ON accident_records(severity, repair_status);
  CREATE INDEX IF NOT EXISTS idx_inspections_vehicle ON vehicle_inspections(vehicle_id, inspection_date);
  CREATE INDEX IF NOT EXISTS idx_inspections_status ON vehicle_inspections(status, inspector_id);
  CREATE INDEX IF NOT EXISTS idx_evidence_vehicle ON verification_evidence(vehicle_id, kind);
  CREATE INDEX IF NOT EXISTS idx_evidence_result ON verification_evidence(result_id);
  CREATE INDEX IF NOT EXISTS idx_ai_vehicle ON ai_analysis(vehicle_id, kind, created_at);
  CREATE INDEX IF NOT EXISTS idx_ai_review ON ai_analysis(review_state, severity);
  CREATE INDEX IF NOT EXISTS idx_trust_vehicle ON trust_scores(vehicle_id, computed_at);
  CREATE INDEX IF NOT EXISTS idx_jobs_claim ON background_jobs(status, priority, run_after);
  CREATE INDEX IF NOT EXISTS idx_invest_vehicle ON agent_investigations(vehicle_id, started_at);
  CREATE INDEX IF NOT EXISTS idx_review_status ON human_review_queue(status, kind);

  -- Append-only evidence and score history: a recompute adds a row, it never
  -- rewrites what a buyer was previously shown (checklist: no overwritten history).
  CREATE TRIGGER IF NOT EXISTS trg_trust_scores_immutable
    BEFORE UPDATE ON trust_scores BEGIN
      SELECT RAISE(ABORT, 'trust_scores is append-only');
    END;
  CREATE TRIGGER IF NOT EXISTS trg_trust_scores_nodelete
    BEFORE DELETE ON trust_scores BEGIN
      SELECT RAISE(ABORT, 'trust_scores is append-only');
    END;
  CREATE TRIGGER IF NOT EXISTS trg_evidence_immutable
    BEFORE UPDATE ON verification_evidence BEGIN
      SELECT RAISE(ABORT, 'verification_evidence is append-only');
    END;
  CREATE TRIGGER IF NOT EXISTS trg_ai_analysis_nodelete
    BEFORE DELETE ON ai_analysis BEGIN
      SELECT RAISE(ABORT, 'ai_analysis rows are retained for audit');
    END;
  `);
}

// ---- Canonical entity names -----------------------------------------------
// The architecture brief names four entities differently from the tables that
// grew organically. Rather than rename live tables (which would break every
// query and every row reference), the canonical names are exposed as views over
// the same rows, so `vehicle_documents`, `vehicle_listings`, `vehicle_history`,
// `mileage_records` and `blockchain_records` are real, queryable relations.
const ENTITY_ALIASES: [string, string][] = [
  ["vehicle_documents", "documents"],
  ["vehicle_listings", "listings"],
  ["vehicle_history", "history_events"],
  ["mileage_records", "mileage_readings"],
  ["blockchain_records", "chain_records"],
];

function ensureEntityAliases(conn: DatabaseSync) {
  for (const [view, table] of ENTITY_ALIASES) {
    conn.exec(`CREATE VIEW IF NOT EXISTS ${view} AS SELECT * FROM ${table};`);
  }
}

// ---- Seed -----------------------------------------------------------------
function iso(daysAgo: number, hour = 10) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}
function hashOf(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function seed(conn: DatabaseSync) {
  const count = conn.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
  if (count.c > 0) return;

  // Production must never receive the published demo accounts. Set
  // TD_SEED_DEMO=0 and provide ADMIN_EMAIL/ADMIN_PASSWORD to bootstrap one admin.
  if (process.env.TD_SEED_DEMO === "0") {
    const email = process.env.ADMIN_EMAIL?.trim();
    const password = process.env.ADMIN_PASSWORD;
    if (email && password && password.length >= 8) {
      conn.prepare(
        "INSERT INTO users(id,name,role,email,password_hash,initials,phone,city,seller_type,business_name,kyc_status,preferences,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
      ).run(
        "u-admin", "TrustDrive Admin", "admin", email, hashPassword(password),
        "TA", "", "", null, null, "verified", "{}", new Date().toISOString()
      );
    }
    return;
  }

  const pw = hashPassword("demo1234");
  const users: [string, string, string, string, string, string, string, string, string | null, string | null, string, string, string | null, number, number, string | null, string | null, string][] = [
    ["u-buyer", "Aditya Darak", "buyer", "aditya@trustdrive.dev", pw, "AD", "+91 98200 11001", "Mumbai", null, null, "verified", JSON.stringify({ email: true, sms: false, push: true, language: "en" }), null, 1, 0, null, iso(1), iso(180)],
    ["u-seller", "Samarth Darak", "seller", "samarth@trustdrive.dev", pw, "SD", "+91 98200 22002", "Mumbai", "individual", "Darak Motors", "verified", JSON.stringify({ email: true, sms: true, push: true, language: "en", defaultConsent: true }), null, 1, 0, null, iso(0, 8), iso(240)],
    ["u-admin", "TrustDrive Admin", "admin", "admin@trustdrive.dev", pw, "TA", "+91 98200 33003", "Pune", null, null, "verified", "{}", null, 1, 0, null, iso(1), iso(300)],
    ["u-buyer2", "Rohan Mehta", "buyer", "rohan@trustdrive.dev", pw, "RM", "+91 98200 44004", "Pune", null, null, "verified", "{}", null, 1, 0, null, iso(2), iso(120)],
    ["u-buyer3", "Priya Sharma", "buyer", "priya@trustdrive.dev", pw, "PS", "+91 98200 55005", "Nanded", null, null, "verified", "{}", null, 1, 0, null, iso(3), iso(110)],
    ["u-buyer4", "Arjun Nair", "buyer", "arjun@trustdrive.dev", pw, "AN", "+91 98200 66006", "Hyderabad", null, null, "verified", "{}", null, 1, 0, null, iso(4), iso(90)],
    ["u-seller2", "WeDuo Motors", "seller", "weduo@trustdrive.dev", pw, "WM", "+91 98200 77007", "Pune", "dealer", "WeDuo Motors Pvt Ltd", "verified", "{}", null, 1, 0, null, iso(1), iso(200)],
  ];
  const iu = conn.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  users.forEach((u) => iu.run(...u));

  type V = [string, string, string, string, string, number, string, string, string, string, string, string, number, string, number, number, number, string, number, number, string, string, string, string, string, string];
  const vehicles: V[] = [
    ["v-bmw", "u-seller", "BMW", "3 Series", "330i", 2021, "MH01AB1234", "WBA5R1C50KAK12345", "Petrol", "Automatic", "Sedan", "Silver", 1, "Mumbai", 42000, 42000, 2600000, "published", 3400000, 0.85, "TD-8F3K2M9Q", "qr-bmw", "Single-owner 330i with a full authorised service history and all records verified.", "Excellent", iso(150), iso(2)],
    ["v-seller", "u-seller", "BMW", "3 Series", "320d", 2015, "MH01XY4321", "WBA8E9G50GNT12345", "Diesel", "Automatic", "Sedan", "Grey", 2, "Mumbai", 72450, 58000, 580000, "published", 800000, 0.7, "TD-7H2P4R1S", "qr-seller", "Well-maintained 320d. One document and a mileage reading need attention.", "Good", iso(210), iso(1)],
    ["v-camry", "u-seller", "Toyota", "Camry", "Hybrid", 2021, "MH12CD8899", "1HGCM82633A004352", "Hybrid", "Automatic", "Sedan", "White", 2, "Pune", 51200, 86400, 2150000, "published", 2800000, 0.75, "TD-3C5D7E9F", "qr-camry", "Camry hybrid with a flagged odometer history. Investigate before purchase.", "Fair", iso(180), iso(3)],
    ["v-tata", "u-seller", "Tata", "Nexon", "XZ+", 2020, "MH20EF1122", "MAT625289NPD12345", "Diesel", "Manual", "SUV", "Blue", 1, "Nanded", 32000, 18000, 850000, "draft", 1100000, 0.65, "TD-9A1B3C5D", "qr-tata", "Nexon with limited evidence — several documents are still missing.", "Good", iso(60), iso(5)],
    ["v-audi", "u-seller2", "Audi", "A4", "40 TFSI", 2020, "MH02CD5678", "WAUZZZ8V7KA123456", "Petrol", "Automatic", "Sedan", "White", 1, "Pune", 58000, 58000, 2250000, "published", 2900000, 0.8, "TD-2E4F6G8H", "qr-audi", "A4 40 TFSI with verified service records and a clean accident check.", "Very good", iso(140), iso(4)],
    ["v-merc", "u-seller2", "Mercedes-Benz", "C-Class", "C200", 2022, "MH03EF9012", "WDD2050422F123456", "Petrol", "Automatic", "Sedan", "Black", 1, "Mumbai", 31000, 31000, 3400000, "published", 3900000, 0.9, "TD-5J7K9L1M", "qr-merc", "Low-mileage C200 with a complete document set.", "Excellent", iso(120), iso(6)],
    ["v-hyundai", "u-seller2", "Hyundai", "Creta", "SX(O)", 2021, "MH14GH3456", "MALC381CLMM123456", "Petrol", "Automatic", "SUV", "Red", 1, "Nagpur", 36000, 36000, 1450000, "published", 1800000, 0.82, "TD-6N8P2Q4R", "qr-hyundai", "Creta SX(O) with verified records and no open findings.", "Very good", iso(100), iso(7)],
    ["v-toyota", "u-seller2", "Toyota", "Fortuner", "4x2 AT", 2019, "MH15IJ7890", "MBJ11JV2009123456", "Diesel", "Automatic", "SUV", "White", 2, "Hyderabad", 88000, 88000, 2750000, "published", 3400000, 0.72, "TD-4S6T8U1V", "qr-toyota", "Fortuner with complete service history; insurance renewal required.", "Good", iso(160), iso(8)],
    ["v-honda", "u-seller", "Honda", "City", "ZX CVT", 2020, "MH04KL2345", "MAKGM6649LN123456", "Petrol", "Automatic", "Sedan", "Silver", 1, "Mumbai", 47000, 47000, 1050000, "published", 1350000, 0.78, "TD-1W3X5Y7Z", "qr-honda", "City ZX with a clean, verified record set.", "Very good", iso(95), iso(9)],
    ["v-ducati", "u-seller2", "Ducati", "Panigale V4", "Standard", 2022, "MH01EK7777", "ZDM13BEW9NB012345", "Petrol", "Manual", "Superbike", "Ducati Red", 1, "Mumbai", 12000, 12000, 1850000, "published", 2200000, 0.88, "TD-7D8E9F1A", "qr-ducati", "Meticulously maintained Panigale V4 with full Desmo service history.", "Excellent", iso(80), iso(1)],
    ["v-royalenfield", "u-seller", "Royal Enfield", "Continental GT 650", "Custom", 2021, "MH12BK9900", "ME3GT6501MA012345", "Petrol", "Manual", "Motorcycle", "Chrome / Black", 1, "Pune", 16500, 16500, 320000, "published", 380000, 0.92, "TD-5R6E7N8F", "qr-re", "Single-owner Continental GT 650 with authentic service logs and clean chain.", "Excellent", iso(75), iso(2)],
    ["v-kawasaki", "u-seller2", "Kawasaki", "Ninja ZX-10R", "ABS", 2020, "MH02CZ4455", "JKAZX1000KA012345", "Petrol", "Manual", "Superbike", "Lime Green", 2, "Mumbai", 14000, 14000, 1420000, "published", 1650000, 0.84, "TD-9K1N2Z3X", "qr-ninja", "Verified track-ready Ninja ZX-10R with clear title and zero drop damage.", "Very good", iso(110), iso(3)],
    ["v-bmw-bike", "u-seller", "BMW Motorrad", "R 1250 GS", "Triple Black", 2021, "MH14DZ1100", "WB10J9102M123456", "Petrol", "Manual", "Adventure Bike", "Triple Black", 1, "Pune", 22000, 22000, 2050000, "published", 2300000, 0.94, "TD-3B4M5W6B", "qr-gs", "Touring flagship R 1250 GS with full pannier kit and complete BMW Motorrad logs.", "Excellent", iso(60), iso(4)],
  ];
  const iv = conn.prepare("INSERT INTO vehicles VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  vehicles.forEach((v) => iv.run(...v));

  const docTypes = ["rc", "insurance", "puc", "service", "ownership", "inspection"];
  const docStatus: Record<string, Record<string, [string, string | null]>> = {
    "v-bmw": {},
    "v-seller": { insurance: ["pending", "Renewal uploaded, verification queued"], rc: ["verified", null] },
    "v-camry": {},
    "v-tata": {
      rc: ["pending", "Low legibility — please re-upload a clearer copy"],
      insurance: ["pending", null],
      puc: ["unavailable", "No PUC record found"],
      ownership: ["pending", null],
      inspection: ["unavailable", null],
    },
    "v-audi": {},
    "v-merc": {},
    "v-hyundai": {},
    "v-toyota": { insurance: ["verified", null] },
    "v-honda": {},
  };
  const extracted: Record<string, Record<string, string>> = {
    rc: { registrationNo: "MH01AB1234", vin: "WBA5R1C50KAK12345", owner: "S***h D***k", validFrom: "2021-03-15" },
    insurance: { policyNo: "POL-2024-88213", insurer: "ICICI Lombard", validTo: "2026-03-31", idv: "2400000" },
    puc: { certificateNo: "PUC-2025-1192", validTo: "2026-05-30", co: "0.21" },
    service: { invoiceNo: "SVC-2023-5521", workshop: "Navnit Motors", odometerKm: "33000", amount: "18450" },
    ownership: { owners: "2", lastTransfer: "2022-08-01" },
    inspection: { inspector: "AutoAssure", date: "2023-06-01", odometerKm: "42000", result: "Passed" },
  };
  const idoc = conn.prepare("INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (const v of vehicles) {
    const vid = v[0];
    docTypes.forEach((t, idx) => {
      const [status, reason] = docStatus[vid]?.[t] ?? ["verified", null];
      const sha = hashOf(`${vid}:${t}:v1`);
      idoc.run(
        `${vid}-${t}`, vid, t, `${vid}-${t}.pdf`, "application/pdf", 240000 + idx * 12000,
        status, reason, sha, vid === "v-tata" ? 0 : 1, 1, null,
        JSON.stringify({ ...(extracted[t] ?? {}), registrationNo: v[6], vin: v[7] }),
        status === "verified" ? iso(20) : null, iso(30 - idx), null
      );
    });
  }
  // A duplicate invoice scenario (same hash across two vehicles).
  const dupSha = hashOf("duplicate-invoice-INV-778812");
  idoc.run("v-audi-service-dup", "v-audi", "service", "invoice-INV-778812.pdf", "application/pdf", 180000, "verified", null, dupSha, 1, 1, null, JSON.stringify({ invoiceNo: "INV-778812", workshop: "Pune Motors", odometerKm: "54000" }), iso(40), iso(40), null);
  idoc.run("v-merc-service-dup", "v-merc", "service", "invoice-INV-778812.pdf", "application/pdf", 180000, "suspicious", "Same invoice number and file hash as another vehicle", dupSha, 1, 1, null, JSON.stringify({ invoiceNo: "INV-778812", workshop: "Pune Motors", odometerKm: "28000" }), null, iso(40), null);

  const findings: [string, string, string, string, string, string, string, string, string, number, string, string][] = [
    ["f-bmw", "v-bmw", "INSURANCE_RENEWAL_DUE", "INSURANCE_RENEWAL_DUE", "low", "Insurance renewal due", "The policy expires within 30 days. Renew to keep documents current.", "Renew the policy before it lapses.", JSON.stringify({ validTo: "2026-03-31" }), 8, "open", iso(3)],
    ["f-s1", "v-seller", "VIN_MISMATCH", "DOCUMENT_MISMATCH", "high", "VIN on RC does not match vehicle VIN", "The VIN printed on the RC (WBA8E9G50GNT12344) differs from the vehicle VIN on record (WBA8E9G50GNT12345). Needs investigation.", "Upload a corrected RC or provide an RTO correction receipt.", JSON.stringify({ rcVin: "WBA8E9G50GNT12344", vehicleVin: "WBA8E9G50GNT12345" }), 25, "explained", iso(2)],
    ["f-s2", "v-seller", "MILEAGE_INCONSISTENCY", "MILEAGE_INCONSISTENCY", "medium", "Mileage inconsistency detected", "The 2023 reading of 72,450 km is flagged for review against prior service records.", "Upload the 2023 service invoice showing the odometer.", JSON.stringify({ readingKm: 72450, priorKm: 58000, date: "2023-12-20" }), 12, "open", iso(2)],
    ["f-s3", "v-seller", "INSURANCE_EXPIRED", "INSURANCE_EXPIRED", "low", "Insurance expired", "Insurance validity lapsed on 2025-12-31. Upload a renewed policy.", "Upload the renewed insurance policy.", JSON.stringify({ validTo: "2025-12-31" }), 8, "open", iso(2)],
    ["f-c1", "v-camry", "ODOMETER_ROLLBACK", "ODOMETER_ROLLBACK", "critical", "Odometer rollback detected", "Reading fell from 86,400 km (2023-12-31) to 51,200 km (2024-06-30) — a drop of 35,200 km.", "Provide a service invoice or cluster-replacement receipt that explains the change.", JSON.stringify({ fromKm: 86400, toKm: 51200, fromDate: "2023-12-31", toDate: "2024-06-30" }), 40, "open", iso(1)],
    ["f-c2", "v-camry", "MILEAGE_JUMP", "MILEAGE_JUMP", "medium", "Suspicious mileage jump", "+28,400 km in 365 days (78 km/day) is above the vehicle's median rate.", "Upload service records covering 2022–2023.", JSON.stringify({ deltaKm: 28400, days: 365 }), 8, "open", iso(1)],
    ["f-c3", "v-camry", "DOC_MANIPULATION_SUSPECTED", "DOC_MANIPULATION_SUSPECTED", "medium", "Possible document metadata inconsistency", "A service invoice PDF was modified after its creation date. This may indicate editing — not proof of fraud.", "Upload the original invoice from the workshop.", JSON.stringify({ created: "2023-12-02", modified: "2024-02-11", producer: "PDF Editor" }), 10, "open", iso(1)],
    ["f-t1", "v-tata", "VIN_MISMATCH", "VIN_MISMATCH", "high", "VIN does not match across documents", "The VIN on the uploaded insurance policy differs from the vehicle record.", "Upload matching RC and insurance documents.", JSON.stringify({ policyVin: "MAT625289NPD99999", vehicleVin: "MAT625289NPD12345" }), 30, "open", iso(1)],
    ["f-t2", "v-tata", "MISSING_RC", "MISSING_RC", "high", "Registration Certificate missing", "No verified RC is available for this vehicle.", "Upload a clear copy of the RC.", JSON.stringify({ missing: "rc" }), 15, "open", iso(1)],
    ["f-a1", "v-audi", "MILEAGE_PLAUSIBILITY", "MILEAGE_PLAUSIBILITY", "low", "Mileage plausibility note", "Average annual distance is slightly above the typical range for this segment.", "No action required — informational only.", JSON.stringify({ annualKm: 14500 }), 8, "open", iso(4)],
    ["f-m1", "v-merc", "SERVICE_GAP", "SERVICE_GAP", "low", "Service history gap", "No service record found for an 11-month window.", "Upload the missing service invoice if available.", JSON.stringify({ gapMonths: 11 }), 5, "open", iso(4)],
    ["f-to1", "v-toyota", "INSURANCE_EXPIRED", "INSURANCE_EXPIRED", "low", "Insurance renewal required", "The policy expires within 30 days.", "Renew the policy.", JSON.stringify({ validTo: "2026-03-31" }), 6, "open", iso(4)],
    ["f-h1", "v-honda", "DUPLICATE_DOCUMENT", "DUPLICATE_DOCUMENT", "low", "Possible duplicate document", "A service invoice shares an invoice number with another vehicle. Possible clerical reuse.", "Confirm the invoice belongs to this vehicle.", JSON.stringify({ invoiceNo: "INV-778812" }), 0, "cleared", iso(5)],
  ];
  const ifind = conn.prepare("INSERT INTO findings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  findings.forEach((f) => {
    const [id, vid, ruleKey, code, severity, title, explanation, recommendation, evidence, points, status, createdAt] = f;
    ifind.run(id, vid, ruleKey, code, severity, title, explanation, recommendation, evidence, null, points, status, createdAt);
  });

  type M = [string, string, string, number, string, string, number, number, number, string | null];
  const mileage: M[] = [
    ["m-b1", "v-bmw", "2021", 8000, "rto", "2021-12-31T00:00:00Z", 0, 1, 0, "v-bmw-rc"],
    ["m-b2", "v-bmw", "2022", 24000, "service_center", "2022-12-31T00:00:00Z", 0, 1, 0, "v-bmw-service"],
    ["m-b3", "v-bmw", "2023", 42000, "inspection", "2023-12-15T00:00:00Z", 0, 1, 0, "v-bmw-inspection"],
    ["m-s1", "v-seller", "2019", 12000, "service_center", "2019-12-31T00:00:00Z", 0, 1, 0, "v-seller-service"],
    ["m-s2", "v-seller", "2020", 28000, "service_center", "2020-12-31T00:00:00Z", 0, 1, 0, null],
    ["m-s3", "v-seller", "2021", 41000, "service_center", "2021-12-31T00:00:00Z", 0, 1, 0, null],
    ["m-s4", "v-seller", "2022", 58000, "insurance", "2022-12-31T00:00:00Z", 0, 1, 0, "v-seller-insurance"],
    ["m-s5", "v-seller", "2023", 72450, "seller_submitted", "2023-12-20T00:00:00Z", 1, 0, 1, null],
    ["m-c1", "v-camry", "2021", 42000, "rto", "2021-12-31T00:00:00Z", 0, 1, 0, "v-camry-rc"],
    ["m-c2", "v-camry", "2022", 58000, "service_center", "2022-12-31T00:00:00Z", 0, 1, 0, "v-camry-service"],
    ["m-c3", "v-camry", "2023", 86400, "service_center", "2023-12-31T00:00:00Z", 0, 1, 0, null],
    ["m-c4", "v-camry", "2024", 51200, "seller_submitted", "2024-06-30T00:00:00Z", 1, 0, 1, null],
    ["m-t1", "v-tata", "2021", 18000, "service_center", "2021-12-31T00:00:00Z", 0, 1, 0, "v-tata-service"],
    ["m-t2", "v-tata", "2023", 32000, "seller_submitted", "2023-12-31T00:00:00Z", 0, 0, 1, null],
    ["m-a1", "v-audi", "2020", 12000, "rto", "2020-12-31T00:00:00Z", 0, 1, 0, "v-audi-rc"],
    ["m-a2", "v-audi", "2022", 34000, "service_center", "2022-12-31T00:00:00Z", 0, 1, 0, "v-audi-service"],
    ["m-a3", "v-audi", "2024", 58000, "inspection", "2024-12-15T00:00:00Z", 0, 1, 0, "v-audi-inspection"],
    ["m-me1", "v-merc", "2022", 9000, "rto", "2022-12-31T00:00:00Z", 0, 1, 0, "v-merc-rc"],
    ["m-me2", "v-merc", "2024", 31000, "service_center", "2024-11-30T00:00:00Z", 0, 1, 0, "v-merc-service"],
    ["m-hy1", "v-hyundai", "2021", 11000, "rto", "2021-12-31T00:00:00Z", 0, 1, 0, "v-hyundai-rc"],
    ["m-hy2", "v-hyundai", "2024", 36000, "service_center", "2024-10-30T00:00:00Z", 0, 1, 0, "v-hyundai-service"],
    ["m-to1", "v-toyota", "2019", 22000, "rto", "2019-12-31T00:00:00Z", 0, 1, 0, "v-toyota-rc"],
    ["m-to2", "v-toyota", "2022", 61000, "service_center", "2022-12-31T00:00:00Z", 0, 1, 0, "v-toyota-service"],
    ["m-to3", "v-toyota", "2025", 88000, "inspection", "2025-12-31T00:00:00Z", 0, 1, 0, "v-toyota-inspection"],
    ["m-ho1", "v-honda", "2020", 14000, "rto", "2020-12-31T00:00:00Z", 0, 1, 0, "v-honda-rc"],
    ["m-ho2", "v-honda", "2023", 47000, "service_center", "2023-12-31T00:00:00Z", 0, 1, 0, "v-honda-service"],
    ["m-du1", "v-ducati", "2022", 2000, "rto", "2022-10-15T00:00:00Z", 0, 1, 0, "v-ducati-rc"],
    ["m-du2", "v-ducati", "2024", 12000, "service_center", "2024-09-20T00:00:00Z", 0, 1, 0, "v-ducati-service"],
    ["m-re1", "v-royalenfield", "2021", 3500, "rto", "2021-08-10T00:00:00Z", 0, 1, 0, "v-royalenfield-rc"],
    ["m-re2", "v-royalenfield", "2023", 11000, "service_center", "2023-11-15T00:00:00Z", 0, 1, 0, "v-royalenfield-service"],
    ["m-re3", "v-royalenfield", "2025", 16500, "service_center", "2025-10-05T00:00:00Z", 0, 1, 0, "v-royalenfield-service"],
    ["m-ka1", "v-kawasaki", "2020", 3000, "rto", "2020-11-20T00:00:00Z", 0, 1, 0, "v-kawasaki-rc"],
    ["m-ka2", "v-kawasaki", "2023", 14000, "service_center", "2023-12-10T00:00:00Z", 0, 1, 0, "v-kawasaki-service"],
    ["m-bb1", "v-bmw-bike", "2021", 4500, "rto", "2021-09-01T00:00:00Z", 0, 1, 0, "v-bmw-bike-rc"],
    ["m-bb2", "v-bmw-bike", "2024", 22000, "service_center", "2024-11-15T00:00:00Z", 0, 1, 0, "v-bmw-bike-service"],
  ];
  const im = conn.prepare("INSERT INTO mileage_readings VALUES (?,?,?,?,?,?,?,?,?,?)");
  mileage.forEach((m) => im.run(...m));

  const pricing: [string, number, number, number, string, number, string, string][] = [
    ["v-bmw", 2450000, 2600000, 2850000, "High", 14, "Comparables: make/model/year ±1, mileage ±20%, fuel, city", iso(2)],
    ["v-seller", 530000, 580000, 620000, "Moderate", 9, "Comparables + age/mileage/condition adjustment", iso(2)],
    ["v-camry", 1980000, 2150000, 2320000, "Moderate", 7, "Comparables + age/mileage/condition adjustment", iso(2)],
    ["v-tata", 760000, 850000, 940000, "Low", 4, "Few comparables — low confidence", iso(2)],
    ["v-audi", 2100000, 2250000, 2400000, "High", 11, "Comparables: make/model/year ±1", iso(2)],
    ["v-merc", 3200000, 3400000, 3600000, "High", 12, "Comparables: make/model/year ±1", iso(2)],
    ["v-hyundai", 1320000, 1450000, 1580000, "High", 16, "Comparables: make/model/year ±1", iso(2)],
    ["v-toyota", 2520000, 2750000, 2980000, "Moderate", 8, "Comparables + age/mileage/condition adjustment", iso(2)],
    ["v-honda", 960000, 1050000, 1140000, "High", 13, "Comparables: make/model/year ±1", iso(2)],
    ["v-ducati", 1750000, 1850000, 1950000, "High", 8, "Comparables: Superbike 1000cc+ segment", iso(1)],
    ["v-royalenfield", 300000, 320000, 340000, "High", 19, "Comparables: 650cc twin segment", iso(1)],
    ["v-kawasaki", 1350000, 1420000, 1500000, "Moderate", 7, "Comparables: Liter-class supersport", iso(2)],
    ["v-bmw-bike", 1950000, 2050000, 2180000, "High", 10, "Comparables: Adventure touring segment", iso(1)],
  ];
  const ip = conn.prepare("INSERT INTO pricing VALUES (?,?,?,?,?,?,?,?)");
  pricing.forEach((p) => ip.run(...p));

  const listings: [string, string, string, string, string, string, string, number, number, number, string | null, string | null, string, string][] = [
    ["l-bmw", "v-bmw", "published", "Published on Marketplace", "Single-owner BMW 330i with a complete, verified service history. No accident records found in available sources.", "Excellent", "Mumbai", 40, 9, 2, null, iso(140), iso(140), iso(2)],
    ["l-seller", "v-seller", "published", "Published on Marketplace", "Well-maintained 320d. Verification is in progress for one document and one mileage reading.", "Good", "Mumbai", 15, 4, 3, null, iso(200), iso(200), iso(1)],
    ["l-camry", "v-camry", "published", "Published on Marketplace", "Camry hybrid with a flagged odometer history — please review the AI risk analysis before purchase.", "Fair", "Pune", 22, 5, 1, null, iso(170), iso(170), iso(3)],
    ["l-tata", "v-tata", "draft", "Draft — Ready for updates", "Nexon XZ+ — more documents required before publishing.", "Good", "Nanded", 0, 0, 0, null, null, iso(55), iso(5)],
    ["l-audi", "v-audi", "published", "Published on Marketplace", "A4 40 TFSI with verified service records and a clean accident check.", "Very good", "Pune", 33, 7, 1, null, iso(130), iso(130), iso(4)],
    ["l-merc", "v-merc", "published", "Published on Marketplace", "Low-mileage C200 with a complete document set and strong verification.", "Excellent", "Mumbai", 51, 12, 4, null, iso(110), iso(110), iso(6)],
    ["l-hyundai", "v-hyundai", "published", "Published on Marketplace", "Creta SX(O) with verified records and no open findings.", "Very good", "Nagpur", 28, 6, 2, null, iso(90), iso(90), iso(7)],
    ["l-toyota", "v-toyota", "published", "Published on Marketplace", "Fortuner with complete service history; insurance renewal required.", "Good", "Hyderabad", 19, 3, 1, null, iso(150), iso(150), iso(8)],
    ["l-honda", "v-honda", "published", "Published on Marketplace", "City ZX with a clean, verified record set.", "Very good", "Mumbai", 25, 5, 0, null, iso(85), iso(85), iso(9)],
    ["l-ducati", "v-ducati", "published", "Published on Marketplace", "Ducati Panigale V4 with full authorized Ducati service history. Pristine condition with verified Desmo service logs.", "Excellent", "Mumbai", 38, 8, 3, null, iso(75), iso(75), iso(1)],
    ["l-royalenfield", "v-royalenfield", "published", "Published on Marketplace", "Royal Enfield Continental GT 650 with authentic service logs, custom dual exhaust (OEM included), verified title.", "Excellent", "Pune", 46, 11, 4, null, iso(70), iso(70), iso(2)],
    ["l-kawasaki", "v-kawasaki", "published", "Published on Marketplace", "Kawasaki Ninja ZX-10R with verified track-free inspection, zero fall damage, new Pirelli rubber.", "Very good", "Mumbai", 29, 6, 1, null, iso(100), iso(100), iso(3)],
    ["l-bmw-bike", "v-bmw-bike", "published", "Published on Marketplace", "BMW R 1250 GS Adventure with complete BMW Motorrad service stamps and electronic suspension verification.", "Excellent", "Pune", 52, 14, 5, null, iso(55), iso(55), iso(4)],
  ];
  const il = conn.prepare("INSERT INTO listings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  listings.forEach((l) => il.run(...l));

  const images = [
    ["img-bmw-1", "l-bmw", "photos/v-bmw/front.jpg", 1, "photo"],
    ["img-bmw-2", "l-bmw", "photos/v-bmw/rear.jpg", 2, "photo"],
    ["img-bmw-3", "l-bmw", "photos/v-bmw/interior.jpg", 3, "photo"],
    ["img-audi-1", "l-audi", "photos/v-audi/front.jpg", 1, "photo"],
    ["img-merc-1", "l-merc", "photos/v-merc/front.jpg", 1, "photo"],
    ["img-seller-1", "l-seller", "photos/v-seller/front.jpg", 1, "photo"],
  ];
  const iimg = conn.prepare("INSERT INTO listing_images VALUES (?,?,?,?,?)");
  images.forEach((i) => iimg.run(...i));

  type Q = [string, string, string, string, string, string, string, string, string, string, string];
  const inquiries: Q[] = [
    ["q1", "l-seller", "u-buyer2", "u-seller", "Rohan Mehta", "RM", "I'd like to offer ₹5,60,000 for this BMW.", "offer", "open", iso(0, 8), iso(0, 8)],
    ["q2", "l-seller", "u-buyer3", "u-seller", "Priya Sharma", "PS", "Could you share more photos of the interior and odometer?", "photos", "open", iso(0, 6), iso(0, 6)],
    ["q3", "l-seller", "u-buyer4", "u-seller", "Arjun Nair", "AN", "Can we schedule a test drive this Saturday?", "test_drive", "pending", iso(1), iso(1)],
    ["q4", "l-bmw", "u-buyer", "u-seller", "Aditya Darak", "AD", "Is the odometer reading verified? Can I schedule a test drive?", "message", "replied", iso(2), iso(0, 4)],
    ["q5", "l-audi", "u-buyer", "u-seller2", "Aditya Darak", "AD", "Can you share the service records?", "documents", "open", iso(3), iso(3)],
  ];
  const iq = conn.prepare("INSERT INTO inquiries VALUES (?,?,?,?,?,?,?,?,?,?,?)");
  inquiries.forEach((q) => iq.run(...q));

  const messages: [string, string, string, string, string, number | null, string | null, string, string][] = [
    ["msg-q1", "q1", "u-buyer2", "Rohan Mehta", "I'd like to offer ₹5,60,000 for this BMW.", 560000, null, "[]", iso(0, 8)],
    ["msg-q2", "q2", "u-buyer3", "Priya Sharma", "Could you share more photos of the interior and odometer?", null, null, "[]", iso(0, 6)],
    ["msg-q3", "q3", "u-buyer4", "Arjun Nair", "Can we schedule a test drive this Saturday?", null, iso(2, 10), "[]", iso(1)],
    ["msg-q4a", "q4", "u-buyer", "Aditya Darak", "Is the odometer reading verified? Can I schedule a test drive?", null, null, "[]", iso(2)],
    ["msg-q4b", "q4", "u-seller", "Samarth Darak", "Yes — the verified report is attached. Test drive available Saturday at 11 am.", null, iso(0, 11), "[]", iso(0, 4)],
    ["msg-q5", "q5", "u-buyer", "Aditya Darak", "Can you share the service records?", null, null, "[]", iso(3)],
  ];
  const imsg = conn.prepare("INSERT INTO inquiry_messages VALUES (?,?,?,?,?,?,?,?,?)");
  messages.forEach((m) => imsg.run(...m));

  const saved: [string, string, string, number, string, string][] = [
    ["sv-1", "u-buyer", "l-bmw", 2600000, "Shortlist", iso(12)],
    ["sv-2", "u-buyer", "l-audi", 2250000, "All", iso(9)],
    ["sv-3", "u-buyer", "l-merc", 3400000, "All", iso(5)],
  ];
  const isv = conn.prepare("INSERT INTO saved_vehicles VALUES (?,?,?,?,?,?)");
  saved.forEach((s) => isv.run(...s));

  const searches = [
    ["ss-1", "u-buyer", "Verified BMW under ₹30L", JSON.stringify({ make: "BMW", priceMax: 3000000, verification: "verified" }), 1, iso(20)],
    ["ss-2", "u-buyer", "Automatic SUVs in Pune", JSON.stringify({ transmission: "Automatic", location: "Pune" }), 0, iso(14)],
  ];
  const iss = conn.prepare("INSERT INTO saved_searches VALUES (?,?,?,?,?,?)");
  searches.forEach((s) => iss.run(...s));

  const notifs: [string, string, string, string, string, string, number, string][] = [
    ["n1", "u-seller", "document", "1 document needs attention", "The RC VIN does not match the vehicle record. Upload a corrected RC.", JSON.stringify({ vehicleId: "v-seller" }), 0, iso(0, 7)],
    ["n2", "u-seller", "mileage", "Mileage discrepancy detected", "The 2023 reading is flagged for review.", JSON.stringify({ vehicleId: "v-seller" }), 0, iso(0, 5)],
    ["n3", "u-seller", "inquiry", "New inquiry from Rohan Mehta", "I'd like to offer ₹5,60,000 for this BMW.", JSON.stringify({ inquiryId: "q1" }), 0, iso(0, 8)],
    ["n4", "u-seller", "listing", "Listing published", "Your BMW 3 Series is live on the marketplace.", JSON.stringify({ listingId: "l-seller" }), 1, iso(2)],
    ["n5", "u-buyer", "saved", "Price change on a saved vehicle", "The BMW 3 Series you saved is still available at ₹26,00,000.", JSON.stringify({ vehicleId: "v-bmw" }), 0, iso(0, 9)],
    ["n6", "u-buyer", "inquiry", "Seller replied to your inquiry", "Samarth Darak replied about the BMW 3 Series.", JSON.stringify({ inquiryId: "q4" }), 0, iso(0, 4)],
    ["n7", "u-buyer", "verification", "Verification completed", "The BMW 3 Series report is ready to view.", JSON.stringify({ vehicleId: "v-bmw" }), 1, iso(1)],
    ["n8", "u-buyer", "recommended", "New recommended vehicle", "A Mercedes C-Class matching your shortlist was added.", JSON.stringify({ vehicleId: "v-merc" }), 1, iso(2)],
    ["n9", "u-admin", "admin", "Dispute pending review", "Samarth Darak disputed the VIN mismatch finding.", JSON.stringify({ findingId: "f-s1" }), 0, iso(0, 3)],
  ];
  const ino = conn.prepare("INSERT INTO notifications VALUES (?,?,?,?,?,?,?,?)");
  notifs.forEach((n) => ino.run(...n));

  const ia = conn.prepare("INSERT INTO activity VALUES (?,?,?,?,?)");
  ia.run("u-buyer", 12, 3, 3, 2);
  ia.run("u-seller", 5, 0, 0, 0);

  const history: [string, string, string, string, number, string, string, string, string | null, string, string | null, string, string][] = [
    ["h-b1", "v-bmw", "registration", "2021-03-15T00:00:00Z", 0, "First registration", "Registered with RTO Mumbai.", "rto", "v-bmw-rc", "verified", null, "u-seller", iso(150)],
    ["h-b2", "v-bmw", "service", "2022-04-10T00:00:00Z", 18000, "Scheduled service", "Oil, filters and brake check at Navnit Motors.", "service_center", "v-bmw-service", "verified", null, "u-seller", iso(140)],
    ["h-b3", "v-bmw", "service", "2023-05-02T00:00:00Z", 33000, "Scheduled service", "Full service at an authorised centre.", "service_center", "v-bmw-service", "verified", null, "u-seller", iso(120)],
    ["h-b4", "v-bmw", "inspection", "2023-06-01T00:00:00Z", 42000, "Pre-sale inspection", "120-point inspection passed; no structural damage.", "inspection", "v-bmw-inspection", "verified", null, "u-seller", iso(110)],
    ["h-s1", "v-seller", "registration", "2015-04-02T00:00:00Z", 0, "First registration", "Registered with RTO Mumbai.", "rto", "v-seller-rc", "verified", null, "u-seller", iso(200)],
    ["h-s2", "v-seller", "ownership", "2018-09-12T00:00:00Z", 34000, "Second owner", "Ownership transferred; RC updated.", "rto", "v-seller-ownership", "verified", null, "u-seller", iso(180)],
    ["h-s3", "v-seller", "service", "2021-11-20T00:00:00Z", 58000, "Major service", "Timing chain inspection and fluid replacement.", "service_center", "v-seller-service", "verified", null, "u-seller", iso(90)],
    ["h-s4", "v-seller", "repair", "2023-08-14T00:00:00Z", 70000, "Front bumper repair", "Minor cosmetic repair after a parking incident.", "seller_submitted", null, "pending", null, "u-seller", iso(20)],
    ["h-s5", "v-seller", "odometer", "2023-12-20T00:00:00Z", 72450, "Odometer reading submitted", "Seller-submitted reading pending verification.", "seller_submitted", null, "pending", null, "u-seller", iso(10)],
    ["h-c1", "v-camry", "registration", "2021-02-11T00:00:00Z", 0, "First registration", "Registered with RTO Pune.", "rto", "v-camry-rc", "verified", null, "u-seller2", iso(170)],
    ["h-c2", "v-camry", "service", "2022-06-10T00:00:00Z", 58000, "Scheduled service", "Hybrid system check and oil change.", "service_center", "v-camry-service", "verified", null, "u-seller2", iso(130)],
    ["h-c3", "v-camry", "service", "2023-12-05T00:00:00Z", 76000, "Service invoice", "Invoice shows 76,000 km — conflicts with other readings.", "service_center", null, "suspicious", null, "u-seller2", iso(60)],
    ["h-c4", "v-camry", "odometer", "2024-06-30T00:00:00Z", 51200, "Odometer reading submitted", "Reading is lower than the previous verified value.", "seller_submitted", null, "suspicious", null, "u-seller2", iso(30)],
    ["h-t1", "v-tata", "registration", "2020-08-19T00:00:00Z", 0, "First registration", "Registered with RTO Nanded.", "rto", "v-tata-rc", "pending", null, "u-seller", iso(55)],
    ["h-t2", "v-tata", "service", "2023-02-11T00:00:00Z", 32000, "Scheduled service", "Service invoice uploaded.", "service_center", "v-tata-service", "verified", null, "u-seller", iso(40)],
    ["h-a1", "v-audi", "registration", "2020-01-20T00:00:00Z", 0, "First registration", "Registered with RTO Pune.", "rto", "v-audi-rc", "verified", null, "u-seller2", iso(140)],
    ["h-a2", "v-audi", "service", "2022-03-14T00:00:00Z", 34000, "Scheduled service", "Full service at authorised centre.", "service_center", "v-audi-service", "verified", null, "u-seller2", iso(110)],
    ["h-me1", "v-merc", "registration", "2022-05-05T00:00:00Z", 0, "First registration", "Registered with RTO Mumbai.", "rto", "v-merc-rc", "verified", null, "u-seller2", iso(120)],
    ["h-me2", "v-merc", "service", "2024-11-30T00:00:00Z", 31000, "Scheduled service", "Annual service completed.", "service_center", "v-merc-service", "verified", null, "u-seller2", iso(70)],
    ["h-hy1", "v-hyundai", "registration", "2021-06-18T00:00:00Z", 0, "First registration", "Registered with RTO Nagpur.", "rto", "v-hyundai-rc", "verified", null, "u-seller2", iso(100)],
    ["h-hy2", "v-hyundai", "service", "2024-10-30T00:00:00Z", 36000, "Scheduled service", "Full service completed.", "service_center", "v-hyundai-service", "verified", null, "u-seller2", iso(60)],
    ["h-to1", "v-toyota", "registration", "2019-09-09T00:00:00Z", 0, "First registration", "Registered with RTO Hyderabad.", "rto", "v-toyota-rc", "verified", null, "u-seller2", iso(160)],
    ["h-to2", "v-toyota", "service", "2022-12-12T00:00:00Z", 61000, "Scheduled service", "Major service completed.", "service_center", "v-toyota-service", "verified", null, "u-seller2", iso(100)],
    ["h-ho1", "v-honda", "registration", "2020-12-01T00:00:00Z", 0, "First registration", "Registered with RTO Mumbai.", "rto", "v-honda-rc", "verified", null, "u-seller", iso(95)],
    ["h-ho2", "v-honda", "service", "2023-12-31T00:00:00Z", 47000, "Scheduled service", "Full service completed.", "service_center", "v-honda-service", "verified", null, "u-seller", iso(50)],
  ];
  const ih = conn.prepare("INSERT INTO history_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  history.forEach((h) => ih.run(...h));

  const damages: [string, string, string, string, string, string, string, string, string, string, string | null, string | null, string, string][] = [
    ["d-s1", "v-seller", "front_bumper", "Minor scuff on the front bumper; paint only, no structural damage.", "Minor", "Repaired", "Repainted at a local workshop.", "2023-08-14", "pending", "[]", null, null, "u-seller", iso(20)],
    ["d-s2", "v-seller", "door_fr", "Right front door dent repaired and repainted.", "Moderate", "Repaired", "Panel repair with invoice.", "2022-02-10", "verified", "[]", "v-seller-service", null, "u-seller", iso(120)],
    ["d-s3", "v-seller", "door_rr", "Rear right door scratch, not yet repaired.", "Minor", "Not repaired", "", "2024-01-05", "pending", "[]", null, null, "u-seller", iso(15)],
    ["d-s4", "v-seller", "rear_bumper", "Rear bumper replaced after a low-speed impact.", "Moderate", "Repaired", "Replacement bumper fitted.", "2021-10-01", "verified", "[]", "v-seller-service", null, "u-seller", iso(150)],
    ["d-b1", "v-bmw", "rear_bumper", "Small cosmetic scratch, repaired before sale.", "Minor", "Repaired", "Paint correction.", "2023-05-20", "verified", "[]", "v-bmw-service", null, "u-seller", iso(100)],
    ["d-c1", "v-camry", "door_fl", "Left front door repainted.", "Minor", "Repaired", "", "2022-11-11", "verified", "[]", null, null, "u-seller2", iso(100)],
    ["d-c2", "v-camry", "bonnet", "Bonnet has stone chips.", "Minor", "Not repaired", "", "2024-01-10", "pending", "[]", null, null, "u-seller2", iso(20)],
    ["d-t1", "v-tata", "front_bumper", "Front bumper cracked; repair invoice not provided.", "Moderate", "Not repaired", "", "2023-09-09", "pending", "[]", null, null, "u-seller", iso(30)],
  ];
  const idmg = conn.prepare("INSERT INTO damage_records VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  damages.forEach((d) => idmg.run(...d));

  // Verification runs (results are derived deterministically by the service).
  const irun = conn.prepare("INSERT INTO verification_runs VALUES (?,?,?,?,?,?)");
  for (const v of vehicles) {
    irun.run(`run-${v[0]}`, v[0], "done", iso(2), iso(1), JSON.stringify({ checks: 10, passed: 7, findings: 0 }));
  }

  const theft: [string, string, string, string, string][] = [
    ["v-bmw", "no_record", "Demo theft registry", iso(1), JSON.stringify({ note: "Mock adapter — demo data source" })],
    ["v-seller", "no_record", "Demo theft registry", iso(1), JSON.stringify({ note: "Mock adapter — demo data source" })],
    ["v-camry", "no_record", "Demo theft registry", iso(1), JSON.stringify({ note: "Mock adapter — demo data source" })],
    ["v-tata", "unavailable", "Demo theft registry", iso(1), JSON.stringify({ note: "Adapter temporarily unavailable" })],
    ["v-audi", "no_record", "Demo theft registry", iso(1), JSON.stringify({ note: "Mock adapter — demo data source" })],
    ["v-merc", "no_record", "Demo theft registry", iso(1), JSON.stringify({ note: "Mock adapter — demo data source" })],
    ["v-hyundai", "no_record", "Demo theft registry", iso(1), JSON.stringify({ note: "Mock adapter — demo data source" })],
    ["v-toyota", "no_record", "Demo theft registry", iso(1), JSON.stringify({ note: "Mock adapter — demo data source" })],
    ["v-honda", "no_record", "Demo theft registry", iso(1), JSON.stringify({ note: "Mock adapter — demo data source" })],
  ];
  const itheft = conn.prepare("INSERT INTO theft_checks VALUES (?,?,?,?,?)");
  theft.forEach((t) => itheft.run(...t));

  // QR tokens (revocable, signed).
  const iqr = conn.prepare("INSERT INTO qr_tokens VALUES (?,?,?,?,?,?)");
  for (const v of vehicles) {
    const jti = `jti-${v[0]}`;
    iqr.run(jti, v[0], signQrToken(v[0], jti), null, v[1], iso(30));
  }

  const reports: [string, string, string, string, string, string | null, string, string | null, string][] = [
    ["rep-1", "v-bmw", "u-buyer", "Vehicle verification", "ready", "reports/rep-1.pdf", "RPT-2026-0001", iso(1), iso(2)],
    ["rep-2", "v-bmw", "u-buyer", "Vehicle condition", "ready", "reports/rep-2.pdf", "RPT-2026-0002", iso(2), iso(3)],
    ["rep-3", "v-bmw", "u-buyer", "AI risk analysis", "ready", "reports/rep-3.pdf", "RPT-2026-0003", iso(2), iso(4)],
    ["rep-4", "v-bmw", "u-buyer", "Vehicle history", "queued", null, "RPT-2026-0004", null, iso(0, 9)],
    ["rep-5", "v-seller", "u-seller", "Vehicle verification", "ready", "reports/rep-5.pdf", "RPT-2026-0005", iso(1), iso(2)],
    ["rep-6", "v-seller", "u-seller", "Document verification", "ready", "reports/rep-6.pdf", "RPT-2026-0006", iso(2), iso(3)],
    ["rep-7", "v-seller", "u-seller", "AI risk analysis", "ready", "reports/rep-7.pdf", "RPT-2026-0007", iso(2), iso(4)],
    ["rep-8", "v-seller", "u-seller", "Listing performance", "processing", null, "RPT-2026-0008", null, iso(0, 8)],
  ];
  const irep = conn.prepare("INSERT INTO reports VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  reports.forEach((r) => irep.run(...r, null, "{}", 1));

  const disputes: [string, string, string, string, string, string, string | null, string | null, string][] = [
    ["disp-1", "f-s1", "u-seller", "The RC has a typo in the last digit. I have requested a correction from the RTO and attached the receipt.", JSON.stringify(["v-seller-rc"]), "pending", null, null, iso(0, 4)],
    ["disp-2", "f-s2", "u-seller", "The 2023 service invoice confirms 72,450 km. Please re-check.", JSON.stringify(["v-seller-service"]), "resolved", "u-admin", "Invoice matched the claimed reading; finding cleared.", iso(1)],
  ];
  const idisp = conn.prepare("INSERT INTO disputes VALUES (?,?,?,?,?,?,?,?,?)");
  disputes.forEach((d) => idisp.run(...d));

  const audit = [
    ["a-1", "u-seller", "document.upload", "document", "v-seller-rc", "{}", JSON.stringify({ status: "needs_correction" }), "127.0.0.1", "seed", iso(2)],
    ["a-2", "u-admin", "dispute.resolve", "dispute", "disp-2", JSON.stringify({ status: "pending" }), JSON.stringify({ status: "resolved" }), "127.0.0.1", "seed", iso(1)],
    ["a-3", "u-buyer", "report.request", "report", "rep-1", "{}", JSON.stringify({ status: "ready" }), "127.0.0.1", "seed", iso(2)],
  ];
  const iaudit = conn.prepare("INSERT INTO audit_logs VALUES (?,?,?,?,?,?,?,?,?,?)");
  audit.forEach((a) => iaudit.run(...a));

  // Listing view events (analytics).
  const iev = conn.prepare("INSERT INTO listing_events VALUES (?,?,?,?,?)");
  for (let i = 0; i < 15; i++) iev.run(`ev-${i}`, "l-seller", i % 5 === 0 ? "save" : "view", "u-buyer", iso(i % 7));

  // Hash chain for every vehicle: history + documents + damage.
  const ic = conn.prepare("INSERT INTO chain_records VALUES (?,?,?,?,?,?,?,?)");
  for (const v of vehicles) {
    const vid = v[0];
    const payloads = [
      ...history.filter((h) => h[1] === vid).map((h) => ({ entityType: "history", entityId: h[0], category: h[2], date: h[3], km: h[4] })),
      ...Array.from({ length: 6 }, (_, i) => ({ entityType: "document", entityId: `${vid}-${docTypes[i]}`, type: docTypes[i] })),
      ...damages.filter((d) => d[1] === vid).map((d) => ({ entityType: "damage", entityId: d[0], zone: d[2], severity: d[4] })),
    ];
    const chain = buildChain(payloads);
    chain.forEach((c) => ic.run(vid, c.seq, (c.payload as { entityType: string }).entityType, (c.payload as { entityId: string }).entityId, JSON.stringify(c.payload), c.prevHash, c.recordHash, iso(2)));
  }
}

/** Seed demo listing photos into local uploads so seeded rows render real images. */
function seedDemoPhotos(conn: DatabaseSync) {
  const rows = conn
    .prepare(
      "SELECT li.file_key, v.make FROM listing_images li JOIN listings l ON l.id = li.listing_id JOIN vehicles v ON v.id = l.vehicle_id"
    )
    .all() as { file_key: string; make: string | null }[];
  for (const row of rows) {
    const make = (row.make ?? "").toLowerCase();
    const source = make.includes("bmw")
      ? "images/cars/bmw-silver.jpg"
      : make.includes("audi")
        ? "images/cars/audi-sedan.jpg"
        : make.includes("mercedes")
          ? "images/cars/merc-luxury.jpg"
          : "images/cars/auth-luxury-car.jpg";
    ensureUploadFromPublic(row.file_key, source);
  }
}

// ---------------------------------------------------------------------------
// Backend-completion entities (design.md §7, §11, §12, §13).
// Additive only: existing verified rows are never rewritten by these tables.
// ---------------------------------------------------------------------------
function ensureBackendTables(conn: DatabaseSync) {
  conn.exec(`
  CREATE TABLE IF NOT EXISTS evidence_nodes(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, node_type TEXT NOT NULL, entity_id TEXT NOT NULL,
    label TEXT NOT NULL, source TEXT NOT NULL, reliability TEXT NOT NULL DEFAULT 'unknown',
    disclosed INTEGER DEFAULT 0, payload TEXT DEFAULT '{}', created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_evidence_nodes_vehicle ON evidence_nodes(vehicle_id, node_type);

  CREATE TABLE IF NOT EXISTS evidence_edges(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, source_node TEXT NOT NULL,
    relation TEXT NOT NULL, target_node TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_evidence_edges_vehicle ON evidence_edges(vehicle_id);

  CREATE TABLE IF NOT EXISTS verification_cases(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, run_id TEXT, subject TEXT,
    state TEXT NOT NULL, ruleset_version TEXT NOT NULL, model_version TEXT NOT NULL,
    requester_id TEXT, summary TEXT DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_verification_cases_vehicle ON verification_cases(vehicle_id, created_at);

  CREATE TABLE IF NOT EXISTS document_extractions(
    id TEXT PRIMARY KEY, document_id TEXT NOT NULL, vehicle_id TEXT NOT NULL, field TEXT NOT NULL,
    value TEXT, confidence REAL, page INTEGER, method TEXT, created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_doc_extractions_doc ON document_extractions(document_id, field);
  CREATE INDEX IF NOT EXISTS idx_doc_extractions_vehicle ON document_extractions(vehicle_id, field);

  CREATE TABLE IF NOT EXISTS vehicle_claims(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, field TEXT NOT NULL, value TEXT,
    source TEXT NOT NULL DEFAULT 'seller_declared', status TEXT NOT NULL DEFAULT 'pending',
    submitted_by TEXT, supersedes_id TEXT, created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_vehicle_claims_vehicle ON vehicle_claims(vehicle_id, field);

  CREATE TABLE IF NOT EXISTS provider_checks(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, provider TEXT NOT NULL, kind TEXT NOT NULL,
    request_ref TEXT, status TEXT NOT NULL, fields_queried TEXT DEFAULT '[]',
    result TEXT DEFAULT '{}', checked_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_provider_checks_vehicle ON provider_checks(vehicle_id, kind);

  CREATE TABLE IF NOT EXISTS ai_runs(
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, case_id TEXT, graph TEXT NOT NULL,
    status TEXT NOT NULL, model_version TEXT NOT NULL, ruleset_version TEXT NOT NULL,
    input_refs TEXT DEFAULT '[]', output_refs TEXT DEFAULT '[]',
    started_at TEXT NOT NULL, finished_at TEXT);
  CREATE INDEX IF NOT EXISTS idx_ai_runs_vehicle ON ai_runs(vehicle_id, started_at);

  CREATE TABLE IF NOT EXISTS idempotency_keys(
    key TEXT PRIMARY KEY, scope TEXT NOT NULL, status_code INTEGER NOT NULL,
    response TEXT NOT NULL, created_at TEXT NOT NULL);
  `);
  backfillDocumentExtractions(conn);
}

/**
 * Project already-stored document fields into `document_extractions` once.
 * Seeded rows predate the table, so without this the field-level API is empty
 * even though `documents.extracted` holds real parsed values.
 */
function backfillDocumentExtractions(conn: DatabaseSync) {
  const docs = conn
    .prepare(
      "SELECT id, vehicle_id, extracted FROM documents WHERE extracted IS NOT NULL AND extracted <> '' AND extracted <> '{}'"
    )
    .all() as { id: string; vehicle_id: string; extracted: string }[];
  if (!docs.length) return;
  const existing = conn.prepare("SELECT COUNT(*) AS c FROM document_extractions WHERE document_id = ?");
  const insert = conn.prepare(
    "INSERT OR IGNORE INTO document_extractions (id, document_id, vehicle_id, field, value, confidence, page, method, created_at) VALUES (?,?,?,?,?,?,?,?,?)"
  );
  const now = new Date().toISOString();
  for (const doc of docs) {
    const count = existing.get(doc.id) as { c: number } | undefined;
    if ((count?.c ?? 0) > 0) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(doc.extracted) as Record<string, unknown>;
    } catch {
      continue;
    }
    const fields =
      parsed.fields && typeof parsed.fields === "object"
        ? (parsed.fields as Record<string, unknown>)
        : parsed;
    const conf = parsed.confidence && typeof parsed.confidence === "object" ? (parsed.confidence as Record<string, unknown>) : {};
    const method = typeof parsed.method === "string" ? parsed.method : "seed-extraction";
    let index = 0;
    for (const [field, value] of Object.entries(fields)) {
      if (value === null || value === undefined || typeof value === "object") continue;
      if (["method", "confidence", "confidences", "pages"].includes(field)) continue;
      if (index >= 50) break;
      const confidence = Number(conf[field]);
      insert.run(
        `dx-${doc.id}-${index}`,
        doc.id,
        doc.vehicle_id,
        field,
        String(value).slice(0, 500),
        Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
        null,
        method,
        now
      );
      index += 1;
    }
  }
}

/**
 * Additive soft-delete columns. `ALTER TABLE ... ADD COLUMN` is guarded by a
 * PRAGMA check so existing databases are upgraded without a destructive
 * migration and without losing rows.
 */
function ensureSoftDeleteColumns(conn: DatabaseSync) {
  for (const table of ["users", "documents"]) {
    const cols = conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === "deleted_at")) {
      conn.exec(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT`);
    }
  }
}

/**
 * Additive schema step for the 3D inspection system.
 *
 * `damage_records` grew five columns so a hotspot can be tied to a real
 * component and a real point on the model instead of a decorative marker. The
 * columns are added in place (never a rebuild) so verified history survives,
 * then existing rows are back-filled from the component registry and stamped
 * with the provenance of that position.
 */
const DAMAGE_GEOMETRY_COLUMNS: [string, string][] = [
  ["component_id", "TEXT"],
  ["damage_type", "TEXT"],
  ["local_x", "REAL"],
  ["local_y", "REAL"],
  ["local_z", "REAL"],
  ["position_source", "TEXT"],
];

function ensureDamageGeometry(conn: DatabaseSync) {
  const cols = all<{ name: string }>("PRAGMA table_info(damage_records)");
  const have = new Set(cols.map((c) => c.name));
  for (const [name, type] of DAMAGE_GEOMETRY_COLUMNS) {
    if (!have.has(name)) conn.exec(`ALTER TABLE damage_records ADD COLUMN ${name} ${type}`);
  }

  const rows = all<{ id: string; zone_id: string; component_id: string | null; local_x: number | null }>(
    "SELECT id, zone_id, component_id, local_x FROM damage_records"
  );
  const upd = conn.prepare(
    "UPDATE damage_records SET component_id = ?, local_x = ?, local_y = ?, local_z = ?, position_source = ? WHERE id = ?"
  );
  let backfilled = 0;
  for (const r of rows) {
    const comp = getComponentById(mapZoneToComponentId(r.zone_id || ""));
    if (!comp) continue;
    if (r.component_id && r.local_x !== null) continue;
    const [x, y, z] = comp.defaultHotspotAnchor;
    upd.run(comp.id, x, y, z, comp.available ? "measured_component_anchor" : "unmapped_component", r.id);
    backfilled += 1;
  }
  conn.exec("CREATE INDEX IF NOT EXISTS idx_damage_component ON damage_records(vehicle_id, component_id)");
  if (backfilled) g.__tdDamageBackfill = backfilled;
}

export function getDb(): DatabaseSync {
  if (g.__tdDb) return g.__tdDb;
  // TD_DB_FILE lets a container/Render disk own the database path. The default
  // stays `.data/trustdrive.db` for local development.
  const rawDb = process.env.TD_DB_FILE || ".data/trustdrive.db";
  let dbFile = path.resolve(rawDb);
  if (!fs.existsSync(dbFile) && fs.existsSync(path.resolve("..", rawDb))) {
    dbFile = path.resolve("..", rawDb);
  }
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const conn = new DatabaseSync(dbFile);
  // foreign_keys is a per-connection pragma, and migrate() short-circuits once
  // user_version matches — so it must be asserted on every open, not only on the
  // build that created the schema.
  conn.exec("PRAGMA foreign_keys = ON;");
  conn.exec("PRAGMA journal_mode = WAL;");
  conn.exec("PRAGMA busy_timeout = 5000;");
  migrate(conn);
  ensurePublicTables(conn);
  ensureIntelligenceTables(conn);
  ensureBackendTables(conn);
  ensureSoftDeleteColumns(conn);
  ensureEntityAliases(conn);
  seed(conn);
  seedDemoPhotos(conn);
  g.__tdFkReport = upgradeCoreForeignKeys(conn, dbFile);
  // Mark the schema only after a successful seed so a failed seed is retried.
  conn.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  g.__tdDb = conn;
  return conn;
}

/** Result of the last foreign-key upgrade, for diagnostics and tests. */
export function getSchemaUpgradeReport() {
  return (globalThis as { __tdFkReport?: unknown }).__tdFkReport;
}

// ---- Generic helpers ------------------------------------------------------
// node:sqlite returns null-prototype objects; round-trip through JSON so rows
// can cross the Server -> Client Component boundary.
function plain<T>(v: T): T {
  return v === undefined || v === null ? v : (JSON.parse(JSON.stringify(v)) as T);
}
export function all<T>(sql: string, ...params: (string | number | null)[]): T[] {
  return plain(getDb().prepare(sql).all(...params) as T[]);
}
export function one<T>(sql: string, ...params: (string | number | null)[]): T | undefined {
  return plain(getDb().prepare(sql).get(...params) as T | undefined);
}
export function run(sql: string, ...params: (string | number | null)[]): void {
  getDb().prepare(sql).run(...params);
}

// ---- Users ----------------------------------------------------------------
export function getUserByEmail(email: string): UserRow | undefined {
  return one<UserRow>("SELECT * FROM users WHERE lower(email) = lower(?) AND deleted_at IS NULL", email);
}
export function getUsersByRole(role: string): UserRow[] {
  return all<UserRow>("SELECT * FROM users WHERE role = ? AND deleted_at IS NULL ORDER BY created_at DESC", role);
}
export function getUserById(id: string): UserRow | undefined {
  return one<UserRow>("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL", id);
}
export function createUser(u: {
  id: string; name: string; role: string; email: string; password_hash: string; initials: string;
}) {
  run(
    "INSERT INTO users(id,name,role,email,password_hash,initials,phone,city,seller_type,business_name,kyc_status,preferences,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    u.id, u.name, u.role, u.email, u.password_hash, u.initials, "", "", null, null, "not_started", "{}", new Date().toISOString()
  );
}
export function updateUser(id: string, fields: Partial<UserRow>) {
  const allowed = ["name", "phone", "city", "seller_type", "business_name", "kyc_status", "preferences", "avatar_url", "email_verified", "twofa_enabled", "kyc_doc_key", "last_login_at"];
  const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (!entries.length) return;
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  run(`UPDATE users SET ${sets} WHERE id = ?`, ...entries.map(([, v]) => v as string | number | null), id);
}
export function updatePassword(id: string, hash: string) {
  run("UPDATE users SET password_hash = ? WHERE id = ?", hash, id);
}

// ---- Vehicles -------------------------------------------------------------
export function getVehicle(id: string): VehicleRow | undefined {
  return one<VehicleRow>("SELECT * FROM vehicles WHERE id = ?", id);
}
export function getVehicleByReg(reg: string): VehicleRow | undefined {
  return one<VehicleRow>("SELECT * FROM vehicles WHERE replace(replace(upper(reg_no),' ',''),'-','') = ?", reg.toUpperCase().replace(/[\s-]/g, ""));
}
export function getVehicleByVin(vin: string): VehicleRow | undefined {
  return one<VehicleRow>("SELECT * FROM vehicles WHERE upper(vin) = ?", vin.toUpperCase());
}
export function getVehicleByTrustDriveId(tdid: string): VehicleRow | undefined {
  return one<VehicleRow>("SELECT * FROM vehicles WHERE upper(trustdrive_id) = ?", tdid.toUpperCase());
}
export function getVehiclesByOwner(ownerId: string): VehicleRow[] {
  return all<VehicleRow>("SELECT * FROM vehicles WHERE owner_id = ? ORDER BY updated_at DESC", ownerId);
}
export function getAllVehicles(): VehicleRow[] {
  return all<VehicleRow>("SELECT * FROM vehicles ORDER BY updated_at DESC");
}
export function createVehicle(v: VehicleRow) {
  run(
    `INSERT INTO vehicles VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    v.id, v.owner_id, v.make, v.model, v.variant, v.year, v.reg_no, v.vin, v.fuel, v.transmission,
    v.category, v.color, v.ownership_count, v.location, v.km_claimed, v.last_verified_km, v.asking_price,
    v.status, v.base_value, v.condition_score, v.trustdrive_id, v.qr_token, v.description, v.condition,
    v.created_at, v.updated_at
  );
}
export function updateVehicle(id: string, fields: Partial<VehicleRow>) {
  const allowed = [
    "make", "model", "variant", "year", "reg_no", "vin", "fuel", "transmission", "category", "color",
    "ownership_count", "location", "km_claimed", "last_verified_km", "asking_price", "status", "base_value",
    "condition_score", "description", "condition",
  ];
  const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (!entries.length) return;
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  run(`UPDATE vehicles SET ${sets}, updated_at = ? WHERE id = ?`, ...entries.map(([, v]) => v as string | number | null), new Date().toISOString(), id);
}
export function deleteVehicle(id: string) {
  run("DELETE FROM vehicles WHERE id = ?", id);
}

/** Soft delete: the row and its evidence remain, but it is hidden from reads. */
export function softDeleteUser(id: string) {
  const now = new Date().toISOString();
  run("UPDATE users SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL", now, id);
  run("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", now, id);
}
export function softDeleteDocument(id: string) {
  run("UPDATE documents SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL",
      new Date().toISOString(), id);
}

// ---- Documents ------------------------------------------------------------
export function getDocuments(vehicleId: string): DocumentRow[] {
  return all<DocumentRow>("SELECT * FROM documents WHERE vehicle_id = ? AND deleted_at IS NULL ORDER BY uploaded_at DESC", vehicleId);
}
export function getDocument(id: string): DocumentRow | undefined {
  return one<DocumentRow>("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL", id);
}
export function getDocumentByFileKey(fileKey: string): DocumentRow | undefined {
  return one<DocumentRow>("SELECT * FROM documents WHERE file_key = ? AND deleted_at IS NULL ORDER BY uploaded_at DESC LIMIT 1", fileKey);
}
export function createDocument(d: DocumentRow) {
  run("INSERT INTO documents (id, vehicle_id, type, file_name, mime, size_bytes, status, status_reason, sha256, consent, version, supersedes_id, extracted, verified_at, uploaded_at, file_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    d.id, d.vehicle_id, d.type, d.file_name, d.mime, d.size_bytes, d.status, d.status_reason,
    d.sha256, d.consent, d.version, d.supersedes_id, d.extracted, d.verified_at, d.uploaded_at, d.file_key);
}
export function updateDocument(id: string, fields: Partial<DocumentRow>) {
  const allowed = ["status", "status_reason", "consent", "version", "supersedes_id", "extracted", "verified_at", "file_name"];
  const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (!entries.length) return;
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  run(`UPDATE documents SET ${sets} WHERE id = ?`, ...entries.map(([, v]) => v as string | number | null), id);
}
export function getDuplicateDocumentCount(sha256: string): number {
  const r = one<{ c: number }>("SELECT COUNT(*) AS c FROM documents WHERE sha256 = ?", sha256);
  return r?.c ?? 0;
}

// ---- Findings -------------------------------------------------------------
export function getFindings(vehicleId: string): FindingRow[] {
  return all<FindingRow>(
    "SELECT * FROM findings WHERE vehicle_id = ? ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, created_at DESC",
    vehicleId
  );
}
export function getFinding(id: string): FindingRow | undefined {
  return one<FindingRow>("SELECT * FROM findings WHERE id = ?", id);
}
export function createFinding(f: FindingRow) {
  run("INSERT INTO findings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    f.id, f.vehicle_id, f.rule_key, f.code, f.severity, f.title, f.explanation, f.recommendation,
    f.evidence, f.responsible_doc, f.points, f.status, f.created_at);
}
export function updateFinding(id: string, fields: Partial<FindingRow>) {
  const allowed = ["status", "explanation", "recommendation"];
  const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (!entries.length) return;
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  run(`UPDATE findings SET ${sets} WHERE id = ?`, ...entries.map(([, v]) => v as string | null), id);
}

// ---- Mileage --------------------------------------------------------------
export function getMileage(vehicleId: string): MileageRow[] {
  return all<MileageRow>("SELECT * FROM mileage_readings WHERE vehicle_id = ? ORDER BY date ASC", vehicleId);
}
export function createMileage(m: MileageRow) {
  run("INSERT INTO mileage_readings VALUES (?,?,?,?,?,?,?,?,?,?)",
    m.id, m.vehicle_id, m.year, m.km, m.source, m.date, m.flagged, m.verified, m.is_seller_claim, m.document_id);
}
export function flagMileage(vehicleId: string, date: string) {
  run("UPDATE mileage_readings SET flagged = 1, verified = 0 WHERE vehicle_id = ? AND date = ?", vehicleId, date);
}

// ---- Pricing --------------------------------------------------------------
export function getPricing(vehicleId: string): PricingRow | undefined {
  return one<PricingRow>("SELECT * FROM pricing WHERE vehicle_id = ?", vehicleId);
}
export function upsertPricing(p: PricingRow) {
  run("INSERT OR REPLACE INTO pricing VALUES (?,?,?,?,?,?,?,?)",
    p.vehicle_id, p.low, p.estimate, p.high, p.confidence, p.comparables, p.method, p.computed_at);
}

// ---- Listings -------------------------------------------------------------
export function getListingByVehicle(vehicleId: string): ListingRow | undefined {
  return one<ListingRow>("SELECT * FROM listings WHERE vehicle_id = ?", vehicleId);
}
export function getListing(id: string): ListingRow | undefined {
  return one<ListingRow>("SELECT * FROM listings WHERE id = ?", id);
}
export function getAllListings(): ListingRow[] {
  return all<ListingRow>("SELECT * FROM listings ORDER BY updated_at DESC");
}
export function createListing(l: ListingRow) {
  run("INSERT INTO listings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    l.id, l.vehicle_id, l.status, l.headline, l.description, l.condition, l.location, l.views,
    l.saves, l.inquiries, l.cover_image, l.published_at, l.created_at, l.updated_at);
}
export function updateListing(id: string, fields: Partial<ListingRow>) {
  const allowed = ["status", "headline", "description", "condition", "location", "views", "saves", "inquiries", "cover_image", "published_at"];
  const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (!entries.length) return;
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  run(`UPDATE listings SET ${sets}, updated_at = ? WHERE id = ?`, ...entries.map(([, v]) => v as string | number | null), new Date().toISOString(), id);
}
export function getListingImages(listingId: string) {
  return all<{ id: string; listing_id: string; file_key: string; position: number; kind: string }>(
    "SELECT * FROM listing_images WHERE listing_id = ? ORDER BY position ASC", listingId
  );
}
export function createListingImage(id: string, listingId: string, fileKey: string, position: number) {
  run("INSERT INTO listing_images VALUES (?,?,?,?,?)", id, listingId, fileKey, position, "photo");
}
export function updateListingImage(id: string, fields: { position?: number; file_key?: string }) {
  if (fields.position !== undefined) run("UPDATE listing_images SET position = ? WHERE id = ?", fields.position, id);
  if (fields.file_key !== undefined) run("UPDATE listing_images SET file_key = ? WHERE id = ?", fields.file_key, id);
}
export function deleteListingImage(id: string) {
  run("DELETE FROM listing_images WHERE id = ?", id);
}
export function getListingImage(id: string) {
  return one<{ id: string; listing_id: string; file_key: string; position: number; kind: string }>(
    "SELECT * FROM listing_images WHERE id = ?", id
  );
}
export function trackListingEvent(id: string, listingId: string, type: string, actorId: string | null) {
  run("INSERT INTO listing_events VALUES (?,?,?,?,?)", id, listingId, type, actorId, new Date().toISOString());
}
export function getListingEvents(listingId: string) {
  return all<{ id: string; listing_id: string; type: string; actor_id: string | null; at: string }>(
    "SELECT * FROM listing_events WHERE listing_id = ? ORDER BY at DESC", listingId
  );
}

// ---- Inquiries ------------------------------------------------------------
export function getInquiriesBySeller(sellerId: string): InquiryRow[] {
  return all<InquiryRow>("SELECT * FROM inquiries WHERE seller_id = ? ORDER BY last_activity_at DESC", sellerId);
}
export function getInquiriesByBuyer(buyerId: string): InquiryRow[] {
  return all<InquiryRow>("SELECT * FROM inquiries WHERE buyer_id = ? ORDER BY last_activity_at DESC", buyerId);
}
export function getInquiries(listingId: string): InquiryRow[] {
  return all<InquiryRow>("SELECT * FROM inquiries WHERE listing_id = ? ORDER BY last_activity_at DESC", listingId);
}
export function getInquiry(id: string): InquiryRow | undefined {
  return one<InquiryRow>("SELECT * FROM inquiries WHERE id = ?", id);
}
export function createInquiry(q: InquiryRow) {
  run("INSERT INTO inquiries VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    q.id, q.listing_id, q.buyer_id, q.seller_id, q.buyer_name, q.initials, q.message, q.type,
    q.status, q.created_at, q.last_activity_at);
}
export function updateInquiry(id: string, fields: Partial<InquiryRow>) {
  const allowed = ["status", "last_activity_at", "message"];
  const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (!entries.length) return;
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  run(`UPDATE inquiries SET ${sets} WHERE id = ?`, ...entries.map(([, v]) => v as string | null), id);
}
export function getMessages(inquiryId: string): MessageRow[] {
  return all<MessageRow>("SELECT * FROM inquiry_messages WHERE inquiry_id = ? ORDER BY created_at ASC", inquiryId);
}
export function createMessage(m: MessageRow) {
  run("INSERT INTO inquiry_messages VALUES (?,?,?,?,?,?,?,?,?)",
    m.id, m.inquiry_id, m.sender_id, m.sender_name, m.body, m.offer_amount, m.scheduled_at, m.attachments, m.created_at);
}

// ---- Saved ----------------------------------------------------------------
export function getSavedRows(buyerId: string): SavedRow[] {
  return all<SavedRow>("SELECT * FROM saved_vehicles WHERE buyer_id = ? ORDER BY created_at DESC", buyerId);
}
export function getSavedRow(buyerId: string, listingId: string): SavedRow | undefined {
  return one<SavedRow>("SELECT * FROM saved_vehicles WHERE buyer_id = ? AND listing_id = ?", buyerId, listingId);
}
export function createSaved(s: SavedRow) {
  run("INSERT INTO saved_vehicles VALUES (?,?,?,?,?,?)", s.id, s.buyer_id, s.listing_id, s.price_at_save, s.list_name, s.created_at);
}
export function deleteSaved(buyerId: string, listingId: string) {
  run("DELETE FROM saved_vehicles WHERE buyer_id = ? AND listing_id = ?", buyerId, listingId);
}
export function getSavedSearches(buyerId: string): SavedSearchRow[] {
  return all<SavedSearchRow>("SELECT * FROM saved_searches WHERE buyer_id = ? ORDER BY created_at DESC", buyerId);
}
export function createSavedSearch(s: SavedSearchRow) {
  run("INSERT INTO saved_searches VALUES (?,?,?,?,?,?)", s.id, s.buyer_id, s.name, s.filters, s.alerts_enabled, s.created_at);
}
export function deleteSavedSearch(buyerId: string, id: string) {
  run("DELETE FROM saved_searches WHERE id = ? AND buyer_id = ?", id, buyerId);
}

// ---- Notifications --------------------------------------------------------
export function getNotifications(userId: string): NotificationRow[] {
  return all<NotificationRow>("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC", userId);
}
export function getNotificationsPage(userId: string, limit = 20, before?: string | null): NotificationRow[] {
  if (before) {
    return all<NotificationRow>(
      "SELECT * FROM notifications WHERE user_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?",
      userId, before, limit
    );
  }
  return all<NotificationRow>(
    "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", userId, limit
  );
}
export function getUnreadCount(userId: string): number {
  const r = one<{ c: number }>("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0", userId);
  return r?.c ?? 0;
}
export function createNotification(n: NotificationRow) {
  run("INSERT INTO notifications VALUES (?,?,?,?,?,?,?,?)", n.id, n.user_id, n.type, n.title, n.body, n.data, n.read, n.created_at);
}
/** Offset pagination (page/pageSize) to match the audit/marketplace contract. */
export function getNotificationsOffsetPage(userId: string, limit: number, offset: number, unreadOnly = false): NotificationRow[] {
  const filter = unreadOnly ? "AND read = 0" : "";
  return all<NotificationRow>(
    `SELECT * FROM notifications WHERE user_id = ? ${filter} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    userId, limit, offset
  );
}
export function countNotifications(userId: string, unreadOnly = false): number {
  const filter = unreadOnly ? "AND read = 0" : "";
  const r = one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? ${filter}`, userId
  );
  return r?.c ?? 0;
}
export function markNotificationRead(userId: string, id: string) {
  run("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?", id, userId);
}
export function markAllNotificationsRead(userId: string) {
  run("UPDATE notifications SET read = 1 WHERE user_id = ?", userId);
}

// ---- Activity -------------------------------------------------------------
export function getActivity(userId: string) {
  return one<{ explored: number; saved: number; recently_viewed: number; pending_reports: number }>(
    "SELECT * FROM activity WHERE user_id = ?", userId
  );
}
export function bumpActivity(userId: string, field: "explored" | "recently_viewed" | "saved") {
  run(`UPDATE activity SET ${field} = ${field} + 1 WHERE user_id = ?`, userId);
}

// ---- History / damage / chain --------------------------------------------
export function getHistory(vehicleId: string): HistoryRow[] {
  return all<HistoryRow>("SELECT * FROM history_events WHERE vehicle_id = ? ORDER BY event_date ASC", vehicleId);
}
export function getHistoryEvent(id: string): HistoryRow | undefined {
  return one<HistoryRow>("SELECT * FROM history_events WHERE id = ?", id);
}
export function createHistoryEvent(h: HistoryRow) {
  run("INSERT INTO history_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    h.id, h.vehicle_id, h.category, h.event_date, h.mileage_km, h.title, h.description, h.source,
    h.evidence_document_id, h.status, h.supersedes_id, h.created_by, h.created_at);
}
export function getDamage(vehicleId: string): DamageRow[] {
  return all<DamageRow>("SELECT * FROM damage_records WHERE vehicle_id = ? ORDER BY created_at DESC", vehicleId);
}
export function getDamageRecord(id: string): DamageRow | undefined {
  return one<DamageRow>("SELECT * FROM damage_records WHERE id = ?", id);
}
export function createDamage(d: DamageRow) {
  run("INSERT INTO damage_records VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    d.id, d.vehicle_id, d.zone_id, d.description, d.severity, d.repair_status, d.repair_details,
    d.inspection_date, d.status, d.photo_keys, d.repair_invoice_doc_id, d.supersedes_id, d.created_by, d.created_at);
}
export function getChain(vehicleId: string) {
  return all<{ seq: number; entity_type: string; entity_id: string; payload: string; prev_hash: string; record_hash: string; created_at: string }>(
    "SELECT * FROM chain_records WHERE vehicle_id = ? ORDER BY seq ASC", vehicleId
  );
}
export function appendChainRecord(vehicleId: string, entityType: string, entityId: string, payload: unknown) {
  const rows = getChain(vehicleId);
  const prev = rows.length ? rows[rows.length - 1].record_hash : "0".repeat(64);
  const seq = rows.length + 1;
  const hash = recordHash(payload, prev);
  run("INSERT INTO chain_records VALUES (?,?,?,?,?,?,?,?)",
    vehicleId, seq, entityType, entityId, JSON.stringify(payload), prev, hash, new Date().toISOString());
}

// ---- Verification runs / results -----------------------------------------
export function getLatestRun(vehicleId: string): RunRow | undefined {
  return one<RunRow>("SELECT * FROM verification_runs WHERE vehicle_id = ? ORDER BY started_at DESC LIMIT 1", vehicleId);
}
export function getRun(id: string): RunRow | undefined {
  return one<RunRow>("SELECT * FROM verification_runs WHERE id = ?", id);
}
export function createRun(r: RunRow) {
  run("INSERT INTO verification_runs VALUES (?,?,?,?,?,?)", r.id, r.vehicle_id, r.status, r.started_at, r.finished_at, r.summary);
}
export function finishRun(id: string, summary: unknown) {
  run("UPDATE verification_runs SET status = 'done', finished_at = ?, summary = ? WHERE id = ?",
    new Date().toISOString(), JSON.stringify(summary), id);
}
export function getResults(runId: string) {
  return all<{ id: string; run_id: string; vehicle_id: string; check_key: string; status: string; details: string; evidence_ids: string }>(
    "SELECT * FROM verification_results WHERE run_id = ?", runId
  );
}
export function createResult(r: { id: string; run_id: string; vehicle_id: string; check_key: string; status: string; details: string; evidence_ids: string }) {
  run("INSERT INTO verification_results VALUES (?,?,?,?,?,?,?)", r.id, r.run_id, r.vehicle_id, r.check_key, r.status, r.details, r.evidence_ids);
}

// ---- Theft / reports / disputes / audit ----------------------------------
export function getTheft(vehicleId: string) {
  return one<{ vehicle_id: string; status: string; source: string; checked_at: string; details: string }>(
    "SELECT * FROM theft_checks WHERE vehicle_id = ?", vehicleId
  );
}
export function getReportsByUser(userId: string): ReportRow[] {
  return all<ReportRow>("SELECT * FROM reports WHERE requested_by = ? ORDER BY created_at DESC", userId);
}
export function getReport(id: string): ReportRow | undefined {
  return one<ReportRow>("SELECT * FROM reports WHERE id = ?", id);
}
export function createReport(r: ReportRow) {
  run("INSERT INTO reports VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    r.id, r.vehicle_id, r.requested_by, r.type, r.status, r.file_key, r.report_id, r.generated_at,
    r.created_at, r.pdf_hash, r.snapshot, r.version);
}
export function updateReport(id: string, fields: Partial<ReportRow>) {
  const allowed = ["status", "file_key", "generated_at", "pdf_hash", "snapshot", "version"];
  const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (!entries.length) return;
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  run(`UPDATE reports SET ${sets} WHERE id = ?`, ...entries.map(([, v]) => v as string | number | null), id);
}
export function getReportsByVehicle(vehicleId: string): ReportRow[] {
  return all<ReportRow>("SELECT * FROM reports WHERE vehicle_id = ? ORDER BY created_at DESC", vehicleId);
}
export function getDisputes(): DisputeRow[] {
  return all<DisputeRow>("SELECT * FROM disputes ORDER BY created_at DESC");
}
export function getDispute(id: string): DisputeRow | undefined {
  return one<DisputeRow>("SELECT * FROM disputes WHERE id = ?", id);
}
export function getDisputeByFinding(findingId: string): DisputeRow | undefined {
  return one<DisputeRow>("SELECT * FROM disputes WHERE finding_id = ? ORDER BY created_at DESC LIMIT 1", findingId);
}
export function createDispute(d: DisputeRow) {
  run("INSERT INTO disputes VALUES (?,?,?,?,?,?,?,?,?)",
    d.id, d.finding_id, d.seller_id, d.explanation, d.evidence_doc_ids, d.status, d.reviewed_by, d.review_note, d.created_at);
}
export function updateDispute(id: string, fields: Partial<DisputeRow>) {
  const allowed = ["status", "reviewed_by", "review_note"];
  const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (!entries.length) return;
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  run(`UPDATE disputes SET ${sets} WHERE id = ?`, ...entries.map(([, v]) => v as string | null), id);
}
export function createAudit(a: AuditRow) {
  run("INSERT INTO audit_logs VALUES (?,?,?,?,?,?,?,?,?,?)",
    a.id, a.actor_id, a.action, a.entity_type, a.entity_id, a.before, a.after, a.ip, a.user_agent, a.at);
}
export function getAudit(limit = 50): AuditRow[] {
  return all<AuditRow>("SELECT * FROM audit_logs ORDER BY at DESC LIMIT ?", limit);
}
export function getQrToken(token: string) {
  return one<{ jti: string; vehicle_id: string; token: string; revoked_at: string | null; created_by: string; created_at: string }>(
    "SELECT * FROM qr_tokens WHERE token = ?", token
  );
}
export function getQrTokensForVehicle(vehicleId: string) {
  return all<{ jti: string; vehicle_id: string; token: string; revoked_at: string | null; created_by: string; created_at: string }>(
    "SELECT * FROM qr_tokens WHERE vehicle_id = ? ORDER BY created_at DESC", vehicleId
  );
}
export function createQrToken(jti: string, vehicleId: string, token: string, createdBy: string) {
  run("INSERT INTO qr_tokens VALUES (?,?,?,?,?,?)", jti, vehicleId, token, null, createdBy, new Date().toISOString());
}
export function revokeQrTokens(vehicleId: string) {
  run("UPDATE qr_tokens SET revoked_at = ? WHERE vehicle_id = ? AND revoked_at IS NULL", new Date().toISOString(), vehicleId);
}

// ---- Recommended ----------------------------------------------------------
export function getRecommendedVehicles(): VehicleRow[] {
  return all<VehicleRow>("SELECT * FROM vehicles WHERE id IN ('v-bmw','v-audi','v-merc')");
}
export function getPublishedListings(): ListingRow[] {
  return all<ListingRow>("SELECT * FROM listings WHERE status = 'published' ORDER BY published_at DESC");
}

// ---- Auth tokens, sessions, rate limits, report access --------------------
export function createAuthToken(t: AuthTokenRow) {
  run("INSERT INTO auth_tokens VALUES (?,?,?,?,?,?,?)",
    t.id, t.user_id, t.type, t.token_hash, t.expires_at, t.used_at, t.created_at);
}
export function getAuthTokenByHash(tokenHash: string): AuthTokenRow | undefined {
  return one<AuthTokenRow>("SELECT * FROM auth_tokens WHERE token_hash = ?", tokenHash);
}
export function consumeAuthToken(id: string) {
  run("UPDATE auth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL", new Date().toISOString(), id);
}
export function invalidateAuthTokens(userId: string, type: string) {
  run("UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND type = ? AND used_at IS NULL", new Date().toISOString(), userId, type);
}

export function createSession(s: SessionRow) {
  run("INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?)",
    s.id, s.user_id, s.refresh_hash, s.user_agent, s.ip, s.created_at, s.last_seen_at, s.revoked_at);
}
export function getSession(id: string): SessionRow | undefined {
  return one<SessionRow>("SELECT * FROM sessions WHERE id = ?", id);
}
export function getSessionByRefresh(hash: string): SessionRow | undefined {
  return one<SessionRow>("SELECT * FROM sessions WHERE refresh_hash = ?", hash);
}
export function getUserSessions(userId: string): SessionRow[] {
  return all<SessionRow>("SELECT * FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC", userId);
}
export function touchSession(id: string) {
  run("UPDATE sessions SET last_seen_at = ? WHERE id = ?", new Date().toISOString(), id);
}
export function revokeSession(id: string, userId: string) {
  run("UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ?", new Date().toISOString(), id, userId);
}
export function revokeAllSessions(userId: string) {
  run("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", new Date().toISOString(), userId);
}

export function getLoginAttempts(key: string) {
  return one<{ key: string; attempts: number; locked_until: string | null; updated_at: string }>(
    "SELECT * FROM login_attempts WHERE key = ?", key
  );
}
export function recordLoginFailure(key: string, lockedUntil: string | null) {
  const now = new Date().toISOString();
  const existing = getLoginAttempts(key);
  const attempts = (existing?.attempts ?? 0) + 1;
  if (existing) {
    run("UPDATE login_attempts SET attempts = ?, locked_until = ?, updated_at = ? WHERE key = ?", attempts, lockedUntil, now, key);
  } else {
    run("INSERT INTO login_attempts VALUES (?,?,?,?)", key, attempts, lockedUntil, now);
  }
  return attempts;
}
export function clearLoginAttempts(key: string) {
  run("DELETE FROM login_attempts WHERE key = ?", key);
}

export function createReportAccess(a: { id: string; report_id: string; token_hash: string; expires_at: string; created_at: string }) {
  run("INSERT INTO report_access VALUES (?,?,?,?,?,?)", a.id, a.report_id, a.token_hash, a.expires_at, a.created_at, null);
}
export function getReportAccessByHash(hash: string) {
  return one<{ id: string; report_id: string; token_hash: string; expires_at: string; created_at: string; used_at: string | null }>(
    "SELECT * FROM report_access WHERE token_hash = ?", hash
  );
}
export function useReportAccess(id: string) {
  run("UPDATE report_access SET used_at = ? WHERE id = ?", new Date().toISOString(), id);
}

// ---- Public site ----------------------------------------------------------
export function createContactMessage(input: {
  name: string; email: string; phone?: string; subject?: string; message: string; ip?: string;
}) {
  const id = `cm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  run(
    "INSERT INTO contact_messages (id, name, email, phone, subject, message, ip, created_at) VALUES (?,?,?,?,?,?,?,?)",
    id,
    input.name,
    input.email,
    input.phone ?? "",
    input.subject ?? "General Inquiry",
    input.message,
    input.ip ?? null,
    new Date().toISOString()
  );
  return id;
}

export function subscribeNewsletter(email: string) {
  run(
    "INSERT INTO newsletter_subscribers (email, created_at) VALUES (?, ?) ON CONFLICT(email) DO NOTHING",
    email.trim().toLowerCase(),
    new Date().toISOString()
  );
}

export function getContactMessageCount() {
  return (one<{ c: number }>("SELECT COUNT(*) AS c FROM contact_messages")?.c ?? 0);
}
