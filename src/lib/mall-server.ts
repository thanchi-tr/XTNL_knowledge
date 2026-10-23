/**
 * The Mall: the reads and the only writers (server only; the rules are mall.ts; blueprint P18 and P19, decisions D30
 * to D32). The MallReward table is written here and nowhere else; and (P19) the Mall's two ledger rows, MALL_BUY and
 * MALL_REFUND, are written here and nowhere else, each through activity.ts activityOp with sink "NONE", xp 0 and
 * countsForStreak false: a purchase spends credits only. Nothing here touches MasteryLedgerEntry, CapitalLedgerEntry or a
 * Domain point, and no row here pays XP, MP or a level (scripts/credits-check.ts pins every mutation in a mall* file).
 * An archive keeps the row; nothing is deleted.
 *
 *   loadMall(userId, opts?)        the page's and GET /mall's read: the wallet (credits-server loadWalletDays, {live:
 *                                  false} with no read while credits are off) and its good day, the live rewards
 *                                  by category with each price's hint and (P19) whether it can be bought now (the
 *                                  user's #play titles read beside it, while credits count, so a title that became
 *                                  #play is never offered), the archived ones (newest first), the latest purchases
 *                                  with their undo windows, whether writes are on. Fails soft before the migration (no
 *                                  MallReward table): no rewards, and `ready` false
 *   addRewardCore / editRewardCore / archiveRewardCore   the catalog's writes (mall.ts cleanRewardInput: a title of
 *                                  1-60, never #play, sleep or a rest day, one live reward a title; a whole price of
 *                                  1-100,000; an optional note and cooldown)
 *   buyRewardCore(userId, {rewardId, clientId}, deps?)   (P19) a purchase: buyPerkCore's shape. It reads the reward,
 *                                  the Mall's rows, the user's #play titles and the wallet fresh, plans it (mall.ts
 *                                  planBuy: a title that is #play now stays free, no overdraft, a balance below zero
 *                                  waits, the cooldown), then one $transaction of tasks.ts
 *                                  lifeLockOp, a guard that the user's Mall rows are still the count it read, and
 *                                  the MALL_BUY row 'buy:<clientId>' (qty the price, receipt mall-1). A stale guard
 *                                  (another purchase landed: the Fold and the desktop at once) re-reads once and plans
 *                                  again, so two purchases can never spend the same credits; a resend of the same
 *                                  clientId finds its row and answers it (`duplicate`), written once
 *   undoBuyCore(userId, {purchaseId}, deps?)   (P19) the purchase given back inside its ten minutes, once: lifeLockOp
 *                                  and the MALL_REFUND row 'refund:<buyId>' (a repeat answers the first)
 *   withMallMoments(userId, write, changed, deps?)   a purchase's T2 Seal 'mall-buy' (the snapshot → write → detect
 *                                  pattern on the 'mall' scope; celebrations.ts writes it, never this file)
 *   readMallPart(userId, now, deps?)   the celebrations' 'mall' part: the latest purchases with their receipts' figures;
 *                                  null, with no read, while credits are off (nothing Mall-shaped can play)
 *
 * Every write needs lifeWritesEnabled(env) (production, or XTNL_LIFE_JUDGE=1 on the local rehearsal): dev and prod
 * share one database, so a dev server records nothing and says so (MALL_WRITES_OFF). And a purchase or an undo needs
 * credits counting (CREDITS_LAUNCH_DAY, null until the user's go): while it is null nothing can be bought. Nothing
 * caches the catalog; a purchase's row clears 'activity' (activity.ts), so the wallet is read fresh after it.
 *
 * Penalties never debit credits (D31): no debt, forgetting or settlement path writes a Mall row, and nothing here
 * reads one. Deterministic (D32): no roll; the client's id is an idempotency key, never a chance.
 *
 * The stores, the wallet reads and the clock are injectable (MallDeps), so scripts/credits-check.ts drives every core
 * on fixtures with no database. No id is drawn here: Prisma's cuid default names a new row.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { activityOp, invalidateActivity, isDuplicateActivity } from "./activity";
import { lifeLockOp } from "./tasks";
import { isStaleGuard } from "./life-tracks-server";
import { withMoments } from "./today-board";
import { lifeWritesEnabled, type LifeEnv } from "./life-economy";
import { keyOfDateColumn, todayKey, type DayKey } from "./life-day";
import { loadWalletDays, readWallet, type WalletDays } from "./credits-server";
import { CREDIT_SPEND_SOURCES, creditsLaunchDay, creditsOn, type CreditsWallet } from "./credits";
import type { Receipt } from "./life-types";
import type { CelebrationEvent, ProgressSnapshot } from "./celebration-types";
import type { MallPart } from "./celebration-detect";
import {
  BUY_CREDITS_OFF,
  PURCHASES_SHOWN,
  PURCHASE_FAILED,
  REWARD_GONE,
  balanceOf,
  buyRowKey,
  buyStateOf,
  cleanRewardInput,
  goodDayOf,
  groupsOf,
  isMallReceipt,
  isPurchaseClientId,
  planBuy,
  planRefund,
  planRewardEdit,
  purchasesOf,
  receiptOfBuy,
  receiptOfRefund,
  refundRowKey,
  refundedBuyIds,
  rewardViewOf,
  type GoodDay,
  type MallGroup,
  type MallReceipt,
  type MallResult,
  type MallRewardRow,
  type PurchaseRow,
  type PurchaseSource,
  type PurchaseView,
  type RewardData,
  type RewardInput,
  type RewardPatch,
  type RewardView,
} from "./mall";

/** A server whose writes are off (a dev server sharing the database, a Preview) says this and records nothing. */
export const MALL_WRITES_OFF = "Mall changes are recorded only on the live app.";
export const MALL_NOT_READY = "The Mall isn't set up on this database yet.";
const SAVE_FAILED = "Couldn't save that. Try again.";
const RACED = "That reward changed meanwhile. Try again.";

