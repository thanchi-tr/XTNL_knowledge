/**
 * Forgetting (src/lib/forgetting.ts and srs.ts degradeOverdueIdeas): an idea left unreviewed loses levels along the
 * Ebbinghaus forgetting curve R(t) = e^(−t/S), S = I ÷ ln(1/0.9), I = baseline(level) × ease (2026-10-14; it was the
 * power curve), and each lost level takes back what earning it paid. Pure arithmetic, a day-by-day simulation of the
 * nightly job (idempotent, never twice), and pins on the job and the missed-review degrade. Blueprint P13 (decision
 * D23): the per-card curve stays, with a 72 h floor on every card's grace (xp.ts GRACE_FLOOR_DAYS), pinned against the
 * rule before it, and held on a wrong answer too (srs.ts missKindOf through missGraceEndOf), even on a row whose
 * stored grace end was written before the floor.
 *
 *   npx tsx scripts/forgetting-check.ts
 */
// srs.ts (the miss path's floor) reaches a roadmap module: no model call may run from here.
import "./_no-model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DESIGN_DECAY,
  DESIGN_RETENTION,
  FORGET_BAND,
  daysOverdueOf,
  intervalOf,
  stabilityOf,
  daysToForget,
  forgetDedupeKey,
  forgetKeyPrefix,
  ideaOutlook,
  ideaStatusOf,
  levelLossPoints,
  levelsForgotten,
  levelsLossPoints,
  retentionFactor,
  retrievability,
} from "../src/lib/forgetting";
import { GRACE_FLOOR_DAYS, MASTERY_BONUS, MASTERY_LEVEL, MAX_LEVEL, baseIntervalDays, graceDays, graceEndsAt, reviewPayout } from "../src/lib/xp";
import { missGraceEndOf, missKindOf } from "../src/lib/srs";

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
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── The curve ───────────────────────────────────────────────────────────────
{
  check(
    "curve: recall is 90% on the due day, for every level and ease (S = I ÷ ln(1/0.9), I = baseline × ease)",
    Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).every((L) =>
      [0.6, 0.85, 1, 1.3, 1.8].every((e) => near(intervalOf(L, e), baseIntervalDays(L) * e) && near(stabilityOf(L, e), intervalOf(L, e) / Math.log(1 / 0.9)) && near(retrievability(intervalOf(L, e), stabilityOf(L, e)), DESIGN_RETENTION))
    ) && near(DESIGN_DECAY, Math.log(1 / 0.9))
  );
  check(
    "curve: Ebbinghaus, R(t) = e^(−t/S): R(0) = 1, R(2I) = 0.81, R(3I) = 0.729, and the same share lost every day (R(t + u) = R(t)·R(u))",
    (() => {
      const S = stabilityOf(9);
      const I = intervalOf(9);
      return near(retrievability(0, S), 1) && near(retrievability(2 * I, S), 0.81) && near(retrievability(3 * I, S), 0.729) && near(retrievability(17 + 40, S), retrievability(17, S) * retrievability(40, S)) && near(retrievability(10, 20), Math.exp(-0.5));
    })()
  );
  check("curve: recall only falls with time, and ever more slowly in absolute terms", (() => {
    const S = 18;
    const r = [0, 10, 20, 40, 80, 160].map((t) => retrievability(t, S));
    const drops = r.slice(1).map((x, i) => r[i] - x);
    return r.every((x, i) => i === 0 || x < r[i - 1]) && (retrievability(400, S) - retrievability(800, S)) / 400 < (retrievability(20, S) - retrievability(40, S)) / 20 && drops.every((d) => d > 0);
  })());
  check("curve: one level per 7.5 points of recall below 90%", FORGET_BAND === 0.075 && DESIGN_RETENTION === 0.9);
  // The n-th level goes at o = I·(ln(0.9 − 0.075n) ÷ ln 0.9 − 1) past due: 0.83·I, 1.73·I, 2.73·I, 3.85·I …
  check(
    "curve: the n-th level goes at I·(ln(0.9 − 0.075n)/ln 0.9 − 1) past due (0.83·I, 1.73·I, 2.73·I, 3.85·I), at every ease",
    [10, 12, 16].every((L) =>
      [0.6, 1, 1.8].every((e) =>
        [1, 2, 3, 4].every((n) => near(daysToForget(L, n, 0, e)!, Math.max(graceDays(L), intervalOf(L, e) * (Math.log(0.9 - 0.075 * n) / Math.log(0.9) - 1)), 1e-6))
      )
    ) && [0.826, 1.731, 2.731, 3.848].every((k, i) => Math.abs(Math.log(0.9 - 0.075 * (i + 1)) / Math.log(0.9) - 1 - k) < 0.001)
  );
  check(
    "curve: a wider ease holds longer, a tighter one forgets sooner (L12: 0.6× about 79 d, 1× about 132 d, 1.8× about 238 d past due)",
    Math.round(daysToForget(12, 1, 0, 0.6)!) === 79 && Math.round(daysToForget(12, 1)!) === 132 && Math.round(daysToForget(12, 1, 0, 1.8)!) === 238 && levelsForgotten(12, 150, 0, 1.8) === 0 && levelsForgotten(12, 150, 0, 0.6) >= 1
  );
}

