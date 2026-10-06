/**
 * Proficiency (the user's "mastery %") and the Aim rank (lane R1, F12): the
 * formula, the basis, the rank assignment and the rank reader. Pure and
 * client-importable. Never calls a model, pays nothing, sets no g; R1's
 * writers store the figure (F10) as the daily `PROFICIENCY|r:<roadmapId>`
 * reading, and every surface reads that stored row.
 *
 * Contract: docs/life-plan/roadmap-contracts.md §R1.
 *
 *   proficiencyBasisOf · proficiencyOf · proficiencyDetailOf · proficiencyChangeOf
 *   proficiencyViewOf · assignRankIndices · aimRankOf
 * Added by R1 (compatible):
 *   ProficiencyBasisInput.heldDays · basisSignature · basisWithout · rebaseDetailOf
 *   ProficiencyDomainFacts · ProficiencyDetailR1 · parseProficiencyDetail · byDomainOf
 *   ProficiencyReadingInput · proficiencyReadingOf · proficiencyPercent · proficiencyCaptionOf
 *
 * The formula (F12), renormalised over the parts present:
 *   cards      (MEASURED) Σ_e Σ LEVEL_WEIGHT(min(level, L_e)) over the T_e best cards in S_e
 *              ÷ Σ_e T_e × LEVEL_WEIGHT(L_e). Levels 1–2 weigh 0, so written or once-passed
 *              cards add nothing; cards beyond T_e add nothing; levels 13–20 count as L_e.
 *   practice   (SELF_REPORTED) Σ_p min(kept_p, planned_p) ÷ Σ_p planned_p.
 *   milestones reached ÷ scheduled (confirmed reaches only).
 *   PROFICIENCY_WEIGHTS {cards 0.6, practice 0.25, milestones 0.15}: a Field Area
 *   without practices gives cards 0.8 / milestones 0.2 (0.6 ÷ 0.75, 0.15 ÷ 0.75), a
 *   track Area practice 0.625 / milestones 0.375.
 * The basis changes only with a plan decision (an acceptance, its Undo, a practice
 * switched off at Start), and the reading written then carries rebased {on, from,
 * cause}: shown "Changed on … (was 41%)", never as a gain.
 *
 * Revision 4 (F-R4-12; PROFICIENCY_VERSION 2), compatible additions:
 *   StageRankFields · StageRankRow (assignRankIndices ranks a depth plan by stage)
 *   RankMilestone.held · AimRankInput.depthRank (held rows give no rank; the top by depth)
 *   ProficiencyReadingInput.counts · ProficiencyToward · proficiencyTowardOf · proficiencyLabelOf
 *   proficiencyLineOf · ProficiencyViewR1 · stageFloorOf · floorPercentOf
 *   - The cards part is the depth terms (n_d recall cards at L*, clean entry at L*), so it
 *     is exactly 1 when the depth is held; a retry-entry card at L* weighs as L* − 1.
 *   - The stages part is reached ÷ scheduled positions: held stages count as reached, a
 *     PART gate is a position (both are rows of the version, so the rev-3 count is it).
 *   - The label always names its basis: "Proficiency toward Mastered (level 12): 28%".
 *   - A depth or coverage change is a plan decision: rebased, "depth lowered Mastered →
 *     Fluent", never a gain or a loss. A v2 reading never rebases against, nor shows a
 *     delta against, a v1 reading.
 * Revision 4 fix round (roadmap-contracts.md §15), compatible:
 *   - ProficiencyToward is roadmap-types' (§15.11), re-exported here.
 *   - assignRankIndices(rows, firstByLineage, depth?): a PART at the depth gives the gate
 *     below's rank (§15.4), so Virtuoso never comes before Mastered is reached.
 *   - basisMatchesEndState · rebaseCauseOf: a same-version end-state change (a lowered
 *     depth's record) rebuilds the basis and rebases as REPLAN in the depth's words.
 *   - endStateTowardOf · depthChangeLineOf: Plan history's "lowered the depth Mastered →
 *     Fluent" for an isDepthLoweringRecord row (R4's historyOf reads it; §15.7).
 * Revision 5 (roadmap-contracts.md §23.4, §22.1 ruling 5; lane 3), compatible:
 *   - ProficiencyRebaseCause RESUMED: the first reading after a paused goal resumes is a
 *     rebase "since you resumed", never a gain, even on the same basis (the reviews done
 *     while paused count in card state, but no reading was written during the pause).
 *     A plan decision passes it (proficiencyReadingOf's `decision`); its words are
 *     rebaseDetailOf's, and the stored detail parses it back.
 * Revision 5 (roadmap-contracts.md §22.12, ruling 51; lane 7), compatible:
 *   - assignRankIndices(rows, firstByLineage, depth?, planKind?): TOPICS spreads the ranks
 *     over its counted gates (topicRankIndexOf), TopicRankFields marking held, skipped and
 *     PART rows; LEVELS (absent) is unchanged.
 *   - The TOPICS end state is mixed-level (realism depthTermsOf with `levels`: the
 *     specialisation at L*, the base topics at 8, both `rc`): the formula already weighs
 *     each term at its own level, and proficiencyTowardOf reads the highest `rc` term, L*.
 *     Paragon on TOPICS is roadmap-types topRankIndexOfDepth's planKind branch.
 */
import { addDays, daysBetween, weekStartKeyOf, type DayKey } from "./life-day";
import { countsOfHistogram, levelEntriesOf, type CardCounts, type LevelHistogram } from "./roadmap-measures";
import {
  AIM_RANKS,
  KEEP_SHARE,
  LEVEL_WEIGHT,
  PROFICIENCY_VERSION,
  PROFICIENCY_WEIGHTS,
  RANK_NEW_DAYS,
  RANK_TOP,
  REACH_CONFIRM_DAYS,
  STAGE_KEYS,
  STAGE_LEVEL,
  STAGE_NAMES,
  STAGE_RANK,
  TRACK_STAGE_KEYS,
  aimRankName,
  measured,
  parseMeasureKey,
  plannedUnits,
  proficiencyKey,
  rankIndexAt,
  rankIndexForStage,
  selfReported,
  stageOfLevel,
  topRankIndexOf,
  topRankIndexOfDepth,
  topicRankIndexOf,
  type PlanKind,
  type AimRankLadderRow,
  type AimRankView,
  type AssignRankIndices,
  type CardSegment,
  type DepthRankInput,
  type EndStateTerm,
  type Feasibility,
  type MilestoneDraft,
  type NextRank,
  type ProficiencyBasis,
  type ProficiencyCardTerm,
  type ProficiencyChange,
  type ProficiencyClass,
  type ProficiencyDetail,
  type ProficiencyParts,
  type ProficiencyPracticeTerm,
  type ProficiencyRebase,
  type ProficiencyRebaseCause,
  type ProficiencyToward,
  type ProficiencyView,
  type RankRow,
  type Reading,
  type StageKey,
} from "./roadmap-types";

const EPS = 1e-9;
const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

