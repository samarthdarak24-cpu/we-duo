// ---------------------------------------------------------------------------
// Category catalogue + Vehicle History Passport.
//
// The passport is a READ-ONLY, evidence-backed projection. It never invents an
// accident, insurance policy, battery reading or AI prediction. Every claim
// carries its source row id, and every unsupported capability is reported as
// unavailable rather than silently completed.
// ---------------------------------------------------------------------------
import {
  getBatteryRecords,
  getChain,
  getDamage,
  getDocuments,
  getFindings,
  getHistory,
  getLatestRun,
  getMileage,
  getResults,
  getTheft,
  getVehicle,
  getVehicleSpecs,
  one,
  all,
} from "./db";
import { computeVehicleTrust, getChainStatus, getVerificationChecks } from "./data";
import {
  agentNodesForCategory,
  categoryForVehicle,
  categoryLabel,
  categoryMatrix,
  componentIdsForCategory,
  damageDetectorForCategory,
  documentLabel,
  documentsForCategory,
  fieldsForCategory,
  getCategory,
  hasBatteryPack,
  implementedCategories,
  isElectric,
  labelsForCategory,
  mileageRulesForCategory,
  modelAssetForCategory,
  plannedCategories,
  pucApplicable,
  trustWeightsForCategory,
  CATEGORY_SPEC_VERSION,
  TRUST_VERSION,
  classes,
  powertrains,
} from "@/lib/vehicle-categories";

export function categoryCatalog() {
  return {
    specVersion: CATEGORY_SPEC_VERSION,
    trustVersion: TRUST_VERSION,
    defaultCategoryId: "passenger_car",
    principles: [
      "One shared verification engine; category profiles only supply rules, fields and component sets.",
      "Identifier validation is category-specific. No universal 17-character VIN rule.",
      "Electric vehicles are never asked for an engine number, engine CC, fuel type or PUC.",
      "Missing evidence is unverified coverage — never proven fraud and never a clean record.",
      "A 3D asset is never substituted across categories; unavailable assets are labelled and interactions disabled.",
      "OCR extraction is not proof that a document is genuine.",
    ],
    classes: classes(),
    powertrains: powertrains(),
    implemented: implementedCategories().map((c) => ({
      id: c.id, label: c.label, shortLabel: c.shortLabel, class: c.class,
      powertrain: c.powertrain, priority: c.priority, status: c.status,
    })),
    planned: plannedCategories().map((c) => ({ id: c.id, label: c.label, class: c.class, powertrain: c.powertrain, status: "planned" })),
    matrix: categoryMatrix(),
  };
}

export function categoryProfile(categoryId: string) {
  const cat = getCategory(categoryId);
  if (!cat) return null;
  const asset = modelAssetForCategory(categoryId);
  const detector = damageDetectorForCategory(categoryId);
  return {
    specVersion: CATEGORY_SPEC_VERSION,
    id: cat.id,
    label: cat.label,
    shortLabel: cat.shortLabel,
    class: cat.class,
    type: cat.type,
    powertrain: cat.powertrain,
    status: cat.status,
    identity: cat.identity,
    labels: labelsForCategory(categoryId),
    fields: fieldsForCategory(categoryId),
    documents: documentsForCategory(categoryId),
    components: componentIdsForCategory(categoryId),
    componentSetLabel: componentIdsForCategory(categoryId).length
      ? `${cat.label} components`
      : "Unavailable",
    damageDetection: detector,
    model3d: asset,
    mileageRules: mileageRulesForCategory(categoryId),
    trust: trustWeightsForCategory(categoryId),
    agentNodes: agentNodesForCategory(categoryId),
    pucApplicable: pucApplicable(categoryId),
    isElectric: isElectric(categoryId),
    capabilityNotes: [
      asset.status === "available"
        ? `3D: ${asset.note}`
        : "3D: no licensed GLB exists for this category. A clearly labelled category-specific schematic is shown; component interactions are unavailable. No car model is substituted.",
      detector.status === "available"
        ? `Damage CV: ${detector.note}`
        : `Damage CV: ${detector.note}`,
      isElectric(categoryId)
        ? "Battery State of Health is recorded only from a battery health report and is never treated as an odometer reading."
        : hasBatteryPack(categoryId)
        ? "Hybrid battery evidence is recorded only from a battery health or service report and is never treated as an odometer reading."
        : "No electric-battery checks apply to this combustion vehicle.",
    ],
  };
}

