/**
 * The one structured Gemini call that drafts a roadmap's structure
 * (roadmap.md F5; lane R3). Server-only.
 *
 * Revision 4 (F-R4-17): keys only. The response schema (roadmap-validate
 * keysOnlySchemaOf) holds no free text at all while the gap slot is off:
 * every string is a key issued for the run, and there is no INTEGER or
 * NUMBER field anywhere. ROADMAP_PROMPT_VERSION 4 (contracts §20, item R3):
 * code owns the practice progression, so the reply holds only the unchosen
 * Domains the aim needs (`needs`), the outline's order (`order`) and at
 * most one pick per stage among code's candidates (`picks`); it names no
 * step and no checkpoint. Gemini is switched off until the v4 probe passes
 * (ROADMAP_GEMINI_LIVE, lead only). A failed or missing call is a value
 * ({ok: false}), never a throw: a missing key, a refusal, a timeout, a late
 * rejection, any finishReason but STOP, a blockReason, or text that is not
 * JSON. The SDK's abortSignal does not cancel a request Google has already
 * received (it is still charged), so the cap counts every claimed run.
 *
 * `callModel` is injectable. The default refuses to run while
 * process.env.ROADMAP_CHECK is '1' (every roadmap check sets it), so a check
 * can never reach Gemini.
 *
 * Also here, pure and server-side: the seeds ("Draft again" never repeats
 * them), the daily cap and the 7-day reuse (R4's claim reads them), and the
 * form's free-tier note. Never imports the number-brand or text-brand
 * constructors.
 *
 *   ROADMAP_SYSTEM_INSTRUCTION · systemInstructionFor · buildResponseSchema · seedBaseFor · defaultCallModel · geminiCallModel
 *   draftSamples · SampleResult · draftsCountedToday · draftCapReached · draftsLeftToday · DRAFT_CAP_LINE
 *   reusableRunOf · FREE_TIER_NOTE · freeTierNoteFor · NO_KEY · CALL_REFUSED
 *   runFactsOf · StoredSampleFacts · reusableSamplesOf (fix round: every sample's facts on the run row, failures too)
 *   isReusableRun · SAMPLE_ERROR_MAX (fix round 2: the reuse rule for one run, so R4's reuse filter and
 *   reusableRunOf are one definition; runFactsOf marks every stored sample ok: true or false)
 *   NOTHING_TO_ASK (the fix round, r3: a run whose schema has no property is never sent)
 *
 * Revision 5, lane 10 (contracts §22.4, §22.15; ruling 47): the model phases in code, every TOPIC_* switch false.
 *   - ModelRequest gains a tools variant: `responseSchema` null is plain text (GROUND), `googleSearch` sends
 *     tools [{googleSearch: {}}] with no responseMimeType and no schema, and `candidateCount` (> 1 only after probe P6).
 *   - topicSamples: one JSON phase (RATE, MAP, LINK, DEEPER) over a roadmap-evidence TopicPack, TOPIC_SAMPLES requests
 *     (or one request carrying the candidates); readResponse's JSON rule is unchanged.
 *   - groundSamples: one GROUND wave, one call per pack (a batch of ≤ GROUND_KEYS_PER_CALL terms), ≤ GROUND_PARALLEL
 *     calls, GROUND_ABORT_MS; its own reader over the raw parts (roadmap-grounding groundPartsOf), never readResponse.
 *   - Request counting: RoadmapRun.requests (every request: aborted ones, 429s and quota errors included), read by
 *     requestsToday against ROADMAP_REQUESTS_PER_DAY and GROUNDED_REQUESTS_PER_DAY; draftsCountedToday counts chain
 *     heads only (roadmap-types countsTowardDraftCap reads `phase`, ruling 17).
 *   No model call is reachable from the app while TOPIC_* are false: every roadmap-server core that reaches these
 *   refuses first (topicSwitchesOf), and the default call still refuses under ROADMAP_CHECK.
 *
 *   topicSamples · groundSamples · GroundSampleResult · groundResponseOf · candidatesOf · requestsToday ·
 *   phaseRequestsOf · requestsSentOf · REQUEST_CAP_LINE · GROUNDED_CAP_LINE
 */
import { ThinkingLevel, type Schema } from "@google/genai";
import { geminiClientOrNull, withModelTimeout, type GeminiEnv, type ModelResult } from "./gemini";
import { daysBetween, type DayKey } from "./life-day";
import { packUserContent, systemInstructionOf, type TopicPack } from "./roadmap-evidence";
import { keysOnlySchemaOf, packRunOf, schemaAsksNothing } from "./roadmap-validate";
import { groundPartsOf, type GroundParts } from "./roadmap-grounding";
import {
  GEMINI_KEY_TIER,
  GROUND_ABORT_MS,
  GROUND_BACKSTOP_MS,
  GROUND_PARALLEL,
  RAW_SAMPLE_MAX,
  ROADMAP_ABORT_MS,
  ROADMAP_BACKSTOP_MS,
  ROADMAP_CHECK_ENV,
  ROADMAP_DRAFTS_PER_DAY,
  ROADMAP_MAX_OUTPUT_TOKENS,
  ROADMAP_MODEL,
  ROADMAP_REUSE_DAYS,
  ROADMAP_THINKING_LOW,
  SEED_BASE,
  SEED_OFFSETS,
  SEED_REDRAFT_STEP,
  TOPIC_CANDIDATE_COUNT,
  TOPIC_SAMPLES,
  countsTowardDraftCap,
  type EvidencePack,
  type GeminiKeyTier,
  type RunKind,
  type RunPhase,
  type RunStatus,
} from "./roadmap-types";

