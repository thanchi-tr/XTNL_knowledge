/**
 * How long does this game actually take?
 *
 * The design target is a 10–15 year minimum, so the only honest way to tune
 * it is to model a player and total the cost. Run it before and after any
 * balance change: `npm run balance:horizon`.
 *
 * The model is deliberately generous — a *committed* player, not an average
 * one — because a horizon that only holds for someone who plays badly is not
 * a horizon. If the diligent case clears the pool in three years, the design
 * target is missed no matter what the median looks like.
 *
 * The LIFE block (M5, docs/life-plan/m5-refit.md F13) is the economy guard
 * for life: what kept weeks and goals may pay in mastery points, how fast a
 * track may level, and how far life alone may push an attribute. Every rule
 * it applies is read from the modules that pay (life-economy, life-grade,
 * streak-curve, attributes, skill-pool, skill-gates), never restated here;
 * only the model (the basket, the personas and the bounds asserted) lives
 * here. It exits 1 on any failed assertion and runs no query.
 *
 * M2 (docs/life-plan/m2-refit.md F17) adds the full days to the weekly cap:
 * 3b the capped reasons at their most (4 × 1.5 + 2 × 1 + 7 × 0.5 = 11.5)
 * exceed the cap, and a planWeeks fixture shows the judge mints full days
 * last, so the cap trims them and never a kept track, with Shorts trimming
 * them first; 3c with settlement holding DUTY back (BODY, CRAFT and CARE in
 * one run, DUTY and the full days in a later one) every mint and the trimmed
 * set equal a single run's; 3d a held week mints nothing. Assertions 1 and 2
 * already price the full cap, so full days inside it change neither.
 */
import { SKILL_POOL, requiredAttributeScore } from "../src/lib/skill-pool";
import { IDEA_MASTERY_POINTS, REVIEW_MASTERY_PER_LEVEL } from "../src/lib/mastery";
import { MASTERY_LEVEL, MAX_LEVEL, baseIntervalDays } from "../src/lib/xp";
import {
  GOAL_DEPTH_CAP,
  GOAL_RULES,
  KEPT_WEEK_STREAK_DAYS,
  LIFE_MP,
  LIFE_MP_WEEK_CAP,
  TRACK_DEPTH_GRACE,
  TRACK_DEPTH_WEEK_COEF,
  TRACK_LEVEL_STEP,
  TRACK_SHARE_CAP,
  trackLevel,
} from "../src/lib/life-economy";
import { emptyLifeLedger, trackShareCap, trackStateAt } from "../src/lib/life-tracks";
import { effectiveFieldComposition } from "../src/lib/attribute-inference";
import { TRACK_LABEL, kneeG, priceTask } from "../src/lib/life-grade";
import { TRACK_SEED } from "../src/lib/life-lexicon";
import { streakBonusPercent } from "../src/lib/streak-curve";
import { ATTRIBUTES, computeAttributeScores, emptyComposition, type FieldContribution } from "../src/lib/attributes";
import { meetsRequirements } from "../src/lib/skill-gates";
import { TRACKS, type Band, type Horizon, type Track } from "../src/lib/life-types";
import { addDays, weekKeyOf, type DayKey } from "../src/lib/life-day";
import { planWeeks, type WeekJudgeState, type WeekPlan, type WeekTaskRow } from "../src/lib/life-weeks";
import { weekRowKey } from "../src/lib/life-economy";

/** A committed player: reviews daily, never misses, adds steadily. */
const REVIEWS_PER_DAY = 25;
const NEW_IDEAS_PER_WEEK = 10;
/** Reviews needed to walk one Idea from level 1 to MASTERY_LEVEL. */
const REVIEWS_TO_MASTER = MASTERY_LEVEL - 1;
/** Days to walk one Idea from new to mastered, summing the interval ladder. */
const DAYS_TO_MASTER = Array.from({ length: MASTERY_LEVEL - 1 }, (_, i) => baseIntervalDays(i + 1))
  .reduce((a, b) => a + b, 0);
const DAYS_TO_MAX = Array.from({ length: MAX_LEVEL - 1 }, (_, i) => baseIntervalDays(i + 1))
  .reduce((a, b) => a + b, 0);

function fmtYears(days: number): string {
  return `${(days / 365).toFixed(1)}y`;
}

// ── LIFE: the model ─────────────────────────────────────────────────────────

/** Life MP may add at most this share of the knowledge income, even in the worst case. */
const LIFE_SHARE_CEILING = 0.03;
/** The whole pool must still take at least this long with life income on top. */
const MIN_HORIZON_YEARS = 10;
/** Attribute tier whose gate life alone must never clear (requiredAttributeScore(5) = 14.2). */
const FLOOD_TIER = 5;
/** Recurring basket rows price C at this streak (day-equivalents). */
const BASKET_STREAK_DAYS = 30;
/** How far the pacing model looks for a first level-10 week. */
const PACE_HORIZON_WEEKS = 520;
/** The committed player closes one Mid goal a quarter, in full, on top of a capped week every week. */
const COMMITTED_MID_EVERY_DAYS = 91;

/** One habit or task of the modelled week, priced by life-grade's priceTask. */
interface BasketRow {
  track: Track;
  title: string;
  band: Band;
  minutes: number;
  recurring: boolean;
  perWeek: number;
}

