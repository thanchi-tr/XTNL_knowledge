/**
 * shortcut-check: the app's keyboard shortcuts (src/lib/shortcuts.ts) hold
 * their promises. Pure: no database, no server, no browser.
 *
 *   (a) No shortcut, read on Windows/Linux or on a Mac (Ctrl as Cmd, Alt as
 *       Option), is one of Chrome's or Edge's own (BROWSER_RESERVED).
 *       Page-wide keys carry no modifier; chords use only Alt (+Shift), never
 *       Ctrl or Cmd, never Ctrl+Alt (AltGr).
 *   (b) Ids are unique; keys are unique per scope (global and anywhere count
 *       as one: both are live on every page); a sequence prefix is no key of
 *       its own.
 *   (c) Every shortcut has its handler (source guards), and no old binding
 *       (Ctrl/Cmd+K, Ctrl/Cmd+Enter, Ctrl+Shift+C, Space as 'next') is left
 *       anywhere in src, in code, aria-keyshortcuts or visible text, nor in
 *       a comment in any .css file under src.
 *   (d) The pure rules: normalizeKey, decideShortcut (typing targets,
 *       composition, held keys, dialogs, review sessions, sequences and their
 *       timeout) and isCaptureHotkey agree, over truth tables.
 *   (e) Every Capture button's aria-keyshortcuts is ariaKeysOf('capture') +
 *       ' ' + ariaKeysOf('capture-anywhere').
 *   (f) The README's 'Keyboard shortcuts' table is generated from the list
 *       (`npx tsx scripts/shortcut-check.ts --write` regenerates it).
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { isAltDeadKeyInField, isCaptureHotkey, isTypingTarget, type TargetLike } from "../src/lib/capture-parse";
import { isUndoCaptureKey } from "../src/components/capture/capture-ui";
import {
  BROWSER_NOTE,
  BROWSER_RESERVED,
  CAPTURE_ARIA_KEYS,
  CAPTURE_OWNED,
  GLOBAL_HANDLED,
  MAC_NOTE,
  MODAL_OPEN_SELECTOR,
  SCOPE_NOTE,
  SEQUENCE_IDLE,
  SEQUENCE_MS,
  SEQUENCE_PREFIXES,
  SHORTCUTS,
  STANDARD_KEYS,
  ariaKeysOf,
  decideShortcut,
  isKey,
  keyParts,
  normalizeKey,
  sequenceTargets,
  sequenceWaiting,
  shortcutOf,
  type KeyEventLike,
  type SequenceState,
  type ShortcutEnv,
} from "../src/lib/shortcuts";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Source without comments (a `//` only after whitespace or at a line start, so URLs in strings survive). */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s;{}])\/\/[^\n]*/gm, "$1");

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}

// ── Notation helpers ────────────────────────────────────────────────────────

/** Every single key a shortcut's notation stands for ('1-9' → 1…9; a sequence → its own string). */
function expand(k: string): string[] {
  const range = /^(\d)-(\d)$/.exec(k);
  if (range) {
    const out: string[] = [];
    for (let d = Number(range[1]); d <= Number(range[2]); d++) out.push(String(d));
    return out;
  }
  return [k];
}

/** A key in BROWSER_RESERVED's notation: modifiers Ctrl, Cmd, Alt, Shift in that order, letters upper case, '→' as ArrowRight. */
function canon(k: string): string {
  const parts = keyParts(k);
  const base = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));
  const named: Record<string, string> = { "→": "ArrowRight", "←": "ArrowLeft", " ": "Space", Escape: "Esc" };
  const b = named[base] ?? (base.length === 1 ? base.toUpperCase() : base);
  return ["Ctrl", "Cmd", "Alt", "Shift"].filter((m) => mods.has(m)).map((m) => `${m}+`).join("") + b;
}

/** The key as read on the other platform: Ctrl ↔ Cmd (Alt is Option on a Mac, the same key in this notation). */
function readings(k: string): string[] {
  const c = canon(k);
  return [...new Set([c, canon(c.replace(/^Ctrl\+/, "Cmd+")), canon(c.replace(/^Cmd\+/, "Ctrl+"))])];
}

const RESERVED = new Set(BROWSER_RESERVED.map(canon));

