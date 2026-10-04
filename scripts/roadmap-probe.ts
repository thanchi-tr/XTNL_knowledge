/**
 * The roadmap's one approved probe of the real model (docs/life-plan/roadmap.md
 * F5; question 4: about 10 calls, approved 2026-10-04; the key is on the free
 * tier). LEAD ONLY. Never in CI, never in a check, never run by a lane.
 *
 *   npx tsx --env-file=.env scripts/roadmap-probe.ts --i-approved [--aims=guitar,ielts] [--alt-model=<flash id>] [--no-thinking]
 *
 * What it sends: only the reply corpus's synthetic packs
 * (scripts/fixtures/roadmap-corpus/<aim>.json, `input`): made-up aims, Areas,
 * Domain names and counts. It never reads the user's library or the
 * database (no Prisma, no loadFieldTree), so on the free tier Google receives
 * corpus text only, never the user's aims, Domains or counts.
 *
 * What it does, at most MAX_PROBE_CALLS (10) requests in all (each planned
 * call sends exactly one request, whatever ROADMAP_SAMPLES says):
 *   1. one call per corpus aim (fixtures with "probe": false are skipped),
 *      with that aim's pack, the run's schema and ROADMAP_MODEL;
 *   2. one call with thinkingConfig {thinkingLevel: LOW} on the first aim
 *      (unless --no-thinking), to see whether the model accepts it;
 *   3. with --alt-model, one call with that id on the first aim (a
 *      Flash-tier id is recommended only if it passes).
 * Aims are dropped from the end of the list when the plan would pass the cap.
 * Each reply is saved unedited (the text, ≤ 32 KB, and the parsed JSON) as
 * scripts/fixtures/roadmap-corpus/probe-<aim>.json with "labelled": false; the
 * lead adds the hand labels (`claims` on each item, `titleClaims`,
 * newDomainClaims) and sets "labelled": true, and roadmap-model-check then
 * counts it in the corpus. The probe also prints what the validator makes of
 * each reply (drops, flags), with no further call.
 *
 * It confirms: the model id, that the schema's size and string bounds are
 * accepted, whether thinking LOW is accepted, the finishReason values, the
 * latency and the tokens. It prints a recommendation for ROADMAP_MODEL and
 * ROADMAP_THINKING_LOW; it changes nothing in src/.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hasGeminiKey } from "../src/lib/gemini";
import { ROADMAP_CHECK_ENV, ROADMAP_MODEL, SEED_BASE } from "../src/lib/roadmap-types";
import { buildEvidencePack, type EvidenceInput } from "../src/lib/roadmap-evidence";
import { draftSamples, type SampleResult } from "../src/lib/roadmap-model";
import { validateSample, type ValidateDomain } from "../src/lib/roadmap-validate";

/** The approval covers about 10 calls; this is the hard ceiling. */
const MAX_PROBE_CALLS = 10;
/**
 * Requests per planned call: exactly 1, never ROADMAP_SAMPLES (fix round). The
 * ceiling counts requests sent, so a later ROADMAP_SAMPLES of 3 (the deferred
 * consensus) can't turn 10 planned calls into 30 requests.
 */
const REQUESTS_PER_CALL = 1;
const APPROVAL_FLAG = "--i-approved";
const CORPUS_DIR = join(__dirname, "fixtures/roadmap-corpus");

interface CorpusFixture {
  aim: string;
  probe?: boolean;
  today: string;
  areaFieldId: string | null;
  input: EvidenceInput;
  library: ValidateDomain[];
}

interface PlannedCall {
  aim: string;
  model: string;
  thinkingLow: boolean;
  purpose: "corpus" | "thinking" | "alt-model";
}

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

function refuse(message: string): never {
  console.log(`roadmap-probe: refused — ${message}`);
  process.exit(1);
}

function loadCorpus(): CorpusFixture[] {
  return readdirSync(CORPUS_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("probe-"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(CORPUS_DIR, f), "utf8")) as CorpusFixture)
    .filter((fx) => fx.probe !== false);
}

/** Synthetic packs only: every fixture's input is checked to carry no real-looking id before anything is sent. */
function assertSynthetic(fx: CorpusFixture): void {
  const cuid = /\bc[a-z0-9]{24}\b/;
  const ids = [...fx.input.domains.map((d) => d.id), ...fx.input.intake.domainIds, fx.input.intake.fieldId ?? ""];
  if (ids.some((id) => cuid.test(id))) refuse(`${fx.aim}: the fixture holds a database-shaped id; the probe sends synthetic packs only`);
}

