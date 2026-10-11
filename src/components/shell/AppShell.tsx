"use client";

/**
 * FROZEN CONTRACT — AppShell (L0-foundation). Rendered once by the root layout.
 *
 *   <AppShell dataSlot={<Suspense fallback={null}><ShellDataSlot/></Suspense>}>{children}</AppShell>
 *
 * Chrome by viewport media query: tab bar < 600, rail 600–1279, sidebar ≥ 1280.
 * Under the top bar on phones, the current section's sub-page strip (SubTabs.tsx
 * SectionTabs; a profile page has its own, YouTabs).
 * Content layout by container query on <main class="main"> (container: main),
 * opted into per page with the `cq-main` class until every page portals its
 * fixed layers (see components.css). Every fixed layer (sheets, the toast dock,
 * the fx layer, the curtain) is portalled to <body>. Bars are opaque.
 *
 * Also mounts: the one ToastDock, the MotionPrefs listener, a skip link, and
 * the one profile menu (ProfileMenu.tsx; the crest, the rail's You and the
 * sidebar's card open it).
 */
import type { ReactNode } from "react";
import { MotionPrefsProvider } from "@/components/ui/MotionPrefs";
import { ToastDock } from "@/components/ui/ToastDock";
import { Rail, Sidebar, TabBar } from "./Chrome";
import { ProfileMenu } from "./ProfileMenu";
import { SectionTabs } from "./SubTabs";
import { TopBar } from "./TopBar";

export function AppShell({ children, dataSlot }: { children: ReactNode; dataSlot?: ReactNode }) {
  return (
    <MotionPrefsProvider>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app">
        <Rail />
        <Sidebar />
        <div className="col">
          <TopBar />
          <SectionTabs />
          <main className="main" id="main" tabIndex={-1}>
            {children}
          </main>
          <TabBar />
        </div>
      </div>
      <ToastDock />
      <ProfileMenu />
      {dataSlot}
    </MotionPrefsProvider>
  );
}
