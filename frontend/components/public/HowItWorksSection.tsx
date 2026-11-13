"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export function HowItWorksSection() {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      num: "01",
      title: "Add a Vehicle",
      subtitle: "VIN Registration & Specification Parsing",
      icon: "Car",
      duration: "Instant (< 500ms)",
      action: "Enter Reg No & Claimed Km",
      tag: "Identity Phase",
      highlights: [
        "Normalizes Indian registration plates (e.g. MH01AB1234)",
        "Extracts 17-character ISO VIN without manual transcription",
        "Pulls manufacturer specifications (Make, Model, Year, Fuel)",
      ],
      stageVisual: "registration",
    },
    {
      num: "02",
      title: "Upload Documents",
      subtitle: "Multi-Source Document Ingestion",
      icon: "Upload",
      duration: "Encrypted Upload",
      action: "Submit RC, Insurance, PUC & Invoices",
      tag: "Ingestion Phase",
      highlights: [
        "Accepts multi-page PDFs, scans, and high-res photos",
        "Generates immutable SHA-256 file fingerprint on arrival",
        "Protects seller privacy with consent flag toggles",
      ],
      stageVisual: "documents",
    },
    {
      num: "03",
      title: "Run AI Analysis",
      subtitle: "Deterministic Rules & Odometer Modeling",
      icon: "BrainCircuit",
      duration: "< 1.4s Processing",
      action: "Computer Vision & Anomaly Regression",
      tag: "Intelligence Phase",
      highlights: [
        "High-accuracy OCR extracts dates, VINs, and kilometer readings",
        "Monotonic curve modeling flags negative mileage drops",
        "Discrepancies routed to Human Arbitration Queue",
      ],
      stageVisual: "analysis",
    },
    {
      num: "04",
      title: "3D Inspection",
      subtitle: "14-Zone Component Condition Mapping",
      icon: "Move3d",
      duration: "Interactive 3D",
      action: "Explore Exploded Body Panels",
      tag: "Physical Phase",
      highlights: [
        "Maps collision records directly onto 3D vehicle meshes",
        "Interactive component separation (Doors, Hood, Chassis)",
        "Evidence photos linked to flagged body zones",
      ],
      stageVisual: "inspection3d",
    },
    {
      num: "05",
      title: "Review Evidence",
      subtitle: "Cryptographic SHA-256 Hash Ledger",
      icon: "ShieldCheck",
      duration: "Tamper-Evident",
      action: "Verify Merkle Block Chain",
      tag: "Ledger Phase",
      highlights: [
        "Every claim references an authentic, immutable source",
        "SHA-256 chain anchors historical audit timestamps",
        "Zero unverified promises or ungrounded statistics",
      ],
      stageVisual: "evidence",
    },
    {
      num: "06",
      title: "Access Vehicle Report",
      subtitle: "Certified Trust Score & QR Verification",
      icon: "FileCheck",
      duration: "Live Report",
      action: "Download PDF & Share QR Token",
      tag: "Certification Phase",
      highlights: [
        "Deterministic Trust Score from 0 to 100 with risk bands",
        "Shareable QR token for on-site vehicle inspections",
        "Official downloadable PDF verification certificate",
      ],
      stageVisual: "report",
    },
  ];

  const current = steps[activeStep];

  return (
    <section id="how-it-works" className="py-24 bg-[#08090A] border-t border-[#23262A] relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block mb-3">
            Verification Protocol
          </span>
          <h2 className="font-display font-bold text-3xl sm:text-5xl text-white tracking-tight">
            From Vehicle to Verified Insight.
          </h2>
          <p className="mt-4 text-[15px] text-[#BFC3C8] leading-relaxed">
            A transparent six-stage workflow that converts raw vehicle paperwork into verifiable automotive intelligence.
          </p>
        </div>

        {/* ================= HORIZONTAL TIMELINE STEPPER ================= */}
        <div className="relative mb-12">
          {/* Progress Connecting Line */}
          <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 bg-[#23262A] z-0" />
          <div
            className="hidden lg:block absolute top-1/2 left-0 h-[2px] -translate-y-1/2 bg-gradient-to-r from-[#C5A46D] to-[#36B982] transition-all duration-500 z-0"
            style={{ width: `${(activeStep / (steps.length - 1)) * 100}%` }}
          />

          {/* Stepper Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 relative z-10">
            {steps.map((step, idx) => {
              const isSelected = activeStep === idx;
              const isPast = idx < activeStep;

              return (
                <button
                  key={step.num}
                  onClick={() => setActiveStep(idx)}
                  className={`p-3.5 rounded-2xl text-left border transition-all duration-300 flex flex-col justify-between group ${
                    isSelected
                      ? "bg-[#17191C] border-[#C5A46D] shadow-xl shadow-black scale-[1.03]"
                      : isPast
                      ? "bg-[#111315] border-[#36B982]/40 hover:border-[#36B982]"
                      : "bg-[#111315] border-[#23262A] hover:border-[#7A8089]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        isSelected
                          ? "bg-[#C5A46D] text-black"
                          : isPast
                          ? "bg-[#36B982]/20 text-[#36B982]"
                          : "bg-[#17191C] text-[#7A8089]"
                      }`}
                    >
                      {step.num}
                    </span>
                    <Icon
                      name={step.icon}
                      size={16}
                      className={isSelected ? "text-[#C5A46D]" : isPast ? "text-[#36B982]" : "text-[#7A8089]"}
                    />
                  </div>

                  <div>
                    <span
                      className={`font-display font-bold text-[13px] block truncate ${
                        isSelected ? "text-white" : "text-[#BFC3C8] group-hover:text-white"
                      }`}
                    >
                      {step.title}
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#7A8089] block mt-0.5">
                      {step.tag}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ================= INTERACTIVE PROTOCOL SHOWCASE STAGE ================= */}
        <div className="rounded-2xl border border-[#23262A] bg-[#111315] p-6 sm:p-10 shadow-2xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Rich Interactive Visual Stage (7 Cols) */}
          <div className="lg:col-span-7 relative min-h-[360px] rounded-2xl overflow-hidden border border-[#23262A] bg-[#08090A] p-6 flex flex-col justify-between shadow-inner">
            {/* Top Micro-HUD */}
            <div className="flex items-center justify-between border-b border-[#23262A]/60 pb-3 text-[11px] font-mono">
              <div className="flex items-center gap-2 text-[#C5A46D]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C5A46D] animate-ping" />
                <span>PHASE {current.num} // {current.tag.toUpperCase()}</span>
              </div>
              <span className="text-[#36B982] bg-[#36B982]/10 border border-[#36B982]/20 px-2 py-0.5 rounded">
                {current.duration}
              </span>
            </div>

            {/* Dynamic Stage Graphics */}
            <div className="my-auto py-6">
              {/* STAGE 1: Registration Card */}
              {current.stageVisual === "registration" && (
                <div className="space-y-4 animate-fade-up">
                  {/* License Plate Graphic */}
                  <div className="max-w-xs mx-auto p-3 rounded-xl bg-gradient-to-r from-[#F5F5F5] to-[#E5E5E5] text-black border-2 border-black flex items-center justify-between shadow-2xl shadow-white/5">
                    <div className="flex items-center gap-1.5 border-r-2 border-black pr-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      <span className="font-mono font-extrabold text-[11px]">IND</span>
                    </div>
                    <span className="font-display font-extrabold text-2xl tracking-[0.2em]">
                      MH 01 AB 1234
                    </span>
                  </div>

                  {/* Decrypted Specs Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] font-mono text-center">
                    <div className="p-2.5 rounded-lg bg-[#111315] border border-[#23262A]">
                      <span className="text-[#7A8089] block text-[9px]">MAKE</span>
                      <span className="text-white font-bold">BMW</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[#111315] border border-[#23262A]">
                      <span className="text-[#7A8089] block text-[9px]">MODEL</span>
                      <span className="text-white font-bold">330i Sport</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[#111315] border border-[#23262A]">
                      <span className="text-[#7A8089] block text-[9px]">YEAR</span>
                      <span className="text-white font-bold">2021</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[#111315] border border-[#23262A]">
                      <span className="text-[#7A8089] block text-[9px]">TITLE SOURCE</span>
                      <span className="text-[#C5A46D] font-bold">Seller-declared</span>
                    </div>
                  </div>
                </div>
              )}

              {/* STAGE 2: Multi-Document Ingestion */}
              {current.stageVisual === "documents" && (
                <div className="grid grid-cols-3 gap-3 animate-fade-up">
                  <div className="p-3.5 rounded-xl bg-[#111315] border border-[#23262A] text-center space-y-2 relative group hover:border-[#C5A46D] transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-[#17191C] border border-[#23262A] flex items-center justify-center mx-auto text-[#C5A46D]">
                      <Icon name="FileText" size={16} />
                    </div>
                    <div className="text-[12px] font-bold text-white">Registration (RC)</div>
                    <div className="text-[10px] font-mono text-[#36B982]">OCR Parsed</div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#111315] border border-[#23262A] text-center space-y-2 relative group hover:border-[#C5A46D] transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-[#17191C] border border-[#23262A] flex items-center justify-center mx-auto text-[#C5A46D]">
                      <Icon name="ShieldCheck" size={16} />
                    </div>
                    <div className="text-[12px] font-bold text-white">Insurance Policy</div>
                    <div className="text-[10px] font-mono text-[#36B982]">Valid to 2026</div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#111315] border border-[#23262A] text-center space-y-2 relative group hover:border-[#C5A46D] transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-[#17191C] border border-[#23262A] flex items-center justify-center mx-auto text-[#C5A46D]">
                      <Icon name="Tag" size={16} />
                    </div>
                    <div className="text-[12px] font-bold text-white">Service Invoice</div>
                    <div className="text-[10px] font-mono text-[#36B982]">Navnit Motors</div>
                  </div>
                </div>
              )}

              {/* STAGE 3: AI Analysis & Odometer Regression */}
              {current.stageVisual === "analysis" && (
                <div className="space-y-3 animate-fade-up">
                  <div className="p-3.5 rounded-xl bg-[#111315] border border-[#23262A] space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-[#BFC3C8]">ODOMETER CURVE REGRESSION</span>
                      <span className="text-[#36B982]">MONOTONIC // PASS</span>
                    </div>
                    {/* Simulated Graph Lines */}
                    <div className="h-14 w-full flex items-end gap-1.5 pt-2">
                      <div className="w-1/5 bg-[#23262A] h-[25%] rounded-t" title="2021: 8,000 km" />
                      <div className="w-1/5 bg-[#23262A] h-[45%] rounded-t" title="2022: 24,000 km" />
                      <div className="w-1/5 bg-[#23262A] h-[70%] rounded-t" title="2023: 33,000 km" />
                      <div className="w-1/5 bg-[#C5A46D] h-[95%] rounded-t" title="2024: 42,000 km" />
                      <div className="w-1/5 bg-[#36B982] h-[95%] rounded-t" title="Verified: 42,000 km" />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#7A8089]">
                      <span>2021 (stored record)</span>
                      <span>2024 (Monotonic check)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* STAGE 4: 3D Inspection Mapping */}
              {current.stageVisual === "inspection3d" && (
                <div className="space-y-3 text-center animate-fade-up">
                  <div className="p-4 rounded-xl bg-[#111315] border border-[#23262A] space-y-3">
                    <div className="flex items-center justify-between text-[11px] font-mono text-[#7A8089]">
                      <span>3D WIREFRAME MESH ENGINE</span>
                      <span className="text-[#C5A46D]">14 ZONES</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-[10px] font-mono">
                      <span className="p-2 rounded bg-[#17191C] border border-[#23262A] text-white">Hood: Clean</span>
                      <span className="p-2 rounded bg-[#17191C] border border-[#23262A] text-white">Doors: Clean</span>
                      <span className="p-2 rounded bg-[#17191C] border border-[#23262A] text-white">Roof: OEM</span>
                      <span className="p-2 rounded bg-[#17191C] border border-[#23262A] text-[#36B982]">Chassis: 100%</span>
                    </div>
                    <Link
                      href="/inspection"
                      className="inline-flex items-center gap-2 text-[11px] font-mono text-[#C5A46D] hover:underline"
                    >
                      <span>Open Dedicated 3D Studio</span>
                      <Icon name="ArrowRight" size={13} />
                    </Link>
                  </div>
                </div>
              )}

              {/* STAGE 5: Cryptographic Merkle Hash Chain */}
              {current.stageVisual === "evidence" && (
                <div className="space-y-2 animate-fade-up">
                  <div className="p-3 rounded-lg bg-[#111315] border border-[#23262A] flex items-center justify-between font-mono text-[11px]">
                    <div className="flex items-center gap-2 text-[#36B982]">
                      <Icon name="Lock" size={14} />
                      <span>Block #1 [RC Registry]</span>
                    </div>
                    <span className="text-[#7A8089] truncate max-w-[160px]">sha256:8f3k2m...</span>
                  </div>

                  <div className="flex justify-center text-[#C5A46D]">
                    <Icon name="ArrowRight" size={14} className="rotate-90" />
                  </div>

                  <div className="p-3 rounded-lg bg-[#111315] border border-[#23262A] flex items-center justify-between font-mono text-[11px]">
                    <div className="flex items-center gap-2 text-[#36B982]">
                      <Icon name="Lock" size={14} />
                      <span>Block #2 [Service Logs]</span>
                    </div>
                    <span className="text-[#7A8089] truncate max-w-[160px]">sha256:7h2p4r...</span>
                  </div>
                </div>
              )}

              {/* STAGE 6: Verified Report & QR Token */}
              {current.stageVisual === "report" && (
                <div className="p-4 rounded-xl bg-[#111315] border border-[#23262A] flex items-center justify-between gap-4 animate-fade-up">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-full border-2 border-[#36B982] flex flex-col items-center justify-center font-mono bg-[#08090A]">
                      <span className="text-[14px] font-bold text-white">92</span>
                      <span className="text-[8px] text-[#7A8089]">/ 100</span>
                    </div>
                    <div>
                      <div className="text-[13px] font-bold text-white">Trust Certificate Issued</div>
                      <div className="text-[11px] font-mono text-[#36B982]">Band: Excellent (Verified)</div>
                    </div>
                  </div>

                  <a
                    href="/api/v1/public/sample-report"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-full bg-[#F5F5F5] hover:bg-white text-black text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0"
                  >
                    <Icon name="Download" size={13} />
                    <span>Get sample PDF</span>
                  </a>
                </div>
              )}
            </div>

            {/* Bottom Status Feed */}
            <div className="border-t border-[#23262A]/60 pt-3 flex items-center justify-between text-[11px] font-mono text-[#7A8089]">
              <span>Next Engine State Ready</span>
              <span className="text-[#C5A46D]">STAGE {current.num} OK</span>
            </div>
          </div>

          {/* Right Column: Step Details & Highlights (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-[#C5A46D] block mb-1">
                Phase {current.num} &bull; {current.subtitle}
              </span>
              <h3 className="font-display font-bold text-2xl sm:text-3xl text-white">
                {current.title}
              </h3>
            </div>

            <div className="space-y-3">
              {current.highlights.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 text-[13px] text-[#BFC3C8] leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C5A46D] shrink-0 mt-2" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            {/* Navigation Arrows */}
            <div className="pt-4 border-t border-[#23262A] flex items-center justify-between">
              <button
                type="button"
                disabled={activeStep === 0}
                onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
                className="px-4 py-2 rounded-full border border-[#23262A] bg-[#17191C] hover:bg-[#202328] text-white text-[12px] font-semibold disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-2"
              >
                <Icon name="ArrowLeft" size={13} />
                <span>Previous Phase</span>
              </button>

              <button
                type="button"
                disabled={activeStep === steps.length - 1}
                onClick={() => setActiveStep((s) => Math.min(steps.length - 1, s + 1))}
                className="px-5 py-2 rounded-full bg-[#C5A46D] hover:bg-[#D6B882] text-black text-[12px] font-bold disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-2"
              >
                <span>Next Phase</span>
                <Icon name="ArrowRight" size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
