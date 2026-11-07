"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_THEME,
  THEME_COLORS,
  THEME_EVENT,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/theme";
import { installSessionRecovery } from "@/lib/client/api";

// Installed at module evaluation (before any child effect fires) so expired
// sessions are refreshed and replayed for every seller/buyer API action,
// including components that call fetch directly instead of apiCall().
installSessionRecovery();

interface ThemeContextValue {
  theme: Theme;
  /** True once the persisted preference has been read from the DOM. */
  mounted: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  colors: (typeof THEME_COLORS)[Theme];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const TRANSITION_MS = 480;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [mounted, setMounted] = useState(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyTheme = useCallback((next: Theme, persist = true) => {
    const root = document.documentElement;

    // Colour transitions are enabled only while the palette changes, so the
    // rest of the app keeps its own bespoke transitions untouched.
    root.classList.add("theme-transitioning");
    root.setAttribute("data-theme", next);

    if (persist) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* private browsing / storage disabled — the choice still applies */
      }
    }

    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme: next } }));
    setThemeState(next);

    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    transitionTimer.current = setTimeout(() => {
      root.classList.remove("theme-transitioning");
    }, TRANSITION_MS);
  }, []);

  useEffect(() => {
    // The inline head script already resolved the stored value before paint.
    const resolved = document.documentElement.getAttribute("data-theme");
    setThemeState(resolved === "night" ? "night" : DEFAULT_THEME);
    setMounted(true);

    // Keep every open tab in sync.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      applyTheme(event.newValue === "night" ? "night" : DEFAULT_THEME, false);
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    };
  }, [applyTheme]);

  const toggleTheme = useCallback(() => {
    applyTheme(theme === "night" ? "day" : "night");
  }, [theme, applyTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      mounted,
      setTheme: (next: Theme) => applyTheme(next),
      toggleTheme,
      colors: THEME_COLORS[theme],
    }),
    [theme, mounted, applyTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}

/** Convenience hook for canvas / WebGL surfaces that cannot read CSS vars. */
export function useThemeColors() {
  return useTheme().colors;
}
