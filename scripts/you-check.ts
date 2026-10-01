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
 *
 * Life on the sheet (§4d–§4k): the character level agrees with the shell
 * with tracks too, a life row is named as the top-three source with its
 * exact share ('from Life · Body +2.8'), the ghost moves only by a life
 * row's level change, Life tracks renders 5 rows once life counts and 1
 * before, the goal ladder's copy (stated payout, preview, carried, closed),
 * habits by rung, the life note guards storage, the kept-weeks cells are
 * named by week, the track lines draw 2–12 points, the figure and date
 * labels, the first judged week, and (§8) the rules card types no number
 * by hand.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
  LIFE_NOTE_DAYS,
  RADAR_VIEWBOX,
  characterRaw,
  firstWeekJudgement,
  ghostScores,
  knowledgeRow,
  lifeCompositions,
  lifeNoteDue,
  lifeTrackRows,
  longDayLabel,
  mainSource,
  mainSourceOf,
  mpFigure,
  niceMax,
  polygonPoints,
  radarLayout,
  radarPercent,
  shortDayLabel,
  sourceLabel,
  titleDistance,
  topAttributes,
  weekdayDayLabel,
  type FieldComposition,
} from "../src/components/home/sheet-math";
import { KeptWeeks, endLabelTops, keptCellLabel, trackLinesGeometry } from "../src/components/home/TrackCharts";
import { LifeTracks } from "../src/components/home/SheetSections";
import { goalRowCopy, rungsLine } from "../src/components/home/GoalLadder";
import { LIFE_NOTE_KEY, readNoteDismissed, writeNoteDismissed } from "../src/components/home/LifeNote";
import { statedPayoutCopy, type GoalLadderItem, type GoalPayout } from "../src/lib/goals";
import { GOAL_RULES } from "../src/lib/life-economy";
import type { LifeTrackRow } from "../src/lib/life-tracks";
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

// ── 4d. Life joins the sheet's arithmetic ──────────────────────────────────
const comp = (w: Partial<Record<string, number>>) => Object.fromEntries(ATTRIBUTES.map((a) => [a, w[a] ?? 0])) as FieldComposition["composition"];
/** life-lexicon TRACK_SEED.BODY: PHYSICAL 46 / STUBBORNNESS 24 / SELF_RESPECT 20 / FAITH 10. */
const BODY_SEED = comp({ PHYSICAL: 46, STUBBORNNESS: 24, SELF_RESPECT: 20, FAITH: 10 });
{
  const levels = [8.4, 3, 12.5, 0, 1];
  const tracks = [3, 1, 0, 7];
  const shell = characterLevelOf(levels, tracks);
  const raw = characterRaw(levels, tracks);
  check("sheet: character level and progress agree with the shell, with tracks", Math.floor(raw) === shell.level && Math.abs(raw - Math.floor(raw) - shell.progress) < 1e-9);
  const before = levels.reduce((sum, l) => sum + Math.pow(Math.max(0, l), 0.75), 0);
  check("sheet: characterRaw(levels) is the Fields-only sum, unchanged for one argument", characterRaw(levels) === before && characterRaw(levels, []) === before && characterRaw(levels, [0, 0, 0, 0]) === before);
  check("sheet: tracks add L^0.75 each", Math.abs(characterRaw([4, 9, 2], [3, 1]) - (4 ** 0.75 + 9 ** 0.75 + 2 ** 0.75 + 3 ** 0.75 + 1)) < 1e-12);

  // A life row is named as the top-three source with its exact share; a Field keeps its name alone.
  const field = { name: "Stats", level: 4, composition: comp({ PHYSICAL: 10, MIND: 90 }) };
  const life = lifeCompositions([{ fieldName: "Life · Body", level: 6, composition: BODY_SEED, source: "LIFE" }]);
  const sources: FieldComposition[] = [field, ...life];
  const src = mainSourceOf("PHYSICAL", sources);
  check("mainSourceOf: 'Life · Body' when the life row contributes most", src?.name === "Life · Body" && src.source === "LIFE" && Math.abs(src.value - 2.76) < 1e-9);
  check("mainSourceOf: a Field when the Field contributes most", mainSourceOf("MIND", sources)?.name === "Stats" && mainSourceOf("MIND", sources)?.source === "FIELD");
  check("mainSourceOf: null when nothing feeds the attribute", mainSourceOf("LOGIC", sources) === null && mainSource("LOGIC", sources) === null);
  check("mainSource keeps its name-only answer", mainSource("PHYSICAL", sources) === "Life · Body" && mainSource("MIND", [field]) === "Stats");
  const scores = scoresOf((a) => (a === "MIND" ? 20 : a === "PHYSICAL" ? 9 : a === "STUBBORNNESS" ? 4 : 0));
  const top = topAttributes(scores, null, (a) => sourceLabel(mainSourceOf(a, sources)));
  check("top three: a life source reads 'from Life · Body +2.8'", top[1]?.attribute === "PHYSICAL" && top[1].note === "from Life · Body +2.8", top[1]?.note ?? "");
  check("top three: a Field source keeps 'from <Field>'", sourceLabel({ name: "Stats", value: 3.2, source: "FIELD" }) === "Stats" && sourceLabel(null) === null);

  // The ghost moves only by a life row's level change.
  const now = { ...scoresOf(() => 0), MIND: 10, PHYSICAL: 1.38, STUBBORNNESS: 0.72, SELF_RESPECT: 0.6, FAITH: 0.3 };
  const rows: FieldComposition[] = [{ name: "A", level: 10, composition: comp({ MIND: 100 }) }, ...lifeCompositions([{ fieldName: "Life · Body", level: 3, composition: BODY_SEED, source: "LIFE" }])];
  const g = ghostScores(now, rows, [{ name: "A", level: 10 }, { name: "Life · Body", level: 2 }]);
  check(
    "ghost: a life row at 2 a week ago (3 now) scales only the attributes it feeds, by 2/3",
    g !== null && g.MIND === 10 && g.LOGIC === 0 && Math.abs(g.PHYSICAL - 0.92) < 1e-9 && Math.abs(g.FAITH - 0.2) < 1e-9
  );
  const g0 = ghostScores(now, rows, [{ name: "A", level: 10 }]);
  check("ghost: a life row absent a week ago reads as 0 then, Fields untouched", g0 !== null && g0.MIND === 10 && g0.PHYSICAL === 0);
  const same = ghostScores(now, rows, [{ name: "A", level: 10 }, { name: "Life · Body", level: 3 }]);
  check("ghost: unchanged life and Field levels → the ghost equals today", same !== null && ATTRIBUTES.every((a) => same[a] === now[a]));
}

