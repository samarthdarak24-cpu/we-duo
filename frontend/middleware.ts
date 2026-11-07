import { NextResponse, type NextRequest } from "next/server";

/**
 * Page-level portal guard.
 *
 * API routes already enforce RBAC; this stops a signed-in buyer from rendering
 * a seller/admin portal at all, and stops an anonymous visitor from loading any
 * portal shell at all. The JWT payload is decoded for routing only — signature
 * verification happens on the server and in the API layer, so a forged role
 * claim can at worst reach a page whose data calls then return 401.
 */
function tokenRole(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    if (!part) return null;
    const payload = JSON.parse(atob(part)) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const portal = path.startsWith("/seller")
    ? "seller"
    : path.startsWith("/buyer")
      ? "buyer"
      : path.startsWith("/admin")
        ? "admin"
        : null;
  if (!portal) return NextResponse.next();

  const role = tokenRole(req.cookies.get("td_token")?.value);
  if (!role) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", portal);
    return NextResponse.redirect(url);
  }
  if (role !== portal) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", portal);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/seller/:path*", "/buyer/:path*", "/admin/:path*"],
};
