/**
 * Condition decay for skills and attributes (blueprint 3.1b "Ebbinghaus Proficiency Decay"; plan P28; decisions D24 and
 * D24b). Neglect is shown as a derived condition, never as lost history: levels, XP, hours, titles and the character
 * level never drop (harm H2). Pure and client-importable: no Prisma, no clock. The server's read is
 * skill-decay-server.ts (loadConditionBasis); the Status card, the Skills page, the emblems, the audit, the rules page
 * and the phone read the same rules here.
 *
 * INERT UNTIL DECAY_LAUNCH_DAY (null in code; outside production XTNL_DECAY_LAUNCH_DAY may set it, the rehearsal server
 * and the sims). While it is null nothing is read and nothing below is applied: every condition is absent, the traits
 * are their sources' own, no emblem is frozen, and the pages, the audit and the phone read exactly as before. It is
 * flipped only on the user's direct go. It needs Duty too (decayFromOf): a rest, sick or vacation day can be declared,
 * and is read as held, only once Duty is live, so condition is in force from the later of DECAY_LAUNCH_DAY and
 * DUTY_LAUNCH_DAY, and no day before that is ever idle (a sick week before Duty would otherwise count as idle).
 *
 *   The condition   max(CONDITION_FLOOR, e^(−λ·max(0, idleDays − CONDITION_GRACE_DAYS))): 100% through 3 idle days,
 *                   then down by λ a day, never under 50%
 *   λ (D24)         0.02 physical (Vitality, and an exercise skill), 0.01 cognitive (Intellect, Craft), 0.005 the rest
 *                   (Duty, Care); a skill takes its attribute's
 *   Idle days       the life days with no practice since the later of the launch day and the day after the last
 *                   practice, up to today (today is never idle: it is not over), less the held days: a declared rest,
 *                   sick or vacation day and a rest-token (freeze) day are never idle. A day before the launch is never
 *                   counted, so the first read shows 100% whatever came before; nothing practised ever is 100% too
 *                   (nothing built yet to keep). One practice brings it back to 100% at once.
 *   Practice        Vitality, Craft, Duty, Care: a tick or a walk on the track (a TASK or WORKOUT row on it, not undone);
 *                   Intellect: a review answered or an idea added; a skill: a tick of a task it is fed by, or (an
 *                   exercise skill) a walk
 *
 * What the condition lowers (D24b, the user's variant): the trait contributions its attribute feeds, never the track,
 * the Field or anything stored. A track's 'Life · Body' row counts at its level × Vitality's condition, every Field row at
 * its breadth × Intellect's (traitScaleOf, scaleLifeRows). So the 13 traits read lower while an attribute is idle, and
 * read their full value again with the next practice.
 *
 * The emblem freeze (D24b): an owned emblem whose requirement the lowered traits no longer meet, but the full ones do,
 * is frozen ("Frozen · Body 12 days idle · a Body tick thaws it (Physical 120)"): it stays owned (never re-locked,
 * never removed from ownership, its unlock history or its celebrations), its effect and its loadout slot's effect are
 * paused while it is frozen, and it thaws the moment the trait is back at the requirement, which one practice on the
 * idle attribute does (condition comes back to 100% at once; waiting never does it). Nothing is written either way, so
 * a thaw plays no unlock ceremony (a ceremony plays only for a new UnlockedSkill row, which no condition ever writes).
 * Derived on read from the launch day only: no writes, no migration.
 *
 * Levels never drop (D24, over D24b's pause): an emblem whose effect guards a card's level (LEVEL_GUARD_KINDS: a ward,
 * grace before forgetting, stretched intervals, strike tolerance) never freezes, and the guards in force are the full
 * traits' fold (withLevelGuards; skill-effects ProgressionState.fullActiveSkills for the ward's charges), so forgetting
 * and a degrade read exactly as with decay off: an idle attribute never costs a card a level.
 *
 * Exports
 *   Launch     DECAY_LAUNCH_DAY · DECAY_LAUNCH_DAY_ENV · DecayEnv · decayLaunchDay(env?) · decayOn(day, launchDay?) ·
 *              decayFromOf(decayLaunch, dutyLaunch)
 *   The curve  CONDITION_FLOOR · CONDITION_GRACE_DAYS · DecayClass · DECAY_LAMBDA · ATTRIBUTE_DECAY_CLASS ·
 *              skillDecayClass(s) · conditionOf(idleDays, lambda) · idleDaysOf(p)
 *   Reads      ConditionBasis · Condition · attributeConditionOf · attributeConditionsOf · skillConditionOf
 *   Items      ConditionItem · CONDITION_NAME · conditionItemsOf · CHECK_CONDITION_BELOW · checkConditionsOf
 *   Traits     TraitScale · ATTRIBUTE_OF_TRACK · traitScaleOf · scaleLifeRows · scaleFieldLevel
 *   Guards     LEVEL_GUARD_KINDS · guardsLevels(skill) · withLevelGuards(lowered, full)
 *   Emblems    ThawPoint · missedRequirementOf · GateSide · FrozenCause · idleFeedersOf · frozenEmblemsOf · frozenLineOf ·
 *              FROZEN_WORD · FROZEN_NOTE · FROZEN_HINT
 *   Words      conditionPercent · idleDaysText · conditionTextOf · conditionLineOf · conditionRestoreOf · conditionNoteOf · conditionShows ·
 *              traitsConditionLineOf · conditionRuleLines
 */
