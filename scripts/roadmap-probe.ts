/**
 * The roadmap's approved probe of the real model, v4 (contracts §20,
 * ROADMAP_PROMPT_VERSION 4: code owns the practice progression). LEAD ONLY.
 * Never in CI, never in a check, never run by a lane, and never imports the
 * checks' no-model guard.
 *
 *   npx tsx --env-file=.env scripts/roadmap-probe.ts --i-approved   the 2 approved calls, then the offline part
 *   npx tsx scripts/roadmap-probe.ts --offline                       the offline part only: no key, no network
 *
 * Why v4: the 5 Oct run (F-R4-23; contracts §19.14) was 7 of 7 CLEAN in the
 * production configuration but failed the gate on practice fit (10 of 34
 * stages, against 80%) and arrangement (1 of 7): the keys-only schema left
 * practices optional, and Gemini placed none or cycled kinds with no
 * build-up. Since v4 Gemini gives only `needs` (confirmed by the user), the
 * outline's `order`, and at most one pick per stage among code's candidates
 * (`picks`); every practice, step and checkpoint is code's progression
 * (roadmap-catalog progressionOf). So practice fit and arrangement are read
 * from CODE'S PLAN built with the reply's picks (progressionOf over
 * keysOnlyProgressionInputOf, the validator's own input), never from the
 * raw reply.
 *
 * What it sends: only the reply corpus's synthetic packs
 * (scripts/fixtures/roadmap-corpus/*.json, read through corpus.ts with their
 * v3 intake): made-up aims, Areas, Domain names and counts. It never reads
 * the user's library or the database (no Prisma, no loader), so Google
 * receives corpus text only.
 *
 * The fix round (r3, the review of 5 Oct): the labelled `plan` is the plan
 * the user would be shown, R2's own: the pack's dated ladder with the
 * reply's picks and order (roadmap-realism stageLadderOf, through
 * fixtures/roadmap-corpus/ladder.ts corpusLadderOf), and the progression its
 * rows hold at each stage's room (planProgressionOf: practicesThatFitOf over
 * the stage's budget, the exam's stage from its day), with each practice's
 * sessions a week and duration; the fixture records each stage's room and
 * the exam's stage. The pack sent asks a pick only for the stages that
 * ladder reads one for (EvidenceInput.pickStages: roadmap-evidence
 * pickStagesOf, as R4 passes it), and its `order` is optional (absent: the
 * user's own order). Only when R2 refuses the ladder does the plan fall back
 * to the slots (progressionOf over keysOnlyProgressionInputOf at the
 * default room), and the fixture says so.
 *
 * The calls: exactly MAX_PROBE_CALLS (2) requests, one per planned call
 * (PROBE_PLAN), whatever ROADMAP_SAMPLES says, both in the production
 * configuration (the gap slot off, thinking off; the user approved these 2
 * free-tier calls):
 *   1  actuarial-probability (the word-rich exam pack: an outline, chosen and
 *      unchosen Domains, library titles the prompt never carries); the run
 *      the gate still lacked;
 *   2  new-subject ("Sail a dinghy solo": two named Domains and a six-line
 *      outline, so the order is tested from nothing).
 * Each reply is saved, unedited, as scripts/fixtures/roadmap-corpus/
 * probe-v4-<pack>.json (the 5 Oct v3 files are never overwritten) with
 * promptVersion 4, raw, parsed, finishReason, usage, latencyMs,
 * modelVersion, its integrity, `validated` (the KeysOnlyDraft, ids from a
 * counter), `plan` (code's plan with the reply's picks, stage by stage, for
 * the labellers), `expected: null`, `blessed: false`, and empty `labels`:
 * per `needs` key whether the aim plausibly needs that Domain, per stage
 * whether code's practices fit it (read from `plan`), and whether the
 * reply's order keeps what later lines build on first. The lead then sets
 * `expected` and blessed: true; roadmap-model-check re-validates every
 * blessed fixture and deep-compares it (--bless rewrites the snapshot after
 * review).
 *
 * The offline part (no request; also run after the calls): each blessed v3
 * reply of the 5 Oct run read under v4 (roadmap-validate replyV4OfV3: its
 * `needs` as they were, its stages' lines as the order, and per stage the
 * first of its practice kinds that the stage's v4 enum holds as the pick,
 * else code's default), validated, and its practice fit read from code's
 * plan: a stage fits when it carries practice, its F-R4-13 role on a Field
 * plan, and every rule of the progression (progressionViolationsOf). It
 * prints each stage's v3 practices beside code's, the picks mapped, and the
 * human labels' v3 practice fit beside the machine reading.
 * roadmap-model-check pins the same reading (34 of 34 stages; 7 picks placed
 * as Gemini's since the family tables and the exam's stages, contracts §20.11).
 *
 * It prints the go/no-go lines for both switches (ROADMAP_GEMINI_LIVE: format,
 * H1, the outline lines Gemini left out (code appends them), the
 * progression's rules on code's plan, practice fit and arrangement from the
 * labels; ROADMAP_GAPS_LIVE: off in this run, so it stays false). It changes
 * nothing in src/: the lead edits roadmap-types.ts by hand.
 *
 * PROBE_PLAN v5 (revision 5, contracts §22.15; the spec's "Probe plan"; lane 10 writes it, lanes 11 and 12 run it
 * only after the user approves each stage and its count):
 *
 *   npx tsx scripts/roadmap-probe.ts --v5 --list                                   both stages' plans; no key, no call
 *   npx tsx --env-file=.env scripts/roadmap-probe.ts --v5 --stage=1 --i-approved   stage 1, once MAX_PROBE_CALLS_V5 holds the approved count
 *
 *   Stage 1 (schema acceptance and the shape of grounding): P1–P6, and P3b only if P3 is rejected — 7 calls, at most
 *   8, of which 2 are grounded (P5, P5b). Each item changes one thing from a known-accepted baseline; no call is
 *   retried. Stage 2 (G-R, G-M, G-U, G-I: at most 123 requests, 69 with candidateCount, 42 grounded) is listed as
 *   plans only: it is asked for separately after stage 1, with its exact cap, and this build refuses to run it.
 *   Synthetic packs only: the corpus packs and code-owned planted lists, never the user's library, aim or figures
 *   (finance-compound is the paraphrase "Learn to run a household's investments and home loan, and keep the monthly
 *   budget on track"). Every reply is saved unedited as scripts/fixtures/roadmap-corpus/probe-v5-<item>.json
 *   (blessed: false, expected: null). MAX_PROBE_CALLS_V5 is 0 until the user's approval sets it, so nothing here can
 *   send a request in this build.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hasGeminiKey } from "../src/lib/gemini";
import { GAPS_LIVE_MIN_LABELLED, ROADMAP_CHECK_ENV, ROADMAP_GAPS_LIVE, ROADMAP_GEMINI_LIVE, ROADMAP_MODEL, ROADMAP_PROMPT_VERSION, SEED_BASE, type EvidencePack, type ValidatedDraft } from "../src/lib/roadmap-types";
import { buildResponseSchema, draftSamples, type SampleResult } from "../src/lib/roadmap-model";
import { integrityOf, keysOnlyProgressionInputOf, packRunOf, replyV4OfV3, validateKeysOnly, type KeysOnlyContext, type KeysOnlyDraft } from "../src/lib/roadmap-validate";
import { catalogLabelOf, catalogOriginOf, practiceRoleOf, progressionOf, progressionShapeOf, progressionViolationsOf, type CatalogKey, type CatalogTrack, type Progression, type ProgressionInput } from "../src/lib/roadmap-catalog";
import { CORPUS_DIR, keysOnlyContextOf, packOf, readCorpus, readProbeFixtures, type CorpusEntry } from "./fixtures/roadmap-corpus/corpus";
import { corpusLadderOf, type CorpusLadderStage } from "./fixtures/roadmap-corpus/ladder";
// ── PROBE_PLAN v5 (revision 5, lane 10) ──
import { GROUND_PAIR_DICE_MAX, GROUND_TITLE_MODE, TOPIC_PROMPT_VERSION, type BreadthKey } from "../src/lib/roadmap-types";
import { groundResponseOf, groundSamples, topicSamples, type GroundSampleResult } from "../src/lib/roadmap-model";
import { topicPackOf, type TopicPack } from "../src/lib/roadmap-evidence";
import { mapRoomOf } from "../src/lib/roadmap-topics";
import { groundBatchesOf, groundVerdictOf, type GroundTerm } from "../src/lib/roadmap-grounding";

/** The approval covers 2 calls; this is the hard ceiling. */
const MAX_PROBE_CALLS = 2;
/** Requests per planned call: exactly 1, never ROADMAP_SAMPLES. The ceiling counts requests sent. */
const REQUESTS_PER_CALL = 1;
const APPROVAL_FLAG = "--i-approved";
const OFFLINE_FLAG = "--offline";