// ── (a) Clear of Chrome and Edge ────────────────────────────────────────────
console.log("── (a) No Chrome or Edge shortcut");
{
  check("BROWSER_RESERVED: holds Chrome's and Edge's well-known chords (Ctrl+K, Ctrl+Enter, Ctrl+Shift+C, Space, Alt+Shift+N)", ["Ctrl+K", "Cmd+K", "Ctrl+Enter", "Ctrl+Shift+C", "Space", "Alt+Shift+N", "Alt+F", "Alt+D", "F6"].every((k) => RESERVED.has(canon(k))));
  const clashes: string[] = [];
  for (const s of SHORTCUTS) {
    for (const k of s.keys) {
      const singles = k.includes(" ") ? k.split(" ") : expand(k);
      for (const one of [...singles, k]) for (const r of readings(one)) if (RESERVED.has(r)) clashes.push(`${s.id} '${k}' reads as ${r}`);
    }
  }
  check("no shortcut (nor any key of a sequence, nor its Mac reading) is a browser shortcut", clashes.length === 0, clashes.join("; "));

  const pageWide = SHORTCUTS.filter((s) => s.scope === "global");
  const modded = pageWide.flatMap((s) => s.keys.filter((k) => !k.includes(" ") && k !== "Shift+?" && keyParts(k).length > 1).map((k) => `${s.id} '${k}'`));
  check("page-wide (global) keys carry no modifier ('Shift+?' is the layout's own Shift)", modded.length === 0, modded.join("; "));
  const seqBad = pageWide.flatMap((s) => s.keys.filter((k) => k.includes(" ")).filter((k) => !/^g [a-z]$/.test(k)).map((k) => `${s.id} '${k}'`));
  check("sequences are 'g' then one letter", seqBad.length === 0, seqBad.join("; "));

  const chords = SHORTCUTS.flatMap((s) => s.keys.filter((k) => !k.includes(" ") && keyParts(k).length > 1).map((k) => ({ id: s.id, k, mods: keyParts(k).slice(0, -1) })));
  const badMods = chords.filter((c) => c.mods.some((m) => m !== "Alt" && m !== "Shift")).map((c) => `${c.id} '${c.k}'`);
  check("chords use only Alt (+Shift): never Ctrl or Cmd", badMods.length === 0, badMods.join("; "));
  const altGr = chords.filter((c) => c.mods.includes("Ctrl") && c.mods.includes("Alt")).map((c) => `${c.id} '${c.k}'`);
  check("no chord is Ctrl+Alt (AltGr types characters on Windows and Linux keyboards)", altGr.length === 0, altGr.join("; "));
  const anywhere = SHORTCUTS.filter((s) => s.scope === "anywhere");
  check("the one chord that works while typing is Alt+N", anywhere.length === 1 && anywhere[0].keys.length === 1 && anywhere[0].keys[0] === "Alt+N");
  const altChords = chords.filter((c) => c.mods.includes("Alt")).map((c) => c.k);
  check("Alt chords: Alt+N, Alt+Enter, Alt+B and nothing else", JSON.stringify([...altChords].sort()) === JSON.stringify(["Alt+B", "Alt+Enter", "Alt+N"]), altChords.join(", "));
  check("Alt+Shift+N (Chrome's and Edge's) is reserved, and not ours", RESERVED.has("Alt+Shift+N") && !SHORTCUTS.some((s) => s.keys.some((k) => canon(k) === "Alt+Shift+N")));
  const std = STANDARD_KEYS.map((s) => s.keys);
  check("STANDARD_KEYS (Esc, Tab, Enter, Ctrl+Z) are never bound as page-wide shortcuts", !SHORTCUTS.some((s) => (s.scope === "global" || s.scope === "anywhere") && s.keys.some((k) => std.includes(k))));
  check("STANDARD_KEYS: Esc, Tab and Ctrl+Z are bound nowhere (Enter only inside the capture sheet and a review)", !SHORTCUTS.some((s) => s.keys.some((k) => k === "Esc" || k === "Ctrl+Z" || k === "Tab")) && SHORTCUTS.filter((s) => s.keys.includes("Enter")).every((s) => s.scope === "capture" || s.scope === "review"));
}

// ── (b) Unique ──────────────────────────────────────────────────────────────
console.log("\n── (b) Unique ids and keys");
{
  const ids = SHORTCUTS.map((s) => s.id);
  check("ids are unique", new Set(ids).size === ids.length, ids.join(", "));
  const byScope = new Map<string, string[]>();
  for (const s of SHORTCUTS) {
    const scope = s.scope === "anywhere" ? "global" : s.scope;
    for (const k of s.keys) for (const one of expand(k)) byScope.set(scope, [...(byScope.get(scope) ?? []), canon(one)]);
  }
  const dupes = [...byScope].flatMap(([scope, keys]) => keys.filter((k, i) => keys.indexOf(k) !== i).map((k) => `${scope}: ${k}`));
  check("keys are unique per scope (global and anywhere together)", dupes.length === 0, dupes.join("; "));
  const singles = new Set((byScope.get("global") ?? []).filter((k) => !k.includes(" ")));
  const prefixClash = [...SEQUENCE_PREFIXES].filter((p) => singles.has(canon(p)));
  check("a sequence prefix ('g') is no shortcut of its own", prefixClash.length === 0 && SEQUENCE_PREFIXES.size === 1 && SEQUENCE_PREFIXES.has("g"), prefixClash.join(", "));
  check("every shortcut has a label, a group and keys", SHORTCUTS.every((s) => s.label.trim() && s.keys.length > 0 && ["Capture", "Go to", "Study", "Help"].includes(s.group)));
  check("every 'Go to' shortcut has an href", SHORTCUTS.filter((s) => s.group === "Go to").every((s) => !!s.href?.startsWith("/")));
  check("SEQUENCE_MS is 1.5 s, as the header says", SEQUENCE_MS === 1500);
}

