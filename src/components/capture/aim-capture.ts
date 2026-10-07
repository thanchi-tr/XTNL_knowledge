/**
 * The aim from the capture line (docs/life-plan/roadmap-rev4.md F-R4-7,
 * lane C): the rules the sheet and the vocabulary read share. Pure: no
 * React, no DOM, no database, no clock and no model, so
 * scripts/capture-server-check.ts drives every rule with fakes.
 *
 *   - An aim line: 'aim: <words>' at the very start of the line
 *     (roadmap-handoff aimLineOf is the one parser). It is never saved as a
 *     task: the sheet shows one chip ('Aim → roadmap form'), its primary
 *     reads 'Open the aim form', and it writes the aim handoff (sessionStorage,
 *     never a URL) and navigates. Its chip, like every chip, turns its words
 *     back into text with one tap (a reverted span over the 'aim:' prefix),
 *     and then the line is an ordinary task on the sheet and the server alike
 *     (aimCaptureOf).
 *   - The open goals (CaptureVocabulary.aim, read once and cached on
 *     'roadmap'; revision 5, contracts §23.5: {open, seatsFree, drafts}).
 *     With one seat (GOALS_MAX 1) the open goal decides, as before: with a
 *     DRAFT the button reads 'Open your draft', with an ACTIVE roadmap 'Open
 *     your roadmap' and the chip 'Aim · one is already set' (aimActionOf,
 *     aimChipLabel). Above one seat an 'aim:' line hands off whenever a seat
 *     is free (the form opens for a new goal), and with every seat taken the
 *     chip reads AIM_CHIP_FULL and the form's page (the GoalsFullCard) holds
 *     the aim until a seat frees. A missing roadmap table reads as no goal
 *     open; any other failure leaves it unknown, and the sheet then acts as
 *     with no goal open but never offers 'Make it an aim' (readCaptureAim).
 *   - A long goal ('goal long: …', '#long', or a goal dated over 180 days
 *     out) with no roadmap open offers 'Make it an aim', which visibly
 *     rewrites the line's goal prefix to 'aim: ' (aimRewriteOf). Saving it
 *     as a goal still works, unchanged. The offer is a set-an-aim suggestion,
 *     so it follows the user's "no" as /you and Today do (decision 34, fix
 *     round 2): only while the prompt is ASK — never after "Don't suggest
 *     this" or the Settings switch (OFF), nor for the 4 weeks of a "Not now"
 *     (LATER, HIDDEN) (CaptureVocabulary.aimPrompt, readCaptureAimPrompt).
 *     With several seats it offers while a seat is free.
 *     An 'aim:' line is the user's own words, not a suggestion: it opens the
 *     form whatever the prompt.
 *
 * Nothing here names Gemini, counts, rewards or uses red (roadmap-rev4
 * decision 33). The aim is the user's words, carried verbatim.
 */
import { MAX_CAPTURE_CHARS, shiftReverted, type CaptureSpan } from "../../lib/capture-parse";
import type { DayKey } from "../../lib/life-day";
import type { ParsedCapture } from "../../lib/life-types";
import { aimLineOf, type AimHandoff } from "../../lib/roadmap-handoff";
import { aimPromptOf, type AimPrompt } from "../../lib/roadmap-invite";
import { AIM_MAX, GOALS_MAX, GOAL_SLOTS_MAX, isMissingRev4Column, isMissingRoadmapTable } from "../../lib/roadmap-types";

/** The intake form ('Set an aim'), and the roadmap page an open DRAFT or ACTIVE plan lives on. Fixed paths: nothing typed ever reaches a URL. */
export const AIM_FORM_HREF = "/you/roadmap/new";
/** A new goal beside the open ones (ruling N15): its own createKey, never over another goal's draft. */
export const AIM_NEW_GOAL_HREF = "/you/roadmap/new?new=1";
export const AIM_ROADMAP_HREF = "/you/roadmap";

