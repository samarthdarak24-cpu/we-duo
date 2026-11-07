// ---------------------------------------------------------------------------
// GET /api/v1/categories
// Public catalogue for the dynamic Seller registration flow and Marketplace
// filters. This is metadata only: no vehicle rows, no seller data.
// ---------------------------------------------------------------------------
import { categoryCatalog, categoryRegistrySnapshot } from "@/lib/server/category-service";
import { ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = categoryCatalog();
  const snapshot = categoryRegistrySnapshot();
  return ok({
    ...catalog,
    registrySnapshot: snapshot
      ? {
          specVersion: snapshot.spec_version,
          trustVersion: snapshot.trust_version,
          createdAt: snapshot.created_at,
        }
      : null,
    note: "One shared verification engine. Category profiles supply fields, validation, documents, components, mileage rules, trust weights and agent nodes — never a separate application or database.",
  });
}