import { addDays, type DayKey } from "./life-day";
import { isDayKey } from "./life-economy";
import { ATTRIBUTE_META, type AttributeScores, type Composition, type FieldContribution } from "./attributes";
import { effectiveScoreFactor, meetsRequirements, type ActiveModifiers } from "./skill-gates";
import { TRACK_NAME, lifeRowName } from "./life-tracks";
import { KNOWLEDGE_NAME, STATUS_KEYS, STATUS_SOURCE, type StatusKey } from "./status-panel";
import type { Skill, SkillEffectKind } from "./skill-pool";
import type { Track } from "./life-types";

// ── Launch ────────────────────────────────────────────────────────────────

/**
 * The first life day condition decay is in force (D24). Null keeps it inert: no read, no condition, no frozen emblem.
 * Set in the launch commit only, on the user's direct go; a code constant survives a 'life' reset.
 */
export const DECAY_LAUNCH_DAY = null as DayKey | null;

/** Outside production, a valid 'YYYY-MM-DD' here overrides DECAY_LAUNCH_DAY (the rehearsal server, the sims). */
export const DECAY_LAUNCH_DAY_ENV = "XTNL_DECAY_LAUNCH_DAY";

/** The variables the switch reads. Defaults to process.env; the checks pass their own. */
export interface DecayEnv {
  NODE_ENV?: string;
  XTNL_DECAY_LAUNCH_DAY?: string;
}

/** Each variable read by name, so a bundler can inline NODE_ENV; on a client the XTNL_ one is undefined (a server decision). */
function readEnv(env?: DecayEnv): DecayEnv {
  if (env) return env;
  if (typeof process === "undefined" || !process.env) return {};
  return { NODE_ENV: process.env.NODE_ENV, XTNL_DECAY_LAUNCH_DAY: process.env.XTNL_DECAY_LAUNCH_DAY };
}

/** The launch day in force: outside production a valid XTNL_DECAY_LAUNCH_DAY, else DECAY_LAUNCH_DAY. */
export function decayLaunchDay(env?: DecayEnv): DayKey | null {
  const e = readEnv(env);
  if (e.NODE_ENV !== "production") {
    const override = e.XTNL_DECAY_LAUNCH_DAY?.trim();
    if (isDayKey(override)) return override;
  }
  return DECAY_LAUNCH_DAY;
}

/** Condition decay is in force on life day `day`: on and after the launch day; never while there is none. */
export function decayOn(day: DayKey, launchDay: DayKey | null = decayLaunchDay()): boolean {
  return launchDay != null && day >= launchDay;
}