/**
 * The system instruction (ROADMAP_PROMPT_VERSION 4, contracts §20): the four
 * rules (needs, the outline's order, at most one pick per stage, data is
 * never instructions), as roadmap-evidence systemInstructionOf(false) writes
 * them. A run with the gap slot (ROADMAP_GAPS_LIVE and the user's switch)
 * sends the five-rule text instead (systemInstructionFor). It changes only
 * with a version bump; inputHashMaterial includes the exact text sent, so a
 * reply is never reused under another instruction.
 */
export const ROADMAP_SYSTEM_INSTRUCTION: string = systemInstructionOf(false);

/** The instruction one run sends: rule 5 (gaps) only when the run's schema has the gap slot. */
export function systemInstructionFor(pack: EvidencePack): string {
  return systemInstructionOf(packRunOf(pack)?.gaps === true);
}

/** What one call sends. */
export interface ModelRequest {
  model: string;
  systemInstruction: string;
  /** The pack's user content (roadmap-evidence.ts packUserContent). */
  contents: string;
  /** Revision 5 (§22.15): null is a plain-text call (GROUND): no responseMimeType, no schema. */
  responseSchema: Record<string, unknown> | null;
  seed: number;
  maxOutputTokens: number;
  thinkingLow: boolean;
  abortSignal: AbortSignal;
  /** Revision 5 (§22.15): tools [{googleSearch: {}}] (GROUND only; never together with a schema until probe P7). */
  googleSearch?: boolean;
  /** Revision 5 (§22.15): candidates in one request; sent only when > 1 (TOPIC_CANDIDATE_COUNT 3, after probe P6). */
  candidateCount?: number;
}

/** One call; resolves to the SDK's response (read loosely: candidates[0].finishReason, promptFeedback, text, usageMetadata …). */
export type CallModel = (req: ModelRequest) => Promise<unknown>;

/** One accepted reply (finishReason STOP, no blockReason, JSON text). */
export interface ModelSample {
  /** The text as returned, ≤ RAW_SAMPLE_MAX. */
  raw: string;
  parsed: unknown;
  finishReason: string | null;
  modelVersion: string | null;
  responseId: string | null;
  usage: unknown;
  latencyMs: number;
}

/**
 * One sample's result: the contract's ModelResult<ModelSample>, whose failure
 * may also carry what the run row records (RoadmapRun.finishReasons,
 * responseIds, usage, latency) and the raw text when there was any.
 * draftSamples always fills them; they are optional so a plain
 * ModelResult failure ({ok: false, error}) is a SampleResult too (R4's fakes).
 */
export type SampleResult =
  | { ok: true; value: ModelSample }
  | {
      ok: false;
      error: string;
      /** The raw finishReason or blockReason value (any string, unknown ones included); null when none came back. */
      finishReason?: string | null;
      modelVersion?: string | null;
      responseId?: string | null;
      usage?: unknown;
      latencyMs?: number;
      /** The reply's text (≤ RAW_SAMPLE_MAX) when the failure came after one arrived (non-JSON, MAX_TOKENS …). */
      raw?: string | null;
    };

/** The error of a call made without a key (geminiClientOrNull returned null). */
export const NO_KEY = "no key";
/** The error of a call refused because ROADMAP_CHECK is '1' (a check can never reach Gemini). */
export const CALL_REFUSED = "refused: ROADMAP_CHECK is set, so no check can reach Gemini";
/**
 * The error of a run whose response schema has no property (roadmap-validate
 * schemaAsksNothing: a Field run with practices off, no outline and every
 * listed Domain chosen). draftSamples never sends it: the API refuses an
 * OBJECT with no properties (400 INVALID_ARGUMENT), and a reply could decide
 * nothing. R4's claim refuses such a run before any row or the cap
 * (packAsksNothing); this is the last guard.
 */
export const NOTHING_TO_ASK = "not sent: the run's schema asks Gemini nothing (no property)";

/**
 * The run's response schema (v4, contracts §20.5): roadmap-validate
 * keysOnlySchemaOf, the one definition the integrity walk checks the reply
 * against. Keys only: `needs` (the unchosen D-keys), `order` (the S-keys,
 * optional since the fix round, r3: absent is the user's own order), `picks`
 * (per slot, one STRING enum of that stage's focus candidates on this run;
 * none required) and, only while ROADMAP_GAPS_LIVE and the user's switch
 * are both on, `gaps` (its items without maxLength: the API refused the
 * string bound on 5 Oct). No `stages`, no practice, step or checkpoint list,
 * no `on`; no INTEGER or NUMBER anywhere; maxItems is a string (the SDK's
 * OpenAPI subset); no enum is ever empty (the property is omitted instead);
 * nothing is required, so a run may ask nothing (draftSamples never sends
 * that one: NOTHING_TO_ASK).
 */
export function buildResponseSchema(pack: EvidencePack): Record<string, unknown> {
  return keysOnlySchemaOf(pack);
}

