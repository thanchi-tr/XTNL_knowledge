"use client";

/**
 * A practice ("What to practise", F9, F18 §3; roadmap-rev4.md F-R4-13,
 * F-R4-18), in the row grammar of the UI motion round (lane R4; ui-motion.md
 * §3.3 screens 3 and 5, D26, D27):
 *
 *   [quest.practice in the plan's own sigil + ev.tick] Recall drills: Probability     ▸
 *   3× · 30 min ≈ 1 h 30/wk  (spoken "3× a week · 30 min ≈ 1 h 30/wk · worked out from your hours")
 *   [PromiseRing] 10/16 kept · On Today        (once started; from your ticks)
 *   ▸ How
 *   «Gemini's choice · not checked» or the app's mark
 *
 * The plan in the app's numbers keeps its words in the spoken twin and the
 * row's ▸ ("worked out from your hours", or "your numbers" once edited, when
 * the visible figure also carries [pv.you] "yours": the user's own figure,
 * D27). The "How" disclosure is code's plain procedure (a catalog type's own
 * lines, KIND_HOW; else METHOD_HOW). A catalog type says who chose it; on a
 * plan whose picks are choices (contracts §20), Gemini's pick reads its chip
 * and the row's ▸ holds how many options its stage offered and the app's
 * default.
 *
 * Health (D12): a card that shows the one «Not medical advice · ask a
 * professional» chip passes health="card" and its body rows drop their own
 * line; any other caller keeps HEALTH_LINE under each body session (the
 * default, so no surface ever loses it).
 *
 * A practice that takes turns with another, week about (contracts §20.12: a
 * stage whose room holds one practice where its role needs two), says so in
 * its own code words; the why (PRACTICE_TURN_LINE) is in its ▸, and its How
 * shows each week's kind. A started practice an answer touched says how it
 * stands, verbatim (the lead's ruling 3, roadmap-copy pauseRowLine): paused,
 * in place of its link; still on Today because its pause was refused, or back
 * by Undo, with its link; and, once its Practice kept no longer pays, that it
 * no longer counts toward the milestone, the AVOID lifted included.
 */
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { PromiseRing } from "@/components/ui/PromiseRing";
import { Mark } from "@/components/glyph/Glyph";
import { HonestyChip } from "@/components/glyph/HonestyChip";
import { practiceBandMinutes, provenanceOf } from "@/lib/roadmap-types";
import type { CatalogKey } from "@/lib/roadmap-catalog";
import {
  EDIT_NUMBERS_NOTE,
  HEALTH_LINE,
  KIND_HOW,
  KIND_NAME,
  METHOD_HOW,
  METHOD_WORD,
  PRACTICE_TURN_LINE,
  SHORT_EDIT_NUMBERS,
  SHORT_YOURS,
  geminiChoiceLine,
  hoursLabel,
  pauseRowLine,
  practicePlanLine,
  ruleWords,
  shortKept,
} from "./roadmap-copy";
import { todayTaskHref } from "./roadmap-links";
import { practiceTurnOf, type PausedItem } from "./roadmap-ui-model";
import { ItemRow, useGeminiChoice } from "./ItemRow";
import type { ActTarget } from "./ItemEditor";

/** The "How" lines of a practice: its catalog type's own (F-R4-18), else its method's. */
export function howLinesOf(it: { catalogKey?: CatalogKey | null; method: keyof typeof METHOD_HOW | null }): readonly string[] {
  if (it.catalogKey && KIND_HOW[it.catalogKey]?.length) return KIND_HOW[it.catalogKey];
  return it.method ? METHOD_HOW[it.method] : [];
}

/**
 * The "How" disclosure. A practice that takes turns with another (`turn`,
 * contracts §20.12) names each week's kind over its own steps, this one's
 * first.
 */
