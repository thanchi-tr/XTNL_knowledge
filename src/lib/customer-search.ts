/**
 * The customer look-up (2026-10-20): ONE engine for the work header's search, the Customers page's live filter and
 * the scheduled task sheet's customer picker. Pure and client-importable: it runs in the browser over a light index
 * the workspace loads once (scheduled-tasks-server loadWorkIndex: id, ID, name, nickname, phone digits, the latest
 * activity; archived customers left out), so a keystroke costs no round trip and a result comes back in well under
 * 100 ms for thousands of customers.
 *
 *   foldText(s)                    what is compared: accents stripped (NFD, marks dropped), lower case, every run of
 *                                  white space one space, trimmed
 *   digitsOf(s) · phoneQueryOf(q)  a phone is matched by its digits only, and only by a query that is a phone
 *                                  (digits, spaces, + - ( ) .) with at least PHONE_MIN_DIGITS digits
 *   prepareIndex(entries)          folds every field once (with the map back to the field as written, for the marks)
 *   matchCustomers(index, q, opts) the ranked matches (RANK), at most `limit` (SEARCH_CAP by default), and how many
 *                                  matched in all; null for an empty or blank query
 *   matchTitles(tasks, q, opts)    scheduled tasks by title (word start first, then anywhere): the header's own group
 *   highlightParts(text, ranges)   the text cut into plain and marked parts (<mark> in the views)
 *
 * The rank, best first: the exact ID, an ID that starts with the query, a name or nickname with a word that starts
 * with it, an ID that holds it, a name or nickname that holds it, a phone whose digits hold it. Ties: the most recent
 * activity, then the name, then the ID in natural order.
 */

export interface CustomerIndexEntry {
  /** The customer's row id. */
  id: string;
  /** Their own ID as typed (Customer.number). */
  number: string;
  name: string;
  nickname: string | null;
  /** The phone's digits only ("" or null: none). */
  phone: string | null;
  /** The latest activity (ms since the epoch): the first tie-break, most recent first. */
  activity: number;
}

/** A scheduled task as the header search finds it. */
export interface TaskIndexEntry {
  id: string;
  title: string;
  /** ISO. */
  dueAt: string;
  allDay: boolean;
  done: boolean;
}

/** The Office workspace's search index (scheduled-tasks-server loadWorkIndex), loaded once with the work frame. */
export interface WorkIndex {
  /** The tab's kept customers (only while its customer list is on). */
  customers: CustomerIndexEntry[];
  /** The tab's open scheduled tasks and the ones done this past week. */
  tasks: TaskIndexEntry[];
}

export type MatchField = "id" | "name" | "nickname" | "phone";
/** [start, end) in the field as written. */
export type Range = readonly [number, number];

export interface MatchRanges {
  number: Range[];
  name: Range[];
  nickname: Range[];
  phone: Range[];
}

export interface CustomerMatch<E extends CustomerIndexEntry = CustomerIndexEntry> {
  entry: E;
  /** RANK's tier (0 best). */
  rank: number;
  /** The field that gave the rank: the views show the nickname or the phone on a second line when it is this. */
  field: MatchField;
  ranges: MatchRanges;
}

export interface CustomerSearchResult<E extends CustomerIndexEntry = CustomerIndexEntry> {
  /** The query as typed, trimmed. */
  query: string;
  results: CustomerMatch<E>[];
  /** Every customer that matched (results holds the first `limit`). */
  total: number;
}

/** The tiers, best first. */
export const RANK = { EXACT_ID: 0, ID_PREFIX: 1, NAME_WORD: 2, ID_SUBSTRING: 3, NAME_SUBSTRING: 4, PHONE: 5 } as const;

/** The header shows at most this many customers, then a "+n more" line to the full list on the Customers page. */
export const SEARCH_CAP = 8;
/** A phone is matched only from this many digits typed (fewer would match half the list). */
export const PHONE_MIN_DIGITS = 3;
/** The header shows at most this many scheduled tasks. */
export const TASK_SEARCH_CAP = 5;

// ── Folding ─────────────────────────────────────────────────────────────────

const MARKS = /\p{M}/gu;
const SPACE = /\s/u;

