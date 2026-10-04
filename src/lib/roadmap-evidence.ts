/**
 * The evidence pack (roadmap.md F3; lane R3): the exact prompt lines for one
 * draft, and the server-only keymap that turns the reply's keys back into ids.
 *
 * What goes to Google, and nothing else (the form's privacy line names these
 * sections, PACK_SECTIONS): the Area's name, the aim, the constraints, the
 * exam name, the syllabus lines, the Domain names with their card counts, and
 * the plan's shape (milestone count, weeks per milestone, starting point,
 * whether practices are allowed). Never a card, a card title, or any id: the
 * Domains go as D1..Dk and the syllabus lines as S1..Sn, and the keymap that
 * resolves them stays on the server (RoadmapRun.pack).
 *
 * Every interpolated string goes through packText (one line, no control or
 * format characters, '<' '>' swapped, capped), and every section is fenced
 * with gemini.ts asData, so nothing inside a section can close it. Pure (no
 * clock, no database, no model); it imports gemini.ts only for asData, so
 * client code reads PACK_SECTIONS from roadmap-types instead of this module.
 * Never imports the number-brand or text-brand constructors.
 *
 *   buildEvidencePack · packUserContent · methodsForRun · inputHashMaterial
 *   packDomainLine · domainIdsHashOf · START_POINT_WORDS
 */
import { asData } from "./gemini";
import { daysBetween } from "./life-day";
import { words } from "./synonyms";
import { COACH_EXCLUSIONS } from "./roadmap-lexicon";
import {
  AIM_MAX,
  CONSTRAINTS_MAX,
  EXAM_MAX,
  PACK_COUNT_BUCKET,
  PACK_MAX_DOMAINS,
  PACK_NAME_MAX,
  PACK_SECTIONS,
  PRACTICE_METHODS,
  CHECKPOINT_KINDS,
  ROADMAP_PROMPT_VERSION,
  SYLLABUS_LINE_MAX,
  SYLLABUS_MAX_LINES,
  packText,
  type EvidencePack,
  type Intake,
  type PackDomainLine,
  type PackKeymap,
  type PackSection,
  type PlanWindow,
  type PracticeMethod,
  type StartPoint,
} from "./roadmap-types";

/** One Domain the pack may list (counts from loadFieldTree; atTop = cards at TOP_LEVEL or above). */
export interface EvidenceDomain {
  id: string;
  name: string;
  fieldId: string;
  cards: number;
  atSix: number;
  atTop: number;
  /** Chosen at intake (listed first, then the Area's other Domains by card count; k ≤ PACK_MAX_DOMAINS). */
  chosen: boolean;
}

export interface EvidenceInput {
  intake: Intake;
  /** The Area Field's name, or the track's for a track Area. */
  areaName: string;
  domains: readonly EvidenceDomain[];
  windows: readonly PlanWindow[];
}

/** How the plan line names the starting point: the form's own words (F2 field 7), not the union's codes. */
export const START_POINT_WORDS: Readonly<Record<StartPoint, string>> = {
  NEW: "new to it",
  BASICS: "some basics",
  WORKING: "working knowledge",
  STRONG: "strong, aiming higher",
};

/** One word per method, as the prompt's glossary explains it (F5). */
const METHOD_GLOSS: Readonly<Record<PracticeMethod, string>> = {
  DELIBERATE_PRACTICE: "focused drills on one point",
  READING: "working through material",
  PROJECT_WORK: "building something",
  COACHED_SESSION: "practice with a teacher or partner",
  WORKOUT: "physical training",
  WRITING: "producing written work",
};

/** The placeholder for a Domain whose name is empty once cleaned. */
const UNNAMED_DOMAIN = "(unnamed)";

const count = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
const bucket = (n: number): number => Math.floor(n / PACK_COUNT_BUCKET) * PACK_COUNT_BUCKET;

/** "D1 · Probability · 42 cards · 18 at level 6+ · 2 mastered"; with `bucketed`, each count floored to PACK_COUNT_BUCKET (the inputHash's form). */
export function packDomainLine(d: PackDomainLine, bucketed = false): string {
  const c = (n: number) => (bucketed ? bucket(n) : n);
  return `${d.key} · ${d.name} · ${c(d.cards)} cards · ${c(d.atSix)} at level 6+ · ${c(d.atTop)} mastered`;
}

/**
 * A short, stable hash of a list of ids (sorted, de-duplicated): two FNV-1a
 * 32-bit passes with different offsets, as 16 hex characters. Pure (the
 * sha256 of the whole inputHash material is R4's, with node:crypto).
 */
