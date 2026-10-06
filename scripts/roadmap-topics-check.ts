/**
 * The topic map's pure parts (docs/life-plan/roadmap-contracts.md §22.7,
 * §22.8, §22.12; roadmap revision 5, lanes 6 and 7), a few focused cases
 * each, written to the contract:
 *   1. the map's rules C1–C10 (chainChecksOf) on the neutral-key copy of the
 *      illustration's shape (A1–A4 / B1 ← A1, B2 ← A2, B3 ← A3+A4 / C1–C3
 *      after layer 2 / D1, D2 after layer 3): the valid map passes, and one
 *      failing case per code pins its finding and its effect;
 *   2. Gemini's rating → K (roadmap-rating): the median of 3, the lower of 2
 *      that differ, one valid reply → code's estimate with that reply kept
 *      beside it, K within 1..6, an incoherent reason dropped (never its
 *      reply), K_final capped by the deepest layer the map fills;
 *   3. gating, the pure half: the parents Start reads (parentsOf: drawn links,
 *      else the whole layer before, a cross-goal Domain), milestone k+1 dated
 *      after milestone k, and a layer 1 all skipped or all held opening
 *      milestone 2 on day 0 with nothing dropped;
 *   4. the no-Gemini path on the live case's shape: the aim's clauses
 *      verbatim, offered as last-layer seeds, and a written map that adds no
 *      name or link of its own;
 *   5. layeredLadderOf on the illustration's shape (K = 4, L* = 10), and one
 *      LEVELS golden (stageLadderOf with the LEVELS kind spelled out reads
 *      byte-identical to the ladder with none).
 *
 * Not here: the hostile bar's families R and L (fixtures/roadmap-hostile)
 * cover every rating pattern and each C-code's firing by code; this file pins
 * what they don't (each code's effect and keys, the record's K). Start's
 * PREREQS_OPEN refusal itself is roadmap-server's (server-check).
 *
 * Pure: no database, no clock, no model.
 *
 *   npx tsx scripts/roadmap-topics-check.ts
 */
import "./_no-model";
import * as RT from "../src/lib/roadmap-types";
import { acceptRefusalOf, chainChecksOf, clauseSplitOf, kFinalOf, parentsOf, writtenMapOf, type ChainCheckContext, type WrittenMapInput } from "../src/lib/roadmap-topics";
import { ratingOf, ratingOverrideOf, withMapFillOf, type RateSampleIn } from "../src/lib/roadmap-rating";
import { layeredLadderOf, stageLadderOf, type ChainTopicInput, type StageLadderResult, type TopicChainInput } from "../src/lib/roadmap-realism";
import { addDays, type DayKey } from "../src/lib/life-day";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const json = (v: unknown) => JSON.stringify(v);
const eq = (name: string, got: unknown, want: unknown) => check(name, json(got) === json(want), `got ${json(got)}, want ${json(want)}`);

/** The live case's aim (contracts §22.8's clauseSplitOf golden), verbatim, typo and all. */
const LIVE_AIM = "I want to able to manage a 100k portfolio. while manage a morgate. as well as keep all bill, goal on target.";
const LIVE_CLAUSES = ["manage a 100k portfolio", "manage a morgate", "keep all bill, goal on target"];
const DAY: DayKey = "2026-10-05"; // a Monday

// ═══ 1. The map's rules C1–C10 on the neutral-key illustration ═══════════════

