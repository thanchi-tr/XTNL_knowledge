/**
 * Credits (blueprint 4.1 and 4.2; docs/life-plan/blueprint-plan-2026-10-22.md P16, decisions D27, D28 and D29 in
 * docs/life-plan/blueprint-2026-10-22.md): the spendable currency beside XP. XP stays immutable (D27: append-only,
 * never spent or converted); credits are what the Mall (P18, P19) will spend.
 *
 * DERIVED, NEVER STORED. Income is a fold over rows the app already writes for other reasons (momentum's quest sets and
 * chests, the week judge's WEEK and PLAN_WEEK rows, the roadmap's MILESTONE and CHECKPOINT rows, and the decision rows
 * of goal, milestone and checkpoint mints), read on every load: no credit row exists, the fold writes nothing, and
 * scripts/credits-check.ts holds that no credits* or mall* file pays or spends XP, MP or a Domain point. Balance =
 * earned − bought + refunded (the Mall's MALL_BUY and MALL_REFUND rows, P19; none is written before it).
 *
 * The income table (D29, the plan's P16 table, credits-1), whole credits only:
 *   10   each of Today's three done (momentum-server questDone over the day's facts, so an undo takes it back)
 *   10   all three done: the day's chest opened ('chest:<day>'; never a Summit chest), kept like the chest itself
 *   15   a kept week, per track (a WEEK row with qty > 0, not a backfill; a held week is qty 0 and pays nothing)
 *   25   a kept plan week (a PLAN_WEEK row, 'pw:<questWeekId>')
 *   25   a checkpoint taken, 100 a milestone reached: only when its MP mint paid ('mp:LIFE_CHECKPOINT:…',
 *        'mp:LIFE_MILESTONE:…' qty > 0), so MP's own windows (2 paying per 30 days each) bound them
 *   goals: Short 10, Mid 40 × g, Long 120 × g (rounded), only when its close paid MP ('mp:GOAL:<id>' qty > 0: the
 *        same bar, age and windows), g the goal's closedScore
 * Each line is priced by the model in force on its own life day (creditModelOn(day)), so a later table never reprices
 * a day already counted. Penalties never touch credits (D31): nothing here reads debt.
 *
 * INERT UNTIL CREDITS_LAUNCH_DAY (null in code; outside production XTNL_CREDITS_LAUNCH_DAY may set it, the rehearsal
 * server). Null keeps every day off the model: no wallet, no price tag, `credits` null on the phone, no Credits card.
 * Credits start at 0 on the launch day and are never backfilled (D29): a day before it, and a week whose Sunday is
 * before it (weekIsBackfill's rule), counts nothing. Flipped only on the user's direct go.
 *
 * Deterministic (D32): no roll of any kind; chance stays with the chest and crits.
 *
 * The legacy capital dividend (P17, D28) retires on the same switch: from the launch day it accrues and claims nothing
 * (capital.ts claimDividend refuses before any read or write), and You › Stats shows the banked balance read only. It
 * is never converted into credits, and every CapitalLedgerEntry row stays. While the switch is null it runs as before.
 *
 * Pure and client-importable: life-day, life-economy and momentum.ts's key builders; no Prisma, no clock. The server
 * half (the reads, cached) is credits-server.ts.
 *
 *   Launch   CREDITS_LAUNCH_DAY · CREDITS_LAUNCH_DAY_ENV · CreditsEnv · creditsLaunchDay(env?) · creditsOn(day, launchDay?)
 *   Capital  dividendRetiredOn(day, launchDay?)
 *   Model    CreditModel · CREDITS_V1 · creditModelOn(day, launchDay?) · CreditKind · CREDIT_KINDS · CREDIT_KIND_LABEL
 *            CREDIT_SOURCES · CREDIT_MINT_PREFIXES · CREDIT_SPEND_SOURCES · goalCreditOf(model, horizon, g)
 *   Fold     CreditQuestDay · CreditRow · CreditSpendRow · CreditsFoldInput · CreditLine · CreditsFold · foldCredits(input)
 *   Wallet   CreditsWallet · LiveWallet · walletOf(fold, today, launchDay) · OFF_WALLET(day)
 *            CreditDay · earnedDaysOf(fold)   each day's earned credits (P18: the Mall's price hint reads them)
 *   Copy     CREDIT_UNIT · crFigure(n) · creditTagOf(amount) · CreditTags · creditTagsOn(day, launchDay?)
 *            walletTodayLine(w) · creditRows(model)
 */
