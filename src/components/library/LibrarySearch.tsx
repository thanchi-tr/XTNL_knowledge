"use client";

/**
 * Study › Library, the Browse template (redesign L5).
 *
 *   search (48 px) + Filters (a sheet: every facet family)
 *   quick chips: All · Due n · Mastered n · Struggling n
 *   field tiles: the tier ornament as a material stripe; a tap narrows to that field
 *   sections by field: idea rows (64 px): title, domain + due line, level or Mastered
 *
 * Every filter lives in the URL (library-model: parseFilters / filtersToParams),
 * written with history.replaceState so Back is not flooded; opening an idea
 * pushes ?idea=<id>, so Back closes it. The idea opens in the kit Sheet: a
 * bottom sheet on compact, a right drawer from 600. Its own page is
 * /library/[id] (a modifier-click on a row still opens it).
 *
 * Faceted search: OR inside a family, AND across families.
 */
import "./study.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CollectionLabel, QuestionType } from "@prisma/client";
import { ideaHistory } from "@/app/actions/ideas";
import { DIFFICULTY_META, type DifficultyBand } from "@/lib/difficulty";
import { fieldTier } from "@/lib/field-tier";
import { QUESTION_TYPES } from "@/lib/idea-payload";
import { MASTERY_LEVEL } from "@/lib/xp";
import { MathText } from "@/components/math/MathText";
import { Button } from "@/components/ui/Button";
import { Chip, ChipButton } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { PageActions, SectionHeader } from "@/components/ui/Tabs";
import { IdeaDetail } from "./IdeaDetail";
import {
  COLLECTION_LABELS,
  COLLECTION_NAME,
  DIFFICULTY_BANDS,
  EMPTY_FILTERS,
  STATUS_NAME,
  TYPE_NAME,
  URL_KEYS,
  dueLabel,
  facetCount,
  filtersToParams,
  historyOf,
  ideaHeadline,
  isMastered,
  isUnfiltered,
  levelText,
  matchesFilters,
  parseFilters,
  plural,
  searchText,
  statusCounts,
  tierMaterial,
  toggle,
  type IdeaHistory,
  type LibraryField,
  type LibraryFilters,
  type LibraryIdea,
  type LibraryStatus,
} from "./library-model";

export type { LibraryIdea } from "./library-model";

interface Props {
  ideas: LibraryIdea[];
  fields: LibraryField[];
  allTags: string[];
  /** Request time (ms), so server and browser agree on "due". */
  now: number;
}

/** Rows shown per field before "Show all". */
const SECTION_CAP = 40;
const QUICK: LibraryStatus[] = ["all", "due", "mastered", "struggling"];

