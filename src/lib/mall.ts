/**
 * The Mall's catalog (blueprint 4.3; docs/life-plan/blueprint-plan-2026-10-22.md P18, decision D30 in
 * docs/life-plan/blueprint-2026-10-22.md): the rewards the user lists, each with a price in credits; and (P19,
 * blueprint 4.4 and 4.5, D31 and D32) the rules a purchase keeps. This is the list, its rules and its words.
 *
 * BUYING (P19, D31, harm H6): a purchase burns exactly its price, and never more than the balance: no overdraft, no
 * credit line. A reward's cooldown holds between purchases (an undone one does not count). A purchase can be undone
 * for MALL_UNDO_MINUTES (ten) on the server's clock, once. When an undone quest takes back credits a purchase had
 * already spent, the balance shows plainly below zero ("−10 cr · earn it back") and buying waits until it is back at
 * zero: that is the only way a balance goes negative, and nothing here charges it. Penalties never touch credits: no
 * debt, forgetting or missed day is read here. A purchase is permission now: the receipt ({v: 'mall-1', …}) freezes the
 * price and the balance either side on the row, so a later edit of the reward never reprices it. Deterministic (D32):
 * the same rows give the same answer; chance stays with the chest and crits.
 *
 * ONLY WHAT THE USER LISTS IS PRICED (D30, harm H5). There are no starter rewards: the Mall starts empty and nothing is
 * listed for the user (the Add form's category examples are neutral hints, never rewards, and never a hobby). #play,
 * rest days and sleep are never priced: a title that names #play, sleep, a nap or a rest day is refused, and so is one
 * that is a #play task on the user's own board (the same normalised title). The same check runs again at every buy, so
 * a reward whose title has since become a #play task stays free: it can't be bought, and the line says to archive it.
 * What is done for its own sake, and recovery, stay free. The app can't block leisure, so the Mall is a commitment
 * device: it runs on honour, and the page says so.
 *
 * A record of what the user will pay, never a payment: nothing here pays or costs XP, MP, a Domain point, capital or a
 * credit (scripts/credits-check.ts holds it for every mall* file). Prices are whole credits from 1 to 100,000 (the
 * MallReward_price_check in migration 20261231000000_mall refuses 0 and 100001 as validatePrice does).
 *
 * The price hint ("≈ 2 good days") is deterministic (D32): a good day is the middle of the days that earned credits
 * in the last 28 complete life days, read from the credits fold; "calibrating" until credits have counted for 14
 * complete days, and while credits are off (CREDITS_LAUNCH_DAY null).
 *
 * Pure and client-importable: life-day, life-lexicon and credits.ts's copy helpers; no Prisma, no clock (an instant is
 * always handed in). The reads and the only writer are mall-server.ts.
 *
 *   Catalog  MallCategory · MALL_CATEGORIES · MALL_CATEGORY_LABEL · MALL_CATEGORY_EXAMPLES · isMallCategory(v)
 *            REWARD_TITLE_MAX · REWARD_NOTE_MAX · PRICE_MIN · PRICE_MAX · COOLDOWN_MIN · COOLDOWN_MAX · REWARDS_MAX
 *   Rules    MallResult · RewardInput · RewardPatch · RewardData · MallRewardRow · validatePrice(raw) ·
 *            validateCooldown(raw) · freeRefusalOf(title, playTitles) · freeBuyRefusal(why) · cleanRewardInput(input,
 *            ctx) · planRewardEdit(row, patch, ctx) · REWARD_GONE
 *   Hint     HINT_MIN_DAYS · HINT_WINDOW_DAYS · PRICE_HINT_CALIBRATING · GoodDay · goodDayOf(input) ·
 *            priceHint(price, goodDay) · goodDayLine(goodDay)
 *   Buying   MALL_UNDO_MINUTES · MALL_UNDO_MS · MALL_RECEIPT_V · PURCHASES_SHOWN · PurchaseSource · buyRowKey(clientId) ·
 *            refundRowKey(buyId) · isPurchaseClientId(v) · MallReceipt · isMallReceipt(v) · PurchaseRow ·
 *            refundedBuyIds(rows) · spendsOf(rows) · balanceOf(earned, rows) · cooldownUntil(rewardId, days, rows,
 *            today) · BuyPlan · planBuy(input) · receiptOfBuy(reward, plan) · RefundPlan · planRefund(input) ·
 *            receiptOfRefund(buy, plan) · undoUntilMs(buy)
 *   Views    RewardView · rewardViewOf(row, goodDay) · MallGroup · groupsOf(rewards) · mallWalletLines(wallet) ·
 *            BuyState · BuyContext · buyStateOf(reward, ctx) · PurchaseView · clockOf(ms) · purchasesOf(rows, nowMs,
 *            limit?)
 *   Copy     priceLine(price) · cooldownLine(days) · rewardCountLabel(n) · dayLabelOf(day) · MALL_HONOUR · MALL_FREE ·
 *            MALL_ONLY_YOURS · MALL_BUYING · MALL_EMPTY · MALL_EARN_BACK · BUY_CREDITS_OFF · PURCHASE_GONE ·
 *            PURCHASE_FAILED · UNDO_TOO_LATE · negativeLine(balance) · shortLine(title, price, balance) · cooldownRefusal(days, next) ·
 *            boughtLine(title, price, balance) · undoneLine(title, price)
 */
