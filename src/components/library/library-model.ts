/**
 * The Library's pure model (L5, redesign "Sigil & Slate"): what an idea row
 * carries, the filter families that live in the URL, how a row reads its
 * due date, the field tile's material stripe, and the history strip.
 *
 * Pure and dependency-light (type imports, plus pure libs), so the page, the
 * client browser, the idea page and scripts/study-side-check.ts share it.
 *
 *   parseFilters(params)          URL → filters (unknown values dropped, never thrown)
 *   filtersToParams(filters)      filters → URLSearchParams (defaults omitted, stable order)
 *   matchesFilters(idea, f, now)  one row against every facet: OR inside a facet, AND across
 *   statusCounts(ideas, now)      the quick chips' counts (Due, Mastered, Struggling)
 *   dueLabel(dueAt, now)          "due now" · "next in 5 h" · "next in 71 days"
 *   tierMaterial(level)           the field tile's stripe: the tier ornament mapped to a material
 *   historyOf(rows)               the idea's history strip from its REVIEW ledger rows
 */
import type { CollectionLabel, QuestionType } from "@prisma/client";
import type { Segment } from "@/components/ui/Meter";
import type { Material } from "@/lib/materials";
import { bandFor, type DifficultyBand } from "@/lib/difficulty";
import { fieldTier, type FieldTier } from "@/lib/field-tier";
import { displayAnswer, displayQuestion } from "@/lib/idea-display";
import { LIFE_TZ } from "@/lib/life-day";
import { QUESTION_TYPES, decodeStringArray } from "@/lib/idea-payload";
import { MASTERY_LEVEL } from "@/lib/xp";

// ─── Rows ───────────────────────────────────────────────────────────────────

export interface LibraryIdea {
  id: string;
  question: string;
  answer: string;
  /** Capitals must match when graded (Idea.answerCaseSensitive). */
  answerCaseSensitive: boolean;
  questionType: QuestionType;
  collectionLabel: CollectionLabel;
  level: number;
  isArchived: boolean;
  fieldId: string;
  fieldName: string;
  domainId: string;
  domainName: string;
  /** Node data from the dedup pipeline; null on anything created before it. */
  title: string | null;
  corePremise: string | null;
  tags: string[];
  linkedCount: number;
  /** 0–100, decided automatically. 0 means never scored, not trivial. */
  difficulty: number;
  /** Epoch ms of the next review. */
  dueAt: number;
  /** Strikes since the last recall (srs.ts). */
  failedAttempts: number;
  /** Epoch ms. */
  createdAt: number;
}

export interface LibraryField {
  id: string;
  name: string;
  level: number;
  domains: { id: string; name: string }[];
}

export const COLLECTION_LABELS: readonly CollectionLabel[] = ["BOOK", "ACTIONABLE", "PROPOSAL"];
export const DIFFICULTY_BANDS: readonly DifficultyBand[] = ["INTRO", "STANDARD", "DEMANDING", "SEVERE"];

export const COLLECTION_NAME: Record<CollectionLabel, string> = { BOOK: "Book", ACTIONABLE: "Actionable", PROPOSAL: "Proposal" };

export const TYPE_NAME: Record<QuestionType, string> = {
  SHORT: "Short",
  CLOZE: "Cloze",
  NUMERIC: "Numeric",
  MULTI: "Multiple choice",
  LIST: "List",
  ORDER: "Order",
  FORMULA: "Formula",
  DIAGRAM: "Diagram",
};

/** The formats the idea page can edit in place (text only; the rest are deleted and re-added). */
export const EDITABLE_TYPES: readonly QuestionType[] = ["SHORT", "CLOZE"];

export function isMastered(idea: Pick<LibraryIdea, "level">): boolean {
  return idea.level >= MASTERY_LEVEL;
}

/** What a row is called: its node title, else its question as the review card shows it. */
export function ideaHeadline(idea: Pick<LibraryIdea, "title" | "questionType" | "question">): string {
  return idea.title?.trim() || displayQuestion(idea.questionType, idea.question);
}

/** Everything the search box reads, lower-cased once per idea. */
export function searchText(idea: LibraryIdea): string {
  return [
    displayQuestion(idea.questionType, idea.question),
    displayAnswer(idea.questionType, idea.answer),
    idea.title ?? "",
    idea.corePremise ?? "",
    idea.tags.join(" "),
    idea.domainName,
    idea.fieldName,
  ]
    .join(" ")
    .toLowerCase();
}

