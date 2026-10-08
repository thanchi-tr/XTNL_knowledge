/**
 * The topic map's view model (roadmap revision 5, lane 9; contracts §22.3,
 * §22.11; ui-motion.md §15.4–§15.6). Pure and client-safe: it reads only
 * the view lane 8 builds (TopicMapView, RatingView, MilestoneRowView), and
 * holds no copy beyond roadmap-copy's.
 *
 *   topicMarkOf(cls)                 the row's 16 px class mark (§22.11's table)
 *   layerChipOf(layer)               the one who-word chip a layer header carries (D37), or null
 *   traceOf(map, key)                which rows a traced row lights: its parents and children
 *   rowStartsUnchosen(row)           a layer-1 row that carries the checkbox (ruling 62)
 *   estimateChipOf(rating)           which estimate chip, its label, and the "yours" figure
 *   acceptTopicChoicesOf(map, all)   what an accept's confirm names (AcceptTopicChoices)
 *   railNodeTopicFieldsOf(row)       a milestone row's TOPICS fields for RouteRail
 *   topicPlansOn(gates), topicNamesOn(gates)   the switches as a surface reads them
 */
import type { MarkRef } from "@/components/glyph/Glyph";
import type { HonestyKind } from "@/components/glyph/HonestyChip";
import {
  RATING_ORIGINS,
  TOPIC_PLANS_LIVE,
  topicSwitchesOf,
  type AcceptTopicChoices,
  type MilestoneRowView,
  type RatingView,
  type TopicClass,
  type TopicLayerView,
  type TopicMapView,
  type TopicRowView,
} from "@/lib/roadmap-types";
import {
  GEMINI_KEPT_BY_YOU_LABEL,
  GEMINI_PICKED_DOMAIN_LABEL,
  GEMINI_PLACED_LABEL,
  estimateGeminiLabel,
  estimateUnsureLabel,
  geminiLinkedLabel,
  ESTIMATE_APP_LABEL,
} from "./roadmap-copy";

/** The revision-5 switches a fixture may turn on for a lead-only state (the build's switches stay off; the server still refuses). */
export interface TopicGates {
  /** TOPIC_PLANS_LIVE. */
  topics?: boolean;
  /** topicSwitchesOf().names (Gemini names shown on the map). */
  topicNames?: boolean;
}

export function topicPlansOn(gates?: TopicGates | null): boolean {
  return gates?.topics ?? TOPIC_PLANS_LIVE;
}
/**
 * Ruling N11: the topic map's Gemini chain is offered ([Break it down], the one-tap [Break into topics]): the server's
 * own gate (`topicGemini`: the topic switches and a key, never ROADMAP_GEMINI_LIVE). A fixture's lead-only state
 * (gates.topics) reads its `gemini` and the view's hasKey instead.
 */
export function topicGeminiOn(view: { hasKey: boolean; topicGemini?: boolean }, gates?: { topics?: boolean; gemini?: boolean } | null): boolean {
  if (!topicPlansOn(gates)) return false;
  return gates?.topics === true ? Boolean(gates.gemini) && view.hasKey : topicSwitchesOf().rate && view.topicGemini === true;
}
export function topicNamesOn(gates?: TopicGates | null): boolean {
  return gates?.topicNames ?? topicSwitchesOf().names;
}

// ─── Classes and marks (§22.11) ───

/** The row's class mark (16 px). */
export const TOPIC_MARK: Readonly<Record<TopicClass, MarkRef>> = {
  SYLLABUS: "pv.syllabus",
  YOURS: "pv.you",
  LIBRARY: "pv.library",
  AIM: "m.quote",
  PICKED: "pv.libpick",
  LINKED: "pv.web",
  LINKED_ONE: "pv.web",
  NOT_CHECKED: "pv.suggest",
  KEPT: "pv.kept",
  KEPT_NOT_CHECKED: "pv.kept",
};
export function topicMarkOf(cls: TopicClass): MarkRef {
  return TOPIC_MARK[cls];
}
/** A name the user owns as words (exempt as own words): an outline line, your typing, your aim's span. */
export function isOwnWords(cls: TopicClass): boolean {
  return cls === "SYLLABUS" || cls === "YOURS" || cls === "AIM";
}
/** A Gemini name (the who-word must stay reachable on the card: the layer chip and the row's sheet). */
export function isGeminiName(cls: TopicClass): boolean {
  return cls === "LINKED" || cls === "LINKED_ONE" || cls === "NOT_CHECKED" || cls === "KEPT" || cls === "KEPT_NOT_CHECKED" || cls === "PICKED";
}
/** Your words or your Domain placed by Gemini in a layer not yet kept: «Gemini placed it · not checked» (ruling 62). */
export function placedByGeminiOf(row: Pick<TopicRowView, "cls" | "placed">, layerKept: boolean): boolean {
  return !layerKept && row.placed === "GEMINI" && (row.cls === "SYLLABUS" || row.cls === "LIBRARY" || row.cls === "AIM");
}