/**
 * The first day condition decay is in force: the later of its own launch day and Duty's (a rest, sick or vacation day
 * is declared, and read as held, only once Duty is live, so before then a day away could not be told from an idle
 * one). Null while either is unset. What loadConditionBasis counts idle days from, and what the rules page reads.
 */
export function decayFromOf(decayLaunch: DayKey | null, dutyLaunch: DayKey | null): DayKey | null {
  if (decayLaunch == null || dutyLaunch == null) return null;
  return decayLaunch > dutyLaunch ? decayLaunch : dutyLaunch;
}

// ── The curve ─────────────────────────────────────────────────────────────

/** The lowest a condition goes (D24): neglect halves a contribution at most, never erases it. */
export const CONDITION_FLOOR = 0.5;

/** Idle days that cost nothing (the blueprint's 72-hour grace). */
export const CONDITION_GRACE_DAYS = 3;

/** How fast an idle attribute or skill loses condition. */
export type DecayClass = "PHYSICAL" | "COGNITIVE" | "OTHER";

/** λ a day past the grace (D24): physical 0.02, cognitive 0.01, the rest 0.005. */
export const DECAY_LAMBDA: Readonly<Record<DecayClass, number>> = { PHYSICAL: 0.02, COGNITIVE: 0.01, OTHER: 0.005 };

/** Each attribute's class: Vitality is physical, Intellect and Craft cognitive, Duty and Care the rest. */
export const ATTRIBUTE_DECAY_CLASS: Readonly<Record<StatusKey, DecayClass>> = {
  VITALITY: "PHYSICAL",
  INTELLECT: "COGNITIVE",
  CRAFT: "COGNITIVE",
  DUTY: "OTHER",
  CARE: "OTHER",
};

/** A skill's class: an exercise skill (walks count) is physical; any other takes its attribute's. */
export function skillDecayClass(s: { attribute: string; kind: string }): DecayClass {
  if (s.kind === "EXERCISE") return "PHYSICAL";
  return ATTRIBUTE_DECAY_CLASS[s.attribute as StatusKey] ?? "OTHER";
}

/** max(CONDITION_FLOOR, e^(−λ·max(0, idleDays − CONDITION_GRACE_DAYS))): 1 through the grace, never under the floor. */
export function conditionOf(idleDays: number, lambda: number): number {
  const idle = Number.isFinite(idleDays) ? Math.max(0, Math.floor(idleDays)) : 0;
  const l = Number.isFinite(lambda) ? Math.max(0, lambda) : 0;
  const past = Math.max(0, idle - CONDITION_GRACE_DAYS);
  return past === 0 ? 1 : Math.max(CONDITION_FLOOR, Math.exp(-l * past));
}

/** A bound on the days one count walks (ten years): a sanity bound, never reached by a real launch. */
const IDLE_SCAN_MAX = 3660;

/**
 * Idle days on `today`: each life day from the later of `launch` and the day after `lastDay`, up to the day before
 * `today`, that is not held. Zero when nothing was ever practised (`lastDay` null: nothing to keep), when the last
 * practice is today, and before the launch day.
 */
export function idleDaysOf(p: { lastDay: DayKey | null; launch: DayKey; today: DayKey; held?: ReadonlySet<DayKey> | null }): number {
  if (p.lastDay == null || p.lastDay >= p.today || p.today <= p.launch) return 0;
  const after = addDays(p.lastDay, 1);
  let d = after > p.launch ? after : p.launch;
  let idle = 0;
  for (let i = 0; d < p.today && i < IDLE_SCAN_MAX; i++, d = addDays(d, 1)) if (!p.held?.has(d)) idle += 1;
  return idle;
}

// ── Reads ─────────────────────────────────────────────────────────────────

/** What skill-decay-server reads once a day: the launch, today, the held days and each attribute's last practice. */
export interface ConditionBasis {
  launch: DayKey;
  today: DayKey;
  /** Held days from the launch to yesterday (rest, sick, vacation, a rest token), ascending: never idle. */
  held: readonly DayKey[];
  /** Each attribute's last practice day (on or before today); null: never practised. */
  last: Readonly<Record<StatusKey, DayKey | null>>;
}

