/**
 * Chart and status colours, on the Sigil & Slate tokens (tokens.css).
 *
 * The chart rules (redesign.md › Components › Charts):
 *   - chrome: line-1 grid, ink-2 labels, an overlay tooltip;
 *   - a single series is ink-0;
 *   - several series are ink with DASH PATTERNS plus direct end labels, never
 *     a rainbow (hue is kept for state and currency);
 *   - review status uses the signal tokens: due is ink (plus a clock glyph),
 *     struggling is hatched owed, learned is kept.
 *
 * Values are CSS custom properties, so they follow the theme (Night / Vellum)
 * wherever they are used as a fill, stroke or background.
 */

/** Dash patterns for several ink series, in assignment order (solid first). */
export const SERIES_DASH = ["", "6 3", "2 3", "1 4", "8 2 2 2", "4 4"] as const;

export function seriesDash(index: number): string {
  return SERIES_DASH[index % SERIES_DASH.length];
}

/**
 * Stable per-Field identity.
 *
 * Fields used to get a hashed hue each; on the redesign a Field is told apart
 * by its label and, when several share one chart, by its dash pattern. The
 * hash is kept so a Field keeps the same pattern everywhere.
 */
export function fieldIndex(fieldName: string): number {
  let hash = 0;
  for (let i = 0; i < fieldName.length; i++) hash = (hash * 31 + fieldName.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

export function fieldDash(fieldName: string): string {
  return seriesDash(fieldIndex(fieldName));
}

/**
 * LEGACY — a hashed hue per Field, as hex (callers append hex alpha, e.g.
 * `${fieldColor(f)}1a`). Still used outside the You lane (Review, Library,
 * Field focus) until those lanes move to labels and dash patterns; the You
 * pages no longer colour Fields. Delete when grep reaches 0.
 */
const LEGACY_FIELD_HUES = ["#4C8DFF", "#5EA8A0", "#B08A4F", "#8C7FD4", "#C97F7F", "#6E93B8", "#9AA1AC", "#7FB0FF"] as const;

export function fieldColor(fieldName: string): string {
  return LEGACY_FIELD_HUES[fieldIndex(fieldName) % LEGACY_FIELD_HUES.length];
}

/** Question type is a classification, not a status: all ink, told apart by label. */
export const QUESTION_TYPE_COLORS: Record<string, string> = {
  SHORT: "var(--ink-0)",
  CLOZE: "var(--ink-0)",
  NUMERIC: "var(--ink-0)",
  MULTI: "var(--ink-0)",
  LIST: "var(--ink-0)",
  ORDER: "var(--ink-0)",
  FORMULA: "var(--ink-0)",
  DIAGRAM: "var(--ink-0)",
};

/** Review status on the signal tokens. "Due" is not a hue: it is ink plus a clock glyph. */
export const REVIEW_STATUS_COLORS = {
  /** Past grace: struggling, drawn hatched in owed with an outline. */
  overdue: "var(--owed)",
  /** Due now: ink. */
  dueToday: "var(--ink-0)",
  /** Learned / upcoming: kept. */
  upcoming: "var(--kept)",
};

/** The hatch for struggling cards (never colour alone). */
export const OWED_HATCH = "repeating-linear-gradient(135deg, var(--owed) 0 2px, transparent 2px 4px)";

/** Chart chrome for ink SVG charts (grid, axis, tooltip, the one series ink). */
export const CHART_THEME = {
  grid: "var(--line-1)",
  axis: "var(--ink-2)",
  tooltipBg: "var(--overlay)",
  tooltipBorder: "var(--line-2)",
  series: "var(--ink-0)",
};
