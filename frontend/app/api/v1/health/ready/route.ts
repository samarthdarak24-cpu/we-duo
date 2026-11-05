import { NextResponse } from "next/server";

/**
 * GET /api/v1/health/ready
 * Render health-check endpoint. Returns 200 as soon as the Next.js process
 * is accepting requests. No auth, no DB query — keep it fast.
 */
export async function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}

/**
 * HEAD /api/v1/health/ready
 * Render also sends HEAD requests for health checks.
 */
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
