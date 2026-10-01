/**
 * The character sheet's arithmetic (pure: the pages, /dev/style/art and
 * scripts/you-check.ts share it). No invented numbers: every output is a
 * function of real field levels, track levels, attribute scores and
 * snapshots, and a missing input yields null rather than a placeholder.
 *
 *   characterRaw(fields, tracks = [])    Σ L^0.75 over Field and life-track levels (character.ts)
 *   titleDistance(raw, transcendent)     the next title, its level, and the fraction of the
 *                                        way through the current title band (never drops on success)
 *   knowledgeRow(now, weekAgo)           the Knowledge track: level, banked, this week's gain, who grew most
 *   knowledgeLine(row)                   its honest line
 *   lifeTrackRows(knowledge, life)       the Life tracks card's rows: Duty, Craft, Body, Care once
 *                                        life counts, then Knowledge (Knowledge alone before)
 *   lifeCompositions(contributions)      life rows as radar sources ('Life · Body', source LIFE)
 *   ghostScores(scores, fields, ghosts)  attribute scores 7 days ago, from the Field and life levels then
 *   mainSourceOf(a, comps) / mainSource  the row that feeds an attribute most (with its share)
 *   sourceLabel(src)                     'Life · Body +2.8' for a life row, the Field's name otherwise
 *   radarLayout(axes, ghost)             13-gon geometry: rings, spokes, polygons, markers, labels
 *   polygonPoints(sides, cx, cy, r)      the attribute glyph (3–7 sides, the SkillLogo silhouette)
 *   topAttributes(scores, ghost, top)    the top three with a true note each
 *   mpFigure(v)                          an MP figure: 2 dp at most, en-GB ('4.8', '1,346', '0')
 *   shortDayLabel / longDayLabel /       '28 Sep' / '28 September' / 'Wednesday 7 October', read
 *   weekdayDayLabel                      from the day key's own calendar date (no clock, no zone)
 *   lifeNoteDue(launched, launchDay, d)  the 'Life now counts' note: launch day + 13 days
 *   firstWeekJudgement(epochDay, today)  before any judged week: which week is first, and when
 *   lifeMpCell(mpLastWeek, today)        the hero's life MP cell: the last judged week, named
 *                                        honestly ('last week', 'week of 21 Sep', none judged yet)
 *   pendingWeek(lastSunday, today)       the week that just ended, while it is not judged yet
 *   weekReviewPromise(launched)          /today/week's line about the review still to come
 */
import type { Attribute } from "@prisma/client";
import { ATTRIBUTES, COMPOSITION_TOTAL, type AttributeScores, type Composition, type FieldContribution } from "@/lib/attributes";
import { characterRaw as characterRawOf } from "@/lib/character";
import { round2 } from "@/lib/life-economy";
import { addDays, daysBetween, weekKeyOf, weekStartKeyOf, type DayKey } from "@/lib/life-day";
import type { LifeTrackRow, WeekMark } from "@/lib/life-tracks";
import { judgeDayOf, lastJudgeableSunday } from "@/lib/life-weeks";
import { TITLE_BANDS } from "@/lib/titles";

// ─── Character level and titles ─────────────────────────────────────────────

/**
 * Σ L^0.75 over the Field levels, then the life-track levels: floor() is the
 * character level, the remainder is the way to the next. With no tracks it
 * is exactly the Fields-only sum it always was (character.ts).
 */
export function characterRaw(fieldLevels: readonly number[], trackLevels: readonly number[] = []): number {
  return characterRawOf(fieldLevels, trackLevels);
}

export interface TitleDistance {
  /** The band held now ("Adept"). */
  current: string;
  /** null at the top of the ladder or once transcendent. */
  next: string | null;
  nextAt: number | null;
  nextBlurb: string | null;
  /** 0..1 through the current band toward the next title (1 at the top). */
  fraction: number;
  /** Whole levels still to go. */
  levelsToGo: number | null;
}