import type { DayKey } from "./life-day";
import { GOAL_MINT_PREFIX, GOAL_RULES, ROADMAP_MP_WINDOWS, isBackfillDetail, isDayKey, momentumMintKey, parseMintDetail, parseWeekRowKey } from "./life-economy";
import { chestRowKey } from "./momentum";
import type { Horizon } from "./life-types";

// ── Launch ────────────────────────────────────────────────────────────────

/**
 * The first life day credits count (D29). Null keeps them inert: no wallet anywhere, no price tag, `credits` null on
 * the phone. Set in the launch commit only, on the user's direct go; a code constant survives a 'life' reset.
 */
export const CREDITS_LAUNCH_DAY = null as DayKey | null;

/** Outside production, a valid 'YYYY-MM-DD' here overrides CREDITS_LAUNCH_DAY (the rehearsal server). */
export const CREDITS_LAUNCH_DAY_ENV = "XTNL_CREDITS_LAUNCH_DAY";

/** The variables the gate reads. Defaults to process.env; the checks pass their own. */
export interface CreditsEnv {
  NODE_ENV?: string;
  XTNL_CREDITS_LAUNCH_DAY?: string;
}

/** Each variable read by name, so a bundler can inline NODE_ENV; on a client the XTNL_ one is undefined (a server decision). */
function readEnv(env?: CreditsEnv): CreditsEnv {
  if (env) return env;
  if (typeof process === "undefined" || !process.env) return {};
  return { NODE_ENV: process.env.NODE_ENV, XTNL_CREDITS_LAUNCH_DAY: process.env.XTNL_CREDITS_LAUNCH_DAY };
}

/** The launch day in force: outside production a valid XTNL_CREDITS_LAUNCH_DAY, else CREDITS_LAUNCH_DAY. */
export function creditsLaunchDay(env?: CreditsEnv): DayKey | null {
  const e = readEnv(env);
  if (e.NODE_ENV !== "production") {
    const override = e.XTNL_CREDITS_LAUNCH_DAY?.trim();
    if (isDayKey(override)) return override;
  }
  return CREDITS_LAUNCH_DAY;
}

/** Credits count on life day `day`: on and after the launch day; never while there is none. */
export function creditsOn(day: DayKey, launchDay: DayKey | null = creditsLaunchDay()): boolean {
  return launchDay != null && day >= launchDay;
}

/**
 * The capital dividend is retired on life day `day` (P17, D28): credits replace it from their launch day, so one go
 * starts the wallet and stops the dividend together. Never while there is no launch day: until then it runs as before.
 */
export function dividendRetiredOn(day: DayKey, launchDay: DayKey | null = creditsLaunchDay()): boolean {
  return creditsOn(day, launchDay);
}

// ── The model ─────────────────────────────────────────────────────────────

/** One published income table. Whole credits only. */
export interface CreditModel {
  v: "credits-1";
  /** Each of Today's three done. */
  quest: number;
  /** All three done: the day's chest opened. */
  threeOfThree: number;
  /** A kept week, per track. */
  keptWeek: number;
  /** A kept plan week. */
  planWeek: number;
  /** A checkpoint taken (when its MP paid). */
  checkpoint: number;
  /** A milestone reached (when its MP paid). */
  milestone: number;
  /** A goal closed paying MP: Short in full; Mid and Long × g, rounded. */
  goal: Readonly<Record<Horizon, number>>;
}

/** The plan's P16 table (D29). */
export const CREDITS_V1: CreditModel = {
  v: "credits-1",
  quest: 10,
  threeOfThree: 10,
  keptWeek: 15,
  planWeek: 25,
  checkpoint: 25,
  milestone: 100,
  goal: { SHORT: 10, MID: 40, LONG: 120 },
};

/** The model in force on `day` (a line's own day): null before the launch day and always while there is none. */
export function creditModelOn(day: DayKey, launchDay: DayKey | null = creditsLaunchDay()): CreditModel | null {
  return creditsOn(day, launchDay) ? CREDITS_V1 : null;
}