import { LIFE_TZ, addDays, daysBetween, type DayKey } from "./life-day";
import { normTitleOf } from "./life-lexicon";
import { CREDIT_UNIT, crFigure, walletTodayLine, type CREDIT_SPEND_SOURCES, type CreditDay, type CreditsWallet } from "./credits";

// ── The catalog ───────────────────────────────────────────────────────────

export type MallCategory = "TREAT" | "SCREEN" | "OUTING" | "PURCHASE" | "OTHER";
/** The page's order (and the MallReward_category_check's set). */
export const MALL_CATEGORIES: readonly MallCategory[] = ["TREAT", "SCREEN", "OUTING", "PURCHASE", "OTHER"];

export const MALL_CATEGORY_LABEL: Readonly<Record<MallCategory, string>> = {
  TREAT: "Treats",
  SCREEN: "Screen time",
  OUTING: "Outings",
  PURCHASE: "Purchases",
  OTHER: "Other",
};

/**
 * What each category holds, as the Add form's hint says it: neutral examples of the kind of thing, never a listed
 * reward (nothing is listed for the user), and never a hobby or a rest (D30, harm H5: what the user does for its own
 * sake, and recovery, stay free, so no example names a game, a sport, a trip or a day off).
 */
export const MALL_CATEGORY_EXAMPLES: Readonly<Record<MallCategory, string>> = {
  TREAT: "a takeaway, a dessert, a coffee out",
  SCREEN: "an episode, a film, a box set",
  OUTING: "a night out, a gig, a show",
  PURCHASE: "gear, clothes, a gadget",
  OTHER: "anything else you'd like to earn",
};

export const isMallCategory = (v: unknown): v is MallCategory => typeof v === "string" && (MALL_CATEGORIES as readonly string[]).includes(v);

export const REWARD_TITLE_MAX = 60;
export const REWARD_NOTE_MAX = 200;
export const PRICE_MIN = 1;
export const PRICE_MAX = 100_000;
export const COOLDOWN_MIN = 1;
export const COOLDOWN_MAX = 365;
/** Live rewards at most (an archive frees a place). */
export const REWARDS_MAX = 60;

// ── The rules ─────────────────────────────────────────────────────────────

export type MallResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** What the Add form and POST /mall/rewards send: the price and the cooldown as typed (a number, or its digits). */
export interface RewardInput {
  title: string;
  category: string;
  price: number | string;
  note?: string | null;
  cooldownDays?: number | string | null;
}

/** An edit: omitted fields stay; a null note or cooldown clears it. */
export interface RewardPatch {
  title?: string;
  category?: string;
  price?: number | string;
  note?: string | null;
  cooldownDays?: number | string | null;
}

/** A reward's stored fields, cleaned. */
export interface RewardData {
  title: string;
  category: MallCategory;
  price: number;
  note: string | null;
  cooldownDays: number | null;
}

/** A row as the server reads it (ISO instants). */
export interface MallRewardRow extends RewardData {
  id: string;
  sortOrder: number;
  createdAt: string;
  archivedAt: string | null;
}

export const REWARD_GONE = "That reward is gone.";
export const PRICE_RANGE_LINE = `A price is a whole number of credits from ${PRICE_MIN} to ${PRICE_MAX.toLocaleString("en-GB")}.`;
export const COOLDOWN_RANGE_LINE = `A cooldown is a whole number of days from ${COOLDOWN_MIN} to ${COOLDOWN_MAX}, or none.`;
export const FREE_PLAY_LINE = "#play stays free: the Mall never prices what you do for its own sake.";
export const FREE_REST_LINE = "Sleep, naps and rest days stay free: the Mall never prices them.";

/** A whole number as typed: a number, or its digits with spaces, commas or underscores between them ("1,000"). */
function wholeOf(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isInteger(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\s,_]/g, "");
  return /^\d{1,9}$/.test(s) ? Number(s) : null;
}