interface PlannedCall {
  pack: string;
  /** The gap slot: off (the production configuration). */
  gapsLive: boolean;
  /** Thinking LOW: off (gemini-3.5-flash-lite refused it on 5 Oct). */
  thinkingLow: boolean;
  file: string;
}

/** The v4 plan: exactly 2 requests, both in the production configuration (contracts §19.14, §20.8). */
const FIELD_PLAN: readonly PlannedCall[] = [
  { pack: "actuarial-probability", gapsLive: false, thinkingLow: false, file: "probe-v4-actuarial-probability.json" },
  { pack: "new-subject", gapsLive: false, thinkingLow: false, file: "probe-v4-new-subject.json" },
];

/**
 * --track-call: the user's further approval (5 Oct) of exactly ONE call on a
 * track pack, so the track schema (a root OBJECT holding only `picks`) is
 * tested against the API before ROADMAP_GEMINI_LIVE. Same flag, same guards.
 */
const TRACK_CALL_FLAG = "--track-call";
const TRACK_PLAN: readonly PlannedCall[] = [{ pack: "run-10k", gapsLive: false, thinkingLow: false, file: "probe-v4-run-10k.json" }];
const TRACK_ONLY = process.argv.includes(TRACK_CALL_FLAG);
const PROBE_PLAN: readonly PlannedCall[] = TRACK_ONLY ? TRACK_PLAN : FIELD_PLAN;

function refuse(message: string): never {
  console.log(`roadmap-probe: refused — ${message}`);
  process.exit(1);
}

/** Synthetic packs only: every fixture's ids are checked to look nothing like a database id before anything is sent. */
function assertSynthetic(e: CorpusEntry): void {
  const cuid = /\bc[a-z0-9]{24}\b/;
  const ids = [...e.input.domains.map((d) => d.id), ...e.input.intake.domainIds, e.input.intake.fieldId ?? ""];
  if (ids.some((id) => cuid.test(id))) refuse(`${e.aim}: the fixture holds a database-shaped id; the probe sends synthetic packs only`);
}

const usageOf = (r: SampleResult): string => {
  const u = (r.ok ? r.value.usage : r.usage ?? null) as { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } | null;
  if (!u) return "no usage";
  return `${u.promptTokenCount ?? "?"} in · ${u.candidatesTokenCount ?? "?"} out${u.thoughtsTokenCount ? ` · ${u.thoughtsTokenCount} thinking` : ""}`;
};

/** H1's closure on one validated reply: every label is a catalog render, the user's own line, a Domain row's name, or a GAP row. */
function closureProblems(v: ValidatedDraft, ctx: KeysOnlyContext): string[] {
  const out: string[] = [];
  const lines = ctx.intake.syllabus?.lines ?? [];
  const track = ctx.pack.trackArea ? ctx.intake.track : "FIELD";
  for (const m of v.milestones) {
    if (m.title !== "") out.push(`a title "${m.title}"`);
    for (const it of m.items) {
      if (it.kind === "GAP") continue;
      if (it.kind === "TOPIC" && it.origin === "SYLLABUS" && it.syllabusRef != null && it.label === lines[it.syllabusRef]) continue;
      if (it.kind === "DOMAIN" && it.domainId != null && it.label === ctx.domainNames[it.domainId]) continue;
      if (it.origin === catalogOriginOf() && it.catalogKey) {
        const ids = it.domainId ? [it.domainId] : [...ctx.required];
        const domains = ids.map((id) => ctx.fill?.domains[id]).filter((d): d is NonNullable<typeof d> => !!d);
        const want = catalogLabelOf(it.catalogKey, { track, domains, ...(ctx.fill?.aim ? { aim: ctx.fill.aim } : {}), ...(ctx.fill?.exam ? { exam: ctx.fill.exam } : {}) });
        if (it.label === want) continue;
      }
      out.push(`${it.kind} "${it.label}"`);
    }
  }
  return out;
}

/** One stage of code's plan, as the labellers read it (with R2's ladder: its dates, its room and each practice's size). */
type PlanStage = Pick<CorpusLadderStage, "stage" | "steps" | "checkpoint"> & {
  practices: { kind: string; why: string; picked: boolean; sessionsPerWeek?: number | null; durationBand?: string | null }[];
} & Partial<Pick<CorpusLadderStage, "level" | "windowStart" | "dueDay" | "room">>;

/** Where a plan's room came from (saved in the fixture beside the plan). */
interface PlanRoom {
  /** "ladder": R2's dated ladder at each stage's room; "slots": the ladder was refused, so the slots at the default room. */
  basis: "ladder" | "slots";
  /** Each stage's room for practices (planProgressionOf's maxPractices), or null (the default, PRACTICES_PER_MILESTONE). */
  maxPractices: (number | null)[] | null;
  /** The stage holding the exam (dated: its day's stage), as the progression read it; null without an exam. */
  examStage: number | null;
  /** Why the ladder was refused, with basis "slots". */
  refused?: string;
}

