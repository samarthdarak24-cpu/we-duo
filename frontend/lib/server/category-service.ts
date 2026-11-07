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
  getMileage,
  getVehicle,
  getVehicleSpecs,
  one,
  all,
} from "./db";
import { computeVehicleTrust, getChainStatus, getVerificationChecks } from "./data";
import {
  agentNodesForCategory,
  categoryForVehicle,
  categoryMatrix,
  componentIdsForCategory,
  damageDetectorForCategory,
  documentLabel,
  documentsForCategory,
  fieldsForCategory,
  getCategory,
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
      required: requiredDocIds.includes(d.type),
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