/**
 * SEED_BASE + SEED_REDRAFT_STEP × the forced redrafts today for this roadmap
 * ("Draft again" never repeats seeds). Any count that grows by at least one
 * with every model call claimed today for this roadmap keeps that promise:
 * R4 passes its modelRunsToday (every Gemini run of the day that called the
 * model, CAPPED and REUSED left out), which is never below the forced
 * redrafts, so a plain draft after a "Draft again" gets fresh seeds too.
 */
export function seedBaseFor(forcedRedraftsToday: number): number {
  const n = Number.isFinite(forcedRedraftsToday) ? Math.max(0, Math.floor(forcedRedraftsToday)) : 0;
  return SEED_BASE + SEED_REDRAFT_STEP * n;
}

const checkSet = (env: GeminiEnv): boolean => env[ROADMAP_CHECK_ENV] === "1" || process.env[ROADMAP_CHECK_ENV] === "1";

/**
 * The real call against `env`'s key: refuses (throws CALL_REFUSED) while
 * ROADMAP_CHECK is '1' in `env` or in process.env, before any client exists;
 * throws NO_KEY when geminiClientOrNull gives null. Both become {ok: false}
 * values in draftSamples. Default temperature. A JSON call (every LEVELS call)
 * sends exactly what it sent before revision 5: no tools, no candidateCount.
 * Revision 5: a null schema sends no responseMimeType (GROUND's plain text),
 * `googleSearch` adds tools [{googleSearch: {}}], and a candidateCount over 1
 * is sent as given.
 */
export function geminiCallModel(env: GeminiEnv = process.env): CallModel {
  return async (req) => {
    if (checkSet(env)) throw new Error(CALL_REFUSED);
    const client = geminiClientOrNull(env);
    if (!client) throw new Error(NO_KEY);
    return client.models.generateContent({
      model: req.model,
      contents: [{ role: "user", parts: [{ text: req.contents }] }],
      config: {
        systemInstruction: req.systemInstruction,
        ...(req.responseSchema != null ? { responseMimeType: "application/json", responseSchema: req.responseSchema as Schema } : {}),
        ...(req.googleSearch === true ? { tools: [{ googleSearch: {} }] } : {}),
        ...(typeof req.candidateCount === "number" && req.candidateCount > 1 ? { candidateCount: Math.floor(req.candidateCount) } : {}),
        seed: req.seed,
        maxOutputTokens: req.maxOutputTokens,
        abortSignal: req.abortSignal,
        ...(req.thinkingLow ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
      },
    });
  };
}

/** The real call (geminiClientOrNull; null → no key). Refuses when ROADMAP_CHECK is '1'. */
export const defaultCallModel: CallModel = (req) => geminiCallModel(process.env)(req);

const asRecord = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** The reply's text: the first candidate's text parts (thought parts skipped), else a plain `text` string. */
function replyText(r: Record<string, unknown>): string | null {
  const candidates = Array.isArray(r.candidates) ? r.candidates : [];
  const content = asRecord(asRecord(candidates[0])?.content);
  const parts = Array.isArray(content?.parts) ? content.parts : null;
  if (parts) {
    let text = "";
    let any = false;
    for (const p of parts) {
      const part = asRecord(p);
      if (!part || typeof part.text !== "string" || part.thought === true) continue;
      text += part.text;
      any = true;
    }
    if (any) return text;
  }
  // A plain object (or the SDK's own getter) may carry the text directly.
  try {
    const t = (r as { text?: unknown }).text;
    return typeof t === "string" ? t : null;
  } catch {
    return null;
  }
}

/** The text capped at RAW_SAMPLE_MAX UTF-8 bytes, cut on a character boundary. */
export function capRaw(text: string): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= RAW_SAMPLE_MAX) return text;
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, RAW_SAMPLE_MAX)).replace(/�+$/u, "");
}

type Failure = Required<Extract<SampleResult, { ok: false }>>;

function failure(error: string, at: Partial<Omit<Failure, "ok" | "error">> & { latencyMs: number }): Failure {
  return {
    ok: false,
    error,
    finishReason: at.finishReason ?? null,
    modelVersion: at.modelVersion ?? null,
    responseId: at.responseId ?? null,
    usage: at.usage ?? null,
    latencyMs: at.latencyMs,
    raw: at.raw ?? null,
  };
}

/**
 * Reads one response. Accepted only when candidates[0].finishReason is
 * exactly 'STOP', promptFeedback.blockReason is absent and the text parses as
 * JSON; every other finishReason (MAX_TOKENS, SAFETY, RECITATION, LANGUAGE,
 * BLOCKLIST, PROHIBITED_CONTENT, SPII, OTHER, any unknown value, or none)
 * fails with the raw value recorded.
 */
