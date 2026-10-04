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
 *
 * M2 (lane B, F8): streak.ts dailyStreakOf, the pure fold streak.ts and
 * snapshot.ts share — rest, sick, vacation, freeze and repair days bridge;
 * a late or future rest row does not; the freeze balance counts all history;
 * an unsettled empty day is pending (no break before settlement);
 * freezeWillCover; the judged break (endedOn, endedAfter); settledFor's floor
 * (a pre-Duty day never waits; the launch script's early cursor); the make-up and
 * undo day. streak.ts is imported for its pure half only (no query runs).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addDays, dayStartOf, type DayKey } from "../src/lib/life-day";
import type { ActivitySource } from "../src/lib/life-types";
import type { RestRow } from "../src/lib/duty-rule";
import { dailyStreakOf, type StreakDayRow, type StreakFacts } from "../src/lib/streak";
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

// ── M2: held days, freezes and the judged break (F8) ──────────────────────
{
  const LAUNCH = ago(40); // the Duty launch day, inside the window
  const HOUR = 3_600_000;
  const facts = (o: Partial<StreakFacts> = {}): StreakFacts => ({
    today: TODAY,
    windowDays: STREAK_WINDOW_DAYS,
    rows: [],
    freezeEarned: 0,
    freezeUsed: 0,
    restRows: [],
    settledThroughDay: ago(2),
    dutyLaunchDay: LAUNCH,
    ...o,
  });
  const act = (...ns: number[]): StreakDayRow[] => ns.map((n) => ({ day: ago(n), units: 1, held: 0 }));
  /** A FREEZE_USE or REPAIR row's day (HELD_SOURCES). */
  const heldRow = (n: number): StreakDayRow => ({ day: ago(n), units: 0, held: 1 });
  /** A RestDay row declared `before` hours before its day starts (negative: after it started). */
  const rest = (n: number, kind = "REST", before = 1, cancelled = false): RestRow => ({
    day: ago(n),
    kind,
    declaredAt: new Date(dayStartOf(ago(n)).getTime() - before * HOUR),
    cancelledAt: cancelled ? new Date(dayStartOf(ago(n)).getTime() - 2 * HOUR) : null,
  });

  // Every kind of held day bridges without counting.
  const all = dailyStreakOf(
    facts({
      settledThroughDay: ago(2),
      rows: [...act(0, 1, 3, 5, 7, 10), heldRow(8), heldRow(9)],
      restRows: [rest(2, "REST"), rest(4, "SICK", -6), rest(6, "VACATION")],
    })
  );
  check(
    "M2: rest, sick (declared during its day), vacation, freeze and repair days bridge without counting",
    all.current === 6 && all.heldInRun === 5 && all.held7Days[4] && all.held7Days[2] && all.held7Days[0] && all.endedOn === null,
    `current ${all.current}, heldInRun ${all.heldInRun}, held7Days ${JSON.stringify(all.held7Days)}`
  );
  const late = dailyStreakOf(facts({ settledThroughDay: ago(2), rows: act(0, 1, 3, 4), restRows: [rest(2, "REST", -1)] }));
  check("M2: a rest row declared after its day started does not bridge", late.current === 2 && late.endedOn === null, `current ${late.current}`);
  const sickAfter = dailyStreakOf(facts({ settledThroughDay: ago(2), rows: act(0, 1, 3, 4), restRows: [rest(2, "SICK", -25)] }));
  check("M2: a SICK row declared after its day ended does not bridge", sickAfter.current === 2, `current ${sickAfter.current}`);
  const cancelled = dailyStreakOf(facts({ settledThroughDay: ago(2), rows: act(0, 1, 3, 4), restRows: [rest(2, "REST", 1, true)] }));
  check("M2: a cancelled rest row does not bridge", cancelled.current === 2, `current ${cancelled.current}`);
  const base = facts({ settledThroughDay: ago(2), rows: act(0, 1, 3, 4) });
  const future = dailyStreakOf({ ...base, restRows: [rest(-1), rest(-3, "VACATION")] });
  check("M2: future rest days bridge nothing", JSON.stringify(future) === JSON.stringify(dailyStreakOf(base)) && future.current === 2);
  const beforeLaunch = dailyStreakOf(facts({ dutyLaunchDay: ago(1), settledThroughDay: ago(2), rows: act(0, 1, 3, 4), restRows: [rest(2)] }));
  check("M2: a rest row dated before the Duty launch day holds nothing", beforeLaunch.current === 2, `current ${beforeLaunch.current}`);
  const m1 = dailyStreakOf(facts({ dutyLaunchDay: null, settledThroughDay: null, rows: [...act(0, 2, 3), heldRow(4), ...act(5)], restRows: [rest(1)] }));
  const m1Want = computeStreak(days(0, 2, 3, 5), days(4), TODAY);
  check(
    "M2: with no Duty launch day it is M1's streak exactly (rest rows ignored, no pending day)",
    m1.current === m1Want.current && JSON.stringify(m1.last7Days) === JSON.stringify(m1Want.last7Days) && JSON.stringify(m1.held7Days) === JSON.stringify(m1Want.held7Days) && m1.bankedFreezes === 0 && !m1.freezeWillCover,
    `${m1.current} vs ${m1Want.current}`
  );

  // The freeze balance: all history, at most 2.
  check(
    "M2: bankedFreezes = min(2, earned − used) over all history",
    dailyStreakOf(facts({ freezeEarned: 5, freezeUsed: 2 })).bankedFreezes === 2 &&
      dailyStreakOf(facts({ freezeEarned: 3, freezeUsed: 2 })).bankedFreezes === 1 &&
      dailyStreakOf(facts({ freezeEarned: 1, freezeUsed: 1 })).bankedFreezes === 0 &&
      dailyStreakOf(facts({ freezeEarned: 0, freezeUsed: 1 })).bankedFreezes === 0
  );
  const src = readFileSync(join(__dirname, "..", "src/lib/streak.ts"), "utf8").replace(/\r\n/g, "\n");
  check(
    "M2: the freeze counts ride the same raw query (UNION ALL), with no day filter",
    /UNION ALL\s*SELECT NULL::date AS "day"[\s\S]*?FROM "ActivityEvent"\s*WHERE "userId" = \$\{userId\} AND "source" IN \('FREEZE_EARN', 'FREEZE_USE'\)\s*`/.test(src)
  );
  const snap = readFileSync(join(__dirname, "..", "src/lib/snapshot.ts"), "utf8");
  check(
    "M2: snapshot.ts readStreak shares the helper (no second copy of the SQL)",
    /dailyStreakOf\(await readStreakFacts\(userId, now, STREAK_READ_DAYS\)\)/.test(snap) && !/"countsForStreak" THEN 1/.test(snap)
  );

  // Pending: an unsettled empty day is no break; freezeWillCover.
  const live = (o: Partial<StreakFacts> = {}) => dailyStreakOf(facts({ settledThroughDay: ago(2), rows: act(2, 3, 4), ...o }));
  const pending = live();
  check(
    "M2: an unsettled empty yesterday neither counts nor breaks (no break before settlement)",
    pending.current === 3 && pending.endedOn === null && pending.last7Days[5] === false && pending.held7Days[5] === false,
    `current ${pending.current}`
  );
  check("M2: freezeWillCover with a freeze banked for that unsettled empty yesterday", live({ freezeEarned: 1 }).freezeWillCover === true);
  check("M2: not without a freeze", live().freezeWillCover === false);
  check("M2: not for an active yesterday", live({ freezeEarned: 1, rows: act(1, 2, 3) }).freezeWillCover === false);
  check("M2: not for a settled yesterday (after 'Settle yesterday')", live({ freezeEarned: 1, settledThroughDay: ago(1) }).freezeWillCover === false);
  check("M2: not for a rest day", live({ freezeEarned: 1, restRows: [rest(1)] }).freezeWillCover === false && live({ restRows: [rest(1)] }).current === 3);
  check("M2: not with no run to carry", live({ freezeEarned: 1, rows: act(4, 5), settledThroughDay: ago(2) }).freezeWillCover === false);
  check("M2: not before Duty launches", dailyStreakOf(facts({ dutyLaunchDay: null, settledThroughDay: null, freezeEarned: 1, rows: act(2, 3, 4) })).freezeWillCover === false);

  // The one settled-day rule (duty-economy settledFor, floor firstDutyDay(epochDay)): only a day settlement
  // will judge waits on it. The launch script may set the cursor (launch − 1) days before the launch.
  const preLaunch = dailyStreakOf(facts({ dutyLaunchDay: ago(-2), settledThroughDay: ago(-1), freezeEarned: 1, rows: act(2, 3, 4) }));
  const preWant = computeStreak(days(2, 3, 4), none, TODAY, { bankedFreezes: 1 });
  check(
    "M2: before the Duty launch, a cursor the launch script set early changes nothing (M1: an empty yesterday breaks; no pending day, no freeze cover)",
    preLaunch.current === preWant.current && preLaunch.current === 0 && JSON.stringify(preLaunch.held7Days) === JSON.stringify(preWant.held7Days) && !preLaunch.freezeWillCover,
    `current ${preLaunch.current}`
  );
  // A cursor behind the first Duty day (a launch day moved later than the launch script's cursor): the days
  // between are pre-Duty days settlement never judges, so they break as in M1 instead of waiting for ever.
  const behindFloor = dailyStreakOf(facts({ dutyLaunchDay: ago(3), settledThroughDay: ago(6), rows: act(0, 5, 6, 7) }));
  check(
    "M2: a day before the first Duty day never waits on settlement (settledFor's floor): it breaks as in M1",
    behindFloor.current === 1,
    `current ${behindFloor.current}`
  );
  const afterFloor = dailyStreakOf(facts({ dutyLaunchDay: ago(3), settledThroughDay: ago(6), rows: act(0, 4, 5, 6, 7) }));
  check("  (from the first Duty day on, unsettled empty days still wait: current 5)", afterFloor.current === 5, `current ${afterFloor.current}`);
  const epochFloor = dailyStreakOf(facts({ dutyLaunchDay: ago(40), epochDay: ago(3), settledThroughDay: ago(6), rows: act(0, 5, 6, 7) }));
  check("M2: the floor is firstDutyDay(epochDay): after a reset, a day before the new epoch never waits either", epochFloor.current === 1, `current ${epochFloor.current}`);
  const epochNormal = dailyStreakOf(facts({ dutyLaunchDay: ago(40), epochDay: ago(3), settledThroughDay: ago(4), rows: act(0) }));
  check("M2: a reset's cursor (epoch − 1): the new epoch's unsettled empty days wait (current 1, nothing ended)", epochNormal.current === 1 && epochNormal.endedOn === null, JSON.stringify({ c: epochNormal.current, e: epochNormal.endedOn }));
  const src2 = readFileSync(join(__dirname, "..", "src/lib/streak.ts"), "utf8").replace(/\r\n/g, "\n");
  check(
    "M2: readStreakFacts reads the epoch beside the cursor (one LifeSettings read) and pending days go through settledFor",
    /select: \{ settledThroughDay: true, epochDay: true \}/.test(src2) && /if \(settledFor\(d, cursor, floor\)\) continue;/.test(src2) && /firstDutyDay\(f\.epochDay \?\? launch!, launch\)/.test(src2)
  );

  // The judged break: 'Ended <day> at 23 days', never a red 0.
  const judged = live({ settledThroughDay: ago(1) });
  check("M2: once settled with nothing and no freeze, the run ends: current 0, endedOn yesterday, endedAfter 3", judged.current === 0 && judged.endedOn === ago(1) && judged.endedAfter === 3, JSON.stringify({ c: judged.current, e: judged.endedOn, a: judged.endedAfter }));
  const frozen = live({ settledThroughDay: ago(1), rows: [...act(2, 3, 4), heldRow(1)], freezeEarned: 1, freezeUsed: 1 });
  check("M2: settled with a freeze spent, the run holds (current 3, yesterday held, nothing ended)", frozen.current === 3 && frozen.held7Days[5] && frozen.endedOn === null && frozen.bankedFreezes === 0);
  const never = dailyStreakOf(facts({ settledThroughDay: ago(1), rows: [] }));
  check("M2: no run ever read: nothing ended (endedOn null)", never.current === 0 && never.endedOn === null && never.endedAfter === 0);
  const bridgedEnd = dailyStreakOf(facts({ settledThroughDay: ago(1), rows: act(3, 4, 6), restRows: [rest(5)] }));
  check(
    "M2: two empty settled days after a run: endedOn is the first of them, endedAfter its active days across a rest day (3)",
    bridgedEnd.current === 0 && bridgedEnd.endedOn === ago(2) && bridgedEnd.endedAfter === 3,
    JSON.stringify({ e: bridgedEnd.endedOn, a: bridgedEnd.endedAfter })
  );

  // F6: a make-up, its undo and one other tick on the same day; and a make-up then its undo alone.
  const makeUpDay = [row(1, "TASK"), row(1, "DEBT_REPAID"), row(1, "UNDO"), row(1, "DEBT_REPAID"), row(1, "TASK"), row(0, "REVIEW")];
  const mu = streakOf(makeUpDay);
  const muUnits = makeUpDay.filter((r) => r.day === ago(1)).reduce((n, r) => n + streakUnitsOf(r), 0);
  check("F6: a make-up, its undo ('undo:' plus the negative DEBT_REPAID) and one other tick: the day stays active", mu.current === 2 && mu.last7Days[5] && muUnits === 1, `units ${muUnits}`);
  const undoneAlone = [row(1, "TASK"), row(1, "DEBT_REPAID"), row(1, "UNDO"), row(1, "DEBT_REPAID")];
  const ua = undoneAlone.reduce((n, r) => n + streakUnitsOf(r), 0);
  check("F6: a make-up then its undo nets 0 streak units on the make-up day (repayment rows never count)", ua === 0 && countsForStreakOf("DEBT_REPAID", true) === false && !streakOf(undoneAlone).last7Days[5]);
}

console.log(failed ? `\n${failed} failed` : "\nall pass");
process.exit(failed ? 1 : 0);