export type CreditKind = "QUEST" | "THREE_OF_THREE" | "KEPT_WEEK" | "PLAN_WEEK" | "CHECKPOINT" | "MILESTONE" | "GOAL";
export const CREDIT_KINDS: readonly CreditKind[] = ["QUEST", "THREE_OF_THREE", "KEPT_WEEK", "PLAN_WEEK", "CHECKPOINT", "MILESTONE", "GOAL"];

/** How each line reads in the published rules. */
export const CREDIT_KIND_LABEL: Readonly<Record<CreditKind, string>> = {
  QUEST: "Each of Today's three done",
  THREE_OF_THREE: "All three done (the day's chest opened)",
  KEPT_WEEK: "Kept week, per track",
  PLAN_WEEK: "Plan week kept",
  CHECKPOINT: "Checkpoint taken",
  MILESTONE: "Roadmap milestone reached",
  GOAL: "Goal closed",
};

/** The ledger sources the fold reads (never writes): with QUEST_SET and the day's facts, its whole input. */
export const CREDIT_SOURCES = ["CHEST", "WEEK", "PLAN_WEEK", "MILESTONE", "CHECKPOINT", "MP_MINT"] as const;
/** The MP_MINT decision rows it reads: a goal's close, and a milestone's and a checkpoint's mint (paid or not). */
export const CREDIT_MINT_PREFIXES: readonly string[] = [GOAL_MINT_PREFIX, momentumMintKey("LIFE_MILESTONE", ""), momentumMintKey("LIFE_CHECKPOINT", "")];
/** The Mall's rows (P19): a buy takes its qty, a refund gives it back. None exists before P19. */
export const CREDIT_SPEND_SOURCES = ["MALL_BUY", "MALL_REFUND"] as const;

const MILESTONE_ROW = "ms:";
const CHECKPOINT_ROW = "cp:";
const PLAN_WEEK_ROW = "pw:";

/** What a goal closed paying MP is worth: Short in full; Mid and Long × g (clamped to 0..1), rounded to a whole credit. */
export function goalCreditOf(model: CreditModel, horizon: Horizon, g: number | null | undefined): number {
  if (GOAL_RULES[horizon].binary) return model.goal[horizon];
  const share = typeof g === "number" && Number.isFinite(g) ? Math.max(0, Math.min(1, g)) : 0;
  return Math.round(model.goal[horizon] * share);
}

function horizonOfReason(reason: string): Horizon | null {
  for (const h of Object.keys(GOAL_RULES) as Horizon[]) if (GOAL_RULES[h].reason === reason) return h;
  return null;
}

// ── The fold ──────────────────────────────────────────────────────────────

/** One day of Today's three, as the server reads it: the quests in force (its frozen set and swaps), and how many are done. */
export interface CreditQuestDay {
  day: DayKey;
  inForce: number;
  done: number;
}

/** A ledger row the fold reads (an ActivityEvent of CREDIT_SOURCES, read only). */
export interface CreditRow {
  source: string;
  day: DayKey;
  dedupeKey: string | null;
  qty: number | null;
  detail: string | null;
  templateId: string | null;
}

/** A Mall row (P19): MALL_BUY takes qty credits, MALL_REFUND gives qty back. */
export interface CreditSpendRow {
  source: string;
  day: DayKey;
  qty: number | null;
}

export interface CreditsFoldInput {
  /** The life day the wallet is read on: lines dated after it are not counted, and `today` sums the lines dated it. */
  today: DayKey;
  launchDay: DayKey | null;
  questDays: readonly CreditQuestDay[];
  rows: readonly CreditRow[];
  /** g at each goal's close (TaskTemplate.closedScore), by template id. */
  goalScores: ReadonlyMap<string, number>;
  spends?: readonly CreditSpendRow[];
}

/** One counted line: its kind, its life day, the credits and the row (or day) it came from. */
export interface CreditLine {
  kind: CreditKind;
  day: DayKey;
  amount: number;
  key: string;
}

export interface CreditsFold {
  earned: number;
  spent: number;
  refunded: number;
  /** earned − spent + refunded. */
  balance: number;
  /** Earned on `today`'s life day. */
  today: number;
  byKind: Record<CreditKind, number>;
  lines: CreditLine[];
}

