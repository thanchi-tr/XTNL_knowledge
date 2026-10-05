"use client";

/**
 * "Is this realistic?" for one milestone (F4, F9 Checks panel, decision 6;
 * ui-motion.md §3.3 screen 3, lane R5). Never beside the aim, and no
 * plan-level verdict chip exists. Fewer words, the same facts:
 *
 *   Targets vs your pace  "[ev.tested] Targets" and a verdict chip per target: a fitted target reads
 *                         "Fitted" (its arithmetic in the (i)); a typed one Fits, Tight, Over or Impossible.
 *   App-tracked time      CapacityGauge "need ≈ 3 h 20 · have ≈ 4 h 30 /wk" with the worst week's verdict
 *                         chip ("Unverified · Fits" while capacity calibrates); «38% sized by Gemini» beside
 *                         it when Gemini sized part of the tracked time.
 *   (i)                   one per panel (the capacity (i)): every sentence the panel said before, verbatim,
 *                         the fixed line (TIME_FIXED_LINE) included, always.
 *   Aim check             «Aim not checked» (its line one tap away) and Add a figure; a checked aim keeps
 *                         its line.
 *
 * A "Why" sheet lists every input with what kind of number it is, the policy
 * constants, and the remedies as one-tap buttons. Ink only; never red.
 * VerdictChip is glyph/HonestyChip's: a verdict glyph sits only in a verdict chip (D27).
 */
