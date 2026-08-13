"use client";

import "katex/dist/katex.min.css";
import katex from "katex";
import { useMemo, useRef } from "react";
import { LatexPalette } from "./LatexPalette";
import { insertLatexSnippet } from "./latex-snippets";
import { previewExpression } from "@/lib/latex";

/**
 * The FORMULA answer field: LaTeX or plain mathjs in, rendered math out,
 * with the grader's own parser deciding whether the preview appears at all.
 *
 * The answer is not prose and is never displayed to a reviewer — it is
 * *evaluated*. `verifyFormula` proves a submitted answer correct by running
 * both expressions through mathjs at several random points, so whatever is
 * stored has to be something mathjs can parse. That rules out storing raw
 * LaTeX, and it rules out previewing the raw source with KaTeX: `\frac{a}{b}`
 * typesets beautifully and means nothing to the grader, so a naive preview
 * would confidently display an answer that rejects every correct response.
 *
 * So the pipeline runs the other way. Input is normalised to mathjs
 * (`latexToMathjs`), parsed with the same `math.parse` the grader uses, and
 * only then rendered back to LaTeX via mathjs's own `toTex()`. The preview
 * appearing *is* the guarantee that grading will work; a parse failure shows
 * the error instead. Both notations are accepted because both are natural to
 * type — `sqrt(x^2+y^2)` and `\sqrt{x^2+y^2}` normalise to the same
 * expression and grade identically.
 */

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function AnswerExpressionField({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const result = useMemo(() => (value.trim() ? previewExpression(value) : null), [value]);

  function insert(snippet: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    // Never wrapped in `$…$`: the whole field is one expression, and a `$`
    // would only have to be stripped again before the grader sees it.
    const { next, cursor } = insertLatexSnippet(value, start, end, snippet, false);
    onChange(next);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(cursor, cursor);
    });
  }

  const html = useMemo(() => {
    if (!result?.ok) return null;
    try {
      return katex.renderToString(result.tex, { displayMode: true, throwOnError: true, strict: "ignore" });
    } catch {
      return null;
    }
  }, [result]);

  return (
    <div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input font-mono"
        style={{ width: "100%" }}
        placeholder="sqrt(x^2 + y^2)  or  \sqrt{x^2 + y^2}"
      />

      <div className="mt-2">
        <LatexPalette onInsert={insert} />
      </div>

      <div className="mt-2 p-3" style={{ borderRadius: 8, background: "var(--sub)", border: "1px solid var(--line)" }}>
        <p className="label-xs">Preview</p>
        {result === null ? (
          <p className="mt-1" style={{ fontSize: 13, color: "var(--ink-3)" }}>Nothing to preview yet.</p>
        ) : result.ok ? (
          <>
            <div className="mt-1" style={{ color: "var(--ink-0)", overflowX: "auto" }}>
              {html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : <span className="mono">{result.tex}</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1" style={{ fontSize: 10, color: "var(--ink-3)" }}>
              <span>
                Stored as <span className="mono" style={{ color: "var(--ink-2)" }}>{result.mathjs}</span>
              </span>
              <span>
                {result.variables.length > 0 ? (
                  <>
                    Variables{" "}
                    <span className="mono" style={{ color: "var(--ink-2)" }}>{result.variables.join(", ")}</span> — a
                    reviewer must use these exact names.
                  </>
                ) : (
                  "No free variables — this is a constant."
                )}
              </span>
            </div>
          </>
        ) : (
          <p className="mt-1" style={{ fontSize: 11.5, color: "var(--red)", lineHeight: 1.5 }}>
            The grader can’t parse this: {result.error}
            <span className="mt-0.5 block" style={{ color: "var(--ink-3)", fontSize: 10 }}>
              Until this parses, no answer could ever be marked correct — grading evaluates both sides as expressions.
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
