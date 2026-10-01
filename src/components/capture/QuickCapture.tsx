"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  createFromCapture,
  createManyFromCapture,
  loadCaptureVocabulary,
  recaptureFromCapture,
  undoWeightCapture,
  type CaptureErrorCode,
  type CaptureManyResult,
  type CaptureResult,
  type CapturedItem,
} from "@/app/actions/capture";
import { undoCapture } from "@/app/actions/tasks";
import { MAX_CAPTURE_CHARS, isCaptureHotkey, parseCapture, shiftReverted, splitIdeaLine, type CaptureSpan } from "@/lib/capture-parse";
import { todayKey, type DayKey } from "@/lib/life-day";
import type { CaptureToken } from "@/lib/life-types";
import { normTitleOf } from "@/lib/life-lexicon";
import { mark } from "@/lib/celebrate";
import { MODAL_OPEN_SELECTOR } from "@/lib/shortcuts";
import { SHEET_DRAFT_CLEARED_EVENT, writeIdeaHandoff, type SheetDraftCleared } from "@/lib/idea-handoff";
import { useWordComplete, WordHintBar } from "@/components/WordComplete";
import { useAutocorrect } from "@/components/useAutocorrect";
import { IconButton } from "@/components/ui/Button";
import { dismissToast, getToasts, pushToast, subscribeToasts } from "@/components/ui/toast-store";
import { CaptureChips } from "./CaptureChips";
import { StatusLine, TOAST_MS, TOAST_SHORT_MS, dockToastOf, toastSentence, type Toast } from "./CaptureToast";
import { CAPTURE_EVENT, CAPTURED_EVENT, type CaptureRequest } from "./events";
import { InsertRow, SuggestRow, type Suggestion } from "./InsertRow";
import { JustAdded } from "./JustAdded";
import { PastePreview } from "./PastePreview";
import { useKeyboardInset, useMediaQuery, useStickToBottom } from "./capture-hooks";
import { PENDING_STALE_MS, mayRetryNow, nextRetryDelay, queueDue, queueSettle, queueWake } from "./capture-queue";
import { addPending, dropPending, readDraft, readPending, readVocabCache, writeDraft, writeVocabCache } from "./capture-store";
import {
  CAPTURE_OPEN_HASH,
  EDIT_BUSY_NOTE,
  EDIT_GONE,
  EDIT_TOO_LATE,
  FRAGMENT_BUSY_NOTE,
  KEY_HINT,
  LEGEND,
  POCKET_PLACEHOLDER,
  POCKET_WAIT_MS,
  TOUCH_HINT,
  addedAnnouncement,
  addedReducer,
  dockToastChoice,
  applyInsert,
  caretContext,
  caretPrefix,
  caretWord,
  duplicateOf,
  canEditEntry,
  editFill,
  editRefusalNote,
  enterAction,
  goalInsertText,
  goalSuggestions,
  historyOnClose,
  historyOnOpen,
  historyOnPop,
  insertedNote,
  isUndoCaptureKey,
  menuNote,
  mustFixInserts,
  mustGate,
  nextPruneAt,
  pendingDayNote,
  primaryAction,
  readCaptureFragment,
  recentChips,
  replaceCaretWord,
  replacingOf,
  splitPastedLines,
  stampLine,
  submitAllowed,
  tagSuggestions,
  toInboxLine,
  undoGoneCopy,
  unsentLabel,
  unsentSavedCopy,
  vocabOnOpen,
  vocabPriceable,
  vocabRefreshDecision,
  vocabStale,
  VOCAB_IDLE_MS,
  VOCAB_REFRESH_DELAY_MS,
  type AddedEntry,
  type CloseReason,
  type EnterSource,
  type Insert,
  type InsertMenu,
  type PendingLine,
  type ReplacingState,
  type VocabCache,
} from "./capture-ui";
import { pushEscapeLayer, trapTab } from "./layers";
import type { WeightUnit } from "@/lib/weight";
import {
  WEIGHT_PRIMARY,
  WEIGHT_UNDO_UNAVAILABLE,
  WEIGH_IN_NOT_AN_EDIT,
  mayBeWeighIn,
  weighInOf,
  weighInOutOfRange,
  weightChipLabel,
  weightRangeBlocked,
  weightRangeNote,
  weightUndoneCopy,
} from "./weight-capture";

/**
 * The one-line capture sheet, mounted once in the root layout.
 *
 * The whole point is friction: on a desktop a task is one key, the line,
 * and Enter; on the phone it is the tab bar's +, the home-screen shortcut
 * (/today?capture=task), a '#capture=' link, the line, and the keyboard's
 * own action key. Nothing is required but the words. The line is read as
 * it is typed and shown back as quiet chips, and any chip that guessed
 * wrong is one tap from being plain text again. The grammar can be tapped
 * too: the row above the line adds a day, a schedule, a Must, an estimate,
 * a goal, the Inbox mark or the idea prefix.
 *
 * On a phone the keyboard's action key saves and STAYS (burst capture):
 * three lines cost one keyboard rise, and Add (or Done, on an empty line)
 * closes. Each saved line joins 'Added here' with Edit and Undo for ten
 * minutes; Edit refills the exact line that was sent and saves the change
 * over it (recaptureFromCapture). The toast names where every capture went
 * in the board's own words, and says so honestly when a tick did not go
 * through or a Must had no day.
 *
 * Saving never waits on the server. A line is written to local storage
 * first and forgotten only when the server confirms it; a lost or offline
 * send is queued and retries on its own (capture-queue.ts), with the
 * line's nonce as the capture key, so a retry finds the row an earlier send
 * wrote instead of writing a second. A line only retries on its own on the
 * life day it was captured (the server reads 'tmr' and a done-now tick
 * against the day it arrives); another day's waits for a manual Retry. A
 * pasted list becomes one task per line after a preview. While an edit of a
 * line is on its way, that line's Edit and Undo wait for it.
 *
 * The board's 'just added' flash plays behind the open sheet's scrim, so
 * while the sheet is open the last capture is held and announced to the
 * board (CAPTURED_EVENT) when it closes.
 *
 * On the Fold's cover screen the sheet is a column pinned to the top of
 * the keyboard: everything that grows (the list, the status, the chips)
 * sits in a scroll region above the line, so the line and its buttons never
 * move while typing. Back closes the sheet on a phone (one hash-only
 * history entry). The sheet and its scrim are portalled to <body> (never
 * inside <main>, whose @container would trap a fixed layer), under one
 * [data-capture-ui] marker so the review card can tell a tap meant for the
 * sheet from one meant for it.
 *
 * A weigh-in line ('weight 72.4', 'w 160 lb yesterday': weight-capture.ts)
 * is logged as that day's reading, never saved as a task: one chip, 'Log
 * weight', a toast with Undo and a View link to Train, no Edit, no board
 * flash and no celebration (a record, not a reward).
 */

const NO_WORDS: string[] = [];
/** The dock key every capture toast shares: a new one replaces the last. */
const DOCK_KEY = "capture";
/** Auto-retried lines saved within this long are counted in one 'N unsent lines saved'. */
const UNSENT_SUMMARY_MS = 10_000;
const GAVE_UP = "Couldn't reach the server after several tries. Your line is kept — retry when you're back online.";
const TITLE_MISSING = "Add a few words for the title — only dates and tags are left.";

const noopSubscribe = () => () => {};

type Origin = "user" | "manual" | "auto" | "batch";

interface Line {
  text: string;
  reverted: CaptureSpan[];
}

/** A line not confirmed yet: waiting to retry on its own, or failed for good (with the server's reason). */
interface Unsent extends PendingLine {
  state: "queued" | "failed";
  attempts: number;
  nextAt: number;
  error?: string;
  /** An edit refused as too late or gone: its row offers 'Save as new' instead of Retry. */
  code?: CaptureErrorCode;
}

interface SheetVocab extends VocabCache {
  /** The ≈ price may be shown: the server's answer for today's life day, or a fresh cache of one. */
  priced: boolean;
  /** WordComplete's words, loaded only for idea lines; null until then. */
  words: string[] | null;
}

interface Opening {
  id: number;
  openedAt: number;
  /** Lines sent in this opening. */
  sent: number;
  /** Titles confirmed for this opening, in the order they were added. */
  titles: string[];
  /** The capture ids behind `titles`, index for index: an edit of one replaces its title in place. */
  ids: string[];
  /** Edits sent in this opening of a line this opening already added: they change a row, they add none. */
  merged: number;
  failed: number;
  /** A save of this opening has settled. */
  saved: boolean;
  /** The background vocabulary refresh ran in this opening. */
  refreshed: boolean;
  /** The last capture this opening confirmed, for the dock's one-line toast on close. */
  last?: { id: string; notMust: boolean; update: boolean };
}

