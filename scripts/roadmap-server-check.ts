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
 * injected sizing, one quest set, high-water baselines), F19 (the Aim card's
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
 * Cases that exercise another lane's real code (R1's readings, lane L's
 * prepareRoadmapGoalClose) go green at integration in those lanes' checks.
 */
import { addDays, todayKey, type DayKey } from "../src/lib/life-day";
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
  TreeField,
  Where,
} from "../src/lib/roadmap-server";
import {
  ORIGINS,
  ROADMAP_WRITES_OFF,
  RUN_FALLBACK_STARTER,
  THROUGHPUT_LAG_DAYS,
  cardsAtLevelKey,
  draftNeedsOf,
  isSupersededRow,
  proficiencyKey,
  milestoneCountFor,
  startStatedInputOf,
  type EvidencePack,
  type Feasibility,
  type Intake,
  type ItemDraft,
  type MeasureSpec,
  type MilestoneDraft,
  type MilestoneFeasibility,
  type Reading,
  type StartSnapshot,
  type ValidatedDraft,
  type WeekQuestSet,
} from "../src/lib/roadmap-types";
import type { ParsedCapture } from "../src/lib/life-types";
import * as R1 from "../src/lib/roadmap-proficiency";
import { reusableSamplesOf } from "../src/lib/roadmap-model";
import type { LabelChecked } from "../src/lib/roadmap-validate";
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
}

