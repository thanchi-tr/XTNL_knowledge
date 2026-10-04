"use client";

/**
 * "Is this realistic?" for one milestone (F4, F9 Checks panel, decision 6).
 * Never beside the aim, and no plan-level verdict chip exists.
 *
 *   Targets vs your pace  a fitted target reads "Fitted" with its arithmetic
 *                         and no verdict (one would be true by construction);
 *                         a typed target gets Fits, Tight, Over or Impossible.
 *   App-tracked time      the worst calendar week's verdict as a word and a
 *                         glyph ("Unverified · Fits" while calibrating), its
 *                         arithmetic, and the fixed line, always.
 *   Aim check             a line, only against the user's own figure.
 *
 * A "Why" sheet lists every input with what kind of number it is, the policy
 * constants, and the remedies as one-tap buttons. Ink only; never red.
 */
import Link from "next/link";
import { useState } from "react";
import { ChipButton } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { ActionError } from "@/components/home/ActionError";
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
  INTENSITY_WORD,
  TIME_FIXED_LINE,
  aimCheckLine,
  dayLabel,
  dayWithWeekday,
  hoursLabel,
  plural,
  verdictWord,
  whyTitle,
} from "./roadmap-copy";
import { ROADMAP_NEW_HREF } from "./roadmap-links";
import { useRoadmapAction } from "./roadmap-runtime";
import { AddFigureLink } from "./AimFigure";
import { RoadmapGlyph, type RoadmapGlyphName } from "./RoadmapGlyph";

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** A verdict chip: a word and a glyph, never colour alone. */
export function VerdictChip({ verdict, unverified }: { verdict: KnowledgeCheck["verdict"] | TimeCheck["verdict"]; unverified?: boolean }) {
  const glyph: RoadmapGlyphName = unverified
    ? "v-unv"
    : verdict === "FITTED"
      ? "v-fitted"
      : verdict === "FITS"
        ? "v-fits"
        : verdict === "TIGHT"
          ? "v-tight"
          : verdict === "OVER"
            ? "v-over"
            : "v-imp";
  const cls = verdict === "IMPOSSIBLE" ? "rm-vd rm-vd-x" : verdict === "FITTED" || unverified ? "rm-vd rm-vd-q" : "rm-vd";
  return (
    <span className={cls}>
      <RoadmapGlyph name={glyph} />
      {verdictWord(verdict, unverified)}
    </span>
  );
}

/** "Targets vs your pace" in words, from the engine's own figures. */
export function knowledgeSentence(k: KnowledgeCheck, ctx: { intensity: Intensity; dueDay: string | null; m: number; today?: string }): string {
  const due = ctx.dueDay ? dayLabel(ctx.dueDay, ctx.today) : "its due day";
  const exp = Math.floor(k.expected);
  const best = Math.floor(k.best);
  const calib = k.bestCase ? " Best case — your pass rate is still calibrating." : "";
  switch (k.verdict) {
    case "FITTED": {
      const more = Math.max(0, Math.round(k.expected - k.baseline));
      return `Fitted at ${INTENSITY_WORD[ctx.intensity]}: ${k.baseline} now, plus ${pct(INTENSITY[ctx.intensity])} of the ≈ ${more} more your reviews can be expected to bring to level ${k.level} by ${due} = ${k.target}. Best case ${best}, if every review passes on its day.${calib}`;
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
  return "Move the last milestones to Later";
}

export function RemedyButtons({ roadmapId, remedies, mf, today }: { roadmapId: string; remedies: readonly Remedy[]; mf: MilestoneFeasibility | null; today?: string }) {
  const { run, pending, error } = useRoadmapAction();
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
}) {
  const [why, setWhy] = useState(false);
  return (
    <div className="rm-ms-sec">
      <div className="rm-ms-sh">
        <span className="t-eyebrow">Is this realistic?</span>
        {mf && (
          <button type="button" className="rm-ilink rm-cap" onClick={() => setWhy(true)} style={{ minHeight: 40 }}>
            Why
          </button>
        )}
      </div>
      {!mf && <p className="t-meta">The checks run once the plan has dates.</p>}
      {mf?.knowledge.map((k) => (
        <div key={k.measureKey} className="rm-ck">
          <div className="rm-ck-h">
            <b>Targets vs your pace</b>
            <VerdictChip verdict={k.verdict} />
          </div>
          <p>{knowledgeSentence(k, { intensity, dueDay, m, today })}</p>
          {k.verdict === "IMPOSSIBLE" && k.earliestDay && <p>Earliest day it fits: {dayWithWeekday(k.earliestDay, today)}.</p>}
        </div>
      ))}
      {mf && (
        <div className="rm-ck">
          <div className="rm-ck-h">
            <b>App-tracked time</b>
            <VerdictChip verdict={mf.time.verdict} unverified={mf.time.unverified} />
          </div>
          <p>{timeSentence(mf.time)}</p>
          {mf.time.basis.map((b) => (
            <p key={b}>{b}</p>
          ))}
          <p className="rm-ck-fixed">{TIME_FIXED_LINE}</p>
        </div>
      )}
      {aimCheck && (
        <div className="rm-ck">
          <div className="rm-ck-h">
            <b>Aim check</b>
          </div>
          <p>
            {aimCheckLine(aimCheck)}
            {aimCheck.kind === "unchecked" && intakeEditable && (
              <>
                {" · "}
                <Link className="rm-ilink" href={`${ROADMAP_NEW_HREF}#reality`}>
                  Add a figure
                </Link>
              </>
            )}
            {/* An accepted plan's intake is closed: the figure goes through setAimFigure instead. */}
            {aimCheck.kind === "unchecked" && !intakeEditable && roadmapId && (
              <>
                {" · "}
                <AddFigureLink roadmapId={roadmapId} />
              </>
            )}
          </p>
        </div>
      )}
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
