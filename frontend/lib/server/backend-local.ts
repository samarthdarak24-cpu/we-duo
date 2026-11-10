// ---------------------------------------------------------------------------
// Local, DB-backed fallback for the Next.js -> Python proxy routes.
//
// The Python intelligence service is additive. Some deployments (for example
// the single-port published app) run the Next.js runtime only, where
// TD_INTELLIGENCE_URL is empty. Previously every proxied feature then returned
// a bare 502 "Backend unreachable" and the UI looked broken.
//
// This adapter performs the SAME real operations against the SAME shared
// SQLite database, so writes persist after a refresh. It never invents a
// result: OCR/image detection that genuinely needs a vision engine returns a
// structured 409 {available:false, reason} which the UI already understands,
// and every payload names `engine: "nextjs-local-db"`. A fallback is never
// presented as a Python result.
// ---------------------------------------------------------------------------
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { verifyToken } from "./auth";
import { all, one, run } from "./db";
import { recordDocumentExtractions } from "./evidence";
import { getMailerStatus, getSmsStatus } from "./mailer";
import { storageProvider } from "./files";

export const LOCAL_ENGINE = "nextjs-local-db";

export interface LocalFallback {
  status: number;
  body: unknown;
}

type Row = Record<string, unknown>;

function actorOf(token: string): { id: string; role: string } | null {
  const payload = verifyToken(token);
  if (!payload) return null;
  return { id: String(payload.sub), role: String(payload.role) };
}

function owns(vehicleId: string, actor: { id: string; role: string }): boolean {
  const v = one<Row>("SELECT * FROM vehicles WHERE id = ?", vehicleId);
  if (!v) return false;
  return actor.role === "admin" || String(v.owner_id) === actor.id;
}

function unavailable(reason: string): LocalFallback {
  return {
    status: 409,
    body: { available: false, reason, engine: LOCAL_ENGINE, is_ocr: false },
  };
}

function notFound(what: string): LocalFallback {
  return { status: 404, body: { error: `${what} not found.`, engine: LOCAL_ENGINE } };
}

function modelMeta(): Row {
  const candidates = [
    process.env.TD_MODEL_DIR && join(process.env.TD_MODEL_DIR, "mileage_xgb.meta.json"),
    join(process.cwd(), "..", "services", "ai", "shared", "models", "mileage_xgb.meta.json"),
    join(process.cwd(), "services", "ai", "shared", "models", "mileage_xgb.meta.json"),
  ].filter(Boolean) as string[];
  for (const file of candidates) {
    try {
      if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Row;
    } catch { /* unreadable metadata stays honestly absent */ }
  }
  return {};
}

/** Mirror the four Python capability reports using live local configuration. */
function statusReport(pathname: string): LocalFallback | null {
  if (pathname === "/api/v1/ai/fraud/model-status") {
    const meta = modelMeta();
    return { status: 200, body: {
      name: "mileage_xgb",
      version: meta.version ?? "0.0.0",
      mode: "experimental",
      training_data: "synthetic-demo",
      metrics: meta.metrics ?? null,
      features: meta.features ?? [],
      available: false,
      weights_file: null,
      disclaimer: "Not trained on real labelled fraud data; provided for experimentation only.",
      engine: LOCAL_ENGINE,
      note: "Reported by the local Node.js adapter; no Python inference service was called.",
    } };
  }
  if (pathname === "/api/v1/system/storage") {
    const provider = storageProvider();
    return { status: 200, body: {
      service: "storage", backend: provider, configured: true,
      provider: provider === "s3" ? "s3" : "local-fs",
      engine: LOCAL_ENGINE,
      note: "Live configuration of the Next.js storage layer.",
    } };
  }
  if (pathname === "/api/v1/system/notifications") {
    const mail = getMailerStatus();
    const sms = getSmsStatus();
    return { status: 200, body: {
      service: "notifications", enabled: true,
      provider: mail.configured ? "smtp" : "log-only",
      smtp_configured: mail.configured,
      email: mail, sms,
      engine: LOCAL_ENGINE,
      note: "SMTP/SMS are reported from live local configuration; nothing is claimed as delivered unless a provider is configured.",
    } };
  }
  if (pathname === "/api/v1/system/registry") {
    const sources = ["vahan", "insurer", "theft"].map((name) => ({
      name,
      status: "unavailable",
      provider: "not-configured",
      configured: false,
      reason: "No external registry credentials are configured.",
    }));
    return { status: 200, body: {
      service: "registry", active_provider: "unavailable",
      sources: Object.fromEntries(sources.map((s) => [s.name, s])),
      engine: LOCAL_ENGINE,
      note: "No external registry was queried. Missing provider data is unverified coverage, not a clean result.",
    } };
  }
  return null;
}