/** A price: whole credits, PRICE_MIN to PRICE_MAX. 0 and PRICE_MAX + 1 are refused (as the table's CHECK refuses them). */
export function validatePrice(raw: unknown): MallResult<number> {
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return { ok: false, error: "Give it a price in credits." };
  const n = wholeOf(raw);
  if (n == null || n < PRICE_MIN || n > PRICE_MAX) return { ok: false, error: PRICE_RANGE_LINE };
  return { ok: true, value: n };
}

/** A cooldown: none (null, or left empty), else whole days, COOLDOWN_MIN to COOLDOWN_MAX. */
export function validateCooldown(raw: unknown): MallResult<number | null> {
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return { ok: true, value: null };
  const n = wholeOf(raw);
  if (n == null || n < COOLDOWN_MIN || n > COOLDOWN_MAX) return { ok: false, error: COOLDOWN_RANGE_LINE };
  return { ok: true, value: n };
}

/** The tag, as the board writes it. */
const PLAY_TAG = /(^|\s)#play\b/i;
/** Sleep, naps and rest days, as words (never inside another: "restaurant" and "interest" pass). */
const REST_WORDS = /\b(sleep|sleeps|sleeping|sleep-in|lie-in|lie in|nap|naps|napping|rest|rests|resting|rest day|rest days|day off|days off)\b/i;

/**
 * Why a title must stay free (D30), or null: it names #play, sleep, a nap or a rest day, or it is a #play task on the
 * user's own board (`playTitles`: their live #play templates' normalised titles, life-lexicon normTitleOf).
 */
export function freeRefusalOf(title: string, playTitles: ReadonlySet<string>): string | null {
  if (PLAY_TAG.test(title)) return FREE_PLAY_LINE;
  if (REST_WORDS.test(title)) return FREE_REST_LINE;
  if (playTitles.has(normTitleOf(title))) return `“${title}” is #play on your board, so it stays free.`;
  return null;
}

/**
 * A listed reward that has since become free (D30: a #play task on the board took its title, or the free words now
 * name it): it is never bought, and the line says what to do. Editing it is refused for the same reason, so archive.
 */