// ── The open goals (CaptureVocabulary.aim) ──────────────────────────────────

/**
 * The open goals as the capture sheet reads them (CaptureVocabulary.aim;
 * revision 5, contracts §23.5): `open`, the DRAFT and ACTIVE goals (the ones
 * that hold a seat); `seatsFree`, the seats left under GOALS_MAX; `drafts`,
 * how many of the open ones are DRAFTs (with one seat, whether the open goal
 * is a draft: 'Open your draft').
 */
export interface CaptureAim {
  open: number;
  seatsFree: number;
  drafts: number;
}

/**
 * The roadmap statuses the vocabulary reads: the ones that hold a seat
 * (roadmap-types SEAT_STATUSES). A PAUSED goal frees its seat (contracts
 * §23.4's audit), so it is left out, as DONE and ARCHIVED are.
 */
export const OPEN_ROADMAP_STATUSES = ["DRAFT", "ACTIVE"] as const;
/** The read's bound (its `take`): one past the seats the database allows, enough to tell every seat is taken. */
export const CAPTURE_AIM_READ_MAX = GOAL_SLOTS_MAX + 1;

/** The effective cap: a whole number within 1..GOAL_SLOTS_MAX; GOALS_MAX when absent or not a number (as roadmap-goals reads it). */
function capOf(goalsMax: number | undefined): number {
  const n = typeof goalsMax === "number" && Number.isFinite(goalsMax) ? Math.floor(goalsMax) : GOALS_MAX;
  return Math.max(1, Math.min(GOAL_SLOTS_MAX, n));
}

/** The open goals from the statuses read: DRAFT and ACTIVE count, anything else is ignored; the free seats are the cap's (default GOALS_MAX) less the open ones. */
export function captureAimOf(statuses: readonly unknown[], goalsMax?: number): CaptureAim {
  const open = statuses.filter((s) => s === "DRAFT" || s === "ACTIVE").length;
  const drafts = statuses.filter((s) => s === "DRAFT").length;
  return { open, seatsFree: Math.max(0, capOf(goalsMax) - open), drafts };
}

/** A failed read: a missing Roadmap table (life_roadmap not applied) is no goal open (every seat free); anything else is unknown (undefined). */
export function captureAimOnError(err: unknown, goalsMax?: number): CaptureAim | undefined {
  return isMissingRoadmapTable(err) ? captureAimOf([], goalsMax) : undefined;
}

/**
 * The vocabulary's `aim`: `read` returns the open roadmaps' statuses (the
 * action's one cached, indexed read). Never throws.
 */
export async function readCaptureAim(read: () => Promise<readonly unknown[]>, goalsMax?: number): Promise<CaptureAim | undefined> {
  try {
    const statuses = await read();
    return Array.isArray(statuses) ? captureAimOf(statuses, goalsMax) : undefined;
  } catch (err) {
    return captureAimOnError(err, goalsMax);
  }
}

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 99;

/** A value the sheet may trust as CaptureVocabulary.aim: three whole counts, the drafts within the open goals, the free seats within GOAL_SLOTS_MAX (anything else reads as unknown). */
export function isCaptureAim(v: unknown): v is CaptureAim {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const { open, seatsFree, drafts } = v as Record<string, unknown>;
  return isCount(open) && isCount(seatsFree) && isCount(drafts) && drafts <= open && seatsFree <= GOAL_SLOTS_MAX;
}

/**
 * The aim line's state: NONE (a seat free, or the open goals unknown), DRAFT
 * or ACTIVE (one seat: its goal's state, ACTIVE winning, as before revision
 * 5), FULL (every seat taken under a cap above one; GOALS_MAX is 1 until
 * lane 4 lifts it to GOAL_SLOTS_MAX).
 */
