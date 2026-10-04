/**
 * The guided tour's steps, copy and start rule. Pure (scripts/tour-check.ts
 * imports it): no DOM, no React.
 *
 *   tourSteps({ keyboard, keyOf?, dutyLive? })   the seven steps, in order
 *   TODAY_COPY / TODAY_DUTY_COPY      the Today step before and once Duty is live (M2)
 *   copyText(body)                    a step's body as plain text (the check's 160-char budget)
 *   sayKey(key)                       'g t' → ['g', 't'] said "g then t"; 'Shift+?' → '?'
 *   shouldAutoStart(input)            the first-run guard (seen · path · dialog · automation · ?notour)
 *   readSeen / writeSeen              TOUR_SEEN_KEY in a Storage, every access in try/catch
 *
 * Every key the copy names is read from SHORTCUTS (src/lib/shortcuts.ts):
 * the copy holds shortcut ids, never key text. The phone step names no menu
 * entry: the installed app's icon shortcuts are labelled by whoever installed
 * it (the web manifest for a PWA, the Android shell's own strings), so the
 * copy says what they do, not what they are called.
 *
 * Targets are CSS selectors, best first; the tour spotlights the first one
 * that is on screen (the tab bar < 600, the rail 600–1279 and the sidebar
 * from 1280 are all in the DOM, two of them display:none). A page-specific
 * target ([data-tour="today-lanes"] on /today, [data-tour="you-hero"] on
 * /you) wins where it exists; elsewhere the step falls back to the shell's
 * own link, which is on every page. A step with no visible target is centred.
 */
import { SECTIONS } from "@/components/shell/nav";
import { keyParts, shortcutOf, type ShortcutId } from "@/lib/shortcuts";
import { TOUR_SEEN_KEY } from "@/lib/tour-contract";

export type TourStepId = "welcome" | "capture" | "today" | "study" | "you" | "shortcuts" | "done";

/** A piece of a step's body: plain text, or a key read out of SHORTCUTS. */
export type Seg = string | { keys: string[]; sep: "+" | " then " };

export interface TourStep {
  id: TourStepId;
  title: string;
  body: Seg[];
  /** CSS selectors, best first. Empty: no spotlight, the card is centred. */
  targets: string[];
}

export interface StepContext {
  /** A hover-and-fine-pointer device: show the keys. Otherwise the phone's app-icon shortcuts. */
  keyboard: boolean;
  /** The key a shortcut is pressed with (the check swaps it to prove nothing is hard-coded). */
  keyOf?: (id: ShortcutId) => string;
  /**
   * Duty is live (duty-economy isDutyLaunched(today), from the caller): the
   * Today step also says what a missed must costs and how it comes back.
   * Absent or false: the pre-Duty copy, exactly.
   */
  dutyLive?: boolean;
}

/** The Today step before Duty is live. */
export const TODAY_COPY = "Must, Planned and Habits. Ticking a task pays life XP, and its receipt shows how every number was worked out.";
/** The Today step once Duty is live (m2-refit F15): the same lanes, plus the stake and the way back, within the 160-character budget. */
export const TODAY_DUTY_COPY = "Must, Planned and Habits. A tick pays life XP; its receipt shows the sums. A must you miss is owed; make it up within two days and its streak comes back.";

/** Wait this long on /today after hydration before the first-run tour starts by itself. */
export const SETTLE_MS = 800;
/** While a dialog is open the first run waits, checking this often, this many times, then gives up for the page view. */
export const RETRY_MS = 1000;
export const RETRY_MAX = 10;
/** Set for the browser session by ?notour, so an audit's later navigations stay clear too. */
export const TOUR_OFF_SESSION_KEY = "xtnl:tour:off";

/** The shell's capture buttons (Chrome.tsx): the tab bar's +, the rail's and the sidebar's Capture. */
export const CAPTURE_TARGETS = [".tabbar .tab-plus", ".rail .r-plus", ".sidebar .sb-capture"] as const;

const hrefOf = (id: "today" | "study" | "train" | "you") => SECTIONS.find((s) => s.id === id)!.href;

/** A section's link in each chrome, in the order they could be visible. */
function navTargets(id: "today" | "study" | "you"): string[] {
  const href = hrefOf(id);
  if (id === "you") return [`.tabbar a[href="${href}"]`, `.rail a[href="${href}"]`, ".sidebar .sb-char"];
  return [`.tabbar a[href="${href}"]`, `.rail a[href="${href}"]`, `.sidebar .sb-sec a[href="${href}"]`];
}