export function HowLines({ lines, turn }: { lines: readonly string[]; turn?: { first: string; second: string; lines: readonly string[] } | null }) {
  if (lines.length === 0) return null;
  const list = (ls: readonly string[]) => (
    <ol>
      {ls.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ol>
  );
  return (
    <details className="rm-how">
      <summary>
        <Icon name="chev" />
        How
      </summary>
      {turn && <p className="rm-how-k">{turn.first}</p>}
      {list(lines)}
      {turn && turn.lines.length > 0 && (
        <>
          <p className="rm-how-k">{turn.second}</p>
          {list(turn.lines)}
        </>
      )}
    </details>
  );
}

export function MethodHow({ method }: { method: keyof typeof METHOD_HOW }) {
  return <HowLines lines={METHOD_HOW[method]} />;
}

/**
 * The plan's figures in compact form: "3× · 30 min ≈ 1 h 30/wk" (§3.3 screen
 * 5). Every token is a figure or a unit (the word count exempts them); the
 * spoken twin is practicePlanLine's words. A rule other than n a week keeps
 * its words.
 */
export function compactPlanOf(rule: string | null, sessionsPerWeek: number | null, minutes: number | null): string {
  const t = rule?.trim().toUpperCase() ?? "";
  const perWeek = /^TARGET:(\d+)\/W$/.exec(t);
  const head = perWeek ? `${perWeek[1]}×` : ruleWords(rule);
  const mins = minutes ? ` · ${minutes} min` : "";
  return sessionsPerWeek && minutes ? `${head}${mins} ≈ ${hoursLabel(sessionsPerWeek * minutes, false)}/wk` : `${head}${mins}`;
}

export function PracticeRow({
  target,
  stage,
  kept,
  paused,
  today,
  health = "row",
}: {
  target: ActTarget;
  stage: "draft" | "outline" | "active" | "start";
  kept?: { kept: number; of: number } | null;
  /** An answer touched this started practice (roadmap-ui-model pausedItemsOf): how it stands; null when none did. */
  paused?: Pick<PausedItem, "day" | "offTarget" | "state" | "offToday"> | null;
  today?: string;
  /** "card": the card shows the one health chip (D12), so a body session drops its own HEALTH_LINE; "row" (default) keeps it. */
  health?: "row" | "card";
}) {
  const it = target.item;
  const minutes = it?.durationBand ? practiceBandMinutes(it.durationBand) : null;
  const plan = practicePlanLine(it?.rule ?? null, it?.sessionsPerWeek ?? null, minutes);
  const compact = compactPlanOf(it?.rule ?? null, it?.sessionsPerWeek ?? null, minutes);
  const yours = it?.planSource === "YOURS";
  const source = yours ? "your numbers" : "worked out from your hours";
  // Numbers yours, words still Gemini's (a plan-only edit): the row says both, the note one tap away (§8, D25).
  const cls = it ? provenanceOf(it.origin, it.decision) : null;
  const editedNumbers = yours && (cls === "DRAFT" || cls === "KEPT_SUGGESTION");
  const keptWords = kept ? `kept ${kept.kept} of ${kept.of} so far · from your ticks` : null;
  const linked = stage === "active" && it?.templateId && !paused?.offToday;
  const meta = (
    <>
      <span className="num" aria-hidden="true">
        {compact}
      </span>
      {yours && !editedNumbers && (
        <span className="rm-r4-yours" aria-hidden="true">
          <Mark glyph="pv.you" size={12} />
          {SHORT_YOURS}
        </span>
      )}
      <span className="sr-only">
        {plan} · {source}
      </span>
      {kept && (
        <span className="rm-r4-kept">
          <PromiseRing value={kept.kept} target={kept.of} size={28} label="kept so far, from your ticks" />
          <span className="num" aria-hidden="true">
            {shortKept(kept.kept, kept.of)}
          </span>
        </span>
      )}
      {linked && (
        <>
          {" · "}
          <Link className="rm-ilink" href={todayTaskHref(it.templateId!)}>
            On Today
          </Link>
        </>
      )}
    </>
  );
  const kindLabel = it?.method ? `Practice · ${METHOD_WORD[it.method]}` : "Practice";
  const how = it ? howLinesOf(it) : [];
  // The practice progression (contracts §20): Gemini's choice among its stage's options says how many there were and the app's default.
  const choice = useGeminiChoice(it, target.milestone);
  // A practice that takes turns with another, week about (§20.12): its words name both weeks; the ▸ says why, the How shows each.
  const turn = it ? practiceTurnOf(it) : null;
  const turnHow = turn && it?.catalogKey ? { first: KIND_NAME[it.catalogKey], second: KIND_NAME[turn], lines: KIND_HOW[turn] ?? [] } : null;
  return (
    <ItemRow
      target={target}
      stage={stage}
      kindLabel={kindLabel}
      meta={meta}
      why={choice && stage !== "outline" ? geminiChoiceLine(choice) : null}
      more={[`${plan} · ${source}`, keptWords, stage !== "outline" && turn ? PRACTICE_TURN_LINE : null]}
      chipsBefore={editedNumbers && stage !== "outline" ? <HonestyChip kind="edit-numbers" label={SHORT_EDIT_NUMBERS} full={EDIT_NUMBERS_NOTE} /> : null}
    >
      {stage === "active" && paused && (
        <p className="t-meta rm-ink1" data-wc="honest">
          {pauseRowLine(paused, today)}
        </p>
      )}
      {stage !== "outline" && <HowLines lines={how} turn={turnHow} />}
      {stage !== "outline" && health === "row" && it?.method === "WORKOUT" && <p className="rm-it-why">{HEALTH_LINE}</p>}
    </ItemRow>
  );
}
