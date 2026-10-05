"use client";

/**
 * A practice ("What to practise", F9, F18 §3; roadmap-rev4.md F-R4-13,
 * F-R4-18): the method chip, its plan in the app's numbers ("3× a week · 30
 * min ≈ 1 h 30/wk · worked out from your hours", or "your numbers" once
 * edited), the "How" disclosure in code's plain procedure (a catalog type's
 * own lines, KIND_HOW; else METHOD_HOW), and once started what was kept
 * "from your ticks" with a link to the task on Today. A catalog type says who
 * chose it ("practice type picked by Gemini from the app's list", "added by
 * the app", "you chose this"); on a plan whose picks are choices (contracts
 * §20), Gemini's pick reads "Gemini's choice among the app's options", with
 * how many options its stage offered and the app's default under it. A body
 * session always carries HEALTH_LINE.
 * A practice that takes turns with another, week about (contracts §20.12:
 * a stage whose room holds one practice where its role needs two), says so
 * in its own code words; a short line under it says why (PRACTICE_TURN_LINE),
 * and its How shows each week's kind.
 * A started practice an answer touched says how it stands (the lead's
 * ruling 3, roadmap-copy pauseRowLine): paused, in place of its link; still
 * on Today because its pause was refused, or back by Undo, with its link;
 * and, once its Practice kept no longer pays, that it no longer counts
 * toward the milestone, the AVOID lifted included.
 */
import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { practiceBandMinutes } from "@/lib/roadmap-types";
import type { CatalogKey } from "@/lib/roadmap-catalog";
import { HEALTH_LINE, KIND_HOW, KIND_NAME, METHOD_HOW, METHOD_WORD, PRACTICE_TURN_LINE, geminiChoiceLine, pauseRowLine, practicePlanLine } from "./roadmap-copy";
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

export function PracticeRow({
  target,
  stage,
  kept,
  paused,
  today,
}: {
  target: ActTarget;
  stage: "draft" | "outline" | "active" | "start";
  kept?: { kept: number; of: number } | null;
  /** An answer touched this started practice (roadmap-ui-model pausedItemsOf): how it stands; null when none did. */
  paused?: Pick<PausedItem, "day" | "offTarget" | "state" | "offToday"> | null;
  today?: string;
}) {
  const it = target.item;
  const minutes = it?.durationBand ? practiceBandMinutes(it.durationBand) : null;
  const plan = practicePlanLine(it?.rule ?? null, it?.sessionsPerWeek ?? null, minutes);
  const source = it?.planSource === "YOURS" ? "your numbers" : "worked out from your hours";
  const meta = (
    <>
      {plan} · {source}
      {kept && (
        <>
          {" · kept "}
          <b>
            {kept.kept} of {kept.of}
          </b>
          {" so far · from your ticks"}
        </>
      )}
      {stage === "active" && it?.templateId && !paused?.offToday && (
        <>
          {" · "}
          <Link className="rm-ilink" href={todayTaskHref(it.templateId)}>
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
  // A practice that takes turns with another, week about (§20.12): its words name both weeks; the line says why, the How shows each.
  const turn = it ? practiceTurnOf(it) : null;
  const turnHow = turn && it?.catalogKey ? { first: KIND_NAME[it.catalogKey], second: KIND_NAME[turn], lines: KIND_HOW[turn] ?? [] } : null;
  return (
    <ItemRow
      target={target}
      stage={stage}
      kindLabel={kindLabel}
      meta={meta}
      why={choice && stage !== "outline" ? geminiChoiceLine(choice) : null}
      chipsBefore={it?.method && stage !== "outline" ? <Chip>{METHOD_WORD[it.method]}</Chip> : null}
    >
      {stage === "active" && paused && <p className="t-meta rm-ink1">{pauseRowLine(paused, today)}</p>}
      {stage !== "outline" && turn && <p className="rm-it-why">{PRACTICE_TURN_LINE}</p>}
      {stage !== "outline" && <HowLines lines={how} turn={turnHow} />}
      {stage !== "outline" && it?.method === "WORKOUT" && <p className="rm-it-why">{HEALTH_LINE}</p>}
    </ItemRow>
  );
}