export function freeBuyRefusal(why: string): string {
  return `${why} It can't be bought: archive this reward.`;
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

export interface RewardContext {
  /** The user's live rewards (their titles, for the one-a-title rule; their count, for REWARDS_MAX). */
  live: readonly Pick<MallRewardRow, "id" | "title">[];
  /** Normalised titles of the user's live #play tasks. */
  playTitles: ReadonlySet<string>;
  /** The reward being edited (its own title is not a duplicate, and it takes no new place). */
  selfId?: string;
}

/** A new reward's fields, cleaned and checked; or the line saying why not. */
export function cleanRewardInput(input: RewardInput, ctx: RewardContext): MallResult<RewardData> {
  if (ctx.selfId == null && ctx.live.length >= REWARDS_MAX) return { ok: false, error: `${REWARDS_MAX} rewards is the most: archive one first.` };
  const title = oneLine(typeof input.title === "string" ? input.title : "");
  if (!title) return { ok: false, error: "Name the reward." };
  if (title.length > REWARD_TITLE_MAX) return { ok: false, error: `Keep the name to ${REWARD_TITLE_MAX} characters.` };
  const free = freeRefusalOf(title, ctx.playTitles);
  if (free) return { ok: false, error: free };
  const lower = title.toLowerCase();
  if (ctx.live.some((r) => r.id !== ctx.selfId && r.title.toLowerCase() === lower)) return { ok: false, error: `You already list “${title}”.` };
  if (!isMallCategory(input.category)) return { ok: false, error: "Pick a category." };
  const price = validatePrice(input.price);
  if (!price.ok) return price;
  const noteText = oneLine(typeof input.note === "string" ? input.note : "");
  if (noteText.length > REWARD_NOTE_MAX) return { ok: false, error: `Keep the note to ${REWARD_NOTE_MAX} characters.` };
  const cooldown = validateCooldown(input.cooldownDays);
  if (!cooldown.ok) return cooldown;
  return { ok: true, value: { title, category: input.category, price: price.value, note: noteText || null, cooldownDays: cooldown.value } };
}

/** An edit over the row as it stands: omitted fields keep the row's, then the same checks as a new reward. */
export function planRewardEdit(row: MallRewardRow, patch: RewardPatch, ctx: Omit<RewardContext, "selfId">): MallResult<RewardData> {
  return cleanRewardInput(
    {
      title: patch.title ?? row.title,
      category: patch.category ?? row.category,
      price: patch.price ?? row.price,
      note: patch.note === undefined ? row.note : patch.note,
      cooldownDays: patch.cooldownDays === undefined ? row.cooldownDays : patch.cooldownDays,
    },
    { ...ctx, selfId: row.id }
  );
}

// ── The price hint ────────────────────────────────────────────────────────

/** Complete life days of credits before a hint is shown. */
export const HINT_MIN_DAYS = 14;
/** The window a good day is read from: the last 28 complete life days (never before the launch day). */
export const HINT_WINDOW_DAYS = 28;
export const PRICE_HINT_CALIBRATING = "calibrating";

/** A good day: the middle (median) of the days that earned credits in the window; calibrating without enough data. */
export type GoodDay =
  | { calibrating: true; /** Complete days counted so far (0 while credits are off). */ days: number }
  | { calibrating: false; credits: number; /** The window's complete days. */ days: number; /** Of them, the days that earned credits. */ earningDays: number };

export interface GoodDayInput {
  /** CREDITS_LAUNCH_DAY in force (null: credits are off). */
  launchDay: DayKey | null;
  today: DayKey;
  /** Each day that earned credits (credits.ts earnedDaysOf). */
  days: readonly CreditDay[];
}

/** The good day the hints divide by (deterministic: the same rows give the same hint on every server). */
export function goodDayOf(input: GoodDayInput): GoodDay {
  const { launchDay, today } = input;
  if (launchDay == null || today <= launchDay) return { calibrating: true, days: 0 };
  const complete = daysBetween(launchDay, today);
  if (complete < HINT_MIN_DAYS) return { calibrating: true, days: complete };
  const from = complete > HINT_WINDOW_DAYS ? addDays(today, -HINT_WINDOW_DAYS) : launchDay;
  const earned = input.days
    .filter((d) => d.day >= from && d.day < today && d.earned > 0)
    .map((d) => d.earned)
    .sort((a, b) => a - b);
  if (earned.length === 0) return { calibrating: true, days: complete };
  const mid = earned.length >> 1;
  const median = earned.length % 2 === 1 ? earned[mid] : (earned[mid - 1] + earned[mid]) / 2;
  return { calibrating: false, credits: Math.max(1, Math.round(median)), days: Math.min(complete, HINT_WINDOW_DAYS), earningDays: earned.length };
}

/** "≈ 2 good days", "≈ 1 good day", "under half a good day"; "calibrating" without a good day. */
export function priceHint(price: number, good: GoodDay): string {
  if (good.calibrating) return PRICE_HINT_CALIBRATING;
  const r = price / good.credits;
  if (r < 0.5) return "under half a good day";
  const n = Math.round(r);
  return n === 1 ? "≈ 1 good day" : `≈ ${n.toLocaleString("en-GB")} good days`;
}

/** What a good day is, in one line, or why the hints are still calibrating. */
export function goodDayLine(good: GoodDay, creditsOn: boolean): string {
  if (!creditsOn) return "Price hints wait for credits: they read your own days once credits are counted.";
  if (good.calibrating) {
    return good.days < HINT_MIN_DAYS
      ? `Price hints are calibrating: they need ${HINT_MIN_DAYS} days of credits (${good.days} so far).`
      : `Price hints are calibrating: no day in the last ${HINT_WINDOW_DAYS} earned credits yet.`;
  }
  return `A good day is ${crFigure(good.credits)} ${CREDIT_UNIT}: the middle of the ${good.earningDays === 1 ? "day" : `${good.earningDays} days`} that earned credits in the last ${good.days}.`;
}

// ── Buying (P19; D31, D32) ──────────────────────────────────────────────────

/** How long a purchase can be undone (D31): ten minutes from the buy, on the server's clock. */
export const MALL_UNDO_MINUTES = 10;
export const MALL_UNDO_MS = MALL_UNDO_MINUTES * 60_000;
/** The receipt's version: the price and the balance either side, frozen on the row (an edit never reprices it). */
export const MALL_RECEIPT_V = "mall-1";
/** The purchases the page and the phone list, newest first. */
export const PURCHASES_SHOWN = 20;

/** The Mall's two ledger sources (credits.ts CREDIT_SPEND_SOURCES): a purchase, and its undo. */
export type PurchaseSource = (typeof CREDIT_SPEND_SOURCES)[number];

/** A purchase's row key: the client's id for it, so a resend (a retry, the phone and the browser) writes it once. */
export const buyRowKey = (clientId: string): string => `buy:${clientId}`;
/** An undo's row key: the purchase's own row id, so a purchase is undone once. */
export const refundRowKey = (buyId: string): string => `refund:${buyId}`;
/** A purchase's client id (a UUID from the browser or the phone): 8 to 64 of A–Z a–z 0–9 _ -. */
export const isPurchaseClientId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v);

