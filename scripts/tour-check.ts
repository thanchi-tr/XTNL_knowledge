/**
 * Pure checks for the guided tour (src/components/tour): the steps and their
 * copy, keys read from SHORTCUTS (never hard-coded), every target the steps
 * name exists in the source, the first-run guard's truth table, the card's
 * placement over a grid of targets at 344×512, 375×812, 932×1024 and
 * 1440×900, the 12 px floor and 40/44 px targets in tour.css, the dialog's
 * keys and roles, motion through the gateway, and no class named like a
 * Tailwind utility. No DB, no browser.
 *
 * Run: npx tsx scripts/tour-check.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { compile } from "tailwindcss";
import { SECTIONS } from "../src/components/shell/nav";
import { SHORTCUTS, STANDARD_KEYS, shortcutOf, type ShortcutId } from "../src/lib/shortcuts";
import { TOUR_SEEN_KEY, TOUR_START_EVENT, startTour } from "../src/lib/tour-contract";
import manifest from "../src/app/manifest";
import {
  CAPTURE_TARGETS,
  PHONE_SHORTCUTS_COPY,
  SETTLE_MS,
  copyText,
  hasNoTour,
  readSeen,
  sayKey,
  shouldAutoStart,
  tourSteps,
  writeSeen,
  type AutoStartInput,
} from "../src/components/tour/tour-steps";
import { GAP, MARGIN, cardMaxHeight, cardWidth, intersect, overlaps, placeCard, type Box } from "../src/components/tour/tour-position";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const KEYBOARD = tourSteps({ keyboard: true });
const PHONE = tourSteps({ keyboard: false });
const TOUR_TSX = read("src/components/tour/Tour.tsx");
const STEPS_TS = read("src/components/tour/tour-steps.ts");
const TOUR_CSS = read("src/components/tour/tour.css");

// ── steps: seven or fewer, in order, short ─────────────────────────────────
{
  for (const [name, steps] of [["keyboard", KEYBOARD], ["phone", PHONE]] as const) {
    check(`steps (${name}): 7 or fewer`, steps.length >= 1 && steps.length <= 7, String(steps.length));
    eq(`steps (${name}): the order`, steps.map((s) => s.id), ["welcome", "capture", "today", "study", "you", "shortcuts", "done"]);
    for (const s of steps) {
      const text = copyText(s.body);
      check(`copy (${name}): ${s.id} is at most 160 characters`, text.length > 0 && text.length <= 160, `${text.length}: ${text}`);
      check(`copy (${name}): ${s.id} has a short title`, s.title.length > 0 && s.title.length <= 32, s.title);
      check(`copy (${name}): ${s.id} has no double spaces or stray placeholders`, !/ {2}|undefined|\[object/.test(text), text);
    }
  }
  const capture = copyText(KEYBOARD.find((s) => s.id === "capture")!.body);
  check("copy: capture says nothing is guessed by AI", /no AI/i.test(capture));
  check("copy: the done step points at Settings", /Settings/.test(copyText(KEYBOARD[KEYBOARD.length - 1].body)));
  check("copy: no promise words (soon, coming, will be)", ![...KEYBOARD, ...PHONE].some((s) => /\b(soon|coming|will be)\b/i.test(copyText(s.body))));
}

// ── keys come from SHORTCUTS, never from the tour's source ─────────────────
{
  const shortcutsStep = (steps: ReturnType<typeof tourSteps>) => steps.find((s) => s.id === "shortcuts")!;
  const named: ShortcutId[] = ["capture-anywhere", "capture", "go-today", "go-study", "help"];
  const text = copyText(shortcutsStep(KEYBOARD).body);
  for (const id of named) {
    const said = sayKey(shortcutOf(id).keys[0]);
    check(`keys: the shortcuts step says ${id} as SHORTCUTS has it (${said.keys.join(said.sep)})`, text.includes(said.keys.join(said.sep)), text);
  }
  eq("keys: a sequence is said 'g then t'", sayKey("g t"), { keys: ["g", "t"], sep: " then " });
  eq("keys: Shift+? is said '?'", sayKey("Shift+?"), { keys: ["?"], sep: "+" });
  eq("keys: Alt+N stays a chord", sayKey("Alt+N"), { keys: ["Alt", "N"], sep: "+" });

  // Swap every key: the copy must follow (it is derived, not written down).
  const fake = (id: ShortcutId) => `Q${SHORTCUTS.findIndex((s) => s.id === id)}`;
  const swapped = copyText(shortcutsStep(tourSteps({ keyboard: true, keyOf: fake })).body);
  check("keys: with other keys the copy names those keys", named.every((id) => swapped.includes(fake(id))), swapped);
  check("keys: with other keys no real chord or sequence is left", !/Alt\+N|g then [a-z]/.test(swapped), swapped);
  const keyed = shortcutsStep(KEYBOARD).body.filter((s) => typeof s !== "string").length;
  check("keys: the shortcuts step's keys are key segments (rendered as <kbd>)", keyed === named.length, String(keyed));

  // No key text in the tour's own source: no literal equal to a SHORTCUTS key, no chord, no 'g x' sequence.
  const allKeys = new Set(SHORTCUTS.flatMap((s) => s.keys));
  const literals = (src: string) => [...src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "").matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map((m) => m[2]);
  for (const [file, src] of [["tour-steps.ts", STEPS_TS], ["Tour.tsx", TOUR_TSX]] as const) {
    const bad = literals(src).filter((l) => allKeys.has(l) || /\b(Alt|Ctrl|Cmd|Meta|Control)\+\S/.test(l) || /^g [a-z]$/.test(l) || /(^|\s)press\s+\S/i.test(l));
    check(`keys: no hard-coded key text in ${file}`, bad.length === 0, bad.join(" | "));
  }
  check("keys: tour-steps reads SHORTCUTS (shortcutOf)", /from "@\/lib\/shortcuts"/.test(STEPS_TS) && /shortcutOf\(id\)/.test(STEPS_TS));

  // The phone's long-press step says what the icon offers, never a menu entry's name
  // (the PWA manifest and the Android shell label them differently).
  const phone = copyText(shortcutsStep(PHONE).body);
  eq("phone: the step says what the icon offers, with no menu names", phone, "On a phone with the app installed, long-press its icon for a quick task, a review or a new idea.");
  check("phone: the copy is PHONE_SHORTCUTS_COPY", phone === PHONE_SHORTCUTS_COPY);
  const iconNames = (manifest().shortcuts ?? []).flatMap((s) => [s.name, s.short_name ?? ""]).filter((n) => n && n !== "Today");
  check("phone: no manifest shortcut name is quoted in the step", iconNames.every((n) => !phone.includes(n)), iconNames.filter((n) => phone.includes(n)).join(", "));
  const urls = (manifest().shortcuts ?? []).map((s) => s.url);
  check("phone: the manifest still offers what the step says (a quick task, a review, a new idea)", urls.includes("/today?capture=task") && urls.includes("/review") && urls.includes("/add"), urls.join(", "));
  check("phone: the step names no keyboard key", !/Alt\+|then/.test(phone), phone);
  check("client: tour-steps and Tour.tsx import no metadata route (@/app/manifest)", !/@\/app\/manifest|from "\.\.?\/.*manifest"/.test(STEPS_TS) && !/@\/app\/manifest/.test(TOUR_TSX));
}

// ── every target the steps name exists in the source ───────────────────────
{
  const srcFiles: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f) && !p.includes(join("components", "tour"))) srcFiles.push(p);
    }
  };
  walk(join(ROOT, "src"));
  const src = srcFiles.map((f) => readFileSync(f, "utf8")).join("\n");
  const chrome = read("src/components/shell/Chrome.tsx");
  const classUsed = (c: string) => new RegExp(`className=(?:"|\\{[^}]*["'\`])[^"'\`]*\\b${c}\\b`).test(chrome) || new RegExp(`className="[^"]*\\b${c}\\b`).test(src);
  const all = [...new Set([...KEYBOARD, ...PHONE].flatMap((s) => s.targets))];
  for (const sel of all) {
    for (const m of sel.matchAll(/\[data-tour="([^"]+)"\]/g)) check(`target: data-tour="${m[1]}" is in the source`, src.includes(`data-tour="${m[1]}"`));
    for (const m of sel.replace(/\[[^\]]*\]/g, "").matchAll(/\.([\w-]+)/g)) check(`target: .${m[1]} (${sel}) is a class the shell renders`, classUsed(m[1]));
    for (const m of sel.matchAll(/a\[href="([^"]+)"\]/g)) check(`target: ${m[1]} is a section's href`, SECTIONS.some((s) => s.href === m[1]));
  }
  // The shell steps reach every chrome: tab bar (< 600), rail, sidebar (≥ 1280).
  for (const id of ["capture", "today", "study", "you"] as const) {
    const t = KEYBOARD.find((s) => s.id === id)!.targets;
    check(`target: ${id} has a target in the tab bar, the rail and the sidebar`, [".tabbar", ".rail", ".sidebar"].every((c) => t.some((s) => s.startsWith(c))), t.join(", "));
  }
  check("target: capture reaches the three capture buttons", CAPTURE_TARGETS.length === 3);
  check("target: the page-specific targets come first", KEYBOARD.find((s) => s.id === "today")!.targets[0] === '[data-tour="today-lanes"]' && KEYBOARD.find((s) => s.id === "you")!.targets[0] === '[data-tour="you-hero"]');
  check("target: welcome, shortcuts and done are centred (no target)", ["welcome", "shortcuts", "done"].every((id) => KEYBOARD.find((s) => s.id === id)!.targets.length === 0));
}

// ── first run: the guard's truth table ─────────────────────────────────────
{
  let cases = 0;
  let wrong: string[] = [];
  const paths = ["/today", "/today/week", "/review", "/you", "/dev/style/today", "/settings"];
  const searches = ["", "?notour", "?notour=1", "?x=1&notour", "?capture=task", "?view=board"];
  for (const seen of [false, true])
    for (const pathname of paths)
      for (const search of searches)
        for (const dialogOpen of [false, true])
          for (const automated of [false, true])
            for (const optedOut of [false, true]) {
              const input: AutoStartInput = { seen, pathname, search, dialogOpen, automated, optedOut };
              const want = !seen && pathname === "/today" && !dialogOpen && !automated && !optedOut && (search === "" || search === "?view=board");
              cases++;
              if (shouldAutoStart(input) !== want) wrong.push(JSON.stringify(input));
            }
  check(`first run: the guard matches the truth table (${cases} cases)`, wrong.length === 0, wrong.slice(0, 3).join("; "));
  wrong = [];
  check("first run: ?notour is read wherever it sits", hasNoTour("?notour") && hasNoTour("?a=1&notour=1") && !hasNoTour("?notourist=1") && !hasNoTour(""));
  check("first run: the settle is about 800 ms", SETTLE_MS >= 500 && SETTLE_MS <= 1200, String(SETTLE_MS));

  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  check("seen: a fresh device has not seen it", readSeen(storage) === false);
  writeSeen(storage);
  check("seen: finishing or skipping writes TOUR_SEEN_KEY", mem.has(TOUR_SEEN_KEY) && readSeen(storage) === true);
  const throwing = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  let threw = false;
  try {
    check("seen: blocked storage reads as seen (never nags)", readSeen(throwing) === true);
    writeSeen(throwing);
  } catch {
    threw = true;
  }
  check("seen: blocked storage never throws", !threw);
  check("seen: no storage reads as seen", readSeen(null) === true);

  // The query is the one the page view arrived with: QuickCapture strips ?capture= a tick
  // later and the sheet then closes, and no later attempt may start the tour.
  const arrived = "?capture=task";
  const attemptLater: AutoStartInput = { seen: false, pathname: "/today", search: arrived, dialogOpen: false, automated: false, optedOut: false };
  check("first run: a visit that arrived with ?capture= never starts it, even once the param is stripped and the sheet closed", shouldAutoStart(attemptLater) === false && shouldAutoStart({ ...attemptLater, search: "" }) === true);
  const effect = /\/\/ First run:[\s\S]*?\}, \[pathname, start\]\);/.exec(TOUR_TSX)?.[0] ?? "";
  check(
    "first run: Tour.tsx snapshots location.search when the effect runs, before any timer, and every attempt reads the snapshot",
    /const initialSearch = window\.location\.search;/.test(effect) &&
      effect.indexOf("const initialSearch") < effect.indexOf("const attempt") &&
      /hasNoTour\(initialSearch\)/.test(effect) &&
      /search: initialSearch,/.test(effect) &&
      !/window\.location\.search/.test(effect.slice(effect.indexOf("const attempt"))),
    effect.slice(0, 200)
  );
  check(
    "first run: an auto-start writes TOUR_SEEN_KEY as it opens (a reload or a killed app mid-tour does not bring it back)",
    /if \(shouldAutoStart\(input\)\) \{\s*(?:\/\/[^\n]*\n\s*)*writeSeen\(store\("localStorage"\)\);\s*start\(\);\s*\}/.test(effect)
  );
  check("first run: a replay (TOUR_START_EVENT) ignores the seen flag", /addEventListener\(TOUR_START_EVENT, start\)/.test(TOUR_TSX) && !/readSeen/.test(/const start = useCallback\([\s\S]*?\}, \[\]\);/.exec(TOUR_TSX)?.[0] ?? "readSeen"));
  check("first run: Tour.tsx runs the guard after SETTLE_MS, with webdriver and the dialog query", /setTimeout\(attempt, SETTLE_MS\)/.test(TOUR_TSX) && /navigator\.webdriver/.test(TOUR_TSX) && /DIALOG_OPEN_SELECTOR/.test(TOUR_TSX) && /\[data-capture-sheet\]/.test(TOUR_TSX));
  check("first run: localStorage is only reached inside try/catch helpers", !/localStorage\.(get|set)Item/.test(TOUR_TSX) && /window\[kind\]/.test(TOUR_TSX));
}

// ── the contract with the rest of the app ──────────────────────────────────
{
  check("contract: Tour listens for TOUR_START_EVENT", /addEventListener\(TOUR_START_EVENT, start\)/.test(TOUR_TSX) && /from "@\/lib\/tour-contract"/.test(TOUR_TSX));
  check("contract: the event and key are namespaced", TOUR_START_EVENT.startsWith("xtnl:") && TOUR_SEEN_KEY.startsWith("xtnl:"));
  let ok = true;
  try {
    startTour(); // no window here: a no-op, never a throw
  } catch {
    ok = false;
  }
  check("contract: startTour is safe on the server", ok);
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  check("package.json: ui:check ends with tour-check, and tour:check runs it alone", / && tsx scripts\/tour-check\.ts$/.test(pkg.scripts["ui:check"]) && pkg.scripts["tour:check"] === "tsx scripts/tour-check.ts", pkg.scripts["ui:check"]);
  check("contract: Tour is exported for the root layout", /export function Tour\(\)/.test(TOUR_TSX));
}

// ── the dialog: roles, focus, keys, motion ─────────────────────────────────
{
  check("a11y: role=dialog, aria-modal, labelled and described", /role="dialog"/.test(TOUR_TSX) && /aria-modal="true"/.test(TOUR_TSX) && /aria-labelledby=\{titleId\}/.test(TOUR_TSX) && /aria-describedby=\{bodyId\}/.test(TOUR_TSX));
  check("a11y: a polite live region inside the card announces each step", /aria-live="polite"/.test(TOUR_TSX) && /setAnnouncement\(`Step \$\{i \+ 1\} of/.test(TOUR_TSX));
  check("a11y: the spotlight and veil are decorative", /className="tour-spot"[^>]*aria-hidden="true"/.test(TOUR_TSX) && /className="tour-veil"\s+aria-hidden="true"/.test(TOUR_TSX));
  check("a11y: focus moves to the card and is trapped", /card\.focus\(/.test(TOUR_TSX) && /trapTab\(e, cardRef\.current\)/.test(TOUR_TSX) && /"focusin"/.test(TOUR_TSX));
  check("a11y: Esc skips through the app's one Escape stack", /pushEscapeLayer\(\(\) => finishRef\.current\(\)\)/.test(TOUR_TSX));
  const keys = [...new Set([...TOUR_TSX.matchAll(/e\.key === "([^"]+)"/g)].map((m) => m[1]))].sort();
  eq("a11y: the card answers Tab, Esc, Left and Right only", keys, ["ArrowLeft", "ArrowRight", "Escape", "Tab"]);
  check("a11y: Esc is a standard key (STANDARD_KEYS), not a shortcut", STANDARD_KEYS.some((k) => k.keys === "Esc") && !SHORTCUTS.some((s) => s.keys.includes("Esc")));
  check("a11y: nothing the card hears reaches the page's shortcuts", /e\.stopPropagation\(\)/.test(TOUR_TSX));
  check("a11y: Back, Next and Skip, and 'n of N'", /Skip/.test(TOUR_TSX) && /Back/.test(TOUR_TSX) && /"Next"/.test(TOUR_TSX) && /\{index \+ 1\} of \{steps\.length\}/.test(TOUR_TSX));
  check("motion: only through the gateway (play), never framer-motion or a raw animate()", /import \{[^}]*\bplay\b[^}]*\} from "@\/lib\/motion"/.test(TOUR_TSX) && !/framer-motion/.test(TOUR_TSX) && !/\.animate\(/.test(TOUR_TSX));
  check("motion: the scroll is instant unless motion is Full and not reduced", /motionLevel\(\) === "full" && !prefersReduced\(\) \? "smooth" : "instant"/.test(TOUR_TSX));
  check("motion: play animates transform and opacity only", [...TOUR_TSX.matchAll(/play\([^,]+,\s*\[([^\]]*)\]/g)].every((m) => [...m[1].matchAll(/(\w+):/g)].every((p) => p[1] === "opacity" || p[1] === "transform")));
  check("portal: the tour renders into <body>, outside <main>", /createPortal\(/.test(TOUR_TSX) && /document\.body\s*\)/.test(TOUR_TSX));
}

// ── placement: in the viewport, off the target ─────────────────────────────
{
  const viewports: Box[] = [
    { left: 0, top: 0, width: 344, height: 512 },
    { left: 0, top: 0, width: 375, height: 812 },
    { left: 0, top: 0, width: 932, height: 1024 },
    { left: 0, top: 0, width: 1440, height: 900 },
    // Pinch-zoomed: the visual viewport is offset inside the layout viewport.
    { left: 40, top: 120, width: 344, height: 512 },
  ];
  let cases = 0;
  const bad: string[] = [];
  for (const vp of viewports) {
    const w = cardWidth(vp);
    const maxH = cardMaxHeight(vp);
    check(`placement ${vp.width}×${vp.height}: the card fits the width with margins`, w > 0 && w <= vp.width - 2 * MARGIN && w <= 360);
    check(`placement ${vp.width}×${vp.height}: the card may be at least 200 tall (the copy fits)`, maxH >= 200, String(maxH));
    const sizes: [number, number][] = [
      [40, 40],
      [52, 52],
      [72, 62],
      [120, 48],
      [Math.round(vp.width * 0.9), 120],
      [Math.round(vp.width * 0.6), Math.round(vp.height * 0.5)],
      [Math.round(vp.width * 0.95), Math.round(vp.height * 0.9)],
      [vp.width, vp.height * 2],
      [260, vp.height],
      [vp.width, 64],
    ];
    const xs = [-80, 0, 0.1, 0.33, 0.5, 0.75, 1].map((f) => (f <= 0 ? f : Math.round(f * vp.width)));
    const ys = [-300, -20, 0, 0.1, 0.25, 0.45, 0.6, 0.85, 1].map((f) => (f <= 0 ? f : Math.round(f * vp.height)));
    for (const [tw, th] of sizes)
      for (const x of xs)
        for (const y of ys)
          for (const ch of [140, 210, maxH, maxH + 300]) {
            const target: Box = { left: vp.left + x - (x >= vp.width ? tw : 0), top: vp.top + y - (y >= vp.height ? th : 0), width: tw, height: th };
            const p = placeCard(target, { width: 360, height: ch }, vp);
            const card: Box = { left: p.left, top: p.top, width: w, height: Math.min(ch, maxH) };
            cases++;
            const inside =
              card.left >= vp.left + MARGIN - 0.5 &&
              card.top >= vp.top + MARGIN - 0.5 &&
              card.left + card.width <= vp.left + vp.width - MARGIN + 0.5 &&
              card.top + card.height <= vp.top + vp.height - MARGIN + 0.5;
            const visible = intersect(target, vp);
            const id = `${vp.width}×${vp.height}@${vp.left},${vp.top} target ${tw}×${th} at ${x},${y} card h ${ch} → ${p.side}`;
            if (!inside) bad.push(`${id}: card leaves the viewport`);
            if (visible) {
              if (!p.spot) bad.push(`${id}: a visible target lost its spotlight`);
              else {
                const pad = { left: target.left - 6, top: target.top - 6, width: target.width + 12, height: target.height + 12 };
                const within = (a: Box, b: Box) => a.left >= b.left - 0.5 && a.top >= b.top - 0.5 && a.left + a.width <= b.left + b.width + 0.5 && a.top + a.height <= b.top + b.height + 0.5;
                if (!within(p.spot, pad) || !within(p.spot, vp)) bad.push(`${id}: the spotlight is not inside the target and the viewport`);
                const shrunk = { left: card.left + 0.5, top: card.top + 0.5, width: card.width - 1, height: card.height - 1 };
                if (overlaps(shrunk, p.spot)) bad.push(`${id}: the card covers the spotlight`);
                if (p.spot.height < Math.min(16, visible.height) - 0.5) bad.push(`${id}: the spotlight is a sliver`);
              }
            } else if (p.side !== "center") bad.push(`${id}: an off-screen target should centre the card`);
          }
  }
  check(`placement: ${cases} target × card × viewport cases keep the card in view and off its target`, bad.length === 0, `${bad.length} bad; ${bad.slice(0, 4).join("; ")}`);
  const none = placeCard(null, { width: 360, height: 200 }, { left: 0, top: 0, width: 344, height: 512 });
  eq("placement: no target centres the card", [none.side, none.spot, none.left, none.top], ["center", null, 12, 156]);
  const tab = placeCard({ left: 146, top: 512 - 58, width: 52, height: 52 }, { width: 320, height: 200 }, { left: 0, top: 0, width: 344, height: 512 });
  check("placement: the tab bar's + at 344×512 gets its card above it", tab.side === "above" && tab.top + 200 <= 512 - 58 - 6 - GAP + 0.5, `${tab.side} ${tab.top}`);
}

// ── tour.css: layer order, 12 px floor, 40/44 px targets, no motion of its own ──
{
  const css = TOUR_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  check("css: tour.css starts with the layer order", TOUR_CSS.split(/\r?\n/)[0].trim() === "@layer theme, base, components, art, effects, utilities;");
  check("css: everything sits in @layer components", /@layer components\s*\{/.test(css));
  const sizes = [...css.matchAll(/font-size\s*:\s*([\d.]+)(px|rem)/g)].map((m) => Number(m[1]) * (m[2] === "rem" ? 16 : 1));
  check("css: every font size is 12 px or more", sizes.length > 0 && sizes.every((s) => s >= 12), sizes.join(", "));
  const rule = (sel: string) => new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  const px = (body: string, prop: string) => Number(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([\\d.]+)px`).exec(body)?.[1] ?? 0);
  check("css: the card's buttons are at least 40 px (44 here)", px(rule(".tour-actions .btn"), "min-height") >= 44 && px(rule(".tour-actions .btn"), "min-width") >= 40);
  check("css: the primary (Next/Done) is at least 44 px", px(rule(".tour-actions .tour-next"), "min-height") >= 44 && px(rule(".tour-actions .tour-next"), "min-width") >= 44);
  check("css: Tour.tsx renders the primary with .tour-next through the kit Button", /<Button variant="primary" className="tour-next"/.test(TOUR_TSX));
  check("css: no transition, animation, keyframes or !important (motion goes through play)", !/transition|animation|@keyframes|!important/.test(css));
  check("css: the card has a visible focus ring", /\.tour-card:focus-visible\s*\{[^}]*outline:\s*2px/.test(css));
  check("css: the tour sits above sheets and below a ceremony", /z-index:\s*calc\(var\(--z-sheet\) \+ 10\)/.test(css));
  check("css: the card scrolls inside past its height cap", /max-height:\s*var\(--tour-max-h/.test(css) && /overflow-y:\s*auto/.test(css) && /--tour-max-h/.test(TOUR_TSX));
}

// ── Tailwind: no tour class is also a generated utility ────────────────────
async function tailwindCollisions() {
  const twDir = join(ROOT, "node_modules/tailwindcss");
  const tw = await compile(read("src/app/globals.css"), {
    base: join(ROOT, "src/app"),
    loadStylesheet: async (id: string, base: string) => {
      if (id === "tailwindcss") return { path: join(twDir, "index.css"), base: twDir, content: readFileSync(join(twDir, "index.css"), "utf8") };
      if (base.startsWith(twDir)) {
        const p = join(base, id);
        return { path: p, base: twDir, content: readFileSync(p, "utf8") };
      }
      return { path: join(base, id), base, content: "" };
    },
  });
  const names = new Set<string>();
  for (const m of TOUR_CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) names.add(m[1]);
  // Classes the component writes itself (the kit's own .btn family and sr-only are checked by shell-check).
  const KIT = new Set(["btn", "sr-only"]);
  for (const m of TOUR_TSX.matchAll(/className="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (!KIT.has(c)) names.add(c);
  const has = (css: string, n: string) => css.includes(`.${n} {`);
  const before = tw.build([]);
  const after = tw.build([...names]);
  const hits = [...names].filter((n) => has(after, n) && !has(before, n));
  check(`tailwind: no tour class is a generated utility (${names.size} names)`, hits.length === 0, hits.join(", "));
  check("tailwind: the probe really compiles utilities (block is one)", has(tw.build(["block"]), "block"));
  const own = [...names].filter((n) => !KIT.has(n));
  check("tailwind: every class the tour adds is namespaced tour-*", own.every((n) => n.startsWith("tour-")), own.filter((n) => !n.startsWith("tour-")).join(", "));
}

(async () => {
  try {
    await tailwindCollisions();
  } catch (e) {
    check("tailwind: the collision probe runs", false, String(e));
  }
  console.log(`\ntour-check: ${passed} passed, ${failed} failed (${relative(ROOT, __filename)})`);
  process.exit(failed ? 1 : 0);
})();
