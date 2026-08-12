"use client";

import { useMemo, useState } from "react";
import type { CollectionLabel, QuestionType } from "@prisma/client";
import { displayQuestion, displayAnswer } from "@/lib/idea-display";
import { fieldColor } from "@/lib/palette";
import { MASTERY_LEVEL } from "@/lib/xp";
import { QUESTION_TYPES } from "@/lib/idea-payload";

export interface LibraryIdea {
  id: string;
  question: string;
  answer: string;
  questionType: QuestionType;
  collectionLabel: CollectionLabel;
  level: number;
  isArchived: boolean;
  fieldName: string;
  domainName: string;
  title: string | null;
  corePremise: string | null;
  tags: string[];
  linkedCount: number;
}

interface Props {
  ideas: LibraryIdea[];
  fieldNames: string[];
  domainsByField: Record<string, string[]>;
  allTags: string[];
}

const COLLECTION_LABELS: CollectionLabel[] = ["BOOK", "ACTIONABLE", "PROPOSAL"];

type StatusFilter = "any" | "mastered" | "developing" | "archived";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "developing", label: "In progress" },
  { value: "mastered", label: `Mastered (L${MASTERY_LEVEL})` },
  { value: "archived", label: "Archived" },
];

/**
 * Separator for composite domain keys. U+0000 because a field or domain
 * name can contain any printable character a user types, so any visible
 * delimiter risks a collision.
 */
const DOMAIN_KEY_SEP = "\u0000";

/**
 * Domains are keyed by field as well as name. Domain names are unique only
 * within a field, so a bare-name filter would silently match same-named
 * domains under unrelated fields.
 */
function domainKey(fieldName: string, domainName: string): string {
  return `${fieldName}${DOMAIN_KEY_SEP}${domainName}`;
}

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/** A selectable filter token. Shared by every facet so they behave alike. */
function FacetChip({
  label,
  active,
  count,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
      style={{
        padding: "3px 9px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.02em",
        border: `1px solid ${active ? (color ?? "rgba(0,204,122,0.45)") : "var(--line-hi)"}`,
        background: active ? (color ? `${color}1f` : "var(--green-10)") : "transparent",
        color: active ? (color ?? "var(--green)") : "var(--ink-2)",
        cursor: "pointer",
      }}
    >
      {label}
      {count !== undefined && (
        <span className="mono" style={{ opacity: 0.65, fontSize: 10 }}>
          {count}
        </span>
      )}
    </button>
  );
}

function FacetRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label-xs mb-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/**
 * Faceted library search.
 *
 * Replaces a pair of single-value `<select>`s that could express exactly one
 * field and one domain at a time — and where picking a field wiped the
 * domain choice, so "everything in Thermodynamics plus one domain from
 * Algebra" was not expressible at all. Every facet here is a set, and the
 * facets compose:
 *
 *   (any selected field) AND (any selected domain) AND (any selected tag)
 *   AND (any selected type) AND (any selected collection) AND level range
 *
 * Within a facet the semantics are OR, across facets AND — the standard
 * faceted-search contract, and the one that makes multi-field selection
 * mean "show me all of these" rather than the empty intersection.
 */