/** What a MALL_BUY (or MALL_REFUND) row stores: the price and the balance it was made on, whole credits. */
export interface MallReceipt {
  v: typeof MALL_RECEIPT_V;
  kind: "BUY" | "REFUND";
  rewardId: string;
  title: string;
  category: MallCategory;
  price: number;
  /** The balance the purchase (or its undo) was made on, and the balance it left. */
  balanceBefore: number;
  balanceAfter: number;
  /** The reward's cooldown when it was bought (null with none). */
  cooldownDays: number | null;
  /** A refund: the purchase it gives back. */
  buyId?: string;
}

export function isMallReceipt(v: unknown): v is MallReceipt {
  if (!v || typeof v !== "object") return false;
  const r = v as Partial<MallReceipt>;
  return r.v === MALL_RECEIPT_V && (r.kind === "BUY" || r.kind === "REFUND") && typeof r.title === "string" && typeof r.price === "number" && typeof r.balanceBefore === "number" && typeof r.balanceAfter === "number";
}

/** A Mall ledger row as the server reads it (an ActivityEvent of MALL_BUY or MALL_REFUND; an ISO instant). */
export interface PurchaseRow {
  id: string;
  source: string;
  day: DayKey;
  occurredAt: string;
  /** The credits it took (a purchase) or gave back (an undo). */
  qty: number | null;
  /** A purchase: the reward's id. An undo: the purchase's row id. */
  sourceId: string | null;
  dedupeKey: string | null;
  receipt: unknown;
}

const credits = (n: number | null | undefined): number => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
const isBuy = (r: Pick<PurchaseRow, "source">) => r.source === "MALL_BUY";
const isRefund = (r: Pick<PurchaseRow, "source">) => r.source === "MALL_REFUND";

/** The purchases undone: each undo's purchase id (its sourceId, else its key's). */
export function refundedBuyIds(rows: readonly PurchaseRow[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    if (!isRefund(r)) continue;
    const id = r.sourceId ?? (r.dedupeKey?.startsWith("refund:") ? r.dedupeKey.slice("refund:".length) : null);
    if (id) out.add(id);
  }
  return out;
}

/** Spent and given back over the Mall's rows, whole credits (credits.ts foldCredits sums the same rows the same way). */
export function spendsOf(rows: readonly PurchaseRow[]): { spent: number; refunded: number } {
  let spent = 0;
  let refunded = 0;
  for (const r of rows) {
    if (isBuy(r)) spent += credits(r.qty);
    else if (isRefund(r)) refunded += credits(r.qty);
  }
  return { spent, refunded };
}

/** What the Mall's rows leave of what was earned: earned − spent + refunded (the wallet's own balance). */
export function balanceOf(earned: number, rows: readonly PurchaseRow[]): number {
  const s = spendsOf(rows);
  return Math.round(earned) - s.spent + s.refunded;
}

/**
 * The first life day `rewardId` can be bought again under a cooldown of `days`, while that day is still ahead of
 * `today`; null with no cooldown, never bought, or past it. An undone purchase does not count.
 */
export function cooldownUntil(rewardId: string, days: number | null, rows: readonly PurchaseRow[], today: DayKey): DayKey | null {
  if (days == null || days < 1) return null;
  const undone = refundedBuyIds(rows);
  let last: DayKey | null = null;
  for (const r of rows) if (isBuy(r) && r.sourceId === rewardId && !undone.has(r.id) && (last == null || r.day > last)) last = r.day;
  if (last == null) return null;
  const next = addDays(last, days);
  return today < next ? next : null;
}

/** What a purchase will burn: the price, and the balance either side (never below zero: no overdraft). */
export interface BuyPlan {
  price: number;
  balanceBefore: number;
  balanceAfter: number;
}

export interface BuyPlanInput {
  reward: MallRewardRow;
  /** Every credit earned so far (the wallet's `earned`). */
  earned: number;
  /** Every Mall row of the user (the purchases and their undos). */
  rows: readonly PurchaseRow[];
  today: DayKey;
  /** Normalised titles of the user's live #play tasks, read at the buy (D30: a title that became #play stays free). */
  playTitles: ReadonlySet<string>;
}

/**
 * A purchase, or why not (D30, D31): an archived reward is gone; a title that is free now (a #play task on the board
 * shares it, or it names sleep, a nap or a rest day) is never bought; a balance below zero (an undo took back credits a
 * purchase had spent) waits until it is earned back; a price above the balance is refused (no overdraft, no credit
 * line); a cooldown holds until its day. Nothing here reads a debt, a penalty or a roll.
 */