type AimState = "NONE" | "NEW" | "DRAFT" | "ACTIVE" | "FULL";
function aimStateOf(aim: CaptureAim | undefined | null, goalsMax: number | undefined): AimState {
  if (!isCaptureAim(aim)) return "NONE";
  // Several seats: a free one takes the aim as a new goal (beside any open one: NEW), else every seat is taken.
  if (capOf(goalsMax) > 1) return aim.seatsFree > 0 ? (aim.open > 0 ? "NEW" : "NONE") : "FULL";
  if (aim.open > aim.drafts) return "ACTIVE";
  return aim.drafts > 0 ? "DRAFT" : "NONE";
}

// ── The user's "no" (CaptureVocabulary.aimPrompt) ───────────────────────────

/**
 * The vocabulary's `aimPrompt`: roadmap-invite aimPromptOf over the stored
 * switch and the AIM_PROMPT_COOKIE value, the one rule /you, Today and
 * Settings read. `readSetting` answers LifeSettings.aimSuggestions (null: no
 * row, or never set). A read that fails only because that revision-4 column
 * is missing (the migration not applied yet; isMissingRev4Column) reads as
 * never set (on), as Settings and /you read it; any other failure is unknown
 * (undefined), and the sheet then never offers 'Make it an aim'. Never throws.
 */
export async function readCaptureAimPrompt(
  readSetting: () => Promise<boolean | null | undefined>,
  cookie: string | null | undefined,
  today: DayKey
): Promise<AimPrompt | undefined> {
  let setting: boolean | null;
  try {
    const s = await readSetting();
    setting = s === true || s === false ? s : null;
  } catch (err) {
    if (!isMissingRev4Column(err)) return undefined;
    setting = null;
  }
  return aimPromptOf(cookie, setting, today);
}

/** A value the sheet may trust as CaptureVocabulary.aimPrompt (anything else reads as unknown). */
export function isCaptureAimPrompt(v: unknown): v is AimPrompt {
  return v === "ASK" || v === "LATER" || v === "HIDDEN" || v === "OFF";
}

/**
 * A new opening of the sheet: the prompt a load older than `freshMs` (the
 * vocabulary's VOCAB_FRESH_MS), or of another life day, read is unknown
 * again, so a "Not now" or "Don't suggest this" tapped since is never
 * contradicted by an old answer; the next load reads it again. The same
 * object back when nothing changes.
 */
export function aimPromptOnOpen<V extends { day: DayKey; at: number; aimPrompt?: AimPrompt }>(v: V | null, today: DayKey, now: number, freshMs: number): V | null {
  if (!v || v.aimPrompt === undefined) return v;
  if (v.day === today && now - v.at < freshMs) return v;
  return { ...v, aimPrompt: undefined };
}

// ── An aim line ─────────────────────────────────────────────────────────────

const AIM_PREFIX = /^(\s*)aim\s*:/i;

/** An aim line: the aim (aimLineOf's words) and the 'aim:' prefix's span, which the chip reverts. */
export interface AimCapture {
  aim: string;
  prefix: CaptureSpan;
}

/** The span of the 'aim:' prefix (without the spaces before it), or null when the line is not an aim line. */
export function aimPrefixSpan(text: string): CaptureSpan | null {
  if (aimLineOf(text) === null) return null;
  const m = AIM_PREFIX.exec(text);
  return m ? { start: m[1].length, end: m[0].length } : null;
}

/**
 * The line as an aim, or null: not an aim line (aimLineOf), or its 'aim:'
 * prefix kept as text (a reverted span touches it — the chip was tapped),
 * when it reads as a task.
 */
export function aimCaptureOf(text: string, reverted: readonly CaptureSpan[] = []): AimCapture | null {
  if (typeof text !== "string") return null;
  const aim = aimLineOf(text);
  if (aim === null) return null;
  const prefix = aimPrefixSpan(text);
  if (!prefix) return null;
  if (reverted.some((r) => r.start < prefix.end && r.end > prefix.start)) return null;
  return { aim, prefix };
}