/** One attribute's or skill's condition on the basis's day. */
export interface Condition {
  /** 0.5..1, exact (what the traits are scaled by). */
  condition: number;
  idleDays: number;
  lambda: number;
  /** Its last practice day; null: never practised. */
  lastDay: DayKey | null;
}

const heldOf = (b: ConditionBasis): ReadonlySet<DayKey> => new Set(b.held);

function conditionFrom(lastDay: DayKey | null, lambda: number, b: ConditionBasis, held: ReadonlySet<DayKey>): Condition {
  const idleDays = idleDaysOf({ lastDay, launch: b.launch, today: b.today, held });
  return { condition: conditionOf(idleDays, lambda), idleDays, lambda, lastDay };
}

/** One attribute's condition. */
export function attributeConditionOf(key: StatusKey, b: ConditionBasis, held: ReadonlySet<DayKey> = heldOf(b)): Condition {
  return conditionFrom(b.last[key] ?? null, DECAY_LAMBDA[ATTRIBUTE_DECAY_CLASS[key]], b, held);
}

/** Every attribute's condition, in STATUS_KEYS order. */
export function attributeConditionsOf(b: ConditionBasis): Record<StatusKey, Condition> {
  const held = heldOf(b);
  return Object.fromEntries(STATUS_KEYS.map((k) => [k, attributeConditionOf(k, b, held)])) as Record<StatusKey, Condition>;
}

/** A skill as its condition reads it: its attribute, its kind and its last practice (competency.ts SkillView.lastDay). */
export interface ConditionSkill {
  id: string;
  name: string;
  attribute: string;
  kind: string;
  lastDay: DayKey | null;
}

/** One skill's condition: its class's λ over its own idle days. */
export function skillConditionOf(s: Pick<ConditionSkill, "attribute" | "kind" | "lastDay">, b: ConditionBasis, held: ReadonlySet<DayKey> = heldOf(b)): Condition {
  return conditionFrom(s.lastDay ?? null, DECAY_LAMBDA[skillDecayClass(s)], b, held);
}

// ── Items: the Status rows, the skills, the audit and the phone ───────────

/** The name an attribute's condition is told under: its source's (Body, Knowledge, Craft, Duty, Care), as on the Status card. */
export const CONDITION_NAME: Readonly<Record<StatusKey, string>> = Object.fromEntries(
  STATUS_KEYS.map((k) => {
    const source = STATUS_SOURCE[k];
    return [k, source === "KNOWLEDGE" ? KNOWLEDGE_NAME : TRACK_NAME[source]];
  })
) as Record<StatusKey, string>;

/** One attribute's or skill's condition, named. */
export interface ConditionItem {
  kind: "attribute" | "skill";
  /** The attribute's StatusKey, or the skill's id. */
  key: string;
  name: string;
  /** For a skill: its attribute (a StatusKey). */
  attribute: string;
  /** For a skill: its own kind (competency.ts SkillKind; EXERCISE: a walk practises it too). Absent on an attribute. */
  skillKind?: string;
  condition: number;
  idleDays: number;
}

/** Every attribute (STATUS_KEYS order), then every skill (as given), each with its condition. */
export function conditionItemsOf(b: ConditionBasis, skills: readonly ConditionSkill[] = []): ConditionItem[] {
  const held = heldOf(b);
  return [
    ...STATUS_KEYS.map((k): ConditionItem => {
      const c = attributeConditionOf(k, b, held);
      return { kind: "attribute", key: k, name: CONDITION_NAME[k], attribute: k, condition: c.condition, idleDays: c.idleDays };
    }),
    ...skills.map((s): ConditionItem => {
      const c = skillConditionOf(s, b, held);
      return { kind: "skill", key: s.id, name: s.name, attribute: s.attribute, skillKind: s.kind, condition: c.condition, idleDays: c.idleDays };
    }),
  ];
}

