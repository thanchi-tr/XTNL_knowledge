/**
 * FROZEN CONTRACT — the information architecture: Ideas · Tasks · + · Body,
 * and the game layer and Settings behind the profile button (the crest).
 * Pure (the checks import it).
 *
 *   SECTIONS                 the three sections, their sub-pages, and the paths they own
 *   PROFILE                  the profile menu: Character, Skills, Loadout, Moments, Stats, Settings
 *   sectionOf(pathname)      "ideas" | "tasks" | "body" | null (null on a profile page)
 *   isProfilePath(pathname)  a profile page: no tab is current, the profile button is
 *   groupOf(pathname)        the section or PROFILE a path sits in, or null
 *   activeSub(pathname)      the sub-page href that is current (longest match), in either
 *   captureModeOf(pathname)  what the '+' and the capture hotkey start: an idea, a task or a weigh-in
 *   titleFor(pathname, day?) { eyebrow, title } for the top bar (a page may override it
 *                            with <ShellTitle/>); /today's title is the life day's date
 *   subsOf(group, work?)     a group's sub-pages, with the work tabs after Board on Tasks
 *                            (work tabs, 2026-10-12: a compatible addition; SECTIONS stay as they were)
 *
 * Every URL stays where it was: the sections only regroup them. Roadmap
 * (/you/roadmap and its intake, /you/roadmap/new) is an Ideas sub-page,
 * though the rest of /you is the profile; Ideas' prefixes are matched first,
 * so the longer /you/roadmap wins over the profile's /you. /dev is in
 * neither: its pages light no tab and no profile button.
 */
import type { IconName } from "@/components/ui/Icon";
import type { CaptureMode } from "@/components/capture/events";
import { WORK_BOARD_PATH, workBoardHref, workBoardIdOf } from "../../lib/work-boards";

export type SectionId = "ideas" | "tasks" | "body";
/** A section, or the profile menu ("you"). */
export type NavGroupId = SectionId | "you";

export interface SubPage {
  href: string;
  label: string;
  /** Other paths that light this sub-page (redirected legacy routes). */
  also?: string[];
  /** The profile menu's row icon. */
  icon?: IconName;
}

export interface NavGroup<Id extends NavGroupId = NavGroupId> {
  id: Id;
  label: string;
  href: string;
  icon: IconName;
  /** Every path prefix this group owns. */
  prefixes: string[];
  subs: SubPage[];
}

export type Section = NavGroup<SectionId>;

export const SECTIONS: readonly Section[] = [
  {
    id: "ideas",
    label: "Ideas",
    href: "/review",
    icon: "study",
    prefixes: ["/review", "/workspace", "/library", "/add", "/you/roadmap", "/structure", "/taxonomy"],
    subs: [
      { href: "/review", label: "Review", also: ["/workspace"] },
      { href: "/library", label: "Library" },
      { href: "/add", label: "New idea" },
      { href: "/you/roadmap", label: "Roadmap" },
      { href: "/structure", label: "Fields & Domains", also: ["/taxonomy"] },
    ],
  },
  {
    id: "tasks",
    label: "Tasks",
    href: "/today",
    icon: "today",
    prefixes: ["/today"],
    subs: [
      { href: "/today", label: "Board" },
      { href: "/today/week", label: "Weekly review" },
      { href: "/today/rules", label: "Rules" },
    ],
  },
  {
    id: "body",
    label: "Body",
    href: "/train",
    icon: "train",
    prefixes: ["/train"],
    subs: [
      { href: "/train", label: "This week" },
      { href: "/train/exercise", label: "Exercise" },
    ],
  },
];

/** The profile menu (ProfileMenu.tsx): the character and its game layer, and Settings. Out of the tabs. */
export const PROFILE: NavGroup<"you"> = {
  id: "you",
  label: "You",
  href: "/you",
  icon: "sheet",
  prefixes: ["/you", "/skills", "/overview", "/dashboard", "/settings"],
  subs: [
    { href: "/you", label: "Character", also: ["/overview"], icon: "sheet" },
    { href: "/skills", label: "Skills", icon: "tree" },
    { href: "/you/loadout", label: "Loadout", icon: "sword" },
    { href: "/you/moments", label: "Moments", icon: "star" },
    { href: "/you/stats", label: "Stats", also: ["/dashboard"], icon: "chart" },
    { href: "/settings", label: "Settings", icon: "gear" },
  ],
};

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
const owns = (g: NavGroup, pathname: string) => g.prefixes.some((p) => under(pathname, p));

/** The section a path sits in; null on a profile page (and anywhere else). The sections are matched before the profile. */
export function sectionOf(pathname: string | null | undefined): SectionId | null {
  if (!pathname) return null;
  for (const s of SECTIONS) if (owns(s, pathname)) return s.id;
  return null;
}

/** A profile page (Character, Skills, Loadout, Moments, Stats, Settings): no tab is current, the profile button is. */
export function isProfilePath(pathname: string | null | undefined): boolean {
  return !!pathname && sectionOf(pathname) === null && owns(PROFILE, pathname);
}

/** The section or the profile a path sits in, or null. */
export function groupOf(pathname: string | null | undefined): NavGroupId | null {
  return sectionOf(pathname) ?? (isProfilePath(pathname) ? "you" : null);
}

export function sectionById(id: SectionId): Section;
export function sectionById(id: "you"): NavGroup<"you">;
export function sectionById(id: NavGroupId): NavGroup;
/** A section by id; "you" is the profile menu (its tabs on compact, YouTabs). */
export function sectionById(id: NavGroupId): NavGroup {
  if (id === "you") return PROFILE;
  return SECTIONS.find((s) => s.id === id)!;
}