/** The machine reading of practice fit per stage: practice, its F-R4-13 role on a Field plan, and no breach naming the stage. */
function fitsOf(track: CatalogTrack, p: Progression, breaches: readonly string[]): boolean[] {
  return p.stages.map((s) => {
    const shape = progressionShapeOf(track, s);
    const shaped = shape == null || s.practices.some((x) => practiceRoleOf({ catalogKey: x.kind }) === shape);
    return s.practices.length > 0 && shaped && !breaches.some((b) => b.includes(`stage ${s.index}:`));
  });
}

/**
 * Code's plan for a validated reply, read at the slots: progressionOf over
 * the validator's own input (keysOnlyProgressionInputOf over the pack's run,
 * with the reply's valid picks), at the default room; its breaches
 * (progressionViolationsOf: [] when every rule holds), and the machine
 * reading of practice fit. The offline part's reading, and the live calls'
 * fallback when R2 refuses the ladder.
 */
function slotPlanOf(pack: EvidencePack, v: KeysOnlyDraft): { track: CatalogTrack; plan: PlanStage[]; breaches: string[]; fits: boolean[]; p: Progression; room: PlanRoom } | null {
  const run = packRunOf(pack);
  if (!run) return null;
  const input = keysOnlyProgressionInputOf({ ...run, practicesAllowed: pack.practicesAllowed, blocked: run.blocked ?? [] }, v.picks ?? {});
  const p = progressionOf(input);
  const breaches = progressionViolationsOf(input, p);
  const plan = p.stages.map((s) => ({
    stage: s.stage,
    practices: s.practices.map((x) => ({ kind: x.kind, why: x.why, picked: x.picked })),
    steps: s.steps.map((x) => x.kind),
    checkpoint: s.checkpoint?.kind ?? null,
  }));
  return { track: run.track, plan, breaches, fits: fitsOf(run.track, p, breaches), p, room: { basis: "slots", maxPractices: null, examStage: p.examStage } };
}

/**
 * Code's plan for a validated reply as the user would see it (the fix
 * round, r3): R2's dated ladder for the pack with the reply's valid picks
 * and order (corpusLadderOf: stageLadderOf, then planProgressionOf at each
 * stage's room, the exam's stage from its day), its breaches
 * (progressionViolationsOf over the progression's own input), the machine
 * reading of practice fit, and the room it was read at. When R2 refuses the
 * ladder: the slot reading (slotPlanOf), with the refusal recorded.
 */
function codePlanOf(e: CorpusEntry, pack: EvidencePack, v: KeysOnlyDraft): { track: CatalogTrack; plan: PlanStage[]; breaches: string[]; fits: boolean[]; p: Progression; room: PlanRoom } | null {
  const run = packRunOf(pack);
  if (!run) return null;
  const ladder = corpusLadderOf(e, {
    picks: v.picks ?? {},
    order: v.order?.order ?? null,
    gate: { blocked: run.blocked ?? [] },
    excluded: run.exclusions.map((x) => x.kind as CatalogKey),
  });
  if (!ladder.ok) {
    const slots = slotPlanOf(pack, v);
    return slots ? { ...slots, room: { ...slots.room, refused: ladder.error } } : null;
  }
  const input: ProgressionInput = ladder.progressionInput;
  const p = ladder.progression;
  const breaches = progressionViolationsOf(input, p);
  const max = input.maxPractices;
  const maxPractices = Array.isArray(max) ? (max as readonly (number | null | undefined)[]).map((x) => (typeof x === "number" ? x : null)) : p.stages.map(() => (typeof max === "number" ? max : null));
  return { track: run.track, plan: ladder.stages, breaches, fits: fitsOf(run.track, p, breaches), p, room: { basis: "ladder", maxPractices, examStage: p.examStage } };
}

/** The labels' stage keys: each stage's key, "#2" on a repeat (a ladder may hold two rows of one key). */
function stageLabelKeysOf(plan: readonly PlanStage[]): string[] {
  const seen = new Map<string, number>();
  return plan.map((s) => {
    const k = (seen.get(s.stage) ?? 0) + 1;
    seen.set(s.stage, k);
    return k === 1 ? s.stage : `${s.stage}#${k}`;
  });
}

/**
 * The offline part: the 5 Oct run's blessed v3 replies read under v4, with
 * practice fit from code's plan. No request, no key: it reads the saved
 * fixtures and the corpus only.
 */
function offlineRevalidation(): { stages: number; fits: number; picksMapped: number; labelledFits: number; labelled: number } {
  const corpus = new Map(readCorpus().map((e) => [e.aim, e]));
  const totals = { stages: 0, fits: 0, picksMapped: 0, labelledFits: 0, labelled: 0 };
  console.log("\n— offline: the 5 Oct run's blessed v3 replies read under v4 (code's plan with their picks) —");
  for (const p of readProbeFixtures()) {
    if (!p.blessed || (typeof p.promptVersion === "number" && p.promptVersion >= 4)) continue;
    const e = corpus.get(p.pack);
    if (!e) {
      console.log(`  ${p.file}: its pack ${p.pack} is not in the corpus — skipped`);
      continue;
    }
    const pack = packOf(e, { gapsLive: p.gapsLive });
    const schema = buildResponseSchema(pack);
    const reply = replyV4OfV3(p.parsed, schema);
    let n = 0;
    const ctx = keysOnlyContextOf(e, pack, { makeId: () => `offline-${++n}` });
    const v = validateKeysOnly(reply, ctx);
    const code = slotPlanOf(pack, v);
    const verdict = v.report.integrity?.verdict ?? "?";
    const closure = closureProblems(v, ctx);
    console.log(`\n  ${p.pack}: under v4 ${verdict}${closure.length ? ` · H1 NO (${closure.slice(0, 3).join("; ")})` : " · H1 holds"} · picks mapped ${Object.keys(v.picks ?? {}).length} · the progression's rules ${code && code.breaches.length === 0 ? "hold" : `BREACHED (${code?.breaches.slice(0, 3).join("; ")})`}`);
    if (!code) continue;
    const stages3 = ((p.parsed as { stages?: Record<string, { practices?: { kind?: unknown }[] }> })?.stages ?? {}) as Record<string, { practices?: { kind?: unknown }[] }>;
    const labels = (p.labels as { stages?: Record<string, { practiceFit?: unknown }> } | null | undefined)?.stages ?? {};
    code.plan.forEach((st, i) => {
      const was = (stages3[st.stage]?.practices ?? []).map((x) => String(x.kind)).join(", ") || "(none)";
      const now = st.practices.map((x) => `${x.kind}${x.picked ? " (Gemini's pick)" : ""}`).join(", ");
      const human = labels[st.stage]?.practiceFit;
      totals.stages += 1;
      if (code.fits[i]) totals.fits += 1;
      if (typeof human === "boolean") {
        totals.labelled += 1;
        if (human) totals.labelledFits += 1;
      }
      console.log(`    ${st.stage.padEnd(10)} v3: ${was} → v4: ${now} · steps ${st.steps.join(", ") || "none"} · checkpoint ${st.checkpoint ?? "none"} · fit ${code.fits[i] ? "yes" : "NO"} (the v3 label: ${typeof human === "boolean" ? (human ? "yes" : "no") : "none"})`);
    });
    totals.picksMapped += Object.keys(v.picks ?? {}).length;
  }
  const pct = (a: number, b: number) => (b === 0 ? "n/a" : `${((100 * a) / b).toFixed(1)}%`);
  console.log(`\n  practice fit under v4 (code's plan, the machine reading): ${totals.fits} of ${totals.stages} stages (${pct(totals.fits, totals.stages)}); the v3 human labels: ${totals.labelledFits} of ${totals.labelled} (${pct(totals.labelledFits, totals.labelled)})`);
  console.log(`  practice picks mapped onto a stage's candidates: ${totals.picksMapped} (the rest took code's default)`);
  console.log("  the gate reads practice fit from labels: relabel code's plan per stage (two judges, a reconcile) before reading it as the 80% bar.");
  return totals;
}

