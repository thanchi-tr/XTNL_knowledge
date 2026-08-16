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
 */
import { SKILL_POOL } from "../src/lib/skill-pool";
import { IDEA_MASTERY_POINTS, REVIEW_MASTERY_PER_LEVEL } from "../src/lib/mastery";
import { MASTERY_LEVEL, MAX_LEVEL, baseIntervalDays } from "../src/lib/xp";

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
}

main();
