// ---------------------------------------------------------------------------
// Saved-search and saved-vehicle alert evaluation (design.md §6.13).
// Notifications are only created for a real, current match — nothing is queued
// from a timer or fabricated. The evaluator is called after a listing is
// published or its price changes, and can be triggered by a buyer.
// ---------------------------------------------------------------------------
import { randomUUID } from "node:crypto";
import { all, createNotification, getListing, getVehicle } from "./db";
import { getMarketplace, type MarketplaceFilters } from "./data";

interface SavedSearchRow {
  id: string;
  buyer_id: string;
  name: string;
  filters: string;
  alerts_enabled: number;
}

interface SavedRow {
  id: string;
  buyer_id: string;
  listing_id: string;
  price_at_save: number;
}

function parseFilters(raw: string): MarketplaceFilters {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const filters: MarketplaceFilters = {};
    if (typeof parsed.q === "string") filters.q = parsed.q;
    if (typeof parsed.make === "string") filters.make = parsed.make;
    if (typeof parsed.fuel === "string") filters.fuel = parsed.fuel;
    if (typeof parsed.transmission === "string") filters.transmission = parsed.transmission;
    if (typeof parsed.location === "string") filters.location = parsed.location;
    if (typeof parsed.condition === "string") filters.condition = parsed.condition;
    for (const key of ["priceMin", "priceMax", "yearMin", "yearMax", "kmMax", "ownershipMax", "trustMin"] as const) {
      const value = Number(parsed[key]);
      if (Number.isFinite(value)) filters[key] = value;
    }
    if (parsed.verification === "verified" || parsed.verification === "caution") filters.verification = parsed.verification;
    if (parsed.accident === "found" || parsed.accident === "none") filters.accident = parsed.accident;
    return filters;
  } catch {
    return {};
  }
}

function existingNotificationKeys(userId: string, type: string): Set<string> {
  const rows = all<{ data: string }>(
    "SELECT data FROM notifications WHERE user_id = ? AND type = ? ORDER BY created_at DESC LIMIT 500",
    userId,
    type
  );
  const keys = new Set<string>();
  for (const row of rows) {
    try {
      const data = JSON.parse(row.data) as Record<string, unknown>;
      if (typeof data.key === "string") keys.add(data.key);
    } catch {
      // ignore malformed notification payloads
    }
  }
  return keys;
}

function notify(userId: string, type: string, title: string, body: string, data: Record<string, unknown>) {
  createNotification({
    id: `n-${randomUUID()}`,
    user_id: userId,
    type,
    title,
    body,
    data: JSON.stringify(data),
    read: 0,
    created_at: new Date().toISOString(),
  });
}

/**
 * Evaluate saved searches (and saved-vehicle price changes).
 * Passing `listingId` scopes the price-change half to that listing; search
 * matches are always evaluated against currently published listings.
 */
export function evaluateSavedSearchAlerts(buyerId?: string, listingId?: string) {
  let created = 0;
  const searches = all<SavedSearchRow>(
    buyerId
      ? "SELECT * FROM saved_searches WHERE alerts_enabled = 1 AND buyer_id = ? ORDER BY created_at DESC LIMIT 200"
      : "SELECT * FROM saved_searches WHERE alerts_enabled = 1 ORDER BY created_at DESC LIMIT 200",
    ...(buyerId ? [buyerId] : [])
  );
  for (const search of searches) {
    const seen = existingNotificationKeys(search.buyer_id, "saved_search");
    const result = getMarketplace({ ...parseFilters(search.filters), page: 1, pageSize: 5 }, search.buyer_id);
    for (const item of result.items) {
      const key = `${search.id}:${item.id}`;
      if (seen.has(key)) continue;
      notify(
        search.buyer_id,
        "saved_search",
        `New match for “${search.name}”`,
        `${item.make} ${item.model} (${item.year}) · ₹${item.price.toLocaleString("en-IN")} matches your saved search.`,
        { key, searchId: search.id, vehicleId: item.id, href: `/vehicle/${item.id}` }
      );
      created += 1;
    }
  }

  const savedWhere: string[] = [];
  const savedParams: string[] = [];
  if (buyerId) {
    savedWhere.push("buyer_id = ?");
    savedParams.push(buyerId);
  }
  if (listingId) {
    savedWhere.push("listing_id = ?");
    savedParams.push(listingId);
  }
  const savedRows = all<SavedRow>(
    `SELECT * FROM saved_vehicles${savedWhere.length ? ` WHERE ${savedWhere.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT 1000`,
    ...savedParams
  );
  for (const saved of savedRows) {
    const listing = getListing(saved.listing_id);
    if (!listing) continue;
    const vehicle = getVehicle(listing.vehicle_id);
    if (!vehicle) continue;
    if (saved.price_at_save > 0 && vehicle.asking_price !== saved.price_at_save) {
      const seen = existingNotificationKeys(saved.buyer_id, "saved_price");
      const key = `${saved.listing_id}:${vehicle.asking_price}`;
      if (seen.has(key)) continue;
      const direction = vehicle.asking_price < saved.price_at_save ? "dropped" : "changed";
      notify(
        saved.buyer_id,
        "saved_price",
        `Price ${direction} on a saved vehicle`,
        `${vehicle.make} ${vehicle.model}: ₹${saved.price_at_save.toLocaleString("en-IN")} → ₹${vehicle.asking_price.toLocaleString(
          "en-IN"
        )}.`,
        { key, listingId: saved.listing_id, vehicleId: vehicle.id, href: `/vehicle/${vehicle.id}` }
      );
      created += 1;
    }
  }

  return { evaluatedSearches: searches.length, evaluatedSavedVehicles: savedRows.length, created };
}