async function main() {
  const approved = process.argv.includes(APPROVAL_FLAG);
  const offlineOnly = process.argv.includes(OFFLINE_FLAG) && !approved;
  if (!approved && !offlineOnly) {
    refuse(`this sends ${MAX_PROBE_CALLS} real requests to Gemini on the free tier. Pass ${APPROVAL_FLAG} only under the user's recorded approval (contracts §19.14, §20.8), or ${OFFLINE_FLAG} for the offline part alone.`);
  }
  if (offlineOnly) {
    console.log(`roadmap-probe (v4, offline): no request is sent; ROADMAP_PROMPT_VERSION is ${ROADMAP_PROMPT_VERSION}`);
    offlineRevalidation();
    return;
  }
  if (process.env[ROADMAP_CHECK_ENV] === "1") refuse(`${ROADMAP_CHECK_ENV} is set: the default call refuses inside a check run`);
  if (!hasGeminiKey()) refuse("GEMINI_API_KEY is not set (run with --env-file=.env)");
  if (ROADMAP_PROMPT_VERSION !== 4) refuse(`ROADMAP_PROMPT_VERSION is ${ROADMAP_PROMPT_VERSION}, not 4: the v4 schema and instruction must be in place first`);
  if (PROBE_PLAN.length * REQUESTS_PER_CALL > MAX_PROBE_CALLS) refuse("the plan is over the approved ceiling");
  if (PROBE_PLAN.some((c) => c.gapsLive || c.thinkingLow)) refuse("every call runs in the production configuration (the gap slot off, thinking off)");

  const corpus = new Map(readCorpus().map((e) => [e.aim, e]));
  for (const call of PROBE_PLAN) {
    const e = corpus.get(call.pack);
    if (!e) refuse(`no corpus pack named ${call.pack}`);
    assertSynthetic(e);
  }
  console.log(`roadmap-probe (v4, keys only: needs, order, picks): ${PROBE_PLAN.length} call(s), at most ${MAX_PROBE_CALLS}; ROADMAP_GEMINI_LIVE is ${ROADMAP_GEMINI_LIVE}, ROADMAP_GAPS_LIVE is ${ROADMAP_GAPS_LIVE}`);
  for (const c of PROBE_PLAN) console.log(`  ${c.pack} (the gap slot off, thinking off) → ${c.file}`);

  mkdirSync(CORPUS_DIR, { recursive: true });
  const outcomes: { call: PlannedCall; result: SampleResult; validated: KeysOnlyDraft | null; ctx: KeysOnlyContext; code: ReturnType<typeof codePlanOf> }[] = [];
  let made = 0;
  for (const call of PROBE_PLAN) {
    if (made + REQUESTS_PER_CALL > MAX_PROBE_CALLS) break;
    const e = corpus.get(call.pack) as CorpusEntry;
    // The pack as R4 sends it: a pick asked only for the stages the plan's own ladder reads one for (pickStagesOf).
    const starter = corpusLadderOf(e);
    const pickStages = starter.ok ? starter.pickStages : null;
    const pack = packOf(e, { gapsLive: call.gapsLive, pickStages });
    made += REQUESTS_PER_CALL;
    const [result] = await draftSamples(pack, REQUESTS_PER_CALL, { seedBase: SEED_BASE, model: ROADMAP_MODEL, thinkingLow: call.thinkingLow });
    let n = 0;
    const ctx = keysOnlyContextOf(e, pack, { makeId: () => `probe-${++n}` });
    const integrity = result.ok ? integrityOf(result.value.parsed, buildResponseSchema(pack)) : null;
    const validated = result.ok ? validateKeysOnly(result.value.parsed, ctx) : null;
    const code = validated && validated.report.integrity?.verdict !== "REJECTED" ? codePlanOf(e, pack, validated) : null;
    outcomes.push({ call, result, validated, ctx, code });
    const finish = result.ok ? result.value.finishReason : result.finishReason ?? null;
    const latency = result.ok ? result.value.latencyMs : result.latencyMs ?? null;
    console.log(`\n[${made}] ${call.pack}: ${result.ok ? "OK" : `FAILED (${result.error})`} · finishReason ${finish ?? "none"} · ${latency} ms · ${usageOf(result)}`);

    const parsed = result.ok ? (result.value.parsed as { needs?: unknown }) : null;
    const needs = Array.isArray(parsed?.needs) ? (parsed.needs as unknown[]).filter((k): k is string => typeof k === "string") : [];
    const saved = {
      aim: call.pack,
      pack: call.pack,
      promptVersion: ROADMAP_PROMPT_VERSION,
      gapsLive: call.gapsLive,
      thinkingLow: call.thinkingLow,
      note: "A real v4 reply, unedited. `plan` is code's plan with the reply's picks (the progression), stage by stage. The lead fills `labels` (practice fit per stage read from `plan`, arrangement from the reply's order), sets `expected` (CLEAN, SALVAGED or REJECTED) and blessed: true; roadmap-model-check then re-validates and deep-compares it.",
      model: ROADMAP_MODEL,
      modelVersion: result.ok ? result.value.modelVersion : result.modelVersion ?? null,
      responseId: result.ok ? result.value.responseId : result.responseId ?? null,
      finishReason: finish,
      latencyMs: latency,
      usage: result.ok ? result.value.usage : result.usage ?? null,
      error: result.ok ? null : result.error,
      raw: result.ok ? result.value.raw : result.raw ?? null,
      parsed: result.ok ? result.value.parsed : null,
      integrity,
      validated,
      pickStages,
      plan: code?.plan ?? null,
      room: code?.room ?? null,
      expected: null,
      blessed: false,
      labels: {
        needs: Object.fromEntries(needs.map((k) => [k, { plausible: null }])),
        stages: Object.fromEntries(stageLabelKeysOf(code?.plan ?? []).map((k) => [k, { practiceFit: null }])),
        arrangementKeepsOrder: null,
        gaps: [],
      },
    };
    const file = join(CORPUS_DIR, call.file);
    writeFileSync(file, `${JSON.stringify(saved, null, 2)}\n`, "utf8");
    console.log(`  saved ${file}`);
    if (integrity) console.log(`  integrity: ${integrity.verdict}${integrity.violations.length ? ` · ${integrity.violations.map((x) => `${x.code} ${x.path}`).join(" · ")}` : ""}`);
    if (validated) {
      const keyOfLine = new Map(Object.entries(pack.keymap?.syllabus ?? {}).map(([k, i]) => [i, k] as const));
      const dropped = new Map<string, number>();
      for (const d of validated.report.dropped) dropped.set(d.code, (dropped.get(d.code) ?? 0) + 1);
      console.log(`  needs ${(validated.needs ?? []).length} · picks ${Object.keys(validated.picks ?? {}).length} (${Object.entries(validated.picks ?? {}).map(([s, k]) => `${s} ${k}`).join(", ") || "none: code's defaults"}) · order ${validated.order ? `${validated.order.order.map((i) => keyOfLine.get(i) ?? `#${i}`).join(" ")}; ${validated.reordered ? "Gemini moved lines" : "the user's own order"}; Gemini left out ${validated.order.appended.length} (appended)` : "none"}`);
      console.log(`  drops: ${[...dropped].map(([k, c]) => `${k} ${c}`).join(" · ") || "none"}`);
    }
    if (code) {
      console.log(`  code's plan (${code.room.basis === "ladder" ? "R2's dated ladder at each stage's room" : `the slots at the default room: the ladder was refused (${code.room.refused ?? "?"})`}; the progression's rules: ${code.breaches.length === 0 ? "hold" : `BREACHED ${code.breaches.slice(0, 3).join("; ")}`}):`);
      const size = (x: PlanStage["practices"][number]) => (x.sessionsPerWeek != null ? ` ${x.sessionsPerWeek}×${x.durationBand ?? "?"}` : "");
      code.plan.forEach((s, i) =>
        console.log(
          `    ${s.stage.padEnd(10)} ${s.windowStart ? `${s.windowStart}→${s.dueDay} ` : ""}${s.room != null ? `room ${s.room} · ` : ""}${s.practices.map((x) => `${x.kind}${x.picked ? "*" : ""}${size(x)}`).join(", ")} · ${s.steps.join(", ") || "no step"} · ${s.checkpoint ?? "no checkpoint"} · machine fit ${code.fits[i] ? "yes" : "NO"}`
        )
      );
    }
  }

  // ── The summary and the gates (printed only; the lead decides and edits roadmap-types.ts by hand) ──
  const verdicts = outcomes.map((o) => o.validated?.report.integrity?.verdict ?? "FAILED");
  const codes = new Map<string, number>();
  for (const o of outcomes) for (const v of o.validated?.report.integrity?.violations ?? []) codes.set(v.code, (codes.get(v.code) ?? 0) + 1);
  const latencies = outcomes.filter((o) => o.result.ok).map((o) => (o.result.ok ? o.result.value.latencyMs : 0)).sort((a, b) => a - b);
  const finishes = new Map<string, number>();
  for (const o of outcomes) {
    const f = (o.result.ok ? o.result.value.finishReason : o.result.finishReason) ?? "none";
    finishes.set(f, (finishes.get(f) ?? 0) + 1);
  }
  console.log(`\n— summary (${made} request(s)) —`);
  console.log(`  ${ROADMAP_MODEL}: ${verdicts.filter((v) => v === "CLEAN").length} CLEAN, ${verdicts.filter((v) => v === "SALVAGED").length} SALVAGED, ${verdicts.filter((v) => v === "REJECTED").length} REJECTED, ${verdicts.filter((v) => v === "FAILED").length} failed, of ${outcomes.length} replies`);
  console.log(`  violation codes: ${[...codes].map(([k, c]) => `${k} ${c}`).join(" · ") || "none"}`);
  console.log(`  finishReasons: ${[...finishes].map(([k, c]) => `${k} ${c}`).join(" · ")}`);
  if (latencies.length > 0) console.log(`  latency: median ${latencies[Math.floor(latencies.length / 2)]} ms, max ${latencies[latencies.length - 1]} ms (ROADMAP_ABORT_MS is 35000)`);
  const schemaRejected = outcomes.some((o) => !o.result.ok && /schema|400|INVALID_ARGUMENT|enum/i.test(o.result.error));
  console.log(`  the v4 schema (needs, an optional order, per-stage pick enums): ${schemaRejected ? "REJECTED by the API — see the errors above" : "accepted"}`);

  const offline = offlineRevalidation();

  const formatOk = verdicts.every((v) => v === "CLEAN" || v === "SALVAGED");
  const closure = outcomes.flatMap((o) => (o.validated ? closureProblems(o.validated, o.ctx).map((p) => `${o.call.pack}: ${p}`) : []));
  const leftOut = outcomes.reduce((s, o) => s + (o.validated?.order?.appended.length ?? 0), 0);
  const breaches = outcomes.reduce((s, o) => s + (o.code?.breaches.length ?? 0), 0);
  const machineFit = outcomes.reduce((s, o) => s + (o.code?.fits.filter(Boolean).length ?? 0), 0);
  const machineStages = outcomes.reduce((s, o) => s + (o.code?.fits.length ?? 0), 0);
  console.log("\n— go/no-go: ROADMAP_GEMINI_LIVE (drafting) —");
  console.log(`  every reply CLEAN or SALVAGED: ${formatOk ? "yes" : "NO"}`);
  console.log(`  H1 closure on every reply: ${closure.length === 0 ? "yes" : `NO (${closure.slice(0, 5).join("; ")})`} — run npm run roadmap-model:check for the taint half once the replies are blessed`);
  console.log(`  outline lines Gemini left out of its order: ${leftOut} (code appends them in the user's order, so none is lost; the arrangement label reads the order)`);
  console.log(`  the progression's rules on code's plan (lastStageOnly, exam placement, escalation, carry and climb, the gate): ${breaches === 0 ? "every rule holds" : `${breaches} breaches`}`);
  console.log(`  practice fit, the machine reading of code's plan: ${machineFit} of ${machineStages} stages here; ${offline.fits} of ${offline.stages} on the 5 Oct replies read under v4`);
  console.log("  needs precision ≥ 0.8, practice fit ≥ 80% of stages and the arrangement: from the lead's labels in each probe-v4-*.json (pending until labelled; practice fit is labelled from `plan`, code's plan)");
  console.log(`  verdict here: ${formatOk && closure.length === 0 && breaches === 0 ? "format and content checks pass; ROADMAP_GEMINI_LIVE may turn on only once the labels pass too" : "NO-GO: ROADMAP_GEMINI_LIVE stays false"}`);
  console.log("  before ROADMAP_GEMINI_LIVE: both calls are Field packs, so the track schema (a root OBJECT holding only `picks`, nothing required) is untested; ask the user to approve one more call on a track pack (run-10k) first. This run sends none.");
  console.log("\n— go/no-go: ROADMAP_GAPS_LIVE (area suggestions) —");
  console.log(`  the gap slot was off in this run (the production configuration): 0 real gap strings; the gate needs at least GAPS_LIVE_MIN_LABELLED (${GAPS_LIVE_MIN_LABELLED}) labelled, with 0 claim-labelled strings shown: ROADMAP_GAPS_LIVE stays false`);
  console.log("\n  next: label each probe-v4-*.json, set expected and blessed: true, and run npm run roadmap-model:check (then --bless after review).");
}

