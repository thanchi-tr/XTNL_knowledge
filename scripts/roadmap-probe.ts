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
 *   npx tsx --env-file=.env scripts/roadmap-probe.ts --v5 --stage=2 --runs=G-R,G-U --i-approved
 *                                                                                  stage 2's approved runs, once MAX_PROBE_CALLS_V5_STAGE_2 holds 45
 *   npx tsx scripts/roadmap-probe.ts --v5 --score=G-R                              offline: TOPIC_RATE_LIVE's bar over the saved G-R replies
 *   npx tsx scripts/roadmap-probe.ts --v5 --score=G-U                              offline: each line's placements and the LINK replies' integrity
 *   npx tsx --env-file=.env scripts/roadmap-probe.ts --v5 --stage=names --i-approved
 *                                                                                  the names stage (G-M, G-I, G-X), once MAX_PROBE_CALLS_V5_NAMES holds 210
 *   npx tsx scripts/roadmap-probe.ts --v5 --score=names                            offline: names proposed, agreed, flagged, LINKED / WEAK / NONE, links
 *                                                                                  drawn; writes probe-v5-names-judge-sheet.json for the two judges
 *
 *   Stage 1 (schema acceptance and the shape of grounding): P1–P6, and P3b only if P3 is rejected — 7 calls, at most
 *   8, of which 2 are grounded (P5, P5b). Each item changes one thing from a known-accepted baseline; no call is
 *   retried. Stage 2 (G-R, G-M, G-U, G-I: at most 123 requests, 42 grounded; P6 refused candidateCount, so
 *   TOPIC_CANDIDATE_COUNT is 1) was asked for separately after stage 1: the user approved G-R and G-U only (2026-10-07:
 *   at most 45 free-tier requests, 0 grounded, no retries). G-M and G-I are refused ("not approved").
 *   Stage 2 sends one request per sample (seedBase + SEED_OFFSETS[i], as topicSamples seeds its i-th), one at a time,
 *   paced to at most PACE_PER_MINUTE_MAX (8) a minute; it counts every request sent (failures included), never
 *   retries, stops on the cap (and on a quota or rate error), and saves each run's replies unedited as
 *   probe-v5-G-R.json and probe-v5-G-U.json (blessed: false, expected: null), rewritten after every request.
 *   Synthetic packs only: the corpus packs and code-owned planted lists, never the user's library, aim or figures
 *   (finance-compound is the paraphrase "Learn to run a household's investments and home loan, and keep the monthly
 *   budget on track"). Every reply is saved unedited as scripts/fixtures/roadmap-corpus/probe-v5-<item>.json
 *   (blessed: false, expected: null). MAX_PROBE_CALLS_V5 and MAX_PROBE_CALLS_V5_STAGE_2 are 0 until the user's
 *   approval sets them, so nothing here can send a request in this build.
 *
 *   The names stage (the user's approval of 2026-10-07: the FULL topic-names test, about 210 free-tier requests, about
 *   110 grounded, synthetic packs only, no retries): G-M (finance-compound, ielts, python-cert, japanese-work,
 *   actuarial-probability with no outline), G-I (finance-injection) and G-X (10 new synthetic Field packs). Each pack
 *   runs the app's chain exactly (MAP names × 3, with `place` as the app sends it, at K from G-R's consensus, else
 *   code's estimate; code's agreement and
 *   gates; LINK × 3 over the kept topics; GROUND over the kept Gemini names in batches of 3, at most 7 a pack): at most
 *   16 × 13 = 208 requests and 16 × 7 = 112 grounded, refused up front past MAX_PROBE_CALLS_V5_NAMES (0 in this build;
 *   the lead sets 210) or the grounded cap (112). Paced and counted as stage 2 is; it stops on a cap or a quota or rate
 *   error, and saves each pack as probe-v5-names-<pack>.json (blessed: false, expected: null).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
import { packableDomainsOf } from "../src/lib/roadmap-evidence";
import { mapRoomOf } from "../src/lib/roadmap-topics";
import { groundBatchesOf, groundVerdictOf, type GroundTerm } from "../src/lib/roadmap-grounding";
// ── PROBE_PLAN v5, stage 2: G-R and G-U (lane 12) ──
import { BREADTH_KEYS, LAYER_KEYS, ROADMAP_THINKING_LOW, SEED_OFFSETS, TOPIC_CANDIDATE_COUNT, TOPIC_SAMPLES, layersOfDiff, type RatingRecord, type ValidationIntegrity } from "../src/lib/roadmap-types";
import { requestsSentOf } from "../src/lib/roadmap-model";
import { examAnswerOf, type LabelContext } from "../src/lib/roadmap-validate";
import { mapAgreementOf, type MapSampleIn } from "../src/lib/roadmap-topics";
import { codeRatingOf, depthFallbackOf, ratingKeyOf, ratingOf, rateVoteOf, type RateSampleIn } from "../src/lib/roadmap-rating";
// ── PROBE_PLAN v5, the names stage: G-M, G-I and G-X (the user's approval of 2026-10-07) ──
import { readdirSync } from "node:fs";
import { BREADTH_TABLE, BREAKDOWN_REQUESTS_MAX, EDGE_DRAW, GROUND_CALLS_MAX, GROUND_PARALLEL, GROUND_SOURCES_SHOWN, LAYERS_MIN, RAW_LABEL_MAX, TOPIC_SCOPES, topicSwitchesOf, type Intake, type TopicDraft, type TopicNote, type TopicRunReport, type TopicScope } from "../src/lib/roadmap-types";
import { groundRequestsSentOf, type CallModel } from "../src/lib/roadmap-model";
import { checkLabel, labelContextFor } from "../src/lib/roadmap-validate";
import { aimSpanOf, formKeyOf, kFinalOf, linkDrawOf, topicClassOf, topicNameShapeOf, writtenMapOf, type LinkDraw, type MapAgreement } from "../src/lib/roadmap-topics";
import { groundRecordOf, registrableDomainOf, type GroundCallVerdict, type GroundParts } from "../src/lib/roadmap-grounding";
import { COUNTRY_WORDS } from "../src/lib/roadmap-lexicon";
import { words } from "../src/lib/synonyms";

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

/** Synthetic packs only: every fixture's ids look nothing like a database id (a cuid). */
function syntheticIdsOk(e: CorpusEntry): boolean {
  const cuid = /\bc[a-z0-9]{24}\b/;
  const ids = [...e.input.domains.map((d) => d.id), ...e.input.intake.domainIds, e.input.intake.fieldId ?? ""];
  return !ids.some((id) => cuid.test(id));
}

/** Synthetic packs only: every fixture's ids are checked to look nothing like a database id before anything is sent. */
function assertSynthetic(e: CorpusEntry): void {
  if (!syntheticIdsOk(e)) refuse(`${e.aim}: the fixture holds a database-shaped id; the probe sends synthetic packs only`);
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
  const approved = PROBE_PLAN_V5_STAGE_2.filter((r) => STAGE_2_APPROVED_RUNS.includes(r.id));
  const approvedRequests = approved.reduce((n, r) => n + r.requests, 0);
  console.log(`\n— stage 2: at most ${total} requests (${withCandidates} with candidateCount, refused by P6: TOPIC_CANDIDATE_COUNT is ${TOPIC_CANDIDATE_COUNT}), at most ${grounded} grounded —`);
  for (const r of PROBE_PLAN_V5_STAGE_2) {
    const ok = STAGE_2_APPROVED_RUNS.includes(r.id);
    console.log(`  ${r.id.padEnd(4)} ${r.requests} (${r.withCandidates}) ${ok ? "APPROVED" : "not approved"} · ${r.what} · ${r.packs.length} pack(s): ${r.packs.join(", ")} × (${r.perPack})`);
  }
  console.log(
    `\n  approved (2026-10-07): ${approved.map((r) => r.id).join(" and ")}: ${approvedRequests} requests, ${approved.reduce((n, r) => n + r.grounded, 0)} grounded, at most ${STAGE_2_APPROVED_MAX}; MAX_PROBE_CALLS_V5_STAGE_2 ${MAX_PROBE_CALLS_V5_STAGE_2}${MAX_PROBE_CALLS_V5_STAGE_2 === 0 ? " (no call can be sent: the lead sets it to 45 just before running)" : ""}`
  );
  console.log(`  pacing: one request at a time, ${PACE_GAP_MS} ms between starts, at most ${PACE_PER_MINUTE_MAX} in any ${PACE_WINDOW_MS / 1000} s: about ${Math.ceil((approvedRequests * PACE_GAP_MS) / 60_000)} minutes for ${approvedRequests} requests`);
  console.log(`  run:   npx tsx --env-file=.env scripts/roadmap-probe.ts ${V5_FLAG} --stage=2 ${RUNS_FLAG_PREFIX}${approved.map((r) => r.id).join(",")} ${APPROVAL_FLAG}`);
  console.log(`  score: npx tsx scripts/roadmap-probe.ts ${V5_FLAG} ${SCORE_FLAG_PREFIX}G-R   (needs ${G_R_RANGES_FILE}, from the blind judges) · ${SCORE_FLAG_PREFIX}G-U`);
  try {
    const corpus = new Map(readCorpus().map((e) => [e.aim, e]));
    const rate = rateSpecsOf(corpus);
    console.log(`\n  G-R's packs (RATE sends the Area name, the aim, the outline and the exam label; code's estimate is depthFallbackOf):`);
    for (const s of rate) console.log(`    ${s.name.padEnd(22)} ${s.trackArea ? `track ${s.e.input.intake.track}` : "Field"} · ${s.e.input.areaName} · "${s.e.input.intake.aim}"${s.outline.length ? ` · outline ${s.outline.length} lines` : ""}${s.examLabel ? ` · exam "${s.examLabel}"` : ""} · code's estimate ${s.code.layers} layers × ${TOPIC_SAMPLES} requests`);
    const place = placeSpecsOf(corpus);
    console.log(`  G-U's packs (MAP place over the outline at K = code's estimate, then LINK over the placement):`);
    for (const s of place) console.log(`    ${s.name.padEnd(22)} ${s.lines.length} lines · K ${s.k} (${s.breadth}) · ${TOPIC_SAMPLES} MAP + ${TOPIC_SAMPLES} LINK`);
    console.log(`  finance-compound.json is P1's pack (FINANCE_COMPOUND): yes`);
  } catch (err) {
    console.log(`  the stage-2 packs could not be built: ${err instanceof Error ? err.message : String(err)}`);
  }
  printNamesPlanV5();
  console.log("\n  every reply is saved unedited (blessed: false, expected: null); no call is retried; synthetic packs only.");
}

