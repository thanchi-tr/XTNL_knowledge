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
  AIM_DEPTHS,
  AIM_RANKS,
  CALIBRATION_WEEKS,
  CARDS_PER_OUTLINE_LINE,
  CARD_WRITE_MIN,
  CLEARANCE_SERIES_DAYS,
  CLEARANCE_WINDOW_DAYS,
  COVER_FLOOR_CARDS,
  COVER_MAX,
  COVER_MIN,
  COVER_SHARE,
  C_PRIOR,
  DECLARED_FACTOR,
  DEPTH_DEFAULT,
  DEPTH_DOMAINS_MAX,
  FIRST_RANK_MAX_DAYS,
  KEEP_SHARE,
  LEVEL_WEIGHT,
  LONG_GAP_LEVEL,
  MAX_MILESTONES,
  MILESTONE_MAX_DAYS,
  MILESTONE_MIN_DAYS,
  MIN_INCREMENT_CARDS_FLOOR,
  NON_RECALL_TYPES,
  OFF_DAY_CLEAR_SHARE,
  OVER_PACE_FACTOR,
  PACE_SHARE,
  PARAGON_MIN_MILESTONES,
  PASS_SHARE_MIN_REVIEWS,
  PASS_SHARE_WINDOW_DAYS,
  PRACTICE_BUDGET_SHARE,
  PRACTICE_PAY_FLOOR_MIN,
  PRACTICE_PAY_SHARE,
  P_LONG_CAP,
  P_PRIOR,
  RAMP_ALLOWANCE,
  RAMP_FLOOR_MIN,
  RANK_NEW_DAYS,
  RANK_TOP,
  REACH_CONFIRM_DAYS,
  REACH_STRIKE_LIMIT,
  RETRY_ENTRY_DAYS,
  REVIEW_SECONDS,
  RHO_MIN_DAYS,
  RHO_PRIOR,
  ROADMAP_DRAFTS_PER_DAY,
  ROADMAP_GEMINI_LIVE,
  ROADMAP_REUSE_DAYS,
  SCHEDULE_BOUND_SHARE,
  SPAN_MAX_DAYS,
  SPAN_MIN_DAYS,
  STAGE_KEYS,
  STAGE_LEVEL,
  STAGE_NAMES,
  STAGE_PRACTICE_BAND_MIN,
  STAGE_RANK,
  START_MIN_DAYS_TO_DUE,
  TIME_FITS_MAX,
  TIME_TIGHT_MAX,
  TOP_LEVEL,
  TRACK_PARAGON_MIN_DAYS,
  TRACK_STAGE_SHARES,
  WEEK_QUESTS_PER_WEEK_MAX,
  WEEK_QUEST_ADD_MIN_CAP,
  WEEK_QUEST_CATCHUP_FACTOR,
  WEEK_QUEST_CHECKPOINT_FROM,
  WEEK_QUEST_FINAL_LAG_DAYS,
  WEEK_QUEST_PARTS_TODAY,
  WEEK_QUEST_ROWS_TODAY,
  WRITE_MARGIN,
  aimRankName,
  domainName,
  floorBase,
  interval,
  practiceBandMinutes,
  rankIndexAt,
  rankIndexForStage,
  retryReadDaysOf,
  stageLabelOf,
  topRankIndexOf,
  type ProficiencyParts,
} from "@/lib/roadmap-types";
import { proficiencyOf } from "@/lib/roadmap-proficiency";
import { PRODUCTION_KINDS, RETRIEVAL_KINDS, catalogLabelOf, type PracticeKind } from "@/lib/roadmap-catalog";
import {
  AIM_AWAY_DAYS,
  AIM_BACKOFF_FRESH_DAYS,
  AIM_DONE_SHOW_DAYS,
  AIM_DRAFT_SHOWS_MAX,
  AIM_LATER_DAYS,
  AIM_START_DAILY_DAYS,
  AIM_STEP_SNOOZE_DAYS,
} from "@/lib/roadmap-invite";
import { TYPE_NAME } from "@/components/library/library-model";

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

// ─── Roadmap (roadmap.md F16 seam 12; revision 4: roadmap-rev4.md F-R4-8 to F-R4-13) ───

