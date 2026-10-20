/**
 * A work tab's deals pipeline (2026-10-20; migration 20261228000000_crm), the rules, pure and client-importable: the
 * cores (deals-server.ts), the Deals page (/today/work/<id>/deals), a customer's Deals tab and Overview, the shell's
 * title and scripts/crm-check.ts all import it.
 *
 *   A deal          a title (1..120), a value in AUD cents (≥ 0, at most MONEY_MAX_CENTS), a stage (New · Quoted · Won
 *                   · Lost), the day it is expected to close, a note (≤ 500), optionally a customer of the same tab
 *   stagePatchOf    moving to Won or Lost stamps closedAt (now); moving back to New or Quoted clears it; the same stage
 *                   keeps everything
 *   formatMoney / parseMoney   "$1,250" (cents only when there are some: "$1,250.50"); "1250", "$1,250", "1 250.5"
 *   pipelineOf / stageTotalsOf the four columns (sortOrder, then oldest first) and each one's count and value
 *   openDealsOf     the open ones (New and Quoted): their count and value (a customer's Overview, the page's head)
 *   dealCloseLabel  "Close by Fri 30 Oct", "Overdue · 12 Oct" for an open deal past its day; "Won Tue 20 Oct"
 *   dealsHref / dealsPathOf   /today/work/<board>/deals
 *
 * Money is AUD, kept as whole cents (an integer, never a float). "Today" is the life day (life-day.ts todayKey).
 * Work, never the game: nothing here (or in the cores) pays XP, writes the ledger or touches the streak.
 */
import { LIFE_TZ, dayKeyOf, daysBetween, type DayKey } from "./life-day";
import { WORK_BOARD_PATH, isBoardId } from "./work-boards";
import { isRowId } from "./customers";
import { cleanOrderDate } from "./work-orders";

export type Clean<T> = { ok: true; value: T } | { ok: false; error: string };
const yes = <T>(value: T): Clean<T> => ({ ok: true, value });
const no = <T>(error: string): Clean<T> => ({ ok: false, error });
const chars = (s: string) => [...s].length;
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

// ── Stages ──────────────────────────────────────────────────────────────────

export const DEAL_STAGES = ["NEW", "QUOTED", "WON", "LOST"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];
export const DEAL_STAGE_LABEL: Readonly<Record<DealStage, string>> = { NEW: "New", QUOTED: "Quoted", WON: "Won", LOST: "Lost" };
/** Still being worked: New and Quoted. */
export const OPEN_STAGES: readonly DealStage[] = ["NEW", "QUOTED"];

export function dealStageOf(raw: unknown): DealStage | null {
  return typeof raw === "string" && (DEAL_STAGES as readonly string[]).includes(raw) ? (raw as DealStage) : null;
}

export function isOpenStage(s: DealStage): boolean {
  return s === "NEW" || s === "QUOTED";
}

/**
 * A move's stage and closedAt: to Won or Lost (from any other stage) stamps closedAt now; to New or Quoted clears it;
 * the same stage changes nothing (a Won deal keeps the day it was won).
 */
export function stagePatchOf(prev: { stage: DealStage; closedAt: Date | null }, next: DealStage, now: Date): { stage: DealStage; closedAt: Date | null } {
  if (next === prev.stage) return { stage: prev.stage, closedAt: prev.closedAt };
  return { stage: next, closedAt: isOpenStage(next) ? null : now };
}

/** The "Move to…" menu: every other stage, in the pipeline's order. */
export function moveTargetsOf(stage: DealStage): DealStage[] {
  return DEAL_STAGES.filter((s) => s !== stage);
}

// ── Money (AUD, whole cents) ───────────────────────────────────────────────

/** $10,000,000: well inside a 32-bit column's cents. */
export const MONEY_MAX_CENTS = 1_000_000_000;
export const MONEY_BAD = "Type an amount in dollars, like 1250 or 1,250.50.";
export const MONEY_NEGATIVE = "A deal's value can't be below $0.";
export const MONEY_LONG = "Keep the value under $10,000,000.";

