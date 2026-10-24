/**
 * Every keyboard shortcut the app answers, in one list: the global handler,
 * the '?' help sheet, Settings, the tour and aria-keyshortcuts all read it,
 * and scripts/shortcut-check.ts holds it against Chrome's and Edge's own
 * shortcuts (BROWSER_RESERVED) so the app never takes a key the browser uses.
 *
 * The rule that keeps it clear of the browsers: page-wide shortcuts are
 * single keys with no modifier (Chrome and Edge bind none), or a 'g' then a
 * letter; the one page-wide chord that works while typing is Alt+N, which
 * neither browser binds. Chords are Alt (+Shift), never Ctrl or Cmd and
 * never a key in BROWSER_RESERVED (so Alt+1–7 pick the format on New idea,
 * while Ctrl+1–9 and Cmd+1–9 stay the browsers' tab keys), with exactly one
 * exception the user chose (USER_CHOSEN_CHORDS): Ctrl+C opens New idea, but
 * only with nothing selected and not in a field, so copying always works.
 * Cmd is never the app's. Esc, Enter, Tab and Ctrl+Z keep their ordinary
 * meaning (close a dialog, submit, move focus, undo typing): they are not
 * the app's shortcuts, so they are listed under STANDARD_KEYS, not as
 * shortcuts.
 *
 * The board keys (blueprint P6: j/k or ↓/↑ move, x ticks, m does the
 * minimum, u undoes) are single unmodified keys too, answered by the Tasks
 * board itself (decideBoardKey, scope 'board'): never while typing, mid-IME
 * or with a dialog open, never the key right after 'g' (the sequence's), and
 * ↓/↑ only once a task's own control has focus, so the arrows still scroll
 * the page everywhere else.
 *
 * Pure and client-importable. Keys are written in the app's own notation:
 * 'c', 'Shift+?', 'Alt+N', 'Ctrl+C', 'g t' (a sequence: g, then t within
 * 1.5 s), '1-9' (a range), 'Alt+1-7' (a range of chords: Alt+1 … Alt+7),
 * '↓' and '↑' (the arrow keys).
 */

import { chordLetter, isAltDeadKeyInField, isTypingTarget, type TargetLike } from "./capture-parse";

export type ShortcutScope =
  /** Anywhere, except while typing in a field or with a dialog open. */
  | "global"
  /** Anywhere, even while typing in a field (a chord nobody types). */
  | "anywhere"
  /** Only in the capture sheet. */
  | "capture"
  /** Only on /add (the full idea form). */
  | "idea-form"
  /** Only during a review session. */
  | "review"
  /** Only on a Tasks board (Today, or a work tab's Tasks), not while typing (blueprint P6; decideBoardKey). */
  | "board";

export type ShortcutId =
  | "capture"
  | "capture-anywhere"
  | "new-idea"
  | "start-review"
  | "search"
  | "help"
  | "settings"
  | "go-today"
  | "go-study"
  | "go-library"
  | "go-train"
  | "go-you"
  | "go-week"
  | "record-yesterday"
  | "capture-add"
  | "capture-add-next"
  | "idea-create"
  | "idea-blank"
  | "idea-format"
  | "review-answer"
  | "review-next"
  | "board-next"
  | "board-prev"
  | "board-tick"
  | "board-minimum"
  | "board-undo";

export interface Shortcut {
  id: ShortcutId;
  /** The keys, in the app's notation (see the header). A second entry is an alternative. */
  keys: readonly string[];
  /** What it does, as the help sheet says it. */
  label: string;
  scope: ShortcutScope;
  /** Where it takes you, for a navigation shortcut. */
  href?: string;
  /** The help sheet's group. */
  group: ShortcutGroup;
}

/** The help sheet's groups, in the order it lists them. */
export const SHORTCUT_GROUPS = ["Capture", "Tasks", "Go to", "Ideas", "Help"] as const;
export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number];

/** Two keys of a 'g' sequence must come within this long of each other. */
export const SEQUENCE_MS = 1500;

