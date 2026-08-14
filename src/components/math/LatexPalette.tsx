"use client";

import "katex/dist/katex.min.css";
import katex from "katex";
import { useCallback, useMemo, useState } from "react";
import { LATEX_GROUPS, CURSOR_MARK, type LatexSnippet } from "./latex-snippets";

/**
 * The shared lookup: every symbol drawn as the notation it actually produces,
 * grouped, searchable, and remembering what you reach for.
 *
 * Buttons used to show a Unicode stand-in for each command — "a⁄b" for
 * `\frac`, "(ⁿₖ)" for `\binom`, "▦" for a matrix. Approximations at best and
 * misleading at worst, since the point of a symbol picker is recognising the
 * thing you want on sight. Each button now renders its own snippet through
 * KaTeX, so the palette shows real typeset maths and a button cannot
 * misrepresent what it inserts. The Unicode glyph survives as the fallback
 * for the handful of entries that are structural rather than renderable on
 * their own (`&`, a row break).
 *
 * Recents are per-browser and capped: with 206 symbols across fifteen
 * groups, most authoring reaches for the same dozen, and paying the group-
 * hunt every time is the palette's main cost once you know what you want.
 */

const RECENTS_KEY = "xtnl:latexRecents:v1";
const RECENTS_MAX = 14;

function readRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeRecents(commands: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(commands.slice(0, RECENTS_MAX)));
  } catch {
    // Private mode or quota — recents are a convenience, never a blocker.
  }
}

const ALL_SNIPPETS = LATEX_GROUPS.flatMap((g) => g.snippets);

/**
 * KaTeX markup for a snippet's button face.
 *
 * Renders the *documented* command rather than the insertion template. The
 * template's groups are deliberately empty so the caret lands inside one —
 * `\frac{}{}`, `\overline{}` — and KaTeX faithfully typesets those as
 * nothing, which turned a third of the palette into blank buttons. The
 * command form carries real placeholders (`\frac{a}{b}`), so it shows the
 * shape you are about to insert. The template is kept as a second chance for
 * the few entries where it is the more complete of the two, and the Unicode
 * glyph as the last resort for structural tokens that cannot stand alone.
 *
 * Keyed by command and cached across mounts, so the palette is typeset once
 * rather than on every keystroke in the field beside it.
 */
const GLYPH_CACHE = new Map<string, string | null>();

function glyphHtml(snippet: LatexSnippet): string | null {
  const cached = GLYPH_CACHE.get(snippet.command);
  if (cached !== undefined) return cached;

  // Strip the caret marker and any parenthetical note ("& (column separator)").
  const candidates = [
    snippet.command.replace(/\s*\([^)]*\)\s*$/, ""),
    snippet.insert.replace(CURSOR_MARK, ""),
  ];
  let html: string | null = null;
  for (const c of candidates) {
    if (!c.trim()) continue;
    try {
      const out = katex.renderToString(c, { throwOnError: true, strict: "ignore", displayMode: false });
      // A successful render is not necessarily a *visible* one: `\\` and
      // `\quad` typeset to pure whitespace, so the button would come out
      // empty despite nothing having gone wrong. Treat those as a miss so
      // the Unicode glyph (⏎, ␣) stands in for them.
      if (!out.replace(/<[^>]*>/g, "").trim()) continue;
      html = out;
      break;
    } catch {
      // Try the next candidate.
    }
  }
  GLYPH_CACHE.set(snippet.command, html);
  return html;
}

interface Props {
  onInsert: (snippet: string) => void;
}

export function LatexPalette({ onInsert }: Props) {
  const [openGroup, setOpenGroup] = useState(LATEX_GROUPS[0].label);
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>(() => readRecents());
  const [hovered, setHovered] = useState<LatexSnippet | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return ALL_SNIPPETS.filter((s) => s.command.toLowerCase().includes(q) || s.glyph.toLowerCase().includes(q));
  }, [query]);

  const recentSnippets = useMemo(
    () => recents.map((c) => ALL_SNIPPETS.find((s) => s.command === c)).filter((s): s is LatexSnippet => !!s),
    [recents]
  );

  const insert = useCallback(
    (s: LatexSnippet) => {
      onInsert(s.insert);
      setRecents((prev) => {
        const next = [s.command, ...prev.filter((c) => c !== s.command)].slice(0, RECENTS_MAX);
        writeRecents(next);
        return next;
      });
    },
    [onInsert]
  );

  const showing: LatexSnippet[] =
    results ??
    (openGroup === "Recent" ? recentSnippets : LATEX_GROUPS.find((g) => g.label === openGroup)?.snippets ?? []);

  const tabs = [...(recentSnippets.length > 0 ? ["Recent"] : []), ...LATEX_GROUPS.map((g) => g.label)];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        {tabs.map((label) => {
          const active = !results && openGroup === label;
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                setOpenGroup(label);
                setQuery("");
              }}
              style={{
                padding: "2px 8px",
                borderRadius: 6,
                fontSize: 10.5,
                fontWeight: 600,
                border: `1px solid ${active ? "rgba(0,204,122,.4)" : "var(--line)"}`,
                background: active ? "var(--green-10)" : "transparent",
                color: active ? "var(--green)" : label === "Recent" ? "var(--amber)" : "var(--ink-2)",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
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
        className="mt-1.5 p-2"
        style={{ borderRadius: 8, background: "var(--sub)", border: "1px solid var(--line)" }}
      >
        <div className="flex flex-wrap gap-1" style={{ maxHeight: 150, overflowY: "auto" }}>
          {showing.length === 0 ? (
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {results ? `No symbol matches “${query}”.` : "Nothing here yet."}
            </span>
          ) : (
            showing.map((s) => {
              const html = glyphHtml(s);
              return (
                <button
                  key={s.command}
                  type="button"
                  onClick={() => insert(s)}
                  onMouseEnter={() => setHovered(s)}
                  onMouseLeave={() => setHovered((h) => (h === s ? null : h))}
                  onFocus={() => setHovered(s)}
                  onBlur={() => setHovered((h) => (h === s ? null : h))}
                  title={s.command}
                  aria-label={`Insert ${s.command}`}
                  style={{
                    minWidth: 34,
                    minHeight: 30,
                    padding: "3px 7px",
                    borderRadius: 6,
                    fontSize: 13,
                    lineHeight: 1.2,
                    border: "1px solid var(--line-hi)",
                    background: "var(--raised)",
                    color: "var(--ink-0)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {html ? <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} /> : s.glyph}
                </button>
              );
            })
          )}
        </div>

        {/* A persistent readout beats a native tooltip here: it appears
            instantly, sits in one predictable place, and survives keyboard
            focus, so tabbing through the palette still tells you what each
            button is. */}
        <div
          className="mono"
          style={{
            marginTop: 6,
            paddingTop: 5,
            borderTop: "1px solid var(--line)",
            fontSize: 10.5,
            color: hovered ? "var(--blue)" : "var(--ink-3)",
            minHeight: 15,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {hovered ? hovered.command : `${ALL_SNIPPETS.length} symbols — hover one to see its command`}
        </div>
      </div>
    </div>
  );
}
