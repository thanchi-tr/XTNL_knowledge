/**
 * Ruling N16's live probe of the re-break (LEAD ONLY: never in CI, never in a check, never run by a lane, and never
 * imports the checks' no-model guard). The user asked for a meaning test on two real goals: break each into
 * milestones once, then break every milestone down again on the production model and on a stronger (dearer) one, and
 * rate whether researching the topics would take a person to the goal, with the spend held under a hard cap.
 *
 *   npx tsx scripts/roadmap-rebreak-probe.ts --dry                                   no key, no network: the packs and the worst case
 *   npx tsx scripts/roadmap-rebreak-probe.ts --list-models                           the models this key may call (free)
 *   npx tsx scripts/roadmap-rebreak-probe.ts --i-approved --model=<id> [--budget=1.5] [--samples=3]
 *
 * Per goal: one MAP call on ROADMAP_MODEL (its milestones and its own names: what the page shows today), then REBREAK
 * over every layer with TOPIC_SAMPLES samples on ROADMAP_MODEL and on --model, each through rebreakAgreementOf as the
 * server runs it (no GROUND: the web check is unchanged and costs search queries). Every reply is saved, unedited,
 * under scripts/fixtures/roadmap-corpus/probe-n16-<goal>.json with its usage and cost.
 *
 * The cap: before each call the worst case (its input by characters, plus ROADMAP_MAX_OUTPUT_TOKENS of output, thinking
 * included, at the model's output price) must fit what is left of --budget (default $1.50); after it, the cost is read
 * from usageMetadata. Prices are per million tokens, conservative by default (PRICES), and --price-in / --price-out
 * override the stronger model's. It sends only the two goals below and the milestones Gemini wrote for them: never the
 * user's library or the database.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { geminiCallModel, topicSamples, type CallModel, type ModelRequest, type SampleResult } from "../src/lib/roadmap-model";
import { topicPackOf } from "../src/lib/roadmap-evidence";
import { mapMilestonesOf, mapRoomOf, rebreakAgreementOf, type MapSampleIn } from "../src/lib/roadmap-topics";
import { integrityOf, type LabelContext } from "../src/lib/roadmap-validate";
import { LAYER_KEYS, ROADMAP_MAX_OUTPUT_TOKENS, ROADMAP_MODEL, TOPIC_SAMPLES, type BreadthKey, type LayerMilestone } from "../src/lib/roadmap-types";

interface Goal {
  id: string;
  areaName: string;
  aim: string;
  layers: number;
  breadth: BreadthKey;
}

/** Two meaningful goals: the user's own (the live map that prompted N16), and a technical one that must reach a shipped product. */
const GOALS: readonly Goal[] = [
  {
    id: "household-portfolio",
    areaName: "Personal Finance",
    aim: "Manage a $100000 portfolio (no home equity) and run a household: bills, land tax, groceries, mortgage",
    layers: 4,
    breadth: "WIDE",
  },
  {
    id: "saas-app",
    areaName: "Web Development",
    aim: "Build and ship a web app alone: user accounts, Postgres, paid subscriptions, deployed and monitored",
    layers: 4,
    breadth: "WIDE",
  },
];

/** USD per million tokens (input, output with thinking). Conservative: at or above the published prices of each tier. */
const PRICES: readonly { match: RegExp; inUsd: number; outUsd: number }[] = [
  { match: /flash-lite/, inUsd: 0.15, outUsd: 0.6 },
  { match: /flash/, inUsd: 0.5, outUsd: 4 },
  { match: /pro/, inUsd: 4, outUsd: 20 },
];
const FALLBACK_PRICE = { inUsd: 4, outUsd: 20 };

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "";
};
const num = (v: string | null, d: number): number => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);

const BUDGET = num(flag("budget"), 1.5);
const SAMPLES = Math.max(1, Math.min(TOPIC_SAMPLES, Math.floor(num(flag("samples"), TOPIC_SAMPLES))));
const STRONG = flag("model") ?? "";

function priceOf(model: string): { inUsd: number; outUsd: number } {
  if (model === STRONG && (flag("price-in") != null || flag("price-out") != null)) {
    const base = PRICES.find((p) => p.match.test(model)) ?? FALLBACK_PRICE;
    return { inUsd: num(flag("price-in"), base.inUsd), outUsd: num(flag("price-out"), base.outUsd) };
  }
  return PRICES.find((p) => p.match.test(model)) ?? FALLBACK_PRICE;
}

