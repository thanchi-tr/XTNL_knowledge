/**
 * The /add form's client state, the pure half (capture.md 'Idea capture
 * without the round trip', parts 2–4, and 'Blank it').
 *
 * 1. The capture sheet → /add handoff. The sheet's 'Idea (full form)' link,
 *    when the line has text, writes the split line here (splitIdeaLine in
 *    capture-parse.ts) before it navigates; AddIdeaForm takes it on mount,
 *    when there is no ?draft, and fills the SHORT question and answer. The
 *    text rides in sessionStorage, never in a URL, so it never reaches a
 *    server log. The sheet's own draft is left alone by the link; once the
 *    idea exists, AddIdeaForm clears the sheet's line with clearSheetDraftIf,
 *    which also tells the mounted sheet (SHEET_DRAFT_CLEARED_EVENT) to drop
 *    the line it holds in memory.
 * 2. The autosave: the form's content (format and fields, never Field or
 *    Domain) in localStorage, so a reload, a closed tab or Android killing
 *    the TWA never loses a half-written card. Restore precedence on load:
 *    ?draft > handoff > autosave (restoreAddForm).
 * 3. The small editing reducers the form runs on keys: a LIST / ORDER /
 *    MULTI row's Enter and Backspace (rowKeyEdit), and the cloze 'Blank it'
 *    wrap (wrapSelection).
 *
 * Client-safe and dependency-free, so idea-capture-check.ts tests every rule
 * without React or a database. Every storage touch is guarded: missing
 * storage, a throwing accessor or malformed JSON reads as "nothing there"
 * and never throws. `env` is the test seam.
 *
 * Contract frozen in STEP 0 (docs/life-plan/capture-contracts.md); lane D
 * implements the bodies and adds the form helpers below them.
 */

/** sessionStorage key of the handoff. */
export const IDEA_HANDOFF_KEY = "xtnl:add:handoff";
/** A handoff older than this is ignored (and removed). */
export const IDEA_HANDOFF_TTL_MS = 10 * 60_000;
/** localStorage key of the capture sheet's unsent line, `{ text, reverted }` (QuickCapture's DRAFT_KEY). */
export const SHEET_DRAFT_KEY = "xtnl:capture:draft";
/**
 * Window event fired after clearSheetDraftIf removed the sheet's line;
 * `detail` is a SheetDraftCleared. The sheet (mounted once in the root
 * layout) clears its in-memory line when it still equals `detail.text`.
 */
export const SHEET_DRAFT_CLEARED_EVENT = "xtnl:capture:draft-cleared";

/** What the sheet hands over. `answer` is '' when the line had no '::'. */
export interface IdeaHandoffInput {
  question: string;
  answer: string;
  /** The sheet's line exactly as typed, so /add can clear it once the idea exists. */
  sheetText: string;
}

/** A stored handoff: the input plus when it was written (epoch ms). */
export interface IdeaHandoff extends IdeaHandoffInput {
  at: number;
}

export interface SheetDraftCleared {
  text: string;
}

/** The slice of Web Storage the handoff touches. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Test seams. `storage`: the store to use (default sessionStorage for the
 * handoff, localStorage for the sheet's draft; null means unavailable).
 * `now`: the clock in epoch ms (default Date.now()).
 */
export interface HandoffEnv {
  storage?: StorageLike | null;
  now?: number;
}

/**
 * The sheet's line is capped at 500 characters (MAX_CAPTURE_CHARS), so a
 * handoff field longer than this was not written by the sheet: it is cut on
 * write and read as malformed.
 */
const HANDOFF_FIELD_MAX = 2_000;
/** A handoff stamped further in the future than this (clock skew aside) is malformed. */
const HANDOFF_SKEW_MS = 60_000;

function defaultStore(kind: "session" | "local"): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    // A browser set to block site data throws on the accessor itself.
    return null;
  }
}

