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
const PROBE_PLAN: readonly PlannedCall[] = [
  { pack: "actuarial-probability", gapsLive: false, thinkingLow: false, file: "probe-v4-actuarial-probability.json" },
  { pack: "new-subject", gapsLive: false, thinkingLow: false, file: "probe-v4-new-subject.json" },
];

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

main().catch((e) => {
  console.log(`roadmap-probe: stopped — ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
