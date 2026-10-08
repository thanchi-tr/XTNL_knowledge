/**
 * A task's or habit's icon and colour (TaskStyle), and the month calendars that show them: the drawer's per-task month
 * (a check on each day it was done) and the profile's month (each day's done tasks as their coloured icons). Pure and
 * client-safe: no database, no clock.
 *
 *   TASK_ICONS / TASK_COLORS     the closed sets a user picks from (a stored name outside them reads as none)
 *   taskStyleOf(raw)             a stored row → { icon, color } with unknown names dropped
 *   monthKeyOf / shiftMonth      "2026-10" from a life day; a month n months away
 *   monthGridOf(month)           the month as Monday-first weeks of DayKeys (null pads)
 *   monthLabelOf(month)          "October 2026"
 */
import type { DayKey } from "./life-day";

/** 24-unit stroke paths, drawn like the app's own icons (1.75 stroke, round caps), in the task's colour. */
export const TASK_ICONS = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  book: "M12 6.5C9.5 4.8 6.5 4.5 3.5 5.2v13c3-.7 6-.4 8.5 1.3 2.5-1.7 5.5-2 8.5-1.3v-13c-3-.7-6-.4-8.5 1.3zM12 6.5v13",
  walk: "M13.5 3.5a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 1 1 0-3.2zM12 8.5l-3 4.2 3.2 1.8-1.7 6M12 8.5l2.6 3 3.4.6M12.2 14.5l3.3 6M12 8.5L8.5 10l-1 2.5",
  dumbbell: "M6.5 7.5v9M17.5 7.5v9M3.5 10v4M20.5 10v4M6.5 12h11",
  water: "M12 3.5c3.5 4.5 5.5 7.6 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.9 2-6 5.5-10.5z",
  sleep: "M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z",
  food: "M12 7.5c-1-2-3.5-2.5-5-1.5-2.5 1.7-2.4 6.2-.5 9.5 1.4 2.4 3.3 3.5 5.5 2.5 2.2 1 4.1-.1 5.5-2.5 1.9-3.3 2-7.8-.5-9.5-1.5-1-4-.5-5 1.5zM12 7.5c0-2 1-3.5 2.5-4",
  money: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 1 0 0-17zM14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5V8M12 16v1.5",
  cart: "M3.5 4.5H6l2 10h10l2-7H7M9 18.5a1 1 0 1 0 0 2 1 1 0 1 0 0-2zM17 18.5a1 1 0 1 0 0 2 1 1 0 1 0 0-2z",
  home: "M4 11l8-6.5 8 6.5M6 9.5v10h12v-10M10 19.5v-5h4v5",
  clean: "M14.5 3.5l-4 9.5M6.5 13h8.5l1.5 7h-11.5z",
  work: "M4 8h16v11H4zM9 8V5.5h6V8M4 13h16",
  code: "M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.5 5.5l-3 13",
  pen: "M15 4.5l4.5 4.5L9 19.5H4.5V15zM13 6.5l4.5 4.5",
  music: "M9 17.5V6l10-2v11.5M9 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0zM19 15.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z",
  heart: "M12 19.5s-7.5-4.5-7.5-10a4 4 0 0 1 7.5-2 4 4 0 0 1 7.5 2c0 5.5-7.5 10-7.5 10z",
  pill: "M10.5 4.5l-6 6a3.5 3.5 0 0 0 5 5l6-6a3.5 3.5 0 0 0-5-5zM7.5 7.5l5 5",
  leaf: "M5 19c0-8 5-13.5 14-14 0 9-5.5 14-13 14zM5 19l8-8",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  star: "M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z",
} as const;
export type TaskIcon = keyof typeof TASK_ICONS;
export const TASK_ICON_NAMES = Object.keys(TASK_ICONS) as TaskIcon[];