/** A kept, chosen, LINKED Gemini topic of the neutral-key map. */
function topic(key: string, layer: number, o: Partial<RT.TopicDraft> = {}): RT.TopicDraft {
  return {
    id: null,
    lineageId: `lin-${key}`,
    key,
    layer,
    name: `Topic ${key.toLowerCase()}`,
    rawName: null,
    nameOrigin: "GEMINI",
    scope: "GENERAL",
    placedBy: "GEMINI",
    grounding: "LINKED",
    sources: [],
    formVotes: 3,
    samples: 3,
    layerVotes: [layer, layer, layer],
    decision: "KEPT",
    mergedInto: null,
    chosen: true,
    role: layer === 4 ? "DEEP" : "BASE",
    domainId: null,
    bound: false,
    heldDay: null,
    skippedDay: null,
    flags: [],
    notes: [],
    ...o,
  };
}
/** A drawn, kept Gemini link parent → child (3 of 3). */
function edge(parent: string, child: string, o: Partial<RT.EdgeDraft> = {}): RT.EdgeDraft {
  return { id: null, parentLineageId: `lin-${parent}`, childLineageId: `lin-${child}`, parentDomainId: null, parentRoadmapId: null, origin: "GEMINI", votes: 3, samples: 3, drawn: true, decision: "KEPT", match: "NONE", ...o };
}
const LAYOUT: [string, number][] = [["A1", 1], ["A2", 1], ["A3", 1], ["A4", 1], ["B1", 2], ["B2", 2], ["B3", 2], ["C1", 3], ["C2", 3], ["C3", 3], ["D1", 4], ["D2", 4]];
/** The illustration's shape with neutral keys: B1 ← A1, B2 ← A2, B3 ← A3 + A4; C1–C3 after layer 2; D1, D2 after layer 3. */
function neutralMap(): RT.TopicMap {
  return { layers: 4, topics: LAYOUT.map(([k, l]) => topic(k, l)), edges: [edge("A1", "B1"), edge("A2", "B2"), edge("A3", "B3"), edge("A4", "B3")] };
}
const withEdges = (extra: RT.EdgeDraft[]): RT.TopicMap => {
  const m = neutralMap();
  return { ...m, edges: [...m.edges, ...extra] };
};
const renamed = (names: Record<string, string>): RT.TopicMap => {
  const m = neutralMap();
  return { ...m, topics: m.topics.map((t) => (names[t.key] ? { ...t, name: names[t.key] } : t)) };
};
const NO_CTX: ChainCheckContext = { outlineOrder: {}, chosenDomainKeys: [] };

console.log("— the map's rules C1–C10 (neutral keys) —");
{
  const valid = neutralMap();
  check(
    "chain: the neutral-key illustration passes every rule C1–C10 and accept",
    json(chainChecksOf(valid, NO_CTX)) === "[]" && acceptRefusalOf(valid, []) === null,
    `${json(chainChecksOf(valid, NO_CTX))} / ${acceptRefusalOf(valid, [])}`
  );

  const m0 = neutralMap();
  const cases: [RT.ChainCheckCode, string, RT.TopicMap, ChainCheckContext, { keys: string[]; effect: RT.ChainEffect }[]][] = [
    ["C1", "an edit linking layer 1 to layer 3 is REFUSED", withEdges([edge("A1", "C1", { origin: "USER" })]), NO_CTX, [{ keys: ["A1", "C1"], effect: "REFUSED" }]],
    ["C2", "a cycle forced through an edit trips the wire over its topics", withEdges([edge("B1", "A1", { origin: "USER" })]), NO_CTX, [{ keys: ["A1", "B1"], effect: "TRIPWIRE" }]],
    [
      "C3",
      "a parent you removed BLOCKS its child (never re-parented)",
      { ...m0, topics: m0.topics.map((t) => (t.key === "A1" ? { ...t, decision: "REMOVED" as const, chosen: false } : t)) },
      NO_CTX,
      [{ keys: ["B1"], effect: "BLOCKS" }],
    ],
    [
      "C4",
      "a child on 4 parents DROPS its lowest-voted link",
      withEdges([edge("A1", "B3", { origin: "USER", votes: 0 }), edge("A2", "B3", { origin: "USER" })]),
      NO_CTX,
      [{ keys: ["A1", "B3"], effect: "DROPPED" }],
    ],
    [
      "C5",
      "every layer-2 child on the same 2 drawn parents FALLS BACK to after layer 1",
      { ...m0, edges: ["B1", "B2", "B3"].flatMap((c) => [edge("A1", c), edge("A2", c)]) },
      NO_CTX,
      [{ keys: ["B1", "B2", "B3"], effect: "FALLBACK" }],
    ],
    [
      "C6",
      "topics that feed nothing chosen in the next layer are INFO",
      withEdges([edge("C1", "D1", { origin: "USER" }), edge("C1", "D2", { origin: "USER" })]),
      NO_CTX,
      [
        { keys: ["C2"], effect: "INFO" },
        { keys: ["C3"], effect: "INFO" },
      ],
    ],
    ["C7", "a link against your outline's order is FLAGGED", neutralMap(), { outlineOrder: { A1: 5, B1: 1 }, chosenDomainKeys: [] }, [{ keys: ["A1", "B1"], effect: "FLAG" }]],
    ["C8", "a link matching your outline's order is MARKED", neutralMap(), { outlineOrder: { A1: 0, B1: 1 }, chosenDomainKeys: [] }, [{ keys: ["A1", "B1"], effect: "MARK" }]],
    [
      "C9",
      "an intake Domain no chosen topic uses is FLAGGED",
      { ...m0, topics: [...m0.topics, topic("U1", 1, { nameOrigin: "LIBRARY", grounding: "OWN", domainId: "d1", bound: true, chosen: false })] },
      { outlineOrder: {}, chosenDomainKeys: ["U1"] },
      [{ keys: ["U1"], effect: "FLAG" }],
    ],
    ["C10", "the same topic one layer deeper is MERGED into its ancestor", renamed({ A1: "Budgeting basics", B1: "Advanced budgeting" }), NO_CTX, [{ keys: ["B1", "A1"], effect: "MERGED" }]],
  ];
  for (const [code, what, map, ctx, want] of cases) {
    const got = chainChecksOf(map, ctx)
      .filter((f) => f.code === code)
      .map((f) => ({ keys: f.keys, effect: f.effect }));
    eq(`chain.${code}: ${what}`, got, want);
  }
}