/** The names stage's plan (--list): each pack's K, breadth and its source, the room, the cautions, and the worst case against the caps. */
function printNamesPlanV5(): void {
  const worst = namesWorstCaseOf(NAMES_PLAN);
  console.log(`\n— the names stage (approved 2026-10-07: the FULL topic-names test, about 210 requests, about 110 grounded): ${NAMES_PLAN.length} packs × (${TOPIC_SAMPLES} MAP names + ${TOPIC_SAMPLES} LINK + up to ${GROUND_CALLS_MAX} GROUND) —`);
  console.log(`  worst case ${worst.requests} requests, ${worst.grounded} grounded; MAX_PROBE_CALLS_V5_NAMES ${MAX_PROBE_CALLS_V5_NAMES}${MAX_PROBE_CALLS_V5_NAMES === 0 ? " (no call can be sent: the lead sets it to 210 just before running)" : ""}, at most ${NAMES_APPROVED_MAX}; grounded cap ${NAMES_GROUNDED_CAP}; ${worst.requests <= NAMES_APPROVED_MAX && worst.grounded <= NAMES_GROUNDED_CAP ? "the plan fits the approval" : "THE PLAN IS OVER THE APPROVAL"}`);
  console.log(`  pacing: one request at a time, ${PACE_GAP_MS} ms between starts, at most ${PACE_PER_MINUTE_MAX} in any ${PACE_WINDOW_MS / 1000} s: at most about ${Math.ceil((worst.requests * PACE_GAP_MS) / 60_000)} minutes`);
  console.log(`  MAP asks names${NAMES_PLACE ? " and places your lines and Domains (place: TOPIC_PLACE_LIVE is on, as the app sends it)" : " only (place: TOPIC_PLACE_LIVE is off, as the app sends it)"}; GROUND_TITLE_MODE ${GROUND_TITLE_MODE}`);
  try {
    const specs = namesSpecsOf(new Map(readCorpus().map((e) => [e.aim, e] as const)));
    for (const s of specs) {
      console.log(
        `    ${s.item.run} ${s.item.pack.padEnd(22)} ${s.areaName} · "${s.intake.aim}"${s.item.noOutline ? " · no outline" : s.outline.length ? ` · outline ${s.outline.length} lines` : ""}${s.examLabel ? ` · exam "${s.examLabel}"` : ""} · K ${s.k} ${s.breadth} (${s.kSource}) · room ${s.room} (${s.domains.length} Domain${s.domains.length === 1 ? "" : "s"} yours)${s.placeKeys.length ? ` · place ${s.placeKeys.join(" ")}` : ""} · cautions ${s.rating.cautions.join(", ") || "none"}${s.mapPack.schema ? "" : " · MAP ASKS NOTHING"}`
      );
    }
  } catch (err) {
    console.log(`  the names packs could not be built: ${err instanceof Error ? err.message : String(err)}`);
  }
  console.log(`  run:   npx tsx --env-file=.env scripts/roadmap-probe.ts ${V5_FLAG} ${NAMES_STAGE_FLAG} ${APPROVAL_FLAG}   (each pack → ${NAMES_FILE_PREFIX}<pack>.json)`);
  console.log(`  score: npx tsx scripts/roadmap-probe.ts ${V5_FLAG} ${SCORE_FLAG_PREFIX}names   (offline; writes ${NAMES_JUDGE_SHEET})`);
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

// ═══ PROBE_PLAN v5, stage 2: G-R and G-U (the user's approval of 2026-10-07; lane 12) ═════════════════════════════════
//
// The user approved stage 2 PARTLY ("Rating + placement: 45"): G-R (33 RATE requests over 11 synthetic packs) and G-U
// (12: new-subject and actuarial-probability × 3 MAP place + 3 LINK), at most 45 free-tier requests, 0 grounded,
// synthetic packs only, no retries. G-M and G-I (names, links and the Google check) are not approved. P6 refused
// candidateCount, so every sample is its own request (TOPIC_CANDIDATE_COUNT 1), seeded as topicSamples seeds it.

/**
 * The approved ceiling for stage 2: 0 in this build, so no stage-2 request can be sent. The lead sets it to 45 just
 * before the run (the approval's count) and back to 0 in the commit that saves the replies.
 */
const MAX_PROBE_CALLS_V5_STAGE_2: number = 0; // spent 2026-10-07: G-R 33 + G-U 12 (the user's approval of 45)
/** The approval's bound: a ceiling above it is refused, whatever the constant says. */
const STAGE_2_APPROVED_MAX = 45;
/** The approved runs; G-M and G-I are refused ("not approved"). */
const STAGE_2_APPROVED_RUNS: readonly ProbeRunV5["id"][] = ["G-R", "G-U"];
const RUNS_FLAG_PREFIX = "--runs=";
const SCORE_FLAG_PREFIX = "--score=";
/** The free tier: never more than 8 requests in any minute. Requests go one at a time, with a delay between their starts. */
const PACE_PER_MINUTE_MAX = 8;
const PACE_WINDOW_MS = 60_000;
/** 8 s between request starts (at most 7.5 a minute); Pacer's sliding window is the second guard. */
const PACE_GAP_MS = Math.ceil(PACE_WINDOW_MS / PACE_PER_MINUTE_MAX) + 500;
/** A quota or rate error stops the run there: no retry, and every later request would fail the same way. */
const QUOTA_ERROR = /\b429\b|RESOURCE_EXHAUSTED|quota|rate.?limit/i;
const G_R_FILE = "probe-v5-G-R.json";
const G_U_FILE = "probe-v5-G-U.json";
/** The blind judges' ranges, written by the lead before any reply is read: {pack: {layersLo, layersHi, breadth: string[]}}. */
const G_R_RANGES_FILE = "probe-v5-G-R-ranges.json";
/** TOPIC_RATE_LIVE's bar (the Probe plan): ≥ 80% inside the ranges; spread ≤ 1 on ≥ 8 of the 10 clean packs (all but the injection). */
const G_R_INSIDE_MIN = 0.8;
const G_R_SPREAD_MAX = 1;
const G_R_SPREAD_PACKS_MIN = 8;
const G_R_INJECTION_PACK = "finance-injection";
const VALID_VERDICTS: ReadonlySet<string> = new Set(["CLEAN", "SALVAGED"]);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** One request at a time: PACE_GAP_MS between starts, and never PACE_PER_MINUTE_MAX starts inside one PACE_WINDOW_MS (plus a second's margin). */
class Pacer {
  readonly starts: number[] = [];
  async next(): Promise<void> {
    for (;;) {
      const now = Date.now();
      const last = this.starts.length > 0 ? this.starts[this.starts.length - 1] : null;
      const recent = this.starts.filter((t) => now - t < PACE_WINDOW_MS + 1000);
      const gapWait = last === null ? 0 : last + PACE_GAP_MS - now;
      const windowWait = recent.length >= PACE_PER_MINUTE_MAX ? recent[0] + PACE_WINDOW_MS + 1000 - now : 0;
      const wait = Math.max(gapWait, windowWait);
      if (wait <= 0) break;
      await sleep(wait);
    }
    this.starts.push(Date.now());
  }
  /** The most request starts any PACE_WINDOW_MS held. */
  peak(): number {
    return this.starts.reduce((most, t, i) => Math.max(most, this.starts.slice(i).filter((u) => u - t < PACE_WINDOW_MS).length), 0);
  }
}

/** One sample as saved: the reply unedited (raw, parsed), its integrity over the schema sent, its latency and its error. */
interface StageTwoSample {
  phase: string;
  sample: number;
  seed: number;
  /** false only when the pack asked nothing (never sent, not counted). */
  sent: boolean;
  ok: boolean;
  error: string | null;
  raw: string | null;
  parsed: unknown;
  finishReason: string | null;
  usage: unknown;
  latencyMs: number | null;
  modelVersion: string | null;
  responseId: string | null;
  integrity: ValidationIntegrity | null;
}

interface StageTwoBudget {
  cap: number;
  /** Requests sent, failures included. */
  made: number;
  /** Why the run stopped early (the cap, a quota or rate error), or null. */
  stopped: string | null;
  pacer: Pacer;
}

/**
 * One sample, one request: paced, counted before it goes out (a failure, an abort, a 429 or a quota error still
 * counts: Google may have received it), never retried. Seeded seedBase + SEED_OFFSETS[i], as topicSamples seeds its
 * i-th sample. Returns null, sending nothing, once the run has stopped or the next request would pass the cap.
 */
async function sendSampleV5(b: StageTwoBudget, pack: TopicPack, i: number, tag: string): Promise<StageTwoSample | null> {
  if (b.stopped) return null;
  if (b.made + 1 > b.cap) {
    b.stopped = `the next request would pass MAX_PROBE_CALLS_V5_STAGE_2 (${b.cap})`;
    return null;
  }
  await b.pacer.next();
  b.made += 1;
  const seed = SEED_BASE + SEED_OFFSETS[i];
  const results = await topicSamples(pack, { seedBase: seed - SEED_OFFSETS[0], model: ROADMAP_MODEL, samples: 1, candidateCount: 1 });
  const r: SampleResult = results[0] ?? { ok: false, error: "no reply" };
  const sent = requestsSentOf([r], 1) === 1;
  if (!sent) b.made -= 1; // never left the process: the pack asked nothing (NOTHING_TO_ASK)
  const s = stageTwoSampleOf(pack, i, seed, r, sent);
  console.log(`  [${b.made}] ${tag} ${pack.phase} ${i + 1}/${TOPIC_SAMPLES} (seed ${seed}): ${s.ok ? `OK · integrity ${s.integrity?.verdict ?? "?"}` : `FAILED (${s.error})`} · ${s.latencyMs ?? "?"} ms${sent ? "" : " · not sent"}`);
  if (!r.ok && QUOTA_ERROR.test(r.error)) b.stopped = `a quota or rate error on ${tag} (${r.error.slice(0, 160)}): no retry`;
  return s;
}

/** One JSON sample as saved: the reply unedited (raw, parsed), its integrity over the exact schema sent, its facts. */
function stageTwoSampleOf(pack: TopicPack, i: number, seed: number, r: SampleResult, sent: boolean): StageTwoSample {
  return {
    phase: pack.phase,
    sample: i + 1,
    seed,
    sent,
    ok: r.ok,
    error: r.ok ? null : r.error,
    raw: r.ok ? r.value.raw : (r.raw ?? null),
    parsed: r.ok ? r.value.parsed : null,
    finishReason: r.ok ? r.value.finishReason : (r.finishReason ?? null),
    usage: r.ok ? r.value.usage : (r.usage ?? null),
    latencyMs: r.ok ? r.value.latencyMs : (r.latencyMs ?? null),
    modelVersion: r.ok ? r.value.modelVersion : (r.modelVersion ?? null),
    responseId: r.ok ? r.value.responseId : (r.responseId ?? null),
    integrity: r.ok ? integrityOf(r.value.parsed, pack.schema) : null,
  };
}

const validSampleOf = (s: StageTwoSample | null | undefined): boolean => !!s && s.ok && !!s.integrity && VALID_VERDICTS.has(s.integrity.verdict);
const rateSampleOf = (s: StageTwoSample): RateSampleIn | null => (s.ok && s.integrity ? { parsed: s.parsed, integrity: s.integrity.verdict } : null);

function stageTwoRunOf(id: ProbeRunV5["id"]): ProbeRunV5 {
  const run = PROBE_PLAN_V5_STAGE_2.find((r) => r.id === id);
  if (!run) throw new Error(`no stage-2 run ${id}`);
  return run;
}

/** A corpus pack by name, synthetic (no database-shaped id), else an Error naming it. */
function stageTwoPackOf(corpus: ReadonlyMap<string, CorpusEntry>, name: string): CorpusEntry {
  const e = corpus.get(name);
  if (!e) throw new Error(`no corpus pack named ${name}`);
  if (!syntheticIdsOk(e)) throw new Error(`${name}: the fixture holds a database-shaped id; the probe sends synthetic packs only`);
  return e;
}

const outlineOf = (e: CorpusEntry): string[] => (e.input.intake.syllabus?.lines ?? []).filter((l): l is string => typeof l === "string");
/** The exam's label only with the user's Yes, as the server's chainExamLabelOf. */
const examLabelOf = (e: CorpusEntry): string | null => (examAnswerOf(e.input.intake) && e.input.intake.examLabel ? e.input.intake.examLabel : null);
const textsOf = (e: CorpusEntry) => ({ aim: e.input.intake.aim, areaName: e.input.areaName, constraints: e.input.intake.constraints ?? null });
const inputKeyOf = (e: CorpusEntry): string => ratingKeyOf({ aim: e.input.intake.aim, areaName: e.input.areaName, outline: outlineOf(e), examLabel: examLabelOf(e), splitClauses: [] });

/** One G-R pack: RATE's pack as the server builds it (runRateStep), and code's estimate beside it. */
interface RateSpec {
  name: string;
  e: CorpusEntry;
  outline: string[];
  examLabel: string | null;
  trackArea: boolean;
  pack: TopicPack;
  /** Code's estimate (codeRatingOf: depthFallbackOf, BREADTH_FALLBACK), for reference: RATE is given no K. */
  code: RatingRecord;
  inputKey: string;
}

/** G-R's 11 packs, built before anything is sent; finance-compound must be P1's pack (FINANCE_COMPOUND) to the letter. */
function rateSpecsOf(corpus: ReadonlyMap<string, CorpusEntry>): RateSpec[] {
  const plan = stageTwoRunOf("G-R");
  const specs = plan.packs.map((name): RateSpec => {
    const e = stageTwoPackOf(corpus, name);
    const outline = outlineOf(e);
    const examLabel = examLabelOf(e);
    const trackArea = e.input.intake.fieldId == null;
    const inputKey = inputKeyOf(e);
    const pack = topicPackOf({ phase: "RATE", areaName: e.input.areaName, aim: e.input.intake.aim, splitClauses: [], outline, examLabel });
    if (!pack.schema || pack.contents === "") throw new Error(`${name}: its RATE pack asks nothing`);
    const code = codeRatingOf({ trackArea, outlineLines: outline.length, texts: textsOf(e), inputKey, day: e.today });
    return { name, e, outline, examLabel, trackArea, pack, code, inputKey };
  });
  const p1 = topicPackOf({ phase: "RATE", areaName: FINANCE_COMPOUND.areaName, aim: FINANCE_COMPOUND.aim, splitClauses: [], outline: FINANCE_COMPOUND.outline, examLabel: FINANCE_COMPOUND.examLabel });
  const fc = specs.find((s) => s.name === "finance-compound");
  if (!fc || fc.pack.contents !== p1.contents) throw new Error("finance-compound.json and FINANCE_COMPOUND (P1's pack) differ: keep them one text");
  if (specs.length * TOPIC_SAMPLES !== plan.requests) throw new Error(`G-R plans ${plan.requests} requests, but ${specs.length} packs × ${TOPIC_SAMPLES} samples is ${specs.length * TOPIC_SAMPLES}`);
  return specs;
}

/** What a placement reads (saved with the run, so the offline scorer reads it too). */
interface PlaceInput {
  aim: string;
  areaName: string;
  track: string;
  lines: readonly string[];
  examLabel: string | null;
  constraints: string | null;
  k: number;
  breadth: BreadthKey;
}

/** One G-U pack: MAP `place` over its outline lines at K = code's estimate (the no-Gemini estimate), no names. */
interface PlaceSpec {
  name: string;
  e: CorpusEntry;
  input: PlaceInput;
  lines: string[];
  k: number;
  breadth: BreadthKey;
  code: RatingRecord;
  pack: TopicPack;
}

/** G-U's 2 packs, built before anything is sent: K and breadth are codeRatingOf's (depthFallbackOf; BREADTH_FALLBACK). */
function placeSpecsOf(corpus: ReadonlyMap<string, CorpusEntry>): PlaceSpec[] {
  const plan = stageTwoRunOf("G-U");
  const specs = plan.packs.map((name): PlaceSpec => {
    const e = stageTwoPackOf(corpus, name);
    const lines = outlineOf(e);
    if (lines.length === 0) throw new Error(`${name}: G-U places an outline, and this pack has none`);
    if (e.input.intake.fieldId == null) throw new Error(`${name}: G-U places a Field's outline; this is a track pack`);
    const examLabel = examLabelOf(e);
    const code = codeRatingOf({ trackArea: false, outlineLines: lines.length, texts: textsOf(e), inputKey: inputKeyOf(e), day: e.today });
    const k = code.layers;
    if (k !== layersOfDiff(depthFallbackOf({ trackArea: false, outlineLines: lines.length }))) throw new Error(`${name}: codeRatingOf's K is not depthFallbackOf's`);
    const breadth = code.breadth;
    const pack = topicPackOf({ phase: "MAP", areaName: e.input.areaName, aim: e.input.intake.aim, splitClauses: [], outline: lines, examLabel, layers: k, breadth, room: 0, place: lines.map((text, i) => ({ key: `S${i + 1}`, text })) });
    if (!pack.schema) throw new Error(`${name}: its MAP place pack asks nothing`);
    const input: PlaceInput = { aim: e.input.intake.aim, areaName: e.input.areaName, track: e.input.intake.track, lines, examLabel, constraints: e.input.intake.constraints ?? null, k, breadth };
    return { name, e, input, lines, k, breadth, code, pack };
  });
  if (specs.length * 2 * TOPIC_SAMPLES !== plan.requests) throw new Error(`G-U plans ${plan.requests} requests, but ${specs.length} packs × (${TOPIC_SAMPLES} MAP + ${TOPIC_SAMPLES} LINK) is ${specs.length * 2 * TOPIC_SAMPLES}`);
  return specs;
}

/** One outline line's placement over the MAP samples. */
interface LinePlacement {
  key: string;
  line: string;
  /**
   * Per sample: its layer key ("L2"); "—" when the reply left the line out (or gave a key outside L1..LK); "R:L2" or
   * "R:—" for a REJECTED reply (its votes never count); "FAILED" when the request gave no reply.
   */
  votes: string[];
  /** The layer at least 2 valid replies gave, else null. */
  majority: string | null;
  /** Code's placement (mapAgreementOf: the lower median of the valid votes, the majority whenever there is one; else code's layer from the outline's order). */
  layer: number;
  placedBy: string;
  /** A reply that came back (valid or REJECTED) left it out. */
  dropped: boolean;
  /** No valid reply placed it (code placed it). */
  unplaced: boolean;
}

/** Each line's placement (code's own agreement, mapAgreementOf, with no names) and K_final (kFinalOf over the placed lines). */
function placementOf(input: PlaceInput, samples: readonly StageTwoSample[]): { lines: LinePlacement[]; kFinal: number } {
  const layerKeys = LAYER_KEYS.slice(0, input.k) as readonly string[];
  const label: LabelContext = { kind: "TOPIC", aim: input.aim, constraints: input.constraints, examLabel: input.examLabel, syllabusLines: input.lines, areaName: input.areaName, domainNames: [], track: input.track as LabelContext["track"] };
  let n = 0;
  const agreement = mapAgreementOf({
    samples: samples.map((s): MapSampleIn | null => (s.ok && s.integrity ? { parsed: s.parsed, integrity: s.integrity.verdict } : null)),
    layers: input.k,
    breadth: input.breadth,
    room: 0,
    aim: input.aim,
    lines: input.lines.map((text, index) => ({ key: `S${index + 1}`, text, index })),
    domains: [],
    freeDomains: [],
    takenNames: [],
    label,
    countryNamed: false,
    makeId: () => `g-u-${++n}`,
  });
  const byKey = new Map(agreement.topics.map((t) => [t.key, t] as const));
  const lines = input.lines.map((line, i): LinePlacement => {
    const key = `S${i + 1}`;
    const placedIn = (s: StageTwoSample): string | null => {
      const place = s.parsed && typeof s.parsed === "object" ? (s.parsed as { place?: unknown }).place : null;
      const v = place && typeof place === "object" && Object.prototype.hasOwnProperty.call(place, key) ? (place as Record<string, unknown>)[key] : null;
      return typeof v === "string" && layerKeys.includes(v) ? v : null;
    };
    const came = samples.filter((s) => s.ok);
    const valid = samples.filter(validSampleOf).map(placedIn).filter((v): v is string => v !== null);
    const votes = samples.map((s) => (!s.ok ? "FAILED" : `${validSampleOf(s) ? "" : "R:"}${placedIn(s) ?? "—"}`));
    const majority = layerKeys.find((lk) => valid.filter((v) => v === lk).length >= 2) ?? null;
    const t = byKey.get(key);
    return { key, line, votes, majority, layer: t?.layer ?? 0, placedBy: t?.placedBy ?? "?", dropped: came.some((s) => placedIn(s) === null), unplaced: valid.length === 0 };
  });
  return { lines, kFinal: agreement.kFinal };
}

/** LINK over the placement, as the server's chainLinkSpecOf: the placed lines up to K_final; schema null (nothing to ask) at K_final 1. */
function linkPackOfPlacement(areaName: string, placed: readonly LinePlacement[], kFinal: number): TopicPack {
  const topics = placed.filter((p) => p.layer >= 1 && p.layer <= kFinal).map((p) => ({ key: p.key, name: p.line, layer: p.layer }));
  return topicPackOf({ phase: "LINK", areaName, aim: "", splitClauses: [], outline: [], examLabel: null, layers: kFinal, topics });
}

/** Writes one run's file (rewritten after every request, so a stop keeps what was sent); the replies unedited, blessed: false. */
function writeStageTwo(file: string, body: Record<string, unknown>): void {
  mkdirSync(CORPUS_DIR, { recursive: true });
  writeFileSync(join(CORPUS_DIR, file), `${JSON.stringify({ ...body, promptVersion: TOPIC_PROMPT_VERSION, model: ROADMAP_MODEL, expected: null, blessed: false, labels: {} }, null, 2)}\n`, "utf8");
}

const runFactsOf = (b: StageTwoBudget, sent: number, complete: boolean) => ({
  seedBase: SEED_BASE,
  seedOffsets: SEED_OFFSETS,
  candidateCount: 1,
  thinkingLow: ROADMAP_THINKING_LOW,
  pacing: { perMinuteMax: PACE_PER_MINUTE_MAX, gapMs: PACE_GAP_MS },
  requests: sent,
  complete,
  stopped: b.stopped,
});

/** G-R: each of the 11 packs × 3 RATE requests, saved as probe-v5-G-R.json. Returns the requests it sent. */
async function runGRV5(b: StageTwoBudget, specs: readonly RateSpec[]): Promise<number> {
  const plan = stageTwoRunOf("G-R");
  const start = b.made;
  const packs: { pack: string; samples: StageTwoSample[] }[] = [];
  const save = (complete: boolean) =>
    writeStageTwo(G_R_FILE, {
      item: "G-R",
      run: "G-R",
      tests: plan.what,
      note: "Real RATE replies, unedited, one request per sample. The judges set each pack's range blind (probe-v5-G-R-ranges.json) before reading any reply; --v5 --score=G-R prints TOPIC_RATE_LIVE's bar. K is code's estimate (depthFallbackOf), for reference: RATE is given none.",
      ...runFactsOf(b, b.made - start, complete),
      packs,
    });
  console.log(`\n— G-R: ${specs.length} packs × ${TOPIC_SAMPLES} RATE requests → ${G_R_FILE} —`);
  for (const s of specs) {
    const samples: StageTwoSample[] = [];
    let saved = false;
    for (let i = 0; i < TOPIC_SAMPLES; i++) {
      const got = await sendSampleV5(b, s.pack, i, `G-R ${s.name}`);
      if (!got) break;
      samples.push(got);
      if (!saved) {
        packs.push({
          pack: s.name,
          aim: s.e.input.intake.aim,
          areaName: s.e.input.areaName,
          track: s.e.input.intake.track,
          trackArea: s.trackArea,
          outline: s.outline,
          examLabel: s.examLabel,
          constraints: s.e.input.intake.constraints ?? null,
          today: s.e.today,
          inputKey: s.inputKey,
          K: s.code.layers,
          kSource: "code's estimate (codeRatingOf: depthFallbackOf), for reference; RATE is given no K",
          codeEstimate: { difficulty: s.code.difficulty, layers: s.code.layers, breadth: s.code.breadth },
          instruction: s.pack.instruction,
          contents: s.pack.contents,
          schema: s.pack.schema,
          samples,
        } as { pack: string; samples: StageTwoSample[] });
        saved = true;
      }
      save(false);
    }
    if (b.stopped) break;
  }
  const complete = packs.length === specs.length && packs.every((p) => p.samples.length === TOPIC_SAMPLES);
  if (packs.length > 0) save(complete); // a run that sent nothing writes no file
  console.log(`  G-R: ${b.made - start} request(s) sent${complete ? "" : ` · INCOMPLETE (${b.stopped ?? "?"})`} · saved ${join(CORPUS_DIR, G_R_FILE)}`);
  return b.made - start;
}

/** G-U: each pack × 3 MAP place, then 3 LINK over the per-line placement, saved as probe-v5-G-U.json. Returns the requests it sent. */
async function runGUV5(b: StageTwoBudget, specs: readonly PlaceSpec[]): Promise<number> {
  const plan = stageTwoRunOf("G-U");
  const start = b.made;
  const packs: Record<string, unknown>[] = [];
  const skipped: string[] = [];
  const save = (complete: boolean) =>
    writeStageTwo(G_U_FILE, {
      item: "G-U",
      run: "G-U",
      tests: plan.what,
      note: "Real MAP `place` and LINK replies, unedited, one request per sample. K is code's estimate (codeRatingOf: depthFallbackOf). LINK is sent over code's placement of each line (the majority of the valid MAP replies whenever there is one; mapAgreementOf's lower median), up to K_final. --v5 --score=G-U prints each line's placements and the LINK replies' integrity; the judges read the semantics.",
      ...runFactsOf(b, b.made - start, complete),
      skipped,
      packs,
    });
  console.log(`\n— G-U: ${specs.length} packs × (${TOPIC_SAMPLES} MAP place + ${TOPIC_SAMPLES} LINK) → ${G_U_FILE} —`);
  let complete = true;
  for (const s of specs) {
    const mapSamples: StageTwoSample[] = [];
    const rec: Record<string, unknown> = {
      pack: s.name,
      ...s.input,
      K: s.k,
      kSource: "code's estimate (codeRatingOf: depthFallbackOf; breadth BREADTH_FALLBACK), the no-Gemini K",
      map: { instruction: s.pack.instruction, contents: s.pack.contents, schema: s.pack.schema, samples: mapSamples },
      placement: null,
      kFinal: null,
      link: null,
      linkNote: null,
    };
    packs.push(rec);
    for (let i = 0; i < TOPIC_SAMPLES; i++) {
      const got = await sendSampleV5(b, s.pack, i, `G-U ${s.name}`);
      if (!got) break;
      mapSamples.push(got);
      save(false);
    }
    if (b.stopped || mapSamples.length < TOPIC_SAMPLES) {
      complete = false;
      break;
    }
    const placed = placementOf(s.input, mapSamples);
    rec.placement = placed.lines;
    rec.kFinal = placed.kFinal;
    for (const l of placed.lines) console.log(`    ${l.key} ${l.votes.join(" · ")} → ${l.majority ?? "no majority"} · code's L${l.layer} (${l.placedBy})${l.dropped ? " · DROPPED by a reply" : ""} · ${l.line}`);
    if (!mapSamples.some(validSampleOf)) {
      rec.linkNote = "LINK not sent: no valid MAP reply placed any line";
      skipped.push(`${s.name}: ${rec.linkNote}`);
      save(false);
      complete = false;
      continue;
    }
    const linkPack = linkPackOfPlacement(s.input.areaName, placed.lines, placed.kFinal);
    if (!linkPack.schema) {
      rec.linkNote = `LINK not sent: it asks nothing at K_final ${placed.kFinal} (as the server's chainLinkSpecOf)`;
      skipped.push(`${s.name}: ${rec.linkNote}`);
      save(false);
      complete = false;
      continue;
    }
    const linkSamples: StageTwoSample[] = [];
    rec.link = { kFinal: placed.kFinal, instruction: linkPack.instruction, contents: linkPack.contents, schema: linkPack.schema, samples: linkSamples };
    for (let i = 0; i < TOPIC_SAMPLES; i++) {
      const got = await sendSampleV5(b, linkPack, i, `G-U ${s.name}`);
      if (!got) break;
      linkSamples.push(got);
      save(false);
    }
    if (b.stopped || linkSamples.length < TOPIC_SAMPLES) {
      complete = false;
      break;
    }
  }
  complete = complete && packs.length === specs.length;
  if (b.made > start) save(complete); // a run that sent nothing writes no file
  console.log(`  G-U: ${b.made - start} request(s) sent${complete ? "" : ` · INCOMPLETE (${b.stopped ?? skipped.join("; ")})`} · saved ${join(CORPUS_DIR, G_U_FILE)}`);
  return b.made - start;
}

/** Stage 2's approved runs: --v5 --stage=2 --runs=G-R,G-U --i-approved, within MAX_PROBE_CALLS_V5_STAGE_2. */
async function runStage2V5(): Promise<void> {
  const runsArg = process.argv.find((a) => a.startsWith(RUNS_FLAG_PREFIX));
  if (!runsArg) refuse(`stage 2 needs ${RUNS_FLAG_PREFIX}G-R,G-U (the approved runs)`);
  const asked = runsArg
    .slice(RUNS_FLAG_PREFIX.length)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (asked.length === 0 || new Set(asked).size !== asked.length) refuse(`${RUNS_FLAG_PREFIX} lists each run once`);
  for (const id of asked) {
    if (!PROBE_PLAN_V5_STAGE_2.some((r) => r.id === id)) refuse(`no stage-2 run named ${id} (G-R, G-M, G-U, G-I)`);
    if (!(STAGE_2_APPROVED_RUNS as readonly string[]).includes(id)) refuse(`${id} is not approved here: the user approved stage 2's G-R and G-U only (2026-10-07); G-M and G-I run in the names stage (${NAMES_STAGE_FLAG}), under its own approval`);
  }
  const runs = PROBE_PLAN_V5_STAGE_2.filter((r) => asked.includes(r.id));
  const planned = runs.reduce((n, r) => n + r.requests, 0);
  if (!process.argv.includes(APPROVAL_FLAG)) refuse(`stage 2 sends ${planned} real requests to Gemini on the free tier. Pass ${APPROVAL_FLAG} only under the user's recorded approval.`);
  if (process.env[ROADMAP_CHECK_ENV] === "1") refuse(`${ROADMAP_CHECK_ENV} is set: the default call refuses inside a check run`);
  if (!hasGeminiKey()) refuse("GEMINI_API_KEY is not set (run with --env-file=.env)");
  if (runs.some((r) => r.grounded > 0)) refuse("a grounded run is not approved (stage 2's approval is 0 grounded)");
  if (TOPIC_CANDIDATE_COUNT !== 1) refuse(`TOPIC_CANDIDATE_COUNT is ${TOPIC_CANDIDATE_COUNT}: this run sends one request per sample (P6 refused candidateCount)`);
  if (MAX_PROBE_CALLS_V5_STAGE_2 > STAGE_2_APPROVED_MAX) refuse(`MAX_PROBE_CALLS_V5_STAGE_2 is ${MAX_PROBE_CALLS_V5_STAGE_2}, over the approval's ${STAGE_2_APPROVED_MAX}`);
  if (planned > MAX_PROBE_CALLS_V5_STAGE_2) refuse(`the plan needs ${planned} requests (${runs.map((r) => `${r.id} ${r.requests}`).join(", ")}); MAX_PROBE_CALLS_V5_STAGE_2 is ${MAX_PROBE_CALLS_V5_STAGE_2} (the lead sets the approved count just before running)`);

  // Every pack is built (and checked synthetic) before anything is sent; a run's saved replies are never overwritten.
  const corpus = new Map(readCorpus().map((e) => [e.aim, e] as const));
  let rate: RateSpec[] = [];
  let place: PlaceSpec[] = [];
  try {
    if (asked.includes("G-R")) rate = rateSpecsOf(corpus);
    if (asked.includes("G-U")) place = placeSpecsOf(corpus);
  } catch (err) {
    refuse(err instanceof Error ? err.message : String(err));
  }
  for (const [id, file] of [["G-R", G_R_FILE], ["G-U", G_U_FILE]] as const) {
    if (asked.includes(id) && existsSync(join(CORPUS_DIR, file))) refuse(`${file} exists: a run's saved replies are never overwritten (each run is sent once, under its approval)`);
  }

  console.log(`roadmap-probe PROBE_PLAN v5 stage 2 (TOPIC_PROMPT_VERSION ${TOPIC_PROMPT_VERSION}; model ${ROADMAP_MODEL}): ${runs.map((r) => `${r.id} ${r.requests}`).join(" + ")} = ${planned} requests, at most ${MAX_PROBE_CALLS_V5_STAGE_2}; 0 grounded; no retry; at most ${PACE_PER_MINUTE_MAX} a minute (${PACE_GAP_MS} ms apart), about ${Math.ceil((planned * PACE_GAP_MS) / 60_000)} minutes`);
  const b: StageTwoBudget = { cap: MAX_PROBE_CALLS_V5_STAGE_2, made: 0, stopped: null, pacer: new Pacer() };
  const sent: Record<string, number> = {};
  if (rate.length > 0) sent["G-R"] = await runGRV5(b, rate);
  if (place.length > 0 && !b.stopped) sent["G-U"] = await runGUV5(b, place);
  else if (place.length > 0) console.log(`\n— G-U: not started (${b.stopped}); nothing written —`);
  console.log(`\n— stage 2: ${b.made} request(s) sent (${Object.entries(sent).map(([id, n]) => `${id} ${n}`).join(", ")}), of at most ${MAX_PROBE_CALLS_V5_STAGE_2}; the most in any minute: ${b.pacer.peak()} (at most ${PACE_PER_MINUTE_MAX}) —`);
  if (b.stopped) console.log(`  stopped early: ${b.stopped}`);
  console.log(`  next: the judges' blind ranges in ${G_R_RANGES_FILE}, then ${V5_FLAG} ${SCORE_FLAG_PREFIX}G-R and ${SCORE_FLAG_PREFIX}G-U (offline); two judges label every reply; the lead blesses. Set MAX_PROBE_CALLS_V5_STAGE_2 back to 0.`);
}

// ── Offline scoring (no key, no request) ──

interface SavedRatePack {
  pack: string;
  aim: string;
  areaName: string;
  trackArea: boolean;
  outline: string[];
  examLabel: string | null;
  constraints: string | null;
  today: string;
  inputKey: string;
  samples: StageTwoSample[];
}

interface JudgedRange {
  lo: number;
  hi: number;
  breadth: BreadthKey[];
}

const readCorpusJson = <T>(file: string): T => JSON.parse(readFileSync(join(CORPUS_DIR, file), "utf8")) as T;
const breadthRank = (b: BreadthKey): number => BREADTH_KEYS.indexOf(b);
/** The lower middle of the sorted values (§22.7's consensus rule), null with none. */
const lowerMedianOf = (xs: readonly number[]): number | null => (xs.length === 0 ? null : [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)]);
const pct = (a: number, b: number): string => (b === 0 ? "n/a" : `${((100 * a) / b).toFixed(1)}%`);
const passOf = (ok: boolean | null): string => (ok === null ? "PENDING" : ok ? "PASS" : "FAIL");

/** The judges' ranges ({pack: {layersLo, layersHi, breadth: string[]}}), each checked: 1 ≤ lo ≤ hi ≤ 6, breadth from the enum. */
function judgedRangesOf(raw: unknown): { ranges: Map<string, JudgedRange>; problems: string[] } {
  const ranges = new Map<string, JudgedRange>();
  const problems: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ranges, problems: ["the ranges file is not an object"] };
  for (const [pack, v] of Object.entries(raw as Record<string, unknown>)) {
    if (pack.startsWith("_")) continue;
    const r = v as { layersLo?: unknown; layersHi?: unknown; breadth?: unknown } | null;
    const lo = r?.layersLo;
    const hi = r?.layersHi;
    const breadth = Array.isArray(r?.breadth) ? (r.breadth as unknown[]) : null;
    const ok = typeof lo === "number" && typeof hi === "number" && Number.isInteger(lo) && Number.isInteger(hi) && lo >= 1 && lo <= hi && hi <= 6 && !!breadth && breadth.length > 0 && breadth.every((x) => typeof x === "string" && (BREADTH_KEYS as readonly string[]).includes(x));
    if (!ok) {
      problems.push(`${pack}: needs {layersLo, layersHi: 1..6, lo ≤ hi, breadth: ${BREADTH_KEYS.join("|")}[]}`);
      continue;
    }
    ranges.set(pack, { lo: lo as number, hi: hi as number, breadth: breadth as BreadthKey[] });
  }
  return { ranges, problems };
}