function evidenceNodes(vehicleId: string) {
  return all<{ id: string; node_type: string; entity_id: string; label: string; source: string; reliability: string }>(
    "SELECT id, node_type, entity_id, label, source, reliability FROM evidence_nodes WHERE vehicle_id = ? ORDER BY created_at ASC",
    vehicleId
  );
}
function evidenceEdges(vehicleId: string) {
  return all<{ source_node: string; relation: string; target_node: string }>(
    "SELECT source_node, relation, target_node FROM evidence_edges WHERE vehicle_id = ?",
    vehicleId
  );
}

// ---------------------------------------------------------------------------
// Passport projection: one normalised status vocabulary and an explainable
// assessment. Everything below is derived from stored rows; no value is
// invented and no LLM produces a status or score.
// ---------------------------------------------------------------------------
export type PassportRecordStatus =
  | "VERIFIED"
  | "PENDING"
  | "SUSPICIOUS"
  | "UNVERIFIED"
  | "NEEDS_REVIEW"
  | "UNAVAILABLE";

export interface PassportTimelineEntry {
  id: string;
  date: string | null;
  type: string;
  title: string;
  description: string;
  source: string;
  status: PassportRecordStatus;
  severity: string | null;
  mileageKm: number | null;
  evidenceRefs: string[];
}

export interface MileageAnomaly {
  id: string;
  type: "ROLLBACK" | "IMPLAUSIBLE_JUMP";
  severity: "medium" | "high" | "critical";
  previous: { id: string; date: string; km: number; source: string; verified: boolean };
  current: { id: string; date: string; km: number; source: string; verified: boolean };
  differenceKm: number;
  daysBetween: number;
  explanation: string;
  recommendedAction: string;
  status: "NEEDS_REVIEW";
  reviewable: boolean;
  evidenceRefs: string[];
  method: string;
  rulesVersion: string;
}

function parseJsonValue<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normaliseDocumentStatus(status: string): PassportRecordStatus {
  switch (status) {
    case "verified":
      return "VERIFIED";
    case "pending":
    case "processing":
      return "PENDING";
    case "rejected":
    case "needs_correction":
      return "SUSPICIOUS";
    default:
      return "UNVERIFIED";
  }
}

function normaliseHistoryStatus(status: string): PassportRecordStatus {
  switch (status) {
    case "verified":
      return "VERIFIED";
    case "pending":
      return "PENDING";
    case "suspicious":
      return "SUSPICIOUS";
    case "needs_review":
    case "disputed":
      return "NEEDS_REVIEW";
    default:
      return "UNVERIFIED";
  }
}

function normaliseDamageStatus(status: string): PassportRecordStatus {
  switch (status) {
    case "verified":
      return "VERIFIED";
    case "seller_reported":
      return "UNVERIFIED";
    case "detected_visible_damage":
      return "NEEDS_REVIEW";
    case "pending":
      return "PENDING";
    default:
      return "UNVERIFIED";
  }
}

function normaliseFindingStatus(status: string): PassportRecordStatus {
  switch (status) {
    case "cleared":
    case "resolved":
      return "VERIFIED";
    case "open":
      return "NEEDS_REVIEW";
    case "explained":
    case "disputed":
      return "PENDING";
    default:
      return "NEEDS_REVIEW";
  }
}

function normaliseTheftStatus(status: string): PassportRecordStatus {
  switch (status) {
    case "unavailable":
      return "UNAVAILABLE";
    case "record_found":
      return "SUSPICIOUS";
    case "no_record":
    default:
      // An empty result is *coverage*, not proof the vehicle is clean.
      return "UNVERIFIED";
  }
}

