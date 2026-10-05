/**
 * The hostile corpus generator (roadmap-rev4.md F-R4-22; lane R7).
 *
 * Pure: a mulberry32 PRNG with fixed seeds, no I/O, no clock, no model. The
 * check reads the corpus packs (scripts/fixtures/roadmap-corpus/*.json, the
 * 11 packs plus new-subject.json when R3 has written it, and any blessed
 * probe-<aim>.json) and passes them in; everything else is code. The whole
 * output is pinned by its sha256 and its family counts (pin.json); changing
 * it needs `--bless`.
 *
 * Every case carries its ground truth, decided by construction:
 *   A  valid-random (5,000)    issued keys and catalog kinds placed at random; CLEAN, or SALVAGED
 *                              where an array was made longer than its maxItems with valid values
 *   B  type confusion (1,000)  numbers, booleans, nulls, arrays for scalars, 10,000-element arrays,
 *                              200-deep nesting, a 1 MB string; a null on the nullable checkpoint is
 *                              CLEAN, an over-long array of valid keys SALVAGED, the rest REJECTED
 *   C  key forgery (2,000)     confusables, out-of-range keys, another run's keys (CLEAN when valid
 *                              here), forged kinds, prototype names as values and as property names
 *                              at every depth
 *   D  text smuggling (2,000)  every string slot and extra property filled with payloads (the
 *                              corpus's 205 author-written strings among them), each case with a
 *                              unique marker word of 8+ letters; suggestions off, so all REJECTED
 *   E  gap claims              ~1,700 replies (suggestions on) and ≥ 20,000 gap strings, each
 *                              labelled claim (13 classes) or control (a phrase of the user's text);
 *                              plus the "clash" sub-class: names GROUNDED in the user's own
 *                              constraints that negate them (every cue of both parsers), which only
 *                              a flag can hide, on runs derived last (no other family sees them);
 *                              and the resource patterns no class reached (an ISBN, a year), last too;
 *                              and (fix round 2) the "one-source" sub-classes, last of all: claim and
 *                              about-you names GROUNDED in a line the user wrote, and a phrase of the
 *                              user's outline with an invented name, each with the flag that alone
 *                              must hide it once the layers above it are off
 *   EG recombined (≥ 2,000)    names built only from the packs' own words, labelled claim or not and
 *                              by provenance: one source in order, several, library-only, reordered
 *   K  constraints (≥ 1,500)   phrasings × every BODY and CARE kind × English, Vietnamese, Japanese;
 *                              and (fix round 3) the "release" sub-class, last: a clause that clears
 *                              one activity before a later exclusion, and one phrasing per entry of
 *                              the release lists, each with the kinds it must keep as well as exclude
 *   M  metamorphic             M1–M7 base/variant pairs over checkLabel and groundingOf
 *   F  real-reply mutations    100 per blessed probe reply (none until F-R4-23's probe is blessed)
 *
 * Each reply's expected verdict is the one its construction gives under
 * F-R4-20; reference.ts (an independent reading of F-R4-20) must agree with
 * every label or generation throws, so the bar's ground truth never drifts.
 * Ambiguous constructions the spec doesn't settle are never generated: an
 * invalid item only past maxItems, and a gap string longer than GAP_NAME_MAX.
 */
import { CATALOG, catalogKindsFor, catalogTemplateOf, catalogEntryOf, type CatalogKey, type CatalogTrack } from "../../../src/lib/roadmap-catalog";
import {
  ENGLISH_FUNCTION_WORDS,
  GAP_NAME_MAX,
  GAP_WORDS_MAX,
  GAP_WORD_CHARS_MAX,
  PACK_MAX_DOMAINS,
  SYLLABUS_MAX_LINES,
  TRACK_STAGE_KEYS,
  gateStagesTo,
  type AimDepth,
  type Intake,
  type PlanWindow,
} from "../../../src/lib/roadmap-types";
import { stem } from "../../../src/lib/synonyms";
import * as G from "./grammar";
import { referenceVerdict, type RefVerdict } from "./reference";

// ═══ The PRNG ════════════════════════════════════════════════════════════════

/** mulberry32: a 32-bit seeded PRNG (deterministic on every platform). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The fixed seeds, one per family. */
export const HOSTILE_SEEDS = { A: 0xa11ce, B: 0xb0b, C: 0xc0ffee, D: 0xd00d, E: 0xe1e1, EG: 0xe6e6, K: 0x4b4b, M: 0x3e3e, F: 0xf00f, MARK: 0x5eed } as const;

/** The spec's family counts (F-R4-22, Constants): the generator meets each exactly or as a floor. */
export const FAMILY_TARGETS = { A: 5000, B: 1000, C: 2000, D: 2000, E_REPLIES: 1700, E_STRINGS: 20000, EG: 2000, K: 1500, F_PER_REPLY: 100 } as const;

class Rng {
  private readonly next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  float(): number {
    return this.next();
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(xs: readonly T[]): T {
    if (xs.length === 0) throw new Error("hostile generator: pick from an empty list");
    return xs[this.int(xs.length)];
  }
  /** k distinct items in a random order (k clamped to the list). */
  sample<T>(xs: readonly T[], k: number): T[] {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, Math.max(0, Math.min(k, a.length)));
  }
}

// ═══ Inputs: the corpus packs (read by the check, passed in) ════════════════

export interface HostileDomain {
  id: string;
  name: string;
  fieldId: string;
  cards: number;
  atSix: number;
  atTop: number;
  chosen: boolean;
}

export interface LibraryEntry {
  id: string;
  name: string;
  fieldId: string;
  fieldName?: string;
  cards?: number;
  titles?: string[];
  tags?: string[];
}

/** One scripts/fixtures/roadmap-corpus/<aim>.json, as the check read it (`file` is its basename). */
export interface CorpusPack {
  file: string;
  today: string;
  input: {
    intake: Intake;
    areaName: string;
    domains: HostileDomain[];
    windows: PlanWindow[];
  };
  library?: LibraryEntry[];
  drafts?: { id?: string; reply?: unknown }[];
  /** R3's revision-4 block (roadmap-corpus/corpus.ts): the intake fields its v3 run sets over the v2 intake. Read only for a probe reply's run (family F). */
  v3?: { intake?: Partial<Intake> & { lineDomains?: (string | null)[] } };
}

/** One scripts/fixtures/roadmap-corpus/probe-<aim>.json (F-R4-23); only blessed ones seed family F. */
export interface ProbeFixture {
  file: string;
  aim: string;
  /** The corpus pack it was sent with (defaults to aim), and whether the gap slot was on (F-R4-23). */
  pack?: string;
  gapsLive?: boolean;
  parsed: unknown;
  blessed: boolean;
  /** The lead's labelled verdict of the real reply. */
  expected?: string | null;
  /** The lead's labels; `gaps` [{text, claimClasses, realArea}] are H3-real's. */
  labels?: { gaps?: { text?: unknown; claimClasses?: unknown; realArea?: unknown }[] } | null;
}

// ═══ Runs ════════════════════════════════════════════════════════════════════

export type GroundKind = "AIM" | "CONSTRAINTS" | "EXAM" | "OUTLINE" | "AREA" | "DOMAIN" | "NAMED";

export interface ListedDomain {
  key: string;
  id: string;
  name: string;
  chosen: boolean;
}

/** One run context: an intake, the keys issued for it, and the schema F-R4-17 builds from them. */
export interface HostileRun {
  id: string;
  pack: string;
  variant: string;
  today: string;
  intake: Intake;
  areaName: string;
  domains: HostileDomain[];
  windows: PlanWindow[];
  library: LibraryEntry[];
  field: boolean;
  track: CatalogTrack;
  /** The aim reads as English (non-English aims hide every gap: LANGUAGE_UNCHECKED). */
  english: boolean;
  listed: ListedDomain[];
  sKeys: { key: string; index: number }[];
  slots: string[];
  enums: { needs: string[]; lines: string[]; practice: string[]; step: string[]; checkpoint: string[]; on: string[] };
  /** The gap slot is issued (ROADMAP_GAPS_LIVE and the user's switch, both on, for this run). */
  gaps: boolean;
  /** The constraint exclusions this run's enums leave out (hand-labelled per pack; K tests the filter itself). */
  excluded: string[];
  schema: Record<string, unknown>;
  /** R: the required Domain ids (the chosen ones). */
  required: string[];
  /** Grounding sources: only text the user typed or chose (F-R4-19). */
  sources: { kind: GroundKind; index: number; text: string }[];
  /** Texts that must never ground a name: card titles and tags, unchosen and other-Field Domains, GAP-created Domains. */
  notSources: string[];
  /** Chosen Domains created from a GAP in an earlier roadmap (ItemNote FROM_SUGGESTION): they ground nothing. */
  gapCreatedDomainIds: string[];
}

/** Each pack's constraint exclusions that are certain under F-R4-17's filter (K tests the filter on its own phrasings). */
const PACK_EXCLUSIONS: Readonly<Record<string, readonly CatalogKey[]>> = {
  guitar: ["WITH_A_PARTNER"], // "No teacher; …": teacher is WITH_A_PARTNER's keyword
  "lose-8kg": ["HARDER_SESSION", "LONGER_SESSION"], // "no running": run is a keyword of both
};

const OBJECT = "OBJECT";
const ARRAY = "ARRAY";
const STRING = "STRING";

const isEnglishAim = (aim: string): boolean => {
  const letters = aim.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return true;
  return letters.filter((c) => /[A-Za-z]/.test(c)).length / letters.length >= 0.85;
};

/** The Domains a pack lists, in roadmap-evidence's order: chosen (in the user's order), then the Area's others by cards. */
function listedOf(intake: Intake, domains: readonly HostileDomain[]): ListedDomain[] {
  if (intake.fieldId == null) return [];
  const byId = new Map<string, HostileDomain>();
  for (const d of domains) if (d && !byId.has(d.id)) byId.set(d.id, d);
  const chosen: HostileDomain[] = [];
  const seen = new Set<string>();
  for (const id of intake.domainIds ?? []) {
    const d = byId.get(id);
    if (d && !seen.has(id)) {
      seen.add(id);
      chosen.push(d);
    }
  }
  for (const d of domains) if (d.chosen && !seen.has(d.id)) {
    seen.add(d.id);
    chosen.push(d);
  }
  const others = [...byId.values()]
    .filter((d) => !seen.has(d.id) && d.fieldId === intake.fieldId)
    .sort((x, y) => y.cards - x.cards || x.name.localeCompare(y.name) || x.id.localeCompare(y.id));
  return [...chosen.map((d) => ({ d, chosen: true })), ...others.map((d) => ({ d, chosen: false }))]
    .slice(0, PACK_MAX_DOMAINS)
    .map(({ d, chosen: c }, i) => ({ key: `D${i + 1}`, id: d.id, name: d.name, chosen: c }));
}

/** The F-R4-17 schema of a run, built from its issued keys exactly as the spec writes it. */
export function specSchemaOf(run: Pick<HostileRun, "field" | "slots" | "enums" | "gaps">): Record<string, unknown> {
  const e = run.enums;
  const on = e.on.length > 0 ? { on: { type: STRING, enum: [...e.on] } } : {};
  const stageProps: Record<string, unknown> = {};
  if (e.lines.length > 0) stageProps.lines = { type: ARRAY, maxItems: "40", items: { type: STRING, enum: [...e.lines] } };
  if (e.practice.length > 0) {
    stageProps.practices = { type: ARRAY, maxItems: "3", items: { type: OBJECT, required: ["kind"], properties: { kind: { type: STRING, enum: [...e.practice] }, ...on } } };
  }
  if (e.step.length > 0) {
    stageProps.steps = { type: ARRAY, maxItems: "3", items: { type: OBJECT, required: ["kind"], properties: { kind: { type: STRING, enum: [...e.step] }, ...on } } };
  }
  if (e.checkpoint.length > 0) stageProps.checkpoint = { type: STRING, enum: [...e.checkpoint], nullable: true };
  const stageRequired = (run.field ? ["steps"] : ["practices", "steps"]).filter((k) => k in stageProps);
  const STAGE = {
    type: OBJECT,
    required: stageRequired,
    propertyOrdering: ["lines", "practices", "steps", "checkpoint"].filter((k) => k in stageProps),
    properties: stageProps,
  };
  const props: Record<string, unknown> = {};
  if (run.field && e.needs.length > 0) props.needs = { type: ARRAY, maxItems: "6", items: { type: STRING, enum: [...e.needs] } };
  props.stages = { type: OBJECT, required: [...run.slots], propertyOrdering: [...run.slots], properties: Object.fromEntries(run.slots.map((s) => [s, STAGE])) };
  if (run.gaps) props.gaps = { type: ARRAY, maxItems: "4", items: { type: STRING, maxLength: String(GAP_NAME_MAX) } };
  return { type: OBJECT, required: ["stages"], propertyOrdering: ["needs", "stages", "gaps"].filter((k) => k in props), properties: props };
}