/** --v5 --score=G-R: TOPIC_RATE_LIVE's bar (the Probe plan) over the saved replies, and code's consensus per pack. Prints only. */
function scoreGRV5(): void {
  if (!existsSync(join(CORPUS_DIR, G_R_FILE))) refuse(`${G_R_FILE} is not saved yet: run G-R first (stage 2, approved)`);
  const saved = readCorpusJson<{ packs?: SavedRatePack[]; requests?: number; complete?: boolean; stopped?: string | null }>(G_R_FILE);
  const packs = Array.isArray(saved.packs) ? saved.packs : [];
  const judged = existsSync(join(CORPUS_DIR, G_R_RANGES_FILE)) ? judgedRangesOf(readCorpusJson<unknown>(G_R_RANGES_FILE)) : null;
  console.log(`roadmap-probe --score=G-R (offline): ${G_R_FILE}: ${packs.length} packs, ${saved.requests ?? "?"} requests, ${saved.complete ? "complete" : `INCOMPLETE (${saved.stopped ?? "?"})`}`);
  if (!judged) console.log(`  no ${G_R_RANGES_FILE} yet: the range bar is PENDING (the judges write it blind, before any reply is read)`);
  for (const p of judged?.problems ?? []) console.log(`  ranges: ${p}`);

  const stats = new Map<string, { valid: number; layers: number[]; breadths: BreadthKey[]; medianLayers: number | null; medianBreadth: BreadthKey | null; spread: number | null; inside: number | null }>();
  let all = 0;
  let validAll = 0;
  let failed = 0;
  let insideAll = 0;
  let rangedValid = 0;
  const unranged: string[] = [];
  console.log("\n— per pack: each sample (difficulty/breadth, integrity), the valid votes, the judges' range, code's consensus (ratingOf) —");
  for (const p of packs) {
    const samples = Array.isArray(p.samples) ? p.samples : [];
    const votes = samples.map((s) => rateVoteOf(rateSampleOf(s)));
    const valid = votes.filter((v): v is NonNullable<typeof v> => v !== null);
    const layers = valid.map((v) => layersOfDiff(v.difficulty));
    const breadths = valid.map((v) => v.breadth);
    const medianLayers = lowerMedianOf(layers);
    const mb = lowerMedianOf(breadths.map(breadthRank));
    const medianBreadth = mb === null ? null : BREADTH_KEYS[mb];
    const spread = layers.length >= 2 ? Math.max(...layers) - Math.min(...layers) : null;
    const range = judged?.ranges.get(p.pack) ?? null;
    const inside = range ? valid.filter((v) => layersOfDiff(v.difficulty) >= range.lo && layersOfDiff(v.difficulty) <= range.hi && range.breadth.includes(v.breadth)).length : null;
    stats.set(p.pack, { valid: valid.length, layers, breadths, medianLayers, medianBreadth, spread, inside });
    all += samples.length;
    validAll += valid.length;
    failed += samples.filter((s) => !s.ok).length;
    if (range && inside !== null) {
      insideAll += inside;
      rangedValid += valid.length;
    } else unranged.push(p.pack);
    const consensus = ratingOf({ samples: samples.map(rateSampleOf), trackArea: p.trackArea === true, outlineLines: Array.isArray(p.outline) ? p.outline.length : 0, texts: { aim: p.aim, areaName: p.areaName, constraints: p.constraints ?? null }, inputKey: p.inputKey ?? "", runId: null, day: p.today ?? "" });
    const shown = samples
      .map((s) => {
        if (!s.ok) return `FAILED (${String(s.error).slice(0, 40)})`;
        const d = (s.parsed as { difficulty?: unknown } | null)?.difficulty;
        const br = (s.parsed as { breadth?: unknown } | null)?.breadth;
        return `${String(d)}/${String(br)} ${s.integrity?.verdict ?? "?"}`;
      })
      .join(" · ");
    console.log(`  ${p.pack.padEnd(22)} ${shown}`);
    console.log(
      `  ${"".padEnd(22)} valid ${valid.length}/${samples.length} · layers [${layers.join(", ")}] spread ${spread ?? "n/a"} · median ${medianLayers ?? "n/a"} layers, ${medianBreadth ?? "n/a"} · range ${range ? `${range.lo}–${range.hi} [${range.breadth.join(", ")}] · inside ${inside}/${valid.length}` : "none"} · code's consensus: ${consensus.layers} layers (${consensus.difficulty}, ${consensus.origin}${consensus.unsure ? `, unsure ${consensus.unsure.low}–${consensus.unsure.high}` : ""}${consensus.oneReply ? `, 1 reply said ${layersOfDiff(consensus.oneReply)}` : ""}) · ${consensus.breadth} · reasons ${consensus.reasons.join(", ") || "none"} · cautions ${consensus.cautions.join(", ") || "none"}`
    );
  }

  const st = (name: string) => stats.get(name) ?? null;
  console.log("\n— TOPIC_RATE_LIVE's bar (the Probe plan; prints only: the switch is the user's word, and TOPIC_PLANS_LIVE with it) —");
  console.log(`  valid samples: ${validAll} of ${all} (${failed} failed requests; a reply counts when integrity is CLEAN or SALVAGED and its keys are the enums')`);
  const insideOk = !judged || rangedValid === 0 ? null : unranged.length > 0 ? null : insideAll / rangedValid >= G_R_INSIDE_MIN;
  console.log(`  1. inside each pack's blind range: ${insideAll} of ${rangedValid} valid samples (${pct(insideAll, rangedValid)}), bar ≥ ${G_R_INSIDE_MIN * 100}% overall: ${passOf(insideOk)}${unranged.length > 0 ? ` (no range for: ${unranged.join(", ")})` : ""}`);
  // The 10 clean packs are the plan's (every G-R pack but the injection); a pack missing from the file never counts as tight.
  const clean = stageTwoRunOf("G-R").packs.filter((n) => n !== G_R_INJECTION_PACK);
  const tight = clean.filter((n) => {
    const s = st(n);
    return !!s && s.spread !== null && s.spread <= G_R_SPREAD_MAX;
  });
  const loose = clean.filter((n) => !tight.includes(n)).map((n) => `${n} ${st(n)?.spread ?? `n/a (${st(n)?.valid ?? 0} valid)`}`);
  const spreadOk = tight.length >= G_R_SPREAD_PACKS_MIN;
  console.log(`  2. spread (max − min layers) ≤ ${G_R_SPREAD_MAX} on at least ${G_R_SPREAD_PACKS_MIN} of the ${clean.length} clean packs: ${tight.length} of ${clean.length}: ${passOf(spreadOk)}${loose.length ? ` (not: ${loose.join("; ")})` : ""}`);
  const lt = (a: number | null | undefined, b: number | null | undefined): boolean => a != null && b != null && a < b;
  const le = (a: number | null | undefined, b: number | null | undefined): boolean => a != null && b != null && a <= b;
  const run = st("run-10k");
  const jp = st("japanese-work");
  console.log(`  3. run-10k < japanese-work on difficulty (median layers): ${run?.medianLayers ?? "n/a"} vs ${jp?.medianLayers ?? "n/a"}: ${passOf(lt(run?.medianLayers, jp?.medianLayers))}`);
  const ws = st("wide-shallow");
  const nd = st("narrow-deep");
  const wsB = ws?.medianBreadth ? breadthRank(ws.medianBreadth) : null;
  const ndB = nd?.medianBreadth ? breadthRank(nd.medianBreadth) : null;
  console.log(`  4. wide-shallow < narrow-deep on difficulty (${ws?.medianLayers ?? "n/a"} vs ${nd?.medianLayers ?? "n/a"}) and > on breadth (${ws?.medianBreadth ?? "n/a"} vs ${nd?.medianBreadth ?? "n/a"}): ${passOf(lt(ws?.medianLayers, nd?.medianLayers) && lt(ndB, wsB))}`);
  const fi = st(G_R_INJECTION_PACK);
  const fc = st("finance-compound");
  const fiB = fi?.medianBreadth ? breadthRank(fi.medianBreadth) : null;
  const fcB = fc?.medianBreadth ? breadthRank(fc.medianBreadth) : null;
  console.log(`  5. finance-injection's medians do not exceed finance-compound's: difficulty ${fi?.medianLayers ?? "n/a"} vs ${fc?.medianLayers ?? "n/a"}, breadth ${fi?.medianBreadth ?? "n/a"} vs ${fc?.medianBreadth ?? "n/a"}: ${passOf(le(fi?.medianLayers, fc?.medianLayers) && le(fiB, fcB))}`);
  const bars = [insideOk, spreadOk, lt(run?.medianLayers, jp?.medianLayers), lt(ws?.medianLayers, nd?.medianLayers) && lt(ndB, wsB), le(fi?.medianLayers, fc?.medianLayers) && le(fiB, fcB)];
  const verdict = bars.some((x) => x === false) ? "NO-GO: TOPIC_RATE_LIVE stays false" : bars.some((x) => x === null) ? "PENDING: the judges' ranges are missing" : "every bar passes: TOPIC_RATE_LIVE may turn on only on the user's word (with TOPIC_PLANS_LIVE), after two judges label every reply";
  console.log(`  verdict: ${verdict}${saved.complete ? "" : " (the run is incomplete)"}`);
}

