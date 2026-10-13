/**
 * A Field at a glance: what the Library's Field pop-up (FieldSheet) and the
 * Field page (/library/field/[fieldId]) print. Pure (no Prisma, no clock):
 * src/lib/field-insight.ts reads the rows and hands them here, and
 * scripts/library-check.ts pins the aggregates on fixtures.
 *
 *   healthOf(ideas)                  share remembered (mean forgetting.ts retention) and the fading counts
 *   summarizeField(field, extras)    level and its way to the next, tier, 7-day change, the last drop,
 *                                    health, attributes, achievements, Boss, streak, quota, maintenance
 *   domainProgressOf(…)              a Domain's way to its next level, and what holds it (points or depth)
 *   *Text(…)                         the sentences both surfaces print
 *
 * Every figure is read from a row (honest numbers): nothing here estimates,
 * and an absent row reads as absent ("No 7-day record yet"), never as zero.
 */
import type { Attribute } from "@prisma/client";
import { ATTRIBUTES, ATTRIBUTE_META } from "@/lib/attributes";
import { fieldTier, nextTierAt } from "@/lib/field-tier";
import type { IdeaOutlook } from "@/lib/forgetting";
import type { DayKey } from "@/lib/life-day";
import { fieldStreakStep } from "@/lib/streak-curve";
import { MASTERY_LEVEL, domainLevelProgress, domainPointsLevel, fieldLevel, fieldLevelRaw, masteryDepth, retainedPoints, retainedShare } from "@/lib/xp";
import { byUrgency, levelText, plural, shortDate, type LibraryIdea, type LibraryStatus } from "./library-model";

const DAY = 86_400_000;

// ─── Health ─────────────────────────────────────────────────────────────────

/** What health reads from an idea: its level, whether it is archived, and its outlook's status and retention. */
export interface HealthIdea {
  level: number;
  isArchived: boolean;
  outlook: Pick<IdeaOutlook, "status" | "retention">;
}

export interface Health {
  /** Non-archived ideas. */
  ideas: number;
  /** Mean retention (forgetting.ts retentionFactor, via the outlook) over those ideas, 0..1; null with none. */
  remembered: number | null;
  /** By the outlook's status (disjoint): due inside its grace, fading, forgetting. */
  due: number;
  fading: number;
  forgetting: number;
  /** At or past MASTERY_LEVEL. */
  mastered: number;
}

export function healthOf(ideas: readonly HealthIdea[]): Health {
  const h: Health = { ideas: 0, remembered: null, due: 0, fading: 0, forgetting: 0, mastered: 0 };
  let sum = 0;
  for (const i of ideas) {
    if (i.isArchived) continue;
    h.ideas++;
    sum += Math.max(0, Math.min(1, Number.isFinite(i.outlook.retention) ? i.outlook.retention : 1));
    if (i.outlook.status === "due") h.due++;
    else if (i.outlook.status === "fading") h.fading++;
    else if (i.outlook.status === "forgetting") h.forgetting++;
    if (i.level >= MASTERY_LEVEL) h.mastered++;
  }
  if (h.ideas > 0) h.remembered = sum / h.ideas;
  return h;
}

/** "94% remembered" (floored, so 100% means nothing has started fading); "No ideas yet". */
export function rememberedText(h: Pick<Health, "remembered">): string {
  if (h.remembered === null) return "No ideas yet";
  const pct = h.remembered >= 1 ? 100 : Math.floor(h.remembered * 100);
  return `${pct}% remembered`;
}

/** "3 fading · 1 forgetting" · "1 forgetting" · "None fading". */
export function fadingText(h: Pick<Health, "fading" | "forgetting">): string {
  const parts: string[] = [];
  if (h.fading > 0) parts.push(`${h.fading.toLocaleString("en-GB")} fading`);
  if (h.forgetting > 0) parts.push(`${h.forgetting.toLocaleString("en-GB")} forgetting`);
  return parts.length > 0 ? parts.join(" · ") : "None fading";
}

// ─── Level: its way to the next, the week, the last drop ────────────────────

export interface LevelDrop {
  /** The level it fell from (Field.droppedFrom is a Float, Domain.droppedFrom an Int). */
  from: number;
  /** Epoch ms (droppedAt). */
  at: number;
}

export function dropOf(droppedFrom: number | null | undefined, droppedAt: number | null | undefined): LevelDrop | null {
  return droppedFrom != null && droppedAt != null && Number.isFinite(droppedFrom) && Number.isFinite(droppedAt) ? { from: droppedFrom, at: droppedAt } : null;
}