// ── Levels forgotten ────────────────────────────────────────────────────────
{
  check("forget: level 1 has nothing to forget, however long", levelsForgotten(1, 10_000) === 0);
  check("forget: nothing inside the grace period", Array.from({ length: MAX_LEVEL - 1 }, (_, i) => i + 2).every((L) => levelsForgotten(L, graceDays(L)) === 0 && levelsForgotten(L, graceDays(L) + 2, 3) === levelsForgotten(L, graceDays(L) + 2, 3)));
  check("forget: a grace extension holds a card longer", levelsForgotten(4, 6.5) >= 1 && levelsForgotten(4, 6.5, 4) === 0);
  check("forget: never below level 1", Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).every((L) => levelsForgotten(L, 1e7) <= L - 1));
  check("forget: never un-forgets (non-decreasing in days overdue)", Array.from({ length: MAX_LEVEL - 1 }, (_, i) => i + 2).every((L) => {
    let prev = 0;
    for (let d = 0; d <= 3000; d += 3) {
      const n = levelsForgotten(L, d);
      if (n < prev) return false;
      prev = n;
    }
    return true;
  }));
  // The slope: a young card forgets in days, a mature one in months, a top one in years.
  check("slope: level 4 forgets its first level in about a week past due", levelsForgotten(4, 5) === 0 && levelsForgotten(4, 7) === 1);
  check("slope: level 6 in about two weeks, and is level 1 within about five months", levelsForgotten(6, 14) === 0 && levelsForgotten(6, 17) === 1 && levelsForgotten(6, 130) === 5);
  check("slope: level 12 holds for months, then forgets slowly", levelsForgotten(12, 100) === 0 && levelsForgotten(12, 150) === 1 && levelsForgotten(12, 330) === 2);
  check("slope: level 20 holds for years", levelsForgotten(20, 2000) === 0);
  check("slope: each further level takes longer than the one before (memory steadies)", [4, 6, 8, 12].every((L) => {
    const ds = [1, 2, 3].map((n) => daysToForget(L, n)).filter((d): d is number => d != null);
    return ds.every((d, i) => i === 0 || d - ds[i - 1] >= (i > 1 ? ds[i - 1] - ds[i - 2] : 0));
  }));
  check("slope: daysToForget agrees with levelsForgotten", [3, 5, 8, 12, 16].every((L) => [1, 2].every((n) => {
    const d = daysToForget(L, n);
    return d == null || (levelsForgotten(L, d + 0.01) >= n && levelsForgotten(L, Math.max(0, d - 0.5)) < n);
  })));
  check("days overdue: from the due date, never negative", daysOverdueOf(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-03T12:00:00Z")) === 2.5 && daysOverdueOf(new Date("2026-10-05T00:00:00Z"), new Date("2026-10-03T00:00:00Z")) === 0);
}

// ── The 72 h floor (blueprint 3.1a, decision D23; P13) ──────────────────────
// Every card's grace is at least GRACE_FLOOR_DAYS (3) days past its due day, so nothing fades or forgets a level within
// 72 hours of falling due (and so of its last review). The per-card curve is the same; no flat decay. Pinned against
// the rule before it: the same curve with the grace ℓ − 1.
{
  const preFloorGrace = (L: number) => Math.max(0, L - 1);
  /** levelsForgotten as it read before the floor: the same curve, grace ℓ − 1. */
  const preFloor = (L: number, o: number, extra = 0, e = 1) => {
    if (L <= 1 || !(o > preFloorGrace(L) + extra)) return 0;
    const R = retrievability(intervalOf(L, e) + o, stabilityOf(L, e));
    return Math.max(0, Math.min(L - 1, Math.floor((DESIGN_RETENTION - R) / FORGET_BAND + 1e-9)));
  };
  const levels = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);
  const eases = [0.6, 0.85, 1, 1.3, 1.8];
  const due = new Date("2026-01-01T00:00:00Z");
  const at = (o: number) => new Date(due.getTime() + o * 86_400_000);
  check(
    "floor: GRACE_FLOOR_DAYS is 3 (72 h); graceDays = max(3, L − 1): L1–L4 3, L5 4, L12 11; the stored grace end follows it",
    GRACE_FLOOR_DAYS === 3 && [1, 2, 3, 4, 5, 12].map(graceDays).join() === "3,3,3,3,4,11" && graceEndsAt(due, 2).getTime() === at(3).getTime() && graceEndsAt(due, 2, 2).getTime() === at(5).getTime()
  );
  check(
    "floor (L2 pin): an L2 card (I 2 d) loses its first level 3 days past due; the curve alone would take it at about 1.65",
    near(daysToForget(2, 1)!, 3) && levelsForgotten(2, 2.99) === 0 && levelsForgotten(2, 3.01) === 1 && Math.abs(intervalOf(2) * (Math.log(0.825) / Math.log(0.9) - 1) - 1.652) < 1e-3 && preFloor(2, 2) === 1,
    `daysToForget(2) ${daysToForget(2, 1)}`
  );
  check(
    "floor: no card at any level or ease fades or forgets within 3 days of falling due (so none within 72 h of its last review)",
    levels.every((L) =>
      eases.every((e) => [0, 1, 2, 2.5, 3].every((o) => levelsForgotten(L, o, 0, e) === 0 && retentionFactor(L, due, at(o), 0, e) === 1) && (L < 2 || daysToForget(L, 1, 0, e)! >= GRACE_FLOOR_DAYS))
    )
  );
  check(
    "floor: just past it the curve applies as before (an L2 at 3.5 days past due is fading, its retention below 1; a level gone)",
    retentionFactor(2, due, at(3.5)) < 1 && levelsForgotten(2, 3.5) === 1 && ideaOutlook({ level: 2, dueDate: due, graceEndsAt: null, cleanStreak: 0, failedAttempts: 0 }, at(2.5)).status === "due"
  );
  // Acceptance: for the same cards, the floor never forgets more, and leaves L4 and up exactly as they were.
  const grid: { L: number; e: number; o: number; extra: number }[] = [];
  for (const L of levels.slice(1)) for (const e of eases) for (const extra of [0, 2]) for (let o = 0; o <= 400; o += 0.25) grid.push({ L, e, o, extra });
  const fewer = grid.filter((c) => levelsForgotten(c.L, c.o, c.extra, c.e) > preFloor(c.L, c.o, c.extra, c.e));
  const moved = grid.filter((c) => levelsForgotten(c.L, c.o, c.extra, c.e) !== preFloor(c.L, c.o, c.extra, c.e));
  check("acceptance: on every card (L2–L20, ease 0.6–1.8, 0–400 days past due, with and without a grace extension) the floor forgets no more levels than before", fewer.length === 0 && grid.length > 100_000, `${fewer.length} more`);
  // With no grace extension what moves is L2, and an L3 below about 0.91× ease; an extension adds the same days to both
  // graces, so then an L3's longer grace can hold its first loss at any ease.
  const plain = moved.filter((c) => c.extra === 0);
  check(
    "acceptance: no card at L4 or above changes (its grace, its levels forgotten); what moves is L2 and some L3 (with no grace extension, an L3 only below 0.91× ease), each later",
    levels.filter((L) => L >= 4).every((L) => graceDays(L) === preFloorGrace(L)) &&
      moved.every((c) => c.L <= 3) &&
      plain.length > 0 &&
      plain.every((c) => c.L === 2 || (c.L === 3 && c.e < 0.91)) &&
      plain.some((c) => c.L === 3),
    [...new Set(moved.map((c) => `L${c.L}@${c.e}+${c.extra}`))].join(" ")
  );
  // The first nightly pass after the deploy, on the same fixture: every card as the pass before the floor left it last night.
  let rowsBefore = 0;
  let rowsAfter = 0;
  let perCardMore = 0;
  for (const L of levels.slice(1))
    for (const e of eases)
      for (let o = 1; o <= 200; o += 1) {
        const done = preFloor(L, o - 1, 0, e);
        const before = Math.max(0, preFloor(L, o, 0, e) - done);
        const after = Math.max(0, levelsForgotten(L, o, 0, e) - done);
        rowsBefore += before;
        rowsAfter += after;
        if (after > before || (L >= 4 && after !== before)) perCardMore++;
      }
  check(
    "acceptance: the first nightly pass after the deploy writes no more FORGET rows than the pass before the floor would, card by card (L4 and up the same)",
    perCardMore === 0 && rowsAfter <= rowsBefore && rowsAfter < rowsBefore,
    `${rowsAfter} rows against ${rowsBefore}`
  );
  // A wrong answer (srs.ts missKindOf): every row written before the floor stored grace end due + (L − 1) days, so an
  // L2's ended a day past due. The miss path reads it at the floor (missGraceEndOf) until the row's next write.
  const oldL2 = { lapseDay: null, failedAttempts: 0, dueDate: due, cycleMissed: false, graceEndsAt: at(1) };
  check(
    "floor (L2 pin, a wrong answer): an L2 row with its pre-floor grace end (due + 1 day), answered wrong 2 days past due, is a lapse, never a level lost; at 3.5 days it degrades",
    missKindOf(oldL2, at(2), 3) === "lapse" && missKindOf(oldL2, at(2.99), 3) === "lapse" && missKindOf(oldL2, at(3.5), 3) === "degrade" && missGraceEndOf(oldL2)!.getTime() === at(3).getTime()
  );
  check(
    "floor (a wrong answer): an L3's pre-floor end (due + 2) reads as due + 3; a row written since (graceEndsAt) and every L4+ end are read as stored",
    missGraceEndOf({ ...oldL2, graceEndsAt: at(2) })!.getTime() === at(3).getTime() &&
      [1, 2, 3, 4, 5, 12].every((L) => missGraceEndOf({ ...oldL2, graceEndsAt: graceEndsAt(due, L) })!.getTime() === graceEndsAt(due, L).getTime()) &&
      missGraceEndOf({ ...oldL2, graceEndsAt: graceEndsAt(due, 2, 2) })!.getTime() === at(5).getTime() &&
      missGraceEndOf({ ...oldL2, graceEndsAt: null }) === null
  );
  check(
    "floor (a wrong answer): a lapsed cycle (a strike or a ward moved its due date to tomorrow, its grace end kept) reads the column as it stands",
    missGraceEndOf({ ...oldL2, cycleMissed: true, dueDate: at(2) })!.getTime() === at(1).getTime() && missKindOf({ ...oldL2, cycleMissed: true, dueDate: at(2) }, at(2), 3) === "degrade"
  );
  check(
    "status: ideaStatusOf is ideaOutlook's status (fresh before due, without reading the curve)",
    levels.every((L) =>
      [0.6, 1, 1.8].every((e) =>
        [-2, 0, 1, 2.5, 3, 3.5, 10, 40, 400].every((o) => ideaStatusOf({ level: L, dueDate: due, ease: e }, at(o), 1) === ideaOutlook({ level: L, dueDate: due, graceEndsAt: null, cleanStreak: 0, failedAttempts: 0, ease: e }, at(o), 1).status)
      )
    ) && ideaStatusOf({ level: 5, dueDate: at(1) }, at(0)) === "fresh"
  );
}

