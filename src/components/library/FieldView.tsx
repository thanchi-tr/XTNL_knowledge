"use client";

/**
 * Study › Library › a Field (/library/field/[fieldId]): the Field's summary
 * (FieldSummaryView, the pop-up's own), the quick chips All · Due · Fading ·
 * Mastered (URL `show=`, library-model's status family, so a Library link
 * means the same here), then one section per Domain, highest level first:
 * its level and the way to the next, its memory, its last drop, and its ideas
 * most urgent first (forgetting → fading → due → fresh), each with its status
 * chip, its level and what the next level needs.
 *
 * An idea opens in the same sheet as the Library's (IdeaDetail; ?idea=<id> is
 * pushed, so Back closes it); a modifier-click opens /library/[id].
 */
import "./study.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import { Meter } from "@/components/ui/Meter";
import { Sheet } from "@/components/ui/Sheet";
import { SectionHeader } from "@/components/ui/Tabs";
// Revision 5, lane 9 (contracts ruling 67): pv.named after a Domain Gemini named
import { DomainName } from "@/components/glyph/NamedMark";
import { IdeaDetail } from "./IdeaDetail";
import { IdeaRow } from "./IdeaRow";
import { FieldSummaryView } from "./FieldSheet";
import { useIdeaExtras } from "./useIdeaExtras";
import { FIELD_STATUSES, dropText, fadingText, fieldStatusOf, rememberedText, showsDropLine, type DomainSection, type FieldSummary } from "./field-model";
import { STATUS_NAME, URL_KEYS, ideaHeadline, matchesStatus, plural, statusCounts, type LibraryStatus } from "./library-model";

/** Rows shown per Domain before "Show all". */
const DOMAIN_CAP = 40;

export function FieldView({ summary, domains, now }: { summary: FieldSummary; domains: DomainSection[]; now: number }) {
  const params = useSearchParams();
  const status = fieldStatusOf(params.get(URL_KEYS.status));
  const openId = params.get(URL_KEYS.idea);
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const pushedIdea = useRef(false);

  const all = useMemo(() => domains.flatMap((d) => d.ideas).filter((i) => !removed.has(i.id)), [domains, removed]);
  const counts = useMemo(() => statusCounts(all, now), [all, now]);
  const sections = useMemo(
    () =>
      domains
        .map((d) => ({ domain: d, rows: d.ideas.filter((i) => !removed.has(i.id) && matchesStatus(i, status, now)) }))
        // Under All every Domain stands (an empty one says so); a narrower chip shows only Domains with a match.
        .filter((s) => status === "all" || s.rows.length > 0),
    [domains, removed, status, now]
  );

  /** Writes ?show= (and the open idea) without a navigation; All is the default and leaves no key. */
  function urlOf(next: LibraryStatus, idea: string | null): string {
    const p = new URLSearchParams();
    if (next !== "all") p.set(URL_KEYS.status, next);
    if (idea) p.set(URL_KEYS.idea, idea);
    const qs = p.toString();
    return qs ? `?${qs}` : window.location.pathname;
  }

  useEffect(() => {
    if (!openId) pushedIdea.current = false;
  }, [openId]);

  function openDetail(id: string) {
    window.history.pushState(null, "", urlOf(status, id));
    pushedIdea.current = true;
  }

  function closeDetail() {
    if (!openId) return;
    if (pushedIdea.current) {
      pushedIdea.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", urlOf(status, null));
    }
  }

  const openIdea = openId ? (all.find((i) => i.id === openId) ?? null) : null;
  const { history, variants } = useIdeaExtras(openIdea ? openIdea.id : null);

  return (
    <div className="fld-page">
      <header className="card fld-head" aria-label={`${summary.name} at a glance`}>
        <FieldSummaryView summary={summary} now={now} headingLevel="h2" />
      </header>

      <div className="lib-chips" role="group" aria-label="Show">
        {FIELD_STATUSES.map((s) => (
          <ChipButton key={s} pressed={status === s} onClick={() => window.history.replaceState(null, "", urlOf(s, openId))}>
            {STATUS_NAME[s]}
            {s !== "all" && counts[s] > 0 && <span className="num">{counts[s].toLocaleString("en-GB")}</span>}
          </ChipButton>
        ))}
      </div>

      {sections.length === 0 ? (
        <div className="card lib-empty">
          {domains.length === 0 ? (
            <>
              <p className="ink-1">No Domains here yet. A new idea in {summary.name} starts one.</p>
              <Button variant="primary" href="/add" icon="plus">
                New idea
              </Button>
            </>
          ) : (
            <>
              <p className="ink-1">No ideas here are {STATUS_NAME[status].toLowerCase()}.</p>
              <Button variant="secondary" onClick={() => window.history.replaceState(null, "", urlOf("all", null))}>
                Show all
              </Button>
            </>
          )}
        </div>
      ) : (
        sections.map(({ domain: d, rows }) => {
          const showAll = expanded.has(d.id);
          const shown = showAll ? rows : rows.slice(0, DOMAIN_CAP);
          const pct = Math.round(d.progress * 100);
          return (
            <section key={d.id} className="lib-sec fld-dom" aria-labelledby={`fld-d-${d.id}`}>
              <SectionHeader
                id={`fld-d-${d.id}`}
                title={d.geminiNamed ? <DomainName name={d.name} geminiNamed /> : d.name}
                aside={`L${d.level} · ${plural(d.health.ideas, "idea")}`}
              />
              <div className="card cv-auto">
                <div className="fld-dom-meta">
                  <Meter value={d.progress} thin label={`${d.name}, level ${d.level}, ${pct}% of the way to ${d.level + 1}`} />
                  <p className="t-meta fld-line">
                    {pct}% to L{d.level + 1} · {d.heldBy === "depth" ? "mastering its ideas raises it" : d.heldBy === "fading" ? "reviewing its fading ideas raises it" : "points raise it"}
                  </p>
                  <p className="t-meta fld-line">
                    {rememberedText(d.health)}
                    {d.health.ideas > 0 ? ` · ${fadingText(d.health)}` : ""}
                  </p>
                  {d.drop && showsDropLine(d.drop, d.level, now) && <p className="fld-drop">{dropText(d.drop, now)}</p>}
                </div>
                {rows.length === 0 && <p className="st-note fld-none">No ideas in this Domain yet.</p>}
                {shown.length > 0 && (
                  <ul className="lib-list fld-rows">
                    {shown.map((i) => (
                      <li key={i.id}>
                        <IdeaRow idea={i} now={now} onOpen={openDetail} showNeed />
                      </li>
                    ))}
                  </ul>
                )}
                {rows.length > shown.length && (
                  <Button variant="quiet" className="lib-more" onClick={() => setExpanded((s) => new Set(s).add(d.id))}>
                    Show all {rows.length.toLocaleString("en-GB")}
                  </Button>
                )}
              </div>
            </section>
          );
        })
      )}

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
              history={history}
              variants={variants}
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
    </div>
  );
}
