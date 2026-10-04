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
 *
 * Roadmap, lane Y (§9; roadmap.md F16 seams 9, 12, 13 and 18): the Aim card
 * joins the sheet's one wave on /you, under the hero, with no Suspense, and a
 * failed load renders the sheet without it (the page's own guard, run here);
 * the dismissed prompt is read from its cookie; the fallback week quest
 * freeze runs in the page's after() only when the week is unfrozen; the goal
 * ladder's roadmap lines (chip, 'measured 09:12', 'pays nothing · …', the
 * reset note); the Aim card fixtures on /dev/style/art/you; and the rules
 * page's Roadmap section (no number typed by hand, week quests never a bare
 * "quest", Proficiency and the Aim rank kept apart from mastery and pay).
 * The fix round adds: /you passes the card its life day (todayKey(now)); the
 * ladder's "measured …" matches the Aim card's word for word, and a goal
 * replaced by its Start again copy shows that note; every fixture fact is
 * possible today, each fixture's rank is read from its places
 * (maxScheduledPositionsOf), ACCEPTED holds only before any milestone was
 * carried, draftItems counts the next milestone's undecided rows, a
 * started milestone shows its goal's due day, a paid lineage states 0 with
 * its day; the fixtures page renders (the real AimCard, inside
 * FixtureRoadmapProvider); and the rules page's new sentences are held to
 * the helpers that apply them (countsTowardDraftCap, milestoneDueDayOf,
 * isSupersededRow, maxScheduledPositionsOf, proficiencyOf's shares).
 * Fix round 2 adds: the ladder's "measured …" is Today's own rule
 * (today-board measuredLabelOf), equal to the Aim card's across a year too;
 * draftItems is draftNeedsOf over real draft rows (never a syllabus topic,
 * a row the user wrote or a removed row); every card
 * after acceptance carries acceptedDay, and the ACCEPTED caption claims the
 * acceptance only for that day's reading (accepted vs accepted-later, and a
 * live-shaped view without acceptedDay); a Gemini title's numbers are
 * struck on the card with the spans R3's withLabelChecks derives.
 * It imports roadmap modules, so scripts/_no-model.ts comes first.
 */
import "./_no-model";
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
import {
  EFFECTS_GROUP,
  WEEK_REVIEW_NOTICE_ID,
  YESTERDAY_MUSTS_NOTICE_ID,
  askCount,
  asksFromNotices,
  characterLevelOf,
} from "../src/components/shell/shell-types";
import { askSectionsOf, inPlaceEventOf } from "../src/components/shell/AsksSheet";
import { RECORD_YESTERDAY_EVENT, RECORD_YESTERDAY_HREF } from "../src/lib/shortcuts";
import { owedNotice, weekReviewNotice, yesterdayMustsNotice } from "../src/lib/rituals";
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
  lifeMpCell,
  lifeNoteDue,
  lifeTrackRows,
  longDayLabel,
  mainSource,
  mainSourceOf,
  mondayOfWeekKey,
  mpFigure,
  niceMax,
  pendingWeek,
  polygonPoints,
  radarLayout,
  radarPercent,
  shortDayLabel,
  sourceLabel,
  titleDistance,
  topAttributes,
  weekReviewPromise,
  weekdayDayLabel,
  type FieldComposition,
} from "../src/components/home/sheet-math";
import { KeptWeeks, endLabelTops, keptCellLabel, trackLinesGeometry } from "../src/components/home/TrackCharts";
import { LifeTracks } from "../src/components/home/SheetSections";
import { CharacterHero } from "../src/components/home/CharacterHero";
import { fixtures as celebrateFixtures, fixtureMoments } from "../src/app/dev/style/celebrate/fixtures";
import { GoalLadder, goalRowCopy, measuredLabel, roadmapEntryOf, roadmapRowCopy, rungsLine } from "../src/components/home/GoalLadder";
import { LIFE_NOTE_KEY, readNoteDismissed, writeNoteDismissed } from "../src/components/home/LifeNote";
import { goalPercent, statedPayoutCopy, statedPayoutLine, type GoalLadderItem, type GoalPayout, type RoadmapGoalEntry } from "../src/lib/goals";
import { GOAL_RULES } from "../src/lib/life-economy";
import type { LifeTrackRow } from "../src/lib/life-tracks";
import { momentMeta, momentMonths } from "../src/app/you/_lib/moments";
import Module from "node:module";
import { addDays, dayKeyOf, todayKey, weekStartKeyOf, zonedToInstant, type DayKey } from "../src/lib/life-day";
import {
  AIM_PROMPT_COOKIE,
  AIM_RANKS,
  PROFICIENCY_WEIGHTS,
  RANK_NEW_DAYS,
  RANK_TOP,
  TOP_LEVEL,
  aimRankName,
  countsTowardDraftCap,
  draftNeedsOf,
  type AimCardView,
  type MilestoneDraft,
  type PositionRow,
  isAcceptanceReading,
  isSupersededRow,
  maxScheduledPositionsOf,
  milestoneDueDayOf,
  positionCountOf,
  topRankIndexOf,
} from "../src/lib/roadmap-types";
import { proficiencyOf } from "../src/lib/roadmap-proficiency";
import { withLabelChecks } from "../src/lib/roadmap-validate";
import { measuredLabel as aimMeasuredLabel } from "../src/components/roadmap/roadmap-copy";
import { measuredLabelOf as todayMeasuredLabel } from "../src/lib/today-board";
import {
  BODY_ROWS,
  DRAFT_NEXT,
  MILESTONE2_DUE,
  REPLAN_NEXT,
  TITLE_WITH_NUMBER,
  TRADING_LABEL_BASE,
  aimCardFixtures,
  buildAimFixture,
  tradingRows,
} from "../src/app/dev/style/art/you/aim-fixtures";
import ts from "typescript";

const ROOT = join(__dirname, "..");
let pass = 0;
const fails: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fails.push(detail ? `${name} — ${detail}` : name);
}
/** A check that waits on another roadmap lane's code (its shell still throws "Not yet: …"): printed, never failing. */
const warns: string[] = [];
const warn = (name: string, detail: string) => warns.push(`${name} — ${detail}`);
/** A known difference another lane owns, printed and never failing. */
const notes: string[] = [];
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
  // U7: the rows carry the spec's lines; the aside says once that paid goals raise the cap too.
  check("life tracks (U7): the aside reads 'levels capped by kept weeks and paid goals'", htmlOn.includes("levels capped by kept weeks and paid goals") && !htmlOff.includes("paid goals"));
  const art = read("src/app/dev/style/art/you/page.tsx");
  check("life tracks (U7): the art fixture lines carry no '(or a paid Mid goal)' clause", !/or a paid Mid goal/.test(art) && /aside="levels capped by kept weeks and paid goals · fixture"/.test(art));
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
  // U2: Today shows Close and Reschedule only once life counts, so before that the sheet never sends you there.
  const carriedBefore = goalRowCopy(item("SHORT", { g: 0.55, dueDay: "2026-09-28", pastDue: true, carried: 0.55 }), false, today);
  check("ladder (U2): before life counts, carried says no more than 'Carried 0.55'", carriedBefore.carried === "Carried 0.55", carriedBefore.carried ?? "");
  // U6: one floored percentage, goals.ts goalPercent, on Today and You alike.
  const third = goalRowCopy(item("MID", { g: 2 / 3, progressLabel: "2 of 3 steps" }), true, today);
  check("ladder (U6): 2 of 3 steps reads goalPercent's 66%, never 67%", third.meta === `Mid · Duty · ${goalPercent(2 / 3)}% · 2 of 3 steps` && goalPercent(2 / 3) === 66, third.meta);
  const nearBar = goalRowCopy(item("MID", { g: 0.695 }), true, today);
  check("ladder (U6): 0.695 reads 69% (goalPercent), the figure a 'below 70%' preview agrees with", nearBar.meta === `Mid · Duty · ${goalPercent(0.695)}%` && goalPercent(0.695) === 69, nearBar.meta);
  const ladderSrc = read("src/components/home/GoalLadder.tsx");
  check("ladder (U6): GoalLadder imports goalPercent and keeps no percentage of its own", /import \{[^}]*\bgoalPercent\b[^}]*\} from "@\/lib\/goals"/.test(ladderSrc) && !/function percentOf\b/.test(ladderSrc) && !/Math\.floor\(/.test(ladderSrc));
  const closedUnmeasured = goalRowCopy(item("MID", { g: null, progressLabel: "not measured", closed: { paid: 0, depth: 0, day: "2026-09-26", why: "not measured" } }), true, today);
  check("ladder (U5/U6): a closed goal that was not measured shows no %", closedUnmeasured.meta === "Mid · Duty · not measured" && !closedUnmeasured.meta.includes("%"), closedUnmeasured.meta);
  const closed = goalRowCopy(item("MID", { g: 0.8, closed: { paid: 4.8, depth: 1, day: "2026-09-26", why: null } }), true, today);
  check("ladder: closed and paid", closed.closed === "Closed · paid ⬡ 4.8 · Duty depth +1" && closed.pays === null && closed.preview === null, closed.closed ?? "");
  const closed0 = goalRowCopy(item("SHORT", { g: 1, closed: { paid: 0, depth: 0, day: "2026-09-29", why: "set 1 day ago; it pays once 3 days old" } }), true, today);
  check("ladder: closed for nothing says why", closed0.closed === "Closed · paid 0: set 1 day ago; it pays once 3 days old", closed0.closed ?? "");
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

