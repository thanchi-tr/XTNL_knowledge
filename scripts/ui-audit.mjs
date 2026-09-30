#!/usr/bin/env node
/**
 * Gate 3 and 4 (redesign.md › Acceptance): a headless audit at REAL viewports
 * (344, 375, 932, 1440; not a device frame) of every route, against a running
 * server. It never starts one: run `next dev` or `next start` yourself.
 *
 *   node scripts/ui-audit.mjs [--base http://localhost:3000] [--routes /today,/review]
 *                             [--widths 344,375,932,1440] [--json out.json] [--chrome <path>]
 *
 * Fails (exit 1) on, per route × width:
 *   - horizontal overflow (scrollWidth > innerWidth)
 *   - an interactive target under 40×40 (primary actions and ticks under 44×44)
 *   - rendered text under 12 px
 *   - console errors or uncaught exceptions
 *   - on /today and /review: any running infinite animation at rest
 * And once, with prefers-reduced-motion: the first frame must carry html[data-motion="still"].
 *
 * Chrome is driven over the DevTools protocol (node's global WebSocket); set
 * CHROME or --chrome if it is not at the default Windows path.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = opt("base", "http://localhost:3000").replace(/\/$/, "");
const ROUTES = opt(
  "routes",
  [
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
    "/skills",
    "/you/loadout",
    "/you/moments",
    "/you/stats",
    "/settings",
    "/train",
    "/dev/style",
  ].join(",")
).split(",");
const WIDTHS = opt("widths", "344,375,932,1440").split(",").map(Number);
const JSON_OUT = opt("json", null);
const CHROME = opt("chrome", process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe");
const AT_REST_ROUTES = ["/today", "/review"];

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
  const out = { overflow: document.documentElement.scrollWidth - innerWidth, small: [], tiny: [], loops: [] };
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
  while ((n = tw.nextNode())) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || !vis(el) || el.closest('svg')) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) out.tiny.push(el.tagName + '.' + el.className + ' "' + n.textContent.trim().slice(0, 20) + '" ' + fs + 'px');
  }
  for (const a of document.getAnimations()) {
    const t = a.effect && a.effect.getTiming();
    if (t && t.iterations === Infinity && a.playState === 'running') out.loops.push(a.animationName || a.id || 'anonymous');
  }
  out.small = [...new Set(out.small)].slice(0, 30);
  out.tiny = [...new Set(out.tiny)].slice(0, 30);
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
  await visit(`${BASE}/today`, { width: 375, reduced: true });
  const first = await evaluate("window.__firstMotion");
  const ok = first === "still";
  if (!ok) failures++;
  results.push({ route: "/today", width: 375, check: "reduced motion first frame", ok, detail: first });
  console.log(`${ok ? "PASS" : "FAIL"} reduced-motion first frame is still (${first})`);
}

for (const route of ROUTES) {
  for (const width of WIDTHS) {
    const { errors } = await visit(`${BASE}${route}`, { width });
    let r;
    try {
      r = await evaluate(AUDIT);
    } catch (e) {
      r = { overflow: 0, small: [], tiny: [], loops: [], evalError: String(e) };
    }
    const path = route.split("?")[0];
    const loopsBad = AT_REST_ROUTES.includes(path) && !route.includes("?") ? r.loops : [];
    const problems = [];
    if (r.overflow > 0) problems.push(`overflow ${r.overflow}px`);
    if (r.small.length) problems.push(`${r.small.length} small targets`);
    if (r.tiny.length) problems.push(`${r.tiny.length} tiny texts`);
    if (errors.length) problems.push(`${errors.length} console errors`);
    if (loopsBad.length) problems.push(`infinite animations at rest: ${loopsBad.join(", ")}`);
    if (r.evalError) problems.push(r.evalError);
    const ok = problems.length === 0;
    if (!ok) failures++;
    results.push({ route, width, ok, ...r, errors, problems });
    console.log(`${ok ? "PASS" : "FAIL"} ${route} @${width}${ok ? "" : ` — ${problems.join("; ")}`}`);
    if (!ok) {
      for (const s of r.small.slice(0, 6)) console.log(`      small: ${s}`);
      for (const t of r.tiny.slice(0, 6)) console.log(`      tiny:  ${t}`);
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