/** The phone lists what is under this (the plan's /check `skills`). */
export const CHECK_CONDITION_BELOW = 0.9;

/**
 * To 3 decimals, rounded down (the 1e-9 guard of conditionPercent): the phone floors the whole percent of what it is
 * sent, so a rounded-up 0.560 for 0.5599 would read 56% there and 55% on the web. Floored, both say 55%.
 */
const floor3 = (x: number) => Math.floor(x * 1000 + 1e-9) / 1000;

/** /check's `skills`: every item under CHECK_CONDITION_BELOW, the lowest first, the condition to 3 decimals (rounded down). None while off. */
export function checkConditionsOf(items: readonly ConditionItem[] | null): { kind: "attribute" | "skill"; name: string; condition: number; idleDays: number }[] {
  if (!items) return [];
  return items
    .filter((i) => i.condition < CHECK_CONDITION_BELOW)
    .sort((a, b) => a.condition - b.condition || b.idleDays - a.idleDays || a.name.localeCompare(b.name))
    .map((i) => ({ kind: i.kind, name: i.name, condition: floor3(i.condition), idleDays: i.idleDays }));
}

// ── Traits (D24b) ─────────────────────────────────────────────────────────

/** What each trait source is scaled by: every Field row by Intellect's condition, each life row by its track's attribute's. */
export interface TraitScale {
  field: number;
  life: Readonly<Record<Track, number>>;
}

/** The attribute each track's life row is counted under (Body → Vitality); every Field row is Intellect's. */
export const ATTRIBUTE_OF_TRACK: Readonly<Record<Track, StatusKey>> = { BODY: "VITALITY", DUTY: "DUTY", CRAFT: "CRAFT", CARE: "CARE" };

/** The trait scale from the attributes' conditions. */
export function traitScaleOf(c: Readonly<Record<StatusKey, Pick<Condition, "condition">>>): TraitScale {
  return {
    field: c.INTELLECT.condition,
    life: { BODY: c[ATTRIBUTE_OF_TRACK.BODY].condition, DUTY: c[ATTRIBUTE_OF_TRACK.DUTY].condition, CRAFT: c[ATTRIBUTE_OF_TRACK.CRAFT].condition, CARE: c[ATTRIBUTE_OF_TRACK.CARE].condition },
  };
}

const TRACK_OF_ROW: ReadonlyMap<string, Track> = new Map((["BODY", "DUTY", "CRAFT", "CARE"] as const).map((t) => [lifeRowName(t), t]));

/** The life rows ('Life · Body' …) at their level × their attribute's condition; any other row as it is. */
export function scaleLifeRows<R extends FieldContribution>(rows: readonly R[], scale: TraitScale): R[] {
  return rows.map((r) => {
    const track = TRACK_OF_ROW.get(r.fieldName);
    return track ? { ...r, level: r.level * scale.life[track] } : r;
  });
}

/** A Field row's level × Intellect's condition. */
export function scaleFieldLevel(level: number, scale: TraitScale): number {
  return level * scale.field;
}

// ── Level guards (D24: levels never drop) ─────────────────────────────────

/**
 * The effects that keep a card's level (srs.ts and forgetting.ts read them): a DEGRADATION_WARD's weekly charges, a
 * GRACE_EXTENSION's days before forgetting, an INTERVAL_DILATION's longer spacing and a STRIKE_TOLERANCE's extra
 * misses before a degrade. D24's "levels never drop" outranks D24b's pause here: an emblem with one of these never
 * freezes (it is in effect whenever the full traits meet it), so an idle attribute never costs a card a level.
 */
export const LEVEL_GUARD_KINDS: readonly SkillEffectKind[] = ["DEGRADATION_WARD", "GRACE_EXTENSION", "INTERVAL_DILATION", "STRIKE_TOLERANCE"];

/** Whether an emblem's effect guards a card's level (LEVEL_GUARD_KINDS): such an emblem is never frozen. */
export function guardsLevels(skill: Pick<Skill, "effect">): boolean {
  return LEVEL_GUARD_KINDS.includes(skill.effect.kind);
}