/** What the aim line's primary button (and Enter) does, by the open goals. */
export interface AimAction {
  /** The primary button's words: never empty, never disabled. */
  label: string;
  href: typeof AIM_FORM_HREF | typeof AIM_NEW_GOAL_HREF | typeof AIM_ROADMAP_HREF;
  /** Whether the aim is handed over (sessionStorage) on the way: not to an ACTIVE roadmap with one seat, which can't take a new aim (with every seat of several taken, the GoalsFullCard holds it). */
  handoff: boolean;
  /** The footer's line in place of the save hints: desktop, then phone. */
  keyHint: string;
  touchHint: string;
}

export const AIM_OPEN_FORM = "Open the aim form";
export const AIM_OPEN_DRAFT = "Open your draft";
export const AIM_OPEN_ROADMAP = "Open your roadmap";

const AIM_ACTIONS: Record<AimState, AimAction> = {
  NONE: { label: AIM_OPEN_FORM, href: AIM_FORM_HREF, handoff: true, keyHint: "Enter opens the aim form · Esc closes", touchHint: "Enter opens the aim form" },
  // A seat free beside open goals (ruling N15): the form for a new goal, so the aim never lands on another goal's draft.
  NEW: { label: AIM_OPEN_FORM, href: AIM_NEW_GOAL_HREF, handoff: true, keyHint: "Enter opens the aim form · Esc closes", touchHint: "Enter opens the aim form" },
  // Every seat taken (GOALS_MAX above 1): the form's page shows the GoalsFullCard, which holds the aim until a seat frees (roadmap-handoff holdAimHandoff).
  FULL: { label: AIM_OPEN_FORM, href: AIM_FORM_HREF, handoff: true, keyHint: "Enter opens the aim form · Esc closes", touchHint: "Enter opens the aim form" },
  DRAFT: { label: AIM_OPEN_DRAFT, href: AIM_ROADMAP_HREF, handoff: true, keyHint: "Enter opens your draft · Esc closes", touchHint: "Enter opens your draft" },
  ACTIVE: { label: AIM_OPEN_ROADMAP, href: AIM_ROADMAP_HREF, handoff: false, keyHint: "Enter opens your roadmap · Esc closes", touchHint: "Enter opens your roadmap" },
};

/**
 * The aim line's action. Unknown (the vocabulary not loaded, or its read
 * failed) acts as with no goal open: the form handles an open roadmap
 * itself. `goalsMax` (default GOALS_MAX) is a check's seam.
 */
export function aimActionOf(aim: CaptureAim | undefined | null, goalsMax: number = GOALS_MAX): AimAction {
  return AIM_ACTIONS[aimStateOf(aim, goalsMax)];
}

export const AIM_CHIP = "Aim → roadmap form";
export const AIM_CHIP_SET = "Aim · one is already set";
/** Every seat taken (contracts §23.5): in place of AIM_CHIP_SET once GOALS_MAX is above 1 (lane 4's roadmap-copy may re-export it). */
export const AIM_CHIP_FULL = `Aim · ${GOAL_SLOTS_MAX} goals open`;

/** The aim line's one chip: AIM_CHIP_SET with one seat and an ACTIVE roadmap, AIM_CHIP_FULL with every seat of several taken, else AIM_CHIP. */
export function aimChipLabel(aim: CaptureAim | undefined | null, goalsMax: number = GOALS_MAX): string {
  const state = aimStateOf(aim, goalsMax);
  return state === "FULL" ? AIM_CHIP_FULL : state === "ACTIVE" ? AIM_CHIP_SET : AIM_CHIP;
}

/** 'n / 140' once the aim is longer than the form takes (AIM_MAX); null otherwise. Counted as the form counts (string length). */
export function aimCounterOf(aim: string): string | null {
  return aim.length > AIM_MAX ? `${aim.length} / ${AIM_MAX}` : null;
}

/**
 * What the sheet hands to the intake form: the aim, its source, and the line
 * itself, so the form can clear it once an intake that took this aim saves
 * (never on a save that didn't use it: an open draft saved without 'Use it').
 */