// ── (c) Handled, and no old binding ─────────────────────────────────────────
console.log("\n── (c) Every shortcut handled; no old binding left");
{
  const shell = code(read("src/components/shell/Shortcuts.tsx"));
  check("Shortcuts.tsx: one window keydown listener running decideShortcut", (shell.match(/addEventListener\("keydown"/g) ?? []).length === 1 && /decideShortcut\(e, seq\.current/.test(shell));
  check("Shortcuts.tsx: reads dialogs (shortcuts.ts MODAL_OPEN_SELECTOR) and review sessions from the DOM", MODAL_OPEN_SELECTOR === '[aria-modal="true"], .sheet.show, [data-capture-sheet]' && /modalOpen: document\.querySelector\(MODAL_OPEN_SELECTOR\) !== null/.test(shell) && !/MODAL_OPEN_SELECTOR =/.test(shell) && shell.includes('"[data-review-session]"'));
  check("Shortcuts.tsx: '?' opens the help sheet; '/' focuses the library search; hrefs navigate with router.push", /s\.id === "help"\)\s*\{\s*setHelpOpen\(true\)/.test(shell) && /s\.id === "search"/.test(shell) && /LIBRARY_SEARCH_EVENT/.test(shell) && /router\.push\(LIBRARY_SEARCH_HREF\)/.test(shell) && /if \(s\.href\) router\.push\(s\.href\)/.test(shell));
  check("Shortcuts.tsx: the help sheet is the kit Sheet, with the tour button and the browsers' promise", /<Sheet\b/.test(shell) && /Take the tour/.test(shell) && /description=\{BROWSER_NOTE\}/.test(shell) && /STANDARD_KEYS\.map/.test(shell) && /keyParts\(k\)/.test(shell));
  check("Shortcuts.tsx: 'Take the tour' closes the sheet first and starts the tour a tick later (its focus returns to what had it before '?')", /onClose\(\);\s*window\.setTimeout\(startTour, 0\);/.test(shell) && !/startTour\(\);\s*onClose\(\)/.test(shell));
  check("Shortcuts.tsx: openShortcutHelp's event opens the sheet", /addEventListener\(SHORTCUT_HELP_EVENT, onHelp\)/.test(shell));
  check("Shortcuts.tsx: the 'g…' hint is portalled and announced politely", /createPortal\(<SequenceHint/.test(shell) && /announce\(`Go to: /.test(shell));
  check("Shortcuts.tsx: imports its own css", /import "\.\/shortcuts\.css";/.test(read("src/components/shell/Shortcuts.tsx")));

  const handledIds = new Set(GLOBAL_HANDLED.map((s) => s.id));
  const globals = SHORTCUTS.filter((s) => s.scope === "global" || s.scope === "anywhere");
  const orphan = globals.filter((s) => !handledIds.has(s.id) && !CAPTURE_OWNED.includes(s.id)).map((s) => s.id);
  check("every global/anywhere shortcut is the global handler's or the capture sheet's", orphan.length === 0, orphan.join(", "));
  const runnable = GLOBAL_HANDLED.filter((s) => s.id !== "help" && !s.href).map((s) => s.id);
  check("every shortcut the global handler runs is help or has an href", runnable.length === 0, runnable.join(", "));
  const body: TargetLike = { tagName: "BODY", closest: () => null };
  const ev = (k: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
  check("capture-parse isCaptureHotkey answers 'c' and Alt+N (the capture sheet's two)", isCaptureHotkey(ev("c"), body, false) && isCaptureHotkey(ev("n", { altKey: true, code: "KeyN" }), body, false));
  const quick = code(read("src/components/capture/QuickCapture.tsx"));
  check("QuickCapture: its window keydown opens on isCaptureHotkey, told whether a dialog is open (MODAL_OPEN_SELECTOR)", /const modalOpen = document\.querySelector\(MODAL_OPEN_SELECTOR\) !== null;\s*if \(!isCaptureHotkey\(e, target, reviewing, modalOpen\)\) return;\s*e\.preventDefault\(\);\s*openSheet\(\);/.test(quick) && /import \{ MODAL_OPEN_SELECTOR \} from "@\/lib\/shortcuts";/.test(quick));
  // The two app meanings STANDARD_KEYS owns up to: Enter on Study's hub, Ctrl/Cmd+Z on the Added toast.
  const workspace = read("src/components/workspace/WorkspaceView.tsx");
  const enter = STANDARD_KEYS.find((k) => k.keys === "Enter");
  check(
    "STANDARD_KEYS: Enter says it starts a review on Study when nothing is focused (WorkspaceView's hub listener)",
    !!enter && /on Study, with nothing focused and cards due, it starts a review/.test(enter.label) && /if \(mode !== "hub" \|\| totalDue === 0\) return;/.test(workspace) && /if \(e\.key !== "Enter"/.test(workspace) && /a !== document\.body && a\.id !== "main"/.test(workspace),
    enter?.label ?? "no Enter"
  );
  const undo = STANDARD_KEYS.find((k) => k.keys === "Ctrl+Z");
  const zBody: TargetLike = { tagName: "BODY", closest: () => null };
  const zInput: TargetLike = { tagName: "INPUT", closest: () => null };
  const z = (mods: Partial<KeyEventLike>) => ({ key: "z", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
  check(
    "STANDARD_KEYS: Ctrl+Z says it takes the capture back outside a field with the Added toast showing (QuickCapture, isUndoCaptureKey)",
    !!undo &&
      /outside a text field with the Added toast showing, takes that capture back/.test(undo.label) &&
      isUndoCaptureKey(z({ ctrlKey: true }), zBody, false) &&
      isUndoCaptureKey(z({ metaKey: true }), zBody, false) &&
      !isUndoCaptureKey(z({ ctrlKey: true }), zInput, false) &&
      /toast\?\.kind === "added"/.test(quick) &&
      /isUndoCaptureKey\(e, target, reviewing\)/.test(quick),
    undo?.label ?? "no Ctrl+Z"
  );
  check("STANDARD_KEYS: no label holds a ';' (the help sheet and README join them with '; ')", STANDARD_KEYS.every((k) => !k.label.includes(";")));
  check("QuickCapture: Enter and Shift+Enter in the line go through enterAction (shortcuts 'capture-add', 'capture-add-next')", /enterAction\(/.test(quick));

  const form = code(read("src/components/AddIdeaForm.tsx"));
  check("AddIdeaForm: Alt+Enter creates, Alt+B blanks (isKey on shortcuts.ts' own keys)", /const CREATE_KEY = shortcutOf\("idea-create"\)\.keys\[0\];/.test(form) && /const BLANK_KEY = shortcutOf\("idea-blank"\)\.keys\[0\];/.test(form) && /isKey\(e\.nativeEvent, CREATE_KEY\)/.test(form) && /isKey\(e\.nativeEvent, BLANK_KEY\)/.test(form));
  const formSrc = read("src/components/AddIdeaForm.tsx");
  check(
    "AddIdeaForm: CREATE_KEY/BLANK_KEY keep their own JSDoc, and 'What a stopped submission's buttons say' sits over SUGGESTION_NOTE again",
    /\/\*\* Create and Blank it, as shortcuts\.ts lists them[^\n]*\*\/\r?\nconst CREATE_KEY = [^\n]*\r?\nconst BLANK_KEY = [^\n]*\r?\n\r?\n\/\*\* What a stopped submission's buttons say, by what the verdict suggests\. \*\/\r?\nconst SUGGESTION_NOTE = \{/.test(formSrc)
  );
  check("AddIdeaForm: Create and the cloze field announce their keys", /aria-keyshortcuts=\{ariaKeysOf\("idea-create"\)\}/.test(form) && /aria-keyshortcuts=\{ariaKeysOf\("idea-blank"\)\}/.test(form) && ariaKeysOf("idea-create") === "Alt+Enter" && ariaKeysOf("idea-blank") === "Alt+B");

  const runner = code(read("src/components/workspace/ReviewRunner.tsx"));
  check("ReviewRunner: 1-9 answer, Enter and → move on (shortcuts.ts 'review-next')", /Number\(e\.key\)/.test(runner) && /shortcutOf\("review-next"\)\.keys\.includes\(key\)/.test(runner) && shortcutOf("review-next").keys.join(" ") === "Enter →");
  check("ReviewRunner: Space is no longer 'next' (it is the browsers' page-down)", !/e\.key === " "/.test(runner) && !/"Space"/.test(runner));

  const board = code(read("src/components/today/TodayBoard.tsx"));
  check("TodayBoard: no Today-only 'r' listener (r is global now)", !/toLowerCase\(\) !== "r"/.test(board) && !/router\.push\("\/review"\)/.test(board));
  check("NextUp: the 'R' hint stays (r starts a review from anywhere)", /kbd="R"/.test(read("src/components/today/NextUp.tsx")) && shortcutOf("start-review").keys[0] === "r" && shortcutOf("start-review").href === "/review");

  const lib = code(read("src/components/library/LibrarySearch.tsx"));
  check("LibrarySearch: '/' focuses the search box (by event, or ?focus=search on arrival)", /addEventListener\(LIBRARY_SEARCH_EVENT, focus\)/.test(lib) && /params\.get\(LIBRARY_SEARCH_PARAM\) === "search"/.test(lib) && /ref=\{searchRef\}/.test(lib) && /searchParams\.delete\(LIBRARY_SEARCH_PARAM\)/.test(lib));

  const settings = code(read("src/components/settings/SettingsView.tsx"));
  check("Settings: a 'Keyboard shortcuts' section with the shared list and 'Replay the tour'", /title="Keyboard shortcuts"/.test(settings) && /<ShortcutList\b/.test(settings) && /onClick=\{\(\) => startTour\(\)\}/.test(settings) && /Replay the tour/.test(settings));

  // No old binding anywhere in src.
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f)) files.push(p);
    }
  };
  walk(join(ROOT, "src"));
  const hits: Record<string, string[]> = { chord: [], keyC: [], aria: [], text: [], space: [], css: [] };
  const cssFiles: string[] = [];
  const walkCss = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walkCss(p);
      else if (/\.css$/.test(f)) cssFiles.push(p);
    }
  };
  walkCss(join(ROOT, "src"));
  // A css comment that names an old binding (study.css once said 'The Ctrl+Enter keycap').
  for (const p of cssFiles) {
    const rel = relative(ROOT, p).replace(/\\/g, "/");
    const src = readFileSync(p, "utf8");
    for (const m of src.matchAll(/\/\*[\s\S]*?\*\//g)) {
      if (/\b(Ctrl|Cmd|Control|Meta)\+(K|Enter|Shift\+C)\b|Ctrl\/Cmd\+(K|Enter)\b/.test(m[0])) hits.css.push(`${rel}:${src.slice(0, m.index).split("\n").length}`);
    }
  }
  for (const p of files) {
    const rel = relative(ROOT, p).replace(/\\/g, "/");
    const lines = code(readFileSync(p, "utf8")).split("\n");
    lines.forEach((line, i) => {
      const at = `${rel}:${i + 1}`;
      // A Ctrl-or-Cmd chord ((e.ctrlKey || e.metaKey), or exactly one of them) may only be undo (Z, a standard key).
      if (/\(e\.ctrlKey \|\| e\.metaKey\)|e\.ctrlKey [!=]== e\.metaKey/.test(line)) {
        const near = lines.slice(Math.max(0, i - 2), i + 3).join("\n");
        if (!/"z"/.test(near)) hits.chord.push(at);
      }
      if (/(ctrlKey|metaKey)[^\n]*["'](k|K|Enter)["']|["'](k|K)["'][^\n]*(ctrlKey|metaKey)/.test(line) && !/!e\.ctrlKey|e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey\) return/.test(line)) hits.chord.push(`${at} (k/Enter)`);
      if (/["']KeyC["']|["']KeyK["']/.test(line)) hits.keyC.push(at);
      if (/aria-keyshortcuts=[^\n]*(Control|Meta)\+(K|k|Enter|Shift\+C)/.test(line)) hits.aria.push(at);
      if (rel !== "src/lib/shortcuts.ts" && /\b(Ctrl|Cmd|Control|Meta)\+(K|Enter|Shift\+C)\b/.test(line)) hits.text.push(at);
      if (/ReviewRunner/.test(rel) && /e\.key === " "/.test(line)) hits.space.push(at);
    });
  }
  check("src: no Ctrl/Cmd chord binding but undo (Ctrl/Cmd+Z)", hits.chord.length === 0, hits.chord.join("; "));
  check("src: no 'KeyC' / 'KeyK' binding (Ctrl+Shift+C was DevTools' inspect)", hits.keyC.length === 0, hits.keyC.join("; "));
  check("src: no aria-keyshortcuts with Control+K, Control/Meta+Enter or Control+Shift+C", hits.aria.length === 0, hits.aria.join("; "));
  check("src: no visible 'Ctrl+K', 'Ctrl+Enter' or 'Ctrl+Shift+C' (outside shortcuts.ts' BROWSER_RESERVED)", hits.text.length === 0, hits.text.join("; "));
  check("src: Space is no review key", hits.space.length === 0, hits.space.join("; "));
  check("src/**/*.css: no comment names Ctrl/Cmd+K, Ctrl/Cmd+Enter or Ctrl+Shift+C", hits.css.length === 0, hits.css.join("; "));
  check("src/**/*.css: the scan read the stylesheets (more than 10 files)", cssFiles.length > 10, String(cssFiles.length));
  check("src: the scan read the app (more than 100 files)", files.length > 100, String(files.length));
}

// ── (d) Truth tables ────────────────────────────────────────────────────────
console.log("\n── (d) The pure rules");
{
  const ev = (k: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
  const body: TargetLike = { tagName: "BODY", closest: () => null };
  const button: TargetLike = { tagName: "BUTTON", closest: () => null };
  const input: TargetLike = { tagName: "INPUT", closest: () => null };
  const area: TargetLike = { tagName: "TEXTAREA", closest: () => null };
  const select: TargetLike = { tagName: "SELECT", closest: () => null };
  const editable: TargetLike = { tagName: "DIV", isContentEditable: true, closest: () => null };
  const inSheet: TargetLike = { tagName: "BUTTON", closest: (s: string) => (s === "[data-capture-sheet]" ? {} : null) };

  // normalizeKey
  const n = (name: string, e: KeyEventLike, want: string | null) => check(`normalize: ${name} → ${want ?? "null"}`, normalizeKey(e) === want, String(normalizeKey(e)));
  n("'c'", ev("c", { code: "KeyC" }), "c");
  n("Shift+C", ev("C", { shiftKey: true, code: "KeyC" }), "Shift+C");
  n("Caps Lock 'C' (no Shift)", ev("C", { code: "KeyC" }), "c");
  n("'?' on US (Shift+/)", ev("?", { shiftKey: true, code: "Slash" }), "Shift+?");
  n("'?' on a layout without Shift", ev("?", { code: "Minus" }), "Shift+?");
  n("'/' on a German keyboard (Shift+7)", ev("/", { shiftKey: true, code: "Digit7" }), "/");
  n("','", ev(",", { code: "Comma" }), ",");
  n("Cyrillic 'с' on the C key", ev("с", { code: "KeyC" }), "c");
  n("Alt+N", ev("n", { altKey: true, code: "KeyN" }), "Alt+N");
  n("Mac Option+N (dead tilde, keyCode 229)", ev("Dead", { altKey: true, code: "KeyN", keyCode: 229 }), "Alt+N");
  n("Mac Option+N ('˜')", ev("˜", { altKey: true, code: "KeyN" }), "Alt+N");
  n("Ctrl+Alt+N (AltGr)", ev("n", { ctrlKey: true, altKey: true, code: "KeyN" }), null);
  n("AltGr+E typing '€'", ev("€", { ctrlKey: true, altKey: true, code: "KeyE" }), null);
  n("Alt+Shift+N", ev("N", { altKey: true, shiftKey: true, code: "KeyN" }), "Alt+Shift+N");
  n("Alt+Enter", ev("Enter", { altKey: true, code: "Enter" }), "Alt+Enter");
  n("Mac Option+B ('∫')", ev("∫", { altKey: true, code: "KeyB" }), "Alt+B");
  n("Ctrl+K", ev("k", { ctrlKey: true, code: "KeyK" }), "Ctrl+K");
  n("Cmd+K", ev("k", { metaKey: true, code: "KeyK" }), "Cmd+K");
  n("Ctrl+Shift+C", ev("C", { ctrlKey: true, shiftKey: true, code: "KeyC" }), "Ctrl+Shift+C");
  n("Enter", ev("Enter", { code: "Enter" }), "Enter");
  n("Shift+Enter", ev("Enter", { shiftKey: true, code: "Enter" }), "Shift+Enter");
  n("ArrowRight", ev("ArrowRight", { code: "ArrowRight" }), "→");
  n("Space", ev(" ", { code: "Space" }), "Space");
  n("a bare Shift", ev("Shift", { shiftKey: true, code: "ShiftLeft" }), null);
  n("a bare Alt", ev("Alt", { altKey: true, code: "AltLeft" }), null);
  n("an IME composition", ev("c", { isComposing: true }), null);
  n("keyCode 229 without Alt (an IME)", ev("c", { keyCode: 229 }), null);
  n("a dead key without Alt", ev("Dead", { code: "BracketLeft" }), null);
  n("Dvorak Alt+N (key 'n' on the physical L)", ev("n", { altKey: true, code: "KeyL" }), "Alt+N");
  n("Dvorak Alt+B (key 'b' on the physical N)", ev("b", { altKey: true, code: "KeyN" }), "Alt+B");
  n("Colemak Alt+Shift+N (key 'N' on the physical J)", ev("N", { altKey: true, shiftKey: true, code: "KeyJ" }), "Alt+Shift+N");
  n("Cyrillic Alt+'т' on the physical N", ev("т", { altKey: true, code: "KeyN" }), "Alt+N");
  check(
    "normalize: Mac Option+N's dead key in a field → null (key 'Dead', or keyCode 229); outside a field → Alt+N",
    normalizeKey(ev("Dead", { altKey: true, code: "KeyN" }), area) === null &&
      normalizeKey(ev("Dead", { altKey: true, code: "KeyN", keyCode: 229 }), input) === null &&
      normalizeKey(ev("Dead", { altKey: true, code: "KeyN", keyCode: 229 }), editable) === null &&
      normalizeKey(ev("Dead", { altKey: true, code: "KeyN", keyCode: 229 }), body) === "Alt+N" &&
      normalizeKey(ev("Dead", { altKey: true, code: "KeyN" }), button) === "Alt+N"
  );
  check("normalize: a plain Alt+N in a field stays Alt+N (only the dead key is the field's)", normalizeKey(ev("n", { altKey: true, code: "KeyN" }), area) === "Alt+N" && normalizeKey(ev("˜", { altKey: true, code: "KeyN" }), area) === "Alt+N");
  check(
    "isAltDeadKeyInField: only Alt + a dead key (Dead or 229) + a typing target",
    isAltDeadKeyInField(ev("Dead", { altKey: true }), area) && isAltDeadKeyInField(ev("n", { altKey: true, keyCode: 229 }), input) && !isAltDeadKeyInField(ev("Dead", { altKey: true }), body) && !isAltDeadKeyInField(ev("Dead"), area) && !isAltDeadKeyInField(ev("n", { altKey: true }), area)
  );
  check("isKey: Dvorak's Alt+B blanks, and the physical N under it is not Alt+N", isKey(ev("b", { altKey: true, code: "KeyN" }), "Alt+B") && !isKey(ev("b", { altKey: true, code: "KeyN" }), "Alt+N") && !isKey(ev("x", { altKey: true, code: "KeyB" }), "Alt+B"));

  // Every key of every shortcut reads back from a matching event (the notation and the reader agree).
  const toEvent = (k: string): KeyEventLike => {
    const parts = keyParts(k);
    const base = parts[parts.length - 1];
    const mods = parts.slice(0, -1);
    const named: Record<string, string> = { "→": "ArrowRight", Space: " " };
    const key = named[base] ?? (base.length === 1 ? base.toLowerCase() : base);
    const codeOf = /^[a-z]$/i.test(base) ? `Key${base.toUpperCase()}` : /^\d$/.test(base) ? `Digit${base}` : base === "Enter" ? "Enter" : undefined;
    return ev(key === "?" ? "?" : key, { altKey: mods.includes("Alt"), shiftKey: mods.includes("Shift"), code: codeOf });
  };
  const roundTrip = SHORTCUTS.flatMap((s) => s.keys.flatMap((k) => (k.includes(" ") ? k.split(" ") : expand(k))).filter((k) => normalizeKey(toEvent(k)) !== k).map((k) => `${s.id}: ${k} → ${normalizeKey(toEvent(k))}`));
  check("normalize: every key in SHORTCUTS reads back from its own keydown", roundTrip.length === 0, roundTrip.join("; "));
  check("isKey: Alt+Enter and Alt+B, but not held or already handled", isKey(ev("Enter", { altKey: true, code: "Enter" }), "Alt+Enter") && isKey(ev("b", { altKey: true, code: "KeyB" }), "Alt+B") && !isKey(ev("b", { altKey: true, code: "KeyB", repeat: true }), "Alt+B") && !isKey(ev("Enter", { altKey: true, defaultPrevented: true }), "Alt+Enter") && !isKey(ev("Enter", { ctrlKey: true }), "Alt+Enter"));

  // decideShortcut
  const env = (over: Partial<ShortcutEnv> = {}): ShortcutEnv => ({ target: body, modalOpen: false, reviewSession: false, now: 10_000, ...over });
  const runs = (e: KeyEventLike, over: Partial<ShortcutEnv> = {}, seq: SequenceState = SEQUENCE_IDLE) => decideShortcut(e, seq, env(over)).run?.id ?? null;
  const d = (name: string, got: string | null, want: string | null) => check(`decide: ${name} → ${want ?? "nothing"}`, got === want, String(got));
  for (const s of GLOBAL_HANDLED) {
    if (s.keys.some((k) => k.includes(" "))) continue;
    d(`'${s.keys[0]}' on the page`, runs(toEvent(s.keys[0])), s.id);
  }
  d("'r' starts a review from any page", runs(ev("r", { code: "KeyR" })), "start-review");
  d("'?' opens help", runs(ev("?", { shiftKey: true, code: "Slash" })), "help");
  d("'c' is the capture sheet's, never the global handler's", runs(ev("c", { code: "KeyC" })), null);
  d("Alt+N is the capture sheet's", runs(ev("n", { altKey: true, code: "KeyN" })), null);
  d("Shift+R does nothing", runs(ev("R", { shiftKey: true, code: "KeyR" })), null);
  d("Ctrl+R (reload) is the browser's", runs(ev("r", { ctrlKey: true, code: "KeyR" })), null);
  d("Cmd+, is the browser's", runs(ev(",", { metaKey: true, code: "Comma" })), null);
  d("Space (page down) is the browser's", runs(ev(" ", { code: "Space" })), null);
  for (const [name, t] of [["an input", input], ["a textarea", area], ["a select", select], ["contenteditable", editable], ["the capture sheet", inSheet]] as const) {
    d(`'r' typed in ${name}`, runs(ev("r", { code: "KeyR" }), { target: t }), null);
    d(`'?' typed in ${name}`, runs(ev("?", { shiftKey: true }), { target: t }), null);
  }
  d("'r' on a focused button runs", runs(ev("r", { code: "KeyR" }), { target: button }), "start-review");
  d("'r' with a dialog open", runs(ev("r", { code: "KeyR" }), { modalOpen: true }), null);
  d("'?' with a dialog open (Esc closes it first)", runs(ev("?", { shiftKey: true }), { modalOpen: true }), null);
  d("'r' held down", runs(ev("r", { code: "KeyR", repeat: true })), null);
  d("'r' mid-composition", runs(ev("r", { isComposing: true })), null);
  d("'r' with keyCode 229", runs(ev("r", { keyCode: 229 })), null);
  d("'r' already handled", runs(ev("r", { defaultPrevented: true })), null);
  d("'r' during a review session (the runner owns the keys)", runs(ev("r", { code: "KeyR" }), { reviewSession: true }), null);
  d("',' during a review session", runs(ev(",", { code: "Comma" }), { reviewSession: true }), null);
  d("'?' during a review session still helps", runs(ev("?", { shiftKey: true }), { reviewSession: true }), "help");
  d("'1' is no global key (the runner's)", runs(ev("1", { code: "Digit1" })), null);
  const deadInField = decideShortcut(ev("Dead", { altKey: true, code: "KeyN", keyCode: 229 }), { prefix: "g", at: 9_900 }, env({ target: area }));
  check("decide: a dead-key Option chord in a field ends a waiting sequence and runs nothing", deadInField.run === null && deadInField.seq.prefix === null && !deadInField.consume);

  // Sequences
  const g = decideShortcut(ev("g", { code: "KeyG" }), SEQUENCE_IDLE, env({ now: 1000 }));
  check("sequence: 'g' waits (consumed, nothing runs)", g.run === null && g.consume && g.seq.prefix === "g" && sequenceWaiting(g.seq, 1000));
  const step = (k: string, at: number, seq: SequenceState = g.seq, over: Partial<ShortcutEnv> = {}) => decideShortcut(ev(k, { code: `Key${k.toUpperCase()}` }), seq, env({ now: at, ...over }));
  for (const s of GLOBAL_HANDLED.filter((x) => x.keys.some((k) => k.startsWith("g ")))) {
    const second = s.keys.find((k) => k.startsWith("g "))!.slice(2);
    const r = step(second, 1000 + SEQUENCE_MS - 1);
    check(`sequence: g then ${second} → ${s.href}`, r.run?.id === s.id && r.consume && r.seq.prefix === null);
  }
  const late = step("t", 1000 + SEQUENCE_MS + 1);
  check("sequence: 't' after the 1.5 s window does not go to Today", late.run === null && late.seq.prefix === null);
  check("sequence: the window is inclusive at exactly SEQUENCE_MS", step("t", 1000 + SEQUENCE_MS).run?.id === "go-today");
  const other = step("x", 1100);
  check("sequence: g then an unknown key ends it and does nothing", other.run === null && other.seq.prefix === null && !other.consume);
  const rAfterG = step("r", 1100);
  check("sequence: g then 'r' does not start a review (the sequence ate it)", rAfterG.run === null && rAfterG.seq.prefix === null);
  const gg = step("g", 1400);
  check("sequence: g g starts again (the window restarts)", gg.run === null && gg.seq.prefix === "g" && gg.seq.at === 1400 && step("t", 1400 + SEQUENCE_MS - 1, gg.seq).run?.id === "go-today");
  const shiftHeld = decideShortcut(ev("Shift", { shiftKey: true, code: "ShiftLeft" }), g.seq, env({ now: 1100 }));
  check("sequence: a bare modifier leaves it waiting", shiftHeld.seq === g.seq && shiftHeld.run === null);
  const typed = step("t", 1100, g.seq, { target: input });
  check("sequence: focus moved into a field ends it", typed.run === null && typed.seq.prefix === null);
  const repeat = decideShortcut(ev("g", { code: "KeyG", repeat: true }), g.seq, env({ now: 1100 }));
  check("sequence: a held 'g' neither restarts nor ends it", repeat.seq === g.seq && repeat.run === null);
  const inReview = decideShortcut(ev("g", { code: "KeyG" }), SEQUENCE_IDLE, env({ reviewSession: true }));
  check("sequence: never starts during a review session", inReview.seq.prefix === null && !inReview.consume);
  check("sequence: sequenceTargets('g') lists the six Go to pages", sequenceTargets("g").map((t) => t.key).join("") === "tslwyk", sequenceTargets("g").map((t) => t.key).join(""));

  // isCaptureHotkey agrees with normalizeKey on Alt+N, and guards 'c' like the global handler guards its letters.
  const matrix: KeyEventLike[] = [];
  for (const key of ["n", "N", "b", "Dead", "˜", "т", "c", "k"]) {
    for (const code of ["KeyN", "KeyC", "KeyK", "KeyL", undefined]) {
      for (const [ctrlKey, metaKey, altKey, shiftKey] of [[false, false, false, false], [false, false, true, false], [true, false, true, false], [false, true, true, false], [false, false, true, true], [true, false, false, false], [false, true, false, false]] as const) {
        matrix.push(ev(key, { code, ctrlKey, metaKey, altKey, shiftKey }));
      }
    }
  }
  const withDead = [...matrix, ...matrix.filter((e) => e.altKey).map((e) => ({ ...e, keyCode: 229 }))];
  const disagree = [area, input, editable, body, button].flatMap((t) =>
    withDead
      .filter((e) => e.altKey && (e.code || e.key.length === 1))
      .filter((e) => isCaptureHotkey(e, t, false) !== (normalizeKey(e, t) === "Alt+N"))
      .map((e) => `${t.tagName} ${JSON.stringify(e)}`)
  );
  check(`capture hotkey: Alt+N agrees with normalizeKey over ${withDead.length} chords × 5 targets`, disagree.length === 0, disagree.slice(0, 3).join("; "));
  check(
    "capture hotkey: Mac Option+N (dead tilde) opens outside a field, and is left to type ñ inside one",
    isCaptureHotkey(ev("Dead", { altKey: true, code: "KeyN", keyCode: 229 }), body, false) &&
      isCaptureHotkey(ev("Dead", { altKey: true, code: "KeyN" }), button, true) &&
      !isCaptureHotkey(ev("Dead", { altKey: true, code: "KeyN", keyCode: 229 }), area, false) &&
      !isCaptureHotkey(ev("Dead", { altKey: true, code: "KeyN" }), input, true) &&
      !isCaptureHotkey(ev("Dead", { altKey: true, code: "KeyN", keyCode: 229 }), editable, false)
  );
  check("capture hotkey: Alt+N that types a real character still opens from a field", isCaptureHotkey(ev("n", { altKey: true, code: "KeyN" }), area, false) && isCaptureHotkey(ev("˜", { altKey: true, code: "KeyN" }), input, false));
  check("capture hotkey: Dvorak — key 'n' on the physical L opens; key 'b' on the physical N (Alt+B, Blank it) does not", isCaptureHotkey(ev("n", { altKey: true, code: "KeyL" }), area, false) && !isCaptureHotkey(ev("b", { altKey: true, code: "KeyN" }), area, false));
  check("capture hotkey: a non-Latin letter falls back to the physical key (Cyrillic 'т' on N opens)", isCaptureHotkey(ev("т", { altKey: true, code: "KeyN" }), body, false) && !isCaptureHotkey(ev("т", { altKey: true }), body, false));
  check(
    "capture hotkey: 'c' waits while a dialog or sheet is open; Alt+N does not",
    !isCaptureHotkey(ev("c", { code: "KeyC" }), body, false, true) &&
      !isCaptureHotkey(ev("c", { code: "KeyC" }), button, false, true) &&
      isCaptureHotkey(ev("c", { code: "KeyC" }), button, false, false) &&
      isCaptureHotkey(ev("n", { altKey: true, code: "KeyN" }), body, false, true) &&
      isCaptureHotkey(ev("n", { altKey: true, code: "KeyN" }), area, false, true)
  );
  check("capture hotkey: 'c' and the global letters agree on a dialog (both wait)", isCaptureHotkey(ev("c", { code: "KeyC" }), body, false, true) === (runs(ev("r", { code: "KeyR" }), { modalOpen: true }) !== null));
  const cDisagree = [body, button, input, area, select, editable].filter((t) => isCaptureHotkey(ev("c", { code: "KeyC" }), t, false) !== !isTypingTarget(t));
  check("capture hotkey: 'c' opens exactly where a global letter would (not while typing)", cDisagree.length === 0);
  check("capture hotkey: Ctrl+K and Cmd+K no longer open it", !isCaptureHotkey(ev("k", { ctrlKey: true, code: "KeyK" }), body, false) && !isCaptureHotkey(ev("k", { metaKey: true, code: "KeyK" }), area, false));
  check("capture hotkey: 'c' mid-review stays closed; Alt+N mid-review opens", !isCaptureHotkey(ev("c"), body, true) && isCaptureHotkey(ev("n", { altKey: true, code: "KeyN" }), body, true));
}

// ── (e) Capture buttons' aria-keyshortcuts ─────────────────────────────────
console.log("\n── (e) aria-keyshortcuts");
{
  const want = `${ariaKeysOf("capture")} ${ariaKeysOf("capture-anywhere")}`;
  check("MAC_NOTE: Option+N opens capture outside text fields; inside one it types ˜ (step out first)", /^On a Mac, Alt is the Option key\. Option\+N opens capture outside text fields; inside a field, .+ first \(Option\+N there types ˜\)\.$/.test(MAC_NOTE), MAC_NOTE);
  check("MAC_NOTE: no second chord is offered (no Ctrl or Cmd chord anywhere)", !/Ctrl\+|Cmd\+|Control\+/.test(MAC_NOTE) && !SHORTCUTS.some((s) => s.keys.some((k) => /^(Ctrl|Cmd)\+/.test(k))));
  check("ariaKeysOf: capture 'c', capture-anywhere 'Alt+N', help 'Shift+?'", ariaKeysOf("capture") === "c" && ariaKeysOf("capture-anywhere") === "Alt+N" && ariaKeysOf("help") === "Shift+?");
  check("CAPTURE_ARIA_KEYS is ariaKeysOf('capture') + ' ' + ariaKeysOf('capture-anywhere')", CAPTURE_ARIA_KEYS === want && want === "c Alt+N", CAPTURE_ARIA_KEYS);
  const chrome = code(read("src/components/shell/Chrome.tsx"));
  const values = [...chrome.matchAll(/aria-keyshortcuts=(\{[^}]*\}|"[^"]*")/g)].map((m) => m[1]);
  check("Chrome.tsx: the three Capture buttons carry CAPTURE_ARIA_KEYS and nothing else", values.length === 3 && values.every((v) => v === "{CAPTURE_ARIA_KEYS}"), values.join(", "));
  check("Chrome.tsx: the sidebar Capture's keycap is C", /sb-capture[\s\S]*?<span className="kbd" aria-hidden="true">\s*C\s*<\/span>/.test(chrome));
  check("LibrarySearch: the search box announces '/'", /aria-keyshortcuts=\{ariaKeysOf\("search"\)\}/.test(read("src/components/library/LibrarySearch.tsx")) && ariaKeysOf("search") === "/");
}

// ── (f) README, css, scripts ────────────────────────────────────────────────
console.log("\n── (f) README, css and scripts");
const START = "<!-- shortcuts:start (generated from src/lib/shortcuts.ts: npx tsx scripts/shortcut-check.ts --write) -->";
const END = "<!-- shortcuts:end -->";
function mdKeys(k: string): string {
  const range = /^(\d)-(\d)$/.exec(k);
  if (range) return `\`${range[1]}\`–\`${range[2]}\``;
  if (k.includes(" ")) return k.split(" ").map((p) => `\`${p}\``).join(" then ");
  return `\`${k}\``;
}
function readmeBlock(): string {
  const where = (s: (typeof SHORTCUTS)[number]) => SCOPE_NOTE[s.scope] ?? (s.scope === "anywhere" ? "Any page, even while typing" : "Any page, not while typing");
  const rows = SHORTCUTS.map((s) => `| ${s.group} | ${s.keys.map(mdKeys).join(" or ")} | ${s.label} | ${where(s)} |`);
  return [
    START,
    "| Group | Keys | What it does | Where |",
    "|---|---|---|---|",
    ...rows,
    "",
    `Standard keys keep their usual meaning: ${STANDARD_KEYS.map((s) => `\`${s.keys}\` ${s.label}`).join("; ")}. ${MAC_NOTE} ${BROWSER_NOTE}`,
    END,
  ].join("\n");
}
{
  const readme = read("README.md");
  const a = readme.indexOf(START);
  const b = readme.indexOf(END);
  if (process.argv.includes("--write")) {
    const block = readmeBlock();
    const next = a >= 0 && b > a ? readme.slice(0, a) + block + readme.slice(b + END.length) : readme;
    writeFileSync(join(ROOT, "README.md"), next);
    console.log(a >= 0 ? "README.md: the shortcuts table is rewritten" : "README.md: no shortcuts markers; add the section first");
  }
  const now = read("README.md");
  const s = now.indexOf(START);
  const e = now.indexOf(END);
  check("README: a 'Keyboard shortcuts' section", /^## Keyboard shortcuts$/m.test(now));
  check("README: its table is generated from SHORTCUTS (run with --write after a change)", s >= 0 && e > s && now.slice(s, e + END.length) === readmeBlock());

  const css = read("src/components/shell/shortcuts.css");
  check("shortcuts.css: the layer order is its first line, its rules in components", css.startsWith("@layer theme, base, components, art, effects, utilities;") && /@layer components \{/.test(css));
  check("shortcuts.css: nothing animates (the hint simply appears; Still looks the same)", !/animation|transition|@keyframes/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")));
  const sizes = [...css.matchAll(/(?:font-size:\s*|font:\s*\d+\s+)(\d+)px/g)].map((m) => Number(m[1]));
  check("shortcuts.css: no text under 12 px", sizes.length > 0 && sizes.every((px) => px >= 12), sizes.join(", "));
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  check("package.json: ui:check runs shortcut-check", pkg.scripts["ui:check"].includes("tsx scripts/shortcut-check.ts") && pkg.scripts["shortcut:check"] === "tsx scripts/shortcut-check.ts");
}

console.log(`\nshortcut-check: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