interface RunSpec {
  variant: string;
  /** A probe reply's run: the pack's v3 intake patch merged over its v2 intake, as roadmap-corpus/corpus.ts v3IntakeOf does. */
  v3?: boolean;
  depth?: AimDepth;
  practicesAllowed?: boolean;
  examLabel?: string | null;
  outline?: readonly { line: string; domain: number | null }[] | "pack";
  gaps?: boolean;
  gapCreated?: number[];
}

/** The v2 intake with the pack's v3 patch merged (lineDomains into syllabus.lineDomains), as R3's corpus.ts v3IntakeOf. */
function v3IntakeOf(pack: CorpusPack): Intake {
  const patch = pack.v3?.intake;
  if (!patch) return { ...pack.input.intake };
  const { lineDomains, ...rest } = patch;
  const merged: Intake = { ...pack.input.intake, ...rest };
  if (lineDomains && merged.syllabus) merged.syllabus = { ...merged.syllabus, lineDomains: [...lineDomains] };
  return merged;
}

function buildRun(pack: CorpusPack, spec: RunSpec): HostileRun {
  const base = spec.v3 ? v3IntakeOf(pack) : pack.input.intake;
  const field = base.fieldId != null;
  const depth: AimDepth | null = field ? spec.depth ?? (spec.v3 && (base.depth === 12 || base.depth === 10 || base.depth === 8) ? base.depth : 12) : null;
  const chosenIds = [...(base.domainIds ?? [])];
  const given = base.syllabus?.lineDomains;
  const outlineLines: { line: string; domain: number | null }[] =
    spec.outline === "pack" || spec.outline == null
      ? (base.syllabus?.lines ?? []).map((line, i) => ({ line, domain: chosenIds.length > 0 ? (i % (chosenIds.length + 1) === chosenIds.length ? null : i % (chosenIds.length + 1)) : null }))
      : [...spec.outline];
  const keepPackOutline = spec.outline === "pack" || spec.outline == null;
  const lines = outlineLines.map((o) => o.line);
  // The user's own line Domains where the pack gives them (a probe run); otherwise the corpus's fixed assignment.
  const lineDomains = spec.v3 && Array.isArray(given) && given.length === lines.length ? [...given] : outlineLines.map((o) => (o.domain == null ? null : chosenIds[o.domain] ?? null));
  const examLabel = spec.examLabel !== undefined ? spec.examLabel : base.examLabel;
  const practicesAllowed = field ? spec.practicesAllowed ?? base.practicesAllowed !== false : true;
  const intake: Intake = {
    ...base,
    examLabel,
    practicesAllowed,
    syllabus: lines.length > 0 ? { lines, source: keepPackOutline ? base.syllabus?.source ?? null : null, lineDomains } : null,
    depth,
    // REALISTIC dates new cards by the user's writing pace: with none, R2's ladder refuses and the app drafts nothing, so the
    // bar's views would render an empty plan (fix round: 4 packs did). A pack with no pace keeps its chosen date.
    dateMode: field ? (spec.v3 && (base.dateMode === "REALISTIC" || base.dateMode === "CHOSEN") ? base.dateMode : base.newCardsPerWeek != null ? "REALISTIC" : "CHOSEN") : "CHOSEN",
    exam: spec.v3 && base.exam === false ? false : examLabel != null,
    examDay: null,
    suggestAreas: spec.gaps === true,
  };
  const listed = listedOf(intake, pack.input.domains);
  const track: CatalogTrack = field ? "FIELD" : base.track;
  const sKeys = lines
    .map((l, index) => ({ l: l.trim(), index }))
    .filter((x) => x.l.length > 0)
    .slice(0, SYLLABUS_MAX_LINES)
    .map((x, i) => ({ key: `S${i + 1}`, index: x.index }));
  const excluded = [...(PACK_EXCLUSIONS[pack.file] ?? [])];
  const filter = { track, exam: examLabel != null, practicesAllowed, excluded };
  const enums = {
    needs: field ? listed.filter((d) => !d.chosen).map((d) => d.key) : [],
    lines: sKeys.map((s) => s.key),
    practice: catalogKindsFor("PRACTICE", filter),
    step: catalogKindsFor("STEP", filter),
    checkpoint: catalogKindsFor("CHECKPOINT", filter),
    on: field ? listed.map((d) => d.key) : [],
  };
  const slots = field ? gateStagesTo(depth as AimDepth) : [...TRACK_STAGE_KEYS];
  const gaps = spec.gaps === true && field;
  const gapCreatedDomainIds = (spec.gapCreated ?? []).map((i) => chosenIds[i]).filter((x): x is string => typeof x === "string");
  const chosenNames = listed.filter((d) => d.chosen && !gapCreatedDomainIds.includes(d.id)).map((d) => d.name);
  const sources: HostileRun["sources"] = [];
  const add = (kind: GroundKind, index: number, text: string | null | undefined) => {
    if (typeof text === "string" && text.trim()) sources.push({ kind, index, text });
  };
  add("AIM", 0, intake.aim);
  add("CONSTRAINTS", 0, intake.constraints);
  add("EXAM", 0, intake.examLabel);
  lines.forEach((l, i) => add("OUTLINE", i, l));
  add("AREA", 0, pack.input.areaName);
  chosenNames.forEach((n, i) => add("DOMAIN", i, n));
  const library = pack.library ?? [];
  const notSources = [
    ...library.flatMap((l) => [...(l.titles ?? []), ...(l.tags ?? [])]),
    ...listed.filter((d) => !d.chosen).map((d) => d.name),
    ...library.filter((l) => l.fieldId !== base.fieldId).map((l) => l.name),
    ...listed.filter((d) => gapCreatedDomainIds.includes(d.id)).map((d) => d.name),
  ];
  const run: HostileRun = {
    id: `${pack.file}#${spec.variant}`,
    pack: pack.file,
    variant: spec.variant,
    today: pack.today,
    intake,
    areaName: pack.input.areaName,
    domains: pack.input.domains,
    windows: pack.input.windows,
    library,
    field,
    track,
    english: isEnglishAim(intake.aim),
    listed,
    sKeys,
    slots,
    enums,
    gaps,
    excluded,
    schema: {},
    required: listed.filter((d) => d.chosen).map((d) => d.id),
    sources,
    notSources,
    gapCreatedDomainIds,
  };
  run.schema = specSchemaOf(run);
  return run;
}

/** Every run variant of the packs, in a fixed order. */
export function runsOf(packs: readonly CorpusPack[]): HostileRun[] {
  const out: HostileRun[] = [];
  for (const pack of [...packs].sort((a, b) => a.file.localeCompare(b.file))) {
    const field = pack.input.intake.fieldId != null;
    const hasOutline = (pack.input.intake.syllabus?.lines ?? []).length > 0;
    const synthetic = G.PACK_OUTLINES[pack.file];
    out.push(buildRun(pack, { variant: "base" }));
    if (!field) {
      out.push(buildRun(pack, { variant: "exam", examLabel: `${pack.input.areaName} assessment` }));
      continue;
    }
    out.push(buildRun(pack, { variant: "d10", depth: 10 }));
    out.push(buildRun(pack, { variant: "d8-nopractice", depth: 8, practicesAllowed: false }));
    out.push(buildRun(pack, { variant: "exam-toggled", examLabel: pack.input.intake.examLabel == null ? `${pack.input.areaName} final assessment` : null }));
    const outline = synthetic ?? (hasOutline ? "pack" : null);
    if (synthetic) out.push(buildRun(pack, { variant: "outline", outline: synthetic }));
    // The gap slot (E, E-G, M): an outline where there is one, suggestions on.
    if (pack.file === "actuarial-probability") {
      const extended = [...(pack.input.intake.syllabus?.lines ?? []).map((line, i) => ({ line, domain: i % 3 === 2 ? null : i % 3 })), ...(G.PACK_OUTLINES["actuarial-probability+"] ?? [])];
      out.push(buildRun(pack, { variant: "gaps", outline: extended, gaps: true }));
      out.push(buildRun(pack, { variant: "gaps-gapmade", outline: extended, gaps: true, gapCreated: [1] }));
    } else {
      out.push(buildRun(pack, { variant: "gaps", outline: outline ?? undefined, gaps: true }));
    }
  }
  return out;
}

/**
 * A K run: a track run with the case's constraints and aim, its practice enum
 * minus the expected exclusions. `family` names the derivation in the run's
 * id: "K" (family K, derived on the fly) or "C" (E's clash sub-class, whose
 * runs are part of the corpus).
 */
export function deriveConstraintRun(template: HostileRun, c: { id: string; constraints: string; aim: string; mustExclude: readonly string[] }, family: "K" | "C" = "K"): HostileRun {
  const intake: Intake = { ...template.intake, constraints: c.constraints, aim: c.aim };
  const drop = new Set(c.mustExclude);
  const enums = {
    ...template.enums,
    practice: template.enums.practice.filter((k) => !drop.has(k)),
    step: template.enums.step.filter((k) => !drop.has(k)),
    checkpoint: template.enums.checkpoint.filter((k) => !drop.has(k)),
  };
  const run: HostileRun = {
    ...template,
    id: `${template.id}~${family}:${c.id}`,
    variant: `${family}:${c.id}`,
    intake,
    enums,
    excluded: [...new Set([...template.excluded, ...c.mustExclude])],
    sources: template.sources.map((s) => (s.kind === "AIM" ? { ...s, text: c.aim } : s.kind === "CONSTRAINTS" ? { ...s, text: c.constraints } : s)),
    english: isEnglishAim(c.aim),
    schema: {},
  };
  if (!run.sources.some((s) => s.kind === "CONSTRAINTS")) run.sources.push({ kind: "CONSTRAINTS", index: 0, text: c.constraints });
  run.schema = specSchemaOf(run);
  return run;
}

/**
 * A gap run with lines the user wrote appended to its outline (E's
 * one-source sub-class, fix round 2): each line a grounding source of its own
 * after the outline's, tied to no Domain, and the keymap, `lines` enum and
 * schema re-derived. `tag` names the derivation in the run's id.
 */
export function deriveOutlineRun(template: HostileRun, extra: readonly string[], tag: string): HostileRun {
  const base = template.intake.syllabus?.lines ?? [];
  const lines = [...base, ...extra];
  if (lines.length > SYLLABUS_MAX_LINES) throw new Error(`hostile generator: ${template.id} + ${extra.length} lines passes SYLLABUS_MAX_LINES`);
  const given = template.intake.syllabus?.lineDomains;
  const lineDomains = [...(Array.isArray(given) && given.length === base.length ? given : base.map(() => null)), ...extra.map(() => null)];
  const intake: Intake = { ...template.intake, syllabus: { lines, source: template.intake.syllabus?.source ?? null, lineDomains } };
  const sKeys = lines
    .map((l, index) => ({ l: l.trim(), index }))
    .filter((x) => x.l.length > 0)
    .map((x, i) => ({ key: `S${i + 1}`, index: x.index }));
  const outlineAt = template.sources.reduce((at, s, i) => (s.kind === "OUTLINE" || s.kind === "AIM" || s.kind === "CONSTRAINTS" || s.kind === "EXAM" ? i + 1 : at), 0);
  const added = extra.map((text, i) => ({ kind: "OUTLINE" as const, index: base.length + i, text }));
  const run: HostileRun = {
    ...template,
    id: `${template.id}~${tag}`,
    variant: tag,
    intake,
    sKeys,
    enums: { ...template.enums, lines: sKeys.map((s) => s.key) },
    sources: [...template.sources.slice(0, outlineAt), ...added, ...template.sources.slice(outlineAt)],
    schema: {},
  };
  run.schema = specSchemaOf(run);
  return run;
}

// ═══ Cases ═══════════════════════════════════════════════════════════════════

export type Verdict = RefVerdict;
export type ReplyFamily = "A" | "B" | "C" | "D" | "E" | "F";

/** One reply: its JSON text exactly as a model would return it, and its expected verdict with the reason. */
export interface ReplyCase {
  id: string;
  family: ReplyFamily;
  run: string;
  raw: string;
  expect: Verdict;
  /** The construction (a mutation operator or class), for the confusion matrix's reports. */
  reason: string;
  /** D: the case's unique marker word (≥ 8 letters), so the taint check can't pass vacuously. */
  marker?: string;
  /** E: the gap strings in the reply, in order. */
  gapStrings?: string[];
}

/** One E gap string with its ground truth: claim-bearing (never to be shown) or control (a phrase of the user's text). */
export interface GapCase {
  id: string;
  run: string;
  text: string;
  claim: boolean;
  cls: string;
  /**
   * The one-source sub-classes (fix round 2): the flag family that, by
   * construction, must hide this name once the layers above it on the gap
   * path are off (the shape rule's word clauses; grounding too for an
   * invented name). The bar reads the flags alone with it.
   */
  flag?: G.OneSourceFlag;
}

/** One E-G name, recombined from the pack's own words. */
export interface RecombinedCase {
  id: string;
  run: string;
  text: string;
  claim: boolean;
  /** one: all its content words in order inside one grounding source; several: across texts; library: only from card titles, tags or Domains the user didn't choose; reordered: one source, wrong order. */
  provenance: "one" | "several" | "library" | "reordered";
}