// ═══ The basis ══════════════════════════════════════════════════════════════

/** What the basis is built from: the current acceptance, never rows written after it. */
export interface ProficiencyBasisInput {
  /** The acceptance's version (detail.basisVersion). */
  basisVersion: number;
  endState: readonly EndStateTerm[];
  /**
   * The acceptance's feasibility snapshot. Its per-milestone weeks carry no
   * per-practice split, so planned practice is read from the version's
   * practice items (the same sessions the snapshot was computed from); kept
   * for the contract and for callers that log it.
   */
  feasibility: Feasibility | null;
  /** The version's milestones (scheduled = not LATER, carried included). */
  milestones: readonly MilestoneDraft[];
  /** Practice lineages switched off at Start (their planned sessions leave the basis). */
  switchedOff: readonly string[];
  /** R1 addition: the held days known at the acceptance (planned practice leaves them out). */
  heldDays?: readonly DayKey[];
}

const UNSCHEDULED = new Set(["LATER", "SUPERSEDED", "DISCARDED"]);

/** A practice item's rule: its own, else from its sessions (7 → DAILY, n → TARGET:n/W). */
function practiceRuleOf(item: MilestoneDraft["items"][number]): string | null {
  if (item.rule) return item.rule;
  const s = item.sessionsPerWeek;
  if (s == null || !(s > 0)) return null;
  return s >= 7 ? "DAILY" : `TARGET:${Math.round(s)}/W`;
}

/**
 * The basis (F12): card terms (scope, L, T) from the end state's
 * CARDS_AT_LEVEL measures; planned practice per lineage, round(KEEP_SHARE ×
 * the planned units over its milestone's window less held days), WORKED_OUT;
 * scheduled = the version's scheduled milestones (distinct lineages, carried
 * included, LATER excluded). A switched-off lineage leaves it. Revision 4: a
 * held stage (HELD_AT_START) and a PART gate are positions like any other; a
 * stage a lowered depth dropped (DEPTH_LOWERED) is not.
 */
export function proficiencyBasisOf(input: ProficiencyBasisInput): ProficiencyBasis {
  const cards = new Map<string, ProficiencyCardTerm>();
  for (const t of input.endState) {
    const p = parseMeasureKey(t.measureKey);
    if (p?.kind !== "CARDS_AT_LEVEL" || !Number.isFinite(t.target)) continue;
    cards.set(t.measureKey, { measureKey: t.measureKey, domainIds: p.domainIds, level: p.level, target: Math.max(0, Math.round(t.target)) });
  }
  const off = new Set(input.switchedOff);
  const held = input.heldDays ?? [];
  const practice = new Map<string, ProficiencyPracticeTerm>();
  const lineages = new Set<string>();
  for (const m of input.milestones) {
    // Rev 4: a stage a lowered depth dropped (MilestoneNote DEPTH_LOWERED) leaves the basis too.
    if (UNSCHEDULED.has(m.status) || (m.notes ?? []).includes("DEPTH_LOWERED")) continue;
    lineages.add(m.lineageId);
    if (!m.windowStart || !m.dueDay) continue;
    for (const item of m.items) {
      if (item.kind !== "PRACTICE" || item.decision === "REMOVED" || item.addToToday === false || off.has(item.lineageId)) continue;
      const rule = practiceRuleOf(item);
      const units = plannedUnits(rule, { from: m.windowStart, to: m.dueDay }, held);
      practice.set(item.lineageId, { itemLineageId: item.lineageId, planned: Math.round(KEEP_SHARE * units) });
    }
  }
  return {
    basisVersion: input.basisVersion,
    cards: Array.from(cards.values()).sort((a, b) => (a.measureKey < b.measureKey ? -1 : 1)),
    practice: Array.from(practice.values()).sort((a, b) => (a.itemLineageId < b.itemLineageId ? -1 : 1)),
    scheduled: lineages.size,
  };
}

/** The basis's identity: two readings with different signatures sit on different plans. */
export function basisSignature(basis: ProficiencyBasis): string {
  const cards = [...basis.cards].map((c) => `${c.measureKey}=${c.target}`).sort();
  const practice = [...basis.practice].map((p) => `${p.itemLineageId}=${p.planned}`).sort();
  return JSON.stringify({ v: basis.basisVersion, cards, practice, s: basis.scheduled });
}

/** The basis less some practice lineages (a switch-off at Start). Unchanged when none of them is in it. */
export function basisWithout(basis: ProficiencyBasis, lineageIds: Iterable<string>): ProficiencyBasis {
  const off = new Set(lineageIds);
  if (!basis.practice.some((p) => off.has(p.itemLineageId))) return basis;
  return { ...basis, practice: basis.practice.filter((p) => !off.has(p.itemLineageId)) };
}

/** The card terms' identity (key = target, sorted): what an end state measures. */
const cardsSignature = (cards: readonly Pick<ProficiencyCardTerm, "measureKey" | "target">[]): string =>
  JSON.stringify(cards.map((c) => `${c.measureKey}=${c.target}`).sort());

/**
 * The basis still measures this end state: its card terms are exactly the
 * ones proficiencyBasisOf builds from it (rev-4 fix round). The writers carry
 * the previous reading's basis within a version only while this holds: a
 * lowered depth writes a second acceptance record inside the same version
 * (roadmap-types isDepthLoweringRecord), and should its own Proficiency row
 * not land, the next run rebuilds the basis from the acceptance it reads
 * rather than counting toward the depth the user lowered.
 */
export function basisMatchesEndState(basis: Pick<ProficiencyBasis, "cards">, endState: readonly EndStateTerm[]): boolean {
  const fromEnd = proficiencyBasisOf({ basisVersion: 0, endState, feasibility: null, milestones: [], switchedOff: [] }).cards;
  return cardsSignature(basis.cards) === cardsSignature(fromEnd);
}

/**
 * The cause of a rebase no plan decision named (the writers' own run): a
 * higher basisVersion is a re-plan and a lower one an Undo. Within one
 * version, changed card terms or positions are a plan decision inside the
 * version (a lowered depth, isDepthLoweringRecord, or a coverage change),
 * read as REPLAN so its words name the depth ("depth lowered Mastered →
 * Fluent"), never "switched off at Start"; only a change of planned practice
 * alone is a switch-off.
 */
export function rebaseCauseOf(before: ProficiencyBasis, after: ProficiencyBasis): ProficiencyRebaseCause {
  if (after.basisVersion > before.basisVersion) return "REPLAN";
  if (after.basisVersion < before.basisVersion) return "UNDO";
  if (cardsSignature(before.cards) !== cardsSignature(after.cards) || before.scheduled !== after.scheduled) return "REPLAN";
  return "SWITCHED_OFF";
}

/**
 * The plan words of a rebase (never a gain): "the re-plan lowered the end
 * target 30 → 25", "Backtest was switched off at Start", "the plan's last
 * change was undone". `names` maps practice lineages to their names.
 */
