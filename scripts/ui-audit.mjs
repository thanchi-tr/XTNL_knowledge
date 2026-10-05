#!/usr/bin/env node
/**
 * Gate 3 and 4 (redesign.md › Acceptance): a headless audit at REAL viewports
 * (344, 375, 932, 1440; not a device frame) of every route, against a running
 * server. It never starts one: run the rehearsal server (or `next dev`) yourself.
 *
 *   node scripts/ui-audit.mjs [--base http://localhost:3100] [--routes all|real|fixtures|/today,/review]
 *                             [--widths 344,375,932,1440] [--json out.json] [--chrome <path>] [--plan]
 *                             [--gate '{"route":…,"width":…,"ask":[…],"aimLines":[…]}']
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
 * Chrome is driven over the DevTools protocol (node's global WebSocket); set
 * CHROME or --chrome if it is not at the default Windows path.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
    })
  );
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "xtnl-ui-audit-"));
const PORT = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdio: "ignore" });

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
  const PRIMARY = '.btn-primary, .tick, .tab-plus, [data-primary]';
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden],[aria-hidden="true"],.sr-only');
  };
  const out = { overflow: document.documentElement.scrollWidth - innerWidth, small: [], tiny: [], loops: [], spill: [], zoomInputs: [] };
  const label = (el) => (typeof el.className === 'string' && el.className ? el.tagName + '.' + el.className.trim().split(/\\s+/).join('.') : el.tagName);
  document.querySelectorAll('a[href],button,input,select,textarea,[role=switch],[role=checkbox],[role=tab]').forEach((el) => {
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
  return out;
})()`;

const results = [];
let failures = 0;

async function visit(url, { width, reduced = false, settle = 900 }) {
  await send("Emulation.setDeviceMetricsOverride", { width, height: width < 600 ? 812 : 900, deviceScaleFactor: 1, mobile: width < 600 });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
  const blank = once("Page.loadEventFired");
  await send("Page.navigate", { url: "about:blank" });
  await Promise.race([blank, sleep(5000)]);
  events.length = 0;
  const loaded = once("Page.loadEventFired");
  await send("Page.navigate", { url });
  await Promise.race([loaded, sleep(15000)]);
  await sleep(settle);
  const errors = events
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
  return { errors };
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
  for (const width of widthsFor(route)) {
    const { errors } = await visit(`${BASE}${route}`, { width });
    let r;
    try {
      r = await evaluate(AUDIT);
    } catch (e) {
      r = { overflow: 0, small: [], tiny: [], loops: [], spill: [], zoomInputs: [], heights: {}, ask: [], aimLines: [], evalError: String(e) };
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
    const ok = problems.length === 0;
    if (!ok) failures++;
    results.push({ route, width, ok, ...r, errors, problems });
    console.log(`${ok ? "PASS" : "FAIL"} ${route} @${width}${ok ? "" : ` — ${problems.join("; ")}`}`);
    const heights = Object.entries(r.heights ?? {});
    if (heights.length) console.log(`      heights: ${heights.map(([k, h]) => `${k} ${h}px`).join(", ")}`);
    const measured = [...(r.ask ?? []).map((a) => `ASK ${a.key} ${Math.round(a.h)}px`), ...(r.aimLines ?? []).map((l) => `${l.key} ${Math.round(l.h)}px${typeof l.cut === "number" && l.cut > 1 ? ` (${l.cut}px cut)` : ""}`)];
    if (measured.length) console.log(`      gated: ${measured.join(", ")}`);
    for (const [k, h] of heights) if (k.startsWith("aim") && width < 600 && h > 470) console.log(`      NOTE: ${k} is ${h}px tall at ${width} (F19: about 400, at most about 470)`);
    if (!ok) {
      for (const s of r.spill.slice(0, 6)) console.log(`      spill: ${s}`);
      for (const s of r.small.slice(0, 6)) console.log(`      small: ${s}`);
      for (const t of r.tiny.slice(0, 6)) console.log(`      tiny:  ${t}`);
      for (const z of r.zoomInputs.slice(0, 6)) console.log(`      input: ${z}`);
      for (const e of errors.slice(0, 4)) console.log(`      error: ${e}`);
    }
  }
}

if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 2));
console.log(`\nui-audit: ${results.length - failures} passed, ${failures} failed`);
ws.close();
chrome.kill();
try {
  rmSync(profile, { recursive: true, force: true });
} catch {
  /* Chrome may still hold the profile for a moment */
}
process.exit(failures ? 1 : 0);