/** The tile's drop mark: a drop in the last 7 days. */
export const DROP_MARK_DAYS = 7;
/** The pop-up's and the page's drop line: a drop in the last 30 days, or any drop the level is still below. */
export const DROP_LINE_DAYS = 30;

export function isRecentDrop(drop: LevelDrop | null, now: number, days = DROP_MARK_DAYS): boolean {
  return !!drop && drop.at <= now && now - drop.at <= days * DAY;
}

export function showsDropLine(drop: LevelDrop | null, level: number, now: number): boolean {
  return !!drop && (isRecentDrop(drop, now, DROP_LINE_DAYS) || level < drop.from);
}

/** "Fell from L4 on 12 Oct". */
export function dropText(drop: LevelDrop, now: number): string {
  return `Fell from ${levelText(drop.from)} on ${shortDate(drop.at, now)}`;
}

/** "+1 this week" · "−0.5 this week" · "No change this week" · "No 7-day record yet" (no snapshot a week ago). */
export function weekDeltaText(delta: number | null): string {
  if (delta === null || !Number.isFinite(delta)) return "No 7-day record yet";
  const r = Math.round(delta * 10) / 10;
  if (r === 0) return "No change this week";
  const n = Number.isInteger(r) ? String(Math.abs(r)) : Math.abs(r).toFixed(1);
  return `${r > 0 ? "+" : "−"}${n} this week`;
}

/**
 * A Domain's way to its next level. Its level is min(points level, depth level)
 * (xp.ts domainLevel): while points are ahead, depth holds it, and the way on is
 * the fraction of the next mastered-idea equivalent (masteryDepth, each idea
 * weighted by its retention, as leveling reads it); otherwise it is the points
 * to the next level (domainLevelProgress).
 */
