"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { prisma } from "@/lib/prisma";
import { cached, invalidate } from "@/lib/cache";
import { getCurrentUserId } from "@/lib/user";
import { dateColumn, todayKey, type DayKey } from "@/lib/life-day";
import { parseCapture, sanitizeCaptureInput, type CaptureSpan } from "@/lib/capture-parse";
import {
  createTemplateCore,
  loadActiveTitles,
  loadOpenGoals,
  loadRecentCaptures,
  recaptureCore,
  runCaptureBatch,
  tickFactsOf,
  type CreatedTask,
  type RecaptureResult,
} from "@/lib/tasks";
import { applySizing } from "@/lib/life-sizing";
import { fileIdeaDraftCore } from "@/lib/idea-filing";
import { loadStructureWords, loadVocabulary } from "@/lib/vocabulary";
import type { BoardPlace, CaptureMode, ParsedCapture, TaskKind } from "@/lib/life-types";

/**
 * The capture sheet's server calls: write one line (or a pasted list, or an
 * edit of a line saved under ten minutes ago), and fetch what the sheet
 * needs to preview it. Contracts: docs/life-plan/capture-contracts.md.
 *
 * The line is the only thing the browser sends. The chips it drew were a
 * preview; this re-parses the raw text with the same pure function and the
 * user's reverted spans, and only that parse is stored. The write is one
 * insert with the lexical grade, so a capture lands in one round trip; the
 * AI refines the size in `after()`, where a model outage can slow a grade
 * but never lose a line.
 */

/**
 * Why a capture call was refused, when the sheet must act on the reason
 * rather than just show it: 'too-late' (an edit past the 10-minute window;
 * the sheet offers 'Save as new') and 'gone' (the capture being edited no
 * longer exists, or was already taken back or replaced by another edit, so
 * this edit has nothing to replace). Absent on every other failure.
 * tasks.ts undoCaptureCore uses 'gone' too: a capture missing, or replaced
 * by an edit whose line still stands (Undo then refuses rather than say
 * 'Removed' while the edited line stays on the board).
 */
export type CaptureErrorCode = "too-late" | "gone";

export type CaptureResult<T> = { ok: true; value: T } | { ok: false; error: string; code?: CaptureErrorCode };

export interface CapturedItem {
  id: string;
  title: string;
  /**
   * What one completion at the estimate pays right now, priced against
   * today's real ledger (the knee base, repeat decay, the INTRO count) —
   * or, for a done-now capture that was ticked, what the tick paid.
   */
  projectedXp: number;
  /** The parse in the board's words, e.g. 'Mon · Thu · compulsory'. */
  describe: string;
  kind: TaskKind;
  mode: CaptureMode;
  /**
   * A tick went through with this save, and projectedXp is what it paid: the
   * line was done-now, or (an edit) the replaced line was ticked on Today and
   * the edit kept that completion on the new row.
   */
  doneNow: boolean;
  /**
   * Why a tick this save owed was not made ('It isn't due today.', 'Saved on
   * Wed 30 Sep; tick it on Today.', or for an edit 'The old line's tick was
   * taken back. …'); null otherwise.
   */
  doneNowError: string | null;
  /** This line was already saved by an earlier send (a retry): nothing new was written. */
  duplicate: boolean;
  /** Where the item continues, if anywhere: an idea draft opens the full idea form. */
  href: string | null;
  /**
   * Where it went, in the board's own lane names ('Planned later · Fri 2 Oct'),
   * computed by createTemplateCore from the inserted row with today-board's
   * placeOf (the same function buildBoard files by). An idea that files itself
   * is { lane: 'inbox', label: 'Inbox · filing' }.
   */
  where: BoardPlace;
  /** Set by recaptureFromCapture: the capture this one replaced (archived, its tick netted to zero). */
  replacedId?: string;
  /** Set by recaptureFromCapture when the new line was saved but the old one could not be taken back. */
  oldKept?: boolean;
  /** An 'idea: Q :: A' draft is being filed as an Idea in the background (fileIdeaDraftCore); no points are shown. */
  filing?: boolean;
}

/**
 * One-box ideas (capture.md P2): an 'idea: Q :: A' draft files itself as an
 * Idea in after(). capture.md asks for the user's one-line confirmation
 * before this ships, so it stays off until the lead turns it on. Off, the
 * draft (question as title, answer as note) waits in the Inbox, where
 * Finish opens the full form.
 */
const IDEA_SELF_FILING = false;

