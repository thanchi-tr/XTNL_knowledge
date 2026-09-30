import { Suspense } from "react";
import { YouTabs } from "@/components/home/YouTabs";
import { YouTabsSlot } from "@/components/home/YouTabsSlot";
import "@/components/home/you.css";
import "@/components/skills/skills.css";
// The fifteen skies are drawn only on the path header (a .sky-scope) and the
// art previews: imported by this segment, never globally.
import "../skies.css";

/**
 * The Skills segment of You: the compact tab strip stays put while a path
 * loads (loading.tsx sits inside this layout), and the page area is the
 * `main` container (no fixed layer renders inside it: sheets and toasts
 * portal to <body>). The ready dot on the Skills tab streams in.
 */
export default function SkillsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page cq-main">
      <Suspense fallback={<YouTabs />}>
        <YouTabsSlot />
      </Suspense>
      {children}
    </div>
  );
}
