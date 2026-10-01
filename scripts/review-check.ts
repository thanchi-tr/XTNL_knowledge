/**
 * The review lane's checks (redesign L2). Pure: no database, no network.
 *
 *   npx tsx scripts/review-check.ts
 *
 * What it proves:
 *   1. The ±12% reward roll is gone and nothing's expected value moved: the
 *      old roll's mean is re-derived (exactly 1.0) and the new factor is 1.
 *   2. The payout is bit-for-bit the old formula, now in named parts, and the
 *      combo label the runner prints equals the multiplier paid, cap
 *      modifiers included (COMBO_CEILING, MOMENTUM, FATIGUED).
 *   3. True facts: every branch of review-facts.ts, deterministic.
 *   4. The quest: the hub's target is exactly the Today board's, capped at 15.
 *   5. Bosses: "need 7 of 9" agrees with the resolver's verdict for every
 *      tier and score; the bar only drops on a correct answer; boons are
 *      chosen (never drawn) and a claim outlives its window.
 *   6. The session receipt equals what was credited; the runner's model is
 *      deterministic; the fixtures pass the honesty rule.
 *   7. Source rules: the M1 ledger writes in srs.ts are intact, one read wave
 *      before the write, no AFFIRMATIONS / Strong roll / VARIANCE_*, no
 *      Math.random or framer-motion in the review route, layered CSS.
 *   8. The review fixes (F2): scoped snapshots, in-run Seals marked seen (one
 *      Seal implementation, L3's SealCard), one "Today kept" per run, the dock
 *      guard, one loadout strip (L4's), ink errors, titled truncation, and no
 *      class name in the lane that Tailwind also emits as a utility.
 *
 * Importing bosses.ts constructs a PrismaClient but never queries it.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import {
  COMBO_CAP,
  COMBO_STEP,
  MASTERY_LEVEL,
  REVIEW_LEVEL_BONUS,
  REVIEW_XP_BASE,
  comboIsCapped,
  comboMultiplier,
  reviewLevelBase,
  reviewPayout,
  reviewReward,
  rollRewardVariance,
} from "../src/lib/xp";
import {
  REVIEW_QUEST_CARDS,
  historyOf,
  minutesFor,
  questStateOf,
  questTargetOf,
  reviewMarkOf,
  sessionFactsOf,
  shortDay,
  trueFactOf,
  type FactInput,
  type HistoryEntry,
  type SessionCardFact,
} from "../src/lib/review-facts";
import { questOf } from "../src/lib/today-board";
import {
  BOSS_BOON_CLAIM_HOURS,
  boonClaimUntil,
  bossBatchSize,
  bossNeedCorrect,
  bossRequiredAccuracy,
  bossSpoilsReason,
  bossWins,
  claimsVictory,
} from "../src/lib/bosses";
import { BOON_KINDS, BOON_META } from "../src/lib/boon-meta";
import { DEBUFF_KINDS, DEBUFF_META } from "../src/lib/debuff-meta";
import { honestyProblem, makeEvent, type CelebrationEvent } from "../src/lib/celebration-types";
import {
  CHAIN_MAX,
  bossView,
  cardTitle,
  celebrationRoute,
  comboView,
  dayKeptOf,
  formulaOf,
  keptStreakOf,
  levelRowsOf,
  questNow,
  receiptOf,
  segmentsOf,
  seededOrder,
  sessionCardFacts,
  tallyOf,
  type CardResult,
} from "../src/components/workspace/review-model";
import { reviewFixtures } from "../src/app/dev/style/review/fixtures";
import { GET as workspaceRedirect } from "../src/app/workspace/route";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

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
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── 1. The roll is gone; its expected value was exactly 1.0 ────────────────
{
  // The retired roll, verbatim: mean of two uniforms on [0.88, 1.12], rounded to 0.001.
  const oldRoll = (u1: number, u2: number) => {
    const centred = (u1 + u2) / 2;
    const factor = 0.88 + (1.12 - 0.88) * centred;
    return Math.round(factor * 1000) / 1000;
  };
  const N = 1000;
  let sum = 0;
  let pairs = 0;
  let pairOk = true;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const u1 = (i + 0.5) / N;
      const u2 = (j + 0.5) / N;
      const f = oldRoll(u1, u2);
      sum += f;
      // Mirror symmetry: (u1, u2) and (1−u1, 1−u2) sum to 2.000 (±0.001 at a rounding tie).
      if (Math.abs(f + oldRoll(1 - u1, 1 - u2) - 2) > 0.0010001) pairOk = false;
      pairs++;
    }
  }
  const mean = sum / pairs;
  check("variance: the retired roll was symmetric about 1.0 (every mirrored pair sums to 2)", pairOk);
  check("variance: the retired roll's expected value is 1.0 (10⁶-point midpoint integral)", Math.abs(mean - 1) < 1e-6, mean.toFixed(9));
  check("variance: rollRewardVariance() now returns exactly 1 — the same expected value, with no spread", rollRewardVariance().factor === 1);
  // Old expected payout = reward × E[factor] = reward × 1.0 = the new payout, for every card.
  const r = reviewReward(7, 4, COMBO_CAP, 1.2);
  check("variance: E[old payout] equals the new payout for a sample card", Math.abs(r * mean - r) < 1e-5 * r);
}

// ── 2. The payout: bit-exact, in parts; the combo label is the multiplier paid ─
{
  const oldReward = (L: number, c: number, cap: number, y: number) => {
    const levelFactor = 1 + REVIEW_LEVEL_BONUS * (Math.max(1, L) - 1);
    const comboFactor = 1 + COMBO_STEP * Math.min(Math.max(0, c), cap);
    return REVIEW_XP_BASE * levelFactor * comboFactor * y;
  };
  let exact = true;
  let parts = true;
  let where = "";
  const caps = [0, 2, 5, COMBO_CAP, 13, 18, 20];
  const yields = [0.6, 0.72, 0.75, 1, 1.08, 1.18, 1.25, 1.5];
  for (let L = 0; L <= 21; L++) {
    for (const c of [-3, 0, 1, 2, 2.5, 3, 9, 10, 11, 17, 18, 30]) {
      for (const cap of caps) {
        for (const y of yields) {
          const a = oldReward(L, c, cap, y);
          const b = reviewReward(L, c, cap, y);
          const p = reviewPayout(L, c, cap, y, 0);
          const pm = reviewPayout(L, c, cap, y, 25);
          if (a !== b || p.review !== a) {
            exact = false;
            where = `L${L} c${c} cap${cap} y${y}: ${a} vs ${b}`;
          }
          if (p.base !== reviewLevelBase(L) || p.comboMultiplier !== comboMultiplier(c, cap) || p.total !== p.review || pm.total !== pm.review + 25) parts = false;
        }
      }
    }
  }
  check("payout: reviewReward is bit-for-bit the pre-redesign formula (22 levels × 12 combos × 7 caps × 8 yields)", exact, where);
  check("payout: reviewPayout's parts multiply to exactly what is paid; the mastery lump is added, never multiplied", parts);

  let label = true;
  let labelWhere = "";
  for (const cap of [0, 5, COMBO_CAP, 13, 18, 20, 25]) {
    for (let c = 0; c <= 30; c++) {
      const v = comboView(c, cap, "ask");
      const paid = reviewPayout(6, c, cap, 1.2).comboMultiplier;
      const after = comboView(c + 1, cap, "answered");
      const ok =
        v.multiplier === paid &&
        v.text === `×${paid.toFixed(2)}` &&
        (v.when === "capped") === comboIsCapped(c, cap) &&
        (comboIsCapped(c, cap) || v.when === "on this card") &&
        after.multiplier === comboMultiplier(c + 1, cap) &&
        (after.when === "capped" || after.when === "next card") &&
        v.chain === Math.min(CHAIN_MAX, cap) &&
        v.lit <= v.chain;
      if (!ok) {
        label = false;
        labelWhere = `cap ${cap} combo ${c}`;
      }
    }
  }
  check("combo label: the multiplier printed equals the one paid, for every cap modifier (FATIGUED 5, default 10, MOMENTUM 18 …)", label, labelWhere);
  check("combo label: combo 3 reads ×1.15 on this card, then ×1.20 next card", comboView(3).text === "×1.15" && comboView(3).when === "on this card" && comboView(4, COMBO_CAP, "answered").text === "×1.20" && comboView(4, COMBO_CAP, "answered").when === "next card");
  check("combo label: 'capped' at the ceiling (10 by default)", comboView(10).when === "capped" && comboView(12).text === "×1.50" && comboView(9).when === "on this card");
  check("combo label: FATIGUED to a 0 ceiling pays ×1.00 and draws no chain", comboView(4, 0).multiplier === 1 && comboView(4, 0).chain === 0);
}

// ── 3. True facts ────────────────────────────────────────────────────────
{
  const base: FactInput = {
    correct: true,
    today: "2026-10-01",
    history: [],
    addedDay: "2026-03-14",
    levelBefore: 6,
    levelAfter: 7,
    failedAttemptsBefore: 0,
    mastered: false,
    overdueDays: 0,
    intervalDays: 26,
  };
  const h = (rows: [string, HistoryEntry["mark"]][]): HistoryEntry[] => rows.map(([day, mark]) => ({ day, mark }));

  const gap = trueFactOf({ ...base, history: h([["2026-03-14", "added"], ["2026-05-02", "pass"], ["2026-05-20", "pass"], ["2026-08-28", "pass"]]) });
  check("facts: a gap reads 'Recalled after 34 days' with the real next interval", gap.kind === "gap" && gap.headline === "Recalled after 34 days" && gap.detail === "Next review in 26 days" && gap.gapDays === 34 && !gap.longestGap, JSON.stringify(gap));

  const longest = trueFactOf({ ...base, history: h([["2026-09-01", "added"], ["2026-09-02", "pass"], ["2026-09-06", "pass"]]) });
  check("facts: the longest gap yet is called out only when it beats every earlier gap", longest.longestGap && longest.detail.startsWith("Longest gap yet for this idea"), longest.detail);

  const cleared = trueFactOf({ ...base, levelBefore: 9, levelAfter: 10, history: h([["2026-08-01", "pass"], ["2026-09-19", "miss"]]) });
  check("facts: a pass after a miss is 'First clean recall after a miss' and names the miss's day", cleared.kind === "clean-after-miss" && cleared.detail.startsWith("The miss on 19 Sep is cleared") && cleared.clearedMissDay === "2026-09-19", cleared.detail);

  const rescued = trueFactOf({ ...base, overdueDays: 3, history: h([["2026-08-01", "pass"]]) });
  check("facts: an overdue card recalled is 'Rescued, 3 days overdue'", rescued.kind === "rescued" && rescued.headline === "Rescued, 3 days overdue" && rescued.detail.startsWith("Recalled after 61 days"), rescued.detail);

  const mastered = trueFactOf({ ...base, levelBefore: 11, levelAfter: 12, mastered: true, intervalDays: 160, history: h([["2026-06-01", "pass"]]) });
  check("facts: mastery wins over everything else", mastered.kind === "mastered" && mastered.headline === `Mastered · level ${MASTERY_LEVEL} of ${MASTERY_LEVEL}`, mastered.headline);

  const near = trueFactOf({ ...base, levelBefore: 10, levelAfter: 11, history: h([["2026-09-01", "pass"]]) });
  check("facts: level 11 says 'one clean recall from mastery'", near.detail.toLowerCase().includes("one clean recall from mastery"), near.detail);

  const first = trueFactOf({ ...base, levelBefore: 1, levelAfter: 2, addedDay: "2026-09-28", intervalDays: 2 });
  check("facts: a first recall with no ledger history says when it was added", first.kind === "first" && first.headline === "First recall" && first.detail === "Added 3 days ago · next review in 2 days", first.detail);

  const lvl = trueFactOf({ ...base, levelBefore: 5, levelAfter: 6, addedDay: null });
  check("facts: with no history and no add day it says only what is known", lvl.kind === "level" && lvl.headline === "Level 5 → 6" && lvl.gapDays === null);

  const strike = trueFactOf({ ...base, correct: false, intervalDays: 1, miss: { kind: "strike", strike: 1, limit: 3 } });
  check("facts: a strike waits and says what is (not) taken", strike.headline === "Not this time" && strike.detail === "Back tomorrow · strike 1 of 3 · nothing else is taken", strike.detail);
  const degraded = trueFactOf({ ...base, correct: false, miss: { kind: "degraded", levelBefore: 6, levelAfter: 5 } });
  check("facts: a degradation says exactly what it costs", degraded.kind === "degraded" && degraded.detail.includes("level 6 → 5") && degraded.detail.includes("10%"));
  const shielded = trueFactOf({ ...base, correct: false, miss: { kind: "shielded", skillName: "Ward of Patience", level: 6 } });
  check("facts: a ward save is a held beat, naming the ward", shielded.kind === "shielded" && shielded.detail.includes("Ward of Patience held level 6"));
  check("facts: deterministic (same history, same sentence)", eq(trueFactOf({ ...base, history: h([["2026-08-28", "pass"]]) }), trueFactOf({ ...base, history: h([["2026-08-28", "pass"]]) })));

  check(
    "facts: ledger details map to pass/miss (srs.ts writes and the backfill)",
    reviewMarkOf("advanced") === "pass" &&
      reviewMarkOf("advanced · mastered") === "pass" &&
      reviewMarkOf("strike") === "miss" &&
      reviewMarkOf("degraded") === "miss" &&
      reviewMarkOf("shielded") === "miss" &&
      reviewMarkOf("backfill: passed review") === "pass" &&
      reviewMarkOf(null) === "pass"
  );
  const hist = historyOf(
    [
      { source: "REVIEW", detail: "advanced", day: "2026-05-02" },
      { source: "IDEA_CREATE", detail: null, day: "2026-03-14" },
      { source: "REVIEW", detail: "strike", day: "2026-09-19" },
    ],
    "2026-03-20"
  );
  check("facts: historyOf orders by day and takes the ledger's own add day", eq(hist, [
    { day: "2026-03-14", mark: "added" },
    { day: "2026-05-02", mark: "pass" },
    { day: "2026-09-19", mark: "miss" },
  ]));
  check("facts: shortDay is pure calendar text", shortDay("2026-09-19") === "19 Sep" && shortDay("2026-01-02") === "2 Jan");

  const card = (title: string, fact: FactInput, next: string | null): SessionCardFact => ({
    title,
    correct: fact.correct,
    fact: trueFactOf(fact),
    levelAfter: fact.levelAfter,
    nextDueDay: next,
    mastered: fact.mastered,
  });
  const lines = sessionFactsOf([
    card("Coin tosses", { ...base, history: h([["2026-08-28", "pass"]]) }, "2026-10-27"),
    card("Bayes' rule", { ...base, levelBefore: 10, levelAfter: 11, history: h([["2026-09-19", "miss"]]) }, "2026-10-09"),
    card("Mode vs median", { ...base, correct: false, miss: { kind: "strike", strike: 1, limit: 2 } }, "2026-10-02"),
  ]);
  check(
    "facts: the recap's true facts come from this session only, in a fixed order, at most four",
    lines.length <= 4 &&
      lines[0].before === "Longest gap recalled: " &&
      lines[0].strong === "34 days" &&
      lines.some((l) => l.strong === "Bayes' rule" && l.after.includes("One clean recall on 9 Oct masters it")) &&
      lines.some((l) => l.strong === "1 earlier miss"),
    JSON.stringify(lines)
  );
  check("facts: a session with nothing notable states nothing", sessionFactsOf([]).length === 0);
}

// ── 4. The quest ─────────────────────────────────────────────────────────
{
  let parity = true;
  let where = "";
  for (const d of [null, 0, 5, 14, 15, 16, 17, 40]) {
    for (let r = 0; r <= 20; r++) {
      for (const due of [0, 1, 9, 15, 30]) {
        const m1 = questOf({ dayOpenQty: d, reviews: r, dueNow: due, reviewXp: 0 });
        if (questTargetOf(d, r, due) !== Math.min(REVIEW_QUEST_CARDS, m1.target)) {
          parity = false;
          where = `dayOpen ${d} reviews ${r} due ${due}`;
        }
      }
    }
  }
  check("quest: the hub's target is exactly the Today board's (today-board questOf), capped at 15", parity, where);
  check("quest: 17 due at day open is a 15-card quest; a 9-card morning stays 9", questTargetOf(17, 0, 17) === 15 && questTargetOf(9, 0, 9) === 9 && REVIEW_QUEST_CARDS === 15);
  check("quest: cleared at the target, never at 0 of 0", questStateOf(15, 15).cleared && !questStateOf(14, 15).cleared && !questStateOf(0, 0).cleared);
  check("quest: 'about N minutes' at twenty seconds a card", minutesFor(17) === 6 && minutesFor(1) === 1 && minutesFor(0) === 1);
}

// ── 5. Bosses ────────────────────────────────────────────────────────────
{
  let agree = true;
  let where = "";
  for (let tier = 1; tier <= 40; tier++) {
    for (let total = 1; total <= 20; total++) {
      const need = bossNeedCorrect(tier, total);
      for (let c = 0; c <= total; c++) {
        // The resolver: `if (accuracy < required)` → defeat.
        const resolverWins = !(c / total < bossRequiredAccuracy(tier));
        if ((c >= need) !== resolverWins || bossWins(tier, c, total) !== resolverWins) {
          agree = false;
          where = `tier ${tier} total ${total} correct ${c}`;
        }
      }
    }
  }
  check("boss: 'need N' agrees with the resolver's verdict for every tier (1–40), size and score", agree, where);
  let ceilAgrees = true;
  for (let tier = 1; tier <= 40; tier++) for (let total = 1; total <= 20; total++) if (bossNeedCorrect(tier, total) !== Math.ceil(bossRequiredAccuracy(tier) * total)) ceilAgrees = false;
  check("boss: today's curve gives the same need as ceil(required × total) everywhere (tier 1, 10 cards: 7)", ceilAgrees && bossNeedCorrect(1, 10) === 7);
  const t5 = bossBatchSize(5);
  check("boss: tier 5 is 9 cards, need 8 (80%)", t5 === 9 && bossNeedCorrect(5, t5) === 8);
  const v = bossView(3, 7, 9);
  check("boss: the bar reads 'need 7 of 9 · 3 so far' and holds 4/7", v.text === "need 7 of 9 · 3 so far" && Math.abs(v.remaining - 4 / 7) < 1e-12);
  // The bar is a function of correct answers only: a miss leaves it where it was.
  const seq = [true, false, true, false, false, true];
  let hits = 0;
  let moves = true;
  let prev = bossView(0, 7, 9).remaining;
  for (const ok of seq) {
    if (ok) hits++;
    const now = bossView(hits, 7, 9).remaining;
    if (ok ? !(now < prev) : now !== prev) moves = false;
    prev = now;
  }
  check("boss: the bar drops only on a correct answer", moves);
  check("boss: a boon claim outlives its window (every boon lasts ≥ BOSS_BOON_CLAIM_HOURS)", BOON_KINDS.every((k) => BOON_META[k].durationHours >= BOSS_BOON_CLAIM_HOURS));
  const vAt = new Date("2026-10-01T00:00:00Z");
  check("boss: claimUntil is the victory plus the window", boonClaimUntil(vAt).getTime() - vAt.getTime() === BOSS_BOON_CLAIM_HOURS * 3_600_000);
  check(
    "boss: one claim per victory (exact reason; a legacy drawn boon after the victory also counts)",
    claimsVictory({ reason: bossSpoilsReason("f1", vAt), createdAt: vAt }, "f1", vAt) &&
      !claimsVictory({ reason: bossSpoilsReason("f2", vAt), createdAt: vAt }, "f1", vAt) &&
      claimsVictory({ reason: "BOSS_SPOILS", createdAt: new Date(vAt.getTime() + 1000) }, "f1", vAt) &&
      !claimsVictory({ reason: "BOSS_SPOILS", createdAt: new Date(vAt.getTime() - 1000) }, "f1", vAt)
  );
  const bossesSrc = code(read("src/lib/bosses.ts"));
  const boonsSrc = code(read("src/lib/boons.ts"));
  check("boss: boons are chosen, never drawn (no drawBoon, no Math.random in boons.ts)", !/drawBoon/.test(bossesSrc + boonsSrc) && !/Math\.random/.test(boonsSrc));
  check("boss: the victory grants no boon by itself; claimBossBoon does, once", !/grantBoon\(userId,\s*drawBoon/.test(bossesSrc) && /export async function claimBossBoon/.test(bossesSrc));
  check("debuffs: every penalty says how it clears", DEBUFF_KINDS.every((k) => DEBUFF_META[k].clears.length > 10));
}

// ── 6. The model, the receipt and the fixtures ──────────────────────────────
{
  const fx = reviewFixtures();
  const results: CardResult[] = fx.results;
  const credited = results.reduce((s, r) => s + (r.result.outcome.outcome === "advanced" ? r.result.outcome.pointsAwarded : 0), 0);
  const rc = receiptOf(results);
  check("receipt: the session total is exactly what was credited", rc.total === credited && tallyOf(results).pts === credited);
  check("receipt: a miss pays 0.0 and says so", rc.rows.filter((r) => !r.correct).every((r) => r.paid === 0 && r.combo === null));
  check("receipt: one yield on every paid card is printed once", rc.yieldAll === 1.2);
  let formulas = true;
  for (const r of results) {
    const o = r.result.outcome;
    if (o.outcome !== "advanced") continue;
    const f = formulaOf(o.payout);
    const product = o.payout.base * o.payout.comboMultiplier * o.payout.yieldMultiplier + o.payout.masteryBonus;
    if (!f.endsWith(`= ${o.payout.total.toFixed(2)}`) || Math.abs(product - o.pointsAwarded) > 1e-9) formulas = false;
  }
  check("result: every printed formula ends in the exact amount paid", formulas);
  check("result: the formula names only the factors that were paid", formulaOf(reviewPayout(3, 2, 10, 1)) === "2.72 base × 1.10 combo = 2.99");
  check("tally: best combo and correct count", tallyOf(results).correct === 5 && tallyOf(results).bestCombo === 5 && tallyOf(results).answered === 6);
  check("segments: answered on/miss, current outlined", eq(segmentsOf(results.slice(0, 2), 5, 2), ["on", "on", "cur", "off", "off"]) && segmentsOf(results, 6, 6)[5] === "miss");
  check("quest in the runner: the server's figure wins once there is one", questNow({ done: 9, target: 15 }, []).done === 9 && questNow({ done: 9, target: 15 }, results).done === 15 && questNow({ done: 9, target: 15 }, results).cleared);
  check("recap: a Seal L3 returned covers its level row; without one the plain fact shows", levelRowsOf(results, [fx.seal]).every((r) => !r.key.startsWith("domain:fx-prob")) && levelRowsOf(results, []).some((r) => r.key === "domain:fx-prob"));
  check("recap: a multiple choice is named by its question", cardTitle(fx.cards[3]).startsWith("A fair coin") && cardTitle(fx.cards[0]) === fx.cards[0].preview);
  check("recap: session facts read the run's own results", sessionCardFacts(results).length === results.length);
  check("fixtures: the fixture Seal passes the honesty rule", honestyProblem(fx.seal) === null, String(honestyProblem(fx.seal)));

  const items = Array.from({ length: 12 }, (_, i) => i);
  const a = seededOrder(items, "2026-10-01:ALL");
  const b = seededOrder(items, "2026-10-01:ALL");
  const c = seededOrder(items, "2026-10-02:ALL");
  check("queue: the order is seeded (same day and scope, same order; server and browser agree)", eq(a, b) && !eq(a, c) && [...a].sort((x, y) => x - y).every((v, i) => v === i));
}

// ── 7. Source rules ──────────────────────────────────────────────────────
{
  const walk = (d: string, out: string[] = []) => {
    for (const f of readdirSync(join(ROOT, d))) {
      const p = join(d, f);
      if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
      else out.push(p.replace(/\\/g, "/"));
    }
    return out;
  };
  const src = walk("src").filter((f) => /\.(ts|tsx)$/.test(f));
  const hits = (re: RegExp) => src.filter((f) => re.test(code(read(f)))).map((f) => relative(ROOT, join(ROOT, f)));
  check("honesty: no AFFIRMATIONS anywhere in src", hits(/AFFIRMATIONS/).length === 0, hits(/AFFIRMATIONS/).join(", "));
  check("honesty: no 'Strong roll', no VARIANCE_*, no RewardBand anywhere in src", hits(/Strong roll|VARIANCE_|RewardBand|rewardBand/).length === 0, hits(/Strong roll|VARIANCE_|RewardBand|rewardBand/).join(", "));

  const srs = code(read("src/lib/srs.ts"));
  const apply = srs.slice(srs.indexOf("export async function applyReviewResult"), srs.indexOf("export async function degradeOverdueIdeas"));
  check("srs: the review path never calls the roll", !/rollRewardVariance\s*\(/.test(srs));
  check("srs: a pass writes its REVIEW row (sink DOMAIN, xp = the credit) inside the points transaction", /ops\.push\(activityOp\(userId, review\)\)/.test(apply) && /reviewEvent\(ideaId, now, pointsAwarded/.test(apply) && /await prisma\.\$transaction\(ops\)/.test(apply) && /source: "REVIEW", sink: "DOMAIN"/.test(srs));
  check("srs: a miss writes its xp-0 REVIEW row in after(), off the answer's path", /after\(async \(\) => \{\s*if \(lateOutcome\) \{\s*await recordActivity\(userId, reviewEvent\(ideaId, now, 0, lateOutcome\)\);/.test(apply));
  check("srs: field activity and study tasks still follow every landed review", /recordFieldActivity\(userId, domainBefore\.fieldId, now\)/.test(apply) && /autoCompleteStudyTasks\(userId, now\)/.test(apply));
  check("srs: mastery is minted in the same transaction (fraction always, lump on mastery)", /ops\.push\(mintReviewFractionOp\(/.test(apply) && /ops\.push\(mintIdeaMasteryOp\(/.test(apply));
  // after() callbacks run once the answer is sent; their awaits are not on the answer's path.
  const beforeWrite = apply.slice(0, apply.indexOf("await prisma.$transaction(ops)")).replace(/after\(async \(\) => \{[\s\S]*?\n {2}\}\);/g, "");
  check("srs: one read wave before the write (the Idea+Domain+Field join and progression, together)", (beforeWrite.match(/await /g) ?? []).length === 1 && /Promise\.all\(\[\s*readReviewIdea\(ideaId\)/.test(beforeWrite) && /relationLoadStrategy: "join"/.test(srs) && !/domain\.findUniqueOrThrow/.test(srs));
  const action = code(read("src/app/actions/review.ts"));
  const submit = action.slice(action.indexOf("export async function submitReview"));
  const toApply = submit.slice(0, submit.indexOf("await applyReviewResult("));
  check("action: one read wave before grading and the write (a single Promise.all)", (toApply.match(/await /g) ?? []).length === 1 && /await Promise\.all\(\[/.test(toApply));
  check("action: grading stays on the server; the answer returns only after it", /verifyAnswer\(idea\.questionType, input\.userAnswer, idea\.answer\)/.test(submit) && submit.indexOf("verifyAnswer(") < submit.indexOf("expected:"));
  check("action: L3's detectCelebrations runs after the write and cannot fail the answer", /detectCelebrations\(before, afterSnap/.test(submit) && /\.catch\(\(\) => \[\]\)/.test(submit));

  const route = [...walk("src/components/workspace"), ...walk("src/app/review")];
  const withRandom = route.filter((f) => /\.(ts|tsx)$/.test(f) && /Math\.random/.test(code(read(f))));
  check("route: no Math.random in the review route (order is seeded; payouts are fixed)", withRandom.length === 0, withRandom.join(", "));
  const withFramer = route.filter((f) => /\.(ts|tsx)$/.test(f) && /from "framer-motion"/.test(read(f)));
  check("route: framer-motion is not imported by the review route", withFramer.length === 0, withFramer.join(", "));
  const page = code(read("src/app/review/page.tsx"));
  const cardMap = page.slice(page.indexOf(".map((idea) => ({"), page.indexOf("overdue: daysUntilDue"));
  check("route: the page never hands an answer to the client (question side only)", cardMap.length > 0 && !/\banswer\b/.test(cardMap) && !/corePremise/.test(page));
  const css = read("src/components/workspace/review.css");
  check("css: review.css starts with the layer order and lives in @layer components", css.split(/\r?\n/)[0].trim() === "@layer theme, base, components, art, effects, utilities;" && /@layer components \{/.test(css));
  check("css: review.css has no keyframes, no animation and no !important (motion goes through the gateway)", !/@keyframes|animation\s*:|!important/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")));
  const transitions = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1]);
  const allowed = /^(transform|opacity|visibility|background-color|border-color)\b/;
  check("css: review.css transitions only transform, opacity and colour", transitions.every((t) => t.split(/,(?![^(]*\))/).every((p) => allowed.test(p.trim()))), transitions.join(" | "));
}

// ── 8. The review fixes (F2) ────────────────────────────────────────────────
{
  // Snapshots: scoped (4 queries, not ~10), the same scope before and after.
  const action = code(read("src/app/actions/review.ts"));
  const boss = code(read("src/app/actions/bosses.ts"));
  const calls = (src: string) => [...src.matchAll(/captureSnapshot\(([^)]*)\)/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
  check("snapshot: both review snapshots take { scope: \"review\" }", eq(calls(action), ['userId, { scope: "review" }', 'userId, { scope: "review" }']), calls(action).join(" | "));
  check("snapshot: both boss snapshots take { scope: \"boss\" }", eq(calls(boss), ['userId, { scope: "boss" }', 'userId, { scope: "boss" }']), calls(boss).join(" | "));

  // In-run Seals: one implementation (L3's SealCard, which marks itself seen), and the recap marks the merged ones seen.
  const panel = code(read("src/components/workspace/ResultPanel.tsx"));
  const recap = code(read("src/components/workspace/SessionComplete.tsx"));
  const view = code(read("src/components/workspace/WorkspaceView.tsx"));
  const sealCard = code(read("src/components/celebrate/SealCard.tsx"));
  check("seal: RunSeal (a second Seal implementation that never marked seen) is gone", !existsSync(join(ROOT, "src/components/workspace/RunSeal.tsx")) && !/RunSeal/.test(panel + recap + view));
  check("seal: the result panel renders L3's <SealCard inline announce/>, which acks on mount", /<SealCard ev=\{ev\} inline announce \/>/.test(panel) && /if \(inline\) ackShown\(\[ev\]\)/.test(sealCard));
  check(
    "seal: the in-panel Seal still sounds, buzzes and speaks once per id (merged Seals skip the presenter); the panel adds no second copy",
    /if \(inline && announce && animate && firstAnnouncement\(ev\.id\)\) \{\s*sound\("seal"\);\s*haptic\("seal"\);/.test(sealCard) && !/\bsound\(|\bhaptic\(/.test(panel)
  );
  check("seal: the recap marks the run's merged Seals seen when it mounts", /ackShown\(merged\)/.test(recap) && /import \{ ackShown \} from "@\/components\/celebrate\/stage"/.test(recap));
  const finish = view.slice(view.indexOf("function finish("), view.indexOf("function next("));
  check("seal: closing the run marks its merged Seals seen (backstop)", /const merged = closeRun\(\);\s*ackShown\(merged\);/.test(finish));
  check("seal: recap rows use the Seal's own face (a diamond for a rung, PR for a record)", /medalFace\(ev\)/.test(recap));
  // The fixtures now render the real acking SealCard: a fixture id must never look like a server row id.
  check("seal: the /dev/style/review Seal can never be acked against the account (its id is not a row id)", !/^[a-z0-9]{8,40}$/i.test(reviewFixtures().seal.id), reviewFixtures().seal.id);

  // One "Today kept" per run: the detector's T1 is not chimed again.
  const t2 = makeEvent("domain-level", "row1", { eyebrow: "Domain", title: "Probability reached level 7", numeral: { from: 6, to: 7 } });
  const t1 = makeEvent("day-kept", "t1:day:2026-10-01", { eyebrow: "Day kept", title: "Day 24 kept", numeral: { from: 23, to: 24 } });
  const t3 = makeEvent("title", "row3", { eyebrow: "Title", title: "Adept", numeral: { from: 9, to: 10 } });
  check(
    "t1: a detector's day-kept T1 is ignored (the runner owns the chime); T2 and T3 are queued",
    celebrationRoute(t1) === "ignore" && celebrationRoute(t2) === "enqueue" && celebrationRoute(t3) === "enqueue"
  );
  check(
    "t1: the review page never chimes a returned T1 (answers and the boss verdict both route through celebrationRoute)",
    !/\bchime\(/.test(view) && !/ev\.tier === 1/.test(view) && (view.match(/celebrationRoute\(ev\) === "enqueue"/g) ?? []).length === 2
  );
  const fx = reviewFixtures();
  const withT1 = (i: number, evs: CelebrationEvent[]): CardResult => ({ ...fx.results[i], result: { ...fx.results[i].result, streakSecured: i === 0, celebrations: evs } });
  check(
    "t1: the streak printed is the detector's own figure when its T1 came back, else the hub's",
    keptStreakOf({ celebrations: [t1] }, 99) === 24 && keptStreakOf({ celebrations: [] }, 7) === 7 && keptStreakOf(null, null) === null
  );
  check(
    "t1: the recap's Day kept row shows once the session kept the day, with the detector's figure",
    eq(dayKeptOf([withT1(0, []), withT1(1, [t1])], 5), { streak: 24 }) &&
      eq(dayKeptOf([withT1(0, [])], 5), { streak: 5 }) &&
      dayKeptOf([{ ...fx.results[1], result: { ...fx.results[1].result, streakSecured: false, celebrations: [] } }], 5) === null
  );

  // The dock guard: a key aimed at a toast or a Seal in the shared dock never skips a result.
  const runner = code(read("src/components/workspace/ReviewRunner.tsx"));
  check("keys: the runner ignores keys from the capture sheet and the toast/Seal dock", /target\.closest\("\[data-capture-ui\], \.dock"\)/.test(runner));

  // One loadout strip: L4's, rendered on the server and handed to the hub.
  const hub = code(read("src/components/workspace/ReviewHub.tsx"));
  const page = code(read("src/app/review/page.tsx"));
  const clientFiles = readdirSync(join(ROOT, "src/components/workspace"))
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => `src/components/workspace/${f}`);
  check("strip: the hub has no loadout strip of its own", !/function LoadoutStrip/.test(hub) && !/rv-strip/.test(read("src/components/workspace/review.css")));
  check(
    "strip: the page renders L4's LoadoutStrip from the progression it already read",
    /import \{ LoadoutStrip \} from "@\/components\/skills\/LoadoutStrip"/.test(page) && /<LoadoutStrip slots=\{progression\.loadout\.map\(/.test(page) && /loadoutStrip=\{loadoutStrip\}/.test(page)
  );
  check("strip: no client component in the review route imports it (that module reaches Prisma)", clientFiles.every((f) => !/from "@\/components\/skills\/LoadoutStrip"/.test(code(read(f)))));
  check("effects: boons (held) and penalties (owed) sit in one 'In effect on a review' card", /In effect on a review/.test(hub) && (hub.match(/tone="owed"/g) ?? []).length === 1 && /<Chip tone="held" icon="star">/.test(hub));

  // Errors are ink, never --owed (which reports debt only).
  const css = read("src/components/workspace/review.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const alertRule = css.match(/\.rv-alert \{[^}]*\}/)?.[0] ?? "";
  check("errors: .rv-alert is ink at weight 600, with no --owed", alertRule.length > 0 && !/--owed/.test(alertRule) && /color: var\(--ink-0\)/.test(alertRule) && /font: 600/.test(alertRule));
  check("seal: the in-panel Seal's wrapper is a grid, so the card is a block box whatever its modifier class computes to", /\.rv-seal \{[^}]*display: grid/.test(css));

  // /workspace: a real HTTP redirect before any render (a page-level redirect() under the root
  // loading.tsx can stream as a meta refresh instead).
  const hop = workspaceRedirect(new Request("http://app.test/workspace?view=run"));
  check(
    "redirect: /workspace is a route handler answering 308 → /review, query kept, with no page beside it",
    hop.status === 308 && hop.headers.get("location") === "http://app.test/review?view=run" && !existsSync(join(ROOT, "src/app/workspace/page.tsx")),
    `${hop.status} ${hop.headers.get("location")}`
  );

  // Truncated titles carry their full text.
  check("truncation: every ellipsised idea title carries a title attribute", /<b title=\{i\.title\}>/.test(hub) && /<b title=\{b\.title\}>/.test(recap) && /<td title=\{r\.title\}>/.test(recap));

  // Buttons: the lane's full-width actions (Start review, Check answer, Next card, Back to Today) are <Button block>.
  // A bare `block` class is Tailwind's display:block utility, which stacked the icon over the label.
  const laneTsx = laneFiles().filter((f) => /\.tsx$/.test(f));
  const blockProp = laneTsx.filter((f) => /<Button\b[^>]*\sblock[\s>]/.test(code(read(f))));
  const button = code(read("src/components/ui/Button.tsx"));
  check(
    "buttons: <Button block> renders .btn-block, never Tailwind's .block",
    blockProp.length >= 5 && /block && "btn-block"/.test(button) && !/block && "block"/.test(button),
    blockProp.join(", ")
  );
}

function walkFiles(d: string, out: string[] = []): string[] {
  for (const f of readdirSync(join(ROOT, d))) {
    const p = join(d, f);
    if (statSync(join(ROOT, p)).isDirectory()) walkFiles(p, out);
    else out.push(p.replace(/\\/g, "/"));
  }
  return out;
}

function laneFiles(): string[] {
  return [...walkFiles("src/components/workspace"), ...walkFiles("src/app/review"), ...walkFiles("src/app/dev/style/review")];
}

/** Every class name the review lane writes: className strings, cx() arguments and review.css selectors. */
function laneClassNames(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (token: string, file: string) => {
    if (!/^[a-z][\w-]*$/i.test(token)) return;
    if (!out.has(token)) out.set(token, new Set());
    out.get(token)!.add(file);
  };
  const strings = (expr: string, file: string) => {
    for (const q of expr.matchAll(/"([^"]*)"|'([^']*)'|`([^`$]*)`/g)) (q[1] ?? q[2] ?? q[3] ?? "").split(/\s+/).forEach((t) => add(t, file));
  };
  for (const f of laneFiles()) {
    const src = read(f);
    if (f.endsWith(".css")) {
      for (const m of src.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.([a-zA-Z][\w-]*)/g)) add(m[1], f);
      continue;
    }
    if (!/\.tsx?$/.test(f)) continue;
    const c = code(src);
    for (const m of c.matchAll(/className="([^"]*)"/g)) m[1].split(/\s+/).forEach((t) => add(t, f));
    for (const m of c.matchAll(/className=\{([^{}]*)\}/g)) strings(m[1], f);
    for (const m of c.matchAll(/\bcx\(([^()]*)\)/g)) strings(m[1], f);
  }
  return out;
}

