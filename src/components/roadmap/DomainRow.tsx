"use client";

/**
 * A Domain the milestone needs (F9 "Domains needed", F18 §3). An existing
 * Domain shows its real cards, its count at level 6+ and its Domain level as
 * facts, with "See 3 cards" (titles read on the server, never sent to a
 * model) and, once started, "Add a card here" (/add?field=&domain=, F21). A
 * proposed one reads "Not in your library yet" with [Create] [Map to…]
 * [Drop]. A Domain Gemini picked offers [I checked this] and [Map to…]: it
 * sets what counts, the target fitted over it and the names a week quest shows.
 */
import Link from "next/link";
import { useState } from "react";
import { ChipButton } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { Sigil } from "@/components/ui/Icon";
import { provenanceOf } from "@/lib/roadmap-types";
import { addCardHref, libraryDomainHref } from "./roadmap-links";
import { plural } from "./roadmap-copy";
import { ItemRow } from "./ItemRow";
import type { ActTarget } from "./ItemEditor";
import type { LibraryDomain } from "./roadmap-ui-model";

/** "46 cards · 19 at level 6+ · Domain level 5". */
export function domainFactsLine(d: LibraryDomain): string {
  return `${plural(d.cards, "card")} · ${d.atSix} at level 6+ · Domain level ${d.level}`;
}

function SampleSheet({ domain }: { domain: LibraryDomain }) {
  const [open, setOpen] = useState(false);
  const sample = domain.sample ?? [];
  if (sample.length === 0) return null;
  return (
    <>
      {" · "}
      <button type="button" className="rm-ilink" onClick={() => setOpen(true)}>
        See {plural(Math.min(3, sample.length), "card")}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={domain.name} description={`${plural(domain.cards, "card")} in your library · a few of their titles`}>
        <ul className="rm-basis">
          {sample.slice(0, 3).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}

/** The draft's and the Start sheet's Domain item. */
export function DomainItemRow({ target, stage, facts }: { target: ActTarget; stage: "draft" | "outline" | "active" | "start"; facts: LibraryDomain | null }) {
  const { row } = target;
  const cls = provenanceOf(row.origin, row.decision);
  const picked = row.origin === "GEMINI" && !row.proposed && (cls === "DRAFT" || cls === "KEPT_SUGGESTION");
  const kindLabel = row.proposed ? "Domain · proposed" : row.origin === "USER" ? "Domain · created by you" : facts && facts.fieldName ? `Domain · ${facts.fieldName}` : "Domain · in your library";
  const meta = row.proposed ? (
    "Not in your library yet"
  ) : facts ? (
    <>
      <b>{plural(facts.cards, "card")}</b> · <b>{facts.atSix}</b> at level 6+ · Domain level {facts.level}
      <SampleSheet domain={facts} />
    </>
  ) : null;
  return <ItemRow target={target} stage={stage} kindLabel={kindLabel} meta={meta} why={picked ? "Gemini picked this Domain — it sets what counts." : null} />;
}

/** The living roadmap's Domain row (F18 §3): facts plus "Add a card here". */
export function DomainRow({ name, domainId, facts, createdNote }: { name: string; domainId: string; facts: LibraryDomain | null; createdNote?: string | null }) {
  return (
    <div className="rm-dr">
      <Sigil track="know" />
      <div>
        <b>{name}</b>
        {(facts || createdNote) && (
          <div className="t-meta">
            {[facts ? domainFactsLine(facts) : null, createdNote].filter(Boolean).join(" · ")}
            {facts && <SampleSheet domain={facts} />}
          </div>
        )}
        <div className="rm-dr-acts">
          <Link className="chip btn-chip" href={addCardHref(facts?.fieldId ?? null, domainId)}>
            Add a card here
          </Link>
          <Link className="chip btn-chip" href={libraryDomainHref(domainId)}>
            Library
          </Link>
        </div>
      </div>
    </div>
  );
}

export function SetTheBar({ onClick }: { onClick: () => void }) {
  return (
    <ChipButton style={{ minHeight: 40 }} onClick={onClick}>
      Set the bar
    </ChipButton>
  );
}