/** The archived rewards the page lists, newest first. */
export const ARCHIVED_SHOWN = 50;
/** A bound on one read of the live rows (REWARDS_MAX keeps them to 60). */
const ROWS_MAX = 100;
/** A bound on the #play titles read. */
const PLAY_MAX = 500;

// ── The store ───────────────────────────────────────────────────────────────

/** The table (and the #play titles a reward may not take), as the cores use it; the real one is Prisma. */
export interface MallStore {
  /** The user's live rows (archivedAt null), in their order. */
  live(userId: string): Promise<MallRewardRow[]>;
  /** The user's archived rows, newest archive first, at most `take`. */
  archived(userId: string, take: number): Promise<MallRewardRow[]>;
  /** One of the user's rows by id, live or archived. */
  byId(userId: string, id: string): Promise<MallRewardRow | null>;
  /** A new live row; its id. */
  insert(userId: string, data: RewardData & { sortOrder: number }): Promise<string>;
  /** A live row's fields; how many changed (0 or 1). */
  update(userId: string, id: string, data: RewardData): Promise<number>;
  /** Archive one live row (archivedAt set, the row kept); how many changed (0 or 1). */
  archive(userId: string, id: string, at: Date): Promise<number>;
  /** The normalised titles of the user's live #play tasks (TaskTemplate.intrinsic), read only. */
  playTitles(userId: string): Promise<string[]>;
}

/** A Mall ledger row to write (P19): activity.ts makes it a sink-NONE ActivityEvent with xp 0. */
export interface PurchaseEvent {
  source: PurchaseSource;
  day: DayKey;
  occurredAt: Date;
  /** The credits it takes (a purchase) or gives back (an undo). */
  qty: number;
  /** A purchase: the reward's id. An undo: the purchase's row id. */
  sourceId: string;
  /** The reward's title, as it was. */
  detail: string;
  dedupeKey: string;
  receipt: MallReceipt;
}

/** One purchase transaction: the life lock, the guard when `guardCount` is set, and the row. */
export interface PurchaseWrite {
  /** The user's MALL_BUY and MALL_REFUND rows must still be this many (null: no guard, an undo's). */
  guardCount: number | null;
  event: PurchaseEvent;
}

/** The Mall's ledger rows (MALL_BUY and MALL_REFUND only), read and written; the real one is Prisma. */
export interface PurchaseStore {
  /** Every MALL_BUY and MALL_REFUND row of the user, oldest first: the guard counts them all, and the balance sums them. */
  rows(userId: string): Promise<PurchaseRow[]>;
  /** One transaction (lifeLockOp, the guard, the row); the new row's id. A stale guard throws (SQLSTATE 22012), a repeated key P2002. */
  commit(userId: string, w: PurchaseWrite): Promise<string>;
}

