import { Suspense } from "react";
import { YouTabs } from "@/components/home/YouTabs";
import { YouTabsSlot } from "@/components/home/YouTabsSlot";

/**
 * Settings is a You sub-page (Sheet · Skills · Loadout · Moments · Stats ·
 * Settings), so on compact it carries the same tab strip as /you and /skills
 * (YouTabs hides itself from 600, where the top bar and the sidebar list the
 * tabs). The strip stays put while the page loads (loading.tsx sits inside
 * this layout), and the page area is the `main` container: every layer the
 * page opens (sheets, toasts) portals to <body>. The Skills ready dot streams
 * in; the layout itself awaits nothing.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page cq-main">
      <Suspense fallback={<YouTabs />}>
        <YouTabsSlot />
      </Suspense>
      {children}
    </div>
  );
}
