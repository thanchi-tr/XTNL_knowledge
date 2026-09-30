"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  createFromCapture,
  loadCaptureVocabulary,
  type CaptureResult,
  type CapturedItem,
  type CaptureVocabulary,
} from "@/app/actions/capture";
import { undoCapture } from "@/app/actions/tasks";
import {
  MAX_CAPTURE_CHARS,
  formatXp,
  isCaptureHotkey,
  parseCapture,
  sanitizeCaptureInput,
  shiftReverted,
  type CaptureSpan,
} from "@/lib/capture-parse";
import { todayKey } from "@/lib/life-day";
import type { CaptureToken } from "@/lib/life-types";
import { useWordComplete, WordHintBar } from "@/components/WordComplete";
import { useAutocorrect } from "@/components/useAutocorrect";
import { CaptureChips } from "./CaptureChips";
import { CAPTURE_EVENT, CAPTURED_EVENT, CaptureFab, type CaptureRequest } from "./CaptureFab";
import { isUndoCaptureKey, nextOccurrenceNote } from "./capture-ui";
import { pushEscapeLayer, trapTab } from "./layers";

/**
 * The one-line capture sheet, mounted once in the shell.
 *
 * The whole point is friction: on a desktop a task is one key, the line,
 * and Enter; on the phone it is the home-screen shortcut or the corner
 * button, the line, and the keyboard's own Enter. Nothing is required but
 * the words. The line is read as it is typed and shown back as chips, and
 * any chip that guessed wrong is one tap from being plain text again.
 *
 * Saving closes the sheet before the server answers — a round trip here
 * costs up to a second, and the answer is almost always yes. The line is
 * never at risk while it is in flight: it is written to local storage
 * first and only forgotten when the server confirms, so a dead network or a
 * closed tab costs a retry, never the words.
 *
 * Mounted in the layout's bottomSlot as a prop and never inside Suspense
 * (layout.tsx), for the same hydration reason as the loadout bar. And, like
 * the bar, it owns its own state: router.refresh() does not reliably
 * re-render shell components, so nothing here waits on one.
 */

const DRAFT_KEY = "xtnl:capture:draft";
const PENDING_KEY = "xtnl:capture:pending";
/** A save with no answer after this long is treated as unconfirmed on the next page load. */
const PENDING_STALE_MS = 15_000;
/** The word list and the knee base are re-read at most this often. */
const VOCAB_TTL_MS = 5 * 60_000;
/** Long enough to read and reach Undo; the undo itself stays available for ten minutes. */
const TOAST_MS = 10_000;
const TOAST_SHORT_MS = 4_000;
/** WordHintBar floats above the keyboard past this inset; the sheet makes room for it. */
const FLOATING_KEYBOARD_PX = 120;
const LEGEND = "! must · ~30m · daily · every mon,thu · 3x/week · by fri · tmr · x done · idea: · goal: · #body · ^goal · (min: …) · ? inbox";
const NO_WORDS: string[] = [];

interface Line {
  text: string;
  reverted: CaptureSpan[];
}
interface PendingLine extends Line {
  nonce: string;
  at: number;
}
interface FailedLine extends PendingLine {
  error: string;
}

type Toast =
  | { kind: "working"; key: number; message: string }
  /** `next`: when a repeating capture first falls due, if not today ('Next: Thu'). */
  | { kind: "added"; key: number; item: CapturedItem; next: string | null }
  | { kind: "removed"; key: number; title: string }
  | { kind: "error"; key: number; message: string };

// Storage is a convenience that can be missing (private windows, blocked
// site data), so every touch of it is guarded and a failure is silent.
function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown): void {
  try {
    if (value === null || (Array.isArray(value) && value.length === 0)) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* the in-memory state still holds the line */
  }
}
function readPending(): PendingLine[] {
  const list = readJson<unknown>(PENDING_KEY);
  if (!Array.isArray(list)) return [];
  return list.flatMap((p) => {
    if (!p || typeof p !== "object") return [];
    const { text, reverted, nonce, at } = p as Record<string, unknown>;
    if (typeof nonce !== "string" || typeof at !== "number") return [];
    const clean = sanitizeCaptureInput(text, reverted);
    return clean.text ? [{ ...clean, nonce, at }] : [];
  });
}
function addPending(line: PendingLine): void {
  writeJson(PENDING_KEY, [...readPending().filter((p) => p.nonce !== line.nonce), line].slice(-20));
}
function dropPending(nonce: string): void {
  writeJson(PENDING_KEY, readPending().filter((p) => p.nonce !== nonce));
}
/**
 * A line on its way to the server, stamped so a reload can tell a slow save
 * from a lost one. The nonce is also the capture key the server dedupes a
 * retry on, so it must never repeat — across tabs and devices too.
 */