/** The before → after snapshots a purchase's Seal is read from (celebrations.ts by default; false: none). */
export interface MallMoments {
  capture: (userId: string, now: Date) => Promise<unknown>;
  detect: (before: unknown, after: unknown, now: Date) => Promise<CelebrationEvent[]>;
}

export interface MallDeps {
  store?: MallStore;
  /** The wallet and its earning days (credits-server loadWalletDays by default). */
  wallet?: (userId: string, now: Date) => Promise<WalletDays>;
  /** (P19) The Mall's ledger rows (prismaPurchaseStore by default). */
  purchases?: PurchaseStore;
  /** (P19) The wallet read fresh for a purchase or an undo (credits-server readWallet, uncached, by default). */
  freshWallet?: (userId: string, now: Date, launchDay: DayKey | null) => Promise<CreditsWallet>;
  /** (P19) The credits launch day in force (credits.ts creditsLaunchDay() by default); the checks pass their own. */
  launchDay?: DayKey | null;
  /** (P19) A purchase's moments (celebrations.ts by default; false: none, as the checks pass). */
  moments?: MallMoments | false;
  /** The variables the write gate reads (process.env by default). */
  env?: LifeEnv;
  now?: () => Date;
}

/**
 * Whether a database error says the Mall's schema isn't there yet (migration 20261231000000_mall not applied: no
 * MallReward table), or the client predates it.
 */
export function isMissingMallSchema(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown; meta?: unknown };
  const text = `${typeof e.message === "string" ? e.message : ""} ${JSON.stringify(e.meta ?? {})}`;
  if (e.code === "P2021" || /\b42P01\b/.test(text) || /(relation|table) \W{0,2}(public\.)?\W?MallReward\W{0,2} does not exist/i.test(text)) return /MallReward/.test(text);
  // A client generated before the migration: no mallReward delegate.
  if (err instanceof TypeError) return /\b(findMany|findFirst|create|updateMany)\b/.test(text) && /undefined/.test(text);
  return err instanceof Prisma.PrismaClientValidationError && /mallReward|MallReward/.test(text);
}

let warnedMissing = false;
function warnMissing(label: string): void {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn(`${label}: the Mall's schema is missing (migration 20261231000000_mall not applied); showing no rewards.`);
}

const ROW_SELECT = { id: true, title: true, category: true, price: true, note: true, cooldownDays: true, sortOrder: true, createdAt: true, archivedAt: true } as const;

type DbRow = { id: string; title: string; category: string; price: number; note: string | null; cooldownDays: number | null; sortOrder: number; createdAt: Date; archivedAt: Date | null };

/** A row as read; a category the table's CHECK would refuse never reaches here, so it is taken as it is. */
const rowOf = (r: DbRow): MallRewardRow => ({ ...r, category: r.category as MallRewardRow["category"], createdAt: r.createdAt.toISOString(), archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null });

/** The real store: Prisma. */
export const prismaMallStore: MallStore = {
  async live(userId) {
    const rows = await prisma.mallReward.findMany({ where: { userId, archivedAt: null }, select: ROW_SELECT, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: ROWS_MAX });
    return rows.map(rowOf);
  },
  async archived(userId, take) {
    const rows = await prisma.mallReward.findMany({ where: { userId, archivedAt: { not: null } }, select: ROW_SELECT, orderBy: [{ archivedAt: "desc" }, { id: "asc" }], take });
    return rows.map(rowOf);
  },
  async byId(userId, id) {
    const r = await prisma.mallReward.findFirst({ where: { id, userId }, select: ROW_SELECT });
    return r ? rowOf(r) : null;
  },
  async insert(userId, data) {
    const r = await prisma.mallReward.create({ data: { userId, title: data.title, category: data.category, price: data.price, note: data.note, cooldownDays: data.cooldownDays, sortOrder: data.sortOrder }, select: { id: true } });
    return r.id;
  },
  async update(userId, id, data) {
    return (await prisma.mallReward.updateMany({ where: { id, userId, archivedAt: null }, data: { title: data.title, category: data.category, price: data.price, note: data.note, cooldownDays: data.cooldownDays } })).count;
  },
  async archive(userId, id, at) {
    return (await prisma.mallReward.updateMany({ where: { id, userId, archivedAt: null }, data: { archivedAt: at } })).count;
  },
  async playTitles(userId) {
    const rows = await prisma.taskTemplate.findMany({ where: { userId, intrinsic: true, archivedAt: null }, select: { normTitle: true }, take: PLAY_MAX });
    return rows.map((r) => r.normTitle);
  },
};

