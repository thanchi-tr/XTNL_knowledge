/**
 * Skills: named competencies with hour tiers (blueprint 1.5; docs/life-plan/blueprint-plan-2026-10-22.md P5; decisions
 * D7, D8 and D9). A skill is a named Competency of one attribute (the Status card's five; Capital has none) that tasks,
 * roadmaps and walks link to. Its hours are read from what the app already records, never stored, and its tier is read
 * from its hours. Pure and client-importable: no Prisma, no clock. competency-server.ts is the only reader and writer of
 * the Competency table and of the two link columns (TaskTemplate.competencyId, Roadmap.competencyId).
 *
 * A record, never a reward: no hour, no tier and no link pays XP, MP or a level, moves a kept week or a price, and a
 * tier-up is a Seal only (D9: 'competency:<id>:t<n>', celebration-detect's competency-tier; any MP would re-open the
 * balance pins). scripts/status-check.ts pins that no competency file writes the ledger or imports a writer.
 *
 *   The tiers (D8)          Tier 1 0–100 h · Tier 2 100–500 h · Tier 3 500–2,000 h · Tier 4 2,000–10,000 h
 *   tierOfHours(h)          1..4 (99.9 h is Tier 1, 100 h Tier 2, 2,000 h Tier 4); tierMeterOf(h): the meter within it
 *   skillSealKey(id, n)     'competency:<id>:t<n>': the tier-up Seal's key (once ever a tier)
 *
 *   Where the hours come from (skillHoursOf):
 *     a linked template     its own competencyId, else its roadmap's (a practice or step, 'rm:<milestone>:p<i>' / ':s<i>'),
 *                           each read only while that skill is live: a template feeds at most one skill (effectiveSkillOf)
 *     a tick                every live TASK row of the template (any sink: #play, study and the minimum count too), net
 *                           of every 'undo:<id>' row (an UNDO, or a walk's reversal), at its receipt's minutes, else
 *                           TaskInstance.minutes, else the template's estMinutes (tickMinutesOf)
 *     a walk                an EXERCISE skill adds every ExerciseSession's durationMin, and a walk is counted once: a
 *                           tick a walk paid ('paid by the walk', TaskInstance.source auto:workout) is that walk's time,
 *                           and so is a tick a walk topped up ("Counts as" a habit already ticked: the WORKOUT receipt's
 *                           topUp, one payment for one walk), so on an EXERCISE skill neither tick is counted beside it
 *   Linking re-reads history: a template's past ticks count from the moment it is linked, once, with no write but the
 *   link, and unlinking takes them out again. No Seal plays for hours that were already there (as the curve flip plays
 *   none): a tier-up plays only when a tick or a walk moves the hours across a boundary.
 *
 *   Its last practice (blueprint P28): the latest life day of a live tick that feeds it (a walk's own tick included),
 *   and an exercise skill's latest walk (SkillHours.lastDay, SkillView.lastDay). A reading too: condition decay
 *   (skill-decay.ts) reads it while DECAY_LAUNCH_DAY is in force, and nothing else does.
 *
 *   hoursLineOf(h)          "≈ 42 h (task estimates, not timed)"; "12.5 h of walks"; "No hours yet"
 *   skillViewOf / skillsOf  a skill as the Skills page, the Status card and the phone show it, by hours
 *   suggestionsOf           normTitle families of unlinked personal tasks with ≥ SUGGEST_MIN_COMPLETIONS live ticks
 *   cleanSkillInput / planSkillEdit / linkRefusalOf / roadmapLinkRefusalOf   what a write may write, or why not
 *   skillCountsOf(views)    live skills per attribute (the Status rows' counts)
 */
import { STATUS_KEYS, STATUS_NAME, type StatusKey } from "./status-panel";
import type { Track } from "./life-types";

// ── The catalog ─────────────────────────────────────────────────────────────

/** A skill's attribute: one of the Status card's five (Capital is a reading only, so it has no skills). */
export type SkillAttribute = StatusKey;
export const SKILL_ATTRIBUTES: readonly SkillAttribute[] = STATUS_KEYS;