export function titleDistance(raw: number, transcendent = false): TitleDistance {
  const level = Math.floor(raw);
  let i = 0;
  for (let k = 0; k < TITLE_BANDS.length; k++) if (level >= TITLE_BANDS[k].min) i = k;
  const band = TITLE_BANDS[i];
  const next = transcendent ? null : TITLE_BANDS[i + 1] ?? null;
  if (!next) return { current: band.name, next: null, nextAt: null, nextBlurb: null, fraction: 1, levelsToGo: null };
  const fraction = Math.max(0, Math.min(1, (raw - band.min) / (next.min - band.min)));
  return {
    current: band.name,
    next: next.name,
    nextAt: next.min,
    nextBlurb: next.blurb,
    fraction,
    levelsToGo: Math.max(0, next.min - level),
  };
}

// ─── Knowledge (the one life track that exists before M5) ───────────────────

export interface FieldLevelRow {
  name: string;
  level: number;
}

export interface KnowledgeRow {
  level: number;
  /** 0..1 within the level, 7 days ago (0 when it has levelled since). */
  banked: number;
  /** 0..1 within the level now (banked + this week's gain). */
  now: number;
  /** Whole character-raw gained in 7 days (null without a week-old snapshot). */
  gained: number | null;
  /** The Field that grew most this week, when any grew. */
  grewMost: string | null;
  fields: number;
}

/**
 * Knowledge is the breadth-weighted Field level (the same Σ L^0.75 as the
 * character level before M5). `weekAgo` is the FieldSnapshot from 7 days ago
 * (empty until a week of snapshots exists: then there is no gain to show).
 */
export function knowledgeRow(now: readonly FieldLevelRow[], weekAgo: readonly FieldLevelRow[]): KnowledgeRow {
  const rawNow = characterRaw(now.map((f) => f.level));
  const level = Math.floor(rawNow);
  const frac = rawNow - level;
  if (weekAgo.length === 0) {
    return { level, banked: frac, now: frac, gained: null, grewMost: null, fields: now.length };
  }
  const before = new Map(weekAgo.map((g) => [g.name, g.level]));
  const rawThen = characterRaw(now.map((f) => before.get(f.name) ?? 0));
  const banked = Math.floor(rawThen) === level ? Math.max(0, Math.min(frac, rawThen - level)) : 0;
  let grewMost: string | null = null;
  let most = 0;
  for (const f of now) {
    const d = f.level - (before.get(f.name) ?? 0);
    if (d > most + 1e-9) {
      most = d;
      grewMost = f.name;
    }
  }
  return { level, banked, now: frac, gained: Math.max(0, rawNow - rawThen), grewMost, fields: now.length };
}

export function knowledgeLine(k: KnowledgeRow): string {
  const fields = `${k.fields} ${k.fields === 1 ? "Field" : "Fields"}, breadth-weighted`;
  if (k.gained === null) return `${fields} · this week's gain shows once a week of snapshots exists`;
  if (k.gained <= 0.0005) return `${fields} · no Field moved this week`;
  return `${fields} · ${k.grewMost ? `${k.grewMost} grew most this week` : "grew this week"}`;
}

// ─── The Life tracks card ───────────────────────────────────────────────────

/** One row of the Life tracks card, as <TrackRow/> draws it. */
export interface TrackRowData {
  sigil: "body" | "duty" | "craft" | "care" | "know";
  name: string;
  level: number;
  /** 0..1 at the end of last week (ink). */
  banked: number;
  /** 0..1 now (banked + this week's gain, in the currency that fed it). */
  now: number;
  gainKind: "xp" | "pts";
  /** The last ≤ 8 judged weeks, oldest first (life tracks only; never padded). */
  weeks?: WeekMark[];
  /** The depth-cap tick, passed only when the track is capped (at 1). */
  cap?: number;
  /** XP is waiting on kept weeks: the meter is full and the level cannot rise on XP. */
  capped?: boolean;
  line: string;
  seenKey: string;
}