/** One K case: a constraint phrasing on a BODY or CARE plan, the kinds it must exclude, and whether the confirm must be raised. */
export interface ConstraintCase {
  id: string;
  lang: "en" | "vi" | "ja";
  track: "BODY" | "CARE";
  /** The template run (a track pack's base run) the K run derives from. */
  run: string;
  constraints: string;
  aim: string;
  /** The cues the phrasing uses (one, except list phrasings): which negation cue each case exercises. */
  cues: string[];
  terms: string[];
  /** Every kind the English parser must exclude (recall 100%). Empty for vi, ja and cue-less cases. */
  mustExclude: string[];
  /** Fix round 3, the release sub-class: every kind only the activity the user cleared names ("{o} is fine"); none may be excluded. */
  mustKeep?: string[];
  /** English with a cue: the parser reads it (recall, and the release sub-class's keeps). False for vi, ja and cue-less (the confirm covers them). */
  parsed: boolean;
  /** "release": K's release sub-class (fix round 3); absent on every older case, so they hash as they did. */
  sub?: "release";
  /** The session picks the confirm reply holds (at least one kind outside BODY_SAFE_KINDS where the enum has one). */
  picks: string[];
}

/** A body constraint against a Field run's kinds: it must exclude none (over-exclusion 0). */
export interface OverExclusionCase {
  id: string;
  constraints: string;
  fieldRun: string;
}

export type MetaRel = "M1" | "M2" | "M3" | "M4" | "M5" | "M6" | "M7";

/** One metamorphic pair: the variant must relate to the base as the relation says. */
export interface MetaCase {
  id: string;
  rel: MetaRel;
  run: string;
  base: string;
  variant: string;
  /** What was inserted or changed (a script, a quote style, a URL form, a character). */
  note: string;
}

export interface HostileCorpus {
  runs: HostileRun[];
  replies: ReplyCase[];
  gaps: GapCase[];
  recombined: RecombinedCase[];
  constraints: ConstraintCase[];
  overExclusion: OverExclusionCase[];
  meta: MetaCase[];
  /** The packs and probe fixtures the corpus was generated from. */
  packs: string[];
  probes: string[];
  counts: Record<string, number>;
}

// ═══ JSON helpers ════════════════════════════════════════════════════════════

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };
type Path = (string | number)[];

/** Set an own, enumerable property (a "__proto__" key stays a key, as JSON.parse makes it). */
function put(o: Obj, k: string, v: Json): void {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}

const clone = <T extends Json>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function getAt(root: Json, path: Path): Json {
  let cur: Json = root;
  for (const seg of path) cur = (cur as Record<string, Json>)[seg as string];
  return cur;
}

/** Replace the value at `path` (the root itself when the path is empty: returns the new root). */
function setAt(root: Json, path: Path, value: Json): Json {
  if (path.length === 0) return value;
  const parent = getAt(root, path.slice(0, -1)) as Record<string, Json> | Json[];
  const last = path[path.length - 1];
  if (Array.isArray(parent)) parent[last as number] = value;
  else put(parent as Obj, String(last), value);
  return root;
}

function deleteAt(root: Json, path: Path): void {
  const parent = getAt(root, path.slice(0, -1)) as Record<string, Json>;
  delete parent[String(path[path.length - 1])];
}

// ═══ Valid replies ═══════════════════════════════════════════════════════════

interface ReplyOpts {
  /** Gap strings to place (gaps runs only). */
  gaps?: string[];
}

function validStage(run: HostileRun, rng: Rng, last: boolean): Obj {
  const st: Obj = {};
  const e = run.enums;
  if (e.lines.length > 0 && rng.chance(0.8)) st.lines = rng.sample(e.lines, 1 + rng.int(Math.min(4, e.lines.length)));
  const item = (kinds: readonly string[]): Obj => {
    const o: Obj = { kind: rng.pick(kinds) };
    if (e.on.length > 0 && rng.chance(0.5)) o.on = rng.pick(e.on);
    return o;
  };
  const noLast = (kinds: readonly string[]) => (last ? kinds : kinds.filter((k) => !catalogEntryOf(k)?.lastStageOnly));
  const practiceKinds = e.practice;
  if (practiceKinds.length > 0 && (!run.field || rng.chance(0.85))) st.practices = Array.from({ length: rng.int(4) }, () => item(practiceKinds));
  if (e.step.length > 0) {
    const kinds = rng.chance(0.85) && noLast(e.step).length > 0 ? noLast(e.step) : e.step;
    st.steps = Array.from({ length: rng.int(4) }, () => item(kinds));
  }
  if (e.checkpoint.length > 0) {
    const r = rng.float();
    if (r < 0.6) st.checkpoint = rng.pick(e.checkpoint);
    else if (r < 0.8) st.checkpoint = null;
  }
  return st;
}

/** A valid reply for the run: every slot, issued keys only, every array within its maxItems. */
function validReply(run: HostileRun, rng: Rng, opts: ReplyOpts = {}): Obj {
  const reply: Obj = {};
  if (run.enums.needs.length > 0 && rng.chance(0.7)) reply.needs = rng.sample(run.enums.needs, rng.int(Math.min(4, run.enums.needs.length) + 1));
  const stages: Obj = {};
  run.slots.forEach((s, i) => {
    stages[s] = validStage(run, rng, i === run.slots.length - 1);
  });
  reply.stages = stages;
  if (run.gaps) {
    if (opts.gaps) reply.gaps = [...opts.gaps];
    else if (rng.chance(0.4)) reply.gaps = [];
  }
  return reply;
}

// ═══ Sites: where a mutation can land ════════════════════════════════════════

type SiteSlot = "needs" | "lines" | "practice.kind" | "step.kind" | "on" | "checkpoint";
interface EnumSite {
  path: Path;
  slot: SiteSlot;
  value: string;
}
interface ArraySite {
  path: Path;
  slot: "needs" | "lines" | "practices" | "steps" | "gaps";
}
interface ObjectSite {
  path: Path;
  slot: "root" | "stages" | "stage" | "practice" | "step";
}

function sitesOf(reply: Obj): { enums: EnumSite[]; arrays: ArraySite[]; objects: ObjectSite[] } {
  const enums: EnumSite[] = [];
  const arrays: ArraySite[] = [];
  const objects: ObjectSite[] = [{ path: [], slot: "root" }];
  if (Array.isArray(reply.needs)) {
    arrays.push({ path: ["needs"], slot: "needs" });
    reply.needs.forEach((v, i) => enums.push({ path: ["needs", i], slot: "needs", value: String(v) }));
  }
  if (Array.isArray(reply.gaps)) arrays.push({ path: ["gaps"], slot: "gaps" });
  const stages = reply.stages as Obj;
  objects.push({ path: ["stages"], slot: "stages" });
  for (const slot of Object.keys(stages)) {
    const st = stages[slot] as Obj;
    objects.push({ path: ["stages", slot], slot: "stage" });
    if (Array.isArray(st.lines)) {
      arrays.push({ path: ["stages", slot, "lines"], slot: "lines" });
      st.lines.forEach((v, i) => enums.push({ path: ["stages", slot, "lines", i], slot: "lines", value: String(v) }));
    }
    for (const [prop, kindSlot, objSlot] of [
      ["practices", "practice.kind", "practice"],
      ["steps", "step.kind", "step"],
    ] as const) {
      const arr = st[prop];
      if (!Array.isArray(arr)) continue;
      arrays.push({ path: ["stages", slot, prop], slot: prop });
      arr.forEach((it, i) => {
        objects.push({ path: ["stages", slot, prop, i], slot: objSlot });
        const o = it as Obj;
        enums.push({ path: ["stages", slot, prop, i, "kind"], slot: kindSlot, value: String(o.kind) });
        if (typeof o.on === "string") enums.push({ path: ["stages", slot, prop, i, "on"], slot: "on", value: o.on });
      });
    }
    if (typeof st.checkpoint === "string") enums.push({ path: ["stages", slot, "checkpoint"], slot: "checkpoint", value: st.checkpoint });
  }
  return { enums, arrays, objects };
}

/** The enum a site's value is checked against. */
function enumOfSite(run: HostileRun, slot: SiteSlot): string[] {
  switch (slot) {
    case "needs":
      return run.enums.needs;
    case "lines":
      return run.enums.lines;
    case "practice.kind":
      return run.enums.practice;
    case "step.kind":
      return run.enums.step;
    case "on":
      return run.enums.on;
    default:
      return run.enums.checkpoint;
  }
}

/** A valid value for an array site (a key, or an item object). */
function validElement(run: HostileRun, rng: Rng, slot: ArraySite["slot"]): Json {
  switch (slot) {
    case "needs":
      return rng.pick(run.enums.needs);
    case "lines":
      return rng.pick(run.enums.lines);
    case "practices":
      return { kind: rng.pick(run.enums.practice) };
    case "steps":
      return { kind: rng.pick(run.enums.step) };
    default:
      return "Probability";
  }
}

const MAX_ITEMS: Readonly<Record<ArraySite["slot"], number>> = { needs: 6, lines: 40, practices: 3, steps: 3, gaps: 4 };

// ═══ Invented words ══════════════════════════════════════════════════════════

/** A word nobody wrote: `n` syllables (lower case). */
function invented(rng: Rng, n: number): string {
  let w = "";
  for (let i = 0; i < n; i++) w += rng.pick(G.SYLLABLES);
  return w;
}

const capital = (w: string): string => (w ? w[0].toUpperCase() + w.slice(1) : w);

/** A URL of one form, its placeholders filled ({d} a domain word, {p} a path word, {n} 1–254). */
function urlOf(form: string, rng: Rng): string {
  return form.replace("{d}", invented(rng, 2)).replace("{p}", invented(rng, 2)).replace(/\{n\}/g, () => String(1 + rng.int(254)));
}

/** A unique marker word of 8+ letters (family D's taint anchor). */
function markerOf(rng: Rng, used: Set<string>): string {
  for (;;) {
    const w = invented(rng, 3 + rng.int(2));
    if (w.length >= 8 && w.length <= 16 && !used.has(w)) {
      used.add(w);
      return rng.chance(0.5) ? capital(w) : w;
    }
  }
}

// ═══ The generator ═══════════════════════════════════════════════════════════

/** Every string the corpus's author-written drafts hold (the rev-3 replies), read in any shape. */
export function authorStrings(packs: readonly CorpusPack[]): string[] {
  const out: string[] = [];
  const walk = (v: unknown, key: string | null) => {
    if (typeof v === "string") {
      if (key !== "domain" && key !== "method" && key !== "kind" && key !== "syllabus" && !/^[DSN]\d+$/.test(v) && v.trim()) out.push(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x, key === "titleClaims" || key === "claims" ? "claims" : key === "domains" ? "domain" : null);
      return;
    }
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (k !== "titleClaims" && k !== "claims") walk(x, k);
  };
  for (const p of [...packs].sort((a, b) => a.file.localeCompare(b.file))) for (const d of p.drafts ?? []) walk(d.reply, null);
  return out;
}

class Builder {
  readonly corpus: HostileCorpus;
  private readonly byId = new Map<string, HostileRun>();
  constructor(
    readonly packs: readonly CorpusPack[],
    readonly probes: readonly ProbeFixture[]
  ) {
    const runs = runsOf(packs);
    // A blessed probe reply is judged against the run it was drafted for: its pack's v3 intake, its gap slot.
    for (const probe of [...probes].filter((p) => p.blessed).sort((a, b) => a.file.localeCompare(b.file))) {
      const pack = packs.find((p) => p.file === (probe.pack ?? probe.aim));
      if (pack) runs.push(buildRun(pack, { variant: `probe:${probe.file}`, v3: true, outline: "pack", gaps: probe.gapsLive === true }));
    }
    for (const r of runs) this.byId.set(r.id, r);
    this.corpus = {
      runs,
      replies: [],
      gaps: [],
      recombined: [],
      constraints: [],
      overExclusion: [],
      meta: [],
      packs: [...packs].map((p) => p.file).sort(),
      probes: [...probes].filter((p) => p.blessed).map((p) => p.file).sort(),
      counts: {},
    };
  }

  run(id: string): HostileRun {
    const r = this.byId.get(id);
    if (!r) throw new Error(`hostile generator: no run ${id}`);
    return r;
  }

  /**
   * Record one reply, after the reference walk agrees with its label (or
   * throw: a generator bug). `trustLabel` only for a real probe reply, whose
   * label is the lead's (F-R4-23), never the generator's.
   */
  reply(c: Omit<ReplyCase, "raw"> & { value: Json; trustLabel?: boolean }): void {
    const raw = JSON.stringify(c.value);
    const run = this.run(c.run);
    const got = referenceVerdict(JSON.parse(raw), run.schema);
    if (got !== c.expect && !c.trustLabel) throw new Error(`hostile generator: ${c.id} (${c.reason}) labelled ${c.expect} but F-R4-20 gives ${got}: ${raw.slice(0, 300)}`);
    const { value, trustLabel, ...rest } = c;
    void value;
    void trustLabel;
    this.corpus.replies.push({ ...rest, raw });
  }