/** PRACTICE: fed by its linked tasks and roadmaps. EXERCISE: those and every logged walk (Vitality's, at most one). */
export type SkillKind = "PRACTICE" | "EXERCISE";
export const SKILL_KINDS: readonly SkillKind[] = ["PRACTICE", "EXERCISE"];
export const SKILL_KIND_NAME: Readonly<Record<SkillKind, string>> = { PRACTICE: "Practice", EXERCISE: "Exercise (walks count)" };

/** The attribute an EXERCISE skill belongs to: walks are Vitality's (the migration's CHECK). */
export const EXERCISE_ATTRIBUTE: SkillAttribute = "VITALITY";

/** The attribute a track's tasks feed (a suggestion's default). Knowledge has no track: Intellect skills are named by hand. */
export const SKILL_ATTRIBUTE_OF_TRACK: Readonly<Record<Track, SkillAttribute>> = { BODY: "VITALITY", DUTY: "DUTY", CRAFT: "CRAFT", CARE: "CARE" };

/** A name: at most this long (the migration's CHECK). */
export const SKILL_NAME_MAX = 40;
/** At most this many live skills. */
export const SKILLS_MAX = 30;

export const isSkillAttribute = (v: unknown): v is SkillAttribute => typeof v === "string" && (SKILL_ATTRIBUTES as readonly string[]).includes(v);
export const isSkillKind = (v: unknown): v is SkillKind => v === "PRACTICE" || v === "EXERCISE";

// ── The tiers (D8) ──────────────────────────────────────────────────────────

export type SkillTier = 1 | 2 | 3 | 4;

export interface TierBand {
  tier: SkillTier;
  /** Hours, inclusive. */
  from: number;
  /** Hours: the next tier's start (Tier 4's top: SKILL_HOURS_TOP). */
  to: number;
}

/** The blueprint's tiers, and D8's fourth: a long practice never tops out before 10,000 h. */
export const SKILL_TIERS: readonly TierBand[] = [
  { tier: 1, from: 0, to: 100 },
  { tier: 2, from: 100, to: 500 },
  { tier: 3, from: 500, to: 2000 },
  { tier: 4, from: 2000, to: 10000 },
];
export const SKILL_HOURS_TOP = SKILL_TIERS[SKILL_TIERS.length - 1].to;

const EPS = 1e-9;

/** The tier of a number of hours: 1 below 100 h, 2 from 100, 3 from 500, 4 from 2,000 (and past 10,000). */
export function tierOfHours(hours: number): SkillTier {
  const h = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  let tier: SkillTier = 1;
  for (const b of SKILL_TIERS) if (h + EPS >= b.from) tier = b.tier;
  return tier;
}

export function tierBandOf(tier: SkillTier): TierBand {
  return SKILL_TIERS[tier - 1];
}

export interface TierMeter {
  tier: SkillTier;
  from: number;
  to: number;
  /** 0..1 of the way through the tier (1 at SKILL_HOURS_TOP). */
  progress: number;
  /** Hours to the next tier; null in Tier 4. */
  toNext: number | null;
  /** SKILL_HOURS_TOP reached. */
  top: boolean;
}

/** The meter within a tier: how far through it, and the hours to the next. */
export function tierMeterOf(hours: number): TierMeter {
  const h = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  const band = tierBandOf(tierOfHours(h));
  const progress = Math.min(1, Math.max(0, (h - band.from) / (band.to - band.from)));
  const last = band.tier === SKILL_TIERS[SKILL_TIERS.length - 1].tier;
  return { tier: band.tier, from: band.from, to: band.to, progress, toNext: last ? null : Math.max(0, band.to - h), top: h + EPS >= SKILL_HOURS_TOP };
}

const n0 = (v: number) => Math.round(v).toLocaleString("en-GB");

/** "Tier 2 · 100–500 h". */
export function tierRangeLabel(tier: SkillTier): string {
  const b = tierBandOf(tier);
  return `Tier ${tier} · ${n0(b.from)}–${n0(b.to)} h`;
}

/** The tier-up Seal's key: one per skill and tier, ever (a tier re-reached after an unlink never replays). */
export function skillSealKey(id: string, tier: number): string {
  return `competency:${id}:t${tier}`;
}

/** The skill id and tier of a Seal key; null for any other key. */
export function parseSkillSealKey(key: string | null | undefined): { id: string; tier: number } | null {
  const m = typeof key === "string" ? /^competency:([A-Za-z0-9_-]{1,64}):t([1-4])$/.exec(key) : null;
  return m ? { id: m[1], tier: Number(m[2]) } : null;
}

