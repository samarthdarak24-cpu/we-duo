"use client";

import { useState } from "react";
import Image from "next/image";
import { Icon } from "@/components/ui/Icon";

export function AiIntelligenceSection() {
  const [activeFeature, setActiveFeature] = useState(0);

  const features = [
    {
      code: "01",
      name: "Document Intelligence",
      tagline: "OCR extraction & registration verification",
      imageUrl: "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=80",
      description:
        "Extracts VIN, chassis numbers, engine codes, registration dates, and ownership records from PDFs and scans across cars and motorcycles. Cross-correlates extracted identifiers against national transport registries.",
      metrics: [
        { label: "Extraction Accuracy", value: "99.2%" },
        { label: "Supported Formats", value: "PDF / JPEG / PNG" },
        { label: "Processing Latency", value: "< 1.4s" },
      ],
      sampleOutput: {
        vin: "WBA5R1C50KAK12345",
        regNo: "MH01AB1234",
        status: "Verified Authenticated Match",
        issuer: "Ministry of Road Transport & Highways",
      },
    },
    {
      code: "02",
      name: "Mileage Intelligence",
      tagline: "Statistical odometer curve & anomaly detection",
      imageUrl: "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=1200&q=80",
      description:
        "Analyzes reported service dates and odometer readings against historical vehicle age. Detects reverse odometer rollbacks, abnormal freezes, and rapid usage spikes across digital instrument clusters.",
      metrics: [
        { label: "Anomaly Detection Rate", value: "98.6%" },
        { label: "Rollback Detection", value: "Deterministic Flag" },
        { label: "Tolerance Threshold", value: "Zero Rollback Allowed" },
      ],
      sampleOutput: {
        claimedKm: "42,000 km",
        lastVerifiedKm: "42,000 km",
        status: "Consistent Monotonic Progression",
        trend: "8,400 km / year average",
      },
    },
    {
      code: "03",
      name: "Damage Intelligence",
      tagline: "Computer vision panel inspection & structural alignment",
      imageUrl: "https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=1200&q=80",
      description:
        "Evaluates high-resolution exterior photos for panel gap misalignment, motorcycle trellis deformation, and resprayed panels. Cross-references visual indicators with insurance repair histories.",
      metrics: [
        { label: "Component Zones", value: "14 Articulated Zones" },
        { label: "Severity Scoring", value: "Minor / Moderate / Major" },
        { label: "Repair Tracking", value: "OEM vs Aftermarket" },
      ],
      sampleOutput: {
        scannedPanels: "Hood, Trellis, Doors, Bumpers, Swingarm",
        detectedAnomalies: "0 Structural Deformations",
        touchups: "1 Front Bumper Cosmetic Clip",
      },
    },
    {
      code: "04",
      name: "Fraud Risk Analysis",
      tagline: "Multi-factor anomaly scoring & human dispute routing",
      imageUrl: "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=1200&q=80",
      description:
        "Aggregates signals from documents, mileage, and damage records into an overall risk profile. Flags inconsistent claims directly to human reviewers and suspends suspicious car or superbike listings.",
      metrics: [
        { label: "Rule Set", value: "Deterministic Matrix" },
        { label: "Human Review Queue", value: "Admin Dashboard Live" },
        { label: "False Positive Rate", value: "< 0.4%" },
      ],
      sampleOutput: {
        riskCategory: "Low Risk Profile",
        disputeStatus: "Zero Unresolved Disputes",
        tamperFlags: "Clean Cryptographic Audit",
      },
    },
    {
      code: "05",
      name: "Evidence Correlation",
      tagline: "Immutable source linkage & cryptographic integrity",
      imageUrl: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80",
      description:
        "Connects every finding to its supporting document, image, or service record. Generates an append-only SHA-256 hash chain so buyers can verify the provenance of every claim.",
      metrics: [
        { label: "Hashing Standard", value: "SHA-256 (256-bit)" },
        { label: "Chain Structure", value: "Merkle-Linked Blocks" },
        { label: "Tamper Evidence", value: "Cryptographically Verifiable" },
      ],
      sampleOutput: {
        hashRoot: "9f8a4e21c33b0c44298fc1c149afbf4c",
        chainIntegrity: "100% Intact Chain",
        linkedProofs: "3 Invoices, 1 RC, 1 PUC",
      },
    },
  ];

  const current = features[activeFeature];

  return (
    <section id="technology-ai" className="py-24 bg-[#08090A] border-t border-[#23262A] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-3xl mb-16">
          <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block mb-3">
            Algorithmic Rigor
          </span>
          <h2 className="font-display font-bold text-3xl sm:text-5xl text-white tracking-tight">
            Intelligence That Looks Deeper.
          </h2>
          <p className="mt-4 text-[15px] text-[#BFC3C8] leading-relaxed">
            Five specialized intelligence layers evaluate every car and motorcycle against verified physical records and national transport registries.
          </p>
        </div>

        {/* Feature Selector Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-10">
          {features.map((feat, idx) => {
            const isSelected = activeFeature === idx;
            return (
              <button
                key={feat.code}
                onClick={() => setActiveFeature(idx)}
                className={`p-4 rounded-xl text-left border transition-all duration-200 ${
                  isSelected
                    ? "bg-[#17191C] border-[#C5A46D] shadow-lg shadow-black"
                    : "bg-[#111315] border-[#23262A] hover:border-[#7A8089]/50"
                }`}
              >
                <span className="font-mono text-[11px] text-[#C5A46D] block mb-1">
                  {feat.code}
                </span>
                <span className="font-display font-bold text-[13px] text-white block">
                  {feat.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Active Feature Deep Dive Showcase */}
        <div className="rounded-2xl border border-[#23262A] bg-[#111315] p-6 sm:p-10 shadow-2xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Details Column */}
          <div className="lg:col-span-7 space-y-6">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-[#C5A46D]">
                Layer {current.code} &bull; {current.tagline}
              </span>
              <h3 className="font-display font-bold text-2xl sm:text-3xl text-white mt-1">
                {current.name}
              </h3>
            </div>

            <p className="text-[14px] sm:text-[15px] text-[#BFC3C8] leading-relaxed">
              {current.description}
            </p>

            {/* Visual Scan Banner with Online Image */}
            <div className="relative h-36 rounded-xl overflow-hidden border border-[#23262A]">
              <Image
                src={current.imageUrl}
                alt={`${current.name} Live Diagnostic Scan`}
                fill
                unoptimized
                className="object-cover brightness-65"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#111315] via-transparent to-transparent" />
              <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[11px] font-mono">
                <span className="text-white font-semibold">
                  ACTIVE SCAN // {current.name.toUpperCase()}
                </span>
                <span className="text-[#36B982] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#36B982] animate-ping" />
                  ANALYZING
                </span>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              {current.metrics.map((m) => (
                <div key={m.label} className="p-3 rounded-lg bg-[#17191C] border border-[#23262A]">
                  <div className="text-[10px] uppercase font-mono text-[#7A8089]">
                    {m.label}
                  </div>
                  <div className="text-[13px] font-bold text-white font-mono mt-0.5">
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Diagnostic Console Simulation (Right) */}
          <div className="lg:col-span-5 p-5 rounded-xl bg-[#08090A] border border-[#23262A] font-mono text-[12px] space-y-3 shadow-inner">
            <div className="flex items-center justify-between pb-2 border-b border-[#23262A] text-[10px] text-[#7A8089]">
              <span>TRUSTDRIVE ENGINE // AUDIT_FEED</span>
              <span className="text-[#36B982] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#36B982] animate-ping" />
                ACTIVE
              </span>
            </div>

            <div className="space-y-2 text-[#BFC3C8]">
              {Object.entries(current.sampleOutput).map(([key, val]) => (
                <div key={key} className="flex items-start justify-between gap-2">
                  <span className="text-[#7A8089] capitalize">{key.replace(/([A-Z])/g, " $1")}:</span>
                  <span className="text-[#F5F5F5] font-semibold text-right">{val}</span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-[#23262A] text-[10px] text-[#7A8089] flex items-center justify-between">
              <span>Verified against SQLite DB</span>
              <span className="text-[#C5A46D]">TAMPER_EVIDENT</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
