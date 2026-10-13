/**
 * Idea leveling (2026-10-13): levels are earned properly and their drops are told.
 *
 *   1. Rise rules (xp.ts riseStep): below L8 one clean recall (no miss since the card fell due) raises a level; a
 *      right answer after a miss is paid and holds it. From L8 up two clean recalls in a row: the first holds the
 *      level and comes back at half its interval, the second raises it. A miss resets the run.
 *   2. "I was right" (srs.ts undoMissCore) restores the clean state a miss took (cleanStateBefore).
 *   3. Retention (forgetting.ts retentionFactor): 1 until grace ends, then falls with the forgetting curve.
 *   4. The outlook (forgetting.ts ideaOutlook): fresh, due, fading, forgetting at each boundary.
 *   5. Retention-weighted levels: the depth counts each Idea by its retention and the points are read at the
 *      Domain's retained share, so a neglected Domain falls (a depth-bound one before any Idea loses a level, a
 *      mature points-bound one within about two months); a diligent one is unchanged.
 *   6. Drops are recorded (droppedFrom, droppedAt) and never on a rise; the daily recompute is idempotent.
 *   7. The bell's leveling notices (notifications.ts levelNoticesOf).
 *
 * Pure (fixtures and source pins; no database): `npx tsx scripts/leveling-check.ts`.
 */
import "./_no-model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CLEAN_PAIR_FROM,
  CONFIRM_INTERVAL_SHARE,
  DEPTH_GRACE,
  MASTERY_BONUS,
  MASTERY_LEVEL,
  MAX_LEVEL,
  XP_BASE,
  baseIntervalDays,
  cleanRecallsNeeded,
  cleanRecallsTo,
  confirmIntervalDays,
  domainLevel,
  domainPointsLevel,
  graceDays,
  masteryDepth,
  retainedPoints,
  retainedShare,
  reviewReward,
  riseBaseIntervalDays,
  riseIntervalDays,
  riseLine,
  riseStep,
  type RiseStep,
} from "../src/lib/xp";
import {
  FADE_BANDS,
  FORGET_BAND,
  daysToForget,
  depthEntryOf,
  domainLevelNow,
  dropMarkOf,
  forgettingAnchor,
  ideaOutlook,
  levelsForgotten,
  levelsLossPoints,
  planFieldLevels,
  retentionFactor,
  type LevelingField,
} from "../src/lib/forgetting";
import { cleanStateBefore } from "../src/lib/srs";
import { levelNoticesOf, type LevelDrop } from "../src/lib/notifications";

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
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const DAY = 86_400_000;
const at = (base: Date, days: number) => new Date(base.getTime() + days * DAY);

