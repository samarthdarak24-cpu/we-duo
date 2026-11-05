// Standard response + error shape (design.md §34) and RBAC guard (§21).
import { NextResponse } from "next/server";
import { signToken, verifyToken, type JwtPayload, type Role } from "./auth";
import { getUserById } from "./db";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, { status: 200, ...init });
}

export function created<T>(data: T) {
  return NextResponse.json({ data }, { status: 201 });
}

export function fail(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

/** Parse a cookie header without importing next/headers (works in route handlers and tests). */
export function readCookie(req: Request, name: string): string {
  const header = req.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export function getAuth(req: Request): JwtPayload | null {
  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const token = bearer || readCookie(req, "td_token");
  const payload = token ? verifyToken(token) : null;
  if (!payload) return null;
  const user = getUserById(payload.sub);
  // Soft-deleted users keep no access even if their JWT has not expired yet.
  if (!user) return null;
  // SEC-001 defence in depth: never trust a role claim that disagrees with the
  // live account row (a forged/legacy token must not grant elevated access).
  if (user.role !== payload.role) return null;
  // Service tokens are for the Next.js -> Python hop only, never for user APIs.
  if ((payload as JwtPayload & { svc?: string }).svc) return null;
  return payload;
}

type Guard = { ok: true; user: JwtPayload } | { ok: false; response: NextResponse };

/** requireRole(...roles): 401 if no/invalid token, 403 if wrong role. */
export function requireRole(req: Request, ...roles: Role[]): Guard {
  const user = getAuth(req);
  if (!user) return { ok: false, response: fail(401, "UNAUTHENTICATED", "Authentication required.") };
  if (roles.length && !roles.includes(user.role)) {
    return { ok: false, response: fail(403, "FORBIDDEN_ROLE", "You do not have access to this resource.") };
  }
  return { ok: true, user };
}

/** Set the httpOnly session cookie alongside a JSON response. */
export function withSessionCookie<T>(response: NextResponse, user: { id: string; role: Role; name: string }, sessionId?: string) {
  const token = signToken({ sub: user.id, role: user.role, name: user.name, sid: sessionId });
  response.cookies.set("td_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}

/** Refresh token lives in a separate httpOnly cookie (30 days, rotated). */
export function withRefreshCookie<T>(response: NextResponse, refresh: string) {
  response.cookies.set("td_refresh", refresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set("td_token", "", { httpOnly: true, path: "/", maxAge: 0 });
  response.cookies.set("td_refresh", "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