export function rebaseDetailOf(
  before: ProficiencyBasis,
  after: ProficiencyBasis,
  cause: ProficiencyRebaseCause,
  names: Readonly<Record<string, string>> = {},
  domainNames: Readonly<Record<string, string>> = {}
): string {
  if (cause === "RESUMED") return "since you resumed";
  if (cause === "UNDO") return "the plan's last change was undone";
  if (cause === "SWITCHED_OFF") {
    const gone = before.practice.filter((p) => !after.practice.some((q) => q.itemLineageId === p.itemLineageId));
    const list = gone.map((p) => names[p.itemLineageId] ?? "a practice");
    if (list.length === 0) return "a practice was switched off at Start";
    return `${list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`} ${list.length === 1 ? "was" : "were"} switched off at Start`;
  }
  // Revision 4: a depth plan's decisions in its own words — the depth, then each Domain's coverage.
  const tb = proficiencyTowardOf(before);
  const ta = proficiencyTowardOf(after);
  if (tb && ta && tb.level !== ta.level) return `depth ${ta.level < tb.level ? "lowered" : "raised"} ${tb.name} → ${ta.name}`;
  if (tb && ta) {
    const cover: string[] = [];
    const nameOf = (t: ProficiencyCardTerm) => t.domainIds.map((id) => domainNames[id] ?? "a Domain").join(", ");
    const beforeBy = new Map(before.cards.map((c) => [c.measureKey, c] as const));
    for (const a of after.cards) {
      const b = beforeBy.get(a.measureKey);
      if (!b) cover.push(`${nameOf(a)} added to the depth`);
      else if (a.target !== b.target) cover.push(`coverage in ${nameOf(a)} ${a.target < b.target ? "lowered" : "raised"} ${b.target} → ${a.target}`);
    }
    for (const b of before.cards) if (!after.cards.some((a) => a.measureKey === b.measureKey)) cover.push(`${nameOf(b)} left the depth`);
    if (cover.length > 0) return cover.slice(0, 2).join("; ");
  }
  const verb = cause === "ACCEPTED" ? "the plan" : "the re-plan";
  const words: string[] = [];
  const beforeCards = new Map(before.cards.map((c) => [c.measureKey, c] as const));
  const afterCards = new Map(after.cards.map((c) => [c.measureKey, c] as const));
  const sameKeys = beforeCards.size === afterCards.size && [...afterCards.keys()].every((k) => beforeCards.has(k));
  if (sameKeys) {
    for (const [key, a] of afterCards) {
      const b = beforeCards.get(key)!;
      if (a.target < b.target) words.push(`${verb} lowered the end target ${b.target} → ${a.target}`);
      else if (a.target > b.target) words.push(`${verb} raised the end target ${b.target} → ${a.target}`);
    }
  } else if (before.cards.length > 0 || after.cards.length > 0) {
    const bt = before.cards.reduce((s, c) => s + c.target, 0);
    const at = after.cards.reduce((s, c) => s + c.target, 0);
    words.push(`${verb} changed the end state's cards${bt !== at ? ` (${bt} → ${at})` : ""}`);
  }
  const bp = before.practice.reduce((s, p) => s + p.planned, 0);
  const ap = after.practice.reduce((s, p) => s + p.planned, 0);
  if (bp !== ap) words.push(`${verb} changed the planned sessions ${bp} → ${ap}`);
  if (before.scheduled !== after.scheduled) words.push(`${verb} changed the milestones ${before.scheduled} → ${after.scheduled}`);
  if (words.length === 0) return `${verb} changed`;
  return words.slice(0, 2).join("; ");
}

// ═══ The formula ════════════════════════════════════════════════════════════

/** Everything the formula reads (one wave of the writers' reads). */
export interface ProficiencyInput {
  basis: ProficiencyBasis;
  /** Per card term (by measureKey): the levels of the non-archived cards in its scope. */
  cardLevels: Readonly<Record<string, readonly number[]>>;
  /** Per practice lineage: kept units from its PRACTICE_KEPT readings, over non-overlapping windows. */
  kept: Readonly<Record<string, number>>;
  /** Lineages with a confirmed reachedDay (a pending reach does not count). */
  reached: number;
  /** Any confirmed reach rested on ticks: the milestones part is SELF_REPORTED. */
  reachedOnTicks: boolean;
}

export interface ProficiencyResult {
  /** Σ share × part, in [0, 1]. Displayed floor(100 × value)%. */
  value: number;
  parts: ProficiencyParts;
  shares: ProficiencyParts;
  class: ProficiencyClass;
  depth: number;
  inScope: number;
  kept: number;
  planned: number;
}

/** depth_e: Σ LEVEL_WEIGHT(min(level, L)) over the T best levels (fewer cards than T: the missing ones count 0). */
function termDepth(levels: readonly number[], level: number, target: number): number {
  const best = [...levels].filter((l) => Number.isFinite(l)).sort((a, b) => b - a).slice(0, Math.max(0, target));
  let depth = 0;
  for (const l of best) depth += LEVEL_WEIGHT(Math.min(Math.floor(l), level));
  return depth;
}

/**
 * The formula (F12): cards = Σ depth over the T best cards (LEVEL_WEIGHT of
 * min(level, L)) ÷ Σ T × LEVEL_WEIGHT(L); practice = Σ min(kept, planned) ÷
 * Σ planned; milestones = reached ÷ scheduled; PROFICIENCY_WEIGHTS
 * renormalised over the parts present. A part is absent when its basis has
 * nothing to measure (no card term, no planned practice, no scheduled
 * milestone). Class: SELF_REPORTED with a practice part or a tick-bound
 * reach, MEASURED otherwise.
 */
export function proficiencyOf(input: ProficiencyInput): ProficiencyResult {
  const { basis } = input;
  let depth = 0;
  let denom = 0;
  let inScope = 0;
  for (const t of basis.cards) {
    const levels = input.cardLevels[t.measureKey] ?? [];
    inScope += levels.length;
    depth += termDepth(levels, t.level, t.target);
    denom += Math.max(0, t.target) * LEVEL_WEIGHT(t.level);
  }
  const cards = denom > 0 ? clamp01(depth / denom) : null;

  let kept = 0;
  let planned = 0;
  for (const p of basis.practice) {
    const pl = Math.max(0, p.planned);
    planned += pl;
    kept += Math.min(Math.max(0, input.kept[p.itemLineageId] ?? 0), pl);
  }
  const practice = planned > 0 ? clamp01(kept / planned) : null;
  const milestones = basis.scheduled > 0 ? clamp01(input.reached / basis.scheduled) : null;

  const parts: ProficiencyParts = { cards, practice, milestones };
  const present =
    (cards != null ? PROFICIENCY_WEIGHTS.cards : 0) + (practice != null ? PROFICIENCY_WEIGHTS.practice : 0) + (milestones != null ? PROFICIENCY_WEIGHTS.milestones : 0);
  const share = (w: number, part: number | null) => (part != null && present > 0 ? w / present : null);
  const shares: ProficiencyParts = {
    cards: share(PROFICIENCY_WEIGHTS.cards, cards),
    practice: share(PROFICIENCY_WEIGHTS.practice, practice),
    milestones: share(PROFICIENCY_WEIGHTS.milestones, milestones),
  };
  const value = clamp01((shares.cards ?? 0) * (cards ?? 0) + (shares.practice ?? 0) * (practice ?? 0) + (shares.milestones ?? 0) * (milestones ?? 0));
  const cls: ProficiencyClass = practice != null || (input.reachedOnTicks && input.reached > 0) ? "SELF_REPORTED" : "MEASURED";
  return { value, parts, shares, class: cls, depth, inScope, kept, planned };
}

