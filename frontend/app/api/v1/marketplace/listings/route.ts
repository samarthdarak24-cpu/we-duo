import { getMarketplace, type MarketplaceFilters } from "@/lib/server/data";
import { getAuth, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: string | null) {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parse(req: Request): MarketplaceFilters {
  const p = new URL(req.url).searchParams;
  return {
    q: p.get("q") ?? undefined,
    make: p.get("make") ?? undefined,
    priceMin: num(p.get("priceMin")),
    priceMax: num(p.get("priceMax")),
    yearMin: num(p.get("yearMin")),
    yearMax: num(p.get("yearMax")),
    kmMax: num(p.get("kmMax")),
    fuel: p.get("fuel") ?? undefined,
    transmission: p.get("transmission") ?? undefined,
    location: p.get("location") ?? undefined,
    ownershipMax: num(p.get("ownershipMax")),
    condition: p.get("condition") ?? undefined,
    verification: (p.get("verification") as MarketplaceFilters["verification"]) ?? undefined,
    accident: (p.get("accident") as MarketplaceFilters["accident"]) ?? undefined,
    trustMin: num(p.get("trustMin")),
    sort: (p.get("sort") as MarketplaceFilters["sort"]) ?? undefined,
    page: num(p.get("page")),
    pageSize: num(p.get("pageSize")),
  };
}

/** GET /api/v1/marketplace/listings — public browse with filters/sort/pagination. */
export async function GET(req: Request) {
  const auth = getAuth(req);
  return ok(getMarketplace(parse(req), auth?.sub));
}