function storeOf(env: { storage?: StorageLike | null } | undefined, kind: "session" | "local"): StorageLike | null {
  return env && env.storage !== undefined ? env.storage : defaultStore(kind);
}

function readRaw(store: StorageLike | null, key: string): string | null {
  if (!store) return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function removeQuietly(store: StorageLike | null, key: string): void {
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* nothing to do: the entry stays, and the next read rejects it again */
  }
}

function parseJson(raw: string | null): unknown {
  if (raw === null || raw === "") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const isText = (v: unknown, max = Infinity): v is string => typeof v === "string" && v.length <= max;

/**
 * Writes the handoff (sessionStorage IDEA_HANDOFF_KEY = { question, answer,
 * sheetText, at }). Returns true when it was stored; false when storage is
 * missing or throws, in which case the link still navigates, just empty.
 */
export function writeIdeaHandoff(input: IdeaHandoffInput, env?: HandoffEnv): boolean {
  if (!input || !isText(input.question) || !isText(input.answer) || !isText(input.sheetText)) return false;
  const question = input.question.trim().slice(0, HANDOFF_FIELD_MAX);
  const answer = input.answer.trim().slice(0, HANDOFF_FIELD_MAX);
  // Nothing to carry: the form opens empty either way.
  if (!question && !answer) return false;
  const store = storeOf(env, "session");
  if (!store) return false;
  const value: IdeaHandoff = { question, answer, sheetText: input.sheetText.slice(0, HANDOFF_FIELD_MAX), at: env?.now ?? Date.now() };
  try {
    store.setItem(IDEA_HANDOFF_KEY, JSON.stringify(value));
    return true;
  } catch {
    // Quota or a blocked store: the form simply opens empty.
    return false;
  }
}

/**
 * Reads the handoff and deletes it (one use). Null when there is none, when
 * it is older than IDEA_HANDOFF_TTL_MS, or when it is malformed.
 */
export function takeIdeaHandoff(env?: HandoffEnv): IdeaHandoff | null {
  const store = storeOf(env, "session");
  const raw = readRaw(store, IDEA_HANDOFF_KEY);
  if (raw === null) return null;
  // One use, whatever it turns out to be: an expired or broken entry must
  // not fill the form on some later visit either.
  removeQuietly(store, IDEA_HANDOFF_KEY);
  const v = parseJson(raw);
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const h = v as Record<string, unknown>;
  if (!isText(h.question, HANDOFF_FIELD_MAX) || !isText(h.answer, HANDOFF_FIELD_MAX) || !isText(h.sheetText, HANDOFF_FIELD_MAX)) return null;
  if (typeof h.at !== "number" || !Number.isFinite(h.at)) return null;
  const age = (env?.now ?? Date.now()) - h.at;
  if (age > IDEA_HANDOFF_TTL_MS || age < -HANDOFF_SKEW_MS) return null;
  const question = h.question.trim();
  const answer = h.answer.trim();
  if (!question && !answer) return null;
  return { question, answer, sheetText: h.sheetText, at: h.at };
}

/**
 * After an idea is created from a handoff: removes the sheet's line
 * (localStorage SHEET_DRAFT_KEY) only when its text still equals
 * `sheetText`, then dispatches SHEET_DRAFT_CLEARED_EVENT with
 * { text: sheetText }. Returns true when the line was removed.
 *
 * The event goes out even when storage held nothing to remove (blocked
 * storage, or the sheet had not written yet): the sheet keeps its line in
 * memory, and it clears that line only when it still equals `detail.text`,
 * so a line typed since is never touched.
 */
export function clearSheetDraftIf(sheetText: string, env?: HandoffEnv): boolean {
  if (!isText(sheetText) || !sheetText.trim()) return false;
  const store = storeOf(env, "local");
  let removed = false;
  const v = parseJson(readRaw(store, SHEET_DRAFT_KEY));
  if (v && typeof v === "object" && (v as { text?: unknown }).text === sheetText) {
    try {
      store?.removeItem(SHEET_DRAFT_KEY);
      removed = true;
    } catch {
      removed = false;
    }
  }
  try {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
      const detail: SheetDraftCleared = { text: sheetText };
      window.dispatchEvent(new CustomEvent(SHEET_DRAFT_CLEARED_EVENT, { detail }));
    }
  } catch {
    /* no listener can be told; storage is already settled */
  }
  return removed;
}

