/**
 * R2's dated ladder for a corpus pack (the fix round, r3; lane R3's fixture
 * module, read by the lead's scripts/roadmap-probe.ts and by
 * scripts/roadmap-model-check.ts). One definition of the plan a user with the
 * pack's intake would be shown, built purely with R2's own functions:
 * roadmap-realism stageLadderOf (the stages, their dates, each stage's room
 * from its practice budget, Gemini's picks and the outline's order) and
 * planProgressionOf (the progression those rows hold, at that room). The
 * pack's cards are read from its D-lines as roadmap-realism-check reads the
 * corpus: per chosen Domain, `atTop` cards at the top level, `atSix − atTop`
 * at levels 6 to 8, the rest at 1 to 5, due over the next weeks; a typed pace
 * where the pack has none (3 new cards a week); every throughput figure
 * calibrating; the pack's own `today`. No database, no clock, no model.
 *
 * Why (the review of 5 Oct, r3): the probe's labelled `plan` came from
 * progressionOf at the default room (3 practices) with no exam stage, which
 * is not the plan the user sees when a stage's budget holds fewer; and the
 * v4 pick enums covered every slot, not the stages the plan's ladder holds
 * (pickStages: roadmap-evidence pickStagesOf over these rows).
 */
import { addDays, type DayKey } from "../../../src/lib/life-day";
import { domainName, type ActivityGate, type CardState, type DomainName, type Intake, type MilestoneDraft, type RealismInput, type Throughput } from "../../../src/lib/roadmap-types";
import type { CatalogKey, Progression, ProgressionInput } from "../../../src/lib/roadmap-catalog";
import { planProgressionOf, stageLadderOf } from "../../../src/lib/roadmap-realism";
import { pickStagesOf, type EvidenceInput } from "../../../src/lib/roadmap-evidence";

/** The pace a pack with none is planned at (roadmap-realism-check's fixture choice). */
export const CORPUS_PACE = 3;

/** What corpusLadderOf reads besides the pack. */
export interface CorpusLadderOpts {
  /** Gemini's valid picks (a validated reply's KeysOnlyDraft.picks). */
  picks?: unknown;
  /** The outline's order as line indices (KeysOnlyDraft.order.order). */
  order?: readonly number[] | null;
  /** The plan's gate (the pack's run.blocked as {blocked}); absent: stageLadderOf's own (activityGateOf(intake)). */
  gate?: Pick<ActivityGate, "blocked"> | null;
  /** More kinds never placed (the run's exclusions). */
  excluded?: Iterable<CatalogKey>;
}

/** One stage of the ladder's plan, as the labellers read it. */
export interface CorpusLadderStage {
  stage: string;
  level: number | null;
  windowStart: string | null;
  dueDay: string | null;
  /** The stage's room for practices (R2's practicesThatFitOf over its budget, as planProgressionOf passes maxPractices). */
  room: number | null;
  practices: { kind: string; why: string; picked: boolean; sessionsPerWeek: number | null; durationBand: string | null }[];
  steps: string[];
  checkpoint: string | null;
}

export type CorpusLadder =
  | {
      ok: true;
      intake: Intake;
      input: RealismInput;
      /** The dated ladder's rows (stageLadderOf). */
      plan: MilestoneDraft[];
      /** The stage keys the ladder reads a pick for (roadmap-evidence pickStagesOf over the rows). */
      pickStages: string[];
      /** planProgressionOf over the rows: the progression's input (each stage's room as maxPractices, the exam's stage) and its result. */
      progressionInput: ProgressionInput;
      progression: Progression;
      /** The progression's stages beside their rows' dates and sizes. */
      stages: CorpusLadderStage[];
    }
  | { ok: false; error: string };

/** Every throughput figure calibrating (a user with no history yet), its final day two days before `today`. */
function calibrating(today: DayKey): Throughput {
  const cal = { kind: "calibrating" as const, have: 0, need: 4 };
  return {
    finalDay: addDays(today, -2),
    trackedMinutes: cal,
    geminiShare: null,
    playMinutes: cal,
    trackedByTrack: {},
    trackedByCategory: {},
    completions: cal,
    activeDays: cal,
    adherence: { kind: "calibrating", have: 0, need: 8 },
    reviewsPerDay: cal,
    passShare: { kind: "calibrating", have: 0, need: 30 },
    clearance: { kind: "calibrating", have: 0, need: 1 },
    newCards: { total: cal, byField: {}, byDomain: {} },
  };
}

