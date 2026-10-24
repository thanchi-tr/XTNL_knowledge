/**
 * The weekly audit's "Decaying this week" block (blueprint 5.2c; docs/life-plan/blueprint-plan-2026-10-22.md P12):
 * what fell over the audited week, built only from what the app already keeps. The audit reads decay and never applies
 * any: nothing here writes, pays, judges or moves a level. Each line names one thing and links to its fix.
 *
 *   streak   a life track's kept-week run that the week's judge ended (its trait bonus goes with it)
 *   field    a Field that fell a level this week and has not won it back
 *   domain   a Domain that did the same (the ideas fading in it are what bring it back)
 *   habit    a habit whose strength fell over the week (whole points), first those that dropped a rung
 *   ideas    the ideas past their grace now (forgetting.ts ideaStatusOf, as the bell and the phone's `fading` count)
 *   trait    a trait (one of the thirteen attributes) below its score at the 7-day FieldSnapshot: the Fields' breadth
 *            and the life rows, as progress-rate.ts measures growth; snapshot rows dated before xp.ts LEVEL_RULE_SINCE
 *            hold the old Field level and are ignored (no row there is ever an error, only no comparison)
 *   mp       mastery points eroded by idle decay this week (mastery.ts decayStaleMastery's DECAY rows)
 *   condition  (blueprint P28, only while DECAY_LAUNCH_DAY is in force) an attribute or a skill whose condition is below
 *            100% at the read (skill-decay.ts conditionItemsOf): its idle days and what brings it back. The audit reads
 *            it and never applies it; before the launch the source is not read at all (not counted unread either)
 *
 * The block is stored with the frozen copy (AuditReceipt.decaying), so a frozen week keeps the decay it was frozen
 * with. A source that could not be read is left out and counted in `unread`, never guessed. Copy stays neutral (harm
 * H12 in the plan): what fell and what brings it back, never a verdict.
 *
 * Pure and client-importable: attributes, xp, habit, life-tracks, life-day and today-board's labels; no Prisma, no clock.
 *
 *   Shapes     DecayKind · DECAY_KINDS · DecayLine · AuditDecaying · NO_DECAY
 *   Sizes      DECAY_PER_KIND · DECAY_SHOWN · DECAY_TOP
 *   Windows    TRAIT_LOOKBACK_DAYS · traitSinceOf(now) · snapshotThenOf(rows, since) · streakWeekOf(monday, today)
 *   Facts      TraitField · traitScoresOf(fields, life) · LevelDropFact · HabitStrengthFact · StreakFact · DecayFacts
 *   Lines      traitLinesOf · dropLinesOf · ideaLinesOf · habitLinesOf · streakLinesOf · mpLinesOf · conditionLinesOf ·
 *              decayingOf(facts)
 *   The copy   decayHeading(d) · decayMoreOf(d) · parseDecaying(json)
 */
import { ATTRIBUTES, ATTRIBUTE_META, computeAttributeScores, type AttributeScores, type Composition, type FieldContribution } from "./attributes";
import { attributeSlug } from "./attribute-themes";
import { LEVEL_RULE_SINCE, breadthAsOf } from "./xp";
import { HABIT_RUNGS, rungOf } from "./habit";
import { TRACK_NAME, keptWeekBonusPercent } from "./life-tracks";
import { addDays, type DayKey } from "./life-day";
import { WEEK_JUDGE_LAG_DAYS } from "./life-economy";
import { shortDate } from "./today-board";
import type { Track } from "./life-types";
import { conditionPercent, conditionRestoreOf, idleDaysText, type ConditionItem } from "./skill-decay";

// ── Shapes ────────────────────────────────────────────────────────────────

/** What a line is about, in the block's order (the most telling first). */
export type DecayKind = "streak" | "field" | "domain" | "habit" | "ideas" | "condition" | "trait" | "mp";
/** Blueprint P28 adds "condition" before "trait": an idle attribute is what lowers the traits under it. */
export const DECAY_KINDS: readonly DecayKind[] = ["streak", "field", "domain", "habit", "ideas", "condition", "trait", "mp"];