// ═══ 2. Gemini's rating → K ══════════════════════════════════════════════════

const vote = (difficulty: string, breadth = "WIDE", reasons?: string[]): RateSampleIn => ({ parsed: { difficulty, breadth, ...(reasons ? { reasons } : {}) }, integrity: "CLEAN" });
const REJECTED: RateSampleIn = { parsed: { difficulty: "DIFF_6", breadth: "VAST" }, integrity: "REJECTED" };
/** A Field Area with no outline (code's estimate: 3 layers), the live case's texts. */
const rate = (samples: (RateSampleIn | null)[]): RT.RatingRecord =>
  ratingOf({ samples, trackArea: false, outlineLines: 0, texts: { aim: LIVE_AIM, areaName: "Business & Finance", constraints: null }, inputKey: "r1-test", runId: "run-1", day: DAY });
const GEMINI = RT.RATING_ORIGINS[0];
const CODE = RT.RATING_ORIGINS[1];
const YOURS = RT.RATING_ORIGINS[2];

console.log("— the rating → K —");
{
  const three = rate([vote("DIFF_4"), vote("DIFF_4"), vote("DIFF_5")]);
  eq(
    "rate: 3 valid replies [4, 4, 5] → K 4, the median, Gemini's (sure: spread 1)",
    [three.difficulty, three.layers, three.origin, three.geminiDifficulty, three.spread, three.unsure],
    ["DIFF_4", 4, GEMINI, "DIFF_4", 1, null]
  );

  const two = rate([vote("DIFF_2"), REJECTED, vote("DIFF_5")]);
  eq("rate: 2 valid replies that differ [2, REJECTED, 5] → K 2, the lower, unsure 2–5", [two.difficulty, two.layers, two.origin, two.unsure], ["DIFF_2", 2, GEMINI, { low: 2, high: 5 }]);

  const one = rate([null, REJECTED, vote("DIFF_5")]);
  eq(
    "rate: 1 valid reply → code's estimate (a Field: 3), that reply kept beside it (oneReply, samples)",
    [one.difficulty, one.layers, one.origin, one.geminiDifficulty, one.oneReply, one.samples.map((s) => s?.difficulty ?? null)],
    ["DIFF_3", 3, CODE, null, "DIFF_5", [null, null, "DIFF_5"]]
  );

  const forged = rate([{ parsed: { difficulty: "DIFF_7", breadth: "WIDE" }, integrity: "CLEAN" }, vote("DIFF_2"), vote("DIFF_2")]);
  const set = (k: number) => ratingOverrideOf(forged, k, DAY);
  const s0 = set(0);
  const s7 = set(7);
  const s1 = set(1);
  const s6 = set(6);
  check(
    "rate: K stays within 1..6 (a forged DIFF_7 gives no vote; your override refuses 0 and 7 with LAYERS_BOUNDS, takes 1 and 6 as yours)",
    forged.samples[0] === null &&
      forged.layers === 2 &&
      !s0.ok &&
      s0.error === RT.LAYERS_BOUNDS &&
      !s7.ok &&
      s7.error === RT.LAYERS_BOUNDS &&
      s1.ok &&
      s1.value.layers === 1 &&
      s6.ok &&
      s6.value.layers === 6 &&
      s6.value.difficulty === "DIFF_6" &&
      s6.value.origin === YOURS &&
      s6.value.geminiDifficulty === forged.geminiDifficulty,
    json({ samples: forged.samples, layers: forged.layers, s0, s7, s1: s1.ok && s1.value.layers, s6: s6.ok && [s6.value.layers, s6.value.origin] })
  );

  // FEW_PREREQS breaks DIFF_6 (REASON_COHERENCE): the reason goes; the reply's DIFF_6 still votes, so the median is 6 (dropping the reply would give the lower of [6, 2]: 2).
  const incoherent = rate([vote("DIFF_6", "WIDE", ["FEW_PREREQS"]), vote("DIFF_6"), vote("DIFF_2")]);
  eq(
    "rate: an incoherent reason is dropped, never its reply (FEW_PREREQS on DIFF_6: K 6 from [6, 6, 2])",
    [incoherent.layers, incoherent.samples[0]?.difficulty, incoherent.samples[0]?.reasons, incoherent.samples[0]?.dropped, incoherent.incoherent, incoherent.reasons],
    [6, "DIFF_6", [], ["FEW_PREREQS"], 1, []]
  );

  const kept = (layers: number[]) => layers.map((layer) => ({ layer, decision: "KEPT" as const }));
  const kFinal = kFinalOf(kept([1, 1, 2, 4]), 4);
  const filled = withMapFillOf(three, kFinal);
  const yours = ratingOverrideOf(three, 5, DAY);
  const yoursFilled = yours.ok ? withMapFillOf(yours.value, kFinal) : null;
  eq(
    "rate: K_final is the deepest layer the map fills (layer 3 empty: 2; never above K) and caps Gemini's K; yours keeps its K",
    [kFinal, kFinalOf(kept([1, 2, 3, 4, 5, 6]), 4), filled.layers, filled.mapFilled, yoursFilled?.layers, yoursFilled?.mapFilled],
    [2, 4, 2, 2, 5, 2]
  );
}