// ─── Filters (all of them live in the URL) ──────────────────────────────────

export const STATUSES = ["all", "due", "mastered", "struggling", "archived"] as const;
export type LibraryStatus = (typeof STATUSES)[number];

export const STATUS_NAME: Record<LibraryStatus, string> = {
  all: "All",
  due: "Due",
  mastered: "Mastered",
  struggling: "Struggling",
  archived: "Archived",
};

export interface LibraryFilters {
  q: string;
  status: LibraryStatus;
  /** Field ids. */
  fields: string[];
  /** Domain ids. */
  domains: string[];
  tags: string[];
  types: QuestionType[];
  cols: CollectionLabel[];
  bands: DifficultyBand[];
  minLevel: number;
  maxLevel: number;
}

export const EMPTY_FILTERS: Readonly<LibraryFilters> = Object.freeze({
  q: "",
  status: "all",
  fields: [],
  domains: [],
  tags: [],
  types: [],
  cols: [],
  bands: [],
  minLevel: 1,
  maxLevel: MASTERY_LEVEL,
});

/** URL keys, one per family. `idea` (the open detail) rides along but is not a filter. */
export const URL_KEYS = {
  q: "q",
  status: "show",
  fields: "field",
  domains: "domain",
  tags: "tag",
  types: "type",
  cols: "col",
  bands: "band",
  levels: "lv",
  idea: "idea",
} as const;

const MAX_VALUES = 60;
const MAX_TEXT = 200;

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function all(src: ParamSource, key: string): string[] {
  if (src instanceof URLSearchParams) return src.getAll(key);
  const v = src[key];
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function uniqueText(values: string[]): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim().slice(0, MAX_TEXT);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= MAX_VALUES) break;
  }
  return out;
}

function oneOf<T extends string>(values: string[], allowed: readonly T[]): T[] {
  const out: T[] = [];
  for (const v of values) if ((allowed as readonly string[]).includes(v) && !out.includes(v as T)) out.push(v as T);
  return out;
}

function clampLevel(n: number, fallback: number): number {
  return Number.isFinite(n) ? Math.max(1, Math.min(MASTERY_LEVEL, Math.round(n))) : fallback;
}

/** URL → filters. Unknown or malformed values are dropped; nothing throws. */
export function parseFilters(src: ParamSource): LibraryFilters {
  const status = all(src, URL_KEYS.status)[0];
  const [lo, hi] = (all(src, URL_KEYS.levels)[0] ?? "").split("-").map((s) => Number.parseInt(s, 10));
  let minLevel = clampLevel(lo, 1);
  let maxLevel = clampLevel(hi, MASTERY_LEVEL);
  if (minLevel > maxLevel) [minLevel, maxLevel] = [maxLevel, minLevel];
  return {
    q: (all(src, URL_KEYS.q)[0] ?? "").slice(0, MAX_TEXT),
    status: (STATUSES as readonly string[]).includes(status ?? "") ? (status as LibraryStatus) : "all",
    fields: uniqueText(all(src, URL_KEYS.fields)),
    domains: uniqueText(all(src, URL_KEYS.domains)),
    tags: uniqueText(all(src, URL_KEYS.tags)),
    types: oneOf(all(src, URL_KEYS.types), QUESTION_TYPES),
    cols: oneOf(all(src, URL_KEYS.cols), COLLECTION_LABELS),
    bands: oneOf(all(src, URL_KEYS.bands), DIFFICULTY_BANDS),
    minLevel,
    maxLevel,
  };
}

/** Filters → URL, defaults omitted, in a stable order (so the same filters give the same URL). */
export function filtersToParams(f: LibraryFilters, extra?: { idea?: string | null }): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set(URL_KEYS.q, f.q.trim());
  if (f.status !== "all") p.set(URL_KEYS.status, f.status);
  for (const v of f.fields) p.append(URL_KEYS.fields, v);
  for (const v of f.domains) p.append(URL_KEYS.domains, v);
  for (const v of f.tags) p.append(URL_KEYS.tags, v);
  for (const v of f.types) p.append(URL_KEYS.types, v);
  for (const v of f.cols) p.append(URL_KEYS.cols, v);
  for (const v of f.bands) p.append(URL_KEYS.bands, v);
  if (f.minLevel > 1 || f.maxLevel < MASTERY_LEVEL) p.set(URL_KEYS.levels, `${f.minLevel}-${f.maxLevel}`);
  if (extra?.idea) p.set(URL_KEYS.idea, extra.idea);
  return p;
}