export function LibrarySearch({ ideas, fieldNames, domainsByField, allTags }: Props) {
  const [query, setQuery] = useState("");
  const [fieldFilter, setFieldFilter] = useState<Set<string>>(new Set());
  const [domainFilter, setDomainFilter] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<QuestionType>>(new Set());
  const [labelFilter, setLabelFilter] = useState<Set<CollectionLabel>>(new Set());
  const [status, setStatus] = useState<StatusFilter>("any");
  const [minLevel, setMinLevel] = useState(1);
  const [maxLevel, setMaxLevel] = useState(MASTERY_LEVEL);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  /**
   * Domains offered for selection. Narrowed to the chosen fields when any
   * are chosen, so the domain list stays navigable — but selections already
   * made are never silently dropped, they surface as removable tokens in
   * the active-filter bar instead.
   */
  const domainOptions = useMemo(() => {
    const source = fieldFilter.size > 0 ? [...fieldFilter] : fieldNames;
    const out: { name: string; field: string }[] = [];
    const seen = new Set<string>();
    for (const f of source) {
      for (const d of domainsByField[f] ?? []) {
        const key = domainKey(f, d);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name: d, field: f });
      }
    }
    return out;
  }, [fieldFilter, fieldNames, domainsByField]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ideas.filter((idea) => {
      if (status === "archived") {
        if (!idea.isArchived) return false;
      } else {
        if (idea.isArchived) return false;
        if (status === "mastered" && idea.level < MASTERY_LEVEL) return false;
        if (status === "developing" && idea.level >= MASTERY_LEVEL) return false;
      }

      if (fieldFilter.size > 0 && !fieldFilter.has(idea.fieldName)) return false;
      if (domainFilter.size > 0 && !domainFilter.has(domainKey(idea.fieldName, idea.domainName))) return false;
      if (tagFilter.size > 0 && !idea.tags.some((t) => tagFilter.has(t))) return false;
      if (typeFilter.size > 0 && !typeFilter.has(idea.questionType)) return false;
      if (labelFilter.size > 0 && !labelFilter.has(idea.collectionLabel)) return false;
      if (idea.level < minLevel || idea.level > maxLevel) return false;

      if (q) {
        // Title, premise and tags are searched alongside the raw Q&A —
        // the node data is often the most memorable handle on an idea.
        const haystack = [
          displayQuestion(idea.questionType, idea.question),
          displayAnswer(idea.questionType, idea.answer),
          idea.title ?? "",
          idea.corePremise ?? "",
          idea.tags.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [ideas, query, fieldFilter, domainFilter, tagFilter, typeFilter, labelFilter, status, minLevel, maxLevel]);

  /** Result counts per option, computed against everything *except* that facet. */
  const fieldCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const idea of ideas) {
      if (idea.isArchived && status !== "archived") continue;
      counts[idea.fieldName] = (counts[idea.fieldName] ?? 0) + 1;
    }
    return counts;
  }, [ideas, status]);

  const activeTokens: { key: string; label: string; clear: () => void }[] = [
    ...[...fieldFilter].map((f) => ({
      key: `field:${f}`,
      label: f,
      clear: () => setFieldFilter((s) => toggleSet(s, f)),
    })),
    ...[...domainFilter].map((d) => ({
      key: `domain:${d}`,
      // Token shows just the domain name; the field is implied by the
      // field token or by the colour of the row it filters.
      label: d.split(DOMAIN_KEY_SEP)[1] ?? d,
      clear: () => setDomainFilter((s) => toggleSet(s, d)),
    })),
    ...[...tagFilter].map((t) => ({
      key: `tag:${t}`,
      label: `#${t}`,
      clear: () => setTagFilter((s) => toggleSet(s, t)),
    })),
    ...[...typeFilter].map((t) => ({
      key: `type:${t}`,
      label: t,
      clear: () => setTypeFilter((s) => toggleSet(s, t)),
    })),
    ...[...labelFilter].map((l) => ({
      key: `label:${l}`,
      label: l,
      clear: () => setLabelFilter((s) => toggleSet(s, l)),
    })),
  ];
  if (status !== "any") {
    activeTokens.push({
      key: "status",
      label: STATUS_OPTIONS.find((o) => o.value === status)!.label,
      clear: () => setStatus("any"),
    });
  }
  if (minLevel > 1 || maxLevel < MASTERY_LEVEL) {
    activeTokens.push({
      key: "level",
      label: `L${minLevel}–${maxLevel}`,
      clear: () => {
        setMinLevel(1);
        setMaxLevel(MASTERY_LEVEL);
      },
    });
  }

  function clearAll() {
    setFieldFilter(new Set());
    setDomainFilter(new Set());
    setTagFilter(new Set());
    setTypeFilter(new Set());
    setLabelFilter(new Set());
    setStatus("any");
    setMinLevel(1);
    setMaxLevel(MASTERY_LEVEL);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search questions, answers, titles and tags…"
          className="input flex-1"
        />
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          className={advancedOpen ? "btn-primary" : "btn-secondary"}
          style={{ padding: "9px 16px" }}
        >
          Filters{activeTokens.length > 0 ? ` · ${activeTokens.length}` : ""}
        </button>
      </div>

      {/* Active filters stay visible whether or not the panel is open —
          otherwise a collapsed panel hides why the result count is low. */}
      {activeTokens.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeTokens.map((token) => (
            <button
              key={token.key}
              type="button"
              onClick={token.clear}
              title={`Remove ${token.label}`}
              className="inline-flex items-center gap-1.5"
              style={{
                padding: "3px 8px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                border: "1px solid rgba(0,204,122,0.30)",
                background: "var(--green-10)",
                color: "var(--green)",
                cursor: "pointer",
              }}
            >
              {token.label}
              <span aria-hidden style={{ opacity: 0.7 }}>
                ×
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={clearAll}
            style={{
              fontSize: 11,
              color: "var(--ink-2)",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Clear all
          </button>
        </div>
      )}

      {advancedOpen && (
        <div className="card space-y-5 p-4">
          <FacetRow label={`Fields${fieldFilter.size > 0 ? ` · ${fieldFilter.size} selected` : ""}`}>
            {fieldNames.map((f) => (
              <FacetChip
                key={f}
                label={f}
                count={fieldCounts[f] ?? 0}
                color={fieldColor(f)}
                active={fieldFilter.has(f)}
                onClick={() => setFieldFilter((s) => toggleSet(s, f))}
              />
            ))}
          </FacetRow>

          <FacetRow
            label={
              fieldFilter.size > 0
                ? `Domains · within ${fieldFilter.size} selected field${fieldFilter.size === 1 ? "" : "s"}`
                : "Domains · all fields"
            }
          >
            {domainOptions.length === 0 ? (
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>No domains available.</span>
            ) : (
              domainOptions.map((d) => (
                <FacetChip
                  key={domainKey(d.field, d.name)}
                  label={d.name}
                  color={fieldColor(d.field)}
                  active={domainFilter.has(domainKey(d.field, d.name))}
                  onClick={() => setDomainFilter((s) => toggleSet(s, domainKey(d.field, d.name)))}
                />
              ))
            )}
          </FacetRow>

          {allTags.length > 0 && (
            <FacetRow label="Tags">
              {allTags.map((t) => (
                <FacetChip
                  key={t}
                  label={`#${t}`}
                  active={tagFilter.has(t)}
                  onClick={() => setTagFilter((s) => toggleSet(s, t))}
                />
              ))}
            </FacetRow>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FacetRow label="Question type">
              {QUESTION_TYPES.map((t) => (
                <FacetChip
                  key={t}
                  label={t}
                  active={typeFilter.has(t)}
                  onClick={() => setTypeFilter((s) => toggleSet(s, t))}
                />
              ))}
            </FacetRow>

            <FacetRow label="Collection">
              {COLLECTION_LABELS.map((l) => (
                <FacetChip
                  key={l}
                  label={l}
                  active={labelFilter.has(l)}
                  onClick={() => setLabelFilter((s) => toggleSet(s, l))}
                />
              ))}
            </FacetRow>

            <FacetRow label="Status">
              {STATUS_OPTIONS.map((o) => (
                <FacetChip
                  key={o.value}
                  label={o.label}
                  active={status === o.value}
                  onClick={() => setStatus(o.value)}
                />
              ))}
            </FacetRow>

            <div>
              <p className="label-xs mb-2">Level range</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={MASTERY_LEVEL}
                  value={minLevel}
                  onChange={(e) =>
                    setMinLevel(Math.min(maxLevel, Math.max(1, Number(e.target.value) || 1)))
                  }
                  className="input w-16"
                  aria-label="Minimum level"
                />
                <span style={{ color: "var(--ink-3)" }}>–</span>
                <input
                  type="number"
                  min={1}
                  max={MASTERY_LEVEL}
                  value={maxLevel}
                  onChange={(e) =>
                    setMaxLevel(
                      Math.max(minLevel, Math.min(MASTERY_LEVEL, Number(e.target.value) || MASTERY_LEVEL))
                    )
                  }
                  className="input w-16"
                  aria-label="Maximum level"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
        {results.length} of {ideas.length} idea{ideas.length === 1 ? "" : "s"}
      </p>

      <ul className="space-y-2">
        {results.map((idea) => {
          const mastered = idea.level >= MASTERY_LEVEL;
          return (
            <li
              key={idea.id}
              className="card p-3.5"
              style={{ borderLeftColor: fieldColor(idea.fieldName), borderLeftWidth: 3 }}
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-2" style={{ fontSize: 10, color: "var(--ink-2)" }}>
                <span className="mono uppercase" style={{ color: fieldColor(idea.fieldName) }}>
                  {idea.fieldName}
                </span>
                <span>·</span>
                <span>{idea.domainName}</span>
                <span>·</span>
                <span className="mono uppercase">{idea.questionType}</span>
                <span className="mono" style={{ color: mastered ? "var(--green)" : undefined }}>
                  L{idea.level}
                </span>
                {mastered && <span className="chip chip-green">Mastered</span>}
                {idea.linkedCount > 0 && (
                  <span className="chip chip-blue">
                    {idea.linkedCount} link{idea.linkedCount === 1 ? "" : "s"}
                  </span>
                )}
                {idea.isArchived && <span className="chip chip-muted">Archived</span>}
              </div>

              {idea.title && (
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-0)" }}>{idea.title}</p>
              )}
              <p style={{ fontSize: 13, color: idea.title ? "var(--ink-1)" : "var(--ink-0)" }}>
                {displayQuestion(idea.questionType, idea.question)}
              </p>
              <p className="mt-1" style={{ fontSize: 13, color: "var(--ink-1)" }}>
                {displayAnswer(idea.questionType, idea.answer)}
              </p>

              {idea.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {idea.tags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTagFilter((s) => toggleSet(s, t))}
                      title={`Filter by #${t}`}
                      className="mono"
                      style={{
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: 4,
                        border: "1px solid var(--line)",
                        background: tagFilter.has(t) ? "var(--green-10)" : "transparent",
                        color: tagFilter.has(t) ? "var(--green)" : "var(--ink-2)",
                        cursor: "pointer",
                      }}
                    >
                      #{t}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
        {results.length === 0 && (
          <li className="card px-4 py-10 text-center" style={{ fontSize: 13, color: "var(--ink-2)" }}>
            No ideas match these filters.
            {activeTokens.length > 0 && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={clearAll}
                  style={{ color: "var(--green)", background: "none", border: "none", cursor: "pointer" }}
                >
                  Clear all filters
                </button>
              </>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}
