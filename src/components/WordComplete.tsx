"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { recordWordChoices } from "@/app/actions/words";
import {
  CHOICE_BATCH_MAX,
  MIN_PREFIX,
  caretWordOf,
  decodeWordModel,
  keyOf,
  learningOf,
  passesOf,
  suggest,
  wordAt,
  type Suggestion,
  type WordEvent,
  type WordLearning,
  type WordModel,
  type WordModelWire,
} from "@/lib/word-model";
import "./WordComplete.css";

/**
 * Word completion for the capture forms.
 *
 * ── What this does, and what it deliberately does not ────
 * Tab completes the word being typed to the best match from the player's own
 * writing, ranked by a personal language model (lib/word-model.ts: how often
 * and how recently they write each word, the word before it, and which
 * suggestions they pick or type past), and a strip of clickable candidates
 * sits above the field — above the *virtual keyboard* on a phone, which is
 * the only place a hint bar is any use when the keyboard covers two thirds
 * of the screen.
 *
 * It learns as it is used: a pick, and a first suggestion typed past, are
 * queued here, folded into this page's ranking at once, and sent to the
 * server in small batches (actions/words.ts) — never ahead of a save.
 *
 * It does not render inline ghost text inside the field. A `<textarea>`
 * cannot paint a suffix its value does not contain, so ghosting means
 * maintaining a mirror element in perfect sync with the textarea's metrics —
 * this codebase already does that once, for LaTeX highlighting, and it took
 * a `scrollbar-gutter` fix to stop the two drifting five pixels apart. The
 * hint strip shows the same information (typed prefix dimmed, completion
 * bright) at none of that cost, and unlike a ghost it shows the *alternatives*
 * too, which is what makes Tab predictable rather than a guess.
 */

export type { Suggestion };

// ── The choices on their way to the server (one queue per page) ──────────

/** Queued choices that start a send once typing pauses. */
const FLUSH_AT = 10;
/** The pause, after the FLUSH_AT-th choice. */
const IDLE_FLUSH_MS = 1_500;
/** After a blur: long enough that the click which blurred the field (Save, Check) sends its own action first. */
const BLUR_FLUSH_MS = 1_000;
/** A form that is saving says not yet (its gate): asked again this often, this many times. */
const GATE_RETRY_MS = 2_000;
const GATE_RETRIES = 30;
/** This page's choices kept for its own ranking (the server's model has them after its next build). */
const SESSION_MAX = 500;

const queue: WordEvent[] = [];
const session: (WordEvent & { at: number })[] = [];
const gates = new Set<() => boolean>();
const flushState: { timer: number | null; sending: boolean; retries: number } = { timer: null, sending: false, retries: 0 };

function queueWordEvent(event: WordEvent): void {
  queue.push(event);
  if (queue.length > CHOICE_BATCH_MAX) queue.splice(0, queue.length - CHOICE_BATCH_MAX);
  session.push({ ...event, at: Date.now() });
  if (session.length > SESSION_MAX) session.splice(0, session.length - SESSION_MAX);
  if (queue.length >= FLUSH_AT) scheduleFlush(IDLE_FLUSH_MS);
}

/** A send `ms` from now. A new reason to send (`retry` false) gives the gates their full count of asks again. */
function scheduleFlush(ms: number, retry = false): void {
  if (typeof window === "undefined") return;
  if (!retry) flushState.retries = 0;
  if (flushState.timer !== null) window.clearTimeout(flushState.timer);
  flushState.timer = window.setTimeout(() => {
    flushState.timer = null;
    void flushNow();
  }, ms);
}

function cancelFlush(): void {
  if (flushState.timer === null) return;
  window.clearTimeout(flushState.timer);
  flushState.timer = null;
}

/**
 * One batch (at most CHOICE_BATCH_MAX) to the server, when every form's gate
 * allows it. Next runs a client's actions one at a time, so a send while a
 * save is in flight would queue behind it, and a send just before one would
 * hold it: a saving form says no, and the send is asked again later.
 */
async function flushNow(): Promise<void> {
  if (flushState.sending || queue.length === 0) return;
  for (const gate of gates) {
    if (gate()) continue;
    if (flushState.retries < GATE_RETRIES) {
      flushState.retries += 1;
      scheduleFlush(GATE_RETRY_MS, true);
    }
    return;
  }
  flushState.retries = 0;
  const batch = queue.splice(0, CHOICE_BATCH_MAX);
  flushState.sending = true;
  let sent = false;
  try {
    await recordWordChoices(batch);
    sent = true;
  } catch {
    // The network: back to the front of the queue, for the next reason to send (never a retry loop offline).
    queue.unshift(...batch);
    if (queue.length > CHOICE_BATCH_MAX) queue.splice(0, queue.length - CHOICE_BATCH_MAX);
  } finally {
    flushState.sending = false;
  }
  // Choices that came in while this batch was on its way.
  if (sent && queue.length >= FLUSH_AT) scheduleFlush(IDLE_FLUSH_MS);
}

