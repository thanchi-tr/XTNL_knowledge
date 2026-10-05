"use client";

/**
 * Keep the depth, move the date (lane R5; roadmap-rev4.md F-R4-11, F-R4-15;
 * ui-motion.md §3.3 screen 2, §7.2). The date block shows R2's date check
 * with fewer words and the same facts:
 *
 *   TimeBar        today → the realistic date (≈, month precision, «best case» while the pass rate
 *                  calibrates), the earliest if every review passes, the exam (once, as its flag
 *                  marker; examWaypointLine in the marker list) and your own date (t.pin · yours).
 *                  Its group label is the realism sentence.
 *   StatRow        "3 new/wk · 80% pass «reads high» · 92% cleared": the figures of the realism
 *                  sentence itself (realismFiguresOf reads R2's words, so the two never disagree);
 *                  "pass rate calibrating 12/30" in place of the % while it calibrates.
 *   verdict chip   on your own date only: "Tight", or "Unverified · Tight" while capacity calibrates.
 *   «set by reviews»  the schedule-bound line, one tap away.
 *   (i)            the realism sentence and every other line R2 wrote (DateCheck.basis), verbatim.
 *   offers         [Use Sun 21 Nov 2027] [Keep my date — Tight] [Choose a lower depth…], each one
 *                  tap, none automatic, with the never-lowered line in an (i) beside them.
 *
 * Offers (a draft; each one tap, none automatic):
 *   [Use Sun 21 Nov 2027]   the realistic date (Remedy USE_REALISTIC_DATE)
 *   [Keep my date]          TIGHT accepts as is; OVER turns on "Keep my date
 *                           over my pace" (the Over chip stays for good)
 *   [Choose a lower depth…] a sheet listing each lower depth with its stage's
 *                           date in this plan; with an exam date the depth
 *                           held by the exam is marked "what you'd hold by
 *                           your exam". Only this tap lowers a depth
 *                           (lowerDepth), and the plan shows it for good.
 * IMPOSSIBLE refuses accept for that depth and date; the offers stay.
 *
 * Motion: date-moved (CHANGED) on the TimeBar's ◆, only with a plan seen key
 * (an accepted plan's; a draft has none, so nothing moves). An estimate never
 * draws toward its date (H3). Two InfoTips here (the realism one and the
 * never-lowered one): a card that holds this block keeps room for its Key (D13).
 */
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { ActionError } from "@/components/home/ActionError";
import { pushToast } from "@/components/ui/toast-store";
import { ProvMark } from "@/components/glyph/Glyph";
import { GlyphStat } from "@/components/glyph/GlyphStat";
import { Chips, HonestyChip, VerdictChip } from "@/components/glyph/HonestyChip";
import { InfoTip } from "@/components/glyph/InfoTip";
import { TimeBar, type TimeBarMark } from "@/components/glyph/TimeBar";
import type { SeenKey } from "@/components/glyph/useSeen";
import { AIM_DEPTHS, DEPTH_KEYS, type AimDepth, type DateCheck, type Feasibility, type StageKey, type Throughput } from "@/lib/roadmap-types";
import {
  BY_YOUR_EXAM_MARK,
  KEEP_MY_DATE,
  LOWER_DEPTH_NOTE,
  LOWER_DEPTH_TITLE,
  LOWER_DEPTH_WORD,
  NEVER_LOWERED_LINE,
  SHORT_BEST_CASE,
  SHORT_CLEARED,
  SHORT_DATES_TOGGLE,
  SHORT_EARLIEST,
  SHORT_NEW_PER_WEEK,
  SHORT_PASS,
  SHORT_YOURS,
  dayFull,
  dayLabel,
  depthName,
  examWaypointLine,
  monthYear,
  overKeptLine,
  realisticDateWord,
} from "./roadmap-copy";
import { realismFlagsOf } from "./roadmap-ui-model";
import { useRoadmapAction } from "./roadmap-runtime";

/** A stage row of the plan, as the lower-depth sheet reads its date (a draft's or an accepted plan's rows). */
export interface StageDateRow {
  stage?: StageKey | null;
  gateLevel?: number | null;
  dueDay: string | null;
}

