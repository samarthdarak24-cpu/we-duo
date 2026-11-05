import { Navbar } from "@/components/public/Navbar";
import { Footer } from "@/components/public/Footer";
import { ResourcesSection } from "@/components/public/ResourcesSection";
import { Newsletter } from "@/components/public/Newsletter";

export const metadata = {
  title: "Automotive Insights & Resources — TrustDrive",
  description:
    "Expert guides on used car buying, odometer fraud awareness, vehicle inspection standards, and document verification.",
};

export default function ResourcesPage() {
  return (
    <div className="min-h-screen bg-[#08090A] text-[#F5F5F5] font-sans selection:bg-[#C5A46D]/30 selection:text-white">
      <Navbar />

      <main className="pt-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block mb-3">
            Editorial Research & Education
          </span>
          <h1 className="font-display font-extrabold text-3xl sm:text-5xl text-white tracking-tight leading-tight max-w-3xl mx-auto">
            Resources Center & <br />
            <span className="text-gold-gradient">Vehicle Intelligence.</span>
          </h1>
          <p className="mt-4 text-[15px] sm:text-[16px] text-[#BFC3C8] max-w-xl mx-auto leading-relaxed">
            Essential engineering breakdowns, fraud investigation analyses, and buyer advisories curated by our verification specialists.
          </p>
        </div>

        <ResourcesSection />

        <Newsletter />
      </main>

      <Footer />
    </div>
  );
}
