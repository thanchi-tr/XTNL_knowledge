"use client";

/**
 * FROZEN CONTRACT — the Asks bell and sheet (L0-foundation). Replaces the
 * floating NotificationBubble.
 *
 *   <AsksBell/>     top-bar icon button with an ink count (asks.count; nothing at 0)
 *   <AsksSheet open onClose items/>   the derived feed as rows: a tone diamond, the
 *                   title, one line of detail and the row's one action. The same
 *                   feed renders as AskCards on Today (L1). Nothing here expires:
 *                   every row is a live fact that disappears when it resolves.
 */
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { cx } from "@/components/ui/cx";
import { useShell } from "./shell-store";
import type { ShellAsk } from "./shell-types";

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
  return (
    <Sheet open={open} onClose={onClose} title="Asks" description="Things waiting on you, derived from the ledger. Nothing here expires." id="asks">
      {items.length === 0 ? (
        <p className="t-meta" style={{ padding: "8px 4px" }}>
          Nothing is waiting on you right now.
        </p>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {items.map((a) => (
            <AskRow key={a.id} ask={a} onNavigate={onClose} />
          ))}
        </div>
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