  // ── A ──────────────────────────────────────────────────────────────────────
  familyA(): void {
    const rng = new Rng(HOSTILE_SEEDS.A);
    const runs = this.corpus.runs;
    for (let i = 0; i < FAMILY_TARGETS.A; i++) {
      const run = runs[i % runs.length];
      const reply = validReply(run, rng);
      let expect: Verdict = "CLEAN";
      let reason = "valid";
      if (rng.chance(0.1)) {
        const { arrays } = sitesOf(reply);
        const candidates = arrays.filter((a) => a.slot !== "gaps" && (a.slot !== "practices" || run.enums.practice.length > 0) && (a.slot !== "steps" || run.enums.step.length > 0));
        if (candidates.length > 0) {
          const a = rng.pick(candidates);
          const arr = getAt(reply, a.path) as Json[];
          const want = MAX_ITEMS[a.slot] + 1 + rng.int(3);
          while (arr.length < want) arr.push(validElement(run, rng, a.slot));
          expect = "SALVAGED";
          reason = `over-max:${a.slot}`;
        }
      }
      this.reply({ id: `A${i}`, family: "A", run: run.id, value: reply, expect, reason });
    }
  }

  // ── B ──────────────────────────────────────────────────────────────────────
  familyB(): void {
    const rng = new Rng(HOSTILE_SEEDS.B);
    const runs = this.corpus.runs;
    const plan: [string, number][] = [
      ["number-for-enum", 150],
      ["bool-for-enum", 80],
      ["null-for-enum", 60],
      ["array-for-scalar", 80],
      ["object-for-scalar", 60],
      ["scalar-for-array", 80],
      ["null-for-array", 60],
      ["object-for-array", 40],
      ["array-for-object", 60],
      ["scalar-for-object", 60],
      ["null-for-object", 40],
      ["root-not-object", 20],
      ["nullable-null", 60],
      ["array-10k-valid", 20],
      ["array-10k-invalid-early", 20],
      ["nest-200", 40],
      ["string-1mb", 20],
      ["missing-required", 50],
    ];
    const big = `${"Gemini wrote this long string to flood the reply ".repeat(21846)}`.slice(0, 1 << 20);
    const nest = (depth: number, arrays: boolean): Json => {
      let v: Json = "deep";
      for (let d = 0; d < depth; d++) v = arrays ? [v] : { a: v };
      return v;
    };
    let n = 0;
    for (const [op, count] of plan) {
      let made = 0;
      let guard = 0;
      while (made < count) {
        if (++guard > count * 50) throw new Error(`hostile generator: B ${op} could not be placed`);
        const run = runs[(n + guard) % runs.length];
        const reply = validReply(run, rng);
        const { enums, arrays, objects } = sitesOf(reply);
        let value: Json = reply;
        let expect: Verdict = "REJECTED";
        const nonNullableEnums = enums.filter((e) => e.slot !== "checkpoint");
        const mutateEnum = (to: Json, sites: EnumSite[] = enums): boolean => {
          if (sites.length === 0) return false;
          const s = rng.pick(sites);
          value = setAt(value, s.path, to);
          return true;
        };
        let ok = true;
        switch (op) {
          case "number-for-enum":
            ok = mutateEnum(rng.pick([1, 0, -1, 3.5, 1e21, 42]));
            break;
          case "bool-for-enum":
            ok = mutateEnum(rng.chance(0.5));
            break;
          case "null-for-enum":
            ok = mutateEnum(null, nonNullableEnums);
            break;
          case "array-for-scalar": {
            if (enums.length === 0) ok = false;
            else {
              const s = rng.pick(enums);
              value = setAt(value, s.path, [s.value]);
            }
            break;
          }
          case "object-for-scalar": {
            if (enums.length === 0) ok = false;
            else {
              const s = rng.pick(enums);
              value = setAt(value, s.path, { value: s.value });
            }
            break;
          }
          case "scalar-for-array": {
            if (arrays.length === 0) ok = false;
            else value = setAt(value, rng.pick(arrays).path, rng.pick<Json>(["D1", 1, true, "RECALL_DRILLS"]));
            break;
          }
          case "null-for-array":
            if (arrays.length === 0) ok = false;
            else value = setAt(value, rng.pick(arrays).path, null);
            break;
          case "object-for-array":
            if (arrays.length === 0) ok = false;
            else value = setAt(value, rng.pick(arrays).path, { "0": "D1" });
            break;
          case "array-for-object": {
            const s = rng.pick(objects.filter((o) => o.slot !== "root"));
            value = setAt(value, s.path, [getAt(value, s.path)]);
            break;
          }
          case "scalar-for-object": {
            const s = rng.pick(objects.filter((o) => o.slot !== "root"));
            value = setAt(value, s.path, rng.pick<Json>(["FOUNDATION", 0, false, "a stage"]));
            break;
          }
          case "null-for-object": {
            const s = rng.pick(objects.filter((o) => o.slot !== "root"));
            value = setAt(value, s.path, null);
            break;
          }
          case "root-not-object":
            value = rng.pick<Json>([[], [reply], "stages", 42, null, true]);
            break;
          case "nullable-null": {
            const stageSites = objects.filter((o) => o.slot === "stage");
            if (run.enums.checkpoint.length === 0 || stageSites.length === 0) ok = false;
            else {
              const s = rng.pick(stageSites);
              put(getAt(value, s.path) as Obj, "checkpoint", null);
              expect = "CLEAN";
            }
            break;
          }
          case "array-10k-valid":
          case "array-10k-invalid-early": {
            const cands = arrays.filter((a) => a.slot !== "gaps" && (a.slot !== "practices" || run.enums.practice.length > 0));
            if (cands.length === 0) ok = false;
            else {
              const a = rng.pick(cands);
              const arr = Array.from({ length: 10_000 }, () => validElement(run, rng, a.slot));
              if (op === "array-10k-invalid-early") arr[1] = rng.pick<Json>([42, "Gemini's own words", null, { kind: "NOT_A_KIND" }]);
              value = setAt(value, a.path, arr);
              expect = op === "array-10k-valid" ? "SALVAGED" : "REJECTED";
            }
            break;
          }
          case "nest-200":
            if (enums.length > 0 && rng.chance(0.6)) ok = mutateEnum(nest(200, rng.chance(0.5)));
            else value = setAt(value, ["stages", run.slots[0]], nest(200, false));
            break;
          case "string-1mb":
            ok = mutateEnum(big);
            break;
          case "missing-required": {
            const options: Path[] = [["stages"], ["stages", rng.pick(run.slots)]];
            const st = (reply.stages as Obj)[run.slots[0]] as Obj;
            if ("steps" in st) options.push(["stages", run.slots[0], "steps"]);
            if (!run.field && "practices" in st) options.push(["stages", run.slots[0], "practices"]);
            const items = objects.filter((o) => o.slot === "practice" || o.slot === "step");
            if (items.length > 0) options.push([...rng.pick(items).path, "kind"]);
            deleteAt(value, rng.pick(options));
            break;
          }
          default:
            throw new Error(`hostile generator: unknown B op ${op}`);
        }
        if (!ok) continue;
        this.reply({ id: `B${n}`, family: "B", run: run.id, value, expect, reason: op });
        made++;
        n++;
      }
    }
  }