let spent = 0;
const ledger: { model: string; phase: string; inTok: number; outTok: number; usd: number }[] = [];

/** The real call, refused when its worst case would pass the budget; the cost read from usageMetadata after it. */
function cappedCall(inner: CallModel, phase: string): CallModel {
  return async (req: ModelRequest) => {
    const p = priceOf(req.model);
    const inEst = Math.ceil((req.contents.length + req.systemInstruction.length + JSON.stringify(req.responseSchema ?? null).length) / 3);
    const worst = (inEst * p.inUsd + req.maxOutputTokens * p.outUsd) / 1e6;
    if (spent + worst > BUDGET) throw new Error(`budget: ${phase} on ${req.model} could cost $${worst.toFixed(4)}, $${(BUDGET - spent).toFixed(4)} left`);
    const res = (await inner(req)) as { usageMetadata?: Record<string, number> } | null;
    const u = res?.usageMetadata ?? {};
    const inTok = u.promptTokenCount ?? inEst;
    const outTok = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
    const usd = (inTok * p.inUsd + outTok * p.outUsd) / 1e6;
    spent += usd;
    ledger.push({ model: req.model, phase, inTok, outTok, usd });
    return res;
  };
}

const label = (g: Goal): LabelContext => ({ kind: "TOPIC", aim: g.aim, constraints: null, examLabel: null, syllabusLines: [], areaName: g.areaName, domainNames: [], track: "CRAFT" }) as LabelContext;
const asSamples = (results: readonly SampleResult[], schema: unknown): MapSampleIn[] =>
  results.map((r) => (r.ok ? { parsed: r.value.parsed, integrity: integrityOf(r.value.parsed, schema).verdict } : { parsed: null, integrity: "REJECTED" as const }));

function mapPackOf(g: Goal) {
  const room = mapRoomOf({ layers: g.layers, breadth: g.breadth, lines: 0, domains: 0 });
  return topicPackOf({ phase: "MAP", areaName: g.areaName, aim: g.aim, splitClauses: [], outline: [], examLabel: null, layers: g.layers, breadth: g.breadth, room, place: [] });
}
function rebreakPackOf(g: Goal, milestones: readonly LayerMilestone[]) {
  const ask = Array.from({ length: g.layers }, (_, i) => i + 1);
  return topicPackOf({ phase: "REBREAK", areaName: g.areaName, aim: g.aim, splitClauses: [], outline: [], examLabel: null, layers: g.layers, milestones, ask, held: [] });
}

/** MAP's names by layer, as one sample wrote them (what a first breakdown offers today, before GROUND). */
function mapNamesOf(parsed: unknown, layers: number): Record<string, string[]> {
  const names = (parsed as { names?: Record<string, { name?: string }[]> } | null)?.names ?? {};
  return Object.fromEntries(LAYER_KEYS.slice(0, layers).map((lk) => [lk, (names[lk] ?? []).map((x) => x?.name ?? "").filter(Boolean)]));
}

async function rebreakWith(g: Goal, milestones: readonly LayerMilestone[], model: string, call: CallModel) {
  const pack = rebreakPackOf(g, milestones);
  const results = await topicSamples(pack, { callModel: cappedCall(call, `REBREAK ${g.id}`), seedBase: 101, samples: SAMPLES, model });
  let n = 0;
  const agreed = rebreakAgreementOf({
    samples: asSamples(results, pack.schema),
    layers: Array.from({ length: g.layers }, (_, i) => i + 1),
    map: { layers: g.layers, topics: [], edges: [] },
    freeDomains: [],
    takenNames: [],
    aim: g.aim,
    label: label(g),
    countryNamed: false,
    makeId: () => `p${++n}`,
  });
  const byLayer = Object.fromEntries(
    Array.from({ length: g.layers }, (_, i) => [
      `L${i + 1}`,
      [...agreed.topics, ...agreed.hidden].filter((t) => t.layer === i + 1).map((t) => `${t.name}${agreed.hidden.includes(t) ? " (hidden)" : ""} ·${t.formVotes}/${t.samples}`),
    ])
  );
  return { model, results: results.map((r) => (r.ok ? { ok: true, raw: r.value.raw, usage: r.value.usage, finishReason: r.value.finishReason } : { ok: false, error: r.error })), byLayer, report: agreed.report };
}

