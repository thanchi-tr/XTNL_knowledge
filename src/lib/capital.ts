import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { skinFor } from "./skill-form";
import { augmentIndex, hasAugment, YIELD_BONUS, type OwnedAugment } from "./augments";
import type { Skill } from "./skill-pool";

/**
 * Capital — the passive currency, and the only one that accrues while you are
 * not here.
 *
 * **Why it is claimed rather than credited.** Both gamification references
 * make the same point from opposite directions: Kubbo's loop is "complete →
 * earn → *see* progress → want more", and Moore's guide names forgetting to
 * claim an earned reward as the thing that "breaks the entire motivational
 * loop". A number that silently rises is not a reward, it is a fact. So
 * capital accrues invisibly against a rate, and becomes yours only when you
 * press the button — which is the moment the loop actually closes.
 *
 * **Why it caps.** `ACCRUAL_CAP_HOURS` stops a month away paying the same as
 * a week away. Passive income should reward *holding a good loadout*, not
 * absence; without a ceiling the optimal strategy is to stop playing, which
 * is the exact inversion of what this is for.
 *
 * **Where the rate comes from.** Every equipped, active emblem contributes
 * according to its depth on the same 15-rung ladder the mark is drawn from,
 * so a loadout of terminal emblems earns meaningfully more than ten
 * trinkets. A YIELD augment lifts that emblem's own contribution — the one
 * place in this app where money compounds into money.
 */

/** Capital per hour with nothing equipped. Deliberately non-zero so a new account sees the mechanic exist. */
const BASE_RATE_PER_HOUR = 2;
/** Per-emblem contribution at charge 0 .. 1. */
const EMBLEM_RATE_MIN = 1.5;
const EMBLEM_RATE_MAX = 14;
/** Accrual stops here, so being away longer stops paying more. */
export const ACCRUAL_CAP_HOURS = 48;

export interface CapitalRate {
  /** Capital per hour, all contributions folded. */
  perHour: number;
  /** What each equipped emblem adds, for the breakdown. */
  contributions: { code: string; name: string; perHour: number; yielded: boolean }[];
  basePerHour: number;
}

