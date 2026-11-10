// ---------------------------------------------------------------------------
// Dependency-free A4 PDF writer (design.md §9.12 / §31.3).
// The report is issued as a formal verification letter: letterhead, reference
// and date, addressee, subject, numbered clauses, evidence annexure, authority
// signature and seal, per-page header/footer and a vector QR code.
// Helvetica core fonts only, so the output needs no embedding.
// ---------------------------------------------------------------------------
import QRCode from "qrcode";

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = 58;

const GOLD = "0.773 0.643 0.427";
const INK = "0.09 0.10 0.11";
const MUTED = "0.42 0.45 0.49";
const LINE = "0.82 0.84 0.87";
const RED = "0.85 0.34 0.34";
const AMBER = "0.906 0.659 0.243";
const GREEN = "0.212 0.725 0.510";

function pdfSafe(text: string) {
  return text
    .replace(/₹/g, "INR ")
    .replace(/[–—]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/·/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\xFF\n]/g, "");
}

function escapePdf(text: string) {
  return pdfSafe(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(text: string, size: number, width = CONTENT_W): string[] {
  const maxChars = Math.max(8, Math.floor(width / (size * 0.5)));
  const out: string[] = [];
  for (const rawLine of pdfSafe(text).split("\n")) {
    const words = rawLine.split(/\s+/);
    let line = "";
    for (const word of words) {
      if ((line + " " + word).trim().length > maxChars) {
        if (line) out.push(line.trim());
        line = word;
      } else {
        line += " " + word;
      }
    }
    out.push(line.trim());
  }
  return out.length ? out : [""];
}

interface Page {
  ops: string[];
  y: number;
  header?: string;
  cover?: boolean;
}

interface DocMeta {
  reportId: string;
  footerNote: string;
  title: string;
  subtitle: string;
  integrity: string;
}

class Pdf {
  pages: Page[] = [];
  page: Page;
  meta!: DocMeta;

  constructor() {
    this.page = this.newPage();
  }

  newPage(header?: string, cover = false) {
    const p: Page = { ops: [], y: PAGE_H - (cover ? 0 : 92), header, cover };
    this.pages.push(p);
    this.page = p;
    return p;
  }

  get y() {
    return this.page.y;
  }
  set y(v: number) {
    this.page.y = v;
  }

  ensure(height: number) {
    if (this.y - height < BOTTOM) this.newPage(this.page.header);
  }

  text(value: string, size: number, x: number, opts: { bold?: boolean; color?: string; width?: number; lineGap?: number } = {}) {
    const color = opts.color ?? INK;
    const width = opts.width ?? CONTENT_W;
    const gap = opts.lineGap ?? 3;
    for (const line of wrap(value, size, width)) {
      this.ensure(size + gap + 2);
      this.page.ops.push(
        `BT /${opts.bold ? "F2" : "F1"} ${size} Tf ${color} rg ${x} ${this.y} Td (${escapePdf(line)}) Tj ET`
      );
      this.y -= size + gap;
    }
  }

  textAt(value: string, size: number, x: number, y: number, opts: { bold?: boolean; color?: string } = {}) {
    this.page.ops.push(
      `BT /${opts.bold ? "F2" : "F1"} ${size} Tf ${opts.color ?? INK} rg ${x} ${y} Td (${escapePdf(value)}) Tj ET`
    );
  }

  gap(h = 8) {
    this.y -= h;
  }

  rule(color = LINE, weight = 0.7) {
    this.ensure(8);
    this.page.ops.push(`${color} RG ${weight} w ${MARGIN} ${this.y} m ${PAGE_W - MARGIN} ${this.y} l S`);
    this.y -= 10;
  }

  section(title: string, index: number) {
    this.newPage(`Section ${index} - ${title}`);
    this.y = PAGE_H - 96;
    this.page.ops.push(`${GOLD} rg ${MARGIN} ${this.y + 10} 26 2 re f`);
    this.text(`${String(index).padStart(2, "0")}  ${title.toUpperCase()}`, 15, MARGIN, { bold: true });
    this.rule(GOLD, 1);
    this.gap(4);
  }

  kv(rows: [string, string][], labelWidth = 150) {
    for (const [label, value] of rows) {
      this.ensure(20);
      const start = this.y;
      this.textAt(label, 8.5, MARGIN, start, { color: MUTED });
      this.text(value || "-", 9.5, MARGIN + labelWidth, { width: CONTENT_W - labelWidth, lineGap: 2 });
      if (this.y > start) this.gap(4);
    }
    this.gap(2);
  }

  table(headers: string[], rows: string[][], widths: number[], align?: ("left" | "right")[]) {
    const rowH = 18;
    this.ensure(rowH * 2);
    const drawRow = (cells: string[], header: boolean) => {
      if (header) {
        this.page.ops.push(`0.957 0.949 0.925 rg ${MARGIN} ${this.y - 4} ${CONTENT_W} ${rowH} re f`);
      }
      let x = MARGIN + 4;
      cells.forEach((cell, i) => {
        const w = widths[i] ?? 60;
        const limit = Math.max(4, Math.floor(w / 4.8));
        const value = cell.length > limit ? cell.slice(0, limit - 1) + "..." : cell;
        const right = !header && align?.[i] === "right";
        if (right) {
          const approx = value.length * 4.4;
          this.textAt(value, 8.5, x + w - approx - 6, this.y, { bold: header, color: header ? INK : "0.2 0.23 0.26" });
        } else {
          this.textAt(value, 8.5, x, this.y, { bold: header, color: header ? INK : "0.2 0.23 0.26" });
        }
        x += w;
      });
      this.y -= rowH;
      this.page.ops.push(`0.9 0.91 0.93 RG 0.4 w ${MARGIN} ${this.y + 4} m ${PAGE_W - MARGIN} ${this.y + 4} l S`);
    };
    drawRow(headers, true);
    for (const row of rows) {
      if (this.y - rowH < BOTTOM) {
        this.newPage(this.page.header);
        drawRow(headers, true);
      }
      drawRow(row, false);
    }
    this.gap(6);
  }

  chip(text: string, color: string, x?: number) {
    const w = text.length * 5 + 14;
    const px = x ?? MARGIN;
    this.page.ops.push(`${color} rg ${px} ${this.y - 2} ${w} 16 re f`);
    this.textAt(text.toUpperCase(), 7.5, px + 7, this.y + 2, { bold: true, color: "1 1 1" });
    if (x === undefined) this.y -= 22;
  }

  /** Simple line chart for mileage readings. */
  mileageChart(points: { km: number; verified: boolean }[]) {
    if (!points.length) {
      this.text("No mileage readings available.", 9, MARGIN, { color: MUTED });
      return;
    }
    const h = 150;
    this.ensure(h + 40);
    const top = this.y;
    const bottom = top - h;
    const left = MARGIN + 46;
    const right = PAGE_W - MARGIN - 10;
    this.page.ops.push(`${LINE} RG 0.5 w ${left} ${bottom} m ${right} ${bottom} l S`);
    this.page.ops.push(`${LINE} RG 0.5 w ${left} ${bottom} m ${left} ${top} l S`);
    const kms = points.map((p) => p.km);
    const max = Math.max(...kms) * 1.1 || 1;
    const step = points.length > 1 ? (right - left) / (points.length - 1) : 0;
    for (let g = 0; g <= 4; g++) {
      const y = bottom + (h * g) / 4;
      const val = Math.round((max * g) / 4);
      this.textAt(`${val.toLocaleString("en-IN")}`, 6.5, MARGIN, y - 2, { color: MUTED });
      if (g > 0) this.page.ops.push(`0.92 0.93 0.94 RG 0.4 w ${left} ${y} m ${right} ${y} l S`);
    }
    let prev: { x: number; y: number } | null = null;
    points.forEach((p, i) => {
      const x = left + step * i;
      const y = bottom + (p.km / max) * h;
      if (prev) this.page.ops.push(`${GOLD} RG 1.4 w ${prev.x} ${prev.y} m ${x} ${y} l S`);
      this.page.ops.push(`${p.verified ? GREEN : RED} rg ${x - 2.5} ${y - 2.5} 5 5 re f`);
      prev = { x, y };
    });
    this.textAt("km", 7, MARGIN, top + 6, { color: MUTED });
    this.y = bottom - 24;
  }

  qr(value: string, x: number, y: number, size: number) {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const quiet = 2;
    const cell = size / (n + quiet * 2);
    this.page.ops.push(`1 1 1 rg ${x} ${y} ${size} ${size} re f`);
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (!qr.modules.data[row * n + col]) continue;
        const px = x + (col + quiet) * cell;
        const py = y + size - (row + quiet + 1) * cell;
        this.page.ops.push(`0.03 0.03 0.035 rg ${px.toFixed(2)} ${py.toFixed(2)} ${cell.toFixed(2)} ${cell.toFixed(2)} re f`);
      }
    }
  }

  addCover(opts: {
    title: string; vehicle: string; regNo: string; reportId: string;
    generatedAt: string; score: number; band: string; qrValue: string; verifyLabel: string;
  }) {
    const p = this.newPage(undefined, true);
    p.ops.push(`0.031 0.035 0.039 rg 0 ${PAGE_H - 300} ${PAGE_W} 300 re f`);
    p.ops.push(`${GOLD} rg 0 ${PAGE_H - 300} ${PAGE_W} 3 re f`);
    this.textAt("TRUSTDRIVE", 26, MARGIN, PAGE_H - 96, { bold: true, color: "1 1 1" });
    this.textAt("VERIFIED VEHICLE RECORDS", 8, MARGIN, PAGE_H - 112, { color: GOLD });
    this.textAt(opts.title, 22, MARGIN, PAGE_H - 176, { bold: true, color: "1 1 1" });
    this.textAt(opts.vehicle, 13, MARGIN, PAGE_H - 198, { color: "0.8 0.82 0.84" });
    this.textAt(`${opts.regNo}  |  ${opts.reportId}`, 9, MARGIN, PAGE_H - 216, { color: "0.6 0.63 0.66" });

    p.ops.push(`0.07 0.075 0.08 rg ${MARGIN} ${PAGE_H - 292} 240 56 re f`);
    p.ops.push(`${GOLD} rg ${MARGIN} ${PAGE_H - 292} 3 56 re f`);
    this.textAt(String(opts.score), 30, MARGIN + 16, PAGE_H - 274, { bold: true, color: "1 1 1" });
    this.textAt("/100 TRUST SCORE", 7, MARGIN + 82, PAGE_H - 264, { color: "0.7 0.72 0.74" });
    this.textAt(opts.band.toUpperCase(), 9, MARGIN + 82, PAGE_H - 278, { bold: true, color: GOLD });

    p.ops.push(`1 1 1 rg ${PAGE_W - MARGIN - 132} ${PAGE_H - 300} 132 132 re f`);
    this.qr(opts.qrValue, PAGE_W - MARGIN - 124, PAGE_H - 292, 116);
    this.textAt(opts.verifyLabel, 6.5, PAGE_W - MARGIN - 132, PAGE_H - 312, { color: "0.85 0.86 0.87" });

    this.page = p;
    this.y = PAGE_H - 380;
    this.text("What this document contains", 12, MARGIN, { bold: true });
    this.gap(2);
    this.text(
      "An evidence-led snapshot of the vehicle's documents, mileage, damage, theft and insurance checks, the deterministic trust score, and every limitation of the check. Findings are prompts to investigate - not proof of fraud, and not a guarantee.",
      9,
      MARGIN,
      { color: "0.25 0.28 0.31", lineGap: 4 }
    );
    this.gap(8);
    this.text(`Generated ${new Date(opts.generatedAt).toLocaleString("en-IN")}`, 8.5, MARGIN, { color: MUTED });
  }

  addToc(entries: { title: string; page: number }[]) {
    const p = this.newPage("Contents");
    this.page = p;
    this.y = PAGE_H - 96;
    this.text("CONTENTS", 18, MARGIN, { bold: true });
    this.rule(GOLD, 1);
    this.gap(10);
    entries.forEach((e, i) => {
      this.ensure(24);
      this.textAt(`${String(i + 1).padStart(2, "0")}`, 10, MARGIN, this.y, { bold: true, color: GOLD });
      this.textAt(e.title, 10, MARGIN + 30, this.y);
      const dots = ".".repeat(Math.max(3, 70 - e.title.length));
      this.textAt(dots, 8, MARGIN + 250, this.y, { color: "0.72 0.74 0.76" });
      this.textAt(String(e.page), 10, PAGE_W - MARGIN - 14, this.y, { bold: true });
      this.y -= 24;
    });
  }

  toBuffer(meta: DocMeta) {
    this.meta = meta;
    const total = this.pages.length;
    const objects: string[] = [];
    const pageObjStart = 5; // 1 catalog, 2 pages, 3 font, 4 font-bold
    const pageIds = this.pages.map((_, i) => pageObjStart + i * 2);

    objects.push("<< /Type /Catalog /Pages 2 0 R >>");
    objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${total} >>`);
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

    this.pages.forEach((pg, i) => {
      const headerOps: string[] = [];
      if (!pg.cover) {
        headerOps.push(`BT /F1 7.5 Tf ${MUTED} rg ${MARGIN} ${PAGE_H - 46} Td (${escapePdf(`${meta.reportId} - ${meta.title}`)}) Tj ET`);
        headerOps.push(`BT /F2 8 Tf ${GOLD} rg ${PAGE_W - MARGIN - 62} ${PAGE_H - 46} Td (TRUSTDRIVE) Tj ET`);
        headerOps.push(`${LINE} RG 0.5 w ${MARGIN} ${PAGE_H - 54} m ${PAGE_W - MARGIN} ${PAGE_H - 54} l S`);
      }
      headerOps.push(
        `BT /F1 7 Tf ${MUTED} rg ${MARGIN} 30 Td (${escapePdf(`${meta.reportId}  |  Page ${i + 1} of ${total}  |  ${meta.footerNote}`)}) Tj ET`
      );
      headerOps.push(`BT /F1 7 Tf ${MUTED} rg ${PAGE_W - MARGIN - 150} 30 Td (${escapePdf(`Integrity ${meta.integrity.slice(0, 16)}`)} - sha256) Tj ET`);
      const content = [...headerOps, ...pg.ops].join("\n");
      const pageId = pageIds[i];
      const contentId = pageId + 1;
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`
      );
      objects.push(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
    });

    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];
    objects.forEach((obj, i) => {
      offsets.push(Buffer.byteLength(pdf, "utf8"));
      pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return Buffer.from(pdf, "latin1");
  }
}

