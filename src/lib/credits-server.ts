/**
 * The credits wallet's reads (server only; the fold itself is credits.ts; blueprint P16, decisions D27 to D29).
 * Reads, never a write: scripts/credits-check.ts holds that this file writes no ledger row, imports no writer's value
 * but the read helpers it lists (momentum-server's readDayFacts, questRowsOf, questDone and emptyDayFacts, each
 * pinned to hold no write), and that loadWallet answers {live: false} before reading anything while credits are off.
 *
 *   loadWallet(userId, now?, deps?)   the wallet as the web and the phone show it: {live: false} while
 *                                     CREDITS_LAUNCH_DAY (or the rehearsal override) is not in force, else the fold
 *                                     over the rows from the launch day through today. Cached on the life, activity
 *                                     and roadmap tags (every row it folds is written by a writer that clears one of
 *                                     them: a tick, an undo, an answer, a new idea and a quest set clear 'activity';
 *                                     a close and the judge clear 'life'; a checkpoint log clears 'roadmap')
 *   readWallet(userId, now, deps?)    the same, uncached (the checks pass a fake store)
 *   loadWalletDays / readWalletDays   (P18) the wallet and each day that earned credits, from one fold, cached on the
 *                                     same tags under its own key: You › Mall's header and its price hints
 *                                     (mall.ts goodDayOf). {live: false} and no days, with no read, while off
 *   prismaCreditsStore                the default store: one wave of reads (the quest sets, the folded rows, the
 *                                     Mall's rows and the days' facts), then the closed goals' g
 *
 * Today's three count through momentum-server's own questDone over its own DayFacts, so a quest reads done in the
 * wallet exactly when it reads done on Today: an undo takes its 10 back on the next read. Every day from the launch
 * day through today is read in the one wave (a day with no quest set counts nothing).
 */
import { cached } from "./cache";
import { prisma } from "./prisma";
import { addDays, dateColumn, daysBetween, keyOfDateColumn, todayKey, type DayKey } from "./life-day";
import { emptyDayFacts, questDone, questRowsOf, readDayFacts, type DayFacts } from "./momentum-server";
import {
  CREDIT_MINT_PREFIXES,
  CREDIT_SOURCES,
  CREDIT_SPEND_SOURCES,
  OFF_WALLET,
  creditsLaunchDay,
  creditsOn,
  earnedDaysOf,
  foldCredits,
  walletOf,
  type CreditDay,
  type CreditQuestDay,
  type CreditRow,
  type CreditSpendRow,
  type CreditsFold,
  type CreditsWallet,
} from "./credits";

/** A quest-set row as questRowsOf reads it. */
export interface CreditQuestSetRow {
  source: string;
  day: DayKey;
  receipt: unknown;
}

/** Everything the fold reads, each a read. */
export interface CreditsStore {
  /** QUEST_SET rows dated [from, to]. */
  questSets(userId: string, from: DayKey, to: DayKey): Promise<CreditQuestSetRow[]>;
  /** The days' facts (momentum-server readDayFacts by default). */
  dayFacts(userId: string, days: readonly DayKey[]): Promise<Map<DayKey, DayFacts>>;
  /** The CREDIT_SOURCES rows dated [from, to] (MP_MINT only under CREDIT_MINT_PREFIXES). */
  incomeRows(userId: string, from: DayKey, to: DayKey): Promise<CreditRow[]>;
  /** g at each closed goal's close (TaskTemplate.closedScore), by id. */
  goalScores(userId: string, goalIds: readonly string[]): Promise<Map<string, number>>;
  /** The Mall's rows dated [from, to] (none before P19). */
  spendRows(userId: string, from: DayKey, to: DayKey): Promise<CreditSpendRow[]>;
}

export interface CreditsDeps {
  store?: CreditsStore;
  /** The launch day in force (default credits.ts creditsLaunchDay()); the checks pass their own, null included. */
  launchDay?: DayKey | null;
}

const dayRange = (from: DayKey, to: DayKey) => ({ gte: dateColumn(from), lte: dateColumn(to) });

export const prismaCreditsStore: CreditsStore = {
  async questSets(userId, from, to) {
    const rows = await prisma.activityEvent.findMany({
      where: { userId, source: "QUEST_SET", day: dayRange(from, to) },
      select: { source: true, day: true, receipt: true },
      orderBy: [{ day: "asc" }, { occurredAt: "asc" }, { id: "asc" }],
    });
    return rows.map((r) => ({ source: r.source, day: keyOfDateColumn(r.day), receipt: r.receipt }));
  },

  dayFacts: readDayFacts,

  async incomeRows(userId, from, to) {
    const rows = await prisma.activityEvent.findMany({
      where: {
        userId,
        day: dayRange(from, to),
        OR: [
          { source: { in: CREDIT_SOURCES.filter((s) => s !== "MP_MINT") } },
          { source: "MP_MINT", OR: CREDIT_MINT_PREFIXES.map((p) => ({ dedupeKey: { startsWith: p } })) },
        ],
      },
      select: { source: true, day: true, dedupeKey: true, qty: true, detail: true, templateId: true },
      orderBy: [{ day: "asc" }, { occurredAt: "asc" }, { id: "asc" }],
    });
    return rows.map((r) => ({ source: r.source, day: keyOfDateColumn(r.day), dedupeKey: r.dedupeKey, qty: r.qty, detail: r.detail, templateId: r.templateId }));
  },

  async goalScores(userId, goalIds) {
    if (goalIds.length === 0) return new Map();
    const rows = await prisma.taskTemplate.findMany({ where: { userId, id: { in: [...goalIds] } }, select: { id: true, closedScore: true } });
    return new Map(rows.flatMap((r) => (typeof r.closedScore === "number" ? [[r.id, r.closedScore] as const] : [])));
  },

  async spendRows(userId, from, to) {
    const rows = await prisma.activityEvent.findMany({
      where: { userId, source: { in: [...CREDIT_SPEND_SOURCES] }, day: dayRange(from, to) },
      select: { source: true, day: true, qty: true },
    });
    return rows.map((r) => ({ source: r.source, day: keyOfDateColumn(r.day), qty: r.qty }));
  },
};