const SAVE_FAILED = "Couldn't save it. Your line is kept — try again.";

type PreparedLine = { ok: true; text: string; parsed: ParsedCapture } | { ok: false; error: string };

/** The line as the server reads it: sanitized, then parsed for `today`, exactly as the sheet's chips were drawn. */
function prepareLine(text: unknown, reverted: unknown, today: DayKey): PreparedLine {
  const input = sanitizeCaptureInput(text, reverted);
  if (!input.text.trim()) return { ok: false, error: "Type something to capture." };
  const parsed = parseCapture(input.text, { today, reverted: input.reverted });
  if (!parsed.title) return { ok: false, error: "Add a few words for the title — only dates and tags are left." };
  return { ok: true, text: input.text, parsed };
}

/** A key the sheet sent with a line, or none; tasks.ts validates it (cleanCaptureKey). */
function keyOf(key: unknown): string | null {
  return typeof key === "string" ? key : null;
}

/** Whether a saved line files itself as an Idea after the response: a new idea draft with an answer. */
function filesItself(parsed: ParsedCapture, created: CreatedTask): boolean {
  return IDEA_SELF_FILING && parsed.mode === "IDEA" && !created.duplicate && !!parsed.answer?.trim();
}

function itemOf(parsed: ParsedCapture, created: CreatedTask, filing: boolean): CapturedItem {
  return {
    id: created.id,
    title: created.title,
    projectedXp: Number.isFinite(created.projectedXp) ? created.projectedXp : 0,
    describe: created.describe,
    kind: parsed.kind,
    mode: parsed.mode,
    // The result's own tick facts: a done-now tick, or an edit that kept the old row's tick from Today.
    ...tickFactsOf(created),
    duplicate: created.duplicate,
    href: parsed.kind === "IDEA_DRAFT" ? `/add?draft=${encodeURIComponent(created.id)}` : null,
    where: filing ? { lane: "inbox", label: "Inbox · filing" } : created.where,
    ...(filing ? { filing: true } : {}),
  };
}

interface SavedLine {
  parsed: ParsedCapture;
  created: CreatedTask;
  filing: boolean;
}

/**
 * The work a save leaves for after the response. Sizing only means
 * something for work that pays: an idea draft is filed, not done, and a
 * goal pays through its steps; a retried line was sized (or is being sized)
 * by its first send, and a second call would spend its retry. Rows are
 * sized one after another in one after(). Self-filing ideas run in their
 * own after(), so a slow model on one never holds up the other. `userId`
 * is read before after(), never inside it.
 */
function afterSave(userId: string, saved: readonly SavedLine[]): void {
  const toSize = saved.filter((s) => s.parsed.kind !== "IDEA_DRAFT" && s.parsed.kind !== "GOAL" && !s.created.duplicate).map((s) => s.created.id);
  const toFile = saved.filter((s) => s.filing).map((s) => s.created.id);
  if (toSize.length > 0) {
    after(async () => {
      for (const id of toSize) {
        try {
          await applySizing(id);
        } catch (err) {
          console.error("Capture sizing failed:", err);
        }
      }
    });
  }
  if (toFile.length > 0) {
    after(async () => {
      for (const id of toFile) {
        try {
          await fileIdeaDraftCore(userId, id);
        } catch (err) {
          // fileIdeaDraftCore never throws by contract; the draft stays in the Inbox either way.
          console.error("Idea draft not filed:", err);
        }
      }
    });
  }
}

/**
 * Saves one line. `opts.captureKey` is the sheet's per-line nonce: send the
 * same one on every retry of a line, and a save whose response was lost is
 * found again rather than written twice.
 */
export async function createFromCapture(
  text: string,
  reverted?: CaptureSpan[],
  opts?: { refresh?: boolean; captureKey?: string }
): Promise<CaptureResult<CapturedItem>> {
  const line = prepareLine(text, reverted, todayKey());
  if (!line.ok) return line;

  let userId: string;
  let created: CreatedTask;
  try {
    userId = getCurrentUserId();
    created = await createTemplateCore(userId, line.parsed, { rawText: line.text, captureSource: "quick", captureKey: keyOf(opts?.captureKey) });
  } catch (err) {
    console.error("createFromCapture failed:", err);
    // The sheet keeps the line in local storage until this says ok, so the
    // failure costs a retry, never the words.
    return { ok: false, error: SAVE_FAILED };
  }

  // createTemplateCore clears what it wrote; repeated here because the sheet
  // is the one writer that can fire from any page, and a stale Today board
  // after a capture is the exact failure it exists to prevent. Safe to over-call.
  invalidate("life", "activity");

  const filing = filesItself(line.parsed, created);
  afterSave(userId, [{ parsed: line.parsed, created, filing }]);

  // Only when asked: the sheet asks from /today, where the new row belongs on
  // the board. Anywhere else — a review session above all — the page is left alone.
  if (opts?.refresh === true) refresh();

  return { ok: true, value: itemOf(line.parsed, created, filing) };
}

