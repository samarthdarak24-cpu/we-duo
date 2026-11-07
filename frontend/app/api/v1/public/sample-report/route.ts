import { getReportData } from "@/lib/server/data";
import { fail } from "@/lib/server/http";
import { reportPdf } from "@/lib/server/pdf";
import { sha256 } from "@/lib/server/chain";
import { LIMITS, enforceRateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/public/sample-report — the public "download sample PDF" CTA.
 *
 * The previous CTA pointed at `/api/v1/reports/rep-1/download`, which is
 * correctly owner-gated and therefore returned 403 JSON to every anonymous
 * visitor. This route keeps that RBAC intact and instead serves a genuinely
 * generated PDF built ONLY from the fixed, seeded DEMO report id.
 *
 * Safety properties:
 *  - The report id is a compile-time constant; no caller-supplied id is read,
 *    so this endpoint cannot be used as an IDOR into a real customer's report.
 *  - No session, token or consent is required because no private record is
 *    exposed: `rep-1` is synthetic seed data (see lib/server/db.ts).
 *  - The cover, filename and response headers label the content as demo data.
 *  - The PDF bytes are produced by the real server-side generator; nothing is
 *    faked, and a 503 is returned when the demo report is not seeded.
 */
const DEMO_REPORT_ID = "rep-1";

export async function GET(req: Request) {
  const limited = enforceRateLimit(req, "sample-report", LIMITS.report);
  if (limited) return limited;

  const data = getReportData(DEMO_REPORT_ID);
  if (!data) {
    return fail(503, "SAMPLE_UNAVAILABLE", "The demo sample report is not seeded. Run the seed script and try again.");
  }
  if (data.report.status !== "ready") {
    return fail(503, "SAMPLE_UNAVAILABLE", `The demo sample report is ${data.report.status}.`);
  }

  const pdf = reportPdf({
    reportId: "DEMO-SAMPLE-0001",
    type: "DEMO / SAMPLE — Vehicle verification (synthetic data)",
    generatedAt: data.report.generated_at ?? data.report.created_at,
    snapshotHash: data.snapshotHash,
    verifyUrl: data.verifyUrl,
    vehicle: {
      make: data.vehicle.make,
      model: data.vehicle.model,
      year: data.vehicle.year,
      regNo: data.vehicle.reg_no,
      vin: data.vehicle.vin || "",
      km: data.vehicle.km_claimed,
      fuel: data.vehicle.fuel,
      transmission: data.vehicle.transmission,
      location: data.vehicle.location,
      trustdriveId: data.vehicle.trustdrive_id,
      category: data.vehicle.category,
      color: data.vehicle.color,
      ownership: data.vehicle.ownership_count,
      askingPrice: data.vehicle.asking_price,
      condition: data.vehicle.condition,
    },
    seller: data.seller,
    trust: data.trust,
    insights: data.insights,
    findings: data.findings.map((f) => ({
      code: f.code,
      severity: f.severity,
      title: f.title,
      explanation: f.explanation,
      recommendation: f.recommendation,
      status: f.status,
      points: f.points,
    })),
    pricing: data.pricing,
    chain: data.chain,
    documents: data.documents,
    mileage: data.mileage,
    damage: data.damage,
    history: data.history,
    theft: data.theft,
  });

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="trustdrive-DEMO-sample-report.pdf"',
      "Cache-Control": "no-store",
      "X-TrustDrive-Demo-Data": "synthetic-seed-data-not-a-real-vehicle-record",
      "X-Report-SHA256": sha256(pdf.toString("latin1")),
    },
  });
}