// ── 1. Rise rules ───────────────────────────────────────────────────────────
{
  check("rise: two clean recalls from L8 up, one below; the confirm comes back at half the interval", CLEAN_PAIR_FROM === 8 && CONFIRM_INTERVAL_SHARE === 0.5 && cleanRecallsNeeded(7) === 1 && cleanRecallsNeeded(8) === 2 && cleanRecallsNeeded(15) === 2);

  const below = Array.from({ length: CLEAN_PAIR_FROM - 1 }, (_, i) => i + 1);
  check(
    "rise L<8: a clean recall raises the level, the streak stays 0, the next interval is the new level's",
    below.every((L) => {
      const s = riseStep(L, 0, 0);
      return s.kind === "up" && s.clean && s.levelAfter === L + 1 && s.cleanStreak === 0 && riseBaseIntervalDays(s) === baseIntervalDays(L + 1);
    })
  );
  check(
    "rise L<8: right after a miss (failedAttempts > 0) holds the level, the streak 0, back at the held level's interval",
    below.every((L) => {
      const s = riseStep(L, 0, 1);
      return s.kind === "held" && !s.clean && s.levelAfter === L && s.cleanStreak === 0 && riseBaseIntervalDays(s) === baseIntervalDays(L);
    })
  );

  const above = Array.from({ length: MAX_LEVEL - CLEAN_PAIR_FROM }, (_, i) => i + CLEAN_PAIR_FROM);
  check(
    "rise L≥8: the first clean recall holds the level (streak 1) and comes back at 0.5 × the level's interval",
    above.every((L) => {
      const s = riseStep(L, 0, 0);
      return s.kind === "confirm" && s.levelAfter === L && s.cleanStreak === 1 && riseBaseIntervalDays(s) === Math.round(0.5 * baseIntervalDays(L)) && confirmIntervalDays(L) === Math.round(0.5 * baseIntervalDays(L));
    })
  );
  check(
    "rise L≥8: the second clean recall in a row raises it (streak back to 0, the new level's interval)",
    above.every((L) => {
      const s = riseStep(L, 1, 0);
      return s.kind === "up" && s.levelAfter === L + 1 && s.cleanStreak === 0 && riseBaseIntervalDays(s) === baseIntervalDays(L + 1);
    })
  );
  check(
    "rise L≥8: a recall after a miss is not clean: held, and it resets a streak in hand",
    above.every((L) => {
      const s = riseStep(L, 1, 1);
      return s.kind === "held" && s.levelAfter === L && s.cleanStreak === 0 && riseBaseIntervalDays(s) === baseIntervalDays(L);
    })
  );
  const top = riseStep(MAX_LEVEL, 1, 0);
  check("rise: the top level holds (nothing above it), back at its interval", top.kind === "top" && top.levelAfter === MAX_LEVEL && top.cleanStreak === 0 && riseBaseIntervalDays(top) === baseIntervalDays(MAX_LEVEL));
  check(
    "rise: the confirm interval follows INTERVAL_DILATION; the jittered 5–8 ladder stays inside ±25%",
    confirmIntervalDays(10, 1.5) === Math.round(0.5 * 75 * 1.5) &&
      Array.from({ length: 200 }, () => riseIntervalDays(riseStep(6, 0, 0))).every((d) => d >= Math.round(baseIntervalDays(7) * 0.75) && d <= Math.round(baseIntervalDays(7) * 1.25))
  );

  // A walk to mastery: only clean recalls, from L1. 7 recalls to L8, then 2 a level: 15 in all.
  let level = 1;
  let streak = 0;
  let recalls = 0;
  let days = 0;
  while (level < MASTERY_LEVEL) {
    const s: RiseStep = riseStep(level, streak, 0);
    days += riseBaseIntervalDays(s);
    level = s.levelAfter;
    streak = s.cleanStreak;
    recalls++;
  }
  const oldDays = Array.from({ length: MASTERY_LEVEL - 1 }, (_, i) => baseIntervalDays(i + 1)).reduce((a, b) => a + b, 0);
  check("rise: mastery takes 15 clean recalls (cleanRecallsTo agrees)", recalls === 15 && cleanRecallsTo(1, 0, MASTERY_LEVEL) === 15 && cleanRecallsTo(11, 1, MASTERY_LEVEL) === 1 && cleanRecallsTo(11, 0, MASTERY_LEVEL) === 2 && cleanRecallsTo(12, 0, MASTERY_LEVEL) === 0, `${recalls}`);
  console.log(`  (a clean walk to mastery: ${recalls} recalls over ${days} days of intervals; one recall a level was ${MASTERY_LEVEL - 1} over ${oldDays})`);

  check(
    "rise: the result panel's lines say why",
    riseLine(riseStep(8, 1, 0)) === "Level up: L9" &&
      riseLine(riseStep(8, 0, 0)) === "1 of 2 clean recalls for L9" &&
      riseLine(riseStep(5, 0, 2)) === "Level held: a miss this round — a clean recall next time raises it" &&
      riseLine(riseStep(9, 1, 1)) === "Level held: a miss this round — 2 clean recalls in a row raise it" &&
      riseLine(riseStep(4, 0, 0)) === "Level up: L5",
    riseLine(riseStep(8, 0, 0))
  );

  // Wiring: srs.ts applies exactly this rule, pays every right answer, and every miss path resets the run.
  const srs = read("src/lib/srs.ts");
  const apply = srs.slice(srs.indexOf("export async function applyReviewResult"), srs.indexOf("export const OVERRIDE_WINDOW_MS"));
  check(
    "wiring: a right answer reads riseStep(level, cleanStreak, failedAttempts), writes its streak, schedules riseIntervalDays",
    /const step = riseStep\(idea\.level, idea\.cleanStreak, idea\.failedAttempts\);/.test(apply) &&
      /const newLevel = step\.levelAfter;/.test(apply) &&
      /const intervalDays = riseIntervalDays\(step, modifiers\.intervalMultiplier\);/.test(apply) &&
      /cleanStreak: step\.cleanStreak,/.test(apply)
  );
  check(
    "wiring: every right answer is paid at the level it was given (a held level still earns its review); mastery pays on reaching 12",
    /const payout = reviewPayout\(\s*idea\.level,/.test(apply) && /const mastered = newLevel === MASTERY_LEVEL && idea\.level < MASTERY_LEVEL;/.test(apply) && /rise: \{[\s\S]*?line: riseLine\(step\),/.test(apply)
  );
  const degrade = srs.slice(srs.indexOf("async function degradeIdea"), srs.indexOf("function domainDebitOp"));
  const ward = srs.slice(srs.indexOf("async function attemptDegradation"), srs.indexOf("export interface ReviewPreload"));
  const job = srs.slice(srs.indexOf("export async function degradeOverdueIdeas"));
  check(
    "wiring: a miss resets the run: a degrade, a ward and the nightly forgetting write cleanStreak 0; a strike's failedAttempts makes the next answer unclean",
    /cleanStreak: 0,/.test(degrade) && /data: \{ failedAttempts: 0, cleanStreak: 0, dueDate \}/.test(ward) && /data: \{ level: newLevel, cleanStreak: 0 \}/.test(job) && riseStep(9, 1, 1).cleanStreak === 0
  );
}

// ── 2. "I was right" restores the clean state ───────────────────────────────
{
  check("undo: a strike gives back its strike (the streak was never written)", JSON.stringify(cleanStateBefore("strike", 1, 1)) === JSON.stringify({ failedAttempts: 0 }) && JSON.stringify(cleanStateBefore("strike", 2, null)) === JSON.stringify({ failedAttempts: 1 }));
  check("undo: a degrade or a ward with the streak it broke brings back a clean state and that streak", JSON.stringify(cleanStateBefore("degraded", 0, 1)) === JSON.stringify({ failedAttempts: 0, cleanStreak: 1 }) && JSON.stringify(cleanStateBefore("shielded", 0, 0)) === JSON.stringify({ failedAttempts: 0, cleanStreak: 0 }));
  check("undo: after an earlier miss (qty null) the pass that follows stays unclean", JSON.stringify(cleanStateBefore("degraded", 0, null)) === JSON.stringify({ failedAttempts: 1, cleanStreak: 0 }));

  // Simulated: L9 with one clean recall in hand misses past grace (a degrade) and is counted as right.
  type Card = { level: number; cleanStreak: number; failedAttempts: number };
  const before: Card = { level: 9, cleanStreak: 1, failedAttempts: 0 };
  const qty = before.failedAttempts > 0 ? null : before.cleanStreak; // the miss row (srs.ts brokenStreak)
  const degraded: Card = { level: 8, cleanStreak: 0, failedAttempts: 0 };
  const undone: Card = { ...degraded, level: before.level, ...cleanStateBefore("degraded", degraded.failedAttempts, qty) };
  const pass = riseStep(undone.level, undone.cleanStreak, undone.failedAttempts);
  check("undo: L9 (1 of 2) degraded then counted as right is L10, as the right answer would have made it", undone.cleanStreak === 1 && undone.failedAttempts === 0 && pass.kind === "up" && pass.levelAfter === 10, JSON.stringify({ undone, pass }));
  // A strike: L9 (1 of 2) strikes, the streak stays written, the strike is given back, the pass raises it.
  const struck: Card = { ...before, failedAttempts: 1 };
  const unstruck: Card = { ...struck, ...cleanStateBefore("strike", struck.failedAttempts, qty) };
  check("undo: L9 (1 of 2) struck then counted as right is L10", riseStep(unstruck.level, unstruck.cleanStreak, unstruck.failedAttempts).levelAfter === 10 && riseStep(struck.level, struck.cleanStreak, struck.failedAttempts).kind === "held");

  const srs = read("src/lib/srs.ts");
  const undo = srs.slice(srs.indexOf("export async function undoMissCore"), srs.indexOf("export function cleanStateBefore"));
  check(
    "wiring: the miss row keeps the streak it broke (qty), and the undo restores from it in the same transaction",
    /const brokenStreak = idea\.failedAttempts > 0 \? null : idea\.cleanStreak;/.test(srs) &&
      /qty: brokenStreak \}/.test(srs) &&
      /select: \{ id: true, xp: true, detail: true, occurredAt: true, qty: true \}/.test(undo) &&
      /ops\.push\(prisma\.idea\.update\(\{ where: \{ id: ideaId \}, data: cleanStateBefore\(outcome, idea\.failedAttempts, row\.qty\) \}\)\);\s*try \{\s*await prisma\.\$transaction\(ops\);/.test(undo)
  );
}

// ── 3. Retention ────────────────────────────────────────────────────────────
{
  const due = new Date("2026-01-01T09:00:00Z");
  const levels = [1, 2, 3, 5, 8, 10, 12, 15, 20];
  check("retention: 1 from before the due day to the end of grace (inclusive)", levels.every((L) => [-5, 0, graceDays(L) / 2, graceDays(L)].every((d) => retentionFactor(L, due, at(due, d)) === 1)));
  check("retention: below 1 right after grace ends", levels.every((L) => retentionFactor(L, due, at(due, graceDays(L) + 0.5)) < 1));
  check(
    "retention: in [0, 1] and never rises with time (a 20-year sweep)",
    levels.every((L) => {
      let prev = 1;
      for (let d = 0; d <= 7300; d += 1) {
        const r = retentionFactor(L, due, at(due, d));
        if (!(r >= 0 && r <= 1) || r > prev + 1e-12) return false;
        prev = r;
      }
      return true;
    })
  );
  check("retention: reaches 0 well after a card has lost several levels (L5 in months, L12 in about three years)", retentionFactor(5, due, at(due, 120)) === 0 && levelsForgotten(5, 120) >= 4 && retentionFactor(12, due, at(due, 1200)) === 0 && levelsForgotten(12, 1200) >= 4 && FADE_BANDS * FORGET_BAND === 0.375);
  const L12first = daysToForget(12, 1)!;
  check("retention: a level-12 card is about 0.8 when it forgets its first level (about 5 months past due)", Math.abs(retentionFactor(12, due, at(due, L12first)) - 0.816) < 0.01, String(retentionFactor(12, due, at(due, L12first))));
  check("retention: a grace extension holds it at 1 longer", retentionFactor(6, due, at(due, graceDays(6) + 2)) < 1 && retentionFactor(6, due, at(due, graceDays(6) + 2), 3) === 1);
  check("retention: a card reviewed on time (due ahead) is 1", depthEntryOf({ level: 9, dueDate: at(due, 10) }, due).retention === 1);
}

// ── 4. The outlook at each boundary ─────────────────────────────────────────
{
  const due = new Date("2026-03-01T09:00:00Z");
  const card = (level: number, extra: Partial<{ cleanStreak: number; failedAttempts: number; dueDate: Date }> = {}) => ({
    level,
    dueDate: extra.dueDate ?? due,
    graceEndsAt: null,
    cleanStreak: extra.cleanStreak ?? 0,
    failedAttempts: extra.failedAttempts ?? 0,
  });
  const L = 10;
  const g = graceDays(L);
  const first = daysToForget(L, 1)!;
  const s = (now: Date, c = card(L)) => ideaOutlook(c, now);
  check("outlook: fresh before the due moment", s(at(due, -0.01)).status === "fresh" && s(at(due, -3)).dueInDays === 3);
  check("outlook: due at the due moment and through the last instant of grace", s(due).status === "due" && s(at(due, g)).status === "due" && s(due).dueInDays === 0);
  check("outlook: fading just past grace, retention below 1, no level lost", s(at(due, g + 0.01)).status === "fading" && s(at(due, g + 1)).retention < 1 && levelsForgotten(L, g + 1) === 0);
  check("outlook: still fading a moment before the first level-loss point", s(at(due, first - 0.01)).status === "fading");
  check("outlook: forgetting at the first level-loss point", s(at(due, first + 0.001)).status === "forgetting");
  const o = s(at(due, g + 1));
  check("outlook: fadingFrom is the grace end; nextLossAt is the first level-loss point", o.fadingFrom === at(due, g).toISOString() && o.nextLossAt === at(due, first).toISOString(), `${o.fadingFrom} ${o.nextLossAt}`);
  // After the nightly pass took a level: the level is lower, the due date the same; the outlook reads from the anchor.
  const later = new Date(Date.UTC(2026, 2, 1) + Math.ceil(first + 2) * DAY + 9 * 3_600_000);
  const lost = levelsForgotten(L, (Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), later.getUTCDate()) - due.getTime()) / DAY);
  const after = s(later, card(L - lost));
  check(
    "outlook: after the nightly pass took a level it is still forgetting, read from the level it fell due at, the next loss later",
    lost >= 1 && forgettingAnchor(L - lost, due, later) === L && after.status === "forgetting" && after.nextLossAt === at(due, daysToForget(L, lost + 1)!).toISOString() && Math.abs(after.retention - retentionFactor(L, due, later)) < 1e-12,
    JSON.stringify({ lost, after })
  );
  check("outlook: level 1 fades but never forgets, and has no next loss", ideaOutlook(card(1), at(due, 400)).status === "fading" && ideaOutlook(card(1), at(due, 400)).nextLossAt === null);
  check(
    "outlook: what the next level needs: 1 clean below L8, 2 from it (1 in hand counts), a miss holds it",
    s(due, card(5)).cleanNeeded === 1 &&
      s(due, card(9, { cleanStreak: 1 })).cleanNeeded === 2 &&
      s(due, card(9, { cleanStreak: 1 })).cleanDone === 1 &&
      s(due, card(9, { cleanStreak: 1, failedAttempts: 1 })).cleanDone === 0 &&
      s(due, card(9, { cleanStreak: 1, failedAttempts: 1 })).heldByMiss &&
      s(due, card(9)).nextLevel === 10 &&
      s(due, card(MAX_LEVEL)).nextLevel === null &&
      s(due, card(12)).mastered &&
      !s(due, card(11)).mastered
  );
}

