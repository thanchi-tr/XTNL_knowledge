/**
 * The Study page's roadmap focus (roadmap contracts §22.20 ruling N14). Pure and client-safe: no database, no clock.
 *
 * On an accepted TOPICS plan the day's study is one topic at a time: the open layer (the lowest layer milestone not
 * reached), its Gemini milestone title when MAP wrote one, and the first of that layer's chosen topics not yet done.
 * Ruling N25 (roadmap rework 1): a topic is done when its Domain holds TOPIC_FLOOR_CARDS live cards at OPEN_LEVEL or
 * above (roadmap-types topicDoneOf: exactly the gate's count, never Domain.level), or you marked it "I know this" or
 * held it when you began; the card shows "n of 8". The rest of the layer stays folded behind the current one (soft
 * hidden, never removed). The Review hub reads it to offer the topic's due cards and an idea in one tap each.
 *
 * Blueprint P15 (the layer-1 focus): a layer milestone is only ever reached once it was started, and nothing starts
 * while ROADMAP_GOALS_LIVE is off, so "the lowest layer not reached" stayed on layer 1 for good, its topics all done
 * and `current` null. The study moves on with the topics: the open layer is the lowest one not reached that still has
 * a topic to do; only when no layer has one does the focus stay on the lowest not reached, waiting for its reach.
 *
 * A locked layer (ruling N27): the layer before it is not reached and a parent in it is short of cards, so the lowest
 * layer not reached with a topic to do is that one, and the hub lands on its first topic to do: the parent the hero
 * names ("Add n cards to <parent>") whenever the lock is the whole layer before (the live maps' case: EDGE_DRAW is
 * rarely met); with a drawn or picked link the hero names the first unmet parent, which may sit later in this order.
 */
import { TOPIC_FLOOR_CARDS, topicDoneOf, type LayerMilestone } from "./roadmap-types";

export interface StudyTopicIn {
  key: string;
  layer: number;
  name: string;
  domainId: string | null;
  chosen: boolean;
  decision: string;
  skipped: boolean;
  held: boolean;
  /** The row's paying target for this topic (RoadmapMeasure.target of its PAYS CARDS_AT_LEVEL measure): n_d on the last layer's specialisation, "n of 25"; absent: TOPIC_FLOOR_CARDS (the review round). */
  floor?: number;
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
  /** Live recall cards at OPEN_LEVEL or above in it (roadmap-types cardsAtOpenCountOf: the gate's count; a MULTI card never counts). */
  atOpen: number;
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
  /** Live cards at OPEN_LEVEL or above in its Domain: the "n" of "n of 8". */
  cards: number;
  /** TOPIC_FLOOR_CARDS, the "8"; the row's paying target on the last layer's specialisation, "25". */
  floor: number;
  due: number;
  /** Live cards in its Domain, at any level. */
  live: number;
  /** topicDoneOf(cards, floor), or marked known or held. */
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
  /** The topic to study now; null when no layer not reached has a topic left (the lowest one waits for its reach). */
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
    const notReached = input.milestones.filter((m) => !m.reached && OPEN_STATUSES.has(m.status)).sort((a, b) => a.layer - b.layer);
    if (notReached.length === 0) return null;
    const byDomain = new Map(input.domains.map((d) => [d.id, d]));
    const topicsOf = (layer: number): StudyTopic[] =>
      input.topics
        .filter((t) => live(t) && t.layer === layer && t.domainId && byDomain.has(t.domainId))
        .map((t) => {
          const d = byDomain.get(t.domainId as string) as StudyDomainIn;
          const floor = t.floor ?? TOPIC_FLOOR_CARDS;
          return { key: t.key, name: d.name || t.name, domainId: d.id, cards: d.atOpen, floor, due: d.due, live: d.cards, done: t.skipped || t.held || topicDoneOf(d.atOpen, floor) };
        });
    // The lowest layer not reached with a topic still to do (P15); else the lowest not reached, waiting for its reach.
    const open = notReached.find((m) => topicsOf(m.layer).some((t) => !t.done)) ?? notReached[0];
    const topics = topicsOf(open.layer);
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