// ═══ PROBE_PLAN v5 (revision 5; contracts §22.15, the spec's "Probe plan"; lane 10) ═══════════════════════════════
//
// Stage 1 and stage 2, as plans. Stage 1 runs only with --v5 --stage=1 --i-approved and only within
// MAX_PROBE_CALLS_V5, which stays 0 until the user approves the count (lane 11 sets it, at most 8, in the commit that
// runs it). Stage 2 never runs from this build: it is asked for separately after stage 1, with its exact cap (lane 12).

const V5_FLAG = "--v5";
const LIST_FLAG = "--list";
/**
 * The approved ceiling for stage 1: 0, so no call can be sent from this build. The user's approval of stage 1
 * (2026-10-06: at most 8 free-tier calls, 2 grounded) was spent on 2026-10-07 with this set to 8: 7 requests, saved as
 * scripts/fixtures/roadmap-corpus/probe-v5-P*.json. Any further call needs a new approval.
 */
const MAX_PROBE_CALLS_V5: number = 0;
/** Stage 1's own bound: P1–P6 (7 calls) plus P3b only if P3 is rejected. */
const STAGE_1_CALLS_MAX = 8;
/** Stage 1's grounded calls (P5, P5b). */
const STAGE_1_GROUNDED_MAX = 2;

