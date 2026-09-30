/**
 * Settings' pure helpers (L5). Shared by SettingsView and
 * scripts/study-side-check.ts.
 *
 *   CAPACITY_PRESETS      the capacity sheet's quick choices, in minutes
 *   clampCapacity(m)      what the server will store (tasks.ts setDailyCapacityCore:
 *                         30..960, to the nearest 5), so the button says what is saved
 *   formatCapacity(m)     "4 h" · "4 h 30 min" · "45 min"
 */
export const CAPACITY_MIN = 30;
export const CAPACITY_MAX = 16 * 60;

export const CAPACITY_PRESETS: readonly number[] = [120, 180, 240, 300, 360, 480];

export function clampCapacity(minutes: number): number {
  if (!Number.isFinite(minutes)) return 240;
  return Math.max(CAPACITY_MIN, Math.min(CAPACITY_MAX, Math.round(minutes / 5) * 5));
}

export function formatCapacity(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/** LifeSettings.restWeekdays numbering: 1 = Monday … 7 = Sunday. */
export const WEEKDAYS: readonly { n: number; short: string; long: string }[] = [
  { n: 1, short: "Mon", long: "Monday" },
  { n: 2, short: "Tue", long: "Tuesday" },
  { n: 3, short: "Wed", long: "Wednesday" },
  { n: 4, short: "Thu", long: "Thursday" },
  { n: 5, short: "Fri", long: "Friday" },
  { n: 6, short: "Sat", long: "Saturday" },
  { n: 7, short: "Sun", long: "Sunday" },
];

/** Valid, de-duplicated, Monday-first. */
export function normalizeWeekdays(days: readonly number[]): number[] {
  return [...new Set(days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b);
}

/** "None" · "Sunday" · "Saturday and Sunday" · "Monday, Wednesday and Friday". */
export function restWeekdaysLabel(days: readonly number[]): string {
  const names = normalizeWeekdays(days).map((d) => WEEKDAYS[d - 1].long);
  if (names.length === 0) return "None";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
