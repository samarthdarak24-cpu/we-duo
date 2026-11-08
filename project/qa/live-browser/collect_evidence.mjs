// Build a single evidence summary for the reports from the live-proof result
// file plus the shared SQLite database. Read-only.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DB = path.join(ROOT, ".data", "trustdrive.db");
const resultsFile = path.join(__dirname, "six_features_results.json");

if (!fs.existsSync(resultsFile)) {
  console.error("six_features_results.json is missing — run prove_six.mjs first.");
  process.exit(1);
}
const results = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
const db = new DatabaseSync(DB, { readOnly: true });
const all = (q, ...p) => db.prepare(q).all(...p);
const one = (q, ...p) => db.prepare(q).get(...p) ?? null;

const { vehicleId, listingId } = results;
const doc = one("SELECT * FROM documents WHERE vehicle_id = ? ORDER BY uploaded_at ASC LIMIT 1", vehicleId);
let extracted = {};
try { extracted = JSON.parse(doc?.extracted || "{}"); } catch { /* keep */ }
const inquiry = one("SELECT * FROM inquiries WHERE listing_id = ? ORDER BY created_at DESC LIMIT 1", listingId);
const messages = inquiry ? all("SELECT * FROM inquiry_messages WHERE inquiry_id = ? ORDER BY created_at ASC", inquiry.id) : [];
const report = one("SELECT * FROM reports WHERE vehicle_id = ? ORDER BY created_at DESC LIMIT 1", vehicleId);
const damage = one("SELECT * FROM damage_records WHERE vehicle_id = ? ORDER BY created_at DESC LIMIT 1", vehicleId);
const run = one("SELECT * FROM ai_runs WHERE vehicle_id = ? ORDER BY started_at DESC LIMIT 1", vehicleId);
const finding = one("SELECT * FROM findings WHERE vehicle_id = ? AND code = 'ODOMETER_ROLLBACK' ORDER BY created_at DESC LIMIT 1", vehicleId);
const listing = listingId ? one("SELECT * FROM listings WHERE id = ?", listingId) : null;
const photos = listingId ? all("SELECT * FROM listing_images WHERE listing_id = ? ORDER BY position", listingId) : [];
const extractions = doc ? all("SELECT * FROM document_extractions WHERE document_id = ?", doc.id) : [];

const tables = all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => r.name);
const counts = {};
for (const t of tables) counts[t] = one(`SELECT COUNT(*) AS n FROM "${t}"`).n;

const shots = fs.readdirSync(path.join(__dirname, "shots-six"));

const summary = {
  generatedAt: new Date().toISOString(),
  run: {
    runId: results.runId,
    base: results.base,
    vehicleId,
    regNo: results.regNo,
    vin: results.vin,
    listingId,
    features: results.features?.map((f) => ({ feature: f.feature, status: f.status, total: f.total, failed: f.failed })),
  },
  db: {
    file: DB,
    tables: tables.length,
    schemaVersion: one("PRAGMA user_version").user_version,
    counts,
    vehicle: one("SELECT * FROM vehicles WHERE id = ?", vehicleId),
    listing,
    photos: photos.length,
    document: doc ? {
      id: doc.id, type: doc.type, status: doc.status, status_reason: doc.status_reason,
      sha256: doc.sha256, verified_at: doc.verified_at, extracted, extractionRows: extractions.length,
    } : null,
    damage,
    finding,
    aiRun: run ? { id: run.id, status: run.status, graph: run.graph, modelVersion: run.model_version, rulesetVersion: run.ruleset_version, outputRefs: run.output_refs, startedAt: run.started_at, finishedAt: run.finished_at } : null,
    inquiry,
    messages,
    report,
  },
  screenshots: shots,
  consoleErrors: results.consoleErrors ?? [],
};

fs.writeFileSync(path.join(__dirname, "evidence_summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({
  run: summary.run,
  tables: summary.db.tables,
  schemaVersion: summary.db.schemaVersion,
  document: summary.db.document && { status: summary.db.document.status, engine: summary.db.document.extracted?.engine, confidence: summary.db.document.extracted?.confidence, rows: summary.db.document.extractionRows },
  damage: summary.db.damage && { id: summary.db.damage.id, zone: summary.db.damage.zone_id },
  ai: summary.db.aiRun && { graph: summary.db.aiRun.graph, status: summary.db.aiRun.status },
  inquiry: summary.db.inquiry && { id: summary.db.inquiry.id, status: summary.db.inquiry.status, messages: summary.db.messages.length },
  report: summary.db.report && { id: summary.db.report.id, status: summary.db.report.status, file: summary.db.report.file_key },
  photos: summary.db.photos,
  screenshots: summary.screenshots.length,
}, null, 2));
