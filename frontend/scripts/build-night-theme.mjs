/**
 * Generates `app/theme-night.generated.css`.
 *
 * TrustDrive was built with ~1,000 hardcoded Tailwind arbitrary colour
 * utilities (`bg-[#08090A]`, `hover:text-[#C5A46D]/80`, ...). Instead of
 * rewriting every component — which would put the original Day Mode at risk —
 * this script scans the sources and emits scoped overrides.
 *
 * Night Mode has three colour contexts:
 *   CONTENT   -> white / pale-blue surfaces, navy ink, royal-blue accents,
 *                multicolour semantic status chips.
 *   NAV       -> blue chrome (.theme-nav): deep-sapphire backgrounds + white
 *                text. A hand-written gradient in theme-night.css paints the
 *                bar itself; the DARK map below recolours its contents.
 *   CINEMATIC -> dark sapphire media surfaces (.theme-cinematic): hero video,
 *                frame-sequence canvas, 3D viewer, auth photograph. Kept dark
 *                so photographic/video content stays legible.
 *
 * Day Mode is unaffected: every rule is gated by [data-theme="night"] and
 * @media screen.
 *
 * Regenerate whenever new hardcoded colour utilities are added:
 *   node scripts/build-night-theme.mjs [--verbose]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["app", "components"];
const OUTPUT = path.join(ROOT, "app", "theme-night.generated.css");

/* --------------------------------------------------------------------------
   1. LIGHT / WHITE content palette (Day hex -> Night hex)
   -------------------------------------------------------------------------- */
const DAY_TO_LIGHT = {
  // Dark canvases / panels -> white and pale blue
  "#08090A": "#F6F9FF",
  "#0A0B0D": "#F6F9FF",
  "#0B0C0E": "#F6F9FF",
  "#0B0D0F": "#F6F9FF",
  "#0C0D0F": "#F6F9FF",
  "#0D0E11": "#F6F9FF",
  "#0D0F11": "#F6F9FF",
  "#111315": "#FFFFFF",
  "#121315": "#FFFFFF",
  "#121416": "#FFFFFF",
  "#141518": "#F2F7FF",
  "#141619": "#F2F7FF",
  "#141719": "#F2F7FF",
  "#151719": "#EAF2FF",
  "#16181D": "#EAF2FF",
  "#17191C": "#FFFFFF",
  "#171A1D": "#FFFFFF",
  "#181B20": "#EAF2FF",
  "#1C1F23": "#E3EDFB",
  "#1E2226": "#EAF2FF",
  "#202328": "#E3EDFB",
  "#23262A": "#D8E5F8",
  "#23282D": "#D8E5F8",
  "#292B2E": "#C9DCF5",
  "#2A2E33": "#C9DCF5",
  "#3A3E45": "#B9CDEA",
  "#3A3F45": "#B9CDEA",
  "#1A1710": "#E8F1FF",
  "#17140E": "#E8F1FF",
  "#262116": "#E8F1FF",
  "#12261F": "#ECFDF3",
  "#08110C": "#ECFDF3",
  "#2A2113": "#FFFBEB",
  "#2A1618": "#FEF2F2",

  // Champagne gold -> royal / sapphire blue
  "#C5A46D": "#1D4ED8",
  "#D6B882": "#3B82F6",
  "#B8923E": "#1D4ED8",
  "#D8D2C4": "#B9CDEA",
  "#6D28D9": "#7C3AED",
  "#2563EB": "#1D4ED8",

  // Metallic whites and silvers -> whites / pale blues (as surfaces)
  "#F5F5F5": "#FFFFFF",
  "#FFFFFF": "#FFFFFF",
  "#E5E5E5": "#FFFFFF",
  "#BFC3C8": "#C9DCF5",
  "#D0D6DF": "#B9CDEA",
  "#9299A2": "#B9CDEA",
  "#7A8089": "#B9CDEA",
  "#6B727B": "#B9CDEA",
  "#626A73": "#B9CDEA",
  "#4E555D": "#B9CDEA",
  "#64748B": "#B9CDEA",
  "#93C5FD": "#93B8F5",
  "#BAE6FD": "#93B8F5",

  // Light portal surfaces -> cool white / blue-tinted
  "#0F172A": "#102A52",
  "#F4F6F9": "#F6F9FF",
  "#EEF1F5": "#EAF2FF",
  "#E6E8EC": "#D8E5F8",
  "#E7E9EB": "#E3EDFB",
  "#E2E8F0": "#D8E5F8",
  "#CBD2DC": "#C9DCF5",
  "#B4BDCA": "#B9CDEA",
  "#ECFDF3": "#ECFDF3",
  "#E8F8EE": "#ECFDF3",
  "#FFFBEB": "#FFFBEB",
  "#FFF6E0": "#FFFBEB",
  "#FEF2F2": "#FEF2F2",
  "#FDECEC": "#FEF2F2",
  "#FBF6EC": "#E8F1FF",
  "#E8F0FF": "#E8F1FF",
  "#E0F2FE": "#E0F2FE",

  // Semantic status colours stay readable on white (multicolour chips)
  "#36B982": "#16A34A",
  "#E7A83E": "#D97706",
  "#D95757": "#DC2626",
  "#16A34A": "#16A34A",
  "#15803D": "#15803D",
  "#DC2626": "#DC2626",
  "#B91C1C": "#B91C1C",
  "#991B1B": "#991B1B",
  "#D97706": "#D97706",
  "#B45309": "#B45309",
  "#F59E0B": "#F59E0B",
};