/**
 * The guard's SQL (momentum-server's row-count guard, for the Mall's two sources): division by zero, so the whole
 * transaction rolls back, unless the user's MALL_BUY and MALL_REFUND rows are still `count`. It runs after lifeLockOp,
 * so it sees every purchase committed by a write that held the lock first.
 */
export function purchaseGuardSql(userId: string, count: number): Prisma.Sql {
  return Prisma.sql`SELECT 1 / (CASE WHEN (SELECT COUNT(*) FROM "ActivityEvent" WHERE "userId" = ${userId} AND "source" IN (${Prisma.join([...CREDIT_SPEND_SOURCES])})) = ${count}::int THEN 1 ELSE 0 END)`;
}

/** The real purchase store: the ledger, through activity.ts. */
export const prismaPurchaseStore: PurchaseStore = {
  async rows(userId) {
    const rows = await prisma.activityEvent.findMany({
      where: { userId, source: { in: [...CREDIT_SPEND_SOURCES] } },
      select: { id: true, source: true, day: true, occurredAt: true, qty: true, sourceId: true, dedupeKey: true, receipt: true },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    return rows.map((r) => ({ id: r.id, source: r.source, day: keyOfDateColumn(r.day), occurredAt: r.occurredAt.toISOString(), qty: r.qty, sourceId: r.sourceId, dedupeKey: r.dedupeKey, receipt: r.receipt as unknown }));
  },
  async commit(userId, w) {
    const e = w.event;
    const ops: Prisma.PrismaPromise<unknown>[] = [lifeLockOp(userId)];
    if (w.guardCount != null) ops.push(prisma.$executeRaw(purchaseGuardSql(userId, w.guardCount)));
    ops.push(
      activityOp(userId, {
        source: e.source,
        sink: "NONE",
        day: e.day,
        occurredAt: e.occurredAt,
        xp: 0,
        qty: e.qty,
        countsForStreak: false,
        sourceId: e.sourceId,
        detail: e.detail,
        dedupeKey: e.dedupeKey,
        receipt: e.receipt as unknown as Receipt,
      })
    );
    try {
      const done = await prisma.$transaction(ops);
      return (done[done.length - 1] as { id: string }).id;
    } finally {
      invalidateActivity({ source: e.source, sink: "NONE" });
    }
  },
};

const depsOf = (deps: MallDeps = {}) => ({
  store: deps.store ?? prismaMallStore,
  wallet: deps.wallet ?? ((userId: string, now: Date) => loadWalletDays(userId, now)),
  purchases: deps.purchases ?? prismaPurchaseStore,
  freshWallet: deps.freshWallet ?? ((userId: string, now: Date, launchDay: DayKey | null) => readWallet(userId, now, { launchDay })),
  launchDay: deps.launchDay === undefined ? creditsLaunchDay() : deps.launchDay,
  now: deps.now ?? (() => new Date()),
  writesOn: lifeWritesEnabled(deps.env),
});

// ── The read ────────────────────────────────────────────────────────────────

/** What You › Mall and GET /mall read. */
export interface MallView {
  day: DayKey;
  /** The credits wallet: {live: false} while credits are off; null when it couldn't be read. */
  wallet: CreditsWallet | null;
  goodDay: GoodDay;
  /** The live rewards, each with its hint. */
  rewards: RewardView[];
  /** The same, by category (only the categories that hold one). */
  groups: MallGroup[];
  /** The archived rewards, newest first (at most ARCHIVED_SHOWN). */
  archived: RewardView[];
  /** Writes are on (production, or the local rehearsal). */
  writesOn: boolean;
  /** The schema is there (the migration applied): false reads as no rewards, and an add says it isn't set up. */
  ready: boolean;
  /** (P19) Each live reward's Buy state, by id: whether it can be bought now, or the line saying why not. */
  buy: Record<string, BuyStateView>;
  /** (P19) The latest purchases, newest first (at most PURCHASES_SHOWN), each with its undo window at the read. */
  purchases: PurchaseView[];
}

/** A reward's Buy state as the board and the phone read it (mall.ts BuyState). */
export type BuyStateView = ReturnType<typeof buyStateOf>;

/**
 * The catalog and the wallet, fresh on every read (the wallet is credits-server's, cached on its own tags). P19: while
 * credits count, the Mall's rows too (the purchases and their undo windows, and each reward's Buy state); while they
 * are off nothing more is read, and no reward can be bought.
 */
export async function loadMall(userId: string, opts: MallDeps = {}): Promise<MallView> {
  const d = depsOf(opts);
  const now = d.now();
  const day = todayKey(now);
  const rows = Promise.all([d.store.live(userId), d.store.archived(userId, ARCHIVED_SHOWN)]).then(
    ([live, archived]) => ({ live, archived, ready: true }),
    (err: unknown) => {
      if (!isMissingMallSchema(err)) throw err;
      warnMissing("loadMall");
      return { live: [] as MallRewardRow[], archived: [] as MallRewardRow[], ready: false };
    }
  );
  const walletRead = d.wallet(userId, now).catch((err: unknown) => {
    console.error("[mall] the credits wallet unavailable", err);
    return null;
  });
  const counting = creditsOn(day, d.launchDay);
  const bought = counting
    ? d.purchases.rows(userId).catch((err: unknown) => {
        console.error("[mall] the purchases unavailable", err);
        return null;
      })
    : Promise.resolve([] as PurchaseRow[]);
  // The #play titles a reward may not be bought under (D30), read only while something could be bought.
  const play = counting
    ? d.store.playTitles(userId).then(
        (titles) => new Set(titles),
        (err: unknown) => {
          console.error("[mall] the #play titles unavailable", err);
          return null;
        }
      )
    : Promise.resolve(new Set<string>());
  const [{ live, archived, ready }, wd, purchaseRows, playTitles] = await Promise.all([rows, walletRead, bought, play]);
  const wallet = wd ? wd.wallet : null;
  // The good day reads the live wallet's own launch day and days; off or unread, every hint calibrates.
  const goodDay = goodDayOf({ launchDay: wallet?.live ? wallet.launchDay : null, today: day, days: wallet?.live && wd ? wd.days : [] });
  const rewards = live.map((r) => rewardViewOf(r, goodDay));
  // A purchase is decided on the same launch day the buy core reads: while it is not in force, nothing can be bought.
  const ctx = { wallet: counting ? wallet : wallet && { live: false as const, day }, rowsRead: purchaseRows != null, rows: purchaseRows ?? [], writesOn: d.writesOn, ready, today: day, playTitles };
  const buy = Object.fromEntries(live.map((r) => [r.id, buyStateOf(r, ctx)]));
  return {
    day,
    wallet,
    goodDay,
    rewards,
    groups: groupsOf(rewards),
    archived: archived.map((r) => rewardViewOf(r, goodDay)),
    writesOn: d.writesOn,
    ready,
    buy,
    purchases: purchasesOf(purchaseRows ?? [], now.getTime(), PURCHASES_SHOWN),
  };
}

// ── The writes ──────────────────────────────────────────────────────────────

function writeFailed(label: string, err: unknown): { ok: false; error: string } {
  if (isMissingMallSchema(err)) {
    warnMissing(label);
    return { ok: false, error: MALL_NOT_READY };
  }
  // Two adds racing on one title (the partial unique index MallReward_userId_title_live_key).
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { ok: false, error: RACED };
  console.error(`[mall] ${label} failed:`, err);
  return { ok: false, error: SAVE_FAILED };
}

const nextSort = (live: readonly MallRewardRow[]) => Math.max(-1, ...live.map((r) => r.sortOrder)) + 1;

/** Lists a reward (mall.ts cleanRewardInput). Nothing is listed for the user: this is the only way a row is made. */
export async function addRewardCore(userId: string, input: RewardInput, deps: MallDeps = {}): Promise<MallResult<{ id: string }>> {
  const d = depsOf(deps);
  if (!d.writesOn) return { ok: false, error: MALL_WRITES_OFF };
  try {
    const [live, play] = await Promise.all([d.store.live(userId), d.store.playTitles(userId)]);
    const clean = cleanRewardInput(input, { live, playTitles: new Set(play) });
    if (!clean.ok) return clean;
    const id = await d.store.insert(userId, { ...clean.value, sortOrder: nextSort(live) });
    return { ok: true, value: { id } };
  } catch (err) {
    return writeFailed("addRewardCore", err);
  }
}

/** Changes a live reward's name, category, price, note or cooldown (the same checks as a new one). */
export async function editRewardCore(userId: string, id: string, patch: RewardPatch, deps: MallDeps = {}): Promise<MallResult<{ id: string }>> {
  const d = depsOf(deps);
  if (!d.writesOn) return { ok: false, error: MALL_WRITES_OFF };
  try {
    const [row, live, play] = await Promise.all([d.store.byId(userId, id), d.store.live(userId), d.store.playTitles(userId)]);
    if (!row || row.archivedAt != null) return { ok: false, error: REWARD_GONE };
    const plan = planRewardEdit(row, patch, { live, playTitles: new Set(play) });
    if (!plan.ok) return plan;
    const changed = await d.store.update(userId, id, plan.value);
    if (changed !== 1) return { ok: false, error: REWARD_GONE };
    return { ok: true, value: { id } };
  } catch (err) {
    return writeFailed("editRewardCore", err);
  }
}

/** Archives a reward: archivedAt is set and the row stays (it is listed under Archived). */
export async function archiveRewardCore(userId: string, id: string, deps: MallDeps = {}): Promise<MallResult<null>> {
  const d = depsOf(deps);
  if (!d.writesOn) return { ok: false, error: MALL_WRITES_OFF };
  try {
    const changed = await d.store.archive(userId, id, d.now());
    if (changed !== 1) return { ok: false, error: REWARD_GONE };
    return { ok: true, value: null };
  } catch (err) {
    return writeFailed("archiveRewardCore", err);
  }
}

// ── Buying (P19; D31, D32) ─────────────────────────────────────────────────

/** Another purchase landed twice between this one's read and its write: say so, never guess. */
export const MALL_STALE = "Your credits changed meanwhile. Try again.";
export const PURCHASE_NO_ID = "That purchase has no id. Try again.";

/** What a purchase (or a repeat of one) answers. */
export interface BuyResult {
  /** The purchase as the page lists it (its id is what an undo names). */
  purchase: PurchaseView;
  /** The balance now, whole credits. */
  balance: number;
  /** What this call changed: −price for a new purchase, 0 for a repeat (nothing is spent twice). */
  delta: number;
  duplicate: boolean;
}

/** What an undo (or a repeat of one) answers. */
export interface UndoBuyResult {
  purchaseId: string;
  title: string;
  /** The credits given back. */
  price: number;
  balance: number;
  /** +price for a new undo, 0 for a repeat. */
  delta: number;
  duplicate: boolean;
}

/** The purchase `row` as the page lists it at `nowMs` (undone when one of `rows` gives it back). */
function purchaseViewOf(row: PurchaseRow, rows: readonly PurchaseRow[], nowMs: number): PurchaseView {
  const undos = rows.filter((r) => r.source === "MALL_REFUND" && r.sourceId === row.id);
  return purchasesOf([row, ...undos], nowMs, 1)[0];
}

function purchaseFailed(label: string, err: unknown): { ok: false; error: string } {
  console.error(`[mall] ${label} failed:`, err);
  return { ok: false, error: PURCHASE_FAILED };
}

/**
 * Buys a reward (D31): the price is burnt exactly, never more than the balance. Reads the reward, every Mall row, the
 * user's #play titles and the wallet fresh, plans the purchase (mall.ts planBuy: a title that is #play now stays free,
 * D30; no overdraft; a balance below zero waits; the cooldown), then one
 * transaction: lifeLockOp, the guard that the Mall's rows are still the count it read, and the MALL_BUY row
 * 'buy:<clientId>'. A stale guard (another purchase landed in between) re-reads once and plans again; a second stale
 * guard says so. A resend of the same clientId answers its row (`duplicate`, delta 0): one purchase, written once.
 */
export async function buyRewardCore(userId: string, input: { rewardId: string; clientId: string }, deps: MallDeps = {}): Promise<MallResult<BuyResult>> {
  const d = depsOf(deps);
  if (!d.writesOn) return { ok: false, error: MALL_WRITES_OFF };
  if (!isPurchaseClientId(input.clientId)) return { ok: false, error: PURCHASE_NO_ID };
  const now = d.now();
  const today = todayKey(now);
  if (!creditsOn(today, d.launchDay)) return { ok: false, error: BUY_CREDITS_OFF };
  const key = buyRowKey(input.clientId);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const [reward, rows, wallet, play] = await Promise.all([d.store.byId(userId, input.rewardId), d.purchases.rows(userId), d.freshWallet(userId, now, d.launchDay), d.store.playTitles(userId)]);
      const earned = wallet.live ? wallet.earned : 0;
      const stored = rows.find((r) => r.dedupeKey === key);
      if (stored) return { ok: true, value: { purchase: purchaseViewOf(stored, rows, now.getTime()), balance: balanceOf(earned, rows), delta: 0, duplicate: true } };
      if (!wallet.live) return { ok: false, error: BUY_CREDITS_OFF };
      if (!reward) return { ok: false, error: REWARD_GONE };
      const plan = planBuy({ reward, earned, rows, today, playTitles: new Set(play) });
      if (!plan.ok) return plan;
      const event: PurchaseEvent = {
        source: "MALL_BUY",
        day: today,
        occurredAt: now,
        qty: plan.value.price,
        sourceId: reward.id,
        detail: reward.title,
        dedupeKey: key,
        receipt: receiptOfBuy(reward, plan.value),
      };
      let id: string;
      try {
        id = await d.purchases.commit(userId, { guardCount: rows.length, event });
      } catch (err) {
        if (isDuplicateActivity(err)) {
          // The same clientId landed meanwhile (a resend on another instance): answer the row it wrote.
          const again = await d.purchases.rows(userId);
          const row = again.find((r) => r.dedupeKey === key);
          if (row) return { ok: true, value: { purchase: purchaseViewOf(row, again, now.getTime()), balance: balanceOf(earned, again), delta: 0, duplicate: true } };
          return { ok: false, error: MALL_STALE };
        }
        if (isStaleGuard(err)) continue;
        throw err;
      }
      const row: PurchaseRow = { id, source: "MALL_BUY", day: today, occurredAt: now.toISOString(), qty: plan.value.price, sourceId: reward.id, dedupeKey: key, receipt: event.receipt };
      return { ok: true, value: { purchase: purchaseViewOf(row, [row], now.getTime()), balance: plan.value.balanceAfter, delta: -plan.value.price, duplicate: false } };
    }
    return { ok: false, error: MALL_STALE };
  } catch (err) {
    if (isMissingMallSchema(err)) return writeFailed("buyRewardCore", err);
    return purchaseFailed("buyRewardCore", err);
  }
}

