"use client";

import { useRef, useState } from "react";
import { MathText } from "./MathText";
import { LatexPalette } from "./LatexPalette";
import { LatexEditor } from "./LatexEditor";
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

  const inSpan = isInsideMathSpan(value, caret);

  return (
    <div>
      <div className="m-tools">
        <button type="button" className="chip btn-chip" onClick={() => wrapMath(false)} title="Wrap the selection in $...$ (inline math)">
          $ inline
        </button>
        <button type="button" className="chip btn-chip" onClick={() => wrapMath(true)} title="Wrap the selection in $$...$$ (block math)">
          $$ block
        </button>
        {/* Where the caret is decides how a symbol inserts: say so, rather
            than leaving it to be inferred from the result. */}
        <span className={inSpan ? "t-meta ink-0" : "t-meta"} aria-live="polite">
          {inSpan ? "Caret is inside a math span: symbols insert directly." : "Caret is in prose: symbols insert wrapped in $…$."}
        </span>
      </div>

      <LatexEditor
        editorRef={textareaRef}
        value={value}
        onChange={onChange}
        onCaret={setCaret}
        rows={rows}
        ariaLabel="Formula prompt"
        placeholder="e.g. Simplify $\frac{x^2-1}{x-1}$ for $x \neq 1$."
      />

      <div style={{ marginTop: 8 }}>
        <LatexPalette onInsert={insert} />
      </div>

      {/* Preview: the same component the runner and the Library render with. */}
      <div className="m-preview">
        <span className="t-eyebrow">Preview</span>
        <div className="m-out">{value.trim() ? <MathText text={value} /> : <span className="t-meta">Nothing to preview yet.</span>}</div>
        {value.trim() && !value.includes("$") && (
          <p className="t-meta" style={{ marginTop: 4 }}>
            No $…$ span yet: this shows exactly as typed, with no math rendering.
          </p>
        )}
      </div>
    </div>
  );
}
