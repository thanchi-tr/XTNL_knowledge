/**
 * Chart and status colors for the institutional dark theme.
 *
 * Two rules carried over from tailwind.config.mts: hue means something, and
 * saturation stays low enough that a dense chart doesn't vibrate. The
 * categorical ramp below is deliberately narrow-gamut — adjacent series are
 * separated by lightness as much as hue, so it survives being read at
 * 8px-tall bar heights and by viewers with colour-vision deficiency.
 */

// Ordered categorical ramp. Index order is the assignment order, so the
// first Field on screen gets the accent blue and later ones step away.
export const CATEGORICAL = [
  "#4C8DFF", // accent blue
  "#5EA8A0", // teal
  "#B08A4F", // ochre
  "#8C7FD4", // muted indigo
  "#C97F7F", // clay
  "#6E93B8", // steel
  "#9AA1AC", // grey
  "#7FB0FF", // light blue
] as const;

/**
 * Stable colour for a Field name.
 *
 * Previously a hardcoded map keyed on the six Field names in
 * `prisma/seed.ts`, with a single grey fallback — so every Field a user
 * created was the same grey, and the moment the seed names changed the map
 * silently stopped matching. Hashing the name instead means any Field gets
 * a stable, distinct colour without a registry to maintain.
 */
export function fieldColor(fieldName: string): string {
  let hash = 0;
  for (let i = 0; i < fieldName.length; i++) {
    hash = (hash * 31 + fieldName.charCodeAt(i)) | 0;
  }
  return CATEGORICAL[Math.abs(hash) % CATEGORICAL.length];
}

/**
 * Question type is a classification, not a status — so these are lightness
 * steps within one hue family rather than four competing colours.
 */
export const QUESTION_TYPE_COLORS: Record<string, string> = {
  SHORT: "#6E93B8",
  MULTI: "#8C7FD4",
  FORMULA: "#5EA8A0",
  DIAGRAM: "#B08A4F",
};

/** The one place saturated hue is earned: review urgency. */
export const REVIEW_STATUS_COLORS = {
  overdue: "#E5484D",
  dueToday: "#F0A020",
  upcoming: "#3D9A6E",
};

// Shared recharts theming. Grid lines sit barely above the panel fill —
// a chart's gridlines should be findable, not readable.
export const CHART_THEME = {
  grid: "#232830",
  axis: "#6B727D",
  tooltipBg: "#14171C",
  tooltipBorder: "#2C323B",
};