/** One thing that fell, and where its fix starts. */
export interface DecayLine {
  kind: DecayKind;
  /** Unique within the block: 'trait:LOGIC', 'domain:<id>', 'habit:<templateId>', 'streak:BODY', 'ideas', 'mp', 'condition:VITALITY', 'condition:skill:<id>'. */
  key: string;
  title: string;
  detail: string;
  /** Where its fix starts (a link on the card). */
  href: string;
  /** The link's word: "Review", "Open", "See", "Unlock". */
  action: string;
}

export interface AuditDecaying {
  /** Everything found decaying, each thing once (the lines shown are at most DECAY_SHOWN of them). */
  count: number;
  /** The lines shown: in DECAY_KINDS order, at most DECAY_PER_KIND of a kind and DECAY_SHOWN in all. */
  lines: DecayLine[];
  /** Sources that could not be read (left out, never guessed); 0 when every one was read. */
  unread: number;
}

export const NO_DECAY: AuditDecaying = { count: 0, lines: [], unread: 0 };

/** At most this many lines of one kind (the rest are counted, not shown). */
export const DECAY_PER_KIND = 3;
/** At most this many lines in the block. */
export const DECAY_SHOWN = 8;
/** The phone shows this many (the `week` reply's `decaying.top`). */
export const DECAY_TOP = 3;

/**
 * The Last week card's anchor on /today/week (its section's id): what a broken streak's line opens, the judged week
 * that ended the run, kept or not per track with the reason. The card sits on the page the audit is on, and in the
 * review run's first step under it, so the line scrolls to it there (WeekAuditCard links the anchor alone) and never
 * leaves the run.
 */
export const LAST_WEEK_ANCHOR = "last-week";

// ── Windows ───────────────────────────────────────────────────────────────

/** Traits are measured against the FieldSnapshot this many days back (the You radar's 7-day ghost). */
export const TRAIT_LOOKBACK_DAYS = 7;