// ── The autosave ────────────────────────────────────────────────────────────

/** localStorage key of the /add form's unsaved content. */
export const ADD_AUTOSAVE_KEY = "xtnl:add:autosave";
/** About 20 KB: a snapshot longer than this (in characters) is not written. */
export const ADD_AUTOSAVE_MAX_CHARS = 20_000;
/** Typing settles this long before the snapshot is written. */
export const ADD_AUTOSAVE_DEBOUNCE_MS = 400;

/** The formats the form can write (DIAGRAM needs an image editor). */
export const ADD_FORMATS = ["SHORT", "CLOZE", "NUMERIC", "MULTI", "LIST", "ORDER", "FORMULA"] as const;
export type AddFormat = (typeof ADD_FORMATS)[number];

/** The form's content: the format and every field, never the Field, Domain or collection. */
export interface AddContentState {
  type: AddFormat;
  shortQuestion: string;
  shortAnswer: string;
  /** Capitals must match (SHORT). Off by default; a snapshot from before it existed reads as off. */
  shortCaseSensitive: boolean;
  formulaQuestion: string;
  formulaAnswer: string;
  clozeText: string;
  listPrompt: string;
  listItems: string[];
  orderPrompt: string;
  orderItems: string[];
  numericPrompt: string;
  numericValue: string;
  numericTolerance: string;
  numericUnit: string;
  options: string[];
  correctIndex: number;
}

/** A fresh form: what the fields hold before anything is typed. */
export const EMPTY_ADD_CONTENT: AddContentState = {
  type: "SHORT",
  shortQuestion: "",
  shortAnswer: "",
  shortCaseSensitive: false,
  formulaQuestion: "",
  formulaAnswer: "",
  clozeText: "",
  listPrompt: "",
  listItems: ["", ""],
  orderPrompt: "",
  orderItems: ["", ""],
  numericPrompt: "",
  numericValue: "",
  numericTolerance: "0",
  numericUnit: "",
  options: ["", ""],
  correctIndex: 0,
};

const TEXT_KEYS = [
  "shortQuestion",
  "shortAnswer",
  "formulaQuestion",
  "formulaAnswer",
  "clozeText",
  "listPrompt",
  "orderPrompt",
  "numericPrompt",
  "numericValue",
  "numericTolerance",
  "numericUnit",
] as const;
const LIST_KEYS = ["listItems", "orderItems", "options"] as const;
/** More rows than any form a person writes; a longer stored list is malformed. */
const AUTOSAVE_ROWS_MAX = 200;

/** True when nothing worth keeping was typed: a format alone is not content, nor the default "0" tolerance. */
export function isEmptyAddContent(s: AddContentState): boolean {
  for (const k of TEXT_KEYS) {
    const v = s[k].trim();
    if (k === "numericTolerance" ? v !== "" && v !== "0" : v !== "") return false;
  }
  return LIST_KEYS.every((k) => s[k].every((v) => !v.trim()));
}

/** A stable key for "has the content changed", in field order. */
export function addContentKey(s: AddContentState): string {
  return JSON.stringify([s.type, ...TEXT_KEYS.map((k) => s[k]), ...LIST_KEYS.map((k) => s[k]), s.correctIndex, s.shortCaseSensitive]);
}

export type AutosaveEncoding = { kind: "empty" } | { kind: "too-big"; chars: number } | { kind: "ok"; json: string };