/** The row's own chip (TopicSheet, a button with its full words), or null for a row whose mark needs none. */
export function rowChipOf(row: TopicRowView, layerKept: boolean): { kind: HonestyKind; label: string } | null {
  switch (row.cls) {
    case "LINKED":
      return { kind: "gemini-linked", label: geminiLinkedLabel(Math.max(row.sources.length, 2)) };
    case "LINKED_ONE":
      // ruling N3: a Gemini name Google linked to exactly 1 source
      return { kind: "gemini-linked-one", label: geminiLinkedLabel(1) };
    case "PICKED":
      return { kind: "gemini-picked-domain", label: GEMINI_PICKED_DOMAIN_LABEL };
    case "NOT_CHECKED":
      return { kind: "gemini", label: "Gemini · not checked" };
    case "KEPT":
      return { kind: "gemini-kept-by-you", label: GEMINI_KEPT_BY_YOU_LABEL };
    case "KEPT_NOT_CHECKED":
      return { kind: "gemini-kept", label: "Gemini · kept · not checked" };
    default:
      return placedByGeminiOf(row, layerKept) ? { kind: "gemini-placed", label: GEMINI_PLACED_LABEL } : null;
  }
}

/**
 * The one who-word chip of a layer header (D37), the first that applies: gemini-linked (while a LINKED or LINKED_ONE
 * row is unkept; n = the layer's smallest, gemini-linked-one at 1: ruling N3), gemini-picked-domain, gemini-placed,
 * gemini-kept-by-you, gemini-kept.
 */
export function layerChipOf(layer: Pick<TopicLayerView, "topics" | "kept">): { kind: HonestyKind; label: string } | null {
  const rows = layer.topics;
  const linked = rows.filter((r) => r.cls === "LINKED" || r.cls === "LINKED_ONE");
  if (linked.length > 0 && !layer.kept) {
    const n = Math.min(...linked.map((r) => (r.cls === "LINKED_ONE" ? 1 : Math.max(2, r.sources.length))));
    return n === 1 ? { kind: "gemini-linked-one", label: geminiLinkedLabel(1) } : { kind: "gemini-linked", label: geminiLinkedLabel(n) };
  }
  if (rows.some((r) => r.cls === "PICKED")) return { kind: "gemini-picked-domain", label: GEMINI_PICKED_DOMAIN_LABEL };
  if (rows.some((r) => placedByGeminiOf(r, layer.kept))) return { kind: "gemini-placed", label: GEMINI_PLACED_LABEL };
  if (rows.some((r) => r.cls === "KEPT" || ((r.cls === "LINKED" || r.cls === "LINKED_ONE") && layer.kept))) return { kind: "gemini-kept-by-you", label: GEMINI_KEPT_BY_YOU_LABEL };
  if (rows.some((r) => r.cls === "KEPT_NOT_CHECKED")) return { kind: "gemini-kept", label: "Gemini · kept · not checked" };
  return null;
}

/** A layer-1 row that starts unchosen and carries the 44 px checkbox: PICKED names, LINKED_ONE names (ruling N3) and revealed NOT_CHECKED names (ruling 62). */
export function rowStartsUnchosen(row: Pick<TopicRowView, "cls">): boolean {
  return row.cls === "PICKED" || row.cls === "LINKED_ONE" || row.cls === "NOT_CHECKED";
}
/** Whether the row shows the "in plan" checkbox: from layer 2 on, and layer 1's rows that start unchosen. */
export function rowHasCheckbox(row: Pick<TopicRowView, "cls" | "layer">): boolean {
  return row.layer > 1 || rowStartsUnchosen(row);
}

