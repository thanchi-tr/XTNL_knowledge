/**
 * The reply corpus, read for revision 4 (roadmap-rev4.md F-R4-17, F-R4-23;
 * lane R3). One definition of how a corpus pack becomes a v3 run, shared by
 * scripts/roadmap-model-check.ts (which imports _no-model first), the lead's
 * scripts/roadmap-probe.ts (which never does), and any other reader (R7's
 * hostile check may use it). It never imports _no-model itself and never
 * calls a model.
 *
 * Each scripts/fixtures/roadmap-corpus/<aim>.json keeps its rev-3 fields
 * unchanged (`input` with the v2 intake, `library`, `drafts`: the v2 replies,
 * which the hostile corpus reuses as payloads) and gains a `v3` block:
 *   intake    the revision-4 intake fields merged over input.intake: depth,
 *             dateMode, exam, examLabel (when the v2 intake had none),
 *             examDay (never sent), suggestAreas, newDomainNames, and
 *             lineDomains (merged into syllabus.lineDomains)
 *   probe     true when the v3 probe sends this pack (F-R4-23's 8 + new-subject)
 *   replies   canned keys-only replies, each with its expected verdict and
 *             the facts roadmap-model-check pins (uncovered lines, needs,
 *             exclusions, the session-picks confirm, drop codes)
 * new-subject.json is v3 only (drafts: []).
 *
 * v4 (contracts §20, ROADMAP_PROMPT_VERSION 4; item R3): each pack also
 * gains a `v4` block (append-only; the hostile bar's pack hash never reads
 * it): canned v4 replies ({needs?, order?, picks?, gaps?}), each with its
 * expected verdict and the facts roadmap-model-check pins (needs, the
 * outline's order and the lines appended, the valid picks, exclusions, the
 * session-picks confirm, drop codes, gaps). The v3 replies stay: they are
 * read with the legacy v3 schema (keysOnlySchemaV3Of), as the probe's
 * blessed v3 replies are.
 *
 * probe-<aim>.json files are the probe's real replies (F-R4-23): raw, parsed,
 * finishReason, usage, latency, modelVersion, integrity, `validated` (the
 * ValidatedDraft, ids from a counter), `blessed`, `expected` (the lead's
 * labelled verdict) and the lead's labels. Only blessed ones are regression
 * fixtures (readProbeFixtures).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { domainName, yoursText, type Intake, type IntegrityVerdict, type PlanWindow } from "../../../src/lib/roadmap-types";
import { buildEvidencePack, type EvidenceDomain, type EvidenceInput, type EvidencePackV3 } from "../../../src/lib/roadmap-evidence";
import { examAnswerOf, type KeysOnlyContext, type ValidateDomain } from "../../../src/lib/roadmap-validate";

export const CORPUS_DIR = __dirname;

/** What a canned v3 reply must give (roadmap-model-check pins each field given). */
export interface V3Expect {
  verdict: IntegrityVerdict;
  /** Outline line indices placed in no stage. */
  uncovered?: number[];
  /** Domain ids `needs` (and exact gap matches) resolve to. */
  needs?: string[];
  /** Kinds the constraint filter leaves out of the run. */
  excluded?: string[];
  /** The session-picks confirm is raised. */
  sessionPicks?: boolean;
  /** report.dropped codes, counted. */
  dropped?: Record<string, number>;
  /** Shown gap names, in order. */
  gapsShown?: string[];
  /** Gap strings not shown (hidden or dropped). */
  gapsHidden?: number;
}

export interface V3Reply {
  id: string;
  about: string;
  reply: unknown;
  expect: V3Expect;
}

/** What a canned v4 reply must give (roadmap-model-check pins each field given). */
export interface V4Expect {
  verdict: IntegrityVerdict;
  /** Domain ids `needs` (and exact gap matches) resolve to. */
  needs?: string[];
  /** The outline's order (KeysOnlyDraft.order.order): line indices, every issued line once. */
  order?: number[];
  /** The lines the reply left out, appended in the user's order. */
  appended?: number[];
  /** Gemini's order moved a line from the user's own (KeysOnlyDraft.reordered; false with no `order`, which is optional). */
  reordered?: boolean;
  /** The valid picks (KeysOnlyDraft.picks), slot → kind. */
  picks?: Record<string, string>;
  /** Kinds the constraint filter leaves out of the run. */
  excluded?: string[];
  /** The session-picks confirm is raised. */
  sessionPicks?: boolean;
  /** report.dropped codes (GAP entries aside), counted. */
  dropped?: Record<string, number>;
  /** Shown gap names, in order. */
  gapsShown?: string[];
  /** Gap strings not shown (hidden or dropped). */
  gapsHidden?: number;
}

export interface V4Reply {
  id: string;
  about: string;
  reply: unknown;
  expect: V4Expect;
}

/** The v3 intake fields a pack sets over its v2 intake. */
export type V3IntakePatch = Partial<Pick<Intake, "depth" | "dateMode" | "exam" | "examLabel" | "examDay" | "suggestAreas" | "newDomainNames" | "constraints">> & {
  lineDomains?: (string | null)[];
};

interface RawFixture {
  aim: string;
  about?: string;
  probe?: boolean;
  today: string;
  areaFieldId: string | null;
  input: { intake: Intake; areaName: string; domains: EvidenceDomain[]; windows?: PlanWindow[] };
  library: ValidateDomain[];
  drafts?: unknown[];
  v3?: { probe?: boolean; about?: string; intake?: V3IntakePatch; replies?: V3Reply[] };
  v4?: { about?: string; replies?: V4Reply[] };
}

