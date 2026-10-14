/**
 * Spacing (2026-10-14): per-idea ease on the Ebbinghaus curve, one lapse a day, relearning, and the review session
 * that asks a missed card again at its end.
 *
 *   1. The curve (forgetting.ts): R(t) = e^(−t/S), S = I ÷ ln(1/0.9), I = baseline(level) × ease; the n-th level goes
 *      at I·(ln(0.9 − 0.075n)/ln 0.9 − 1) past due (the first at about 0.83·I).
 *   2. The interval (xp.ts): the ladder is the baseline, the idea's ease scales it (× [0.75, 1.25) at levels 5–8, as
 *      before); at ease 1 it is bit for bit the old ladder. The confirm and relearn intervals read the ease.
 *   3. Ease updates: a clean recall × 1.02 (more when late: × min(1.2, √(e/I))), the day's lapse × 0.85, held to
 *      [0.6, 1.8]; a relearn changes nothing. The gain is calibrated to the 90% target.
 *   4. One lapse a day (srs.ts missKindOf): the first miss of a life day is the lapse; a retry the same day changes
 *      nothing; two lapsed cycles in a row cost a level; a right retry relearns (level held, back soon).
 *   5. A card's life, simulated with srs.ts's own pure writes (passPlanOf, strikeDataOf, degradeDataOf, wardDataOf).
 *   6. "I was right" puts the card back exactly (the miss row's receipt: missStateOf → undoStateOf).
 *   7. The session (review-model.ts): a miss returns at the end up to 3 times (never in an encounter), the counter is
 *      honest about returns, the recap counts relearned cards, and no session sentence says wrong or fail.
 *   8. Wiring: srs.ts, the actions, the runner, the panel, the recap, the loaders and the library line.
 *   9. Pacing: the eased walk to mastery stays within 30% of the baseline ladder.
 *
 * Pure (fixtures and source pins; no database): `npx tsx scripts/spacing-check.ts`.
 */
