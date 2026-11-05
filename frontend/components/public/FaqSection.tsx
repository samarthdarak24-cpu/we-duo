"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

export interface FaqItem {
  question: string;
  answer: string;
  category?: string;
}

const faqs: FaqItem[] = [
  {
    question: "What is TrustDrive?",
    answer:
      "TrustDrive is an AI-powered vehicle history verification, inspection, and transparent marketplace platform. We combine deterministic rules algorithms, computer vision, OCR document extraction, and tamper-evident SHA-256 hash chains to ensure buyers and sellers can transact used vehicles with verifiable evidence and complete confidence.",
    category: "General",
  },
  {
    question: "How does AI vehicle inspection work?",
    answer:
      "Our AI inspection pipeline ingests multi-angle vehicle photographs, workshop service receipts, and statutory records. Computer vision models analyze panel alignment, surface reflection variances, and visible damage indicators, while our OCR engine extracts odometer numbers, chassis VINs, and dates to cross-correlate against historic registries.",
    category: "Inspection",
  },
  {
    question: "Can AI identify all accident damage?",
    answer:
      "No. In strict adherence to our platform honesty policy, TrustDrive never claims 'no accidents occurred'. AI identifies anomalies and patterns found in submitted records and visible panel imagery. Where data or physical scans are unavailable, we explicitly report 'no accident records found in available sources' rather than declaring false perfection.",
    category: "Inspection",
  },
  {
    question: "What is a vehicle trust assessment?",
    answer:
      "The Trust Score (0–100) is calculated by a deterministic rules engine, not an unconstrained LLM. It computes score deductions based on documented issues: missing RC/insurance (-15), odometer rollbacks (-30), unverified service intervals (-8), and unresolved damage (-12). Vehicles scoring 85–100 earn the 'Strong Verification' tier.",
    category: "Trust & Safety",
  },
  {
    question: "How are documents verified?",
    answer:
      "Uploaded Registration Certificates (RC), insurance policies, Pollution Under Control (PUC) certificates, and service invoices are processed using OCR to extract critical identifiers (VIN, chassis, engine number, ownership sequence). Extracted data is cross-referenced with national databases and previous entries for inconsistency detection.",
    category: "Documents",
  },
  {
    question: "Does a blockchain hash prove document authenticity?",
    answer:
      "No. A cryptographic SHA-256 hash proves document tamper-evidence and audit integrity — ensuring that a document has not been altered or replaced since its recording timestamp. It does not independently prove that the original document provided was genuine. We make this distinction transparent on every report.",
    category: "Security",
  },
  {
    question: "What happens when vehicle history records are missing?",
    answer:
      "Missing intervals are clearly marked in the timeline as 'Unverified Period' or 'Record Unavailable'. We never interpolate or synthesize missing odometer entries. The completeness gauge on the report shows buyers exactly what percentage of the vehicle's lifespan is backed by verifiable records.",
    category: "History",
  },
  {
    question: "How can sellers publish vehicles?",
    answer:
      "Sellers register their vehicle in the Seller Portal, upload mandatory documents (RC, Insurance, PUC), submit latest odometer readings, and upload panel photos. Once our automated verification pipeline runs and flags are reviewed, the seller can publish a transparent verified listing to the marketplace with a single click.",
    category: "Sellers",
  },
  {
    question: "How can buyers access reports?",
    answer:
      "Buyers can inspect interactive vehicle reports directly on the vehicle showcase page or via any verified QR code / VIN lookup. Verified reports include complete damage 3D maps, chronological mileage charts, extracted document proofs, and a downloadable PDF copy backed by cryptographic verification.",
    category: "Buyers",
  },
];

export function FaqSection({ limit }: { limit?: number }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const displayedFaqs = limit ? faqs.slice(0, limit) : faqs;

  const toggle = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section id="faq" className="py-24 bg-[#08090A] border-t border-[#23262A]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block mb-3">
            Questions & Answers
          </span>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-white tracking-tight">
            Have a question?
          </h2>
          <p className="mt-3 text-[14px] sm:text-[15px] text-[#7A8089] max-w-lg mx-auto">
            Everything you need to know about TrustDrive&apos;s AI verification, honest scoring principles, and marketplace integrity.
          </p>
        </div>

        <div className="space-y-4">
          {displayedFaqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={faq.question}
                className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                  isOpen
                    ? "bg-[#111315] border-[#C5A46D]/40 shadow-lg"
                    : "bg-[#0D0F11] border-[#23262A] hover:border-[#7A8089]/40"
                }`}
              >
                <button
                  onClick={() => toggle(idx)}
                  className="w-full py-5 px-6 flex items-center justify-between text-left focus:outline-none"
                  aria-expanded={isOpen}
                >
                  <span
                    className={`font-display text-[15px] sm:text-[16px] font-medium transition-colors ${
                      isOpen ? "text-[#F5F5F5]" : "text-[#BFC3C8]"
                    }`}
                  >
                    {faq.question}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform duration-200 border ${
                      isOpen
                        ? "border-[#C5A46D] text-[#C5A46D] bg-[#17191C]"
                        : "border-[#23262A] text-[#7A8089]"
                    }`}
                  >
                    <Icon name={isOpen ? "Minus" : "Plus"} size={14} />
                  </div>
                </button>
                {isOpen && (
                  <div className="px-6 pb-6 pt-1 text-[13.5px] leading-relaxed text-[#7A8089] border-t border-[#23262A]/60 animate-fade-up">
                    <p>{faq.answer}</p>
                    {faq.category && (
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-[#17191C] border border-[#23262A] text-[#BFC3C8]">
                          {faq.category}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