// ── What a lost level costs ─────────────────────────────────────────────────
{
  check("cost: level 1 costs nothing", levelLossPoints(1) === 0 && levelLossPoints(0) === 0);
  check("cost: a level takes back the base the review that reached it paid", [2, 5, 9, 15, 20].every((L) => near(levelLossPoints(L), reviewPayout(L - 1).base)));
  check("cost: falling from mastery also takes back the mastery bonus", near(levelLossPoints(MASTERY_LEVEL), reviewPayout(MASTERY_LEVEL - 1).base + MASTERY_BONUS));
  check("cost: several levels cost the sum of each", near(levelsLossPoints(6, 3), levelLossPoints(6) + levelLossPoints(5) + levelLossPoints(4)) && levelsLossPoints(3, 3) === 0 && near(levelsLossPoints(3, 0), levelLossPoints(3) + levelLossPoints(2)));
}

// ── The nightly job, simulated: what it takes, once ─────────────────────────
{
  // The job's own rule: the card's level then = today's + the levels already taken from this due date; take what's owed.
  const simulate = (level: number, days: number, runsPerDay = 1) => {
    const due = new Date("2026-01-01T00:00:00Z");
    const keys = new Set<string>();
    let lvl = level;
    let taken = 0;
    for (let d = 0; d <= days; d++) {
      for (let r = 0; r < runsPerDay; r++) {
        const now = new Date(due.getTime() + d * 86_400_000);
        const prefix = forgetKeyPrefix("i1", due);
        const done = [...keys].filter((k) => k.startsWith(prefix)).length;
        const anchor = lvl + done;
        const want = levelsForgotten(anchor, daysOverdueOf(due, now));
        for (let n = done + 1; n <= want; n++) {
          const key = forgetDedupeKey("i1", due, n);
          if (keys.has(key)) continue;
          keys.add(key);
          taken += levelLossPoints(anchor - n + 1);
        }
        if (want > done) lvl = anchor - want;
      }
    }
    return { lvl, taken, rows: keys.size };
  };
  const once = simulate(12, 900);
  const twice = simulate(12, 900, 2);
  check("job: a level-12 card left 900 days is level 9, and lost exactly what levels 12, 11 and 10 earned", once.lvl === 12 - levelsForgotten(12, 900) && near(once.taken, levelsLossPoints(12, once.lvl)) && once.rows === 12 - once.lvl, JSON.stringify(once));
  check("job: running twice a night takes nothing twice", twice.lvl === once.lvl && near(twice.taken, once.taken) && twice.rows === once.rows);
  const young = simulate(4, 60);
  check("job: a level-4 card left two months is level 1, its three levels' points taken", young.lvl === 1 && near(young.taken, levelsLossPoints(4, 1)));
}