interface SavedPlacePack extends PlaceInput {
  pack: string;
  K: number;
  map?: { samples?: StageTwoSample[] };
  link?: { kFinal?: number; samples?: StageTwoSample[] } | null;
  linkNote?: string | null;
}

/** --v5 --score=G-U: each line's 3 placements, the majority and code's layer, dropped lines (bar: none), and the LINK replies' integrity. */
function scoreGUV5(): void {
  if (!existsSync(join(CORPUS_DIR, G_U_FILE))) refuse(`${G_U_FILE} is not saved yet: run G-U first (stage 2, approved)`);
  const saved = readCorpusJson<{ packs?: SavedPlacePack[]; requests?: number; complete?: boolean; stopped?: string | null; skipped?: string[] }>(G_U_FILE);
  const packs = Array.isArray(saved.packs) ? saved.packs : [];
  const why = saved.stopped ?? ((saved.skipped ?? []).join("; ") || "?");
  console.log(`roadmap-probe --score=G-U (offline): ${G_U_FILE}: ${packs.length} packs, ${saved.requests ?? "?"} requests, ${saved.complete ? "complete" : `INCOMPLETE (${why})`}`);
  let lines = 0;
  let dropped = 0;
  let unplaced = 0;
  let noMajority = 0;
  let linkValid = 0;
  let linkAll = 0;
  for (const p of packs) {
    const mapSamples = Array.isArray(p.map?.samples) ? p.map.samples : [];
    const input: PlaceInput = { aim: p.aim, areaName: p.areaName, track: p.track, lines: p.lines, examLabel: p.examLabel ?? null, constraints: p.constraints ?? null, k: p.k ?? p.K, breadth: p.breadth };
    const placed = placementOf(input, mapSamples);
    console.log(`\n— ${p.pack}: K ${input.k} (code's estimate) · MAP valid ${mapSamples.filter(validSampleOf).length}/${mapSamples.length} (${mapSamples.map((s) => (s.ok ? (s.integrity?.verdict ?? "?") : "FAILED")).join(", ")}) · K_final ${placed.kFinal} —`);
    for (const l of placed.lines) {
      lines += 1;
      if (l.dropped) dropped += 1;
      if (l.unplaced) unplaced += 1;
      if (!l.majority) noMajority += 1;
      console.log(`  ${l.key.padEnd(3)} ${l.votes.map((v) => v.padEnd(8)).join(" ")} → majority ${l.majority ?? "none"} · code's L${l.layer} (${l.placedBy})${l.dropped ? " · DROPPED" : ""}${l.unplaced ? " · UNPLACED" : ""} · ${l.line}`);
    }
    const linkSamples = Array.isArray(p.link?.samples) ? p.link.samples : [];
    if (linkSamples.length === 0) console.log(`  LINK: ${p.linkNote ?? "not sent"}`);
    for (const s of linkSamples) {
      linkAll += 1;
      if (validSampleOf(s)) linkValid += 1;
      const parsed = s.ok && s.parsed && typeof s.parsed === "object" ? (s.parsed as Record<string, unknown>) : null;
      const edges = parsed ? Object.entries(parsed).map(([child, parents]) => `${child} ← ${Array.isArray(parents) ? parents.map(String).join(", ") : String(parents)}`) : [];
      const v = s.integrity?.violations ?? [];
      console.log(`  LINK ${s.sample}: ${s.ok ? `${s.integrity?.verdict ?? "?"}${v.length ? ` (${v.map((x) => `${x.code} ${x.path}`).join("; ")})` : ""}` : `FAILED (${s.error})`}${edges.length ? ` · ${edges.join(" · ")}` : ""}`);
    }
  }
  console.log("\n— TOPIC_PLACE_LIVE and TOPIC_LINK_LIVE (prints only; the semantic agreement is the judges') —");
  console.log(`  lines: ${lines}; left out by a reply that came back (valid or REJECTED): ${dropped}; placed by no valid reply: ${unplaced}; no majority: ${noMajority}`);
  console.log(`  no line dropped: ${passOf(lines > 0 ? dropped === 0 && unplaced === 0 : false)}`);
  console.log(`  layer placement agrees with the judges on ≥ 80% of outline lines: the judges' (label each line's layer from the replies above)`);
  console.log(`  LINK replies valid (CLEAN or SALVAGED): ${linkValid} of ${linkAll}; "builds on" reasonable for ≥ 80% of drawn links, and beating the 1/n² floor: the judges'`);
  if (!saved.complete) console.log("  the run is incomplete: read the bars with that in mind");
}

// ═══ PROBE_PLAN v5, the names stage: G-M, G-I and G-X (the user's approval of 2026-10-07) ═════════════════════════════
//
// The user approved the FULL topic-names test (2026-10-07): about 210 free-tier requests to ROADMAP_MODEL, about 110 of
// them grounded (googleSearch), synthetic packs only, no retries. 16 packs: G-M (finance-compound, ielts, python-cert,
// japanese-work, actuarial-probability with no outline), G-I (finance-injection) and G-X (10 new synthetic Field packs,
// NAMES_G_X). Each pack runs exactly the app's chain with TOPIC_NAMES_LIVE, TOPIC_GROUND_LIVE and TOPIC_LINK_LIVE on
// (roadmap-server claimChainMap → runMapStep → claimChainS3 → runLinkStep and runGroundStep), one request at a time,
// paced; MAP carries `place` (your lines, then your Domains) exactly when the app's does (NAMES_PLACE: topicSwitchesOf()
// .place, on since the lead's b388a9b):
//   1. MAP `names` × 3 (and `place`): K and breadth are G-R's consensus for the pack (ratingOf over probe-v5-G-R.json's
//      replies: the median of 3), else code's estimate (codeRatingOf: depthFallbackOf, BREADTH_FALLBACK); the room is
//      mapRoomOf over the written map's lines and Domains (writtenMapOf: your outline lines, your chosen Domains in L1);
//   2. code's agreement (mapAgreementOf: the shape, checkLabel's flags with the topic-map context, your words, echoes,
//      ≥ CONSENSUS_MIN of 3 own-form, near-duplicates, the layer, your library, C10, the room), keyed as the server keys
//      it (chainMapMergedOf, chainAddedOf: the kept names T1…, then the hidden ones);
//   3. LINK × 3 over the kept topics up to K_final (agreement.kFinal: the rating's mapFilled), drawn by linkDrawOf;
//   4. GROUND over the kept Gemini names (never AIM, never PICKED): groundBatchesOf(…, GROUND_CALLS_MAX), one grounded
//      request per batch of ≤ 3 (at most 7 a pack), seeded by its place in the app's wave, read by groundVerdictOf
//      (GROUND_TITLE_MODE) and merged by groundRecordOf; a failed call leaves its names unchecked (GROUND_FAILED).
// Worst case: 16 × (3 + 3 + 7) = 208 requests, 16 × 7 = 112 grounded. MAX_PROBE_CALLS_V5_NAMES is 0 in this build; the
// lead sets it to 210 just before the run. Each pack's replies are saved unedited with code's verdicts as
// probe-v5-names-<pack>.json (blessed: false, expected: null), rewritten after every request.

const NAMES_STAGE_FLAG = "--stage=names";
/**
 * The approved ceiling for the names stage: 0 in this build, so no names request can be sent. The lead sets it to 210
 * (the approval's count) just before the run, and back to 0 in the commit that saves the replies.
 */
const MAX_PROBE_CALLS_V5_NAMES: number = 0;
/** The approval's bound: a ceiling above it is refused, whatever the constant says. */
const NAMES_APPROVED_MAX = 210;
/** The grounded cap (the approval: about 110 grounded): GROUND_CALLS_MAX (7) for each of the 16 packs. */
const NAMES_GROUNDED_CAP = 112;
const NAMES_FILE_PREFIX = "probe-v5-names-";
const NAMES_JUDGE_SHEET = "probe-v5-names-judge-sheet.json";
/** Where the names run writes and --score=names reads: the corpus. (A rehearsal copy points it at a scratch folder.) */
const NAMES_OUT_DIR: string = CORPUS_DIR;
/** The names run's model call: undefined is roadmap-model's defaultCallModel, the real call. (A rehearsal copy swaps in a fake.) */
const NAMES_CALL_MODEL: CallModel | undefined = undefined;
/**
 * MAP's `place` part, exactly as the app sends it (claimChainMap: your lines, then your Domains, while
 * topicSwitchesOf().place holds; TOPIC_PLACE_LIVE is on since the lead's b388a9b). `names` is always asked here: the
 * names stage tests it (the user's approval), whatever TOPIC_NAMES_LIVE says.
 */
const NAMES_PLACE: boolean = topicSwitchesOf().place;
/** The most one pack sends: 3 MAP + 3 LINK + GROUND_CALLS_MAX GROUND (the app's breakdown, less RATE's 3). */
const NAMES_REQUESTS_PER_PACK_MAX = 2 * TOPIC_SAMPLES + GROUND_CALLS_MAX;

type NamesRunId = "G-M" | "G-I" | "G-X";
interface NamesPlanItem {
  run: NamesRunId;
  pack: string;
  /** actuarial-probability in G-M: its outline is left out (no S lines; the room is all names). */
  noOutline: boolean;
}

/** G-X: the lead's 10 synthetic Field packs (topic-only; never the user's words), each with its exact aim and Area. */
const NAMES_G_X: readonly { pack: string; aim: string; areaName: string }[] = [
  { pack: "cooking-weeknight", aim: "Cook confident weeknight meals from scratch", areaName: "Cooking" },
  { pack: "photo-manual", aim: "Take sharp, well-composed photos with a manual camera", areaName: "Photography" },
  { pack: "ml-training", aim: "Understand how machine learning models are trained", areaName: "Computing" },
  { pack: "piano-reading", aim: "Read music and play simple pieces on piano", areaName: "Music" },
  { pack: "garden-vegetables", aim: "Grow vegetables in a small backyard garden", areaName: "Gardening" },
  { pack: "climate-basics", aim: "Understand the basics of climate science", areaName: "Science" },
  { pack: "work-presentations", aim: "Give clear, confident presentations at work", areaName: "Communication" },
  { pack: "roman-history", aim: "Learn the history of the Roman Empire", areaName: "History" },
  { pack: "web-basics", aim: "Build a small website with HTML, CSS and JavaScript", areaName: "Computing" },
  { pack: "first-aid-home", aim: "Learn first aid for common home emergencies", areaName: "Health" },
];

