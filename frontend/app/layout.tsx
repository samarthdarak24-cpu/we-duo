import type { Metadata } from "next";
import "./globals.css";
import "./theme-night.css";
import "./theme-night.generated.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { GlobalThemeToggle } from "@/components/theme/GlobalThemeToggle";

export const metadata: Metadata = {
  title: "TrustDrive — Every Car Has a Story. Discover the Truth.",
  description:
    "AI-powered vehicle intelligence, transparent history and evidence-backed inspection for confident used-car decisions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="day" suppressHydrationWarning>
      <head>
        {/* Resolves the persisted theme before first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased bg-bg text-ink selection:bg-primary/30 selection:text-white">
        <ThemeProvider>
          {children}
          <GlobalThemeToggle />
        </ThemeProvider>
      </body>
    </html>
  );
}