/** The life days from the launch day through `today`, oldest first. */
function daysFrom(launchDay: DayKey, today: DayKey): DayKey[] {
  const n = daysBetween(launchDay, today);
  return Array.from({ length: n + 1 }, (_, i) => addDays(launchDay, i));
}

/** Each day's quests in force and how many are done (a day with no frozen set counts nothing). */
export function questDaysOf(sets: readonly CreditQuestSetRow[], facts: ReadonlyMap<DayKey, DayFacts>, days: readonly DayKey[]): CreditQuestDay[] {
  const out: CreditQuestDay[] = [];
  for (const day of days) {
    const q = questRowsOf(sets, day);
    if (!q.set || q.inForce.length === 0) continue;
    const f = facts.get(day) ?? emptyDayFacts(day);
    out.push({ day, inForce: q.inForce.length, done: q.inForce.filter((x) => questDone(x, f)).length });
  }
  return out;
}

/** The fold from the launch day through `now`'s life day; null with no read while credits are off on it. */
async function readFold(userId: string, now: Date, deps: CreditsDeps): Promise<{ today: DayKey; launch: DayKey; fold: CreditsFold } | null> {
  const today = todayKey(now);
  const launch = deps.launchDay === undefined ? creditsLaunchDay() : deps.launchDay;
  if (launch == null || !creditsOn(today, launch)) return null;
  const store = deps.store ?? prismaCreditsStore;
  const days = daysFrom(launch, today);
  const [sets, facts, rows, spends] = await Promise.all([
    store.questSets(userId, launch, today),
    store.dayFacts(userId, days),
    store.incomeRows(userId, launch, today),
    store.spendRows(userId, launch, today),
  ]);
  const goalIds = [...new Set(rows.flatMap((r) => (r.source === "MP_MINT" && r.templateId && (r.qty ?? 0) > 0 && r.dedupeKey?.startsWith(CREDIT_MINT_PREFIXES[0]) ? [r.templateId] : [])))];
  const goalScores = await store.goalScores(userId, goalIds);
  return { today, launch, fold: foldCredits({ today, launchDay: launch, questDays: questDaysOf(sets, facts, days), rows, goalScores, spends }) };
}

/** The wallet, uncached: {live: false} with no read while credits are off on `now`'s life day. */
export async function readWallet(userId: string, now: Date, deps: CreditsDeps = {}): Promise<CreditsWallet> {
  const r = await readFold(userId, now, deps);
  return r ? walletOf(r.fold, r.today, r.launch) : OFF_WALLET(todayKey(now));
}

/** The wallet and the days that earned credits (P18: the Mall's header and its price hints), from one fold. */
export interface WalletDays {
  wallet: CreditsWallet;
  /** Each life day that earned credits, oldest first (credits.ts earnedDaysOf); none while credits are off. */
  days: CreditDay[];
}

/** The same, uncached: {live: false} and no days, with no read, while credits are off. */
export async function readWalletDays(userId: string, now: Date, deps: CreditsDeps = {}): Promise<WalletDays> {
  const r = await readFold(userId, now, deps);
  return r ? { wallet: walletOf(r.fold, r.today, r.launch), days: earnedDaysOf(r.fold) } : { wallet: OFF_WALLET(todayKey(now)), days: [] };
}

/**
 * The wallet (cached on 'life', 'activity' and 'roadmap', per user, life day and launch day). While credits are off
 * it answers {live: false} at once: no read, no cache entry. A fake store (the checks) is never cached.
 */
export async function loadWallet(userId: string, now: Date = new Date(), deps: CreditsDeps = {}): Promise<CreditsWallet> {
  const today = todayKey(now);
  const launch = deps.launchDay === undefined ? creditsLaunchDay() : deps.launchDay;
  if (launch == null || !creditsOn(today, launch)) return OFF_WALLET(today);
  if (deps.store) return readWallet(userId, now, deps);
  return cached(`credits:wallet:${userId}:${today}:${launch}`, ["life", "activity", "roadmap"], () => readWallet(userId, now, { launchDay: launch }));
}

/**
 * The wallet with its earning days (P18: You › Mall and GET /mall read it for the header and the price hints), cached
 * on the same tags as loadWallet, from one fold. While credits are off: {live: false} and no days at once, no read.
 */
export async function loadWalletDays(userId: string, now: Date = new Date(), deps: CreditsDeps = {}): Promise<WalletDays> {
  const today = todayKey(now);
  const launch = deps.launchDay === undefined ? creditsLaunchDay() : deps.launchDay;
  if (launch == null || !creditsOn(today, launch)) return { wallet: OFF_WALLET(today), days: [] };
  if (deps.store) return readWalletDays(userId, now, deps);
  return cached(`credits:wallet-days:${userId}:${today}:${launch}`, ["life", "activity", "roadmap"], () => readWalletDays(userId, now, { launchDay: launch }));
}