/* --------------------------------------------------------------------------
   2. DARK / SAPPHIRE palette — used inside blue nav bars and cinematic media
   -------------------------------------------------------------------------- */
const DAY_TO_DARK = {
  "#08090A": "#061329",
  "#0A0B0D": "#081731",
  "#0B0C0E": "#091832",
  "#0B0D0F": "#091832",
  "#0C0D0F": "#0A1B3A",
  "#0D0E11": "#0A1B3A",
  "#0D0F11": "#0A1B3A",
  "#111315": "#0D2247",
  "#121315": "#0E2549",
  "#121416": "#0E2549",
  "#141518": "#102A55",
  "#141619": "#102A55",
  "#141719": "#102A55",
  "#151719": "#112B57",
  "#16181D": "#122D5B",
  "#17191C": "#132F60",
  "#171A1D": "#132F60",
  "#181B20": "#143163",
  "#1C1F23": "#163568",
  "#1E2226": "#1A3B70",
  "#202328": "#1D4076",
  "#23262A": "#2B4E85",
  "#23282D": "#2B4E85",
  "#292B2E": "#345A94",
  "#2A2E33": "#3C5F96",
  "#3A3E45": "#4166A0",
  "#3A3F45": "#4166A0",
  "#1A1710": "#152A50",
  "#17140E": "#142A54",
  "#262116": "#102A4E",
  "#12261F": "#0B2E33",
  "#08110C": "#0B2E33",
  "#2A2113": "#2A2440",
  "#2A1618": "#331C36",
  "#C5A46D": "#4C8DFF",
  "#D6B882": "#82B2FF",
  "#B8923E": "#2F6BEF",
  "#D8D2C4": "#BBD3F7",
  "#6D28D9": "#4C8DFF",
  "#2563EB": "#4C8DFF",
  "#F5F5F5": "#EAF2FF",
  "#FFFFFF": "#FFFFFF",
  "#E5E5E5": "#EAF1FF",
  "#BFC3C8": "#C7D9F5",
  "#D0D6DF": "#90AEDA",
  "#9299A2": "#A6BEE3",
  "#7A8089": "#93AEDA",
  "#6B727B": "#829DC8",
  "#626A73": "#7E99C6",
  "#4E555D": "#6D89B8",
  "#64748B": "#9AB4DB",
  "#93C5FD": "#BBD8FF",
  "#BAE6FD": "#9CCBFF",
  "#0F172A": "#F7FAFF",
  "#F4F6F9": "#061329",
  "#EEF1F5": "#143163",
  "#E6E8EC": "#2B4E85",
  "#E7E9EB": "#1D4076",
  "#E2E8F0": "#163568",
  "#CBD2DC": "#3F6397",
  "#B4BDCA": "#4C72A8",
  "#ECFDF3": "#0B2E33",
  "#E8F8EE": "#0B2E33",
  "#FFFBEB": "#2A2440",
  "#FFF6E0": "#2A2440",
  "#FEF2F2": "#331C36",
  "#FDECEC": "#331C36",
  "#FBF6EC": "#102A4E",
  "#E8F0FF": "#102A4E",
  "#E0F2FE": "#102A4E",
  // Semantic colours deliberately unchanged
  "#36B982": "#36B982",
  "#E7A83E": "#E7A83E",
  "#D95757": "#D95757",
  "#16A34A": "#16A34A",
  "#15803D": "#15803D",
  "#DC2626": "#DC2626",
  "#B91C1C": "#B91C1C",
  "#991B1B": "#991B1B",
  "#D97706": "#D97706",
  "#B45309": "#B45309",
  "#F59E0B": "#F59E0B",
};