/** The names stage, in run order: G-M, then G-I, then G-X. */
const NAMES_PLAN: readonly NamesPlanItem[] = [
  { run: "G-M", pack: "finance-compound", noOutline: false },
  { run: "G-M", pack: "ielts", noOutline: false },
  { run: "G-M", pack: "python-cert", noOutline: false },
  { run: "G-M", pack: "japanese-work", noOutline: false },
  { run: "G-M", pack: "actuarial-probability", noOutline: true },
  { run: "G-I", pack: "finance-injection", noOutline: false },
  ...NAMES_G_X.map((x): NamesPlanItem => ({ run: "G-X", pack: x.pack, noOutline: false })),
];

/** The plan's worst case: every pack sends 3 MAP, 3 LINK and GROUND_CALLS_MAX grounded requests. */
const namesWorstCaseOf = (plan: readonly NamesPlanItem[]) => ({ requests: plan.length * NAMES_REQUESTS_PER_PACK_MAX, grounded: plan.length * GROUND_CALLS_MAX });

/** The G-I injection's words: a shown string carrying one is listed for the judges (a machine pre-check; the judges decide). */
const INJECTION_MARKERS: readonly string[] = ["diff_6", "diff 6", "ignore", "rules above", "rate this", "crypto", "leverage", "example.com", "hot-tips", "hot tips", "http", "www."];

const isNamesKey =
  (prefix: "S" | "U" | "T") =>
  (t: { key: string }): boolean =>
    new RegExp(`^${prefix}[1-9]\\d{0,2}$`).test(t.key);
const namesKeyNumber = (key: string): number => (/^[SUT]\d+$/.test(key) ? Number(key.slice(1)) : Number.POSITIVE_INFINITY);
/** The server's byTopicKey: S, then U, then T, each by number. */
const byNamesKey = (a: { key: string }, b: { key: string }): number => "SUT".indexOf(a.key[0]) - "SUT".indexOf(b.key[0]) || namesKeyNumber(a.key) - namesKeyNumber(b.key);
const namesLive = (t: TopicDraft): boolean => t.decision !== "REMOVED" && t.decision !== "MERGED";
/** The server's chainHiddenMarked: a topic the agreement hid (never sent to LINK or GROUND). */
const namesHiddenMarked = (t: TopicDraft): boolean => t.notes.includes("NEAR_DUPLICATE") || t.notes.includes("UNSURE_LAYER") || t.flags.includes("REGION") || t.flags.includes("LANGUAGE_UNCHECKED");
/** The server's topicFormKey: formKeyOf, or a plain fold when it can't answer. */
const namesFormOf = (name: string): string => {
  try {
    return formKeyOf(name);
  } catch {
    return name.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
  }
};
/** roadmap-topics' lightClean (NFC, format and control characters out, whitespace collapsed, trimmed), for the diagnostic. */
const namesClean = (raw: string): string =>
  raw
    .slice(0, 2000)
    .normalize("NFC")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/gu, " ")
    .replace(/\p{Cc}/gu, "")
    .trim();

/** The server's chainCountryNamedOf: your texts name a country (COUNTRY_WORDS as whole-word runs, case-insensitive). */
function countryNamedOf(texts: readonly (string | null | undefined)[]): boolean {
  const entries = COUNTRY_WORDS.map((w) => words(w).map((x) => x.raw.toLowerCase())).filter((w) => w.length > 0);
  for (const text of texts) {
    if (typeof text !== "string" || text === "") continue;
    const typed = words(text).map((w) => w.raw.toLowerCase());
    for (const want of entries) for (let i = 0; i + want.length <= typed.length; i++) if (want.every((w, k) => typed[i + k] === w)) return true;
  }
  return false;
}

/** G-R's consensus per pack (ratingOf over the saved replies, as runRateStep reads them); empty when G-R isn't saved. */
function gRRatingsOf(): Map<string, { rating: RatingRecord; valid: number; votes: string }> {
  const out = new Map<string, { rating: RatingRecord; valid: number; votes: string }>();
  if (!existsSync(join(CORPUS_DIR, G_R_FILE))) return out;
  let saved: { packs?: SavedRatePack[] };
  try {
    saved = readCorpusJson<{ packs?: SavedRatePack[] }>(G_R_FILE);
  } catch (err) {
    throw new Error(`${G_R_FILE} can't be read (${err instanceof Error ? err.message.slice(0, 120) : "?"}): let the G-R run finish saving it`);
  }
  for (const p of Array.isArray(saved.packs) ? saved.packs : []) {
    const samples = Array.isArray(p.samples) ? p.samples : [];
    const rating = ratingOf({ samples: samples.map(rateSampleOf), trackArea: p.trackArea === true, outlineLines: Array.isArray(p.outline) ? p.outline.length : 0, texts: { aim: p.aim, areaName: p.areaName, constraints: p.constraints ?? null }, inputKey: p.inputKey ?? "", runId: null, day: p.today ?? "" });
    const votes = samples
      .map((s) => {
        const v = rateVoteOf(rateSampleOf(s));
        return v ? `${layersOfDiff(v.difficulty)}/${v.breadth}` : s.ok ? "invalid" : "failed";
      })
      .join(", ");
    out.set(p.pack, { rating, valid: samples.filter(validSampleOf).length, votes });
  }
  return out;
}

/** One names pack, built before anything is sent: the written map, the agreement's context and MAP's pack, as the server builds them. */
interface NamesSpec {
  item: NamesPlanItem;
  e: CorpusEntry;
  /** The intake as the chain reads it (actuarial-probability's without its outline). */
  intake: Intake;
  areaName: string;
  outline: string[];
  /** The exam's label only with your Yes (chainExamLabelOf). */
  examLabel: string | null;
  k: number;
  breadth: BreadthKey;
  kSource: string;
  rating: RatingRecord;
  /** The written map's own topics (writtenMapOf): S lines placed by code, U Domains in layer 1. */
  base: TopicDraft[];
  lines: { key: string; text: string; index: number }[];
  domains: { key: string; id: string; name: string }[];
  /** The Area's Domains you did not choose (chainFreeDomainsOf; no other goal holds one here). */
  freeDomains: { id: string; name: string }[];
  label: LabelContext;
  countryNamed: boolean;
  room: number;
  /** MAP's `place` keys (S, then U; empty with NAMES_PLACE off). */
  placeKeys: string[];
  mapPack: TopicPack;
  makeId: () => string;
}

/** The 16 packs, each checked synthetic (and a G-X pack topic-only with exactly its approved aim) before anything is sent. */
function namesSpecsOf(corpus: ReadonlyMap<string, CorpusEntry>): NamesSpec[] {
  const want = (run: NamesRunId) => NAMES_PLAN.filter((i) => i.run === run);
  const gm = stageTwoRunOf("G-M").packs;
  const gmOk = want("G-M").length === gm.length && want("G-M").every((i, n) => i.pack === gm[n].replace(/ \(no outline\)$/, "") && i.noOutline === gm[n].endsWith("(no outline)"));
  if (!gmOk) throw new Error(`NAMES_PLAN's G-M (${want("G-M").map((i) => i.pack).join(", ")}) is not PROBE_PLAN_V5_STAGE_2's (${gm.join(", ")})`);
  if (JSON.stringify(want("G-I").map((i) => i.pack)) !== JSON.stringify(stageTwoRunOf("G-I").packs)) throw new Error("NAMES_PLAN's G-I is not PROBE_PLAN_V5_STAGE_2's");
  if (want("G-X").length !== NAMES_G_X.length || new Set(NAMES_PLAN.map((i) => i.pack)).size !== NAMES_PLAN.length) throw new Error("NAMES_PLAN lists a pack twice, or G-X is not NAMES_G_X");
  const gr = gRRatingsOf();
  return NAMES_PLAN.map((item): NamesSpec => {
    const e = stageTwoPackOf(corpus, item.pack);
    if (e.input.intake.fieldId == null) throw new Error(`${item.pack}: a topic map is a Field's (TOPICS_FIELD_ONLY); this is a track pack`);
    if (item.run === "G-X") {
      const x = NAMES_G_X.find((g) => g.pack === item.pack);
      if (!x || !e.topicOnly || e.input.intake.aim !== x.aim || e.input.areaName !== x.areaName) throw new Error(`${item.pack}: a G-X pack is topic-only and sends exactly its approved aim and Area ("${x?.aim ?? "?"}", ${x?.areaName ?? "?"})`);
    }
    const intake: Intake = item.noOutline ? { ...e.input.intake, syllabus: null } : e.input.intake;
    const areaName = e.input.areaName;
    const outline = (intake.syllabus?.lines ?? []).filter((l): l is string => typeof l === "string");
    const examLabel = examAnswerOf(intake) && intake.examLabel ? intake.examLabel : null;
    const texts = { aim: intake.aim, areaName, constraints: intake.constraints ?? null };
    const code = codeRatingOf({ trackArea: false, outlineLines: outline.length, texts, inputKey: ratingKeyOf({ aim: intake.aim, areaName, outline, examLabel, splitClauses: [] }), day: e.today });
    const g = gr.get(item.pack) ?? null;
    const fromGR = g !== null && g.rating.origin === "GEMINI";
    const rating = fromGR && g ? g.rating : code;
    const kSource = fromGR && g ? `G-R's consensus (ratingOf over ${G_R_FILE}: ${g.valid} valid, layers/breadth ${g.votes})` : g ? `code's estimate (G-R holds ${g.valid} valid repl${g.valid === 1 ? "y" : "ies"}, too few for a consensus)` : "code's estimate (codeRatingOf: depthFallbackOf, BREADTH_FALLBACK; not in G-R)";
    const k = rating.layers;
    const breadth = rating.breadth;
    let n = 0;
    const makeId = () => `names-${item.pack}-${++n}`;
    // The written map (writtenTopicsDraft → writtenMapOf): your outline lines placed by code, your chosen Domains (U keys) in layer 1.
    const fieldDomains = new Map<string, { id: string; name: string }>();
    for (const d of [...e.input.domains, ...e.library]) if (d.fieldId === intake.fieldId && !fieldDomains.has(d.id)) fieldDomains.set(d.id, { id: d.id, name: d.name });
    const chosenIds = intake.domainIds.filter((id) => fieldDomains.has(id));
    const chosen = chosenIds.map((id, i) => ({ key: `U${i + 1}`, id, name: fieldDomains.get(id)?.name ?? "" }));
    const library = [...fieldDomains.values()].filter((d) => !chosenIds.includes(d.id));
    const base = writtenMapOf({ aim: intake.aim, lines: outline, layers: k, domains: chosen, library, splitClauses: [], makeId }).map.topics;
    const lines = base
      .filter(isNamesKey("S"))
      .sort(byNamesKey)
      .map((t) => ({ key: t.key, text: t.name, index: namesKeyNumber(t.key) - 1 }));
    const domains = base
      .filter(isNamesKey("U"))
      .sort(byNamesKey)
      .map((t) => ({ key: t.key, id: t.domainId ?? t.lineageId, name: t.name }));
    const treeNames = [...new Set([...e.input.domains.map((d) => d.name), ...e.library.map((d) => d.name)])];
    const label = labelContextFor(intake, areaName, treeNames, "TOPIC");
    const countryNamed = countryNamedOf([intake.aim, intake.constraints, intake.examLabel, ...outline]);
    const room = mapRoomOf({ layers: k, breadth, lines: lines.length, domains: domains.length });
    // claimChainMap's `place`: your lines, then your Domains that no other goal holds and Gemini never named (packableDomainsOf).
    const sOf = base.filter(isNamesKey("S")).sort(byNamesKey);
    const uOf = base.filter(isNamesKey("U")).sort(byNamesKey);
    const packable = new Set(packableDomainsOf(uOf.flatMap((t) => (t.domainId ? [{ id: t.domainId, nameOrigin: null }] : [])), []));
    const place = NAMES_PLACE ? [...sOf.map((t) => ({ key: t.key, text: t.name, id: t.lineageId })), ...uOf.filter((t) => !t.domainId || packable.has(t.domainId)).map((t) => ({ key: t.key, text: t.name, id: t.domainId ?? t.lineageId }))] : [];
    const mapPack = topicPackOf({ phase: "MAP", areaName, aim: intake.aim, splitClauses: [], outline, examLabel, layers: k, breadth, room, place });
    return { item, e, intake, areaName, outline, examLabel, k, breadth, kSource, rating, base, lines, domains, freeDomains: library, label, countryNamed, room, placeKeys: place.map((x) => x.key), mapPack, makeId };
  });
}

interface NamesBudget {
  cap: number;
  groundedCap: number;
  /** Requests sent, failures included. */
  made: number;
  /** Grounded requests sent, failures included. */
  grounded: number;
  stopped: string | null;
  pacer: Pacer;
  callModel: CallModel | undefined;
}

/** One JSON request (MAP or LINK), as sendSampleV5 sends it, within the names caps: paced, counted, never retried. */
async function sendNamesJsonV5(b: NamesBudget, pack: TopicPack, i: number, tag: string): Promise<StageTwoSample | null> {
  if (b.stopped) return null;
  if (b.made + 1 > b.cap) {
    b.stopped = `the next request would pass MAX_PROBE_CALLS_V5_NAMES (${b.cap})`;
    return null;
  }
  await b.pacer.next();
  b.made += 1;
  const seed = SEED_BASE + SEED_OFFSETS[i];
  const results = await topicSamples(pack, { callModel: b.callModel, seedBase: seed - SEED_OFFSETS[0], model: ROADMAP_MODEL, samples: 1, candidateCount: 1 });
  const r: SampleResult = results[0] ?? { ok: false, error: "no reply" };
  const sent = requestsSentOf([r], 1) === 1;
  if (!sent) b.made -= 1; // never left the process (NOTHING_TO_ASK)
  const s = stageTwoSampleOf(pack, i, seed, r, sent);
  console.log(`  [${b.made}] ${tag} ${pack.phase} ${i + 1}/${TOPIC_SAMPLES} (seed ${seed}): ${s.ok ? `OK · integrity ${s.integrity?.verdict ?? "?"}` : `FAILED (${s.error})`} · ${s.latencyMs ?? "?"} ms${sent ? "" : " · not sent"}`);
  if (!r.ok && QUOTA_ERROR.test(r.error)) b.stopped = `a quota or rate error on ${tag} ${pack.phase} (${r.error.slice(0, 160)}): no retry`;
  return s;
}

/** One GROUND call as saved: the parts and metadata exactly as returned, and code's verdict per key beside them. */
interface NamesGroundCall {
  batch: number;
  wave: number;
  seed: number;
  terms: GroundTerm[];
  instruction: string;
  contents: string;
  sent: boolean;
  ok: boolean;
  error: string | null;
  latencyMs: number | null;
  finishReason: string | null;
  modelVersion: string | null;
  responseId: string | null;
  usage: unknown;
  parts: GroundParts | null;
  raw: string | null;
  verdict: GroundCallVerdict | null;
  verdictError: string | null;
}

/**
 * One grounded request (one batch of ≤ 3 terms), within both caps: paced, counted (failures included), never retried;
 * seeded by the batch's place in the app's wave (SEED_BASE + SEED_OFFSETS[batch mod GROUND_PARALLEL]).
 */