export function aimHandoffOf(capture: AimCapture, sheetText: string): AimHandoff {
  return { aim: capture.aim, source: "capture", sheetText };
}

// ── A long goal, offered as an aim ──────────────────────────────────────────

export const AIM_LONG_GOAL_NOTE = "Long-term? Make it your aim: the app plans milestones and measures them.";
export const MAKE_IT_AN_AIM = "Make it an aim";

/** A goal line that parses LONG ('goal long:', '#long', or dated over 180 days out) with a title. */
export function isLongGoalLine(parsed: Pick<ParsedCapture, "mode" | "horizon" | "title"> | null | undefined): boolean {
  return !!parsed && parsed.mode === "GOAL" && parsed.horizon === "LONG" && !!parsed.title.trim();
}

/**
 * 'Make it an aim' shows only for a long goal while a seat is free (the open
 * goals known; with GOALS_MAX 1, no roadmap open) and set-an-aim
 * suggestions are on and not snoozed (the prompt known to be ASK: decision
 * 34's "Not now quiets every set-an-aim suggestion", and the lasting no, as
 * Today's SET line reads it).
 */
export function offersAim(
  parsed: Pick<ParsedCapture, "mode" | "horizon" | "title"> | null | undefined,
  aim: CaptureAim | undefined | null,
  prompt: AimPrompt | undefined | null
): boolean {
  return isCaptureAim(aim) && aim.seatsFree > 0 && prompt === "ASK" && isLongGoalLine(parsed);
}

/** The line after 'Make it an aim', with its reverted spans moved along and the caret at the end. */
export interface AimRewrite {
  text: string;
  reverted: CaptureSpan[];
  caret: number;
}

/** Removes [start, end) and the spaces before it (or after it, at the line's start), so no double space is left. */
function cutSpan(s: string, start: number, end: number): string {
  let a = start;
  let b = end;
  while (a > 0 && /\s/.test(s[a - 1])) a--;
  if (a === 0) while (b < s.length && /\s/.test(s[b])) b++;
  return s.slice(0, a) + s.slice(b);
}

/**
 * 'Make it an aim': the long goal's prefix becomes 'aim:' ('goal long: run
 * a marathon' → 'aim: run a marathon'), and the horizon tag that made it a
 * goal ('#long', 'hashtag long') goes; a line with no prefix gains 'aim: '
 * in front. Every other word stays as typed. Null when the line is not a
 * long goal, or the result would not be an aim line within the capture cap.
 */
export function aimRewriteOf(text: string, reverted: readonly CaptureSpan[], parsed: ParsedCapture): AimRewrite | null {
  if (typeof text !== "string" || !isLongGoalLine(parsed)) return null;
  const mode = parsed.tokens.find((t) => t.field === "mode") ?? null;
  const edits = [
    ...parsed.tokens.filter((t) => t.field === "horizon").map((t) => ({ start: t.start, end: t.end, put: null as string | null })),
    ...(mode ? [{ start: mode.start, end: mode.end, put: "aim:" as string | null }] : []),
  ].sort((x, y) => y.start - x.start);
  let next = text;
  let spans: CaptureSpan[] = [...reverted];
  const apply = (out: string) => {
    spans = shiftReverted(next, out, spans);
    next = out;
  };
  // Last first, so every earlier token's offsets still hold.
  for (const e of edits) {
    if (e.start < 0 || e.end > next.length || e.start >= e.end) return null;
    apply(e.put === null ? cutSpan(next, e.start, e.end) : `${next.slice(0, e.start)}${e.put}${next.slice(e.end)}`);
  }
  if (!mode) apply(`aim: ${next.trimStart()}`);
  if (next.length > MAX_CAPTURE_CHARS || aimCaptureOf(next, spans) === null) return null;
  return { text: next, reverted: spans, caret: next.length };
}
