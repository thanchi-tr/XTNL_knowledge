"use client";

import { useMemo, useRef, type KeyboardEvent, type RefObject } from "react";
import "@/components/library/study.css";
import { handleAutoClose, handleAutoDelete, tokenizeLatex } from "@/lib/latex-editor";

/**
 * A textarea that highlights LaTeX and closes brackets as you type.
 *
 * Highlighting uses the standard overlay trick: a `<pre>` mirror painted
 * behind a textarea whose own text is transparent. Both must share every
 * metric that affects where a glyph lands — font, size, line height,
 * padding, border width, wrapping mode — so those live in one shared style
 * object rather than being written twice and drifting. A real contenteditable
 * would avoid the duplication but costs the native caret, undo stack, spell
 * check and mobile keyboard behaviour, none of which are worth trading for
 * colour.
 *
 * Auto-closing is what makes `\frac{}{}`-shaped syntax tolerable to type by
 * hand. The rules and their caret arithmetic live in `lib/latex-editor.ts`
 * and are tested there; this component only translates key events into them
 * and puts the caret back afterwards.
 */

/*
 * Token styles and every metric the textarea and its mirror share (font,
 * size, line height, padding, border width, wrapping, the scrollbar gutter)
 * live in study.css (.ltx-pane, .ltx-t-*), so the two panes cannot drift and
 * both go to 16 px on phones together. Highlighting is ink only: `$` (which
 * decides whether anything renders at all) is tinted, commands underlined.
 */

interface Props {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  /** Blocks Enter — the answer expression is one line by definition. */
  singleLine?: boolean;
  onCaret?: (pos: number) => void;
  editorRef?: RefObject<HTMLTextAreaElement | null>;
  ariaLabel?: string;
}

export function LatexEditor({
  value,
  onChange,
  rows = 3,
  placeholder,
  singleLine = false,
  onCaret,
  editorRef,
  ariaLabel,
}: Props) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const ref = editorRef ?? localRef;
  const mirrorRef = useRef<HTMLPreElement | null>(null);

  const tokens = useMemo(() => tokenizeLatex(value), [value]);

  function applyEdit(next: { value: string; start: number; end: number }) {
    onChange(next.value);
    onCaret?.(next.start);
    // The DOM value only catches up after this render commits, so the
    // selection has to be restored on the next frame or it lands on stale text.
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.setSelectionRange(next.start, next.end);
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    if (singleLine && e.key === "Enter") {
      e.preventDefault();
      return;
    }
    // Never interfere with shortcuts — Ctrl/Cmd+A, undo, copy and friends.
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const state = { value, start: el.selectionStart, end: el.selectionEnd };

    if (e.key === "Backspace") {
      const del = handleAutoDelete(state);
      if (del) {
        e.preventDefault();
        applyEdit(del);
      }
      return;
    }

    if (e.key.length !== 1) return;
    const edit = handleAutoClose(state, e.key);
    if (edit) {
      e.preventDefault();
      applyEdit(edit);
    }
  }

  function syncScroll() {
    const el = ref.current;
    const mirror = mirrorRef.current;
    if (!el || !mirror) return;
    mirror.scrollTop = el.scrollTop;
    mirror.scrollLeft = el.scrollLeft;
  }

  function reportCaret() {
    onCaret?.(ref.current?.selectionStart ?? 0);
  }

  return (
    <div className="ltx">
      <pre ref={mirrorRef} aria-hidden="true" className="ltx-pane ltx-mirror">
        {/* The textarea's own text is transparent, which would take its
            `::placeholder` down with it — so the placeholder is drawn here. */}
        {value.length === 0 && placeholder ? (
          <span className="ink-2">{placeholder}</span>
        ) : (
          tokens.map((t, i) => (
            <span key={i} className={`ltx-t-${t.kind}`}>
              {t.text}
            </span>
          ))
        )}
        {/* A trailing newline collapses in a <pre>, leaving the mirror one
            line shorter than the textarea and desyncing every wrap below it. */}
        {value.endsWith("\n") ? " " : ""}
      </pre>

      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onCaret?.(e.target.selectionStart);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={reportCaret}
        onClick={reportCaret}
        onSelect={reportCaret}
        onScroll={syncScroll}
        rows={rows}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        aria-label={ariaLabel}
        aria-placeholder={placeholder}
        className="ltx-pane ltx-input"
        style={{ resize: singleLine ? "none" : "vertical" }}
      />
    </div>
  );
}