export function planBuy(input: BuyPlanInput): MallResult<BuyPlan> {
  const { reward, rows, today } = input;
  if (reward.archivedAt != null) return { ok: false, error: REWARD_GONE };
  const free = freeRefusalOf(reward.title, input.playTitles);
  if (free) return { ok: false, error: freeBuyRefusal(free) };
  const balance = balanceOf(input.earned, rows);
  if (balance < 0) return { ok: false, error: negativeLine(balance) };
  const price = credits(reward.price);
  if (price < PRICE_MIN) return { ok: false, error: PRICE_RANGE_LINE };
  // The reward's own rule first: in a cooldown, more credits would not help.
  const next = cooldownUntil(reward.id, reward.cooldownDays, rows, today);
  if (next) return { ok: false, error: cooldownRefusal(reward.cooldownDays as number, next) };
  if (price > balance) return { ok: false, error: shortLine(reward.title, price, balance) };
  return { ok: true, value: { price, balanceBefore: balance, balanceAfter: balance - price } };
}

/** The purchase's receipt: the price, the balance either side and the reward as it stood (an edit never reprices it). */
export function receiptOfBuy(reward: MallRewardRow, plan: BuyPlan): MallReceipt {
  return { v: MALL_RECEIPT_V, kind: "BUY", rewardId: reward.id, title: reward.title, category: reward.category, price: plan.price, balanceBefore: plan.balanceBefore, balanceAfter: plan.balanceAfter, cooldownDays: reward.cooldownDays };
}

/** The instant a purchase stops being undoable (ms): ten minutes after it was made. */
export function undoUntilMs(buy: Pick<PurchaseRow, "occurredAt">): number {
  return Date.parse(buy.occurredAt) + MALL_UNDO_MS;
}

/** An undo: the credits it gives back and the balance either side; `duplicate` when it was undone already. */
export interface RefundPlan {
  price: number;
  balanceBefore: number;
  balanceAfter: number;
  duplicate: boolean;
}

export interface RefundPlanInput {
  /** The purchase's row (null: no such purchase). */
  buy: PurchaseRow | null;
  rows: readonly PurchaseRow[];
  earned: number;
  /** The server's clock, in ms. */
  nowMs: number;
}

/** An undo, or why not (D31): only a purchase, only once (a repeat answers the first), only inside its ten minutes. */
export function planRefund(input: RefundPlanInput): MallResult<RefundPlan> {
  const { buy, rows } = input;
  if (!buy || !isBuy(buy)) return { ok: false, error: PURCHASE_GONE };
  const price = credits(buy.qty);
  const balance = balanceOf(input.earned, rows);
  if (refundedBuyIds(rows).has(buy.id)) return { ok: true, value: { price, balanceBefore: balance, balanceAfter: balance, duplicate: true } };
  if (!(input.nowMs <= undoUntilMs(buy))) return { ok: false, error: UNDO_TOO_LATE };
  return { ok: true, value: { price, balanceBefore: balance, balanceAfter: balance + price, duplicate: false } };
}

/** An undo's receipt: the purchase it gives back, and the balance either side. */
export function receiptOfRefund(buy: PurchaseRow, plan: RefundPlan): MallReceipt {
  const r = isMallReceipt(buy.receipt) ? buy.receipt : null;
  return {
    v: MALL_RECEIPT_V,
    kind: "REFUND",
    rewardId: r?.rewardId ?? buy.sourceId ?? "",
    title: r?.title ?? "A purchase",
    category: r?.category ?? "OTHER",
    price: plan.price,
    balanceBefore: plan.balanceBefore,
    balanceAfter: plan.balanceAfter,
    cooldownDays: r?.cooldownDays ?? null,
    buyId: buy.id,
  };
}

// ── The views ─────────────────────────────────────────────────────────────

/** A reward as the page and the phone show it. */
export interface RewardView extends MallRewardRow {
  categoryLabel: string;
  /** "120 cr". */
  priceLine: string;
  /** "≈ 2 good days" or "calibrating". */
  hint: string;
  /** "at most once every 7 days"; null with none. */
  cooldownLine: string | null;
}

export function rewardViewOf(row: MallRewardRow, good: GoodDay): RewardView {
  return { ...row, categoryLabel: MALL_CATEGORY_LABEL[row.category], priceLine: priceLine(row.price), hint: priceHint(row.price, good), cooldownLine: cooldownLine(row.cooldownDays) };
}

