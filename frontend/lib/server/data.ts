// ---------------------------------------------------------------------------
// Data service: composes DB rows + deterministic engine into API/UI shapes.
// Both the REST route handlers and the server-rendered dashboards read here,
// so every number on screen is DB-driven (design.md §0.3).
// ---------------------------------------------------------------------------
import {
  appendChainRecord,
  createAudit,
  createDamage,
  createDispute,
  createDocument,
  createFinding,
  createHistoryEvent,
  createInquiry,
  createListing,
  createListingImage,
  createMessage,
  createMileage,
  createNotification,
  createQrToken,
  createReport,
  createResult,
  createRun,
  createSaved,
  createSavedSearch,
  createVehicle,
  deleteSaved,
  deleteSavedSearch,
  getActivity,
  getAllListings,
  getAllVehicles,
  getChain,
  getDamage,
  getDamageRecord,
  getDispute,
  getDisputes,
  getDocument,
  getDocuments,
  getDuplicateDocumentCount,
  finishRun,
  getFinding,
  getFindings,
  getHistory,
  getHistoryEvent,
  getInquiriesByBuyer,
  getInquiriesBySeller,
  getInquiry,
  getLatestRun,
  getListing,
  getListingByVehicle,
  getListingEvents,
  getListingImages,
  getMessages,
  getMileage,
  getNotifications,
  getNotificationsPage,
  getNotificationsOffsetPage,
  getPricing,
  getQrTokensForVehicle,
  getReport,
  getReportsByUser,
  getSavedRow,
  getSavedRows,
  getSavedSearches,
  getTheft,
  getVehicle,
  getVehicleByReg,
  getVehicleByTrustDriveId,
  getVehicleByVin,
  getVehiclesByOwner,
  getUserByEmail,
  getUserById,
  getUsersByRole,
  getVehicleSpecs,
  getBatteryRecords,
  upsertVehicleSpecs,
  revokeQrTokens,
  trackListingEvent,
  updateDispute,
  updateDocument,
  updateFinding,
  updateInquiry,
  updateListing,
  updatePassword,
  updateReport,
  updateUser,
  updateVehicle,
  type VehicleRow,
} from "./db";
import {
  getLatestTrustScore,
  getTrustScoreHistory,
  recordTrustScore,
} from "./db-intelligence";
import {
  BAND_LABEL,
  DOC_WEIGHTS,
  canTransitionInquiry,
  computeCompleteness,
  computeTrustScore,
  coverageLabel,
  estimatePrice,
  keyDifferences,
  publishGate,
  recommendedAction,
  type FindingInput,
  type Severity,
  type TrustBand,
} from "./engine";
import { hashPassword, verifyPassword, type Role } from "./auth";
import { canonical, sha256, verifyChain, type ChainRecord } from "./chain";
import { newJti, signQrToken } from "./qr";
import { isValidReg, isValidVin, normalizeReg, normalizeVin } from "./validate";
import { VEHICLE_COMPONENT_REGISTRY, mapZoneToComponentId } from "@/lib/vehicle-registry";
import {
  categoryForVehicle,
  isAllowedDocument,
  categoryLabel,
  categoryMatrix,
  componentIdsForCategory,
  damageDetectorForCategory,
  documentLabel,
  documentsForCategory,
  fieldsForCategory,
  getCategory,
  hasBatteryPack,
  isElectric,
  matchCategoryId,
  labelsForCategory,
  mileageRulesForCategory,
  modelAssetForCategory,
  pucApplicable,
  validateIdentity as validateCategoryIdentity,
  trustWeightsForCategory,
  agentNodesForCategory,
  CATEGORY_SPEC_VERSION,
  TRUST_VERSION,
} from "@/lib/vehicle-categories";

// ---------------------------------------------------------------------------
// Multi-category helpers. `vehicles.vehicle_category_id` is authoritative; for
// legacy rows the shared taxonomy resolves free-text `category` + `fuel`.
// ---------------------------------------------------------------------------
export function categoryIdForVehicle(vehicleId: string): string {
  return categoryForVehicle(getVehicle(vehicleId) ?? {}).id;
}

export function primaryDocumentTypes(vehicleId: string) {
  const cid = categoryIdForVehicle(vehicleId);
  const docs = documentsForCategory(cid).map((d) => d.id);
  return {
    categoryId: cid,
    rc: docs.includes("rc_2w") ? "rc_2w" : "rc",
    insurance: docs.includes("insurance_2w") ? "insurance_2w" : "insurance",
    service: docs.includes("service_2w") ? "service_2w" : "service",
    pucRequired: pucApplicable(cid),
  };
}

/** Normalised component definition shared by the 3D endpoint, the damage
 *  endpoint and the hotspot mapper. Car profiles keep the measured GLB registry;
 *  all other profiles expose their category registry with interactions OFF. */
export interface CategoryComponentDef {
  id: string;
  label: string;
  category: string;
  available: boolean;
  unavailableReason: string | null;
  primaryNode: string | null;
  associatedNodes: string[];
  defaultHotspotAnchor: [number, number, number] | null;
  explosionVector: [number, number, number] | null;
  source: "measured-glb" | "category-registry";
}