// ── The facts ───────────────────────────────────────────────────────────────

/** A Competency row as competency-server reads it. */
export interface SkillRow {
  id: string;
  name: string;
  attribute: string;
  kind: string;
  fieldId: string | null;
  sortOrder: number;
  createdAt: string;
  archivedAt: string | null;
}

/** A personal template that may feed a skill: its own link and its roadmap's (a practice or step of a linked roadmap). */
export interface SkillTemplate {
  id: string;
  title: string;
  kind: string;
  /** TaskTemplate.competencyId. */
  competencyId: string | null;
  /** The skill its roadmap links to (Roadmap.competencyId of the milestone its 'rm:' key names); null otherwise. */
  roadmapCompetencyId: string | null;
  /** A work tab's task never feeds a skill (the reads take none; a fixture may). */
  boardId?: string | null;
  estMinutes: number;
}

/** A TASK row of a linked template, as the hours read it. */
export interface SkillTick {
  id: string;
  templateId: string;
  dedupeKey: string | null;
  /** The receipt's minutes (after clamps); null when the row has no receipt or none there. */
  receiptMinutes: number | null;
  /** TaskInstance.minutes of the row's instance; null when there is none. */
  instanceMinutes: number | null;
  /** TaskInstance.source: 'auto:workout' is a tick a walk paid. */
  instanceSource: string | null;
  /** The tick's life day ('YYYY-MM-DD': its instance's, else the row's); null when unknown (then no top-up matches it). */
  day: string | null;
  /** Some row is keyed 'undo:<this id>' (an UNDO, or a walk's reversal): the tick was taken back. */
  undone: boolean;
}

/**
 * A walk that topped up a template already ticked on its day ("Counts as" after the tick: exercise.ts walkReceiptOf's
 * topUp pays only max(0, raw − tickedRaw), and BODY's week counts the walk's effort less the tick's), while the walk is
 * still logged (its ExerciseSession is one the walks count).
 */
export interface SkillTopUp {
  templateId: string;
  /** The walk's life day, 'YYYY-MM-DD'. */
  day: string;
}

/**
 * What the hours read; walks are null when they couldn't be read (an EXERCISE skill then counts its ticks alone), and
 * the top-ups are read with them ([] when they couldn't be).
 */
export interface SkillFacts {
  templates: readonly SkillTemplate[];
  ticks: readonly SkillTick[];
  /** `lastDay` (P28): the latest walk's life day, 'YYYY-MM-DD'; absent or null with none (or a read that predates it). */
  walks: { minutes: number; count: number; lastDay?: string | null } | null;
  topUps: readonly SkillTopUp[];
}

export const NO_SKILL_FACTS: SkillFacts = { templates: [], ticks: [], walks: null, topUps: [] };

/** The walk's pay mode on a tick it completed (tasks.ts completeLinkedCore, InstanceSource). */
export const WALK_PAID_SOURCE = "auto:workout";

/** A goal and an idea draft are never ticked as practice: they feed no skill. */
const UNLINKABLE_KINDS: ReadonlySet<string> = new Set(["GOAL", "IDEA_DRAFT"]);

/**
 * The one skill a template feeds, or null: a work tab's task, a goal or an idea draft feeds none; otherwise its own
 * link while that skill is live, else its roadmap's while that one is live. So a template counts toward at most one
 * skill, and a practice linked both ways counts once.
 */
export function effectiveSkillOf(t: SkillTemplate, live: ReadonlySet<string>): string | null {
  if (t.boardId || UNLINKABLE_KINDS.has(t.kind)) return null;
  if (t.competencyId && live.has(t.competencyId)) return t.competencyId;
  if (t.roadmapCompetencyId && live.has(t.roadmapCompetencyId)) return t.roadmapCompetencyId;
  return null;
}

export type MinutesBasis = "RECEIPT" | "INSTANCE" | "ESTIMATE";

