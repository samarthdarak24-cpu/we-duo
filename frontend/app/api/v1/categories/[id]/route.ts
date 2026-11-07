// ---------------------------------------------------------------------------
// GET /api/v1/categories/:id
// Full profile for one category. The Seller wizard calls this after the buyer
// picks a category so the form, identifier validation, document checklist,
// component registry, 3D asset and agent node list are all driven by one source.
// ---------------------------------------------------------------------------
import { categoryProfile } from "@/lib/server/category-service";
import { fail, ok } from "@/lib/server/http";
import { allCategories, matchCategoryId } from "@/lib/vehicle-categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const requested = decodeURIComponent(params.id ?? "");
  // Accept a legacy label ("Electric Scooter", "Sedan") as well as a taxonomy id.
  // Strict: an unknown label is a 404, never a silent passenger-car fallback.
  const categoryId = matchCategoryId(requested);
  const profile = categoryId ? categoryProfile(categoryId) : null;
  if (!profile) {
    return fail(404, "UNKNOWN_CATEGORY", `Unknown vehicle category '${requested}'.`, {
      available: allCategories().map((c) => c.id),
    });
  }
  if (categoryId !== requested) {
    return ok({ ...profile, requestedAs: requested, resolvedFrom: "label-or-legacy" });
  }
  return ok(profile);
}
