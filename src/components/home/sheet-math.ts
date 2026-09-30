/**
 * The character sheet's arithmetic (pure: the pages, /dev/style/art and
 * scripts/you-check.ts share it). No invented numbers: every output is a
 * function of real field levels, attribute scores and snapshots, and a
 * missing input yields null rather than a placeholder.
 *
 *   characterRaw(levels)                 Σ fieldLevel^0.75 (the continuous character level)
 *   titleDistance(raw, transcendent)     the next title, its level, and the fraction of the
 *                                        way through the current title band (never drops on success)
 *   knowledgeRow(now, weekAgo)           the Knowledge track: level, banked, this week's gain, who grew most
 *   ghostScores(scores, fields, ghosts)  attribute scores 7 days ago, from the Field levels then
 *   radarLayout(axes, ghost)             13-gon geometry: rings, spokes, polygons, markers, labels
 *   polygonPoints(sides, cx, cy, r)      the attribute glyph (3–7 sides, the SkillLogo silhouette)
 *   topAttributes(scores, ghost, top)    the top three with a true note each
 */
import type { Attribute } from "@prisma/client";
import { ATTRIBUTES, COMPOSITION_TOTAL, type AttributeScores, type Composition } from "@/lib/attributes";
import { TITLE_BANDS } from "@/lib/titles";

// ─── Character level and titles ─────────────────────────────────────────────

/** Σ fieldLevel^0.75: floor() is the character level, the remainder is the way to the next. */
export function characterRaw(fieldLevels: readonly number[]): number {
  return fieldLevels.reduce((s, l) => s + Math.pow(Math.max(0, l), 0.75), 0);
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

// ─── Attributes: the 7-day ghost ────────────────────────────────────────────

export interface FieldComposition {
  name: string;
  level: number;
  composition: Composition;
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

/** Which Field feeds an attribute most, for the top-three list. */
export function mainSource(a: Attribute, fields: readonly FieldComposition[]): string | null {
  let best: string | null = null;
  let most = 0;
  for (const f of fields) {
    const c = (f.level * f.composition[a]) / COMPOSITION_TOTAL;
    if (c > most) {
      most = c;
      best = f.name;
    }
  }
  return best;
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
  labels: { attribute: Attribute; x: number; y: number; anchor: "start" | "middle" | "end"; text: string; lead: boolean }[];
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
      return { attribute: a.attribute, x: Number(f1(lx)), y: Number(f1(ly + 4)), anchor, text: a.label, lead: i === leadIdx && a.value > 0 };
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