/**
 * The modifiers in force while decay is (skill-effects): the lowered fold, with every level guard (ward charges, grace
 * days, the interval multiplier, extra strikes) taken from the full traits' fold. A frozen emblem's resonance can still
 * move the loadout's power share, so the guards are read whole from the fold decay never touched: forgetting, a
 * degrade's grace and the next interval are exactly what they are with decay off.
 */
export function withLevelGuards(lowered: ActiveModifiers, full: ActiveModifiers): ActiveModifiers {
  return { ...lowered, wardCharges: full.wardCharges, graceExtraDays: full.graceExtraDays, intervalMultiplier: full.intervalMultiplier, extraStrikes: full.extraStrikes };
}

// ── The emblem freeze (D24b) ──────────────────────────────────────────────

/** The requirement a frozen emblem thaws at: the first the lowered traits miss, in the gate's order. */
export interface ThawPoint {
  attribute: keyof AttributeScores;
  /** The trait's label ("Physical"). */
  label: string;
  need: number;
}

type GateModifiers = { resonancePercent?: number; attributePenaltyPercent?: number };

const requirementsOf = (skill: Pick<Skill, "attributes" | "requiredScore" | "breadthRequirement">) => [
  ...skill.attributes.map((a) => ({ attribute: a, need: skill.requiredScore })),
  ...(skill.breadthRequirement ?? []).map((b) => ({ attribute: b.attribute, need: b.requiredScore })),
];

/** The first requirement (its own attributes, then an Ultimate's breadth) `scores` miss at the gate's factor (RESONANCE up, DOUBT down); null when every one is met. */
export function missedRequirementOf(skill: Pick<Skill, "attributes" | "requiredScore" | "breadthRequirement">, scores: AttributeScores, modifiers: GateModifiers = {}): ThawPoint | null {
  const factor = effectiveScoreFactor(modifiers.resonancePercent ?? 0, modifiers.attributePenaltyPercent ?? 0);
  const miss = requirementsOf(skill).find((r) => scores[r.attribute] * factor < r.need);
  return miss ? { attribute: miss.attribute, label: ATTRIBUTE_META[miss.attribute].label, need: miss.need } : null;
}

/** One side of the progression fold, as frozenEmblemsOf reads it: its traits and the RESONANCE its first pass produced. */
export interface GateSide {
  scores: AttributeScores;
  resonancePercent: number;
}

/** An idle attribute behind a frozen emblem: the trait it missed is fed by it, and one practice on it brings it back. */
export interface FrozenCause {
  key: StatusKey;
  /** Its Status card name (Body, Knowledge, Craft, Duty, Care). */
  name: string;
  condition: number;
  idleDays: number;
}

/**
 * The idle attributes (condition under 100%) that feed `trait`, the lowest condition first: Intellect through any Field
 * row with weight on it, a track's attribute (ATTRIBUTE_OF_TRACK) through its life row. What a frozen emblem's line
 * names, so it says what is idle and what thaws it rather than only the trait.
 */
export function idleFeedersOf(
  trait: keyof AttributeScores,
  sources: { fields: readonly { level: number; composition: Composition }[]; life: readonly FieldContribution[] },
  c: Readonly<Record<StatusKey, Pick<Condition, "condition" | "idleDays">>>
): FrozenCause[] {
  const feeds = new Set<StatusKey>();
  if (sources.fields.some((f) => f.level > 0 && f.composition[trait] > 0)) feeds.add("INTELLECT");
  for (const r of sources.life) {
    const track = TRACK_OF_ROW.get(r.fieldName);
    if (track && r.level > 0 && r.composition[trait] > 0) feeds.add(ATTRIBUTE_OF_TRACK[track]);
  }
  return STATUS_KEYS.filter((k) => feeds.has(k) && c[k].condition < 1)
    .map((k) => ({ key: k, name: CONDITION_NAME[k], condition: c[k].condition, idleDays: c[k].idleDays }))
    .sort((a, b) => a.condition - b.condition || b.idleDays - a.idleDays);
}

