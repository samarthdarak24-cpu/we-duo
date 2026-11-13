import { Navbar } from "@/components/public/Navbar";
import { Footer } from "@/components/public/Footer";
import { Newsletter } from "@/components/public/Newsletter";
import { articles } from "@/components/public/ResourcesSection";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

export async function generateStaticParams() {
  return articles.map((a) => ({
    slug: a.slug,
  }));
}

export default function ArticleDetailPage({ params }: { params: { slug: string } }) {
  const article = articles.find((a) => a.slug === params.slug);

  if (!article) {
    notFound();
  }

  const related = articles.filter((a) => a.slug !== params.slug).slice(0, 2);

  return (
    <div className="min-h-screen bg-[#08090A] text-[#F5F5F5] font-sans selection:bg-[#C5A46D]/30 selection:text-white">
      <Navbar />

      <main className="pt-28 pb-20">
        <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-[12px] font-mono text-[#7A8089] mb-8">
            <Link href="/" className="hover:text-white transition-colors">
              Home
            </Link>
            <span>/</span>
            <Link href="/resources" className="hover:text-white transition-colors">
              Resources
            </Link>
            <span>/</span>
            <span className="text-[#C5A46D] truncate max-w-[200px] sm:max-w-xs">
              {article.category}
            </span>
          </div>

          {/* Article Header */}
          <div className="space-y-4 mb-8">
            <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block">
              {article.category}
            </span>
            <h1 className="font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight leading-[1.14]">
              {article.title}
            </h1>
            <div className="flex items-center gap-4 text-[12px] font-mono text-[#7A8089] pt-2 border-b border-[#23262A] pb-6">
              <span>Published {article.date}</span>
              <span>&bull;</span>
              <span>{article.readTime}</span>
              <span>&bull;</span>
              <span className="text-[#36B982]">Verified Research</span>
            </div>
          </div>

          {/* Featured Visual */}
          <div className="relative h-[360px] sm:h-[440px] w-full rounded-2xl overflow-hidden border border-[#23262A] mb-12 shadow-2xl">
            <Image
              src={article.imageUrl}
              alt={article.title}
              fill
              unoptimized
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#08090A] via-transparent to-transparent opacity-60" />
          </div>

          {/* Article Editorial Body */}
          <div className="space-y-6 text-[15px] sm:text-[16px] leading-relaxed text-[#BFC3C8] border-b border-[#23262A] pb-12">
            <p className="text-lg sm:text-xl font-normal text-white leading-relaxed">
              {article.excerpt}
            </p>

            <h2 className="font-display font-bold text-2xl text-white pt-6">
              The Reality of Information Asymmetry in Pre-Owned Vehicles
            </h2>
            <p>
              In traditional used car transactions, the seller holds complete knowledge of how the vehicle was driven, serviced, or repaired. Buyers, conversely, are left evaluating visual paint reflections and trusting unverified dealer claims. This structural imbalance invites fraudulent practices ranging from digital cluster rollbacks to forged service logs.
            </p>

            {/* Editorial Pull Quote */}
            <div className="my-8 p-6 rounded-xl bg-[#111315] border-l-2 border-[#C5A46D] text-white italic font-display text-lg">
              &ldquo;A clean cosmetic detailing can hide a rolled odometer in under ten minutes. Only deterministic algorithmic cross-correlation provides verifiable truth.&rdquo;
            </div>

            <h2 className="font-display font-bold text-2xl text-white pt-4">
              How Algorithmic Cross-Correlation Detects Discrepancies
            </h2>
            <p>
              TrustDrive’s deterministic engine evaluates vehicle progression mathematically. Rather than accepting a solitary odometer number, the platform builds a chronological timeline from the records a seller supplies — service invoices, inspection readings and registration documents. When a service entry from 2024 reports 62,000 km while a 2026 listing claims 42,000 km, the platform raises a finding for human review. It is a flag backed by cited readings, not a concluded fraud determination, and missing readings remain unverified coverage.
            </p>

            <h2 className="font-display font-bold text-2xl text-white pt-4">
              Cryptographic Integrity and Tamper-Evidence
            </h2>
            <p>
              Each stored document carries a SHA-256 hash, and corrections are written as new audited entries rather than silently overwriting verified history. A matching hash is evidence that a stored file has not changed; it proves file integrity, not document authenticity, and no blockchain anchoring is claimed. Any gap in the record is reported as unverified coverage, never as proof of a clean history.
            </p>
          </div>

          {/* Related Articles */}
          <div className="py-12">
            <h3 className="font-display font-bold text-xl text-white mb-6">
              Related Research Briefings
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {related.map((rel) => (
                <Link
                  key={rel.slug}
                  href={`/resources/${rel.slug}`}
                  className="p-5 rounded-xl bg-[#111315] border border-[#23262A] hover:border-[#C5A46D]/60 transition-all group flex flex-col justify-between"
                >
                  <div>
                    <span className="text-[10px] font-mono uppercase text-[#C5A46D]">
                      {rel.category}
                    </span>
                    <h4 className="font-display font-bold text-[15px] text-white group-hover:text-[#F5F5F5] transition-colors mt-1.5 leading-snug">
                      {rel.title}
                    </h4>
                  </div>
                  <div className="mt-4 flex items-center gap-1 text-[11px] font-mono text-[#7A8089]">
                    <span>Read Article</span>
                    <Icon name="ArrowRight" size={12} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </article>

        <Newsletter />
      </main>

      <Footer />
    </div>
  );
}