function buildMileageAnalysis(
  readings: ReturnType<typeof getMileage>,
  categoryId: string
) {
  const rules = mileageRulesForCategory(categoryId);
  const label = labelsForCategory(categoryId).odometer;
  const sorted = [...readings].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const rows = sorted.map((reading, index) => {
    const previous = index > 0 ? sorted[index - 1] : null;
    const days = previous
      ? Math.max(1, (new Date(reading.date).getTime() - new Date(previous.date).getTime()) / 86400000)
      : null;
    const delta = previous ? Number(reading.km) - Number(previous.km) : null;
    return {
      id: reading.id,
      date: reading.date,
      km: Number(reading.km),
      source: reading.source,
      verified: !!reading.verified,
      flagged: !!reading.flagged,
      sellerClaim: !!reading.is_seller_claim,
      documentId: reading.document_id,
      deltaFromPreviousKm: delta,
      daysSincePrevious: days === null ? null : Math.round(days),
      direction:
        delta === null ? "baseline" : delta < 0 ? "decrease" : delta > 0 ? "increase" : "flat",
    };
  });

  const anomalies: MileageAnomaly[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    const days = Math.max(
      1,
      (new Date(current.date).getTime() - new Date(previous.date).getTime()) / 86400000
    );
    const delta = Number(current.km) - Number(previous.km);
    const refs = [previous.document_id, current.document_id].filter(
      (id): id is string => !!id
    ).map((id) => `document:${id}`);

    if (delta < 0) {
      const severe = Math.abs(delta) > rules.rollbackToleranceKm;
      anomalies.push({
        id: `mileage-anomaly:${previous.id}:${current.id}`,
        type: "ROLLBACK",
        severity: severe ? "critical" : "high",
        previous: {
          id: previous.id,
          date: previous.date,
          km: Number(previous.km),
          source: previous.source,
          verified: !!previous.verified,
        },
        current: {
          id: current.id,
          date: current.date,
          km: Number(current.km),
          source: current.source,
          verified: !!current.verified,
        },
        differenceKm: delta,
        daysBetween: Math.round(days),
        explanation:
          `The ${label.toLowerCase()} fell from ${Number(previous.km).toLocaleString("en-IN")} km on ` +
          `${previous.date.slice(0, 10)} to ${Number(current.km).toLocaleString("en-IN")} km on ` +
          `${current.date.slice(0, 10)} (a decrease of ${Math.abs(delta).toLocaleString("en-IN")} km). ` +
          `This can indicate a rollback, a replaced instrument cluster or a data-entry error. ` +
          `It is a warning that requires investigation, not proof of tampering.`,
        recommendedAction:
          `Request the service invoice or inspection sheet for both dates and a dated photograph of the ` +
          `${label.toLowerCase()}. If the instrument cluster was replaced, upload the replacement invoice so ` +
          `the discontinuity can be explained and reviewed.`,
        status: "NEEDS_REVIEW",
        reviewable: true,
        evidenceRefs: refs,
        method: "chronological-odometer-delta",
        rulesVersion: TRUST_VERSION,
      });
    } else if (delta / days > rules.dailyMaxKm) {
      anomalies.push({
        id: `mileage-anomaly:${previous.id}:${current.id}`,
        type: "IMPLAUSIBLE_JUMP",
        severity: "medium",
        previous: {
          id: previous.id,
          date: previous.date,
          km: Number(previous.km),
          source: previous.source,
          verified: !!previous.verified,
        },
        current: {
          id: current.id,
          date: current.date,
          km: Number(current.km),
          source: current.source,
          verified: !!current.verified,
        },
        differenceKm: delta,
        daysBetween: Math.round(days),
        explanation:
          `The ${label.toLowerCase()} rose by ${delta.toLocaleString("en-IN")} km in ` +
          `${Math.round(days)} day(s), above the ${rules.dailyMaxKm} km/day ceiling configured for ` +
          `${categoryLabel(categoryId)}. This is a plausibility warning, not proof of fraud.`,
        recommendedAction:
          "Confirm the reading against the dated service invoice and the vehicle's usage pattern.",
        status: "NEEDS_REVIEW",
        reviewable: true,
        evidenceRefs: refs,
        method: "chronological-odometer-delta",
        rulesVersion: TRUST_VERSION,
      });
    }
  }

  const rollback = anomalies.some((a) => a.type === "ROLLBACK");
  return {
    label,
    unit: rules.unit,
    rules,
    method: "chronological-odometer-delta",
    version: TRUST_VERSION,
    readings: rows,
    anomalies,
    consistency:
      anomalies.length > 0
        ? ("attention" as const)
        : rows.length >= 2
          ? ("no_anomaly_detected" as const)
          : ("insufficient_data" as const),
    note:
      "A decreasing reading is a warning that requires investigation, not automatic proof of odometer tampering. " +
      "Missing readings mean the distance history is unverified, not proven accurate." +
      (rollback
        ? " At least one stored reading decreased; obtain the invoice or inspection sheet for both dates."
        : ""),
  };
}

/**
 * The Vehicle History Passport: one shared shape for every category, with
 * category-correct labels, components, documents and honest gaps.
 */