/** The pack's chosen Domains' cards from their D-lines (cards, at level 6+, at the top level). */
function cardsOf(input: EvidenceInput, today: DayKey): CardState[] {
  const chosen = new Set(input.intake.domainIds ?? []);
  const cards: CardState[] = [];
  for (const d of input.domains ?? []) {
    if (!chosen.has(d.id)) continue;
    const top = Math.max(0, Math.floor(d.atTop || 0));
    const six = Math.max(top, Math.floor(d.atSix || 0));
    const all = Math.max(six, Math.floor(d.cards || 0));
    for (let i = 0; i < top; i++) cards.push({ level: 12, dueDay: addDays(today, 30 + i), graceEndsDay: null, domainId: d.id });
    for (let i = 0; i < six - top; i++) cards.push({ level: 6 + (i % 3), dueDay: addDays(today, 1 + (i % 30)), graceEndsDay: null, domainId: d.id });
    for (let i = 0; i < all - six; i++) cards.push({ level: 1 + (i % 5), dueDay: addDays(today, i % 10), graceEndsDay: null, domainId: d.id });
  }
  return cards;
}

/** The RealismInput a pack's intake gives (see the head). */
export function corpusRealismInputOf(entry: { input: EvidenceInput; today: string }): { intake: Intake; input: RealismInput; names: Record<string, DomainName> } {
  const today = entry.today as DayKey;
  const intake = entry.input.intake;
  const track = intake.fieldId == null;
  const ids = [...(intake.domainIds ?? [])].sort();
  const input: RealismInput = {
    today,
    targetDay: intake.targetDay,
    scopes: track ? [] : [{ key: ids.join(","), domainIds: ids, fieldId: intake.fieldId, cards: cardsOf(entry.input, today), rateSource: "YOURS", rate: intake.newCardsPerWeek ?? CORPUS_PACE }],
    throughput: calibrating(today),
    hoursPerWeek: intake.hoursPerWeek,
    intensity: intake.intensity,
    startPoint: intake.startPoint,
    typicalHours: intake.typicalHours,
    typicalHoursSource: intake.typicalHoursSource,
    m: 1,
    heldDays: [],
    areaInMaintenance: false,
    practicesAllowed: track ? true : intake.practicesAllowed !== false,
    trackArea: track,
    depth: track ? null : (intake.depth ?? 12),
    dateMode: intake.dateMode ?? (track ? "CHOSEN" : "REALISTIC"),
    userDate: (intake.dateMode ?? (track ? "CHOSEN" : "REALISTIC")) === "CHOSEN" ? intake.targetDay : null,
    examDay: intake.examDay ?? null,
  };
  const names: Record<string, DomainName> = {};
  for (const d of entry.input.domains ?? []) if (ids.includes(d.id)) names[d.id] = domainName({ id: d.id, name: d.name });
  return { intake: { ...intake, depth: track ? null : (intake.depth ?? 12) }, input, names };
}

/**
 * The pack's dated ladder with the reply's picks and order (R2's
 * stageLadderOf), and the progression its rows hold at their room (R2's
 * planProgressionOf). {ok: false} when R2 refuses the ladder (its reason).
 * Never throws.
 */
export function corpusLadderOf(entry: { input: EvidenceInput; today: string }, opts: CorpusLadderOpts = {}): CorpusLadder {
  try {
    const { intake, input, names } = corpusRealismInputOf(entry);
    let n = 0;
    const makeId = () => `ladder-${++n}`;
    const res = stageLadderOf(intake, input, names, makeId, {
      ...(opts.picks !== undefined ? { picks: opts.picks } : {}),
      ...(opts.order ? { order: opts.order } : {}),
      ...(opts.gate ? { gate: opts.gate } : {}),
      ...(opts.excluded ? { excluded: opts.excluded } : {}),
    });
    if (!res.ok) return { ok: false, error: `${res.reason}: ${res.error}` };
    const pp = planProgressionOf(res.plan, intake, input, {
      ...(opts.picks !== undefined ? { picks: opts.picks } : {}),
      ...(opts.gate ? { gate: opts.gate } : {}),
      ...(opts.excluded ? { excluded: opts.excluded } : {}),
    });
    const max = pp.input.maxPractices;
    const roomAt = (k: number): number | null => {
      const raw = Array.isArray(max) ? (max as readonly (number | null | undefined)[])[k] : (max as number | null | undefined);
      return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    };
    const stages: CorpusLadderStage[] = pp.progression.stages.map((sp, k) => {
      const row = pp.rows[k];
      const items = row?.items ?? [];
      const sized = (kind: string) => items.find((it) => it.kind === "PRACTICE" && it.catalogKey === kind && it.decision !== "REMOVED");
      return {
        stage: sp.stage,
        level: sp.level,
        windowStart: row?.windowStart ?? null,
        dueDay: row?.dueDay ?? null,
        room: roomAt(k),
        practices: sp.practices.map((x) => ({ kind: x.kind, why: x.why, picked: x.picked, sessionsPerWeek: sized(x.kind)?.sessionsPerWeek ?? null, durationBand: sized(x.kind)?.durationBand ?? null })),
        steps: sp.steps.map((x) => x.kind),
        checkpoint: sp.checkpoint?.kind ?? null,
      };
    });
    return { ok: true, intake, input, plan: res.plan, pickStages: pickStagesOf(res.plan), progressionInput: pp.input, progression: pp.progression, stages };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
