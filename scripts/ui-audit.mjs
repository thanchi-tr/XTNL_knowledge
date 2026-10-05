#!/usr/bin/env node
/**
 * Gate 3 and 4 (redesign.md › Acceptance): a headless audit at REAL viewports
 * (344, 375, 932, 1440; not a device frame) of every route, against a running
 * server. It never starts one: run the rehearsal server (or `next dev`) yourself.
 *
 *   node scripts/ui-audit.mjs [--base http://localhost:3100] [--routes all|real|fixtures|/today,/review]
 *                             [--widths 344,375,932,1440] [--json out.json] [--chrome <path>] [--plan]
 *                             [--gate '{"route":…,"width":…,"ask":[…],"aimLines":[…]}']
 *                             [--motion all|dev|off] [--budgets report|hard] [--no-gl]
 *
 * Routes: `all` (the default) is every real route plus every fixture route;
 * `fixtures` is the /dev/style pages only (every ?state= in R5's
 * FIXTURE_STATES, 15 today, read from src/app/dev/style/roadmap/fixtures.ts;
 * Today's quest states on /dev/style/today, the Aim card states on
 * /dev/style/art/you, …); `real` is the app's own pages; or a comma list.
 *
 * Rehearsal only (roadmap.md F23): /today, /today/week, /you, /you/roadmap
 * and /you/roadmap/new read the user's rows, and their render may write (the
 * life chain's settle → judge → roadmap step in after(), a week quest
 * freeze). The audit REFUSES them (exit 2, before Chrome starts) unless
 * --base is the rehearsal server, http://localhost:3100 (local database,
 * XTNL_LIFE_JUDGE=1). An audit never runs those routes against `next start`
 * on the shared database, where lifeWritesEnabled() is true while VERCEL_ENV
 * is unset. Off the rehearsal server the reduced-motion gate reads /dev/style.
 * The default base is the rehearsal server; audit fixtures elsewhere with
 * `--base http://localhost:3000 --routes fixtures`. A route must be a path
 * ("/…"): anything else is refused (exit 2), since Git Bash rewrites a bare
 * "/today" into "C:/Program Files/Git/today" (set MSYS_NO_PATHCONV=1).
 *
 * --plan prints the resolved base, routes and widths as JSON and exits 0
 * without starting Chrome (after the guard, which still refuses): the
 * roadmap contract check runs it.
 *
 * Recorded, not gated: the height of each Aim card ([data-aim-card="<key>"]
 * boxes on /dev/style/art/you, and .rm-ac / .rm-ac-empty elsewhere) and of
 * Today's week quests slot (.rm-quests-slot), per route × width; a NOTE line
 * flags an Aim card taller than 470 px on a phone (F19: about 400, at most
 * about 470).
 *
 * Gated (roadmap-rev4.md Acceptance and F-R4-1, F-R4-3; heightGateProblems,
 * which `--gate '<json>'` runs on given measurements and exits, before Chrome):
 *   - at 344, the ASK card ≤ 410 px in every state drawn, its tallest
 *     (empty-ask-continue, empty-ask-seed-last-aim on /dev/style/art/you)
 *     required. The bound is the card, section.card.rm-ac-call, not its
 *     [data-aim-card] box: F-R4-1 lists (a) the SectionHeader "Aim" and (b)
 *     the card, and its "about 312 px of content … about 330 px without a seed
 *     or a last aim, at most 410 px with both" is (b)'s content plus its own
 *     padding and border (312 + 12 + 4 + 2). The whole box (with the 24 px
 *     header) stays recorded under the 470 px NOTE;
 *   - at 344, every visible Today aim line (.rm-aim-line) ≤ 72 px;
 *   - at every width, no aim line clamps its text (.rm-aim-line-t
 *     scrollHeight ≤ clientHeight + 1), and on /dev/style/today the two
 *     in-place lines (aim-in-place, aim-in-place-longest) are drawn, and from
 *     932 sit in the board's c3 column (narrower than the board) under Goals.
 *     Without --widths, /dev/style/today and /today are also audited at 768
 *     and 1366 (EXTRA_WIDTHS), where c3 is narrower than at 344.
 *
 * Fails (exit 1) on, per route × width:
 *   - horizontal overflow (scrollWidth > innerWidth)
 *   - text spilling past its card (a nowrap line wider than the card it sits in,
 *     unless an ancestor clips it on purpose, e.g. an ellipsis)
 *   - an interactive target under 40×40 (primary actions and ticks under 44×44)
 *   - rendered text under 12 px, SVG text included (font size × the SVG's scale:
 *     a 12-unit label in a 380-wide viewBox drawn 282 px wide is 8.9 px)
 *   - under 600 px: a text input, select or textarea under 16 px (the browser zooms into it)
 *   - console errors or uncaught exceptions
 *   - on /today and /review: any running infinite animation at rest
 *   - the height gates above (the ASK card, Today's aim line)
 * And once, with prefers-reduced-motion: the first frame must carry html[data-motion="still"].
 *
 * ui-motion (docs/life-plan/ui-motion.md §11.7; lane M0c). Per route × width, also:
 *   - no SVG <text> in a glyph composite or a shader slot, and no text over a slot;
 *   - text inside the glyph layer that is visible but aria-hidden (compact figures,
 *     chip labels) is held to the 12 px floor too;
 *   - GlyphButton (.mg-gb) and RouteRail rows (.mg-rr-d > summary) are 44 px targets;
 *   - at 344 and 375, no two interactive rects intersect (D31; the chrome aside);
 *   - from 932, a visible .rm-cols is two columns and no chip label wraps;
 *   - at 344 and 375, app words (scripts/word-count.mjs on the live DOM, §3.1) in
 *     main and in the fold (the first 600 px of main), and the WORD_BUDGETS rows
 *     (§3.2): reported, or gated with --budgets hard (RZ);
 *   - on /today, /review and their fixture pages, at rest: no canvas, no
 *     html[data-shader-running], nothing running in __xtnlShader, frames flat over 1 s.
 * Then the motion probes (--motion all|dev|off; `dev` is /dev/style/fx and
 * /dev/style/glyphs only; the default is `all` for --routes all or fixtures, else off):
 *   - still and calm on every roadmap and /you fixture: no canvas, no runtime chunk,
 *     every .shd on its SVG; still: no animation after 2 s; calm: nothing loops;
 *   - prefers-contrast: more and forced-colors: active: no canvas or runtime, frames
 *     flat, every horizon band keeps its hairline and path;
 *   - full on /dev/style/fx (window.__XTNL_SHD_FORCE, SwiftShader): the air starts after
 *     a quiet window, runs ≤ 5 s of visible time per session (a second visit plays none),
 *     stops offscreen within 200 ms and drops its canvas after 10 s, stops when the page
 *     is hidden or on power-save, waits while the page is scrolled or pointed at, and
 *     caps DPR (horizon 1, weave 1.5); the weave runs at ≤ 20 fps, alone on the page, with
 *     its breathe still, stops at 90 s (test clock) and at once on its pause button; with
 *     no WebGL the drafting glyph's breathe runs on the compositor (a 3 s trace on
 *     /dev/style/glyphs shows no main-thread Paint at display rate);
 *   - fallbacks: no WebGL keeps the SVG with no console error; both programs compile
 *     (status ok); the walked path's dash end and the front dot sit at front × width
 *     within 0.5%; unmeasured has no dot; at air 0 the canvas equals the SVG dawn within
 *     2/255 at 9 points; a counted loss keeps the SVG and restore() goes live again;
 *     three mount / dispose cycles leave supported true;
 *   - performance at 4× CPU throttle: no long task over 50 ms from getContext to the
 *     first presented frame, INP ≤ 200 ms with a loop live, the LCP element is text,
 *     no layout shift from a slot;
 *   - the gateway on /dev/style/glyphs (?motion=still|calm|full, and the in-view-at-
 *     hydration accents): still makes no animate() call; calm only opacity, ≤ 260 ms,
 *     delay ≤ 200, no motes; full ends on the resting CSS (fill never forwards or
 *     both), one iteration, ≤ 1.6 s per event; an accent never hides, zeroes or
 *     un-draws a part.
 *   --no-gl launches Chrome with --disable-gpu (the old default) and skips the probes
 *   that need WebGL. The bundle gates of §11.7 (chunk sizes, first-load JS, glyph code
 *   on /today, markup bytes) read `next build` output: RZ's build, not this audit.
 *
 * Chrome is driven over the DevTools protocol (node's global WebSocket); set
 * CHROME or --chrome if it is not at the default Windows path. It runs with
 * SwiftShader GL (--use-angle=swiftshader --enable-unsafe-swiftshader) so the
 * shader probes have WebGL headless; --no-gl restores --disable-gpu.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyRuns, countDomAppWords, wordRules } from "./word-count.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
/** The rehearsal server (local database, XTNL_LIFE_JUDGE=1): the only base the rehearsal-only routes run against. */
const REHEARSAL_BASES = ["http://localhost:3100", "http://127.0.0.1:3100", "http://[::1]:3100"];
const BASE = opt("base", REHEARSAL_BASES[0]).replace(/\/+$/, "");
const IS_REHEARSAL = REHEARSAL_BASES.includes(BASE);

/** The app's own pages (they read the user's rows). */
const REAL_ROUTES = [
  "/today",
  "/today?capture=task",
  "/today/rules",
  "/today/week",
  "/review",
  "/review?view=run",
  "/library",
  "/add",
  "/structure",
  "/you",
  "/you/roadmap",
  "/you/roadmap/new",
  "/skills",
  "/you/loadout",
  "/you/moments",
  "/you/stats",
  "/settings",
  "/train",
];
/**
 * /dev/style/roadmap?state=… (roadmap F23): R5's FIXTURE_STATES, read from
 * src/app/dev/style/roadmap/fixtures.ts so a state R5 adds is audited without
 * an edit here (the same pattern roadmap-contract-check reads). The literal
 * list is only the fallback when that file can't be read or parsed; --plan
 * says which was used (`roadmapStatesFrom`), and the contract check requires
 * "fixtures.ts".
 */
