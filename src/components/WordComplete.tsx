"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Word completion for the capture form.
 *
 * ── What this does, and what it deliberately does not ────
 * Tab completes the word being typed to the best match from the player's own
 * corpus, and a strip of clickable candidates sits above the field — above
 * the *virtual keyboard* on a phone, which is the only place a hint bar is
 * any use when the keyboard covers two thirds of the screen.
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

export interface Suggestion {
  word: string;
  /** The part the player has already typed, for dimming. */
  prefixLength: number;
}

const MAX_SUGGESTIONS = 6;
/** Below this, the candidate list is everything and helps nobody. */
const MIN_PREFIX = 2;

/** The word being typed: from the last word boundary back to the caret. */
function currentPrefix(value: string, caret: number): string {
  const before = value.slice(0, caret);
  const match = before.match(/[\p{L}\p{N}'-]+$/u);
  return match ? match[0] : "";
}

export function useWordComplete(vocabulary: string[]) {
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const [prefix, setPrefix] = useState("");
  const [focused, setFocused] = useState(false);

  // Lowercased once, not per keystroke: this list is up to ~1200 entries and
  // the scan below runs on every character typed.
  const folded = useMemo(() => vocabulary.map((w) => ({ word: w, lower: w.toLowerCase() })), [vocabulary]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (prefix.length < MIN_PREFIX) return [];
    const lower = prefix.toLowerCase();
    const out: Suggestion[] = [];
    for (const entry of folded) {
      if (out.length >= MAX_SUGGESTIONS) break;
      // Never suggest the word already complete in the field — accepting it
      // would be a no-op keystroke, and it crowds out a real candidate.
      if (entry.lower === lower) continue;
      if (entry.lower.startsWith(lower)) out.push({ word: entry.word, prefixLength: prefix.length });
    }
    return out;
  }, [prefix, folded]);

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setPrefix(currentPrefix(el.value, el.selectionStart ?? el.value.length));
  }, []);

  /** Replaces the word under the caret and puts the caret after it, plus a space. */
  const accept = useCallback(
    (word: string) => {
      const el = ref.current;
      if (!el) return;
      const caret = el.selectionStart ?? el.value.length;
      const typed = currentPrefix(el.value, caret);
      const start = caret - typed.length;
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

      const caretAfter = start + word.length + 1;
      el.setSelectionRange(caretAfter, caretAfter);
      el.focus();
      setPrefix("");
    },
    []
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
    /** Spread onto the field. */
    bind: {
      onKeyDown,
      onInput: sync,
      onClick: sync,
      onKeyUp: sync,
      onFocus: () => {
        setFocused(true);
        sync();
      },
      // Delayed: a click on a hint chip blurs the field first, and hiding
      // the bar on blur would unmount the chip before its click lands.
      onBlur: () => window.setTimeout(() => setFocused(false), 150),
    },
    visible: focused && suggestions.length > 0,
  };
}

interface BarProps {
  suggestions: Suggestion[];
  onPick: (word: string) => void;
  visible: boolean;
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
export function WordHintBar({ suggestions, onPick, visible }: BarProps) {
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
      className="word-hints"
      data-floating={keyboardInset > 120 ? "1" : undefined}
      style={keyboardInset > 120 ? { bottom: keyboardInset } : undefined}
      role="listbox"
      aria-label="Word suggestions"
    >
      <ul className="word-hints-list">
        {suggestions.map((s, i) => (
          <li key={s.word}>
            <button
              type="button"
              className="word-hint"
              data-primary={i === 0 ? "1" : undefined}
              // `onMouseDown` rather than `onClick`: mousedown fires before
              // the field's blur, so the caret position the completion needs
              // is still valid when this runs.
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(s.word);
              }}
            >
              <span className="word-hint-typed">{s.word.slice(0, s.prefixLength)}</span>
              <span className="word-hint-rest">{s.word.slice(s.prefixLength)}</span>
              {i === 0 && <kbd className="word-hint-key">tab</kbd>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
