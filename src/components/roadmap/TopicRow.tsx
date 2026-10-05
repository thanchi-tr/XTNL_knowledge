"use client";

/**
 * A topic ("What to learn", F9, F18 §3, F21): the label in its words, its
 * Domain, the Domain's real facts ("Probability: 42 cards · 18 at level 6+")
 * and the user's syllabus line when there is one. A topic is context: the
 * paying card measure counts the milestone's Domains, and the one "how" is
 * fixed: "Write cards on it in <Domain> and review them when due."
 * Topic-level card links are Deferred.
 *
 * Revision 4 (F-R4-21, F-R4-24): on a keys-only draft every topic is a line
 * of the user's own outline ("Outline line S4 · Inference", or "· not tied
 * to a Domain"). Which milestone it sits in may be Gemini's arrangement, so a
 * line can be moved to another milestone ([Move…], moveLine); which Domain it
 * belongs to is the user's, prefilled by a deterministic match, and changed
 * here ([Domain…], setLineDomain: coverage is worked out again and the plan
 * re-dated).
 */
import { useState } from "react";
import { ChipButton } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { Icon } from "@/components/ui/Icon";
import { ActionError } from "@/components/home/ActionError";
import { LINE_NO_DOMAIN } from "./roadmap-copy";
import { useRoadmapAction } from "./roadmap-runtime";
import { ItemRow } from "./ItemRow";
import type { ActTarget } from "./ItemEditor";
import type { LibraryDomain } from "./roadmap-ui-model";

/** What a keys-only draft's outline line can be moved to: the version's other open milestones, and the plan's Domains. */
export interface OutlineMoves {
  roadmapId: string;
  milestones: readonly { id: string; label: string }[];
  domains: readonly { id: string; name: string }[];
}

function LineControls({ target, moves }: { target: ActTarget; moves: OutlineMoves }) {
  const it = target.item!;
  const [sheet, setSheet] = useState<"MOVE" | "DOMAIN" | null>(null);
  const { run, pending, error } = useRoadmapAction();
  const others = moves.milestones.filter((m) => m.id !== target.milestone.id);
  const line = it.syllabusRef;
  return (
    <>
      <div className="rm-acts">
        {others.length > 0 && <ChipButton onClick={() => setSheet("MOVE")}>Move…</ChipButton>}
        {line != null && moves.domains.length > 0 && <ChipButton onClick={() => setSheet("DOMAIN")}>Domain…</ChipButton>}
      </div>
      {error && <ActionError>{error}</ActionError>}
      <Sheet open={sheet === "MOVE"} onClose={() => setSheet(null)} title="Move this outline line" description={it.label}>
        <div className="rm-pick-list">
          {others.map((m) => (
            <button key={m.id} type="button" className="rm-pick" disabled={pending} onClick={() => run((a) => a.moveLine(it.id ?? it.lineageId, m.id), () => setSheet(null))}>
              <span className="rm-pick-t">
                <b>{m.label}</b>
              </span>
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={sheet === "DOMAIN"} onClose={() => setSheet(null)} title="Which Domain is this line?" description="Yours to say: its Domain's card count is worked out from it, and the plan is dated again.">
        <div className="rm-pick-list">
          {[...moves.domains.map((d) => ({ id: d.id as string | null, name: d.name })), { id: null, name: LINE_NO_DOMAIN }].map((d) => (
            <button
              key={d.id ?? "none"}
              type="button"
              className="rm-pick"
              aria-pressed={(it.domainId ?? null) === d.id}
              disabled={pending || line == null}
              onClick={() => line != null && run((a) => a.setLineDomain(moves.roadmapId, line, d.id), () => setSheet(null))}
            >
              <span className="rm-pick-t">
                <b>{d.name}</b>
              </span>
              {(it.domainId ?? null) === d.id && <Icon name="check" />}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

export function TopicRow({
  target,
  stage,
  domainName,
  facts,
  moves,
}: {
  target: ActTarget;
  stage: "draft" | "outline" | "active" | "start";
  domainName: string | null;
  facts: LibraryDomain | null;
  /** A keys-only draft's outline line: [Move…] and [Domain…] (never on a started milestone). */
  moves?: OutlineMoves | null;
}) {
  const it = target.item;
  const outlineLine = it?.origin === "SYLLABUS" && it.syllabusRef != null;
  const syllabus = it?.syllabusRef != null && !moves ? `syllabus line S${it.syllabusRef + 1}` : null;
  const fact = facts ? `${facts.name}: ${facts.cards} ${facts.cards === 1 ? "card" : "cards"} · ${facts.atSix} at level 6+` : null;
  const meta = [fact, syllabus].filter(Boolean).join(" · ");
  const kindLabel = moves && outlineLine ? `Outline line S${(it?.syllabusRef ?? 0) + 1} · ${domainName ?? LINE_NO_DOMAIN.toLowerCase()}` : domainName ? `Topic · ${domainName}` : "Topic";
  return (
    <ItemRow target={target} stage={stage} kindLabel={kindLabel} meta={meta || (moves && outlineLine && !domainName ? "counted in every Domain's figure; no card is checked against it" : null)}>
      {moves && outlineLine && stage !== "outline" && <LineControls target={target} moves={moves} />}
    </ItemRow>
  );
}