/** One corpus pack as a v3 run's input. */
export interface CorpusEntry {
  file: string;
  aim: string;
  about: string;
  /** The v3 probe sends this pack. */
  probe: boolean;
  today: string;
  areaFieldId: string | null;
  /** input with the v3 intake merged (the v2 input stays in `v2`). */
  input: EvidenceInput;
  library: ValidateDomain[];
  replies: V3Reply[];
  /** The canned v4 replies (contracts §20). */
  repliesV4: V4Reply[];
  v2: RawFixture;
}

/** The v2 intake with a v3 patch merged (lineDomains into syllabus.lineDomains). */
export function v3IntakeOf(intake: Intake, patch: V3IntakePatch | undefined): Intake {
  if (!patch) return { ...intake };
  const { lineDomains, ...rest } = patch;
  const merged: Intake = { ...intake, ...rest };
  if (lineDomains && merged.syllabus) merged.syllabus = { ...merged.syllabus, lineDomains: [...lineDomains] };
  return merged;
}

/** Every pack (not the probe's replies), sorted by file name. */
export function readCorpus(dir: string = CORPUS_DIR): CorpusEntry[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("probe-"))
    .sort()
    .map((file) => {
      const fx = JSON.parse(readFileSync(join(dir, file), "utf8")) as RawFixture;
      const intake = v3IntakeOf(fx.input.intake, fx.v3?.intake);
      return {
        file,
        aim: fx.aim,
        about: fx.v3?.about ?? fx.about ?? "",
        probe: fx.v3?.probe === true,
        today: fx.today,
        areaFieldId: fx.areaFieldId,
        input: { intake, areaName: fx.input.areaName, domains: fx.input.domains },
        library: fx.library ?? [],
        replies: fx.v3?.replies ?? [],
        repliesV4: fx.v4?.replies ?? [],
        v2: fx,
      };
    });
}

/**
 * A pack's v3 evidence pack; `gapsLive` is the lead's override (the probe's suggestions-on calls, the checks);
 * `pickStages` (the fix round, r3) limits the pick enums to the stages the plan's ladder reads a pick for
 * (ladder.ts corpusLadderOf(...).pickStages, as R4 passes pickStagesOf over its dated ladder).
 */
export function packOf(entry: Pick<CorpusEntry, "input">, opts: { gapsLive?: boolean; pickStages?: readonly string[] | null } = {}): EvidencePackV3 {
  return buildEvidencePack({ ...entry.input, ...(opts.gapsLive !== undefined ? { gapsLive: opts.gapsLive } : {}), ...(opts.pickStages ? { pickStages: opts.pickStages } : {}) });
}

/**
 * The KeysOnlyContext for a pack's run, as R4 builds it: R = the chosen
 * Domains (named ones included), every listed Domain's row name, the run's
 * slots, and the branded fill (yoursText for the aim and the exam's name,
 * domainName for each Domain row).
 */
export function keysOnlyContextOf(
  entry: Pick<CorpusEntry, "input" | "library">,
  pack: EvidencePackV3,
  opts: { makeId: () => string; version?: number; required?: readonly string[]; gapSourceExclude?: readonly string[] }
): KeysOnlyContext {
  const intake = entry.input.intake;
  const rows = new Map<string, string>();
  for (const d of entry.library ?? []) rows.set(d.id, d.name);
  for (const d of entry.input.domains ?? []) rows.set(d.id, d.name);
  const listed = Object.values(pack.keymap.domains);
  const domainNames: Record<string, string> = {};
  const brands: Record<string, ReturnType<typeof domainName>> = {};
  for (const id of listed) {
    const name = rows.get(id);
    if (name == null) continue;
    domainNames[id] = name;
    brands[id] = domainName({ id, name });
  }
  const exam = examAnswerOf(intake) ? yoursText("USER", "PENDING", intake.examLabel as string) : null;
  return {
    pack,
    intake,
    required: opts.required ?? [...intake.domainIds],
    domainNames,
    slots: pack.run.slots,
    version: opts.version ?? 1,
    makeId: opts.makeId,
    fill: { aim: yoursText("USER", "PENDING", intake.aim), exam, domains: brands },
    areaName: entry.input.areaName,
    gapSourceExclude: opts.gapSourceExclude ?? [],
  };
}

/** A probe reply saved by scripts/roadmap-probe.ts (F-R4-23; v4: contracts §20). */
export interface ProbeFixture {
  file: string;
  aim: string;
  /** The prompt version it was drafted under: 4 for a v4 probe reply; absent on the v3 run's (5 Oct), which are v3. */
  promptVersion?: number;
  /** The pack it was sent with (the corpus pack's aim) and whether the gap slot was on. */
  pack: string;
  gapsLive: boolean;
  thinkingLow: boolean;
  raw: string | null;
  parsed: unknown;
  finishReason: string | null;
  usage: unknown;
  latencyMs: number | null;
  modelVersion: string | null;
  integrity: unknown;
  validated: unknown;
  /** The lead's labelled verdict (CLEAN, SALVAGED or REJECTED), once labelled. */
  expected: IntegrityVerdict | null;
  blessed: boolean;
  labels?: unknown;
  /** v4: code's plan with the reply's picks (the progression, stage by stage), saved for the labellers. */
  plan?: unknown;
}

/** Every probe-<aim>.json, sorted. */
export function readProbeFixtures(dir: string = CORPUS_DIR): ProbeFixture[] {
  return readdirSync(dir)
    .filter((f) => f.startsWith("probe-") && f.endsWith(".json"))
    .sort()
    .map((file) => ({ file, ...(JSON.parse(readFileSync(join(dir, file), "utf8")) as Omit<ProbeFixture, "file">) }));
}