/** The FieldSnapshot day TRAIT_LOOKBACK_DAYS before `now`: snapshot rows are dated at UTC midnight of the day written. */
export function traitSinceOf(now: Date): DayKey {
  return new Date(now.getTime() - TRAIT_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The snapshot a trait is measured against: the earliest row on or after `since` and on or after LEVEL_RULE_SINCE
 * (a row before the depth-first rule holds the old Σ L^0.75 Field level, so it is skipped, never read as a drop).
 * Null when there is none.
 */
export function snapshotThenOf<R extends { day: DayKey; level: number }>(rows: readonly R[], since: DayKey): R | null {
  const floor = since > LEVEL_RULE_SINCE ? since : LEVEL_RULE_SINCE;
  let best: R | null = null;
  for (const r of rows) {
    if (r.day < floor || !Number.isFinite(r.level)) continue;
    if (!best || r.day < best.day) best = r;
  }
  return best;
}

/**
 * The judged week whose verdict fell inside the audited week: the week that ended the Sunday before its Monday,
 * judged that Wednesday (life-weeks judgeDayOf). Null before that Wednesday (its verdict is not in yet).
 */
export function streakWeekOf(monday: DayKey, today: DayKey): DayKey | null {
  const sunday = addDays(monday, -1);
  return today >= addDays(sunday, WEEK_JUDGE_LAG_DAYS) ? sunday : null;
}

// ── Facts ─────────────────────────────────────────────────────────────────

/** A Field as the trait read sees it: its breadth now (xp.ts fieldBreadth), its stored level now and at the snapshot. */
export interface TraitField {
  name: string;
  /** What it gives the traits now: its breadth. */
  breadth: number;
  /** Its stored Field level now (the units its snapshot is in). */
  fieldLevel: number;
  /** Its level at the snapshot (snapshotThenOf), or null without one: then it reads as now. */
  thenLevel: number | null;
  composition: Composition;
}

/**
 * The traits then and now (progress-rate.ts's method): each Field's breadth now, and at the snapshot its breadth
 * scaled by the share of today's Field level that stood then (xp.ts breadthAsOf); the life rows at both ends.
 */
export function traitScoresOf(
  fields: readonly TraitField[],
  life: { then: readonly FieldContribution[]; now: readonly FieldContribution[] }
): { then: AttributeScores; now: AttributeScores } {
  const row = (f: TraitField, level: number): FieldContribution => ({ fieldName: f.name, level, composition: f.composition });
  return {
    then: computeAttributeScores([...fields.map((f) => row(f, f.thenLevel == null ? f.breadth : breadthAsOf(f.breadth, f.fieldLevel, f.thenLevel))), ...life.then]),
    now: computeAttributeScores([...fields.map((f) => row(f, f.breadth)), ...life.now]),
  };
}

/** A Domain or a Field that fell a level this week (level < droppedFrom, not yet won back), with the ideas fading in it. */
export interface LevelDropFact {
  kind: "domain" | "field";
  id: string;
  name: string;
  /** The Field whose Library page holds it (a Field's own id for a Field). */
  fieldId: string;
  level: number;
  droppedFrom: number;
  /** Its ideas past grace now. */
  fading: number;
}

/** A habit's strength (habit.ts habitStrength, 0..1) at the start of the week and now. */
export interface HabitStrengthFact {
  id: string;
  title: string;
  before: number;
  after: number;
}

/** A life track's kept-week run (life-tracks TrackState.keptStreak). */
export interface StreakFact {
  track: Track;
  keptStreak: number;
}

/** What the server read (audit-decay-server.ts readAuditDecay); a source absent or null was not read. */
export interface DecayFacts {
  traits?: { then: AttributeScores; now: AttributeScores } | null;
  drops?: readonly LevelDropFact[] | null;
  ideas?: { fading: number; forgetting: number } | null;
  habits?: readonly HabitStrengthFact[] | null;
  /** The runs before and after the judged week (streakWeekOf), that week's Sunday. */
  streaks?: { before: readonly StreakFact[]; after: readonly StreakFact[]; sunday: DayKey } | null;
  /** This week's idle-decay rows (MasteryLedgerEntry reason DECAY): each delta is negative. */
  mp?: readonly { delta: number }[] | null;
  /** P28: every attribute's and skill's condition at the read (skill-decay.ts conditionItemsOf); null while decay is off. */
  conditions?: readonly ConditionItem[] | null;
  /** Sources that failed to read. */
  unread?: number;
}

// ── Lines ─────────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** A score as the line prints it: one decimal. */
const one = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
/** A stored level as the line prints it (every level is whole; a Field's is stored as a float). */
const levelText = (l: number) => `L${Number.isInteger(l) ? l : Number(l.toFixed(1))}`;
/** MP as the line prints it: up to two decimals. */
const mpText = (x: number) => String(Number(x.toFixed(2)));

/** A trait whose score, to one decimal, is lower than at the snapshot; the largest fall first. */
export function traitLinesOf(t: { then: AttributeScores; now: AttributeScores }): DecayLine[] {
  return ATTRIBUTES.map((a) => ({ a, then: t.then[a], now: t.now[a] }))
    .filter((x) => Number(one(x.now)) < Number(one(x.then)))
    .sort((x, y) => y.then - y.now - (x.then - x.now) || ATTRIBUTES.indexOf(x.a) - ATTRIBUTES.indexOf(y.a))
    .map(({ a, then, now }) => ({
      kind: "trait" as const,
      key: `trait:${a}`,
      title: `${ATTRIBUTE_META[a].label} ${one(then)} → ${one(now)}`,
      detail: "Lower than a week ago. Its page shows the Fields and life tracks that feed it.",
      href: `/skills/${attributeSlug(a)}`,
      action: "Open",
    }));
}

/** Each Field, then each Domain, that fell this week: "Probability fell to L3 (from L4)", with the ideas fading in it. */
export function dropLinesOf(drops: readonly LevelDropFact[]): DecayLine[] {
  const line = (d: LevelDropFact): DecayLine => ({
    kind: d.kind,
    key: `${d.kind}:${d.id}`,
    title: `${d.name}${d.kind === "field" ? " field" : ""} fell to ${levelText(d.level)} (from ${levelText(d.droppedFrom)})`,
    detail: d.fading > 0 ? `${plural(d.fading, "idea")} fading in it. Reviewing ${d.fading === 1 ? "it" : "them"} brings the level back.` : "Its ideas count for less until they are reviewed.",
    href: `/library/field/${d.fieldId}`,
    action: "Open",
  });
  const by = (a: LevelDropFact, b: LevelDropFact) => b.droppedFrom - b.level - (a.droppedFrom - a.level) || a.name.localeCompare(b.name);
  const valid = drops.filter((d) => d.level < d.droppedFrom);
  return [...valid.filter((d) => d.kind === "field").sort(by), ...valid.filter((d) => d.kind === "domain").sort(by)].map(line);
}

/** The ideas past grace now: one line, "12 ideas fading", opening Review. None at 0. */
export function ideaLinesOf(c: { fading: number; forgetting: number }): DecayLine[] {
  const n = Math.max(0, c.fading) + Math.max(0, c.forgetting);
  if (n === 0) return [];
  return [
    {
      kind: "ideas",
      key: "ideas",
      title: `${plural(n, "idea")} fading`,
      detail:
        c.forgetting > 0
          ? `${c.forgetting} already losing levels. Past grace, an idea counts for less every day until it is reviewed.`
          : "Past grace, an idea counts for less in its Domain every day until it is reviewed.",
      href: "/review",
      action: "Review",
    },
  ];
}

const rungIndex = (s: number) => HABIT_RUNGS.findIndex((r) => r.rung === rungOf(s));
const pct = (s: number) => Math.round(Math.max(0, Math.min(1, s)) * 100);

/** A habit whose strength fell by a whole point or more: those that dropped a rung first, then the largest fall. */
export function habitLinesOf(habits: readonly HabitStrengthFact[]): DecayLine[] {
  return habits
    .filter((h) => Number.isFinite(h.before) && Number.isFinite(h.after) && pct(h.after) < pct(h.before))
    .map((h) => ({ h, rung: rungIndex(h.after) < rungIndex(h.before) }))
    .sort((a, b) => Number(b.rung) - Number(a.rung) || b.h.before - b.h.after - (a.h.before - a.h.after) || a.h.title.localeCompare(b.h.title))
    .map(({ h, rung }) => ({
      kind: "habit" as const,
      key: `habit:${h.id}`,
      title: rung ? `${h.title}: ${rungOf(h.before)} → ${rungOf(h.after)}` : `${h.title} weakened`,
      detail: `Strength ${pct(h.before)}% → ${pct(h.after)}% this week. Each kept day raises it again.`,
      href: `/today/habits#${encodeURIComponent(h.id)}`,
      action: "Open",
    }));
}

/** A track whose kept-week run the week's judge ended (a held week bridges a run, so only a missed one ends it). */
export function streakLinesOf(s: { before: readonly StreakFact[]; after: readonly StreakFact[]; sunday: DayKey }): DecayLine[] {
  const after = new Map(s.after.map((x) => [x.track, x.keptStreak]));
  const monday = addDays(s.sunday, -6);
  return s.before
    .filter((b) => b.keptStreak > 0 && (after.get(b.track) ?? b.keptStreak) < b.keptStreak)
    .sort((a, b) => b.keptStreak - a.keptStreak || a.track.localeCompare(b.track))
    .map((b) => {
      const bonus = keptWeekBonusPercent(b.keptStreak);
      return {
        kind: "streak" as const,
        key: `streak:${b.track}`,
        title: `${TRACK_NAME[b.track]}: ${plural(b.keptStreak, "kept week")} in a row ended`,
        detail: `The week of ${shortDate(monday)} was not kept${bonus > 0 ? `, so its +${Number(bonus.toFixed(1))}% to the traits is gone` : ""}. A kept week starts the run again.`,
        href: `/today/week#${LAST_WEEK_ANCHOR}`,
        action: "See",
      };
    });
}

/** Mastery points idle decay took this week: one line. None when nothing was taken. */
export function mpLinesOf(rows: readonly { delta: number }[]): DecayLine[] {
  const taken = rows.reduce((sum, r) => sum + (Number.isFinite(r.delta) && r.delta < 0 ? -r.delta : 0), 0);
  if (!(taken > 0.005)) return [];
  const days = rows.filter((r) => r.delta < 0).length;
  return [
    {
      kind: "mp",
      key: "mp",
      title: `${mpText(taken)} MP to idle decay`,
      detail: `${plural(days, "day")} of it this week: unspent points erode while an emblem they could already buy waits.`,
      href: "/skills",
      action: "Unlock",
    },
  ];
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * P28: each attribute and skill below 100%, the lowest first: "Body condition 82%", its idle days and what brings it back
 * (the levels, XP and hours never moved; an attribute's traits come back with it). It links to where its row is.
 */
export function conditionLinesOf(items: readonly ConditionItem[]): DecayLine[] {
  return items
    .filter((i) => Number.isFinite(i.condition) && i.condition < 1)
    .sort((a, b) => a.condition - b.condition || b.idleDays - a.idleDays || a.name.localeCompare(b.name))
    .map((i) => ({
      kind: "condition" as const,
      key: i.kind === "skill" ? `condition:skill:${i.key}` : `condition:${i.key}`,
      title: `${i.name} condition ${conditionPercent(i.condition)}%`,
      detail: `${capital(idleDaysText(i.idleDays))}. ${capital(conditionRestoreOf(i))} brings it back to ${conditionPercent(1)}%${i.kind === "attribute" ? ", and the traits it feeds with it" : ""}; nothing it built is lost.`,
      href: i.kind === "skill" ? "/you/skills" : "/you",
      action: "Open",
    }));
}

/** The block: every source read, its lines in DECAY_KINDS order, capped per kind and in all; count is uncapped. */
export function decayingOf(f: DecayFacts): AuditDecaying {
  const all: DecayLine[] = [
    ...(f.streaks ? streakLinesOf(f.streaks) : []),
    ...(f.drops ? dropLinesOf(f.drops) : []),
    ...(f.habits ? habitLinesOf(f.habits) : []),
    ...(f.ideas ? ideaLinesOf(f.ideas) : []),
    ...(f.conditions ? conditionLinesOf(f.conditions) : []),
    ...(f.traits ? traitLinesOf(f.traits) : []),
    ...(f.mp ? mpLinesOf(f.mp) : []),
  ];
  const lines: DecayLine[] = [];
  for (const kind of DECAY_KINDS) lines.push(...all.filter((l) => l.kind === kind).slice(0, DECAY_PER_KIND));
  return { count: all.length, lines: lines.slice(0, DECAY_SHOWN), unread: Math.max(0, Math.floor(f.unread ?? 0)) };
}

// ── The copy ──────────────────────────────────────────────────────────────

/** The block's heading: "Decaying this week · 4", or "Decaying this week" with none. */
export function decayHeading(d: Pick<AuditDecaying, "count">): string {
  return d.count > 0 ? `Decaying this week · ${d.count}` : "Decaying this week";
}

/** The line under the lines: what is not shown, what could not be read, or that nothing fell. Null with nothing to say. */
export function decayMoreOf(d: AuditDecaying): string | null {
  const parts: string[] = [];
  const hidden = d.count - d.lines.length;
  if (d.count === 0) parts.push(d.unread > 0 ? "Nothing found in what could be read." : "Nothing fell this week.");
  else if (hidden > 0) parts.push(`${hidden} more not shown.`);
  if (d.unread > 0) parts.push(`${plural(d.unread, "source")} couldn't be read.`);
  return parts.length > 0 ? parts.join(" ") : null;
}

const isCount = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;
const isLine = (x: unknown): x is DecayLine => {
  if (!x || typeof x !== "object") return false;
  const l = x as Record<string, unknown>;
  return DECAY_KINDS.includes(l.kind as DecayKind) && ["key", "title", "detail", "href", "action"].every((k) => typeof l[k] === "string") && String(l.href).startsWith("/");
};

/** A stored block read back (AuditReceipt.decaying), or null when absent or not one this version wrote. */
export function parseDecaying(json: unknown): AuditDecaying | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (!isCount(o.count) || !Array.isArray(o.lines) || !isCount(o.unread)) return null;
  const lines = o.lines.filter(isLine).map((l) => ({ kind: l.kind, key: l.key, title: l.title, detail: l.detail, href: l.href, action: l.action }));
  return { count: Math.max(o.count, lines.length), lines, unread: o.unread };
}