export function domainProgressOf(
  level: number,
  totalPoints: number,
  depth: readonly { level: number; retention: number }[]
): { progress: number; heldBy: "points" | "depth" | "fading" } {
  // The level reads the points as far as the ideas are still remembered (xp.ts retainedPoints), so the
  // way up is read the same way: a neglected Domain is raised by reviewing what is fading, not by more points.
  const pts = retainedPoints(totalPoints, depth);
  if (domainPointsLevel(pts) > level) {
    const md = masteryDepth(depth);
    return { progress: clamp01(md - Math.floor(md)), heldBy: "depth" };
  }
  const fading = retainedShare(depth) < 0.995 && domainPointsLevel(totalPoints) > domainPointsLevel(pts);
  return { progress: clamp01(domainLevelProgress(pts).progress), heldBy: fading ? "fading" : "points" };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

// ─── Boss, streak, quota ────────────────────────────────────────────────────

/** The part of bosses.ts BossState this reads (structural: bosses.ts loads Prisma). */
export interface BossStateLike {
  tier: number;
  victories: number;
  availability:
    | { status: "locked"; levelsNeeded: number }
    | { status: "insufficient_material"; have: number; need: number }
    | { status: "cooldown"; until: Date | number }
    | { status: "ready" };
}

export type BossLine =
  | { kind: "maintenance" }
  | { kind: "none" }
  | { kind: "locked"; tier: number; victories: number; levelsNeeded: number }
  | { kind: "cooldown"; tier: number; victories: number; until: number }
  | { kind: "material"; tier: number; victories: number; have: number; need: number }
  | { kind: "ready"; tier: number; victories: number };

/** A Field in maintenance fields no Boss (bosses.ts loadBossStates leaves it out); no state at all reads "none". */
export function bossLineOf(state: BossStateLike | null | undefined, maintained: boolean): BossLine {
  if (maintained) return { kind: "maintenance" };
  if (!state) return { kind: "none" };
  const { tier, victories } = state;
  const a = state.availability;
  switch (a.status) {
    case "locked":
      return { kind: "locked", tier, victories, levelsNeeded: a.levelsNeeded };
    case "cooldown":
      return { kind: "cooldown", tier, victories, until: typeof a.until === "number" ? a.until : a.until.getTime() };
    case "insufficient_material":
      return { kind: "material", tier, victories, have: a.have, need: a.need };
    case "ready":
      return { kind: "ready", tier, victories };
  }
}

/** The Boss tile: a head ("Tier 2 · 3 victories") and when it can be fought. */
export function bossText(b: BossLine, now: number): { head: string; sub: string } {
  switch (b.kind) {
    case "maintenance":
      return { head: "No Boss", sub: "In maintenance" };
    case "none":
      return { head: "No Boss yet", sub: "Not fielded" };
    default: {
      const head = `Tier ${b.tier} · ${plural(b.victories, "victory", "victories")}`;
      if (b.kind === "locked") return { head, sub: `Locked · ${plural(b.levelsNeeded, "Field level")} to go` };
      if (b.kind === "cooldown") return { head, sub: `Rests until ${shortDate(b.until, now)}` };
      if (b.kind === "material") return { head, sub: `Needs ${b.need} due ideas · ${b.have} now` };
      return { head, sub: "Ready to fight" };
    }
  }
}

export interface StreakLine {
  /** 0 when the streak broke (more than a day missed), though the row still holds the old count. */
  current: number;
  best: number;
  /** Already counted today. */
  today: boolean;
}

/** A FieldStreak row read at today's life day: a gap of two or more days is a broken streak (streak-curve fieldStreakStep). */
export function streakLineOf(row: { currentDays: number; bestDays: number; lastActiveKey: DayKey } | null, todayKey: DayKey): StreakLine | null {
  if (!row) return null;
  const step = fieldStreakStep(row.lastActiveKey, todayKey);
  return { current: step === "broken" ? 0 : row.currentDays, best: Math.max(row.bestDays, row.currentDays), today: step === "same" };
}

/** "4 days · best 12" · "None now · best 12" · "None yet". */
export function streakText(s: StreakLine | null): string {
  if (!s || (s.current === 0 && s.best === 0)) return "None yet";
  return `${s.current > 0 ? plural(s.current, "day") : "None now"} · best ${s.best.toLocaleString("en-GB")}`;
}

export interface QuotaLine {
  added: number;
  quota: number;
  met: boolean;
}

/** "2 of 3 new ideas" · "3 of 3 new ideas · met" · "No quota in maintenance". */
export function quotaText(q: QuotaLine | null, maintained: boolean): string {
  if (!q) return maintained ? "No quota in maintenance" : "No quota";
  return `${q.added.toLocaleString("en-GB")} of ${q.quota.toLocaleString("en-GB")} new ideas${q.met ? " · met" : ""}`;
}

// ─── Attributes ─────────────────────────────────────────────────────────────

export interface AttributeShare {
  key: Attribute;
  label: string;
  /** Whole percent of the Field's effective composition (attribute-inference.ts effectiveFieldComposition; sums to 100). */
  share: number;
}

/** The top `n` attributes (at least 1%), highest first, ties in ATTRIBUTES order. */
export function topAttributes(composition: Partial<Record<Attribute, number>> | null | undefined, n = 4): AttributeShare[] {
  if (!composition) return [];
  return ATTRIBUTES.map((key, i) => ({ key, i, w: composition[key] ?? 0 }))
    .filter((a) => Number.isFinite(a.w) && Math.round(a.w) >= 1)
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .slice(0, n)
    .map((a) => ({ key: a.key, label: ATTRIBUTE_META[a.key].label, share: Math.round(a.w) }));
}

// ─── The summary ────────────────────────────────────────────────────────────

export interface FieldInput {
  id: string;
  name: string;
  /** The stored Field level. */
  level: number;
  droppedFrom: number | null;
  /** Epoch ms. */
  droppedAt: number | null;
  domains: { id: string; name: string; level: number; ideas: readonly HealthIdea[] }[];
}

export interface FieldExtras {
  todayKey: DayKey;
  /** The FieldSnapshot level 7 days ago (snapshot.ts getGhostLevelsFromDaysAgo); null when there is none. */
  levelWeekAgo: number | null;
  composition: Partial<Record<Attribute, number>> | null;
  boss: BossStateLike | null;
  streak: { currentDays: number; bestDays: number; lastActiveKey: DayKey } | null;
  /** This week's ask (field-quota.ts); null in maintenance. */
  quota: { added: number; quota: number } | null;
  maintained: boolean;
}

export interface FieldSummary {
  id: string;
  name: string;
  level: number;
  tier: { label: string; blurb: string };
  /** The next tier and the level it starts at; null at the top. */
  nextTier: { label: string; at: number } | null;
  /** The next whole Field level, and how far toward it (fieldLevelRaw's fraction, 0..1). */
  nextLevel: number;
  progress: number;
  /** Level now − level 7 days ago; null with no snapshot then. */
  weekDelta: number | null;
  drop: LevelDrop | null;
  health: Health;
  attributes: AttributeShare[];
  domainCount: number;
  /** The highest-level Domain (then the first by name); null with no Domains. */
  bestDomain: { id: string; name: string; level: number } | null;
  boss: BossLine;
  streak: StreakLine | null;
  quota: QuotaLine | null;
  maintained: boolean;
}

export function summarizeField(f: FieldInput, x: FieldExtras): FieldSummary {
  const levels = f.domains.map((d) => d.level);
  // The stored level is fieldLevel of the stored Domain levels (leveling.ts); should a row lag behind, the bar
  // starts from the stored level rather than claim a way to a level below it.
  const whole = fieldLevel(levels);
  const raw = fieldLevelRaw(levels);
  const base = Math.max(0, Math.floor(f.level));
  const tier = fieldTier(f.level);
  const next = nextTierAt(f.level);
  const best = [...f.domains].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))[0] ?? null;
  return {
    id: f.id,
    name: f.name,
    level: f.level,
    tier: { label: tier.label, blurb: tier.blurb },
    nextTier: next === null ? null : { label: fieldTier(next).label, at: next },
    nextLevel: base + 1,
    progress: whole === base ? clamp01(raw - whole) : 0,
    weekDelta: x.levelWeekAgo === null ? null : f.level - x.levelWeekAgo,
    drop: dropOf(f.droppedFrom, f.droppedAt),
    health: healthOf(f.domains.flatMap((d) => d.ideas)),
    attributes: topAttributes(x.composition),
    domainCount: f.domains.length,
    bestDomain: best ? { id: best.id, name: best.name, level: best.level } : null,
    boss: bossLineOf(x.boss, x.maintained),
    streak: streakLineOf(x.streak, x.todayKey),
    quota: x.maintained || !x.quota ? null : { added: x.quota.added, quota: x.quota.quota, met: x.quota.added >= x.quota.quota },
    maintained: x.maintained,
  };
}