// ─── Trace (§15.5) ───

/** Every row of the map, by key. */
export function rowsByKey(map: Pick<TopicMapView, "layers">): Map<string, TopicRowView> {
  const out = new Map<string, TopicRowView>();
  for (const l of map.layers) for (const r of l.topics) out.set(r.key, r);
  return out;
}

/** The rows a traced row lights: its parents ("after layer k" means the whole layer above) and its children. */
export function traceOf(map: Pick<TopicMapView, "layers">, key: string | null): { self: string | null; related: Set<string> } {
  const related = new Set<string>();
  if (!key) return { self: null, related };
  const rows = rowsByKey(map);
  const row = rows.get(key);
  if (!row) return { self: null, related };
  if (row.parents.kind === "LINKS") row.parents.keys.forEach((k) => related.add(k));
  else {
    const above = map.layers.find((l) => l.layer === (row.parents.kind === "LAYER" ? row.parents.layer : row.layer - 1));
    above?.topics.forEach((r) => related.add(r.key));
  }
  row.children.forEach((k) => related.add(k));
  // a child that builds on the whole layer above lights too
  for (const r of rows.values()) if (r.parents.kind === "LAYER" && r.parents.layer === row.layer) related.add(r.key);
  related.delete(key);
  return { self: key, related };
}

/** The trace's spoken line for a row: "builds on: A, B" (cross-goal parents too) or "after layer k". */
export function parentNamesOf(map: Pick<TopicMapView, "layers">, row: TopicRowView): { names: string[]; afterLayer: number | null } {
  if (row.parents.kind === "LAYER") return { names: [], afterLayer: row.parents.layer };
  const rows = rowsByKey(map);
  const names = row.parents.keys.map((k) => rows.get(k)?.name).filter((n): n is string => typeof n === "string");
  return { names: [...names, ...row.parents.crossGoal.map((c) => c.name)], afterLayer: null };
}

// ─── The estimate (§15.4) ───

export interface EstimateChipModel {
  kind: "estimate-gemini" | "estimate-unsure" | "estimate-app";
  label: string;
  /** "[pv.you] 4 layers · yours" first, when the plan's layers are yours (a SET or FEWER change). */
  yours: number | null;
  /** The pips: the layers shown solid (Gemini's own number beside "yours"; the plan's otherwise). */
  pips: number;
  /** "· its map filled n" when Gemini's map filled fewer than its estimate. */
  mapFilled: number | null;
  unsure: { low: number; high: number } | null;
}

export function estimateChipOf(r: RatingView): EstimateChipModel {
  const yoursChange = r.changes.some((c) => c.kind === "SET" || c.kind === "FEWER");
  const yours = r.origin === "YOURS" || yoursChange ? r.layers : null;
  // RATING_ORIGINS[1]: code's estimate (the literal origin is written only in realism and the catalog).
  if (r.origin === RATING_ORIGINS[1] || (r.geminiLayers == null && r.unsure == null)) {
    return { kind: "estimate-app", label: ESTIMATE_APP_LABEL, yours, pips: r.appEstimate, mapFilled: null, unsure: null };
  }
  const gemini = r.geminiLayers ?? r.layers;
  const mapFilled = r.mapFilled != null && r.geminiLayers != null && r.mapFilled < r.geminiLayers ? r.mapFilled : null;
  if (r.unsure) return { kind: "estimate-unsure", label: estimateUnsureLabel(r.unsure.low, r.unsure.high), yours, pips: gemini, mapFilled, unsure: r.unsure };
  return { kind: "estimate-gemini", label: estimateGeminiLabel(gemini), yours, pips: gemini, mapFilled, unsure: null };
}

// ─── Accept (§22.14: the confirm must name what accept does) ───

/** The chosen topics a TOPICS accept turns into Domains: every chosen topic with no bound Domain. */
export function topicsToCreateOf(map: Pick<TopicMapView, "layers">): TopicRowView[] {
  return map.layers.flatMap((l) => l.topics.filter((r) => r.chosen && r.domain == null));
}