export function readResponse(response: unknown, latencyMs: number): SampleResult {
  const r = asRecord(response);
  if (!r) return failure("empty response", { latencyMs });
  const candidates = Array.isArray(r.candidates) ? r.candidates : [];
  const c0 = asRecord(candidates[0]);
  const finishReason = c0 ? str(c0.finishReason) : null;
  const meta = {
    modelVersion: str(r.modelVersion),
    responseId: str(r.responseId),
    usage: r.usageMetadata ?? null,
    latencyMs,
  };
  const text = replyText(r);
  const raw = text == null ? null : capRaw(text);
  const blockReason = asRecord(r.promptFeedback)?.blockReason;
  if (blockReason != null && blockReason !== "") {
    const value = typeof blockReason === "string" ? blockReason : JSON.stringify(blockReason);
    return failure(`blocked: ${value}`, { ...meta, finishReason: finishReason ?? value, raw });
  }
  if (finishReason !== "STOP") {
    return failure(`finishReason ${finishReason ?? "missing"}`, { ...meta, finishReason, raw });
  }
  if (text == null || text.trim() === "") return failure("no text", { ...meta, finishReason, raw });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return failure("non-JSON", { ...meta, finishReason, raw });
  }
  return { ok: true, value: { raw: raw ?? "", parsed, finishReason, ...meta } };
}

/** What draftSamples takes besides the pack. `model`, `thinkingLow` and the timeouts exist for the probe and the checks. */
export interface DraftSamplesOpts {
  callModel?: CallModel;
  seedBase: number;
  model?: string;
  thinkingLow?: boolean;
  abortMs?: number;
  backstopMs?: number;
  /**
   * Revision 5 (lane 10), topicSamples only: the requests a JSON phase sends, 1..TOPIC_SAMPLES (default TOPIC_SAMPLES).
   * The approved probe sends 1 a planned call (PROBE_PLAN v5); the server never passes it.
   */
  samples?: number;
}

/**
 * ROADMAP_SAMPLES calls in parallel (1 in v1; at most SEED_OFFSETS.length),
 * each wrapped as withModelTimeout(Promise.resolve().then(call),
 * ROADMAP_BACKSTOP_MS) with an AbortSignal.timeout(ROADMAP_ABORT_MS), so a
 * missing key, a synchronous throw, a timeout or a late rejection becomes a
 * value and never throws. Sample i uses seed seedBase + SEED_OFFSETS[i].
 * A run whose schema asks nothing (schemaAsksNothing) is never sent: every
 * sample is {ok: false, error: NOTHING_TO_ASK} and callModel is not called.
 */
export async function draftSamples(pack: EvidencePack, n: number, opts: DraftSamplesOpts): Promise<SampleResult[]> {
  const call = opts.callModel ?? defaultCallModel;
  const samples = Math.min(SEED_OFFSETS.length, Math.max(1, Number.isFinite(n) ? Math.floor(n) : 1));
  const contents = packUserContent(pack);
  const responseSchema = buildResponseSchema(pack);
  if (schemaAsksNothing(responseSchema)) return Array.from({ length: samples }, () => failure(NOTHING_TO_ASK, { latencyMs: 0 }));
  const systemInstruction = systemInstructionFor(pack);
  const backstop = opts.backstopMs ?? ROADMAP_BACKSTOP_MS;
  const abortMs = opts.abortMs ?? ROADMAP_ABORT_MS;
  const one = async (i: number): Promise<SampleResult> => {
    const req: ModelRequest = {
      model: opts.model ?? ROADMAP_MODEL,
      systemInstruction,
      contents,
      responseSchema,
      seed: opts.seedBase + SEED_OFFSETS[i],
      maxOutputTokens: ROADMAP_MAX_OUTPUT_TOKENS,
      thinkingLow: opts.thinkingLow ?? ROADMAP_THINKING_LOW,
      abortSignal: AbortSignal.timeout(abortMs),
    };
    const started = Date.now();
    const res: ModelResult<unknown> = await withModelTimeout(Promise.resolve().then(() => call(req)), backstop);
    const latencyMs = Date.now() - started;
    if (!res.ok) return failure(res.error, { latencyMs });
    return readResponse(res.value, latencyMs);
  };
  return Promise.all(Array.from({ length: samples }, (_, i) => one(i)));
}

// ── Revision 5, lane 10: the topic phases (contracts §22.4, §22.15) ─────────

/**
 * One response per candidate: a reply carrying more than one candidate
 * (candidateCount > 1, only after probe P6) is read as that many responses,
 * each holding one candidate with the reply's promptFeedback, modelVersion,
 * responseId and usage, so readResponse reads each one exactly as it reads a
 * single reply. A reply with at most one candidate comes back as itself.
 */
export function candidatesOf(response: unknown): unknown[] {
  const r = asRecord(response);
  const candidates = r && Array.isArray(r.candidates) ? r.candidates : [];
  if (!r || candidates.length <= 1) return [response];
  return candidates.map((c) => ({ candidates: [c], promptFeedback: r.promptFeedback, modelVersion: r.modelVersion, responseId: r.responseId, usageMetadata: r.usageMetadata }));
}

/** The requests one JSON phase sends: TOPIC_SAMPLES, or 1 when one request carries the candidates (candidateCount > 1). */
export function phaseRequestsOf(candidateCount: number = TOPIC_CANDIDATE_COUNT, samples: number = TOPIC_SAMPLES): number {
  const n = Number.isFinite(samples) ? Math.max(1, Math.min(TOPIC_SAMPLES, Math.floor(samples))) : TOPIC_SAMPLES;
  return Number.isFinite(candidateCount) && candidateCount > 1 ? 1 : n;
}

/**
 * The requests a set of samples actually sent (RoadmapRun.requests): every sample that went out, failures included
 * (an abort, a 429 or a quota error still counts: Google may have received it); a sample never sent (NOTHING_TO_ASK)
 * is no request. With candidateCount > 1 the samples share one request.
 */