import "./_no-model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CLEAN_PAIR_FROM,
  EASE_CLEAN_GAIN,
  EASE_DEFAULT,
  EASE_LAPSE_FACTOR,
  EASE_LATE_CREDIT_MAX,
  EASE_MAX,
  EASE_MIN,
  MASTERY_LEVEL,
  MAX_LEVEL,
  RELEARN_INTERVAL_SHARE,
  baseIntervalDays,
  clampEase,
  cleanRecallOnTime,
  confirmIntervalDays,
  easeAfterClean,
  easeAfterLapse,
  easeText,
  ideaIntervalDays,
  lateCredit,
  lateRatioOf,
  nextIntervalDays,
  relearnIntervalDays,
  riseBaseIntervalDays,
  riseEase,
  riseIntervalDays,
  riseLine,
  riseStep,
  scheduledIntervalDays,
  type RiseKind,
} from "../src/lib/xp";
import { DESIGN_RETENTION, daysToForget, intervalOf, levelsForgotten, retrievability, stabilityOf } from "../src/lib/forgetting";
import {
  cleanStateBefore,
  degradeDataOf,
  missKindOf,
  missReceiptOf,
  missStateData,
  missStateOf,
  passPlanOf,
  strikeDataOf,
  undoStateOf,
  wardDataOf,
  type MissReceipt,
} from "../src/lib/srs";
import { dateColumn, dayStartOf, keyOfDateColumn, todayKey } from "../src/lib/life-day";
import { relearnedHeadline, trueFactOf, type FactInput, type MissOutcome } from "../src/lib/review-facts";
import {
  SESSION_RETURNS_MAX,
  backTomorrowOf,
  isReturnAt,
  missLineOf,
  progressOf,
  queueAfterAnswer,
  queueAfterOverride,
  recapLineOf,
  relearnedOf,
  returnsWaitingOf,
  tallyOf,
  type CardResult,
  type RunCard,
} from "../src/components/workspace/review-model";
import { outlookLines, spacingLine } from "../src/components/library/library-model";
import { reviewFixtures } from "../src/app/dev/style/review/fixtures";
import type { SubmitReviewResult } from "../src/app/actions/review";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? `  (${detail})` : ""}`);
  }
}
const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
/** Source without comments, so a pin never matches prose. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const DAY = 86_400_000;
const LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);
const EASES = [0.6, 0.72, 0.85, 1, 1.3, 1.62, 1.8];

/** Math.random pinned to `v` while `fn` runs (the 5–8 jitter), so a schedule reads a known draw. */
function withRandom<T>(v: number, fn: () => T): T {
  const r = Math.random;
  Math.random = () => v;
  try {
    return fn();
  } finally {
    Math.random = r;
  }
}

// ── 1. The Ebbinghaus curve ─────────────────────────────────────────────────
{
  check(
    "curve: R(t) = e^(−t/S) with S = I ÷ ln(1/0.9), I = baseline(level) × ease: 90% on the due day at every level and ease",
    LEVELS.every((L) => EASES.every((e) => near(intervalOf(L, e), baseIntervalDays(L) * e) && near(stabilityOf(L, e) * Math.log(1 / 0.9), intervalOf(L, e)) && near(retrievability(intervalOf(L, e), stabilityOf(L, e)), DESIGN_RETENTION)))
  );
  check("curve: R(2I) = 0.81, R(3I) = 0.729; e^(−t/S) exactly", near(retrievability(2 * intervalOf(7), stabilityOf(7)), 0.81) && near(retrievability(3 * intervalOf(7, 1.3), stabilityOf(7, 1.3)), 0.729) && near(retrievability(5, 10), Math.exp(-0.5)));
  const k = (n: number) => Math.log(0.9 - 0.075 * n) / Math.log(0.9) - 1;
  check(
    "curve: the first level goes about 0.83·I past due, the second 1.73·I, the third 2.73·I (never inside the grace)",
    near(k(1), 0.8258, 1e-4) && near(k(2), 1.7305, 1e-4) && near(k(3), 2.7305, 1e-4) && [9, 12, 15].every((L) => EASES.every((e) => near(daysToForget(L, 1, 0, e)!, Math.max(L - 1, k(1) * baseIntervalDays(L) * clampEase(e)), 1e-6)))
  );
  check("curve: a card's ease moves its forgetting with its spacing (L10: tighter forgets sooner, wider later)", daysToForget(10, 1, 0, 0.6)! < daysToForget(10, 1)! && daysToForget(10, 1)! < daysToForget(10, 1, 0, 1.8)! && levelsForgotten(10, 70, 0, 0.6) >= 1 && levelsForgotten(10, 70, 0, 1.8) === 0);
}

// ── 2. The interval: baseline × ease ────────────────────────────────────────
{
  check(
    "interval: round(baseline(level) × ease) at every level and ease (no jitter)",
    LEVELS.every((L) => EASES.every((e) => ideaIntervalDays(L, e, { jitter: false }) === Math.round(baseIntervalDays(L) * e)))
  );
  check("interval: the ease is held to [0.6, 1.8] (anything not finite reads 1)", ideaIntervalDays(12, 5, { jitter: false }) === Math.round(160 * EASE_MAX) && ideaIntervalDays(12, 0.1, { jitter: false }) === Math.round(160 * EASE_MIN) && clampEase(Number.NaN) === 1 && clampEase(null) === 1 && EASE_MIN === 0.6 && EASE_MAX === 1.8);
  // Bit for bit the old ladder at ease 1: the same floats in the same order.
  const oldNext = (level: number, m: number, r: number) => {
    const c = Math.min(MAX_LEVEL, Math.max(1, level));
    const base = baseIntervalDays(c);
    return c >= 5 && c <= 8 ? Math.round(base * (0.75 + r * 0.5) * m) : Math.round(base * m);
  };
  let same = true;
  for (const r of [0, 0.123, 0.5, 0.999]) for (const m of [1, 1.25, 1.5]) for (const L of [0, ...LEVELS, 21]) if (withRandom(r, () => nextIntervalDays(L, m)) !== oldNext(L, m, r)) same = false;
  check("interval: at ease 1, nextIntervalDays is bit for bit the old ladder (every draw, INTERVAL_DILATION 1–1.5)", same);
  check(
    "interval: levels 5–8 keep their ±25% draw, around the eased interval; other levels never draw",
    [5, 6, 7, 8].every((L) => withRandom(0, () => ideaIntervalDays(L, 1.3)) === Math.round(baseIntervalDays(L) * 1.3 * 0.75) && withRandom(0.999999, () => ideaIntervalDays(L, 1.3)) <= Math.round(baseIntervalDays(L) * 1.3 * 1.25)) &&
      [1, 4, 9, 12, 20].every((L) => withRandom(0, () => ideaIntervalDays(L, 1.3)) === Math.round(baseIntervalDays(L) * 1.3))
  );
  check("interval: the confirm interval (L8+ first clean) reads the ease: max(1, round(0.5 × baseline × ease × m))", [8, 10, 14].every((L) => EASES.every((e) => confirmIntervalDays(L, 1.5, e) === Math.max(1, Math.round(0.5 * baseIntervalDays(L) * e * 1.5)))));
  check(
    "relearn: max(1, round(0.3 × baseline × ease × m)): tomorrow at low levels, sooner than usual at high ones",
    RELEARN_INTERVAL_SHARE === 0.3 &&
      [1, 2, 3].every((L) => relearnIntervalDays(L) === 1) &&
      relearnIntervalDays(5) === 4 &&
      relearnIntervalDays(12) === 48 &&
      relearnIntervalDays(12, 1, 0.85) === 41 &&
      LEVELS.every((L) => EASES.every((e) => relearnIntervalDays(L, 1, e) === Math.max(1, Math.round(0.3 * baseIntervalDays(L) * e)) && (L < 4 || relearnIntervalDays(L, 1, e) < ideaIntervalDays(L, e, { jitter: false }))))
  );
  check(
    "relearn: a relearned rise schedules the relearn interval; up and top the new level's eased interval; confirm the eased confirm",
    LEVELS.every((L) => riseBaseIntervalDays(riseStep(L, 0, true), 1, 0.85) === relearnIntervalDays(L, 1, 0.85)) &&
      riseBaseIntervalDays(riseStep(9, 0, false), 1, 1.3) === confirmIntervalDays(9, 1, 1.3) &&
      riseBaseIntervalDays(riseStep(9, 1, false), 1, 1.3) === Math.round(baseIntervalDays(10) * 1.3) &&
      riseBaseIntervalDays(riseStep(MAX_LEVEL, 0, false), 1, 1.3) === Math.round(baseIntervalDays(MAX_LEVEL) * 1.3) &&
      withRandom(0.5, () => riseIntervalDays(riseStep(5, 0, false), 1, 1.3)) === Math.round(baseIntervalDays(6) * 1.3)
  );
}

// ── 3. Ease updates ─────────────────────────────────────────────────────────
{
  check("ease: a clean recall widens it × 1.02, up to 1.8", EASE_CLEAN_GAIN === 1.02 && near(easeAfterClean(1), 1.02) && near(easeAfterClean(1.3), 1.326) && easeAfterClean(1.79) === EASE_MAX && easeAfterClean(EASE_MAX) === EASE_MAX);
  check(
    "ease: a late clean recall earns × min(1.2, √(e/I)) more (e/I = 1.21 → × 1.1; e/I = 4 → × 1.2, capped); on time or early earns none",
    EASE_LATE_CREDIT_MAX === 1.2 &&
      near(lateCredit(1.21), 1.1) &&
      lateCredit(4) === 1.2 &&
      lateCredit(1) === 1 &&
      lateCredit(0.5) === 1 &&
      lateCredit(Number.NaN) === 1 &&
      near(easeAfterClean(1, 1.21), 1.02 * 1.1) &&
      near(easeAfterClean(1, 4), 1.02 * 1.2) &&
      near(lateRatioOf(10, 5), 1.5) &&
      lateRatioOf(10, -3) === 1 &&
      lateRatioOf(0, 5) === 1
  );
  check("ease: the day's lapse tightens it × 0.85, down to 0.6", EASE_LAPSE_FACTOR === 0.85 && near(easeAfterLapse(1), 0.85) && near(easeAfterLapse(0.85), 0.7225) && easeAfterLapse(0.65) === EASE_MIN && easeAfterLapse(EASE_MIN) === EASE_MIN);
  check(
    "ease: a relearn changes nothing more; a clean recall's step gains (riseEase)",
    riseEase(riseStep(5, 0, true), 0.85) === 0.85 && riseEase(riseStep(5, 0, true), 0.85, 9) === 0.85 && near(riseEase(riseStep(5, 0, false), 0.85), 0.867) && near(riseEase(riseStep(5, 0, false), 1, 1.21), 1.122)
  );
  // Calibrated to the retention target: at 90% recall (9 clean to 1 lapse) the ease holds; it settles near 89%.
  const cycle = Math.pow(EASE_CLEAN_GAIN, 9) * EASE_LAPSE_FACTOR;
  const pStar = Math.log(1 / EASE_LAPSE_FACTOR) / (Math.log(EASE_CLEAN_GAIN) + Math.log(1 / EASE_LAPSE_FACTOR));
  check("ease: calibrated to the 90% target: 9 clean recalls and a lapse leave it within 2% (1.02⁹ × 0.85), and it settles at about 89% recall", Math.abs(cycle - 1) < 0.02 && pStar > 0.88 && pStar < 0.9, `${cycle.toFixed(4)}, p* ${pStar.toFixed(4)}`);
  check(
    "ease: the late credit reads the interval it was scheduled at (the confirm interval with a clean recall in hand from L8)",
    scheduledIntervalDays(9, 1, 1.3) === confirmIntervalDays(9, 1, 1.3) && scheduledIntervalDays(9, 0, 1.3) === Math.round(50 * 1.3) && scheduledIntervalDays(5, 1, 1) === 12 && CLEAN_PAIR_FROM === 8
  );
  check("ease: the library prints it to one decimal ('1.3×'), clamped", easeText(1.32) === "1.3×" && easeText(0.85) === "0.9×" && easeText(1) === "1.0×" && easeText(4) === "1.8×");
}

// ── 4. One lapse a day ──────────────────────────────────────────────────────
const T0 = new Date("2026-10-14T01:00:00Z"); // 12:00 in Sydney, life day 2026-10-14
const at = (base: Date, days: number, minutes = 0) => new Date(base.getTime() + days * DAY + minutes * 60_000);
{
  const today = todayKey(T0);
  const fresh = { lapseDay: null, failedAttempts: 0, graceEndsAt: at(T0, 3) };
  check("lapse: the first miss of a life day is the lapse", missKindOf(fresh, T0, 2) === "lapse");
  check("lapse: a miss on a card that already lapsed today is a retry (nothing changes)", missKindOf({ ...fresh, lapseDay: dateColumn(today), failedAttempts: 1 }, at(T0, 0, 20), 2) === "retry");
  check("lapse: a lapse yesterday does not make today's miss a retry", missKindOf({ ...fresh, lapseDay: dateColumn(todayKey(at(T0, -1))) }, T0, 2) === "lapse");
  check("lapse: the second lapsed cycle in a row degrades (STRIKE_LIMIT 2); STRIKE_TOLERANCE raises it", missKindOf({ ...fresh, failedAttempts: 1 }, T0, 2) === "degrade" && missKindOf({ ...fresh, failedAttempts: 1 }, T0, 3) === "lapse");
  check("lapse: a lapse past the grace degrades at once, as before", missKindOf({ ...fresh, graceEndsAt: at(T0, -1) }, T0, 2) === "degrade");
  // The life day starts at 04:00: a 03:30 retry belongs to the evening before, a 04:30 miss to the new day.
  const late = dayStartOf("2026-10-15");
  const lapsedEvening = { ...fresh, lapseDay: dateColumn("2026-10-14"), failedAttempts: 1 };
  check("lapse: the life day (04:00) decides 'today': 03:30 is still yesterday's retry, 04:30 is a new day's lapse", missKindOf(lapsedEvening, at(late, 0, -30), 3) === "retry" && missKindOf(lapsedEvening, at(late, 0, 30), 3) === "lapse");
}

// ── 5. A card's life, with srs.ts's own writes ─────────────────────────────
type Card = { level: number; cleanStreak: number; cycleMissed: boolean; ease: number; failedAttempts: number; dueDate: Date; graceEndsAt: Date | null; lapseDay: Date | null };
type Step = { kind: RiseKind | "strike" | "degraded" | "shielded" | "retry"; card: Card };
/** One answer, written as applyReviewResult writes it (wiring pins in 8 hold srs.ts to this shape). */
function answer(c: Card, correct: boolean, now: Date, o: { strikeLimit?: number; ward?: boolean; m?: number; grace?: number } = {}): Step {
  const m = o.m ?? 1;
  const g = o.grace ?? 0;
  if (correct) {
    const p = withRandom(0.5, () => passPlanOf(c, now, m, g));
    return { kind: p.step.kind, card: { ...c, ...p.data } };
  }
  const kind = missKindOf(c, now, o.strikeLimit ?? 2);
  if (kind === "retry") return { kind, card: c };
  if (kind === "lapse") return { kind: "strike", card: { ...c, ...strikeDataOf(c, now) } };
  if (o.ward) return { kind: "shielded", card: { ...c, ...wardDataOf(c, now) } };
  return { kind: "degraded", card: { ...c, ...degradeDataOf(c, now, g) } };
}
const card = (level: number, over: Partial<Card> = {}): Card => ({ level, cleanStreak: 0, cycleMissed: false, ease: 1, failedAttempts: 0, dueDate: T0, graceEndsAt: at(T0, level - 1), lapseDay: null, ...over });
const daysFrom = (now: Date, d: Date) => Math.round((d.getTime() - now.getTime()) / DAY);
{
  // A session: L5 missed, asked again twice (missed), then right on its third try.
  const s1 = answer(card(5), false, T0);
  check(
    "life: the day's lapse: strike 1, the cycle missed, ease × 0.85, the day recorded, the streak broken, due tomorrow",
    s1.kind === "strike" && s1.card.failedAttempts === 1 && s1.card.cycleMissed && near(s1.card.ease, 0.85) && keyOfDateColumn(s1.card.lapseDay!) === todayKey(T0) && s1.card.cleanStreak === 0 && daysFrom(T0, s1.card.dueDate) === 1 && s1.card.level === 5,
    JSON.stringify(s1)
  );
  const s2 = answer(s1.card, false, at(T0, 0, 8));
  const s3 = answer(s2.card, false, at(T0, 0, 12));
  check("life: a retry the same day adds no strike and changes nothing (twice)", s2.kind === "retry" && s3.kind === "retry" && eq(s3.card, s1.card));
  const now4 = at(T0, 0, 15);
  const s4 = answer(s3.card, true, now4);
  check(
    "life: right on the retry relearns it: level held, ease kept, a new cycle, the lapsed cycle kept, back at the relearn interval (3 days at L5, 0.85×)",
    s4.kind === "relearned" && s4.card.level === 5 && near(s4.card.ease, 0.85) && !s4.card.cycleMissed && s4.card.failedAttempts === 1 && s4.card.cleanStreak === 0 && daysFrom(now4, s4.card.dueDate) === relearnIntervalDays(5, 1, 0.85) && relearnIntervalDays(5, 1, 0.85) === 3,
    JSON.stringify(s4)
  );
  // Its next due day: a clean recall rises and clears the lapsed cycle.
  const s5 = answer(s4.card, true, s4.card.dueDate);
  check("life: the next due day's right answer is clean (clean = !cycleMissed): a level up, strikes cleared, ease × 1.02", s5.kind === "up" && s5.card.level === 6 && s5.card.failedAttempts === 0 && near(s5.card.ease, 0.85 * 1.02) && !s5.card.cycleMissed);

  // Two lapsed cycles in a row cost a level; the relearn in between does not clear them.
  const a1 = answer(card(5), false, T0);
  const a2 = answer(a1.card, true, at(T0, 0, 10));
  const a3 = answer(a2.card, false, a2.card.dueDate);
  check(
    "life: two lapsed cycles in a row (a relearn between) degrade: level − 1, strikes cleared, the cycle still missed, ease × 0.85 again",
    a2.kind === "relearned" && a3.kind === "degraded" && a3.card.level === 4 && a3.card.failedAttempts === 0 && a3.card.cycleMissed && near(a3.card.ease, 0.7225) && daysFrom(a2.card.dueDate, a3.card.dueDate) === 1,
    JSON.stringify(a3)
  );
  const a4 = answer(a3.card, true, at(a2.card.dueDate, 0, 10));
  check("life: right after the degrade relearns it at the lower level", a4.kind === "relearned" && a4.card.level === 4 && !a4.card.cycleMissed);
  // A clean recall between two lapses clears them: the second is a strike again.
  const b1 = answer(card(5), false, T0);
  const b2 = answer(b1.card, true, at(T0, 0, 10));
  const b3 = answer(b2.card, true, b2.card.dueDate);
  const b4 = answer(b3.card, false, b3.card.dueDate);
  check("life: a clean recall between two lapses clears the count: the second lapse is strike 1, not a degrade", b3.kind === "up" && b4.kind === "strike" && b4.card.failedAttempts === 1 && b4.card.level === 6);
  // A session left before a right retry: due tomorrow, and tomorrow's right answer relearns (the cycle is still missed).
  const c1 = answer(card(7), false, T0);
  const c2 = answer(c1.card, true, c1.card.dueDate);
  const c2wrong = answer(c1.card, false, c1.card.dueDate);
  check("life: a session left before the retry is safe: due tomorrow; then right relearns, wrong is the second lapse", daysFrom(T0, c1.card.dueDate) === 1 && c2.kind === "relearned" && c2.card.level === 7 && c2wrong.kind === "degraded" && c2wrong.card.level === 6);
  // STRIKE_TOLERANCE, the grace, a ward.
  const d1 = answer(answer(answer(card(5), false, T0, { strikeLimit: 3 }).card, true, at(T0, 0, 5)).card, false, at(T0, 3), { strikeLimit: 3 });
  check("life: with an extra strike the second lapsed cycle is strike 2, not a degrade", d1.kind === "strike" && d1.card.failedAttempts === 2 && d1.card.level === 5);
  const pastGrace = answer(card(6, { graceEndsAt: at(T0, -1) }), false, T0);
  check("life: a lapse past the grace degrades at once", pastGrace.kind === "degraded" && pastGrace.card.level === 5);
  const warded = answer(answer(answer(card(9), false, T0).card, true, at(T0, 0, 5)).card, false, at(T0, 5), { ward: true });
  check("life: a ward holds the level; the lapse still tightens the spacing and misses the cycle", warded.kind === "shielded" && warded.card.level === 9 && warded.card.failedAttempts === 0 && warded.card.cycleMissed && near(warded.card.ease, 0.7225));
  // The ease over a card's life: never outside [0.6, 1.8].
  let e = card(3);
  let ok = true;
  for (let i = 0; i < 60; i++) {
    const now = e.dueDate;
    e = answer(e, i % 5 !== 4, now).card;
    if (e.cycleMissed) e = answer(e, true, at(now, 0, 10)).card;
    if (!(e.ease >= EASE_MIN && e.ease <= EASE_MAX)) ok = false;
  }
  check("life: over 60 due days (a lapse every fifth) the ease stays in [0.6, 1.8]", ok, String(e.ease));
  // Late: recalled 20 days after a 12-day interval was due → e/I = 32/12 → √2.67 = 1.63, capped at 1.2.
  const lateUp = answer(card(5, { dueDate: at(T0, -20) }), true, T0);
  const onTime = answer(card(5), true, T0);
  check("life: a late clean recall earns the late credit (capped × 1.2); on time earns the gain alone", near(lateUp.card.ease, 1.02 * 1.2) && near(onTime.card.ease, 1.02));
}

// ── 6. "I was right" puts the card back exactly ─────────────────────────────
{
  const exact = (before: Card, after: Card, outcome: string, qty: number | null) => {
    const receipt: MissReceipt = { v: "review-miss/1", before: missStateOf(before) };
    // The row is stored as JSON: read it back as the database returns it.
    const stored = JSON.parse(JSON.stringify(receipt)) as unknown;
    const back = undoStateOf(outcome, after.failedAttempts, qty, stored);
    return { back, restored: back ? ({ ...after, ...back } as Card) : after };
  };
  const strip = (c: Card) => ({ ...c, dueDate: c.dueDate.toISOString(), graceEndsAt: c.graceEndsAt?.toISOString() ?? null, lapseDay: c.lapseDay ? keyOfDateColumn(c.lapseDay) : null });
  const before = card(9, { cleanStreak: 1, ease: 1.21, lapseDay: dateColumn(todayKey(at(T0, -30))) });
  const struck = answer(before, false, T0);
  const u1 = exact(before, struck.card, "strike", before.cleanStreak);
  check("undo: a strike is put back exactly (ease, cycle, lapse day, strikes, streak, due date, grace end)", eq(strip(u1.restored), strip(before)), JSON.stringify({ restored: strip(u1.restored), before: strip(before) }));
  const passAfter = withRandom(0.5, () => passPlanOf(u1.restored, T0, 1, 0));
  const passOriginal = withRandom(0.5, () => passPlanOf(before, T0, 1, 0));
  check("undo: the pass after it is the pass the right answer would have been (L9 1 of 2 → L10, ease × 1.02)", eq(passAfter.data, passOriginal.data) && passAfter.step.kind === "up" && passAfter.data.level === 10);
  const before2 = card(6, { failedAttempts: 1, ease: 0.85, lapseDay: dateColumn(todayKey(at(T0, -4))) });
  const degraded = answer(before2, false, T0);
  const u2 = exact(before2, degraded.card, "degraded", 0);
  check("undo: a degrade's state is put back exactly (its level and points come back separately, as before)", degraded.kind === "degraded" && eq(strip({ ...u2.restored, level: before2.level }), strip(before2)));
  const before3 = card(9);
  const shielded = answer(answer(answer(before3, false, T0).card, true, at(T0, 0, 5)).card, false, at(T0, 5), { ward: true });
  check("undo: a ward's save is put back to the state before that miss", eq(strip(exact(answer(answer(before3, false, T0).card, true, at(T0, 0, 5)).card, shielded.card, "shielded", 0).restored), strip(answer(answer(before3, false, T0).card, true, at(T0, 0, 5)).card)));
  const relearnTarget = answer(before, false, T0).card;
  check("undo: a retry changed nothing, so nothing is put back (the pass that follows relearns, as a right retry does)", undoStateOf("retry", 1, null, null) === null && answer(relearnTarget, true, at(T0, 0, 3)).kind === "relearned");
  check(
    "undo: a row from before the receipt falls back to its qty (cleanStateBefore), the cycle missed exactly when a strike remains",
    eq(undoStateOf("strike", 1, 1, null), { ...cleanStateBefore("strike", 1, 1), cycleMissed: false }) && eq(undoStateOf("degraded", 0, null, { v: "other" }), { failedAttempts: 1, cleanStreak: 0, cycleMissed: true }) && missReceiptOf({ v: "review-miss/1", before: { ease: "x" } }) === null && missReceiptOf(null) === null
  );
  check("undo: the receipt round-trips (missStateOf → missStateData)", eq(strip({ ...before, ...missStateData(missStateOf(before)) }), strip(before)));
}

// ── 7. The session ──────────────────────────────────────────────────────────
const fx = reviewFixtures();
const runCard = (id: string, level = 3): RunCard => ({ ...fx.cards[0], id, level, preview: `Card ${id}`, prompt: null, questionType: "SHORT" });
/** A result of the given kind, borrowed from the fixtures (the outcomes the session reads). */
function resultOf(kind: "pass" | "relearn" | "strike" | "retry" | "degraded"): SubmitReviewResult {
  const pass = fx.results[0].result;
  const relearn = fx.results[6].result;
  const miss = fx.results[5].result;
  if (kind === "pass") return pass;
  if (kind === "relearn") return relearn;
  if (kind === "strike") return miss;
  if (kind === "retry") return { ...miss, outcome: { outcome: "retry", level: 3, nextCombo: 0, nextDue: miss.outcome.nextDue } };
  return { ...miss, outcome: { outcome: "degraded", previousLevel: 3, newLevel: 2, nextCombo: 0, nextDue: miss.outcome.nextDue } };
}
{
  // One card missed four times: it returns after the first three misses, not the fourth.
  const a = runCard("a");
  const b = runCard("b");
  let queue: RunCard[] = [a, b];
  const results: CardResult[] = [];
  const play = (c: RunCard, kind: Parameters<typeof resultOf>[0], boss = false) => {
    const result = resultOf(kind);
    results.push({ card: c, result, answer: "x" });
    queue = queueAfterAnswer(queue, results, c, result, boss);
  };
  play(a, "strike");
  check("session: a miss appends the card at the end", eq(queue.map((c) => c.id), ["a", "b", "a"]) && isReturnAt(queue, 2) && !isReturnAt(queue, 1));
  check("session: the counter: 'Card 1 of 2 · 1 to retry' while asking the first pass", progressOf(queue, 0).label === "Card 1 of 2 · 1 to retry" && progressOf(queue, 1).label === "Card 2 of 2 · 1 to retry");
  play(b, "pass");
  check("session: on a return it reads 'Retry 1 of 1'", progressOf(queue, 2).label === "Retry 1 of 1" && progressOf(queue, 2).retrying);
  play(a, "retry");
  play(a, "retry");
  play(a, "retry");
  check(`session: a card returns at most ${SESSION_RETURNS_MAX} times: the miss after its last return is 'back tomorrow'`, SESSION_RETURNS_MAX === 3 && eq(queue.map((c) => c.id), ["a", "b", "a", "a", "a"]) && queue.length === 5, JSON.stringify(queue.map((c) => c.id)));
  check("session: 'Retry 3 of 3' on the last return; nothing waits after it", progressOf(queue, 4).label === "Retry 3 of 3" && returnsWaitingOf(queue, 5) === 0 && returnsWaitingOf(queue, 2) === 3);
  check(
    "session: the recap: 1 of 2 recalled first time, 1 back tomorrow (with its lapse's line), none relearned",
    eq([tallyOf(results).firstTry, tallyOf(results).cards, tallyOf(results).relearned, tallyOf(results).notYet], [1, 2, 0, 1]) && backTomorrowOf(results)[0]?.line === "strike 1 of 2 · back tomorrow" && recapLineOf(tallyOf(results)) === "1 back tomorrow."
  );
  // A right retry relearns: no more returns; the recap counts it relearned, not missed.
  queue = [a, b];
  results.length = 0;
  play(a, "strike");
  play(b, "pass");
  play(a, "relearn");
  check("session: a right retry ends the card's returns", queue.length === 3);
  const t = tallyOf(results);
  check(
    "session: the recap counts '1 relearned', never failures; Relearned lists it with when it comes back",
    t.firstTry === 1 && t.relearned === 1 && t.notYet === 0 && recapLineOf(t) === "1 relearned." && backTomorrowOf(results).length === 0 && relearnedOf(results)[0]?.line === "relearned · level 3 held · back tomorrow"
  );
  // An encounter never re-queues; a pass never re-queues; a degrade returns at its new level.
  check("session: an encounter (boss run) asks each card once: a miss is not queued again", queueAfterAnswer([a, b], [{ card: a, result: resultOf("strike"), answer: "x" }], a, resultOf("strike"), true).length === 2);
  check("session: a right answer never re-queues; a degraded card returns at its new level", queueAfterAnswer([a], [{ card: a, result: resultOf("pass"), answer: "x" }], a, resultOf("pass"), false).length === 1 && queueAfterAnswer([a], [{ card: a, result: resultOf("degraded"), answer: "x" }], a, resultOf("degraded"), false)[1].level === 2);
  check("session: 'I was right' takes the queued copy back out (and only that copy)", eq(queueAfterOverride([a, b, a], 0, "a").map((c) => c.id), ["a", "b"]) && eq(queueAfterOverride([a, b], 0, "a").map((c) => c.id), ["a", "b"]) && eq(queueAfterOverride([a, b, b], 0, "a").map((c) => c.id), ["a", "b", "b"]));
  check("session: the counter on a run with no returns is the plain 'Card k of N'", progressOf([a, b], 1).label === "Card 2 of 2" && progressOf([a, b], 1).toRetry === 0);
  // The wording.
  check(
    "wording: a miss says the answer is below and when it comes back (the end of this session; tomorrow; an encounter's once)",
    missLineOf({ returns: true, boss: false }) === "The answer is below — it comes back at the end of this session." &&
      missLineOf({ returns: false, boss: false }) === "The answer is below — back tomorrow." &&
      missLineOf({ returns: false, boss: true }) === "The answer is below. An encounter asks each card once, so it comes back tomorrow."
  );
  const base: FactInput = { correct: false, today: "2026-10-14", history: [], addedDay: "2026-09-01", levelBefore: 5, levelAfter: 5, failedAttemptsBefore: 0, mastered: false, overdueDays: 0, intervalDays: 1 };
  const misses: MissOutcome[] = [{ kind: "strike", strike: 1, limit: 2, ease: { before: 1, after: 0.85 } }, { kind: "degraded", levelBefore: 6, levelAfter: 5 }, { kind: "shielded", skillName: "Ward", level: 5 }, { kind: "retry" }];
  const facts = misses.map((m) => trueFactOf({ ...base, miss: m }));
  check("wording: every miss is 'Not yet'; a retry says it changes nothing", facts.every((f) => f.headline === "Not yet") && facts[3].detail === "Counted once a day: this try changes nothing" && facts[0].detail === "Strike 1 of 2 · spacing 1.00× → 0.85× · nothing else is taken");
  const relearned = trueFactOf({ ...base, correct: true, relearned: true, intervalDays: 1, usualIntervalDays: 10 });
  check(
    "wording: a right retry is 'Relearned — back tomorrow' (or the computed day), its level held, sooner than usual",
    relearned.kind === "relearned" && relearned.headline === "Relearned — back tomorrow" && relearned.detail === "Level 5 held · sooner than its usual 10 days" && relearnedHeadline(4) === "Relearned — back in 4 days"
  );
  const FAIL_WORDS = /\b(fail|fails|failed|failing|failure|wrong|incorrect)\b/i;
  const generated = [
    ...facts.flatMap((f) => [f.headline, f.detail]),
    relearned.headline,
    relearned.detail,
    ...[true, false].flatMap((r) => [true, false].map((b) => missLineOf({ returns: r, boss: b }))),
    ...(["up", "confirm", "relearned", "top"] as const).map((k) => riseLine(k === "relearned" ? riseStep(9, 0, true) : k === "top" ? riseStep(MAX_LEVEL, 0, false) : k === "confirm" ? riseStep(9, 0, false) : riseStep(3, 0, false))),
    recapLineOf({ relearned: 2, notYet: 1 }) ?? "",
    ...backTomorrowOf(results).map((b) => b.line),
    ...relearnedOf(results).map((b) => b.line),
  ];
  check("wording: no generated session sentence says wrong or fail", generated.every((s) => !FAIL_WORDS.test(s)), generated.filter((s) => FAIL_WORDS.test(s)).join(" | "));
  // Every string the session's files print (literals and JSX text; class names excluded).
  const files = ["src/components/workspace/ReviewRunner.tsx", "src/components/workspace/ResultPanel.tsx", "src/components/workspace/SessionComplete.tsx", "src/components/workspace/review-model.ts", "src/lib/review-facts.ts"];
  const offenders: string[] = [];
  for (const f of files) {
    const src = code(read(f)).replace(/className=("[^"]*"|\{[^}]*\})/g, "");
    // String literals, template literals, and JSX text (anything between a tag or an expression and the next).
    const texts = [...src.matchAll(/"([^"\n]*)"|`([^`]*)`|[>}]([^<>{}]+)[<{]/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
    for (const t of texts) if (FAIL_WORDS.test(t)) offenders.push(`${f}: ${t.trim()}`);
  }
  check("wording: no string in the runner, the panel, the recap, the session model or the facts says wrong or fail", offenders.length === 0, offenders.join(" | "));
  check("wording: 'Not this time' is gone from the session", files.every((f) => !/Not this time/.test(code(read(f)))));
}

