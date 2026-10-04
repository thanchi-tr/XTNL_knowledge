/**
 * FROZEN CONTRACT — what the shell shows, from ONE cached query (src/lib/shell-data.ts).
 * Pure types and helpers; safe on the server, the client and in the checks.
 *
 * Honest numbers: every field is either real data or null/0. Nothing here is
 * ever filled with a placeholder figure; the shell renders an unnumbered crest
 * and no badges until the data arrives.
 */
import type { Material } from "@/lib/materials";
import type { Notice, NotificationFeed } from "@/lib/notifications";
import type { TrackEdges } from "@/components/ui/Crest";
import { characterLevel } from "@/lib/character";
import { TRACKS } from "@/lib/life-types";

export interface ShellCharacter {
  /** Character level: floor(Σ L^0.75) over the Field levels and, once life is launched (M5), the four track levels. */
  level: number | null;
  /** 0..1 toward level + 1. */
  progress: number | null;
  material: Material;
  /** "Adept" (or a Transcendent rank). */
  title: string | null;
  /** "of the Deep Archive" */
  epithet: string | null;
  /** The next title band's name, and the level it starts at. */
  nextTitle: string | null;
  nextTitleAt: number | null;
  /** M5 track edges (level ÷ depth cap); null until life is launched. */
  tracks: TrackEdges | null;
  transcendent: boolean;
}

export type AskTone = "ask" | "owed" | "kept" | "held" | "quiet";

export interface ShellAsk {
  id: string;
  title: string;
  detail: string;
  href?: string;
  tone: AskTone;
  /** One action label ("Review", "Sort"); the row itself is the action. */
  action?: string;
  group: string;
  /**
   * M2 (decision 27; a compatible extension): false for a row the bell lists
   * but never counts ('Yesterday: 2 musts open', 'Weekly review'). Absent
   * reads as counted, as before.
   */
  counted?: boolean;
}

export interface ShellData {
  character: ShellCharacter;
  /** Ink counts that ask something of you. 0 renders nothing. */
  badges: { today: number; study: number; train: number };
  asks: { count: number; items: ShellAsk[] };
  /** M2 debt: the separate owed pill (the Sidebar's 'n owed', ≥ 1280 px): open debts. Zero until debt exists. */
  owed: { count: number };
}

/** The feed's notice ids the shell treats specially (notifications.ts writes them through rituals.ts). */
export const OWED_NOTICE_ID = "owed";
export const YESTERDAY_MUSTS_NOTICE_ID = "yesterday-musts";
export const WEEK_REVIEW_NOTICE_ID = "week-review";

/** Info notices the bell lists but never counts (decision 27; the weekly review, F14). */
export const LISTED_ONLY_NOTICE_IDS: readonly string[] = [YESTERDAY_MUSTS_NOTICE_ID, WEEK_REVIEW_NOTICE_ID];

/** ShellData.owed from the feed's counts: the open debts (0 when the read failed or nothing is owed). */
export function owedOf(feed: Pick<NotificationFeed, "counts"> | null | undefined): ShellData["owed"] {
  const n = feed?.counts.owed?.count ?? 0;
  return { count: Number.isFinite(n) && n > 0 ? Math.floor(n) : 0 };
}

/** "86% to Practitioner at 15" when the next level is a new title, else "86% to level 15". */
export function levelCaption(c: Pick<ShellCharacter, "level" | "progress" | "nextTitle" | "nextTitleAt">): string | null {
  if (c.level == null || c.progress == null) return null;
  const pct = Math.floor(Math.max(0, Math.min(0.999, c.progress)) * 100);
  const next = c.level + 1;
  if (c.nextTitle && c.nextTitleAt === next) return `${pct}% to ${c.nextTitle} at ${next}`;
  return `${pct}% to level ${next}`;
}

/** The accessible name of the crest button. */
export function crestLabel(c: ShellCharacter | null | undefined): string {
  if (!c || c.level == null) return "You: open your character sheet";
  const who = [c.title, c.epithet].filter(Boolean).join(" ");
  return `Character level ${c.level}${who ? `, ${who}` : ""}. Open your sheet`;
}

/**
 * The character level and its fraction toward the next: floor(Σ L^0.75) over
 * the Field levels, then the track levels (M5; a compatible extension of
 * this frozen contract), and the remainder. Delegates to lib/character.ts,
 * the one formula. With no tracks it is exactly the pre-M5 number
 * (`.level === xp.fieldLevel(fieldLevels)`). Track levels are the plain
 * levels (trackLevelsOf), never the bonus-scaled ones the attributes read.
 */