/**
 * The frozen emblems among `owned` (D24b): each one the condition-lowered traits miss while the full traits (every
 * condition at 100%) meet it, with the line its first missed requirement and the idle attributes feeding that trait give
 * ("Frozen · Body 12 days idle · a Body tick thaws it (Physical 120)"). An emblem the lowered traits meet is in effect;
 * one the full traits miss too is dormant for another reason (its Fields fell), never the condition's doing, and is not
 * frozen; a level guard (guardsLevels) is never frozen (D24). Each side is gated at its own factor (its own pass's
 * RESONANCE, the same DOUBT penalty), exactly as skill-effects gates the loadout.
 */
export function frozenEmblemsOf(
  owned: readonly Skill[],
  lowered: GateSide,
  full: GateSide,
  penalty = 0,
  causesOf: (trait: keyof AttributeScores) => readonly FrozenCause[] = () => []
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of owned) {
    if (guardsLevels(s)) continue;
    if (meetsRequirements(s, lowered.scores, lowered.resonancePercent, penalty) || !meetsRequirements(s, full.scores, full.resonancePercent, penalty)) continue;
    const miss = missedRequirementOf(s, lowered.scores, { resonancePercent: lowered.resonancePercent, attributePenaltyPercent: penalty });
    if (miss) out[s.code] = frozenLineOf(miss, causesOf(miss.attribute));
  }
  return out;
}

/** The frozen state's word. */
export const FROZEN_WORD = "Frozen";

/** What a frozen emblem's detail and its slot say under the line: it is kept, paused, and practice thaws it. */
export const FROZEN_NOTE =
  "It stays yours. While an attribute is idle, its condition holds this trait under the requirement, so the emblem's effect and its slot's are paused. One practice on that attribute brings the trait back and thaws it, with nothing to unlock again.";

/** The graph's short word beside "Frozen" (a hover card): it is practice that thaws it, never waiting or buying. */
export const FROZEN_HINT = "thaws with practice, nothing to unlock";

/**
 * A frozen emblem's line: what is idle, what thaws it, and the trait it thaws at. One idle attribute: "Frozen · Knowledge
 * 12 days idle · a review or a new idea thaws it (Critical Thinking 14.2)"; more: "Frozen · Body 12 days idle, Craft 9
 * days idle · practice on them thaws it (Physical 120)"; none known: "Frozen · thaws at Physical 120".
 */
export function frozenLineOf(t: Pick<ThawPoint, "label" | "need">, causes: readonly Pick<FrozenCause, "key" | "name" | "idleDays">[] = []): string {
  const need = Number.isInteger(t.need) ? t.need.toLocaleString("en-GB") : t.need.toLocaleString("en-GB", { maximumFractionDigits: 1 });
  if (causes.length === 0) return `${FROZEN_WORD} · thaws at ${t.label} ${need}`;
  const idle = causes.map((c) => `${c.name} ${idleDaysText(c.idleDays)}`).join(", ");
  const thaw = causes.length === 1 ? `${conditionRestoreOf({ kind: "attribute", key: causes[0].key, attribute: causes[0].key })} thaws it` : "practice on them thaws it";
  return `${FROZEN_WORD} · ${idle} · ${thaw} (${t.label} ${need})`;
}

// ── Words ─────────────────────────────────────────────────────────────────

/** A condition as a whole percent, rounded down (so nothing below 100% ever reads 100%). */
export function conditionPercent(c: number): number {
  return Math.floor(Math.max(0, Math.min(1, c)) * 100 + 1e-9);
}

/** "12 days idle", "1 day idle". */
export const idleDaysText = (n: number): string => `${n} ${n === 1 ? "day" : "days"} idle`;
const daysText = idleDaysText;

/** "82% · 12 days idle". */
export function conditionLineOf(c: Pick<Condition, "condition" | "idleDays">): string {
  return `${conditionPercent(c.condition)}% · ${daysText(c.idleDays)}`;
}