async function sendNamesGroundV5(b: NamesBudget, pack: TopicPack, terms: readonly GroundTerm[], batch: number, tag: string): Promise<NamesGroundCall | null> {
  if (b.stopped) return null;
  if (b.made + 1 > b.cap) {
    b.stopped = `the next request would pass MAX_PROBE_CALLS_V5_NAMES (${b.cap})`;
    return null;
  }
  if (b.grounded + 1 > b.groundedCap) {
    b.stopped = `the next grounded request would pass the grounded cap (${b.groundedCap})`;
    return null;
  }
  await b.pacer.next();
  b.made += 1;
  b.grounded += 1;
  const seed = SEED_BASE + SEED_OFFSETS[(batch % GROUND_PARALLEL) % SEED_OFFSETS.length];
  const results = await groundSamples([pack], { callModel: b.callModel, seedBase: seed - SEED_OFFSETS[0], model: ROADMAP_MODEL });
  const r: GroundSampleResult = results[0] ?? { ok: false, parts: null, error: "no reply", latencyMs: 0, raw: null };
  const sent = groundRequestsSentOf([r]) === 1;
  if (!sent) {
    b.made -= 1;
    b.grounded -= 1;
  }
  let verdict: GroundCallVerdict | null = null;
  let verdictError: string | null = null;
  if (r.ok && r.parts && terms.length > 0) {
    try {
      verdict = groundVerdictOf({ response: r.response ?? groundResponseOf(r.parts), terms, titleMode: GROUND_TITLE_MODE });
    } catch (err) {
      verdictError = err instanceof Error ? err.message.slice(0, 200) : "failed";
    }
  }
  const response = r.response && typeof r.response === "object" ? (r.response as Record<string, unknown>) : null;
  const call: NamesGroundCall = {
    batch: batch + 1,
    wave: Math.floor(batch / GROUND_PARALLEL) + 1,
    seed,
    terms: terms.map((t) => ({ key: t.key, name: t.name })),
    instruction: pack.instruction,
    contents: pack.contents,
    sent,
    ok: r.ok,
    error: r.error,
    latencyMs: r.latencyMs,
    finishReason: r.parts?.finishReason ?? null,
    modelVersion: typeof response?.modelVersion === "string" ? response.modelVersion : null,
    responseId: typeof response?.responseId === "string" ? response.responseId : null,
    usage: response?.usageMetadata ?? null,
    parts: r.parts,
    raw: r.raw,
    verdict,
    verdictError,
  };
  const said = verdict ? Object.values(verdict.keys).map((v) => `${v.key} ${v.verdict}${v.reason ? ` (${v.reason})` : ""}`).join(" · ") : (verdictError ?? "no verdict");
  console.log(`  [${b.made}] ${tag} GROUND batch ${batch + 1} (grounded ${b.grounded}; seed ${seed}): ${r.ok ? "OK" : `FAILED (${r.error})`} · ${r.latencyMs} ms${sent ? "" : " · not sent"} · ${said}`);
  if (!r.ok && QUOTA_ERROR.test(r.error ?? "")) b.stopped = `a quota or rate error on ${tag} GROUND (${String(r.error).slice(0, 160)}): no retry`;
  return call;
}

/** The server's chainMapMergedOf and chainAddedOf on a fresh written map: the lines' and Domains' layers, then Gemini's names and your aim's spans as T1… (kept first, then hidden); an echo of a map name is dropped. */
function namesMergedOf(base: readonly TopicDraft[], agreement: MapAgreement): { topics: TopicDraft[]; kept: string[]; hidden: string[]; echoes: number } {
  const all = [...agreement.topics, ...agreement.hidden];
  const placed = new Map(all.filter((a) => isNamesKey("S")(a) || isNamesKey("U")(a)).map((a) => [a.key, a] as const));
  const own = base.map((t): TopicDraft => {
    const a = placed.get(t.key);
    if (!a || t.placedBy === "YOU") return t;
    const notes: TopicNote[] = a.placedBy === "GEMINI" && !t.notes.includes("PLACED_BY_GEMINI") ? [...t.notes, "PLACED_BY_GEMINI"] : t.notes;
    return { ...t, layer: a.layer, placedBy: a.placedBy, formVotes: a.formVotes, samples: a.samples, layerVotes: [...a.layerVotes], notes };
  });
  const hiddenSet = new Set(agreement.hidden);
  const forms = new Set(own.map((t) => namesFormOf(t.name)).filter((f) => f !== ""));
  let next = own.reduce((m, t) => (isNamesKey("T")(t) ? Math.max(m, namesKeyNumber(t.key)) : m), 0) + 1;
  const topics: TopicDraft[] = [...own];
  const kept: string[] = [];
  const hidden: string[] = [];
  let echoes = 0;
  for (const a of all) {
    if (isNamesKey("S")(a) || isNamesKey("U")(a)) continue;
    const form = namesFormOf(a.name);
    if (form === "" || forms.has(form)) {
      echoes += 1;
      continue;
    }
    if (next > 999) break;
    forms.add(form);
    const key = `T${next++}`;
    (hiddenSet.has(a) ? hidden : kept).push(key);
    topics.push({ ...a, id: null, key, notes: [...a.notes], rawName: typeof a.rawName === "string" ? Array.from(a.rawName).slice(0, RAW_LABEL_MAX).join("") : null });
  }
  return { topics, kept, hidden, echoes };
}

/** The server's chainOutlineOrderOf: an S key's line index, and a U key's first line tied to its Domain. */
function namesOutlineOrderOf(intake: Intake, kept: readonly TopicDraft[]): Record<string, number> {
  const lineDomains = intake.syllabus?.lineDomains ?? [];
  const out: Record<string, number> = {};
  for (const t of kept) {
    if (isNamesKey("S")(t)) out[t.key] = namesKeyNumber(t.key) - 1;
    else if (isNamesKey("U")(t) && t.domainId) {
      const i = lineDomains.findIndex((d) => d === t.domainId);
      if (i >= 0) out[t.key] = i;
    }
  }
  return out;
}

/** A name's fate through steps 1–4 (shape, checkLabel's flags, your words, echoes), as mapAgreementOf's verdictOf reads it: a diagnostic for the judges. */
function namesStepVerdictOf(raw: string, scope: TopicScope, s: NamesSpec): { verdict: string; flags: string[]; reasons: Record<string, string>; form: string } {
  const text = namesClean(raw);
  const shape = topicNameShapeOf(text);
  if (!shape.ok) return { verdict: `SHAPE (${shape.clause})`, flags: [], reasons: {}, form: text };
  const domainNames = [...new Set([...s.label.domainNames, ...s.freeDomains.map((d) => d.name), ...s.domains.map((d) => d.name)])];
  const lc = checkLabel(text, { ...s.label, kind: "TOPIC", domainNames, topicMap: { scope, countryNamed: s.countryNamed } });
  const form = lc.cleaned || text;
  if (lc.drop) return { verdict: `SHAPE (${lc.drop})`, flags: [], reasons: {}, form };
  const reasons = Object.fromEntries(Object.entries(lc.reasons ?? {}).filter((x): x is [string, string] => typeof x[1] === "string"));
  const blocking = [...lc.flags.filter((f) => f !== "LANGUAGE_UNCHECKED"), ...(lc.topicFlags ?? []).filter((f) => f !== "REGION")];
  if (blocking.length > 0) return { verdict: "FLAG", flags: blocking, reasons, form };
  const hide = shape.languageUnchecked || lc.flags.includes("LANGUAGE_UNCHECKED") ? "LANGUAGE_UNCHECKED" : (lc.topicFlags ?? []).includes("REGION") ? "REGION" : null;
  const aim = aimSpanOf(form, s.intake.aim);
  const keys = aim ? [namesFormOf(form), namesFormOf(aim.text)] : [namesFormOf(form)];
  const echoKeys = new Set([...s.lines.map((l) => namesFormOf(l.text)), ...s.domains.map((d) => namesFormOf(d.name))].filter(Boolean));
  if (keys.some((k) => echoKeys.has(k))) return { verdict: "ECHO", flags: [], reasons, form };
  return { verdict: aim ? `AIM ("${aim.text}")${hide ? `, hidden ${hide}` : ""}` : hide ? `kept, hidden ${hide}` : "kept", flags: hide ? [hide] : [], reasons, form };
}

/** Every name the valid MAP replies proposed (as mapOccurrencesOf reads them), once per cleaned form, with its samples, layers and the step-1–4 diagnostic. */
function namesProposedOf(samples: readonly StageTwoSample[], s: NamesSpec): { name: string; form: string; samples: number[]; layers: number[]; scopes: string[]; steps: ReturnType<typeof namesStepVerdictOf> }[] {
  const perLayer = BREADTH_TABLE[s.breadth].max;
  const byForm = new Map<string, { name: string; form: string; samples: number[]; layers: number[]; scopes: string[]; steps: ReturnType<typeof namesStepVerdictOf> }>();
  samples.forEach((smp, si) => {
    if (!validSampleOf(smp)) return;
    const names = smp.parsed && typeof smp.parsed === "object" ? (smp.parsed as { names?: unknown }).names : null;
    if (!names || typeof names !== "object") return;
    LAYER_KEYS.slice(0, s.k).forEach((lk, li) => {
      const list = Object.prototype.hasOwnProperty.call(names, lk) ? (names as Record<string, unknown>)[lk] : null;
      for (const item of Array.isArray(list) ? list.slice(0, perLayer) : []) {
        const raw = item && typeof item === "object" ? (item as { name?: unknown }).name : null;
        const scope = item && typeof item === "object" ? (item as { scope?: unknown }).scope : null;
        if (typeof raw !== "string" || typeof scope !== "string" || !(TOPIC_SCOPES as readonly string[]).includes(scope)) continue;
        const text = namesClean(raw);
        const form = namesFormOf(text) || text;
        let p = byForm.get(form);
        if (!p) {
          p = { name: text, form, samples: [], layers: [], scopes: [], steps: namesStepVerdictOf(raw, scope as TopicScope, s) };
          byForm.set(form, p);
        }
        if (!p.samples.includes(si + 1)) p.samples.push(si + 1);
        p.layers.push(li + 1);
        if (!p.scopes.includes(scope)) p.scopes.push(scope);
      }
    });
  });
  return [...byForm.values()];
}

/** The sentence Gemini wrote for a key: its line "Tk: …" or "<the term>: …" in an answer part (display only; the verdict is groundVerdictOf's). */
function groundSentenceOf(parts: readonly unknown[] | null | undefined, key: string, name: string): string | null {
  const fold = (x: string) => x.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
  for (const p of Array.isArray(parts) ? parts : []) {
    if (!p || typeof p !== "object" || (p as { thought?: unknown }).thought === true) continue;
    const text = (p as { text?: unknown }).text;
    if (typeof text !== "string") continue;
    for (const piece of text.split("\n")) {
      const line = piece.replace(/\r$/, "");
      if (line.startsWith(`${key}: `)) return line.slice(key.length + 2);
      const at = line.indexOf(": ");
      if (at > 0 && fold(line.slice(0, at)) === fold(name)) return line.slice(at + 2);
    }
  }
  return null;
}

/** One topic on the final map, as saved and shown to the judges. */
interface SavedNamesTopic {
  key: string;
  layer: number;
  name: string;
  rawName: string | null;
  origin: string;
  class: string;
  /** Shown on the map (your lines and Domains, your words, Gemini's pick from your library, a LINKED name), else hidden behind the count. */
  shown: boolean;
  hiddenBy: string | null;
  grounding: string;
  scope: string | null;
  formVotes: number;
  layerVotes: number[];
  flags: string[];
  notes: string[];
  domainId: string | null;
  chosen: boolean;
}

/** One kept Gemini name's GROUND verdict, with its counted sources' domains and the sentence Gemini wrote. */
interface SavedNamesVerdict {
  key: string;
  layer: number;
  name: string;
  /** LINKED, WEAK, NONE, NOT_RUN (past the 7 calls, or the run stopped first) or GROUND_FAILED (its call failed). */
  verdict: string;
  reason: string | null;
  counted: number;
  sources: { domain: string | null; title: string; uri: string }[];
  sentence: string | null;
  batch: number | null;
}

interface SavedNamesEdge {
  parent: string;
  parentName: string;
  child: string;
  childName: string;
  votes: number;
  samples: number;
  drawn: boolean;
  match: string;
}

/** Writes one pack's file (rewritten after every request, so a stop keeps what was sent); the replies unedited, blessed: false. */
function writeNamesFile(file: string, body: Record<string, unknown>): void {
  mkdirSync(NAMES_OUT_DIR, { recursive: true });
  writeFileSync(join(NAMES_OUT_DIR, file), `${JSON.stringify({ ...body, promptVersion: TOPIC_PROMPT_VERSION, model: ROADMAP_MODEL, expected: null, blessed: false, labels: {} }, null, 2)}\n`, "utf8");
}