/** Pure: given the active loadout and augments, what does this account earn per hour? */
export function computeRate(activeSkills: Skill[], augments: OwnedAugment[]): CapitalRate {
  const index = augmentIndex(augments);
  const contributions = activeSkills.map((s) => {
    const { charge } = skinFor(s);
    const yielded = hasAugment(index, s.code, "YIELD");
    const base = EMBLEM_RATE_MIN + (EMBLEM_RATE_MAX - EMBLEM_RATE_MIN) * charge;
    return {
      code: s.code,
      name: s.name,
      perHour: Math.round(base * (yielded ? 1 + YIELD_BONUS : 1) * 100) / 100,
      yielded,
    };
  });
  const perHour =
    Math.round((BASE_RATE_PER_HOUR + contributions.reduce((sum, c) => sum + c.perHour, 0)) * 100) / 100;
  return { perHour, contributions, basePerHour: BASE_RATE_PER_HOUR };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Sum of the ledger. Cached on "progress", which every spend and claim invalidates. */
export const getCapitalBalance = async (userId: string): Promise<number> =>
  cached(`capital:${userId}`, ["progress"], () => getCapitalBalanceFresh(userId));

export async function getCapitalBalanceFresh(userId: string): Promise<number> {
  const agg = await prisma.capitalLedgerEntry.aggregate({ where: { userId }, _sum: { delta: true } });
  return round2(agg._sum.delta ?? 0);
}

export async function loadAugments(userId: string): Promise<OwnedAugment[]> {
  const rows = await cached(`augments:${userId}`, ["progress"], () =>
    prisma.emblemAugment.findMany({ where: { userId }, select: { skillCode: true, kind: true } })
  );
  return rows as OwnedAugment[];
}

/**
 * When accrual last reset. The most recent claim, or — for an account that
 * has never claimed — the first ledger entry, falling back to now so a brand
 * new account starts at zero rather than being handed the cap.
 */
async function lastAccrualAt(userId: string, now: Date): Promise<Date> {
  const lastClaim = await prisma.capitalLedgerEntry.findFirst({
    where: { userId, reason: "DIVIDEND" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (lastClaim) return lastClaim.createdAt;
  const first = await prisma.capitalLedgerEntry.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  return first?.createdAt ?? now;
}

export interface PendingDividend {
  /** Capital waiting to be claimed. */
  amount: number;
  hoursAccrued: number;
  /** True once the ceiling is reached — the UI says so rather than letting it silently stall. */
  capped: boolean;
  perHour: number;
}

export async function pendingDividend(
  userId: string,
  activeSkills: Skill[],
  now: Date = new Date()
): Promise<PendingDividend> {
  const augments = await loadAugments(userId);
  const { perHour } = computeRate(activeSkills, augments);
  const since = await lastAccrualAt(userId, now);
  const rawHours = Math.max(0, (now.getTime() - since.getTime()) / 3_600_000);
  const hours = Math.min(ACCRUAL_CAP_HOURS, rawHours);
  return {
    amount: round2(perHour * hours),
    hoursAccrued: Math.round(rawHours * 100) / 100,
    capped: rawHours >= ACCRUAL_CAP_HOURS,
    perHour,
  };
}

export type ClaimResult =
  | { status: "claimed"; amount: number; balance: number; capped: boolean }
  | { status: "nothing"; balance: number };

/** Banks whatever has accrued. Writing the row is what resets the clock. */
export async function claimDividend(
  userId: string,
  activeSkills: Skill[],
  now: Date = new Date()
): Promise<ClaimResult> {
  const pending = await pendingDividend(userId, activeSkills, now);
  // A rounding-dust claim would reset the accrual clock for nothing, quietly
  // costing the player the time they had banked.
  if (pending.amount < 0.01) {
    return { status: "nothing", balance: await getCapitalBalanceFresh(userId) };
  }

  await prisma.capitalLedgerEntry.create({
    data: {
      userId,
      delta: pending.amount,
      reason: "DIVIDEND",
      detail: `${pending.perHour.toFixed(2)}/h over ${Math.min(pending.hoursAccrued, ACCRUAL_CAP_HOURS).toFixed(1)}h${pending.capped ? " (capped)" : ""}`,
    },
  });
  invalidate("progress");

  return {
    status: "claimed",
    amount: pending.amount,
    balance: await getCapitalBalanceFresh(userId),
    capped: pending.capped,
  };
}

export type SpendResult =
  | { status: "ok"; balance: number }
  | { status: "insufficient"; balance: number; needed: number }
  | { status: "duplicate" };

/**
 * Burns capital for one augment.
 *
 * Priced and paid inside a single transaction against a *fresh* balance —
 * a cached balance could let two rapid purchases each see the funds the
 * other is about to spend.
 */
export async function purchaseAugment(
  userId: string,
  skillCode: string,
  kind: string,
  cost: number
): Promise<SpendResult> {
  const balance = await getCapitalBalanceFresh(userId);
  if (balance < cost) return { status: "insufficient", balance, needed: cost };

  const existing = await prisma.emblemAugment.findUnique({
    where: { userId_skillCode_kind: { userId, skillCode, kind } },
    select: { id: true },
  });
  if (existing) return { status: "duplicate" };

  await prisma.$transaction([
    prisma.emblemAugment.create({ data: { userId, skillCode, kind, costPaid: cost } }),
    prisma.capitalLedgerEntry.create({
      data: { userId, delta: -cost, reason: "AUGMENT", detail: `${kind} on ${skillCode}` },
    }),
  ]);
  invalidate("progress");

  return { status: "ok", balance: round2(balance - cost) };
}
