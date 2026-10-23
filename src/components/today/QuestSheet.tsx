"use client";

/**
 * The Quest sheet (docs/life-plan/momentum.md §E.1; lane E), opened from a pip of Today's three.
 *
 * Three rows (≥ 56 px), each with its icon, the full title, why it was picked ("Your biggest due task
 * · ≈ 23 XP": the row's own price, already on the board, never a total), its state, Go (seeks the
 * task's row on the board, opens Train › Exercise, the roadmap, Review or capture) and Swap with the
 * count left (the task quest once a day, twice with Second look; the plan quest once with Scout; a
 * done quest never). Footer: "1 of 3 keeps your run · 3 of 3 opens the chest".
 *
 * Credits (blueprint P16): once CREDITS_LAUNCH_DAY is in force each row carries its price tag ("+10 cr", "+10 cr
 * earned" once done on a day whose set is fixed) and the footer says what 3 of 3 adds; while it is null `credits` is
 * null and nothing here changes. A preview (no QUEST_SET row yet, `frozen` false) never says "earned": the wallet
 * counts a day only once its set is written, and the set fixed later may differ from the preview.
 *
 * The swap action arrives as a prop (TodayBoard passes actions/momentum swapQuest).
 */
import { useState } from "react";
import Link from "next/link";
import type { QuestView } from "@/lib/momentum-server";
import type { QuestSlot } from "@/lib/momentum";
import type { CreditTags } from "@/lib/credits";
import { seekTemplate } from "@/components/roadmap/roadmap-events";
import { ROADMAP_CHECKPOINT_HREF } from "@/components/roadmap/roadmap-links";
import { openCapture } from "@/components/capture/events";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { IDEAS_HREF } from "./due-elsewhere";
import { fmtXp } from "./format";
import { SLOT_NAME, SlotGlyph, type MomentumCardActions } from "./MomentumCard";

/** Why a quest was picked, with the board's own "≈ N XP" on an open task quest. */
export function questWhyOf(q: QuestView, prices: Readonly<Record<string, number>>): string {
  const why = q.quest.why ?? "";
  if (q.quest.kind !== "TEMPLATE" || q.done) return why;
  const price = prices[q.quest.templateId];
  return price != null && price > 0 ? `${why}${why ? " · " : ""}≈ ${fmtXp(price)} XP` : why;
}

/** Where Go leads: a template seeks its row on the board; the rest open their own place. */
export type QuestGo = { kind: "seek"; templateId: string } | { kind: "href"; href: string } | { kind: "capture" } | { kind: "lanes" };

export function questGoOf(q: QuestView): QuestGo {
  const x = q.quest;
  switch (x.kind) {
    case "TEMPLATE":
      return { kind: "seek", templateId: x.templateId };
    case "MOVE":
      return { kind: "href", href: "/train/exercise" };
    case "CHECKPOINT":
      return { kind: "href", href: ROADMAP_CHECKPOINT_HREF };
    case "REVIEWS":
      return { kind: "href", href: IDEAS_HREF };
    case "ADD":
    case "IDEA":
      return { kind: "capture" };
    case "ANY":
      return { kind: "lanes" };
  }
}

export const QUEST_FOOTER = "1 of 3 keeps your run · 3 of 3 opens the chest";

/**
 * A quest row's price tag once credits count (blueprint P16): '+10 cr' while open, '+10 cr earned' once done on a day
 * whose set is fixed (an undo takes it back). On a preview (`frozen` false: the day's set isn't written yet, so the
 * wallet counts nothing for it) a done row keeps the plain '+10 cr': never "earned" for credits the wallet won't count.
 * Null while credits are off: no tag at all.
 */
export function questCreditTagOf(q: Pick<QuestView, "done">, credits: CreditTags | null | undefined, frozen = false): string | null {
  if (!credits) return null;
  return q.done && frozen ? `${credits.quest} earned` : credits.quest;
}

/**
 * The footer's credits line once credits count: 'Each done adds +10 cr · 3 of 3 adds +10 cr when the chest opens'; on a
 * preview it adds that credits count once the day's set is fixed. Null while off.
 */
export function questCreditFootOf(credits: CreditTags | null | undefined, frozen = true): string | null {
  if (!credits) return null;
  const line = `Each done adds ${credits.quest} · 3 of 3 adds ${credits.threeOfThree} when the chest opens`;
  return frozen ? line : `${line} · credits count once the day's set is fixed`;
}

