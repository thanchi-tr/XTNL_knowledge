"use client";

/**
 * The Office workspace's frame header (2026-10-20; the work layout draws it above every work tab page, so it stays put
 * while the pages under it change): a calm band in the work accent (--work, 8% over the page, a 3 px rule in it), so
 * you can tell at a glance you are at work. In it: the tab's name (from 600; the top bar names it below), the search
 * (WorkSearch: customers and scheduled tasks, live), the New menu (Scheduled task · Customer while the customer list
 * is on · Order while the order list is on) and the tab's menu (⋯: rename, the two lists, archive). Under it the
 * workspace's own pages (nav.ts workSubsOf: Agenda · Customers · Orders · Tasks), the current one marked, Customers and
 * Orders with a quiet count ("2 due today", "3 to order") while there is one.
 *
 * It hosts the one scheduled task sheet (ScheduledSheetHost) and publishes the tab and its search index to the pages
 * (work-store). No game furniture: no XP, no streak, no momentum, no celebration.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { customersHref } from "@/lib/customers";
import { ordersHref } from "@/lib/work-orders";
import type { WorkIndex } from "@/lib/customer-search";
import { workSectionOf, workSubsOf } from "@/components/shell/nav";
import { Icon } from "@/components/ui/Icon";
import { WorkGlyph } from "./ChannelGlyph";
import { ScheduledSheetHost } from "./ScheduledTaskSheet";
import { WorkMenu } from "./WorkMenu";
import { WORK_MENU_LABEL, WorkTabMenu } from "./WorkTabMenu";
import { WorkSearch } from "./WorkSearch";
import { openScheduledSheet, setWorkContext, type WorkFrameBoard } from "./work-store";

export const NEW_MENU_LABEL = "New";

/** The sub-navigation's quiet counts: "2 due today" beside Customers, "3 to order" beside Orders (null: none). */
export interface WorkCounts {
  customers: string | null;
  orders: string | null;
}

export function WorkHeader({ board, index, counts = { customers: null, orders: null }, nowIso }: { board: WorkFrameBoard; index: WorkIndex | null; counts?: WorkCounts; nowIso: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const section = workSectionOf(pathname);
  const subs = workSubsOf(board);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuKey, setMenuKey] = useState(0);

  useEffect(() => setWorkContext({ board, index }), [board, index]);

  // A customer's page: a new task starts with them.
  const customerId = (() => {
    const m = /\/customers\/([^/?#]+)/.exec(pathname ?? "");
    return m ? m[1] : null;
  })();

  const items = [
    { id: "task", label: "Scheduled task", icon: <WorkGlyph icon="calendar" />, onSelect: () => openScheduledSheet({ customerId }) },
    ...(board.crmOn ? [{ id: "customer", label: "Customer", icon: <WorkGlyph icon="people" />, onSelect: () => router.push(`${customersHref(board.id)}?new=1`) }] : []),
    ...(board.ordersOn ? [{ id: "order", label: "Order", icon: <WorkGlyph icon="cart" />, onSelect: () => router.push(`${ordersHref(board.id)}?new=1`) }] : []),
  ];

  return (
    <header className="wk-head" aria-label={`Work tab: ${board.name}`}>
      <div className="wk-band">
        <span className="wk-name">
          <WorkGlyph icon="work" />
          <b>{board.name}</b>
        </span>
        <WorkSearch board={board} index={index} nowIso={nowIso} />
        <WorkMenu
          label={NEW_MENU_LABEL}
          buttonClass="wk-new"
          button={
            <>
              <Icon name="plus" />
              <span>New</span>
            </>
          }
          items={items}
        />
        <button
          type="button"
          className="wk-tabmenu"
          aria-label={WORK_MENU_LABEL}
          aria-haspopup="dialog"
          onClick={() => {
            setMenuKey((k) => k + 1);
            setMenuOpen(true);
          }}
        >
          <Icon name="dot3" />
        </button>
      </div>
      <nav className="wk-subnav" aria-label={`${board.name} pages`}>
        {subs.map((s) => (
          <Link key={s.id} href={s.href} className="wk-sub" aria-current={s.id === section ? "page" : undefined}>
            {s.label}
            {s.id === "customers" && counts.customers && <span className="wk-sub-n">{counts.customers}</span>}
            {s.id === "orders" && counts.orders && <span className="wk-sub-n">{counts.orders}</span>}
          </Link>
        ))}
      </nav>
      <WorkTabMenu key={menuKey} board={board} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <ScheduledSheetHost board={board} index={index} />
    </header>
  );
}

/** The header's place while the tab is read: the band and the sub-navigation at their final height, nothing moving. */
export function WorkHeaderFallback() {
  return (
    <div className="wk-head" aria-hidden="true">
      <div className="wk-band">
        <span className="wk-search wk-skel" />
      </div>
      <div className="wk-subnav" />
    </div>
  );
}