export function vehiclePassport(vehicleId: string) {
  const v = getVehicle(vehicleId);
  if (!v) return null;
  const cat = categoryForVehicle(v);
  const cid = cat.id;
  const profile = categoryProfile(cid)!;
  const docs = getDocuments(vehicleId);
  const findings = getFindings(vehicleId);
  const readings = getMileage(vehicleId);
  const damages = getDamage(vehicleId);
  const history = getHistory(vehicleId);
  const battery = getBatteryRecords(vehicleId);
  const specs = getVehicleSpecs(vehicleId);
  const trust = computeVehicleTrust(vehicleId);
  const chain = getChainStatus(vehicleId);
  const checks = getVerificationChecks(vehicleId);
  const allowedComponents = new Set(componentIdsForCategory(cid));

  const requiredDocIds = documentsForCategory(cid).filter((d) => d.required).map((d) => d.id);
  const missingRequired = requiredDocIds.filter(
    (id) => !docs.some((d) => d.type === id && d.status === "verified")
  );

  const latestRun = getLatestRun(vehicleId);
  const runResults = latestRun ? getResults(latestRun.id) : [];
  const theft = getTheft(vehicleId);
  const mileageAnalysis = buildMileageAnalysis(readings, cid);

  // ---- Unified chronological timeline -------------------------------------
  const timeline: PassportTimelineEntry[] = [];

  for (const d of docs) {
    const extracted = parseJsonValue<Record<string, unknown>>(d.extracted, {});
    const fieldCount = Object.keys(extracted).filter(
      (key) => !["method", "confidence", "confidences", "pages"].includes(key)
    ).length;
    timeline.push({
      id: `document:${d.id}`,
      date: d.verified_at ?? d.uploaded_at,
      type: "document",
      title: documentLabel(d.type),
      description:
        `${d.file_name} · ${d.status.replace(/_/g, " ")}` +
        (d.status_reason ? ` (${d.status_reason})` : "") +
        (fieldCount ? ` · OCR stored ${fieldCount} field(s)` : ""),
      source: fieldCount ? "ocr_extraction" : "seller_upload",
      status: normaliseDocumentStatus(d.status),
      severity: null,
      mileageKm: null,
      evidenceRefs: [`document:${d.id}`],
    });
  }

  for (const h of history) {
    timeline.push({
      id: `history:${h.id}`,
      date: h.event_date,
      type: "history",
      title: h.title || h.category || "History event",
      description: h.description || "Recorded history event.",
      source: h.source || "unknown",
      status: normaliseHistoryStatus(h.status),
      severity: null,
      mileageKm: h.mileage_km == null ? null : Number(h.mileage_km),
      evidenceRefs: [
        `history:${h.id}`,
        ...(h.evidence_document_id ? [`document:${h.evidence_document_id}`] : []),
      ],
    });
  }

  for (const r of readings) {
    timeline.push({
      id: `mileage:${r.id}`,
      date: r.date,
      type: "mileage",
      title: `${labelsForCategory(cid).odometer} reading`,
      description:
        `${Number(r.km).toLocaleString("en-IN")} ${mileageRulesForCategory(cid).unit} recorded by ` +
        `${r.source}${r.is_seller_claim ? " (seller-declared)" : ""}.`,
      source: r.source || "unknown",
      status: r.flagged
        ? "NEEDS_REVIEW"
        : r.verified
          ? "VERIFIED"
          : r.is_seller_claim
            ? "PENDING"
            : "UNVERIFIED",
      severity: r.flagged ? "medium" : null,
      mileageKm: Number(r.km),
      evidenceRefs: [
        `mileage:${r.id}`,
        ...(r.document_id ? [`document:${r.document_id}`] : []),
      ],
    });
  }

  for (const d of damages) {
    timeline.push({
      id: `damage:${d.id}`,
      date: d.inspection_date || d.created_at,
      type: "damage",
      title: `Damage · ${d.component_id || d.zone_id || "unmapped component"}`,
      description:
        `${d.damage_type || "Damage"} · severity ${d.severity || "unassessed"} · repair ` +
        `${d.repair_status || "unrecorded"}${d.description ? ` · ${d.description}` : ""}`,
      source: d.position_source || d.status || "inspection",
      status: normaliseDamageStatus(d.status),
      severity: d.severity || null,
      mileageKm: null,
      evidenceRefs: [
        `damage:${d.id}`,
        ...(d.repair_invoice_doc_id ? [`document:${d.repair_invoice_doc_id}`] : []),
      ],
    });
  }

  if (isElectric(cid)) {
    for (const b of battery) {
      timeline.push({
        id: `battery:${b.id}`,
        date: b.measured_at || null,
        type: "battery",
        title: `Battery · ${b.kind || "record"}`,
        description:
          `${b.soh_percent == null ? "State of Health not reported" : `${b.soh_percent}% State of Health`}` +
          `${b.capacity_kwh == null ? "" : ` · ${b.capacity_kwh} kWh`}` +
          `${b.notes ? ` · ${b.notes}` : ""}. Battery health is never treated as odometer distance.`,
        source: b.source_document_id ? "battery_report" : "seller_submitted",
        status: b.status === "verified" ? "VERIFIED" : "UNVERIFIED",
        severity: null,
        mileageKm: null,
        evidenceRefs: [
          `battery:${b.id}`,
          ...(b.source_document_id ? [`document:${b.source_document_id}`] : []),
        ],
      });
    }
  }

  const openFindings = findings.filter((f) => !["cleared", "resolved"].includes(f.status));
  for (const f of findings) {
    const evidence = parseJsonValue<Record<string, unknown>>(f.evidence, {});
    const refs = [`finding:${f.id}`];
    if (f.responsible_doc) refs.push(`document:${f.responsible_doc}`);
    for (const key of ["documentId", "otherDocumentId", "readingId", "damageId", "eventId"]) {
      const value = evidence[key];
      if (typeof value === "string" && value) {
        const prefix = key === "documentId" || key === "otherDocumentId" ? "document" : key.replace("Id", "");
        refs.push(`${prefix}:${value}`);
      }
    }
    timeline.push({
      id: `finding:${f.id}`,
      date: f.created_at,
      type: "finding",
      title: f.title,
      description: f.explanation,
      source: "rules_engine",
      status: normaliseFindingStatus(f.status),
      severity: f.severity,
      mileageKm: null,
      evidenceRefs: [...new Set(refs)],
    });
  }

  if (latestRun) {
    timeline.push({
      id: `verification:${latestRun.id}`,
      date: latestRun.finished_at ?? latestRun.started_at,
      type: "verification",
      title: `Verification run · ${latestRun.status}`,
      description: `${runResults.length} check result(s) stored for this run.`,
      source: "verification_pipeline",
      status: latestRun.status === "done" ? "VERIFIED" : "PENDING",
      severity: null,
      mileageKm: null,
      evidenceRefs: [`verification:${latestRun.id}`],
    });
  }

  if (theft) {
    timeline.push({
      id: `theft:${vehicleId}`,
      date: theft.checked_at,
      type: "provider_check",
      title: "Theft check",
      description:
        theft.status === "unavailable"
          ? "The theft source was unavailable. The vehicle remains unverified for theft."
          : theft.status === "record_found"
            ? "A supported source returned a theft record. This is a warning for investigation."
            : "No theft record was returned. An empty result does not guarantee the vehicle is not stolen.",
      source: theft.source || "unknown",
      status: normaliseTheftStatus(theft.status),
      severity: theft.status === "record_found" ? "high" : null,
      mileageKm: null,
      evidenceRefs: [`theft:${vehicleId}`],
    });
  }

  timeline.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  // ---- Explainable assessment --------------------------------------------
  const verifiedDocs = docs.filter((d) => d.status === "verified");
  const pendingDocs = docs.filter((d) => ["pending", "processing"].includes(d.status));
  const highFindings = openFindings.filter((f) => ["high", "critical"].includes(f.severity));
  const insuranceVerified = docs.some(
    (d) => d.type.includes("insurance") && d.status === "verified"
  );

  const positives: string[] = [];
  if (verifiedDocs.length) {
    positives.push(`${verifiedDocs.length} document(s) have a verified status in the evidence set.`);
  }
  if (chain.intact && chain.records > 0) {
    positives.push(`The evidence hash chain is intact across ${chain.records} record(s).`);
  }
  if (mileageAnalysis.consistency === "no_anomaly_detected") {
    positives.push(
      `No decrease or implausible jump was detected across ${readings.length} chronological readings.`
    );
  }
  if (!openFindings.length) {
    positives.push("No open deterministic findings were raised from the available records.");
  }
  if (isElectric(cid) && battery.some((b) => b.soh_percent != null)) {
    positives.push("At least one battery State of Health value is backed by a stored record.");
  }

  const riskIndicators = openFindings.map((f) => {
    const evidence = parseJsonValue<Record<string, unknown>>(f.evidence, {});
    const refs = [`finding:${f.id}`];
    if (f.responsible_doc) refs.push(`document:${f.responsible_doc}`);
    for (const key of ["documentId", "otherDocumentId", "readingId", "damageId"]) {
      const value = evidence[key];
      if (typeof value === "string" && value) {
        refs.push(`${key === "readingId" ? "mileage" : key === "damageId" ? "damage" : "document"}:${value}`);
      }
    }
    return {
      code: f.code,
      severity: f.severity,
      title: f.title,
      explanation: f.explanation,
      recommendation: f.recommendation,
      status: f.status,
      evidenceRefs: [...new Set(refs)],
    };
  });
  if (!chain.intact) {
    riskIndicators.push({
      code: "CHAIN_BROKEN",
      severity: "high",
      title: "Evidence hash chain is broken",
      explanation: `The chain breaks at record ${chain.brokenAt ?? "unknown"}.`,
      recommendation: "Investigate which stored record changed outside the audited flow.",
      status: "open",
      evidenceRefs: [`chain:${vehicleId}`],
    });
  }

  const missingInformation: { code: string; label: string; detail: string; status: PassportRecordStatus }[] = [];
  for (const id of missingRequired) {
    const existing = docs.find((d) => d.type === id);
    missingInformation.push({
      code: id,
      label: documentLabel(id),
      detail: existing
        ? `A record is stored but its status is "${existing.status}", not verified.`
        : "No record has been uploaded for this required document.",
      status: existing ? normaliseDocumentStatus(existing.status) : "UNAVAILABLE",
    });
  }
  if (!insuranceVerified) {
    missingInformation.push({
      code: "insurance",
      label: "Insurance",
      detail: "No verified insurance record is available. Insurance validity is unverified.",
      status: "UNAVAILABLE",
    });
  }
  if (!readings.length) {
    missingInformation.push({
      code: "distance_history",
      label: labelsForCategory(cid).odometer,
      detail: "No distance readings are on file, so the distance history is unverified.",
      status: "UNAVAILABLE",
    });
  }
  if (!damages.length) {
    missingInformation.push({
      code: "damage_history",
      label: "Damage and inspection records",
      detail:
        "No damage or inspection record is stored. This is unverified coverage, not proof the vehicle is damage-free.",
      status: "UNAVAILABLE",
    });
  }
  if (!theft || theft.status === "unavailable" || theft.status === "no_record") {
    missingInformation.push({
      code: "theft_coverage",
      label: "Theft coverage",
      detail:
        !theft || theft.status === "unavailable"
          ? "No supported theft source completed a check, so theft status is unverified."
          : "A theft check completed with no record, but this does not guarantee the vehicle is not stolen.",
      status: !theft || theft.status === "unavailable" ? "UNAVAILABLE" : "UNVERIFIED",
    });
  }

  const assessmentStatus: PassportRecordStatus = highFindings.length
    ? "NEEDS_REVIEW"
    : missingRequired.length || pendingDocs.length
      ? "PENDING"
      : verifiedDocs.length
        ? "VERIFIED"
        : "UNVERIFIED";

  const assessment = {
    status: assessmentStatus,
    summary:
      `${trust.bandLabel}: ${verifiedDocs.length}/${docs.length} document(s) verified, ` +
      `${openFindings.length} open finding(s) and ${mileageAnalysis.anomalies.length} mileage warning(s). ` +
      `Missing evidence remains unverified.`,
    method: "deterministic-evidence-assessment",
    version: TRUST_VERSION,
    generatedAt: new Date().toISOString(),
    coverage: {
      documents: docs.length,
      verifiedDocuments: verifiedDocs.length,
      pendingDocuments: pendingDocs.length,
      requiredDocuments: requiredDocIds.length,
      verifiedRequiredDocuments: requiredDocIds.length - missingRequired.length,
      mileageReadings: readings.length,
      damageRecords: damages.length,
    },
    positives,
    riskIndicators,
    missingInformation,
    limitations: [
      "This assessment is produced by deterministic rules and versioned weights; no LLM assigned the status or score.",
      "Missing records are unverified coverage — never proof of fraud and never proof of a clean history.",
      "A matching SHA-256 proves file integrity, not document authenticity.",
      "OCR extraction is not proof that the underlying document is genuine.",
      "Seller-declared specifications and damage disclosures are not inspection results.",
      "A 3D hotspot is only as reliable as the stored damage record it maps to.",
    ],
    evidenceRefs: [
      ...verifiedDocs.map((d) => `document:${d.id}`),
      ...openFindings.map((f) => `finding:${f.id}`),
      `chain:${vehicleId}`,
    ],
  };

  return {
    specVersion: CATEGORY_SPEC_VERSION,
    trustVersion: TRUST_VERSION,
    generatedAt: new Date().toISOString(),
    vehicle: {
      id: v.id,
      trustdriveId: v.trustdrive_id,
      make: v.make, model: v.model, variant: v.variant, year: v.year,
      regNo: v.reg_no, primaryIdentifier: v.vin, fuel: v.fuel,
      transmission: v.transmission, legacyCategory: v.category,
      color: v.color, location: v.location, owners: v.ownership_count,
      claimedDistanceKm: v.km_claimed, lastVerifiedKm: v.last_verified_km,
      askingPrice: v.asking_price, condition: v.condition,
      description: v.description, status: v.status,
    },
    category: {
      id: cid, label: cat.label, class: cat.class, powertrain: cat.powertrain,
      labels: labelsForCategory(cid), identity: cat.identity,
      isElectric: isElectric(cid), pucApplicable: pucApplicable(cid),
    },
    trust: {
      score: trust.trustScore, band: trust.band, bandLabel: trust.bandLabel,
      evidenceCoverage: trust.evidenceCoverage, coverageLabel: trust.coverage,
      version: TRUST_VERSION, method: "category-weighted deterministic rules",
      weights: trustWeightsForCategory(cid).weights,
    },
    specifications: {
      values: specs,
      note: "Seller-declared values unless a corroborating document is listed. They are not inspection results.",
    },
    documents: docs.map((d) => ({
      id: d.id, type: d.type, label: documentLabel(d.type), fileName: d.file_name,
      status: d.status, sha256: d.sha256, uploadedAt: d.uploaded_at,
      verifiedAt: d.verified_at, statusReason: d.status_reason,
      required: requiredDocIds.includes(d.type), consent: !!d.consent,
      note: "A stored document record and any OCR text extracted from it are not proof that the underlying document is genuine.",
    })),
    requiredDocuments: {
      required: requiredDocIds.map((id) => ({ id, label: documentLabel(id) })),
      missingVerified: missingRequired.map((id) => ({ id, label: documentLabel(id) })),
      policy: "Missing evidence is unverified coverage. It is never reported as a clean history and never as proof of fraud.",
    },
    distance: {
      label: labelsForCategory(cid).odometer,
      unit: mileageRulesForCategory(cid).unit,
      rules: mileageRulesForCategory(cid),
      readings: readings.map((m) => ({
        id: m.id, date: m.date, km: m.km, source: m.source,
        verified: !!m.verified, flagged: !!m.flagged, sellerClaim: !!m.is_seller_claim,
        documentId: m.document_id,
      })),
      note: isElectric(cid)
        ? "Battery State of Health is a percentage, never a distance reading. Only odometer/distance records appear above."
        : "Only odometer records appear above.",
    },
    battery: isElectric(cid)
      ? {
          applicable: true,
          records: battery.map((b) => ({
            id: b.id, kind: b.kind, sohPercent: b.soh_percent,
            capacityKwh: b.capacity_kwh, serial: b.serial, measuredAt: b.measured_at,
            sourceDocumentId: b.source_document_id, status: b.status, notes: b.notes,
          })),
          note: "Every State of Health value is backed by a battery health report. No value is inferred from photographs, distance or seller estimates.",
          sohIsOdometer: false,
        }
      : { applicable: false, records: [], note: "Not an electric vehicle — no battery State of Health checks apply.", sohIsOdometer: false },
    findings: findings.map((f) => ({
      id: f.id, code: f.code, severity: f.severity, title: f.title,
      explanation: f.explanation, recommendation: f.recommendation,
      points: f.points, status: f.status, evidence: f.evidence,
      note: "Findings are warnings that require investigation. They are not proof of fraud.",
    })),
    damage: {
      registryComponentCount: allowedComponents.size,
      detector: damageDetectorForCategory(cid),
      records: damages.map((d) => ({
        id: d.id, componentId: d.component_id, zoneId: d.zone_id,
        componentValidForCategory: !!d.component_id && allowedComponents.has(d.component_id),
        damageType: d.damage_type, description: d.description,
        severity: d.severity, status: d.status, inspectionDate: d.inspection_date,
        positionSource: d.position_source, repairStatus: d.repair_status,
      })),
      provenanceLegend: {
        detected_visible_damage: "Detected from a photograph by a CV model (candidate only).",
        seller_reported: "Declared by the seller; not independently verified.",
        verified: "Confirmed by an inspector or a repair/inspection document.",
        unverified: "A finding whose source has not been corroborated.",
      },
      note: "Visible exterior damage only. No hidden structural or internal battery damage is claimed from photographs.",
    },
    history: history.map((h) => ({
      id: h.id, title: h.title, date: h.event_date, km: h.mileage_km,
      source: h.source, status: h.status, evidenceDocumentId: h.evidence_document_id,
    })),
    timeline,
    mileageAnalysis,
    assessment,
    checks,
    evidenceGraph: { nodes: evidenceNodes(vehicleId), edges: evidenceEdges(vehicleId) },
    recordIntegrity: {
      ...chain,
      records: getChain(vehicleId).length,
      note: "Tamper-evident, not tamper-proof. A break means stored rows changed after they were hashed.",
    },
    inspection3d: {
      ...modelAssetForCategory(cid),
      // Explicit aliases shared with GET /api/v1/vehicles/:id/3d-model so a
      // scooter's missing asset is `null` in both payloads, never `undefined`.
      assetUrl: modelAssetForCategory(cid).url,
      fallbackAssetUrl: modelAssetForCategory(cid).fallbackUrl,
      componentSet: componentIdsForCategory(cid),
      note: modelAssetForCategory(cid).note,
      rule: modelAssetForCategory(cid).status === "available"
        ? "Category-matched 3D asset. Every hotspot maps to a component id in damage records."
        : "No licensed 3D asset for this category. A labelled schematic is displayed; hotspot interactions are disabled and no car model is substituted.",
    },
    agent: {
      graphVersion: TRUST_VERSION,
      declaredNodes: agentNodesForCategory(cid),
      includesEVBatteryNode: agentNodesForCategory(cid).includes("EVBatteryAnalysisNode"),
      note: "Only nodes relevant to this category execute. Node lists are reported as declared; an unavailable orchestrator is reported, never hidden.",
    },
    caveats: [
      "This passport is an evidence-backed summary, not a certificate of genuineness.",
      "OCR extraction is not proof that a document is genuine.",
      "Missing accident, insurance or service records mean those areas are unverified, not clean.",
      "AI/CV findings cite evidence and require human review; no prediction is presented as a verified fact.",
      ...(missingRequired.length ? [`${missingRequired.length} required category document(s) have no verified record.`] : []),
    ],
  };
}