const positive = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/** A tick's minutes: its receipt's, else its instance's, else the template's estimate (0 when even that is missing). */
export function tickMinutesOf(tick: Pick<SkillTick, "receiptMinutes" | "instanceMinutes">, estMinutes: number): { minutes: number; basis: MinutesBasis } {
  const r = positive(tick.receiptMinutes);
  if (r != null) return { minutes: r, basis: "RECEIPT" };
  const i = positive(tick.instanceMinutes);
  if (i != null) return { minutes: i, basis: "INSTANCE" };
  return { minutes: positive(estMinutes) ?? 0, basis: "ESTIMATE" };
}

/** A tick that counts: not taken back, and not itself a reversal (a walk's negated row is keyed 'undo:<id>'). */
export function isLiveTick(t: Pick<SkillTick, "undone" | "dedupeKey">): boolean {
  return !t.undone && !(t.dedupeKey?.startsWith("undo:") ?? false);
}

/** One skill's hours, as read. */
export interface SkillHours {
  minutes: number;
  /** Live ticks counted. */
  ticks: number;
  /** Of those, how many were counted at the template's estimate (no receipt or instance minutes). */
  estimated: number;
  /** Walks counted (an EXERCISE skill's). */
  walks: number;
  walkMinutes: number;
  /** Templates feeding it now. */
  templates: number;
  /** P28: its last practice, 'YYYY-MM-DD' (the latest live tick feeding it, an exercise skill's latest walk); null with none. */
  lastDay: string | null;
}

const EMPTY_HOURS: SkillHours = { minutes: 0, ticks: 0, estimated: 0, walks: 0, walkMinutes: 0, templates: 0, lastDay: null };

/** The later of two life days ('YYYY-MM-DD' compares as text); null only when both are. */
const laterDay = (a: string | null, b: string | null | undefined): string | null => (b == null ? a : a == null || b > a ? b : a);

/** A top-up's key: the template and the day. */
const topUpKey = (templateId: string, day: string) => `${templateId}|${day}`;

/**
 * Every live skill's hours: each linked template's live ticks at their minutes (once each, toward the one skill it
 * feeds), and an EXERCISE skill's walks. A walk counts once: a tick it paid, and the template's ticks on a day a walk
 * topped that template up, are the walk's time, so an EXERCISE skill leaves them to the walk (a PRACTICE skill, which
 * counts no walk, still counts them). Archived skills are not read.
 */
export function skillHoursOf(skills: readonly SkillRow[], facts: SkillFacts): Map<string, SkillHours> {
  const live = skills.filter((s) => s.archivedAt == null);
  const liveIds = new Set(live.map((s) => s.id));
  const kindOf = new Map(live.map((s) => [s.id, s.kind]));
  const out = new Map<string, SkillHours>(live.map((s) => [s.id, { ...EMPTY_HOURS }]));
  const feeds = new Map<string, { skill: string; estMinutes: number }>();
  for (const t of facts.templates) {
    const skill = effectiveSkillOf(t, liveIds);
    if (!skill) continue;
    feeds.set(t.id, { skill, estMinutes: t.estMinutes });
    out.get(skill)!.templates += 1;
  }
  // The days a walk topped a template up; only while the walks are read (a walk not counted leaves its tick counted).
  const toppedUp = new Set(facts.walks ? (facts.topUps ?? []).map((t) => topUpKey(t.templateId, t.day)) : []);
  for (const tick of facts.ticks) {
    const fed = feeds.get(tick.templateId);
    if (!fed || !isLiveTick(tick)) continue;
    // P28: any live tick feeding it is practice that day, a walk's own included (its hours are the walk's below).
    out.get(fed.skill)!.lastDay = laterDay(out.get(fed.skill)!.lastDay, tick.day);
    // A walk's own time: an EXERCISE skill counts the walk, not the tick it paid or topped up.
    if (kindOf.get(fed.skill) === "EXERCISE" && (tick.instanceSource === WALK_PAID_SOURCE || (tick.day != null && toppedUp.has(topUpKey(tick.templateId, tick.day))))) continue;
    const { minutes, basis } = tickMinutesOf(tick, fed.estMinutes);
    const h = out.get(fed.skill)!;
    h.minutes += minutes;
    h.ticks += 1;
    if (basis === "ESTIMATE") h.estimated += 1;
  }
  if (facts.walks) {
    for (const s of live) {
      if (s.kind !== "EXERCISE") continue;
      const h = out.get(s.id)!;
      const m = Number.isFinite(facts.walks.minutes) ? Math.max(0, facts.walks.minutes) : 0;
      h.walkMinutes += m;
      h.minutes += m;
      h.walks += Math.max(0, Math.round(facts.walks.count) || 0);
      h.lastDay = laterDay(h.lastDay, facts.walks.lastDay);
    }
  }
  return out;
}