export const SHORTCUTS: readonly Shortcut[] = [
  { id: "capture", keys: ["c"], label: "Capture an idea, a task or a weigh-in (by section)", scope: "global", group: "Capture" },
  { id: "capture-anywhere", keys: ["Alt+N"], label: "Capture from anywhere, even while typing", scope: "anywhere", group: "Capture" },
  { id: "new-idea", keys: ["i", "Ctrl+C"], label: "New idea (full form). Ctrl+C works when nothing is selected, so copying still works", scope: "global", href: "/add", group: "Capture" },
  { id: "capture-add", keys: ["Enter"], label: "Add the line (on a phone: add and stay for the next one)", scope: "capture", group: "Capture" },
  { id: "capture-add-next", keys: ["Shift+Enter"], label: "Add the line and type the next one", scope: "capture", group: "Capture" },
  { id: "idea-create", keys: ["Alt+Enter"], label: "Create the idea", scope: "idea-form", group: "Capture" },
  { id: "idea-blank", keys: ["Alt+B"], label: "Blank the selected words (cloze)", scope: "idea-form", group: "Capture" },
  { id: "idea-format", keys: ["Alt+1-7"], label: "Switch the idea's format (1 Short … 7 Formula)", scope: "idea-form", group: "Capture" },

  { id: "record-yesterday", keys: ["y"], label: "Record yesterday", scope: "global", href: "/today?sheet=yesterday", group: "Tasks" },
  { id: "board-next", keys: ["j", "↓"], label: "Next task (↓ once a task has focus)", scope: "board", group: "Tasks" },
  { id: "board-prev", keys: ["k", "↑"], label: "Previous task (↑ once a task has focus)", scope: "board", group: "Tasks" },
  { id: "board-tick", keys: ["x"], label: "Tick the task in focus", scope: "board", group: "Tasks" },
  { id: "board-minimum", keys: ["m"], label: "Do the minimum of the task in focus", scope: "board", group: "Tasks" },
  { id: "board-undo", keys: ["u"], label: "Undo the tick of the task in focus; with none in focus, the last tick", scope: "board", group: "Tasks" },

  { id: "go-today", keys: ["g t"], label: "Tasks", scope: "global", href: "/today", group: "Go to" },
  { id: "go-study", keys: ["g s"], label: "Ideas (review)", scope: "global", href: "/review", group: "Go to" },
  { id: "go-library", keys: ["g l"], label: "Library", scope: "global", href: "/library", group: "Go to" },
  { id: "go-train", keys: ["g w"], label: "Body", scope: "global", href: "/train", group: "Go to" },
  { id: "go-you", keys: ["g y"], label: "Character", scope: "global", href: "/you", group: "Go to" },
  { id: "go-week", keys: ["g k"], label: "Weekly review", scope: "global", href: "/today/week", group: "Go to" },
  { id: "settings", keys: [","], label: "Settings", scope: "global", href: "/settings", group: "Go to" },
  { id: "search", keys: ["/"], label: "Search the library", scope: "global", href: "/library", group: "Go to" },

  { id: "start-review", keys: ["r"], label: "Start a review", scope: "global", href: "/review", group: "Ideas" },
  { id: "review-answer", keys: ["1-9"], label: "Pick an answer (multiple choice)", scope: "review", group: "Ideas" },
  { id: "review-next", keys: ["Enter", "→"], label: "Next card", scope: "review", group: "Ideas" },

  { id: "help", keys: ["Shift+?"], label: "Show these shortcuts", scope: "global", group: "Help" },
];

/**
 * Keys that keep their ordinary meaning everywhere; shown in the help sheet's
 * footnote, never bound as page-wide shortcuts. Two of them also do one app
 * thing where nothing else would take the key: Enter on Review's hub
 * (WorkspaceView: nothing focused, cards due) and Ctrl/Cmd+Z outside a text
 * field while the capture's Added toast shows (QuickCapture, capture-ui
 * isUndoCaptureKey).
 */
export const STANDARD_KEYS: readonly { keys: string; label: string }[] = [
  { keys: "Esc", label: "closes a sheet or dialog" },
  { keys: "Tab", label: "moves between controls" },
  { keys: "Enter", label: "presses the focused button (on Review, with nothing focused and cards due, it starts a review)" },
  { keys: "Ctrl+Z", label: "undoes typing (in the capture line it also brings a chip back) and, outside a text field with the Added toast showing, takes that capture back" },
];

/**
 * Chrome's and Edge's own keyboard shortcuts (Windows, Linux and Mac), from
 * support.google.com/chrome/answer/157179 and Microsoft's 'Keyboard
 * shortcuts in Microsoft Edge' (checked 2026-10-01), plus the DevTools
 * chords both browsers share. A shortcut here is never the app's.
 * Notation: modifiers in the order Ctrl, Cmd, Alt (Option), Shift.
 */
