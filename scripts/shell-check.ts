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
import { DEV_STYLE_PAGES, SECTIONS, activeSub, longDate, sectionOf, titleFor } from "../src/components/shell/nav";
import { PREPAINT_SCRIPT } from "../src/components/shell/prepaint";
import { SHELL_CAPTURE_EVENT } from "../src/components/shell/capture-bridge";
import {
  EFFECTS_GROUP,
  LISTED_ONLY_NOTICE_IDS,
  OWED_NOTICE_ID,
  WEEK_REVIEW_NOTICE_ID,
  YESTERDAY_MUSTS_NOTICE_ID,
  askCount,
  askSectionsOf,
  asksFromNotices,
  asksOfYou,
  characterLevelOf,
  levelCaption,
  listedOnly,
  owedOf,
  toneOf,
  trackLevelsOf,
} from "../src/components/shell/shell-types";
import { dutyNoticesOf, owedNotice, reviewedWeek, weekReviewNotice, yesterdayMustsNotice } from "../src/lib/rituals";
import { RECORD_YESTERDAY_HREF } from "../src/lib/shortcuts";
import { ATTRIBUTES, computeAttributeScores, emptyComposition, sourcesFor, type Composition, type FieldContribution } from "../src/lib/attributes";
import { characterRaw } from "../src/lib/character";
import { depthCap, trackDepth, xpForLevel } from "../src/lib/life-economy";
import { TRACK_SEED } from "../src/lib/life-lexicon";
import { emptyLifeLedger, keptWeekBonusPercent, lifeContributionRows, lifeContributionsAt, notLaunchedView, type TrackState } from "../src/lib/life-tracks";
import type { Track } from "../src/lib/life-types";
import { scoresWithStreak, type FieldRow } from "../src/lib/skill-effects";
import type { Notice } from "../src/lib/notifications";
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
import { chime, closeRun, enqueue, hasChimed, nextIndex, openRun, queueState, registerPresenter, subscribeLog } from "../src/lib/celebrate";
import { buttonClass } from "../src/components/ui/Button";
import { TEXT_FLOOR_PX, crestNumeralUnits } from "../src/components/ui/Crest";
import { phraseMatches } from "../src/components/ui/TypedConfirm";
import { compile } from "tailwindcss";
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
/**
 * A check over other lanes' files: a known problem already handed off (key →
 * the handoff) is a WARN until that lane lands it; anything else fails. A
 * pending key that no longer occurs is reported so it can be deleted here.
 */
function checkPending(name: string, problems: string[], pending: Record<string, string>) {
  const fresh = problems.filter((p) => !(p in pending));
  check(name, fresh.length === 0, fresh.join("; "));
  for (const p of problems.filter((q) => q in pending)) console.log(`WARN ${name} — ${p} (handed off: ${pending[p]})`);
  for (const k of Object.keys(pending).filter((q) => !problems.includes(q))) console.log(`NOTE ${name} — "${k}" is fixed; delete it from the pending list`);
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
eq("nav: /dev/style title", titleFor("/dev/style"), { eyebrow: "Dev · Style", title: "Style" });
eq("nav: each /dev/style fixture route has its own title (no ShellTitle swap)", ["/dev/style/today", "/dev/style/review", "/dev/style/celebrate", "/dev/style/art/ladder", "/dev/style/settings"].map((p) => titleFor(p).title), [
  "Today fixtures",
  "Review fixtures",
  "Celebrations",
  "Art",
  "Settings fixtures",
]);
eq("nav: /you is the Character sheet on first paint (the server-rendered title)", titleFor("/you"), { eyebrow: "You", title: "Character" });
eq("nav: /you/loadout keeps its sub-page title", titleFor("/you/loadout"), { eyebrow: "You", title: "Loadout" });
eq("nav: unknown path", titleFor("/nowhere"), { eyebrow: null, title: "XTNL" });
check(
  "nav: every /dev/style page in the strip exists",
  DEV_STYLE_PAGES.every((p) => existsSync(join(ROOT, "src/app", p.href, "page.tsx"))),
  DEV_STYLE_PAGES.filter((p) => !existsSync(join(ROOT, "src/app", p.href, "page.tsx"))).map((p) => p.href).join(", ")
);
{
  // A static title known from the path belongs in titleFor: a <ShellTitle/> with
  // only literal props paints one title on the server and swaps after hydration.
  const pages: string[] = [];
  const walkTsx = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walkTsx(p);
      else if (f.endsWith(".tsx")) pages.push(p);
    }
  };
  walkTsx(join(ROOT, "src"));
  const swaps = pages.flatMap((f) =>
    [...readFileSync(f, "utf8").matchAll(/<ShellTitle\s+eyebrow="([^"]*)"\s+title="([^"]*)"\s*\/>/g)].map((m) => [relative(ROOT, f), m[1], m[2]] as const)
  );
  const mismatched = swaps.filter(([file, eyebrow, title]) => {
    const route = "/" + file.split("\\").join("/").replace(/^src\/app\//, "").replace(/\/?page\.tsx$/, "");
    if (!file.split("\\").join("/").startsWith("src/app/")) return false; // a component; its route is unknown here
    const want = titleFor(route === "/" ? "/" : route);
    return want.eyebrow !== eyebrow || want.title !== title;
  });
  check("nav: no page overrides the top bar with a literal title titleFor does not already give", mismatched.length === 0, mismatched.map((m) => m.join(" ")).join("; "));
}
{
  const all = SECTIONS.flatMap((s) => s.subs.map((x) => x.href));
  check("nav: every sub-page href is unique", new Set(all).size === all.length, all.join(" "));
  check("nav: every sub-page sits in its own section", SECTIONS.every((s) => s.subs.every((x) => sectionOf(x.href) === s.id)));
}

