import { getMarketplace } from "@/lib/server/data";
import { Navbar } from "@/components/public/Navbar";
import { Footer } from "@/components/public/Footer";
import { HeroSection } from "@/components/public/HeroSection";
import { ProblemSection } from "@/components/public/ProblemSection";
import { SolutionSection } from "@/components/public/SolutionSection";
import { AiIntelligenceSection } from "@/components/public/AiIntelligenceSection";
import { ReportShowcaseSection } from "@/components/public/ReportShowcaseSection";
import { HowItWorksSection } from "@/components/public/HowItWorksSection";
import { TechnologySection } from "@/components/public/TechnologySection";
import { MarketplaceSection } from "@/components/public/MarketplaceSection";
import { AboutSection } from "@/components/public/AboutSection";
import { ResourcesSection } from "@/components/public/ResourcesSection";
import { ContactForm } from "@/components/public/ContactForm";
import { FaqSection } from "@/components/public/FaqSection";
import { Newsletter } from "@/components/public/Newsletter";

export const dynamic = "force-dynamic";

export default function HomePage() {
  // Fetch real published vehicle listings from DB
  const marketplaceData = getMarketplace({}, undefined);
  const vehicles = (marketplaceData?.items ?? []).filter(Boolean);

  return (
    <div className="min-h-screen bg-[#08090A] text-[#F5F5F5] font-sans selection:bg-[#C5A46D]/30 selection:text-white">
      {/* Sticky Glass Navbar */}
      <Navbar />

      <main>
        {/* ================= SECTION 01: SIMPLE VIDEO HERO ================= */}
        <section id="hero">
          <HeroSection />
        </section>

        {/* SECTION 02 — The Problem */}
        <ProblemSection />

        {/* SECTION 03 — TrustDrive Solution */}
        <SolutionSection />

        {/* SECTION 04 — AI Vehicle Intelligence */}
        <AiIntelligenceSection />

        {/* SECTION 05 — Vehicle History Report */}
        <ReportShowcaseSection />

        {/* SECTION 06 — How TrustDrive Works */}
        <HowItWorksSection />

        {/* SECTION 07 — Technology and Integrity */}
        <TechnologySection />

        {/* SECTION 08 — Live Marketplace */}
        <MarketplaceSection initialVehicles={vehicles as any} />

        {/* SECTION 09 — About TrustDrive */}
        <AboutSection />

        {/* SECTION 10 — Insights and Resources */}
        <ResourcesSection limit={3} />

        {/* SECTION 11 — Contact */}
        <ContactForm />

        {/* SECTION 12 — FAQ */}
        <FaqSection limit={5} />

        {/* SECTION 13 — Newsletter */}
        <Newsletter />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