/** One code point folded: accents dropped, lower case ("É" → "e", "ß" stays "ß"). */
function foldChar(ch: string): string {
  return ch.normalize("NFD").replace(MARKS, "").toLowerCase();
}

/** Accents stripped, lower case, white space collapsed and trimmed. */
export function foldText(raw: string | null | undefined): string {
  return folded(raw ?? "").text;
}

interface Folded {
  text: string;
  /** For each character of `text`: where its source code point starts in the original. */
  starts: number[];
  /** …and where it ends. */
  ends: number[];
}

function folded(s: string): Folded {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let i = 0;
  for (const ch of s) {
    const at = i;
    i += ch.length;
    if (SPACE.test(ch)) {
      if (text === "" || text.endsWith(" ")) continue;
      text += " ";
      starts.push(at);
      ends.push(i);
      continue;
    }
    for (const f of foldChar(ch)) {
      text += f;
      starts.push(at);
      ends.push(i);
    }
  }
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    starts.pop();
    ends.pop();
  }
  return { text, starts, ends };
}

/** The digits of a string. */
export function digitsOf(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

const PHONE_LIKE = /^[\d\s+()\-.]+$/;

/** The digits a query looks for in phones, or null when it is not a phone (letters in it, or too few digits). */
export function phoneQueryOf(query: string): string | null {
  const q = query.trim();
  if (!PHONE_LIKE.test(q)) return null;
  const d = digitsOf(q);
  return d.length >= PHONE_MIN_DIGITS ? d : null;
}

// ── The index ───────────────────────────────────────────────────────────────

interface Prepared<E> {
  entry: E;
  number: Folded;
  name: Folded;
  nickname: Folded;
  phone: string;
}

export interface PreparedIndex<E extends CustomerIndexEntry = CustomerIndexEntry> {
  readonly size: number;
  /** @internal */
  readonly rows: readonly Prepared<E>[];
}

/** Folds every field once; match against the result as often as needed. */
export function prepareIndex<E extends CustomerIndexEntry>(entries: readonly E[]): PreparedIndex<E> {
  const rows = entries.map((entry) => ({
    entry,
    number: folded(entry.number),
    name: folded(entry.name),
    nickname: folded(entry.nickname ?? ""),
    phone: digitsOf(entry.phone),
  }));
  return { size: rows.length, rows };
}

const WORD_EDGE = /[\s'’\-.,()/&_]/;

/** The first occurrence of q in the folded text; `wordStart`: only where a word starts (or the text does). */
function find(f: Folded, q: string, wordStart: boolean): number {
  let at = f.text.indexOf(q);
  while (at >= 0) {
    if (!wordStart || at === 0 || WORD_EDGE.test(f.text[at - 1])) return at;
    at = f.text.indexOf(q, at + 1);
  }
  return -1;
}

/** A folded [at, at + len) back on the field as written. */
function rangeOf(f: Folded, at: number, len: number): Range {
  return [f.starts[at], f.ends[at + len - 1]];
}

const naturalCompare = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }) || (a < b ? -1 : a > b ? 1 : 0);

/**
 * The customers that match, best first (RANK), at most `limit` (SEARCH_CAP; Infinity for the whole list), and how many
 * matched in all. Null for an empty or blank query (no search).
 */