export function characterLevelOf(fieldLevels: readonly number[], trackLevels: readonly number[] = []): { level: number; progress: number } {
  return characterLevel(fieldLevels, trackLevels);
}

/**
 * Track levels as characterLevelOf's second list, in one fixed order
 * (life-types TRACKS: Body, Duty, Craft, Care) so every caller sums the same
 * floats. Absent (not launched, or a snapshot without tracks): [].
 */
export function trackLevelsOf(levels: Readonly<Partial<Record<string, number>>> | null | undefined): number[] {
  if (!levels) return [];
  return TRACKS.map((t) => {
    const l = levels[t];
    return typeof l === "number" && Number.isFinite(l) ? l : 0;
  });
}

/** The feed's group for standing boons and debuffs: facts in effect, not asks. */
export const EFFECTS_GROUP = "Active effects";

/**
 * Colour grammar for an Ask's diamond. Colour only reports kept / owed / held:
 *   a debuff in effect → owed (a penalty is the only owed diamond, never a due date);
 *   Duty's open debt ('Owed: 2 · −12.5 XP', id 'owed', M2) → owed;
 *   a boon in effect → held;
 *   the quota met → kept (the one notice that reports something kept);
 *   background info → quiet;
 *   everything that asks (due, past grace, the focus line, an encounter ready) → ink.
 */
export function toneOf(n: Pick<Notice, "group" | "tone"> & { id?: string }): AskTone {
  if (n.id === OWED_NOTICE_ID) return "owed";
  if (n.group === EFFECTS_GROUP) return n.tone === "bad" ? "owed" : "held";
  if (n.id === "quota-met") return "kept";
  if (n.tone === "info") return "quiet";
  return "ask";
}

/**
 * A notice that asks something of you (the bell counts these): a warning, a
 * past-grace or penalty notice, or an encounter ready. Standing effects are
 * listed separately and never counted.
 */
export function asksOfYou(n: Pick<Notice, "id" | "group" | "tone">): boolean {
  if (n.group === EFFECTS_GROUP) return false;
  return n.tone === "warn" || n.tone === "bad" || n.id === "bosses";
}

/** An info notice the bell lists without counting it (LISTED_ONLY_NOTICE_IDS). */
export function listedOnly(n: Pick<Notice, "id" | "group" | "tone">): boolean {
  return n.group !== EFFECTS_GROUP && n.tone === "info" && LISTED_ONLY_NOTICE_IDS.includes(n.id);
}

/**
 * The bell sheet's rows: the notices that ask (counted), then Duty's listed
 * info rows (yesterday's open musts, the weekly review: counted: false), then
 * the effects in play (listed, not counted). Other good-news and info notices
 * (the focus line, the quota met, cards due with nothing late) stay on Today,
 * not in the bell.
 */
export function asksFromNotices(notices: Notice[]): ShellAsk[] {
  const toAsk = (n: Notice): ShellAsk => ({
    id: n.id,
    title: n.title,
    detail: n.detail,
    href: n.href,
    tone: toneOf(n),
    action: n.action,
    group: n.group,
  });
  return [
    ...notices.filter(asksOfYou).map(toAsk),
    ...notices.filter(listedOnly).map((n) => ({ ...toAsk(n), counted: false })),
    ...notices.filter((n) => n.group === EFFECTS_GROUP).map(toAsk),
  ];
}

/** The bell's count: exactly the rows that ask (so the badge and the sheet agree); an effect or a listed-only row never counts. */
export function askCount(items: readonly Pick<ShellAsk, "group" | "counted">[]): number {
  return items.filter((a) => a.group !== EFFECTS_GROUP && a.counted !== false).length;
}

/**
 * The bell sheet's three sections, in order (M2; a compatible addition):
 * `asking` is exactly askCount's rows (the card the badge counts), `listed`
 * the rows listed but never counted (yesterday's open musts, the weekly
 * review), shown under their own quiet heading, and `effects` the boons and
 * debuffs in play. Every item lands in exactly one section.
 */
export function askSectionsOf<T extends Pick<ShellAsk, "group" | "counted">>(items: readonly T[]): { asking: T[]; listed: T[]; effects: T[] } {
  const asking: T[] = [];
  const listed: T[] = [];
  const effects: T[] = [];
  for (const a of items) {
    if (a.group === EFFECTS_GROUP) effects.push(a);
    else if (a.counted === false) listed.push(a);
    else asking.push(a);
  }
  return { asking, listed, effects };
}