/**
 * Undoes a purchase inside its ten minutes (D31), once: lifeLockOp and the MALL_REFUND row 'refund:<buyId>', its qty
 * the price given back. A repeat answers the first (`duplicate`, delta 0); past the ten minutes it is refused.
 */
export async function undoBuyCore(userId: string, input: { purchaseId: string }, deps: MallDeps = {}): Promise<MallResult<UndoBuyResult>> {
  const d = depsOf(deps);
  if (!d.writesOn) return { ok: false, error: MALL_WRITES_OFF };
  const now = d.now();
  const today = todayKey(now);
  if (!creditsOn(today, d.launchDay)) return { ok: false, error: BUY_CREDITS_OFF };
  try {
    const [rows, wallet] = await Promise.all([d.purchases.rows(userId), d.freshWallet(userId, now, d.launchDay)]);
    const earned = wallet.live ? wallet.earned : 0;
    const buy = rows.find((r) => r.id === input.purchaseId && r.source === "MALL_BUY") ?? null;
    const plan = planRefund({ buy, rows, earned, nowMs: now.getTime() });
    if (!plan.ok || !buy) return plan.ok ? { ok: false, error: REWARD_GONE } : plan;
    const b: PurchaseRow = buy;
    const title = isMallReceipt(b.receipt) ? b.receipt.title : "A purchase";
    const answer = (duplicate: boolean, balance: number): MallResult<UndoBuyResult> => ({
      ok: true,
      value: { purchaseId: b.id, title, price: plan.value.price, balance, delta: duplicate ? 0 : plan.value.price, duplicate },
    });
    if (plan.value.duplicate) return answer(true, plan.value.balanceAfter);
    const event: PurchaseEvent = {
      source: "MALL_REFUND",
      day: today,
      occurredAt: now,
      qty: plan.value.price,
      sourceId: b.id,
      detail: title,
      dedupeKey: refundRowKey(b.id),
      receipt: receiptOfRefund(b, plan.value),
    };
    try {
      await d.purchases.commit(userId, { guardCount: null, event });
    } catch (err) {
      if (!isDuplicateActivity(err)) throw err;
      // Undone meanwhile (a double tap, the other device): the first undo stands.
      const again = await d.purchases.rows(userId);
      return refundedBuyIds(again).has(b.id) ? answer(true, balanceOf(earned, again)) : { ok: false, error: MALL_STALE };
    }
    return answer(false, plan.value.balanceAfter);
  } catch (err) {
    return purchaseFailed("undoBuyCore", err);
  }
}