/**
 * Remove non-consented document evidence from a passport before it reaches a
 * viewer who is neither the owner nor an admin. Status/count summaries remain,
 * but file names, hashes, timeline document rows and graph payloads do not.
 */
export function restrictPassportToDocuments(
  passport: NonNullable<ReturnType<typeof vehiclePassport>>,
  allowedDocumentIds: Set<string>
) {
  const visibleDocuments = passport.documents.filter((d) => allowedDocumentIds.has(d.id));
  const visibleIds = new Set(visibleDocuments.map((d) => d.id));
  const keepRef = (ref: string) =>
    !ref.startsWith("document:") || visibleIds.has(ref.slice("document:".length));
  const visibleNodes = passport.evidenceGraph.nodes.filter(
    (node) => node.node_type !== "document" || visibleIds.has(node.entity_id)
  );
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const counts = visibleNodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.node_type] = (acc[node.node_type] ?? 0) + 1;
    return acc;
  }, {});

  return {
    ...passport,
    documents: visibleDocuments,
    timeline: passport.timeline
      .filter(
        (entry) =>
          entry.type !== "document" ||
          visibleIds.has(entry.id.slice("document:".length))
      )
      .map((entry) => ({ ...entry, evidenceRefs: entry.evidenceRefs.filter(keepRef) })),
    mileageAnalysis: {
      ...passport.mileageAnalysis,
      readings: passport.mileageAnalysis.readings.map((reading) =>
        reading.documentId && !visibleIds.has(reading.documentId)
          ? { ...reading, documentId: null }
          : reading
      ),
      anomalies: passport.mileageAnalysis.anomalies.map((anomaly) => ({
        ...anomaly,
        evidenceRefs: anomaly.evidenceRefs.filter(keepRef),
      })),
    },
    assessment: {
      ...passport.assessment,
      riskIndicators: passport.assessment.riskIndicators.map((indicator) => ({
        ...indicator,
        evidenceRefs: indicator.evidenceRefs.filter(keepRef),
      })),
      evidenceRefs: passport.assessment.evidenceRefs.filter(keepRef),
    },
    evidenceGraph: {
      ...passport.evidenceGraph,
      nodes: visibleNodes,
      edges: passport.evidenceGraph.edges.filter(
        (edge) => visibleNodeIds.has(edge.source_node) && visibleNodeIds.has(edge.target_node)
      ),
      hiddenDocuments: Math.max(0, passport.documents.length - visibleDocuments.length),
      counts,
    },
  };
}

/** Compact category assignment used by dashboard cards and listings. */
export function vehicleCategorySummary(vehicleId: string) {
  const v = getVehicle(vehicleId);
  if (!v) return null;
  const cid = categoryForVehicle(v).id;
  const asset = modelAssetForCategory(cid);
  return {
    vehicleId,
    categoryId: cid,
    label: getCategory(cid)?.label ?? cid,
    labels: labelsForCategory(cid),
    isElectric: isElectric(cid),
    pucApplicable: pucApplicable(cid),
    identifier: v.vin,
    model3d: { status: asset.status, interactionsAvailable: asset.interactionsAvailable, note: asset.note },
    detector: damageDetectorForCategory(cid).status,
    componentCount: componentIdsForCategory(cid).length,
    agentNodeCount: agentNodesForCategory(cid).length,
  };
}

export function categoryRegistrySnapshot() {
  return one<{ spec_version: string; trust_version: string; matrix: string; created_at: string }>(
    "SELECT spec_version, trust_version, matrix, created_at FROM category_registry_snapshot ORDER BY created_at DESC LIMIT 1"
  );
}