// ── roadmap (lane Y, F16 seam 10 and F23): the Roadmap sub, "Set an aim", the fixtures page, the strip at 344 ──
// nav.ts is lane L's (seam 10), and YouTabs.tsx is lane Y's since roadmap revision 4 (a rev-3 carry-over):
// anything the strip lacks is a FAIL now that both its fixes have landed.
{
  const you = SECTIONS.find((s) => s.id === "you");
  const labels = (you?.subs ?? []).map((s) => s.label);
  const want = ["Sheet", "Roadmap", "Skills", "Loadout", "Moments", "Stats", "Settings"];
  const navProblems: string[] = [];
  if (labels.join(", ") !== want.join(", ")) navProblems.push(`You subs read "${labels.join(", ")}"`);
  const roadmapSub = you?.subs.find((s) => s.label === "Roadmap");
  if (roadmapSub && roadmapSub.href !== "/you/roadmap") navProblems.push(`the Roadmap sub links to ${roadmapSub.href}`);
  const title = (p: string) => {
    const t = titleFor(p);
    return `${t.eyebrow ?? ""} · ${t.title}`;
  };
  if (title("/you/roadmap") !== "You · Roadmap") navProblems.push(`/you/roadmap is titled "${title("/you/roadmap")}"`);
  if (title("/you/roadmap/new") !== "You · Set an aim") navProblems.push(`/you/roadmap/new is titled "${title("/you/roadmap/new")}"`);
  if (activeSub("/you/roadmap/new") !== "/you/roadmap") navProblems.push(`/you/roadmap/new lights ${activeSub("/you/roadmap/new")}`);
  if (activeSub("/you/roadmap") !== "/you/roadmap") navProblems.push(`/you/roadmap lights ${activeSub("/you/roadmap")}`);
  const dev = DEV_STYLE_PAGES.find((p) => p.href === "/dev/style/roadmap");
  if (!dev) navProblems.push("no DEV_STYLE_PAGES entry for /dev/style/roadmap");
  else if (dev.label !== "Roadmap fixtures") navProblems.push(`the roadmap fixtures entry is labelled "${dev.label}"`);
  if (titleFor("/dev/style/roadmap").title !== "Roadmap fixtures") navProblems.push(`/dev/style/roadmap is titled "${titleFor("/dev/style/roadmap").title}"`);
  // Nothing pending: lane L landed nav.ts's seam 10. (The fixtures page itself is R5's; the
  // "every /dev/style page in the strip exists" check above holds it.)
  checkPending("nav (roadmap): You subs Sheet, Roadmap, Skills, Loadout, Moments, Stats, Settings; 'Set an aim'; the roadmap fixtures entry", navProblems, {});
  // The settled page (/you, Sheet) keeps its title; Roadmap is a sub, not a section.
  eq("nav (roadmap): /you stays Character, and /you/roadmap sits in You", [titleFor("/you").title, sectionOf("/you/roadmap"), sectionOf("/you/roadmap/new")], ["Character", "you", "you"]);

  // At 344 the content is 312 px. A tab is its label (≥ 7 px a character at 600 14px, a lower bound)
  // plus 28 px of padding, with 4 px gaps: seven tabs need far more than 312, so the strip scrolls,
  // and the current tab can sit out of view unless the strip scrolls it in and shows that more is there.
  const widthAt = (names: readonly string[]) => names.reduce((w, n) => w + n.length * 7 + 28, 0) + 4 * (names.length - 1);
  check(`tabs at 344 (roadmap): the You strip (${widthAt(want)} px at least) is wider than the 312 px content, so it scrolls`, widthAt(want) > 312);
  // Landed in roadmap revision 4 (lane Y's carry-over; YouTabs.tsx): the strip moves its own scrollLeft
  // to the current tab on every route (never scrollIntoView, which could also move the page), and the
  // edge with more tabs past it fades (an inline mask, data-fade start/end/both; none when the strip fits).
  const tabs = read("src/components/home/YouTabs.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const youCss = cssRules(read("src/components/home/you.css"));
  const stripProblems: string[] = [];
  if (!/\.scrollLeft\s*[+-]?=|\.scrollTo\(/.test(tabs) || !/\[current\]\);/.test(tabs)) stripProblems.push("YouTabs never scrolls the current tab into view");
  if (/scrollIntoView\(/.test(tabs)) stripProblems.push("YouTabs scrolls with scrollIntoView (it can move the page)");
  const inlineCue = /maskImage: MASK\[fade\]/.test(tabs) && /WebkitMaskImage: MASK\[fade\]/.test(tabs) && /data-fade=\{fade \?\? undefined\}/.test(tabs);
  if (!inlineCue && !youCss.some((r) => /\.you-tabs/.test(r.selector) && /mask-image|linear-gradient/.test(r.body))) stripProblems.push("the You tab strip has no scroll cue");
  if (!/if \(max <= 1\) return null;/.test(tabs)) stripProblems.push("the You tab strip's cue shows even when every tab fits");
  // Nothing pending: lane Y landed both (the two keys handed to the lead are deleted).
  checkPending("tabs at 344 (roadmap): the current tab is scrolled into view, and the strip keeps a scroll cue", stripProblems, {});
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
  // M5: one character level over Fields and life tracks (a compatible extension).
  const both = 4 ** 0.75 + 9 ** 0.75 + 2 ** 0.75 + 3 ** 0.75 + 1;
  const withTracks = characterLevelOf([4, 9, 2], [3, 1]);
  check("character level over Fields and tracks: characterLevelOf([4,9,2], [3,1]).level = floor(Σ both)", withTracks.level === Math.floor(both), `${withTracks.level} vs ${both}`);
  check("  with progress in [0, 1)", withTracks.progress >= 0 && withTracks.progress < 1 && Math.abs(withTracks.level + withTracks.progress - characterRaw([4, 9, 2], [3, 1])) < 1e-12);
  for (const levels of [[], [1], [4, 9, 2], [16, 16], [30, 1, 7, 12, 3]]) {
    const a = characterLevelOf(levels);
    const b = characterLevelOf(levels, []);
    const z = characterLevelOf(levels, trackLevelsOf(notLaunchedView("2026-10-01").levels));
    check(`no tracks, or not launched (all 0), is today's level for [${levels}]`, a.level === b.level && a.progress === b.progress && z.level === fieldLevel(levels) && z.progress === a.progress);
  }
  eq("trackLevelsOf: TRACKS order (Body, Duty, Craft, Care), missing as 0", trackLevelsOf({ DUTY: 3, BODY: 1, OTHER: 9 }), [1, 3, 0, 0]);
  eq("trackLevelsOf: absent is no tracks", [trackLevelsOf(null), trackLevelsOf(undefined)], [[], []]);
  eq("caption: next level is a new title", levelCaption({ level: 14, progress: 0.864, nextTitle: "Practitioner", nextTitleAt: 15 }), "86% to Practitioner at 15");
  eq("caption: next level inside the band", levelCaption({ level: 16, progress: 0.5, nextTitle: "Scholar", nextTitleAt: 21 }), "50% to level 17");
  eq("caption: never 100% before the level lands", levelCaption({ level: 3, progress: 0.9999, nextTitle: null, nextTitleAt: null }), "99% to level 4");
  eq("caption: no data, no caption", levelCaption({ level: null, progress: null, nextTitle: null, nextTitleAt: null }), null);
  // Colour grammar: owed only for a penalty in effect, held for a boon, kept only
  // for the quota met; past grace, the focus line and a ready encounter are ink.
  eq("asks: tones (debuff owed, boon held, past grace ink, warn ink, encounter ink, focus ink, quota met kept, info quiet)", [
    toneOf({ group: "Active effects", tone: "bad" }),
    toneOf({ group: "Active effects", tone: "good" }),
    toneOf({ id: "overdue", group: "Due", tone: "bad" }),
    toneOf({ group: "Due", tone: "warn" }),
    toneOf({ id: "bosses", group: "Challenges", tone: "good" }),
    toneOf({ id: "focus", group: "Due", tone: "good" }),
    toneOf({ id: "quota-met", group: "Due", tone: "good" }),
    toneOf({ group: "Due", tone: "info" }),
  ], ["owed", "held", "ask", "ask", "ask", "ask", "kept", "quiet"]);
  const n = (id: string, group: "Due" | "Challenges" | "Active effects", tone: "good" | "warn" | "bad" | "info"): Notice => ({ id, group, tone, title: id, detail: "", href: `/${id}`, action: "Go" });
  const feed: Notice[] = [
    n("boon-x", "Active effects", "good"),
    n("due", "Due", "info"),
    n("overdue", "Due", "bad"),
    n("focus", "Due", "good"),
    n("quota", "Due", "warn"),
    n("quota-met", "Due", "good"),
    n("bosses", "Challenges", "good"),
    n("debuff-y", "Active effects", "bad"),
  ];
  const rows = asksFromNotices(feed);
  eq("asks: the sheet lists what asks (feed order), then the effects in play; info and good news stay on Today", rows.map((a) => a.id), ["overdue", "quota", "bosses", "boon-x", "debuff-y"]);
  eq("asks: the bell counts exactly the rows that ask (never an effect)", askCount(rows), rows.filter((a) => a.group !== EFFECTS_GROUP).length);
  eq("asks: 3 asking rows → a count of 3", askCount(rows), 3);
  check("asks: asksOfYou never counts an effect, even a debuff", !asksOfYou(n("debuff-y", "Active effects", "bad")) && asksOfYou(n("bosses", "Challenges", "good")));
  eq("asks: rows keep the action and href", rows.slice(0, 1).map((a) => [a.id, a.action, a.href]), [["overdue", "Go", "/overdue"]]);
  const shellData = read("src/lib/shell-data.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check("shell title counts OWNED Ultimates (titles are earned once), not equipped ones", /ownedCodes\.filter\(/.test(shellData) && !/activeSkills/.test(shellData));
  check("shell bell count comes from the listed rows (askCount), not the feed's own tally", /askCount\(/.test(shellData) && !/feed\??\.actionable/.test(shellData));
  check(
    "shell: the life read never takes the shell down, and tracks count only once launched",
    /loadLifeTracks\(userId\)\.catch\(\(\) => null\)/.test(shellData) && /launched \? trackLevelsOf\(life\?\.levels\) : \[\]/.test(shellData)
  );
  check("shell: crest edges only once launched (null before)", /tracks: launched \? \(life\?\.edges \?\? null\) : null/.test(shellData));
  check("shell: the title reads the new level and the progression scores (life included)", /computeTitle\(level, progression\.scores, ultimateCount\)/.test(shellData));
}

// ── M2: Duty in the shell (m2-refit decision 27, F15) ───────────────────────
{
  eq("owed: the notice ids", [OWED_NOTICE_ID, YESTERDAY_MUSTS_NOTICE_ID, WEEK_REVIEW_NOTICE_ID, [...LISTED_ONLY_NOTICE_IDS]], ["owed", "yesterday-musts", "week-review", ["yesterday-musts", "week-review"]]);
  const owed = owedNotice({ count: 2, debt: 12.5 });
  check("owed: 'Owed: 2 · −12.5 XP', tone warn (counted), to Today", owed?.title === "Owed: 2 · −12.5 XP" && owed.tone === "warn" && owed.group === "Due" && owed.href === "/today", JSON.stringify(owed));
  eq("owed: toneOf('owed') is the owed diamond, whatever its tone", [toneOf({ id: "owed", group: "Due", tone: "warn" }), toneOf({ id: "owed", group: "Due", tone: "info" })], ["owed", "owed"]);
  check("owed: a due date is never owed-toned (the Owed row is the only owed Due row)", toneOf({ id: "musts", group: "Due", tone: "warn" }) === "ask" && toneOf({ id: "overdue", group: "Due", tone: "bad" }) === "ask");
  check("owed: no notice at 0 (or with no read)", owedNotice({ count: 0, debt: 0 }) === null && owedNotice(null) === null);
  check("owed: a debt is never rounded up to a whole number in the title", owedNotice({ count: 1, debt: 4.25 })?.title === "Owed: 1 · −4.3 XP" && owedNotice({ count: 3, debt: 20 })?.title === "Owed: 3 · −20 XP");
  const y = yesterdayMustsNotice(2, "2026-10-14");
  check("yesterday: 'Yesterday: 2 musts open', tone info, the Record-yesterday deep link", y?.title === "Yesterday: 2 musts open" && y.tone === "info" && y.href === RECORD_YESTERDAY_HREF, JSON.stringify(y));
  check("yesterday: it says when the day settles (Tue's open musts are owed from Thu 04:00)", /by Thu 04:00/.test(y?.detail ?? ""), y?.detail);
  check("yesterday: absent at 0 musts", yesterdayMustsNotice(0, "2026-10-14") === null);
  eq("yesterday: one must reads singular", yesterdayMustsNotice(1, "2026-10-14")?.title, "Yesterday: 1 must open");
  // ShellData.owed.count from fixtures (the feed's own read).
  eq("shell owed: count from the feed's counts.owed", [owedOf({ counts: { due: 0, overdue: 0, today: null, owed: { count: 3, debt: 15.1 } } }), owedOf({ counts: { due: 0, overdue: 0, today: null, owed: null } }), owedOf(null)], [{ count: 3 }, { count: 0 }, { count: 0 }]);
  const shellData = read("src/lib/shell-data.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check("shell owed: shell-data reads owed through owedOf(feed), not a fixed 0", /owed: owedOf\(feed\)/.test(shellData) && !/owed: \{ count: 0 \}/.test(shellData));
  check("shell owed: the Train badge stays 0 (no Train milestone)", /train: 0/.test(shellData));

  // The bell: the owed row counts; yesterday's musts and the weekly review are listed, never counted.
  const live = dutyNoticesOf({ today: "2026-10-17", live: true, owed: { count: 2, debt: 12.5 }, yesterdayMusts: 2, reviewDue: reviewedWeek("2026-10-17") });
  eq("bell: Duty's rows in order (owed, yesterday, weekly review)", live.map((n) => n.id), ["owed", "yesterday-musts", "week-review"]);
  const rows = asksFromNotices(live);
  eq("bell: owed is listed and counted; the two info rows are listed with counted: false", rows.map((r) => [r.id, r.counted !== false, r.tone]), [["owed", true, "owed"], ["yesterday-musts", false, "quiet"], ["week-review", false, "quiet"]]);
  eq("bell: the counted total ignores the listed rows", askCount(rows), 1);
  check("bell: listedOnly is info and named only", listedOnly(yesterdayMustsNotice(2, "2026-10-14")!) && !listedOnly({ id: "yesterday-musts", group: "Due", tone: "warn" }) && !listedOnly({ id: "focus", group: "Due", tone: "info" }));
  const mixed = asksFromNotices([...live, { id: "overdue", group: "Due", tone: "bad", title: "3 past grace", detail: "" }, { id: "boon-x", group: "Active effects", tone: "good", title: "Boon", detail: "" }]);
  eq("bell: asks, then the listed rows, then the effects", mixed.map((r) => r.id), ["owed", "overdue", "yesterday-musts", "week-review", "boon-x"]);
  eq("bell: count = owed + overdue, never a listed row or an effect", askCount(mixed), 2);
  eq("bell: a row with no counted field still counts (the frozen shape, before M2)", askCount([{ group: "Due" }, { group: "Due", counted: false }, { group: EFFECTS_GROUP }]), 1);
  // The sheet's sections: the counted card holds exactly askCount's rows; the listed rows get their own heading.
  const sections = askSectionsOf(mixed);
  eq("bell sections: asking, listed, effects", [sections.asking.map((r) => r.id), sections.listed.map((r) => r.id), sections.effects.map((r) => r.id)], [["owed", "overdue"], ["yesterday-musts", "week-review"], ["boon-x"]]);
  check("bell sections: the counted card is exactly the badge's count, and every row lands once", sections.asking.length === askCount(mixed) && sections.asking.length + sections.listed.length + sections.effects.length === mixed.length);
  const off = dutyNoticesOf({ today: "2026-10-05", live: false, owed: { count: 1, debt: 4.2 }, yesterdayMusts: 2, reviewDue: reviewedWeek("2026-10-05") });
  eq("bell before Duty is live: only an open debt shows (a rolled-back launch never hides one)", off.map((n) => n.id), ["owed"]);
  check("bell: no Duty row on a quiet live day", dutyNoticesOf({ today: "2026-10-15", live: true, owed: { count: 0, debt: 0 }, yesterdayMusts: 0, reviewDue: null }).length === 0);
  const review = weekReviewNotice(reviewedWeek("2026-10-17")!);
  check("weekly review: info, to the runner, naming its week", review.tone === "info" && review.href === "/today/week?view=run" && /week of 12 Oct/.test(review.detail), JSON.stringify(review));

  // notifications.ts: one read for the owed totals and one for the review marker, both failing to 'no line'.
  const feedSrc = read("src/lib/notifications.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check("feed: the owed totals are one aggregate over debtOpen instances", /taskInstance\.aggregate\(\{ where: \{ userId, debtOpen: true \}/.test(feedSrc));
  check("feed: Duty's rows come from rituals dutyNoticesOf, gated by isDutyLaunched(today)", /dutyNoticesOf\(/.test(feedSrc) && /isDutyLaunched\(lifeDay\)/.test(feedSrc));
  check("feed: the evening musts line says when an open must is owed, only once Duty is live", /dutyLive\s*\?\s*`Still open this evening\. The minimum version counts if time is short; left open, it is owed from \$\{owedFromLine\(lifeDay\)\}\.`/.test(feedSrc));
  check("feed: counts.owed is returned beside today", /counts: \{ due: dueCount, overdue: overdueCount, today, owed \}/.test(feedSrc));
}

// ── the attribute seam (m5-refit F7; character-check §3b lives here, lane B) ─
{
  const comp = (parts: Partial<Composition>): Composition => ({ ...emptyComposition(), ...parts });
  const rows: FieldRow[] = [
    { id: "fa", name: "Fitness", level: 10, composition: comp({ PHYSICAL: 50, MIND: 50 }) },
    { id: "fb", name: "Statistics", level: 4, composition: comp({ MIND: 100 }) },
    { id: "fc", name: "Ethics", level: 7.3, composition: comp({ REASON: 40, COMPASSION: 35, SELF_RESPECT: 25 }) },
  ];
  const bonuses: Record<string, number> = { fa: 10, fc: 4.5 };
  // The pre-M5 formula, verbatim: Field rows only, streak bonus × multiplier.
  const preM5 = (mult: number) =>
    computeAttributeScores(
      rows.map((f) => ({ fieldName: f.name, level: f.level * (1 + ((bonuses[f.id] ?? 0) * mult) / 100), composition: f.composition }))
    );
  const state = (track: Track, level: number, keptStreak = 0): TrackState => {
    const bonusPercent = keptWeekBonusPercent(keptStreak);
    return {
      track,
      xp: xpForLevel(level),
      pointsLevel: level,
      keptWeeks: keptStreak,
      keptStreak,
      goalDepth: 0,
      depth: trackDepth(keptStreak),
      cap: depthCap(trackDepth(keptStreak)),
      level,
      atCap: false,
      bonusPercent,
      effectiveLevel: level * (1 + bonusPercent / 100),
      composition: comp(TRACK_SEED[track]),
    };
  };
  const body3 = lifeContributionRows([state("BODY", 3)]);

  eq("seam: scoresWithStreak(rows, bonuses, 1, []) is the pre-M5 result", scoresWithStreak(rows, bonuses, 1, []), preM5(1));
  eq("seam: and with no fourth argument", scoresWithStreak(rows, bonuses, 1), preM5(1));
  eq("seam: an amplified multiplier (1.5) with no life rows is the pre-M5 result", scoresWithStreak(rows, bonuses, 1.5, []), preM5(1.5));
  eq("seam: life rows from an empty ledger change nothing", scoresWithStreak(rows, bonuses, 1, lifeContributionsAt(emptyLifeLedger("2026-10-05"), "2026-10-20")), preM5(1));
  eq("seam: the not-launched view's contributions change nothing", scoresWithStreak(rows, bonuses, 1, notLaunchedView("2026-10-01").contributions), preM5(1));
  eq("seam: a level-0 track adds no row", lifeContributionRows([state("CARE", 0)]).length, 0);

  // A COVENANT / STREAK_AMPLIFIER multiplier scales Field streaks only: the life share is the same at 1 and 1.5.
  const exactRows: FieldRow[] = [rows[0], rows[1]];
  const exactBonus: Record<string, number> = { fa: 10 };
  const share = (mult: number) => {
    const withLife = scoresWithStreak(exactRows, exactBonus, mult, body3);
    const without = scoresWithStreak(exactRows, exactBonus, mult, []);
    return Object.fromEntries(ATTRIBUTES.map((a) => [a, withLife[a] - without[a]]));
  };
  const s1 = share(1);
  const s15 = share(1.5);
  const alone = computeAttributeScores(body3);
  check(
    "seam: a COVENANT multiplier of 1.5 leaves the life share unchanged (it is the life rows' own scores)",
    ATTRIBUTES.every((a) => Math.abs(s15[a] - s1[a]) < 1e-9 && Math.abs(s1[a] - alone[a]) < 1e-9),
    JSON.stringify({ s1, s15 })
  );
  check("seam: … while the Field streak itself is amplified (PHYSICAL 5.5 → 5.75)", scoresWithStreak(exactRows, exactBonus, 1, []).PHYSICAL === 5.5 && scoresWithStreak(exactRows, exactBonus, 1.5, []).PHYSICAL === 5.75);
  eq("seam: a BODY L3 row adds PHYSICAL 1.38", scoresWithStreak([], {}, 1, body3).PHYSICAL, 1.38);
  eq("seam: … on top of the Fields, exactly (5.5 + 1.38)", scoresWithStreak(exactRows, exactBonus, 1, body3).PHYSICAL, 6.88);
  eq("seam: with a 10-week kept streak it adds 1.66 (× 1.20, its only multiplier)", scoresWithStreak([], {}, 1.5, lifeContributionRows([state("BODY", 3, 10)])).PHYSICAL, 1.66);

  const contributions: FieldContribution[] = [...rows.map((f) => ({ fieldName: f.name, level: f.level, composition: f.composition })), ...body3];
  const physical = sourcesFor("PHYSICAL", contributions);
  check(
    "seam: sourcesFor carries source 'LIFE' on life rows and 'FIELD' on Field rows",
    physical.some((s) => s.fieldName === "Life · Body" && s.source === "LIFE") && physical.filter((s) => s.fieldName !== "Life · Body").every((s) => s.source === "FIELD"),
    JSON.stringify(physical)
  );

  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const effects = strip(read("src/lib/skill-effects.ts"));
  check("seam: the base pass, the second pass and loadAttributeScores all pass the life rows", (effects.match(/scoresWithStreak\(rows, streakBonuses, [^)]*, lifeRows\)/g) ?? []).length === 3);
  check("seam: loadProgression is tagged fields, progress and life", /cached\(`progression:\$\{userId\}`, \["fields", "progress", "life"\]/.test(effects));
  const rates = strip(read("src/lib/progress-rate.ts"));
  check("seam: the score rate adds life at both ends, once launched, and is tagged 'life'", (rates.match(/lifeContributionsAt\(/g) ?? []).length === 2 && /isLaunched\(today\)/.test(rates) && /\["fields", "progress", "life"\]/.test(rates));
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

  // The art sheets are not global (fix pass F0): only the art previews and the ceremony load them.
  const artGlobal = ["atmosphere", "field-tier", "equip-attach", "bar-charge", "powerbar", "skies", "cataclysm", "cataclysm-extra"].filter((f) =>
    new RegExp(`import\\s+["'][^"']*\\b${f}\\.css["']`).test(globals + layout)
  );
  check("css: no art sheet is imported by globals.css or the root layout", artGlobal.length === 0, artGlobal.join(", "));
  const artLayout = read("src/app/dev/style/art/layout.tsx");
  const previewSheets = ["atmosphere", "powerbar", "bar-charge", "equip-attach"].filter((f) => !artLayout.includes(`${f}.css`));
  check("css: the art previews import the loadout-bar art themselves", previewSheets.length === 0, previewSheets.join(", "));
  check("css: globals.css has no retired rules (capture-fab hide, float-up-fade, legacy @theme names)", !/\.capture-fab\[data-capture-fab\]|float-up-fade|--color-(ink-3|sub|green|red|crimson|arcane-bright)\b|--radius-control/.test(globals));

  // The legacy 46 px .slot (the art previews' LoadoutBar) is the only .slot: a
  // second global .slot (You › Loadout's grid once) met its fixed height and
  // lost its aspect-ratio, clipping the coin. Every other sheet names its own.
  const slotSheets = cssFiles
    .filter((f) => cssRules(readFileSync(f, "utf8")).some((r) => !r.selector.startsWith("@") && /\.slot(?![\w-])/.test(r.selector)))
    .map((f) => relative(ROOT, f).split("\\").join("/"));
  check("css: only legacy.css styles .slot (others use a namespaced class, e.g. .lo-slot)", slotSheets.length === 1 && slotSheets[0] === "src/app/styles/legacy.css", slotSheets.join(", "));

  // Every legacy alias stays gone (tokens.css keeps only the --rank-* literals).
  const deletedAliases = ["ink-3", "line", "green", "green-10", "nav-h", "base", "sub", "lift", "line-hi", "line-act", "green-hi", "green-06", "red", "red-10", "blue", "blue-10", "amber", "amber-10", "background", "foreground", "shadow-sm", "shadow-md", "shadow-lg"];
  const tokens = read("src/app/styles/tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const redeclared = deletedAliases.filter((a) => new RegExp(`--${a}\\s*:`).test(tokens));
  check("tokens: the retired aliases are not declared", redeclared.length === 0, redeclared.join(", "));
  const srcFiles: string[] = [];
  const walkSrc = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walkSrc(p);
      else if (/\.(tsx?|css|mjs)$/.test(f)) srcFiles.push(p);
    }
  };
  walkSrc(join(ROOT, "src"));
  const aliasUsers = srcFiles.flatMap((f) => {
    const text = readFileSync(f, "utf8");
    return deletedAliases.filter((a) => new RegExp(`var\\(\\s*--${a}\\s*[,)]`).test(text)).map((a) => `${relative(ROOT, f)} --${a}`);
  });
  check("tokens: nothing reads a retired alias", aliasUsers.length === 0, aliasUsers.join("; "));

  // Repo-wide motion (Gate 4): every keyframe animates only transform-family
  // properties, opacity and stroke dashes; transitions never move layout; every
  // infinite loop pauses on --ambient-play (Calm, Still, power-save).
  const ANIMATABLE = new Set(["transform", "translate", "rotate", "scale", "opacity", "stroke-dashoffset", "stroke-dasharray", "offset-distance"]);
  const LAYOUT_PROP = /^(width|height|min-width|min-height|max-width|max-height|left|right|top|bottom|inset|margin|padding|border-width|border-(top|right|bottom|left)-width|font-size|line-height|flex|flex-basis|grid-template|gap|all)$/;
  const kfBad: string[] = [];
  const trBad: string[] = [];
  const loopBad: string[] = [];
  for (const f of cssFiles) {
    const rel = relative(ROOT, f);
    for (const r of cssRules(readFileSync(f, "utf8"))) {
      const kf = /^@keyframes\s+([\w-]+)/.exec(r.selector);
      if (kf) {
        const props = new Set([...r.body.replace(/[^{}]*\{/g, "{").matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]));
        for (const p of props) if (!ANIMATABLE.has(p) && !p.startsWith("--")) kfBad.push(`${rel} @keyframes ${kf[1]}: ${p}`);
        continue;
      }
      for (const m of r.body.matchAll(/(?:^|;)\s*transition(?:-property)?\s*:([^;]*)/g)) {
        for (const part of m[1].split(",")) {
          const p = part.trim().split(/\s+/)[0];
          if (LAYOUT_PROP.test(p)) trBad.push(`${rel} ${r.selector.slice(0, 40)}: transition ${p}`);
        }
      }
      if (/animation(?:-iteration-count)?\s*:[^;]*\binfinite\b/.test(r.body) && !/animation-play-state\s*:\s*var\(--ambient-play/.test(r.body)) {
        loopBad.push(`${rel} ${r.selector.slice(0, 40)}`);
      }
    }
  }
  check("motion (all CSS): keyframes animate only transform, opacity and stroke dashes", kfBad.length === 0, kfBad.join("; "));
  check("motion (all CSS): no transition moves layout (width, height, left, …)", trBad.length === 0, trBad.join("; "));
  check("motion (all CSS): every infinite loop pauses on --ambient-play", loopBad.length === 0, loopBad.join("; "));

  // Inputs are 16 px on phones: a component class that sizes an input below
  // 16 px (in @layer components, which outranks base.css's phone rule) must
  // repeat the phone rule for itself.
  const phoneMiss: string[] = [];
  for (const f of cssFiles) {
    const rules = cssRules(readFileSync(f, "utf8"));
    const isPhone = (at: string[]) => at.some((a) => /@media[^{]*max-width:\s*(5\d\d|599)(\.\d+)?px/.test(a));
    const sizeOf = (body: string): number | null => {
      const fs = /(?:^|;)\s*font-size\s*:\s*([\d.]+)px/.exec(body);
      if (fs) return Number(fs[1]);
      const font = /(?:^|;)\s*font\s*:[^;]*?([\d.]+)px/.exec(body);
      return font ? Number(font[1]) : null;
    };
    for (const r of rules) {
      if (isPhone(r.at) || r.selector.startsWith("@")) continue;
      const size = sizeOf(r.body);
      if (size == null || size >= 16) continue;
      for (const sel of r.selector.split(",")) {
        const cls = /\.([\w-]*input[\w-]*)\s*$/.exec(sel.trim().replace(/:[\w-]+(\([^)]*\))?/g, ""))?.[1];
        if (!cls) continue;
        const fixed = rules.some((q) => isPhone(q.at) && new RegExp(`\\.${cls}\\b`).test(q.selector) && (sizeOf(q.body) ?? 0) >= 16);
        if (!fixed) phoneMiss.push(`${relative(ROOT, f).split("\\").join("/")} .${cls}`);
      }
    }
  }
  // Nothing pending: the lanes landed .st-input, .today-input and .att-input.
  checkPending("inputs: every input class under 16 px repeats the 16 px phone rule (< 600)", [...new Set(phoneMiss)], {});
}

// ── kit class names never collide with Tailwind (block, ring, inline, grow…) ──
{
  const cls = buttonClass("primary", "lg", true, "x").split(" ");
  check("button: block renders .btn-block, never the bare `block` utility", cls.includes("btn-block") && !cls.includes("block"), cls.join(" "));
  const tick = read("src/components/ui/Tick.tsx");
  check("tick: the ring is .tick-ring, never the bare `ring` utility", /className="tick-ring"/.test(tick) && !/className="ring"/.test(tick));
  const effects = read("src/app/styles/effects.css");
  check("tick: the Calm list names .tick-ring", /\.tick \.tick-ring/.test(effects) && !/\.tick \.ring\b/.test(effects));
  const chrome = read("src/components/shell/Chrome.tsx");
  check("chrome: no bare utility names as kit classes (block, grow)", ![...chrome.matchAll(/className="([^"]*)"/g)].some((m) => m[1].split(/\s+/).some((c) => c === "block" || c === "grow")));
}

// ── TypedConfirm: loose by default, exact on request; hands back what was typed ──
{
  check("typed confirm: trimmed and case-insensitive by default", phraseMatches("  delete everything ", "DELETE EVERYTHING"));
  check("typed confirm: exact needs the capitals", !phraseMatches("delete everything", "DELETE EVERYTHING", true) && phraseMatches(" DELETE EVERYTHING ", "DELETE EVERYTHING", true));
  check("typed confirm: an empty phrase never arms", !phraseMatches("", "") && !phraseMatches("x", "  "));
  check("typed confirm: a near miss never arms", !phraseMatches("DELETE EVERYTHIN", "DELETE EVERYTHING"));
  const src = read("src/components/ui/TypedConfirm.tsx");
  check("typed confirm: onConfirm receives the typed text", /onConfirm:\s*\(typed: string\) => void/.test(src) && /onConfirm\(typed\.trim\(\)\)/.test(src));
}

// ── the crest numeral never renders under the 12 px floor ───────────────────
{
  for (const [size, level] of [[24, 14], [34, 14], [38, 14], [48, 14], [96, 14], [168, 14], [20, 3], [38, 120], [34, 120], [48, 120]] as const) {
    const u = crestNumeralUnits(size, level);
    check(`crest: ${size} px, level ${level} → numeral ${u == null ? "omitted" : `${((u * size) / 100).toFixed(1)} px`} (never under ${TEXT_FLOOR_PX})`, u == null || (u * size) / 100 >= TEXT_FLOOR_PX - 0.01);
  }
  eq("crest: the 24 px tab and 20 px inline crests omit the numeral; the rail and top bar keep it", [24, 20, 34, 38].map((s) => crestNumeralUnits(s, 14) != null), [false, false, true, true]);
  eq("crest: no level, no numeral", crestNumeralUnits(96, null), null);
}

// ── chime: a moment plays once per tab ─────────────────────────────────────
{
  let logged = 0;
  const off = subscribeLog(() => logged++);
  chime({ kind: "day-kept", id: "check:day-kept:2026-10-01", text: "Day 3 kept" });
  chime({ kind: "day-kept", id: "check:day-kept:2026-10-01", text: "Day 3 kept" });
  off();
  eq("chime: the same id chimes once (an effect run twice, a re-render)", logged, 1);
  check("chime: hasChimed reports it", hasChimed("check:day-kept:2026-10-01") && !hasChimed("check:other"));
}

// ── /dev/style: gated per request, linked from one strip ────────────────────
{
  const layout = read("src/app/dev/style/layout.tsx");
  check("dev/style: the layout waits for a request (connection) before the gate", /await connection\(\)[\s\S]*devStyleEnabled\(\)/.test(layout));
  check("dev/style: the layout renders the one strip", /<DevStyleNav \/>/.test(layout));
}

// ── redirects: real 307/308s from next.config, before any render ───────────
async function redirectChecks() {
  const config = (await import("../next.config")).default;
  const list = (await config.redirects?.()) ?? [];
  const find = (source: string) => list.find((r) => r.source === source);
  eq("redirect: / → /today, temporary (307)", [find("/")?.destination, find("/")?.permanent], ["/today", false]);
  eq("redirect: /workspace → /review, permanent (308)", [find("/workspace")?.destination, find("/workspace")?.permanent], ["/review", true]);
  eq("redirect: /taxonomy → /structure, permanent (308)", [find("/taxonomy")?.destination, find("/taxonomy")?.permanent], ["/structure", true]);
  const stubs = ["src/app/page.tsx", "src/app/workspace/page.tsx", "src/app/taxonomy/page.tsx"].filter((p) => existsSync(join(ROOT, p)) && /\bredirect\(/.test(read(p)));
  check("redirect: no page-level redirect() stub is left for these paths (it would stream as a meta refresh under loading.tsx)", stubs.length === 0, stubs.join(", "));
}

// ── Tailwind: no class a hand-written sheet styles is also a Tailwind utility ──
// A kit class named like a utility (`block`, `ring`, `inline`, `grow`, `hidden`…)
// gets the utility's declarations too, and the utilities layer always wins.
// Compiled with the real Tailwind, so the list is exactly what v4 generates.
const UTILITY_REFERENCES = new Set([
  // Tailwind's own screen-reader utility, used as a utility; a sheet may qualify it.
  "sr-only",
]);
async function tailwindCollisions() {
  const twDir = join(ROOT, "node_modules/tailwindcss");
  const globalsCss = read("src/app/globals.css");
  const tw = await compile(globalsCss, {
    base: join(ROOT, "src/app"),
    loadStylesheet: async (id: string, base: string) => {
      // Tailwind itself, and its own relative imports; the app's sheets are scanned below, not compiled here.
      if (id === "tailwindcss") return { path: join(twDir, "index.css"), base: twDir, content: readFileSync(join(twDir, "index.css"), "utf8") };
      if (base.startsWith(twDir)) {
        const p = join(base, id);
        return { path: p, base: twDir, content: readFileSync(p, "utf8") };
      }
      return { path: join(base, id), base, content: "" };
    },
  });
  const names = new Map<string, Set<string>>();
  const sheets: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".css")) sheets.push(p);
    }
  };
  walk(join(ROOT, "src"));
  for (const f of sheets) {
    for (const r of cssRules(readFileSync(f, "utf8"))) {
      if (r.selector.startsWith("@")) continue;
      for (const m of r.selector.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
        if (!names.has(m[1])) names.set(m[1], new Set());
        names.get(m[1])!.add(relative(ROOT, f));
      }
    }
  }
  const has = (css: string, n: string) => css.includes(`.${n} {`);
  const before = tw.build([]);
  const after = tw.build([...names.keys()]);
  const hits = [...names.keys()].filter((n) => has(after, n) && !has(before, n) && !UTILITY_REFERENCES.has(n));
  check(
    "tailwind: no hand-written class is also a generated utility (rename it: btn-block, tick-ring, seal-inline, rail-grow…)",
    hits.length === 0,
    hits.map((h) => `.${h} in ${[...names.get(h)!].join(", ")}`).join("; ")
  );
  check("tailwind: the probe really compiles utilities (block is one)", has(tw.build(["block"]), "block"));
}

/** Rules of a stylesheet, flattened, with the @media/@layer/@supports/@container context each sits in. */
function cssRules(css: string): { selector: string; body: string; at: string[] }[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: { selector: string; body: string; at: string[] }[] = [];
  const walk = (text: string, at: string[]) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      let head = text.slice(i, open);
      const semi = head.lastIndexOf(";");
      if (semi >= 0) head = head.slice(semi + 1);
      head = head.trim();
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const inner = text.slice(open + 1, j - 1);
      if (/^@(media|supports|layer|container)\b/.test(head)) walk(inner, [...at, head]);
      else out.push({ selector: head, body: inner, at });
      i = j;
    }
  };
  walk(src, []);
  return out;
}

(async () => {
  try {
    await redirectChecks();
  } catch (e) {
    check("redirect: next.config loads", false, String(e));
  }
  try {
    await tailwindCollisions();
  } catch (e) {
    check("tailwind: the collision probe runs", false, String(e));
  }
  console.log(`\nshell-check: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