export function requestsSentOf(results: readonly SampleResult[], candidateCount: number = 1): number {
  const sent = (Array.isArray(results) ? results : []).filter((r) => !!r && !(r.ok === false && r.error === NOTHING_TO_ASK)).length;
  if (sent === 0) return 0;
  return Number.isFinite(candidateCount) && candidateCount > 1 ? 1 : sent;
}

/**
 * One JSON phase's samples (RATE, MAP, LINK, DEEPER; §22.15) over its TopicPack: TOPIC_SAMPLES calls in parallel on
 * seedBase + SEED_OFFSETS[i] (`opts.samples` fewer, for the approved probe), or, with candidateCount > 1, one call
 * carrying that many candidates (candidatesOf), padded with failures to the samples asked. Each call is the pack's
 * instruction, contents and exact schema, ROADMAP_ABORT_MS and the backstop, as draftSamples sends; readResponse's
 * JSON rule is unchanged. A pack with no schema, a schema asking nothing, or a GROUND pack is never sent (every sample
 * NOTHING_TO_ASK; groundSamples sends GROUND). Never throws.
 */
export async function topicSamples(pack: TopicPack, opts: DraftSamplesOpts & { candidateCount?: number }): Promise<SampleResult[]> {
  const call = opts.callModel ?? defaultCallModel;
  const samples = Math.max(1, Math.min(TOPIC_SAMPLES, SEED_OFFSETS.length, Number.isFinite(opts.samples) ? Math.floor(opts.samples as number) : TOPIC_SAMPLES));
  const schema = pack && typeof pack === "object" ? pack.schema : null;
  if (!pack || pack.phase === "GROUND" || schema == null || schemaAsksNothing(schema) || typeof pack.contents !== "string" || pack.contents === "") {
    return Array.from({ length: samples }, () => failure(NOTHING_TO_ASK, { latencyMs: 0 }));
  }
  const cc = Number.isFinite(opts.candidateCount) ? Math.floor(opts.candidateCount as number) : TOPIC_CANDIDATE_COUNT;
  const candidates = cc > 1 ? Math.min(cc, samples) : 1;
  const backstop = opts.backstopMs ?? ROADMAP_BACKSTOP_MS;
  const abortMs = opts.abortMs ?? ROADMAP_ABORT_MS;
  const send = async (i: number): Promise<{ results: SampleResult[] }> => {
    const req: ModelRequest = {
      model: opts.model ?? ROADMAP_MODEL,
      systemInstruction: pack.instruction,
      contents: pack.contents,
      responseSchema: schema,
      seed: opts.seedBase + SEED_OFFSETS[i],
      maxOutputTokens: ROADMAP_MAX_OUTPUT_TOKENS,
      thinkingLow: opts.thinkingLow ?? ROADMAP_THINKING_LOW,
      abortSignal: AbortSignal.timeout(abortMs),
      ...(candidates > 1 ? { candidateCount: candidates } : {}),
    };
    const started = Date.now();
    const res: ModelResult<unknown> = await withModelTimeout(Promise.resolve().then(() => call(req)), backstop);
    const latencyMs = Date.now() - started;
    if (!res.ok) return { results: [failure(res.error, { latencyMs })] };
    return { results: candidatesOf(res.value).map((one) => readResponse(one, latencyMs)) };
  };
  if (candidates > 1) {
    const { results } = await send(0);
    const out = results.slice(0, samples);
    // A failed request (or fewer candidates than asked) fails every missing sample with the request's own error.
    const why = results.length === 1 && !results[0].ok ? results[0] : null;
    while (out.length < samples) out.push(why && !why.ok ? { ...why } : failure("fewer candidates than asked", { latencyMs: 0 }));
    return out;
  }
  const all = await Promise.all(Array.from({ length: samples }, (_, i) => send(i)));
  return all.map((x) => x.results[0] ?? failure("no reply", { latencyMs: 0 }));
}

/**
 * One GROUND call's result (§22.15): `parts` is roadmap-grounding groundPartsOf over the reply (candidates[0]'s parts
 * exactly as returned, thought and tool parts kept, and its groundingMetadata), null when there were none; `raw` is
 * those parts as JSON, capped at RAW_SAMPLE_MAX (`parts.truncated` then holds: such a run is never reused). Never
 * readResponse, never JSON-parsed as a reply. `response` (lane 10's optional field) is the reply itself, in memory
 * only, for groundVerdictOf; it is never stored or logged.
 */
export interface GroundSampleResult {
  ok: boolean;
  parts: GroundParts | null;
  error: string | null;
  latencyMs: number;
  raw: string | null;
  response?: unknown;
}

/**
 * The minimal reply groundVerdictOf reads, rebuilt from GroundParts (when the reply itself is not at hand): the
 * first candidate's parts, finishReason and groundingMetadata, and usageMetadata.toolUsePromptTokenCount.
 */
export function groundResponseOf(parts: GroundParts | null | undefined): unknown {
  if (!parts) return null;
  return {
    candidates: [{ content: { parts: [...parts.parts] }, finishReason: parts.finishReason, ...(parts.metadata ? { groundingMetadata: parts.metadata } : {}) }],
    ...(parts.toolUsePromptTokenCount != null ? { usageMetadata: { toolUsePromptTokenCount: parts.toolUsePromptTokenCount } } : {}),
  };
}