/** The depths below `depth`, deepest first, each with its stage's due day in this plan (null: not a stage of it). */
export function lowerDepthsOf(depth: AimDepth, rows: readonly StageDateRow[]): { depth: AimDepth; day: string | null }[] {
  return DEPTH_KEYS.map((k) => AIM_DEPTHS[k])
    .filter((d) => d < depth)
    .map((d) => {
      const row = rows.find((r) => r.stage !== "PART" && r.stage !== "BETWEEN" && r.gateLevel === d && r.dueDay);
      return { depth: d, day: row?.dueDay ?? null };
    });
}

// ─── The realism sentence's own figures (R2's words: roadmap-realism dateCheckOf) ───

/**
 * The (i)'s line while capacity calibrates (ui-motion.md §3.3 screen 2, D28): the verdict chip
 * reads "Unverified · …" and this says why.
 */
export const UNVERIFIED_REALISM_LINE = "Unverified: your tracked time or your recurring tasks are still calibrating.";
/** The ProvMark's words beside "Date" when the app set the date (the block's old caption, now sr-only and in the (i)). */
export const DATE_APP_WORDS = "the date the app works out";
/** «reads high»'s words (sr, and in the (i) while a measured pass rate shows). */
export const READS_HIGH_WORDS = "reads high: lapses by neglect aren't logged";

export interface RealismFigures {
  /** "At 70% of your usual 3 new cards a week": the usual rate (3) and the plan's share of it (0.7). */
  rate: number | null;
  share: number | null;
  /** "your 80% pass rate (reads high)" (measured) or "an assumed 80% pass rate". */
  pass: { value: number; assumed: boolean } | null;
  /** "the 92% of your due queue you clear" (measured) or "an assumed 85% of your due queue cleared". */
  clear: { value: number; assumed: boolean } | null;
}

/**
 * The figures the realism sentence names, read from R2's own template (never from another source,
 * so the StatRow and the sentence in the (i) can't disagree). A sentence that doesn't match gives
 * nulls: the StatRow then leaves that figure out rather than guess it.
 */
export function realismFiguresOf(sentence: string | null | undefined): RealismFigures {
  const s = sentence ?? "";
  const pace = /^At (\d+)% of your usual ([\d.]+) new cards? a week\b/.exec(s);
  const passM = /\byour (\d+)% pass rate \(reads high\)/.exec(s);
  const passA = /\ban assumed (\d+)% pass rate\b/.exec(s);
  const clearM = /\bthe (\d+)% of your due queue you clear\b/.exec(s);
  const clearA = /\ban assumed (\d+)% of your due queue cleared\b/.exec(s);
  return {
    rate: pace ? Number(pace[2]) : null,
    share: pace ? Number(pace[1]) / 100 : null,
    pass: passM ? { value: Number(passM[1]), assumed: false } : passA ? { value: Number(passA[1]), assumed: true } : null,
    clear: clearM ? { value: Number(clearM[1]), assumed: false } : clearA ? { value: Number(clearA[1]), assumed: true } : null,
  };
}

