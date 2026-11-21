// ---------------------------------------------------------------------------
// GET /api/v1/vehicles/:id/passport
// Vehicle History Passport — one evidence-backed shape for every category.
//
// Authenticated buyers/sellers/admins receive the full passport. Anonymous
// callers only reach vehicles that are actually published, and receive a
// REDACTED summary (no chassis/VIN, no file names, no hashes, no evidence
// graph). The QR / public-verify flows use that summary, never a draft record.
// ---------------------------------------------------------------------------
import { restrictPassportToDocuments, vehiclePassport } from "@/lib/server/category-service";
import { getAllListings, getVehicle } from "@/lib/server/db";
import { fail, getAuth, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Passport = NonNullable<ReturnType<typeof vehiclePassport>>;

function redact(p: Passport) {
  return {
    specVersion: p.specVersion,
    trustVersion: p.trustVersion,
    generatedAt: p.generatedAt,
    visibility: "public-summary" as const,
    vehicle: {
      id: p.vehicle.id,
      trustdriveId: p.vehicle.trustdriveId,
      make: p.vehicle.make,
      model: p.vehicle.model,
      variant: p.vehicle.variant,
      year: p.vehicle.year,
      regNo: p.vehicle.regNo ? `${String(p.vehicle.regNo).slice(0, 4)}****` : null,
      fuel: p.vehicle.fuel,
      transmission: p.vehicle.transmission,
      legacyCategory: p.vehicle.legacyCategory,
      color: p.vehicle.color,
      location: p.vehicle.location,
      owners: p.vehicle.owners,
      claimedDistanceKm: p.vehicle.claimedDistanceKm,
      lastVerifiedKm: p.vehicle.lastVerifiedKm,
      askingPrice: p.vehicle.askingPrice,
      condition: p.vehicle.condition,
      status: p.vehicle.status,
    },
    category: p.category,
    trust: p.trust,
    specifications: { values: {}, note: "Seller-declared specifications are available to signed-in buyers." },
    documents: p.documents
      .filter((d) => d.consent)
      .map((d) => ({
        id: d.id, type: d.type, label: d.label, status: d.status,
        verifiedAt: d.verifiedAt, required: d.required, note: d.note,
      })),
    requiredDocuments: p.requiredDocuments,
    distance: p.distance,
    battery: p.battery,
    findings: p.findings,
    damage: p.damage,
    history: p.history,
    timeline: p.timeline.map((entry) => ({
      ...entry,
      description:
        entry.type === "document"
          ? "Document record on file. File name, hash and document id are hidden in the public summary."
          : entry.description,
      evidenceRefs: [],
    })),
    mileageAnalysis: {
      ...p.mileageAnalysis,
      readings: p.mileageAnalysis.readings.map((reading) => ({ ...reading, documentId: null })),
      anomalies: p.mileageAnalysis.anomalies.map((anomaly) => ({ ...anomaly, evidenceRefs: [] })),
    },
    assessment: {
      ...p.assessment,
      riskIndicators: p.assessment.riskIndicators.map((indicator) => ({
        ...indicator,
        evidenceRefs: [],
      })),
      evidenceRefs: [],
    },
    checks: p.checks,
    recordIntegrity: { intact: p.recordIntegrity.intact, records: p.recordIntegrity.records, note: p.recordIntegrity.note },
    inspection3d: p.inspection3d,
    agent: p.agent,
    caveats: [
      ...p.caveats,
      "Public summary: identity, file names, hashes and the evidence graph are hidden. Sign in as a buyer to review the full passport.",
    ],
  };
}

function buyerView(p: Passport) {
  // A published listing does not make every evidence file public. Only
  // documents the seller consented to share reach a buyer; status and
  // coverage summaries stay visible so the passport remains honest.
  const consented = new Set(p.documents.filter((d) => d.consent).map((d) => d.id));
  const restricted = restrictPassportToDocuments(p, consented);
  return {
    ...restricted,
    visibility: "buyer" as const,
    caveats: [
      ...restricted.caveats,
      "Private documents without buyer consent are hidden. Their verification status still affects the assessment.",
    ],
  };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const passport = vehiclePassport(params.id);
  const vehicle = getVehicle(params.id);
  if (!passport || !vehicle) return fail(404, "NOT_FOUND", "Vehicle not found");

  const published = getAllListings().some(
    (l) => l.vehicle_id === params.id && l.status === "published"
  );

  const auth = getAuth(req);
  if (auth) {
    const guard = requireRole(req, "buyer", "seller", "admin");
    if (guard.ok) {
      // Owner and admin see the whole evidence set, including drafts.
      if (auth.sub === vehicle.owner_id || auth.role === "admin") {
        return ok({ ...passport, visibility: "full" as const });
      }
      // Another seller/buyer may only inspect a vehicle that is actually on
      // the marketplace, and only consented evidence files.
      if (!published) return fail(404, "NOT_FOUND", "Vehicle not found");
      return ok(buyerView(passport));
    }
  }

  // Anonymous: only published vehicles, and only a redacted summary.
  if (!published) return fail(404, "NOT_FOUND", "Vehicle not found");
  return ok(redact(passport));
}
