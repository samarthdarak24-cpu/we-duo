import { componentsForVehicle, hotspotsFor } from "@/lib/server/data";
import { getDamage, getDocuments, getHistory, getVehicle } from "@/lib/server/db";
import { fail, ok, requireRole } from "@/lib/server/http";
import { getComponentAvailabilityReport } from "@/lib/vehicle-registry";
import { damageDetectorForCategory, modelAssetForCategory } from "@/lib/vehicle-categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/vehicles/:id/components
 * Category-aware component mapping, availability, damage records and evidence
 * links. Car profiles keep the measured sedan GLB registry; every other profile
 * returns its own category component set with interactions explicitly OFF.
 * A scooter never receives car doors, a bonnet or a car 3D asset.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;

  const vehicle = getVehicle(params.id);
  if (!vehicle) return fail(404, "NOT_FOUND", "Vehicle not found");

  const damageRows = getDamage(vehicle.id);
  const documents = getDocuments(vehicle.id);
  const history = getHistory(vehicle.id);
  const { categoryId, assetStatus, interactionsAvailable, defs } = componentsForVehicle(vehicle.id);
  const hotspots = hotspotsFor(vehicle.id);
  const hotspotById = new Map(hotspots.map((h) => [h.id, h]));
  const asset = modelAssetForCategory(categoryId);
  const detector = damageDetectorForCategory(categoryId);

  const componentReports = defs.map((comp) => {
    // Match on the stored component_id first, then the zone id. Car mesh aliases
    // are already resolved by hotspotsFor; scooter rows never pass through them.
    const matchedDamage = damageRows.filter((d) => {
      const canonical = d.component_id || hotspotById.get(d.zone_id)?.id || d.zone_id;
      return canonical === comp.id || d.zone_id === comp.id;
    });

    const matchedHistory = history.filter((h) => {
      const titleLower = (h.title + " " + h.description).toLowerCase();
      const compLower = comp.label.toLowerCase();
      const idLower = comp.id.replace(/_/g, " ");
      return titleLower.includes(idLower) || titleLower.includes(compLower);
    });

    let status: "verified_clean" | "recorded_damage" | "pending_review" | "unavailable" = "verified_clean";
    if (!comp.available) {
      status = "unavailable";
    } else if (matchedDamage.some((d) => d.status === "verified")) {
      status = "recorded_damage";
    } else if (matchedDamage.some((d) => d.status === "pending" || d.status === "seller_reported")) {
      status = "pending_review";
    }

    return {
      componentId: comp.id,
      label: comp.label,
      category: comp.category,
      available: comp.available,
      interactionsAvailable,
      unavailableReason: comp.unavailableReason,
      primaryNode: comp.primaryNode,
      associatedNodes: comp.associatedNodes,
      defaultAnchor: comp.defaultHotspotAnchor,
      explosionVector: comp.explosionVector,
      source: comp.source,
      status,
      damageRecords: matchedDamage.map((d) => ({
        id: d.id,
        severity: d.severity,
        description: d.description,
        repairStatus: d.repair_status,
        repairDetails: d.repair_details,
        inspectionDate: d.inspection_date,
        status: d.status,
        provenance: d.position_source,
        photoKeys: (() => {
          try {
            return JSON.parse(d.photo_keys || "[]");
          } catch {
            return [];
          }
        })(),
        repairInvoiceDocId: d.repair_invoice_doc_id,
        supportingDocument: d.repair_invoice_doc_id
          ? documents.find((doc) => doc.id === d.repair_invoice_doc_id)
          : null,
      })),
      repairHistory: matchedHistory.map((h) => ({
        id: h.id,
        date: h.event_date,
        title: h.title,
        description: h.description,
        status: h.status,
      })),
    };
  });

  return ok({
    vehicleId: vehicle.id,
    vin: vehicle.vin,
    categoryId,
    model3d: { status: assetStatus, assetUrl: asset.url, interactionsAvailable, note: asset.note },
    damageDetection: detector,
    components: componentReports,
    availability: interactionsAvailable
      ? getComponentAvailabilityReport()
      : { status: "unavailable", reason: `No licensed 3D asset for this category; ${defs.length} category components are listed without 3D interactions.` },
    note: interactionsAvailable
      ? "Measured car GLB registry. Every hotspot maps to a real component id and to damage_records rows."
      : "Category component registry only. No GLB exists for this category; hotspots are listed but 3D interactions are unavailable, and no car model is substituted.",
  });
}