/** 17 rows: a believable steady week of chores, work, exercise and care. */
const LIFE_BASKET: readonly BasketRow[] = [
  { track: "DUTY", title: "dishes", band: "INTRO", minutes: 15, recurring: true, perWeek: 7 },
  { track: "DUTY", title: "tidy", band: "INTRO", minutes: 15, recurring: true, perWeek: 3 },
  { track: "DUTY", title: "laundry", band: "INTRO", minutes: 15, recurring: true, perWeek: 2 },
  { track: "DUTY", title: "bins", band: "INTRO", minutes: 5, recurring: true, perWeek: 1 },
  { track: "DUTY", title: "groceries", band: "STANDARD", minutes: 60, recurring: true, perWeek: 1 },
  { track: "DUTY", title: "pay a bill", band: "INTRO", minutes: 10, recurring: false, perWeek: 2 },
  { track: "DUTY", title: "big admin", band: "DEMANDING", minutes: 120, recurring: false, perWeek: 0.25 },
  { track: "CRAFT", title: "deep work", band: "DEMANDING", minutes: 90, recurring: false, perWeek: 3 },
  { track: "CRAFT", title: "emails", band: "INTRO", minutes: 5, recurring: true, perWeek: 5 },
  { track: "CRAFT", title: "practice", band: "STANDARD", minutes: 30, recurring: true, perWeek: 3 },
  { track: "BODY", title: "walk", band: "STANDARD", minutes: 30, recurring: true, perWeek: 4 },
  { track: "BODY", title: "gym", band: "DEMANDING", minutes: 60, recurring: true, perWeek: 2 },
  { track: "BODY", title: "meds", band: "INTRO", minutes: 5, recurring: true, perWeek: 7 },
  { track: "CARE", title: "meditate", band: "INTRO", minutes: 10, recurring: true, perWeek: 7 },
  { track: "CARE", title: "call mum", band: "STANDARD", minutes: 20, recurring: true, perWeek: 1 },
  { track: "CARE", title: "see a friend", band: "STANDARD", minutes: 120, recurring: false, perWeek: 1 },
  { track: "CARE", title: "journal", band: "INTRO", minutes: 10, recurring: true, perWeek: 3 },
];

/** The basket's volume scaled: light does 60% of it, heavy 180%. */
const PERSONA_SCALE = { light: 0.6, steady: 1, heavy: 1.8 } as const;
type PersonaName = keyof typeof PERSONA_SCALE;

interface Persona {
  name: PersonaName;
  tasksPerDay: number;
  rawPerDay: number;
  /** Paid XP per week by track: raw × the knee's factor at an even daily raw. */
  xpPerWeek: Record<Track, number>;
  /** The mean track's XP per week: the pacing model's one track. */
  meanTrackXpPerWeek: number;
}

/** One completion's published raw price, as the board would project it. */
function rawPriceOf(row: BasketRow): number {
  return priceTask(
    {
      band: row.band,
      bandOverride: 0,
      machineMinutes: row.minutes,
      estMinutes: row.minutes,
      minutes: null,
      timing: "ON_TIME",
      recurring: row.recurring,
      streakDays: row.recurring ? BASKET_STREAK_DAYS : 0,
      repeatN: 1,
      introBefore: 0,
      mode: "FULL",
    },
    { rawBefore: 0 },
    row.track,
  ).raw;
}

function personaOf(name: PersonaName): Persona {
  const scale = PERSONA_SCALE[name];
  const rawPerWeek = { BODY: 0, DUTY: 0, CRAFT: 0, CARE: 0 } as Record<Track, number>;
  let perWeek = 0;
  for (const row of LIFE_BASKET) {
    rawPerWeek[row.track] += rawPriceOf(row) * row.perWeek * scale;
    perWeek += row.perWeek * scale;
  }
  const rawPerDay = TRACKS.reduce((s, t) => s + rawPerWeek[t], 0) / 7;
  const knee = rawPerDay > 0 ? kneeG(rawPerDay) / rawPerDay : 1;
  const xpPerWeek = { BODY: 0, DUTY: 0, CRAFT: 0, CARE: 0 } as Record<Track, number>;
  for (const t of TRACKS) xpPerWeek[t] = rawPerWeek[t] * knee;
  const meanTrackXpPerWeek = TRACKS.reduce((s, t) => s + xpPerWeek[t], 0) / TRACKS.length;
  return { name, tasksPerDay: perWeek / 7, rawPerDay, xpPerWeek, meanTrackXpPerWeek };
}

/** One goal paid on `day` (1-based model day), adding `depth` to the track. */
interface PaidGoal {
  horizon: Horizon;
  day: number;
  depth: number;
  mp: number;
}

/** A track's year: XP per week, which weeks are kept, which goals pay. */
interface PacePlan {
  label: string;
  xpPerWeek: number;
  kept: (week: number) => boolean;
  goals: readonly PaidGoal[];
}

interface PaceState {
  week: number;
  xp: number;
  keptWeeks: number;
  keptStreak: number;
  goalDepth: number;
  level: number;
}