const whole = (n: number | null | undefined): number => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);

/**
 * The fold: every line the rows earn, each priced by the model in force on its own day, from the launch day through
 * `today`, and the Mall's spends. Pure and deterministic: the same rows give the same wallet on every server.
 */
export function foldCredits(input: CreditsFoldInput): CreditsFold {
  const { today, launchDay } = input;
  const lines: CreditLine[] = [];
  const counted = (day: DayKey): CreditModel | null => (day <= today ? creditModelOn(day, launchDay) : null);
  const push = (kind: CreditKind, day: DayKey, amount: number, key: string) => {
    if (amount > 0) lines.push({ kind, day, amount, key });
  };

  const seenDays = new Set<DayKey>();
  for (const q of input.questDays) {
    if (seenDays.has(q.day)) continue;
    seenDays.add(q.day);
    const m = counted(q.day);
    if (!m) continue;
    const done = Math.min(whole(q.done), whole(q.inForce));
    push("QUEST", q.day, m.quest * done, `quests:${q.day}`);
  }

  // The mints that decide whether a milestone or a checkpoint paid (MP's windows), by key.
  const paidMint = new Set(input.rows.filter((r) => r.source === "MP_MINT" && (r.qty ?? 0) > 0 && r.dedupeKey).map((r) => r.dedupeKey as string));
  const seenKeys = new Set<string>();
  for (const r of input.rows) {
    const key = r.dedupeKey;
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    const m = counted(r.day);
    if (!m) continue;
    if (r.source === "CHEST") {
      if (key === chestRowKey(r.day)) push("THREE_OF_THREE", r.day, m.threeOfThree, key);
    } else if (r.source === "WEEK") {
      if (parseWeekRowKey(key) && (r.qty ?? 0) > 0 && !isBackfillDetail(r.detail)) push("KEPT_WEEK", r.day, m.keptWeek, key);
    } else if (r.source === "PLAN_WEEK") {
      if (key.startsWith(PLAN_WEEK_ROW)) push("PLAN_WEEK", r.day, m.planWeek, key);
    } else if (r.source === "MILESTONE") {
      if (key.startsWith(MILESTONE_ROW) && paidMint.has(momentumMintKey("LIFE_MILESTONE", key.slice(MILESTONE_ROW.length)))) push("MILESTONE", r.day, m.milestone, key);
    } else if (r.source === "CHECKPOINT") {
      if (key.startsWith(CHECKPOINT_ROW) && paidMint.has(momentumMintKey("LIFE_CHECKPOINT", key.slice(CHECKPOINT_ROW.length)))) push("CHECKPOINT", r.day, m.checkpoint, key);
    } else if (r.source === "MP_MINT") {
      if (!key.startsWith(GOAL_MINT_PREFIX) || !((r.qty ?? 0) > 0)) continue;
      const h = horizonOfReason(parseMintDetail(r.detail).reason);
      if (!h) continue;
      const goalId = r.templateId ?? key.slice(GOAL_MINT_PREFIX.length);
      push("GOAL", r.day, goalCreditOf(m, h, input.goalScores.get(goalId)), key);
    }
  }

  let spent = 0;
  let refunded = 0;
  for (const s of input.spends ?? []) {
    if (!creditsOn(s.day, launchDay) || s.day > today) continue;
    if (s.source === "MALL_BUY") spent += whole(s.qty);
    else if (s.source === "MALL_REFUND") refunded += whole(s.qty);
  }

  const byKind = Object.fromEntries(CREDIT_KINDS.map((k) => [k, 0])) as Record<CreditKind, number>;
  let earned = 0;
  let todayEarned = 0;
  for (const l of lines) {
    byKind[l.kind] += l.amount;
    earned += l.amount;
    if (l.day === today) todayEarned += l.amount;
  }
  return { earned, spent, refunded, balance: earned - spent + refunded, today: todayEarned, byKind, lines };
}

// ── The wallet ────────────────────────────────────────────────────────────

/** What the web and the phone show. {live: false} while credits are off (the wallet is hidden). */
export type CreditsWallet =
  | { live: false; day: DayKey }
  | {
      live: true;
      day: DayKey;
      launchDay: DayKey;
      balance: number;
      today: number;
      earned: number;
      spent: number;
      refunded: number;
      byKind: Record<CreditKind, number>;
    };