// ── 4e. Life tracks: 5 rows once life counts, 1 before ─────────────────────
{
  const row = (track: LifeTrackRow["track"], name: string, extra: Partial<LifeTrackRow> = {}): LifeTrackRow => ({
    track,
    name,
    sigil: track.toLowerCase() as LifeTrackRow["sigil"],
    level: 3,
    xp: 500,
    nextXp: 784,
    cap: 5,
    atCap: false,
    keptWeeks: 9,
    keptStreak: 2,
    goalDepth: 0,
    banked: 0.3,
    now: 0.4,
    weeks: ["kept", "missed", "kept"],
    line: "500 / 784 XP · depth cap 5 · 2 more kept weeks raise it",
    edge: 0.6,
    ...extra,
  });
  const rows = [row("DUTY", "Duty", { atCap: true, now: 1, banked: 1 }), row("CRAFT", "Craft"), row("BODY", "Body"), row("CARE", "Care", { level: 0, xp: 0, weeks: [] })];
  const k = knowledgeRow([{ name: "A", level: 10 }], []);
  const on = lifeTrackRows(k, { launched: true, rows });
  check("life tracks: launched → Duty, Craft, Body, Care, then Knowledge", on.map((r) => r.name).join(",") === "Duty,Craft,Body,Care,Knowledge");
  check("life tracks: the cap tick only on a capped row, at 1", on[0].cap === 1 && on[0].capped === true && on[1].cap === undefined && !on[1].capped);
  check("life tracks: pips pass through, never padded", on[1].weeks?.length === 3 && on[3].weeks?.length === 0 && on[4].weeks === undefined);
  check("life tracks: life rows gain in xp, Knowledge in pts", on.slice(0, 4).every((r) => r.gainKind === "xp") && on[4].gainKind === "pts");
  check("life tracks: not launched → Knowledge alone, rows or not", lifeTrackRows(k, { launched: false, rows }).length === 1 && lifeTrackRows(k, { launched: false, rows: [] })[0].name === "Knowledge");
  const count = (html: string) => (html.match(/class="trk-row"/g) ?? []).length;
  const htmlOn = renderToStaticMarkup(createElement(LifeTracks, { knowledge: k, life: { launched: true, rows } }));
  const htmlOff = renderToStaticMarkup(createElement(LifeTracks, { knowledge: k, life: { launched: false, rows: [] } }));
  check("life tracks: renders 5 rows when launched and 1 when not", count(htmlOn) === 5 && count(htmlOff) === 1, `${count(htmlOn)} / ${count(htmlOff)}`);
  check("life tracks: the aside never promises tracks before they count", htmlOn.includes("levels capped by kept weeks") && !htmlOff.includes("arrive with life tracks") && !htmlOff.includes("kept weeks"));
}

