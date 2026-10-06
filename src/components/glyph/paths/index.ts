/**
 * The glyph catalogue (ui-motion.md §4): the GlyphName union, the family
 * registry glyph-check reads, and which families are static (D3).
 *
 *   Inline (can animate): stage, rank, quest, verdict, the Gemini provenance
 *   glyphs (pv.suggest / kept / pick / integrity), misc, flame.
 *   Static (<symbol>s in the route's GlyphDefs, drawn with <use>): evidence,
 *   safety, session, time, and the ProvMark glyphs (pv.app / you / checked /
 *   syllabus) — the "provmark" defs family.
 *
 *   glyphParts(name, state, opts) → Part[]   the parts for one glyph in one state
 *
 * Revision 5, lane 9 (ui-motion.md §15.1, D38): the `layer` family is inline (it animates
 * layer-open); pv.web and pv.libpick join the inline Gemini glyphs; pv.library and pv.named join the
 * provmark defs; the `goal` family is static, in its own defs family, `goal`.
 */
import { EVIDENCE, EVIDENCE_NAMES, type EvidenceName } from "./evidence";
import { FLAME_ALIAS, FLAME_NAMES, flameParts, type FlameAlias, type FlameName } from "./flame";
import { GOAL_NAMES, goalParts, type GoalName } from "./goal";
import { LAYER_NAMES, layerParts, type LayerName } from "./layer";
import { MISC, MISC_NAMES, type MiscName } from "./misc";
import { GLYPH_STATES, P, flatParts, withState, type GlyphState, type Part } from "./part";
import { GEMINI_PV_NAMES, PROVENANCE, PROVMARK_NAMES, type ProvenanceName } from "./provenance";
import { QUEST_NAMES, questParts, type QuestName, type TrackSigil } from "./quest";
import { RANK_NAMES, rankParts, type RankName } from "./rank";
import { SAFETY, SAFETY_NAMES, STRIKE, type SafetyName } from "./safety";
import { SESSION, SESSION_NAMES, type SessionName } from "./session";
import { STAGE_NAMES, stageParts, type StageGate, type StageName } from "./stage";
import { TIME_NAMES, timeParts, type TimeName } from "./time";
import { VERDICT, VERDICT_NAMES, type VerdictName } from "./verdict";

export { GLYPH_STATES, flatParts, type GlyphState, type Part };
export type { FlameAlias, StageGate, TrackSigil };
export { FLAME_ALIAS };

export type FamilyId = "stage" | "rank" | "quest" | "evidence" | "provenance" | "safety" | "session" | "verdict" | "time" | "misc" | "flame" | "layer" | "goal";
/** The static families GlyphDefs can emit (revision 5 adds `goal`). */
export type DefsFamily = "evidence" | "safety" | "session" | "time" | "provmark" | "goal";
export const DEFS_FAMILIES: readonly DefsFamily[] = ["evidence", "safety", "session", "time", "provmark", "goal"];

export type GlyphName = StageName | RankName | QuestName | EvidenceName | ProvenanceName | SafetyName | SessionName | VerdictName | TimeName | MiscName | FlameName | LayerName | GoalName;
export type { GoalName, LayerName };

export interface GlyphInfo {
  family: FamilyId;
  /** The GlyphDefs family a static glyph is delivered by; null for an inline (animatable) glyph. */
  defs: DefsFamily | null;
}

const info = (family: FamilyId, defs: DefsFamily | null): GlyphInfo => ({ family, defs });

/** Each glyph's family and delivery. Its words live in ./means (the gallery and card Keys), so they never ship with a glyph. */
export const GLYPH_INFO: Readonly<Record<GlyphName, GlyphInfo>> = {
  "stage.foundation": info("stage", null),
  "stage.familiar": info("stage", null),
  "stage.retained": info("stage", null),
  "stage.fluent": info("stage", null),
  "stage.mastered": info("stage", null),
  "stage.toward": info("stage", null),
  "stage.part": info("stage", null),
  "stage.track": info("stage", null),
  "rank.0": info("rank", null),
  "rank.1": info("rank", null),
  "rank.2": info("rank", null),
  "rank.3": info("rank", null),
  "rank.4": info("rank", null),
  "rank.5": info("rank", null),
  "rank.6": info("rank", null),
  "quest.bring": info("quest", null),
  "quest.add": info("quest", null),
  "quest.practice": info("quest", null),
  "quest.step": info("quest", null),
  "quest.checkpoint": info("quest", null),
  "ev.tested": info("evidence", "evidence"),
  "ev.counted": info("evidence", "evidence"),
  "ev.tick": info("evidence", "evidence"),
  "ev.log": info("evidence", "evidence"),
  "ev.estimate": info("evidence", "evidence"),
  "ev.measured": info("evidence", "evidence"),
  "pv.suggest": info("provenance", null),
  "pv.kept": info("provenance", null),
  "pv.pick": info("provenance", null),
  "pv.integrity": info("provenance", null),
  "pv.app": info("provenance", "provmark"),
  "pv.you": info("provenance", "provmark"),
  "pv.checked": info("provenance", "provmark"),
  "pv.syllabus": info("provenance", "provmark"),
  // ── Revision 5, lane 9 ──
  "pv.web": info("provenance", null),
  "pv.libpick": info("provenance", null),
  "pv.library": info("provenance", "provmark"),
  "pv.named": info("provenance", "provmark"),
  "safe.health": info("safety", "safety"),
  "safe.strike": info("safety", "safety"),
  "safe.in": info("safety", "safety"),
  "safe.ask": info("safety", "safety"),
  "m.quote": info("safety", "safety"),
  "m.verbatim": info("safety", "safety"),
  "m.policy": info("safety", "safety"),
  "m.judge": info("safety", "safety"),
  "m.nopay": info("safety", "safety"),
  "m.clash": info("safety", "safety"),
  "sess.easy": info("session", "session"),
  "sess.mobility": info("session", "session"),
  "sess.technique": info("session", "session"),
  "sess.harder": info("session", "session"),
  "sess.longer": info("session", "session"),
  "sess.strength": info("session", "session"),
  "sess.full": info("session", "session"),
  "sess.perf": info("session", "session"),
  "v.fits": info("verdict", null),
  "v.tight": info("verdict", null),
  "v.over": info("verdict", null),
  "v.imp": info("verdict", null),
  "v.fitted": info("verdict", null),
  "v.unv": info("verdict", null),
  "t.cal": info("time", "time"),
  "t.cal-moved": info("time", "time"),
  "t.pin": info("time", "time"),
  "t.earliest": info("time", "time"),
  "t.span": info("time", "time"),
  "t.hourglass": info("time", "time"),
  "pace.on": info("time", "time"),
  "pace.behind": info("time", "time"),
  "m.link": info("misc", null),
  "m.builds": info("misc", null),
  "m.lock": info("misc", null),
  "m.seal": info("misc", null),
  "m.queue": info("misc", null),
  "m.pause": info("misc", null),
  "intensity.light": info("misc", null),
  "intensity.steady": info("misc", null),
  "intensity.push": info("misc", null),
  route: info("misc", null),
  "route.weave": info("misc", null),
  "m.minus": info("misc", null),
  "m.down": info("misc", null),
  "m.info": info("misc", null),
  flame: info("flame", null),
  // ── Revision 5, lane 9 ──
  "layer.1": info("layer", null),
  "layer.2": info("layer", null),
  "layer.3": info("layer", null),
  "layer.4": info("layer", null),
  "layer.5": info("layer", null),
  "layer.6": info("layer", null),
  "goal.1": info("goal", "goal"),
  "goal.2": info("goal", "goal"),
  "goal.3": info("goal", "goal"),
  "goal.paused": info("goal", "goal"),
};