// ── The words ───────────────────────────────────────────────────────────────

/** Hours as the lines say them: floored, to 0.1 below 100 h, whole from 100 (so 99.95 h never reads "100"). */
export function hoursText(hours: number): string {
  const h = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  if (h < 100) return (Math.floor(h * 10 + EPS) / 10).toLocaleString("en-GB", { maximumFractionDigits: 1 });
  return Math.floor(h + EPS).toLocaleString("en-GB");
}

/** What the hours are, in the plan's words: tick minutes are the tasks' counted estimates, never timed. */
export const TICK_BASIS = "task estimates, not timed";
export const NO_HOURS_LINE = "No hours yet";

/** "≈ 42 h (task estimates, not timed)"; walks alone: "12.5 h of walks"; neither: "No hours yet". */
export function hoursLineOf(h: Pick<SkillHours, "minutes" | "ticks" | "walks">): string {
  if (h.ticks === 0 && h.walks === 0) return NO_HOURS_LINE;
  const text = hoursText(h.minutes / 60);
  if (h.ticks === 0) return `${text} h of walks`;
  return `≈ ${text} h (${TICK_BASIS}${h.walks > 0 ? ", walks as logged" : ""})`;
}

/**
 * The ticks counted at their task's estimate as it stands now, because they recorded no size (no receipt or instance
 * minutes; tickMinutesOf's ESTIMATE): "1 tick counted at its task's current estimate (no size recorded)".
 */
export function estimatedTicksLine(n: number): string {
  return n === 1 ? "1 tick counted at its task's current estimate (no size recorded)" : `${n.toLocaleString("en-GB")} ticks counted at their task's current estimate (no size recorded)`;
}

/** "Tier 2 · 100–500 h · 358 h to Tier 3"; Tier 4: "Tier 4 · 2,000–10,000 h"; at the top: "Tier 4 · 10,000 h reached". */
export function tierLineOf(m: TierMeter): string {
  if (m.top) return `Tier ${m.tier} · ${n0(SKILL_HOURS_TOP)} h reached`;
  const base = tierRangeLabel(m.tier);
  if (m.toNext == null) return base;
  return `${base} · ${hoursText(m.toNext)} h to Tier ${m.tier + 1}`;
}

// ── The view ────────────────────────────────────────────────────────────────

