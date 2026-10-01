/**
 * /dev/style/review fixtures (L2). Server-side only: imported by the gated
 * page, never by a client component.
 *
 * The rows are made up; every figure derived from them is not. Payouts come
 * from xp.ts reviewPayout, mastery from mastery.ts, true facts from
 * review-facts.ts, boss deals from bosses.ts — the same functions the live
 * runner is paid and described by — so the fixtures cannot show a number
 * the real formulas would not produce. No real page ever shows these.
 */
import type { SubmitReviewResult } from "@/app/actions/review";
import type { BossResolution, BossState } from "@/lib/bosses";
import { BOSS_UNLOCK_LEVEL, bossBatchSize, bossFor, bossMasteryReward, bossNeedCorrect, bossRequiredAccuracy, boonClaimUntil } from "@/lib/bosses";
import { BOON_KINDS, BOON_META } from "@/lib/boon-meta";
import type { CelebrationEvent } from "@/lib/celebration-types";
import { addDays, type DayKey } from "@/lib/life-day";
import { medallionMaterial } from "@/lib/materials";
import { IDEA_MASTERY_POINTS, comboMasteryBonus, reviewMasteryFraction } from "@/lib/mastery";
import { historyOf, trueFactOf, type HistoryRow } from "@/lib/review-facts";
import { COMBO_CAP, MASTERY_BONUS, MASTERY_LEVEL, comboMultiplier, domainLevelProgress, reviewPayout } from "@/lib/xp";
import { formatAmount, formatNumber } from "@/components/ui/format";
import type { CardResult, RunCard } from "@/components/workspace/review-model";
import type { RecentIdea, ReviewEffects } from "@/components/workspace/ReviewHub";
import type { StripSlot } from "@/components/skills/LoadoutStrip";
import { SKILL_POOL } from "@/lib/skill-pool";

export const FX_TODAY: DayKey = "2026-10-01";
const NOW = new Date("2026-10-01T08:41:00+10:00");
const YIELD = 1.2;

export const FX_CARDS: RunCard[] = [
  { id: "fx-1", level: 1, questionType: "SHORT", question: "Expected value of a fair die", preview: "Expected value of a fair die", prompt: null, domainName: "Probability", fieldName: "Statistics", lastSeenDay: "2026-09-30", overdue: false },
  { id: "fx-2", level: 4, questionType: "SHORT", question: "Bayes' rule, the basic form", preview: "Bayes' rule, the basic form", prompt: null, domainName: "Probability", fieldName: "Statistics", lastSeenDay: "2026-09-24", overdue: false },
  { id: "fx-3", level: 2, questionType: "NUMERIC", question: JSON.stringify({ prompt: "Median of 3, 8, 10, 15", unit: null }), preview: "Median of 3, 8, 10, 15", prompt: null, domainName: "Descriptive statistics", fieldName: "Statistics", lastSeenDay: "2026-09-29", overdue: false },
  {
    id: "fx-4",
    level: 6,
    questionType: "MULTI",
    question: JSON.stringify(["1/2", "63/256", "5/10", "1/1024"]),
    preview: "1/2 · 63/256 · 5/10 · 1/1024",
    prompt: "A fair coin is tossed 10 times. What is the probability of exactly 5 heads?",
    domainName: "Combinatorics",
    fieldName: "Statistics",
    lastSeenDay: "2026-08-28",
    overdue: false,
  },
  {
    id: "fx-5",
    level: 9,
    questionType: "MULTI",
    question: JSON.stringify(["P(B | A) · P(A) / P(B)", "P(A) · P(B)", "P(A ∩ B) / P(A)", "P(B | A) / P(A)"]),
    preview: "P(B | A) · P(A) / P(B) · P(A) · P(B) · …",
    prompt: "Which expression gives P(A | B)?",
    domainName: "Probability",
    fieldName: "Statistics",
    lastSeenDay: "2026-09-19",
    overdue: false,
  },
  {
    id: "fx-6",
    level: 3,
    questionType: "MULTI",
    question: JSON.stringify(["Mean", "Median", "Midrange", "Mode, always"]),
    preview: "Mean · Median · Midrange · Mode, always",
    prompt: "Under strong right skew, which measure of centre is least pulled by the tail?",
    domainName: "Descriptive statistics",
    fieldName: "Statistics",
    lastSeenDay: "2026-09-25",
    overdue: false,
  },
];