async function main() {
  if (flag("list-models") != null) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not set");
    const ai = new GoogleGenAI({ apiKey: key });
    const pager = await ai.models.list();
    for await (const m of pager) if (/gemini/i.test(m.name ?? "")) console.log(m.name, "·", m.displayName ?? "");
    return;
  }
  if (flag("dry") != null) {
    for (const g of GOALS) {
      const mp = mapPackOf(g);
      const fake: LayerMilestone[] = Array.from({ length: g.layers }, (_, i) => ({ layer: i + 1, title: `Milestone ${i + 1}`, hurdle: "A hurdle", target: "A target" }));
      const rp = rebreakPackOf(g, fake);
      console.log(`\n=== ${g.id} · MAP\n${mp.contents}\n=== REBREAK\n${rp.contents}`);
      const strong = STRONG || "a pro model";
      const worst = (m: string) => ((6000 * priceOf(m).inUsd + ROADMAP_MAX_OUTPUT_TOKENS * priceOf(m).outUsd) / 1e6).toFixed(4);
      console.log(`worst case a call: ${ROADMAP_MODEL} $${worst(ROADMAP_MODEL)}, ${strong} $${worst(STRONG || "pro")}`);
    }
    return;
  }
  if (flag("i-approved") == null || !STRONG) {
    console.log("Refused: pass --i-approved and --model=<the stronger model id> (see --list-models). --dry shows what would be sent.");
    process.exit(2);
  }
  const call = geminiCallModel(process.env);
  const out: Record<string, unknown> = {};
  const dir = join(process.cwd(), "scripts/fixtures/roadmap-corpus");
  mkdirSync(dir, { recursive: true });
  for (const g of GOALS) {
    const mp = mapPackOf(g);
    const [map] = await topicSamples(mp, { callModel: cappedCall(call, `MAP ${g.id}`), seedBase: 11, samples: 1, model: ROADMAP_MODEL });
    if (!map?.ok) throw new Error(`MAP ${g.id}: ${map && !map.ok ? map.error : "no reply"}`);
    const milestones = mapMilestonesOf([{ parsed: map.value.parsed, integrity: integrityOf(map.value.parsed, mp.schema).verdict }], g.layers, []);
    const base = await rebreakWith(g, milestones, ROADMAP_MODEL, call);
    const strong = await rebreakWith(g, milestones, STRONG, call);
    const record = {
      probe: "N16 rebreak",
      goal: g,
      milestones,
      mapNames: mapNamesOf(map.value.parsed, g.layers),
      rebreak: { [ROADMAP_MODEL]: base, [STRONG]: strong },
      spentUsd: Number(spent.toFixed(4)),
      labels: { depth: null, notes: "" },
    };
    writeFileSync(join(dir, `probe-n16-${g.id}.json`), `${JSON.stringify(record, null, 2)}\n`);
    out[g.id] = record;
    console.log(`\n=== ${g.id}`);
    for (const m of milestones) {
      console.log(`\nL${m.layer} · ${m.title}\n  target: ${m.target}`);
      console.log(`  MAP today:        ${(record.mapNames[`L${m.layer}`] ?? []).join("; ")}`);
      console.log(`  REBREAK ${ROADMAP_MODEL}: ${(base.byLayer[`L${m.layer}`] ?? []).join("; ")}`);
      console.log(`  REBREAK ${STRONG}: ${(strong.byLayer[`L${m.layer}`] ?? []).join("; ")}`);
    }
  }
  console.log("\nspend:");
  for (const l of ledger) console.log(`  ${l.phase.padEnd(28)} ${l.model.padEnd(28)} in ${String(l.inTok).padStart(6)} out ${String(l.outTok).padStart(6)}  $${l.usd.toFixed(4)}`);
  console.log(`  total $${spent.toFixed(4)} of $${BUDGET.toFixed(2)}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  console.error(`spent so far $${spent.toFixed(4)}`);
  process.exit(1);
});
