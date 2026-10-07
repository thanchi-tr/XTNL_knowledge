import "./_no-model";
/**
 * roadmap-server-check (roadmap lane R4): the server cores and the economy,
 * against an in-memory store that applies the same StoreOps (guards, inserts,
 * updates, cascading deletes, the readings upsert, the quest freeze) the
 * Prisma store sends in one transaction, with injected io and fixture lanes.
 * No database, no after(), no Gemini (scripts/_no-model.ts first; every
 * callModel here is a local fake). Concurrency is real interleaving: every
 * store read and write yields, so two cores started together race exactly
 * where a double tap would.
 *
 * Covers F2 (intake validation, one open roadmap, a double tap), F8 (the cap,
 * the RUNNING guard, staleness, reuse, force, persistence, fallbacks, the
 * background half), F9 (accept refusals, outline items, concurrent accepts,
 * Undo, ords after carried rows, rank indices, [Create]), F15 (stated MP
 * goldens, every Start refusal, switched-off practices, the delayed-start
 * offer, the claim, captureKey idempotency, Finish starting, the ParsedCapture,
 * no model sizing (decision 50), one quest set, high-water baselines), F19 (the Aim card's
 * empty, draft and missing-table states) and F22 (re-plans never touch
 * started rows, the end-state anchor, archive, done).
 *
 * Fix round (the reviews of lane R4): positions by lineage (a restart never
 * makes Paragon; a re-plan's places), a stale re-plan (Start since, a race
 * on NOTHING_STARTED_SINCE, a copy since), drop → Start again → unarchive,
 * one due day, the Start sheet's pay arithmetic and prices, title flags and
 * struck spans derived on read, EDITED only for changed words and "Type a
 * target", topics following a mapped Domain, who wrote the rows (STARTER,
 * CAPPED, a failed redraft), failed samples' facts, the cap's definition,
 * the starter's unused Domains, aftercare's Keep on Today, the Aim card
 * between milestones and its draft count, the library and the other view
 * fields, the weight line, the scope's pace (median of weekly sums), the
 * date remedy, and that no view loader reaches the model.
 *
 * Revision 4 fix round (contracts §15.15, lane R4): the LATER line's
 * 'hide:<day>' cookie and [Keep the dates] recorded on the plan; coverage
 * frozen at intake (archive 20, write 18, a lowered depth, a typed figure
 * that didn't change, the first accept's draft counts); clean entry read in
 * the planning context; no model sizing at Start and its monitor; session
 * picks of any slot (lose-8kg, "pregnant"); production by practiceRoleOf; a
 * PART at the depth's rank; "n not shown" and the run's integrity re-made
 * safe; the view fields R5 read through casts; the tripwire's rawLabel and
 * proposedName; typed counts refused on a depth plan; a legacy life-track
 * plan replaced; draftFromReply as the one draft step.
 *
 * Revision 4 fix round 2 (contracts §16.9, lane R4): a redraft on an ACTIVE
 * plan ([Use the realistic date], a line's Domain) after archiving 20 or
 * writing 18 cards asks for the end state's n_d (the frozen counts, fixture
 * and real R2); the additions' date effect gets the frozen counts and the
 * added Domain's cards; Plan history's depthLowered after accept → Undo →
 * accept and Undo → lower; the legacy Aim card's LegacyView; the depth to
 * R1's ranks; no code label names a pending Gemini addition ([Leave out],
 * [Add], an edit's re-fit; fixture and real R2/R3); Start → R6's own
 * weekQuestSetFor and loadWeekQuests over the fake world (a round trip); the
 * bar's named views with the week-quests view; NO_PACE refused at intake.
 *
 * Finishing round (contracts §17.3, lane R4): Start counts each card key as
 * it counts (3 multiple-choice cards at or above L: its reading, R1's detail
 * and its v0ByKey are the recall count; no first `rc` reading or v0; the
 * Start sheet's preview hands R6 the same v0s), and a spare-only REALISTIC
 * intake with no pace saves and drafts dated on the cards held (option (b)).
 *
 * Confirm to unlock (contracts §19, lane R4): every plan path honours the
 * one gate — the code-built plan with the real R2 and R3 ("Running causes me
 * knee pain." places only the safe sessions), the Gemini keys-only placement
 * (picks of gated kinds dropped and reported; after the user's answer the
 * session-picks confirm stays a second layer), the answer on a DRAFT (the
 * plan follows; an intake save keeps the answer; new words ask again), its
 * refusals and guard, a pick from the type list, accept, Start (no task for
 * a held kind), the week quests (Start's set and R6's own reading) and the
 * re-plan. The safety-gaps round (the lead's decisions): a BODY plan with no
 * constraints asks (1), a CRAFT plan asks on a cue (1), the answer is the
 * card's ActivityCardAnswer — no tick is refused and "Nothing to avoid" is
 * the all-clear (1), a stale key is refused (3, the verifier's S12) — a
 * waiting CARE plan places its safe kinds and every refusal meanwhile points
 * at the card (2, S6), an AVOID after Start pauses the started task (4, S7),
 * a kept pick of a kind whose answer went stale is held (5, S1), and a Field
 * plan's "No timed practice" is a pre-ticked suggestion, never a block (7).
 *
 * Revision 5, lane 3 (contracts §23; GOALS_MAX still 1): the fake store holds
 * SLOT_FREE, KEY_FREE and DOMAINS_FREE as the SQL reads them and migration A's
 * two partial unique indexes; the re-pins keep today's one-goal answers (a
 * second goal refused with ANOTHER_ACTIVE, the discard's Undo in today's
 * words, accept never answering ANOTHER_ACTIVE); the goldens cover the seats
 * and every insert or reopen setting the slot, createKey idempotence, the
 * targets, pause, resume and archive from PAUSED, the shares (5/1/5 h), the
 * verdict re-run (otherGoals), DOMAINS_FREE, the hours' room and the label,
 * the loaders per goal, Start's duplicate check across goals, and family X's
 * server paths (§22.14's four named goldens, and an AVOID on one goal pausing
 * another's started practice).
 *
 * Revision 5, lane 8 (contracts §22.13, §22.14; rulings 48–51, 59): §22.14's
 * seven TOPICS goldens (a re-plan draft beside a live LEVELS plan, its accept
 * over a live milestone, its undo, two cross-goal parents, the TOPICS cap,
 * the rank spread, "I know this" in place), and the hallucination guards: a
 * kept Gemini name becomes a Domain with its mark (a name the Field holds is
 * refused, a confirm that didn't list it is RACED), the tripwire's two halves
 * (assertTopicNames on a view, assertNoModelText on a write), and every
 * TOPICS and model core refusing with the build's switches (no model call).
 * The cores run with topicSwitches { plans: true }; no model phase runs, so a
 * Gemini name is a topic row put in the fake store as MAP and GROUND leave it.
 *
 * Cases that exercise another lane's real code (R1's readings, lane L's
 * prepareRoadmapGoalClose) go green at integration in those lanes' checks.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addDays, daysBetween, todayKey, weekStartKeyOf, type DayKey } from "../src/lib/life-day";
import { statedForMilestone } from "../src/lib/roadmap-economy";
import type {
  AcceptanceRec,
  ApplyResult,
  ItemRec,
  KeyedMeasure,
  MeasureRec,
  MilestoneRec,
  RoadmapDeps,
  RoadmapIo,
  RoadmapLanes,
  RoadmapRec,
  RoadmapStore,
  RunRec,
  StoreGuard,
  StoreOp,
  TemplateLite,
  TopicRowRec,
  EdgeRowRec,
  TreeField,
  Where,
} from "../src/lib/roadmap-server";
import {
  CROSS_GOAL_PARENT_PREFIX,
  GOALS_FULL,
  GOALS_MAX,
  MAX_MILESTONES,
  ORIGINS,
  TOPIC_NAME_TAKEN,
  geminiNamedOf,
  topicSwitchesOf,
  TOPIC_PLANS_LIVE,
  TOPIC_RATE_LIVE,
  TOPIC_PLACE_LIVE,
  TOPIC_NAMES_LIVE,
  TOPIC_LINK_LIVE,
  TOPIC_GROUND_LIVE,
  ROADMAP_PROMPT_VERSION,
  ROADMAP_WRITES_OFF,
  coveragePolicyOf,
  domainName,
  type DateCheck,
  RUN_FALLBACK_STARTER,
  THROUGHPUT_LAG_DAYS,
  cardsAtLevelKey,
  draftNeedsOf,
  isSupersededRow,
  proficiencyKey,
  milestoneCountFor,
  retryReadDaysOf,
  startStatedInputOf,
  type ActivityCardAnswer,
  type CardState,
  type EndStateTerm,
  type ValidationIntegrity,
  type ValidationReport,
  type Feasibility,
  type Intake,
  type ItemDraft,
  type MeasureSpec,
  type MilestoneDraft,
  type MilestoneFeasibility,
  practiceFamilyPrefillOf,
  outlineStagesOf,
  type Reading,
  type StartSnapshot,
  type Syllabus,
  type ValidatedDraft,
  type WeekQuestSet,
  type TopicMapView,
  DEPTH_TAIL,
  PREREQS_OPEN,
  SOURCES_MIN,
} from "../src/lib/roadmap-types";
import type { ParsedCapture } from "../src/lib/life-types";
import * as R1 from "../src/lib/roadmap-proficiency";
import * as RATING from "../src/lib/roadmap-rating";
import * as REALISM from "../src/lib/roadmap-realism";
import * as VALIDATE from "../src/lib/roadmap-validate";
import {
  ACTIVITY_ANSWER_REFUSAL,
  ACTIVITY_ANSWER_STALE,
  ACTIVITY_CARD_NAME,
  ACTIVITY_NOTHING_TICKED,
  ACTIVITY_PENDING_POINTER,
  activityConfirmOf,
  catalogEntryOf,
  catalogLabelOf,
  progressionViolationsOf,
  type CatalogKey,
} from "../src/lib/roadmap-catalog";
import type { QuestMilestoneFacts, QuestStore } from "../src/lib/roadmap-quests-server";
import { AIM_PROMPT_COOKIE, aimPromptOf } from "../src/lib/roadmap-invite";
import { groundResponseOf, reusableSamplesOf, type ModelRequest } from "../src/lib/roadmap-model";
import type { CaptureLink } from "../src/lib/tasks";
import { throughputWindowStart, type ThroughputRows } from "../src/lib/throughput";
import type { WeightView } from "../src/lib/weight";
import type { DayLedger } from "../src/lib/today-board";


// ═══ No database: every Prisma client in this process is a stand-in that throws on first use ═══
//
// Modules that load the Prisma client (roadmap-server, roadmap-readings and
// what they import) are imported dynamically in main(), after this stand-in
// is installed as globalThis.prisma (src/lib/prisma.ts reuses it), so no
// path, fixture or real lane can reach a database from this check.

type ServerModule = typeof import("../src/lib/roadmap-server");
let S: ServerModule;
let upsertDecision: (typeof import("../src/lib/roadmap-readings"))["upsertDecision"];
let cleanReadDaysOf: (typeof import("../src/lib/roadmap-readings"))["cleanReadDaysOf"];

function installNoDatabase(): void {
  const g = globalThis as { prisma?: unknown };
  if (g.prisma !== undefined) throw new Error("roadmap-server-check: the Prisma client was loaded before the no-database guard");
  g.prisma = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then" || typeof prop === "symbol") return undefined;
        throw new Error(`roadmap-server-check: no database here (prisma.${String(prop)})`);
      },
    }
  );
}

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const json = (v: unknown) => JSON.stringify(v);
const eq = (name: string, got: unknown, want: unknown) => check(name, json(got) === json(want), `got ${json(got)}, want ${json(want)}`);

const USER = "user-1";
const TODAY: DayKey = "2026-10-05";
const NOW = new Date("2026-10-05T01:00:00.000Z"); // 12:00 in Sydney (AEDT)
const at = (ms: number) => new Date(NOW.getTime() + ms);
const WRITES_ON = { XTNL_LIFE_JUDGE: "1" };
const WRITES_OFF = { NODE_ENV: "development" };
/** The origin code-written names carry (spelled through the union, not as a literal). */
const CODE_ORIGIN = ORIGINS[1];

if (todayKey(NOW) !== TODAY) throw new Error(`fixture clock: ${todayKey(NOW)}`);
/** roadmap-server.ts as written (the revision-5 re-pins read it before main's own SERVER_SRC). */
const SERVER_SRC_TOP = readFileSync(join(process.cwd(), "src/lib/roadmap-server.ts"), "utf8");

// ═══ The in-memory store ════════════════════════════════════════════════════

interface StoredReading extends Reading {
  userId: string;
}

interface QuestWeekRow {
  userId: string;
  roadmapId: string;
  milestoneId: string;
  dedupeKey: string;
  source: string;
  /** The frozen set as the freeze writes it (R6's loader reads it back: the Start round trip). */
  set?: WeekQuestSet;
}

interface Tables {
  roadmap: RoadmapRec[];
  roadmapRun: RunRec[];
  roadmapMilestone: MilestoneRec[];
  roadmapItem: ItemRec[];
  roadmapMeasure: MeasureRec[];
  roadmapAcceptance: AcceptanceRec[];
  /** Revision 5, lane 8 (migration B): a TOPICS map's rows (cascade from Roadmap). */
  roadmapTopic: TopicRowRec[];
  roadmapTopicEdge: EdgeRowRec[];
  readings: StoredReading[];
  questWeeks: QuestWeekRow[];
}

const tick = () => new Promise<void>((r) => setImmediate(r));
const clone = <T>(v: T): T => structuredClone(v);

function matches(row: Record<string, unknown>, where: Where): boolean {
  for (const [k, v] of Object.entries(where)) {
    const cur = row[k];
    if (v != null && typeof v === "object") {
      if (!v.in.includes(cur as string | number)) return false;
    } else if (v === null) {
      if (cur != null) return false;
    } else if (cur !== v) return false;
  }
  return true;
}

class FakeWorld {
  t: Tables = { roadmap: [], roadmapRun: [], roadmapMilestone: [], roadmapItem: [], roadmapMeasure: [], roadmapAcceptance: [], roadmapTopic: [], roadmapTopicEdge: [], readings: [], questWeeks: [] };
  templates: (TemplateLite & { captureKey: string | null; link: CaptureLink | null; parsed: ParsedCapture | null; horizon: string | null })[] = [];
  goalPaid: Record<string, DayKey> = {};
  tree: TreeField[] = [];
  applies = 0;
  created: { parsed: ParsedCapture; captureKey: string | null; link: CaptureLink | null }[] = [];
  sized: string[] = [];
  createFailOnce = false;
  domainsCreated: { fieldId: string; name: string }[] = [];
  /** The templates paused through RoadmapIo.pauseTemplate (the safety pause: never archiveTemplate's deferral). */
  paused: string[] = [];
  /** The throughput rows a scope's pace is read from (empty: every pace calibrating). */
  paceRows: ThroughputRows | null = null;
  /** The Body Area's weight view (null: none logged). */
  weight: WeightView | null = null;
  /** Calls the view loaders must never make. */
  modelCalls = 0;
  /** LifeSettings (revision 4): the stored aim-suggestions switch and the epoch day; null: no row. */
  settings: { aimSuggestions: boolean | null; epochDay: DayKey } | null = { aimSuggestions: null, epochDay: "2026-01-01" };
  /** The latest DAY_OPEN row before today, as loadAimStep reads it. */
  lastOpen: DayKey | null = null;
  /** Reads the aim step made (≤ 4, F-R4-3). */
  stepReads = 0;
  /** A revision-4 column not yet applied (P2022): the settings read throws it. */
  missingColumn = false;
  /** The REVIEW ledger rows by card id (the clean-entry read, fix round), and each read made of them. */
  reviews: Record<string, { day: DayKey; detail: string | null; occurredAt?: string | null }[]> = {};
  reviewReads: { ids: string[]; from: DayKey }[] = [];
  /** The clean-entry window's acceptance reads (RoadmapStore.acceptanceMultiplier), by roadmap id; `acceptanceFails` makes it throw. */
  acceptanceReads: string[] = [];
  acceptanceFails = false;
  private seq = 0;
  makeId = () => `id${(++this.seq).toString().padStart(4, "0")}`;

  // ── the guards, as the SQL reads them ──
  guard(userId: string, g: StoreGuard): boolean {
    const t = this.t;
    switch (g.g) {
      case "NO_OTHER_OPEN":
        return !t.roadmap.some((r) => r.userId === userId && (r.status === "DRAFT" || r.status === "ACTIVE") && r.id !== g.exceptId);
      case "NO_OTHER_ACTIVE":
        return !t.roadmap.some((r) => r.userId === userId && r.status === "ACTIVE" && r.id !== g.exceptId);
      // Revision 5 (contracts §23.1): the seat guards as the SQL reads them (a NULL slot counted: ruling 24).
      case "SLOT_FREE": {
        const open = t.roadmap.filter((r) => r.userId === userId && (r.status === "DRAFT" || r.status === "ACTIVE") && r.id !== g.exceptId);
        return !open.some((r) => r.slot === g.slot) && open.length < GOALS_MAX;
      }
      case "KEY_FREE":
        return !t.roadmap.some((r) => r.userId === userId && r.createKey === g.createKey);
      case "DOMAINS_FREE":
        return !t.roadmap.some((r) => r.userId === userId && ["DRAFT", "ACTIVE", "PAUSED"].includes(r.status) && r.id !== g.exceptRoadmapId && r.domainIds.some((d) => g.domainIds.includes(d)));
      case "ROADMAP_IS":
        return t.roadmap.some(
          (r) =>
            r.id === g.id &&
            r.userId === userId &&
            g.statuses.includes(r.status as never) &&
            (g.version == null || r.version === g.version) &&
            (g.archiveReason == null || r.archiveReason === g.archiveReason) &&
            (!g.depthNull || r.depth == null) &&
            (g.updatedAt == null || r.updatedAt.getTime() === g.updatedAt.getTime())
        );
      case "NO_STARTED_MILESTONE":
        return !t.roadmapMilestone.some((m) => m.roadmapId === g.roadmapId && (m.status === "STARTING" || m.status === "STARTED"));
      case "NO_RECENT_RUNNING":
        return !t.roadmapRun.some((r) => r.roadmapId === g.roadmapId && r.status === "RUNNING" && r.startedAt.getTime() > g.since.getTime());
      case "GEMINI_RUNS_BELOW": {
        // Revision 5, lane 10 (ruling 17): chain heads only (no phase, or RATE), as the SQL counts them.
        const phaseOf = (r: RunRec) => (r as RunRec & { phase?: string | null }).phase ?? null;
        return t.roadmapRun.filter((r) => r.userId === userId && r.day === g.day && r.kind === "GEMINI" && r.status !== "REUSED" && (phaseOf(r) == null || phaseOf(r) === "RATE")).length < g.max;
      }
      case "REQUESTS_BELOW": {
        // Revision 5, lane 10 (§22.15): today's summed requests (every run), and the GROUND rows' alone for the grounded cap.
        const today = t.roadmapRun.filter((r) => r.userId === userId && r.day === g.day) as (RunRec & { phase?: string | null; requests?: number | null })[];
        const sum = (rows: typeof today) => rows.reduce((n, r) => n + (r.requests ?? 0), 0);
        return sum(today) + g.need <= g.max && sum(today.filter((r) => r.phase === "GROUND")) + g.needGrounded <= g.groundedMax;
      }
      case "PREREQS_MET":
        return this.prereqsMet(userId, g.roadmapId, g.milestoneId);
      case "RUN_IS":
        return t.roadmapRun.some((r) => r.id === g.id && r.userId === userId && r.status === g.status);
      case "MILESTONE_IS":
        return t.roadmapMilestone.some((m) => {
          const r = t.roadmap.find((x) => x.id === m.roadmapId);
          return m.id === g.id && r?.userId === userId && g.statuses.includes(m.status as never) && (!g.goalIdNull || m.goalId == null);
        });
      case "NO_OTHER_LIVE_MILESTONE":
        return !t.roadmapMilestone.some((m) => {
          if (m.roadmapId !== g.roadmapId || m.id === g.exceptId) return false;
          if (isSupersededRow(m, t.roadmapMilestone.filter((x) => x.roadmapId === m.roadmapId))) return false;
          if (m.status === "STARTING") return true;
          if (m.status !== "STARTED") return false;
          const goal = this.templates.find((x) => x.id === m.goalId);
          return !goal || (goal.closedScore == null && goal.archivedAt == null);
        });
      case "ACCEPTANCE_OPEN":
        return t.roadmapAcceptance.some((a) => a.id === g.id && a.undoneAt == null);
      case "NOTHING_STARTED_SINCE":
        return !t.roadmapMilestone.some((m) => m.roadmapId === g.roadmapId && m.startingAt != null && m.startingAt.getTime() > g.since.getTime());
      case "NO_DRAFT_ROWS":
        return !t.roadmapMilestone.some((m) => m.roadmapId === g.roadmapId && m.version === g.version && (m.status === "DRAFT" || m.status === "LATER"));
    }
  }

  /**
   * Migration A's partial unique indexes as the database holds them (contracts §23.1): (userId, slot) WHERE status IN
   * ('DRAFT','ACTIVE'), and (userId, createKey) WHERE createKey IS NOT NULL. A write that breaks one is a unique
   * violation ('duplicate'), so a path that forgot its guard still can't seat two open goals in one slot.
   */
  roadmapKeysHold(): boolean {
    const seats = new Set<string>();
    const keys = new Set<string>();
    for (const r of this.t.roadmap) {
      if ((r.status === "DRAFT" || r.status === "ACTIVE") && r.slot != null) {
        const k = `${r.userId}:${r.slot}`;
        if (seats.has(k)) return false;
        seats.add(k);
      }
      if (r.createKey != null) {
        const k = `${r.userId}:${r.createKey}`;
        if (keys.has(k)) return false;
        keys.add(k);
      }
    }
    return true;
  }

  /** Live cards at OPEN_LEVEL (6) or above in a Domain of the fixture tree, as the PREREQS_MET SQL counts Idea rows. */
  private cardsAtOpen(domainId: string | null): number {
    if (!domainId) return 0;
    for (const f of this.tree) for (const d of f.domains) if (d.id === domainId) return d.cards.filter((c) => c.level >= 6).length;
    return 0;
  }

  /** The PREREQS_MET guard as its SQL reads it (revision 5, lane 8; F-R5-10). */
  private prereqsMet(userId: string, roadmapId: string, milestoneId: string): boolean {
    const t = this.t;
    const m = t.roadmapMilestone.find((x) => x.id === milestoneId && x.roadmapId === roadmapId);
    if (!m || !t.roadmap.some((r) => r.id === roadmapId && r.userId === userId)) return false;
    const layer = m.layer ?? null;
    if (t.roadmapMilestone.some((p) => p.roadmapId === m.roadmapId && p.chainRole === "LAYER" && layer != null && p.layer === layer - 1 && p.reachedDay != null && p.status !== "DISCARDED")) return true;
    const live = (x: TopicRowRec) => x.roadmapId === m.roadmapId && x.version === m.version && x.chosen && x.decision !== "REMOVED" && x.decision !== "MERGED";
    const counting = (x: EdgeRowRec) => x.roadmapId === m.roadmapId && x.version === m.version && x.decision !== "REMOVED" && (x.origin !== "GEMINI" || x.drawn);
    const floor = 8; // TOPIC_FLOOR_CARDS
    for (const c of t.roadmapTopic.filter((x) => live(x) && layer != null && x.layer === layer)) {
      const own = t.roadmapTopicEdge.filter((x) => counting(x) && x.childLineageId === c.lineageId);
      for (const p of t.roadmapTopic.filter((x) => live(x) && x.layer === c.layer - 1)) {
        if (own.length > 0 && !own.some((x) => x.parentLineageId === p.lineageId)) continue;
        if (p.skippedDay != null || p.heldDay != null) continue;
        if (p.domainId == null || this.cardsAtOpen(p.domainId) < floor) return false;
      }
      for (const x of t.roadmapTopicEdge.filter((e) => e.roadmapId === m.roadmapId && e.version === m.version && e.childLineageId === c.lineageId && e.origin === "CROSS_GOAL" && e.decision !== "REMOVED")) {
        if (x.parentDomainId == null || this.cardsAtOpen(x.parentDomainId) < floor) return false;
      }
    }
    return true;
  }

  private table(name: Exclude<keyof Tables, "readings" | "questWeeks">): Record<string, unknown>[] {
    return this.t[name] as unknown as Record<string, unknown>[];
  }

  applyNow(userId: string, ops: readonly StoreOp[]): ApplyResult {
    const snapshot = clone(this.t);
    const restore = (r: ApplyResult): ApplyResult => {
      this.t = snapshot;
      return r;
    };
    for (const op of ops) {
      switch (op.op) {
        case "guard":
          if (!this.guard(userId, op.guard)) return restore("stale");
          break;
        case "insert": {
          const rows = this.table(op.table);
          for (const r of op.rows) {
            if (rows.some((x) => x.id === r.id)) return restore("duplicate");
            if (op.table === "roadmapMilestone" && r.goalId != null && rows.some((x) => x.goalId === r.goalId)) return restore("duplicate");
            rows.push(clone(r as Record<string, unknown>));
          }
          if (op.table === "roadmap" && !this.roadmapKeysHold()) return restore("duplicate");
          break;
        }
        case "update": {
          const rows = this.table(op.table);
          for (const r of rows) if (matches(r, op.where)) Object.assign(r, clone(op.data));
          if (op.table === "roadmapMilestone" && op.data.goalId != null) {
            const ids = this.t.roadmapMilestone.filter((m) => m.goalId === op.data.goalId);
            if (ids.length > 1) return restore("duplicate");
          }
          if (op.table === "roadmap" && !this.roadmapKeysHold()) return restore("duplicate");
          break;
        }
        case "delete": {
          const rows = this.table(op.table);
          const gone = rows.filter((r) => matches(r, op.where)).map((r) => r.id as string);
          const keep = rows.filter((r) => !matches(r, op.where));
          rows.length = 0;
          rows.push(...keep);
          if (op.table === "roadmapMilestone") {
            const set = new Set(gone);
            this.t.roadmapItem = this.t.roadmapItem.filter((i) => !set.has(i.milestoneId));
            this.t.roadmapMeasure = this.t.roadmapMeasure.filter((m) => !set.has(m.milestoneId));
            this.t.questWeeks = this.t.questWeeks.filter((q) => !set.has(q.milestoneId));
          }
          break;
        }
        case "readings":
          for (const row of op.rows) {
            const cur = this.t.readings.find((r) => r.userId === userId && r.measureKey === row.measureKey && r.day === row.day);
            const observedAt = op.observedAt.toISOString();
            if (!cur) this.t.readings.push({ userId, measureKey: row.measureKey, day: row.day, value: row.value, detail: row.detail, source: "COMPUTED", observedAt });
            else if (upsertDecision({ ...cur, observedAt: new Date(cur.observedAt) }, { source: "COMPUTED", observedAt: op.observedAt, value: row.value, detail: row.detail }) === "update") {
              Object.assign(cur, { value: row.value, detail: clone(row.detail), observedAt });
            }
          }
          break;
        case "selfLog":
          if (!this.t.readings.some((r) => r.userId === userId && r.measureKey === op.measureKey && r.day === op.day)) {
            this.t.readings.push({ userId, measureKey: op.measureKey, day: op.day, value: op.value, detail: op.detail, source: "SELF", observedAt: op.at.toISOString() });
          }
          break;
        case "questWeek": {
          const key = `rq:${op.set.milestoneId}:${op.set.weekStart}`;
          if (!this.t.questWeeks.some((q) => q.userId === userId && q.dedupeKey === key)) {
            this.t.questWeeks.push({ userId, roadmapId: op.roadmapId, milestoneId: op.set.milestoneId, dedupeKey: key, source: op.source, set: clone(op.set) });
          }
          break;
        }
        case "keepAftercare": {
          // The jsonb append, as the SQL does it: the user's milestone only, once per template.
          const m = this.t.roadmapMilestone.find((x) => x.id === op.milestoneId && this.t.roadmap.some((r) => r.id === x.roadmapId && r.userId === userId));
          if (!m) break;
          const f = m.feasibility && typeof m.feasibility === "object" ? (m.feasibility as Record<string, unknown>) : {};
          const kept = Array.isArray(f.aftercareKept) ? (f.aftercareKept as string[]) : [];
          if (!kept.includes(op.templateId)) m.feasibility = { ...f, aftercareKept: [...kept, op.templateId] };
          break;
        }
        case "domainOrigin":
          // Revision 5, lane 8 (decision 63): the Gemini mark, only while the Domain still bears that name and no origin.
          for (const f of this.tree)
            for (const d of f.domains) if (d.id === op.domainId && d.name === op.name && d.nameOrigin == null) Object.assign(d, { nameOrigin: "GEMINI", originName: op.name });
          break;
      }
    }
    this.applies++;
    return "ok";
  }

  store(): RoadmapStore {
    const light = (r: RunRec): RunRec => ({ ...clone(r), pack: null, samples: null, report: null, usage: null });
    return {
      listRoadmaps: async (userId) => {
        await tick();
        return clone(this.t.roadmap.filter((r) => r.userId === userId));
      },
      bundle: async (userId, roadmapId) => {
        await tick();
        const roadmap = this.t.roadmap.find((r) => r.id === roadmapId && r.userId === userId);
        if (!roadmap) return null;
        const milestones = this.t.roadmapMilestone
          .filter((m) => m.roadmapId === roadmapId)
          .sort((a, b) => a.version - b.version || a.ord - b.ord)
          .map((m) => ({
            ...clone(m),
            items: clone(this.t.roadmapItem.filter((i) => i.milestoneId === m.id).sort((a, b) => a.ord - b.ord)),
            measures: clone(this.t.roadmapMeasure.filter((x) => x.milestoneId === m.id)),
          }));
        return {
          roadmap: clone(roadmap),
          runs: this.t.roadmapRun.filter((r) => r.roadmapId === roadmapId).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).map(light),
          milestones,
          acceptances: clone(this.t.roadmapAcceptance.filter((a) => a.roadmapId === roadmapId).sort((a, b) => a.acceptedAt.getTime() - b.acceptedAt.getTime())),
          topics: clone(this.t.roadmapTopic.filter((x) => x.roadmapId === roadmapId).sort((a, b) => a.version - b.version || a.layer - b.layer || a.createdAt.getTime() - b.createdAt.getTime())),
          edges: clone(this.t.roadmapTopicEdge.filter((x) => x.roadmapId === roadmapId).sort((a, b) => a.version - b.version || a.createdAt.getTime() - b.createdAt.getTime())),
        };
      },
      ownerOf: async (userId, ref) => {
        await tick();
        const mine = (roadmapId: string) => this.t.roadmap.some((r) => r.id === roadmapId && r.userId === userId);
        const ms = (id: string) => this.t.roadmapMilestone.find((m) => m.id === id);
        if (ref.itemId) {
          const i = this.t.roadmapItem.find((x) => x.id === ref.itemId);
          const m = i ? ms(i.milestoneId) : undefined;
          if (m && mine(m.roadmapId)) return m.roadmapId;
        }
        if (ref.milestoneId) {
          const m = ms(ref.milestoneId);
          if (m && mine(m.roadmapId)) return m.roadmapId;
        }
        if (ref.lineageId) {
          const i = [...this.t.roadmapItem].reverse().find((x) => x.lineageId === ref.lineageId);
          const m = i ? ms(i.milestoneId) : undefined;
          if (m && mine(m.roadmapId)) return m.roadmapId;
        }
        return null;
      },
      run: async (runId) => {
        await tick();
        const r = this.t.roadmapRun.find((x) => x.id === runId);
        return r ? clone(r) : null;
      },
      runsOfDay: async (userId, day) => {
        await tick();
        return this.t.roadmapRun.filter((r) => r.userId === userId && r.day === day).map(light);
      },
      reusableRuns: async (userId, inputHash, sinceDay) => {
        await tick();
        return clone(this.t.roadmapRun.filter((r) => r.userId === userId && r.inputHash === inputHash && r.kind === "GEMINI" && r.status === "OK" && r.day >= sinceDay));
      },
      measuresWithKeys: async (userId, keys): Promise<KeyedMeasure[]> => {
        await tick();
        return this.t.roadmapMeasure
          .filter((x) => x.measureKey && keys.includes(x.measureKey))
          .map((x) => ({ measureKey: x.measureKey as string, target: x.target, goalId: this.t.roadmapMilestone.find((m) => m.id === x.milestoneId)?.goalId ?? null }));
      },
      readings: async (userId, keys, fromDay) => {
        await tick();
        return clone(this.t.readings.filter((r) => r.userId === userId && r.source === "COMPUTED" && keys.includes(r.measureKey) && r.day >= fromDay));
      },
      selfLogs: async (userId, prefixes) => {
        await tick();
        return clone(this.t.readings.filter((r) => r.userId === userId && r.source === "SELF" && prefixes.some((p) => r.measureKey.startsWith(p))));
      },
      acceptanceMultiplier: async (userId, roadmapId) => {
        await tick();
        this.acceptanceReads.push(roadmapId);
        if (this.acceptanceFails) throw new Error("acceptance read failed");
        // The SQL's order (acceptanceOrderBy): newest version, then newest record; undone ones skipped; the user's roadmap only.
        const live = this.t.roadmapAcceptance
          .filter((a) => a.roadmapId === roadmapId && a.undoneAt == null && this.t.roadmap.some((r) => r.id === roadmapId && r.userId === userId))
          .sort((a, b) => b.version - a.version || b.acceptedAt.getTime() - a.acceptedAt.getTime());
        return live.length ? live[0].intervalMultiplier : null;
      },
      apply: async (userId, ops) => {
        await tick();
        return this.applyNow(userId, ops);
      },
    };
  }

  io(): Partial<RoadmapIo> {
    return {
      fieldTree: async () => clone(this.tree),
      throughput: async (_userId, finalDay) => S.calibratingThroughput(finalDay),
      throughputRows: async (_userId, finalDay) => clone(this.paceRows ?? emptyRows(finalDay)),
      dayLedger: async (_userId, today) => emptyLedger(today),
      weightView: async () => {
        if (!this.weight) throw new Error("no weigh-ins");
        return clone(this.weight);
      },
      maintenanceIds: async () => new Set<string>(),
      intervalMultiplier: async () => 1,
      restRows: async () => [],
      templates: async (_userId, ids) => clone(this.templates.filter((t) => ids.includes(t.id))),
      goalPayments: async (_userId, ids) => Object.fromEntries(Object.entries(this.goalPaid).filter(([k]) => ids.includes(k))),
      midGoalPaidDays: async () => [],
      createTemplate: async (_userId, parsed, opts) => {
        await tick();
        if (this.createFailOnce) {
          this.createFailOnce = false;
          throw new Error("network");
        }
        const existing = opts.captureKey ? this.templates.find((t) => t.captureKey === opts.captureKey) : undefined;
        this.created.push({ parsed: clone(parsed), captureKey: opts.captureKey ?? null, link: opts.link ? clone(opts.link) : null });
        if (existing) return { id: existing.id };
        const id = `tpl${this.templates.length + 1}`;
        this.templates.push({
          id,
          title: parsed.title,
          normTitle: parsed.title.toLowerCase(),
          kind: parsed.kind,
          recurrence: parsed.recurrence,
          parentId: opts.link?.parentId ?? null,
          archivedAt: null,
          closedScore: null,
          completedAt: null,
          dueDay: parsed.dueDay,
          stated: opts.link?.goal?.goalMp ?? null,
          captureKey: opts.captureKey ?? null,
          link: opts.link ?? null,
          parsed,
          horizon: parsed.horizon,
        });
        return { id };
      },
      createDomain: async (fieldId, name) => {
        const f = this.tree.find((x) => x.id === fieldId);
        if (!f) return { ok: false, error: "That Field no longer exists." };
        const id = `dom-new-${this.domainsCreated.length + 1}`;
        f.domains.push({ id, name, fieldId, cards: [] });
        this.domainsCreated.push({ fieldId, name });
        return { ok: true, value: { id, name, fieldId } };
      },
      archiveTemplate: async (_userId, templateId, now) => {
        const t = this.templates.find((x) => x.id === templateId);
        if (!t) return { ok: false, error: "gone" };
        t.archivedAt = now;
        return { ok: true };
      },
      // tasks.ts pauseForSafetyCore: archived at once whatever the rule (the lead's ruling 2; duty-actions-check pins the plan).
      pauseTemplate: async (_userId, templateId, now) => {
        const t = this.templates.find((x) => x.id === templateId);
        if (!t) return { ok: false, error: "gone" };
        this.paused.push(templateId);
        if (t.archivedAt == null) t.archivedAt = now;
        return { ok: true };
      },
      reachModifiers: async () => ({ intervalMultiplier: 1, extraStrikes: 0, graceExtraDays: 0 }),
      aimSettings: async () => {
        this.stepReads++;
        if (this.missingColumn) throw Object.assign(new Error('The column `LifeSettings.aimSuggestions` does not exist in the current database.'), { code: "P2022", meta: { column: "LifeSettings.aimSuggestions" } });
        return this.settings ? clone(this.settings) : null;
      },
      writeAimSuggestions: async (_userId, on) => {
        if (this.missingColumn) throw Object.assign(new Error('The column `LifeSettings.aimSuggestions` does not exist in the current database.'), { code: "P2022", meta: { column: "LifeSettings.aimSuggestions" } });
        this.settings = { aimSuggestions: on, epochDay: this.settings?.epochDay ?? TODAY };
      },
      lastDayOpenBefore: async () => {
        this.stepReads++;
        return this.lastOpen;
      },
      suggestionDomainIds: async () =>
        Array.from(new Set(this.t.roadmapItem.filter((i) => i.kind === "DOMAIN" && i.notes.includes("FROM_SUGGESTION") && i.domainId).map((i) => i.domainId as string))),
      reviewRows: async (_userId, ids, from) => {
        this.reviewReads.push({ ids: [...ids], from });
        return Object.fromEntries(ids.map((id) => [id, clone((this.reviews[id] ?? []).filter((r) => r.day >= from))]));
      },
    };
  }
}

/** No new cards, no tasks: every pace calibrating. */
function emptyRows(finalDay: DayKey): ThroughputRows {
  return { today: addDays(finalDay, THROUGHPUT_LAG_DAYS), finalDay, epochDay: null, settledThroughDay: null, heldDays: [], tasks: [], recurring: [], reviews: [], dayOpens: [], newCards: [] };
}

/** A day with nothing on it yet. */
function emptyLedger(day: DayKey): DayLedger {
  return { day, rawBefore: 0, lifeXp: 0, completions: [], reviews: 0, reviewXp: 0, ideas: 0, dayOpenQty: null };
}

// ═══ Fixture lanes (R1, R2, R3, R6 stand-ins: deterministic, tiny) ══════════
//
// Revision 4: the stand-ins write revision-4 shapes. R2's stage ladder is a
// window per stage (the last n slots up to the depth, so the final row is the
// depth's stage), one paying card measure per Domain of R at level 6 (key
// segment `r`, `rc` on the final stage), the Domains as the user's rows and a
// code-worded title. R3's keys-only validator reads a fixture reply by place:
// its practices, steps and checkpoint become catalog types (CODE, worded by
// roadmap-catalog, GEMINI_PICK), its `needs` pending NOT_CHOSEN Domains, its
// `lines` the user's outline lines (SYLLABUS), its `gaps` GAP rows. No
// Gemini-worded title or item exists anywhere (the tripwire would refuse it).

function windowsOf(today: DayKey, target: DayKey, count?: number) {
  const span = Math.round((Date.parse(target) - Date.parse(today)) / 86_400_000);
  if (span < 35 || span > 1080) return null;
  const n = count ?? milestoneCountFor(span);
  return Array.from({ length: n }, (_, i) => ({ start: addDays(today, Math.round((i * span) / n)), end: i === n - 1 ? target : addDays(today, Math.round(((i + 1) * span) / n) - 1) }));
}

interface FixtureReplyMilestone {
  title?: string;
  /** The Domain the milestone's picks are "on" (its first). */
  domains?: string[];
  practices?: { name: string; method: string; on?: string }[];
  steps?: { title: string }[];
  checkpoint?: { label: string; kind: string } | null;
  /** Outline line indices placed here. */
  lines?: number[];
  /** Unchosen Domain ids Gemini says the aim needs. */
  needs?: string[];
  /** Area suggestion names (GAP rows). */
  gaps?: string[];
  /** A test hook: the stage gets this marker in its title (the fixture engines read it: [impossible], [over], [delayed], …). */
  marker?: string;
}

function item(kind: ItemDraft["kind"], ord: number, label: string, extra: Partial<ItemDraft> = {}): ItemDraft {
  return {
    id: null,
    lineageId: `lin-${kind}-${ord}-${label.replace(/\W+/g, "").slice(0, 12)}`,
    kind,
    ord,
    label,
    rawLabel: null,
    origin: CODE_ORIGIN,
    decision: "PENDING",
    domainId: null,
    proposedName: null,
    syllabusRef: null,
    method: null,
    sessionsPerWeek: null,
    durationBand: null,
    rule: null,
    planSource: null,
    checkpointKind: null,
    outOf: null,
    bar: null,
    addToToday: true,
    templateId: null,
    flags: [],
    notes: [],
    ...extra,
  };
}

function measure(kind: MeasureSpec["kind"], extra: Partial<MeasureSpec>): MeasureSpec {
  return {
    id: null,
    kind,
    role: kind === "CHECKPOINT" ? "CONTEXT" : "PAYS",
    scope: {},
    minLevel: null,
    target: 0,
    targetSource: kind === "CHECKPOINT" ? "YOURS" : "WORKED_OUT",
    fittedTarget: null,
    rateSource: null,
    baseline: null,
    baselineDay: null,
    unit: null,
    itemLineageId: null,
    measureKey: null,
    ...extra,
  };
}

/** Cards of these Domains at level ≥ L, read once from the scope that holds them all (scopes overlap: never summed across them). */
const cardsAt = (input: Parameters<RoadmapLanes["fitPlan"]>[1], ids: readonly string[], level: number) => {
  const scope = input.scopes.find((sc) => ids.every((d) => sc.domainIds.includes(d)));
  return scope ? scope.cards.filter((c) => c.level >= level && ids.includes(c.domainId ?? "")).length : 0;
};

/** The fixture's stage slots: FOUNDATION … the depth's key on a Field Area, STAGE_1..STAGE_5 on a track Area. */
const slotsFor = (intake: Pick<Intake, "fieldId" | "depth">): string[] =>
  intake.fieldId == null ? ["STAGE_1", "STAGE_2", "STAGE_3", "STAGE_4", "STAGE_5"] : ["FOUNDATION", "FAMILIAR", "RETAINED", "FLUENT", "MASTERED"].filter((_, i) => [4, 6, 8, 10, 12][i] <= (intake.depth ?? 12));

/** R2's stage ladder, as the fixture builds it: one window per kept stage, the final stage the depth's. */
function fixtureLadder(intake: Intake, input: Parameters<RoadmapLanes["fitPlan"]>[1], names: Readonly<Record<string, string>>, makeId: () => string): MilestoneDraft[] {
  const target = intake.dateMode === "REALISTIC" ? addDays(input.today, 300) : intake.targetDay;
  const windows = windowsOf(input.today, target) ?? [];
  const slots = slotsFor(intake);
  const ids = intake.fieldId ? [...intake.domainIds] : [];
  return windows.map((win, i) => {
    const stage = slots[Math.max(0, slots.length - windows.length + i)];
    const last = i === windows.length - 1;
    const items: ItemDraft[] = ids.map((d, k) => item("DOMAIN", k + 1, String(names[d] ?? d), { origin: "USER", decision: "KEPT", domainId: d, lineageId: makeId() }));
    const measures: MeasureSpec[] = ids.map((d) =>
      measure("CARDS_AT_LEVEL", { scope: { domainIds: [d] }, minLevel: 6, target: cardsAt(input, [d], 6) + 5 + i, unit: "card", measureKey: cardsAtLevelKey([d], 6, last ? "rc" : "r") })
    );
    return {
      id: null,
      lineageId: makeId(),
      version: 0,
      ord: i + 1,
      title: intake.fieldId ? `${stage}: ${ids.map((d) => names[d]).join(", ") || "your Domains"} to level 6+` : `${intake.aim} · stage ${i + 1} of ${windows.length}`,
      titleOrigin: CODE_ORIGIN,
      titleDecision: "PENDING",
      windowStart: win.start,
      dueDay: win.end,
      status: "DRAFT",
      rankIndex: null,
      overAccepted: false,
      items,
      measures,
      notes: [],
      stage: stage as MilestoneDraft["stage"],
    } satisfies MilestoneDraft;
  });
}

const PRACTICE_KEYS = ["PROBLEM_SETS", "RECALL_DRILLS", "EXPLAIN_IT"] as const;
/** A body plan's picks (Gemini's choice of sessions; a plan with constraints waits for the user's confirm). */
const BODY_PRACTICE_KEYS = ["HARDER_SESSION", "STRENGTH_SESSION", "LONGER_SESSION"] as const;
const STEP_KEYS = ["OUTLINE", "EXPLAIN_ONCE", "SMALL_PROJECT"] as const;

/** A catalog type's code words, as roadmap-catalog writes them. */
const catalogWords = (key: string, domains: string[], aim: string, track: "FIELD" | "BODY" | "CARE" | "DUTY" | "CRAFT" = "FIELD"): string =>
  String(catalogLabelOf(key as never, { track, domains: domains.map((n) => domainName({ id: "", name: n })), aim: aim as never }));

/** R3's keys-only validator over a fixture reply: catalog types placed by slot; the outline lines, needs and gaps as the spec writes them. */
function fixtureKeysOnly(w: FakeWorld, parsed: unknown, ctx: Parameters<RoadmapLanes["validateKeysOnly"]>[1]): ValidatedDraft {
  const reply = ((parsed as { milestones?: FixtureReplyMilestone[] })?.milestones ?? []).slice(0, ctx.slots.length);
  const nameOf = (id: string) => w.tree.flatMap((f) => f.domains).find((d) => d.id === id)?.name ?? id;
  const offset = ctx.slots.length - reply.length;
  const trackPlan = ctx.intake.fieldId == null;
  const track = (trackPlan ? ctx.intake.track : "FIELD") as "FIELD" | "BODY";
  const practiceKeys: readonly string[] = trackPlan ? BODY_PRACTICE_KEYS : PRACTICE_KEYS;
  const milestones: MilestoneDraft[] = reply.map((m, i) => {
    const stage = ctx.slots[Math.max(0, offset + i)];
    const on = m.domains?.[0] ?? ctx.required[0] ?? null;
    const items: ItemDraft[] = [];
    let ord = 1;
    (m.practices ?? []).forEach((p, k) => {
      const key = practiceKeys[k % practiceKeys.length];
      const dom = trackPlan ? null : (p.on ?? on);
      items.push(
        item("PRACTICE", ord++, catalogWords(key, dom ? [nameOf(dom)] : ctx.required.map(nameOf), ctx.intake.aim, track), {
          catalogKey: key as ItemDraft["catalogKey"],
          domainId: dom,
          method: "DELIBERATE_PRACTICE",
          notes: ["GEMINI_PICK"],
          lineageId: `lin-p-${i}-${k}-${p.name.replace(/\W+/g, "").slice(0, 10)}`,
        })
      );
    });
    (m.steps ?? []).forEach((_, k) => {
      const key = STEP_KEYS[k % STEP_KEYS.length];
      items.push(item("STEP", ord++, catalogWords(key, on ? [nameOf(on)] : ctx.required.map(nameOf), ctx.intake.aim), { catalogKey: key, domainId: on, notes: ["GEMINI_PICK"], lineageId: `lin-s-${i}-${k}` }));
    });
    if (m.checkpoint) {
      items.push(item("CHECKPOINT", ord++, catalogWords("SELF_TEST", on ? [nameOf(on)] : ctx.required.map(nameOf), ctx.intake.aim), { catalogKey: "SELF_TEST", checkpointKind: "SELF_TEST", domainId: on, notes: ["GEMINI_PICK"], lineageId: `lin-c-${i}` }));
    }
    for (const line of m.lines ?? []) {
      const text = ctx.intake.syllabus?.lines[line];
      if (text != null) items.push(item("TOPIC", ord++, text, { origin: "SYLLABUS", syllabusRef: line, domainId: ctx.intake.syllabus?.lineDomains?.[line] ?? null, lineageId: `lin-t-${line}` }));
    }
    for (const d of m.needs ?? []) items.push(item("DOMAIN", ord++, nameOf(d), { origin: "GEMINI", domainId: d, notes: ["NOT_CHOSEN"], lineageId: `lin-need-${d}` }));
    for (const g of m.gaps ?? []) items.push(item("GAP", ord++, g, { origin: "GEMINI", groundRef: 0, lineageId: `lin-gap-${g.replace(/\W+/g, "")}` }));
    return { id: null, lineageId: `lin-v-${i}`, version: ctx.version, ord: i + 1, title: m.marker ?? "", titleOrigin: CODE_ORIGIN, titleDecision: "PENDING", windowStart: null, dueDay: null, status: "DRAFT", rankIndex: null, overAccepted: false, items, measures: [], notes: [], stage: stage as MilestoneDraft["stage"] };
  });
  return { milestones, report: { dropped: [], flagged: [], notes: [] }, bulkKeepOff: false, credential: false, nonEnglish: false, uncoveredSyllabus: [], alarm: false };
}

function feasibilityFixture(plan: readonly MilestoneDraft[], today: DayKey): Feasibility {
  const milestones: MilestoneFeasibility[] = plan.map((m) => {
    const impossible = /\[impossible\]/.test(m.title);
    const over = /\[over\]/.test(m.title);
    const practiceMin = m.items.filter((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED").reduce((n, i) => n + (i.sessionsPerWeek ?? 1) * 30, 0);
    return {
      kind: "PLAN",
      lineageId: m.lineageId,
      ord: m.ord,
      knowledge: [],
      time: { verdict: over ? "OVER" : "FITS", unverified: true, ratio: null, worstWeek: null, basis: [] },
      worst: impossible ? "IMPOSSIBLE" : over ? "OVER" : "FITTED",
      basis: [],
      remedies: [],
      weeks: [{ weekStart: today, newPerWeek: 2, practiceMin, reviewMin: 30, availableMin: 300, availableClass: "YOURS" }],
      lastCardDay: null,
    };
  });
  return {
    today,
    m: 1,
    milestones,
    aimCheck: { kind: "unchecked" },
    basis: [],
    remedies: [],
    impossible: milestones.some((x) => x.worst === "IMPOSSIBLE"),
    over: milestones.some((x) => x.worst === "OVER"),
  };
}

/** R2's date check stand-in: D_real the last stage's due day; a [date-impossible] or [date-over] marker on any title sets the verdict. */
function dateCheckFixture(plan: readonly MilestoneDraft[], input: Parameters<RoadmapLanes["fitPlan"]>[1], dateMode: "REALISTIC" | "CHOSEN"): DateCheck {
  const last = plan.filter((m) => m.status !== "LATER" && m.dueDay).map((m) => m.dueDay as DayKey).sort().pop() ?? addDays(input.today, 300);
  const verdict = plan.some((m) => /\[date-impossible\]/.test(m.title)) ? "IMPOSSIBLE" : plan.some((m) => /\[date-over\]/.test(m.title)) ? "OVER" : "FITS";
  const realistic = /\[too-soon\]/.test(plan.map((m) => m.title).join(" ")) ? addDays(input.today, 20) : last;
  return {
    D_real: realistic,
    D_full: realistic,
    D_best_pace: realistic,
    D_best_2x: realistic,
    D_floor: realistic,
    verdict,
    rateAsked: null,
    reachByUserDate: null,
    reachByExam: input.examDay ? 8 : null,
    scheduleBound: false,
    dateOrigin: { origin: dateMode === "REALISTIC" ? "REALISTIC" : "USER", calibrating: [...(input.calibrating ?? [])] },
    basis: [],
  };
}

function lanesFor(w: FakeWorld): Partial<RoadmapLanes> {
  const nameOf = (id: string) => w.tree.flatMap((f) => f.domains).find((d) => d.id === id)?.name ?? id;
  return {
    splitWindows: (today, target, count) => windowsOf(today, target, count),
    buildEvidencePack: (input) => {
      const listed = input.domains.map((d) => d.id);
      return {
        promptVersion: ROADMAP_PROMPT_VERSION,
        lines: [input.intake.aim, ...input.domains.map((d) => `${d.name} · ${Math.floor(d.cards / 5) * 5}`)],
        sections: ["area", "aim", "domains", "plan"],
        domains: [],
        syllabusKeys: [],
        milestoneCount: slotsFor(input.intake).length,
        weeksPerMilestone: [],
        practicesAllowed: input.intake.practicesAllowed,
        trackArea: input.intake.fieldId == null,
        methods: [],
        keymap: { domains: Object.fromEntries(listed.map((id, i) => [`D${i + 1}`, id])), syllabus: {} },
        domainIdsHash: [...input.intake.domainIds].sort().join(","),
        run: {
          track: (input.intake.fieldId == null ? input.intake.track : "FIELD") as "FIELD",
          slots: slotsFor(input.intake),
          depth: input.intake.fieldId == null ? null : ((input.intake.depth ?? 12) as 12),
          otherKeys: [],
          practiceKinds: [],
          stepKinds: [],
          checkpointKinds: [],
          exam: !!input.intake.examLabel,
          gaps: false,
          exclusions: [],
          aimConflict: null,
        },
      };
    },
    inputHashMaterial: (pack, intake, modelId, samples) => json([pack.promptVersion, modelId, samples, intake.aim, pack.lines, pack.domainIdsHash, intake.depth ?? null]),
    buildResponseSchema: () => ({ type: "OBJECT", properties: { needs: { type: "ARRAY" }, stages: { type: "OBJECT", properties: { FOUNDATION: {}, FAMILIAR: {}, RETAINED: {}, FLUENT: {}, MASTERED: {} } } } }),
    integrityOf: (parsed) => {
      if (!parsed || typeof parsed !== "object") return { verdict: "REJECTED", violations: [{ code: "TYPE", path: "" }], modelChars: 0, gapsKept: 0, gapsHidden: 0, gapsDropped: 0, notANameByClause: {} };
      const ms = (parsed as { milestones?: unknown[] }).milestones;
      if (!Array.isArray(ms) || ms.length === 0) return { verdict: "REJECTED", violations: [{ code: "MISSING_REQUIRED", path: "stages" }], modelChars: 0, gapsKept: 0, gapsHidden: 0, gapsDropped: 0, notANameByClause: {} };
      const smuggled = (parsed as { smuggle?: string }).smuggle;
      if (smuggled) return { verdict: "REJECTED", violations: [{ code: "EXTRA_PROPERTY", path: `stages.FOUNDATION.${smuggled}` }], modelChars: 0, gapsKept: 0, gapsHidden: 0, gapsDropped: 0, notANameByClause: {} };
      return { verdict: "CLEAN", violations: [], modelChars: 0, gapsKept: 0, gapsHidden: 2, gapsDropped: 0, notANameByClause: {} };
    },
    validateKeysOnly: (parsed, ctx) => fixtureKeysOnly(w, parsed, ctx),
    stageLadderOf: (intake, input, names, makeId) => {
      if (/\[held\]/.test(intake.aim)) return { ok: false, reason: "HELD", error: "You already hold this depth in these Domains. Add a Domain, raise coverage or set a different aim." };
      if (/\[too far\]/.test(intake.aim) || intake.domainIds.length > 5) return { ok: false, reason: "TOO_FAR", error: "At your pace this depth is realistic in about 4 years. Narrow the aim to fewer Domains, write more cards a week, or choose a lower depth." };
      return { ok: true, plan: fixtureLadder(intake, input, names as Record<string, string>, makeId), stageDays: {} };
    },
    syncStagePractices: (m) => m,
    coverageOf: (input) =>
      input.domains.map((d) => {
        const linesTied = input.lineDomains.filter((x) => x === d.id).length;
        const shared = input.domains.length ? input.lineDomains.filter((x) => x == null).length / input.domains.length : 0;
        const p = coveragePolicyOf(d.live, linesTied + shared);
        const typed = input.typed?.[d.id] ?? null;
        return { domainId: d.id, name: d.name, live: d.live, nonRecall: d.nonRecall, linesTied, linesShared: shared, floor: p.floor, share: p.share, outline: p.outline, policy: p.n, typed, n: typed ?? p.n, belowPolicy: typed != null && typed < p.n };
      }),
    depthTermsOf: (depth, coverage, baselines, today) =>
      coverage.map((c) => ({ measureKey: cardsAtLevelKey([c.domainId], depth, "rc"), target: c.n, baseline: baselines[c.domainId] ?? 0, baselineDay: today, label: `${c.name} · cards at level ${depth}+`, targetSource: c.typed != null ? "YOURS" : "DEPTH" })),
    dateCheckOf: (ladder, input, dateMode) => dateCheckFixture(ladder, input, dateMode),
    lowerDepthPlanOf: (plan, _input, to) => ({ ok: true, plan: plan.filter((m) => m.status === "STARTING" || m.status === "STARTED" || (m.measures.find((x) => x.kind === "CARDS_AT_LEVEL")?.minLevel ?? 0) <= to || !/MASTERED|FLUENT/.test(m.stage ?? "")), dropped: plan.filter((m) => m.status !== "STARTED" && m.status !== "STARTING" && /^(MASTERED|FLUENT)$/.test(m.stage ?? "") && (to < 12 ? m.stage === "MASTERED" || (to < 10 && m.stage === "FLUENT") : false)).map((m) => m.lineageId) }),
    dateEffectOf: (intake, input, add) => add.map((id) => ({ domainId: id, dateWith: addDays(input.today, nameOf(id) === "Calculus" ? 1200 : 420), pastSpan: nameOf(id) === "Calculus" })),
    floorDayOf: (x) => addDays(x.today, Math.round([0, 0, 0, 0, 0, 0, 0, 0, 105, 0, 155, 0, 340][x.depth] * x.m) + (x.ratePerWeek ? Math.ceil((7 * x.newCardsNeeded) / Math.max(1, x.ratePerWeek)) : 0)),
    constraintExclusionsOf: (constraints) => (/no running/i.test(constraints ?? "") ? [{ kind: "HARDER_SESSION", word: "running" }] : []),
    lineDomainDefaultOf: () => null,
    checkLabel: (label) => ({ cleaned: label, flags: [], struck: [], drop: /https?:/.test(label) ? "CONTAINED_LINK" : null, reasons: {} }),
    withLabelChecks: (ms) => ms.map((m) => ({ ...m, titleFlags: [] })),
    isNonEnglish: () => false,
    bulkKeepAllowed: (i) => !/[A-Z]{2,6}/.test(i.aim) && !i.examLabel,
    // The fixture's sizing over R2's own practice progression (contracts §20: code owns it on every plan path, so the
    // fixture places it as R2 does whenever R4 passes the plan's intake; never on a plan the user writes: the lead's ruling 6).
    fitPlan: (plan0, input, opts) =>
      (opts?.intake && opts.manual !== true ? REALISM.syncProgression(plan0, opts.intake, input, {}, w.makeId, { excluded: opts.excluded, picks: opts.picks }) : plan0).map((m) => ({
        ...m,
        measures: m.measures.map((x) => {
          if (x.kind !== "CARDS_AT_LEVEL" || x.targetSource === "YOURS" || x.targetSource === "DEPTH") return x;
          const level = x.minLevel ?? 6;
          return { ...x, minLevel: level, target: cardsAt(input, x.scope.domainIds ?? [], level) + 5 };
        }),
        items: m.items.map((i) =>
          i.kind === "PRACTICE" && i.planSource !== "YOURS" ? { ...i, sessionsPerWeek: 3, durationBand: "D30", rule: "TARGET:3/W", planSource: "WORKED_OUT" } : i
        ),
      })),
    feasibilityOf: (plan, input) => feasibilityFixture(plan, input.today),
    applyRemedy: (plan, _input, remedy) =>
      remedy === "MOVE_TO_LATER" ? plan.map((m, i) => (i === plan.length - 1 && m.status === "DRAFT" ? { ...m, status: "LATER", windowStart: null, dueDay: null } : m)) : [...plan],
    starterLadder: (intake, input, names, makeId) =>
      fixtureLadder(intake, input, names as Record<string, string>, makeId).map((m) => {
        const items = [...m.items];
        if (intake.fieldId == null) items.push(item("PRACTICE", 9, `Practice for ${intake.aim}`, { notes: ["PLACEHOLDER"], lineageId: makeId() }));
        else if (intake.practicesAllowed) items.push(item("PRACTICE", 9, catalogWords("READ_AND_CARD", intake.domainIds.map((d) => String(names[d] ?? d)), intake.aim), { catalogKey: "READ_AND_CARD", method: "READING", lineageId: makeId() }));
        const pl = items.filter((x) => x.kind === "PRACTICE").map((x) => x.lineageId);
        const measures = [...m.measures, ...(pl.length ? [measure("PRACTICE_KEPT", { scope: { itemLineageIds: pl } })] : [])];
        return { ...m, items: items.map((x) => (x.kind === "PRACTICE" ? { ...x, sessionsPerWeek: 3, durationBand: "D30", rule: "TARGET:3/W", planSource: "WORKED_OUT" } : x)), measures };
      }),
    manualLadder: (intake, input, makeId) =>
      fixtureLadder(intake, input, Object.fromEntries(intake.domainIds.map((d) => [d, nameOf(d)])), makeId).map((m, i) => ({ ...m, title: `Milestone ${i + 1}`, titleOrigin: "USER", titleDecision: "EDITED" })),
    refit: (plan) => plan.map((m) => ({ ...m })),
    refitForStart: (milestone, plan, input) => {
      const card = milestone.measures.find((x) => x.kind === "CARDS_AT_LEVEL");
      const delayed = /\[delayed\]/.test(milestone.title) && card && card.minLevel != null;
      return {
        milestone,
        feasibility: feasibilityFixture([milestone], input.today).milestones[0],
        todayCheck: delayed
          ? { measureKey: card.measureKey ?? cardsAtLevelKey(card.scope.domainIds ?? [], card.minLevel as number), stored: card.target, fittedNow: card.target - 2, reason: "no new cards yet in these Domains" }
          : null,
        impossible: /\[impossible-now\]/.test(milestone.title),
      };
    },
    startSnapshotOf: (milestone, refitted, input, startedDay): StartSnapshot => ({
      kind: "START",
      startedDay,
      dueDay: milestone.dueDay ?? startedDay,
      weeks: refitted.feasibility.weeks.map((wk) => ({ ...wk, needRate: 0, fw: 1 })),
      lastCardDay: null,
      pStart: 1,
      pCalibrating: true,
      yieldStart: 1,
      newNeededStart: 0,
      wwStart: 1,
      rateSource: "NONE",
      m: input.m,
      feasibility: refitted.feasibility,
    }),
    draftSamples: async (pack, n, opts) => {
      w.modelCalls += 1;
      try {
        const reply = await (opts.callModel as (r: unknown) => Promise<unknown>)({ pack });
        if (reply && typeof reply === "object" && (reply as { finishReason?: string }).finishReason === "SAFETY") {
          return [{ ok: false as const, error: "finishReason SAFETY", finishReason: "SAFETY", modelVersion: "fixture", responseId: "r-safety", usage: { totalTokenCount: 7 }, latencyMs: 900, raw: "{\"milestones\": [" }];
        }
        return [{ ok: true, value: { raw: json(reply), parsed: reply, finishReason: "STOP", modelVersion: "fixture", responseId: "r1", usage: null, latencyMs: 1200 } }];
      } catch (err) {
        return Array.from({ length: Math.max(1, n) }, () => ({ ok: false as const, error: err instanceof Error ? err.message : "failed" }));
      }
    },
    seedBaseFor: (n) => 11 + 100 * n,
    // R1's pure functions themselves (rank assignment, the basis, the view, the rank reader).
    assignRankIndices: R1.assignRankIndices,
    proficiencyBasisOf: R1.proficiencyBasisOf,
    proficiencyViewOf: R1.proficiencyViewOf,
    aimRankOf: R1.aimRankOf,
    // R1's proficiencyReadingFor reads the database; here the same row from R1's proficiencyReadingOf over the fake world.
    proficiencyReadingFor: async (_userId, roadmapId, now, args) => {
      const key = proficiencyKey(roadmapId);
      const previous =
        w.t.readings
          .filter((r) => r.measureKey === key && r.day <= todayKey(now))
          .sort((a, b) => (a.day === b.day ? a.observedAt.localeCompare(b.observedAt) : a.day.localeCompare(b.day)))
          .pop() ?? null;
      const histogram: Record<string, Record<number, number>> = {};
      const names: Record<string, string> = {};
      for (const f of w.tree)
        for (const d of f.domains) {
          names[d.id] = d.name;
          for (const c of d.cards) (histogram[d.id] ??= {})[c.level] = (histogram[d.id][c.level] ?? 0) + 1;
        }
      return R1.proficiencyReadingOf({ roadmapId, today: todayKey(now), basis: args.basis, histogram, domainNames: names, kept: {}, reached: 0, reachedOnTicks: false, previous, decision: args.decision });
    },
    practiceKeptValue: (templates) => ({ kept: 0, planned: templates.length * 10, held: 0, effTarget: templates.length * 8 }),
    milestoneGOn: () => ({ g: null, binding: null, parts: [] }),
    milestoneHeadlineOf: () => null,
    measureFigureOf: () => null,
    checkpointStandingOf: () => null,
    triggersOf: () => [],
    weekQuestSetFor: async (_userId, milestoneId, weekStart): Promise<WeekQuestSet> => ({ weekStart, milestoneId, state: "OPEN", generator: 1, quests: [], basis: [], cappedBy: null }),
    loadWeekQuests: async () => null,
    loadPastWeeks: async () => [],
  };
}

function depsFor(w: FakeWorld, extra: Partial<RoadmapDeps> = {}): RoadmapDeps {
  return {
    env: WRITES_ON,
    store: w.store(),
    io: w.io(),
    lanes: lanesFor(w),
    makeId: w.makeId,
    defer: () => undefined,
    callModel: async () => ({ milestones: [] }),
    goalsLive: true,
    geminiLive: true,
    ...extra,
  };
}

/**
 * R6's QuestStore over the fake world (fix round 2, lens 2 gap 8): the rows
 * Start writes, read back by R6's own weekQuestSetFor and loadWeekQuests —
 * the milestone with its stored StartSnapshot, its goal, items, measures and
 * templates, the library's cards, the readings and the frozen weeks. Nothing
 * here is R6's logic; what isn't kept in the fake world reads as empty.
 */
function questStoreOf(w: FakeWorld): QuestStore {
  const SCHEDULED = ["PLANNED", "STARTING", "STARTED"];
  const reading = (userId: string, key: string) => w.t.readings.filter((r) => r.userId === userId && r.measureKey === key && r.source === "COMPUTED").sort((a, b) => a.day.localeCompare(b.day));
  return {
    milestones: async (userId, scope) => {
      const ids = "milestoneIds" in scope ? scope.milestoneIds : [];
      const roadmaps = w.t.roadmap.filter((r) => r.userId === userId && ("active" in scope ? r.status === "ACTIVE" : w.t.roadmapMilestone.some((m) => m.roadmapId === r.id && ids.includes(m.id))));
      const out: QuestMilestoneFacts[] = [];
      for (const r of roadmaps) {
        const rows = w.t.roadmapMilestone.filter((m) => m.roadmapId === r.id && ((SCHEDULED.includes(m.status) && m.version <= r.version) || ids.includes(m.id)));
        const scheduledRows = rows.filter((m) => SCHEDULED.includes(m.status) && m.version <= r.version).sort((a, b) => a.ord - b.ord || a.id.localeCompare(b.id));
        const place = new Map<string, number>();
        for (const m of scheduledRows) if (!place.has(m.lineageId)) place.set(m.lineageId, place.size + 1);
        for (const m of rows) {
          const goal = m.goalId ? w.templates.find((t) => t.id === m.goalId) : undefined;
          out.push({
            roadmap: {
              id: r.id,
              status: r.status,
              fieldId: r.fieldId,
              track: r.track,
              depth: r.depth ?? null,
              hoursPerWeek: r.hoursPerWeek,
              intensity: r.intensity,
              startPoint: r.startPoint,
              typicalHours: r.typicalHours,
              typicalHoursSource: r.typicalHoursSource,
              targetDay: r.targetDay,
              practicesAllowed: r.practicesAllowed,
              // The gate's words and the stored answers, as the Prisma store reads them (contracts §19).
              aim: r.aim,
              constraints: r.constraints,
              examLabel: r.examLabel,
              syllabus: clone(r.syllabus ?? null),
              coverage: clone(r.coverage ?? null),
            },
            milestone: { id: m.id, lineageId: m.lineageId, ord: m.ord, title: m.title, status: m.status, startedDay: m.startedDay, dueDay: m.dueDay, feasibility: clone(m.feasibility), goalId: m.goalId, version: m.version, createdAt: m.createdAt, stage: m.stage ?? null },
            goal: goal ? { id: goal.id, dueDay: goal.dueDay, closed: goal.closedScore != null, closedDay: null, archivedDay: goal.archivedAt ? todayKey(goal.archivedAt) : null } : null,
            place: place.get(m.lineageId) ?? m.ord,
            of: place.size,
          });
        }
      }
      return out;
    },
    parts: async (milestoneId) => ({
      items: w.t.roadmapItem
        .filter((i) => i.milestoneId === milestoneId)
        .map((i) => ({ id: i.id, lineageId: i.lineageId, kind: i.kind, ord: i.ord, label: i.label, origin: i.origin, decision: i.decision, domainId: i.domainId, proposedName: i.proposedName, flags: [...(i.flags ?? [])], templateId: i.templateId, rule: i.rule, durationBand: i.durationBand, outOf: i.outOf, bar: i.bar, addToToday: i.addToToday, catalogKey: i.catalogKey ?? null })),
      measures: w.t.roadmapMeasure
        .filter((x) => x.milestoneId === milestoneId)
        .map((x) => ({ kind: x.kind, role: x.role, scope: clone(x.scope), minLevel: x.minLevel, target: x.target, baseline: x.baseline, rateSource: x.rateSource, measureKey: x.measureKey })),
    }),
    templates: async (_userId, ids) =>
      w.templates.filter((t) => ids.includes(t.id)).map((t) => ({ id: t.id, recurrence: t.recurrence, startDay: TODAY, estMinutes: 30, completedAt: t.completedAt, archivedAt: t.archivedAt, kind: t.kind, dueDay: t.dueDay, closedScore: t.closedScore })),
    instances: async () => [],
    domains: async (ids) => w.tree.flatMap((f) => f.domains).filter((d) => ids.includes(d.id)).map((d) => ({ id: d.id, name: d.name, fieldId: d.fieldId })),
    cards: async (domainIds) =>
      w.tree
        .flatMap((f) => f.domains)
        .filter((d) => domainIds.includes(d.id))
        .flatMap((d) => d.cards.map((c) => ({ domainId: d.id, level: c.level, dueDate: new Date(`${c.dueDay}T00:00:00.000Z`), graceEndsAt: null, createdAt: new Date(`${c.createdDay}T00:00:00.000Z`) }))),
    lastReadingBefore: async (userId, key, day) => {
      const r = reading(userId, key).filter((x) => x.day < day).pop();
      return r ? { day: r.day, value: r.value } : null;
    },
    readingOn: async (userId, key, day) => {
      const r = reading(userId, key).find((x) => x.day === day);
      return r ? { day: r.day, value: r.value } : null;
    },
    readingsBetween: async (userId, key, from, to) => reading(userId, key).filter((x) => x.day >= from && x.day <= to).map((x) => ({ day: x.day, value: x.value })),
    logDays: async () => [],
    countAdded: async () => 0,
    addedByDomain: async () => ({}),
    reviewRows: async () => [],
    restRows: async () => [],
    capacity: async (_userId, roadmap) => (held) => ({ availableMin: (roadmap.hoursPerWeek * 60 * Math.max(0, 7 - held.length)) / 7, class: "YOURS", calibrating: true }),
    quotas: async () => [],
    intervalMultiplier: async () => 1,
    questWeeks: async (userId, filter) =>
      w.t.questWeeks
        .filter((q) => q.userId === userId && q.set && (filter.roadmapId == null || q.roadmapId === filter.roadmapId) && (filter.weekStart == null || q.set.weekStart === filter.weekStart))
        .map((q, i) => {
          const set = q.set as WeekQuestSet;
          return { id: `qw${i + 1}`, userId: q.userId, roadmapId: q.roadmapId, milestoneId: q.milestoneId, weekStart: set.weekStart, dedupeKey: q.dedupeKey, source: q.source, state: set.state, generator: set.generator, quests: clone(set.quests), basis: clone(set.basis), cappedBy: set.cappedBy, results: null, finalizedAt: null, createdAt: NOW };
        }),
    insertQuestWeek: async (userId, roadmapId, set, source) => {
      const key = `rq:${set.milestoneId}:${set.weekStart}`;
      if (w.t.questWeeks.some((q) => q.userId === userId && q.dedupeKey === key)) return 0;
      w.t.questWeeks.push({ userId, roadmapId, milestoneId: set.milestoneId, dedupeKey: key, source, set: clone(set) });
      return 1;
    },
    finalizeQuestWeek: async () => 0,
  };
}

// ═══ Fixture world ══════════════════════════════════════════════════════════

function card(domainId: string, level: number): TreeField["domains"][number]["cards"][number] {
  return { domainId, level, dueDay: TODAY, graceEndsDay: null, createdDay: "2026-09-01", title: null, tags: [] };
}

function world(): FakeWorld {
  const w = new FakeWorld();
  w.tree = [
    {
      id: "f-stats",
      name: "Statistics",
      level: 4,
      domains: [
        { id: "d-prob", name: "Probability", fieldId: "f-stats", cards: [...Array(12)].map(() => card("d-prob", 6)).concat([...Array(8)].map(() => card("d-prob", 3))) },
        { id: "d-inf", name: "Inference", fieldId: "f-stats", cards: [...Array(4)].map(() => card("d-inf", 6)) },
      ],
    },
    { id: "f-trade", name: "Trading", level: 2, domains: [{ id: "d-risk", name: "Risk Management", fieldId: "f-trade", cards: [card("d-risk", 2)] }] },
  ];
  return w;
}

const INTAKE: Intake = {
  aim: "Pass the probability exam",
  fieldId: "f-stats",
  track: "CRAFT",
  domainIds: ["d-prob", "d-inf"],
  targetDay: addDays(TODAY, 150),
  hoursPerWeek: 5,
  newCardsPerWeek: null,
  typicalHours: null,
  typicalHoursSource: null,
  syllabus: null,
  startPoint: "BASICS",
  intensity: "STEADY",
  practicesAllowed: true,
  constraints: null,
  examLabel: null,
};

const REPLY = {
  milestones: [
    { title: "Foundations of chance", domains: ["d-prob"], practices: [{ name: "Timed problems", method: "DELIBERATE_PRACTICE" }], steps: [{ title: "Draft a formula sheet" }], checkpoint: { label: "Mock test", kind: "MOCK_TEST" } },
    { title: "Inference basics", domains: ["d-inf"], practices: [{ name: "Read worked examples", method: "READING" }] },
  ],
};

async function newDraft(w: FakeWorld, intake: Intake = INTAKE): Promise<string> {
  const res = await S.saveIntakeCore(USER, intake, NOW, depsFor(w));
  if (!res.ok) throw new Error(`fixture intake: ${res.error}`);
  return res.value.roadmapId;
}

/**
 * A DRAFT roadmap with REPLY drafted (through the real claim and the
 * background half). `nothingToAvoid`: the user answers the activity card
 * with "Nothing to avoid" first (contracts §19: a BODY or CARE plan asks
 * whatever the words, so its gated picks reach the draft only after it).
 */
async function drafted(w: FakeWorld, reply: unknown = REPLY, intake: Intake = INTAKE, nothingToAvoid = false): Promise<string> {
  const id = await newDraft(w, intake);
  if (nothingToAvoid) {
    const said = await answerCard(id, depsFor(w), [], { none: true });
    if (!said.ok) throw new Error(`fixture answer: ${said.error}`);
  }
  const tasks: (() => Promise<void> | void)[] = [];
  const deps = depsFor(w, { defer: (t) => tasks.push(t), callModel: async () => reply, clock: () => NOW });
  const claim = await S.claimDraftCore(USER, id, { force: true }, NOW, deps);
  if (!claim.ok) throw new Error(`fixture claim: ${claim.error}`);
  for (const t of tasks) await t();
  return id;
}

const rowsOf = (w: FakeWorld, roadmapId: string, version?: number) =>
  w.t.roadmapMilestone.filter((m) => m.roadmapId === roadmapId && (version == null || m.version === version)).sort((a, b) => a.version - b.version || a.ord - b.ord);
const itemsOf = (w: FakeWorld, milestoneId: string) => w.t.roadmapItem.filter((i) => i.milestoneId === milestoneId).sort((a, b) => a.ord - b.ord);
/** The answers stored on a roadmap row (Roadmap.coverage["$activities"], contracts §19.3). */
const intakeActivitiesOf = (w: FakeWorld, roadmapId: string) => activityConfirmOf(w.t.roadmap.find((r) => r.id === roadmapId)?.coverage);

/**
 * The activity card's answer as the page sends it (contracts §19.3, R5's
 * activityCardAnswerOf): the key of the words the card was shown with (the
 * page's view), the boxes ticked to avoid, or "Nothing to avoid".
 */
async function cardAnswerOf(deps: RoadmapDeps, avoid: readonly string[], nothingToAvoid = false, now = NOW): Promise<ActivityCardAnswer> {
  const view = await S.loadRoadmapView(USER, now, deps);
  const key = view.activityConfirm?.key ?? view.draft?.activityConfirm?.key;
  if (!key) throw new Error("fixture: no activity card to answer");
  return { key, avoid: [...avoid] as CatalogKey[], nothingToAvoid };
}

/** The user answers the card as the page shows it now: setActivityVerdictsCore with cardAnswerOf's answer. */
async function answerCard(id: string, deps: RoadmapDeps, avoid: readonly string[], opts: { none?: boolean; now?: Date } = {}) {
  const now = opts.now ?? NOW;
  return S.setActivityVerdictsCore(USER, id, await cardAnswerOf(deps, avoid, opts.none === true, now), now, deps);
}
const measuresOf = (w: FakeWorld, milestoneId: string) => w.t.roadmapMeasure.filter((x) => x.milestoneId === milestoneId);

/**
 * What a user does to a revision-4 milestone before accepting (no Gemini
 * words to decide): set each checkpoint's bar, and keep Gemini's practice
 * picks still waiting on the draft ("I checked this" on each: contracts
 * §20.5, accept waits on them). Code's names and the user's own rows need no tap.
 */
async function decideAll(w: FakeWorld, roadmapId: string, milestoneId: string) {
  const deps = depsFor(w);
  for (const i of itemsOf(w, milestoneId)) {
    if (i.kind === "CHECKPOINT" && (i.bar == null || i.outOf == null)) await S.editItemCore(USER, i.id, { outOf: 100, bar: 70 }, NOW, deps);
  }
  for (const m of rowsOf(w, roadmapId).filter((x) => x.status === "DRAFT"))
    for (const i of itemsOf(w, m.id)) if (i.kind === "PRACTICE" && i.decision === "PENDING" && i.notes.includes("GEMINI_PICK")) await S.decideItemCore(USER, i.id, "CHECKED", NOW, deps);
}

/** An ACTIVE roadmap: drafted, the next milestone decided, accepted. */
async function accepted(w: FakeWorld, reply: unknown = REPLY): Promise<string> {
  const id = await drafted(w, reply);
  const next = rowsOf(w, id, 1).find((m) => m.status === "DRAFT") as MilestoneRec;
  await decideAll(w, id, next.id);
  const res = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
  if (!res.ok) throw new Error(`fixture accept: ${res.error}`);
  return id;
}

/** Marks a stage's code title for the fixture engines ([over], [impossible], [impossible-now], [delayed], [date-over], …). */
function mark(w: FakeWorld, milestoneId: string, marker: string) {
  const m = w.t.roadmapMilestone.find((x) => x.id === milestoneId) as MilestoneRec;
  m.title = `${m.title} ${marker}`;
}

const START_ALL: Parameters<typeof S.startMilestoneCore>[2] = { target: "STORED", overAccepted: false, practicesOff: [], rules: {}, decisions: {}, edits: {} };

/**
 * Revision 5: a goal GOALS_MAX 1 can't make yet (lane 4 lifts it to 3): saved through saveIntakeCore by its createKey
 * while the user's other goals step aside, then put in `slot` with `status`, so a check can hold the states three
 * seats allow. Nothing else of the row is touched.
 */
async function seatedGoal(w: FakeWorld, intake: Intake, slot: number, status = "DRAFT"): Promise<string> {
  const others = w.t.roadmap.filter((r) => r.userId === USER && ["DRAFT", "ACTIVE", "PAUSED"].includes(r.status));
  const statuses = others.map((r) => r.status);
  for (const r of others) r.status = "ARCHIVED";
  const res = await S.saveIntakeCore(USER, intake, NOW, depsFor(w), { createKey: `seated-goal-${slot}-${w.t.roadmap.length}` });
  others.forEach((r, i) => (r.status = statuses[i]));
  if (!res.ok) throw new Error(`fixture goal: ${res.error}`);
  const row = w.t.roadmap.find((r) => r.id === res.value.roadmapId) as RoadmapRec;
  row.slot = slot;
  row.status = status;
  return row.id;
}

/** One goal's activity card answered as its own page shows it (?goal=<id>): the key of its words, the boxes ticked, or "Nothing to avoid". */
async function answerGoalCard(roadmapId: string, deps: RoadmapDeps, avoid: readonly string[], none = false, now = NOW) {
  const view = await S.loadRoadmapView(USER, now, deps, roadmapId);
  const key = view.activityConfirm?.key ?? view.draft?.activityConfirm?.key;
  if (!key) throw new Error("fixture: no activity card to answer on that goal");
  return S.setActivityVerdictsCore(USER, roadmapId, { key, avoid: [...avoid] as CatalogKey[], nothingToAvoid: none }, now, deps);
}

/** A goal's card row of one kind, as its own page shows it. */
async function goalCardRow(roadmapId: string, deps: RoadmapDeps, kind: string) {
  const view = await S.loadRoadmapView(USER, NOW, deps, roadmapId);
  return (view.activityConfirm ?? view.draft?.activityConfirm)?.rows.find((r) => r.kind === kind) ?? null;
}

// ── Revision 5, lane 8: the TOPICS fixtures (contracts §22.13, §22.14) ──

/** A TOPICS case's deps: TOPIC_PLANS_LIVE on for this check only (RoadmapDeps.topicSwitches; production passes none). */
const topicDepsFor = (w: FakeWorld, extra: Partial<RoadmapDeps> = {}): RoadmapDeps => depsFor(w, { topicSwitches: { plans: true }, ...extra });

/**
 * A Field goal on Inference alone (4 cards at 6: under TOPIC_FLOOR_CARDS, so its topic pays), dated 300 days out. With
 * no pace the chain's windows spread evenly to the date (CHOSEN), each at least 35 days for up to 8 milestones, and
 * layer 1's under FIRST_RANK_MAX_DAYS with 5 (no PART gate in the rank spread).
 */
const TOPICS_INTAKE: Intake = { ...INTAKE, aim: "Understand probability theory", domainIds: ["d-inf"], targetDay: addDays(TODAY, 300) };

/** A fixture step that must succeed (a refusal throws, failing the block it runs in by name). */
function must<R extends { ok: boolean }>(r: R, what: string): R {
  if (!r.ok) throw new Error(`fixture ${what}: ${(r as unknown as { error?: string }).error ?? "refused"}`);
  return r;
}

/**
 * [Write the topics] on a fresh DRAFT (writeTopicsCore: layer 1 holds the intake's Domain), then, with `typed`, the
 * bands set to typed.length + 1 (SET: yours) and one topic you type in each band from 2 (it builds on the whole layer
 * before), so K = typed.length + 1.
 */
async function writtenTopics(w: FakeWorld, intake: Intake, typed: readonly string[] = []): Promise<string> {
  const id = await newDraft(w, intake);
  const deps = topicDepsFor(w);
  must(await S.writeTopicsCore(USER, id, NOW, deps), "write the topics");
  if (typed.length) {
    must(await S.setLayersCore(USER, id, { kind: "SET", layers: typed.length + 1 }, NOW, deps), "set the layers");
    for (const [i, name] of typed.entries()) must(await S.addTopicCore(USER, id, i + 2, name, NOW, deps), `add ${name}`);
  }
  return id;
}

/**
 * A Gemini topic row in the draft's map as MAP and GROUND leave it (3 of 3 samples, linked by 2 sources, no flag) and
 * kept in layer 1, put in the fake store: the chain that writes it is lane 10's, and no model phase runs here.
 */
function geminiTopicRow(w: FakeWorld, roadmapId: string, key: string, name: string, extra: Partial<TopicRowRec> = {}): TopicRowRec {
  const row: TopicRowRec = {
    id: w.makeId(),
    roadmapId,
    version: (w.t.roadmap.find((r) => r.id === roadmapId)?.version ?? 0) + 1,
    lineageId: w.makeId(),
    key,
    layer: 1,
    name,
    rawName: null,
    nameOrigin: "GEMINI",
    scope: "GENERAL",
    placedBy: "GEMINI",
    grounding: "LINKED",
    sources: [
      { title: "Lecture notes", uri: "https://example.edu/notes" },
      { title: "A textbook chapter", uri: "https://example.org/chapter" },
    ],
    formVotes: 3,
    samples: 3,
    layerVotes: [1, 1, 1],
    decision: "KEPT",
    mergedInto: null,
    chosen: true,
    role: "BASE",
    domainId: null,
    bound: false,
    heldDay: null,
    skippedDay: null,
    flags: [],
    notes: [],
    createdAt: NOW,
    ...extra,
  };
  w.t.roadmapTopic.push(row);
  return row;
}

/** acceptCore's choices on a TOPICS draft, as its confirm names them ("Creates n Domains", the Gemini names; the live milestone's practices). */
const topicAccept = (create: number, geminiNamed: string[] = [], aftercare: "KEEP" | "ARCHIVE" | null = null): Parameters<typeof S.acceptCore>[2] => ({
  overAccepted: true,
  topicMap: { create, geminiNamed, keepAll: null, aftercare },
});

/** Roadmap.planKind as the server reads it (a row with none is LEVELS). */
const kindOf = (r: RoadmapRec | undefined): string => (r?.planKind === "TOPICS" ? "TOPICS" : "LEVELS");

/** The live plan's parts of the roadmap page (ruling 49: they read the row's columns, never Roadmap.draftPlan). */
const LIVE_PARTS = ["state", "header", "positions", "rank", "proficiency", "toward", "current", "milestones", "weekQuests", "feasibility", "history", "triggers", "aftercare", "depth", "dateCheck"] as const;
const livePartsOf = (v: Awaited<ReturnType<typeof S.loadRoadmapView>>): Record<string, string> => Object.fromEntries(LIVE_PARTS.map((k) => [k, json(v[k])]));

async function main() {
  installNoDatabase();
  const errOf = (r: { ok: boolean; error?: string }) => (r.ok ? "ok" : (r as { error: string }).error);
  S = await import("../src/lib/roadmap-server");
  ({ upsertDecision, cleanReadDaysOf } = await import("../src/lib/roadmap-readings"));
  check("the Prisma client in this process is the throwing stand-in", (() => {
    try {
      return (globalThis as unknown as { prisma: { roadmap: unknown } }).prisma.roadmap === "unreachable";
    } catch {
      return true;
    }
  })());
  // ═══ F15: what a milestone states (pure) ══════════════════════════════════
  console.log("— statedForMilestone —");
  eq("3 × 30 min of practice in a 200-minute plan states 6", statedForMilestone({ practiceMinutesPerWeek: 90, plannedTrackedMinutesPerWeek: 200, hasCards: true, lineagePaidOn: null }), { stated: 6, zeroReason: null, paidOn: null });
  eq("knowledge only states 0 (knowledge is paid by reviews)", statedForMilestone({ practiceMinutesPerWeek: 0, plannedTrackedMinutesPerWeek: 120, hasCards: true, lineagePaidOn: null }).zeroReason, "KNOWLEDGE_ONLY");
  eq("a 1 × D15 token practice states 0 (under an hour a week)", statedForMilestone({ practiceMinutesPerWeek: 15, plannedTrackedMinutesPerWeek: 15, hasCards: false, lineagePaidOn: null }).zeroReason, "PRACTICE_UNDER_HOUR");
  eq("60 min of practice in a 4 h plan states 0 (under a third)", statedForMilestone({ practiceMinutesPerWeek: 60, plannedTrackedMinutesPerWeek: 240, hasCards: true, lineagePaidOn: null }).zeroReason, "PRACTICE_UNDER_SHARE");
  eq("exactly 60 of 180 minutes states 6 (a third, the floor met)", statedForMilestone({ practiceMinutesPerWeek: 60, plannedTrackedMinutesPerWeek: 180, hasCards: true, lineagePaidOn: null }).stated, 6);
  eq("a lineage that already paid states 0, with the day", statedForMilestone({ practiceMinutesPerWeek: 120, plannedTrackedMinutesPerWeek: 120, hasCards: false, lineagePaidOn: "2026-03-03" }), {
    stated: 0,
    zeroReason: "LINEAGE_PAID",
    paidOn: "2026-03-03",
  });
  // Pay honesty (F-R4-13): the 6 rests on the practice the app added when, without it, the milestone falls under the gate.
  const rests = statedForMilestone({ practiceMinutesPerWeek: 90, plannedTrackedMinutesPerWeek: 200, hasCards: true, lineagePaidOn: null, addedPracticeMinutesPerWeek: 45, addedPracticeName: "Explain it in your own words: Probability" });
  eq("a 6 that rests on an added practice names it (without its 45 minutes the plan is under an hour)", [rests.stated, rests.restsOnAdded], [6, "Explain it in your own words: Probability"]);
  const clears = statedForMilestone({ practiceMinutesPerWeek: 180, plannedTrackedMinutesPerWeek: 300, hasCards: true, lineagePaidOn: null, addedPracticeMinutesPerWeek: 45, addedPracticeName: "Explain it" });
  eq("…a 6 that clears the gate without it doesn't", [clears.stated, clears.restsOnAdded], [6, null]);
  check("stated is only ever 0 or 6", [0, 15, 59, 60, 61, 90, 300].every((p) => [0, 6].includes(statedForMilestone({ practiceMinutesPerWeek: p, plannedTrackedMinutesPerWeek: 200, hasCards: true, lineagePaidOn: null }).stated)));

  // ═══ rev 4 P0: Gemini drafting is off until the probe passes ══════════════
  console.log("— Gemini drafting switch —");
  {
    const types = await import("../src/lib/roadmap-types");
    check("ROADMAP_GEMINI_LIVE ships false (rev 4 P0)", types.ROADMAP_GEMINI_LIVE === false);
    const w = world();
    const id = await newDraft(w);
    let called = 0;
    const off = await S.claimDraftCore(USER, id, { force: true }, NOW, depsFor(w, { geminiLive: undefined, callModel: async () => (called++, REPLY) }));
    check("with the switch off the claim refuses in words and never reaches the model", !off.ok && off.error === types.GEMINI_DRAFTING_OFF && called === 0);
    check("…and writes no run", w.t.roadmapRun.length === 0);
  }

  // ═══ F2: intake ════════════════════════════════════════════════════════════
  console.log("— intake —");
  {
    const ctx = { today: TODAY, fields: world().tree };
    const v = (patch: Record<string, unknown>) => S.validateIntake({ ...INTAKE, ...patch }, ctx);
    check("a full intake validates", v({}).ok);
    check("an aim of 141 characters is refused", !v({ aim: "a".repeat(141) }).ok);
    check("an empty aim is refused", !v({ aim: "   " }).ok);
    check("34 days is too short", !v({ targetDay: addDays(TODAY, 34) }).ok);
    check("35 days is a roadmap", v({ targetDay: addDays(TODAY, 35) }).ok);
    check("1,080 days is a roadmap", v({ targetDay: addDays(TODAY, 1080) }).ok);
    check("1,081 days is refused", !v({ targetDay: addDays(TODAY, 1081) }).ok);
    check("0 and 41 hours a week are refused", !v({ hoursPerWeek: 0 }).ok && !v({ hoursPerWeek: 41 }).ok && !v({ hoursPerWeek: 2.5 }).ok);
    check("typical hours 0 and 5001 are refused", !v({ typicalHours: 0 }).ok && !v({ typicalHours: 5001 }).ok && v({ typicalHours: 150, typicalHoursSource: "SOA note" }).ok);
    check("101 new cards a week are refused", !v({ newCardsPerWeek: 101 }).ok && v({ newCardsPerWeek: 0 }).ok);
    check("41 syllabus lines are refused", !v({ syllabus: { lines: [...Array(41)].map((_, i) => `Line ${i}`), source: null } }).ok);
    check("a 121-character syllabus line is refused", !v({ syllabus: { lines: ["x".repeat(121)], source: null } }).ok);
    check("an unknown Field is refused", !v({ fieldId: "f-nope" }).ok);
    const dropped = v({ domainIds: ["d-prob", "d-ghost", "d-risk"] });
    eq("an unknown Domain is dropped; one from another Field stays", dropped.ok ? dropped.value.domainIds : null, ["d-prob", "d-risk"]);
    check("a track Area with Domains is rejected", !v({ fieldId: null, track: "BODY", domainIds: ["d-prob"] }).ok);
    const track = v({ fieldId: null, track: "BODY", domainIds: [], practicesAllowed: false });
    check("a track Area always allows practices", track.ok && track.value.practicesAllowed === true);
    const clean = v({ aim: "  Run\n a   sub-50​ 10K  " });
    eq("the aim is cleaned (whitespace, format characters) and never rewritten otherwise", clean.ok ? clean.value.aim : null, "Run a sub- 50 10K".replace("sub- 50", "sub-50"));
  }
  {
    const w = world();
    const off = await S.saveIntakeCore(USER, INTAKE, NOW, { ...depsFor(w), env: WRITES_OFF });
    eq("saveIntake refuses with writes off", off.ok ? "ok" : off.error, ROADMAP_WRITES_OFF);
    check("…and writes nothing", w.t.roadmap.length === 0);
    const [a, b] = await Promise.all([S.saveIntakeCore(USER, INTAKE, NOW, depsFor(w)), S.saveIntakeCore(USER, { ...INTAKE, aim: "Second tap" }, NOW, depsFor(w))]);
    check("two concurrent intakes both answer ok", a.ok && b.ok, json([a, b]));
    eq("…and leave one DRAFT row", w.t.roadmap.filter((r) => r.status === "DRAFT").length, 1);
    check("…the same roadmap id twice", a.ok && b.ok && a.value.roadmapId === b.value.roadmapId);
    // Revision 5 (§23.1): the one open goal is seat 1, the second tap's insert met SLOT_FREE and edited it instead.
    eq("…in seat 1 (every insert sets the slot; the second tap's SLOT_FREE re-read and edited it)", w.t.roadmap.map((r) => r.slot), [1]);
    const again = await S.saveIntakeCore(USER, { ...INTAKE, aim: "Edited aim" }, NOW, depsFor(w));
    check("a second intake edits the open DRAFT", again.ok && w.t.roadmap.length === 1 && w.t.roadmap[0].aim === "Edited aim");
    w.t.roadmap[0].status = "ACTIVE";
    const refused = await S.saveIntakeCore(USER, INTAKE, NOW, depsFor(w));
    // Ruling N15: at GOALS_MAX 3 a seat is free beside the ACTIVE goal, but a second goal never takes its Domains (§23.5).
    eq("an intake while another roadmap is ACTIVE would open a 2nd goal, and is refused on the ACTIVE goal's Domains (DOMAIN_TAKEN names its seat; ruling N15)", [GOALS_MAX, refused.ok ? "ok" : refused.error, S.noSeatLine()], [3, S.DOMAIN_TAKEN(1), GOALS_FULL]);
    check("…and writes nothing", w.t.roadmap.length === 1);
  }
  {
    const w = world();
    const id = await newDraft(w);
    const d = await S.discardDraftCore(USER, id, NOW, depsFor(w));
    check("discarding a draft archives it as discarded", d.ok && w.t.roadmap[0].status === "ARCHIVED");
    const fresh = await S.saveIntakeCore(USER, INTAKE, NOW, depsFor(w));
    check("…so a fresh intake inserts a new DRAFT", fresh.ok && fresh.value.roadmapId !== id && w.t.roadmap.length === 2);
    const undo = await S.undoDiscardCore(USER, id, NOW, depsFor(w));
    // Revision 5 (§23.1, ruling N15): a seat is free, but the new draft now holds the discarded one's Domains.
    eq("the discard's Undo refuses while another open goal holds its Domains (DOMAIN_TAKEN names its seat)", undo.ok ? "ok" : undo.error, S.DOMAIN_TAKEN(1));
    check("…and the draft stays discarded", w.t.roadmap.find((r) => r.id === id)?.status === "ARCHIVED");
    const second = fresh.ok ? fresh.value.roadmapId : "";
    await S.discardDraftCore(USER, second, NOW, depsFor(w));
    const back = await S.undoDiscardCore(USER, id, NOW, depsFor(w));
    const row = w.t.roadmap.find((r) => r.id === id);
    check("…once that goal is discarded too the Undo reopens it in its old seat (seatForReopenOf: every reopen sets the slot)", back.ok && row?.status === "DRAFT" && row.slot === 1, json([back, row?.status, row?.slot]));
  }

  // ═══ F8: drafting ═════════════════════════════════════════════════════════
  console.log("— drafting —");
  {
    const w = world();
    const id = await newDraft(w);
    const day = TODAY;
    const prior = (status: string, i: number, roadmapId = "other"): RunRec => ({
      id: `old${status}${i}`,
      roadmapId,
      userId: USER,
      day,
      version: 1,
      kind: "GEMINI",
      status,
      model: null,
      modelVersion: null,
      promptVersion: null,
      seedBase: null,
      inputHash: null,
      pack: null,
      samples: null,
      report: null,
      usage: null,
      responseIds: [],
      finishReasons: [],
      latencyMs: null,
      error: null,
      startedAt: at(-3_600_000),
      finishedAt: null,
    });
    w.t.roadmapRun.push(...[0, 1, 2, 3].map((i) => prior("FAILED", i)), prior("REUSED", 0), prior("REUSED", 1));
    const tasks: (() => Promise<void> | void)[] = [];
    const ok5 = await S.claimDraftCore(USER, id, { force: false }, NOW, depsFor(w, { defer: (t) => tasks.push(t) }));
    check("4 failed + 2 reused today: the 5th draft is claimed (REUSED isn't counted, failures are)", ok5.ok && ok5.value.status === "RUNNING", json(ok5));
    eq("…it returns at once with one deferred task", tasks.length, 1);
    const second = await S.claimDraftCore(USER, id, { force: true }, at(30_000), depsFor(w));
    eq("a second claim within 60 s is refused", second.ok ? "ok" : second.error, S.DRAFT_RUNNING);
    const capped = await S.claimDraftCore(USER, id, { force: true }, at(61_000), depsFor(w));
    eq("at 61 s the RUNNING run counts toward the cap: 5 drafts today", capped.ok ? "ok" : capped.error, S.DRAFT_CAPPED);
    check("…and a CAPPED run is written", w.t.roadmapRun.some((r) => r.status === "CAPPED"));
    check("…the RUNNING run is left as it was (the claim never ran)", w.t.roadmapRun.filter((r) => r.status === "RUNNING").length === 1);
  }
  {
    const w = world();
    const id = await newDraft(w);
    const first = await S.claimDraftCore(USER, id, { force: false }, NOW, depsFor(w));
    const stale = await S.claimDraftCore(USER, id, { force: true }, at(91_000), depsFor(w));
    check("a claim at 91 s succeeds", first.ok && stale.ok, json(stale));
    const old = w.t.roadmapRun.find((r) => first.ok && r.id === first.value.runId);
    check("…and marks the stale run FAILED 'timed out'", old?.status === "FAILED" && old?.error === "timed out", json(old));
    eq("…leaving one RUNNING", w.t.roadmapRun.filter((r) => r.status === "RUNNING").length, 1);
  }
  {
    const w = world();
    const id = await newDraft(w);
    const both = await Promise.all([S.claimDraftCore(USER, id, { force: true }, NOW, depsFor(w)), S.claimDraftCore(USER, id, { force: true }, NOW, depsFor(w))]);
    eq("two concurrent claims: one claimed, one refused", both.map((r) => (r.ok ? "ok" : r.error)).sort(), [S.DRAFT_RUNNING, "ok"].sort());
    eq("…one RUNNING run", w.t.roadmapRun.filter((r) => r.status === "RUNNING").length, 1);
  }
  {
    // The action returns before the model answers; the background half persists.
    const w = world();
    const id = await newDraft(w);
    let release: (v: unknown) => void = () => undefined;
    const pending = new Promise((r) => (release = r));
    const tasks: (() => Promise<void> | void)[] = [];
    const deps = depsFor(w, { defer: (t) => tasks.push(t), callModel: () => pending, clock: () => NOW });
    const res = await S.claimDraftCore(USER, id, { force: false }, NOW, deps);
    check("the claim returns RUNNING before the model resolves", res.ok && res.value.status === "RUNNING" && rowsOf(w, id).length === 0);
    const bg = Promise.resolve(tasks[0]());
    release(REPLY);
    await bg;
    const run = w.t.roadmapRun.find((r) => res.ok && r.id === res.value.runId);
    eq("…then the run is OK", run?.status, "OK");
    eq("…with the draft written at version 1", rowsOf(w, id, 1).map((m) => m.status), ["DRAFT", "DRAFT"]);
    check("…its raw reply stored (≤ 32 KB)", Array.isArray(run?.samples) && (run?.samples as { raw: string }[])[0].raw.length > 0);
    check("the background half writes nothing with writes off", await (async () => {
      const w2 = world();
      const id2 = await newDraft(w2);
      const t2: (() => Promise<void> | void)[] = [];
      const c = await S.claimDraftCore(USER, id2, { force: false }, NOW, depsFor(w2, { defer: (t) => t2.push(t) }));
      if (!c.ok) return false;
      await S.runDraftCore(c.value.runId, { ...depsFor(w2, { callModel: async () => REPLY }), env: WRITES_OFF });
      return rowsOf(w2, id2).length === 0 && w2.t.roadmapRun[0].status === "RUNNING";
    })());

    // Reuse within 7 days, not at 8; force bypasses reuse; a reuse re-fits on today's data.
    const reuse = await S.claimDraftCore(USER, id, { force: false }, at(120_000), depsFor(w));
    check("an identical request within 7 days is REUSED (no call)", reuse.ok && reuse.value.status === "REUSED", json(reuse));
    const target1 = measuresOf(w, rowsOf(w, id, 1)[0].id).find((x) => x.kind === "CARDS_AT_LEVEL")?.target;
    w.tree[0].domains[0].cards.push(card("d-prob", 7), card("d-prob", 8));
    const reuse2 = await S.claimDraftCore(USER, id, { force: false }, at(180_000), depsFor(w));
    const target2 = measuresOf(w, rowsOf(w, id, 1)[0].id).find((x) => x.kind === "CARDS_AT_LEVEL")?.target;
    check("a reuse re-runs fitting on today's cards (no call): the target moved", reuse2.ok && reuse2.value.status === "REUSED" && target2 === (target1 ?? 0) + 2, `${target1} → ${target2}`);
    check("REUSED runs are outside the cap", w.t.roadmapRun.filter((r) => r.status === "REUSED").length === 2);
    const forced = await S.claimDraftCore(USER, id, { force: true }, at(240_000), depsFor(w));
    check("force bypasses reuse (a new RUNNING run)", forced.ok && forced.value.status === "RUNNING");
    const source = w.t.roadmapRun.find((r) => r.status === "OK") as RunRec;
    source.day = addDays(TODAY, -8);
    w.t.roadmapRun.filter((r) => r.status === "RUNNING").forEach((r) => (r.status = "FAILED"));
    const eight = await S.claimDraftCore(USER, id, { force: false }, at(300_000), depsFor(w));
    check("an identical request 8 days later is not reused", eight.ok && eight.value.status === "RUNNING", json(eight));
  }
  {
    // Persistence replaces an earlier draft version and never touches PLANNED, STARTING or STARTED rows.
    const w = world();
    const id = await drafted(w);
    const keep = rowsOf(w, id, 1)[0];
    const fakes: MilestoneRec[] = (["PLANNED", "STARTING", "STARTED"] as const).map((status, i) => ({ ...keep, id: `keep-${status}`, status, ord: 10 + i }));
    w.t.roadmapMilestone.push(...fakes);
    const before = rowsOf(w, id, 1).filter((m) => m.status === "DRAFT").map((m) => m.id);
    await drafted(w); // the same roadmap (the intake updates the open DRAFT) is drafted again
    const after = rowsOf(w, id, 1);
    check("a new draft replaces the earlier DRAFT rows of the version", !after.some((m) => before.includes(m.id)) && after.filter((m) => m.status === "DRAFT").length === 2);
    check("…and never touches PLANNED, STARTING or STARTED rows", fakes.every((f) => after.some((m) => m.id === f.id && m.status === f.status)));
  }
  {
    // Every fallback yields an acceptable starter.
    const w = world();
    const id = await newDraft(w);
    const tasks: (() => Promise<void> | void)[] = [];
    const claim = await S.claimDraftCore(USER, id, { force: false }, NOW, depsFor(w, { defer: (t) => tasks.push(t) }));
    await S.runDraftCore(claim.ok ? claim.value.runId : "", depsFor(w, { callModel: async () => { throw new Error("no key"); }, clock: () => NOW }));
    const run = w.t.roadmapRun[0];
    check("no key: the run is FAILED with its reason", run.status === "FAILED" && /no key/.test(run.error ?? ""), json(run));
    check("…and the starter ladder is written in its place", rowsOf(w, id, 1).length >= 1 && rowsOf(w, id, 1).every((m) => m.titleOrigin === CODE_ORIGIN));
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
    check("…which is acceptable as written (its Domains are the user's, its names code's)", acc.ok, json(acc));

    const w2 = world();
    const id2 = await newDraft(w2);
    const c2 = await S.claimDraftCore(USER, id2, { force: false }, NOW, depsFor(w2));
    await S.runDraftCore(c2.ok ? c2.value.runId : "", depsFor(w2, { callModel: async () => ({ milestones: [] }), clock: () => NOW }));
    check("an empty reply: FAILED, starter written", w2.t.roadmapRun[0].status === "FAILED" && rowsOf(w2, id2, 1).length >= 1);

    // A v4 schema that asks Gemini nothing (no Domain to suggest, no outline, practices off: every property left out) is
    // never sent: the claim refuses in words, writes no run and uses none of the day's cap; a run claimed before that
    // guard fails without the call, the starter in its place.
    const emptySchema = () => ({ type: "OBJECT", propertyOrdering: [], properties: {} });
    const we = world();
    const ide = await newDraft(we);
    const calls0 = we.modelCalls;
    const refused = await S.claimDraftCore(USER, ide, { force: true }, NOW, depsFor(we, { lanes: { ...lanesFor(we), buildResponseSchema: emptySchema }, callModel: async () => REPLY }));
    check(
      "a schema with no property: the claim refuses (“nothing here for Gemini to arrange”), no run row is written and the model is never called",
      !refused.ok && refused.error === S.NOTHING_TO_ARRANGE && we.t.roadmapRun.length === 0 && we.modelCalls === calls0,
      json([refused, we.t.roadmapRun.length, we.modelCalls - calls0])
    );
    const we2 = world();
    const ide2 = await newDraft(we2);
    const ce2 = await S.claimDraftCore(USER, ide2, { force: false }, NOW, depsFor(we2));
    const callsE = we2.modelCalls;
    await S.runDraftCore(ce2.ok ? ce2.value.runId : "", depsFor(we2, { lanes: { ...lanesFor(we2), buildResponseSchema: emptySchema }, callModel: async () => REPLY, clock: () => NOW }));
    check(
      "…a run claimed before it fails without the call (“nothing for Gemini to arrange”), the starter written",
      we2.t.roadmapRun[0].status === "FAILED" && /nothing for Gemini to arrange/.test(we2.t.roadmapRun[0].error ?? "") && we2.modelCalls === callsE && rowsOf(we2, ide2, 1).length >= 1,
      json([we2.t.roadmapRun[0].status, we2.t.roadmapRun[0].error, we2.modelCalls - callsE])
    );
    // A pack of an earlier prompt version (a v3 run still RUNNING across the deploy) is never sent beside today's
    // instruction and schema: the run fails without the call, the starter in its place.
    const wv = world();
    const idv = await newDraft(wv);
    const cv = await S.claimDraftCore(USER, idv, { force: false }, NOW, depsFor(wv));
    const runV = wv.t.roadmapRun.find((r) => r.id === (cv.ok ? cv.value.runId : ""));
    if (runV && runV.pack && typeof runV.pack === "object") (runV.pack as { promptVersion: number }).promptVersion = 3;
    const callsV = wv.modelCalls;
    await S.runDraftCore(cv.ok ? cv.value.runId : "", depsFor(wv, { callModel: async () => REPLY, clock: () => NOW }));
    check(
      `a v3 pack (prompt version 3, today's is ${ROADMAP_PROMPT_VERSION}) is never sent: FAILED as “an earlier prompt version (never read)”, no model call, the starter written`,
      ROADMAP_PROMPT_VERSION === 4 && runV?.status === "FAILED" && /an earlier prompt version \(never read\)/.test(runV?.error ?? "") && wv.modelCalls === callsV && rowsOf(wv, idv, 1).length >= 1,
      json([runV?.status, runV?.error, wv.modelCalls - callsV])
    );

    const w3 = world();
    const id3 = await newDraft(w3);
    const built = await S.buildStarterCore(USER, id3, NOW, depsFor(w3));
    check("at the cap, 'Build from my numbers' writes an INHOUSE run, outside the cap, with an acceptable plan", built.ok && w3.t.roadmapRun[0].kind === "INHOUSE" && w3.t.roadmapRun[0].status === "OK");
    const acc3 = await S.acceptCore(USER, id3, { overAccepted: false }, NOW, depsFor(w3));
    check("…accepted", acc3.ok, json(acc3));
    const w4 = world();
    const id4 = await newDraft(w4);
    const manual = await S.startManualCore(USER, id4, NOW, depsFor(w4));
    check("'Write it myself' writes a MANUAL run: the stage ladder with its Domains and nothing else", manual.ok && w4.t.roadmapRun[0].kind === "MANUAL" && rowsOf(w4, id4, 1).every((m) => itemsOf(w4, m.id).every((i) => i.kind === "DOMAIN") && m.stage != null));
    const first = rowsOf(w4, id4, 1)[0];
    const added = await S.addItemCore(USER, first.id, { kind: "DOMAIN", domainId: "d-risk" }, NOW, depsFor(w4));
    check("a depth plan counts one set of Domains: a Domain added to one milestone is refused", !added.ok && /same Domains at every stage/.test(added.ok ? "" : added.error), json(added));
    const step = await S.addItemCore(USER, first.id, { kind: "STEP", label: "Book a tutor session" }, NOW, depsFor(w4));
    check("…a step the user writes is added (USER, EDITED)", step.ok && itemsOf(w4, first.id).some((i) => i.kind === "STEP" && i.origin === "USER" && i.decision === "EDITED"));
    const acc4 = await S.acceptCore(USER, id4, { overAccepted: false }, NOW, depsFor(w4));
    check("…and the hand-written plan is accepted (its stages measure the Domains)", acc4.ok, json(acc4));
  }
  check("S.claimPlanOf: the guard and the cap read in order (RUNNING before CAPPED)", (() => {
    const run = (status: string, ageMs: number): RunRec => ({ id: status + ageMs, roadmapId: "r", userId: USER, day: TODAY, version: 1, kind: "GEMINI", status, model: null, modelVersion: null, promptVersion: null, seedBase: null, inputHash: null, pack: null, samples: null, report: null, usage: null, responseIds: [], finishReasons: [], latencyMs: null, error: null, startedAt: at(-ageMs), finishedAt: null });
    const runs = [run("RUNNING", 10_000), ...[1, 2, 3, 4].map((i) => run("FAILED", i * 1000))];
    return S.claimPlanOf("r", runs, runs, NOW).kind === "RUNNING" && S.claimPlanOf("r", [], runs, NOW).kind === "CAPPED";
  })());

  // ═══ F9: review and accept ════════════════════════════════════════════════
  console.log("— review and accept —");
  {
    // A keys-only draft (F-R4-17): code's titles and catalog-worded picks, Gemini's Domain additions pending (F-R4-21).
    const w = world();
    const id = await drafted(w, {
      milestones: [
        { domains: ["d-prob"], practices: [{ name: "a", method: "X" }, { name: "b", method: "X" }], steps: [{ title: "s" }], needs: ["d-risk"] },
        { domains: ["d-inf"] },
      ],
    });
    const deps = depsFor(w);
    const rows0 = rowsOf(w, id, 1);
    const items0 = rows0.flatMap((m) => itemsOf(w, m.id));
    check("a keys-only draft: every row has a stage and every title is code's", rows0.length === 2 && rows0.every((m) => m.stage != null && m.titleOrigin === CODE_ORIGIN), json(rows0.map((m) => [m.stage, m.titleOrigin])));
    check("…no item with origin GEMINI except its Domain additions (NOT_CHOSEN)", items0.every((i) => i.origin !== "GEMINI" || (i.kind === "DOMAIN" && i.notes.includes("NOT_CHOSEN"))), json(items0.filter((i) => i.origin === "GEMINI").map((i) => [i.kind, i.notes])));
    const picks = items0.filter((i) => i.kind === "PRACTICE" || i.kind === "STEP");
    const gemini = items0.filter((i) => i.notes.includes("GEMINI_PICK"));
    check(
      "…every practice and step a catalog type in code's words, the practice progression's (contracts §20): Gemini's pick only as the first stage's focus (its first practice that stage offers, PENDING), every other one the app's (decided)",
      picks.length > 3 &&
        picks.every((i) => i.origin === CODE_ORIGIN && !!i.catalogKey) &&
        gemini.length === 1 &&
        gemini[0].catalogKey === "PROBLEM_SETS" &&
        gemini[0].kind === "PRACTICE" &&
        gemini[0].decision === "PENDING" &&
        itemsOf(w, rows0[0].id).some((i) => i.id === gemini[0].id) &&
        picks.filter((i) => !i.notes.includes("GEMINI_PICK")).every((i) => i.decision === "KEPT"),
      json(picks.map((i) => [i.catalogKey, i.decision, i.notes]))
    );
    check("…the addition sits on every milestone, pending", rows0.every((m) => itemsOf(w, m.id).some((i) => i.kind === "DOMAIN" && i.domainId === "d-risk" && i.decision === "PENDING")));
    const pend = await S.acceptCore(USER, id, { overAccepted: false }, NOW, deps);
    eq("a pending Domain addition blocks accept", pend.ok ? "ok" : pend.error, S.DECIDE_ADDITIONS);
    const practice = gemini[0] as ItemRec;
    eq("Keep is retired on a revision-4 plan", ((r) => (r.ok ? "ok" : r.error))(await S.decideItemCore(USER, practice.id, "KEPT", NOW, deps)), S.NOTHING_TO_KEEP);
    eq("…so is bulk keep", ((r) => (r.ok ? "ok" : r.error))(await S.keepUnflaggedCore(USER, rows0[0].id, NOW, deps)), S.NOTHING_TO_KEEP);
    const codeRow = picks.find((i) => i.kind === "PRACTICE" && !i.notes.includes("GEMINI_PICK")) as ItemRec;
    eq("…and 'I checked this' on code's words (a practice the app added)", ((r) => (r.ok ? "ok" : r.error))(await S.decideItemCore(USER, codeRow.id, "CHECKED", NOW, deps)), S.NOTHING_TO_CHECK);
    const offAdd = await S.confirmDomainAdditionsCore(USER, id, 1, ["d-risk"], NOW, { ...deps, env: WRITES_OFF });
    eq("confirming additions refuses with writes off", offAdd.ok ? "ok" : offAdd.error, ROADMAP_WRITES_OFF);
    const ghost = await S.confirmDomainAdditionsCore(USER, id, 1, ["d-inf-ghost"], NOW, deps);
    check("…and refuses a Domain Gemini didn't suggest", !ghost.ok, json(ghost));
    const added = await S.confirmDomainAdditionsCore(USER, id, 1, ["d-risk"], NOW, deps);
    const rows1 = rowsOf(w, id, 1);
    check("confirming it: CHECKED on every row, and the plan re-dated with it (each stage measures Risk Management)", added.ok && rows1.every((m) => itemsOf(w, m.id).some((i) => i.domainId === "d-risk" && i.decision === "CHECKED") && measuresOf(w, m.id).some((x) => x.kind === "CARDS_AT_LEVEL" && json(x.scope).includes("d-risk"))), json(added));
    check(
      "…the progression kept its places through the re-date: the first stage's focus is still Gemini's pick (PENDING), beside the app's practices and steps",
      itemsOf(w, rows1[0].id).some((i) => i.kind === "PRACTICE" && i.catalogKey === "PROBLEM_SETS" && i.notes.includes("GEMINI_PICK") && i.decision === "PENDING") &&
        itemsOf(w, rows1[0].id).filter((i) => i.kind === "PRACTICE").length >= 2 &&
        itemsOf(w, rows1[0].id).some((i) => i.kind === "STEP"),
      json(itemsOf(w, rows1[0].id).map((i) => [i.kind, i.catalogKey, i.decision]))
    );
    // Gemini's practice pick (contracts §20.5): a pick that isn't code's default for its stage, still waiting, blocks accept
    // on a Field plan too, "Next item to decide" pointing at it; "I checked this" on the row keeps it (CHECKED, still Gemini's).
    const pickNow = itemsOf(w, rows1[0].id).find((i) => i.kind === "PRACTICE" && i.notes.includes("GEMINI_PICK") && i.decision === "PENDING") as ItemRec;
    const waitingPick = await S.acceptCore(USER, id, { overAccepted: false }, NOW, deps);
    const viewPick = await S.loadRoadmapView(USER, NOW, deps);
    eq("a Field plan's Gemini pick still waiting blocks accept (“keep them, or use the app's default”), and 'Next item to decide' is that pick", [waitingPick.ok ? "ok" : waitingPick.error, viewPick.draft?.nextToDecide], [S.DECIDE_PRACTICE_PICKS, pickNow?.id]);
    const keptPick = await S.decideItemCore(USER, pickNow.id, "CHECKED", NOW, deps);
    check("…'I checked this' on the pick keeps it (CHECKED, still marked as Gemini's)", keptPick.ok && itemsOf(w, rows1[0].id).some((i) => i.id === pickNow.id && i.decision === "CHECKED" && i.notes.includes("GEMINI_PICK")), json(keptPick));
    const m2 = rows1[1];
    w.t.roadmapMilestone.find((m) => m.id === m2.id)!.title += " [impossible]";
    const impossible = await S.acceptCore(USER, id, { overAccepted: false }, NOW, deps);
    check("an IMPOSSIBLE stage blocks acceptance", !impossible.ok && /can't be done/.test(impossible.ok ? "" : impossible.error), json(impossible));
    w.t.roadmapMilestone.find((m) => m.id === m2.id)!.title = w.t.roadmapMilestone.find((m) => m.id === m2.id)!.title.replace(" [impossible]", "");
    const okAccept = await S.acceptCore(USER, id, { overAccepted: false }, NOW, deps);
    check("then it is accepted", okAccept.ok, json(okAccept));
    const r = w.t.roadmap.find((x) => x.id === id) as RoadmapRec;
    check("accept: the roadmap is ACTIVE at version 1 with firstAcceptedDay today, its date mode CHOSEN", r.status === "ACTIVE" && r.version === 1 && r.firstAcceptedDay === TODAY && r.dateMode === "CHOSEN");
    eq("accept: DRAFT → PLANNED, ords 1..n, rank indices by stage (Fluent → Expert 4, Mastered → Virtuoso 5)", rowsOf(w, id, 1).map((m) => [m.status, m.ord, m.rankIndex, m.stage]), [
      ["PLANNED", 1, 4, "FLUENT"],
      ["PLANNED", 2, 5, "MASTERED"],
    ]);
    const cardM = measuresOf(w, rows1[0].id).find((x) => x.kind === "CARDS_AT_LEVEL" && json(x.scope).includes("d-prob")) as MeasureRec;
    check("accept: a stage measure keeps its key (segment r), baseline the live recall count today, fittedTarget = target", cardM.baselineDay === TODAY && cardM.fittedTarget === cardM.target && cardM.measureKey === cardsAtLevelKey(["d-prob"], 6, "r") && cardM.baseline === 12, json(cardM));
    const acc = w.t.roadmapAcceptance[0];
    const end = acc.endState as { measureKey: string; target: number; targetSource?: string }[];
    eq("accept: the end state is the depth terms, one per Domain of R at level 12 with `rc` (not the last milestone's measure)", end.map((t) => t.measureKey).sort(), ["d-inf", "d-prob", "d-risk"].map((d) => cardsAtLevelKey([d], 12, "rc")).sort());
    const f = acc.feasibility as Feasibility;
    check("…the acceptance's feasibility carries the reach model, the date check and each Domain's provenance", f.reachModel === 2 && f.dateCheck != null && f.domainOrigins?.["d-risk"]?.by === "GEMINI_NEEDS" && f.domainOrigins?.["d-prob"]?.by === "INTAKE", json([f.reachModel, f.domainOrigins]));
    check("accept: first readings for today (an `r` key), PROFICIENCY included; no first reading of an `rc` key (R1's, with clean entry)", w.t.readings.some((x) => x.measureKey === cardM.measureKey && x.day === TODAY) && w.t.readings.some((x) => x.measureKey.startsWith("PROFICIENCY|")) && !w.t.readings.some((x) => x.measureKey.endsWith("|rc")));
    const again = await S.acceptCore(USER, id, { overAccepted: false }, NOW, deps);
    check("a second accept is refused (nothing left to accept)", !again.ok);
  }
  {
    const w = world();
    const id = await drafted(w, { milestones: [{ domains: ["d-prob"] }, { domains: ["d-inf"] }] });
    const m1 = rowsOf(w, id, 1)[0];
    mark(w, m1.id, "[over]");
    await decideAll(w, id, m1.id);
    const over = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
    check("OVER without the switch is refused", !over.ok && /over your hours/.test(over.ok ? "" : over.error), json(over));
    const withSwitch = await S.acceptCore(USER, id, { overAccepted: true }, NOW, depsFor(w));
    check("…with the switch it is accepted, and the Over is stored", withSwitch.ok && w.t.roadmapAcceptance[0].overAccepted && rowsOf(w, id, 1)[0].overAccepted);
  }
  {
    const w = world();
    const id = await drafted(w);
    const m1 = rowsOf(w, id, 1)[0];
    await decideAll(w, id, m1.id);
    const both = await Promise.all([S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w)), S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w))]);
    eq("two concurrent accepts: one accepted", both.filter((x) => x.ok).length, 1);
    check("…one ACTIVE at version 1, one acceptance row", w.t.roadmap[0].status === "ACTIVE" && w.t.roadmap[0].version === 1 && w.t.roadmapAcceptance.length === 1);
    const w2 = world();
    const other = await accepted(w2);
    const id2 = (() => {
      const r = { ...w2.t.roadmap[0], id: "second", status: "DRAFT", version: 0 };
      w2.t.roadmap.push(r);
      return r.id;
    })();
    const draftRows = rowsOf(w2, other, 1).map((m) => ({ ...m, id: `${m.id}-b`, roadmapId: id2, status: "DRAFT", version: 1 }));
    w2.t.roadmapMilestone.push(...draftRows);
    // Revision 5 (§23.1): acceptCore drops ANOTHER_ACTIVE (a draft already holds its seat). This hand-made second
    // open row (hand-made in goal 1's own seat) shares goal 1's Domains, so DOMAINS_FREE refuses it in words…
    const refused = await S.acceptCore(USER, id2, { overAccepted: false }, NOW, depsFor(w2));
    eq("accept refuses a draft whose Domains another goal holds (DOMAINS_FREE at accept, §23.5), never with ANOTHER_ACTIVE", refused.ok ? "ok" : refused.error, S.DOMAIN_TAKEN(1));
    // …and with Domains of its own, its seat guard (SLOT_FREE beside GOALS_MAX open goals) still never makes a second ACTIVE.
    (w2.t.roadmap.find((r) => r.id === id2) as RoadmapRec).domainIds = ["d-risk"];
    const seated = await S.acceptCore(USER, id2, { overAccepted: false }, NOW, depsFor(w2));
    check(
      "…a hand-made open row in goal 1's own seat is never accepted into a second ACTIVE, and accept never answers ANOTHER_ACTIVE",
      !seated.ok && !seated.error.includes(S.ANOTHER_ACTIVE) && w2.t.roadmap.filter((r) => r.status === "ACTIVE").length === 1 && /function acceptUnpointed[\s\S]*?\r?\n\}\r?\n/.exec(SERVER_SRC_TOP)?.[0].includes("ANOTHER_ACTIVE") === false,
      json(seated)
    );
  }
  {
    // Writes off: every roadmap action refuses before it reads.
    const w = world();
    const id = await drafted(w);
    const m1 = rowsOf(w, id, 1)[0];
    const item1 = itemsOf(w, m1.id)[0];
    const off = { ...depsFor(w), env: WRITES_OFF };
    const appliesBefore = w.applies;
    const tablesBefore = json(w.t);
    const results = await Promise.all([
      S.claimDraftCore(USER, id, { force: true }, NOW, off),
      S.buildStarterCore(USER, id, NOW, off),
      S.startManualCore(USER, id, NOW, off),
      S.discardDraftCore(USER, id, NOW, off),
      S.undoDiscardCore(USER, id, NOW, off),
      S.decideItemCore(USER, item1.id, "CHECKED", NOW, off),
      S.editItemCore(USER, item1.id, { label: "x" }, NOW, off),
      S.addItemCore(USER, m1.id, { kind: "STEP", label: "x" }, NOW, off),
      S.keepUnflaggedCore(USER, m1.id, NOW, off),
      S.resolveDomainCore(USER, item1.id, { kind: "CHECK" }, NOW, off),
      S.acceptCore(USER, id, { overAccepted: true }, NOW, off),
      S.undoAcceptCore(USER, id, 1, NOW, off),
      S.startMilestoneCore(USER, m1.id, START_ALL, NOW, off),
      S.finishStartCore(USER, m1.id, NOW, off),
      S.returnStartingCore(USER, m1.id, NOW, off),
      S.startAgainCore(USER, m1.id, NOW, off),
      S.logCheckpointCore(USER, "lin-c-0", { score: 50, nonce: "n1" }, NOW, off),
      S.replanCore(USER, id, "REFIT", NOW, off),
      S.archiveRoadmapCore(USER, id, { reason: "x", archiveGoal: false }, NOW, off),
      S.markRoadmapDoneCore(USER, id, "x", NOW, off),
      S.keepOnTodayCore(USER, m1.id, "tpl1", NOW, off),
      S.setAimFigureCore(USER, id, { typicalHours: 150, typicalHoursSource: null }, NOW, off),
    ]);
    check("every roadmap action refuses with writes off", results.every((x) => !x.ok && x.error === ROADMAP_WRITES_OFF), json(results.filter((x) => x.ok || x.error !== ROADMAP_WRITES_OFF)));
    check("…and writes nothing", w.applies === appliesBefore && json(w.t) === tablesBefore);
  }
  {
    // Undo: a first acceptance, and a re-plan's.
    const w = world();
    const id = await accepted(w);
    const undo1 = await S.undoAcceptCore(USER, id, 1, at(2_000), depsFor(w));
    check("Undo of a first acceptance returns the roadmap to DRAFT, version 0", undo1.ok && w.t.roadmap[0].status === "DRAFT" && w.t.roadmap[0].version === 0 && w.t.roadmap[0].firstAcceptedDay == null, json(undo1));
    check("…its rows back to DRAFT without rank indices, and undoneAt set", rowsOf(w, id, 1).every((m) => m.status === "DRAFT" && m.rankIndex == null) && w.t.roadmapAcceptance[0].undoneAt != null);
    const late = await (async () => {
      const re = await S.acceptCore(USER, id, { overAccepted: false }, at(3_000), depsFor(w));
      if (!re.ok) return re;
      return S.undoAcceptCore(USER, id, 1, at(3_000 + 60_000), depsFor(w));
    })();
    check("an Undo after the toast's window is refused", !late.ok, json(late));
  }
  {
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    const started = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    check("fixture: milestone 1 starts", started.ok, json(started));
    const rp = await S.replanCore(USER, id, "REFIT", at(10_000), depsFor(w));
    check("a re-fit writes version 2 as a DRAFT of the unstarted positions only", rp.ok && rowsOf(w, id, 2).length === 1 && rowsOf(w, id, 2)[0].status === "DRAFT", json(rp));
    check("…never touching the STARTED row", rowsOf(w, id, 1)[0].status === "STARTED" && rowsOf(w, id, 1)[0].goalId != null);
    const v2 = rowsOf(w, id, 2)[0];
    check("…keeping the unstarted position's lineage and its stage", v2.lineageId === rowsOf(w, id, 1)[1].lineageId && v2.stage === rowsOf(w, id, 1)[1].stage);
    await decideAll(w, id, v2.id);
    const acc2 = await S.acceptCore(USER, id, { overAccepted: false }, at(20_000), depsFor(w));
    check("the re-plan is accepted at version 2 (nothing of Gemini's to decide)", acc2.ok && w.t.roadmap[0].version === 2, json(acc2));
    eq("…the previous PLANNED row → SUPERSEDED", rowsOf(w, id, 1)[1].status, "SUPERSEDED");
    eq("…new ords follow the carried row", rowsOf(w, id, 2)[0].ord, 2);
    check("…its rankIndex is its stage's (Mastered: Virtuoso 5), never above its lineage's first", rowsOf(w, id, 2)[0].rankIndex === 5 && rowsOf(w, id, 1)[0].rankIndex === 4, json([rowsOf(w, id, 1)[0].rankIndex, rowsOf(w, id, 2)[0].rankIndex]));
    check("…the carried STARTED row keeps its rankIndex", rowsOf(w, id, 1)[0].rankIndex === 4);
    const undo = await S.undoAcceptCore(USER, id, 2, at(25_000), depsFor(w));
    check("Undo of the re-plan restores the previous PLANNED row and version 1, in one write", undo.ok && w.t.roadmap[0].version === 1 && rowsOf(w, id, 1)[1].status === "PLANNED" && rowsOf(w, id, 2)[0].status === "DRAFT", json(undo));
    check("…and sets the acceptance's undoneAt", w.t.roadmapAcceptance.filter((a) => a.version === 2).every((a) => a.undoneAt != null));
    const acc3 = await S.acceptCore(USER, id, { overAccepted: false }, at(30_000), depsFor(w));
    check("re-accepting the same re-plan works", acc3.ok, json(acc3));
    // A Start after the acceptance makes its Undo impossible.
    w.t.roadmapMilestone.find((m) => m.id === m1.id)!.startingAt = at(31_000);
    const blocked = await S.undoAcceptCore(USER, id, 2, at(32_000), depsFor(w));
    check("Undo after a Start since is refused", !blocked.ok, json(blocked));
  }

  {
    // [Create as a Domain…] from an area suggestion (F-R4-19): the name as shown is GEMINI CHECKED, FROM_SUGGESTION, on every row; re-dated.
    const w = world();
    const id = await drafted(w, { milestones: [{ domains: ["d-prob"], gaps: ["Bayesian methods"] }, { domains: ["d-inf"] }] });
    const m1 = rowsOf(w, id, 1)[0];
    check("with ROADMAP_GAPS_LIVE false a reply's gap names never land (no GAP row)", !rowsOf(w, id, 1).some((m) => itemsOf(w, m.id).some((i) => i.kind === "GAP")));
    // As if drafted while the switch was on: one GAP row on the first milestone, Gemini's, pending.
    const anyItem = itemsOf(w, m1.id)[0];
    w.t.roadmapItem.push({ ...anyItem, id: "gap-1", lineageId: "lin-gap-1", kind: "GAP", ord: 90, label: "Bayesian methods", origin: "GEMINI", decision: "PENDING", domainId: null, syllabusRef: 0, catalogKey: null, notes: [], flags: [] });
    const gap = itemsOf(w, m1.id).find((i) => i.kind === "GAP") as ItemRec;
    const draftView = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("a pending GAP never blocks accept (it is no undecided row)", !draftView.draft?.milestones[0].items.some((i) => i.kind === "GAP") || S.undecidedRowsOf(draftView.draft!.milestones[0]) === 0, json(draftView.draft?.nextToDecide));
    eq("with ROADMAP_GAPS_LIVE false the panel shows nothing", draftView.draft?.gaps, []);
    const off = await S.resolveDomainCore(USER, gap.id, { kind: "CREATE", name: "Bayesian methods", fieldId: "f-stats" }, NOW, { ...depsFor(w), env: WRITES_OFF });
    eq("Create refuses with writes off", off.ok ? "ok" : off.error, ROADMAP_WRITES_OFF);
    const edited = await S.resolveDomainCore(USER, gap.id, { kind: "CREATE", name: "Kessler statistics", fieldId: "f-stats" }, NOW, depsFor(w, { lanes: { ...lanesFor(w) } }));
    eq("an edited name the app can't ground in your words needs the second confirm", edited.ok ? "ok" : edited.error, S.UNGROUNDED_NAME);
    const made = await S.resolveDomainCore(USER, gap.id, { kind: "CREATE", name: "Bayesian methods", fieldId: "f-stats" }, NOW, depsFor(w));
    const rows = rowsOf(w, id, 1);
    const created = w.tree[0].domains.find((d) => d.name === "Bayesian methods");
    check("Create under the shown name creates the Domain (taxonomy createDomain) once", made.ok && !!created && w.domainsCreated.length === 1, json(made));
    check(
      "…adds it to every unstarted row: GEMINI and CHECKED, ItemNote FROM_SUGGESTION",
      rows.every((m) => itemsOf(w, m.id).some((i) => i.kind === "DOMAIN" && i.domainId === created?.id && i.origin === "GEMINI" && i.decision === "CHECKED" && i.notes.includes("FROM_SUGGESTION"))),
      json(rows.map((m) => itemsOf(w, m.id).filter((i) => i.kind === "DOMAIN").map((i) => [i.label, i.origin, i.decision, i.notes])))
    );
    check("…the GAP row is REMOVED and the plan re-dated with it (each stage measures it)", rows.every((m) => !itemsOf(w, m.id).some((i) => i.kind === "GAP" && i.decision !== "REMOVED")) && rows.every((m) => measuresOf(w, m.id).some((x) => json(x.scope).includes(created?.id ?? "?"))));
    const next = await S.loadIntakeView(USER, NOW, depsFor(w));
    void next;
    check("…and it never grounds a later suggestion (the FROM_SUGGESTION read)", (await w.io().suggestionDomainIds!(USER)).includes(created?.id ?? "?"));
  }
  {
    // Two taps on different items of one milestone (two devices) both land: each word edit is its own row's write, through the one writer.
    const w = world();
    const id = await drafted(w);
    const m1 = rowsOf(w, id, 1)[0];
    const [a, b] = itemsOf(w, m1.id).filter((i) => i.kind === "PRACTICE" || i.kind === "STEP");
    await Promise.all([S.editItemCore(USER, a.id, { label: "My drills" }, NOW, depsFor(w)), S.editItemCore(USER, b.id, { label: "My outline" }, NOW, depsFor(w))]);
    eq("two concurrent word edits on one milestone both stand (EDITED, the user's words)", [itemsOf(w, m1.id).find((i) => i.id === a.id)?.label, itemsOf(w, m1.id).find((i) => i.id === b.id)?.label], ["My drills", "My outline"]);
    check("…an edited catalog row keeps its type (its how copy stays)", itemsOf(w, m1.id).find((i) => i.id === a.id)?.catalogKey === a.catalogKey && itemsOf(w, m1.id).find((i) => i.id === a.id)?.decision === "EDITED");
  }
  {
    // The remedies of a track plan (no depth): one tap each, re-run by the engine.
    const w = world();
    const id = await newDraft(w, { ...INTAKE, aim: "Run a sub-50 10K", fieldId: null, track: "BODY", domainIds: [] });
    await S.buildStarterCore(USER, id, NOW, depsFor(w));
    const later = await S.applyRemedyCore(USER, id, "MOVE_TO_LATER", NOW, depsFor(w));
    const rows = rowsOf(w, id, 1);
    check("'Move to Later' keeps the trailing milestone as a LATER row with no dates", later.ok && rows[rows.length - 1].status === "LATER" && rows[rows.length - 1].dueDay == null, json([later, rows.map((r) => r.status)]));
    const light = await S.applyRemedyCore(USER, id, "REFIT_LIGHT", NOW, depsFor(w));
    check("'Re-fit at Light' stores the intensity LIGHT", light.ok && w.t.roadmap[0].intensity === "LIGHT");
    const bad = await S.applyRemedyCore(USER, id, "NOPE" as never, NOW, depsFor(w));
    check("an unknown remedy is refused", !bad.ok);
  }
  {
    // Keep the depth, move the date (F-R4-11): a depth plan never fits down; [Use <realistic date>] re-dates it.
    const w = world();
    const id = await drafted(w);
    const light = await S.applyRemedyCore(USER, id, "REFIT_LIGHT", NOW, depsFor(w));
    const later = await S.applyRemedyCore(USER, id, "MOVE_TO_LATER", NOW, depsFor(w));
    check("REFIT_LIGHT and MOVE_TO_LATER are refused on a depth plan", !light.ok && !later.ok && w.t.roadmap[0].intensity === "STEADY", json([light, later]));
    const lower = await S.applyRemedyCore(USER, id, "LOWER_DEPTH", NOW, depsFor(w));
    check("LOWER_DEPTH has its own sheet (lowerDepth), never a remedy tap", !lower.ok);
    const realistic = await S.applyRemedyCore(USER, id, "USE_REALISTIC_DATE", NOW, depsFor(w));
    const r = w.t.roadmap[0];
    check("[Use <D_real>] sets the realistic date as the app's (REALISTIC on a draft) and re-dates the stages", realistic.ok && r.dateMode === "REALISTIC" && rowsOf(w, id, 1).every((m) => m.stage != null), json([realistic, r.dateMode, r.targetDay]));
  }
  {
    // Discarding a re-plan draft (ACTIVE roadmap) and its Undo.
    const w = world();
    const id = await accepted(w);
    await S.replanCore(USER, id, "MANUAL", NOW, depsFor(w));
    const d = await S.discardDraftCore(USER, id, NOW, depsFor(w));
    check("discarding a re-plan draft marks its rows DISCARDED and keeps the plan", d.ok && rowsOf(w, id, 2).every((m) => m.status === "DISCARDED") && w.t.roadmap[0].status === "ACTIVE");
    const u = await S.undoDiscardCore(USER, id, NOW, depsFor(w));
    check("…its Undo brings the draft back", u.ok && rowsOf(w, id, 2).every((m) => m.status === "DRAFT"), json(u));
  }
  {
    // A started milestone keeps its Today-bound words; only "I checked this" is offered.
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    const practice = itemsOf(w, m1.id).find((i) => i.kind === "PRACTICE") as ItemRec;
    const removed = await S.decideItemCore(USER, practice.id, "REMOVED", NOW, depsFor(w));
    check("a started milestone's practice can't be removed from the plan", !removed.ok);
    const renamed = await S.editItemCore(USER, practice.id, { label: "Something else" }, NOW, depsFor(w));
    check("…nor renamed (its task on Today carries the name)", !renamed.ok);
  }
  {
    const w = world();
    const view0 = await S.loadIntakeView(USER, NOW, depsFor(w));
    check("the intake view lists the Fields with their real facts and no draft", view0.draft == null && view0.fields.length === 2 && view0.fields[0].domains[0].atSix === 12, json(view0.fields[0]));
    const id = await newDraft(w);
    const view1 = await S.loadIntakeView(USER, NOW, depsFor(w));
    check("…then the open DRAFT to continue", view1.draft?.roadmapId === id && view1.draft.intake.aim === INTAKE.aim && view1.writesOff === false);
  }

  // ═══ F15: Start ═══════════════════════════════════════════════════════════
  console.log("— Start —");
  {
    const w = world();
    const id = await accepted(w);
    const [m1, m2] = rowsOf(w, id, 1);
    const gateOff = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w, { goalsLive: false }));
    eq("Start refuses while the gate is off", gateOff.ok ? "ok" : gateOff.error, S.GATE_OFF);
    const preview = await S.startPreview(USER, m1.id, NOW, depsFor(w));
    check("the Start sheet is offered for a decided milestone", !!preview && preview.canStart && preview.refusal == null, json(preview?.blockers));
    eq("…it states 6 for 3 × 30 min of practice", preview?.pay.stated, 6);
    check("…and lists the Today-bound rows, each settled", !!preview && preview.todayRows.every((r) => r.needs === "NONE") && preview.todayRows.some((r) => r.kind === "DOMAIN"));
    const outline = await S.startPreview(USER, m2.id, NOW, depsFor(w));
    check("a later milestone's sheet has nothing of Gemini's pending (keys-only)", !!outline && outline.pending.length === 0, json(outline?.pending));
    const [a, b] = await Promise.all([S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w)), S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w))]);
    check("a double tap: one answers with the goal", (a.ok || b.ok) && json([a, b]).includes("goalId"), json([a, b]));
    const goals = w.templates.filter((t) => t.kind === "GOAL");
    eq("…exactly one goal", goals.length, 1);
    const goal = goals[0];
    check("the goal is a MID ROADMAP goal through createTemplateCore's link (not MANUAL)", goal.horizon === "MID" && goal.link?.goal?.krMetric === "ROADMAP" && goal.link.goal.krTarget == null);
    check("…stated 6 or 0 only", [0, 6].includes(goal.stated ?? -1));
    eq("…its captureKey is rm:<milestoneId>", goal.captureKey, `rm:${m1.id}`);
    const practice = w.templates.find((t) => t.kind === "HABIT");
    check("its practice is a recurring child under the goal (rm:<id>:p0)", practice?.parentId === goal.id && practice?.captureKey === `rm:${m1.id}:p0` && practice?.recurrence === "TARGET:3/W");
    check("its step is a one-off child (rm:<id>:s<i>)", w.templates.some((t) => t.kind === "TASK" && t.parentId === goal.id && /^rm:.*:s\d$/.test(t.captureKey ?? "")));
    check("no model sized a plan-born task (decision 50: Start defers no sizing)", w.sized.length === 0);
    const row = w.t.roadmapMilestone.find((m) => m.id === m1.id) as MilestoneRec;
    check("the milestone is STARTED with its goal", row.status === "STARTED" && row.goalId === goal.id);
    const pk = measuresOf(w, m1.id).find((x) => x.kind === "PRACTICE_KEPT") as MeasureRec;
    check("PRACTICE_KEPT gets its templateIds, effTarget and measureKey from:<startedDay>", !!pk.measureKey && pk.measureKey.endsWith(`|from:${TODAY}`) && pk.target === 8, json(pk));
    eq("Start freezes exactly one quest set (source START)", w.t.questWeeks.map((q) => q.source), ["START"]);
    const fin = await S.finishStartCore(USER, m1.id, NOW, depsFor(w));
    check("'Finish starting' on a started milestone answers with its goal and writes nothing new", fin.ok && w.templates.filter((t) => t.kind === "GOAL").length === 1 && w.t.questWeeks.length === 1);
    const two = await S.startMilestoneCore(USER, m2.id, START_ALL, NOW, depsFor(w));
    check("another milestone can't start while one is open", !two.ok, json(two));
  }
  {
    // Decision 50 (fix round, contracts §15.6): no model sizes or explains a plan-born task. Start defers nothing, so
    // life-sizing's applySizing (Gemini's free rationale stored as gradeBasis, shown under Today's "Why") never runs
    // for an 'rm:' template; the catalog method set its band and minutes.
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    const tasks: (() => Promise<void> | void)[] = [];
    const st = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w, { defer: (t) => tasks.push(t) }));
    for (const t of tasks) await t();
    const born = w.templates.filter((t) => t.captureKey?.startsWith("rm:"));
    check("Start defers no task at all: no sizing of a plan-born template", st.ok && tasks.length === 0 && born.length >= 3, json([st.ok, tasks.length, born.length]));
    check("…every plan-born template keeps the catalog's minutes (a practice's estMinutes from its band), never a model's", born.filter((t) => t.kind === "HABIT").every((t) => (t.parsed?.estMinutes ?? 0) > 0), json(born.map((t) => [t.kind, t.parsed?.estMinutes])));
    const src = readFileSync(join(process.cwd(), "src/lib/roadmap-server.ts"), "utf8");
    const actions = readFileSync(join(process.cwd(), "src/app/actions/roadmap.ts"), "utf8");
    check("…and neither roadmap-server nor its actions reach life-sizing (no applySizing call or import)", !/applySizing\(/.test(src) && !/from "\.\/life-sizing"|from "@\/lib\/life-sizing"/.test(src + actions), "");
  }
  {
    // Two concurrent Starts of different milestones → one STARTING.
    const w = world();
    const id = await accepted(w);
    const [m1, m2] = rowsOf(w, id, 1);
    await decideAll(w, id, m2.id);
    const res = await Promise.all([S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w)), S.startMilestoneCore(USER, m2.id, START_ALL, NOW, depsFor(w))]);
    eq("two concurrent Starts of different milestones: one started", res.filter((x) => x.ok).length, 1);
    check("…one goal, one milestone past PLANNED", w.templates.filter((t) => t.kind === "GOAL").length === 1 && rowsOf(w, id, 1).filter((m) => m.status !== "PLANNED").length === 1);
    check("…the other refused in words", res.some((x) => !x.ok && (x.error === S.STARTED_ELSEWHERE || /Something changed/.test(x.error))));
  }
  {
    // An interrupted Start is completed by Finish starting.
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    w.createFailOnce = true;
    const first = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    check("a Start whose rows fail is left STARTING and says Finish starting", !first.ok && /Finish starting/.test(first.ok ? "" : first.error) && rowsOf(w, id, 1)[0].status === "STARTING");
    const fin = await S.finishStartCore(USER, m1.id, NOW, depsFor(w));
    check("'Finish starting' completes it", fin.ok && rowsOf(w, id, 1)[0].status === "STARTED", json(fin));
    eq("…one goal and one quest set", [w.templates.filter((t) => t.kind === "GOAL").length, w.t.questWeeks.length], [1, 1]);
    const ret = await S.returnStartingCore(USER, m1.id, at(20 * 60_000), depsFor(w));
    check("a started milestone can't be returned to PLANNED", !ret.ok);
  }
  {
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    w.t.roadmapMilestone.find((m) => m.id === m1.id)!.status = "STARTING";
    w.t.roadmapMilestone.find((m) => m.id === m1.id)!.startingAt = NOW;
    const young = await S.returnStartingCore(USER, m1.id, at(60_000), depsFor(w));
    check("a STARTING row younger than 10 minutes isn't returned", !young.ok);
    const old = await S.returnStartingCore(USER, m1.id, at(11 * 60_000), depsFor(w));
    check("…an older one returns to PLANNED", old.ok && rowsOf(w, id, 1)[0].status === "PLANNED");
  }
  {
    // Refusals by fixture.
    const mk = async (reply: unknown) => {
      const w = world();
      const id = await accepted(w, reply);
      return { w, id, m1: rowsOf(w, id, 1)[0] };
    };
    {
      const { w, m1 } = await mk(REPLY);
      w.t.roadmapMilestone.find((m) => m.id === m1.id)!.dueDay = addDays(TODAY, 30);
      const r = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
      eq("due ≤ 30 days refuses", r.ok ? "ok" : r.error, S.DUE_TOO_SOON);
    }
    {
      const { w, m1 } = await mk({ milestones: [{ domains: ["d-prob"], practices: [{ name: "Timed problems", method: "X" }] }, { domains: ["d-inf"] }] });
      mark(w, m1.id, "[impossible-now]");
      const r = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
      check("IMPOSSIBLE now refuses", !r.ok && /can't be done/.test(r.ok ? "" : r.error), json(r));
    }
    {
      const { w, m1 } = await mk(REPLY);
      w.t.roadmapMilestone.find((m) => m.id === m1.id)!.title = "Now over [over]";
      const r = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
      check("OVER without the switch refuses", !r.ok && /over your hours/.test(r.ok ? "" : r.error), json(r));
      const r2 = await S.startMilestoneCore(USER, m1.id, { ...START_ALL, overAccepted: true }, NOW, depsFor(w));
      check("…with the switch it starts", r2.ok, json(r2));
    }
    {
      // Keys-only rows go to Today in code's or the user's words: Start needs no provenance tap (F-R4-17).
      const { w, m1 } = await mk(REPLY);
      const pv = await S.startPreview(USER, m1.id, NOW, depsFor(w));
      check("a keys-only milestone's Today-bound rows are all settled (no 'check it or edit it')", !!pv && pv.todayRows.every((r) => r.needs === "NONE") && pv.blockers.length === 0, json(pv?.todayRows));
      const legacyRow = itemsOf(w, m1.id).find((i) => i.kind === "PRACTICE") as ItemRec;
      legacyRow.origin = "GEMINI";
      const r = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
      check("a row in Gemini's words (a plan written before revision 4) never reaches Today: Start refuses it", !r.ok && w.templates.length === 0, json(r));
    }
    {
      // A track Area: a placeholder practice must be named; every practice off leaves nothing to measure.
      const w = world();
      const id = await newDraft(w, { ...INTAKE, aim: "Run a sub-50 10K", fieldId: null, track: "BODY", domainIds: [] });
      await S.buildStarterCore(USER, id, NOW, depsFor(w));
      const acc = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
      check("fixture: a track-Area starter is accepted", acc.ok, json(acc));
      const m1 = rowsOf(w, id, 1)[0];
      const placeholder = itemsOf(w, m1.id).find((i) => i.kind === "PRACTICE") as ItemRec;
      const r = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
      check("a placeholder practice refuses Start ('Name this practice')", !r.ok && /Name this practice/.test(r.ok ? "" : r.error), json(r));
      const off = await S.startMilestoneCore(USER, m1.id, { ...START_ALL, practicesOff: [placeholder.lineageId] }, NOW, depsFor(w));
      // Contracts §19: a BODY plan's activity card waits until answered (decision 1), so the refusal points at it (decision 2).
      eq("every practice off on a practice-only milestone refuses, pointing at the activity card that still waits", off.ok ? "ok" : off.error, `${S.NOTHING_MEASURES} ${ACTIVITY_PENDING_POINTER}`);
      const named = await S.startMilestoneCore(USER, m1.id, { ...START_ALL, edits: { [placeholder.id]: { label: "Easy runs" } } }, NOW, depsFor(w));
      check("…naming it lets Start through", named.ok && w.templates.some((t) => t.kind === "HABIT" && t.title === "Easy runs"), json(named));
    }
    {
      // Some practices off: their measure scope shrinks; g reads from the rest; the basis change is disclosed.
      const { w, m1 } = await mk({
        milestones: [
          { title: "One", domains: ["d-prob"], practices: [{ name: "Timed problems", method: "X" }, { name: "Read notes", method: "X" }] },
          { title: "Two", domains: ["d-inf"] },
        ],
      });
      const all = itemsOf(w, m1.id).filter((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED");
      const [p1, p2] = all;
      const r = await S.startMilestoneCore(USER, m1.id, { ...START_ALL, practicesOff: [p2.lineageId] }, NOW, depsFor(w));
      check("a switched-off practice is not added to Today (the others are)", r.ok && all.length >= 2 && w.templates.filter((t) => t.kind === "HABIT").length === all.length - 1, json([r, all.length]));
      const pk = measuresOf(w, m1.id).find((x) => x.kind === "PRACTICE_KEPT") as MeasureRec;
      const keptScopes = measuresOf(w, m1.id)
        .filter((x) => x.kind === "PRACTICE_KEPT")
        .flatMap((x) => (x.scope as { itemLineageIds?: string[] }).itemLineageIds ?? []);
      eq("…its lineage leaves the PRACTICE_KEPT scope (the others' stay)", [...new Set(keptScopes)].sort(), all.filter((i) => i !== p2).map((i) => i.lineageId).sort());
      void p1;
      void pk;
      check("…and its item is kept with addToToday false", itemsOf(w, m1.id).find((i) => i.id === p2.id)?.addToToday === false);
      const prof = w.t.readings.filter((x) => x.measureKey.startsWith("PROFICIENCY|")).pop();
      check("…the PROFICIENCY reading says the basis changed (rebased SWITCHED_OFF)", (prof?.detail as { rebased?: { cause?: string } })?.rebased?.cause === "SWITCHED_OFF", json(prof?.detail));
    }
    {
      // The delayed-start offer: [Use 14].
      const { w, m1 } = await mk({ milestones: [{ domains: ["d-prob"], practices: [{ name: "Timed problems", method: "X" }] }, { domains: ["d-inf"] }] });
      mark(w, m1.id, "[delayed]");
      const pv = await S.startPreview(USER, m1.id, NOW, depsFor(w));
      const stored = measuresOf(w, m1.id).find((x) => x.kind === "CARDS_AT_LEVEL")?.target ?? 0;
      check("the sheet offers 'fitted today it would be …'", pv?.todayCheck?.fittedNow === stored - 2, json(pv?.todayCheck));
      const r = await S.startMilestoneCore(USER, m1.id, { ...START_ALL, target: "FITTED_NOW" }, NOW, depsFor(w));
      check("[Use 14] starts with the re-fitted target", r.ok && measuresOf(w, m1.id).find((x) => x.kind === "CARDS_AT_LEVEL")?.target === stored - 2, json(r));
    }
    {
      // The high-water baseline from a paid same-key measure.
      const { w, id, m1 } = await mk(REPLY);
      const cardM = measuresOf(w, m1.id).find((x) => x.kind === "CARDS_AT_LEVEL") as MeasureRec;
      const paidMilestone: MilestoneRec = { ...rowsOf(w, id, 1)[1], id: "paid-ms", goalId: "paid-goal", status: "STARTED", version: 1, roadmapId: "old-roadmap" };
      w.t.roadmap.push({ ...w.t.roadmap[0], id: "old-roadmap", status: "ARCHIVED" });
      w.t.roadmapMilestone.push(paidMilestone);
      w.t.roadmapMeasure.push({ ...cardM, id: "paid-measure", milestoneId: "paid-ms", target: cardM.target - 1 });
      w.goalPaid["paid-goal"] = "2026-03-03";
      w.templates.push({ id: "paid-goal", title: "old", normTitle: "old", kind: "GOAL", recurrence: null, parentId: null, archivedAt: null, closedScore: 0.9, completedAt: null, dueDay: null, stated: 6, captureKey: null, link: null, parsed: null, horizon: "MID" });
      const r = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
      check("a target below the paid high-water mark + the minimum increment refuses ('Already counted up to …')", !r.ok && /Already counted up to .* \(paid 3 Mar\)/.test(r.ok ? "" : r.error), json(r));
      w.t.roadmapMeasure.find((x) => x.id === "paid-measure")!.target = 13;
      const r2 = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
      check("…a lower paid mark: the baseline is max(live, paid high-water)", r2.ok && measuresOf(w, m1.id).find((x) => x.kind === "CARDS_AT_LEVEL")?.baseline === 13, json(r2));
    }
    {
      // A same-name practice already on Today from an earlier milestone starts switched off.
      const { w, id, m1 } = await mk({
        milestones: [
          { domains: ["d-prob"], practices: [{ name: "Backtest", method: "X", on: "d-prob" }] },
          { domains: ["d-inf"], practices: [{ name: "Backtest", method: "X", on: "d-prob" }] },
        ],
      });
      await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
      const goal = w.templates.find((t) => t.kind === "GOAL")!;
      goal.closedScore = 0.8;
      const m2 = rowsOf(w, id, 1)[1];
      await decideAll(w, id, m2.id);
      const pv = await S.startPreview(USER, m2.id, NOW, depsFor(w));
      // The build-up rule's carry (contracts §20.3): milestone 2 keeps what milestone 1 trained, and Start doesn't add it twice.
      const carriedRows = (pv?.practices ?? []).filter((p) => p.alreadyOnToday != null);
      check(
        "a practice milestone 2 carries from milestone 1 is already on Today ('… is already on Today (from Milestone 1)'): its switch starts off",
        carriedRows.length >= 1 && carriedRows.every((p) => p.on === false && p.alreadyOnToday?.fromOrd === 1),
        json(pv?.practices)
      );
    }
  }

  // ═══ Measures and lifecycle ═══════════════════════════════════════════════
  console.log("— checkpoint, re-plan, archive, done —");
  {
    const w = world();
    const id = await accepted(w);
    // The progression's first checkpoint (contracts §20: none on the first stage; the last holds the performance check).
    const cp = rowsOf(w, id, 1).flatMap((m) => itemsOf(w, m.id)).find((i) => i.kind === "CHECKPOINT") as ItemRec;
    const a = await S.logCheckpointCore(USER, cp.lineageId, { score: 68, outOf: 100, nonce: "nonce-1" }, NOW, depsFor(w));
    const b = await S.logCheckpointCore(USER, cp.lineageId, { score: 68, outOf: 100, nonce: "nonce-1" }, NOW, depsFor(w));
    check("a checkpoint log writes once per nonce (append-only, SELF)", a.ok && b.ok && w.t.readings.filter((r) => r.source === "SELF").length === 1);
    const c = await S.logCheckpointCore(USER, cp.lineageId, { score: 101, outOf: 100, nonce: "nonce-2" }, NOW, depsFor(w));
    check("a score above the scale is refused", !c.ok);
    check("checkpoint logs never touch computed rows", w.t.readings.filter((r) => r.source === "SELF").every((r) => r.measureKey.startsWith("SELF|CHECKPOINT|")));
  }
  {
    // The end-state anchor across a re-plan: a depth term's baseline stays the first acceptance's (the depth terms never move with a re-plan).
    const w = world();
    const id = await accepted(w);
    const firstEnd = w.t.roadmapAcceptance[0].endState as { measureKey: string; target: number; baseline: number }[];
    w.tree[0].domains[1].cards.push(...[...Array(25)].map(() => card("d-inf", 12))); // live counts move after the first acceptance
    const rp = await S.replanCore(USER, id, "MANUAL", at(60_000), depsFor(w));
    check("a hand re-plan copies the unstarted positions as DRAFT rows, stages kept", rp.ok && rowsOf(w, id, 2).length === 2 && rowsOf(w, id, 2).every((m) => m.stage != null), json(rp));
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, at(70_000), depsFor(w));
    check("fixture: the re-plan is accepted", acc.ok, json(acc));
    const second = w.t.roadmapAcceptance[1].endState as { measureKey: string; target: number; baseline: number }[];
    const inf1 = firstEnd.find((t) => t.measureKey.includes("d-inf"))!;
    const inf2 = second.find((t) => t.measureKey === inf1.measureKey)!;
    check("the depth term keeps its key, its target (n_d never re-fitted) and the first acceptance's baseline (the anchor)", !!inf2 && inf2.baseline === inf1.baseline && inf2.target === inf1.target, json([inf1, inf2]));
    const view = await S.loadRoadmapView(USER, at(80_000), depsFor(w));
    eq("…and Plan history lists both acceptances", view.history.map((h) => h.version), [1, 2]);
    const rebased = w.t.readings.filter((r) => r.measureKey.startsWith("PROFICIENCY|")).pop();
    check("…the re-plan's PROFICIENCY reading is rebased (REPLAN), never a gain", (rebased?.detail as { rebased?: { cause?: string } })?.rebased?.cause === "REPLAN", json(rebased?.detail));
  }
  {
    // A re-plan keeps every reached milestone's rankIndex.
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    w.t.roadmapMilestone.find((m) => m.id === m1.id)!.reachedDay = TODAY;
    await S.replanCore(USER, id, "REFIT", at(1_000), depsFor(w));
    await S.acceptCore(USER, id, { overAccepted: false }, at(2_000), depsFor(w));
    check("a re-plan keeps the reached milestone's rankIndex (its stage's, Expert 4), and its reachedDay", rowsOf(w, id, 1)[0].rankIndex === 4 && rowsOf(w, id, 1)[0].reachedDay === TODAY, json(rowsOf(w, id, 1)[0]));
  }
  {
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    const goal = w.templates.find((t) => t.kind === "GOAL")!;
    const keep = await S.archiveRoadmapCore(USER, id, { reason: "Changed course", archiveGoal: false }, NOW, depsFor(w));
    check("archiving leaves an open milestone goal on Today unless asked", keep.ok && w.t.roadmap[0].status === "ARCHIVED" && goal.archivedAt == null);
    check("…history is kept (rows, readings)", rowsOf(w, id).length > 0 && w.t.readings.length > 0);
    const w2 = world();
    const id2 = await accepted(w2);
    await S.startMilestoneCore(USER, rowsOf(w2, id2, 1)[0].id, START_ALL, NOW, depsFor(w2));
    const arch = await S.archiveRoadmapCore(USER, id2, { reason: "Done with it", archiveGoal: true }, NOW, depsFor(w2));
    check("…and archives it when the user said so", arch.ok && w2.templates.find((t) => t.kind === "GOAL")!.archivedAt != null);
    const after = await S.saveIntakeCore(USER, INTAKE, NOW, depsFor(w2));
    check("an archived roadmap frees the one-open slot", after.ok);
  }
  {
    const w = world();
    const id = await accepted(w);
    const noReason = await S.markRoadmapDoneCore(USER, id, null, NOW, depsFor(w));
    check("done before the aim is reached requires a reason", !noReason.ok);
    const withReason = await S.markRoadmapDoneCore(USER, id, "Passed early", NOW, depsFor(w));
    check("…stored in doneReason", withReason.ok && w.t.roadmap[0].status === "DONE" && w.t.roadmap[0].doneReason === "Passed early");
    const w2 = world();
    const id2 = await accepted(w2);
    w2.t.roadmap[0].reachedDay = TODAY;
    const reached = await S.markRoadmapDoneCore(USER, id2, null, NOW, depsFor(w2));
    check("once the aim is reached, done needs no reason", reached.ok && w2.t.roadmap[0].doneReason == null);
  }
  {
    // "Start again" on a dropped milestone.
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    const notDropped = await S.startAgainCore(USER, m1.id, NOW, depsFor(w));
    check("'Start again' is only for a dropped milestone", !notDropped.ok);
    w.templates.find((t) => t.kind === "GOAL")!.archivedAt = NOW;
    const again = await S.startAgainCore(USER, m1.id, NOW, depsFor(w));
    const copy = w.t.roadmapMilestone.find((m) => again.ok && m.id === again.value.milestoneId);
    check("…a new PLANNED row, same lineage and rankIndex, its own id", !!copy && copy.status === "PLANNED" && copy.lineageId === m1.lineageId && copy.rankIndex === m1.rankIndex && copy.id !== m1.id, json(copy));
    const twice = await S.startAgainCore(USER, m1.id, NOW, depsFor(w));
    check("…once", !twice.ok);
  }

  // ═══ F19: the Aim card ════════════════════════════════════════════════════
  console.log("— Aim card —");
  {
    const w = world();
    const empty = await S.loadAimCard(USER, NOW, depsFor(w));
    eq("no roadmap: the EMPTY state", empty?.state, "EMPTY");
    // Code's practice progression needs no decision (contracts §20); Gemini's pending Domain addition does.
    const id = await drafted(w, { milestones: [{ domains: ["d-prob"], needs: ["d-risk"] }, { domains: ["d-inf"] }] });
    const draft = await S.loadAimCard(USER, NOW, depsFor(w));
    check("a draft waiting: DRAFT with its items to decide", draft?.state === "DRAFT" && (draft.draftItems ?? 0) > 0 && draft.roadmapId === id, json(draft));
    const missing = await S.loadAimCard(USER, NOW, {
      ...depsFor(w),
      store: { ...w.store(), listRoadmaps: async () => Promise.reject(Object.assign(new Error('The table `public.RoadmapQuestWeek` does not exist'), { code: "P2021", meta: { table: "public.Roadmap" } })) },
    });
    eq("a missing roadmap table renders nothing (null)", missing, null);
    const w2 = world();
    await accepted(w2);
    const acc = await S.loadAimCard(USER, NOW, depsFor(w2));
    check("accepted, not started: ACCEPTED with the next milestone's stated pay and its stage's rank", acc?.state === "ACCEPTED" && acc.milestone?.start?.stated === 6 && acc.milestone.start.givesRank === "Expert" && acc.milestone.stage === "FLUENT", json(acc?.milestone));
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w2));
    check("the roadmap view of an accepted plan: ACTIVE, Now is milestone 1, two rows", view.state === "ACTIVE" && view.current?.milestone.ord === 1 && view.milestones.length === 2, json([view.state, view.milestones.map((m) => m.state)]));
    eq("…the rows read Planned then Outline", view.milestones.map((m) => m.state), ["PLANNED", "OUTLINE"]);
    check("…Proficiency is the stored reading (R1's view), measured today", view.proficiency != null && view.proficiency.measuredAt.length > 0, json(view.proficiency));
    const m1 = rowsOf(w2, w2.t.roadmap[0].id, 1)[0];
    await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w2));
    const started = await S.loadAimCard(USER, NOW, depsFor(w2));
    check("a started milestone: ACTIVE with its milestone line and a projection (R1's pipeline)", started?.state === "ACTIVE" && started.milestone?.status === "STARTED" && started.milestone.pace != null, json(started?.milestone));
    const view2 = await S.loadRoadmapView(USER, NOW, depsFor(w2));
    const cardRow = view2.current?.measures.find((x) => x.kind === "CARDS_AT_LEVEL");
    check("…the Now section's card measure carries its pace and its stored figure's time", cardRow?.pace != null && cardRow.measuredAt != null, json(cardRow));
    check("…and the Milestones list reads it Current", view2.milestones[0].state === "CURRENT", json(view2.milestones.map((m) => m.state)));
  }

  // ═══ Fix round (the three reviews' findings on lane R4) ══════════════════════
  console.log("— fix round: positions, rank and stale re-plans —");
  const THREE_INTAKE: Intake = { ...INTAKE, targetDay: addDays(TODAY, 225) };
  const THREE = {
    milestones: [
      { title: "One", domains: ["d-prob"], practices: [{ name: "Timed problems", method: "X" }], steps: [{ title: "Draft a formula sheet" }] },
      { title: "Two", domains: ["d-inf"], practices: [{ name: "Read notes", method: "X" }] },
      { title: "Three", domains: ["d-prob", "d-inf"], practices: [{ name: "Mock exams", method: "X" }] },
    ],
  };
  const acceptedWith = async (w: FakeWorld, reply: unknown, intake: Intake): Promise<string> => {
    const id = await drafted(w, reply, intake);
    const next = rowsOf(w, id, 1).find((m) => m.status === "DRAFT") as MilestoneRec;
    await decideAll(w, id, next.id);
    const res = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
    if (!res.ok) throw new Error(`fixture accept: ${res.error}`);
    return id;
  };
  const goalOf = (w: FakeWorld, milestoneId: string) => {
    const m = w.t.roadmapMilestone.find((x) => x.id === milestoneId) as MilestoneRec;
    return w.templates.find((t) => t.id === m.goalId) as FakeWorld["templates"][number];
  };
  /** Start m1, drop it (its goal archived), then "Start again": the copy's id. */
  const dropAndStartAgain = async (w: FakeWorld, m1: MilestoneRec): Promise<string> => {
    const st = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    if (!st.ok) throw new Error(`fixture start: ${st.error}`);
    goalOf(w, m1.id).archivedAt = NOW;
    const again = await S.startAgainCore(USER, m1.id, at(1_000), depsFor(w));
    if (!again.ok) throw new Error(`fixture start again: ${again.error}`);
    return again.value.milestoneId;
  };
  {
    // Drop and Start again on a 3-milestone plan: three positions, so Specialist at most, never Paragon.
    const w = world();
    const id = await acceptedWith(w, THREE, THREE_INTAKE);
    const [m1] = rowsOf(w, id, 1);
    eq("fixture: a 3-milestone plan", rowsOf(w, id, 1).length, 3);
    const copyId = await dropAndStartAgain(w, m1);
    check("…the copy is a fourth row of three positions", rowsOf(w, id, 1).length === 4 && rowsOf(w, id, 1).some((m) => m.id === copyId));
    const view = await S.loadRoadmapView(USER, at(2_000), depsFor(w));
    // Revision 4 (F-R4-12): a depth plan's top is its final stage's rank (Mastered: Virtuoso) without a standard; a restart adds no position.
    eq("the top rank of a 3-milestone depth plan with a restart is its final stage's (Virtuoso), never Paragon without a standard", [view.rank?.top.name, view.rank?.top.withAim], ["Virtuoso", false]);
    const card = await S.loadAimCard(USER, at(2_000), depsFor(w));
    eq("…and the Aim card's milestone line counts 3 positions ('of 3')", card?.milestone?.of, 3);
    w.t.roadmap[0].reachedDay = TODAY;
    const reached = await S.loadRoadmapView(USER, at(3_000), depsFor(w));
    check("…reaching the aim never gives Paragon on it", reached.rank != null && reached.rank.name !== "Paragon" && reached.rank.index < 6, json(reached.rank?.name));
    w.t.roadmap[0].reachedDay = null;
    // A re-plan after the restart: the copy keeps its lineage's place, the milestones after it their true places.
    const rp = await S.replanCore(USER, id, "REFIT", at(5_000), depsFor(w));
    check("fixture: a re-fit of the copy and the unstarted milestones", rp.ok && rowsOf(w, id, 2).length === 3, json(rp));
    await decideAll(w, id, rowsOf(w, id, 2).find((m) => m.status === "DRAFT")!.id);
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, at(6_000), depsFor(w));
    check("…accepted", acc.ok, json(acc));
    eq("a re-plan after a restart ranks each position by its stage (Retained 3, Fluent 4, Mastered 5)", rowsOf(w, id, 2).map((m) => m.rankIndex), [3, 4, 5]);
    // Fix round 2's carry-over: the re-planned "Start again" copy keeps its lineage's number, and the last number is the plan's positions.
    const v2 = rowsOf(w, id, 2);
    eq("…the copy is numbered with its lineage's place, the rest after the carried rows: ords 1, 2, 3 for 3 positions (never '4 of 3')", [v2.map((m) => m.ord), v2.find((m) => m.lineageId === m1.lineageId)?.ord], [[1, 2, 3], 1]);
    const v2view = await S.loadRoadmapView(USER, at(7_000), depsFor(w));
    check("…and the page's positions agree with the last ord", v2view.positions === 3 && Math.max(...v2.map((m) => m.ord)) === v2view.positions, json(v2view.positions));
  }
  {
    // Re-plan, then Start the still-PLANNED milestone, then Accept: refused (never two rows of one position).
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    await S.replanCore(USER, id, "REFIT", at(1_000), depsFor(w));
    const st = await S.startMilestoneCore(USER, m1.id, START_ALL, at(2_000), depsFor(w));
    check("fixture: milestone 1 starts after the re-plan was drafted", st.ok, json(st));
    await decideAll(w, id, rowsOf(w, id, 2).find((m) => m.status === "DRAFT")!.id);
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, at(3_000), depsFor(w));
    check("re-plan → Start → Accept is refused ('Milestone 1 started since this re-plan was drafted')", !acc.ok && /Milestone 1 started since this re-plan was drafted/.test(acc.ok ? "" : acc.error), json(acc));
    check("…the plan stays at version 1 with no second row of milestone 1", w.t.roadmap[0].version === 1 && !rowsOf(w, id, 2).some((m) => m.status === "PLANNED"));
  }
  {
    // A Start racing the accept, after the accept's read: NOTHING_STARTED_SINCE makes it stale, and the re-read refuses.
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    await S.replanCore(USER, id, "REFIT", at(1_000), depsFor(w));
    await decideAll(w, id, rowsOf(w, id, 2).find((m) => m.status === "DRAFT")!.id);
    const base = w.store();
    let raced = false;
    const store: RoadmapStore = {
      ...base,
      apply: async (userId, ops) => {
        if (!raced && ops.some((o) => o.op === "insert" && o.table === "roadmapAcceptance")) {
          raced = true;
          const row = w.t.roadmapMilestone.find((m) => m.id === m1.id) as MilestoneRec;
          row.status = "STARTING";
          row.startingAt = at(2_500);
        }
        return base.apply(userId, ops);
      },
    };
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, at(3_000), depsFor(w, { store }));
    check("a Start landing between the accept's read and its write: the guard refuses it, the re-read says why", raced && !acc.ok && /started since this re-plan/.test(acc.ok ? "" : acc.error), json(acc));
    eq("…nothing accepted", [w.t.roadmap[0].version, w.t.roadmapAcceptance.length], [1, 1]);
  }
  {
    // A "Start again" copy made after the re-plan was drafted: the draft is stale (accepting would supersede the copy).
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    goalOf(w, m1.id).archivedAt = NOW;
    await S.replanCore(USER, id, "REFIT", at(1_000), depsFor(w));
    const again = await S.startAgainCore(USER, m1.id, at(2_000), depsFor(w));
    check("fixture: a copy made after the re-plan", again.ok, json(again));
    await decideAll(w, id, rowsOf(w, id, 2).find((m) => m.status === "DRAFT")!.id);
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, at(3_000), depsFor(w));
    eq("…accepting that re-plan is refused", acc.ok ? "ok" : acc.error, S.REPLAN_STALE);
    check("…and the copy stays PLANNED", w.t.roadmapMilestone.find((m) => again.ok && m.id === again.value.milestoneId)?.status === "PLANNED");
  }

  console.log("— fix round: drop, Start again, unarchive —");
  {
    // The copy can't start while the original's goal is open again (unarchived): one live milestone per roadmap.
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    const copyId = await dropAndStartAgain(w, m1);
    goalOf(w, m1.id).archivedAt = null;
    const r = await S.startMilestoneCore(USER, copyId, START_ALL, at(2_000), depsFor(w));
    eq("drop → Start again → unarchive: the copy's Start is refused while the original is open", r.ok ? "ok" : r.error, S.STARTED_ELSEWHERE);
    // The original closes and pays: the copy then states 0, "this milestone already paid on 4 Oct".
    const goal = goalOf(w, m1.id);
    goal.closedScore = 0.9;
    w.goalPaid[goal.id] = "2026-10-04";
    const pv = await S.startPreview(USER, copyId, at(3_000), depsFor(w));
    check("…once the original paid, the copy's sheet states 0 (LINEAGE_PAID) with the paid day", pv?.pay.stated === 0 && pv.pay.zeroReason === "LINEAGE_PAID" && pv.pay.paidOn === "2026-10-04", json(pv?.pay));
    check("…and its basis carries the paid day, so the sheet's recompute says the same", pv?.payBasis?.lineagePaidOn === "2026-10-04");
    const view = await S.loadRoadmapView(USER, at(3_000), depsFor(w));
    check("…Now (the copy, not started) reads the same reason and day", view.current?.milestone.id === copyId && view.current.zeroReason === "LINEAGE_PAID" && view.current.paidOn === "2026-10-04", json([view.current?.zeroReason, view.current?.paidOn]));
    const card = await S.loadAimCard(USER, at(3_000), depsFor(w));
    check("…as does the Aim card's Start line", card?.milestone?.start?.zeroReason === "LINEAGE_PAID" && card.milestone.start.paidOn === "2026-10-04", json(card?.milestone?.start));
  }
  {
    // The other order: the copy started, then the original was unarchived. The original is superseded: never current, never live.
    const w = world();
    const id = await accepted(w);
    const [m1, m2] = rowsOf(w, id, 1);
    const copyId = await dropAndStartAgain(w, m1);
    const st = await S.startMilestoneCore(USER, copyId, START_ALL, at(2_000), depsFor(w));
    check("fixture: the copy starts", st.ok, json(st));
    goalOf(w, m1.id).archivedAt = null;
    const ms = w.t.roadmapMilestone.filter((m) => m.roadmapId === id);
    check("the unarchived original is superseded (isSupersededRow)", isSupersededRow(ms.find((m) => m.id === m1.id)!, ms));
    const view = await S.loadRoadmapView(USER, at(3_000), depsFor(w));
    eq("…Now is the copy", view.current?.milestone.id, copyId);
    eq("…the original's row reads Dropped", view.milestones.find((m) => m.id === m1.id)?.state, "DROPPED");
    const aftercare = await S.practiceAftercare(USER, id, depsFor(w));
    check("…its practice is offered in aftercare (its position started again)", aftercare.some((a) => a.templateId === itemsOf(w, m1.id).find((i) => i.kind === "PRACTICE")?.templateId), json(aftercare));
    goalOf(w, copyId).closedScore = 0.9;
    await decideAll(w, id, m2.id);
    const next = await S.startMilestoneCore(USER, m2.id, START_ALL, at(4_000), depsFor(w));
    check("…and once the copy closes, milestone 2 starts: the superseded original's open goal isn't live", next.ok, json(next));
  }
  {
    // A lineage reached once never starts again.
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    const copyId = await dropAndStartAgain(w, m1);
    w.t.roadmapMilestone.find((m) => m.id === m1.id)!.reachedDay = TODAY;
    const r = await S.startMilestoneCore(USER, copyId, START_ALL, at(2_000), depsFor(w));
    eq("a copy of a reached position is refused at Start", r.ok ? "ok" : r.error, S.LINEAGE_REACHED);
    void id;
  }

  console.log("— fix round: one due day —");
  {
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    const goal = goalOf(w, m1.id);
    const row = w.t.roadmapMilestone.find((m) => m.id === m1.id) as MilestoneRec;
    row.dueDay = addDays(TODAY, -2);
    goal.dueDay = addDays(TODAY, 40);
    const card = await S.loadAimCard(USER, NOW, depsFor(w));
    check("a rescheduled goal: the Aim card reads the goal's due day, not past due", card?.state === "ACTIVE" && card.milestone?.status === "STARTED" && card.milestone.dueDay === goal.dueDay, json(card?.milestone));
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("…the Milestones list and Now read it too", view.milestones[0].dueDay === goal.dueDay && view.milestones[0].state === "CURRENT" && view.current?.pastDue === false && view.current.milestone.dueDay === goal.dueDay, json([view.milestones[0], view.current?.pastDue]));
    goal.dueDay = addDays(TODAY, -1);
    row.dueDay = addDays(TODAY, 40);
    const late = await S.loadAimCard(USER, NOW, depsFor(w));
    check("…and the goal's passed due day is past due, whatever the milestone row says", late?.state === "PAST_DUE" && late.milestone?.status === "PAST_DUE", json(late?.milestone));
    void id;
  }

  console.log("— fix round: the Start sheet's pay line —");
  {
    // Two practices once a week at 30 minutes: 60 together (the floor), 30 alone.
    const twoPractices = { milestones: [{ title: "One", domains: ["d-prob"], practices: [{ name: "Timed problems", method: "X" }, { name: "Read notes", method: "X" }] }, { title: "Two", domains: ["d-inf"] }] };
    const setUp = async () => {
      const w = world();
      const id = await accepted(w, twoPractices);
      const [m1] = rowsOf(w, id, 1);
      for (const p of itemsOf(w, m1.id).filter((i) => i.kind === "PRACTICE")) await S.editItemCore(USER, p.id, { sessionsPerWeek: 1 }, NOW, depsFor(w));
      return { w, m1, practices: itemsOf(w, m1.id).filter((i) => i.kind === "PRACTICE") };
    };
    const { w, m1, practices } = await setUp();
    check(
      "fixture: a plan-only edit keeps the practices' decisions (Gemini's pick as the user kept it before accepting, CHECKED; the app's KEPT) and makes the plan YOURS",
      practices.length >= 2 && practices.every((p) => p.decision === (p.notes.includes("GEMINI_PICK") ? "CHECKED" : "KEPT") && p.planSource === "YOURS" && p.sessionsPerWeek === 1),
      json(practices.map((p) => [p.decision, p.planSource, p.sessionsPerWeek, p.notes]))
    );
    const pv = await S.startPreview(USER, m1.id, NOW, depsFor(w));
    check("the sheet carries its pay basis and each practice's minutes a week", !!pv?.payBasis && pv.practices.every((p) => p.weeklyMinutes === 30), json([pv?.payBasis, pv?.practices.map((p) => p.weeklyMinutes)]));
    eq("…both on: ⬡ 6", pv?.pay.stated, 6);
    check("…each practice priced with planCompletion against today's ledger", !!pv && pv.practices.every((p) => typeof p.price === "number" && Number.isFinite(p.price)), json(pv?.practices.map((p) => p.price)));
    const rows = (pv?.practices ?? []).map((p) => ({ lineageId: p.lineageId, weeklyMinutes: p.weeklyMinutes ?? 0 }));
    // All but one off (the progression places two or three practices here, 30 minutes a week each): under an hour a week.
    const offRest = practices.slice(1).map((p) => p.lineageId);
    const offOne = statedForMilestone(startStatedInputOf(pv!.payBasis!, rows, offRest));
    eq("…switching all but one off on the sheet recomputes to 'pays nothing · practice under an hour a week'", [offOne.stated, offOne.zeroReason], [0, "PRACTICE_UNDER_HOUR"]);
    const st = await S.startMilestoneCore(USER, m1.id, { ...START_ALL, practicesOff: offRest }, NOW, depsFor(w));
    check("…and Start with that switch freezes exactly what the sheet showed (0)", st.ok && goalOf(w, m1.id).stated === offOne.stated, json([st, goalOf(w, m1.id)?.stated]));
    const second = await setUp();
    const pv2 = await S.startPreview(USER, second.m1.id, NOW, depsFor(second.w));
    const bothOn = statedForMilestone(startStatedInputOf(pv2!.payBasis!, pv2!.practices.map((p) => ({ lineageId: p.lineageId, weeklyMinutes: p.weeklyMinutes ?? 0 }))));
    const st2 = await S.startMilestoneCore(USER, second.m1.id, START_ALL, NOW, depsFor(second.w));
    check("…both on, Start freezes the sheet's ⬡ 6", st2.ok && bothOn.stated === 6 && goalOf(second.w, second.m1.id).stated === 6, json([st2, bothOn]));
  }

  console.log("— fix round: Edit means the words changed; Type a target —");
  {
    const w = world();
    const id = await drafted(w);
    const [m1] = rowsOf(w, id, 1);
    const before = itemsOf(w, m1.id).map((i) => [i.id, i.decision]);
    const cardsBefore = json(measuresOf(w, m1.id).filter((x) => x.kind === "CARDS_AT_LEVEL"));
    // Fix round (lens 2): a depth plan's stage counts and levels come from coverage and the depth, never typed here.
    const typed = await S.editItemCore(USER, m1.id, { target: 30, minLevel: 8 }, NOW, depsFor(w));
    const card1 = measuresOf(w, m1.id).find((x) => x.kind === "CARDS_AT_LEVEL") as MeasureRec;
    eq("'Type a target' on a depth plan's stage is refused in words (counts come from coverage)", errOf(typed), S.DEPTH_COUNTS_FROM_COVERAGE);
    check("…its card measures stay as R2 set them (target, level, key and source)", json(measuresOf(w, m1.id).filter((x) => x.kind === "CARDS_AT_LEVEL")) === cardsBefore && card1.targetSource !== "YOURS", json(card1));
    const viaItem = await S.editItemCore(USER, itemsOf(w, m1.id).find((i) => i.kind === "PRACTICE")!.id, { target: 3 }, NOW, depsFor(w));
    eq("…and so is a typed target sent with an item's id", errOf(viaItem), S.DEPTH_COUNTS_FROM_COVERAGE);
    eq("…and changes no item's decision, nor the title's", [itemsOf(w, m1.id).map((i) => [i.id, i.decision]), w.t.roadmapMilestone.find((m) => m.id === m1.id)?.titleDecision], [before, "PENDING"]);
    // The progression's first checkpoint (contracts §20: none on the first stage).
    const cpRow = rowsOf(w, id, 1).find((m) => itemsOf(w, m.id).some((i) => i.kind === "CHECKPOINT")) as MilestoneRec;
    const cp = itemsOf(w, cpRow.id).find((i) => i.kind === "CHECKPOINT") as ItemRec;
    const cpDecision = cp.decision;
    const bar = await S.editItemCore(USER, cp.id, { outOf: 100, bar: 70 }, NOW, depsFor(w));
    const cpAfter = itemsOf(w, cpRow.id).find((i) => i.id === cp.id) as ItemRec;
    check("'Set the bar' alone keeps the checkpoint's code words and decision", bar.ok && cpAfter.decision === cpDecision && cpAfter.bar === 70 && cpAfter.origin === CODE_ORIGIN, json(cpAfter));
    const practice = itemsOf(w, m1.id).find((i) => i.kind === "PRACTICE") as ItemRec;
    const decisionBefore = practice.decision;
    const plan = await S.editItemCore(USER, practice.id, { sessionsPerWeek: 2, method: practice.method as never, durationBand: practice.durationBand as never }, NOW, depsFor(w));
    const pAfter = itemsOf(w, m1.id).find((i) => i.id === practice.id) as ItemRec;
    check("a practice's plan edit keeps its decision and makes the plan YOURS", plan.ok && pAfter.decision === decisionBefore && pAfter.planSource === "YOURS" && pAfter.sessionsPerWeek === 2, json(pAfter));
    const same = await S.editItemCore(USER, cp.id, { label: cpAfter.label }, NOW, depsFor(w));
    check("an Edit sent with the words unchanged changes nothing", same.ok && itemsOf(w, cpRow.id).find((i) => i.id === cp.id)?.decision === cpDecision);
    const words = await S.editItemCore(USER, cp.id, { label: "My own mock test" }, NOW, depsFor(w));
    const cpWords = itemsOf(w, cpRow.id).find((i) => i.id === cp.id) as ItemRec;
    check("…new words make it EDITED (YOURS) and clear its flags", words.ok && cpWords.decision === "EDITED" && cpWords.flags.length === 0 && cpWords.label === "My own mock test", json(cpWords));
    const ok2 = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
    check("…and then the plan is accepted", ok2.ok, json(ok2));
    const stageKey = (measuresOf(w, m1.id).find((x) => x.kind === "CARDS_AT_LEVEL") as MeasureRec).measureKey;
    check("…a stage measure keeps its key and segment at acceptance (r below the depth)", stageKey === cardsAtLevelKey([(card1.scope as { domainIds: string[] }).domainIds[0]], card1.minLevel as number, "r"), json(stageKey));
  }
  {
    // A depth plan's Domains are one set (F-R4-10): [Map to…], [Create] and [Drop] on one milestone's Domain are refused.
    const w = world();
    const id = await drafted(w);
    const [m1] = rowsOf(w, id, 1);
    const dom = itemsOf(w, m1.id).find((i) => i.kind === "DOMAIN") as ItemRec;
    const mapped = await S.resolveDomainCore(USER, dom.id, { kind: "MAP", domainId: "d-risk" }, NOW, depsFor(w));
    const dropped = await S.resolveDomainCore(USER, dom.id, { kind: "DROP" }, NOW, depsFor(w));
    const checked = await S.resolveDomainCore(USER, dom.id, { kind: "CHECK" }, NOW, depsFor(w));
    check("a depth plan's Domain item can't be mapped, dropped or checked on one milestone", !mapped.ok && !dropped.ok && !checked.ok && itemsOf(w, m1.id).find((i) => i.id === dom.id)?.domainId === dom.domainId, json([mapped, dropped, checked]));
  }

  console.log("— fix round: runs (who wrote the rows, failed samples, the cap) —");
  {
    const w = world();
    const id = await newDraft(w);
    const c = await S.claimDraftCore(USER, id, { force: false }, NOW, depsFor(w));
    await S.runDraftCore(c.ok ? c.value.runId : "", depsFor(w, { callModel: async () => { throw new Error("no key"); }, clock: () => NOW }));
    const run = w.t.roadmapRun[0];
    eq("a FAILED draft that wrote the starter marks it (report.fallback STARTER)", (run.report as { fallback?: string } | null)?.fallback, RUN_FALLBACK_STARTER);
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("…so the page reads the rows as the starter's, not Gemini's", view.run?.status === "FAILED" && view.run.wrote === "STARTER" && view.run.capped === false, json(view.run));
  }
  {
    const w = world();
    const id = await drafted(w);
    w.t.roadmapRun.push(...[0, 1, 2, 3].map((i) => ({ ...w.t.roadmapRun[0], id: `other-failed-${i}`, roadmapId: "other", status: "FAILED", startedAt: at(-3_600_000), report: null })));
    const capped = await S.claimDraftCore(USER, id, { force: true }, at(60_000), depsFor(w));
    eq("fixture: 'Draft again' at the cap", capped.ok ? "ok" : capped.error, S.DRAFT_CAPPED);
    const view = await S.loadRoadmapView(USER, at(61_000), depsFor(w));
    check("a CAPPED 'Draft again' over a Gemini draft: capped, and the rows still read Gemini's", view.run?.status === "CAPPED" && view.run.capped === true && view.run.wrote === "GEMINI", json(view.run));
    check("…'What was dropped' stays the Gemini draft's report", view.run?.report != null && Array.isArray(view.run.report.dropped));
    const w2 = world();
    const id2 = await drafted(w2);
    const again = await S.claimDraftCore(USER, id2, { force: true }, at(1_000), depsFor(w2));
    w2.t.roadmapRun.find((r) => again.ok && r.id === again.value.runId)!.status = "FAILED";
    const v2 = await S.loadRoadmapView(USER, at(2_000), depsFor(w2));
    check("a failed redraft that wrote nothing never relabels the Gemini rows", v2.run?.status === "FAILED" && v2.run.wrote === "GEMINI", json(v2.run));
  }
  {
    // A failed sample's facts are kept (finishReason, responseId, usage, latency, capped raw text); reuse never reads them.
    const w = world();
    const id = await newDraft(w);
    const c = await S.claimDraftCore(USER, id, { force: false }, NOW, depsFor(w));
    await S.runDraftCore(c.ok ? c.value.runId : "", depsFor(w, { callModel: async () => ({ finishReason: "SAFETY" }), clock: () => NOW }));
    const run = w.t.roadmapRun.find((r) => c.ok && r.id === c.value.runId) as RunRec;
    const sample = (run.samples as { ok?: boolean; raw: string; finishReason: string | null }[])[0];
    check("a SAFETY reply: FAILED with its finishReason, responseId, usage and latency stored", run.status === "FAILED" && json(run.finishReasons) === json(["SAFETY"]) && json(run.responseIds) === json(["r-safety"]) && run.latencyMs === 900 && json(run.usage) === json([{ totalTokenCount: 7 }]), json(run));
    check("…and its raw text, marked ok: false", sample?.ok === false && sample.raw === '{"milestones": [' && sample.finishReason === "SAFETY", json(sample));
    eq("…which the reuse path skips (R3's reusableSamplesOf, the one definition)", reusableSamplesOf(run.samples).length, 0);
  }
  {
    const run = (status: string, i: number): RunRec => ({ ...({} as RunRec), id: `${status}${i}`, roadmapId: "r", userId: USER, day: TODAY, version: 1, kind: "GEMINI", status, model: null, modelVersion: null, promptVersion: null, seedBase: null, inputHash: null, pack: null, samples: null, report: null, usage: null, responseIds: [], finishReasons: [], latencyMs: null, error: null, startedAt: at(-i * 1000), finishedAt: null });
    const runs = [run("FAILED", 1), run("FAILED", 2), run("FAILED", 3), run("FAILED", 4), run("CAPPED", 5)];
    eq("the cap counts a CAPPED run (countsTowardDraftCap: any GEMINI status but REUSED)", S.claimPlanOf("r", [], runs, NOW).kind, "CAPPED");
    eq("…and the cap's copy is roadmap-model's DRAFT_CAP_LINE", S.DRAFT_CAPPED, "5 drafts today — build from your numbers or write it yourself.");
  }
  {
    // The starter measures the first 4 chosen Domains; the rest are said in the run's report, never dropped silently.
    const w = world();
    w.tree[0].domains.push(
      { id: "d-a", name: "Algebra", fieldId: "f-stats", cards: [card("d-a", 6)] },
      { id: "d-b", name: "Bayes", fieldId: "f-stats", cards: [card("d-b", 6)] },
      { id: "d-c", name: "Calculus", fieldId: "f-stats", cards: [card("d-c", 6)] }
    );
    const id = await newDraft(w, { ...INTAKE, domainIds: ["d-prob", "d-inf", "d-a", "d-b", "d-c"] });
    const built = await S.buildStarterCore(USER, id, NOW, depsFor(w));
    const report = w.t.roadmapRun[0].report as { dropped: { code: string; reason: string }[] } | null;
    check("a depth plan's starter measures every Domain of R: 5 chosen, 5 measured at each stage, nothing dropped", built.ok && report == null && rowsOf(w, id, 1).every((m) => measuresOf(w, m.id).filter((x) => x.kind === "CARDS_AT_LEVEL").length === 5), json([built, report]));
    const six = await S.saveIntakeCore(USER, { ...INTAKE, domainIds: ["d-prob", "d-inf", "d-a", "d-b", "d-c", "d-risk"], newDomainNames: ["Statistics II"] }, NOW, depsFor(w));
    eq("…and a 7th Domain is refused at intake (DEPTH_DOMAINS_MAX)", six.ok ? "ok" : six.error, S.TOO_MANY_DOMAINS);
  }

  console.log("— fix round: aftercare, the Aim card, the view's fields —");
  {
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    goalOf(w, m1.id).closedScore = 0.9;
    const list = await S.practiceAftercare(USER, id, depsFor(w));
    const m1Practices = itemsOf(w, m1.id).filter((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED").length;
    check("a closed milestone's practices are offered in aftercare (each of the progression's, contracts §20)", m1Practices >= 2 && list.length === m1Practices, json([m1Practices, list]));
    const off = await S.keepOnTodayCore(USER, m1.id, list[0]?.templateId ?? "", NOW, { ...depsFor(w), env: WRITES_OFF });
    eq("[Keep on Today] refuses with writes off", off.ok ? "ok" : off.error, ROADMAP_WRITES_OFF);
    const kept = await S.keepOnTodayCore(USER, m1.id, list[0]?.templateId ?? "", NOW, depsFor(w));
    const list2 = await S.practiceAftercare(USER, id, depsFor(w));
    check("[Keep on Today] is remembered: that row stops asking, the others still ask", kept.ok && list2.length === list.length - 1 && !list2.some((r) => r.templateId === list[0]?.templateId), json([kept, list2]));
    check("…stored as StartSnapshot.aftercareKept", json((w.t.roadmapMilestone.find((m) => m.id === m1.id)?.feasibility as { aftercareKept?: string[] }).aftercareKept) === json([list[0]?.templateId]));
    const again = await S.keepOnTodayCore(USER, m1.id, list[0]?.templateId ?? "", NOW, depsFor(w));
    check("…a second tap changes nothing", again.ok && json((w.t.roadmapMilestone.find((m) => m.id === m1.id)?.feasibility as { aftercareKept?: string[] }).aftercareKept) === json([list[0]?.templateId]));
  }
  {
    // Between milestones (milestone 1 reached and closed, milestone 2 still PLANNED): ACTIVE, not ACCEPTED.
    const w = world();
    const id = await accepted(w);
    const [m1, m2] = rowsOf(w, id, 1);
    await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    w.t.roadmapMilestone.find((m) => m.id === m1.id)!.reachedDay = TODAY;
    goalOf(w, m1.id).closedScore = 1;
    await decideAll(w, id, m2.id);
    const card = await S.loadAimCard(USER, NOW, depsFor(w));
    check("between milestones the Aim card is ACTIVE with the next milestone's Start line", card?.state === "ACTIVE" && card.milestone?.status === "PLANNED" && card.milestone.ord === 2 && card.milestone.start != null, json([card?.state, card?.milestone]));
    check("…keeping the rank-up's 'new' marker (the stage's rank: Expert)", card?.rank?.name === "Expert" && card.rank.newSince === TODAY, json(card?.rank));
    check("…and the milestone line carries its title's class (code's: WORKED_OUT) and its stage", card?.milestone?.titleClass === "WORKED_OUT" && card.milestone.stage === "MASTERED", json([card?.milestone?.titleClass, card?.milestone?.stage]));
    const before = await (async () => {
      const w2 = world();
      await accepted(w2);
      return S.loadAimCard(USER, NOW, depsFor(w2));
    })();
    eq("…while a plan nothing ever started from is ACCEPTED", before?.state, "ACCEPTED");
  }
  {
    // The draft count is the next milestone's rows only (outline rows are decided at Start).
    const w = world();
    await drafted(w);
    const card = await S.loadAimCard(USER, NOW, depsFor(w));
    // The practice progression's first stage holds no checkpoint (contracts §20.10, point 2), and code's words need no tap.
    eq("'A draft is waiting for your check': nothing on milestone 1 (code's words need no tap, its first stage holds no bar to set; not milestone 2's)", card?.draftItems, 0);
    const w2 = world();
    const id2 = await accepted(w2);
    await S.replanCore(USER, id2, "MANUAL", at(1_000), depsFor(w2));
    const card2 = await S.loadAimCard(USER, at(2_000), depsFor(w2));
    check("an ACTIVE roadmap's pending re-plan shows on the Aim card ('Draft waiting')", card2?.draftItems != null, json(card2?.draftItems));
    const view2 = await S.loadRoadmapView(USER, at(2_000), depsFor(w2));
    check("…and the page returns it as the draft of an ACTIVE roadmap (version + 1)", view2.state === "ACTIVE" && view2.draft?.version === 2, json([view2.state, view2.draft?.version]));
  }
  {
    // The view's fix-round fields: the library, labels and classes, step and practice facts.
    const w = world();
    w.tree[0].domains[0].level = 5;
    w.tree[0].domains[0].cards[0].title = "Bayes' rule";
    w.tree[0].domains[0].cards[12].title = "Base rates";
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    const prob = view.library?.find((d) => d.id === "d-prob");
    check("the view carries the library: every Field's Domains with their facts and up to 3 titles", view.library?.length === 3 && prob?.cards === 20 && prob.atSix === 12 && prob.level === 5 && prob.fieldName === "Statistics" && json(prob.sample) === json(["Bayes' rule", "Base rates"]), json(prob));
    const inf = view.toward?.measures.find((x) => x.measureKey.includes("d-inf"));
    const probEnd = view.toward?.measures.find((x) => x.measureKey.includes("d-prob"));
    check("'Toward the aim' rows carry their words (EndStateTerm.label): the depth terms", probEnd?.label === "Probability · cards at level 12+", json(probEnd?.label));
    check("…and the weakest class of the Domains in scope (the user's Domains: no Gemini row anywhere)", inf?.basisClass === "WORKED_OUT" && probEnd?.basisClass === "WORKED_OUT", json([inf?.basisClass, probEnd?.basisClass]));
    check("the Milestones list carries each title's class (code's) and stage", view.milestones.every((m) => m.titleClass === "WORKED_OUT" && m.stage != null), json(view.milestones.map((m) => [m.titleClass, m.stage])));
    await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    const step = itemsOf(w, m1.id).find((i) => i.kind === "STEP") as ItemRec;
    const practice = itemsOf(w, m1.id).find((i) => i.kind === "PRACTICE") as ItemRec;
    w.templates.find((t) => t.id === step.templateId)!.completedAt = NOW;
    const started = await S.loadRoadmapView(USER, NOW, depsFor(w));
    eq("Now carries the day each step was ticked", started.current?.stepDone?.[step.lineageId], TODAY);
    check("…and each practice's sessions kept so far (from the stored PRACTICE_KEPT detail)", started.current?.practiceKept?.[practice.lineageId]?.kept === 0 && typeof started.current.practiceKept[practice.lineageId].of === "number", json(started.current?.practiceKept));
  }
  {
    // A Body Area's weight context line.
    const w = world();
    const id = await newDraft(w, { ...INTAKE, aim: "Run a sub-50 10K", fieldId: null, track: "BODY", domainIds: [] });
    await S.buildStarterCore(USER, id, NOW, depsFor(w));
    await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
    w.weight = {
      unit: "kg",
      latest: null,
      trendKg: 82.4,
      change7Kg: null,
      stale: false,
      rate: { kind: "calibrating", readings: 2, need: 5 },
      goal: { unit: "kg", targetKg: 78, targetDay: "2027-03-14", startKg: 85, startDay: "2026-08-01" },
      progress: null,
      projection: { kind: "none", why: "calibrating" },
      series: [],
      loggedToday: false,
      fastLossNote: null,
    };
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    eq("a Body Area shows the weight context line", view.toward?.weightLine, "trend 82.4 kg · your weight goal 78.0 kg by 14 Mar · you logged");
    w.weight = { ...w.weight, stale: true, latest: { day: "2026-09-01", kg: 83.1, source: "manual" } };
    eq("…a stale trend leads with the last weigh-in and its day", (await S.loadRoadmapView(USER, NOW, depsFor(w))).toward?.weightLine, "last weigh-in 83.1 kg on 1 Sep · your weight goal 78.0 kg by 14 Mar · you logged");
    const w2 = world();
    await accepted(w2);
    w2.weight = { ...w.weight, stale: false };
    eq("…a Field Area never does", (await S.loadRoadmapView(USER, NOW, depsFor(w2))).toward?.weightLine, null);
  }
  {
    // The Aim card never schedules the fallback freeze on a writes-off server.
    const w = world();
    await accepted(w);
    const load = (writesOffView: boolean) =>
      ({ set: { weekStart: TODAY, milestoneId: "m", state: "OPEN", generator: 1, quests: [], basis: [], cappedBy: null }, frozen: false, progress: [], view: { writesOff: writesOffView, total: 0, done: 0 }, viewInput: {} }) as never;
    const offCard = await S.loadAimCard(USER, NOW, { ...depsFor(w, { lanes: { ...lanesFor(w), loadWeekQuests: async () => load(true) } }), env: WRITES_OFF });
    const onCard = await S.loadAimCard(USER, NOW, depsFor(w, { lanes: { ...lanesFor(w), loadWeekQuests: async () => load(false) } }));
    check("an unfrozen week on a writes-off server is not 'unfrozen' for the page's after()", offCard?.questWeekUnfrozen === false && onCard?.questWeekUnfrozen === true, json([offCard?.questWeekUnfrozen, onCard?.questWeekUnfrozen]));
  }

  console.log("— fix round: paces, remedies, the views never reach the model —");
  {
    // A scope's pace is the median of its weekly sums (R2 scopePaceOf), never a sum of per-Domain medians.
    const finalDay = addDays(TODAY, -THROUGHPUT_LAG_DAYS);
    const start = throughputWindowStart(finalDay);
    const a = [5, 5, 5, 5, 5, 0, 0, 0];
    const b = [0, 0, 0, 1, 1, 1, 1, 1];
    const newCards: ThroughputRows["newCards"][number][] = [];
    for (let k = 0; k < 8; k++) {
      const day = addDays(start, 7 * k);
      for (let i = 0; i < a[k]; i++) newCards.push({ day, fieldId: "f-stats", domainId: "d-a" });
      for (let i = 0; i < b[k]; i++) newCards.push({ day, fieldId: "f-stats", domainId: "d-b" });
    }
    const rows: ThroughputRows = { ...emptyRows(finalDay), newCards };
    const r = S.rateOf({ paceRows: rows, throughput: null }, ["d-a", "d-b"], "f-stats", null);
    eq("the scope's pace: the median of its weekly sums (5), not 5 + 1", [r.rateSource, r.rate], ["SCOPE", 5]);
    const typed0 = S.rateOf({ paceRows: emptyRows(finalDay), throughput: null }, ["d-x"], null, 0);
    eq("a typed rate of 0 reads YOURS 0 (not NONE)", [typed0.rateSource, typed0.rate], ["YOURS", 0]);
    const w = world();
    w.paceRows = rows;
    w.tree[0].domains.push({ id: "d-a", name: "Algebra", fieldId: "f-stats", cards: [card("d-a", 6)] }, { id: "d-b", name: "Bayes", fieldId: "f-stats", cards: [card("d-b", 6)] });
    const seen: string[] = [];
    const id = await newDraft(w, { ...INTAKE, domainIds: ["d-a", "d-b"] });
    await S.buildStarterCore(USER, id, NOW, depsFor(w, { lanes: { ...lanesFor(w), feasibilityOf: (plan, input) => { seen.push(...input.scopes.map((s) => `${s.key}:${s.rateSource}:${s.rate}`)); return lanesFor(w).feasibilityOf!(plan, input); } } }));
    check("…and that is what the engines read for the plan's scope", seen.includes("d-a,d-b:SCOPE:5"), json(seen));
  }
  {
    // Moving the date is checked against today (R2's remedyTargetDay caps at today + 1080), not the draft's start day.
    const w = world();
    const id = await newDraft(w, { ...INTAKE, aim: "Run a sub-50 10K", fieldId: null, track: "BODY", domainIds: [] });
    await S.buildStarterCore(USER, id, NOW, depsFor(w));
    w.t.roadmap[0].startDay = addDays(TODAY, -400);
    const far = addDays(TODAY, 1000);
    const lanes = { ...lanesFor(w), applyRemedy: ((plan, _input, remedy) => (remedy === "MOVE_DATE" ? plan.map((m, i) => (i === plan.length - 1 ? { ...m, dueDay: far } : m)) : [...plan])) as RoadmapLanes["applyRemedy"] };
    const moved = await S.applyRemedyCore(USER, id, "MOVE_DATE", NOW, depsFor(w, { lanes }));
    check("an old draft's date moves to today + 1000 (start day 400 days back)", moved.ok && w.t.roadmap[0].targetDay === far, json(moved));
    const none = await S.applyRemedyCore(USER, id, "MOVE_DATE", NOW, depsFor(w, { lanes: { ...lanesFor(w), applyRemedy: (plan) => [...plan] } }));
    check("…and a move no date can make is said, not silently a no-op", !none.ok && /No date within 3 years/.test(none.ok ? "" : none.error), json(none));
  }
  {
    // [Add as topic] for a syllabus line no topic covers: the user's own line (origin SYLLABUS, YOURS), once.
    const w = world();
    const id = await drafted(w, REPLY, { ...INTAKE, syllabus: { lines: ["Conditional probability", "Bayes' theorem"], source: null } });
    const [m1] = rowsOf(w, id, 1);
    const before = await S.loadRoadmapView(USER, NOW, depsFor(w));
    eq("fixture: two syllabus lines not in the plan yet", before.draft?.uncoveredSyllabus, [0, 1]);
    const added = await S.addItemCore(USER, m1.id, { kind: "TOPIC", syllabusRef: 1 }, NOW, depsFor(w));
    const topic = itemsOf(w, m1.id).find((i) => added.ok && i.id === added.value.itemId);
    check("[Add as topic] adds the line as a topic in the user's words (SYLLABUS)", added.ok && topic?.label === "Bayes' theorem" && topic.origin === "SYLLABUS" && topic.syllabusRef === 1, json([added, topic]));
    const after = await S.loadRoadmapView(USER, NOW, depsFor(w));
    eq("…so it leaves 'Not in this plan yet'", after.draft?.uncoveredSyllabus, [0]);
    const twice = await S.addItemCore(USER, m1.id, { kind: "TOPIC", syllabusRef: 1 }, NOW, depsFor(w));
    check("…once per line", !twice.ok && /already a topic/.test(twice.ok ? "" : twice.error), json(twice));
    const ghost = await S.addItemCore(USER, m1.id, { kind: "TOPIC", syllabusRef: 9 }, NOW, depsFor(w));
    check("…and only a line that exists", !ghost.ok, json(ghost));
  }
  {
    // "Aim not checked · Add a figure" on an ACTIVE roadmap: stored, and the aim check worked out again from the plan.
    const w = world();
    const id = await accepted(w);
    const lanes = {
      ...lanesFor(w),
      feasibilityOf: ((plan, input) => ({
        ...feasibilityFixture(plan, input.today),
        aimCheck: input.typicalHours ? { kind: "checked", coverHours: 60, typicalHours: input.typicalHours, source: input.typicalHoursSource, coversAll: false } : { kind: "unchecked" },
      })) as RoadmapLanes["feasibilityOf"],
    };
    const before = await S.loadRoadmapView(USER, NOW, depsFor(w, { lanes }));
    eq("fixture: an accepted aim with no figure is unchecked", before.header?.aimCheck.kind, "unchecked");
    const bad = await S.setAimFigureCore(USER, id, { typicalHours: 0, typicalHoursSource: null }, NOW, depsFor(w));
    check("a figure of 0 hours is refused", !bad.ok);
    const set = await S.setAimFigureCore(USER, id, { typicalHours: 150, typicalHoursSource: "  SOA study note " }, NOW, depsFor(w));
    check("'Add a figure' stores the hours and the source (cleaned)", set.ok && w.t.roadmap[0].typicalHours === 150 && w.t.roadmap[0].typicalHoursSource === "SOA study note", json(set));
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w, { lanes }));
    check("…and the ACTIVE header's aim check reads it (worked out from the plan)", view.header?.aimCheck.kind === "checked" && view.header.aimCheck.typicalHours === 150 && view.header.aimCheck.source === "SOA study note", json(view.header?.aimCheck));
    const card = await S.loadAimCard(USER, NOW, depsFor(w, { lanes }));
    eq("…the Aim card drops its quiet 'Aim not checked' chip", card?.aimChecked, true);
  }
  {
    // The view loaders never call the model (roadmap-server imports roadmap-model; only runDraftCore calls it).
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    const throwing = depsFor(w, { callModel: async () => { throw new Error("a view called the model"); } });
    const before = w.modelCalls;
    await S.loadRoadmapView(USER, NOW, throwing);
    await S.loadAimCard(USER, NOW, throwing);
    await S.loadIntakeView(USER, NOW, throwing);
    await S.startPreview(USER, m1.id, NOW, throwing);
    await S.practiceAftercare(USER, id, throwing);
    eq("loadRoadmapView, loadAimCard, loadIntakeView, startPreview and practiceAftercare make no model call", w.modelCalls - before, 0);
  }

  // ═══ Fix round 2 (the re-review's open items on lane R4) ═════════════════════
  console.log("— fix round 2: what the planning engine reads —");
  const isCarriedDraft = (d: MilestoneDraft) => d.status === "STARTING" || d.status === "STARTED";
  /** Fixture lanes that record each engine call's carried rows (id, due day) and the plan's rows of one lineage. */
  const spyLanes = (w: FakeWorld, seen: { where: string; carried: [string | null, DayKey | null][]; lineage: number }[], lineageId = "") => {
    const fx = lanesFor(w);
    const note = (where: string, plan: readonly MilestoneDraft[]) =>
      seen.push({ where, carried: plan.filter(isCarriedDraft).map((d): [string | null, DayKey | null] => [d.id, d.dueDay]), lineage: plan.filter((d) => d.lineageId === lineageId).length });
    const lanes: Partial<RoadmapLanes> = {
      ...fx,
      fitPlan: (plan, input, opts) => {
        note("fitPlan", plan);
        return fx.fitPlan!(plan, input, opts);
      },
      feasibilityOf: (plan, input) => {
        note("feasibilityOf", plan);
        return fx.feasibilityOf!(plan, input);
      },
      refit: (plan, input) => {
        note("refit", plan);
        return fx.refit!(plan, input);
      },
      applyRemedy: (plan, input, remedy) => {
        note("applyRemedy", plan);
        return fx.applyRemedy!(plan, input, remedy);
      },
      refitForStart: (m, plan, input) => {
        note("refitForStart", plan);
        return fx.refitForStart!(m, plan, input);
      },
    };
    return lanes;
  };
  {
    // A Reschedule moves only the goal's due day: every engine call reads the carried milestone at that day (R2's handoff 3).
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    const goal = goalOf(w, m1.id);
    const own = (w.t.roadmapMilestone.find((m) => m.id === m1.id) as MilestoneRec).dueDay;
    goal.dueDay = addDays(TODAY, 100);
    check("fixture: the goal was rescheduled past the milestone row's own due day", own != null && own < goal.dueDay, json([own, goal.dueDay]));
    const seen: { where: string; carried: [string | null, DayKey | null][]; lineage: number }[] = [];
    const spy = depsFor(w, { lanes: spyLanes(w, seen) });
    const rp = await S.replanCore(USER, id, "REFIT", at(1_000), spy);
    check("fixture: a re-fit while milestone 1 is open", rp.ok, json(rp));
    const view = await S.loadRoadmapView(USER, at(2_000), spy);
    const next2 = rowsOf(w, id, 2).find((m) => m.status === "DRAFT") as MilestoneRec;
    const practice = itemsOf(w, next2.id).find((i) => i.kind === "PRACTICE") as ItemRec;
    const edit = await S.editItemCore(USER, practice.id, { sessionsPerWeek: 2 }, at(3_000), spy);
    check("fixture: a plan edit on the re-plan draft re-fits it", edit.ok, json(edit));
    const remedy = await S.applyRemedyCore(USER, id, "USE_REALISTIC_DATE", at(4_000), spy);
    check("fixture: a remedy on the re-plan draft (the realistic date)", remedy.ok, json(remedy));
    // The realistic date re-dated the draft (its rows written again): read its next row afresh.
    const next2b = rowsOf(w, id, 2).find((m) => m.status === "DRAFT") as MilestoneRec;
    await decideAll(w, id, next2b.id);
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, at(5_000), spy);
    check("fixture: the re-plan is accepted", acc.ok, json(acc));
    await S.startPreview(USER, next2b.id, at(6_000), spy);
    const wheres = new Set(seen.map((s) => s.where));
    check("refit, feasibilityOf, fitPlan and refitForStart were all read", ["refit", "feasibilityOf", "fitPlan", "refitForStart"].every((x) => wheres.has(x)), json([...wheres]));
    check(
      "…each with the carried milestone at the goal's due day, never the row's own (replanCore, the draft view, rewrite, applyRemedyCore, acceptCore, the Start sheet)",
      seen.length > 0 && seen.every((s) => json(s.carried) === json([[m1.id, goal.dueDay]])),
      json(seen.filter((s) => json(s.carried) !== json([[m1.id, goal.dueDay]])))
    );
    check("…and the page shows the re-plan beside it", view.state === "ACTIVE" && view.draft?.version === 2);
    const written = w.t.roadmapMilestone.find((m) => m.id === m1.id) as MilestoneRec;
    eq("…the carried row itself is never rewritten (its own due day stays as stored)", written.dueDay, own);
  }
  {
    // Drop → Start again: the dropped original leaves the engine's input once its copy is planned (R2's handoff 1).
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    const copyId = await dropAndStartAgain(w, m1);
    const seen: { where: string; carried: [string | null, DayKey | null][]; lineage: number }[] = [];
    const spy = depsFor(w, { lanes: spyLanes(w, seen, m1.lineageId) });
    await S.startPreview(USER, copyId, at(2_000), spy);
    const rp = await S.replanCore(USER, id, "REFIT", at(3_000), spy);
    check("fixture: a re-fit after the restart", rp.ok, json(rp));
    await S.loadRoadmapView(USER, at(4_000), spy);
    await decideAll(w, id, rowsOf(w, id, 2).find((m) => m.status === "DRAFT")!.id);
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, at(5_000), spy);
    check("fixture: the re-plan of the copy is accepted", acc.ok, json(acc));
    check(
      "a dropped original whose copy is planned or re-planned is never in the engine's input: no carried row, its position read once (the copy)",
      seen.length >= 4 && seen.every((s) => s.carried.length === 0 && s.lineage === 1),
      json(seen)
    );
  }
  {
    // A dropped row with no copy is still a position: the engine reads it (at its goal's due day).
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    goalOf(w, m1.id).archivedAt = NOW;
    const seen: { where: string; carried: [string | null, DayKey | null][]; lineage: number }[] = [];
    await S.replanCore(USER, id, "REFIT", at(1_000), depsFor(w, { lanes: spyLanes(w, seen) }));
    check("a dropped milestone with no copy stays in the engine's input", seen.length > 0 && seen.every((s) => s.carried.length === 1 && s.carried[0][0] === m1.id), json(seen));
  }
  {
    // The copy started, then the original was unarchived: the superseded original is left out; the copy is carried.
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    const copyId = await dropAndStartAgain(w, m1);
    await S.startMilestoneCore(USER, copyId, START_ALL, at(2_000), depsFor(w));
    goalOf(w, m1.id).archivedAt = null;
    const seen: { where: string; carried: [string | null, DayKey | null][]; lineage: number }[] = [];
    await S.replanCore(USER, id, "REFIT", at(3_000), depsFor(w, { lanes: spyLanes(w, seen, m1.lineageId) }));
    check("a superseded original never reaches the engine; its started copy does", seen.length > 0 && seen.every((s) => s.carried.length === 1 && s.carried[0][0] === copyId && s.lineage === 1), json(seen));
  }

  console.log("— fix round 2: the alarm, what a draft still needs, bulk keep —");
  {
    // draftNeedsOf: the footer's target in the page's order, the Aim card's count, never a syllabus line or a named placeholder.
    const w = world();
    const id = await drafted(w, REPLY, { ...INTAKE, syllabus: { lines: ["Conditional probability"], source: null } });
    const [m1] = rowsOf(w, id, 1);
    // Gemini's practice picks are decided first (contracts §20.5: while one waits, "Next item to decide" is that pick).
    const kept = await S.confirmSessionPicksCore(USER, id, "KEEP", NOW, depsFor(w));
    check("fixture: Gemini's practice picks kept first", kept.ok || errOf(kept) === "There are no practice picks to decide.", json(kept));
    const topic = await S.addItemCore(USER, m1.id, { kind: "TOPIC", syllabusRef: 0 }, NOW, depsFor(w));
    check("fixture: the syllabus line is a topic, PENDING as validation writes it (origin SYLLABUS)", topic.ok && itemsOf(w, m1.id).some((i) => i.origin === "SYLLABUS" && i.decision === "PENDING"), json(topic));
    const recs = itemsOf(w, m1.id);
    const dom = recs.find((i) => i.kind === "DOMAIN") as ItemRec;
    const prac = recs.find((i) => i.kind === "PRACTICE") as ItemRec;
    // A checkpoint ordered first on milestone 1 (the progression places none there: an older draft's, or one the user added).
    w.t.roadmapItem.push({ ...prac, id: "cp-early", lineageId: "lin-cp-early", kind: "CHECKPOINT", ord: -1, label: "Self-test: Probability", catalogKey: "SELF_TEST", checkpointKind: "SELF_TEST", method: null, sessionsPerWeek: null, durationBand: null, rule: null, planSource: null, origin: CODE_ORIGIN, decision: "KEPT", bar: null, outOf: null, notes: [], flags: [] });
    w.t.roadmapItem.push(
      { ...prac, id: "ph-named", lineageId: "lin-ph-named", ord: 60, label: "My own drills", origin: CODE_ORIGIN, decision: "EDITED", notes: ["PLACEHOLDER"], flags: [] },
      { ...prac, id: "ph-open", lineageId: "lin-ph-open", ord: 61, label: "Practice for the aim", origin: CODE_ORIGIN, decision: "PENDING", notes: ["PLACEHOLDER"], flags: [] }
    );
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    const needs = draftNeedsOf(view.draft!.milestones[0]);
    eq("what milestone 1 still needs, in the page's order (an earlier-ordered checkpoint last): a name and a bar, nothing of Gemini's", needs.map((n) => `${n.kind}:${n.need}`), ["PRACTICE:NAME", "CHECKPOINT:SET_BAR"]);
    eq("'Next item to decide' is the first of them (the placeholder, not the checkpoint ordered before it)", view.draft?.nextToDecide, "ph-open");
    check("…never the PENDING syllabus topic, the named placeholder or the user's Domain", !needs.some((n) => n.id === "ph-named" || n.id === dom.id || recs.some((r) => r.id === n.id && r.origin === "SYLLABUS")));
    const card = await S.loadAimCard(USER, NOW, depsFor(w));
    eq("the Aim card's count is the footer's (undecidedRowsOf = draftNeedsOf(milestone 1).length)", card?.draftItems, needs.length);
    eq("…the same count undecidedRowsOf gives", S.undecidedRowsOf(view.draft!.milestones[0]), 2);
  }
  {
    // An empty title is named, never kept or checked (fix round 2's carry-over: decideItemCore refuses KEPT and CHECKED on it).
    const w = world();
    const id = await drafted(w);
    const [m1] = rowsOf(w, id, 1);
    (w.t.roadmapMilestone.find((m) => m.id === m1.id) as MilestoneRec).title = "";
    const checkedEmpty = await S.decideItemCore(USER, m1.id, "CHECKED", NOW, depsFor(w));
    eq("'I checked this' on an empty title is refused ('Name this milestone first')", checkedEmpty.ok ? "ok" : checkedEmpty.error, S.NAME_IT_FIRST);
    const keptEmpty = await S.decideItemCore(USER, m1.id, "KEPT", NOW, depsFor(w));
    check("…and Keep is refused too", !keptEmpty.ok && w.t.roadmapMilestone.find((m) => m.id === m1.id)?.titleDecision === "PENDING", json(keptEmpty));
    const named = await S.editItemCore(USER, m1.id, { label: "My first stage" }, NOW, depsFor(w));
    check("…naming it settles it (EDITED)", named.ok && w.t.roadmapMilestone.find((m) => m.id === m1.id)?.titleDecision === "EDITED");
  }

  console.log("— fix round 2: the view's new fields —");
  {
    // RoadmapView.acceptedRun: the run behind the accepted version, never the latest.
    const w = world();
    const id = await accepted(w);
    const a = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("an accepted Gemini plan: acceptedRun is the Gemini run that wrote it", a.acceptedRun?.kind === "GEMINI" && a.acceptedRun.wrote === "GEMINI" && a.acceptedRun.id === a.run?.id, json(a.acceptedRun));
    await S.replanCore(USER, id, "REFIT", at(1_000), depsFor(w));
    const b = await S.loadRoadmapView(USER, at(2_000), depsFor(w));
    check(
      "a pending in-house re-plan: `run` is the INHOUSE re-plan, acceptedRun stays the Gemini run with its report",
      b.run?.kind === "INHOUSE" && b.acceptedRun?.kind === "GEMINI" && b.acceptedRun.wrote === "GEMINI" && b.acceptedRun.report != null,
      json([b.run?.kind, b.acceptedRun])
    );
    await decideAll(w, id, rowsOf(w, id, 2).find((m) => m.status === "DRAFT")!.id);
    await S.acceptCore(USER, id, { overAccepted: false }, at(3_000), depsFor(w));
    const c = await S.loadRoadmapView(USER, at(4_000), depsFor(w));
    check("…once that re-plan is accepted, acceptedRun is its own INHOUSE run", c.acceptedRun?.kind === "INHOUSE" && c.acceptedRun.wrote === "INHOUSE", json(c.acceptedRun));
    const w2 = world();
    await drafted(w2);
    const d = await S.loadRoadmapView(USER, NOW, depsFor(w2));
    check("a draft nothing accepted: acceptedRun null and no positions yet", d.acceptedRun === null && d.positions === undefined, json([d.acceptedRun, d.positions]));
    // A FAILED Gemini draft that wrote the starter in its place, accepted: its marker is read in full, so it reads STARTER.
    const w3 = world();
    const id3 = await newDraft(w3);
    const c3 = await S.claimDraftCore(USER, id3, { force: false }, NOW, depsFor(w3));
    await S.runDraftCore(c3.ok ? c3.value.runId : "", depsFor(w3, { callModel: async () => { throw new Error("no key"); }, clock: () => NOW }));
    await decideAll(w3, id3, (rowsOf(w3, id3, 1).find((m) => m.status === "DRAFT") as MilestoneRec).id);
    const acc3 = await S.acceptCore(USER, id3, { overAccepted: false }, NOW, depsFor(w3));
    const v3 = await S.loadRoadmapView(USER, at(1_000), depsFor(w3));
    check("an accepted starter fallback: acceptedRun is the FAILED Gemini run that wrote it, read as STARTER", acc3.ok && v3.acceptedRun?.status === "FAILED" && v3.acceptedRun.wrote === "STARTER", json([acc3, v3.acceptedRun]));
  }
  {
    // RoadmapView.positions: a dropped milestone is still a position, and its copy shares it.
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    goalOf(w, m1.id).archivedAt = NOW;
    const v1 = await S.loadRoadmapView(USER, at(1_000), depsFor(w));
    const card1 = await S.loadAimCard(USER, at(1_000), depsFor(w));
    check("milestone 1 dropped: positions 2, as the Aim card's 'of' and Toward the aim read", v1.positions === 2 && card1?.milestone?.of === 2 && v1.toward?.scheduled === 2, json([v1.positions, card1?.milestone?.of, v1.toward?.scheduled]));
    await S.startAgainCore(USER, m1.id, at(2_000), depsFor(w));
    const v2 = await S.loadRoadmapView(USER, at(3_000), depsFor(w));
    check("…and with its 'Start again' copy (three rows) still 2", v2.positions === 2 && rowsOf(w, id, 1).length === 3, json([v2.positions, rowsOf(w, id, 1).length]));
  }
  {
    // AimCardView.acceptedDay; no struck spans on code's titles (Gemini writes no title).
    const w = world();
    await accepted(w);
    const card = await S.loadAimCard(USER, NOW, depsFor(w));
    eq("the Aim card carries the day the plan was accepted", card?.acceptedDay, TODAY);
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("code's titles carry no struck spans", view.milestones.every((m) => m.titleStruck === undefined) && card?.milestone?.titleStruck === undefined);
  }
  {
    // triggersFor leaves a trace when the triggers can't be read (the banner is QUESTS_BEHIND's one surface).
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void logged.push(args);
    let view: Awaited<ReturnType<typeof S.loadRoadmapView>>;
    try {
      view = await S.loadRoadmapView(USER, NOW, depsFor(w, { lanes: { ...lanesFor(w), triggersOf: () => { throw new Error("triggers broke"); } } }));
    } finally {
      console.error = original;
    }
    check("a failed trigger read shows no banner and logs 'roadmap: triggers unavailable:'", view.triggers.length === 0 && logged.some((a) => a[0] === "roadmap: triggers unavailable:"), json(logged.map((a) => String(a[0]))));
  }

  // ═══ Revision 4 (lane R4: docs/life-plan/roadmap-rev4.md) ═══════════════════
  /** A cookie jar as Next's cookies() serves the cores (set, get, delete), recording every write. */
  class FakeJar {
    values = new Map<string, string>();
    sets: { name: string; value: string; maxAge: number; path: string; sameSite: string; httpOnly: boolean }[] = [];
    deleted: string[] = [];
    get(name: string) {
      return this.values.get(name);
    }
    set(name: string, value: string, opts: { maxAge: number; path: string; sameSite: "lax"; httpOnly: boolean }) {
      this.values.set(name, value);
      this.sets.push({ name, value, ...opts });
    }
    delete(name: string) {
      this.deleted.push(name);
      this.values.delete(name);
    }
  }
  const SERVER_SRC = readFileSync(join(process.cwd(), "src/lib/roadmap-server.ts"), "utf8");
  const ACTIONS_SRC = readFileSync(join(process.cwd(), "src/app/actions/roadmap.ts"), "utf8");

  console.log("— rev 4: the aim invitation (F-R4-1, F-R4-2, F-R4-3, F-R4-5) —");
  {
    const jar = new FakeJar();
    const r = await S.snoozeAimPromptCore(jar, NOW);
    const set = jar.sets[0];
    check("'Not now' writes 'later:<today>' (maxAge 365 days, path /, lax, httpOnly), no database", r.ok && set?.name === AIM_PROMPT_COOKIE && set.value === `later:${TODAY}` && set.maxAge === 365 * 86_400 && set.path === "/" && set.sameSite === "lax" && set.httpOnly, json(set));
    const step = new FakeJar();
    const s1 = await S.snoozeAimStepCore(step, "START", "ms-1", NOW);
    check("'Not now: hide this for a week' writes '<kind>:<id>:<today>' (maxAge 8 days)", s1.ok && step.sets[0]?.name === "xtnl-aim-step" && step.sets[0].value === `START:ms-1:${TODAY}` && step.sets[0].maxAge === 8 * 86_400, json(step.sets));
    const bad = await S.snoozeAimStepCore(step, "START", "../x", NOW);
    check("…a malformed reference writes nothing", !bad.ok && step.sets.length === 1);
    check("no roadmap file writes the year-long 'off' value any more", !/["']off["']\s*,\s*\{\s*maxAge/.test(ACTIONS_SRC) && !/set\([^)]*["']off["']/.test(ACTIONS_SRC + SERVER_SRC));
  }
  {
    const w = world();
    const jar = new FakeJar();
    const off = await S.setAimSuggestionsCore(USER, false, jar, NOW, { ...depsFor(w), env: WRITES_OFF });
    eq("setAimSuggestions refuses with writes off, writing nothing", [errOf(off), w.settings?.aimSuggestions], [ROADMAP_WRITES_OFF, null]);
    const no = await S.setAimSuggestionsCore(USER, false, jar, NOW, depsFor(w));
    check("'Don't suggest this' (false) writes the column, the lasting no, and no cookie", no.ok && w.settings?.aimSuggestions === false && jar.sets.length === 0, json([no, w.settings]));
    const card = await S.loadAimCard(USER, NOW, depsFor(w));
    eq("the Aim card reads the stored switch (one select)", [card?.state, card?.aimSuggestions], ["EMPTY", false]);
    jar.values.set(AIM_PROMPT_COOKIE, "off");
    const yes = await S.setAimSuggestionsCore(USER, true, jar, NOW, depsFor(w));
    check("…true writes true, deletes a legacy 'off' cookie and writes 'on:<today>' (the back-off starts again)", yes.ok && w.settings?.aimSuggestions === true && jar.deleted.includes(AIM_PROMPT_COOKIE) && jar.values.get(AIM_PROMPT_COOKIE) === `on:${TODAY}`, json([jar.deleted, [...jar.values]]));
    w.missingColumn = true;
    const missing = await S.loadAimCard(USER, NOW, depsFor(w));
    eq("a revision-4 column not yet applied: the card still renders, aimSuggestions read as null", [missing?.state, missing?.aimSuggestions], ["EMPTY", null]);
    const notYetColumn = await S.setAimSuggestionsCore(USER, false, jar, NOW, depsFor(w));
    check("…and the switch says it arrives with the next update", !notYetColumn.ok, json(notYetColumn));
  }
  {
    // The last aim and the DONE window (F-R4-1, F-R4-2).
    const w = world();
    const id = await accepted(w);
    const r = w.t.roadmap.find((x) => x.id === id) as RoadmapRec;
    const [m1] = rowsOf(w, id, 1);
    w.t.roadmapMilestone.find((m) => m.id === m1.id)!.reachedDay = addDays(TODAY, -40);
    Object.assign(r, { status: "DONE", doneAt: new Date(NOW.getTime() - 27 * 86_400_000), reachedDay: addDays(TODAY, -30) });
    const recent = await S.loadAimCard(USER, NOW, depsFor(w));
    eq("DONE 27 days ago: the card is DONE", recent?.state, "DONE");
    r.doneAt = new Date(NOW.getTime() - 28 * 86_400_000);
    const later = await S.loadAimCard(USER, NOW, depsFor(w));
    check("DONE 28 days ago: EMPTY, with the last aim's words, final rank and the day it was reached", later?.state === "EMPTY" && later.lastAim?.aim === INTAKE.aim && later.lastAim.rankName === "Expert" && later.lastAim.reached && later.lastAim.day === addDays(TODAY, -30), json(later?.lastAim));
    const again = await S.saveIntakeCore(USER, { ...INTAKE, aim: "My next aim" }, NOW, depsFor(w));
    check("saveIntake after a DONE roadmap inserts a new DRAFT (not refused)", again.ok && w.t.roadmap.filter((x) => x.status === "DRAFT").length === 1, json(again));
    const w2 = world();
    const id2 = await accepted(w2);
    await S.archiveRoadmapCore(USER, id2, { reason: "Changed course", archiveGoal: false }, NOW, depsFor(w2));
    const arch = await S.loadAimCard(USER, NOW, depsFor(w2));
    eq("a history of only ARCHIVED roadmaps: EMPTY with no last aim", [arch?.state, arch?.lastAim], ["EMPTY", null]);
    const none = await S.loadAimCard(USER, NOW, depsFor(world()));
    eq("…and none at all: no last aim", none?.lastAim, null);
  }
  {
    // Today's aim step (F-R4-3): ≤ 4 reads, null on a missing table or column, never loadAimCard.
    const w = world();
    w.lastOpen = addDays(TODAY, -9);
    const empty = await S.loadAimStep(USER, NOW, depsFor(w));
    check("no roadmap: no open step, the setting, the epoch day and the first day back", empty != null && empty.open == null && empty.epochDay === "2026-01-01" && empty.lastOpenBefore === addDays(TODAY, -9) && empty.aimSuggestions == null, json(empty));
    const id = await drafted(w);
    w.stepReads = 0;
    let lists = 0;
    let bundles = 0;
    const base = w.store();
    const counting: RoadmapStore = { ...base, listRoadmaps: (u) => (lists++, base.listRoadmaps(u)), bundle: (u, rid) => (bundles++, base.bundle(u, rid)) };
    const draft = await S.loadAimStep(USER, NOW, depsFor(w, { store: counting }));
    check("a DRAFT: its id, the day it was saved and whether a draft runs", draft?.open?.kind === "DRAFT" && draft.open.roadmapId === id && draft.open.savedDay === TODAY && draft.open.running === false, json(draft?.open));
    check("…in at most 4 reads (roadmaps, the open roadmap's rows, LifeSettings, the last DAY_OPEN)", lists + bundles + w.stepReads <= 4, json([lists, bundles, w.stepReads]));
    const missing = await S.loadAimStep(USER, NOW, { ...depsFor(w), store: { ...w.store(), listRoadmaps: async () => Promise.reject(Object.assign(new Error("The table `public.Roadmap` does not exist"), { code: "P2021", meta: { table: "public.Roadmap" } })) } });
    eq("a missing table gives null", missing, null);
    w.missingColumn = true;
    eq("…and so does a revision-4 column not yet applied", await S.loadAimStep(USER, NOW, depsFor(w)), null);
    check("loadAimStep is cached as 'aimStep:<user>:<today>' on ['roadmap', 'life'] and never calls loadAimCard", /cached\(`aimStep:\$\{userId\}:\$\{todayKey\(now\)\}`, \["roadmap", "life"\]/.test(SERVER_SRC) && !/function loadAimStepUncached[\s\S]*?loadAimCard\(/.test(SERVER_SRC.slice(SERVER_SRC.indexOf("async function loadAimStepUncached"), SERVER_SRC.indexOf("export async function snoozeAimPromptCore"))));
    const w2 = world();
    const id2 = await accepted(w2);
    const [a, b] = rowsOf(w2, id2, 1);
    const st = await S.startMilestoneCore(USER, a.id, START_ALL, NOW, depsFor(w2));
    check("fixture: milestone 1 started", st.ok, json(st));
    const step = await S.loadAimStep(USER, NOW, depsFor(w2));
    const ms = step?.open?.kind === "ACTIVE" ? step.open.milestones : [];
    eq("an ACTIVE plan: each milestone's place, stage, state and rank (no title reaches Today)", ms.map((m) => [m.ord, m.stage, m.state, m.rankIndex]), [
      [1, "FLUENT", "OPEN", 4],
      [2, "MASTERED", "PLANNED", 5],
    ]);
    check("…never a title or label in the step", !json(step).includes("to level 6+"), json(step));
    void b;
    check("closing a ROADMAP goal revalidates 'roadmap' (goals-server), so START shows on the next render", /if \(isRoadmap\) invalidate\("roadmap"\)/.test(readFileSync(join(process.cwd(), "src/lib/goals-server.ts"), "utf8")));
  }

  console.log("— rev 4: the intake (F-R4-4, F-R4-9, F-R4-16, F-R4-24) —");
  {
    const ctx = { today: TODAY, fields: world().tree };
    const v = (patch: Record<string, unknown>) => S.validateIntake({ ...INTAKE, ...patch }, ctx);
    const plain = v({});
    eq("a Field intake with no depth is Mastered (12), the default, CHOSEN with its date", plain.ok ? [plain.value.depth, plain.value.dateMode] : null, [12, "CHOSEN"]);
    eq("…a depth on a track Area is refused", errOf(v({ fieldId: null, track: "BODY", domainIds: [], depth: 10 })), S.DEPTH_ON_TRACK);
    check("…an unknown depth is refused", !v({ depth: 9 }).ok && !v({ depth: "MASTERED" }).ok);
    check("…a coverage outside 1–500 is refused, a typed 40 is kept (YOURS), another Domain's figure ignored", !v({ coverage: { "d-prob": 0 } }).ok && !v({ coverage: { "d-prob": 501 } }).ok && json((v({ coverage: { "d-prob": 40, "d-risk": 9 } }) as { value: Intake }).value.coverage) === json({ "d-prob": 40 }));
    const many = v({ domainIds: ["d-prob", "d-inf", "d-risk"], newDomainNames: ["A one", "A two", "A three", "A four"] });
    eq("…more than 6 Domains (named ones included) is refused", errOf(many), S.TOO_MANY_DOMAINS);
    eq("…a line tied to a Domain outside the chosen ones is refused", errOf(v({ syllabus: { lines: ["Bayes"], source: null, lineDomains: ["d-risk"] } })), S.LINE_DOMAIN_OUTSIDE);
    const aligned = v({ syllabus: { lines: ["Bayes", "  ", "Markov chains"], source: null, lineDomains: ["d-prob", null, "d-inf"] } });
    eq("…blank lines drop out with their Domain (the two lists stay aligned)", aligned.ok ? aligned.value.syllabus : null, { lines: ["Bayes", "Markov chains"], source: null, lineDomains: ["d-prob", "d-inf"] });
    const realistic = v({ dateMode: "REALISTIC", targetDay: undefined });
    check("REALISTIC needs no date: a provisional one (today + 1,080) until a draft sets the realistic one", realistic.ok && realistic.value.targetDay === addDays(TODAY, 1080) && realistic.value.dateMode === "REALISTIC", json(realistic));
    eq("a track Area is always CHOSEN", (v({ fieldId: null, track: "BODY", domainIds: [], dateMode: "REALISTIC" }) as { value: Intake }).value.dateMode, "CHOSEN");
    eq("the exam: Yes without its name is refused", errOf(v({ exam: true, examLabel: "" })), S.NAME_THE_EXAM);
    const no = v({ aim: "Pass the bar", exam: false, examLabel: "Bar exam", examDay: addDays(TODAY, 90) });
    check("…No is honoured, even for 'Pass the bar' (its prefill is only a prefill): no name, no date", no.ok && no.value.examLabel == null && no.value.examDay == null, json(no));
    eq("…an exam date in the past is refused", errOf(v({ exam: true, examLabel: "SOA Exam P", examDay: addDays(TODAY, -1) })), S.EXAM_DAY_RANGE);
    eq("…today is refused (tomorrow at the earliest)", errOf(v({ exam: true, examLabel: "SOA Exam P", examDay: TODAY })), S.EXAM_DAY_RANGE);
    eq("…and past 1,080 days", errOf(v({ exam: true, examLabel: "SOA Exam P", examDay: addDays(TODAY, 1081) })), S.EXAM_DAY_RANGE);
    const exam = v({ exam: true, examLabel: "SOA Exam P", examDay: addDays(TODAY, 180) });
    check("…a date in range is kept (YOURS, a waypoint)", exam.ok && exam.value.examDay === addDays(TODAY, 180) && exam.value.exam === true, json(exam));
    check("a named Domain that is a link or a repeat is refused, one the Area already has too", !v({ newDomainNames: ["www.example.com"] }).ok && !v({ newDomainNames: ["Set theory", "set theory"] }).ok && !v({ newDomainNames: ["Probability"] }).ok);
  }
  {
    // Named Domains (F-R4-24): created in the Area Field at save, chosen; a repeat tap reuses them.
    const w = world();
    const r = await S.saveIntakeCore(USER, { ...INTAKE, domainIds: [], newDomainNames: ["Set theory", "Measure theory"] }, NOW, depsFor(w));
    const row = w.t.roadmap[0];
    check("an empty library's named areas are created in the Area Field and become the plan's Domains", r.ok && w.domainsCreated.length === 2 && w.domainsCreated.every((d) => d.fieldId === "f-stats") && row.domainIds.length === 2, json([w.domainsCreated, row.domainIds]));
    const again = await S.saveIntakeCore(USER, { ...INTAKE, domainIds: [], newDomainNames: ["Set theory", "Measure theory"] }, NOW, depsFor(w));
    check("…a second tap names Domains the Area now has: refused ('pick it instead'), never a duplicate Domain", !again.ok && /pick it instead/.test(errOf(again)) && w.domainsCreated.length === 2, json(again));
    const stored = await S.saveIntakeCore(USER, { ...INTAKE, depth: 10, coverage: { "d-prob": 40 }, exam: true, examLabel: "SOA Exam P", examDay: addDays(TODAY, 200), syllabus: { lines: ["Bayes"], source: null, lineDomains: ["d-prob"] } }, NOW, depsFor(w));
    const saved = w.t.roadmap[0];
    check("the intake stores depth, coverage, date mode, exam date and the lines' Domains", stored.ok && saved.depth === 10 && json(saved.coverage) === json({ "d-prob": 40 }) && saved.dateMode === "CHOSEN" && saved.examDay === addDays(TODAY, 200) && json((saved.syllabus as Syllabus).lineDomains) === json(["d-prob"]), json(saved));
    eq("…and reads them back (intakeOf)", [S.intakeOf(saved).depth, S.intakeOf(saved).examDay, S.intakeOf(saved).coverage], [10, addDays(TODAY, 200), { "d-prob": 40 }]);
  }
  {
    // A plan with nothing left to do, or none within 3 years, is refused at intake (F-R4-10, decision 41).
    const w = world();
    const held = await S.saveIntakeCore(USER, { ...INTAKE, aim: "Hold what I hold [held]" }, NOW, depsFor(w));
    check("a depth already held in these Domains is refused at intake", !held.ok && /already hold this depth/.test(errOf(held)) && w.t.roadmap.length === 0, json(held));
    const far = await S.saveIntakeCore(USER, { ...INTAKE, aim: "Everything [too far]" }, NOW, depsFor(w));
    check("…and a realistic date past 3 years", !far.ok && /about 4 years/.test(errOf(far)), json(far));
    const track = await S.saveIntakeCore(USER, { ...INTAKE, aim: "Run [held]", fieldId: null, track: "BODY", domainIds: [] }, NOW, depsFor(w));
    check("…never on a track Area (no depth to hold)", track.ok, json(track));
  }

  console.log("— rev 4: legacy plans (F-R4-16) —");
  /** An accepted plan made before revision 4: depth null, no stage, Gemini's words on its rows (marker tokens a taint check finds). */
  const legacyWorld = async () => {
    const w = world();
    const id = await accepted(w);
    const r = w.t.roadmap.find((x) => x.id === id) as RoadmapRec;
    r.depth = null;
    for (const m of rowsOf(w, id)) {
      Object.assign(m, { stage: null, title: "Zorblatt's secret stage", titleOrigin: "GEMINI", titleDecision: "KEPT" });
      for (const i of itemsOf(w, m.id)) if (i.kind !== "DOMAIN") Object.assign(i, { label: "Quixplendor drills", origin: "GEMINI", decision: "KEPT" });
    }
    return { w, id };
  };
  {
    const { w, id } = await legacyWorld();
    const [m1] = rowsOf(w, id, 1);
    eq("a legacy ACTIVE roadmap refuses Start", errOf(await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w))), S.START_AGAIN_AT_DEPTH);
    eq("…and a re-plan", errOf(await S.replanCore(USER, id, "REFIT", NOW, depsFor(w))), S.START_AGAIN_AT_DEPTH);
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    const card = await S.loadAimCard(USER, NOW, depsFor(w));
    const preview = await S.startPreview(USER, m1.id, NOW, depsFor(w));
    const all = json([view, card]);
    check("the views return no title, label or topic text of a legacy version (taint)", !/Zorblatt|Quixplendor/.test(all), all.match(/.{40}(Zorblatt|Quixplendor).{20}/)?.[0] ?? "");
    check("…the page keeps the aim, the banner (Gemini wording hidden) and nothing measured", view.header?.aim === INTAKE.aim && view.legacy?.geminiHidden === true && view.milestones.length === 0 && view.current == null && view.toward == null && view.run?.report == null, json(view.legacy));
    check("…the Aim card shows the aim and no milestone title", card?.legacy === true && card.aim === INTAKE.aim && card.milestone == null, json(card?.milestone));
    check("…and the Start sheet refuses", preview?.refusal === S.START_AGAIN_AT_DEPTH, json(preview?.refusal));
  }
  {
    const { w, id } = await legacyWorld();
    const [a, b] = await Promise.all([
      S.saveIntakeCore(USER, { ...INTAKE, aim: "Again, at a depth", replaces: id }, NOW, depsFor(w)),
      S.saveIntakeCore(USER, { ...INTAKE, aim: "Again, at a depth", replaces: id }, NOW, depsFor(w)),
    ]);
    const old = w.t.roadmap.find((x) => x.id === id) as RoadmapRec;
    check("'Start again at a depth': one DRAFT and the old roadmap archived, in one transaction (a double tap included)", a.ok && b.ok && w.t.roadmap.filter((x) => x.status === "DRAFT").length === 1 && old.status === "ARCHIVED" && old.archiveReason === S.replacedReasonOf(TODAY), json([a, b, w.t.roadmap.map((x) => [x.status, x.archiveReason])]));
    const fresh = w.t.roadmap.find((x) => x.status === "DRAFT") as RoadmapRec;
    check("…the new draft is at a depth", fresh.depth === 12);
    // Revision 5 (§23.1): the replace path inherits the archived row's seat, in the same transaction.
    check("…and inherits the archived row's seat (the replace path sets the slot)", old.slot === 1 && fresh.slot === old.slot, json([old.slot, fresh.slot]));
    const { w: w2, id: id2 } = await legacyWorld();
    (w2.t.roadmap.find((x) => x.id === id2) as RoadmapRec).depth = 12;
    const set = await S.saveIntakeCore(USER, { ...INTAKE, replaces: id2 }, NOW, depsFor(w2));
    check("the guard refuses a roadmap with a depth", !set.ok && w2.t.roadmap.length === 1, json(set));
    const { w: w3, id: id3 } = await legacyWorld();
    w3.t.roadmapMilestone.find((m) => m.roadmapId === id3)!.status = "STARTED";
    const started = await S.saveIntakeCore(USER, { ...INTAKE, replaces: id3 }, NOW, depsFor(w3));
    check("…and one with a started milestone", !started.ok && w3.t.roadmap.length === 1, json(started));
  }
  {
    // A legacy DRAFT: accept refuses until it is drafted again at a depth.
    const w = world();
    const id = await drafted(w);
    for (const m of rowsOf(w, id, 1)) m.stage = null;
    eq("a legacy draft (a row with no stage) can't be accepted", errOf(await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w))), S.DRAFT_IT_AGAIN);
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("…its draft view carries no row text, only the banner", view.draft?.legacy != null && view.draft.milestones.length === 0 && view.draft.acceptable === false, json(view.draft?.legacy));
    const again = await S.buildStarterCore(USER, id, NOW, depsFor(w));
    check("drafting it again replaces the old rows with staged ones, and then it is accepted", again.ok && rowsOf(w, id, 1).every((m) => m.stage != null) && (await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w))).ok);
  }

  console.log("— rev 4: keys-only drafting, integrity and the one writer (F-R4-17, F-R4-20) —");
  {
    // A REJECTED reply (an extra property carrying a sentence): nothing of it is written; the run is FAILED with its verdict; the starter stands.
    const w = world();
    const id = await newDraft(w);
    const logged: string[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
    try {
      await drafted(w, { smuggle: "You must buy the official CFA curriculum for $1,200", milestones: [{ domains: ["d-prob"] }, { domains: ["d-inf"] }] });
    } finally {
      console.warn = warn;
    }
    const run = w.t.roadmapRun.find((r) => r.roadmapId === id && r.kind === "GEMINI") as RunRec;
    const report = run.report as { fallback?: string; integrity?: { verdict: string; violations: { code: string; path: string }[] } };
    check("a REJECTED reply: the run is FAILED ('reply rejected: …'), counted toward the cap, the starter written", run.status === "FAILED" && /reply rejected: EXTRA_PROPERTY/.test(run.error ?? "") && report.fallback === RUN_FALLBACK_STARTER && rowsOf(w, id, 1).length > 0, json([run.status, run.error, report]));
    eq("…its verdict and normalised path stored (report.integrity): the sentence never kept", report.integrity?.violations, [{ code: "EXTRA_PROPERTY", path: "stages.FOUNDATION.<extra>" }]);
    const line = logged.find((l) => l.includes("roadmap.reply")) ?? "";
    // The raw reply stays only in RoadmapRun.samples on the server (F-R4-20).
    const tables = json({ ...w.t, roadmapRun: w.t.roadmapRun.map((r) => ({ ...r, samples: null })) });
    check("…one log line with normalised paths only: none of the reply's words, and none in any row (the raw reply stays in samples)", /"verdict":"REJECTED"/.test(line) && !/CFA|curriculum|1,200/.test(logged.join("\n")) && !/CFA|curriculum/.test(tables), line);
    check("…no item from the reply", rowsOf(w, id, 1).flatMap((m) => itemsOf(w, m.id)).every((i) => i.origin !== "GEMINI"));
  }
  {
    // Reuse walks the stored reply against the CURRENT schema: a stored `gaps` while suggestions are off is REJECTED, never reused.
    const w = world();
    const id = await drafted(w);
    const ok0 = w.t.roadmapRun.find((r) => r.status === "OK" && r.roadmapId === id) as RunRec;
    const samples = ok0.samples as { raw: string; ok?: boolean }[];
    samples[0].raw = json({ ...JSON.parse(samples[0].raw), gaps: ["Bayesian methods"] });
    const lanes = { ...lanesFor(w), integrityOf: ((parsed: unknown, schema: unknown) => {
      const hasGaps = !!(parsed as { gaps?: unknown })?.gaps;
      const schemaGaps = !!(schema as { properties?: { gaps?: unknown } })?.properties?.gaps;
      if (hasGaps && !schemaGaps) return { verdict: "REJECTED", violations: [{ code: "EXTRA_PROPERTY", path: "gaps" }], modelChars: 0, gapsKept: 0, gapsHidden: 0, gapsDropped: 0, notANameByClause: {} };
      return lanesFor(w).integrityOf!(parsed, schema);
    }) as RoadmapLanes["integrityOf"] };
    const reuse = await S.claimDraftCore(USER, id, { force: false }, at(60_000), depsFor(w, { lanes }));
    check("a stored reply with `gaps`, reused while suggestions are off, is REJECTED against the current schema: a fresh run is claimed instead", reuse.ok && reuse.value.status === "RUNNING", json(reuse));
  }
  {
    // The tripwire, through the one writer.
    const ctx = { roadmapId: "r1", syllabusLines: ["Conditional probability"], domainNames: { "d-prob": "Probability" }, rev4: true, track: "FIELD" as const, aim: INTAKE.aim, exam: null, required: ["d-prob"] };
    const base: MilestoneDraft = { id: null, lineageId: "l1", version: 1, ord: 1, title: "Fluent: Probability to level 10+", titleOrigin: CODE_ORIGIN, titleDecision: "PENDING", windowStart: TODAY, dueDay: addDays(TODAY, 60), status: "DRAFT", rankIndex: null, overAccepted: false, items: [], measures: [], notes: [], stage: "FLUENT" };
    const throws = (plan: MilestoneDraft[]) => {
      try {
        S.writeRoadmapRows([], { kind: "DRAFT", roadmapId: "r1", version: 1, plan, feasibility: null, now: NOW, makeId: () => globalThis.crypto.randomUUID() }, ctx);
        return null;
      } catch (err) {
        return err instanceof S.ModelTextError ? err.message : `other: ${String(err)}`;
      }
    };
    const okPractice = item("PRACTICE", 1, String(catalogLabelOf("RECALL_DRILLS", { track: "FIELD", domains: [domainName({ id: "d-prob", name: "Probability" })] })), { catalogKey: "RECALL_DRILLS", domainId: "d-prob" });
    eq("a code-worded catalog practice passes", throws([{ ...base, items: [okPractice] }]), null);
    check("a GEMINI practice is refused", /written by Gemini/.test(throws([{ ...base, items: [{ ...okPractice, origin: "GEMINI" }] }]) ?? ""));
    check("…a GEMINI title is refused", /title written by Gemini/.test(throws([{ ...base, titleOrigin: "GEMINI" }]) ?? ""));
    check("…a CODE label that isn't its catalog render is refused", /not the app's wording/.test(throws([{ ...base, items: [{ ...okPractice, label: "Recall drills: Probability, and buy the official book" }] }]) ?? ""));
    check("…a SYLLABUS topic whose label isn't its line is refused", /not your line/.test(throws([{ ...base, items: [item("TOPIC", 1, "Conditional probability and the CFA syllabus", { origin: "SYLLABUS", syllabusRef: 0 })] }]) ?? ""));
    eq("…the user's line passes", throws([{ ...base, items: [item("TOPIC", 1, "Conditional probability", { origin: "SYLLABUS", syllabusRef: 0 })] }]), null);
    check("…a Gemini-named Domain that isn't one of yours is refused", /not one of yours/.test(throws([{ ...base, items: [item("DOMAIN", 1, "Stochastic calculus", { origin: "GEMINI", domainId: null, notes: ["NOT_CHOSEN"] })] }]) ?? ""));
    check("…a code topic is refused (topics are your outline's)", /not from your outline/.test(throws([{ ...base, items: [item("TOPIC", 1, "Bayes")] }]) ?? ""));
    check("…a suggestion's name on a plan row is refused", /suggestion's name/.test(throws([{ ...base, items: [item("GAP", 1, "Risk theory", { origin: "GEMINI" }), item("STEP", 2, "Risk theory")] }]) ?? ""));
    eq("…the user's EDITED words pass", throws([{ ...base, items: [{ ...okPractice, label: "My own drills", decision: "EDITED" }] }]), null);
    check("…and a draft row with no stage is refused", /without a stage/.test(throws([{ ...base, stage: null }]) ?? ""));
    // On a draft path: the run fails and the starter is written.
    const w = world();
    const id = await newDraft(w);
    const gemini = { ...lanesFor(w), validateKeysOnly: ((parsed, c) => {
      const v = lanesFor(w).validateKeysOnly!(parsed, c);
      // v4 (contracts §20): the reply's practices never reach a row (code owns them), so the words ride on what does reach
      // one, a Domain addition (`needs`).
      const smuggled = item("DOMAIN", 99, "Buy the official course", { origin: "GEMINI", domainId: "d-risk", notes: ["NOT_CHOSEN"], lineageId: "lin-smuggled" });
      return { ...v, milestones: v.milestones.map((m, k) => ({ ...m, items: [...m.items.map((i) => (i.kind === "PRACTICE" ? { ...i, origin: "GEMINI" as const, label: "Buy the official course" } : i)), ...(k === 0 ? [smuggled] : [])] })) };
    }) as RoadmapLanes["validateKeysOnly"] };
    const tasks: (() => Promise<void> | void)[] = [];
    const c = await S.claimDraftCore(USER, id, { force: true }, NOW, depsFor(w, { lanes: gemini, defer: (t) => tasks.push(t), callModel: async () => REPLY, clock: () => NOW }));
    for (const t of tasks) await t();
    const run = w.t.roadmapRun.find((r) => c.ok && r.id === c.value.runId) as RunRec;
    check("on a draft path the tripwire fails the run and the starter is written in its place", run?.status === "FAILED" && /words the app didn't write/.test(run.error ?? "") && !/official course/.test(json(w.t.roadmapItem)) && rowsOf(w, id, 1).length > 0, json([run?.status, run?.error]));
    // On an action path: the action refuses.
    const id2 = await drafted(world());
    void id2;
    const w3 = world();
    const id3 = await drafted(w3);
    const m3 = rowsOf(w3, id3, 1)[0];
    (itemsOf(w3, m3.id).find((i) => i.kind === "PRACTICE") as ItemRec).origin = "GEMINI";
    const add = await S.addItemCore(USER, m3.id, { kind: "STEP", label: "My step" }, NOW, depsFor(w3));
    eq("on an action path the tripwire refuses the change", errOf(add), S.CHANGE_NOT_SAVED);
  }
  {
    // The grep (F-R4-20): no StoreOp that inserts a milestone or item, or writes its words or origin, outside the one writer.
    const start = SERVER_SRC.indexOf("export function writeRoadmapRows(");
    const end = SERVER_SRC.indexOf("function modelTextContextOf(", start);
    const outside = SERVER_SRC.slice(0, start) + SERVER_SRC.slice(end);
    const inserts = outside.match(/op: "insert", table: "roadmap(Item|Milestone)"/g) ?? [];
    const textUpdates = [...outside.matchAll(/op: "update", table: "roadmap(Item|Milestone)"[\s\S]{0,400}?data: \{([^}]*)\}/g)].filter((m) => /\b(title|label|origin|titleOrigin|catalogKey|proposedName|rawLabel)\s*[:,]/.test(m[2]));
    check("the grep: no milestone or item insert outside writeRoadmapRows", start > 0 && end > start && inserts.length === 0, inserts.join(" | "));
    check("…no update that writes title, label, origin, titleOrigin, catalogKey, proposedName or rawLabel outside it", textUpdates.length === 0, textUpdates.map((m) => m[0].slice(0, 120)).join(" | "));
    check("…the generic row update sends text fields through the writer (updateOne's TEXT_FIELDS guard)", /if \(TEXT_FIELDS\.some\(\(k\) => k in data\)\)/.test(SERVER_SRC));
    const srcFiles = ["src/lib/roadmap-server.ts", "src/lib/roadmap-readings.ts", "src/lib/roadmap-quests-server.ts", "src/lib/tasks.ts", "src/lib/goals-server.ts"].map((f) => readFileSync(join(process.cwd(), f), "utf8")).join("\n");
    check("…and no prisma.roadmapItem / roadmapMilestone create, createMany, update, updateMany or upsert anywhere", !/prisma\.roadmap(Item|Milestone)\.(create|createMany|update|updateMany|upsert)\(/.test(srcFiles));
  }
  {
    // Materialisation (v4, contracts §20): code owns every practice, step and checkpoint; the reply's part is its Domain
    // additions, its suggestions and the outline's learning order, split across the kept milestones in that order.
    const ladderRow = (stage: string, level: number, ord: number, lines: number[] = []): MilestoneDraft => ({
      id: null,
      lineageId: `L-${stage}`,
      version: 1,
      ord,
      title: stage,
      titleOrigin: CODE_ORIGIN,
      titleDecision: "PENDING",
      windowStart: TODAY,
      dueDay: addDays(TODAY, 40 * ord),
      status: "DRAFT",
      rankIndex: null,
      overAccepted: false,
      items: [item("PRACTICE", 1, "Recall drills: Probability", { catalogKey: "RECALL_DRILLS", lineageId: `L-${stage}-p` }), ...lines.map((l) => item("TOPIC", 10 + l, `Line ${l}`, { origin: "SYLLABUS", syllabusRef: l, lineageId: `L-line-${l}` }))],
      measures: [measure("CARDS_AT_LEVEL", { minLevel: level, scope: { domainIds: ["d-prob"] } })],
      notes: [],
      stage: stage as MilestoneDraft["stage"],
    });
    const pick = (key: string) => item("PRACTICE", 1, key, { catalogKey: key as ItemDraft["catalogKey"], notes: ["GEMINI_PICK"] });
    const slot = (stage: string, keys: string[], extra: ItemDraft[] = []): MilestoneDraft => ({ ...ladderRow(stage, 0, 1), items: [...keys.map(pick), ...extra] });
    const ladder = [ladderRow("FAMILIAR", 6, 1, [0]), ladderRow("RETAINED", 8, 2, [1]), ladderRow("BETWEEN", 11, 3, [2]), ladderRow("MASTERED", 12, 4)];
    const need = item("DOMAIN", 5, "Risk Management", { origin: "GEMINI", domainId: "d-risk", notes: ["NOT_CHOSEN"] });
    const gap = item("GAP", 6, "Risk theory", { origin: "GEMINI" });
    const reply = {
      milestones: [
        slot("FOUNDATION", ["RECALL_DRILLS", "READ_AND_CARD"], [item("TOPIC", 9, "Line 3", { origin: "SYLLABUS", syllabusRef: 3 }), need, gap]),
        slot("FAMILIAR", ["PROBLEM_SETS", "EXPLAIN_IT"], [item("STEP", 2, "Outline", { catalogKey: "OUTLINE", notes: ["GEMINI_PICK"] })]),
        slot("MASTERED", ["BUILD_SOMETHING"], [item("CHECKPOINT", 3, "Self-test", { catalogKey: "SELF_TEST", checkpointKind: "SELF_TEST", notes: ["GEMINI_PICK"] })]),
      ],
    };
    const slots = ["FOUNDATION", "FAMILIAR", "RETAINED", "FLUENT", "MASTERED"];
    const placed = S.materialiseKeys(ladder, reply, slots, { gapsOn: true, makeId: () => globalThis.crypto.randomUUID(), order: [3, 2, 0, 9, 3] });
    const keysOf = (i: number, kind = "PRACTICE") => placed[i].items.filter((x) => x.kind === kind).map((x) => x.catalogKey ?? x.label);
    eq(
      "the reply's practices, steps and checkpoints never reach a row: each milestone keeps the ladder's own (the progression's)",
      [0, 1, 2, 3].map((i) => [keysOf(i), keysOf(i, "STEP"), keysOf(i, "CHECKPOINT")]),
      [0, 1, 2, 3].map(() => [["RECALL_DRILLS"], [], []])
    );
    eq(
      "the outline split across the kept milestones in the reply's order (each line once; an unknown or repeated entry left out; a line it didn't list appended in the user's order), the reply's own line kept",
      [0, 1, 2, 3].map((i) => keysOf(i, "TOPIC")),
      [["Line 3"], ["Line 2"], ["Line 0"], ["Line 1"]]
    );
    check("…the ladder's line rows keep their lineage (moved, not copied)", placed[2].items.some((x) => x.kind === "TOPIC" && x.lineageId === "L-line-0") && placed.flatMap((m) => m.items).filter((x) => x.kind === "TOPIC").length === 4);
    eq("without an order, the lines stay in the user's order", S.materialiseKeys(ladder, { milestones: [] }, slots, { gapsOn: false, makeId: () => "x" }).map((m) => m.items.filter((x) => x.kind === "TOPIC").map((x) => x.label)), [["Line 0"], ["Line 1"], ["Line 2"], []]);
    check("Gemini's Domain addition sits on every kept milestone, pending; its suggestion on the first only", placed.every((m) => m.items.some((x) => x.kind === "DOMAIN" && x.domainId === "d-risk")) && placed.map((m) => m.items.filter((x) => x.kind === "GAP").length).join() === "1,0,0,0");
  }
  {
    // A body plan with constraints (F-R4-17): Gemini's session picks wait for one confirm; "easy, mobility and technique" replaces them.
    // Confirm to unlock (contracts §19): that confirm is now a second layer. A pick of a gated kind reaches the draft only once
    // the user answered the card without ticking it (here "Nothing to avoid" on the intake's card, before the draft);
    // without the answer the gate drops it.
    const bodyIntake: Intake = { ...INTAKE, aim: "Get back to running", fieldId: null, track: "BODY", domainIds: [], constraints: "knee injury, no running" };
    const bodyReply = { milestones: [{ practices: [{ name: "a", method: "X" }] }, { practices: [{ name: "b", method: "X" }] }] };
    const w0 = world();
    const id0 = await drafted(w0, bodyReply, bodyIntake);
    const view0 = await S.loadRoadmapView(USER, NOW, depsFor(w0));
    const picks0 = rowsOf(w0, id0, 1).flatMap((m) => itemsOf(w0, m.id)).filter((i) => i.notes.includes("GEMINI_PICK"));
    const run0 = w0.t.roadmapRun.find((r) => r.kind === "GEMINI");
    check(
      "without the user's answer the gate drops Gemini's picks of gated kinds (none reaches a row, no session-picks confirm), and the report says so (CONSTRAINT, no words)",
      picks0.length === 0 && view0.draft?.sessionPicks == null && ((run0?.report as ValidationReport | null)?.dropped ?? []).filter((d) => d.code === "CONSTRAINT" && d.label === "").length === 2,
      json([picks0.map((i) => i.catalogKey), view0.draft?.sessionPicks, (run0?.report as ValidationReport | null)?.dropped])
    );
    const card0 = view0.draft?.activityConfirm;
    check(
      "…the draft carries the confirm card: on, the user's words quoted, the gated kinds pending (Harder pre-ticked avoid from 'no running'), the safe kinds placed meanwhile",
      !!card0 && card0.on && card0.quotes.includes("knee injury, no running") && card0.pending >= 5 && card0.rows.find((r) => r.kind === "HARDER_SESSION")?.prefill === "AVOID" && json(card0.safeKinds) === json(["EASY_SESSION", "MOBILITY_SESSION", "TECHNIQUE_SESSION"]) && json(view0.activityConfirm) === json(card0),
      json(card0)
    );
    eq("…the exclusions line names what the user's words left out, with their word (the same gate)", view0.draft?.exclusions, [{ kind: "HARDER_SESSION", word: "running" }]);
    const w = world();
    const id = await newDraft(w, bodyIntake);
    const untouched = await answerCard(id, depsFor(w), []);
    eq("a Save with nothing ticked is no answer: refused (it names “Nothing to avoid”), nothing stored", [errOf(untouched), intakeActivitiesOf(w, id)], [ACTIVITY_NOTHING_TICKED, null]);
    const said = await answerCard(id, depsFor(w), [], { none: true });
    const stored0 = intakeActivitiesOf(w, id);
    check(
      "the user's “Nothing to avoid”, given before the draft, is stored as the card's answer (no AVOID, no FINE written; no rows to re-sync yet)",
      said.ok && said.value.replan === false && json(said.value.paused) === "[]" && stored0?.answered?.none === true && stored0.answered.asked.includes("HARDER_SESSION") && json(stored0.kinds) === "{}",
      json([said, stored0])
    );
    {
      const tasks: (() => Promise<void> | void)[] = [];
      const claim = await S.claimDraftCore(USER, id, { force: true }, NOW, depsFor(w, { defer: (t) => tasks.push(t), callModel: async () => bodyReply, clock: () => NOW }));
      if (!claim.ok) throw new Error(`fixture claim: ${claim.error}`);
      for (const t of tasks) await t();
    }
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("the draft shows the pending picks with the user's constraints quoted; the kind they said is fine isn't listed as left out", view.draft?.sessionPicks?.decision === "PENDING" && view.draft.sessionPicks.constraints === "knee injury, no running" && json(view.draft.exclusions) === "[]" && json(view.draft.sessionPicks.kinds) === json(["HARDER_SESSION"]), json([view.draft?.sessionPicks, view.draft?.exclusions]));
    eq("a pending session-picks decision blocks accept", errOf(await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w))), S.CONFIRM_PICKS);
    eq("…the confirm refuses with writes off", errOf(await S.confirmSessionPicksCore(USER, id, "EASY", NOW, { ...depsFor(w), env: WRITES_OFF })), ROADMAP_WRITES_OFF);
    const easy = await S.confirmSessionPicksCore(USER, id, "EASY", NOW, depsFor(w));
    const practices = rowsOf(w, id, 1).flatMap((m) => itemsOf(w, m.id).filter((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED"));
    check("'Use easy, mobility and technique instead': the picks removed and code's safe sessions in their place, in one write", easy.ok && practices.length > 0 && practices.every((p) => ["EASY_SESSION", "MOBILITY_SESSION", "TECHNIQUE_SESSION"].includes(p.catalogKey ?? "") && p.origin === CODE_ORIGIN), json(practices.map((p) => [p.catalogKey, p.label])));
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
    check("…then the plan is accepted", acc.ok, json(acc));
    const w2 = world();
    const id2 = await drafted(w2, { milestones: [{ domains: ["d-prob"], practices: [{ name: "a", method: "X" }] }, { domains: ["d-inf"] }] });
    // A Field plan's picks need no session confirm (F-R4-17), but Gemini's practice picks still wait on the user's one
    // decision (contracts §20.5): KEEP sets them CHECKED; DEFAULT removes the ones that aren't code's default and the
    // re-fit keeps code's default in their stage; either way accept is no longer blocked by them.
    const pendingPicksOf = (ww: FakeWorld, rid: string) => rowsOf(ww, rid, 1).flatMap((m) => itemsOf(ww, m.id)).filter((i) => i.kind === "PRACTICE" && i.notes.includes("GEMINI_PICK") && i.decision === "PENDING");
    const before2 = pendingPicksOf(w2, id2);
    const kept2 = await S.confirmSessionPicksCore(USER, id2, "KEEP", NOW, depsFor(w2));
    const after2 = rowsOf(w2, id2, 1).flatMap((m) => itemsOf(w2, m.id)).filter((i) => before2.some((b) => b.id === i.id));
    check(
      "a Field plan's Gemini picks: KEEP (the one decision) sets every waiting pick CHECKED",
      kept2.ok && before2.length > 0 && after2.length === before2.length && after2.every((i) => i.decision === "CHECKED") && pendingPicksOf(w2, id2).length === 0,
      json([kept2, before2.map((i) => i.catalogKey), after2.map((i) => i.decision)])
    );
    eq("…a second decision finds none waiting", errOf(await S.confirmSessionPicksCore(USER, id2, "KEEP", NOW, depsFor(w2))), "There are no practice picks to decide.");
    const w3 = world();
    const id3 = await drafted(w3, { milestones: [{ domains: ["d-prob"], practices: [{ name: "a", method: "X" }] }, { domains: ["d-inf"] }] });
    const picked3 = pendingPicksOf(w3, id3);
    const toDefault = await S.confirmSessionPicksCore(USER, id3, "DEFAULT", NOW, depsFor(w3));
    const live3 = (rid: string) => itemsOf(w3, rid).filter((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED");
    const stage3 = rowsOf(w3, id3, 1).find((m) => picked3.some((p) => p.milestoneId === m.id));
    check(
      "…DEFAULT removes them (REMOVED, never added back) and the stage keeps code's default with its other practices",
      toDefault.ok &&
        picked3.length > 0 &&
        picked3.every((p) => itemsOf(w3, p.milestoneId).some((i) => i.id === p.id && i.decision === "REMOVED")) &&
        !!stage3 &&
        live3(stage3.id).length >= 2 &&
        !live3(stage3.id).some((i) => picked3.some((p) => p.catalogKey === i.catalogKey)) &&
        pendingPicksOf(w3, id3).length === 0,
      json([toDefault, picked3.map((i) => i.catalogKey), stage3 && live3(stage3.id).map((i) => [i.catalogKey, i.decision])])
    );
    const nextRow3 = rowsOf(w3, id3, 1).find((m) => m.status === "DRAFT") as MilestoneRec;
    await decideAll(w3, id3, nextRow3.id);
    const acc3 = await S.acceptCore(USER, id3, { overAccepted: false }, NOW, depsFor(w3));
    check("…then the plan is accepted", acc3.ok, json(acc3));
  }
  {
    // The outline (F-R4-9, F-R4-21): every topic is the user's line with the user's Domain, whatever the reply; moves and Domain changes.
    const w = world();
    const outline: Intake = { ...INTAKE, syllabus: { lines: ["Conditional probability", "Bayes' theorem", "Markov chains"], source: null, lineDomains: ["d-prob", "d-prob", null] } };
    const id = await drafted(w, { milestones: [{ domains: ["d-prob"], lines: [0, 2] }, { domains: ["d-inf"], lines: [1] }] }, outline);
    const [m1, m2] = rowsOf(w, id, 1);
    const topics = rowsOf(w, id, 1).flatMap((m) => itemsOf(w, m.id).filter((i) => i.kind === "TOPIC"));
    check("every topic's label is its intake line and its Domain the user's line Domain", topics.length === 3 && topics.every((t) => t.label === outline.syllabus!.lines[t.syllabusRef as number] && t.domainId === (outline.syllabus!.lineDomains![t.syllabusRef as number] ?? null) && t.origin === "SYLLABUS"), json(topics.map((t) => [t.label, t.domainId])));
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    eq("a line tied to no Domain of R is listed (unassignedLines)", view.draft?.unassignedLines, [2]);
    const line2 = itemsOf(w, m1.id).find((i) => i.syllabusRef === 2) as ItemRec;
    const moved = await S.moveLineCore(USER, line2.id, m2.id, NOW, depsFor(w));
    check("moveLine moves the topic between draft rows (the user's arrangement: EDITED)", moved.ok && !itemsOf(w, m1.id).some((i) => i.syllabusRef === 2) && itemsOf(w, m2.id).some((i) => i.syllabusRef === 2 && i.decision === "EDITED"), json(moved));
    const after = await S.loadRoadmapView(USER, NOW, depsFor(w));
    eq("…which reads as the user's arrangement", after.draft?.milestones.find((m) => m.items.some((i) => i.syllabusRef === 2))?.arrangedBy, "USER");
    eq("moveLine refuses with writes off", errOf(await S.moveLineCore(USER, line2.id, m1.id, NOW, { ...depsFor(w), env: WRITES_OFF })), ROADMAP_WRITES_OFF);
    const set = await S.setLineDomainCore(USER, id, 2, "d-inf", NOW, depsFor(w));
    const stored = (w.t.roadmap[0].syllabus as Syllabus).lineDomains;
    const t2 = rowsOf(w, id, 1).flatMap((m) => itemsOf(w, m.id)).find((i) => i.syllabusRef === 2);
    check("setLineDomain changes the user's line Domain and the line's topic, re-dated", set.ok && json(stored) === json(["d-prob", "d-prob", "d-inf"]) && t2?.domainId === "d-inf", json([set, stored, t2?.domainId]));
    eq("…a Domain outside R is refused", errOf(await S.setLineDomainCore(USER, id, 2, "d-risk", NOW, depsFor(w))), S.LINE_DOMAIN_OUTSIDE);
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
    check("fixture: accepted", acc.ok, json(acc));
    const [a1] = rowsOf(w, id, 1).filter((m) => m.status === "PLANNED");
    await S.startMilestoneCore(USER, a1.id, START_ALL, NOW, depsFor(w));
    const setActive = await S.setLineDomainCore(USER, id, 0, null, at(1_000), depsFor(w));
    const started = w.t.roadmapMilestone.find((m) => m.id === a1.id) as MilestoneRec;
    check("after acceptance a line's Domain goes through a MANUAL re-plan of the unstarted stages; the started row is never touched", setActive.ok && rowsOf(w, id, 2).length > 0 && started.status === "STARTED" && itemsOf(w, a1.id).find((i) => i.syllabusRef === 0)?.domainId === "d-prob", json([setActive, rowsOf(w, id, 2).length]));
    const mStarted = await S.moveLineCore(USER, itemsOf(w, a1.id).find((i) => i.kind === "TOPIC")!.id, rowsOf(w, id, 2)[0].id, NOW, depsFor(w));
    check("…and moveLine never moves a started row's line", !mStarted.ok, json(mStarted));
  }
  {
    // A Domain addition past 3 years, and the 7th Domain (F-R4-21).
    const w = world();
    w.tree[0].domains.push({ id: "d-calc", name: "Calculus", fieldId: "f-stats", cards: [] });
    const id = await drafted(w, { milestones: [{ domains: ["d-prob"], needs: ["d-calc"] }, { domains: ["d-inf"] }] }, { ...INTAKE, aim: "Understand probability deeply" });
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    const add = view.draft?.additions?.[0];
    check("the additions row lists the Domain's real facts, its n_d and the date with it, before anything is confirmed", add?.domainId === "d-calc" && add.name === "Calculus" && add.cards === 0 && add.n === 25 && add.dateWith === addDays(TODAY, 1200) && add.blocked === "PAST_SPAN", json(add));
    eq("…offered as BULK for an English, non-exam aim", view.draft?.additionsMode, "BULK");
    const past = await S.confirmDomainAdditionsCore(USER, id, 1, ["d-calc"], NOW, depsFor(w, { lanes: { ...lanesFor(w), dateCheckOf: (ladder, input, mode) => ({ ...lanesFor(w).dateCheckOf!(ladder, input, mode, null), D_real: addDays(TODAY, 1200) }) } }));
    check("an addition that would pass 1,080 days is refused, in words", !past.ok && /past 3 years/.test(errOf(past)), json(past));
    const leave = await S.confirmDomainAdditionsCore(USER, id, 1, [], NOW, depsFor(w));
    check("[Leave out]: the addition REMOVED on every row, and accept no longer blocked by it", leave.ok && rowsOf(w, id, 1).every((m) => itemsOf(w, m.id).filter((i) => i.domainId === "d-calc").every((i) => i.decision === "REMOVED")) && (await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w))).ok);
    const w2 = world();
    w2.tree[0].domains.push(...["a", "b", "c", "d", "e"].map((x) => ({ id: `d-${x}x`, name: `Area ${x}`, fieldId: "f-stats", cards: [] })));
    const id2 = await drafted(w2, { milestones: [{ domains: ["d-prob"], needs: ["d-ax", "d-bx", "d-cx", "d-dx", "d-ex"] }, { domains: ["d-inf"] }] });
    eq("a 7th Domain is refused (R holds at most 6)", errOf(await S.confirmDomainAdditionsCore(USER, id2, 1, ["d-ax", "d-bx", "d-cx", "d-dx", "d-ex"], NOW, depsFor(w2))), S.TOO_MANY_DOMAINS);
    const exam = world();
    const idE = await drafted(exam, { milestones: [{ domains: ["d-prob"], needs: ["d-risk"] }, { domains: ["d-inf"] }] }, { ...INTAKE, aim: "Pass FRM Part 1", exam: true, examLabel: "FRM Part 1" });
    eq("an exam aim offers one toggle per Domain (no add-all)", (await S.loadRoadmapView(USER, NOW, depsFor(exam))).draft?.additionsMode, "TOGGLES");
    void idE;
  }
  {
    // domainOrigins survives a re-plan (F-R4-21).
    const w = world();
    const id = await drafted(w, { milestones: [{ domains: ["d-prob"], needs: ["d-risk"] }, { domains: ["d-inf"] }] });
    await S.confirmDomainAdditionsCore(USER, id, 1, ["d-risk"], NOW, depsFor(w));
    await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
    await S.replanCore(USER, id, "REFIT", at(1_000), depsFor(w));
    await S.acceptCore(USER, id, { overAccepted: false }, at(2_000), depsFor(w));
    const f2 = w.t.roadmapAcceptance[1]?.feasibility as Feasibility | undefined;
    check("'suggested by Gemini, added by you on <day>' survives a REFIT re-plan (domainOrigins carried)", f2?.domainOrigins?.["d-risk"]?.by === "GEMINI_NEEDS" && f2.domainOrigins["d-risk"].day === TODAY, json(f2?.domainOrigins));
    const view = await S.loadRoadmapView(USER, at(3_000), depsFor(w));
    check("…and the ACTIVE plan's Depth line carries it", view.depth?.domainOrigins["d-risk"]?.by === "GEMINI_NEEDS" && view.depth.depth === 12, json(view.depth?.domainOrigins));
  }

  {
    // Area suggestions (F-R4-19): off (ROADMAP_GAPS_LIVE false), no GAP row is written; a GAP row is never a measure, a Today row or a blocker.
    const w = world();
    const id = await drafted(w, { milestones: [{ domains: ["d-prob"], gaps: ["Bayesian statistics"] }, { domains: ["d-inf"] }] });
    check("with suggestions off, Gemini's gap names are never written", !w.t.roadmapItem.some((i) => i.kind === "GAP") && !/Bayesian/.test(json(w.t.roadmapItem)));
    const view0 = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("…and the view lists none", (view0.draft?.gaps ?? []).length === 0 && (view0.gaps ?? []).length === 0);
    const [m1] = rowsOf(w, id, 1);
    const base = itemsOf(w, m1.id)[0];
    w.t.roadmapItem.push({ ...base, id: "gap-1", lineageId: "lin-gap-1", kind: "GAP", ord: 99, label: "Bayesian statistics", origin: "GEMINI", decision: "PENDING", domainId: null, catalogKey: null, notes: [], flags: [] } as ItemRec);
    for (const m of rowsOf(w, id, 1)) await decideAll(w, id, m.id);
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
    check("a GAP row (written while suggestions were on) never blocks accept", acc.ok, json(acc));
    check("…is never in a measure", !w.t.roadmapMeasure.some((x) => json(x).includes("lin-gap-1") || json(x).includes("gap-1")));
    const preview = await S.startPreview(USER, m1.id, NOW, depsFor(w));
    check("…and never a Today row or a pending decision at Start", !!preview && !preview.todayRows.some((r) => r.itemId === "gap-1") && !preview.pending.some((i) => i.id === "gap-1"), json(preview?.todayRows));
  }

  console.log("— rev 4: depth, held stages, the date (F-R4-9, F-R4-10, F-R4-11) —");
  {
    // REALISTIC: a draft write sets the realistic date (on the DRAFT); acceptance fixes it and the mode becomes CHOSEN.
    const w = world();
    const id = await newDraft(w, { ...INTAKE, dateMode: "REALISTIC", targetDay: undefined as unknown as DayKey });
    eq("a REALISTIC draft starts with the provisional date", w.t.roadmap[0].targetDay, addDays(TODAY, 1080));
    await S.buildStarterCore(USER, id, NOW, depsFor(w));
    const realistic = rowsOf(w, id, 1).map((m) => m.dueDay as DayKey).sort().pop();
    eq("…the starter's write sets the roadmap's date to D_real", w.t.roadmap[0].targetDay, realistic);
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
    const f = w.t.roadmapAcceptance[0]?.feasibility as Feasibility | undefined;
    check("acceptance fixes it: CHOSEN, the date the realistic one, dateOrigin REALISTIC ('the date the app set')", acc.ok && w.t.roadmap[0].dateMode === "CHOSEN" && w.t.roadmap[0].targetDay === realistic && f?.dateCheck?.dateOrigin.origin === "REALISTIC", json([acc, w.t.roadmap[0].dateMode, f?.dateCheck?.dateOrigin]));
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("…the header keeps who set it", view.header?.dateOrigin?.origin === "REALISTIC" && view.header.depth === 12 && view.dateCheck?.verdict === "FITS");
  }
  {
    const w = world();
    const id = await drafted(w);
    for (const m of rowsOf(w, id, 1)) await decideAll(w, id, m.id);
    mark(w, rowsOf(w, id, 1)[1].id, "[date-impossible]");
    eq("an IMPOSSIBLE date refuses accept for that depth and date", errOf(await S.acceptCore(USER, id, { overAccepted: true }, NOW, depsFor(w))), S.DATE_IMPOSSIBLE);
    const w2 = world();
    const id2 = await drafted(w2);
    for (const m of rowsOf(w2, id2, 1)) await decideAll(w2, id2, m.id);
    mark(w2, rowsOf(w2, id2, 1)[1].id, "[date-over]");
    const over = await S.acceptCore(USER, id2, { overAccepted: false }, NOW, depsFor(w2));
    check("an OVER date needs the switch", !over.ok && /over your hours or pace/.test(errOf(over)));
    const kept = await S.acceptCore(USER, id2, { overAccepted: true }, NOW, depsFor(w2));
    check("…with it, Over is stored for good", kept.ok && w2.t.roadmapAcceptance[0].overAccepted === true, json(kept));
    const w3 = world();
    const id3 = await drafted(w3);
    for (const m of rowsOf(w3, id3, 1)) await decideAll(w3, id3, m.id);
    mark(w3, rowsOf(w3, id3, 1)[0].id, "[too-soon]");
    eq("a realistic date under 35 days away is refused at accept", errOf(await S.acceptCore(USER, id3, { overAccepted: false }, NOW, depsFor(w3))), S.ONLY_WEEKS_AWAY);
  }
  {
    // Held stages (F-R4-10): reached at acceptance, never startable, no rank; a plan whose final stage is held is refused.
    const w = world();
    const id = await drafted(w);
    const [h1] = rowsOf(w, id, 1);
    const held = w.t.roadmapMilestone.find((m) => m.id === h1.id) as MilestoneRec;
    held.feasibility = { ...((held.feasibility as object) ?? {}), notes: ["HELD_AT_START"] };
    w.t.roadmapItem = w.t.roadmapItem.filter((i) => i.milestoneId !== h1.id || i.kind === "DOMAIN");
    // The next stage is now the second: its checkpoint (the progression's performance check) asks for its bar.
    await decideAll(w, id, rowsOf(w, id, 1)[1].id);
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
    const after = w.t.roadmapMilestone.find((m) => m.id === h1.id) as MilestoneRec;
    check("a held stage is PLANNED with reachedDay the acceptance day, and no goal", acc.ok && after.status === "PLANNED" && after.reachedDay === TODAY && after.goalId == null, json([acc, after]));
    eq("…never startable", errOf(await S.startMilestoneCore(USER, h1.id, START_ALL, NOW, depsFor(w))), S.LINEAGE_REACHED);
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("…'Held when you began' on the list, and Now is the next stage", view.milestones[0].held === true && view.current?.milestone.id !== h1.id, json(view.milestones[0]));
    check("…it gives no rank (the rank reader counts reaches inside the plan)", (view.rank?.index ?? 0) === 0 || view.rank?.name === "Initiate", json(view.rank?.name));
    const w2 = world();
    const id2 = await drafted(w2);
    for (const m of rowsOf(w2, id2, 1)) (w2.t.roadmapMilestone.find((x) => x.id === m.id) as MilestoneRec).feasibility = { notes: ["HELD_AT_START"] };
    eq("a plan whose final stage is already held is refused at accept", errOf(await S.acceptCore(USER, id2, { overAccepted: false }, NOW, depsFor(w2))), S.NOTHING_LEFT);
  }
  {
    // Lower the depth (F-R4-11): refused while a started stage works above it; otherwise the stages above dropped, a new end state.
    const w = world();
    const id = await accepted(w);
    const [f1, m2] = rowsOf(w, id, 1);
    for (const x of w.t.roadmapMeasure.filter((x) => x.milestoneId === m2.id && x.kind === "CARDS_AT_LEVEL")) x.minLevel = 12;
    for (const x of w.t.roadmapMeasure.filter((x) => x.milestoneId === f1.id && x.kind === "CARDS_AT_LEVEL")) x.minLevel = 10;
    const off = await S.lowerDepthCore(USER, id, 10, "CHOICE", NOW, { ...depsFor(w), env: WRITES_OFF });
    eq("lowering refuses with writes off", errOf(off), ROADMAP_WRITES_OFF);
    w.t.roadmapMilestone.find((m) => m.id === m2.id)!.status = "STARTED";
    const refused = await S.lowerDepthCore(USER, id, 10, "CHOICE", NOW, depsFor(w));
    check("refused while a STARTED Mastered-gate milestone works above the new depth", !refused.ok && /Close or drop milestone 2 first/.test(errOf(refused)), json(refused));
    w.t.roadmapMilestone.find((m) => m.id === m2.id)!.status = "PLANNED";
    const st = await S.startMilestoneCore(USER, f1.id, START_ALL, NOW, depsFor(w));
    check("fixture: Fluent started", st.ok, json(st));
    const goalsBefore = json(w.templates.map((t) => [t.id, t.stated, t.archivedAt]));
    const profOf = () => w.t.readings.filter((x) => x.measureKey.startsWith("PROFICIENCY|"));
    const profBefore = json(profOf());
    const lowered = await S.lowerDepthCore(USER, id, 10, "CHOICE", at(1_000), depsFor(w));
    const r = w.t.roadmap[0];
    const dropped = w.t.roadmapMilestone.find((m) => m.id === m2.id) as MilestoneRec;
    check("with Fluent started and Mastered unstarted, lowering to Fluent sets the depth and drops Mastered (DEPTH_LOWERED)", lowered.ok && r.depth === 10 && dropped.status === "DISCARDED" && (dropped.feasibility as { notes?: string[] }).notes?.includes("DEPTH_LOWERED") === true, json([lowered, r.depth, dropped.status]));
    check("…keeps Fluent's measures, writes no goalMp and touches no goal", measuresOf(w, f1.id).some((x) => x.kind === "CARDS_AT_LEVEL") && json(w.templates.map((t) => [t.id, t.stated, t.archivedAt])) === goalsBefore);
    const rec = w.t.roadmapAcceptance[w.t.roadmapAcceptance.length - 1];
    const end = rec.endState as { measureKey: string }[];
    check("…a new end-state record (acceptances are never updated) at the new depth (`rc` at 10), with the choice for good", rec.version === 1 && rec.previousVersion === 1 && end.every((t) => /\|L10\|rc$/.test(t.measureKey)) && (rec.feasibility as Feasibility).depthChoice?.to === 10 && (rec.feasibility as Feasibility).depthChoice?.reason === "CHOICE", json([end, (rec.feasibility as Feasibility).depthChoice]));
    check("…one rebased Proficiency reading (the day's one row, rewritten over the new end state)", profOf().length === 1 && json(profOf()) !== profBefore, json(profOf()));
    const view = await S.loadRoadmapView(USER, at(2_000), depsFor(w));
    check("…the list shows the dropped stage ('dropped when the depth was lowered') and the Depth line the choice", view.milestones.some((m) => m.id === m2.id && m.state === "DROPPED") && view.depth?.depthChoice?.from === 12, json([view.milestones.map((m) => [m.id === m2.id, m.state]), view.depth?.depthChoice]));
    eq("…the lowering is never an Undo-able acceptance", errOf(await S.undoAcceptCore(USER, id, 1, at(3_000), depsFor(w))), "The depth was lowered on this plan since; re-plan instead.");
    eq("…and a depth below the current one only", errOf(await S.lowerDepthCore(USER, id, 12, "CHOICE", at(4_000), depsFor(w))), "Pick a depth below the current one.");
  }
  {
    // CALIBRATED (F-R4-11): an input the accepted dates assumed is measured now.
    const w = world();
    const id = await accepted(w);
    const acc = w.t.roadmapAcceptance[0];
    const f = acc.feasibility as Feasibility;
    acc.feasibility = { ...f, dateCheck: { ...(f.dateCheck as DateCheck), dateOrigin: { origin: "REALISTIC", calibrating: ["p"] } } };
    const measuredIo = { ...w.io(), throughput: async (_u: string, finalDay: DayKey) => ({ ...S.calibratingThroughput(finalDay), passShare: { kind: "measured" as const, value: 0.76, n: 40 } }) };
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w, { io: measuredIo }));
    const hit = view.triggers.find((t) => t.trigger === "CALIBRATED");
    eq("the roadmap offers to re-date once the pass rate is measured", hit?.line, "Your pass rate is now measured (76%). Re-date the stages you haven't started?");
    const still = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("…not while it is still calibrating", !still.triggers.some((t) => t.trigger === "CALIBRATED"));
    void id;
  }

  console.log("— rev 4: the fix-round carry-overs —");
  {
    // The "opposite state": drop, Start again, unarchive: the dormant copy never reaches the engine and isn't carried into a re-plan.
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    const copyId = await dropAndStartAgain(w, m1);
    goalOf(w, m1.id).archivedAt = null;
    const seen: { where: string; carried: [string | null, DayKey | null][]; lineage: number }[] = [];
    const rp = await S.replanCore(USER, id, "REFIT", at(2_000), depsFor(w, { lanes: spyLanes(w, seen, m1.lineageId) }));
    check("fixture: a re-fit with the original open again", rp.ok, json(rp));
    check("drop → Start again → unarchive: the engine reads one row of that position (the original), never the dormant copy", seen.length > 0 && seen.every((s) => s.lineage === 1 && s.carried.some(([cid]) => cid === m1.id)), json(seen));
    check("…and the re-plan doesn't carry the copy forward", !rowsOf(w, id, 2).some((m) => m.lineageId === m1.lineageId), json(rowsOf(w, id, 2).map((m) => m.lineageId)));
    void copyId;
  }
  {
    // Lines a started milestone covers are in the plan (fix round 2's carry-over): not "Not in this plan yet", and never a second topic.
    const w = world();
    const outline: Intake = { ...INTAKE, syllabus: { lines: ["Conditional probability", "Bayes' theorem"], source: null, lineDomains: ["d-prob", "d-inf"] } };
    const id = await drafted(w, { milestones: [{ domains: ["d-prob"], lines: [0] }, { domains: ["d-inf"] }] }, outline);
    await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
    const [m1] = rowsOf(w, id, 1);
    await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    await S.replanCore(USER, id, "MANUAL", at(1_000), depsFor(w));
    const view = await S.loadRoadmapView(USER, at(2_000), depsFor(w));
    eq("a re-plan's 'Not in this plan yet' leaves out the line the started milestone covers", view.draft?.uncoveredSyllabus, [1]);
    const draftRow = rowsOf(w, id, 2)[0];
    const dup = await S.addItemCore(USER, draftRow.id, { kind: "TOPIC", syllabusRef: 0 }, at(3_000), depsFor(w));
    check("…and [Add as topic] refuses it (already a topic of the plan)", !dup.ok && /already a topic/.test(errOf(dup)), json(dup));
  }
  {
    // A started milestone's check reads its re-fit at Start (fix round 2's carry-over): its StartSnapshot feasibility and start day.
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    const cur = view.current as (typeof view.current & { startFeasibility?: unknown; startedDay?: DayKey | null }) | null;
    check("Now carries the started milestone's re-fit at Start and its start day", cur?.startedDay === TODAY && cur.startFeasibility != null, json([cur?.startedDay, !!cur?.startFeasibility]));
  }
  {
    // The production monitors (F-R4-20): read-only SQL the lead runs.
    check("every production monitor is one read-only SELECT", S.ROADMAP_MONITOR_QUERIES.length >= 12 && S.ROADMAP_MONITOR_QUERIES.every((q) => /^\s*SELECT\b/i.test(q.sql) && !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i.test(q.sql)), json(S.ROADMAP_MONITOR_QUERIES.map((q) => q.name)));
  }

  // ═══ Revision 4 fix round (the three reviews' findings on lane R4; contracts §15.15) ═══
  console.log("— rev 4 fix round: the aim's 'Not now' and [Keep the dates] (§15.10) —");
  {
    // The LATER line's × (lens 3 #9, option (a)): the 'hide:<day>' cookie, read as HIDDEN, so its label is true.
    const jar = new FakeJar();
    const r = await S.hideAimPromptCore(jar, NOW);
    const set = jar.sets[0];
    check(
      "hideAimPrompt writes 'hide:<today>' (maxAge 365 days, path /, lax, httpOnly), no database",
      r.ok && set?.name === AIM_PROMPT_COOKIE && set.value === `hide:${TODAY}` && set.maxAge === 365 * 86_400 && set.path === "/" && set.sameSite === "lax" && set.httpOnly,
      json(set)
    );
    eq("…the invitation reads it as HIDDEN for 4 weeks (no suggestion on /you or Today), then asks again", [aimPromptOf(set?.value, null, TODAY), aimPromptOf(set?.value, null, addDays(TODAY, 27)), aimPromptOf(set?.value, null, addDays(TODAY, 28))], ["HIDDEN", "HIDDEN", "ASK"]);
    eq("…a stored no still wins", aimPromptOf(set?.value, false, TODAY), "OFF");
    check("…its action is a cookie only (no writes-off refusal: it works on any server)", /export async function hideAimPrompt\(\)[\s\S]{0,400}?hideAimPromptCore\(await jarOf\(\), new Date\(\)\)/.test(ACTIONS_SRC) && !/STUB: lane R4 implements/.test(SERVER_SRC + ACTIONS_SRC));
  }
  {
    // [Keep the dates] on the CALIBRATED offer (lens 2 and 3 minor): recorded on the plan, never in a device's localStorage.
    const w = world();
    const id = await accepted(w);
    const acc = w.t.roadmapAcceptance[0];
    const f = acc.feasibility as Feasibility;
    acc.feasibility = { ...f, dateCheck: { ...(f.dateCheck as DateCheck), dateOrigin: { origin: "REALISTIC", calibrating: ["p", "c"] } } };
    const keep = { ...acc, feasibility: null };
    const checkBefore = json({ ...(acc.feasibility as Feasibility).dateCheck, dateOrigin: null });
    const measuredIo = { ...w.io(), throughput: async (_u: string, finalDay: DayKey) => ({ ...S.calibratingThroughput(finalDay), passShare: { kind: "measured" as const, value: 0.76, n: 40 } }) };
    eq("keepCalibratedDates refuses with writes off", errOf(await S.keepCalibratedDatesCore(USER, id, NOW, { ...depsFor(w, { io: measuredIo }), env: WRITES_OFF })), ROADMAP_WRITES_OFF);
    eq("…and with no CALIBRATED offer (nothing assumed is measured yet)", errOf(await S.keepCalibratedDatesCore(USER, id, NOW, depsFor(w))), S.NO_CALIBRATED_OFFER);
    const kept = await S.keepCalibratedDatesCore(USER, id, NOW, depsFor(w, { io: measuredIo }));
    const after = w.t.roadmapAcceptance[0];
    const fa = after.feasibility as Feasibility;
    check("[Keep the dates]: the acceptance's dateOrigin.calibrating loses the input measured now (p), keeps the one still assumed (c)", kept.ok && json(fa.dateCheck?.dateOrigin.calibrating) === json(["c"]) && fa.dateCheck?.dateOrigin.origin === "REALISTIC", json([kept, fa.dateCheck?.dateOrigin]));
    check("…nothing is re-dated and nothing else changes: one record, its end state, dates and verdict as they were", w.t.roadmapAcceptance.length === 1 && json({ ...after, feasibility: null }) === json(keep) && json({ ...fa.dateCheck, dateOrigin: null }) === checkBefore, "");
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w, { io: measuredIo }));
    check("…the offer doesn't come back (on any device: it is the plan's record)", !view.triggers.some((t) => t.trigger === "CALIBRATED") && json(view.header?.dateOrigin?.calibrating) === json(["c"]), json(view.triggers.map((t) => t.trigger)));
    eq("…a second tap has nothing to keep", errOf(await S.keepCalibratedDatesCore(USER, id, at(1_000), depsFor(w, { io: measuredIo }))), S.NO_CALIBRATED_OFFER);
    const d = world();
    const did = await drafted(d);
    check("…a draft roadmap is refused (only an accepted plan has dates to keep)", !(await S.keepCalibratedDatesCore(USER, did, NOW, depsFor(d, { io: measuredIo }))).ok);
  }

  console.log("— rev 4 fix round: coverage frozen at intake (lens 2 major; §15.3) —");
  {
    const many = (dom: string, n: number, level = 3) => Array.from({ length: n }, () => card(dom, level));
    const termOf = (w: FakeWorld, k: number, dom: string) => (w.t.roadmapAcceptance[k]?.endState as EndStateTerm[] | undefined)?.find((t) => t.measureKey.includes(`d:${dom}|`))?.target;
    const covOf = (w: FakeWorld, k: number, dom: string) => ((w.t.roadmapAcceptance[k]?.feasibility as Feasibility | undefined)?.coverage ?? []).find((c) => c.domainId === dom);
    const replanAccept = async (w: FakeWorld, id: string, from: number) => {
      const rp = await S.replanCore(USER, id, "REFIT", at(from), depsFor(w));
      if (!rp.ok) return rp;
      const next = rowsOf(w, id, rp.value.version).find((m) => m.status === "DRAFT");
      if (next) await decideAll(w, id, next.id);
      return S.acceptCore(USER, id, { overAccepted: false }, at(from + 1_000), depsFor(w));
    };
    // 60 recall cards in Probability: n_d = 80% of 60 = 48 at intake.
    const w = world();
    w.tree[0].domains[0].cards = many("d-prob", 60);
    const id = await accepted(w);
    eq("fixture: the first acceptance's n_d is 80% of Probability's 60 recall cards (48)", termOf(w, 0, "d-prob"), 48);
    check("…and the acceptance stores the breakdown it froze (live 60)", covOf(w, 0, "d-prob")?.live === 60, json(covOf(w, 0, "d-prob")));
    w.tree[0].domains[0].cards.splice(0, 20);
    const a2 = await replanAccept(w, id, 10_000);
    check("archive 20 cards → re-plan → accept: n_d stays 48 (the counts at intake), never 32", a2.ok && termOf(w, 1, "d-prob") === 48 && covOf(w, 1, "d-prob")?.live === 60, json([a2, termOf(w, 1, "d-prob"), covOf(w, 1, "d-prob")]));
    const w2 = world();
    w2.tree[0].domains[0].cards = many("d-prob", 60);
    const id2 = await accepted(w2);
    w2.tree[0].domains[0].cards.push(...many("d-prob", 18));
    const b2 = await replanAccept(w2, id2, 10_000);
    check("write 18 cards → re-plan → accept: n_d stays 48, never today's 63", b2.ok && termOf(w2, 1, "d-prob") === 48, json([b2, termOf(w2, 1, "d-prob")]));
    eq("…and no coverage choice appears", (w2.t.roadmapAcceptance[1]?.feasibility as Feasibility | undefined)?.coverageChoices ?? [], []);
    const lowered = await S.lowerDepthCore(USER, id2, 10, "CHOICE", at(20_000), depsFor(w2));
    const last = w2.t.roadmapAcceptance.length - 1;
    check("…a lowered depth keeps n_d too (48 at the new depth), with the frozen breakdown on its record", lowered.ok && termOf(w2, last, "d-prob") === 48 && covOf(w2, last, "d-prob")?.live === 60, json([lowered, termOf(w2, last, "d-prob")]));
    // A typed figure at or above the policy at intake never becomes a false choice when the library grows.
    const w3 = world();
    w3.tree[0].domains[0].cards = many("d-prob", 60);
    const id3 = await drafted(w3, REPLY, { ...INTAKE, coverage: { "d-prob": 50 } });
    await decideAll(w3, id3, rowsOf(w3, id3, 1).find((m) => m.status === "DRAFT")!.id);
    const c3 = await S.acceptCore(USER, id3, { overAccepted: false }, NOW, depsFor(w3));
    w3.tree[0].domains[0].cards.push(...many("d-prob", 18));
    const c3b = await replanAccept(w3, id3, 10_000);
    check("a typed 50 (at intake's policy 48: not a choice) stays no choice after 18 more cards (today's policy 63)", c3.ok && c3b.ok && termOf(w3, 1, "d-prob") === 50 && ((w3.t.roadmapAcceptance[1]?.feasibility as Feasibility).coverageChoices ?? []).length === 0, json((w3.t.roadmapAcceptance[1]?.feasibility as Feasibility | undefined)?.coverageChoices));
    // A policy that moves under an unchanged typed figure (the user's own line Domains) makes no false "your choice";
    // a figure typed anew below the policy is one, dated the day it was typed.
    const w6 = world();
    w6.tree[0].domains[0].cards = many("d-prob", 40);
    const lines = Array.from({ length: 12 }, (_, i) => `Topic ${i + 1}`);
    const id6 = await drafted(w6, REPLY, { ...INTAKE, coverage: { "d-prob": 33 }, syllabus: { lines, source: null, lineDomains: lines.map(() => null) } });
    await decideAll(w6, id6, rowsOf(w6, id6, 1).find((m) => m.status === "DRAFT")!.id);
    const f6 = await S.acceptCore(USER, id6, { overAccepted: false }, NOW, depsFor(w6));
    const r6 = w6.t.roadmap.find((r) => r.id === id6) as RoadmapRec;
    r6.syllabus = { lines, source: null, lineDomains: lines.map(() => "d-prob") };
    const g6 = await replanAccept(w6, id6, 10_000);
    const choices6 = (w6.t.roadmapAcceptance[1]?.feasibility as Feasibility | undefined)?.coverageChoices;
    const cov6 = covOf(w6, 1, "d-prob");
    check("every outline line tied to Probability raises its policy to 36 over the typed 33: no choice recorded (the figure didn't change)", f6.ok && g6.ok && cov6?.policy === 36 && cov6.typed === 33 && (choices6 ?? []).length === 0, json([cov6?.policy, choices6]));
    r6.coverage = { "d-prob": 30 };
    const h6 = await replanAccept(w6, id6, 3 * 86_400_000);
    eq("…typing 30 afterwards is the user's choice, dated that day", [h6.ok, (w6.t.roadmapAcceptance[2]?.feasibility as Feasibility | undefined)?.coverageChoices], [true, [{ domainId: "d-prob", policy: 36, typed: 30, day: addDays(TODAY, 3) }]]);
    // A typed figure below the policy is a choice, recorded once, its day kept.
    const w4 = world();
    w4.tree[0].domains[0].cards = many("d-prob", 60);
    const id4 = await drafted(w4, REPLY, { ...INTAKE, coverage: { "d-prob": 40 } });
    await decideAll(w4, id4, rowsOf(w4, id4, 1).find((m) => m.status === "DRAFT")!.id);
    await S.acceptCore(USER, id4, { overAccepted: false }, NOW, depsFor(w4));
    const later = 3 * 86_400_000;
    const d4 = await replanAccept(w4, id4, later);
    eq("a typed 40 under the policy 48 is a coverage choice, its day kept through a re-plan days later", [d4.ok, (w4.t.roadmapAcceptance[1]?.feasibility as Feasibility | undefined)?.coverageChoices], [true, [{ domainId: "d-prob", policy: 48, typed: 40, day: TODAY }]]);
    // The first acceptance freezes to the counts the draft's rows were built from, not the library on the day of the tap.
    const w5 = world();
    w5.tree[0].domains[0].cards = many("d-prob", 60);
    const id5 = await drafted(w5);
    const draftLive = rowsOf(w5, id5, 1)
      .map((m) => (m.feasibility as { coverage?: { domainId: string; live: number }[] } | null)?.coverage?.find((c) => c.domainId === "d-prob")?.live)
      .find((x) => x != null);
    eq("a draft's rows carry the coverage they were built from (live 60): the first acceptance freezes to it", draftLive, 60);
    await decideAll(w5, id5, rowsOf(w5, id5, 1).find((m) => m.status === "DRAFT")!.id);
    w5.tree[0].domains[0].cards.push(...many("d-prob", 18));
    const e5 = await S.acceptCore(USER, id5, { overAccepted: false }, NOW, depsFor(w5));
    check("cards written between the draft and the first accept: n_d is the draft's (48), so the end state equals the final stage's terms", e5.ok && termOf(w5, 0, "d-prob") === 48 && covOf(w5, 0, "d-prob")?.live === 60, json([termOf(w5, 0, "d-prob"), covOf(w5, 0, "d-prob")]));
  }

  console.log("— rev 4 fix round: clean entry in the planning context (§15.1) —");
  {
    const w = world();
    w.tree[0].domains[0].cards.push({ ...card("d-prob", 12), id: "c-retry" }, { ...card("d-prob", 12), id: "c-clean" }, { ...card("d-prob", 11), id: "c-eleven" }, { ...card("d-prob", 12), id: "c-multi", type: "MULTI" });
    w.reviews = {
      "c-retry": [
        { day: addDays(TODAY, -61), detail: "strike · L11" },
        { day: addDays(TODAY, -60), detail: "advanced · L11→12" },
      ],
      "c-clean": [{ day: addDays(TODAY, -60), detail: "advanced · L11→12" }],
    };
    const seen: CardState[][] = [];
    const spy = { ...lanesFor(w), stageLadderOf: ((intake, input, names, makeId) => (seen.push(input.scopes.find((sc) => sc.domainIds.includes("d-prob"))?.cards ?? []), lanesFor(w).stageLadderOf!(intake, input, names, makeId))) as RoadmapLanes["stageLadderOf"] };
    const r = await S.saveIntakeCore(USER, INTAKE, NOW, depsFor(w, { lanes: spy }));
    const read = w.reviewReads[0];
    check(
      "planContext reads the REVIEW rows of the recall cards at exactly the depth (12), once, over retryReadDaysOf(12, m)",
      r.ok && w.reviewReads.length === 1 && json([...read.ids].sort()) === json(["c-clean", "c-retry"]) && read.from === addDays(TODAY, -retryReadDaysOf(12, 1)),
      json(w.reviewReads)
    );
    const at12 = (seen[0] ?? []).filter((c) => c.level === 12 && c.recall !== false);
    check("…the card that entered level 12 on a retry carries CardState.retryEntry (R2's held-at-start and dating read it); the clean one doesn't", at12.length === 2 && at12.filter((c) => c.retryEntry === true).length === 1, json(at12));
    const plain = world();
    await S.saveIntakeCore(USER, INTAKE, NOW, depsFor(plain));
    eq("…no read when no card sits at the depth", plain.reviewReads.length, 0);
    const track = world();
    track.tree[0].domains[0].cards.push({ ...card("d-prob", 12), id: "c-t" });
    await S.saveIntakeCore(USER, { ...INTAKE, aim: "Run a 10K", fieldId: null, track: "BODY", domainIds: [] }, NOW, depsFor(track));
    eq("…and none on a track Area (no depth)", track.reviewReads.length, 0);
    eq("…and no acceptance read on a version-0 plan (the intake's preview, a first draft: nothing accepted)", [w.acceptanceReads.length, plain.acceptanceReads.length], [0, 0]);
  }

  console.log("— rev 4 final round: the clean-entry window reads the wider of the acceptance's m and the live one (R1's cleanReadDaysOf) —");
  {
    // A card that entered level 12 on a retry 200 days ago, its interval set under an interval multiplier of 1.5 recorded on
    // the acceptance and since unequipped (live m 1): the live window (184 days) misses both rows, the acceptance's (264) holds them.
    const plan = async (o: { accM: number; liveM?: number; grace?: number; fails?: boolean; cards?: boolean }) => {
      const w = world();
      const id = await accepted(w);
      const acc = w.t.roadmapAcceptance.filter((a) => a.roadmapId === id && a.undoneAt == null).sort((a, b) => b.version - a.version || b.acceptedAt.getTime() - a.acceptedAt.getTime())[0];
      acc.intervalMultiplier = o.accM;
      if (o.cards !== false) w.tree[0].domains[0].cards.push({ ...card("d-prob", 12), id: "c-old" }, { ...card("d-prob", 12), id: "c-first" });
      w.reviews = {
        "c-old": [
          { day: addDays(TODAY, -200), detail: "strike · L11" },
          { day: addDays(TODAY, -199), detail: "advanced · L11→12" },
        ],
        "c-first": [{ day: addDays(TODAY, -199), detail: "advanced · L11→12" }],
      };
      w.reviewReads = [];
      w.acceptanceReads = [];
      w.acceptanceFails = !!o.fails;
      const liveM = o.liveM ?? 1;
      const grace = o.grace ?? 0;
      const io = { ...w.io(), intervalMultiplier: async () => liveM, reachModifiers: async () => ({ intervalMultiplier: liveM, extraStrikes: 0, graceExtraDays: grace }) };
      // Every RealismInput a lane is handed: the d-prob scope's CardStates (CardState.retryEntry is what planContext read).
      const seen: CardState[][] = [];
      const base = lanesFor(w) as Record<string, unknown>;
      const lanes = Object.fromEntries(
        Object.entries(base).map(([k, f]) => [
          k,
          typeof f !== "function"
            ? f
            : (...args: unknown[]) => {
                for (const a of args) {
                  const scopes = a && typeof a === "object" ? (a as { scopes?: { domainIds: string[]; cards: CardState[] }[] }).scopes : undefined;
                  if (Array.isArray(scopes)) seen.push(scopes.find((sc) => sc.domainIds.includes("d-prob"))?.cards ?? []);
                }
                return (f as (...x: unknown[]) => unknown)(...args);
              },
        ])
      ) as Partial<RoadmapLanes>;
      const errors: string[] = [];
      const origError = console.error;
      console.error = (...args: unknown[]) => void errors.push(args.map(String).join(" "));
      let view: Awaited<ReturnType<typeof S.loadRoadmapView>> | null = null;
      let froms: DayKey[] = [];
      let accReads: string[] = [];
      try {
        // The page's read (planContext once), then a re-plan, whose ladder lanes are handed the CardStates.
        view = await S.loadRoadmapView(USER, NOW, depsFor(w, { io, lanes }));
        froms = w.reviewReads.map((r) => r.from);
        accReads = [...w.acceptanceReads];
        await S.replanCore(USER, id, "REFIT", at(1_000), depsFor(w, { io, lanes }));
      } finally {
        console.error = origError;
      }
      const at12 = (seen.find((cs) => cs.some((c) => c.level === 12)) ?? []).filter((c) => c.level === 12);
      return { w, id, view, froms, accReads, retries: at12.filter((c) => c.retryEntry === true).length, at12: at12.length, errors };
    };
    const back = (from: DayKey | undefined) => (from ? daysBetween(from, TODAY) : null);
    const wide = await plan({ accM: 1.5 });
    eq(
      "an acceptance at m 1.5 under a live m of 1: planContext reads the REVIEW rows over retryReadDaysOf(12, 1.5) = 264 days, R1's cleanReadDaysOf(12, 1.5, the live loadout) to the day",
      [wide.froms.map(back), cleanReadDaysOf(12, 1.5, { intervalMultiplier: 1, graceExtraDays: 0 }), retryReadDaysOf(12, 1.5)],
      [[264], 264, 264]
    );
    eq("…the acceptance read once (by the roadmap's id), only because a card sits at the depth", wide.accReads, [wide.id]);
    eq("…so the card that entered 12 on a retry under the old loadout carries CardState.retryEntry; the first-try one doesn't", [wide.at12, wide.retries], [2, 1]);
    const live = await plan({ accM: 1 });
    eq("before this round's read (the live m alone, as an acceptance at m 1 reads): 184 days, both rows missed, the retry entry read clean", [live.froms.map(back), live.at12, live.retries], [[184], 2, 0]);
    const liveWider = await plan({ accM: 1, liveM: 1.5, grace: 2 });
    eq(
      "a live m wider than the acceptance's (1.5 over 1) with grace +2: retryReadDaysOf(12, 1.5, 2) = 268, R1's figure, and the retry entry is read",
      [liveWider.froms.map(back), cleanReadDaysOf(12, 1, { intervalMultiplier: 1.5, graceExtraDays: 2 }), liveWider.retries],
      [[268], 268, 1]
    );
    const grid: string[] = [];
    for (const accM of [1, 1.25, 1.5, Number.NaN, 0])
      for (const liveM of [1, 1.5])
        for (const grace of [0, 2]) {
          const r = await plan({ accM, liveM, grace });
          const want = cleanReadDaysOf(12, accM, { intervalMultiplier: liveM, graceExtraDays: grace });
          if (json(r.froms.map(back)) !== json([want])) grid.push(`acc ${accM} live ${liveM} g${grace}: ${json(r.froms.map(back))} ≠ ${want}`);
        }
    check("the window equals R1's cleanReadDaysOf on every case (acceptance m 1, 1.25, 1.5, NaN, 0 × live m 1, 1.5 × grace 0, 2): one window for the readings, the quests and the plan", grid.length === 0, grid.join("; "));
    const failing = await plan({ accM: 1.5, fails: true });
    check(
      "an unreadable acceptance is logged and the window reads the live m (184 days): the view still loads and never throws",
      json(failing.froms.map(back)) === json([184]) && failing.view != null && failing.errors.some((e) => /acceptance's interval multiplier is unavailable/.test(e)),
      json({ froms: failing.froms, errors: failing.errors.slice(0, 2) })
    );
    const none = await plan({ accM: 1.5, cards: false });
    eq("…and with no card at the depth, neither the acceptance nor the ledger is read", [none.w.acceptanceReads.length, none.w.reviewReads.length], [0, 0]);
    const src = readFileSync(join(process.cwd(), "src/lib/roadmap-server.ts"), "utf8");
    const storeRead = /async acceptanceMultiplier\(userId, roadmapId\) \{[\s\S]{0,400}?\n {2}\},/.exec(src)?.[0] ?? "";
    check(
      "the Prisma store reads the current acceptance as R1 does: the user's roadmap, undone ones skipped, acceptanceOrderBy (newest version, then newest record)",
      /prisma\.roadmapAcceptance\.findFirst\(/.test(storeRead) && /undoneAt: null/.test(storeRead) && /roadmap: \{ userId \}/.test(storeRead) && /orderBy: acceptanceOrderBy\(\)/.test(storeRead),
      storeRead
    );
  }

  console.log("— rev 4 fix round: no model sizes a plan-born task; the monitors (§15.6) —");
  {
    const names = S.ROADMAP_MONITOR_QUERIES.map((q) => q.name);
    const rm = S.ROADMAP_MONITOR_QUERIES.find((q) => q.name === "rm-templates-model-basis");
    check("a monitor finds a plan-born template with a model's words as its 'Why' (expect 0 rows)", !!rm && /"captureKey" LIKE 'rm:%'/.test(rm.sql) && /"gradeSource" = 'AI'/.test(rm.sql) && /"gradeBasis" IS NOT NULL/.test(rm.sql), json(names));
    const tag = S.ROADMAP_MONITOR_QUERIES.find((q) => q.name === "review-level-tag");
    check("…the level-tag monitor leaves out backfill rows (dedupeKey 'bf:…')", !!tag && /"dedupeKey" NOT LIKE 'bf:%'/.test(tag.sql) && /"dedupeKey" IS NULL/.test(tag.sql), tag?.sql ?? "");
  }

  console.log("— rev 4 fix round: one definition each (session picks, production, ranks, gaps not shown) —");
  {
    // Session picks (§15.8, lens 1 minor): lose-8kg with "pregnant" — a cue-less constraint excludes nothing, so Gemini's
    // FULL_ATTEMPT step and PERFORMANCE_CHECK checkpoint wait for the confirm with the practices.
    const pregnant = (w: FakeWorld): Partial<RoadmapLanes> => ({
      ...lanesFor(w),
      validateKeysOnly: ((parsed, c) => {
        const v = lanesFor(w).validateKeysOnly!(parsed, c);
        const last = v.milestones.length - 1;
        const aim = c.intake.aim;
        return {
          ...v,
          milestones: v.milestones.map((m, i) =>
            i !== last
              ? m
              : {
                  ...m,
                  items: [
                    ...m.items,
                    item("STEP", 20, catalogWords("FULL_ATTEMPT", [], aim, "BODY"), { catalogKey: "FULL_ATTEMPT", notes: ["GEMINI_PICK"], lineageId: "lin-full" }),
                    item("CHECKPOINT", 21, catalogWords("PERFORMANCE_CHECK", [], aim, "BODY"), { catalogKey: "PERFORMANCE_CHECK", checkpointKind: "PERFORMANCE_CHECK", notes: ["GEMINI_PICK"], lineageId: "lin-perf" }),
                  ],
                }
          ),
        };
      }) as RoadmapLanes["validateKeysOnly"],
    });
    const lose: Intake = { ...INTAKE, aim: "Lose 8 kg", fieldId: null, track: "BODY", domainIds: [], constraints: "pregnant" };
    const reply = { milestones: [{ practices: [{ name: "a", method: "X" }] }, {}] };
    // Confirm to unlock (contracts §19): the activity itself and the session are gated; the user answers the card first
    // ("Nothing to avoid" on the intake's card), so the picks reach the draft and this second-layer confirm still holds them.
    const draftWith = async (w: FakeWorld, fine = true) => {
      const id = await newDraft(w, lose);
      if (fine) {
        const said = await answerCard(id, depsFor(w), [], { none: true });
        if (!said.ok) throw new Error(`fixture answers: ${said.error}`);
      }
      const tasks: (() => Promise<void> | void)[] = [];
      const claim = await S.claimDraftCore(USER, id, { force: true }, NOW, depsFor(w, { lanes: pregnant(w), defer: (t) => tasks.push(t), callModel: async () => reply, clock: () => NOW }));
      if (!claim.ok) throw new Error(`fixture claim: ${claim.error}`);
      for (const t of tasks) await t();
      return id;
    };
    {
      const g = world();
      const gid = await draftWith(g, false);
      const kinds = rowsOf(g, gid, 1).flatMap((m) => itemsOf(g, m.id)).filter((i) => i.decision !== "REMOVED").map((i) => i.catalogKey);
      check(
        "'pregnant' with no answer: the picked FULL_ATTEMPT step, PERFORMANCE_CHECK checkpoint and Harder session never reach the draft (the gate, whatever the parser read)",
        !kinds.some((k) => k === "FULL_ATTEMPT" || k === "PERFORMANCE_CHECK" || k === "HARDER_SESSION"),
        json(kinds)
      );
    }
    const w = world();
    const id = await draftWith(w);
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    const kinds = view.draft?.sessionPicks?.kinds ?? [];
    // v4 (contracts §20): Gemini picks one practice per stage, its focus; the full attempt and the performance check are the
    // progression's (code's, decided), never a pick, so the confirm lists the picked session alone.
    const rows = rowsOf(w, id, 1).flatMap((m) => itemsOf(w, m.id));
    check(
      "the confirm lists Gemini's picked session (its stage's focus), the constraint quoted; the reply's FULL_ATTEMPT step and PERFORMANCE_CHECK checkpoint never reach the plan as picks (the last stage holds the progression's own, decided)",
      view.draft?.sessionPicks?.decision === "PENDING" &&
        json(kinds) === json(["HARDER_SESSION"]) &&
        view.draft.sessionPicks.constraints === "pregnant" &&
        !rows.some((i) => (i.lineageId === "lin-full" || i.lineageId === "lin-perf") && i.notes.includes("GEMINI_PICK")) &&
        ["FULL_ATTEMPT", "PERFORMANCE_CHECK"].every((k) => itemsOf(w, rowsOf(w, id, 1).slice(-1)[0].id).some((i) => i.catalogKey === k && i.decision === "KEPT" && !i.notes.includes("GEMINI_PICK"))),
      json([view.draft?.sessionPicks, rows.map((i) => [i.catalogKey, i.decision, i.notes])])
    );
    eq("…accept waits for the confirm", errOf(await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w))), S.CONFIRM_PICKS);
    const easy = await S.confirmSessionPicksCore(USER, id, "EASY", NOW, depsFor(w));
    const all = rowsOf(w, id, 1).flatMap((m) => itemsOf(w, m.id));
    check("'Use easy, mobility and technique instead' removes Gemini's picked session", easy.ok && all.filter((i) => i.notes.includes("GEMINI_PICK")).every((i) => i.decision === "REMOVED"), json(all.map((i) => [i.catalogKey, i.decision])));
    check("…the picked practice is replaced by code's safe sessions, and the plan is accepted", all.some((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED" && ["EASY_SESSION", "MOBILITY_SESSION", "TECHNIQUE_SESSION"].includes(i.catalogKey ?? "")) && (await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w))).ok);
    const k = world();
    const kid = await draftWith(k);
    const kept = await S.confirmSessionPicksCore(USER, kid, "KEEP", NOW, depsFor(k));
    check("[Keep them] keeps every pick (CHECKED)", kept.ok && rowsOf(k, kid, 1).flatMap((m) => itemsOf(k, m.id)).filter((i) => i.notes.includes("GEMINI_PICK")).every((i) => i.decision === "CHECKED") && rowsOf(k, kid, 1).flatMap((m) => itemsOf(k, m.id)).some((i) => i.notes.includes("GEMINI_PICK")));
  }
  {
    // Production practice (§15.9): roadmap-catalog practiceRoleOf, catalog type first, then the method.
    const w = world();
    const id = await accepted(w);
    const late = rowsOf(w, id, 1);
    // Fluent and Mastered gates (the fixture's stage measures sit at level 6).
    late.forEach((m, k) => measuresOf(w, m.id).filter((x) => x.kind === "CARDS_AT_LEVEL").forEach((x) => (x.minLevel = k === 0 ? 10 : 12)));
    const setPractices = (patch: Partial<ItemRec>) => {
      for (const m of late) for (const i of itemsOf(w, m.id)) if (i.kind === "PRACTICE") Object.assign(i, patch);
    };
    setPractices({ catalogKey: null, method: "WRITING", label: "My own essays", origin: "USER", decision: "EDITED" });
    const writing = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("a typed WRITING practice from Fluent on is production practice (Paragon isn't closed by it)", !(writing.paragonMissing ?? []).includes("PRODUCTION"), json(writing.paragonMissing));
    setPractices({ catalogKey: "RECALL_DRILLS", method: "DELIBERATE_PRACTICE" });
    const recall = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("…a retrieval type isn't (PRODUCTION names what keeps Paragon closed)", (recall.paragonMissing ?? []).includes("PRODUCTION"), json(recall.paragonMissing));
    check("…one definition: productionFromFluentOf reads practiceRoleOf", /function productionFromFluentOf[\s\S]{0,700}?practiceRoleOf\(i\) === "PRODUCTION"/.test(SERVER_SRC));
  }
  {
    // A PART at the depth (§15.4): the gate two levels below's rank, never the depth's before it is held.
    const partLanes = (w: FakeWorld, depth: 10 | 12): Partial<RoadmapLanes> => {
      const base = lanesFor(w);
      const reshape = (plan: MilestoneDraft[]) =>
        plan.map((m, i) => ({
          ...m,
          stage: (i === 0 ? "PART" : depth === 12 ? "MASTERED" : "FLUENT") as MilestoneDraft["stage"],
          measures: m.measures.map((x) => (x.kind === "CARDS_AT_LEVEL" ? { ...x, minLevel: depth, measureKey: cardsAtLevelKey(x.scope.domainIds ?? [], depth, i === 0 ? "r" : "rc") } : x)),
        }));
      return {
        ...base,
        stageLadderOf: (intake, input, names, makeId) => {
          const res = base.stageLadderOf!(intake, input, names, makeId);
          return res.ok ? { ...res, plan: reshape(res.plan) } : res;
        },
        starterLadder: (intake, input, names, makeId) => reshape(base.starterLadder!(intake, input, names, makeId)),
      };
    };
    const ranksOf = async (depth: 10 | 12) => {
      const w = world();
      const lanes = partLanes(w, depth);
      const id = await newDraft(w, { ...INTAKE, depth });
      const built = await S.buildStarterCore(USER, id, NOW, depsFor(w, { lanes }));
      for (const m of rowsOf(w, id, 1)) await decideAll(w, id, m.id);
      const acc = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w, { lanes }));
      return built.ok && acc.ok ? rowsOf(w, id, 1).map((m) => [m.stage, m.rankIndex]) : [built, acc];
    };
    eq("a PART toward Mastered at a Mastered depth gives Expert (4), Mastered Virtuoso (5)", await ranksOf(12), [["PART", 4], ["MASTERED", 5]]);
    eq("…a PART toward Fluent at a Fluent depth gives Specialist (3), Fluent Expert (4)", await ranksOf(10), [["PART", 3], ["FLUENT", 4]]);
  }
  {
    // Gap names not shown (§15.5): hidden + dropped, one count; the run's facts carry its integrity, its paths made safe.
    const w = world();
    const id = await newDraft(w);
    const integrity: ValidationIntegrity = { verdict: "CLEAN", violations: [], modelChars: 0, gapsKept: 0, gapsHidden: 2, gapsDropped: 3, notANameByClause: { link: 3 } };
    const lanes = { ...lanesFor(w), integrityOf: (() => integrity) as RoadmapLanes["integrityOf"] };
    const tasks: (() => Promise<void> | void)[] = [];
    await S.claimDraftCore(USER, id, { force: true }, NOW, depsFor(w, { lanes, defer: (t) => tasks.push(t), callModel: async () => REPLY, clock: () => NOW }));
    for (const t of tasks) await t();
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    eq("'n not shown' counts every gap name not shown: hidden (2) + dropped (3)", view.draft?.gapsHidden, 5);
    check("…and the run's facts carry the integrity verdict (RunFacts' integrity line, 'Drafted by' by its cause)", view.run?.report?.integrity?.verdict === "CLEAN" && view.run.report.integrity.gapsDropped === 3, json(view.run?.report?.integrity));
    const run = w.t.roadmapRun.find((r) => r.kind === "GEMINI" && r.status === "OK") as RunRec;
    (run.report as ValidationReport).integrity = { ...integrity, verdict: "REJECTED", violations: [{ code: "EXTRA_PROPERTY", path: "stages.buyTheOfficialCourse.kind" }] };
    const again = await S.loadRoadmapView(USER, at(1_000), depsFor(w));
    check("…a stored path is made safe again on read: only schema keys, indexes and '<extra>' reach a view", again.run?.report?.integrity?.violations[0]?.path === "stages.<extra>.kind" && !/buyTheOfficialCourse/.test(json(again)), json(again.run?.report?.integrity));
  }

  console.log("— rev 4 fix round: the view fields R5 read through casts (§15.11) —");
  {
    const w = world();
    w.tree[0].domains[0].cards.push({ ...card("d-prob", 4), type: "MULTI" }, { ...card("d-prob", 4), type: "MULTI" });
    const iv = await S.loadIntakeView(USER, NOW, depsFor(w));
    const prob = iv.fields.find((f) => f.id === "f-stats")?.domains.find((d) => d.id === "d-prob");
    eq("the intake's Domain options count multiple choice apart (nonRecall), as the draft's coverage does", [prob?.cards, prob?.nonRecall], [22, 2]);
    await accepted(w);
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    eq("the header carries the plan's chosen Domains ('Start again at a depth' carries them)", view.header?.domainIds, INTAKE.domainIds);
    const { w: lw } = await legacyWorld();
    const lv = await S.loadRoadmapView(USER, NOW, depsFor(lw));
    check("a legacy plan's banner carries its Domains and Area for the restart handoff", json(lv.legacy?.domainIds) === json(INTAKE.domainIds) && lv.legacy?.areaFieldId === "f-stats", json(lv.legacy));
    check("Now's StartSnapshot fields and the catalog pick are read on the contract (no cast left in roadmap-server)", !/Object\.assign\(view, \{ startFeasibility/.test(SERVER_SRC) && !/catalogKey\?: unknown \}\)\.catalogKey/.test(SERVER_SRC));
  }

  console.log("— rev 4 fix round: the one writer, depth counts, the legacy restart (lens 1, 2, 3) —");
  {
    // The tripwire refuses raw model words and a proposed name on any row; the generic update routes both through it.
    const ctx = { roadmapId: "r1", syllabusLines: [], domainNames: { "d-prob": "Probability" }, rev4: true, track: "FIELD" as const, aim: INTAKE.aim, exam: null, required: ["d-prob"] };
    const base: MilestoneDraft = { id: null, lineageId: "l1", version: 1, ord: 1, title: "Fluent: Probability to level 10+", titleOrigin: CODE_ORIGIN, titleDecision: "PENDING", windowStart: TODAY, dueDay: addDays(TODAY, 60), status: "DRAFT", rankIndex: null, overAccepted: false, items: [], measures: [], notes: [], stage: "FLUENT" };
    const throws = (plan: MilestoneDraft[]) => {
      try {
        S.writeRoadmapRows([], { kind: "DRAFT", roadmapId: "r1", version: 1, plan, feasibility: null, now: NOW, makeId: () => globalThis.crypto.randomUUID() }, ctx);
        return null;
      } catch (err) {
        return err instanceof S.ModelTextError ? err.message : `other: ${String(err)}`;
      }
    };
    const okPractice = item("PRACTICE", 1, String(catalogLabelOf("RECALL_DRILLS", { track: "FIELD", domains: [domainName({ id: "d-prob", name: "Probability" })] })), { catalogKey: "RECALL_DRILLS", domainId: "d-prob" });
    eq("fixture: a code-worded practice passes", throws([{ ...base, items: [okPractice] }]), null);
    check("a row keeping raw model words (rawLabel) is refused", /raw model words/.test(throws([{ ...base, items: [{ ...okPractice, rawLabel: "Buy the official book" }] }]) ?? ""));
    check("…and a row with a proposed name (rendered for a DOMAIN with no Domain)", /proposed name/.test(throws([{ ...base, items: [item("DOMAIN", 1, "Probability", { origin: "GEMINI", domainId: "d-prob", notes: ["NOT_CHOSEN"], proposedName: "Stochastic calculus" })] }]) ?? ""));
    check("…and a suggestion row too", /raw model words/.test(throws([{ ...base, items: [okPractice, item("GAP", 2, "Risk theory", { origin: "GEMINI", rawLabel: "Risk theory, per the CFA" })] }]) ?? ""));
    check("the generic row update sends proposedName and rawLabel through the writer (TEXT_FIELDS)", /const TEXT_FIELDS[^\n]*"proposedName"[^\n]*"rawLabel"/.test(SERVER_SRC));
  }
  {
    // addItem: a Domain on a depth plan is refused (pinned in the drafting section); a legacy life-track plan is replaced.
    const w = world();
    const trackIntake: Intake = { ...INTAKE, aim: "Run a 10K", fieldId: null, track: "BODY", domainIds: [] };
    // Contracts §19 (decision 1): a BODY plan asks whatever the words, so the user's "Nothing to avoid" comes first.
    const id = await drafted(w, { milestones: [{ practices: [{ name: "a", method: "X" }] }, { practices: [{ name: "b", method: "X" }] }] }, trackIntake, true);
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
    check("fixture: an accepted life-track plan", acc.ok, json(acc));
    for (const m of rowsOf(w, id)) m.stage = null;
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("…made before revision 4 (rows with no stage): legacy, with no Area Field on its banner", view.legacy != null && view.legacy.areaFieldId == null, json(view.legacy));
    const again = await S.saveIntakeCore(USER, { ...trackIntake, aim: "Run a 10K, planned again", replaces: id }, NOW, depsFor(w));
    const old = w.t.roadmap.find((r) => r.id === id) as RoadmapRec;
    check("'Start again at a depth' replaces a legacy life-track plan (no dead end): one new DRAFT, the old one archived", again.ok && old.status === "ARCHIVED" && old.archiveReason === S.replacedReasonOf(TODAY) && w.t.roadmap.filter((r) => r.status === "DRAFT").length === 1, json([again, old.status]));
    const w2 = world();
    const id2 = await accepted(w2);
    const rev4 = await S.saveIntakeCore(USER, { ...INTAKE, aim: "Again", replaces: id2 }, NOW, depsFor(w2));
    check("…a plan aimed at a depth is never replaced this way", !rev4.ok && /Only a plan made before/.test(errOf(rev4)) && w2.t.roadmap.length === 1, json(rev4));
  }
  {
    // draftFromReply: the one step, exported and called by runDraftCore, reuseRun and hostileViewsOf (§15.12).
    const calls = (SERVER_SRC.match(/\bdraftFromReply\(/g) ?? []).length;
    check("draftFromReply is exported and called by runDraftCore, reuseRun and hostileViewsOf", /export function draftFromReply\b/.test(SERVER_SRC) && calls >= 4, `${calls} occurrences`);
    for (const fn of ["export async function runDraftCore", "async function reuseRun", "export function hostileViewsOf"]) {
      const start = SERVER_SRC.indexOf(fn);
      const body = start >= 0 ? SERVER_SRC.slice(start, SERVER_SRC.indexOf("\n}\n", start)) : "";
      check(`…${fn.split(" ").pop()} walks and validates only through it (no integrityFor or planFromReply of its own)`, /draftFromReply\(/.test(body) && !/\bintegrityFor\(|\bplanFromReply\(/.test(body), fn);
    }
  }

  // ═══ Revision 4 fix round 2 (the re-review's findings on lane R4; contracts §16.9) ═══
  console.log("— rev 4 fix round 2: a redraft's stage targets read the counts frozen at intake (§16.9) —");
  {
    const many = (dom: string, n: number, level = 3) => Array.from({ length: n }, () => card(dom, level));
    type Counts = readonly { id: string; live: number; nonRecall: number }[];
    /**
     * R2's documented contract (StageLadderOpts.counts) on the fixture ladder: the final stage's per-Domain target is
     * coverageOf's n at the depth (`rc`) over the counts it is given, else over today's library.
     */
    const countedLadder = (w: FakeWorld, seen: (Counts | null)[]): RoadmapLanes["stageLadderOf"] => (intake, input, names, makeId, opts) => {
      seen.push(opts?.counts ?? null);
      const fx = lanesFor(w);
      const res = fx.stageLadderOf!(intake, input, names, makeId);
      if (!res.ok) return res;
      const library = w.tree.flatMap((f) => f.domains);
      const counts: Counts = opts?.counts ?? intake.domainIds.map((id) => ({ id, live: library.find((d) => d.id === id)?.cards.length ?? 0, nonRecall: 0 }));
      const lines = intake.syllabus?.lines ?? [];
      const cov = fx.coverageOf!({ domains: counts.map((c) => ({ id: c.id, name: "", live: c.live, nonRecall: c.nonRecall })), lineDomains: lines.map((_, i) => intake.syllabus?.lineDomains?.[i] ?? null), typed: intake.coverage ?? null });
      const depth = intake.depth ?? 12;
      const last = res.plan.length - 1;
      const plan = res.plan.map((m, i) =>
        i < last
          ? m
          : {
              ...m,
              measures: m.measures.map((x) => {
                const d = x.scope.domainIds?.[0];
                const c = cov.find((y) => y.domainId === d);
                return x.kind === "CARDS_AT_LEVEL" && d && c ? { ...x, minLevel: depth, target: c.n, targetSource: "DEPTH" as const, measureKey: cardsAtLevelKey([d], depth, "rc") } : x;
              }),
            }
      );
      return { ...res, plan };
    };
    const endOf = (w: FakeWorld, k: number) => (w.t.roadmapAcceptance[k]?.endState as EndStateTerm[] | undefined)?.find((t) => t.measureKey.includes("d:d-prob|"))?.target;
    /** The final scheduled stage's Probability measure in a version (the depth's terms). */
    const finalOf = (w: FakeWorld, id: string, version: number) => {
      const rows = rowsOf(w, id, version).filter((m) => m.status !== "LATER");
      const final = rows[rows.length - 1];
      return final ? measuresOf(w, final.id).find((x) => x.kind === "CARDS_AT_LEVEL" && (x.measureKey ?? "").includes("d:d-prob|"))?.target : undefined;
    };
    const acceptDraft = async (w: FakeWorld, id: string, version: number, from: number, deps: RoadmapDeps) => {
      const next = rowsOf(w, id, version).find((m) => m.status === "DRAFT");
      if (next) await decideAll(w, id, next.id);
      return S.acceptCore(USER, id, { overAccepted: false }, at(from), deps);
    };

    // [Use the realistic date] on an ACTIVE plan's re-plan, after archiving 20 of Probability's 60 recall cards.
    const w = world();
    w.tree[0].domains[0].cards = many("d-prob", 60);
    const id = await accepted(w);
    eq("fixture: the accepted end state holds n_d 48 for Probability's 60 recall cards", endOf(w, 0), 48);
    w.tree[0].domains[0].cards.splice(0, 20);
    const seen: (Counts | null)[] = [];
    const deps = depsFor(w, { lanes: { ...lanesFor(w), stageLadderOf: countedLadder(w, seen) } });
    const rp = await S.replanCore(USER, id, "REFIT", at(1_000), deps);
    const used = await S.applyRemedyCore(USER, id, "USE_REALISTIC_DATE", at(2_000), deps);
    check(
      "archive 20 cards → re-plan → [Use the realistic date] on the ACTIVE plan: the redrafted final stage asks for the end state's 48, never today's 32",
      rp.ok && used.ok && finalOf(w, id, 2) === 48,
      json([rp, used, finalOf(w, id, 2)])
    );
    check("…the ladder is given the counts frozen at intake (Probability live 60, not 40)", seen.length > 0 && seen.every((c) => c?.find((x) => x.id === "d-prob")?.live === 60), json(seen));
    const a2 = await acceptDraft(w, id, 2, 3_000, deps);
    check("…and once accepted, the end state and the final stage agree (48 = 48): the aim is reached when its last milestone is", a2.ok && endOf(w, 1) === 48 && finalOf(w, id, 2) === endOf(w, 1), json([a2, endOf(w, 1), finalOf(w, id, 2)]));

    // The same after writing 18 more (today's library would ask for 62).
    const w2 = world();
    w2.tree[0].domains[0].cards = many("d-prob", 60);
    const id2 = await accepted(w2);
    w2.tree[0].domains[0].cards.push(...many("d-prob", 18));
    const seen2: (Counts | null)[] = [];
    const deps2 = depsFor(w2, { lanes: { ...lanesFor(w2), stageLadderOf: countedLadder(w2, seen2) } });
    await S.replanCore(USER, id2, "REFIT", at(1_000), deps2);
    const used2 = await S.applyRemedyCore(USER, id2, "USE_REALISTIC_DATE", at(2_000), deps2);
    check(
      "write 18 cards → re-plan → [Use the realistic date]: the final stage asks for 48, never more than the aim (today's 63)",
      used2.ok && finalOf(w2, id2, 2) === 48 && coveragePolicyOf(78, 0).n !== 48,
      json([used2, finalOf(w2, id2, 2), coveragePolicyOf(78, 0).n])
    );

    // A line's Domain set on an ACTIVE plan (a MANUAL re-plan of the unstarted stages), after archiving 20.
    const w3 = world();
    w3.tree[0].domains[0].cards = many("d-prob", 60);
    const outline: Intake = { ...INTAKE, syllabus: { lines: ["Conditional probability"], source: null, lineDomains: [null] } };
    const id3 = await drafted(w3, REPLY, outline);
    await decideAll(w3, id3, rowsOf(w3, id3, 1).find((m) => m.status === "DRAFT")!.id);
    const a3 = await S.acceptCore(USER, id3, { overAccepted: false }, NOW, depsFor(w3));
    w3.tree[0].domains[0].cards.splice(0, 20);
    const seen3: (Counts | null)[] = [];
    const deps3 = depsFor(w3, { lanes: { ...lanesFor(w3), stageLadderOf: countedLadder(w3, seen3) } });
    const set3 = await S.setLineDomainCore(USER, id3, 0, "d-prob", at(1_000), deps3);
    const frozenWant = coveragePolicyOf(60, 1).n;
    check(
      "archive 20 → a line's Domain set on the ACTIVE plan: the re-plan's final stage reads the frozen 60 cards with the line now tied (n_d from 60, not 40)",
      a3.ok && set3.ok && finalOf(w3, id3, 2) === frozenWant && frozenWant !== coveragePolicyOf(40, 1).n,
      json([a3, set3, finalOf(w3, id3, 2), frozenWant, coveragePolicyOf(40, 1).n])
    );
    const b3 = await acceptDraft(w3, id3, 2, 2_000, deps3);
    check("…accepted, its end state is that same target", b3.ok && endOf(w3, 1) === finalOf(w3, id3, 2), json([b3, endOf(w3, 1), finalOf(w3, id3, 2)]));

    // The additions' date effect reads R's frozen counts and each added Domain's own cards.
    const w4 = world();
    w4.tree[0].domains.push({ id: "d-comb", name: "Combinatorics", fieldId: "f-stats", cards: many("d-comb", 30) });
    await drafted(w4, { milestones: [{ domains: ["d-prob"], needs: ["d-comb"] }, { domains: ["d-inf"] }] });
    w4.tree[0].domains[0].cards.push(...many("d-prob", 18));
    const effects: { intake: string[]; add: string[]; counts: Counts | null; added: number }[] = [];
    const lanes4: Partial<RoadmapLanes> = {
      ...lanesFor(w4),
      dateEffectOf: (intake, input, add, counts) => {
        effects.push({ intake: [...intake.domainIds], add: [...add], counts: counts ?? null, added: input.scopes.filter((sc) => sc.domainIds.includes("d-comb")).flatMap((sc) => sc.cards).length });
        return lanesFor(w4).dateEffectOf!(intake, input, add, counts);
      },
    };
    const v4 = await S.loadRoadmapView(USER, NOW, depsFor(w4, { lanes: lanes4 }));
    check(
      "the additions' date effect is given R and its counts frozen at the draft (Probability live 20, not today's 38) as its 4th argument, and the added Domain's own 30 cards",
      (v4.draft?.additions ?? []).length === 1 && effects.length === 1 && json(effects[0].intake) === json(INTAKE.domainIds) && json(effects[0].add) === json(["d-comb"]) && effects[0].counts?.find((c) => c.id === "d-prob")?.live === 20 && effects[0].added === 30,
      json(effects)
    );
  }

  console.log("— rev 4 fix round 2: Plan history keys 'depth lowered' on the record (§16.2) —");
  {
    const replanAccept = async (w: FakeWorld, id: string, from: number) => {
      const rp = await S.replanCore(USER, id, "REFIT", at(from), depsFor(w));
      if (!rp.ok) return rp;
      const next = rowsOf(w, id, rp.value.version).find((m) => m.status === "DRAFT");
      if (next) await decideAll(w, id, next.id);
      return S.acceptCore(USER, id, { overAccepted: false }, at(from + 1_000), depsFor(w));
    };
    // accept → re-plan → accept → Undo → accept again → lower the depth.
    const w = world();
    const id = await accepted(w);
    const a2 = await replanAccept(w, id, 10_000);
    const undo = await S.undoAcceptCore(USER, id, 2, at(20_000), depsFor(w));
    const again = await S.acceptCore(USER, id, { overAccepted: false }, at(30_000), depsFor(w));
    const low = await S.lowerDepthCore(USER, id, 10, "CHOICE", at(40_000), depsFor(w));
    check("fixture: accepted, re-planned, undone, accepted again, then lowered", a2.ok && undo.ok && again.ok && low.ok, json([a2, undo, again, low]));
    const hist = (await S.loadRoadmapView(USER, at(50_000), depsFor(w))).history;
    eq(
      "Plan history [v1, v2 undone, v2, v2 lowered]: the re-accept of the same version lowered nothing; the lowering is flagged from its record",
      hist.map((h) => [h.version, h.undone, h.depthLowered]),
      [
        [1, false, false],
        [2, true, false],
        [2, false, false],
        [2, false, true],
      ]
    );
    eq("…the lowering reads in R1's words (depthChangeLineOf)", hist[3]?.changes, ["lowered the depth Mastered → Fluent"]);
    check("…and the re-accept reads as the re-plan's end-target changes, never as a depth line", !(hist[2]?.changes ?? []).some((c) => /depth/.test(c)), json(hist[2]?.changes));
    // Undo, then lower: the lowering of version 1 still reads as one.
    const u = world();
    const uid = await accepted(u);
    await replanAccept(u, uid, 10_000);
    const undo2 = await S.undoAcceptCore(USER, uid, 2, at(20_000), depsFor(u));
    const low2 = await S.lowerDepthCore(USER, uid, 10, "CHOICE", at(30_000), depsFor(u));
    const hist2 = (await S.loadRoadmapView(USER, at(40_000), depsFor(u))).history;
    eq(
      "Undo → lower the depth: [v1, v2 undone, v1 lowered], the lowering against v1's end state",
      [undo2.ok, low2.ok, hist2.map((h) => [h.version, h.undone, h.depthLowered]), hist2[2]?.changes],
      [
        true,
        true,
        [
          [1, false, false],
          [2, true, false],
          [1, false, true],
        ],
        ["lowered the depth Mastered → Fluent"],
      ]
    );
  }

  console.log("— rev 4 fix round 2: the Aim card's legacy facts; the depth to R1's ranks (§16.3, §16.9) —");
  {
    const { w } = await legacyWorld();
    const card = await S.loadAimCard(USER, NOW, depsFor(w));
    check(
      "a legacy plan's Aim card carries its LegacyView: Gemini's wording hidden, and its Domains and Area for 'Start again at a depth'",
      card?.legacy === true && card.legacyView?.geminiHidden === true && json(card.legacyView?.domainIds) === json(INTAKE.domainIds) && card.legacyView?.areaFieldId === "f-stats" && card.legacyView?.kind === "ACTIVE",
      json(card?.legacyView)
    );
    const w2 = world();
    await accepted(w2);
    const card2 = await S.loadAimCard(USER, NOW, depsFor(w2));
    check("…a plan at a depth carries none", card2?.legacy === false && card2.legacyView == null, json([card2?.legacy, card2?.legacyView]));
  }
  {
    const w = world();
    const depths: unknown[] = [];
    const lanes: Partial<RoadmapLanes> = { ...lanesFor(w), assignRankIndices: ((rows, first, depth) => (depths.push(depth), R1.assignRankIndices(rows, first, depth))) as RoadmapLanes["assignRankIndices"] };
    const id = await drafted(w);
    await decideAll(w, id, rowsOf(w, id, 1).find((m) => m.status === "DRAFT")!.id);
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w, { lanes }));
    check("acceptCore gives R1's assignRankIndices the plan's depth (12) as its third argument", acc.ok && json(depths) === json([12]), json([acc, depths]));
  }

  console.log("— rev 4 fix round 2: code labels name R only, never a pending Gemini addition (lens 1 minor; F-R4-21) —");
  {
    /** R2's naming on the fixture, as roadmap-realism's fitDepth does it: every code-written catalog label over the row's live DOMAIN items (seen: the names each row offered). */
    const naming = (w: FakeWorld, seen: string[][]): Partial<RoadmapLanes> => {
      const fx = lanesFor(w);
      return {
        ...fx,
        fitPlan: (plan, input, opts) =>
          fx.fitPlan!(plan, input, opts).map((m) => {
            const domains = m.items
              .filter((i) => i.kind === "DOMAIN" && i.decision !== "REMOVED" && i.domainId)
              .sort((a, b) => a.ord - b.ord)
              .map((i) => domainName({ id: i.domainId as string, name: i.label }));
            seen.push(domains.map(String));
            return {
              ...m,
              items: m.items.map((i) => {
                const entry = i.catalogKey ? catalogEntryOf(i.catalogKey) : null;
                if (!entry || i.origin !== CODE_ORIGIN || (i.decision !== "PENDING" && i.decision !== "KEPT") || !entry.template.includes("{domains}") || domains.length === 0) return i;
                try {
                  return { ...i, label: String(catalogLabelOf(entry.key, { track: "FIELD", domains })) };
                } catch {
                  return i;
                }
              }),
            };
          }),
      };
    };
    const reply = { milestones: [{ domains: ["d-prob"], practices: [{ name: "a", method: "X" }], steps: [{ title: "s" }], needs: ["d-comb"] }, { domains: ["d-inf"], practices: [{ name: "b", method: "X" }] }] };
    const draftWith = async (w: FakeWorld, seen: string[][]) => {
      w.tree[0].domains.push({ id: "d-comb", name: "Combinatorics", fieldId: "f-stats", cards: [card("d-comb", 3)] });
      const id = await newDraft(w);
      const tasks: (() => Promise<void> | void)[] = [];
      const claim = await S.claimDraftCore(USER, id, { force: true }, NOW, depsFor(w, { lanes: naming(w, seen), defer: (t) => tasks.push(t), callModel: async () => reply, clock: () => NOW }));
      if (!claim.ok) throw new Error(`fixture claim: ${claim.error}`);
      for (const t of tasks) await t();
      return id;
    };
    const rowItems = (w: FakeWorld, id: string) => rowsOf(w, id, 1).flatMap((m) => itemsOf(w, m.id));
    const codeLabels = (w: FakeWorld, id: string) => rowItems(w, id).filter((i) => i.catalogKey && i.decision !== "REMOVED").map((i) => i.label);
    const w = world();
    const seen: string[][] = [];
    const id = await draftWith(w, seen);
    const waiting = rowItems(w, id).filter((i) => i.domainId === "d-comb");
    check("fixture: Gemini's addition waits on the kept rows (GEMINI, PENDING, NOT_CHOSEN), back in place after R2's step", waiting.length > 0 && waiting.every((i) => i.origin === "GEMINI" && i.decision === "PENDING" && i.notes.includes("NOT_CHOSEN")), json(waiting.map((i) => [i.decision, i.notes])));
    check(
      "R2's naming step never sees a pending addition as one of the row's Domains, so no code label names it",
      seen.length > 0 && !seen.some((d) => d.includes("Combinatorics")) && codeLabels(w, id).length > 0 && !codeLabels(w, id).some((l) => /Combinatorics/.test(l)),
      json([seen, codeLabels(w, id)])
    );
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w, { lanes: naming(w, []) }));
    const viewLabels = (view.draft?.milestones ?? []).flatMap((m) => m.items.filter((i) => i.kind !== "DOMAIN").map((i) => i.label));
    check("…the draft view's rows name none of it either, while its additions row offers it", (view.draft?.additions ?? []).some((a) => a.domainId === "d-comb") && viewLabels.length > 0 && !viewLabels.some((l) => /Combinatorics/.test(l)), json(viewLabels));
    const leave = await S.confirmDomainAdditionsCore(USER, id, 1, [], NOW, depsFor(w, { lanes: naming(w, []) }));
    check(
      "[Leave out]: the addition REMOVED on every row, and every code label still names R only",
      leave.ok && rowItems(w, id).filter((i) => i.domainId === "d-comb").every((i) => i.decision === "REMOVED") && !codeLabels(w, id).some((l) => /Combinatorics/.test(l)),
      json([leave, codeLabels(w, id)])
    );
    const w2 = world();
    const id2 = await draftWith(w2, []);
    const add = await S.confirmDomainAdditionsCore(USER, id2, 1, ["d-comb"], NOW, depsFor(w2, { lanes: naming(w2, []) }));
    check(
      "[Add]: the redraft re-renders the code labels over R as it now stands (Combinatorics named once it is the user's)",
      add.ok && rowItems(w2, id2).filter((i) => i.domainId === "d-comb" && i.kind === "DOMAIN").every((i) => i.decision === "CHECKED") && codeLabels(w2, id2).some((l) => /Combinatorics/.test(l)),
      json([add, codeLabels(w2, id2)])
    );
    // A structural edit while the addition waits (Remove a practice: the draft is re-fitted) keeps it hidden from the naming too.
    const w3 = world();
    const seen3: string[][] = [];
    const id3 = await draftWith(w3, seen3);
    const practice = rowItems(w3, id3).find((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED") as ItemRec;
    seen3.length = 0;
    const removed = await S.decideItemCore(USER, practice.id, "REMOVED", NOW, depsFor(w3, { lanes: naming(w3, seen3) }));
    check(
      "…and a re-fit after an edit (Remove a practice) never names the waiting Domain, which stays PENDING",
      removed.ok && seen3.length > 0 && !seen3.some((d) => d.includes("Combinatorics")) && !codeLabels(w3, id3).some((l) => /Combinatorics/.test(l)) && rowItems(w3, id3).filter((i) => i.domainId === "d-comb").every((i) => i.decision === "PENDING"),
      json([removed, seen3, codeLabels(w3, id3)])
    );
  }

  console.log("— rev 4 fix round 2: Start → R6's week quests, a round trip (lens 2 gap 8) —");
  {
    const QS = await import("../src/lib/roadmap-quests-server");
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    const store = questStoreOf(w);
    const lanes: Partial<RoadmapLanes> = {
      ...lanesFor(w),
      weekQuestSetFor: (userId, milestoneId, weekStart, now, opts) => QS.weekQuestSetFor(userId, milestoneId, weekStart, now, { ...opts, store, env: WRITES_ON }),
      loadWeekQuests: (userId, now) => QS.loadWeekQuests(userId, now, { store, env: WRITES_ON }),
    };
    const st = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w, { lanes }));
    const frozen = w.t.questWeeks.filter((q) => q.milestoneId === m1.id);
    const set = frozen[0]?.set;
    check(
      "Start freezes R6's set for the started milestone and this life week (source START), built from what Start writes",
      st.ok && frozen.length === 1 && frozen[0].source === "START" && set?.weekStart === weekStartKeyOf(TODAY) && set.milestoneId === m1.id && set.quests.length > 0,
      json([st, frozen.map((q) => [q.source, q.set?.weekStart, q.set?.quests.length])])
    );
    const load = await QS.loadWeekQuests(USER, at(60_000), { store, env: WRITES_ON });
    check(
      "…R6's loader reads it back as the open milestone's frozen set (the same quests), with the StartSnapshot R4 stored",
      load?.frozen === true && load.set.milestoneId === m1.id && json(load.set.quests) === json(set?.quests) && load.viewInput.passRate != null && load.viewInput.milestone.ord === 1,
      json(load ? { frozen: load.frozen, milestoneId: load.set.milestoneId, passRate: load.viewInput.passRate } : null)
    );
    const card = await S.loadAimCard(USER, at(60_000), depsFor(w, { lanes }));
    check("…the Aim card counts those quests (0 of n done) and knows the week is frozen", card?.weekQuests?.total === set?.quests.length && card?.weekQuests?.done === 0 && card.questWeekUnfrozen === false, json([card?.weekQuests, card?.questWeekUnfrozen]));
  }

  console.log("— rev 4 finishing round: Start counts each card key as it counts (R6 → R4, contracts §17.3) —");
  {
    // Probability holds 12 recall cards at level 6+ and, here, 3 multiple-choice cards at or above L (6, 9 and 12). A depth
    // key (`r`, `rc`) never counts multiple choice, so Start's reading and its v0 (the RAISE floor b0 = max(v0, baseline))
    // must be 12, not 15. An `rc` key's first reading is R1's (clean entry needs the ledger), so Start writes none for it.
    const mc = (level: number) => ({ ...card("d-prob", level), type: "MULTI" });
    const startWith = async (segments: { prob: "r" | "rc" | null; inf: "r" | "rc" | null }) => {
      const w = world();
      w.tree[0].domains[0].cards.push(mc(6), mc(9), mc(12));
      const id = await accepted(w);
      const [m1] = rowsOf(w, id, 1);
      const keyOf = (d: string, seg: "r" | "rc" | null) => cardsAtLevelKey([d], 6, seg);
      const keys = { prob: keyOf("d-prob", segments.prob), inf: keyOf("d-inf", segments.inf) };
      for (const x of measuresOf(w, m1.id)) {
        const d = (x.scope as { domainIds?: string[] } | null)?.domainIds;
        if (x.kind !== "CARDS_AT_LEVEL" || d?.length !== 1) continue;
        if (d[0] === "d-prob") Object.assign(x, { measureKey: keys.prob, minLevel: 6 });
        if (d[0] === "d-inf") Object.assign(x, { measureKey: keys.inf, minLevel: 6 });
      }
      // Today's readings from accept are cleared, so every reading of these keys below is Start's own.
      w.t.readings = w.t.readings.filter((r) => r.measureKey !== keys.prob && r.measureKey !== keys.inf);
      const seen: { source: string; overrides: Record<string, unknown> }[] = [];
      const fx = lanesFor(w);
      const spy = (source: string): Partial<RoadmapLanes> => ({
        ...fx,
        weekQuestSetFor: (userId, milestoneId, weekStart, now, opts) => {
          seen.push({ source, overrides: { ...((opts?.overrides ?? {}) as Record<string, unknown>) } });
          return fx.weekQuestSetFor!(userId, milestoneId, weekStart, now, opts);
        },
      });
      const preview = await S.startPreview(USER, m1.id, NOW, depsFor(w, { lanes: spy("preview") }));
      const st = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w, { lanes: spy("start") }));
      const readingOf = (key: string) => w.t.readings.find((r) => r.measureKey === key && r.day === TODAY && r.source === "COMPUTED") ?? null;
      const ms = measuresOf(w, m1.id).filter((x) => x.kind === "CARDS_AT_LEVEL").map((x) => x.measureKey);
      return { w, m1, st, preview, keys, ms, prob: readingOf(keys.prob), inf: readingOf(keys.inf), start: seen.find((s) => s.source === "start")?.overrides, pre: seen.find((s) => s.source === "preview")?.overrides };
    };
    const r = await startWith({ prob: "r", inf: "r" });
    check("fixture: Start keeps both `r` keys of the first stage (one per Domain)", r.st.ok && r.ms.includes(r.keys.prob) && r.ms.includes(r.keys.inf), json([r.st, r.ms]));
    eq("with 3 multiple-choice cards at or above L, Start's reading of Probability's `r` key is its recall count (12, not 15)", r.prob?.value, 12);
    eq(
      "…its detail is R1's own cardsAtLevelValue over the same cards (the 3 multiple-choice cards named as not counted), so R1's later reading that day finds nothing to change",
      r.prob?.detail,
      { byDomain: { "d-prob": 12 }, retryEntries: 0, retryByDomain: { "d-prob": 0 }, notCounted: { "d-prob": 3 } }
    );
    eq("…and Inference's `r` reading is its 4", r.inf?.value, 4);
    eq("Start hands R6 a v0 per key (v0ByKey), each the recall count, and no single v0", [r.start?.v0ByKey, "v0" in (r.start ?? {})], [{ [r.keys.prob]: 12, [r.keys.inf]: 4 }, false]);
    eq("…the Start sheet's 'Week quests if you start now' reads the same v0 per key, so it shows the set Start freezes", r.pre?.v0ByKey, r.start?.v0ByKey);
    const rc = await startWith({ prob: "r", inf: "rc" });
    check("an `rc` key (the depth, clean entry): Start writes no first reading for it (R1's, from the ledger), as accept leaves it", rc.st.ok && rc.inf == null && rc.prob?.value === 12, json([rc.st, rc.inf, rc.prob?.value]));
    eq("…and takes no v0 for it: R6 counts it from its own clean-entry read; the `r` key keeps its 12", [rc.start?.v0ByKey, rc.pre?.v0ByKey], [{ [rc.keys.prob]: 12 }, { [rc.keys.prob]: 12 }]);
    const rcOnly = await startWith({ prob: "rc", inf: "rc" });
    check("a final stage of `rc` keys only: no card reading at Start, an empty v0ByKey, and the set still frozen", rcOnly.st.ok && rcOnly.prob == null && rcOnly.inf == null && json(rcOnly.start?.v0ByKey) === "{}" && rcOnly.w.t.questWeeks.length === 1, json([rcOnly.st, rcOnly.start, rcOnly.w.t.questWeeks.length]));
    const legacy = await startWith({ prob: null, inf: null });
    eq("a rev-3 key (no segment) still counts every card, multiple choice included, as its readings do (15)", [legacy.prob?.value, legacy.prob?.detail, legacy.start?.v0ByKey], [15, { byDomain: { "d-prob": 15 } }, { [legacy.keys.prob]: 15, [legacy.keys.inf]: 4 }]);
  }

  // ═══ With the real lanes (PENDING until R1, R2 and R3 land; green at integration) ═══
  console.log("— with the real lanes —");
  let pendingCount = 0;
  async function integration(name: string, fn: () => Promise<[boolean, string?]>) {
    try {
      const [okv, detail] = await fn();
      check(name, okv, detail ?? "");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/^Not yet/.test(msg)) {
        pendingCount++;
        console.log(`PENDING ${name} — ${msg}`);
      } else check(name, false, msg);
    }
  }
  /**
   * The real pure lanes. The lane functions that read the database stay
   * fixtures (R6's loaders and set builder, R1's proficiencyReadingFor), as
   * do the store and io; the stand-in client throws if anything else tries.
   */
  const realDeps = (w: FakeWorld, extra: Partial<RoadmapDeps> = {}): RoadmapDeps => {
    const fixtures = lanesFor(w);
    return {
      ...depsFor(w, extra),
      lanes: {
        weekQuestSetFor: fixtures.weekQuestSetFor,
        loadWeekQuests: fixtures.loadWeekQuests,
        loadPastWeeks: fixtures.loadPastWeeks,
        proficiencyReadingFor: fixtures.proficiencyReadingFor,
      },
    };
  };
  /** The real R2 ladder sets a stage on every row (revision 4): until it does, a case that writes a real plan is pending R2. */
  const requireRealStages = (w: FakeWorld, intake: Intake) => {
    const input = { today: TODAY, targetDay: intake.targetDay, scopes: [], throughput: S.calibratingThroughput(TODAY), hoursPerWeek: 5, intensity: "STEADY", startPoint: "BASICS", typicalHours: null, typicalHoursSource: null, m: 1, heldDays: [], areaInMaintenance: false, practicesAllowed: true, trackArea: false, depth: 12, dateMode: "CHOSEN", userDate: intake.targetDay } as Parameters<RoadmapLanes["starterLadder"]>[1];
    const names = Object.fromEntries(intake.domainIds.map((d) => [d, domainName({ id: d, name: w.tree.flatMap((f) => f.domains).find((x) => x.id === d)?.name ?? d })]));
    const plan = REALISM.starterLadder({ ...intake, depth: 12 }, input, names, () => globalThis.crypto.randomUUID());
    if (plan.some((m) => m.stage == null)) throw new Error("Not yet: R2's depth starter sets no stage on its rows");
  };
  /**
   * A keys-only reply the run's own schema allows. v4 (contracts §20: `picks` and `order`): each stage's first offered
   * kind, and the outline's keys in reverse (a learning order of its own). v3 (`stages`): every slot, no steps, the
   * first practice kind where the schema offers one.
   */
  const replyFromSchema = (schema: unknown) => {
    const props = (schema as { properties?: Record<string, unknown> } | null)?.properties ?? {};
    if (!("stages" in props)) {
      const picks = (props.picks as { properties?: Record<string, { enum?: string[] }> } | undefined)?.properties ?? {};
      const order = (props.order as { items?: { enum?: string[] } } | undefined)?.items?.enum ?? [];
      const chosen = Object.entries(picks)
        .map(([slot, p]) => [slot, p.enum?.[0]] as const)
        .filter((e): e is readonly [string, string] => typeof e[1] === "string");
      return { ...(chosen.length ? { picks: Object.fromEntries(chosen) } : {}), ...(order.length ? { order: [...order].reverse() } : {}) };
    }
    type Pick = { items?: { properties?: { kind?: { enum?: string[] } } } };
    const stages = (schema as { properties?: { stages?: { required?: string[]; properties?: Record<string, { properties?: { practices?: Pick } }> } } } | null)?.properties?.stages;
    const out: Record<string, unknown> = {};
    for (const slot of stages?.required ?? []) {
      const kinds = stages?.properties?.[slot]?.properties?.practices?.items?.properties?.kind?.enum ?? [];
      out[slot] = kinds.length ? { practices: [{ kind: kinds[0] }], steps: [] } : { steps: [] };
    }
    return { stages: out };
  };
  const sdkReply = (body: unknown) => {
    const text = json(body);
    return { text, candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }], usageMetadata: { totalTokenCount: 10 }, modelVersion: "fixture", responseId: "resp-1" };
  };

  await integration("the input hash changes when two same-named Domains from different Fields swap (R3's material)", async () => {
    const hashOf = async (domainId: string) => {
      const w = world();
      w.tree.push({ id: "f-maths", name: "Maths", level: 1, domains: [{ id: "d-prob-2", name: "Probability", fieldId: "f-maths", cards: [card("d-prob-2", 6)] }] });
      const id = await newDraft(w, { ...INTAKE, domainIds: [domainId] });
      const c = await S.claimDraftCore(USER, id, { force: false }, NOW, realDeps(w));
      if (!c.ok) throw new Error(c.error);
      return w.t.roadmapRun[0].inputHash;
    };
    const a = await hashOf("d-prob");
    const b = await hashOf("d-prob-2");
    return [!!a && !!b && a !== b, `${a} vs ${b}`];
  });

  await integration("'Build from my numbers' on the fixture library is accepted and started as one MID goal (R1, R2)", async () => {
    const w = world();
    // Mastered in 120 days is impossible on this library (R2's date check): the plan dates itself (REALISTIC).
    requireRealStages(w, { ...INTAKE, targetDay: addDays(TODAY, 120) });
    const id = await newDraft(w, { ...INTAKE, dateMode: "REALISTIC", newCardsPerWeek: 20 });
    const built = await S.buildStarterCore(USER, id, NOW, realDeps(w));
    if (!built.ok) return [false, built.error];
    const acc = await S.acceptCore(USER, id, { overAccepted: true }, NOW, realDeps(w));
    if (!acc.ok) return [false, acc.error];
    const m1 = rowsOf(w, id, 1).find((m) => m.status === "PLANNED") as MilestoneRec;
    const st = await S.startMilestoneCore(USER, m1.id, { ...START_ALL, overAccepted: true }, NOW, realDeps(w));
    const goals = w.templates.filter((t) => t.kind === "GOAL");
    return [st.ok && goals.length === 1 && goals[0].horizon === "MID" && [0, 6].includes(goals[0].stated ?? -1), json([st, goals.map((g) => g.stated)])];
  });

  await integration("a keys-only Gemini draft through the real pack, schema, integrity walk, validator and ladder writes no Gemini words (R2, R3)", async () => {
    const w = world();
    requireRealStages(w, INTAKE);
    const id = await newDraft(w);
    const tasks: (() => Promise<void> | void)[] = [];
    const deps = realDeps(w, { defer: (t) => tasks.push(t), callModel: async (req) => sdkReply(replyFromSchema((req as { responseSchema?: unknown }).responseSchema)), clock: () => NOW });
    const c = await S.claimDraftCore(USER, id, { force: false }, NOW, deps);
    if (!c.ok) return [false, c.error];
    for (const t of tasks) await t();
    const rows = rowsOf(w, id, 1);
    const items = rows.flatMap((m) => itemsOf(w, m.id));
    const run = w.t.roadmapRun[0];
    return [
      run.status !== "FAILED" && rows.length >= 1 && rows.every((m) => m.stage != null && m.titleOrigin !== "GEMINI") && items.every((i) => i.origin !== "GEMINI" || (i.kind === "DOMAIN" && i.notes.includes("NOT_CHOSEN"))) && (run.report as { integrity?: { verdict?: string } } | null)?.integrity?.verdict === "CLEAN",
      json([run.status, run.error, rows.length, (run.report as { integrity?: unknown } | null)?.integrity]),
    ];
  });

  await integration("hostileViewsOf (lane R7's seam): a REJECTED reply renders the starter, no GEMINI row and none of its words; a clean reply renders code's words (R2, R3)", async () => {
    const intake: Intake = { ...INTAKE, dateMode: "REALISTIC", newCardsPerWeek: 20 };
    const domains = [
      { id: "d-prob", name: "Probability", fieldId: "f-stats", cards: 20, atSix: 12, atTop: 0 },
      { id: "d-inf", name: "Inference", fieldId: "f-stats", cards: 4, atSix: 4, atTop: 0 },
    ];
    const rejected = S.hostileViewsOf({
      run: { id: "t1" },
      parsed: { stages: { FOUNDATION: { steps: [], "You must buy the official CFA curriculum": 1 } } },
      validated: null,
      integrity: { verdict: "REJECTED", violations: [{ code: "EXTRA_PROPERTY", path: "stages.FOUNDATION.<extra>" }], modelChars: 0, gapsKept: 0, gapsHidden: 0, gapsDropped: 0, notANameByClause: {} },
      intake,
      areaName: "Statistics",
      domains,
      today: TODAY,
    });
    const text = json(rejected);
    const draft = rejected.views[0] as { milestones?: MilestoneDraft[] } | null;
    const ok =
      !/"(titleOrigin|origin)":"GEMINI"/.test(text) &&
      !/CFA|curriculum/.test(text) &&
      (draft?.milestones?.length ?? 0) > 0 &&
      rejected.logLines.length === 1 &&
      rejected.logLines[0].includes('"verdict":"REJECTED"');
    return [ok, text.slice(0, 300)];
  });

  await integration("a Reschedule: R2's re-fit starts the next window the day after the goal's new due day (fix round 2)", async () => {
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    const st = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    if (!st.ok) return [false, st.error];
    const goal = goalOf(w, m1.id);
    goal.dueDay = addDays(TODAY, 100);
    const rp = await S.replanCore(USER, id, "REFIT", at(1_000), realDeps(w));
    if (!rp.ok) return [false, rp.error];
    const next = rowsOf(w, id, 2).find((m) => m.status === "DRAFT");
    return [next?.windowStart === addDays(goal.dueDay, 1), json([next?.windowStart, goal.dueDay, (w.t.roadmapMilestone.find((m) => m.id === m1.id) as MilestoneRec).dueDay])];
  });

  await integration("drop → Start again on a 6-milestone plan → R2's re-fit holds all 6 positions (fix round 2)", async () => {
    const w = world();
    const SIX_INTAKE: Intake = { ...INTAKE, targetDay: addDays(TODAY, 450) };
    const names = ["One", "Two", "Three", "Four", "Five", "Six"];
    const six = { milestones: names.map((title, i) => ({ title, domains: [i % 2 ? "d-inf" : "d-prob"], practices: [{ name: `Practice ${title}`.replace(/\d/g, ""), method: "X" }] })) };
    const id = await drafted(w, six, SIX_INTAKE);
    if (rowsOf(w, id, 1).length !== 6) return [false, `fixture: ${rowsOf(w, id, 1).length} milestones`];
    const first = rowsOf(w, id, 1)[0];
    await decideAll(w, id, first.id);
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
    if (!acc.ok) return [false, acc.error];
    await dropAndStartAgain(w, rowsOf(w, id, 1)[0]);
    const rp = await S.replanCore(USER, id, "REFIT", at(2_000), realDeps(w));
    if (!rp.ok) return [false, rp.error];
    const v2 = rowsOf(w, id, 2);
    return [v2.filter((m) => m.status === "DRAFT").length === 6, json(v2.map((m) => [m.status, m.windowStart, m.dueDay]))];
  });

  await integration("fix round 2: a REALISTIC intake that needs new cards and has no pace is refused at intake in R2's words, not first at the draft (R2)", async () => {
    const w = world();
    requireRealStages(w, INTAKE);
    const r = await S.saveIntakeCore(USER, { ...INTAKE, dateMode: "REALISTIC", newCardsPerWeek: null }, NOW, realDeps(w));
    const withPace = await S.saveIntakeCore(USER, { ...INTAKE, dateMode: "REALISTIC", newCardsPerWeek: 20 }, NOW, realDeps(w));
    return [!r.ok && /pace|cards a week/i.test(errOf(r)) && w.t.roadmap.length === 1 && withPace.ok, json([r, withPace.ok])];
  });

  await integration("finishing round: a spare-only REALISTIC intake with no pace saves and drafts dated on the cards held, rate null (option (b), contracts §16.10; R2)", async () => {
    // Every Domain already holds its count n_d in recall cards: Probability 42 (n 34), Inference 30 (n 25, the floor). The new
    // cards WRITE_MARGIN asks (writeNeedOf: 3 each) are its spare alone, so no pace is needed: RoadmapForm's newCardsRequiredOf
    // leaves the pace optional, and the server path it relies on must save, draft and date the plan on the cards held.
    const spareWorld = (infCards: number) => {
      const w = world();
      w.tree[0].domains[0].cards = [...Array(12)].map(() => card("d-prob", 6)).concat([...Array(30)].map(() => card("d-prob", 3)));
      w.tree[0].domains[1].cards = [...Array(infCards)].map(() => card("d-inf", 6));
      return w;
    };
    const intake: Intake = { ...INTAKE, dateMode: "REALISTIC", newCardsPerWeek: null };
    const w = spareWorld(30);
    requireRealStages(w, intake);
    const spare = [coveragePolicyOf(42, 0).n, coveragePolicyOf(30, 0).n];
    if (spare[0] > 42 || spare[1] > 30) return [false, `fixture: a Domain short of its count ${json(spare)}`];
    const saved = await S.saveIntakeCore(USER, intake, NOW, realDeps(w));
    if (!saved.ok) return [false, `saveIntakeCore refused a spare-only intake: ${saved.error}`];
    const built = await S.buildStarterCore(USER, saved.value.roadmapId, NOW, realDeps(w));
    if (!built.ok) return [false, `the starter refused it: ${built.error}`];
    const view = await S.loadRoadmapView(USER, NOW, realDeps(w));
    const dc = view.draft?.dateCheck ?? null;
    const road = w.t.roadmap.find((r) => r.id === saved.value.roadmapId);
    const rows = rowsOf(w, saved.value.roadmapId, 1);
    // The control: Inference with 9 cards is short of its 25, so the same intake still needs the pace.
    const short = spareWorld(9);
    const refused = await S.saveIntakeCore(USER, intake, NOW, realDeps(short));
    return [
      rows.length > 0 &&
        rows.every((m) => m.stage != null) &&
        dc != null &&
        dc.D_real != null &&
        dc.rateAsked === null &&
        dc.D_full === dc.D_real &&
        !dc.dateOrigin.calibrating.includes("pace") &&
        dc.basis[0]?.startsWith("With only the cards you hold") === true &&
        road?.dateMode === "REALISTIC" &&
        road.targetDay === dc.D_real &&
        !refused.ok &&
        /pace|cards a week/i.test(errOf(refused)) &&
        short.t.roadmap.length === 0,
      json({ rows: rows.length, dc: dc && { D_real: dc.D_real, D_full: dc.D_full, rateAsked: dc.rateAsked, basis0: dc.basis[0], calibrating: dc.dateOrigin.calibrating }, target: road?.targetDay, refused }),
    ];
  });

  await integration("fix round 2: hostileViewsOf names its views, and adds the week-quests view of the first milestone as if started (R7's handoff; R2, R6)", async () => {
    const intake: Intake = { ...INTAKE, dateMode: "REALISTIC", newCardsPerWeek: 20 };
    const domains = [
      { id: "d-prob", name: "Probability", fieldId: "f-stats", cards: 20, atSix: 12, atTop: 0 },
      { id: "d-inf", name: "Inference", fieldId: "f-stats", cards: 4, atSix: 4, atTop: 0 },
    ];
    const out = S.hostileViewsOf({ run: { id: "t-wq" }, parsed: { stages: { FOUNDATION: { steps: [], "Buy the Zorblatt course first": 1 } } }, intake, areaName: "Statistics", domains, today: TODAY });
    const wq = out.views[6] as { milestoneOrd?: number; rows?: { kind: string }[] } | null;
    const text = json(out.views);
    const ok = out.viewNames.length === out.views.length && json(out.viewNames) === json(S.HOSTILE_VIEW_NAMES) && !!wq && (wq.rows?.length ?? 0) > 0 && wq.milestoneOrd === 1 && !/Zorblatt/.test(text) && !/"(titleOrigin|origin)":"GEMINI"/.test(text);
    return [ok, json({ names: out.viewNames, rows: wq?.rows?.map((r) => r.kind) })];
  });

  await integration("fix round 2: archive 20 cards → re-plan → [Use the realistic date] on an ACTIVE plan: R2's redrafted final stage asks for the end state's n_d (R2, contracts §16.9)", async () => {
    const w = world();
    w.tree[0].domains[0].cards = Array.from({ length: 60 }, () => card("d-prob", 3));
    const intake: Intake = { ...INTAKE, dateMode: "REALISTIC", newCardsPerWeek: 20 };
    requireRealStages(w, intake);
    const id = await newDraft(w, intake);
    const built = await S.buildStarterCore(USER, id, NOW, realDeps(w));
    if (!built.ok) return [false, built.error];
    const acc = await S.acceptCore(USER, id, { overAccepted: true }, NOW, realDeps(w));
    if (!acc.ok) return [false, acc.error];
    const term = (w.t.roadmapAcceptance[0].endState as EndStateTerm[]).find((t) => t.measureKey.includes("d:d-prob|"));
    w.tree[0].domains[0].cards.splice(0, 20);
    const rp = await S.replanCore(USER, id, "MANUAL", at(1_000), realDeps(w));
    if (!rp.ok) return [false, rp.error];
    const used = await S.applyRemedyCore(USER, id, "USE_REALISTIC_DATE", at(2_000), realDeps(w));
    if (!used.ok) return [false, used.error];
    const finalTargets = rowsOf(w, id, 2)
      .filter((m) => m.status !== "LATER")
      .flatMap((m) => measuresOf(w, m.id).filter((x) => x.measureKey === term?.measureKey).map((x) => x.target));
    return [!!term && finalTargets.length > 0 && finalTargets.every((t) => t === term.target), json([term?.measureKey, term?.target, finalTargets])];
  });

  await integration("fix round 2: a Gemini draft's code labels never name a pending addition; [Leave out] and [Add] re-render them over R (R2, R3)", async () => {
    const run = async (choice: string[] | null) => {
      const w = world();
      w.tree[0].domains.push({ id: "d-comb", name: "Combinatorics", fieldId: "f-stats", cards: [card("d-comb", 3), card("d-comb", 3)] });
      requireRealStages(w, INTAKE);
      const id = await newDraft(w);
      const tasks: (() => Promise<void> | void)[] = [];
      const callModel = async (req: unknown) => {
        const schema = (req as { responseSchema?: unknown }).responseSchema;
        const needs = (schema as { properties?: { needs?: { items?: { enum?: string[] } } } } | null)?.properties?.needs?.items?.enum ?? [];
        return sdkReply({ ...replyFromSchema(schema), needs: needs.slice(0, 1) });
      };
      const deps = realDeps(w, { defer: (t) => tasks.push(t), callModel, clock: () => NOW });
      const c = await S.claimDraftCore(USER, id, { force: false }, NOW, deps);
      if (!c.ok) throw new Error(c.error);
      for (const t of tasks) await t();
      const items = () => rowsOf(w, id, 1).flatMap((m) => itemsOf(w, m.id));
      const labels = () => items().filter((i) => i.catalogKey && i.decision !== "REMOVED").map((i) => i.label);
      const pending = items().filter((i) => i.domainId === "d-comb" && i.decision === "PENDING").length;
      const before = labels();
      const decided = choice ? await S.confirmDomainAdditionsCore(USER, id, 1, choice, NOW, realDeps(w)) : null;
      return { pending, before, after: labels(), decided, comb: items().filter((i) => i.domainId === "d-comb" && i.kind === "DOMAIN").map((i) => i.decision) };
    };
    const left = await run([]);
    const added = await run(["d-comb"]);
    const named = (ls: string[]) => ls.some((l) => /Combinatorics/.test(l));
    const ok =
      left.pending > 0 &&
      left.before.length > 0 &&
      !named(left.before) &&
      left.decided?.ok === true &&
      left.comb.every((d) => d === "REMOVED") &&
      !named(left.after) &&
      added.decided?.ok === true &&
      added.comb.every((d) => d === "CHECKED") &&
      named(added.after);
    return [ok, json({ left: { pending: left.pending, before: left.before.slice(0, 3), after: left.after.slice(0, 3), decided: left.decided }, added: { after: added.after.slice(0, 3), decided: added.decided, comb: added.comb } })];
  });

  // ═══ Confirm to unlock (contracts §19): every plan path honours the one gate ═══
  //
  // The lead's rules (the safety-gaps round, decisions 1–8): every BODY or CARE plan asks once, whatever the user wrote
  // (cue or not, constraints empty or not); a CRAFT plan asks on a cue; a Field Area never asks, and its parser
  // suggestions are pre-ticked boxes, never a block. Until the user answers the card under their current words — an
  // explicit act (ticks and Save, or "Nothing to avoid") carrying the words' key — every plan path (the code-built starter
  // and ladder, the Gemini keys-only placement, re-plans, Start and the week quests) places only the track's safe kinds
  // (CARE's: planning the week and keeping a log), and every refusal meanwhile points at the card. After the answer the
  // kinds the card listed and the user left unticked are placed and the ticked never appear; a stale key is refused; an
  // AVOID after Start pauses the started task; a kept pick of a kind that waits again is held.
  console.log("— confirm to unlock (§19): every plan path honours the gate —");
  const GATED_BODY = ["HARDER_SESSION", "LONGER_SESSION", "STRENGTH_SESSION", "FULL_ATTEMPT", "PERFORMANCE_CHECK", "MOCK_TEST"];
  const SAFE = ["EASY_SESSION", "MOBILITY_SESSION", "TECHNIQUE_SESSION"];
  /**
   * A stage while the card waits (contracts §19, §20): it holds a practice, every practice one of the track's safe kinds,
   * and nothing else but the progression's opening step (setting up, never gated) on the first stage.
   */
  const waitingRow = (r: readonly string[], safe: readonly string[]) => r.some((k) => safe.includes(k)) && r.every((k) => safe.includes(k) || k === "SET_UP");
  /** Each row's live catalog kinds, in ord (the plan's draft or accepted version). */
  const kindsIn = (w: FakeWorld, id: string, version = 1): string[][] =>
    rowsOf(w, id, version)
      .filter((m) => m.status !== "DISCARDED")
      .map((m) => itemsOf(w, m.id).filter((i) => i.decision !== "REMOVED" && i.catalogKey).map((i) => i.catalogKey as string));
  /** A refusal while the card waits: the message, then roadmap-catalog's pointer at the card (withActivityPointer). */
  const pointed = (message: string) => `${message}${/[.!?…]$/.test(message) ? "" : "."} ${ACTIVITY_PENDING_POINTER}`;
  const examIntake: Intake = { ...INTAKE, dateMode: "REALISTIC", newCardsPerWeek: 20, examLabel: "SOA Exam P", examDay: addDays(TODAY, 120) };
  const runIntake: Intake = { ...INTAKE, aim: "Run a sub-50 10K", fieldId: null, track: "BODY", domainIds: [], constraints: "Running causes me knee pain.", dateMode: "CHOSEN", targetDay: addDays(TODAY, 300) };
  const careIntake: Intake = { ...INTAKE, aim: "Support Mum's care at home", fieldId: null, track: "CARE", domainIds: [], constraints: "No visits on weekdays, phone calls only.", dateMode: "CHOSEN", targetDay: addDays(TODAY, 300) };
  const craftIntake: Intake = { ...INTAKE, aim: "Play a piece on the piano", fieldId: null, track: "CRAFT", domainIds: [], constraints: null, dateMode: "CHOSEN", targetDay: addDays(TODAY, 300) };
  const kneeIntake: Intake = { ...INTAKE, aim: "Get back to running", fieldId: null, track: "BODY", domainIds: [], constraints: "knee injury, no running" };
  const ROLE_KINDS = ["RECALL_DRILLS", "READ_AND_CARD", "LISTEN_AND_REPEAT", "EXPLAIN_IT", "PROBLEM_SETS", "WRITING_PRACTICE", "MISTAKE_REVIEW", "SAY_IT_ALOUD", "BUILD_SOMETHING", "RUN_THROUGHS"];
  /** The code-built starter for an intake (real R2, R3), with its rows and the page's view. */
  const built = async (intake: Intake) => {
    const w = world();
    const id = await newDraft(w, intake);
    const res = await S.buildStarterCore(USER, id, NOW, realDeps(w));
    if (!res.ok) throw new Error(`${intake.constraints}: ${res.error}`);
    const view = await S.loadRoadmapView(USER, NOW, realDeps(w));
    return { w, id, rows: kindsIn(w, id), view, card: view.draft?.activityConfirm ?? null };
  };

  await integration("§19 decision 7: a Field plan's 'No timed practice' is a suggestion, never a block — the code-built plan still places Timed practice and the card shows its row pre-ticked with the user's sentence; Save with it ticked is the user's AVOID and the draft drops it, each stage keeping a practice of its role (real R2, R3)", async () => {
    requireRealStages(world(), examIntake);
    const control = await built({ ...examIntake, constraints: null });
    const timed = await built({ ...examIntake, constraints: "No timed practice, it stresses me out." });
    const mock = await built({ ...examIntake, constraints: "No mock tests please." });
    const row = timed.card?.rows.find((r) => r.kind === "TIMED_PRACTICE");
    const said = await answerCard(timed.id, realDeps(timed.w), ["TIMED_PRACTICE"], { now: at(1_000) });
    const avoided = kindsIn(timed.w, timed.id);
    const all = (rows: string[][]) => rows.flat();
    return [
      all(control.rows).includes("TIMED_PRACTICE") &&
        // A dated exam's stage holds the exam itself, its timed practice the rehearsal (contracts §20.10, point 1).
        all(control.rows).includes("EXAM_DAY") &&
        json(timed.rows) === json(control.rows) &&
        json(mock.rows) === json(control.rows) &&
        json(timed.view.draft?.exclusions) === "[]" &&
        timed.card?.on === false &&
        row?.state === "WORDS" &&
        row.prefill === "AVOID" &&
        /timed practice/i.test(row.reason) &&
        said.ok &&
        intakeActivitiesOf(timed.w, timed.id)?.kinds.TIMED_PRACTICE?.verdict === "AVOID" &&
        !all(avoided).includes("TIMED_PRACTICE") &&
        // Every stage keeps a practice of its role: the requirement takes the next kind the gate leaves in.
        avoided.every((r, i) => r.some((k) => ROLE_KINDS.includes(k)) || !control.rows[i].some((k) => ROLE_KINDS.includes(k))),
      json({ control: control.rows, timed: timed.rows, mock: mock.rows, row, said, avoided }),
    ];
  });

  await integration("§19 a Field plan is never gated by a body cue, and a term the plan fills into every label names no kind: 'Inference is too hard' leaves the plan as it was (finding #1 held here; real R2, R3)", async () => {
    requireRealStages(world(), examIntake);
    const control = await built({ ...examIntake, constraints: null });
    const hard = await built({ ...examIntake, constraints: "Inference is too hard for me, I need extra time on it." });
    const knee = await built({ ...examIntake, constraints: "Bad knee, my back hurts." });
    return [
      json(hard.rows) === json(control.rows) && json(hard.view.draft?.exclusions) === "[]" && json(knee.rows) === json(control.rows) && hard.card == null && knee.card == null,
      json({ control: control.rows, hard: hard.rows, knee: knee.rows, ex: hard.view.draft?.exclusions, card: knee.card }),
    ];
  });

  await integration("§19 BODY, a cue the parser reads nothing from ('Running causes me knee pain.'): the starter places only the safe sessions, no performance check, and the draft says so (real R2)", async () => {
    const b = await built(runIntake);
    const pending = (b.card?.rows ?? []).filter((r) => r.state === "PENDING").map((r) => r.kind);
    return [
      b.rows.length > 1 &&
        b.rows.every((r) => waitingRow(r, SAFE)) &&
        !!b.card &&
        b.card.on &&
        json(b.card.quotes) === json(["Running causes me knee pain"]) &&
        ["HARDER_SESSION", "LONGER_SESSION", "STRENGTH_SESSION", "PERFORMANCE_CHECK"].every((k) => pending.includes(k as never)) &&
        json(b.card.safeKinds) === json(SAFE) &&
        // Whatever the parser suggests and the gate holds is listed as left out, and none of it is placed.
        (b.view.draft?.exclusions ?? []).every((x) => !b.rows.flat().includes(x.kind)),
      json({ rows: b.rows, card: b.card }),
    ];
  });

  await integration("§19 decision 1: a BODY plan asks whatever the user wrote — no constraints and a plain aim: only the safe sessions and no performance check until the card is answered, yet the draft is acceptable and Start puts only the safe sessions on Today (and the progression's setting up); a refusal meanwhile points at the card; “Nothing to avoid” places the progression's climb (Longer from the third stage, Harder from the fourth, the full attempt and the performance check on the last) (real R2)", async () => {
    const plain = await built({ ...runIntake, constraints: null });
    const view0 = plain.view;
    // A second, accepted copy: Start while the card waits (only the safe sessions get a Today task), and a refusal points at it.
    const acc = await S.acceptCore(USER, plain.id, { overAccepted: false }, NOW, realDeps(plain.w));
    const m1 = rowsOf(plain.w, plain.id, 1)[0];
    const gateOff = await S.startPreview(USER, m1.id, NOW, realDeps(plain.w, { goalsLive: false }));
    const st = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, realDeps(plain.w));
    const started = itemsOf(plain.w, m1.id).filter((i) => i.templateId).map((i) => i.catalogKey as string);
    const fresh = await built({ ...runIntake, constraints: null });
    const said = await answerCard(fresh.id, realDeps(fresh.w), [], { none: true, now: at(1_000) });
    const after = kindsIn(fresh.w, fresh.id);
    return [
      plain.rows.length > 2 &&
        plain.rows.every((r) => waitingRow(r, SAFE)) &&
        !!plain.card &&
        plain.card.on &&
        plain.card.pending >= 4 &&
        json(plain.card.safeKinds) === json(SAFE) &&
        view0.draft?.acceptable === true &&
        acc.ok &&
        gateOff?.refusal === pointed(S.GATE_OFF) &&
        st.ok &&
        started.length > 0 &&
        started.some((k) => SAFE.includes(k)) &&
        started.every((k) => SAFE.includes(k) || k === "SET_UP") &&
        said.ok &&
        after.slice(2).every((r) => r.includes("LONGER_SESSION")) &&
        after.slice(3).every((r) => r.includes("HARDER_SESSION")) &&
        ["FULL_ATTEMPT", "PERFORMANCE_CHECK"].every((k) => after[after.length - 1].includes(k)) &&
        !after.slice(0, 3).flat().includes("HARDER_SESSION") &&
        !after.flat().includes("STRENGTH_SESSION"),
      json({ rows: plain.rows, card: plain.card, acceptable: view0.draft?.acceptable, acc, refusal: gateOff?.refusal, st, started, said, after }),
    ];
  });

  await integration("§19 decision 1: a CRAFT plan asks on a cue — 'Wrist tendinitis, can't play more than 20 minutes.' places only the technique session (no slow drills, run-throughs or performance check) and the card asks; a plain CRAFT plan is built as before with no card (real R2)", async () => {
    const plain = await built(craftIntake);
    const wrist = await built({ ...craftIntake, constraints: "Wrist tendinitis, can't play more than 20 minutes." });
    const pending = (wrist.card?.rows ?? []).filter((r) => r.state === "PENDING").map((r) => r.kind);
    return [
      plain.rows.flat().includes("SLOW_DRILLS") &&
        plain.rows.flat().includes("PERFORMANCE_CHECK") &&
        plain.card == null &&
        wrist.rows.flat().length > 0 &&
        wrist.rows.every((r) => waitingRow(r, ["TECHNIQUE_SESSION"])) &&
        wrist.card?.on === true &&
        json(wrist.card.safeKinds) === json(["TECHNIQUE_SESSION"]) &&
        ["SLOW_DRILLS", "RUN_THROUGHS", "PERFORMANCE_CHECK"].every((k) => pending.includes(k as never)),
      json({ plain: plain.rows, wrist: wrist.rows, card: wrist.card }),
    ];
  });

  await integration("§19 the user's answer on a DRAFT: the plan follows in the same write (the kinds the card listed and the user left unticked are placed where the starter places them, the ticked never); a second answer replaces the ticks; an intake save keeps the answer; new words ask again (the released kinds wait, every AVOID stands) and an answer given against the old words is refused (decision 3, the verifier's S12) (real R2)", async () => {
    const w = world();
    const id = await newDraft(w, runIntake);
    const b0 = await S.buildStarterCore(USER, id, NOW, realDeps(w));
    if (!b0.ok) return [false, b0.error];
    const before = kindsIn(w, id);
    const said = await answerCard(id, realDeps(w), ["STRENGTH_SESSION"], { now: at(1_000) });
    const fine = kindsIn(w, id);
    const gatedIn = (rows: string[][]) => rows.flat().filter((k) => GATED_BODY.includes(k));
    const stored = intakeActivitiesOf(w, id);
    const avoid = await answerCard(id, realDeps(w), ["STRENGTH_SESSION", "LONGER_SESSION"], { now: at(2_000) });
    const avoided = kindsIn(w, id);
    // The intake saved again with the same words keeps the answer.
    const resaved = await S.saveIntakeCore(USER, runIntake, at(3_000), realDeps(w));
    const kept = intakeActivitiesOf(w, id);
    // Tab A shows the card for these words; tab B saves new words; tab A's "Nothing to avoid" then lands (S12).
    const tabA = await cardAnswerOf(realDeps(w), [], true, at(3_500));
    const reworded = await S.saveIntakeCore(USER, { ...runIntake, constraints: "Running causes me knee pain. Torn ACL, surgery next month." }, at(4_000), realDeps(w));
    const stale = kindsIn(w, id);
    const view = await S.loadRoadmapView(USER, at(5_000), realDeps(w));
    const rowOf = (k: string) => view.draft?.activityConfirm?.rows.find((r) => r.kind === k);
    const storedStale = intakeActivitiesOf(w, id);
    const late = await S.setActivityVerdictsCore(USER, id, tabA, at(6_000), realDeps(w));
    const ok =
      said.ok &&
      said.value.replan === false &&
      gatedIn(before).length === 0 &&
      // The kinds the answer released, where the progression places them (contracts §20): the climb, the full attempt and the check.
      json(Array.from(new Set(gatedIn(fine))).sort()) === json(["FULL_ATTEMPT", "HARDER_SESSION", "LONGER_SESSION", "PERFORMANCE_CHECK"]) &&
      fine[fine.length - 1].includes("PERFORMANCE_CHECK") &&
      !fine.flat().includes("STRENGTH_SESSION") &&
      stored?.kinds.STRENGTH_SESSION?.verdict === "AVOID" &&
      stored.kinds.STRENGTH_SESSION.reason === "Running causes me knee pain" &&
      stored.kinds.LONGER_SESSION == null &&
      stored.answered?.none === false &&
      stored.answered.asked.includes("LONGER_SESSION") &&
      avoid.ok &&
      !avoided.flat().includes("LONGER_SESSION") &&
      avoided.flat().includes("PERFORMANCE_CHECK") &&
      resaved.ok &&
      kept?.answered != null &&
      kept.kinds.LONGER_SESSION?.verdict === "AVOID" &&
      reworded.ok &&
      !stale.flat().includes("PERFORMANCE_CHECK") &&
      rowOf("PERFORMANCE_CHECK")?.state === "PENDING" &&
      rowOf("PERFORMANCE_CHECK")?.staleDay === TODAY &&
      rowOf("LONGER_SESSION")?.state === "AVOID" &&
      errOf(late) === ACTIVITY_ANSWER_STALE &&
      json(intakeActivitiesOf(w, id)) === json(storedStale) &&
      json(kindsIn(w, id)) === json(stale);
    return [ok, json({ said, before, fine, stored, avoided, kept, stale, pc: rowOf("PERFORMANCE_CHECK"), late })];
  });

  await integration("§19 decision 2: a waiting CARE plan is never a dead end — the starter places planning the week (and keeping a log from the third stage), no care session or performance check, and the draft is acceptable; a refusal meanwhile points at the card; the answer leaving Check-in ticked (pre-ticked from the user's words) places Set time and never Check-in (real R2)", async () => {
    const b = await built(careIntake);
    const checkIn = b.card?.rows.find((r) => r.kind === "CHECK_IN");
    // A refusal while the card waits points at it: the first milestone's title emptied, accept refuses and names the card.
    const m1 = rowsOf(b.w, b.id, 1)[0];
    const title = m1.title;
    m1.title = "";
    const named = errOf(await S.acceptCore(USER, b.id, { overAccepted: false }, NOW, realDeps(b.w)));
    m1.title = title;
    const said = await answerCard(b.id, realDeps(b.w), ["CHECK_IN"], { now: at(1_000) });
    const after = kindsIn(b.w, b.id);
    return [
      b.rows.length > 2 &&
        b.rows.every((r) => waitingRow(r, ["PLAN_AHEAD", "KEEP_A_LOG"])) &&
        b.rows[0].includes("PLAN_AHEAD") &&
        b.rows[b.rows.length - 1].includes("KEEP_A_LOG") &&
        b.card?.on === true &&
        json(b.card.safeKinds) === json(["PLAN_AHEAD", "KEEP_A_LOG"]) &&
        checkIn?.state === "PENDING" &&
        checkIn.prefill === "AVOID" &&
        b.view.draft?.acceptable === true &&
        named === pointed("Name milestone 1.") &&
        said.ok &&
        after.every((r) => r.includes("SET_TIME")) &&
        !after.flat().includes("CHECK_IN"),
      json({ before: b.rows, card: b.card, acceptable: b.view.draft?.acceptable, named, said, after }),
    ];
  });

  {
    // The answer's refusals, its one writer and its guard (fixture lanes).
    const w = world();
    const id = await newDraft(w, kneeIntake);
    const key = (await cardAnswerOf(depsFor(w), [])).key;
    const card = (avoid: readonly string[], none = false, k = key): ActivityCardAnswer => ({ key: k, avoid: [...avoid] as CatalogKey[], nothingToAvoid: none });
    eq("setActivityVerdicts refuses with writes off", errOf(await S.setActivityVerdictsCore(USER, id, card(["LONGER_SESSION"]), NOW, { ...depsFor(w), env: WRITES_OFF })), ROADMAP_WRITES_OFF);
    eq(
      "…refuses a kind off the plan's track (a Field kind on a BODY plan), a prototype name, ticks together with “Nothing to avoid”, a malformed answer and none at all (ACTIVITY_ANSWER_REFUSAL)",
      [
        errOf(await S.setActivityVerdictsCore(USER, id, card(["RECALL_DRILLS"]), NOW, depsFor(w))),
        errOf(await S.setActivityVerdictsCore(USER, id, card(["__proto__"]), NOW, depsFor(w))),
        errOf(await S.setActivityVerdictsCore(USER, id, card(["LONGER_SESSION"], true), NOW, depsFor(w))),
        errOf(await S.setActivityVerdictsCore(USER, id, { key, avoid: "LONGER_SESSION" } as unknown as ActivityCardAnswer, NOW, depsFor(w))),
        errOf(await S.setActivityVerdictsCore(USER, id, null as unknown as ActivityCardAnswer, NOW, depsFor(w))),
      ],
      Array(5).fill(ACTIVITY_ANSWER_REFUSAL)
    );
    eq(
      "…refuses a Save with nothing ticked (ACTIVITY_NOTHING_TICKED: an unticked row is never taken as fine) and an answer given against other words (ACTIVITY_ANSWER_STALE); nothing is stored",
      [errOf(await S.setActivityVerdictsCore(USER, id, card([]), NOW, depsFor(w))), errOf(await S.setActivityVerdictsCore(USER, id, card([], true, "k1-00000000"), NOW, depsFor(w))), intakeActivitiesOf(w, id)],
      [ACTIVITY_NOTHING_TICKED, ACTIVITY_ANSWER_STALE, null]
    );
    check("…refuses another user's roadmap", !(await S.setActivityVerdictsCore("someone-else", id, card(["LONGER_SESSION"]), NOW, depsFor(w))).ok);
    // Typed coverage figures share the column: the answer keeps them, and the stored reason is the server's quote.
    const row = () => w.t.roadmap.find((r) => r.id === id) as RoadmapRec;
    row().coverage = { "d-prob": 30 };
    const said = await S.setActivityVerdictsCore(USER, id, card(["LONGER_SESSION"]), NOW, depsFor(w));
    check(
      "the answer is stored under Roadmap.coverage['$activities'] beside the typed figures (coverageJsonOf, the one writer), the reason quoted from the user's words, and no FINE is ever written",
      said.ok && (row().coverage as Record<string, unknown>)["d-prob"] === 30 && intakeActivitiesOf(w, id)?.kinds.LONGER_SESSION?.reason === "knee injury, no running" && !json(row().coverage).includes("FINE"),
      json(row().coverage)
    );
    // An answer racing an intake save of the same words: the guard on the row as read makes the later one re-read, never overwrite.
    const both = await Promise.all([S.setActivityVerdictsCore(USER, id, card(["STRENGTH_SESSION"]), at(5_000), depsFor(w)), S.saveIntakeCore(USER, kneeIntake, at(6_000), depsFor(w))]);
    const stored = intakeActivitiesOf(w, id);
    check(
      "an answer and an intake save at once: both land, neither drops the other's write (the second answer's ticks replace the first's)",
      both.every((r) => r.ok) && stored?.kinds.STRENGTH_SESSION?.verdict === "AVOID" && stored.kinds.LONGER_SESSION == null && stored.answered != null,
      json([both, stored])
    );
    check("…the guard's SQL reads the row's updatedAt", SERVER_SRC.includes('const unwritten = g.updatedAt != null ? Prisma.sql`AND "updatedAt" = ${g.updatedAt}`'));
    check(
      "…intakeOf reads the answers with activityConfirmOf (and the practice family with practiceFamilyOfCoverage), intakeData writes the column with coverageJsonOf (the family beside them, contracts §20.11)",
      /activities: activityConfirmOf\(r\.coverage\)/.test(SERVER_SRC) &&
        /practiceFamily: r\.fieldId != null \? practiceFamilyOfCoverage\(r\.coverage\)/.test(SERVER_SRC) &&
        /coverage: coverageJsonOf\(i\.coverage \?\? null, i\.activities \?\? null, /.test(SERVER_SRC)
    );
    const ACTION_SRC = readFileSync(join(__dirname, "../src/app/actions/roadmap.ts"), "utf8");
    check(
      "the action takes an ActivityCardAnswer and cleans its shape (a string key, an array of strings, a boolean); the earlier per-kind list is refused, never read as an answer",
      /export async function setActivityVerdicts\(roadmapId: string, answer: ActivityCardAnswer\)/.test(ACTION_SRC) &&
        /typeof o\.key !== "string"/.test(ACTION_SRC) &&
        /avoid\.every\(\(k\) => typeof k === "string"\)/.test(ACTION_SRC) &&
        /typeof o\.nothingToAvoid !== "boolean"/.test(ACTION_SRC) &&
        /!Array\.isArray\(answer\)/.test(ACTION_SRC)
    );
  }

  {
    // A pick from the type list: a kind the gate blocks is added only once the user's answer leaves it unticked.
    const w = world();
    const id = await drafted(w, { milestones: [{ practices: [] }, {}] }, kneeIntake);
    const m1 = () => rowsOf(w, id, 1)[0];
    // The progression fills the stage (contracts §20): the user takes out code's practices to make room for theirs.
    const makeRoom = async () => {
      for (const it of itemsOf(w, m1().id).filter((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED" && i.origin !== "USER")) await S.decideItemCore(USER, it.id, "REMOVED", NOW, depsFor(w));
    };
    await makeRoom();
    const waits = await S.addItemCore(USER, m1().id, { kind: "PRACTICE", catalogKey: "LONGER_SESSION" }, NOW, depsFor(w));
    const safe = await S.addItemCore(USER, m1().id, { kind: "PRACTICE", catalogKey: "MOBILITY_SESSION" }, NOW, depsFor(w));
    await answerCard(id, depsFor(w), ["TECHNIQUE_SESSION"]);
    // The answer released kinds the progression places there (never one the user removed): room again for the user's pick.
    await makeRoom();
    const fine = await S.addItemCore(USER, m1().id, { kind: "PRACTICE", catalogKey: "LONGER_SESSION" }, NOW, depsFor(w));
    const avoided = await S.addItemCore(USER, m1().id, { kind: "PRACTICE", catalogKey: "TECHNIQUE_SESSION" }, NOW, depsFor(w));
    eq("a pick of a gated kind waits for the user's answer; a safe one is added; once the answer leaves it unticked it is; an avoided safe one isn't", [errOf(waits), safe.ok, fine.ok, errOf(avoided)], [S.ACTIVITY_WAITING_PICK, true, true, S.ACTIVITY_AVOIDED_PICK]);
    check(
      "…the gate's refusals name the card (“Activities to avoid”) and the act, never “fine”, so no second pointer is added",
      [S.ACTIVITY_WAITING_PICK, S.ACTIVITY_AVOIDED_PICK, S.ACTIVITY_WAITING_START].every((m) => m.includes(ACTIVITY_CARD_NAME) && !m.includes(ACTIVITY_PENDING_POINTER) && !/\bfine\b/i.test(m)) && !/\bfine\b/i.test(S.ACTIVITY_HELD_IN_DRAFT)
    );
  }

  {
    // An accepted plan: the answer offers a re-plan; Start holds the avoided kind back (no task, no quest); an AVOID after
    // Start pauses the started task (decision 4); the re-plan drops it.
    const QS = await import("../src/lib/roadmap-quests-server");
    const w = world();
    const id = await newDraft(w, kneeIntake);
    await answerCard(id, depsFor(w), ["LONGER_SESSION"]);
    {
      const tasks: (() => Promise<void> | void)[] = [];
      const reply = { milestones: [{ practices: [{ name: "a", method: "X" }, { name: "b", method: "X" }] }, { practices: [{ name: "c", method: "X" }] }] };
      await S.claimDraftCore(USER, id, { force: true }, NOW, depsFor(w, { defer: (t) => tasks.push(t), callModel: async () => reply, clock: () => NOW }));
      for (const t of tasks) await t();
    }
    const kept = await S.confirmSessionPicksCore(USER, id, "KEEP", NOW, depsFor(w));
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
    const m1 = rowsOf(w, id, 1)[0];
    // v4 (contracts §20): Gemini's pick is the first stage's focus (Harder session, kept); the progression's other practices
    // on it (its partner, the mobility session, and the easy session) are code's. The mobility session is the one followed.
    const harder = itemsOf(w, m1.id).find((i) => i.catalogKey === "HARDER_SESSION");
    const strength = itemsOf(w, m1.id).find((i) => i.catalogKey === "MOBILITY_SESSION");
    const others = itemsOf(w, m1.id).filter((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED" && i.catalogKey !== "HARDER_SESSION");
    const said = await answerCard(id, depsFor(w), ["LONGER_SESSION", "HARDER_SESSION"]);
    check(
      "on an ACTIVE plan the answer rewrites nothing accepted and offers a re-plan (an unstarted milestone holds a kind it now blocks); nothing started, so nothing is paused",
      kept.ok && acc.ok && said.ok && said.value.replan === true && json(said.value.paused) === "[]" && itemsOf(w, m1.id).some((i) => i.catalogKey === "HARDER_SESSION" && i.decision !== "REMOVED"),
      json([kept, acc, said])
    );
    const store = questStoreOf(w);
    const lanes: Partial<RoadmapLanes> = {
      ...lanesFor(w),
      weekQuestSetFor: (userId, milestoneId, weekStart, now, opts) => QS.weekQuestSetFor(userId, milestoneId, weekStart, now, { ...opts, store, env: WRITES_ON }),
      loadWeekQuests: (userId, now) => QS.loadWeekQuests(userId, now, { store, env: WRITES_ON }),
    };
    const preview = await S.startPreview(USER, m1.id, NOW, depsFor(w, { lanes }));
    check(
      "the Start sheet lists no practice the answer holds back (the progression's other practices go to Today, the mobility session among them)",
      !!strength && json(preview?.practices.map((p) => p.lineageId)) === json(others.map((i) => i.lineageId)) && !(preview?.todayRows ?? []).some((r) => r.itemId === harder?.id),
      json(preview?.practices)
    );
    const st = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w, { lanes }));
    const started = itemsOf(w, m1.id);
    const titles = w.templates.map((t) => t.title);
    const set = w.t.questWeeks.find((q) => q.milestoneId === m1.id)?.set;
    const practiceQuests = (set?.quests ?? []).filter((q) => q.kind === "PRACTICE").map((q) => (q as { templateId: string }).templateId);
    const strengthTpl = started.find((i) => i.catalogKey === "MOBILITY_SESSION")?.templateId;
    const otherTpls = others.map((o) => started.find((i) => i.id === o.id)?.templateId);
    check(
      "Start creates no task for the held kind (off Today on the started milestone), the other practices start, and the week's quests name only them",
      st.ok && !titles.includes(harder?.label ?? "-") && titles.includes(strength?.label ?? "-") && started.find((i) => i.catalogKey === "HARDER_SESSION")?.addToToday === false && json([...practiceQuests].sort()) === json([...otherTpls].sort()) && practiceQuests.includes(strengthTpl as string),
      json([st, titles, practiceQuests, strengthTpl])
    );
    // Decision 4: the AVOID after Start pauses the started practice's Today task at once (archived through the task path,
    // never deleted), and the answer names it for the page's quiet notice and its Undo (the Today task's unarchive).
    const templatesBefore = w.templates.length;
    const strengthItem = started.find((i) => i.catalogKey === "MOBILITY_SESSION");
    const strengthMeasure = () =>
      w.t.roadmapMeasure.find((x) => x.milestoneId === m1.id && x.kind === "PRACTICE_KEPT" && (x.itemLineageId === strengthItem?.lineageId || json(x.scope).includes(strengthItem?.lineageId ?? "-")));
    const roleBefore = strengthMeasure()?.role;
    const after = await answerCard(id, depsFor(w), ["LONGER_SESSION", "HARDER_SESSION", "MOBILITY_SESSION"], { now: at(1_000) });
    const tpl = w.templates.find((t) => t.id === strengthTpl);
    check(
      "decision 4: an AVOID given after Start pauses the started practice's Today task at once — archived through the task path, never deleted — and lists it for the notice and its Undo",
      after.ok &&
        !!tpl &&
        tpl.archivedAt != null &&
        w.templates.length === templatesBefore &&
        json(after.value.paused) === json([{ templateId: strengthTpl, title: tpl.title, kind: "MOBILITY_SESSION", deferredTo: null }]) &&
        json(after.value.notPaused) === "[]",
      json([after, tpl])
    );
    check(
      "ruling 2: the pause goes through the safety pause (RoadmapIo.pauseTemplate → tasks.ts pauseForSafetyCore), never archiveCore's deferral, so the task is off Today now (deferredTo null)",
      !!strengthTpl && w.paused.includes(strengthTpl) && /e\.io\.pauseTemplate\(userId, x\.templateId, now\)/.test(SERVER_SRC) && /pauseForSafetyCore\(userId, templateId, now\)/.test(SERVER_SRC),
      json(w.paused)
    );
    // Ruling 3: the paused practice stops counting toward the started milestone from the pause day, in the answer's own write,
    // and the page can say why (its measure stops paying; the card's AVOID row carries the day the user said so).
    const pausedView = await S.loadRoadmapView(USER, at(1_200), depsFor(w));
    const pausedRow = pausedView.current?.measures.find((x) => x.kind === "PRACTICE_KEPT" && x.measureKey === strengthMeasure()?.measureKey);
    const avoidRow = pausedView.activityConfirm?.rows.find((r) => r.kind === "MOBILITY_SESSION");
    check(
      "ruling 3: the paused practice's PRACTICE_KEPT measure stops paying (PAYS → CONTEXT, in the answer's own write): from the pause day no g, reach or pay reads it and nothing more is asked of it (no pace; planned so far stops the day before the pause); the card's AVOID row says why and since when",
      roleBefore === "PAYS" &&
        strengthMeasure()?.role === "CONTEXT" &&
        pausedRow?.role === "CONTEXT" &&
        pausedRow.pace == null &&
        pausedView.current?.practiceKept?.[strengthItem?.lineageId ?? "-"]?.of === 0 &&
        avoidRow?.state === "AVOID" &&
        avoidRow.day === TODAY,
      json({ roleBefore, role: strengthMeasure()?.role, pausedRow, kept: pausedView.current?.practiceKept, avoidRow })
    );
    // The user brings it back (Undo); answering again with the same ticks pauses nothing again.
    if (tpl) tpl.archivedAt = null;
    const again = await answerCard(id, depsFor(w), ["LONGER_SESSION", "HARDER_SESSION", "MOBILITY_SESSION"], { now: at(1_500) });
    check("…a kind already avoided before an answer isn't paused again (the user brought its task back with Undo)", again.ok && json(again.value.paused) === "[]" && tpl?.archivedAt == null, json(again));
    // The pause refused (still on Today: the page names it); then a must (ruling 2): the archive path that would defer it
    // (archiveCore's akrasia horizon) is never called, and the task leaves Today at once.
    const ioWith = (io: Partial<RoadmapIo>): RoadmapDeps => depsFor(w, { io: { ...w.io(), ...io } });
    await answerCard(id, depsFor(w), ["LONGER_SESSION", "HARDER_SESSION"], { now: at(1_600) });
    const refusedArchive = await answerCard(
      id,
      ioWith({ pauseTemplate: async () => ({ ok: false, error: "Something changed at the same moment. Try again." }) }),
      ["LONGER_SESSION", "HARDER_SESSION", "MOBILITY_SESSION"],
      { now: at(1_700) }
    );
    await answerCard(id, depsFor(w), ["LONGER_SESSION", "HARDER_SESSION"], { now: at(1_800) });
    const deferrals: string[] = [];
    const must = await answerCard(
      id,
      ioWith({
        archiveTemplate: async (_userId, templateId) => {
          deferrals.push(templateId);
          return { ok: true, deferredTo: addDays(TODAY, 7) };
        },
      }),
      ["LONGER_SESSION", "HARDER_SESSION", "MOBILITY_SESSION"],
      { now: at(1_900) }
    );
    check(
      "…a pause the task path refuses is listed as still on Today (notPaused), never thrown; ruling 2: a must is paused at once (the deferring archive is never called, deferredTo null, off Today now)",
      refusedArchive.ok &&
        json(refusedArchive.value.paused) === "[]" &&
        json(refusedArchive.value.notPaused.map((t) => t.templateId)) === json([strengthTpl]) &&
        must.ok &&
        json(must.value.paused.map((t) => [t.templateId, t.deferredTo])) === json([[strengthTpl, null]]) &&
        deferrals.length === 0 &&
        tpl?.archivedAt != null,
      json([refusedArchive, must, deferrals])
    );
    check(
      "…ruling 3: the measure stays off the target through the Undo and the answers after it (the AVOID still stands; it never pays again on its own)",
      strengthMeasure()?.role === "CONTEXT",
      json(strengthMeasure())
    );
    // The answer after Start: next week's set (R6 reads the gate from the row's own words and answers) holds no quest for it.
    const nextWeek = await QS.weekQuestSetFor(USER, m1.id, addDays(weekStartKeyOf(TODAY), 7), at(2_000), { store, env: WRITES_ON });
    const nextPractice = (nextWeek?.quests ?? []).filter((q) => q.kind === "PRACTICE").map((q) => (q as { templateId: string }).templateId);
    check(
      "an answer given after Start: the next week's quests skip the avoided practice (R6's own reading of the gate), and keep the progression's others",
      !!nextWeek && !nextPractice.includes(strengthTpl as string) && nextPractice.length === otherTpls.length - 1,
      json(nextWeek?.quests)
    );
    const re = await S.replanCore(USER, id, "REFIT", at(3_000), depsFor(w));
    const replanned = rowsOf(w, id, 2).flatMap((m) => itemsOf(w, m.id)).filter((i) => i.decision !== "REMOVED").map((i) => i.catalogKey);
    check("the re-plan keeps no avoided kind (the user's kept pick of it is REMOVED, their own decision)", re.ok && !replanned.includes("HARDER_SESSION") && !replanned.includes("MOBILITY_SESSION") && !replanned.includes("LONGER_SESSION"), json([re, replanned]));
  }

  {
    // Decision 5 (the verifier's S1): a Gemini pick the user kept is theirs (CHECKED). When their words change, the card
    // asks again and the kept pick is held: it stays their row, but accept refuses (pointing at the card) until they answer.
    const w = world();
    const id = await newDraft(w, kneeIntake);
    await answerCard(id, depsFor(w), [], { none: true });
    {
      const tasks: (() => Promise<void> | void)[] = [];
      const reply = { milestones: [{ practices: [{ name: "a", method: "X" }] }, { practices: [{ name: "b", method: "X" }] }] };
      await S.claimDraftCore(USER, id, { force: true }, NOW, depsFor(w, { defer: (t) => tasks.push(t), callModel: async () => reply, clock: () => NOW }));
      for (const t of tasks) await t();
    }
    const kept = await S.confirmSessionPicksCore(USER, id, "KEEP", NOW, depsFor(w));
    const live = () => rowsOf(w, id, 1).flatMap((m) => itemsOf(w, m.id)).filter((i) => i.catalogKey === "HARDER_SESSION" && i.decision !== "REMOVED");
    const keptRows = live().map((i) => [i.lineageId, i.decision]);
    const reworded = await S.saveIntakeCore(USER, { ...kneeIntake, constraints: "knee injury, no running. Torn ACL, surgery next month." }, at(1_000), depsFor(w));
    const held = live().map((i) => [i.lineageId, i.decision]);
    const view = await S.loadRoadmapView(USER, at(2_000), depsFor(w));
    const refused = errOf(await S.acceptCore(USER, id, { overAccepted: false }, at(2_000), depsFor(w)));
    const answered = await answerCard(id, depsFor(w), [], { none: true, now: at(3_000) });
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, at(4_000), depsFor(w));
    check(
      "decision 5: a kept pick of a kind whose answer went stale stays the user's row but is held — the draft isn't acceptable and accept refuses, pointing at the card; answering again lets it through",
      kept.ok &&
        keptRows.length > 0 &&
        keptRows.every(([, d]) => d === "CHECKED") &&
        reworded.ok &&
        json(held) === json(keptRows) &&
        view.draft?.acceptable === false &&
        view.draft.activityConfirm?.rows.find((r) => r.kind === "HARDER_SESSION")?.state === "PENDING" &&
        refused === pointed(S.ACTIVITY_HELD_IN_DRAFT) &&
        answered.ok &&
        json(live().map((i) => [i.lineageId, i.decision])) === json(keptRows) &&
        acc.ok,
      json({ kept, keptRows, held, acceptable: view.draft?.acceptable, refused, answered, acc })
    );
  }

  {
    // A draft that still holds a kind the gate now blocks never becomes the plan.
    const w = world();
    const id = await newDraft(w, kneeIntake);
    await answerCard(id, depsFor(w), ["LONGER_SESSION"]);
    {
      const tasks: (() => Promise<void> | void)[] = [];
      const reply = { milestones: [{ practices: [{ name: "a", method: "X" }] }, { practices: [{ name: "b", method: "X" }] }] };
      await S.claimDraftCore(USER, id, { force: true }, NOW, depsFor(w, { defer: (t) => tasks.push(t), callModel: async () => reply, clock: () => NOW }));
      for (const t of tasks) await t();
    }
    // The answer made stale under the draft (as a row written before this round could hold it): the gate blocks the pick again.
    const row = w.t.roadmap.find((r) => r.id === id) as RoadmapRec;
    const stored = intakeActivitiesOf(w, id);
    row.coverage = { $activities: { ...stored, key: "k1-00000000" } };
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    eq("accept refuses a draft that still holds a kind the gate now blocks, and points at the card", [view.draft?.acceptable, errOf(await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w)))], [false, pointed(S.ACTIVITY_HELD_IN_DRAFT)]);
  }

  // ═══ §19 follow-ups (the lead's rulings 2 and 3, decision 2's reach, decision 4's race, the re-gate on new words) ═══
  console.log("— §19 follow-ups: every refusal points at the card, the re-gate on new words, Start's race with an AVOID —");

  {
    // Decision 2 as the lead ruled it: every refusal while the card waits points at it — re-plan, the review's edits and the
    // builds too, beside accept, Start and a pick. Never twice, never with writes off, never on a plan that doesn't ask, and
    // not once the card is answered.
    const w = world();
    const id = await drafted(w, { milestones: [{ practices: [] }, {}] }, kneeIntake);
    const m1 = () => rowsOf(w, id, 1)[0];
    const claimed = await S.claimDraftCore(USER, id, { force: true }, NOW, depsFor(w));
    const running = errOf(await S.claimDraftCore(USER, id, { force: true }, NOW, depsFor(w)));
    const replanned = errOf(await S.replanCore(USER, id, "REFIT", NOW, depsFor(w)));
    const edited = errOf(await S.editItemCore(USER, m1().id, {}, NOW, depsFor(w)));
    const decided = errOf(await S.decideItemCore(USER, m1().id, "BOGUS" as never, NOW, depsFor(w)));
    const remedied = errOf(await S.applyRemedyCore(USER, id, "BOGUS" as never, NOW, depsFor(w)));
    const writesOff = errOf(await S.replanCore(USER, id, "REFIT", NOW, { ...depsFor(w), env: WRITES_OFF }));
    const pick = errOf(await S.addItemCore(USER, m1().id, { kind: "PRACTICE", catalogKey: "LONGER_SESSION" }, NOW, depsFor(w)));
    check(
      "decision 2 (the lead's ruling): a refusal from a build (Gemini's claim), a re-plan, an edit, a decision and a remedy while the card waits points at it; a pick's own refusal names it once; writes off is left as it is",
      claimed.ok &&
        running === pointed(S.DRAFT_RUNNING) &&
        replanned === pointed("Only an accepted roadmap is re-planned.") &&
        edited === pointed("Nothing to change.") &&
        decided.endsWith(ACTIVITY_PENDING_POINTER) &&
        remedied.endsWith(ACTIVITY_PENDING_POINTER) &&
        writesOff === ROADMAP_WRITES_OFF &&
        pick === S.ACTIVITY_WAITING_PICK &&
        pick.split(ACTIVITY_CARD_NAME).length === 2,
      json({ claimed, running, replanned, edited, decided, remedied, writesOff, pick })
    );
    const answered = await answerCard(id, depsFor(w), [], { none: true, now: at(1_000) });
    eq("…once the card is answered nothing waits, so the same refusal is left as it is", [answered.ok, errOf(await S.replanCore(USER, id, "REFIT", at(2_000), depsFor(w)))], [true, "Only an accepted roadmap is re-planned."]);
    const field = world();
    const fieldId = await drafted(field);
    eq("…a Field plan never asks, so its refusals are never pointed", errOf(await S.replanCore(USER, fieldId, "REFIT", NOW, depsFor(field))), "Only an accepted roadmap is re-planned.");
    eq("…another user's roadmap: the refusal says nothing about the card", errOf(await S.replanCore("someone-else", id, "REFIT", NOW, depsFor(w))), "That roadmap no longer exists.");
    const POINTED = [
      "replanCore",
      "claimDraftCore",
      "buildStarterCore",
      "startManualCore",
      "acceptCore",
      "startMilestoneCore",
      "editItemCore",
      "decideItemCore",
      "addItemCore",
      "keepUnflaggedCore",
      "resolveDomainCore",
      "moveLineCore",
      "setLineDomainCore",
      "applyRemedyCore",
      "confirmSessionPicksCore",
      "confirmDomainAdditionsCore",
      "lowerDepthCore",
      "keepCalibratedDatesCore",
    ];
    const unpointed = POINTED.filter((n) => !(new RegExp(`export async function ${n}\\([\\s\\S]*?\\n\\}\\n`).exec(SERVER_SRC)?.[0] ?? "").includes("pointedRefusal("));
    check("…every re-plan, review edit, build, accept and Start core returns through pointedRefusal", unpointed.length === 0, unpointed.join(", "));
  }

  await integration("§19 new words on an answered CARE or CRAFT draft (the verifier's M4): the intake save re-gates its rows as the answer's own write does — Gemini's picks of a kind that waits again leave, and the track's safe kinds take the place the starter gives them, so no stage is left empty and the draft stays acceptable; a fresh build of the new words places the same (real R2, R3)", async () => {
    const CARE_GATED = ["SET_TIME", "CHECK_IN", "ADMIN_SESSION", "PERFORMANCE_CHECK"];
    const CRAFT_GATED = ["SLOW_DRILLS", "RUN_THROUGHS", "WITH_A_PARTNER", "FULL_ATTEMPT", "PERFORMANCE_CHECK"];
    const reword = async (intake: Intake, words: string) => {
      const w = world();
      const id = await newDraft(w, intake);
      const said = await answerCard(id, realDeps(w), [], { none: true, now: at(1_000) });
      // Gemini's keys-only plan (the first kind each stage's schema offers), its session picks not confirmed yet.
      const tasks: (() => Promise<void> | void)[] = [];
      const deps = realDeps(w, { defer: (t) => tasks.push(t), callModel: async (req) => sdkReply(replyFromSchema((req as { responseSchema?: unknown }).responseSchema)), clock: () => NOW });
      const c = await S.claimDraftCore(USER, id, { force: true }, at(1_500), deps);
      if (!c.ok) throw new Error(`${intake.track}: ${c.error}`);
      for (const t of tasks) await t();
      const answered = kindsIn(w, id);
      const saved = await S.saveIntakeCore(USER, { ...intake, constraints: words }, at(2_000), realDeps(w));
      const after = kindsIn(w, id);
      const view = await S.loadRoadmapView(USER, at(3_000), realDeps(w));
      const fresh = await built({ ...intake, constraints: words });
      return { said: said.ok, saved: saved.ok, answered, after, fresh: fresh.rows, acceptable: view.draft?.acceptable, pending: view.draft?.activityConfirm?.pending ?? 0 };
    };
    const care = await reword(careIntake, "No visits on weekdays, phone calls only. Mum had a fall last week.");
    const craft = await reword({ ...craftIntake, constraints: "Wrist tendinitis, can't play more than 20 minutes." }, "Wrist tendinitis, can't play more than 15 minutes.");
    const safeIn = (rows: string[][], safe: string[]) => rows.map((r) => r.filter((k) => safe.includes(k)).sort());
    const holds = (r: Awaited<ReturnType<typeof reword>>, gated: string[], safe: string[]) =>
      r.said &&
      r.saved &&
      r.answered.flat().some((k) => gated.includes(k)) &&
      r.after.length > 0 &&
      r.after.every((row) => waitingRow(row, safe)) &&
      json(safeIn(r.after, safe)) === json(safeIn(r.fresh, safe)) &&
      r.acceptable === true &&
      r.pending > 0;
    return [holds(care, CARE_GATED, ["PLAN_AHEAD", "KEEP_A_LOG"]) && holds(craft, CRAFT_GATED, ["TECHNIQUE_SESSION"]), json({ care, craft })];
  });

  await integration("§19 a track switch on an answered draft (the fifth verifier's srvprobe6): a BODY draft answered (avoid Full attempt) and built, then saved as CARE under the same words, is rebuilt for CARE in that write — no BODY row is left, whatever its decision, and each stage holds what a fresh CARE build places (its safe kinds while its card asks) — so it is accepted, started and re-planned with no tripwire; saved back as BODY its BODY answer holds again and the rows are the BODY build's (real R2, R3)", async () => {
    const body: Intake = { ...INTAKE, aim: "Run a half marathon in under 2 hours", fieldId: null, track: "BODY", domainIds: [], constraints: "Knee pain on long runs.", dateMode: "CHOSEN", targetDay: addDays(TODAY, 300) };
    const care: Intake = { ...body, track: "CARE" };
    const w = world();
    const id = await newDraft(w, body);
    const said = await answerCard(id, realDeps(w), ["FULL_ATTEMPT"], { now: at(1_000) });
    const build = await S.buildStarterCore(USER, id, at(1_500), realDeps(w));
    const bodyRows = kindsIn(w, id);
    // Every item of the draft (REMOVED ones too) of a kind the track doesn't use.
    const offTrack = (track: string) =>
      rowsOf(w, id, 1)
        .flatMap((m) => itemsOf(w, m.id))
        .filter((i) => i.catalogKey && !(catalogEntryOf(i.catalogKey)?.tracks as readonly string[] | undefined)?.includes(track))
        .map((i) => `${i.catalogKey}:${i.decision}`);
    const toCare = await S.saveIntakeCore(USER, care, at(2_000), realDeps(w));
    const careRows = kindsIn(w, id);
    const careOff = offTrack("CARE");
    const careView = await S.loadRoadmapView(USER, at(2_500), realDeps(w));
    const fresh = await built(care);
    const toBody = await S.saveIntakeCore(USER, body, at(3_000), realDeps(w));
    const bodyAgain = kindsIn(w, id);
    const bodyOff = offTrack("BODY");
    const bodyView = await S.loadRoadmapView(USER, at(3_500), realDeps(w));
    const toCare2 = await S.saveIntakeCore(USER, care, at(4_000), realDeps(w));
    for (const m of rowsOf(w, id, 1).filter((x) => x.status === "DRAFT")) await decideAll(w, id, m.id);
    const acc = await S.acceptCore(USER, id, { overAccepted: true }, at(5_000), realDeps(w));
    const m1 = rowsOf(w, id, 1).find((m) => m.status === "PLANNED");
    const st = m1 ? await S.startMilestoneCore(USER, m1.id, { ...START_ALL, overAccepted: true }, at(6_000), realDeps(w)) : null;
    const onToday = m1 ? itemsOf(w, m1.id).filter((i) => i.templateId).map((i) => i.catalogKey) : [];
    const rp = await S.replanCore(USER, id, "REFIT", at(7_000), realDeps(w));
    const sorted = (rows: string[][]) => json(rows.map((r) => [...r].sort()));
    return [
      said.ok &&
        build.ok &&
        bodyRows.flat().some((k) => ["HARDER_SESSION", "LONGER_SESSION", "STRENGTH_SESSION"].includes(k)) &&
        toCare.ok &&
        careOff.length === 0 &&
        careRows.length > 0 &&
        careRows.every((r) => waitingRow(r, ["PLAN_AHEAD", "KEEP_A_LOG"])) &&
        sorted(careRows) === sorted(fresh.rows) &&
        careView.draft?.acceptable === true &&
        (careView.draft.activityConfirm?.pending ?? 0) > 0 &&
        toBody.ok &&
        bodyOff.length === 0 &&
        sorted(bodyAgain) === sorted(bodyRows) &&
        bodyView.draft?.activityConfirm?.pending === 0 &&
        toCare2.ok &&
        acc.ok &&
        !!st &&
        st.ok &&
        onToday.length > 0 &&
        onToday.every((k) => k === "PLAN_AHEAD" || k === "KEEP_A_LOG" || k === "SET_UP") &&
        rp.ok,
      json({ said, build, bodyRows, toCare, careRows, careOff, fresh: fresh.rows, careCard: careView.draft?.activityConfirm?.pending, acceptable: careView.draft?.acceptable, toBody, bodyAgain, bodyOff, bodyCard: bodyView.draft?.activityConfirm?.pending, acc, st, onToday, rp }),
    ];
  });

  {
    // The fifth verifier's row 5 (R4's half): the session-picks words name what the swap places on the plan's own track
    // (cueSafeKindsOf, less a safe kind the user said to avoid), as R5's button does.
    const words = (track: "BODY" | "CARE" | "CRAFT" | null, blocked: CatalogKey[] = []) => {
      const gate = track ? { track, blocked } : { blocked };
      return [S.confirmPicksOf(gate), S.picksChoiceRefusalOf(gate)];
    };
    eq(
      "CONFIRM_PICKS and the invalid-choice refusal name the track's own safe practices: BODY's sessions (CONFIRM_PICKS as it was; a gate with no track reads as BODY's), CARE's Plan the week ahead and Keep a log, CRAFT's technique session; one the user avoided is left out, and with every one avoided they say “leave them out”",
      [words("BODY"), words(null), words("CARE"), words("CARE", ["KEEP_A_LOG"]), words("CARE", ["PLAN_AHEAD", "KEEP_A_LOG"]), words("BODY", ["MOBILITY_SESSION", "FULL_ATTEMPT"]), words("CRAFT")],
      [
        [S.CONFIRM_PICKS, "Keep the picks, or use easy, mobility and technique sessions."],
        [S.CONFIRM_PICKS, "Keep the picks, or use easy, mobility and technique sessions."],
        ["Confirm Gemini's session picks first: keep them, or use Plan the week ahead and Keep a log.", "Keep the picks, or use Plan the week ahead and Keep a log."],
        ["Confirm Gemini's session picks first: keep them, or use Plan the week ahead.", "Keep the picks, or use Plan the week ahead."],
        ["Confirm Gemini's session picks first: keep them, or leave them out.", "Keep the picks, or leave them out."],
        ["Confirm Gemini's session picks first: keep them, or use easy and technique sessions.", "Keep the picks, or use easy and technique sessions."],
        ["Confirm Gemini's session picks first: keep them, or use technique sessions.", "Keep the picks, or use technique sessions."],
      ]
    );
  }

  await integration("§19 a CARE draft's session picks (the fifth verifier's row 5): accept's blocker and the invalid-choice refusal name Plan the week ahead and Keep a log, never BODY's sessions, and the swap places exactly those (real R2)", async () => {
    // The CARE card answered ("Nothing to avoid") and the plan built; its care sessions then stand as Gemini's picks
    // waiting on the one confirm (GEMINI_PICK, PENDING), as a keys-only draft leaves them.
    const w = world();
    const id = await newDraft(w, careIntake);
    const said = await answerCard(id, realDeps(w), [], { none: true, now: at(1_000) });
    const build = await S.buildStarterCore(USER, id, at(1_500), realDeps(w));
    const marked = rowsOf(w, id, 1)
      .flatMap((m) => itemsOf(w, m.id))
      .filter((i) => i.kind === "PRACTICE" && ["SET_TIME", "CHECK_IN", "ADMIN_SESSION"].includes(i.catalogKey ?? ""));
    for (const i of marked) Object.assign(i, { decision: "PENDING", notes: ["GEMINI_PICK"] });
    const view = await S.loadRoadmapView(USER, at(2_000), realDeps(w));
    const accept = errOf(await S.acceptCore(USER, id, { overAccepted: true }, at(3_000), realDeps(w)));
    const bogus = errOf(await S.confirmSessionPicksCore(USER, id, "BOGUS" as never, at(3_000), realDeps(w)));
    const swapped = await S.confirmSessionPicksCore(USER, id, "EASY", at(4_000), realDeps(w));
    const live = rowsOf(w, id, 1)
      .flatMap((m) => itemsOf(w, m.id))
      .filter((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED")
      .map((i) => i.catalogKey);
    const after = errOf(await S.acceptCore(USER, id, { overAccepted: true }, at(5_000), realDeps(w)));
    const careWords = "Confirm Gemini's session picks first: keep them, or use Plan the week ahead and Keep a log.";
    return [
      said.ok &&
        build.ok &&
        marked.length > 0 &&
        view.draft?.sessionPicks?.decision === "PENDING" &&
        accept === careWords &&
        bogus === "Keep the picks, or use Plan the week ahead and Keep a log." &&
        swapped.ok &&
        live.length > 0 &&
        live.every((k) => k === "PLAN_AHEAD" || k === "KEEP_A_LOG") &&
        !after.startsWith("Confirm Gemini's session picks"),
      json({ said, build, marked: marked.map((i) => i.catalogKey), picks: view.draft?.sessionPicks, accept, bogus, swapped, live, after }),
    ];
  });

  {
    // Decision 4's race (the verifier's R4 follow-up): an AVOID landing while Start's finish is under way — after its gate
    // read, before its template ids are written — still pauses the task it created, and that practice stops counting.
    const startingWorld = async () => {
      const w = world();
      const id = await newDraft(w, kneeIntake);
      await answerCard(id, depsFor(w), ["LONGER_SESSION"]);
      {
        const tasks: (() => Promise<void> | void)[] = [];
        const reply = { milestones: [{ practices: [{ name: "a", method: "X" }, { name: "b", method: "X" }] }, { practices: [{ name: "c", method: "X" }] }] };
        await S.claimDraftCore(USER, id, { force: true }, NOW, depsFor(w, { defer: (t) => tasks.push(t), callModel: async () => reply, clock: () => NOW }));
        for (const t of tasks) await t();
      }
      await S.confirmSessionPicksCore(USER, id, "KEEP", NOW, depsFor(w));
      const acc = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
      const m1 = rowsOf(w, id, 1)[0];
      w.createFailOnce = true;
      const st = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
      // v4 (contracts §20): the progression's partner on the first stage, beside Gemini's kept pick (Harder session).
      const strength = itemsOf(w, m1.id).find((i) => i.catalogKey === "MOBILITY_SESSION");
      if (!acc.ok || st.ok || rowsOf(w, id, 1)[0].status !== "STARTING" || !strength) throw new Error(`fixture: not STARTING: ${json([acc, st])}`);
      const measure = () =>
        w.t.roadmapMeasure.find((x) => x.milestoneId === m1.id && x.kind === "PRACTICE_KEPT" && (x.itemLineageId === strength.lineageId || json(x.scope).includes(strength.lineageId)));
      const task = () => w.templates.find((t) => t.id === itemsOf(w, m1.id).find((i) => i.lineageId === strength.lineageId)?.templateId);
      return { w, id, m1, strength, measure, task };
    };
    const AVOID_ALL = ["LONGER_SESSION", "HARDER_SESSION", "MOBILITY_SESSION"];

    // (a) The answer lands between the finish's gate read and its write: it reads the row STARTING and pauses nothing; the
    // finish re-reads the answers after its write and pauses the task it just created.
    {
      const r = await startingWorld();
      let landed: Awaited<ReturnType<typeof S.setActivityVerdictsCore>> | null = null;
      const base = r.w.io();
      const io: Partial<RoadmapIo> = {
        ...base,
        createTemplate: async (userId, parsed, opts) => {
          if (!landed && parsed.kind !== "GOAL") landed = await answerCard(r.id, depsFor(r.w), AVOID_ALL, { now: at(500) });
          return (base.createTemplate as RoadmapIo["createTemplate"])(userId, parsed, opts);
        },
      };
      const fin = await S.finishStartCore(USER, r.m1.id, at(600), depsFor(r.w, { io }));
      const l = landed as Awaited<ReturnType<typeof S.setActivityVerdictsCore>> | null;
      check(
        "decision 4's race (a): an AVOID landing between Start's gate read and its write-back pauses nothing itself (the row read STARTING), and the finish re-reads the answers after its write and pauses the task it created; that practice stops counting (ruling 3)",
        fin.ok &&
          rowsOf(r.w, r.id, 1)[0].status === "STARTED" &&
          !!l &&
          l.ok &&
          json(l.value.paused) === "[]" &&
          r.task()?.archivedAt != null &&
          r.w.paused.includes(r.task()?.id ?? "-") &&
          r.measure()?.role === "CONTEXT",
        json({ fin, landed: l, task: r.task(), measure: r.measure() })
      );
    }

    // (b) The answer is read while the row is STARTING and saved after the finish (its re-check found nothing to pause): the
    // finish moved the roadmap's updatedAt, so the answer's guard re-reads and it pauses the task itself.
    {
      const r = await startingWorld();
      const updatedBefore = (r.w.t.roadmap.find((x) => x.id === r.id) as RoadmapRec).updatedAt.getTime();
      const base = r.w.store();
      let fin: Awaited<ReturnType<typeof S.finishStartCore>> | null = null;
      let pausedByFinish: string[] = [];
      const store: RoadmapStore = {
        ...base,
        apply: async (userId, ops) => {
          if (!fin) {
            fin = await S.finishStartCore(USER, r.m1.id, at(600), depsFor(r.w));
            pausedByFinish = [...r.w.paused];
          }
          return base.apply(userId, ops);
        },
      };
      const said = await answerCard(r.id, depsFor(r.w, { store }), AVOID_ALL, { now: at(700) });
      const f = fin as Awaited<ReturnType<typeof S.finishStartCore>> | null;
      const updatedAfter = (r.w.t.roadmap.find((x) => x.id === r.id) as RoadmapRec).updatedAt.getTime();
      check(
        "decision 4's race (b): an answer read while the row was STARTING and saved after the finish re-reads (the finish moved the roadmap's updatedAt) and pauses the started task itself; the practice stops counting",
        !!f &&
          f.ok &&
          json(pausedByFinish) === "[]" &&
          updatedAfter > updatedBefore &&
          said.ok &&
          json(said.value.paused.map((t) => t.kind)) === json(["HARDER_SESSION", "MOBILITY_SESSION"]) &&
          said.value.paused.some((t) => t.templateId === r.task()?.id) &&
          r.task()?.archivedAt != null &&
          r.measure()?.role === "CONTEXT",
        json({ fin: f, pausedByFinish, said, task: r.task(), measure: r.measure() })
      );
    }
  }

  // ═══ The practice progression on every plan path (contracts §20; R4, with the real lanes) ═══
  //
  // Code owns the practice progression: the starter, Gemini's keys-only plan (its picks and order only), every re-plan,
  // the activity answer's re-sync and Start all leave each DRAFT stage holding exactly what R2's progression places for the
  // plan (read here with roadmap-realism planProgressionOf at each stage's own room, so the comparison is exact), and that
  // progression keeps every rule roadmap-catalog progressionViolationsOf checks: every stage carries practice, each later one
  // carries the kind the one before trained and its focus never falls, checkpoints escalate, nothing lastStageOnly early, no
  // kind the gate holds.
  console.log("— the practice progression on every plan path (§20, real lanes) —");
  {
    const draftsOf = (w: FakeWorld, id: string, version = 1): MilestoneDraft[] =>
      rowsOf(w, id, version)
        .filter((m) => m.status !== "DISCARDED" && m.status !== "SUPERSEDED")
        .map((m) => S.draftOf({ ...m, items: itemsOf(w, m.id), measures: measuresOf(w, m.id) }));
    const intakeIn = (w: FakeWorld, id: string): Intake => S.intakeOf(w.t.roadmap.find((r) => r.id === id) as RoadmapRec);
    const liveKinds = (m: MilestoneDraft) => m.items.filter((i) => i.decision !== "REMOVED" && !!i.catalogKey);
    const practicesIn = (m: MilestoneDraft) => liveKinds(m).filter((i) => i.kind === "PRACTICE");
    const sortedKinds = (m: MilestoneDraft) => liveKinds(m).map((i) => i.catalogKey as string).sort();
    /** Every breach of a plan path's rows (see the section's head); [] when the rows are the progression and it keeps every rule. */
    const breachesOf = (plan: readonly MilestoneDraft[], intake: Intake): string[] => {
      const facts = { practicesAllowed: intake.fieldId == null || intake.practicesAllowed, trackArea: intake.fieldId == null, examDay: intake.examDay ?? null } as Parameters<typeof REALISM.planProgressionOf>[2];
      const pp = REALISM.planProgressionOf(plan, intake, facts, { room: (m) => practicesIn(m).length || null });
      const blocked = REALISM.blockedKindsOf(intake);
      const out: string[] = [];
      pp.rows.forEach((m, k) => {
        const sp = pp.progression.stages[k];
        if (m.status !== "DRAFT" || sp.held) return;
        const want = [...sp.practices, ...sp.steps, ...(sp.checkpoint ? [sp.checkpoint] : [])].map((x) => x.kind as string).sort();
        if (json(sortedKinds(m)) !== json(want)) out.push(`ROWS ${m.stage}@${k}: ${sortedKinds(m).join(" ")} ≠ ${want.join(" ")}`);
        if (facts.practicesAllowed && practicesIn(m).length === 0) out.push(`EMPTY ${m.stage}@${k}`);
        for (const i of liveKinds(m)) if (blocked.has(i.catalogKey as CatalogKey)) out.push(`GATE ${m.stage}@${k}: ${i.catalogKey}`);
      });
      return [...out, ...progressionViolationsOf(pp.input, pp.progression)];
    };
    const fieldIntake: Intake = { ...INTAKE, dateMode: "REALISTIC", newCardsPerWeek: 20 };
    const starterOf = async (intake: Intake, answer?: { avoid: string[]; none?: boolean }) => {
      const w = world();
      const id = await newDraft(w, intake);
      const res = await S.buildStarterCore(USER, id, NOW, realDeps(w));
      if (!res.ok) throw new Error(`${intake.aim}: ${res.error}`);
      if (answer) {
        const said = await answerCard(id, realDeps(w), answer.avoid, { none: answer.none, now: at(1_000) });
        if (!said.ok) throw new Error(`${intake.aim}: ${said.error}`);
      }
      return { w, id, plan: draftsOf(w, id), intake: intakeIn(w, id) };
    };

    await integration("the starter (\"Build from my numbers\") and the activity answer's re-sync: every DRAFT stage of every track's plan is the practice progression's, under every gate state (R2, R4)", async () => {
      const cases: [string, Intake, { avoid: string[]; none?: boolean } | undefined][] = [
        ["Field", fieldIntake, undefined],
        ["Field, an exam with its day", { ...fieldIntake, examLabel: "SOA Exam P", examDay: addDays(TODAY, 120) }, undefined],
        ["Field, an exam with no day", { ...fieldIntake, examLabel: "SOA Exam P" }, undefined],
        ["Field, practices off", { ...fieldIntake, practicesAllowed: false }, undefined],
        ["Field, timed practice avoided", { ...fieldIntake, examLabel: "SOA Exam P", examDay: addDays(TODAY, 120), constraints: "No timed practice, it stresses me out." }, { avoid: ["TIMED_PRACTICE"] }],
        ["BODY waiting", runIntake, undefined],
        ["BODY, “Nothing to avoid”", runIntake, { avoid: [], none: true }],
        ["BODY, Strength avoided", runIntake, { avoid: ["STRENGTH_SESSION"] }],
        ["BODY, Longer and Harder avoided", runIntake, { avoid: ["LONGER_SESSION", "HARDER_SESSION"] }],
        ["BODY, the activity itself avoided", runIntake, { avoid: ["FULL_ATTEMPT", "PERFORMANCE_CHECK"] }],
        ["CARE waiting", careIntake, undefined],
        ["CARE, Check-in avoided", careIntake, { avoid: ["CHECK_IN"] }],
        ["CRAFT", craftIntake, undefined],
        ["CRAFT with a cue, waiting", { ...craftIntake, constraints: "Wrist tendinitis, can't play more than 20 minutes." }, undefined],
        ["CRAFT with a cue, “Nothing to avoid”", { ...craftIntake, constraints: "Wrist tendinitis, can't play more than 20 minutes." }, { avoid: [], none: true }],
        ["DUTY with an exam", { ...craftIntake, aim: "Pass the driving test", track: "DUTY", examLabel: "the driving test" }, undefined],
      ];
      const bad: string[] = [];
      for (const [label, intake, answer] of cases) {
        const r = await starterOf(intake, answer);
        for (const b of breachesOf(r.plan, r.intake)) bad.push(`${label}: ${b}`);
        if (r.plan.length === 0) bad.push(`${label}: no plan`);
      }
      return [bad.length === 0, bad.slice(0, 8).join(" | ")];
    });

    await integration("“Nothing to avoid” on a waiting BODY draft: the re-sync places the climb, the full attempt and the performance check where a fresh build places them (R2, R4)", async () => {
      const waited = await starterOf(runIntake, { avoid: [], none: true });
      const fresh = await starterOf(runIntake);
      const freshAnswered = await (async () => {
        const w = world();
        const id = await newDraft(w, runIntake);
        await answerCard(id, realDeps(w), [], { none: true });
        await S.buildStarterCore(USER, id, NOW, realDeps(w));
        return draftsOf(w, id);
      })();
      const last = waited.plan[waited.plan.length - 1];
      return [
        json(waited.plan.map(sortedKinds)) === json(freshAnswered.map(sortedKinds)) &&
          json(waited.plan.map(sortedKinds)) !== json(fresh.plan.map(sortedKinds)) &&
          ["FULL_ATTEMPT", "PERFORMANCE_CHECK", "HARDER_SESSION"].every((k) => liveKinds(last).some((i) => i.catalogKey === k)),
        json({ waited: waited.plan.map(sortedKinds), fresh: freshAnswered.map(sortedKinds) }),
      ];
    });

    await integration("a v4 Gemini reply (one pick per stage, the outline's order) through the real pack, schema, walk and validator: each valid pick is its stage's focus (GEMINI_PICK, left to decide), the outline follows Gemini's order, and the rest is code's progression (R2, R3, R4)", async () => {
      const outline: Syllabus = { lines: ["Counting", "Conditional probability", "Bayes", "Random variables", "Expectation", "Variance"], source: null };
      const intake: Intake = { ...fieldIntake, syllabus: outline };
      const w = world();
      requireRealStages(w, intake);
      const id = await newDraft(w, intake);
      const tasks: (() => Promise<void> | void)[] = [];
      let sent: Record<string, string> = {};
      let order: string[] = [];
      let v4 = false;
      const callModel = async (req: unknown) => {
        const props = ((req as { responseSchema?: { properties?: Record<string, unknown> } }).responseSchema?.properties ?? {}) as Record<string, unknown>;
        v4 = "picks" in props;
        // The last kind each stage offers (code's default is the first), and the outline's keys in reverse.
        const enums = (props.picks as { properties?: Record<string, { enum?: string[] }> } | undefined)?.properties ?? {};
        sent = Object.fromEntries(Object.entries(enums).map(([slot, p]) => [slot, (p.enum ?? [])[(p.enum ?? []).length - 1]]).filter(([, k]) => typeof k === "string"));
        order = [...((props.order as { items?: { enum?: string[] } } | undefined)?.items?.enum ?? [])].reverse();
        return sdkReply({ picks: sent, ...(order.length ? { order } : {}) });
      };
      const c = await S.claimDraftCore(USER, id, { force: false }, NOW, realDeps(w, { defer: (t) => tasks.push(t), callModel, clock: () => NOW }));
      if (!c.ok) return [false, c.error];
      for (const t of tasks) await t();
      if (!v4) throw new Error("Not yet: R3's v4 schema (picks and order) isn't issued");
      const run = w.t.roadmapRun.find((r) => r.kind === "GEMINI");
      const plan = draftsOf(w, id);
      const intakeNow = intakeIn(w, id);
      const kept = plan.filter((m) => m.stage !== "PART" && m.stage !== "BETWEEN" && !m.notes.includes("HELD_AT_START"));
      // A pick stands as its stage's focus unless the stage's room or shape reshaped it (the validator logs it): every GEMINI_PICK is a sent pick.
      const geminiRows = plan.flatMap((m) => practicesIn(m).filter((i) => i.notes.includes("GEMINI_PICK")).map((i) => ({ stage: m.stage, kind: i.catalogKey, decision: i.decision })));
      const lines = plan.flatMap((m) => m.items.filter((i) => i.kind === "TOPIC").map((i) => i.syllabusRef as number));
      const expected = [...outline.lines.keys()].reverse();
      return [
        run?.status === "OK" &&
          geminiRows.length > 0 &&
          geminiRows.every((g) => g.decision === "PENDING" && Object.values(sent).includes(g.kind as string)) &&
          kept.some((m) => practicesIn(m).some((i) => i.notes.includes("GEMINI_PICK") && sent[m.stage as string] === i.catalogKey)) &&
          json(lines) === json(expected) &&
          plan.flatMap((m) => m.items.filter((i) => i.kind === "TOPIC")).every((i) => i.label === outline.lines[i.syllabusRef as number] && i.origin === "SYLLABUS") &&
          plan.flatMap((m) => m.items).every((i) => i.origin !== "GEMINI" || (i.kind === "DOMAIN" && i.notes.includes("NOT_CHOSEN"))) &&
          breachesOf(plan, intakeNow).length === 0,
        json({ status: run?.status, error: run?.error, sent, geminiRows, lines, breaches: breachesOf(plan, intakeNow).slice(0, 4) }),
      ];
    });

    await integration("the claim asks a pick only for the stage keys the dated ladder holds (pickStagesOf): a 4-month track plan merged to two rows climbs consecutive stages, STAGE_1 then STAGE_2 (the lead's ruling 4), and only those are offered (R2, R3, R4)", async () => {
      const w = world();
      const intake: Intake = { ...runIntake, constraints: null, targetDay: addDays(TODAY, 120) };
      const id = await newDraft(w, intake);
      const said = await answerCard(id, realDeps(w), [], { none: true });
      if (!said.ok) return [false, said.error];
      const tasks: (() => Promise<void> | void)[] = [];
      let slots: string[] = [];
      const callModel = async (req: unknown) => {
        const props = ((req as { responseSchema?: { properties?: Record<string, unknown> } }).responseSchema?.properties ?? {}) as Record<string, unknown>;
        slots = Object.keys((props.picks as { properties?: Record<string, unknown> } | undefined)?.properties ?? {});
        return sdkReply({});
      };
      const c = await S.claimDraftCore(USER, id, { force: true }, NOW, realDeps(w, { defer: (t) => tasks.push(t), callModel, clock: () => NOW }));
      if (!c.ok) return [false, c.error];
      for (const t of tasks) await t();
      const stages = draftsOf(w, id).map((m) => m.stage);
      return [json(slots) === json(["STAGE_1", "STAGE_2"]) && json(stages) === json(["STAGE_1", "STAGE_2"]), json({ slots, stages })];
    });

    await integration("a type the user changes in the Edit sheet stays theirs through every re-fit: the kind it replaced never comes back beside it, and the stage keeps as many practices (R2, R4)", async () => {
      const w = world();
      const id = await newDraft(w, fieldIntake);
      const built = await S.buildStarterCore(USER, id, NOW, realDeps(w));
      if (!built.ok) return [false, built.error];
      const stage = rowsOf(w, id, 1).find((m) => itemsOf(w, m.id).filter((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED").length >= 2) as MilestoneRec;
      const practices0 = itemsOf(w, stage.id).filter((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED");
      const from = practices0[0];
      const onRow = new Set(practices0.map((i) => i.catalogKey));
      const to = ["WRITING_PRACTICE", "SAY_IT_ALOUD", "EXPLAIN_IT", "PROBLEM_SETS", "MISTAKE_REVIEW", "LISTEN_AND_REPEAT"].find((k) => !onRow.has(k as CatalogKey)) as CatalogKey;
      const swapped = await S.editItemCore(USER, from.id, { catalogKey: to }, NOW, realDeps(w));
      if (!swapped.ok) return [false, `swap: ${swapped.error}`];
      // A second structural edit on another practice re-fits the plan again (its sessions, the user's plan for it).
      const other = itemsOf(w, stage.id).find((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED" && i.id !== from.id) as ItemRec;
      const again = await S.editItemCore(USER, other.id, { sessionsPerWeek: 2 }, NOW, realDeps(w));
      if (!again.ok) return [false, `second edit: ${again.error}`];
      const live = itemsOf(w, stage.id).filter((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED");
      return [
        !live.some((i) => i.catalogKey === from.catalogKey) &&
          live.some((i) => i.id === from.id && i.catalogKey === to && i.decision === "EDITED") &&
          live.length === practices0.length &&
          practices0.slice(1).every((p) => live.some((i) => i.catalogKey === p.catalogKey)),
        json({ before: practices0.map((i) => i.catalogKey), after: live.map((i) => [i.catalogKey, i.decision]), from: from.catalogKey, to }),
      ];
    });

    // ── The lead's rulings after the progression's review (R4's half: rulings 4, 6 and 7) ──
    await integration("the page's header carries the practice family in force (the lead's ruling 7): the user's answer, not the aim's prefill, on a Field plan (the family the plan and its pick decisions read); none on a track plan (R4)", async () => {
      const w = world();
      const id = await newDraft(w, { ...fieldIntake, practiceFamily: "PERFORM" });
      const built = await S.buildStarterCore(USER, id, NOW, realDeps(w));
      if (!built.ok) return [false, built.error];
      const family = ((await S.loadRoadmapView(USER, NOW, realDeps(w))).header as { practiceFamily?: unknown } | null)?.practiceFamily;
      const w2 = world();
      const id2 = await newDraft(w2, craftIntake);
      const built2 = await S.buildStarterCore(USER, id2, NOW, realDeps(w2));
      if (!built2.ok) return [false, built2.error];
      const track = ((await S.loadRoadmapView(USER, NOW, realDeps(w2))).header as { practiceFamily?: unknown } | null)?.practiceFamily;
      const prefill = practiceFamilyPrefillOf(fieldIntake.aim, fieldIntake.examLabel);
      return [prefill !== "PERFORM" && family === "PERFORM" && track === null, json({ prefill, family, track })];
    });

    await integration("“Write it myself” stays the user's (the lead's ruling 6): the skeleton is built on a Field depth plan, a structural edit's re-fit fills no stage, and “Add the app's practice” adds one practice a tap to that one stage only (its role's kind first), code's words, sized, until the app's are all in place (then refused); a removal brings nothing back (R2, R4)", async () => {
      const w = world();
      const id = await newDraft(w, fieldIntake);
      const made = await S.startManualCore(USER, id, NOW, realDeps(w));
      if (!made.ok) return [false, `manual: ${made.error}`];
      const plan0 = draftsOf(w, id);
      const live0 = plan0.filter((m) => !m.notes.includes("HELD_AT_START") && m.status === "DRAFT");
      if (live0.length < 2) return [false, `skeleton: ${json(plan0.map((m) => [m.stage, m.status, m.notes]))}`];
      const empty0 = plan0.every((m) => liveKinds(m).length === 0);
      // The user's own practice on the first stage (a type from the app's list): a structural edit, so the plan is re-fitted.
      const first = rowsOf(w, id, 1).find((m) => m.lineageId === live0[0].lineageId) as MilestoneRec;
      const own = await S.addItemCore(USER, first.id, { kind: "PRACTICE", catalogKey: "RECALL_DRILLS" }, NOW, realDeps(w));
      if (!own.ok) return [false, `own practice: ${own.error}`];
      const plan1 = draftsOf(w, id);
      const othersEmpty1 = plan1.filter((m) => m.lineageId !== first.lineageId).every((m) => liveKinds(m).length === 0);
      const firstOnly = json(sortedKinds(plan1.find((m) => m.lineageId === first.lineageId) as MilestoneDraft)) === json(["RECALL_DRILLS"]);
      // "Add the app's practice" on the next gate stage.
      const target = live0.find((m, k) => k > 0 && m.stage !== "PART" && m.stage !== "BETWEEN") as MilestoneDraft;
      const targetRow = rowsOf(w, id, 1).find((m) => m.lineageId === target.lineageId) as MilestoneRec;
      const off = await S.addAppPracticeCore(USER, targetRow.id, NOW, { ...realDeps(w), env: WRITES_OFF });
      const added = await S.addAppPracticeCore(USER, targetRow.id, NOW, realDeps(w));
      if (!added.ok) return [false, `add: ${added.error}`];
      const firstTap = practicesIn(draftsOf(w, id).find((m) => m.lineageId === target.lineageId) as MilestoneDraft).map((i) => i.catalogKey);
      // Tap again until the app has nothing more to add there (at most two more: three practices a stage).
      const taps: string[] = [];
      for (let k = 0; k < 3; k++) {
        const more = await S.addAppPracticeCore(USER, targetRow.id, NOW, realDeps(w));
        taps.push(more.ok ? `+${more.value.added}` : errOf(more));
        if (!more.ok) break;
      }
      const plan2 = draftsOf(w, id);
      const after = plan2.find((m) => m.lineageId === target.lineageId) as MilestoneDraft;
      const appRows = after.items.filter((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED");
      const unchanged = plan2.filter((m) => m.lineageId !== target.lineageId).every((m) => json(sortedKinds(m)) === json(sortedKinds(plan1.find((x) => x.lineageId === m.lineageId) as MilestoneDraft)));
      const appOk =
        added.value.added === 1 &&
        firstTap.length === 1 &&
        taps[taps.length - 1] === S.APP_PRACTICE_IN_PLACE &&
        taps.slice(0, -1).every((t) => t === "+1") &&
        appRows.length === taps.length &&
        appRows.length >= 1 &&
        appRows.length <= 3 &&
        appRows.every((i) => i.origin === CODE_ORIGIN && i.decision === "KEPT" && !!i.catalogKey && (i.sessionsPerWeek ?? 0) >= 1 && !!i.durationBand) &&
        !after.items.some((i) => (i.kind === "STEP" || i.kind === "CHECKPOINT") && i.decision !== "REMOVED");
      // Removing one of the app's practices there re-fits the plan: nothing comes back, no other stage is filled.
      const gone = itemsOf(w, targetRow.id).find((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED" && i.origin === CODE_ORIGIN) as ItemRec;
      const removed = await S.decideItemCore(USER, gone.id, "REMOVED", NOW, realDeps(w));
      const plan3 = draftsOf(w, id);
      const after3 = plan3.find((m) => m.lineageId === target.lineageId) as MilestoneDraft;
      const noRefill =
        removed.ok &&
        !practicesIn(after3).some((i) => i.catalogKey === gone.catalogKey) &&
        practicesIn(after3).length === appRows.length - 1 &&
        plan3.filter((m) => m.lineageId !== target.lineageId && m.lineageId !== first.lineageId).every((m) => liveKinds(m).length === 0);
      return [
        empty0 && othersEmpty1 && firstOnly && errOf(off) === ROADMAP_WRITES_OFF && appOk && unchanged && noRefill,
        json({ empty0, othersEmpty1, firstOnly, off: errOf(off), added, firstTap, taps, app: appRows.map((i) => [i.catalogKey, i.origin, i.decision, i.sessionsPerWeek, i.durationBand]), unchanged, noRefill, after3: sortedKinds(after3) }),
      ];
    });

    await integration("“Write it myself” on a track plan stays the user's through the activity answer (the lead's ruling 6): the answer's re-sync fills no stage, where a plan from the user's numbers takes the released kinds (R2, R4)", async () => {
      const w = world();
      const id = await newDraft(w, runIntake);
      const made = await S.startManualCore(USER, id, NOW, realDeps(w));
      if (!made.ok) return [false, `manual: ${made.error}`];
      const said = await answerCard(id, realDeps(w), [], { none: true, now: at(1_000) });
      if (!said.ok) return [false, `answer: ${said.error}`];
      const plan = draftsOf(w, id);
      const starter = await starterOf(runIntake, { avoid: [], none: true });
      return [
        plan.length > 0 && plan.every((m) => liveKinds(m).length === 0) && starter.plan.some((m) => practicesIn(m).length > 0),
        json({ manual: plan.map(sortedKinds), starter: starter.plan.map(sortedKinds) }),
      ];
    });

    await integration("“Keep my order” (the lead's ruling 7): a Gemini draft that moved the outline goes back to the user's own order in one tap, split across the stages as the starter splits it; a second tap is refused, and writes off refuse (R3, R4)", async () => {
      const outline: Syllabus = { lines: ["Counting", "Conditional probability", "Bayes", "Random variables", "Expectation", "Variance"], source: null };
      const intake: Intake = { ...fieldIntake, syllabus: outline };
      const w = world();
      requireRealStages(w, intake);
      const id = await newDraft(w, intake);
      const tasks: (() => Promise<void> | void)[] = [];
      const callModel = async (req: unknown) => {
        const props = ((req as { responseSchema?: { properties?: Record<string, unknown> } }).responseSchema?.properties ?? {}) as Record<string, unknown>;
        const order = [...((props.order as { items?: { enum?: string[] } } | undefined)?.items?.enum ?? [])].reverse();
        return sdkReply(order.length ? { order } : {});
      };
      const c = await S.claimDraftCore(USER, id, { force: false }, NOW, realDeps(w, { defer: (t) => tasks.push(t), callModel, clock: () => NOW }));
      if (!c.ok) return [false, c.error];
      for (const t of tasks) await t();
      const linesOf = () => {
        const plan = draftsOf(w, id).filter((m) => m.status !== "LATER" && !m.notes.includes("HELD_AT_START")).sort((a, b) => a.ord - b.ord);
        return plan.map((m) => [...m.items].sort((a, b) => a.ord - b.ord).filter((i) => i.kind === "TOPIC").map((i) => i.syllabusRef as number));
      };
      const moved = linesOf();
      const off = await S.keepMyOrderCore(USER, id, at(1_000), { ...realDeps(w), env: WRITES_OFF });
      const kept = await S.keepMyOrderCore(USER, id, at(1_000), realDeps(w));
      const mine = linesOf();
      const want = outlineStagesOf(outline.lines.map((_, i) => i), mine.length);
      const again = await S.keepMyOrderCore(USER, id, at(2_000), realDeps(w));
      const labels = draftsOf(w, id).flatMap((m) => m.items.filter((i) => i.kind === "TOPIC")).every((i) => i.label === outline.lines[i.syllabusRef as number] && i.origin === "SYLLABUS");
      return [
        json(moved.flat()) === json([5, 4, 3, 2, 1, 0]) && errOf(off) === ROADMAP_WRITES_OFF && kept.ok && json(mine) === json(want) && labels && errOf(again) === S.ORDER_ALREADY_YOURS,
        json({ moved, off: errOf(off), kept, mine, want, labels, again: errOf(again) }),
      ];
    });

    await integration("runDraftCore hands the validator the dated plan's progression (the lead's ruling 7: KeysOnlyContext.progression): every slot's room, and a dated exam's stage and run-up as the slots of the rows holding them, so the picks it keeps agree with R2's plan (R2, R3, R4)", async () => {
      const intake: Intake = { ...fieldIntake, examLabel: "SOA Exam P", examDay: addDays(TODAY, 120) };
      const w = world();
      requireRealStages(w, intake);
      const id = await newDraft(w, intake);
      const tasks: (() => Promise<void> | void)[] = [];
      const seen: (Parameters<typeof VALIDATE.validateKeysOnly>[1]["progression"] | null)[] = [];
      const deps = realDeps(w, { defer: (t) => tasks.push(t), callModel: async () => sdkReply({}), clock: () => NOW });
      deps.lanes = {
        ...deps.lanes,
        validateKeysOnly: (parsed, ctx) => {
          seen.push(ctx.progression ?? null);
          return VALIDATE.validateKeysOnly(parsed, ctx);
        },
      };
      const c = await S.claimDraftCore(USER, id, { force: false }, NOW, deps);
      if (!c.ok) return [false, c.error];
      for (const t of tasks) await t();
      const p = seen[0] ?? null;
      const slots = ["FOUNDATION", "FAMILIAR", "RETAINED", "FLUENT", "MASTERED"];
      const plan = draftsOf(w, id).filter((m) => m.status !== "LATER").sort((a, b) => a.ord - b.ord);
      const examAt = plan.findIndex((m) => m.items.some((i) => i.catalogKey === "EXAM_DAY" && i.decision !== "REMOVED"));
      const examSlot = examAt < 0 ? null : [...plan.slice(0, examAt + 1)].reverse().map((m) => slots.indexOf(m.stage ?? "")).find((k) => k >= 0) ?? null;
      const rooms = Array.isArray(p?.maxPractices) ? (p.maxPractices as (number | null)[]) : [];
      return [
        seen.length > 0 &&
          !!p &&
          rooms.length === slots.length &&
          rooms.every((r) => r === null || (Number.isInteger(r) && r >= 1 && r <= 3)) &&
          examSlot != null &&
          p.examStage === examSlot &&
          typeof p.examPrepStage === "number" &&
          p.examPrepStage <= (p.examStage as number),
        json({ p, examSlot, stages: plan.map((m) => m.stage) }),
      ];
    });

    await integration("a practice that takes turns with another (contracts §20.12) is written in its pair's words and the one writer takes them as code's: an IELTS plan at 3 h a week is built, every stage the progression's, a turn on some stage (R2, R4)", async () => {
      const intake: Intake = { ...fieldIntake, aim: "Reach IELTS 7", practiceFamily: "LANGUAGE", hoursPerWeek: 3, examLabel: "IELTS", examDay: addDays(TODAY, 150) };
      const w = world();
      const id = await newDraft(w, intake);
      const built = await S.buildStarterCore(USER, id, NOW, realDeps(w));
      if (!built.ok) return [false, built.error];
      const plan = draftsOf(w, id);
      const turns = plan.flatMap((m) => practicesIn(m).filter((i) => / one week, .+ the next: /.test(i.label)).map((i) => `${m.stage}: ${i.label}`));
      const bad = breachesOf(plan, intakeIn(w, id));
      return [turns.length > 0 && bad.length === 0, json({ turns, bad: bad.slice(0, 4), plan: plan.map((m) => [m.stage, practicesIn(m).map((i) => i.label)]) })];
    });

    await integration("the practice family is the user's answer, stored with the intake (Roadmap.coverage) and kept by an activity answer; the plan's progression reads it (R2, R4)", async () => {
      const w = world();
      const id = await newDraft(w, { ...fieldIntake, practiceFamily: "PERFORM" });
      const stored = intakeIn(w, id).practiceFamily;
      const again = await S.saveIntakeCore(USER, { ...fieldIntake, aim: "Pass the probability exam soon" }, NOW, depsFor(w));
      const kept = intakeIn(w, id).practiceFamily;
      const built = await S.buildStarterCore(USER, id, NOW, realDeps(w));
      if (!built.ok) return [false, built.error];
      const plan = draftsOf(w, id);
      const pp = REALISM.planProgressionOf(plan, intakeIn(w, id), { practicesAllowed: true, trackArea: false, examDay: null } as Parameters<typeof REALISM.planProgressionOf>[2], { room: (m) => practicesIn(m).length || null });
      return [
        stored === "PERFORM" && again.ok && kept === "PERFORM" && pp.input.family === "PERFORM" && breachesOf(plan, intakeIn(w, id)).length === 0,
        json({ stored, kept, family: pp.input.family, breaches: breachesOf(plan, intakeIn(w, id)).slice(0, 3) }),
      ];
    });

    await integration("a re-plan (Re-fit, and Edit by hand) after Start: the DRAFT stages are the progression with the started one carried — no opening or booking again, the next stage carries what it trained — and Start put exactly its progression's practices on Today (R2, R4)", async () => {
      const examined: string[] = [];
      for (const kind of ["REFIT", "MANUAL"] as const) {
        const w = world();
        const id = await newDraft(w, { ...fieldIntake, examLabel: "SOA Exam P" });
        const built = await S.buildStarterCore(USER, id, NOW, realDeps(w));
        if (!built.ok) return [false, built.error];
        for (const m of rowsOf(w, id, 1)) await decideAll(w, id, m.id);
        const acc = await S.acceptCore(USER, id, { overAccepted: true }, NOW, realDeps(w));
        if (!acc.ok) return [false, acc.error];
        const m1 = rowsOf(w, id, 1).find((m) => m.status === "PLANNED" && !(m.feasibility as { notes?: string[] } | null)?.notes?.includes("HELD_AT_START")) as MilestoneRec;
        const before = sortedKinds(S.draftOf({ ...m1, items: itemsOf(w, m1.id), measures: measuresOf(w, m1.id) }));
        const st = await S.startMilestoneCore(USER, m1.id, { ...START_ALL, overAccepted: true }, NOW, realDeps(w));
        if (!st.ok) return [false, st.error];
        const started = S.draftOf({ ...(w.t.roadmapMilestone.find((m) => m.id === m1.id) as MilestoneRec), items: itemsOf(w, m1.id), measures: measuresOf(w, m1.id) });
        const onToday = itemsOf(w, m1.id).filter((i) => i.kind === "PRACTICE" && i.templateId).map((i) => i.catalogKey);
        const rp = await S.replanCore(USER, id, kind, at(1_000), realDeps(w));
        if (!rp.ok) return [false, `${kind}: ${rp.error}`];
        const drafts = draftsOf(w, id, 2).filter((m) => m.status === "DRAFT");
        const plan = [started, ...drafts];
        const first = drafts.find((m) => !m.notes.includes("HELD_AT_START"));
        const focus = practicesIn(started)[0]?.catalogKey;
        const bad = breachesOf(plan, intakeIn(w, id));
        if (
          !(
            json(sortedKinds(started)) === json(before) &&
            json(onToday.sort()) === json(practicesIn(started).map((i) => i.catalogKey).sort()) &&
            !!first &&
            !liveKinds(first).some((i) => i.catalogKey === "CHOOSE_MATERIAL" || i.catalogKey === "BOOK_EXAM") &&
            (first.stage === "BETWEEN" || first.stage === "PART" || practicesIn(first).some((i) => i.catalogKey === focus)) &&
            bad.length === 0
          )
        )
          examined.push(`${kind}: ${json({ before, started: sortedKinds(started), onToday, first: first && sortedKinds(first), focus, bad: bad.slice(0, 4) })}`);
      }
      return [examined.length === 0, examined.join(" | ")];
    });
  }

  // ═══ Revision 5: up to 3 goals (contracts §23; ruling N15: GOALS_MAX 3) ════
  console.log("— revision 5: goals (§23) —");
  check("goals: GOALS_MAX is 3 (ruling N15: up to 3 open goals at any time)", GOALS_MAX === 3);
  {
    // Seats at GOALS_MAX 3 (§23.1), the targets, and createKey idempotence.
    const w = world();
    const first = await S.saveIntakeCore(USER, INTAKE, NOW, depsFor(w), { createKey: "goal-key-0001" });
    check("goals: {createKey} creates a goal in the lowest free seat (1), storing its key", first.ok && w.t.roadmap.length === 1 && w.t.roadmap[0].slot === 1 && w.t.roadmap[0].createKey === "goal-key-0001", json([first, w.t.roadmap.map((r) => [r.slot, r.createKey])]));
    const firstId = first.ok ? first.value.roadmapId : "";
    const open = await S.saveIntakeCore(USER, { ...INTAKE, aim: "Edited with no target" }, NOW, depsFor(w));
    check("goals: no target keeps today's rule (the open draft is edited)", open.ok && open.value.roadmapId === firstId && w.t.roadmap.length === 1 && w.t.roadmap[0].aim === "Edited with no target", json(open));
    const named = await S.saveIntakeCore(USER, { ...INTAKE, aim: "Edited by its id" }, NOW, depsFor(w), { roadmapId: firstId });
    check("goals: {roadmapId} edits that draft", named.ok && w.t.roadmap.length === 1 && w.t.roadmap[0].aim === "Edited by its id", json(named));
    const forged = await S.saveIntakeCore(USER, INTAKE, NOW, depsFor(w), { roadmapId: "another-users-goal" });
    eq("goals: {roadmapId} of no draft of the user's (a forged id) is NO_ROADMAP (family X)", forged.ok ? "ok" : forged.error, S.NO_ROADMAP);
    const bad = await Promise.all(
      [{ createKey: "short" }, { createKey: "has spaces in it" }, { roadmapId: "x", createKey: "goal-key-0003" }, { roadmapId: "bad id!" }].map((t) => S.saveIntakeCore(USER, INTAKE, NOW, depsFor(w), t as never))
    );
    check("goals: a malformed target (a createKey outside [A-Za-z0-9_-]{8,64}, both keys, a bad id) is refused unread", bad.every((r) => !r.ok && r.error === S.NO_TARGET) && w.t.roadmap.length === 1, json(bad));
    const repeat = await S.saveIntakeCore(USER, { ...INTAKE, aim: "A repeat of the first save" }, NOW, depsFor(w), { createKey: "goal-key-0001" });
    check("goals: createKey idempotence: the same key returns the same id later too (the first save stands; nothing written)", repeat.ok && repeat.value.roadmapId === firstId && w.t.roadmap.length === 1 && w.t.roadmap[0].aim === "Edited by its id", json(repeat));
    const sameDomain = await S.saveIntakeCore(USER, { ...INTAKE, aim: "Probability, a second time", label: "Prob 2" }, NOW, depsFor(w), { createKey: "goal-key-0009" });
    eq("goals: a 2nd goal never takes a Domain goal 1 holds (DOMAIN_TAKEN names its seat), writing nothing", [sameDomain.ok ? "ok" : sameDomain.error, w.t.roadmap.length], [S.DOMAIN_TAKEN(1), 1]);
    const trading: Intake = { ...INTAKE, aim: "Trade with a plan", fieldId: "f-trade", domainIds: ["d-risk"] };
    const second = await S.saveIntakeCore(USER, trading, NOW, depsFor(w), { createKey: "goal-key-0002" });
    const secondRow = w.t.roadmap.find((r) => second.ok && r.id === second.value.roadmapId);
    check("goals: a 2nd open goal opens beside the first in seat 2 (ruling N15), the first left as it was", second.ok && secondRow?.slot === 2 && secondRow.status === "DRAFT" && w.t.roadmap.length === 2 && w.t.roadmap.find((r) => r.id === firstId)?.aim === "Edited by its id", json([second, secondRow?.slot]));
    w.tree[0].domains.push({ id: "d-comb", name: "Combinatorics", fieldId: "f-stats", cards: [] });
    const third = await S.saveIntakeCore(USER, { ...INTAKE, aim: "Count without fear", label: "Counting", domainIds: ["d-comb"] }, NOW, depsFor(w), { createKey: "goal-key-0003" });
    const thirdRow = w.t.roadmap.find((r) => third.ok && r.id === third.value.roadmapId);
    check("goals: a 3rd takes seat 3 (its own label beside goal 1's Area: ruling 26)", third.ok && thirdRow?.slot === 3 && w.t.roadmap.length === 3, json([third, thirdRow?.slot]));
    w.tree[1].domains.push({ id: "d-opt", name: "Options", fieldId: "f-trade", cards: [] });
    const fourth = await S.saveIntakeCore(USER, { ...INTAKE, aim: "Price options", fieldId: "f-trade", label: "Options", domainIds: ["d-opt"] }, NOW, depsFor(w), { createKey: "goal-key-0004" });
    eq("goals: a 4th open goal is refused (GOALS_FULL, the figure read from GOAL_SLOTS_MAX), writing nothing", [fourth.ok ? "ok" : fourth.error, w.t.roadmap.length], [GOALS_FULL, 3]);
    const editSecond = await S.saveIntakeCore(USER, { ...trading, aim: "Trade with a written plan" }, NOW, depsFor(w), { roadmapId: secondRow?.id ?? "" });
    check("goals: {roadmapId} edits the named draft only, whichever seat it holds", editSecond.ok && w.t.roadmap.find((r) => r.id === secondRow?.id)?.aim === "Trade with a written plan" && w.t.roadmap.find((r) => r.id === firstId)?.aim === "Edited by its id", json(editSecond));
  }
  {
    const w = world();
    const [a, b] = await Promise.all([1, 2].map(() => S.saveIntakeCore(USER, INTAKE, NOW, depsFor(w), { createKey: "double-tap-0001" })));
    check("goals: createKey idempotence: two concurrent saves with one key answer one id and leave one row (the seat guard and KEY_FREE re-read)", a.ok && b.ok && a.value.roadmapId === b.value.roadmapId && w.t.roadmap.length === 1, json([a, b, w.t.roadmap.length]));
    eq("goals: KEY_FREE reads the user's rows as the SQL does", [w.guard(USER, { g: "KEY_FREE", createKey: "double-tap-0001" }), w.guard(USER, { g: "KEY_FREE", createKey: "double-tap-0002" })], [false, true]);
    {
      // Three open rows fill GOALS_MAX 3; the third saved by old code with no seat still counts.
      const extra = [2, 3].map((slot) => ({ ...w.t.roadmap[0], id: `seat-${slot}`, slot, createKey: null }) as RoadmapRec);
      w.t.roadmap.push(...extra);
      const free = [
        w.guard(USER, { g: "SLOT_FREE", slot: 2, exceptId: null }),
        (() => ((extra[1].slot = null), w.guard(USER, { g: "SLOT_FREE", slot: 3, exceptId: null })))(),
        w.guard(USER, { g: "SLOT_FREE", slot: 3, exceptId: extra[1].id }),
      ];
      eq("goals: SLOT_FREE counts every open row, a NULL slot too (ruling 24), against GOALS_MAX 3", free, [false, false, true]);
      w.t.roadmap.splice(1);
    }
    eq("goals: the (userId, slot) open index refuses a second open row in seat 1 (a unique violation: 'duplicate')", w.applyNow(USER, [{ op: "insert", table: "roadmap", rows: [{ ...w.t.roadmap[0], id: "dup", createKey: null }] }]), "duplicate");
    const noSeat = await (async () => {
      const row = w.t.roadmap[0];
      row.slot = null;
      const edit = await S.saveIntakeCore(USER, { ...INTAKE, aim: "Old code saved me" }, NOW, depsFor(w));
      return [edit.ok, row.slot];
    })();
    eq("goals: a draft old code saved with no seat takes one at its next save (every open row a lane-3 write leaves has its seat)", noSeat, [true, 1]);
  }
  {
    // DOMAINS_FREE (§23.5), the hours' room (ruling 25) and the label (ruling 26), with a paused goal beside a new one.
    const w = world();
    const paused = await accepted(w);
    const p = await S.pauseRoadmapCore(USER, paused, { aftercare: "KEEP", reason: null }, NOW, depsFor(w));
    check("fixture: the accepted goal pauses", p.ok, json(p));
    const taken = await S.saveIntakeCore(USER, { ...INTAKE, aim: "Probability again", label: "Prob 2" }, NOW, depsFor(w));
    eq("goals: DOMAINS_FREE: a new goal can't take a paused goal's Domain ('in a paused goal': its seat is never named, ruling 55)", taken.ok ? "ok" : taken.error, S.DOMAIN_TAKEN(null));
    eq("goals: DOMAIN_TAKEN names the seat, and reads 'a paused goal' with none", [S.DOMAIN_TAKEN(2), S.DOMAIN_TAKEN(null)], ["That Domain is in goal 2.", "That Domain is in a paused goal."]);
    const clash = await S.saveIntakeCore(USER, { ...INTAKE, domainIds: ["d-inf"].filter(() => false), aim: "Statistics, the rest" }, NOW, depsFor(w));
    eq("goals: a second goal in the paused goal's Area with no label of its own clashes by name (LABEL_CLASH, ruling 26)", clash.ok ? "ok" : clash.error, S.LABEL_CLASH);
    const fresh = await S.saveIntakeCore(USER, { ...INTAKE, aim: "Trade with a plan", fieldId: "f-trade", domainIds: ["d-risk"] }, NOW, depsFor(w));
    const row = w.t.roadmap.find((r) => fresh.ok && r.id === fresh.value.roadmapId);
    check("goals: a paused goal frees its seat: a new goal takes seat 1 beside it (the lowest free seat)", fresh.ok && row?.slot === 1 && w.t.roadmap.find((r) => r.id === paused)?.slot === 1, json([fresh, row?.slot]));
    const view = await S.loadIntakeView(USER, NOW, depsFor(w), row?.id ?? null);
    check(
      "goals: loadIntakeView carries the seats, the open drafts, GOALS_MAX, the hours other goals take, the Domains they hold (a paused goal's by null) and the switches (production deps: the build's TOPIC_* constants as the user set them, read through topicSwitchesOf)",
      view.goalsMax === 3 &&
        view.seats?.length === 3 &&
        view.seats[0].roadmapId === row?.id &&
        view.seats[1].roadmapId === null &&
        view.drafts?.map((d) => d.roadmapId).join() === row?.id &&
        view.hoursTaken === 0 &&
        view.takenDomains?.["d-prob"] === null &&
        view.takenDomains?.["d-inf"] === null &&
        !("d-risk" in (view.takenDomains ?? {})) &&
        json(view.topicSwitches) === json(topicSwitchesOf()) &&
        view.topicSwitches?.plans === TOPIC_PLANS_LIVE &&
        view.draft?.roadmapId === row?.id,
      json([view.seats, view.drafts?.map((d) => d.roadmapId), view.hoursTaken, view.takenDomains, view.topicSwitches])
    );
    const hours = await S.saveIntakeCore(USER, { ...INTAKE, aim: "Trade with a plan", fieldId: "f-trade", domainIds: ["d-risk"], hoursPerWeek: 40 }, NOW, depsFor(w));
    check("goals: the hours' room reads DRAFT and ACTIVE goals only (a paused goal's hours leave the sum: ruling 25), so 40 h fits one open goal", hours.ok, json(hours));
    const resume = await S.resumeRoadmapCore(USER, paused, { redate: false }, NOW, depsFor(w));
    check("goals: at GOALS_MAX 3 a seat is free for the resume, but the hours' room refuses it while the open goals take the week (ruling 25)", !resume.ok && resume.error.startsWith("Your goals already take 40 h"), json(resume));
    const lighter = await S.saveIntakeCore(USER, { ...INTAKE, aim: "Trade with a plan", fieldId: "f-trade", domainIds: ["d-risk"], hoursPerWeek: 5 }, NOW, depsFor(w));
    const back = await S.resumeRoadmapCore(USER, paused, { redate: false }, NOW, depsFor(w));
    const pausedRow = w.t.roadmap.find((r) => r.id === paused);
    check("goals: …and with room it resumes beside the new goal, into the lowest free seat (its own seat 1 is taken: seat 2; ruling N15)", lighter.ok && back.ok && pausedRow?.status === "ACTIVE" && pausedRow.slot === 2, json([lighter, back, pausedRow?.status, pausedRow?.slot]));
    eq("goals: noSeatLine is GOALS_FULL at GOALS_MAX 3, reading its figure", [S.noSeatLine(), GOALS_FULL], [GOALS_FULL, "3 goals open. Finish, pause or archive one."]);
  }
  {
    // Pause, resume and archive from PAUSED (§23.4).
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    const started = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    check("fixture: milestone 1 starts", started.ok, json(started));
    const goal = w.templates.find((t) => t.kind === "GOAL") as TemplateLite & { archivedAt: Date | null };
    const practices = itemsOf(w, m1.id).filter((i) => i.kind === "PRACTICE" && i.templateId).map((i) => i.templateId as string);
    const dw = world();
    const d = await newDraft(dw);
    eq("goals: pause works from ACTIVE only (a DRAFT is discarded instead)", errOf(await S.pauseRoadmapCore(USER, d, { aftercare: "KEEP", reason: null }, NOW, depsFor(dw))), S.PAUSE_ONLY_ACTIVE);
    const p = await S.pauseRoadmapCore(USER, id, { aftercare: "KEEP", reason: "  A busy month  " }, at(1_000), depsFor(w));
    const r = w.t.roadmap.find((x) => x.id === id) as RoadmapRec;
    check("goals: pause: PAUSED with pausedAt and the reason, the slot kept (ruling 46), and the live milestone named", p.ok && p.value.closedMilestoneId === m1.id && r.status === "PAUSED" && r.pausedAt?.getTime() === at(1_000).getTime() && r.pauseReason === "A busy month" && r.slot === 1, json([p, r.status, r.pauseReason, r.slot]));
    const kept = (rowsOf(w, id, 1)[0].feasibility as { aftercareKept?: string[] } | null)?.aftercareKept ?? [];
    check("goals: pause closes the live milestone as dropped (its goal archived; Start again stays open) and keeps its practices on Today when asked", goal.archivedAt != null && practices.length > 0 && practices.every((t) => kept.includes(t) && w.templates.find((x) => x.id === t)?.archivedAt == null), json([goal.archivedAt, practices, kept]));
    eq("goals: a paused goal pauses again only from ACTIVE", errOf(await S.pauseRoadmapCore(USER, id, { aftercare: "KEEP", reason: null }, at(2_000), depsFor(w))), S.PAUSE_ONLY_ACTIVE);
    const view = await S.loadRoadmapView(USER, at(2_000), depsFor(w));
    check("goals: a paused goal's page reads ACTIVE with header.paused (ruling 66), no seat shown, no triggers, no week quests", view.state === "ACTIVE" && view.header?.paused?.reason === "A busy month" && view.header.paused.since === TODAY && view.header.slot === null && view.triggers.length === 0 && view.weekQuests === null, json([view.state, view.header?.paused, view.header?.slot]));
    const card = await S.loadAimCard(USER, at(2_000), depsFor(w));
    check("goals: its Aim card reads ACTIVE with `paused` (never 'behind'), no milestone line", card?.state === "ACTIVE" && card.paused?.since === TODAY && card.milestone == null && card.slot === null, json([card?.state, card?.paused, card?.milestone]));
    eq("goals: Start on a paused goal is refused in its own words", (await S.startPreview(USER, rowsOf(w, id, 1)[1].id, at(2_000), depsFor(w)))?.refusal, "Resume this goal first.");
    eq("goals: DONE still needs ACTIVE (ruling 56: resume first, or archive)", errOf(await S.markRoadmapDoneCore(USER, id, "Done anyway", at(2_000), depsFor(w))), "Only an accepted roadmap is marked done.");
    const resumeAt = new Date(NOW.getTime() + 23 * 86_400_000);
    const readingsBefore = w.t.readings.length;
    const res = await S.resumeRoadmapCore(USER, id, { redate: true }, resumeAt, depsFor(w));
    const back = w.t.roadmap.find((x) => x.id === id) as RoadmapRec;
    check("goals: resume takes its old seat back, clears the pause, and the re-date is a new version through the re-plan path", res.ok && res.value.slot === 1 && res.value.version === 2 && back.status === "ACTIVE" && back.slot === 1 && back.pausedAt == null && back.pauseReason == null && rowsOf(w, id, 2).length > 0, json([res, back.status, back.slot]));
    eq("goals: 'Move the date by 23 days?' moves the aim's date by the days paused", back.targetDay, addDays(INTAKE.targetDay, 23));
    const prof = w.t.readings.slice(readingsBefore).find((x) => x.measureKey === proficiencyKey(id));
    check("goals: the first reading after resume is a rebase with the cause RESUMED (never a gain)", !!prof && json(prof.detail).includes('"RESUMED"'), json(prof?.detail));
    eq("goals: resume works from PAUSED only", errOf(await S.resumeRoadmapCore(USER, id, { redate: false }, resumeAt, depsFor(w))), S.RESUME_ONLY_PAUSED);
    const again = await S.pauseRoadmapCore(USER, id, { aftercare: "ARCHIVE", reason: null }, resumeAt, depsFor(w));
    const arch = await S.archiveRoadmapCore(USER, id, { reason: "Changed course", archiveGoal: false }, resumeAt, depsFor(w));
    check("goals: archive from PAUSED (ruling 56): the ROADMAP_IS guard holds PAUSED", again.ok && arch.ok && w.t.roadmap.find((x) => x.id === id)?.status === "ARCHIVED", json([again, arch]));
  }
  {
    // The four lane-3 goldens §22.14 names (contracts §23.4, §23.8; family X's server paths).
    const w = world();
    const paused = await accepted(w);
    await S.pauseRoadmapCore(USER, paused, { aftercare: "KEEP", reason: null }, NOW, depsFor(w));
    const trade = await seatedGoal(w, { ...INTAKE, aim: "Trade with a plan", fieldId: "f-trade", domainIds: ["d-risk"], hoursPerWeek: 3 }, 1);
    const run = await seatedGoal(w, { ...INTAKE, aim: "Run a 10K", fieldId: null, track: "BODY", domainIds: [], hoursPerWeek: 3 }, 2);
    const care = await seatedGoal(w, { ...INTAKE, aim: "Look after my mum", fieldId: null, track: "CARE", domainIds: [], hoursPerWeek: 3 }, 3);
    const held = w.guard(USER, { g: "DOMAINS_FREE", domainIds: ["d-prob", "d-inf"], exceptRoadmapId: null });
    const takeBefore = await S.saveIntakeCore(USER, { ...INTAKE, aim: "Trade and probability", fieldId: "f-trade", domainIds: ["d-risk", "d-prob"] }, NOW, depsFor(w), { roadmapId: trade });
    const arch = await S.archiveRoadmapCore(USER, paused, { reason: "Not now", archiveGoal: false }, NOW, depsFor(w));
    const takeAfter = await S.saveIntakeCore(USER, { ...INTAKE, aim: "Trade and probability", fieldId: "f-trade", domainIds: ["d-risk", "d-prob"] }, NOW, depsFor(w), { roadmapId: trade });
    const open = w.t.roadmap.filter((x) => x.status === "DRAFT" || x.status === "ACTIVE").map((x) => [x.id, x.slot]);
    check(
      "goals: archive a PAUSED goal at 3 open frees its seat and its Domains",
      !held &&
        !takeBefore.ok &&
        takeBefore.error === S.DOMAIN_TAKEN(null) &&
        arch.ok &&
        w.t.roadmap.find((x) => x.id === paused)?.status === "ARCHIVED" &&
        w.guard(USER, { g: "DOMAINS_FREE", domainIds: ["d-prob", "d-inf"], exceptRoadmapId: trade }) &&
        takeAfter.ok &&
        json(open) === json([[trade, 1], [run, 2], [care, 3]]),
      json([held, takeBefore, arch, takeAfter, open])
    );
  }
  {
    // XG: goal 1's carpal tunnel gates goal 3's drills (the cue texts are user-wide: §23.6 items 1–3).
    const w = world();
    const wrist = await newDraft(w, { ...INTAKE, aim: "Rehab my wrist after carpal tunnel surgery", fieldId: null, track: "BODY", domainIds: [] });
    const guitar = await seatedGoal(w, { ...INTAKE, aim: "Learn guitar", fieldId: null, track: "CRAFT", domainIds: [], constraints: null }, 3);
    const deps = depsFor(w);
    const wristRow = w.t.roadmap.find((x) => x.id === wrist) as RoadmapRec;
    wristRow.status = "ARCHIVED";
    const alone = await S.loadRoadmapView(USER, NOW, deps, guitar);
    wristRow.status = "DRAFT";
    const both = await S.loadRoadmapView(USER, NOW, deps, guitar);
    const ac = both.activityConfirm;
    const pending = new Set((ac?.rows ?? []).filter((x) => x.state === "PENDING").map((x) => x.kind));
    const fromGoal1 = (ac?.quotes ?? []).findIndex((q) => /carpal tunnel/i.test(q));
    const built = await S.buildStarterCore(USER, guitar, NOW, deps);
    const placed = rowsOf(w, guitar).flatMap((m) => itemsOf(w, m.id)).map((i) => i.catalogKey);
    check(
      "XG: goal 1's carpal tunnel gates goal 3's SLOW_DRILLS, RUN_THROUGHS and WITH_A_PARTNER",
      !(alone.activityConfirm?.on ?? false) &&
        ac?.on === true &&
        ["SLOW_DRILLS", "RUN_THROUGHS", "WITH_A_PARTNER"].every((k) => pending.has(k as CatalogKey)) &&
        fromGoal1 >= 0 &&
        ac.quoteGoals?.[fromGoal1] === 1 &&
        built.ok &&
        !placed.some((k) => k === "SLOW_DRILLS" || k === "RUN_THROUGHS" || k === "WITH_A_PARTNER"),
      json([alone.activityConfirm?.on, ac?.on, [...pending], ac?.quotes, ac?.quoteGoals, built, placed])
    );
    check("XG: …and its key is the user-wide 'k3-' one (a change to goal 1's words asks goal 3's card again)", ac?.key.startsWith("k3-") === true && alone.activityConfirm?.key?.startsWith("k3-") !== true, json([ac?.key, alone.activityConfirm?.key]));
  }
  {
    // XG: goal 1's AVOID stays locked on goal 2's card (§23.6 items 4 and 5; rulings 27).
    const w = world();
    const body: Intake = { ...INTAKE, fieldId: null, track: "BODY", domainIds: [], hoursPerWeek: 4 };
    const g1 = await newDraft(w, { ...body, aim: "Run a 10K" });
    const g2 = await seatedGoal(w, { ...body, aim: "Get stronger at the gym", label: "Gym" }, 2);
    const deps = depsFor(w);
    const said = await answerGoalCard(g1, deps, ["HARDER_SESSION"]);
    const locked = await goalCardRow(g2, deps, "HARDER_SESSION");
    const none = await answerGoalCard(g2, deps, [], true);
    const stillLocked = await goalCardRow(g2, deps, "HARDER_SESSION");
    const tryStore = await answerGoalCard(g2, deps, ["HARDER_SESSION"]);
    const g2Stored = intakeActivitiesOf(w, g2)?.kinds ?? {};
    const lift = await answerGoalCard(g1, deps, [], true);
    const asksAgain = await goalCardRow(g2, deps, "HARDER_SESSION");
    check(
      "XG: goal 1's AVOID of HARDER_SESSION stays locked on goal 2's card",
      said.ok &&
        locked?.state === "AVOID" &&
        locked.locked === true &&
        locked.from?.slot === 1 &&
        none.ok &&
        stillLocked?.state === "AVOID" &&
        stillLocked.locked === true &&
        !("HARDER_SESSION" in g2Stored) &&
        lift.ok &&
        asksAgain?.state === "PENDING" &&
        !asksAgain.locked,
      json([said, locked, none, stillLocked, tryStore, g2Stored, lift, asksAgain])
    );
  }
  {
    // XG: at GOALS_MAX 3 (ruling N15) a closed goal's AVOID is read as a suggestion, never a lock (ruling 57).
    const w = world();
    const body: Intake = { ...INTAKE, fieldId: null, track: "BODY", domainIds: [], hoursPerWeek: 4 };
    const g1 = await newDraft(w, { ...body, aim: "Run a 10K" });
    const said = await answerGoalCard(g1, depsFor(w), ["HARDER_SESSION"]);
    Object.assign(w.t.roadmap.find((x) => x.id === g1) as RoadmapRec, { status: "ARCHIVED", archivedAt: NOW, archiveReason: "Changed course" });
    const g2 = await newDraft(w, { ...body, aim: "Get stronger at the gym" });
    const row = await goalCardRow(g2, depsFor(w), "HARDER_SESSION");
    check(
      "XG: at GOALS_MAX 3 a closed goal's AVOID is suggested (prefill AVOID, from the closed goal), never locked (ruling 57)",
      GOALS_MAX === 3 && said.ok && row?.state === "PENDING" && row.from?.roadmapId === g1 && row.from.closed === true && row.prefill === "AVOID" && !row.locked,
      json([said, row])
    );
  }
  {
    // XG: an AVOID given on goal 2 after goal 1's Start pauses goal 1's started practice of that kind (§23.6 item 7).
    const w = world();
    const id = await newDraft(w, kneeIntake);
    await answerCard(id, depsFor(w), ["LONGER_SESSION"]);
    {
      const tasks: (() => Promise<void> | void)[] = [];
      const reply = { milestones: [{ practices: [{ name: "a", method: "X" }, { name: "b", method: "X" }] }, { practices: [{ name: "c", method: "X" }] }] };
      await S.claimDraftCore(USER, id, { force: true }, NOW, depsFor(w, { defer: (t) => tasks.push(t), callModel: async () => reply, clock: () => NOW }));
      for (const t of tasks) await t();
    }
    await S.confirmSessionPicksCore(USER, id, "KEEP", NOW, depsFor(w));
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
    const m1 = rowsOf(w, id, 1)[0];
    const st = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    const mobility = itemsOf(w, m1.id).find((i) => i.catalogKey === "MOBILITY_SESSION" && i.templateId);
    const gym = await seatedGoal(w, { ...INTAKE, aim: "Get stronger at the gym", fieldId: null, track: "BODY", domainIds: [], hoursPerWeek: 3, label: "Gym" }, 2);
    const said = await answerGoalCard(gym, depsFor(w), ["MOBILITY_SESSION"], false, at(1_000));
    const measure = w.t.roadmapMeasure.find((x) => x.milestoneId === m1.id && x.kind === "PRACTICE_KEPT" && (x.itemLineageId === mobility?.lineageId || json(x.scope).includes(mobility?.lineageId ?? "-")));
    check(
      "XG: an AVOID given on goal 2 after goal 1's Start pauses goal 1's started practice of that kind (the safety pause, as its own AVOID would), and that practice stops counting",
      acc.ok && st.ok && !!mobility && said.ok && w.paused.includes(mobility.templateId as string) && said.value.paused.some((x) => x.templateId === mobility.templateId) && measure?.role === "CONTEXT" && !("MOBILITY_SESSION" in (intakeActivitiesOf(w, id)?.kinds ?? {})),
      json([acc, st, mobility?.templateId, said, w.paused, measure?.role])
    );
  }
  {
    // One person's week: the shares (§23.3, ruling 54) and the verdict re-run (otherGoals).
    const w = world();
    const seen: Record<string, { share?: number; fieldShare?: number }[]> = {};
    const spy = (who: string): Partial<RoadmapLanes> => ({
      ...lanesFor(w),
      feasibilityOf: (plan, input) => {
        (seen[who] ??= []).push({ ...("share" in input ? { share: input.share } : {}), ...("fieldShare" in input ? { fieldShare: input.fieldShare } : {}) });
        return lanesFor(w).feasibilityOf!(plan, input);
      },
    });
    const g1 = await newDraft(w, { ...INTAKE, aim: "Probability for the exam", domainIds: ["d-prob"], hoursPerWeek: 5 });
    await S.buildStarterCore(USER, g1, NOW, depsFor(w, { lanes: spy("alone") }));
    eq("goals: one goal's realism input carries no share (byte-identical: 1 is left out)", seen.alone?.[0], {});
    const g2 = await seatedGoal(w, { ...INTAKE, aim: "Run a 10K", fieldId: null, track: "BODY", domainIds: [], hoursPerWeek: 1 }, 2);
    const g3 = await seatedGoal(w, { ...INTAKE, aim: "Inference, properly", domainIds: ["d-inf"], hoursPerWeek: 5, label: "Inference" }, 3);
    await S.buildStarterCore(USER, g1, NOW, depsFor(w, { lanes: spy("g1") }));
    await S.buildStarterCore(USER, g2, NOW, depsFor(w, { lanes: spy("g2") }));
    await S.buildStarterCore(USER, g3, NOW, depsFor(w, { lanes: spy("g3") }));
    const near = (a: number | undefined, b: number) => a != null && Math.abs(a - b) < 1e-9;
    check(
      "goals: shares 5/1/5 h: goals of 5, 1 and 5 h get 5/11, 1/11 and 5/11 of the week, and the two Statistics goals half its Field pace each (a track goal's is 1)",
      near(seen.g1?.[0]?.share, 5 / 11) && near(seen.g2?.[0]?.share, 1 / 11) && near(seen.g3?.[0]?.share, 5 / 11) && near(seen.g1?.[0]?.fieldShare, 0.5) && near(seen.g3?.[0]?.fieldShare, 0.5) && seen.g2?.[0]?.fieldShare === undefined,
      json(seen)
    );
    // The verdict re-run: accepting goal 2's draft would turn goal 1 (ACTIVE) TIGHT at its new share.
    const v = world();
    const a1 = await accepted(v);
    const d2 = await seatedGoal(v, { ...INTAKE, aim: "Trade with a plan", fieldId: "f-trade", domainIds: ["d-risk"], hoursPerWeek: 5 }, 2);
    await S.buildStarterCore(USER, d2, NOW, depsFor(v));
    const tight: Partial<RoadmapLanes> = {
      ...lanesFor(v),
      feasibilityOf: (plan, input) => {
        const f = lanesFor(v).feasibilityOf!(plan, input);
        const goal1 = input.scopes.some((x) => x.domainIds.includes("d-prob"));
        return goal1 && input.share != null && input.share < 1 ? { ...f, milestones: f.milestones.map((m) => ({ ...m, worst: "TIGHT" as const, time: { ...m.time, verdict: "TIGHT" as const } })) } : f;
      },
    };
    const view = await S.loadRoadmapView(USER, NOW, depsFor(v, { lanes: tight }), d2);
    const alone = await S.loadRoadmapView(USER, NOW, depsFor(world(), { lanes: tight }));
    check(
      "goals: the verdict re-run: the accept sheet lists each ACTIVE goal accepting this draft turns TIGHT or OVER (DraftView.otherGoals: 'Goal 1 becomes tight')",
      json(view.draft?.otherGoals) === json([{ roadmapId: a1, slot: 1, label: "Statistics", from: "FITS", to: "TIGHT" }]) && alone.draft == null,
      json(view.draft?.otherGoals)
    );
    const one = world();
    const solo = await drafted(one);
    const soloView = await S.loadRoadmapView(USER, NOW, depsFor(one), solo);
    check("goals: with one goal the draft view carries no otherGoals (byte-identical)", !!soloView.draft && !("otherGoals" in soloView.draft), json(Object.keys(soloView.draft ?? {})));
  }
  {
    // The loaders per goal (§23.5) and Start's duplicate check across goals (§23.3).
    const w = world();
    const g1 = await accepted(w);
    const g2 = await seatedGoal(w, { ...INTAKE, aim: "Trade with a plan", fieldId: "f-trade", domainIds: ["d-risk"], hoursPerWeek: 3 }, 2);
    const deps = depsFor(w);
    const first = await S.loadRoadmapView(USER, NOW, deps);
    const second = await S.loadRoadmapView(USER, NOW, deps, g2);
    const forged = await S.loadRoadmapView(USER, NOW, deps, "someone-elses-goal");
    check("goals: loadRoadmapView shows the goal named, else the lowest seat's (a forged id never reads: family X)", first.header?.id === g1 && second.header?.id === g2 && forged.header?.id === g1 && second.header?.slot === 2 && first.header?.slot === 1, json([first.header?.id, second.header?.id, forged.header?.id]));
    check(
      "goals: RoadmapView.goals (the switcher): one pill per open goal in seat order, the current one marked, its label the Area's name or yours, its rank; canAdd only under GOALS_MAX (ruling 53)",
      json(first.goals?.pills.map((p) => [p.roadmapId, p.slot, p.current, p.label, p.labelIsYours, p.status])) === json([[g1, 1, true, "Statistics", false, "ACTIVE"], [g2, 2, false, "Trading", false, "DRAFT"]]) &&
        first.goals?.pills[0].rankIndex != null &&
        second.goals?.pills[1].current === true &&
        first.goals?.canAdd === true &&
        first.goals?.other.count === 0,
      json(first.goals)
    );
    const cards = await S.loadAimCards(USER, NOW, deps);
    const card = await S.loadAimCard(USER, NOW, deps);
    check("goals: loadAimCards gives one card per open goal in seat order; loadAimCard keeps the lowest seat's", json(cards.map((c) => [c.roadmapId, c.slot])) === json([[g1, 1], [g2, 2]]) && card?.roadmapId === g1, json(cards.map((c) => [c.roadmapId, c.slot])));
    const single = world();
    await accepted(single);
    const soloCards = await S.loadAimCards(USER, NOW, depsFor(single));
    const soloCard = await S.loadAimCard(USER, NOW, depsFor(single));
    check("goals: with one goal loadAimCards is [loadAimCard's card]", json(soloCards) === json([soloCard]));
    const soloView = await S.loadRoadmapView(USER, NOW, depsFor(single));
    check(
      "goals: with one goal at GOALS_MAX 3 the page carries the switcher, its one pill current and canAdd on (the way to a 2nd goal: ruling N15)",
      soloView.state === "ACTIVE" && soloView.goals?.pills.length === 1 && soloView.goals.pills[0].current && soloView.goals.canAdd === true,
      json(soloView.goals)
    );
    // Start's duplicate check reads every other goal's carried practices: goal 1's started practice is "already on Today from goal 1".
    const [m1] = rowsOf(w, g1, 1);
    await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, deps);
    const practice = itemsOf(w, m1.id).find((i) => i.kind === "PRACTICE" && i.templateId) as ItemRec;
    const g3 = await seatedGoal(w, { ...INTAKE, aim: "Inference, properly", domainIds: ["d-inf"], hoursPerWeek: 3, label: "Inference" }, 3);
    await S.buildStarterCore(USER, g3, NOW, deps);
    const d3 = rowsOf(w, g3, 1)[0];
    const ownPractice = d3 ? itemsOf(w, d3.id).find((i) => i.kind === "PRACTICE") : undefined;
    if (ownPractice) ownPractice.label = practice.label;
    (w.t.roadmap.find((x) => x.id === g3) as RoadmapRec).status = "ACTIVE";
    (w.t.roadmap.find((x) => x.id === g3) as RoadmapRec).version = 1;
    for (const m of rowsOf(w, g3, 1)) m.status = "PLANNED";
    const preview = d3 ? await S.startPreview(USER, d3.id, NOW, deps) : null;
    const row = preview?.practices.find((x) => x.itemId === ownPractice?.id);
    check(
      "goals: alreadyOnToday checks every open goal's carried practices ('already on Today from goal 1'), so Start never makes a duplicate task",
      !!row && row.on === false && row.alreadyOnToday?.templateId === practice.templateId && (row.alreadyOnToday as { fromGoal?: number | null }).fromGoal === 1,
      json([row, practice.label])
    );
  }

  // ═══ Revision 5, lane 8: the topic map's server path (contracts §22.13, §22.14; rulings 48–51, 59) ════
  //
  // The TOPICS cores run with topicSwitches { plans: true } (TOPIC_PLANS_LIVE is false in this build). No model phase
  // runs: a Gemini name is a topic row put in the fake store as MAP and GROUND would leave it (geminiTopicRow).
  console.log("— revision 5: the topic map (§22.13, §22.14) —");
  /** One TOPICS block; a fixture step that throws fails the block by name instead of ending the run. */
  const topicBlock = async (name: string, run: () => Promise<void>): Promise<void> => {
    try {
      await run();
    } catch (err) {
      check(`${name} (the block threw)`, false, err instanceof Error ? err.message : String(err));
    }
  };
  /** What a call threw: nothing, the tripwire's ModelTextError, or anything else. */
  const thrown = (f: () => unknown): "none" | "tripwire" | "other" => {
    try {
      f();
      return "none";
    } catch (err) {
      return err instanceof S.ModelTextError ? "tripwire" : "other";
    }
  };

  await topicBlock("TOPICS switches", async () => {
    // The six TOPIC_* constants are the user's setting (all on since b388a9b); this block reads them and never sets
    // them. Production deps (no topicSwitches) gate each core by its switch as the constants set it (ruling 16); with
    // every switch off by deps.topicSwitches (whatever the constants say), each core refuses before it reads anything.
    const cores = (deps: RoadmapDeps, id: string) => [
      ["plans", () => S.writeTopicsCore(USER, id, NOW, deps)],
      ["plans", () => S.breakIntoTopicsCore(USER, id, NOW, deps)],
      ["rate", () => S.breakDownCore(USER, id, NOW, deps)],
      ["rate", () => S.rateAgainCore(USER, id, NOW, deps)],
      ["names", () => S.goDeeperCore(USER, id, "T1", NOW, deps)],
      ["rate", () => S.advanceTopicChainCore(USER, id, false, NOW, deps)],
    ] as const;
    const built = { plans: TOPIC_PLANS_LIVE, rate: TOPIC_RATE_LIVE, place: TOPIC_PLACE_LIVE, names: TOPIC_NAMES_LIVE, link: TOPIC_LINK_LIVE, ground: TOPIC_GROUND_LIVE };
    const sw = topicSwitchesOf();
    eq(
      "TOPICS switches: production's switches are the build's TOPIC_* constants as the user set them, through ruling 16's chain (rate under plans; place, link under rate; names only with ground)",
      sw,
      {
        plans: built.plans,
        rate: built.plans && built.rate,
        place: built.plans && built.rate && built.place,
        names: built.plans && built.rate && built.names && built.ground,
        link: built.plans && built.rate && built.link,
        ground: built.plans && built.rate && built.names && built.ground,
      }
    );
    {
      const w = world();
      const id = await newDraft(w, TOPICS_INTAKE);
      const prod = depsFor(w, { callModel: async () => ({}) });
      const answers: string[] = [];
      for (const [, call] of cores(prod, id)) answers.push(errOf(await call()));
      check(
        "TOPICS switches: with production deps each core refuses (TOPIC_PLANS_OFF) exactly while its switch is off as the build sets it (writeTopics, breakIntoTopics: plans; breakDown, rateAgain, advanceTopicChain: rate; goDeeper: names)",
        cores(prod, id).every(([name], i) => (answers[i] === S.TOPIC_PLANS_OFF) === !sw[name]),
        json([sw, answers])
      );
    }
    const w = world();
    const id = await newDraft(w, TOPICS_INTAKE);
    let calls = 0;
    const off = depsFor(w, {
      topicSwitches: { plans: false, rate: false, place: false, names: false, link: false, ground: false },
      callModel: async () => {
        calls += 1;
        return {};
      },
    });
    const rowBefore = json(w.t.roadmap.find((r) => r.id === id));
    const applies = w.applies;
    const runs = w.t.roadmapRun.length;
    const answers: string[] = [];
    for (const [, call] of cores(off, id)) answers.push(errOf(await call()));
    check(
      "TOPICS switches: with every TOPIC_* switch off (deps.topicSwitches, whatever the build's constants say) writeTopics, breakIntoTopics, breakDown, rateAgain, goDeeper and advanceTopicChain refuse (TOPIC_PLANS_OFF), the model is never called and nothing is written",
      json(topicSwitchesOf(off.topicSwitches)) === json({ plans: false, rate: false, place: false, names: false, link: false, ground: false }) &&
        answers.every((a) => a === S.TOPIC_PLANS_OFF) &&
        calls === 0 &&
        w.modelCalls === 0 &&
        w.applies === applies &&
        w.t.roadmapRun.length === runs &&
        w.t.roadmapTopic.length === 0 &&
        json(w.t.roadmap.find((r) => r.id === id)) === rowBefore,
      json([answers, calls, w.modelCalls, w.applies - applies])
    );
  });

  await topicBlock("the topic map's own Gemini gate (ruling N11)", async () => {
    // The topic chain is offered and claimed on its own gate, the topic switches and a key, never ROADMAP_GEMINI_LIVE
    // (LEVELS drafting, off): the views' topicGemini, the cores' key check, and [Break into topics] in one tap.
    const types = await import("../src/lib/roadmap-types");
    const w = world();
    const id = await newDraft(w, TOPICS_INTAKE);
    const levelsOff = { geminiLive: false };
    const keyed = await S.loadRoadmapView(USER, NOW, depsFor(w, { ...levelsOff, hasKey: true }), id);
    const keyless = await S.loadRoadmapView(USER, NOW, depsFor(w, { ...levelsOff, hasKey: false }), id);
    const intakeKeyed = await S.loadIntakeView(USER, NOW, depsFor(w, { ...levelsOff, hasKey: true }));
    check(
      "N11 views: with a key and the topic switches on, topicGemini is true while hasKey (ROADMAP_GEMINI_LIVE, off) stays false, on the roadmap view and the intake; with no key it is false",
      types.ROADMAP_GEMINI_LIVE === false && keyed.topicGemini === true && keyed.hasKey === false && intakeKeyed.topicGemini === true && keyless.topicGemini === false,
      json({ keyed: [keyed.topicGemini, keyed.hasKey], intake: intakeKeyed.topicGemini, keyless: keyless.topicGemini })
    );

    let calls = 0;
    const noKey = topicDepsFor(w, {
      ...levelsOff,
      hasKey: false,
      callModel: async () => {
        calls += 1;
        return {};
      },
    });
    const runs0 = w.t.roadmapRun.length;
    const refused = [await S.breakDownCore(USER, id, NOW, noKey), await S.rateAgainCore(USER, id, NOW, noKey), await S.goDeeperCore(USER, id, "T1", NOW, noKey)].map(errOf);
    check(
      "N11 no key: [Break it down], [Rate again] and Go deeper refuse (TOPIC_GEMINI_NO_KEY) before anything is claimed; no Gemini call, no run",
      refused.every((r) => r === S.TOPIC_GEMINI_NO_KEY) && calls === 0 && w.t.roadmapRun.length === runs0,
      json({ refused, calls, runs: w.t.roadmapRun.length - runs0 })
    );
    const started = await S.breakDownCore(USER, id, NOW, topicDepsFor(w, levelsOff));
    check(
      "N11 with a key (a check's callModel) and ROADMAP_GEMINI_LIVE off: [Break it down] claims the chain head (a RATE run)",
      started.ok && w.t.roadmapRun.some((r) => r.roadmapId === id && (r as { phase?: string | null }).phase === "RATE"),
      json({ started: errOf(started), runs: w.t.roadmapRun.filter((r) => r.roadmapId === id).map((r) => (r as { phase?: string | null }).phase ?? null) })
    );

    // One tap on an accepted LEVELS plan: [Break into topics] with the chain on is breakDownCore itself (the re-plan draft
    // written, then RATE claimed); the LEVELS plan stays live and LEVELS drafting stays refused.
    const w2 = world();
    const id2 = await accepted(w2);
    const one = await S.breakDownCore(USER, id2, NOW, topicDepsFor(w2, levelsOff));
    const row2 = w2.t.roadmap.find((r) => r.id === id2) as RoadmapRec;
    const draftTopics = w2.t.roadmapTopic.filter((t) => t.roadmapId === id2 && t.version === row2.version + 1).length;
    const levels = await S.claimDraftCore(USER, id2, { force: true }, NOW, depsFor(w2, { geminiLive: undefined }));
    check(
      "N11 one tap: on an accepted LEVELS plan [Break it down] writes the TOPICS re-plan draft and claims RATE at once; the plan stays ACTIVE LEVELS, and LEVELS drafting still refuses with its switch off",
      one.ok && row2.status === "ACTIVE" && kindOf(row2) === "LEVELS" && draftTopics > 0 && w2.t.roadmapRun.some((r) => r.roadmapId === id2 && (r as { phase?: string | null }).phase === "RATE") && !levels.ok,
      json({ one: errOf(one), status: row2.status, kind: kindOf(row2), draftTopics, levels: errOf(levels) })
    );
  });

  await topicBlock("[Break into topics] never writes an empty topic draft (ruling N12)", async () => {
    // The live goal: an accepted plan whose intake held no Domain of the Area (its Domains rode the plan's items), so the
    // re-plan map was written with 0 topics and 0 milestones, chainDraftOf found no draft, and [Break it down] refused
    // "no topic draft after writing it" before Gemini was asked anything.
    const types = await import("../src/lib/roadmap-types");
    const levelsOff = { geminiLive: false };
    const replan = async (strip: (w: FakeWorld, id: string) => void) => {
      const w = world();
      const id = await accepted(w);
      strip(w, id);
      const res = await S.breakDownCore(USER, id, NOW, topicDepsFor(w, levelsOff));
      const row = w.t.roadmap.find((r) => r.id === id) as RoadmapRec;
      const v = row.version + 1;
      const topics = w.t.roadmapTopic.filter((t) => t.roadmapId === id && t.version === v);
      const view = await S.loadRoadmapView(USER, NOW, topicDepsFor(w, levelsOff), id);
      return { res, topics, view, rate: w.t.roadmapRun.some((r) => r.roadmapId === id && (r as { phase?: string | null }).phase === "RATE") };
    };
    const liveItems = (w: FakeWorld, id: string) => {
      const ms = new Set(w.t.roadmapMilestone.filter((m) => m.roadmapId === id).map((m) => m.id));
      return w.t.roadmapItem.filter((i) => ms.has(i.milestoneId) && i.kind === "DOMAIN");
    };
    // (a) No intake Domain: the plan's own Domain items seed layer 1.
    const a = await replan((w, id) => {
      (w.t.roadmap.find((r) => r.id === id) as RoadmapRec).domainIds = [];
    });
    check(
      "N12 (a): an accepted plan whose intake holds no Domain: [Break it down] seeds the re-plan map with the plan's own Domain items (layer 1, bound), writes the draft and claims RATE; the page shows the draft and its chain",
      a.res.ok && a.topics.some((t) => /^U\d+$/.test(t.key) && t.layer === 1 && !!t.domainId) && a.rate && !!a.view.draft && !!a.view.topicChain,
      json({ res: errOf(a.res), topics: a.topics.map((t) => [t.key, t.layer, t.name]), draft: !!a.view.draft, chain: !!a.view.topicChain })
    );
    // (b) No Domain at all: the aim's clauses are placed in the last band (AIM, chosen) so the draft is never empty.
    const b = await replan((w, id) => {
      (w.t.roadmap.find((r) => r.id === id) as RoadmapRec).domainIds = [];
      for (const i of liveItems(w, id)) i.decision = "REMOVED";
    });
    check(
      "N12 (b): with no Domain at all, the aim's clauses are the map's topics (AIM, chosen, the last band): the draft is written, RATE claimed, and the page shows the draft and its chain",
      b.res.ok && b.topics.length > 0 && b.topics.every((t) => t.nameOrigin === "AIM" && t.chosen) && b.rate && !!b.view.draft && !!b.view.topicChain && types.ROADMAP_GEMINI_LIVE === false,
      json({ res: errOf(b.res), topics: b.topics.map((t) => [t.key, t.layer, t.name, t.nameOrigin]), draft: !!b.view.draft, chain: !!b.view.topicChain })
    );
  });

  await topicBlock("TOPICS draft and undo", async () => {
    // A LEVELS goal broken into topics (ruling 49): the draft's kind rides Roadmap.draftPlan until accept.
    const w = world();
    const id = await accepted(w);
    const deps = topicDepsFor(w);
    const row = () => w.t.roadmap.find((r) => r.id === id) as RoadmapRec;
    const live0 = { depth: row().depth ?? null, rating: json(row().rating ?? null), domainIds: json(row().domainIds) };
    const view0 = livePartsOf(await S.loadRoadmapView(USER, NOW, deps));
    const broke = await S.breakIntoTopicsCore(USER, id, NOW, deps);
    // An edit of the draft (a topic you type) rebuilds its rows; the live plan still never moves.
    const added = await S.addTopicCore(USER, id, 1, "Bayesian updating", NOW, deps);
    const view1 = await S.loadRoadmapView(USER, NOW, deps);
    const parts1 = livePartsOf(view1);
    const moved = LIVE_PARTS.filter((k) => parts1[k] !== view0[k]);
    const dp = row().draftPlan as { version?: number; planKind?: string; depth?: number | null } | null;
    check(
      "TOPICS draft: goal 1 reads byte-identical LEVELS while a TOPICS draft exists",
      broke.ok &&
        broke.value.version === 2 &&
        added.ok &&
        row().version === 1 &&
        kindOf(row()) === "LEVELS" &&
        (row().depth ?? null) === live0.depth &&
        json(row().rating ?? null) === live0.rating &&
        json(row().domainIds) === live0.domainIds &&
        dp?.version === 2 &&
        dp.planKind === "TOPICS" &&
        dp.depth === live0.depth &&
        moved.length === 0 &&
        view1.draft?.topicMap != null,
      json([broke, added, row().planKind, row().depth, dp, moved])
    );

    const res = await S.acceptCore(USER, id, topicAccept(1), NOW, deps);
    const created = w.tree.flatMap((f) => f.domains).find((d) => d.name === "Bayesian updating");
    const took = { kind: kindOf(row()), version: row().version, draftPlan: row().draftPlan ?? null, domainIds: [...row().domainIds] };
    const undo = await S.undoAcceptCore(USER, id, 2, NOW, deps);
    const back = row().draftPlan as { version?: number; planKind?: string } | null;
    const topic = w.t.roadmapTopic.find((t) => t.roadmapId === id && t.version === 2 && t.name === "Bayesian updating");
    check(
      "TOPICS undo: an undone TOPICS accept restores the LEVELS plan's kind, depth, rating and Domains",
      res.ok &&
        took.kind === "TOPICS" &&
        took.version === 2 &&
        took.draftPlan == null &&
        !!created &&
        took.domainIds.includes(created.id) &&
        undo.ok &&
        row().version === 1 &&
        kindOf(row()) === "LEVELS" &&
        (row().depth ?? null) === live0.depth &&
        json(row().rating ?? null) === live0.rating &&
        json(row().domainIds) === live0.domainIds &&
        // The draft is a TOPICS draft again, and the Domain the accept created stays, bound to its topic (a re-accept creates none).
        back?.version === 2 &&
        back.planKind === "TOPICS" &&
        rowsOf(w, id, 2).length > 0 &&
        rowsOf(w, id, 2).every((m) => m.status === "DRAFT" || m.status === "LATER") &&
        topic?.domainId === created.id &&
        w.domainsCreated.length === 1,
      json([res, took, undo, row().planKind, row().depth, row().domainIds, back, topic?.domainId])
    );
  });

  await topicBlock("TOPICS accept", async () => {
    // The re-plan's accept over a live LEVELS milestone (ruling 49, question 8).
    const w = world();
    const id = await accepted(w);
    const deps = topicDepsFor(w);
    const row = () => w.t.roadmap.find((r) => r.id === id) as RoadmapRec;
    const [m1] = rowsOf(w, id, 1);
    must(await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w)), "start milestone 1");
    const rank = w.t.roadmapMilestone.find((m) => m.id === m1.id)?.rankIndex ?? null;
    must(await S.breakIntoTopicsCore(USER, id, NOW, deps), "break into topics");
    const unasked = await S.acceptCore(USER, id, topicAccept(0), NOW, deps);
    const untouched = kindOf(row()) === "LEVELS" && row().version === 1;
    const res = await S.acceptCore(USER, id, topicAccept(0, [], "KEEP"), NOW, deps);
    const m = w.t.roadmapMilestone.find((x) => x.id === m1.id) as MilestoneRec;
    const goal = w.templates.find((t) => t.id === m.goalId);
    const practices = itemsOf(w, m1.id).filter((i) => i.kind === "PRACTICE" && i.templateId).map((i) => i.templateId as string);
    const kept = (m.feasibility as { aftercareKept?: string[] } | null)?.aftercareKept ?? [];
    const marks = w.t.roadmapAcceptance.find((a) => a.roadmapId === id && a.version === 2)?.feasibility as { topicsClosedLive?: string } | null | undefined;
    check(
      "TOPICS accept: the live LEVELS milestone closes there, its rank kept",
      errOf(unasked) === S.RACED &&
        untouched &&
        res.ok &&
        kindOf(row()) === "TOPICS" &&
        row().version === 2 &&
        // Closed unreached there (its goal archived), never superseded, its rank as stored; the other LEVELS rows superseded.
        rank != null &&
        m.rankIndex === rank &&
        m.reachedDay == null &&
        m.status !== "SUPERSEDED" &&
        goal?.archivedAt != null &&
        marks?.topicsClosedLive === m1.id &&
        rowsOf(w, id, 1)
          .filter((x) => x.id !== m1.id)
          .every((x) => x.status === "SUPERSEDED") &&
        // [Keep on Today]: its practices stay, recorded as kept.
        practices.length > 0 &&
        practices.every((t) => kept.includes(t) && w.templates.find((x) => x.id === t)?.archivedAt == null),
      json([errOf(unasked), res, rank, [m.status, m.rankIndex, m.reachedDay], goal?.archivedAt, marks?.topicsClosedLive, practices, kept])
    );
    const undo = await S.undoAcceptCore(USER, id, 2, NOW, deps);
    eq("TOPICS undo: an accept that closed a live LEVELS milestone stays (ACCEPT_CLOSED_LIVE)", [errOf(undo), row().version, kindOf(row())], [S.ACCEPT_CLOSED_LIVE, 2, "TOPICS"]);
  });

  await topicBlock("TOPICS edges", async () => {
    // A child that builds on two other goals' Domains (ruling 48): two rows under (roadmapId, version, parentLineageId, childLineageId).
    const w = world();
    const g1 = await newDraft(w, TOPICS_INTAKE);
    const g2 = await seatedGoal(w, { ...INTAKE, aim: "Trade with a plan", fieldId: "f-trade", domainIds: ["d-risk"], hoursPerWeek: 3 }, 2);
    const g3 = await seatedGoal(w, { ...INTAKE, aim: "Probability, properly", domainIds: ["d-prob"], hoursPerWeek: 3, label: "Probability" }, 3);
    const deps = topicDepsFor(w);
    must(await S.writeTopicsCore(USER, g1, NOW, deps), "write the topics");
    must(await S.setLayersCore(USER, g1, { kind: "SET", layers: 2 }, NOW, deps), "two layers");
    const added = must(await S.addTopicCore(USER, g1, 2, "Bayesian updating", NOW, deps), "a layer-2 topic");
    const key = added.ok ? added.value.key : "";
    const res = await S.setParentsCore(USER, g1, key, { kind: "LINKS", keys: [], crossGoal: [{ roadmapId: g2, domainId: "d-risk" }, { roadmapId: g3, domainId: "d-prob" }] }, NOW, deps);
    const child = w.t.roadmapTopic.find((t) => t.roadmapId === g1 && t.version === 1 && t.key === key);
    const edges = w.t.roadmapTopicEdge.filter((x) => x.roadmapId === g1 && x.version === 1);
    const unique = new Set(edges.map((x) => `${x.roadmapId}|${x.version}|${x.parentLineageId}|${x.childLineageId}`));
    check(
      "TOPICS edges: one child with two cross-goal parents inserts",
      res.ok &&
        !!child &&
        edges.length === 2 &&
        unique.size === 2 &&
        edges.every((x) => x.childLineageId === child.lineageId && x.origin === "CROSS_GOAL" && x.parentDomainId != null && x.parentLineageId === `${CROSS_GOAL_PARENT_PREFIX}${x.parentDomainId}`) &&
        json(edges.map((x) => `${x.parentRoadmapId}:${x.parentDomainId}`).sort()) === json([`${g2}:d-risk`, `${g3}:d-prob`].sort()),
      json([res, edges.map((x) => [x.parentLineageId, x.childLineageId, x.origin, x.parentRoadmapId])])
    );
  });

  await topicBlock("TOPICS cap", async () => {
    // K = 6 and L* = 12: six layer milestones and the depth tail (Fluent, Mastered), past LEVELS' MAX_MILESTONES (ruling 50).
    const w = world();
    const id = await writtenTopics(w, { ...TOPICS_INTAKE, depth: 12 }, ["Bayes rule", "Markov chains", "Random walks", "Martingales", "Brownian motion"]);
    const res = await S.acceptCore(USER, id, topicAccept(5), NOW, topicDepsFor(w));
    const planned = rowsOf(w, id, 1).filter((m) => m.status === "PLANNED");
    check(
      "TOPICS cap: K=6, L*=12 accepts 8 milestones",
      res.ok && planned.length === 8 && planned.length > MAX_MILESTONES && planned.filter((m) => m.chainRole === "LAYER").length === 6 && planned.filter((m) => m.chainRole === "DEPTH").length === 2,
      json([res, planned.map((m) => [m.chainRole, m.layer, m.stage])])
    );
  });

  await topicBlock("TOPICS ranks and skip", async () => {
    // K = 4 and L* = 10: four layers and Fluent, G = 5 gates spread to the depth's rank (ruling 51).
    const w = world();
    const deps = topicDepsFor(w);
    const id = await writtenTopics(w, { ...TOPICS_INTAKE, depth: 10 }, ["Bayes rule", "Markov chains", "Martingales"]);
    const res = await S.acceptCore(USER, id, topicAccept(3), NOW, deps);
    const planned = () => rowsOf(w, id, 1).filter((m) => m.status === "PLANNED");
    check(
      "TOPICS ranks: K=4, L*=10 ranks 1, 1, 2, 3, 4",
      res.ok && json(planned().map((m) => m.rankIndex)) === json([1, 1, 2, 3, 4]) && json(planned().map((m) => m.chainRole)) === json(["LAYER", "LAYER", "LAYER", "LAYER", "DEPTH"]),
      json([res, planned().map((m) => [m.chainRole, m.layer, m.stage, m.rankIndex])])
    );
    // "I know this" on layer 1's topic (ruling 59): milestone 1 is PLANNED (unstarted); in place, no new version, no re-spread.
    const t1 = w.t.roadmapTopic.find((t) => t.roadmapId === id && t.version === 1 && t.layer === 1 && t.chosen && t.decision !== "REMOVED");
    const ids0 = json(rowsOf(w, id).map((m) => m.id));
    const paid0 = w.t.roadmapMeasure.filter((x) => x.topicLineageId === t1?.lineageId && x.role === "PAYS" && planned().some((m) => m.id === x.milestoneId)).map((x) => x.id);
    const skip = await S.skipTopicCore(USER, id, t1?.key ?? "", true, NOW, deps);
    const after = w.t.roadmapTopic.find((t) => t.id === t1?.id);
    check(
      "TOPICS skip: I know this on an unstarted milestone changes its measures in place",
      skip.ok &&
        paid0.length > 0 &&
        paid0.every((mid) => w.t.roadmapMeasure.find((x) => x.id === mid)?.role === "CONTEXT") &&
        json(rowsOf(w, id).map((m) => m.id)) === ids0 &&
        w.t.roadmap.find((r) => r.id === id)?.version === 1 &&
        after?.skippedDay === TODAY &&
        after.notes.includes("KNOWN_BY_YOU") &&
        // Milestone 1's every topic known: it gives no rank; G stays as accepted (the others keep theirs).
        json(planned().map((m) => m.rankIndex)) === json([null, 1, 2, 3, 4]),
      json([skip, t1?.key, paid0.map((mid) => w.t.roadmapMeasure.find((x) => x.id === mid)?.role), after?.skippedDay, planned().map((m) => m.rankIndex)])
    );
  });

  await topicBlock("Gemini names", async () => {
    // A kept Gemini name equal, once folded (formKeyOf: case and plural), to a Domain of the Field the map doesn't use.
    const w = world();
    const id = await writtenTopics(w, TOPICS_INTAKE);
    geminiTopicRow(w, id, "T1", "Probabilities");
    const taken = await S.acceptCore(USER, id, topicAccept(1, ["Probabilities"]), NOW, topicDepsFor(w));
    check(
      "Gemini names: accept refuses a kept Gemini name equal (normalised) to a Domain the Field holds (TOPIC_NAME_TAKEN), creating nothing",
      errOf(taken) === TOPIC_NAME_TAKEN && w.domainsCreated.length === 0 && w.t.roadmap.find((r) => r.id === id)?.status === "DRAFT",
      json([taken, w.domainsCreated])
    );

    // A kept Gemini name becomes a Domain with the mark; the topic you typed beside it gets a Domain without one.
    const v = world();
    const vid = await writtenTopics(v, TOPICS_INTAKE);
    const GEM = "Conditional expectation";
    const MINE = "Moment generating functions";
    const gemRow = geminiTopicRow(v, vid, "T1", GEM);
    must(await S.addTopicCore(USER, vid, 1, MINE, NOW, topicDepsFor(v)), "a topic you type");
    const unlisted = await S.acceptCore(USER, vid, topicAccept(2, []), NOW, topicDepsFor(v));
    const createdUnlisted = v.domainsCreated.length;
    const res = await S.acceptCore(USER, vid, topicAccept(2, [GEM]), NOW, topicDepsFor(v));
    const domains = v.tree.find((f) => f.id === "f-stats")?.domains ?? [];
    const gem = domains.find((d) => d.name === GEM);
    const mine = domains.find((d) => d.name === MINE);
    const bound = v.t.roadmapTopic.find((t) => t.roadmapId === vid && t.lineageId === gemRow.lineageId);
    const markedBefore = !!gem && geminiNamedOf(gem);
    if (gem) gem.name = `${GEM} (my notes)`; // the library's rename
    check(
      "Gemini names: accept turns a kept Gemini name into a Domain with nameOrigin GEMINI and originName (the mark stays until a rename; your typed topic's Domain has none), and a confirm that didn't name it is RACED with nothing created",
      errOf(unlisted) === S.RACED &&
        createdUnlisted === 0 &&
        res.ok &&
        gem?.nameOrigin === "GEMINI" &&
        gem.originName === GEM &&
        markedBefore &&
        !geminiNamedOf(gem) &&
        !!mine &&
        (mine.nameOrigin ?? null) === null &&
        !geminiNamedOf(mine) &&
        bound?.domainId === gem.id &&
        kindOf(v.t.roadmap.find((r) => r.id === vid)) === "TOPICS",
      json([errOf(unlisted), res, gem && { nameOrigin: gem.nameOrigin, originName: gem.originName }, mine?.nameOrigin, bound?.domainId])
    );

    // Ruling N3 (contracts §22.20, the names test): a Gemini name GROUND linked to exactly 1 source is a shown row, never
    // behind the fold, however many samples wrote it (ruling N6, which hid one sample's name, was withdrawn); a NONE one
    // stays there.
    const x = world();
    const xid = await writtenTopics(x, TOPICS_INTAKE);
    const ONE = "Conditional probability";
    const NONE_ROW = "Probability ladders";
    const SOLO = "Expectation";
    geminiTopicRow(x, xid, "T1", ONE, { decision: "PENDING", chosen: false, grounding: "WEAK", sources: [{ title: "example.edu", uri: "https://example.edu/notes" }], formVotes: 2 });
    geminiTopicRow(x, xid, "T2", NONE_ROW, { decision: "PENDING", chosen: false, grounding: "NONE", sources: [], formVotes: 1 });
    geminiTopicRow(x, xid, "T3", SOLO, { decision: "PENDING", chosen: false, grounding: "WEAK", sources: [{ title: "mathwords.com", uri: "https://mathwords.com/e" }], formVotes: 1 });
    const TMM = await import("../src/components/roadmap/topic-map-model");
    const xmap = (await S.loadRoadmapView(USER, NOW, topicDepsFor(x), xid)).draft?.topicMap ?? null;
    const l1 = xmap?.layers.find((l) => l.layer === 1) ?? null;
    const one = l1?.topics.find((r) => r.name === ONE) ?? null;
    const none = l1?.topics.find((r) => r.name === NONE_ROW) ?? null;
    const solo = l1?.topics.find((r) => r.name === SOLO) ?? null;
    const oneChip = { kind: "gemini-linked-one", label: "Gemini · Google linked 1 source" };
    check(
      "Gemini names (ruling N3; N6 withdrawn): a WEAK name at 1 source is a shown row (LINKED_ONE: unticked, a layer-1 checkbox, its one source, «Gemini · Google linked 1 source» on the row and the layer), whether 2 of 3 or 1 of 3 samples wrote it (votes in the ▸); a NONE name stays in the «n not checked» fold",
      !!one &&
        one.cls === "LINKED_ONE" &&
        !one.chosen &&
        one.canChoose &&
        TMM.rowHasCheckbox(one) &&
        one.sources.length === 1 &&
        json(TMM.rowChipOf(one, false)) === json(oneChip) &&
        !!l1 &&
        json(TMM.layerChipOf(l1)) === json(oneChip) &&
        !!none &&
        none.cls === "NOT_CHECKED" &&
        !!solo &&
        solo.cls === "LINKED_ONE" &&
        !solo.chosen &&
        solo.sources.length === 1 &&
        json(TMM.rowChipOf(solo, false)) === json(oneChip) &&
        json(solo.votes) === json({ form: 1, samples: 3 }) &&
        l1.hidden === 1 &&
        xmap?.hidden === 1,
      json({ rows: l1?.topics.map((r) => [r.key, r.name, r.cls, r.chosen, r.sources.length]), hidden: l1?.hidden, chip: l1 && TMM.layerChipOf(l1) })
    );
  });

  await topicBlock("tripwire", async () => {
    // §22.11's one writer: a Gemini topic name you haven't kept never reaches a plan view or a written row.
    const w = world();
    const NAME = "Stochastic calculus";
    const unchecked = S.topicOfRec(geminiTopicRow(w, "r-scratch", "T1", NAME, { decision: "PENDING", grounding: "NOT_RUN", formVotes: 2 }));
    const kept: typeof unchecked = { ...unchecked, decision: "KEPT" };
    const noDomains: { id: string; name: string; nameOrigin: string | null; originName: string | null }[] = [];
    const inMap = { draft: { topicMap: { layers: [{ layer: 2, topics: [{ key: "T1", name: NAME }] }] } } };
    const leaked = { ...inMap, milestones: [{ id: "m2", title: `${NAME} · layer 2 of 3`, layer: 2 }] };
    const redacted = S.assertTopicNames(leaked, { topics: [unchecked], domains: noDomains }, "REDACT") as typeof leaked;
    // A kept Gemini-named Domain reads only through its mark: a …Parts sibling (or geminiNamed: true on its holder).
    const marked = { topics: [], domains: [{ id: "d-gem", name: NAME, nameOrigin: "GEMINI", originName: NAME }] };
    const bare = { current: { measures: [{ label: `${NAME} · cards at level 6+` }] } };
    const parted = { current: { measures: [{ label: `${NAME} · cards at level 6+`, labelParts: [{ text: NAME, geminiNamed: true }, { text: " · cards at level 6+", geminiNamed: false }] }] } };
    check(
      "tripwire: assertTopicNames refuses a Gemini name not kept by you in a plan view (a milestone title: THROW in checks, 'Layer 2' under REDACT), passes it inside the map and once kept, and a kept Gemini-named Domain only through its mark",
      thrown(() => S.assertTopicNames(leaked, { topics: [unchecked], domains: noDomains }, "THROW")) === "tripwire" &&
        S.assertTopicNames(inMap, { topics: [unchecked], domains: noDomains }, "THROW") === inMap &&
        redacted.milestones[0].title === "Layer 2" &&
        redacted.draft.topicMap.layers[0].topics[0].name === NAME &&
        leaked.milestones[0].title.startsWith(NAME) &&
        S.assertTopicNames(leaked, { topics: [kept], domains: noDomains }, "THROW") === leaked &&
        thrown(() => S.assertTopicNames(bare, marked, "THROW")) === "tripwire" &&
        S.assertTopicNames(parted, marked, "THROW") === parted,
      json([redacted.milestones[0].title, thrown(() => S.assertTopicNames(bare, marked, "THROW"))])
    );
    const rowsTitled = (title: string, titleOrigin: MilestoneDraft["titleOrigin"]): MilestoneDraft[] => [
      { id: null, lineageId: "lin-tw", version: 1, ord: 1, title, titleOrigin, titleDecision: "PENDING", windowStart: null, dueDay: null, status: "DRAFT", rankIndex: null, overAccepted: false, items: [], measures: [], notes: [], stage: "FAMILIAR" },
    ];
    const writeCtx = (t: typeof unchecked): Parameters<typeof S.assertNoModelText>[1] => ({ roadmapId: "r-scratch", syllabusLines: [], domainNames: {}, rev4: true, topics: [t], domains: noDomains });
    const title = `${NAME} · layer 2 of 3`;
    eq(
      "tripwire: assertNoModelText (the one writer) refuses a code title holding a Gemini topic name not kept by you, and passes it once kept or in your own words",
      [
        thrown(() => S.assertNoModelText(rowsTitled(title, CODE_ORIGIN), writeCtx(unchecked))),
        thrown(() => S.assertNoModelText(rowsTitled(title, CODE_ORIGIN), writeCtx(kept))),
        thrown(() => S.assertNoModelText(rowsTitled(title, "USER"), writeCtx(unchecked))),
      ],
      ["tripwire", "none", "none"]
    );
  });

  // ═══ Revision 5: names end to end (recorded replies) ═══════════════════════
  //
  // "Gemini names your sub-topics" through the cores the page calls, the chain advanced by the page's own path
  // (roadmap-runtime useTopicChainPoll): load the view; while RoadmapView.topicChain has a step left (done false), call
  // advanceTopicChain(id, false), let its after() run, load the view again. Then the draft map (a WEAK name at 1 site
  // shown «Gemini · Google linked 1 source», ruling N3), the «n not checked» fold, a row ticked in a layer with nothing
  // chosen, [Keep these] on each layer, the deepest fold's first name kept ([Keep]) and a specialisation ticked in the
  // last layer, Accept with exactly what the footer's confirm sends (topic-map-model
  // acceptTopicChoicesOf over the view, the over switch as the footer asks for it), Start refused on milestone 2, and
  // the accepted plan's page as production loads it. Every topic switch is on for this block only
  // (deps.topicSwitches; production passes none), so nothing here reads the TOPIC_* constants.
  //
  // The replies come from probe stage 1 (scripts/fixtures/roadmap-corpus/probe-v5-P*.json, read, never edited). Where a
  // recording can't answer the pack the chain sends, the reply is ADAPTED from it by a fixed rule and labelled so in the
  // facts (`replies`); no name, source or count is invented to make a step pass, and a refused step fails its check
  // with the refusal:
  //   RATE    P1 verbatim, for each sample (DIFF_3 / MEDIUM: 3 layers of up to 3 names).
  //   MAP     P3's names. P3 was recorded for a 4-layer, 5-a-layer pack; a pack asking for other layers or fewer names
  //           a layer gets P3 ADAPTED to its schema: P3's layers the schema lists, in P3's order, each cut to the
  //           schema's maxItems (no name changed, none added). A pack P3 fits gets P3 verbatim.
  //   LINK    P4's shape (each child key → the keys it builds on, enum-checked), keyed to P3's names by BUILDS_ON,
  //           written for this test: no LINK reply was recorded for P3's names (P4 linked a synthetic list).
  //   GROUND  P5 verbatim for a batch of exactly P5's three terms; any other batch ADAPTED from P5's shape: one
  //           "<key>: <sentence>" line a term (P5's own sentence for a term P5 answered, else a plain one naming the
  //           term as written), P5's groundingChunks as recorded, a term's support citing the chunks P5's support for
  //           that term cited (for any other term, P5's i-th support's: 2, 1, 3 sites, so LINKED, WEAK, LINKED in
  //           DOMAIN mode), and P5's query form ("<term> Business Finance meaning definition") a term. MAP's
  //           REGION_SPECIFIC names (Mortgages and Loans …) are never sent to GROUND, so no batch here is P5's own three
  //           terms and every GROUND reply is adapted; P5's two other terms keep P5's sentence and cited chunks.
  //
  // Two passes, each to Start. A: Gemini's own estimate (P1: 3 layers) on a realistic date, the pace typed (the form
  // asks for it on [Break it down] when nothing measured one), so MAP gets P3 adapted. B: a chosen date and your 4
  // layers (setLayersCore SET once RATE settled, before the poll's first advance: the core's own path, since the page
  // shows the chip only after the chain), the pack P3 was recorded for, so MAP gets P3 verbatim.
  console.log("— revision 5: names end to end (recorded replies) —");
  await topicBlock("names end to end", async () => {
    const TMM = await import("../src/components/roadmap/topic-map-model");
    const recorded = (item: string) => JSON.parse(readFileSync(join(process.cwd(), "scripts/fixtures/roadmap-corpus", `probe-v5-${item}.json`), "utf8"));
    const P1 = recorded("P1");
    const P3 = recorded("P3");
    const P4 = recorded("P4");
    const P5 = recorded("P5");
    type Recorded = { raw: string; finishReason: string; usage: unknown };
    type GroundVerdicts = Record<string, { verdict: string; sources: { title: string; uri: string }[]; reason: string }>;
    type ChainRun = RunRec & { phase?: string | null; requests?: number | null; grounding?: { verdicts?: GroundVerdicts } | null };
    type Term = { key: string; name: string };
    type Support = { segment: { startIndex?: number; endIndex: number; text: string }; groundingChunkIndices: number[] };
    // The recorded packs' aim and Area (P1 and P3 were sent for exactly these words).
    const AIM = "Learn to run a household's investments and home loan, and keep the monthly budget on track";
    const AREA = "Business & Finance";
    // What each of P3's names builds on: the LINK reply's choice, by name, keyed through the pack the chain sends.
    const BUILDS_ON: Record<string, string> = {
      "Income and Expense Tracking": "Household Finance",
      "Portfolio Allocation": "Investment Management",
      "Home Loan Structure": "Mortgages and Loans",
      "Monthly Budgeting": "Income and Expense Tracking",
      "Asset Diversification": "Portfolio Allocation",
      "Interest Rates": "Home Loan Structure",
      "Expense Categorization": "Monthly Budgeting",
      "Risk Tolerance": "Asset Diversification",
      "Loan Refinancing": "Interest Rates",
    };
    const P3_REPLY = P3.replies[0] as Recorded & { parsed: { names: Record<string, { name: string; scope: string }[]> } };
    /** Ruling N8: the milestone this check's MAP reply writes for a layer key (P3 holds none). */
    const MILESTONE_OF = (l: string) => ({ title: `Stage ${l} of the household plan`, hurdle: `The ${l} hurdle`, target: `The ${l} target` });
    const P5_META = P5.parts.metadata as { groundingChunks: { web: { title: string; uri: string } }[]; groundingSupports: Support[]; webSearchQueries: string[] };
    const P5_TERMS = P5.terms as Term[];
    const P5_LINES = (P5.parts.parts[0].text as string).split("\n");
    const P5_CHUNKS = P5_META.groundingChunks;
    const chunks = P5_CHUNKS.map((c) => c.web);
    const fromChunks = (s: { title: string; uri: string }) => chunks.some((c) => c.title === s.title && c.uri === s.uri);
    // P5's support for each of its terms (the segment that carries its key's line), and its query form's tail.
    const p5SupportOf = (key: string) => P5_META.groundingSupports.find((s) => s.segment.text.startsWith(`${key}: `)) as Support;
    const P5_QUERY_TAIL = (() => {
      const q = P5_META.webSearchQueries[0];
      const t = P5_TERMS.find((x) => q.startsWith(x.name));
      return t ? q.slice(t.name.length) : "";
    })();
    const utf8 = (s: string) => new TextEncoder().encode(s).length;
    /** One GROUND reply for a batch: P5 verbatim for P5's own batch, else P5's shape (see the block's head). */
    const groundReplyOf = (batch: readonly Term[]): { response: unknown; label: string } => {
      if (json(batch) === json(P5_TERMS)) return { response: groundResponseOf(P5.parts), label: "P5 verbatim" };
      const lines: string[] = [];
      const supports: Support[] = [];
      let at = 0;
      batch.forEach((t, i) => {
        const own = P5_TERMS.findIndex((x) => x.name === t.name);
        const body = own >= 0 ? P5_LINES[own].replace(/^T\d+: /, "") : `${t.name} is a study topic in ${AREA}.`;
        const line = `${t.key}: ${body}`;
        const seg = line.replace(/\.$/, "");
        const cited = own >= 0 ? p5SupportOf(P5_TERMS[own].key).groundingChunkIndices : P5_META.groundingSupports[i % P5_META.groundingSupports.length].groundingChunkIndices;
        supports.push({ segment: { ...(at > 0 ? { startIndex: at } : {}), endIndex: at + utf8(seg), text: seg }, groundingChunkIndices: [...cited] });
        lines.push(line);
        at += utf8(line) + 1;
      });
      const parts = {
        parts: [{ text: lines.join("\n") }],
        metadata: { groundingChunks: P5_CHUNKS, groundingSupports: supports, webSearchQueries: batch.map((t) => `${t.name}${P5_QUERY_TAIL}`) },
        finishReason: P5.parts.finishReason,
        toolUsePromptTokenCount: P5.parts.toolUsePromptTokenCount,
        truncated: false,
      };
      return { response: groundResponseOf(parts), label: "P5 adapted" };
    };
    /**
     * One MAP reply for a pack: P3 verbatim when the pack's schema fits it, else P3 cut to the schema (see the block's
     * head). P3 was recorded at TOPIC_PROMPT_VERSION 2, before ruling N8's `milestones`: when the schema asks for them,
     * each listed layer gets MILESTONE_OF's, in front of P3's names (labelled "+ milestones"; no name changed).
     */
    const mapReplyOf = (req: ModelRequest): { reply: Recorded; label: string } => {
      const props = (req.responseSchema as { properties: Record<string, unknown> }).properties;
      const names = (props.names ?? { properties: {} }) as { properties: Record<string, { maxItems?: string }>; propertyOrdering?: string[] };
      const layers = names.propertyOrdering ?? Object.keys(names.properties);
      const recordedNames = P3_REPLY.parsed.names;
      const adapted = { names: Object.fromEntries(layers.filter((l) => recordedNames[l]).map((l) => [l, recordedNames[l].slice(0, Number(names.properties[l]?.maxItems ?? recordedNames[l].length))])) };
      const asked = (props.milestones as { propertyOrdering?: string[] } | undefined)?.propertyOrdering ?? null;
      const withMs = (body: object) => (asked ? { milestones: Object.fromEntries(asked.map((l) => [l, MILESTONE_OF(l)])), ...body } : body);
      const plus = asked ? " + milestones" : "";
      if (json(adapted) === json(P3_REPLY.parsed)) return { reply: asked ? { ...P3_REPLY, raw: JSON.stringify(withMs(P3_REPLY.parsed), null, 2) } : P3_REPLY, label: `P3 verbatim${plus}` };
      const max = layers.map((l) => names.properties[l]?.maxItems ?? "-").join("/");
      return { reply: { raw: JSON.stringify(withMs(adapted), null, 2), finishReason: P3_REPLY.finishReason, usage: P3_REPLY.usage }, label: `P3 adapted (${layers.join(" ")}; at most ${max})${plus}` };
    };
    const byName = (ts: readonly TopicRowRec[]) => ts.map((t) => `${t.key} L${t.layer} ${t.name} [${t.grounding}${t.flags.length ? ` ${t.flags.join(",")}` : ""}]`);
    // ratingOf over the three recorded RATE replies (the chip's source before MAP fills it).
    const rated = RATING.ratingOf({
      samples: [0, 1, 2].map(() => ({ parsed: P1.replies[0].parsed, integrity: "CLEAN" as const })),
      trackArea: false,
      outlineLines: 0,
      texts: { aim: AIM, areaName: AREA, constraints: null },
      inputKey: "",
      runId: null,
      day: TODAY,
    });

    /** One pass: the form's save, [Break it down], (your layer count), then the page's poll until the chain is done. */
    const drive = async (yourLayers: number | null, newCardsPerWeek: number | null, day: DayKey | null) => {
      let sent = 0;
      const replyOf = (r: Recorded) => ({ candidates: [{ content: { role: "model", parts: [{ text: r.raw }] }, finishReason: r.finishReason }], usageMetadata: r.usage, modelVersion: P1.model, responseId: `rec-${sent}` });
      const calls: Record<string, number> = {};
      const replies: string[] = [];
      const mapPacks: string[] = [];
      const groundBatches: string[][] = [];
      const callModel = async (req: ModelRequest): Promise<unknown> => {
        sent += 1;
        const props = (req.responseSchema as { properties?: Record<string, unknown> } | null)?.properties ?? {};
        const phase = req.googleSearch ? "GROUND" : "difficulty" in props ? "RATE" : "names" in props || "place" in props ? "MAP" : "LINK";
        calls[phase] = (calls[phase] ?? 0) + 1;
        if (phase === "RATE") {
          replies.push("RATE: P1 verbatim");
          return replyOf(P1.replies[0]);
        }
        if (phase === "MAP") {
          mapPacks.push(req.contents);
          const m = mapReplyOf(req);
          replies.push(`MAP: ${m.label}`);
          return replyOf(m.reply);
        }
        if (phase === "GROUND") {
          const batch = [...req.contents.matchAll(/^([STU]\d+) · (.+)$/gm)].map((m) => ({ key: m[1], name: m[2] }));
          groundBatches.push(batch.map((t) => `${t.key} · ${t.name}`));
          const g = groundReplyOf(batch);
          replies.push(`GROUND: ${g.label}`);
          return g.response;
        }
        // LINK, shaped as P4 answered: each child key → the key of what it builds on (enum-checked), else ["NONE"].
        const keyOfName = new Map([...req.contents.matchAll(/([STU]\d+) · ([^;\n]+)/g)].map((m) => [m[2].trim(), m[1]]));
        const nameOfKey = new Map([...keyOfName].map(([name, key]) => [key, name]));
        const schema = req.responseSchema as { required: string[]; properties: Record<string, { items: { enum: string[] } }> };
        const reply = Object.fromEntries(
          schema.required.map((child) => {
            const parent = keyOfName.get(BUILDS_ON[nameOfKey.get(child) ?? ""] ?? "");
            return [child, parent && schema.properties[child].items.enum.includes(parent) ? [parent] : ["NONE"]];
          })
        );
        replies.push("LINK: P4's shape");
        return replyOf({ raw: JSON.stringify(reply, null, 2), finishReason: "STOP", usage: P4.replies[0].usage });
      };
      const w = world();
      w.tree.push({ id: "f-fin", name: AREA, level: 1, domains: [] });
      const tasks: (() => Promise<void> | void)[] = [];
      // Each tap or poll a second later than the last (a step's run row is stamped when it is claimed).
      let at = NOW.getTime();
      const later = () => new Date((at += 1000));
      const deps = depsFor(w, {
        topicSwitches: { plans: true, rate: true, place: true, names: true, link: true, ground: true },
        callModel,
        defer: (t) => tasks.push(t),
        clock: () => new Date(at),
        // The real integrity walk (R3's integrityOf): the fixture lane reads only LEVELS replies.
        lanes: { ...lanesFor(w), integrityOf: VALIDATE.integrityOf },
      });
      // after(): each deferred step runs to its end before the next poll.
      const settle = async () => {
        while (tasks.length) await (tasks.shift() as () => Promise<void> | void)();
      };
      const chainRuns = () => (w.t.roadmapRun as ChainRun[]).filter((r) => r.phase != null);
      // The new-aim form on a Field Area, [Break it down] (RoadmapForm's BREAKDOWN path: planKind TOPICS, topicDepth, depth null).
      const intake: Intake = {
        ...INTAKE,
        aim: AIM,
        fieldId: "f-fin",
        domainIds: [],
        planKind: "TOPICS",
        topicDepth: 12,
        depth: null,
        newCardsPerWeek,
        ...(day ? { dateMode: "CHOSEN" as const, targetDay: day } : { dateMode: "REALISTIC" as const }),
      };
      const saved = must(await S.saveIntakeCore(USER, intake, later(), deps), "saveIntake");
      const id = saved.ok ? saved.value.roadmapId : "";
      must(await S.breakDownCore(USER, id, later(), deps), "breakDown");
      await settle();
      if (yourLayers != null) must(await S.setLayersCore(USER, id, { kind: "SET", layers: yourLayers }, later(), deps), `set ${yourLayers} layers`);
      // The page's poll (useTopicChainPoll): while the view says a step is left, advance, let after() run, refresh.
      const polls: string[] = [];
      let done = false;
      let pollError: string | null = null;
      let waited = true;
      for (let i = 0; i < 16; i++) {
        const v = await S.loadRoadmapView(USER, later(), deps, id);
        const chain = v.topicChain ?? null;
        polls.push(chain ? `${v.state} ${chain.phase ?? "-"}${chain.running ? " running" : ""}${chain.done ? " done" : ""}${chain.stop ? ` ${chain.stop}` : ""}` : `${v.state} (no chain)`);
        if (!chain || chain.done) {
          done = chain?.done === true && chain.stop == null;
          break;
        }
        // A fresh DRAFT stays on the wait card (state RUNNING) while a step is left.
        if (v.state !== "RUNNING") waited = false;
        const step = await S.advanceTopicChainCore(USER, id, false, later(), deps);
        if (!step.ok) {
          pollError = step.error;
          break;
        }
        await settle();
      }
      const topicsV1 = () => w.t.roadmapTopic.filter((t) => t.roadmapId === id && t.version === 1 && t.decision !== "REMOVED" && t.decision !== "MERGED");
      const gemini = () => topicsV1().filter((t) => t.nameOrigin === "GEMINI");
      const verdicts = Object.assign({}, ...chainRuns().filter((r) => r.phase === "GROUND").map((r) => r.grounding?.verdicts ?? {})) as GroundVerdicts;
      const mapRun = chainRuns().find((r) => r.phase === "MAP");
      const mapReport = (mapRun?.report ?? null) as { kept?: string[]; hidden?: string[]; topics?: unknown; kFinal?: number } | null;
      const kFinal = mapReport?.kFinal ?? null;
      const facts = {
        done,
        waited,
        pollError,
        polls,
        runs: chainRuns().map((r) => [r.phase, r.status, r.error ?? null]),
        calls,
        replies,
        groundBatches,
        names: byName(gemini()),
        map: mapReport && { kFinal: mapReport.kFinal, kept: mapReport.kept, hidden: mapReport.hidden },
        verdicts,
      };
      return { w, id, deps, later, chainRuns, topicsV1, gemini, kFinal, mapPacks, replies, facts };
    };

    /** From the draft map to Start, as the page does it; `tag` names the pass in each check. */
    const toStart = async (d: Awaited<ReturnType<typeof drive>>, tag: string, chip: (tm: TopicMapView) => [boolean, unknown]) => {
      const view = await S.loadRoadmapView(USER, d.later(), d.deps, d.id);
      const tm = view.draft?.topicMap ?? null;
      const gemini = d.gemini();
      const linked = gemini.filter((t) => t.grounding === "LINKED" && t.flags.length === 0);
      // Ruling N3 (the names test): a WEAK name at exactly 1 source is shown, «Gemini · Google linked 1 source».
      const linkedOne = gemini.filter((t) => t.grounding === "WEAK" && Array.isArray(t.sources) && t.sources.length === 1 && t.flags.length === 0);
      const unlinked = gemini.filter((t) => !linked.includes(t) && !linkedOne.includes(t));
      const rows = (tm?.layers ?? []).flatMap((l) => l.topics);
      const rowOfLineage = new Map(rows.map((r) => [r.lineageId, r]));
      const shownLinked = rows.filter((r) => r.cls === "LINKED");
      const shownOne = rows.filter((r) => r.cls === "LINKED_ONE");
      const [chipOk, chipFacts] = tm ? chip(tm) : [false, null];
      check(`names e2e (${tag}): the estimate chip and the bands`, !!tm && chipOk && tm.layers.length === tm.rating.layers, json({ chip: chipFacts, bands: tm?.layers.length, draft: view.draft != null, state: view.state }));
      check(
        `names e2e (${tag}): each band carries MAP's milestone for its layer (ruling N8: the reply's title, hurdle and target, through RatingRecord.milestones)`,
        !!tm && tm.layers.length > 0 && tm.layers.every((l) => json(l.milestone) === json({ layer: l.layer, ...MILESTONE_OF(`L${l.layer}`) })),
        json(tm?.layers.map((l) => l.milestone ?? null))
      );
      check(
        `names e2e (${tag}): LINKED names appear as Gemini rows «Gemini · Google linked n sources», each with ≥ SOURCES_MIN distinct sites, and WEAK names at 1 site as LINKED_ONE rows «Gemini · Google linked 1 source» (ruling N3: shown, unticked, that one site); every source from the reply's groundingChunks`,
        !!tm &&
          linked.length > 0 &&
          linkedOne.length > 0 &&
          json(shownLinked.map((r) => r.lineageId).sort()) === json(linked.map((t) => t.lineageId).sort()) &&
          json(shownOne.map((r) => r.lineageId).sort()) === json(linkedOne.map((t) => t.lineageId).sort()) &&
          rows.filter((r) => r.votes != null).every((r) => r.cls === "LINKED" || r.cls === "LINKED_ONE" || r.cls === "NOT_CHECKED") &&
          shownLinked.every((r) => r.sources.length >= SOURCES_MIN && new Set(r.sources.map((s) => s.title)).size === r.sources.length && r.sources.every(fromChunks)) &&
          shownOne.every((r) => !r.chosen && r.sources.length === 1 && r.sources.every(fromChunks) && json(TMM.rowChipOf(r, false)) === json({ kind: "gemini-linked-one", label: "Gemini · Google linked 1 source" })),
        json({ linked: byName(linked), linkedOne: byName(linkedOne), shown: [...shownLinked, ...shownOne].map((r) => [r.key, r.cls, r.name, r.sources.map((s) => s.title)]), verdicts: d.facts.verdicts })
      );
      check(
        `names e2e (${tag}): NONE, NOT_RUN and flagged names are listed only in their layer's «n not checked» fold: NOT_CHECKED rows (LayerBand's fold reads them), unticked, no sources, counted in hidden`,
        !!tm &&
          unlinked.length > 0 &&
          tm.hidden === unlinked.length &&
          unlinked.every((t) => {
            const r = rowOfLineage.get(t.lineageId);
            return !!r && r.cls === "NOT_CHECKED" && !r.chosen && r.sources.length === 0;
          }) &&
          tm.layers.every((l) => l.hidden === unlinked.filter((t) => t.layer === l.layer).length && l.topics.filter((r) => r.cls === "NOT_CHECKED").length === l.hidden),
        json({
          unlinked: byName(unlinked),
          layers: (tm?.layers ?? []).map((l) => ({ layer: l.layer, hidden: l.hidden, rows: l.topics.map((r) => `${r.key} ${r.cls}${r.chosen ? " chosen" : ""}`) })),
          hidden: tm?.hidden,
        })
      );

      // Layer by layer, top down, from the view only. Above the last layer: a layer showing nothing chosen ticks its
      // first shown row (its fold's first name, [Show the not-checked ones] → [Keep], when it shows none); then [Keep
      // these]. The deepest layer with a «n not checked» fold: its fold's first name kept ([Keep]: «Gemini · kept · not
      // checked»; since ruling N3 a WEAK name is shown, so the last layer's fold may be empty). The last layer: the
      // specialisation ticked (its first linked Gemini row not chosen yet, else its first shown row), then [Keep these].
      const K = tm?.layers.length ?? 0;
      const foldLayer = Math.max(0, ...(tm?.layers ?? []).filter((l) => l.topics.some((r) => r.cls === "NOT_CHECKED")).map((l) => l.layer));
      const steps: string[] = [];
      let foldKept: string | null = null;
      let special: string | null = null;
      for (let layer = 1; layer <= K; layer++) {
        const lv = (await S.loadRoadmapView(USER, d.later(), d.deps, d.id)).draft?.topicMap?.layers.find((l) => l.layer === layer);
        const rowsHere = lv?.topics ?? [];
        const shown = rowsHere.filter((r) => r.cls !== "NOT_CHECKED");
        const fold = rowsHere.find((r) => r.cls === "NOT_CHECKED") ?? null;
        if (layer === foldLayer && fold) {
          foldKept = fold.name;
          steps.push(`L${layer} keep ${fold.key} from the fold: ${errOf(await S.keepGeminiNameCore(USER, d.id, fold.key, d.later(), d.deps))}`);
        }
        if (layer < K) {
          if (!shown.some((r) => r.chosen)) {
            if (shown[0]) steps.push(`L${layer} tick ${shown[0].key}: ${errOf(await S.chooseTopicCore(USER, d.id, shown[0].key, true, d.later(), d.deps))}`);
            else if (fold && foldKept !== fold.name) steps.push(`L${layer} keep ${fold.key} from the fold: ${errOf(await S.keepGeminiNameCore(USER, d.id, fold.key, d.later(), d.deps))}`);
            else if (!fold) steps.push(`L${layer}: nothing shown, nothing in the fold`);
          }
        } else {
          const pick = shown.find((r) => r.cls === "LINKED" && !r.chosen) ?? shown[0] ?? null;
          special = pick?.name ?? null;
          steps.push(`L${layer} specialisation ${pick ? `${pick.key} ${pick.cls}: ${errOf(await S.chooseTopicCore(USER, d.id, pick.key, true, d.later(), d.deps))}` : "none: no row shown"}`);
        }
        steps.push(`L${layer} keep these: ${errOf(await S.keepLayerCore(USER, d.id, layer, d.later(), d.deps))}`);
      }
      const keptView = (await S.loadRoadmapView(USER, d.later(), d.deps, d.id)).draft?.topicMap?.layers ?? [];
      const lastRows = keptView.find((l) => l.layer === K)?.topics ?? [];
      const foldRows = keptView.find((l) => l.layer === foldLayer)?.topics ?? [];
      const keptRow = foldRows.find((r) => r.name === foldKept) ?? null;
      const specialRow = lastRows.find((r) => r.name === special) ?? null;
      check(
        `names e2e (${tag}): the deepest fold's name kept reads «Gemini · kept · not checked» (KEPT_NOT_CHECKED, chosen, no sources), and the last layer's specialisation is ticked`,
        foldLayer > 0 && !!keptRow && keptRow.cls === "KEPT_NOT_CHECKED" && keptRow.chosen && keptRow.sources.length === 0 && !!specialRow && specialRow.chosen,
        json({ steps, foldLayer, fold: foldRows.map((r) => `${r.key} ${r.name} ${r.cls}${r.chosen ? " chosen" : ""}`), last: lastRows.map((r) => `${r.key} ${r.name} ${r.cls}${r.chosen ? " chosen" : ""}`) })
      );
      // Accept as the footer sends it: the confirm's choices over the view, the over switch on when the footer asks for it.
      const before = await S.loadRoadmapView(USER, d.later(), d.deps, d.id);
      const tmBefore = before.draft?.topicMap ?? null;
      const choices = tmBefore ? TMM.acceptTopicChoicesOf(tmBefore, { keepAll: false, aftercare: null }) : null;
      const needsOver = !!before.draft?.feasibility?.over || before.draft?.dateCheck?.verdict === "OVER";
      const chosenNew = d.topicsV1().filter((t) => t.chosen && !t.domainId);
      const accepted = choices ? await S.acceptCore(USER, d.id, { overAccepted: needsOver, topicMap: choices }, d.later(), d.deps) : null;
      const row = d.w.t.roadmap.find((r) => r.id === d.id) as RoadmapRec;
      const fin = d.w.tree.find((f) => f.id === "f-fin")?.domains ?? [];
      const geminiNamed = choices?.geminiNamed ?? [];
      const marked = geminiNamed.map((name) => fin.find((x) => x.name === name)).map((x) => (x ? { name: x.name, nameOrigin: x.nameOrigin ?? null, originName: x.originName ?? null } : null));
      check(
        `names e2e (${tag}): [Keep these] on each layer, a specialisation ticked, Accept with the confirm's choices: the plan is TOPICS and every Gemini name it names (the fold's kept name and the specialisation among them) became a Domain marked GEMINI (originName = the name)`,
        !!accepted &&
          accepted.ok &&
          row.status === "ACTIVE" &&
          kindOf(row) === "TOPICS" &&
          geminiNamed.length > 0 &&
          foldKept != null &&
          geminiNamed.includes(foldKept) &&
          (specialRow?.cls !== "LINKED" || geminiNamed.includes(specialRow.name)) &&
          choices?.create === chosenNew.length &&
          marked.every((x) => x != null && x.nameOrigin === "GEMINI" && x.originName === x.name) &&
          chosenNew.every((t) => fin.some((x) => x.name === t.name)),
        json({ steps, foldKept, special, acceptRefusal: tmBefore?.acceptRefusal ?? null, needsOver, choices, chosen: byName(chosenNew), accept: accepted ? errOf(accepted) : "no map", marked })
      );
      const ladder = rowsOf(d.w, d.id, 1)
        .filter((m) => m.status === "PLANNED")
        .sort((x, y) => x.ord - y.ord);
      const filled = Math.max(0, ...d.topicsV1().filter((t) => t.chosen).map((t) => t.layer));
      eq(
        `names e2e (${tag}): the milestones are the layers in order, then the depth tail (Mastered: 2)`,
        accepted?.ok ? ladder.map((m) => (m.chainRole === "LAYER" ? `LAYER ${m.layer}` : String(m.chainRole))) : accepted ? errOf(accepted) : "no map",
        [...Array.from({ length: filled }, (_, i) => `LAYER ${i + 1}`), ...Array.from({ length: DEPTH_TAIL[12] }, () => "DEPTH")]
      );
      const m2 = ladder.find((m) => m.chainRole === "LAYER" && m.layer === 2) ?? null;
      const start2 = m2 ? errOf(await S.startMilestoneCore(USER, m2.id, START_ALL, d.later(), d.deps)) : "no layer-2 milestone";
      eq(`names e2e (${tag}): milestone 2 refuses Start before milestone 1 is reached (PREREQS_OPEN)`, start2, PREREQS_OPEN);
      // The accepted plan's page as production loads it (the tripwire in REDACT mode: a kept Gemini-named Domain's name
      // outside its mark is logged, never thrown). "Toward the aim" names the plan's Domains: each such label carries
      // its mark (labelParts). The paths the tripwire still logs (the current milestone's title and item labels: the
      // live fix's open item, no parts there yet) are listed in the detail, not passed as marked.
      const logged: string[] = [];
      const warn0 = console.warn;
      const mode0 = process.env.ROADMAP_CHECK;
      let planView: Awaited<ReturnType<typeof S.loadRoadmapView>> | null = null;
      try {
        console.warn = (m: unknown) => void logged.push(String(m));
        process.env.ROADMAP_CHECK = "0";
        planView = await S.loadRoadmapView(USER, d.later(), d.deps, d.id);
      } finally {
        console.warn = warn0;
        process.env.ROADMAP_CHECK = mode0;
      }
      const marks = new Set(geminiNamed);
      const towardRows = (planView?.toward?.measures ?? []).filter((x) => typeof x.label === "string" && [...marks].some((n) => (x.label as string).includes(n)));
      const tripPaths = logged.map((l) => (JSON.parse(l) as { path?: string }).path ?? l);
      check(
        `names e2e (${tag}): the accepted plan's page loads; "Toward the aim" shows each kept Gemini-named Domain with its mark (labelParts, geminiNamed), and the tripwire logs nothing there`,
        planView?.state === "ACTIVE" &&
          towardRows.length > 0 &&
          towardRows.every((x) => (x.labelParts ?? []).some((p) => p.geminiNamed && marks.has(p.text))) &&
          !tripPaths.some((p) => p.startsWith("toward.")),
        json({ toward: towardRows.map((x) => x.labelParts), tripwireStillLogs: tripPaths })
      );
    };

    // ── Pass A: Gemini's own estimate (3 layers) on a realistic date, 20 new cards a week typed ──
    const a = await drive(null, 20, null);
    check(
      "names e2e (A: Gemini's estimate): the page's poll runs RATE → MAP → LINK ∥ GROUND to done on the recorded replies (MAP: P3 adapted to the 3 rated layers), the draft on the wait card between steps, every step OK",
      a.facts.done &&
        a.facts.waited &&
        a.chainRuns().every((r) => r.status === "OK") &&
        a.facts.calls.RATE === 3 &&
        a.facts.calls.MAP === 3 &&
        a.facts.calls.LINK === 3 &&
        (a.facts.calls.GROUND ?? 0) >= 1 &&
        a.replies.filter((r) => r.startsWith("MAP")).every((r) => r.startsWith("MAP: P3 adapted")) &&
        a.gemini().length > 0,
      json({ ...a.facts, mapPackSent: a.mapPacks[0] ?? null, mapPackRecorded: P3.contents })
    );
    // P5's own terms, re-keyed into the adapted batch, read as P5 recorded them (DOMAIN mode: the chunk titles are sites).
    const p5Verdict = (name: string) => {
      const key = a.gemini().find((t) => t.name === name)?.key ?? "";
      const v = a.facts.verdicts[key];
      return v ? `${v.verdict} ${v.sources.map((x) => x.title).join(" ")}` : "not checked";
    };
    eq(
      "names e2e (A): P5's own terms in the adapted GROUND replies read as P5's recorded reply does: Household Finance LINKED by uri.edu and grupbancsabadell.com, Investment Management WEAK by wikipedia.org",
      P5_TERMS.slice(0, 2).map((t) => `${t.name}: ${p5Verdict(t.name)}`),
      ["Household Finance: LINKED uri.edu grupbancsabadell.com", "Investment Management: WEAK wikipedia.org"]
    );
    await toStart(a, "A: Gemini's estimate", (tm) => [
      tm.rating.layers === (a.kFinal == null ? rated.layers : RATING.withMapFillOf(rated, a.kFinal).layers) && tm.rating.origin === rated.origin && tm.rating.mapFilled === a.kFinal,
      { chip: { layers: tm.rating.layers, origin: tm.rating.origin, mapFilled: tm.rating.mapFilled }, rated: { layers: rated.layers, origin: rated.origin }, kFinal: a.kFinal },
    ]);

    // ── Pass B: a chosen date, your 4 layers once RATE settled; MAP gets P3 verbatim (the pack it was recorded for) ──
    const b = await drive(4, null, addDays(TODAY, 700));
    check(
      "names e2e (B: 4 layers set by you): the page's poll runs RATE → MAP → LINK ∥ GROUND to done on the recorded replies (MAP: P3 verbatim, with ruling N8's milestones), the draft on the wait card between steps, every step OK",
      b.facts.done &&
        b.facts.waited &&
        b.chainRuns().every((r) => r.status === "OK") &&
        b.facts.calls.RATE === 3 &&
        b.facts.calls.MAP === 3 &&
        b.facts.calls.LINK === 3 &&
        (b.facts.calls.GROUND ?? 0) >= 1 &&
        b.replies.filter((r) => r.startsWith("MAP")).every((r) => r === "MAP: P3 verbatim + milestones") &&
        b.gemini().length > 0,
      json(b.facts)
    );
    await toStart(b, "B: 4 layers set by you", (tm) => [
      tm.rating.layers === 4 && tm.rating.origin !== rated.origin && tm.rating.geminiLayers === rated.layers && tm.rating.mapFilled === b.kFinal,
      { chip: { layers: tm.rating.layers, origin: tm.rating.origin, geminiLayers: tm.rating.geminiLayers, mapFilled: tm.rating.mapFilled }, kFinal: b.kFinal },
    ]);

    // ── Pass C (ruling N10): [Add an idea here] on the draft map. A shown Gemini topic with no Domain gets one in the
    //    Area Field now (Gemini's mark, the topic kept and chosen), a second tap answers the same Domain, an intake
    //    Domain's topic answers its own, and accept then creates no Domain twice. ──
    const c = await drive(4, null, addDays(TODAY, 700));
    const tmC = (await S.loadRoadmapView(USER, c.later(), c.deps, c.id)).draft?.topicMap ?? null;
    const rowsC = (tmC?.layers ?? []).flatMap((l) => l.topics);
    const pick = rowsC.find((r) => (r.cls === "LINKED" || r.cls === "LINKED_ONE") && !r.domain) ?? null;
    const before = (c.w.tree.find((f) => f.id === "f-fin")?.domains ?? []).length;
    const first = pick ? await S.topicIdeaTargetCore(USER, c.id, pick.key, c.later(), c.deps) : null;
    const again = pick ? await S.topicIdeaTargetCore(USER, c.id, pick.key, c.later(), c.deps) : null;
    const finC = c.w.tree.find((f) => f.id === "f-fin")?.domains ?? [];
    const madeC = first?.ok ? (finC.find((x) => x.id === first.value.domainId) ?? null) : null;
    const boundC = pick ? (c.topicsV1().find((t) => t.key === pick.key) ?? null) : null;
    const libRow = rowsC.find((r) => r.domain && /^U\d+$/.test(r.key)) ?? null;
    const lib = libRow ? await S.topicIdeaTargetCore(USER, c.id, libRow.key, c.later(), c.deps) : null;
    const gone = await S.topicIdeaTargetCore(USER, c.id, "T999", c.later(), c.deps);
    check(
      "ruling N10 [Add an idea here]: a shown Gemini topic with no Domain gets one in the Area Field under its name (unmarked until accept), bound to the topic, which is kept and chosen; a second tap answers the same Domain (created false); an intake Domain's topic answers its own; a gone key refuses",
      !!pick &&
        !!first?.ok &&
        first.value.created &&
        first.value.fieldId === "f-fin" &&
        !!madeC &&
        madeC.name === pick.name &&
        !madeC.nameOrigin &&
        finC.length === before + 1 &&
        !!boundC &&
        boundC.domainId === first.value.domainId &&
        boundC.chosen &&
        boundC.decision === "KEPT" &&
        !!again?.ok &&
        again.value.domainId === first.value.domainId &&
        !again.value.created &&
        (!libRow || (!!lib?.ok && lib.value.domainId === libRow.domain?.id && !lib.value.created)) &&
        !gone.ok,
      json({ pick: pick && [pick.key, pick.name, pick.cls], first, again, made: madeC && { name: madeC.name, nameOrigin: madeC.nameOrigin, originName: madeC.originName }, bound: boundC && { domainId: boundC.domainId, chosen: boundC.chosen, decision: boundC.decision }, lib, gone })
    );
    const rowC1 = ((await S.loadRoadmapView(USER, c.later(), c.deps, c.id)).draft?.topicMap?.layers ?? []).flatMap((l) => l.topics).find((r) => r.key === pick?.key) ?? null;
    // Each layer kept as the page does it (a layer showing nothing chosen ticks its first shown row), then accept.
    const stepsC: string[] = [];
    for (const l of tmC?.layers ?? []) {
      const lv = (await S.loadRoadmapView(USER, c.later(), c.deps, c.id)).draft?.topicMap?.layers.find((x) => x.layer === l.layer);
      const shownHere = (lv?.topics ?? []).filter((r) => r.cls !== "NOT_CHECKED");
      if (!shownHere.some((r) => r.chosen) && shownHere[0]) stepsC.push(`L${l.layer} tick: ${errOf(await S.chooseTopicCore(USER, c.id, shownHere[0].key, true, c.later(), c.deps))}`);
      stepsC.push(`L${l.layer} keep: ${errOf(await S.keepLayerCore(USER, c.id, l.layer, c.later(), c.deps))}`);
    }
    const viewC = await S.loadRoadmapView(USER, c.later(), c.deps, c.id);
    const tmC2 = viewC.draft?.topicMap ?? null;
    const rowC2 = (tmC2?.layers ?? []).flatMap((l) => l.topics).find((r) => r.key === pick?.key) ?? null;
    const choicesC = tmC2 ? TMM.acceptTopicChoicesOf(tmC2, { keepAll: false, aftercare: null }) : null;
    const overC = !!viewC.draft?.feasibility?.over || viewC.draft?.dateCheck?.verdict === "OVER";
    const acceptedC = choicesC ? await S.acceptCore(USER, c.id, { overAccepted: overC, topicMap: choicesC }, c.later(), c.deps) : null;
    const named = (c.w.tree.find((f) => f.id === "f-fin")?.domains ?? []).filter((x) => x.name === pick?.name);
    check(
      "ruling N10: the view shows the topic kept by you (KEPT, never PICKED) with its Domain (fieldId on the map), and accept binds it as it is: it creates no second Domain of that name, and marks this one Gemini's (originName = the name)",
      tmC2?.fieldId === "f-fin" &&
        rowC1?.cls === "KEPT" &&
        rowC2?.domain?.id === (first?.ok ? first.value.domainId : null) &&
        !!acceptedC?.ok &&
        named.length === 1 &&
        named[0].nameOrigin === "GEMINI" &&
        named[0].originName === pick?.name,
      json({ fieldId: tmC2?.fieldId, cls: rowC1?.cls, steps: stepsC, row: rowC2 && { domain: rowC2.domain, cls: rowC2.cls }, accept: acceptedC ? errOf(acceptedC) : "no map", named: named.map((x) => [x.name, x.nameOrigin, x.originName]) })
    );
  });

  // ═══ Revision 5 (live fix): the chain's stops as the page reads them (RoadmapView.topicChain) ═══════════════
  //
  // The recorded replies again (P1, P3 for 4 layers you set, a NONE-only LINK, P5 verbatim for GROUND, or a 429), the
  // chain driven as the page's poll and its buttons do: why it stopped (stop, retry, unchecked, line, fit), and that
  // [Try again] / the poll moves it on. Every topic switch on for this block only (deps.topicSwitches).
  console.log("— revision 5 (live fix): the chain's stops —");
  await topicBlock("the chain's stops", async () => {
    const recorded = (item: string) => JSON.parse(readFileSync(join(process.cwd(), "scripts/fixtures/roadmap-corpus", `probe-v5-${item}.json`), "utf8"));
    const P1 = recorded("P1");
    const P3 = recorded("P3");
    const P4 = recorded("P4");
    const P5 = recorded("P5");
    const setup = async (opts: { groundFail: () => boolean; day: DayKey; layers: number }) => {
      let sent = 0;
      const replyOf = (r: { raw: string; finishReason: string; usage: unknown }) => ({ candidates: [{ content: { role: "model", parts: [{ text: r.raw }] }, finishReason: r.finishReason }], usageMetadata: r.usage, modelVersion: P1.model, responseId: `rec-${sent}` });
      const callModel = async (req: ModelRequest): Promise<unknown> => {
        sent += 1;
        const props = (req.responseSchema as { properties?: Record<string, unknown> } | null)?.properties ?? {};
        const phase = req.googleSearch ? "GROUND" : "difficulty" in props ? "RATE" : "names" in props || "place" in props ? "MAP" : "LINK";
        if (phase === "RATE") return replyOf(P1.replies[0]);
        // P3 predates ruling N8: the milestones the schema asks for are added in front of its names.
        if (phase === "MAP") {
          const asked = (props.milestones as { propertyOrdering?: string[] } | undefined)?.propertyOrdering ?? [];
          return replyOf({ ...P3.replies[0], raw: JSON.stringify({ milestones: Object.fromEntries(asked.map((l) => [l, { title: `Stage ${l}`, hurdle: "A hurdle", target: "A target" }])), ...P3.replies[0].parsed }) });
        }
        if (phase === "GROUND") {
          if (opts.groundFail()) throw new Error("429 quota");
          return groundResponseOf(P5.parts);
        }
        const schema = req.responseSchema as { required: string[] };
        return replyOf({ raw: JSON.stringify(Object.fromEntries(schema.required.map((c) => [c, ["NONE"]]))), finishReason: "STOP", usage: P4.replies[0].usage });
      };
      const w = world();
      w.tree.push({ id: "f-fin", name: "Business & Finance", level: 1, domains: [] });
      const tasks: (() => Promise<void> | void)[] = [];
      let at = NOW.getTime();
      const later = (ms = 1000) => new Date((at += ms));
      const deps = depsFor(w, {
        topicSwitches: { plans: true, rate: true, place: true, names: true, link: true, ground: true },
        callModel,
        defer: (t) => tasks.push(t),
        clock: () => new Date(at),
        lanes: { ...lanesFor(w), integrityOf: VALIDATE.integrityOf },
      });
      const settle = async () => {
        while (tasks.length) await (tasks.shift() as () => Promise<void> | void)();
      };
      const intake: Intake = {
        ...INTAKE,
        aim: "Learn to run a household's investments and home loan, and keep the monthly budget on track",
        fieldId: "f-fin",
        domainIds: [],
        planKind: "TOPICS",
        topicDepth: 12,
        depth: null,
        newCardsPerWeek: null,
        dateMode: "CHOSEN",
        targetDay: opts.day,
      };
      const saved = must(await S.saveIntakeCore(USER, intake, later(), deps), "saveIntake");
      const id = saved.ok ? saved.value.roadmapId : "";
      must(await S.breakDownCore(USER, id, later(), deps), "breakDown");
      await settle();
      must(await S.setLayersCore(USER, id, { kind: "SET", layers: opts.layers }, later(), deps), "set the layers");
      const view = async () => {
        const v = await S.loadRoadmapView(USER, later(), deps, id);
        const c = v.topicChain ?? null;
        return { state: v.state, chain: c && { done: c.done, phase: c.phase, running: c.running, stale: c.stale, stop: c.stop, retry: c.retry, unchecked: c.unchecked, line: c.line, fit: c.fit && { verdict: c.fit.verdict, offers: c.fit.offers, basis: c.fit.basis } } };
      };
      // The page's poll: advance while the view has a step left; a refused advance ends the poll with its error, and the
      // page refreshes (useTopicChainPoll).
      const errors: string[] = [];
      const poll = async () => {
        for (let i = 0; i < 12; i++) {
          const v = await view();
          if (!v.chain || v.chain.done) return v;
          const st = await S.advanceTopicChainCore(USER, id, false, later(), deps);
          if (!st.ok) {
            errors.push(st.error);
            return view();
          }
          await settle();
        }
        return view();
      };
      return { id, deps, later, settle, view, poll, w, tasks, errors };
    };

    // A failed web check: every GROUND call fails (a 429), then [Try again] (advanceTopicChain with retry) runs it again.
    let failing = true;
    const g = await setup({ groundFail: () => failing, day: addDays(TODAY, 700), layers: 4 });
    const v1 = await g.poll();
    failing = false;
    const retried = await S.advanceTopicChainCore(USER, g.id, true, g.later(), g.deps);
    await g.settle();
    const v2 = await g.poll();
    check(
      "chain stops: a failed web check stops GROUND_FAILED with the names it left unchecked and [Try again] (ADVANCE) on the draft; the retry runs the wave again and the chain ends with no stop",
      v1.state === "DRAFT" &&
        v1.chain?.done === true &&
        v1.chain.stop === "GROUND_FAILED" &&
        v1.chain.unchecked > 0 &&
        v1.chain.retry === "ADVANCE" &&
        retried.ok &&
        retried.value.phase === "GROUND" &&
        v2.chain?.done === true &&
        v2.chain.stop == null,
      json({ v1, retried: retried.ok ? retried.value : retried.error, v2 })
    );

    // A step killed at maxDuration: MAP's after() never runs; past TOPIC_RUN_STALE_MS the wait card goes stale, not done;
    // the poll's next advance marks it timed out, and the draft shows MAP_FAILED with [Try again].
    const k = await setup({ groundFail: () => false, day: addDays(TODAY, 700), layers: 4 });
    const claim = await S.advanceTopicChainCore(USER, k.id, false, k.later(), k.deps);
    k.tasks.length = 0;
    const k0 = await k.view();
    k.later(200_000);
    const k1 = await k.view();
    const settled = await S.advanceTopicChainCore(USER, k.id, false, k.later(), k.deps);
    const k2 = await k.view();
    check(
      "chain stops: a step killed mid-run reads running, then stale past TOPIC_RUN_STALE_MS (the wait card, not done); the poll's advance marks it timed out and the draft stops MAP_FAILED with [Try again] (ADVANCE)",
      claim.ok &&
        claim.value.phase === "MAP" &&
        k0.chain?.running === true &&
        k1.state === "RUNNING" &&
        k1.chain?.stale === true &&
        k1.chain.done === false &&
        settled.ok &&
        k2.state === "DRAFT" &&
        k2.chain?.done === true &&
        k2.chain.stop === "MAP_FAILED" &&
        k2.chain.retry === "ADVANCE",
      json({ claim: claim.ok ? claim.value : claim.error, k0, k1, settled: settled.ok ? settled.value : settled.error, k2 })
    );

    // MAP's realism pre-check: 6 layers by a date 40 days out with no pace: the stop carries its fit (verdict, basis line, offers).
    const o = await setup({ groundFail: () => false, day: addDays(TODAY, 40), layers: 6 });
    const vo = await o.poll();
    check(
      "chain stops: MAP's pre-check stops OVER or IMPOSSIBLE with its fit (the basis line as the stop's line, [Fewer layers] among the offers) and [Check again] (ADVANCE)",
      vo.state === "DRAFT" &&
        vo.chain?.done === true &&
        (vo.chain.stop === "OVER" || vo.chain.stop === "IMPOSSIBLE") &&
        vo.chain.fit?.verdict === vo.chain.stop &&
        vo.chain.line === vo.chain.fit.basis &&
        vo.chain.fit.offers.includes("FEWER_LAYERS") &&
        vo.chain.retry === "ADVANCE",
      json(vo)
    );

    // A request cap before MAP: the claim is CAPPED, the stop is REQUESTS_CAPPED with the server's own line; then
    // [Write the topics] replaces the stopped chain (no chain status left on the draft).
    const c = await setup({ groundFail: () => false, day: addDays(TODAY, 700), layers: 4 });
    const runs0 = c.w.t.roadmapRun as unknown as Record<string, unknown>[];
    runs0.push({ ...runs0[runs0.length - 1], id: "fake-used", roadmapId: "other", requests: 47, phase: "MAP", status: "OK" });
    const vc = await c.poll();
    const wrote = errOf(await S.writeTopicsCore(USER, c.id, c.later(), c.deps));
    const vw = await c.view();
    check(
      "chain stops: a request cap refuses the poll's advance with the cap's line, then the draft stops REQUESTS_CAPPED with the server's line and [Try again] (ADVANCE); [Write the topics] then replaces the chain (no chain status)",
      json(c.errors) === json([S.REQUESTS_CAPPED]) && vc.state === "DRAFT" && vc.chain?.done === true && vc.chain.stop === "REQUESTS_CAPPED" && vc.chain.line === S.REQUESTS_CAPPED && vc.chain.retry === "ADVANCE" && wrote === "ok" && vw.chain == null,
      json({ errors: c.errors, vc, wrote, vw })
    );

    // ── Fixer B: the chain's own cap, the requests left across goals, and the level paths on a TOPICS row ──
    const RT5 = await import("../src/lib/roadmap-types");
    type Row5 = { roadmapId: string; status: string; error: string | null; phase?: string | null; requests?: number | null };
    // Every web check fails (a 429 counts), and [Try again] runs the wave again until the breakdown's own cap is spent.
    const x = await setup({ groundFail: () => true, day: addDays(TODAY, 700), layers: 4 });
    await x.poll();
    const rows5 = () => x.w.t.roadmapRun as unknown as Row5[];
    const chainSent = () => rows5().filter((r) => r.roadmapId === x.id && r.phase != null).reduce((n, r) => n + (r.requests ?? 0), 0);
    const tries: string[] = [];
    for (let i = 0; i < RT5.BREAKDOWN_REQUESTS_MAX; i++) {
      const st = await S.advanceTopicChainCore(USER, x.id, true, x.later(), x.deps);
      tries.push(errOf(st));
      if (!st.ok) break;
      await x.settle();
    }
    const capRows = rows5().filter((r) => r.roadmapId === x.id && r.status === "CAPPED");
    const vx = await x.view();
    check(
      "chain cap: a failed wave tried again until the breakdown's BREAKDOWN_REQUESTS_MAX is spent: the next [Try again] is refused with the cap's line and sends nothing (CAPPED, 0 requests); the stop is REQUESTS_CAPPED with no [Try again]; the chain's requests never pass the cap",
      tries.length >= 2 &&
        tries.slice(0, -1).every((t) => t === "ok") &&
        tries[tries.length - 1] === S.REQUESTS_CAPPED &&
        capRows.length > 0 &&
        capRows.every((r) => (r.requests ?? 0) === 0) &&
        chainSent() <= RT5.BREAKDOWN_REQUESTS_MAX &&
        vx.chain?.done === true &&
        vx.chain.stop === "REQUESTS_CAPPED" &&
        vx.chain.retry == null,
      json({ tries, sent: chainSent(), capRows: capRows.length, vx })
    );
    // The map's requests left are the user's across goals today: another goal's 7 requests count.
    const own = rows5().filter((r) => r.roadmapId === x.id).reduce((n, r) => n + (r.requests ?? 0), 0);
    const xr = x.w.t.roadmapRun as unknown as Record<string, unknown>[];
    xr.push({ ...xr[xr.length - 1], id: "other-goal-run", roadmapId: "other", requests: 7, phase: "RATE", status: "OK" });
    const left = (await S.loadRoadmapView(USER, x.later(), x.deps, x.id)).draft?.topicMap?.requestsLeft ?? null;
    check(
      "requests left: TopicMapView.requestsLeft (Go deeper's cost and disabled state) counts the user's requests of every goal today, not this roadmap's alone",
      left != null && left.requests === Math.max(0, RT5.ROADMAP_REQUESTS_PER_DAY - own - 7),
      json({ left, own })
    );
    // A level plan's path on a row saved as TOPICS refuses with its own line before it writes anything.
    const before5 = rows5().length;
    const levels = [
      errOf(await S.buildStarterCore(USER, x.id, x.later(), x.deps)),
      errOf(await S.startManualCore(USER, x.id, x.later(), x.deps)),
      errOf(await S.claimDraftCore(USER, x.id, { force: false }, x.later(), { ...x.deps, geminiLive: true })),
      errOf(await S.claimDraftCore(USER, x.id, { force: true }, x.later(), { ...x.deps, geminiLive: true })),
    ];
    check(
      "LEVELS on a TOPICS row: buildStarter, startManual, draftRoadmap and redraft refuse with LEVELS_PATH_ON_TOPICS and write no run",
      levels.every((l) => l === S.LEVELS_PATH_ON_TOPICS) && rows5().length === before5,
      json(levels)
    );
  });

  if (failed > 0) {
    console.log(`\nroadmap-server-check: ${passed} passed, ${failed} FAILED${pendingCount ? `, ${pendingCount} pending other lanes` : ""}`);
    process.exit(1);
  }
  console.log(`\nroadmap-server-check: ${passed} passed, 0 failed${pendingCount ? `, ${pendingCount} pending other lanes (green at integration)` : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
