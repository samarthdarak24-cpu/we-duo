#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Rebuild the static deployment tree (`deploy/static`) from the CURRENT app
// source, so the published site never drifts behind the running product.
//
// The static deployment is a *subset* of the product:
//
//   included  -> the public, signed-out pages, plus their real components
//                 and the real `lib/` domain layer. Every number rendered on
//                 those pages is computed at build time by the same
//                 deterministic engine that the Next.js server uses
//                 (`lib/server/data.ts` reads the shared `.data/trustdrive.db`).
//
//   excluded  -> the REST API (`app/api/**`) and the three authenticated
//                 workspaces (`app/buyer`, `app/seller`, `app/admin`), which
//                 need a live Node server, a writable database and real
//                 sessions. `deploy/static/app/portal/page.tsx` states this
//                 plainly to visitors instead of hiding it.
//
// Everything else is copied verbatim, so the published UI is the real UI.
// Static-specific behaviour (the `/api/**` fetch guard, the honest deployment
// badge, the signed-out session rule) lives ONLY in this tree and never
// touches the running app.
//
// Usage: node scripts/sync-static-deploy.mjs
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = ROOT;
const DEST = join(ROOT, "deploy", "static");

/** Route folders that cannot be statically exported and are left out. */
const EXCLUDED_APP_DIRS = new Set([
  "api", // REST API — needs a live server
  "buyer", // authenticated workspace
  "seller", // authenticated workspace
  "admin", // authenticated workspace
  "print", // server-rendered PDF report
  "verify-email", // one-shot email token
  "reset-password", // one-shot email token
  "verification-cases", // authenticated seller workspace
]);

/** Files that exist only in the deployment tree and must survive the sync. */
const PRESERVED = [
  "components/public/StaticShowcaseNotice.tsx",
  "lib/static-showcase.ts",
  "app/portal/page.tsx",
];

/** Config files taken from the app source (the deployment keeps its own). */
const CONFIG_FROM_SOURCE = [
  "tailwind.config.ts",
  "postcss.config.mjs",
  "tsconfig.json",
  "next-env.d.ts",
];

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push(relative(base, full));
  }
  return out;
}

