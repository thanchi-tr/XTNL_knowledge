"use client";

/**
 * FROZEN CONTRACT — the Asks bell and sheet (L0-foundation). Replaces the
 * floating NotificationBubble.
 *
 *   <AsksBell/>     top-bar icon button with an ink count (asks.count; nothing at 0)
 *   <AsksSheet open onClose items/>   the derived feed as rows: a tone diamond, the
 *                   title, one line of detail and the row's one action. The rows
 *                   that ask come first and are exactly the bell's count; Duty's
 *                   listed rows (M2: yesterday's open musts, the weekly review;
 *                   ShellAsk.counted false) follow under 'For your information'
 *                   and are not counted; the boons and debuffs in effect follow
 *                   under their own heading and are not counted. The same feed
 *                   renders as AskCards on Today (L1). Nothing here expires:
 *                   every row is a live fact that disappears when it resolves.
 *   askSectionsOf(items)   the three groups, pure: `asking` has exactly askCount(items) rows.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { cx } from "@/components/ui/cx";
import { useShell } from "./shell-store";
import { RECORD_YESTERDAY_EVENT, RECORD_YESTERDAY_HREF } from "@/lib/shortcuts";
import { EFFECTS_GROUP, type ShellAsk } from "./shell-types";

export function AsksBell() {
  const [open, setOpen] = useState(false);
  const asks = useShell((s) => s.data?.asks ?? null);
  const count = asks?.count ?? 0;
  return (
    <>
      <IconButton
        icon="bell"
        label={count > 0 ? `Asks: ${count} waiting` : "Asks: nothing waiting"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Badge count={count} pinned />
      </IconButton>
      <AsksSheet open={open} onClose={() => setOpen(false)} items={asks?.items ?? []} />
    </>
  );
}

/**
 * The sheet's three groups, in feed order: the rows that ask (exactly the
 * bell's count, askCount), the listed rows that are never counted (counted
 * false), and the effects in play.
 */
export function askSectionsOf(items: readonly ShellAsk[]): { asking: ShellAsk[]; listed: ShellAsk[]; effects: ShellAsk[] } {
  const asking: ShellAsk[] = [];
  const listed: ShellAsk[] = [];
  const effects: ShellAsk[] = [];
  for (const a of items) {
    if (a.group === EFFECTS_GROUP) effects.push(a);
    else if (a.counted === false) listed.push(a);
    else asking.push(a);
  }
  return { asking, listed, effects };
}

export function AsksSheet({ open, onClose, items }: { open: boolean; onClose: () => void; items: ShellAsk[] }) {
  const { asking, listed, effects } = askSectionsOf(items);
  const pathname = usePathname();
  return (
    <Sheet open={open} onClose={onClose} title="Asks" description="Things waiting on you, derived from the ledger. Nothing here expires." id="asks">
      {asking.length === 0 ? (
        listed.length === 0 && (
          <p className="t-meta" style={{ padding: "8px 4px" }}>
            Nothing is waiting on you right now.
          </p>
        )
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {asking.map((a) => (
            <AskRow key={a.id} ask={a} onNavigate={onClose} pathname={pathname} />
          ))}
        </div>
      )}
      {listed.length > 0 && (
        <section aria-labelledby="asks-listed" style={{ marginTop: asking.length > 0 ? 16 : 0 }}>
          <h3 id="asks-listed" className="t-eyebrow" style={{ margin: "0 4px 8px" }}>
            For your information
          </h3>
          <div className="card" style={{ overflow: "hidden" }}>
            {listed.map((a) => (
              <AskRow key={a.id} ask={a} onNavigate={onClose} pathname={pathname} />
            ))}
          </div>
        </section>
      )}
      {effects.length > 0 && (
        <section aria-labelledby="asks-effects" style={{ marginTop: 16 }}>
          <h3 id="asks-effects" className="t-eyebrow" style={{ margin: "0 4px 8px" }}>
            In effect
          </h3>
          <div className="card" style={{ overflow: "hidden" }}>
            {effects.map((a) => (
              <AskRow key={a.id} ask={a} onNavigate={onClose} pathname={pathname} />
            ))}
          </div>
        </section>
      )}
    </Sheet>
  );
}

/**
 * A row whose link points at the page already open and asks that page for a
 * sheet answers in place: a same-route Link would only re-render the server
 * page, and the board reads its ?sheet= deep link on arrival. Today's
 * 'Yesterday: n musts open' row then opens Record yesterday the way the 'y'
 * shortcut does (RECORD_YESTERDAY_EVENT). Null: follow the link.
 */
export function inPlaceEventOf(href: string, pathname: string | null): string | null {
  return pathname === "/today" && href === RECORD_YESTERDAY_HREF ? RECORD_YESTERDAY_EVENT : null;
}

function AskRow({ ask, onNavigate, pathname }: { ask: ShellAsk; onNavigate: () => void; pathname: string | null }) {
  const inPlace = ask.href ? inPlaceEventOf(ask.href, pathname) : null;
  const body = (
    <>
      <span className={cx("ask-dot", ask.tone !== "ask" && ask.tone)} aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0, padding: "8px 0" }}>
        <b className="ink-0" style={{ display: "block" }}>
          {ask.title}
        </b>
        <div className="t-meta">{ask.detail}</div>
      </div>
      {ask.href && (
        <>
          {ask.action && (
            <span className="ink-1" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
              {ask.action}
            </span>
          )}
          <Icon name="chev" size={18} />
        </>
      )}
    </>
  );
  return ask.href ? (
    <Link
      href={ask.href}
      className="collapsed"
      onClick={(e) => {
        onNavigate();
        if (!inPlace) return;
        e.preventDefault();
        // After this sheet has begun closing, so the board's sheet takes the focus last.
        window.setTimeout(() => window.dispatchEvent(new Event(inPlace)), 0);
      }}
    >
      {body}
    </Link>
  ) : (
    <div className="collapsed">{body}</div>
  );
}
