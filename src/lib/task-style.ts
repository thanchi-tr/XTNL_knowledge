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
  // ── Moving ──
  run: "M14.5 3.5a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 1 1 0-3.2zM8 9.5l3.5-1.5 2.5 2.5 3 1M11.5 8L10 13l3.5 2.5-1 5M10 13l-3.5 6",
  bike: "M2.5 17.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0zM14.5 17.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0zM6 17.5l3-7h6l3 7M9 10.5l3 7h2.5M14 6.5h2l-1 4",
  swim: "M3 17c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0M3 20.5c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0M16 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 1 1 0-3zM6 14l4-5 3 2.5 2-1.5",
  yoga: "M12 3.5a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 1 1 0-3.2zM12 8.5v5M7 11l5 2.5 5-2.5M4 18.5c3-1.5 5.5-2.5 8-2.5s5 1 8 2.5M8 18.5l4-2.5 4 2.5",
  mountain: "M3 19.5l6.5-11 4 6.5 2.5-4 5 8.5z",
  fire: "M12 20.5c-3.5 0-6-2.4-6-5.6 0-3.5 3-5.5 4-8.4 1.5 1.5 2 3 2 4.5 1-.8 1.8-2 2-3.3 2 1.8 4 4.4 4 7.2 0 3.2-2.5 5.6-6 5.6z",
  // ── Body and care ──
  coffee: "M5 8.5h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2M11 3.5v2M14 3.5v2",
  shower: "M5 20V7a3 3 0 0 1 6 0v.5M8 7.5h7a4 4 0 0 0-7 0zM10 11v1M13 11.5v1M16 11v1M11.5 14.5v1M14.5 14.5v1",
  tooth: "M8 4c-2.5 0-4 2-4 4.5 0 3 2 4.5 2.5 7.5.3 2 .8 4.5 2 4.5 1.5 0 1.5-5 3.5-5s2 5 3.5 5c1.2 0 1.7-2.5 2-4.5.5-3 2.5-4.5 2.5-7.5C20 6 18.5 4 16 4c-1.5 0-2.5 1-4 1S9.5 4 8 4z",
  smile: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 1 0 0-17zM8.5 14c1 1.5 2.2 2 3.5 2s2.5-.5 3.5-2M9 9.5h.01M15 9.5h.01",
  // ── Home and errands ──
  shirt: "M8.5 4L4 6.5l1.5 4L7 10v10h10V10l1.5.5 1.5-4L15.5 4c-.5 1.5-2 2.5-3.5 2.5S9 5.5 8.5 4z",
  trash: "M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 14h9l1-14M10 10v7M14 10v7",
  wallet: "M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4zM4 7l11-3v3M16 13.5h.01",
  car: "M4 15.5v-3l2-5h12l2 5v3zM4 15.5v3h3v-3M17 15.5v3h3v-3M4 12.5h16M7.5 14h.01M16.5 14h.01",
  plane: "M21 4l-8.5 8.5M21 4l-6 17-2.5-8.5L4 10z",
  paw: "M5 10a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0zM8.5 6a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0zM12.3 6a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0zM15.8 10a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0zM12 12.5c-2.5 0-5 2.6-5 5 0 1.6 1.4 2.5 3 2l2-.5 2 .5c1.6.5 3-.4 3-2 0-2.4-2.5-5-5-5z",
  plant: "M12 20.5v-6M12 14.5l-3-2.5M12 13l3-2.5M12 3.5c-3.5 0-6 2.7-6 6 0 3 2.5 5 6 5s6-2 6-5c0-3.3-2.5-6-6-6z",
  gift: "M4 9h16v4H4zM5.5 13h13v7.5h-13zM12 9v11.5M12 9c-1-3-5-4-5-1.5S10.5 9 12 9zM12 9c1-3 5-4 5-1.5S13.5 9 12 9z",
  // ── Work and mind ──
  mail: "M3.5 6.5h17v11h-17zM3.5 6.5l8.5 7 8.5-7",
  phone: "M8 3.5h8a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM11 17.5h2",
  chat: "M4 5.5h16v10H9l-5 4z",
  people: "M9 4.5a3 3 0 1 0 0 6 3 3 0 1 0 0-6zM3.5 19.5c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5M16 5.5a2.5 2.5 0 0 1 0 5M17.5 14c1.8.7 3 2.6 3 5",
  calendar: "M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5v4M15.5 3.5v4",
  clock: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 1 0 0-17zM12 7.5V12l3 2",
  bell: "M6 16.5V11a6 6 0 1 1 12 0v5.5l1.6 2H4.4zM10 20.5a2 2 0 0 0 4 0",
  chart: "M4 20h16M7 16v-5M12 16V7M17 16v-8",
  target: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 1 0 0-17zM12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 1 0 0-9zM12 11.2a.8.8 0 1 0 0 1.6.8.8 0 1 0 0-1.6z",
  flag: "M5.5 21V4M5.5 4.5h11l-2.5 4 2.5 4h-11",
  trophy: "M8 4.5h8v5a4 4 0 0 1-8 0zM8 6.5H5a3 3 0 0 0 3 3.5M16 6.5h3a3 3 0 0 1-3 3.5M12 13.5V17M8.5 20h7M10 17h4v3h-4z",
  bulb: "M9 17.5h6M10 20.5h4M12 3.5a6 6 0 0 0-3.5 10.9c.5.4.5 1 .5 1.6v1.5h6V16c0-.6 0-1.2.5-1.6A6 6 0 0 0 12 3.5z",
  graduate: "M2.5 9.5L12 5l9.5 4.5L12 14zM6.5 11.5V16c3 2 8 2 11 0v-4.5M21.5 9.5v5",
  globe: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 1 0 0-17zM3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z",
  // ── Play ──
  game: "M7 8.5h10a4 4 0 0 1 4 4v1a3 3 0 0 1-5.4 1.8L14.5 14h-5l-1.1 1.3A3 3 0 0 1 3 13.5v-1a4 4 0 0 1 4-4zM7.5 11v3M6 12.5h3M15.5 12h.01M17.5 13.5h.01",
  camera: "M4 8h3.5L9 5.5h6L16.5 8H20v11H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7z",
  palette: "M12 3.5a8.5 8.5 0 0 0 0 17c1.5 0 2-1 1.5-2.2-.6-1.4.2-2.8 1.8-2.8H18a2.5 2.5 0 0 0 2.5-2.5c0-5-3.8-9.5-8.5-9.5zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01M17 11h.01",
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
  rose: "#f06d7a",
  coral: "#f07b5a",
  lime: "#86b82a",
  mint: "#3fc89a",
  cyan: "#1fb0cf",
  plum: "#8e5bb5",
  brown: "#a87b52",
  gray: "#6f7682",
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