/** Reads one GROUND reply: a blockReason or any finishReason but STOP fails (the parts still recorded); no parts fails closed. */
function readGroundResponse(response: unknown, latencyMs: number): GroundSampleResult {
  const r = asRecord(response);
  if (!r) return { ok: false, parts: null, error: "empty response", latencyMs, raw: null };
  const c0 = asRecord((Array.isArray(r.candidates) ? r.candidates : [])[0]);
  const finishReason = c0 ? str(c0.finishReason) : null;
  let parts: GroundParts | null = null;
  try {
    parts = groundPartsOf(response);
  } catch {
    parts = null;
  }
  const rawParts = asRecord(c0?.content)?.parts;
  let raw: string | null = null;
  let cut = false;
  if (Array.isArray(rawParts)) {
    const text = JSON.stringify(rawParts);
    raw = capRaw(text);
    cut = raw.length < text.length;
  }
  const kept = parts ? { ...parts, truncated: parts.truncated || cut } : null;
  const blockReason = asRecord(r.promptFeedback)?.blockReason;
  if (blockReason != null && blockReason !== "") {
    return { ok: false, parts: kept, error: `blocked: ${typeof blockReason === "string" ? blockReason : JSON.stringify(blockReason)}`, latencyMs, raw, response };
  }
  if (finishReason !== "STOP") return { ok: false, parts: kept, error: `finishReason ${finishReason ?? "missing"}`, latencyMs, raw, response };
  if (!kept) return { ok: false, parts: null, error: "no parts", latencyMs, raw, response };
  return { ok: true, parts: kept, error: null, latencyMs, raw, response };
}

/**
 * One GROUND wave (§22.15, ruling 47): one call per pack (each a batch of at most GROUND_KEYS_PER_CALL terms), at
 * most GROUND_PARALLEL calls, in parallel; each a plain-text call with tools [{googleSearch: {}}] and no schema,
 * GROUND_ABORT_MS with the GROUND_BACKSTOP_MS backstop. The results are index-aligned with `packs`: a pack past
 * GROUND_PARALLEL, or one that is not a GROUND pack with contents, is not sent (NOTHING_TO_ASK). Never throws.
 */
export async function groundSamples(packs: readonly TopicPack[], opts: DraftSamplesOpts): Promise<GroundSampleResult[]> {
  const call = opts.callModel ?? defaultCallModel;
  const list = Array.isArray(packs) ? packs : [];
  const backstop = opts.backstopMs ?? GROUND_BACKSTOP_MS;
  const abortMs = opts.abortMs ?? GROUND_ABORT_MS;
  const notSent = (error: string): GroundSampleResult => ({ ok: false, parts: null, error, latencyMs: 0, raw: null });
  return Promise.all(
    list.map(async (pack, i): Promise<GroundSampleResult> => {
      if (i >= GROUND_PARALLEL) return notSent(`${NOTHING_TO_ASK} (past GROUND_PARALLEL in one wave)`);
      if (!pack || pack.phase !== "GROUND" || typeof pack.contents !== "string" || pack.contents === "") return notSent(NOTHING_TO_ASK);
      const req: ModelRequest = {
        model: opts.model ?? ROADMAP_MODEL,
        systemInstruction: pack.instruction,
        contents: pack.contents,
        responseSchema: null,
        googleSearch: true,
        seed: opts.seedBase + SEED_OFFSETS[i % SEED_OFFSETS.length],
        maxOutputTokens: ROADMAP_MAX_OUTPUT_TOKENS,
        thinkingLow: opts.thinkingLow ?? ROADMAP_THINKING_LOW,
        abortSignal: AbortSignal.timeout(abortMs),
      };
      const started = Date.now();
      const res: ModelResult<unknown> = await withModelTimeout(Promise.resolve().then(() => call(req)), backstop);
      const latencyMs = Date.now() - started;
      if (!res.ok) return { ok: false, parts: null, error: res.error, latencyMs, raw: null };
      return readGroundResponse(res.value, latencyMs);
    })
  );
}

/** The GROUND wave's requests sent (each pack sent is one grounded request, failures included). */
export function groundRequestsSentOf(results: readonly GroundSampleResult[]): number {
  return (Array.isArray(results) ? results : []).filter((r) => !!r && !(r.ok === false && typeof r.error === "string" && r.error.startsWith(NOTHING_TO_ASK))).length;
}

// ── The cap and the reuse (read by R4's claim; F8 steps 3–4) ───────────────

/** The fields of a RoadmapRun row the cap and the reuse read. */
export interface RunLike {
  kind: RunKind;
  status: RunStatus;
  /** The life day the run was claimed. */
  day: DayKey;
  inputHash: string | null;
  /** Revision 5 (§22.15): the run's phase; null or absent on a LEVELS run (a chain head for the draft cap). */
  phase?: RunPhase | null;
  /** Revision 5 (§22.15): the model requests the run made (RoadmapRun.requests); absent reads 0. */
  requests?: number;
}