/**
 * The Life tracks card's rows. Once life counts: the four tracks in the
 * order trackRowsView gives them (Duty, Craft, Body, Care), then Knowledge.
 * Before launch (or with no rows): Knowledge alone, so no life level is
 * ever shown before it is earned.
 */
export function lifeTrackRows(knowledge: KnowledgeRow, life: { launched: boolean; rows: readonly LifeTrackRow[] }): TrackRowData[] {
  const tracks: TrackRowData[] = life.launched
    ? life.rows.map((r) => ({
        sigil: r.sigil,
        name: r.name,
        level: r.level,
        banked: r.banked,
        now: r.now,
        gainKind: "xp" as const,
        weeks: r.weeks,
        ...(r.atCap ? { cap: 1, capped: true } : {}),
        line: r.line,
        seenKey: `you:track:${r.track.toLowerCase()}`,
      }))
    : [];
  return [
    ...tracks,
    {
      sigil: "know",
      name: "Knowledge",
      level: knowledge.level,
      banked: knowledge.banked,
      now: knowledge.now,
      gainKind: "pts",
      line: knowledgeLine(knowledge),
      seenKey: "you:track:knowledge",
    },
  ];
}

// ─── Attributes: the 7-day ghost ────────────────────────────────────────────

export interface FieldComposition {
  name: string;
  level: number;
  composition: Composition;
  /** 'LIFE' for a life track's row ('Life · Body'); a Field when absent. */
  source?: "FIELD" | "LIFE";
}

/**
 * The life tracks' attribute rows as radar sources: {name 'Life · Body',
 * level: the bonus-scaled level the attributes read, composition}, marked
 * LIFE so the top-three note can say how much the row gives.
 */
export function lifeCompositions(contributions: readonly FieldContribution[]): FieldComposition[] {
  return contributions.map((c) => ({ name: c.fieldName, level: c.level, composition: c.composition, source: "LIFE" as const }));
}

/**
 * Attribute scores 7 days ago, from the Field levels in that day's
 * snapshot. Compositions and streak bonuses are not snapshotted, so the
 * ghost scales today's score by how much of its Field base existed then:
 *   ghost(A) = score(A) × Σ level_then·w / Σ level_now·w
 * which is exact whenever compositions and streaks did not change, and
 * never invents movement that the Field levels do not show.
 * Returns null without a week-old snapshot.
 */
export function ghostScores(
  scores: AttributeScores,
  fields: readonly FieldComposition[],
  weekAgo: readonly FieldLevelRow[]
): AttributeScores | null {
  if (weekAgo.length === 0 || fields.length === 0) return null;
  const then = new Map(weekAgo.map((g) => [g.name, g.level]));
  const out = {} as AttributeScores;
  for (const a of ATTRIBUTES) {
    let baseNow = 0;
    let baseThen = 0;
    for (const f of fields) {
      const w = f.composition[a] / COMPOSITION_TOTAL;
      baseNow += f.level * w;
      baseThen += (then.get(f.name) ?? 0) * w;
    }
    out[a] = baseNow > 0 ? Math.round(scores[a] * Math.min(1, baseThen / baseNow) * 100) / 100 : scores[a];
  }
  return out;
}

export interface MainSource {
  name: string;
  /** level × weight / 100: the row's share of the attribute (exact for a life row). */
  value: number;
  source: "FIELD" | "LIFE";
}

/** Which row (a Field or a life track) feeds an attribute most, and by how much. Null when none does. */
export function mainSourceOf(a: Attribute, comps: readonly FieldComposition[]): MainSource | null {
  let best: MainSource | null = null;
  for (const f of comps) {
    const c = (f.level * f.composition[a]) / COMPOSITION_TOTAL;
    if (c > (best?.value ?? 0)) best = { name: f.name, value: c, source: f.source ?? "FIELD" };
  }
  return best;
}

/** Which Field feeds an attribute most, for the top-three list. */
export function mainSource(a: Attribute, fields: readonly FieldComposition[]): string | null {
  return mainSourceOf(a, fields)?.name ?? null;
}

