/**
 * FROZEN CONTRACT — the information architecture: Today · Study · + · Train · You.
 * Pure (the checks import it).
 *
 *   SECTIONS                 the four sections, their sub-pages, and the paths they own
 *   sectionOf(pathname)      "today" | "study" | "train" | "you" | null
 *   activeSub(pathname)      the sub-page href that is current (longest match)
 *   titleFor(pathname, day?) { eyebrow, title } for the top bar (a page may override it
 *                            with <ShellTitle/>); /today's title is the life day's date
 *
 * Routes other lanes create (/today/week, /structure, /you/*, /settings, /train)
 * are linked here from the start; they 404 until their lane lands.
 */
import type { IconName } from "@/components/ui/Icon";

export type SectionId = "today" | "study" | "train" | "you";

export interface SubPage {
  href: string;
  label: string;
  /** Other paths that light this sub-page (redirected legacy routes). */
  also?: string[];
}

export interface Section {
  id: SectionId;
  label: string;
  href: string;
  icon: IconName;
  /** Every path prefix this section owns. */
  prefixes: string[];
  subs: SubPage[];
}

export const SECTIONS: readonly Section[] = [
  {
    id: "today",
    label: "Today",
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
    id: "study",
    label: "Study",
    href: "/review",
    icon: "study",
    prefixes: ["/review", "/workspace", "/library", "/add", "/structure", "/taxonomy"],
    subs: [
      { href: "/review", label: "Review", also: ["/workspace"] },
      { href: "/library", label: "Library" },
      { href: "/add", label: "New idea" },
      { href: "/structure", label: "Fields & Domains", also: ["/taxonomy"] },
    ],
  },
  {
    id: "train",
    label: "Train",
    href: "/train",
    icon: "train",
    prefixes: ["/train"],
    subs: [{ href: "/train", label: "This week" }],
  },
  {
    id: "you",
    label: "You",
    href: "/you",
    icon: "sheet",
    prefixes: ["/you", "/skills", "/overview", "/dashboard", "/settings", "/dev"],
    subs: [
      { href: "/you", label: "Sheet", also: ["/overview"] },
      { href: "/skills", label: "Skills" },
      { href: "/you/loadout", label: "Loadout" },
      { href: "/you/moments", label: "Moments" },
      { href: "/you/stats", label: "Stats", also: ["/dashboard"] },
      { href: "/settings", label: "Settings" },
    ],
  },
];

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export function sectionOf(pathname: string | null | undefined): SectionId | null {
  if (!pathname) return null;
  for (const s of SECTIONS) if (s.prefixes.some((p) => under(pathname, p))) return s.id;
  return null;
}

export function sectionById(id: SectionId): Section {
  return SECTIONS.find((s) => s.id === id)!;
}

/** The current sub-page's href: the longest href (or alias) the path sits under. */
export function activeSub(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const id = sectionOf(pathname);
  if (!id) return null;
  let best: { href: string; len: number } | null = null;
  for (const sub of sectionById(id).subs) {
    for (const p of [sub.href, ...(sub.also ?? [])]) {
      if (under(pathname, p) && (!best || p.length > best.len)) best = { href: sub.href, len: p.length };
    }
  }
  return best?.href ?? null;
}

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
  { href: "/dev/style/review", label: "Review fixtures" },
  { href: "/dev/style/celebrate", label: "Celebrations" },
  { href: "/dev/style/art", label: "Art" },
  { href: "/dev/style/settings", label: "Settings fixtures" },
];

/**
 * The top bar's default title for a path. `dayKey` is the life day (life-day.ts todayKey).
 * A page overrides it with <ShellTitle/> only for data-driven titles; any
 * title known from the path belongs here (an override paints one title on the
 * server and swaps to another after hydration).
 */
export function titleFor(pathname: string | null | undefined, dayKey?: string): TopTitle {
  const path = pathname ?? "/";
  if (under(path, "/dev/style")) {
    let best: SubPage | null = null;
    for (const p of DEV_STYLE_PAGES) if (under(path, p.href) && (!best || p.href.length > best.href.length)) best = p;
    return { eyebrow: "Dev · Style", title: best?.label ?? "Style" };
  }
  if (path === "/today" && dayKey) return { eyebrow: "Today", title: longDate(dayKey) };
  if (under(path, "/library") && path !== "/library") return { eyebrow: "Study", title: "Idea" };
  // The sheet's title is the character, as the mockup names it (its tab is "Sheet").
  if (path === "/you") return { eyebrow: "You", title: "Character" };
  const id = sectionOf(path);
  if (!id) return { eyebrow: null, title: "XTNL" };
  const section = sectionById(id);
  const sub = activeSub(path);
  const label = section.subs.find((s) => s.href === sub)?.label ?? section.label;
  if (id === "today" && sub === "/today/rules") return { eyebrow: "Today", title: "How a day is judged" };
  return { eyebrow: section.label, title: label };
}
