import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { CelebrationHost } from "@/components/celebrate/CelebrationHost";
import { AppShell } from "@/components/shell/AppShell";
import { ShellDataSlot } from "@/components/shell/ShellDataSlot";
import { PREPAINT_SCRIPT } from "@/components/shell/prepaint";
import { IconSprite } from "@/components/ui/Icon";
import { QuickCapture } from "@/components/capture/QuickCapture";
import { StreakProvider } from "@/components/StreakProvider";
import { PowerSaver } from "@/components/PowerSaver";
import "./globals.css";
// Separate global sheets, each starting with the layer order statement, so
// import order no longer decides who wins: the layer does. skies.css and
// cataclysm*.css are not global any more (L4 imports them where the sky and
// the ceremony render).
import "./arcane.css";
import "./powerbar.css";
import "./insignia.css";
import "./capture.css";

// Type: Inter for the UI (preloaded), Fraunces for named or earned things
// (roman preloaded, italic on demand), JetBrains Mono for formulas and
// receipts only (on demand). No SOFT axis.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], axes: ["opsz"], variable: "--font-fraunces", display: "swap" });
const frauncesItalic = Fraunces({
  subsets: ["latin"],
  style: "italic",
  axes: ["opsz"],
  variable: "--font-fraunces-italic",
  display: "swap",
  preload: false,
});
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap", preload: false });

export const viewport: Viewport = {
  // The opaque bar colour (--bar), so the browser's own chrome continues the top bar.
  themeColor: "#0c0f15",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // The Fold's cover screen has a camera cutout; `cover` paints edge to edge
  // and the safe-area insets keep content out from under it. Zoom stays enabled.
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "XTNL",
    template: "%s | XTNL",
  },
  description: "A character sheet for a real life: today's board, spaced review, and one honest ledger.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} ${frauncesItalic.variable} ${mono.variable}`}
      data-theme="night"
      data-motion="full"
      // The pre-paint script rewrites data-theme and data-motion before React hydrates.
      suppressHydrationWarning
    >
      <head>
        {/* Runs during parsing, before first paint: theme and motion from the
            prefs mirror, motion defaulting to prefers-reduced-motion. */}
        <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />
      </head>
      <body>
        <IconSprite />
        <PowerSaver />
        {/* The shell's data is a prop slot inside Suspense: the layout never
            awaits it, so loading.tsx fallbacks show and the chrome paints at
            once, filling in counts when the one cached query resolves. */}
        <AppShell
          dataSlot={
            <Suspense fallback={null}>
              <ShellDataSlot />
            </Suspense>
          }
        >
          <StreakProvider>{children}</StreakProvider>
        </AppShell>
        {/* The one capture sheet (L1). Outside <main>: its fixed layers must
            not sit under the @container. The tab bar's +, the rail and
            sidebar Capture, 'c' and Ctrl+K all open this instance. */}
        <QuickCapture />
        {/* L3's host for T2 Seals and T3 Ascensions (a stub until L3 lands). */}
        <CelebrationHost />
      </body>
    </html>
  );
}
