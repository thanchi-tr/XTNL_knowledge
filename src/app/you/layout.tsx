import { Suspense } from "react";
import { YouTabs } from "@/components/home/YouTabs";
import { YouTabsSlot } from "@/components/home/YouTabsSlot";
import "@/components/home/you.css";
import "@/components/skills/skills.css";

/**
 * You (final-you.html): Sheet, Loadout, Moments and Stats. The compact tab
 * strip stays put while a sub-page loads (loading.tsx sits inside this
 * layout), and the page area is the `main` container: every layer these
 * pages open (sheets, toasts) portals to <body>. The ready dot on the Skills
 * tab streams in; the layout itself awaits nothing.
 */
export default function YouLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page cq-main">
      <Suspense fallback={<YouTabs />}>
        <YouTabsSlot />
      </Suspense>
      {children}
    </div>
  );
}
