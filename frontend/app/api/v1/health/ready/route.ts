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
 * Render also sends HEAD requests for health checks.
 */
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