/** What each week quest kind asks and what checks it (F14, F-R4-14): the row's first words, never "Quest n of N". */
const WEEK_QUEST_KIND_ROWS: { row: string; asks: string; by: string }[] = [
  { row: "Bring … cards to level …+", asks: "the milestone's cards brought to its level, in parts by Domain", by: "tested by your reviews" },
  { row: "Add … cards", asks: "new cards filed in its Domains, in parts by Domain", by: "counted by the app; it doesn't judge them" },
  { row: "Practice · … sessions", asks: "each of its practices' planned sessions", by: "from your ticks" },
  { row: "Step: …", asks: "its next one-off step", by: "you ticked it" },
  { row: "Checkpoint: … · log your score", asks: "its checkpoint, near the window's end", by: "you logged it · doesn't move your progress" },
];

/** 1/3 for a share that is one part in n. */
const oneIn = (share: number) => `1/${Math.round(1 / share)}`;

/** A share to one decimal at most: 60%, 62.5%. */
const sharePct = (n: number) => `${Number((n * 100).toFixed(1))}%`;

/** "a, b and c". */
function listWords(words: readonly string[]): string {
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * The shares Proficiency's own formula (roadmap-proficiency.ts proficiencyOf)
 * gives a plan with these parts, read off a one-of-each basis: the table
 * below can't drift from what the roadmap computes (a Field Area without
 * practice reads cards 80% / stages 20%).
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
/** The parts' names on the page: the third is the stages part (ProficiencyParts.milestones in code). */
const PROFICIENCY_PART_WORD: Record<(typeof PROFICIENCY_PARTS)[number], string> = { cards: "cards", practice: "practice", milestones: "stages" };

/** Every part; a Field Area without practice; a track Area (practice, no cards). Short labels: the table fits 344 px. */
const PROFICIENCY_SHARE_ROWS: { label: string; shares: ProficiencyParts }[] = [
  { label: "All three", shares: proficiencySharesOf(true, true) },
  { label: "No practice", shares: proficiencySharesOf(true, false) },
  { label: "No cards", shares: proficiencySharesOf(false, true) },
];

/** The depth everything below is worked at: Mastered, the default (AIM_DEPTHS, DEPTH_DEFAULT). */
const DEFAULT_DEPTH = AIM_DEPTHS[DEPTH_DEFAULT];

/**
 * The stages a depth plan climbs (F-R4-10, F-R4-12): each gate's name and
 * level, the fewest days a new card needs to reach it at base spacing, the
 * Aim rank reaching it inside the plan gives, and the floor of Proficiency's
 * cards part there (LEVEL_WEIGHT(ℓ) ÷ LEVEL_WEIGHT(depth)). The level-11 gate
 * between Fluent and Mastered (BETWEEN) is the usual one, and keeps your rank.
 */
const STAGE_ROWS: { name: string; level: number; days: number; rank: string; floor: number }[] = [
  ...STAGE_KEYS.map((k) => ({ k, level: STAGE_LEVEL[k], name: STAGE_NAMES[k] })),
  { k: "BETWEEN" as const, level: DEFAULT_DEPTH - 1, name: stageLabelOf("BETWEEN", DEFAULT_DEPTH - 1) ?? "" },
]
  .sort((a, b) => a.level - b.level)
  .map((s) => {
    const index = rankIndexForStage(s.k, s.level, DEFAULT_DEPTH);
    return {
      name: s.name,
      level: s.level,
      days: floorBase(s.level),
      rank: s.k === "BETWEEN" ? "keeps your rank" : index == null ? "" : aimRankName(index),
      floor: LEVEL_WEIGHT(s.level) / LEVEL_WEIGHT(DEFAULT_DEPTH),
    };
  });

/** A catalog practice type's name, read from its code template (roadmap-catalog): "Recall drills", "Explain it in your own words". */
const KIND_FILL = { track: "FIELD" as const, domains: [domainName({ id: "rules", name: "your Domains" })] };
const kindName = (key: PracticeKind): string => String(catalogLabelOf(key, KIND_FILL)).replace(/: your Domains$/, "");

/** The card types a depth plan doesn't count (NON_RECALL_TYPES), by their library names. */
const NOT_COUNTED = NON_RECALL_TYPES.map((t) => TYPE_NAME[t].toLowerCase());

