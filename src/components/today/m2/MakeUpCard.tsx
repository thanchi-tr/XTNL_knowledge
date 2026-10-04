"use client";

import "../today.css";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { CurrencyGlyph, Icon, Sigil, type TrackSigil } from "@/components/ui/Icon";
import { approx, formatAmount, formatNumber } from "@/components/ui/format";
import { makeUpWordsOf, type MakeUpState } from "./makeup-words";

/**
 * M2 (presentational): Today renders these from BoardData.duty (lane D,
 * F12); /dev/style/today renders them from fixtures. Never made-up numbers.
 *
 * MakeUpCard: a 3 px owed rail, the owed chip ("−3.8 owed"), when it was
 * missed ("Stretch · Tuesday"), one plain sentence and the 48 h window.
 * Actions: [Make up · ≈ 3.2] [Do minimum · 2 min · ≈ 1.1]. Resolved, the rail
 * turns kept ("Made up. Nothing owed.", repaid in full) or held (minimum).
 * Written off ('Accept the loss'), the rail goes quiet with a quiet chip
 * and "Written off. The miss stays on the ledger.": nothing was repaid, so
 * it never reads 'Repaid'. Debt is a true minus, never a red wall.
 */
export type { MakeUpState };

export interface MakeUp {
  id: string;
  /** What is owed, as a positive amount of life XP. */
  owed: number;
  /** "Stretch · Tuesday". */
  when: string;
  text: string;
  /** "Make it up before Fri 04:00 and its 12-day streak comes back." */
  window: string;
  makeUpPrice: number;
  minimum?: { label: string; price: number } | null;
  /** Resolved lines (the outcome's own words). `writtenOff` absent: makeup-words.ts WRITTEN_OFF_SUB. */
  resolved?: { repaid: string; minimum: string; writtenOff?: string };
}

export function MakeUpCard({
  item,
  state = "open",
  onMakeUp,
  onMinimum,
  onAcceptLoss,
  busy,
  children,
}: {
  item: MakeUp;
  state?: MakeUpState;
  onMakeUp?: (from: Element | null) => void;
  onMinimum?: (from: Element | null) => void;
  /** M2: the quiet third action, only when Settings › Days allows it and the debt is ≥ 14 days old. */
  onAcceptLoss?: () => void;
  busy?: boolean;
  /** Rendered under the card (the miss prompt). */
  children?: ReactNode;
}) {
  // The words are makeup-words.ts (pure, held by today-ui-check); the chips' glyphs are here.
  const words = makeUpWordsOf(item, state);
  const chip =
    words.chip === "repaid" ? (
      <Chip tone="kept" icon="check">
        Repaid {formatNumber(item.owed, 1)}
      </Chip>
    ) : words.chip === "minimum" ? (
      <Chip tone="held" held="rest">
        Held · minimum
      </Chip>
    ) : words.chip === "written-off" ? (
      <Chip>Written off</Chip>
    ) : (
      <Chip tone="owed">{formatAmount(-item.owed)} owed</Chip>
    );
  return (
    <>
      <div className="makeup" data-state={state === "open" ? undefined : state} data-instance-id={item.id}>
        <div className="mh">
          {chip}
          <span className="when">{item.when}</span>
        </div>
        <p className="mu-text">{words.text}</p>
        <p className="mu-sub">{words.sub}</p>
        {state === "open" && (onMakeUp || onMinimum) && (
          <div className="acts">
            {onMakeUp && (
              <Button variant="secondary" disabled={busy} onClick={(e) => onMakeUp(e.currentTarget)}>
                Make up ·{" "}
                <span className="cur">
                  <CurrencyGlyph kind="xp" />
                  <span className="num">{approx(item.makeUpPrice)}</span>
                </span>
              </Button>
            )}
            {onMinimum && item.minimum && (
              <Button variant="quiet" disabled={busy} onClick={(e) => onMinimum(e.currentTarget)}>
                Do minimum · {item.minimum.label} · {approx(item.minimum.price)}
              </Button>
            )}
            {onAcceptLoss && (
              <Button variant="quiet" disabled={busy} onClick={onAcceptLoss}>
                Accept the loss
              </Button>
            )}
          </div>
        )}
      </div>
      {children}
    </>
  );
}

/**
 * Stacked debts collapse into ONE summary card ("−15.1 owed · 3 musts ·
 * Tuesday") that expands to the make-up cards. Never a red wall.
 */
export function OwedSummary({
  total,
  count,
  when,
  text,
  sub,
  children,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
}: {
  total: number;
  count: number;
  when: string;
  text: string;
  sub: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Controlled (M2: the Owed row opens it from the foot of the board). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [own, setOwn] = useState(defaultOpen);
  const open = openProp ?? own;
  const setOpen = (next: (o: boolean) => boolean) => {
    const v = next(open);
    if (openProp === undefined) setOwn(v);
    onOpenChange?.(v);
  };
  return (
    <div className="owed-stack">
      <div className="makeup">
        <div className="mh">
          <Chip tone="owed">{formatAmount(-total)} owed</Chip>
          <span className="when">{when}</span>
        </div>
        <p className="mu-text">{text}</p>
        <p className="mu-sub">{sub}</p>
        <div className="acts">
          <Button variant="secondary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : `Show all ${count}`}
          </Button>
        </div>
      </div>
      {open && children}
    </div>
  );
}

/** The collapsed "Owed: n · −x" row at the foot of the lanes; tapping it goes to the cards. */
export function OwedRow({ count, total, onOpen, track = "duty" }: { count: number; total: number; onOpen: () => void; track?: TrackSigil }) {
  if (count <= 0) return null;
  return (
    <button type="button" className="card owed-sum" onClick={onOpen}>
      <Sigil track={track} />
      <b>Owed: {count}</b>
      <Chip tone="owed">{formatAmount(-total)} owed</Chip>
      <Icon name="chev" size={16} className="ink-2" />
    </button>
  );
}
