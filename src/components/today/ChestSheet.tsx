"use client";

/**
 * The chest sheet (docs/life-plan/momentum.md §E.2; lane E): a bottom Sheet over the Momentum card's
 * chest button.
 *
 *   - Static chest art (120 × 120) in the owned trim, and a primary Open, full width, 44 px. Locked, it
 *     says what is left; it is never a meter.
 *   - The Odds disclosure: every figure from momentum.ts chestOdds (with today's Fair winds) and
 *     MOMENTUM.CHEST, plus the pity count ("rare in ≤ n").
 *   - Opened: one reveal of at most 1.6 s (the contents fade in; under Still they are simply there),
 *     with the exact contents ("+40 XP → Craft · +12 MP", "Freeze bank full · +8 MP"). A Common or
 *     Uncommon chest plays the T1 chime in the sheet (kind 'chest'); a Rare one the server's T2 Seal
 *     ('chest-rare', persisted by its detector). Then the next hook: "Run 12 → 13 tomorrow · freeze in 4 days".
 *   - Yesterday's chest, opened at the day's end by settleMomentum (receipt.auto), reveals only on a tap
 *     here; the device remembers it was revealed.
 *
 * Nothing opens by itself and nothing moves on arrival (ui-motion D10). The open action arrives as a prop.
 */
import { useRef, useState } from "react";
import type { Track } from "@/lib/life-types";
import type { ChestView, RunView } from "@/lib/momentum-server";
import type { ChestReceipt } from "@/lib/momentum";
import { chime } from "@/lib/celebrate";
import { presentAll } from "@/components/celebrate/stage";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { ChestGlyph, chestLinesOf, chestOddsLine, chestTierLabel, nextHookOf, pctFigure, type MomentumCardActions } from "./MomentumCard";

/** The odds disclosure (§E.2). Rendered open: the odds are published, not hidden behind a tap. */
export function ChestOdds({ chest }: { chest: Pick<ChestView, "odds" | "sinceRare" | "pityIn" | "rareBonus"> }) {
  return (
    <details className="mo-odds" open>
      <summary>Odds</summary>
      <p className="t-meta" data-odds="">
        {chestOddsLine(chest)}
      </p>
      {chest.rareBonus > 0 && <p className="t-meta">Fair winds: your plan quest is done, so a rare is {pctFigure(chest.odds.rare)}% today.</p>}
      <p className="t-meta">Each chest is sealed to its day: opening again, a retry or another device gives the same chest.</p>
    </details>
  );
}