/**
 * Runs that count toward today's cap: the runs of `today` that
 * roadmap-types countsTowardDraftCap counts, the cap's one definition (fix
 * round): every GEMINI run but a REUSED one. RUNNING, OK, PARTIAL, FAILED and
 * CAPPED all count (the spec's literal rule; R4's claimPlanOf and its SQL
 * guard `kind = 'GEMINI' AND status <> 'REUSED'` count the same). A failed
 * call, or one that timed out at our end, may still have reached Google; a
 * CAPPED row is only written once the count is already at the cap, so
 * counting it changes no answer and keeps every reader on one rule.
 * Revision 5 (ruling 17): chain heads only — a run with no phase (LEVELS) or
 * phase RATE; MAP, LINK, GROUND and DEEPER count against the request caps
 * only (requestsToday). The SQL guard GEMINI_RUNS_BELOW reads the same.
 */
export function draftsCountedToday(runs: readonly RunLike[], today: DayKey): number {
  return runs.filter((r) => r.day === today && countsTowardDraftCap(r)).length;
}

/** True once today's counted Gemini runs reach ROADMAP_DRAFTS_PER_DAY. */
export function draftCapReached(runs: readonly RunLike[], today: DayKey): boolean {
  return draftsCountedToday(runs, today) >= ROADMAP_DRAFTS_PER_DAY;
}

/** "4 of 5 drafts left today". */
export function draftsLeftToday(runs: readonly RunLike[], today: DayKey): number {
  return Math.max(0, ROADMAP_DRAFTS_PER_DAY - draftsCountedToday(runs, today));
}

/** The capped claim's answer (a CAPPED run is written beside it). */
export const DRAFT_CAP_LINE = `${ROADMAP_DRAFTS_PER_DAY} drafts today — build from your numbers or write it yourself.`;

// ── Revision 5, lane 10: the request caps (contracts §22.15; ruling 66) ─────

/**
 * Today's model requests across the user's goals (§22.15): RoadmapRun.requests summed over the runs claimed on
 * `today` (every phase and every LEVELS run: from lane 10 every run row the server writes sets it; a row with none
 * reads 0), and `grounded`, the GROUND rows' alone (ruling 18). Read against ROADMAP_REQUESTS_PER_DAY and
 * GROUNDED_REQUESTS_PER_DAY; the REQUESTS_BELOW guard sums the same in SQL. Takes any row with a day, a phase and
 * a requests count (a RoadmapRun row as roadmap-server reads it), so a RunLike passes too. Never throws.
 */
export function requestsToday(
  runs: readonly (Pick<RunLike, "day"> & { phase?: RunPhase | string | null; requests?: number | null })[],
  today: DayKey
): { requests: number; grounded: number } {
  let requests = 0;
  let grounded = 0;
  for (const r of Array.isArray(runs) ? runs : []) {
    if (!r || typeof r !== "object" || r.day !== today) continue;
    const n = typeof r.requests === "number" && Number.isFinite(r.requests) ? Math.max(0, Math.floor(r.requests)) : 0;
    requests += n;
    if (r.phase === "GROUND") grounded += n;
  }
  return { requests, grounded };
}

/** A topic step refused at ROADMAP_REQUESTS_PER_DAY (roadmap-server REQUESTS_CAPPED; a CAPPED row is written beside it). */
export const REQUEST_CAP_LINE = "Today's Gemini requests are used up. Write the topics yourself.";
/** A GROUND wave refused at GROUNDED_REQUESTS_PER_DAY (roadmap-server GROUNDED_CAPPED): its names stay hidden. */
export const GROUNDED_CAP_LINE = "Today's web checks are used up. Names stay hidden until tomorrow.";

/**
 * The reuse rule for one run (fix round 2: the one definition R4's reuse
 * filter calls): a GEMINI run with status OK and the same, non-empty
 * inputHash, claimed on a readable life day 0 to ROADMAP_REUSE_DAYS days
 * before today. A run whose day can't be read is never reused (its age is
 * not a number). Takes a row whose kind and status are plain strings (R4's
 * RunRec), as roadmap-types countsTowardDraftCap does. Never throws.
 */
export function isReusableRun(
  r: (Pick<RunLike, "day" | "inputHash"> & { kind: RunKind | string; status: RunStatus | string }) | null | undefined,
  inputHash: string,
  today: DayKey
): boolean {
  if (!r || typeof r !== "object" || r.kind !== "GEMINI" || r.status !== "OK") return false;
  if (typeof inputHash !== "string" || !inputHash || r.inputHash !== inputHash) return false;
  let age: number;
  try {
    age = daysBetween(r.day, today);
  } catch {
    return false;
  }
  return Number.isFinite(age) && age >= 0 && age <= ROADMAP_REUSE_DAYS;
}

/**
 * The run a request may reuse: the newest run isReusableRun accepts. A reuse
 * skips only the model call: validation, fitting and feasibility re-run on
 * today's data with the stored replies and keymap (reusableSamplesOf: the
 * accepted replies only). `force` ("Draft again") never reuses (R4 skips this
 * call). R4 tries every run isReusableRun accepts, newest first, until one
 * still builds a plan; this gives the first it would try.
 */
export function reusableRunOf<T extends RunLike>(runs: readonly T[], inputHash: string, today: DayKey): T | null {
  let best: T | null = null;
  for (const r of Array.isArray(runs) ? runs : []) {
    if (!isReusableRun(r, inputHash, today)) continue;
    if (!best || r.day > best.day) best = r;
  }
  return best;
}

