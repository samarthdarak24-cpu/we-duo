import type { ReactNode } from "react";
import Link from "next/link";
import { Navbar } from "@/components/public/Navbar";
import { Footer } from "@/components/public/Footer";
import { Icon } from "@/components/ui/Icon";

export type LegalSection = {
  id: string;
  heading: string;
  body: ReactNode;
};

type Props = {
  eyebrow: string;
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
};

/**
 * Shared shell for the public legal pages. Keeps the two policies consistent
 * with the rest of the public site without duplicating page markup.
 */
export function LegalPageLayout({ eyebrow, title, intro, updated, sections }: Props) {
  return (
    <div className="min-h-screen bg-[#08090A] text-[#F5F5F5] font-sans selection:bg-[#C5A46D]/30 selection:text-white">
      <Navbar />

      <main className="pt-28">
        <div className="mx-auto max-w-7xl px-4 pb-12 pt-12 sm:px-6 lg:px-8">
          <span className="mb-3 inline-block font-mono text-[11px] uppercase tracking-[0.24em] text-[#C5A46D]">
            {eyebrow}
          </span>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-[#BFC3C8] sm:text-[16px]">
            {intro}
          </p>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-[#7A8089]">
            {updated}
          </p>
        </div>

        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 pb-20 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8">
          {/* Section index */}
          <nav aria-label="On this page" className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-2xl border border-[#23262A] bg-[#111315] p-5">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#7A8089]">
                On this page
              </div>
              <ol className="space-y-2.5 text-[12.5px]">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="flex gap-2 text-[#BFC3C8] transition-colors hover:text-[#C5A46D]"
                    >
                      <span className="font-mono text-[#7A8089]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>{s.heading}</span>
                    </a>
                  </li>
                ))}
              </ol>
              <div className="mt-5 border-t border-[#23262A] pt-4 text-[11.5px] leading-relaxed text-[#7A8089]">
                Need clarification?{" "}
                <Link href="/contact" className="text-[#C5A46D] hover:underline">
                  Contact support
                </Link>
                .
              </div>
            </div>
          </nav>

          {/* Policy body */}
          <article className="min-w-0 space-y-6">
            {sections.map((s, i) => (
              <section
                key={s.id}
                id={s.id}
                className="scroll-mt-28 rounded-2xl border border-[#23262A] bg-[#111315] p-6 sm:p-8"
              >
                <div className="mb-3 flex items-baseline gap-3">
                  <span className="font-mono text-[11px] text-[#C5A46D]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className="font-display text-xl font-bold text-white sm:text-2xl">
                    {s.heading}
                  </h2>
                </div>
                <div className="space-y-3 text-[13.5px] leading-relaxed text-[#BFC3C8] [&_a]:text-[#C5A46D] [&_a]:underline [&_strong]:font-semibold [&_strong]:text-white [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
                  {s.body}
                </div>
              </section>
            ))}

            <div className="flex flex-col gap-3 rounded-2xl border border-[#C5A46D]/30 bg-[#C5A46D]/[0.06] p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-display text-lg font-bold text-white">
                  Questions about this policy?
                </div>
                <p className="mt-1 text-[12.5px] text-[#9299A2]">
                  Reach the team through the contact form. We do not sell or share your records.
                </p>
              </div>
              <Link
                href="/contact"
                className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#F5F5F5] px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-black transition-colors hover:bg-white"
              >
                <span>Contact support</span>
                <Icon name="ArrowRight" size={14} />
              </Link>
            </div>
          </article>
        </div>
      </main>

      <Footer />
    </div>
  );
}
