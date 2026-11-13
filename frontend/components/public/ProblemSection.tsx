"use client";

import { useState } from "react";
import Image from "next/image";
import { Icon } from "@/components/ui/Icon";

export function ProblemSection() {
  const [activeRiskIndex, setActiveRiskIndex] = useState(0);

  const risks = [
    {
      number: "01",
      title: "Hidden Accident & Drop Damage",
      flag: "Crash Sensor Anomaly",
      severity: "Critical (35% Risk)",
      severityPercent: 92,
      severityColor: "text-[#D95757]",
      barColor: "bg-[#D95757]",
      zone: "Front Crumple Zone & Sub-Frame",
      hotspotCoords: { top: "54%", left: "24%" },
      evidenceImage:
        "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=800&q=80",
      description:
        "Cosmetic paint blending and fiberglass filler frequently mask structural crumple zone welds and bent motorcycle steering stems.",
      countermeasure: "Laser paint-depth mapping & airbag deployment sensor log verification.",
      detectionTelemetry: "FRAME MISALIGNMENT: +4.2mm // SENSOR TRIGGER DETECTED",
    },
    {
      number: "02",
      title: "Odometer Inconsistencies & Rollbacks",
      flag: "Rollback Detection",
      severity: "High (42% Risk)",
      severityPercent: 88,
      severityColor: "text-[#E7A83E]",
      barColor: "bg-[#E7A83E]",
      zone: "Digital Instrument Cluster & ECU",
      hotspotCoords: { top: "38%", left: "46%" },
      evidenceImage:
        "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=800&q=80",
      description:
        "Digital instrument clusters can be electronically rolled back via OBD-II bypass tools in under ten minutes, wiping out 40,000+ km of wear.",
      countermeasure: "Monotonic regression modeling across all independent service receipts.",
      detectionTelemetry: "REVERSAL DETECTED: -35,200 km // MONOTONIC CURVE FAILS",
    },
    {
      number: "03",
      title: "Incomplete Maintenance Records",
      flag: "Coverage Gap",
      severity: "Moderate (28% Risk)",
      severityPercent: 68,
      severityColor: "text-[#E7A83E]",
      barColor: "bg-[#E7A83E]",
      zone: "Powertrain & Gearbox",
      hotspotCoords: { top: "48%", left: "34%" },
      evidenceImage:
        "https://images.unsplash.com/photo-1487754180451-c456f719a1fc?auto=format&fit=crop&w=800&q=80",
      description:
        "Unserviced synthetic oil intervals, skipped timing belts, and deferred superbike Desmo valve services degrade engine lifespan silently.",
      countermeasure: "Authorized workshop invoice verification with cryptographic cross-checks.",
      detectionTelemetry: "SERVICE INTERVAL GAP: 22 MONTHS // OIL SAMPLE DIRTY",
    },
    {
      number: "04",
      title: "Unverified Documents & Forged RTO Papers",
      flag: "Document Tampering",
      severity: "Critical (25% Risk)",
      severityPercent: 95,
      severityColor: "text-[#D95757]",
      barColor: "bg-[#D95757]",
      zone: "Registration Certificate & Insurance",
      hotspotCoords: { top: "32%", left: "60%" },
      evidenceImage:
        "https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=80",
      description:
        "Forged registration cards, doctored insurance renewal dates, and duplicate workshop invoices routinely bypass standard human scrutiny.",
      countermeasure: "OCR field extraction & consistency checks against the stored vehicle record.",
      detectionTelemetry: "FIELD MISMATCH // DOCUMENT HASH DUPLICATE FOUND",
    },
    {
      number: "05",
      title: "Unclear Ownership & Title Churn",
      flag: "Title Churn",
      severity: "Moderate (18% Risk)",
      severityPercent: 60,
      severityColor: "text-[#C5A46D]",
      barColor: "bg-[#C5A46D]",
      zone: "Vehicle Title & Registry",
      hotspotCoords: { top: "44%", left: "76%" },
      evidenceImage:
        "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80",
      description:
        "Undisclosed commercial rental fleet usage and rapid sequential ownership flips degrade vehicle reliability and market resale value.",
      countermeasure: "Audited ownership timeline built from the earliest supplied record.",
      detectionTelemetry: "TRANSFER VELOCITY: 3 OWNERS IN 14 MONTHS // FLEET FLAG",
    },
  ];

  const current = risks[activeRiskIndex];

  return (
    <section id="problem" className="py-24 bg-[#08090A] border-t border-[#23262A] relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Editorial Section Header */}
        <div className="max-w-3xl mb-16">
          <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#E7A83E] inline-block mb-3">
            Used Vehicle Vulnerabilities
          </span>
          <h2 className="font-display font-bold text-3xl sm:text-5xl text-white tracking-tight leading-[1.12]">
            Not Everything About a Vehicle Is Visible.
          </h2>
          <p className="mt-4 text-[15px] text-[#BFC3C8] leading-relaxed">
            Click the interactive inspection radar points below to reveal the hidden vulnerabilities that cosmetic detailing conceals from pre-owned vehicle buyers.
          </p>
        </div>

        {/* ================= INTERACTIVE VEHICLE DIAGNOSTIC RADAR SCANNER ================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Column: Interactive Vehicle Visual with Scanner & Clickable Hotspots (7 Cols) */}
          <div className="lg:col-span-7 relative min-h-[420px] rounded-2xl overflow-hidden border border-[#23262A] bg-[#0D0E11] flex flex-col justify-between shadow-2xl">
            {/* Background High-Res Diagnostic Vehicle Photo */}
            <div className="absolute inset-0 w-full h-full">
              <Image
                src="https://images.unsplash.com/photo-1603584173870-7f23fdae1b7a?auto=format&fit=crop&w=1200&q=80"
                alt="TrustDrive Diagnostic Chassis Visual"
                fill
                unoptimized
                className="object-cover object-center opacity-40 brightness-75 transition-opacity duration-700"
              />
              {/* Radial gradient vignette */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#08090A] via-transparent to-[#08090A]/60" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_20%,_#08090A_85%)]" />

              {/* Animated Laser Scanning Line */}
              <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C5A46D] to-transparent animate-[scanline_4s_ease-in-out_infinite] shadow-[0_0_15px_#C5A46D] pointer-events-none" />
            </div>

            {/* Top HUD Bar */}
            <div className="relative z-10 p-5 flex items-center justify-between border-b border-[#23262A]/60 bg-[#08090A]/60 backdrop-blur-md">
              <div className="flex items-center gap-2 text-[11px] font-mono text-[#BFC3C8]">
                <span className="w-2 h-2 rounded-full bg-[#36B982] animate-ping" />
                <span>CHASSIS SCANNER ACTIVE</span>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#C5A46D] bg-[#17191C] px-2.5 py-1 rounded-full border border-[#23262A]">
                Target: {current.zone}
              </span>
            </div>

            {/* Interactive Hotspot Buttons (Overlayed on vehicle zones) */}
            <div className="relative z-10 flex-1 w-full h-full min-h-[260px]">
              {risks.map((risk, idx) => {
                const isActive = activeRiskIndex === idx;
                return (
                  <button
                    key={risk.number}
                    onClick={() => setActiveRiskIndex(idx)}
                    style={{ top: risk.hotspotCoords.top, left: risk.hotspotCoords.left }}
                    aria-label={`Inspect ${risk.title}`}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 group transition-all duration-300 focus:outline-none z-20 ${
                      isActive ? "scale-125" : "hover:scale-110 opacity-75 hover:opacity-100"
                    }`}
                  >
                    <div className="relative flex items-center justify-center">
                      {/* Pulse Ring */}
                      <span
                        className={`absolute w-8 h-8 rounded-full animate-ping opacity-60 ${
                          isActive ? "bg-[#C5A46D]" : "bg-white/30"
                        }`}
                      />
                      {/* Inner Dot */}
                      <span
                        className={`relative w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-mono font-bold shadow-xl border ${
                          isActive
                            ? "bg-[#C5A46D] text-black border-white shadow-[#C5A46D]/50"
                            : "bg-[#17191C] text-white border-[#23262A] hover:border-[#C5A46D]"
                        }`}
                      >
                        {risk.number}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Bottom Diagnostic Console Feed */}
            <div className="relative z-10 m-4 p-3.5 rounded-xl bg-[#111315]/90 border border-[#23262A] backdrop-blur-md flex items-center justify-between text-[11px] font-mono">
              <div className="flex items-center gap-2 truncate">
                <Icon name="AlertTriangle" size={14} className="text-[#E7A83E] shrink-0" />
                <span className="text-[#BFC3C8] truncate">{current.detectionTelemetry}</span>
              </div>
              <span className="text-[#E7A83E] uppercase text-[10px] shrink-0 ml-2">
                Click dots to inspect
              </span>
            </div>
          </div>

          {/* Right Column: Visual Evidence Card for the Active Risk (5 Cols) */}
          <div className="lg:col-span-5 rounded-2xl border border-[#23262A] bg-[#111315] p-6 sm:p-7 flex flex-col justify-between shadow-2xl relative">
            <div>
              {/* Card Header & Risk Number */}
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-sm font-bold text-[#C5A46D] px-2.5 py-1 rounded bg-[#17191C] border border-[#23262A]">
                    {current.number} / 05
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#E7A83E] bg-[#E7A83E]/10 px-2.5 py-1 rounded border border-[#E7A83E]/20">
                    {current.flag}
                  </span>
                </div>
                <span className={`text-[11px] font-mono font-bold ${current.severityColor}`}>
                  {current.severity}
                </span>
              </div>

              {/* Title */}
              <h3 className="font-display font-bold text-xl sm:text-2xl text-white">
                {current.title}
              </h3>

              {/* Photographic Evidence Card */}
              <div className="relative h-44 rounded-xl overflow-hidden border border-[#23262A] my-4 group bg-[#17191C]">
                <Image
                  src={current.evidenceImage}
                  alt={`${current.title} physical evidence`}
                  fill
                  unoptimized
                  className="object-cover group-hover:scale-105 transition-transform duration-500 brightness-85"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#08090A] via-transparent to-transparent opacity-80" />
                <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[10px] font-mono text-[#BFC3C8]">
                  <span>Physical Evidence Sample</span>
                  <span className="text-[#C5A46D]">Inspection Finding</span>
                </div>
              </div>

              {/* Description */}
              <p className="text-[13px] text-[#BFC3C8] leading-relaxed">
                {current.description}
              </p>

              {/* Severity Bar */}
              <div className="mt-4 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-[#7A8089]">
                  <span>VULNERABILITY SEVERITY INDEX</span>
                  <span className={current.severityColor}>{current.severityPercent}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#17191C] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${current.barColor} transition-all duration-500`}
                    style={{ width: `${current.severityPercent}%` }}
                  />
                </div>
              </div>

              {/* Countermeasure Box */}
              <div className="mt-4 p-3 rounded-xl bg-[#17191C] border border-[#23262A] text-[11.5px] space-y-1">
                <span className="text-[#36B982] font-mono text-[10px] uppercase block font-semibold">
                  TrustDrive Countermeasure:
                </span>
                <p className="text-[#7A8089] leading-relaxed">
                  {current.countermeasure}
                </p>
              </div>
            </div>

            {/* Navigation Tabs for All 5 Risks */}
            <div className="mt-6 pt-4 border-t border-[#23262A] flex items-center justify-between gap-1">
              {risks.map((r, i) => (
                <button
                  key={r.number}
                  onClick={() => setActiveRiskIndex(i)}
                  className={`flex-1 py-1.5 rounded-lg text-center font-mono text-[11px] font-bold transition-all ${
                    activeRiskIndex === i
                      ? "bg-[#C5A46D] text-black shadow-md shadow-[#C5A46D]/20"
                      : "bg-[#17191C] text-[#7A8089] hover:text-white"
                  }`}
                >
                  {r.number}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