export function LibrarySearch({ ideas, fields, allTags, now }: Props) {
  const params = useSearchParams();
  const filters = useMemo(() => parseFilters(new URLSearchParams(params.toString())), [params]);
  const openId = params.get(URL_KEYS.idea);

  // The search box types into local state and writes the URL shortly after,
  // so a keystroke never waits on the router.
  const [q, setQ] = useState(filters.q);
  const [lastUrlQ, setLastUrlQ] = useState(filters.q);
  if (filters.q !== lastUrlQ) {
    // Back/forward (or a chip that cleared everything) changed q under us.
    setLastUrlQ(filters.q);
    setQ(filters.q);
  }
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const pushedIdea = useRef(false);

  const write = useCallback(
    (next: LibraryFilters, idea: string | null = openId) => {
      const qs = filtersToParams(next, { idea }).toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    },
    [openId]
  );

  useEffect(() => {
    if (q === filters.q) return;
    const t = window.setTimeout(() => {
      setLastUrlQ(q);
      write({ ...filters, q });
    }, 220);
    return () => window.clearTimeout(t);
  }, [q, filters, write]);

  const set = (patch: Partial<LibraryFilters>) => write({ ...filters, q, ...patch });

  // Search reads every idea's text; build each haystack once.
  const haystacks = useMemo(() => new Map(ideas.map((i) => [i.id, searchText(i)])), [ideas]);
  const live = useMemo(() => ideas.filter((i) => !removed.has(i.id)), [ideas, removed]);
  const counts = useMemo(() => statusCounts(live, now), [live, now]);
  const effective = useMemo(() => ({ ...filters, q }), [filters, q]);
  const results = useMemo(
    () => live.filter((i) => matchesFilters(i, effective, now, haystacks.get(i.id))),
    [live, effective, now, haystacks]
  );

  // Fields ordered by level (the ladder the stripe describes), then name.
  const orderedFields = useMemo(
    () => [...fields].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name)),
    [fields]
  );
  const ideaCountByField = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of live) if (!i.isArchived) m.set(i.fieldId, (m.get(i.fieldId) ?? 0) + 1);
    return m;
  }, [live]);
  const sections = useMemo(() => {
    const byField = new Map<string, LibraryIdea[]>();
    for (const i of results) {
      const list = byField.get(i.fieldId) ?? [];
      list.push(i);
      byField.set(i.fieldId, list);
    }
    return orderedFields
      .filter((f) => byField.has(f.id))
      .map((f) => ({ field: f, ideas: byField.get(f.id)!.sort((a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id)) }));
  }, [results, orderedFields]);

  // ── The open idea (?idea=<id>) ────────────────────────────────────────────
  const openIdea = openId ? (live.find((i) => i.id === openId) ?? null) : null;
  const [histories, setHistories] = useState<Record<string, IdeaHistory>>({});
  useEffect(() => {
    if (!openId || histories[openId]) return;
    let cancelled = false;
    ideaHistory(openId)
      .then((rows) => {
        if (!cancelled) setHistories((h) => ({ ...h, [openId]: historyOf(rows) }));
      })
      .catch(() => {
        if (!cancelled) setHistories((h) => ({ ...h, [openId]: historyOf([]) }));
      });
    return () => {
      cancelled = true;
    };
  }, [openId, histories]);

  useEffect(() => {
    if (!openId) pushedIdea.current = false;
  }, [openId]);

  function openDetail(id: string) {
    const qs = filtersToParams(effective, { idea: id }).toString();
    window.history.pushState(null, "", `?${qs}`);
    pushedIdea.current = true;
  }

  function closeDetail() {
    if (!openId) return;
    if (pushedIdea.current) {
      pushedIdea.current = false;
      window.history.back();
    } else {
      write(effective, null);
    }
  }

  const unfiltered = isUnfiltered(effective);
  const tokens = activeTokens(filters, fields, (patch) => set(patch));

  return (
    <>
      <PageActions>
        <Button variant="secondary" href="/add" icon="plus">
          New idea
        </Button>
      </PageActions>

      <div className="lib-search" role="search">
        <label className="lib-q">
          <span className="sr-only">Search ideas</span>
          <Icon name="search" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${plural(counts.all, "idea")}`}
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>
        <Button
          variant="secondary"
          icon="grid"
          className="lib-filters-btn"
          onClick={() => setFiltersOpen(true)}
          aria-haspopup="dialog"
        >
          Filters{facetCount(filters) > 0 ? ` · ${facetCount(filters)}` : ""}
        </Button>
      </div>

      <div className="lib-chips" role="group" aria-label="Show">
        {QUICK.map((s) => (
          <ChipButton key={s} pressed={filters.status === s} onClick={() => set({ status: s })}>
            {STATUS_NAME[s]}
            {s !== "all" && counts[s] > 0 && <span className="num">{counts[s].toLocaleString("en-GB")}</span>}
          </ChipButton>
        ))}
        {filters.status === "archived" && (
          <ChipButton pressed onClick={() => set({ status: "all" })}>
            Archived <span className="num">{counts.archived.toLocaleString("en-GB")}</span>
          </ChipButton>
        )}
      </div>

      {tokens.length > 0 && (
        <div className="lib-tokens" aria-label="Active filters">
          {tokens.map((t) => (
            <ChipButton key={t.key} onClick={t.clear} aria-label={`Remove filter ${t.label}`}>
              {t.label}
              <Icon name="x" />
            </ChipButton>
          ))}
          <Button variant="quiet" onClick={() => write({ ...EMPTY_FILTERS })}>
            Clear all
          </Button>
        </div>
      )}

      {fields.length > 0 && (
        <ul className="lib-ftiles" aria-label="Fields">
          {orderedFields.map((f) => {
            const tier = fieldTier(f.level);
            const on = filters.fields.includes(f.id);
            const n = ideaCountByField.get(f.id) ?? 0;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  className="card lib-ftile"
                  aria-pressed={on}
                  onClick={() => set({ fields: toggle(filters.fields, f.id) })}
                  title={`${tier.label}: ${tier.blurb}`}
                >
                  <span className="lib-orn" data-m={tierMaterial(f.level) ?? "none"} aria-hidden="true" />
                  <b>{f.name}</b>
                  <span className="t-meta">
                    {tier.tier === "DORMANT" ? "No points yet" : `${tier.label} · ${levelText(f.level)}`}
                  </span>
                  <span className="t-meta">{plural(n, "idea")}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!unfiltered && (
        <p className="t-meta lib-count" aria-live="polite" style={{ marginTop: 14 }}>
          {plural(results.length, "idea")} match
        </p>
      )}

      {sections.length === 0 ? (
        <div className="card lib-empty" style={{ marginTop: 18 }}>
          {ideas.length === 0 ? (
            <>
              <p className="ink-1">Nothing here yet. Your first idea starts the library.</p>
              <Button variant="primary" href="/add" icon="plus">
                New idea
              </Button>
            </>
          ) : (
            <>
              <p className="ink-1">No ideas match these filters.</p>
              <Button variant="secondary" onClick={() => write({ ...EMPTY_FILTERS })}>
                Clear filters
              </Button>
            </>
          )}
        </div>
      ) : (
        sections.map(({ field, ideas: rows }) => {
          const all = expanded.has(field.id);
          const shown = all ? rows : rows.slice(0, SECTION_CAP);
          return (
            <section key={field.id} className="lib-sec" aria-labelledby={`lib-h-${field.id}`}>
              <SectionHeader id={`lib-h-${field.id}`} title={field.name} aside={plural(rows.length, "idea")} />
              <div className="card cv-auto">
                <ul className="lib-list">
                  {shown.map((i) => (
                    <li key={i.id}>
                      <IdeaRow idea={i} now={now} onOpen={openDetail} />
                    </li>
                  ))}
                </ul>
                {rows.length > shown.length && (
                  <Button variant="quiet" className="lib-more" onClick={() => setExpanded((s) => new Set(s).add(field.id))}>
                    Show all {rows.length.toLocaleString("en-GB")}
                  </Button>
                )}
              </div>
            </section>
          );
        })
      )}

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={effective}
        fields={orderedFields}
        allTags={allTags}
        resultCount={results.length}
        archivedCount={counts.archived}
        onChange={(patch) => set(patch)}
        onClear={() => write({ ...EMPTY_FILTERS })}
      />

      <Sheet
        open={openIdea !== null}
        onClose={closeDetail}
        title={openIdea ? ideaHeadline(openIdea) : "Idea"}
        description={openIdea ? `${openIdea.domainName} · ${openIdea.fieldName}` : undefined}
      >
        {openIdea && (
          <>
            <IdeaDetail
              key={openIdea.id}
              idea={openIdea}
              now={now}
              history={histories[openIdea.id] ?? null}
              onDeleted={(id) => {
                setRemoved((s) => new Set(s).add(id));
                closeDetail();
              }}
            />
            <p style={{ marginTop: 12 }}>
              <Link className="link" href={`/library/${openIdea.id}`}>
                Open as a page
              </Link>
            </p>
          </>
        )}
      </Sheet>
      {openId && !openIdea && !removed.has(openId) && <MissingIdea onDone={closeDetail} />}
    </>
  );
}

function IdeaRow({ idea, now, onOpen }: { idea: LibraryIdea; now: number; onOpen: (id: string) => void }) {
  const mastered = isMastered(idea);
  const headline = ideaHeadline(idea);
  return (
    <Link
      href={`/library/${idea.id}`}
      prefetch={false}
      className="lib-idea"
      onClick={(e) => {
        // A plain click opens the sheet; a modifier-click keeps the link's own behaviour.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onOpen(idea.id);
      }}
    >
      <div style={{ minWidth: 0 }}>
        <b>{idea.questionType === "FORMULA" && !idea.title ? <MathText text={headline} /> : headline}</b>
        <span className="t-meta">
          <span>{idea.domainName}</span>
          <span>{idea.isArchived ? "archived" : mastered ? `mastered · ${dueLabel(idea.dueAt, now)}` : dueLabel(idea.dueAt, now)}</span>
          {idea.failedAttempts > 0 && !idea.isArchived && <span>{plural(idea.failedAttempts, "strike")}</span>}
        </span>
      </div>
      <span className="lib-lvl">
        {mastered ? (
          <Chip tone="kept" icon="check">
            Mastered
          </Chip>
        ) : (
          <span aria-label={`Level ${idea.level} of ${MASTERY_LEVEL}`}>L{idea.level}</span>
        )}
      </span>
    </Link>
  );
}

/** ?idea=<id> for an idea that is gone (deleted elsewhere, or a stale link): say so, once. */
function MissingIdea({ onDone }: { onDone: () => void }) {
  return (
    <Sheet open onClose={onDone} title="That idea isn't here" description="It was deleted, or the link is out of date.">
      <Button variant="secondary" onClick={onDone}>
        Back to the library
      </Button>
    </Sheet>
  );
}

// ─── Active filter tokens ───────────────────────────────────────────────────

interface Token {
  key: string;
  label: string;
  clear: () => void;
}

function activeTokens(f: LibraryFilters, fields: LibraryField[], set: (patch: Partial<LibraryFilters>) => void): Token[] {
  const fieldName = new Map(fields.map((x) => [x.id, x.name]));
  const domainName = new Map(fields.flatMap((x) => x.domains.map((d) => [d.id, d.name] as const)));
  const out: Token[] = [];
  for (const id of f.fields) out.push({ key: `f:${id}`, label: fieldName.get(id) ?? "Unknown field", clear: () => set({ fields: toggle(f.fields, id) }) });
  for (const id of f.domains) out.push({ key: `d:${id}`, label: domainName.get(id) ?? "Unknown domain", clear: () => set({ domains: toggle(f.domains, id) }) });
  for (const t of f.tags) out.push({ key: `t:${t}`, label: `#${t}`, clear: () => set({ tags: toggle(f.tags, t) }) });
  for (const t of f.types) out.push({ key: `y:${t}`, label: TYPE_NAME[t], clear: () => set({ types: toggle(f.types, t) }) });
  for (const c of f.cols) out.push({ key: `c:${c}`, label: COLLECTION_NAME[c], clear: () => set({ cols: toggle(f.cols, c) }) });
  for (const b of f.bands) out.push({ key: `b:${b}`, label: DIFFICULTY_META[b].label, clear: () => set({ bands: toggle(f.bands, b) }) });
  if (f.minLevel > 1 || f.maxLevel < MASTERY_LEVEL) {
    out.push({ key: "lv", label: `Level ${f.minLevel}–${f.maxLevel}`, clear: () => set({ minLevel: 1, maxLevel: MASTERY_LEVEL }) });
  }
  return out;
}