// ── 4f. The goal ladder's copy ─────────────────────────────────────────────
{
  const payout = (h: "SHORT" | "MID" | "LONG", g: number, pays: number, why: string | null, depth = 0): GoalPayout => ({
    horizon: h,
    track: "DUTY",
    reason: GOAL_RULES[h].reason,
    stated: GOAL_RULES[h].stated,
    bar: GOAL_RULES[h].bar,
    scaled: pays,
    g,
    pays,
    why,
    depth,
  });
  const item = (h: "SHORT" | "MID" | "LONG", extra: Partial<GoalLadderItem>): GoalLadderItem => ({
    id: "g",
    title: "T",
    horizon: h,
    track: "DUTY",
    stated: GOAL_RULES[h].stated,
    copy: statedPayoutCopy(h),
    g: 0.5,
    progressLabel: "",
    dueDay: null,
    pastDue: false,
    carried: null,
    preview: null,
    closed: null,
    ...extra,
  });
  const today = "2026-10-01";
  const short = goalRowCopy(item("SHORT", { track: "CARE", g: 0.5, progressLabel: "1 of 2 steps", dueDay: "2026-10-12", preview: payout("SHORT", 0.5, 0, "not finished") }), true, today);
  check("ladder: SHORT meta names horizon, track, %, label and due", short.meta === "Short · Care · 50% · 1 of 2 steps · due 12 Oct", short.meta);
  check("ladder: SHORT states 'pays ⬡ 1 when done'", short.pays === "pays ⬡ 1 when done", short.pays ?? "");
  check("ladder: a 0 preview says why", short.preview === "Closing now pays 0: not finished", short.preview ?? "");
  const mid = goalRowCopy(item("MID", { g: 0.6999, progressLabel: "7 of 10 books", preview: payout("MID", 0.6999, 0, "below 70%") }), true, today);
  check("ladder: MID states 'pays ⬡ 6 × progress from 70%'", mid.pays === "pays ⬡ 6 × progress from 70%", mid.pays ?? "");
  check("ladder: g is never rounded up past the bar (0.6999 is 69%)", mid.meta === "Mid · Duty · 69% · 7 of 10 books", mid.meta);
  const paying = goalRowCopy(item("MID", { g: 0.8, preview: payout("MID", 0.8, 4.8, null, 1) }), true, today);
  check("ladder: a paying preview states the exact figure", paying.preview === "Closing now pays ⬡ 4.8", paying.preview ?? "");
  const carried = goalRowCopy(item("SHORT", { g: 0.55, dueDay: "2026-09-28", pastDue: true, carried: 0.55 }), true, today);
  check("ladder: past due and unfinished is carried, never owed", carried.carried === "Carried 0.55 · reschedule or close it on Today" && carried.meta.endsWith("was due 28 Sep"), carried.carried ?? "");
  const closed = goalRowCopy(item("MID", { g: 0.8, closed: { paid: 4.8, depth: 1, day: "2026-09-26", why: null } }), true, today);
  check("ladder: closed and paid", closed.closed === "Closed · paid ⬡ 4.8 · Duty depth +1" && closed.pays === null && closed.preview === null, closed.closed ?? "");
  const closed0 = goalRowCopy(item("SHORT", { g: 1, closed: { paid: 0, depth: 0, day: "2026-09-29", why: "set 1 day ago (3 needed)" } }), true, today);
  check("ladder: closed for nothing says why", closed0.closed === "Closed · paid 0: set 1 day ago (3 needed)", closed0.closed ?? "");
  const before = goalRowCopy(item("MID", { g: 0.8, preview: payout("MID", 0.8, 0, "before life MP began") }), false, today);
  check("ladder: before life counts, no stated MP and no preview", before.pays === null && before.preview === null && before.meta === "Mid · Duty · 80%");
  const far = goalRowCopy(item("LONG", { g: null, dueDay: "2027-03-01" }), true, today);
  check("ladder: unmeasured shows no %, a due day in another year shows the year", far.meta === "Long · Duty · due 1 Mar 2027", far.meta);
  check("rungs: highest first, empty rungs left out", rungsLine({ Automatic: 1, Established: 3, Forming: 0, Seeded: 4 }) === "Automatic 1 · Established 3 · Seeded 4");
  check("rungs: the spec line", rungsLine({ Automatic: 1, Established: 3, Forming: 2, Seeded: 4 }) === "Automatic 1 · Established 3 · Forming 2 · Seeded 4");
  check("rungs: none → null (the row says so in words)", rungsLine({ Automatic: 0, Established: 0, Forming: 0, Seeded: 0 }) === null && rungsLine(null) === null);
}

