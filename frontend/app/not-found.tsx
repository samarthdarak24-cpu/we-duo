import type { Metadata } from "next";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "Page not found — TrustDrive" };

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg p-6">
      <div className="pointer-events-none absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-primary/10 blur-[150px]" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-[420px] w-[420px] rounded-full bg-primary/5 blur-[150px]" />

      <div className="relative w-full max-w-xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/40 bg-surface-tint text-primary shadow-[0_0_40px_rgba(197,164,109,0.15)]">
          <Icon name="ScanSearch" size={30} />
        </div>
        <div className="mt-5 font-mono text-[11px] uppercase tracking-[0.32em] text-primary">404 · No matching record</div>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
          This page isn&apos;t in the ledger
        </h1>
        <p className="mx-auto mt-3 max-w-md text-body text-muted">
          The vehicle, listing or report you followed may have been removed, unpublished, or never existed. Search the verified inventory instead.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <a
            href="/buyer/explore"
            className="flex items-center gap-1.5 rounded-pill bg-primary px-5 py-2.5 text-caption font-semibold text-[var(--on-primary)] hover:bg-primary-600"
          >
            <Icon name="Compass" size={15} /> Explore verified vehicles
          </a>
          <a
            href="/buyer/verification"
            className="flex items-center gap-1.5 rounded-pill border border-border px-5 py-2.5 text-caption font-semibold text-ink hover:bg-surface"
          >
            <Icon name="BadgeCheck" size={15} /> Verify by ID or QR
          </a>
          <a
            href="/"
            className="flex items-center gap-1.5 rounded-pill border border-border px-5 py-2.5 text-caption font-semibold text-muted hover:bg-surface hover:text-ink"
          >
            <Icon name="ArrowLeft" size={15} /> Home
          </a>
        </div>
        <div className="mx-auto mt-10 grid max-w-md grid-cols-3 gap-2 border-t border-border pt-5 text-caption">
          <a href="/buyer" className="rounded-card border border-border bg-surface p-3 font-semibold text-ink transition hover:border-primary/40">
            Buyer
          </a>
          <a href="/seller" className="rounded-card border border-border bg-surface p-3 font-semibold text-ink transition hover:border-primary/40">
            Seller
          </a>
          <a href="/admin/queue" className="rounded-card border border-border bg-surface p-3 font-semibold text-ink transition hover:border-primary/40">
            Admin
          </a>
        </div>
      </div>
    </div>
  );
}