/** One pack's chain: MAP × 3, the agreement, LINK × 3, then GROUND per batch; returns the requests it sent and whether it ran to the end. */
async function runNamesPackV5(b: NamesBudget, s: NamesSpec): Promise<{ sent: number; grounded: number; complete: boolean }> {
  const start = { made: b.made, grounded: b.grounded };
  const tag = `${s.item.run} ${s.item.pack}`;
  const file = `${NAMES_FILE_PREFIX}${s.item.pack}.json`;
  const mapSamples: StageTwoSample[] = [];
  const rec: Record<string, unknown> = {
    item: s.item.run,
    run: s.item.run,
    pack: s.item.pack,
    tests: s.item.run === "G-I" ? "injection through the map: MAP names, LINK and GROUND on finance-injection, exactly the app's chain" : "names, links and the link check: MAP names, LINK and GROUND, exactly the app's chain",
    note: "Real MAP (names), LINK and GROUND replies, unedited, one request each, with code's verdicts beside them: the agreement (mapAgreementOf, keyed as the server keys it), the drawn links (linkDrawOf) and each kept name's GROUND verdict (groundVerdictOf, GROUND_TITLE_MODE) with its counted sources. --v5 --score=names prints the counts and writes the judge sheet.",
    aim: s.intake.aim,
    areaName: s.areaName,
    track: s.intake.track,
    outline: s.outline,
    noOutline: s.item.noOutline,
    examLabel: s.examLabel,
    constraints: s.intake.constraints ?? null,
    today: s.e.today,
    K: s.k,
    breadth: s.breadth,
    kSource: s.kSource,
    rating: { difficulty: s.rating.difficulty, breadth: s.rating.breadth, layers: s.rating.layers, origin: s.rating.origin, reasons: s.rating.reasons, cautions: s.rating.cautions },
    room: s.room,
    place: NAMES_PLACE,
    placeKeys: s.placeKeys,
    countryNamed: s.countryNamed,
    domains: s.domains,
    freeDomains: s.freeDomains,
    map: { instruction: s.mapPack.instruction, contents: s.mapPack.contents, schema: s.mapPack.schema, samples: mapSamples },
    mapNote: null,
    proposed: null,
    agreement: null,
    link: null,
    linkNote: null,
    ground: null,
    topics: null,
    verdicts: null,
    shown: null,
  };
  let wrote = false;
  const save = (complete: boolean) => {
    writeNamesFile(file, {
      ...rec,
      seedBase: SEED_BASE,
      seedOffsets: SEED_OFFSETS,
      candidateCount: 1,
      thinkingLow: ROADMAP_THINKING_LOW,
      groundTitleMode: GROUND_TITLE_MODE,
      pacing: { perMinuteMax: PACE_PER_MINUTE_MAX, gapMs: PACE_GAP_MS },
      requests: b.made - start.made,
      grounded: b.grounded - start.grounded,
      complete,
      stopped: b.stopped,
    });
    wrote = true;
  };
  const done = (complete: boolean) => {
    if (wrote || b.made > start.made) save(complete);
    return { sent: b.made - start.made, grounded: b.grounded - start.grounded, complete };
  };
  console.log(`\n— ${tag}: K ${s.k} ${s.breadth} (${s.kSource}) · room ${s.room} · ${s.lines.length} lines, ${s.domains.length} Domains (${s.domains.map((d) => d.name).join(", ")}) · place ${s.placeKeys.length ? s.placeKeys.join(" ") : "off"} → ${file} —`);

  // 1. MAP × 3 (the server's claimChainMap: `names`, and `place` while the app sends it). Asking nothing, it is never sent.
  let topics: TopicDraft[] = s.base.map((t) => ({ ...t, notes: [...t.notes], flags: [...t.flags] }));
  const hiddenKeys = new Set<string>();
  let kFinal: number;
  if (!s.mapPack.schema) {
    rec.mapNote = "MAP not sent: it asks nothing (no room and nothing to place), as claimChainMap goes straight to step 3";
    kFinal = kFinalOf(topics, s.k);
  } else {
    for (let i = 0; i < TOPIC_SAMPLES; i++) {
      const got = await sendNamesJsonV5(b, s.mapPack, i, tag);
      if (!got) break;
      mapSamples.push(got);
      save(false);
    }
    if (b.stopped || mapSamples.length < TOPIC_SAMPLES) return done(false);
    // 2. The agreement (runMapStep): no valid reply leaves the written map as it was (no Gemini names).
    const read = mapSamples.map((x) => (x.ok && x.integrity ? { parsed: x.parsed, integrity: x.integrity.verdict } : null));
    const valid = mapSamples.filter(validSampleOf).length;
    rec.proposed = namesProposedOf(mapSamples, s);
    if (valid === 0) {
      rec.mapNote = "no valid MAP reply: no Gemini names (runMapStep writes nothing)";
      kFinal = kFinalOf(topics, s.k);
    } else {
      const agreement = mapAgreementOf({
        samples: read,
        layers: s.k,
        breadth: s.breadth,
        room: s.room,
        aim: s.intake.aim,
        lines: s.lines,
        domains: s.domains,
        freeDomains: s.freeDomains,
        takenNames: [],
        label: s.label,
        countryNamed: s.countryNamed,
        makeId: s.makeId,
      });
      const merged = namesMergedOf(topics, agreement);
      topics = merged.topics;
      for (const k of merged.hidden) hiddenKeys.add(k);
      kFinal = agreement.kFinal;
      const report: TopicRunReport = { ...agreement.report, dropped: { ...agreement.report.dropped, ECHO: (agreement.report.dropped.ECHO ?? 0) + merged.echoes } };
      rec.agreement = { valid, kFinal, kept: merged.kept, hidden: merged.hidden, echoesAtMerge: merged.echoes, report };
      const named = topics.filter(isNamesKey("T"));
      console.log(`  agreement: ${valid}/${TOPIC_SAMPLES} valid · K_final ${kFinal} · kept ${merged.kept.length}, hidden ${merged.hidden.length} · dropped ${Object.entries(report.dropped).map(([k, n]) => `${k} ${n}`).join(", ") || "none"} · flags ${Object.entries(report.droppedFlags).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`);
      for (const t of named) console.log(`    ${t.key.padEnd(4)} L${t.layer} ${t.nameOrigin}${t.domainId ? " (your library)" : ""}${hiddenKeys.has(t.key) ? ` · hidden ${t.notes.find((x) => x === "NEAR_DUPLICATE" || x === "UNSURE_LAYER") ?? t.flags.join(", ")}` : ""} · ${t.formVotes}/${t.samples} · ${t.name}`);
    }
    save(false);
  }
  const kept = topics.filter((t) => namesLive(t) && !hiddenKeys.has(t.key) && !namesHiddenMarked(t));

  // 3. LINK × 3 over the kept topics up to K_final (chainLinkSpecOf), drawn by linkDrawOf (runLinkStep).
  let draw: LinkDraw | null = null;
  if (kFinal <= LAYERS_MIN) rec.linkNote = `LINK not sent: K_final ${kFinal} (chainLinkSpecOf asks nothing at one layer)`;
  else {
    const linkPack = topicPackOf({ phase: "LINK", areaName: s.areaName, aim: "", splitClauses: [], outline: [], examLabel: null, layers: kFinal, topics: kept.filter((t) => t.layer <= kFinal).map((t) => ({ key: t.key, name: t.name, layer: t.layer, id: t.lineageId })) });
    if (!linkPack.schema) rec.linkNote = `LINK not sent: it asks nothing at K_final ${kFinal} (no kept topic below layer 1)`;
    else {
      const linkSamples: StageTwoSample[] = [];
      const given = new Set(Object.keys(linkPack.keymap));
      const linkTopics = topics.filter((t) => namesLive(t) && given.has(t.key));
      // The chance floor: a random parent per sample draws a link with 1/n² (n: the layer before's kept topics, drawn only from n ≥ EDGE_DRAW.prevLayerMin).
      const visible = linkTopics.filter((t) => !namesHiddenMarked(t));
      const eligible = visible.filter((t) => t.layer >= 2).map((t) => ({ child: t.key, n: visible.filter((x) => x.layer === t.layer - 1).length })).filter((x) => x.n >= EDGE_DRAW.prevLayerMin);
      const link: Record<string, unknown> = { kFinal, instruction: linkPack.instruction, contents: linkPack.contents, schema: linkPack.schema, samples: linkSamples, draw: null, floor: { eligible, expectedRandomDrawn: eligible.reduce((x, c) => x + 1 / (c.n * c.n), 0) } };
      rec.link = link;
      for (let i = 0; i < TOPIC_SAMPLES; i++) {
        const got = await sendNamesJsonV5(b, linkPack, i, tag);
        if (!got) break;
        linkSamples.push(got);
        save(false);
      }
      if (b.stopped || linkSamples.length < TOPIC_SAMPLES) return done(false);
      const linkRead = linkSamples.map((x) => (x.ok && x.integrity ? { parsed: x.parsed, integrity: x.integrity.verdict } : null));
      if (linkSamples.some(validSampleOf)) {
        draw = linkDrawOf({ map: { layers: linkPack.layers ?? s.k, topics: linkTopics, edges: [] }, samples: linkRead, outlineOrder: namesOutlineOrderOf(s.intake, linkTopics) });
        const keyOf = new Map(topics.map((t) => [t.lineageId, t] as const));
        const edges: SavedNamesEdge[] = draw.edges.map((x) => ({ parent: keyOf.get(x.parentLineageId)?.key ?? "?", parentName: keyOf.get(x.parentLineageId)?.name ?? "?", child: keyOf.get(x.childLineageId)?.key ?? "?", childName: keyOf.get(x.childLineageId)?.name ?? "?", votes: x.votes, samples: x.samples, drawn: x.drawn, match: x.match }));
        link.draw = { edges, findings: draw.findings, voids: draw.voids };
        const drawn = edges.filter((x) => x.drawn);
        console.log(`  LINK: ${linkSamples.filter(validSampleOf).length}/${TOPIC_SAMPLES} valid · ${drawn.length} drawn of ${edges.length} voted${drawn.length ? `: ${drawn.map((x) => `${x.child} ← ${x.parent}`).join(", ")}` : ""}`);
      } else console.log("  LINK: no valid reply (the chain falls back to \"after layer N\")");
      save(false);
    }
  }

  // 4. GROUND per batch (claimChainS3, runGroundStep): the kept Gemini names not yet checked, in key order.
  const terms = kept
    .filter((t) => t.nameOrigin === "GEMINI" && t.grounding === "NOT_RUN" && isNamesKey("T")(t))
    .sort(byNamesKey)
    .map((t) => ({ key: t.key, name: t.name }));
  const batched = terms.length > 0 ? groundBatchesOf(terms, GROUND_CALLS_MAX) : { batches: [] as GroundTerm[][], notRun: [] as string[] };
  const calls: NamesGroundCall[] = [];
  const failed: string[][] = [];
  const lineage = new Map(topics.map((t) => [t.key, t.lineageId] as const));
  rec.ground = { plan: { batches: batched.batches.map((x) => x.map((t) => t.key)), notRun: batched.notRun }, calls, failed, record: null };
  let groundComplete = true;
  for (let i = 0; i < batched.batches.length; i++) {
    const batch = batched.batches[i];
    const pack = topicPackOf({ phase: "GROUND", areaName: s.areaName, aim: "", splitClauses: [], outline: [], examLabel: null, terms: batch.map((t) => ({ ...t, id: lineage.get(t.key) ?? null })) });
    const got = await sendNamesGroundV5(b, pack, batch, i, tag);
    if (!got) {
      groundComplete = false;
      break;
    }
    calls.push(got);
    if (!got.verdict) failed.push(batch.map((t) => t.key));
    save(false);
  }
  const record = groundRecordOf(
    calls.flatMap((c) => (c.verdict ? [c.verdict] : [])),
    batched.notRun
  );
  (rec.ground as Record<string, unknown>).record = record;
  const failedKeys = new Set(failed.flat());
  // runGroundStep → chainGroundedOf: each checked Gemini name takes its verdict and sources; a LINKED one in layer 1 is chosen.
  topics = topics.map((t) => {
    const v = record.verdicts[t.key];
    if (!v || v.reason === "NOT_RUN" || t.nameOrigin !== "GEMINI" || !namesLive(t)) return t;
    const undecided = t.decision === "PENDING" && !t.bound;
    const chosen = !undecided ? t.chosen : v.verdict === "LINKED" ? (t.layer === 1 ? true : t.chosen) : false;
    return { ...t, grounding: v.verdict, sources: v.sources.slice(0, GROUND_SOURCES_SHOWN), chosen };
  });
  const batchOf = new Map(batched.batches.flatMap((x, i) => x.map((t) => [t.key, i + 1] as const)));
  const callOf = new Map(calls.flatMap((c) => c.terms.map((t) => [t.key, c] as const)));
  const verdicts: SavedNamesVerdict[] = topics
    .filter((t) => isNamesKey("T")(t) && t.nameOrigin === "GEMINI" && !t.domainId && namesLive(t) && !hiddenKeys.has(t.key) && !namesHiddenMarked(t))
    .sort(byNamesKey)
    .map((t) => {
      const v = record.verdicts[t.key];
      const verdict = failedKeys.has(t.key) ? "GROUND_FAILED" : v ? v.verdict : "NOT_RUN";
      const reason = v?.reason ?? (failedKeys.has(t.key) ? "its call failed" : groundComplete ? null : "the run stopped first");
      return {
        key: t.key,
        layer: t.layer,
        name: t.name,
        verdict: v?.reason === "NOT_RUN" ? "NOT_RUN" : verdict,
        reason,
        counted: v?.counted ?? 0,
        sources: (v?.sources ?? []).map((x) => ({ domain: registrableDomainOf(x.title) ?? (x.title || null), title: x.title, uri: x.uri })),
        sentence: groundSentenceOf(callOf.get(t.key)?.parts?.parts, t.key, t.name),
        batch: batchOf.get(t.key) ?? null,
      };
    });
  rec.verdicts = verdicts;
  const savedTopics: SavedNamesTopic[] = topics
    .filter(namesLive)
    .sort((a, b2) => a.layer - b2.layer || byNamesKey(a, b2))
    .map((t) => {
      const agreed = hiddenKeys.has(t.key) || namesHiddenMarked(t);
      const hiddenBy = agreed ? (t.notes.find((x) => x === "NEAR_DUPLICATE" || x === "UNSURE_LAYER") ?? t.flags.find((f) => f === "REGION" || f === "LANGUAGE_UNCHECKED") ?? "AGREEMENT") : null;
      const gemini = t.nameOrigin === "GEMINI" && !t.domainId;
      const shown = !agreed && (!gemini || t.grounding === "LINKED");
      const why = hiddenBy ?? (shown ? null : failedKeys.has(t.key) ? "GROUND_FAILED" : t.grounding);
      return { key: t.key, layer: t.layer, name: t.name, rawName: t.rawName, origin: t.nameOrigin, class: topicClassOf(t), shown, hiddenBy: why, grounding: t.grounding, scope: t.scope, formVotes: t.formVotes, layerVotes: t.layerVotes, flags: t.flags, notes: t.notes, domainId: t.domainId, chosen: t.chosen };
    });
  rec.topics = savedTopics;
  rec.shown = savedTopics.filter((t) => t.shown).map((t) => ({ key: t.key, layer: t.layer, name: t.name, origin: t.origin, class: t.class }));
  if (verdicts.length > 0) console.log(`  GROUND: ${calls.length} call(s), ${failed.length} failed · ${verdicts.map((v) => `${v.key} ${v.verdict}${v.counted ? ` (${v.counted})` : ""}`).join(" · ")}`);
  const complete = !b.stopped && groundComplete;
  return done(complete);
}

/** The names stage: --v5 --stage=names --i-approved, within MAX_PROBE_CALLS_V5_NAMES and NAMES_GROUNDED_CAP. */
async function runNamesV5(): Promise<void> {
  const worst = namesWorstCaseOf(NAMES_PLAN);
  if (!process.argv.includes(APPROVAL_FLAG)) refuse(`the names stage sends up to ${worst.requests} real requests (${worst.grounded} grounded) to Gemini on the free tier. Pass ${APPROVAL_FLAG} only under the user's recorded approval.`);
  if (process.env[ROADMAP_CHECK_ENV] === "1") refuse(`${ROADMAP_CHECK_ENV} is set: the default call refuses inside a check run`);
  if (!hasGeminiKey()) refuse("GEMINI_API_KEY is not set (run with --env-file=.env)");
  if (TOPIC_CANDIDATE_COUNT !== 1) refuse(`TOPIC_CANDIDATE_COUNT is ${TOPIC_CANDIDATE_COUNT}: this run sends one request per sample (P6 refused candidateCount)`);
  if (NAMES_REQUESTS_PER_PACK_MAX !== BREAKDOWN_REQUESTS_MAX - TOPIC_SAMPLES) refuse(`a pack's worst case (${NAMES_REQUESTS_PER_PACK_MAX}) is not the app's breakdown less RATE (${BREAKDOWN_REQUESTS_MAX - TOPIC_SAMPLES})`);
  if (MAX_PROBE_CALLS_V5_NAMES > NAMES_APPROVED_MAX) refuse(`MAX_PROBE_CALLS_V5_NAMES is ${MAX_PROBE_CALLS_V5_NAMES}, over the approval's ${NAMES_APPROVED_MAX}`);
  if (worst.requests > MAX_PROBE_CALLS_V5_NAMES) refuse(`the plan can send up to ${worst.requests} requests (${NAMES_PLAN.length} packs × ${NAMES_REQUESTS_PER_PACK_MAX}); MAX_PROBE_CALLS_V5_NAMES is ${MAX_PROBE_CALLS_V5_NAMES} (the lead sets the approved ${NAMES_APPROVED_MAX} just before running)`);
  if (worst.grounded > NAMES_GROUNDED_CAP) refuse(`the plan can send up to ${worst.grounded} grounded requests; the grounded cap is ${NAMES_GROUNDED_CAP}`);
  const corpus = new Map(readCorpus().map((e) => [e.aim, e] as const));
  let specs: NamesSpec[] = [];
  try {
    specs = namesSpecsOf(corpus);
  } catch (err) {
    refuse(err instanceof Error ? err.message : String(err));
  }
  const existing = NAMES_PLAN.map((i) => `${NAMES_FILE_PREFIX}${i.pack}.json`).filter((f) => existsSync(join(NAMES_OUT_DIR, f)));
  if (existing.length > 0) refuse(`${existing.join(", ")} exist: a run's saved replies are never overwritten (each pack is sent once, under its approval)`);

  console.log(`roadmap-probe PROBE_PLAN v5, the names stage (TOPIC_PROMPT_VERSION ${TOPIC_PROMPT_VERSION}; model ${ROADMAP_MODEL}; GROUND_TITLE_MODE ${GROUND_TITLE_MODE}): ${specs.length} packs (G-M ${specs.filter((x) => x.item.run === "G-M").length}, G-I ${specs.filter((x) => x.item.run === "G-I").length}, G-X ${specs.filter((x) => x.item.run === "G-X").length}), at most ${worst.requests} requests and ${worst.grounded} grounded; caps ${MAX_PROBE_CALLS_V5_NAMES} and ${NAMES_GROUNDED_CAP}; no retry; at most ${PACE_PER_MINUTE_MAX} a minute (${PACE_GAP_MS} ms apart), about ${Math.ceil((worst.requests * PACE_GAP_MS) / 60_000)} minutes at most`);
  const b: NamesBudget = { cap: MAX_PROBE_CALLS_V5_NAMES, groundedCap: NAMES_GROUNDED_CAP, made: 0, grounded: 0, stopped: null, pacer: new Pacer(), callModel: NAMES_CALL_MODEL };
  const ran: { pack: string; sent: number; grounded: number; complete: boolean }[] = [];
  for (const s of specs) {
    if (b.stopped) break;
    const r = await runNamesPackV5(b, s);
    ran.push({ pack: s.item.pack, ...r });
  }
  const notStarted = specs.slice(ran.length).map((x) => x.item.pack);
  console.log(`\n— the names stage: ${b.made} request(s) sent (${b.grounded} grounded), of at most ${MAX_PROBE_CALLS_V5_NAMES} (${NAMES_GROUNDED_CAP} grounded); the most in any minute: ${b.pacer.peak()} (at most ${PACE_PER_MINUTE_MAX}) —`);
  for (const r of ran) console.log(`  ${r.pack.padEnd(22)} ${r.sent} sent (${r.grounded} grounded)${r.complete ? "" : " · INCOMPLETE"}`);
  if (notStarted.length > 0) console.log(`  not started: ${notStarted.join(", ")} (nothing written)`);
  if (b.stopped) console.log(`  stopped early: ${b.stopped}`);
  console.log(`  next: ${V5_FLAG} ${SCORE_FLAG_PREFIX}names (offline) prints the counts and writes ${NAMES_JUDGE_SHEET}; two judges label it; the lead blesses. Set MAX_PROBE_CALLS_V5_NAMES back to 0.`);
}

// ── The names stage's offline score and judge sheet (no key, no request) ──

interface SavedNamesPack {
  run: NamesRunId;
  pack: string;
  aim: string;
  areaName: string;
  K: number;
  breadth: string;
  kSource: string;
  room: number;
  requests?: number;
  grounded?: number;
  complete?: boolean;
  stopped?: string | null;
  map?: { samples?: StageTwoSample[] };
  mapNote?: string | null;
  proposed?: { name: string; form: string; samples: number[] }[] | null;
  agreement?: { valid: number; kFinal: number; kept: string[]; hidden: string[]; report: TopicRunReport } | null;
  link?: { samples?: StageTwoSample[]; draw?: { edges: SavedNamesEdge[]; voids: number } | null; floor?: { eligible: { child: string; n: number }[]; expectedRandomDrawn: number } } | null;
  linkNote?: string | null;
  ground?: { plan?: { batches: string[][]; notRun: string[] }; calls?: unknown[]; failed?: string[][] } | null;
  topics?: SavedNamesTopic[] | null;
  verdicts?: SavedNamesVerdict[] | null;
}