/** The track at the end of model week `week` (its week judged): trackLevel over the plan. */
function paceAt(plan: PacePlan, week: number): PaceState {
  const xp = plan.xpPerWeek * week;
  let keptWeeks = 0;
  let keptStreak = 0;
  for (let w = 1; w <= week; w += 1) {
    if (plan.kept(w)) {
      keptWeeks += 1;
      keptStreak += 1;
    } else keptStreak = 0;
  }
  // The raw sum: trackLevel caps it at GOAL_DEPTH_CAP itself, so a bumped cap shows here.
  const goalDepth = plan.goals.filter((g) => g.day <= 7 * week).reduce((s, g) => s + g.depth, 0);
  return { week, xp, keptWeeks, keptStreak, goalDepth, level: trackLevel(xp, keptWeeks, goalDepth) };
}

function firstWeekAt(plan: PacePlan, level: number): number | null {
  for (let w = 1; w <= PACE_HORIZON_WEEKS; w += 1) if (paceAt(plan, w).level >= level) return w;
  return null;
}

/** Every paying goal of `horizon` its rules allow, from its first paying day, as densely as its window lets it. */
function densestGoals(horizon: Horizon, untilDay: number, goalMp: (h: Horizon) => number): PaidGoal[] {
  const rule = GOAL_RULES[horizon];
  const every = rule.windowDays / rule.maxPaying;
  const out: PaidGoal[] = [];
  for (let day = rule.minLifetimeDays; day <= untilDay; day += every) {
    out.push({ horizon, day, depth: rule.depth, mp: goalMp(horizon) });
  }
  return out;
}

/** The kept-week attribute bonus: streakBonusPercent(7 × kept streak), never amplified. */
function keptBonusPercent(keptStreak: number): number {
  return streakBonusPercent(KEPT_WEEK_STREAK_DAYS * keptStreak);
}

/** Life-only attribute scores: every track at `level`, its bonus, on the seed compositions. */
function lifeOnlyScores(level: number, bonusPercent: number) {
  const rows: FieldContribution[] = TRACKS.map((t) => ({
    fieldName: `Life · ${TRACK_LABEL[t]}`,
    level: level * (1 + bonusPercent / 100),
    composition: TRACK_SEED[t],
  }));
  return computeAttributeScores(rows);
}

/** A task composition that names one attribute at 100: the most any one task mix can carry. */
function allIn(attribute: (typeof ATTRIBUTES)[number]) {
  const c = emptyComposition();
  c[attribute] = 100;
  return c;
}

/**
 * The flood with the task pull: for each attribute, every track's tasks name
 * only it (the worst a task mix can do). `pulled` is the unclamped mix
 * (attribute-inference effectiveFieldComposition: 65% of the way to the tasks);
 * `clamped` is what the code holds a track to (life-tracks trackStateAt, which
 * applies clampTrackComposition); `ceiling` is Σ over tracks of the clamp,
 * the bound for ANY mix. Each is that attribute's life-only score with all
 * four tracks at `level`.
 */
function pulledFlood(level: number, bonusPercent: number) {
  const effective = level * (1 + bonusPercent / 100);
  const scoreOf = (comps: readonly (typeof TRACK_SEED)[Track][], a: (typeof ATTRIBUTES)[number]) =>
    computeAttributeScores(comps.map((composition, i) => ({ fieldName: `Life · ${TRACK_LABEL[TRACKS[i]]}`, level: effective, composition })))[a];
  type Top = { attribute: (typeof ATTRIBUTES)[number]; score: number };
  const none = (): Top => ({ attribute: ATTRIBUTES[0], score: 0 });
  const worst: { pulled: Top; clamped: Top; ceiling: Top } = { pulled: none(), clamped: none(), ceiling: none() };
  for (const a of ATTRIBUTES) {
    const pulled = TRACKS.map((t) => effectiveFieldComposition(TRACK_SEED[t], [{ composition: allIn(a), totalPoints: 1 }]));
    const ledger = { ...emptyLifeLedger("2026-01-05"), compositions: TRACKS.map((t) => ({ track: t, key: `all-in:${a}`, xp: 1, composition: allIn(a) })) };
    const clamped = trackStateAt(ledger, "2026-01-05").map((s) => s.composition);
    const ceiling = Math.round(effective * TRACKS.reduce((s, t) => s + trackShareCap(t, a), 0)) / 100;
    const p = scoreOf(pulled, a);
    const c = scoreOf(clamped, a);
    if (p > worst.pulled.score) worst.pulled = { attribute: a, score: p };
    if (c > worst.clamped.score) worst.clamped = { attribute: a, score: c };
    if (ceiling > worst.ceiling.score) worst.ceiling = { attribute: a, score: ceiling };
  }
  return worst;
}

function topAttribute(scores: ReturnType<typeof computeAttributeScores>) {
  let best: (typeof ATTRIBUTES)[number] = ATTRIBUTES[0];
  for (const a of ATTRIBUTES) if (scores[a] > scores[best]) best = a;
  return { attribute: best, score: scores[best] };
}

/** Emblems whose attribute gates and prerequisites life alone opens (owning nothing to start). */
function emblemsLifeOpens(scores: ReturnType<typeof computeAttributeScores>) {
  const open = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const s of SKILL_POOL) {
      if (open.has(s.code)) continue;
      if (s.prerequisites.every((p) => open.has(p)) && meetsRequirements(s, scores)) {
        open.add(s.code);
        changed = true;
      }
    }
  }
  const skills = SKILL_POOL.filter((s) => open.has(s.code));
  return { count: skills.length, cost: skills.reduce((a, s) => a + s.masteryCost, 0) };
}