// ═══ 5's fixture: the illustration's chain (K = 4, L* = 10) ═════════════════

const at = (k: number): DayKey => addDays(DAY, k);
function throughput(): RT.Throughput {
  const cal = { kind: "calibrating" as const, have: 1, need: 4 };
  return {
    finalDay: at(-2),
    trackedMinutes: cal,
    geminiShare: null,
    playMinutes: cal,
    trackedByTrack: {},
    trackedByCategory: {},
    completions: cal,
    activeDays: cal,
    adherence: { kind: "measured", value: 1, n: 20 },
    reviewsPerDay: cal,
    passShare: { kind: "measured", value: 0.85, n: 120 },
    clearance: { kind: "measured", value: 1, n: 14 },
    newCards: { total: cal, byField: {}, byDomain: {} },
  };
}
const reach: RT.ReachParams = { p: 0.85, pLong: Math.min(0.85, RT.P_LONG_CAP), c: 1, rho: 0, m: 1, strikeLimit: 2, graceExtra: 0 };
function realismIn(domainIds: string[], o: Partial<RT.RealismInput> = {}): RT.RealismInput {
  return {
    today: DAY,
    targetDay: at(365),
    scopes: [{ key: [...domainIds].sort().join(","), domainIds: [...domainIds].sort(), fieldId: "f1", cards: [], rateSource: "FIELD", rate: 20 }],
    throughput: throughput(),
    hoursPerWeek: 10,
    intensity: "STEADY",
    startPoint: "NEW",
    typicalHours: null,
    typicalHoursSource: null,
    m: 1,
    heldDays: [],
    areaInMaintenance: false,
    practicesAllowed: true,
    trackArea: false,
    dateMode: "REALISTIC",
    reach,
    calibrating: [],
    sourceRate: 20,
    ...o,
  };
}
function intakeOf(domainIds: string[], o: Partial<RT.Intake> = {}): RT.Intake {
  return {
    aim: "Learn the subject from broad to deep",
    fieldId: "f1",
    track: "CRAFT",
    domainIds,
    targetDay: at(365),
    hoursPerWeek: 10,
    newCardsPerWeek: null,
    typicalHours: null,
    typicalHoursSource: null,
    syllabus: null,
    startPoint: "NEW",
    intensity: "STEADY",
    practicesAllowed: true,
    constraints: null,
    examLabel: null,
    dateMode: "REALISTIC",
    ...o,
  };
}
let idSeq = 0;
const makeId = () => `tc-${++idSeq}`;
const BY_LAYER: string[][] = [1, 2, 3, 4].map((l) => LAYOUT.filter(([, k]) => k === l).map(([key]) => key));
const CHAIN_IDS = LAYOUT.map(([k]) => `d-${k}`);
const CHAIN_NAMES = Object.fromEntries(LAYOUT.map(([k]) => [`d-${k}`, `Topic ${k.toLowerCase()}`])) as unknown as Record<string, RT.DomainName>;
/** The 12 chosen topics, each on its own Domain: base topics at TOPIC_FLOOR_CARDS, the layer-4 specialisation at 25 (n_d of a new Domain). */
function chainOf(layerOne: Partial<ChainTopicInput> = {}): TopicChainInput {
  const chainTopic = (k: string, layer: number): ChainTopicInput => {
    const deep = layer === 4;
    const role: RT.TopicRole = deep ? "DEEP" : "BASE";
    return { lineageId: `lin-${k}`, domainId: `d-${k}`, role, held: false, skipped: false, nd: deep ? 25 : RT.TOPIC_FLOOR_CARDS, ...(layer === 1 ? layerOne : {}) };
  };
  return { layers: BY_LAYER.map((keys, i) => ({ layer: i + 1, topics: keys.map((k) => chainTopic(k, i + 1)) })), depth: 10, examDay: null };
}
type Ok = Extract<StageLadderResult, { ok: true }>;
function ladderOf(label: string, r: StageLadderResult): Ok | null {
  if (r.ok) return r;
  check(`${label}: the ladder builds`, false, `refused ${r.reason}: ${r.error}`);
  return null;
}
const TOPICS_INTAKE = intakeOf(CHAIN_IDS, { depth: null, topicDepth: 10, planKind: "TOPICS" });
const TOPICS_IN = realismIn(CHAIN_IDS, { planKind: "TOPICS" });
const chainLadder = (label: string, chain: TopicChainInput) => ladderOf(label, layeredLadderOf(TOPICS_INTAKE, TOPICS_IN, chain, CHAIN_NAMES, makeId));
/** The illustration's whole chain, built once (sections 3 and 5 read it). */
const FULL = chainLadder("chain K=4 L*=10", chainOf());
/** A row's topic card measures of one role (no PART or BETWEEN checkpoint), as "key@level×target". */
const topicMeasures = (ms: RT.MilestoneDraft, role: RT.MeasureRole): string[] =>
  ms.measures
    .filter((x) => x.kind === "CARDS_AT_LEVEL" && x.topicLineageId && !x.gate && x.role === role)
    .map((x) => `${String(x.topicLineageId).slice(4)}@${x.minLevel}×${x.target}`)
    .sort();
