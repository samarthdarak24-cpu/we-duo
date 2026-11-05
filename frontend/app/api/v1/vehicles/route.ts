import { createVehicle, getAllVehicles, getVehiclesByOwner, type VehicleRow } from "@/lib/server/db";
import { created, fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/vehicles — list vehicles for authenticated seller or all for admin. */
export async function GET(req: Request) {
  const guard = requireRole(req, "seller", "admin");
  if (!guard.ok) return guard.response;
  if (guard.user.role === "admin") {
    return ok({ items: getAllVehicles() });
  }
  return ok({ items: getVehiclesByOwner(guard.user.sub) });
}

/** POST /api/v1/vehicles — register a new vehicle for seller. */
export async function POST(req: Request) {
  const guard = requireRole(req, "seller", "admin");
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as {
    regNo?: string;
    vin?: string;
    make?: string;
    model?: string;
    variant?: string;
    year?: number;
    fuel?: string;
    transmission?: string;
    color?: string;
    category?: string;
    askingPrice?: number;
    mileage?: number;
    location?: string;
    description?: string;
  } | null;

  if (!body?.regNo || !body?.vin || !body?.make || !body?.model || !body?.year) {
    return fail(400, "VALIDATION_FAILED", "regNo, vin, make, model and year are required.");
  }

  const now = new Date().toISOString();
  const id = `v-${Date.now()}`;
  const trustdriveId = `TD-${body.year}-${Math.floor(1000 + Math.random() * 9000)}`;
  const qrToken = `qr-${id}`;

  const row: VehicleRow = {
    id,
    owner_id: guard.user.sub,
    make: body.make,
    model: body.model,
    variant: body.variant || "Standard",
    year: Number(body.year),
    reg_no: body.regNo.toUpperCase(),
    vin: body.vin.toUpperCase(),
    fuel: body.fuel || "Petrol",
    transmission: body.transmission || "Manual",
    category: body.category || "Sedan",
    color: body.color || "Black",
    ownership_count: 1,
    location: body.location || "Mumbai, Maharashtra",
    km_claimed: Number(body.mileage) || 0,
    last_verified_km: Number(body.mileage) || 0,
    asking_price: Number(body.askingPrice) || 0,
    status: "draft",
    base_value: Number(body.askingPrice) || 0,
    condition_score: 85,
    trustdrive_id: trustdriveId,
    qr_token: qrToken,
    description: body.description || "",
    condition: "Good",
    created_at: now,
    updated_at: now,
  };

  try {
    createVehicle(row);
    return created({ id, ...row });
  } catch (err: any) {
    if (err.message?.includes("UNIQUE constraint failed")) {
      return fail(409, "DUPLICATE_VEHICLE", "A vehicle with this registration number or VIN already exists.");
    }
    return fail(500, "INTERNAL_ERROR", err.message || "Failed to create vehicle.");
  }
}
