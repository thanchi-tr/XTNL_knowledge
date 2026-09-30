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

export interface ShellCharacter {
  /** Character level (today: the account level from field levels; M5 may redefine it here). */
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
  /** M5 track edges (level ÷ depth cap); null until tracks exist. */
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

/** The character level and its fraction toward the next: floor(Σ fieldLevel^0.75) and the remainder. */
export function characterLevelOf(fieldLevels: number[]): { level: number; progress: number } {
  const raw = fieldLevels.reduce((sum, lvl) => sum + Math.pow(Math.max(0, lvl), 0.75), 0);
  const level = Math.floor(raw);
  return { level, progress: Math.max(0, Math.min(1, raw - level)) };
}

export function toneOf(n: Pick<Notice, "group" | "tone">): AskTone {
  if (n.group === "Active effects") return n.tone === "bad" ? "owed" : "held";
  if (n.tone === "bad") return "owed";
  if (n.tone === "good") return "kept";
  if (n.tone === "info") return "quiet";
  return "ask";
}

export function asksFromNotices(notices: Notice[]): ShellAsk[] {
  return notices.map((n) => ({
    id: n.id,
    title: n.title,
    detail: n.detail,
    href: n.href,
    tone: toneOf(n),
    action: n.action,
    group: n.group,
  }));
}