const defaultMallMoments: MallMoments = {
  capture: async (userId, now) => {
    const { captureSnapshot } = await import("./celebrations");
    return captureSnapshot(userId, { scope: "mall", now: new Date(now.getTime()) });
  },
  detect: async (before, after, now) => {
    const { detectCelebrations } = await import("./celebrations");
    return detectCelebrations(before as ProgressSnapshot, after as ProgressSnapshot, { cause: "mall", now });
  },
};

/**
 * A purchase with its moments (the snapshot → write → detect pattern, today-board withMoments): the 'mall' scope before
 * and after, so a new purchase plays its T2 Seal 'mall-buy' (celebration-detect detectMall; celebrations.ts persists it,
 * never this file). A refusal, or a repeat (`changed` false), takes no second snapshot. Decoration only: it never costs
 * the write.
 */
export async function withMallMoments<T>(
  userId: string,
  write: () => Promise<MallResult<T>>,
  changed: (value: T) => boolean,
  deps: Pick<MallDeps, "moments"> = {}
): Promise<MallResult<T & { celebrations: CelebrationEvent[] }>> {
  const moments = deps.moments === undefined ? defaultMallMoments : deps.moments;
  if (moments === false) {
    const res = await write();
    return res.ok ? { ok: true, value: { ...res.value, celebrations: [] } } : res;
  }
  return withMoments<T, unknown, CelebrationEvent>({
    snapshot: () => moments.capture(userId, new Date()),
    detect: (before, after) => moments.detect(before, after, new Date()),
    write,
    changed,
  });
}

