import { getDamage, getDocuments, getHistory, getVehicle } from "@/lib/server/db";
import { fail, ok, requireRole } from "@/lib/server/http";
import {
  getAllComponents,
  getComponentAvailabilityReport,
  mapZoneToComponentId,
  VehicleComponentDef,
} from "@/lib/vehicle-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/vehicles/:id/components
 * Returns component mapping, availability, verified damage records, and evidence links per component.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;

  const vehicle = getVehicle(params.id);
  if (!vehicle) {
    return fail(404, "NOT_FOUND", "Vehicle not found");
  }

  const damageRows = getDamage(vehicle.id);
  const documents = getDocuments(vehicle.id);
  const history = getHistory(vehicle.id);
  const components = getAllComponents();
  const availability = getComponentAvailabilityReport();

  // Map each component to its genuine DB records
  const componentReports = components.map((comp) => {
    // Find damage rows matching this component ID or legacy aliases
    const matchedDamage = damageRows.filter((d) => {
      const canonical = mapZoneToComponentId(d.zone_id);
      return canonical === comp.id || d.zone_id === comp.id;
    });

    // Check if any repair history references this component
    const matchedHistory = history.filter((h) => {
      const titleLower = (h.title + " " + h.description).toLowerCase();
      const compLower = comp.label.toLowerCase();
      const idLower = comp.id.replace(/_/g, " ");
      return titleLower.includes(idLower) || titleLower.includes(compLower);
    });

    // Compute component verification status
    let status: "verified_clean" | "recorded_damage" | "pending_review" | "unavailable" = "verified_clean";
    if (!comp.available) {
      status = "unavailable";
    } else if (matchedDamage.some((d) => d.status === "verified")) {
      status = "recorded_damage";
    } else if (matchedDamage.some((d) => d.status === "pending")) {
      status = "pending_review";
    }

    return {
      componentId: comp.id,
      label: comp.label,
      category: comp.category,
      available: comp.available,
      unavailableReason: comp.unavailableReason,
      primaryNode: comp.primaryNode,
      associatedNodes: comp.associatedNodes,
      defaultAnchor: comp.defaultHotspotAnchor,
      explosionVector: comp.explosionVector,
      status,
      damageRecords: matchedDamage.map((d) => ({
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
    components: componentReports,
    availability,
  });
}