/** Life MP a plan has earned by the end of `week`: every kept week pays each of the four tracks, plus its goals. */
function lifeMpEarned(plan: PacePlan, week: number): number {
  let mp = 0;
  for (let w = 1; w <= week; w += 1) if (plan.kept(w)) mp += TRACKS.length * LIFE_MP.WEEK_KEPT;
  for (const g of plan.goals) if (g.day <= 7 * week) mp += g.mp;
  return mp;
}

const fmt = (x: number, dp = 2) => x.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const fmt0 = (x: number) => Math.round(x).toLocaleString("en-GB");

// ── LIFE: M2's full days inside the weekly cap (m2-refit.md decisions 5 and 6, F17) ──

/** A Duty week of the model: Monday 12 Oct 2026, its Duty launch day, judged the Wednesday after. */
const CAP_MONDAY: DayKey = "2026-10-12";
const CAP_SUNDAY: DayKey = addDays(CAP_MONDAY, 6);

/**
 * A week of planWeeks' input where every track is kept and every day is a
 * full day (7 FULL_DAY rows), with `shorts` Short goals already paid in the
 * week. `settled` false: settlement has only reached Saturday (decision 5's
 * gate holds DUTY and the full days back).
 */
function capWeek(shorts: number, settled: boolean, restDays: readonly DayKey[] = []): WeekJudgeState {
  let id = 0;
  const row = (track: Track, d: number): WeekTaskRow => ({
    id: `cap${++id}`,
    source: "TASK",
    dedupeKey: null,
    day: addDays(CAP_MONDAY, d),
    track,
    templateId: null,
    rawXp: 12,
    // BODY: 60 minutes of DEMANDING exercise (B 20, weight 2) on each day, so its effort floor is met.
    receipt: { v: "life-1", factors: [{ key: "B", label: "band", value: 20 }], minutes: 60, raw: 12, kneeBefore: 0, xp: 12, track },
    category: track === "BODY" ? "EXERCISE" : "OTHER",
  });
  return {
    today: addDays(CAP_SUNDAY, 3),
    launchDay: CAP_MONDAY,
    epochDay: CAP_MONDAY,
    judged: new Set<string>(),
    rows: TRACKS.flatMap((t) => [0, 1, 2, 3, 4].map((d) => row(t, d))),
    templates: [],
    instances: [],
    mints: Array.from({ length: shorts }, (_, i) => ({ day: addDays(CAP_MONDAY, i), qty: GOAL_RULES.SHORT.stated, reason: "GOAL_SHORT", key: `mp:GOAL:short${i}` })),
    heldDays: new Set(restDays),
    restDays: new Set(restDays),
    dutyLaunchDay: CAP_MONDAY,
    settledThroughDay: settled ? addDays(CAP_SUNDAY, 2) : addDays(CAP_SUNDAY, -1),
    fullDays: [0, 1, 2, 3, 4, 5, 6].map((d) => addDays(CAP_MONDAY, d)),
  };
}

/** The state once `plans` are written: their WEEK keys judged and their mints read back. */
function withPlans(s: WeekJudgeState, plans: readonly WeekPlan[], settled: boolean): WeekJudgeState {
  return {
    ...s,
    settledThroughDay: settled ? addDays(CAP_SUNDAY, 2) : s.settledThroughDay,
    judged: new Set([...s.judged, ...plans.flatMap((p) => p.tracks.map((t) => weekRowKey(t.track, p.weekKey)))]),
    mints: [...s.mints, ...plans.flatMap((p) => p.mints.map((m) => ({ day: m.day, qty: m.delta, reason: m.reason, key: m.dedupeKey })))],
  };
}

const mintsOf = (plans: readonly WeekPlan[]) => plans.flatMap((p) => p.mints);
const paidOf = (plans: readonly WeekPlan[]) => Math.round(mintsOf(plans).reduce((s, m) => s + m.delta, 0) * 100) / 100;
/** Every mint key with what it paid, sorted: equal maps mean the same totals and the same trimmed set. */
const ledgerOf = (plans: readonly WeekPlan[]) =>
  mintsOf(plans)
    .map((m) => `${m.dedupeKey}=${m.delta}`)
    .sort()
    .join(",");