const GOLD = new Set(["#C5A46D", "#D6B882", "#B8923E", "#D8D2C4"]);
const MUTED = new Set([
  "#BFC3C8", "#D0D6DF", "#9299A2", "#7A8089", "#6B727B",
  "#626A73", "#4E555D", "#64748B", "#93C5FD", "#BAE6FD",
]);
const INK = "#102A52";
const SLATE = "#5C7194";
const BORDER_LIGHT = "#C9DCF5";
const BORDER_ACCENT = "#93B8F5";

const LEFT_OK = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:_.@[]/-";
const RIGHT_OK = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789]_.,%-/)";
const HEX_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;

function key(hex) {
  const h = hex.startsWith("#") ? hex : "#" + hex;
  return h.toUpperCase();
}

function luminance(hex) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return 0;
  const channel = (i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function rgb(hex, alpha) {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)} ${parseInt(h.slice(2, 4), 16)} ${parseInt(h.slice(4, 6), 16)} / ${Math.round(alpha * 100) / 100})`;
}

/** Resolve the final colour for a utility in a given palette context. */
function resolve(prefix, hex, alpha, darkScope) {
  const k = key(hex);
  const target = darkScope ? DAY_TO_DARK[k] : DAY_TO_LIGHT[k];
  if (!target) return null;
  if (target.toUpperCase() === k) return null; // unchanged semantic colour

  let color = target;
  const p = prefix.toLowerCase();

  if (!darkScope) {
    if (p === "text" || p === "caret" || p === "decoration" || p === "placeholder" || p === "stroke") {
      if (!GOLD.has(k) && luminance(target) > 0.55) color = MUTED.has(k) ? SLATE : INK;
    } else if (
      p === "border" || p.startsWith("border-") || p === "divide" ||
      p === "ring" || p === "ring-offset" || p === "outline"
    ) {
      if (GOLD.has(k)) color = BORDER_ACCENT;
      else if (luminance(target) > 0.55) color = BORDER_LIGHT;
    }
  } else if (p === "border" || p.startsWith("border-") || p === "divide") {
    if (GOLD.has(k)) color = "rgba(143, 190, 255, 0.55)";
    else if (luminance(target) > 0.3) color = "rgba(255, 255, 255, 0.18)";
  }

  // rgba() border overrides already carry their own alpha; only hex targets
  // can be combined with a Tailwind opacity modifier.
  return alpha === null || !color.startsWith("#") ? color : rgb(color, alpha / 100);
}

/* --------------------------------------------------------------------------
   Scan sources for complete class tokens containing a hex colour.
   -------------------------------------------------------------------------- */
function collectFiles(dir, acc = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return acc;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(abs, entry.name);
    if (entry.isDirectory()) collectFiles(path.relative(ROOT, full), acc);
    else if (/\.(tsx|ts)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const tokens = new Set();
for (const dir of SCAN_DIRS) {
  for (const file of collectFiles(dir)) {
    const source = fs.readFileSync(file, "utf8");
    HEX_RE.lastIndex = 0;
    let match;
    while ((match = HEX_RE.exec(source)) !== null) {
      let a = match.index;
      let b = HEX_RE.lastIndex;
      while (a > 0 && LEFT_OK.includes(source[a - 1])) a--;
      while (b < source.length && RIGHT_OK.includes(source[b])) b++;
      const token = source.slice(a, b);
      if (token.includes("#")) tokens.add(token);
    }
  }
}

/* --------------------------------------------------------------------------
   Rule construction
   -------------------------------------------------------------------------- */
/** Build the two scoped selectors explicitly. */
function selectorsFor(token, variants, suffix, darkScope) {
  let ancestor = "";
  let pseudo = "";
  for (const variant of variants) {
    switch (variant) {
      case "hover": pseudo += ":hover"; break;
      case "focus": pseudo += ":focus"; break;
      case "focus-visible": pseudo += ":focus-visible"; break;
      case "focus-within": pseudo += ":focus-within"; break;
      case "active": pseudo += ":active"; break;
      case "disabled": pseudo += ":disabled"; break;
      case "checked": pseudo += ":checked"; break;
      case "before": pseudo += "::before"; break;
      case "after": pseudo += "::after"; break;
      case "placeholder": pseudo += "::placeholder"; break;
      case "group-hover": ancestor = ".group:hover "; break;
      case "group-focus": ancestor = ".group:focus "; break;
      case "peer-checked": ancestor = ".peer:checked ~ "; break;
      default: break;
    }
  }
  const attr = `[class~="${token}"]${pseudo}${suffix}`;
  if (darkScope) {
    return [
      `[data-theme="night"] .theme-nav ${ancestor}${attr}`,
      `[data-theme="night"] .theme-cinematic ${ancestor}${attr}`,
    ];
  }
  return [`[data-theme="night"] ${ancestor}${attr}`];
}

function declaration(prefix, color) {
  const p = prefix.toLowerCase();
  switch (p) {
    case "bg": return `background-color: ${color};`;
    case "text": return `color: ${color};`;
    case "border":
    case "border-x":
    case "border-y": return `border-color: ${color};`;
    case "border-t": return `border-top-color: ${color};`;
    case "border-r": return `border-right-color: ${color};`;
    case "border-b": return `border-bottom-color: ${color};`;
    case "border-l": return `border-left-color: ${color};`;
    case "from": return `--tw-gradient-from: ${color} var(--tw-gradient-from-position);`;
    case "via": return `--tw-gradient-via: ${color} var(--tw-gradient-via-position); --tw-gradient-stops: var(--tw-gradient-from), ${color} var(--tw-gradient-via-position), var(--tw-gradient-to, transparent);`;
    case "to": return `--tw-gradient-to: ${color} var(--tw-gradient-to-position);`;
    case "ring": return `--tw-ring-color: ${color};`;
    case "ring-offset": return `--tw-ring-offset-color: ${color};`;
    case "outline": return `outline-color: ${color};`;
    case "decoration": return `text-decoration-color: ${color};`;
    case "fill": return `fill: ${color};`;
    case "stroke": return `stroke: ${color};`;
    case "caret": return `caret-color: ${color};`;
    case "accent": return `accent-color: ${color};`;
    case "shadow": return `--tw-shadow-color: ${color}; --tw-shadow: var(--tw-shadow-colored);`;
    case "divide": return `border-color: ${color};`;
    case "placeholder": return `color: ${color};`;
    default: return null;
  }
}

const lightRules = [];
const darkRules = [];
const skippedTokens = [];
let skipped = 0;
const verbose = process.argv.includes("--verbose");

function skip(token) {
  skipped++;
  if (verbose) skippedTokens.push(token);
}

for (const token of [...tokens].sort()) {
  if (token.includes("selection:")) { skip(token); continue; } // global ::selection rule

  const colon = token.lastIndexOf(":");
  const variants = colon >= 0 ? token.slice(0, colon).split(":") : [];
  const util = colon >= 0 ? token.slice(colon + 1) : token;

  const exact = util.match(/^([a-z][a-z-]*)-\[#([0-9a-fA-F]{3,8})\](?:\/(\d{1,3}))?$/);
  if (exact) {
    const prefix = exact[1];
    const hex = exact[2];
    const alpha = exact[3] === undefined ? null : Number(exact[3]);
    const p = prefix.toLowerCase();
    const suffix =
      (p === "divide" ? " > :not([hidden]) ~ :not([hidden])" : "") +
      (p === "placeholder" ? "::placeholder" : "");

    const lightColor = resolve(prefix, hex, alpha, false);
    const darkColor = resolve(prefix, hex, alpha, true);
    if (!lightColor && !darkColor) { skip(token); continue; }

    if (lightColor) {
      const decl = declaration(prefix, lightColor);
      if (decl) {
        for (const sel of selectorsFor(token, variants, suffix, false)) {
          lightRules.push(`${sel} { ${decl} }`);
        }
      }
    }
    if (darkColor) {
      const decl = declaration(prefix, darkColor);
      if (decl) {
        for (const sel of selectorsFor(token, variants, suffix, true)) {
          darkRules.push(`${sel} { ${decl} }`);
        }
      }
    }
    continue;
  }

  // Arbitrary box-shadows containing a hex: shadow-[0_0_8px_#C5A46D]
  if (/^shadow-\[/.test(util) && /#[0-9a-fA-F]{3,8}/.test(util)) {
    const inner = util.slice(8, -1);
    const light = inner.replace(HEX_RE, (h) => DAY_TO_LIGHT[key(h)] ?? h).replace(/_/g, " ");
    const dark = inner.replace(HEX_RE, (h) => DAY_TO_DARK[key(h)] ?? h).replace(/_/g, " ");
    for (const sel of selectorsFor(token, variants, "", false)) {
      lightRules.push(`${sel} { box-shadow: ${light}; }`);
    }
    for (const sel of selectorsFor(token, variants, "", true)) {
      darkRules.push(`${sel} { box-shadow: ${dark}; }`);
    }
    continue;
  }

  skip(token);
}

if (verbose && skippedTokens.length) {
  console.log("Skipped tokens:\n  " + skippedTokens.join("\n  "));
}

const header = `/* ==========================================================================
   AUTO-GENERATED — do not edit by hand.
   Source: scripts/build-night-theme.mjs
   Regenerate: node scripts/build-night-theme.mjs

   CONTENT (white / blue) : ${lightRules.length} rules
   NAV + CINEMATIC (blue chrome / dark sapphire media) : ${darkRules.length} rules

   Every selector is gated by [data-theme="night"], so Day Mode is 100%
   unchanged. Wrapped in @media screen so printed reports stay neutral.
   ========================================================================== */

@media screen {
  /* ---- White / blue content surfaces ---- */
${lightRules.map((r) => "  " + r).join("\n")}

  /* ---- Blue navigation chrome & dark cinematic media surfaces ---- */
${darkRules.map((r) => "  " + r).join("\n")}
}
`;

fs.writeFileSync(OUTPUT, header, "utf8");
console.log(
  `theme-night.generated.css: ${lightRules.length + darkRules.length} rules, ${tokens.size} tokens scanned, ${skipped} skipped (${Math.round(fs.statSync(OUTPUT).size / 1024)} KB)`
);