/** What writing this snapshot would store: nothing (empty), nothing (over the cap), or the JSON. */
export function encodeAddAutosave(s: AddContentState, now: number): AutosaveEncoding {
  if (isEmptyAddContent(s)) return { kind: "empty" };
  const json = JSON.stringify({ v: 1, at: now, state: s });
  return json.length > ADD_AUTOSAVE_MAX_CHARS ? { kind: "too-big", chars: json.length } : { kind: "ok", json };
}

/** A stored snapshot back as content, or null when it is missing, empty or malformed in any field. */
export function decodeAddAutosave(raw: string | null): AddContentState | null {
  if (raw === null || raw.length > ADD_AUTOSAVE_MAX_CHARS) return null;
  const v = parseJson(raw);
  if (!v || typeof v !== "object" || (v as { v?: unknown }).v !== 1) return null;
  const st = (v as { state?: unknown }).state;
  if (!st || typeof st !== "object" || Array.isArray(st)) return null;
  const s = st as Record<string, unknown>;
  if (typeof s.type !== "string" || !(ADD_FORMATS as readonly string[]).includes(s.type)) return null;
  const out = { ...EMPTY_ADD_CONTENT, type: s.type as AddFormat };
  for (const k of TEXT_KEYS) {
    if (!isText(s[k])) return null;
    out[k] = s[k] as string;
  }
  for (const k of LIST_KEYS) {
    const list = s[k];
    if (!Array.isArray(list) || list.length < 2 || list.length > AUTOSAVE_ROWS_MAX || !list.every((x) => typeof x === "string")) return null;
    out[k] = [...(list as string[])];
  }
  const c = s.correctIndex;
  out.correctIndex = Number.isInteger(c) && (c as number) >= 0 && (c as number) < out.options.length ? (c as number) : 0;
  out.shortCaseSensitive = s.shortCaseSensitive === true;
  return isEmptyAddContent(out) ? null : out;
}

export type AutosaveWrite = "saved" | "cleared" | "too-big" | "unavailable";

/** Writes the snapshot, or removes the entry when the form is empty. Never throws. */
export function writeAddAutosave(s: AddContentState, env?: HandoffEnv): AutosaveWrite {
  const store = storeOf(env, "local");
  if (!store) return "unavailable";
  const enc = encodeAddAutosave(s, env?.now ?? Date.now());
  try {
    if (enc.kind === "empty") {
      store.removeItem(ADD_AUTOSAVE_KEY);
      return "cleared";
    }
    // Over the cap the last snapshot that fitted stays: older text beats none.
    if (enc.kind === "too-big") return "too-big";
    store.setItem(ADD_AUTOSAVE_KEY, enc.json);
    return "saved";
  } catch {
    return "unavailable";
  }
}

/** The stored snapshot, or null. A malformed entry is removed. */
export function readAddAutosave(env?: HandoffEnv): AddContentState | null {
  const store = storeOf(env, "local");
  const raw = readRaw(store, ADD_AUTOSAVE_KEY);
  if (raw === null) return null;
  const state = decodeAddAutosave(raw);
  if (!state) removeQuietly(store, ADD_AUTOSAVE_KEY);
  return state;
}

/** Forgets the snapshot: on created, merged, linked, enriched and Discard. */
export function clearAddAutosave(env?: HandoffEnv): void {
  removeQuietly(storeOf(env, "local"), ADD_AUTOSAVE_KEY);
}

/** The two stores the restore reads (defaults: sessionStorage and localStorage). */
export interface RestoreEnv {
  session?: StorageLike | null;
  local?: StorageLike | null;
  now?: number;
}

export type AddRestore =
  | { source: "draft" }
  | { source: "handoff"; handoff: IdeaHandoff }
  | { source: "autosave"; state: AddContentState }
  | { source: "none" };

/**
 * What fills the form on load: ?draft > handoff > autosave.
 *
 * With a draft nothing is read, so the handoff is not consumed (it expires
 * on its own) and the autosave is left for a later visit. A handoff wins
 * over the autosave without touching it.
 */