function plan(fixtures: CorpusFixture[]): PlannedCall[] {
  const only = arg("--aims");
  const chosen = only ? fixtures.filter((f) => only.split(",").includes(f.aim)) : fixtures;
  if (chosen.length === 0) refuse("no corpus aim to send");
  const extras: PlannedCall[] = [];
  if (!process.argv.includes("--no-thinking")) extras.push({ aim: chosen[0].aim, model: ROADMAP_MODEL, thinkingLow: true, purpose: "thinking" });
  const alt = arg("--alt-model");
  if (alt) extras.push({ aim: chosen[0].aim, model: alt, thinkingLow: false, purpose: "alt-model" });
  const room = Math.max(0, MAX_PROBE_CALLS - extras.length);
  const corpus: PlannedCall[] = chosen.slice(0, room).map((f) => ({ aim: f.aim, model: ROADMAP_MODEL, thinkingLow: false, purpose: "corpus" }));
  for (const skipped of chosen.slice(room)) console.log(`  (skipped to stay within ${MAX_PROBE_CALLS} calls: ${skipped.aim})`);
  return [...corpus, ...extras];
}

const usageOf = (r: SampleResult): string => {
  const u = (r.ok ? r.value.usage : r.usage ?? null) as { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } | null;
  if (!u) return "no usage";
  return `${u.promptTokenCount ?? "?"} in · ${u.candidatesTokenCount ?? "?"} out${u.thoughtsTokenCount ? ` · ${u.thoughtsTokenCount} thinking` : ""}`;
};