export const GLYPH_NAMES: readonly GlyphName[] = [
  ...STAGE_NAMES,
  ...RANK_NAMES,
  ...QUEST_NAMES,
  ...EVIDENCE_NAMES,
  ...GEMINI_PV_NAMES,
  ...PROVMARK_NAMES,
  ...SAFETY_NAMES,
  ...SESSION_NAMES,
  ...VERDICT_NAMES,
  ...TIME_NAMES,
  ...MISC_NAMES,
  ...FLAME_NAMES,
  ...LAYER_NAMES,
  ...GOAL_NAMES,
];

export const FAMILY_NAMES: Readonly<Record<FamilyId, readonly GlyphName[]>> = {
  stage: STAGE_NAMES,
  rank: RANK_NAMES,
  quest: QUEST_NAMES,
  evidence: EVIDENCE_NAMES,
  provenance: [...GEMINI_PV_NAMES, ...PROVMARK_NAMES],
  safety: SAFETY_NAMES,
  session: SESSION_NAMES,
  verdict: VERDICT_NAMES,
  time: TIME_NAMES,
  misc: MISC_NAMES,
  flame: FLAME_NAMES,
  layer: LAYER_NAMES,
  goal: GOAL_NAMES,
};

/** The glyph names a GlyphDefs family emits. */
export function defsNames(f: DefsFamily): GlyphName[] {
  return GLYPH_NAMES.filter((n) => GLYPH_INFO[n].defs === f);
}

export function isGlyphName(v: string): v is GlyphName {
  return Object.prototype.hasOwnProperty.call(GLYPH_INFO, v);
}

/** A flame alias (flame.unlit / lit / kept) → the flame glyph in that state; any other name passes through. */
export function resolveGlyph(name: GlyphName | FlameAlias, state: GlyphState): { name: GlyphName; state: GlyphState } {
  if (name in FLAME_ALIAS) return { name: "flame", state: FLAME_ALIAS[name as FlameAlias] };
  return { name: name as GlyphName, state };
}

export interface GlyphOpts {
  /** quest.practice: the plan's own track sigil. */
  track?: TrackSigil;
  /** stage.toward / stage.part: the gate. */
  gate?: StageGate;
  /** stage.track: stones (1–5); t.cal-moved: −1 for earlier. */
  n?: number;
  /** A session glyph struck through (avoided): the safe.strike overlay. */
  struck?: boolean;
}

/** One glyph's parts in one state. */
export function glyphParts(name: GlyphName, state: GlyphState, o: GlyphOpts = {}): Part[] {
  const fam = GLYPH_INFO[name]?.family;
  switch (fam) {
    case "stage":
      return stageParts(name as StageName, state, o);
    case "rank":
      return rankParts(Number(name.slice(5)), state);
    case "quest":
      return questParts(name as QuestName, state, o.track);
    case "flame":
      return flameParts(state);
    case "verdict":
      // verdicts have no done state (§4.4): done renders the chosen (active) shape
      return withState(VERDICT[name as VerdictName](), state === "done" ? "active" : state);
    case "evidence":
      return withState(EVIDENCE[name as EvidenceName](), state);
    case "provenance":
      return withState(PROVENANCE[name as ProvenanceName](), state);
    case "safety":
      return withState(SAFETY[name as SafetyName](), state);
    case "session": {
      const base = SESSION[name as SessionName]();
      return withState(o.struck ? [...base, P(STRIKE, "mark", { cls: "mg-strike" })] : base, state);
    }
    case "time":
      return withState(timeParts(name as TimeName, o.n), state);
    case "misc":
      return withState(MISC[name as MiscName](), state);
    case "layer":
      return layerParts(name as LayerName, state);
    case "goal":
      return goalParts(name as GoalName, state);
    default:
      return [];
  }
}