export function matchCustomers<E extends CustomerIndexEntry>(index: PreparedIndex<E>, raw: string | null | undefined, opts: { limit?: number } = {}): CustomerSearchResult<E> | null {
  const query = (raw ?? "").trim();
  const q = foldText(query);
  if (!q) return null;
  const phoneQ = phoneQueryOf(query);
  const limit = opts.limit ?? SEARCH_CAP;
  const out: CustomerMatch<E>[] = [];
  for (const r of index.rows) {
    const ranges: MatchRanges = { number: [], name: [], nickname: [], phone: [] };
    let rank = Infinity;
    let field: MatchField = "id";
    const better = (tier: number, f: MatchField) => {
      if (tier < rank) {
        rank = tier;
        field = f;
      }
    };
    // The ID: exact, its start, anywhere.
    const idAt = r.number.text.indexOf(q);
    if (idAt >= 0) {
      ranges.number.push(rangeOf(r.number, idAt, q.length));
      better(r.number.text === q ? RANK.EXACT_ID : idAt === 0 ? RANK.ID_PREFIX : RANK.ID_SUBSTRING, "id");
    }
    // The name and the nickname: a word's start, else anywhere.
    for (const [key, f] of [["name", r.name] as const, ["nickname", r.nickname] as const]) {
      if (!f.text) continue;
      const word = find(f, q, true);
      const at = word >= 0 ? word : find(f, q, false);
      if (at < 0) continue;
      ranges[key].push(rangeOf(f, at, q.length));
      better(word >= 0 ? RANK.NAME_WORD : RANK.NAME_SUBSTRING, key);
    }
    // The phone, by its digits, for a query that is a phone.
    if (phoneQ && r.phone) {
      const at = r.phone.indexOf(phoneQ);
      if (at >= 0) {
        ranges.phone.push([at, at + phoneQ.length]);
        better(RANK.PHONE, "phone");
      }
    }
    if (rank !== Infinity) out.push({ entry: r.entry, rank, field, ranges });
  }
  out.sort(
    (a, b) =>
      a.rank - b.rank ||
      (b.entry.activity || 0) - (a.entry.activity || 0) ||
      a.entry.name.localeCompare(b.entry.name, "en", { sensitivity: "base" }) ||
      naturalCompare(a.entry.number, b.entry.number)
  );
  return { query, results: Number.isFinite(limit) ? out.slice(0, Math.max(0, limit)) : out, total: out.length };
}

/** What Enter opens: the top result, or null. */
export function topMatch<E extends CustomerIndexEntry>(s: CustomerSearchResult<E> | null): CustomerMatch<E> | null {
  return s?.results[0] ?? null;
}

/** "+3 more" under the capped list, or null when every match is shown. */
export function moreLineOf(s: CustomerSearchResult | null): string | null {
  if (!s) return null;
  const more = s.total - s.results.length;
  return more > 0 ? `+${more} more` : null;
}

// ── Scheduled tasks, by title ───────────────────────────────────────────────

export interface TaskMatch<T extends TaskIndexEntry = TaskIndexEntry> {
  entry: T;
  ranges: Range[];
}

/** Tasks whose title holds the query: open first, then a word's start before anywhere, then the soonest. */
export function matchTitles<T extends TaskIndexEntry>(tasks: readonly T[], raw: string | null | undefined, opts: { limit?: number } = {}): { results: TaskMatch<T>[]; total: number } | null {
  const q = foldText(raw);
  if (!q) return null;
  const found: { entry: T; word: boolean; at: Range }[] = [];
  for (const t of tasks) {
    const f = folded(t.title);
    const word = find(f, q, true);
    const at = word >= 0 ? word : find(f, q, false);
    if (at >= 0) found.push({ entry: t, word: word >= 0, at: rangeOf(f, at, q.length) });
  }
  found.sort((a, b) => Number(a.entry.done) - Number(b.entry.done) || Number(b.word) - Number(a.word) || Date.parse(a.entry.dueAt) - Date.parse(b.entry.dueAt));
  const limit = opts.limit ?? TASK_SEARCH_CAP;
  return { results: found.slice(0, limit).map((x) => ({ entry: x.entry, ranges: [x.at] })), total: found.length };
}

// ── Marks ───────────────────────────────────────────────────────────────────

export interface TextPart {
  text: string;
  mark: boolean;
}

/** The text cut at the ranges (sorted, merged, clipped to the text): marked parts and plain parts, in order. */
export function highlightParts(text: string, ranges: readonly Range[]): TextPart[] {
  const sorted = [...ranges].map(([a, b]) => [Math.max(0, a), Math.min(text.length, b)] as const).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const parts: TextPart[] = [];
  let at = 0;
  for (const [a, b] of merged) {
    if (a > at) parts.push({ text: text.slice(at, a), mark: false });
    parts.push({ text: text.slice(a, b), mark: true });
    at = b;
  }
  if (at < text.length) parts.push({ text: text.slice(at), mark: false });
  return parts.length > 0 ? parts : [{ text, mark: false }];
}

/** "Jane Nguyen · C-1042": a customer as every result, chip and line names them (both the name and the ID). */
export function customerLabelOf(c: { name: string; number: string }): string {
  return `${c.name} · ${c.number}`;
}
