"use client";

import "katex/dist/katex.min.css";
import katex from "katex";
import { Fragment, useMemo } from "react";
import { segmentMath } from "@/lib/latex";

/**
 * Renders prose with inline `$...$` and block `$$...$$` LaTeX spans typeset
 * via KaTeX; everything else is left as plain text, verbatim.
 *
 * Every FORMULA Idea seeded before this feature existed is a full English
 * sentence with no `$` in it at all — "Write the Euclidean norm of a vector
 * with components x and y." Running that whole string through KaTeX would
 * still "succeed" (plain words parse as math-italic letters) but render as
 * cramped, wrongly-spaced text. Scoping rendering to explicit `$...$` spans
 * means every existing prompt renders byte-for-byte unchanged, and LaTeX is
 * something an author opts into inside a sentence rather than a mode the
 * whole field switches into.
 *
 * Segmentation lives in `lib/latex.ts` so the authoring field's caret logic
 * and this renderer can never disagree about where a span begins or ends.
 */

function renderLatex(latex: string, display: boolean): string | null {
  try {
    return katex.renderToString(latex.trim(), { displayMode: display, throwOnError: true, strict: "ignore" });
  } catch {
    return null;
  }
}

interface Props {
  text: string;
  className?: string;
}

export function MathText({ text, className }: Props) {
  // Nothing to split when there's no `$` at all — the overwhelmingly common
  // case — so this skips the segmentation pass entirely for plain prose.
  const segments = useMemo(() => (text.includes("$") ? segmentMath(text) : [{ text, start: 0 }]), [text]);

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.latex === undefined) return <Fragment key={i}>{seg.text}</Fragment>;
        const html = renderLatex(seg.latex, !!seg.display);
        if (html === null) {
          // Invalid LaTeX mid-edit shouldn't blank the field or break the
          // sentence around it — show the raw span, flagged, and move on.
          return (
            <span key={i} className="mono" style={{ color: "var(--amber)" }} title="Couldn't parse this as LaTeX">
              {seg.text}
            </span>
          );
        }
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </span>
  );
}