/** How many facet families (not the search box, not the quick status chip) narrow the list. */
export function facetCount(f: LibraryFilters): number {
  return (
    f.fields.length +
    f.domains.length +
    f.tags.length +
    f.types.length +
    f.cols.length +
    f.bands.length +
    (f.minLevel > 1 || f.maxLevel < MASTERY_LEVEL ? 1 : 0)
  );
}

export function isUnfiltered(f: LibraryFilters): boolean {
  return f.q.trim() === "" && f.status === "all" && facetCount(f) === 0;
}

export function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** One idea against the status chip. Archived ideas appear only under "Archived". */
export function matchesStatus(idea: LibraryIdea, status: LibraryStatus, now: number): boolean {
  if (status === "archived") return idea.isArchived;
  if (idea.isArchived) return false;
  switch (status) {
    case "all":
      return true;
    case "due":
      return idea.dueAt <= now;
    case "mastered":
      return isMastered(idea);
    case "struggling":
      return idea.failedAttempts > 0;
  }
}

/**
 * One idea against every facet: OR inside a facet, AND across facets.
 * `haystack` is searchText(idea), precomputed by the caller.
 * An active difficulty filter excludes unscored ideas (difficulty 0): they
 * have no band, and filing them under Intro would claim something never measured.
 */
export function matchesFilters(idea: LibraryIdea, f: LibraryFilters, now: number, haystack?: string): boolean {
  if (!matchesStatus(idea, f.status, now)) return false;
  if (f.fields.length > 0 && !f.fields.includes(idea.fieldId)) return false;
  if (f.domains.length > 0 && !f.domains.includes(idea.domainId)) return false;
  if (f.tags.length > 0 && !idea.tags.some((t) => f.tags.includes(t))) return false;
  if (f.types.length > 0 && !f.types.includes(idea.questionType)) return false;
  if (f.cols.length > 0 && !f.cols.includes(idea.collectionLabel)) return false;
  if (f.bands.length > 0 && (idea.difficulty <= 0 || !f.bands.includes(bandFor(idea.difficulty)))) return false;
  if (idea.level < f.minLevel || idea.level > f.maxLevel) return false;
  const q = f.q.trim().toLowerCase();
  if (q && !(haystack ?? searchText(idea)).includes(q)) return false;
  return true;
}

export interface StatusCounts {
  all: number;
  due: number;
  mastered: number;
  struggling: number;
  archived: number;
}

/** The quick chips' counts, over the whole library (not the current filters). */
export function statusCounts(ideas: readonly LibraryIdea[], now: number): StatusCounts {
  const c: StatusCounts = { all: 0, due: 0, mastered: 0, struggling: 0, archived: 0 };
  for (const i of ideas) {
    if (i.isArchived) {
      c.archived++;
      continue;
    }
    c.all++;
    if (i.dueAt <= now) c.due++;
    if (isMastered(i)) c.mastered++;
    if (i.failedAttempts > 0) c.struggling++;
  }
  return c;
}

// ─── Reading a row ──────────────────────────────────────────────────────────

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The row's due line. Plain durations, never a calendar guess. */
export function dueLabel(dueAt: number, now: number): string {
  const ms = dueAt - now;
  if (ms <= 0) return "due now";
  if (ms < HOUR) return "due within the hour";
  if (ms < DAY) return `next in ${Math.floor(ms / HOUR)} h`;
  const d = Math.floor(ms / DAY);
  return d === 1 ? "next in 1 day" : `next in ${d} days`;
}

/** The same fact as a sentence on the idea page. */
export function dueSentence(dueAt: number, now: number): string {
  const ms = dueAt - now;
  if (ms <= 0) return "Due for review now";
  const label = dueLabel(dueAt, now);
  return `Next review ${label.replace(/^next /, "")}`;
}