/** R2's basis lines by role: the realism sentence, the exam line, the schedule-bound line, and the rest (each verbatim). */
export function dateBasisOf(check: Pick<DateCheck, "basis" | "scheduleBound" | "D_real">): { realism: string | null; exam: string | null; schedule: string | null; rest: string[] } {
  const realism = check.basis.find((b) => /\bthis depth is realistic by\b/.test(b)) ?? (check.D_real == null ? (check.basis[0] ?? null) : null);
  const exam = check.basis.find((b) => /^By your exam \(/.test(b)) ?? null;
  const schedule = check.scheduleBound ? (check.basis.find((b) => /^This date is set by the review schedule\b/.test(b)) ?? null) : null;
  const rest = check.basis.filter((b) => b !== realism && b !== exam && b !== schedule);
  return { realism, exam, schedule, rest };
}

/** «pass rate calibrating»'s words while the date assumes a pass rate (sr, and in the (i)). */
export function assumedPassWords(value: number): string {
  return `pass rate calibrating: the date assumes ${Math.round(value)}% until enough reviews are measured`;
}

/** The TimeBar's marker sentences (its list, read by a screen reader and shown by the Dates toggle). */
export function realisticMarkSentence(day: string, bestCase: boolean): string {
  return `Realistic: about ${monthYear(day)}, an estimate (${dayFull(day)} at this pace${bestCase ? `; ${SHORT_BEST_CASE} — your pass rate is still calibrating` : ""}).`;
}
export function earliestMarkSentence(day: string): string {
  return `Earliest if every review passes: ${dayFull(day)}.`;
}
export function yourDateMarkSentence(day: string): string {
  return `Your date: ${dayFull(day)}.`;
}

/** The verdict on the user's own date: a glyph and a word, never colour alone ("Unverified · Tight" while capacity calibrates). */
export function DateVerdictChip({ verdict, unverified }: { verdict: DateCheck["verdict"]; unverified?: boolean }) {
  return <VerdictChip verdict={verdict} unverified={unverified} />;
}

export function LowerDepthSheet({
  open,
  onClose,
  roadmapId,
  depth,
  rows,
  examReach,
}: {
  open: boolean;
  onClose: () => void;
  roadmapId: string;
  depth: AimDepth;
  rows: readonly StageDateRow[];
  /** The level the plan reaches by the exam (DateCheck.reachByExam); null without an exam date. */
  examReach: number | null;
}) {
  const { run, pending, error } = useRoadmapAction();
  const options = lowerDepthsOf(depth, rows);
  // The depth held by the exam: the deepest lower depth at or under the exam's reach.
  const byExam = examReach != null ? (options.find((o) => o.depth <= examReach)?.depth ?? null) : null;
  return (
    <Sheet open={open} onClose={onClose} title={LOWER_DEPTH_TITLE} description={`Now: ${depthName(depth)}.`}>
      <div className="rm-form">
        <p className="rm-sheet-p">{LOWER_DEPTH_NOTE}</p>
        <div className="rm-pick-list">
          {options.map((o) => (
            <button
              key={o.depth}
              type="button"
              className="rm-pick"
              disabled={pending}
              onClick={() =>
                run(
                  (a) => a.lowerDepth(roadmapId, o.depth, o.depth === byExam ? "EXAM" : "CHOICE"),
                  () => {
                    pushToast({ title: `Depth lowered to ${depthName(o.depth)}`, body: "The plan shows this choice for good." });
                    onClose();
                  }
                )
              }
            >
              <span className="rm-pick-t">
                <b>Lower to {depthName(o.depth)}</b>
                <span className="t-meta">
                  {o.day ? `its stage in this plan: ${dayFull(o.day)}` : "not a stage of this plan yet: the plan is dated again"}
                  {o.depth === byExam ? ` · ${BY_YOUR_EXAM_MARK}` : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
        {options.length === 0 && <p className="t-meta">Retained (level 8) is the lowest depth a plan holds.</p>}
        {error && <ActionError>{error}</ActionError>}
      </div>
    </Sheet>
  );
}

/** "4 May 2027 · L8": the exam marker's 12 px label (the full sentence is in the TimeBar's list). */
function examLabel(day: string, reach: number | null, today?: string): string {
  return reach != null ? `${dayLabel(day, today)} · L${reach}` : dayLabel(day, today);
}

const pct = (n: number) => String(Math.round(n));

/** "3 new/wk · 80% pass «reads high» · 92% cleared" (or "pass rate calibrating 12/30"): the realism sentence's own figures. */
function RealismStats({ figures, calibrating }: { figures: RealismFigures; calibrating: { n: number; need: number } | null }) {
  const parts: ReactNode[] = [];
  if (figures.rate != null)
    parts.push(<GlyphStat key="rate" glyph="quest.add" value={figures.rate} label={SHORT_NEW_PER_WEEK} speech={`your usual ${figures.rate} new cards a week`} />);
  if (calibrating) parts.push(<GlyphStat key="pass" glyph="ev.tested" value={0} calibrating={calibrating} />);
  else if (figures.pass?.assumed) parts.push(<HonestyChip key="pass" kind="calibrating" sr={assumedPassWords(figures.pass.value)} />);
  else if (figures.pass)
    parts.push(
      <span key="pass" className="rm-dd-pair">
        <GlyphStat glyph="ev.tested" value={pct(figures.pass.value)} unit="%" label={SHORT_PASS} speech={`${pct(figures.pass.value)} percent pass rate`} />
        <HonestyChip kind="reads-high" sr={READS_HIGH_WORDS} />
      </span>
    );
  if (figures.clear)
    parts.push(
      <GlyphStat
        key="clear"
        glyph="m.queue"
        value={pct(figures.clear.value)}
        unit="%"
        label={SHORT_CLEARED}
        estimate={figures.clear.assumed}
        speech={`${figures.clear.assumed ? "an assumed " : ""}${pct(figures.clear.value)} percent of your due queue cleared`}
      />
    );
  if (parts.length === 0) return null;
  return (
    <span className="mg-statrow rm-dd-stats">
      {parts.map((p, i) => (
        <span key={i} style={{ display: "contents" }}>
          {i > 0 && (
            <span className="mg-sep" aria-hidden="true">
              ·
            </span>
          )}
          {p}
        </span>
      ))}
    </span>
  );
}

export function DateBlock({
  roadmapId,
  check,
  depth,
  rows,
  mode,
  keepOver,
  onKeepMyDate,
  userDay,
  today,
  throughput,
  feasibility,
  exam,
  seenKey,
}: {
  roadmapId: string | null;
  check: DateCheck;
  /** The plan's depth (the lower-depth offer); null on a track plan. */
  depth: AimDepth | null;
  rows: readonly StageDateRow[];
  /** "draft": the offers; "plan": an accepted plan's record (the lower-depth tap stays its own action). */
  mode: "draft" | "plan";
  /** OVER: whether "Keep my date over my pace" is on (the draft footer's switch). */
  keepOver?: boolean;
  /** [Keep my date]: TIGHT scrolls to Accept; OVER turns the switch on. */
  onKeepMyDate?: () => void;
  /** The user's own date (the header's targetDay): its t.pin marker, and "kept as you chose (Over)" on a plan. */
  userDay?: string | null;
  /** Today (the TimeBar starts here). Without it the block keeps R2's lines visible instead of the bar. */
  today?: string;
  /** The figures' classes (D28): "Unverified · …", "pass rate calibrating 12/30", «best case». */
  throughput?: Throughput | null;
  feasibility?: Feasibility | null;
  /** The exam (DepthView.exam): its flag marker; the exam line then sits in the TimeBar's list, said once. */
  exam?: { day: string; reachLevel: number | null } | null;
  /** An accepted plan's seen key (plan basis): the ◆ crossfades when the realistic date moved (CHANGED). None on a draft. */
  seenKey?: Omit<SeenKey, "what"> | null;
}) {
  const [lower, setLower] = useState(false);
  const { run, pending, error } = useRoadmapAction();
  const uid = useId();
  const sentenceId = `rm-dd-s${uid}`;
  const userDate = check.dateOrigin.origin === "USER";
  const realisticOffer = mode === "draft" && userDate && check.D_real != null && check.verdict !== "FITS";
  const keepOffer = mode === "draft" && userDate && (check.verdict === "TIGHT" || check.verdict === "OVER");
  const keptOver = mode === "plan" && userDate && check.verdict === "OVER" && userDay ? overKeptLine(userDay, check.D_real) : null;
  const lines = dateBasisOf(check);
  const flags = realismFlagsOf({ throughput: throughput ?? null, dateCheck: check, feasibility: feasibility ?? null });
  const figures = realismFiguresOf(lines.realism);
  const passCalibrating = check.dateOrigin.calibrating.includes("p") || flags.calibrating != null || figures.pass?.assumed === true;
  const bestCase = passCalibrating;
  // The bar needs today and a realistic date; without them R2's lines stay visible as they were.
  const bar = today != null && check.D_real != null;
  const examMark = bar && exam ? exam : null;
  // Your own date's marker; a date that can't be yours for this verdict (on or after the realistic one while it isn't Fits) is no claim to draw.
  const mineDay = userDate && userDay && (check.verdict === "FITS" || (check.D_real != null && userDay < check.D_real)) ? userDay : null;
  const marks = bar
    ? {
        realistic: { day: check.D_real as string, label: monthYear(check.D_real as string), sentence: realisticMarkSentence(check.D_real as string, bestCase), estimate: true, bestCase },
        earliest: check.D_best_pace && check.D_best_pace !== check.D_real ? ({ day: check.D_best_pace, label: `${SHORT_EARLIEST} ${monthYear(check.D_best_pace)}`, sentence: earliestMarkSentence(check.D_best_pace) } satisfies TimeBarMark) : null,
        exam: examMark ? ({ day: examMark.day, label: examLabel(examMark.day, examMark.reachLevel, today), sentence: lines.exam ?? examWaypointLine(examMark.day, examMark.reachLevel) } satisfies TimeBarMark) : null,
        mine: mineDay ? ({ day: mineDay, label: `${dayLabel(mineDay, today)} · ${SHORT_YOURS}`, sentence: yourDateMarkSentence(mineDay) } satisfies TimeBarMark) : null,
      }
    : null;
  // Every line R2 wrote stays verbatim: with the bar, in the (i) (the realism sentence first: it labels the bar) or the
  // bar's own list (the exam, said once); without it, visible as before. The schedule line is its chip's.
  const visibleLines = bar ? [] : [lines.realism, ...lines.rest, lines.exam].filter((b): b is string => Boolean(b));
  const panelLines = [
    ...(bar ? [...lines.rest, ...(examMark || !lines.exam ? [] : [lines.exam])] : []),
    ...(flags.unverified ? [UNVERIFIED_REALISM_LINE] : []),
    ...(keptOver ? [keptOver] : []),
    ...(figures.pass && !figures.pass.assumed && flags.calibrating == null ? [`Your pass rate ${READS_HIGH_WORDS}.`] : []),
    ...(figures.pass?.assumed && flags.calibrating == null ? [`The ${assumedPassWords(figures.pass.value)}.`] : []),
    ...(userDate ? [] : [`Date: ${DATE_APP_WORDS}.`]),
  ];
  const offers = realisticOffer || keepOffer || (depth != null && depth > 8 && roadmapId);
  return (
    <div className="rm-ms-sec rm-date" id="date">
      <div className="rm-ms-sh">
        <span className="t-eyebrow">Date</span>
        {userDate ? <DateVerdictChip verdict={check.verdict} unverified={flags.unverified} /> : <ProvMark cls="app-worked" words={DATE_APP_WORDS} />}
      </div>
      {marks && (
        <TimeBar
          today={today as string}
          realistic={marks.realistic}
          earliest={marks.earliest}
          exam={marks.exam}
          mine={marks.mine}
          verdict={userDate ? check.verdict : undefined}
          labelledBy={sentenceId}
          seenKey={seenKey ?? null}
          datesLabel={SHORT_DATES_TOGGLE}
          bestCaseLabel={SHORT_BEST_CASE}
          className="rm-dd-tb"
        />
      )}
      {visibleLines.map((b) => (
        <p key={b} className="rm-date-l">
          {b}
        </p>
      ))}
      <Chips className="rm-dd-row">
        <RealismStats figures={figures} calibrating={flags.calibrating} />
        {lines.schedule && <HonestyChip kind="schedule" full={lines.schedule} />}
        {((bar && lines.realism) || panelLines.length > 0) && (
          <InfoTip topic="how this date is worked out">
            {bar && lines.realism && (
              <span id={sentenceId} className="rm-dd-tl">
                {lines.realism}
              </span>
            )}
            {panelLines.map((b) => (
              <span key={b} className="rm-dd-tl">
                {b}
              </span>
            ))}
          </InfoTip>
        )}
      </Chips>
      <div className="rm-date-offers">
        {offers && (
          <>
            {realisticOffer && roadmapId && (
              <Button variant="primary" className="rm-btn-wrap" disabled={pending} onClick={() => run((a) => a.applyRemedy(roadmapId, "USE_REALISTIC_DATE"))}>
                {realisticDateWord(check.D_real as string)}
              </Button>
            )}
            {keepOffer && (
              <Button className="rm-btn-wrap" aria-pressed={check.verdict === "OVER" ? Boolean(keepOver) : undefined} onClick={onKeepMyDate}>
                {check.verdict === "OVER" ? `${KEEP_MY_DATE} — Over` : `${KEEP_MY_DATE} — Tight`}
              </Button>
            )}
            {depth != null && depth > 8 && roadmapId && <ChipButton onClick={() => setLower(true)}>{LOWER_DEPTH_WORD}</ChipButton>}
          </>
        )}
        <InfoTip topic="lowering the depth">{NEVER_LOWERED_LINE}</InfoTip>
      </div>
      {error && <ActionError>{error}</ActionError>}
      {depth != null && roadmapId && <LowerDepthSheet open={lower} onClose={() => setLower(false)} roadmapId={roadmapId} depth={depth} rows={rows} examReach={check.reachByExam} />}
    </div>
  );
}