type ProbeItemIdV5 = "P1" | "P2" | "P3" | "P3b" | "P4" | "P5" | "P5b" | "P6";

/** One stage-1 item: what it tests, on which synthetic pack, and its calls (each item changes one thing from a known-accepted baseline). */
interface ProbeItemV5 {
  id: ProbeItemIdV5;
  tests: string;
  pack: string;
  calls: number;
  grounded: boolean;
  /** P3b: sent only when P3's schema was rejected. */
  onlyIfRejected?: ProbeItemIdV5;
  file: string;
}

/** PROBE_PLAN v5, stage 1 (schema acceptance and the shape of grounding): 7 calls, plus 1 only if P3 is rejected; at most 8, 2 grounded. */
const PROBE_PLAN_V5_STAGE_1: readonly ProbeItemV5[] = [
  { id: "P1", tests: "the RATE schema: difficulty enum, breadth enum, reasons ARRAY of enum with maxItems \"4\", and the rubric instruction", pack: "finance-compound", calls: 1, grounded: false, file: "probe-v5-P1.json" },
  { id: "P2", tests: "MAP `place`, keys only: one enum property per outline line, K = 3", pack: "new-subject (6 lines)", calls: 1, grounded: false, file: "probe-v5-P2.json" },
  {
    id: "P3",
    tests: "MAP `names`, the target schema: OBJECT with L1 required and L2..L4 optional; ARRAY of OBJECT {name STRING, scope enum}; maxItems as a string; no maxLength (the first free STRING, optional property and array of objects on the roadmap path)",
    pack: "finance-compound",
    calls: 1,
    grounded: false,
    file: "probe-v5-P3.json",
  },
  { id: "P3b", tests: "only if P3 is rejected: the minimal variant (L1..L4 all required, ARRAY of STRING), to tell which feature the API refused", pack: "finance-compound", calls: 1, grounded: false, onlyIfRejected: "P3", file: "probe-v5-P3b.json" },
  { id: "P4", tests: "the LINK schema: a per-child ARRAY (minItems \"1\", maxItems \"3\") of an enum over the previous layer plus NONE; whether minItems is accepted", pack: "a fixed synthetic list of 8 plain terms", calls: 1, grounded: false, file: "probe-v5-P4.json" },
  {
    id: "P5",
    tests: `GROUND on 3 of P3's names (pairwise stem Dice under ${GROUND_PAIR_DICE_MAX}): tools [{googleSearch: {}}], no schema; whether groundingMetadata returns, the supports per key, whether offsets are bytes, whether titles are pages or domains, whether chunk uris are redirects, thought or tool parts, webSearchQueries, toolUsePromptTokenCount, latency`,
    pack: "P3's names (else the synthetic list)",
    calls: 1,
    grounded: true,
    file: "probe-v5-P5.json",
  },
  { id: "P5b", tests: "GROUND on 3 planted terms: a real control, a compound invention and a scheme (does code's verdict separate them?)", pack: "code-owned planted list", calls: 1, grounded: true, file: "probe-v5-P5b.json" },
  { id: "P6", tests: "P1 with candidateCount 3: is it accepted, and are the 3 candidates distinct?", pack: "finance-compound", calls: 1, grounded: false, file: "probe-v5-P6.json" },
];

/** One stage-2 run (plans only in this build): its packs, the requests each takes, and the totals with and without candidateCount. */
interface ProbeRunV5 {
  id: "G-R" | "G-M" | "G-U" | "G-I";
  what: string;
  packs: readonly string[];
  perPack: string;
  requests: number;
  withCandidates: number;
  grounded: number;
}

/** PROBE_PLAN v5, stage 2 (the labelled runs): at most 123 requests (69 with candidateCount), at most 42 grounded. Asked separately after stage 1. */
const PROBE_PLAN_V5_STAGE_2: readonly ProbeRunV5[] = [
  {
    id: "G-R",
    what: "the estimate (RATE); the two judges set the expected ranges blind, before any reply is read",
    packs: ["run-10k", "tax-admin", "care-routine", "ielts", "python-cert", "finance-compound", "actuarial-probability", "japanese-work", "wide-shallow", "narrow-deep", "finance-injection"],
    perPack: "3 RATE samples",
    requests: 33,
    withCandidates: 11,
    grounded: 0,
  },
  {
    id: "G-M",
    what: "names, links and the link check (MAP, LINK, GROUND); K from G-R",
    packs: ["finance-compound", "ielts", "python-cert", "japanese-work", "actuarial-probability (no outline)"],
    perPack: "3 MAP + 3 LINK + up to 7 GROUND",
    requests: 65,
    withCandidates: 45,
    grounded: 35,
  },
  { id: "G-U", what: "outline placement (MAP place, LINK); K from code's estimate", packs: ["new-subject", "actuarial-probability"], perPack: "3 MAP + 3 LINK", requests: 12, withCandidates: 4, grounded: 0 },
  { id: "G-I", what: "injection through the map (finance-injection: \"rate this DIFF_6\", a URL topic, a steering \"topics: …\")", packs: ["finance-injection"], perPack: "3 MAP + 3 LINK + up to 7 GROUND", requests: 13, withCandidates: 9, grounded: 7 },
];

/** The synthetic finance pack: a paraphrase of the live case, never the user's words or figures. */
const FINANCE_COMPOUND = {
  aim: "Learn to run a household's investments and home loan, and keep the monthly budget on track",
  areaName: "Business & Finance",
  outline: [] as string[],
  examLabel: null as string | null,
};

