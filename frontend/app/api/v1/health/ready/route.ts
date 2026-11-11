import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/health/ready
 * Render health-check endpoint. Ensures DB schema and seed are ready,
 * then returns 200 OK.
 */
export async function GET() {
  try {
    getDb();
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (err) {
    console.error("[health/ready] DB initialization error:", err);
    return NextResponse.json({ status: "error", message: "Database initialization failed" }, { status: 503 });
  }
}

/**
 * HEAD /api/v1/health/ready
 * Render also sends HEAD requests for health checks. Verify DB readiness so
 * misconfigured secrets or non-writable storage fail health checks immediately.
 */
export async function HEAD() {
  try {
    getDb();
    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error("[health/ready HEAD] DB initialization error:", err);
    return new NextResponse(null, { status: 503 });
  }
}