/** An opened chest's contents, exactly. `reveal` fades them in once (≤ 1.6 s; none under Still). */
export function ChestContents({ receipt, track, reveal = false, hook }: { receipt: ChestReceipt; track?: Track | null; reveal?: boolean; hook?: string | null }) {
  return (
    <div className="mo-contents" data-reveal={reveal ? "" : undefined}>
      <p className="mo-tier">{chestTierLabel(receipt)}</p>
      <ul className="mo-lines">
        {chestLinesOf(receipt, track).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {hook && <p className="t-meta">{hook}</p>}
    </div>
  );
}

/** Today's chest: the art, then Open (ready), what is left (locked) or the contents (opened). */
export function ChestBody({
  chest,
  run,
  trim,
  opened,
  busy = false,
  error = null,
  onOpen,
}: {
  chest: ChestView;
  run: RunView;
  trim: string | null;
  /** The chest this sheet just opened (its reveal), else the view's stored receipt is shown. */
  opened?: { receipt: ChestReceipt; track: Track } | null;
  busy?: boolean;
  error?: string | null;
  onOpen?: () => void;
}) {
  const receipt = opened?.receipt ?? chest.receipt;
  const isOpen = receipt != null;
  return (
    <section className="mo-chestbody" aria-label="Today's chest">
      <div className="mo-art" data-state={isOpen ? "opened" : chest.state}>
        <ChestGlyph open={isOpen} trim={trim} size={120} />
      </div>
      {isOpen && receipt ? (
        <ChestContents receipt={receipt} track={opened?.track ?? chest.track} reveal={!!opened} hook={nextHookOf(run)} />
      ) : chest.state === "ready" ? (
        <>
          <p className="t-meta">Today&apos;s three are done.</p>
          <Button variant="primary" block onClick={onOpen} disabled={busy || !onOpen}>
            {busy ? "Opening…" : "Open"}
          </Button>
        </>
      ) : (
        <>
          <p className="t-meta">
            {`${chest.done} of ${chest.of} done. Finish Today's three to open it; missing it costs nothing.`}
          </p>
          <Button variant="primary" block disabled>
            Open
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="t-meta mo-error">
          {error}
        </p>
      )}
      <ChestOdds chest={chest} />
    </section>
  );
}

export function ChestSheet({
  open,
  onClose,
  chest,
  run,
  trim,
  yesterdayRevealed,
  onRevealYesterday,
  openChest,
}: {
  open: boolean;
  onClose: () => void;
  chest: ChestView;
  run: RunView;
  trim: string | null;
  yesterdayRevealed: boolean;
  onRevealYesterday: () => void;
  openChest: MomentumCardActions["openChest"];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ receipt: ChestReceipt; track: Track } | null>(null);
  const [revealedHere, setRevealedHere] = useState(false);
  const contentsRef = useRef<HTMLDivElement | null>(null);

  async function openToday() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await openChest({ refresh: true });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const v = res.value;
      setOpened({ receipt: v.receipt, track: v.track });
      // The server's moment (celebration-detect chestDraft): a Rare chest's T2 Seal (chest-rare, persisted) plays
      // through presentAll; a Common or Uncommon one's T1 chime (chest, 't1:chest:<day>') plays here, in the sheet.
      // A double tap returns no moment and plays nothing twice.
      presentAll(v.celebrations);
      const t1 = v.celebrations.find((e) => e.tier === 1 && e.kind === "chest");
      if (t1) {
        chime({ kind: "chest", id: t1.id, text: [t1.facts.eyebrow, t1.facts.title].filter(Boolean).join(" · "), say: t1.facts.say, sweepEl: contentsRef.current });
      } else if (!v.duplicate && v.receipt.tier !== "RARE" && !v.celebrations.some((e) => e.kind === "chest-rare")) {
        chime({ kind: "chest", id: `t1:chest:${v.day}`, text: `Chest · ${chestLinesOf(v.receipt, v.track).join(" · ")}`, sweepEl: contentsRef.current });
      }
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const y = chest.yesterday;
  return (
    <Sheet open={open} onClose={onClose} title={y && !yesterdayRevealed ? "Yesterday's chest" : "Today's chest"} description="Today's three open one chest a day">
      <div ref={contentsRef} className="mo-chestsheet">
        {y && (
          <section className="mo-yesterday" aria-label="Yesterday's chest">
            {yesterdayRevealed ? (
              <>
                <p className="mo-subhead">Yesterday&apos;s chest</p>
                <ChestContents receipt={y.receipt} reveal={revealedHere} />
              </>
            ) : (
              <>
                <div className="mo-art" data-state="ready">
                  <ChestGlyph trim={trim} size={120} />
                </div>
                <p className="t-meta">Yesterday&apos;s three were done, so its chest opened at the day&apos;s end. It is yours either way.</p>
                <Button
                  variant="primary"
                  block
                  onClick={() => {
                    setRevealedHere(true);
                    onRevealYesterday();
                  }}
                >
                  Reveal
                </Button>
              </>
            )}
          </section>
        )}
        {(!y || yesterdayRevealed) && <ChestBody chest={chest} run={run} trim={trim} opened={opened} busy={busy} error={error} onOpen={() => void openToday()} />}
      </div>
    </Sheet>
  );
}