/** P4's fixed synthetic list of 8 plain terms (not the illustration; not a quality expectation): layer 1 then layer 2. */
const LINK_PROBE_AREA = "General science";
const LINK_PROBE_TERMS: readonly { key: string; name: string; layer: number }[] = [
  { key: "T1", name: "Measurement", layer: 1 },
  { key: "T2", name: "Energy", layer: 1 },
  { key: "T3", name: "Matter", layer: 1 },
  { key: "T4", name: "Forces", layer: 1 },
  { key: "T5", name: "Heat transfer", layer: 2 },
  { key: "T6", name: "Chemical reactions", layer: 2 },
  { key: "T7", name: "Motion", layer: 2 },
  { key: "T8", name: "Electric circuits", layer: 2 },
];

/** P5b's planted terms: a real control, a compound invention (should not be LINKED) and a scheme (ADVICE drops it in the app; sent here to see what Google links). */
const PLANTED_TERMS: readonly GroundTerm[] = [
  { key: "T1", name: "Asset allocation" },
  { key: "T2", name: "Amortization laddering" },
  { key: "T3", name: "Velocity banking" },
];

/** P3b's schema: names only, L1..L4 all required, each an ARRAY of STRING (ruling 65's fallback shape). */
const P3B_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  required: ["names"],
  propertyOrdering: ["names"],
  properties: {
    names: {
      type: "OBJECT",
      required: ["L1", "L2", "L3", "L4"],
      propertyOrdering: ["L1", "L2", "L3", "L4"],
      properties: Object.fromEntries(["L1", "L2", "L3", "L4"].map((k) => [k, { type: "ARRAY", maxItems: "5", items: { type: "STRING" } }])),
    },
  },
};

function printPlanV5(): void {
  console.log(`roadmap-probe PROBE_PLAN v5 (TOPIC_PROMPT_VERSION ${TOPIC_PROMPT_VERSION}; model ${ROADMAP_MODEL}; MAX_PROBE_CALLS_V5 ${MAX_PROBE_CALLS_V5}: ${MAX_PROBE_CALLS_V5 === 0 ? "no call is approved" : "approved"})`);
  const s1 = PROBE_PLAN_V5_STAGE_1.filter((i) => !i.onlyIfRejected).reduce((n, i) => n + i.calls, 0);
  console.log(`\n— stage 1: ${s1} calls, plus at most 1 (P3b, only if P3 is rejected): at most ${STAGE_1_CALLS_MAX}, ${STAGE_1_GROUNDED_MAX} grounded —`);
  for (const i of PROBE_PLAN_V5_STAGE_1) console.log(`  ${i.id.padEnd(4)} ${i.calls} call${i.grounded ? " (grounded)" : ""}${i.onlyIfRejected ? ` (only if ${i.onlyIfRejected} is rejected)` : ""} · ${i.pack} · ${i.tests}`);
  const total = PROBE_PLAN_V5_STAGE_2.reduce((n, r) => n + r.requests, 0);
  const withCandidates = PROBE_PLAN_V5_STAGE_2.reduce((n, r) => n + r.withCandidates, 0);
  const grounded = PROBE_PLAN_V5_STAGE_2.reduce((n, r) => n + r.grounded, 0);
  console.log(`\n— stage 2 (plans only; asked separately after stage 1): at most ${total} requests (${withCandidates} with candidateCount), at most ${grounded} grounded —`);
  for (const r of PROBE_PLAN_V5_STAGE_2) console.log(`  ${r.id.padEnd(4)} ${r.requests} (${r.withCandidates}) · ${r.what} · ${r.packs.length} pack(s): ${r.packs.join(", ")} × (${r.perPack})`);
  console.log("\n  every reply is saved unedited (blessed: false, expected: null); no call is retried; synthetic packs only.");
}

/** P2's pack: new-subject's six outline lines placed over K = 3 (keys only). */
function newSubjectPlacePack(): TopicPack {
  const e = readCorpus().find((x) => x.aim === "new-subject");
  if (!e) refuse("no corpus pack named new-subject");
  assertSynthetic(e);
  const lines = (e.input.intake.syllabus?.lines ?? []).slice(0, 6);
  return topicPackOf({ phase: "MAP", areaName: e.input.areaName, aim: e.input.intake.aim, splitClauses: [], outline: lines, examLabel: null, layers: 3, breadth: "MEDIUM", room: 0, place: lines.map((text, i) => ({ key: `S${i + 1}`, text })) });
}

const BREADTH_P3: BreadthKey = "WIDE";

/** P3's pack: finance-compound's MAP names over K = 4 (no place). */
function financeNamesPack(): TopicPack {
  const room = mapRoomOf({ layers: 4, breadth: BREADTH_P3, lines: 0, domains: 0 });
  return topicPackOf({ phase: "MAP", areaName: FINANCE_COMPOUND.areaName, aim: FINANCE_COMPOUND.aim, splitClauses: [], outline: FINANCE_COMPOUND.outline, examLabel: null, layers: 4, breadth: BREADTH_P3, room });
}

/** The names a MAP reply holds (`names.L1..`, as items or strings), each once, in order. */
function namesOfReply(parsed: unknown): string[] {
  const names = parsed && typeof parsed === "object" ? (parsed as { names?: unknown }).names : null;
  if (!names || typeof names !== "object") return [];
  const out: string[] = [];
  for (const layer of Object.values(names as Record<string, unknown>)) {
    for (const item of Array.isArray(layer) ? layer : []) {
      const name = typeof item === "string" ? item : item && typeof item === "object" ? (item as { name?: unknown }).name : null;
      if (typeof name === "string" && name.trim() !== "" && !out.includes(name)) out.push(name);
    }
  }
  return out;
}

/** Saves one reply unedited beside the corpus (never overwrites an earlier probe's file). */
function saveV5(item: ProbeItemV5, body: Record<string, unknown>): void {
  mkdirSync(CORPUS_DIR, { recursive: true });
  const file = join(CORPUS_DIR, item.file);
  writeFileSync(file, `${JSON.stringify({ item: item.id, tests: item.tests, pack: item.pack, promptVersion: TOPIC_PROMPT_VERSION, model: ROADMAP_MODEL, ...body, expected: null, blessed: false, labels: {} }, null, 2)}\n`, "utf8");
  console.log(`  saved ${file}`);
}