/** Sends the queued choices after the current event — so a save that event started is already on its way, and goes first. */
export function flushWordChoices(): void {
  scheduleFlush(0);
}

function addFlushGate(gate: () => boolean): void {
  gates.add(gate);
}

function removeFlushGate(gate: () => boolean): void {
  gates.delete(gate);
}

/** The choices this page made after the model was built, folded for the ranking. */
function learningSince(builtAt: number): WordLearning {
  return learningOf(session.filter((e) => e.at > builtAt));
}

// ── The hook ──────────────────────────────────────────────────────────────

/** The word being typed in a field, while it is: the suggestions that were first for its prefixes (key → prefix). */
interface Track {
  el: HTMLTextAreaElement | HTMLInputElement;
  start: number;
  context: string;
  firsts: Map<string, string>;
}

const NOWHERE = { prefix: "", context: "" };

export interface WordCompleteOptions {
  /** Off: no suggestions, and Tab is never taken (default on). */
  enabled?: boolean;
  /** Whether the queued choices may be sent now (the capture sheet: no save in flight, and not mid-line). */
  mayFlush?: () => boolean;
}

export function useWordComplete(model: WordModelWire | null, opts: WordCompleteOptions = {}) {
  const enabled = opts.enabled ?? true;
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const track = useRef<Track | null>(null);
  const mayFlushRef = useRef(opts.mayFlush);
  const [at, setAt] = useState(NOWHERE);
  const [focused, setFocused] = useState(false);

  // Decoded once per model, not per keystroke: the ranking binary-searches its sorted words.
  const decoded = useMemo<WordModel | null>(() => decodeWordModel(model), [model]);
  const baseLearning = useMemo(() => learningSince(decoded?.builtAt ?? 0), [decoded]);
  const [learnt, setLearnt] = useState<{ model: WordModel | null; learning: WordLearning } | null>(null);
  const learning = learnt && learnt.model === decoded ? learnt.learning : baseLearning;

  const suggestions = useMemo<Suggestion[]>(
    () => (enabled && decoded ? suggest(decoded, at.prefix, at.context, learning) : []),
    [enabled, decoded, at, learning]
  );

  useEffect(() => {
    mayFlushRef.current = opts.mayFlush;
  });

  useEffect(() => {
    const gate = () => mayFlushRef.current?.() ?? true;
    addFlushGate(gate);
    return () => removeFlushGate(gate);
  }, []);

  // The first suggestion shown for each prefix of the word being typed: typed past, it is a pass.
  useEffect(() => {
    const t = track.current;
    const first = suggestions[0];
    if (!t || !first || !focused || at.prefix.length < MIN_PREFIX) return;
    const key = keyOf(first.word);
    if (!t.firsts.has(key)) t.firsts.set(key, keyOf(at.prefix));
  }, [suggestions, focused, at]);

  const relearn = useCallback(() => setLearnt({ model: decoded, learning: learningSince(decoded?.builtAt ?? 0) }), [decoded]);

  /** A word is finished (a boundary typed, the caret gone elsewhere, a blur, a submit): the firsts it went past are passes. */
  const finish = useCallback(
    (t: Track) => {
      const events = passesOf(t.firsts, wordAt(t.el.value, t.start), t.context);
      if (events.length === 0) return;
      for (const e of events) queueWordEvent(e);
      relearn();
    },
    [relearn]
  );

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const w = caretWordOf(el.value, el.selectionStart ?? el.value.length);
    const t = track.current;
    if (t && (t.el !== el || t.start !== w.start || !w.prefix)) {
      track.current = null;
      finish(t);
    }
    if (w.prefix.length >= MIN_PREFIX && !track.current) track.current = { el, start: w.start, context: w.context, firsts: new Map() };
    setAt((prev) => (prev.prefix === w.prefix && prev.context === w.context ? prev : { prefix: w.prefix, context: w.context }));
  }, [finish]);

  /** Replaces the word under the caret and puts the caret after it, plus a space. A pick (and the firsts it went past). */
  const accept = useCallback(
    (word: string) => {
      const el = ref.current;
      if (!el) return;
      const caret = el.selectionStart ?? el.value.length;
      const w = caretWordOf(el.value, caret);
      const start = w.prefix ? w.start : caret;
      const key = keyOf(word);
      const t = track.current;
      track.current = null;
      queueWordEvent({ word: key, context: w.context, kind: "pick" });
      if (t) for (const e of passesOf(t.firsts, key, t.context)) queueWordEvent(e);
      relearn();

      const next = `${el.value.slice(0, start)}${word} ${el.value.slice(caret)}`;
      // React tracks the last value it set on the DOM node and skips its own
      // change event when it looks unchanged. Writing through the native
      // setter is what makes a controlled textarea notice a programmatic
      // edit — without it the field updates visually and the form state
      // does not, and the idea submits with the un-completed word.
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      setter?.call(el, next);
      el.dispatchEvent(new Event("input", { bubbles: true }));

      // The input event above ran sync at a caret the setter moved: the word just completed is done, not being typed.
      track.current = null;
      const caretAfter = start + word.length + 1;
      el.setSelectionRange(caretAfter, caretAfter);
      el.focus();
      setAt(NOWHERE);
    },
    [relearn]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      if (e.key !== "Tab" || e.shiftKey || suggestions.length === 0) return;
      // Only swallow Tab when there is something to accept. With no
      // candidates it stays a focus-moving key, which is the one behaviour
      // that must never be taken away from a keyboard user.
      e.preventDefault();
      accept(suggestions[0].word);
    },
    [suggestions, accept]
  );

  /** On submit: the word at the caret is finished, and the queue goes once the submit's own action is on its way. */
  const flush = useCallback(() => {
    const t = track.current;
    track.current = null;
    if (t) finish(t);
    flushWordChoices();
  }, [finish]);

  /**
   * A callback ref, not the ref object itself.
   *
   * Returning the `RefObject` made every read of this hook's result a
   * ref access during render as far as `react-hooks/refs` is concerned —
   * including `suggestions` and `visible`, which are plain values. A
   * callback ref keeps the mutable handle inside the hook where it belongs
   * and leaves the returned object made of things that are safe to read.
   */
  const registerField = useCallback((el: HTMLTextAreaElement | HTMLInputElement | null) => {
    ref.current = el;
  }, []);

  return {
    registerField,
    suggestions,
    accept,
    flush,
    /** Spread onto the field. */
    bind: {
      onKeyDown,
      onInput: sync,
      onClick: sync,
      onKeyUp: sync,
      onFocus: () => {
        setFocused(true);
        // Back in a field: the blur's send waits for the next pause instead.
        cancelFlush();
        sync();
      },
      // Delayed: a click on a hint chip blurs the field first, and hiding
      // the bar on blur would unmount the chip before its click lands.
      onBlur: () => {
        const t = track.current;
        track.current = null;
        if (t) finish(t);
        scheduleFlush(BLUR_FLUSH_MS);
        window.setTimeout(() => setFocused(false), 150);
      },
    },
    visible: focused && suggestions.length > 0,
  };
}

