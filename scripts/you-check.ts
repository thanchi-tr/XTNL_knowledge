/**
 * L4 (You, Skills, art) checks. Pure: no database, no network, no server.
 *
 *   npx tsx scripts/you-check.ts
 *
 * Covers: the ladder describes the gate exactly (ready ⇔ no blockers), the
 * coin percentage never claims 100 while anything is unmet, rank order and
 * totals, the unlock Ascension is honest, deterministic and plays once when
 * L3's detector returns its twin, the Cataclysm is first-of-depth only, the
 * sheet arithmetic agrees with the shell, the legacy URLs redirect (308,
 * query kept), and the art CSS keeps the layer order and the motion rule.
 *
 * Fix pass F4 adds: the loadout slots are square (.lo-slot, no clash with the
 * legacy 46 px .slot), radar and track-chart labels are HTML (12 px at every
 * width, never scaled SVG text), Moments are dated in the life zone, the
 * unlock presents its Ascension through L3's stage with the tapped coin,
 * action errors use the kit's .t-error (never --owed), no milestone codes in
 * copy, and every lane stylesheet animates only transform, opacity and
 * stroke-dashoffset, gates every loop on --ambient-play, and names no class
 * that Tailwind also emits as a utility.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { ATTRIBUTES, type AttributeScores } from "../src/lib/attributes";
import { honestyProblem, type CelebrationEvent } from "../src/lib/celebration-types";
import { NEUTRAL_MODIFIERS, unlockBlockers } from "../src/lib/skill-gates";
import { SKILL_POOL, getSkill, type Skill } from "../src/lib/skill-pool";
import { depthOf } from "../src/lib/skill-form";
import { RANK_MATERIAL as VISUALS_RANK_MATERIAL } from "../src/lib/skill-visuals";
import { RANK_MATERIAL } from "../src/lib/materials";
import { REVIEW_STATUS_COLORS, CHART_THEME, seriesDash, fieldColor } from "../src/lib/palette";
import { characterLevelOf } from "../src/components/shell/shell-types";
import {
  LADDER_RANKS,
  buildLadder,
  defaultPath,
  nodeState,
  opensAfter,
  pathSummary,
  readyEmblems,
  requirementsOf,
  skillsOnPath,
  unlockPercent,
  type LadderContext,
} from "../src/components/skills/ladder";
import { buildUnlockEvent, firstOfDepth, mergeUnlockEvents, unlockDedupeKey } from "../src/components/skills/unlock-event";
import {
  RADAR_VIEWBOX,
  characterRaw,
  ghostScores,
  knowledgeRow,
  niceMax,
  polygonPoints,
  radarLayout,
  radarPercent,
  titleDistance,
  topAttributes,
} from "../src/components/home/sheet-math";
import { endLabelTops } from "../src/components/home/TrackCharts";
import { momentMeta, momentMonths } from "../src/app/you/_lib/moments";

const ROOT = join(__dirname, "..");
let pass = 0;
const fails: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fails.push(detail ? `${name} — ${detail}` : name);
}
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// A deterministic LCG for fixtures (never Math.random in a check either).
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function scoresOf(v: (a: string, i: number) => number): AttributeScores {
  const out = {} as AttributeScores;
  ATTRIBUTES.forEach((a, i) => (out[a] = v(a, i)));
  return out;
}

// ── 1. The ladder describes the gate exactly ────────────────────────────────
{
  const rnd = lcg(7);
  let compared = 0;
  let mismatch = "";
  for (let trial = 0; trial < 6; trial++) {
    const scores = scoresOf(() => Math.round(rnd() * 400) / 10);
    const owned = SKILL_POOL.filter(() => rnd() < 0.18).map((s) => s.code);
    const ctx: LadderContext = {
      scores,
      ownedCodes: owned,
      balance: Math.round(rnd() * 3000),
      modifiers: { resonancePercent: trial % 2 ? 10 : 0, attributePenaltyPercent: trial === 3 ? 8 : 0 },
    };
    for (const skill of SKILL_POOL) {
      const blockers = unlockBlockers(skill, scores, owned, ctx.balance, ctx.modifiers);
      const state = nodeState(skill, ctx);
      const reqs = requirementsOf(skill, ctx);
      const isOwned = owned.includes(skill.code);
      const expect = isOwned ? "owned" : blockers.length === 0 ? "ready" : "locked";
      compared++;
      if (state !== expect && !mismatch) mismatch = `${skill.code}: ${state} vs ${expect}`;
      if (!isOwned) {
        const unmet = reqs.filter((r) => !r.met).length;
        const gateUnmet = blockers.filter((b) => b.reason !== "PREREQUISITE").length + (blockers.some((b) => b.reason === "PREREQUISITE") ? 1 : 0);
        if (unmet !== gateUnmet && !mismatch) mismatch = `${skill.code}: ${unmet} unmet rows vs ${gateUnmet} blocker groups`;
        const pct = unlockPercent(reqs);
        if ((state === "ready") !== (pct === 100) && !mismatch) mismatch = `${skill.code}: ${pct}% but ${state}`;
        if ((pct < 0 || pct > 100) && !mismatch) mismatch = `${skill.code}: ${pct}% out of range`;
      }
    }
  }
  check(`ladder: nodeState ⇔ unlockBlockers, unmet rows ⇔ blockers, 100% ⇔ ready (${compared} cases)`, mismatch === "", mismatch);
  check("ladder: unlockPercent never reads 100 while anything is unmet", unlockPercent([{ key: "a", kind: "mastery", label: "", subject: "", have: 999.9, need: 1000, met: false }]) === 99);
  check("ladder: unlockPercent is 100 with no requirements", unlockPercent([]) === 100);
}

// ── 2. Rank order, totals, ordering, summaries ──────────────────────────────
{
  const ctx: LadderContext = { scores: scoresOf(() => 30), ownedCodes: [], balance: 5000, modifiers: NEUTRAL_MODIFIERS };
  let ok = true;
  let detail = "";
  const fail = (why: string) => {
    ok = false;
    detail ||= why;
  };
  for (const a of ATTRIBUTES) {
    const ranks = buildLadder(a, ctx);
    const order = ranks.map((r) => LADDER_RANKS.indexOf(r.rank));
    if (order.some((v, i) => i > 0 && v <= order[i - 1])) fail(`${a}: rank order ${order}`);
    const total = ranks.reduce((s, r) => s + r.total, 0);
    if (total !== skillsOnPath(a).length) fail(`${a}: ${total} vs ${skillsOnPath(a).length}`);
    for (const r of ranks) {
      if (r.material !== RANK_MATERIAL[r.rank]) fail(`${a} ${r.rank} material`);
      const states = r.nodes.map((n) => n.state);
      const firstLocked = states.indexOf("locked");
      const lastReady = states.lastIndexOf("ready");
      if (firstLocked >= 0 && lastReady > firstLocked) fail(`${a} ${r.rank}: ready after locked`);
    }
  }
  check("ladder: Ultimate → Pure, totals equal the path, ready before locked, rank materials", ok, detail);

  const summary = pathSummary(ctx);
  const sumTotals = ATTRIBUTES.reduce((s, a) => s + summary[a].total, 0);
  const expected = SKILL_POOL.reduce((s, k) => s + k.attributes.length, 0);
  check("summary: per-path totals count every skill once per attribute", sumTotals === expected, `${sumTotals} vs ${expected}`);
  const readyCount = readyEmblems(ctx).length;
  const readyByPath = new Set(ATTRIBUTES.flatMap((a) => (summary[a].ready > 0 ? [a] : [])));
  check("summary: something is ready with a generous fixture", readyCount > 0 && readyByPath.size > 0);
  const best = defaultPath(ctx, summary);
  check("defaultPath: the path with the most ready", ATTRIBUTES.every((a) => summary[a].ready <= summary[best].ready));
  const deep = readyEmblems(ctx).map(depthOf);
  check("readyEmblems: deepest first", deep.every((d, i) => i === 0 || d <= deep[i - 1]));
  check("skill-visuals re-exports RANK_MATERIAL from materials", VISUALS_RANK_MATERIAL === RANK_MATERIAL);
}

// ── 3. The unlock Ascension ─────────────────────────────────────────────────
{
  const apex = SKILL_POOL.find((s) => s.rank === "APEX")!;
  const ctx: LadderContext = { scores: scoresOf(() => 999), ownedCodes: apex.prerequisites, balance: apex.masteryCost + 146, modifiers: NEUTRAL_MODIFIERS };
  const input = {
    skill: apex,
    balanceBefore: ctx.balance,
    balanceAfter: 146,
    ownedBefore: ctx.ownedCodes.length,
    poolSize: SKILL_POOL.length,
    requirements: requirementsOf(apex, ctx),
    opens: opensAfter(apex, ctx.ownedCodes),
  };
  const ev = buildUnlockEvent(input);
  const again = buildUnlockEvent(input);
  check("unlock: honest (exact number and a cause)", honestyProblem(ev) === null, honestyProblem(ev) ?? "");
  check("unlock: tier 3 emblem-unlock keyed unlock:<code>", ev.tier === 3 && ev.kind === "emblem-unlock" && ev.dedupeKey === unlockDedupeKey(apex.code) && ev.id === ev.dedupeKey);
  check("unlock: the amount is exactly the cost, as a debit", ev.facts.amounts?.[0]?.kind === "mp" && ev.facts.amounts?.[0]?.value === -apex.masteryCost);
  check("unlock: the cost line states what is left", Boolean(ev.facts.cost?.includes("146 left")));
  check("unlock: What moved states the balance before → after", ev.what.some((w) => w.label === "Mastery points" && w.value.endsWith("→ 146")));
  check("unlock: the art names the emblem and its depth", ev.facts.art?.type === "emblem" && ev.facts.art.code === apex.code && ev.facts.art.depth === depthOf(apex));
  check("unlock: deterministic (same input, same event)", JSON.stringify(ev) === JSON.stringify(again));
  check("unlock: the cause names the met gate", Boolean(ev.facts.cause?.startsWith("Unlocked because")));

  // First-of-depth: only the first emblem owned at 13, 14 or 15 plays the Cataclysm.
  const otherApex = SKILL_POOL.find((s) => s.rank === "APEX" && s.code !== apex.code)!;
  const shallow = SKILL_POOL.find((s) => depthOf(s) < 13)!;
  check("cataclysm: the first Apex plays it", firstOfDepth(apex, []));
  check("cataclysm: a second Apex does not", !firstOfDepth(apex, [otherApex.code]));
  check("cataclysm: never below depth 13", !firstOfDepth(shallow, []));

  // One unlock plays once: L3's twin (by dedupeKey, or a first-ultimate naming the same emblem).
  const twin: CelebrationEvent = { ...ev, id: "row-1", facts: { ...ev.facts, grants: ["Your title is now Ascendant"] }, what: [{ label: "Title", value: "Adept → Ascendant" }] };
  const title: CelebrationEvent = { id: "row-2", tier: 3, kind: "title", facts: { eyebrow: "Title", title: "Scholar", numeral: { from: 20, to: 21 }, cause: "x" }, what: [] };
  const merged = mergeUnlockEvents(ev, [twin, title]);
  check("merge: the twin collapses into one event with the server id", merged.length === 2 && merged[0].id === "row-1" && merged[1].id === "row-2");
  check("merge: local facts win, the twin's extra grants and rows are kept", merged[0].facts.cost === ev.facts.cost && (merged[0].facts.grants ?? []).includes("Your title is now Ascendant") && merged[0].what.some((w) => w.label === "Title"));
  const firstUlt: CelebrationEvent = { id: "row-3", tier: 3, kind: "first-ultimate", dedupeKey: "first-ultimate", facts: { eyebrow: "E", title: apex.name, kicker: "Your first Ultimate", art: ev.facts.art, numeral: { from: null, to: 1 } }, what: [] };
  const m2 = mergeUnlockEvents(ev, [firstUlt]);
  check("merge: a first-ultimate naming the same emblem is the twin", m2.length === 1 && m2[0].id === "row-3" && m2[0].kind === "first-ultimate" && m2[0].facts.kicker === "Your first Ultimate");
  check("merge: no twin → the local event leads, nothing dropped", mergeUnlockEvents(ev, [title]).length === 2);
}

// ── 4. The sheet's arithmetic ───────────────────────────────────────────────
{
  const levels = [8.4, 3, 12.5, 0, 1];
  const shell = characterLevelOf(levels);
  const raw = characterRaw(levels);
  check("sheet: character level and progress agree with the shell", Math.floor(raw) === shell.level && Math.abs(raw - Math.floor(raw) - shell.progress) < 1e-9);

  let prev = -1;
  let prevCurrent = "";
  let mono = true;
  for (let r = 0; r <= 100; r += 0.25) {
    const d = titleDistance(r);
    if (d.fraction < 0 || d.fraction > 1) mono = false;
    if (d.current === prevCurrent && d.fraction + 1e-12 < prev) mono = false;
    prev = d.fraction;
    prevCurrent = d.current;
  }
  check("sheet: distance to the next title stays in 0..1 and never drops within a band", mono);
  check("sheet: transcendent has no next title", titleDistance(40, true).next === null);

  const now = [{ name: "A", level: 10 }, { name: "B", level: 4 }];
  check("knowledge: no week-old snapshot → no gain claimed", knowledgeRow(now, []).gained === null);
  const same = knowledgeRow(now, now);
  check("knowledge: unchanged week → zero gain, nobody grew", same.gained === 0 && same.grewMost === null && same.banked === same.now);
  const grew = knowledgeRow(now, [{ name: "A", level: 9.5 }, { name: "B", level: 4 }]);
  check("knowledge: a grown Field is named", grew.grewMost === "A" && (grew.gained ?? 0) > 0);

  const scores = scoresOf((_, i) => i * 10);
  const comps = [{ name: "A", level: 10, composition: Object.fromEntries(ATTRIBUTES.map((a, i) => [a, i === 0 ? 100 : 0])) as never }];
  check("ghost: null without a snapshot", ghostScores(scores, comps, []) === null);
  const g = ghostScores(scores, comps, [{ name: "A", level: 10 }]);
  check("ghost: unchanged Field levels → the ghost equals today", g !== null && ATTRIBUTES.every((a) => g[a] === scores[a]));
  const g2 = ghostScores(scores, comps, [{ name: "A", level: 5 }]);
  check("ghost: scales the attribute its Field feeds, never above today", g2 !== null && g2[ATTRIBUTES[0]] === scores[ATTRIBUTES[0]] * 0.5 && ATTRIBUTES.every((a) => g2[a] <= scores[a]));

  const axes = ATTRIBUTES.map((a, i) => ({ attribute: a, label: a, value: i * 7, sides: 3 + (i % 5), hue: "#fff" }));
  const layout = radarLayout(axes, null);
  check("radar: 13 markers, labels, 4 rings, no ghost without data", layout.markers.length === 13 && layout.labels.length === 13 && layout.rings.length === 4 && layout.ghost === null);
  check("radar: exactly one lead label (the top attribute)", layout.labels.filter((l) => l.lead).length === 1);
  check("radar: niceMax is a round ceiling ≥ the max", niceMax([412, 388]) === 500 && niceMax([0]) === 1 && niceMax([9.5]) === 10);
  check("radar: polygon glyphs clamp to 3..8 sides", polygonPoints(2, 0, 0, 1).split(" ").length === 3 && polygonPoints(12, 0, 0, 1).split(" ").length === 8);
  const top = topAttributes(scores, null, () => "Stats");
  check("top three: highest first, the first gives the epithet", top.length === 3 && top[0].value >= top[1].value && top[0].note.includes("epithet") && top[1].note === "from Stats");

  // Radar labels are HTML placed by percentage over the scaled SVG (12 px at any width).
  const corners = [radarPercent(RADAR_VIEWBOX.x, RADAR_VIEWBOX.y), radarPercent(RADAR_VIEWBOX.x + RADAR_VIEWBOX.w, RADAR_VIEWBOX.y + RADAR_VIEWBOX.h), radarPercent(0, 0)];
  check("radar labels: viewBox corners map to 0% / 100%, the centre to 50%", corners[0].left === 0 && corners[0].top === 0 && corners[1].left === 100 && corners[1].top === 100 && corners[2].left === 50 && corners[2].top === 50);
  const inBox = layout.labels.every((l) => l.left >= 0 && l.left <= 100 && l.top >= 0 && l.top <= 100);
  const sided = layout.labels.every((l) => (l.anchor === "start" ? l.left > 50 : l.anchor === "end" ? l.left < 50 : Math.abs(l.left - 50) < 3));
  check("radar labels: every anchor inside the plot box, start on the right, end on the left", inBox && sided);
}

// ── 4b. Track-chart end labels never print on top of each other ───────────
{
  const ys = [31.7, 66.7, 90, 101.7, 178, 175];
  const tops = endLabelTops(ys);
  const order = ys.map((y, i) => i).sort((a, b) => ys[a] - ys[b] || a - b);
  let spaced = true;
  for (let k = 1; k < order.length; k++) if (tops[order[k]] - tops[order[k - 1]] < 18 - 1e-9) spaced = false;
  check("track labels: at least 18 units apart, order kept", spaced && tops.length === ys.length);
  check("track labels: kept inside the plot", tops.every((t) => t >= 9 && t <= 180 - 9));
  check("track labels: far-apart labels do not move", JSON.stringify(endLabelTops([20, 80, 140])) === JSON.stringify([20, 80, 140]));
}

// ── 4c. Moments are dated in the life zone, not the host's ─────────────────
{
  // 07:30 on 1 Oct in Sydney is still 30 Sep in UTC.
  const ev = { id: "m1", tier: 3 as const, kind: "emblem-unlock" as const, facts: { eyebrow: "Emblem", title: "X", kicker: "Ascension", cost: "Spent 10 MP · 5 left" }, what: [], createdAt: "2026-09-30T21:30:00.000Z" };
  const older = { ...ev, id: "m0", createdAt: "2026-09-29T10:00:00.000Z" };
  const syd = momentMonths([ev, older], "Australia/Sydney");
  check("moments: grouped by the life-zone month", syd.length === 2 && syd[0].month === "October 2026" && syd[1].month === "September 2026");
  check("moments: dated by the life-zone day", momentMeta(ev, "Australia/Sydney") === "Ascension · 1 Oct · Spent 10 MP · 5 left");
  check("moments: the zone is honoured (UTC reads 30 Sept)", momentMonths([ev], "UTC")[0].month === "September 2026" && momentMeta(ev, "UTC").includes("30 Sept"));
  check("moments: undated rows group together", momentMonths([{ ...ev, createdAt: undefined }, { ...ev, createdAt: "nope" }])[0].events.length === 2);
}

// ── 5. Palette on tokens ────────────────────────────────────────────────────
{
  const vals = [...Object.values(REVIEW_STATUS_COLORS), ...Object.values(CHART_THEME)];
  check("palette: review status and chart chrome are tokens", vals.every((v) => v.startsWith("var(--")));
  check("palette: series are told apart by dash, the first solid", seriesDash(0) === "" && seriesDash(1) !== seriesDash(2));
  check("palette: the legacy fieldColor still returns hex (other lanes append alpha)", /^#[0-9A-F]{6}$/i.test(fieldColor("Statistics")));
}

// ── 6. Legacy URLs redirect, not 404 ────────────────────────────────────────
async function redirects() {
  const overview = await import("../src/app/overview/route");
  const dashboard = await import("../src/app/dashboard/route");
  const preview = await import("../src/app/skills/preview/[[...slug]]/route");
  const r1 = overview.GET(new Request("http://x.test/overview?tab=1"));
  check("redirect: /overview → /you (308, query kept)", r1.status === 308 && r1.headers.get("location") === "http://x.test/you?tab=1");
  const r2 = dashboard.GET(new Request("http://x.test/dashboard"));
  check("redirect: /dashboard → /you/stats (308)", r2.status === 308 && r2.headers.get("location") === "http://x.test/you/stats");
  const r3 = await preview.GET(new Request("http://x.test/skills/preview/skies"), { params: Promise.resolve({ slug: ["skies"] }) });
  check("redirect: /skills/preview/skies → /dev/style/art/skies", r3.status === 308 && r3.headers.get("location") === "http://x.test/dev/style/art/skies");
  const r4 = await preview.GET(new Request("http://x.test/skills/preview"), { params: Promise.resolve({}) });
  check("redirect: /skills/preview → the ladder sheet", r4.headers.get("location") === "http://x.test/dev/style/art/ladder");
  for (const leaf of ["all", "attach-all", "attach-bar", "footer", "resonance", "skies", "ladder", "you"]) {
    check(`art: /dev/style/art/${leaf} exists`, existsSync(join(ROOT, `src/app/dev/style/art/${leaf}/page.tsx`)));
  }
  check("routes: /overview and /dashboard have no page (the handler owns them)", !existsSync(join(ROOT, "src/app/overview/page.tsx")) && !existsSync(join(ROOT, "src/app/dashboard/page.tsx")));
  for (const p of ["you", "you/loadout", "you/moments", "you/stats", "skills", "skills/[attribute]"]) {
    check(`routes: /${p} has a page and a loading skeleton`, existsSync(join(ROOT, `src/app/${p}/page.tsx`)) && existsSync(join(ROOT, `src/app/${p}/loading.tsx`)));
    check(`routes: /${p} states a metadata title`, /metadata|generateMetadata/.test(read(`src/app/${p}/page.tsx`)));
  }
}

// ── 7. CSS: layers, loops, the motion rule ──────────────────────────────────
const ART_CSS = ["arcane", "atmosphere", "bar-charge", "cataclysm", "cataclysm-extra", "equip-attach", "insignia", "powerbar", "skies"].map((f) => `src/app/${f}.css`);
const MY_CSS = ["src/components/home/you.css", "src/components/skills/skills.css", "src/components/skills/loadout-strip.css"];
const LANE_CSS = [...ART_CSS, ...MY_CSS];
const stripCss = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
/** The legacy alias block in tokens.css (Acceptance 2: zero uses before it is deleted). */
const LEGACY_ALIAS = /var\(--(base|sub|lift|ink-3|line|line-hi|line-act|green|green-hi|green-10|green-06|red|red-10|blue|blue-10|amber|amber-10|nav-h|background|foreground|shadow-sm|shadow-md|shadow-lg)\s*[,)]/;