export interface MallGroup {
  category: MallCategory;
  label: string;
  rewards: RewardView[];
}

/** The live rewards by category (MALL_CATEGORIES order, only the categories that hold one), each in the user's order. */
export function groupsOf(rewards: readonly RewardView[]): MallGroup[] {
  const ordered = [...rewards].sort((a, b) => a.sortOrder - b.sortOrder || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  return MALL_CATEGORIES.flatMap((category) => {
    const list = ordered.filter((r) => r.category === category);
    return list.length ? [{ category, label: MALL_CATEGORY_LABEL[category], rewards: list }] : [];
  });
}

/**
 * The wallet header's two lines: the balance and today's, or why there is none (credits off, or unread). Below zero
 * (an undone quest took back credits a purchase had spent: P19) it says so plainly: "−10 cr", "earn it back: …".
 */
export function mallWalletLines(wallet: CreditsWallet | null): { balance: string | null; line: string } {
  if (!wallet) return { balance: null, line: "Your credits couldn't be read just now." };
  if (!wallet.live) return { balance: null, line: "Credits aren't counted yet: they start at none on the day they are switched on." };
  if (wallet.balance < 0) return { balance: `${crFigure(wallet.balance)} ${CREDIT_UNIT}`, line: `${MALL_EARN_BACK}: buying waits until you're back at 0` };
  return { balance: `${crFigure(wallet.balance)} ${CREDIT_UNIT}`, line: walletTodayLine(wallet) };
}

/** Whether a reward can be bought now, or the one line saying why not (the server checks it all again at the buy). */
export type BuyState = { can: true; why: null } | { can: false; why: string };

export interface BuyContext {
  /** The wallet (null: unread). */
  wallet: CreditsWallet | null;
  /** The Mall's rows were read (false: the purchases couldn't be read, so nothing is offered). */
  rowsRead: boolean;
  rows: readonly PurchaseRow[];
  writesOn: boolean;
  ready: boolean;
  today: DayKey;
  /** Normalised titles of the user's live #play tasks; null when they couldn't be read (so nothing is offered). */
  playTitles: ReadonlySet<string> | null;
}

/** The Buy button's state for one reward: the page shows Buy only while it can, else the line. */
export function buyStateOf(reward: MallRewardRow, ctx: BuyContext): BuyState {
  const no = (why: string): BuyState => ({ can: false, why });
  if (!ctx.ready) return no("The Mall isn't set up on this database yet.");
  if (!ctx.wallet) return no("Your credits couldn't be read just now.");
  if (!ctx.wallet.live) return no(BUY_CREDITS_OFF);
  if (!ctx.writesOn) return no("Purchases are recorded only on the live app.");
  if (!ctx.rowsRead) return no("Your purchases couldn't be read just now.");
  if (!ctx.playTitles) return no("Your board couldn't be read just now.");
  // A title that is free now (D30) says so first: no balance would make it buyable.
  const free = freeRefusalOf(reward.title, ctx.playTitles);
  if (free) return no(freeBuyRefusal(free));
  // The header's own figure below zero refuses too, so the page never offers a buy its wallet says can't be paid.
  if (ctx.wallet.balance < 0) return no(negativeLine(ctx.wallet.balance));
  const plan = planBuy({ reward, earned: ctx.wallet.earned, rows: ctx.rows, today: ctx.today, playTitles: ctx.playTitles });
  return plan.ok ? { can: true, why: null } : no(plan.error);
}

/** A purchase as the page and the phone list it. */
export interface PurchaseView {
  /** The MALL_BUY row's id (the undo names it). */
  id: string;
  rewardId: string | null;
  title: string;
  price: number;
  /** "120 cr". */
  priceLine: string;
  day: DayKey;
  occurredAt: string;
  /** "21:05", the life day's clock (LIFE_TZ), so the server and the browser draw the same words. */
  at: string;
  refunded: boolean;
  /** Until when (ms) it can be undone; null once undone or past its ten minutes. */
  undoUntilMs: number | null;
  /** That instant on the life day's clock ("21:15", LIFE_TZ), drawn here so the page draws no zone of its own; null with none. */
  undoUntilAt: string | null;
  /** "Bought at 21:05", "Bought Tue 20 Oct · undone, 120 cr back". */
  line: string;
}

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: LIFE_TZ });

/** "21:05": an instant (ms) on the life day's clock (LIFE_TZ, the zone every life day is read in). */
export function clockOf(ms: number): string {
  return Number.isFinite(ms) ? TIME.format(ms) : "";
}

