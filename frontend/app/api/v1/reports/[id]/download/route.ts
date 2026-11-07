import { getReportData } from "@/lib/server/data";
import { createAudit, getVehicle, updateReport } from "@/lib/server/db";
import { fail, getAuth } from "@/lib/server/http";
import { reportPdf } from "@/lib/server/pdf";
import { sha256 } from "@/lib/server/chain";
import { verifyDownloadToken } from "@/lib/server/signed";
import { LIMITS, enforceRateLimit } from "@/lib/server/ratelimit";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/reports/:id/download — owner/seller/admin, or a short-lived
 * signed link minted by the report route. The PDF hash is recorded either way.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const limited = enforceRateLimit(req, "report-download", LIMITS.report);
  if (limited) return limited;
  const data = getReportData(params.id);
  if (!data) return fail(404, "NOT_FOUND", "Report not found");
  const auth = getAuth(req);
  const vehicle = getVehicle(data.report.vehicle_id);
  const tokenParam = new URL(req.url).searchParams.get("token");
  const signed = verifyDownloadToken(tokenParam ?? "");
  const signedOk =
    !!signed && signed.scope === "report" && (signed.id === params.id || signed.id === data.report.report_id);
  const privileged =
    signedOk ||
    (!!auth && (auth.sub === data.report.requested_by || auth.sub === vehicle?.owner_id || auth.role === "admin"));
  if (!privileged) {
    // A token was presented but it failed verification (expired, tampered or
    // scoped to another report). Say that honestly instead of implying the
    // caller is signed into the wrong account.
    if (tokenParam) {
      return fail(403, "DOWNLOAD_LINK_INVALID", "This download link is invalid or has expired. Request a new link.");
    }
    return fail(403, "FORBIDDEN", "This report belongs to another account. Request your own copy.");
  }
  if (data.report.status !== "ready") {
    return fail(409, "REPORT_NOT_READY", `Report is ${data.report.status}. Try again shortly.`);
  }

  const generatedAt = data.report.generated_at ?? data.report.created_at;
  const pdf = reportPdf({
    reportId: data.report.report_id,
    type: data.report.type,
    generatedAt,
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
      code: f.code, severity: f.severity, title: f.title, explanation: f.explanation,
      recommendation: f.recommendation, status: f.status, points: f.points,
    })),
    pricing: data.pricing,
    chain: data.chain,
    documents: data.documents,
    mileage: data.mileage,
    damage: data.damage,
    history: data.history,
    theft: data.theft,
  });

  const hash = sha256(pdf.toString("latin1"));
  updateReport(params.id, { pdf_hash: hash });
  createAudit({
    id: `aud-${randomUUID()}`,
    // audit_logs.actor_id is a foreign key: a signed download is attributed to
    // the account that requested the report, with the link recorded in `after`.
    actor_id: auth?.sub ?? data.report.requested_by,
    action: signedOk && !auth ? "report.download.signed" : "report.download",
    entity_type: "report",
    entity_id: params.id,
    before: "{}",
    after: JSON.stringify({ pdfHash: hash, bytes: pdf.length, via: signedOk && !auth ? "signed-link" : "session" }),
    ip: req.headers.get("x-forwarded-for") ?? "127.0.0.1",
    user_agent: req.headers.get("user-agent") ?? "",
    at: new Date().toISOString(),
  });

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${data.report.report_id}.pdf"`,
      "Cache-Control": "no-store",
      "X-Report-SHA256": hash,
    },
  });
}
