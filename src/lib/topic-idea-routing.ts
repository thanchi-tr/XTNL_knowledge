/**
 * An idea's roadmap topic, by its words (roadmap contracts §22.20 ruling N10). Pure and client-safe: no database, no
 * model, no clock.
 *
 * Ideas are filed by meaning: the nearest existing Idea's Domain takes a new one (domain-discovery routeFromNearest),
 * and an idea near none gets a new Domain named by Gemini (createNoveltyDomain). A roadmap topic's Domain starts
 * empty (made by accept or by [Add an idea here]), so the nearest-Idea search can never reach it, and the first idea
 * about "offset accounts" would land in a new Domain beside the goal's own "Offset Accounts". So, before a new Domain
 * is made, the idea is read against the Domains your open goals hold in that Field: a Domain whose every content stem
 * (roadmap-validate contentStemsOf: function words and DOMAIN_STOP_WORDS out, then stemmed) is in the idea's text takes
 * it. The most stems matched wins (the narrower topic), then the longer name, then the order given. Nothing changes
 * when the nearest Idea already decided (EXPANSION, SATURATION) or when you placed the idea yourself (MANUAL).
 */
import { contentStemsOf } from "./roadmap-validate";

export interface TopicDomainCandidate {
  domainId: string;
  name: string;
}

/** The goal topic Domain an idea's words name, or null. */
export function topicDomainForIdea(contentText: string, candidates: readonly TopicDomainCandidate[]): TopicDomainCandidate | null {
  try {
    if (typeof contentText !== "string" || contentText.trim() === "") return null;
    const have = new Set(contentStemsOf(contentText));
    if (have.size === 0) return null;
    let best: { c: TopicDomainCandidate; n: number; len: number } | null = null;
    const seen = new Set<string>();
    for (const c of Array.isArray(candidates) ? candidates : []) {
      if (!c || typeof c.domainId !== "string" || typeof c.name !== "string" || seen.has(c.domainId)) continue;
      seen.add(c.domainId);
      const need = Array.from(new Set(contentStemsOf(c.name)));
      if (need.length === 0 || !need.every((s) => have.has(s))) continue;
      const len = Array.from(c.name).length;
      if (!best || need.length > best.n || (need.length === best.n && len > best.len)) best = { c, n: need.length, len };
    }
    return best ? best.c : null;
  } catch {
    return null;
  }
}