/**
 * The celebrations' 'mall' part (snapshot.ts; blueprint P19): the latest purchases, each with its receipt's price and
 * balance either side, and whether it was undone. Null with no read while credits are off on `now`'s life day, so the
 * part is left out and nothing Mall-shaped can play while CREDITS_LAUNCH_DAY is null. A read, never a write.
 */
export async function readMallPart(userId: string, now: Date, deps: Pick<MallDeps, "purchases" | "launchDay"> = {}): Promise<MallPart | null> {
  const launch = deps.launchDay === undefined ? creditsLaunchDay() : deps.launchDay;
  if (!creditsOn(todayKey(now), launch)) return null;
  const rows = await (deps.purchases ?? prismaPurchaseStore).rows(userId);
  const undone = refundedBuyIds(rows);
  const buys = rows
    .filter((r) => r.source === "MALL_BUY")
    .slice(-PURCHASES_SHOWN)
    .map((r) => {
      const receipt = isMallReceipt(r.receipt) ? r.receipt : null;
      return { id: r.id, day: r.day, title: receipt?.title ?? "A purchase", price: Math.max(0, Math.round(r.qty ?? 0)), before: receipt?.balanceBefore ?? null, after: receipt?.balanceAfter ?? null, refunded: undone.has(r.id) };
    });
  return { buys };
}