/** Real local write for damage review (mirrors the Python handler). */
function reviewDamage(vehicleId: string, damageId: string, body: unknown,
                      actor: { id: string; role: string }): LocalFallback {
  const input = (body ?? {}) as Row;
  const status = input.status;
  if (status !== "verified" && status !== "rejected") {
    return { status: 422, body: { error: "status must be 'verified' or 'rejected'", engine: LOCAL_ENGINE } };
  }
  if (!owns(vehicleId, actor)) return notFound("Vehicle");
  const damage = one<Row>("SELECT * FROM damage_records WHERE id = ?", damageId);
  if (!damage || String(damage.vehicle_id) !== vehicleId) return notFound("Damage record");

  const sets = ["status = ?"];
  const params: (string | number | null)[] = [String(status)];
  for (const key of ["component_id", "severity", "repair_status"] as const) {
    if (input[key] !== undefined && input[key] !== null) {
      sets.push(`${key} = ?`);
      params.push(String(input[key]));
    }
  }
  run(`UPDATE damage_records SET ${sets.join(", ")} WHERE id = ?`, ...params, damageId);
  try {
    run("INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, after, at) VALUES (?,?,?,?,?,?,?)",
      `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, actor.id,
      "damage.reviewed", "damage_record", damageId, JSON.stringify({ status }),
      new Date().toISOString());
  } catch { /* audit is best-effort; the real state change already persisted */ }
  const updated = one<Row>("SELECT * FROM damage_records WHERE id = ?", damageId);
  return { status: 200, body: { damage: updated, status, engine: LOCAL_ENGINE } };
}

/** Real local write for OCR field corrections (mirrors the Python handler). */
function correctOcr(vehicleId: string, docId: string, body: unknown,
                    actor: { id: string; role: string }): LocalFallback {
  const input = (body ?? {}) as Row;
  if (!input.fields || typeof input.fields !== "object" || Array.isArray(input.fields)) {
    return { status: 422, body: { error: "fields object is required", engine: LOCAL_ENGINE } };
  }
  if (!owns(vehicleId, actor)) return notFound("Vehicle");
  const doc = one<Row>("SELECT * FROM documents WHERE id = ?", docId);
  if (!doc || doc.deleted_at || String(doc.vehicle_id) !== vehicleId) return notFound("Document");
  const cleanFields = Object.fromEntries(
    Object.entries(input.fields as Record<string, unknown>).filter(([k]) => k !== "confidence")
  );
  let prevExtracted: Record<string, unknown> = {};
  if (typeof doc.extracted === "string" && doc.extracted.trim()) {
    try {
      const parsed = JSON.parse(doc.extracted);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        prevExtracted = parsed as Record<string, unknown>;
      }
    } catch { /* ignore unparseable legacy JSON */ }
  }
  const nextExtracted = {
    ...prevExtracted,
    source: typeof prevExtracted.source === "string" ? prevExtracted.source : "manual-ocr-review",
    review_source: "manual-ocr-review",
    ocr_status: "reviewed",
    reviewed_by: actor.id,
    reviewed_at: new Date().toISOString(),
    fields: cleanFields,
  };
  const cols = new Set(all<{ name: string }>("PRAGMA table_info(documents)").map((c) => c.name));
  if (cols.has("ocr_extracted") && cols.has("ocr_status")) {
    run(
      "UPDATE documents SET ocr_extracted = ?, ocr_status = 'reviewed', extracted = ? WHERE id = ?",
      JSON.stringify(cleanFields),
      JSON.stringify(nextExtracted),
      docId
    );
  } else {
    run("UPDATE documents SET extracted = ? WHERE id = ?", JSON.stringify(nextExtracted), docId);
  }
  recordDocumentExtractions(docId);
  const updated = one<Row>("SELECT * FROM documents WHERE id = ?", docId);
  return { status: 200, body: { document: updated, ocr_status: "reviewed", engine: LOCAL_ENGINE } };
}

/**
 * Resolve a proxied call locally. Returns null when the path is not one this
 * adapter owns (the caller then reports the transport failure honestly).
 */
export function localBackendFallback(
  pathname: string,
  method: string,
  body: unknown,
  token: string,
): LocalFallback | null {
  const verb = method.toUpperCase();
  const actor = actorOf(token);
  if (!actor) {
    return { status: 401, body: { error: "Authentication required.", engine: LOCAL_ENGINE } };
  }

  if (verb === "GET") {
    const report = statusReport(pathname);
    if (report) return report;
  }

  let m: RegExpMatchArray | null;
  if (verb === "PATCH" && (m = pathname.match(/^\/api\/v1\/vehicles\/([^/]+)\/damage\/([^/]+)\/review$/))) {
    return reviewDamage(decodeURIComponent(m[1]), decodeURIComponent(m[2]), body, actor);
  }
  if ((m = pathname.match(/^\/api\/v1\/vehicles\/([^/]+)\/documents\/([^/]+)\/ocr$/))) {
    const [, vehicleId, docId] = m.map(decodeURIComponent);
    if (verb === "PATCH") return correctOcr(vehicleId, docId, body, actor);
    if (verb === "POST") {
      // A real OCR engine lives in the Python runtime. Never fabricate text.
      return unavailable("OCR needs the Python intelligence service (RapidOCR/PaddleOCR). It is not configured in this deployment; no fields were extracted.");
    }
  }
  if (verb === "POST" && (m = pathname.match(/^\/api\/v1\/vehicles\/([^/]+)\/photos\/([^/]+)\/detect$/))) {
    const [, vehicleId, photoId] = m.map(decodeURIComponent);
    if (!owns(vehicleId, actor)) return notFound("Vehicle");
    const photo =
      one<Row>(
        "SELECT * FROM vehicle_images WHERE id = ? AND vehicle_id = ? AND deleted_at IS NULL",
        photoId,
        vehicleId
      ) ??
      one<Row>(
        `SELECT li.*, l.vehicle_id AS vehicle_id
         FROM listing_images li
         JOIN listings l ON l.id = li.listing_id
         WHERE li.id = ? AND l.vehicle_id = ?`,
        photoId,
        vehicleId
      );
    if (!photo || photo.deleted_at) return notFound("Photo");
    return unavailable("Damage detection needs the Python vision adapter. It is not configured in this deployment; no candidate was invented.");
  }
  return null;
}

/** Exposed for the integration health payload. */
export function localAdapterSummary(): Row {
  return {
    engine: LOCAL_ENGINE,
    capabilities: ["status reports", "damage review", "OCR corrections"],
    unavailable: ["OCR inference", "photo damage detection"],
    note: "Real writes to the shared database; vision inference is honestly reported as unavailable.",
  };
}