// ── 4g. The life note guards storage ───────────────────────────────────────
{
  const throwing = {
    getItem: (): string | null => {
      throw new Error("SecurityError");
    },
    setItem: (): void => {
      throw new Error("QuotaExceededError");
    },
  };
  const mem = new Map<string, string>();
  const memory = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  check("life note: no storage → not dismissed (it renders)", readNoteDismissed(null) === false && readNoteDismissed(undefined) === false);
  check("life note: a throwing storage reads as not dismissed", readNoteDismissed(throwing) === false);
  let threw = false;
  try {
    check("life note: a throwing write reports false", writeNoteDismissed(throwing) === false);
  } catch {
    threw = true;
  }
  check("life note: a throwing write never throws", !threw);
  check("life note: an empty store renders it", readNoteDismissed(memory) === false);
  check("life note: dismissal round-trips under its v1 key", writeNoteDismissed(memory) === true && readNoteDismissed(memory) === true && mem.get(LIFE_NOTE_KEY) === "1" && LIFE_NOTE_KEY === "xtnl:you:life-note:v1");
  const src = read("src/components/home/LifeNote.tsx").replace(/\/\*[\s\S]*?\*\//g, "");
  check("life note: storage is touched only through the guarded helpers", !/localStorage\.(getItem|setItem|removeItem)/.test(src) && (src.match(/window\.localStorage/g) ?? []).length === 1);
  check("life note: shows for 14 days from the launch day, only once life counts", LIFE_NOTE_DAYS === 14 && lifeNoteDue(true, "2026-10-05", "2026-10-05") && lifeNoteDue(true, "2026-10-05", "2026-10-18") && !lifeNoteDue(true, "2026-10-05", "2026-10-19") && !lifeNoteDue(true, "2026-10-05", "2026-10-04") && !lifeNoteDue(false, "2026-10-05", "2026-10-06") && !lifeNoteDue(true, null, "2026-10-06"));
}

// ── 4h. Kept weeks and track lines ─────────────────────────────────────────
{
  check("kept weeks: a labelled cell reads 'Week of 28 Sep: kept'", keptCellLabel("kept", 0, "28 Sep") === "Week of 28 Sep: kept" && keptCellLabel("missed", 2) === "Week 3: not kept");
  const html = renderToStaticMarkup(createElement(KeptWeeks, { rows: [{ name: "Duty", weeks: ["kept", "missed"] }, { name: "Care", weeks: ["missed", "kept"] }], labels: ["21 Sep", "28 Sep"] }));
  check("kept weeks: cells carry their week labels", html.includes('aria-label="Week of 21 Sep: kept"') && html.includes('aria-label="Week of 28 Sep: kept"') && html.includes('aria-label="Week of 21 Sep: not kept"'));
  check("kept weeks: the grid has one column per judged week", /--weeks:\s*2/.test(html));

  const two = trackLinesGeometry([{ name: "Duty", points: [1, 2] }, { name: "Care", points: [0, 0] }]);
  const xs = two.lines[0].points.split(" ").map((p) => Number(p.split(",")[0]));
  const finite = two.lines.every((l) => l.points.split(/[ ,]/).every((v) => Number.isFinite(Number(v))));
  check("track lines: 2 points span the plot (24 → 286), all finite", two.weeks === 2 && xs[0] === 24 && xs[1] === 286 && finite);
  check("track lines: end labels after the last point, ticks from 0", two.ends[0].text === "Duty 2" && two.ends[0].x === 294 && two.ticks[0].value === 0);
  const twelve = trackLinesGeometry([{ name: "Duty", points: [4, 4, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7] }]);
  check("track lines: 12 points, evenly spaced", twelve.weeks === 12 && twelve.lines[0].points.split(" ").length === 12 && twelve.lines[0].points.endsWith("286.0," + twelve.lines[0].points.split(",").pop()));
  const empty = trackLinesGeometry([]);
  check("track lines: no series draws nothing, without NaN", empty.lines.length === 0 && empty.ticks.every((t) => Number.isFinite(t.y)));
}

// ── 4i. Figures and dates ──────────────────────────────────────────────────
{
  check("mpFigure: as paid (2 dp at most, no trailing zeros)", mpFigure(6 * 0.8) === "4.8" && mpFigure(1.5) === "1.5" && mpFigure(8) === "8" && mpFigure(0) === "0" && mpFigure(1346) === "1,346" && mpFigure(0.555) === "0.56");
  check("dates: '28 Sep' (not Intl's 'Sept')", shortDayLabel("2026-09-28") === "28 Sep" && shortDayLabel("2026-09-28", "2026-10-01") === "28 Sep");
  check("dates: another year shows the year", shortDayLabel("2027-01-05", "2026-10-01") === "5 Jan 2027");
  check("dates: long forms", longDayLabel("2026-09-28") === "28 September" && weekdayDayLabel("2026-10-07") === "Wednesday 7 October");
}

// ── 4j. The first judged week (/today/week before any verdict) ─────────────
{
  const f = firstWeekJudgement("2026-09-29", "2026-10-01");
  check(
    "first week: epoch in the week of 28 September → judged Wednesday 7 October, not yet due",
    f.monday === "2026-09-28" && f.sunday === "2026-10-04" && f.judgeDay === "2026-10-07" && !f.due && weekdayDayLabel(f.judgeDay) === "Wednesday 7 October" && longDayLabel(f.monday) === "28 September"
  );
  check("first week: due from its Wednesday, not on Tuesday", !firstWeekJudgement("2026-09-29", "2026-10-06").due && firstWeekJudgement("2026-09-29", "2026-10-07").due);
  check("first week: an old epoch is due now", firstWeekJudgement("2026-06-01", "2026-10-01").due);
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

  // Life pages: no milestone codes, no capture-owned imports, every rule number imported.
  const lifePages = ["src/app/today/week/page.tsx", "src/app/today/rules/page.tsx"];
  const lifeMilestones = lifePages.filter((f) => /\bM[1-9]\b/.test(code(f)));
  check("copy: no milestone codes on /today/week and /today/rules", lifeMilestones.length === 0, lifeMilestones.join(", "));
  check("week: /today/week imports nothing capture-owned (components/today/**)", !/@\/components\/today\//.test(read("src/app/today/week/page.tsx")));
  check("week: /today/week judges after the response and is never prerendered", /after\(async \(\) => \{\s*await maybeJudgeWeeks\(userId\)/.test(read("src/app/today/week/page.tsx")) && /export const dynamic = "force-dynamic"/.test(read("src/app/today/week/page.tsx")));
  check("you: the sheet judges after its snapshot", /recordTodaySnapshot\(\);[\s\S]{0,40}finally \{\s*await maybeJudgeWeeks\(userId\)/.test(read("src/app/you/page.tsx")));
  const rules = read("src/app/today/rules/page.tsx");
  const start = rules.indexOf("function TracksRules()");
  const body = start >= 0 ? rules.slice(rules.indexOf("return (", start), rules.indexOf("\n}\n", start)) : "";
  // Strip every {…} expression (balanced), leaving the JSX's literal text and tags.
  let text = "";
  let depth = 0;
  for (const ch of body) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (depth === 0) text += ch;
  }
  const typed = [...text.matchAll(/\d+/g)].map((m) => m[0]);
  check("rules: the Tracks and kept weeks card types no number by hand", start >= 0 && body.length > 500 && typed.length === 0, typed.join(", "));
  const imported = rules.match(/import \{([^}]*)\} from "@\/lib\/life-economy"/)?.[1] ?? "";
  const needed = ["TRACK_LEVEL_STEP", "TRACK_DEPTH_WEEK_COEF", "KEPT_MIN_DAYS", "KEPT_MIN_RAW", "BODY_EFFORT_MINUTES", "DUTY_MIN_OCCURRENCES", "DUTY_FALLBACK_COMPLETIONS", "WEEK_JUDGE_LAG_DAYS", "LIFE_MP", "LIFE_MP_WEEK_CAP", "CAPPED_REASONS", "GOAL_RULES", "GOAL_DEPTH_CAP"];
  const missing = needed.filter((n) => !new RegExp(`\\b${n}\\b`).test(imported));
  check("rules: the card's constants are imported from life-economy", missing.length === 0, missing.join(", "));
  check("rules: Full day still pays from daily settlement; goals never pay XP", /pays from daily settlement/.test(rules) && /Goals never pay XP/.test(rules));
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
