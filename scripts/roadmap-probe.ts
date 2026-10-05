/**
 * The roadmap's one approved probe of the real model, for revision 4's
 * keys-only drafting (roadmap-rev4.md F-R4-23; the user approved about 10
 * free-tier calls on synthetic packs). LEAD ONLY. Never in CI, never in a
 * check, never run by a lane, and never imports the checks' no-model guard.
 *
 *   npx tsx --env-file=.env scripts/roadmap-probe.ts --i-approved
 *
 * It runs after the rehearsal, as PROGRESS.md orders. What it sends: only the
 * reply corpus's synthetic packs (scripts/fixtures/roadmap-corpus/*.json, read
 * through corpus.ts with their v3 intake): made-up aims, Areas, Domain names
 * and counts. It never reads the user's library or the database (no Prisma,
 * no loader), so Google receives corpus text only.
 *
 * Exactly MAX_PROBE_CALLS (10) requests, one per planned call (PROBE_PLAN),
 * whatever ROADMAP_SAMPLES says:
 *   1–8  keys-only, one each on actuarial-probability, ielts, guitar,
 *        run-10k, lose-8kg (the knee constraint), care-routine, python-cert
 *        and vietnamese-japanese; the actuarial call also has the gap slot on
 *        (one word-rich pack: an outline, chosen and unchosen Domains, and
 *        library titles grounding must ignore);
 *   9    new-subject ("Sail a dinghy solo"), the gap slot on;
 *   10   keys-only with thinking LOW, on actuarial-probability.
 * Rev 3's alternate-model call is dropped to stay within 10. The gap slot is
 * forced on through the evidence pack's lead-only `gapsLive` override:
 * ROADMAP_GAPS_LIVE stays false in the app.
 *
 * Each reply is saved, unedited, as scripts/fixtures/roadmap-corpus/
 * probe-<pack>.json (the thinking call as probe-actuarial-probability-
 * thinking.json) with raw, parsed, finishReason, usage, latencyMs,
 * modelVersion, its integrity, `validated` (the ValidatedDraft, ids from a
 * counter), `expected: null` and `blessed: false`, and empty `labels` for the
 * lead: per `needs` key whether the aim plausibly needs that Domain, per
 * stage whether its practice kinds fit, whether the arrangement keeps
 * earlier stages for what later ones build on, and per gap string its claim
 * classes and whether it names a real area. The lead then sets `expected`
 * and blessed: true; roadmap-model-check re-validates every blessed fixture
 * and deep-compares it (--bless rewrites the snapshot after review).
 *
 * It prints: the CLEAN count and every violation code; the outline lines
 * left out, the duplicates and the needs counts; whether the API honoured
 * `enum` together with `nullable` on the checkpoint; latency, tokens and
 * whether thinking was accepted; and the go/no-go lines for both switches
 * (ROADMAP_GEMINI_LIVE: format, H1, outline omissions, lastStageOnly
 * placements and the lose-8kg constraint result here, `needs` precision and
 * practice fit from the lead's labels; ROADMAP_GAPS_LIVE: at least
 * GAPS_LIVE_MIN_LABELLED real gap strings, which these calls can't reach). It
 * changes nothing in src/: the lead edits roadmap-types.ts by hand.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hasGeminiKey } from "../src/lib/gemini";
import { GAPS_LIVE_MIN_LABELLED, ROADMAP_CHECK_ENV, ROADMAP_GAPS_LIVE, ROADMAP_GEMINI_LIVE, ROADMAP_MODEL, SEED_BASE, type ValidatedDraft } from "../src/lib/roadmap-types";
import { buildResponseSchema, draftSamples, type SampleResult } from "../src/lib/roadmap-model";
import { integrityOf, validateKeysOnly, type KeysOnlyContext } from "../src/lib/roadmap-validate";
import { catalogEntryOf, catalogLabelOf, catalogOriginOf } from "../src/lib/roadmap-catalog";
import { CORPUS_DIR, keysOnlyContextOf, packOf, readCorpus, type CorpusEntry } from "./fixtures/roadmap-corpus/corpus";

/** The approval covers 10 calls; this is the hard ceiling. */
const MAX_PROBE_CALLS = 10;
/** Requests per planned call: exactly 1, never ROADMAP_SAMPLES. The ceiling counts requests sent. */
const REQUESTS_PER_CALL = 1;
const APPROVAL_FLAG = "--i-approved";

