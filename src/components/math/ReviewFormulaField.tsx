"use client";

import "katex/dist/katex.min.css";
import "@/components/library/study.css";
import katex from "katex";
import { useMemo, useRef, useState } from "react";
import { LatexPalette } from "./LatexPalette";
import { insertLatexSnippet } from "./latex-snippets";
import { previewExpression } from "@/lib/latex";
import { cx } from "@/components/ui/cx";

/**
 * A FORMULA answer in review: the symbol lookup above the box, the box, and
 * the answer drawn as maths while it is typed.
 *
 * The box holds the text (a/b, sqrt(x), or LaTeX like \frac{a}{b}) and that
 * text is what is sent; the drawing is only a reading of it, so deleting in
 * the box is all there is to editing. The drawing comes from the grader's
 * own parse (previewExpression → mathjs toTex), so an answer that draws is
 * one the grader can read; while it doesn't parse yet, the last drawing
 * stays, faded, with a note to keep typing. Nothing here knows the answer.
 */

/** The groups a reviewer reaches for when writing an expression (search covers the rest). */
const REVIEW_GROUPS = ["Structure", "Operators", "Functions", "Arithmetic", "Greek", "Brackets"] as const;

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function render(tex: string): string | null {
  try {
    return katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: "ignore" });
  } catch {
    return null;
  }
}

export function ReviewFormulaField({ value, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [lastGood, setLastGood] = useState<string | null>(null);
  const result = useMemo(() => (value.trim() ? previewExpression(value) : null), [value]);
  const html = useMemo(() => (result?.ok ? render(result.tex) : null), [result]);

  // Keep the last drawing while the expression is half-typed (adjusting state during render).
  if (html && html !== lastGood) setLastGood(html);
  if (!value.trim() && lastGood !== null) setLastGood(null);

  function insert(snippet: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const { next, cursor } = insertLatexSnippet(value, start, end, snippet, false);
    onChange(next);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(cursor, cursor);
    });
  }

  const shown = html ?? lastGood;
  const incomplete = result !== null && !result.ok;

  return (
    <div className="rv-expr">
      {!disabled && (
        <details className="rv-sym" open>
          <summary>Symbols</summary>
          <LatexPalette onInsert={insert} groups={REVIEW_GROUPS} />
        </details>
      )}
      <div className={cx("m-preview", "rv-math")} aria-live="polite">
        {shown ? (
          <div className={cx("m-out", incomplete && "faded")}>
            <span dangerouslySetInnerHTML={{ __html: shown }} />
          </div>
        ) : (
          <p className="t-meta">Your answer appears here as maths while you type.</p>
        )}
        {incomplete && <p className="t-meta">Keep typing: not a complete expression yet.</p>}
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="grossProfit / grossLoss  or  \frac{a}{b}"
        aria-label="Your formula"
        className="rv-input mono"
        disabled={disabled}
        autoFocus
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
      />
    </div>
  );
}