// ── 5. Retention-weighted levels ────────────────────────────────────────────
{
  check(
    "retained share: Σ w·r ÷ Σ w with w = min(1, L/12)²; 1 with no ideas, bare levels or Σ w = 0",
    retainedShare([]) === 1 &&
      retainedShare([12, 6]) === 1 &&
      retainedShare([{ level: 0, retention: 0 }]) === 1 &&
      Math.abs(retainedShare([{ level: 12, retention: 0.5 }, { level: 6, retention: 1 }]) - (1 * 0.5 + 0.25 * 1) / 1.25) < 1e-12 &&
      retainedPoints(1000, [{ level: 12, retention: 0.5 }]) === 500
  );
  // A points-bound Domain (points level 4, depth 13): fading ideas lower it through its points half; the earned total is untouched.
  const mature = Array.from({ length: 12 }, () => 12);
  check(
    "points half: a points-bound Domain falls when its ideas fade, read at its retained points (the stored total is not changed)",
    domainLevel(784, mature) === 4 && domainLevel(784, mature.map((level) => ({ level, retention: 0.7 }))) === 3 && domainPointsLevel(784 * 0.7) === 3,
    String(domainLevel(784, mature.map((level) => ({ level, retention: 0.7 }))))
  );
  check("points half: leveling writes levels and drop records only, never the weighted points", !/data: \{[^}]*totalPoints/.test(read("src/lib/leveling.ts")) && /retainedPoints\(totalPoints, ideaLevels\)/.test(read("src/lib/xp.ts")));

  const now = new Date("2026-09-01T09:00:00Z");
  const points = 1e6; // the points half never binds here: depth decides
  const ideas = (dueOffsetDays: number) => Array.from({ length: 6 }, () => ({ level: 10, dueDate: at(now, dueOffsetDays) }));
  const plain = domainLevel(points, Array(6).fill(10));
  check("depth: a Domain reviewed on time is exactly what it was (retention 1)", domainLevelNow(points, ideas(5), now) === plain && domainLevelNow(points, ideas(-graceDays(10)), now) === plain, String(plain));
  const neglectDays = 50; // past grace (9 d), before the first level-loss point (about 68 d)
  const neglected = domainLevelNow(points, ideas(-neglectDays), now);
  check(
    "depth: a neglected Domain falls before any of its ideas loses a level",
    neglected < plain && levelsForgotten(10, neglectDays) === 0 && neglectDays < daysToForget(10, 1)!,
    `${plain} → ${neglected}`
  );
  check("depth: bare levels still read at retention 1 (every existing caller)", domainLevel(points, [12, 12, 6]) === domainLevel(points, [{ level: 12, retention: 1 }, { level: 12, retention: 1 }, { level: 6, retention: 1 }]));
}