export function restoreAddForm(hasDraft: boolean, env?: RestoreEnv): AddRestore {
  if (hasDraft) return { source: "draft" };
  const handoff = takeIdeaHandoff(env && "session" in env ? { storage: env.session, now: env.now } : { now: env?.now });
  if (handoff) return { source: "handoff", handoff };
  const state = readAddAutosave(env && "local" in env ? { storage: env.local } : undefined);
  return state ? { source: "autosave", state } : { source: "none" };
}

// ── Row keys (LIST, ORDER and MULTI) ───────────────────────────────────────

export interface RowEdit {
  items: string[];
  /** The row to focus next, caret at its end. */
  focus: number;
  /** The index a new empty row went in at. */
  insertedAt?: number;
  /** The index of the row that was removed. */
  removedAt?: number;
}

/**
 * Enter and Backspace in a row input. Enter adds an empty row after the
 * current one and focuses it (never submits); at `max` rows it only moves to
 * the next row. Backspace in an empty row, when there are more than `min`
 * rows, removes it and focuses the previous one. Null: let the key through.
 */
export function rowKeyEdit(items: readonly string[], index: number, key: "Enter" | "Backspace", opts: { min?: number; max?: number } = {}): RowEdit | null {
  const min = opts.min ?? 2;
  const max = opts.max ?? Infinity;
  if (!Number.isInteger(index) || index < 0 || index >= items.length) return null;
  if (key === "Enter") {
    if (items.length >= max) return index + 1 < items.length ? { items: [...items], focus: index + 1 } : null;
    const next = [...items.slice(0, index + 1), "", ...items.slice(index + 1)];
    return { items: next, focus: index + 1, insertedAt: index + 1 };
  }
  if (items[index] !== "" || items.length <= min) return null;
  return { items: items.filter((_, i) => i !== index), focus: Math.max(0, index - 1), removedAt: index };
}

/** Where a row index lands after an edit; null when that very row was removed. */
export function remapRowIndex(i: number, edit: Pick<RowEdit, "insertedAt" | "removedAt">): number | null {
  if (edit.insertedAt !== undefined) return i >= edit.insertedAt ? i + 1 : i;
  if (edit.removedAt !== undefined) {
    if (i === edit.removedAt) return null;
    return i > edit.removedAt ? i - 1 : i;
  }
  return i;
}

// ── Blank it (CLOZE) ────────────────────────────────────────────────────────

export interface WrappedText {
  text: string;
  /** The selection after the wrap: collapsed after the closing braces. */
  start: number;
  end: number;
  /** What became the blank. */
  blank: string;
  /** The span of the original text that was wrapped (the selection, edge whitespace trimmed). */
  from: number;
  to: number;
}

const BLANK_SPAN = /\{\{[^}]*\}\}/g;

/**
 * Wraps the selected text in {{ }}. Whitespace at either edge of the
 * selection stays outside the braces (a double-click takes the trailing
 * space). Null when there is nothing to wrap, or when the selection touches
 * a blank already (inside one, across one, or holding braces): a blank is
 * never wrapped twice, and the result always parses (idea-payload's
 * CLOZE_PATTERN takes no '}' inside a blank).
 */
export function wrapSelection(text: string, start: number, end: number): WrappedText | null {
  if (typeof text !== "string") return null;
  let s = Math.max(0, Math.min(text.length, Math.min(start, end)));
  let e = Math.max(0, Math.min(text.length, Math.max(start, end)));
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;
  if (s === e) return null;
  const blank = text.slice(s, e);
  if (blank.includes("}") || blank.includes("{{")) return null;
  for (const m of text.matchAll(BLANK_SPAN)) {
    const from = m.index;
    const to = from + m[0].length;
    if (s < to && e > from) return null;
  }
  const next = `${text.slice(0, s)}{{${blank}}}${text.slice(e)}`;
  const caret = e + 4;
  return { text: next, start: caret, end: caret, blank, from: s, to: e };
}