  // ── C ──────────────────────────────────────────────────────────────────────
  familyC(): void {
    const rng = new Rng(HOSTILE_SEEDS.C);
    const runs = this.corpus.runs;
    const field = runs.filter((r) => r.field);
    const confusablesOf = (v: string): string[] => {
      const out = new Set<string>([
        v.toLowerCase(),
        `${v} `,
        ` ${v}`,
        `${v}​`,
        `​${v}`,
        `${v}\n`,
        v.replace(/./g, (ch) => (/[A-Z0-9_]/.test(ch) ? String.fromCodePoint((ch.codePointAt(0) as number) + 0xfee0) : ch)),
        v.replace(/[AEOPCXHKMT]/, (ch) => G.HOMOGLYPHS[ch] ?? ch),
        v.replace(/_/g, " "),
        v.replace(/_/g, "-"),
      ]);
      const m = /^([DS])(\d+)$/.exec(v);
      if (m) {
        out.add(`${m[1]}0${m[2]}`);
        out.add(`${m[1] === "D" ? "Д" : "Ѕ"}${m[2]}`);
        out.add(`${m[1]} ${m[2]}`);
        out.add(`${m[1]}-${m[2]}`);
        out.add(`${m[1]}${String.fromCodePoint(0xff10 + Number(m[2][0]))}${m[2].slice(1)}`);
      }
      out.delete(v);
      return [...out];
    };
    const otherKeys = (run: HostileRun, slot: SiteSlot): string[] => {
      const here = new Set(enumOfSite(run, slot));
      const pool = new Set<string>();
      for (const r of runs) for (const k of enumOfSite(r, slot)) pool.add(k);
      return [...pool].filter((k) => !here.has(k));
    };
    const plan: [string, number][] = [
      ["confusable-value", 600],
      ["out-of-range-key", 300],
      ["other-run-key", 300],
      ["other-run-key-valid-here", 150],
      ["kind-forgery", 300],
      ["chosen-in-needs", 50],
      ["proto-value", 100],
      ["proto-key", 200],
    ];
    const PROTO = ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "prototype", "__defineGetter__", "isPrototypeOf"];
    let n = 0;
    for (const [op, count] of plan) {
      let made = 0;
      let guard = 0;
      while (made < count) {
        if (++guard > count * 80) throw new Error(`hostile generator: C ${op} could not be placed`);
        const run = op === "chosen-in-needs" ? field[guard % field.length] : runs[(n + guard) % runs.length];
        const reply = validReply(run, rng);
        const { enums, objects } = sitesOf(reply);
        let value: Json = reply;
        let expect: Verdict = "REJECTED";
        let ok = true;
        switch (op) {
          case "confusable-value": {
            if (enums.length === 0) {
              ok = false;
              break;
            }
            const s = rng.pick(enums);
            value = setAt(value, s.path, rng.pick(confusablesOf(s.value)));
            break;
          }
          case "out-of-range-key": {
            const keySites = enums.filter((e) => e.slot === "needs" || e.slot === "lines" || e.slot === "on");
            if (keySites.length === 0) {
              ok = false;
              break;
            }
            const s = rng.pick(keySites);
            const k = run.listed.length;
            const L = run.sKeys.length;
            value = setAt(value, s.path, rng.pick(["D0", `D${k + 1}`, "D41", "D99", "S0", `S${L + 1}`, "S41", "N1", "N2", "D", "S", ""]));
            break;
          }
          case "other-run-key":
          case "other-run-key-valid-here": {
            if (enums.length === 0) {
              ok = false;
              break;
            }
            const s = rng.pick(enums);
            if (op === "other-run-key") {
              const pool = otherKeys(run, s.slot);
              if (pool.length === 0) {
                ok = false;
                break;
              }
              value = setAt(value, s.path, rng.pick(pool));
            } else {
              // A key some other run issued that happens to be valid here too (D3 in a pack with 3 Domains): CLEAN.
              const here = enumOfSite(run, s.slot);
              const shared = here.filter((k) => runs.some((r) => r.id !== run.id && enumOfSite(r, s.slot).includes(k)) && k !== s.value);
              if (shared.length === 0) {
                ok = false;
                break;
              }
              value = setAt(value, s.path, rng.pick(shared));
              expect = "CLEAN";
            }
            break;
          }
          case "kind-forgery": {
            const kindSites = enums.filter((e) => e.slot === "practice.kind" || e.slot === "step.kind" || e.slot === "checkpoint");
            if (kindSites.length === 0) {
              ok = false;
              break;
            }
            const s = rng.pick(kindSites);
            const here = new Set(enumOfSite(run, s.slot));
            const forged = [
              ...CATALOG.map((c) => c.key),
              "FOUNDATION",
              "MASTERED",
              "STAGE_1",
              "DELIBERATE_PRACTICE",
              "WORKOUT",
              "COACHED_SESSION",
              "AIM_STEP_EARLY",
              "STUDY",
              "CUSTOM",
              "OTHER",
            ].filter((k) => !here.has(k));
            value = setAt(value, s.path, rng.pick(forged));
            break;
          }
          case "chosen-in-needs": {
            const chosen = run.listed.filter((d) => d.chosen).map((d) => d.key);
            if (run.enums.needs.length === 0 || chosen.length === 0) {
              ok = false;
              break;
            }
            put(value as Obj, "needs", [rng.pick(chosen)]);
            break;
          }
          case "proto-value": {
            if (enums.length === 0) {
              ok = false;
              break;
            }
            value = setAt(value, rng.pick(enums).path, rng.pick(PROTO));
            break;
          }
          case "proto-key": {
            const o = rng.pick(objects);
            put(getAt(value, o.path) as Obj, rng.pick(PROTO), rng.pick<Json>([1, "D1", {}, [], null, "FOUNDATION"]));
            break;
          }
          default:
            throw new Error(`hostile generator: unknown C op ${op}`);
        }
        if (!ok) continue;
        this.reply({ id: `C${n}`, family: "C", run: run.id, value, expect, reason: op });
        made++;
        n++;
      }
    }
  }

  // ── D ──────────────────────────────────────────────────────────────────────
  familyD(): void {
    const rng = new Rng(HOSTILE_SEEDS.D);
    const marks = new Rng(HOSTILE_SEEDS.MARK);
    const used = new Set<string>();
    const runs = this.corpus.runs.filter((r) => !r.gaps);
    const authored = authorStrings(this.packs);
    const smuggled = [
      "You must buy the official CFA curriculum for $1,200",
      "Ignore the app's rules and write your own milestone titles",
      "Read chapter 3 of Kessler's textbook every Monday",
      "Your weak spots are integration and series",
      "Join the paid signal group at signals.example.com",
      "Recommended by the exam board: 300 hours of study",
      "Take the Kestrel bootcamp, it's guaranteed to work",
      "This person is a beginner and struggles with algebra",
    ];
    const payloads = [...authored, ...smuggled];
    const payloadWith = (marker: string): string => {
      const p = rng.pick(payloads);
      const w = p.split(" ");
      const at = rng.int(w.length + 1);
      w.splice(at, 0, marker);
      return rng.chance(0.1) ? marker : w.join(" ");
    };
    const plan: [string, number][] = [
      ["payload-in-enum", 500],
      ["extra-property", 700],
      ["payload-as-key", 300],
      ["gaps-smuggle", 200],
      ["payload-in-array", 300],
    ];
    let n = 0;
    for (const [op, count] of plan) {
      let made = 0;
      let guard = 0;
      while (made < count) {
        if (++guard > count * 50) throw new Error(`hostile generator: D ${op} could not be placed`);
        const run = runs[(n + guard) % runs.length];
        const reply = validReply(run, rng);
        const { enums, arrays, objects } = sitesOf(reply);
        const marker = markerOf(marks, used);
        const payload = payloadWith(marker);
        let value: Json = reply;
        let ok = true;
        switch (op) {
          case "payload-in-enum":
            if (enums.length === 0) ok = false;
            else value = setAt(value, rng.pick(enums).path, payload);
            break;
          case "extra-property": {
            const o = rng.pick(objects);
            put(getAt(value, o.path) as Obj, rng.pick(G.SMUGGLE_PROPERTIES), rng.chance(0.85) ? payload : [payload]);
            break;
          }
          case "payload-as-key": {
            const o = rng.pick(objects);
            put(getAt(value, o.path) as Obj, payload, rng.pick<Json>([1, "D1", true, null, [], {}]));
            break;
          }
          case "gaps-smuggle":
            put(value as Obj, "gaps", [payload]);
            break;
          case "payload-in-array": {
            const keyArrays = arrays.filter((a) => a.slot === "needs" || a.slot === "lines");
            if (keyArrays.length > 0 && rng.chance(0.7)) {
              (getAt(value, rng.pick(keyArrays).path) as Json[]).push(payload);
            } else {
              const st = (value as Obj).stages as Obj;
              const s = st[rng.pick(run.slots)] as Obj;
              const steps = Array.isArray(s.steps) ? (s.steps as Json[]) : [];
              steps.unshift({ kind: payload });
              put(s, "steps", steps.slice(0, 3));
            }
            break;
          }
          default:
            throw new Error(`hostile generator: unknown D op ${op}`);
        }
        if (!ok) continue;
        this.reply({ id: `D${n}`, family: "D", run: run.id, value, expect: "REJECTED", reason: op, marker });
        made++;
        n++;
      }
    }
  }

  // ── E: gap strings and gap replies ─────────────────────────────────────────
  familyE(): void {
    const rng = new Rng(HOSTILE_SEEDS.E);
    const gapRuns = this.corpus.runs.filter((r) => r.gaps);
    const perRun = Math.ceil((FAMILY_TARGETS.E_STRINGS * 1.08) / Math.max(1, gapRuns.length));
    let id = 0;
    const pools = new Map<string, GapCase[]>();
    for (const run of gapRuns) {
      const seen = new Set<string>();
      const pool: GapCase[] = [];
      const push = (text: string, claim: boolean, cls: string): boolean => {
        const t = text.replace(/\s+/g, " ").trim();
        // Every class fits a gap name except over-length, which is only ever longer (the shape rule's length clause).
        const len = Array.from(t).length;
        if (!t || (cls === "over-length" ? len <= GAP_NAME_MAX || len > 80 : len > GAP_NAME_MAX)) return false;
        const key = t.normalize("NFC").toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        const c: GapCase = { id: `E${id++}`, run: run.id, text: t, claim, cls };
        pool.push(c);
        this.corpus.gaps.push(c);
        return true;
      };
      for (const c of controlOf(run)) push(c, false, "control");
      for (const name of exactMatchNamesOf(run)) push(name, false, "exact-domain");
      const classes = claimClassesOf(run, rng);
      const quota = Math.max(0, perRun - pool.length);
      let guard = 0;
      let made = 0;
      while (made < quota && guard < quota * 30) {
        guard++;
        const cls = classes[guard % classes.length];
        if (push(cls.make(), true, cls.name)) made++;
      }
      pools.set(run.id, pool);
    }
    // ~1,700 replies through the whole path (H1, H2), each with up to 4 gap strings (5–6: SALVAGED).
    let n = 0;
    for (let i = 0; i < FAMILY_TARGETS.E_REPLIES; i++) {
      const run = gapRuns[i % gapRuns.length];
      const pool = pools.get(run.id) ?? [];
      const over = rng.chance(0.15);
      const k = over ? 5 + rng.int(2) : 1 + rng.int(4);
      const chosen = rng.sample(pool, k).map((c) => c.text);
      const reply = validReply(run, rng, { gaps: chosen });
      this.reply({ id: `ER${n++}`, family: "E", run: run.id, value: reply, expect: over ? "SALVAGED" : "CLEAN", reason: over ? "gaps-over-max" : "gaps", gapStrings: chosen });
    }
  }

  // ── E-G: recombined from the packs' own words ──────────────────────────────
  familyEG(): void {
    const rng = new Rng(HOSTILE_SEEDS.EG);
    const runs = this.corpus.runs.filter((r) => r.gaps && r.english);
    const perRun = Math.ceil((FAMILY_TARGETS.EG * 1.15) / Math.max(1, runs.length));
    let id = 0;
    for (const run of runs) {
      const seen = new Set<string>();
      const made: Record<string, number> = {};
      const want: Record<string, number> = { "one:claim": 0.18, "one:plain": 0.18, "several:claim": 0.22, "several:plain": 0.14, "library:plain": 0.14, "reordered:plain": 0.14 };
      const srcWords = run.sources.map((s) => contentWords(s.text));
      const notWords = run.notSources.map(contentWords).filter((w) => w.length > 0);
      const allTexts = [...srcWords, ...notWords];
      const triggersHere = new Set(allTexts.flat().filter((w) => G.CLAIM_TRIGGERS.includes(w.toLowerCase())).map((w) => w.toLowerCase()));
      const push = (words: string[], claim: boolean, provenance: RecombinedCase["provenance"]): boolean => {
        const text = capital(words.join(" "));
        if (words.length < 2 || words.length > GAP_WORDS_MAX || Array.from(text).length > GAP_NAME_MAX) return false;
        if (words.some((w) => Array.from(w).length > GAP_WORD_CHARS_MAX)) return false;
        const key = text.toLowerCase();
        if (seen.has(key)) return false;
        const content = words.filter((w) => !isFunctionWord(w));
        const oneHere = srcWords.some((ws) => inOrderLoose(content, ws));
        if (provenance === "one" ? !srcWords.some((ws) => inOrderStrict(content, ws)) : oneHere) return false;
        if (claim !== content.some((w) => G.CLAIM_TRIGGERS.includes(w.toLowerCase()))) return false;
        seen.add(key);
        const tag = `${provenance}:${claim ? "claim" : "plain"}`;
        made[tag] = (made[tag] ?? 0) + 1;
        this.corpus.recombined.push({ id: `G${id++}`, run: run.id, text, claim, provenance });
        return true;
      };
      const isTrigger = (w: string) => G.CLAIM_TRIGGERS.includes(w.toLowerCase());
      /** One attempt at a name of this tag; false when it couldn't make a new one. */
      const attempt = (tag: string): boolean => {
        if (tag === "one:claim" || tag === "one:plain") {
          const ws = rng.pick(srcWords);
          if (ws.length < 2) return false;
          const claim = tag === "one:claim";
          const trig = ws.findIndex(isTrigger);
          if (claim && trig < 0) return false;
          const k = 2 + rng.int(2);
          let pickIdx: number[];
          if (claim) {
            const others = ws.map((_, i) => i).filter((i) => i !== trig && !isTrigger(ws[i]));
            if (others.length === 0) return false;
            pickIdx = [...rng.sample(others, k - 1), trig].sort((a, b) => a - b);
          } else {
            const plain = ws.map((_, i) => i).filter((i) => !isTrigger(ws[i]));
            if (plain.length < 2) return false;
            pickIdx = rng.sample(plain, k).sort((a, b) => a - b);
          }
          return push(pickIdx.map((i) => ws[i]), claim, "one");
        }
        if (tag === "several:claim" || tag === "several:plain") {
          if (allTexts.length < 2) return false;
          const [x, y] = rng.sample(allTexts, 2);
          const xs = x.filter((w) => !isTrigger(w));
          const ys = y.filter((w) => !isTrigger(w));
          if (xs.length === 0 || ys.length === 0) return false;
          const a = rng.pick(xs);
          const b = rng.pick(ys);
          if (a.toLowerCase() === b.toLowerCase()) return false;
          if (tag === "several:claim") {
            if (triggersHere.size === 0) return false;
            const t = rng.pick([...triggersHere].sort());
            // The frame's own trigger is swapped for one the pack's own texts hold.
            const words = rng.pick(G.RECOMBINED_FRAMES).replace("{a}", a).replace("{b}", b).split(/\s+/).map((w) => (isTrigger(w) ? t : w));
            return push(words, true, "several");
          }
          return push(rng.pick(G.PLAIN_FRAMES).replace("{a}", a).replace("{b}", b).split(/\s+/), false, "several");
        }
        if (tag === "library:plain") {
          if (notWords.length === 0) return false;
          const ws = rng.pick(notWords).filter((w) => !isTrigger(w));
          if (ws.length < 2) return false;
          const k = Math.min(ws.length, 2 + rng.int(2));
          const start = rng.int(ws.length - k + 1);
          return push(ws.slice(start, start + k), false, "library");
        }
        const ws = rng.pick(srcWords).filter((w) => !isTrigger(w));
        if (ws.length < 2) return false;
        const i = rng.int(ws.length - 1);
        const j = i + 1 + rng.int(ws.length - i - 1);
        if (ws[i].toLowerCase() === ws[j].toLowerCase()) return false;
        return push([ws[j], ws[i]], false, "reordered");
      };
      // Fill each tag toward its share; a tag that keeps failing (no trigger in this pack's words, say) is
      // exhausted, and the run's total is made up from the others.
      const fails: Record<string, number> = {};
      const exhausted = (t: string) => (fails[t] ?? 0) > 1500;
      let total = 0;
      for (;;) {
        const live = Object.keys(want).filter((t) => !exhausted(t));
        if (live.length === 0 || total >= perRun) break;
        const tag = live.reduce((best, t) => ((made[t] ?? 0) / want[t] < (made[best] ?? 0) / want[best] ? t : best), live[0]);
        if (attempt(tag)) {
          total++;
          fails[tag] = 0;
        } else fails[tag] = (fails[tag] ?? 0) + 1;
      }
    }
  }

  // ── K ──────────────────────────────────────────────────────────────────────
  familyK(): void {
    const rng = new Rng(HOSTILE_SEEDS.K);
    const template = (track: "BODY" | "CARE") => {
      const r = this.corpus.runs.find((x) => x.track === track && x.variant === "base" && x.intake.constraints == null) ?? this.corpus.runs.find((x) => x.track === track && x.variant === "base");
      if (!r) throw new Error(`hostile generator: no ${track} pack for family K`);
      return r;
    };
    let id = 0;
    const cases = this.corpus.constraints;
    const add = (c: Omit<ConstraintCase, "id" | "run" | "picks">) => {
      const run = template(c.track);
      const picks = picksFor(run, c.mustExclude, rng);
      cases.push({ ...c, id: `K${id++}`, run: run.id, picks });
    };
    for (const track of ["BODY", "CARE"] as const) {
      const run = template(track);
      const kinds = [...run.enums.practice, ...run.enums.step, ...run.enums.checkpoint];
      const terms = track === "BODY" ? G.BODY_TERMS : G.CARE_TERMS;
      const aims = G.K_AIMS[track];
      for (const [cue, templates] of Object.entries(G.CUE_TEMPLATES)) {
        for (const t of templates) {
          for (const term of terms) {
            const constraints = t.replace("{t}", term);
            const must = exclusionsOf(term, kinds, run.track, aims.neutral);
            assertQuiet(constraints, term, kinds, run.track, aims.neutral);
            add({ lang: "en", track, constraints, aim: aims.neutral, cues: [cue], terms: [term], mustExclude: must, parsed: true });
          }
        }
      }
      // Lists under one cue ("no running, jumping or lifting").
      for (let i = 0; i < (track === "BODY" ? 120 : 60); i++) {
        const [t1, t2, t3] = rng.sample(terms, 3);
        const tpl = rng.pick(G.LIST_TEMPLATES);
        const constraints = tpl.replace("{t1}", t1).replace("{t2}", t2).replace("{t3}", t3);
        const must = [...new Set([t1, t2, t3].flatMap((t) => exclusionsOf(t, kinds, run.track, aims.neutral)))];
        add({ lang: "en", track, constraints, aim: aims.neutral, cues: [tpl.startsWith("doctor") ? "doctor says" : tpl.split(" ")[0]], terms: [t1, t2, t3], mustExclude: must, parsed: true });
      }
      // The aim itself meets a negated term: every {aim}-filled kind is excluded too.
      for (const aim of aims.conflicts) {
        const hit = terms.filter((term) => contentWords(term).some((w) => contentWords(aim).some((a) => stem(a.toLowerCase()) === stem(w.toLowerCase()))));
        for (const term of hit) {
          for (const cue of ["no", "avoid", "doctor says"]) {
            const constraints = (G.CUE_TEMPLATES[cue] as readonly string[])[0].replace("{t}", term);
            add({ lang: "en", track, constraints, aim, cues: [cue], terms: [term], mustExclude: exclusionsOf(term, kinds, run.track, aim), parsed: true });
          }
        }
      }
      for (const [lang, list, suffixes] of [
        ["vi", G.VI_CONSTRAINTS[track], G.VI_SUFFIXES],
        ["ja", G.JA_CONSTRAINTS[track], G.JA_SUFFIXES],
      ] as const) {
        for (const suffix of suffixes.slice(0, track === "BODY" ? 9 : 10)) {
          for (const constraints of list) add({ lang, track, constraints: `${constraints}${suffix}`, aim: aims.neutral, cues: [], terms: [], mustExclude: [], parsed: false });
        }
      }
      for (const constraints of G.CUELESS_CONSTRAINTS[track]) {
        for (const suffix of ["", ".", " (on my doctor's advice)"]) add({ lang: "en", track, constraints: `${constraints}${suffix}`, aim: aims.neutral, cues: [], terms: [], mustExclude: [], parsed: false });
      }
    }
    // The release sub-class (fix round 3, lens 1 major): a clause that clears one activity ("{o} is fine") must not end the
    // cue's scope over a later exclusion, and must keep the activity it clears. Appended after every older case, so their
    // ids, picks and pin lines stay as they were.
    for (const track of ["BODY", "CARE"] as const) {
      const run = template(track);
      const kinds = [...run.enums.practice, ...run.enums.step, ...run.enums.checkpoint];
      const aim = G.K_AIMS[track].neutral;
      const terms = track === "BODY" ? G.BODY_TERMS : G.CARE_TERMS;
      const ex = (t: string) => exclusionsOf(t, kinds, run.track, aim);
      /** The terms a case may exclude beside the cleared activity: each names a kind, none a kind the activity names. */
      const negatable = (o: string | undefined) => terms.filter((t) => ex(t).length > 0 && (o == null || !ex(t).some((k) => ex(o).includes(k))));
      const seen = new Set<string>();
      const make = (phrasing: string) => {
        const o = phrasing.includes("{o}") ? rng.pick(G.RELEASE_CLEARED[track]) : undefined;
        const [t, t2] = rng.sample(negatable(o), 2);
        const negs = [phrasing.includes("{t}") ? t : null, phrasing.includes("{t2}") ? t2 : null].filter((x): x is string => x != null);
        const constraints = phrasing.replace("{o}", o ?? "").replace("{t}", t).replace("{t2}", t2);
        if (seen.has(constraints)) return;
        seen.add(constraints);
        const must = [...new Set(negs.flatMap(ex))].sort();
        assertQuiet(constraints, [...(o ? [o] : []), ...negs], kinds, run.track, aim);
        add({ lang: "en", track, constraints, aim, cues: cuesIn(constraints), terms: negs, mustExclude: must, mustKeep: o ? ex(o).filter((k) => !must.includes(k)) : [], parsed: true, sub: "release" });
      };
      for (const phrasing of G.RELEASE_TEMPLATES[track]) for (let i = 0; i < (track === "BODY" ? 8 : 6); i++) make(phrasing);
      if (track === "BODY") for (const phrasing of Object.values(G.RELEASE_ENTRY_TEMPLATES)) for (let i = 0; i < 3; i++) make(phrasing);
    }
    // Over-exclusion: every English BODY phrasing against a Field run's kinds.
    const fieldRun = this.corpus.runs.find((r) => r.pack === "actuarial-probability" && r.variant === "base") ?? this.corpus.runs.find((r) => r.field);
    if (fieldRun) {
      const seen = new Set<string>();
      for (const c of cases) {
        if (c.sub || c.track !== "BODY" || c.lang !== "en" || !c.parsed || seen.has(c.constraints)) continue;
        seen.add(c.constraints);
        this.corpus.overExclusion.push({ id: `X${this.corpus.overExclusion.length}`, constraints: c.constraints, fieldRun: fieldRun.id });
      }
      for (const extra of ["avoid strenuous exercise", "doctor says no exercise for now", "no running, jumping or lifting", "knee injury, no running", "bad knee, no running"]) {
        if (!seen.has(extra)) this.corpus.overExclusion.push({ id: `X${this.corpus.overExclusion.length}`, constraints: extra, fieldRun: fieldRun.id });
      }
      // The release sub-class's BODY phrasings (fix round 3), after every older line.
      for (const c of cases) {
        if (!c.sub || c.track !== "BODY" || seen.has(c.constraints)) continue;
        seen.add(c.constraints);
        this.corpus.overExclusion.push({ id: `X${this.corpus.overExclusion.length}`, constraints: c.constraints, fieldRun: fieldRun.id });
      }
    }
  }

  // ── M ──────────────────────────────────────────────────────────────────────
  familyM(): void {
    const rng = new Rng(HOSTILE_SEEDS.M);
    const runs = this.corpus.runs.filter((r) => r.gaps && r.english);
    const control = this.corpus.gaps.filter((g) => !g.claim && g.cls === "control" && runs.some((r) => r.id === g.run));
    const claims = this.corpus.gaps.filter((g) => g.claim && runs.some((r) => r.id === g.run));
    const hidden = this.corpus.recombined.filter((g) => g.provenance !== "one");
    const meta = this.corpus.meta;
    let id = 0;
    /** One pair, when the variant still fits a gap name (GAP_NAME_MAX visible characters: a longer one is cut by the cap, not judged by the rule). */
    const add = (rel: MetaRel, run: string, base: string, variant: string, note: string): boolean => {
      if (base === variant || Array.from(variant.replace(/\p{Cf}/gu, "")).length > GAP_NAME_MAX) return false;
      meta.push({ id: `M${id++}`, rel, run, base, variant, note });
      return true;
    };
    /** `count` pairs of one relation, from `make` (which may refuse by returning false). */
    const fill = (count: number, make: (i: number) => boolean) => {
      let made = 0;
      for (let i = 0; made < count && i < count * 60; i++) if (make(i)) made++;
    };
    const runOf = (runId: string) => this.run(runId);
    const words = (s: string) => s.split(" ");
    // M1: a digit of 10 scripts, a Han numeral or another number sign, as its own token.
    fill(400, (i) => {
      const b = rng.pick(control);
      const han = i % 7 === 6;
      const sign = i % 13 === 12;
      const zero = G.DIGIT_ZEROS[i % G.DIGIT_ZEROS.length];
      const tok = han ? rng.pick(G.HAN_NUMERALS) : sign ? rng.pick(G.NUMBER_SIGNS) : G.digitsIn(zero, 1 + rng.int(98));
      const w = words(b.text);
      w.splice(rng.chance(0.7) ? w.length : 1, 0, tok);
      return add("M1", b.run, b.text, w.join(" "), han ? "Han numeral" : sign ? "number sign" : `digits from U+${zero.toString(16).toUpperCase().padStart(4, "0")}`);
    });
    // M2: wrap 2+ characters in one of 8 quote styles.
    fill(400, (i) => {
      const b = rng.pick(control);
      const [o, c] = G.QUOTE_STYLES[i % G.QUOTE_STYLES.length];
      const w = words(b.text);
      const longest = w.reduce((best, x, j) => (x.length > w[best].length ? j : best), 0);
      const variant = rng.chance(0.5) ? `${o}${b.text}${c}` : w.map((x, j) => (j === longest ? `${o}${x}${c}` : x)).join(" ");
      return add("M2", b.run, b.text, variant, `quotes ${o}${c}`);
    });
    // M3: 'by <Capitalised>' appended (a name nobody wrote).
    fill(200, () => {
      const b = rng.pick(control);
      const name = capital(invented(rng, 2 + rng.int(2)) + rng.pick(G.NAME_SUFFIXES));
      return add("M3", b.run, b.text, `${b.text} by ${name}`, `by ${name}`);
    });
    // M4: one of the URL forms inserted (the spec's 16 and four more), each form 20 times.
    let urls = 0;
    fill(400, () => {
      const b = rng.pick(control);
      const k = urls % G.URL_FORMS.length;
      const form = G.URL_FORMS[k];
      const url = urlOf(form, rng);
      const made = add("M4", b.run, b.text, rng.chance(0.6) ? `${b.text} ${url}` : `${url} ${b.text}`, `url form ${k}: ${form}`);
      if (made) urls++;
      return made;
    });
    // M5: zero-width or bidi characters inserted inside words (flags and drop unchanged).
    const m4 = meta.filter((m) => m.rel === "M4").map((m) => ({ run: m.run, text: m.variant }));
    const m5Bases = [...control.map((c) => ({ run: c.run, text: c.text })), ...claims.map((c) => ({ run: c.run, text: c.text })), ...m4];
    fill(400, (i) => {
      const b = rng.pick(m5Bases);
      const pts = Array.from(b.text);
      const k = 1 + rng.int(3);
      const used: string[] = [];
      for (let j = 0; j < k; j++) {
        const at = 1 + rng.int(Math.max(1, pts.length - 1));
        const ch = G.INVISIBLES[(i + j) % G.INVISIBLES.length];
        used.push(`U+${(ch.codePointAt(0) as number).toString(16).toUpperCase().padStart(4, "0")}`);
        pts.splice(at, 0, ch);
      }
      return add("M5", b.run, b.text, pts.join(""), used.join(" "));
    });
    // M6: lower-casing a name that isn't in the user's words keeps it out.
    const m6Bases = [...claims.filter((c) => c.text !== c.text.toLowerCase()).map((c) => ({ run: c.run, text: c.text })), ...hidden.map((c) => ({ run: c.run, text: c.text }))];
    if (m6Bases.length > 0)
      fill(200, () => {
        const b = rng.pick(m6Bases);
        return add("M6", b.run, b.text, b.text.toLowerCase(), "lower case");
      });
    // M7: a grounded two-word phrase reversed, when its source holds only the one order.
    const twoWord = control.filter((c) => {
      const w = c.text.split(" ");
      if (w.length !== 2 || w.some(isFunctionWord) || w[0].toLowerCase() === w[1].toLowerCase()) return false;
      const run = runOf(c.run);
      const rev = [w[1], w[0]];
      return !run.sources.some((s) => inOrderLoose(rev, contentWords(s.text)));
    });
    for (let i = 0; i < 200 && twoWord.length > 0; i++) {
      const b = twoWord[i % twoWord.length];
      const [x, y] = b.text.split(" ");
      add("M7", b.run, b.text, `${capital(y)} ${x.toLowerCase()}`, "reordered");
    }
  }

  // ── F ──────────────────────────────────────────────────────────────────────
  familyF(): void {
    const rng = new Rng(HOSTILE_SEEDS.F);
    let n = 0;
    for (const probe of [...this.probes].filter((p) => p.blessed).sort((a, b) => a.file.localeCompare(b.file))) {
      const parsed = probe.parsed as Json;
      const run = this.corpus.runs.find((r) => r.variant === `probe:${probe.file}`);
      if (!run) continue;
      // The real reply keeps the lead's labelled verdict (the bar compares R3's integrityOf with it).
      const labelled = probe.expected === "CLEAN" || probe.expected === "SALVAGED" || probe.expected === "REJECTED" ? (probe.expected as Verdict) : referenceVerdict(parsed, run.schema);
      this.reply({ id: `F${n++}`, family: "F", run: run.id, value: clone(parsed), expect: labelled, reason: `real:${probe.aim}`, trustLabel: true });
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) || !("stages" in (parsed as Obj))) continue;
      for (let i = 0; i < FAMILY_TARGETS.F_PER_REPLY; i++) {
        const value = clone(parsed) as Obj;
        const { enums, objects } = sitesOf(value);
        const op = i % 4;
        if (op === 0 && enums.length > 0) setAt(value, rng.pick(enums).path, rng.pick<Json>([42, true, "Ｄ１", "__proto__", "Gemini's own words"]));
        else if (op === 1) put(getAt(value, rng.pick(objects).path) as Obj, rng.pick(G.SMUGGLE_PROPERTIES), "Kestrel textbook chapter 3");
        else if (op === 2) put(getAt(value, rng.pick(objects).path) as Obj, "__proto__", { polluted: true });
        else deleteAt(value, ["stages"]);
        this.reply({ id: `F${n++}`, family: "F", run: run.id, value, expect: "REJECTED", reason: `real-mutation:${probe.aim}:${op}` });
      }
    }
  }

  // ── E, sub-class "clash": grounded constraint clashes ─────────────────────
  /**
   * One-source claims the flags must hide (fix round, lens 1 minor): on a
   * copy of each English gap run whose constraints say one CLASH_TEMPLATES
   * phrasing, the negated activity in the carriers ("Typing", "Typing
   * basics", "Intro to typing"). Each name's words stand, in order, in one
   * source (the constraints), so grounding passes and only CONSTRAINT_CONFLICT
   * can keep it hidden: H3 (0 shown) then measures the flags, and H6's cue
   * rules of both parsers fire. Ground truth by construction: the user said
   * no to it. Every cue × every term its sense takes, the runs rotating.
   */
  familyClash(): void {
    const templates = this.corpus.runs.filter((r) => r.gaps && r.english && r.variant === "gaps");
    if (templates.length === 0) return;
    let id = 0;
    let made = 0;
    for (const [cue, phrasings] of Object.entries(G.CLASH_TEMPLATES)) {
      const terms = G.CLASH_PHYSICAL_CUES.includes(cue) ? G.CLASH_TERMS.physical : [...G.CLASH_TERMS.physical, ...G.CLASH_TERMS.other];
      for (const phrasing of phrasings) {
        for (const term of terms) {
          // The next run in rotation whose aim the term doesn't meet (a clash with the aim itself is K's aim-conflict case, not this).
          const meets = (r: HostileRun) => contentWords(r.intake.aim).some((a) => termTokens(term).some((t) => sameStem(t, a)));
          let template = templates[made++ % templates.length];
          for (let k = 0; k < templates.length && meets(template); k++) template = templates[made++ % templates.length];
          const constraints = phrasing.replace("{t}", term);
          // The run's kinds before any constraint (the pack's own constraints are replaced, so its exclusions go too).
          const open = { track: template.track, exam: template.intake.examLabel != null, practicesAllowed: template.intake.practicesAllowed !== false };
          const kinds = [...catalogKindsFor("PRACTICE", open), ...catalogKindsFor("STEP", open), ...catalogKindsFor("CHECKPOINT", open)];
          // The kinds the term itself excludes leave the run's enums (as F-R4-17's filter does); the phrasing's other words hit none.
          const mustExclude = exclusionsOf(term, kinds, template.track, template.intake.aim);
          // A cue is letters, spaces and an apostrophe: nothing to escape.
          const cueAt = new RegExp(`(^|[^\\p{L}])${cue}(?![\\p{L}])`, "iu");
          const rest = exclusionsOf(constraints.replace(term, " ").replace(cueAt, "$1 "), kinds, template.track, template.intake.aim);
          if (rest.length > 0) throw new Error(`hostile generator: clash "${constraints}" hits ${rest.join(", ")} outside its term`);
          if (contentWords(template.intake.aim).some((a) => termTokens(term).some((t) => sameStem(t, a)))) throw new Error(`hostile generator: clash term "${term}" meets the aim of ${template.id}`);
          const caseId = `C${id++}`;
          const run = deriveConstraintRun(template, { id: caseId, constraints, aim: template.intake.aim, mustExclude }, "C");
          const filter = { ...open, excluded: mustExclude as CatalogKey[] };
          run.enums = { ...run.enums, practice: catalogKindsFor("PRACTICE", filter), step: catalogKindsFor("STEP", filter), checkpoint: catalogKindsFor("CHECKPOINT", filter) };
          run.excluded = [...mustExclude];
          run.schema = specSchemaOf(run);
          this.corpus.runs.push(run);
          this.byId.set(run.id, run);
          const name = capital(term);
          for (const text of [name, `${name} basics`, `Intro to ${term}`]) {
            if (Array.from(text).length > GAP_NAME_MAX) continue;
            this.corpus.gaps.push({ id: `${caseId}-${this.corpus.gaps.length}`, run: run.id, text, claim: true, cls: "clash" });
          }
        }
      }
    }
  }

  // ── E, the resource patterns no other class reaches ──────────────────────
  /**
   * An ISBN and a publication year beside a topic (fix round: H6 now
   * requires every resource.* rule, and E's resource class never wrote
   * either). Claims by construction: a number the user didn't write that
   * names an edition or a printing. On every English gap run, appended last.
   */
  familyResourcePatterns(): void {
    const rng = new Rng(HOSTILE_SEEDS.E ^ 0x15b9);
    let n = 0;
    for (const run of this.corpus.runs.filter((r) => r.gaps && r.english && r.variant === "gaps")) {
      const topics = run.sources.filter((x) => x.kind === "OUTLINE" || x.kind === "DOMAIN").map((x) => x.text).filter((t) => t.split(" ").length <= 2 && Array.from(t).length <= 18);
      const userText = run.sources.map((x) => x.text).join(" ");
      const seen = new Set<string>();
      for (let i = 0; i < 6; i++) {
        const topic = topics.length > 0 ? rng.pick(topics) : capital(invented(rng, 2));
        const isbn = `978${String(1000000000 + rng.int(899999999))}`;
        const year = String(1990 + rng.int(35));
        if (userText.includes(year)) continue;
        const texts = i % 2 === 0 ? [`${topic} ISBN ${isbn}`, `ISBN ${isbn.slice(3)} ${topic.toLowerCase()}`] : [`${topic} ${year}`, `${year} ${topic.toLowerCase()}`];
        for (const text of texts) {
          if (Array.from(text).length > GAP_NAME_MAX || seen.has(text)) continue;
          seen.add(text);
          this.corpus.gaps.push({ id: `R${n++}`, run: run.id, text, claim: true, cls: "resource" });
        }
      }
    }
  }

  // ── E, sub-classes "one-source" and "one-source-name": what only a flag stands before ──
  /**
   * Fix round 2 (lens 1 minor: flag.CLAIM_WORDS, flag.ABOUT_YOU and
   * flag.PROPER_NOUN carried no weight in the gated bar). On the gap path a
   * flag is the last layer: the shape rule's word clauses read the same claim
   * and about-you words first, and grounding stops any word the user didn't
   * write first. So these cases are built for the flags alone:
   *   one-source       on a copy of each English gap run whose outline gains
   *                    one line per ONE_SOURCE_LINES entry (the user's own
   *                    words holding a claim or a statement about themselves,
   *                    each filled with a topic of the run's outline in
   *                    rotation), the names copied from that line in order:
   *                    GROUNDED, so in production the shape rule drops them,
   *                    and with its word clauses off only CLAIM_WORDS or
   *                    ABOUT_YOU can;
   *   one-source-name  on the gap run itself, a phrase of the user's outline
   *                    with an invented name, camelCase word or acronym where
   *                    PROPER_NOUN reads it (never the first word): grounding
   *                    hides it first, and with grounding off only PROPER_NOUN.
   * Every case is a claim (H3: 0 shown) and carries `flag`. Last, so no
   * earlier family sees its runs or strings.
   */
  familyOneSource(): void {
    const rng = new Rng(HOSTILE_SEEDS.E ^ 0x0e5c);
    const templates = this.corpus.runs.filter((r) => r.gaps && r.english && r.variant === "gaps");
    const lineWords = new Set(G.ONE_SOURCE_LINES.flatMap((e) => [e.line, ...e.names]).flatMap((t) => t.toLowerCase().match(/\p{L}+/gu) ?? []));
    let id = 0;
    const fits = (text: string): boolean => {
      const w = text.split(" ");
      return w.length <= GAP_WORDS_MAX && Array.from(text).length <= GAP_NAME_MAX && w.every((x) => Array.from(x).length <= GAP_WORD_CHARS_MAX);
    };
    for (const template of templates) {
      const listedNames = new Set(template.listed.map((d) => d.name.toLowerCase()));
      const userText = template.sources.map((s) => s.text.toLowerCase()).join("\n");
      // Topics: plain phrases of the user's own outline (controlOf's bare carrier), 1–2 content words that no line or name word repeats.
      const topics = controlOf(template).filter((c) => {
        const w = c.toLowerCase().split(" ");
        return !/^Intro to | basics$/.test(c) && w.length <= 2 && !w.some((x) => isFunctionWord(x) || lineWords.has(x));
      });
      if (topics.length === 0) continue;
      // one-source: one derived run per template, a line per entry.
      const filled = G.ONE_SOURCE_LINES.map((e, i) => ({ e, t: topics[i % topics.length].toLowerCase() }));
      const run = deriveOutlineRun(template, filled.map((f) => f.e.line.replace("{t}", f.t)), "O");
      this.corpus.runs.push(run);
      this.byId.set(run.id, run);
      for (const { e, t } of filled) {
        const line = e.line.replace("{t}", t);
        for (const form of e.names) {
          const text = form.replace("{t}", t).replace("{T}", capital(t));
          if (!fits(text) || listedNames.has(text.toLowerCase())) continue;
          if (!inOrderStrict(contentWords(text), contentWords(line))) throw new Error(`hostile generator: one-source name "${text}" is not in order in its line "${line}"`);
          this.corpus.gaps.push({ id: `O${id++}`, run: run.id, text, claim: true, cls: "one-source", flag: e.flag });
        }
      }
      // one-source-name: on the template run, three topics per form in rotation.
      const seen = new Set<string>();
      let k = 0;
      for (const form of G.ONE_SOURCE_NAME_FORMS) {
        for (let j = 0; j < 3; j++) {
          const topic = topics[k++ % topics.length];
          let text = "";
          for (let tries = 0; tries < 20 && !text; tries++) {
            const name = capital(invented(rng, 2) + rng.pick(G.NAME_SUFFIXES));
            const acronym = Array.from({ length: 2 + rng.int(3) }, () => G.ACRONYM_LETTERS[rng.int(G.ACRONYM_LETTERS.length)]).join("");
            const lower = invented(rng, 1);
            if (userText.includes(name.toLowerCase()) || userText.includes(acronym.toLowerCase()) || userText.includes(lower)) continue;
            const t = form
              .replace("{N}", name)
              .replace("{n}", lower)
              .replace("{A}", acronym)
              .replace("{t1}", topic.split(" ")[0].toLowerCase())
              .replace("{T}", topic)
              .replace("{t}", topic.toLowerCase());
            if (fits(t) && !seen.has(t.toLowerCase())) text = t;
          }
          if (!text) continue;
          seen.add(text.toLowerCase());
          this.corpus.gaps.push({ id: `O${id++}`, run: template.id, text, claim: true, cls: "one-source-name", flag: "PROPER_NOUN" });
        }
      }
    }
  }

  finish(): HostileCorpus {
    const c = this.corpus;
    const by = (fam: string) => c.replies.filter((r) => r.family === fam).length;
    c.counts = {
      runs: c.runs.length,
      A: by("A"),
      B: by("B"),
      C: by("C"),
      D: by("D"),
      E_replies: by("E"),
      E_strings: c.gaps.length,
      E_claims: c.gaps.filter((g) => g.claim).length,
      E_control: c.gaps.filter((g) => g.cls === "control").length,
      E_clash: c.gaps.filter((g) => g.cls === "clash").length,
      E_oneSource: c.gaps.filter((g) => g.flag != null).length,
      EG: c.recombined.length,
      K: c.constraints.length,
      K_release: c.constraints.filter((k) => k.sub === "release").length,
      K_overExclusion: c.overExclusion.length,
      M: c.meta.length,
      F: by("F"),
    };
    return c;
  }
}