const group3 = (n: string) => n.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** "$1,250", "$1,250.50", "$0" (no float: cents are split as integers). */
export function formatMoney(cents: number): string {
  const c = Math.max(0, Math.round(Number.isFinite(cents) ? cents : 0));
  const dollars = Math.floor(c / 100);
  const rest = c % 100;
  return `$${group3(String(dollars))}${rest ? `.${String(rest).padStart(2, "0")}` : ""}`;
}

/** The value field's text for a stored amount: "1250", "1250.50", "" for none. */
export function moneyInputOf(cents: number): string {
  if (!cents) return "";
  const rest = cents % 100;
  return `${Math.floor(cents / 100)}${rest ? `.${String(rest).padStart(2, "0")}` : ""}`;
}

const MONEY_RE = /^(\d*)(?:\.(\d{1,2}))?$/;

/** An amount in dollars as typed ("$1,250", "1 250.5", "1250", ".5"): whole cents; "" is $0. */
export function parseMoney(raw: unknown): Clean<number> {
  if (raw === null || raw === undefined) return yes(0);
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return no(MONEY_BAD);
    if (raw < 0) return no(MONEY_NEGATIVE);
    const c = Math.round(raw * 100);
    return c > MONEY_MAX_CENTS ? no(MONEY_LONG) : yes(c);
  }
  if (typeof raw !== "string") return no(MONEY_BAD);
  const s = raw.trim().replace(/^\$\s*/, "").replace(/^(AUD|A\$)\s*/i, "").replace(/[\s,]/g, "");
  if (!s) return yes(0);
  if (s.startsWith("-")) return no(MONEY_NEGATIVE);
  const m = MONEY_RE.exec(s);
  if (!m || (m[1] === "" && m[2] === undefined)) return no(MONEY_BAD);
  if (m[1].length > 9) return no(MONEY_LONG);
  const cents = Number(m[1] || "0") * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
  return cents > MONEY_MAX_CENTS ? no(MONEY_LONG) : yes(cents);
}

// ── A deal's fields ────────────────────────────────────────────────────────

export const DEAL_TITLE_MAX = 120;
export const DEAL_NOTE_MAX = 500;

export const DEAL_TITLE_EMPTY = "Say what the deal is.";
export const DEAL_TITLE_LONG = `Keep the title to ${DEAL_TITLE_MAX} characters.`;
export const DEAL_NOTE_LONG = `Keep the note to ${DEAL_NOTE_MAX} characters.`;
export const DEAL_STAGE_BAD = "Pick a stage: New, Quoted, Won or Lost.";
export const DEAL_CLOSE_BAD = "Pick the day it should close, or leave it empty.";
export const DEAL_CUSTOMER_BAD = "That customer can't be linked here.";
export const DEAL_GONE = "That deal no longer exists.";
export const DEAL_ARCHIVED = "That deal is archived. Undo the archive to change it.";
export const DEAL_CUSTOMER_GONE = "That customer is not on this tab.";
export const DEAL_CUSTOMER_ARCHIVED = "That customer is archived. Restore them first.";
/** Deals live with the customer list: a tab without one keeps no pipeline. */
export const DEALS_CRM_OFF = "Deals live with the customer list. Turn it on in the tab's menu.";
export const DEAL_NOT_WON = "Only a won deal becomes an order. Move it to Won first.";
export const DEAL_HAS_ORDER = "This deal already has its order.";

export interface DealInput {
  title: string;
  /** The value in dollars as typed ("1,250", "1250.50"); "" or null: $0. */
  value?: string | number | null;
  stage?: string;
  /** 'YYYY-MM-DD'; "" or null: none. */
  expectedCloseDay?: string | null;
  note?: string | null;
  /** A customer of this tab; "" or null: none. Left out: none on an add, kept on an edit. */
  customerId?: string | null;
}

export interface CleanDeal {
  title: string;
  valueCents: number;
  stage: DealStage;
  expectedCloseDay: DayKey | null;
  note: string | null;
  /** undefined: left out. */
  customerId: string | null | undefined;
}