/**
 * The top-three note's source: 'Life · Body +2.8' for a life row (its share
 * of the attribute is exact: level × weight), the Field's name otherwise.
 */
export function sourceLabel(src: MainSource | null): string | null {
  if (!src) return null;
  return src.source === "LIFE" ? `${src.name} +${src.value.toFixed(1)}` : src.name;
}

// ─── Radar geometry ─────────────────────────────────────────────────────────

export interface RadarAxis {
  attribute: Attribute;
  label: string;
  value: number;
  /** Polygon sides of its glyph (sidesFor). */
  sides: number;
  hue: string;
}

export interface RadarLayout {
  max: number;
  rings: string[];
  spokes: { x: number; y: number }[];
  now: string;
  ghost: string | null;
  markers: { attribute: Attribute; points: string; hue: string }[];
  /**
   * x/y: the SVG anchor (baseline). left/top: the label's anchor point as a
   * percentage of the viewBox box, for the HTML labels that sit over the SVG
   * and stay 12 px however far the plot is scaled down.
   */
  labels: { attribute: Attribute; x: number; y: number; left: number; top: number; anchor: "start" | "middle" | "end"; text: string; lead: boolean }[];
}

/** The radar's viewBox: −190 −160 380 320 (R = 112 plus room for the labels). */
export const RADAR_VIEWBOX = { x: -190, y: -160, w: 380, h: 320 } as const;
export const RADAR_VIEWBOX_ATTR = `${RADAR_VIEWBOX.x} ${RADAR_VIEWBOX.y} ${RADAR_VIEWBOX.w} ${RADAR_VIEWBOX.h}`;

/** A viewBox point as percentages of the box (for absolutely placed HTML). */
export function radarPercent(x: number, y: number): { left: number; top: number } {
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { left: r2(((x - RADAR_VIEWBOX.x) / RADAR_VIEWBOX.w) * 100), top: r2(((y - RADAR_VIEWBOX.y) / RADAR_VIEWBOX.h) * 100) };
}

const f1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

/** A round ceiling: 1, 2, 2.5, 5 × 10^k at or above the largest value (and above 0). */
export function niceMax(values: readonly number[]): number {
  const m = Math.max(1, ...values);
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * p >= m) return step * p;
  return 10 * p;
}

export function polygonPoints(sides: number, cx: number, cy: number, r: number): string {
  const n = Math.max(3, Math.min(8, Math.round(sides)));
  return Array.from({ length: n }, (_, k) => {
    const t = ((-90 + (360 / n) * k) * Math.PI) / 180;
    return `${f1(cx + r * Math.cos(t))},${f1(cy + r * Math.sin(t))}`;
  }).join(" ");
}

/** Geometry for a radar of radius R centred on 0,0 (viewBox −190 −160 380 320 fits R = 112). */
export function radarLayout(axes: readonly RadarAxis[], ghost: AttributeScores | null, R = 112): RadarLayout {
  const n = axes.length;
  const max = niceMax([...axes.map((a) => a.value), ...(ghost ? axes.map((a) => ghost[a.attribute]) : [])]);
  const ang = (i: number) => ((-90 + (360 / n) * i) * Math.PI) / 180;
  const pt = (i: number, v: number) => [Math.cos(ang(i)) * R * (v / max), Math.sin(ang(i)) * R * (v / max)] as const;
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).map(f1).join(",")).join(" ");
  const leadIdx = axes.reduce((b, a, i) => (a.value > axes[b].value ? i : b), 0);
  return {
    max,
    rings: [0.25, 0.5, 0.75, 1].map((f) => poly(axes.map(() => max * f))),
    spokes: axes.map((_, i) => {
      const [x, y] = pt(i, max);
      return { x: Number(f1(x)), y: Number(f1(y)) };
    }),
    now: poly(axes.map((a) => a.value)),
    ghost: ghost ? poly(axes.map((a) => ghost[a.attribute])) : null,
    markers: axes.map((a, i) => {
      const [x, y] = pt(i, a.value);
      return { attribute: a.attribute, points: polygonPoints(a.sides, x, y, 4.2), hue: a.hue };
    }),
    labels: axes.map((a, i) => {
      const [lx, ly] = pt(i, max * 1.2);
      const anchor = Math.abs(lx) < 8 ? "middle" : lx > 0 ? "start" : "end";
      return { attribute: a.attribute, x: Number(f1(lx)), y: Number(f1(ly + 4)), ...radarPercent(lx, ly), anchor, text: a.label, lead: i === leadIdx && a.value > 0 };
    }),
  };
}

