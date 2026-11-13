"use client";

import { useState } from "react";
import Image from "next/image";
import { Icon } from "@/components/ui/Icon";

export function AiIntelligenceSection() {
  const [activeFeature, setActiveFeature] = useState(0);

  // Capability descriptions only. No invented accuracy/latency benchmarks, no
  // implied government-registry integration (none is configured by default),
  // and every console value below is explicitly labelled illustrative.
  const features = [
    {
      code: "01",
      name: "Document Intelligence",
      tagline: "OCR extraction & field consistency checks",
      imageUrl: "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=80",
      description:
        "Extracts VIN, chassis numbers, engine codes, registration dates and ownership fields from uploaded PDFs and scans, then checks those fields against the vehicle record stored on this platform. No external transport registry is queried unless an operator explicitly configures a provider; unconfigured checks are reported as unavailable.",
      metrics: [
        { label: "Input Formats", value: "PDF / JPEG / PNG" },
        { label: "Output", value: "Extracted fields + evidence ID" },
        { label: "External Registry", value: "Unconfigured" },
      ],
      sampleOutput: {
        vin: "WBA5R1C50KAK12345",
        regNo: "MH01AB1234",
        status: "Fields checked against stored record",
        source: "Uploaded registration document",
      },
    },
    {
      code: "02",
      name: "Mileage Intelligence",
      tagline: "Deterministic odometer chronology checks",
      imageUrl: "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=1200&q=80",
      description:
        "Orders recorded service dates and odometer readings into a chronological timeline and flags reversals, freezes and implausible jumps using deterministic rules. A finding cites the exact readings it used; absent readings remain unverified coverage rather than proof of a clean history.",
      metrics: [
        { label: "Method", value: "Deterministic rules" },
        { label: "Rollback", value: "Flagged with evidence IDs" },
        { label: "Missing Data", value: "Unverified coverage" },
      ],
      sampleOutput: {
        claimedKm: "42,000 km",
        lastVerifiedKm: "42,000 km",
        status: "Example: monotonic progression",
        trend: "Illustrative values only",
      },
    },
    {
      code: "03",
      name: "Damage Intelligence",
      tagline: "Component-mapped inspection records",
      imageUrl: "https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=1200&q=80",
      description:
        "Maps inspection and damage records to named vehicle components so a 3D hotspot always corresponds to a real database entry. Photo-based detection is available only when the vision engine is configured; otherwise the platform returns an honest unavailable response instead of a guessed result.",
      metrics: [
        { label: "3D Hotspots", value: "Mapped to real records" },
        { label: "Severity", value: "Minor / Moderate / Major" },
        { label: "Vision Engine", value: "Reported when unavailable" },
      ],
      sampleOutput: {
        mappedComponents: "Hood, Doors, Bumpers",
        findingStatus: "Awaiting review",
        evidence: "Linked damage record IDs",
      },
    },
    {
      code: "04",
      name: "Fraud Risk Analysis",
      tagline: "Evidence-cited findings & human review routing",
      imageUrl: "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=1200&q=80",
      description:
        "Combines document, mileage and damage signals into findings that cite evidence references, the rule or model version that produced them, and a review status. Suggestions are distinguishable from confirmed facts and are routed to human reviewers in the admin queue.",
      metrics: [
        { label: "Trust Score", value: "Additive & versioned" },
        { label: "AI Output", value: "Suggestion, not fact" },
        { label: "Review", value: "Admin dispute queue" },
      ],
      sampleOutput: {
        findingState: "Awaiting human review",
        disputeStatus: "Illustrative example",
        coverage: "Not a clean-history claim",
      },
    },
    {
      code: "05",
      name: "Evidence Correlation",
      tagline: "Source linkage & SHA-256 integrity",
      imageUrl: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80",
      description:
        "Links each finding to its supporting document, image or service record and stores a SHA-256 hash of every file. A matching hash proves file integrity only — not document authenticity — and no blockchain anchoring is claimed.",
      metrics: [
        { label: "Hash Standard", value: "SHA-256" },
        { label: "Proves", value: "File integrity only" },
        { label: "Anchoring", value: "None claimed" },
      ],
      sampleOutput: {
        hashExample: "9f8a4e21c33b0c44298fc1c149afbf4c",
        integrity: "Integrity, not authenticity",
        linkedProofs: "Illustrative example",
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
            Five capability layers evaluate the records you store on this platform. Findings cite their evidence; no government or national transport registry is queried unless an operator explicitly connects a provider.
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
                  CAPABILITY OVERVIEW // {current.name.toUpperCase()}
                </span>
                <span className="text-[#C5A46D]">ILLUSTRATIVE</span>
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
              <span>CAPABILITY PREVIEW // EXAMPLE VALUES</span>
              <span className="text-[#C5A46D]">NOT A LIVE RESULT</span>
            </div>

            <div className="space-y-2 text-[#BFC3C8]">
              {Object.entries(current.sampleOutput).map(([key, val]) => (
                <div key={key} className="flex items-start justify-between gap-2">
                  <span className="text-[#7A8089] capitalize">{key.replace(/([A-Z])/g, " $1")}:</span>
                  <span className="text-[#F5F5F5] font-semibold text-right">{val}</span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-[#23262A] text-[10px] text-[#7A8089] flex items-center justify-between gap-2">
              <span>Illustrative — real results appear in the portals</span>
              <span className="text-[#C5A46D] whitespace-nowrap">SHA-256 = INTEGRITY ONLY</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
