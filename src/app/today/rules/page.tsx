import "./rules.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { DAY_START_HOUR, keyOfDateColumn, todayKey, type DayKey } from "@/lib/life-day";
import { cached } from "@/lib/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import {
  AKRASIA_DAYS,
  FREEZE_EARN_ACTIVE_DAYS,
  FREEZE_MAX,
  FREEZE_START_BALANCE,
  MAKEUP_RESTORE_DAYS,
  MAKEUP_RESTORE_EVERY_DAYS,
  REPAIR_EVERY_DAYS,
  REST_PER_WEEK,
  SETTLE_LAG_DAYS,
  SICK_EVERY_DAYS,
  TYPO_GRACE_MIN,
  VACATION_BUDGET_SPAN_DAYS,
  VACATION_DAYS_PER_365,
  VACATION_MAX_DAYS,
  VACATION_MIN_DAYS,
  WRITE_OFF_MIN_DAYS,
  dutyLaunchDay,
} from "@/lib/duty-economy";
import { dutyPhaseOf, dutySettledLine, preLaunchNotice } from "@/lib/rituals";
import {
  BODY_EFFORT_MINUTES,
  CAPPED_REASONS,
  DUTY_FALLBACK_COMPLETIONS,
  DUTY_MIN_OCCURRENCES,
  EFFORT_CATEGORY,
  EFFORT_WEIGHT,
  GOAL_DEPTH,
  GOAL_DEPTH_CAP,
  GOAL_RULES,
  HELD_WEEK_REST_DAYS,
  KEPT_MIN_DAYS,
  KEPT_MIN_RAW,
  LIFE_MP,
  LIFE_MP_REASON_LABEL,
  LIFE_MP_WEEK_CAP,
  TRACK_DEPTH_GRACE,
  TRACK_DEPTH_WEEK_COEF,
  TRACK_LEVEL_STEP,
  TRACK_SHARE_CAP,
  WEEK_JUDGE_LAG_DAYS,
  WEEK_JUDGE_MAX_WEEKS,
  depthCap,
  isLaunched,
  keptFloorsOf,
  lifeLaunchDay,
  trackDepth,
  xpForLevel,
  type LifeMpReason,
} from "@/lib/life-economy";
import { keptWeekBonusPercent } from "@/lib/life-tracks";
import { longDayLabel, mpFigure } from "@/components/home/sheet-math";
import { CurrencyGlyph } from "@/components/ui/Icon";
import { SectionHeader } from "@/components/ui/Tabs";
import { FULL_DAY_MP, QUEST_CAP } from "@/lib/full-day";
import {
  BAND_BASE,
  BAND_META,
  BAND_MINUTE_CAPS,
  BAND_OVERRIDE_COOLDOWN_DAYS,
  BAND_OVERRIDE_MAX,
  BAND_OVERRIDE_MIN,
  CONSISTENCY_CAP,
  CONSISTENCY_CAP_DAYS,
  DEBT_CAP,
  DEBT_OPEN_PER_TEMPLATE,
  DEBT_OPEN_TOTAL_CAP,
  DECAY_GROUP_DICE,
  EFFORT_CAP,
  EFFORT_FLOOR,
  EFFORT_HALF_MINUTES,
  EST_EFF_MACHINE_MULTIPLE,
  EST_MINUTES_MAX,
  EST_MINUTES_MIN,
  FORMULA_VERSION,
  INTRO_FREE_BEFORE,
  INTRO_VOLUME_LAMBDA,
  KNEE_CAP,
  KNEE_CAP_AT_RAW,
  KNEE_FULL_RATE,
  KNEE_SCALE,
  PAY_MODE_FACTOR,
  RAW_WORST_CASE,
  RECORD_WINDOW_DAYS,
  REPEAT_DECAY_LAMBDA,
  REPORTED_MAX_SHARE,
  REPORTED_MINUTES_MAX,
  REPORTED_MIN_SHARE,
  SIZING_AI_COMPOSITION_SHARE,
  SIZING_BASIS_CHARS,
  SIZING_CONFIDENCE_BASE,
  SIZING_CONFIDENCE_LEXICAL_SHARE,
  SIZING_DAILY_CAP,
  SIZING_LOCK_CONFIDENCE,
  SIZING_MAX_ATTEMPTS,
  SIZING_WINDOW_HOURS,
  TIMING_FACTOR,
  TRACK_LABEL,
  UNDO_WINDOW_MINUTES,
  consistencyFactor,
  debtFor,
  describeReceipt,
  effortFactor,
  introVolumeFactor,
  kneeG,
  priceTask,
  repeatFactor,
} from "@/lib/life-grade";
import { CATEGORY_LABEL, CATEGORY_TRACK, DURATION_BAND_MINUTES, LIFE_RULE_COUNT } from "@/lib/life-lexicon";
import { HABIT_ALPHA, HABIT_RUNGS } from "@/lib/habit";
import { SIZING_PROMPT_VERSION, TASK_SIZING_MODEL } from "@/lib/gemini";
import { BANDS, CATEGORIES, DURATION_BANDS, TRACKS, type PayMode, type PriceInput, type Timing } from "@/lib/life-types";
import {
  ADHERENCE_FLOOR,
  ADHERENCE_MIN_BAND,
  ADHERENCE_MIN_JUDGED,
  ADHERENCE_MIN_MINUTES,
  AIM_RANKS,
  CALIBRATION_WEEKS,
  CARD_WRITE_MIN,
  DECLARED_FACTOR,
  INTENSITY,
  KEEP_SHARE,
  LEVEL_WEIGHT,
  MAX_MILESTONES,
  MILESTONE_MAX_DAYS,
  MILESTONE_MIN_DAYS,
  MILESTONE_TARGET_DAYS,
  MIN_INCREMENT_CARDS_FLOOR,
  MIN_INCREMENT_SHARE,
  PARAGON_MIN_MILESTONES,
  PASS_SHARE_MIN_REVIEWS,
  PASS_SHARE_WINDOW_DAYS,
  PRACTICE_BUDGET_SHARE,
  PRACTICE_PAY_FLOOR_MIN,
  PRACTICE_PAY_SHARE,
  RAMP_ALLOWANCE,
  RAMP_FLOOR_MIN,
  RANK_MILESTONE_MAX,
  RANK_NEW_DAYS,
  RANK_TOP,
  REACH_CONFIRM_DAYS,
  REVIEW_SECONDS,
  ROADMAP_DRAFTS_PER_DAY,
  ROADMAP_REUSE_DAYS,
  SPAN_MAX_DAYS,
  SPAN_MIN_DAYS,
  START_MIN_DAYS_TO_DUE,
  THRESHOLDS,
  THRESHOLD_SPAN_SHARE,
  TIME_FITS_MAX,
  TIME_TIGHT_MAX,
  TOP_LEVEL,
  WEEK_QUESTS_PER_WEEK_MAX,
  WEEK_QUEST_ADD_MIN_CAP,
  WEEK_QUEST_CATCHUP_FACTOR,
  WEEK_QUEST_CHECKPOINT_FROM,
  WEEK_QUEST_FINAL_LAG_DAYS,
  WEEK_QUEST_ROWS_TODAY,
  aimRankName,
  floorBase,
  floorStrict,
  milestoneCountFor,
  rankIndexAt,
  topRankIndexOf,
  type ProficiencyParts,
} from "@/lib/roadmap-types";
import { proficiencyOf } from "@/lib/roadmap-proficiency";

export const metadata: Metadata = { title: "How a day is judged" };