const at6 = (keys: string[], n: number) => keys.map((k) => `${k}@${RT.OPEN_LEVEL}×${n}`).sort();

// ═══ 3. Gating, the pure half ════════════════════════════════════════════════

console.log("— gating (the pure half) —");
{
  const m = withEdges([
    edge("A1", "B2", { drawn: false, votes: 2 }),
    edge("A3", "B1", { origin: "USER", decision: "REMOVED" }),
    { ...edge("A1", "C2", { origin: "CROSS_GOAL", drawn: false }), parentLineageId: "x:dom-g1", parentDomainId: "dom-g1", parentRoadmapId: "goal-1" },
  ]);
  eq(
    "gating: the parents Start reads are the counting links (an undrawn or removed one is none), a cross-goal Domain, else the whole layer before",
    ["B1", "B2", "B3", "C1", "C2"].map((k) => parentsOf(m, k)),
    [
      { kind: "LINKS", keys: ["A1"], crossGoal: [] },
      { kind: "LINKS", keys: ["A2"], crossGoal: [] },
      { kind: "LINKS", keys: ["A3", "A4"], crossGoal: [] },
      { kind: "LAYER", layer: 2 },
      { kind: "LINKS", keys: [], crossGoal: [{ roadmapId: "goal-1", domainId: "dom-g1" }] },
    ]
  );

  const full = FULL;
  if (full) {
    const after = full.plan.slice(1).map((ms, i) => !!ms.windowStart && !!full.plan[i].dueDay && ms.windowStart > (full.plan[i].dueDay as DayKey));
    check(
      "gating: milestone k + 1 opens after milestone k's due day, the depth milestone after layer K's",
      full.plan.length === 5 && after.every(Boolean),
      json(full.plan.map((ms) => [ms.windowStart, ms.dueDay]))
    );
  }

  for (const [how, layerOne, note] of [
    ["skipped (I know this)", { skipped: true }, "KNOWN_BY_YOU"],
    ["held when you began", { held: true }, "HELD_AT_START"],
  ] as const) {
    const r = chainLadder(`gating, layer 1 all ${how}`, chainOf(layerOne));
    if (!r) continue;
    const [m1, m2] = r.plan;
    check(
      `gating: a layer 1 all ${how} pays nothing (${note}, its topics CONTEXT, nothing dropped) and opens milestone 2 on day 0`,
      r.plan.length === 5 &&
        m1.layer === 1 &&
        m1.notes.includes(note) &&
        topicMeasures(m1, "PAYS").length === 0 &&
        json(topicMeasures(m1, "CONTEXT")) === json(at6(BY_LAYER[0], RT.TOPIC_FLOOR_CARDS)) &&
        m2.layer === 2 &&
        m2.windowStart === DAY,
      json({ n: r.plan.length, notes: m1.notes, pays: topicMeasures(m1, "PAYS"), context: topicMeasures(m1, "CONTEXT"), m2: [m2?.layer, m2?.windowStart] })
    );
  }
}