export function QuestRows({
  quests,
  prices,
  focus = null,
  busy = null,
  onGo,
  onSwap,
  credits = null,
  frozen = false,
}: {
  quests: readonly QuestView[];
  prices: Readonly<Record<string, number>>;
  focus?: QuestSlot | null;
  busy?: QuestSlot | null;
  onGo?: (q: QuestView) => void;
  onSwap?: (q: QuestView) => void;
  /** Today's credit tags (credits.ts creditTagsOn); null while credits are off, so the rows are exactly as before. */
  credits?: CreditTags | null;
  /** The day's set is written (MomentumView.frozen): only then does a done row say "earned". */
  frozen?: boolean;
}) {
  return (
    <ul className="mo-qrows">
      {quests.map((q) => {
        const go = questGoOf(q);
        const tag = questCreditTagOf(q, credits, frozen);
        return (
          <li key={q.slot} className="mo-qrow" data-focus={focus === q.slot ? "" : undefined} data-done={q.done ? "" : undefined}>
            <SlotGlyph slot={q.slot} />
            <div className="mo-qtext">
              <span className="mo-qslot t-eyebrow">
                {SLOT_NAME[q.slot]} · {q.done ? "done" : "open"}
              </span>
              <b>{q.quest.title}</b>
              <span className="t-meta">{questWhyOf(q, prices)}</span>
              {tag && (
                <span className="mo-cr" data-done={q.done ? "" : undefined}>
                  {tag}
                </span>
              )}
            </div>
            <div className="mo-qacts">
              {!q.done &&
                (go.kind === "href" ? (
                  <Button variant="secondary" href={go.href}>
                    Go
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => onGo?.(q)}>
                    Go
                  </Button>
                ))}
              {!q.done && q.swapsLeft > 0 && (
                <Button variant="quiet" onClick={() => onSwap?.(q)} disabled={busy !== null}>
                  {busy === q.slot ? "Swapping…" : `Swap · ${q.swapsLeft} left`}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function QuestSheet({
  open,
  onClose,
  focus,
  quests,
  prices,
  frozen,
  swap,
  credits = null,
}: {
  open: boolean;
  onClose: () => void;
  focus: QuestSlot | null;
  quests: readonly QuestView[];
  prices: Readonly<Record<string, number>>;
  frozen: boolean;
  swap: MomentumCardActions["swapQuest"];
  /** Today's credit tags; null while credits are off. */
  credits?: CreditTags | null;
}) {
  const [busy, setBusy] = useState<QuestSlot | null>(null);
  const [error, setError] = useState<string | null>(null);

  function go(q: QuestView) {
    const where = questGoOf(q);
    onClose();
    // After the sheet has handed focus back, so the seek's flash and focus land on the row.
    window.setTimeout(() => {
      if (where.kind === "seek") seekTemplate(where.templateId);
      else if (where.kind === "capture") openCapture({ mode: "idea" });
      else if (where.kind === "lanes") document.querySelector('[data-tour="today-lanes"]')?.scrollIntoView({ block: "start" });
    }, 0);
  }

  async function swapOne(q: QuestView) {
    if (busy) return;
    setBusy(q.slot);
    setError(null);
    try {
      const res = await swap(q.slot, { refresh: true });
      if (!res.ok) setError(res.error);
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Today's three" description={frozen ? "Picked once for the day from what is due" : "A preview: the day's set is fixed once it is written"}>
      <QuestRows quests={quests} prices={prices} focus={focus} busy={busy} onGo={go} onSwap={(q) => void swapOne(q)} credits={credits} frozen={frozen} />
      {error && (
        <p role="alert" className="t-meta mo-error">
          {error}
        </p>
      )}
      <p className="t-meta mo-qfoot">{QUEST_FOOTER}</p>
      {credits && (
        <p className="t-meta">
          {questCreditFootOf(credits, frozen)}.{" "}
          <Link className="link" href="/today/rules#credits">
            How credits work
          </Link>
        </p>
      )}
      <p className="t-meta">
        <Link className="link" href="/today/rules#momentum">
          How Today&apos;s three are picked
        </Link>
      </p>
    </Sheet>
  );
}