export const BROWSER_RESERVED: readonly string[] = [
  // Tabs and windows
  "Ctrl+N", "Ctrl+Shift+N", "Ctrl+T", "Ctrl+Shift+T", "Ctrl+Tab", "Ctrl+Shift+Tab", "Ctrl+PageDown", "Ctrl+PageUp",
  "Ctrl+1", "Ctrl+2", "Ctrl+3", "Ctrl+4", "Ctrl+5", "Ctrl+6", "Ctrl+7", "Ctrl+8", "Ctrl+9",
  "Ctrl+W", "Ctrl+F4", "Ctrl+Shift+W", "Alt+F4", "Ctrl+Shift+PageUp", "Ctrl+Shift+PageDown", "Ctrl+Shift+Q",
  "Alt+Home", "Alt+ArrowLeft", "Alt+ArrowRight", "Alt+Space",
  // Browser features
  "Alt+F", "Alt+E", "Alt+D", "Alt", "F10", "Shift+F10", "Ctrl+Shift+B", "Alt+Shift+B", "Ctrl+Shift+O", "Ctrl+H", "Ctrl+Shift+H", "Ctrl+J",
  "Shift+Esc", "Alt+Shift+T", "Ctrl+F", "F3", "Shift+F3", "Ctrl+G", "Ctrl+Shift+G", "Ctrl+Shift+J", "Ctrl+Shift+I", "Ctrl+Shift+C",
  "F12", "Ctrl+Shift+Delete", "F1", "Ctrl+Shift+M", "Ctrl+M", "Alt+Shift+I", "Alt+Shift+A", "Alt+Shift+N", "Ctrl+Shift+A",
  "F7", "Ctrl+F6", "Shift+F6", "F6", "F4", "F9", "F11", "Ctrl+Shift+E", "Ctrl+I", "Ctrl+Shift+K", "Ctrl+Shift+L", "Ctrl+Shift+P",
  "Ctrl+Shift+U", "Ctrl+Shift+V", "Ctrl+Shift+Y", "Ctrl+Enter", "Ctrl+\\", "Ctrl+[", "Ctrl+]",
  // Address bar
  "Ctrl+L", "Ctrl+K", "Ctrl+E",
  // Page
  "Ctrl+P", "Ctrl+S", "F5", "Ctrl+F5", "Shift+F5", "Ctrl+R", "Ctrl+Shift+R", "Ctrl+O", "Ctrl+U", "Ctrl+D", "Ctrl+Shift+D",
  "Ctrl++", "Ctrl+=", "Ctrl+-", "Ctrl+0", "Space", "Shift+Space", "PageDown", "PageUp", "Home", "End", "Esc", "Tab", "Shift+Tab",
  // Mac
  "Cmd+N", "Cmd+Shift+N", "Cmd+T", "Cmd+Shift+T", "Cmd+W", "Cmd+Shift+W", "Cmd+Q", "Cmd+M", "Cmd+H", "Cmd+L", "Cmd+K",
  "Cmd+Alt+F", "Cmd+F", "Cmd+G", "Cmd+Shift+G", "Cmd+E", "Cmd+D", "Cmd+Shift+D", "Cmd+Shift+B", "Cmd+Alt+B", "Cmd+Y",
  "Cmd+Shift+H", "Cmd+Shift+J", "Cmd+Alt+J", "Cmd+Alt+I", "Cmd+Alt+C", "Cmd+Shift+C", "Cmd+Shift+Delete", "Cmd+P", "Cmd+S",
  "Cmd+R", "Cmd+Shift+R", "Cmd+O", "Cmd+Alt+U", "Cmd+Alt+L", "Cmd+Alt+M", "Cmd+Shift+M", "Cmd+Shift+E", "Cmd+Shift+U",
  "Cmd+Shift+V", "Cmd+Enter", "Cmd+\\", "Cmd+[", "Cmd+]", "Cmd++", "Cmd+-", "Cmd+0", "Cmd+ArrowLeft", "Cmd+ArrowRight",
  "Cmd+1", "Cmd+2", "Cmd+3", "Cmd+4", "Cmd+5", "Cmd+6", "Cmd+7", "Cmd+8", "Cmd+9", "Cmd+Ctrl+F", "Ctrl+Tab",
];

/**
 * The user's choice on 2026-10-19: the one Ctrl chord the app answers,
 * guarded so the browser keeps what it needs. Nothing else is an exception
 * to the rule in the header: scripts/shortcut-check.ts holds this list to
 * exactly this one and still refuses every other Ctrl or Cmd chord (Ctrl+1–9
 * and Cmd+1–9 among them: the browsers' tab keys) and every BROWSER_RESERVED
 * key.
 */