function copyTree(from, to, filter) {
  let count = 0;
  for (const rel of walk(from)) {
    const src = join(from, rel);
    const dest = join(to, rel);
    if (filter && !filter(rel, src)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    count++;
  }
  return count;
}

/** Read the deploy-only files into memory before the tree is wiped. */
const preserved = new Map();
for (const rel of PRESERVED) {
  const p = join(DEST, rel);
  if (existsSync(p)) preserved.set(rel, readFileSync(p));
}

console.log("sync-static-deploy: rebuilding", DEST);

// 1. Wipe the three synced trees.
for (const dir of ["app", "components", "lib"]) {
  const target = join(DEST, dir);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
}

// 2. Copy the app source.
const appCount = copyTree(join(SRC, "app"), join(DEST, "app"), (rel) => {
  const top = rel.split(sep)[0];
  // `app/portal` is deployment-only and is restored below.
  if (EXCLUDED_APP_DIRS.has(top)) return false;
  if (top === "portal") return false;
  return true;
});
const compCount = copyTree(join(SRC, "components"), join(DEST, "components"));
const libCount = copyTree(join(SRC, "lib"), join(DEST, "lib"));

// `types/` holds the ambient declaration for `node:sqlite` (Node 22.5+
// built-in). Without it the build's type check cannot resolve the import.
const typesCount = copyTree(join(SRC, "types"), join(DEST, "types"));

// 3. Static assets. `public/` is large and rarely changes; only refresh it
//    when something is actually missing.
const pubDest = join(DEST, "public");
let pubCount = 0;
if (!existsSync(pubDest)) {
  mkdirSync(pubDest, { recursive: true });
  pubCount = copyTree(join(SRC, "public"), pubDest);
} else {
  const missing = walk(join(SRC, "public")).filter(
    (rel) => !existsSync(join(pubDest, rel))
  );
  for (const rel of missing) {
    const dest = join(pubDest, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(SRC, "public", rel), dest);
    pubCount++;
  }
}

// 4. Config files.
for (const rel of CONFIG_FROM_SOURCE) {
  const src = join(SRC, rel);
  if (!existsSync(src)) continue;
  mkdirSync(dirname(join(DEST, rel)), { recursive: true });
  copyFileSync(src, join(DEST, rel));
}

// 5. Restore the deployment-only files.
for (const [rel, contents] of preserved) {
  const dest = join(DEST, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, contents);
}

// 6. Adaptations.
//
// Everything above is a verbatim copy of the running product. The edits below
// are the only differences between the running app and the published site,
// and each one is required by static export or by the honesty rule.
//
// Anchored replacements: if an anchor is missing or ambiguous the script
// FAILS. That way a change in the app source can never silently leave the
// published site stale or half-adapted.

/**
 * Replace one exact occurrence of `find` in a deployment file.
 * Throws when the anchor is absent or matches more than once.
 */
function replaceOnce(rel, find, replace) {
  const p = join(DEST, rel);
  if (!existsSync(p)) throw new Error(`adapt: missing file ${rel}`);
  const src = readFileSync(p, "utf8");
  const idx = src.indexOf(find);
  if (idx === -1) {
    throw new Error(`adapt: anchor not found in ${rel}:\n---\n${find}\n---`);
  }
  if (src.indexOf(find, idx + find.length) !== -1) {
    throw new Error(`adapt: anchor is ambiguous in ${rel}:\n---\n${find}\n---`);
  }
  writeFileSync(p, src.slice(0, idx) + replace + src.slice(idx + find.length));
}

/** Replace a whole file with authored content. */
function writeWhole(rel, content) {
  const p = join(DEST, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

// 6a. `force-dynamic` cannot be exported. These pages read the seeded
//     database at build time, which is exactly what a static page should do,
//     so they become explicit static pages.
const FORCE_STATIC = [
  "app/page.tsx",
  "app/login/page.tsx",
  "app/register/page.tsx",
  "app/marketplace/page.tsx",
  "app/vehicle/[id]/page.tsx",
  "app/verify/[token]/page.tsx",
];
for (const rel of FORCE_STATIC) {
  replaceOnce(
    rel,
    `export const dynamic = "force-dynamic";`,
    `export const dynamic = "force-static";`
  );
}

// 6b. Pre-render one page per published vehicle, so the published site has
//     real, browsable vehicle reports instead of an empty dynamic route.
replaceOnce(
  "app/vehicle/[id]/page.tsx",
  `import { getVehicleDetail, hotspotsFor } from "@/lib/server/data";`,
  `import { getMarketplace, getVehicleDetail, hotspotsFor } from "@/lib/server/data";`
);
replaceOnce(
  "app/vehicle/[id]/page.tsx",
  `export const metadata: Metadata = { title: "Vehicle Report — TrustDrive" };`,
  `export const metadata: Metadata = { title: "Vehicle Report — TrustDrive" };

/**
 * Static deployment: pre-render one page per published vehicle so the
 * published site carries real, browsable vehicle reports.
 */
export function generateStaticParams() {
  return getMarketplace({}, undefined).items.map((v) => ({ id: v.id }));
}`
);

// 6c. Pre-render the public lookup for every published vehicle under each
//     identifier a visitor might type: registration number, VIN, TrustDrive ID.
replaceOnce(
  "app/verify/[token]/page.tsx",
  `import { lookupVehicle } from "@/lib/server/data";`,
  `import { getMarketplace, lookupVehicle } from "@/lib/server/data";
import { getVehicle } from "@/lib/server/db";`
);
replaceOnce(
  "app/verify/[token]/page.tsx",
  `export const metadata: Metadata = { title: "Verify — TrustDrive" };`,
  `export const metadata: Metadata = { title: "Verify — TrustDrive" };

/**
 * Static deployment: pre-render the public lookup for every published
 * vehicle under each identifier a visitor might type.
 */
export function generateStaticParams() {
  const params: { token: string }[] = [];
  for (const v of getMarketplace({}, undefined).items) {
    const full = getVehicle(v.id);
    if (!full) continue;
    params.push({ token: v.regNo }, { token: full.vin }, { token: full.trustdrive_id });
  }
  return params;
}`
);

// 6d. The live stack status panel reads the Python intelligence service over
//     HTTP. There is no service behind a static host, so the panel is removed
//     rather than left showing a connection error.
replaceOnce(
  "app/technology/page.tsx",
  `import { StackStatus } from "@/components/public/StackStatus";\n`,
  ``
);
replaceOnce(
  "app/technology/page.tsx",
  `        {/* Live stack status (reads the intelligence service) */}
        <StackStatus />

`,
  ``
);

// 6e. No request scope and no session store in a static export, so the
//     signed-out (public) view is rendered instead of the seeded demo
//     account fallback. This keeps every published page honest: a visitor
//     sees what an anonymous visitor sees.
writeWhole(
  "lib/server/session.ts",
  `// ---------------------------------------------------------------------------
// Static deployment session rule.
//
// A static export has no request scope, no cookies and no session store, so
// there is no signed-in viewer. Every published page therefore renders the
// public, signed-out view.
//
// The return type is unchanged on purpose: callers across the tree keep
// compiling, they simply always receive "no session".
//
// This file is part of the static deployment tree only. The running Next.js
// app keeps its real cookie-backed session with the seeded demo fallback.
// ---------------------------------------------------------------------------

import type { UserRow } from "./db";

export function getSessionUser(_portal: "seller" | "buyer" | "admin"): UserRow | undefined {
  return undefined;
}
`
);

// 6f. Install the /api/** guard before any bundle executes, and show the
//     honest deployment badge.
replaceOnce(
  "app/layout.tsx",
  `import { GlobalThemeToggle } from "@/components/theme/GlobalThemeToggle";`,
  `import { GlobalThemeToggle } from "@/components/theme/GlobalThemeToggle";
import { StaticShowcaseNotice } from "@/components/public/StaticShowcaseNotice";
import { STATIC_FETCH_GUARD_SCRIPT } from "@/lib/static-showcase";`
);
replaceOnce(
  "app/layout.tsx",
  `        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>`,
  `        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/*
          Static deployment only: answer every /api/** call with an explicit
          "the live server is required" payload instead of an opaque network
          error. It lives in <head> so it runs before any bundle executes.
        */}
        <script dangerouslySetInnerHTML={{ __html: STATIC_FETCH_GUARD_SCRIPT }} />
      </head>`
);
replaceOnce(
  "app/layout.tsx",
  `          {children}
          <GlobalThemeToggle />`,
  `          {children}
          <GlobalThemeToggle />
          <StaticShowcaseNotice />`
);

// 6g. The workspaces are not part of a static export, so the footer points at
//     the deployment notice instead of a 404, and the "Live" badges are
//     corrected — claiming a portal is live when it is not would break the
//     project's honesty rule.
replaceOnce(
  "components/public/Footer.tsx",
  `                <Link href="/seller" className="text-[#BFC3C8] hover:text-[#C5A46D] flex items-center gap-1.5 transition-colors">
                  <span>Seller Portal</span>
                  <span className="text-[10px] bg-[#17191C] border border-[#23262A] px-1.5 py-0.5 rounded text-[#C5A46D]">Live</span>
                </Link>`,
  `                <Link href="/portal" className="text-[#BFC3C8] hover:text-[#C5A46D] flex items-center gap-1.5 transition-colors">
                  <span>Seller Portal</span>
                  <span className="text-[10px] bg-[#17191C] border border-[#23262A] px-1.5 py-0.5 rounded text-[#C5A46D]">Needs server</span>
                </Link>`
);
replaceOnce(
  "components/public/Footer.tsx",
  `                <Link href="/buyer" className="text-[#BFC3C8] hover:text-[#C5A46D] flex items-center gap-1.5 transition-colors">
                  <span>Buyer Portal</span>
                  <span className="text-[10px] bg-[#17191C] border border-[#23262A] px-1.5 py-0.5 rounded text-[#36B982]">Live</span>
                </Link>`,
  `                <Link href="/portal" className="text-[#BFC3C8] hover:text-[#C5A46D] flex items-center gap-1.5 transition-colors">
                  <span>Buyer Portal</span>
                  <span className="text-[10px] bg-[#17191C] border border-[#23262A] px-1.5 py-0.5 rounded text-[#C5A46D]">Needs server</span>
                </Link>`
);
replaceOnce(
  "components/public/Footer.tsx",
  `                <Link href="/admin/queue" className="text-[#7A8089] hover:text-[#BFC3C8] transition-colors">
                  Admin Verification Queue
                </Link>`,
  `                <Link href="/portal" className="text-[#7A8089] hover:text-[#BFC3C8] transition-colors">
                  Admin Verification Queue
                </Link>`
);
replaceOnce(
  "components/public/AboutSection.tsx",
  `                href="/seller"`,
  `                href="/portal"`
);

console.log(
  `  app=${appCount} components=${compCount} lib=${libCount} types=${typesCount} public(new)=${pubCount} preserved=${preserved.size}`
);

// 7. Report which excluded routes are absent, so the portal page can tell the
//    visitor exactly what is missing.
const missingRoutes = [...EXCLUDED_APP_DIRS].filter(
  (d) => d !== "api" && !existsSync(join(DEST, "app", d))
);
console.log("  excluded route folders:", missingRoutes.join(", "));
console.log("  adaptations applied: force-static, generateStaticParams, session rule, fetch guard, notice, footer links");