/** Mid tones that read on the night and the vellum themes; always paired with the task's name (never colour alone). */
export const TASK_COLORS = {
  slate: "#8b97a8",
  red: "#e5574f",
  orange: "#ee8a3c",
  amber: "#d9a516",
  green: "#3fae6c",
  teal: "#24a99c",
  blue: "#3f8ee8",
  indigo: "#6f78ec",
  violet: "#a66ee8",
  pink: "#e2609f",
} as const;
export type TaskColor = keyof typeof TASK_COLORS;
export const TASK_COLOR_NAMES = Object.keys(TASK_COLORS) as TaskColor[];

/** What a task without a chosen style shows: the check, in slate. */
export const DEFAULT_TASK_ICON: TaskIcon = "check";
export const DEFAULT_TASK_COLOR: TaskColor = "slate";

export interface TaskStyle {
  icon: TaskIcon | null;
  color: TaskColor | null;
}

export const isTaskIcon = (v: unknown): v is TaskIcon => typeof v === "string" && Object.prototype.hasOwnProperty.call(TASK_ICONS, v);
export const isTaskColor = (v: unknown): v is TaskColor => typeof v === "string" && Object.prototype.hasOwnProperty.call(TASK_COLORS, v);

/** A stored row as a style: a name outside the sets reads as none. */
export function taskStyleOf(raw: { icon?: unknown; color?: unknown } | null | undefined): TaskStyle {
  return { icon: isTaskIcon(raw?.icon) ? raw.icon : null, color: isTaskColor(raw?.color) ? raw.color : null };
}

/** The icon and colour to draw: the chosen ones, else the defaults. */
export function shownStyleOf(style: TaskStyle | null | undefined): { icon: TaskIcon; color: TaskColor; path: string; hex: string } {
  const icon = style?.icon ?? DEFAULT_TASK_ICON;
  const color = style?.color ?? DEFAULT_TASK_COLOR;
  return { icon, color, path: TASK_ICONS[icon], hex: TASK_COLORS[color] };
}

// ── Months ──

/** "YYYY-MM". */
export type MonthKey = string;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const isMonthKey = (v: unknown): v is MonthKey => typeof v === "string" && MONTH_RE.test(v);

export function monthKeyOf(day: DayKey): MonthKey {
  return day.slice(0, 7);
}

export function shiftMonth(month: MonthKey, n: number): MonthKey {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + Math.trunc(n);
  const year = Math.floor(total / 12);
  return `${String(year).padStart(4, "0")}-${String(total - year * 12 + 1).padStart(2, "0")}`;
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Every day of the month, in order. */
export function monthDaysOf(month: MonthKey): DayKey[] {
  return Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

/** The month as Monday-first weeks; days outside it are null. */
export function monthGridOf(month: MonthKey): (DayKey | null)[][] {
  const days = monthDaysOf(month);
  const [y, m] = month.split("-").map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (DayKey | null)[] = [...Array.from({ length: lead }, () => null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (DayKey | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

export function monthLabelOf(month: MonthKey): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** A task month's day: done (a done, late, minimum or made-up tick), missed, or nothing recorded. */
export type TaskDayMark = "done" | "missed";
/** The instance statuses that read as done on a calendar. */
export const DONE_MARK_STATUSES: ReadonlySet<string> = new Set(["DONE", "DONE_LATE", "DONE_MVV", "MADE_UP"]);

/** The instances of a month folded to one mark a day: done wins over missed (an "Again" or a make-up). */
export function taskMonthMarksOf(instances: readonly { day: DayKey; status: string }[], month: MonthKey): Record<DayKey, TaskDayMark> {
  const out: Record<DayKey, TaskDayMark> = {};
  for (const i of instances) {
    if (monthKeyOf(i.day) !== month) continue;
    if (DONE_MARK_STATUSES.has(i.status)) out[i.day] = "done";
    else if (i.status === "MISSED" && out[i.day] !== "done") out[i.day] = "missed";
  }
  return out;
}

/** One done task on the profile's month. */
export interface MonthDoneTask {
  templateId: string;
  title: string;
  icon: TaskIcon | null;
  color: TaskColor | null;
}