/** The latest purchases, newest first (at most `limit`), each with its undo window at `nowMs`. */
export function purchasesOf(rows: readonly PurchaseRow[], nowMs: number, limit = PURCHASES_SHOWN): PurchaseView[] {
  const undone = refundedBuyIds(rows);
  return rows
    .filter(isBuy)
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : a.id < b.id ? 1 : -1))
    .slice(0, Math.max(0, limit))
    .map((r) => {
      const receipt = isMallReceipt(r.receipt) ? r.receipt : null;
      const price = credits(r.qty);
      const refunded = undone.has(r.id);
      const until = undoUntilMs(r);
      const at = clockOf(Date.parse(r.occurredAt));
      const when = `Bought ${at ? `${dayLabelOf(r.day)} at ${at}` : dayLabelOf(r.day)}`;
      return {
        id: r.id,
        rewardId: receipt?.rewardId ?? r.sourceId,
        title: receipt?.title ?? "A purchase",
        price,
        priceLine: priceLine(price),
        day: r.day,
        occurredAt: r.occurredAt,
        at,
        refunded,
        undoUntilMs: !refunded && nowMs <= until ? until : null,
        undoUntilAt: !refunded && nowMs <= until ? clockOf(until) : null,
        line: refunded ? `${when} · undone, ${priceLine(price)} back` : when,
      };
    });
}

// ── Copy ──────────────────────────────────────────────────────────────────

/** "120 cr". */
export function priceLine(price: number): string {
  return `${crFigure(price)} ${CREDIT_UNIT}`;
}

/** "at most once a day", "at most once every 7 days"; null with no cooldown. */
export function cooldownLine(days: number | null): string | null {
  if (days == null) return null;
  return days === 1 ? "at most once a day" : `at most once every ${days} days`;
}

/** "1 reward", "4 rewards". */
export function rewardCountLabel(n: number): string {
  return n === 1 ? "1 reward" : `${n} rewards`;
}

/** "Tue 27 Oct" for a life day (its own calendar date, read in UTC so no zone can move it). */
const DAY_LABEL = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export function dayLabelOf(day: DayKey): string {
  const [y, m, d] = day.split("-").map(Number);
  return DAY_LABEL.format(Date.UTC(y, m - 1, d)).replace(/,/g, "");
}

export const MALL_HONOUR = "The app can't block leisure, so the Mall is a commitment device: it runs on honour. You buy a reward before you take it, and the promise is yours to keep.";
export const MALL_FREE = "#play, rest days and sleep are never priced: what you do for its own sake, and your recovery, stay free.";
export const MALL_ONLY_YOURS = "Only the rewards you list are priced. The Mall starts empty: nothing is listed for you.";
export const MALL_BUYING = `A purchase is permission now: buy the reward, then take it. You can't spend more than you have, and a purchase can be undone for ${MALL_UNDO_MINUTES} minutes.`;
export const MALL_EMPTY = "No rewards yet. List what you'd like to earn, and give each a price in credits.";
/** After an undo-driven drop below zero (P19): the balance is shown as it is, and buying waits. */
export const MALL_EARN_BACK = "earn it back";
export const BUY_CREDITS_OFF = "Credits aren't counted yet, so nothing can be bought.";
export const PURCHASE_GONE = "That purchase is gone.";
/** A purchase or an undo that failed on the server (never a refusal): the phone answers it as 'server'. */
export const PURCHASE_FAILED = "Couldn't record that purchase. Try again.";
export const UNDO_TOO_LATE = `Too late to undo: a purchase can be undone for ${MALL_UNDO_MINUTES} minutes.`;

/** "You're at −10 cr: earn it back before you buy." */
export function negativeLine(balance: number): string {
  return `You're at ${crFigure(balance)} ${CREDIT_UNIT}: ${MALL_EARN_BACK} before you buy.`;
}

/** "Takeaway night costs 120 cr; you have 80 cr (40 cr short)." */
export function shortLine(title: string, price: number, balance: number): string {
  return `${title} costs ${priceLine(price)}; you have ${priceLine(balance)} (${priceLine(price - balance)} short).`;
}

/** "At most once every 7 days: next on Tue 27 Oct." */
export function cooldownRefusal(days: number, next: DayKey): string {
  const words = cooldownLine(days) ?? "";
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}: next on ${dayLabelOf(next)}.`;
}

/** "Takeaway night bought for 120 cr · 1,120 cr left." */
export function boughtLine(title: string, price: number, balance: number): string {
  return `${title} bought for ${priceLine(price)} · ${priceLine(balance)} left.`;
}

/** "Takeaway night undone: 120 cr back." */
export function undoneLine(title: string, price: number): string {
  return `${title} undone: ${priceLine(price)} back.`;
}