/** The deal sheet's fields: the same rules on both sides. A new deal starts New. */
export function cleanDealInput(raw: unknown): Clean<CleanDeal> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.replace(CONTROL, " ").replace(/\s+/g, " ").trim() : "";
  if (!title) return no(DEAL_TITLE_EMPTY);
  if (chars(title) > DEAL_TITLE_MAX) return no(DEAL_TITLE_LONG);
  const value = parseMoney(r.value);
  if (!value.ok) return no(value.error);
  const stage = r.stage === undefined || r.stage === null || r.stage === "" ? "NEW" : dealStageOf(r.stage);
  if (!stage) return no(DEAL_STAGE_BAD);
  let expectedCloseDay: DayKey | null = null;
  if (r.expectedCloseDay !== undefined && r.expectedCloseDay !== null && r.expectedCloseDay !== "") {
    // A calendar day 'YYYY-MM-DD' (2000..2099), the order list's own rule.
    const d = cleanOrderDate(r.expectedCloseDay);
    if (!d.ok || !d.value) return no(DEAL_CLOSE_BAD);
    expectedCloseDay = d.value;
  }
  const note = typeof r.note === "string" ? r.note.replace(/\r\n?/g, "\n").replace(CONTROL, " ").trim() : "";
  if (chars(note) > DEAL_NOTE_MAX) return no(DEAL_NOTE_LONG);
  let customerId: string | null | undefined;
  if (r.customerId === undefined) customerId = undefined;
  else if (r.customerId === null || r.customerId === "") customerId = null;
  else if (isRowId(r.customerId)) customerId = r.customerId;
  else return no(DEAL_CUSTOMER_BAD);
  return yes({ title, valueCents: value.value, stage, expectedCloseDay, note: note || null, customerId });
}

// ── The pipeline ───────────────────────────────────────────────────────────

/** A deal as the views draw it (plain values: it crosses into the client). */
export interface DealView {
  id: string;
  boardId: string;
  title: string;
  valueCents: number;
  stage: DealStage;
  /** 'YYYY-MM-DD', or null. */
  expectedCloseDay: DayKey | null;
  note: string | null;
  /** ISO, or null while open. */
  closedAt: string | null;
  /** The order a Won deal became, or null. */
  order: { id: string; item: string } | null;
  sortOrder: number;
  /** ISO. */
  createdAt: string;
  customer: { id: string; number: string; name: string; phone: string | null } | null;
}

const ms = (v: string | null | undefined) => (v ? Date.parse(v) || 0 : 0);

/** The four columns, each by sortOrder, then the oldest added first. */
export function pipelineOf<T extends { id: string; stage: DealStage; sortOrder: number; createdAt: string }>(deals: readonly T[]): Record<DealStage, T[]> {
  const out: Record<DealStage, T[]> = { NEW: [], QUOTED: [], WON: [], LOST: [] };
  for (const d of deals) out[d.stage].push(d);
  for (const s of DEAL_STAGES) out[s].sort((a, b) => a.sortOrder - b.sortOrder || ms(a.createdAt) - ms(b.createdAt) || (a.id < b.id ? -1 : 1));
  return out;
}

/** Each column's count and value. */
export function stageTotalsOf(deals: readonly { stage: DealStage; valueCents: number }[]): Record<DealStage, { count: number; valueCents: number }> {
  const out: Record<DealStage, { count: number; valueCents: number }> = { NEW: { count: 0, valueCents: 0 }, QUOTED: { count: 0, valueCents: 0 }, WON: { count: 0, valueCents: 0 }, LOST: { count: 0, valueCents: 0 } };
  for (const d of deals) {
    out[d.stage].count++;
    out[d.stage].valueCents += d.valueCents;
  }
  return out;
}

/** The open deals (New and Quoted): how many, and their value. */
export function openDealsOf(deals: readonly { stage: DealStage; valueCents: number }[]): { count: number; valueCents: number } {
  const open = deals.filter((d) => isOpenStage(d.stage));
  return { count: open.length, valueCents: open.reduce((n, d) => n + d.valueCents, 0) };
}