// ── The run row's facts (F8 runDraftCore's persist; fix round) ──────────────

/**
 * One sample as RoadmapRun.samples stores it. A failed sample is stored too
 * (`ok: false`, its error, and the reply's text when one arrived, e.g. a
 * MAX_TOKENS reply cut short), so a SAFETY, RECITATION or MAX_TOKENS failure
 * keeps its facts. The reuse path reads only `ok !== false` entries
 * (reusableSamplesOf).
 */
export interface StoredSampleFacts {
  /** false on a failed sample; true on an accepted one (runFactsOf writes it); absent on rows stored before the fix round (accepted replies). */
  ok?: boolean;
  /** The text as returned, capped by capRaw (≤ RAW_SAMPLE_MAX UTF-8 bytes); "" when none arrived. */
  raw: string;
  finishReason: string | null;
  modelVersion: string | null;
  responseId: string | null;
  latencyMs: number | null;
  /** A failed sample's error ("finishReason SAFETY", "timed out after …", "no key"), at most SAMPLE_ERROR_MAX characters. */
  error?: string;
}

/** A stored sample's error is cut to this many characters (the row keeps the facts, not an essay). */
export const SAMPLE_ERROR_MAX = 300;

/** The RoadmapRun columns one draft's samples fill: samples, usage, modelVersion, responseIds, finishReasons, latencyMs. */
export interface RunFacts {
  samples: StoredSampleFacts[];
  /** One entry per sample, failures included (null when the sample had none). */
  usage: unknown[];
  /** The first sample's model version that came back, accepted or not. */
  modelVersion: string | null;
  responseIds: string[];
  /** Every finishReason (or blockReason) that came back, failures included. */
  finishReasons: string[];
  /** The slowest sample's latency, failures included (the "usually about N s" median reads it); null with none. */
  latencyMs: number | null;
}

/**
 * The run row's facts from every SampleResult, failed ones included (Lens 3:
 * runDraftCore kept only the accepted samples, so an all-failed run lost its
 * finishReason, responseId, usage, latency and text). A plain
 * {ok: false, error} (R4's fakes) stores its error with null facts. Each
 * stored sample carries `ok` (true or false), so a reader never has to infer
 * it; the one definition R4's runDraftCore persists (fix round 2).
 */
export function runFactsOf(results: readonly SampleResult[]): RunFacts {
  const samples: StoredSampleFacts[] = [];
  const usage: unknown[] = [];
  const responseIds: string[] = [];
  const finishReasons: string[] = [];
  let modelVersion: string | null = null;
  let latency: number | null = null;
  for (const r of Array.isArray(results) ? results : []) {
    if (!r || typeof r !== "object") continue;
    const f = r.ok
      ? { raw: r.value.raw, finishReason: r.value.finishReason, modelVersion: r.value.modelVersion, responseId: r.value.responseId, latencyMs: r.value.latencyMs, usage: r.value.usage }
      : { raw: r.raw ?? "", finishReason: r.finishReason ?? null, modelVersion: r.modelVersion ?? null, responseId: r.responseId ?? null, latencyMs: r.latencyMs ?? null, usage: r.usage ?? null };
    const lat = typeof f.latencyMs === "number" && Number.isFinite(f.latencyMs) ? f.latencyMs : null;
    samples.push({
      ok: r.ok === true,
      raw: capRaw(typeof f.raw === "string" ? f.raw : ""),
      finishReason: f.finishReason,
      modelVersion: f.modelVersion,
      responseId: f.responseId,
      latencyMs: lat,
      ...(r.ok ? {} : { error: String(r.error ?? "failed").slice(0, SAMPLE_ERROR_MAX) }),
    });
    usage.push(f.usage ?? null);
    if (f.responseId) responseIds.push(f.responseId);
    if (f.finishReason) finishReasons.push(f.finishReason);
    if (modelVersion == null && f.modelVersion) modelVersion = f.modelVersion;
    if (lat != null) latency = latency == null ? lat : Math.max(latency, lat);
  }
  return { samples, usage, modelVersion, responseIds, finishReasons, latencyMs: latency };
}

/** The stored samples a reuse may validate again: entries with a string `raw` that are not marked `ok: false` (a failed sample's text is never a reply). */
export function reusableSamplesOf(stored: unknown): StoredSampleFacts[] {
  if (!Array.isArray(stored)) return [];
  return stored.filter((s): s is StoredSampleFacts => !!s && typeof s === "object" && typeof (s as StoredSampleFacts).raw === "string" && (s as StoredSampleFacts).ok !== false);
}

// ── The form's free-tier note (F2 field 13; question 5) ─────────────────────

/** Shown on the intake form under the privacy line while this server's key is on the free tier. */
export const FREE_TIER_NOTE = "This server's Gemini key is on Google's free tier, so Google may use what drafting sends to improve its products.";

/** The free-tier note when the server has a key and GEMINI_KEY_TIER is 'FREE'; null otherwise (with 'PAID' the line is absent). */
export function freeTierNoteFor(hasKey: boolean, tier: GeminiKeyTier = GEMINI_KEY_TIER): string | null {
  return hasKey && tier === "FREE" ? FREE_TIER_NOTE : null;
}