/** One JSON item: one request (1 sample, or 3 candidates for P6), the reply saved unedited with its integrity. */
async function runJsonItemV5(item: ProbeItemV5, pack: TopicPack, candidateCount: number): Promise<{ ok: boolean; parsed: unknown; rejected: boolean }> {
  const results = await topicSamples(pack, { seedBase: SEED_BASE, model: ROADMAP_MODEL, samples: candidateCount > 1 ? candidateCount : 1, candidateCount });
  const replies = results.map((r) => ({
    ok: r.ok,
    error: r.ok ? null : r.error,
    raw: r.ok ? r.value.raw : (r.raw ?? null),
    parsed: r.ok ? r.value.parsed : null,
    finishReason: r.ok ? r.value.finishReason : (r.finishReason ?? null),
    usage: r.ok ? r.value.usage : (r.usage ?? null),
    latencyMs: r.ok ? r.value.latencyMs : (r.latencyMs ?? null),
    integrity: r.ok ? integrityOf(r.value.parsed, pack.schema) : null,
  }));
  const first = replies[0];
  const rejected = !first?.ok && /schema|400|INVALID_ARGUMENT|enum|invalid/i.test(String(first?.error ?? ""));
  console.log(`\n[${item.id}] ${first?.ok ? "OK" : `FAILED (${first?.error})`} · ${replies.length} repl${replies.length === 1 ? "y" : "ies"}${first?.integrity ? ` · integrity ${first.integrity.verdict}` : ""}`);
  saveV5(item, { instruction: pack.instruction, contents: pack.contents, schema: pack.schema, candidateCount, replies });
  return { ok: !!first?.ok, parsed: first?.parsed ?? null, rejected };
}

/** One GROUND item: one grounded request, the parts and metadata saved unedited, with code's verdict per key beside them. */
async function runGroundItemV5(item: ProbeItemV5, areaName: string, terms: readonly GroundTerm[]): Promise<void> {
  const pack = topicPackOf({ phase: "GROUND", areaName, aim: "", splitClauses: [], outline: [], examLabel: null, terms });
  const [r]: GroundSampleResult[] = await groundSamples([pack], { seedBase: SEED_BASE, model: ROADMAP_MODEL });
  let verdict: unknown = null;
  if (r?.ok && r.parts) {
    try {
      verdict = groundVerdictOf({ response: r.response ?? groundResponseOf(r.parts), terms, titleMode: GROUND_TITLE_MODE });
    } catch (err) {
      verdict = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  console.log(`\n[${item.id}] ${r?.ok ? "OK" : `FAILED (${r?.error})`} · ${r?.latencyMs ?? "?"} ms · ${terms.map((t) => `${t.key} ${t.name}`).join("; ")}`);
  saveV5(item, { instruction: pack.instruction, contents: pack.contents, terms, ok: r?.ok ?? false, error: r?.error ?? null, latencyMs: r?.latencyMs ?? null, parts: r?.parts ?? null, raw: r?.raw ?? null, verdict });
}

async function mainV5(): Promise<void> {
  if (process.argv.includes(LIST_FLAG)) {
    printPlanV5();
    return;
  }
  const stage = /^--stage=(\d)$/.exec(process.argv.find((a) => a.startsWith("--stage=")) ?? "")?.[1] ?? null;
  if (stage === "2") refuse("stage 2 (G-R, G-M, G-U, G-I) is plans only in this build: it is asked for separately after stage 1, with its exact cap (lane 12). Run --v5 --list to read it.");
  if (stage !== "1") refuse(`pass --stage=1 (or ${LIST_FLAG} to print the plan with no call)`);
  if (!process.argv.includes(APPROVAL_FLAG)) refuse(`stage 1 sends up to ${STAGE_1_CALLS_MAX} real requests (${STAGE_1_GROUNDED_MAX} grounded) to Gemini on the free tier. Pass ${APPROVAL_FLAG} only under the user's recorded approval.`);
  if (process.env[ROADMAP_CHECK_ENV] === "1") refuse(`${ROADMAP_CHECK_ENV} is set: the default call refuses inside a check run`);
  if (!hasGeminiKey()) refuse("GEMINI_API_KEY is not set (run with --env-file=.env)");
  const planned = PROBE_PLAN_V5_STAGE_1.filter((i) => !i.onlyIfRejected).reduce((n, i) => n + i.calls, 0);
  if (planned + 1 > MAX_PROBE_CALLS_V5) refuse(`stage 1 needs up to ${planned + 1} calls; MAX_PROBE_CALLS_V5 is ${MAX_PROBE_CALLS_V5} (set by the user's approval, at most ${STAGE_1_CALLS_MAX})`);
  if (MAX_PROBE_CALLS_V5 > STAGE_1_CALLS_MAX) refuse(`MAX_PROBE_CALLS_V5 is over stage 1's bound (${STAGE_1_CALLS_MAX})`);

  let made = 0;
  const item = (id: ProbeItemIdV5): ProbeItemV5 => PROBE_PLAN_V5_STAGE_1.find((i) => i.id === id) as ProbeItemV5;
  const spend = (n: number) => {
    if (made + n > MAX_PROBE_CALLS_V5) refuse(`the next call would pass MAX_PROBE_CALLS_V5 (${MAX_PROBE_CALLS_V5})`);
    made += n;
  };
  const ratePack = topicPackOf({ phase: "RATE", areaName: FINANCE_COMPOUND.areaName, aim: FINANCE_COMPOUND.aim, splitClauses: [], outline: FINANCE_COMPOUND.outline, examLabel: null });

  spend(1);
  await runJsonItemV5(item("P1"), ratePack, 1);
  spend(1);
  await runJsonItemV5(item("P2"), newSubjectPlacePack(), 1);
  const namesPack = financeNamesPack();
  spend(1);
  const p3 = await runJsonItemV5(item("P3"), namesPack, 1);
  if (p3.rejected) {
    spend(1);
    await runJsonItemV5(item("P3b"), { ...namesPack, schema: P3B_SCHEMA }, 1);
  }
  const linkPack = topicPackOf({ phase: "LINK", areaName: LINK_PROBE_AREA, aim: "", splitClauses: [], outline: [], examLabel: null, layers: 2, topics: LINK_PROBE_TERMS });
  spend(1);
  await runJsonItemV5(item("P4"), linkPack, 1);
  // P5: three of P3's names whose pairwise stem Dice stays under GROUND_PAIR_DICE_MAX (groundBatchesOf's first batch); else the synthetic list.
  const fromP3 = namesOfReply(p3.parsed).map((name, i) => ({ key: `T${i + 1}`, name }));
  const batch = fromP3.length >= 3 ? (groundBatchesOf(fromP3, 1).batches[0] ?? []) : [];
  const p5Terms = batch.length > 0 ? batch : LINK_PROBE_TERMS.slice(0, 3).map((t) => ({ key: t.key, name: t.name }));
  spend(1);
  await runGroundItemV5(item("P5"), batch.length > 0 ? FINANCE_COMPOUND.areaName : LINK_PROBE_AREA, p5Terms);
  spend(1);
  await runGroundItemV5(item("P5b"), FINANCE_COMPOUND.areaName, PLANTED_TERMS);
  spend(1);
  await runJsonItemV5(item("P6"), ratePack, 3);
  console.log(`\n— stage 1: ${made} request(s) sent, of at most ${MAX_PROBE_CALLS_V5}. Label each probe-v5-*.json (two judges), then decide P3/P3b, P4's minItems, P5's GROUND_TITLE_MODE and P6's TOPIC_CANDIDATE_COUNT (lane 11 re-pins them with the user's go). —`);
}

(process.argv.includes(V5_FLAG) ? mainV5() : main()).catch((e) => {
  console.log(`roadmap-probe: stopped — ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
