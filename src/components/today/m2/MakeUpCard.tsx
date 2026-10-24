"use client";

import "../today.css";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { CurrencyGlyph, Icon, Sigil, type TrackSigil } from "@/components/ui/Icon";
import { approx, formatAmount, formatNumber } from "@/components/ui/format";
import { MAKEUP_COUNTS_NOTE } from "@/lib/proof";
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
 *
 * Proof of work (blueprint P23, P24; P20), once in force: a deep-work must's
 * card asks for the minutes its make-up took and a reading must's for its
 * pages (the drawer's own 44 px chips), and Make up waits for them, as the
 * task's own tick does. The minimum version stays one tap. P20 review: Make
 * up shows no price until its picks are in, then the price of those minutes
 * (OwedProof.prices, the drawer's projection), never the estimate's.
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
  /**
   * Proof of work in force (duty-view OwedProof): the minute chips (with each one's price, P20 review), and a reading
   * must's page chips with its day target.
   */
  proof?: { minutes?: readonly number[]; prices?: readonly number[]; pages?: { target: number | null; chips: readonly number[] } } | null;
}

/** What a proof make-up reports with its tap (P20): the minutes it took, a reading must's pages, and the price the card showed for them. */
export interface MakeUpReport {
  minutes?: number;
  pages?: number;
  /** P20 review: the projected price shown on Make up for these picks (the flight's amount, the drift notice's 'about'). */
  price?: number;
}

/**
 * The price Make up shows (P20 review): the estimate's for a card with no minute chips; for one with them, null until
 * a pick (no price beside a disabled button), then that pick's own (OwedProof.prices; the estimate's if unpriced).
 */
export function makeUpShownPriceOf(item: Pick<MakeUp, "makeUpPrice" | "proof">, minutes: number | null): number | null {
  const chips = item.proof?.minutes;
  if (!chips) return item.makeUpPrice;
  if (minutes == null) return null;
  const at = chips.indexOf(minutes);
  return at >= 0 && item.proof?.prices && item.proof.prices[at] != null ? item.proof.prices[at] : item.makeUpPrice;
}

/** The proof chips' note: what the make-up still needs, in plain words (never a reproach). */
function proofNoteOf(proof: NonNullable<MakeUp["proof"]>, minutes: number | null, pages: number | null): string {
  const needs: string[] = [];
  if (proof.minutes && minutes == null) needs.push("the minutes it took");
  if (proof.pages && proof.pages.target != null && (pages == null || pages < proof.pages.target)) needs.push(`at least ${pageWord(proof.pages.target)}`);
  // What the server counts (P20 review): the minutes' clamp and clock bound, or a reading must's pages as reported.
  if (needs.length === 0) return proof.minutes ? MAKEUP_COUNTS_NOTE : "Its pages count as you report them, the same as its tick.";
  return `Like its tick, its make-up counts its ${proof.minutes ? "time" : "pages"}: pick ${needs.join(" and ")}.`;
}

const pageWord = (n: number) => `${n} page${n === 1 ? "" : "s"}`;

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
  /** A proof make-up passes what its chips picked (MakeUpReport); any other passes nothing. */
  onMakeUp?: (from: Element | null, report?: MakeUpReport) => void;
  onMinimum?: (from: Element | null) => void;
  /** M2: the quiet third action, only when Settings › Days allows it and the debt is ≥ 14 days old. */
  onAcceptLoss?: () => void;
  busy?: boolean;
  /** Rendered under the card (the miss prompt). */
  children?: ReactNode;
}) {
  // The words are makeup-words.ts (pure, held by today-ui-check); the chips' glyphs are here.
  const words = makeUpWordsOf(item, state);
  // Proof of work (P20): the chips' picks, and whether Make up has what its tick would need.
  const [minutes, setMinutes] = useState<number | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  const proof = item.proof ?? null;
  const proofReady = !proof || ((!proof.minutes || minutes != null) && (!proof.pages || proof.pages.target == null || (pages != null && pages >= proof.pages.target)));
  const shown = makeUpShownPriceOf(item, minutes);
  const report: MakeUpReport | undefined = proof
    ? { ...(minutes != null ? { minutes } : {}), ...(pages != null ? { pages } : {}), ...(shown != null ? { price: shown } : {}) }
    : undefined;
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
        {state === "open" && onMakeUp && proof && (
          <div className="mu-proof">
            {proof.pages && (
              <div className="today-drawer-row" role="group" aria-label="Pages read" data-chips="pages">
                {proof.pages.chips.map((n) => (
                  <button key={n} type="button" className="today-pill num" aria-pressed={pages === n} disabled={busy} onClick={() => setPages(pages === n ? null : n)}>
                    {pageWord(n)}
                  </button>
                ))}
              </div>
            )}
            {proof.minutes && (
              <div className="today-drawer-row" role="group" aria-label="Minutes it took" data-chips="minutes">
                {proof.minutes.map((m) => (
                  <button key={m} type="button" className="today-pill num" aria-pressed={minutes === m} disabled={busy} onClick={() => setMinutes(minutes === m ? null : m)}>
                    {m} min
                  </button>
                ))}
              </div>
            )}
            <p className="mu-sub" data-proof="1">
              {proofNoteOf(proof, minutes, pages)}
            </p>
          </div>
        )}
        {state === "open" && (onMakeUp || onMinimum) && (
          <div className="acts">
            {onMakeUp && (
              <Button variant="secondary" disabled={busy || !proofReady} onClick={(e) => onMakeUp(e.currentTarget, report)}>
                {shown != null && proofReady ? (
                  <>
                    Make up ·{" "}
                    <span className="cur">
                      <CurrencyGlyph kind="xp" />
                      <span className="num">{approx(shown)}</span>
                    </span>
                  </>
                ) : (
                  "Make up"
                )}
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