/** floor(100 × value): "Proficiency 41%". */
export function proficiencyPercent(value: number): number {
  return Math.floor(clamp01(value) * 100 + EPS);
}

// ═══ Revision 4: the basis in words (F-R4-12) ═══════════════════════════════

/** What a depth plan's Proficiency counts toward ("Mastered", level 12): roadmap-types' (the fix round put it on the contract, §15.11), re-exported. */
export type { ProficiencyToward };

const segmentOf = (measureKey: string): CardSegment | undefined => {
  const p = parseMeasureKey(measureKey);
  return p?.kind === "CARDS_AT_LEVEL" ? p.segment : undefined;
};

/**
 * The basis's depth: on a depth plan the card terms are the depth terms (one
 * per Domain, `rc` at L*), and Proficiency counts toward L*. Null on a track
 * plan, a rev-3 basis, or one with no `rc` term (the label then reads
 * "Proficiency" alone).
 */
export function proficiencyTowardOf(basis: Pick<ProficiencyBasis, "cards">): ProficiencyToward | null {
  let level = 0;
  for (const t of basis.cards) if (segmentOf(t.measureKey) === "rc" && t.level > level) level = t.level;
  if (level <= 0) return null;
  const stage = stageOfLevel(level);
  return { level, name: stage ? STAGE_NAMES[stage] : `level ${level}` };
}

/**
 * The label that always names its basis (F-R4-12; Names): "Proficiency toward
 * Mastered (level 12)", "Proficiency toward Fluent (level 10)" after a
 * lowering, so a higher figure after a lowering never reads as more mastery.
 * "Proficiency" alone without a depth.
 */
export function proficiencyLabelOf(toward: ProficiencyToward | null | undefined): string {
  return toward ? `Proficiency toward ${toward.name} (level ${toward.level})` : "Proficiency";
}

/** The label with its figure: "Proficiency toward Mastered (level 12): 28%". */
export function proficiencyLineOf(toward: ProficiencyToward | null | undefined, value: number): string {
  return `${proficiencyLabelOf(toward)}: ${proficiencyPercent(value)}%`;
}

/** What an acceptance's end state counts toward (its `rc` depth terms), as proficiencyTowardOf reads a basis; null without a depth. */
export function endStateTowardOf(endState: readonly Pick<EndStateTerm, "measureKey">[]): ProficiencyToward | null {
  const cards: ProficiencyCardTerm[] = [];
  for (const t of endState) {
    const p = parseMeasureKey(t.measureKey);
    if (p?.kind === "CARDS_AT_LEVEL") cards.push({ measureKey: t.measureKey, domainIds: p.domainIds, level: p.level, target: 0 });
  }
  return proficiencyTowardOf({ cards });
}

/**
 * Plan history's words for a change of depth between two end states (rev-4
 * fix round, contracts §15.7): "lowered the depth Mastered → Fluent"
 * ("raised" the other way); null when the depth didn't change or either end
 * state has none. A record lowerDepthCore writes inside its version
 * (roadmap-types isDepthLoweringRecord) reads with these words, never as "the
 * re-plan lowered the end target"; the Proficiency rebase of the same
 * decision reads "depth lowered Mastered → Fluent" (rebaseDetailOf).
 */
export function depthChangeLineOf(before: readonly Pick<EndStateTerm, "measureKey">[], after: readonly Pick<EndStateTerm, "measureKey">[]): string | null {
  const tb = endStateTowardOf(before);
  const ta = endStateTowardOf(after);
  if (!tb || !ta || tb.level === ta.level) return null;
  return `${ta.level < tb.level ? "lowered" : "raised"} the depth ${tb.name} → ${ta.name}`;
}

/**
 * A stage's floor of the cards part (the ladder disclosure "Aim ranks on this
 * plan"): LEVEL_WEIGHT(ℓ) ÷ LEVEL_WEIGHT(L*), what the cards part reads when
 * every coverage card sits at exactly ℓ. At L* = 12: Foundation 1.8%, Familiar
 * 7.4%, Retained 20.3%, Fluent 45.6%, Toward Mastered 67.6%, Mastered 100%.
 */
export function stageFloorOf(level: number, depth: number): number {
  const top = LEVEL_WEIGHT(depth);
  return top > 0 ? clamp01(LEVEL_WEIGHT(Math.min(level, depth)) / top) : 0;
}

/** A floor as a percent to one decimal (1.8, 7.4, 20.3 …): the disclosure's figure. */
export function floorPercentOf(floor: number): number {
  return Math.round(clamp01(floor) * 1000 + EPS) / 10;
}

// ═══ The stored detail ══════════════════════════════════════════════════════

/** Per Domain of the card terms: its name, its cards in scope and the depth its best cards add (the cause line's words). */
export interface ProficiencyDomainFacts {
  name: string;
  n: number;
  depth: number;
}

/** The PROFICIENCY detail R1 stores: the contract's fields plus byDomain (for "cards archived or moved out of Probability"). */
export interface ProficiencyDetailR1 extends ProficiencyDetail {
  byDomain?: Record<string, ProficiencyDomainFacts>;
  /** Revision 4: what it counts toward (the label's basis); absent without a depth. */
  toward?: ProficiencyToward | null;
}

