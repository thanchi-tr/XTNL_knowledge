"use client";

import "katex/dist/katex.min.css";
import "@/components/library/study.css";
import katex from "katex";
import { useMemo, useRef } from "react";
import { LatexPalette } from "./LatexPalette";
import { LatexEditor } from "./LatexEditor";
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
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
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
      <LatexEditor
        editorRef={inputRef}
        value={value}
        onChange={onChange}
        rows={2}
        singleLine
        ariaLabel="Answer expression"
        placeholder="sqrt(x^2 + y^2)  or  \sqrt{x^2 + y^2}"
      />

      <div style={{ marginTop: 8 }}>
        <LatexPalette onInsert={insert} />
      </div>

      <div className="m-preview">
        <span className="t-eyebrow">Preview</span>
        {result === null ? (
          <p className="t-meta">Nothing to preview yet.</p>
        ) : result.ok ? (
          <>
            <div className="m-out">
              {html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : <span className="t-mono">{result.tex}</span>}
            </div>
            <div className="m-facts t-meta">
              <span>
                Stored as <span className="t-mono ink-1">{result.mathjs}</span>
              </span>
              <span>
                {result.variables.length > 0 ? (
                  <>
                    Variables <span className="t-mono ink-1">{result.variables.join(", ")}</span>: a reviewer must use these exact
                    names.
                  </>
                ) : (
                  "No free variables: this is a constant."
                )}
              </span>
            </div>
          </>
        ) : (
          <div>
            <p className="st-error">The grader can’t parse this: {result.error}</p>
            <p className="t-meta" style={{ marginTop: 2 }}>
              Until this parses, no answer could ever be marked correct: grading evaluates both sides as expressions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