export const USER_CHOSEN_CHORDS: readonly { key: string; id: ShortcutId; why: string }[] = [
  { key: "Ctrl+C", id: "new-idea", why: "Global and guarded: only with nothing selected and not in a field, so copying always works; Cmd+C is always copy." },
];

/** The browser's copy key, which New idea shares (USER_CHOSEN_CHORDS): never the app's while anything is selected. */
export const COPY_KEY = "Ctrl+C";

/** A shortcut's key as the help sheet prints one key ('Alt+N' → ['Alt', 'N'], 'g t' → ['g', 't']). */
export function keyParts(key: string): string[] {
  return key.includes(" ") ? key.split(" ") : key.split(/\+(?!$)/);
}

/** A range in the app's notation as its modifiers and digits ('1-9' → [], 1, 9; 'Alt+1-7' → ['Alt'], 1, 7), or null. */
export function keyRange(key: string): { mods: string[]; from: number; to: number } | null {
  const m = /^((?:[A-Za-z]+\+)*)(\d)-(\d)$/.exec(key);
  if (!m) return null;
  return { mods: m[1] ? m[1].slice(0, -1).split("+") : [], from: Number(m[2]), to: Number(m[3]) };
}

/** Every single key a key stands for: a range's ('Alt+1-7' → Alt+1 … Alt+7), else the key itself. */
export function expandKey(key: string): string[] {
  const r = keyRange(key);
  if (!r) return [key];
  const prefix = r.mods.map((m) => `${m}+`).join("");
  const out: string[] = [];
  for (let d = r.from; d <= r.to; d++) out.push(`${prefix}${d}`);
  return out;
}

/** One key in aria-keyshortcuts' notation: Ctrl is 'Control', Cmd is 'Meta' ('Ctrl+C' → 'Control+C'). */
export function ariaKeyOf(key: string): string {
  return key.replace(/^Ctrl\+/, "Control+").replace(/^((?:Control\+)?)Cmd\+/, "$1Meta+");
}

/** The aria-keyshortcuts value for a shortcut (sequences and the review's bare 1-9 are left out; 'Alt+1-7' is each of its seven chords). */
export function ariaKeysOf(id: ShortcutId): string {
  const s = SHORTCUTS.find((x) => x.id === id);
  if (!s) return "";
  return s.keys
    .filter((k) => !k.includes(" ") && k !== "1-9" && k !== "→")
    .flatMap(expandKey)
    .map(ariaKeyOf)
    .join(" ");
}