/**
 * Edits a line saved under ten minutes ago (capture.md 'Edit a line you just
 * saved'): sanitizes and re-parses `text` exactly as createFromCapture does,
 * then tasks.ts recaptureCore writes the new row FIRST (under
 * `opts.captureKey`), takes the old one back with undoCaptureCore (its ticks
 * net to zero), and only then ticks: a done-now line, or a line whose old
 * row was ticked on Today (the edit keeps that completion, priced fresh;
 * an old 'x …' line edited without its 'x' is not ticked). An old row
 * already archived is this same edit resent only when a row already has
 * this edit's captureKey: that row comes back, with no second write and no
 * second tick. Sizing runs in after() under createFromCapture's rules.
 *
 * Results: ok with `replacedId: oldId` (and the tick facts in doneNow,
 * projectedXp and doneNowError); ok with `oldKept: true` when the old row
 * could not be taken back; `{ ok: false, code: 'too-late' }` past
 * CAPTURE_UNDO_MS; `{ ok: false, code: 'gone' }` when the old row is missing,
 * or archived with no row under this edit's key (taken back, or replaced by
 * an earlier edit): never a second row beside an earlier edit's.
 */
export async function recaptureFromCapture(
  oldId: string,
  text: string,
  reverted?: CaptureSpan[],
  opts?: { refresh?: boolean; captureKey?: string }
): Promise<CaptureResult<CapturedItem>> {
  if (typeof oldId !== "string" || !oldId) return { ok: false, error: "That capture is gone.", code: "gone" };
  const line = prepareLine(text, reverted, todayKey());
  if (!line.ok) return line;

  let userId: string;
  let res: RecaptureResult;
  try {
    userId = getCurrentUserId();
    res = await recaptureCore(userId, oldId, line.parsed, { rawText: line.text, captureSource: "quick", captureKey: keyOf(opts?.captureKey) });
  } catch (err) {
    console.error("recaptureFromCapture failed:", err);
    return { ok: false, error: "Couldn't save the change. Your line is kept — try again." };
  }
  if (!res.ok) return res.code ? { ok: false, error: res.error, code: res.code } : { ok: false, error: res.error };

  invalidate("life", "activity");
  const { replacedId, oldKept, ...created } = res.value;
  const filing = filesItself(line.parsed, created);
  afterSave(userId, [{ parsed: line.parsed, created, filing }]);
  if (opts?.refresh === true) refresh();

  return { ok: true, value: { ...itemOf(line.parsed, created, filing), replacedId, ...(oldKept ? { oldKept: true } : {}) } };
}

/** One pasted line: its text, its reverted spans, and its own nonce (stored in pending before sending). */
export interface CaptureLineInput {
  text: string;
  reverted?: CaptureSpan[];
  captureKey: string;
}

/** One pasted line's outcome, in the order the lines were sent. A failure carries its captureKey so the sheet can file it. */
export type CaptureLineResult = { ok: true; item: CapturedItem } | { ok: false; captureKey: string; error: string };

export interface CaptureManyResult {
  results: CaptureLineResult[];
}

/**
 * Saves a pasted list, one task per line (capture.md 'Paste a list'): at most
 * CAPTURE_BATCH_MAX lines, each sanitized and re-parsed for the same life
 * day, created in turn with createTemplateCore under its own captureKey, so
 * each line is all-or-nothing and a retry finds what an earlier send wrote
 * (tasks.ts runCaptureBatch). Done-now lines tick; a Must with no day saves
 * as an ordinary task, as a single line does. One after() sizes the new rows
 * in turn; one refresh() when asked and anything was saved.
 */
