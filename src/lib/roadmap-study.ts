/**
 * The Study page's roadmap focus (roadmap contracts §22.20 ruling N14). Pure and client-safe: no database, no clock.
 *
 * On an accepted TOPICS plan the day's study is one topic at a time: the open layer (the lowest layer milestone not
 * reached), its Gemini milestone title when MAP wrote one, and the first of that layer's chosen topics whose Domain is
 * still under OPEN_LEVEL (the level the layer milestone pays at; a topic you marked "I know this" or held when you
 * began is done). The rest of the layer stays folded behind the current one (soft hidden, never removed). The Review
 * hub reads it to offer the topic's due cards and an idea in one tap each.
 */
import { OPEN_LEVEL, type LayerMilestone } from "./roadmap-types";

export interface StudyTopicIn {
  key: string;
  layer: number;
  name: string;
  domainId: string | null;
  chosen: boolean;
  decision: string;
  skipped: boolean;
  held: boolean;
}
export interface StudyMilestoneIn {
  layer: number;
  title: string;
  status: string;
  reached: boolean;
}
export interface StudyDomainIn {
  id: string;
  name: string;
  level: number;
  /** Cards due today in it. */
  due: number;
  /** Live cards in it. */
  cards: number;
}
export interface StudyFocusInput {
  roadmapId: string;
  goal: string;
  fieldId: string | null;
  fieldName: string | null;
  topics: readonly StudyTopicIn[];
  milestones: readonly StudyMilestoneIn[];
  /** RatingRecord.milestones (ruling N8), when MAP wrote them. */
  geminiMilestones: readonly LayerMilestone[];
  domains: readonly StudyDomainIn[];
}

export interface StudyTopic {
  key: string;
  name: string;
  domainId: string;
  level: number;
  /** OPEN_LEVEL: the level the layer milestone pays at. */
  target: number;
  due: number;
  cards: number;
  done: boolean;
}
export interface StudyFocus {
  roadmapId: string;
  goal: string;
  fieldId: string | null;
  fieldName: string | null;
  layer: number;
  layers: number;
  /** Gemini's milestone title for the layer, else "Layer k". */
  title: string;
  /** Gemini wrote the title (the card marks it). */
  geminiTitle: boolean;
  /** The topic to study now; null when every topic of the layer is done (the layer waits for its reach). */
  current: StudyTopic | null;
  /** The layer's other topics, not done first, then done: folded behind `current`. */
  rest: StudyTopic[];
  done: number;
  total: number;
  /** Cards due today across the layer's topics. */
  layerDue: number;
}

const OPEN_STATUSES = new Set(["PLANNED", "STARTING", "STARTED"]);
const live = (t: StudyTopicIn): boolean => t.chosen && t.decision !== "REMOVED" && t.decision !== "MERGED";

/** The focus, or null with no open layer (every layer reached, or no layer milestone at all). Never throws. */
export function studyFocusOf(input: StudyFocusInput): StudyFocus | null {
  try {
    const layers = Math.max(0, ...input.milestones.map((m) => m.layer));
    const open = input.milestones.filter((m) => !m.reached && OPEN_STATUSES.has(m.status)).sort((a, b) => a.layer - b.layer)[0];
    if (!open) return null;
    const byDomain = new Map(input.domains.map((d) => [d.id, d]));
    const topics: StudyTopic[] = input.topics
      .filter((t) => live(t) && t.layer === open.layer && t.domainId && byDomain.has(t.domainId))
      .map((t) => {
        const d = byDomain.get(t.domainId as string) as StudyDomainIn;
        return { key: t.key, name: d.name || t.name, domainId: d.id, level: d.level, target: OPEN_LEVEL, due: d.due, cards: d.cards, done: t.skipped || t.held || d.level >= OPEN_LEVEL };
      });
    const todo = topics.filter((t) => !t.done);
    const finished = topics.filter((t) => t.done);
    const gm = input.geminiMilestones.find((m) => m.layer === open.layer) ?? null;
    return {
      roadmapId: input.roadmapId,
      goal: input.goal,
      fieldId: input.fieldId,
      fieldName: input.fieldName,
      layer: open.layer,
      layers: Math.max(layers, open.layer),
      title: gm?.title || `Layer ${open.layer}`,
      geminiTitle: !!gm?.title,
      current: todo[0] ?? null,
      rest: [...todo.slice(1), ...finished],
      done: finished.length,
      total: topics.length,
      layerDue: topics.reduce((n, t) => n + t.due, 0),
    };
  } catch {
    return null;
  }
}