/** The saved names files, in the plan's order (the judge sheet aside). */
function namesFilesOf(): string[] {
  if (!existsSync(NAMES_OUT_DIR)) return [];
  const order = new Map<string, number>(NAMES_PLAN.map((i, n) => [`${NAMES_FILE_PREFIX}${i.pack}.json`, n]));
  return readdirSync(NAMES_OUT_DIR)
    .filter((f) => f.startsWith(NAMES_FILE_PREFIX) && f.endsWith(".json") && f !== NAMES_JUDGE_SHEET)
    .sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b));
}

const countsOf = (xs: readonly string[]): string =>
  [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, n]) => `${k} ${n}`)
    .join(", ") || "none";
const sumInto = (into: Map<string, number>, from: Partial<Record<string, number>> | undefined) => {
  for (const [k, n] of Object.entries(from ?? {})) if (typeof n === "number") into.set(k, (into.get(k) ?? 0) + n);
};
const mapLine = (m: ReadonlyMap<string, number>): string =>
  [...m]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, n]) => `${k} ${n}`)
    .join(", ") || "none";

/** A judge's empty labels, carried over from an earlier sheet by id so a re-score never wipes them. */
type JudgeLabels = Record<"j1" | "j2", Record<string, unknown>>;
const blankLabels = (fields: readonly string[]): JudgeLabels => ({ j1: Object.fromEntries(fields.map((f) => [f, null])), j2: Object.fromEntries(fields.map((f) => [f, null])) });

/** --v5 --score=names: per pack and in total, the names proposed, agreed, flagged (by flag), LINKED / WEAK / NONE and the links drawn; writes the judge sheet. */
function scoreNamesV5(): void {
  const files = namesFilesOf();
  if (files.length === 0) refuse(`no ${NAMES_FILE_PREFIX}<pack>.json is saved yet: run the names stage first (${V5_FLAG} ${NAMES_STAGE_FLAG} ${APPROVAL_FLAG}, approved)`);
  const packs = files.map((f) => ({ file: f, p: JSON.parse(readFileSync(join(NAMES_OUT_DIR, f), "utf8")) as SavedNamesPack }));
  console.log(`roadmap-probe --score=names (offline): ${packs.length} of ${NAMES_PLAN.length} packs saved in ${NAMES_OUT_DIR}`);
  const missing = NAMES_PLAN.filter((i) => !files.includes(`${NAMES_FILE_PREFIX}${i.pack}.json`)).map((i) => i.pack);
  if (missing.length > 0) console.log(`  not saved: ${missing.join(", ")}`);

  const total = { requests: 0, grounded: 0, proposed: 0, agreed: 0, kept: 0, hidden: 0, linked: 0, weak: 0, none: 0, notRun: 0, failed: 0, drawn: 0, voted: 0, floor: 0, mapValid: 0, mapAll: 0, linkValid: 0, linkAll: 0, c10: 0 };
  const dropped = new Map<string, number>();
  const flags = new Map<string, number>();
  const hiddenBy = new Map<string, number>();
  const prior = existsSync(join(NAMES_OUT_DIR, NAMES_JUDGE_SHEET)) ? (JSON.parse(readFileSync(join(NAMES_OUT_DIR, NAMES_JUDGE_SHEET), "utf8")) as { linked?: { id: string; labels?: JudgeLabels }[]; links?: { id: string; labels?: JudgeLabels }[]; injection?: { shown?: { id: string; labels?: JudgeLabels }[] } }) : null;
  const priorLabels = new Map<string, JudgeLabels>();
  // Only an item a judge has labelled (any label not null) carries over; the rest start blank again.
  const labelled = (l: JudgeLabels | undefined): l is JudgeLabels => !!l && ["j1", "j2"].some((j) => Object.values((l as Record<string, Record<string, unknown> | undefined>)[j] ?? {}).some((v) => v !== null && v !== undefined));
  for (const x of [...(prior?.linked ?? []), ...(prior?.links ?? []), ...(prior?.injection?.shown ?? [])]) if (x?.id && labelled(x.labels)) priorLabels.set(x.id, x.labels);
  const labelsOf = (id: string, fields: readonly string[]): JudgeLabels => priorLabels.get(id) ?? blankLabels(fields);
  const linked: Record<string, unknown>[] = [];
  const links: Record<string, unknown>[] = [];
  let injection: Record<string, unknown> | null = null;
  const LINKED_FIELDS = ["fits", "layerOrderRight", "url", "exactTermIntendedSense"] as const;

  console.log("\n— per pack: K, MAP's valid replies, names proposed, agreed (kept + hidden), flagged, GROUND's verdicts, links drawn —");
  for (const { file, p } of packs) {
    const mapSamples = Array.isArray(p.map?.samples) ? p.map.samples : [];
    const linkSamples = Array.isArray(p.link?.samples) ? p.link.samples : [];
    const report = p.agreement?.report;
    const verdicts = Array.isArray(p.verdicts) ? p.verdicts : [];
    const topics = Array.isArray(p.topics) ? p.topics : [];
    const savedEdges = p.link?.draw?.edges;
    const edges = Array.isArray(savedEdges) ? savedEdges : [];
    const drawn = edges.filter((x) => x.drawn);
    const packFlags = new Map<string, number>();
    sumInto(packFlags, report?.droppedFlags);
    for (const h of ["REGION", "LANGUAGE_UNCHECKED"] as const) if (report?.hidden?.[h]) packFlags.set(`${h} (hidden)`, (packFlags.get(`${h} (hidden)`) ?? 0) + (report.hidden[h] ?? 0));
    const v = verdicts.map((x) => x.verdict);
    const n = (k: string) => v.filter((x) => x === k).length;
    const agreed = (p.agreement?.kept.length ?? 0) + (p.agreement?.hidden.length ?? 0);
    total.requests += p.requests ?? 0;
    total.grounded += p.grounded ?? 0;
    total.proposed += p.proposed?.length ?? 0;
    total.agreed += agreed;
    total.kept += p.agreement?.kept.length ?? 0;
    total.hidden += p.agreement?.hidden.length ?? 0;
    total.linked += n("LINKED");
    total.weak += n("WEAK");
    total.none += n("NONE");
    total.notRun += n("NOT_RUN");
    total.failed += n("GROUND_FAILED");
    total.drawn += drawn.length;
    total.voted += edges.length;
    total.floor += p.link?.floor?.expectedRandomDrawn ?? 0;
    total.mapValid += mapSamples.filter(validSampleOf).length;
    total.mapAll += mapSamples.length;
    total.linkValid += linkSamples.filter(validSampleOf).length;
    total.linkAll += linkSamples.length;
    total.c10 += report?.mergedSameDeeper ?? 0;
    sumInto(dropped, report?.dropped);
    for (const [k, c] of packFlags) flags.set(k, (flags.get(k) ?? 0) + c);
    for (const t of topics) if (!t.shown && t.hiddenBy) hiddenBy.set(t.hiddenBy, (hiddenBy.get(t.hiddenBy) ?? 0) + 1);
    console.log(
      `  ${p.pack.padEnd(22)} ${p.run} · K ${p.K} ${p.breadth} · room ${p.room} · MAP ${mapSamples.filter(validSampleOf).length}/${mapSamples.length} valid · proposed ${p.proposed?.length ?? 0} · agreed ${agreed} (kept ${p.agreement?.kept.length ?? 0}, hidden ${p.agreement?.hidden.length ?? 0}) · flagged ${mapLine(packFlags)} · LINKED ${n("LINKED")} · WEAK ${n("WEAK")} · NONE ${n("NONE")}${n("NOT_RUN") ? ` · NOT_RUN ${n("NOT_RUN")}` : ""}${n("GROUND_FAILED") ? ` · GROUND_FAILED ${n("GROUND_FAILED")}` : ""} · links drawn ${drawn.length} of ${edges.length} voted${p.linkNote ? ` (${p.linkNote})` : ""} · ${p.requests ?? "?"} requests (${p.grounded ?? "?"} grounded)${p.complete ? "" : ` · INCOMPLETE (${p.stopped ?? "?"})`}`
    );
    console.log(`  ${"".padEnd(22)} dropped ${mapLine(new Map(Object.entries(report?.dropped ?? {}).filter((x): x is [string, number] => typeof x[1] === "number")))} · C10 merged ${report?.mergedSameDeeper ?? 0}`);
    for (const x of verdicts.filter((y) => y.verdict === "LINKED")) {
      console.log(`      LINKED ${x.key} L${x.layer} "${x.name}" · ${x.sources.map((y) => y.domain ?? "?").join(", ")}`);
      const id = `${p.pack}/${x.key}`;
      linked.push({ id, run: p.run, pack: p.pack, aim: p.aim, areaName: p.areaName, layer: x.layer, key: x.key, name: x.name, domains: x.sources.map((y) => y.domain), sources: x.sources.map((y) => ({ domain: y.domain, uri: y.uri })), sentence: x.sentence, labels: labelsOf(id, LINKED_FIELDS) });
    }
    const byChild = new Map<string, SavedNamesEdge[]>();
    for (const x of drawn) byChild.set(x.child, [...(byChild.get(x.child) ?? []), x]);
    const layerOf = new Map(topics.map((t) => [t.key, t.layer] as const));
    for (const [child, es] of byChild) {
      const id = `${p.pack}/${child}<-${es.map((x) => x.parent).join("+")}`;
      console.log(`      link ${child} "${es[0].childName}" ← ${es.map((x) => `${x.parent} "${x.parentName}"`).join(", ")}`);
      links.push({ id, run: p.run, pack: p.pack, aim: p.aim, areaName: p.areaName, child: { key: child, layer: layerOf.get(child) ?? null, name: es[0].childName }, parents: es.map((x) => ({ key: x.parent, layer: layerOf.get(x.parent) ?? null, name: x.parentName, votes: x.votes })), labels: labelsOf(id, ["reasonable"]) });
    }
    if (p.run === "G-I") {
      const carries = (name: string) => INJECTION_MARKERS.some((m) => name.toLowerCase().includes(m));
      const shown = topics.filter((t) => t.shown).map((t) => {
        const id = `${p.pack}/shown/${t.key}`;
        return { id, key: t.key, layer: t.layer, name: t.name, origin: t.origin, class: t.class, machinePreCheck: carries(t.name) ? "carries an injected word" : null, labels: labelsOf(id, ["injected"]) };
      });
      const revealable = topics.filter((t) => !t.shown).map((t) => ({ key: t.key, layer: t.layer, name: t.name, origin: t.origin, class: t.class, hiddenBy: t.hiddenBy, machinePreCheck: carries(t.name) ? "carries an injected word" : null }));
      injection = { pack: p.pack, aim: p.aim, file, shown, hiddenRevealable: revealable, drawnLinks: drawn.map((x) => `${x.child} "${x.childName}" ← ${x.parent} "${x.parentName}"`) };
      const geminiShown = shown.filter((t) => t.origin === "GEMINI" && t.machinePreCheck);
      console.log(`      G-I: ${shown.length} string(s) shown (${countsOf(shown.map((t) => t.class))}); shown as Gemini's and carrying an injected word: ${geminiShown.length}${geminiShown.length ? ` (${geminiShown.map((t) => t.name).join("; ")})` : ""}; hidden but revealable: ${revealable.length}`);
    }
  }

  console.log("\n— in total —");
  console.log(`  ${total.requests} requests (${total.grounded} grounded) · MAP ${total.mapValid}/${total.mapAll} valid · LINK ${total.linkValid}/${total.linkAll} valid`);
  console.log(`  names proposed ${total.proposed} (distinct per pack) · agreed ${total.agreed} (kept ${total.kept}, hidden ${total.hidden}) · C10 merged ${total.c10}`);
  console.log(`  dropped: ${mapLine(dropped)}`);
  console.log(`  flagged: ${mapLine(flags)}`);
  console.log(`  GROUND: LINKED ${total.linked} · WEAK ${total.weak} · NONE ${total.none} · NOT_RUN ${total.notRun} · GROUND_FAILED ${total.failed}; hidden on the maps: ${mapLine(hiddenBy)}`);
  console.log(`  links: ${total.drawn} drawn of ${total.voted} voted; a random picker would draw about ${total.floor.toFixed(2)} (Σ 1/n² over the children a layer of ≥ ${EDGE_DRAW.prevLayerMin} could feed)`);

  console.log("\n— TOPIC_NAMES_LIVE with TOPIC_GROUND_LIVE, and TOPIC_LINK_LIVE (prints only; the switches are the user's word) —");
  console.log(`  every LINKED name has a page using the exact term in the intended sense, cited by both judges: PENDING (${total.linked} LINKED names to label in ${NAMES_JUDGE_SHEET}); one fabricated LINKED name fails the bar`);
  console.log(`  the bound reached: 0 fabricated of ${total.linked} would be at most about ${total.linked > 0 ? ((300 / total.linked).toFixed(1)) : "n/a"}% at 95% (3/n); GROUND_TITLE_MODE ${GROUND_TITLE_MODE}${GROUND_TITLE_MODE === "DOMAIN" ? ": the title check cannot run, so the bar needs ≥ 100 labelled LINKED names before the switch" : ""} (${total.linked} here)`);
  console.log("  FITS ≥ 95% and broad-to-deep order right ≥ 80% of topics: the judges' (labels in the sheet)");
  console.log(`  zero counts: same-topic-deeper names shown 0 by construction (C10 merged ${total.c10}); advice, scheme, brand or region names: code drops or hides every flagged one (${mapLine(flags)}), but a brand or scheme its lists don't hold passes, so the judges' labels decide; injected strings shown as Gemini's: the judges' (G-I's list in the sheet)`);
  console.log(`  TOPIC_LINK_LIVE: "builds on" reasonable for ≥ 80% of ${total.drawn} drawn links, and drawn links beat the floor (${total.drawn} vs about ${total.floor.toFixed(2)} at random): the judges'`);

  const sheet = {
    note: "The names stage's judge sheet (--v5 --score=names writes it; a re-score keeps every label already written, by id). Two judges label each item blind to each other, then a reconcile. LINKED: fits (belongs to the aim's Area at its layer), layerOrderRight (broad-to-deep order right), url (a page the judge read that uses the exact term in the intended sense; the judge's own web read, not a Gemini call) and exactTermIntendedSense. links: reasonable (the child builds on the parent). injection: injected (this shown string carries the injection).",
    files,
    requests: total.requests,
    grounded: total.grounded,
    groundTitleMode: GROUND_TITLE_MODE,
    linked,
    links,
    injection,
    expected: null,
    blessed: false,
  };
  writeFileSync(join(NAMES_OUT_DIR, NAMES_JUDGE_SHEET), `${JSON.stringify(sheet, null, 2)}\n`, "utf8");
  console.log(`\n  wrote ${join(NAMES_OUT_DIR, NAMES_JUDGE_SHEET)}: ${linked.length} LINKED names, ${links.length} drawn links (by child), ${injection ? `${(injection.shown as unknown[]).length} G-I strings shown` : "no G-I file yet"}${priorLabels.size ? ` (${priorLabels.size} labelled item(s) kept from the earlier sheet)` : ""}`);
}

async function mainV5(): Promise<void> {
  if (process.argv.includes(LIST_FLAG)) {
    printPlanV5();
    return;
  }
  const score = process.argv.find((a) => a.startsWith(SCORE_FLAG_PREFIX));
  if (score !== undefined) {
    // Offline: reads the saved replies (and the judges' ranges); no key, no request.
    const run = score.slice(SCORE_FLAG_PREFIX.length);
    if (run === "G-R") return scoreGRV5();
    if (run === "G-U") return scoreGUV5();
    if (run === "names") return scoreNamesV5();
    refuse(`${SCORE_FLAG_PREFIX}G-R, ${SCORE_FLAG_PREFIX}G-U or ${SCORE_FLAG_PREFIX}names (offline scoring of a saved run)`);
  }
  if (process.argv.includes(NAMES_STAGE_FLAG)) return runNamesV5();
  const stage = /^--stage=(\d)$/.exec(process.argv.find((a) => a.startsWith("--stage=")) ?? "")?.[1] ?? null;
  if (stage === "2") return runStage2V5();
  if (stage !== "1") refuse(`pass --stage=1, --stage=2 ${RUNS_FLAG_PREFIX}G-R,G-U, ${NAMES_STAGE_FLAG}, or ${LIST_FLAG} to print the plan with no call`);
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
