"use client";

import { useRef, useState } from "react";
import { MathText } from "./MathText";
import { LATEX_GROUPS, insertLatexSnippet } from "./latex-snippets";

/**
 * The FORMULA prompt field: a textarea that accepts LaTeX inside `$...$` /
 * `$$...$$` spans, a lookup palette that inserts commands at the cursor, and
 * a live preview of the whole prompt as it will actually be shown to a
 * reviewer.
 *
 * The palette inserts bare LaTeX, never pre-wrapped in `$...$` — clicking
 * "frac" then "alpha" should build one coherent expression inside a single
 * span, not two adjacent ones. Wrapping is its own explicit action instead.
 */

interface Props {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}

export function EquationField({ value, onChange, rows = 3 }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [openGroup, setOpenGroup] = useState<string>(LATEX_GROUPS[0].label);

  function replaceSelection(next: string, cursor: number) {
    onChange(next);
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
    const { next, cursor } = insertLatexSnippet(value, start, end, snippet);
    replaceSelection(next, cursor);
  }

  /** Wraps the current selection in `$...$`, or inserts an empty pair with the cursor between. */
  function wrapMath(display: boolean) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const delim = display ? "$$" : "$";
    const selected = value.slice(start, end);
    const wrapped = `${delim}${selected}${delim}`;
    const next = value.slice(0, start) + wrapped + value.slice(end);
    const cursor = selected ? start + wrapped.length : start + delim.length;
    replaceSelection(next, cursor);
  }

  const hasMath = value.includes("$");

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <button type="button" className="chip" style={CHIP_BUTTON} onClick={() => wrapMath(false)} title="Wrap the selection in $...$ (inline math)">
          $ inline
        </button>
        <button type="button" className="chip" style={CHIP_BUTTON} onClick={() => wrapMath(true)} title="Wrap the selection in $$...$$ (block/display math)">
          $$ block
        </button>
        <span style={{ fontSize: 10, color: "var(--ink-3)" }}>Only text inside $...$ renders as math — everything else stays plain.</span>
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="input font-mono"
        style={{ width: "100%" }}
        placeholder="e.g. Simplify $\frac{x^2-1}{x-1}$ for x ≠ 1."
      />

      {/* Lookup — grouped LaTeX commands, glyph as the button, exact command on hover. */}
      <div className="mt-2">
        <div className="flex flex-wrap gap-1">
          {LATEX_GROUPS.map((g) => (
            <button
              key={g.label}
              type="button"
              onClick={() => setOpenGroup(g.label)}
              style={{
                padding: "2px 8px",
                borderRadius: 6,
                fontSize: 10.5,
                fontWeight: 600,
                border: `1px solid ${openGroup === g.label ? "rgba(0,204,122,.4)" : "var(--line)"}`,
                background: openGroup === g.label ? "var(--green-10)" : "transparent",
                color: openGroup === g.label ? "var(--green)" : "var(--ink-2)",
                cursor: "pointer",
              }}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1 p-2" style={{ borderRadius: 8, background: "var(--sub)", border: "1px solid var(--line)" }}>
          {LATEX_GROUPS.find((g) => g.label === openGroup)!.snippets.map((s) => (
            <button
              key={s.command}
              type="button"
              onClick={() => insert(s.insert)}
              title={s.command}
              aria-label={`Insert ${s.command}`}
              className="mono"
              style={{
                minWidth: 30,
                padding: "4px 7px",
                borderRadius: 6,
                fontSize: 13,
                border: "1px solid var(--line-hi)",
                background: "var(--raised)",
                color: "var(--ink-0)",
                cursor: "pointer",
              }}
            >
              {s.glyph}
            </button>
          ))}
        </div>
      </div>

      {/* Preview — exactly what SessionCard and the Library will show. */}
      <div className="mt-2 p-3" style={{ borderRadius: 8, background: "var(--sub)", border: "1px solid var(--line)" }}>
        <p className="label-xs">Preview</p>
        <div className="mt-1" style={{ fontSize: 15, color: "var(--ink-0)", lineHeight: 1.6, minHeight: 22 }}>
          {value.trim() ? (
            <MathText text={value} />
          ) : (
            <span style={{ color: "var(--ink-3)", fontSize: 13 }}>Nothing to preview yet.</span>
          )}
        </div>
        {value.trim() && !hasMath && (
          <p className="mt-1" style={{ fontSize: 10, color: "var(--ink-3)" }}>
            No $...$ span yet — this will show exactly as typed, with no math rendering.
          </p>
        )}
      </div>
    </div>
  );
}

const CHIP_BUTTON: React.CSSProperties = { cursor: "pointer", border: "1px solid var(--line)", background: "var(--sub)" };