// ---- Public data shape -----------------------------------------------------
export interface ReportDocument {
  type: string;
  status: string;
  file_name: string;
  version?: number;
  consent?: boolean | number;
  sha256?: string;
  uploaded_at?: string;
  verified_at?: string | null;
  extracted?: Record<string, unknown> | string;
}

export interface ReportPdfData {
  reportId: string;
  type: string;
  generatedAt: string;
  snapshotHash: string;
  verifyUrl: string;
  vehicle: {
    make: string; model: string; year: number; regNo: string; vin: string; km: number;
    fuel: string; transmission: string; location: string; trustdriveId: string;
    category?: string; color?: string; ownership?: number; askingPrice?: number; condition?: string;
  };
  seller?: { name: string; type: string | null; businessName: string | null; verified: boolean } | null;
  trust: { trustScore: number; riskScore: number; bandLabel: string; evidenceCoverage: number; weights?: Record<string, number> };
  insights: { label: string; detail: string; status: string }[];
  findings: { code?: string; severity: string; title: string; explanation: string; recommendation: string; status: string; points?: number }[];
  pricing?: { low: number; estimate: number; high: number; confidence: string } | null;
  chain: { records: number; intact: boolean; lastHash?: string | null };
  documents: ReportDocument[];
  mileage?: { year: string; km: number; source: string; date: string; flagged: number | boolean; verified: number | boolean }[];
  damage?: { zone_id: string; description: string; severity: string; repair_status: string; inspection_date: string; status: string }[];
  history?: { category: string; event_date: string; mileage_km: number; title: string; description: string; source: string; status: string }[];
  theft?: { status: string; source: string; checked_at: string; details: string } | null;
}

