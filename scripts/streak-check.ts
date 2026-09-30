/**
 * The daily streak's pure half (src/lib/streak-curve.ts): which ledger rows
 * count, how a day's rows fold into active or held, and how consecutive days
 * are counted back from today.
 *
 * No database. The rows here are what streak.ts's one query would read; its
 * SQL CASE is the same rule as `streakUnitsOf`, so folding the rows here and
 * grouping them there give the same days.
 *
 *   npx tsx scripts/streak-check.ts
 */
import { addDays, type DayKey } from "../src/lib/life-day";
import type { ActivitySource } from "../src/lib/life-types";
import {
  computeStreak,
  countsForStreakOf,
  foldStreakDays,
  streakBonusPercent,
  streakUnitsOf,
  streakWindowStart,
  STREAK_BONUS_CAP_PERCENT,
  STREAK_WINDOW_DAYS,
} from "../src/lib/streak-curve";

const TODAY: DayKey = "2026-10-14";
const ago = (n: number) => addDays(TODAY, -n);

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** A ledger row as a writer would store it: countsForStreak through the same rule activity.ts applies. */
function row(daysAgo: number, source: ActivitySource, requested?: boolean) {
  return { day: ago(daysAgo), source, countsForStreak: countsForStreakOf(source, requested) };
}
function streakOf(rows: ReturnType<typeof row>[], opts?: { windowDays?: number }) {
  const { active, held } = foldStreakDays(rows);
  return computeStreak(active, held, TODAY, opts);
}
const days = (...ns: number[]) => new Set(ns.map(ago));
const none = new Set<DayKey>();

// ── Counting back ─────────────────────────────────────────────────────────
{
  const s = computeStreak(days(0, 1, 3, 4, 5), none, TODAY);
  check("a gap ends the streak", s.current === 2, `current ${s.current}`);
}
{
  const s = computeStreak(days(1, 2, 3), none, TODAY);
  check("today not yet active: the streak is still alive", s.current === 3 && s.last7Days[6] === false, `current ${s.current}`);
  const dead = computeStreak(days(2, 3), none, TODAY);
  check("but a whole missed day (yesterday) breaks it", dead.current === 0, `current ${dead.current}`);
  const fresh = computeStreak(none, none, TODAY);
  check("no activity at all is 0, not capped", fresh.current === 0 && fresh.capped === false);
}
{
  const s = computeStreak(days(0, 2, 3), days(1), TODAY);
  check(
    "a held day bridges without counting",
    s.current === 3 && s.held7Days[5] === true && s.last7Days[5] === false,
    `current ${s.current}, held7Days ${JSON.stringify(s.held7Days)}`
  );
}
{
  const s = computeStreak(days(0, 1), none, TODAY);
  check(
    "last7Days is oldest first, today last",
    s.last7Days.length === 7 && s.last7Days[6] && s.last7Days[5] && !s.last7Days[4] && s.held7Days.every((h) => !h)
  );
  check("bankedFreezes is 0 until freezes exist", s.bankedFreezes === 0);
}

// ── Which rows count ──────────────────────────────────────────────────────
{
  const s = streakOf([row(1, "LEGACY_DAY"), row(0, "REVIEW")]);
  check("a LEGACY day (carried over at the cut-over) counts", s.current === 2, `current ${s.current}`);
}
{
  const rows = [row(1, "TASK"), row(1, "UNDO"), row(0, "REVIEW")];
  const s = streakOf(rows);
  const units = rows.filter((r) => r.day === ago(1)).reduce((n, r) => n + streakUnitsOf(r), 0);
  check("a TASK then an UNDO on the same day nets to inactive", s.current === 1 && !s.last7Days[5] && units === 0, `current ${s.current}, units ${units}`);
  const redone = streakOf([row(1, "TASK"), row(1, "UNDO"), row(1, "TASK"), row(0, "REVIEW")]);
  check("re-completing after the undo makes the day active again", redone.current === 2);
  const withReview = streakOf([row(1, "TASK"), row(1, "UNDO"), row(1, "REVIEW")]);
  check("an undone task does not cancel the day's review", withReview.current === 1 && withReview.last7Days[5]);
}
{
  const s = streakOf([row(1, "STEPS", true), row(2, "STEPS"), row(0, "REVIEW")]);
  check("STEPS-only days never count, even when the writer asks", s.current === 1 && countsForStreakOf("STEPS", true) === false, `current ${s.current}`);
  const passive = streakOf([row(1, "DAY_OPEN", true), row(1, "DEBT", true), row(1, "ADJUST", true), row(1, "FREEZE_EARN", true), row(1, "REFLECTION", true), row(0, "TASK")]);
  check("opening the app, debts, adjustments, freeze earnings and reflections never count", passive.current === 1, `current ${passive.current}`);
  check("an UNDO can never also count", countsForStreakOf("UNDO", true) === false && streakUnitsOf({ source: "UNDO", countsForStreak: false }) === -1);
}
{
  const counted: ActivitySource[] = ["REVIEW", "IDEA_CREATE", "ATTESTATION", "BOSS", "TASK", "GOAL_PROGRESS", "LEGACY_DAY"];
  const wrong = counted.filter((s) => !countsForStreakOf(s));
  check("every kind of real work counts by default", wrong.length === 0, wrong.join(", "));
  check("a workout counts only when its writer says so (≥ 10 min, M4)", !countsForStreakOf("WORKOUT") && countsForStreakOf("WORKOUT", true));
  check("a task written as not counting is honoured", !countsForStreakOf("TASK", false));
}
{
  const s = streakOf([row(1, "FREEZE_USE"), row(2, "REVIEW"), row(0, "TASK")]);
  check("a spent freeze holds its day", s.current === 2 && s.held7Days[5] === true, `current ${s.current}`);
}

// ── The window edge ───────────────────────────────────────────────────────
{
  check(`the window is ${STREAK_WINDOW_DAYS} days, today included`, streakWindowStart(TODAY) === ago(STREAK_WINDOW_DAYS - 1), streakWindowStart(TODAY));
  const long = new Set(Array.from({ length: 100 }, (_, i) => ago(i)));
  const s = computeStreak(long, none, TODAY);
  check("a streak past the window reads as a floor (70+)", s.current === STREAK_WINDOW_DAYS && s.capped === true, `current ${s.current}, capped ${s.capped}`);
  const exact = new Set(Array.from({ length: 69 }, (_, i) => ago(i)));
  const e = computeStreak(exact, none, TODAY);
  check("a streak that ends inside the window is exact", e.current === 69 && e.capped === false, `current ${e.current}, capped ${e.capped}`);
  const beyond = computeStreak(new Set([ago(70), ago(71)]), none, TODAY);
  check("days older than the window are never read", beyond.current === 0);
  const idle = new Set(Array.from({ length: 80 }, (_, i) => ago(i + 1)));
  const t = computeStreak(idle, none, TODAY);
  check("an idle morning at the edge still counts 69 back and is a floor", t.current === 69 && t.capped === true, `current ${t.current}`);
}

// ── The bonus curve ───────────────────────────────────────────────────────
{
  const at = (d: number) => Math.round(streakBonusPercent(d) * 1000) / 1000;
  check("streakBonusPercent: 0 → 0, 16 → 10, 64 → cap", at(0) === 0 && at(16) === 10 && at(64) === STREAK_BONUS_CAP_PERCENT, `${at(0)} ${at(16)} ${at(64)}`);
  check("capped at 20%, and never negative", at(400) === 20 && at(-5) === 0);
}

console.log(failed ? `\n${failed} failed` : "\nall pass");
process.exit(failed ? 1 : 0);