export function shortcutOf(id: ShortcutId): Shortcut {
  const s = SHORTCUTS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown shortcut ${id}`);
  return s;
}

/** The board keys (blueprint P6): the Tasks board answers them itself (decideBoardKey), never the global handler. */
export type BoardKeyId = "board-next" | "board-prev" | "board-tick" | "board-minimum" | "board-undo";
export const BOARD_KEYS: readonly (Shortcut & { id: BoardKeyId })[] = SHORTCUTS.filter((s): s is Shortcut & { id: BoardKeyId } => s.scope === "board");
/** The arrow keys among them: the board's only while a task's own control has focus (elsewhere they scroll the page). */
export const BOARD_ARROWS: ReadonlySet<string> = new Set(["↓", "↑"]);

/** The format keys, one per format card in the cards' order (Alt+1 is the first card): 'idea-format' expanded. */
export const FORMAT_KEYS: readonly string[] = expandKey(shortcutOf("idea-format").keys[0]);

// ── Keys from events (pure: the global handler, the capture hotkey, /add and
// the review runner all read a keydown through normalizeKey) ───────────────

/** Enough of a KeyboardEvent to read a shortcut from (a DOM KeyboardEvent is one). */
export interface KeyEventLike {
  key: string;
  /** The physical key ('KeyN'): a chord's fallback when the key typed no Latin letter, so Mac Option+N (a dead tilde) is still Alt+N. */
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  /** 229 while an IME is composing (some browsers set it without isComposing). */
  keyCode?: number;
  defaultPrevented?: boolean;
}

/** Keys that are only modifiers: pressing one never is, nor breaks, a shortcut. */
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "OS", "Super", "Hyper", "Fn", "FnLock", "CapsLock", "NumLock", "ScrollLock"]);

/** Named keys in the app's notation (the rest keep the browser's name). */
const NAMED_KEYS: Record<string, string> = {
  " ": "Space",
  Spacebar: "Space",
  Escape: "Esc",
  Esc: "Esc",
  ArrowRight: "→",
  Right: "→",
  ArrowDown: "↓",
  Down: "↓",
  ArrowUp: "↑",
  Up: "↑",
};

/**
 * True for a keydown that is part of an IME composition (never a shortcut).
 * keyCode 229 counts only without Alt: Mac Chrome sends an Option chord's
 * dead key (Option+N types a dead tilde) with 229 before any composition.
 */
export function isComposingKey(e: KeyEventLike): boolean {
  if (e.isComposing) return true;
  return (e.keyCode === 229 || e.key === "Process") && !e.altKey;
}

/**
 * The base key of a chord: the Latin letter the layout produced (Dvorak's N
 * is N, wherever it sits), else the physical key for letters and digits (Mac
 * Option's 'Dead', '˜' or '∫', a Cyrillic letter: capture-parse chordLetter).
 */
function chordBase(e: KeyEventLike): string | null {
  const letter = chordLetter(e);
  if (letter) return letter.toUpperCase();
  const digit = /^Digit([0-9])$/.exec(e.code ?? "");
  if (digit) return digit[1];
  if (NAMED_KEYS[e.key]) return NAMED_KEYS[e.key];
  if (!e.key || e.key === "Dead" || e.key === "Unidentified") return null;
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

/**
 * A keydown in the app's notation ('c', 'Shift+?', 'Alt+N', 'Enter', '→',
 * 'Ctrl+K'), or null when it is no key at all (a bare modifier, an IME
 * composition, a dead key, AltGr, or, given the keydown's `target`, an Alt
 * chord's dead key typed into a field: Mac Option+N there starts 'ñ').
 *
 *   - A printable character with no Ctrl/Cmd/Alt is itself: letters lower
 *     case ('C' with Shift is 'Shift+C'); any other character ignores Shift,
 *     since the layout decides whether it needs it ('/' is Shift+7 on a German
 *     keyboard), and '?' is always written 'Shift+?'. A non-Latin letter is
 *     read by its physical key (Cyrillic 'с' on the C key is 'c').
 *   - A chord (Ctrl, Cmd or Alt held) is read by the Latin letter it
 *     produced, else by the physical key (chordBase), so Dvorak's Alt+N is
 *     'Alt+N' and Mac Option+N, which types a dead tilde, is 'Alt+N' too,
 *     except in a field (isAltDeadKeyInField: there it types ñ, so null).
 *     Ctrl+Alt is AltGr on
 *     Windows and Linux keyboards (it types '@', '€' and friends): never a chord.
 *   - Modifiers are written in the order Ctrl, Cmd, Alt, Shift.
 */
export function normalizeKey(e: KeyEventLike, target?: TargetLike | null): string | null {
  if (isComposingKey(e)) return null;
  if (isAltDeadKeyInField(e, target)) return null;
  if (MODIFIER_KEYS.has(e.key)) return null;
  if (e.ctrlKey && e.altKey && !e.metaKey) return null;
  if (e.ctrlKey || e.metaKey || e.altKey) {
    const base = chordBase(e);
    if (!base) return null;
    return `${e.ctrlKey ? "Ctrl+" : ""}${e.metaKey ? "Cmd+" : ""}${e.altKey ? "Alt+" : ""}${e.shiftKey ? "Shift+" : ""}${base}`;
  }
  const key = e.key;
  if (!key || key === "Dead" || key === "Unidentified") return null;
  if (key === "?") return "Shift+?";
  if (NAMED_KEYS[key]) return `${e.shiftKey ? "Shift+" : ""}${NAMED_KEYS[key]}`;
  if (key.length === 1) {
    if (/^[a-z]$/i.test(key)) return e.shiftKey ? `Shift+${key.toUpperCase()}` : key.toLowerCase();
    const physical = /^Key([A-Z])$/.exec(e.code ?? "");
    if (physical && key.toLowerCase() !== key.toUpperCase()) return e.shiftKey ? `Shift+${physical[1]}` : physical[1].toLowerCase();
    return key;
  }
  return `${e.shiftKey ? "Shift+" : ""}${key}`;
}

/** Whether a keydown is exactly this key or chord ('Alt+Enter', 'Alt+B', '→'); a held key or one already handled never is. */
export function isKey(e: KeyEventLike, key: string, target?: TargetLike | null): boolean {
  if (e.repeat || e.defaultPrevented) return false;
  return normalizeKey(e, target) === key;
}

// ── The global handler's rule (src/components/shell/Shortcuts.tsx) ─────────

/** The capture sheet's own handler (capture-parse isCaptureHotkey) answers these; the global handler never does. */
export const CAPTURE_OWNED: readonly ShortcutId[] = ["capture", "capture-anywhere"];

/** The 'global' shortcuts the global handler answers (every one but the capture sheet's). */
export const GLOBAL_HANDLED: readonly Shortcut[] = SHORTCUTS.filter((s) => s.scope === "global" && !CAPTURE_OWNED.includes(s.id));

/** First keys of the sequences ('g'). */
export const SEQUENCE_PREFIXES: ReadonlySet<string> = new Set(GLOBAL_HANDLED.flatMap((s) => s.keys.filter((k) => k.includes(" ")).map((k) => k.split(" ")[0])));

/** The sequences a prefix leads to, for the 'g…' hint: [{ key: 't', label: 'Tasks' }, …]. */
export function sequenceTargets(prefix: string): { key: string; label: string; id: ShortcutId }[] {
  return GLOBAL_HANDLED.flatMap((s) => s.keys.filter((k) => k.startsWith(`${prefix} `)).map((k) => ({ key: k.slice(prefix.length + 1), label: s.label, id: s.id })));
}

export interface SequenceState {
  /** The first key of a sequence, while it waits for the second. */
  readonly prefix: string | null;
  /** When the prefix was pressed (ms). */
  readonly at: number;
}

export const SEQUENCE_IDLE: SequenceState = { prefix: null, at: 0 };

/** Whether a sequence is still waiting for its second key at `now`. */
export function sequenceWaiting(seq: SequenceState, now: number): boolean {
  return seq.prefix !== null && now - seq.at <= SEQUENCE_MS;
}

/**
 * What a dialog or sheet looks like while open: the global shortcuts and the
 * capture sheet's bare 'c' wait (Alt+N does not). <Shortcuts/> and
 * QuickCapture both query it.
 */
export const MODAL_OPEN_SELECTOR = '[aria-modal="true"], .sheet.show, [data-capture-sheet]';

/**
 * The board keys (P6 review) also wait while a pop-up on the board is open: the drawer's icon or colour pop-up, a
 * row's asks, the habit year's day. Each is a dialog the page doesn't mark modal (MODAL_OPEN_SELECTOR misses it), so
 * 'j' would move focus out from under it and 'u' take a tick back behind it. TodayBoard queries this.
 */
export const BOARD_POPUP_SELECTOR = ".tsk-pop, .ask-pop, .hh-pop";
export const BOARD_KEYS_OFF_SELECTOR = `${MODAL_OPEN_SELECTOR}, ${BOARD_POPUP_SELECTOR}`;

export interface ShortcutEnv {
  /** The keydown's target. */
  target: TargetLike | null | undefined;
  /** A dialog or sheet is open (MODAL_OPEN_SELECTOR matches). */
  modalOpen: boolean;
  /** A review session is running ([data-review-session]): its runner owns the keys. */
  reviewSession: boolean;
  /**
   * Something is selected: a non-collapsed window selection, or a selection
   * inside the focused input or textarea. Ctrl+C is then the browser's copy.
   */
  hasSelection: boolean;
  /** The page's path (usePathname): New idea's keys do nothing on /add itself. */
  path: string;
  now: number;
}

export interface ShortcutDecision {
  /** The shortcut to run now, if any. */
  run: Shortcut | null;
  /** The sequence state after this key. */
  seq: SequenceState;
  /** The key is the app's: prevent the browser's default (a 'g' that starts a sequence, or a shortcut that runs). */
  consume: boolean;
}

/**
 * The global handler's whole rule, pure: what one keydown does.
 *
 * Nothing runs on a key someone else handled (defaultPrevented), mid-IME
 * composition, on a held key (repeat), while typing (an input, textarea,
 * select, contenteditable or the capture sheet: capture-parse
 * isTypingTarget), or with a dialog or sheet open. During a review session
 * only '?' (help) runs: the runner owns 1-9, Enter and →, and a stray letter
 * must not navigate away from a session. 'g' then a letter within
 * SEQUENCE_MS runs a 'Go to' shortcut; any other second key ends the
 * sequence and does nothing, and a second 'g' starts it again. A bare
 * modifier (the Shift of 'Shift+?') leaves a waiting sequence alone. 'c' and
 * Alt+N are the capture sheet's (CAPTURE_OWNED), never run here.
 *
 * Ctrl+C (New idea, USER_CHOSEN_CHORDS) runs only with Ctrl alone held
 * (normalizeKey reads Ctrl+Shift+C, Ctrl+Cmd+C and AltGr as other keys, and
 * the letter by its physical key on a non-Latin layout) and nothing selected
 * (env.hasSelection); otherwise it is left alone, never prevented, so the
 * browser copies. Cmd+C is never read as it. New idea's keys ('i', Ctrl+C)
 * do nothing on /add itself, so the form is never reloaded or lost.
 */
export function decideShortcut(e: KeyEventLike, seq: SequenceState, env: ShortcutEnv): ShortcutDecision {
  const none = (next: SequenceState = SEQUENCE_IDLE): ShortcutDecision => ({ run: null, seq: next, consume: false });
  if (e.defaultPrevented || isComposingKey(e)) return none();
  if (MODIFIER_KEYS.has(e.key) || e.repeat) return none(seq);
  if (isTypingTarget(env.target) || env.modalOpen) return none();
  const key = normalizeKey(e, env.target);
  if (key === null) return none();
  if (key === COPY_KEY && env.hasSelection) return none();
  const allowed = (s: Shortcut) => (!env.reviewSession || s.id === "help") && !(s.id === "new-idea" && env.path === s.href);

  if (sequenceWaiting(seq, env.now)) {
    const hit = GLOBAL_HANDLED.find((s) => s.keys.includes(`${seq.prefix} ${key}`));
    if (hit && allowed(hit)) return { run: hit, seq: SEQUENCE_IDLE, consume: true };
    if (key === seq.prefix && !env.reviewSession) return { run: null, seq: { prefix: key, at: env.now }, consume: true };
    return none();
  }
  if (SEQUENCE_PREFIXES.has(key) && !env.reviewSession) return { run: null, seq: { prefix: key, at: env.now }, consume: true };
  const hit = GLOBAL_HANDLED.find((s) => s.keys.includes(key));
  if (hit && allowed(hit)) return { run: hit, seq: SEQUENCE_IDLE, consume: true };
  return none();
}

// ── The board keys (TodayBoard, blueprint P6) ──────────────────────────────

export interface BoardKeyEnv {
  /** The keydown's target. */
  target: TargetLike | null | undefined;
  /** A dialog, sheet or board pop-up is open (BOARD_KEYS_OFF_SELECTOR matches; the capture sheet among them). */
  modalOpen: boolean;
  /** A task's own control has focus (its tick, its title, its row actions): ↓/↑ are the board's only then. */
  onRow: boolean;
  now: number;
}

export interface BoardKeyDecision {
  /** The board key to run now, if any. */
  run: BoardKeyId | null;
  /** The board's own view of a 'g' sequence after this key (the global handler keeps its own). */
  seq: SequenceState;
  /** The key is the board's: prevent the browser's default (the arrows' scroll). */
  consume: boolean;
}

/**
 * The board keys' whole rule, pure: what one keydown does on a Tasks board.
 *
 * Nothing runs mid-IME composition, on a held key (repeat), while typing (an
 * input, textarea, select, contenteditable or the capture sheet: capture-parse
 * isTypingTarget), with a dialog, sheet or board pop-up open, or from inside
 * any dialog (a [role="dialog"] the page doesn't mark modal). A 'g' starts a sequence, so
 * the key after it (within SEQUENCE_MS) is the sequence's ('g k' is the Weekly
 * review), never the board's, whichever listener hears it first; the board
 * tracks that itself, even when the global handler has already prevented the
 * 'g'. A key something else handled (defaultPrevented) is left alone. ↓ and ↑
 * are the board's only while a task's own control has focus (env.onRow).
 * Modified keys are none of the board's (normalizeKey writes them as chords).
 */
/** The target is inside a dialog (any [role="dialog"], modal or not): its own keys, never the board's. */
function inDialog(target: TargetLike | null | undefined): boolean {
  return !!target && typeof target.closest === "function" && !!target.closest('[role="dialog"]');
}

export function decideBoardKey(e: KeyEventLike, seq: SequenceState, env: BoardKeyEnv): BoardKeyDecision {
  const none = (next: SequenceState = SEQUENCE_IDLE): BoardKeyDecision => ({ run: null, seq: next, consume: false });
  if (isComposingKey(e)) return none();
  if (MODIFIER_KEYS.has(e.key) || e.repeat) return none(seq);
  if (isTypingTarget(env.target) || env.modalOpen || inDialog(env.target)) return none();
  const key = normalizeKey(e, env.target);
  if (key === null) return none();
  if (sequenceWaiting(seq, env.now)) return SEQUENCE_PREFIXES.has(key) ? none({ prefix: key, at: env.now }) : none();
  if (SEQUENCE_PREFIXES.has(key)) return none({ prefix: key, at: env.now });
  if (e.defaultPrevented) return none();
  const hit = BOARD_KEYS.find((s) => s.keys.includes(key));
  if (!hit || (BOARD_ARROWS.has(key) && !env.onRow)) return none();
  return { run: hit.id, seq: SEQUENCE_IDLE, consume: true };
}

// ── The format keys on /add (AddIdeaForm, 'idea-format') ───────────────────

/**
 * Which format card Alt+1–7 picks on New idea (0 is the first card, in the
 * cards' order: FORMAT_KEYS), or null.
 *
 * Alt alone with a top-row digit, read by the physical key (`code` Digit1…
 * Digit7, as the Alt chords read their letters), so AZERTY's Alt+& is Alt+1
 * and Mac Option+1, which types '¡', is Alt+1 too; `key` '1'…'7' counts only
 * when the event has no `code`. Never a numpad digit (Alt+numpad types an
 * Alt code on Windows). It works while typing in the form: the caller
 * prevents the default when this is a card, so Option+digit types nothing,
 * except an Option dead key in a field (isAltDeadKeyInField), which is the
 * field's. Never with Ctrl (Ctrl+Alt is AltGr), Cmd or Shift held too, on a
 * held key, mid-composition, on a key something else handled, or with a
 * dialog or sheet open over the form (MODAL_OPEN_SELECTOR).
 */
export function formatKeyIndex(e: KeyEventLike, env: { modalOpen: boolean; target?: TargetLike | null }): number | null {
  if (e.repeat || e.defaultPrevented || env.modalOpen || isComposingKey(e)) return null;
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  if (isAltDeadKeyInField(e, env.target)) return null;
  const digit = e.code ? /^Digit([0-9])$/.exec(e.code)?.[1] : /^[0-9]$/.exec(e.key)?.[0];
  const at = digit === undefined ? -1 : FORMAT_KEYS.indexOf(`Alt+${digit}`);
  return at < 0 ? null : at;
}

// ── Events other components answer ─────────────────────────────────────────

/** Opens the '?' help sheet from anywhere (Settings, the tour): the global handler listens. */
export const SHORTCUT_HELP_EVENT = "xtnl:shortcuts:help";
/**
 * 'y' on /today: asks the board to open its Record yesterday sheet in place
 * (the Today board listens). Anywhere else 'y' navigates to
 * RECORD_YESTERDAY_HREF, which opens the same sheet on arrival.
 */
export const RECORD_YESTERDAY_EVENT = "xtnl:today:record-yesterday";
/** The deep link that opens Record yesterday on Today (the 'y' shortcut, the bell's 'Yesterday' row). */
export const RECORD_YESTERDAY_PARAM = "sheet";
export const RECORD_YESTERDAY_HREF = `/today?${RECORD_YESTERDAY_PARAM}=yesterday`;
/** Asks the library's search box to take focus ('/' while already on /library). */
export const LIBRARY_SEARCH_EVENT = "xtnl:library:focus-search";
/** '/' elsewhere navigates to /library?focus=search; the search box takes focus on arrival and drops the param. */
export const LIBRARY_SEARCH_PARAM = "focus";
export const LIBRARY_SEARCH_HREF = `/library?${LIBRARY_SEARCH_PARAM}=search`;

/** Opens the '?' help sheet (a no-op on the server). */
export function openShortcutHelp(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SHORTCUT_HELP_EVENT));
}

/** The help sheet's and Settings' note for Mac keyboards. */
export const MAC_NOTE = "On a Mac, Alt is the Option key. Option+N opens capture outside text fields; inside a field, Tab or click out of it first (Option+N there types ˜).";
/** The help sheet's and Settings' promise, checked by scripts/shortcut-check.ts (Ctrl+C, USER_CHOSEN_CHORDS, gives way to copy). */
export const BROWSER_NOTE = "None of these are Chrome or Edge shortcuts, and Ctrl+C still copies whenever something is selected.";

/** aria-keyshortcuts for every Capture button (the tab bar's +, the rail's and the sidebar's Capture): 'c Alt+N'. */
export const CAPTURE_ARIA_KEYS = `${ariaKeysOf("capture")} ${ariaKeysOf("capture-anywhere")}`;

/** Where a shortcut that is not page-wide works, as the help sheet, Settings and the README say it ('anywhere' says so in its label). */
export const SCOPE_NOTE: Partial<Record<ShortcutScope, string>> = {
  capture: "In the capture sheet",
  "idea-form": "On New idea",
  review: "During a review",
  board: "On a Tasks board, not while typing",
};
