import { prisma } from "./prisma";
import { computeAttributeScores, emptyComposition, type AttributeScores, type Composition } from "./attributes";
import { ATTRIBUTES } from "./attributes";

/**
 * Observed rates of progress, measured from history rather than assumed.
 *
 * These feed the "time to achieve" estimate on locked skills. The whole
 * value of that estimate is that it is derived from what this account has
 * *actually* been doing — a hardcoded "typically 3 weeks" would be a
 * fabricated number dressed as a projection, which is exactly the kind of
 * thing this project has refused elsewhere.
 *
 * Both rates are honest about their own limits: when there is not enough
 * history to measure, they return null and the UI says so instead of
 * printing a confident figure built on one data point.
 */

/** Mastery income is averaged over this window — long enough to survive a quiet weekend. */
export const MASTERY_RATE_WINDOW_DAYS = 21;
/** Attribute growth is measured against the oldest snapshot inside this window. */
export const SCORE_RATE_WINDOW_DAYS = 14;

export interface ProgressRates {
  /** Mastery points earned per day. Null when there is no income history yet. */
  masteryPerDay: number | null;
  /** Attribute-score growth per day, per attribute. Null when snapshots can't support a measurement. */
  scorePerDay: Record<string, number> | null;
  /** How many days of history the figures above are actually based on. */
  observedDays: number;
}

export async function loadProgressRates(userId: string, now: Date = new Date()): Promise<ProgressRates> {
  const [masteryPerDay, scoreResult] = await Promise.all([
    measureMasteryRate(userId, now),
    measureScoreRate(now),
  ]);

  return {
    masteryPerDay,
    scorePerDay: scoreResult.scorePerDay,
    observedDays: scoreResult.observedDays,
  };
}

/**
 * Income only — spends and decay are excluded. The question the estimate
 * answers is "how fast do points arrive", and netting purchases against
 * that would make every unlock retroactively slow down its own forecast.
 */
async function measureMasteryRate(userId: string, now: Date): Promise<number | null> {
  const since = new Date(now.getTime() - MASTERY_RATE_WINDOW_DAYS * 86_400_000);

  const [income, firstEver] = await Promise.all([
    prisma.masteryLedgerEntry.aggregate({
      where: { userId, delta: { gt: 0 }, createdAt: { gte: since } },
      _sum: { delta: true },
    }),
    prisma.masteryLedgerEntry.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  const earned = income._sum.delta ?? 0;
  if (earned <= 0 || !firstEver) return null;

  // A brand-new account should not be told it earns 40 points a day because
  // it earned 2 in its first hour: the divisor is the observed span, floored
  // at a day, and capped at the window.
  const spanMs = Math.min(now.getTime() - firstEver.createdAt.getTime(), MASTERY_RATE_WINDOW_DAYS * 86_400_000);
  const spanDays = Math.max(1, spanMs / 86_400_000);

  return earned / spanDays;
}

/**
 * Attribute growth, reconstructed from `FieldSnapshot`.
 *
 * Snapshots store per-Field level over time, and attribute score is a pure
 * function of Field levels and compositions — so replaying today's
 * compositions against historical levels gives a defensible "score N days
 * ago". The assumption is that compositions have not changed inside the
 * window; they are user-editable and not versioned, so a recent composition
 * edit will distort this. That is acceptable for an estimate and is why the
 * UI labels the output as approximate.
 */
async function measureScoreRate(now: Date): Promise<{ scorePerDay: Record<string, number> | null; observedDays: number }> {
  const since = new Date(now.getTime() - SCORE_RATE_WINDOW_DAYS * 86_400_000);

  const fields = await prisma.field.findMany({
    select: {
      id: true,
      name: true,
      level: true,
      attributes: { select: { attribute: true, weight: true } },
      snapshots: {
        where: { day: { gte: since } },
        orderBy: { day: "asc" },
        take: 1,
        select: { day: true, level: true },
      },
    },
  });

  const compositions = new Map<string, Composition>();
  for (const f of fields) {
    const composition = emptyComposition();
    for (const a of f.attributes) composition[a.attribute] = a.weight;
    compositions.set(f.id, composition as Composition);
  }

  const oldest = fields
    .map((f) => f.snapshots[0]?.day)
    .filter((d): d is Date => d !== undefined)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  if (!oldest) return { scorePerDay: null, observedDays: 0 };

  const observedDays = Math.floor((now.getTime() - oldest.getTime()) / 86_400_000);
  // One day of history cannot distinguish a trend from a single session.
  if (observedDays < 2) return { scorePerDay: null, observedDays };

  const thenScores = computeAttributeScores(
    fields.map((f) => ({
      fieldName: f.name,
      level: f.snapshots[0]?.level ?? f.level,
      composition: compositions.get(f.id)!,
    }))
  );
  const nowScores = computeAttributeScores(
    fields.map((f) => ({ fieldName: f.name, level: f.level, composition: compositions.get(f.id)! }))
  );

  const scorePerDay: Record<string, number> = {};
  for (const a of ATTRIBUTES) {
    scorePerDay[a] = Math.max(0, (nowScores[a] - thenScores[a]) / observedDays);
  }

  return { scorePerDay, observedDays };
}

export type { AttributeScores };
