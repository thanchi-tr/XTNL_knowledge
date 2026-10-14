/**
 * Forgetting (src/lib/forgetting.ts and srs.ts degradeOverdueIdeas): an idea left unreviewed loses levels along the
 * Ebbinghaus forgetting curve R(t) = e^(−t/S), S = I ÷ ln(1/0.9), I = baseline(level) × ease (2026-10-14; it was the
 * power curve), and each lost level takes back what earning it paid. Pure arithmetic, a day-by-day simulation of the
 * nightly job (idempotent, never twice), and pins on the job and the missed-review degrade.
 *
 *   npx tsx scripts/forgetting-check.ts
 */
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
  levelLossPoints,
  levelsForgotten,
  levelsLossPoints,
  retrievability,
} from "../src/lib/forgetting";
import { MASTERY_BONUS, MASTERY_LEVEL, MAX_LEVEL, baseIntervalDays, graceDays, reviewPayout } from "../src/lib/xp";

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
