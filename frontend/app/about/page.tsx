import { Navbar } from "@/components/public/Navbar";
import { Footer } from "@/components/public/Footer";
import { AboutSection } from "@/components/public/AboutSection";
import { Newsletter } from "@/components/public/Newsletter";
import { Icon } from "@/components/ui/Icon";
import Image from "next/image";
import Link from "next/link";

// AboutSection renders live database counters; never prerender a stale snapshot.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "About TrustDrive — Automotive Truth & Verification",
  description:
    "Our mission, technology approach, team, and honesty standards in creating a transparent pre-owned vehicle marketplace.",
};

export default function AboutPage() {
  const principles = [
    {
      title: "Honesty Over Claims",
      desc: "We never claim 'No accidents' or 'tamper-proof'. We say 'no record found in supported sources' and 'tamper-evident (hash-verified)'. Transparent language builds lasting trust.",
    },
    {
      title: "Deterministic Engine",
      desc: "Our scores are calculated by deterministic code with fixed penalty weights, not unpredictable generative AI models. Every calculation is fully auditable.",
    },
    {
      title: "Consent & Privacy",
      desc: "Sellers control document sharing consent. Sensitive personal information is redacted by default until authorized by the owner.",
    },
    {
      title: "Cryptographic Accountability",
      desc: "Historical records are immutable. Corrections do not delete previous data — they generate new auditable events linked to the original.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#08090A] text-[#F5F5F5] font-sans selection:bg-[#C5A46D]/30 selection:text-white">
      <Navbar />

      <main className="pt-28">
        {/* About Header */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center">
          <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block mb-3">
            Our Purpose & Foundation
          </span>
          <h1 className="font-display font-extrabold text-4xl sm:text-6xl text-white tracking-tight leading-tight max-w-4xl mx-auto">
            Rebuilding Trust in <br />
            <span className="text-gold-gradient">Used Automotive Commerce.</span>
          </h1>
          <p className="mt-5 text-[15px] sm:text-[17px] text-[#BFC3C8] max-w-2xl mx-auto leading-relaxed">
            Founded with the belief that purchasing a pre-owned vehicle should never feel like a high-stakes gamble.
          </p>
        </div>

        {/* Existing About Showcase */}
        <AboutSection />

        {/* Core Principles */}
        <section className="py-24 bg-[#08090A] border-t border-[#23262A]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mb-14">
              <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block mb-2">
                Ethical Grounding
              </span>
              <h2 className="font-display font-bold text-3xl sm:text-4xl text-white">
                Non-Negotiable Honesty Standards
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {principles.map((p) => (
                <div key={p.title} className="p-7 rounded-2xl bg-[#111315] border border-[#23262A] space-y-3">
                  <h3 className="font-display font-bold text-lg text-white">
                    {p.title}
                  </h3>
                  <p className="text-[14px] text-[#7A8089] leading-relaxed">
                    {p.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* Portals Showcase */}
            <div className="mt-16 p-8 rounded-2xl bg-[#111315] border border-[#23262A] flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <h3 className="font-display font-bold text-xl text-white">
                  Experience TrustDrive Portals Today
                </h3>
                <p className="text-[13px] text-[#7A8089] mt-1">
                  Access authenticated dashboards for buying, selling, or administrative verification.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/seller"
                  className="px-6 py-2.5 rounded-full bg-[#17191C] border border-[#23262A] hover:border-[#C5A46D] text-[12px] font-semibold text-white transition-colors"
                >
                  Seller Portal
                </Link>
                <Link
                  href="/buyer"
                  className="px-6 py-2.5 rounded-full bg-[#F5F5F5] hover:bg-white text-black text-[12px] font-semibold uppercase tracking-wider transition-colors"
                >
                  Buyer Portal
                </Link>
              </div>
            </div>
          </div>
        </section>

        <Newsletter />
      </main>

      <Footer />
    </div>
  );
}
