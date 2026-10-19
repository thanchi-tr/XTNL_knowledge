import { Suspense } from "react";
import "@/components/work/work.css";
import { WorkHeaderFallback } from "@/components/work/WorkHeader";
import { WorkHeaderSlot } from "@/components/work/WorkHeaderSlot";

/**
 * The Office workspace (2026-10-20): the frame around every page of a work tab (/today/work/<id>: the Agenda, its
 * customers and a customer, its orders, its Tasks board). Its header (the band in the work accent: the tab's name, the
 * search, New and the tab's menu; then Agenda · Customers · Orders · Tasks) streams in its own Suspense, so the layout
 * awaits nothing and each page's loading.tsx shows under a header that stays put. data-skin="work" scopes the
 * workspace's calmer, denser look (work.css), and keeps every game furniture off its pages.
 */
export default function WorkLayout({ children, params }: { children: React.ReactNode; params: Promise<{ boardId: string }> }) {
  return (
    <div className="wk-frame cq-main" data-skin="work">
      <Suspense fallback={<WorkHeaderFallback />}>
        <WorkHeaderSlot params={params} />
      </Suspense>
      {children}
    </div>
  );
}