// ═══ 4. No Gemini, on the live case's shape ══════════════════════════════════

console.log("— the no-Gemini map (the live case's shape) —");
{
  const clauses = clauseSplitOf(LIVE_AIM);
  check(
    "clauses: the live aim splits into its 3 clauses, each verbatim (never spell-corrected: 'morgate' stays), the comma kept",
    json(clauses.map((c) => c.text)) === json(LIVE_CLAUSES) && clauses.every((c) => LIVE_AIM.slice(c.start, c.end) === c.text),
    json(clauses)
  );

  const library = [
    { id: "lib-1", name: "Library one" },
    { id: "lib-2", name: "Library two" },
  ];
  // No outline and no Domain chosen at the intake (lane 1's fix), code's rough estimate of 3 layers as the bands.
  const base: WrittenMapInput = { aim: LIVE_AIM, lines: [], layers: 3, domains: [], library, splitClauses: [], makeId };
  const live = writtenMapOf(base);
  const third = clauses[2];
  const split = writtenMapOf({ ...base, splitClauses: third ? [{ start: third.start, end: third.end, text: third.text, roadmapId: "goal-2", day: DAY }] : [] });
  eq(
    "no Gemini: the clauses are offered as last-layer seeds (never in layer 1, never placed), the library as layer-1 seeds; a clause tracked as its own goal is no longer offered",
    {
      topics: live.map.topics.length,
      edges: live.map.edges.length,
      last: live.lastLayerSeeds.map((c) => c.text),
      first: live.layerOneSeeds.map((d) => d.id),
      afterSplit: split.lastLayerSeeds.map((c) => c.text),
    },
    { topics: 0, edges: 0, last: LIVE_CLAUSES, first: ["lib-1", "lib-2"], afterSplit: LIVE_CLAUSES.slice(0, 2) }
  );

  // With two outline lines and one intake Domain over 3 bands: every name is yours, placed by code, no link.
  const lines = ["Line one", "Line two"];
  const written = writtenMapOf({ ...base, lines, domains: [{ key: "U1", id: "lib-1", name: "Library one" }] });
  const own = new Set([...lines, "Library one"]);
  const t = written.map.topics;
  check(
    "no Gemini: the written map adds no name or link of its own (your lines and Domains only, placed by code, chosen; K = the 2 layers filled, not the 3 bands)",
    t.length === 3 &&
      t.every((x) => own.has(x.name) && x.placedBy === RT.TOPIC_PLACED_BY[2] && x.chosen && x.decision === "KEPT" && (x.nameOrigin === "SYLLABUS" || x.nameOrigin === "LIBRARY")) &&
      written.map.edges.length === 0 &&
      t.find((x) => x.key === "U1")?.layer === 1 &&
      json(written.layerOneSeeds.map((d) => d.id)) === json(["lib-2"]) &&
      json(written.lastLayerSeeds.map((c) => c.text)) === json(LIVE_CLAUSES) &&
      kFinalOf(t, written.map.layers) === 2,
    json({ topics: t.map((x) => [x.key, x.layer, x.name, x.placedBy, x.nameOrigin]), edges: written.map.edges, seeds: written.layerOneSeeds, kFinal: kFinalOf(t, written.map.layers) })
  );
}

