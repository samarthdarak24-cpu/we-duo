"use client";

import { useState } from "react";
import Image from "next/image";
import { Icon } from "@/components/ui/Icon";

export function SolutionSection() {
  const [activeType, setActiveType] = useState<"car" | "bike">("car");

  const capabilities = [
    {
      icon: "FileCheck",
      title: "AI Document Extraction",
      desc: "Instant OCR parsing of Registration Certificates, insurance policies, and workshop invoices into structured, verifiable fields.",
    },
    {
      icon: "Activity",
      title: "Odometer Anomaly Detection",
      desc: "Mathematical modeling of historical mileage curves against vehicle age to catch rollbacks and unnatural plateaus across cars and bikes.",
    },
    {
      icon: "Move3d",
      title: "AI-Assisted Damage Detection",
      desc: "Computer vision scans of vehicle panel photos and motorcycle frame welds cross-referenced with past insurance claims.",
    },
    {
      icon: "GitCompare",
      title: "Vehicle History Correlation",
      desc: "Cross-checks multiple independent data sources to identify discrepancies between seller claims and recorded facts.",
    },
    {
      icon: "ShieldCheck",
      title: "Evidence-Linked Findings",
      desc: "Every flagged item links directly to its source document, image, or timeline record — eliminating guesswork.",
    },
    {
      icon: "Sparkles",
      title: "Deterministic Trust Assessment",
      desc: "A rule-based transparent score from 0 to 100 that quantifies data completeness and risk, free from LLM hallucinations.",
    },
  ];

  return (
    <section id="solution" className="py-24 bg-[#08090A] border-t border-[#23262A] relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block mb-3">
            The TrustDrive Framework
          </span>
          <h2 className="font-display font-bold text-3xl sm:text-5xl text-white tracking-tight">
            Know More Before You Drive.
          </h2>
          <p className="mt-4 text-[15px] text-[#BFC3C8] leading-relaxed">
            We replace speculation with verified intelligence. TrustDrive brings institutional-grade verification to private buyers and transparent sellers of both cars and superbikes.
          </p>
        </div>

        {/* Asymmetric Showcase Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center mb-16">
          {/* Visual Showcase (5 columns) with Car / Bike Switcher */}
          <div className="lg:col-span-5 relative h-[440px] rounded-2xl overflow-hidden border border-[#23262A] group shadow-2xl bg-[#111315] flex flex-col justify-between">
            {/* Background Image */}
            <div className="absolute inset-0 w-full h-full">
              {activeType === "car" ? (
                <Image
                  src="https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=1200&q=80"
                  alt="Verified Mercedes Luxury Sedan in TrustDrive Studio"
                  fill
                  unoptimized
                  className="object-cover group-hover:scale-105 transition-transform duration-700"
                />
              ) : (
                <Image
                  src="https://images.unsplash.com/photo-1599819811279-d5ad9cccf838?auto=format&fit=crop&w=1200&q=80"
                  alt="Verified Kawasaki Ninja Superbike in TrustDrive Studio"
                  fill
                  unoptimized
                  className="object-cover group-hover:scale-105 transition-transform duration-700"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#08090A] via-[#08090A]/40 to-transparent" />
            </div>

            {/* Top Vehicle Switcher Pill */}
            <div className="relative z-10 p-5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 p-1 rounded-full bg-[#08090A]/85 backdrop-blur-md border border-[#23262A]">
                <button
                  onClick={() => setActiveType("car")}
                  className={`px-3 py-1 rounded-full text-[11px] font-mono uppercase tracking-wider transition-all ${
                    activeType === "car"
                      ? "bg-[#C5A46D] text-black font-bold"
                      : "text-[#BFC3C8] hover:text-white"
                  }`}
                >
                  Car Analysis
                </button>
                <button
                  onClick={() => setActiveType("bike")}
                  className={`px-3 py-1 rounded-full text-[11px] font-mono uppercase tracking-wider transition-all ${
                    activeType === "bike"
                      ? "bg-[#C5A46D] text-black font-bold"
                      : "text-[#BFC3C8] hover:text-white"
                  }`}
                >
                  Bike Analysis
                </button>
              </div>

              <span className="text-[10px] font-mono uppercase text-[#36B982] bg-[#36B982]/10 border border-[#36B982]/20 px-2.5 py-1 rounded-full backdrop-blur-md">
                100% Deterministic
              </span>
            </div>

            {/* Bottom Live Telemetry Overlay */}
            <div className="relative z-10 m-5 p-4 rounded-xl bg-[#111315]/90 border border-[#23262A] backdrop-blur-md space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#7A8089]">
                <span>
                  {activeType === "car" ? "AUTOMOBILE ENGINE v2.4" : "SUPERBIKE ENGINE v2.4"}
                </span>
                <span className="text-[#36B982] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#36B982] animate-ping" />
                  VERIFIED
                </span>
              </div>

              <div className="text-[13px] font-semibold text-white">
                {activeType === "car"
                  ? "Multi-Panel Volumetric & Crumple Scan"
                  : "Trellis Frame & Suspension Rake Scan"}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-[10px] font-mono text-[#BFC3C8] border-t border-[#23262A]/60">
                <div>
                  <span className="text-[#7A8089]">ODOMETER CURVE:</span> NORMAL
                </div>
                <div>
                  <span className="text-[#7A8089]">HASH CHAIN:</span> SHA-256
                </div>
              </div>
            </div>
          </div>

          {/* Capabilities Grid (7 columns) */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {capabilities.map((cap) => (
              <div
                key={cap.title}
                className="p-5 rounded-2xl bg-[#111315] border border-[#23262A] hover:border-[#C5A46D]/50 transition-all duration-300 flex flex-col justify-between group"
              >
                <div>
                  <div className="w-9 h-9 rounded-lg bg-[#17191C] border border-[#23262A] flex items-center justify-center text-[#C5A46D] mb-3 group-hover:border-[#C5A46D]/50 transition-colors">
                    <Icon name={cap.icon} size={18} />
                  </div>
                  <h3 className="font-display font-bold text-base text-white">
                    {cap.title}
                  </h3>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-[#7A8089]">
                    {cap.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