// ── 4k. The hero's life MP cell is the last judged week (U1) ──────────────
{
  // Thursday 1 October 2026: this week began 28 Sep (W40); last week is W39 (21 Sep).
  const today = "2026-10-01";
  check("life MP (U1): week keys map to their Mondays", mondayOfWeekKey("2026-W39") === "2026-09-21" && mondayOfWeekKey("2026-W01") === "2025-12-29" && mondayOfWeekKey("2026-W53") === "2026-12-28" && mondayOfWeekKey("2025-W53") === null && mondayOfWeekKey("nope") === null);
  const last = lifeMpCell({ used: 6, cap: 8, weekKey: "2026-W39" }, today);
  check("life MP (U1): the week that just ended reads 'life MP last week' with its figure", last.used === 6 && last.cap === 8 && last.label === "life MP last week", JSON.stringify(last));
  // Monday 5 October: W40 is not judged until Wednesday, so the cell still shows W39, named by its week.
  const monday = lifeMpCell({ used: 6, cap: 8, weekKey: "2026-W39" }, "2026-10-05");
  check("life MP (U1): on Monday the week before last is named, never called 'last week'", monday.used === 6 && monday.label === "life MP, week of 21 Sep", monday.label);
  const none = lifeMpCell({ used: 0, cap: 8, weekKey: null }, today);
  check("life MP (U1): before any judged week, no figure (not a 0 that reads as a verdict)", none.used === null && none.label === "life MP · no week judged yet", JSON.stringify(none));
  const hero = (lifeMp: ReturnType<typeof lifeMpCell> | null) =>
    renderToStaticMarkup(
      createElement(CharacterHero, {
        level: 14,
        progress: 0.5,
        title: "Adept",
        epithet: "of the Deep Archive",
        transcendent: false,
        dominant: null,
        distance: titleDistance(14.5),
        tracks: null,
        lifeMp,
        balance: 100,
        mastered: 3,
        owned: 3,
        poolSize: 10,
        seenKey: "check:level",
      })
    );
  const onHtml = hero(lifeMpCell({ used: 4.5, cap: 8, weekKey: "2026-W39" }, today));
  check("life MP (U1): the hero labels the cell 'life MP last week', never 'this week'", onHtml.includes("life MP last week") && !onHtml.includes("this week") && onHtml.includes("4.5"));
  const noneHtml = hero(none);
  check("life MP (U1): the hero before any judged week shows a dash and says so", noneHtml.includes("no week judged yet") && noneHtml.includes("—") && !/<\/svg>0<small>/.test(noneHtml));
  check("life MP (U1): before life counts the hero has no life MP cell", !hero(null).includes("life MP"));
  // From launch until the first week that can pay is judged, the last judged week is a backfill
  // week: it paid nothing by rule, so its 0 is no verdict either (phase B review).
  const backfill = lifeMpCell({ used: 0, cap: 8, weekKey: "2026-W39", backfill: true }, today);
  check("life MP: a backfill last week shows no figure, 'life MP · first paid week not judged yet'", backfill.used === null && backfill.cap === 8 && backfill.label === "life MP · first paid week not judged yet", JSON.stringify(backfill));
  const backfillHtml = hero(backfill);
  check("life MP: the hero on a backfill last week shows a dash and says so, never '0 / 8 life MP last week'", backfillHtml.includes("first paid week not judged yet") && backfillHtml.includes("—") && !backfillHtml.includes("life MP last week") && !/<\/svg>0<small>/.test(backfillHtml));
  const paid = lifeMpCell({ used: 0, cap: 8, weekKey: "2026-W39", backfill: false }, today);
  check("life MP: a paid week that minted nothing still reads its honest 0 'life MP last week'", paid.used === 0 && paid.label === "life MP last week", JSON.stringify(paid));
  const page = read("src/app/you/page.tsx");
  check("life MP (U1): the sheet passes lifeMpCell(s.life.mpLastWeek, …), not mpThisWeek", /lifeMp=\{launched \? lifeMpCell\(s\.life\.mpLastWeek, s\.today\) : null\}/.test(page) && !/mpThisWeek/.test(page));
}

// ── 4l. /today/week: the week still to be judged, and the review to come (U8, U9) ──
{
  // The last judged week ended Sunday 27 Sep (W39).
  check("week (U8): Tuesday 6 Oct, W40 not judged → it is named, judged Wednesday 7 October", JSON.stringify(pendingWeek("2026-09-27", "2026-10-06")) === JSON.stringify({ monday: "2026-09-28", judgeDay: "2026-10-07", due: false }));
  check("week (U8): Monday 5 Oct, same", pendingWeek("2026-09-27", "2026-10-05")?.judgeDay === "2026-10-07");
  check("week (U8): Wednesday 7 Oct before the judge ran → due now", pendingWeek("2026-09-27", "2026-10-07")?.due === true);
  check("week (U8): once W40 is judged, nothing is pending", pendingWeek("2026-10-04", "2026-10-07") === null && pendingWeek("2026-10-04", "2026-10-11") === null);
  check("week (U8): Thursday 1 Oct with W39 judged → nothing pending", pendingWeek("2026-09-27", "2026-10-01") === null);
  const weekSrc = read("src/app/today/week/page.tsx");
  check("week (U8): the card is headed 'Last judged week' while the week that ended waits", /pendingWeek\(week\.sunday, today\)/.test(weekSrc) && /title=\{pending \? "Last judged week" : "Last week"\}/.test(weekSrc));
  const on = weekReviewPromise(true);
  check("week (U9): once life counts, the review line promises no Monday verdicts", !/Monday/.test(on) && !/what each track kept/.test(on) && !/week card/.test(on) && /inbox to zero/.test(on));
  check("week (U9): before launch the placeholder is unchanged", /Monday opens a short review/.test(weekReviewPromise(false)));
  check("week (U9): the page reads the line through weekReviewPromise(life.launched)", /\{weekReviewPromise\(life\.launched\)\}/.test(weekSrc) && !/Monday opens a short review/.test(weekSrc));
}

// ── 4m. The celebrate lab's goal and week fixtures state what was paid ─────
{
  const fx = celebrateFixtures();
  type Done = { id: string; goalMp: number | null; paid?: number; why?: string | null; track?: string | null; depth?: number };
  const doneOf = (name: string) => ((fx.find((f) => f.name === name)?.after as { goals?: { done: Done[] } } | undefined)?.goals?.done ?? [])[0];
  const k5 = doneOf("goal-finished");
  check("celebrate fixtures: goal-5k paid 1, no why, Body, depth 0", k5?.paid === 1 && k5.why === null && k5.track === "BODY" && k5.depth === 0, JSON.stringify(k5));
  const book = doneOf("goal-long");
  check("celebrate fixtures: goal-book states 20 (a Long) and paid 18, Craft depth 2", book?.goalMp === GOAL_RULES.LONG.stated && book.goalMp === 20 && book.paid === 18 && book.why === null && book.track === "CRAFT" && book.depth === 2, JSON.stringify(book));
  const weeks = (fx.find((f) => f.name === "week-kept")?.after as { ledger?: { weeks: { mp?: number; detail: string | null }[] } } | undefined)?.ledger?.weeks ?? [];
  check("celebrate fixtures: week-kept rows paid 1.5 each, with the judge's reason", weeks.length === 3 && weeks.every((w) => w.mp === 1.5 && w.detail === "Kept · 4 days · 52.0 raw XP"), JSON.stringify(weeks[0] ?? null));
  const bookEvent = JSON.stringify(fixtureMoments().find((m) => m.name === "goal-long")?.events ?? []);
  check("celebrate fixtures: the Long goal's moment states the 18 MP paid", /\+18\b/.test(bookEvent), bookEvent.slice(0, 200));
}