const ROADMAP_FIXTURE_STATES_FALLBACK = [
  "empty",
  "no-key",
  "running",
  "draft-mixed",
  "draft-credential",
  "accepted",
  "active",
  "behind",
  "past-due",
  "start-refit",
  "body-practice",
  "done",
  "intake",
  "active-replan",
  "draft-live",
];
const roadmapFixtureStates = () => {
  try {
    const src = readFileSync(fileURLToPath(new URL("../src/app/dev/style/roadmap/fixtures.ts", import.meta.url)), "utf8");
    const list = /export const FIXTURE_STATES = \[([\s\S]*?)\]/.exec(src);
    const states = list ? [...list[1].matchAll(/"([\w-]+)"/g)].map((m) => m[1]) : [];
    if (states.length > 0) return { states, from: "fixtures.ts" };
  } catch {
    /* fall back below */
  }
  console.error("ui-audit: couldn't read FIXTURE_STATES from src/app/dev/style/roadmap/fixtures.ts; using the built-in list");
  return { states: ROADMAP_FIXTURE_STATES_FALLBACK, from: "fallback" };
};
const { states: ROADMAP_FIXTURE_STATES, from: ROADMAP_STATES_FROM } = roadmapFixtureStates();
/** Pure fixture pages: they never read the user's rows. */
const FIXTURE_ROUTES = [
  "/dev/style",
  "/dev/style/today",
  ...["hub", "empty", "question", "correct", "seal", "miss", "boss", "recap", "boss-won"].map((s) => `/dev/style/review?state=${s}`),
  "/dev/style/celebrate",
  "/dev/style/art",
  "/dev/style/art/you",
  "/dev/style/settings",
  "/dev/style/train",
  ...ROADMAP_FIXTURE_STATES.map((s) => `/dev/style/roadmap?state=${s}`),
  // ui-motion (§9.1): the glyph gallery and the shader slots (the WAIT weave running).
  "/dev/style/glyphs",
  "/dev/style/fx",
  "/dev/style/fx?program=weave",
];
/** Their render may write (the life chain in after(), a week quest freeze): rehearsal server only (F23). */
const REHEARSAL_ONLY = ["/today", "/today/week", "/you", "/you/roadmap", "/you/roadmap/new"];
/** A route's page path, normalised so a query, a fragment, a trailing or doubled slash, case or %-encoding can't slip past the guard. */
const pathOf = (route) => {
  let p = route.split(/[?#]/)[0];
  try {
    p = decodeURIComponent(p);
  } catch {
    /* keep it as typed */
  }
  return p.replace(/\/{2,}/g, "/").replace(/\/+$/, "").toLowerCase() || "/";
};

const routesArg = opt("routes", "all");
const ROUTES = (
  routesArg === "all" ? [...REAL_ROUTES, ...FIXTURE_ROUTES] : routesArg === "fixtures" ? FIXTURE_ROUTES : routesArg === "real" ? REAL_ROUTES : routesArg.split(",")
)
  .map((r) => r.trim())
  .filter(Boolean);
const WIDTHS_GIVEN = args.includes("--widths");
const WIDTHS = opt("widths", "344,375,932,1440").split(",").map(Number);
/**
 * Widths audited on a route beyond WIDTHS (only when --widths isn't given):
 * Today's board puts the aim line in its c3 column from a 640 px main, and c3
 * is narrower than at 344 between the Acceptance widths (an iPad held upright,
 * a 1366 laptop), where a clamp would cut the line's rank words.
 */
const EXTRA_WIDTHS = { "/dev/style/today": [768, 1366], "/today": [768, 1366] };
const widthsFor = (route) => (WIDTHS_GIVEN ? WIDTHS : [...WIDTHS, ...(EXTRA_WIDTHS[pathOf(route)] ?? []).filter((w) => !WIDTHS.includes(w))]);

// ── ui-motion options and routes (ui-motion.md §11.7) ────────────────────────
/** --budgets report|hard: the §3.2 word budgets print (report) or fail the route (hard: RZ's final pass). */
const BUDGETS = opt("budgets", "report") === "hard" ? "hard" : "report";
/** --motion all|dev|off: the motion probes after the per-route pass (dev: the two dev pages, M0c's gate). */
const MOTION = (() => {
  const m = opt("motion", routesArg === "all" || routesArg === "fixtures" ? "all" : "off");
  return ["all", "dev", "off"].includes(m) ? m : "off";
})();
/** --no-gl: Chrome with --disable-gpu (no WebGL); the probes that need a context are skipped. */
const GL = !args.includes("--no-gl");
/** /today and /review, and their fixture pages: no shader, no loop, at rest (D10, §6.1). */
const AT_REST_PATHS = ["/today", "/review", "/dev/style/today", "/dev/style/review"];
const DEV_MOTION_ROUTES = ["/dev/style/fx", "/dev/style/fx?program=weave", "/dev/style/glyphs"];
/** Real pages the motion probes visit: only on the rehearsal server, and only when the run includes them. */
const REAL_MOTION_ROUTES = IS_REHEARSAL ? ["/you", "/you/roadmap"].filter((r) => ROUTES.includes(r)) : [];
const MOTION_ROUTES = (() => {
  const all = MOTION === "all";
  const roadmap = all ? ROADMAP_FIXTURE_STATES.map((s) => `/dev/style/roadmap?state=${s}`) : [];
  const you = all ? ["/dev/style/art/you", ...REAL_MOTION_ROUTES] : [];
  return {
    /** still and calm: every roadmap and /you fixture (§11.7 › Still and calm). */
    levels: MOTION === "off" ? [] : [...DEV_MOTION_ROUTES, ...you, ...roadmap],
    /** prefers-contrast: more and forced-colors: active. */
    contrast: MOTION === "off" ? [] : ["/dev/style/fx", "/dev/style/fx?program=weave", ...you, ...roadmap],
    /** The AMBIENT budget is per session: a trip across these plays no more air once spent. */
    trip: all ? ["/dev/style/art/you", "/dev/style/roadmap?state=active", ...REAL_MOTION_ROUTES] : [],
    /** Performance at 4× CPU throttle. */
    perf: MOTION === "off" ? [] : ["/dev/style/fx", ...(all ? ["/dev/style/art/you", "/dev/style/roadmap?state=active", ...REAL_MOTION_ROUTES] : [])],
  };
})();

/**
 * §3.2's budgets the live DOM can scope today, by the classes the surfaces already
 * carry (counted at 344 and 375 with word-count.mjs). Each row counts every visible
 * `each` (or the `within` inside it). The roadmap screens' blocks (intake, draft
 * header, Next card, Now, Start sheet, Activities, the Roadmap tab) and their fold
 * budgets join as R0 and the R lanes name their fixture blocks; RZ gates them all
 * with --budgets hard.
 */
const WORD_BUDGETS = [
  // row 11: every Today aim line, every state (≤ 8 app words).
  { id: "today-aim-line", paths: ["/dev/style/today", "/today"], each: ".rm-aim-line", max: 8 },
  // row 9: the Aim card in every state (≤ 14), the card itself (not its SectionHeader).
  { id: "aim-card", paths: ["/dev/style/art/you"], each: "[data-aim-card]", within: "section.card", max: 14 },
  { id: "aim-card", paths: ["/you"], each: "section.card.rm-ac, section.card.rm-ac-call, section.card.rm-ac-empty", max: 14 },
  // row 10: Today's week quests card (30 active / 34 behind / 30 body: the per-state split waits on R1's fixture names).
  { id: "today-week-quests", paths: ["/dev/style/today", "/today"], each: ".rm-quests-slot:not(:has(.rm-aim-slot))", max: 34 },
  ...roadmapWordBudgets(),
];
/** A route's ?state= (the roadmap fixture page's state), or null. */
const stateOf = (route) => {
  const q = route.split("#")[0].split("?")[1];
  return q ? new URLSearchParams(q).get("state") : null;
};
const budgetsFor = (route) => WORD_BUDGETS.filter((b) => b.paths.includes(pathOf(route)) && (b.state == null || b.state === stateOf(route)));

/**
 * RZ (ui-motion.md §3.2, §11.7): every WORD_BUDGET_ROWS row of src/app/dev/style/roadmap/fixtures.ts (read from its
 * source, as FIXTURE_STATES is) on its own /dev/style/roadmap?state=, by the data-wc-block elements the lanes mark:
 * summed (or each alone for the outline nodes), with the fold of rows 1 and 2 as the words within 600 px below the
 * first block's top (the fixture page's own nav sits above the block; on the real page the block opens main). Row 7
 * adds the Start sheet's title and dates ([role=dialog] h2, .sub), as R6's static count does. A row whose blocks are
 * missing on its own state is a problem under --budgets hard. The real pages get each row's loosest budget, on
 * whichever blocks their state draws (missing blocks are fine there).
 */
function roadmapWordBudgets() {
  let src = "";
  try {
    src = readFileSync(fileURLToPath(new URL("../src/app/dev/style/roadmap/fixtures.ts", import.meta.url)), "utf8");
  } catch {
    console.error("ui-audit: couldn't read WORD_BUDGET_ROWS from src/app/dev/style/roadmap/fixtures.ts; the roadmap word budgets are off");
    return [];
  }
  const blockSrc = /export const WORD_BLOCK = \{([\s\S]*?)\} as const;/.exec(src);
  const BLOCK = Object.fromEntries(blockSrc ? [...blockSrc[1].matchAll(/(\w+): "([\w-]+)"/g)].map((m) => [m[1], m[2]]) : []);
  const rowsSrc = /export const WORD_BUDGET_ROWS[^=]*= \[([\s\S]*?)\n\];/.exec(src);
  const rows = [];
  for (const m of (rowsSrc ? rowsSrc[1] : "").matchAll(/\{ id: "([\w-]+)", row: (\d+), fixture: "([\w-]+)", surface: "(\w+)", blocks: \[([^\]]*)\]((?:, \w+: [\w"]+)*) \}/g)) {
    const extra = Object.fromEntries([...m[6].matchAll(/, (\w+): ([\w"]+)/g)].map((x) => [x[1], x[2]]));
    const blocks = [...m[5].matchAll(/B\.(\w+)/g)].map((x) => BLOCK[x[1]]).filter(Boolean);
    if (blocks.length === 0 || !extra.budget) continue;
    rows.push({ id: m[1], row: Number(m[2]), state: m[3], blocks, each: extra.each === "true", max: Number(extra.budget), fold: extra.fold ? Number(extra.fold) : null });
  }
  // Row 9's ten states are generated (`.map` over their names): the card ≤ 14 in each.
  const aim = /\(\[([^\]]*)\] as const\)\.map\(\s*\(fixture\): WordBudgetRow => \(\{ id: `s9-aim-card-\$\{fixture\}`/.exec(rowsSrc ? rowsSrc[1] : "");
  for (const s of aim ? [...aim[1].matchAll(/"([\w-]+)"/g)].map((x) => x[1]) : []) rows.push({ id: `s9-aim-card-${s}`, row: 9, state: s, blocks: [BLOCK.aimCard ?? "aim-card"], each: false, max: 14, fold: null });
  if (rows.length === 0) console.error("ui-audit: no WORD_BUDGET_ROWS read from fixtures.ts; the roadmap word budgets are off");
  const sheetHead = '[role="dialog"] h2, [role="dialog"] .sub';
  const fixtureRows = rows.map((r) => ({ id: r.id, paths: ["/dev/style/roadmap"], state: r.state, blocks: r.blocks, ...(r.row === 7 ? { extra: sheetHead } : {}), eachBlock: r.each, max: r.max, fold: r.fold, required: true }));
  // The real pages: each row's loosest budget, on the blocks the page's state draws.
  const real = (row, paths, pick = () => true) => {
    const rs = rows.filter((r) => r.row === row && pick(r));
    if (rs.length === 0) return [];
    const byBlocks = new Map();
    for (const r of rs) {
      const k = `${r.blocks.join("+")}|${r.each}`;
      const prev = byBlocks.get(k);
      byBlocks.set(k, { ...r, max: Math.max(prev?.max ?? 0, r.max), fold: r.fold == null ? (prev?.fold ?? null) : Math.max(prev?.fold ?? 0, r.fold) });
    }
    return [...byBlocks.values()].map((r) => ({ id: `s${row}-real-${r.blocks.join("+")}`, paths, blocks: r.blocks, ...(row === 7 ? { extra: sheetHead } : {}), eachBlock: r.each, max: r.max, fold: r.fold, required: false }));
  };
  return [
    ...fixtureRows,
    ...real(1, ["/you/roadmap/new"]),
    ...real(8, ["/you/roadmap/new"], (r) => r.state === "intake-confirm"),
    ...real(8, ["/you/roadmap"], (r) => r.state !== "intake-confirm"),
    ...[2, 3, 4, 5, 6, 7, 12].flatMap((n) => real(n, ["/you/roadmap"])),
  ];
}

// ── The height gates (roadmap-rev4.md Acceptance; see the header) ─────────────
const GATES = {
  /** The width the two height bounds hold at. */
  width: 344,
  /** The ASK card, section.card.rm-ac-call (the card; not its [data-aim-card] box with the SectionHeader). */
  askMaxPx: 410,
  askBounds: "section.card.rm-ac-call",
  /** The ASK states that must be drawn and measured at 344: the tallest two. */
  askRequired: { "/dev/style/art/you": ["empty-ask-continue", "empty-ask-seed-last-aim"] },
  /** Today's aim line, .card.rm-aim-line, border included. */
  aimLineMaxPx: 72,
  /** The aim-line states that must be drawn at every width, and from inC3From sit in the board's c3 under Goals. */
  aimLineRequired: { "/dev/style/today": ["aim-in-place", "aim-in-place-longest"] },
  inC3From: 932,
};

/**
 * The gates' problems for one route × width, from the page's measurements
 * (AUDIT's `ask` and `aimLines`): `ask` [{ key, h }] (h: the card's height),
 * `aimLines` [{ key, h, cut, c3 }] (cut: the text's scrollHeight −
 * clientHeight, null with no .rm-aim-line-t; c3: { inside, columns,
 * underGoals } inside a board's c3, else null). Heights pass to the pixel
 * (≤ bound + 0.5). Pure: `--gate` runs it on given measurements.
 */
function heightGateProblems({ route, width, ask = [], aimLines = [] }) {
  const path = pathOf(route);
  const px = (h) => `${Math.round(h * 10) / 10}px`;
  const out = [];
  if (width === GATES.width) {
    for (const a of ask) if (!(a.h <= GATES.askMaxPx + 0.5)) out.push(`ASK card ${a.key} is ${px(a.h)} tall (≤ ${GATES.askMaxPx} at ${GATES.width})`);
    for (const k of GATES.askRequired[path] ?? []) if (!ask.some((a) => a.key === k)) out.push(`ASK card ${k} not drawn at ${GATES.width}`);
    for (const l of aimLines) if (!(l.h <= GATES.aimLineMaxPx + 0.5)) out.push(`aim line ${l.key} is ${px(l.h)} tall (≤ ${GATES.aimLineMaxPx} at ${GATES.width})`);
  }
  for (const l of aimLines) {
    if (typeof l.cut !== "number") out.push(`aim line ${l.key} has no .rm-aim-line-t`);
    else if (l.cut > 1) out.push(`aim line ${l.key} clamps its text (${l.cut}px cut)`);
  }
  const required = GATES.aimLineRequired[path] ?? [];
  for (const k of required) if (!aimLines.some((l) => l.key === k)) out.push(`aim line ${k} not drawn`);
  if (width >= GATES.inC3From) {
    for (const l of aimLines) if (required.includes(l.key) && !(l.c3 && l.c3.inside && l.c3.columns && l.c3.underGoals)) out.push(`aim line ${l.key} is not in the board's c3 under Goals (${JSON.stringify(l.c3)})`);
  }
  return out;
}

// --gate '<json>': the gates on given measurements (the contract check's cases), printed as JSON; no server, no Chrome.
if (args.includes("--gate")) {
  let input;
  try {
    input = JSON.parse(opt("gate", ""));
  } catch {
    console.error("ui-audit: --gate takes one JSON object {route, width, ask, aimLines}");
    process.exit(2);
  }
  console.log(JSON.stringify({ problems: heightGateProblems(input), widths: widthsFor(input.route ?? "/") }));
  process.exit(0);
}
const JSON_OUT = opt("json", null);
const CHROME = opt("chrome", process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe");
const AT_REST_ROUTES = ["/today", "/review"];
/** The reduced-motion gate's page: /today on the rehearsal server, else a fixture page (same root layout). */
const MOTION_ROUTE = IS_REHEARSAL ? "/today" : "/dev/style";

// The rehearsal-only guard runs before anything else, --plan included.
// A route is a path on BASE. Git Bash rewrites a bare "/today" argument to "C:/Program Files/Git/today",
// which would slip past the guard below and audit a 404: refuse anything that isn't a path.
const notPaths = ROUTES.filter((r) => !r.startsWith("/"));
if (notPaths.length) {
  console.error(
    `ui-audit: refused ${notPaths.join(", ")}: a route is a path starting with "/". ` +
      `In Git Bash, set MSYS_NO_PATHCONV=1 (it rewrites "/today" into a Windows path).`
  );
  process.exit(2);
}
const refused = IS_REHEARSAL ? [] : ROUTES.filter((r) => REHEARSAL_ONLY.includes(pathOf(r)));
if (refused.length) {
  console.error(
    `ui-audit: refused ${refused.join(", ")} against ${BASE}. These pages read your rows and their render may write ` +
      `(the life chain, a week quest freeze): audit them only on the rehearsal server (--base ${REHEARSAL_BASES[0]}: ` +
      `local database, XTNL_LIFE_JUDGE=1). For the fixture pages alone: --routes fixtures.`
  );
  process.exit(2);
}
if (args.includes("--plan")) {
  console.log(
    JSON.stringify({
      base: BASE,
      rehearsal: IS_REHEARSAL,
      motionRoute: MOTION_ROUTE,
      roadmapStatesFrom: ROADMAP_STATES_FROM,
      routes: ROUTES,
      widths: WIDTHS,
      extraWidths: Object.fromEntries(ROUTES.map((r) => [r, widthsFor(r).filter((w) => !WIDTHS.includes(w))]).filter(([, w]) => w.length > 0)),
      gates: GATES,
      budgets: BUDGETS,
      wordBudgets: WORD_BUDGETS,
      motion: MOTION,
      gl: GL,
      motionRoutes: MOTION_ROUTES,
    })
  );
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "xtnl-ui-audit-"));
const PORT = 9400 + Math.floor(Math.random() * 400);
// SwiftShader GL so the shader probes get a WebGL context headless (software; layout is unchanged). --no-gl: the old --disable-gpu.
const GL_FLAGS = GL ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--disable-gpu"];
const chrome = spawn(CHROME, ["--headless=new", ...GL_FLAGS, "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdio: "ignore" });

let list;
for (let i = 0; i < 80; i++) {
  try {
    list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    if (list.find((t) => t.type === "page")) break;
  } catch {
    /* not up yet */
  }
  await sleep(250);
}
const target = list?.find((t) => t.type === "page");
if (!target) {
  console.error("ui-audit: Chrome did not start (set CHROME or --chrome)");
  chrome.kill();
  process.exit(2);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let seq = 0;
const pending = new Map();
const waiters = [];
const events = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) p.rej(new Error(JSON.stringify(m.error)));
    else p.res(m.result);
  } else if (m.method) {
    events.push(m);
    for (const w of [...waiters]) if (w.method === m.method) {
      waiters.splice(waiters.indexOf(w), 1);
      w.res(m.params);
    }
  }
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const once = (method) => new Promise((res) => waiters.push({ method, res }));
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: "requestAnimationFrame(function(){window.__firstMotion=document.documentElement.getAttribute('data-motion')})",
});

const AUDIT = `(() => {
  // ui-motion: GlyphButton (44; WeavePause is its 40 px size) and RouteRail rows are 44 px targets (§11.7).
  const PRIMARY = '.btn-primary, .tick, .tab-plus, [data-primary], .mg-gb:not(.mg-gb-40), .mg-rr-d > summary';
  const INTERACTIVE = 'a[href],button,input,select,textarea,[role=switch],[role=checkbox],[role=tab],.mg-rr-d > summary';
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden],[aria-hidden="true"],.sr-only');
  };
  // On screen, whether or not a screen reader hears it (aria-hidden compact figures and chip labels are seen).
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden],.sr-only');
  };
  const GLYPH_LAYER = '.mg, [class^="mg-"], [class*=" mg-"]';
  const out = { overflow: document.documentElement.scrollWidth - innerWidth, small: [], tiny: [], loops: [], spill: [], zoomInputs: [], svgText: [], overField: [], overlaps: [], chipLines: [], rmCols: [] };
  const label = (el) => (typeof el.className === 'string' && el.className ? el.tagName + '.' + el.className.trim().split(/\\s+/).join('.') : el.tagName);
  // ui-motion: no composite or slot carries SVG text (all text is HTML, so no viewBox shrinks it).
  document.querySelectorAll('svg.mg text, .shd text, svg[class^="mg-"] text, svg[class*=" mg-"] text, [class^="mg-"] svg text, [class*=" mg-"] svg text').forEach((t) => {
    if (!t.closest('[hidden]')) out.svgText.push(label(t.closest('svg').parentElement || t) + ' "' + (t.textContent || '').trim().slice(0, 16) + '"');
  });
  const fields = [...document.querySelectorAll('.shd')].filter(seen).map((s) => [s, s.getBoundingClientRect()]);
  document.querySelectorAll(INTERACTIVE).forEach((el) => {
    if (!vis(el) || el.closest('.skip-link') || el.classList.contains('skip-link')) return;
    let { width: w, height: h } = el.getBoundingClientRect();
    const hit = el.closest('.switch-hit, .price, .tick');
    if (hit) { const q = hit.getBoundingClientRect(); w = Math.max(w, q.width); h = Math.max(h, q.height); }
    const min = el.matches(PRIMARY) ? 44 : 40;
    if (w < min - 0.5 || h < min - 0.5) out.small.push((el.className && el.className.baseVal === undefined ? el.className : el.tagName) + ' "' + (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24) + '" ' + Math.round(w) + 'x' + Math.round(h) + ' (min ' + min + ')');
  });
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  const clipsX = (el) => { const o = getComputedStyle(el).overflowX; return o === 'hidden' || o === 'clip' || o === 'auto' || o === 'scroll'; };
  while ((n = tw.nextNode())) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (el && !el.closest('svg') && seen(el)) {
      // ui-motion: visible text inside the glyph layer keeps the 12 px floor even when aria-hidden (its sr twin is elsewhere).
      if (!vis(el) && el.closest(GLYPH_LAYER)) {
        const gfs = parseFloat(getComputedStyle(el).fontSize);
        if (gfs < 12) out.tiny.push(label(el) + ' "' + n.textContent.trim().slice(0, 20) + '" ' + gfs + 'px (aria-hidden, on screen)');
      }
      // ui-motion: no text sits over a shader slot (§6.1).
      if (fields.length && !el.closest('.shd')) {
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const tr of range.getClientRects()) {
          const hit = fields.find(([, f]) => Math.min(tr.right, f.right) - Math.max(tr.left, f.left) > 1 && Math.min(tr.bottom, f.bottom) - Math.max(tr.top, f.top) > 1);
          if (hit) { out.overField.push(label(el) + ' "' + n.textContent.trim().slice(0, 24) + '" over ' + label(hit[0])); break; }
        }
      }
    }
    if (!el || !vis(el)) continue;
    const svg = el.closest('svg');
    if (svg) {
      // SVG text: its font size is in user units; the rendered size scales with the drawing.
      const t = el.closest('text');
      const m = t && t.getScreenCTM ? t.getScreenCTM() : null;
      if (!t || !m) continue;
      const px = parseFloat(getComputedStyle(t).fontSize) * Math.hypot(m.a, m.b);
      if (px < 11.95) out.tiny.push('svg ' + label(svg) + ' "' + n.textContent.trim().slice(0, 20) + '" ' + px.toFixed(1) + 'px');
      continue;
    }
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) out.tiny.push(label(el) + ' "' + n.textContent.trim().slice(0, 20) + '" ' + fs + 'px');
    // Spill: the text's own box runs past the card it sits in, and nothing between clips it on purpose.
    const card = el.closest('.card, .toast, .seal-card, .sheet');
    if (card) {
      let clipped = false;
      for (let a = el; a && a !== card; a = a.parentElement) if (clipsX(a)) { clipped = true; break; }
      if (!clipped && !clipsX(card)) {
        const range = document.createRange();
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        if (r.width > 0 && (r.right > c.right + 1 || r.left < c.left - 1)) out.spill.push(label(el) + ' "' + n.textContent.trim().slice(0, 32) + '" ' + Math.round(Math.max(r.right - c.right, c.left - r.left)) + 'px past ' + label(card));
      }
    }
  }
  if (innerWidth < 600) {
    document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]),select,textarea').forEach((el) => {
      if (!vis(el)) return;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16) out.zoomInputs.push(label(el) + ' ' + fs + 'px');
    });
  }
  for (const a of document.getAnimations()) {
    const t = a.effect && a.effect.getTiming();
    if (t && t.iterations === Infinity && a.playState === 'running') out.loops.push(a.animationName || a.id || 'anonymous');
  }
  // ui-motion (D31): at 344 and 375 no two interactive rects intersect (each 40 px box is its own; the chrome aside).
  if (innerWidth < 600) {
    const CHROME = '.topbar, .tabbar, .rail, .sidebar, .toast, .dock, .skip-link';
    const els = [...document.querySelectorAll(INTERACTIVE)].filter((el) => vis(el) && !el.closest(CHROME) && getComputedStyle(el).pointerEvents !== 'none');
    const rects = els.map((el) => el.getBoundingClientRect());
    const name = (el) => label(el) + ' "' + (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 18) + '"';
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
        const a = rects[i];
        const b = rects[j];
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 1 && h > 1) out.overlaps.push(name(els[i]) + ' × ' + name(els[j]) + ' ' + Math.round(w) + 'x' + Math.round(h));
      }
    }
  }
  // ui-motion (§7, §11.7): from 932, chips stay on one line and .rm-cols is two columns once main is ≥ 760 px.
  if (innerWidth >= 932) {
    document.querySelectorAll('.mg-hc-l').forEach((el) => {
      if (!seen(el) || el.closest('.gxl-frame')) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
      if (tops.size > 1) out.chipLines.push('"' + el.textContent.trim().slice(0, 32) + '" on ' + tops.size + ' lines');
    });
    document.querySelectorAll('.rm-cols').forEach((el) => {
      if (!seen(el)) return;
      const main = el.closest('main');
      if (main) {
        const mcs = getComputedStyle(main);
        if (main.clientWidth - parseFloat(mcs.paddingLeft) - parseFloat(mcs.paddingRight) < 760) return;
      }
      const cs = getComputedStyle(el);
      const cols = cs.display === 'grid' ? cs.gridTemplateColumns.split(' ').filter(Boolean).length : 1;
      if (cols < 2) out.rmCols.push(label(el) + ' is ' + cs.display + ', ' + cols + ' column');
    });
  }
  // Recorded, not gated: each Aim card's height (F19) and Today's week quests slot (F17).
  out.heights = {};
  document.querySelectorAll('[data-aim-card]').forEach((el) => {
    if (vis(el)) out.heights['aim:' + el.getAttribute('data-aim-card')] = Math.round(el.getBoundingClientRect().height);
  });
  let nth = 0;
  document.querySelectorAll('.rm-ac, .rm-ac-empty').forEach((el) => {
    if (!vis(el) || el.closest('[data-aim-card]')) return;
    out.heights['aim' + (nth++ ? ':' + nth : '')] = Math.round(el.getBoundingClientRect().height);
  });
  document.querySelectorAll('.rm-quests-slot').forEach((el, i) => {
    if (vis(el)) out.heights['today-quests' + (i ? ':' + (i + 1) : '')] = Math.round(el.getBoundingClientRect().height);
  });
  // Gated (heightGateProblems): the ASK card (the card, section.rm-ac-call) and every visible Today aim line.
  out.ask = [];
  let askN = 0;
  document.querySelectorAll('section.rm-ac-call').forEach((el) => {
    if (!vis(el)) return;
    const box = el.closest('[data-aim-card]');
    out.ask.push({ key: box ? box.getAttribute('data-aim-card') : 'ask' + (askN++ ? ':' + askN : ''), h: el.getBoundingClientRect().height });
  });
  out.aimLines = [];
  let lineN = 0;
  document.querySelectorAll('.rm-aim-line').forEach((el) => {
    if (!vis(el)) return;
    const st = el.closest('[data-state^="aim-"]');
    const r = el.getBoundingClientRect();
    const t = el.querySelector('.rm-aim-line-t');
    const c3 = el.closest('.board > .c3');
    let c3m = null;
    if (c3) {
      const cr = c3.getBoundingClientRect();
      const br = c3.parentElement.getBoundingClientRect();
      const goals = c3.querySelector('.today-goals');
      const sr = (el.closest('.rm-quests-slot') || el).getBoundingClientRect();
      c3m = { inside: r.left >= cr.left - 1 && r.right <= cr.right + 1, columns: cr.width < br.width - 1, underGoals: !!goals && vis(goals) && sr.top >= goals.getBoundingClientRect().bottom - 1 };
    }
    out.aimLines.push({ key: st ? st.getAttribute('data-state') : 'aim-line' + (lineN++ ? ':' + lineN : ''), h: r.height, cut: t ? t.scrollHeight - t.clientHeight : null, c3: c3m });
  });
  out.small = [...new Set(out.small)].slice(0, 30);
  out.tiny = [...new Set(out.tiny)].slice(0, 30);
  out.spill = [...new Set(out.spill)].slice(0, 30);
  out.zoomInputs = [...new Set(out.zoomInputs)].slice(0, 30);
  for (const k of ['svgText', 'overField', 'overlaps', 'chipLines', 'rmCols']) out[k] = [...new Set(out[k])].slice(0, 30);
  return out;
})()`;

/**
 * App words in the live DOM (§3.1, scripts/word-count.mjs): main, its fold (the first
 * 600 px of main below the top bar), and each WORD_BUDGETS row's elements.
 */
const wordsScript = (budgets) => `(() => {
  ${classifyRuns.toString()}
  ${countDomAppWords.toString()}
  const rules = ${JSON.stringify(wordRules())};
  window.scrollTo(0, 0);
  const main = document.querySelector('main') || document.body;
  const bar = document.querySelector('.topbar');
  const top = Math.max(main.getBoundingClientRect().top, bar ? bar.getBoundingClientRect().bottom : 0);
  const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]'); };
  const items = [];
  for (const b of ${JSON.stringify(budgets)}) {
    if (b.blocks) {
      // RZ: a §3.2 row by its data-wc-block elements (summed, or each alone), and its fold below the first block's top.
      const sel = b.blocks.map((n) => '[data-wc-block="' + n + '"]').join(', ');
      const found = [...document.querySelectorAll(sel)].filter(shown);
      const outerB = found.filter((el) => !found.some((o) => o !== el && o.contains(el)));
      if (outerB.length === 0) {
        if (b.required) items.push({ id: b.id, key: b.id, count: null, max: b.max, missing: b.blocks.join(' + '), words: [] });
        continue;
      }
      const extraEls = b.extra ? [...document.querySelectorAll(b.extra)].filter(shown) : [];
      const firstTop = Math.min(...outerB.map((el) => el.getBoundingClientRect().top));
      const counted = outerB.map((el) => countDomAppWords(el, rules, {}));
      if (b.eachBlock) {
        counted.forEach((c, i) => items.push({ id: b.id, key: b.id + ':' + (i + 1), count: c.count, max: b.max, words: c.words.slice(0, 30) }));
        continue;
      }
      const all = [...counted, ...extraEls.map((el) => countDomAppWords(el, rules, {}))];
      const item = { id: b.id, key: b.id, count: all.reduce((s, c) => s + c.count, 0), max: b.max, words: all.flatMap((c) => c.words).slice(0, 30) };
      if (b.fold != null) {
        item.fold = outerB.reduce((s, el) => s + countDomAppWords(el, rules, { foldBottom: firstTop + 600 }).count, 0);
        item.foldMax = b.fold;
      }
      items.push(item);
      continue;
    }
    const els = [...document.querySelectorAll(b.each)].filter(shown);
    const outer = els.filter((el) => !els.some((o) => o !== el && o.contains(el)));
    outer.forEach((el, i) => {
      const root = (b.within && el.querySelector(b.within)) || el;
      const st = el.getAttribute('data-aim-card') || (el.closest('[data-state]') && el.closest('[data-state]').getAttribute('data-state'));
      const c = countDomAppWords(root, rules, {});
      items.push({ id: b.id, key: st || b.id + ':' + (i + 1), count: c.count, max: b.max, words: c.words.slice(0, 30) });
    });
  }
  return { main: countDomAppWords(main, rules, {}).count, fold: countDomAppWords(main, rules, { foldBottom: top + 600 }).count, items };
})()`;

// Shader state, read in the page (window.__xtnlShader is the runtime's debug hook, §6.8).
const F = "(window.__xtnlShader ? window.__xtnlShader.frames : 0)";
const RUNNING = "(window.__xtnlShader ? window.__xtnlShader.running() : [])";
const CANVASES = "document.querySelectorAll('.shd canvas').length";
/** The runtime chunk is loaded: its debug hook exists (the motion probes set __XTNL_SHD_FORCE, so it does on any route), or a dev chunk name says so. */
const RUNTIME_LOADED = "(typeof window.__xtnlShader !== 'undefined' || performance.getEntriesByType('resource').some((e) => /lib[_/]shader[_/]runtime|shader[_/]runtime|src_lib_shader/i.test(e.name)))";

const results = [];
let failures = 0;

/** The console errors and uncaught exceptions among CDP events. */
const errorsIn = (list) =>
  list
    .filter(
      (e) =>
        e.method === "Runtime.exceptionThrown" ||
        (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") ||
        (e.method === "Log.entryAdded" && e.params.entry.level === "error")
    )
    .map((e) =>
      e.method === "Runtime.exceptionThrown"
        ? e.params.exceptionDetails.exception?.description?.split("\n")[0] || e.params.exceptionDetails.text
        : e.method === "Log.entryAdded"
          ? `${e.params.entry.text} ${e.params.entry.url || ""}`
          : e.params.args.map((a) => a.value ?? a.description).join(" ")
    );

/** Emulated media: reduced motion, high contrast and forced colours (each reset when not asked for). */
const mediaFeatures = ({ reduced = false, contrast = false, forced = false } = {}) => [
  { name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" },
  { name: "prefers-contrast", value: contrast ? "more" : "no-preference" },
  { name: "forced-colors", value: forced ? "active" : "none" },
];

const navigate = async (url, timeout = 15000) => {
  const loaded = once("Page.loadEventFired");
  await send("Page.navigate", { url });
  await Promise.race([loaded, sleep(timeout)]);
};

/**
 * Load `url` fresh (through about:blank). `fresh` first clears this tab's
 * sessionStorage on the app's origin (the shader's AMBIENT budget and the WAIT
 * pause live there; it survives navigation within the tab).
 */
async function visit(url, { width, reduced = false, contrast = false, forced = false, dpr = 1, settle = 900, fresh = false }) {
  await send("Emulation.setDeviceMetricsOverride", { width, height: width < 600 ? 812 : 900, deviceScaleFactor: dpr, mobile: width < 600 });
  await send("Emulation.setEmulatedMedia", { features: mediaFeatures({ reduced, contrast, forced }) });
  if (fresh) {
    await navigate(`${BASE}/dev/style`);
    await evaluate("(() => { try { sessionStorage.clear(); } catch (e) {} return true; })()").catch(() => null);
  }
  await navigate("about:blank", 5000);
  events.length = 0;
  await navigate(url);
  await sleep(settle);
  return { errors: errorsIn(events) };
}

// Motion gate: the first frame under prefers-reduced-motion is Still.
{
  await visit(`${BASE}${MOTION_ROUTE}`, { width: 375, reduced: true });
  const first = await evaluate("window.__firstMotion");
  const ok = first === "still";
  if (!ok) failures++;
  results.push({ route: MOTION_ROUTE, width: 375, check: "reduced motion first frame", ok, detail: first });
  console.log(`${ok ? "PASS" : "FAIL"} reduced-motion first frame is still (${first}, ${MOTION_ROUTE})`);
}

for (const route of ROUTES) {
  for (const [wi, width] of widthsFor(route).entries()) {
    const { errors } = await visit(`${BASE}${route}`, { width });
    let r;
    try {
      r = await evaluate(AUDIT);
    } catch (e) {
      r = { overflow: 0, small: [], tiny: [], loops: [], spill: [], zoomInputs: [], svgText: [], overField: [], overlaps: [], chipLines: [], rmCols: [], heights: {}, ask: [], aimLines: [], evalError: String(e) };
    }
    const gated = heightGateProblems({ route, width, ask: r.ask, aimLines: r.aimLines });
    const path = route.split("?")[0];
    const loopsBad = AT_REST_ROUTES.includes(path) && !route.includes("?") ? r.loops : [];
    const problems = [];
    if (r.overflow > 0) problems.push(`overflow ${r.overflow}px`);
    if (r.spill.length) problems.push(`${r.spill.length} texts spill past their card`);
    if (r.small.length) problems.push(`${r.small.length} small targets`);
    if (r.tiny.length) problems.push(`${r.tiny.length} tiny texts`);
    if (r.zoomInputs.length) problems.push(`${r.zoomInputs.length} inputs under 16 px on a phone`);
    if (errors.length) problems.push(`${errors.length} console errors`);
    if (loopsBad.length) problems.push(`infinite animations at rest: ${loopsBad.join(", ")}`);
    if (r.evalError) problems.push(r.evalError);
    problems.push(...gated);
    // ui-motion (§11.7)
    if (r.svgText.length) problems.push(`SVG text in a composite or slot: ${r.svgText.slice(0, 3).join(", ")}`);
    if (r.overField.length) problems.push(`${r.overField.length} texts over a shader slot`);
    if (r.overlaps.length) problems.push(`${r.overlaps.length} intersecting targets`);
    if (r.chipLines.length && path !== "/dev/style/glyphs") problems.push(`${r.chipLines.length} chip labels wrap`);
    if (r.rmCols.length) problems.push(`.rm-cols is not two columns: ${r.rmCols.join(", ")}`);
    if (AT_REST_PATHS.includes(pathOf(route)) && wi === 0) {
      // At rest (D10): no canvas, no running loop, no frames drawn.
      try {
        const a = await evaluate(`({ canvas: document.querySelectorAll('canvas').length, running: document.documentElement.hasAttribute('data-shader-running'), live: ${RUNNING}.length, f: ${F} })`);
        await sleep(1000);
        const f2 = await evaluate(F);
        if (a.canvas || a.running || a.live || f2 !== a.f) problems.push(`shader at rest: ${JSON.stringify({ ...a, f2 })}`);
      } catch (e) {
        problems.push(`shader at rest: ${String(e).slice(0, 120)}`);
      }
    }
    let words = null;
    if (width < 600) {
      try {
        words = await evaluate(wordsScript(budgetsFor(route)));
      } catch (e) {
        words = { error: String(e).slice(0, 160) };
      }
      const over = (words?.items ?? []).filter((it) => it.count > it.max);
      if (BUDGETS === "hard") for (const it of over) problems.push(`${it.id} ${it.key}: ${it.count} app words (≤ ${it.max})`);
      // RZ: the roadmap rows' folds, and a row whose blocks its own fixture state doesn't draw.
      const foldOver = (words?.items ?? []).filter((it) => it.foldMax != null && it.fold > it.foldMax);
      const missing = (words?.items ?? []).filter((it) => it.missing);
      if (BUDGETS === "hard") for (const it of foldOver) problems.push(`${it.id} fold: ${it.fold} app words (≤ ${it.foldMax})`);
      if (BUDGETS === "hard") for (const it of missing) problems.push(`${it.id}: no [data-wc-block] ${it.missing} drawn`);
      if (words?.error) problems.push(`word count: ${words.error}`);
    }
    r.words = words;
    const ok = problems.length === 0;
    if (!ok) failures++;
    results.push({ route, width, ok, ...r, errors, problems });
    console.log(`${ok ? "PASS" : "FAIL"} ${route} @${width}${ok ? "" : ` — ${problems.join("; ")}`}`);
    const heights = Object.entries(r.heights ?? {});
    if (heights.length) console.log(`      heights: ${heights.map(([k, h]) => `${k} ${h}px`).join(", ")}`);
    const measured = [...(r.ask ?? []).map((a) => `ASK ${a.key} ${Math.round(a.h)}px`), ...(r.aimLines ?? []).map((l) => `${l.key} ${Math.round(l.h)}px${typeof l.cut === "number" && l.cut > 1 ? ` (${l.cut}px cut)` : ""}`)];
    if (measured.length) console.log(`      gated: ${measured.join(", ")}`);
    for (const [k, h] of heights) if (k.startsWith("aim") && width < 600 && h > 470) console.log(`      NOTE: ${k} is ${h}px tall at ${width} (F19: about 400, at most about 470)`);
    if (words && !words.error) {
      console.log(`      words: main ${words.main} · fold ${words.fold}`);
      for (const it of words.items) if (it.count > it.max) console.log(`      ${BUDGETS === "hard" ? "over" : "over (report)"}: ${it.id} ${it.key} ${it.count} > ${it.max}: ${it.words.join(" ")}`);
      for (const it of words.items) if (it.foldMax != null && it.fold > it.foldMax) console.log(`      ${BUDGETS === "hard" ? "over" : "over (report)"}: ${it.id} fold ${it.fold} > ${it.foldMax}`);
      for (const it of words.items) if (it.missing) console.log(`      ${BUDGETS === "hard" ? "missing" : "missing (report)"}: ${it.id} draws no [data-wc-block] ${it.missing}`);
    }
    if (!ok) {
      for (const s of r.spill.slice(0, 6)) console.log(`      spill: ${s}`);
      for (const s of r.small.slice(0, 6)) console.log(`      small: ${s}`);
      for (const t of r.tiny.slice(0, 6)) console.log(`      tiny:  ${t}`);
      for (const z of r.zoomInputs.slice(0, 6)) console.log(`      input: ${z}`);
      for (const o of r.overlaps.slice(0, 6)) console.log(`      overlap: ${o}`);
      for (const o of r.overField.slice(0, 4)) console.log(`      over a slot: ${o}`);
      for (const c of r.chipLines.slice(0, 4)) console.log(`      chip: ${c}`);
      for (const e of errors.slice(0, 4)) console.log(`      error: ${e}`);
    }
  }
}

// ── ui-motion probes (docs/life-plan/ui-motion.md §11.7; lane M0c) ───────────
/** Scripts injected before any page script (Page.addScriptToEvaluateOnNewDocument). */
const INIT = {
  /** The runtime drops failIfMajorPerformanceCaveat (SwiftShader) and keeps its debug hook on any route (§6.8). */
  force: "window.__XTNL_SHD_FORCE = true;",
  /** No WebGL: getContext('webgl') returns null. */
  noGl: "(() => { const gc = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, o) { return t === 'webgl' || t === 'experimental-webgl' || t === 'webgl2' ? null : gc.call(this, t, o); }; })();",
  /** Every animate() call with its keyframes and timing (installed before the gallery's own recorder wraps it). */
  calls: `(() => {
    const P = Element.prototype;
    const orig = P.animate;
    const log = [];
    window.__xtnlAuditCalls = log;
    P.animate = function (frames, opts) {
      try {
        const list = Array.isArray(frames) ? frames : frames ? [frames] : [];
        const o = typeof opts === 'number' ? { duration: opts } : opts || {};
        const kf = list.map((f) => {
          const c = {};
          for (const k of Object.keys(f)) {
            if (k === 'offset' || k === 'easing' || k === 'composite') continue;
            c[k] = Array.isArray(f[k]) ? f[k].map(String) : [String(f[k])];
          }
          return c;
        });
        const cls = (this.getAttribute && this.getAttribute('class')) || '';
        log.push({ kf, duration: typeof o.duration === 'number' ? o.duration : 0, delay: typeof o.delay === 'number' ? o.delay : 0, fill: o.fill || 'auto', iterations: o.iterations == null ? 1 : Number.isFinite(o.iterations) ? o.iterations : String(o.iterations), mote: /(^|\\s)fx-mote(\\s|$)/.test(cls), cls: cls.slice(0, 60) });
      } catch (e) {}
      return orig.call(this, frames, opts);
    };
  })();`,
  /** Long tasks, layout shifts, the LCP entry, event timings, the first webgl getContext and the first data-live. */
  perf: `(() => {
    const P = (window.__auditPerf = { lt: [], ls: [], lcp: null, ev: [], gc: null, live: null });
    const obs = (type, fn, extra) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe(Object.assign({ type, buffered: true }, extra || {})); } catch (e) {} };
    obs('longtask', (e) => P.lt.push([e.startTime, e.duration]));
    obs('layout-shift', (e) => P.ls.push({ v: e.value, input: e.hadRecentInput, slot: (e.sources || []).some((s) => { const n = s.node && (s.node.nodeType === 1 ? s.node : s.node.parentElement); return !!(n && n.closest && n.closest('.shd')); }) }));
    obs('largest-contentful-paint', (e) => { P.lcp = { url: e.url || '', tag: e.element ? e.element.tagName : null, text: e.element ? (e.element.textContent || '').trim().slice(0, 40) : '' }; });
    obs('event', (e) => { if (e.interactionId) P.ev.push(Math.round(e.duration)); }, { durationThreshold: 16 });
    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, o) { if ((t === 'webgl' || t === 'experimental-webgl') && P.gc == null) P.gc = performance.now(); return gc.call(this, t, o); };
    new MutationObserver((ms) => { for (const m of ms) if (P.live == null && m.target.hasAttribute && m.target.hasAttribute('data-live')) P.live = performance.now(); }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-live'] });
  })();`,
};

async function withInit(sources, fn) {
  const ids = [];
  for (const source of sources) ids.push((await send("Page.addScriptToEvaluateOnNewDocument", { source })).identifier);
  try {
    return await fn();
  } finally {
    for (const identifier of ids) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier }).catch(() => null);
  }
}

async function waitFor(expr, timeout = 8000, every = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await evaluate(expr).catch(() => null);
    if (v) return v;
    await sleep(every);
  }
  return null;
}

/** The saved prefs (localStorage 'xtnl:prefs', read by the pre-paint script): calm for the calm probes, cleared after. */
async function setPrefs(prefs) {
  await navigate(`${BASE}/dev/style`);
  const write = prefs ? `localStorage.setItem('xtnl:prefs', ${JSON.stringify(JSON.stringify(prefs))})` : "localStorage.removeItem('xtnl:prefs')";
  await evaluate(`(() => { try { ${write}; } catch (e) {} return true; })()`).catch(() => null);
}

const intoView = (sel) => evaluate(`(() => { const s = document.querySelector(${JSON.stringify(sel)}); if (!s) return false; s.scrollIntoView({ block: 'center' }); return true; })()`);
const statusLine = () => evaluate("(window.__xtnlShader ? JSON.stringify(window.__xtnlShader.status()) : 'runtime not loaded')").catch(() => "status unreadable");

let skipped = 0;
async function probe(check, route, fn) {
  let r;
  try {
    r = await fn();
  } catch (e) {
    r = { ok: false, detail: `probe error: ${String(e?.message ?? e).split("\n")[0].slice(0, 200)}` };
  }
  const status = r.skip ? "SKIP" : r.ok ? "PASS" : "FAIL";
  if (status === "FAIL") failures++;
  if (status === "SKIP") skipped++;
  results.push({ route, width: r.width ?? 344, check, ok: status !== "FAIL", skipped: status === "SKIP", detail: r.detail ?? "" });
  console.log(`${status} [motion] ${check} · ${route}${r.detail ? ` — ${r.detail}` : ""}`);
}
const noGl = () => ({ skip: true, detail: "--no-gl" });

/** §4.7's SEEN motions: in view at hydration they play their accent only, which never hides, zeroes or un-draws a part. */
const SEEN_MOTIONS = ["build", "reach", "rank-rise", "quest-done", "meter-fill", "horizon-front", "seal-reached", "kindle"];

async function motionProbes() {
  console.log(`\n— ui-motion probes (--motion ${MOTION}${GL ? "" : ", --no-gl"}) —`);
  const FX = "/dev/style/fx";
  const WEAVE = "/dev/style/fx?program=weave";

  await withInit([INIT.force], async () => {
    // ── still and calm: no canvas, no runtime chunk, every slot on its SVG ──
    for (const level of ["still", "calm"]) {
      await setPrefs(level === "calm" ? { motion: "calm" } : null);
      for (const route of MOTION_ROUTES.levels) {
        await probe(`${level}: no canvas, no runtime chunk, every slot on its SVG, ${level === "still" ? "no animation after 2 s" : "nothing loops"}`, route, async () => {
          const { errors } = await visit(`${BASE}${route}`, { width: 344, reduced: level === "still", settle: 2000 });
          const r = await evaluate(`(() => ({
            motion: document.documentElement.getAttribute('data-motion'),
            canvas: document.querySelectorAll('canvas').length,
            runtime: ${RUNTIME_LOADED},
            slots: document.querySelectorAll('.shd').length,
            off: [...document.querySelectorAll('.shd')].filter((s) => s.getAttribute('data-shd-state') !== 'fallback').length,
            anims: document.getAnimations().map((a) => a.animationName || (a.effect && a.effect.target && a.effect.target.getAttribute && a.effect.target.getAttribute('class')) || 'anonymous').slice(0, 6),
            loops: document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getTiming().iterations > 1).map((a) => a.animationName || 'anonymous').slice(0, 6),
          }))()`);
          const bad = [];
          if (r.motion !== level) bad.push(`data-motion is ${r.motion}`);
          if (r.canvas) bad.push(`${r.canvas} canvas`);
          if (r.runtime) bad.push("the shader runtime loaded");
          if (r.off) bad.push(`${r.off} slot(s) not on their SVG`);
          if (level === "still" && r.anims.length) bad.push(`animations: ${r.anims.join(", ")}`);
          if (level === "calm" && r.loops.length) bad.push(`loops: ${r.loops.join(", ")}`);
          if (errors.length) bad.push(`console error: ${errors[0]}`);
          return { ok: bad.length === 0, detail: bad.join("; ") || `${r.slots} slot(s)` };
        });
      }
    }
    await setPrefs(null);

    // ── high contrast and forced colours: no canvas, the band keeps its hairline and path ──
    for (const [name, media] of [
      ["prefers-contrast: more", { contrast: true }],
      ["forced-colors: active", { forced: true }],
    ]) {
      for (const route of MOTION_ROUTES.contrast) {
        await probe(`${name}: no canvas or runtime, frames flat, every horizon band keeps its hairline and path`, route, async () => {
          const { errors } = await visit(`${BASE}${route}`, { width: 344, ...media, settle: 1500 });
          const f0 = await evaluate(F);
          await sleep(1000);
          const r = await evaluate(`(() => {
            const on = (el, box) => {
              if (!el) return false;
              const cs = getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden') return false;
              if (!box) return cs.stroke !== 'none';
              const b = el.getBoundingClientRect();
              return b.width > 0 && b.height > 0;
            };
            const bands = [...document.querySelectorAll('.shd-horizon')];
            return {
              canvas: document.querySelectorAll('canvas').length,
              runtime: ${RUNTIME_LOADED},
              f: ${F},
              bands: bands.length,
              empty: bands.filter((s) => { const m = s.querySelector('.shd-marks'); return !on(m, true) || !on(m && m.querySelector('.shd-hair')) || !on(m && m.querySelector('.shd-path')); }).length,
            };
          })()`);
          const bad = [];
          if (r.canvas) bad.push(`${r.canvas} canvas`);
          if (r.runtime) bad.push("the shader runtime loaded");
          if (r.f !== f0) bad.push(`frames rose ${f0} → ${r.f}`);
          if (r.empty) bad.push(`${r.empty} band(s) lost the hairline or the path`);
          if (errors.length) bad.push(`console error: ${errors[0]}`);
          return { ok: bad.length === 0, detail: bad.join("; ") || `${r.bands} band(s)` };
        });
      }
    }

    // ── full: the horizon air (AMBIENT, D16) ──
    await probe("full: the air starts after a quiet window, runs ≤ 5 s of visible time, then the slot is SVG again with no canvas", FX, async () => {
      if (!GL) return noGl();
      await visit(`${BASE}${FX}`, { width: 344, fresh: true, settle: 0 });
      await intoView(".shd-horizon");
      const t0 = Date.now();
      if (!(await waitFor(`${F} > 0`, 10000, 50))) return { ok: false, detail: `no frames within 10 s (${await statusLine()})` };
      const tStart = Date.now();
      const stopped = await waitFor(`${RUNNING}.length === 0 && ${CANVASES} === 0`, 9000, 100);
      const ran = Date.now() - tStart;
      const r = await evaluate(`({ states: [...document.querySelectorAll('.shd')].map((s) => s.getAttribute('data-shd-state')), running: document.documentElement.hasAttribute('data-shader-running'), f: ${F} })`);
      await sleep(1000);
      const f2 = await evaluate(F);
      const bad = [];
      if (!stopped) bad.push("still running after 9 s");
      if (ran > 5300) bad.push(`ran ${ran} ms (≤ 5 s visible)`);
      if (r.states.some((s) => s !== "fallback")) bad.push(`states ${r.states.join(",")}`);
      if (r.running) bad.push("html[data-shader-running] left set");
      if (f2 !== r.f) bad.push("frames still rising");
      return { ok: bad.length === 0, detail: `${bad.join("; ")}${bad.length ? "; " : ""}first frame after ${tStart - t0} ms, ran ${ran} ms, ${r.f} frames` };
    });

    await probe("full: the AMBIENT budget is per session: a second visit, and a trip to the other AMBIENT pages, plays no more air", FX, async () => {
      if (!GL) return noGl();
      const notes = [];
      for (const route of [FX, ...MOTION_ROUTES.trip, FX]) {
        await visit(`${BASE}${route}`, { width: 344, settle: 300 });
        const has = await intoView(".shd-horizon");
        if (!has) {
          notes.push(`${route}: no horizon slot yet`);
          continue;
        }
        await sleep(4000);
        const r = await evaluate(`({ f: ${F}, canvas: ${CANVASES} })`);
        if (r.f > 0 || r.canvas > 0) return { ok: false, detail: `${route} drew ${r.f} frames (${r.canvas} canvas) after the budget was spent` };
      }
      return { ok: true, detail: notes.join("; ") };
    });

    await probe("full: offscreen, frames stop within 200 ms; after 10 s offscreen the canvas is gone", FX, async () => {
      if (!GL) return noGl();
      await visit(`${BASE}${FX}`, { width: 344, fresh: true, settle: 0 });
      await intoView(".shd-horizon");
      if (!(await waitFor(`${F} > 0`, 10000, 50))) return { ok: false, detail: `no frames (${await statusLine()})` };
      await evaluate("(() => { document.body.style.paddingBottom = '4000px'; window.scrollTo(0, document.documentElement.scrollHeight); return true; })()");
      await sleep(200);
      const f1 = await evaluate(F);
      await sleep(500);
      const f2 = await evaluate(F);
      const gone = await waitFor(`${CANVASES} === 0`, 11500, 250);
      const bad = [];
      if (f2 !== f1) bad.push(`frames ${f1} → ${f2} after 200 ms offscreen`);
      if (!gone) bad.push("the canvas outlived 10 s offscreen");
      return { ok: bad.length === 0, detail: bad.join("; ") };
    });

    await probe("full: a hidden page stops the frames; power-save (html[data-power=save]) stops the loop and drops the canvas", FX, async () => {
      if (!GL) return noGl();
      await visit(`${BASE}${FX}`, { width: 344, fresh: true, settle: 0 });
      await intoView(".shd-horizon");
      if (!(await waitFor(`${F} > 0`, 10000, 50))) return { ok: false, detail: `no frames (${await statusLine()})` };
      // Hidden: visibilityState overridden and visibilitychange dispatched (what the engine and PowerSaver read).
      await evaluate("(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); return true; })()");
      await sleep(250);
      const h1 = await evaluate(F);
      await sleep(500);
      const h2 = await evaluate(F);
      await evaluate("(() => { delete document.visibilityState; delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); return true; })()");
      await sleep(600);
      await evaluate("(() => { document.documentElement.setAttribute('data-power', 'save'); return true; })()");
      await sleep(700);
      const p1 = await evaluate(F);
      await sleep(500);
      const p2 = await evaluate(F);
      const gone = await waitFor(`${CANVASES} === 0`, 1500, 100);
      await evaluate("(() => { document.documentElement.removeAttribute('data-power'); return true; })()");
      const bad = [];
      if (h2 !== h1) bad.push(`hidden: frames ${h1} → ${h2}`);
      if (p2 !== p1) bad.push(`power-save: frames ${p1} → ${p2}`);
      if (!gone) bad.push("power-save kept the canvas");
      return { ok: bad.length === 0, detail: bad.join("; ") };
    });

    await probe("full: scrolling or pointing during the quiet window delays getContext; the loop starts once the page is quiet", FX, async () => {
      if (!GL) return noGl();
      await visit(`${BASE}${FX}`, { width: 344, fresh: true, settle: 0 });
      await intoView(".shd-horizon");
      let early = null;
      const t0 = Date.now();
      for (let i = 0; Date.now() - t0 < 2500; i++) {
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 60 + (i % 40), y: 300 });
        if (i % 5 === 4 && early == null) {
          const r = await evaluate(`({ f: ${F}, canvas: ${CANVASES} })`);
          if (r.f > 0 || r.canvas > 0) early = Date.now() - t0;
        }
        await sleep(100);
      }
      const late = await evaluate(`({ f: ${F}, canvas: ${CANVASES} })`);
      const started = await waitFor(`${F} > 0`, 5000, 50);
      const bad = [];
      if (early != null || late.f > 0 || late.canvas > 0) bad.push(`a context during input (${early ?? 2500} ms in)`);
      if (!started) bad.push(`no loop once quiet (${await statusLine()})`);
      return { ok: bad.length === 0, detail: bad.join("; ") };
    });

    for (const [route, sel, cap] of [
      [FX, ".shd-horizon", 1],
      [WEAVE, ".shd-weave", 1.5],
    ]) {
      await probe(`full at DPR 3: the ${sel.slice(5)} canvas is ≤ ${cap}× its CSS width`, route, async () => {
        if (!GL) return noGl();
        try {
          await visit(`${BASE}${route}`, { width: 344, dpr: 3, fresh: true, settle: 0 });
          await intoView(sel);
          const r = await waitFor(`(() => { const c = document.querySelector('${sel} canvas'); return c && document.querySelector('${sel}[data-live]') ? { w: c.width, cw: c.clientWidth } : null; })()`, 10000, 100);
          if (!r) return { ok: false, detail: `no live canvas (${await statusLine()})`, width: 344 };
          return { ok: r.w <= Math.ceil(r.cw * cap), detail: `canvas ${r.w} px for ${r.cw} css px` };
        } finally {
          await send("Emulation.setDeviceMetricsOverride", { width: 344, height: 812, deviceScaleFactor: 1, mobile: true });
        }
      });
    }

    // ── full: the weave (WAIT) ──
    await probe("full: the weave runs at ≤ 20 fps, alone on the page (no horizon canvas), its breathe still, and stops at 90 s (test clock)", WEAVE, async () => {
      if (!GL) return noGl();
      await visit(`${BASE}${WEAVE}`, { width: 344, fresh: true, settle: 0 });
      await intoView(".shd-weave");
      if (!(await waitFor("!!document.querySelector('.shd-weave[data-live]')", 10000, 50))) return { ok: false, detail: `the weave never went live (${await statusLine()})` };
      const f0 = await evaluate(F);
      await sleep(2000);
      const r = await evaluate(`({
        f: ${F},
        horizon: document.querySelectorAll('.shd-horizon canvas').length,
        breathe: document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('[data-weave-live]')).length,
        glyphs: document.querySelectorAll('[data-weave-live] svg.mg-weave').length,
      })`);
      await evaluate("(() => { window.__xtnlShader.clock(90000); return true; })()");
      const stopped = await waitFor(`document.querySelectorAll('.shd-weave canvas').length === 0`, 2500, 100);
      const fps = (r.f - f0) / 2;
      const bad = [];
      if (fps > 21) bad.push(`${fps} fps`);
      if (r.horizon) bad.push(`${r.horizon} horizon canvas beside the weave`);
      if (r.breathe) bad.push(`${r.breathe} animation(s) running in the live weave's card`);
      if (!stopped) bad.push("still running at 90 s");
      return { ok: bad.length === 0, detail: `${bad.join("; ")}${bad.length ? "; " : ""}${fps} fps${r.glyphs ? "" : " (no drafting glyph on this page: the breathe half reads nothing)"}` };
    });

    await probe("full: the weave's pause button stops it at once", WEAVE, async () => {
      if (!GL) return noGl();
      await visit(`${BASE}${WEAVE}`, { width: 344, fresh: true, settle: 0 });
      await intoView(".shd-weave");
      if (!(await waitFor("!!document.querySelector('.shd-weave[data-live]')", 10000, 50))) return { ok: false, detail: `the weave never went live (${await statusLine()})` };
      const f0 = await evaluate(`(() => { const card = document.querySelector('.shd-weave[data-live]').closest('[data-wait]'); const b = card && card.querySelector('button[aria-pressed]'); if (!b) return -1; b.click(); return ${F}; })()`);
      if (f0 < 0) return { ok: false, detail: "no pause button in the waiting card" };
      await sleep(150);
      const f1 = await evaluate(F);
      await sleep(500);
      const r = await evaluate(`({ f: ${F}, paused: !!document.querySelector('[data-wait][data-paused]'), canvas: document.querySelectorAll('.shd-weave canvas').length })`);
      const bad = [];
      if (r.f - f0 > 1) bad.push(`${r.f - f0} frames after the tap (${f1 - f0} in the first 150 ms)`);
      if (!r.paused) bad.push("the card has no data-paused");
      if (r.canvas) bad.push("the canvas stayed");
      return { ok: bad.length === 0, detail: bad.join("; ") };
    });

    await probe("no WebGL: the drafting glyph's breathe runs on the compositor (a 3 s trace shows no main-thread Paint at display rate)", "/dev/style/glyphs", async () =>
      withInit([INIT.noGl], async () => {
        await visit(`${BASE}/dev/style/glyphs?motion=full`, { width: 344, settle: 1500 });
        const running = await evaluate(`(() => {
          const g = document.querySelector('[data-wait]:not([data-paused]) svg.mg-weave');
          if (!g) return null;
          g.scrollIntoView({ block: 'center' });
          return document.getAnimations().some((a) => a.animationName === 'mg-breathe' && a.playState === 'running');
        })()`);
        if (running == null) return { skip: true, detail: "no drafting glyph in a waiting card on this page" };
        if (!running) return { ok: false, detail: "the breathe is not running under full" };
        await sleep(400);
        const from = events.length;
        await send("Tracing.start", { traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline"] }, transferMode: "ReportEvents" });
        await sleep(3000);
        const done = once("Tracing.tracingComplete");
        await send("Tracing.end");
        await Promise.race([done, sleep(10000)]);
        const evs = events.slice(from).filter((e) => e.method === "Tracing.dataCollected").flatMap((e) => e.params.value ?? []);
        const main = new Set(evs.filter((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain").map((e) => `${e.pid}:${e.tid}`));
        const paints = evs.filter((e) => e.name === "Paint" && main.has(`${e.pid}:${e.tid}`) && e.ph !== "E").length;
        // At display rate a main-thread breathe would paint about 180 times in 3 s; a compositor animation paints almost never.
        return { ok: main.size > 0 && paints <= 20, detail: `${paints} main-thread Paint events in 3 s${main.size ? "" : " (no renderer main thread in the trace)"}` };
      })
    );

    // ── fallbacks ──
    await probe("no WebGL: every slot keeps its SVG, no canvas, no console error", FX, async () => {
      const bad = [];
      await withInit([INIT.noGl], async () => {
        for (const route of [FX, WEAVE]) {
          const { errors } = await visit(`${BASE}${route}`, { width: 344, fresh: true, settle: 300 });
          await intoView(route === FX ? ".shd-horizon" : ".shd-weave");
          await sleep(4000);
          const r = await evaluate(`(() => {
            const on = (el) => { if (!el) return false; const cs = getComputedStyle(el); const b = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
            const slots = [...document.querySelectorAll('.shd')];
            return { canvas: document.querySelectorAll('canvas').length, slots: slots.length, hidden: slots.filter((s) => (s.querySelector(':scope > .shd-fb') && !on(s.querySelector(':scope > .shd-fb'))) || (s.querySelector(':scope > .shd-marks') && !on(s.querySelector(':scope > .shd-marks')))).length };
          })()`);
          const errs = [...errors, ...errorsIn(events)];
          if (r.canvas) bad.push(`${route}: ${r.canvas} canvas`);
          if (r.hidden) bad.push(`${route}: ${r.hidden} slot(s) lost their SVG`);
          if (errs.length) bad.push(`${route}: console error ${errs[0]}`);
        }
      });
      return { ok: bad.length === 0, detail: bad.join("; ") };
    });

    await probe("SwiftShader (__XTNL_SHD_FORCE): both programs compile and go live (status ok)", FX, async () => {
      if (!GL) return noGl();
      const out = [];
      for (const [route, sel] of [
        [FX, ".shd-horizon"],
        [WEAVE, ".shd-weave"],
      ]) {
        await visit(`${BASE}${route}`, { width: 344, fresh: true, settle: 0 });
        await intoView(sel);
        const live = await waitFor(`!!document.querySelector('${sel}[data-live]')`, 10000, 100);
        const s = await evaluate("(window.__xtnlShader ? window.__xtnlShader.status() : null)");
        out.push({ program: sel.slice(5), live: !!live, ok: !!live && !!s && s.supported === true && s.highp !== false && !s.degraded, status: s });
      }
      return { ok: out.every((o) => o.ok), detail: out.map((o) => `${o.program} ${o.ok ? "ok" : `not ok ${JSON.stringify(o.status)}`}`).join("; ") };
    });

    await probe("the walked path's dash end and the front dot sit at front × width within 0.5%; unmeasured has no dot", `${FX}?shd=off`, async () => {
      await visit(`${BASE}${FX}?shd=off`, { width: 344, settle: 1500 });
      const rows = await evaluate(`(() => [...document.querySelectorAll('.shd-horizon .shd-marks')].map((svg) => {
        const path = svg.querySelector('.shd-path');
        const walk = svg.querySelector('.shd-walk');
        const front = svg.querySelector('.shd-front');
        const out = { walk: !!walk, dots: !!(walk && walk.classList.contains('shd-dots')), front: !!front };
        if (!path) return Object.assign(out, { error: 'no .shd-path' });
        const T = path.getTotalLength();
        const p0 = path.getPointAtLength(0);
        const p2 = path.getPointAtLength(T);
        const W = p2.x - p0.x;
        const vb = svg.viewBox.baseVal;
        const r = svg.getBoundingClientRect();
        out.viewBoxIsCss = Math.abs(vb.width - r.width) < 1 && Math.abs(vb.height - r.height) < 1;
        let share = null;
        if (walk && !out.dots) {
          share = parseFloat(walk.getAttribute('stroke-dasharray')) / 100;
          const end = walk.getPointAtLength(walk.getTotalLength() * share);
          out.pct = Math.round(share * 100);
          out.dashErr = Math.abs(end.x - (p0.x + share * W)) / W;
        }
        if (walk && out.dots) {
          const ms = [...(walk.getAttribute('d') || '').matchAll(/M\\s*([\\d.]+)[ ,]+([\\d.]+)/g)];
          const last = ms.length ? Number(ms[ms.length - 1][1]) : NaN;
          share = (last - p0.x) / W;
          out.pct = Math.round(share * 100);
        }
        if (front && share != null) out.dotErr = Math.abs(front.getPointAtLength(0).x - (p0.x + share * W)) / W;
        return out;
      }))()`);
      const bad = [];
      for (const r of rows) {
        if (r.error) bad.push(r.error);
        if (!r.viewBoxIsCss) bad.push(`${r.pct ?? "?"}%: viewBox is not the CSS size`);
        if (r.dashErr != null && r.dashErr > 0.005) bad.push(`${r.pct}%: dash end off by ${(r.dashErr * 100).toFixed(2)}%`);
        if (r.dotErr != null && r.dotErr > 0.005) bad.push(`${r.pct}%: dot off by ${(r.dotErr * 100).toFixed(2)}%`);
        if (!r.walk && r.front) bad.push("an unmeasured band has a front dot");
      }
      const pcts = rows.filter((r) => r.walk).map((r) => r.pct);
      for (const want of [0, 23, 41, 100]) if (!pcts.includes(want)) bad.push(`no ${want}% fixture`);
      if (!rows.some((r) => !r.walk)) bad.push("no unmeasured fixture");
      return { ok: bad.length === 0, detail: `${bad.join("; ")}${bad.length ? "; " : ""}fixtures ${pcts.join(", ")}% + ${rows.filter((r) => !r.walk).length} unmeasured` };
    });

    await probe("at air 0 the canvas equals the SVG dawn within 2/255 at 9 points (the swap is invisible)", FX, async () => {
      if (!GL) return noGl();
      await visit(`${BASE}${FX}`, { width: 344, fresh: true, settle: 0 });
      await intoView(".shd-horizon");
      if (!(await waitFor("!!document.querySelector('.shd-horizon[data-live]')", 10000, 50))) return { ok: false, detail: `never live (${await statusLine()})` };
      const canvasPx = await evaluate(`(() => {
        const s = document.querySelector('.shd-horizon[data-live]');
        s.id = s.id || '__audit_slot';
        const w = s.clientWidth, h = s.clientHeight;
        const pts = [];
        for (const fx of [0.6, 0.78, 0.9]) for (const fy of [0.1, 0.2, 0.3]) pts.push([Math.floor(fx * w), Math.floor(fy * h)]);
        let bgEl = s;
        let bg = null;
        while (bgEl && !bg) { const c = getComputedStyle(bgEl).backgroundColor; const m = /rgba?\\(([^)]+)\\)/.exec(c); const v = m ? m[1].split(',').map(Number) : null; if (v && (v.length < 4 || v[3] > 0.99)) bg = v.slice(0, 3); bgEl = bgEl.parentElement; }
        const px = window.__xtnlShader.probe(s, pts);
        return { id: s.id, pts, bg, px };
      })()`);
      if (!canvasPx.px || !canvasPx.bg) return { ok: false, detail: `probe returned ${JSON.stringify(canvasPx).slice(0, 120)}` };
      const want = canvasPx.px.map((p) => [0, 1, 2].map((i) => p[i] + canvasPx.bg[i] * (1 - p[3] / 255)));
      // End the air (test clock), then read the SVG dawn alone off a screenshot (the marks hidden).
      await evaluate("(() => { window.__xtnlShader.clock(6000); return true; })()");
      if (!(await waitFor(`!document.querySelector('#${canvasPx.id}[data-live]') && ${CANVASES} === 0`, 3000, 100))) return { ok: false, detail: "the slot never returned to its SVG" };
      const box = await evaluate(`(() => {
        const st = document.createElement('style');
        st.id = '__audit_hide_marks';
        st.textContent = '.shd-marks { visibility: hidden !important; }';
        document.head.appendChild(st);
        const r = document.getElementById('${canvasPx.id}').getBoundingClientRect();
        return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }))));
      })()`);
      const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 } });
      const svgPx = await evaluate(`(async () => {
        const img = new Image();
        img.src = 'data:image/png;base64,${shot.data}';
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const out = ${JSON.stringify(canvasPx.pts)}.map(([x, y]) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3));
        document.getElementById('__audit_hide_marks').remove();
        return out;
      })()`);
      const diff = Math.max(...svgPx.map((p, i) => Math.max(...[0, 1, 2].map((k) => Math.abs(p[k] - want[i][k])))));
      return { ok: diff <= 2, detail: `max ${diff.toFixed(1)}/255 over 9 points` };
    });

    await probe("context loss: a counted loss keeps the SVG with no error, restore() goes live again; three mount / dispose cycles leave supported true", WEAVE, async () => {
      if (!GL) return noGl();
      await visit(`${BASE}${WEAVE}`, { width: 344, fresh: true, settle: 0 });
      await intoView(".shd-weave");
      if (!(await waitFor("!!document.querySelector('.shd-weave[data-live]')", 10000, 50))) return { ok: false, detail: `never live (${await statusLine()})` };
      const bad = [];
      await sleep(1200);
      await evaluate("(() => { window.__xtnlShader.lose({ counted: true }); return true; })()");
      await sleep(400);
      const lost = await evaluate("(() => { const s = document.querySelector('.shd-weave'); const fb = s.querySelector(':scope > .shd-fb'); return { live: s.hasAttribute('data-live'), fb: !!fb && getComputedStyle(fb).visibility !== 'hidden' }; })()");
      if (lost.live || !lost.fb) bad.push(`after the loss: ${JSON.stringify(lost)}`);
      await evaluate("(() => { window.__xtnlShader.restore(); return true; })()");
      if (!(await waitFor("!!document.querySelector('.shd-weave[data-live]')", 3000, 100))) bad.push("restore() never went live");
      for (let i = 0; i < 3; i++) {
        await evaluate("(() => { document.documentElement.setAttribute('data-motion', 'calm'); return true; })()");
        if (!(await waitFor(`${CANVASES} === 0`, 2500, 100))) bad.push(`cycle ${i + 1}: calm kept the canvas`);
        await evaluate("(() => { document.documentElement.setAttribute('data-motion', 'full'); return true; })()");
        if (!(await waitFor("!!document.querySelector('.shd-weave[data-live]')", 5000, 100))) bad.push(`cycle ${i + 1}: never live again`);
      }
      const s = await evaluate("window.__xtnlShader.status()");
      if (s.supported !== true) bad.push(`supported ${s.supported}`);
      const errs = errorsIn(events);
      if (errs.length) bad.push(`console error: ${errs[0]}`);
      return { ok: bad.length === 0, detail: `${bad.join("; ")}${bad.length ? "; " : ""}counted losses ${s.countedLosses}` };
    });

    // ── performance at 4× CPU throttle ──
    for (const route of MOTION_ROUTES.perf) {
      let m = null;
      let err = null;
      try {
        await withInit([INIT.perf], async () => {
          await send("Emulation.setCPUThrottlingRate", { rate: 4 });
          try {
            await visit(`${BASE}${route}`, { width: 344, fresh: true, settle: 0 });
            const has = await intoView(".shd-horizon");
            const live = has && GL ? await waitFor("window.__auditPerf && window.__auditPerf.live != null", 15000, 200) : null;
            const target = await evaluate("(() => { const t = document.querySelector('main h1, main h2, main p'); if (!t) return null; t.scrollIntoView({ block: 'center' }); const r = t.getBoundingClientRect(); return { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2 }; })()");
            if (live && target) {
              for (let i = 0; i < 5; i++) {
                await send("Input.dispatchMouseEvent", { type: "mousePressed", x: target.x, y: target.y, button: "left", clickCount: 1 });
                await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: target.x, y: target.y, button: "left", clickCount: 1 });
                await sleep(250);
              }
            }
            await sleep(800);
            m = { live: !!live, slot: !!has, p: await evaluate("window.__auditPerf") };
          } finally {
            await send("Emulation.setCPUThrottlingRate", { rate: 1 });
          }
        });
      } catch (e) {
        err = String(e?.message ?? e).slice(0, 160);
      }
      const p = m?.p;
      await probe("4× CPU: no long task over 50 ms from getContext to the first presented frame", route, async () => {
        if (err) return { ok: false, detail: err };
        if (!m.slot) return { skip: true, detail: "no horizon slot on this page yet" };
        if (!GL) return noGl();
        if (!m.live || p.gc == null) return { ok: false, detail: "the loop never went live" };
        const long = p.lt.filter(([s, d]) => d > 50 && s + d >= p.gc && s <= p.live);
        return { ok: long.length === 0, detail: `getContext → live ${Math.round(p.live - p.gc)} ms${long.length ? `; long tasks ${long.map(([, d]) => Math.round(d)).join(", ")} ms` : ""}` };
      });
      await probe("4× CPU: INP ≤ 200 ms with a loop live (5 taps)", route, async () => {
        if (err) return { ok: false, detail: err };
        if (!m.slot) return { skip: true, detail: "no horizon slot on this page yet" };
        if (!GL) return noGl();
        if (!m.live) return { ok: false, detail: "the loop never went live" };
        const worst = Math.max(0, ...p.ev);
        return { ok: p.ev.length > 0 && worst <= 200, detail: p.ev.length ? `worst interaction ${worst} ms over ${p.ev.length} event(s)` : "no interaction recorded" };
      });
      await probe("4× CPU: the LCP element is text, and no layout shift comes from a slot", route, async () => {
        if (err) return { ok: false, detail: err };
        const lcpText = !!p.lcp && !p.lcp.url && !["IMG", "IMAGE", "SVG", "svg", "CANVAS", "VIDEO"].includes(p.lcp.tag);
        const cls = p.ls.filter((s) => s.slot && !s.input).reduce((a, s) => a + s.v, 0);
        const bad = [];
        if (!lcpText) bad.push(`LCP ${JSON.stringify(p.lcp)}`);
        if (cls > 0) bad.push(`CLS from slots ${cls.toFixed(4)}`);
        return { ok: bad.length === 0, detail: bad.join("; ") || `LCP <${p.lcp.tag}> "${p.lcp.text}"` };
      });
    }
  });

  // ── the gateway on /dev/style/glyphs (§4.7's full, calm, still and in-view-at-hydration columns) ──
  await withInit([INIT.calls], async () => {
    const play = async (level, accent) => {
      await visit(`${BASE}/dev/style/glyphs?motion=${level}`, { width: 344, settle: 1500 });
      return evaluate(`(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const motion = document.documentElement.getAttribute('data-motion');
        if (${accent ? "true" : "false"}) { const t = [...document.querySelectorAll('button[aria-pressed]')].find((b) => /In view at hydration/.test(b.textContent)); if (t && t.getAttribute('aria-pressed') !== 'true') { t.click(); await wait(120); } }
        const log = window.__xtnlAuditCalls || [];
        const out = [];
        for (const b of document.querySelectorAll('button.gxl-play')) {
          const start = log.length;
          const motes = document.querySelectorAll('.fx-mote').length;
          b.click();
          await wait(90);
          out.push({ label: b.getAttribute('aria-label') || '', calls: log.slice(start), motes: document.querySelectorAll('.fx-mote').length - motes });
        }
        return { motion, recorder: Array.isArray(window.__xtnlAuditCalls), plays: out };
      })()`);
    };
    const motionOf = (label) => label.split(" ")[1] ?? "";
    const props = (c) => [...new Set(c.kf.flatMap((f) => Object.keys(f)))];
    for (const level of ["still", "calm", "full"]) {
      await probe(`gateway (${level}): every play() call matches §4.7's ${level} column`, `/dev/style/glyphs?motion=${level}`, async () => {
        const r = await play(level, false);
        if (r.motion !== level) return { ok: false, detail: `data-motion is ${r.motion}` };
        if (!r.recorder) return { ok: false, detail: "the animate() recorder did not install" };
        const bad = [];
        let calls = 0;
        for (const p of r.plays) {
          const m = motionOf(p.label);
          calls += p.calls.length;
          if (level === "still" && (p.calls.length || p.motes)) bad.push(`${m}: ${p.calls.length} call(s)`);
          if (level === "calm") {
            for (const c of p.calls) {
              const extra = props(c).filter((k) => k !== "opacity");
              if (c.mote) bad.push(`${m}: a burst mote`);
              else if (extra.length || c.duration > 260 || c.delay > 200 || c.iterations !== 1) bad.push(`${m}: ${extra.join(",") || "opacity"} ${c.duration}+${c.delay} ms ×${c.iterations}`);
            }
          }
          if (level === "full") {
            const parts = p.calls.filter((c) => !c.mote);
            for (const c of parts) if (c.fill === "forwards" || c.fill === "both" || c.iterations !== 1) bad.push(`${m}: fill ${c.fill} ×${c.iterations} on .${c.cls.split(" ")[0]}`);
            const extent = Math.max(0, ...parts.map((c) => c.delay + c.duration));
            if (extent > 1600) bad.push(`${m}: ${extent} ms (> 1.6 s)`);
          }
        }
        if (level === "full" && calls === 0) bad.push("no call recorded under full");
        return { ok: bad.length === 0, detail: `${[...new Set(bad)].slice(0, 8).join("; ")}${bad.length ? "; " : ""}${r.plays.length} plays, ${calls} calls` };
      });
    }
    await probe("gateway (full, in view at hydration): a SEEN motion's accent never hides, zeroes or un-draws a part", "/dev/style/glyphs?motion=full", async () => {
      const r = await play("full", true);
      if (!r.recorder) return { ok: false, detail: "the animate() recorder did not install" };
      const bad = [];
      for (const p of r.plays) {
        const m = motionOf(p.label);
        if (!SEEN_MOTIONS.includes(m)) continue;
        for (const c of p.calls) {
          if (c.mote) continue;
          for (const f of c.kf) {
            if ((f.opacity ?? []).some((v) => parseFloat(v) === 0)) bad.push(`${m}: opacity 0`);
            if ((f.strokeDashoffset ?? []).some((v) => parseFloat(v) >= 100)) bad.push(`${m}: dashoffset 100`);
            if ((f.transform ?? []).some((v) => /scale[XY]?\(\s*0(\.0+)?\s*[,)]/.test(v))) bad.push(`${m}: scale 0`);
          }
        }
      }
      return { ok: bad.length === 0, detail: [...new Set(bad)].join("; ") };
    });
  });
}

if (MOTION !== "off") await motionProbes();

if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 2));
console.log(`\nui-audit: ${results.length - failures - skipped} passed, ${failures} failed${skipped ? `, ${skipped} skipped` : ""}`);
ws.close();
chrome.kill();
try {
  rmSync(profile, { recursive: true, force: true });
} catch {
  /* Chrome may still hold the profile for a moment */
}
process.exit(failures ? 1 : 0);
