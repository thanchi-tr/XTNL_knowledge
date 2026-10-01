"use client";

/**
 * FROZEN CONTRACT — the Asks bell and sheet (L0-foundation). Replaces the
 * floating NotificationBubble.
 *
 *   <AsksBell/>     top-bar icon button with an ink count (asks.count; nothing at 0)
 *   <AsksSheet open onClose items/>   the derived feed as rows: a tone diamond, the
 *                   title, one line of detail and the row's one action. The rows
 *                   that ask come first and are exactly the bell's count; the
 *                   boons and debuffs in effect follow under their own heading
 *                   and are not counted. The same feed renders as AskCards on
 *                   Today (L1). Nothing here expires: every row is a live fact
 *                   that disappears when it resolves.
 */
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { cx } from "@/components/ui/cx";
import { useShell } from "./shell-store";
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

export function AsksSheet({ open, onClose, items }: { open: boolean; onClose: () => void; items: ShellAsk[] }) {
  const asking = items.filter((a) => a.group !== EFFECTS_GROUP);
  const effects = items.filter((a) => a.group === EFFECTS_GROUP);
  return (
    <Sheet open={open} onClose={onClose} title="Asks" description="Things waiting on you, derived from the ledger. Nothing here expires." id="asks">
      {asking.length === 0 ? (
        <p className="t-meta" style={{ padding: "8px 4px" }}>
          Nothing is waiting on you right now.
        </p>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {asking.map((a) => (
            <AskRow key={a.id} ask={a} onNavigate={onClose} />
          ))}
        </div>
      )}
      {effects.length > 0 && (
        <section aria-labelledby="asks-effects" style={{ marginTop: 16 }}>
          <h3 id="asks-effects" className="t-eyebrow" style={{ margin: "0 4px 8px" }}>
            In effect
          </h3>
          <div className="card" style={{ overflow: "hidden" }}>
            {effects.map((a) => (
              <AskRow key={a.id} ask={a} onNavigate={onClose} />
            ))}
          </div>
        </section>
      )}
    </Sheet>
  );
}

function AskRow({ ask, onNavigate }: { ask: ShellAsk; onNavigate: () => void }) {
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
    <Link href={ask.href} className="collapsed" onClick={onNavigate}>
      {body}
    </Link>
  ) : (
    <div className="collapsed">{body}</div>
  );
}