/** "L3.4" for a fractional field level, "L3" for a whole one. */
export function levelText(level: number): string {
  const r = Math.round(level * 10) / 10;
  return `L${Number.isInteger(r) ? r : r.toFixed(1)}`;
}

/**
 * The field tile's ornament, mapped to the material ladder: Nascent iron,
 * Established bronze, Substantial silver, Formidable gold, Monumental astral.
 * A Dormant field (no points yet) has no material: its stripe is a dashed rim.
 */
export const TIER_MATERIAL: Readonly<Record<FieldTier, Material | null>> = {
  DORMANT: null,
  NASCENT: "iron",
  ESTABLISHED: "bronze",
  SUBSTANTIAL: "silver",
  FORMIDABLE: "gold",
  MONUMENTAL: "astral",
};

export function tierMaterial(level: number): Material | null {
  return TIER_MATERIAL[fieldTier(level).tier];
}

// ─── History ────────────────────────────────────────────────────────────────

/** One REVIEW row from the life ledger, as the idea page reads it. */
export interface HistoryRow {
  /** srs.ts: "advanced", "advanced · mastered", "strike", "degraded", "shielded"; backfill: "backfill: passed review". */
  detail: string | null;
  /** Epoch ms. */
  at: number;
  /** Written by scripts/backfill-activity.ts (passes only), not live. */
  backfill: boolean;
}

export interface IdeaHistory {
  /** The last HISTORY_SEGS outcomes, oldest first. */
  segs: Segment[];
  recalls: number;
  misses: number;
  total: number;
  /** Some rows came from the backfill, which recorded passes only (never a miss). */
  backfilled: boolean;
  /** Epoch ms of the first live row (every outcome recorded from here on), or null if none yet. */
  firstLiveAt: number | null;
}

export const HISTORY_SEGS = 12;

/** "on" for a recall, "miss" for a strike, a degradation, or a degradation a shield absorbed; null for anything else. */
export function outcomeOf(detail: string | null): "on" | "miss" | null {
  const d = (detail ?? "").trim().toLowerCase();
  if (d.startsWith("advanced") || d.startsWith("backfill")) return "on";
  if (d === "strike" || d === "degraded" || d === "shielded") return "miss";
  return null;
}

export function historyOf(rows: readonly HistoryRow[]): IdeaHistory {
  const sorted = [...rows].sort((a, b) => a.at - b.at);
  const outcomes: ("on" | "miss")[] = [];
  let recalls = 0;
  let misses = 0;
  let sawBackfill = false;
  let firstLive: number | null = null;
  for (const r of sorted) {
    const o = outcomeOf(r.detail);
    if (!o) continue;
    if (r.backfill) sawBackfill = true;
    else if (firstLive === null) firstLive = r.at;
    outcomes.push(o);
    if (o === "on") recalls++;
    else misses++;
  }
  return {
    segs: outcomes.slice(-HISTORY_SEGS),
    recalls,
    misses,
    total: outcomes.length,
    backfilled: sawBackfill,
    firstLiveAt: firstLive,
  };
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}

/** "9 recalls, 1 miss" (or "No reviews recorded yet"). */
export function historySummary(h: IdeaHistory): string {
  if (h.total === 0) return "No reviews recorded yet";
  return `${plural(h.recalls, "recall")}, ${plural(h.misses, "miss", "misses")}`;
}

/**
 * "14 Mar" / "14 Mar 2025" (the year only when it is not this one), in the
 * life time zone, so the server render and the browser agree.
 */
export function shortDate(at: number, now: number, tz: string = LIFE_TZ): string {
  const year = (t: number) => new Date(t).toLocaleDateString("en-GB", { year: "numeric", timeZone: tz });
  const sameYear = year(at) === year(now);
  return new Date(at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: tz,
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * A stored cloze back to its authoring template: "[1]" → "{{Paris}}". The
 * question is stored blanked and the spans as a JSON array (idea-payload.ts),
 * so editing starts from exactly what the author wrote.
 */
export function clozeTemplate(question: string, answer: string): string {
  const spans = decodeStringArray(answer);
  return question.replace(/\[(\d+)\]/g, (m, n: string) => {
    const span = spans[Number(n) - 1];
    return span === undefined ? m : `{{${span}}}`;
  });
}