/** The PROFICIENCY reading's detail (v, basisVersion, basis, parts, …, rebased; rev 4: toward). */
export function proficiencyDetailOf(
  result: ProficiencyResult,
  basis: ProficiencyBasis,
  extra: { reached: number; scheduled: number; rebased: ProficiencyRebase | null; byDomain?: Record<string, ProficiencyDomainFacts> }
): ProficiencyDetail {
  const detail: ProficiencyDetailR1 = {
    v: PROFICIENCY_VERSION,
    basisVersion: basis.basisVersion,
    basis,
    parts: result.parts,
    shares: result.shares,
    class: result.class,
    depth: result.depth,
    inScope: result.inScope,
    kept: result.kept,
    planned: result.planned,
    reached: extra.reached,
    scheduled: extra.scheduled,
    rebased: extra.rebased,
  };
  if (extra.byDomain) detail.byDomain = extra.byDomain;
  const toward = proficiencyTowardOf(basis);
  if (toward) detail.toward = toward;
  return detail;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function parseParts(v: unknown): ProficiencyParts {
  const o = isObj(v) ? v : {};
  return { cards: numOrNull(o.cards), practice: numOrNull(o.practice), milestones: numOrNull(o.milestones) };
}

function parseBasis(v: unknown): ProficiencyBasis | null {
  if (!isObj(v) || typeof v.basisVersion !== "number" || !Array.isArray(v.cards) || !Array.isArray(v.practice) || typeof v.scheduled !== "number") return null;
  const cards: ProficiencyCardTerm[] = [];
  for (const c of v.cards) {
    if (!isObj(c) || typeof c.measureKey !== "string" || !Array.isArray(c.domainIds) || typeof c.level !== "number" || typeof c.target !== "number") return null;
    cards.push({ measureKey: c.measureKey, domainIds: c.domainIds.filter((d): d is string => typeof d === "string"), level: c.level, target: c.target });
  }
  const practice: ProficiencyPracticeTerm[] = [];
  for (const p of v.practice) {
    if (!isObj(p) || typeof p.itemLineageId !== "string" || typeof p.planned !== "number") return null;
    practice.push({ itemLineageId: p.itemLineageId, planned: p.planned });
  }
  return { basisVersion: v.basisVersion, cards, practice, scheduled: v.scheduled };
}

function parseRebase(v: unknown): ProficiencyRebase | null {
  if (!isObj(v) || typeof v.on !== "string" || typeof v.from !== "number" || typeof v.cause !== "string") return null;
  const causes: readonly string[] = ["ACCEPTED", "REPLAN", "UNDO", "SWITCHED_OFF", "RESUMED"];
  if (!causes.includes(v.cause)) return null;
  return { on: v.on, from: v.from, cause: v.cause as ProficiencyRebaseCause, detail: typeof v.detail === "string" ? v.detail : "" };
}

/** A stored PROFICIENCY detail, read tolerantly; null when it is not one this version wrote. */
export function parseProficiencyDetail(detail: unknown): ProficiencyDetailR1 | null {
  if (!isObj(detail) || typeof detail.v !== "number") return null;
  const basis = parseBasis(detail.basis);
  if (!basis) return null;
  const cls = detail.class === "SELF_REPORTED" ? "SELF_REPORTED" : "MEASURED";
  const byDomain: Record<string, ProficiencyDomainFacts> = {};
  if (isObj(detail.byDomain)) {
    for (const [id, f] of Object.entries(detail.byDomain)) {
      if (isObj(f) && typeof f.name === "string" && typeof f.n === "number" && typeof f.depth === "number") byDomain[id] = { name: f.name, n: f.n, depth: f.depth };
    }
  }
  const out: ProficiencyDetailR1 = {
    v: detail.v,
    basisVersion: typeof detail.basisVersion === "number" ? detail.basisVersion : basis.basisVersion,
    basis,
    parts: parseParts(detail.parts),
    shares: parseParts(detail.shares),
    class: cls,
    depth: numOrNull(detail.depth) ?? 0,
    inScope: numOrNull(detail.inScope) ?? 0,
    kept: numOrNull(detail.kept) ?? 0,
    planned: numOrNull(detail.planned) ?? 0,
    reached: numOrNull(detail.reached) ?? 0,
    scheduled: numOrNull(detail.scheduled) ?? basis.scheduled,
    rebased: parseRebase(detail.rebased),
    byDomain,
  };
  // The basis decides what it counts toward (a stored `toward` only echoes it).
  const toward = proficiencyTowardOf(basis);
  if (toward) out.toward = toward;
  return out;
}

/** Each card term's levels as its segment weighs them (levelEntriesOf), per Domain of its scope. */
function termEntries(counts: CardCounts, t: ProficiencyCardTerm, domainId: string): [number, number][] {
  return levelEntriesOf(counts, domainId, t.level, segmentOf(t.measureKey));
}

/**
 * Per Domain: its cards in the card terms' scopes, and the depth its cards
 * add among each term's T best (ties broken by Domain id, so it is
 * deterministic). Σ depth over Domains equals the cards part's depth.
 * Revision 4: pass CardCounts (or a histogram, read as every card) — a term
 * with a segment counts recall cards, and `rc` weighs a retry entry at L as L − 1.
 */
export function byDomainOf(h: LevelHistogram | CardCounts, basis: ProficiencyBasis, names: Readonly<Record<string, string>>): Record<string, ProficiencyDomainFacts> {
  const counts = isCardCounts(h) ? h : countsOfHistogram(h);
  const out: Record<string, ProficiencyDomainFacts> = {};
  const touch = (id: string) => (out[id] ??= { name: names[id] ?? "a Domain", n: 0, depth: 0 });
  const counted = new Set<string>();
  for (const t of basis.cards) {
    const cards: { level: number; domainId: string }[] = [];
    for (const id of new Set(t.domainIds)) {
      const f = touch(id);
      const entries = termEntries(counts, t, id);
      if (!counted.has(id)) {
        counted.add(id);
        for (const [, c] of entries) f.n += c;
      }
      for (const [level, count] of entries) for (let i = 0; i < count; i++) cards.push({ level, domainId: id });
    }
    cards.sort((a, b) => b.level - a.level || (a.domainId < b.domainId ? -1 : a.domainId > b.domainId ? 1 : 0));
    for (const c of cards.slice(0, Math.max(0, t.target))) touch(c.domainId).depth += LEVEL_WEIGHT(Math.min(c.level, t.level));
  }
  return out;
}

function isCardCounts(v: LevelHistogram | CardCounts): v is CardCounts {
  const o = v as Partial<CardCounts>;
  return isObj(o.all) && isObj(o.recall) && isObj(o.retry) && Object.keys(v).length === 3;
}

/** What a writer (or a plan decision) needs to make today's PROFICIENCY row. */
export interface ProficiencyReadingInput {
  roadmapId: string;
  today: DayKey;
  basis: ProficiencyBasis;
  histogram: LevelHistogram;
  /** Revision 4: recall and retry-entry counts (the depth terms read these); absent, `histogram` stands for every count. */
  counts?: CardCounts;
  domainNames: Readonly<Record<string, string>>;
  /** Per practice lineage, the kept units (latest PRACTICE_KEPT readings, own windows). */
  kept: Readonly<Record<string, number>>;
  reached: number;
  reachedOnTicks: boolean;
  /** The latest stored PROFICIENCY reading of this roadmap (any day), or null. */
  previous: Reading | null;
  /** A plan decision writes this reading (acceptCore, undoAcceptCore, finishStartCore): its cause and practice names. */
  decision?: { cause: ProficiencyRebaseCause; names?: Readonly<Record<string, string>> } | null;
}

/**
 * Today's PROFICIENCY row (measureKey PROFICIENCY|r:<id>, value in [0, 1]).
 * When the previous reading sat on another basis, this one is rebased {on:
 * today, from: the previous value, cause}: the decision's cause, else
 * rebaseCauseOf (a higher basisVersion is a re-plan, a lower an Undo; within
 * a version, changed card terms are a plan decision such as a lowered depth,
 * and only a practice change alone is a switch-off). Otherwise the previous
 * rebase is carried forward, so "Changed on …" can show until the week ends.
 * Revision 5: a RESUMED decision rebases even on the same basis ("since you
 * resumed"): the value moved while no reading was written, and it is never
 * shown as a gain.
 */
export function proficiencyReadingOf(input: ProficiencyReadingInput): { measureKey: string; day: DayKey; value: number; detail: ProficiencyDetailR1 } {
  const counts = input.counts ?? countsOfHistogram(input.histogram);
  const cardLevels: Record<string, number[]> = {};
  for (const t of input.basis.cards) {
    const levels: number[] = [];
    for (const id of new Set(t.domainIds)) for (const [level, count] of termEntries(counts, t, id)) for (let i = 0; i < count; i++) levels.push(level);
    cardLevels[t.measureKey] = levels;
  }
  const result = proficiencyOf({ basis: input.basis, cardLevels, kept: input.kept, reached: input.reached, reachedOnTicks: input.reachedOnTicks });
  const prev = input.previous ? parseProficiencyDetail(input.previous.detail) : null;
  // A reading of another version (v1 before revision 4) is another formula: never rebased against, never carried.
  const sameFormula = prev != null && prev.v === PROFICIENCY_VERSION;
  let rebased: ProficiencyRebase | null = sameFormula ? (prev?.rebased ?? null) : null;
  const resumed = input.decision?.cause === "RESUMED";
  if (sameFormula && prev && input.previous && (resumed || basisSignature(prev.basis) !== basisSignature(input.basis))) {
    const cause: ProficiencyRebaseCause = input.decision?.cause ?? rebaseCauseOf(prev.basis, input.basis);
    rebased = { on: input.today, from: clamp01(input.previous.value), cause, detail: rebaseDetailOf(prev.basis, input.basis, cause, input.decision?.names ?? {}, input.domainNames) };
  }
  const detail = proficiencyDetailOf(result, input.basis, {
    reached: input.reached,
    scheduled: input.basis.scheduled,
    rebased,
    byDomain: byDomainOf(counts, input.basis, input.domainNames),
  }) as ProficiencyDetailR1;
  return { measureKey: proficiencyKey(input.roadmapId), day: input.today, value: result.value, detail };
}

// ═══ Change and view ════════════════════════════════════════════════════════

/**
 * The change against the last reading dated before this life week ("since
 * Sun"), its cause from the parts diff, or the rebased step; null for a rise
 * (no glyph: the meter moves and the parts say why) or a version change.
 *   - a rebase dated this life week replaces the delta ("Changed on 12 Nov · … (was 41%)");
 *   - a reading on another basis or another detail.v shows no delta;
 *   - a fall: cards part down with fewer cards in scope → CARDS_ARCHIVED ("archived or
 *     moved out of Probability"), cards part down otherwise → LEVELS_SLIPPED, practice
 *     part down → TICK_UNDONE; the part with the larger weighted drop names it.
 */
export function proficiencyChangeOf(current: Reading, beforeThisWeek: Reading | null, today: DayKey): ProficiencyChange | null {
  const cur = parseProficiencyDetail(current.detail);
  if (!cur) return null;
  const weekStart = weekStartKeyOf(today);
  if (cur.rebased && cur.rebased.on >= weekStart && cur.rebased.on <= today) return { kind: "rebased", rebase: cur.rebased };
  if (!beforeThisWeek) return null;
  const prev = parseProficiencyDetail(beforeThisWeek.detail);
  if (!prev || prev.v !== cur.v || basisSignature(prev.basis) !== basisSignature(cur.basis)) return null;
  const points = proficiencyPercent(beforeThisWeek.value) - proficiencyPercent(current.value);
  if (points <= 0) return null;
  const drop = (k: keyof ProficiencyParts) => {
    const a = prev.parts[k];
    const b = cur.parts[k];
    return a != null && b != null && b < a - EPS ? (a - b) * (cur.shares[k] ?? 0) : 0;
  };
  const cardsDrop = drop("cards");
  const practiceDrop = drop("practice");
  if (cardsDrop <= 0 && practiceDrop <= 0) return null;
  const since = beforeThisWeek.day;
  if (practiceDrop > cardsDrop) return { kind: "fall", points, since, cause: "TICK_UNDONE", domains: [] };
  const prevDomains = prev.byDomain ?? {};
  const curDomains = cur.byDomain ?? {};
  const names = (pick: (a: ProficiencyDomainFacts, b: ProficiencyDomainFacts | undefined) => boolean) =>
    Object.entries(prevDomains)
      .filter(([id, a]) => pick(a, curDomains[id]))
      .map(([, a]) => a.name)
      .sort();
  if (cur.inScope < prev.inScope) return { kind: "fall", points, since, cause: "CARDS_ARCHIVED", domains: names((a, b) => (b?.n ?? 0) < a.n) };
  return { kind: "fall", points, since, cause: "LEVELS_SLIPPED", domains: names((a, b) => (b?.depth ?? 0) < a.depth) };
}

/** The caption Proficiency's figure carries: "tested by your reviews", "tested by your reviews and your ticks", or "from your ticks". */
export function proficiencyCaptionOf(cls: ProficiencyClass, parts: ProficiencyParts): string {
  if (cls === "MEASURED") return "tested by your reviews";
  return parts.cards != null ? "tested by your reviews and your ticks" : "from your ticks";
}

/**
 * ProficiencyView plus its basis in words (revision 4): `toward` (null without
 * a depth) and `label`, "Proficiency toward Mastered (level 12)". R5's block
 * shows `${label}: ${percent}%` (proficiencyLineOf), and only there may
 * "Mastered" appear inside the Proficiency block.
 */
export interface ProficiencyViewR1 extends ProficiencyView {
  toward: ProficiencyToward | null;
  label: string;
}

/** Proficiency as every surface shows it, from the stored reading (`live` only on a writes-off server). */
export function proficiencyViewOf(current: Reading, beforeThisWeek: Reading | null, today: DayKey, live: boolean): ProficiencyViewR1 {
  const d = parseProficiencyDetail(current.detail);
  const value = clamp01(current.value);
  const cls: ProficiencyClass = d?.class ?? "MEASURED";
  const parts = d?.parts ?? { cards: null, practice: null, milestones: null };
  const caption = proficiencyCaptionOf(cls, parts);
  const toward = d ? proficiencyTowardOf(d.basis) : null;
  return {
    toward,
    label: proficiencyLabelOf(toward),
    figure: { value: cls === "MEASURED" ? measured(value) : selfReported(value), caption },
    percent: proficiencyPercent(value),
    class: cls,
    parts,
    shares: d?.shares ?? { cards: null, practice: null, milestones: null },
    reached: d?.reached ?? 0,
    scheduled: d?.scheduled ?? 0,
    measuredAt: current.observedAt,
    change: proficiencyChangeOf(current, beforeThisWeek, today),
    live,
  };
}

// ═══ The Aim rank ═══════════════════════════════════════════════════════════

/**
 * rankIndex for a version's rows (F12; roadmap-types AssignRankIndices):
 * scheduled POSITIONS numbered 1…n in plan order (carried first, by ord),
 * each new row rankIndexAt(its position's place, its lineage's first),
 * carried rows kept, LATER null. A carried row with no stored index (none
 * ever written) takes its place's.
 *
 * A place is a position, one per lineage (fix round): a dropped row and its
 * "Start again" copy share their lineage's place (and a draft row of that
 * lineage takes the same place), so a milestone after them gets its true
 * place, never one too high.
 *
 * Revision 4 (F-R4-12): a row that carries its stage (StageRankRow) is ranked
 * by it, roadmap-types rankIndexForStage — Foundation 1 (Aspirant), Familiar
 * 2, Retained 3, Fluent 4, Mastered 5; BETWEEN takes the gate below ("keeps
 * your rank"); PART takes the rank of the stage it precedes, which then keeps
 * it; a merged gate is simply absent, so its name is skipped. A track plan's
 * stages (STAGE_1..STAGE_5) rank by place among its kept stages, the rev-3
 * place rule, whatever their key. Either way never above the lineage's first
 * value. A held row ("Held when you began") gets its stage's index for
 * display; aimRankOf counts no held row.
 *
 * Fix round (contracts §15.4; decision 40 "Mastered gives Virtuoso", stage
 * rank = verified depth): `depth` is the plan's L* (Roadmap.depth: 12, 10 or
 * 8). A PART counting toward the depth's own gate gives the rank of the gate
 * below it (Expert under Mastered, Specialist under Fluent, Journeyman under
 * Retained), since its target is n − 1 cards or fewer counted on `r`, retry
 * entries included: a library holding Fluent never shows Virtuoso before
 * Mastered is reached. Omitted, the depth reads 12 (a PART at 12 is always at
 * the depth); a PART below the depth is unchanged. The third argument is
 * optional, and roadmap-types' AssignRankIndices types it (fix round 2,
 * contracts §16.9), so R4's rankIndicesOf passes the plan's depth through
 * RoadmapLanes and needs no re-rank after the call.
 *
 * Revision 5, lane 7 (contracts §22.12, ruling 51): `planKind` TOPICS spreads
 * the ranks over the plan's counted gates, since every layer milestone is
 * FAMILIAR and ranking by stage would give each one Journeyman. The gates, in
 * plan order (carried first, by ord; one per lineage), are each row's PART
 * checkpoint when it holds one (TopicRankFields.part: "half of layer 1 at
 * level 6"), then the row itself. Gate i of G takes topicRankIndexOf(i, G,
 * top), top = STAGE_RANK of L* (`depth`: 6 gives Journeyman, 12 Virtuoso),
 * never above the lineage's first value. Held, skipped and all-held rows
 * (TopicRankFields.held, .skipped) get null and are not counted in G; a
 * carried row keeps its stored index. The PART's own rank is gate 1's. G is
 * fixed here, at accept: a later skip only sets that row's index to null (the
 * server's), with no re-spread. Absent or LEVELS: as above, unchanged.
 */
export const assignRankIndices = ((rows: readonly RankRow[], firstByLineage: Readonly<Record<string, number>>, depth?: number | null, planKind?: PlanKind | null): Record<string, number | null> => {
  const out: Record<string, number | null> = {};
  const byOrd = (a: { ord: number; id: string }, b: { ord: number; id: string }) => a.ord - b.ord || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const carried = rows.filter((r) => !r.later && r.carried).sort(byOrd);
  const fresh = rows.filter((r) => !r.later && !r.carried).sort(byOrd);
  // ── Revision 5, lane 7: a TOPICS plan's rank spread (contracts §22.12, ruling 51) ──
  if (planKind === "TOPICS") {
    const counted = (r: RankRow): boolean => (r as TopicRankRow).held !== true && (r as TopicRankRow).skipped !== true;
    const gateOf = new Map<string, number>();
    let gates = 0;
    for (const r of [...carried, ...fresh]) {
      if (!counted(r) || gateOf.has(r.lineageId)) continue;
      if ((r as TopicRankRow).part === true) gates += 1;
      gates += 1;
      gateOf.set(r.lineageId, gates);
    }
    const top = topicTopRankOf(depth);
    const spreadOf = (r: RankRow): number | null => {
      const i = gateOf.get(r.lineageId);
      if (!counted(r) || i == null) return null;
      const spread = topicRankIndexOf(i, gates, top);
      const first = firstByLineage[r.lineageId];
      return Math.max(1, first != null && Number.isFinite(first) ? Math.min(spread, first) : spread);
    };
    for (const r of carried) out[r.id] = counted(r) ? (r.rankIndex ?? spreadOf(r)) : null;
    for (const r of fresh) out[r.id] = spreadOf(r);
    for (const r of rows) if (r.later) out[r.id] = null;
    return out;
  }
  const placeOf = new Map<string, number>();
  let place = 0;
  const placeFor = (lineageId: string): number => {
    const known = placeOf.get(lineageId);
    if (known != null) return known;
    place += 1;
    placeOf.set(lineageId, place);
    return place;
  };
  const rankOf = (r: RankRow, p: number): number => {
    const staged = stageRankOf(r as StageRankRow, depth);
    if (staged == null) return rankIndexAt(p, firstByLineage[r.lineageId]);
    const first = firstByLineage[r.lineageId];
    return Math.max(1, first != null && Number.isFinite(first) ? Math.min(staged, first) : staged);
  };
  for (const r of carried) {
    const p = placeFor(r.lineageId);
    out[r.id] = r.rankIndex ?? rankOf(r, p);
  }
  for (const r of fresh) out[r.id] = rankOf(r, placeFor(r.lineageId));
  for (const r of rows) if (r.later) out[r.id] = null;
  return out;
}) satisfies AssignRankIndices;

/** Revision 4: a row's stage, for assignRankIndices (R4 passes RoadmapMilestone.stage and the gate's level). */
export interface StageRankFields {
  /** RoadmapMilestone.stage: a gate, BETWEEN, PART or STAGE_1..STAGE_5; null on a legacy row (the place rule). */
  stage?: StageKey | string | null;
  /** The level the row's card measures gate at: BETWEEN's odd level (11), PART's stage level (6). Gates read it from their key. */
  gateLevel?: number | null;
}

/** A RankRow that carries its stage (revision 4). Assignable to RankRow, so assignRankIndices takes it as it is. */
export type StageRankRow = RankRow & StageRankFields;

// ── Revision 5, lane 7 (contracts §22.12, ruling 51) ──

/**
 * What a TOPICS row tells assignRankIndices (planKind TOPICS; lane 8's
 * rankIndicesOf passes them beside the stage): `held` (HELD_AT_START, or a
 * layer whose every topic is held), `skipped` (every topic of the row marked
 * "I know this"): either gives null and is not counted in G; `part`: the row
 * holds the PART checkpoint ("half of layer 1 at level 6", MeasureSpec.gate
 * PART), one more gate just before it.
 */
export interface TopicRankFields {
  held?: boolean;
  skipped?: boolean;
  part?: boolean;
}

/** A RankRow of a TOPICS plan (assignable to RankRow). */
export type TopicRankRow = StageRankRow & TopicRankFields;

/** A TOPICS plan's top milestone rank (contracts §22.12): STAGE_RANK of the gate at L* (6 → Journeyman, 12 → Virtuoso); 12's without a depth. */
function topicTopRankOf(depth?: number | null): number {
  const L = typeof depth === "number" && Number.isFinite(depth) ? Math.floor(depth) : STAGE_LEVEL.MASTERED;
  let top = 1;
  for (const k of STAGE_KEYS) if (STAGE_LEVEL[k] <= L) top = Math.max(top, STAGE_RANK[k]);
  return top;
}

const TRACK_STAGES: ReadonlySet<string> = new Set(TRACK_STAGE_KEYS);

/** The stage's rank (rankIndexForStage, given the plan's depth), or null for a track stage, a legacy row, or a BETWEEN or PART without its level (the place rule then). */
function stageRankOf(r: StageRankFields, depth?: number | null): number | null {
  if (!r.stage || TRACK_STAGES.has(r.stage)) return null;
  return rankIndexForStage(r.stage, r.gateLevel ?? null, depth ?? null);
}

/** One milestone as the rank reader reads it. */
export interface RankMilestone {
  ord: number;
  rankIndex: number | null;
  reachedDay: DayKey | null;
  reachPendingDay: DayKey | null;
  /** Not LATER (a scheduled row of the current version, carried included). */
  scheduled: boolean;
  /**
   * Revision 4: held when the plan began (MilestoneNote HELD_AT_START): it has
   * reachedDay (the acceptance day) and counts in Proficiency's stages part,
   * but gives no rank. Only stages reached inside the plan give a rank.
   */
  held?: boolean;
}

export interface AimRankInput {
  milestones: readonly RankMilestone[];
  /** Roadmap.reachedDay: Paragon when set on a plan whose top rank is Paragon. */
  roadmapReachedDay: DayKey | null;
  /** The most milestones scheduled in any one version (the rev-3 top, used without depthRank). */
  maxScheduled: number;
  today: DayKey;
  /**
   * Revision 4: the plan's top-rank facts (roadmap-types topRankIndexOfDepth):
   * on a card plan Paragon needs depth 12, a standard, no coverage below the
   * policy and production practice from Fluent on, else the final stage's
   * rank; on a track plan a standard, ≥ 4 kept stages and ≥ 180 days. Absent:
   * rev 3's topRankIndexOf(maxScheduled).
   */
  depthRank?: DepthRankInput | null;
}

/**
 * Rank = the max rankIndex over confirmed reaches inside the plan (or
 * Paragon); never falls. Next rank, top on this plan, pending, the ladder.
 *   - held rows (HELD_AT_START) give no rank and give no ladder row;
 *   - Paragon is Roadmap.reachedDay on a plan whose top rank is Paragon;
 *   - the top shown is never below a rank already given (a lower depth caps
 *     the top and keeps every rank given so far);
 *   - newSince: the confirmed day that gave the current rank, while within RANK_NEW_DAYS; never a pending reach;
 *   - next: the first unreached scheduled milestone (by ord) whose rankIndex is above the rank;
 *     else, with unreached milestones left, "Milestone 6 keeps your rank"; else Paragon when the
 *     plan can give it and the aim is not reached; else top;
 *   - pending: the first milestone waiting on ticks, counting from pending + REACH_CONFIRM_DAYS.
 */
export function aimRankOf(input: AimRankInput): AimRankView {
  const ms = [...input.milestones].sort((a, b) => a.ord - b.ord);
  const top = input.depthRank ? topRankIndexOfDepth(input.depthRank) : topRankIndexOf(input.maxScheduled);
  const paragon = input.roadmapReachedDay != null && top === RANK_TOP;
  const confirmed = ms.filter((m) => m.reachedDay != null && m.rankIndex != null && m.held !== true);
  const index = paragon ? RANK_TOP : confirmed.reduce((best, m) => Math.max(best, Math.min(m.rankIndex!, RANK_TOP - 1)), 0);
  const topShown = Math.max(top, index);

  let gaveDay: DayKey | null = null;
  if (paragon) gaveDay = input.roadmapReachedDay;
  else if (index > 0) for (const m of confirmed) if (m.rankIndex === index && (gaveDay == null || m.reachedDay! < gaveDay)) gaveDay = m.reachedDay;
  const age = gaveDay ? daysBetween(gaveDay, input.today) : -1;
  const newSince = gaveDay && age >= 0 && age < RANK_NEW_DAYS ? gaveDay : null;

  const unreached = ms.filter((m) => m.scheduled && m.reachedDay == null);
  const raising = unreached.find((m) => m.rankIndex != null && m.rankIndex > index);
  let next: NextRank;
  if (raising) next = { kind: "milestone", index: raising.rankIndex!, name: aimRankName(raising.rankIndex!), milestoneOrd: raising.ord };
  else if (unreached.length > 0) next = { kind: "keeps", milestoneOrd: unreached[0].ord };
  else if (top === RANK_TOP && !paragon) next = { kind: "paragon" };
  else next = { kind: "top" };

  const waiting = ms.find((m) => m.reachedDay == null && m.reachPendingDay != null);
  const pending = waiting ? { milestoneOrd: waiting.ord, countsFrom: addDays(waiting.reachPendingDay!, REACH_CONFIRM_DAYS) } : null;

  const giver = new Map<number, number>();
  for (const m of ms) {
    if (m.rankIndex == null || m.held === true || !(m.scheduled || m.reachedDay != null)) continue;
    if (!giver.has(m.rankIndex)) giver.set(m.rankIndex, m.ord);
  }
  const nextIndex = next.kind === "milestone" ? next.index : next.kind === "paragon" ? RANK_TOP : -1;
  const stateOf = (i: number): AimRankLadderRow["state"] => (i <= index ? "given" : i === nextIndex ? "next" : "later");
  const ladder: AimRankLadderRow[] = [{ index: 0, name: AIM_RANKS[0], milestoneOrd: null, state: "given" }];
  for (let i = 1; i < RANK_TOP; i++) if (giver.has(i)) ladder.push({ index: i, name: AIM_RANKS[i], milestoneOrd: giver.get(i)!, state: stateOf(i) });
  if (top === RANK_TOP) ladder.push({ index: RANK_TOP, name: AIM_RANKS[RANK_TOP], milestoneOrd: null, state: stateOf(RANK_TOP) });

  return {
    index,
    name: aimRankName(index),
    newSince,
    next,
    top: { index: topShown, name: aimRankName(topShown), withAim: top === RANK_TOP },
    pending,
    ladder,
  };
}