// ─── The top three ──────────────────────────────────────────────────────────

export interface TopAttribute {
  attribute: Attribute;
  value: number;
  /** "leads · gives your epithet", "+14.2 this week", "from Statistics". */
  note: string;
}

export function topAttributes(
  scores: AttributeScores,
  ghost: AttributeScores | null,
  sourceOf: (a: Attribute) => string | null,
  count = 3
): TopAttribute[] {
  const ranked = [...ATTRIBUTES].filter((a) => scores[a] > 0).sort((a, b) => scores[b] - scores[a]);
  return ranked.slice(0, count).map((a, i) => {
    if (i === 0) return { attribute: a, value: scores[a], note: "leads · gives your epithet" };
    const gain = ghost ? scores[a] - ghost[a] : 0;
    if (gain >= 0.05) return { attribute: a, value: scores[a], note: `+${gain.toFixed(1)} this week` };
    const src = sourceOf(a);
    return { attribute: a, value: scores[a], note: src ? `from ${src}` : "from your Fields" };
  });
}

// ─── Figures and dates ──────────────────────────────────────────────────────

/** An MP figure as it was paid: 2 dp at most, no trailing zeros, en-GB grouping ('4.8', '1.5', '1,346', '0'). */
export function mpFigure(v: number): string {
  const r = round2(v);
  return (Object.is(r, -0) ? 0 : r).toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function partsOf(key: DayKey): [number, number, number] {
  const [y, m, d] = key.split("-").map(Number);
  return [y, m, d];
}

/** '28 Sep'; with `today` in another year, '28 Sep 2027'. (A fixed table: Intl's en-GB says 'Sept'.) */
export function shortDayLabel(key: DayKey, today?: DayKey): string {
  const [y, m, d] = partsOf(key);
  const year = today && partsOf(today)[0] !== y ? ` ${y}` : "";
  return `${d} ${MONTH_SHORT[m - 1]}${year}`;
}

/** '28 September'. */
export function longDayLabel(key: DayKey): string {
  const [, m, d] = partsOf(key);
  return `${d} ${MONTH_LONG[m - 1]}`;
}

/** 'Wednesday 7 October'. */
export function weekdayDayLabel(key: DayKey): string {
  const [y, m, d] = partsOf(key);
  return `${WEEKDAY_LONG[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTH_LONG[m - 1]}`;
}

// ─── Life: the launch note and the first judged week ────────────────────────

/** The 'Life now counts' note shows for this many days from the launch day. */
export const LIFE_NOTE_DAYS = 14;

/** True from the launch day through the next LIFE_NOTE_DAYS − 1 days, and only once life counts. */
export function lifeNoteDue(launched: boolean, launchDay: DayKey | null, today: DayKey): boolean {
  if (!launched || !launchDay) return false;
  const since = daysBetween(launchDay, today);
  return since >= 0 && since < LIFE_NOTE_DAYS;
}

/**
 * Before any week is judged: the first week to be (the one holding the
 * epoch day: the judge starts there), the day it is first judged
 * (life-weeks judgeDayOf: the Wednesday after its Sunday), and whether that
 * day has already come (then it is judged on the next page read).
 */
export function firstWeekJudgement(epochDay: DayKey, today: DayKey): { monday: DayKey; sunday: DayKey; judgeDay: DayKey; due: boolean } {
  const monday = weekStartKeyOf(epochDay);
  const sunday = addDays(monday, 6);
  return { monday, sunday, judgeDay: judgeDayOf(sunday), due: sunday <= lastJudgeableSunday(today) };
}

// ─── Life: the last judged week (the hero's cell and /today/week) ───────────

/** The Monday of an ISO week key ('2026-W40' → '2026-09-28'); null when the key is not one. */
export function mondayOfWeekKey(weekKey: string): DayKey | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!m) return null;
  // ISO 8601: week 1 is the week holding 4 January.
  const monday = addDays(weekStartKeyOf(`${m[1]}-01-04`), 7 * (Number(m[2]) - 1));
  return weekKeyOf(monday) === weekKey ? monday : null;
}