// ── 4n. M2 integration (lead): the bell's listed rows, the tour, Settings › Days, capture ──
{
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const today = "2026-10-14";
  const effect = { id: "boon:x", group: EFFECTS_GROUP, tone: "good", title: "Focus", detail: "In effect" } as const;
  const notices = [
    owedNotice({ count: 2, debt: 12.5 }),
    yesterdayMustsNotice(2, today),
    weekReviewNotice({ weekKey: "2026-W41", monday: "2026-10-05", sunday: "2026-10-11", judgeDay: "2026-10-14" }),
    effect,
  ].filter((n): n is NonNullable<typeof n> => n != null);
  const items = asksFromNotices(notices);
  const sections = askSectionsOf(items);
  check("bell: the counted card holds exactly the bell's count (askCount)", sections.asking.length === askCount(items) && sections.asking.every((a) => a.counted !== false), JSON.stringify(sections.asking.map((a) => a.id)));
  check("bell: yesterday's open musts and the weekly review are listed apart, never counted", sections.listed.map((a) => a.id).sort().join(",") === [YESTERDAY_MUSTS_NOTICE_ID, WEEK_REVIEW_NOTICE_ID].sort().join(","), JSON.stringify(sections.listed.map((a) => a.id)));
  check("bell: the effects in play stay in their own group", sections.effects.length === 1 && sections.effects[0].id === effect.id);
  check("bell: every row lands in exactly one group", sections.asking.length + sections.listed.length + sections.effects.length === items.length);
  const asksSrc = strip(read("src/components/shell/AsksSheet.tsx"));
  check("bell: the listed rows render under their own quiet heading", /listed\.length > 0/.test(asksSrc) && /For your information/.test(asksSrc) && /aria-labelledby="asks-listed"/.test(asksSrc));
  const yRow = items.find((a) => a.id === YESTERDAY_MUSTS_NOTICE_ID);
  check("bell: the 'Yesterday' row links to the Record yesterday deep link", yRow?.href === RECORD_YESTERDAY_HREF, yRow?.href ?? "missing");
  check("bell: on /today that row opens the sheet in place (a same-route link would not)", inPlaceEventOf(RECORD_YESTERDAY_HREF, "/today") === RECORD_YESTERDAY_EVENT);
  check("bell: elsewhere it follows the link, and other rows always do", inPlaceEventOf(RECORD_YESTERDAY_HREF, "/you") === null && inPlaceEventOf("/today", "/today") === null && inPlaceEventOf("/today/week?view=run", "/today") === null);
  check("bell: the in-place row prevents the navigation and dispatches the event", /e\.preventDefault\(\)/.test(asksSrc) && /dispatchEvent\(new Event\(inPlace\)\)/.test(asksSrc));

  const tour = strip(read("src/components/tour/Tour.tsx"));
  check("tour: the steps know whether Duty is live (F15's Today line)", /tourSteps\(\{\s*keyboard,\s*dutyLive\s*\}\)/.test(tour) && /isDutyLaunched\(todayKey\(\)\)/.test(tour));
  check("tour: dutyLive is read when a run starts (client only), never during render on the server", /setRun\(\{[^}]*dutyLive: isDutyLaunched\(/.test(tour));

  const settings = strip(read("src/app/settings/page.tsx"));
  check("settings: the page reads LifeSettings.debtWriteOff", /select: \{[^}]*debtWriteOff: true[^}]*\}/.test(settings));
  check("settings: Settings › Days gets duty (today, the server's launch day, debtWriteOff)", /duty: \{\s*today: todayKey\(\),\s*launchDay: dutyLaunchDay\(\),\s*debtWriteOff: life\?\.debtWriteOff \?\? false\s*\}/.test(settings));

  const qc = strip(read("src/components/capture/QuickCapture.tsx"));
  check("capture: QuickCapture passes the server's launch day to the Must chip when it has it", /export function QuickCapture\(\{ dutyLaunchDay \}/.test(qc) && /duty=\{dutyLaunchDay === undefined \? undefined : \{ today: day, launchDay: dutyLaunchDay \}\}/.test(qc));
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
  // M2 (F14, F15): both pages run life's one maintenance chain (settle, then judge) after the
  // response; neither calls the judge on its own, which would skip the settle-first order.
  check("week: /today/week settles and judges after the response and is never prerendered", /after\(async \(\) => \{\s*await maybeMaintainLife\(userId\)/.test(read("src/app/today/week/page.tsx")) && /export const dynamic = "force-dynamic"/.test(read("src/app/today/week/page.tsx")));
  check("you: the sheet settles and judges after its snapshot", /recordTodaySnapshot\(\);[\s\S]{0,40}finally \{\s*await maybeMaintainLife\(userId\)/.test(read("src/app/you/page.tsx")));
  for (const f of ["src/app/today/week/page.tsx", "src/app/you/page.tsx"]) check(`life chain: ${f} never calls maybeJudgeWeeks directly (maybeMaintainLife settles first)`, !/\bmaybeJudgeWeeks\s*\(/.test(code(f)));
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
  const needed = ["TRACK_LEVEL_STEP", "TRACK_DEPTH_WEEK_COEF", "TRACK_SHARE_CAP", "KEPT_MIN_DAYS", "KEPT_MIN_RAW", "BODY_EFFORT_MINUTES", "DUTY_MIN_OCCURRENCES", "DUTY_FALLBACK_COMPLETIONS", "WEEK_JUDGE_LAG_DAYS", "LIFE_MP", "LIFE_MP_WEEK_CAP", "CAPPED_REASONS", "GOAL_RULES", "GOAL_DEPTH_CAP"];
  const missing = needed.filter((n) => !new RegExp(`\\b${n}\\b`).test(imported));
  check("rules: the card's constants are imported from life-economy", missing.length === 0, missing.join(", "));
  check("rules: Full day still pays from daily settlement; goals never pay XP", /pays from daily settlement/.test(rules) && /Goals never pay XP/.test(rules));
  // U3: the 3-day floor is Craft, Care and Body's; Duty with enough musts due needs only the raw floor.
  const flat = text.replace(/\s+/g, " ");
  const rulesFlat = rules.replace(/\s+/g, " ");
  check("rules (U3): no line says every track needs completions on N days", !/Every track keeps its week/.test(rules) && /and keep their week with completions on at least/.test(flat), flat.slice(0, 160));
  check("rules (U3): Body needs the same plus effort; Duty with enough musts needs only raw XP, on any number of days", /needs the same, plus/.test(flat) && /raw XP is all it needs, on any number of days/.test(flat));
  // U4: a closed goal is final, never 'carried'; a kept week is paid when judged, dated its Sunday; no 'finished … when finished'.
  check("rules (U4): closing is final; only a goal past its due day is carried", !/closed short of its bar pays nothing and is carried/.test(rulesFlat) && /A goal past its due day is carried, never owed, until you reschedule or close it\./.test(rulesFlat));
  check("rules (U4): the kept-week row says it is paid once judged, dated the Sunday", !/paid on the week's Sunday/.test(rules) && /dated the week's Sunday, paid once the week is judged/.test(rules));
  check("rules (U4): the Short goal row does not repeat 'finished'", /reason: "GOAL_SHORT", amount: GOAL_RULES\.SHORT\.stated, per: "at 100%"/.test(rules));
  // U10: every MP amount in the card names its unit for screen readers (the glyph is aria-hidden).
  const curSpans = [...rules.matchAll(/<span className="cur">([\s\S]*?)<\/span>\s*<\/td>/g)];
  check("rules (U10): every .cur amount carries an sr-only ' MP'", curSpans.length >= 2 && curSpans.every((m) => /<span className="sr-only"> MP<\/span>/.test(m[1])), `${curSpans.length} spans`);
  check("rules: the track share ceiling is published from TRACK_SHARE_CAP", /\{TRACK_SHARE_CAP\}%/.test(rules));
}

// ── 9. Roadmap on You (lane Y: F16 seams 9, 12, 13 and 18) ─────────────────

/** Source without comments (a comment may name what the code must not do). */
const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
/** JSX's literal text: every balanced {…} expression stripped. */
function literalText(body: string): string {
  let text = "";
  let depth = 0;
  for (const ch of body) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (depth === 0) text += ch;
  }
  return text;
}

// 9a. The goal ladder's roadmap lines (seam 13): read from the entry goals-server attaches.
{
  const today: DayKey = "2026-10-05"; // a Monday (AEDT since Sun 4 Oct)
  const iso = (y: number, m: number, d: number, h: number, min: number) => new Date(zonedToInstant(y, m, d, h).getTime() + min * 60_000).toISOString();
  check("ladder roadmap: a reading taken today reads its time, 'measured 09:12'", measuredLabel(iso(2026, 10, 5, 9, 12), today) === "measured 09:12", String(measuredLabel(iso(2026, 10, 5, 9, 12), today)));
  check("ladder roadmap: 02:30 on Mon is Sunday's life day (the 04:00 edge): 'measured Sun'", measuredLabel(iso(2026, 10, 5, 2, 30), today) === "measured Sun", String(measuredLabel(iso(2026, 10, 5, 2, 30), today)));
  check("ladder roadmap: within the past week reads the weekday, 'measured Sat'", measuredLabel(iso(2026, 10, 3, 21, 40), today) === "measured Sat");
  check("ladder roadmap: older reads the date, 'measured 25 Sep'", measuredLabel(iso(2026, 9, 25, 8, 0), today) === "measured 25 Sep");
  check("ladder roadmap: an unreadable time reads nothing", measuredLabel("not a time", today) === null);
  // One page, one wording: the Aim card above the ladder on /you prints its "measured …" with
  // roadmap-copy's measuredLabel, and Today's goal card with today-board's measuredLabelOf.
  const sameWords = [iso(2026, 10, 5, 9, 12), iso(2026, 10, 5, 2, 30), iso(2026, 10, 3, 21, 40), iso(2026, 9, 29, 4, 0), iso(2026, 9, 25, 8, 0), iso(2026, 1, 3, 12, 0)];
  const aimDiff = sameWords.filter((t) => measuredLabel(t, today) !== aimMeasuredLabel(t, today));
  check("ladder roadmap: the ladder's 'measured …' is word for word the Aim card's on the same page (time, weekday, date)", aimDiff.length === 0, aimDiff.map((t) => `${measuredLabel(t, today)} ≠ ${aimMeasuredLabel(t, today)}`).join("; "));
  // And Today's goal card's (today-board measuredLabelOf), across a year too: lane T added the year
  // (fix round 2), so what was a NOTE here is now strict. 20 Dec 2025 read on 5 Jan 2026 is
  // 'measured 20 Dec 2025' on all three surfaces.
  const lastYear = iso(2025, 12, 20, 8, 0);
  const jan: DayKey = "2026-01-05";
  const acrossYear: [string, DayKey][] = [...sameWords.map((t): [string, DayKey] => [t, today]), [lastYear, jan], [iso(2026, 1, 2, 9, 0), jan], [iso(2026, 12, 30, 9, 0), "2027-01-12"]];
  const todayDiff = acrossYear.filter(([t, d]) => measuredLabel(t, d) !== todayMeasuredLabel(t, d) || measuredLabel(t, d) !== aimMeasuredLabel(t, d));
  check(
    "ladder roadmap: and Today's goal card's, word for word, across a year too ('measured 20 Dec 2025' on 5 Jan; 'measured Fri' within the week)",
    todayDiff.length === 0 && measuredLabel(lastYear, jan) === "measured 20 Dec 2025" && measuredLabel(iso(2026, 1, 2, 9, 0), jan) === "measured Fri",
    todayDiff.map(([t, d]) => `${measuredLabel(t, d)} · Today ${todayMeasuredLabel(t, d)} · Aim ${aimMeasuredLabel(t, d)}`).join("; ")
  );

  const point = (day: DayKey, g: number, observedAt: string) => ({ day, g, observedAt, bindingClass: "MEASURED" as const, bindingLabel: "cards at level 6+" });
  const entry = (extra: Partial<RoadmapGoalEntry> = {}): RoadmapGoalEntry => ({
    series: [point("2026-10-03", 0.7, iso(2026, 10, 3, 21, 40)), point("2026-10-05", 0.75, iso(2026, 10, 5, 9, 12))],
    ord: 2,
    of: 3,
    zeroReason: null,
    note: null,
    ...extra,
  });
  const open = { dueDay: "2026-12-13", closed: null, g: 0.75 };
  const base = roadmapRowCopy(entry(), open, today);
  check("ladder roadmap: the quiet chip 'Roadmap · milestone 2 of 3'", base.chip === "Roadmap · milestone 2 of 3", String(base.chip));
  check("ladder roadmap: the binding reading's time is the last stored point on or before today", base.measured === "measured 09:12", String(base.measured));
  check("ladder roadmap: no note, no note line", base.note === null);
  const pastDue = roadmapRowCopy(entry(), { dueDay: "2026-10-04", closed: null, g: 0.7 }, today);
  check("ladder roadmap: past its due day, the time is the due day's reading (goalAsOf), never a later one", pastDue.measured === "measured Sat", String(pastDue.measured));
  const steps = roadmapRowCopy(entry(), { ...open, g: 0.5 }, today);
  check("ladder roadmap: when the steps set g (below the reading), no reading binds, so no time is shown (as on Today)", steps.measured === null && steps.chip === "Roadmap · milestone 2 of 3");
  const reset = roadmapRowCopy(entry({ series: [], note: "measures removed by a reset" }), open, today);
  check("ladder roadmap: a reset-archived roadmap's goal shows its note and no time (no reading)", reset.note === "measures removed by a reset" && reset.measured === null && reset.chip === "Roadmap · milestone 2 of 3");
  // A dropped milestone whose "Start again" copy has started (isSupersededRow): R1 empties its series and
  // says why; the ladder shows that note word for word, no time and no %.
  const superseded = roadmapRowCopy(entry({ series: [], note: "replaced by Start again" }), { ...open, g: null }, today);
  check("ladder roadmap: a goal replaced by its Start again copy shows that note, no time", superseded.note === "replaced by Start again" && superseded.measured === null);
  check("ladder roadmap: a blank note reads as none", roadmapRowCopy(entry({ note: "  " }), open, today).note === null);
  const closed = roadmapRowCopy(entry(), { dueDay: "2026-12-13", g: 0.75, closed: { paid: 0, depth: 0, day: "2026-10-04", why: "it states 0 MP" } }, today);
  check("ladder roadmap: a closed goal shows no time", closed.measured === null);
  const none = roadmapRowCopy(null, open, today);
  check("ladder roadmap: every other goal gets no roadmap line", none.chip === null && none.measured === null && none.note === null);

  // As goals-server builds it: the stated line folds the zero reason (goals.ts statedPayoutLine).
  const item: GoalLadderItem = {
    id: "g-rm",
    title: "Risk and position sizing",
    horizon: "MID",
    track: "CRAFT",
    stated: 0,
    copy: statedPayoutLine("MID", 0, "knowledge is paid by reviews"),
    g: 0.75,
    progressLabel: "tested by your reviews · slowest: cards at level 6+",
    dueDay: "2026-12-13",
    pastDue: false,
    carried: null,
    preview: null,
    closed: null,
    roadmap: entry({ zeroReason: "knowledge is paid by reviews" }),
  };
  check("ladder roadmap: roadmapEntryOf reads the attached entry, and null on an ordinary goal", roadmapEntryOf(item)?.ord === 2 && roadmapEntryOf({ ...item, roadmap: undefined }) === null);
  const row = goalRowCopy(item, true, today);
  check(
    "ladder roadmap: the row's meta ends with the reading's time",
    row.meta === "Mid · Craft · 75% · tested by your reviews · slowest: cards at level 6+ · due 13 Dec · measured 09:12",
    row.meta
  );
  check("ladder roadmap: the row states the folded 'pays nothing · knowledge is paid by reviews' once life counts, and carries the chip", row.pays === "pays nothing · knowledge is paid by reviews" && row.chip === "Roadmap · milestone 2 of 3" && row.note === null, String(row.pays));
  check("ladder roadmap: before life counts the row states nothing, the zero reason included", goalRowCopy(item, false, today).pays === null);
  const plain = goalRowCopy({ ...item, roadmap: undefined, copy: statedPayoutCopy("MID"), stated: 6, progressLabel: "3 of 5 steps" }, true, today);
  check("ladder roadmap: an ordinary goal's row is unchanged (no chip, no note, no time)", plain.chip === null && plain.note === null && plain.meta === "Mid · Craft · 75% · 3 of 5 steps · due 13 Dec" && plain.pays === "pays ⬡ 6 × progress from 70%", plain.meta);
  const html = renderToStaticMarkup(
    createElement(GoalLadder, {
      ladder: { open: [item, { ...item, id: "g-plain", roadmap: undefined, title: "Read 12 books", progressLabel: "4 of 12 books" }], closed: [] },
      launched: true,
      today,
      mastered: 3,
      tiers: { established: 1, highest: null, highestField: null },
      rungs: null,
      pays: { points: 5, level: 12 },
    })
  );
  check("ladder roadmap: the chip renders once, as a kit .chip, and the plain goal has none", (html.match(/Roadmap · milestone 2 of 3/g) ?? []).length === 1 && /<span class="chip">Roadmap · milestone 2 of 3<\/span>/.test(html));
  const resetHtml = renderToStaticMarkup(
    createElement(GoalLadder, {
      ladder: { open: [{ ...item, g: null, progressLabel: "not measured", roadmap: entry({ series: [], note: "measures removed by a reset" }) }], closed: [] },
      launched: true,
      today,
      mastered: 0,
      tiers: { established: 0, highest: null, highestField: null },
      rungs: null,
      pays: { points: 5, level: 12 },
    })
  );
  check("ladder roadmap: the reset note renders, and an unmeasured goal shows no %", resetHtml.includes("measures removed by a reset") && !/\d%/.test(resetHtml));
  const supersededHtml = renderToStaticMarkup(
    createElement(GoalLadder, {
      ladder: { open: [{ ...item, g: null, progressLabel: "not measured", roadmap: entry({ series: [], note: "replaced by Start again" }) }], closed: [] },
      launched: true,
      today,
      mastered: 0,
      tiers: { established: 0, highest: null, highestField: null },
      rungs: null,
      pays: { points: 5, level: 12 },
    })
  );
  check("ladder roadmap: the superseded goal's note renders once, with no % and no time", (supersededHtml.match(/replaced by Start again/g) ?? []).length === 1 && !/\d%/.test(supersededHtml) && !/measured \d/.test(supersededHtml));
  const ladderSrc = codeOf(read("src/components/home/GoalLadder.tsx"));
  check("ladder roadmap: GoalLadder reads no roadmap module (only the entry goals-server attaches)", !/from "@\/lib\/roadmap-|from "@\/components\/roadmap\//.test(ladderSrc));
  // Fix round 2 (lane T's handoff): one rule for a goal's "measured …" on Today and on the ladder.
  check(
    "ladder roadmap: the ladder's 'measured …' is Today's own rule (today-board measuredLabelOf), not a copy",
    /import \{ measuredLabelOf \} from "@\/lib\/today-board";/.test(ladderSrc) && /export function measuredLabel\([^)]*\)[^{]*\{\s*return measuredLabelOf\(observedAt, today, tz\);\s*\}/.test(ladderSrc) && !/Intl\.DateTimeFormat/.test(ladderSrc)
  );
}

// 9b. The Aim card on /you (seam 9, F19): one wave, under the hero, no Suspense, never an error page.
{
  const you = read("src/app/you/page.tsx");
  const youCode = codeOf(you);
  check("aim card: loadSheet and the Aim card load in one Promise.all with the cookies", /Promise\.all\(\[\s*loadSheet\(userId, now\),\s*aimCardOrNull\(userId, now\),\s*cookies\(\)\s*\]\)/.test(youCode));
  check("aim card: loadAimCard is called only inside aimCardOrNull's try", (youCode.match(/\bloadAimCard\(/g) ?? []).length === 1 && /async function aimCardOrNull[\s\S]*?try \{\s*return await loadAimCard\(userId, now\);\s*\} catch/.test(youCode));
  const hero = youCode.indexOf("<CharacterHero");
  const card = youCode.indexOf("{aim && <AimCard view={aim} promptDismissed={promptDismissed} today={aimToday} />}");
  const ready = youCode.indexOf("{s.ready && <ReadyCallout");
  check("aim card: rendered only when loaded, directly under CharacterHero and before the ready callout", hero >= 0 && card > hero && ready > card && !/<\/div>|<div/.test(youCode.slice(youCode.indexOf("/>", hero), card)));
  check("aim card: no Suspense on /you (the card arrives with the sheet; nothing shifts)", !/Suspense/.test(youCode));
  check(
    "aim card: the card gets the life day from the page's own `now` (todayKey(now)), so it never reads the client's clock and hydration agrees at the 04:00 turn",
    /const aimToday = todayKey\(now\);/.test(youCode) &&
      /import \{ todayKey \} from "@\/lib\/life-day";/.test(youCode) &&
      (youCode.match(/<AimCard\b/g) ?? []).length === 1 &&
      /<AimCard\b[^>]*\btoday=\{aimToday\}/.test(youCode)
  );
  check("aim card: you/loading.tsx is left as it was (no Aim skeleton to match)", !/aim/i.test(read("src/app/you/loading.tsx")));
  check(
    "aim card: the dismissed prompt is read from its cookie on the server",
    /import \{ cookies \} from "next\/headers"/.test(youCode) && /jar\.get\(AIM_PROMPT_COOKIE\)\?\.value === "off"/.test(youCode) && AIM_PROMPT_COOKIE === "xtnl-aim-prompt"
  );
  check(
    "aim card: the fallback freeze (RENDER) runs in the page's one after(), after the chain, only when this week is unfrozen",
    /questWeekUnfrozen = aim\?\.questWeekUnfrozen === true;/.test(youCode) &&
      /await maybeMaintainLife\(userId\);\s*if \(questWeekUnfrozen\) \{\s*try \{\s*const frozen = await freezeWeekQuests\(userId, now, "RENDER"\);/.test(youCode) &&
      (youCode.match(/\bafter\(/g) ?? []).length === 1
  );
  check(
    "aim card: the freeze never throws, so its returned `error` is what gets logged (roadmap-types QuestFreezeRun.error)",
    /const frozen = await freezeWeekQuests\(userId, now, "RENDER"\);\s*if \(frozen\.error\) console\.error\("\[you\] week quest freeze failed", frozen\.error\);/.test(youCode)
  );
  check("aim card: the page calls no other roadmap writer", !/recordRoadmapReadings|finalizeQuestWeeks|recordCardsForReview|recordPracticeForTemplate|questWeekInsertOp/.test(youCode));
}

/** Runs the page's own guard (aimCardOrNull, transpiled from its source) against a failing and a working loader. */
async function aimCardGuardChecks() {
  const src = read("src/app/you/page.tsx");
  const fn = /async function aimCardOrNull[\s\S]*?\n\}\n/.exec(src)?.[0] ?? "";
  if (!fn) {
    check("aim card: the page's guard can be read", false, "aimCardOrNull not found");
    return;
  }
  const js = ts.transpileModule(fn, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  type Guard = (userId: string, now: Date) => Promise<unknown>;
  const quiet = { error: () => undefined };
  const make = (loader: (userId: string, now: Date) => unknown) => new Function("loadAimCard", "console", `${js}\nreturn aimCardOrNull;`)(loader, quiet) as Guard;
  const view = { state: "EMPTY" };
  const rejected = await make(async () => {
    throw new Error("relation \"Roadmap\" does not exist");
  })("u", new Date());
  const thrown = await make(() => {
    throw new Error("sync");
  })("u", new Date());
  const loaded = await make(async () => view)("u", new Date());
  const missing = await make(async () => null)("u", new Date());
  check("aim card: a loadAimCard failure renders the sheet without the card (the guard gives null, never throws)", rejected === null && thrown === null);
  check("aim card: a loaded view passes through, and no view stays none", loaded === view && missing === null);
}

// 9c. The Aim card states on /dev/style/art/you (seam 18): pure fixtures through the roadmap's builders.
{
  const today: DayKey = "2026-12-22";
  const fixtures = aimCardFixtures(today);
  const keys = fixtures.map((f) => f.key);
  const needed = ["empty", "draft", "accepted", "active", "new-rank", "fallen", "replan", "past-due", "done"];
  check("aim fixtures: the spec's nine states are all there", needed.every((k) => keys.includes(k as (typeof keys)[number])), needed.filter((k) => !keys.includes(k as (typeof keys)[number])).join(", "));
  // The fix round's states: a re-plan waiting on an active plan, between milestones (ACTIVE, not
  // ACCEPTED), and a "Start again" copy whose milestone already paid (LINEAGE_PAID with its day).
  // Fix round 2 adds an ACCEPTED card whose latest reading is not the acceptance's (accepted-later).
  const fixRound = ["replan-waiting", "between", "paid-lineage", "accepted-later"];
  check("aim fixtures: the fix rounds' states are there too", fixRound.every((k) => keys.includes(k as (typeof keys)[number])), fixRound.filter((k) => !keys.includes(k as (typeof keys)[number])).join(", "));
  check("aim fixtures: every key is unique", new Set(keys).size === keys.length);
  /** Facts a fixture can't hold on its own today (the impossible-facts class the review found in R5's fixtures). */
  const impossible = (v: AimCardView): string[] => {
    const out: string[] = [];
    const dayOf = (isoAt: string) => dayKeyOf(new Date(isoAt));
    if (v.measuredAt && dayOf(v.measuredAt) > today) out.push(`measured ${v.measuredAt}, after today`);
    if (v.proficiency && dayOf(v.proficiency.measuredAt) > today) out.push(`Proficiency measured ${v.proficiency.measuredAt}, after today`);
    if (v.targetDay && v.targetDay <= today && v.state !== "DONE") out.push(`aim date ${v.targetDay} is not ahead`);
    for (const d of [v.reachedDay, v.doneDay, v.rank?.newSince ?? null]) if (d && d > today) out.push(`${d} is after today`);
    if (v.rank?.newSince && addDays(v.rank.newSince, RANK_NEW_DAYS) <= today) out.push(`new since ${v.rank.newSince}, longer ago than ${RANK_NEW_DAYS} days`);
    const ms = v.milestone;
    if (ms) {
      if (ms.ord > ms.of) out.push(`milestone ${ms.ord} of ${ms.of}`);
      if (ms.dueDay && (ms.status === "PAST_DUE" || v.state === "PAST_DUE" ? ms.dueDay >= today : ms.dueDay < today)) out.push(`${ms.status} milestone due ${ms.dueDay}`);
      if (ms.reachedDay && ms.reachedDay > today) out.push(`milestone reached ${ms.reachedDay}, after today`);
      if (ms.countsFrom && ms.countsFrom <= today) out.push(`a pending reach counting from ${ms.countsFrom}, not ahead`);
      if (ms.pace?.kind === "on-pace" && "day" in ms.pace && ms.dueDay && ms.pace.day > ms.dueDay) out.push(`on pace for ${ms.pace.day}, after its due day ${ms.dueDay}`);
      if (ms.percent != null && ms.headline && ms.percent !== Math.floor(100 * Number(ms.headline.value) + 1e-9)) out.push(`headline ${ms.percent}% ≠ its value`);
      if (ms.status === "PLANNED" && !ms.start) out.push("a planned milestone without its Start line");
      if (ms.status !== "PLANNED" && ms.start) out.push("a Start line on a started milestone");
      if (ms.start?.givesRank && v.rank && AIM_RANKS.indexOf(ms.start.givesRank) <= v.rank.index) out.push(`Start offers ${ms.start.givesRank}, already held`);
      if (ms.start && ms.start.stated > 0 && ms.start.zeroReason) out.push("a stated ⬡ with a zero reason");
      if (ms.start && ms.start.stated === 0 && !ms.start.zeroReason) out.push("states 0 with no reason");
      if (ms.start?.paidOn && (ms.start.zeroReason !== "LINEAGE_PAID" || ms.start.paidOn >= today)) out.push(`paid on ${ms.start.paidOn} without LINEAGE_PAID, or not before today`);
      if (ms.titleClass == null) out.push("milestone title has no class (provenanceOf)");
      // Fix round 2: a title's struck spans lie inside it, in order, and only Gemini's unchecked words
      // carry them (a NUMBER title can't be kept: TITLE_NUMBER), never the user's.
      const spans = ms.titleStruck ?? [];
      if (spans.some(([a, b], i) => a < 0 || b <= a || b > ms.title.length || (i > 0 && a < spans[i - 1][1]))) out.push(`title struck spans ${JSON.stringify(spans)} outside "${ms.title}"`);
      if (spans.length > 0 && ms.titleClass !== "DRAFT") out.push(`a ${ms.titleClass} title with struck numbers`);
    }
    if (v.weekQuests && (v.weekQuests.done > v.weekQuests.total || v.state !== "ACTIVE" || ms?.status === "PLANNED")) out.push("week quests without a started milestone");
    if (v.draftItems != null && v.state !== "DRAFT" && v.state !== "ACTIVE") out.push(`draft items on a ${v.state} card`);
    // Fix round 2: acceptedDay is the current version's acceptance day, set on every card after one
    // (R4 fills it from RoadmapAcceptance.day), never ahead, and an ACCEPTED card's reading is never
    // older than its acceptance (readings are written only for an accepted roadmap).
    const accepted = v.state === "ACCEPTED" || v.state === "ACTIVE" || v.state === "PAST_DUE" || v.state === "DONE";
    if (accepted && !v.acceptedDay) out.push(`a ${v.state} card with no acceptance day`);
    if (!accepted && v.acceptedDay) out.push(`an acceptance day on a ${v.state} card`);
    if (v.acceptedDay && v.acceptedDay > today) out.push(`accepted ${v.acceptedDay}, after today`);
    if (v.state === "ACCEPTED" && v.acceptedDay && v.proficiency && dayOf(v.proficiency.measuredAt) < v.acceptedDay) out.push(`Proficiency measured ${v.proficiency.measuredAt}, before the acceptance on ${v.acceptedDay}`);
    return out;
  };
  for (const f of fixtures) {
    const built = buildAimFixture(f);
    if (!built.view) {
      if (/^Not yet: /.test(built.waiting)) warn(`aim fixture ${f.key}: waits on a roadmap shell`, built.waiting);
      else check(`aim fixture ${f.key}: builds`, false, built.waiting);
      continue;
    }
    const v = built.view;
    const percent = v.proficiency?.percent ?? null;
    const change = v.proficiency?.change?.kind ?? null;
    check(`aim fixture ${f.key}: state ${f.expect.state}`, v.state === f.expect.state, v.state);
    check(`aim fixture ${f.key}: Proficiency ${f.expect.percent ?? "none"}`, percent === f.expect.percent, String(percent));
    check(`aim fixture ${f.key}: Aim rank ${f.expect.rank ?? "none"}`, (v.rank?.name ?? null) === f.expect.rank, String(v.rank?.name ?? null));
    check(`aim fixture ${f.key}: change ${f.expect.change ?? "none"}`, change === f.expect.change, String(change));
    if (v.proficiency) check(`aim fixture ${f.key}: Proficiency reads its stored reading's percent, floored`, v.proficiency.percent === Math.floor(100 * v.proficiency.figure.value + 1e-9));
    const bad = impossible(v);
    check(`aim fixture ${f.key}: every fact is possible today`, bad.length === 0, bad.join("; "));
    // R4's rankInputOf: maxScheduled is counted by place (maxScheduledPositionsOf), never by row.
    if (v.rank && f.rows) check(`aim fixture ${f.key}: the top rank on this plan is read from its places`, v.rank.top.index === topRankIndexOf(maxScheduledPositionsOf(f.rows)), `${v.rank.top.name} vs ${maxScheduledPositionsOf(f.rows)} places`);
    if (v.rank && !f.rows) check(`aim fixture ${f.key}: a ranked fixture names the rows its rank was read from`, false);
    // ACCEPTED: a plan accepted and no milestone ever carried (roadmap-types AimCardState).
    if (f.rows) {
      const carried = f.rows.some((r) => r.status === "STARTING" || r.status === "STARTED");
      if (v.state === "ACCEPTED") check(`aim fixture ${f.key}: ACCEPTED only while no milestone was ever carried`, !carried && (v.rank?.index ?? 0) === 0);
      if (carried && v.milestone?.status === "PLANNED") check(`aim fixture ${f.key}: a planned milestone after a carried one reads ACTIVE, never ACCEPTED`, v.state === "ACTIVE", v.state);
    }
  }
  // The fixture states pin each fix-round rule as R4's loaders apply it (lane 0's helpers).
  {
    const view = (k: string) => buildAimFixture(fixtures.find((f) => f.key === k)!).view;
    const between = view("between");
    if (between)
      check(
        "aim fixture between: milestone 1 reached this week, milestone 2 not started: ACTIVE, with the 'new' Aim rank, the meter and its parts over milestone 2's Start line",
        between.state === "ACTIVE" &&
          between.milestone?.status === "PLANNED" &&
          between.milestone.ord === 2 &&
          between.rank?.newSince === weekStartKeyOf(today) &&
          between.proficiency != null &&
          between.milestone.start?.givesRank === aimRankName(2) &&
          between.weekQuests === null,
        JSON.stringify({ state: between.state, newSince: between.rank?.newSince, ms: between.milestone?.status })
      );
    // Fix round 2: '· n items' is lane 0's one definition, draftNeedsOf(the next milestone).length (R4's
    // undecidedRowsOf, the review footer's "N items left"), read over real draft rows.
    const draft = view("draft");
    const needs = draftNeedsOf(DRAFT_NEXT);
    const label = (m: MilestoneDraft, id: string | null) => (id === m.id ? `title:${m.title}` : (m.items.find((i) => i.id === id)?.label ?? String(id)));
    const needList = needs.map((n) => `${n.need} ${label(DRAFT_NEXT, n.id)}`);
    check(
      "aim fixture draft: '· n items' is draftNeedsOf(milestone 1).length: decide a Domain, map the proposed one, decide a practice and a step, set the checkpoint's bar, in the page's order",
      draft?.draftItems === needs.length &&
        needList.join(" | ") === "DECIDE Risk Management | MAP Backtesting Methods | DECIDE Replay a week of charts | DECIDE Write the entry rules down | SET_BAR Rules checklist",
      `${draft?.draftItems} · ${needList.join(" | ")}`
    );
    const pendingRows = DRAFT_NEXT.items.filter((i) => i.decision === "PENDING").length;
    const notCounted = DRAFT_NEXT.items.filter((i) => i.origin === "SYLLABUS" || i.origin === "USER" || i.decision === "REMOVED");
    check(
      "aim fixture draft: the count is never a syllabus topic, a row the user wrote or a removed row (a count of PENDING rows would read differently)",
      notCounted.length === 4 && notCounted.every((i) => !needs.some((n) => n.id === i.id)) && pendingRows !== needs.length && DRAFT_NEXT.items.some((i) => i.origin === "SYLLABUS" && i.decision === "PENDING"),
      `${pendingRows} PENDING rows vs ${needs.length} needs`
    );
    const waiting = view("replan-waiting");
    const replanNeeds = draftNeedsOf(REPLAN_NEXT);
    check(
      "aim fixture replan-waiting: an ACTIVE plan's pending re-plan shows Draft waiting with draftNeedsOf(its first changed milestone), never its syllabus topic, and the plan as it stands",
      waiting?.state === "ACTIVE" &&
        waiting.draftItems === replanNeeds.length &&
        replanNeeds.length === 3 &&
        !replanNeeds.some((n) => REPLAN_NEXT.items.find((i) => i.id === n.id)?.origin === "SYLLABUS") &&
        waiting.milestone?.status === "STARTED",
      String(waiting?.draftItems)
    );
    // Fix round 2: the ACCEPTED caption may say "as measured at acceptance" only for a reading of the
    // acceptance day (isAcceptanceReading); every chain day after writes a new reading.
    const acc = view("accepted");
    const later = view("accepted-later");
    check(
      "aim fixture accepted: accepted yesterday and its latest Proficiency is that day's reading, so the acceptance caption holds",
      acc?.state === "ACCEPTED" && acc.acceptedDay === addDays(today, -1) && isAcceptanceReading(acc.proficiency?.measuredAt, acc.acceptedDay),
      JSON.stringify({ acceptedDay: acc?.acceptedDay, measuredAt: acc?.proficiency?.measuredAt })
    );
    check(
      "aim fixture accepted-later: accepted three days ago and measured this morning, so the acceptance caption would be false",
      later?.state === "ACCEPTED" &&
        later.acceptedDay === addDays(today, -3) &&
        later.proficiency != null &&
        dayKeyOf(new Date(later.proficiency.measuredAt)) === today &&
        !isAcceptanceReading(later.proficiency.measuredAt, later.acceptedDay) &&
        later.rank?.index === 0,
      JSON.stringify({ acceptedDay: later?.acceptedDay, measuredAt: later?.proficiency?.measuredAt })
    );
    // Fix round 2: a Gemini title's numbers are struck on the Aim card too, with the spans R3's check
    // derives (withLabelChecks over the plan's intake, R4's derivation for titleStruck).
    const struck = between?.milestone?.titleStruck ?? [];
    check(
      "aim fixture between: milestone 2's title is still Gemini's (decided at Start), class DRAFT, with its '1%' struck",
      between?.milestone?.title === TITLE_WITH_NUMBER &&
        between.milestone.titleClass === "DRAFT" &&
        struck.length === 1 &&
        TITLE_WITH_NUMBER.slice(struck[0][0], struck[0][1]) === "1%",
      JSON.stringify(struck)
    );
    const unstruck: string[] = [];
    for (const f of fixtures) {
      const ms = buildAimFixture(f).view?.milestone;
      if (!ms || (ms.titleClass !== "DRAFT" && ms.titleClass !== "KEPT_SUGGESTION")) continue;
      const decision = ms.titleClass === "DRAFT" ? "PENDING" : "KEPT";
      const row: MilestoneDraft = { id: ms.id, lineageId: ms.id, version: 1, ord: ms.ord, title: ms.title, titleOrigin: "GEMINI", titleDecision: decision, windowStart: null, dueDay: null, status: "PLANNED", rankIndex: null, overAccepted: false, items: [], measures: [], notes: [] };
      const [checked] = withLabelChecks([row], TRADING_LABEL_BASE, ms.of);
      if (JSON.stringify(checked.titleStruck ?? []) !== JSON.stringify(ms.titleStruck ?? [])) unstruck.push(`${f.key}: ${JSON.stringify(ms.titleStruck ?? [])} vs ${JSON.stringify(checked.titleStruck ?? [])}`);
      if (decision === "KEPT" && checked.titleFlags.includes("NUMBER")) unstruck.push(`${f.key}: a kept title flagged NUMBER (Keep is refused on one)`);
    }
    check("aim fixtures: every Gemini title on a card shows exactly the struck spans R3's title check derives, and no kept title holds a number", unstruck.length === 0, unstruck.join("; "));
    const active = view("active");
    check(
      "aim fixture active: a started milestone shows its goal's due day after a Reschedule (milestoneDueDayOf), not the planned one",
      active?.milestone?.dueDay === milestoneDueDayOf(addDays(today, MILESTONE2_DUE.planned), addDays(today, MILESTONE2_DUE.goal)) && active.milestone.dueDay === addDays(today, MILESTONE2_DUE.goal),
      String(active?.milestone?.dueDay)
    );
    const paid = view("paid-lineage");
    const restarted = tradingRows("STARTED", "PLANNED");
    check(
      "aim fixture paid-lineage: the Start again copy states 0 with LINEAGE_PAID and the day its milestone paid",
      paid?.milestone?.status === "PLANNED" && paid.milestone.start?.stated === 0 && paid.milestone.start.zeroReason === "LINEAGE_PAID" && paid.milestone.start.paidOn != null && paid.milestone.start.paidOn < today,
      JSON.stringify(paid?.milestone?.start)
    );
    check(
      "aim fixture paid-lineage: the copy keeps milestone 2's place: 7 rows, 6 places, the same milestone count on the card, and a PLANNED copy supersedes nothing",
      restarted.length === 7 && positionCountOf(restarted) === 6 && maxScheduledPositionsOf(restarted) === 6 && paid?.milestone?.of === 6 && !restarted.some((r) => isSupersededRow(r, restarted))
    );
    const done = view("done");
    const dropped = BODY_ROWS.find((r) => r.id === "fx-run-ms-2")!;
    check(
      "aim fixture done: a Body plan of three with milestone 2 started again counts three places (4 rows), so the reached aim tops out at Specialist, never Paragon",
      BODY_ROWS.length === 4 &&
        maxScheduledPositionsOf(BODY_ROWS) === 3 &&
        topRankIndexOf(BODY_ROWS.length) === RANK_TOP &&
        done?.rank?.name === aimRankName(3) &&
        done.rank.top.withAim === false &&
        isSupersededRow(dropped, BODY_ROWS),
      `${done?.rank?.name} · top ${done?.rank?.top.name}`
    );
    const classes = fixtures.map((f) => buildAimFixture(f).view?.milestone?.titleClass).filter(Boolean);
    check("aim fixtures: milestone titles carry their class, Gemini's kept words among them (the audit sees the chip)", classes.includes("KEPT_SUGGESTION") && classes.includes("YOURS"), classes.join(", "));
  }
  const newRank = buildAimFixture(fixtures.find((f) => f.key === "new-rank")!);
  if (newRank.view) check("aim fixture new-rank: marked new from the confirmed reach this week (after Sunday's reading, which counts no milestone yet)", newRank.view.rank?.newSince === "2026-12-21", String(newRank.view.rank?.newSince));
  const pending = buildAimFixture(fixtures.find((f) => f.key === "pending-reach")!);
  if (pending.view) check("aim fixture pending-reach: the rank waits for the reach to count", pending.view.rank?.name === AIM_RANKS[1] && pending.view.rank?.pending?.milestoneOrd === 2);
  const done = buildAimFixture(fixtures.find((f) => f.key === "done")!);
  if (done.view) check("aim fixture done: a reach more than a week old carries no 'new' marker", done.view.rank?.newSince === null, String(done.view.rank?.newSince));
  const words = fixtures.map((f) => `${f.label} ${f.note}`).join("\n");
  check("aim fixtures: their words never call a week quest a bare quest, nor say mastery or earn", !/\bquests?\b/i.test(words.replace(/week quests?/gi, "")) && !/master|\bearns?\b/i.test(words), words.slice(0, 120));
  const dir = "src/app/dev/style/art/you";
  const files = readdirSync(join(ROOT, dir)).map((n) => `${dir}/${n}`);
  const reads = files.filter((f) => /@\/lib\/(prisma|roadmap-server|roadmap-quests-server|roadmap-readings|throughput-server)|@prisma\/client|getCurrentUserId/.test(codeOf(read(f))));
  check("aim fixtures: the fixture route reads no database and never the user's roadmap", reads.length === 0, reads.join(", "));
  const page = codeOf(read(`${dir}/page.tsx`));
  check("aim fixtures: every state renders the real AimCard in its own [data-aim-card] box", /<AimCard view=\{built\.view\} promptDismissed=\{false\} today=\{today\} \/>/.test(page) && /data-aim-card=\{slot \?\? fixture\.key\}/.test(page) && /data-aim-fixture=\{f\.key\}/.test(page));
  // Every AimCard on the page sits inside FixtureRoadmapProvider (read from the JSX tree), so the
  // EMPTY card's × reaches the inert fixture action, never the live dismissAimPrompt (which would set
  // the real xtnl-aim-prompt cookie for a year).
  {
    const sf = ts.createSourceFile("page.tsx", read(`${dir}/page.tsx`), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
    const tags: { name: string; wrapped: boolean; today: boolean }[] = [];
    const tagOf = (n: ts.Node) => (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n) ? n.tagName.getText(sf) : null);
    const visit = (n: ts.Node) => {
      if (tagOf(n) === "AimCard") {
        let wrapped = false;
        for (let p: ts.Node | undefined = n.parent; p && !ts.isFunctionLike(p); p = p.parent) if (ts.isJsxElement(p) && p.openingElement.tagName.getText(sf) === "FixtureRoadmapProvider") wrapped = true;
        const attrs = (n as ts.JsxSelfClosingElement | ts.JsxOpeningElement).attributes.properties.map((a) => (ts.isJsxAttribute(a) ? a.name.getText(sf) : ""));
        tags.push({ name: "AimCard", wrapped, today: attrs.includes("today") });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    check(
      "aim fixtures: every AimCard renders inside FixtureRoadmapProvider (inert actions: the × sets no real cookie) and gets the page's life day",
      tags.length > 0 && tags.every((t) => t.wrapped && t.today) && /import \{ FixtureRoadmapProvider \} from "@\/components\/roadmap\/roadmap-runtime";/.test(page),
      JSON.stringify(tags)
    );
  }
  check("aim fixtures: no brand constructor is called outside the roadmap's own builders", !/\b(measured|recorded|selfReported|estimated|workedOut)\(/.test(codeOf(read(`${dir}/aim-fixtures.ts`))));
}

// 9d. The rules page's Roadmap section (seam 12).
{
  const rules = read("src/app/today/rules/page.tsx");
  const start = rules.indexOf("function RoadmapRules(");
  const body = start >= 0 ? rules.slice(rules.indexOf("return (", start), rules.indexOf("\n}\n", start)) : "";
  const text = literalText(body);
  // Class names (ink-0) are not figures; every other digit in the cards' literal text would be.
  const typed = [...text.replace(/className="[^"]*"/g, "").matchAll(/\d+/g)].map((m) => m[0]);
  check("rules roadmap: the Roadmap cards type no number by hand", start >= 0 && body.length > 2000 && typed.length === 0, typed.join(", "));
  const imported = rules.match(/import \{([^}]*)\} from "@\/lib\/roadmap-types"/)?.[1] ?? "";
  const needed = [
    "SPAN_MIN_DAYS", "SPAN_MAX_DAYS", "MILESTONE_TARGET_DAYS", "MAX_MILESTONES", "THRESHOLDS", "INTENSITY", "KEEP_SHARE", "PRACTICE_PAY_FLOOR_MIN", "PRACTICE_PAY_SHARE",
    "DECLARED_FACTOR", "RAMP_ALLOWANCE", "TIME_FITS_MAX", "CARD_WRITE_MIN", "REVIEW_SECONDS", "WEEK_QUEST_CATCHUP_FACTOR", "WEEK_QUEST_ADD_MIN_CAP", "WEEK_QUESTS_PER_WEEK_MAX",
    "LEVEL_WEIGHT", "AIM_RANKS", "RANK_MILESTONE_MAX", "PARAGON_MIN_MILESTONES", "rankIndexAt", "topRankIndexOf", "floorBase",
  ];
  const missing = needed.filter((n) => !new RegExp(`\\b${n}\\b`).test(imported));
  check("rules roadmap: the constants and tables are read from roadmap-types", missing.length === 0, missing.join(", "));
  check("rules roadmap: the Proficiency shares come from the formula itself (roadmap-proficiency proficiencyOf)", /import \{ proficiencyOf \} from "@\/lib\/roadmap-proficiency";/.test(rules) && /PROFICIENCY_SHARE_ROWS\.map/.test(body));
  // The share table, run: the page's own builder (transpiled from its source) over R1's real formula.
  {
    const fn = /function proficiencySharesOf[\s\S]*?\n\}\n/.exec(rules)?.[0] ?? "";
    const js = fn ? ts.transpileModule(fn, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText : "";
    type SharesOf = (withCards: boolean, withPractice: boolean) => { cards: number | null; practice: number | null; milestones: number | null };
    const sharesOf = js ? (new Function("proficiencyOf", "TOP_LEVEL", `${js}\nreturn proficiencySharesOf;`)(proficiencyOf, TOP_LEVEL) as SharesOf) : null;
    const near = (a: number | null, b: number | null) => (a == null || b == null ? a === b : Math.abs(a - b) < 1e-9);
    const same = (s: ReturnType<SharesOf> | undefined, want: [number | null, number | null, number | null]) => !!s && near(s.cards, want[0]) && near(s.practice, want[1]) && near(s.milestones, want[2]);
    const w = PROFICIENCY_WEIGHTS;
    const all = sharesOf?.(true, true);
    const noPractice = sharesOf?.(true, false);
    const noCards = sharesOf?.(false, true);
    check("rules roadmap: with every part, the shares are PROFICIENCY_WEIGHTS", same(all, [w.cards, w.practice, w.milestones]), JSON.stringify(all));
    check(
      "rules roadmap: a Field Area without practice reads cards 80% / milestones 20% (the spec's F12 prose says 0.75 / 0.25; the rule gives 0.8 / 0.2)",
      same(noPractice, [w.cards / (w.cards + w.milestones), null, w.milestones / (w.cards + w.milestones)]) && same(noPractice, [0.8, null, 0.2]),
      JSON.stringify(noPractice)
    );
    check("rules roadmap: a track Area reads practice 62.5% / milestones 37.5%", same(noCards, [null, 0.625, 0.375]), JSON.stringify(noCards));
    const sharePct = /const sharePct = \(n: number\) => `\$\{Number\(\(n \* 100\)\.toFixed\(1\)\)\}%`;/.test(rules);
    check("rules roadmap: shares print to one decimal at most (62.5%, never a rounded 63% + 38%)", sharePct);
  }
  // The fix round's rules, each sentence held to the helper that applies it (roadmap-types).
  {
    const aims = literalText(body.split(/<Card title="/).find((p) => p.startsWith('Aims and milestones"')) ?? "");
    const payText = literalText(body.split(/<Card title="/).find((p) => p.startsWith('What a milestone pays"')) ?? "");
    const rankText = literalText(body.split(/<Card title="/).find((p) => p.startsWith('Aim rank"')) ?? "");
    const flat = (t: string) => t.replace(/\s+/g, " ");
    const failedCounts = countsTowardDraftCap({ kind: "GEMINI", status: "FAILED" });
    const reusedCounts = countsTowardDraftCap({ kind: "GEMINI", status: "REUSED" });
    check(
      "rules roadmap: the draft cap counts a failed Gemini draft and not a reused one, as countsTowardDraftCap does",
      failedCounts && !reusedCounts && /drafts a day, a failed one included/.test(flat(aims)) && /a reused draft doesn&apos;t count/.test(flat(aims))
    );
    check(
      "rules roadmap: Gemini's words keep their label until checked or reworded (EDITED means the words changed), and a number is struck, only Edit or Remove",
      /keeps its label until you check it or change its words/.test(flat(aims)) && /struck through, never rewritten: that item can only be edited or removed/.test(flat(aims))
    );
    check(
      "rules roadmap: once started, a milestone's due day is its goal's (milestoneDueDayOf), so a Reschedule moves it",
      milestoneDueDayOf("2026-11-01", "2026-11-08") === "2026-11-08" && milestoneDueDayOf("2026-11-01", null) === "2026-11-01" && /its due day is its goal&apos;s: a Reschedule on Today moves it/.test(flat(payText))
    );
    const lineage: PositionRow[] = [
      { id: "a", lineageId: "m2", version: 1, status: "STARTED", rankIndex: 2, createdAt: 1 },
      { id: "b", lineageId: "m2", version: 1, status: "STARTED", rankIndex: 2, createdAt: 2 },
    ];
    check(
      "rules roadmap: a milestone pays once: once its Start again copy starts, the dropped goal is never measured again (isSupersededRow)",
      isSupersededRow(lineage[0], lineage) && !isSupersededRow(lineage[1], lineage) && /A milestone pays once\./.test(flat(payText)) && /dropped goal is never measured again and pays nothing/.test(flat(payText))
    );
    const plan3: PositionRow[] = [
      { id: "m1", lineageId: "l1", version: 1, status: "STARTED", rankIndex: 1, createdAt: 1 },
      ...lineage.map((r) => ({ ...r, lineageId: "l2" })),
      { id: "m3", lineageId: "l3", version: 1, status: "PLANNED", rankIndex: 3, createdAt: 1 },
    ];
    check(
      "rules roadmap: a milestone started again counts once (by place, never by row: 3 places, not 4, so never Paragon)",
      maxScheduledPositionsOf(plan3) === 3 && topRankIndexOf(maxScheduledPositionsOf(plan3)) !== RANK_TOP && topRankIndexOf(plan3.length) === RANK_TOP && /keeps its place and counts once/.test(flat(rankText)) && /never by row/.test(flat(rankText))
    );
  }
  check("rules roadmap: the section sits under its own 'Roadmap' header, after the day's rules", /<SectionHeader id="rules-roadmap" title="Roadmap"/.test(rules) && rules.indexOf("<RoadmapRules") > rules.indexOf("<TracksRules />"));
  const cards = new Map<string, string>();
  const parts = body.split(/<Card title="/).slice(1);
  for (const p of parts) cards.set(p.slice(0, p.indexOf('"')), literalText(p));
  const titles = [...cards.keys()];
  check(
    "rules roadmap: cards for the aim, realism, pay, week quests, Proficiency and the Aim rank",
    ["Aims and milestones", "Is the plan realistic?", "What a milestone pays", "Week quests (not the daily review quest)", "Proficiency", "Aim rank"].every((t) => cards.has(t)),
    titles.join(" | ")
  );
  check("rules roadmap: no heading starts with 'Quest'", titles.every((t) => !/^quest/i.test(t)));
  const quests = text.replace(/week quests?/gi, "").replace(/review quest/gi, "");
  check("rules roadmap: 'quest' only ever as 'week quest(s)' or the daily review quest", !/\bquests?\b/i.test(quests), (quests.match(/.{0,30}\bquests?\b.{0,30}/i) ?? [""])[0]);
  const wq = cards.get("Week quests (not the daily review quest)") ?? "";
  check("rules roadmap: week quests pay nothing, count nothing on Today, and never link to Review", /pay nothing/.test(wq) && /never link to Review/.test(wq) && /add nothing to Today/.test(wq));
  check("rules roadmap: week quests publish the catch-up and capacity caps and the Field quota overlap", /catch-up cap/.test(wq) && /capacity\s+cap/.test(wq) && /weekly quota too/.test(wq));
  const prof = `${cards.get("Proficiency") ?? ""}`;
  const profSrc = parts.find((p) => p.startsWith('Proficiency"')) ?? "";
  check("rules roadmap: the Proficiency card never says mastery, master or ⬡, and pays nothing", !/master/i.test(prof) && !/⬡|CurrencyGlyph/.test(profSrc) && /pays nothing/.test(prof));
  // JSX collapses a line break in its text to a space, so the words are read the same way.
  const rank = (cards.get("Aim rank") ?? "").replace(/\s+/g, " ");
  const rankLeft = rank.replace(/Aim ranks?/g, "").replace(/top rank on this plan/gi, "").replace(/next rank|keeps your rank|rank is kept for good/gi, "");
  check("rules roadmap: 'rank' only as 'Aim rank', 'top rank on this plan' or 'rank is kept for good'", !/\brank/i.test(rankLeft), (rankLeft.match(/.{0,30}\brank.{0,30}/i) ?? [""])[0]);
  check("rules roadmap: no rank line uses 'earn', and the rank is never called a title band", !/\bearns?\b/i.test(rank) && !/Novice|Apprentice|Adept|Master/.test(rank) && /not a title/.test(rank));
  const pay = parts.find((p) => p.startsWith('What a milestone pays"')) ?? "";
  check("rules roadmap: the milestone's stated MP carries an sr-only ' MP'", /<CurrencyGlyph kind="mp" \/>\s*\{mpFigure\(mid\.stated\)\}\s*<span className="sr-only"> MP<\/span>/.test(pay));
  check("rules roadmap: the review quest's text and its QUEST_CAP import are untouched", /import \{ FULL_DAY_MP, QUEST_CAP \} from "@\/lib\/full-day";/.test(rules) && (rules.match(/\{QUEST_CAP\}/g) ?? []).length === 3);
}

/**
 * Renders /dev/style/art/you itself (the server page, with the real AimCard
 * inside the fixtures provider): one box per state plus the one under the
 * hero, each holding a card, none waiting on a builder, nothing thrown.
 */
async function aimPageRenderChecks() {
  // AimCard imports roadmap.css (so /you gets it with the card); Node can't load CSS.
  (Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
    m.exports = {};
  };
  let html = "";
  try {
    const { default: Page } = await import("../src/app/dev/style/art/you/page");
    html = renderToStaticMarkup(createElement(Page));
  } catch (err) {
    check("aim fixtures page: renders", false, err instanceof Error ? err.message : String(err));
    return;
  }
  const keys = aimCardFixtures("2026-12-22").map((f) => f.key);
  const boxes = [...html.matchAll(/data-aim-card="([^"]+)"/g)].map((m) => m[1]);
  check("aim fixtures page: one [data-aim-card] box per state, and the active card under the hero", boxes.length === keys.length + 1 && keys.every((k) => boxes.includes(k)) && boxes[0] === "under-hero", boxes.join(", "));
  check("aim fixtures page: no state waits on a roadmap builder", !html.includes("Fixture waits on the roadmap"));
  const segments = html.split(/data-aim-card="/).slice(1);
  const bare = segments.filter((seg) => !/class="card rm-ac(?:-empty)?[ "]/.test(seg)).map((seg) => seg.slice(0, seg.indexOf('"')));
  check("aim fixtures page: every box holds an Aim card (.rm-ac, or the compact .rm-ac-empty line)", bare.length === 0, bare.join(", "));
  const empty = segments.find((seg) => seg.startsWith('empty"')) ?? "";
  check("aim fixtures page: the EMPTY state shows its line with the × (inert here: the fixtures provider)", /Set an aim/.test(empty.slice(0, 2000)) && /aria-label="Hide this"/.test(empty.slice(0, 2000)));

  // Fix round 2, as R5's AimCard renders the fixtures (fields lane 0 added; R4 fills them live). Each
  // box is cut before the next fixture's label and note, which may quote the words checked for.
  const box = (key: string) => {
    const seg = segments.find((s) => s.startsWith(`${key}"`)) ?? "";
    const end = seg.indexOf("data-aim-fixture=");
    return end >= 0 ? seg.slice(0, end) : seg;
  };
  const aimSrc = codeOf(read("src/components/roadmap/AimCard.tsx"));
  const r5 = "R5 (AimCard.tsx): fix round 2, contracts §11.4.5";
  // The ACCEPTED caption: "as measured at acceptance on <day>" only for a reading of the acceptance day.
  const captionOk = /as measured at acceptance on /.test(box("accepted")) && !/at acceptance/.test(box("accepted-later"));
  if (/\bisAcceptanceReading\b/.test(aimSrc))
    check("aim fixtures page: 'as measured at acceptance on <day>' shows for the acceptance day's reading only, never once a later reading stands", captionOk, `${/as measured at acceptance on /.test(box("accepted"))} / ${!/at acceptance/.test(box("accepted-later"))}`);
  else if (!captionOk) warn("aim fixtures page: the ACCEPTED caption claims the acceptance whatever the reading's day (accepted-later)", `waits on ${r5}: isAcceptanceReading(proficiency.measuredAt, view.acceptedDay)`);
  // A Gemini title's NUMBER spans are struck on the card's milestone line.
  const strikeOk = /<s>1%<\/s>/.test(box("between"));
  if (/\btitleStruck\b/.test(aimSrc)) check("aim fixtures page: the between card strikes the '1%' in Gemini's undecided title", strikeOk);
  else if (!strikeOk) warn("aim fixtures page: the between card shows Gemini's '1%' unstruck", `waits on ${r5}: StruckLabel with milestone.titleStruck`);
  // Live-shaped: a view without acceptedDay (R4 not filling it) never claims the acceptance.
  if (/\bisAcceptanceReading\b/.test(aimSrc)) {
    try {
      const { AimCard } = await import("../src/components/roadmap/AimCard");
      const { FixtureRoadmapProvider } = await import("../src/components/roadmap/roadmap-runtime");
      const today = todayKey(new Date());
      const accepted = buildAimFixture(aimCardFixtures(today).find((f) => f.key === "accepted")!).view!;
      const bare = renderToStaticMarkup(createElement(FixtureRoadmapProvider, null, createElement(AimCard, { view: { ...accepted, acceptedDay: undefined }, promptDismissed: false, today })));
      check("aim card: without acceptedDay (a loader that doesn't fill it) the ACCEPTED caption never claims the acceptance", /Proficiency/.test(bare) && !/at acceptance/.test(bare));
    } catch (err) {
      check("aim card: renders a live-shaped ACCEPTED view", false, err instanceof Error ? err.message : String(err));
    }
  }
}

(async () => {
  await redirects();
  await aimCardGuardChecks();
  await aimPageRenderChecks();
  const tw = await tailwindUtilities();
  cssChecks(tw.test, tw.via);
  sourceChecks(tw.test, tw.via);
  console.log(`you-check: ${pass} passed, ${fails.length} failed${warns.length ? `, ${warns.length} waiting on another lane` : ""}`);
  for (const w of warns) console.log(`  WARN ${w}`);
  for (const n of notes) console.log(`  NOTE ${n}`);
  for (const f of fails) console.log(`  FAIL ${f}`);
  process.exit(fails.length ? 1 : 0);
})();
