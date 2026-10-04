"use client";

/**
 * A topic ("What to learn", F9, F18 §3, F21): the label in its words, its
 * Domain, the Domain's real facts ("Probability: 42 cards · 18 at level 6+")
 * and the user's syllabus line when there is one. A topic is context: the
 * paying card measure counts the milestone's Domains, and the one "how" is
 * fixed: "Write cards on it in <Domain> and review them when due."
 * Topic-level card links are Deferred.
 */
import { ItemRow } from "./ItemRow";
import type { ActTarget } from "./ItemEditor";
import type { LibraryDomain } from "./roadmap-ui-model";

export function TopicRow({
  target,
  stage,
  domainName,
  facts,
}: {
  target: ActTarget;
  stage: "draft" | "outline" | "active" | "start";
  domainName: string | null;
  facts: LibraryDomain | null;
}) {
  const it = target.item;
  const syllabus = it?.syllabusRef != null ? `syllabus line S${it.syllabusRef + 1}` : null;
  const fact = facts ? `${facts.name}: ${facts.cards} ${facts.cards === 1 ? "card" : "cards"} · ${facts.atSix} at level 6+` : null;
  const meta = [fact, syllabus].filter(Boolean).join(" · ");
  return <ItemRow target={target} stage={stage} kindLabel={domainName ? `Topic · ${domainName}` : "Topic"} meta={meta || null} />;
}