/** "Open deals $3,250 · 2"; null with none open. */
export function openDealsLine(o: { count: number; valueCents: number }): string | null {
  return o.count > 0 ? `${formatMoney(o.valueCents)} · ${o.count} open` : null;
}

/** "2 deals · $4,500" (a column's head). */
export function stageTotalLine(t: { count: number; valueCents: number }): string {
  return `${t.count} deal${t.count === 1 ? "" : "s"} · ${formatMoney(t.valueCents)}`;
}

/** A deal's sortOrder at the end of a column: one past the column's last. */
export function nextSortOrder(column: readonly { sortOrder: number }[]): number {
  return column.reduce((m, d) => Math.max(m, d.sortOrder), 0) + 1;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dayWords(day: DayKey, today: DayKey, weekday = true): string {
  const [y, m, d] = day.split("-").map(Number);
  const year = y !== Number(today.slice(0, 4)) ? ` ${y}` : "";
  return `${weekday ? `${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ` : ""}${d} ${MONTH[m - 1]}${year}`;
}

/** An open deal past its expected close. */
export function isDealOverdue(d: { stage: DealStage; expectedCloseDay: DayKey | null }, today: DayKey): boolean {
  return isOpenStage(d.stage) && d.expectedCloseDay !== null && d.expectedCloseDay < today;
}

/**
 * A deal's day in words: open, "Close by Fri 30 Oct" ("Close today", "Close tomorrow"), "Overdue · 12 Oct" once past;
 * Won or Lost, the day it closed ("Won Tue 20 Oct"). Null when there is nothing to say.
 */
export function dealCloseLabel(d: { stage: DealStage; expectedCloseDay: DayKey | null; closedAt: string | null }, today: DayKey, tz: string = LIFE_TZ): string | null {
  if (!isOpenStage(d.stage)) return d.closedAt ? `${DEAL_STAGE_LABEL[d.stage]} ${dayWords(dayKeyOf(new Date(d.closedAt), tz), today)}` : null;
  if (!d.expectedCloseDay) return null;
  const diff = daysBetween(today, d.expectedCloseDay);
  if (diff < 0) return `Overdue · ${dayWords(d.expectedCloseDay, today, false)}`;
  if (diff === 0) return "Close today";
  if (diff === 1) return "Close tomorrow";
  return `Close by ${dayWords(d.expectedCloseDay, today)}`;
}

/** The order a Won deal becomes, prefilled: the customer's name and phone, the deal's title as the item (≤ 120). */
export function orderPrefillOf(d: Pick<DealView, "title" | "customer">, today: DayKey): { item: string; name: string; contact: string; date: DayKey; ordered: boolean; customer: string } {
  return { item: [...d.title].slice(0, 120).join(""), name: d.customer?.name ?? "", contact: d.customer?.phone ?? "", date: today, ordered: false, customer: d.customer?.number ?? "" };
}

// ── Paths ──────────────────────────────────────────────────────────────────

export const STAGE_PARAM = "stage";

/** ?stage= as the Deals page reads it (lower case), else New. */
export function stageParamOf(raw: unknown): DealStage {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" ? (dealStageOf(v.toUpperCase()) ?? "NEW") : "NEW";
}

/** A work tab's deals pipeline. */
export function dealsHref(boardId: string): string {
  return `${WORK_BOARD_PATH}/${boardId}/deals`;
}

/** The Deals page a path is on, or null. */
export function dealsPathOf(pathname: string | null | undefined): { boardId: string } | null {
  if (!pathname) return null;
  const m = /^\/today\/work\/([^/?#]+)\/deals\/?(?:[?#]|$)/.exec(pathname);
  return m && isBoardId(m[1]) ? { boardId: m[1] } : null;
}

/** The work tab as the Deals page names it. */
export interface DealsBoardView {
  id: string;
  name: string;
  ordersOn: boolean;
}