/**
 * Every number on the page comes from the modules that pay. Its only read
 * is Duty's settlement cursor, once Duty is live, for 'Duty is settled
 * through <day>' when settlement lags. The shell around it reads on every
 * route too (the loadout bar and the notices): rendered statically, those
 * would be baked in at build time and read the database during the build,
 * so this page renders per request like every other.
 */
export const dynamic = "force-dynamic";

/**
 * The published rules of life XP. Every constant is imported from the code
 * that prices and sizes tasks, and every example below is priced live by
 * the same `priceTask` the server pays with — so this page cannot describe
 * a rule the app does not apply, or a number it does not pay.
 */

const f2 = (n: number) => n.toFixed(2);
const f1 = (n: number) => n.toFixed(1);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

function Card({ title, sub, children, wide = false }: { title: string; sub?: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`card rules-card${wide ? " wide" : ""}`}>
      <h2 className="rules-h">{title}</h2>
      {sub && <p className="t-meta">{sub}</p>}
      <div className="rules-body">{children}</div>
    </section>
  );
}

function Formula({ children }: { children: ReactNode }) {
  return <p className="t-mono rules-formula">{children}</p>;
}

/** A small two-row table of inputs and what they give. Scrolls sideways on its own, never the page. */
function Samples({ head, rows }: { head: [string, string]; rows: [string, string][] }) {
  return (
    <div className="rules-scroll">
      <table className="rules-table">
        <tbody>
          <tr>
            <th scope="row" className="t-eyebrow">
              {head[0]}
            </th>
            {rows.map(([k]) => (
              <td key={k} className="num ink-2">
                {k}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className="t-eyebrow">
              {head[1]}
            </th>
            {rows.map(([k, v]) => (
              <td key={k} className="num">
                {v}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const TIMING_WORDS: Record<Timing, string> = {
  ON_TIME: "On time: by a deadline, undated, any day of a planned task (planned days are never late), or yesterday recorded today",
  LATE: "After a deadline",
  MAKE_UP: "Making up a missed occurrence",
};

const MODE_WORDS: Record<PayMode, string> = {
  FULL: "An ordinary completion. Compulsory tasks pay the same: the flag raises the stakes, not the reward.",
  MVV: "The task's minimum version ('min: 10 pushups'). No streak bonus.",
  PLAY: "#play: logged and kept in the streak, never paid, so something done for its own sake is not turned into a job.",
  STUDY: "Study-linked ('review 20', 'add 3 ideas'): the reviews and ideas already paid, so the task pays nothing on top.",
};

const WEEKDAY_AFTER_SUNDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * What each life MP reason pays, in words built from the constants. Once
 * Duty is live a Full day is recorded by settlement and paid by the week
 * judge after the kept tracks (decision 6); before, the row says where its
 * payment comes from.
 */
function mpRows(dutyLive: boolean): { reason: LifeMpReason; amount: number; per: string; note?: string }[] {
  return [
    { reason: "LIFE_WEEK_KEPT", amount: LIFE_MP.WEEK_KEPT, per: "dated the week's Sunday, paid once the week is judged" },
    { reason: "GOAL_SHORT", amount: GOAL_RULES.SHORT.stated, per: "at 100%" },
    { reason: "GOAL_MID", amount: GOAL_RULES.MID.stated, per: "× progress" },
    { reason: "GOAL_LONG", amount: GOAL_RULES.LONG.stated, per: "× progress" },
    dutyLive
      ? { reason: "LIFE_FULL_DAY", amount: LIFE_MP.FULL_DAY, per: "up to this per Full day", note: "paid when the week is judged, after the kept tracks" }
      : { reason: "LIFE_FULL_DAY", amount: LIFE_MP.FULL_DAY, per: "per Full day", note: "pays from daily settlement" },
  ];
}

/** How the reasons that share the weekly cap read in a sentence. */
const CAPPED_WORDS: Record<LifeMpReason, string> = {
  LIFE_WEEK_KEPT: "kept weeks",
  GOAL_SHORT: "Short goals",
  LIFE_FULL_DAY: "Full days",
  GOAL_MID: "Mid goals",
  GOAL_LONG: "Long goals",
};

/** The level used to illustrate the XP scale. */
const SAMPLE_LEVEL = 10;

/** A whole number of kept weeks after which the bonus stops growing. */
function bonusFullAt(): number {
  const most = keptWeekBonusPercent(10_000);
  let n = 1;
  while (keptWeekBonusPercent(n) < most - 1e-9) n++;
  return n;
}

/**
 * Tracks and kept weeks: every number below is read from life-economy.ts
 * and life-tracks.ts (scripts/you-check.ts holds that no figure in this
 * card is typed by hand).
 */
function TracksRules() {
  const launchDay = lifeLaunchDay();
  const today = todayKey();
  const dutyLive = dutyPhaseOf(today, dutyLaunchDay()) === "live";
  const inForce = isLaunched(today, launchDay);
  const edge = `${String(DAY_START_HOUR).padStart(2, "0")}:00`;
  const judgeDay = WEEKDAY_AFTER_SUNDAY[WEEK_JUDGE_LAG_DAYS % WEEKDAY_AFTER_SUNDAY.length];
  const year = Math.floor(365 / 7);
  const fullAt = bonusFullAt();
  const pct = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-GB");
  const capped = CAPPED_REASONS.map((r) => CAPPED_WORDS[r]);
  return (
    <Card
      title="Tracks and kept weeks"
      sub={inForce && launchDay ? `In force since ${longDayLabel(launchDay)}` : "Not yet in force: no week is judged and nothing here is paid yet"}
      wide
    >
      <Formula>
        level = min(⌊√XP / {TRACK_LEVEL_STEP}⌋, {TRACK_DEPTH_GRACE} + ⌊depth⌋)
      </Formula>
      <Formula>
        depth = {TRACK_DEPTH_WEEK_COEF} · √(kept weeks) + goal depth
      </Formula>
      <p>
        {TRACK_LABEL.BODY}, {TRACK_LABEL.DUTY}, {TRACK_LABEL.CRAFT} and {TRACK_LABEL.CARE} each start with no XP and no level;
        a track&apos;s XP is the life XP its tasks paid. Level {SAMPLE_LEVEL} needs {xpForLevel(SAMPLE_LEVEL).toLocaleString("en-GB")} XP, and a year of kept
        weeks ({year}) allows level {depthCap(trackDepth(year))}. XP past the cap is banked, never lost: it counts the
        moment a kept week raises the cap. A paid Mid goal adds {GOAL_DEPTH.MID} depth to its track and a paid Long goal{" "}
        {GOAL_DEPTH.LONG}, at most {GOAL_DEPTH_CAP} per track.
      </p>
      <ul className="rules-bullets">
        <li>
          {TRACK_LABEL.CRAFT} and {TRACK_LABEL.CARE} keep their week with completions on at least {KEPT_MIN_DAYS} days and at
          least {KEPT_MIN_RAW} raw XP.
        </li>
        <li>
          {TRACK_LABEL.BODY} needs the same, plus {BODY_EFFORT_MINUTES} effort minutes from {CATEGORY_LABEL[EFFORT_CATEGORY]} tasks: minutes ×{" "}
          {EFFORT_WEIGHT.STANDARD} at {BAND_META.STANDARD.label}, × {EFFORT_WEIGHT.DEMANDING} at {BAND_META.DEMANDING.label} or{" "}
          {BAND_META.SEVERE.label}, × {EFFORT_WEIGHT.INTRO} at {BAND_META.INTRO.label}.
        </li>
        <li>
          {TRACK_LABEL.DUTY}: any missed must breaks the week. With {DUTY_MIN_OCCURRENCES} or more musts due that week,{" "}
          {KEPT_MIN_RAW} raw XP is all it needs, on any number of days; with fewer, it needs {DUTY_FALLBACK_COMPLETIONS}{" "}
          {TRACK_LABEL.DUTY} completions on {KEPT_MIN_DAYS} days and {KEPT_MIN_RAW} raw XP. A must done at its minimum holds;
          #play and study tasks never count.
        </li>
      </ul>
      <p>
        A week runs Monday to Sunday and is judged from {judgeDay} {edge} after its Sunday, so a Sunday ticked the next day
        still counts. A judged week is final. Up to {WEEK_JUDGE_MAX_WEEKS} weeks are judged at a time, oldest first.
      </p>
      <p>
        A run of kept weeks lifts the track&apos;s share of its attributes: +{pct(keptWeekBonusPercent(1))}% after one, and
        +{pct(keptWeekBonusPercent(fullAt))}% (the most) from {fullAt} in a row. Streak amplifiers never touch it. A
        track&apos;s tasks shift which attributes it feeds, but its share of any one attribute is at most its starting share
        or {TRACK_SHARE_CAP}%, whichever is more.
      </p>
      <div className="rules-scroll">
        <table className="rules-table">
          <tbody>
            {mpRows(dutyLive).map((r) => (
              <tr key={r.reason}>
                <td className="b">{LIFE_MP_REASON_LABEL[r.reason]}</td>
                <td className="num">
                  <span className="cur">
                    <CurrencyGlyph kind="mp" />
                    {mpFigure(r.amount)}
                    <span className="sr-only"> MP</span>
                  </span>
                </td>
                <td className="ink-2">
                  {r.per}
                  {r.note ? ` · ${r.note}` : ""}
                  {(CAPPED_REASONS as readonly string[]).includes(r.reason) ? " · weekly cap" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        At most {LIFE_MP_WEEK_CAP} MP a life week from {capped.slice(0, -1).join(", ")} and {capped[capped.length - 1]}{" "}
        together: Short goals take their share first, then kept tracks, then Full days.
      </p>
      <div className="rules-scroll">
        <table className="rules-table">
          <tbody>
            <tr>
              <th scope="col" className="t-eyebrow">
                Goal
              </th>
              <th scope="col" className="t-eyebrow">
                States
              </th>
              <th scope="col" className="t-eyebrow">
                Pays
              </th>
              <th scope="col" className="t-eyebrow">
                Set at least
              </th>
              <th scope="col" className="t-eyebrow">
                Paying at most
              </th>
              <th scope="col" className="t-eyebrow">
                Depth
              </th>
            </tr>
            {Object.values(GOAL_RULES).map((g) => (
              <tr key={g.horizon}>
                <td className="b">{g.name}</td>
                <td className="num">
                  <span className="cur">
                    <CurrencyGlyph kind="mp" />
                    {mpFigure(g.stated)}
                    <span className="sr-only"> MP</span>
                  </span>
                </td>
                <td className="ink-1">{g.binary ? "when finished" : `× progress, from ${pct(g.bar * 100)}%`}</td>
                <td className="num">
                  {g.minLifetimeDays} {g.minLifetimeDays === 1 ? "day" : "days"}
                </td>
                <td className="ink-1">
                  {g.maxPaying} {g.window === "LIFE_WEEK" ? "a life week" : `in ${g.windowDays} days`}
                </td>
                <td className="num">+{g.depth}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        A goal states its MP when it is set, and that figure never changes. Closing is final: a goal closed below its bar
        pays nothing. A goal past its due day is carried, never owed, until you reschedule or close it. Goal depth is capped
        at {GOAL_DEPTH_CAP} per track. Goals never pay XP.
      </p>
    </Card>
  );
}

// ─── Roadmap (roadmap.md F16 seam 12) ──────────────────────────────────────

/** What each week quest kind asks and what checks it (F14): the row's first words, never "Quest n of N". */
const WEEK_QUEST_KIND_ROWS: { row: string; asks: string; by: string }[] = [
  { row: "Bring … cards to the level", asks: "cards in the milestone's Domains brought to its level", by: "tested by your reviews" },
  { row: "Add … cards", asks: "new cards filed in its Domains", by: "counted by the app; it doesn't judge them" },
  { row: "Practice · … sessions", asks: "each of its practices' planned sessions", by: "from your ticks" },
  { row: "Step: …", asks: "its next one-off step", by: "you ticked it" },
  { row: "Checkpoint: … · log your score", asks: "its checkpoint, near the window's end", by: "you logged it · doesn't move your progress" },
];

/** 1/3 for a share that is one part in n. */
const oneIn = (share: number) => `1/${Math.round(1 / share)}`;

/** A share to one decimal at most: 60%, 62.5%. */
const sharePct = (n: number) => `${Number((n * 100).toFixed(1))}%`;

/**
 * The shares Proficiency's own formula (roadmap-proficiency.ts proficiencyOf)
 * gives a plan with these parts, read off a one-of-each basis: the table
 * below can't drift from what the roadmap computes (a Field Area without
 * practice reads cards 80% / milestones 20%).
 */
function proficiencySharesOf(withCards: boolean, withPractice: boolean): ProficiencyParts {
  return proficiencyOf({
    basis: {
      basisVersion: 1,
      cards: withCards ? [{ measureKey: "rules|cards", domainIds: [], level: TOP_LEVEL, target: 1 }] : [],
      practice: withPractice ? [{ itemLineageId: "rules|practice", planned: 1 }] : [],
      scheduled: 1,
    },
    cardLevels: {},
    kept: {},
    reached: 0,
    reachedOnTicks: false,
  }).shares;
}

const PROFICIENCY_PARTS = ["cards", "practice", "milestones"] as const;

/** Every part; a Field Area without practice; a track Area (practice, no cards). Short labels: the table fits 344 px. */
const PROFICIENCY_SHARE_ROWS: { label: string; shares: ProficiencyParts }[] = [
  { label: "All three", shares: proficiencySharesOf(true, true) },
  { label: "No practice", shares: proficiencySharesOf(true, false) },
  { label: "No cards", shares: proficiencySharesOf(false, true) },
];

/**
 * The roadmap's published rules: an aim and its milestones, the realism
 * checks, what a milestone pays, week quests, Proficiency and the Aim rank.
 * Every number is read from roadmap-types.ts (the frozen contract the
 * planner, the week quests, Proficiency and the Aim rank compute with) or
 * life-economy.ts, and every table is worked out by the same helpers, so the
 * page cannot publish a rule the roadmap does not apply. They are policy,
 * not facts. scripts/you-check.ts holds that no figure here is typed by hand,
 * that week quests are never a bare "quest", and that the Proficiency and Aim
 * rank cards keep their words apart from mastery and pay.
 */
function RoadmapRules({ edge, judgeDay }: { edge: string; judgeDay: string }) {
  const mid = GOAL_RULES.MID;
  const fewest = milestoneCountFor(0);
  const levels = Array.from({ length: TOP_LEVEL }, (_, i) => i + 1);
  const plans = Array.from({ length: MAX_MILESTONES }, (_, i) => i + 1).map((n) => ({
    n,
    gives: Array.from({ length: n }, (_, j) => aimRankName(rankIndexAt(j + 1))),
    top: topRankIndexOf(n),
  }));
  return (
    <>
      <Card title="Aims and milestones" sub="Policy, not facts: how the app plans toward an aim" wide>
        <p>
          An aim is set {SPAN_MIN_DAYS} to {SPAN_MAX_DAYS.toLocaleString("en-GB")} days ahead, in your own words, with the hours a week you give
          it. Gemini, when it is set up, drafts words only: milestone titles, topics, practices, steps, a checkpoint and
          which of your Domains each milestone needs. It writes no number. Code sets every date, level, target, session
          count and duration. A word Gemini wrote keeps its label until you check it or change its words, and a number in
          its words is struck through, never rewritten: that item can only be edited or removed. Nothing reaches Today in
          its words without your tap. At most {ROADMAP_DRAFTS_PER_DAY} Gemini drafts a day, a failed one included; the
          same request within {ROADMAP_REUSE_DAYS} days reuses the last one, and a reused draft doesn&apos;t count. Without
          Gemini the plan is built from your numbers or written by you, with the same checks.
        </p>
        <Formula>
          milestones = clamp(round(days ÷ {MILESTONE_TARGET_DAYS}), {fewest}, {MAX_MILESTONES})
        </Formula>
        <p>
          Each milestone spans {MILESTONE_MIN_DAYS} to {MILESTONE_MAX_DAYS} days and ends on a Sunday; the last ends on the
          aim&apos;s date. Its card level is one of {THRESHOLDS.join(", ")}: the first is the highest a new card can reach in{" "}
          {pct(THRESHOLD_SPAN_SHARE)} of the days to its due day, never below where you said you start, and levels never
          fall along the plan.
        </p>
        <div className="rules-scroll">
          <table className="rules-table">
            <tbody>
              <tr>
                <th scope="row" className="t-eyebrow">
                  Level
                </th>
                {THRESHOLDS.map((l) => (
                  <td key={l} className="num ink-2">
                    {l}+
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="t-eyebrow">
                  Days, every review passed
                </th>
                {THRESHOLDS.map((l) => (
                  <td key={l} className="num">
                    {floorBase(l)}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="t-eyebrow">
                  Days at the earliest
                </th>
                {THRESHOLDS.map((l) => (
                  <td key={l} className="num">
                    {floorStrict(l)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="t-meta">
          The fewest days a new card needs to reach each level at base review spacing, and with the luckiest interval; a
          loadout that stretches spacing stretches them too.
        </p>
        <Formula>target = baseline + ⌊intensity × (expected − baseline)⌋</Formula>
        <p>
          Intensity is Light {pct(INTENSITY.LIGHT)}, Steady {pct(INTENSITY.STEADY)} or Push {pct(INTENSITY.PUSH)} of the
          gain your reviews can be expected to bring by the due day. A milestone asks at least max(
          {MIN_INCREMENT_CARDS_FLOOR}, ⌈{MIN_INCREMENT_SHARE} × baseline⌉) cards above its baseline, or its level steps
          down. A practice counts {pct(KEEP_SHARE)} of its planned sessions, rest and vacation days excused.
        </p>
        <p>
          A milestone&apos;s progress is the lowest of its parts, read from stored readings: its Domains&apos; cards at its
          level (tested by your reviews), the sessions you ticked and the steps you did. With no reading it is not
          measured, and nothing is invented in its place.
        </p>
      </Card>

      <Card title="Is the plan realistic?" sub="What the app checks, and what it can't">
        <Formula>available = min(your hours × A, ramp cap), over the days not held</Formula>
        <ul className="rules-bullets">
          <li>
            A is how often you keep recurring tasks of {BAND_META[ADHERENCE_MIN_BAND].label} or harder and{" "}
            {ADHERENCE_MIN_MINUTES} minutes or more, never below {ADHERENCE_FLOOR}. Until {ADHERENCE_MIN_JUDGED} of them are
            judged it is {DECLARED_FACTOR}, and the time check reads Unverified.
          </li>
          <li>
            Once {CALIBRATION_WEEKS} weeks of your tracked time are measured, a plan may add at most max({RAMP_FLOOR_MIN} min,{" "}
            {pct(RAMP_ALLOWANCE)} of your median tracked week) on top of it: the ramp cap.
          </li>
          <li>
            App-tracked time, worst calendar week: up to {pct(TIME_FITS_MAX)} of the time available Fits, up to{" "}
            {pct(TIME_TIGHT_MAX)} is Tight, more is Over. A review counts {REVIEW_SECONDS} s and a new card {CARD_WRITE_MIN}{" "}
            min (assumed: neither is timed); practices get {pct(PRACTICE_BUDGET_SHARE)} of the time left. It counts only what
            the app tracks: reviews, new cards and the plan&apos;s practices. Time to study the material elsewhere isn&apos;t
            estimated.
          </li>
          <li>
            Reach discounts each pass a card still needs by your pass share, measured over {PASS_SHARE_WINDOW_DAYS} days
            once you have {PASS_SHARE_MIN_REVIEWS} reviews; until then it is the best case, and says so. The pass share reads
            high: a lapse by neglect isn&apos;t logged.
          </li>
          <li>
            A target code fitted reads Fitted, with its arithmetic and no verdict. A target you type reads Fits, Tight (only
            in the best case), Over (beyond it) or Impossible (faster than the review schedule allows). Impossible blocks the
            plan; Over needs your &quot;keep it over&quot; switch, and shows for good.
          </li>
          <li>
            The aim itself is checked only against your own &quot;hours this usually takes&quot; figure and its source.
            Without one it reads &quot;Aim not checked&quot;.
          </li>
        </ul>
      </Card>

      <Card title="What a milestone pays" sub="Only through the Mid goal rules above">
        <p>
          Starting a milestone makes it a {mid.name} goal on Today. It states{" "}
          <span className="cur">
            <CurrencyGlyph kind="mp" />
            {mpFigure(mid.stated)}
            <span className="sr-only"> MP</span>
          </span>{" "}
          × progress from {pct(mid.bar)} only when the practices it adds plan at least {PRACTICE_PAY_FLOOR_MIN} minutes a
          week, those minutes are at least {oneIn(PRACTICE_PAY_SHARE)} of its planned tracked minutes, and the milestone has
          never paid before. Otherwise it pays nothing and says why: knowledge is paid by reviews, so a milestone of cards
          alone pays nothing.
        </p>
        <ul className="rules-bullets">
          <li>
            The Mid limits apply as to any goal: at most {mid.maxPaying} paying in {mid.windowDays} days, shared with your
            own goals, and only once it is {mid.minLifetimeDays} days old.
          </li>
          <li>Start needs at least {START_MIN_DAYS_TO_DUE} days to the milestone&apos;s due day.</li>
          <li>
            Once started, its due day is its goal&apos;s: a Reschedule on Today moves it, and progress, pay and reach are
            all judged on that one day.
          </li>
          <li>
            A milestone pays once. Started again after a drop, it is still the same milestone: once the copy starts, the
            dropped goal is never measured again and pays nothing, and if the dropped goal was brought back and paid first,
            the copy pays nothing and names the day it paid.
          </li>
          <li>Progress comes from your records alone; no button adds to it. The aim itself pays nothing.</li>
        </ul>
      </Card>

      <Card title="Week quests (not the daily review quest)" sub="This week's actions for the milestone you started" wide>
        <p>
          The daily review quest above is unchanged. Week quests slice the milestone you started into this life week, Monday{" "}
          {edge} to Monday {edge}. Each is checked from the app&apos;s own records: none has a checkbox, and none pays.
        </p>
        <div className="rules-scroll">
          <table className="rules-table">
            <tbody>
              <tr>
                <th scope="col" className="t-eyebrow">
                  Row
                </th>
                <th scope="col" className="t-eyebrow">
                  Asks for
                </th>
                <th scope="col" className="t-eyebrow">
                  Checked by
                </th>
              </tr>
              {WEEK_QUEST_KIND_ROWS.map((r) => (
                <tr key={r.row}>
                  <td className="b">{r.row}</td>
                  <td className="ink-1">{r.asks}</td>
                  <td className="ink-2">{r.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="rules-bullets">
          <li>
            Each count is the gap left ÷ the weeks left. Bring asks at most what can be expected to reach the level this week
            at the pass rate stored when the milestone started. A card that was due anyway counts: passing its review is the
            step.
          </li>
          <li>
            Add asks at most max({WEEK_QUEST_ADD_MIN_CAP}, ⌈{WEEK_QUEST_CATCHUP_FACTOR} × the new cards a week the plan
            needed at Start⌉), so missed weeks never pile up (the catch-up cap), and at most what the week&apos;s time holds
            at {CARD_WRITE_MIN} min a card after practices, reviews and your other Fields&apos; weekly quotas (the capacity
            cap). A card added in the aim&apos;s own Field counts toward that Field&apos;s weekly quota too.
          </li>
          <li>
            Sessions ask for the plan&apos;s own count, and missed ones never carry into the next week. A step shows once the
            window passes its share, and always in the milestone&apos;s last week; the checkpoint once{" "}
            {pct(WEEK_QUEST_CHECKPOINT_FROM)} of the window has passed, and its score never moves progress.
          </li>
          <li>
            A week holds at most {WEEK_QUESTS_PER_WEEK_MAX} week quests, and Today shows {WEEK_QUEST_ROWS_TODAY} before the
            rest. The set is fixed just after Monday {edge} and never changes mid-week; its results are written from the{" "}
            {judgeDay} {edge} after its Sunday ({WEEK_QUEST_FINAL_LAG_DAYS} days on), once late ticks and make-ups are in.
          </li>
          <li>Week quests pay nothing, add nothing to Today&apos;s counts or the bell, never read red, and never link to Review.</li>
        </ul>
      </Card>

      <Card title="Proficiency" sub="One figure per aim: what you hold now, measured, so it can fall">
        <Formula>Proficiency = Σ share × part, over the parts present</Formula>
        <div className="rules-scroll">
          <table className="rules-table">
            <tbody>
              <tr>
                <th scope="col" className="t-eyebrow">
                  Parts present
                </th>
                {PROFICIENCY_PARTS.map((k) => (
                  <th key={k} scope="col" className="t-eyebrow">
                    {k}
                  </th>
                ))}
              </tr>
              {PROFICIENCY_SHARE_ROWS.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="t-eyebrow">
                    {r.label}
                  </th>
                  {PROFICIENCY_PARTS.map((k) => {
                    const share = r.shares[k];
                    return (
                      <td key={k} className={share == null ? "num ink-2" : "num"}>
                        {share == null ? "—" : sharePct(share)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="rules-bullets">
          <li>
            Cards, tested by your reviews: for each end target of T cards at level L, the T best cards in its Domains give Σ
            weight(min(level, L)) ÷ (T × weight(L)). A card above L counts as L; a missing card counts nothing.
          </li>
          <li>Practice, from your ticks: Σ min(kept, planned) ÷ Σ planned, practice by practice.</li>
          <li>Milestones: reached ÷ scheduled. A reach that rests on ticks counts once it has held {REACH_CONFIRM_DAYS} days.</li>
          <li>
            A plan without practice (a Field Area with no practices), or without cards (a track Area), renormalises the
            shares over the parts it has, as the table shows.
          </li>
        </ul>
        <p>
          A level&apos;s weight is the days of review spacing a card has come through to reach it, at base spacing. A card
          just written, or passed once, weighs nothing, so writing cards alone moves nothing.
        </p>
        <Samples head={["level", "weight"]} rows={levels.map((l) => [String(l), String(LEVEL_WEIGHT(l))])} />
        <p>
          It shows as a whole percentage, rounded down, from the day&apos;s stored reading. A slipped card lowers it the same
          day. A re-plan changes it as a change of plan, shown with the figure before it, never as a gain. It pays nothing
          and sets no goal&apos;s progress.
        </p>
      </Card>

      <Card title="Aim rank" sub="A record of the milestones you reached: kept for good, and it pays nothing">
        <p className="ink-0">{AIM_RANKS.join(" → ")}</p>
        <p>
          Every aim starts at {aimRankName(0)}. Reaching the milestone at place j in the plan gives the Aim rank at place
          min(j, {RANK_MILESTONE_MAX}); reaching the aim gives the Aim rank {aimRankName(RANK_TOP)} on a plan that has had{" "}
          {PARAGON_MIN_MILESTONES} or more milestones.
        </p>
        <div className="rules-scroll">
          <table className="rules-table">
            <tbody>
              <tr>
                <th scope="col" className="t-eyebrow">
                  Milestones
                </th>
                <th scope="col" className="t-eyebrow">
                  Each one reached gives
                </th>
                <th scope="col" className="t-eyebrow">
                  Top rank on this plan
                </th>
              </tr>
              {plans.map((p) => (
                <tr key={p.n}>
                  <td className="num">{p.n}</td>
                  <td className="ink-1">{p.gives.join(" · ")}</td>
                  <td className="ink-1">
                    {aimRankName(p.top)}
                    {p.top === RANK_TOP ? ", with the aim" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="rules-bullets">
          <li>A reach that rests on ticks counts once it has held {REACH_CONFIRM_DAYS} days, so an undone tick leaves nothing behind.</li>
          <li>A re-plan never raises a milestone&apos;s Aim rank, and moving milestones to Later never lifts the others.</li>
          <li>
            A milestone dropped and started again keeps its place and counts once: a plan&apos;s milestones are counted by
            place, never by row, so starting one again never adds a milestone to the plan or lifts the top rank on this
            plan.
          </li>
          <li>
            The rank is kept for good: a slipped card lowers Proficiency, never the Aim rank. A new Aim rank is marked on the
            Aim card for {RANK_NEW_DAYS} days.
          </li>
          <li>It is not a title, and it pays nothing.</li>
        </ul>
      </Card>
    </>
  );
}

const EXAMPLE_BASE: PriceInput = {
  band: "STANDARD",
  bandOverride: 0,
  machineMinutes: 30,
  estMinutes: 30,
  minutes: null,
  timing: "ON_TIME",
  recurring: false,
  streakDays: 0,
  repeatN: 1,
  introBefore: 0,
  mode: "FULL",
};

/** The worked examples, priced live. They are the same cases scripts/life-grade-check.ts holds to fixed values. */
const EXAMPLES: { name: string; input: Partial<PriceInput>; rawBefore?: number }[] = [
  { name: "File tax return — Demanding, estimated 120 min, done in 150, on time", input: { band: "DEMANDING", machineMinutes: 120, estMinutes: 120, minutes: 150 } },
  { name: "Dishes — daily, Intro, 15 min, on a 30-day streak", input: { band: "INTRO", machineMinutes: 15, estMinutes: 15, recurring: true, streakDays: 30 } },
  { name: "Call mum — Standard, 20 min, the second call today", input: { band: "STANDARD", machineMinutes: 20, estMinutes: 20, repeatN: 2 } },
  { name: "Stretch 15m — its minimum version", input: { band: "STANDARD", machineMinutes: 30, estMinutes: 15, recurring: true, streakDays: 20, mode: "MVV" } },
  { name: "Take out bins — the 7th routine task today", input: { band: "INTRO", machineMinutes: 5, estMinutes: 5, introBefore: 6 } },
  { name: "A 30-minute Standard task after 90 raw already today", input: {}, rawBefore: 90 },
];

/** Duty's examples, priced live by the functions that charge and pay (scripts/duty-check.ts holds the same goldens). */
const DUTY_EXAMPLES: { name: string; task: Pick<PriceInput, "band" | "machineMinutes" | "estMinutes">; mode: PayMode }[] = [
  { name: "Dishes — daily, Intro, 15 min", task: { band: "INTRO", machineMinutes: 15, estMinutes: 15 }, mode: "FULL" },
  { name: "Stretch 15m — its minimum version", task: { band: "STANDARD", machineMinutes: 30, estMinutes: 15 }, mode: "MVV" },
  { name: "Write a thesis chapter — Severe, 240 min", task: { band: "SEVERE", machineMinutes: 240, estMinutes: 240 }, mode: "FULL" },
];

/** LifeSettings.settledThroughDay, cached with the life tags settlement invalidates. Null on any failure: the line is then simply absent. */
async function loadDutyCursor(userId: string): Promise<DayKey | null> {
  try {
    return await cached(`dutyCursor:${userId}`, ["life", "activity"], async () => {
      const row = await prisma.lifeSettings.findUnique({ where: { userId }, select: { settledThroughDay: true } });
      return row?.settledThroughDay ? keyOfDateColumn(row.settledThroughDay) : null;
    });
  } catch {
    return null;
  }
}

/**
 * Duty (m2-refit.md): the compulsory contract, its forgiveness and the
 * akrasia horizon. In force from the launch day only; every number is read
 * from duty-economy.ts and life-grade.ts, and every example is priced live.
 */
function DutyRules({ edge }: { edge: string }) {
  // Two rest days, the example the judge's own check holds (character-check §5).
  const floors = keptFloorsOf(2);
  const makeUp = (t: (typeof DUTY_EXAMPLES)[number]) =>
    priceTask({ ...EXAMPLE_BASE, ...t.task, recurring: true, timing: "MAKE_UP", streakDays: 0, mode: t.mode }, { rawBefore: 0 }, "DUTY");
  return (
    <>
      <Card title="Duty: musts, debt and make-ups" sub="A must kept pays as any task; a must missed is owed" wide>
        <Formula>
          debt = min({DEBT_CAP}, B × E(estimate))
        </Formula>
        <ul className="rules-bullets">
          <li>
            A day is settled at {edge}, {SETTLE_LAG_DAYS} days after it began, once the whole next day has been there to record
            it. A must still open then is owed: its debt is Duty XP taken away, dated the missed day. It never grows, and has no streak, repeat
            or knee factor. At most {DEBT_OPEN_PER_TEMPLATE} debts stay open per task and {DEBT_OPEN_TOTAL_CAP} XP in total;
            past that a miss is recorded with no debt.
          </li>
          <li>
            Making it up repays the debt in full and pays the task at × {f2(TIMING_FACTOR.MAKE_UP)}, with no streak bonus; its
            minimum version pays × {f2(PAY_MODE_FACTOR.MVV)} on top. Made up within {MAKEUP_RESTORE_DAYS} days of the missed
            day, its streak comes back, once per {MAKEUP_RESTORE_EVERY_DAYS} days per task; later, the debt is repaid and the
            streak stays broken. A make-up can be undone for {UNDO_WINDOW_MINUTES} minutes on the same day.
          </li>
          <li>
            A deadline task done late counts as kept when it is done within {MAKEUP_RESTORE_DAYS} days of its due day. Once its
            due day is settled with it open, it is made up from its card.
          </li>
          <li>
            A missed must breaks its own streak, its consistency bonus and the Duty week. It never breaks the daily streak on a
            day you did other things. Settling a day locks it: nothing on it can be ticked or undone after.
          </li>
          <li>An Inbox item is never owed until it is clarified. A study must met by the day&apos;s reviews is never owed.</li>
          <li>
            With Accept a loss on (Settings › Days), a debt {WRITE_OFF_MIN_DAYS} days old or more can be written off. The miss
            stays on the ledger.
          </li>
        </ul>
        <ul className="rules-examples">
          {DUTY_EXAMPLES.map((ex) => {
            const debt = debtFor({ ...ex.task, bandOverride: 0 });
            const r = makeUp(ex);
            return (
              <li key={ex.name}>
                <p className="ink-0">{ex.name}</p>
                <p className="t-mono ink-2">
                  missed owes <b className="ink-0">−{f1(debt)}</b> · made up {ex.mode === "MVV" ? "at its minimum " : ""}pays{" "}
                  <b className="ink-0">{f1(r.xp)}</b> ({describeReceipt(r)})
                </p>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Freezes, rest and repair" sub="Held days owe nothing and hold every streak">
        <p>
          A freeze is earned on a settled day with activity once {FREEZE_EARN_ACTIVE_DAYS} active days have built up since the last
          one. At most {FREEZE_MAX} are banked, starting from {FREEZE_START_BALANCE}. A day with nothing on it spends one by itself
          when that keeps a live streak or covers a must; it excuses every must that day. On Today, an unsettled yesterday with
          nothing on it can spend one by hand.
        </p>
        <ul className="rules-bullets">
          <li>Rest: declared before the day starts, at most {REST_PER_WEEK} a week.</li>
          <li>Sick: declared the same day, once per {SICK_EVERY_DAYS} days.</li>
          <li>
            Vacation: {VACATION_MIN_DAYS} to {VACATION_MAX_DAYS} days in a row, from tomorrow, at most {VACATION_DAYS_PER_365} days
            in any {VACATION_BUDGET_SPAN_DAYS}. A cancelled day is given back.
          </li>
          <li>A must marked Even on rest days stays owed on rest, sick and vacation days; only a freeze covers it.</li>
          <li>A Full day straight after a broken day repairs it, once every {REPAIR_EVERY_DAYS} days.</li>
        </ul>
        <p>
          Rest, sick and vacation days pro-rate a week&apos;s floors by the days left: with {floors.restDays} of them a track
          needs {floors.days} days and {f1(floors.raw)} raw XP, {TRACK_LABEL.BODY} {f1(floors.effortMinutes)} effort minutes and{" "}
          {TRACK_LABEL.DUTY}&apos;s fallback {floors.dutyCompletions} completions. A week whose pro-rated floors are not met is
          held, not missed, when {HELD_WEEK_REST_DAYS} or more of its days were rest: it bridges the kept-week streak and pays
          nothing. Freeze days never pro-rate.
        </p>
      </Card>

      <Card title="Changing a must" sub={`Easier takes ${AKRASIA_DAYS} days; stronger is immediate`}>
        <p>
          Making a must easier (no longer a must, Even on rest days off, or archiving or dropping it) takes effect{" "}
          {AKRASIA_DAYS} days later; until then every day is judged as before. Within {TYPO_GRACE_MIN} minutes of capturing
          it, any change is immediate; after that a must can&apos;t go back to being an idea until it is no longer a must, and
          a deadline must is never put off past its day. Making it stronger, or cancelling a pending change, is immediate
          from today and never reaches back.
        </p>
      </Card>
    </>
  );
}

export default async function RulesPage() {
  const effortSamples = [5, 10, 15, 20, 30, 60, 120, 240];
  const streakSamples = [0, 7, 14, 30, CONSISTENCY_CAP_DAYS];
  const kneeSamples = [50, 100, 150, 200, 300, 500, Math.round(KNEE_CAP_AT_RAW)];
  // The curve's coefficient, read back from the curve itself (C at one day is 1 + rate / 100).
  const streakRate = Math.round((consistencyFactor(1) - 1) * 1000) / 10;
  const edge = `${String(DAY_START_HOUR).padStart(2, "0")}:00`;
  // Duty (decisions 1, 5, 30): the pre-Duty rules until its launch day, an honest notice while it is
  // ahead, and its rules in force from it, with 'settled through' when settlement lags.
  const today = todayKey();
  const dutyLaunch = dutyLaunchDay();
  const dutyLive = dutyPhaseOf(today, dutyLaunch) === "live";
  const stakesAhead = preLaunchNotice(today, dutyLaunch);
  const settledLine = dutyLive ? dutySettledLine(await loadDutyCursor(getCurrentUserId()), today) : null;

  return (
    <div className="page today-rules cq-main">
      <div className="rules-intro">
        <p className="t-body">
          How a day is judged, and how a task is sized once and priced every time. Every number here is read from the code
          that pays, and every example is priced by it as the page loads. Nothing is random: what a row says is what a tick
          pays.
        </p>
        <p className="t-mono ink-2">
          formula {FORMULA_VERSION} · sizing prompt v{SIZING_PROMPT_VERSION}
        </p>
        {stakesAhead && (
          <p className="t-body">
            {stakesAhead}. Until then nothing is owed; rest and vacation for days from then can already be declared.
          </p>
        )}
        {settledLine && <p className="t-meta">{settledLine}. Later days are settled as soon as it catches up.</p>}
      </div>

      <div className="rules-grid">
        <Card title="How a day is judged" sub="What keeps the streak and what makes a Full day" wide>
          <ol className="rules-list">
            <li>
              A life day runs from {edge} to {edge}. Any tick or any review keeps the day streak; an empty day ends it only
              once the whole next day has passed.
              {dutyLive && " A rest, sick or vacation day, a spent freeze and a repaired day hold it instead."}
            </li>
            <li>
              Yesterday stays open until today ends: anything done yesterday can be ticked today at the full rate. A tick can
              be undone for {UNDO_WINDOW_MINUTES} minutes on the same day, and the undo nets to zero, streak included.
            </li>
            <li>
              Life XP and review points are two ledgers and are never added together. Reviews pay review points and no life
              XP; a study task (&apos;review 20&apos;) is paid by the reviews, never twice.
            </li>
            {dutyLive ? (
              <>
                <li>
                  A Full day is every must due that day done or excused (the minimum counts), the review quest met (as many
                  reviews as the day opened with due, up to {QUEST_CAP}; with no day-open record, {QUEST_CAP} reviews), and one
                  life deed. Settlement records it; up to +{FULL_DAY_MP} MP is paid when the week is judged, after the kept
                  tracks.
                </li>
                <li>
                  Each day is settled at {edge}, {SETTLE_LAG_DAYS} days after it began: a must still open then is owed (Duty,
                  below). Record yesterday on Today can settle yesterday early; that locks it.
                </li>
              </>
            ) : (
              <>
                <li>
                  A Full day is every must done or excused (the minimum counts), the review quest met (as many reviews as the
                  day opened with due, up to {QUEST_CAP}; nothing due counts as met), and one life deed. Today counts it now;
                  up to +{FULL_DAY_MP} MP for it arrives with daily settlement.
                </li>
                <li>
                  Not yet in force (they arrive with daily settlement): rest, sick and vacation days that hold the streak,
                  banked freezes, owed musts and their make-ups, and a Full day repairing the broken day before it once a week.
                </li>
              </>
            )}
          </ol>
        </Card>

        <Card title="The price" sub="One formula, the same in the browser and on the server" wide>
          <Formula>raw = B × E × T × C × D × V × K</Formula>
          <Formula>paid = g(R_before + raw) − g(R_before)</Formula>
          <p>
            A price is rounded to 0.1. Under the daily knee it is exactly what is paid. The most one completion can be priced
            at is <span className="t-mono">{f1(RAW_WORST_CASE)}</span>: Severe {BAND_BASE.SEVERE} × effort {f2(EFFORT_CAP)} ×
            consistency {f2(CONSISTENCY_CAP)}, whatever is typed or claimed.
          </p>
        </Card>

        <Card title="B · Band" sub="Demand per minute and the barrier to start — never length">
          <div className="rules-scroll">
            <table className="rules-table">
              <tbody>
                {BANDS.map((b) => (
                  <tr key={b}>
                    <td className="b">{BAND_META[b].label}</td>
                    <td className="num">{BAND_BASE[b]}</td>
                    <td className="ink-2">{BAND_META[b].blurb}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            A self-rating moves the band {signed(BAND_OVERRIDE_MIN)} to {signed(BAND_OVERRIDE_MAX)} steps — never above the
            machine&apos;s band + {BAND_OVERRIDE_MAX}, never below Intro. It changes future completions only, is printed
            &apos;self-rated&apos; on every receipt, and after the first completion can change once per{" "}
            {BAND_OVERRIDE_COOLDOWN_DAYS} days.
          </p>
        </Card>

        <Card title="E · Effort" sub="Minutes, with diminishing returns">
          <Formula>
            E(m) = min({f1(EFFORT_CAP)}, {f1(EFFORT_FLOOR)} + m / (m + {EFFORT_HALF_MINUTES}))
          </Formula>
          <Samples head={["min", "E"]} rows={effortSamples.map((m) => [String(m), f2(effortFactor(m))])} />
          <p>
            A typed estimate counts between {EST_MINUTES_MIN} and {EST_MINUTES_MAX} minutes, and never as more than{" "}
            {EST_EFF_MACHINE_MULTIPLE}× the minutes the task was sized at. Reported minutes count between {REPORTED_MIN_SHARE}×
            and {REPORTED_MAX_SHARE}× that, and never above {REPORTED_MINUTES_MAX}. Nothing reported counts the estimate.
          </p>
        </Card>

        <Card title="T · Timing" sub="There is no early bonus">
          <div className="rules-scroll">
            <table className="rules-table">
              <tbody>
                {(Object.keys(TIMING_FACTOR) as Timing[]).map((t) => (
                  <tr key={t}>
                    <td className="num w">{f2(TIMING_FACTOR[t])}</td>
                    <td className="ink-1">{TIMING_WORDS[t]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            {RECORD_WINDOW_DAYS === 1
              ? "Yesterday stays open until today ends: anything done yesterday can be ticked today at full rate."
              : `The last ${RECORD_WINDOW_DAYS} days stay open: anything done in them can be ticked at full rate.`}{" "}
            A tick can be undone for {UNDO_WINDOW_MINUTES} minutes, on the same day.
          </p>
        </Card>

        <Card title="C · Consistency" sub="Recurring tasks only; the same curve as Field streaks">
          <Formula>
            C = 1 + min({Math.round((CONSISTENCY_CAP - 1) * 100)}, {streakRate} · √days) / 100
          </Formula>
          <Samples head={["days", "C"]} rows={streakSamples.map((d) => [String(d), f2(consistencyFactor(d))])} />
          <p>
            Days are kept occurrences in a row, converted to days: a Mon · Thu habit kept 10 times is 35 days. A target habit
            counts kept weeks × 7. The cap, {f2(CONSISTENCY_CAP)}, is reached at {CONSISTENCY_CAP_DAYS} days. The minimum
            version and one-off tasks use 1.00.
          </p>
        </Card>

        <Card title="D · Repeats" sub="The same task again today pays less each time">
          <Formula>
            D = e^(−{REPEAT_DECAY_LAMBDA} · (n − 1))
          </Formula>
          <Samples head={["nth today", "D"]} rows={[1, 2, 3, 4, 5].map((n) => [String(n), f2(repeatFactor(n))])} />
          <p>
            n counts today&apos;s completions of the same task, and of any task whose title is nearly the same words (similarity
            ≥ {DECAY_GROUP_DICE}), so one chore split into five copies decays like one chore done five times.
          </p>
        </Card>

        <Card title="V · Routine volume" sub="Intro tasks only">
          <Formula>
            V = e^(−{INTRO_VOLUME_LAMBDA} · max(0, k − {INTRO_FREE_BEFORE}))
          </Formula>
          <Samples head={["routine #", "V"]} rows={[6, 7, 8, 10, 15].map((n) => [String(n), f2(introVolumeFactor(n - 1))])} />
          <p>
            k is the Intro tasks already done today, so the first {INTRO_FREE_BEFORE + 1} pay in full. It keeps a day of trivial
            ticks from outpaying one piece of real work.
          </p>
        </Card>

        <Card title="K · Kind" sub="How a completion is paid">
          <div className="rules-scroll">
            <table className="rules-table">
              <tbody>
                {(Object.keys(PAY_MODE_FACTOR) as PayMode[]).map((m) => (
                  <tr key={m}>
                    <td className="num w">{f2(PAY_MODE_FACTOR[m])}</td>
                    <td className="ink-1">{MODE_WORDS[m]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="The daily knee" sub="Shared by all life XP; shown on receipts, never as a bar" wide>
          <Formula>
            g(R) = R up to {KNEE_FULL_RATE}; then {KNEE_FULL_RATE} + {KNEE_SCALE} · ln(1 + (R − {KNEE_FULL_RATE}) / {KNEE_SCALE}); at most{" "}
            {KNEE_CAP}
          </Formula>
          <Samples head={["raw today", "paid today"]} rows={kneeSamples.map((r) => [String(r), f1(kneeG(r))])} />
          <p>
            R_before is the raw total already earned today, so a day always pays g(ΣR) in whatever order its tasks are done.
            The day stops growing at {KNEE_CAP} (about {Math.round(KNEE_CAP_AT_RAW)} raw), which is also the most a forged day
            could pay. Two completions landing at the same instant can leave the day a little off g(ΣR); that drift is not
            corrected yet.
          </p>
        </Card>

        <Card title="Worked examples" sub="Priced now by the function that pays" wide>
          <ul className="rules-examples">
            {EXAMPLES.map((ex) => {
              const r = priceTask({ ...EXAMPLE_BASE, ...ex.input }, { rawBefore: ex.rawBefore ?? 0 }, "DUTY");
              return (
                <li key={ex.name}>
                  <p className="ink-0">{ex.name}</p>
                  <p className="t-mono ink-2">
                    {describeReceipt(r)} · pays <b className="ink-0">{f1(r.xp)}</b>
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Sizing" sub="The AI sizes a task once; the formula prices it every time">
          <p>
            A capture is written at once with a lexical grade from {LIFE_RULE_COUNT} word rules (confidence = score / (score +
            5)). Within {SIZING_WINDOW_HOURS} hours the model ({TASK_SIZING_MODEL}, prompt v{SIZING_PROMPT_VERSION}) may refine
            it once. It only chooses a category, a band, a duration and up to three attributes; this code turns those into
            numbers.
          </p>
          <ul className="rules-bullets">
            <li>An answer outside the allowed choices keeps the lexical value.</li>
            <li>
              When the lexical grade is at least {pct(SIZING_LOCK_CONFIDENCE)} sure and the model is two or more bands away, the
              band moves one step.
            </li>
            {BAND_MINUTE_CAPS.map((c) => (
              <li key={c.maxMinutes}>
                A task of {c.maxMinutes} minutes or less is at most {BAND_META[c.maxBand].label}.
              </li>
            ))}
            <li>
              Attributes blend {pct(SIZING_AI_COMPOSITION_SHARE)} model, {pct(1 - SIZING_AI_COMPOSITION_SHARE)} lexical.
              Confidence is {f1(SIZING_CONFIDENCE_BASE)} + {f1(SIZING_CONFIDENCE_LEXICAL_SHARE)} × the lexical confidence; the
              model&apos;s reason is kept, up to {SIZING_BASIS_CHARS} characters.
            </li>
            <li>A task with the same words as one already sized copies that grade instead of asking again.</li>
            <li>
              At most {SIZING_DAILY_CAP} model sizings a day. A failed one keeps the lexical grade and reads &apos;AI
              unavailable&apos;; Resize can ask again while it has made fewer than {SIZING_MAX_ATTEMPTS} attempts.
            </li>
            <li>The grade freezes at the first completion or after {SIZING_WINDOW_HOURS} hours, and is never raised by failing.</li>
          </ul>
        </Card>

        <Card title="Durations and tracks" sub="What each choice means in numbers">
          <Samples head={["band", "minutes"]} rows={DURATION_BANDS.map((d) => [d, String(DURATION_BAND_MINUTES[d])])} />
          <div className="rules-scroll">
            <table className="rules-table">
              <tbody>
                {TRACKS.map((track) => (
                  <tr key={track}>
                    <td className="b w">{TRACK_LABEL[track]}</td>
                    <td className="ink-1">
                      {CATEGORIES.filter((c) => CATEGORY_TRACK[c] === track)
                        .map((c) => CATEGORY_LABEL[c])
                        .join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="t-meta">A #body, #duty, #craft or #care tag sets the track instead.</p>
        </Card>

        <Card title="Habit strength" sub="Rises when kept, falls when missed, never resets">
          <Formula>
            kept: S = S · {(1 - HABIT_ALPHA).toFixed(3)} + {HABIT_ALPHA} · missed: S = S · {(1 - HABIT_ALPHA).toFixed(3)}
          </Formula>
          <p>
            The minimum version, a skip and an excused day leave it unchanged, and today and yesterday are never judged while
            they can still be ticked.
          </p>
          <Samples head={["rung", "from"]} rows={HABIT_RUNGS.map((r) => [r.rung, f2(r.from)])} />
        </Card>

        <TracksRules />

        {dutyLive ? (
          <DutyRules edge={edge} />
        ) : (
          <Card title="Not yet in force" sub="Arrives with compulsory duties; nothing is charged today">
            <p>
              A missed compulsory occurrence will owe min({DEBT_CAP}, B × E(estimate)) — no streak, repeat or knee — and never
              grows. At most {DEBT_OPEN_PER_TEMPLATE} open per task and {DEBT_OPEN_TOTAL_CAP} in total; past that a miss is
              recorded with no debt. Making it up repays it in full.
            </p>
            <p>
              <Link href="/today" className="link">
                Back to Today
              </Link>
            </p>
          </Card>
        )}
      </div>

      <section aria-labelledby="rules-roadmap" style={{ marginTop: 28 }}>
        <SectionHeader id="rules-roadmap" title="Roadmap" aside="policy, not facts · read from the code that plans" />
        <div className="rules-grid">
          <RoadmapRules edge={edge} judgeDay={WEEKDAY_AFTER_SUNDAY[WEEK_QUEST_FINAL_LAG_DAYS % WEEKDAY_AFTER_SUNDAY.length]} />
        </div>
      </section>
    </div>
  );
}