interface BarProps {
  suggestions: Suggestion[];
  onPick: (word: string) => void;
  visible: boolean;
  /**
   * 'row': standing in for the capture sheet's 40 px insert row (a task
   * line), at exactly its height, so the line never moves as the strip and
   * the row trade places word by word.
   */
  fit?: "row";
}

/**
 * The hint strip.
 *
 * On a phone it is `position: fixed` and pushed up by however much the
 * virtual keyboard is covering, read from `visualViewport`. That API is the
 * only way to know: the keyboard does not resize the layout viewport on iOS
 * at all, so a bar positioned with `bottom: 0` sits *underneath* it, which is
 * exactly where a keyboard hint bar is useless.
 */
export function WordHintBar({ suggestions, onPick, visible, fit }: BarProps) {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      // How much of the layout viewport the keyboard is covering.
      setKeyboardInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="wc-bar"
      data-floating={keyboardInset > 120 ? "1" : undefined}
      data-fit={fit}
      style={keyboardInset > 120 ? { bottom: keyboardInset } : undefined}
      role="listbox"
      aria-label="Word suggestions"
    >
      <ul className="wc-list">
        {suggestions.map((s, i) => (
          <li key={s.word}>
            <button
              type="button"
              className="wc-hint"
              data-primary={i === 0 ? "1" : undefined}
              data-fuzzy={s.fuzzy ? "1" : undefined}
              // `onMouseDown` rather than `onClick`: mousedown fires before
              // the field's blur, so the caret position the completion needs
              // is still valid when this runs.
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(s.word);
              }}
            >
              <span className="wc-typed">{s.word.slice(0, s.prefixLength)}</span>
              <span className="wc-rest">{s.word.slice(s.prefixLength)}</span>
              {i === 0 && <kbd className="wc-key">tab</kbd>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