/** Prints the LIFE block; returns the number of failed assertions. */
function lifeBlock(pool: number, knowledgePerDay: number): number {
  let failures = 0;
  const check = (name: string, ok: boolean, detail: string) => {
    if (!ok) failures += 1;
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
  };
  const horizons: readonly Horizon[] = ["SHORT", "MID", "LONG"];
  const years = (perDay: number) => pool / perDay / 365;

  console.log("\n── Life (M5) ────────────────────────────────");

  // Income. Capped reasons (kept weeks, Short goals, M2's full days) share
  // the weekly cap; Mid and Long goals are limited by their own windows.
  const cappedPerDay = LIFE_MP_WEEK_CAP / 7;
  const uncapped = horizons
    .filter((h) => !GOAL_RULES[h].capped)
    .map((h) => ({ h, perDay: (GOAL_RULES[h].stated * GOAL_RULES[h].maxPaying) / GOAL_RULES[h].windowDays }));
  const worst = cappedPerDay + uncapped.reduce((s, u) => s + u.perDay, 0);
  const ceiling = LIFE_SHARE_CEILING * knowledgePerDay;
  // Committed: the weekly cap reached every week, plus one Mid a quarter paid in full.
  const committed = cappedPerDay + GOAL_RULES.MID.stated / COMMITTED_MID_EVERY_DAYS;

  console.log(`  knowledge income                   ${fmt(knowledgePerDay, 3)} MP/day`);
  console.log(
    `  worst case: cap ${LIFE_MP_WEEK_CAP}/7 ${fmt(cappedPerDay, 4)}` +
      uncapped.map((u) => ` + ${GOAL_RULES[u.h].name} ${GOAL_RULES[u.h].stated} × ${GOAL_RULES[u.h].maxPaying}/${GOAL_RULES[u.h].windowDays} ${fmt(u.perDay, 4)}`).join("") +
      ` = ${fmt(worst, 4)} MP/day (${fmt((100 * worst) / knowledgePerDay, 3)}% of knowledge)`,
  );
  console.log(
    `  committed: cap every week + a Mid a quarter = ${fmt(committed, 3)} MP/day (${fmt((100 * committed) / knowledgePerDay, 2)}%), horizon ${fmt(years(knowledgePerDay + committed))} y`,
  );
  console.log(
    `  whole pool: ${fmt(years(knowledgePerDay))} y knowledge only → ${fmt(years(knowledgePerDay + committed))} y committed → ${fmt(years(knowledgePerDay + worst))} y worst`,
  );

  // The basket and the personas.
  const steady = personaOf("steady");
  const light = personaOf("light");
  const heavy = personaOf("heavy");
  const steadyXpByTrack = TRACKS.map((t) => `${TRACK_LABEL[t]} ${fmt(steady.xpPerWeek[t], 1)}`).join(" · ");
  console.log(`  basket (${LIFE_BASKET.length} rows, ${BASKET_STREAK_DAYS}-day streaks): steady XP/week ${steadyXpByTrack}`);
  for (const p of [light, steady, heavy]) {
    console.log(
      `    ${p.name.padEnd(6)} ×${PERSONA_SCALE[p.name]}  ${fmt(p.tasksPerDay, 1)} tasks/day · raw ${fmt(p.rawPerDay, 1)}/day · mean track ${fmt(p.meanTrackXpPerWeek, 1)} XP/week`,
    );
  }

  // Pacing plans. The mean track stands for each track.
  const sixOfSeven = (w: number) => w % 7 !== 0;
  const everyWeek = () => true;
  const midAtWeek26: PaidGoal[] = [{ horizon: "MID", day: 7 * 26, depth: GOAL_RULES.MID.depth, mp: GOAL_RULES.MID.stated }];
  const lastDay = 7 * PACE_HORIZON_WEEKS;
  // Every goal pays in full; Shorts add no depth but fill the weekly cap with the kept weeks.
  const worstGoals = horizons.flatMap((h) => densestGoals(h, lastDay, (g) => GOAL_RULES[g].stated));
  const plans = {
    steady: { label: "steady, 6 of 7 weeks kept, a Mid at week 26", xpPerWeek: steady.meanTrackXpPerWeek, kept: sixOfSeven, goals: midAtWeek26 },
    light: { label: "light, 6 of 7 weeks kept, a Mid at week 26", xpPerWeek: light.meanTrackXpPerWeek, kept: sixOfSeven, goals: midAtWeek26 },
    steadyAll: { label: "steady, every week kept, no goals", xpPerWeek: steady.meanTrackXpPerWeek, kept: everyWeek, goals: [] },
    heavyAll: { label: "heavy, every week kept, no goals", xpPerWeek: heavy.meanTrackXpPerWeek, kept: everyWeek, goals: [] },
    worst: {
      label:
        `worst: heavy, every week kept, ${GOAL_RULES.SHORT.maxPaying} Shorts a week, ` +
        `a Mid every ${GOAL_RULES.MID.windowDays / GOAL_RULES.MID.maxPaying} d from day ${GOAL_RULES.MID.minLifetimeDays}, ` +
        `a Long every ${GOAL_RULES.LONG.windowDays / GOAL_RULES.LONG.maxPaying} d from day ${GOAL_RULES.LONG.minLifetimeDays}, all on one track`,
      xpPerWeek: heavy.meanTrackXpPerWeek,
      kept: everyWeek,
      goals: worstGoals,
    },
  } satisfies Record<string, PacePlan>;

  console.log(
    `  levels: floor(√xp / ${TRACK_LEVEL_STEP}), capped at ${TRACK_DEPTH_GRACE} + floor(${TRACK_DEPTH_WEEK_COEF}·√kept weeks + goal depth ≤ ${GOAL_DEPTH_CAP})`,
  );
  for (const plan of Object.values(plans)) {
    const firsts = [3, 4, 5, 10].map((l) => `L${l} wk ${firstWeekAt(plan, l) ?? "—"}`).join(" · ");
    console.log(`    ${plan.label}: ${firsts} · at week 52 L${paceAt(plan, 52).level}`);
  }

  // Assertions.
  console.log("  assertions:");
  check(
    "1. worst-case life income ≤ 3% of knowledge",
    worst <= ceiling + 1e-9,
    `${fmt(worst, 4)} ≤ ${fmt(ceiling, 4)} MP/day`,
  );

  const worstYears = years(knowledgePerDay + worst);
  check("2. whole-pool horizon with worst-case life", worstYears >= MIN_HORIZON_YEARS, `${fmt(worstYears)} y ≥ ${MIN_HORIZON_YEARS} y`);

  // M5's capped reasons at their most: every track kept, both Shorts paid. Above the cap M5 would
  // trim its own published amounts; below it the cap is headroom no M5 reason earns, so assertion 1's
  // CAP/7 would price income that does not exist yet (M2's full days must fit inside it, by trimming).
  const reachable = TRACKS.length * LIFE_MP.WEEK_KEPT + GOAL_RULES.SHORT.maxPaying * GOAL_RULES.SHORT.stated;
  const fills = Math.abs(reachable - LIFE_MP_WEEK_CAP) < 1e-9;
  check(
    "3. M5's most in one life week fills the weekly cap exactly",
    fills,
    `${TRACKS.length} × ${LIFE_MP.WEEK_KEPT} + ${GOAL_RULES.SHORT.maxPaying} × ${GOAL_RULES.SHORT.stated} = ${reachable} ${fills ? "=" : "≠"} cap ${LIFE_MP_WEEK_CAP}`,
  );

  // 3b (M2). With full days the capped reasons can ask for more than the cap: the judge mints them
  // last, so the cap trims full days and never a kept track, and Shorts (paid first) trim full days.
  const m2Most = TRACKS.length * LIFE_MP.WEEK_KEPT + GOAL_RULES.SHORT.maxPaying * GOAL_RULES.SHORT.stated + 7 * LIFE_MP.FULL_DAY;
  const byShorts = [0, 1, 2].map((shorts) => {
    const plans = planWeeks(capWeek(shorts, true));
    const mints = mintsOf(plans);
    const tracks = mints.filter((m) => m.reason === "LIFE_WEEK_KEPT");
    const full = mints.filter((m) => m.reason === "LIFE_FULL_DAY");
    const lastTrack = mints.findIndex((m, i) => m.reason === "LIFE_WEEK_KEPT" && !mints.slice(i + 1).some((x) => x.reason === "LIFE_WEEK_KEPT"));
    return {
      shorts,
      tracksWhole: tracks.length === TRACKS.length && tracks.every((m) => m.delta === LIFE_MP.WEEK_KEPT),
      fullPaid: full.filter((m) => m.delta > 0).length,
      fullRows: full.length,
      lastFirst: full.every((m) => mints.indexOf(m) > lastTrack),
      used: Math.round((shorts * GOAL_RULES.SHORT.stated + paidOf(plans)) * 100) / 100,
    };
  });
  const expectedFull = (shorts: number) => Math.max(0, Math.min(7, Math.floor((LIFE_MP_WEEK_CAP - shorts * GOAL_RULES.SHORT.stated - TRACKS.length * LIFE_MP.WEEK_KEPT) / LIFE_MP.FULL_DAY + 1e-9)));
  const ok3b =
    m2Most > LIFE_MP_WEEK_CAP &&
    byShorts.every((r) => r.tracksWhole && r.lastFirst && r.fullRows === 7 && r.fullPaid === expectedFull(r.shorts) && r.used === LIFE_MP_WEEK_CAP);
  check(
    "3b. M2's capped reasons exceed the cap; full days are minted last, so they are what it trims",
    ok3b,
    `${TRACKS.length} × ${LIFE_MP.WEEK_KEPT} + ${GOAL_RULES.SHORT.maxPaying} × ${GOAL_RULES.SHORT.stated} + 7 × ${LIFE_MP.FULL_DAY} = ${m2Most} > cap ${LIFE_MP_WEEK_CAP}; ` +
      byShorts.map((r) => `${r.shorts} Shorts → tracks ${r.tracksWhole ? "4 × 1.5" : "TRIMMED"}, full days paid ${r.fullPaid} of 7${r.lastFirst ? "" : " BEFORE a track"}, week ${fmt(r.used, 1)}`).join(" · "),
  );

  // 3c (M2). Settlement holds DUTY back (decision 5): BODY, CRAFT and CARE mint on Wednesday, DUTY and
  // the full days in a later run. The totals and the trimmed set must equal a single run's.
  const splits = [0, 1, 2].map((shorts) => {
    const single = planWeeks(capWeek(shorts, true));
    const first = capWeek(shorts, false);
    const run1 = planWeeks(first);
    const run2 = planWeeks(withPlans(first, run1, true));
    const tracks1 = run1.flatMap((p) => p.tracks.map((t) => t.track)).join();
    const tracks2 = run2.flatMap((p) => p.tracks.map((t) => t.track)).join();
    return { shorts, same: ledgerOf(single) === ledgerOf([...run1, ...run2]), gated: tracks1 === "BODY,CRAFT,CARE" && tracks2 === "DUTY", total: paidOf([...run1, ...run2]), single: paidOf(single) };
  });
  check(
    "3c. split runs (BODY, CRAFT, CARE; then DUTY and the full days) total and trim exactly as one",
    splits.every((r) => r.same && r.gated),
    splits.map((r) => `${r.shorts} Shorts: split ${fmt(r.total, 1)} ${r.same ? "=" : "≠"} single ${fmt(r.single, 1)}${r.gated ? "" : " (the gate did not split the run)"}`).join(" · "),
  );

  // Held weeks (decision 20) mint nothing: pro-rated floors add no MP beyond kept weeks.
  const heldWeek = planWeeks({ ...capWeek(0, true, [0, 1, 2, 3, 4, 5].map((d) => addDays(CAP_MONDAY, d))), rows: [], fullDays: [] });
  const heldTracks = heldWeek.flatMap((p) => p.tracks);
  check(
    "3d. a held week mints nothing",
    heldTracks.length === TRACKS.length && heldTracks.every((t) => t.held && !t.kept) && mintsOf(heldWeek).length === 0 && weekKeyOf(CAP_MONDAY) === heldWeek[0]?.weekKey,
    `6 rest days, nothing done: ${heldTracks.map((t) => `${t.track} ${t.held ? "held" : t.kept ? "kept" : "not kept"}`).join(", ")}; ${mintsOf(heldWeek).length} mints`,
  );

  check(
    "4. steady basket volume",
    steady.tasksPerDay >= 5 && steady.tasksPerDay <= 10 && steady.meanTrackXpPerWeek >= 80 && steady.meanTrackXpPerWeek <= 130,
    `${fmt(steady.tasksPerDay, 1)} tasks/day in [5, 10] · mean track ${fmt(steady.meanTrackXpPerWeek, 1)} XP/week in [80, 130]`,
  );

  const s9 = paceAt(plans.steady, 9).level;
  const s13 = paceAt(plans.steady, 13).level;
  const s10 = firstWeekAt(plans.steady, 10);
  check(
    "5. steady pacing",
    s9 >= 3 && s9 <= 5 && s13 >= 3 && s13 <= 5 && s10 != null && s10 >= 44 && s10 <= 60,
    `level at week 9 = ${s9} in [3, 5] · at week 13 = ${s13} in [3, 5] · first level 10 at week ${s10 ?? "never"} in [44, 60]`,
  );

  const l10 = firstWeekAt(plans.light, 10);
  check("6. light pacing", l10 == null || l10 > 60, `first level 10 at week ${l10 ?? "never"} > 60`);

  const h52 = paceAt(plans.heavyAll, 52).level;
  const sa52 = paceAt(plans.steadyAll, 52).level;
  check("7. volume buys at most one level at week 52", h52 - sa52 <= 1, `heavy ${h52} − steady ${sa52} = ${h52 - sa52} ≤ 1`);

  const w13 = paceAt(plans.worst, 13).level;
  const w10 = firstWeekAt(plans.worst, 10);
  check(
    "8. worst-case pacing",
    w13 <= 7 && (w10 == null || w10 >= 26),
    `level at week 13 = ${w13} ≤ 7 · first level 10 at week ${w10 ?? "never"} ≥ 26`,
  );

  const worst52 = paceAt(plans.worst, 52);
  const worstBonus = keptBonusPercent(worst52.keptStreak);
  const flood = topAttribute(lifeOnlyScores(worst52.level, worstBonus));
  const gate = requiredAttributeScore(FLOOD_TIER);
  check(
    "9. flood: life alone stays below the tier-5 gate",
    flood.score < gate,
    `all four tracks at L${worst52.level} +${fmt(worstBonus, 1)}% on seed compositions → ${flood.attribute} ${fmt(flood.score)} < ${gate}`,
  );
  // The 65% task pull (M5 review C6): a track's mix moves toward its tasks', so
  // the seed case above is not the bound. Unclamped, life alone opens the gate;
  // each track's share of an attribute is therefore clamped at max(seed, 16).
  const pull = pulledFlood(worst52.level, worstBonus);
  console.log(
    `       (with the 65% task pull and every task naming one attribute at 100, unclamped: ${pull.pulled.attribute} ${fmt(pull.pulled.score)}, over the gate)`,
  );
  check(
    "9b. flood with the task pull: the share clamp holds life alone below the tier-5 gate",
    pull.ceiling.score < gate && pull.clamped.score <= pull.ceiling.score + 0.01 && pull.clamped.score < gate,
    `each track's share of an attribute ≤ max(seed, ${TRACK_SHARE_CAP}); any mix → at most ${pull.ceiling.attribute} ${fmt(pull.ceiling.score)} < ${gate} (all-in mixes through the code: ${pull.clamped.attribute} ${fmt(pull.clamped.score)})`,
  );
  const steady52 = paceAt(plans.steadyAll, 52);
  const steadyFlood = topAttribute(lifeOnlyScores(steady52.level, keptBonusPercent(steady52.keptStreak)));
  console.log(
    `       (steady, every week kept, all at L${steady52.level} +${fmt(keptBonusPercent(steady52.keptStreak), 1)}%: ${steadyFlood.attribute} ${fmt(steadyFlood.score)})`,
  );

  // Printed only: what life alone opens, against what life has paid by then.
  console.log("  emblems whose attribute gates and prerequisites life alone opens (printed, not asserted):");
  const emblemPlan: PacePlan = { label: "steady, every week kept, a Mid at week 26", xpPerWeek: steady.meanTrackXpPerWeek, kept: everyWeek, goals: midAtWeek26 };
  for (const [plan, week] of [[emblemPlan, 13], [emblemPlan, 52], [plans.worst, 52]] as const) {
    const st = paceAt(plan, week);
    const bonus = keptBonusPercent(st.keptStreak);
    const opened = emblemsLifeOpens(lifeOnlyScores(st.level, bonus));
    console.log(
      `    ${plan.label}, week ${week} (L${st.level} +${fmt(bonus, 1)}%): ${opened.count} emblems costing ${fmt0(opened.cost)} MP; life MP earned by then ${fmt0(lifeMpEarned(plan, week))}`,
    );
  }

  console.log(failures ? `  LIFE: ${failures} assertion(s) failed` : "  LIFE: all assertions hold");
  return failures;
}

