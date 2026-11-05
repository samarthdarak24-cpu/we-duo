import type { Config } from "tailwindcss";

/**
 * Semantic tokens are CSS variables that may be hex, rgba or a theme override.
 * `color-mix` lets Tailwind's `/opacity` modifiers work on any of them while
 * preserving a token's own alpha (e.g. the translucent Night nav surfaces).
 */
const token = (name: string) =>
  `color-mix(in srgb, var(--${name}) calc(<alpha-value> * 100%), transparent)`;

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Semantic tokens are driven by CSS variables (see app/globals.css).
           :root keeps them dark (homepage, auth, dark report pages); the
           .portal-canvas scope overrides them to a light palette so the
           buyer/seller/admin portals render a light content canvas while
           keeping a black navigation. This makes every semantic class
           (text-ink, bg-surface, border-border, bg-bg, etc.) theme-aware. */
        bg: token("bg"),
        surface: token("surface"),
        "surface-tint": token("surface-tint"),
        primary: {
          DEFAULT: token("primary"),
          600: token("primary-600"),
        },
        navy: {
          900: token("bg"),
        },
        ink: token("text"),
        muted: token("muted"),
        border: token("border"),
        success: {
          DEFAULT: token("success"),
          bg: token("success-bg"),
        },
        warning: {
          DEFAULT: token("warning"),
          bg: token("warning-bg"),
        },
        danger: {
          DEFAULT: token("danger"),
          bg: token("danger-bg"),
        },
        info: {
          DEFAULT: token("info"),
          bg: token("info-bg"),
        },
        cinema: {
          bg: token("bg"),
          surface: token("surface"),
          card: token("surface"),
          "card-hover": token("surface-tint"),
          gold: token("primary"),
          "gold-hover": token("primary-600"),
          "gold-muted": token("info-bg"),
          white: token("text"),
          silver: token("muted"),
          "silver-muted": token("muted"),
          border: token("border"),
          "border-subtle": token("border"),
          verified: token("success"),
          warning: token("warning"),
          issue: token("danger"),
        },
      },
      fontFamily: {
        display: ["var(--font-sora)", "Inter", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "var(--font-jakarta)", "Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        title: ["24px", { lineHeight: "1.2", fontWeight: "700" }],
        "card-title": ["18px", { lineHeight: "1.3", fontWeight: "600" }],
        body: ["14px", { lineHeight: "1.5" }],
        caption: ["12px", { lineHeight: "1.4", fontWeight: "500" }],
        metric: ["48px", { lineHeight: "1", fontWeight: "800" }],
      },
      borderRadius: {
        card: "14px",
        pill: "10px",
        input: "10px",
      },
      boxShadow: {
        card: "0 12px 32px rgba(0,0,0,0.28)",
        "card-hover": "0 18px 44px rgba(0,0,0,0.5), 0 0 0 1px rgba(197,164,109,0.06)",
      },
      spacing: {
        "1": "4px",
        "2": "8px",
        "3": "12px",
        "4": "16px",
        "5": "20px",
        "6": "24px",
        "8": "32px",
      },
      transitionTimingFunction: {
        "out-soft": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "ring-fill": {
          from: { strokeDashoffset: "var(--ring-circ)" },
          to: { strokeDashoffset: "var(--ring-offset)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "ring-fill": "ring-fill 1.1s cubic-bezier(0.16,1,0.3,1) forwards",
        "fade-up": "fade-up 0.4s ease-out both",
        "pop-in": "pop-in 0.25s ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