/** The current sub-page's href: the longest href (or alias) the path sits under, in its section or the profile. */
export function activeSub(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  // A work tab (/today/work/<id>) is its own sub-page, never Board's: known from the path, before any data.
  const work = workBoardIdOf(pathname);
  if (work) return workBoardHref(work);
  const id = groupOf(pathname);
  if (!id) return null;
  let best: { href: string; len: number } | null = null;
  for (const sub of sectionById(id).subs) {
    for (const p of [sub.href, ...(sub.also ?? [])]) {
      if (under(pathname, p) && (!best || p.length > best.len)) best = { href: sub.href, len: p.length };
    }
  }
  return best?.href ?? null;
}

/** A work tab as the strip shows it (the shell's data: shell-types ShellWorkTabs). */
export interface WorkTabLink {
  id: string;
  name: string;
}

/**
 * A group's sub-pages as the strips draw them (SectionTabs, the top bar's
 * tabs, the sidebar): nav.ts's own, and on Tasks the open work tabs right
 * after Board (Board · <work tabs> · Weekly review · Rules), each linking to
 * /today/work/<id>. With no work tab it is exactly the group's `subs`.
 */
export function subsOf(id: NavGroupId, work?: readonly WorkTabLink[] | null): SubPage[] {
  const subs = sectionById(id).subs;
  if (id !== "tasks" || !work || work.length === 0) return [...subs];
  const tabs: SubPage[] = work.map((w) => ({ href: workBoardHref(w.id), label: w.name }));
  const at = subs.findIndex((s) => s.href === "/today") + 1;
  return [...subs.slice(0, at), ...tabs, ...subs.slice(at)];
}

/** The href the strip's '+' (Add a work tab) sits after: the last work tab, else Board. */
export function addWorkTabAfter(work?: readonly WorkTabLink[] | null): string {
  return work && work.length > 0 ? workBoardHref(work[work.length - 1].id) : "/today";
}

/** What the '+' (and 'c' / Alt+N) starts on this path: an idea on Ideas, a weigh-in on Body, a task everywhere else. */
export function captureModeOf(pathname: string | null | undefined): CaptureMode {
  const id = sectionOf(pathname);
  return id === "ideas" ? "idea" : id === "body" ? "body" : "task";
}

/** The Capture buttons' accessible names by mode (each holds the visible word 'Capture'). */
export const CAPTURE_LABEL: Readonly<Record<CaptureMode, string>> = {
  task: "Capture a task",
  idea: "Capture an idea",
  body: "Capture a weigh-in",
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10-01" → "Thursday, 1 October". Pure calendar maths on the key (no time zone involved). */
export function longDate(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const weekday = WEEKDAYS[(utc.getUTCDay() + 6) % 7];
  return `${weekday}, ${d} ${MONTHS[m - 1]}`;
}

export interface TopTitle {
  eyebrow: string | null;
  title: string;
}

/**
 * The /dev/style pages' own titles (each lane's fixture route). Static titles
 * live here rather than in a page's <ShellTitle/>, so the server-rendered top
 * bar is already right on first paint and nothing swaps after hydration.
 */
export const DEV_STYLE_PAGES: readonly SubPage[] = [
  { href: "/dev/style", label: "Style" },
  { href: "/dev/style/today", label: "Today fixtures" },
  { href: "/dev/style/train", label: "Train fixtures" },
  { href: "/dev/style/review", label: "Review fixtures" },
  { href: "/dev/style/celebrate", label: "Celebrations" },
  { href: "/dev/style/art", label: "Art" },
  { href: "/dev/style/settings", label: "Settings fixtures" },
  { href: "/dev/style/roadmap", label: "Roadmap fixtures" },
  // ui-motion.md §9.1–§9.2 (M0a, M0b): the glyph gallery and the shader slots.
  { href: "/dev/style/glyphs", label: "Glyphs" },
  { href: "/dev/style/fx", label: "Shader" },
];

/**
 * The top bar's default title for a path. `dayKey` is the life day (life-day.ts todayKey).
 * A page overrides it with <ShellTitle/> only for data-driven titles; any
 * title known from the path belongs here (an override paints one title on the
 * server and swaps to another after hydration). The eyebrow is the section
 * (or "You" on a profile page); /today keeps "Today" over its date, the
 * board's own eyebrow (its <ShellTitle/>), so nothing swaps.
 */
export function titleFor(pathname: string | null | undefined, dayKey?: string): TopTitle {
  const path = pathname ?? "/";
  if (under(path, "/dev/style")) {
    let best: SubPage | null = null;
    for (const p of DEV_STYLE_PAGES) if (under(path, p.href) && (!best || p.href.length > best.href.length)) best = p;
    return { eyebrow: "Dev · Style", title: best?.label ?? "Style" };
  }
  if (path === "/today" && dayKey) return { eyebrow: "Today", title: longDate(dayKey) };
  if (under(path, "/library") && path !== "/library") return { eyebrow: "Ideas", title: "Idea" };
  // The intake form sits under the Roadmap tab, which would title it "Roadmap".
  if (under(path, "/you/roadmap/new")) return { eyebrow: "Ideas", title: "Set an aim" };
  if (under(path, "/today/rules")) return { eyebrow: "Tasks", title: "How a day is judged" };
  // A work tab: its name is data (the page's <ShellTitle/>); until then, 'Work'.
  if (under(path, WORK_BOARD_PATH)) return { eyebrow: "Tasks", title: "Work" };
  const id = groupOf(path);
  if (!id) return { eyebrow: null, title: "XTNL" };
  const group = sectionById(id);
  const sub = activeSub(path);
  return { eyebrow: group.label, title: group.subs.find((s) => s.href === sub)?.label ?? group.label };
}