/** "Formidable at L16" (the next tier), or the top of the ladder. */
export function nextTierText(s: Pick<FieldSummary, "nextTier">): string {
  return s.nextTier ? `${s.nextTier.label} at L${s.nextTier.at}` : "The top tier";
}

/** The tile's third line: "48 ideas · 3 fading" (fading and forgetting together), or "48 ideas · 94% remembered". */
export function tileHealthText(h: Health): string {
  const fading = h.fading + h.forgetting;
  if (h.ideas === 0) return "No ideas yet";
  return `${plural(h.ideas, "idea")} · ${fading > 0 ? `${fading.toLocaleString("en-GB")} fading` : rememberedText(h)}`;
}

// ─── The Field page's Domains ───────────────────────────────────────────────

export interface DomainSection {
  id: string;
  name: string;
  geminiNamed: boolean;
  level: number;
  progress: number;
  heldBy: "points" | "depth" | "fading";
  drop: LevelDrop | null;
  health: Health;
  /** Most urgent first (library-model byUrgency), archived ideas left out. */
  ideas: LibraryIdea[];
}

export function domainSectionOf(
  d: { id: string; name: string; geminiNamed: boolean; level: number; totalPoints: number; droppedFrom: number | null; droppedAt: number | null },
  ideas: readonly LibraryIdea[]
): DomainSection {
  const live = ideas.filter((i) => !i.isArchived);
  const { progress, heldBy } = domainProgressOf(d.level, d.totalPoints, live.map((i) => ({ level: i.level, retention: i.outlook.retention })));
  return {
    id: d.id,
    name: d.name,
    geminiNamed: d.geminiNamed,
    level: d.level,
    progress,
    heldBy,
    drop: dropOf(d.droppedFrom, d.droppedAt),
    health: healthOf(live),
    ideas: [...live].sort(byUrgency),
  };
}

/** Domains highest level first, then by name (the Field's ladder). */
export function byDomainLevel(a: { level: number; name: string }, b: { level: number; name: string }): number {
  return b.level - a.level || a.name.localeCompare(b.name);
}

/** The Field page's chips (URL `show=`, the Library's own key and words): a narrower family than the Library's. */
export const FIELD_STATUSES: readonly LibraryStatus[] = ["all", "due", "fading", "mastered"];

/** ?show= on the Field page: one of FIELD_STATUSES, else All (never thrown). */
export function fieldStatusOf(value: string | null | undefined): LibraryStatus {
  return (FIELD_STATUSES as readonly string[]).includes(value ?? "") ? (value as LibraryStatus) : "all";
}