export const FX_ANSWERS: Record<string, string> = {
  "fx-1": "3.5",
  "fx-2": "P(A|B) = P(B|A) P(A) / P(B)",
  "fx-3": "9",
  "fx-4": "63/256",
  "fx-5": "P(B | A) · P(A) / P(B)",
  "fx-6": "Median",
};

interface Dom {
  id: string;
  name: string;
  level: number;
  points: number;
}

const DOMAINS: Record<string, Dom> = {
  Probability: { id: "fx-prob", name: "Probability", level: 6, points: 2380 },
  Combinatorics: { id: "fx-comb", name: "Combinatorics", level: 4, points: 1100 },
  "Descriptive statistics": { id: "fx-desc", name: "Descriptive statistics", level: 5, points: 1180 },
};

function history(rows: [DayKey, string, string | null][]): HistoryRow[] {
  return rows.map(([day, source, detail]) => ({ day, source, detail }));
}

/** A passed review, priced and described by the real functions. */
function pass(card: RunCard, combo: number, hist: HistoryRow[], opts: { domainLevelAfter?: number; interval: number } = { interval: 1 }): SubmitReviewResult {
  const d = DOMAINS[card.domainName];
  const newLevel = card.level + 1;
  const mastered = newLevel === MASTERY_LEVEL;
  const payout = reviewPayout(card.level, combo, COMBO_CAP, YIELD, mastered ? MASTERY_BONUS : 0);
  const after = d.points + payout.total;
  const domainAfter = opts.domainLevelAfter ?? d.level;
  d.points = after;
  const levelBefore = d.level;
  d.level = domainAfter;
  const nextDue = new Date(NOW.getTime() + opts.interval * 86_400_000);
  return {
    correct: true,
    outcome: {
      outcome: "advanced",
      previousLevel: card.level,
      newLevel,
      domainLeveledUp: domainAfter > levelBefore,
      newDomainLevel: domainAfter,
      pointsAwarded: payout.total,
      payout,
      mastered,
      masteryMinted: reviewMasteryFraction(card.level) * comboMasteryBonus(combo) + (mastered ? IDEA_MASTERY_POINTS : 0),
      domain: {
        id: d.id,
        name: d.name,
        level: { before: levelBefore, after: domainAfter },
        totalPoints: { before: after - payout.total, after },
        progress: { before: domainLevelProgress(after - payout.total), after: domainLevelProgress(after) },
      },
      field: { id: "fx-stat", name: "Statistics", level: { before: 3, after: 3 } },
      intervalDays: opts.interval,
      nextDue: nextDue.toISOString(),
      nextCombo: combo + 1,
    },
    expected: FX_ANSWERS[card.id],
    explanation: null,
    combo: { before: combo, multiplier: payout.comboMultiplier, cap: COMBO_CAP, capped: combo >= COMBO_CAP, next: combo + 1, nextMultiplier: comboMultiplier(combo + 1) },
    trueFact: trueFactOf({
      correct: true,
      today: FX_TODAY,
      history: historyOf(hist, "2026-03-14"),
      addedDay: "2026-03-14",
      levelBefore: card.level,
      levelAfter: newLevel,
      failedAttemptsBefore: 0,
      mastered,
      overdueDays: 0,
      intervalDays: opts.interval,
    }),
    quest: { done: 0, target: 15 },
    streakSecured: false,
    nextDueDay: addDays(FX_TODAY, opts.interval),
    celebrations: [],
  };
}

