import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export interface ResourceArticle {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  readTime: string;
  date: string;
  imageUrl: string;
}

export const articles: ResourceArticle[] = [
  {
    slug: "odometer-rollback-guide",
    title: "How Digital Odometer Rollbacks Occur — And How Cryptographic Verification Exposes Them",
    category: "Odometer Fraud Awareness",
    excerpt: "Modern digital CAN-bus clusters can be altered with OBD-II bypass tools in under ten minutes. Learn how historical service interval regression catches mileage fraud.",
    readTime: "6 min read",
    date: "March 24, 2026",
    imageUrl: "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=80",
  },
  {
    slug: "chassis-inspection-secrets",
    title: "Beyond the Paintwork: A Structural Guide to Hidden Accident & Frame Damage",
    category: "Vehicle Inspection",
    excerpt: "Why fresh exterior clearcoats frequently disguise sub-frame straightening. Key indicators from paint depth gauges, suspension mounting points, and crash sensor logs.",
    readTime: "8 min read",
    date: "March 18, 2026",
    imageUrl: "https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=1200&q=80",
  },
  {
    slug: "used-car-buying-rules",
    title: "The 10 Non-Negotiable Rules Before Purchasing Any Used Vehicle",
    category: "Used-Car Buying Guides",
    excerpt: "From verifying engine chassis numbers against original RTO paper records to demanding proof of comprehensive insurance continuity.",
    readTime: "5 min read",
    date: "March 12, 2026",
    imageUrl: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=1200&q=80",
  },
  {
    slug: "blockchain-hash-truth",
    title: "Tamper-Evident SHA-256 Hashes vs Physical Authenticity: Understanding the Distinction",
    category: "Automotive Technology",
    excerpt: "Why cryptographic hashes prove that records were not retroactively tampered with, and why human inspection remains essential for original physical document validation.",
    readTime: "7 min read",
    date: "March 05, 2026",
    imageUrl: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80",
  },
  {
    slug: "document-forgery-detection",
    title: "Spotting Forged Registration & Insurance Documents with Modern OCR",
    category: "Document Verification",
    excerpt: "An engineering breakdown of font kerning anomalies, mismatched RTO authority seals, and cross-state title transfer inconsistencies.",
    readTime: "6 min read",
    date: "February 28, 2026",
    imageUrl: "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=1200&q=80",
  },
  {
    slug: "powertrain-maintenance-intervals",
    title: "Turbocharged Engine Maintenance: Verifying Service Intervals and Oil History",
    category: "Vehicle Maintenance",
    excerpt: "How irregular synthetic oil service intervals degrade turbo bearings, and why authorized dealer workshop stamps are critical for luxury powertrain longevity.",
    readTime: "4 min read",
    date: "February 20, 2026",
    imageUrl: "https://images.unsplash.com/photo-1599819811279-d5ad9cccf838?auto=format&fit=crop&w=1200&q=80",
  },
];

export function ResourcesSection({ limit }: { limit?: number }) {
  const displayedArticles = limit ? articles.slice(0, limit) : articles;

  return (
    <section id="resources" className="py-24 bg-[#08090A] border-t border-[#23262A] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-14 gap-6">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block mb-3">
              Automotive Knowledge Base
            </span>
            <h2 className="font-display font-bold text-3xl sm:text-5xl text-white tracking-tight">
              News & Resources.
            </h2>
            <p className="mt-2 text-[14px] sm:text-[15px] text-[#7A8089] max-w-xl">
              In-depth investigations, technical inspection tutorials, and fraud-awareness briefings written by TrustDrive engineers and certified automotive specialists.
            </p>
          </div>

          <Link
            href="/resources"
            className="inline-flex items-center gap-2 text-[12px] uppercase font-semibold tracking-wider text-[#C5A46D] hover:text-[#D6B882] py-2 px-4 rounded-full border border-[#C5A46D]/30 hover:border-[#C5A46D] transition-colors"
          >
            <span>View All Articles</span>
            <Icon name="ArrowRight" size={14} />
          </Link>
        </div>

        {/* Articles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedArticles.map((art) => (
            <article
              key={art.slug}
              className="group rounded-2xl border border-[#23262A] bg-[#111315] overflow-hidden hover:border-[#C5A46D]/60 transition-all duration-300 flex flex-col justify-between hover:shadow-2xl hover:shadow-black"
            >
              <div>
                {/* Article Image Container */}
                <div className="relative h-48 w-full overflow-hidden bg-[#17191C]">
                  <Image
                    src={art.imageUrl}
                    alt={art.title}
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#111315] via-transparent to-transparent opacity-80" />
                  <div className="absolute top-3 left-3">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#C5A46D] bg-[#08090A]/90 px-2.5 py-1 rounded-full border border-[#23262A] backdrop-blur-sm">
                      {art.category}
                    </span>
                  </div>
                </div>

                {/* Article Content */}
                <div className="p-5">
                  <div className="flex items-center gap-2 text-[11px] font-mono text-[#7A8089] mb-2">
                    <span>{art.date}</span>
                    <span>&bull;</span>
                    <span>{art.readTime}</span>
                  </div>

                  <h3 className="font-display font-bold text-base text-white group-hover:text-[#F5F5F5] transition-colors leading-snug line-clamp-2">
                    {art.title}
                  </h3>

                  <p className="mt-2.5 text-[12.5px] leading-relaxed text-[#7A8089] line-clamp-3">
                    {art.excerpt}
                  </p>
                </div>
              </div>

              {/* Read Article Link */}
              <div className="p-5 pt-0">
                <Link
                  href={`/resources/${art.slug}`}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#BFC3C8] group-hover:text-[#C5A46D] transition-colors"
                >
                  <span>Read Article</span>
                  <Icon name="ArrowRight" size={13} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