/** Every `@keyframes name { … }` with its balanced body. */
function keyframesOf(css: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    let depth = 1;
    let i = re.lastIndex;
    while (depth > 0 && i < css.length) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    out.push({ name: m[1], body: css.slice(re.lastIndex, i - 1) });
  }
  return out;
}

/** Top-level comma split (commas inside cubic-bezier(…) or var(…) stay put). */
function splitTop(v: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of v) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Class names in a stylesheet's selectors (not in declaration values). */
function selectorClasses(css: string): string[] {
  const names = new Set<string>();
  for (const m of css.matchAll(/([^{}]+)\{/g)) for (const c of m[1].matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) names.add(c[1]);
  return [...names];
}

type UtilityTest = (names: string[]) => string[];

/**
 * Which names Tailwind also emits as utilities: the project's own design
 * system (globals.css through @tailwindcss/node) when it loads, a static list
 * of the bare-word utilities otherwise. A kit or lane class with such a name
 * loses to the utilities layer (the Button `block` bug).
 */
async function tailwindUtilities(): Promise<{ test: UtilityTest; via: string }> {
  try {
    const tw = await import("@tailwindcss/node");
    const ds = await tw.__unstable__loadDesignSystem(read("src/app/globals.css"), { base: join(ROOT, "src/app") });
    return {
      test: (names) => {
        const css = ds.candidatesToCss(names);
        return names.filter((_, i) => Boolean(css[i]));
      },
      via: "the Tailwind design system",
    };
  } catch {
    const BARE = new Set(
      "block inline inline-block inline-flex inline-grid flex grid table contents hidden flow-root list-item static fixed absolute relative sticky visible invisible collapse isolate grow shrink truncate italic underline overline uppercase lowercase capitalize ring border rounded shadow outline blur filter transform transition container resize sr-only".split(" ")
    );
    return { test: (names) => names.filter((n) => BARE.has(n)), via: "a static list (Tailwind did not load)" };
  }
}

function cssChecks(isUtility: UtilityTest, via: string) {
  const ORDER = "@layer theme, base, components, art, effects, utilities;";
  for (const f of LANE_CSS) check(`css: ${f} starts with the layer order`, read(f).split(/\r?\n/)[0].trim() === ORDER);
  const MOTION_OK = new Set(["transform", "opacity", "stroke-dashoffset", "offset", "animation-timing-function"]);
  for (const f of LANE_CSS) {
    const css = stripCss(read(f));
    const badKf: string[] = [];
    for (const k of keyframesOf(css)) for (const d of k.body.matchAll(/([a-z-]+)\s*:/g)) if (!MOTION_OK.has(d[1])) badKf.push(`${k.name}:${d[1]}`);
    check(`css: ${f} keyframes animate only transform, opacity, stroke-dashoffset`, badKf.length === 0, badKf.join(", "));
    const badTr: string[] = [];
    for (const t of css.matchAll(/transition(?:-property)?\s*:\s*([^;}]+)/g)) {
      for (const part of splitTop(t[1])) {
        const prop = part.split(/\s+/)[0];
        if (prop !== "none" && !MOTION_OK.has(prop)) badTr.push(prop);
      }
    }
    check(`css: ${f} transitions only transform and opacity`, badTr.length === 0, badTr.join(", "));
    const ungated: string[] = [];
    for (const b of css.matchAll(/([^{};]*)\{([^{}]*)\}/g)) {
      if (/animation[^;]*\binfinite\b/.test(b[2]) && !/animation-play-state\s*:[^;]*var\(--ambient-play/.test(b[2])) ungated.push(b[1].trim().slice(0, 60));
    }
    check(`css: ${f} runs every loop on --ambient-play`, ungated.length === 0, ungated.join(" | "));
    const small = [...css.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1])).filter((v) => v < 12);
    check(`css: ${f} has no text under 12 px`, small.length === 0, small.join(", "));
    check(`css: ${f} uses no legacy token alias`, !LEGACY_ALIAS.test(css), css.match(LEGACY_ALIAS)?.[0] ?? "");
    const clash = isUtility(selectorClasses(css));
    check(`css: ${f} names no class Tailwind also emits (${via})`, clash.length === 0, clash.join(", "));
  }
  for (const f of MY_CSS) check(`css: ${f} runs no infinite loop`, !/infinite/.test(stripCss(read(f))));
  for (const f of ["src/app/cataclysm.css", "src/app/cataclysm-extra.css"]) {
    check(`css: ${f} (the real ceremony) has no infinite animation`, !/\binfinite\b/.test(stripCss(read(f))));
  }
  const arcane = stripCss(read("src/app/arcane.css"));
  const surge = arcane.slice(arcane.indexOf("@keyframes page-surge-wash"));
  check("css: the page surge animates no `bottom` and uses no filter", !/bottom\s*:/.test(surge.slice(0, surge.indexOf("}\n}") + 3)) && !/filter\s*:/.test(arcane));
  check("css: nav motes are gone", !/nav-motes/.test(stripCss(read("src/app/insignia.css"))));
  check("css: field-tier.css is retired (the Library draws .lib-ftile)", !existsSync(join(ROOT, "src/app/field-tier.css")));
  check("css: the unused .word-hints* and .arcane-circle rules are gone", !/\.word-hint/.test(stripCss(read("src/app/insignia.css"))) && !/\.arcane-circle/.test(arcane));

  const you = stripCss(read("src/components/home/you.css"));
  check("css: You › Loadout never styles a bare .slot/.slots (legacy.css owns the 46 px preview slot)", !/\.slots?(?![\w-])/.test(you));
  const lo = you.match(/\.lo-slot\s*\{([^}]*)\}/)?.[1] ?? "";
  check("css: .lo-slot is square (height auto, aspect-ratio 1, at least 44 px)", /height:\s*auto/.test(lo) && /aspect-ratio:\s*1\b/.test(lo) && /min-width:\s*44px/.test(lo));
  check("css: no SVG text styled in you.css (labels are HTML, never scaled below 12 px)", !/(^|[\s,>])text\s*[{.,]/.test(you));

  const layout = read("src/app/layout.tsx") + read("src/app/globals.css");
  check("css: skies.css and cataclysm*.css are not global", !/@?import\s+["'][^"']*(skies|cataclysm)[\w-]*\.css/.test(layout));
  check("css: skies.css is imported by the /skills segment and the art previews", /skies\.css/.test(read("src/app/skills/layout.tsx")) && /skies\.css/.test(read("src/app/dev/style/art/layout.tsx")));
  check("css: the Cataclysm component carries its own sheets", /cataclysm\.css/.test(read("src/components/skills/Cataclysm.tsx")) && /cataclysm-extra\.css/.test(read("src/components/skills/Cataclysm.tsx")));
}

// ── 8. Real pages: still emblems, no randomness, no legacy aliases ──────────
function sourceChecks(isUtility: UtilityTest, via: string) {
  const walk = (dir: string): string[] =>
    readdirSync(join(ROOT, dir)).flatMap((n) => {
      const p = `${dir}/${n}`;
      return statSync(join(ROOT, p)).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(n) ? [p] : [];
    });
  const PREVIEW = /(AttachAllPreview|AttachBurstPreview|BarChargePreview|FooterPreview|LoadoutBar|EquipPulse|BarCharge|ComboPopup|Cataclysm|ResonanceAtmosphere|SkillLogo)\.tsx$/;
  const lane = [...walk("src/app/you"), ...walk("src/app/skills"), ...walk("src/components/skills"), ...walk("src/components/home"), ...walk("src/app/dev/style/art")].filter(
    (f) => !/FieldFocusPanel/.test(f)
  );
  const real = lane.filter((f) => !PREVIEW.test(f) && !f.startsWith("src/app/dev/"));
  const moving = real.filter((f) => f.endsWith(".tsx") && /<SkillLogo\b(?![^>]*animated=\{false\})[^>]*>/.test(read(f)));
  check("pages: every emblem on a real page is still (SkillLogo animated={false})", moving.length === 0, moving.map((f) => relative(ROOT, f)).join(", "));
  const random = real.filter((f) => /Math\.random/.test(read(f)));
  check("pages: nothing random", random.length === 0, random.join(", "));
  const legacy = lane.filter((f) => LEGACY_ALIAS.test(read(f)));
  check("lane: no legacy token aliases (previews and CSS included)", legacy.length === 0, legacy.join(", "));
  const small = real.filter((f) => f.endsWith(".tsx")).flatMap((f) =>
    [...read(f).matchAll(/fontSize:\s*([\d.]+)/g)].map((m) => Number(m[1])).filter((v) => v < 12).map((v) => `${relative(ROOT, f)}:${v}`)
  );
  check("pages: no inline text under 12 px", small.length === 0, small.join(", "));
  const unlocks = getSkill(SKILL_POOL[0].code) as Skill;
  check("pool sanity: getSkill round-trips", unlocks.code === SKILL_POOL[0].code);

  // Copy: no internal milestone codes ("M5") in anything a player reads.
  const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const milestones = real.filter((f) => /\.tsx?$/.test(f) && /\bM[1-9]\b/.test(code(f)));
  check("copy: no milestone codes (M2…M5) on real pages", milestones.length === 0, milestones.join(", "));

  // Class names on real pages are lane or kit classes, never a Tailwind utility by accident.
  const classNames = new Set<string>();
  for (const f of real.filter((x) => x.endsWith(".tsx"))) {
    const src = read(f);
    for (const m of src.matchAll(/className=\{?["'`]([^"'`$]+)["'`]/g)) for (const n of m[1].split(/\s+/)) if (n) classNames.add(n);
    for (const m of src.matchAll(/cx\(([^)]*)\)/g)) for (const q of m[1].matchAll(/["']([^"']+)["']/g)) for (const n of q[1].split(/\s+/)) if (n) classNames.add(n);
  }
  const twOnPages = isUtility([...classNames]).filter((n) => n !== "sr-only");
  check(`pages: no lane class is also a Tailwind utility (${via})`, twOnPages.length === 0, twOnPages.join(", "));

  // Loadout: square .lo-slot boxes, and a skeleton at the same geometry.
  const grid = read("src/components/skills/LoadoutGrid.tsx");
  check("loadout: the grid uses .lo-slots / .lo-slot, never the legacy .slot", /className="lo-slots"/.test(grid) && /cx\("lo-slot"/.test(grid) && /"lo-slot empty"/.test(grid) && !/className="slots?[\s"]|cx\("slots?"/.test(grid));
  const skel = read("src/app/you/loadout/loading.tsx");
  check("loadout: the skeleton draws the slot's own square (no fixed 56 px block)", /lo-slot-skel/.test(skel) && /className="lo-slots"/.test(skel) && !/h=\{56\}/.test(skel));

  // The unlock: one present() with the tapped coin; the curtain draws CeremonyArt / CeremonyBackdrop.
  const unlock = code("src/components/skills/UnlockButton.tsx");
  check("unlock: the Ascension goes through L3's present() with fromEl, not a bare enqueue", /from "@\/components\/celebrate\/stage"/.test(unlock) && /present\(ascension,\s*\{[^}]*fromEl/.test(unlock) && !/\benqueue\(/.test(unlock));
  check("unlock: a first deep unlock still flags the Cataclysm", /markCataclysm\(ascension\.id\)/.test(unlock));
  check("unlock: ladder and graph nodes carry data-emblem (the flight's origin)", /data-emblem=\{n\.skill\.code\}/.test(read("src/components/skills/PathLadder.tsx")) && /data-emblem=\{skill\.code\}/.test(read("src/components/skills/SkillTree.tsx")));

  // Action errors: the kit's .t-error through <ActionError/>, never --owed.
  const owedAlerts = lane.filter((f) => f.endsWith(".tsx") && /role="alert"[^>]*var\(--owed\)|var\(--owed\)[^>]*role="alert"/.test(read(f)));
  check("errors: no action error is painted --owed (owed names debt)", owedAlerts.length === 0, owedAlerts.join(", "));
  check("errors: <ActionError/> renders the kit .t-error with role=alert", /role="alert"/.test(read("src/components/home/ActionError.tsx")) && /"t-error"/.test(read("src/components/home/ActionError.tsx")));

  // Charts: SVG text scales with its viewBox (8.9 px on a 344 px phone); labels are HTML.
  for (const f of ["src/components/home/SheetSections.tsx", "src/components/home/TrackCharts.tsx"]) check(`charts: ${f} draws no SVG <text>`, !/<text\b/.test(read(f)));

  // Moments read dates in the life zone.
  const moments = read("src/app/you/moments/page.tsx");
  check("moments: the page dates through the life-zone helpers, not a bare Intl.DateTimeFormat", /momentMonths\(/.test(moments) && /momentMeta\(/.test(moments) && !/new Intl\.DateTimeFormat/.test(moments));

  // A truncated name (.hbars .nm: nowrap + ellipsis) always carries its full text as a title.
  const stats = read("src/app/you/stats/page.tsx");
  const nm = [...stats.matchAll(/className="nm"([^>]*)>/g)];
  check("stats: every ellipsised .nm row has a title", nm.length > 0 && nm.every((m) => /\btitle=/.test(m[1])), `${nm.filter((m) => !/\btitle=/.test(m[1])).length} without`);

  // Tailwind-colliding class names retired from the lane.
  check("classes: no bare `grow` class (Tailwind's flex-grow utility)", !lane.some((f) => f.endsWith(".tsx") && /className="grow"/.test(read(f))));
}

(async () => {
  await redirects();
  const tw = await tailwindUtilities();
  cssChecks(tw.test, tw.via);
  sourceChecks(tw.test, tw.via);
  console.log(`you-check: ${pass} passed, ${fails.length} failed`);
  for (const f of fails) console.log(`  FAIL ${f}`);
  process.exit(fails.length ? 1 : 0);
})();
