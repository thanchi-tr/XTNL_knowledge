"use client";

import "katex/dist/katex.min.css";
import katex from "katex";
import { Fragment, useMemo } from "react";

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
 */

const MATH_SEGMENT = /\$\$([^$]+?)\$\$|\$([^$\n]+?)\$/g;

interface Segment {
  key: number;
  text: string;
  latex?: string;
  display?: boolean;
}

function splitSegments(source: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  let key = 0;
  for (const match of source.matchAll(MATH_SEGMENT)) {
    const idx = match.index ?? 0;
    if (idx > last) segments.push({ key: key++, text: source.slice(last, idx) });
    const [whole, display, inline] = match;
    segments.push({ key: key++, text: whole, latex: display ?? inline, display: display !== undefined });
    last = idx + whole.length;
  }
  if (last < source.length) segments.push({ key: key++, text: source.slice(last) });
  return segments;
}

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
  // case — so this skips the regex pass entirely for plain-prose prompts.
  const segments = useMemo(() => (text.includes("$") ? splitSegments(text) : [{ key: 0, text }]), [text]);

  return (
    <span className={className}>
      {segments.map((seg) => {
        if (!seg.latex) return <Fragment key={seg.key}>{seg.text}</Fragment>;
        const html = renderLatex(seg.latex, !!seg.display);
        if (html === null) {
          // Invalid LaTeX mid-edit shouldn't blank the field or break the
          // sentence around it — show the raw span, flagged, and move on.
          return (
            <span key={seg.key} className="mono" style={{ color: "var(--amber)" }} title="Couldn't parse this as LaTeX">
              {seg.text}
            </span>
          );
        }
        return <span key={seg.key} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </span>
  );
}