/** How a key is said: a sequence is "g then t"; a symbol typed with Shift is just the symbol. */
export function sayKey(key: string): { keys: string[]; sep: "+" | " then " } {
  const parts = keyParts(key);
  if (key.includes(" ")) return { keys: parts, sep: " then " };
  if (parts.length === 2 && parts[0] === "Shift" && parts[1].length === 1 && !/[A-Za-z0-9]/.test(parts[1])) return { keys: [parts[1]], sep: "+" };
  return { keys: parts, sep: "+" };
}

export function copyText(body: readonly Seg[]): string {
  return body.map((s) => (typeof s === "string" ? s : s.keys.join(s.sep))).join("");
}

/** The phone's Shortcuts step: what the installed app's icon offers on a long-press, by what it does (no menu names). */
export const PHONE_SHORTCUTS_COPY = "On a phone with the app installed, long-press its icon for a quick task, a review or a new idea.";

export function tourSteps({ keyboard, keyOf = (id) => shortcutOf(id).keys[0], dutyLive = false }: StepContext): TourStep[] {
  const k = (id: ShortcutId): Seg => sayKey(keyOf(id));
  const shortcuts: Seg[] = keyboard
    ? [k("capture-anywhere"), " captures from anywhere; ", k("capture"), " does too when you are not typing. ", k("go-today"), " opens Today, ", k("go-study"), " Study. Press ", k("help"), " for the full list."]
    : [PHONE_SHORTCUTS_COPY];
  return [
    {
      id: "welcome",
      title: "Welcome",
      body: ["Your day, what you are learning, and one character that grows from both. Here is the short version."],
      targets: [],
    },
    {
      id: "capture",
      title: "Capture",
      body: ["Type a line like ‘pay rent fri 30m !’. Chips show what it read: the day, how long, and ! as a Must. Plain rules, no AI guessing."],
      targets: [...CAPTURE_TARGETS],
    },
    {
      id: "today",
      title: "Today",
      body: [dutyLive ? TODAY_DUTY_COPY : TODAY_COPY],
      targets: ['[data-tour="today-lanes"]', ...navTargets("today")],
    },
    {
      id: "study",
      title: "Study",
      body: ["Reviews bring an idea back just before you would forget it. The daily quest is a short review that closes one of Today’s rings."],
      targets: navTargets("study"),
    },
    {
      id: "you",
      title: "You",
      body: ["Your character. Its Fields and attributes grow from what you do: the ideas you learn and, once life counts, the days you keep."],
      targets: ['[data-tour="you-hero"]', ...navTargets("you"), '[data-tour="you-crest"]'],
    },
    {
      id: "shortcuts",
      title: keyboard ? "Shortcuts" : "From the home screen",
      body: shortcuts,
      targets: [],
    },
    {
      id: "done",
      title: "That is all",
      body: ["Replay this tour any time from Settings."],
      targets: [],
    },
  ];
}

// ── First run ───────────────────────────────────────────────────────────────

export interface AutoStartInput {
  /** TOUR_SEEN_KEY is set on this device. */
  seen: boolean;
  pathname: string;
  /** location.search, with its '?'. */
  search: string;
  /** A sheet, a dialog, the capture sheet or a ceremony is open. */
  dialogOpen: boolean;
  /** navigator.webdriver, or a headless browser (the ui-audit). */
  automated: boolean;
  /** ?notour was seen earlier in this browser session. */
  optedOut?: boolean;
}

const param = (search: string, name: string) => new RegExp(`(?:^\\?|&)${name}(?:=|&|$)`).test(search);

/** True when ?notour is in the query (the tour then also stays off for the session). */
export function hasNoTour(search: string): boolean {
  return param(search, "notour");
}

/**
 * The first-run guard: only on /today (never /dev/**, never another page),
 * once per device, never over a dialog, never for an automated browser, never
 * with ?notour, and never when the URL is about to open the capture sheet
 * (?capture=…, the app icon's Quick task).
 */
export function shouldAutoStart(i: AutoStartInput): boolean {
  if (i.seen || i.automated || i.dialogOpen || i.optedOut) return false;
  if (i.pathname !== hrefOf("today")) return false;
  if (hasNoTour(i.search) || param(i.search, "capture")) return false;
  return true;
}

export function readSeen(storage: Pick<Storage, "getItem"> | null | undefined): boolean {
  try {
    // No storage to remember it in: count it as seen, so the tour never starts on every page view.
    if (!storage) return true;
    return storage.getItem(TOUR_SEEN_KEY) != null;
  } catch {
    // Storage blocked (a private window, site data off): treat as seen, so the tour never nags every page view.
    return true;
  }
}

export function writeSeen(storage: Pick<Storage, "setItem"> | null | undefined): void {
  try {
    storage?.setItem(TOUR_SEEN_KEY, new Date().toISOString());
  } catch {
    // Nothing to do: the tour simply may start again next visit.
  }
}
