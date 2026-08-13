"use client";

import { useMemo, useState } from "react";
import { LATEX_GROUPS } from "./latex-snippets";

/**
 * The shared lookup: grouped LaTeX commands, plus a search that spans every
 * group at once.
 *
 * Both equation fields use this — the prompt (which wraps insertions in
 * `$...$` when the caret is in prose) and the answer (which is already all
 * math). The search box is what keeps fifteen groups usable: knowing a
 * symbol exists but not which drawer it's in is the failure mode a
 * categorised palette has, and typing "subset" or "⊆" beats hunting.
 */

interface Props {
  onInsert: (snippet: string) => void;
}

export function LatexPalette({ onInsert }: Props) {
  const [openGroup, setOpenGroup] = useState(LATEX_GROUPS[0].label);
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return LATEX_GROUPS.flatMap((g) => g.snippets).filter(
      (s) => s.command.toLowerCase().includes(q) || s.glyph.toLowerCase().includes(q)
    );
  }, [query]);

  const shown = results ?? LATEX_GROUPS.find((g) => g.label === openGroup)!.snippets;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        {LATEX_GROUPS.map((g) => (
          <button
            key={g.label}
            type="button"
            onClick={() => {
              setOpenGroup(g.label);
              setQuery("");
            }}
            style={{
              padding: "2px 8px",
              borderRadius: 6,
              fontSize: 10.5,
              fontWeight: 600,
              border: `1px solid ${!results && openGroup === g.label ? "rgba(0,204,122,.4)" : "var(--line)"}`,
              background: !results && openGroup === g.label ? "var(--green-10)" : "transparent",
              color: !results && openGroup === g.label ? "var(--green)" : "var(--ink-2)",
              cursor: "pointer",
            }}
          >
            {g.label}
          </button>
        ))}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search symbols…"
          aria-label="Search LaTeX symbols"
          style={{
            marginLeft: "auto",
            width: 130,
            padding: "2px 8px",
            borderRadius: 6,
            fontSize: 10.5,
            border: "1px solid var(--line)",
            background: "var(--sub)",
            color: "var(--ink-1)",
          }}
        />
      </div>

      <div
        className="mt-1.5 flex flex-wrap gap-1 p-2"
        style={{ borderRadius: 8, background: "var(--sub)", border: "1px solid var(--line)", maxHeight: 148, overflowY: "auto" }}
      >
        {shown.length === 0 ? (
          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>No symbol matches “{query}”.</span>
        ) : (
          shown.map((s) => (
            <button
              key={s.command}
              type="button"
              onClick={() => onInsert(s.insert)}
              title={s.command}
              aria-label={`Insert ${s.command}`}
              style={{
                minWidth: 32,
                padding: "4px 7px",
                borderRadius: 6,
                fontSize: 13,
                lineHeight: 1.2,
                border: "1px solid var(--line-hi)",
                background: "var(--raised)",
                color: "var(--ink-0)",
                cursor: "pointer",
              }}
            >
              {s.glyph}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
