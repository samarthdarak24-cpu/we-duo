/**
 * TrustDrive Day / Night theme primitives.
 *
 * This module is framework-agnostic and safe to import from both server and
 * client components. It contains no browser globals at module scope.
 *
 * Day Mode is the original champagne-gold / black cinematic UI and is the
 * default. Night Mode is a premium deep-sapphire-blue + white palette.
 */

export type Theme = "day" | "night";

export const DEFAULT_THEME: Theme = "day";
export const THEME_STORAGE_KEY = "trustdrive.theme";
export const THEME_EVENT = "trustdrive:themechange";

/** Colours consumed by non-DOM surfaces (canvas 2D, WebGL, chart helpers). */
export const THEME_COLORS: Record<
  Theme,
  {
    canvas: string;
    surface: string;
    accent: string;
    accentSoft: string;
    border: string;
    ink: string;
  }
> = {
  day: {
    canvas: "#08090A",
    surface: "#17191C",
    accent: "#C5A46D",
    accentSoft: "#D6B882",
    border: "#23262A",
    ink: "#F5F5F5",
  },
  night: {
    canvas: "#061329",
    surface: "#132F60",
    accent: "#4C8DFF",
    accentSoft: "#82B2FF",
    border: "#2B4E85",
    ink: "#F7FAFF",
  },
};

/**
 * Runs before first paint so a persisted Night selection never flashes the
 * Day palette. Injected as an inline script from the root layout.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=window.localStorage.getItem("${THEME_STORAGE_KEY}");var d=document.documentElement;d.setAttribute("data-theme",t==="night"?"night":"day");d.setAttribute("data-theme-ready","1");}catch(e){var d=document.documentElement;d.setAttribute("data-theme","day");d.setAttribute("data-theme-ready","1");}})();`;