/** A level's review gap at base spacing, to the nearest 5 days ("about 110 days"), as the copy rounds it. */
const gapAbout = (level: number) => Math.round(interval(level) / 5) * 5;

/** Minutes of a practice band ("D45" → 45). */
const bandMinutes = (stage: "RETAINED" | "FLUENT") => {
  const band = STAGE_PRACTICE_BAND_MIN[stage];
  return band ? practiceBandMinutes(band) : null;
};

/**
 * The roadmap's published rules: an aim and its stages, the depth (high
 * mastery, measured), the realism checks, practice by stage, what a milestone
 * pays, week quests, Proficiency, the Aim rank, and the suggestions to set an
 * aim. Every number is read from roadmap-types.ts (the frozen contract the
 * planner, the week quests, Proficiency and the Aim rank compute with),
 * roadmap-invite.ts, roadmap-catalog.ts or life-economy.ts, and every table
 * is worked out by the same helpers, so the page cannot publish a rule the
 * roadmap does not apply. They are policy, not facts. scripts/you-check.ts
 * holds that no figure here is typed by hand, that week quests are never a
 * bare "quest", and that the Proficiency and Aim rank cards keep their words
 * apart from mastery and pay.
 */
function RoadmapRules({ edge, judgeDay }: { edge: string; judgeDay: string }) {
  const mid = GOAL_RULES.MID;
  const levels = Array.from({ length: TOP_LEVEL }, (_, i) => i + 1);
  // A life track's plan ranks its stages by place (F-R4-12): the k-th kept stage gives the Aim rank at place k.
  const tracks = Array.from({ length: TRACK_STAGE_SHARES.length }, (_, i) => i + 1).map((n) => ({
    n,
    gives: Array.from({ length: n }, (_, j) => aimRankName(rankIndexAt(j + 1))),
    top: topRankIndexOf(n),
  }));
  const fluent = AIM_DEPTHS.FLUENT;
  const retained = AIM_DEPTHS.RETAINED;
  // A first part counting toward the depth's own stage (contracts §15.4): the Aim rank of the stage before it, never the depth's.
  const partAtDepth = aimRankName(rankIndexForStage("PART", DEFAULT_DEPTH, DEFAULT_DEPTH) ?? 0);
  const last = gapAbout(DEFAULT_DEPTH - 1);
  // How far back the clean-entry read looks at the depth's level (lane 0's window, contracts §16.1: the time a card can sit
  // at the level, its interval and grace, plus the miss before its entering pass), at base spacing and no grace extension.
  const cleanWindow = retryReadDaysOf(DEFAULT_DEPTH);
  const longGap = interval(LONG_GAP_LEVEL);
  const retrieval = listWords(RETRIEVAL_KINDS.map(kindName));
  const production = listWords(PRODUCTION_KINDS.filter((k) => k !== "TIMED_PRACTICE").map(kindName));
  const fromRetained = bandMinutes("RETAINED");
  const fromFluent = bandMinutes("FLUENT");
  return (
    <>
      <Card title="Aims and milestones" sub="Policy, not facts: how the app plans toward an aim" wide>
        <p>
          An aim is set in your own words, with the hours a week you give it, and is never rewritten. An aim that grows a
          Field is planned to a depth (below); one that grows a life track is practice only. Its date is the app&apos;s
          realistic date unless you choose one, from {SPAN_MIN_DAYS} to {SPAN_MAX_DAYS.toLocaleString("en-GB")} days ahead. A depth the app
          can&apos;t reach within {SPAN_MAX_DAYS.toLocaleString("en-GB")} days at your pace is refused, with what to narrow: fewer Domains,
          more cards a week, or a lower depth.
        </p>
        <p>
          Gemini writes no word of a plan. When it drafts, it returns only keys from lists the app owns: which of your other
          Domains the aim may need, which line of your outline goes in which milestone, and which practice, step and
          checkpoint types from the app&apos;s list. The app writes every name and instruction and sets every number, date,
          level and target; each of Gemini&apos;s choices is labelled and can be changed in one tap, and a Domain it adds needs
          your confirm. A reply that breaks the format is rejected whole, and the plan from your numbers is written in its
          place. {ROADMAP_GEMINI_LIVE ? "" : "Gemini drafting is off until a test of its replies passes. "}At most{" "}
          {ROADMAP_DRAFTS_PER_DAY} Gemini drafts a day, a failed one included; the same request within {ROADMAP_REUSE_DAYS}{" "}
          days reuses the last one, and a reused draft doesn&apos;t count. Without Gemini the plan is built from your
          numbers or written by you, with the same checks.
        </p>
        <p>
          The plan climbs stages. Each stage&apos;s milestone asks every Domain the aim needs to bring its cards to the
          stage&apos;s level, and the last stage is the depth. Each is dated from the review schedule at your pace (below)
          and ends on the Sunday on or after that day.
        </p>
        <div className="rules-scroll">
          <table className="rules-table">
            <tbody>
              <tr>
                <th scope="col" className="t-eyebrow">
                  Stage
                </th>
                <th scope="col" className="t-eyebrow">
                  Level
                </th>
                <th scope="col" className="t-eyebrow">
                  Days, every review passed
                </th>
                <th scope="col" className="t-eyebrow">
                  Reaching it gives
                </th>
                <th scope="col" className="t-eyebrow">
                  Cards part there
                </th>
              </tr>
              {STAGE_ROWS.map((s) => (
                <tr key={s.name}>
                  <td className="b">{s.name}</td>
                  <td className="num">{s.level}+</td>
                  <td className="num">{s.days}</td>
                  <td className="ink-1">{s.rank}</td>
                  <td className="num">{sharePct(s.floor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="t-meta">
          Days, every review passed: the fewest a new card needs to reach the level at base review spacing; a loadout
          that stretches spacing stretches them too. Cards part there: Proficiency&apos;s cards part with every card
          just at that level, on a plan at level {DEFAULT_DEPTH}, so early stages read low.
        </p>
        <ul className="rules-bullets">
          <li>
            Two stages under {MILESTONE_MIN_DAYS} days apart merge into the higher one, and a stage with fewer than{" "}
            {MIN_INCREMENT_CARDS_FLOOR} cards left to raise joins the next; the depth&apos;s own stage is never merged away. A
            stage over {MILESTONE_MAX_DAYS} days long gains a gate at the odd level in between ({stageLabelOf("BETWEEN", DEFAULT_DEPTH - 1)}
            {" "}is the usual one), which keeps your rank.
          </li>
          <li>
            When the first stage is more than {FIRST_RANK_MAX_DAYS} days away, a first part comes before it (such as{" "}
            {stageLabelOf("PART", STAGE_LEVEL.FAMILIAR)}), on the Sunday on or after day {FIRST_RANK_MAX_DAYS} or halfway to it, whichever
            comes first, asking the cards your pace can be expected to bring to that level by then. So the first Aim rank comes
            within about {Math.round(FIRST_RANK_MAX_DAYS / 7)} weeks.
          </li>
          <li>
            At most {MAX_MILESTONES} milestones. A stage you already hold when you begin shows &quot;Held when you began&quot;
            and is skipped. A plan with nothing left to do is refused: the depth already held in its Domains, or under{" "}
            {SPAN_MIN_DAYS} days from done.
          </li>
          <li>
            A life track&apos;s aim has no depth: its stages are shares of the practice planned to its date (
            {TRACK_STAGE_SHARES.map(pct).join(", ")}), from your ticks.
          </li>
          <li>
            A plan made before plans aimed at a depth can&apos;t start a milestone, and any wording from an earlier Gemini draft is
            hidden. Start again at a depth carries its aim, Area and Domains into a new plan.
          </li>
        </ul>
        <p>
          A milestone&apos;s progress is the lowest of its parts, read from stored readings: each Domain&apos;s cards at its
          level (tested by your reviews), the sessions you ticked and the steps you did. With no reading it is not
          measured, and nothing is invented in its place.
        </p>
      </Card>

      <Card title="Depth: high mastery, measured" sub="What the last stage means, and what counts toward it" wide>
        <p>
          A Field aim is planned to a depth: {STAGE_NAMES.MASTERED} (level {DEFAULT_DEPTH}) unless you choose{" "}
          {STAGE_NAMES.FLUENT} (level {fluent}) or {STAGE_NAMES.RETAINED} (level {retained}). A lower depth is your choice, and
          it stays on the plan for good. The app doesn&apos;t lower the depth to fit a date: it moves the date instead.
        </p>
        <ol className="rules-list">
          <li>
            Depth: every Domain the aim needs holds its count of cards at the depth&apos;s level. At level {DEFAULT_DEPTH} each
            counted card passed its level-{DEFAULT_DEPTH - 1} review, about {last} days after the one before (longer with your
            interval settings), at the first try. Tested by your reviews.
          </li>
          <li>
            Coverage: each Domain counts on its own, the lowest of them, never a total. Its count is the app&apos;s policy or
            yours, and a count below the policy is shown on the plan for good.
          </li>
          <li>
            Practice kept: the plan&apos;s practice at {pct(KEEP_SHARE)} of its planned sessions overall, with practice that
            uses what you know kept from {STAGE_NAMES.FLUENT} on. From your ticks.
          </li>
          <li>
            A standard you set: a checkpoint with your own bar, on the last milestone or at your exam, logged at or above the
            bar. You logged it.
          </li>
          <li>Held: the depth counts as reached once it has held {REACH_CONFIRM_DAYS} days.</li>
        </ol>
        <p>
          The cards that count are every card type except {listWords(NOT_COUNTED)}: recognising an answer isn&apos;t
          recalling it, and the plan shows how many it leaves out. A card at exactly the depth&apos;s level counts only when
          it got there on a first-try pass. A miss is retried the next day without losing the level; a card whose pass into
          the level comes right after a miss (a strike, a miss where a skill held the level, or the miss that dropped it from that level)
          counts after its next review. On reviews logged before the app recorded the level, that miss counts only within{" "}
          {RETRY_ENTRY_DAYS} days of the pass. To find that miss, the app reads a card&apos;s reviews back {cleanWindow} days at
          level {DEFAULT_DEPTH}: the longest a card can stay there, with the miss before it (more with a loadout that stretches
          spacing or grace). A card a skill kept at its level past its grace can stay longer, and its entry then reads as a
          first try.
        </p>
        <Formula>
          cards a Domain needs = max({COVER_FLOOR_CARDS}, ⌈{COVER_SHARE} × its cards that count now⌉, {CARDS_PER_OUTLINE_LINE} × its outline lines)
        </Formula>
        <ul className="rules-bullets">
          <li>
            An outline line belongs to the Domain you tie it to (the app suggests one by its words; Gemini never chooses it).
            Lines tied to no Domain are shared evenly between the Domains, and listed.
          </li>
          <li>
            You can type a Domain&apos;s count, from {COVER_MIN} to {COVER_MAX}. One below the app&apos;s is your choice, shown
            for good, and while it stands the top rank on the plan is {aimRankName(RANK_TOP - 1)}. With no outline the plan
            says &quot;coverage unchecked: no outline&quot; for good.
          </li>
          <li>
            New cards to write: ⌈{WRITE_MARGIN} × the count⌉ less the cards that count now, a spare of {pct(WRITE_MARGIN - 1)}{" "}
            because some cards lag. A plan holds at most {DEPTH_DOMAINS_MAX} Domains.
          </li>
        </ul>
        <p>
          The floor of {COVER_FLOOR_CARDS} cards and the {pct(COVER_SHARE)} share are the app&apos;s policy, not facts about a
          subject: change a count if you know better. The app tests whether you hold the cards you wrote; whether they cover
          everything your aim needs is yours to judge, and your outline and your standard are the outside checks.
        </p>
      </Card>

      <Card title="Is the plan realistic?" sub="Keep the depth, move the date: what the app checks, and what it can't" wide>
        <Formula>stage day = the first day every Domain&apos;s expected cards at the stage&apos;s level reach its count</Formula>
        <ul className="rules-bullets">
          <li>
            Expected reach follows the app&apos;s review rules: a miss costs a day, {REACH_STRIKE_LIMIT} in a row cost a level,
            and a card overdue past its grace drops a level. A due review is done on its day as often as you clear your due
            queue, and missed days bunch together as they do in your history.
          </li>
          <li>
            It uses your pass rate over {PASS_SHARE_WINDOW_DAYS} days (it reads high: a lapse by neglect isn&apos;t logged); for
            reviews at level {LONG_GAP_LEVEL} and above, gaps of {longGap} days and more, at most {pct(P_LONG_CAP)}, the
            app&apos;s policy, since none of your reviews has tested gaps that long yet; the share of your due queue you clear,
            over {CLEARANCE_WINDOW_DAYS} days; and how missed days bunch, over your last {CLEARANCE_SERIES_DAYS} days (a day
            that clears under {pct(OFF_DAY_CLEAR_SHARE)} of its queue counts as missed).
          </li>
          <li>
            Until each is measured the app assumes it, and says so: a pass rate of {pct(P_PRIOR)} until{" "}
            {PASS_SHARE_MIN_REVIEWS} reviews, clearing {pct(C_PRIOR)} of the queue until {CLEARANCE_WINDOW_DAYS} days, a
            missed day followed by another {pct(RHO_PRIOR)} of the time until {RHO_MIN_DAYS} days, and a pace you typed until yours is measured. A date that rests
            on an assumption reads &quot;estimate&quot;, names it, and is offered a re-date once it is measured; it is never
            the best case. The best case, every review passing, is shown on its own line.
          </li>
          <li>
            How hard is the share of your usual writing pace the plan counts on: Light {pct(PACE_SHARE.LIGHT)}, Steady{" "}
            {pct(PACE_SHARE.STEADY)}, Push {pct(PACE_SHARE.PUSH)}. It moves dates, never the depth.
          </li>
          <li>
            &quot;When realistic&quot;, the default, dates the plan itself. A date you choose reads Fits (on or after the realistic date),
            Tight (it needs your full usual pace), Over (up to {OVER_PACE_FACTOR} × your usual pace: it needs your &quot;keep my
            date&quot; switch and shows for good) or Impossible (before the earliest the depth can be reached even at{" "}
            {OVER_PACE_FACTOR} × your pace: refused). The offers are the realistic date, keeping yours, or a lower depth, and
            none is taken by itself; the plan also says which stage it reaches by your date. A date the app set is never
            called your choice.
          </li>
          <li>
            An exam with a date is a waypoint inside the plan, not its end: the depth stays, the exam sits in the stage that
            holds its day with mock tests before it, its score is the plan&apos;s standard, and the plan says which stage it
            reaches by then.
          </li>
          <li>
            When most of the wait comes after the last card is written ({pct(SCHEDULE_BOUND_SHARE)} or more of the{" "}
            {floorBase(DEFAULT_DEPTH)} days a new card needs to reach level {DEFAULT_DEPTH}), the plan says the date is set by
            the review schedule, not your hours.
          </li>
        </ul>
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
            With your own &quot;hours this usually takes&quot; figure and its source, the date is no earlier than your hours
            reach it. Without one the aim reads &quot;Aim not checked&quot;.
          </li>
        </ul>
      </Card>

      <Card title="Practice that builds the depth" sub="From the app's list of practice types, yours to change">
        <ul className="rules-bullets">
          <li>
            At {STAGE_NAMES.FOUNDATION} and {STAGE_NAMES.FAMILIAR} a stage holds at least one practice that makes you recall:{" "}
            {retrieval}.
          </li>
          <li>
            From {STAGE_NAMES.RETAINED} on it holds at least one that uses what you know: {production}, or timed practice on an
            exam aim.
          </li>
          <li>
            When a stage lacks one, the app adds it, labelled &quot;added by the app&quot;, if practices are allowed and a slot
            is free. You may swap it for another type from the list.
          </li>
          <li>
            Sessions are at least {fromRetained} minutes from {STAGE_NAMES.RETAINED} and {fromFluent} from{" "}
            {STAGE_NAMES.FLUENT}. When a session that long doesn&apos;t fit, writing slows first (a later date) before the time
            check reads Over.
          </li>
          <li>
            Effort is never sized by a model: it is the practice type and its minutes, the app&apos;s or yours. With practices
            switched off there is no practice from {STAGE_NAMES.FLUENT} on, so the top rank on the plan is{" "}
            {aimRankName(RANK_TOP - 1)}.
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
            When it would pay only because of a practice the app added, its Start sheet says so: switch that practice off and
            it pays nothing.
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
            Bring and Add split by Domain: each Domain is its own part with its own count, and a Domain already at its count
            has none. Only the cards that count are counted ({listWords(NOT_COUNTED)} isn&apos;t), and on the depth&apos;s last
            stage a card that reached the level on a retry counts after its next review. Today shows the first{" "}
            {WEEK_QUEST_PARTS_TODAY} parts of a row; the roadmap page shows all of them.
          </li>
          <li>
            Each count is the gap left ÷ the weeks left. Bring asks at most what can be expected to reach the level this week
            at the pass rates and clearance stored when the milestone started. A card that was due anyway counts: passing its
            review is the step.
          </li>
          <li>
            Add asks what the Domain&apos;s count still needs (with its spare), at most max({WEEK_QUEST_ADD_MIN_CAP}, ⌈
            {WEEK_QUEST_CATCHUP_FACTOR} × the new cards a week the plan needed there at Start⌉), so missed weeks never pile up
            (the catch-up cap), and at most what the week&apos;s time holds at {CARD_WRITE_MIN} min a card after practices,
            reviews and your other Fields&apos; weekly quotas, shared between the Domains (the capacity cap). A card added in
            the aim&apos;s own Field counts toward that Field&apos;s weekly quota too.
          </li>
          <li>
            Sessions ask for the plan&apos;s own count, and missed ones never carry into the next week. A step shows once the
            window passes its share, and always in the milestone&apos;s last week; the checkpoint once{" "}
            {pct(WEEK_QUEST_CHECKPOINT_FROM)} of the window has passed, and its score never moves progress.
          </li>
          <li>
            A week holds at most {WEEK_QUESTS_PER_WEEK_MAX} week quests (a row&apos;s parts are not week quests), and Today shows{" "}
            {WEEK_QUEST_ROWS_TODAY} before the rest. The set is fixed just after Monday {edge} and never changes mid-week; its
            results are written from the {judgeDay} {edge} after its Sunday ({WEEK_QUEST_FINAL_LAG_DAYS} days on), once late
            ticks and make-ups are in.
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
                    {PROFICIENCY_PART_WORD[k]}
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
            Cards, tested by your reviews: for each Domain&apos;s count n at the depth&apos;s level L, its n best cards that
            count give Σ weight(min(level, L)) ÷ (n × weight(L)). A card above L counts as L; a missing card counts nothing;
            a card that reached L on a retry weighs as the level below until its next pass. So it reads {pct(1)} only when the
            depth is held.
          </li>
          <li>Practice, from your ticks: Σ min(kept, planned) ÷ Σ planned, practice by practice.</li>
          <li>
            Stages: reached ÷ scheduled. A stage held when you began counts as reached, and a first part counts as a stage.
            A reach that rests on ticks counts once it has held {REACH_CONFIRM_DAYS} days.
          </li>
          <li>
            A plan without practice (a Field Area with no practices), or without cards (a track Area), renormalises the
            shares over the parts it has, as the table shows.
          </li>
        </ul>
        <p>
          It always names what it is measured toward, &quot;Proficiency toward {STAGE_NAMES.FLUENT} (level {fluent})&quot;, so a
          figure after a lower depth never reads as more. A level&apos;s weight is the days of review spacing a card has come
          through to reach it, at base spacing. A card just written, or passed once, weighs nothing, so writing cards alone
          moves nothing.
        </p>
        <Samples head={["level", "weight"]} rows={levels.map((l) => [String(l), String(LEVEL_WEIGHT(l))])} />
        <p>
          It shows as a whole percentage, rounded down, from the day&apos;s stored reading. A slipped card lowers it the same
          day. A re-plan, a lower depth or a changed count changes it as a change of plan, shown with the figure before it,
          never as a gain or a loss. It pays nothing and sets no goal&apos;s progress.
        </p>
      </Card>

      <Card title="Aim rank" sub="A record of the stages you reached: kept for good, and it pays nothing">
        <p className="ink-0">{AIM_RANKS.join(" → ")}</p>
        <p>
          Every aim starts at {aimRankName(0)}. Each stage you reach inside the plan gives the Aim rank in the stages table;
          a gate in between keeps your rank, and a first part gives its stage&apos;s Aim rank early, so the stage itself then
          keeps your rank. A first part before the depth&apos;s own stage gives the Aim rank of the stage before it instead (
          {partAtDepth} on a plan at level {DEFAULT_DEPTH}): its count can be met before the depth is held, so the
          depth&apos;s Aim rank comes only with the depth. A stage you already held when you began gives no Aim rank.
        </p>
        <p>
          {aimRankName(RANK_TOP)} comes with the aim reached on a plan at level {DEFAULT_DEPTH}: its last stage reached and
          held, every Domain it needs at level {DEFAULT_DEPTH} on the same day&apos;s readings, the plan&apos;s practice kept
          at {pct(KEEP_SHARE)} overall and the practice that uses what you know kept from {STAGE_NAMES.FLUENT} on, and your
          standard logged at or above its bar. A stage closed short on the way doesn&apos;t block it. A lower depth tops out
          at its own stage&apos;s Aim rank, so the top rank on this plan is {aimRankName(STAGE_RANK.FLUENT)} at level {fluent}{" "}
          and {aimRankName(STAGE_RANK.RETAINED)} at level {retained}. With no standard, a Domain below the app&apos;s count,
          or no such practice from {STAGE_NAMES.FLUENT} on, the top rank on this plan is {aimRankName(RANK_TOP - 1)}.
        </p>
        <p>
          A life track&apos;s aim has no levels, so its stages give the Aim rank by place: the k-th stage you reach gives the
          one at place k, and {aimRankName(RANK_TOP)} needs a standard, {PARAGON_MIN_MILESTONES} or more stages and at least{" "}
          {TRACK_PARAGON_MIN_DAYS} days.
        </p>
        <div className="rules-scroll">
          <table className="rules-table">
            <tbody>
              <tr>
                <th scope="col" className="t-eyebrow">
                  Life track stages
                </th>
                <th scope="col" className="t-eyebrow">
                  Each one reached gives
                </th>
                <th scope="col" className="t-eyebrow">
                  Top rank on this plan
                </th>
              </tr>
              {tracks.map((p) => (
                <tr key={p.n}>
                  <td className="num">{p.n}</td>
                  <td className="ink-1">{p.gives.join(" · ")}</td>
                  <td className="ink-1">
                    {aimRankName(p.top)}
                    {p.top === RANK_TOP ? `, with the aim, a standard and ${TRACK_PARAGON_MIN_DAYS} days` : ""}
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
            The rank is kept for good: a slipped card lowers Proficiency, never the Aim rank, and a lower depth keeps every Aim
            rank given so far. A new Aim rank is marked on the Aim card for {RANK_NEW_DAYS} days.
          </li>
          <li>It is not a title, and it pays nothing.</li>
        </ul>
      </Card>

      <Card title="Suggestions to set an aim" sub="An invitation, never a count">
        <ul className="rules-bullets">
          <li>
            With no aim set, You asks for one in place. Today mentions it in one quiet line on a fresh start: the life
            week&apos;s Monday, the first of the month, or your first day back after more than {AIM_AWAY_DAYS} days away. After{" "}
            {AIM_BACKOFF_FRESH_DAYS} of those with no answer, only on the first of the month. Within {AIM_DONE_SHOW_DAYS} days
            of an aim&apos;s end it reads &quot;Your last aim is done&quot;. Capture offers to make a long goal you type your
            aim.
          </li>
          <li>
            Not now on You folds its card to one line for {AIM_LATER_DAYS} days, and Today&apos;s line and capture&apos;s offer
            stay quiet meanwhile. Not now on Today&apos;s line, or that one line&apos;s ×, hides all of them for{" "}
            {AIM_LATER_DAYS} days from then. None of them is a no: the switch in Settings stays on. Don&apos;t suggest this, or
            the switch in Settings, is the lasting no: it is stored with your settings, so it holds on every device, and
            Settings can turn it back on. Either way your last aim&apos;s Aim rank stays on You, with nothing that asks.
          </li>
          <li>
            Your own waiting steps have their own line: a draft waiting for your check shows on at most {AIM_DRAFT_SHOWS_MAX}{" "}
            days, and a milestone ready to start daily for {AIM_START_DAILY_DAYS} days, then on fresh starts. Not now hides
            either for {AIM_STEP_SNOOZE_DAYS} days; the switch doesn&apos;t govern them.
          </li>
          <li>None of these is counted, read red, reaches the bell, plays a sound or pays anything.</li>
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