function randomSalt(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** A line stamped now, under a fresh nonce (for a line sent again as new). */
function stampNow(line: { text: string; reverted: CaptureSpan[] }, seq: number): PendingLine {
  return stampLine(line, seq, Date.now(), randomSalt());
}

/** The stored fields of a line, without the unsent row's own state. */
function pendingOf(line: PendingLine): PendingLine {
  return {
    text: line.text,
    reverted: line.reverted,
    nonce: line.nonce,
    at: line.at,
    ...(line.replaces ? { replaces: line.replaces } : {}),
    ...(line.day ? { day: line.day } : {}),
  };
}

/**
 * A line a previous page load never heard back about. Today's waits until it
 * is stale (it may still be in flight elsewhere), then retries on its own;
 * another day's goes to the failed list with its note and is never sent
 * automatically (capture-ui pendingDayNote).
 */
function restoredUnsent(p: PendingLine, today: DayKey): Unsent {
  const note = pendingDayNote(p, today);
  if (note) return { ...pendingOf(p), state: "failed", attempts: 0, nextAt: 0, error: note };
  return { ...pendingOf(p), state: "queued", attempts: 0, nextAt: p.at + PENDING_STALE_MS };
}

/** What a send's outcome does to the unsent list (capture-queue's schedule, plus the line itself). */
function settleUnsent(
  list: readonly Unsent[],
  line: PendingLine,
  outcome: "saved" | "refused" | "network",
  now: number,
  automatic: boolean,
  failure?: { error: string; code?: CaptureErrorCode }
): Unsent[] {
  const queued = list.filter((u) => u.state === "queued");
  const { queue, giveUp } = queueSettle(queued, line.nonce, outcome, now, automatic);
  const rest = list.filter((u) => u.nonce !== line.nonce);
  const base = pendingOf(line);
  const q = queue.find((i) => i.nonce === line.nonce);
  if (q) return [...rest, { ...base, state: "queued", attempts: q.attempts, nextAt: q.nextAt }];
  if (outcome === "saved") return rest;
  const error = giveUp ? GAVE_UP : (failure?.error ?? GAVE_UP);
  return [...rest, { ...base, state: "failed", attempts: 0, nextAt: 0, error, ...(failure?.code ? { code: failure.code } : {}) }];
}

export function QuickCapture() {
  const pathname = usePathname();
  const onToday = pathname === "/today";
  /** The Train page shows the weight card: a weigh-in saved there refreshes it. */
  const onTrain = pathname === "/train";
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const [open, setOpen] = useState(false);
  const [day, setDay] = useState<DayKey>("");
  const [text, setText] = useState("");
  const [reverted, setReverted] = useState<CaptureSpan[]>([]);
  /** Chips tapped away, newest last, with the line as it was — Ctrl+Z brings one back while the line is unchanged. */
  const [revertHistory, setRevertHistory] = useState<{ span: CaptureSpan; text: string }[]>([]);
  const [caret, setCaret] = useState(0);
  const [vocab, setVocab] = useState<SheetVocab | null>(null);
  const [captured, setCaptured] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** A quiet note: 'Finish or clear the line first.', a link's text not used. */
  const [note, setNote] = useState<string | null>(null);
  // Lines a previous page load never heard back about are queued from the
  // first render (read once, on the client): a stale one goes at once, a
  // fresh one may still be in flight elsewhere, so it waits until it is stale.
  // A line from another life day is filed as failed instead (restoredUnsent).
  // Nothing renders from this before hydration ends (the portal waits for
  // the client), so the server's empty list never disagrees with it.
  const [unsent, setUnsent] = useState<Unsent[]>(() => {
    if (typeof window === "undefined") return [];
    const today = todayKey();
    return readPending().map((p) => restoredUnsent(p, today));
  });
  /** Edits in flight: nonce → the capture each replaces (with the unsent list, what locks Edit and Undo). */
  const [sendingEdits, setSendingEdits] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [toast, setToast] = useState<Toast | null>(null);
  const [toastHeld, setToastHeld] = useState(false);
  const [added, dispatchAdded] = useReducer(addedReducer, []);
  const [undoBusy, setUndoBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<{ oldId: string; title: string; norm: string } | null>(null);
  /** The text the Must gate last stopped on (block-once). */
  const [blocked, setBlocked] = useState<string | null>(null);
  const [menu, setMenu] = useState<InsertMenu | null>(null);
  const [feedsOpen, setFeedsOpen] = useState(false);
  const [paste, setPaste] = useState<{ lines: string[]; truncated: boolean } | null>(null);
  const [coarse, setCoarse] = useState(false);
  const [pocket, setPocket] = useState(false);
  const [sentThisOpening, setSentThisOpening] = useState(0);
  const [live, setLive] = useState<{ key: number; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const compact = useMediaQuery("(max-width: 599px)");
  const inset = useKeyboardInset(open);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const restored = useRef(false);
  const seq = useRef(0);
  /** The line as it is right now, written by every edit (the save path reads it, never a stale render). */
  const lineRef = useRef<Line>({ text: "", reverted: [] });
  const openRef = useRef(false);
  const coarseRef = useRef(false);
  const onTodayRef = useRef(onToday);
  const onTrainRef = useRef(onTrain);
  const insetRef = useRef(0);
  /** The toast this sheet has in the dock, and the state key it shows. */
  const dockRef = useRef<{ id: number; key: number } | null>(null);
  /** Lines on their way to the server: never sent twice at once. */
  const inFlight = useRef<Set<string>>(new Set());
  const unsentRef = useRef<Unsent[]>([]);
  const addedRef = useRef<AddedEntry[]>([]);
  const toastRef = useRef<Toast | null>(null);
  const vocabRef = useRef<SheetVocab | null>(null);
  const vocabLoading = useRef(false);
  const openingRef = useRef<Opening>({ id: 0, openedAt: 0, sent: 0, titles: [], ids: [], merged: 0, failed: 0, saved: false, refreshed: false });
  /** Which opening sent each line. */
  const openingOf = useRef<Map<string, number>>(new Map());
  /** Lines saved past the Must gate's second press: their toast says 'not a Must'. */
  const notMustRef = useRef<Set<string>>(new Set());
  const lastSubmitAt = useRef(0);
  const composingRef = useRef(false);
  const lastComposingEnterAt = useRef(0);
  const submitAfterComposition = useRef(false);
  const pushedRef = useRef(false);
  const pendingCaret = useRef<number | null>(null);
  const autoSaved = useRef({ count: 0, at: 0 });
  const pocketTimer = useRef<number | null>(null);
  const idleTimer = useRef<number | null>(null);
  const showListRequest = useRef(false);
  const ideaModeRef = useRef(false);
  const menuRef = useRef<InsertMenu | null>(null);
  /** Captures an edit is on its way to replace (replacingOf), for handlers that run later. */
  const replacingRef = useRef<ReadonlyMap<string, string>>(new Map());
  /** The last capture confirmed while the sheet was open: the board flashes it once the sheet closes. */
  const heldCaptured = useRef<CapturedItem | null>(null);
  /** When the line last became empty (null while it has text): the refresh waits for a pause on a phone. */
  const emptySince = useRef<number | null>(null);
  // Handlers that callbacks, listeners, timers and the dock call later: always the latest (set after each render).
  const flushRef = useRef<(all: boolean) => void>(() => {});
  const considerRef = useRef<() => void>(() => {});

  const parsed = useMemo(() => (open && day ? parseCapture(text, { today: day, reverted }) : null), [open, day, text, reverted]);
  const ideaMode = parsed?.mode === "IDEA";
  /** A bare weigh-in number is read in the user's unit (from the vocabulary; 'kg' until it loads). The server reads it the same way. */
  const weightUnit: WeightUnit = vocab?.weightUnit ?? "kg";
  const weighIn = useMemo(() => (open && day ? weighInOf(text, reverted, day, weightUnit) : null), [open, day, text, reverted, weightUnit]);
  const weightOut = useMemo(
    () => (open && day && !weighIn ? weighInOutOfRange(text, reverted, day, weightUnit) : null),
    [open, day, text, reverted, weightUnit, weighIn]
  );
  // An edit queued, failed or in flight locks its capture's Edit and Undo (C1: never two rows).
  const replacing = useMemo(() => {
    const lines: { replaces?: string; state: ReplacingState }[] = unsent.map((u) => ({ replaces: u.replaces, state: u.state }));
    for (const oldId of sendingEdits.values()) lines.push({ replaces: oldId, state: "sending" });
    return replacingOf(lines);
  }, [unsent, sendingEdits]);

  useLayoutEffect(() => {
    onTodayRef.current = onToday;
    onTrainRef.current = onTrain;
    insetRef.current = inset;
    unsentRef.current = unsent;
    addedRef.current = added;
    toastRef.current = toast;
    vocabRef.current = vocab;
    ideaModeRef.current = ideaMode;
    menuRef.current = menu;
    replacingRef.current = replacing;
  });

  // ── The line ────────────────────────────────────────────────────────────

  const setLine = useCallback((next: string, spans: CaptureSpan[]) => {
    const wasEmpty = !lineRef.current.text.trim();
    lineRef.current = { text: next, reverted: spans };
    if (next.trim()) emptySince.current = null;
    else if (!wasEmpty || emptySince.current === null) emptySince.current = Date.now();
    setText(next);
    setReverted(spans);
  }, []);

  const announce = useCallback((message: string) => {
    if (!message) return;
    setLive((cur) => ({ key: (cur?.key ?? 0) + 1, text: message }));
  }, []);

  /**
   * Every edit goes through here, so a reverted chip follows its words as the
   * line changes around them. The line is kept in NFC (the parser's Vietnamese
   * patterns are written in it), but never mid-composition: rewriting the
   * value under an IME breaks the word being composed.
   */
  const onLineChange = (raw: string) => {
    const prev = lineRef.current;
    const next = composingRef.current ? raw : raw.normalize("NFC");
    setLine(next, shiftReverted(prev.text, next, prev.reverted));
    setError(null);
    setNote(null);
  };

  const autocorrect = useAutocorrect(onLineChange, true, "task");
  const {
    registerField,
    suggestions: wordHints,
    accept: acceptWord,
    bind: completeBind,
    visible: hintsVisible,
  } = useWordComplete(ideaMode ? (vocab?.words ?? NO_WORDS) : NO_WORDS);

  const setInput = useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el;
      registerField(el);
    },
    [registerField]
  );

  /** Focus back on the line; `caretAt` places the caret now, or once the new value is in the DOM. */
  const focusInput = useCallback((caretAt?: number) => {
    const el = inputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (caretAt === undefined) return;
    if (el.value === lineRef.current.text) el.setSelectionRange(caretAt, caretAt);
    else pendingCaret.current = caretAt;
  }, []);

  // The caret goes where an insert or a fill asked, once the value is in the DOM.
  useLayoutEffect(() => {
    const at = pendingCaret.current;
    const el = inputRef.current;
    if (at === null || !el) return;
    pendingCaret.current = null;
    const c = Math.min(at, el.value.length);
    el.setSelectionRange(c, c);
  }, [text, open]);

  // Kept in local storage until the server confirms, so nothing typed is
  // lost to a closed tab. Not before the stored draft has been read back,
  // or the first render's empty line would overwrite it.
  useEffect(() => {
    if (!restored.current) return;
    writeDraft({ text, reverted });
  }, [text, reverted]);

  // ── Toasts ──────────────────────────────────────────────────────────────

  /** A new toast starts its own clock, even if the pointer was resting on the old one. */
  const showToast = useCallback(
    (next: Toast, say?: string | false) => {
      setToastHeld(false);
      setToast(next);
      // The open sheet speaks through its live region (the dock has its own role=status).
      if (!openRef.current || say === false || next.kind === "working") return;
      announce(say ?? toastSentence(next, !onTodayRef.current));
    },
    [announce]
  );

  // ── Vocabulary: cached, refreshed in the background, never ahead of a save ──

  const loadVocab = useCallback((withWords: boolean) => {
    if (vocabLoading.current) return;
    vocabLoading.current = true;
    loadCaptureVocabulary(withWords ? { words: true } : undefined)
      .then((v) => {
        const cache: VocabCache = { day: v.day, goals: v.goals, recent: v.recent, rawBefore: v.rawBefore, active: v.active, ...(v.weightUnit ? { weightUnit: v.weightUnit } : {}), at: Date.now() };
        writeVocabCache(cache);
        setVocab((prev) => ({ ...cache, priced: true, words: withWords ? v.words : (prev?.words ?? null) }));
      })
      .catch(() => {
        /* the sheet still captures; the chips say 'priced on save' */
      })
      .finally(() => {
        vocabLoading.current = false;
      });
  }, []);

  /**
   * Starts the background refresh when the scheduler allows (capture-ui
   * vocabRefreshDecision) — never while a save is in flight, because Next
   * runs a client's actions one at a time and the save would queue behind
   * it, and on an open phone sheet only once the line has been empty for a
   * pause (or on close). An idea line also wants the player's words
   * (WordComplete), loaded only for idea lines.
   */
  const considerVocab = useCallback(() => {
    if (inFlight.current.size > 0) return;
    const o = openingRef.current;
    const now = Date.now();
    const v = vocabRef.current;
    if (openRef.current && ideaModeRef.current && !v?.words) {
      o.refreshed = true;
      loadVocab(true);
      return;
    }
    const since = emptySince.current;
    const decision = vocabRefreshDecision({
      now,
      openedAt: o.openedAt,
      savesInFlight: inFlight.current.size,
      savedThisOpening: o.saved,
      refreshedThisOpening: o.refreshed,
      stale: vocabStale(v, todayKey(), now),
      coarseOpen: openRef.current && coarseRef.current,
      lineEmpty: !lineRef.current.text.trim(),
      emptyForMs: since === null ? 0 : now - since,
    });
    if (decision === "start") {
      o.refreshed = true;
      loadVocab(false);
    } else if (decision === "wait" && openRef.current && coarseRef.current && since !== null) {
      // An empty line on a phone: ask again once the pause is long enough.
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(
        () => {
          idleTimer.current = null;
          considerRef.current();
        },
        Math.max(0, since + VOCAB_IDLE_MS - now) + 50
      );
    }
  }, [loadVocab]);

  // An idea line asks for the words as soon as it is one (and again once a refresh in the way has landed).
  useEffect(() => {
    if (open && ideaMode && !vocab?.words) considerVocab();
  }, [open, ideaMode, vocab, considerVocab]);

  // An open phone sheet whose line has just emptied (or opened empty): the refresh may go once it stays empty.
  const lineEmpty = !text.trim();
  useEffect(() => {
    if (!open || !coarse || !lineEmpty) return;
    const since = emptySince.current ?? Date.now();
    const t = window.setTimeout(() => considerRef.current(), Math.max(0, since + VOCAB_IDLE_MS - Date.now()) + 50);
    return () => window.clearTimeout(t);
  }, [open, coarse, lineEmpty]);

  // ── Saving ──────────────────────────────────────────────────────────────

  /** What a send's answer does: the list, the queue, the toast, the board. */
  const settle = (line: PendingLine, origin: Origin, res: CaptureResult<CapturedItem> | null) => {
    const now = Date.now();
    const automatic = origin === "auto";
    const o = openingRef.current;
    const ofOpening = openingOf.current.get(line.nonce);
    const mine = ofOpening === o.id;
    if (mine) o.saved = true;
    const notMust = notMustRef.current.delete(line.nonce);

    if (res && res.ok) {
      const item = res.value;
      dropPending(line.nonce);
      openingOf.current.delete(line.nonce);
      setUnsent((list) => settleUnsent(list, line, "saved", now, automatic));
      const update = !!line.replaces;
      const entry: AddedEntry = { key: line.nonce, item, line: { text: line.text, reverted: line.reverted }, at: line.at };
      if (update && item.replacedId && !item.oldKept) dispatchAdded({ type: "replace", oldId: item.replacedId, entry });
      else if (!(automatic && item.duplicate)) dispatchAdded({ type: "add", entry });
      if (!item.duplicate && !update) setCaptured((n) => n + 1);
      if (mine) {
        // An edit of a line this opening added changes that line: 'N added' counts rows, not sends.
        const at = update && item.replacedId ? o.ids.indexOf(item.replacedId) : -1;
        if (at >= 0) {
          o.titles[at] = item.title;
          o.ids[at] = item.id;
        } else {
          o.titles.push(item.title);
          o.ids.push(item.id);
        }
        o.last = { id: item.id, notMust, update };
      }
      if (automatic) {
        if (!item.duplicate) {
          const a = autoSaved.current;
          a.count = now - a.at > UNSENT_SUMMARY_MS ? 1 : a.count + 1;
          a.at = now;
          const copy = unsentSavedCopy(a.count);
          if (copy) showToast({ kind: "unsent-saved", key: ++seq.current, text: copy });
        }
      } else if (origin === "batch") {
        // The batch says 'N added' once, when every line has answered.
      } else if (!openRef.current && mine && o.sent - o.merged >= 2) {
        showToast({ kind: "summary", key: ++seq.current, titles: [...o.titles], failed: o.failed });
      } else {
        // The live region says 'Added <title> → <where>. N added.' for a line of this opening (a weigh-in says its own toast).
        const say = mine && !update && !item.duplicate && !item.weight ? addedAnnouncement(item.title, item.where.label, o.titles.length) : undefined;
        showToast({ kind: "added", key: ++seq.current, item, notMust, update }, say);
      }
      // A weigh-in is a record, not a reward and not a board row: no mark, no flash.
      if (!item.weight) {
        // Tier 0: a capture saved. In place, no flight (a capture pays nothing yet); the toast says it.
        void mark({ kind: "capture", id: `capture:${item.id}`, text: `Captured ${item.title}`, say: false });
        // The board flashes where it went. Behind the open sheet's scrim the flash would be spent
        // unseen (and the page scrolled under the modal), so it waits for the sheet to close.
        if (openRef.current) heldCaptured.current = item;
        else window.dispatchEvent(new CustomEvent<CapturedItem>(CAPTURED_EVENT, { detail: item }));
      }
    } else if (res === null) {
      // The network, not the server: queued, and it retries on its own.
      const current = unsentRef.current.find((u) => u.nonce === line.nonce);
      const attempts = (current?.state === "queued" ? current.attempts : 0) + (automatic ? 1 : 0);
      const giveUp = nextRetryDelay(attempts) === null;
      setUnsent((list) => settleUnsent(list, line, "network", now, automatic));
      if (giveUp) {
        if (mine) o.failed += 1;
        showToast({ kind: "error", key: ++seq.current, head: "Not saved yet", message: GAVE_UP });
      } else if (!automatic) {
        showToast({ kind: "queued", key: ++seq.current, offline: typeof navigator !== "undefined" && navigator.onLine === false });
      }
    } else {
      // The server said no: the line waits in the failed list with its reason.
      const tooLate = !!line.replaces && (res.code === "too-late" || res.code === "gone");
      if (mine) o.failed += 1;
      setUnsent((list) => settleUnsent(list, line, "refused", now, automatic, { error: res.error, code: tooLate ? res.code : undefined }));
      if (!automatic && origin !== "batch") {
        if (tooLate) showToast({ kind: "too-late", key: ++seq.current, nonce: line.nonce, message: res.code === "gone" ? EDIT_GONE : EDIT_TOO_LATE });
        else showToast({ kind: "error", key: ++seq.current, head: "Didn't save", message: res.error });
      }
    }
    considerVocab();
  };

  const sendLine = (line: PendingLine, origin: Origin) => {
    if (!mayRetryNow(line.nonce, inFlight.current)) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      // Offline: queued for the 'online' event. Never 'Didn't save' for the network.
      setUnsent((list) => settleUnsent(list, line, "network", Date.now(), false));
      if (origin !== "auto") showToast({ kind: "queued", key: ++seq.current, offline: true });
      return;
    }
    inFlight.current.add(line.nonce);
    const oldId = line.replaces;
    // An edit on its way locks the capture it replaces (Edit and Undo) until it settles.
    if (oldId) setSendingEdits((m) => new Map(m).set(line.nonce, oldId));
    if (origin === "user") showToast({ kind: "working", key: ++seq.current, message: line.replaces ? "Saving the change…" : "Saving…" });
    // Today refreshes for every line; Train only for a weigh-in (its weight card).
    const refreshPage = onTodayRef.current || (onTrainRef.current && mayBeWeighIn(line.text, line.reverted, todayKey()));
    startTransition(async () => {
      let res: CaptureResult<CapturedItem> | null;
      try {
        // The line's nonce is its capture key: a retry of a save whose answer
        // was lost finds the row it already wrote instead of writing a second.
        res = line.replaces
          ? await recaptureFromCapture(line.replaces, line.text, line.reverted, { refresh: refreshPage, captureKey: line.nonce })
          : await createFromCapture(line.text, line.reverted, { refresh: refreshPage, captureKey: line.nonce });
      } catch {
        res = null;
      }
      inFlight.current.delete(line.nonce);
      if (oldId) {
        setSendingEdits((m) => {
          if (!m.has(line.nonce)) return m;
          const next = new Map(m);
          next.delete(line.nonce);
          return next;
        });
      }
      settle(line, origin, res);
    });
  };

  /** A pasted list: one call, each line under its own nonce, answered line by line. */
  const sendBatch = (lines: PendingLine[]) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const now = Date.now();
      setUnsent((list) => lines.reduce((acc, l) => settleUnsent(acc, l, "network", now, false), list));
      showToast({ kind: "queued", key: ++seq.current, offline: true });
      return;
    }
    for (const l of lines) inFlight.current.add(l.nonce);
    showToast({ kind: "working", key: ++seq.current, message: `Saving ${lines.length} lines…` });
    startTransition(async () => {
      let res: CaptureManyResult | null;
      try {
        res = await createManyFromCapture(
          lines.map((l) => ({ text: l.text, reverted: l.reverted, captureKey: l.nonce })),
          { refresh: onTodayRef.current }
        );
      } catch {
        res = null;
      }
      for (const l of lines) inFlight.current.delete(l.nonce);
      if (!res) {
        for (const l of lines) settle(l, "batch", null);
        showToast({ kind: "queued", key: ++seq.current, offline: typeof navigator !== "undefined" && navigator.onLine === false });
        return;
      }
      const titles: string[] = [];
      const results = res.results;
      let failed = 0;
      lines.forEach((l, i) => {
        const r = results[i];
        if (r && r.ok) {
          titles.push(r.item.title);
          settle(l, "batch", { ok: true, value: r.item });
        } else {
          failed += 1;
          settle(l, "batch", { ok: false, error: r ? r.error : "No answer for this line. It's kept — retry it." });
        }
      });
      if (titles.length > 0) showToast({ kind: "summary", key: ++seq.current, titles, failed });
      else showToast({ kind: "error", key: ++seq.current, head: "Didn't save", message: `None of the ${lines.length} lines saved. They're kept in Capture.` });
    });
  };

  // ── Open and close ──────────────────────────────────────────────────────

  /**
   * The board's flash for the capture held while the sheet was open (not
   * for one undone meanwhile). After a phone's history.back(), which is
   * asynchronous and may restore the page's scroll, it waits for the
   * popstate so the board's own scroll to the row comes last.
   */
  const flashHeld = useCallback((item: CapturedItem, afterBack: boolean) => {
    if (addedRef.current.some((e) => e.item.id === item.id && e.removedAt !== undefined)) return;
    const fire = () => window.dispatchEvent(new CustomEvent<CapturedItem>(CAPTURED_EVENT, { detail: item }));
    if (!afterBack) {
      fire();
      return;
    }
    let fallback = 0;
    let fired = false;
    const go = () => {
      if (fired) return;
      fired = true;
      window.removeEventListener("popstate", go);
      window.clearTimeout(fallback);
      window.setTimeout(fire, 0);
    };
    window.addEventListener("popstate", go);
    fallback = window.setTimeout(go, 400);
  }, []);

  const closeSheet = useCallback(
    (reason: CloseReason) => {
      if (!openRef.current) return;
      openRef.current = false;
      setOpen(false);
      setMenu(null);
      setPaste(null);
      setBlocked(null);
      setFeedsOpen(false);
      setPocket(false);
      setShowAll(false);
      setNote(null);
      if (pocketTimer.current !== null) {
        window.clearTimeout(pocketTimer.current);
        pocketTimer.current = null;
      }
      const o = openingRef.current;
      const choice = dockToastChoice(o.sent - o.merged);
      if (choice === "summary" && o.titles.length > 0) {
        // Two or more lines in this opening: the dock says 'N added' (Show reopens the list).
        showToast({ kind: "summary", key: ++seq.current, titles: [...o.titles], failed: o.failed });
      } else if (choice === "single" && o.last && !toastRef.current) {
        // One line: today's toast with Undo, even when the sheet's own status line has already timed out.
        const last = o.last;
        const live = addedRef.current.find((e) => e.item.id === last.id && e.removedAt === undefined);
        if (live) showToast({ kind: "added", key: ++seq.current, item: live.item, notMust: last.notMust, update: last.update });
      }
      const decision = historyOnClose({ reason, hash: window.location.hash, coarse: coarseRef.current, pushed: pushedRef.current });
      if (decision === "back" || reason === "back" || reason === "navigate") pushedRef.current = false;
      if (decision === "back") window.history.back();
      const held = heldCaptured.current;
      heldCaptured.current = null;
      if (held) flashHeld(held, decision === "back");
      const back = returnFocus.current;
      returnFocus.current = null;
      if (back && document.contains(back) && reason !== "navigate") back.focus({ preventScroll: true });
      // The refresh a phone held back while lines were going in may go now —
      // on the next task, so a save that closed the sheet (submit and
      // addPasted close first, then send) is in flight before it decides,
      // and the save never waits behind the refresh.
      window.setTimeout(() => considerRef.current(), 0);
    },
    [showToast, flashHeld]
  );

  const openSheet = useCallback(
    (request?: CaptureRequest & { source?: "link" | "shortcut"; edit?: AddedEntry }) => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && !active.closest("[data-capture-sheet]")) returnFocus.current = active;
      const wasOpen = openRef.current;
      const today = todayKey();
      setDay(today);
      setOpen(true);
      openRef.current = true;
      setError(null);

      if (!wasOpen) {
        const c = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
        coarseRef.current = c;
        setCoarse(c);
        const o = openingRef.current;
        openingRef.current = { id: o.id + 1, openedAt: Date.now(), sent: 0, titles: [], ids: [], merged: 0, failed: 0, saved: false, refreshed: false };
        setSentThisOpening(0);
        // Whether the ≈ may be shown is decided again: a vocabulary priced an hour ago reads 'priced on save' until the refresh.
        setVocab((v) => vocabOnOpen(v, today, Date.now()));
        // A fresh opening starts with an empty status line: what an earlier
        // opening said has had its turn in the dock, and closing with nothing
        // added must not put it there again (dockToastChoice 0 → none).
        setToast(null);
        setToastHeld(false);
        lastSubmitAt.current = 0;
        // A phone's Back gesture closes the sheet: one hash-only entry, no Next navigation.
        if (historyOnOpen({ coarse: c, hash: window.location.hash, pushed: pushedRef.current }) === "push") {
          window.history.pushState(null, "", CAPTURE_OPEN_HASH);
          pushedRef.current = true;
        }
      }

      let next: Line = lineRef.current;
      if (!restored.current) {
        // First open on this page load: bring back an unsent draft, and the cached vocabulary.
        restored.current = true;
        const draft = readDraft();
        if (draft && !next.text) next = draft;
        if (!vocabRef.current) {
          const cache = readVocabCache();
          if (cache) {
            const v: SheetVocab = { ...cache, priced: vocabPriceable(cache, today, Date.now()), words: null };
            vocabRef.current = v;
            setVocab(v);
          }
        }
      }
      // A caller's text starts an empty line; it never replaces one in progress.
      const start = request?.text ?? (request?.mode === "idea" ? "idea: " : null);
      if (start && !next.text.trim()) next = { text: start.normalize("NFC").slice(0, MAX_CAPTURE_CHARS), reverted: [] };
      else if (start && request?.source === "link") setNote(FRAGMENT_BUSY_NOTE);
      if (next !== lineRef.current) {
        setLine(next.text, next.reverted);
        setRevertHistory([]);
      }
      pendingCaret.current = next.text.length;

      if (request?.edit) {
        const fill = editFill(next.text, request.edit, Date.now(), replacingRef.current);
        if (fill.ok) {
          setLine(fill.text, fill.reverted);
          setRevertHistory([]);
          setEditing({ oldId: request.edit.item.id, title: request.edit.item.title, norm: normTitleOf(request.edit.item.title) });
          pendingCaret.current = fill.caret;
        } else {
          setNote(editRefusalNote(fill.reason, replacingRef.current.get(request.edit.item.id)));
        }
      }
      // The phone's refresh waits for the line to stay empty: this opening's pause starts now.
      if (!wasOpen) emptySince.current = lineRef.current.text.trim() ? null : Date.now();

      // The home-screen shortcut on a phone whose keyboard did not rise: say where to tap.
      if (request?.source === "shortcut" && coarseRef.current && !wasOpen) {
        if (pocketTimer.current !== null) window.clearTimeout(pocketTimer.current);
        pocketTimer.current = window.setTimeout(() => {
          pocketTimer.current = null;
          if (openRef.current && insetRef.current === 0) setPocket(true);
        }, POCKET_WAIT_MS);
      }

      // Unsent lines get another go whenever the sheet opens.
      flushRef.current(true);
      // The vocabulary: after the first save of this opening, or VOCAB_REFRESH_DELAY_MS from now.
      if (!wasOpen) window.setTimeout(() => considerRef.current(), VOCAB_REFRESH_DELAY_MS);
    },
    [setLine]
  );

  // ── Retrying unsent lines ───────────────────────────────────────────────

  /**
   * Sends what is due (or every queued line, on a trigger). Silent; offline
   * does nothing until 'online'. A queued line from another life day is
   * never sent on its own: it moves to the failed list with its note.
   */
  const flush = (all: boolean) => {
    const today = todayKey();
    const otherDay = (u: Unsent) => u.state === "queued" && !inFlight.current.has(u.nonce) && pendingDayNote(u, today) !== null;
    if (unsentRef.current.some(otherDay)) {
      setUnsent((list) =>
        list.map((u): Unsent => {
          const note = otherDay(u) ? pendingDayNote(u, today) : null;
          return note ? { ...u, state: "failed", attempts: 0, nextAt: 0, error: note } : u;
        })
      );
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const list = unsentRef.current.filter((u) => !otherDay(u));
    const due = queueDue(
      list.filter((u) => u.state === "queued"),
      Date.now(),
      inFlight.current,
      all
    );
    for (const nonce of due) {
      const line = list.find((u) => u.nonce === nonce);
      if (line) sendLine(line, "auto");
    }
  };

  useLayoutEffect(() => {
    flushRef.current = flush;
    considerRef.current = considerVocab;
  });

  // 'online' and the tab becoming visible send every queued line again.
  useEffect(() => {
    const onOnline = () => flushRef.current(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") flushRef.current(true);
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // One timer, for the earliest queued line.
  useEffect(() => {
    const wake = queueWake(
      unsent.filter((u) => u.state === "queued"),
      inFlight.current
    );
    if (wake === null) return;
    const t = window.setTimeout(() => flushRef.current(false), Math.max(0, wake - Date.now()));
    return () => window.clearTimeout(t);
  }, [unsent]);

  // The + button's dot and its sr text: lines waiting to save (queued or failed).
  const unsentCount = unsent.length;
  useEffect(() => {
    const root = document.documentElement;
    if (unsentCount > 0) root.dataset.captureUnsent = String(unsentCount);
    else delete root.dataset.captureUnsent;
  }, [unsentCount]);

  // 'Added here' rows leave at ten minutes (and an undone row after a few seconds).
  useEffect(() => {
    const at = nextPruneAt(added);
    if (at === null) return;
    const t = window.setTimeout(() => dispatchAdded({ type: "prune", now: Date.now() }), Math.max(0, at - Date.now()) + 50);
    return () => window.clearTimeout(t);
  }, [added]);

  // ── Opening paths ───────────────────────────────────────────────────────

  // The hotkey: 'c' (never while typing, with a dialog open or mid-review)
  // or Alt+N (Mac Option+N, though not inside a field, where it types ˜; from
  // any field, over a dialog and mid-review; never inside the sheet).
  // capture-parse isCaptureHotkey holds the rule; src/lib/shortcuts.ts lists
  // both, and the global <Shortcuts/> handler leaves them to this one.
  useEffect(() => {
    if (open) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target instanceof Element ? e.target : null;
      const reviewing = document.querySelector("[data-review-session]") !== null;
      const modalOpen = document.querySelector(MODAL_OPEN_SELECTOR) !== null;
      if (!isCaptureHotkey(e, target, reviewing, modalOpen)) return;
      e.preventDefault();
      openSheet();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openSheet]);

  // Everything else asks by event: the tab bar's +, the rail and sidebar Capture, any page.
  useEffect(() => {
    function onRequest(e: Event) {
      openSheet((e as CustomEvent<CaptureRequest | undefined>).detail ?? undefined);
    }
    window.addEventListener(CAPTURE_EVENT, onRequest);
    return () => window.removeEventListener(CAPTURE_EVENT, onRequest);
  }, [openSheet]);

  // '?capture=task' or '?capture=idea' — the home-screen shortcut. Read from
  // window.location rather than useSearchParams, which would force the whole
  // shell into a Suspense boundary; checked again on every navigation.
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("capture");
    if (want !== "task" && want !== "idea") return;
    // Deferred, and the address is only rewritten when it fires, so a
    // cancelled first run (Strict Mode mounts effects twice) leaves the
    // parameter for the second.
    const t = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      params.delete("capture");
      const rest = params.toString();
      // Dropped from the address so a reload does not open the sheet again.
      // `null` state, as the Next docs show: the router patches replaceState
      // and keeps its own history entry and search params in step.
      window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
      openSheet({ mode: want, source: "shortcut" });
    }, 0);
    return () => window.clearTimeout(t);
  }, [pathname, openSheet]);

  // '#capture=<text>' on any route (a browser keyword or a launcher bookmark):
  // fills an empty line and opens the sheet — it never saves. The fragment
  // never reaches a server log, and is dropped from the address at once. A
  // leftover '#capture-open' (a reload with the sheet open) is dropped too.
  useEffect(() => {
    const check = () => {
      const hash = window.location.hash;
      const strip = () => window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      if (hash === CAPTURE_OPEN_HASH && !openRef.current) {
        strip();
        return;
      }
      const linked = readCaptureFragment(hash);
      if (linked === null) return;
      strip();
      openSheet({ text: linked, source: "link" });
    };
    const t = window.setTimeout(check, 0);
    window.addEventListener("hashchange", check);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("hashchange", check);
    };
  }, [pathname, openSheet]);

  // Focus the line on open, caret at the end (or where a fill asked).
  useEffect(() => {
    if (!open) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const at = pendingCaret.current ?? el.value.length;
    pendingCaret.current = null;
    el.setSelectionRange(at, at);
    if (showListRequest.current) {
      showListRequest.current = false;
      listRef.current?.scrollIntoView({ block: "start" });
    }
  }, [open]);

  // Escape closes from anywhere in the sheet, not only the input — and only
  // the sheet: it is the top layer of the app's Escape stack, so a receipt
  // or the inbox open underneath stays open.
  // A ▾ menu open in the row is the sheet's own top layer: Escape closes it first.
  useEffect(() => {
    if (!open) return;
    return pushEscapeLayer(() => {
      if (menuRef.current) {
        setMenu(null);
        announce(menuNote(null));
        return;
      }
      closeSheet("escape");
    });
  }, [open, closeSheet, announce]);

  // Back (the phone's gesture) closes the sheet and stays on the page.
  useEffect(() => {
    if (!open) return;
    const onPop = () => {
      if (!openRef.current) return;
      if (historyOnPop({ open: true, hash: window.location.hash }) === "close") closeSheet("back");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open, closeSheet]);

  // /add created the idea this line was carried over for: the line goes.
  useEffect(() => {
    const onCleared = (e: Event) => {
      const detail = (e as CustomEvent<SheetDraftCleared | undefined>).detail;
      if (!detail || typeof detail.text !== "string") return;
      if (lineRef.current.text !== detail.text) return;
      setLine("", []);
      setRevertHistory([]);
      setEditing(null);
    };
    window.addEventListener(SHEET_DRAFT_CLEARED_EVENT, onCleared);
    return () => window.removeEventListener(SHEET_DRAFT_CLEARED_EVENT, onCleared);
  }, [setLine]);

  // ── Submitting ──────────────────────────────────────────────────────────

  /** A previewed paste: every line stamped and stored before one call sends them all. */
  const addPasted = () => {
    if (!paste || paste.lines.length === 0) return;
    const now = Date.now();
    const lines = paste.lines.map((t) => stampLine({ text: t, reverted: [] }, ++seq.current, now, randomSalt()));
    addPending(...lines);
    const o = openingRef.current;
    o.sent += lines.length;
    for (const l of lines) openingOf.current.set(l.nonce, o.id);
    setSentThisOpening(o.sent);
    setPaste(null);
    closeSheet("save");
    sendBatch(lines);
  };

  /** Saves the line: closes, or stays for the next one. `inbox` sends it to the Inbox. */
  const submit = (source: EnterSource, stay: boolean, opts: { inbox?: boolean } = {}) => {
    const now = Date.now();
    if (!submitAllowed(lastSubmitAt.current, now)) return;
    if (paste) {
      lastSubmitAt.current = now;
      addPasted();
      return;
    }
    const line = lineRef.current;
    if (!line.text.trim() || !day) return;
    lastSubmitAt.current = now;
    const read = parseCapture(line.text, { today: day, reverted: line.reverted });
    const unit: WeightUnit = vocabRef.current?.weightUnit ?? "kg";
    const weighed = weighInOf(line.text, line.reverted, day, unit);
    // A weigh-in is not a task row, so it cannot replace one (the server refuses it too).
    if (weighed && editing) {
      setError(WEIGH_IN_NOT_AN_EDIT);
      return;
    }
    if (!weighed && !read.title) {
      setError(TITLE_MISSING);
      return;
    }
    // Block-once: a Must with no day, or a weigh-in-shaped line whose number is
    // out of range (it would be a task), stops the first press and says why.
    let notMust = false;
    if (!opts.inbox && !weighed) {
      const out = weighInOutOfRange(line.text, line.reverted, day, unit);
      const gate = mustGate(blocked, line.text, !!read.compulsoryWarning || out !== null);
      if (gate.action === "block") {
        setBlocked(gate.blocked);
        if (out) announce(weightRangeBlocked(out));
        focusInput();
        return;
      }
      notMust = gate.action === "save-not-must" && !!read.compulsoryWarning;
    }
    const lineText = opts.inbox && !read.inbox ? toInboxLine(line.text) : line.text;
    const pending = stampLine({ text: lineText, reverted: line.reverted }, ++seq.current, now, randomSalt(), editing?.oldId ?? null);
    addPending(pending);
    writeDraft(null);
    if (notMust) notMustRef.current.add(pending.nonce);
    const o = openingRef.current;
    o.sent += 1;
    if (editing && o.ids.includes(editing.oldId)) o.merged += 1;
    openingOf.current.set(pending.nonce, o.id);
    setSentThisOpening(o.sent);
    setLine("", []);
    setRevertHistory([]);
    setError(null);
    setNote(null);
    setBlocked(null);
    setMenu(null);
    setEditing(null);
    autocorrect.clearRecent();
    if (stay) focusInput();
    else closeSheet("save");
    sendLine(pending, "user");
  };

  /** The primary button reads Done (an empty line after a burst, on a phone): the action key closes too. Never over a paste preview (its key adds the lines). */
  const primaryIsDone = () => !paste && primaryAction({ editing: !!editing, coarse, empty: !lineRef.current.text.trim(), sentThisOpening, parsed }).done;

  /** The action key on a Done line: closes, unless it is the same press that just saved the last line. */
  const closeFromKey = () => {
    const now = Date.now();
    if (!submitAllowed(lastSubmitAt.current, now)) return;
    lastSubmitAt.current = now;
    closeSheet("done");
  };

  const onFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // A Telex commit on a desktop is not a submit.
    if (!coarse && Date.now() - lastComposingEnterAt.current < 150) return;
    const action = enterAction({ coarse, shift: false, composing: composingRef.current, source: "submit", done: primaryIsDone() });
    if (action === "wait-composition") {
      submitAfterComposition.current = true;
      return;
    }
    if (action === "ignore") return;
    if (action === "close") {
      closeFromKey();
      return;
    }
    submit("submit", action === "save-stay");
  };

  /** Escape with a ▾ menu open closes the menu, not the sheet. */
  const closeMenu = () => {
    setMenu(null);
    announce(menuNote(null));
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const composing = e.nativeEvent.isComposing || composingRef.current;
      const action = enterAction({ coarse, shift: e.shiftKey, composing, source: "key", done: primaryIsDone() });
      if (action === "ignore") {
        lastComposingEnterAt.current = Date.now();
        return;
      }
      if (action === "wait-composition") {
        submitAfterComposition.current = true;
        return;
      }
      e.preventDefault();
      if (action === "close") {
        closeFromKey();
        return;
      }
      submit("key", action === "save-stay");
      return;
    }
    if (e.key === "Escape" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (menu) closeMenu();
      else closeSheet("escape");
      return;
    }
    // Tab accepts a word completion when there is one, and otherwise moves focus as it always does.
    completeBind.onKeyDown(e);
  };

  const onPrimary = () => {
    const p = primaryAction({ editing: !!editing, coarse, empty: !lineRef.current.text.trim(), sentThisOpening, parsed });
    if (p.done) {
      closeSheet("done");
      return;
    }
    submit("button", false);
  };

  // ── Edit, Undo, Retry ───────────────────────────────────────────────────

  /**
   * A row's action settled while the sheet is open on a phone: the line
   * takes focus back, so the next line of a burst needs no tap on it (the
   * sheet's mousedown rule already keeps it there for a tap).
   */
  const refocusLine = () => {
    if (openRef.current && coarseRef.current) focusInput();
  };

  const startEdit = (entry: AddedEntry) => {
    const fill = editFill(lineRef.current.text, entry, Date.now(), replacingRef.current);
    if (!fill.ok) {
      const msg = editRefusalNote(fill.reason, replacingRef.current.get(entry.item.id));
      setNote(msg);
      announce(msg);
      return;
    }
    setLine(fill.text, fill.reverted);
    setRevertHistory([]);
    setEditing({ oldId: entry.item.id, title: entry.item.title, norm: normTitleOf(entry.item.title) });
    setBlocked(null);
    setMenu(null);
    setPaste(null);
    setError(null);
    setNote(null);
    focusInput(fill.caret);
  };

  const cancelEdit = () => {
    setEditing(null);
    setLine("", []);
    setRevertHistory([]);
    setBlocked(null);
    focusInput(0);
  };

  /** Edit from the dock: open the sheet on that capture's line. */
  const editFromDock = (item: CapturedItem) => {
    const entry = addedRef.current.find((e) => e.item.id === item.id && e.removedAt === undefined);
    if (!entry) {
      openSheet();
      setNote(editRefusalNote("expired"));
      return;
    }
    openSheet({ edit: entry });
  };

  /**
   * Undo of a weigh-in (actions/capture.ts undoWeightCapture): a fresh
   * reading is deleted, a replacing one gives back the reading it replaced —
   * only while the day still holds this capture's value ('gone' otherwise).
   */
  const undoWeight = (item: CapturedItem) => {
    const weight = item.weight;
    if (!weight) return;
    if (!weight.undoable) {
      if (openRef.current) {
        setNote(WEIGHT_UNDO_UNAVAILABLE);
        announce(WEIGHT_UNDO_UNAVAILABLE);
      } else showToast({ kind: "error", key: ++seq.current, head: "Not undone", message: WEIGHT_UNDO_UNAVAILABLE });
      return;
    }
    setUndoBusy((s) => new Set(s).add(item.id));
    showToast({ kind: "working", key: ++seq.current, message: "Undoing…" });
    startTransition(async () => {
      let res: { ok: true; restoredKg: number | null } | { ok: false; error: string; gone: boolean };
      try {
        const r = await undoWeightCapture(weight, { refresh: onTodayRef.current || onTrainRef.current });
        res = r.ok ? { ok: true, restoredKg: r.value.restoredKg } : { ok: false, error: r.error, gone: r.code === "gone" };
      } catch {
        res = { ok: false, error: "Couldn't reach the server to undo.", gone: false };
      }
      setUndoBusy((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
      if (res.ok) {
        setCaptured((n) => Math.max(0, n - 1));
        dispatchAdded({ type: "removed", id: item.id, now: Date.now() });
        const copy = weightUndoneCopy(weight, item.title, res.restoredKg);
        showToast({ kind: "removed", key: ++seq.current, title: copy.title, head: copy.head });
      } else if (res.gone) {
        // The day no longer holds this reading: its row goes, and nothing was written.
        dispatchAdded({ type: "drop", id: item.id });
        showToast({ kind: "error", key: ++seq.current, head: "Not undone", message: res.error });
      } else {
        showToast({ kind: "error", key: ++seq.current, head: "Didn't undo", message: res.error });
      }
      refocusLine();
    });
  };

  const undo = (item: CapturedItem) => {
    if (undoBusy.has(item.id)) return;
    if (item.weight) {
      undoWeight(item);
      return;
    }
    // An edit of this line is on its way: an Undo now would leave its new row standing.
    const lock = replacingRef.current.get(item.id);
    if (lock) {
      if (openRef.current) {
        setNote(lock);
        announce(lock);
      } else showToast({ kind: "error", key: ++seq.current, head: "Not undone yet", message: lock });
      return;
    }
    setUndoBusy((s) => new Set(s).add(item.id));
    showToast({ kind: "working", key: ++seq.current, message: "Undoing…" });
    startTransition(async () => {
      let res: { ok: true } | { ok: false; error: string; gone: boolean };
      try {
        const r = await undoCapture(item.id, { refresh: onTodayRef.current });
        // 'gone': an edit had already replaced this row, so it is no longer the one on the board.
        res = r.ok ? { ok: true } : { ok: false, error: r.error, gone: r.code === "gone" };
      } catch {
        res = { ok: false, error: "Couldn't reach the server to undo.", gone: false };
      }
      setUndoBusy((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
      // Taken back (or no longer on the board): the close must not flash it.
      if ((res.ok || res.gone) && heldCaptured.current?.id === item.id) heldCaptured.current = null;
      if (res.ok) {
        setCaptured((n) => Math.max(0, n - 1));
        dispatchAdded({ type: "removed", id: item.id, now: Date.now() });
        showToast({ kind: "removed", key: ++seq.current, title: item.title });
      } else if (res.gone) {
        dispatchAdded({ type: "drop", id: item.id });
        const copy = undoGoneCopy(item.title, res.error);
        showToast({ kind: "error", key: ++seq.current, head: copy.head, message: copy.message });
      } else {
        showToast({ kind: "error", key: ++seq.current, head: "Didn't undo", message: res.error });
      }
      refocusLine();
    });
  };

  /** A manual Retry sends the line as it stands, today: another day's line is re-stamped for today first. */
  const retry = (u: Unsent) => {
    if (!mayRetryNow(u.nonce, inFlight.current)) return;
    const today = todayKey();
    const line: PendingLine = pendingDayNote(u, today) ? { ...pendingOf(u), day: today } : pendingOf(u);
    if (line.day !== u.day) addPending(line);
    sendLine(line, "manual");
    refocusLine();
  };
  const dropUnsent = (u: Unsent) => {
    dropPending(u.nonce);
    setUnsent((list) => list.filter((x) => x.nonce !== u.nonce));
  };
  const dismiss = (u: Unsent) => {
    dropUnsent(u);
    refocusLine();
  };
  /**
   * Moves an unsent line back into an empty input, to fix before resending:
   * the chips redraw for today. An edit whose capture can still be edited
   * stays an edit of it; anything else goes as a new line.
   */
  const editUnsent = (u: Unsent) => {
    if (lineRef.current.text.trim()) {
      setNote(EDIT_BUSY_NOTE);
      return;
    }
    dropUnsent(u);
    const old = u.replaces ? addedRef.current.find((e) => e.item.id === u.replaces && canEditEntry(e, Date.now())) : undefined;
    setLine(u.text, u.reverted);
    setRevertHistory([]);
    setEditing(old ? { oldId: old.item.id, title: old.item.title, norm: normTitleOf(old.item.title) } : null);
    focusInput(u.text.length);
  };
  /** An edit that came too late: the same words, saved as a new line with a fresh nonce. */
  const saveAsNew = (nonce: string) => {
    const u = unsentRef.current.find((x) => x.nonce === nonce);
    if (!u) return;
    dropUnsent(u);
    const fresh = stampNow({ text: u.text, reverted: u.reverted }, ++seq.current);
    addPending(fresh);
    sendLine(fresh, "manual");
    refocusLine();
  };

  // Handlers the dock's toast calls later, always the latest.
  const undoRef = useRef(undo);
  const openRefFn = useRef(openSheet);
  const editDockRef = useRef(editFromDock);
  const saveAsNewRef = useRef(saveAsNew);
  useLayoutEffect(() => {
    undoRef.current = undo;
    openRefFn.current = openSheet;
    editDockRef.current = editFromDock;
    saveAsNewRef.current = saveAsNew;
  });

  // Inside the open sheet the status line clears itself unless the pointer
  // or focus is on it. (In the dock, the dock keeps the time.)
  useEffect(() => {
    if (!open || !toast || toast.kind === "working" || toast.kind === "too-late" || toastHeld) return;
    const key = toast.key;
    const t = window.setTimeout(
      () => setToast((cur) => (cur && cur.key === key ? null : cur)),
      toast.kind === "removed" ? TOAST_SHORT_MS : TOAST_MS
    );
    return () => window.clearTimeout(t);
  }, [open, toast, toastHeld]);

  // The sheet is closed: the toast lives in the app's one dock (above the
  // tab bar on phones, bottom-right from 600). Pushed under one key, so a
  // new toast replaces the last; when the dock lets it go, so do we. While
  // an edit of the capture it names is on its way, it offers neither Edit
  // nor Undo and says why (pushed again when that changes).
  const dockLock = toast?.kind === "added" ? (replacing.get(toast.item.id) ?? null) : null;
  useEffect(() => {
    if (open || !toast) {
      const d = dockRef.current;
      if (d) {
        dockRef.current = null;
        dismissToast(d.id);
      }
      return;
    }
    const input = dockToastOf(
      toast,
      { offToday: !onTodayRef.current, lock: dockLock },
      {
        onUndo: (item) => undoRef.current(item),
        onEdit: (item) => editDockRef.current(item),
        onOpen: () => openRefFn.current(),
        onShow: () => {
          showListRequest.current = true;
          setShowAll(true);
          openRefFn.current();
        },
        onSaveAsNew: (nonce) => saveAsNewRef.current(nonce),
        onLink: () => {
          const d = dockRef.current;
          if (d) dismissToast(d.id);
        },
      }
    );
    const id = pushToast({ ...input, key: DOCK_KEY });
    dockRef.current = { id, key: toast.key };
  }, [open, toast, dockLock]);

  useEffect(
    () =>
      subscribeToasts(() => {
        const d = dockRef.current;
        if (!d || getToasts().some((t) => t.id === d.id)) return;
        dockRef.current = null;
        setToast((cur) => (cur && cur.key === d.key ? null : cur));
      }),
    []
  );

  // The keyboard path to Undo: Ctrl/Cmd+Z while an 'added' toast is showing
  // and the sheet is closed, from anywhere but a text field or a review
  // card. A capture made with 'c' and Enter can be taken back the same way.
  const undoTarget = !open && toast?.kind === "added" && !toast.update && (!toast.item.weight || toast.item.weight.undoable) ? toast.item : null;
  useEffect(() => {
    if (!undoTarget) return;
    const item = undoTarget;
    function onKey(e: KeyboardEvent) {
      const target = e.target instanceof Element ? e.target : null;
      const reviewing = document.querySelector("[data-review-session]") !== null;
      if (!isUndoCaptureKey(e, target, reviewing)) return;
      e.preventDefault();
      undoRef.current(item);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoTarget]);

  // ── Chips and the insert row ────────────────────────────────────────────

  /** The weigh-in chip, tapped: the whole line stays text (a task), here and on the server (weight-capture revertedWholeLine). */
  const keepLineAsText = () => {
    const line = lineRef.current;
    const span = { start: 0, end: line.text.length };
    setLine(line.text, [...line.reverted, span]);
    setRevertHistory((h) => [...h, { span, text: line.text }].slice(-20));
    focusInput();
  };

  const revert = (token: CaptureToken) => {
    const span = { start: token.start, end: token.end };
    const line = lineRef.current;
    setLine(line.text, [...line.reverted, span]);
    setRevertHistory((h) => [...h, { span, text: line.text }].slice(-20));
    focusInput();
  };

  /**
   * A chip's words land in the line (capture-ui applyInsert) and the top row
   * comes back; the caret goes to the end, or to the title's place on a line
   * with no title yet.
   */
  const insertIntoLine = (insert: Insert) => {
    if (!day) return;
    setMenu(null);
    const line = lineRef.current;
    const read = parseCapture(line.text, { today: day, reverted: line.reverted });
    const res = applyInsert(line.text, line.reverted, insert, read, { today: day });
    if (!res) {
      setNote("The line is full.");
      return;
    }
    setLine(res.text, res.reverted);
    setError(null);
    setNote(null);
    focusInput(res.caret);
    announce(insertedNote(insert));
  };

  /** A ▾ chip opened its menu, or the back chip closed it: said in the live region. */
  const onMenu = (next: InsertMenu | null) => {
    setMenu(next);
    announce(menuNote(next));
  };

  const pickReplacement = (replacement: string) => {
    const line = lineRef.current;
    const res = replaceCaretWord(line.text, line.reverted, caret, replacement);
    if (!res) return;
    setLine(res.text, res.reverted);
    focusInput(res.caret);
    announce(`Added “${replacement}” to the line`);
  };

  /**
   * A tap anywhere in the sheet but a text field keeps the line's focus (and
   * so the phone keyboard, which the pinned sheet sits on): buttons and links
   * still click, touch scrolling and keyboard use are untouched.
   */
  const onSheetMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const input = inputRef.current;
    if (!input || document.activeElement !== input) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    // A press on a scroll region's own scrollbar (a desktop pointer) is left to scroll.
    if (target instanceof HTMLElement && target.scrollHeight > target.clientHeight && e.nativeEvent.offsetX >= target.clientWidth) return;
    e.preventDefault();
  };

  const pickRecent = (recent: string) => {
    setLine(recent, []);
    setRevertHistory([]);
    focusInput(recent.length);
  };

  const onSheetKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // A modal keeps Tab inside itself. A word completion that took the Tab
    // (the input's own handler, which runs first) has already claimed it.
    if (e.key === "Tab") {
      trapTab(e, sheetRef.current);
      return;
    }
    // Ctrl+Z brings the last tapped chip back — but only while the line is
    // as it was, so it never fights the input's own undo of typing.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z") {
      const last = revertHistory[revertHistory.length - 1];
      const line = lineRef.current;
      if (!last || last.text !== line.text) return;
      e.preventDefault();
      setLine(
        line.text,
        line.reverted.filter((s) => s.start !== last.span.start || s.end !== last.span.end)
      );
      setRevertHistory((h) => h.slice(0, -1));
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (editing) return;
    const raw = e.clipboardData?.getData("text/plain") ?? "";
    const split = splitPastedLines(raw);
    // 0 or 1 lines: an ordinary paste at the caret.
    if (split.lines.length < 2) return;
    e.preventDefault();
    setPaste(split);
    setMenu(null);
  };

  const onIdeaLink = () => {
    const t = lineRef.current.text;
    if (t.trim()) {
      // Carried to /add in sessionStorage (never the URL); the sheet keeps its
      // own line until /add has created the idea (SHEET_DRAFT_CLEARED_EVENT).
      const s = splitIdeaLine(t);
      writeIdeaHandoff({ question: s.question, answer: s.answer ?? "", sheetText: t });
    }
    closeSheet("navigate");
  };

  // ── Scroll region ───────────────────────────────────────────────────────

  const onScrollRegion = useStickToBottom(scrollRef, [reverted, paste, unsent.length, error, note, blocked, toast, open], text);

  // ── Render ──────────────────────────────────────────────────────────────

  const unsentText = unsentLabel(unsentCount);
  if (!isClient) return null;

  let sheet: React.ReactNode = null;
  if (open && parsed && day) {
    const pinned = coarse || compact;
    const empty = !text.trim();
    const canSave = !empty && (!!parsed.title || !!weighIn);
    const canInbox = canSave && !weighIn && !editing && !parsed.inbox && parsed.kind === "TASK" && !parsed.doneNow;
    const primary = primaryAction({ editing: !!editing, coarse, empty, sentThisOpening, parsed });
    const primaryLabel = weighIn && !primary.done && !editing ? WEIGHT_PRIMARY : primary.label;
    const priced = vocab && vocab.day === day && vocab.priced ? vocab.rawBefore : null;
    const duplicate = vocab && parsed.title && !ideaMode && !weighIn ? duplicateOf(parsed.title, vocab.active, editing?.norm ?? null) : null;
    const mustBlocked = blocked !== null && blocked === text;
    const offToday = !onToday;
    const hint = coarse ? TOUCH_HINT : KEY_HINT;

    // The slot above the line: word hints for an idea, suggestions after '^' or '#', Recent on an empty line, else the insert row.
    let slot: React.ReactNode = null;
    // A weigh-in has no grammar to add: no insert row, no suggestions.
    if (!paste && !weighIn) {
      if (ideaMode) {
        slot = (
          <div className="capture-hints">
            <WordHintBar suggestions={wordHints} onPick={acceptWord} visible={hintsVisible} />
          </div>
        );
      } else {
        const ctx = caretContext(text, caret);
        const goals = vocab?.goals ?? null;
        if (ctx === "goal") {
          const prefix = caretPrefix(caretWord(text, caret).word);
          const items: Suggestion[] =
            goals === null
              ? [{ id: "loading", label: "Loading goals…", name: "Loading goals", value: "", disabled: true }]
              : goalSuggestions(goals, prefix).map((g) => ({ id: g.id, label: g.title, name: `Link to the goal “${g.title}”`, value: goalInsertText(g.title) }));
          const none = goals && goals.length > 0 ? "No goal matches" : "No open goals";
          slot = (
            <SuggestRow
              label="Goals"
              items={items.length > 0 ? items : [{ id: "none", label: none, name: none, value: "", disabled: true }]}
              onPick={pickReplacement}
            />
          );
        } else if (ctx === "tag") {
          const prefix = caretPrefix(caretWord(text, caret).word);
          const items: Suggestion[] = tagSuggestions(prefix).map((t) => ({ id: t, label: `#${t}`, name: `Tag #${t}`, value: `#${t}` }));
          slot = items.length > 0 ? <SuggestRow label="Tags" items={items} onPick={pickReplacement} /> : null;
        } else if (ctx === "empty" && sentThisOpening === 0 && !editing && (vocab?.recent.length ?? 0) > 0) {
          const items: Suggestion[] = recentChips(vocab?.recent ?? []).map((r, i) => ({ id: `recent-${i}`, label: r, name: `Fill the line with “${r}”`, value: r }));
          slot = <SuggestRow label="Recent" items={items} onPick={pickRecent} />;
        }
        if (!slot) {
          slot = <InsertRow parsed={parsed} text={text} today={day} goals={goals} menu={menu} onMenu={onMenu} onInsert={insertIntoLine} />;
        }
      }
    }

    const editingPill = editing && (
      <p className="capture-editing">
        <span className="capture-editing-what">Editing “{editing.title}”</span>
        <span aria-hidden="true"> · </span>
        <button type="button" className="link capture-toast-act" onClick={cancelEdit}>
          Cancel
        </button>
      </p>
    );

    const form = (
      <form className="capture-form" noValidate onSubmit={onFormSubmit}>
        <input
          ref={setInput}
          type="text"
          value={text}
          maxLength={MAX_CAPTURE_CHARS}
          onChange={(e) => onLineChange(e.target.value)}
          onKeyDown={onInputKeyDown}
          onKeyUp={(e) => {
            autocorrect.onKeyUp(e);
            completeBind.onKeyUp();
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
          onInput={completeBind.onInput}
          onClick={completeBind.onClick}
          onFocus={completeBind.onFocus}
          onBlur={completeBind.onBlur}
          onPaste={onPaste}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            onLineChange(e.currentTarget.value);
            // The phone's action key arrived mid-composition: save once, now the word is in.
            if (submitAfterComposition.current) {
              submitAfterComposition.current = false;
              submit("submit", true);
            }
          }}
          placeholder={pocket && empty ? POCKET_PLACEHOLDER : "gym legs 60m every mon,thu !"}
          className="capture-input"
          aria-label={editing ? `Edit the line “${editing.title}”` : "Capture a line"}
          aria-describedby="capture-help"
          autoComplete="off"
          autoCapitalize="none"
          enterKeyHint={coarse ? "send" : "done"}
        />
      </form>
    );

    const chips = paste ? (
      <PastePreview
        lines={paste.lines}
        truncated={paste.truncated}
        today={day}
        weightUnit={weightUnit}
        onRemove={(i) =>
          setPaste((p) => {
            if (!p) return p;
            const lines = p.lines.filter((_, j) => j !== i);
            return lines.length > 0 ? { ...p, lines } : null;
          })
        }
      />
    ) : (
      <CaptureChips
        text={text}
        parsed={parsed}
        goals={vocab ? vocab.goals : null}
        rawBefore={priced}
        onRevert={revert}
        compact={compact}
        feedsOpen={feedsOpen}
        onToggleFeeds={() => setFeedsOpen((f) => !f)}
        duplicate={duplicate}
        mustBlocked={mustBlocked}
        mustFixes={mustFixInserts(day)}
        onFix={insertIntoLine}
        weighIn={weighIn ? weightChipLabel(weighIn, weightUnit, day) : null}
        onKeepAsText={keepLineAsText}
        weightRange={weightOut ? (mustBlocked ? weightRangeBlocked(weightOut) : weightRangeNote(weightOut)) : null}
      />
    );

    const notes = (
      <>
        {!paste && autocorrect.recent.length > 0 && (
          <p className="capture-note">Corrected {autocorrect.recent.map((c) => `${c.from} → ${c.to}`).join(", ")} · Ctrl+Z undoes it</p>
        )}
        {note && <p className="capture-note">{note}</p>}
        {error && (
          <p className="capture-error t-error" role="alert">
            {error}
          </p>
        )}
      </>
    );

    const acts = (
      <div className="capture-acts">
        {paste ? (
          <>
            <button type="button" className={`btn btn-primary capture-save${pinned ? "" : " lg"}`} onClick={() => submit("button", false)} disabled={paste.lines.length === 0}>
              Add {paste.lines.length}
            </button>
            <button
              type="button"
              className={`btn btn-secondary${pinned ? "" : " lg"}`}
              onClick={() => {
                setPaste(null);
                focusInput();
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" className={`btn btn-primary capture-save${pinned ? "" : " lg"}`} onClick={onPrimary} disabled={!primary.done && !canSave}>
              {primaryLabel}
            </button>
            {canInbox && (
              <button type="button" className={`btn btn-secondary${pinned ? "" : " lg"}`} onClick={() => submit("button", false, { inbox: true })}>
                To Inbox
              </button>
            )}
          </>
        )}
      </div>
    );

    const status = toast && (
      <div className="capture-status" onMouseEnter={() => setToastHeld(true)} onMouseLeave={() => setToastHeld(false)} onFocus={() => setToastHeld(true)} onBlur={() => setToastHeld(false)}>
        <StatusLine
          toast={toast}
          offToday={offToday}
          onClose={() => {
            setToast(null);
            refocusLine();
          }}
          onSaveAsNew={(nonce) => saveAsNew(nonce)}
          onLink={() => closeSheet("navigate")}
        />
      </div>
    );

    const list = (
      <JustAdded
        entries={added}
        wide={!compact}
        showAll={showAll}
        onShowAll={() => setShowAll(true)}
        onEdit={startEdit}
        onUndo={(e) => undo(e.item)}
        busy={undoBusy}
        locked={replacing}
        listRef={listRef}
      />
    );

    const unsentList = unsent.length > 0 && (
      <ul className="capture-failed" aria-label="Lines not saved yet">
        {unsent.map((u) => (
          <li key={u.nonce}>
            <span className="capture-failed-text">{u.text}</span>
            <span className="capture-failed-error">
              {/* A refused line from another life day says so before Retry re-stamps it for today. */}
              {u.state === "queued" ? "Waiting to save · it retries on its own" : ((day && pendingDayNote(u, day)) ?? u.error)}
            </span>
            <span className="capture-failed-actions">
              {u.code ? (
                <button type="button" className="btn btn-secondary capture-row-btn" onClick={() => saveAsNew(u.nonce)}>
                  Save as new
                </button>
              ) : (
                <button type="button" className="btn btn-secondary capture-row-btn" onClick={() => retry(u)}>
                  {u.state === "queued" ? "Retry now" : "Retry"}
                </button>
              )}
              {empty && (
                <button type="button" className="btn btn-quiet capture-row-btn" onClick={() => editUnsent(u)}>
                  Edit
                </button>
              )}
              <button type="button" className="btn btn-quiet capture-row-btn" onClick={() => dismiss(u)}>
                Dismiss
              </button>
            </span>
          </li>
        ))}
      </ul>
    );

    const ideaLink =
      pathname !== "/add" ? (
        <Link href="/add" className="link capture-idea-link" onClick={onIdeaLink}>
          Idea (full form)
        </Link>
      ) : null;

    sheet = (
      // One marker over everything the capture UI puts on screen, so the review
      // card can tell a tap on the sheet or its scrim from a tap meant for it.
      <div data-capture-ui="" className="capture-root">
        <div className="scrim show capture-backdrop" onMouseDown={() => closeSheet("scrim")} aria-hidden="true" />
        <div
          ref={sheetRef}
          className="capture-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="capture-title"
          aria-describedby="capture-sub"
          data-capture-sheet=""
          data-layout={pinned ? "pinned" : "panel"}
          data-kb={inset > 0 ? "1" : undefined}
          style={{ "--kb": `${inset}px` } as React.CSSProperties}
          onKeyDown={onSheetKeyDown}
          onMouseDown={onSheetMouseDown}
        >
          <div className="grabber" aria-hidden="true" />
          <div className="sheet-h">
            <div className="t">
              <h2 id="capture-title">Capture</h2>
              <p className="sub" id="capture-sub">
                One line. Everything else is guessed and shown as chips you can tap to undo.
              </p>
            </div>
            {captured > 0 && <span className="t-meta num capture-count">{captured} captured</span>}
            <IconButton icon="x" label="Close capture" aria-keyshortcuts="Escape" onClick={() => closeSheet("button")} />
          </div>

          {pinned ? (
            <>
              <div className="capture-scroll" ref={scrollRef} onScroll={onScrollRegion}>
                {!paste && list}
                {!paste && status}
                {!paste && unsentList}
                {chips}
                {notes}
              </div>
              <div className="capture-fixed">
                {editingPill}
                {slot}
                {form}
                {acts}
                <div className="capture-foot-row" id="capture-help">
                  <span className="capture-keys">{hint}</span>
                  {ideaLink}
                </div>
              </div>
            </>
          ) : (
            <>
              {editingPill}
              {slot}
              {form}
              {chips}
              {notes}
              {acts}
              {status}
              {list}
              {unsentList}
              <div className="capture-foot" id="capture-help">
                {empty && !paste && <p className="capture-legend">{LEGEND}</p>}
                <div className="capture-foot-row">
                  <span className="capture-keys">{hint}</span>
                  {ideaLink}
                </div>
              </div>
            </>
          )}

          <div className="sr-only" role="status" aria-live="polite">
            {live && <span key={live.key}>{live.text}</span>}
          </div>
        </div>
      </div>
    );
  }

  return createPortal(
    <>
      <span id="capture-unsent" className="sr-only">
        {unsentText}
      </span>
      {sheet}
    </>,
    document.body
  );
}