function inr(n?: number | null) {
  if (n === undefined || n === null) return "-";
  return `INR ${n.toLocaleString("en-IN")}`;
}

function dateShort(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function extracted(doc: ReportDocument): Record<string, unknown> {
  if (!doc.extracted) return {};
  if (typeof doc.extracted === "string") {
    try {
      return JSON.parse(doc.extracted) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return doc.extracted;
}

/** Build the full 12-section A4 report. */
function legacyReportPdf(data: ReportPdfData): Buffer {
  const doc = new Pdf();
  const v = data.vehicle;
  const s = data.snapshotHash;

  doc.addCover({
    title: `TrustDrive ${data.type}`,
    vehicle: `${v.year} ${v.make} ${v.model}`,
    regNo: v.regNo,
    reportId: data.reportId,
    generatedAt: data.generatedAt,
    score: data.trust.trustScore,
    band: data.trust.bandLabel,
    qrValue: data.verifyUrl,
    verifyLabel: "Scan to verify this report",
  });

  const sections: { title: string; render: () => void }[] = [];
  const sectionStart: number[] = [];

  const begin = (title: string, i: number) => {
    doc.section(title, i);
    sectionStart.push(doc.pages.length - 1);
  };

  sections.push({
    title: "Vehicle details",
    render: () => {
      begin("Vehicle details", 1);
      doc.kv([
        ["Make and model", `${v.year} ${v.make} ${v.model}`],
        ["Registration", v.regNo],
        ["VIN", v.vin],
        ["TrustDrive ID", v.trustdriveId],
        ["Category / colour", `${v.category ?? "-"} / ${v.color ?? "-"}`],
        ["Fuel / transmission", `${v.fuel} / ${v.transmission}`],
        ["Odometer", `${v.km.toLocaleString("en-IN")} km (claimed)`],
        ["Owners", String(v.ownership ?? "-")],
        ["Location", v.location],
        ["Condition (seller)", v.condition ?? "-"],
        ["Asking price", inr(v.askingPrice)],
        ["Seller", data.seller ? `${data.seller.businessName || data.seller.name} (${data.seller.verified ? "KYC verified" : "KYC not verified"})` : "Not disclosed"],
      ]);
      doc.gap(6);
      doc.text(
        "Vehicle identity fields are taken from the seller record and cross-checked against uploaded documents where available. A mismatch appears in the risk section and is never silently corrected.",
        8,
        MARGIN,
        { color: MUTED, lineGap: 3 }
      );
    },
  });

  sections.push({
    title: "Trust score and methodology",
    render: () => {
      begin("Trust score and methodology", 2);
      doc.text(`${data.trust.trustScore}/100 - ${data.trust.bandLabel}`, 24, MARGIN, { bold: true });
      doc.gap(2);
      doc.text(`Risk points: ${data.trust.riskScore}/100   Evidence coverage: ${data.trust.evidenceCoverage}%`, 10, MARGIN, { color: MUTED });
      doc.gap(12);
      doc.text(
        "The score is deterministic: evidence coverage builds the base, and severity-weighted findings subtract points. Identical data always produces the identical score. AI never sets the score; it only explains it.",
        9,
        MARGIN,
        { lineGap: 4 }
      );
      doc.gap(8);
      doc.text("Document weights (coverage)", 10, MARGIN, { bold: true });
      doc.gap(2);
      const weights = data.trust.weights ?? { rc: 30, insurance: 8, puc: 22, service: 20, ownership: 10, inspection: 10 };
      doc.table(
        ["Document", "Weight", "Verified"],
        Object.entries(weights).map(([key, weight]) => {
          const d = data.documents.find((x) => x.type === key);
          return [key.toUpperCase(), `${weight} pts`, d?.status ?? "missing"];
        }),
        [220, 120, 160]
      );
      doc.text("Trust bands", 10, MARGIN, { bold: true });
      doc.gap(2);
      doc.table(
        ["Band", "Range", "Interpretation"],
        [
          ["Strong", "85-100", "Evidence is broad and current; few open questions."],
          ["Moderate", "65-84", "Usable record with gaps worth checking."],
          ["Caution", "40-64", "Material gaps or medium findings. Inspect first."],
          ["High risk", "0-39", "Critical findings or thin evidence. Treat with care."],
        ],
        [100, 100, 300]
      );
    },
  });

  sections.push({
    title: "Document verification",
    render: () => {
      begin("Document verification", 3);
      const rows = data.documents.map((d) => [
        d.type.toUpperCase(),
        d.status,
        d.file_name,
        `v${d.version ?? 1}`,
        d.consent ? "shared" : "private",
        dateShort(d.uploaded_at),
        d.sha256 ? d.sha256.slice(0, 10) : "-",
      ]);
      if (!rows.length) doc.text("No documents uploaded.", 9, MARGIN, { color: MUTED });
      else doc.table(["Type", "Status", "File", "Ver", "Consent", "Uploaded", "SHA-256"], rows, [58, 70, 145, 32, 55, 70, 70]);
      doc.gap(4);
      doc.text(
        "Verified documents are immutable. A correction creates a new version linked to the old one; the previous version stays in the hash chain. Document statuses mean: verified (checks passed), pending (queued or needs information), suspicious (a conflict needs investigation), unavailable (not supplied).",
        8,
        MARGIN,
        { color: MUTED, lineGap: 3 }
      );
    },
  });

  sections.push({
    title: "Mileage history",
    render: () => {
      begin("Mileage history", 4);
      const readings = data.mileage ?? [];
      doc.mileageChart(readings.map((m) => ({ km: m.km, verified: !!m.verified })));
      doc.table(
        ["Year", "Date", "Odometer", "Source", "State"],
        readings.map((m) => [
          m.year,
          dateShort(m.date),
          `${m.km.toLocaleString("en-IN")} km`,
          m.source,
          m.flagged ? "flagged" : m.verified ? "verified" : "unverified",
        ]),
        [60, 110, 120, 170, 100],
        ["left", "left", "right", "left", "left"]
      );
      doc.text(
        "A rollback is flagged when a later reading is materially lower than an earlier one. A jump is flagged against the vehicle's own median annual rate, not a generic average. Seller-submitted readings are marked unverified until evidence supports them.",
        8,
        MARGIN,
        { color: MUTED, lineGap: 3 }
      );
    },
  });

  sections.push({
    title: "Accident records",
    render: () => {
      begin("Accident records", 5);
      const accidentRows = (data.damage ?? []).filter((d) =>
        /accident|impact|collision|bumper|door|panel|bonnet|repair/i.test(`${d.description} ${d.zone_id}`)
      );
      if (!accidentRows.length) doc.text("No accident or structural repair record was found in the available sources.", 9, MARGIN);
      else
        doc.table(
          ["Date", "Zone", "Description", "Severity", "Repair"],
          accidentRows.map((d) => [d.inspection_date, d.zone_id, d.description, d.severity, d.repair_status]),
          [80, 80, 250, 70, 80]
        );
      doc.gap(4);
      doc.text(
        "Accident visibility is limited to records the seller supplied or that were found in supported sources. Absence of a record is not proof of an accident-free history.",
        8,
        MARGIN,
        { color: MUTED, lineGap: 3 }
      );
    },
  });

  sections.push({
    title: "Damage inspection",
    render: () => {
      begin("Damage inspection", 6);
      const damage = data.damage ?? [];
      if (!damage.length) doc.text("No damage records submitted.", 9, MARGIN);
      else
        doc.table(
          ["Date", "Zone", "Severity", "Repair", "Status"],
          damage.map((d) => [d.inspection_date, d.zone_id, d.severity, d.repair_status, d.status]),
          [90, 110, 90, 110, 100]
        );
      doc.gap(4);
      doc.text("Damage records are seller disclosures reviewed against invoices and inspection evidence where present.", 8, MARGIN, { color: MUTED });
    },
  });

  sections.push({
    title: "Theft status",
    render: () => {
      begin("Theft status", 7);
      const t = data.theft;
      if (!t) {
        doc.text("No theft check is available for this vehicle.", 9, MARGIN);
      } else {
        doc.kv([
          ["Result", t.status === "no_record" ? "No record found" : t.status === "unavailable" ? "Check unavailable" : t.status],
          ["Source", t.source],
          ["Checked at", dateShort(t.checked_at)],
          ["Details", t.details],
        ]);
      }
      doc.gap(6);
      doc.text(
        "A 'no record' result is exactly that: no matching record in the supported registry adapter. It does not guarantee the vehicle has never been reported stolen, and an unavailable adapter is shown as a gap rather than a pass.",
        8,
        MARGIN,
        { color: MUTED, lineGap: 3 }
      );
    },
  });

  sections.push({
    title: "Insurance",
    render: () => {
      begin("Insurance", 8);
      const insurance = data.documents.find((d) => d.type === "insurance");
      if (!insurance) {
        doc.text("No insurance document was supplied.", 9, MARGIN, { color: MUTED });
      } else {
        const ex = extracted(insurance);
        doc.kv([
          ["Policy document", insurance.file_name],
          ["Verification status", insurance.status],
          ["Insurer", String(ex.insurer ?? "-")],
          ["Policy number", String(ex.policyNo ?? "-")],
          ["Valid to", String(ex.validTo ?? "-")],
          ["IDV", ex.idv ? inr(Number(ex.idv)) : "-"],
          ["Uploaded", dateShort(insurance.uploaded_at)],
        ]);
      }
      doc.gap(6);
      doc.text(
        "Insurance validity is read from the policy text. A policy expiring soon is raised as a low-severity finding; expiry is never hidden.",
        8,
        MARGIN,
        { color: MUTED, lineGap: 3 }
      );
    },
  });

  sections.push({
    title: "AI risk analysis",
    render: () => {
      begin("AI risk analysis", 9);
      doc.text(
        "Findings are generated by deterministic rules, ordered by severity. Any natural-language explanation is grounded in the evidence shown and must repeat the numbers exactly.",
        9,
        MARGIN,
        { lineGap: 4 }
      );
      doc.gap(6);
      if (!data.findings.length) {
        doc.text("No open findings in the available sources.", 9, MARGIN, { color: GREEN, bold: true });
      } else {
        for (const f of data.findings) {
          doc.ensure(60);
          const color = f.severity === "critical" ? RED : f.severity === "high" ? "0.75 0.3 0.2" : f.severity === "medium" ? AMBER : GOLD;
          doc.chip(f.severity, color);
          doc.text(f.title, 10, MARGIN, { bold: true });
          doc.text(`Rule ${f.code ?? "-"}  |  ${f.points ?? 0} risk points  |  ${f.status}`, 7.5, MARGIN, { color: MUTED });
          doc.gap(2);
          doc.text(f.explanation, 9, MARGIN, { lineGap: 3 });
          doc.text(`Recommended: ${f.recommendation}`, 8.5, MARGIN, { color: "0.2 0.28 0.35", lineGap: 3 });
          doc.gap(8);
        }
      }
      doc.rule();
      doc.text("Key insights", 10, MARGIN, { bold: true });
      doc.gap(2);
      for (const i of data.insights) doc.text(`- ${i.label}: ${i.detail} [${i.status}]`, 8.5, MARGIN, { lineGap: 3 });
    },
  });

  sections.push({
    title: "Blockchain hash verification",
    render: () => {
      begin("Blockchain hash verification", 10);
      doc.chip(data.chain.intact ? "chain intact" : "integrity mismatch", data.chain.intact ? GREEN : RED);
      doc.gap(4);
      doc.kv([
        ["Records chained", String(data.chain.records)],
        ["Verification", data.chain.intact ? "Every record links to its predecessor." : "At least one record does not match its stored hash."],
        ["Latest record hash", data.chain.lastHash ?? "-"],
      ]);
      doc.gap(6);
      doc.text(
        "Each record hashes its canonical JSON together with the previous record's hash (SHA-256). Editing a past record breaks every later link. This is tamper-evident, not tamper-proof: it proves the record you hold matches the record that was written.",
        8,
        MARGIN,
        { color: MUTED, lineGap: 3 }
      );
    },
  });

  sections.push({
    title: "Evidence and sources",
    render: () => {
      begin("Evidence and sources", 11);
      const rows = data.documents.map((d, i) => [
        `S${i + 1}`,
        d.type.toUpperCase(),
        d.file_name,
        dateShort(d.uploaded_at),
        d.sha256 ? d.sha256.slice(0, 16) : "-",
        d.status,
      ]);
      if (!rows.length) doc.text("No evidence documents were attached.", 9, MARGIN, { color: MUTED });
      else doc.table(["Ref", "Type", "Source file", "Uploaded", "SHA-256 (short)", "Tier"], rows, [38, 60, 170, 80, 120, 70]);
      doc.gap(4);
      doc.text("Every factual statement in this report traces to one of the sources above or to a seller disclosure marked as unverified.", 8, MARGIN, { color: MUTED });
    },
  });

  sections.push({
    title: "Limitations and unavailable records",
    render: () => {
      begin("Limitations and unavailable records", 12);
      const missing = data.documents.filter((d) => d.status !== "verified").map((d) => `${d.type}: ${d.status}`);
      const unavailableMileage = (data.mileage ?? []).filter((m) => m.flagged).length;
      doc.text("What was not checked, or not fully verified", 10, MARGIN, { bold: true });
      doc.gap(2);
      const limits = [
        "Theft status depends on the supported registry adapter. 'No record' is not a national guarantee.",
        "Accident and damage history is limited to disclosed records and supported sources.",
        "Odometer readings are verified only where a document supports them; seller claims are marked unverified.",
        "Document authenticity checks detect internal inconsistencies, not forged physical paper.",
        missing.length ? `Unverified or missing documents: ${missing.join(", ")}.` : "All supplied documents are verified.",
        unavailableMileage ? `${unavailableMileage} mileage reading(s) are flagged and need evidence.` : "No mileage readings are flagged.",
        "This report is informational. It is not a valuation, a guarantee, or a legal opinion.",
      ];
      limits.forEach((l, i) => doc.text(`${i + 1}. ${l}`, 8.5, MARGIN, { lineGap: 3 }));
      doc.gap(8);
      doc.text("Methodology", 10, MARGIN, { bold: true });
      doc.gap(2);
      doc.text(
        "Rules v1.0 - deterministic trust engine. Coverage weights: RC 30, PUC 22, service 20, ownership 10, inspection 10, insurance 8. Severity points: critical 40, high 25-30, medium 8-12, low 5-8. Bands: Strong 85+, Moderate 65-84, Caution 40-64, High risk below 40.",
        8.5,
        MARGIN,
        { lineGap: 3 }
      );
      doc.gap(8);
      doc.text("Report integrity", 10, MARGIN, { bold: true });
      doc.gap(2);
      doc.kv([
        ["Snapshot SHA-256", s],
        ["Report ID", data.reportId],
        ["Generated at", new Date(data.generatedAt).toLocaleString("en-IN")],
      ]);
      if (data.pricing) {
        doc.gap(4);
        doc.text(
          `Market estimate: ${inr(data.pricing.low)} - ${inr(data.pricing.high)} (suggested ${inr(data.pricing.estimate)}, ${data.pricing.confidence} confidence). An estimate, not a valuation.`,
          8.5,
          MARGIN,
          { lineGap: 3 }
        );
      }
    },
  });

  for (const section of sections) section.render();

  doc.addToc(
    sections.map((s, i) => ({
      title: s.title,
      page: sectionStart[i] + 2,
    }))
  );
  const cover = doc.pages[0];
  const toc = doc.pages[doc.pages.length - 1];
  doc.pages = [cover, toc, ...doc.pages.slice(1, -1)];

  return doc.toBuffer({
    reportId: data.reportId,
    footerNote: "Informational report - not a guarantee or legal opinion",
    title: data.type,
    subtitle: `${v.make} ${v.model}`,
    integrity: s,
  });
}

// ---------------------------------------------------------------------------
// Letter-format report helpers
// ---------------------------------------------------------------------------
function approxWidth(text: string, size: number, bold = false) {
  return text.length * size * (bold ? 0.54 : 0.5);
}

function centerText(
  doc: Pdf,
  text: string,
  size: number,
  cx: number,
  y: number,
  opts: { bold?: boolean; color?: string } = {}
) {
  doc.textAt(text, size, cx - approxWidth(text, size, opts.bold) / 2, y, opts);
}

function rightText(
  doc: Pdf,
  text: string,
  size: number,
  right: number,
  y: number,
  opts: { bold?: boolean; color?: string } = {}
) {
  doc.textAt(text, size, right - approxWidth(text, size, opts.bold), y, opts);
}

function bandTone(score: number) {
  if (score >= 85) return GREEN;
  if (score >= 65) return "0.72 0.45 0.10";
  return RED;
}

function clause(doc: Pdf, n: number, title: string) {
  doc.ensure(50);
  doc.gap(8);
  doc.text(`${String(n).padStart(2, "0")}  ${title.toUpperCase()}`, 10.5, MARGIN, { bold: true });
  doc.rule(GOLD, 0.7);
  doc.gap(1);
}

function circleStroke(cx: number, cy: number, r: number) {
  const k = 0.5523 * r;
  return `${cx + r} ${cy} m ${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r} c ${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy} c ${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r} c ${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy} c S`;
}

/** Circular verification seal drawn as vector art (double ring + lettering). */
function drawSeal(doc: Pdf, cx: number, cy: number, r: number) {
  doc.page.ops.push(`${GOLD} RG 1.4 w ${circleStroke(cx, cy, r)}`);
  doc.page.ops.push(`${GOLD} RG 0.5 w ${circleStroke(cx, cy, r - 5)}`);
  centerText(doc, "TRUSTDRIVE", 6.2, cx, cy + 11, { bold: true, color: GOLD });
  centerText(doc, "VERIFIED", 6.4, cx, cy + 2, { bold: true, color: GOLD });
  centerText(doc, "AUTHORITY", 5.2, cx, cy - 7, { bold: true, color: GOLD });
  centerText(doc, "RECORDS", 4.2, cx, cy - 15, { color: MUTED });
  doc.page.ops.push(`${GOLD} rg ${cx - 16} ${cy + 22} 3 3 re f`);
  doc.page.ops.push(`${GOLD} rg ${cx + 13} ${cy + 22} 3 3 re f`);
}

/** Cursive attestation mark - a drawn signature, not a scanned autograph. */
function drawSignature(doc: Pdf, x: number, y: number) {
  const ops = doc.page.ops;
  ops.push(
    `${INK} RG 1.2 w ${x} ${y} m ${x + 14} ${y + 26} ${x + 26} ${y - 2} ${x + 40} ${y + 16} c ${x + 52} ${y + 30} ${x + 56} ${y - 8} ${x + 72} ${y + 8} c ${x + 86} ${y + 22} ${x + 92} ${y + 4} ${x + 108} ${y + 12} c S`
  );
  ops.push(`${INK} RG 0.8 w ${x - 2} ${y - 6} m ${x + 36} ${y - 12} ${x + 78} ${y - 2} ${x + 122} ${y - 10} c S`);
  ops.push(`${INK} RG 0.9 w ${x + 22} ${y - 2} m ${x + 62} ${y + 26} ${x + 54} ${y + 2} ${x + 84} ${y + 18} c S`);
}

function letterhead(doc: Pdf, reportId: string, dateStr: string, timeStr: string, type: string) {
  doc.page.ops.push(`${INK} rg 0 ${PAGE_H - 8} ${PAGE_W} 8 re f`);
  doc.page.ops.push(`${GOLD} rg 0 ${PAGE_H - 11} ${PAGE_W} 3 re f`);
  doc.textAt("TRUSTDRIVE", 22, MARGIN, PAGE_H - 58, { bold: true });
  doc.textAt("VEHICLE VERIFICATION AUTHORITY", 6.8, MARGIN, PAGE_H - 70, { color: GOLD });
  doc.textAt("TrustDrive Verification Services", 8, MARGIN, PAGE_H - 88, { color: "0.25 0.28 0.31" });
  doc.textAt("Level 14, Platina Tower, Bandra Kurla Complex, Mumbai 400051, India", 7.2, MARGIN, PAGE_H - 99, { color: MUTED });
  doc.textAt("mumbai.ops@trustdrive.dev  -  +91 (022) 8000-8787  -  trustdrive.dev", 7.2, MARGIN, PAGE_H - 110, { color: MUTED });
  rightText(doc, `Ref: ${reportId}`, 8.5, PAGE_W - MARGIN, PAGE_H - 58, { bold: true });
  rightText(doc, `Date: ${dateStr}`, 8, PAGE_W - MARGIN, PAGE_H - 72, { color: "0.25 0.28 0.31" });
  rightText(doc, `Issued: ${timeStr} IST`, 7.5, PAGE_W - MARGIN, PAGE_H - 84, { color: MUTED });
  rightText(doc, `Type: ${type}`, 7.5, PAGE_W - MARGIN, PAGE_H - 96, { color: MUTED });
  doc.page.ops.push(`${GOLD} RG 1 w ${MARGIN} ${PAGE_H - 124} m ${PAGE_W - MARGIN} ${PAGE_H - 124} l S`);
  doc.y = PAGE_H - 150;
}

/** Build the report as a formal, signed verification letter. */
export function reportPdf(data: ReportPdfData): Buffer {
  const doc = new Pdf();
  // Page 1 carries its own letterhead, so suppress the running header there.
  doc.pages[0].cover = true;
  const v = data.vehicle;
  const generated = new Date(data.generatedAt);
  const dateStr = generated.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const timeStr = generated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const verifiedDocs = data.documents.filter((d) => d.status === "verified").length;
  const openFindings = data.findings.filter((f) => !["cleared", "resolved", "explained"].includes(f.status));
  const tone = bandTone(data.trust.trustScore);

  letterhead(doc, data.reportId, dateStr, timeStr, data.type);

  doc.text("To,", 9, MARGIN);
  doc.text("The Prospective Buyer / Financier / Insurer", 9.5, MARGIN, { bold: true });
  doc.gap(4);
  doc.text(`Subject: ${data.type} - ${v.year} ${v.make} ${v.model} (${v.regNo})`, 10, MARGIN, { bold: true, lineGap: 4 });
  doc.text(`Reference ${data.reportId}   |   TrustDrive ID ${v.trustdriveId}   |   VIN ${v.vin}`, 7.8, MARGIN, { color: MUTED });
  doc.gap(4);
  doc.text("Dear Sir / Madam,", 9, MARGIN);
  doc.gap(2);
  doc.text(
    `This report sets out the results of a documentary verification of the above vehicle, carried out by TrustDrive Verification Authority on ${dateStr}. It records the evidence examined, the checks completed, the findings that remain open, and the limits of those checks. The trust score is deterministic: the same records always produce the same score, and no language model sets it.`,
    9,
    MARGIN,
    { lineGap: 4 }
  );
  doc.gap(6);

  // Summary panel
  doc.ensure(96);
  const panelTop = doc.y;
  doc.page.ops.push(`0.973 0.965 0.949 rg ${MARGIN} ${panelTop - 78} ${CONTENT_W} 78 re f`);
  doc.page.ops.push(`${GOLD} rg ${MARGIN} ${panelTop - 78} 3 78 re f`);
  doc.textAt("TRUST SCORE", 6.6, MARGIN + 14, panelTop - 14, { color: MUTED });
  doc.textAt(String(data.trust.trustScore), 28, MARGIN + 14, panelTop - 48, { bold: true, color: tone });
  doc.textAt(
    "/100",
    7.5,
    MARGIN + 16 + approxWidth(String(data.trust.trustScore), 28, true),
    panelTop - 48,
    { color: MUTED }
  );
  doc.textAt(data.trust.bandLabel.toUpperCase(), 7.2, MARGIN + 14, panelTop - 62, { bold: true, color: tone });
  const summary: [string, string][] = [
    ["RISK SCORE", `${data.trust.riskScore}/100`],
    ["EVIDENCE COVERAGE", `${data.trust.evidenceCoverage}%`],
    ["DOCUMENTS VERIFIED", `${verifiedDocs} of ${data.documents.length}`],
    ["OPEN FINDINGS", String(openFindings.length)],
    ["REPORT TYPE", data.type],
    ["GENERATED", dateStr],
  ];
  summary.forEach(([label, value], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = MARGIN + 168 + col * 112;
    const y = panelTop - 20 - row * 30;
    doc.textAt(label, 6, x, y, { color: MUTED });
    doc.textAt(value, 7.8, x, y - 11, { bold: true });
  });
  doc.y = panelTop - 92;

  // 01 - Purpose and scope
  clause(doc, 1, "Purpose and scope");
  doc.text(
    "TrustDrive examined the documents supplied for this vehicle, the odometer readings on record, damage and accident disclosures, the recorded event history, and the supported theft and insurance checks. Each statement below is tied to a stored record or is explicitly labelled as a seller disclosure. Absence of a record is reported as unverified coverage, never as proof that nothing happened.",
    8.8,
    MARGIN,
    { lineGap: 3.5 }
  );
  doc.gap(4);
  doc.text(
    "This letter is informational. It is not a guarantee of mechanical condition, a valuation, or a legal opinion, and it does not replace a physical inspection.",
    8.2,
    MARGIN,
    { color: MUTED, lineGap: 3 }
  );

  // 02 - Vehicle particulars
  clause(doc, 2, "Vehicle particulars");
  doc.kv([
    ["Make, model and year", `${v.year} ${v.make} ${v.model}`],
    ["Registration number", v.regNo],
    ["VIN", v.vin],
    ["TrustDrive ID", v.trustdriveId],
    ["Category / colour", `${v.category ?? "-"} / ${v.color ?? "-"}`],
    ["Fuel / transmission", `${v.fuel} / ${v.transmission}`],
    ["Odometer (claimed)", `${v.km.toLocaleString("en-IN")} km`],
    ["Ownership count", String(v.ownership ?? "-")],
    ["Location", v.location],
    ["Condition (seller)", v.condition ?? "-"],
    ["Asking price", inr(v.askingPrice)],
    [
      "Seller",
      data.seller
        ? `${data.seller.businessName || data.seller.name} (${data.seller.verified ? "KYC verified" : "KYC not verified"})`
        : "Not disclosed",
    ],
  ]);

  // 03 - Verification summary
  clause(doc, 3, "Verification summary");
  doc.text(
    `The vehicle scores ${data.trust.trustScore}/100 (${data.trust.bandLabel}) with ${data.trust.evidenceCoverage}% evidence coverage and ${data.trust.riskScore} risk points. ${verifiedDocs} of ${data.documents.length} supplied documents are verified.`,
    9,
    MARGIN,
    { lineGap: 3.5 }
  );
  doc.gap(4);
  if (data.insights.length) {
    doc.table(
      ["Check", "Status", "Observation"],
      data.insights.map((i) => [i.label, i.status, i.detail]),
      [118, 78, 290]
    );
  }
  doc.text(
    "Trust bands: Strong 85-100, Moderate 65-84, Caution 40-64, High risk below 40. The band is a summary of evidence coverage and open findings, not a prediction of reliability.",
    7.6,
    MARGIN,
    { color: MUTED, lineGap: 2.5 }
  );

  // 04 - Documents examined
  clause(doc, 4, "Documents examined");
  if (!data.documents.length) {
    doc.text("No documents were on file for this vehicle at the time of issue.", 9, MARGIN, { color: MUTED });
  } else {
    doc.table(
      ["Type", "File", "Ver", "Status", "Consent", "Uploaded"],
      data.documents.map((d) => [
        d.type.toUpperCase(),
        d.file_name,
        `v${d.version ?? 1}`,
        d.status,
        d.consent ? "shared" : "private",
        dateShort(d.uploaded_at),
      ]),
      [58, 196, 30, 66, 56, 78]
    );
    doc.text(
      "Verified documents are immutable: a correction is stored as a new version linked to the previous one, and the earlier version remains in the audit chain. Full SHA-256 digests are printed in Annexure A.",
      7.8,
      MARGIN,
      { color: MUTED, lineGap: 2.5 }
    );
  }

  // 05 - Odometer and mileage
  clause(doc, 5, "Odometer and mileage");
  const readings = data.mileage ?? [];
  if (!readings.length) {
    doc.text("No odometer readings are on record.", 9, MARGIN, { color: MUTED });
  } else {
    doc.mileageChart(readings.map((m) => ({ km: m.km, verified: !!m.verified })));
    doc.table(
      ["Year", "Date", "Odometer", "Source", "State"],
      readings.map((m) => [
        m.year,
        dateShort(m.date),
        `${m.km.toLocaleString("en-IN")} km`,
        m.source,
        m.flagged ? "flagged" : m.verified ? "verified" : "unverified",
      ]),
      [58, 104, 116, 176, 96],
      ["left", "left", "right", "left", "left"]
    );
    doc.text(
      "A rollback is flagged when a later reading is materially lower than an earlier one. A jump is judged against the vehicle's own recorded rate, not a generic average. Seller-submitted readings stay unverified until a document supports them.",
      7.8,
      MARGIN,
      { color: MUTED, lineGap: 2.5 }
    );
  }

  // 06 - Damage and accident disclosures
  clause(doc, 6, "Damage and accident disclosures");
  const damage = data.damage ?? [];
  if (!damage.length) {
    doc.text("No damage records were disclosed or found in supported sources. This is not proof of an accident-free history.", 9, MARGIN, { lineGap: 3 });
  } else {
    damage.forEach((d) => {
      doc.ensure(38);
      doc.text(
        `${(d.zone_id || "detected_damage").replace(/_/g, " ")} - ${d.severity || "unassessed"} - ${d.repair_status || "Not repaired"}`,
        8.8,
        MARGIN,
        { bold: true }
      );
      doc.text(`${d.inspection_date || "Date not stated"}  |  status ${d.status}`, 7, MARGIN, { color: MUTED });
      doc.text(d.description || "Damage disclosure record.", 8.4, MARGIN, { lineGap: 2.5 });
      doc.gap(3);
    });
    doc.text(
      "Damage visibility is limited to seller disclosures and records found in supported sources. New entries remain pending until reviewed.",
      7.8,
      MARGIN,
      { color: MUTED, lineGap: 2.5 }
    );
  }

  // 07 - Recorded history
  clause(doc, 7, "Recorded event history");
  const history = data.history ?? [];
  if (!history.length) {
    doc.text("No event history is on record.", 9, MARGIN, { color: MUTED });
  } else {
    doc.table(
      ["Date", "Event", "Odometer", "Source", "Status"],
      history.map((h) => [
        dateShort(h.event_date),
        h.title,
        h.mileage_km ? `${h.mileage_km.toLocaleString("en-IN")} km` : "-",
        h.source,
        h.status,
      ]),
      [66, 190, 80, 90, 74]
    );
  }

  // 08 - Theft and insurance
  clause(doc, 8, "Theft and insurance status");
  const theft = data.theft;
  if (!theft) {
    doc.text("No theft check is available for this vehicle.", 9, MARGIN, { color: AMBER });
  } else {
    const theftLabel =
      theft.status === "no_record"
        ? "No record found in supported sources"
        : theft.status === "unavailable"
        ? "Check unavailable - treated as a gap, not a pass"
        : theft.status;
    doc.kv([
      ["Theft result", theftLabel],
      ["Source", theft.source],
      ["Checked at", dateShort(theft.checked_at)],
      ["Details", theft.details],
    ]);
  }
  const insurance = data.documents.find((d) => d.type === "insurance");
  if (insurance) {
    const ex = extracted(insurance);
    doc.kv([
      ["Insurance document", `${insurance.file_name} (${insurance.status})`],
      ["Insurer", String(ex.insurer ?? "-")],
      ["Policy number", String(ex.policyNo ?? "-")],
      ["Valid to", String(ex.validTo ?? "-")],
      ["IDV", ex.idv ? inr(Number(ex.idv)) : "-"],
    ]);
  } else {
    doc.text("No insurance document was supplied.", 8.6, MARGIN, { color: MUTED });
  }
  doc.text(
    "A 'no record' theft result is exactly that: no match in the supported adapter. It is not a national guarantee, and an unavailable adapter is disclosed rather than treated as clean.",
    7.8,
    MARGIN,
    { color: MUTED, lineGap: 2.5 }
  );

  // 09 - Findings
  clause(doc, 9, "Findings and required actions");
  doc.text(
    "Findings are produced by versioned deterministic rules. An explained finding has been answered by evidence and is excluded from the open count; it is still disclosed here in full.",
    8.6,
    MARGIN,
    { lineGap: 3 }
  );
  doc.gap(4);
  if (!data.findings.length) {
    doc.text("No findings were raised from the available sources.", 9, MARGIN, { bold: true, color: GREEN });
  } else {
    data.findings.forEach((f) => {
      doc.ensure(72);
      const color =
        f.severity === "critical" ? RED : f.severity === "high" ? "0.72 0.27 0.18" : f.severity === "medium" ? AMBER : GOLD;
      doc.chip(`${f.severity}  |  ${f.status.replace(/_/g, " ")}`, color);
      doc.text(f.title, 9.5, MARGIN, { bold: true });
      doc.text(`Rule ${f.code ?? "-"}  |  ${f.points ?? 0} risk points  |  severity ${f.severity}`, 7, MARGIN, { color: MUTED });
      doc.gap(1);
      doc.text(f.explanation, 8.4, MARGIN, { lineGap: 2.5 });
      doc.text(`Recommended action: ${f.recommendation}`, 8, MARGIN, { color: "0.2 0.28 0.35", lineGap: 2.5 });
      doc.gap(6);
    });
  }

  // 10 - Integrity
  clause(doc, 10, "Record integrity and hash chain");
  doc.chip(data.chain.intact ? "Chain intact" : "Integrity mismatch", data.chain.intact ? GREEN : RED);
  doc.gap(2);
  doc.kv([
    ["Records chained", String(data.chain.records)],
    ["Chain verification", data.chain.intact ? "Every record links to its predecessor." : "At least one record does not match its stored hash."],
    ["Latest record hash", data.chain.lastHash ?? "-"],
    ["Snapshot SHA-256", data.snapshotHash],
  ]);
  doc.text(
    "Each record hashes its canonical JSON together with the previous record's hash. This is tamper-evident, not tamper-proof: it proves the records you hold match the records that were written. A matching hash proves file integrity, not document authenticity.",
    7.8,
    MARGIN,
    { color: MUTED, lineGap: 2.5 }
  );

  // 11 - Market estimate
  clause(doc, 11, "Market estimate");
  if (data.pricing) {
    doc.kv([
      ["Estimate range", `${inr(data.pricing.low)} - ${inr(data.pricing.high)}`],
      ["Suggested estimate", inr(data.pricing.estimate)],
      ["Confidence", data.pricing.confidence],
      ["Asking price", inr(v.askingPrice)],
    ]);
    doc.text("The estimate is derived from comparable listings. It is not a valuation and carries no warranty of price.", 7.8, MARGIN, { color: MUTED });
  } else {
    doc.text("No market estimate was prepared for this vehicle.", 9, MARGIN, { color: MUTED });
  }

  // 12 - Limitations
  clause(doc, 12, "Limitations and basis of issue");
  const missing = data.documents.filter((d) => d.status !== "verified").map((d) => `${d.type}: ${d.status}`);
  const flaggedMileage = (data.mileage ?? []).filter((m) => m.flagged).length;
  const limits = [
    "Theft status depends on the supported registry adapter. 'No record' is not a national guarantee.",
    "Accident and damage history is limited to disclosed records and supported sources.",
    "Odometer readings are verified only where a document supports them; seller claims stay unverified.",
    "Document checks detect internal inconsistencies, not forged physical paper.",
    missing.length ? `Unverified or missing documents: ${missing.join(", ")}.` : "All supplied documents are verified.",
    flaggedMileage ? `${flaggedMileage} mileage reading(s) are flagged and need evidence.` : "No mileage readings are flagged.",
    "This letter is informational. It is not a valuation, a guarantee, or a legal opinion.",
  ];
  limits.forEach((l, i) => doc.text(`${i + 1}. ${l}`, 8.2, MARGIN, { lineGap: 2.5 }));
  doc.gap(4);
  doc.text(
    "Method: rules v1.0, deterministic. Coverage weights: RC 30, PUC 22, service 20, ownership 10, inspection 10, insurance 8. Severity points: critical 40, high 25-30, medium 8-12, low 5-8. Bands: Strong 85+, Moderate 65-84, Caution 40-64, High risk below 40.",
    7.6,
    MARGIN,
    { color: MUTED, lineGap: 2.5 }
  );

  // 13 - Certification and signature: keep the heading, attestation and mark
  // together on a dedicated page so the signature is never orphaned.
  doc.newPage();
  doc.y = PAGE_H - 96;
  clause(doc, 13, "Certification and authorised signature");
  doc.text(
    "I certify that the records summarised in this letter were examined on the date of issue, that the findings and limitations stated are those produced by the deterministic rules engine, and that no check described as unavailable has been presented as complete.",
    8.8,
    MARGIN,
    { lineGap: 3 }
  );
  doc.gap(8);
  doc.ensure(190);
  const sigTop = doc.y - 8;
  drawSignature(doc, MARGIN, sigTop - 24);
  doc.page.ops.push(`${INK} RG 0.6 w ${MARGIN} ${sigTop - 38} m ${MARGIN + 176} ${sigTop - 38} l S`);
  doc.textAt("Authorised Signatory", 8.6, MARGIN, sigTop - 50, { bold: true });
  doc.textAt("TrustDrive Verification Authority", 7.4, MARGIN, sigTop - 61, { color: MUTED });
  doc.textAt(`Digitally issued ${dateStr} at ${timeStr} IST`, 7, MARGIN, sigTop - 71, { color: MUTED });
  drawSeal(doc, PAGE_W - MARGIN - 54, sigTop - 28, 40);
  doc.qr(data.verifyUrl, PAGE_W - MARGIN - 58, sigTop - 120, 58);
  centerText(doc, "SCAN TO VERIFY", 5.8, PAGE_W - MARGIN - 29, sigTop - 132, { bold: true, color: MUTED });
  doc.y = sigTop - 88;
  doc.text(
    "This certificate is issued electronically. The mark above is a system-generated attestation, not a handwritten signature; its authenticity rests on the QR verification link and the SHA-256 snapshot hash, not on the mark itself.",
    6.8,
    MARGIN,
    { color: MUTED, width: 340, lineGap: 2 }
  );

  // Annexure A - full evidence register
  doc.newPage("Annexure A");
  doc.y = PAGE_H - 96;
  doc.text("ANNEXURE A - EVIDENCE REGISTER", 12.5, MARGIN, { bold: true });
  doc.rule(GOLD, 1);
  doc.text(
    "Every document examined is listed with its stored digest. The digest is a SHA-256 of the stored bytes and can be recomputed from the original file.",
    7.8,
    MARGIN,
    { color: MUTED, lineGap: 2.5 }
  );
  doc.gap(6);
  if (!data.documents.length) {
    doc.text("No evidence documents were attached to this report.", 8.6, MARGIN, { color: MUTED });
  } else {
    data.documents.forEach((d, i) => {
      doc.ensure(44);
      doc.text(`${i + 1}. ${d.type.toUpperCase()} - ${d.file_name} (v${d.version ?? 1})`, 8.4, MARGIN, { bold: true });
      doc.text(
        `Status ${d.status}  |  consent ${d.consent ? "shared" : "private"}  |  uploaded ${dateShort(d.uploaded_at)}  |  verified ${dateShort(d.verified_at)}`,
        7,
        MARGIN,
        { color: MUTED }
      );
      doc.text(`SHA-256 ${d.sha256 ?? "-"}`, 7, MARGIN, { color: MUTED });
      doc.gap(5);
    });
  }
  doc.gap(8);
  doc.text(`- End of report ${data.reportId} -`, 7.6, MARGIN, { color: MUTED });

  return doc.toBuffer({
    reportId: data.reportId,
    footerNote: "Informational report - not a guarantee or legal opinion",
    title: "Vehicle Verification Report",
    subtitle: `${v.make} ${v.model}`,
    integrity: data.snapshotHash,
  });
}

/** Generic single-page writer retained for non-report exports. */
export interface PdfLine {
  text: string;
  size?: number;
  bold?: boolean;
  gap?: number;
}

export function buildPdf(title: string, subtitle: string, lines: PdfLine[]): Buffer {
  const doc = new Pdf();
  const p = doc.pages[0];
  p.cover = false;
  doc.y = PAGE_H - 64;
  doc.text(title, 20, MARGIN, { bold: true });
  if (subtitle) doc.text(subtitle, 10, MARGIN, { color: MUTED });
  doc.rule();
  for (const line of lines) {
    doc.text(line.text, line.size ?? 10, MARGIN, { bold: line.bold, lineGap: 5 });
    doc.gap(line.gap ?? 2);
  }
  return doc.toBuffer({
    reportId: "TRUSTDRIVE",
    footerNote: "Generated by TrustDrive - verification summary, not a guarantee.",
    title,
    subtitle,
    integrity: "0000000000000000",
  });
}
