import { Navbar } from "@/components/public/Navbar";
import { Footer } from "@/components/public/Footer";
import { FaqSection } from "@/components/public/FaqSection";
import { Newsletter } from "@/components/public/Newsletter";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export const metadata = {
  title: "Frequently Asked Questions — TrustDrive",
  description:
    "Comprehensive answers regarding AI vehicle verification, deterministic trust scoring, document verification, and marketplace policies.",
};

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-[#08090A] text-[#F5F5F5] font-sans selection:bg-[#C5A46D]/30 selection:text-white">
      <Navbar />

      <main className="pt-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block mb-3">
            Platform Knowledge Base
          </span>
          <h1 className="font-display font-extrabold text-3xl sm:text-5xl text-white tracking-tight leading-tight max-w-3xl mx-auto">
            Frequently Asked Questions.
          </h1>
          <p className="mt-4 text-[15px] sm:text-[16px] text-[#BFC3C8] max-w-xl mx-auto leading-relaxed">
            Transparent answers regarding our deterministic inspection algorithms, tamper-evident hash chains, and platform integrity.
          </p>
        </div>

        {/* Full FAQ Section with all questions */}
        <FaqSection />

        {/* Support Help Card */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="p-8 rounded-2xl bg-[#111315] border border-[#23262A] flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
            <div>
              <h3 className="font-display font-bold text-xl text-white">
                Have an inquiry not answered above?
              </h3>
              <p className="text-[13px] text-[#7A8089] mt-1">
                Our verification engineers and automotive compliance specialists are here to assist.
              </p>
            </div>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#F5F5F5] hover:bg-white text-black text-[12px] font-bold uppercase tracking-wider transition-all whitespace-nowrap"
            >
              <span>Contact Support</span>
              <Icon name="ArrowRight" size={14} />
            </Link>
          </div>
        </div>

        <Newsletter />
      </main>

      <Footer />
    </div>
  );
}