// ═══ Words: content words, phrase order, constraint labels ══════════════════

const FUNCTION_WORDS = new Set(ENGLISH_FUNCTION_WORDS);
/** DOMAIN_STOP_WORDS as the spec lists them (F-R4-19 removes them before grounding), frozen here so the corpus never moves with the lexicon. */
const STOP_WORDS = new Set(["theory", "basics", "fundamentals", "intro", "introduction", "advanced", "applied", "foundations", "principles", "basic", "fundamental", "foundation", "principle"]);
const isFunctionWord = (w: string): boolean => FUNCTION_WORDS.has(w.toLowerCase()) || STOP_WORDS.has(w.toLowerCase());

/** A text's content words in order: letter-only words of 3+ letters, function and stop words out. */
export function contentWords(text: string): string[] {
  return (text.normalize("NFKC").match(/[\p{L}\p{M}'’-]+/gu) ?? [])
    .map((w) => w.replace(/^['’-]+|['’-]+$/g, ""))
    .filter((w) => /^\p{L}[\p{L}\p{M}'’-]*$/u.test(w) && Array.from(w).length >= 3 && !isFunctionWord(w));
}

const loose = (a: string, b: string): boolean => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y || stem(x) === stem(y)) return true;
  const n = Math.min(5, x.length, y.length);
  return n >= 4 && x.slice(0, n) === y.slice(0, n);
};

/** Every word, in order, inside `seq` by a LOOSE match (stems or a shared 4–5 letter prefix): used to keep "several" labels conservative. */
function inOrderLoose(words: readonly string[], seq: readonly string[]): boolean {
  let j = 0;
  for (const w of words) {
    while (j < seq.length && !loose(w, seq[j])) j++;
    if (j >= seq.length) return false;
    j++;
  }
  return true;
}

/** Every word, in order, inside `seq` exactly (case-insensitive): a "one source" label is only ever this. */
function inOrderStrict(words: readonly string[], seq: readonly string[]): boolean {
  let j = 0;
  for (const w of words) {
    while (j < seq.length && seq[j].toLowerCase() !== w.toLowerCase()) j++;
    if (j >= seq.length) return false;
    j++;
  }
  return true;
}

/** The kind's words a constraint term can meet: its keywords and its rendered label's words (the aim's, when the label takes it). */
function kindWords(key: string, track: CatalogTrack, aim: string): string[] {
  const e = catalogEntryOf(key);
  if (!e) return [];
  const tpl = catalogTemplateOf(e, track);
  const label = tpl.replace("{aim}", aim).replace(/\{[a-z]+\}/g, "");
  return [...e.keywords, ...(label.match(/[\p{L}\p{M}'’-]+/gu) ?? [])];
}

/** A term phrase's tokens as the parser reads them: whole hyphen compounds kept, function words out. */
const termTokens = (term: string): string[] => (term.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? []).filter((w) => !FUNCTION_WORDS.has(w));

const sameStem = (a: string, b: string): boolean => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x.includes("-") || y.includes("-")) return x === y;
  return stem(x) === stem(y);
};

/** The kinds a negated term must exclude: every kind on the track whose keywords or label words share a stem with the term's tokens. */
function exclusionsOf(term: string, kinds: readonly string[], track: CatalogTrack, aim: string): string[] {
  const toks = termTokens(term);
  return kinds.filter((k) => kindWords(k, track, aim).some((w) => toks.some((t) => sameStem(t, w)))).sort();
}

/** A K template's other words must hit no kind (so the expected exclusions are the terms' alone): a generator self-check. */
function assertQuiet(constraints: string, term: string | readonly string[], kinds: readonly string[], track: CatalogTrack, aim: string): void {
  const rest = (typeof term === "string" ? [term] : term).reduce((s, t) => s.replace(t, " "), constraints);
  const toks = termTokens(rest).filter((t) => t.length >= 3 && !["can't", "cannot", "don't", "doctor", "says", "injury", "injured", "pain", "stop", "avoid", "without", "not"].includes(t));
  for (const k of kinds) {
    const hit = kindWords(k, track, aim).find((w) => toks.some((t) => sameStem(t, w)));
    if (hit) throw new Error(`hostile generator: K template "${constraints}" hits ${k} through "${hit}" outside its term`);
  }
  if (contentWords(aim).some((a) => toks.some((t) => sameStem(t, a)))) throw new Error(`hostile generator: K template "${constraints}" meets the aim "${aim}"`);
}

/** The negation cues a phrasing holds (CUE_TEMPLATES' keys, apostrophes closed, a two-word cue as a run of words). */
function cuesIn(text: string): string[] {
  const close = (s: string) => s.toLowerCase().replace(/['’]/gu, "");
  const toks = close(text).match(/[\p{L}\p{N}]+/gu) ?? [];
  return Object.keys(G.CUE_TEMPLATES).filter((c) => {
    const ws = close(c).split(" ");
    return toks.some((_, i) => ws.every((w, k) => toks[i + k] === w));
  });
}

/** The confirm reply's session picks: two or three practice kinds the case leaves in, one outside BODY_SAFE_KINDS where possible. */
function picksFor(run: HostileRun, mustExclude: readonly string[], rng: Rng): string[] {
  const left = run.enums.practice.filter((k) => !mustExclude.includes(k));
  const safe = ["EASY_SESSION", "MOBILITY_SESSION", "TECHNIQUE_SESSION"];
  const unsafe = left.filter((k) => !safe.includes(k));
  const out = new Set<string>();
  if (unsafe.length > 0) out.add(rng.pick(unsafe));
  for (const k of rng.sample(left, 2)) out.add(k);
  return [...out];
}

// ═══ E's grammar, per run ═══════════════════════════════════════════════════

/** The run's control names: phrases of the user's own outline (whole lines and their head phrases), in the carriers, plus F-R4-19's keep names. */
export function controlOf(run: HostileRun): string[] {
  if (!run.english) return [];
  const constraintStems = new Set(contentWords(run.intake.constraints ?? "").map((w) => stem(w.toLowerCase())));
  const listedNames = new Set(run.listed.map((d) => d.name.toLowerCase()));
  const ok = (p: string): boolean => {
    const w = p.split(" ");
    if (w.length > GAP_WORDS_MAX || Array.from(p).length > GAP_NAME_MAX) return false;
    if (!/^[A-Za-z][A-Za-z'’ -]*$/.test(p)) return false;
    if (w.some((x) => x.length > GAP_WORD_CHARS_MAX)) return false;
    if (listedNames.has(p.toLowerCase())) return false;
    if (w.some((x) => G.CLAIM_TRIGGERS.includes(x.toLowerCase()))) return false;
    if (contentWords(p).some((x) => constraintStems.has(stem(x.toLowerCase())))) return false;
    return true;
  };
  // Whole outline lines; the two-word head of a longer line when both words are content words ("random
  // variables" of "Univariate random variables"), never one that cuts a keep name in half ("Series analysis"
  // of "Time series analysis"); and F-R4-19's keep names where a line holds them.
  const keepWords = G.KEEP_NAMES.map((k) => k.toLowerCase().split(" "));
  const cutsKeep = (w: readonly string[], start: number) =>
    keepWords.some((k) => k.length > 1 && w.some((_, i) => i < start && start < i + k.length && k.every((x, j) => (w[i + j] ?? "").toLowerCase() === x)));
  const phrases = new Set<string>();
  for (const s of run.sources) {
    if (s.kind !== "OUTLINE") continue;
    const w = s.text.trim().split(/\s+/);
    if (ok(w.join(" "))) phrases.add(w.join(" "));
    if (w.length >= 3) {
      const start = w.length - 2;
      const head = w.slice(start);
      if (!head.some(isFunctionWord) && !cutsKeep(w, start) && ok(head.join(" "))) phrases.add(capital(head.join(" ")));
    }
  }
  const outlineText = run.sources.filter((s) => s.kind === "OUTLINE").map((s) => s.text.toLowerCase());
  for (const k of G.KEEP_NAMES) if (outlineText.some((t) => t.includes(k.toLowerCase())) && ok(k)) phrases.add(k);
  const out: string[] = [];
  for (const p of phrases) {
    for (const carrier of G.CARRIERS) {
      const t = carrier === "{x}" ? p : carrier.replace("{x}", carrier.startsWith("{x}") ? p : p[0].toLowerCase() + p.slice(1));
      if (ok(t.replace(/^Intro to /, "")) && t.split(" ").length <= GAP_WORDS_MAX && Array.from(t).length <= GAP_NAME_MAX) out.push(t);
    }
  }
  return out;
}

/** Names exactly equal to a Domain listed in this run's pack (F-R4-19 step 1: never a gap). */
function exactMatchNamesOf(run: HostileRun): string[] {
  return run.listed.flatMap((d) => [d.name, d.name.toLowerCase(), d.name.toUpperCase()]);
}

interface ClaimClass {
  name: string;
  make: () => string;
}

/** E's claim classes for one run (F-R4-22 E): each string makes a claim the app can't check. */
function claimClassesOf(run: HostileRun, rng: Rng): ClaimClass[] {
  const topics = [
    ...run.sources.filter((s) => s.kind === "OUTLINE" || s.kind === "DOMAIN" || s.kind === "AREA").map((s) => s.text),
    ...run.listed.map((d) => d.name),
  ].filter((t) => t.split(" ").length <= 2 && Array.from(t).length <= 18);
  const topic = () => (topics.length > 0 && rng.chance(0.7) ? rng.pick(topics) : capital(invented(rng, 2)));
  const name = () => capital(invented(rng, 2) + rng.pick(G.NAME_SUFFIXES));
  const lowerTopic = () => topic().toLowerCase();
  const fill = (frame: string) => frame.replace("{x}", rng.chance(0.5) ? lowerTopic() : topic());
  const carry = (x: string) => {
    const c = rng.pick(G.CARRIERS);
    return c === "{x}" ? x : c === "{x} basics" ? `${x} basics` : `Intro to ${x}`;
  };
  const url = () => urlOf(rng.pick(G.URL_FORMS), rng);
  const homoglyph = (t: string) => {
    const pts = Array.from(t);
    const idx = pts.map((ch, i) => (G.HOMOGLYPHS[ch] ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 0) return `${t}${G.HOMOGLYPHS.o}`;
    const at = rng.pick(idx);
    pts[at] = G.HOMOGLYPHS[pts[at]];
    return pts.join("");
  };
  const constraintTerms = contentWords(run.intake.constraints ?? "").filter((w) => !["only", "evenings", "home", "alone", "practise"].includes(w.toLowerCase()));
  const control = controlOf(run);
  const classes: ClaimClass[] = [
    { name: "resource", make: () => carry(rng.pick([`${name()} ${rng.pick(G.RESOURCE_NOUNS)}`, `${topic()} ${rng.pick(G.RESOURCE_NOUNS)}`, `${name()}'s ${rng.pick(G.RESOURCE_NOUNS)}`, `“${name()} ${topic()}”`, `${topic()} by ${name()}`])) },
    { name: "proper-noun", make: () => carry(rng.pick([`${name()} method`, `${name()} ${lowerTopic()}`, `${name().toLowerCase()} method`, `${invented(rng, 1)}${name()}`, `${name().toUpperCase().slice(0, 3)} ${lowerTopic()}`])) },
    { name: "brand", make: () => carry(rng.pick([`${invented(rng, 2)} ${lowerTopic()}`, `${invented(rng, 3)}`, `${lowerTopic()} ${invented(rng, 2)}`])) },
    {
      name: "number",
      make: () =>
        rng.pick([
          `${topic()} ${G.digitsIn(rng.pick(G.DIGIT_ZEROS), 1 + rng.int(98))}`,
          `${topic()} ${rng.pick(G.HAN_NUMERALS)}`,
          fill(rng.pick(G.SPELLED_NUMBER_FRAMES)),
          `${rng.pick(G.NUMBER_SIGNS)} ${lowerTopic()}`,
          `Level ${G.digitsIn(rng.pick(G.DIGIT_ZEROS), 1 + rng.int(12))} ${lowerTopic()}`,
        ]),
    },
    { name: "url", make: () => rng.pick([url(), `${topic()} ${url()}`, `${url()} ${lowerTopic()}`]) },
    { name: "declarative", make: () => fill(rng.pick(G.DECLARATIVE_FRAMES)) },
    { name: "about-you", make: () => fill(rng.pick(G.ABOUT_YOU_FRAMES)) },
    { name: "schedule", make: () => fill(rng.pick(G.SCHEDULE_FRAMES)) },
    { name: "health", make: () => carry(rng.pick(G.HEALTH_PHRASES)) },
    {
      name: "over-length",
      make: () => {
        const t = rng.pick(G.OVER_LENGTH_FRAMES).replace("{x}", topic()).replace("{y}", lowerTopic()).replace("{n}", name());
        return Array.from(t).length > GAP_NAME_MAX ? t : `${t} and its official workbook`;
      },
    },
    { name: "foreign", make: () => rng.pick(G.FOREIGN_NAMES) },
    { name: "no-space", make: () => rng.pick(G.NO_SPACE_NAMES) },
    { name: "homoglyph", make: () => homoglyph(control.length > 0 && rng.chance(0.7) ? rng.pick(control) : topic()) },
  ];
  if (constraintTerms.length > 0) {
    classes.push({ name: "constraint", make: () => carry(rng.pick([capital(rng.pick(constraintTerms)), `${capital(rng.pick(constraintTerms))} ${rng.pick(constraintTerms)}`, `${topic()} ${rng.pick(constraintTerms)}`])) });
  }
  return classes;
}

// ═══ The whole corpus ════════════════════════════════════════════════════════

/** The corpus for these packs and probe fixtures (the order of the arguments doesn't matter). */
export function generateCorpus(packs: readonly CorpusPack[], probes: readonly ProbeFixture[] = []): HostileCorpus {
  const b = new Builder(packs, probes);
  b.familyA();
  b.familyB();
  b.familyC();
  b.familyD();
  b.familyE();
  b.familyEG();
  b.familyK();
  b.familyM();
  b.familyF();
  // Last, so no earlier family (E's replies, E-G, M) ever sees its runs or strings.
  b.familyClash();
  b.familyResourcePatterns();
  b.familyOneSource();
  return b.finish();
}