// ─── The filter sheet ───────────────────────────────────────────────────────

function FilterSheet({
  open,
  onClose,
  filters: f,
  fields,
  allTags,
  resultCount,
  archivedCount,
  onChange,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  filters: LibraryFilters;
  fields: LibraryField[];
  allTags: string[];
  resultCount: number;
  archivedCount: number;
  onChange: (patch: Partial<LibraryFilters>) => void;
  onClear: () => void;
}) {
  // Domains narrow to the chosen fields, but a domain already chosen is never
  // dropped silently: it stays offered (and as a token) until removed.
  const domainFields = f.fields.length > 0 ? fields.filter((x) => f.fields.includes(x.id)) : fields;
  const offered = domainFields.flatMap((x) => x.domains.map((d) => ({ ...d, field: x.name })));
  const offeredIds = new Set(offered.map((d) => d.id));
  const kept = fields.flatMap((x) => x.domains.map((d) => ({ ...d, field: x.name }))).filter((d) => f.domains.includes(d.id) && !offeredIds.has(d.id));
  const domains = [...offered, ...kept];
  const sameName = new Map<string, number>();
  for (const d of domains) sameName.set(d.name, (sameName.get(d.name) ?? 0) + 1);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filters"
      description="Inside a group any choice matches; across groups, all of them must."
      footer={
        <>
          <Button variant="quiet" onClick={onClear}>
            Clear all
          </Button>
          <Button variant="primary" style={{ flex: 1 }} onClick={onClose}>
            Show {plural(resultCount, "idea")}
          </Button>
        </>
      }
    >
      <div className="lib-facet">
        <span className="t-eyebrow" id="lf-status">
          Show
        </span>
        <div className="lib-opts" role="group" aria-labelledby="lf-status">
          {(["all", "due", "mastered", "struggling", "archived"] as LibraryStatus[]).map((s) => (
            <ChipButton key={s} pressed={f.status === s} onClick={() => onChange({ status: s })}>
              {STATUS_NAME[s]}
              {s === "archived" && archivedCount > 0 ? ` ${archivedCount}` : ""}
            </ChipButton>
          ))}
        </div>
        <p className="st-hint">Struggling: at least one strike since the last recall.</p>
      </div>

      {fields.length > 0 && (
        <Facet title="Fields">
          {fields.map((x) => (
            <ChipButton key={x.id} pressed={f.fields.includes(x.id)} onClick={() => onChange({ fields: toggle(f.fields, x.id) })}>
              {x.name}
            </ChipButton>
          ))}
        </Facet>
      )}

      {domains.length > 0 && (
        <Facet title={f.fields.length > 0 ? "Domains in the chosen fields" : "Domains"}>
          {domains.map((d) => (
            <ChipButton key={d.id} pressed={f.domains.includes(d.id)} onClick={() => onChange({ domains: toggle(f.domains, d.id) })}>
              {d.name}
              {(sameName.get(d.name) ?? 0) > 1 ? ` · ${d.field}` : ""}
            </ChipButton>
          ))}
        </Facet>
      )}

      {allTags.length > 0 && (
        <Facet title="Tags">
          {allTags.map((t) => (
            <ChipButton key={t} pressed={f.tags.includes(t)} onClick={() => onChange({ tags: toggle(f.tags, t) })}>
              #{t}
            </ChipButton>
          ))}
        </Facet>
      )}

      <Facet title="Format">
        {QUESTION_TYPES.map((t: QuestionType) => (
          <ChipButton key={t} pressed={f.types.includes(t)} onClick={() => onChange({ types: toggle(f.types, t) })}>
            {TYPE_NAME[t]}
          </ChipButton>
        ))}
      </Facet>

      <Facet title="Collection">
        {COLLECTION_LABELS.map((c: CollectionLabel) => (
          <ChipButton key={c} pressed={f.cols.includes(c)} onClick={() => onChange({ cols: toggle(f.cols, c) })}>
            {COLLECTION_NAME[c]}
          </ChipButton>
        ))}
      </Facet>

      <Facet title="Difficulty" hint="Unscored ideas drop out while a difficulty is chosen.">
        {DIFFICULTY_BANDS.map((b: DifficultyBand) => (
          <ChipButton key={b} pressed={f.bands.includes(b)} onClick={() => onChange({ bands: toggle(f.bands, b) })}>
            {DIFFICULTY_META[b].label}
          </ChipButton>
        ))}
      </Facet>

      <div className="lib-facet">
        <span className="t-eyebrow">Level</span>
        <div className="lib-range">
          <label className="sr-only" htmlFor="lf-min">
            Lowest level
          </label>
          <input
            id="lf-min"
            className="st-input num"
            type="number"
            inputMode="numeric"
            min={1}
            max={MASTERY_LEVEL}
            value={f.minLevel}
            onChange={(e) => onChange({ minLevel: Math.min(f.maxLevel, Math.max(1, Number(e.target.value) || 1)) })}
          />
          <span className="ink-2" aria-hidden="true">
            to
          </span>
          <label className="sr-only" htmlFor="lf-max">
            Highest level
          </label>
          <input
            id="lf-max"
            className="st-input num"
            type="number"
            inputMode="numeric"
            min={1}
            max={MASTERY_LEVEL}
            value={f.maxLevel}
            onChange={(e) =>
              onChange({ maxLevel: Math.max(f.minLevel, Math.min(MASTERY_LEVEL, Number(e.target.value) || MASTERY_LEVEL)) })
            }
          />
          <span className="t-meta">of {MASTERY_LEVEL}</span>
        </div>
      </div>
    </Sheet>
  );
}

function Facet({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="lib-facet" role="group" aria-label={title}>
      <span className="t-eyebrow">{title}</span>
      <div className="lib-opts">{children}</div>
      {hint && <p className="st-hint">{hint}</p>}
    </div>
  );
}