type DesignSystem = { candidatesToCss(candidates: string[]): (string | null)[] };
type LoadDesignSystem = (
  css: string,
  opts: { base: string; loadStylesheet: (id: string, base: string) => Promise<{ path: string; base: string; content: string }> }
) => Promise<DesignSystem>;

/**
 * Tailwind v4 emits a utility for any class name it finds in the source, in
 * @layer utilities, which beats every kit rule. So a kit class named like a
 * utility (block, inline, ring, hidden, grow …) silently changes its element.
 * This asks Tailwind's own design system which of the lane's names it emits.
 */
async function tailwindCollisions(): Promise<{ hits: string[]; error: string | null }> {
  try {
    const req = createRequire(join(ROOT, "package.json"));
    const tw = req("tailwindcss") as { __unstable__loadDesignSystem: LoadDesignSystem };
    const twDir = dirname(req.resolve("tailwindcss/package.json"));
    const ds = await tw.__unstable__loadDesignSystem('@import "tailwindcss";', {
      base: ROOT,
      loadStylesheet: async (id) => {
        const p = id === "tailwindcss" ? join(twDir, "index.css") : join(twDir, id.replace(/^tailwindcss\//, ""));
        const file = p.endsWith(".css") ? p : `${p}.css`;
        return { path: file, base: dirname(file), content: readFileSync(file, "utf8") };
      },
    });
    const names = laneClassNames();
    // sr-only is used AS the utility (the same rule the kit would write).
    const list = [...names.keys()].filter((n) => n !== "sr-only");
    const out = ds.candidatesToCss(list);
    const known = ds.candidatesToCss(["block", "inline", "ring", "rv-panel"]);
    if (!known[0] || !known[1] || !known[2] || known[3]) return { hits: [], error: "the Tailwind probe does not recognise block/inline/ring" };
    return { hits: list.filter((_, i) => out[i]).map((n) => `${n} (${[...names.get(n)!].join(", ")})`), error: null };
  } catch (err) {
    return { hits: [], error: String(err) };
  }
}

void tailwindCollisions().then(({ hits, error }) => {
  check("classes: no class name in the review lane is also a Tailwind utility (block, inline, ring, grow …)", error == null && hits.length === 0, error ?? hits.join("; "));
  const names = laneClassNames();
  check("classes: the scan sees the lane's names (rv-panel, rv-alert, rv-seal, rv-effect)", ["rv-panel", "rv-alert", "rv-seal", "rv-effect"].every((n) => names.has(n)) && names.size > 100, String(names.size));
  console.log(`\nreview-check: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