/** The hero's life MP cell: a figure (null: no week judged, nothing to show) against the cap, and its label. */
export interface LifeMpCell {
  used: number | null;
  cap: number;
  label: string;
}

/**
 * The hero's life MP cell, from LifeTracksView.mpLastWeek (lifeMpInWeek of
 * the last judged week: the figure /today/week's footer states). Kept weeks
 * are paid when their week is judged (from the Wednesday after), so 'this
 * week' would read near 0 every week. Named for what it is: 'life MP last
 * week' when the last judged week is the one that just ended; on Monday and
 * Tuesday (that week not judged yet) 'life MP, week of 21 Sep'; before any
 * week is judged no figure at all, rather than a 0 that reads as a verdict.
 * The same while the last judged week is a backfill week (it closed before
 * launch and paid nothing by rule): '—', 'life MP · first paid week not
 * judged yet', until the first week that can pay is judged.
 */
export function lifeMpCell(mp: { used: number; cap: number; weekKey: string | null; backfill?: boolean }, today: DayKey): LifeMpCell {
  if (!mp.weekKey) return { used: null, cap: mp.cap, label: "life MP · no week judged yet" };
  if (mp.backfill) return { used: null, cap: mp.cap, label: "life MP · first paid week not judged yet" };
  const lastMonday = addDays(weekStartKeyOf(today), -7);
  if (weekKeyOf(lastMonday) === mp.weekKey) return { used: mp.used, cap: mp.cap, label: "life MP last week" };
  const monday = mondayOfWeekKey(mp.weekKey);
  return { used: mp.used, cap: mp.cap, label: monday ? `life MP, week of ${shortDayLabel(monday, today)}` : "life MP, last judged week" };
}

/**
 * The week that just ended, while the last judged week is older (every
 * Monday and Tuesday, and Wednesday until the judge has run): its Monday,
 * the day it is first judged (judgeDayOf: the Wednesday after its Sunday),
 * and whether that day has come. Null when the last judged week is the one
 * that just ended.
 */
export function pendingWeek(lastJudgedSunday: DayKey, today: DayKey): { monday: DayKey; judgeDay: DayKey; due: boolean } | null {
  const endedSunday = addDays(weekStartKeyOf(today), -1);
  if (lastJudgedSunday >= endedSunday) return null;
  return { monday: addDays(endedSunday, -6), judgeDay: judgeDayOf(endedSunday), due: endedSunday <= lastJudgeableSunday(today) };
}

/**
 * /today/week's line about the weekly review still to come. Once life
 * counts, the Last week card already states each track's verdict and the MP
 * it paid (judged from the Wednesday after), so the line promises only the
 * parts still to come.
 */
export function weekReviewPromise(launched: boolean): string {
  return launched
    ? "Once each day is settled at 04:00, a short weekly review opens: the inbox to zero, a goals check-in, anything owed, and the shape of next week."
    : "Once each day is settled at 04:00, Monday opens a short review of the week that ended: what each track kept and why, the inbox to zero, a goals check-in, anything owed, and the shape of next week. It ends on the week card, which states the exact mastery points paid for each kept track.";
}
