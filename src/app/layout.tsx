import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AppNav } from "@/components/AppNav";
import { NavTitleBadge } from "@/components/NavTitleBadge";
import { StreakProvider } from "@/components/StreakProvider";
import "./globals.css";

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
        <StreakProvider>
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
