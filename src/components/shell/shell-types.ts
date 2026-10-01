/**
 * FROZEN CONTRACT — what the shell shows, from ONE cached query (src/lib/shell-data.ts).
 * Pure types and helpers; safe on the server, the client and in the checks.
 *
 * Honest numbers: every field is either real data or null/0. Nothing here is
 * ever filled with a placeholder figure; the shell renders an unnumbered crest
 * and no badges until the data arrives.
 */
import type { Material } from "@/lib/materials";
import type { Notice } from "@/lib/notifications";
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
}

export interface ShellData {
  character: ShellCharacter;
  /** Ink counts that ask something of you. 0 renders nothing. */
  badges: { today: number; study: number; train: number };
  asks: { count: number; items: ShellAsk[] };
  /** M2 debt: the separate owed pill. Zero until debt exists. */
  owed: { count: number };
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
 *   a boon in effect → held;
 *   the quota met → kept (the one notice that reports something kept);
 *   background info → quiet;
 *   everything that asks (due, past grace, the focus line, an encounter ready) → ink.
 */
export function toneOf(n: Pick<Notice, "group" | "tone"> & { id?: string }): AskTone {
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

/**
 * The bell sheet's rows: the notices that ask (counted), then the effects in
 * play (listed, not counted). Good-news and info notices (the focus line, the
 * quota met, cards due with nothing late) stay on Today, not in the bell.
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
  return [...notices.filter(asksOfYou).map(toAsk), ...notices.filter((n) => n.group === EFFECTS_GROUP).map(toAsk)];
}

/** The bell's count: exactly the rows that ask (so the badge and the sheet agree). */
export function askCount(items: readonly Pick<ShellAsk, "group">[]): number {
  return items.filter((a) => a.group !== EFFECTS_GROUP).length;
}