// ═══ 5. layeredLadderOf (K = 4, L* = 10), and LEVELS untouched ══════════════

console.log("— the chain → milestones —");
{
  const r = FULL;
  if (r) {
    const layers = r.plan.slice(0, 4);
    eq(
      "chain: K = 4 gives one milestone per layer at level 6 (FAMILIAR), each paying only its own layer's topics; the layers before climb to 8 as CONTEXT",
      layers.map((ms) => ({ role: ms.chainRole, layer: ms.layer, stage: ms.stage, pays: topicMeasures(ms, "PAYS"), context: topicMeasures(ms, "CONTEXT").map((s) => s.split("×")[0]) })),
      BY_LAYER.map((keys, i) => ({
        role: "LAYER",
        layer: i + 1,
        stage: "FAMILIAR",
        pays: at6(keys, i === 3 ? 25 : RT.TOPIC_FLOOR_CARDS),
        context: BY_LAYER.slice(0, i)
          .flat()
          .map((k) => `${k}@${RT.BASE_LEVEL}`)
          .sort(),
      }))
    );
    const tail = r.plan[4];
    eq(
      "chain: L* = 10 adds one 'set by reviews' depth milestone (FLUENT): the specialisation at 10, the base topics at 8; 5 milestones in all",
      { n: r.plan.length, role: tail?.chainRole, layer: tail?.layer, stage: tail?.stage, pays: tail ? topicMeasures(tail, "PAYS") : null },
      {
        n: 5,
        role: "DEPTH",
        layer: null,
        stage: "FLUENT",
        pays: [...BY_LAYER[3].map((k) => `${k}@10×25`), ...BY_LAYER.slice(0, 3).flat().map((k) => `${k}@${RT.BASE_LEVEL}×${RT.TOPIC_FLOOR_CARDS}`)].sort(),
      }
    );
  }

  // LEVELS reads as before: the rev-5 kind spelled out changes nothing (each run from the same id sequence).
  const levelsIds = ["a", "b"];
  const levelsNames = { a: "Alpha", b: "Beta" } as unknown as Record<string, RT.DomainName>;
  const ladderJson = (ik: RT.Intake, input: RT.RealismInput) => {
    let n = 0;
    return json(stageLadderOf(ik, input, levelsNames, () => `lv-${++n}`));
  };
  const before = ladderJson(intakeOf(levelsIds, { depth: 12 }), realismIn(levelsIds, { sourceRate: 6, depth: 12 }));
  const spelled = ladderJson(intakeOf(levelsIds, { depth: 12, planKind: "LEVELS" }), realismIn(levelsIds, { sourceRate: 6, depth: 12, planKind: "LEVELS" }));
  check("LEVELS: stageLadderOf with planKind LEVELS is byte-identical to the ladder with no plan kind", before === spelled && before.includes('"ok":true'), before === spelled ? before.slice(0, 160) : "the two ladders differ");
}

console.log("");
if (failed > 0) {
  console.log(`roadmap-topics-check: ${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`roadmap-topics-check: ${passed} passed, 0 failed`);