// ── 5b. The balance model's library: diligent unchanged, neglect felt in weeks ──
{
  // balance-horizon's knowledge model: 10 NUMERIC ideas a week over 12 Domains, every review clean on its due day.
  const base = Date.UTC(2026, 0, 1);
  const dayAt = (d: number) => new Date(base + d * DAY);
  const domains = Array.from({ length: 12 }, () => ({ points: 0, ideas: [] as { level: number; due: number; clean: number }[] }));
  let dealt = 0;
  let diligentSame = true;
  for (let day = 1; day <= 365; day++) {
    if ((day - 1) % 7 === 0) {
      for (let i = 0; i < 10; i++) {
        const d = domains[dealt++ % domains.length];
        d.points += XP_BASE.NUMERIC;
        d.ideas.push({ level: 1, due: day + 1, clean: 0 });
      }
    }
    // Read before the day's reviews: every idea due today is inside its grace (retention 1).
    if (day % 7 === 3) {
      for (const d of domains) {
        const entries = d.ideas.map((i) => ({ level: i.level, retention: retentionFactor(i.level, dayAt(i.due), dayAt(day)) }));
        if (domainLevel(d.points, entries) !== domainLevel(d.points, d.ideas.map((i) => i.level))) diligentSame = false;
      }
    }
    for (const d of domains) {
      for (const idea of d.ideas) {
        if (idea.due > day) continue;
        const step = riseStep(idea.level, idea.clean, 0);
        d.points += reviewReward(idea.level) + (step.levelAfter === MASTERY_LEVEL && idea.level < MASTERY_LEVEL ? MASTERY_BONUS : 0);
        idea.level = step.levelAfter;
        idea.clean = step.cleanStreak;
        idea.due = day + riseBaseIntervalDays(step);
      }
    }
  }
  check("model: a diligent library reads exactly as without retention, every week of its first year", diligentSame);

  // Then one Domain is left alone: the nightly job forgets its levels and debits their points; retention weights both halves.
  const d0 = domains[0];
  const level0 = domainLevel(d0.points, d0.ideas.map((i) => i.level));
  const pointsBound = domainPointsLevel(d0.points) < DEPTH_GRACE + Math.floor(masteryDepth(d0.ideas.map((i) => i.level)));
  let weighted: number | null = null;
  let depthOnly: number | null = null;
  for (let t = 1; t <= 400 && (weighted == null || depthOnly == null); t++) {
    const now = dayAt(365 + t);
    let points = d0.points;
    const entries = d0.ideas.map((i) => {
      const due = dayAt(i.due);
      const lost = levelsForgotten(i.level, Math.max(0, (now.getTime() - due.getTime()) / DAY));
      points -= levelsLossPoints(i.level, i.level - lost);
      return { level: i.level - lost, retention: retentionFactor(i.level, due, now) };
    });
    points = Math.max(0, points);
    if (weighted == null && domainLevel(points, entries) < level0) weighted = t;
    if (depthOnly == null && Math.min(domainPointsLevel(points), DEPTH_GRACE + Math.floor(masteryDepth(entries))) < level0) depthOnly = t;
  }
  check(
    "model: a mature, points-bound Domain left alone from day 365 falls a level within about two months (depth alone took about six)",
    pointsBound && weighted != null && weighted >= 45 && weighted <= 90 && depthOnly != null && depthOnly > 120,
    `level ${level0}, points-bound ${pointsBound}: falls after ${weighted} days (depth only: ${depthOnly})`
  );
  console.log(`  (a points-bound Domain at level ${level0}, left alone from day 365: falls after ${weighted} days; with depth alone it took ${depthOnly})`);
}