export function domainIdsHashOf(ids: readonly string[]): string {
  const text = Array.from(new Set(ids)).sort().join(",");
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    a = Math.imul(a ^ ch, 0x01000193) >>> 0;
    b = Math.imul(b ^ ch, 0x01000193) >>> 0;
    b = (b ^ (b >>> 13)) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/** Whether the constraints rule out a teacher or partner (COACH_EXCLUSIONS, read as whole words). */
function excludesCoaching(constraints: string | null): boolean {
  if (!constraints) return false;
  const typed = words(constraints).map((w) => w.raw.toLowerCase());
  return COACH_EXCLUSIONS.some((phrase) => {
    const want = words(phrase).map((w) => w.raw.toLowerCase());
    if (want.length === 0) return false;
    for (let i = 0; i + want.length <= typed.length; i++) if (want.every((w, k) => typed[i + k] === w)) return true;
    return false;
  });
}

/** The methods offered to the run: none when practices are off; COACHED_SESSION left out when the constraints say alone, no teacher, no coach, self-taught or no partner. */
export function methodsForRun(constraints: string | null, practicesAllowed: boolean): PracticeMethod[] {
  if (!practicesAllowed) return [];
  const noCoach = excludesCoaching(constraints);
  return PRACTICE_METHODS.filter((m) => !(noCoach && m === "COACHED_SESSION"));
}

/** The Domains the pack lists, in order: the chosen ones (in the user's order), then the Area's others by card count; at most PACK_MAX_DOMAINS. */
function orderedDomains(intake: Intake, domains: readonly EvidenceDomain[]): EvidenceDomain[] {
  if (intake.fieldId == null) return [];
  const byId = new Map<string, EvidenceDomain>();
  for (const d of domains) if (d && typeof d.id === "string" && !byId.has(d.id)) byId.set(d.id, d);
  const chosenIds = new Set<string>();
  const out: EvidenceDomain[] = [];
  for (const id of intake.domainIds ?? []) {
    const d = byId.get(id);
    if (d && !chosenIds.has(id)) {
      chosenIds.add(id);
      out.push(d);
    }
  }
  for (const d of domains) if (d?.chosen && byId.get(d.id) === d && !chosenIds.has(d.id)) {
    chosenIds.add(d.id);
    out.push(d);
  }
  const others = Array.from(byId.values())
    .filter((d) => !chosenIds.has(d.id) && d.fieldId === intake.fieldId)
    .sort((x, y) => count(y.cards) - count(x.cards) || x.name.localeCompare(y.name) || x.id.localeCompare(y.id));
  return [...out, ...others].slice(0, PACK_MAX_DOMAINS);
}

/** Weeks per window, as the plan line gives them (whole weeks, at least 1). */
function weeksOf(w: PlanWindow): number {
  return Math.max(1, Math.round((daysBetween(w.start, w.end) + 1) / 7));
}

/**
 * The pack for one draft: the fenced sections in PACK_SECTIONS order (a
 * section with nothing in it is left out), the method and checkpoint
 * glossary, and "Return exactly n milestones." A track Area lists no Domains
 * and always allows practices.
 */
export function buildEvidencePack(input: EvidenceInput): EvidencePack {
  const intake = input.intake;
  const trackArea = intake.fieldId == null;
  const practicesAllowed = trackArea ? true : intake.practicesAllowed !== false;
  const methods = methodsForRun(intake.constraints, practicesAllowed);
  const windows = Array.isArray(input.windows) ? input.windows : [];
  const milestoneCount = Math.max(1, windows.length);
  const weeksPerMilestone = windows.length > 0 ? windows.map(weeksOf) : [];

  const keymap: PackKeymap = { domains: {}, syllabus: {} };
  const domains: PackDomainLine[] = orderedDomains(intake, input.domains).map((d, i) => {
    const key = `D${i + 1}`;
    keymap.domains[key] = d.id;
    return { key, name: packText(d.name, PACK_NAME_MAX) || UNNAMED_DOMAIN, cards: count(d.cards), atSix: count(d.atSix), atTop: count(d.atTop) };
  });

  const syllabusKeys: string[] = [];
  const syllabusLines: string[] = [];
  (intake.syllabus?.lines ?? []).forEach((line, index) => {
    if (syllabusKeys.length >= SYLLABUS_MAX_LINES) return;
    const text = packText(line, SYLLABUS_LINE_MAX);
    if (!text) return;
    const key = `S${syllabusKeys.length + 1}`;
    syllabusKeys.push(key);
    keymap.syllabus[key] = index;
    syllabusLines.push(`${key} · ${text}`);
  });

  const area = packText(input.areaName, PACK_NAME_MAX);
  const aim = packText(intake.aim, AIM_MAX);
  const constraints = packText(intake.constraints ?? "", CONSTRAINTS_MAX);
  const exam = packText(intake.examLabel ?? "", EXAM_MAX);
  const plan = [
    `milestones: ${milestoneCount}`,
    ...(weeksPerMilestone.length > 0 ? [`weeks per milestone: ${weeksPerMilestone.join(", ")}`] : []),
    `starting point: ${START_POINT_WORDS[intake.startPoint] ?? START_POINT_WORDS.NEW}`,
    `practices allowed: ${practicesAllowed ? "yes" : "no"}`,
    ...(trackArea ? ["practice only: yes"] : []),
  ];

  const body: Record<PackSection, string | null> = {
    area: area || null,
    aim: aim || null,
    constraints: constraints || null,
    exam: exam || null,
    syllabus: syllabusLines.length > 0 ? syllabusLines.join("\n") : null,
    domains: domains.length > 0 ? domains.map((d) => packDomainLine(d)).join("\n") : null,
    plan: plan.join("\n"),
  };
  const sections = PACK_SECTIONS.filter((s) => body[s] != null);
  const glossary = [
    ...(methods.length > 0 ? [`Practice methods: ${methods.map((m) => `${m} (${METHOD_GLOSS[m]})`).join(", ")}.`] : []),
    `Checkpoint kinds: ${CHECKPOINT_KINDS.join(", ")}.`,
    `Return exactly ${milestoneCount} milestone${milestoneCount === 1 ? "" : "s"}.`,
  ];
  const content = [...sections.map((s) => asData(s, body[s] as string)), ...glossary].join("\n");

  const chosen = (intake.domainIds ?? []).filter((id) => typeof id === "string");
  return {
    promptVersion: ROADMAP_PROMPT_VERSION,
    lines: content.split("\n"),
    sections,
    domains,
    syllabusKeys,
    milestoneCount,
    weeksPerMilestone,
    practicesAllowed,
    trackArea,
    methods,
    keymap,
    domainIdsHash: domainIdsHashOf(chosen),
  };
}

/** The user content sent: the fenced sections, the method and checkpoint glossary, and "Return exactly n milestones." */
export function packUserContent(pack: EvidencePack): string {
  return pack.lines.join("\n");
}

/** One string, normalised for the hash: packText'd, lower case. */
const norm = (s: string | null | undefined, max = 4000): string => packText(s ?? "", max).toLowerCase();

/**
 * The canonical string R4 hashes (sha256) into RoadmapRun.inputHash:
 * promptVersion | model | samples | the normalised intake | pack lines with
 * counts bucketed to PACK_COUNT_BUCKET | the sorted domain-id hash.
 *
 * "The normalised intake" is the part of the intake the pack is built from:
 * the aim, Area, track, chosen Domains (sorted), syllabus lines, starting
 * point, practices switch, constraints and exam. Hours, intensity, typical
 * hours and the new-card rate never reach the model (they only feed fitting,
 * which a reuse re-runs on today's data), so changing them reuses the reply.
 * The D-key → id map is part of the material, so a reuse never resolves a
 * key to a different Domain than the reply was written for.
 */
export function inputHashMaterial(pack: EvidencePack, intake: Intake, model: string, samples: number): string {
  const normalisedIntake = {
    aim: norm(intake.aim),
    fieldId: intake.fieldId ?? null,
    track: intake.track,
    domainIds: Array.from(new Set(intake.domainIds ?? [])).sort(),
    syllabus: (intake.syllabus?.lines ?? []).map((l) => norm(l)).filter(Boolean),
    startPoint: intake.startPoint,
    practicesAllowed: pack.practicesAllowed,
    constraints: norm(intake.constraints),
    examLabel: norm(intake.examLabel),
  };
  const exact = new Map(pack.domains.map((d) => [packDomainLine(d), packDomainLine(d, true)]));
  const lines = pack.lines.map((l) => exact.get(l) ?? l);
  const keys = pack.domains.map((d) => `${d.key}=${pack.keymap.domains[d.key] ?? ""}`);
  return [
    `prompt:${pack.promptVersion}`,
    `model:${model}`,
    `samples:${samples}`,
    `intake:${JSON.stringify(normalisedIntake)}`,
    `lines:\n${lines.join("\n")}`,
    `domains:${pack.domainIdsHash}`,
    `keys:${keys.join(",")}`,
  ].join("\n|\n");
}