function miss(card: RunCard, combo: number, hist: HistoryRow[]): SubmitReviewResult {
  return {
    correct: false,
    outcome: { outcome: "strike", failedAttempts: 1, strikeLimit: 2, nextCombo: 0, nextDue: new Date(NOW.getTime() + 86_400_000).toISOString() },
    expected: FX_ANSWERS[card.id],
    explanation:
      "The median depends only on rank order, so the long tail moves it by at most a position. The mode is not defined for continuous data without binning.",
    combo: { before: combo, multiplier: 1, cap: COMBO_CAP, capped: false, next: 0, nextMultiplier: 1 },
    trueFact: trueFactOf({
      correct: false,
      today: FX_TODAY,
      history: historyOf(hist, "2026-09-02"),
      addedDay: "2026-09-02",
      levelBefore: card.level,
      levelAfter: card.level,
      failedAttemptsBefore: 0,
      mastered: false,
      overdueDays: 0,
      intervalDays: 1,
      miss: { kind: "strike", strike: 1, limit: 2 },
    }),
    quest: { done: 0, target: 15 },
    streakSecured: false,
    nextDueDay: addDays(FX_TODAY, 1),
    celebrations: [],
  };
}

export interface ReviewFixtureData {
  cards: RunCard[];
  results: CardResult[];
  /** The Seal L3's detectors would return for card 5 (Probability → level 7). */
  seal: CelebrationEvent;
  questStart: { done: number; target: number };
  bosses: BossState[];
  boss: { fieldId: string; name: string; need: number; total: number };
  bossVictory: Exclude<BossResolution, { outcome: "rejected" }>;
  effects: ReviewEffects;
  recent: RecentIdea[];
}

