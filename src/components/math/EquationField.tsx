"use client";

import { useRef, useState } from "react";
import { MathText } from "./MathText";
import { LatexPalette } from "./LatexPalette";
import { insertLatexSnippet } from "./latex-snippets";
import { isInsideMathSpan } from "@/lib/latex";

/**
 * The FORMULA prompt field: prose with `$...$` math spans, the lookup
 * palette, and a live preview of exactly what a reviewer will be shown.
 *
 * The palette wraps what it inserts in `$...$` *unless the caret is already
 * inside a span*. The earlier version always inserted bare LaTeX and left
 * wrapping as a separate manual step, which meant clicking `Σ` in a prose
 * field produced the literal text `\sum_{i=1}^{n}` sitting in the sentence —
 * indistinguishable from the preview being broken. Deciding from the caret
 * means a symbol click always yields rendered math and never tears an open
 * span in half.
 */

interface Props {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}

export function EquationField({ value, onChange, rows = 3 }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState(0);

  function commit(next: string, cursor: number) {
    onChange(next);
    setCaret(cursor);
    // The textarea's DOM value only catches up with `value` after this
    // render commits — setting selection now would land on the stale text.
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      el?.focus();
      el?.setSelectionRange(cursor, cursor);
    });
  }

  function insert(snippet: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    // Wrap only when landing in prose; inside an existing span the delimiters
    // would close it early and leave the rest as literal text.
    const wrap = !isInsideMathSpan(value, start);
    const { next, cursor } = insertLatexSnippet(value, start, end, snippet, wrap);
    commit(next, cursor);
  }

  /** Wraps the current selection in `$...$`, or inserts an empty pair with the caret between. */
  function wrapMath(display: boolean) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const delim = display ? "$$" : "$";
    const selected = value.slice(start, end);
    const wrapped = `${delim}${selected}${delim}`;
    const next = value.slice(0, start) + wrapped + value.slice(end);
    commit(next, selected ? start + wrapped.length : start + delim.length);
  }

  function syncCaret() {
    setCaret(textareaRef.current?.selectionStart ?? 0);
  }

  const inSpan = isInsideMathSpan(value, caret);

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <button type="button" style={CHIP_BUTTON} onClick={() => wrapMath(false)} title="Wrap the selection in $...$ (inline math)">
          $ inline
        </button>
        <button type="button" style={CHIP_BUTTON} onClick={() => wrapMath(true)} title="Wrap the selection in $$...$$ (block math)">
          $$ block
        </button>
        {/* States where the caret is what decides insertion behaviour should
            say so, rather than leaving it to be inferred from the result. */}
        <span style={{ fontSize: 10, color: inSpan ? "var(--green)" : "var(--ink-3)" }}>
          {inSpan ? "Caret is inside a math span — symbols insert directly." : "Caret is in prose — symbols insert wrapped in $…$."}
        </span>
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart);
        }}
        onKeyUp={syncCaret}
        onClick={syncCaret}
        onSelect={syncCaret}
        rows={rows}
        className="input font-mono"
        style={{ width: "100%" }}
        placeholder="e.g. Simplify $\frac{x^2-1}{x-1}$ for $x \neq 1$."
      />

      <div className="mt-2">
        <LatexPalette onInsert={insert} />
      </div>

      {/* Preview — the same component SessionCard and the Library render with. */}
      <div className="mt-2 p-3" style={{ borderRadius: 8, background: "var(--sub)", border: "1px solid var(--line)" }}>
        <p className="label-xs">Preview</p>
        <div className="mt-1" style={{ fontSize: 15, color: "var(--ink-0)", lineHeight: 1.6, minHeight: 22 }}>
          {value.trim() ? (
            <MathText text={value} />
          ) : (
            <span style={{ color: "var(--ink-3)", fontSize: 13 }}>Nothing to preview yet.</span>
          )}
        </div>
        {value.trim() && !value.includes("$") && (
          <p className="mt-1" style={{ fontSize: 10, color: "var(--ink-3)" }}>
            No $…$ span yet — this shows exactly as typed, with no math rendering.
          </p>
        )}
      </div>
    </div>
  );
}

const CHIP_BUTTON: React.CSSProperties = {
  padding: "3px 10px",
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  border: "1px solid var(--line)",
  background: "var(--sub)",
  color: "var(--ink-1)",
};