// ── Wiring ──────────────────────────────────────────────────────────────────
{
  const srs = read("src/lib/srs.ts");
  const job = srs.slice(srs.indexOf("export async function degradeOverdueIdeas"));
  check("job: reads the curve (levelsForgotten, at the card's ease) from the card's due date and the levels it already lost", /const want = levelsForgotten\(anchor, daysOverdueOf\(idea\.dueDate, now\), graceExtra, idea\.ease\);/.test(job) && /const anchor = idea\.level \+ done;/.test(job));
  check("job: one FORGET row per level, sink DOMAIN, xp negative, keyed per card, due date and level", /source: "FORGET",\s*sink: "DOMAIN",[\s\S]*?xp: -points,[\s\S]*?dedupeKey: forgetDedupeKey\(idea\.id, idea\.dueDate, n\)/.test(job));
  check("job: the level, the rows and the Domain's points move in one transaction; a duplicate run takes nothing", /await prisma\.\$transaction\(ops\);[\s\S]*?if \(isDuplicateActivity\(err\)\) continue;/.test(job));
  // 2026-10-13 (idea leveling): a forgotten level also starts its clean recalls again (Idea.cleanStreak 0).
  // 2026-10-14 (one lapse a day): and drops a miss held over from its cycle (Idea.cycleMissed false).
  check("job: the due date is left as the anchor (only the level is written, the clean streak and the missed cycle reset)", /prisma\.idea\.update\(\{ where: \{ id: idea\.id \}, data: \{ level: newLevel, cleanStreak: 0, cycleMissed: false \} \}\)/.test(job));
  check("job: levels then follow (recalculateLeveling once per Domain touched)", /for \(const domainId of touched\) await recalculateLeveling\(domainId\);/.test(job));
  check("points: a Domain never goes below 0", /GREATEST\(0, "totalPoints" - \$\{points\}\)/.test(srs));
  const degrade = srs.slice(srs.indexOf("async function degradeIdea"), srs.indexOf("function domainDebitOp"));
  check("failed review: a lost level costs what earning it paid; level 1 loses nothing (no nightly drain)", /const taken = newLevel < idea\.level \? levelLossPoints\(idea\.level\) : 0;/.test(degrade) && !/yieldPoints \* /.test(degrade));
  check("cron: the nightly route still runs the job first", /const results = await degradeOverdueIdeas\(\);/.test(read("src/app/api/cron/degrade/route.ts")));
  check("ledger: FORGET counts against the Domain (DEFAULT_SINK)", /FORGET: "DOMAIN"/.test(read("src/lib/activity.ts")));
}

console.log(`\nforgetting-check: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
