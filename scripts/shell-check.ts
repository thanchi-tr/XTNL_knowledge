/**
 * Pure checks for the redesign foundation (L0): the nav model, the pre-paint
 * script, materials, the celebration contract and queue, the motion seeds,
 * figure formatting, the receipt bars, and static CSS rules (layer order,
 * animated properties, loops, opaque bars). No DB, no browser.
 *
 * Run: npx tsx scripts/shell-check.ts
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { runInNewContext } from "node:vm";
import { SECTIONS, activeSub, longDate, sectionOf, titleFor } from "../src/components/shell/nav";
import { PREPAINT_SCRIPT } from "../src/components/shell/prepaint";
import { SHELL_CAPTURE_EVENT } from "../src/components/shell/capture-bridge";
import { asksFromNotices, characterLevelOf, levelCaption, toneOf } from "../src/components/shell/shell-types";
import {
  KIND_TIER,
  T0_KINDS,
  T1_KINDS,
  T2_KINDS,
  T3_KINDS,
  autoAdvances,
  honestyProblem,
  makeEvent,
  parsePrefs,
  resolveMotion,
  type CelebrationEvent,
} from "../src/lib/celebration-types";
import {
  MATERIAL_STOPS,
  RANK_MATERIAL,
  crestMaterial,
  emblemDepthMaterial,
  medallionMaterial,
} from "../src/lib/materials";
import { hashSeed, motionLevel, play, seededRandom } from "../src/lib/motion";
import { closeRun, enqueue, nextIndex, openRun, queueState, registerPresenter } from "../src/lib/celebrate";
import { approx, formatAmount, formatMultiplier, formatNumber, formatPercent } from "../src/components/ui/format";
import { divergingBar, factorMoved, receiptTotal } from "../src/components/ui/receipt-math";
import { fieldLevel } from "../src/lib/xp";

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

// ── nav: Today · Study · + · Train · You ───────────────────────────────────
eq("nav: sections in order", SECTIONS.map((s) => s.id), ["today", "study", "train", "you"]);
eq("nav: /today is Today", sectionOf("/today"), "today");
eq("nav: /today/week is Today", sectionOf("/today/week"), "today");
eq("nav: /review, /workspace, /library/x, /add, /taxonomy are Study", ["/review", "/workspace", "/library/abc", "/add", "/taxonomy"].map(sectionOf), ["study", "study", "study", "study", "study"]);
eq("nav: /skills/mind, /dashboard, /settings, /dev/style are You", ["/skills/mind", "/dashboard", "/settings", "/dev/style"].map(sectionOf), ["you", "you", "you", "you"]);
eq("nav: /train is Train", sectionOf("/train"), "train");
eq("nav: /todayx is nothing (prefix, not substring)", sectionOf("/todayx"), null);
eq("nav: the longest sub wins", ["/today", "/today/week", "/today/rules", "/you/loadout", "/skills/mind", "/taxonomy", "/workspace"].map(activeSub), [
  "/today",
  "/today/week",
  "/today/rules",
  "/you/loadout",
  "/skills",
  "/structure",
  "/review",
]);
eq("nav: longDate is the life day's own calendar date", longDate("2026-10-01"), "Thursday, 1 October");
eq("nav: /today title is the date", titleFor("/today", "2026-10-01"), { eyebrow: "Today", title: "Thursday, 1 October" });
eq("nav: /today/rules title", titleFor("/today/rules"), { eyebrow: "Today", title: "How a day is judged" });
eq("nav: /add title", titleFor("/add"), { eyebrow: "Study", title: "New idea" });
eq("nav: /library/[id] title", titleFor("/library/xyz"), { eyebrow: "Study", title: "Idea" });
eq("nav: /dev/style title", titleFor("/dev/style"), { eyebrow: "Dev", title: "Style" });
eq("nav: unknown path", titleFor("/nowhere"), { eyebrow: null, title: "XTNL" });
{
  const all = SECTIONS.flatMap((s) => s.subs.map((x) => x.href));
  check("nav: every sub-page href is unique", new Set(all).size === all.length, all.join(" "));
  check("nav: every sub-page sits in its own section", SECTIONS.every((s) => s.subs.every((x) => sectionOf(x.href) === s.id)));
}

// ── the pre-paint script agrees with parsePrefs/resolveMotion ──────────────
for (const raw of [null, "", "{}", "not json", '{"motion":"calm"}', '{"motion":"still","theme":"vellum"}', '{"motion":"full"}', '{"motion":"bogus","theme":"x"}', '{"motion":"system"}']) {
  for (const reduce of [false, true]) {
    const attrs: Record<string, string> = {};
    runInNewContext(PREPAINT_SCRIPT, {
      document: { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } },
      localStorage: { getItem: () => raw },
      window: { matchMedia: (q: string) => ({ matches: reduce && q.includes("reduce") }) },
      JSON,
    });
    const p = parsePrefs(raw);
    eq(`prepaint: ${raw ?? "null"} (reduce=${reduce})`, attrs, { "data-theme": p.theme, "data-motion": resolveMotion(p.motion, reduce) });
  }
}
{
  const attrs: Record<string, string> = {};
  runInNewContext(PREPAINT_SCRIPT, {
    document: { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } },
    localStorage: {
      getItem: () => {
        throw new Error("blocked");
      },
    },
    window: {},
    JSON,
  });
  eq("prepaint: blocked storage and no matchMedia → night/full", attrs, { "data-theme": "night", "data-motion": "full" });
}
check("prefs: garbage → defaults", JSON.stringify(parsePrefs({ motion: 7, theme: null })) === JSON.stringify(parsePrefs(null)));
check("prefs: Still never auto-advances", !autoAdvances({ autoAdvance: "next" }, "still") && autoAdvances({ autoAdvance: "next" }, "full") && !autoAdvances({ autoAdvance: "wait" }, "full"));

// ── materials ───────────────────────────────────────────────────────────────
eq("crest bands 1/14/15/27/28/45/46/69/70/120", [1, 14, 15, 27, 28, 45, 46, 69, 70, 120].map((l) => crestMaterial(l)), [
  "iron", "iron", "bronze", "bronze", "silver", "silver", "gold", "gold", "astral", "astral",
]);
eq("crest: a Transcendent rank is astral at any level", crestMaterial(3, true), "astral");
eq("emblem depth bands 1/4/5/8/9/12/13/14/15", [1, 4, 5, 8, 9, 12, 13, 14, 15].map(emblemDepthMaterial), [
  "iron", "iron", "bronze", "bronze", "silver", "silver", "gold", "gold", "astral",
]);
eq("medallion bands 1/4/5/9/10/14/15/19/20", [1, 4, 5, 9, 10, 14, 15, 19, 20].map(medallionMaterial), [
  "iron", "iron", "bronze", "bronze", "silver", "silver", "gold", "gold", "astral",
]);
eq("rank materials", RANK_MATERIAL, { PURE: "iron", SYNERGY: "bronze", CAPSTONE: "silver", APEX: "gold", ULTIMATE: "astral" });
{
  const tokens = read("src/app/styles/tokens.css");
  for (const [m, stops] of Object.entries(MATERIAL_STOPS)) {
    const want = ["a", "m", "b"].map((k) => new RegExp(`--${m}-${k}:(#[0-9a-f]{6})`, "i").exec(tokens)?.[1]?.toLowerCase());
    eq(`materials: ${m} stops match tokens.css`, stops, want);
  }
}

// ── the celebration contract ────────────────────────────────────────────────
{
  const all = [...T0_KINDS, ...T1_KINDS, ...T2_KINDS, ...T3_KINDS];
  check("kinds: no kind sits in two tiers", new Set(all).size === all.length);
  check("kinds: KIND_TIER is exactly the ladder", T0_KINDS.every((k) => KIND_TIER[k] === 0) && T1_KINDS.every((k) => KIND_TIER[k] === 1) && T2_KINDS.every((k) => KIND_TIER[k] === 2) && T3_KINDS.every((k) => KIND_TIER[k] === 3));
  check("kinds: equip is Tier 0 (free and repeatable)", KIND_TIER.equip === 0);
  check("kinds: an emblem unlock is Tier 3; a domain level is Tier 2", KIND_TIER["emblem-unlock"] === 3 && KIND_TIER["domain-level"] === 2);
  const seal = makeEvent("domain-level", "d:1:7", { eyebrow: "Domain level", title: "Economics reached 7", numeral: { from: 6, to: 7 } }, [{ label: "Field", value: "64% → 67%" }]);
  check("honesty: a Seal with a numeral and a What-moved row passes", honestyProblem(seal) === null);
  check("honesty: a Seal without a number fails", honestyProblem({ ...seal, facts: { ...seal.facts, numeral: undefined } }) !== null);
  check("honesty: a Seal without what or cause fails", honestyProblem({ ...seal, what: [] }) !== null);
  check("honesty: a cause line is enough", honestyProblem({ ...seal, what: [], facts: { ...seal.facts, cause: "Sunday's week was kept." } }) === null);
  check("honesty: T0/T1 are exempt", honestyProblem(makeEvent("tick", "t", { eyebrow: "", title: "" })) === null);
}

// ── the queue: highest tier first, FIFO within a tier, runs merge T2 and hold T3 ──
{
  eq("queue: nextIndex picks the highest tier, first in", nextIndex([{ tier: 2 }, { tier: 3 }, { tier: 2 }, { tier: 3 }], false), 1);
  eq("queue: during a run T3 waits", nextIndex([{ tier: 3 }, { tier: 2 }], true), 1);
  eq("queue: during a run with only T3 queued, nothing plays", nextIndex([{ tier: 3 }], true), -1);

  const played: string[] = [];
  const pending: (() => void)[] = [];
  const ev = (id: string, kind: "domain-level" | "title"): CelebrationEvent =>
    makeEvent(kind, id, { eyebrow: kind, title: id, numeral: { from: null, to: 1 } }, [{ label: "x", value: "y" }]);
  // Queue before any presenter: nothing plays.
  enqueue(ev("a2", "domain-level"));
  enqueue(ev("b3", "title"));
  eq("queue: waits for a presenter", queueState().pending, 2);
  const off = registerPresenter((e, done) => {
    played.push(e.id);
    pending.push(done);
  });
  eq("queue: the T3 plays first once a presenter registers", played, ["b3"]);
  enqueue(ev("c2", "domain-level"));
  eq("queue: one at a time", played.length, 1);
  pending.shift()!();
  eq("queue: then the older T2", played, ["b3", "a2"]);
  pending.shift()!();
  eq("queue: then the newer T2", played, ["b3", "a2", "c2"]);
  pending.shift()!();
  enqueue(ev("a2", "domain-level"));
  eq("queue: an event seen in this tab never replays", played.length, 3);
  openRun("run-1");
  enqueue(ev("d2", "domain-level"));
  enqueue(ev("e3", "title"));
  eq("queue: in a run, T2 merges and T3 waits", played.length, 3);
  const merged = closeRun();
  eq("queue: closeRun returns the merged T2s", merged.map((m) => m.id), ["d2"]);
  eq("queue: the held T3 plays after the run", played, ["b3", "a2", "c2", "e3"]);
  pending.shift()!();
  off();
}

// ── motion: server-safe and deterministic ───────────────────────────────────
{
  check("motion: on the server the level is still", motionLevel() === "still");
  check("motion: play() resolves on the server", play(null, [{ opacity: 0 }, { opacity: 1 }]) instanceof Promise);
  const a = seededRandom("tick:abc");
  const b = seededRandom("tick:abc");
  const c = seededRandom("tick:abd");
  const sa = [a(), a(), a()];
  check("motion: the same seed gives the same burst", JSON.stringify(sa) === JSON.stringify([b(), b(), b()]));
  check("motion: a different seed gives a different burst", JSON.stringify(sa) !== JSON.stringify([c(), c(), c()]));
  check("motion: seeds are in [0,1)", sa.every((v) => v >= 0 && v < 1));
  eq("motion: hashSeed is stable", hashSeed("day-kept:2026-10-01"), hashSeed("day-kept:2026-10-01"));
  const src = (read("src/lib/motion.ts") + read("src/lib/celebrate.ts")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check("motion: no Math.random in the reward path", !/Math\.random/.test(src));
}

// ── figures ─────────────────────────────────────────────────────────────────
eq("format: credit", formatAmount(4.2), "+4.2");
eq("format: debt uses a true minus", formatAmount(-3.8), "−3.8");
eq("format: zero has no sign", formatAmount(0), "0.0");
eq("format: -0.04 rounds to an unsigned 0.0", formatAmount(-0.04), "0.0");
eq("format: a balance has no plus", formatAmount(1346, { dp: 0, sign: "none" }), "1,346");
eq("format: thousands", formatNumber(12345.67, 1), "12,345.7");
eq("format: approx", approx(8.34), "≈ 8.3");
eq("format: multiplier", formatMultiplier(1.15), "×1.15");
eq("format: percent clamps", [formatPercent(0.864), formatPercent(1.2), formatPercent(-1)], ["86%", "100%", "0%"]);

// ── receipt bars ────────────────────────────────────────────────────────────
eq("receipt: ×1.00 draws nothing", divergingBar(1), { dir: "none", left: 50, width: 0 });
eq("receipt: ×2.00 fills the right half", divergingBar(2), { dir: "up", left: 50, width: 50 });
eq("receipt: ×0.50 fills the left half", divergingBar(0.5), { dir: "down", left: 0, width: 50 });
check("receipt: up and down are symmetric on a log scale", divergingBar(1.25).width === divergingBar(0.8).width);
check("receipt: a tiny factor still shows", divergingBar(1.01).width >= 1.5);
check("receipt: factorMoved", factorMoved(1.05) && !factorMoved(1.001));
eq("receipt: base × factors to one decimal", receiptTotal(20, [1, 1.1, 1, 1]), 22);

// ── shell data helpers ──────────────────────────────────────────────────────
{
  for (const levels of [[], [1], [4, 9, 2], [16, 16], [30, 1, 7, 12, 3]]) {
    eq(`character level equals xp.fieldLevel for [${levels}]`, characterLevelOf(levels).level, fieldLevel(levels));
  }
  const p = characterLevelOf([4, 9, 2]).progress;
  check("character progress is the fraction toward the next level", p >= 0 && p < 1);
  eq("caption: next level is a new title", levelCaption({ level: 14, progress: 0.864, nextTitle: "Practitioner", nextTitleAt: 15 }), "86% to Practitioner at 15");
  eq("caption: next level inside the band", levelCaption({ level: 16, progress: 0.5, nextTitle: "Scholar", nextTitleAt: 21 }), "50% to level 17");
  eq("caption: never 100% before the level lands", levelCaption({ level: 3, progress: 0.9999, nextTitle: null, nextTitleAt: null }), "99% to level 4");
  eq("caption: no data, no caption", levelCaption({ level: null, progress: null, nextTitle: null, nextTitleAt: null }), null);
  eq("asks: tones (penalty owed, boon held, due ink, good kept)", [
    toneOf({ group: "Due", tone: "bad" }),
    toneOf({ group: "Active effects", tone: "good" }),
    toneOf({ group: "Active effects", tone: "bad" }),
    toneOf({ group: "Due", tone: "warn" }),
    toneOf({ group: "Challenges", tone: "good" }),
    toneOf({ group: "Due", tone: "info" }),
  ], ["owed", "held", "owed", "ask", "kept", "quiet"]);
  eq("asks: rows keep the feed's order and action", asksFromNotices([{ id: "due", group: "Due", tone: "info", title: "3 cards due", detail: "Ready.", href: "/review", action: "Review" }]).map((a) => [a.id, a.action, a.href]), [["due", "Review", "/review"]]);
}

// ── the capture event the shell dispatches is the one QuickCapture hears ────
{
  const dir = join(ROOT, "src/components/capture");
  const src = existsSync(dir) ? readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8")).join("\n") : "";
  check("capture: the shell's event name is QuickCapture's", src.includes(`"${SHELL_CAPTURE_EVENT}"`), SHELL_CAPTURE_EVENT);
}

// ── CSS: layers, animated properties, loops, opaque bars ────────────────────
{
  const ORDER = "@layer theme, base, components, art, effects, utilities;";
  const cssFiles: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".css") && !f.endsWith(".module.css")) cssFiles.push(p);
    }
  };
  walk(join(ROOT, "src"));
  const noOrder = cssFiles.filter((f) => readFileSync(f, "utf8").split(/\r?\n/)[0].trim() !== ORDER).map((f) => relative(ROOT, f));
  check("layers: every hand-written CSS file starts with the layer order", noOrder.length === 0, noOrder.join(", "));

  const mine = ["tokens.css", "base.css", "components.css", "effects.css"].map((f) => [f, read(`src/app/styles/${f}`).replace(/\/\*[\s\S]*?\*\//g, "")] as const);
  const allowed = new Set(["transform", "opacity", "stroke-dashoffset", "stroke-dasharray"]);
  const bad: string[] = [];
  for (const [f, css] of mine) {
    for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
      for (const d of m[2].matchAll(/([a-z-]+)\s*:/g)) if (!allowed.has(d[1])) bad.push(`${f} ${m[1]}: ${d[1]}`);
    }
  }
  check("motion: styles/*.css keyframes animate only transform, opacity and stroke-dashoffset", bad.length === 0, bad.join("; "));
  const loops = mine.flatMap(([f, css]) => [...css.matchAll(/animation:[^;]*infinite[^;]*;[^}]*/g)].map((m) => `${f}: ${m[0]}`));
  check("motion: exactly two loops in the kit (orbit 14 s, rays 90 s)", loops.length === 2 && loops.some((l) => /14s/.test(l)) && loops.some((l) => /90s/.test(l)), loops.map((l) => l.slice(0, 60)).join(" | "));
  check("motion: both loops read --ambient-play", loops.every((l) => /animation-play-state:\s*var\(--ambient-play\)/.test(l)));
  const comp = mine.find(([f]) => f === "components.css")![1];
  const barRules = [...comp.matchAll(/(?:^|\})\s*\.(topbar|tabbar|rail|sidebar)\s*\{([^}]*)\}/g)].filter((r) => /position:\s*sticky/.test(r[2]));
  check("bars: opaque (var(--bar)) and never backdrop-filtered", barRules.length === 4 && barRules.every((r) => /background:\s*var\(--bar\)/.test(r[2])), barRules.map((r) => r[1]).join(","));
  check("bars: no backdrop-filter on any bar selector", ![...comp.matchAll(/([^{}]*)\{([^}]*)\}/g)].some((r) => /\.(topbar|tabbar|rail|sidebar)\b/.test(r[1]) && /backdrop-filter/.test(r[2])));
  const importants = mine.flatMap(([f, css]) => [...css.matchAll(/!important/g)].map(() => f));
  check("css: the only !important in styles/ is the Still rule in tokens.css", importants.length === 2 && importants.every((f) => f === "tokens.css"), importants.join(", "));
  const globals = read("src/app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  check("css: no @config (tailwind.config.mts is gone)", !/@config/.test(globals) && !existsSync(join(ROOT, "tailwind.config.mts")));
  check("css: the layer order precedes @import \"tailwindcss\"", globals.indexOf(ORDER) >= 0 && globals.indexOf(ORDER) < globals.indexOf('@import "tailwindcss"'));
  const layout = read("src/app/layout.tsx");
  check("layout: skies.css and cataclysm*.css are not global", !/import\s+"\.\/(skies|cataclysm)/.test(layout));
  check("layout: the pre-paint script is in <head>", /<head>[\s\S]*PREPAINT_SCRIPT[\s\S]*<\/head>/.test(layout));
  check("layout: the shell data is a Suspense-wrapped prop slot", /dataSlot=\{\s*<Suspense fallback=\{null\}>\s*<ShellDataSlot \/>/.test(layout));
}

console.log(`\nshell-check: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