import Link from "next/link";
import { useState } from "react";
import { ChipButton } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { ActionError } from "@/components/home/ActionError";
import { CapacityGauge } from "@/components/glyph/CapacityGauge";
import { Glyph } from "@/components/glyph/Glyph";
import { Chips, HonestyChip, VerdictChip as GlyphVerdictChip } from "@/components/glyph/HonestyChip";
import { InfoTip } from "@/components/glyph/InfoTip";
import {
  CARD_WRITE_MIN,
  INTENSITY,
  KEEP_SHARE,
  PRACTICE_BUDGET_SHARE,
  RAMP_ALLOWANCE,
  RAMP_FLOOR_MIN,
  REVIEW_SECONDS,
  floorStrict,
  type AimCheck,
  type Intensity,
  type KnowledgeCheck,
  type MilestoneFeasibility,
  type Remedy,
  type Throughput,
  type TimeCheck,
} from "@/lib/roadmap-types";
import {
  AIM_UNCHECKED_LINE,
  INTENSITY_WORD,
  SHORT_HAVE,
  SHORT_NEED,
  SHORT_YOURS,
  TIME_FIXED_LINE,
  aimCheckLine,
  dayLabel,
  dayWithWeekday,
  hoursLabel,
  plural,
  shortSizedByGemini,
  verdictWord,
  whyTitle,
} from "./roadmap-copy";
import { ROADMAP_NEW_HREF } from "./roadmap-links";
import { capacityFlagsOf, realismFlagsOf } from "./roadmap-ui-model";
import { useRoadmapAction } from "./roadmap-runtime";
import { AddFigureLink } from "./AimFigure";
import { sizedSentence } from "./ThroughputPanel";

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * A verdict chip: a word and a glyph, never colour alone (glyph/HonestyChip's VerdictChip, D27):
 * "Unverified · Fits" adds v.unv while capacity calibrates; Fitted and Impossible are never unverified.
 */
export function VerdictChip({ verdict, unverified }: { verdict: KnowledgeCheck["verdict"] | TimeCheck["verdict"]; unverified?: boolean }) {
  return <GlyphVerdictChip verdict={verdict} unverified={unverified} word={verdictWord(verdict, unverified)} />;
}

/**
 * The engine's own lines that explain a target its formula doesn't give
 * today (fix round 2's carry-over): "Kept at 15, so …" (the never-falls
 * floor held it up) and "Worked out at 20 on an earlier day; with today's
 * figures it would be 19". The panel shows them under the sentence.
 */
export function knowledgeNotesOf(k: Pick<KnowledgeCheck, "basis">): string[] {
  return k.basis.filter((b) => /^(Kept at|Worked out at)\b/.test(b));
}

/**
 * "Targets vs your pace" in words, from the engine's own figures. A FITTED
 * target's sentence is the engine's own formula line (k.basis: "Fitted at
 * Steady: 12 now, plus 70% of the ≈ 10 more … = 19"), so its sum is true even
 * when the stored target differs (a raised floor, a draft re-judged later):
 * the reason then follows as knowledgeNotesOf's line, never "= <target>".
 * `asOf` "then": figures taken at Start, read on a later day.
 */
export function knowledgeSentence(k: KnowledgeCheck, ctx: { intensity: Intensity; dueDay: string | null; m: number; today?: string; asOf?: "now" | "then" }): string {
  const due = ctx.dueDay ? dayLabel(ctx.dueDay, ctx.today) : "its due day";
  const exp = Math.floor(k.expected);
  const best = Math.floor(k.best);
  const calib = k.bestCase ? " Best case — your pass rate is still calibrating." : "";
  const when = ctx.asOf ?? "now";
  switch (k.verdict) {
    case "FITTED": {
      const formula = k.basis.find((b) => b.startsWith("Fitted at"));
      const more = Math.max(0, Math.round(k.expected - k.baseline));
      const sum = formula
        ? (when === "then" ? formula.replace(/: (\d+) now,/, ": $1 then,") : formula).replace(/\.?$/, ".")
        : knowledgeNotesOf(k).length > 0
          ? `Fitted at ${INTENSITY_WORD[ctx.intensity]}: ${k.baseline} ${when}, plus ${pct(INTENSITY[ctx.intensity])} of the ≈ ${more} more your reviews can be expected to bring to level ${k.level} by ${due}.`
          : `Fitted at ${INTENSITY_WORD[ctx.intensity]}: ${k.baseline} ${when}, plus ${pct(INTENSITY[ctx.intensity])} of the ≈ ${more} more your reviews can be expected to bring to level ${k.level} by ${due} = ${k.target}.`;
      return `${sum} Best case ${best}, if every review passes on its day.${calib}`;
    }
    case "FITS":
      return `${k.target} is within the ≈ ${exp} your reviews can be expected to bring to level ${k.level} by ${due}.${calib}`;
    case "TIGHT":
      return `Only in the best case: your reviews can be expected to bring about ${exp} to level ${k.level} by ${due}; ${best} if every review passes on its day.`;
    case "OVER":
      return `Beyond the best case: even if every review passes on its day, about ${best} reach level ${k.level} by ${due}.`;
    case "IMPOSSIBLE":
      return `The app can't show ${k.target} cards at level ${k.level} by ${due}: a new card needs at least ${floorStrict(k.level, ctx.m)} days to get there here, and only ${Math.floor(k.strictMax)} of your cards can make it in time. Move the date or use a lower level.`;
  }
}

/** "Worst week needs ≈ 3 h 20; you have ≈ 4 h 30." */
export function timeSentence(t: TimeCheck): string {
  const w = t.worstWeek;
  if (!w) return "No tracked load in this window.";
  const load = w.reviewMin + w.writeMin + w.practiceMin;
  if (w.availableMin == null) return `Worst week needs ${hoursLabel(load)}; your available time is still calibrating.`;
  return `Worst week needs ${hoursLabel(load)}; you have ${hoursLabel(w.availableMin)}${w.availableClass === "YOURS" ? " (from the hours you gave, unverified)" : ""}.`;
}

/** A remedy as a one-tap button's words. */
export function remedyWord(r: Remedy, mf: MilestoneFeasibility | null, today?: string): string {
  if (r === "MOVE_DATE") {
    const earliest = mf?.knowledge.find((k) => k.earliestDay)?.earliestDay;
    return earliest ? `Move the date to ${dayWithWeekday(earliest, today)}` : "Move the date to the earliest that fits";
  }
  if (r === "REFIT_LIGHT") return "Re-fit at Light";
  // Revision 4: a depth plan's date offer (the lower depth is its own sheet, never a remedy button).
  if (r === "USE_REALISTIC_DATE") return "Use the realistic date";
  if (r === "LOWER_DEPTH") return "Choose a lower depth…";
  return "Move the last milestones to Later";
}

export function RemedyButtons({ roadmapId, remedies: all, mf, today }: { roadmapId: string; remedies: readonly Remedy[]; mf: MilestoneFeasibility | null; today?: string }) {
  const { run, pending, error } = useRoadmapAction();
  // LOWER_DEPTH is never applied as a remedy: only its own sheet's explicit tap lowers a depth (the Date block offers it).
  const remedies = all.filter((r) => r !== "LOWER_DEPTH");
  if (remedies.length === 0) return null;
  return (
    <>
      <div className="rm-acts">
        {remedies.map((r) => (
          <ChipButton key={r} disabled={pending} onClick={() => run((a) => a.applyRemedy(roadmapId, r))}>
            {remedyWord(r, mf, today)}
          </ChipButton>
        ))}
      </div>
      {error && <ActionError>{error}</ActionError>}
    </>
  );
}

export function ChecksPanel({
  roadmapId,
  mf,
  aimCheck,
  intensity,
  dueDay,
  m,
  today,
  title,
  throughput,
  hoursPerWeek,
  intakeEditable = true,
  asOf = null,
}: {
  roadmapId: string | null;
  mf: MilestoneFeasibility | null;
  aimCheck: AimCheck | null;
  intensity: Intensity;
  dueDay: string | null;
  m: number;
  today: string;
  /** "Milestone 1" for the Why sheet's title. */
  title: string;
  throughput: Throughput | null;
  hoursPerWeek: number;
  /** The intake can still be edited (a DRAFT): "Add a figure" links to its Reality check; otherwise it opens the figure sheet (setAimFigure). */
  intakeEditable?: boolean;
  /**
   * Whose figures these are (fix round 2's carry-over): a started milestone's
   * Start snapshot ("Worked out at Start on 21 Dec", figures "then"), or the
   * acceptance's ("as accepted on 4 Oct"). Absent: a draft's, worked out today.
   */
  asOf?: { kind: "START" | "ACCEPTED"; day: string } | null;
}) {
  const [why, setWhy] = useState(false);
  const asOfWhen = asOf?.kind === "START" ? "then" : "now";
  const unverified = mf ? capacityFlagsOf(mf.time).unverified : false;
  const gauge = mf ? gaugeOf(mf.time) : null;
  const sized = realismFlagsOf({ throughput }).sizedByGemini;
  return (
    <div className="rm-ms-sec rm-ck2">
      {asOf && <p className="rm-cap rm-ck2-as">{asOf.kind === "START" ? `worked out at Start on ${dayLabel(asOf.day, today)}` : `as accepted on ${dayLabel(asOf.day, today)}`}</p>}
      {!mf && <p className="t-meta">The checks run once the plan has dates.</p>}
      {mf && mf.knowledge.length > 0 && (
        <div className="rm-ck2-k">
          <Glyph name="ev.tested" size={16} inherit />
          <span>Targets</span>
          {mf.knowledge.map((k) => (
            <VerdictChip key={k.measureKey} verdict={k.verdict} />
          ))}
        </div>
      )}
      {mf &&
        (gauge ? (
          <CapacityGauge
            need={gauge.need}
            have={gauge.have}
            unit="/wk"
            verdict={mf.time.verdict}
            unverified={unverified}
            label={timeSentence(mf.time)}
            needWord={SHORT_NEED}
            haveWord={gauge.yours ? SHORT_YOURS : SHORT_HAVE}
            className="rm-ck2-g"
          />
        ) : (
          <div className="rm-ck2-k">
            <Glyph name="ev.estimate" size={16} inherit />
            <span>App-tracked time</span>
            <VerdictChip verdict={mf.time.verdict} unverified={unverified} />
          </div>
        ))}
      {mf && (
        <Chips className="rm-ck2-row">
          {sized != null && throughput && <HonestyChip kind="sized-by-gemini" label={shortSizedByGemini(sized)} full={sizedSentence(throughput, sized)} />}
          <InfoTip topic="whether this is realistic">
            {mf.knowledge.map((k) => (
              <span key={k.measureKey} className="rm-dd-tl">
                <b>{`Targets vs your pace · ${verdictWord(k.verdict)}.`}</b> {knowledgeSentence(k, { intensity, dueDay, m, today, asOf: asOfWhen })}
                {knowledgeNotesOf(k).map((b) => ` ${b}`)}
                {k.verdict === "IMPOSSIBLE" && k.earliestDay ? ` Earliest day it fits: ${dayWithWeekday(k.earliestDay, today)}.` : ""}
              </span>
            ))}
            <span className="rm-dd-tl">
              <b>{`App-tracked time · ${verdictWord(mf.time.verdict, unverified)}.`}</b> {timeSentence(mf.time)}
            </span>
            {mf.time.basis.map((b) => (
              <span key={b} className="rm-dd-tl">
                {b}
              </span>
            ))}
            <span className="rm-dd-tl">{TIME_FIXED_LINE}</span>
          </InfoTip>
          <button type="button" className="rm-ilink rm-cap" onClick={() => setWhy(true)} style={{ minHeight: 40 }}>
            Why
          </button>
        </Chips>
      )}
      {aimCheck &&
        (aimCheck.kind === "unchecked" ? (
          <Chips className="rm-ck2-row">
            <HonestyChip kind="aim-unchecked" full={AIM_UNCHECKED_LINE} />
            {intakeEditable && (
              <Link className="rm-ilink" href={`${ROADMAP_NEW_HREF}#reality`}>
                Add a figure
              </Link>
            )}
            {/* An accepted plan's intake is closed: the figure goes through setAimFigure instead. */}
            {!intakeEditable && roadmapId && <AddFigureLink roadmapId={roadmapId} />}
          </Chips>
        ) : (
          <p className="rm-ck2-l">{aimCheckLine(aimCheck)}</p>
        ))}
      {mf && roadmapId && (mf.worst === "IMPOSSIBLE" || mf.worst === "OVER") && <RemedyButtons roadmapId={roadmapId} remedies={mf.remedies} mf={mf} today={today} />}
      {mf && (
        <WhySheet
          open={why}
          onClose={() => setWhy(false)}
          title={whyTitle(title, mf)}
          mf={mf}
          roadmapId={roadmapId}
          throughput={throughput}
          hoursPerWeek={hoursPerWeek}
          intensity={intensity}
          today={today}
          intakeEditable={intakeEditable}
        />
      )}
    </div>
  );
}

/**
 * The worst week as the gauge's two figures (minutes on one scale): what the milestone needs and
 * what you have (`yours`: the hours you gave, unverified, rather than tracked time). null when the
 * week or what you have can't be worked out yet (the panel then shows the verdict alone).
 */
export function gaugeOf(t: Pick<TimeCheck, "worstWeek">): { need: { value: number; text: string }; have: { value: number; text: string }; yours: boolean } | null {
  const w = t.worstWeek;
  if (!w || w.availableMin == null) return null;
  const load = w.reviewMin + w.writeMin + w.practiceMin;
  return { need: { value: load, text: hoursLabel(load, false) }, have: { value: w.availableMin, text: hoursLabel(w.availableMin, false) }, yours: w.availableClass === "YOURS" };
}

/** Every input, what kind of number it is, and the policy constants (F9 "Why"). */
function WhySheet({
  open,
  onClose,
  title,
  mf,
  roadmapId,
  throughput,
  hoursPerWeek,
  intensity,
  today,
  intakeEditable,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  mf: MilestoneFeasibility;
  roadmapId: string | null;
  throughput: Throughput | null;
  hoursPerWeek: number;
  intensity: Intensity;
  today: string;
  intakeEditable: boolean;
}) {
  const tp = throughput;
  return (
    <Sheet open={open} onClose={onClose} title={title} description="Every input, what kind of number it is, and the policy constants.">
      <div className="card rm-tp" style={{ background: "var(--raised)" }}>
        {tp && (
          <>
            <div>
              <span className="rm-tp-k">Pass share</span>
              <span className="rm-tp-v">{tp.passShare.kind === "measured" ? `${Math.round(tp.passShare.value * 100)}%` : "Calibrating"}</span>
              <span className="rm-tp-s">
                {tp.passShare.kind === "measured" ? `${plural(tp.passShare.n, "review")} in 28 days · tested by your reviews · ` : `${tp.passShare.have} of ${tp.passShare.need} reviews in 28 days · `}
                lapses by neglect aren&apos;t logged, so this reads high
              </span>
            </div>
            <div>
              <span className="rm-tp-k">Tracked time</span>
              <span className="rm-tp-v">{tp.trackedMinutes.kind === "measured" ? hoursLabel(tp.trackedMinutes.median) : "Calibrating"}</span>
              <span className="rm-tp-s">
                {tp.trackedMinutes.kind === "measured"
                  ? `a week, median · task estimates, not timed${tp.geminiShare != null ? `; ${Math.round(tp.geminiShare * 100)}% sized by Gemini` : ""}`
                  : `${tp.trackedMinutes.have} of ${tp.trackedMinutes.need} weeks`}
              </span>
            </div>
            <div>
              <span className="rm-tp-k">Recurring kept</span>
              <span className="rm-tp-v">{tp.adherence.kind === "measured" ? `${Math.round(tp.adherence.value * 100)}%` : "Calibrating"}</span>
              <span className="rm-tp-s">
                {tp.adherence.kind === "measured" ? `${tp.adherence.n} judged` : `${tp.adherence.have} of ${tp.adherence.need} judged`}, tasks of 20 min or more · from your ticks
              </span>
            </div>
          </>
        )}
        <div>
          <span className="rm-tp-k">Hours you gave</span>
          <span className="rm-tp-v">{hoursPerWeek} h</span>
          <span className="rm-tp-s">yours</span>
        </div>
      </div>
      {[...mf.knowledge.flatMap((k) => k.basis), ...mf.basis].length > 0 && (
        <>
          <span className="t-eyebrow rm-sheet-eyebrow">Worked out</span>
          <ul className="rm-basis">
            {[...mf.knowledge.flatMap((k) => k.basis), ...mf.basis].map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </>
      )}
      <span className="t-eyebrow rm-sheet-eyebrow">Policy, not facts</span>
      <p className="rm-sheet-p">
        {INTENSITY_WORD[intensity]} {pct(INTENSITY[intensity])} · reviews {REVIEW_SECONDS} s a card (assumed — reviews aren&apos;t timed) · a new card {CARD_WRITE_MIN} min (assumed — card writing isn&apos;t timed) · plans add up to +{pct(RAMP_ALLOWANCE)} of tracked time, at least {RAMP_FLOOR_MIN / 60} h · keep {pct(KEEP_SHARE)} of planned sessions · practices get {pct(PRACTICE_BUDGET_SHARE)} of the time left after reviews and new cards.
      </p>
      <span className="t-eyebrow rm-sheet-eyebrow">Change it</span>
      {roadmapId && <RemedyButtons roadmapId={roadmapId} remedies={mf.remedies} mf={mf} today={today} />}
      {intakeEditable && (
        <div className="rm-acts">
          <Link className="link" href={`${ROADMAP_NEW_HREF}#hours`}>
            Change your hours
          </Link>
        </div>
      )}
    </Sheet>
  );
}