export async function createManyFromCapture(
  lines: CaptureLineInput[],
  opts?: { refresh?: boolean }
): Promise<CaptureManyResult> {
  let userId: string | null = null;
  try {
    userId = getCurrentUserId();
  } catch (err) {
    console.error("createManyFromCapture: no user:", err);
  }
  // One life day for the whole list: every line parses as the preview drew it.
  const today = todayKey();
  const saved: SavedLine[] = [];

  const results = await runCaptureBatch<CapturedItem>(lines, async (line) => {
    if (!userId) return { ok: false, error: SAVE_FAILED };
    const prepared = prepareLine(line.text, line.reverted, today);
    if (!prepared.ok) return prepared;
    const created = await createTemplateCore(userId, prepared.parsed, { rawText: prepared.text, captureSource: "quick", captureKey: line.captureKey });
    const filing = filesItself(prepared.parsed, created);
    saved.push({ parsed: prepared.parsed, created, filing });
    return { ok: true, value: itemOf(prepared.parsed, created, filing) };
  });

  if (userId && saved.length > 0) {
    invalidate("life", "activity");
    afterSave(userId, saved);
    if (opts?.refresh === true) refresh();
  }
  return { results };
}

/** An open template's title, for the sheet's quiet 'Already on your board' note (capture.md P3). */
export interface CaptureActiveTitle {
  /** life-lexicon normTitleOf(title): the sheet matches on equality only. */
  normTitle: string;
  title: string;
  where: BoardPlace;
}

export interface CaptureVocabulary {
  /**
   * The player's own words for WordComplete, structure names first — the /add
   * list. Loaded only when `opts.words` is true (idea mode); [] otherwise.
   */
  words: string[];
  /** Open goals, for previewing what a '^name' will attach to. */
  goals: { id: string; title: string }[];
  /** R_before: today's SUM(rawXp), the knee base the grade chip prices against. */
  rawBefore: number;
  /** The server's life day, so the sheet can tell when rawBefore has gone stale. */
  day: DayKey;
  /**
   * The distinct rawText of the last 8 quick captures of kind TASK or HABIT
   * in the last 30 days, newest first: the empty line's 'Recent' chips.
   */
  recent: string[];
  /** Open templates (not archived, not completed), at most 300, for the duplicate note. */
  active: CaptureActiveTitle[];
}

// The open goals come from tasks.ts loadOpenGoals: the same list, in the same
// order, that createTemplateCore matches '^name' against, so the chip's
// preview (matchParentGoal over it) is exactly what the server links.

const loadRawBefore = (userId: string, day: DayKey) =>
  cached(`captureRawBefore:${userId}:${day}`, ["activity"], async () => {
    const sum = await prisma.activityEvent.aggregate({
      where: { userId, day: dateColumn(day), rawXp: { not: null } },
      _sum: { rawXp: true },
    });
    return Math.max(0, sum._sum.rawXp ?? 0);
  });

type VocabWords = Awaited<ReturnType<typeof loadVocabulary>>;
type StructureWords = Awaited<ReturnType<typeof loadStructureWords>>;

/**
 * What the sheet previews a line against. Fetched lazily, never shipped in
 * the layout. The ~1,200-word list is read only for idea mode
 * (`opts.words === true`): a task line never shows it, and a lighter call
 * keeps the sheet's first save from queueing behind it. `recent` and
 * `active` are tasks.ts reads, cached under 'life' (the active titles from
 * the Today board's own cached read). Every part fails soft — a sheet with
 * no suggestions and a ≈ price read against an empty day still captures,
 * which is all it must never stop doing.
 */
export async function loadCaptureVocabulary(opts?: { words?: boolean }): Promise<CaptureVocabulary> {
  const now = new Date();
  const day = todayKey(now);
  let userId: string;
  try {
    userId = getCurrentUserId();
  } catch {
    return { words: [], goals: [], rawBefore: 0, day, recent: [], active: [] };
  }

  const withWords = typeof opts === "object" && opts !== null && opts.words === true;
  const [vocab, structure, goals, rawBefore, recent, active] = await Promise.all([
    withWords ? loadVocabulary().catch((): VocabWords => []) : Promise.resolve<VocabWords>([]),
    withWords ? loadStructureWords().catch((): StructureWords => []) : Promise.resolve<StructureWords>([]),
    loadOpenGoals(userId).catch(() => []),
    loadRawBefore(userId, day).catch(() => 0),
    loadRecentCaptures(userId, now).catch((): string[] => []),
    loadActiveTitles(userId, now).catch((): CaptureActiveTitle[] => []),
  ]);

  // The same merge as /add: structure names first, de-duplicated without case.
  const seen = new Set<string>();
  const words: string[] = [];
  for (const word of [...structure, ...vocab.map((v) => v.word)]) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }

  return { words, goals, rawBefore, day, recent, active };
}