/** The plan's words: "Body 82% · 12 days idle". */
export function conditionTextOf(name: string, c: Pick<Condition, "condition" | "idleDays">): string {
  return `${name} ${conditionLineOf(c)}`;
}

/**
 * What brings an item back to 100%: "a Body tick", "a review or a new idea", "a tick of a task linked to it", and for
 * an exercise skill (competency.ts sets its last practice from the latest walk too) "a walk or a tick of a task linked
 * to it".
 */
export function conditionRestoreOf(i: Pick<ConditionItem, "kind" | "key" | "attribute" | "skillKind">): string {
  if (i.kind === "skill") return i.skillKind === "EXERCISE" ? "a walk or a tick of a task linked to it" : "a tick of a task linked to it";
  return i.key === "INTELLECT" ? "a review or a new idea" : `a ${CONDITION_NAME[i.key as StatusKey] ?? "track"} tick`;
}

/** A Status row's or a skill's note while it is below 100%: "Body 82% · 12 days idle · a Body tick restores it". */
export function conditionNoteOf(i: Pick<ConditionItem, "kind" | "key" | "attribute" | "skillKind" | "name" | "condition" | "idleDays">): string {
  return `${conditionTextOf(i.name, i)} · ${conditionRestoreOf(i)} restores it`;
}

/** Whether a condition is worth a line: below 100% (inside the grace nothing has moved). */
export const conditionShows = (c: Pick<Condition, "condition"> | null | undefined): boolean => c != null && c.condition < 1;

/**
 * The Traits card's one quiet line while any attribute is below 100% (D24b: the radar reads the lowered traits), the
 * lowest first: "Read at condition: Body 70% · a Body tick restores it" (more: "Read at condition: Body 70%, Craft 92% ·
 * practice restores them"). Null when every attribute is at 100%, and while decay is off (no conditions).
 */
export function traitsConditionLineOf(c: Readonly<Record<StatusKey, Pick<Condition, "condition" | "idleDays">>> | null | undefined): string | null {
  if (!c) return null;
  const low = STATUS_KEYS.filter((k) => c[k].condition < 1).sort((a, b) => c[a].condition - c[b].condition || c[b].idleDays - c[a].idleDays);
  if (low.length === 0) return null;
  const parts = low.map((k) => `${CONDITION_NAME[k]} ${conditionPercent(c[k].condition)}%`).join(", ");
  const restore = low.length === 1 ? `${conditionRestoreOf({ kind: "attribute", key: low[0], attribute: low[0] })} restores it` : "practice restores them";
  return `Read at condition: ${parts} · ${restore}`;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The rules page's lines (rendered only once decay is in force), every figure from the constants above. */
export function conditionRuleLines(): string[] {
  return [
    `An attribute or a skill left idle loses condition, never history: levels, XP, hours, titles and the character level never drop. Condition is ${pct(1)} through ${CONDITION_GRACE_DAYS} idle days, then falls as e^(−λ × the idle days past them), never under ${pct(CONDITION_FLOOR)}.`,
    `λ is ${DECAY_LAMBDA.PHYSICAL} a day for Body (and an exercise skill), ${DECAY_LAMBDA.COGNITIVE} for Knowledge and Craft, and ${DECAY_LAMBDA.OTHER} for Duty and Care; a skill takes its attribute's.`,
    `A day counts as idle only once it is over, and only from the day this started, which is never before Duty: a rest, sick or vacation day and a rest token's day are never idle. One tick on the track (a review or a new idea for Knowledge; for a skill, a linked task's tick, or a walk for an exercise skill) brings it back to ${pct(1)} at once.`,
    `While an attribute is below ${pct(1)}, the traits it feeds count it at its condition. An emblem whose requirement they then miss is frozen, not lost: it stays yours, its effect and its slot's pause, and one practice on the idle attribute thaws it, with nothing to unlock again. Waiting never does: condition only comes back with practice.`,
    `An emblem that guards a card's level (a ward, grace before forgetting, longer intervals, strike tolerance) never freezes, so an idle attribute never costs a card a level.`,
  ];
}
