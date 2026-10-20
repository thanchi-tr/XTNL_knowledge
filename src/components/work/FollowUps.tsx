"use client";

/**
 * Follow-ups (Phase 2, 2026-10-20; crm.ts followUpOf): the customers who need one, the most overdue first, then the
 * quietest. A row: "Jane Nguyen · C-1042" (a link to them), why ("2 overdue · No contact for 42 days", the overdue part
 * in the owed ink, never alarm red) and one tap, "Schedule follow-up": the work frame's one scheduled task sheet,
 * prefilled (that customer, "Follow up with Jane Nguyen", tomorrow 09:00, a call), nothing saved until Schedule.
 *
 *   FollowUpList     the rows (the Agenda's section, its side column's "Customers to watch", the Customers page)
 *   FollowUpSection  the Agenda's "Follow up" card (from 900 px the side column holds the list instead)
 */
import Link from "next/link";
import { customerHref, customersHref } from "@/lib/customers";
import { customerLabelOf } from "@/lib/customer-search";
import { FOLLOW_UP_SHOWN, followUpLabel, followUpTaskOf, type FollowUpView } from "@/lib/crm";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { openScheduledSheet } from "./work-store";

/** The Customers page's Follow up group (the Agenda's "See all" lands on it). */
export const FOLLOW_UP_ANCHOR = "follow-up";

/** Nothing to follow up: one calm line, saying what is watched. */
export function followUpEmptyLine(days: number): string {
  return `Everyone is in touch: nobody quiet for more than ${followUpLabel(days)}, and no overdue task.`;
}

/** Opens the scheduled task sheet for a follow-up (prefilled; nothing is saved until Schedule). */
export function scheduleFollowUp(f: Pick<FollowUpView, "customer">): void {
  const c = f.customer;
  openScheduledSheet({ customer: { id: c.id, number: c.number, name: c.name }, ...followUpTaskOf(c, new Date()) });
}

export function FollowUpList({ boardId, rows, max = FOLLOW_UP_SHOWN, compact = false }: { boardId: string; rows: readonly FollowUpView[]; max?: number; compact?: boolean }) {
  return (
    <ul className={cx("wk-follow", compact && "compact")}>
      {rows.slice(0, max).map((f) => {
        const overdue = f.overdue > 0 ? `${f.overdue} overdue` : null;
        const quiet = f.reasons.filter((r) => r !== overdue);
        return (
          <li key={f.customer.id} className="wk-follow-row">
            <Link className="wk-follow-who" href={customerHref(boardId, f.customer.id)}>
              <span className="wk-watch-n">{customerLabelOf(f.customer)}</span>
              <span className="wk-follow-why">
                {overdue && <span className="wk-follow-owed">{overdue}</span>}
                {overdue && quiet.length > 0 && <span aria-hidden="true"> · </span>}
                {quiet.join(" · ")}
              </span>
            </Link>
            <button type="button" className="st-act wk-follow-go" onClick={() => scheduleFollowUp(f)} aria-haspopup="dialog" aria-label={`Schedule follow-up with ${f.customer.name}`}>
              <Icon name="plus" />
              <span>Schedule follow-up</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The Agenda's "Follow up" card: the list (at most FOLLOW_UP_SHOWN, then "See all n on Customers"), or the calm line. */
export function FollowUpSection({ boardId, rows, days }: { boardId: string; rows: readonly FollowUpView[]; days: number }) {
  return (
    <section className="card wk-sec wk-follow-sec" data-sec="follow" aria-labelledby="wk-sec-follow">
      <h2 id="wk-sec-follow" className="wk-sec-h">
        <span className="wk-sec-t">Follow up</span>
        <span className="wk-count">{rows.length}</span>
        <span className="wk-sec-aside">quiet over {followUpLabel(days)}, or overdue</span>
      </h2>
      {rows.length === 0 ? <p className="wk-sec-note">{followUpEmptyLine(days)}</p> : <FollowUpList boardId={boardId} rows={rows} />}
      {rows.length > FOLLOW_UP_SHOWN && (
        <Link className="wk-watch-row wk-follow-all" href={`${customersHref(boardId)}#${FOLLOW_UP_ANCHOR}`}>
          See all {rows.length} on Customers
          <Icon name="chev" />
        </Link>
      )}
    </section>
  );
}