export type LiveWallet = Extract<CreditsWallet, { live: true }>;

export const OFF_WALLET = (day: DayKey): CreditsWallet => ({ live: false, day });

export function walletOf(fold: CreditsFold, today: DayKey, launchDay: DayKey): LiveWallet {
  return { live: true, day: today, launchDay, balance: fold.balance, today: fold.today, earned: fold.earned, spent: fold.spent, refunded: fold.refunded, byKind: { ...fold.byKind } };
}

/** One life day's earned credits: what the Mall's price hint reads (P18, mall.ts goodDayOf). */
export interface CreditDay {
  day: DayKey;
  earned: number;
}

/** The fold's lines summed by their own life day: each day that earned any credits, oldest first (spends are not lines). */
export function earnedDaysOf(fold: Pick<CreditsFold, "lines">): CreditDay[] {
  const by = new Map<DayKey, number>();
  for (const l of fold.lines) by.set(l.day, (by.get(l.day) ?? 0) + l.amount);
  return [...by.entries()]
    .filter(([, earned]) => earned > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, earned]) => ({ day, earned }));
}

// ── Copy ──────────────────────────────────────────────────────────────────

/** The unit, as every tag and line says it. */
export const CREDIT_UNIT = "cr";

/** A whole credit figure: '1,240', '−10'. */
export function crFigure(n: number): string {
  const r = Math.round(n);
  return r < 0 ? `−${(-r).toLocaleString("en-GB")}` : r.toLocaleString("en-GB");
}

/** A price tag: '+10 cr'. */
export function creditTagOf(amount: number): string {
  return `+${crFigure(amount)} ${CREDIT_UNIT}`;
}

/** The tags Today's three carry once credits count: each quest's, and the 3-of-3's. */
export interface CreditTags {
  quest: string;
  threeOfThree: string;
}

/** Today's tags from the model in force on `day`; null while credits are off (no tag is drawn). */
export function creditTagsOn(day: DayKey, launchDay: DayKey | null = creditsLaunchDay()): CreditTags | null {
  const m = creditModelOn(day, launchDay);
  return m ? { quest: creditTagOf(m.quest), threeOfThree: creditTagOf(m.threeOfThree) } : null;
}

/** '+40 today', 'none yet today'. */
export function walletTodayLine(w: Pick<LiveWallet, "today">): string {
  return w.today > 0 ? `${creditTagOf(w.today)} today` : "none yet today";
}

/** A roadmap window in words, read from MP's own rule: 'when its MP pays (2 in any 30 days)'. */
function windowWords(rule: { maxPaying: number; windowDays: number }): string {
  return `when its MP pays (${rule.maxPaying} in any ${rule.windowDays} days)`;
}

/** The published table, in CREDIT_KINDS order: what each line pays and when. Every figure is the model's or MP's rule. */
export function creditRows(model: CreditModel): { kind: CreditKind; amount: string; per: string }[] {
  return [
    { kind: "QUEST", amount: crFigure(model.quest), per: "each, the day it is done; an undo takes it back" },
    { kind: "THREE_OF_THREE", amount: crFigure(model.threeOfThree), per: "once a day, when the chest opens" },
    { kind: "KEPT_WEEK", amount: crFigure(model.keptWeek), per: "dated the week's Sunday, once the week is judged" },
    { kind: "PLAN_WEEK", amount: crFigure(model.planWeek), per: "dated the week's Sunday, once the week is judged" },
    { kind: "CHECKPOINT", amount: crFigure(model.checkpoint), per: windowWords(ROADMAP_MP_WINDOWS.LIFE_CHECKPOINT) },
    { kind: "MILESTONE", amount: crFigure(model.milestone), per: windowWords(ROADMAP_MP_WINDOWS.LIFE_MILESTONE) },
    {
      kind: "GOAL",
      amount: `${crFigure(model.goal.SHORT)} / ${crFigure(model.goal.MID)} × g / ${crFigure(model.goal.LONG)} × g`,
      per: "Short / Mid / Long, when the close pays MP (the same bar, age and limits); g is its progress at the close",
    },
  ];
}