function stamp(line: Line, n: number): PendingLine {
  const now = Date.now();
  return { ...line, nonce: `${now.toString(36)}-${n.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, at: now };
}

/**
 * How much of the layout viewport the on-screen keyboard covers.
 *
 * The keyboard resizes only the visual viewport on iOS and on current
 * Android Chrome, so a sheet at `bottom: 0` would sit underneath it. The
 * sheet is lifted by this much instead — the same measurement WordHintBar
 * uses for its strip.
 */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);
  return active ? inset : 0;
}

export function QuickCapture() {
  const pathname = usePathname();
  const onToday = pathname === "/today";

  const [open, setOpen] = useState(false);
  const [day, setDay] = useState("");
  const [text, setText] = useState("");
  const [reverted, setReverted] = useState<CaptureSpan[]>([]);
  /** Chips tapped away, newest last, with the line as it was — Ctrl+Z brings one back while the line is unchanged. */
  const [revertHistory, setRevertHistory] = useState<{ span: CaptureSpan; text: string }[]>([]);
  const [vocab, setVocab] = useState<CaptureVocabulary | null>(null);
  const [captured, setCaptured] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<FailedLine[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [toastHeld, setToastHeld] = useState(false);
  const [, startTransition] = useTransition();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const restored = useRef(false);
  const vocabAt = useRef(0);
  const seq = useRef(0);
  const lineRef = useRef<Line>({ text: "", reverted: [] });

  const inset = useKeyboardInset(open);

  useEffect(() => {
    lineRef.current = { text, reverted };
  }, [text, reverted]);

  const parsed = useMemo(() => (open && day ? parseCapture(text, { today: day, reverted }) : null), [open, day, text, reverted]);

  // ── The line ────────────────────────────────────────────────────────────

  /** Every edit goes through here, so a reverted chip follows its words as the line changes around them. */
  const onLineChange = (next: string) => {
    setReverted(shiftReverted(text, next, reverted));
    setText(next);
    setError(null);
  };

  const autocorrect = useAutocorrect(onLineChange);
  const {
    registerField,
    suggestions: wordHints,
    accept: acceptWord,
    bind: completeBind,
    visible: hintsVisible,
  } = useWordComplete(vocab?.words ?? NO_WORDS);

  const setInput = useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el;
      registerField(el);
    },
    [registerField]
  );

  // Kept in local storage until the server confirms, so nothing typed is
  // lost to a closed tab. Not before the stored draft has been read back,
  // or the first render's empty line would overwrite it.
  useEffect(() => {
    if (!restored.current) return;
    writeJson(DRAFT_KEY, text.trim() ? { text, reverted } : null);
  }, [text, reverted]);

  // ── Open and close ──────────────────────────────────────────────────────

  const openSheet = useCallback((request?: CaptureRequest) => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && !active.closest("[data-capture-sheet]")) returnFocus.current = active;
    setDay(todayKey());
    setOpen(true);
    setError(null);

    let next = lineRef.current;
    if (!restored.current) {
      // First open on this page load: bring back an unsent draft, and any
      // line whose save never came back before the page closed.
      restored.current = true;
      const draft = readJson<Line>(DRAFT_KEY);
      const clean = draft ? sanitizeCaptureInput(draft.text, draft.reverted) : null;
      if (clean?.text && !next.text) next = clean;
      const now = Date.now();
      const stale = readPending().filter((p) => now - p.at > PENDING_STALE_MS);
      if (stale.length > 0) {
        setFailed((f) => [
          ...f,
          ...stale
            .filter((p) => !f.some((x) => x.nonce === p.nonce))
            .map((p) => ({ ...p, error: "Not confirmed before the page closed. Check Today, then retry or dismiss." })),
        ]);
      }
    }
    // A caller's text starts an empty line; it never replaces one in progress.
    const start = request?.text ?? (request?.mode === "idea" ? "idea: " : null);
    if (start && !next.text.trim()) next = { text: start.slice(0, MAX_CAPTURE_CHARS), reverted: [] };
    if (next !== lineRef.current) {
      setText(next.text);
      setReverted(next.reverted);
      setRevertHistory([]);
    }

    if (Date.now() - vocabAt.current > VOCAB_TTL_MS) {
      vocabAt.current = Date.now();
      loadCaptureVocabulary()
        .then(setVocab)
        .catch(() => {
          vocabAt.current = 0;
        });
    }
  }, []);

  const closeSheet = useCallback(() => {
    setOpen(false);
    const back = returnFocus.current;
    returnFocus.current = null;
    if (back && document.contains(back)) back.focus({ preventScroll: true });
  }, []);

  // The hotkey: 'c' or Ctrl/Cmd+K, never while typing, never mid-review, never Tab.
  useEffect(() => {
    if (open) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target instanceof Element ? e.target : null;
      const reviewing = document.querySelector("[data-review-session]") !== null;
      if (!isCaptureHotkey(e, target, reviewing)) return;
      e.preventDefault();
      openSheet();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openSheet]);

  // Everything else asks by event: the header button, the corner button, any page.
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
      openSheet({ mode: want });
    }, 0);
    return () => window.clearTimeout(t);
  }, [pathname, openSheet]);

  // Focus the line on open, caret at the end.
  useEffect(() => {
    if (!open) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [open]);

  // Escape closes from anywhere in the sheet, not only the input — and only
  // the sheet: it is the top layer of the app's Escape stack, so a receipt
  // or the inbox open underneath stays open.
  useEffect(() => {
    if (!open) return;
    return pushEscapeLayer(closeSheet);
  }, [open, closeSheet]);

  // ── Saving ──────────────────────────────────────────────────────────────

  /** A new toast starts its own clock, even if the pointer was resting on the old one. */
  const showToast = (next: Toast) => {
    setToastHeld(false);
    setToast(next);
  };

  const send = (line: PendingLine, refreshBoard: boolean) => {
    showToast({ kind: "working", key: ++seq.current, message: "Saving…" });
    startTransition(async () => {
      let res: CaptureResult<CapturedItem>;
      try {
        // The line's nonce is its capture key: a retry of a save whose answer
        // was lost finds the row it already wrote instead of writing a second.
        res = await createFromCapture(line.text, line.reverted, { refresh: refreshBoard, captureKey: line.nonce });
      } catch {
        res = { ok: false, error: "Couldn't reach the server. Your line is kept — try again." };
      }
      if (res.ok) {
        const item = res.value;
        dropPending(line.nonce);
        setFailed((f) => f.filter((x) => x.nonce !== line.nonce));
        setCaptured((n) => n + 1);
        // A habit captured on a day it does not run is on no lane of today's
        // board; the toast says when it will be, so the line never looks lost.
        const today = todayKey();
        let next: string | null = null;
        try {
          next = nextOccurrenceNote(parseCapture(line.text, { today, reverted: line.reverted }), today);
        } catch {
          next = null;
        }
        showToast({ kind: "added", key: ++seq.current, item, next });
        window.dispatchEvent(new CustomEvent<CapturedItem>(CAPTURED_EVENT, { detail: item }));
      } else {
        const message = res.error;
        setFailed((f) => [...f.filter((x) => x.nonce !== line.nonce), { ...line, error: message }]);
        showToast({ kind: "error", key: ++seq.current, message });
      }
    });
  };

  /** Enter saves and closes; Shift+Enter saves and stays for the next line. */
  const save = (stay: boolean) => {
    if (!parsed || !text.trim()) return;
    if (!parsed.title) {
      setError("Add a few words for the title — only dates and tags are left.");
      return;
    }
    const line = stamp({ text, reverted }, ++seq.current);
    addPending(line);
    writeJson(DRAFT_KEY, null);
    setText("");
    setReverted([]);
    setRevertHistory([]);
    setError(null);
    autocorrect.clearRecent();
    if (stay) inputRef.current?.focus();
    else closeSheet();
    send(line, onToday);
  };

  const retry = (line: FailedLine) => {
    setFailed((f) => f.filter((x) => x.nonce !== line.nonce));
    send(line, onToday);
  };
  const dismiss = (line: FailedLine) => {
    dropPending(line.nonce);
    setFailed((f) => f.filter((x) => x.nonce !== line.nonce));
  };
  /** Moves a failed line back into an empty input, to fix before resending. */
  const edit = (line: FailedLine) => {
    if (text.trim()) return;
    dismiss(line);
    setText(line.text);
    setReverted(line.reverted);
    setRevertHistory([]);
    inputRef.current?.focus();
  };

  const undo = (item: CapturedItem) => {
    showToast({ kind: "working", key: ++seq.current, message: "Undoing…" });
    startTransition(async () => {
      let res: { ok: true } | { ok: false; error: string };
      try {
        res = await undoCapture(item.id, { refresh: onToday });
      } catch {
        res = { ok: false, error: "Couldn't reach the server to undo." };
      }
      if (res.ok) {
        setCaptured((n) => Math.max(0, n - 1));
        showToast({ kind: "removed", key: ++seq.current, title: item.title });
      } else {
        showToast({ kind: "error", key: ++seq.current, message: res.error });
      }
    });
  };

  // The toast clears itself unless the pointer or focus is on it.
  useEffect(() => {
    if (!toast || toast.kind === "working" || toastHeld) return;
    const key = toast.key;
    const t = window.setTimeout(
      () => setToast((cur) => (cur && cur.key === key ? null : cur)),
      toast.kind === "removed" ? TOAST_SHORT_MS : TOAST_MS
    );
    return () => window.clearTimeout(t);
  }, [toast, toastHeld]);

  // The keyboard path to Undo: Ctrl/Cmd+Z while an 'added' toast is showing
  // and the sheet is closed, from anywhere but a text field or a review
  // card. A capture made with 'c' and Enter can be taken back the same way.
  const undoRef = useRef(undo);
  useEffect(() => {
    undoRef.current = undo;
  });
  const undoTarget = !open && toast?.kind === "added" ? toast.item : null;
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

  // ── Chips ───────────────────────────────────────────────────────────────

  const revert = (token: CaptureToken) => {
    const span = { start: token.start, end: token.end };
    setReverted((r) => [...r, span]);
    setRevertHistory((h) => [...h, { span, text }].slice(-20));
    inputRef.current?.focus();
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
      if (!last || last.text !== text) return;
      e.preventDefault();
      setReverted((r) => r.filter((s) => s.start !== last.span.start || s.end !== last.span.end));
      setRevertHistory((h) => h.slice(0, -1));
    }
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      save(e.shiftKey);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeSheet();
      return;
    }
    // Tab accepts a word completion when there is one, and otherwise moves focus as it always does.
    completeBind.onKeyDown(e);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  const toastBody = toast && (
    <ToastBody toast={toast} onUndo={undo} onClose={() => setToast(null)} onOpen={() => openSheet()} inSheet={open} />
  );
  const hintsFloating = hintsVisible && inset > FLOATING_KEYBOARD_PX;
  const canSave = !!parsed && !!text.trim() && !!parsed.title;

  return (
    // `display: contents` — no box of its own, but everything the capture UI
    // puts on screen sits under one marker, so the review card can tell a tap
    // on the corner button or the backdrop from a tap meant for it.
    <div data-capture-ui="" className="contents">
      <CaptureFab hidden={open} />

      {!open && toast && (
        <div
          className="capture-toast"
          role="status"
          aria-live="polite"
          onMouseEnter={() => setToastHeld(true)}
          onMouseLeave={() => setToastHeld(false)}
          onFocus={() => setToastHeld(true)}
          onBlur={() => setToastHeld(false)}
        >
          {toastBody}
        </div>
      )}

      {open && parsed && (
        <>
          <div className="capture-backdrop" onMouseDown={closeSheet} aria-hidden />
          <div
            ref={sheetRef}
            className="capture-sheet card"
            role="dialog"
            aria-modal="true"
            aria-label="Quick capture"
            data-capture-sheet=""
            data-hints={hintsFloating ? "1" : undefined}
            data-kb={inset > 0 ? "1" : undefined}
            style={{ "--kb": `${inset}px` } as React.CSSProperties}
            onKeyDown={onSheetKeyDown}
          >
            <div className="capture-head">
              <p className="section-eyebrow">Capture</p>
              {captured > 0 && (
                <span className="mono capture-count" aria-live="polite">
                  {captured} captured
                </span>
              )}
              <button type="button" className="btn-ghost capture-close" onClick={closeSheet} aria-label="Close capture" aria-keyshortcuts="Escape">
                Close
                <kbd className="capture-kbd" aria-hidden>
                  Esc
                </kbd>
              </button>
            </div>

            <WordHintBar suggestions={wordHints} onPick={acceptWord} visible={hintsVisible} />
            <div className="capture-line">
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
                onInput={completeBind.onInput}
                onClick={completeBind.onClick}
                onFocus={completeBind.onFocus}
                onBlur={completeBind.onBlur}
                placeholder="gym legs 60m every mon,thu !"
                className="input capture-input"
                aria-label="Capture a line"
                aria-describedby="capture-help"
                autoComplete="off"
                enterKeyHint="done"
              />
              <button type="button" className="btn-primary capture-save" onClick={() => save(false)} disabled={!canSave}>
                Save
              </button>
            </div>

            <CaptureChips
              text={text}
              parsed={parsed}
              goals={vocab ? vocab.goals : null}
              rawBefore={vocab && vocab.day === day ? vocab.rawBefore : 0}
              onRevert={revert}
            />

            {autocorrect.recent.length > 0 && (
              <p className="capture-note">
                Corrected {autocorrect.recent.map((c) => `${c.from} → ${c.to}`).join(", ")} · Ctrl+Z undoes it
              </p>
            )}
            {error && (
              <p className="capture-error" role="alert">
                {error}
              </p>
            )}

            {failed.length > 0 && (
              <ul className="capture-failed" aria-label="Lines that did not save">
                {failed.map((f) => (
                  <li key={f.nonce}>
                    <span className="capture-failed-text">{f.text}</span>
                    <span className="capture-failed-error">{f.error}</span>
                    <span className="capture-failed-actions">
                      <button type="button" className="btn-ghost" onClick={() => retry(f)}>
                        Retry
                      </button>
                      {!text.trim() && (
                        <button type="button" className="btn-ghost" onClick={() => edit(f)}>
                          Edit
                        </button>
                      )}
                      <button type="button" className="btn-ghost" onClick={() => dismiss(f)}>
                        Dismiss
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {toast && (
              <div className="capture-status" role="status" aria-live="polite">
                {toastBody}
              </div>
            )}

            <div className="capture-foot" id="capture-help">
              {!text.trim() && <p className="capture-legend">{LEGEND}</p>}
              <div className="capture-foot-row">
                <span className="capture-keys">Enter saves · Shift+Enter saves and stays · Esc closes</span>
                <Link href="/add" className="capture-idea-link" onClick={closeSheet}>
                  Idea (full form)
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 'Added · Gym legs · Mon · Thu · compulsory · ≈21 XP · Undo'. The figure
 * is the server's projection, not the sheet's estimate, so it is exactly
 * what the first tick at the estimate pays.
 */
function ToastBody({
  toast,
  onUndo,
  onClose,
  onOpen,
  inSheet,
}: {
  toast: Toast;
  onUndo: (item: CapturedItem) => void;
  onClose: () => void;
  onOpen: () => void;
  inSheet: boolean;
}) {
  if (toast.kind === "working") {
    return <span className="capture-toast-muted">{toast.message}</span>;
  }
  if (toast.kind === "removed") {
    return (
      <span>
        <span className="capture-toast-muted">Removed</span> · {toast.title}
      </span>
    );
  }
  if (toast.kind === "error") {
    return (
      <span className="capture-toast-line">
        <span style={{ color: "var(--red)", fontWeight: 600 }}>Didn&apos;t save</span>
        <span className="capture-toast-muted">{toast.message}</span>
        {!inSheet && (
          <button type="button" className="capture-toast-action" onClick={onOpen}>
            Open
          </button>
        )}
        <button type="button" className="capture-toast-action capture-toast-x" onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      </span>
    );
  }
  const { item, next } = toast;
  const idea = item.kind === "IDEA_DRAFT";
  const head = idea ? "Idea in Inbox" : item.doneNow ? "Done" : item.kind === "GOAL" ? "Goal added" : "Added";
  return (
    <span className="capture-toast-line">
      <span style={{ color: "var(--green)", fontWeight: 600 }}>{head}</span>
      <span className="capture-toast-title">{item.title}</span>
      {item.describe && <span className="capture-toast-muted">{item.describe}</span>}
      {next && <span style={{ color: "var(--blue)" }}>{next}</span>}
      {item.projectedXp > 0 && <span className="mono capture-toast-muted">≈{formatXp(item.projectedXp)} XP</span>}
      {idea && item.href && (
        <Link href={item.href} className="capture-toast-action" onClick={onClose}>
          Open form
        </Link>
      )}
      <button
        type="button"
        className="capture-toast-action"
        onClick={() => onUndo(item)}
        aria-keyshortcuts={inSheet ? undefined : "Control+Z Meta+Z"}
      >
        Undo
        {!inSheet && (
          <kbd className="capture-kbd" aria-hidden>
            Ctrl+Z
          </kbd>
        )}
      </button>
      {!inSheet && <span className="capture-kbd-sr">Press Control+Z to undo.</span>}
    </span>
  );
}