interface Tables {
  roadmap: RoadmapRec[];
  roadmapRun: RunRec[];
  roadmapMilestone: MilestoneRec[];
  roadmapItem: ItemRec[];
  roadmapMeasure: MeasureRec[];
  roadmapAcceptance: AcceptanceRec[];
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
  t: Tables = { roadmap: [], roadmapRun: [], roadmapMilestone: [], roadmapItem: [], roadmapMeasure: [], roadmapAcceptance: [], readings: [], questWeeks: [] };
  templates: (TemplateLite & { captureKey: string | null; link: CaptureLink | null; parsed: ParsedCapture | null; horizon: string | null })[] = [];
  goalPaid: Record<string, DayKey> = {};
  tree: TreeField[] = [];
  applies = 0;
  created: { parsed: ParsedCapture; captureKey: string | null; link: CaptureLink | null }[] = [];
  sized: string[] = [];
  createFailOnce = false;
  domainsCreated: { fieldId: string; name: string }[] = [];
  /** The throughput rows a scope's pace is read from (empty: every pace calibrating). */
  paceRows: ThroughputRows | null = null;
  /** The Body Area's weight view (null: none logged). */
  weight: WeightView | null = null;
  /** Calls the view loaders must never make. */
  modelCalls = 0;
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
      case "ROADMAP_IS":
        return t.roadmap.some(
          (r) =>
            r.id === g.id &&
            r.userId === userId &&
            g.statuses.includes(r.status as never) &&
            (g.version == null || r.version === g.version) &&
            (g.archiveReason == null || r.archiveReason === g.archiveReason)
        );
      case "NO_RECENT_RUNNING":
        return !t.roadmapRun.some((r) => r.roadmapId === g.roadmapId && r.status === "RUNNING" && r.startedAt.getTime() > g.since.getTime());
      case "GEMINI_RUNS_BELOW":
        return t.roadmapRun.filter((r) => r.userId === userId && r.day === g.day && r.kind === "GEMINI" && r.status !== "REUSED").length < g.max;
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
          break;
        }
        case "update": {
          const rows = this.table(op.table);
          for (const r of rows) if (matches(r, op.where)) Object.assign(r, clone(op.data));
          if (op.table === "roadmapMilestone" && op.data.goalId != null) {
            const ids = this.t.roadmapMilestone.filter((m) => m.goalId === op.data.goalId);
            if (ids.length > 1) return restore("duplicate");
          }
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
            this.t.questWeeks.push({ userId, roadmapId: op.roadmapId, milestoneId: op.set.milestoneId, dedupeKey: key, source: op.source });
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

/** [start, end) spans of each digit run (the fixture checker's NUMBER spans). */
function digitSpans(label: string): [number, number][] {
  return [...label.matchAll(/\d+/g)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
}

/** The fixture label checker (R3's checkLabel stand-in): a digit is NUMBER, a link is dropped. */
function fixtureCheckLabel(label: string): ReturnType<RoadmapLanes["checkLabel"]> {
  const n = /\d/.test(label);
  return {
    cleaned: label,
    flags: n ? ["NUMBER"] : [],
    struck: n ? digitSpans(label) : [],
    drop: /https?:/.test(label) ? "CONTAINED_LINK" : null,
    reasons: n ? { NUMBER: `has the number "${(label.match(/\d+/) ?? [""])[0]}", which you didn't write` } : {},
  };
}

/**
 * R3's withLabelChecks over the fixture checker, as its contract reads: a
 * Gemini title not EDITED gets titleFlags (with titleStruck and titleReasons
 * when flagged), any other title titleFlags []; a flagged Gemini item not
 * EDITED gets its struck NUMBER spans and a reason per stored flag. The real
 * one runs under "with the real lanes" below.
 */
function fixtureLabelChecks<T extends MilestoneDraft>(milestones: readonly T[]): (T & LabelChecked)[] {
  return milestones.map((m) => {
    let title: Pick<MilestoneDraft, "titleFlags" | "titleStruck" | "titleReasons"> = { titleFlags: [] };
    if (m.titleOrigin === "GEMINI" && m.titleDecision !== "EDITED" && m.title.trim()) {
      const c = fixtureCheckLabel(m.title);
      if (!c.drop) title = { titleFlags: [...c.flags], ...(c.flags.includes("NUMBER") && c.struck.length ? { titleStruck: c.struck } : {}), ...(c.flags.length ? { titleReasons: c.reasons } : {}) };
    }
    const items = m.items.map((it): ItemDraft => {
      if (it.origin !== "GEMINI" || it.decision === "EDITED" || it.flags.length === 0) return it;
      const c = fixtureCheckLabel(it.label);
      const struck = it.flags.includes("NUMBER") && c.flags.includes("NUMBER") ? c.struck : [];
      return { ...it, ...(struck.length ? { struck } : {}), reasons: Object.fromEntries(it.flags.map((f) => [f, c.reasons?.[f] ?? `fixture: ${f}`])) };
    });
    return { ...m, ...title, items } as T & LabelChecked;
  });
}

// ═══ Fixture lanes (R1, R2, R3, R6 stand-ins: deterministic, tiny) ══════════

function windowsOf(today: DayKey, target: DayKey, count?: number) {
  const span = Math.round((Date.parse(target) - Date.parse(today)) / 86_400_000);
  if (span < 35 || span > 1080) return null;
  const n = count ?? milestoneCountFor(span);
  return Array.from({ length: n }, (_, i) => ({ start: addDays(today, Math.round((i * span) / n)), end: i === n - 1 ? target : addDays(today, Math.round(((i + 1) * span) / n) - 1) }));
}

interface FixtureReplyMilestone {
  title: string;
  domains?: string[];
  newDomains?: string[];
  practices?: { name: string; method: string }[];
  steps?: { title: string }[];
  checkpoint?: { label: string; kind: string } | null;
}

function item(kind: ItemDraft["kind"], ord: number, label: string, extra: Partial<ItemDraft> = {}): ItemDraft {
  const flagged = label.startsWith("!");
  const text = flagged ? label.slice(1) : label;
  return {
    id: null,
    lineageId: `lin-${kind}-${ord}-${text.replace(/\W+/g, "").slice(0, 12)}`,
    kind,
    ord,
    label: text,
    rawLabel: text,
    origin: "GEMINI",
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
    flags: /\d/.test(text) ? ["NUMBER"] : flagged ? ["PROPER_NOUN"] : [],
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

function milestonesFromReply(parsed: unknown, windows: readonly { start: DayKey; end: DayKey }[], trackArea: boolean): MilestoneDraft[] {
  const ms = ((parsed as { milestones?: FixtureReplyMilestone[] })?.milestones ?? []).slice(0, windows.length);
  return ms.map((m, i) => {
    const items: ItemDraft[] = [];
    let ord = 1;
    for (const d of m.domains ?? []) items.push(item("DOMAIN", ord++, `Domain ${d}`, { domainId: d, lineageId: `lin-dom-${i}-${d}` }));
    for (const n of m.newDomains ?? []) items.push(item("DOMAIN", ord++, n, { proposedName: n.replace(/^!/, ""), lineageId: `lin-new-${i}-${n.replace(/\W+/g, "")}` }));
    for (const p of m.practices ?? []) items.push(item("PRACTICE", ord++, p.name, { method: "DELIBERATE_PRACTICE", lineageId: `lin-p-${i}-${p.name.replace(/\W+/g, "")}` }));
    for (const s of m.steps ?? []) items.push(item("STEP", ord++, s.title, { lineageId: `lin-s-${i}-${s.title.replace(/\W+/g, "")}` }));
    if (m.checkpoint) items.push(item("CHECKPOINT", ord++, m.checkpoint.label, { checkpointKind: "MOCK_TEST", lineageId: `lin-c-${i}` }));
    const measures: MeasureSpec[] = [];
    const domains = (m.domains ?? []).slice().sort();
    if (!trackArea && domains.length) measures.push(measure("CARDS_AT_LEVEL", { scope: { domainIds: domains }, unit: "card" }));
    const pl = items.filter((x) => x.kind === "PRACTICE").map((x) => x.lineageId);
    if (pl.length) measures.push(measure("PRACTICE_KEPT", { scope: { itemLineageIds: pl }, unit: "session" }));
    const cp = items.find((x) => x.kind === "CHECKPOINT");
    if (cp) measures.push(measure("CHECKPOINT", { scope: { itemLineageIds: [cp.lineageId] }, itemLineageId: cp.lineageId, unit: "log" }));
    return {
      id: null,
      lineageId: `lin-m-${i}-${m.title.replace(/\W+/g, "").slice(0, 16)}`,
      version: 0,
      ord: i + 1,
      title: m.title,
      titleOrigin: "GEMINI",
      titleDecision: "PENDING",
      windowStart: windows[i].start,
      dueDay: windows[i].end,
      status: "DRAFT",
      rankIndex: null,
      overAccepted: false,
      items,
      measures,
      notes: [],
    };
  });
}

const cardsAt = (input: Parameters<RoadmapLanes["fitPlan"]>[1], ids: readonly string[], level: number) =>
  input.scopes.filter((s) => s.key === [...ids].sort().join(",")).reduce((n, s) => n + s.cards.filter((c) => c.level >= level).length, 0);

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

function lanesFor(w: FakeWorld): Partial<RoadmapLanes> {
  return {
    splitWindows: (today, target, count) => windowsOf(today, target, count),
    buildEvidencePack: (input) => {
      const chosen = [...input.intake.domainIds].sort();
      return {
        promptVersion: 2,
        lines: [input.intake.aim, ...input.domains.map((d) => `${d.name} · ${Math.floor(d.cards / 5) * 5}`)],
        sections: ["area", "aim", "domains", "plan"],
        domains: [],
        syllabusKeys: [],
        milestoneCount: input.windows.length,
        weeksPerMilestone: input.windows.map(() => 10),
        practicesAllowed: input.intake.practicesAllowed,
        trackArea: input.intake.fieldId == null,
        methods: [],
        keymap: { domains: {}, syllabus: {} },
        domainIdsHash: chosen.join(","),
      } satisfies EvidencePack;
    },
    inputHashMaterial: (pack, intake, modelId, samples) => json([pack.promptVersion, modelId, samples, intake.aim, pack.lines, pack.domainIdsHash]),
    validateSample: (parsed, ctx): ValidatedDraft => ({
      milestones: milestonesFromReply(parsed, ctx.windows, ctx.intake.fieldId == null),
      report: { dropped: [], flagged: [], notes: [] },
      bulkKeepOff: false,
      credential: false,
      nonEnglish: false,
      uncoveredSyllabus: [],
      alarm: false,
    }),
    checkLabel: fixtureCheckLabel,
    withLabelChecks: fixtureLabelChecks,
    isNonEnglish: () => false,
    bulkKeepAllowed: (i) => !/[A-Z]{2,6}/.test(i.aim) && !i.examLabel,
    fitPlan: (plan, input) =>
      plan.map((m) => ({
        ...m,
        measures: m.measures.map((x) => {
          if (x.kind !== "CARDS_AT_LEVEL" || x.targetSource === "YOURS") return x;
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
    starterLadder: (intake, input, names, makeId) => {
      const windows = windowsOf(input.today, intake.targetDay) ?? [];
      const ids = [...intake.domainIds].sort();
      return windows.map((win, i) => {
        const items: ItemDraft[] = ids.map((d, k) => ({ ...item("DOMAIN", k + 1, String(names[d] ?? d)), origin: "USER", decision: "KEPT", domainId: d, flags: [], lineageId: makeId() }));
        if (intake.fieldId == null) items.push({ ...item("PRACTICE", 9, `Practice for ${intake.aim}`), origin: CODE_ORIGIN, flags: [], notes: ["PLACEHOLDER"], lineageId: makeId() });
        else if (intake.practicesAllowed) items.push({ ...item("PRACTICE", 9, `Study ${ids.map((d) => names[d]).join(", ")}`), origin: CODE_ORIGIN, flags: [], method: "READING", lineageId: makeId() });
        const measures: MeasureSpec[] = [];
        if (ids.length) measures.push(measure("CARDS_AT_LEVEL", { scope: { domainIds: ids }, minLevel: 6, target: cardsAt(input, ids, 6) + 5 + i, unit: "card" }));
        const pl = items.filter((x) => x.kind === "PRACTICE").map((x) => x.lineageId);
        if (pl.length) measures.push(measure("PRACTICE_KEPT", { scope: { itemLineageIds: pl } }));
        return {
          id: null,
          lineageId: makeId(),
          version: 0,
          ord: i + 1,
          title: `${ids.map((d) => names[d]).join(", ") || intake.aim} to level 6+`,
          titleOrigin: CODE_ORIGIN,
          titleDecision: "PENDING",
          windowStart: win.start,
          dueDay: win.end,
          status: "DRAFT",
          rankIndex: null,
          overAccepted: false,
          items: items.map((x) => (x.kind === "PRACTICE" ? { ...x, sessionsPerWeek: 3, durationBand: "D30", rule: "TARGET:3/W", planSource: "WORKED_OUT" } : x)),
          measures,
          notes: [],
        } satisfies MilestoneDraft;
      });
    },
    manualLadder: (intake, input, makeId) =>
      (windowsOf(input.today, intake.targetDay) ?? []).map((win, i) => ({
        id: null,
        lineageId: makeId(),
        version: 0,
        ord: i + 1,
        title: `Milestone ${i + 1}`,
        titleOrigin: "USER",
        titleDecision: "EDITED",
        windowStart: win.start,
        dueDay: win.end,
        status: "DRAFT",
        rankIndex: null,
        overAccepted: false,
        items: [],
        measures: [],
        notes: ["NOT_MEASURABLE"],
      })),
    refit: (plan) => plan.map((m) => ({ ...m })),
    refitForStart: (milestone, plan, input) => {
      const card = milestone.measures.find((x) => x.kind === "CARDS_AT_LEVEL");
      const delayed = /\[delayed\]/.test(milestone.title) && card && card.minLevel != null;
      return {
        milestone,
        feasibility: feasibilityFixture([milestone], input.today).milestones[0],
        todayCheck: delayed
          ? { measureKey: cardsAtLevelKey(card.scope.domainIds ?? [], card.minLevel as number), stored: card.target, fittedNow: card.target - 2, reason: "no new cards yet in these Domains" }
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
    applySizing: async (id) => {
      w.sized.push(id);
    },
    callModel: async () => ({ milestones: [] }),
    goalsLive: true,
    geminiLive: true,
    ...extra,
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

/** A DRAFT roadmap with REPLY drafted (through the real claim and the background half). */
async function drafted(w: FakeWorld, reply: unknown = REPLY, intake: Intake = INTAKE): Promise<string> {
  const id = await newDraft(w, intake);
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
const measuresOf = (w: FakeWorld, milestoneId: string) => w.t.roadmapMeasure.filter((x) => x.milestoneId === milestoneId);

/** Decides every item of the next milestone the way a user who checks everything would. */
async function decideAll(w: FakeWorld, roadmapId: string, milestoneId: string) {
  const deps = depsFor(w);
  const m = w.t.roadmapMilestone.find((x) => x.id === milestoneId) as MilestoneRec;
  if (m.titleDecision === "PENDING") await S.decideItemCore(USER, m.id, "CHECKED", NOW, deps);
  for (const i of itemsOf(w, milestoneId)) {
    if (i.kind === "CHECKPOINT") await S.editItemCore(USER, i.id, { outOf: 100, bar: 70 }, NOW, deps);
    if (i.decision === "PENDING") await S.decideItemCore(USER, i.id, i.flags.includes("NUMBER") ? "REMOVED" : "CHECKED", NOW, deps);
  }
  void roadmapId;
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

const START_ALL: Parameters<typeof S.startMilestoneCore>[2] = { target: "STORED", overAccepted: false, practicesOff: [], rules: {}, decisions: {}, edits: {} };

async function main() {
  installNoDatabase();
  S = await import("../src/lib/roadmap-server");
  ({ upsertDecision } = await import("../src/lib/roadmap-readings"));
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
    const again = await S.saveIntakeCore(USER, { ...INTAKE, aim: "Edited aim" }, NOW, depsFor(w));
    check("a second intake edits the open DRAFT", again.ok && w.t.roadmap.length === 1 && w.t.roadmap[0].aim === "Edited aim");
    w.t.roadmap[0].status = "ACTIVE";
    const refused = await S.saveIntakeCore(USER, INTAKE, NOW, depsFor(w));
    eq("an intake while another roadmap is ACTIVE is refused", refused.ok ? "ok" : refused.error, S.ANOTHER_ACTIVE);
  }
  {
    const w = world();
    const id = await newDraft(w);
    const d = await S.discardDraftCore(USER, id, NOW, depsFor(w));
    check("discarding a draft archives it as discarded", d.ok && w.t.roadmap[0].status === "ARCHIVED");
    const fresh = await S.saveIntakeCore(USER, INTAKE, NOW, depsFor(w));
    check("…so a fresh intake inserts a new DRAFT", fresh.ok && fresh.value.roadmapId !== id && w.t.roadmap.length === 2);
    const undo = await S.undoDiscardCore(USER, id, NOW, depsFor(w));
    check("the discard's Undo refuses while another roadmap is open", !undo.ok);
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

    const w3 = world();
    const id3 = await newDraft(w3);
    const built = await S.buildStarterCore(USER, id3, NOW, depsFor(w3));
    check("at the cap, 'Build from my numbers' writes an INHOUSE run, outside the cap, with an acceptable plan", built.ok && w3.t.roadmapRun[0].kind === "INHOUSE" && w3.t.roadmapRun[0].status === "OK");
    const acc3 = await S.acceptCore(USER, id3, { overAccepted: false }, NOW, depsFor(w3));
    check("…accepted", acc3.ok, json(acc3));
    const w4 = world();
    const id4 = await newDraft(w4);
    const manual = await S.startManualCore(USER, id4, NOW, depsFor(w4));
    check("'Write it myself' writes a MANUAL run with an empty ladder", manual.ok && w4.t.roadmapRun[0].kind === "MANUAL" && rowsOf(w4, id4, 1).every((m) => itemsOf(w4, m.id).length === 0));
    const blocked = await S.acceptCore(USER, id4, { overAccepted: false }, NOW, depsFor(w4));
    check("…which cannot be accepted until it measures something", !blocked.ok && /No measurable part/.test(blocked.ok ? "" : blocked.error));
    const first = rowsOf(w4, id4, 1)[0];
    const added = await S.addItemCore(USER, first.id, { kind: "DOMAIN", domainId: "d-prob" }, NOW, depsFor(w4));
    check("adding a Domain by hand gives the milestone a card measure", added.ok && measuresOf(w4, first.id).some((x) => x.kind === "CARDS_AT_LEVEL" && x.role === "PAYS"));
    const acc4 = await S.acceptCore(USER, id4, { overAccepted: false }, NOW, depsFor(w4));
    check("…and then it is accepted", acc4.ok, json(acc4));
  }
  check("S.claimPlanOf: the guard and the cap read in order (RUNNING before CAPPED)", (() => {
    const run = (status: string, ageMs: number): RunRec => ({ id: status + ageMs, roadmapId: "r", userId: USER, day: TODAY, version: 1, kind: "GEMINI", status, model: null, modelVersion: null, promptVersion: null, seedBase: null, inputHash: null, pack: null, samples: null, report: null, usage: null, responseIds: [], finishReasons: [], latencyMs: null, error: null, startedAt: at(-ageMs), finishedAt: null });
    const runs = [run("RUNNING", 10_000), ...[1, 2, 3, 4].map((i) => run("FAILED", i * 1000))];
    return S.claimPlanOf("r", runs, runs, NOW).kind === "RUNNING" && S.claimPlanOf("r", [], runs, NOW).kind === "CAPPED";
  })());

  // ═══ F9: review and accept ════════════════════════════════════════════════
  console.log("— review and accept —");
  {
    const w = world();
    const id = await drafted(w, {
      milestones: [
        { title: "One", domains: ["d-prob"], newDomains: ["!Bayes Theory"], practices: [{ name: "Do 50 problems", method: "X" }, { name: "Timed problems", method: "X" }], steps: [{ title: "Draft a sheet" }] },
        { title: "Two [impossible]", domains: ["d-inf"] },
      ],
    });
    const [m1, m2] = rowsOf(w, id, 1);
    const deps = depsFor(w);
    const pend = await S.acceptCore(USER, id, { overAccepted: false }, NOW, deps);
    check("accept refuses a PENDING item in the next milestone", !pend.ok && /Decide/.test(pend.ok ? "" : pend.error), json(pend));
    const num = itemsOf(w, m1.id).find((i) => i.flags.includes("NUMBER")) as ItemRec;
    const keepNum = await S.decideItemCore(USER, num.id, "KEPT", NOW, deps);
    check("a NUMBER item cannot be kept", !keepNum.ok);
    const checkNum = await S.decideItemCore(USER, num.id, "CHECKED", NOW, deps);
    check("…nor checked", !checkNum.ok);
    const kept = await S.keepUnflaggedCore(USER, m1.id, NOW, deps);
    check("bulk keep keeps the unflagged items only", kept.ok && kept.value.kept >= 3, json(kept));
    check("…as KEPT (KEPT_SUGGESTION), never CHECKED", itemsOf(w, m1.id).filter((i) => i.decision === "KEPT").length >= 3 && !itemsOf(w, m1.id).some((i) => i.decision === "CHECKED"));
    check("…skipping every flagged item", itemsOf(w, m1.id).filter((i) => i.flags.length > 0).every((i) => i.decision === "PENDING"));
    check("…and an unresolved proposed Domain", itemsOf(w, m1.id).filter((i) => i.kind === "DOMAIN" && !i.domainId).every((i) => i.decision === "PENDING"));
    const later = await S.keepUnflaggedCore(USER, m2.id, NOW, deps);
    check("bulk keep is offered for the next milestone only", !later.ok);
    await S.decideItemCore(USER, num.id, "REMOVED", NOW, deps);
    const proposed = itemsOf(w, m1.id).find((i) => i.kind === "DOMAIN" && !i.domainId) as ItemRec;
    const unresolved = await S.acceptCore(USER, id, { overAccepted: false }, NOW, deps);
    check("accept refuses an unresolved proposed Domain", !unresolved.ok && /proposed Domain/.test(unresolved.ok ? "" : unresolved.error), json(unresolved));
    const createAsIs = await S.resolveDomainCore(USER, proposed.id, { kind: "CREATE", name: "Bayes Theory", fieldId: "f-stats" }, NOW, deps);
    check("[Create] stays off for a flagged name until it is edited", !createAsIs.ok && w.domainsCreated.length === 0, json(createAsIs));
    const created = await S.resolveDomainCore(USER, proposed.id, { kind: "CREATE", name: "Bayesian inference", fieldId: "f-stats" }, NOW, deps);
    const after = itemsOf(w, m1.id).find((i) => i.id === proposed.id);
    check("[Create] with an edited name creates the Domain and records EDITED", created.ok && w.domainsCreated.length === 1 && after?.decision === "EDITED" && !!after.domainId, json(after));
    check("…and the card measure's scope gains it", measuresOf(w, m1.id).some((x) => x.kind === "CARDS_AT_LEVEL" && (x.scope as { domainIds: string[] }).domainIds.includes(after?.domainId ?? "")));
    const outline = itemsOf(w, m2.id).some((i) => i.decision === "PENDING");
    const impossible = await S.acceptCore(USER, id, { overAccepted: false }, NOW, deps);
    check("an IMPOSSIBLE outline milestone blocks acceptance", !impossible.ok && /can't be done/.test(impossible.ok ? "" : impossible.error), json(impossible));
    w.t.roadmapMilestone.find((m) => m.id === m2.id)!.title = "Two";
    const okAccept = await S.acceptCore(USER, id, { overAccepted: false }, NOW, deps);
    check("outline PENDING items don't block acceptance", outline && okAccept.ok, json(okAccept));
    const r = w.t.roadmap.find((x) => x.id === id) as RoadmapRec;
    check("accept: the roadmap is ACTIVE at version 1 with firstAcceptedDay today", r.status === "ACTIVE" && r.version === 1 && r.firstAcceptedDay === TODAY);
    eq("accept: DRAFT → PLANNED, ords 1..n, rank indices 1..n", rowsOf(w, id, 1).map((m) => [m.status, m.ord, m.rankIndex]), [
      ["PLANNED", 1, 1],
      ["PLANNED", 2, 2],
    ]);
    const cardM = measuresOf(w, m1.id).find((x) => x.kind === "CARDS_AT_LEVEL") as MeasureRec;
    check("accept: card baselines are the live value today, fittedTarget = target, a measureKey", cardM.baselineDay === TODAY && cardM.fittedTarget === cardM.target && !!cardM.measureKey && cardM.baseline === 12, json(cardM));
    check("accept: one RoadmapAcceptance row with the end state", w.t.roadmapAcceptance.length === 1 && Array.isArray(w.t.roadmapAcceptance[0].endState));
    check("accept: first readings for today, PROFICIENCY included", w.t.readings.some((x) => x.measureKey === cardM.measureKey && x.day === TODAY) && w.t.readings.some((x) => x.measureKey.startsWith("PROFICIENCY|")));
    const again = await S.acceptCore(USER, id, { overAccepted: false }, NOW, deps);
    check("a second accept is refused (nothing left to accept)", !again.ok);
  }
  {
    const w = world();
    const id = await drafted(w, { milestones: [{ title: "Push it [over]", domains: ["d-prob"] }, { title: "Two", domains: ["d-inf"] }] });
    const m1 = rowsOf(w, id, 1)[0];
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
    const refused = await S.acceptCore(USER, id2, { overAccepted: false }, NOW, depsFor(w2));
    eq("accept refuses while another roadmap is ACTIVE", refused.ok ? "ok" : refused.error, S.ANOTHER_ACTIVE);
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
    check("…keeping the unstarted position's lineage", v2.lineageId === rowsOf(w, id, 1)[1].lineageId);
    const blockedReplan = await S.acceptCore(USER, id, { overAccepted: false }, at(15_000), depsFor(w));
    check("the re-plan's next milestone (an old outline) must be decided before it is accepted", !blockedReplan.ok, json(blockedReplan));
    await decideAll(w, id, v2.id);
    const acc2 = await S.acceptCore(USER, id, { overAccepted: false }, at(20_000), depsFor(w));
    check("the re-plan is accepted at version 2", acc2.ok && w.t.roadmap[0].version === 2, json(acc2));
    eq("…the previous PLANNED row → SUPERSEDED", rowsOf(w, id, 1)[1].status, "SUPERSEDED");
    eq("…new ords follow the carried row", rowsOf(w, id, 2)[0].ord, 2);
    check("…its rankIndex is its place, never above its lineage's first", rowsOf(w, id, 2)[0].rankIndex === 2 && rowsOf(w, id, 1)[0].rankIndex === 1);
    check("…the carried STARTED row keeps its rankIndex", rowsOf(w, id, 1)[0].rankIndex === 1);
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
    // [Create] under Gemini's own, unflagged name records CHECKED; topics filed under it follow it.
    const w = world();
    const id = await drafted(w, { milestones: [{ title: "One", domains: ["d-prob"], newDomains: ["Bayesian thinking"] }, { title: "Two", domains: ["d-inf"] }] });
    const m1 = rowsOf(w, id, 1)[0];
    const proposed = itemsOf(w, m1.id).find((i) => i.kind === "DOMAIN" && !i.domainId) as ItemRec;
    const res = await S.resolveDomainCore(USER, proposed.id, { kind: "CREATE", name: "Bayesian thinking", fieldId: "f-stats" }, NOW, depsFor(w));
    check("[Create] under the proposed name, unflagged, records CHECKED", res.ok && itemsOf(w, m1.id).find((i) => i.id === proposed.id)?.decision === "CHECKED", json(res));
    const mapped = await S.resolveDomainCore(USER, proposed.id, { kind: "MAP", domainId: "d-inf" }, NOW, depsFor(w));
    check("[Map to…] records EDITED and moves the scope", mapped.ok && itemsOf(w, m1.id).find((i) => i.id === proposed.id)?.decision === "EDITED");
    const ghost = await S.resolveDomainCore(USER, proposed.id, { kind: "MAP", domainId: "d-ghost" }, NOW, depsFor(w));
    check("[Map to…] a Domain that isn't the user's is refused", !ghost.ok);
  }
  {
    // Two taps on different items of one milestone (two devices) both land: each decision is its own row's write.
    const w = world();
    const id = await drafted(w);
    const m1 = rowsOf(w, id, 1)[0];
    const [a, b] = itemsOf(w, m1.id).filter((i) => i.decision === "PENDING" && i.flags.length === 0);
    await Promise.all([S.decideItemCore(USER, a.id, "CHECKED", NOW, depsFor(w)), S.decideItemCore(USER, b.id, "KEPT", NOW, depsFor(w))]);
    eq("two concurrent decisions on one milestone both stand", [itemsOf(w, m1.id).find((i) => i.id === a.id)?.decision, itemsOf(w, m1.id).find((i) => i.id === b.id)?.decision], ["CHECKED", "KEPT"]);
    const kept = await S.keepUnflaggedCore(USER, m1.id, NOW, depsFor(w));
    check("bulk keep never turns a CHECKED item back into KEPT", kept.ok && itemsOf(w, m1.id).find((i) => i.id === a.id)?.decision === "CHECKED");
  }
  {
    // The remedies: one tap each, re-run by the engine.
    const w = world();
    const id = await drafted(w);
    const later = await S.applyRemedyCore(USER, id, "MOVE_TO_LATER", NOW, depsFor(w));
    const rows = rowsOf(w, id, 1);
    check("'Move to Later' keeps the trailing milestone as a LATER row with no dates", later.ok && rows[rows.length - 1].status === "LATER" && rows[rows.length - 1].dueDay == null, json(rows.map((r) => r.status)));
    const light = await S.applyRemedyCore(USER, id, "REFIT_LIGHT", NOW, depsFor(w));
    check("'Re-fit at Light' stores the intensity LIGHT", light.ok && w.t.roadmap[0].intensity === "LIGHT");
    const bad = await S.applyRemedyCore(USER, id, "NOPE" as never, NOW, depsFor(w));
    check("an unknown remedy is refused", !bad.ok);
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
    check("an outline milestone's sheet lists its pending items and blocks Start", !!outline && !outline.canStart && outline.pending.length > 0);
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
    check("sizing ran through the injected applySizing only", w.sized.length === 0);
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
    // Sizing is deferred and injected.
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    const tasks: (() => Promise<void> | void)[] = [];
    await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w, { defer: (t) => tasks.push(t) }));
    for (const t of tasks) await t();
    check("Start's sizing runs in the deferred task through the injected applySizing (never Gemini)", w.sized.length === 2, json(w.sized));
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
      const { w, m1 } = await mk({ milestones: [{ title: "Hard [impossible-now]", domains: ["d-prob"], practices: [{ name: "Timed problems", method: "X" }] }, { title: "Two", domains: ["d-inf"] }] });
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
      const { w, m1 } = await mk(REPLY);
      const practice = itemsOf(w, m1.id).find((i) => i.kind === "PRACTICE") as ItemRec;
      practice.decision = "KEPT";
      const r = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
      check("a KEPT_SUGGESTION Today-bound row refuses Start", !r.ok && /Gemini's words/.test(r.ok ? "" : r.error), json(r));
      const sheet = await S.startMilestoneCore(USER, m1.id, { ...START_ALL, decisions: { [practice.id]: "CHECKED" } }, NOW, depsFor(w));
      check("…checking it on the sheet lets Start through", sheet.ok, json(sheet));
    }
    {
      const { w, m1 } = await mk(REPLY);
      const dom = itemsOf(w, m1.id).find((i) => i.kind === "DOMAIN") as ItemRec;
      dom.decision = "KEPT";
      const r = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
      check("a KEPT_SUGGESTION Domain item refuses Start", !r.ok && /Gemini picked the Domain/.test(r.ok ? "" : r.error), json(r));
    }
    {
      const { w, m1 } = await mk(REPLY);
      const cp = itemsOf(w, m1.id).find((i) => i.kind === "CHECKPOINT") as ItemRec;
      cp.decision = "KEPT";
      const r = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
      check("a kept but unchecked checkpoint label refuses Start", !r.ok && /Gemini's words/.test(r.ok ? "" : r.error), json(r));
    }
    {
      const { w, m1 } = await mk(REPLY);
      w.t.roadmapMilestone.find((m) => m.id === m1.id)!.titleDecision = "KEPT";
      const r = await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
      check("a kept but unchecked title refuses Start", !r.ok && /Gemini's words/.test(r.ok ? "" : r.error), json(r));
      const r2 = await S.startMilestoneCore(USER, m1.id, { ...START_ALL, edits: { [m1.id]: { label: "My own title" } } }, NOW, depsFor(w));
      check("…editing it on the sheet (the milestone's id) lets Start through with the user's words", r2.ok && w.templates.some((t) => t.kind === "GOAL" && t.title === "My own title"), json(r2));
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
      eq("every practice off on a practice-only milestone refuses", off.ok ? "ok" : off.error, S.NOTHING_MEASURES);
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
      const [p1, p2] = itemsOf(w, m1.id).filter((i) => i.kind === "PRACTICE");
      const r = await S.startMilestoneCore(USER, m1.id, { ...START_ALL, practicesOff: [p2.lineageId] }, NOW, depsFor(w));
      check("a switched-off practice is not added to Today", r.ok && w.templates.filter((t) => t.kind === "HABIT").length === 1, json(r));
      const pk = measuresOf(w, m1.id).find((x) => x.kind === "PRACTICE_KEPT") as MeasureRec;
      eq("…its lineage leaves the PRACTICE_KEPT scope", (pk.scope as { itemLineageIds: string[] }).itemLineageIds, [p1.lineageId]);
      check("…and its item is kept with addToToday false", itemsOf(w, m1.id).find((i) => i.id === p2.id)?.addToToday === false);
      const prof = w.t.readings.filter((x) => x.measureKey.startsWith("PROFICIENCY|")).pop();
      check("…the PROFICIENCY reading says the basis changed (rebased SWITCHED_OFF)", (prof?.detail as { rebased?: { cause?: string } })?.rebased?.cause === "SWITCHED_OFF", json(prof?.detail));
    }
    {
      // The delayed-start offer: [Use 14].
      const { w, m1 } = await mk({ milestones: [{ title: "Late [delayed]", domains: ["d-prob"], practices: [{ name: "Timed problems", method: "X" }] }, { title: "Two", domains: ["d-inf"] }] });
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
          { title: "One", domains: ["d-prob"], practices: [{ name: "Backtest", method: "X" }] },
          { title: "Two", domains: ["d-inf"], practices: [{ name: "Backtest", method: "X" }] },
        ],
      });
      await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
      const goal = w.templates.find((t) => t.kind === "GOAL")!;
      goal.closedScore = 0.8;
      const m2 = rowsOf(w, id, 1)[1];
      await decideAll(w, id, m2.id);
      const pv = await S.startPreview(USER, m2.id, NOW, depsFor(w));
      const row = pv?.practices.find((p) => p.name === "Backtest");
      check("'Backtest is already on Today (from Milestone 1)': its switch starts off", row?.on === false && row.alreadyOnToday?.fromOrd === 1, json(row));
    }
  }

  // ═══ Measures and lifecycle ═══════════════════════════════════════════════
  console.log("— checkpoint, re-plan, archive, done —");
  {
    const w = world();
    const id = await accepted(w);
    const cp = itemsOf(w, rowsOf(w, id, 1)[0].id).find((i) => i.kind === "CHECKPOINT") as ItemRec;
    const a = await S.logCheckpointCore(USER, cp.lineageId, { score: 68, nonce: "nonce-1" }, NOW, depsFor(w));
    const b = await S.logCheckpointCore(USER, cp.lineageId, { score: 68, nonce: "nonce-1" }, NOW, depsFor(w));
    check("a checkpoint log writes once per nonce (append-only, SELF)", a.ok && b.ok && w.t.readings.filter((r) => r.source === "SELF").length === 1);
    const c = await S.logCheckpointCore(USER, cp.lineageId, { score: 101, nonce: "nonce-2" }, NOW, depsFor(w));
    check("a score above the scale is refused", !c.ok);
    check("checkpoint logs never touch computed rows", w.t.readings.filter((r) => r.source === "SELF").every((r) => r.measureKey.startsWith("SELF|CHECKPOINT|")));
  }
  {
    // The end-state anchor across a re-plan that lowers a target, and the marker.
    const w = world();
    const id = await accepted(w);
    const first = w.t.roadmapAcceptance[0];
    const firstEnd = first.endState as { measureKey: string; target: number; baseline: number }[];
    w.tree[0].domains[1].cards.push(card("d-inf", 6), card("d-inf", 6)); // live counts move after the first acceptance
    const rp = await S.replanCore(USER, id, "MANUAL", at(60_000), depsFor(w));
    check("a hand re-plan copies the unstarted positions as DRAFT rows", rp.ok && rowsOf(w, id, 2).length === 2, json(rp));
    const v2two = rowsOf(w, id, 2)[1];
    const target = firstEnd.find((t) => t.measureKey.includes("d-inf"))!.target;
    w.t.roadmapMeasure.filter((x) => x.milestoneId === v2two.id && x.kind === "CARDS_AT_LEVEL").forEach((x) => {
      x.target = target - 1;
      x.targetSource = "YOURS";
    });
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, at(70_000), depsFor(w));
    check("fixture: the re-plan is accepted", acc.ok, json(acc));
    const second = w.t.roadmapAcceptance[1].endState as { measureKey: string; target: number; baseline: number }[];
    const inf1 = firstEnd.find((t) => t.measureKey.includes("d-inf"))!;
    const inf2 = second.find((t) => t.measureKey === inf1.measureKey)!;
    check("lowering an end target keeps the first acceptance's baseline (the anchor)", inf2.baseline === inf1.baseline && inf2.target === inf1.target - 1, json([inf1, inf2]));
    const view = await S.loadRoadmapView(USER, at(80_000), depsFor(w));
    check("…and the roadmap header shows 'Target lowered'", view.header?.targetLowered?.from === inf1.target && view.header.targetLowered.to === inf1.target - 1, json(view.header?.targetLowered));
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
    check("a re-plan keeps the reached milestone's rankIndex, and its reachedDay", rowsOf(w, id, 1)[0].rankIndex === 1 && rowsOf(w, id, 1)[0].reachedDay === TODAY);
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
    const id = await drafted(w);
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
    check("accepted, not started: ACCEPTED with the next milestone's stated pay and rank", acc?.state === "ACCEPTED" && acc.milestone?.start?.stated === 6 && acc.milestone.start.givesRank === "Aspirant", json(acc?.milestone));
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
    eq("the top rank of a 3-milestone plan with a restart is Specialist (positions, not rows)", view.rank?.top.name, "Specialist");
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
    eq("a re-plan after a restart gives each position its true place (1, 2, 3; not 1, 3, 4)", rowsOf(w, id, 2).map((m) => m.rankIndex), [1, 2, 3]);
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
    check("fixture: a plan-only edit keeps the practices' decisions (CHECKED) and makes the plan YOURS", practices.every((p) => p.decision === "CHECKED" && p.planSource === "YOURS" && p.sessionsPerWeek === 1));
    const pv = await S.startPreview(USER, m1.id, NOW, depsFor(w));
    check("the sheet carries its pay basis and each practice's minutes a week", !!pv?.payBasis && pv.practices.every((p) => p.weeklyMinutes === 30), json([pv?.payBasis, pv?.practices.map((p) => p.weeklyMinutes)]));
    eq("…both on: ⬡ 6", pv?.pay.stated, 6);
    check("…each practice priced with planCompletion against today's ledger", !!pv && pv.practices.every((p) => typeof p.price === "number" && Number.isFinite(p.price)), json(pv?.practices.map((p) => p.price)));
    const rows = (pv?.practices ?? []).map((p) => ({ lineageId: p.lineageId, weeklyMinutes: p.weeklyMinutes ?? 0 }));
    const offOne = statedForMilestone(startStatedInputOf(pv!.payBasis!, rows, [practices[1].lineageId]));
    eq("…switching one off on the sheet recomputes to 'pays nothing · practice under an hour a week'", [offOne.stated, offOne.zeroReason], [0, "PRACTICE_UNDER_HOUR"]);
    const st = await S.startMilestoneCore(USER, m1.id, { ...START_ALL, practicesOff: [practices[1].lineageId] }, NOW, depsFor(w));
    check("…and Start with that switch freezes exactly what the sheet showed (0)", st.ok && goalOf(w, m1.id).stated === offOne.stated, json([st, goalOf(w, m1.id)?.stated]));
    const second = await setUp();
    const pv2 = await S.startPreview(USER, second.m1.id, NOW, depsFor(second.w));
    const bothOn = statedForMilestone(startStatedInputOf(pv2!.payBasis!, pv2!.practices.map((p) => ({ lineageId: p.lineageId, weeklyMinutes: p.weeklyMinutes ?? 0 }))));
    const st2 = await S.startMilestoneCore(USER, second.m1.id, START_ALL, NOW, depsFor(second.w));
    check("…both on, Start freezes the sheet's ⬡ 6", st2.ok && bothOn.stated === 6 && goalOf(second.w, second.m1.id).stated === 6, json([st2, bothOn]));
  }

  console.log("— fix round: titles, flags, struck spans —");
  {
    const w = world();
    const id = await drafted(w, { milestones: [{ title: "Do 50 problems first", domains: ["d-prob"], practices: [{ name: "Do 20 drills", method: "X" }] }, { title: "Two", domains: ["d-inf"] }] });
    const [m1] = rowsOf(w, id, 1);
    const keep = await S.decideItemCore(USER, m1.id, "KEPT", NOW, depsFor(w));
    eq("a NUMBER title can't be kept", keep.ok ? "ok" : keep.error, S.TITLE_NUMBER);
    const checked = await S.decideItemCore(USER, m1.id, "CHECKED", NOW, depsFor(w));
    eq("…nor checked", checked.ok ? "ok" : checked.error, S.TITLE_NUMBER);
    const bulk = await S.keepUnflaggedCore(USER, m1.id, NOW, depsFor(w));
    check("bulk keep skips the flagged title", bulk.ok && w.t.roadmapMilestone.find((m) => m.id === m1.id)?.titleDecision === "PENDING", json(bulk));
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    const d1 = view.draft?.milestones[0];
    check("the draft's title carries its flags, struck spans and reason (derived on read)", !!d1 && (d1.titleFlags ?? []).includes("NUMBER") && json(d1.titleStruck) === json([[3, 5]]) && /"50"/.test(d1.titleReasons?.NUMBER ?? ""), json([d1?.titleFlags, d1?.titleStruck, d1?.titleReasons]));
    const drills = d1?.items.find((i) => i.kind === "PRACTICE");
    check("…a NUMBER item's struck spans and reason too", json(drills?.struck) === json([[3, 5]]) && /"20"/.test(drills?.reasons?.NUMBER ?? ""), json([drills?.struck, drills?.reasons]));
    check("…unflagged rows carry none", view.draft?.milestones[1].titleFlags?.length === 0 && view.draft.milestones[1].titleStruck == null);
    const edited = await S.editItemCore(USER, m1.id, { label: "Do the problems first" }, NOW, depsFor(w));
    check("Edit is offered: the user's words, EDITED", edited.ok && w.t.roadmapMilestone.find((m) => m.id === m1.id)?.titleDecision === "EDITED", json(edited));
    const after = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("…and the edited title carries no flag", (after.draft?.milestones[0].titleFlags ?? []).length === 0);
  }
  {
    // The Start sheet refuses "I checked this" on a NUMBER title as well.
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    const row = w.t.roadmapMilestone.find((m) => m.id === m1.id) as MilestoneRec;
    row.title = "Do 50 problems";
    row.titleDecision = "KEPT";
    const r = await S.startMilestoneCore(USER, m1.id, { ...START_ALL, decisions: { [m1.id]: "CHECKED" } }, NOW, depsFor(w));
    eq("the Start sheet's 'I checked this' on a NUMBER title is refused", r.ok ? "ok" : r.error, S.TITLE_NUMBER);
    const pv = await S.startPreview(USER, m1.id, NOW, depsFor(w));
    check("…and the sheet's milestone shows why (no flags column needed)", !pv?.canStart && (pv?.todayRows[0].needs ?? "") === "CHECK_OR_EDIT");
    void id;
  }
  {
    // The alarm counts what validation counted: Gemini titles and items.
    const w = world();
    await drafted(w, { milestones: [{ title: "Week 1 basics", domains: ["d-prob"], practices: [{ name: "Do 20 drills", method: "X" }] }, { title: "Week 2 drills", domains: ["d-inf"] }] });
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("3 of 5 Gemini rows flagged (2 titles, 1 item): the alarm is on", view.draft?.alarm === true, json(view.draft?.alarm));
  }

  console.log("— fix round: Edit means the words changed; Type a target —");
  {
    const w = world();
    const id = await drafted(w);
    const [m1] = rowsOf(w, id, 1);
    const before = itemsOf(w, m1.id).map((i) => [i.id, i.decision]);
    const typed = await S.editItemCore(USER, m1.id, { target: 30, minLevel: 8 }, NOW, depsFor(w));
    const card1 = measuresOf(w, m1.id).find((x) => x.kind === "CARDS_AT_LEVEL") as MeasureRec;
    check("'Type a target' on the milestone's id sets its card measure (YOURS)", typed.ok && card1.target === 30 && card1.minLevel === 8 && card1.targetSource === "YOURS", json([typed, card1]));
    eq("…and changes no item's decision, nor the title's", [itemsOf(w, m1.id).map((i) => [i.id, i.decision]), w.t.roadmapMilestone.find((m) => m.id === m1.id)?.titleDecision], [before, "PENDING"]);
    const cp = itemsOf(w, m1.id).find((i) => i.kind === "CHECKPOINT") as ItemRec;
    const bar = await S.editItemCore(USER, cp.id, { outOf: 100, bar: 70 }, NOW, depsFor(w));
    const cpAfter = itemsOf(w, m1.id).find((i) => i.id === cp.id) as ItemRec;
    check("'Set the bar' alone keeps Gemini's checkpoint words PENDING (not 'You wrote this')", bar.ok && cpAfter.decision === "PENDING" && cpAfter.bar === 70, json(cpAfter));
    await S.decideItemCore(USER, m1.id, "CHECKED", NOW, depsFor(w));
    for (const i of itemsOf(w, m1.id)) if (i.kind !== "CHECKPOINT" && i.decision === "PENDING") await S.decideItemCore(USER, i.id, "CHECKED", NOW, depsFor(w));
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
    check("…so the checkpoint still waits for a decision at Accept", !acc.ok && /Decide the checkpoint/.test(acc.ok ? "" : acc.error), json(acc));
    const practice = itemsOf(w, m1.id).find((i) => i.kind === "PRACTICE") as ItemRec;
    const decisionBefore = practice.decision;
    const plan = await S.editItemCore(USER, practice.id, { sessionsPerWeek: 2, method: practice.method as never, durationBand: practice.durationBand as never }, NOW, depsFor(w));
    const pAfter = itemsOf(w, m1.id).find((i) => i.id === practice.id) as ItemRec;
    check("a practice's plan edit keeps its decision and makes the plan YOURS", plan.ok && pAfter.decision === decisionBefore && pAfter.planSource === "YOURS" && pAfter.sessionsPerWeek === 2, json(pAfter));
    const same = await S.editItemCore(USER, cp.id, { label: cpAfter.label }, NOW, depsFor(w));
    check("an Edit sent with the words unchanged changes nothing", same.ok && itemsOf(w, m1.id).find((i) => i.id === cp.id)?.decision === "PENDING");
    const words = await S.editItemCore(USER, cp.id, { label: "My own mock test" }, NOW, depsFor(w));
    const cpWords = itemsOf(w, m1.id).find((i) => i.id === cp.id) as ItemRec;
    check("…new words make it EDITED (YOURS) and clear its flags", words.ok && cpWords.decision === "EDITED" && cpWords.flags.length === 0 && cpWords.label === "My own mock test", json(cpWords));
    const ok2 = await S.acceptCore(USER, id, { overAccepted: false }, NOW, depsFor(w));
    check("…and then the plan is accepted", ok2.ok, json(ok2));
  }
  {
    // On the Start sheet, a bar alone leaves a kept checkpoint in Gemini's words: Start still refuses.
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    const cp = itemsOf(w, m1.id).find((i) => i.kind === "CHECKPOINT") as ItemRec;
    cp.decision = "KEPT";
    const r = await S.startMilestoneCore(USER, m1.id, { ...START_ALL, edits: { [cp.id]: { outOf: 100, bar: 60 } } }, NOW, depsFor(w));
    check("a bar set on the sheet doesn't make Gemini's checkpoint words the user's", !r.ok && /Gemini's words/.test(r.ok ? "" : r.error), json(r));
    void id;
  }
  {
    // [Map to…] moves the topics filed under the old Domain; [Drop] unfiles them.
    const w = world();
    const id = await drafted(w);
    const [m1] = rowsOf(w, id, 1);
    const dom = itemsOf(w, m1.id).find((i) => i.kind === "DOMAIN") as ItemRec;
    const topic: ItemRec = { ...dom, id: "topic-1", lineageId: "lin-topic-1", kind: "TOPIC", ord: 50, label: "Conditional probability", domainId: dom.domainId, decision: "PENDING" };
    w.t.roadmapItem.push(topic);
    const mapped = await S.resolveDomainCore(USER, dom.id, { kind: "MAP", domainId: "d-risk" }, NOW, depsFor(w));
    check("[Map to…] moves the topics filed under the Domain it replaces", mapped.ok && itemsOf(w, m1.id).find((i) => i.lineageId === "lin-topic-1")?.domainId === "d-risk", json(itemsOf(w, m1.id).find((i) => i.lineageId === "lin-topic-1")));
    const domNow = itemsOf(w, m1.id).find((i) => i.kind === "DOMAIN" && i.domainId === "d-risk") as ItemRec;
    const dropped = await S.resolveDomainCore(USER, domNow.id, { kind: "DROP" }, NOW, depsFor(w));
    check("[Drop] unfiles them", dropped.ok && itemsOf(w, m1.id).find((i) => i.lineageId === "lin-topic-1")?.domainId == null, json(itemsOf(w, m1.id).find((i) => i.lineageId === "lin-topic-1")));
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
    check("'Build from my numbers' with 5 chosen Domains says the 5th isn't used ('What was dropped')", built.ok && report?.dropped[0]?.code === "OVER_CAP" && /Calculus/.test(report.dropped[0].reason), json(report));
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("…on the page's run report", view.run?.report?.dropped.some((d) => d.code === "OVER_CAP") === true);
  }

  console.log("— fix round: aftercare, the Aim card, the view's fields —");
  {
    const w = world();
    const id = await accepted(w);
    const [m1] = rowsOf(w, id, 1);
    await S.startMilestoneCore(USER, m1.id, START_ALL, NOW, depsFor(w));
    goalOf(w, m1.id).closedScore = 0.9;
    const list = await S.practiceAftercare(USER, id, depsFor(w));
    check("a closed milestone's practice is offered in aftercare", list.length === 1, json(list));
    const off = await S.keepOnTodayCore(USER, m1.id, list[0]?.templateId ?? "", NOW, { ...depsFor(w), env: WRITES_OFF });
    eq("[Keep on Today] refuses with writes off", off.ok ? "ok" : off.error, ROADMAP_WRITES_OFF);
    const kept = await S.keepOnTodayCore(USER, m1.id, list[0]?.templateId ?? "", NOW, depsFor(w));
    const list2 = await S.practiceAftercare(USER, id, depsFor(w));
    check("[Keep on Today] is remembered: the row stops asking", kept.ok && list2.length === 0, json([kept, list2]));
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
    check("…keeping the rank-up's 'new' marker", card?.rank?.name === "Aspirant" && card.rank.newSince === TODAY, json(card?.rank));
    check("…and the milestone line carries its title's class", card?.milestone?.titleClass === "YOURS" || card?.milestone?.titleClass === "DRAFT", json(card?.milestone?.titleClass));
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
    eq("'A draft is waiting for your check · 5 items': milestone 1's title, Domain, practice, step and checkpoint (not milestone 2's)", card?.draftItems, 5);
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
    check("'Toward the aim' rows carry their words (EndStateTerm.label)", probEnd?.label === "Probability · cards at level 6+", json(probEnd?.label));
    check("…and the weakest class of the Domains in scope: Gemini's undecided outline Domain reads DRAFT, a checked one WORKED_OUT", inf?.basisClass === "DRAFT" && probEnd?.basisClass === "WORKED_OUT", json([inf?.basisClass, probEnd?.basisClass]));
    check("the Milestones list carries each title's class", view.milestones[0].titleClass === "YOURS" && view.milestones[1].titleClass === "DRAFT", json(view.milestones.map((m) => m.titleClass)));
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
    const id = await drafted(w);
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
      fitPlan: (plan, input) => {
        note("fitPlan", plan);
        return fx.fitPlan!(plan, input);
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
    const remedy = await S.applyRemedyCore(USER, id, "REFIT_LIGHT", at(4_000), spy);
    check("fixture: a remedy on the re-plan draft", remedy.ok, json(remedy));
    await decideAll(w, id, next2.id);
    const acc = await S.acceptCore(USER, id, { overAccepted: false }, at(5_000), spy);
    check("fixture: the re-plan is accepted", acc.ok, json(acc));
    await S.startPreview(USER, next2.id, at(6_000), spy);
    const wheres = new Set(seen.map((s) => s.where));
    check("refit, feasibilityOf, fitPlan, applyRemedy and refitForStart were all read", ["refit", "feasibilityOf", "fitPlan", "applyRemedy", "refitForStart"].every((x) => wheres.has(x)), json([...wheres]));
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
    // R3's unverifiedAlarmOf, the one rule: removing the flagged items clears the banner.
    const w = world();
    const id = await drafted(w, { milestones: [{ title: "Week 1 basics", domains: ["d-prob"], practices: [{ name: "Do 20 drills", method: "X" }] }, { title: "Week 2 drills", domains: ["d-inf"] }] });
    const before = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("fixture: 3 of 5 flagged, the alarm is on", before.draft?.alarm === true);
    const drills = itemsOf(w, rowsOf(w, id, 1)[0].id).find((i) => i.kind === "PRACTICE") as ItemRec;
    const removed = await S.decideItemCore(USER, drills.id, "REMOVED", NOW, depsFor(w));
    const row = itemsOf(w, rowsOf(w, id, 1)[0].id).find((i) => i.id === drills.id);
    check("fixture: the flagged practice removed (still a row, its flag kept)", removed.ok && row?.decision === "REMOVED" && row.flags.includes("NUMBER"), json(row));
    const after = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("removing the flagged item turns the alarm off (2 of 4: a REMOVED row no longer counts)", after.draft?.alarm === false, json(after.draft?.alarm));
  }
  {
    // draftNeedsOf: the footer's target in the page's order, the Aim card's count, never a syllabus line or a named placeholder.
    const w = world();
    const id = await drafted(w, REPLY, { ...INTAKE, syllabus: { lines: ["Conditional probability"], source: null } });
    const [m1] = rowsOf(w, id, 1);
    await S.decideItemCore(USER, m1.id, "CHECKED", NOW, depsFor(w));
    const topic = await S.addItemCore(USER, m1.id, { kind: "TOPIC", syllabusRef: 0 }, NOW, depsFor(w));
    check("fixture: the syllabus line is a topic, PENDING as validation writes it (origin SYLLABUS)", topic.ok && itemsOf(w, m1.id).some((i) => i.origin === "SYLLABUS" && i.decision === "PENDING"));
    const recs = itemsOf(w, m1.id);
    const dom = recs.find((i) => i.kind === "DOMAIN") as ItemRec;
    const prac = recs.find((i) => i.kind === "PRACTICE") as ItemRec;
    (recs.find((i) => i.kind === "CHECKPOINT") as ItemRec).ord = -1;
    w.t.roadmapItem.push(
      { ...prac, id: "ph-named", lineageId: "lin-ph-named", ord: 60, label: "My own drills", origin: CODE_ORIGIN, decision: "EDITED", notes: ["PLACEHOLDER"], flags: [] },
      { ...prac, id: "ph-open", lineageId: "lin-ph-open", ord: 61, label: "Practice for the aim", origin: CODE_ORIGIN, decision: "PENDING", notes: ["PLACEHOLDER"], flags: [] }
    );
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    const needs = draftNeedsOf(view.draft!.milestones[0]);
    eq("what milestone 1 still needs, in the page's order (an earlier-ordered checkpoint last)", needs.map((n) => `${n.kind}:${n.need}`), ["DOMAIN:DECIDE", "PRACTICE:DECIDE", "PRACTICE:NAME", "STEP:DECIDE", "CHECKPOINT:DECIDE"]);
    eq("'Next item to decide' is the first of them (the Domain, not the checkpoint ordered before it)", view.draft?.nextToDecide, dom.id);
    check("…never the PENDING syllabus topic nor the named placeholder", !needs.some((n) => n.id === "ph-named" || recs.some((r) => r.id === n.id && r.origin === "SYLLABUS")));
    const card = await S.loadAimCard(USER, NOW, depsFor(w));
    eq("the Aim card's count is the footer's (undecidedRowsOf = draftNeedsOf(milestone 1).length)", card?.draftItems, needs.length);
    eq("…the same count undecidedRowsOf gives", S.undecidedRowsOf(view.draft!.milestones[0]), 5);
  }
  {
    // Bulk keep never keeps an empty Gemini title (it must be named first).
    const w = world();
    const id = await drafted(w);
    const [m1] = rowsOf(w, id, 1);
    (w.t.roadmapMilestone.find((m) => m.id === m1.id) as MilestoneRec).title = "";
    const r = await S.keepUnflaggedCore(USER, m1.id, NOW, depsFor(w));
    check("bulk keep leaves an empty Gemini title PENDING", r.ok && w.t.roadmapMilestone.find((m) => m.id === m1.id)?.titleDecision === "PENDING", json(r));
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
    // AimCardView.acceptedDay; titleStruck on the Milestones list and the Aim card's milestone line.
    const w = world();
    const id = await accepted(w, { milestones: [{ title: "Foundations", domains: ["d-prob"], practices: [{ name: "Timed problems", method: "X" }] }, { title: "Read 3 chapters", domains: ["d-inf"] }] });
    const [m1] = rowsOf(w, id, 1);
    const card = await S.loadAimCard(USER, NOW, depsFor(w));
    eq("the Aim card carries the day the plan was accepted", card?.acceptedDay, TODAY);
    const view = await S.loadRoadmapView(USER, NOW, depsFor(w));
    check("the Milestones list strikes an outline Gemini title's number", json(view.milestones[1].titleStruck) === json([[5, 6]]) && view.milestones[0].titleStruck === undefined, json(view.milestones.map((m) => m.titleStruck)));
    const row = w.t.roadmapMilestone.find((m) => m.id === m1.id) as MilestoneRec;
    row.title = "Do 50 problems";
    row.titleDecision = "KEPT";
    const card2 = await S.loadAimCard(USER, NOW, depsFor(w));
    check("…and the Aim card's milestone line strikes its own", json(card2?.milestone?.titleStruck) === json([[3, 5]]), json(card2?.milestone));
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
    const id = await newDraft(w, { ...INTAKE, targetDay: addDays(TODAY, 120) });
    const built = await S.buildStarterCore(USER, id, NOW, realDeps(w));
    if (!built.ok) return [false, built.error];
    const acc = await S.acceptCore(USER, id, { overAccepted: true }, NOW, realDeps(w));
    if (!acc.ok) return [false, acc.error];
    const m1 = rowsOf(w, id, 1).find((m) => m.status === "PLANNED") as MilestoneRec;
    const st = await S.startMilestoneCore(USER, m1.id, { ...START_ALL, overAccepted: true }, NOW, realDeps(w));
    const goals = w.templates.filter((t) => t.kind === "GOAL");
    return [st.ok && goals.length === 1 && goals[0].horizon === "MID" && [0, 6].includes(goals[0].stated ?? -1), json([st, goals.map((g) => g.stated)])];
  });

  await integration("a Gemini draft through the real draftSamples, validator and fitting lands as GEMINI suggestions (R2, R3)", async () => {
    const w = world();
    const id = await newDraft(w);
    const reply = { milestones: [{ title: "Foundations", domains: ["D1"], newDomains: [], topics: [], practices: [{ name: "Timed problems", method: "DELIBERATE_PRACTICE" }], steps: [] }, { title: "Inference", domains: ["D2"], newDomains: [], topics: [], steps: [] }] };
    const tasks: (() => Promise<void> | void)[] = [];
    const deps = realDeps(w, { defer: (t) => tasks.push(t), callModel: async () => sdkReply(reply), clock: () => NOW });
    const c = await S.claimDraftCore(USER, id, { force: false }, NOW, deps);
    if (!c.ok) return [false, c.error];
    for (const t of tasks) await t();
    const rows = rowsOf(w, id, 1);
    const items = rows.flatMap((m) => itemsOf(w, m.id));
    return [w.t.roadmapRun[0].status !== "FAILED" && rows.length >= 1 && items.some((i) => i.origin === "GEMINI" && i.decision === "PENDING"), json([w.t.roadmapRun[0].status, w.t.roadmapRun[0].error, rows.length])];
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

  await integration("the page's title checks are R3's withLabelChecks: 'Do 50 problems first' is NUMBER with '50' struck (fix round 2)", async () => {
    const w = world();
    await drafted(w, { milestones: [{ title: "Do 50 problems first", domains: ["d-prob"] }, { title: "Inference basics", domains: ["d-inf"] }] });
    const view = await S.loadRoadmapView(USER, NOW, realDeps(w));
    const d1 = view.draft?.milestones[0];
    const span = d1?.titleStruck?.[0];
    return [!!d1 && (d1.titleFlags ?? []).includes("NUMBER") && !!span && d1.title.slice(span[0], span[1]) === "50", json([d1?.titleFlags, d1?.titleStruck])];
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
