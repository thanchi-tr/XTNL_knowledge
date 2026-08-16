import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AppNav } from "@/components/AppNav";
import { NavTitleBadge } from "@/components/NavTitleBadge";
import { LoadoutBarSlot } from "@/components/skills/LoadoutBarSlot";
import { NotificationSlot } from "@/components/notifications/NotificationSlot";
import { StreakProvider } from "@/components/StreakProvider";
import { PowerSaver } from "@/components/PowerSaver";
import "./globals.css";
// Loaded after globals so the arcane layer can refine it. A trailing
// `@import` inside globals.css cannot do this: `@import` must precede all
// other rules, which put every globals declaration *after* it and let
// same-specificity selectors there win on source order.
import "./arcane.css";
import "./cataclysm.css";

// Inter + JetBrains Mono, matching XTNL_thesis. Was Geist/Geist Mono — the
// ecosystem's typographic identity is set by the thesis app, and the CSS
// variable names (--font-inter / --font-mono) are what globals.css expects.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const viewport: Viewport = {
  themeColor: "#04080f",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // The Fold's cover screen has a camera cutout punched into the status bar
  // area. `cover` lets the app paint the full panel edge to edge; the
  // `safe-area-inset-*` padding in globals.css is what keeps content out
  // from under the cutout and the rounded corners.
  viewportFit: "cover",
  // Zoom is left enabled on purpose. Locking it is the most common
  // accessibility regression in a "mobile-optimised" build, and nothing
  // here breaks when the page is scaled.
};

export const metadata: Metadata = {
  title: {
    default: "XTNL Knowledge Engine",
    template: "%s | XTNL",
  },
  description: "Spaced-repetition knowledge engine with vector deduplication and automated taxonomy.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <PowerSaver />
        <StreakProvider
          // The loadout is part of the shell, not of /skills — what you are
          // carrying matters most while reviewing, which is where the effects
          // actually fire.
          //
          // Deliberately NOT wrapped in <Suspense>, unlike the title badge
          // below. Inside a boundary its markup rendered but the client
          // component never hydrated, leaving every slot button inert —
          // verified by checking for React's props key on a slot. Rendering
          // it directly blocks the shell on `loadProgression`, which is
          // request-deduped and cross-request cached, so a warm load pays
          // nothing for it.
          bottomSlot={
            <>
              <LoadoutBarSlot />
              {/* Same rule as above — a prop, never inside <Suspense>, or the
                  bubble renders but its button never hydrates. */}
              <NotificationSlot />
            </>
          }
        >
          {/* The title badge streams in — the nav renders immediately and the
              badge fills once its query resolves, so no route waits on it. */}
          <AppNav
            titleSlot={
              <Suspense fallback={null}>
                <NavTitleBadge />
              </Suspense>
            }
          />
          {children}
        </StreakProvider>
      </body>
    </html>
  );
}