/**
 * What [Accept all] (keepAll) or a plain accept names: the Domains it creates, the Gemini names among them, what it keeps.
 * keepAll is exactly the server's list (TopicMapView.acceptAll, the rule acceptCore's keptAllOf compares), so the two
 * never differ (a differing set refuses RACED); a fixture's map without it is read from its rows.
 */
export function acceptTopicChoicesOf(map: Pick<TopicMapView, "layers" | "acceptAll">, opts: { keepAll: boolean; aftercare: "KEEP" | "ARCHIVE" | null }): AcceptTopicChoices {
  const unkept = map.layers.filter((l) => !l.kept);
  const list = acceptAllListOf(map);
  const keepAll = opts.keepAll && (unkept.length > 0 || list.length > 0) ? { names: list.flatMap((x) => [...x.names, ...(x.unchecked ?? [])]), links: list.reduce((a, x) => a + x.links, 0) } : null;
  // Ruling N17: [Accept all] ticks every name it lists, so the Domains it creates count those too (the server's toCreateOf after keptAllOf).
  const ticked = keepAll ? acceptAllTickedOf(map, list) : [];
  const create = [...topicsToCreateOf(map), ...ticked.filter((r) => r.domain == null)];
  const geminiNamed = create.filter((r) => isGeminiName(r.cls)).map((r) => r.name);
  return { create: create.length, geminiNamed, keepAll, aftercare: opts.aftercare };
}

/** The rows [Accept all] ticks that aren't ticked yet: the listed Gemini names of each layer (and its not-checked ones). */
export function acceptAllTickedOf(map: Pick<TopicMapView, "layers">, list: readonly { layer: number; names: string[]; unchecked?: string[] }[]): TopicRowView[] {
  return list.flatMap((x) => {
    const named = new Set([...x.names, ...(x.unchecked ?? [])]);
    const layer = map.layers.find((l) => l.layer === x.layer);
    return (layer?.topics ?? []).filter((r) => !r.chosen && named.has(r.name) && isGeminiName(r.cls) && r.cls !== "KEPT" && r.cls !== "KEPT_NOT_CHECKED");
  });
}

/** [Accept all]'s list, layer by layer: the Gemini names it puts in the plan, a layer's not-checked ones when it shows nothing else, and the not-checked links it keeps (the server's own list when the view carries it). */
export function acceptAllListOf(map: Pick<TopicMapView, "layers" | "acceptAll">): { layer: number; names: string[]; links: number; unchecked?: string[] }[] {
  if (map.acceptAll) return map.acceptAll.map((x) => ({ layer: x.layer, names: [...x.names], links: x.links, ...(x.unchecked?.length ? { unchecked: [...x.unchecked] } : {}) }));
  return map.layers
    .filter((l) => !l.kept)
    .map((l) => ({
      layer: l.layer,
      names: l.topics.filter((r) => r.chosen && isGeminiName(r.cls)).map((r) => r.name),
      links: l.topics.filter((r) => r.chosen && r.parents.kind === "LINKS" && r.placed === "GEMINI").reduce((b, r) => b + (r.parents.kind === "LINKS" ? r.parents.keys.length : 0), 0),
    }))
    .filter((x) => x.names.length > 0 || x.links > 0);
}

// ─── The chain (§15.6) ───

/** A milestone row's TOPICS fields as RouteRail reads them; {} on a LEVELS row (so its node is unchanged). */
export function railNodeTopicFieldsOf(row: Pick<MilestoneRowView, "layer" | "chainRole" | "opensAfter" | "held" | "known" | "state">): {
  layer?: number | null;
  chainRole?: "LAYER" | "DEPTH" | null;
  opensAfter?: number | null;
  heldLayer?: boolean;
  known?: boolean;
} {
  if (row.layer == null && row.chainRole == null) return {};
  return {
    layer: row.chainRole === "DEPTH" ? null : (row.layer ?? null),
    chainRole: row.chainRole ?? null,
    opensAfter: row.state === "PLANNED" ? (row.opensAfter ?? null) : null,
    heldLayer: row.held === true && row.chainRole !== "DEPTH" ? true : undefined,
    known: row.known === true ? true : undefined,
  };
}