async function main() {
  if (!process.argv.includes(APPROVAL_FLAG)) {
    refuse(`this sends real requests to Gemini (about ${MAX_PROBE_CALLS} calls on the free tier). Pass ${APPROVAL_FLAG} only under the approval recorded in roadmap.md (question 4).`);
  }
  if (process.env[ROADMAP_CHECK_ENV] === "1") refuse(`${ROADMAP_CHECK_ENV} is set: the default call refuses inside a check run`);
  if (!hasGeminiKey()) refuse("GEMINI_API_KEY is not set (run with --env-file=.env)");

  const fixtures = loadCorpus();
  fixtures.forEach(assertSynthetic);
  const calls = plan(fixtures);
  console.log(`roadmap-probe: ${calls.length} call(s), at most ${MAX_PROBE_CALLS}:`);
  for (const c of calls) console.log(`  ${c.purpose.padEnd(9)} ${c.aim} · ${c.model}${c.thinkingLow ? " · thinking LOW" : ""}`);

  mkdirSync(CORPUS_DIR, { recursive: true });
  const byAim = new Map(fixtures.map((f) => [f.aim, f]));
  const outcomes: { call: PlannedCall; result: SampleResult }[] = [];
  let made = 0;
  for (const call of calls) {
    if (made + REQUESTS_PER_CALL > MAX_PROBE_CALLS) break;
    const fx = byAim.get(call.aim) as CorpusFixture;
    const pack = buildEvidencePack(fx.input);
    made += REQUESTS_PER_CALL;
    const [result] = await draftSamples(pack, REQUESTS_PER_CALL, { seedBase: SEED_BASE, model: call.model, thinkingLow: call.thinkingLow });
    outcomes.push({ call, result });
    const status = result.ok ? "OK" : `FAILED (${result.error})`;
    const finish = result.ok ? result.value.finishReason : result.finishReason ?? null;
    const latency = result.ok ? result.value.latencyMs : result.latencyMs ?? null;
    console.log(`\n[${made}] ${call.purpose} · ${call.aim} · ${call.model}: ${status} · finishReason ${finish ?? "none"} · ${latency} ms · ${usageOf(result)}`);

    if (call.purpose === "corpus") {
      const file = join(CORPUS_DIR, `probe-${call.aim}.json`);
      const saved = {
        aim: call.aim,
        labelled: false,
        note: "A real reply, unedited. To count it in roadmap-model-check: add `claims` to each item, `titleClaims` to each milestone and newDomainClaims, then set labelled: true.",
        model: call.model,
        modelVersion: result.ok ? result.value.modelVersion : result.modelVersion ?? null,
        responseId: result.ok ? result.value.responseId : result.responseId ?? null,
        finishReason: finish,
        latencyMs: latency,
        usage: result.ok ? result.value.usage : result.usage ?? null,
        error: result.ok ? null : result.error,
        raw: result.ok ? result.value.raw : result.raw ?? null,
        reply: result.ok ? result.value.parsed : null,
        newDomainClaims: {},
      };
      writeFileSync(file, `${JSON.stringify(saved, null, 2)}\n`, "utf8");
      console.log(`  saved ${file}`);
    }
    if (result.ok) {
      let n = 0;
      const windows = fx.input.windows;
      const v = validateSample(result.value.parsed, {
        pack,
        intake: fx.input.intake,
        areaName: fx.input.areaName,
        areaFieldId: fx.areaFieldId,
        domains: fx.library,
        windows,
        today: fx.today,
        makeId: () => `probe-${++n}`,
      });
      const items = v.milestones.reduce((s, m) => s + m.items.length + 1, 0);
      const flagged = new Map<string, number>();
      for (const e of v.report.flagged) flagged.set(e.code, (flagged.get(e.code) ?? 0) + 1);
      console.log(`  validator: ${v.milestones.length} milestone(s), ${items} items and titles, ${v.report.dropped.length} dropped, alarm ${v.alarm ? "ON" : "off"}`);
      console.log(`  flags: ${[...flagged].map(([k, c]) => `${k} ${c}`).join(" · ") || "none"}`);
      for (const d of v.report.dropped) console.log(`  dropped m${d.milestoneOrd} ${d.kind} "${d.label}": ${d.reason}`);
    }
  }

  // Recommendations (printed only; the lead edits roadmap-types.ts by hand).
  const corpus = outcomes.filter((o) => o.call.purpose === "corpus");
  const okShare = corpus.filter((o) => o.result.ok).length;
  const latencies = corpus.filter((o) => o.result.ok).map((o) => (o.result.ok ? o.result.value.latencyMs : 0)).sort((a, b) => a - b);
  const finishes = new Map<string, number>();
  for (const o of outcomes) {
    const f = (o.result.ok ? o.result.value.finishReason : o.result.finishReason) ?? "none";
    finishes.set(f, (finishes.get(f) ?? 0) + 1);
  }
  console.log(`\n— summary (${made} call(s)) —`);
  console.log(`  ${ROADMAP_MODEL}: ${okShare} of ${corpus.length} corpus calls accepted (finishReason STOP, JSON)`);
  console.log(`  finishReasons: ${[...finishes].map(([k, c]) => `${k} ${c}`).join(" · ")}`);
  if (latencies.length > 0) console.log(`  latency: median ${latencies[Math.floor(latencies.length / 2)]} ms, max ${latencies[latencies.length - 1]} ms (ROADMAP_ABORT_MS is 35000)`);
  const schemaRejected = corpus.some((o) => !o.result.ok && /schema|400|INVALID_ARGUMENT/i.test(o.result.error));
  console.log(`  schema with string maxItems/minItems/maxLength: ${schemaRejected ? "REJECTED — see the errors above" : corpus.length > 0 ? "accepted" : "not sent"}`);
  const thinking = outcomes.find((o) => o.call.purpose === "thinking");
  if (thinking) console.log(`  thinking LOW: ${thinking.result.ok ? "accepted — ROADMAP_THINKING_LOW may be set to true" : `not accepted (${thinking.result.error}) — keep ROADMAP_THINKING_LOW false`}`);
  const alt = outcomes.find((o) => o.call.purpose === "alt-model");
  if (alt) {
    const flash = /flash/i.test(alt.call.model);
    console.log(
      `  ${alt.call.model}: ${alt.result.ok ? "passed" : `failed (${alt.result.error})`} — ${alt.result.ok && flash ? "a Flash-tier id that may replace ROADMAP_MODEL" : `keep ROADMAP_MODEL = "${ROADMAP_MODEL}"`}`
    );
  } else {
    console.log(`  recommendation: ${okShare === corpus.length && corpus.length > 0 ? `keep ROADMAP_MODEL = "${ROADMAP_MODEL}"` : "investigate the failures before ROADMAP_MODEL is final"}`);
  }
  console.log("  next: label each probe-<aim>.json, set labelled: true, and run npm run roadmap-model:check.");
}

main().catch((e) => {
  console.log(`roadmap-probe: stopped — ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