/** One skill as the Skills page, the Status card and the phone show it. */
export interface SkillView {
  id: string;
  name: string;
  attribute: SkillAttribute;
  /** The blueprint's word: Vitality, Intellect, Craft, Duty, Care. */
  attributeName: string;
  kind: SkillKind;
  fieldId: string | null;
  /** The Field's name now (null with none, or a Field gone). */
  fieldName: string | null;
  minutes: number;
  /** Hours to 2 decimals (the phone draws them; the lines floor them). */
  hours: number;
  tier: SkillTier;
  tierFrom: number;
  tierTo: number;
  /** 0..1 through the tier. */
  progress: number;
  /** Hours to the next tier (2 decimals); null in Tier 4. */
  toNext: number | null;
  /** "≈ 42 h (task estimates, not timed)". */
  line: string;
  /** "Tier 1 · 0–100 h · 58 h to Tier 2". */
  tierLine: string;
  ticks: number;
  estimated: number;
  walks: number;
  /** Templates feeding it now (its own links and its roadmaps' practices). */
  templates: number;
  /** P28: its last practice, 'YYYY-MM-DD' (SkillHours.lastDay); null with none. Read only by condition decay. */
  lastDay: string | null;
  sortOrder: number;
  createdAt: string;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** A live row as the views show it; null for an archived or unreadable one (an unknown attribute or kind). */
export function skillViewOf(row: SkillRow, hours: SkillHours | undefined, fields: readonly { id: string; name: string }[] = []): SkillView | null {
  if (row.archivedAt != null || !isSkillAttribute(row.attribute) || !isSkillKind(row.kind)) return null;
  const h = hours ?? EMPTY_HOURS;
  const total = h.minutes / 60;
  const meter = tierMeterOf(total);
  return {
    id: row.id,
    name: row.name,
    attribute: row.attribute,
    attributeName: STATUS_NAME[row.attribute],
    kind: row.kind,
    fieldId: row.fieldId,
    fieldName: row.fieldId ? (fields.find((f) => f.id === row.fieldId)?.name ?? null) : null,
    minutes: round2(h.minutes),
    hours: round2(total),
    tier: meter.tier,
    tierFrom: meter.from,
    tierTo: meter.to,
    progress: meter.progress,
    toNext: meter.toNext == null ? null : round2(meter.toNext),
    line: hoursLineOf(h),
    tierLine: tierLineOf(meter),
    ticks: h.ticks,
    estimated: h.estimated,
    walks: h.walks,
    templates: h.templates,
    lastDay: h.lastDay,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}

/** The live skills by hours (most first), then by name: the Skills page's and the phone's order. */
export function skillsOf(rows: readonly SkillRow[], facts: SkillFacts, fields: readonly { id: string; name: string }[] = []): SkillView[] {
  const hours = skillHoursOf(rows, facts);
  return rows
    .map((r) => skillViewOf(r, hours.get(r.id), fields))
    .filter((v): v is SkillView => v !== null)
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Live skills per attribute (every attribute present, 0 with none): the Status rows' counts. */
export function skillCountsOf(views: readonly Pick<SkillView, "attribute">[]): Record<SkillAttribute, number> {
  const out = Object.fromEntries(SKILL_ATTRIBUTES.map((a) => [a, 0])) as Record<SkillAttribute, number>;
  for (const v of views) if (isSkillAttribute(v.attribute)) out[v.attribute] += 1;
  return out;
}

/** "1 skill", "3 skills". */
export function skillCountLabel(n: number): string {
  return `${n} ${n === 1 ? "skill" : "skills"}`;
}

// ── Suggestions ─────────────────────────────────────────────────────────────

/** A family needs this many live ticks before it is suggested as a skill. */
export const SUGGEST_MIN_COMPLETIONS = 10;
/** At most this many suggestions are shown. */
export const SUGGEST_MAX = 5;

/** A personal TASK or HABIT template feeding no skill, with its live completions (net of undos). */
export interface FamilyRow {
  id: string;
  title: string;
  /** TaskTemplate.normTitle: the family's key (the repeat-decay key). */
  normTitle: string;
  track: string;
  category: string;
  completions: number;
}

export interface SkillSuggestion {
  /** The family's key. */
  key: string;
  /** The name it would take: the most-ticked template's title. */
  name: string;
  attribute: SkillAttribute;
  kind: SkillKind;
  completions: number;
  /** Every template of the family (each feeds no skill now). */
  templateIds: string[];
}

const familyKeyOf = (r: Pick<FamilyRow, "normTitle" | "title">) => (r.normTitle.trim().length > 0 ? r.normTitle.trim() : r.title.trim().toLowerCase());
const nameKey = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Families of personal tasks that feed no skill, with SUGGEST_MIN_COMPLETIONS or more live ticks between them, most
 * first, at most SUGGEST_MAX: each as a skill to make in one tap (its name the most-ticked title, cut to the name's
 * limit; its attribute the track's; EXERCISE for an exercise family while no live skill takes the walks). A family whose
 * name a live skill already has is not suggested.
 */
export function suggestionsOf(families: readonly FamilyRow[], live: readonly Pick<SkillRow, "name" | "kind" | "archivedAt">[]): SkillSuggestion[] {
  const taken = new Set(live.filter((s) => s.archivedAt == null).map((s) => nameKey(s.name)));
  const walksTaken = live.some((s) => s.archivedAt == null && s.kind === "EXERCISE");
  const groups = new Map<string, FamilyRow[]>();
  for (const r of families) {
    if (!(r.completions > 0)) continue;
    const k = familyKeyOf(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out: SkillSuggestion[] = [];
  for (const [key, rows] of groups) {
    const completions = rows.reduce((s, r) => s + r.completions, 0);
    if (completions < SUGGEST_MIN_COMPLETIONS) continue;
    const lead = [...rows].sort((a, b) => b.completions - a.completions || a.id.localeCompare(b.id))[0];
    const name = cleanSkillName(lead.title);
    if (!name || taken.has(nameKey(name))) continue;
    const track = lead.track as Track;
    const attribute = SKILL_ATTRIBUTE_OF_TRACK[track] ?? "CRAFT";
    const kind: SkillKind = lead.category === "EXERCISE" && attribute === EXERCISE_ATTRIBUTE && !walksTaken ? "EXERCISE" : "PRACTICE";
    out.push({ key, name, attribute, kind, completions, templateIds: rows.map((r) => r.id).sort() });
  }
  return out.sort((a, b) => b.completions - a.completions || a.name.localeCompare(b.name)).slice(0, SUGGEST_MAX);
}

// ── Writes: what they may write ─────────────────────────────────────────────

export type SkillResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** A name: trimmed, inner runs of space made one, at most SKILL_NAME_MAX characters; null when empty or not text. */
export function cleanSkillName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s.length > 0 ? s.slice(0, SKILL_NAME_MAX).trim() : null;
}

/** What the Skills page sends to add a skill. */
export interface SkillInput {
  name: string;
  attribute: string;
  kind?: string | null;
  /** An Intellect skill's Field. */
  fieldId?: string | null;
}

/** The columns a new row is written with (competency-server adds the id, the user, the sort order and the timestamps). */
export interface SkillData {
  name: string;
  attribute: SkillAttribute;
  kind: SkillKind;
  fieldId: string | null;
}

export const SKILL_NAME_EMPTY = "Give the skill a name.";
export const WALKS_ARE_VITALITY = "Walks are Vitality's: an exercise skill is a Vitality skill.";

const nameTaken = (live: readonly Pick<SkillRow, "id" | "name" | "archivedAt">[], name: string, except?: string) =>
  live.find((s) => s.archivedAt == null && s.id !== except && nameKey(s.name) === nameKey(name));

/**
 * What adding a skill writes, or why it can't: a name (unique among the live skills, in any case), one of the five
 * attributes, PRACTICE or EXERCISE (Vitality only, and only while no live skill takes the walks), a Field for an
 * Intellect skill only (a known one), under SKILLS_MAX.
 */
export function cleanSkillInput(input: SkillInput, ctx: { live: readonly SkillRow[]; fields: readonly { id: string; name: string }[] }): SkillResult<SkillData> {
  if (!input || typeof input !== "object") return { ok: false, error: "Nothing to add." };
  const live = ctx.live.filter((s) => s.archivedAt == null);
  if (live.length >= SKILLS_MAX) return { ok: false, error: `There are ${SKILLS_MAX} skills already. Archive one first.` };
  const name = cleanSkillName(input.name);
  if (!name) return { ok: false, error: SKILL_NAME_EMPTY };
  if (!isSkillAttribute(input.attribute)) return { ok: false, error: "Pick an attribute." };
  const kind: unknown = input.kind == null || input.kind === "" ? "PRACTICE" : input.kind;
  if (!isSkillKind(kind)) return { ok: false, error: "Pick practice or exercise." };
  if (kind === "EXERCISE" && input.attribute !== EXERCISE_ATTRIBUTE) return { ok: false, error: WALKS_ARE_VITALITY };
  const walks = live.find((s) => s.kind === "EXERCISE");
  if (kind === "EXERCISE" && walks) return { ok: false, error: `Walks already count toward ${walks.name}.` };
  let fieldId: string | null = null;
  if (input.attribute === "INTELLECT" && input.fieldId) {
    if (!ctx.fields.some((f) => f.id === input.fieldId)) return { ok: false, error: "Pick a Field." };
    fieldId = input.fieldId;
  }
  const dup = nameTaken(live, name);
  if (dup) return { ok: false, error: `You have a skill named ${dup.name} already.` };
  return { ok: true, value: { name, attribute: input.attribute, kind, fieldId } };
}

/** What an edit may change: the name, the attribute (not an exercise skill's: walks are Vitality's) and an Intellect skill's Field. */
export interface SkillPatch {
  name?: string | null;
  attribute?: string | null;
  /** A Field sets it (Intellect only); null clears it. */
  fieldId?: string | null;
}

/** What an edit writes, or why it can't. The kind is the skill's own: to take walks, add an exercise skill. An edit that changes nothing is refused. */
export function planSkillEdit(row: SkillRow, patch: SkillPatch, ctx: { live: readonly SkillRow[]; fields: readonly { id: string; name: string }[] }): SkillResult<Omit<SkillData, "kind">> {
  if (!patch || typeof patch !== "object") return { ok: false, error: "Nothing to change." };
  if (row.archivedAt != null || !isSkillAttribute(row.attribute) || !isSkillKind(row.kind)) return { ok: false, error: "That skill can't be edited." };
  const name = patch.name === undefined ? row.name : cleanSkillName(patch.name);
  if (!name) return { ok: false, error: SKILL_NAME_EMPTY };
  const attribute = patch.attribute === undefined || patch.attribute === null ? row.attribute : patch.attribute;
  if (!isSkillAttribute(attribute)) return { ok: false, error: "Pick an attribute." };
  if (row.kind === "EXERCISE" && attribute !== EXERCISE_ATTRIBUTE) return { ok: false, error: WALKS_ARE_VITALITY };
  let fieldId = patch.fieldId === undefined ? row.fieldId : patch.fieldId;
  if (attribute !== "INTELLECT") fieldId = null;
  if (fieldId && !ctx.fields.some((f) => f.id === fieldId) && fieldId !== row.fieldId) return { ok: false, error: "Pick a Field." };
  const dup = nameTaken(ctx.live, name, row.id);
  if (dup) return { ok: false, error: `You have a skill named ${dup.name} already.` };
  if (name === row.name && attribute === row.attribute && (fieldId ?? null) === (row.fieldId ?? null)) return { ok: false, error: "Nothing changed." };
  return { ok: true, value: { name, attribute, fieldId: fieldId ?? null } };
}

/** A work tab's task never feeds a skill: work stays outside the game (the user's 2026-10-12 rule). */
export const WORK_LINK_REFUSAL = "Work stays outside the game: a work tab's task can't feed a skill.";
export const GOAL_LINK_REFUSAL = "A goal or an idea draft isn't practised. Link its tasks instead.";
export const SKILL_GONE = "That skill is gone.";
export const TASK_GONE = "That task is gone.";

/** Why a template can't take this link, or null. `skill` null: unlinking (always allowed on a linkable template). */
export function linkRefusalOf(template: { boardId: string | null; kind: string } | null, skill: Pick<SkillRow, "archivedAt"> | null, unlinking: boolean): string | null {
  if (!template) return TASK_GONE;
  if (template.boardId) return WORK_LINK_REFUSAL;
  if (UNLINKABLE_KINDS.has(template.kind)) return GOAL_LINK_REFUSAL;
  if (!unlinking && (!skill || skill.archivedAt != null)) return SKILL_GONE;
  return null;
}

/** Why a roadmap can't take this link, or null (an archived roadmap keeps what it had). */
export function roadmapLinkRefusalOf(roadmap: { status: string } | null, skill: Pick<SkillRow, "archivedAt"> | null, unlinking: boolean): string | null {
  if (!roadmap) return "That roadmap is gone.";
  if (roadmap.status === "ARCHIVED") return "That roadmap is archived.";
  if (!unlinking && (!skill || skill.archivedAt != null)) return SKILL_GONE;
  return null;
}

// ── A tick's skill (POST /tasks/complete) ───────────────────────────────────

/** What a tick moved on its skill: the hours after it, the tier, and whether this tick played the tier-up Seal. */
export interface SkillTickView {
  id: string;
  name: string;
  hoursAfter: number;
  tier: SkillTier;
  tierUp: boolean;
  line: string;
}

/** A tick's skill from the skill's view after it and the keys of the Seals the tick played (only a new Seal is a tier-up). */
export function skillTickOf(view: Pick<SkillView, "id" | "name" | "hours" | "tier" | "line"> | null, sealKeys: readonly (string | null | undefined)[]): SkillTickView | null {
  if (!view) return null;
  const tierUp = sealKeys.some((k) => parseSkillSealKey(k)?.id === view.id);
  return { id: view.id, name: view.name, hoursAfter: view.hours, tier: view.tier, tierUp, line: view.line };
}