export function reviewFixtures(): ReviewFixtureData {
  // Reset the running domain totals so every render computes the same figures.
  DOMAINS.Probability = { id: "fx-prob", name: "Probability", level: 6, points: 2380 };
  DOMAINS.Combinatorics = { id: "fx-comb", name: "Combinatorics", level: 4, points: 1100 };
  DOMAINS["Descriptive statistics"] = { id: "fx-desc", name: "Descriptive statistics", level: 5, points: 1180 };

  const [c1, c2, c3, c4, c5, c6] = FX_CARDS;
  const r1 = pass(c1, 0, history([["2026-09-30", "REVIEW", "advanced"]]), { interval: 2 });
  const r2 = pass(c2, 1, history([["2026-09-17", "REVIEW", "advanced"], ["2026-09-24", "REVIEW", "advanced"]]), { interval: 12 });
  const r3 = pass(c3, 2, history([["2026-09-27", "REVIEW", "advanced"], ["2026-09-29", "REVIEW", "advanced"]]), { interval: 4 });
  const r4 = pass(
    c4,
    3,
    history([
      ["2026-05-02", "REVIEW", "advanced"],
      ["2026-05-20", "REVIEW", "advanced"],
      ["2026-08-28", "REVIEW", "advanced"],
    ]),
    { interval: 26 }
  );
  const r5 = pass(
    c5,
    4,
    history([
      ["2026-08-01", "REVIEW", "advanced"],
      ["2026-09-19", "REVIEW", "strike"],
    ]),
    { domainLevelAfter: 7, interval: 50 }
  );
  const r6 = miss(c6, 5, history([["2026-09-25", "REVIEW", "advanced"]]));

  const adv5 = r5.outcome.outcome === "advanced" ? r5.outcome : null;
  const seal: CelebrationEvent = {
    id: "fx-seal:domain:fx-prob:7",
    tier: 2,
    kind: "domain-level",
    dedupeKey: "domain:fx-prob:7",
    facts: {
      eyebrow: "Domain level",
      title: "Probability reached level 7",
      lines: ["Statistics field stays at level 3."],
      numeral: { from: 6, to: 7 },
      material: medallionMaterial(7),
      amounts: adv5 ? [{ kind: "pts", value: adv5.pointsAwarded, label: "review pts this card" }] : undefined,
    },
    what: adv5
      ? [
          { label: "Points this card", value: formatAmount(adv5.pointsAwarded) },
          { label: "Next level", value: `8 at ${formatNumber(Math.pow(7 * 8, 2), 0)} points` },
        ]
      : [],
  };
  r5.celebrations = [seal];

  let done = 9;
  const results: CardResult[] = [r1, r2, r3, r4, r5, r6].map((result, i) => {
    done += 1;
    result.quest = { done, target: 15 };
    return { card: FX_CARDS[i], result, answer: i === 5 ? "Mean" : FX_ANSWERS[FX_CARDS[i].id] };
  });
  results[0].result.streakSecured = true;

  const tier = 5;
  const total = bossBatchSize(tier);
  const fieldId = "fx-linalg";
  const victoryAt = NOW;
  const bosses: BossState[] = [
    {
      fieldId,
      fieldName: "Linear Algebra",
      fieldLevel: 9,
      tier,
      victories: 4,
      archetype: bossFor(fieldId, tier),
      batchSize: total,
      requiredAccuracy: bossRequiredAccuracy(tier),
      needCorrect: bossNeedCorrect(tier, total),
      masteryReward: bossMasteryReward(tier),
      dueCount: 11,
      availability: { status: "ready" },
      pendingBoon: null,
    },
    {
      fieldId: "fx-econ",
      fieldName: "Economics",
      fieldLevel: 6,
      tier: 2,
      victories: 1,
      archetype: bossFor("fx-econ", 2),
      batchSize: bossBatchSize(2),
      requiredAccuracy: bossRequiredAccuracy(2),
      needCorrect: bossNeedCorrect(2, bossBatchSize(2)),
      masteryReward: bossMasteryReward(2),
      dueCount: 3,
      availability: { status: "insufficient_material", have: 3, need: bossBatchSize(2) },
      pendingBoon: null,
    },
    {
      fieldId: "fx-phil",
      fieldName: "Philosophy",
      fieldLevel: 2,
      tier: 1,
      victories: 0,
      archetype: bossFor("fx-phil", 1),
      batchSize: bossBatchSize(1),
      requiredAccuracy: bossRequiredAccuracy(1),
      needCorrect: bossNeedCorrect(1, bossBatchSize(1)),
      masteryReward: bossMasteryReward(1),
      dueCount: 1,
      availability: { status: "locked", levelsNeeded: BOSS_UNLOCK_LEVEL - 2 },
      pendingBoon: null,
    },
  ];

  const correct = bossNeedCorrect(tier, total);
  const bossVictory: Exclude<BossResolution, { outcome: "rejected" }> = {
    outcome: "victory",
    accuracy: correct / total,
    required: bossRequiredAccuracy(tier),
    correct,
    total,
    needCorrect: correct,
    masteryAwarded: bossMasteryReward(tier),
    newTier: tier + 1,
    defeated: bossFor(fieldId, tier),
    nextBoss: bossFor(fieldId, tier + 1),
    cooldownUntil: new Date(NOW.getTime() + 72 * 3_600_000),
    boon: { choices: [...BOON_KINDS], victoryAt, claimUntil: boonClaimUntil(victoryAt) },
  };

  return {
    cards: FX_CARDS,
    results,
    seal,
    questStart: { done: 9, target: 15 },
    bosses,
    boss: { fieldId, name: bossFor(fieldId, tier).name, need: bossNeedCorrect(tier, total), total },
    bossVictory,
    effects: {
      lines: ["Review yield +20%"],
      boons: [BOON_KINDS[0]].map((k) => ({ kind: k, label: BOON_META[k].label, effect: BOON_META[k].effectText(BOON_META[k].magnitude), until: new Date(NOW.getTime() + 20 * 3_600_000) })),
      penalties: [
        {
          kind: "STAGNATION",
          label: "Stagnation",
          effect: "−8% points per review",
          clears: "Lifts after a week; add new ideas to the field so the next week's quota is met.",
          until: new Date(NOW.getTime() + 4 * 86_400_000),
        },
      ],
    },
    recent: [
      { id: "fx-4", title: "Coin tosses, exactly k heads", domainName: "Combinatorics", nextLabel: "next in 26 days", level: 7, mastered: false },
      { id: "fx-9", title: "Law of large numbers, weak form", domainName: "Probability", nextLabel: "next in 160 days", level: 12, mastered: true },
    ],
  };
}

/**
 * The hub's loadout strip (L4's LoadoutStrip): 7 of 10 slots filled, one
 * dormant. Separate from reviewFixtures() because a Skill never crosses into
 * the client half; the gated page renders the strip on the server.
 */
export function reviewFixtureStrip(): StripSlot[] {
  return Array.from({ length: 10 }, (_, slot) => ({ slot, skill: slot < 7 ? (SKILL_POOL[slot * 97] ?? null) : null, active: slot !== 3 }));
}