// ── 6. Drops, and the daily recompute ───────────────────────────────────────
{
  const now = new Date("2026-09-01T09:00:00Z");
  check("drop: a fall records the level it fell from and when", JSON.stringify(dropMarkOf({ level: 4, droppedFrom: null }, 3, now)) === JSON.stringify({ droppedFrom: 4, droppedAt: now }));
  check("drop: a rise never records one; a rise short of the old level keeps the record", dropMarkOf({ level: 2, droppedFrom: null }, 3, now) === null && dropMarkOf({ level: 2, droppedFrom: 4 }, 3, now) === null);
  check("drop: a rise back to the level it fell from clears it", JSON.stringify(dropMarkOf({ level: 3, droppedFrom: 4 }, 4, now)) === JSON.stringify({ droppedFrom: null, droppedAt: null }));
  check("drop: no change writes nothing", dropMarkOf({ level: 3, droppedFrom: 4 }, 3, now) === null);

  // A Field with a diligent Domain and a neglected one, stored at their on-time levels.
  const onTime = (n: number, level: number) => Array.from({ length: n }, () => ({ level, dueDate: at(now, 3) }));
  const late = (n: number, level: number, days: number) => Array.from({ length: n }, () => ({ level, dueDate: at(now, -days) }));
  const field = (calcIdeas: { level: number; dueDate: Date }[]): LevelingField => ({
    id: "f",
    level: 0,
    droppedFrom: null,
    domains: [
      { id: "calc", level: domainLevel(1e6, calcIdeas.map((i) => i.level)), totalPoints: 1e6, droppedFrom: null, ideas: calcIdeas },
      { id: "alg", level: domainLevel(1e6, Array(4).fill(9)), totalPoints: 1e6, droppedFrom: null, ideas: onTime(4, 9) },
    ],
  });
  const settled = (f: LevelingField, when: Date): LevelingField => {
    const p = planFieldLevels(f, when);
    return {
      ...f,
      level: p.fieldLevel,
      droppedFrom: p.fieldWrite?.drop ? p.fieldWrite.drop.droppedFrom : f.droppedFrom,
      domains: f.domains.map((d) => {
        const w = p.domainWrites.find((x) => x.id === d.id);
        return w ? { ...d, level: w.level, droppedFrom: w.drop ? w.drop.droppedFrom : d.droppedFrom } : d;
      }),
    };
  };
  const diligent = settled(field(onTime(6, 10)), now);
  check("recompute: a diligent Field writes nothing", (() => { const p = planFieldLevels(diligent, now); return p.domainWrites.length === 0 && p.fieldWrite === null; })());
  const neglectedField: LevelingField = { ...diligent, domains: diligent.domains.map((d) => (d.id === "calc" ? { ...d, ideas: late(6, 10, 50) } : d)) };
  const plan = planFieldLevels(neglectedField, now);
  const calc = plan.domainWrites.find((w) => w.id === "calc");
  check(
    "recompute: the neglected Domain drops (droppedFrom, droppedAt) and its Field after it; the diligent sibling is untouched",
    !!calc && calc.level < diligent.domains[0].level && calc.drop?.droppedFrom === diligent.domains[0].level && calc.drop?.droppedAt === now && !plan.domainWrites.some((w) => w.id === "alg") && !!plan.fieldWrite && plan.fieldWrite.level < diligent.level && plan.fieldWrite.drop?.droppedFrom === diligent.level,
    JSON.stringify(plan, (k, v) => (v instanceof Map ? [...v] : v))
  );
  const once = settled(neglectedField, now);
  const again = planFieldLevels(once, now);
  check("recompute: idempotent (a second run at the same moment writes nothing)", again.domainWrites.length === 0 && again.fieldWrite === null);
  const reviewed: LevelingField = { ...once, domains: once.domains.map((d) => (d.id === "calc" ? { ...d, ideas: onTime(6, 10) } : d)) };
  const back = planFieldLevels(reviewed, now);
  const calcBack = back.domainWrites.find((w) => w.id === "calc");
  check("recompute: reviewing brings the level back and clears the drop; a rise never records one", !!calcBack && calcBack.level === diligent.domains[0].level && calcBack.drop?.droppedFrom === null && calcBack.drop?.droppedAt === null);

  const leveling = read("src/lib/leveling.ts");
  const route = read("src/app/api/cron/degrade/route.ts");
  check(
    "wiring: the nightly job recomputes every level after the degrade, in batches, writing only what changed",
    /const results = await degradeOverdueIdeas\(\);\s*\/\/[^\n]*\n\s*const levels = await recomputeAllLevels\(\{ now: new Date\(\) \}\);/.test(route) &&
      /const RECOMPUTE_BATCH = 25;/.test(leveling) &&
      /if \(ops\.length > 0\) await prisma\.\$transaction\(ops\);/.test(leveling) &&
      /planFieldLevels\(/.test(leveling)
  );
  check(
    "wiring: Domain and Field writes carry their drop record",
    /prisma\.domain\.update\(\{ where: \{ id: w\.id \}, data: \{ level: w\.level, \.\.\.\(w\.drop \?\? \{\}\) \} \}\)/.test(leveling) && /prisma\.field\.update\(\{ where: \{ id: w\.id \}, data: \{ level: w\.level, \.\.\.\(w\.drop \?\? \{\}\) \} \}\)/.test(leveling)
  );
  check("wiring: the review path recomputes with the modifiers it already holds", /recalculateLeveling\(idea\.domainId, \{ now, graceExtraDays: modifiers\.graceExtraDays \}\)/.test(read("src/lib/srs.ts")));
}

// ── 7. The bell ─────────────────────────────────────────────────────────────
{
  const now = new Date("2026-09-01T09:00:00Z");
  const drop = (id: string, kind: "domain" | "field", name: string, level: number, from: number, hoursAgo: number, fading: number): LevelDrop => ({
    id,
    kind,
    name,
    level,
    droppedFrom: from,
    droppedAt: new Date(now.getTime() - hoursAgo * 3_600_000),
    fading,
    href: `/library/field/${id}`,
  });
  const notices = levelNoticesOf([drop("d1", "domain", "Calculus", 3, 4, 2, 4), drop("f1", "field", "Mathematics", 5, 6, 3, 7)], { fading: 9, forgetting: 3 });
  const byId = new Map(notices.map((n) => [n.id, n]));
  check(
    "bell: 'Calculus fell to L3 (from L4)' with its fading ideas; the Field after it",
    byId.get("drop-domain:d1")?.title === "Calculus fell to L3 (from L4)" &&
      byId.get("drop-domain:d1")?.detail.startsWith("4 ideas fading") === true &&
      byId.get("drop-field:f1")?.title === "Mathematics field fell to L5 (from L6)" &&
      notices.findIndex((n) => n.id === "drop-domain:d1") < notices.findIndex((n) => n.id === "drop-field:f1"),
    JSON.stringify(notices)
  );
  const fading = byId.get("overdue");
  check("bell: '12 ideas fading' opens the Library's fading filter; losing levels makes it bad", fading?.title === "12 ideas fading" && fading.href === "/library?show=fading" && fading.tone === "bad" && fading.detail.startsWith("3 already losing levels"));
  check("bell: nothing fading, no fading line; only fading (none losing levels) is a warning", levelNoticesOf([], { fading: 0, forgetting: 0 }).length === 0 && levelNoticesOf([], { fading: 2, forgetting: 0 })[0].tone === "warn");
  const many = levelNoticesOf([1, 2, 3, 4, 5].map((i) => drop(`d${i}`, "domain", `D${i}`, 2, 3, i, 0)), { fading: 0, forgetting: 0 });
  check("bell: the three latest Domain drops by name, the rest in one line", many.length === 4 && many[0].id === "drop-domain:d1" && many[3].id === "drop-domain:more" && many[3].title === "2 more Domains fell this week");
  const notif = read("src/lib/notifications.ts");
  check(
    "wiring: the feed reads drops within DROP_NOTICE_DAYS (7) and the fading count through ideaOutlook",
    /export const DROP_NOTICE_DAYS = 7;/.test(notif) && /droppedAt: \{ gte: since \}/.test(notif) && /const \{ status \} = ideaOutlook\(i, now, graceExtraDays\);/.test(notif) && /notices\.push\(\.\.\.levelNotices\);/.test(notif)
  );
}

console.log(`\nleveling-check: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