interface PlannedCall {
  pack: string;
  /** The gap slot forced on (the lead's override of ROADMAP_GAPS_LIVE, for this call only). */
  gapsLive: boolean;
  thinkingLow: boolean;
  file: string;
}

/** F-R4-23's exactly 10 requests, in order. */
const PROBE_PLAN: readonly PlannedCall[] = [
  { pack: "actuarial-probability", gapsLive: true, thinkingLow: false, file: "probe-actuarial-probability.json" },
  { pack: "ielts", gapsLive: false, thinkingLow: false, file: "probe-ielts.json" },
  { pack: "guitar", gapsLive: false, thinkingLow: false, file: "probe-guitar.json" },
  { pack: "run-10k", gapsLive: false, thinkingLow: false, file: "probe-run-10k.json" },
  { pack: "lose-8kg", gapsLive: false, thinkingLow: false, file: "probe-lose-8kg.json" },
  { pack: "care-routine", gapsLive: false, thinkingLow: false, file: "probe-care-routine.json" },
  { pack: "python-cert", gapsLive: false, thinkingLow: false, file: "probe-python-cert.json" },
  { pack: "vietnamese-japanese", gapsLive: false, thinkingLow: false, file: "probe-vietnamese-japanese.json" },
  { pack: "new-subject", gapsLive: true, thinkingLow: false, file: "probe-new-subject.json" },
  { pack: "actuarial-probability", gapsLive: false, thinkingLow: true, file: "probe-actuarial-probability-thinking.json" },
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

async function main() {
  if (!process.argv.includes(APPROVAL_FLAG)) {
    refuse(`this sends ${MAX_PROBE_CALLS} real requests to Gemini on the free tier. Pass ${APPROVAL_FLAG} only under the approval recorded in roadmap-rev4.md (F-R4-23).`);
  }
  if (process.env[ROADMAP_CHECK_ENV] === "1") refuse(`${ROADMAP_CHECK_ENV} is set: the default call refuses inside a check run`);
  if (!hasGeminiKey()) refuse("GEMINI_API_KEY is not set (run with --env-file=.env)");
  if (PROBE_PLAN.length * REQUESTS_PER_CALL > MAX_PROBE_CALLS) refuse("the plan is over the approved ceiling");

  const corpus = new Map(readCorpus().map((e) => [e.aim, e]));
  for (const call of PROBE_PLAN) {
    const e = corpus.get(call.pack);
    if (!e) refuse(`no corpus pack named ${call.pack}`);
    assertSynthetic(e);
  }
  console.log(`roadmap-probe (v3, keys only): ${PROBE_PLAN.length} call(s), at most ${MAX_PROBE_CALLS}; ROADMAP_GEMINI_LIVE is ${ROADMAP_GEMINI_LIVE}, ROADMAP_GAPS_LIVE is ${ROADMAP_GAPS_LIVE}`);
  for (const c of PROBE_PLAN) console.log(`  ${c.pack}${c.gapsLive ? " · gap slot on" : ""}${c.thinkingLow ? " · thinking LOW" : ""} → ${c.file}`);

  mkdirSync(CORPUS_DIR, { recursive: true });
  const outcomes: { call: PlannedCall; result: SampleResult; validated: ValidatedDraft | null; ctx: KeysOnlyContext }[] = [];
  let made = 0;
  for (const call of PROBE_PLAN) {
    if (made + REQUESTS_PER_CALL > MAX_PROBE_CALLS) break;
    const e = corpus.get(call.pack) as CorpusEntry;
    const pack = packOf(e, { gapsLive: call.gapsLive });
    made += REQUESTS_PER_CALL;
    const [result] = await draftSamples(pack, REQUESTS_PER_CALL, { seedBase: SEED_BASE, model: ROADMAP_MODEL, thinkingLow: call.thinkingLow });
    let n = 0;
    const ctx = keysOnlyContextOf(e, pack, { makeId: () => `probe-${++n}` });
    const integrity = result.ok ? integrityOf(result.value.parsed, buildResponseSchema(pack)) : null;
    const validated = result.ok ? validateKeysOnly(result.value.parsed, ctx) : null;
    outcomes.push({ call, result, validated, ctx });
    const finish = result.ok ? result.value.finishReason : result.finishReason ?? null;
    const latency = result.ok ? result.value.latencyMs : result.latencyMs ?? null;
    console.log(`\n[${made}] ${call.pack}${call.gapsLive ? " (gaps)" : ""}${call.thinkingLow ? " (thinking LOW)" : ""}: ${result.ok ? "OK" : `FAILED (${result.error})`} · finishReason ${finish ?? "none"} · ${latency} ms · ${usageOf(result)}`);

    const needs = Array.isArray((result.ok ? (result.value.parsed as { needs?: unknown }) : null)?.needs) ? ((result.ok ? (result.value.parsed as { needs: unknown[] }) : { needs: [] }).needs as unknown[]) : [];
    const stages = Object.keys(((result.ok ? (result.value.parsed as { stages?: object }) : null)?.stages ?? {}) as object);
    const gaps = result.ok && Array.isArray((result.value.parsed as { gaps?: unknown }).gaps) ? ((result.value.parsed as { gaps: unknown[] }).gaps.filter((g) => typeof g === "string") as string[]) : [];
    const saved = {
      aim: call.pack,
      pack: call.pack,
      gapsLive: call.gapsLive,
      thinkingLow: call.thinkingLow,
      note: "A real reply, unedited. The lead fills `labels`, sets `expected` (CLEAN, SALVAGED or REJECTED) and blessed: true; roadmap-model-check then re-validates and deep-compares it.",
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
      expected: null,
      blessed: false,
      labels: {
        needs: Object.fromEntries(needs.filter((k): k is string => typeof k === "string").map((k) => [k, { plausible: null }])),
        stages: Object.fromEntries(stages.map((s) => [s, { practiceFit: null }])),
        arrangementKeepsOrder: null,
        gaps: gaps.map((text) => ({ text, claimClasses: [], realArea: null })),
      },
    };
    const file = join(CORPUS_DIR, call.file);
    writeFileSync(file, `${JSON.stringify(saved, null, 2)}\n`, "utf8");
    console.log(`  saved ${file}`);
    if (integrity) console.log(`  integrity: ${integrity.verdict}${integrity.violations.length ? ` · ${integrity.violations.map((x) => `${x.code} ${x.path}`).join(" · ")}` : ""}`);
    if (validated) {
      const dropped = new Map<string, number>();
      for (const d of validated.report.dropped) dropped.set(d.code, (dropped.get(d.code) ?? 0) + 1);
      console.log(`  outline lines left out: ${validated.uncoveredSyllabus.length ? validated.uncoveredSyllabus.map((i) => `S${i + 1}`).join(", ") : "none"} · duplicates ${dropped.get("DUPLICATE") ?? 0} · needs ${(validated.needs ?? []).length}`);
      console.log(`  drops: ${[...dropped].map(([k, c]) => `${k} ${c}`).join(" · ") || "none"} · gaps shown ${(validated.gaps ?? []).length}, not shown ${validated.gapsHidden ?? 0}`);
      const cp = stages.map((s) => (result.ok ? ((result.value.parsed as { stages: Record<string, { checkpoint?: unknown }> }).stages[s]?.checkpoint ?? "(absent)") : null));
      console.log(`  checkpoints (enum with nullable): ${cp.map((c) => (c === null ? "null" : String(c))).join(", ")}`);
    }
  }

  // ── The summary and the two gates (printed only; the lead decides and edits roadmap-types.ts by hand) ──
  const keysOnly = outcomes.filter((o) => o.call.pack !== "new-subject");
  const verdicts = keysOnly.map((o) => o.validated?.report.integrity?.verdict ?? "FAILED");
  const codes = new Map<string, number>();
  for (const o of outcomes) for (const v of o.validated?.report.integrity?.violations ?? []) codes.set(v.code, (codes.get(v.code) ?? 0) + 1);
  const latencies = outcomes.filter((o) => o.result.ok).map((o) => (o.result.ok ? o.result.value.latencyMs : 0)).sort((a, b) => a - b);
  const finishes = new Map<string, number>();
  for (const o of outcomes) {
    const f = (o.result.ok ? o.result.value.finishReason : o.result.finishReason) ?? "none";
    finishes.set(f, (finishes.get(f) ?? 0) + 1);
  }
  console.log(`\n— summary (${made} request(s)) —`);
  console.log(`  ${ROADMAP_MODEL}: ${verdicts.filter((v) => v === "CLEAN").length} CLEAN, ${verdicts.filter((v) => v === "SALVAGED").length} SALVAGED, ${verdicts.filter((v) => v === "REJECTED").length} REJECTED, ${verdicts.filter((v) => v === "FAILED").length} failed, of ${keysOnly.length} keys-only replies`);
  console.log(`  violation codes: ${[...codes].map(([k, c]) => `${k} ${c}`).join(" · ") || "none"}`);
  console.log(`  finishReasons: ${[...finishes].map(([k, c]) => `${k} ${c}`).join(" · ")}`);
  if (latencies.length > 0) console.log(`  latency: median ${latencies[Math.floor(latencies.length / 2)]} ms, max ${latencies[latencies.length - 1]} ms (ROADMAP_ABORT_MS is 35000)`);
  const schemaRejected = outcomes.some((o) => !o.result.ok && /schema|400|INVALID_ARGUMENT|nullable|enum/i.test(o.result.error));
  console.log(`  the schema (enum with nullable on the checkpoint, string bounds): ${schemaRejected ? "REJECTED by the API — see the errors above" : "accepted"}`);
  const thinking = outcomes.find((o) => o.call.thinkingLow);
  if (thinking) console.log(`  thinking LOW: ${thinking.result.ok ? "accepted — ROADMAP_THINKING_LOW may be set to true" : `not accepted (${thinking.result.error}) — keep ROADMAP_THINKING_LOW false`}`);

  const formatOk = verdicts.every((v) => v === "CLEAN" || v === "SALVAGED");
  const closure = keysOnly.flatMap((o) => (o.validated ? closureProblems(o.validated, o.ctx).map((p) => `${o.call.pack}: ${p}`) : []));
  const omissions = keysOnly.filter((o) => (o.ctx.intake.syllabus?.lines ?? []).length > 0).reduce((s, o) => s + (o.validated?.uncoveredSyllabus.length ?? 0), 0);
  const early = keysOnly.reduce((s, o) => s + (o.validated?.report.dropped.filter((d) => d.code === "AIM_STEP_EARLY").length ?? 0), 0);
  const knee = keysOnly.find((o) => o.call.pack === "lose-8kg");
  const kneeOk =
    !!knee &&
    (knee.ctx.pack as { run?: { practiceKinds?: string[] } }).run?.practiceKinds?.every((k) => !catalogEntryOf(k)?.keywords.some((w) => /run|jog|sprint|jump|impact/.test(w))) === true &&
    knee.validated?.sessionPicks?.decision === "PENDING";
  console.log("\n— go/no-go: ROADMAP_GEMINI_LIVE (drafting) —");
  console.log(`  every keys-only reply CLEAN or SALVAGED: ${formatOk ? "yes" : "NO"}`);
  console.log(`  H1 closure on every reply: ${closure.length === 0 ? "yes" : `NO (${closure.slice(0, 5).join("; ")})`} — run npm run roadmap-model:check for the taint half once the replies are blessed`);
  console.log(`  outline lines left out, on the packs with an outline: ${omissions} (gate: 0)`);
  console.log(`  lastStageOnly kinds placed early: ${early} (gate: at most 1 over the run)`);
  console.log(`  lose-8kg: running and high-impact kinds excluded and the confirm raised: ${kneeOk ? "yes" : "NO"}`);
  console.log("  needs precision ≥ 0.8 and practice fit ≥ 80% of stages: from the lead's labels in each probe-*.json (pending until labelled)");
  console.log(`  verdict here: ${formatOk && closure.length === 0 && omissions === 0 && early <= 1 && kneeOk ? "format and content checks pass; ROADMAP_GEMINI_LIVE may turn on only once the labels pass too" : "NO-GO: ROADMAP_GEMINI_LIVE stays false"}`);
  const gapStrings = outcomes.reduce((s, o) => s + (o.result.ok && Array.isArray((o.result.value.parsed as { gaps?: unknown }).gaps) ? ((o.result.value.parsed as { gaps: unknown[] }).gaps.length) : 0), 0);
  console.log("\n— go/no-go: ROADMAP_GAPS_LIVE (area suggestions) —");
  console.log(`  real gap strings from this run: ${gapStrings}; the gate needs at least GAPS_LIVE_MIN_LABELLED (${GAPS_LIVE_MIN_LABELLED}) labelled, with 0 claim-labelled strings shown: ROADMAP_GAPS_LIVE stays false (more calls need the user's approval)`);
  console.log("\n  next: label each probe-*.json, set expected and blessed: true, and run npm run roadmap-model:check (then --bless after review).");
}

main().catch((e) => {
  console.log(`roadmap-probe: stopped — ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