function humanizeComponentId(id: string): string {
  return id
    .split("_")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

export function componentsForVehicle(vehicleId: string): {
  categoryId: string;
  assetStatus: string;
  interactionsAvailable: boolean;
  defs: CategoryComponentDef[];
} {
  const v = getVehicle(vehicleId);
  const categoryId = categoryForVehicle(v ?? {}).id;
  const asset = modelAssetForCategory(categoryId);
  const hasGlb = asset.status === "available" && !!asset.url;
  if (hasGlb) {
    return {
      categoryId,
      assetStatus: asset.status,
      interactionsAvailable: true,
      defs: VEHICLE_COMPONENT_REGISTRY.map((c) => ({
        id: c.id,
        label: c.label,
        category: c.category,
        available: c.available,
        unavailableReason: c.unavailableReason ?? null,
        primaryNode: c.primaryNode ?? null,
        associatedNodes: c.associatedNodes,
        defaultHotspotAnchor: c.defaultHotspotAnchor,
        explosionVector: c.explosionVector,
        source: "measured-glb" as const,
      })),
    };
  }
  const reason = `No licensed 3D asset exists for ${categoryLabel(categoryId)}. A labelled category schematic is shown; 3D hotspot interactions are unavailable and no car GLB is substituted.`;
  return {
    categoryId,
    assetStatus: asset.status,
    interactionsAvailable: false,
    defs: componentIdsForCategory(categoryId).map((id) => ({
      id,
      label: humanizeComponentId(id),
      category: "category_registry",
      available: false,
      unavailableReason: reason,
      primaryNode: null,
      associatedNodes: [],
      defaultHotspotAnchor: null,
      explosionVector: null,
      source: "category-registry" as const,
    })),
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface TrustResult {
  trustScore: number;
  riskScore: number;
  band: TrustBand;
  bandLabel: string;
  evidenceCoverage: number;
  coverage: "insufficient" | "limited" | "adequate";
  breakdown: { code: string; points: number }[];
}

export interface VehicleCardView {
  id: string;
  listingId: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  km: number;
  price: number;
  fuel: string;
  transmission: string;
  location: string;
  ownershipCount: number;
  condition: string;
  categoryId?: string;
  categoryLabel?: string;
  trustScore: number;
  coverage: number;
  band: TrustBand;
  sellerName: string;
  sellerType: string;
  saved: boolean;
  publishedAt: string | null;
}

export interface MarketplaceFilters {
  q?: string;
  make?: string;
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  yearMax?: number;
  kmMax?: number;
  fuel?: string;
  transmission?: string;
  /** Taxonomy id (e.g. `electric_scooter`) or vehicle class (`two_wheeler`). */
  category?: string;
  location?: string;
  ownershipMax?: number;
  condition?: string;
  verification?: "all" | "verified" | "caution";
  accident?: "all" | "found" | "none";
  trustMin?: number;
  sort?: "lowest_price" | "highest_price" | "newest" | "lowest_mileage" | "highest_trust" | "recently_verified";
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Trust & insights
// ---------------------------------------------------------------------------
export function computeVehicleTrust(vehicleId: string): TrustResult {
  const docs = getDocuments(vehicleId);
  const coverage = computeCompleteness(docs.map((d) => ({ type: d.type, status: d.status })), categoryIdForVehicle(vehicleId));
  const findings: FindingInput[] = getFindings(vehicleId).map((f) => ({
    code: f.code,
    severity: f.severity as Severity,
    title: f.title,
    explanation: f.explanation,
    points: f.points,
    status: f.status as FindingInput["status"],
  }));
  const r = computeTrustScore(coverage / 100, findings);
  return {
    ...r,
    bandLabel: BAND_LABEL[r.band],
    evidenceCoverage: coverage,
    coverage: coverageLabel(coverage),
  };
}

export interface TrustSnapshotResult {
  id: string;
  created: boolean;
  computedAt: string;
  trust: TrustResult;
}

const TRUST_METHOD = "deterministic-weighted-evidence-coverage";

/**
 * Persist an append-only trust snapshot, but only when the scored state changed.
 *
 * The score itself is always computed deterministically from stored evidence;
 * this function never lets an LLM or a client supply a value. Identical
 * re-computations are deduplicated so a read endpoint cannot bloat the history,
 * while a document/finding change produces a new immutable row. `trust_scores`
 * triggers reject UPDATE/DELETE, so verified history cannot be rewritten.
 */
export function ensureTrustScoreSnapshot(vehicleId: string, computedBy?: string | null): TrustSnapshotResult {
  const trust = computeVehicleTrust(vehicleId);
  const categoryId = categoryIdForVehicle(vehicleId);
  const weights = trustWeightsForCategory(categoryId).weights;
  const factors = JSON.stringify(trust.breakdown);
  const unverified = JSON.stringify(
    getDocuments(vehicleId)
      .filter((d) => d.status !== "verified")
      .map((d) => ({ type: d.type, status: d.status }))
  );
  const weightsJson = JSON.stringify(weights);
  const latest = getLatestTrustScore(vehicleId);
  if (
    latest &&
    latest.score === trust.trustScore &&
    latest.band === trust.band &&
    latest.version === TRUST_VERSION &&
    latest.evidence_coverage === trust.evidenceCoverage &&
    latest.weights_json === weightsJson &&
    latest.factors_json === factors &&
    latest.unverified_json === unverified
  ) {
    return { id: latest.id, created: false, computedAt: latest.computed_at, trust };
  }
  const computedAt = new Date().toISOString();
  const id = recordTrustScore({
    vehicle_id: vehicleId,
    score: trust.trustScore,
    band: trust.band,
    version: TRUST_VERSION,
    method: TRUST_METHOD,
    weights_json: weightsJson,
    factors_json: factors,
    positive_json: "[]",
    negative_json: factors,
    unverified_json: unverified,
    missing_policy: "missing_is_unverified_not_clean",
    evidence_coverage: trust.evidenceCoverage,
    computedAt,
    computedBy: computedBy ?? null,
  });
  return { id, created: true, computedAt, trust };
}

function statusForFinding(sev: string, code: string): string {
  if (code === "DOCUMENT_MISMATCH" || code === "INSURANCE_EXPIRED") return "needs_correction";
  if (sev === "high" || sev === "critical" || sev === "medium") return "suspicious";
  return "pending";
}

export function getMe(userId: string) {
  const u = getUserById(userId);
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    email: u.email,
    initials: u.initials,
    phone: u.phone,
    city: u.city,
    sellerType: u.seller_type,
    businessName: u.business_name,
    kycStatus: u.kyc_status,
    avatarUrl: u.avatar_url,
    emailVerified: !!u.email_verified,
    twofaEnabled: !!u.twofa_enabled,
    lastLoginAt: u.last_login_at,
    preferences: (() => {
      const prefs = safeJson<Record<string, unknown>>(u.preferences, {});
      delete prefs.twofaSecret;
      return prefs;
    })(),
    createdAt: u.created_at,
  };
}

export function getMeByEmail(email: string) {
  const u = getUserByEmail(email);
  return u ? getMe(u.id) : null;
}

// ---------------------------------------------------------------------------
// Honesty helpers: a check may only report `verified` when a real, authoritative
// source produced the result. Demo/seed adapters and absent evidence stay
// `unavailable` — missing data is unverified coverage, never a clean history.
// ---------------------------------------------------------------------------
const DEMO_SOURCE = /demo|mock|sample|fixture|not configured|unavailable/i;

export function theftAssessment(theft: ReturnType<typeof getTheft>) {
  if (!theft) {
    return {
      status: "unavailable",
      note: "No theft registry is configured — this check could not be completed.",
      source: "Not configured",
    };
  }
  if (theft.status === "unavailable") {
    return {
      status: "unavailable",
      note: "The theft source was unavailable — this check could not be completed.",
      source: theft.source,
    };
  }
  if (DEMO_SOURCE.test(theft.source ?? "")) {
    return {
      status: "unavailable",
      note: `Only a demo theft source ("${theft.source}") returned data — this is not a real registry check.`,
      source: theft.source,
    };
  }
  if (theft.status === "no_record") {
    return { status: "verified", note: "No theft record in the configured source.", source: theft.source };
  }
  return { status: "suspicious", note: "A theft record was returned — needs investigation.", source: theft.source };
}

export function getInsights(vehicleId: string) {
  const docs = getDocuments(vehicleId);
  const findings = getFindings(vehicleId);
  const coverage = computeCompleteness(docs.map((d) => ({ type: d.type, status: d.status })), categoryIdForVehicle(vehicleId));
  const mileageFinding = findings.find((f) => f.code.startsWith("MILEAGE") || f.code === "ODOMETER_ROLLBACK");
  const accidentFinding = findings.find((f) => f.code === "ACCIDENT" || f.code.includes("DAMAGE"));
  const theftCheck = theftAssessment(getTheft(vehicleId));
  const readings = getMileage(vehicleId);
  const independentMileage = readings.filter((m) => Number(m.verified) === 1 && Number(m.is_seller_claim) !== 1);
  const majorDamage = getDamage(vehicleId).filter((d) => d.severity !== "Minor" || d.status === "verified");
  return [
    {
      label: "Theft record",
      detail: theftCheck.note,
      status: theftCheck.status,
    },
    {
      label: "Accident history",
      detail:
        accidentFinding || majorDamage.length
          ? "Damage or accident records found in available sources — needs investigation"
          : "No independent accident source is configured — unverified coverage, not a proven clean history",
      status: accidentFinding || majorDamage.length ? "suspicious" : "unavailable",
    },
    {
      label: "Odometer check",
      detail: mileageFinding
        ? "Reading flagged for review"
        : independentMileage.length === 0
          ? "Only seller-declared mileage exists — no independent reading to compare against"
          : "Readings consistent with available service history",
      status: mileageFinding ? "suspicious" : independentMileage.length === 0 ? "pending" : "verified",
    },
    {
      label: "Documents",
      detail:
        coverage >= 100
          ? "Required document weight is machine-checked"
          : `${100 - coverage}% of required document weight needs attention`,
      status: coverage >= 100 ? "verified" : "pending",
    },
  ] as { label: string; detail: string; status: string }[];
}

// ---------------------------------------------------------------------------
// Buyer overview
// ---------------------------------------------------------------------------
export function getBuyerOverview(userId = "u-buyer") {
  const activity = getActivity(userId);
  const saved = getSavedRows(userId);
  const savedListingIds = new Set(saved.map((s) => s.listing_id));
  const recommended = getRecommendedVehicles(userId).slice(0, 4);
  const fallbackMarket = recommended.length ? [] : getMarketplace({ pageSize: 1 }, userId).items;
  const primary = recommended[0]?.id ?? fallbackMarket[0]?.id ?? null;
  const rv = primary ? getVehicle(primary) : undefined;
  const pricing = rv
    ? (getPricing(rv.id) ?? {
        ...estimatePrice({
          base: rv.base_value || 1000000,
          ageYears: Math.max(0, new Date().getFullYear() - rv.year),
          km: rv.km_claimed,
          conditionScore: rv.condition_score,
        }),
      })
    : null;
  const trust = rv ? computeVehicleTrust(rv.id) : null;
  const savedVehicles = saved
    .map((s) => getListing(s.listing_id))
    .filter((l): l is NonNullable<typeof l> => !!l)
    .map((l) => getVehicle(l.vehicle_id))
    .filter((v): v is VehicleRow => !!v);
  const suspicious = savedVehicles
    .map((v) => ({ vehicle: v, trust: computeVehicleTrust(v.id) }))
    .filter((x) => x.trust.trustScore < 65 || getFindings(x.vehicle.id).some((f) => f.severity === "high" || f.severity === "critical"));
  const inquiries = getInquiriesForBuyer(userId);
  return {
    activity: [
      { label: "Vehicles Explored", value: activity?.explored ?? 0, icon: "Compass", href: "/buyer/explore" },
      { label: "Saved Vehicles", value: saved.length, icon: "Heart", href: "/buyer/saved" },
      { label: "Recently Viewed", value: activity?.recently_viewed ?? 0, icon: "Eye", href: "/buyer/explore" },
      { label: "Pending Reports", value: getReportsByUser(userId).filter((r) => r.status === "queued" || r.status === "processing").length, icon: "FileClock", href: "/buyer/reports" },
    ],
    recommended,
    savedCount: saved.length,
    reportVehicle:
      rv && pricing && trust
        ? {
            make: rv.make,
            model: rv.model,
            variant: rv.variant,
            regNo: rv.reg_no,
            year: rv.year,
            km: rv.km_claimed,
            fuel: rv.fuel,
            transmission: rv.transmission,
            trustScore: trust.trustScore,
            bandLabel: trust.bandLabel,
            coverage: trust.evidenceCoverage,
            marketPrice: pricing.estimate,
            priceLow: pricing.low,
            priceHigh: pricing.high,
          }
        : null,
    reportVehicleId: rv?.id ?? null,
    insights: rv ? getInsights(rv.id) : [],
    suspicious: suspicious.map((s) => ({
      id: s.vehicle.id,
      label: `${s.vehicle.make} ${s.vehicle.model}`,
      detail: `Trust score changed to ${s.trust.trustScore}/100 — review the open findings.`,
      status: s.trust.trustScore < 40 ? "suspicious" : "pending",
    })),
    savedListingIds: Array.from(savedListingIds),
    inquiryCount: inquiries.length,
    recentInquiries: inquiries.slice(0, 3).map((q) => ({
      name: q.buyerName,
      vehicle: q.vehicle,
      message: q.message,
      time: relativeTime(q.createdAt),
      initials: q.initials,
    })),
  };
}

// ---------------------------------------------------------------------------
// Seller overview
// ---------------------------------------------------------------------------
export function getSellerOverview(ownerId = "u-seller") {
  const vehicles = getVehiclesByOwner(ownerId);
  // Choose the vehicle with the most open findings (the one needing attention).
  const chosen =
    vehicles
      .map((v) => ({ v, n: getFindings(v.id).filter((f) => f.status !== "cleared").length }))
      .sort((a, b) => b.n - a.n)[0]?.v ?? vehicles[0];
  if (!chosen) {
    return {
      vehicle: null,
      stats: emptySellerStats(),
      recentVehicles: [],
      vehicles: [],
      alerts: [],
      completeness: { percent: 0, items: [] },
      mileage: [],
      listingStatus: { headline: "No vehicle yet", items: [] },
      buyerInterest: { views: 0, saves: 0, inquiries: 0, recent: [] },
      pricing: null,
      hotspots: [],
    };
  }
  return {
    vehicle: chosen,
    stats: getSellerStats(ownerId),
    recentVehicles: vehicles.slice(0, 4).map(vehicleMini),
    vehicles: getSellerVehicles(ownerId).slice(0, 6),
    ...buildSellerVehicle(chosen),
  };
}

function emptySellerStats(): SellerStats {
  return {
    totalVehicles: 0,
    activeListings: 0,
    pendingVerification: 0,
    verifiedVehicles: 0,
    alerts: 0,
    inquiries: 0,
    views: 0,
    saves: 0,
    verificationActivity30d: 0,
    lastVerificationAt: null,
    documentCompleteness: 0,
    listingReadiness: 0,
  };
}

export function getSellerStats(ownerId: string) {
  const vehicles = getVehiclesByOwner(ownerId);
  const listings = vehicles.map((v) => getListingByVehicle(v.id)).filter((l): l is NonNullable<typeof l> => !!l);
  const inquiries = getInquiriesBySeller(ownerId);
  const runs = vehicles.map((v) => getLatestRun(v.id)).filter((r): r is NonNullable<typeof r> => !!r);
  const coverage = vehicles.map((v) => computeCompleteness(getDocuments(v.id).map((d) => ({ type: d.type, status: d.status })), categoryForVehicle(v).id));
  const gates = vehicles.map((v) => buildPublishGate(v.id));
  const days = 1000 * 60 * 60 * 24;
  return {
    totalVehicles: vehicles.length,
    activeListings: listings.filter((l) => l.status === "published").length,
    pendingVerification: vehicles.filter((v) => getDocuments(v.id).some((d) => d.status === "pending" || d.status === "processing")).length,
    verifiedVehicles: vehicles.filter((v) => computeVehicleTrust(v.id).trustScore >= 65).length,
    alerts: vehicles.reduce((n, v) => n + getFindings(v.id).filter((f) => f.status !== "cleared").length, 0),
    inquiries: inquiries.filter((q) => q.status !== "resolved" && q.status !== "cancelled").length,
    views: listings.reduce((n, l) => n + l.views, 0),
    saves: listings.reduce((n, l) => n + l.saves, 0),
    // §3 verification activity: runs in the last 30 days + the most recent one.
    verificationActivity30d: runs.filter((r) => Date.now() - new Date(r.started_at).getTime() < 30 * days).length,
    lastVerificationAt: runs.map((r) => r.started_at).sort().at(-1) ?? null,
    documentCompleteness: vehicles.length ? Math.round(coverage.reduce((n, c) => n + c, 0) / vehicles.length) : 0,
    listingReadiness: listings.length ? Math.round((gates.filter((g) => g.canPublish).length / listings.length) * 100) : 0,
  };
}
export type SellerStats = ReturnType<typeof getSellerStats>;

function vehicleMini(v: VehicleRow) {
  return {
    id: v.id,
    make: v.make,
    model: v.model,
    year: v.year,
    regNo: v.reg_no,
    km: v.km_claimed,
    price: v.asking_price,
    status: v.status,
    trustScore: computeVehicleTrust(v.id).trustScore,
    updatedAt: v.updated_at,
  };
}

function buildSellerVehicle(v: VehicleRow) {
  const findings = getFindings(v.id);
  const docs = getDocuments(v.id);
  const coverage = computeCompleteness(docs.map((d) => ({ type: d.type, status: d.status })), categoryForVehicle(v).id);
  const listing = getListingByVehicle(v.id);
  const pricing = getPricing(v.id);
  const mileage = getMileage(v.id);
  const theft = getTheft(v.id);

  const theftCheck = theftAssessment(theft);

  const alerts = [
    ...findings.map((f) => ({
      title: f.title,
      detail: f.explanation,
      status: statusForFinding(f.severity, f.code),
      findingId: f.id,
    })),
    {
      title: "Theft record",
      detail: theftCheck.note,
      status: theftCheck.status,
    },
  ];

  const docItems = [
    { label: "RC Verified", status: docStatus(docs, "rc"), meta: undefined as string | undefined },
    { label: "Insurance Valid", status: docStatus(docs, "insurance"), meta: undefined },
    { label: "PUC Uploaded", status: docStatus(docs, "puc"), meta: undefined },
    {
      label: "Service Records",
      status: docStatus(docs, "service"),
      meta: `${docs.filter((d) => d.type === "service").length} records`,
    },
  ];

  const gate = buildPublishGate(v.id);
  return {
    alerts,
    completeness: { percent: coverage, items: docItems },
    mileage: mileage.map((m) => ({ year: m.year ?? m.date.slice(0, 4), km: m.km, flagged: !!m.flagged })),
    listingStatus: {
      headline: listing ? listing.headline : "Draft — not published",
      items: [
        { label: "Vehicle details complete", status: requiredFieldsComplete(v) ? "verified" : "pending" },
        { label: "Photos uploaded", status: gate.photoCount >= 3 ? "verified" : "pending" },
        { label: "Documents verified", status: coverage >= 90 ? "verified" : "pending" },
        { label: "Verification run", status: getLatestRun(v.id) ? "verified" : "pending" },
        { label: "Inspection", status: docStatus(docs, "inspection") === "verified" ? "verified" : "pending" },
      ],
      gate,
    },
    buyerInterest: {
      views: listing?.views ?? 0,
      saves: listing?.saves ?? 0,
      inquiries: listing?.inquiries ?? 0,
      recent: (listing ? getInquiriesBySeller(v.owner_id) : []).slice(0, 2).map((q) => ({
        name: q.buyer_name,
        message: q.message,
        time: relativeTime(q.created_at),
        avatarInitials: q.initials,
      })),
    },
    pricing: pricing
      ? {
          low: pricing.low,
          suggested: pricing.estimate,
          high: pricing.high,
          askingPrice: v.asking_price,
          note: "Based on similar vehicles.",
          confidence: pricing.confidence,
          comparables: pricing.comparables,
        }
      : null,
    hotspots: hotspotsFor(v.id),
    documents: docs,
    findings,
    gate,
  };
}

function docStatus(docs: { type: string; status: string }[], type: string): string {
  return docs.find((d) => d.type === type)?.status ?? "unavailable";
}

function relativeTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function hotspotsFor(vehicleId: string) {
  const damage = getDamage(vehicleId);
  const { categoryId, interactionsAvailable, defs } = componentsForVehicle(vehicleId);
  // The car GLB has a measured mesh->component alias table. Applying that table
  // to a scooter would silently translate a scooter zone into a car component.
  const aliases = interactionsAvailable;
  return defs.map((comp) => {
    const records = damage.filter((d) => {
      if (d.status === "detected_candidate" || d.status === "rejected") return false;
      if (d.component_id === comp.id || d.zone_id === comp.id) return true;
      return aliases && mapZoneToComponentId(d.zone_id) === comp.id;
    });

    return {
      id: comp.id,
      label: comp.label,
      componentId: comp.id,
      category: comp.category,
      categoryId,
      available: comp.available,
      interactionsAvailable,
      unavailableReason: comp.unavailableReason,
      position: comp.defaultHotspotAnchor,
      explosionVector: comp.explosionVector,
      damage: records.map((d) => ({
        id: d.id,
        severity: d.severity,
        description: d.description,
        repairStatus: d.repair_status,
        repairDetails: d.repair_details,
        inspectionDate: d.inspection_date,
        status: d.status,
        photoKeys: (() => {
          try {
            return JSON.parse(d.photo_keys || "[]");
          } catch {
            return [];
          }
        })(),
        repairInvoiceDocId: d.repair_invoice_doc_id,
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Vehicle detail & report
// ---------------------------------------------------------------------------
export function getVehicleReport(vehicleId: string, viewerId?: string) {
  const v = getVehicle(vehicleId);
  if (!v) return null;
  const docs = getDocuments(vehicleId);
  const listing = getListingByVehicle(vehicleId);
  const seller = getUserById(v.owner_id);
  const viewer = viewerId ? getUserById(viewerId) : undefined;
  const isOwner = viewerId === v.owner_id;
  const isAdmin = viewer?.role === "admin";
  const isPublic = !!listing && listing.status === "published";
  // Buyers and anonymous visitors only ever see consented documents from a
  // published listing. Sellers/admin see the full evidence set for their own.
  const visibleDocs = isOwner || isAdmin ? docs : isPublic ? docs.filter((d) => !!d.consent) : [];
  return {
    vehicle: v,
    seller: seller
      ? { id: seller.id, name: seller.name, type: seller.seller_type, businessName: seller.business_name, verified: seller.kyc_status === "verified" }
      : null,
    trust: computeVehicleTrust(vehicleId),
    pricing:
      getPricing(vehicleId) ?? {
        vehicle_id: vehicleId,
        ...estimatePrice({
          base: v.base_value || 1000000,
          ageYears: new Date().getFullYear() - v.year,
          km: v.km_claimed,
          conditionScore: v.condition_score,
        }),
        comparables: 0,
        method: "deterministic_depreciation",
        computed_at: new Date().toISOString(),
      },
    insights: getInsights(vehicleId),
    documents: visibleDocs.map((d) => ({ ...d, consent: !!d.consent })),
    documentCount: docs.length,
    isOwner,
    history: getHistory(vehicleId),
    mileage: getMileage(vehicleId),
    damage: getDamage(vehicleId),
    batteryRecords: hasBatteryPack(categoryIdForVehicle(vehicleId)) ? getBatteryRecords(vehicleId) : [],
    findings: getFindings(vehicleId).map(findingView),
    listing,
    theft: getTheft(vehicleId),
    chain: getChainStatus(vehicleId),
    coverage: computeCompleteness(docs.map((d) => ({ type: d.type, status: d.status })), categoryIdForVehicle(vehicleId)),
    category: {
      id: categoryForVehicle(getVehicle(vehicleId) ?? {}).id,
      label: categoryLabel(categoryIdForVehicle(vehicleId)),
      identifierLabel: labelsForCategory(categoryIdForVehicle(vehicleId)).primaryIdentifier,
      odometerLabel: labelsForCategory(categoryIdForVehicle(vehicleId)).odometer,
    },
    saved: !!(viewerId && listing && getSavedRow(viewerId, listing.id)),
  };
}

export function getVehicleDetail(vehicleId: string, viewerId = "u-buyer") {
  const report = getVehicleReport(vehicleId, viewerId);
  if (!report) return null;
  const listing = report.listing;
  const similar = getMarketplace({ make: report.vehicle.make, pageSize: 3, page: 1 }, viewerId).items.filter((x) => x.id !== vehicleId);
  return {
    ...report,
    similar,
    publicDocuments: report.documents.filter((d) => d.consent),
    listingId: listing?.id ?? null,
    gallery: listing ? getListingImages(listing.id) : [],
  };
}

export function findingView(f: ReturnType<typeof getFindings>[number]) {
  return {
    id: f.id,
    code: f.code,
    severity: f.severity,
    title: f.title,
    explanation: f.explanation,
    recommendation: f.recommendation,
    evidence: safeJson<Record<string, unknown>>(f.evidence, {}),
    responsibleDocumentId: f.responsible_doc,
    points: f.points,
    status: f.status,
    createdAt: f.created_at,
  };
}

export function getRiskAnalysis(vehicleId: string) {
  const report = getVehicleReport(vehicleId);
  if (!report) return null;
  const open = report.findings.filter((f) => f.status !== "cleared");
  const totalPenalty = report.trust.breakdown.reduce((sum, b) => sum + b.points, 0);
  return {
    vehicle: report.vehicle,
    trust: report.trust,
    riskScore: report.trust.riskScore,
    band: report.trust.band,
    bandLabel: report.trust.bandLabel,
    findings: open,
    recommendedAction: recommendedAction(open),
    coverage: report.coverage,
    rules: open.map((f) => ({
      code: f.code,
      title: f.title,
      severity: f.severity,
      weight: f.points,
      status: f.status,
      explanation: f.explanation,
    })),
    calculation: {
      version: "rules-v1.0",
      formula: "trust = evidence coverage points - sum(open finding points)",
      coveragePoints: Math.min(100, report.trust.trustScore + totalPenalty),
      penaltyPoints: totalPenalty,
      trustScore: report.trust.trustScore,
      band: report.trust.bandLabel,
      bands: [
        { band: "Strong verification", range: "85-100" },
        { band: "Moderate", range: "65-84" },
        { band: "Caution", range: "40-64" },
        { band: "High risk", range: "0-39" },
      ],
      documentation: Object.entries(DOC_WEIGHTS).map(([type, weight]) => {
        const doc = report.documents.find((d) => d.type === type);
        return { type, weight, status: doc?.status ?? "missing", counted: doc?.status === "verified" ? weight : 0 };
      }),
      deductions: report.trust.breakdown,
      grounded: true,
    },
    chain: report.chain,
    disclaimer:
      "Trust and risk are calculated by a deterministic rules engine from verified records. Findings are warnings that need investigation — they are not proof of fraud.",
  };
}

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------
export function getMarketplace(filters: MarketplaceFilters = {}, viewerId?: string) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, filters.pageSize ?? 12));
  const listings = getAllListings().filter((l) => l.status === "published");
  let items = listings
    .map((l) => {
      const v = getVehicle(l.vehicle_id);
      if (!v) return null;
      const seller = getUserById(v.owner_id);
      const trust = computeVehicleTrust(v.id);
      const docs = getDocuments(v.id);
      return {
        id: v.id,
        listingId: l.id,
        make: v.make,
        model: v.model,
        variant: v.variant,
        year: v.year,
        regNo: v.reg_no,
        vin: v.vin,
        trustdriveId: v.trustdrive_id,
        km: v.km_claimed,
        price: v.asking_price,
        fuel: v.fuel,
        transmission: v.transmission,
        location: v.location,
        ownershipCount: v.ownership_count,
        condition: v.condition,
        category: v.category,
        categoryId: categoryForVehicle(v).id,
        categoryLabel: categoryLabel(categoryForVehicle(v).id),
        primaryIdentifierLabel: labelsForCategory(categoryForVehicle(v).id).primaryIdentifier,
        odometerLabel: labelsForCategory(categoryForVehicle(v).id).odometer,
        isElectric: isElectric(categoryForVehicle(v).id),
        model3dStatus: modelAssetForCategory(categoryForVehicle(v).id).status,
        trustScore: trust.trustScore,
        coverage: trust.evidenceCoverage,
        band: trust.band,
        sellerName: seller?.name ?? "TrustDrive seller",
        sellerType: seller?.seller_type ?? "individual",
        saved: !!(viewerId && getSavedRow(viewerId, l.id)),
        publishedAt: l.published_at,
        hasAccident: getDamage(v.id).some((d) => d.severity !== "Minor" || d.status === "verified"),
        findings: getFindings(v.id).filter((f) => f.status !== "cleared").length,
        createdAt: l.created_at,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const q = filters.q?.trim().toLowerCase();
  if (q) {
    items = items.filter((i) =>
      `${i.make} ${i.model} ${i.variant} ${i.regNo} ${i.vin} ${i.trustdriveId} ${i.location} ${i.fuel} ${i.transmission}`
        .toLowerCase()
        .includes(q)
    );
  }
  if (filters.make) items = items.filter((i) => i.make.toLowerCase() === filters.make!.toLowerCase());
  if (filters.category) {
    const wanted = filters.category.toLowerCase();
    items = items.filter((i) => {
      if (i.categoryId.toLowerCase() === wanted) return true;
      const cat = getCategory(i.categoryId);
      return !!cat && (cat.class === wanted || cat.label.toLowerCase() === wanted);
    });
  }
  if (filters.priceMin != null) items = items.filter((i) => i.price >= filters.priceMin!);
  if (filters.priceMax != null) items = items.filter((i) => i.price <= filters.priceMax!);
  if (filters.yearMin != null) items = items.filter((i) => i.year >= filters.yearMin!);
  if (filters.yearMax != null) items = items.filter((i) => i.year <= filters.yearMax!);
  if (filters.kmMax != null) items = items.filter((i) => i.km <= filters.kmMax!);
  if (filters.fuel) items = items.filter((i) => i.fuel.toLowerCase() === filters.fuel!.toLowerCase());
  if (filters.transmission) items = items.filter((i) => i.transmission.toLowerCase() === filters.transmission!.toLowerCase());
  if (filters.location) items = items.filter((i) => i.location.toLowerCase().includes(filters.location!.toLowerCase()));
  if (filters.ownershipMax != null) items = items.filter((i) => i.ownershipCount <= filters.ownershipMax!);
  if (filters.condition) items = items.filter((i) => i.condition.toLowerCase() === filters.condition!.toLowerCase());
  if (filters.verification === "verified") items = items.filter((i) => i.trustScore >= 65);
  if (filters.verification === "caution") items = items.filter((i) => i.trustScore < 65);
  if (filters.accident === "found") items = items.filter((i) => i.hasAccident);
  if (filters.accident === "none") items = items.filter((i) => !i.hasAccident);
  if (filters.trustMin != null) items = items.filter((i) => i.trustScore >= filters.trustMin!);

  switch (filters.sort) {
    case "lowest_price":
      items.sort((a, b) => a.price - b.price);
      break;
    case "highest_price":
      items.sort((a, b) => b.price - a.price);
      break;
    case "lowest_mileage":
      items.sort((a, b) => a.km - b.km);
      break;
    case "highest_trust":
      items.sort((a, b) => b.trustScore - a.trustScore);
      break;
    case "recently_verified":
    case "newest":
    default:
      items.sort((a, b) => new Date(b.publishedAt ?? b.createdAt).getTime() - new Date(a.publishedAt ?? a.createdAt).getTime());
  }

  const total = items.length;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total, page, pageSize, hasMore: start + pageSize < total };
}

export function getExploreVehicles(userId = "u-buyer", tab = "All") {
  const all = getMarketplace({ pageSize: 48 }, userId).items;
  if (tab === "Verified") return all.filter((v) => v.trustScore >= 65);
  if (tab === "Recommended") return all.filter((v) => v.trustScore >= 85).slice(0, 6);
  if (tab === "Popular") return [...all].sort((a, b) => b.trustScore - a.trustScore).slice(0, 6);
  if (tab === "Recently added") return [...all].sort((a, b) => new Date(b.publishedAt ?? "").getTime() - new Date(a.publishedAt ?? "").getTime());
  return all;
}

export function getRecommendedVehicles(userId = "u-buyer") {
  const saved = new Set(getSavedRows(userId).map((s) => s.listing_id));
  const priority = ["v-bmw", "v-audi", "v-merc", "v-hyundai"];
  const seeded = priority
    .map((id) => getVehicle(id))
    .filter((v): v is VehicleRow => !!v)
    .map((v) => {
      const listing = getListingByVehicle(v.id);
      return {
        id: v.id,
        listingId: listing?.id ?? null,
        make: v.make,
        model: v.model,
        year: v.year,
        km: v.km_claimed,
        price: v.asking_price,
        fuel: v.fuel,
        trustScore: computeVehicleTrust(v.id).trustScore,
        saved: !!(listing && saved.has(listing.id)),
      };
    });
  if (seeded.length >= 4) return seeded;
  const seen = new Set(seeded.map((s) => s.id));
  const live = getExploreVehicles(userId, "Popular")
    .filter((v) => !seen.has(v.id))
    .slice(0, 4 - seeded.length)
    .map((v) => ({
      id: v.id,
      listingId: v.listingId ?? null,
      make: v.make,
      model: v.model,
      year: v.year,
      km: v.km,
      price: v.price,
      fuel: v.fuel,
      trustScore: v.trustScore,
      saved: v.saved,
    }));
  return [...seeded, ...live];
}

export function getSavedVehicles(userId = "u-buyer") {
  return getSavedRows(userId)
    .map((s) => {
      const listing = getListing(s.listing_id);
      const v = listing ? getVehicle(listing.vehicle_id) : undefined;
      if (!listing || !v) return null;
      return {
        id: v.id,
        listingId: listing.id,
        make: v.make,
        model: v.model,
        year: v.year,
        regNo: v.reg_no,
        km: v.km_claimed,
        price: v.asking_price,
        trustScore: computeVehicleTrust(v.id).trustScore,
        availability:
          listing.status === "sold" ? "Sold" : listing.status === "published" ? "Available" : "Removed",
        priceAtSave: s.price_at_save,
        priceChanged: s.price_at_save !== v.asking_price,
        listName: s.list_name,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
}

export function getCompareVehicles(ids: string[], userId = "u-buyer") {
  const rows = ids
    .map((id) => {
      const direct = getVehicle(id);
      if (direct) return direct;
      const listing = getListing(id);
      return listing ? getVehicle(listing.vehicle_id) : undefined;
    })
    .filter((v): v is VehicleRow => !!v)
    .map((v) => {
      const trust = computeVehicleTrust(v.id);
      const pricing = getPricing(v.id);
      const docs = getDocuments(v.id);
      return {
        id: v.id,
        name: `${v.make} ${v.model}`,
        year: v.year,
        km: v.km_claimed,
        fuel: v.fuel,
        transmission: v.transmission,
        ownership: v.ownership_count,
        price: v.asking_price,
        trustScore: trust.trustScore,
        coverage: computeCompleteness(docs.map((d) => ({ type: d.type, status: d.status })), categoryForVehicle(v).id),
        findings: getFindings(v.id).filter((f) => f.status !== "cleared").length,
        market: pricing?.estimate ?? v.asking_price,
        damage: getDamage(v.id).length,
        serviceComplete: docs.some((d) => d.type === "service" && d.status === "verified"),
        accident: getDamage(v.id).some((d) => d.severity !== "Minor"),
        saved: !!(getListingByVehicle(v.id) && getSavedRow(userId, getListingByVehicle(v.id)!.id)),
      };
    });
  const diffs = keyDifferences(
    rows.map((r) => ({
      name: r.name,
      year: r.year,
      km: r.km,
      price: r.price,
      trustScore: r.trustScore,
      coverage: r.coverage,
      findings: r.findings,
      market: r.market,
    }))
  );
  return { rows, differences: diffs };
}

export function getSavedSearchesFor(userId = "u-buyer") {
  return getSavedSearches(userId).map((s) => ({
    id: s.id,
    name: s.name,
    filters: safeJson<Record<string, unknown>>(s.filters, {}),
    alertsEnabled: !!s.alerts_enabled,
    createdAt: s.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Seller listings
// ---------------------------------------------------------------------------
export function getSellerVehicles(ownerId = "u-seller") {
  return getVehiclesByOwner(ownerId).map((v) => {
    const trust = computeVehicleTrust(v.id);
    const listing = getListingByVehicle(v.id);
    return {
      id: v.id,
      make: v.make,
      model: v.model,
      variant: v.variant,
      year: v.year,
      regNo: v.reg_no,
      vin: v.vin,
      km: v.km_claimed,
      price: v.asking_price,
      fuel: v.fuel,
      transmission: v.transmission,
      location: v.location,
      status: v.status,
      trustScore: trust.trustScore,
      band: trust.band,
      coverage: trust.evidenceCoverage,
      categoryId: categoryForVehicle(v).id,
      categoryLabel: categoryLabel(categoryForVehicle(v).id),
      listingStatus: listing?.status ?? "draft",
      listingId: listing?.id ?? null,
      findings: getFindings(v.id).filter((f) => f.status !== "cleared").length,
      photos: listing ? getListingImages(listing.id).length : 0,
      updatedAt: v.updated_at,
    };
  });
}

export function getSellerListings(ownerId = "u-seller") {
  return getVehiclesByOwner(ownerId).map((v) => {
    const listing = getListingByVehicle(v.id);
    const trust = computeVehicleTrust(v.id);
    const gate = buildPublishGate(v.id);
    return {
      vehicle: vehicleMini(v),
      listing: listing
        ? {
            id: listing.id,
            status: listing.status,
            headline: listing.headline,
            description: listing.description,
            condition: listing.condition,
            location: listing.location,
            coverImage: listing.cover_image,
            views: listing.views,
            saves: listing.saves,
            inquiries: listing.inquiries,
            publishedAt: listing.published_at,
            createdAt: listing.created_at,
            updatedAt: listing.updated_at,
          }
        : null,
      trustScore: trust.trustScore,
      gate,
      photos: listing ? getListingImages(listing.id).length : 0,
    };
  });
}

export function getSellerListingForActor(actorId: string, listingId: string) {
  const listing = getListing(listingId);
  if (!listing) return { ok: false as const, code: "NOT_FOUND", message: "Listing not found." };
  const v = getVehicle(listing.vehicle_id);
  if (!v || v.owner_id !== actorId) return { ok: false as const, code: "FORBIDDEN", message: "You do not own this listing." };
  return {
    ok: true as const,
    listing: {
      id: listing.id,
      vehicleId: listing.vehicle_id,
      status: listing.status,
      headline: listing.headline,
      description: listing.description,
      condition: listing.condition,
      location: listing.location,
      views: listing.views,
      saves: listing.saves,
      inquiries: listing.inquiries,
      coverImage: listing.cover_image,
      publishedAt: listing.published_at,
      createdAt: listing.created_at,
      updatedAt: listing.updated_at,
    },
    vehicle: {
      ...vehicleMini(v),
      askingPrice: v.asking_price,
      status: v.status,
      condition: v.condition,
      description: v.description,
      color: v.color,
      ownershipCount: v.ownership_count,
      vin: v.vin,
      trustdriveId: v.trustdrive_id,
    },
    trust: computeVehicleTrust(v.id),
    gate: buildPublishGate(v.id),
    photos: getListingImages(listing.id).map((p) => ({
      id: p.id,
      position: p.position,
      key: p.file_key,
      kind: p.kind,
      url: `/api/v1/files/${p.file_key}`,
    })),
    events: getListingEvents(listing.id).map((e) => ({
      id: e.id,
      type: e.type,
      actorId: e.actor_id,
      createdAt: e.at,
    })),
  };
}

const LISTING_CONDITIONS = ["Excellent", "Good", "Fair", "Needs work"];

/**
 * Mints a revocable, HMAC-signed public share link for a listing plus the QR
 * payload for it. The token resolves to the consent-filtered public report, so
 * sharing never exposes private seller documents.
 */
export async function createListingShareForActor(actorId: string, listingId: string, origin: string) {
  const listing = getListing(listingId);
  if (!listing) return { ok: false as const, code: "NOT_FOUND", message: "Listing not found." };
  const vehicle = getVehicle(listing.vehicle_id);
  if (!vehicle || vehicle.owner_id !== actorId) {
    return { ok: false as const, code: "FORBIDDEN", message: "You do not own this listing." };
  }
  const base = origin.replace(/\/+$/, "");
  const jti = newJti();
  const token = signQrToken(vehicle.id, jti);
  createQrToken(jti, vehicle.id, token, actorId);
  trackListingEvent(`ev-${Date.now()}`, listingId, "share", actorId);
  const verifyUrl = `${base}/verify/${encodeURIComponent(token)}`;
  const { default: QRCode } = await import("qrcode");
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    margin: 1,
    width: 240,
    errorCorrectionLevel: "M",
    color: { dark: "#17191B", light: "#FFFFFF" },
  });
  return {
    ok: true as const,
    listingUrl: `${base}/vehicle/${vehicle.id}`,
    verifyUrl,
    qrDataUrl,
    token,
    activeShares: getQrTokensForVehicle(vehicle.id).filter((t) => !t.revoked_at).length,
    sharedAt: new Date().toISOString(),
  };
}

export function revokeListingSharesForActor(actorId: string, listingId: string) {
  const listing = getListing(listingId);
  if (!listing) return { ok: false as const, code: "NOT_FOUND", message: "Listing not found." };
  const vehicle = getVehicle(listing.vehicle_id);
  if (!vehicle || vehicle.owner_id !== actorId) {
    return { ok: false as const, code: "FORBIDDEN", message: "You do not own this listing." };
  }
  revokeQrTokens(vehicle.id);
  trackListingEvent(`ev-${Date.now()}`, listingId, "share_revoked", actorId);
  return { ok: true as const, activeShares: 0 };
}

export function updateListingForActor(
  actorId: string,
  listingId: string,
  input: { headline?: string; description?: string; condition?: string; location?: string; price?: number }
) {
  const owned = getSellerListingForActor(actorId, listingId);
  if (!owned.ok) return owned;
  if (owned.listing.status === "sold") {
    return { ok: false as const, code: "INVALID_TRANSITION", message: "A sold listing can no longer be edited." };
  }
  if (input.headline !== undefined && (!input.headline.trim() || input.headline.length > 140)) {
    return { ok: false as const, code: "VALIDATION_FAILED", message: "Headline must be 1–140 characters." };
  }
  if (input.description !== undefined && input.description.length > 5000) {
    return { ok: false as const, code: "VALIDATION_FAILED", message: "Description must be 5,000 characters or fewer." };
  }
  if (input.condition !== undefined && !LISTING_CONDITIONS.includes(input.condition)) {
    return { ok: false as const, code: "VALIDATION_FAILED", message: `Condition must be one of: ${LISTING_CONDITIONS.join(", ")}.` };
  }
  if (input.location !== undefined && input.location.length > 100) {
    return { ok: false as const, code: "VALIDATION_FAILED", message: "Location must be 100 characters or fewer." };
  }
  if (input.price !== undefined && (!Number.isFinite(input.price) || input.price < 0 || input.price > 100_000_000)) {
    return { ok: false as const, code: "VALIDATION_FAILED", message: "Price must be a number between 0 and 10 crore." };
  }

  const now = new Date().toISOString();
  updateListing(listingId, {
    headline: input.headline?.trim(),
    description: input.description,
    condition: input.condition,
    location: input.location?.trim(),
  });
  if (input.price !== undefined) updateVehicle(owned.listing.vehicleId, { asking_price: Math.round(input.price) });
  trackListingEvent(`ev-${Date.now()}`, listingId, "edit", actorId);
  appendChainRecord(owned.listing.vehicleId, "listing", listingId, {
    action: "edit",
    fields: Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined),
    at: now,
  });
  return getSellerListingForActor(actorId, listingId);
}

export function getPublishGateFor(vehicleId: string) {
  return buildPublishGate(vehicleId);
}

function requiredFieldsComplete(v: VehicleRow) {
  return !!(v.make && v.model && v.reg_no && v.vin && v.year && v.fuel && v.transmission && v.location && v.asking_price > 0);
}

function buildPublishGate(vehicleId: string) {
  const v = getVehicle(vehicleId);
  if (!v) return { blockers: ["Vehicle not found."], warnings: [], photoCount: 0, canPublish: false };
  const listing = getListingByVehicle(vehicleId);
  const photos = listing ? getListingImages(listing.id).length : 0;
  const findings = getFindings(vehicleId);
  const docs = getDocuments(vehicleId);
  const cat = primaryDocumentTypes(vehicleId);
  const gate = publishGate({
    photoCount: photos,
    criticalVinMismatch: findings.some((f) => f.status !== "cleared" && (f.code === "VIN_MISMATCH" || f.code === "DOCUMENT_MISMATCH") && (f.severity === "high" || f.severity === "critical")),
    rcMissing: !docs.some((d) => (d.type === cat.rc || d.type === "rc") && d.status === "verified"),
    requiredFieldsMissing: !requiredFieldsComplete(v),
    askingPrice: v.asking_price,
    insuranceExpired: findings.some((f) => f.status !== "cleared" && f.code === "INSURANCE_EXPIRED"),
    mileageFindingOpen: findings.some((f) => f.status !== "cleared" && (f.code.startsWith("MILEAGE") || f.code === "ODOMETER_ROLLBACK")),
    documentsPending: docs.some((d) => d.status === "pending" || d.status === "processing"),
    inspectionPending: !docs.some((d) => d.type === "inspection" && d.status === "verified"),
  });
  return { ...gate, photoCount: photos, canPublish: gate.blockers.length === 0 };
}

// ---------------------------------------------------------------------------
// Documents / history / mileage / damage / verification
// ---------------------------------------------------------------------------
const DOC_META_KEYS = new Set([
  "method",
  "confidence",
  "confidences",
  "engine",
  "is_ocr",
  "flags",
  "comparison",
  "workflow",
  "version",
  "source",
  "warning",
  "expiry",
  "duplicate_of",
  "review_id",
  "pages",
]);

export function getDocumentsView(vehicleId: string) {
  const docs = getDocuments(vehicleId);
  return docs.map((d) => {
    const extRow = d as unknown as {
      ocr_extracted?: string | null;
      ocr_status?: string | null;
      ocr_confidence?: number | null;
    };
    const parsed = safeJson<Record<string, unknown>>(d.extracted, {});
    const nestedFields =
      parsed.fields && typeof parsed.fields === "object" && !Array.isArray(parsed.fields)
        ? (parsed.fields as Record<string, unknown>)
        : null;
    const parsedOcr =
      typeof extRow.ocr_extracted === "string" && extRow.ocr_extracted.trim()
        ? safeJson<Record<string, unknown>>(extRow.ocr_extracted, {})
        : null;
    // Legacy/seed rows store a flat field map; new rows nest `fields` beside the
    // engine metadata so one extractor row can be written per real field.
    const rawExtractedFields =
      nestedFields ??
      Object.fromEntries(Object.entries(parsed).filter(([key]) => !DOC_META_KEYS.has(key)));
    const extractedFields =
      Object.keys(rawExtractedFields).length > 0
        ? rawExtractedFields
        : parsedOcr && typeof parsedOcr === "object" && !Array.isArray(parsedOcr)
          ? Object.fromEntries(Object.entries(parsedOcr).filter(([key]) => !DOC_META_KEYS.has(key)))
          : {};
    const flags = Array.isArray(parsed.flags) ? parsed.flags.map(String) : [];
    return {
      ...d,
      consent: !!d.consent,
      extractedFields,
      ocr: {
        ran: parsed.source === "python-intelligence",
        engine: typeof parsed.engine === "string" ? parsed.engine : null,
        method: typeof parsed.method === "string" ? parsed.method : null,
        isOcr: parsed.is_ocr === true,
        confidence:
          typeof parsed.confidence === "number"
            ? parsed.confidence
            : typeof extRow.ocr_confidence === "number"
              ? extRow.ocr_confidence
              : null,
        ocrStatus:
          typeof extRow.ocr_status === "string"
            ? extRow.ocr_status
            : typeof parsed.ocr_status === "string"
              ? parsed.ocr_status
              : null,
        flags,
        reviewId: typeof parsed.review_id === "string" ? parsed.review_id : null,
        workflow: Array.isArray(parsed.workflow) ? parsed.workflow : [],
      },
      shortHash: d.sha256.slice(0, 12),
      duplicate: getDuplicateDocumentCount(d.sha256) > 1,
      canReplace: d.status !== "verified",
    };
  });
}

export function getVerificationChecks(vehicleId: string) {
  const docs = getDocuments(vehicleId);
  const findings = getFindings(vehicleId);
  const has = (code: string) => findings.some((f) => f.code === code && f.status !== "cleared");
  const mileageBad = findings.some((f) => f.status !== "cleared" && (f.code.startsWith("MILEAGE") || f.code === "ODOMETER_ROLLBACK"));
  const chain = getChainStatus(vehicleId);
  const theftCheck = theftAssessment(getTheft(vehicleId));
  const ds = (t: string) => docStatus(docs, t);
  const duplicate = docs.some((d) => getDuplicateDocumentCount(d.sha256) > 1);
  const run = getLatestRun(vehicleId);
  const vehicle = getVehicle(vehicleId);
  const parsedDocs = docs.map((d) => safeJson<Record<string, unknown>>(d.extracted, {}));
  const docsJson = JSON.stringify(parsedDocs).toLowerCase();
  const vinObserved = !!vehicle?.vin && docsJson.includes(vehicle.vin.toLowerCase());
  const machineRead = parsedDocs.some((p) => p.source === "python-intelligence");
  const independentMileage = getMileage(vehicleId).filter(
    (m) => Number(m.verified) === 1 && Number(m.is_seller_claim) !== 1
  );
  // Category-aware document checks: a two-wheeler has an RC/insurance issued
  // for that class, and an electric vehicle has no PUC at all.
  const cat = primaryDocumentTypes(vehicleId);
  const idLabel = labelsForCategory(cat.categoryId).primaryIdentifier;
  const batteryDocs = ["battery_health", "battery_warranty", "battery_inspection"];

  return [
    {
      key: "registration_match",
      label: "Registration match",
      status: ds(cat.rc) === "verified" ? "verified" : ds(cat.rc) === "unavailable" ? "unavailable" : "pending",
      note: ds(cat.rc) === "unavailable" ? `No ${documentLabel(cat.rc)} on file — nothing to compare` : "RC vs vehicle record",
      source: documentLabel(cat.rc),
    },
    {
      key: "vin_match",
      label: `${idLabel} match`,
      status:
        has("DOCUMENT_MISMATCH") || has("VIN_MISMATCH")
          ? "needs_correction"
          : vinObserved
            ? "verified"
            : "unavailable",
      note:
        has("DOCUMENT_MISMATCH") || has("VIN_MISMATCH")
          ? "VIN differs across documents"
          : vinObserved
            ? "VIN found in extracted document fields"
            : "No extracted document field contains the VIN — not checked",
      source: "Document extraction",
    },
    { key: "rc", label: `${documentLabel(cat.rc)} verification`, status: ds(cat.rc), note: ds(cat.rc) === "unavailable" ? "No RC uploaded" : "Automated field checks", source: "Document extraction" },
    { key: "insurance", label: "Insurance validity", status: ds(cat.insurance), note: ds(cat.insurance) === "unavailable" ? "No insurance document" : "Policy fields extracted", source: "Insurer document" },
    cat.pucRequired
      ? { key: "puc", label: "PUC validity", status: ds("puc"), note: ds("puc") === "unavailable" ? "No PUC document" : "Emission certificate fields", source: "PUC document" }
      : { key: "puc", label: "PUC validity", status: "not_applicable", note: "No combustion engine — a PUC certificate does not apply to this vehicle.", source: "Category rules" },
    // Only electric profiles expose a battery check; the legacy car check list
    // keeps its original length so existing verification evidence is unchanged.
    ...(hasBatteryPack(cat.categoryId)
      ? [{ key: "battery_evidence", label: "Battery evidence", status: batteryDocs.some((t) => ds(t) === "verified") ? "verified" : "unavailable", note: batteryDocs.some((t) => ds(t) === "verified") ? "At least one battery document is verified; State of Health is never inferred from photographs or distance." : "No battery health, warranty or inspection report on file — battery condition is unverified.", source: "Battery documents" }]
      : []),
    {
      key: "consistency",
      label: "Document consistency",
      status: has("DOCUMENT_MISMATCH") || has("MANIPULATION") || has("DATE_INCONSISTENCY") ? "needs_correction" : machineRead ? "verified" : "unavailable",
      note:
        has("DOCUMENT_MISMATCH") || has("MANIPULATION") || has("DATE_INCONSISTENCY")
          ? "Cross-document fields or dates conflict"
          : machineRead
            ? "Cross-document fields compared"
            : "No machine-read document to compare yet",
      source: "Rules engine",
    },
    {
      key: "duplicates",
      label: "Duplicate documents",
      status: duplicate || has("DUPLICATE_DOCUMENT") || has("DUPLICATE_DOCUMENT_REFERENCE") || has("CROSS_VEHICLE_REFERENCE")
        ? "suspicious"
        : docs.length === 0
          ? "unavailable"
          : "verified",
      note: has("CROSS_VEHICLE_REFERENCE")
        ? "A document reference number is already attached to another vehicle"
        : has("DUPLICATE_DOCUMENT_REFERENCE")
          ? "Duplicate invoice/document reference on this vehicle"
          : duplicate || has("DUPLICATE_DOCUMENT")
            ? "Duplicate file SHA-256 hash found"
            : docs.length === 0
              ? "No documents on file"
              : "No duplicate file hash or reference found",
      source: "SHA-256 & reference check",
    },
    {
      key: "mileage",
      label: "Mileage consistency",
      status: mileageBad ? "suspicious" : independentMileage.length === 0 ? "unavailable" : "verified",
      note: mileageBad ? "Reading flagged" : independentMileage.length === 0 ? "Only seller-declared readings — no independent source" : "Consistent with independent readings",
      source: "Rules engine",
    },
    { key: "ownership", label: "Ownership consistency", status: ds("ownership"), note: ds("ownership") === "unavailable" ? "No ownership document" : "Ownership chain", source: "Ownership document" },
    { key: "chain", label: "Record integrity (hash)", status: chain.intact ? "verified" : "suspicious", note: chain.intact ? `Hash chain intact (${chain.records} records)` : `Chain broken at record ${chain.brokenAt}`, source: "Hash chain" },
    { key: "theft", label: "Theft check", status: theftCheck.status, note: theftCheck.note, source: theftCheck.source },
    { key: "run", label: "Latest verification run", status: run?.status === "done" ? "verified" : "pending", note: run ? `Run ${run.id}` : "Not run yet", source: "Pipeline" },
  ] as { key: string; label: string; status: string; note: string; source: string }[];
}

export function getHistoryView(vehicleId: string) {
  return getHistory(vehicleId).map((h) => ({
    ...h,
    evidence: h.evidence_document_id ? getDocument(h.evidence_document_id) : undefined,
    chain: getChainStatus(vehicleId),
  }));
}

export function getMileageView(vehicleId: string) {
  const readings = getMileage(vehicleId);
  return {
    readings: readings.map((m) => ({
      id: m.id,
      year: m.year ?? m.date.slice(0, 4),
      km: m.km,
      source: m.source,
      date: m.date,
      flagged: !!m.flagged,
      verified: !!m.verified,
      sellerClaim: !!m.is_seller_claim,
    })),
    verifiedKm: readings.filter((m) => m.verified).slice(-1)[0]?.km ?? 0,
    claimedKm: readings.filter((m) => m.is_seller_claim).slice(-1)[0]?.km ?? 0,
  };
}

export function getDamageView(vehicleId: string) {
  const hotspots = hotspotsFor(vehicleId);
  return getDamage(vehicleId).map((d) => ({
    ...d,
    // Only the vehicle's own category registry may resolve a zone label.
    // The car mesh alias table is never applied to a two-wheeler record.
    zone:
      hotspots.find((h) => h.id === d.component_id)?.label ??
      hotspots.find((h) => h.id === d.zone_id)?.label ??
      d.zone_id ??
      d.component_id ??
      "detected_damage",
    componentValidForCategory: !!d.component_id && hotspots.some((h) => h.id === d.component_id),
  }));
}

export function getChainStatus(vehicleId: string) {
  const rows = getChain(vehicleId);
  const records: ChainRecord[] = rows.map((r) => ({
    seq: r.seq,
    payload: safeJson<unknown>(r.payload, {}),
    prevHash: r.prev_hash,
    recordHash: r.record_hash,
  }));
  const v = verifyChain(records);
  return {
    vehicleId,
    records: records.length,
    intact: v.intact,
    brokenAt: v.brokenAt,
    latestHash: records.length ? records[records.length - 1].recordHash : null,
    entries: rows.map((r) => ({ seq: r.seq, entityType: r.entity_type, entityId: r.entity_id, createdAt: r.created_at, recordHash: r.record_hash })),
  };
}

// ---------------------------------------------------------------------------
// Inquiries
// ---------------------------------------------------------------------------
export function getInquiriesForSeller(sellerId: string) {
  return getInquiriesBySeller(sellerId).map((q) => inquiryView(q));
}
export function getInquiriesForBuyer(buyerId: string) {
  return getInquiriesByBuyer(buyerId).map((q) => inquiryView(q));
}
export function getInquiryThread(inquiryId: string) {
  const q = getInquiry(inquiryId);
  if (!q) return null;
  const listing = getListing(q.listing_id);
  const vehicle = listing ? getVehicle(listing.vehicle_id) : undefined;
  return {
    ...inquiryView(q),
    messages: getMessages(inquiryId).map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      senderName: m.sender_name,
      body: m.body,
      offerAmount: m.offer_amount,
      scheduledAt: m.scheduled_at,
      attachments: safeJson<string[]>(m.attachments, []),
      createdAt: m.created_at,
    })),
    vehicle: vehicle
      ? { id: vehicle.id, make: vehicle.make, model: vehicle.model, regNo: vehicle.reg_no, price: vehicle.asking_price, listingId: listing?.id }
      : null,
  };
}

function inquiryView(q: NonNullable<ReturnType<typeof getInquiry>>) {
  const listing = getListing(q.listing_id);
  const vehicle = listing ? getVehicle(listing.vehicle_id) : undefined;
  const seller = getUserById(q.seller_id);
  return {
    id: q.id,
    listingId: q.listing_id,
    buyerId: q.buyer_id,
    sellerId: q.seller_id,
    buyerName: q.buyer_name,
    sellerName: seller?.name ?? "Seller",
    sellerInitials: seller?.initials ?? "S",
    initials: q.initials,
    message: q.message,
    type: q.type,
    status: q.status,
    createdAt: q.created_at,
    lastActivityAt: q.last_activity_at,
    vehicle: vehicle ? `${vehicle.make} ${vehicle.model}` : "Vehicle",
    regNo: vehicle?.reg_no ?? "",
    price: vehicle?.asking_price ?? 0,
    messageCount: getMessages(q.id).length,
  };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
export function getReports(userId: string) {
  return getReportsByUser(userId).map((r) => {
    const v = getVehicle(r.vehicle_id);
    return {
      id: r.id,
      reportId: r.report_id,
      type: r.type,
      status: r.status,
      vehicleId: r.vehicle_id,
      vehicle: v ? `${v.make} ${v.model}` : "—",
      regNo: v?.reg_no ?? "",
      createdAt: r.created_at,
      generatedAt: r.generated_at,
      downloadUrl: r.status === "ready" ? `/api/v1/reports/${r.id}/download` : null,
    };
  });
}

export const REPORT_TYPES = [
  "Vehicle verification",
  "Document verification",
  "Vehicle condition",
  "Vehicle history",
  "AI risk analysis",
  "Listing performance",
  "Buyer inquiry",
] as const;

export function getReportForActor(actorId: string, reportId: string) {
  const r = getReport(reportId);
  if (!r) return { ok: false as const, code: "NOT_FOUND", message: "Report not found." };
  const v = getVehicle(r.vehicle_id);
  if (!v) return { ok: false as const, code: "NOT_FOUND", message: "Vehicle not found." };
  const actor = getUserById(actorId);
  const allowed = r.requested_by === actorId || v.owner_id === actorId || actor?.role === "admin";
  if (!allowed) return { ok: false as const, code: "FORBIDDEN", message: "You do not have access to this report." };
  return {
    ok: true as const,
    report: {
      id: r.id,
      reportId: r.report_id,
      type: r.type,
      status: r.status,
      version: r.version,
      snapshotHash: r.snapshot !== "{}" ? r.snapshot : null,
      pdfHash: r.pdf_hash,
      generatedAt: r.generated_at,
      createdAt: r.created_at,
      downloadUrl: r.status === "ready" ? `/api/v1/reports/${r.id}/download` : null,
      requestedBy: r.requested_by === actorId ? "you" : r.requested_by,
    },
    vehicle: vehicleMini(v),
    trust: computeVehicleTrust(v.id),
    chain: getChainStatus(v.id),
  };
}

export function getReportData(reportId: string) {
  const r = getReport(reportId);
  if (!r) return null;
  const v = getVehicle(r.vehicle_id);
  if (!v) return null;
  const trust = computeVehicleTrust(v.id);
  const chain = getChainStatus(v.id);
  const docs = getDocuments(v.id);
  const seller = getUserById(v.owner_id);
  const qr = getQrTokensForVehicle(v.id).find((t) => !t.revoked_at);
  const base = (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
  const snapshotHash = sha256(
    canonical({
      reportId: r.report_id,
      vehicleId: v.id,
      trustScore: trust.trustScore,
      findings: getFindings(v.id).map((f) => [f.code, f.status, f.points]),
      documents: docs.map((d) => [d.id, d.sha256, d.status, d.version]),
      chain: chain.latestHash ?? "",
      generatedAt: r.generated_at ?? r.created_at,
    })
  );
  return {
    report: r,
    vehicle: v,
    seller: seller
      ? { name: seller.name, type: seller.seller_type, businessName: seller.business_name, verified: seller.kyc_status === "verified" }
      : null,
    trust: { ...trust, weights: DOC_WEIGHTS },
    insights: getInsights(v.id),
    findings: getFindings(v.id).filter((f) => f.status !== "cleared").map(findingView),
    chain: { ...chain, lastHash: chain.latestHash },
    pricing: getPricing(v.id),
    documents: docs,
    mileage: getMileage(v.id),
    damage: getDamage(v.id),
    history: getHistory(v.id),
    theft: getTheft(v.id),
    snapshotHash,
    verifyUrl: qr ? `${base}/verify/${qr.token}` : `${base}/verify/${v.reg_no}`,
  };
}

// ---------------------------------------------------------------------------
// Notifications / admin
// ---------------------------------------------------------------------------
export function getNotificationsFor(userId: string) {
  return getNotifications(userId).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    data: safeJson<Record<string, unknown>>(n.data, {}),
    read: !!n.read,
    createdAt: n.created_at,
  }));
}

export function getNotificationsPageFor(userId: string, limit = 20, before?: string | null) {
  const rows = getNotificationsPage(userId, Math.min(50, Math.max(1, limit)), before);
  return {
    items: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: safeJson<Record<string, unknown>>(n.data, {}),
      read: !!n.read,
      createdAt: n.created_at,
    })),
    nextBefore: rows.length ? rows[rows.length - 1].created_at : null,
    hasMore: rows.length === limit,
  };
}

export function getNotificationsOffsetPageFor(
  userId: string,
  limit: number,
  offset: number,
  unreadOnly = false
) {
  return getNotificationsOffsetPage(userId, limit, offset, unreadOnly).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    data: safeJson<Record<string, unknown>>(n.data, {}),
    read: !!n.read,
    createdAt: n.created_at,
  }));
}

export function getAdminQueue() {
  const disputes = getDisputes().map((d) => {
    const finding = getFinding(d.finding_id);
    const vehicle = finding ? getVehicle(finding.vehicle_id) : undefined;
    return {
      id: d.id,
      findingId: d.finding_id,
      findingTitle: finding?.title ?? "Finding",
      severity: finding?.severity ?? "medium",
      vehicle: vehicle ? `${vehicle.make} ${vehicle.model} · ${vehicle.reg_no}` : "—",
      sellerId: d.seller_id,
      explanation: d.explanation,
      status: d.status,
      reviewNote: d.review_note,
      createdAt: d.created_at,
    };
  });
  const listings = getAllListings()
    .filter((l) => l.status === "pending_review")
    .map((l) => {
      const v = getVehicle(l.vehicle_id);
      return {
        id: l.id,
        vehicle: v ? `${v.make} ${v.model}` : "—",
        sellerId: v?.owner_id ?? "",
        status: l.status,
        createdAt: l.created_at,
      };
    });
  const documents = getAllVehicles()
    .flatMap((v) => getDocuments(v.id).filter((d) => d.status === "pending" || d.status === "suspicious"))
    .slice(0, 12)
    .map((d) => ({ id: d.id, vehicleId: d.vehicle_id, type: d.type, status: d.status, reason: d.status_reason }));
  return {
    disputes,
    listings,
    documents,
    counts: {
      disputes: disputes.filter((d) => d.status === "pending").length,
      listings: listings.length,
      documents: documents.length,
    },
  };
}

export function getAdminKycQueue() {
  const sellers = getUsersByRole("seller");
  const items = sellers.map((u) => ({
    userId: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    city: u.city,
    sellerType: u.seller_type,
    businessName: u.business_name,
    status: u.kyc_status,
    emailVerified: !!u.email_verified,
    docUrl: u.kyc_doc_key ? `/api/v1/files/${u.kyc_doc_key}` : null,
    vehicleCount: getVehiclesByOwner(u.id).length,
    joinedAt: u.created_at,
  }));
  const by = (s: string) => items.filter((i) => i.status === s).length;
  return {
    items,
    counts: { pending: by("pending"), verified: by("verified"), rejected: by("rejected"), notStarted: by("not_started") },
  };
}

export function getAdminDisputeDetail(disputeId: string) {
  const d = getDispute(disputeId);
  if (!d) return null;
  const finding = getFinding(d.finding_id);
  const vehicle = finding ? getVehicle(finding.vehicle_id) : undefined;
  const seller = getUserById(d.seller_id);
  return {
    dispute: {
      id: d.id,
      findingId: d.finding_id,
      sellerId: d.seller_id,
      explanation: d.explanation,
      evidenceDocIds: safeJson<string[]>(d.evidence_doc_ids, []),
      status: d.status,
      reviewedBy: d.reviewed_by,
      reviewNote: d.review_note,
      createdAt: d.created_at,
    },
    finding: finding ? findingView(finding) : null,
    vehicle: vehicle ? vehicleMini(vehicle) : null,
    seller: seller
      ? {
          id: seller.id,
          name: seller.name,
          email: seller.email,
          businessName: seller.business_name,
          kycStatus: seller.kyc_status,
          initials: seller.initials,
        }
      : null,
    documents: vehicle ? getDocuments(vehicle.id).map((doc) => ({ id: doc.id, type: doc.type, status: doc.status, shortHash: doc.sha256.slice(0, 12) })) : [],
    chain: vehicle ? getChainStatus(vehicle.id) : null,
  };
}

export function getAdminListingDetail(listingId: string) {
  const listing = getListing(listingId);
  if (!listing) return null;
  const v = getVehicle(listing.vehicle_id);
  if (!v) return null;
  const seller = getUserById(v.owner_id);
  return {
    listing: {
      id: listing.id,
      status: listing.status,
      headline: listing.headline,
      description: listing.description,
      condition: listing.condition,
      location: listing.location,
      views: listing.views,
      saves: listing.saves,
      inquiries: listing.inquiries,
      coverImage: listing.cover_image,
      publishedAt: listing.published_at,
      createdAt: listing.created_at,
      updatedAt: listing.updated_at,
    },
    vehicle: vehicleMini(v),
    seller: seller
      ? { id: seller.id, name: seller.name, email: seller.email, businessName: seller.business_name, kycStatus: seller.kyc_status }
      : null,
    trust: computeVehicleTrust(v.id),
    gate: buildPublishGate(v.id),
    photos: getListingImages(listing.id).map((p) => ({ id: p.id, position: p.position, url: `/api/v1/files/${p.file_key}` })),
    events: getListingEvents(listing.id).map((e) => ({ id: e.id, type: e.type, actorId: e.actor_id, createdAt: e.at })),
  };
}

// ---------------------------------------------------------------------------
// Mutations — seller vehicles & documents
// ---------------------------------------------------------------------------
export interface VehicleInput {
  make: string;
  model: string;
  variant?: string;
  year: number | string;
  regNo: string;
  vin: string;
  fuel?: string;
  transmission?: string;
  category?: string;
  color?: string;
  ownershipCount?: number;
  location?: string;
  km?: number | string;
  price?: number | string;
  description?: string;
  condition?: string;
  /** New taxonomy id, e.g. `petrol_scooter`. When present, category-specific
   *  identifier rules replace the car VIN rule. Omitted for legacy callers. */
  categoryId?: string;
  /** Category-specific fields (motor number, battery capacity, tyre condition…).
   *  Stored as seller declarations until a document corroborates them. */
  specs?: Record<string, unknown>;
}

export function createVehicleDraft(ownerId: string, input: VehicleInput) {
  const reg = normalizeReg(String(input.regNo ?? ""));
  const vin = normalizeVin(String(input.vin ?? ""));
  if (!input.make || !input.model || !reg) return { ok: false as const, code: "VALIDATION_FAILED", message: "Make, model and registration are required." };
  const explicitCategoryId = input.categoryId ? matchCategoryId(input.categoryId) : undefined;
  if (input.categoryId && !explicitCategoryId) {
    return { ok: false as const, code: "VALIDATION_FAILED", message: `Unknown vehicle category '${input.categoryId}'. Select a category from the catalogue.` };
  }
  const categoryId = explicitCategoryId
    ? explicitCategoryId
    : categoryForVehicle({ category: input.category, fuel: input.fuel }).id;
  if (explicitCategoryId) {
    // Category-aware path: a scooter frame number is NOT a 17-character VIN,
    // and an electric vehicle is never asked for an engine number.
    const check = validateCategoryIdentity(categoryId, {
      // `vin` is the shared primary-identifier column. For two-wheelers it holds
      // a chassis / frame number, NOT a 17-character car VIN.
      regNo: reg,
      primaryIdentifier: vin ?? "",
      engineNumber: String(input.specs?.engine_number ?? ""),
      motorNumber: String(input.specs?.motor_number ?? ""),
    });
    if (!check.ok) return { ok: false as const, code: "VALIDATION_FAILED", message: check.errors.join(" ") };
  } else {
    // Legacy car path — unchanged so existing sellers and QA22 stay valid.
    if (!isValidReg(reg)) return { ok: false as const, code: "VALIDATION_FAILED", message: "Registration must look like MH01AB1234." };
    if (vin && !isValidVin(vin)) return { ok: false as const, code: "VALIDATION_FAILED", message: "VIN must be 17 characters and must not contain I, O or Q." };
  }
  const existingReg = getVehicleByReg(reg);
  if (existingReg) return { ok: false as const, code: "DUPLICATE_REG", message: `Registration ${reg} is already registered${existingReg.owner_id === ownerId ? " to your account" : ""}.`, existingId: existingReg.id };
  const existingVin = vin ? getVehicleByVin(vin) : undefined;
  if (existingVin) return { ok: false as const, code: "DUPLICATE_VIN", message: `VIN ${vin} is already registered${existingVin.owner_id === ownerId ? " to your account" : ""}.`, existingId: existingVin.id };
  const now = new Date().toISOString();
  const id = `v-${Date.now()}`;
  const year = Number(input.year) || new Date().getFullYear();
  const trustdriveId = `TD-${id.slice(-6).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`;
  const cat = getCategory(categoryId);
  const electric = isElectric(categoryId);
  const row: VehicleRow = {
    id,
    owner_id: ownerId,
    make: input.make.trim(),
    model: input.model.trim(),
    variant: input.variant?.trim() ?? "",
    year,
    reg_no: reg,
    // An unknown identifier stays unknown (NULL). Writing "" here collided with
    // every other VIN-less draft on the UNIQUE column, turning a legitimate
    // second draft into HTTP 500.
    vin: vin ?? null,
    fuel: input.fuel || (electric ? "Electric" : "Petrol"),
    transmission: input.transmission || (cat?.class === "two_wheeler" && electric ? "Direct drive" : "Manual"),
    category: input.category || cat?.label || "Sedan",
    color: input.color || "",
    ownership_count: Number(input.ownershipCount) || 1,
    location: input.location || "",
    km_claimed: Number(input.km) || 0,
    last_verified_km: 0,
    asking_price: Number(input.price) || 0,
    status: "draft",
    base_value: Math.round((Number(input.price) || 1000000) * 1.25),
    condition_score: 0.7,
    trustdrive_id: trustdriveId,
    qr_token: `qr-${id}`,
    description: input.description || "",
    condition: input.condition || "Good",
    created_at: now,
    updated_at: now,
    vehicle_category_id: categoryId,
  };
  createVehicle(row);
  if (input.specs && Object.keys(input.specs).length) {
    upsertVehicleSpecs(id, categoryId, input.specs, CATEGORY_SPEC_VERSION);
  }
  const listingId = `l-${id}`;
  createListing({
    id: listingId,
    vehicle_id: id,
    status: "draft",
    headline: "Draft — ready for updates",
    description: input.description || "",
    condition: row.condition,
    location: row.location,
    views: 0,
    saves: 0,
    inquiries: 0,
    cover_image: null,
    published_at: null,
    created_at: now,
    updated_at: now,
  });
  createAudit({
    id: `a-${Date.now()}`,
    actor_id: ownerId,
    action: "vehicle.create",
    entity_type: "vehicle",
    entity_id: id,
    before: "{}",
    after: JSON.stringify({ reg, vin }),
    ip: "local",
    user_agent: "web",
    at: now,
  });
  return { ok: true as const, id, listingId };
}

export function updateVehicleForOwner(
  ownerId: string,
  vehicleId: string,
  fields: Partial<VehicleRow> & { specs?: Record<string, unknown>; categoryId?: string },
) {
  const v = getVehicle(vehicleId);
  if (!v) return { ok: false as const, code: "NOT_FOUND", message: "Vehicle not found." };
  if (v.owner_id !== ownerId) return { ok: false as const, code: "FORBIDDEN", message: "You do not own this vehicle." };

  const { specs, categoryId, ...row } = fields;
  const effectiveCategoryId = categoryId || v.vehicle_category_id || categoryForVehicle(v).id;

  // Category-aware identity check. A two-wheeler frame number is NOT a 17-char
  // car VIN, and an electric vehicle has no engine number — the car-only
  // isValidVin rule must never run for those categories.
  // Only identity-bearing edits are validated here: an incomplete draft that
  // has no identifier yet must still accept a colour/location/price edit,
  // because publishing — not PATCH — is where required fields are enforced.
  const touchesIdentity =
    row.reg_no !== undefined ||
    row.vin !== undefined ||
    categoryId !== undefined ||
    specs?.engine_number !== undefined ||
    specs?.motor_number !== undefined;
  const check = touchesIdentity
    ? validateCategoryIdentity(effectiveCategoryId, {
        regNo: row.reg_no ?? v.reg_no,
        primaryIdentifier: row.vin ?? v.vin ?? "",
        engineNumber: specs?.engine_number ? String(specs.engine_number) : "",
        motorNumber: specs?.motor_number ? String(specs.motor_number) : "",
      })
    : { ok: true as const, errors: [] as string[], normalized: { reg: normalizeReg(v.reg_no), identifier: normalizeVin(v.vin ?? "") ?? "" } };
  if (!check.ok) return { ok: false as const, code: "VALIDATION_FAILED", message: check.errors.join(" ") };
  if (row.reg_no) row.reg_no = check.normalized.reg;
  if (row.vin) row.vin = check.normalized.identifier;

  updateVehicle(vehicleId, row);
  if (specs && Object.keys(specs).length) {
    upsertVehicleSpecs(vehicleId, effectiveCategoryId, specs, CATEGORY_SPEC_VERSION);
  }
  appendChainRecord(vehicleId, "vehicle_update", vehicleId, { fields: Object.keys(row), specs: !!specs, at: new Date().toISOString() });
  return { ok: true as const, id: vehicleId };
}

export function archiveVehicleForOwner(ownerId: string, vehicleId: string) {
  const v = getVehicle(vehicleId);
  if (!v) return { ok: false as const, code: "NOT_FOUND", message: "Vehicle not found." };
  if (v.owner_id !== ownerId) return { ok: false as const, code: "FORBIDDEN", message: "You do not own this vehicle." };
  updateVehicle(vehicleId, { status: "archived" });
  const listing = getListingByVehicle(vehicleId);
  if (listing) updateListing(listing.id, { status: "paused" });
  return { ok: true as const };
}

export function addDocumentForVehicle(
  actorId: string,
  vehicleId: string,
  input: { type: string; fileName: string; mime?: string; sizeBytes?: number; consent?: boolean; extracted?: Record<string, unknown>; content?: string; sha256?: string; fileKey?: string | null }
) {
  const v = getVehicle(vehicleId);
  if (!v) return { ok: false as const, code: "NOT_FOUND", message: "Vehicle not found." };
  if (v.owner_id !== actorId) return { ok: false as const, code: "FORBIDDEN", message: "You do not own this vehicle." };
  // Category-aware document allowlist: a two-wheeler may upload rc_2w / insurance_2w /
  // service_2w / engine_chassis, an EV may upload battery_* docs, and every category
  // still permits the shared default document set. This replaces the old car-only list.
  const catId = v.vehicle_category_id || categoryForVehicle(v).id;
  if (!isAllowedDocument(catId, input.type)) {
    return { ok: false as const, code: "VALIDATION_FAILED", message: "Document type is not valid for this vehicle category." };
  }
  const now = new Date().toISOString();
  const id = `doc-${Date.now()}`;
  const content = input.content || `${vehicleId}:${input.type}:${now}`;
  const sha = input.sha256 || sha256Hex(content);
  createDocument({
    id,
    vehicle_id: vehicleId,
    type: input.type,
    file_name: input.fileName || `${input.type}.pdf`,
    mime: input.mime || "application/pdf",
    size_bytes: input.sizeBytes ?? 0,
    status: "pending",
    status_reason: null,
    sha256: sha,
    consent: input.consent === false ? 0 : 1,
    version: 1,
    supersedes_id: null,
    extracted: JSON.stringify({ ...(input.extracted ?? {}), registrationNo: v.reg_no, vin: v.vin }),
    verified_at: null,
    uploaded_at: now,
    file_key: input.fileKey ?? null,
  });
  appendChainRecord(vehicleId, "document", id, { type: input.type, sha256: sha, uploadedAt: now });
  createNotification({
    id: `n-${Date.now()}`,
    user_id: actorId,
    type: "document",
    title: "Document uploaded",
    body: `${input.type.toUpperCase()} uploaded and queued for verification.`,
    data: JSON.stringify({ vehicleId, documentId: id }),
    read: 0,
    created_at: now,
  });
  return { ok: true as const, id };
}

export function replaceDocumentForActor(actorId: string, documentId: string, input: { fileName?: string; content?: string; type?: string; sha256?: string; fileKey?: string | null; sizeBytes?: number; mime?: string }) {
  const d = getDocument(documentId);
  if (!d) return { ok: false as const, code: "NOT_FOUND", message: "Document not found." };
  const v = getVehicle(d.vehicle_id);
  if (!v) return { ok: false as const, code: "NOT_FOUND", message: "Vehicle not found." };
  if (v.owner_id !== actorId) return { ok: false as const, code: "FORBIDDEN", message: "You do not own this vehicle." };
  if (d.status === "verified") {
    // A verified document can't be overwritten: create a new version that supersedes it.
    const now = new Date().toISOString();
    const id = `doc-${Date.now()}`;
    const content = input.content || `${d.id}:${now}`;
    createDocument({
      ...d,
      id,
      file_name: input.fileName || d.file_name,
      mime: input.mime || d.mime,
      size_bytes: input.sizeBytes ?? d.size_bytes,
      status: "pending",
      status_reason: null,
      sha256: input.sha256 || sha256Hex(content),
      version: d.version + 1,
      supersedes_id: d.id,
      verified_at: null,
      uploaded_at: now,
      file_key: input.fileKey ?? null,
    });
    appendChainRecord(d.vehicle_id, "document", id, { supersedes: d.id, version: d.version + 1 });
    return { ok: true as const, id, versioned: true };
  }
  if (input.fileKey !== undefined) {
    // file_key is intentionally not editable in place: re-upload creates a version.
    const now = new Date().toISOString();
    const id = `doc-${Date.now()}`;
    createDocument({
      ...d,
      id,
      file_name: input.fileName || d.file_name,
      mime: input.mime || d.mime,
      size_bytes: input.sizeBytes ?? d.size_bytes,
      status: "pending",
      status_reason: null,
      sha256: input.sha256 || sha256Hex(input.content || `${d.id}:${now}`),
      version: d.version + 1,
      supersedes_id: d.id,
      file_key: input.fileKey,
      uploaded_at: now,
      verified_at: null,
    });
    appendChainRecord(d.vehicle_id, "document", id, { supersedes: d.id, version: d.version + 1 });
    return { ok: true as const, id, versioned: true };
  }
  updateDocument(documentId, { status: "pending", status_reason: null });
  return { ok: true as const, id: documentId, versioned: false };
}

export function setDocumentConsent(actorId: string, documentId: string, consent: boolean) {
  const d = getDocument(documentId);
  if (!d) return { ok: false as const, code: "NOT_FOUND", message: "Document not found." };
  const v = getVehicle(d.vehicle_id);
  if (!v || v.owner_id !== actorId) return { ok: false as const, code: "FORBIDDEN", message: "You do not own this vehicle." };
  updateDocument(documentId, { consent: consent ? 1 : 0 });
  return { ok: true as const };
}

export function reverifyDocument(
  actorId: string,
  documentId: string,
  options: { runChecks?: boolean } = {}
) {
  const d = getDocument(documentId);
  if (!d) return { ok: false as const, code: "NOT_FOUND", message: "Document not found." };
  const v = getVehicle(d.vehicle_id);
  if (!v || v.owner_id !== actorId) return { ok: false as const, code: "FORBIDDEN", message: "You do not own this vehicle." };
  updateDocument(documentId, { status: "pending", status_reason: null });
  if (options.runChecks === false) {
    return { ok: true as const, runId: null, vehicleId: d.vehicle_id };
  }
  const run = startVerificationRun(actorId, d.vehicle_id);
  return { ok: true as const, runId: run.runId, vehicleId: d.vehicle_id };
}

// ---------------------------------------------------------------------------
// Mutations — history / mileage / damage / verification / disputes
// ---------------------------------------------------------------------------
export function addHistoryForVehicle(actorId: string, vehicleId: string, input: { category: string; date: string; km?: number; title: string; description?: string }) {
  const v = getVehicle(vehicleId);
  if (!v || v.owner_id !== actorId) return { ok: false as const, code: "FORBIDDEN", message: "You do not own this vehicle." };
  if (!input.title || !input.date) return { ok: false as const, code: "VALIDATION_FAILED", message: "Title and date are required." };
  const now = new Date().toISOString();
  const id = `h-${Date.now()}`;
  createHistoryEvent({
    id,
    vehicle_id: vehicleId,
    category: input.category || "service",
    event_date: new Date(input.date).toISOString(),
    mileage_km: Number(input.km) || 0,
    title: input.title,
    description: input.description || "",
    source: "seller_submitted",
    evidence_document_id: null,
    status: "pending",
    supersedes_id: null,
    created_by: actorId,
    created_at: now,
  });
  appendChainRecord(vehicleId, "history", id, { category: input.category, date: input.date, km: input.km ?? 0, title: input.title });
  return { ok: true as const, id };
}

export function requestHistoryCorrection(actorId: string, eventId: string, input: { title?: string; description: string; km?: number }) {
  const ev = getHistoryEvent(eventId);
  if (!ev) return { ok: false as const, code: "NOT_FOUND", message: "History event not found." };
  const v = getVehicle(ev.vehicle_id);
  if (!v || v.owner_id !== actorId) return { ok: false as const, code: "FORBIDDEN", message: "You do not own this vehicle." };
  if (!input.description) return { ok: false as const, code: "VALIDATION_FAILED", message: "Describe the correction." };
  const now = new Date().toISOString();
  const id = `h-${Date.now()}`;
  createHistoryEvent({
    ...ev,
    id,
    title: input.title || `Correction: ${ev.title}`,
    description: input.description,
    mileage_km: input.km ?? ev.mileage_km,
    status: "pending",
    supersedes_id: ev.id,
    source: "seller_submitted",
    created_by: actorId,
    created_at: now,
  });
  appendChainRecord(ev.vehicle_id, "history_correction", id, { supersedes: ev.id, description: input.description });
  return { ok: true as const, id };
}

export function addMileageForVehicle(actorId: string, vehicleId: string, input: { date?: string; km?: number; source?: string; documentId?: string }) {
  const v = getVehicle(vehicleId);
  if (!v || v.owner_id !== actorId) return { ok: false as const, code: "FORBIDDEN", message: "You do not own this vehicle." };
  const km = Number(input.km);
  const when = input.date ? new Date(input.date) : null;
  if (!input.date || !when || Number.isNaN(when.getTime()) || !Number.isFinite(km) || km < 0) {
    return { ok: false as const, code: "VALIDATION_FAILED", message: "A valid date and non-negative km are required." };
  }
  const readings = getMileage(vehicleId); // ORDER BY date ASC
  const whenIso = when.toISOString();
  // Compare with the readings that sit on either SIDE of this date. Using only
  // the newest row would flag a correct back-fill (an older invoice showing
  // lower mileage) as an odometer rollback.
  const earlier = readings.filter((r) => r.date <= whenIso).slice(-1)[0];
  const later = readings.find((r) => r.date > whenIso);
  const rollbackBefore = !!earlier && km < earlier.km;
  const rollbackAfter = !!later && km > later.km;
  const flagged = rollbackBefore || rollbackAfter;
  const against = rollbackBefore ? earlier! : later!;
  const direction = rollbackBefore ? "lower" : "higher";
  const now = new Date().toISOString();
  const id = `m-${Date.now()}`;
  createMileage({
    id,
    vehicle_id: vehicleId,
    year: whenIso.slice(0, 4),
    km,
    source: input.source || "seller_submitted",
    date: whenIso,
    flagged: flagged ? 1 : 0,
    verified: 0,
    is_seller_claim: 1,
    document_id: input.documentId ?? null,
  });
  if (flagged) {
    createFinding({
      id: `f-${Date.now()}`,
      vehicle_id: vehicleId,
      rule_key: "MILEAGE_INCONSISTENCY",
      code: "ODOMETER_ROLLBACK",
      severity: "high",
      title: "Mileage chronology inconsistency (needs review)",
      explanation: `The submitted reading of ${km.toLocaleString("en-IN")} km (${whenIso.slice(0, 10)}) is ${direction} than the ${
        rollbackBefore ? "earlier" : "later"
      } reading of ${against.km.toLocaleString("en-IN")} km (${against.date.slice(0, 10)}), so the odometer timeline requires review (not confirmed fraud).`,
      recommendation: "Provide a service invoice or cluster-replacement receipt that explains the change.",
      evidence: JSON.stringify({
        fromReadingId: rollbackBefore ? against.id : id,
        toReadingId: rollbackBefore ? id : against.id,
        fromDocumentId: rollbackBefore ? against.document_id : (input.documentId ?? null),
        toDocumentId: rollbackBefore ? (input.documentId ?? null) : against.document_id,
        fromKm: rollbackBefore ? against.km : km,
        toKm: rollbackBefore ? km : against.km,
        fromDate: rollbackBefore ? against.date.slice(0, 10) : whenIso.slice(0, 10),
        toDate: rollbackBefore ? whenIso.slice(0, 10) : against.date.slice(0, 10),
        reviewState: "NEEDS_REVIEW",
      }),
      responsible_doc: input.documentId ?? null,
      points: 40,
      status: "open",
      created_at: now,
    });
  }
  appendChainRecord(vehicleId, "mileage", id, { km, date: whenIso, source: input.source ?? "seller_submitted" });
  return { ok: true as const, id, flagged };
}

export function addDamageForVehicle(actorId: string, vehicleId: string, input: { zoneId: string; description: string; severity: string; repairStatus: string; repairDetails?: string; inspectionDate?: string }) {
  const v = getVehicle(vehicleId);
  if (!v || v.owner_id !== actorId) return { ok: false as const, code: "FORBIDDEN", message: "You do not own this vehicle." };
  if (!input.zoneId || !input.description) return { ok: false as const, code: "VALIDATION_FAILED", message: "Zone and description are required." };

  // A damage record must point at a real component in THIS vehicle's category
  // registry. A car door id must never be attached to a scooter, and a scooter
  // panel id must never be silently translated through the car mesh alias table.
  const { categoryId, interactionsAvailable, defs } = componentsForVehicle(vehicleId);
  const known = new Set(defs.map((d) => d.id));
  const requested = String(input.zoneId).trim();
  const norm = requested.toLowerCase().replace(/[-\s]/g, "_");
  let componentId = known.has(requested) ? requested : known.has(norm) ? norm : "";
  if (!componentId && interactionsAvailable) {
    const aliased = mapZoneToComponentId(requested);
    if (known.has(aliased)) componentId = aliased;
  }
  if (!componentId) {
    return {
      ok: false as const,
      code: "INVALID_COMPONENT",
      message: `'${requested}' is not a component of ${categoryLabel(categoryId)}. Choose one of the category's registered components.`,
      categoryId,
      validComponents: defs.map((d) => d.id),
    };
  }

  const now = new Date().toISOString();
  const id = `d-${Date.now()}`;
  createDamage({
    id,
    vehicle_id: vehicleId,
    zone_id: componentId,
    component_id: componentId,
    damage_type: "visible_damage",
    position_source: interactionsAvailable ? "component_registry_anchor" : "seller_submitted",
    description: input.description,
    severity: input.severity || "Minor",
    repair_status: input.repairStatus || "Not repaired",
    repair_details: input.repairDetails || "",
    inspection_date: input.inspectionDate || now.slice(0, 10),
    status: "pending",
    photo_keys: "[]",
    repair_invoice_doc_id: null,
    supersedes_id: null,
    created_by: actorId,
    created_at: now,
  });
  appendChainRecord(vehicleId, "damage", id, { zone: componentId, severity: input.severity, categoryId, provenance: "seller_reported" });
  return { ok: true as const, id, componentId, categoryId };
}

export function requestDamageCorrection(actorId: string, damageId: string, input: { description: string; repairStatus?: string }) {
  const d = getDamageRecord(damageId);
  if (!d) return { ok: false as const, code: "NOT_FOUND", message: "Damage record not found." };
  const v = getVehicle(d.vehicle_id);
  if (!v || v.owner_id !== actorId) return { ok: false as const, code: "FORBIDDEN", message: "You do not own this vehicle." };
  const now = new Date().toISOString();
  const id = `d-${Date.now()}`;
  createDamage({
    ...d,
    id,
    description: input.description,
    repair_status: input.repairStatus || d.repair_status,
    status: "pending",
    supersedes_id: d.id,
    created_by: actorId,
    created_at: now,
  });
  return { ok: true as const, id };
}

export function startVerificationRun(actorId: string, vehicleId: string) {
  const v = getVehicle(vehicleId);
  if (!v) return { ok: false as const, code: "NOT_FOUND", message: "Vehicle not found." };
  const now = new Date().toISOString();
  const runId = `run-${Date.now()}`;
  createRun({ id: runId, vehicle_id: vehicleId, status: "processing", started_at: now, finished_at: null, summary: "{}" });
  // Deterministic re-check of the mileage series (design §9.5).
  const analysis = analyzeMileageSeries(getMileage(vehicleId), categoryForVehicle(v).id);
  let created = 0;
  for (const f of analysis) {
    if (getFindings(vehicleId).some((x) => x.code === f.code && x.status !== "cleared")) continue;
    createFinding({
      id: `f-${Date.now()}-${created}`,
      vehicle_id: vehicleId,
      rule_key: f.code,
      code: f.code,
      severity: f.severity,
      title: f.title,
      explanation: f.explanation,
      recommendation: "Review the evidence and upload supporting records.",
      evidence: JSON.stringify(f.evidence ?? {}),
      responsible_doc: null,
      points: f.points,
      status: "open",
      created_at: now,
    });
    created++;
  }
  const checks = getVerificationChecks(vehicleId);
  checks.forEach((c, i) => {
    createResult({
      id: `${runId}-${i}`,
      run_id: runId,
      vehicle_id: vehicleId,
      check_key: c.key,
      status: c.status,
      details: c.note,
      evidence_ids: "[]",
    });
  });
  const passed = checks.filter((c) => c.status === "verified").length;
  const summary = { checks: checks.length, passed, findings: getFindings(vehicleId).filter((f) => f.status !== "cleared").length, newFindings: created };
  finishRun(runId, summary);
  updateVehicle(vehicleId, { last_verified_km: getMileage(vehicleId).slice(-1)[0]?.km ?? v.km_claimed });
  createNotification({
    id: `n-${Date.now()}`,
    user_id: actorId,
    type: "verification",
    title: "Verification run complete",
    body: `${passed}/${checks.length} checks passed. ${summary.findings} open finding(s).`,
    data: JSON.stringify({ vehicleId, runId }),
    read: 0,
    created_at: now,
  });
  // Verification changed the evidence base: persist the resulting deterministic
  // score as immutable history (deduplicates if nothing actually moved).
  ensureTrustScoreSnapshot(vehicleId, actorId);
  return { ok: true as const, runId, summary, checks };
}

function analyzeMileageSeries(readings: ReturnType<typeof getMileage>, categoryId = "passenger_car") {
  const rules = mileageRulesForCategory(categoryId);
  const electric = isElectric(categoryId);
  const odometerLabel = labelsForCategory(categoryId).odometer;
  const sorted = [...readings].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const out: { code: string; severity: Severity; title: string; explanation: string; points: number; evidence: Record<string, unknown> }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const days = Math.max(1, (new Date(curr.date).getTime() - new Date(prev.date).getTime()) / 86400000);
    const delta = curr.km - prev.km;
    if (delta < 0) {
      const severe = Math.abs(delta) > rules.rollbackToleranceKm;
      out.push({
        code: "ODOMETER_ROLLBACK",
        severity: severe ? "critical" : "high",
        title: `${odometerLabel} rollback detected`,
        explanation: `Reading fell from ${prev.km.toLocaleString("en-IN")} km to ${curr.km.toLocaleString("en-IN")} km. This can indicate a rollback, an ${odometerLabel.toLowerCase()} replacement or a data-entry error; it is a warning, not proof of fraud.${electric ? " Battery State of Health is never used as a distance reading." : ""}`,
        points: severe ? 40 : 30,
        evidence: { fromKm: prev.km, toKm: curr.km, fromDate: prev.date, toDate: curr.date, categoryId, rulesVersion: TRUST_VERSION },
      });
    } else if (delta / days > rules.dailyMaxKm) {
      out.push({
        code: "MILEAGE_JUMP",
        severity: "medium",
        title: `${odometerLabel} inconsistency detected`,
        explanation: `+${delta.toLocaleString("en-IN")} km in ${Math.round(days)} days exceeds the ${rules.dailyMaxKm} km/day ceiling for ${categoryLabel(categoryId)}.`,
        points: 12,
        evidence: { deltaKm: delta, days: Math.round(days), categoryId, dailyMaxKm: rules.dailyMaxKm },
      });
    }
  }
  return out;
}

export function createDisputeForFinding(actorId: string, findingId: string, input: { explanation: string; evidenceDocumentIds?: string[] }) {
  const f = getFinding(findingId);
  if (!f) return { ok: false as const, code: "NOT_FOUND", message: "Finding not found." };
  const v = getVehicle(f.vehicle_id);
  if (!v || v.owner_id !== actorId) return { ok: false as const, code: "FORBIDDEN", message: "You do not own this vehicle." };
  if (!input.explanation || input.explanation.trim().length < 10) return { ok: false as const, code: "VALIDATION_FAILED", message: "Please provide an explanation of at least 10 characters." };
  if (getDisputes().some((d) => d.finding_id === findingId && d.status === "pending")) {
    return { ok: false as const, code: "DUPLICATE", message: "A dispute for this finding is already pending review." };
  }
  const now = new Date().toISOString();
  const id = `disp-${Date.now()}`;
  createDispute({
    id,
    finding_id: findingId,
    seller_id: actorId,
    explanation: input.explanation,
    evidence_doc_ids: JSON.stringify(input.evidenceDocumentIds ?? []),
    status: "pending",
    reviewed_by: null,
    review_note: null,
    created_at: now,
  });
  updateFinding(findingId, { status: "explained" });
  const admin = getUserByEmail("admin@trustdrive.dev");
  if (admin) {
    createNotification({
      id: `n-${Date.now()}`,
      user_id: admin.id,
      type: "admin",
      title: "Dispute pending review",
      body: `${v.make} ${v.model}: ${f.title}`,
      data: JSON.stringify({ disputeId: id, findingId }),
      read: 0,
      created_at: now,
    });
  }
  return { ok: true as const, id };
}

export function resolveDisputeForAdmin(adminId: string, disputeId: string, input: { decision: "resolved" | "rejected"; note: string }) {
  const d = getDisputes().find((x) => x.id === disputeId);
  if (!d) return { ok: false as const, code: "NOT_FOUND", message: "Dispute not found." };
  if (!input.note) return { ok: false as const, code: "VALIDATION_FAILED", message: "A review note is required." };
  const now = new Date().toISOString();
  updateDispute(disputeId, { status: input.decision, reviewed_by: adminId, review_note: input.note });
  if (input.decision === "resolved") updateFinding(d.finding_id, { status: "cleared" });
  else updateFinding(d.finding_id, { status: "open" });
  createAudit({
    id: `a-${Date.now()}`,
    actor_id: adminId,
    action: `dispute.${input.decision}`,
    entity_type: "dispute",
    entity_id: disputeId,
    before: JSON.stringify({ status: d.status }),
    after: JSON.stringify({ status: input.decision, note: input.note }),
    ip: "local",
    user_agent: "web",
    at: now,
  });
  createNotification({
    id: `n-${Date.now()}`,
    user_id: d.seller_id,
    type: "admin",
    title: input.decision === "resolved" ? "Dispute resolved" : "Dispute rejected",
    body: input.note,
    data: JSON.stringify({ disputeId, findingId: d.finding_id }),
    read: 0,
    created_at: now,
  });
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Mutations — listings
// ---------------------------------------------------------------------------
export function createListingForVehicle(actorId: string, vehicleId: string, input: { headline?: string; description?: string; condition?: string; location?: string; price?: number }) {
  const v = getVehicle(vehicleId);
  if (!v || v.owner_id !== actorId) return { ok: false as const, code: "FORBIDDEN", message: "You do not own this vehicle." };
  const existing = getListingByVehicle(vehicleId);
  const now = new Date().toISOString();
  if (existing) {
    updateListing(existing.id, {
      headline: input.headline ?? existing.headline,
      description: input.description ?? existing.description,
      condition: input.condition ?? existing.condition,
      location: input.location ?? existing.location,
    });
    if (input.price != null) updateVehicle(vehicleId, { asking_price: Number(input.price) });
    return { ok: true as const, id: existing.id, created: false };
  }
  const id = `l-${Date.now()}`;
  createListing({
    id,
    vehicle_id: vehicleId,
    status: "draft",
    headline: input.headline || "Draft — ready for updates",
    description: input.description || "",
    condition: input.condition || v.condition,
    location: input.location || v.location,
    views: 0,
    saves: 0,
    inquiries: 0,
    cover_image: null,
    published_at: null,
    created_at: now,
    updated_at: now,
  });
  if (input.price != null) updateVehicle(vehicleId, { asking_price: Number(input.price) });
  return { ok: true as const, id, created: true };
}

export function transitionListingForActor(actorId: string, listingId: string, action: "publish" | "pause" | "unpublish" | "sold" | "pending_review") {
  const listing = getListing(listingId);
  if (!listing) return { ok: false as const, code: "NOT_FOUND", message: "Listing not found." };
  const v = getVehicle(listing.vehicle_id);
  if (!v || v.owner_id !== actorId) return { ok: false as const, code: "FORBIDDEN", message: "You do not own this listing." };
  const map: Record<string, { to: string; from: string[] }> = {
    publish: { to: "published", from: ["draft", "pending_review", "paused"] },
    pause: { to: "paused", from: ["published"] },
    unpublish: { to: "draft", from: ["published", "paused", "pending_review"] },
    sold: { to: "sold", from: ["published", "paused"] },
    pending_review: { to: "pending_review", from: ["draft"] },
  };
  const t = map[action];
  if (!t) return { ok: false as const, code: "VALIDATION_FAILED", message: "Unknown action." };
  if (!t.from.includes(listing.status)) {
    return { ok: false as const, code: "INVALID_TRANSITION", message: `Cannot ${action} a listing in status ${listing.status}.` };
  }
  if (action === "publish") {
    const gate = buildPublishGate(listing.vehicle_id);
    if (gate.blockers.length) return { ok: false as const, code: "PUBLISH_BLOCKED", message: gate.blockers.join(" "), details: gate };
  }
  const now = new Date().toISOString();
  updateListing(listingId, {
    status: t.to,
    published_at: t.to === "published" ? listing.published_at ?? now : listing.published_at,
  });
  updateVehicle(listing.vehicle_id, { status: t.to === "published" ? "published" : t.to === "sold" ? "sold" : "draft" });
  trackListingEvent(`ev-${Date.now()}`, listingId, action, actorId);
  appendChainRecord(listing.vehicle_id, "listing", listingId, { action, at: now });
  return { ok: true as const, status: t.to };
}

export function generateListingDescription(actorId: string, listingId: string) {
  const listing = getListing(listingId);
  if (!listing) return { ok: false as const, code: "NOT_FOUND", message: "Listing not found." };
  const v = getVehicle(listing.vehicle_id);
  if (!v || v.owner_id !== actorId) return { ok: false as const, code: "FORBIDDEN", message: "You do not own this listing." };
  const trust = computeVehicleTrust(v.id);
  const docs = getDocuments(v.id);
  const verified = docs.filter((d) => d.status === "verified").map((d) => d.type.toUpperCase());
  const findings = getFindings(v.id).filter((f) => f.status !== "cleared");
  const parts = [
    `${v.year} ${v.make} ${v.model}${v.variant ? ` ${v.variant}` : ""} in ${v.color || "its original colour"}, ${v.ownership_count === 1 ? "single owner" : `${v.ownership_count} owners`}, ${v.km_claimed.toLocaleString("en-IN")} km.`,
    verified.length ? `Verified records: ${Array.from(new Set(verified)).join(", ")}.` : "Verification is still in progress.",
    findings.length
      ? `${findings.length} open finding${findings.length === 1 ? "" : "s"} — see the AI risk analysis for details.`
      : "No open findings in available sources.",
    `Trust score ${trust.trustScore}/100 (${trust.bandLabel.toLowerCase()}). This is a verification summary, not a guarantee.`,
  ];
  return { ok: true as const, description: parts.join(" "), basedOn: { verifiedDocs: verified.length, findings: findings.length, trustScore: trust.trustScore } };
}

export function suspendListingForAdmin(adminId: string, listingId: string, reason: string) {
  const listing = getListing(listingId);
  if (!listing) return { ok: false as const, code: "NOT_FOUND", message: "Listing not found." };
  updateListing(listingId, { status: "paused" });
  const v = getVehicle(listing.vehicle_id);
  if (v) {
    createNotification({
      id: `n-${Date.now()}`,
      user_id: v.owner_id,
      type: "admin",
      title: "Listing suspended",
      body: reason || "Your listing was suspended pending review.",
      data: JSON.stringify({ listingId }),
      read: 0,
      created_at: new Date().toISOString(),
    });
  }
  createAudit({
    id: `a-${Date.now()}`,
    actor_id: adminId,
    action: "listing.suspend",
    entity_type: "listing",
    entity_id: listingId,
    before: JSON.stringify({ status: listing.status }),
    after: JSON.stringify({ status: "paused", reason }),
    ip: "local",
    user_agent: "web",
    at: new Date().toISOString(),
  });
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Mutations — saved / compare / inquiries / reports
// ---------------------------------------------------------------------------
export function saveListingForBuyer(buyerId: string, listingId: string) {
  const listing = getListing(listingId);
  if (!listing) return { ok: false as const, code: "NOT_FOUND", message: "Listing not found." };
  const existing = getSavedRow(buyerId, listingId);
  if (existing) return { ok: true as const, saved: true, id: existing.id };
  const v = getVehicle(listing.vehicle_id);
  const now = new Date().toISOString();
  const id = `sv-${Date.now()}`;
  createSaved({ id, buyer_id: buyerId, listing_id: listingId, price_at_save: v?.asking_price ?? 0, list_name: "All", created_at: now });
  updateListing(listingId, { saves: listing.saves + 1 });
  return { ok: true as const, saved: true, id };
}

export function unsaveListingForBuyer(buyerId: string, listingId: string) {
  deleteSaved(buyerId, listingId);
  const listing = getListing(listingId);
  if (listing) updateListing(listingId, { saves: Math.max(0, listing.saves - 1) });
  return { ok: true as const, saved: false };
}

export function createSavedSearchForBuyer(buyerId: string, input: { name: string; filters: Record<string, unknown>; alertsEnabled?: boolean }) {
  if (!input.name?.trim()) return { ok: false as const, code: "VALIDATION_FAILED", message: "Name the search." };
  const now = new Date().toISOString();
  const id = `ss-${Date.now()}`;
  createSavedSearch({ id, buyer_id: buyerId, name: input.name.trim(), filters: JSON.stringify(input.filters ?? {}), alerts_enabled: input.alertsEnabled === false ? 0 : 1, created_at: now });
  return { ok: true as const, id };
}

export function deleteSavedSearchForBuyer(buyerId: string, id: string) {
  deleteSavedSearch(buyerId, id);
  return { ok: true as const };
}

export function createInquiryForBuyer(buyerId: string, input: { listingId: string; message: string; type?: string }) {
  const listing = getListing(input.listingId);
  if (!listing) return { ok: false as const, code: "NOT_FOUND", message: "Listing not found." };
  const v = getVehicle(listing.vehicle_id);
  if (!v) return { ok: false as const, code: "NOT_FOUND", message: "Vehicle not found." };
  if (v.owner_id === buyerId) return { ok: false as const, code: "VALIDATION_FAILED", message: "You cannot inquire about your own listing." };
  if (!input.message?.trim()) return { ok: false as const, code: "VALIDATION_FAILED", message: "Write a message." };
  const buyer = getUserById(buyerId);
  if (!buyer) return { ok: false as const, code: "NOT_FOUND", message: "Buyer not found." };
  const now = new Date().toISOString();
  const id = `q-${Date.now()}`;
  createInquiry({
    id,
    listing_id: listing.id,
    buyer_id: buyerId,
    seller_id: v.owner_id,
    buyer_name: buyer.name,
    initials: buyer.initials,
    message: input.message.trim(),
    type: input.type || "message",
    status: "open",
    created_at: now,
    last_activity_at: now,
  });
  createMessage({
    id: `msg-${Date.now()}`,
    inquiry_id: id,
    sender_id: buyerId,
    sender_name: buyer.name,
    body: input.message.trim(),
    offer_amount: input.type === "offer" ? extractOffer(input.message) : null,
    scheduled_at: null,
    attachments: "[]",
    created_at: now,
  });
  updateListing(listing.id, { inquiries: listing.inquiries + 1 });
  createNotification({
    id: `n-${Date.now()}`,
    user_id: v.owner_id,
    type: "inquiry",
    title: `New inquiry from ${buyer.name}`,
    body: input.message.trim().slice(0, 120),
    data: JSON.stringify({ inquiryId: id, vehicleId: v.id }),
    read: 0,
    created_at: now,
  });
  return { ok: true as const, id };
}

function extractOffer(message: string): number | null {
  const m = message.replace(/,/g, "").match(/(?:₹|rs\.?|inr)?\s*(\d{5,9})/i);
  return m ? Number(m[1]) : null;
}

export function sendInquiryMessage(actorId: string, inquiryId: string, input: { body: string; offerAmount?: number; scheduledAt?: string; attachments?: string[] }) {
  const q = getInquiry(inquiryId);
  if (!q) return { ok: false as const, code: "NOT_FOUND", message: "Inquiry not found." };
  if (q.buyer_id !== actorId && q.seller_id !== actorId) return { ok: false as const, code: "FORBIDDEN", message: "You are not part of this inquiry." };
  if (!input.body?.trim()) return { ok: false as const, code: "VALIDATION_FAILED", message: "Write a message." };
  const user = getUserById(actorId);
  const now = new Date().toISOString();
  const id = `msg-${Date.now()}`;
  createMessage({
    id,
    inquiry_id: inquiryId,
    sender_id: actorId,
    sender_name: user?.name ?? "User",
    body: input.body.trim(),
    offer_amount: input.offerAmount ?? null,
    scheduled_at: input.scheduledAt ?? null,
    attachments: JSON.stringify(input.attachments ?? []),
    created_at: now,
  });
  updateInquiry(inquiryId, { status: q.seller_id === actorId ? "replied" : "open", last_activity_at: now, message: input.body.trim() });
  const other = q.seller_id === actorId ? q.buyer_id : q.seller_id;
  createNotification({
    id: `n-${Date.now()}`,
    user_id: other,
    type: "inquiry",
    title: `${user?.name ?? "Someone"} replied to your inquiry`,
    body: input.body.trim().slice(0, 120),
    data: JSON.stringify({ inquiryId }),
    read: 0,
    created_at: now,
  });
  return { ok: true as const, id };
}

export function setInquiryStatusForActor(actorId: string, inquiryId: string, status: string) {
  const q = getInquiry(inquiryId);
  if (!q) return { ok: false as const, code: "NOT_FOUND", message: "Inquiry not found." };
  if (q.buyer_id !== actorId && q.seller_id !== actorId) return { ok: false as const, code: "FORBIDDEN", message: "You are not part of this inquiry." };
  const allowed = ["open", "pending", "replied", "resolved", "cancelled"];
  if (!allowed.includes(status)) return { ok: false as const, code: "VALIDATION_FAILED", message: "Unknown status." };
  if (status === "cancelled" && actorId !== q.buyer_id) {
    return { ok: false as const, code: "FORBIDDEN", message: "Only the buyer can cancel an inquiry." };
  }
  if (status === "resolved" && actorId !== q.seller_id) {
    return { ok: false as const, code: "FORBIDDEN", message: "Only the seller can resolve an inquiry." };
  }
  if (q.status !== status && !canTransitionInquiry(q.status, status)) {
    return { ok: false as const, code: "INVALID_TRANSITION", message: `Cannot move an inquiry from ${q.status} to ${status}.` };
  }
  updateInquiry(inquiryId, { status, last_activity_at: new Date().toISOString() });
  return { ok: true as const };
}

export function createReportForVehicle(actorId: string, vehicleId: string, type = "Vehicle verification") {
  const v = getVehicle(vehicleId);
  if (!v) return { ok: false as const, code: "NOT_FOUND", message: "Vehicle not found." };
  const actor = getUserById(actorId);
  if (!actor) return { ok: false as const, code: "FORBIDDEN", message: "Unknown account." };
  const listing = getListingByVehicle(vehicleId);
  const canSeeUnpublished = v.owner_id === actorId || actor.role === "admin";
  if (!canSeeUnpublished && listing?.status !== "published") {
    return { ok: false as const, code: "FORBIDDEN", message: "Reports are available once the seller publishes this listing." };
  }
  const normalized = REPORT_TYPES.find((t) => t.toLowerCase() === String(type).toLowerCase());
  if (!normalized) {
    return {
      ok: false as const,
      code: "VALIDATION_FAILED",
      message: `Unknown report type. Use one of: ${REPORT_TYPES.join(", ")}.`,
    };
  }
  const now = new Date().toISOString();
  const id = `rep-${Date.now()}`;
  const reportId = `RPT-${new Date().getFullYear()}-${String(getReportsByUser(actorId).length + 1).padStart(4, "0")}`;
  createReport({
    id,
    vehicle_id: vehicleId,
    requested_by: actorId,
    type: normalized,
    status: "processing",
    file_key: null,
    report_id: reportId,
    generated_at: null,
    created_at: now,
    pdf_hash: null,
    snapshot: "{}",
    version: 1,
  });
  // Deterministic, synchronous demo generation: mark ready immediately.
  updateReportReady(id, now);
  return { ok: true as const, id, reportId };
}

function updateReportReady(id: string, at: string) {
  updateReport(id, { status: "ready", file_key: `reports/${id}.pdf`, generated_at: at });
}

export function reportSuspiciousListing(actorId: string, listingId: string, reason: string) {
  const listing = getListing(listingId);
  if (!listing) return { ok: false as const, code: "NOT_FOUND", message: "Listing not found." };
  const now = new Date().toISOString();
  const id = `a-${Date.now()}`;
  createAudit({
    id,
    actor_id: actorId,
    action: "listing.report_suspicious",
    entity_type: "listing",
    entity_id: listingId,
    before: "{}",
    after: JSON.stringify({ reason }),
    ip: "local",
    user_agent: "web",
    at: now,
  });
  const admin = getUserByEmail("admin@trustdrive.dev");
  if (admin) {
    createNotification({
      id: `n-${Date.now()}`,
      user_id: admin.id,
      type: "admin",
      title: "Listing reported as suspicious",
      body: reason,
      data: JSON.stringify({ listingId }),
      read: 0,
      created_at: now,
    });
  }
  return { ok: true as const };
}

export function updateProfile(userId: string, input: { name?: string; phone?: string; city?: string; sellerType?: string; businessName?: string; preferences?: Record<string, unknown> }) {
  const u = getUserById(userId);
  if (!u) return { ok: false as const, code: "NOT_FOUND", message: "User not found." };
  if (input.name !== undefined && !input.name.trim()) return { ok: false as const, code: "VALIDATION_FAILED", message: "Name cannot be empty." };
  updateUser(userId, {
    name: input.name,
    phone: input.phone,
    city: input.city,
    seller_type: input.sellerType,
    business_name: input.businessName,
    preferences: input.preferences ? JSON.stringify(input.preferences) : undefined,
  });
  return { ok: true as const };
}

export function changePassword(userId: string, current: string, next: string) {
  const u = getUserById(userId);
  if (!u) return { ok: false as const, code: "NOT_FOUND", message: "User not found." };
  if (!verifyPassword(current, u.password_hash)) return { ok: false as const, code: "INVALID_CREDENTIALS", message: "Current password is incorrect." };
  if (next.length < 10 || !/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) return { ok: false as const, code: "VALIDATION_FAILED", message: "New password must be 10+ characters with a letter and a number." };
  updatePassword(userId, hashPassword(next));
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Verification lookup (reg / VIN / TrustDrive ID / QR)
// ---------------------------------------------------------------------------
export function lookupVehicle(type: string, value: string) {
  const q = value.trim();
  if (!q) return null;
  const v =
    type === "vin"
      ? getVehicleByVin(normalizeVin(q))
      : type === "tdid"
      ? getVehicleByTrustDriveId(q)
      : type === "reg"
      ? getVehicleByReg(normalizeReg(q))
      : getVehicle(q) ?? getVehicleByReg(normalizeReg(q)) ?? getVehicleByVin(normalizeVin(q)) ?? getVehicleByTrustDriveId(q);
  if (!v) return null;
  const trust = computeVehicleTrust(v.id);
  return {
    vehicle: {
      id: v.id,
      make: v.make,
      model: v.model,
      regNo: v.reg_no,
      vin: v.vin,
      year: v.year,
      trustdriveId: v.trustdrive_id,
      location: v.location,
      km: v.km_claimed,
      fuel: v.fuel,
      transmission: v.transmission,
    },
    trust,
    checks: getVerificationChecks(v.id),
    insights: getInsights(v.id),
    chain: getChainStatus(v.id),
    theft: getTheft(v.id),
    findings: getFindings(v.id).filter((f) => f.status !== "cleared").map(findingView),
    qr: getQrTokensForVehicle(v.id).filter((t) => !t.revoked_at).map((t) => ({ token: t.token, createdAt: t.created_at })),
  };
}

export function regenerateQrToken(actorId: string, vehicleId: string) {
  const v = getVehicle(vehicleId);
  if (!v || v.owner_id !== actorId) return { ok: false as const, code: "FORBIDDEN", message: "You do not own this vehicle." };
  revokeQrTokens(vehicleId);
  const jti = newJti();
  const token = signQrToken(vehicleId, jti);
  createQrToken(jti, vehicleId, token, actorId);
  return { ok: true as const, token };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function sha256Hex(value: string) {
  return sha256(value);
}

// Keep type-only imports used in signatures referenced by pages.
export type { Role };