function main() {
  const byRank = new Map<string, { n: number; cost: number }>();
  let total = 0;
  for (const s of SKILL_POOL) {
    const e = byRank.get(s.rank) ?? { n: 0, cost: 0 };
    e.n += 1;
    e.cost += s.masteryCost;
    byRank.set(s.rank, e);
    total += s.masteryCost;
  }

  console.log("── Pool ─────────────────────────────────────");
  for (const [rank, e] of [...byRank].sort((a, b) => a[1].cost - b[1].cost)) {
    console.log(
      `  ${rank.padEnd(9)} ${String(e.n).padStart(4)} emblems  ` +
      `${e.cost.toLocaleString().padStart(12)} mastery  ` +
      `(avg ${Math.round(e.cost / e.n).toLocaleString()})`
    );
  }
  console.log(`  ${"TOTAL".padEnd(9)} ${String(SKILL_POOL.length).padStart(4)} emblems  ${total.toLocaleString().padStart(12)} mastery\n`);

  // ── Income ────────────────────────────────────────────
  // Two streams: a trickle per review, and a lump when an Idea masters.
  const avgLevel = (1 + MAX_LEVEL) / 2;
  const perReview = REVIEW_MASTERY_PER_LEVEL * avgLevel;
  const reviewIncomePerDay = REVIEWS_PER_DAY * perReview;

  const newPerDay = NEW_IDEAS_PER_WEEK / 7;
  // At steady state, ideas master at the rate they are added.
  const masteryIncomePerDay = newPerDay * IDEA_MASTERY_POINTS;
  const perDay = reviewIncomePerDay + masteryIncomePerDay;

  console.log("── Income, committed player ─────────────────");
  console.log(`  ${REVIEWS_PER_DAY} reviews/day at ${perReview.toFixed(3)} each   ${reviewIncomePerDay.toFixed(2)}/day`);
  console.log(`  ${NEW_IDEAS_PER_WEEK} new ideas/week mastering        ${masteryIncomePerDay.toFixed(2)}/day`);
  console.log(`  ${"total".padEnd(34)} ${perDay.toFixed(2)}/day  (${(perDay * 365).toFixed(0)}/year)\n`);

  console.log("── Horizon ──────────────────────────────────");
  console.log(`  whole pool          ${fmtYears(total / perDay).padStart(8)}`);
  let cumulative = 0;
  for (const [rank, e] of [...byRank].sort((a, b) => a[1].cost / a[1].n - b[1].cost / b[1].n)) {
    cumulative += e.cost;
    console.log(`  through ${rank.padEnd(10)} ${fmtYears(cumulative / perDay).padStart(8)}`);
  }

  const cheapest = [...SKILL_POOL].sort((a, b) => a.masteryCost - b.masteryCost);
  console.log(`\n  first emblem        ${fmtYears(cheapest[0].masteryCost / perDay).padStart(8)}  (${cheapest[0].masteryCost} mastery)`);
  console.log(`  first ten           ${fmtYears(cheapest.slice(0, 10).reduce((s, x) => s + x.masteryCost, 0) / perDay).padStart(8)}`);
  console.log(`  dearest emblem      ${fmtYears(cheapest[cheapest.length - 1].masteryCost / perDay).padStart(8)}  (${cheapest[cheapest.length - 1].masteryCost.toLocaleString()} mastery)`);

  const ideasNeeded = (total / IDEA_MASTERY_POINTS);
  console.log(`\n  ideas to master for the pool on lumps alone: ${Math.round(ideasNeeded).toLocaleString()}`);
  console.log(`  reviews for the pool: ${Math.round(total / perReview).toLocaleString()} (${fmtYears(total / perReview / REVIEWS_PER_DAY)} at ${REVIEWS_PER_DAY}/day)`);
  console.log(`  reviews to master one idea: ${REVIEWS_TO_MASTER}`);
  console.log(`  days to master one idea:    ${DAYS_TO_MASTER} (${fmtYears(DAYS_TO_MASTER)})`);
  console.log(`  days to max one idea:       ${DAYS_TO_MAX} (${fmtYears(DAYS_TO_MAX)})`);

  const failures = lifeBlock(total, perDay);
  if (failures > 0) process.exitCode = 1;
}

main();