// ── 8. Wiring ───────────────────────────────────────────────────────────────
{
  const srs = code(read("src/lib/srs.ts"));
  const apply = srs.slice(srs.indexOf("export async function applyReviewResult"), srs.indexOf("export const OVERRIDE_WINDOW_MS"));
  const retryBlock = apply.slice(apply.indexOf('if (kind === "retry") {'), apply.indexOf('missReceipt = { v: "review-miss/1"'));
  check(
    "srs: a miss is classified by missKindOf; a retry writes nothing to the card (its row still lands, 'retry · L5', no receipt)",
    /const kind = missKindOf\(idea, now, strikeLimit\);/.test(apply) &&
      retryBlock.length > 0 &&
      !/prisma\.idea\.update/.test(retryBlock) &&
      /lateOutcome = `retry · L\$\{idea\.level\}`;/.test(retryBlock) &&
      /return \{ outcome: "retry", level: idea\.level, nextCombo, nextDue: idea\.dueDate\.toISOString\(\) \};/.test(retryBlock)
  );
  check(
    "srs: the lapse keeps the state before it in the row's receipt, then writes strikeDataOf (a degrade or a ward write degradeDataOf / wardDataOf)",
    /missReceipt = \{ v: "review-miss\/1", before: missStateOf\(idea\) \};\s*if \(kind === "lapse"\) \{/.test(apply) && /const data = strikeDataOf\(idea, now\);\s*await prisma\.idea\.update\(\{ where: \{ id: ideaId \}, data \}\);/.test(apply)
  );
  check("srs: the right answer writes passPlanOf (the rise, the ease, the interval, a new cycle)", /const plan = passPlanOf\(idea, now, modifiers\.intervalMultiplier, modifiers\.graceExtraDays\);/.test(apply) && /data: plan\.data/.test(apply) && /ease: \{ before: clampEase\(idea\.ease\), after: ease \},/.test(apply));
  check("srs: the undo reads the receipt; the nightly job reads the ease and clears the missed cycle", /undoStateOf\(outcome, idea\.failedAttempts, row\.qty, row\.receipt\)/.test(srs) && /levelsForgotten\(anchor, daysOverdueOf\(idea\.dueDate, now\), graceExtra, idea\.ease\)/.test(srs) && /cycleMissed: false \}/.test(srs.slice(srs.indexOf("export async function degradeOverdueIdeas"))));
  const action = code(read("src/app/actions/review.ts"));
  check("action: the miss and the relearn reach the true fact (missOf, relearnOf) in submit and override", (action.match(/miss: missOf\(outcome\)/g) ?? []).length === 1 && (action.match(/\.\.\.relearnOf\(outcome, progression\.modifiers\.intervalMultiplier\)/g) ?? []).length === 2);
  const view = code(read("src/components/workspace/WorkspaceView.tsx"));
  check("view: an answer queues a miss again (never in an encounter); 'I was right' takes the copy back", /const queue = queueAfterAnswer\(cur\.queue, results, card, result, cur\.boss != null\);/.test(view) && /queue: queueAfterOverride\(cur\.queue, cur\.index, card\.id\)/.test(view));
  const runner = code(read("src/components/workspace/ReviewRunner.tsx"));
  check("runner: the counter is progressOf; a miss's line is missLineOf (returns read from the queue)", /const progress = progressOf\(queue, index\);/.test(runner) && /missLineOf\(\{ returns, boss: boss != null \}\)/.test(runner) && /missLine=\{missLine\}/.test(runner) && !/Card \{cardNo\} of/.test(runner));
  const panel = code(read("src/components/workspace/ResultPanel.tsx"));
  check("panel: a miss shows when it comes back, then what the lapse changed", /data-miss-line=""/.test(panel) && /data-miss-fact=""/.test(panel));
  const recap = code(read("src/components/workspace/SessionComplete.tsx"));
  check("recap: the headline counts first-try recalls; the relearned line and section", /`\$\{tally\.firstTry\} of \$\{tally\.cards\} recalled`/.test(recap) && /recapLineOf\(tally\)/.test(recap) && /relearnedOf\(results\)/.test(recap) && /<SectionHeader title="Relearned" \/>/.test(recap));
  check(
    "loaders: the Library, the idea page, the bell and the levels read the ease (and the missed cycle where the outlook says 'held')",
    /ease: idea\.ease, cycleMissed: idea\.cycleMissed/.test(read("src/lib/field-insight.ts")) &&
      /ease: row\.ease, cycleMissed: row\.cycleMissed/.test(read("src/app/library/[id]/page.tsx")) &&
      /ease: true, cycleMissed: true/.test(read("src/lib/notifications.ts")) &&
      /select: \{ level: true, dueDate: true, ease: true \}/.test(read("src/lib/leveling.ts"))
  );
  const lib = code(read("src/components/library/library-model.ts"));
  check("library: the outlook ends with the spacing line", /out\.push\(spacingLine\(o\.ease\)\);/.test(lib) && spacingLine(1.3) === "Spacing 1.3× — you recall this one well" && spacingLine(0.7) === "Spacing 0.7× — this one is tricky");
  const nine = { isArchived: false, level: 9, dueAt: T0.getTime() + 5 * DAY, outlook: { level: 9, mastered: false, nextLevel: 10, cleanNeeded: 2 as const, cleanDone: 0, heldByMiss: false, ease: 1.32, dueInDays: 5, status: "fresh" as const, fadingFrom: at(T0, 13).toISOString(), nextLossAt: at(T0, 60).toISOString(), retention: 1 } };
  check("library: an eased idea's outlook prints 'Spacing 1.3×'", outlookLines(nine, T0.getTime()).includes("Spacing 1.3× — you recall this one well"));
  check("fixtures: /dev/style/review reaches the retry and the relearn (?state=retry, ?state=relearned)", /"retry", "relearned"/.test(read("src/app/dev/style/review/states.ts")) && /"retry", "relearned"/.test(read("scripts/ui-audit.mjs")) && fx.queue.length === fx.cards.length + 1 && fx.results[6].result.outcome.outcome === "advanced" && fx.results[6].result.trueFact.kind === "relearned");
}

// ── 9. Pacing: the eased walk to mastery ────────────────────────────────────
{
  const walk = (eased: boolean) => {
    let level = 1;
    let streak = 0;
    let ease = EASE_DEFAULT;
    let days = 0;
    while (level < MASTERY_LEVEL) {
      const r = cleanRecallOnTime(level, streak, ease);
      days += eased ? r.intervalDays : riseBaseIntervalDays(r.step);
      level = r.step.levelAfter;
      streak = r.step.cleanStreak;
      ease = eased ? r.ease : EASE_DEFAULT;
    }
    return { days, ease };
  };
  const base = walk(false);
  const eased = walk(true);
  check("pacing: a perfectly kept idea reaches mastery within 30% of the baseline ladder (its ease grows by 1.02 a recall)", eased.days > base.days && eased.days <= base.days * 1.3, `${eased.days} days (ease ${eased.ease.toFixed(3)}) vs ${base.days} on the ladder`);
  console.log(`  (a clean walk to mastery: ${eased.days} days at a growing ease, ending at ${eased.ease.toFixed(2)}×; ${base.days} on the baseline ladder)`);
}

console.log(`\nspacing-check: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
