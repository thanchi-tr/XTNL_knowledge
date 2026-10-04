/**
 * Roadmap lane L: a ROADMAP goal's close, its preview and the goal ladder
 * (docs/life-plan/roadmap.md F10, F15, F16 seams 1, 2, 7 and 10;
 * roadmap-contracts.md §9.4 items 1, 2 and 4, §12 "L"). This is the money
 * path that makes a milestone lineage pay at most once, so it is pinned here
 * by behaviour, not by reading the source.
 *
 * Pure: no database, no clock, no network, no model. Every Prisma model and
 * raw entry is a spy: a read the case did not script fails the case, writes
 * come back as tokens, and `$transaction` records its array instead of
 * running it, so nothing can reach the shared database. The roadmap reads
 * (R1's readingOpsFor and loadRoadmapGoalSeries, the lineage read) are
 * injected through GoalCloseDeps, GoalSeriesLoader and GoalLadderDeps.
 * PASS/FAIL per line; exits 1 on any failure.
 *
 *   npx tsx scripts/goals-close-check.ts
 *
 * Sections:
 *   §1  goals.ts, the ROADMAP branch: g from the stored series, labels, 'pays nothing', closeDecision, closedGoalReading
 *   §2  one lineage pays once (goals.ts): lineagePaidOnOf and closeDecision's 'this milestone already paid on …'
 *   §3  readGoalCloseInput: a ROADMAP goal reads its stored series once more, only for such a goal
 *   §4  closeGoalCore: `closing: true`, the transaction's order, R1's reach ops after the readings, the rows it writes
 *   §5  prepareRoadmapGoalClose: the preview records the readings, applies no reach, and agrees with the close
 *   §6  only a final refusal closes unmeasured; any other failure refuses with GOAL_CLOSE_RETRY and writes nothing
 *   §7  the g paid is the g R1 judged the reach on; one due day (milestoneDueDayOf)
 *   §8  at most one goal of a lineage pays: superseded, paid lineage, the in-transaction lineage guard, races
 *   §9  writes off: a ROADMAP close refuses, the preview is live and labelled, an ordinary goal still closes
 *   §10 loadGoalLineages on stored rows: otherGoalIds, superseded (isSupersededRow), the milestone's due day
 *   §11 the goal ladder: an open ROADMAP goal's preview is the close's
 *   §12 nav (seam 10) and review.ts (seam 7)
 */
import "./_no-model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { dateColumn } from "../src/lib/life-day";
import { goalMintKey, mintDetail } from "../src/lib/life-economy";
import {
  GOAL_ALREADY_CLOSED,
  closeDecision,
  closedGoalReading,
  goalAsOf,
  goalProgress,
  goalProgressLabel,
  lineagePaidOnOf,
  roadmapPointAsOf,
  statedPayoutCopy,
  statedPayoutLine,
  type GoalInput,
  type GoalMintRow,
  type RoadmapGoalEntry,
  type RoadmapSeriesPoint,
} from "../src/lib/goals";
import {
  GOAL_CLOSE_BEFORE_LAUNCH,
  GOAL_CLOSE_RETRY,
  GOAL_CLOSE_STALE,
  closeGoalCore,
  loadGoalLadderUncached,
  loadGoalLineages,
  prepareRoadmapGoalClose,
  readGoalCloseInput,
  type GoalCloseDeps,
  type GoalLineage,
  type GoalSeriesLoader,
} from "../src/lib/goals-server";
import type { ReadingOps } from "../src/lib/roadmap-readings";
import { NOT_RECORDED_HERE, ROADMAP_WRITES_OFF, type RoadmapWriteOpts } from "../src/lib/roadmap-types";
import { DEV_STYLE_PAGES, activeSub, sectionById, titleFor } from "../src/components/shell/nav";

const ROOT = join(__dirname, "..");
let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}
const j = (x: unknown) => JSON.stringify(x);

// ── fixtures ────────────────────────────────────────────────────────────────

const TODAY = "2026-11-20";
const NOW = new Date("2026-11-19T23:00:00Z"); // 10:00 on Fri 20 Nov in Sydney (LIFE_TZ)
const LAUNCH = "2026-10-05";
const WRITES_ON = { XTNL_LIFE_JUDGE: "1" };
const WRITES_OFF = { NODE_ENV: "development" };

const pt = (day: string, g: number, bindingClass: RoadmapSeriesPoint["bindingClass"] = "MEASURED", bindingLabel = "cards at level 6+"): RoadmapSeriesPoint => ({
  day,
  g,
  observedAt: `${day}T01:00:00.000Z`,
  bindingClass,
  bindingLabel,
});
const base = (o: Partial<GoalInput> = {}): GoalInput => ({
  id: "goal1",
  horizon: "MID",
  track: "CRAFT",
  goalMp: 6,
  krMetric: "ROADMAP",
  krTarget: null,
  steps: [{ completedDay: "2026-10-10" }, { completedDay: "2026-10-12" }],
  progress: [],
  readings: [pt("2026-11-18", 0.4)],
  dueDay: "2026-12-13",
  createdDay: "2026-10-01",
  today: TODAY,
  launchDay: LAUNCH,
  goalMints: [],
  cappedUsedThisWeek: 0,
  ...o,
});
const mint = (goalId: string, day: string, qty: number, reason = "GOAL_MID"): GoalMintRow => ({ key: goalMintKey(goalId), templateId: goalId, track: "CRAFT", reason, day, qty });

// ── the Prisma spy ──────────────────────────────────────────────────────────

/** A write (or raw op) the code built: what a lazy Prisma op would have been. */
interface Token {
  op: string;
  args: unknown[];
  raw?: string;
  values?: unknown[];
  inTx: boolean;
}
const isToken = (x: unknown): x is Token => !!x && typeof x === "object" && "op" in x && "inTx" in x;
type ReadArgs = { where?: Record<string, unknown> } | undefined;

const db = prisma as unknown as Record<string, unknown>;
const MODELS = Object.values(Prisma.ModelName).map((n) => n.charAt(0).toLowerCase() + n.slice(1));
const RAW_ENTRIES = ["$transaction", "$executeRaw", "$executeRawUnsafe", "$queryRaw", "$queryRawUnsafe"];
const saved = [...MODELS, ...RAW_ENTRIES].map((k) => [k, db[k]] as const);
const WRITE_METHODS = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"]);

const spy = {
  /** Every entry touched, in order ("taskTemplate.findFirst", "$executeRaw", "$transaction(7)"). */
  touched: [] as string[],
  /** Every write or raw op built; `inTx` once it rode a $transaction array. */
  writes: [] as Token[],
  /** Each $transaction's array, as passed. */
  txs: [] as unknown[][],
  /** Scripted reads by entry ("taskTemplate.findMany"); any other read rejects. */
  reads: {} as Record<string, (args: ReadArgs) => unknown>,
  /** What a $transaction does with its array (default: every op returns 1). */
  tx: async (ops: unknown[]): Promise<unknown[]> => ops.map(() => 1),
};
function reset(reads: typeof spy.reads = {}, tx?: (ops: unknown[]) => Promise<unknown[]>): void {
  spy.touched = [];
  spy.writes = [];
  spy.txs = [];
  spy.reads = reads;
  spy.tx = tx ?? (async (ops) => ops.map(() => 1));
}
function install(): void {
  for (const model of MODELS) {
    db[model] = new Proxy(
      {},
      {
        get: (_t, method) => {
          if (typeof method !== "string") return undefined;
          return (...args: unknown[]) => {
            const name = `${model}.${method}`;
            spy.touched.push(name);
            if (WRITE_METHODS.has(method)) {
              const t: Token = { op: name, args, inTx: false };
              spy.writes.push(t);
              return t;
            }
            const read = spy.reads[name];
            if (!read) return Promise.reject(new Error(`unscripted read: ${name}`));
            return Promise.resolve().then(() => read(args[0] as ReadArgs));
          };
        },
      }
    );
  }
  db.$executeRaw = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const t: Token = { op: "$executeRaw", args: [], raw: strings.join("?").replace(/\s+/g, " "), values, inTx: false };
    spy.touched.push("$executeRaw");
    spy.writes.push(t);
    return t;
  };
  db.$queryRaw = () => {
    spy.touched.push("$queryRaw");
    return Promise.reject(new Error("unscripted read: $queryRaw"));
  };
  for (const k of ["$executeRawUnsafe", "$queryRawUnsafe"]) {
    db[k] = () => {
      spy.touched.push(k);
      return Promise.reject(new Error(`unscripted: ${k}`));
    };
  }
  db.$transaction = async (ops: unknown) => {
    if (!Array.isArray(ops)) throw new Error("an interactive transaction (not expected on these paths)");
    spy.touched.push(`$transaction(${ops.length})`);
    for (const o of ops) if (isToken(o)) o.inTx = true;
    spy.txs.push(ops);
    return spy.tx(ops);
  };
}
function restore(): void {
  for (const [k, v] of saved) db[k] = v;
}

/** Writes built but never put in a transaction (a write the close made outside its one array). */
const strays = () => spy.writes.filter((w) => !w.inTx);
/** A Prisma.sql / Prisma.join fragment (its strings and values). */
const isSqlFragment = (v: unknown): v is { strings: unknown[]; values: unknown[] } =>
  !!v && typeof v === "object" && Array.isArray((v as { values?: unknown }).values) && Array.isArray((v as { strings?: unknown }).strings);
/** The values a raw op was given, with Prisma.join / Prisma.sql fragments flattened. */
const flatValues = (vs: readonly unknown[] = []): unknown[] => vs.flatMap((v) => (isSqlFragment(v) ? flatValues(v.values) : [v]));

// R1's ops are opaque to goals-server: sentinels stand for them, so the transaction's order can be read.
const SENT_A = { sentinel: "reading:A" };
const SENT_P = { sentinel: "reading:PROFICIENCY" };
const REACH = { sentinel: "reach:R1" };
const isSent = (x: unknown) => x === SENT_A || x === SENT_P || x === REACH;
const label = (o: unknown): string => {
  if (isToken(o)) {
    if (o.op !== "$executeRaw") return o.op;
    const raw = o.raw ?? "";
    return raw.includes("pg_advisory_xact_lock") ? "lock" : raw.includes("CASE WHEN EXISTS") ? "lineage" : raw.includes("SELECT COUNT(*)") ? "guard" : "raw";
  }
  return o && typeof o === "object" && "sentinel" in o ? String((o as { sentinel: string }).sentinel) : "?";
};
const labels = (ops: readonly unknown[] | undefined) => (ops ?? []).map(label);
const isLineageGuard = (o: unknown) => label(o) === "lineage";

// The injected roadmap reads.
let readingOpsCalls = 0;
let lastOpts: (RoadmapWriteOpts & { closing?: boolean }) | null = null;
let lineageCalls: (readonly string[])[] = [];
type Fake = Partial<Extract<ReadingOps, { ok: true }>> | { ok: false; reason: string; final?: boolean } | "throw";
const deps = (input: GoalInput | null, ops: Fake, o: { env?: Record<string, string>; lineage?: GoalLineage | null } = {}): GoalCloseDeps => ({
  env: o.env ?? WRITES_ON,
  readInput: async () => (input ? structuredClone(input) : null),
  lineages: async (_u, ids) => {
    lineageCalls.push(ids);
    return o.lineage ? { [input?.id ?? "goal1"]: o.lineage } : {};
  },
  readingOps: async (_u, _g, _n, opts) => {
    readingOpsCalls++;
    lastOpts = opts;
    if (ops === "throw") throw Object.assign(new Error("Timed out fetching a new connection from the connection pool."), { code: "P2024" });
    if ("ok" in ops && ops.ok === false) return ops as unknown as ReadingOps;
    return { ok: true, ops: [SENT_A, SENT_P] as never, rows: [], point: pt(TODAY, 0.4), reach: { kind: "none" }, live: false, reachOps: [REACH] as never, ...(ops as object) } as ReadingOps;
  },
});
const lone = (milestoneDueDay: string | null = "2026-12-13"): GoalLineage => ({ milestoneDueDay, otherGoalIds: [], superseded: false });

const knownError = (code: string, message: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: Prisma.prismaVersion.client, meta });

/** console.error, captured: a refused close logs why, and the check stays quiet. */
const logged: string[] = [];
const realError = console.error;

// ═══ §1 goals.ts, the ROADMAP branch ═══════════════════════════════════════

function goalsBranch(): void {
  console.log("§1 goals.ts, the ROADMAP branch (seam 1)");
  check("goalProgress: null with no reading (readings absent)", goalProgress({ krMetric: "ROADMAP", krTarget: null, steps: [], progress: [] }, TODAY) === null);
  check("goalProgress: null with no reading, even with 2 of 2 steps done (never CHILDREN's 1.0)", goalProgress(base({ readings: [] }), TODAY) === null);
  const series = [pt("2026-11-10", 0.3), pt("2026-11-18", 0.6), pt("2026-11-25", 0.9)];
  check("goalProgress: the last reading on or before the day", goalProgress(base({ readings: series, steps: [] }), TODAY) === 0.6);
  check("goalProgress: order-free (a shuffled series reads the same)", goalProgress(base({ readings: [series[2], series[0], series[1]], steps: [] }), TODAY) === 0.6);
  const due = base({ readings: series, steps: [], dueDay: "2026-11-15" });
  check("goalProgress: past due, the due day's reading (progress after it never counts)", goalProgress(due, goalAsOf(due.today, due.dueDay)) === 0.3);
  check("goalProgress: the minimum with the steps' share (1 of 2 vs 0.8 → 0.5)", goalProgress(base({ readings: [pt("2026-11-18", 0.8)], steps: [{ completedDay: "2026-10-10" }, { completedDay: null }] }), TODAY) === 0.5);
  check("goalProgress: 2 of 2 steps and a 0.4 reading → 0.4", goalProgress(base(), TODAY) === 0.4);
  check(
    "roadmapPointAsOf: two points on one day, the later observedAt wins",
    roadmapPointAsOf([{ ...pt(TODAY, 0.2), observedAt: "2026-11-19T22:00:00.000Z" }, { ...pt(TODAY, 0.7), observedAt: "2026-11-19T23:00:00.000Z" }], TODAY)?.g === 0.7
  );
  check("goalProgress: a non-finite g is not a reading", goalProgress(base({ readings: [pt("2026-11-18", Number.NaN)] }), TODAY) === null);
  check("goalProgress: g above 1 clamps to 1", goalProgress(base({ readings: [pt(TODAY, 1.4)], steps: [] }), TODAY) === 1);

  check("statedPayoutCopy(MID, 0) reads 'pays nothing'", statedPayoutCopy("MID", 0) === "pays nothing");
  check(
    "statedPayoutCopy's other lines are unchanged",
    statedPayoutCopy("MID") === "pays ⬡ 6 × progress from 70%" && statedPayoutCopy("SHORT") === "pays ⬡ 1 when done" && statedPayoutCopy("LONG") === "pays ⬡ 20 × progress from 70%"
  );
  check("statedPayoutLine appends a bare zero reason", statedPayoutLine("MID", 0, "knowledge is paid by reviews") === "pays nothing · knowledge is paid by reviews");
  check("statedPayoutLine keeps a reason already written 'pays nothing · …'", statedPayoutLine("MID", 0, "pays nothing · practice under an hour a week") === "pays nothing · practice under an hour a week");
  check("statedPayoutLine ignores a reason on a goal that states MP", statedPayoutLine("MID", 6, "anything") === "pays ⬡ 6 × progress from 70%");

  check("label: 'tested by your reviews · slowest: …' from the binding part", goalProgressLabel(base({ steps: [] }), TODAY) === "tested by your reviews · slowest: cards at level 6+");
  check(
    "label: 'from your ticks · slowest: Backtest sessions' for a self-reported part",
    goalProgressLabel(base({ steps: [], readings: [pt(TODAY, 0.5, "SELF_REPORTED", "Backtest sessions")] }), TODAY) === "from your ticks · slowest: Backtest sessions"
  );
  check(
    "label: the steps bind when strictly below the measures",
    goalProgressLabel(base({ readings: [pt(TODAY, 0.8)], steps: [{ completedDay: "2026-10-10" }, { completedDay: null }] }), TODAY) === "from your ticks · slowest: 1 of 2 steps"
  );
  check("label: no reading → 'not measured yet'", goalProgressLabel(base({ readings: [] }), TODAY) === "not measured yet");

  const zero = closeDecision(base({ goalMp: 0, readings: [pt(TODAY, 0.5)], steps: [] }));
  check("closeDecision: a 0-stated goal at 50% → 'it states 0 MP' (never 'below 70%')", zero.why === "it states 0 MP" && zero.pays === 0 && zero.g === 0.5, j(zero));
  const unmeasured = closeDecision(base({ readings: [] }));
  check("closeDecision: a ROADMAP goal with no reading pays 0, 'not measured yet'", unmeasured.pays === 0 && unmeasured.g === null && unmeasured.why === "not measured yet", j(unmeasured));
  const paying = closeDecision(base({ readings: [pt(TODAY, 0.8)] }));
  check("closeDecision: a paying ROADMAP close, 6 × 0.8 = 4.8", paying.pays === 4.8 && paying.why === null && paying.g === 0.8, j(paying));
  check("closeDecision: readingNote passes through to the payout", closeDecision(base({ readingNote: NOT_RECORDED_HERE })).readingNote === NOT_RECORDED_HERE);
  check("closeDecision: no readingNote key on a payout without one (M5 payouts unchanged)", !("readingNote" in paying));

  const closed = closedGoalReading({ krMetric: "ROADMAP", krTarget: null, steps: [{ completedDay: null }], progress: [], readings: [pt(TODAY, 0.1)], dueDay: null, closedScore: 0.82 }, TODAY, null);
  check("closedGoalReading: a closed ROADMAP goal reads its closedScore, 'as measured at the close'", closed.g === 0.82 && closed.progressLabel === "as measured at the close", j(closed));
  const closedUnmeasured = closedGoalReading({ krMetric: "ROADMAP", krTarget: null, steps: [], progress: [], dueDay: null, closedScore: 0 }, TODAY, "not measured yet");
  check("closedGoalReading: one closed unmeasured shows no percentage, 'not measured'", closedUnmeasured.g === null && closedUnmeasured.progressLabel === "not measured", j(closedUnmeasured));
}

// ═══ §2 one lineage pays once (goals.ts) ═══════════════════════════════════

function lineagePure(): void {
  console.log("§2 one lineage pays once (goals.ts)");
  check("lineagePaidOnOf: none without other goals", lineagePaidOnOf([mint("o1", "2026-03-03", 6)], []) === null);
  check(
    "lineagePaidOnOf: the earliest paying row of the other goals (another goal's row ignored)",
    lineagePaidOnOf([mint("o1", "2026-04-09", 6), mint("o2", "2026-03-03", 4.2), mint("x", "2026-01-01", 6)], ["o1", "o2"]) === "2026-03-03"
  );
  check("lineagePaidOnOf: a 0 row (closed for nothing) is not a pay", lineagePaidOnOf([mint("o1", "2026-03-03", 0)], ["o1"]) === null);
  check("lineagePaidOnOf: a row under a non-goal reason is not a goal pay", lineagePaidOnOf([mint("o1", "2026-03-03", 6, "WEEK_KEPT")], ["o1"]) === null);
  const paid = closeDecision(base({ readings: [pt(TODAY, 0.9)], lineagePaidOn: "2026-03-03" }));
  check("closeDecision: a lineage another goal paid pays 0, 'this milestone already paid on 3 Mar', g kept", paid.pays === 0 && paid.why === "this milestone already paid on 3 Mar" && paid.g === 0.9 && paid.depth === 0, j(paid));
  check("closeDecision: 'it states 0 MP' still reads first for a 0-stated copy", closeDecision(base({ goalMp: 0, readings: [pt(TODAY, 0.9)], lineagePaidOn: "2026-03-03" })).why === "it states 0 MP");
  check("closeDecision: 'not measured yet' still reads first with no reading", closeDecision(base({ readings: [], lineagePaidOn: "2026-03-03" })).why === "not measured yet");
  check("closeDecision: 'before life MP began' still reads first before launch", closeDecision(base({ launchDay: null, readings: [pt(TODAY, 0.9)], lineagePaidOn: "2026-03-03" })).why === "before life MP began");
  check("closeDecision: the paid gate comes before the bar ('already paid', never 'below 70%')", closeDecision(base({ readings: [pt(TODAY, 0.3)], lineagePaidOn: "2026-03-03" })).why === "this milestone already paid on 3 Mar");
  const plain = closeDecision(base({ readings: [pt(TODAY, 0.8)] }));
  check("closeDecision: lineagePaidOn null changes nothing", j(closeDecision(base({ readings: [pt(TODAY, 0.8)], lineagePaidOn: null }))) === j(plain));
  check(
    "closeDecision: the day without zero padding (1 Dec, 31 Oct)",
    closeDecision(base({ readings: [pt(TODAY, 0.9)], lineagePaidOn: "2026-12-01" })).why === "this milestone already paid on 1 Dec" &&
      closeDecision(base({ readings: [pt(TODAY, 0.9)], lineagePaidOn: "2026-10-31" })).why === "this milestone already paid on 31 Oct"
  );
}

// ═══ §3 readGoalCloseInput ═════════════════════════════════════════════════

async function readInput(): Promise<void> {
  console.log("§3 readGoalCloseInput: a ROADMAP goal's stored series");
  const goalRow = (krMetric: string | null) => ({
    id: "goal1",
    track: "CRAFT",
    horizon: "MID",
    goalMp: 6,
    krMetric,
    krTarget: krMetric === "MANUAL" ? 4 : null,
    dueDay: dateColumn("2026-12-13"),
    createdAt: new Date("2026-10-01T01:00:00Z"),
  });
  let firstWhere: unknown = null;
  const reads = (row: ReturnType<typeof goalRow> | null): typeof spy.reads => ({
    "taskTemplate.findFirst": (a) => ((firstWhere = a?.where), row),
    "taskTemplate.findMany": () => [{ completedAt: new Date("2026-10-10T01:00:00Z") }, { completedAt: null }],
    "activityEvent.groupBy": () => [],
    "activityEvent.findMany": (a) =>
      a?.where && "dedupeKey" in a.where
        ? [{ dedupeKey: goalMintKey("orig1"), templateId: "orig1", track: "CRAFT", day: dateColumn("2026-03-03"), occurredAt: new Date("2026-03-03T01:00:00Z"), qty: 6, detail: mintDetail("GOAL_MID") }]
        : [],
  });
  const series = [pt("2026-11-18", 0.6)];
  const seriesCalls: { ids: readonly string[]; today: string }[] = [];
  const loader =
    (out: Record<string, RoadmapGoalEntry>): GoalSeriesLoader =>
    async (_u, ids, today) => {
      seriesCalls.push({ ids, today });
      return out;
    };
  const entry: RoadmapGoalEntry = { series, ord: 2, of: 3, zeroReason: null, note: null };

  reset(reads(goalRow("ROADMAP")));
  const rm = await readGoalCloseInput("u", "goal1", NOW, { series: loader({ goal1: entry }) });
  check("an open goal is read as its own user's open GOAL (not archived, not closed)", j(firstWhere) === j({ id: "goal1", userId: "u", kind: "GOAL", archivedAt: null, closedScore: null }), j(firstWhere));
  check(
    "a ROADMAP goal carries its milestone's stored series (one more read, for this goal only, as of today)",
    rm != null && rm.krMetric === "ROADMAP" && j(rm.readings) === j(series) && seriesCalls.length === 1 && j(seriesCalls[0]) === j({ ids: ["goal1"], today: TODAY }),
    j({ rm, seriesCalls })
  );
  check(
    "its days, steps and paying decision rows are read as M5 reads them",
    rm != null && rm.dueDay === "2026-12-13" && rm.createdDay === "2026-10-01" && j(rm.steps) === j([{ completedDay: "2026-10-10" }, { completedDay: null }]) && rm.goalMints.some((m) => m.key === goalMintKey("orig1") && m.qty === 6 && m.reason === "GOAL_MID"),
    j(rm)
  );
  check("nothing is written while reading", spy.writes.length === 0 && spy.txs.length === 0);

  seriesCalls.length = 0;
  reset(reads(goalRow("ROADMAP")));
  const none = await readGoalCloseInput("u", "goal1", NOW, { series: loader({}) });
  check("a ROADMAP goal with no series entry (an archived roadmap, a missing table) reads an empty series: g null", none != null && j(none.readings) === "[]" && goalProgress(none, TODAY) === null, j(none));

  seriesCalls.length = 0;
  reset(reads(goalRow("MANUAL")));
  const manual = await readGoalCloseInput("u", "goal1", NOW, { series: loader({ goal1: entry }) });
  check("an ordinary goal never reads a series and carries no readings key (M5 input unchanged)", manual != null && manual.krMetric === "MANUAL" && !("readings" in manual) && seriesCalls.length === 0, j(manual));

  reset(reads(goalRow("BOGUS")));
  const bogus = await readGoalCloseInput("u", "goal1", NOW, { series: loader({ goal1: entry }) });
  check("an unknown stored metric reads as null through the KR_METRICS whitelist, with no series", bogus != null && bogus.krMetric === null && !("readings" in bogus) && seriesCalls.length === 0, j(bogus));

  reset(reads(null));
  const gone = await readGoalCloseInput("u", "goal1", NOW, { series: loader({ goal1: entry }) });
  check("a goal that is not open reads null, and no series is read", gone === null && seriesCalls.length === 0);
}

// ═══ §4 closeGoalCore, a ROADMAP close ═════════════════════════════════════

async function closePath(): Promise<void> {
  console.log("§4 closeGoalCore: closing, the transaction, R1's reach ops");
  reset();
  readingOpsCalls = 0;
  const c1 = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base(), {}, { lineage: lone() }));
  check("2 of 2 steps and a 0.4 reading close at g 0.4, pays 0, 'below 70%' (never 1.0)", c1.ok && c1.payout.g === 0.4 && c1.payout.pays === 0 && c1.payout.why === "below 70%", j(c1));
  check(
    "a close that pays 0: one transaction of the lock, the readings, R1's reach op, the closedScore update and the 0 decision row (no guard, no ledger)",
    spy.txs.length === 1 && j(labels(spy.txs[0])) === j(["lock", "reading:A", "reading:PROFICIENCY", "reach:R1", "taskTemplate.updateMany", "activityEvent.create"]),
    j(spy.txs.map(labels))
  );

  reset();
  const c2 = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base(), { point: pt(TODAY, 0.9), g: 0.9 }, { lineage: lone() }));
  check("readingOpsFor gets {env, closing: true} from the close", lastOpts != null && lastOpts.closing === true && j(lastOpts.env) === j(WRITES_ON), j(lastOpts));
  check("the close pays from the reading it writes (6 × 0.9 = 5.4)", c2.ok && c2.payout.g === 0.9 && c2.payout.pays === 5.4 && c2.payout.why === null, j(c2));
  const tx2 = spy.txs[0] ?? [];
  check(
    "a paying close: the lock, the guard, the readings, then R1's guarded reach op (res.reachOps), the update, the decision row and the ledger entry",
    spy.txs.length === 1 &&
      j(labels(tx2)) === j(["lock", "guard", "reading:A", "reading:PROFICIENCY", "reach:R1", "taskTemplate.updateMany", "activityEvent.create", "masteryLedgerEntry.create"]),
    j(labels(tx2))
  );
  const update = tx2.find((o) => label(o) === "taskTemplate.updateMany") as Token | undefined;
  check(
    "the update closes only the still-open goal, closedScore = the g paid from, completedAt = now",
    j(update?.args[0]) === j({ where: { id: "goal1", userId: "u", kind: "GOAL", closedScore: null }, data: { closedScore: 0.9, completedAt: NOW } }),
    j(update?.args[0])
  );
  const row = tx2.find((o) => label(o) === "activityEvent.create") as Token | undefined;
  const rowData = (row?.args[0] as { data?: { dedupeKey?: string; qty?: number; source?: string } } | undefined)?.data;
  check("one decision row 'mp:GOAL:goal1' (MP_MINT) with qty 5.4", rowData?.dedupeKey === goalMintKey("goal1") && rowData.qty === 5.4 && rowData.source === "MP_MINT", j(rowData));
  check("no write is made outside the one transaction", strays().length === 0, j(strays().map((s) => s.op)));

  reset();
  await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base(), { point: pt(TODAY, 0.9), g: 0.9, reachOps: [] }, { lineage: lone() }));
  check(
    "with no reach ops from R1, none is added (goals-server builds no reach op of its own)",
    spy.txs.length === 1 && j(labels(spy.txs[0])) === j(["lock", "guard", "reading:A", "reading:PROFICIENCY", "taskTemplate.updateMany", "activityEvent.create", "masteryLedgerEntry.create"]),
    j(spy.txs.map(labels))
  );

  reset();
  const early = await closeGoalCore("u", "goal1", NOW, null, deps(base(), {}));
  check("before launch: refused first, with nothing read or written", !early.ok && early.error === GOAL_CLOSE_BEFORE_LAUNCH && spy.touched.length === 0);

  reset({ "taskTemplate.findFirst": () => ({ id: "goal1" }) });
  const replay = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(null, {}));
  check("a goal already closed: 'Already closed.', nothing written", !replay.ok && replay.error === GOAL_ALREADY_CLOSED && spy.txs.length === 0);
}

// ═══ §5 the preview ════════════════════════════════════════════════════════

async function previewPath(): Promise<void> {
  console.log("§5 prepareRoadmapGoalClose: the preview");
  reset();
  const prep = await prepareRoadmapGoalClose("u", "goal1", NOW, deps(base(), { point: pt(TODAY, 0.9), g: 0.9 }, { lineage: lone() }));
  check("readingOpsFor gets no `closing` from the preview", lastOpts != null && !("closing" in lastOpts), j(lastOpts));
  check(
    "the preview writes today's readings once, in its own transaction, and never a reach op",
    spy.txs.length === 1 && j(labels(spy.txs[0])) === j(["reading:A", "reading:PROFICIENCY"]) && prep.written === 2 && !prep.live && prep.note === null && prep.refused === null,
    j({ txs: spy.txs.map(labels), prep: { ...prep, input: undefined } })
  );
  reset();
  const c = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base(), { point: pt(TODAY, 0.9), g: 0.9 }, { lineage: lone() }));
  check("the preview and the close agree on one fixture", prep.input != null && c.ok && j(closeDecision(prep.input)) === j(c.payout), `${j(prep.input && closeDecision(prep.input))} vs ${j(c)}`);
  check("the preview's input carries today's point in place of the stored point of its day", prep.input != null && roadmapPointAsOf(prep.input.readings, TODAY)?.g === 0.9);

  reset();
  readingOpsCalls = 0;
  lineageCalls = [];
  const manual = base({ krMetric: "MANUAL", krTarget: 1, readings: undefined, progress: [{ day: "2026-10-02", qty: 1 }] });
  const mPrep = await prepareRoadmapGoalClose("u", "goal1", NOW, deps(manual, {}));
  check(
    "an ordinary goal: prepare returns its input untouched, and reads no lineage or readings, writes nothing",
    readingOpsCalls === 0 && lineageCalls.length === 0 && j(mPrep.input) === j(manual) && mPrep.written === 0 && !mPrep.live && spy.txs.length === 0
  );
  const gone = await prepareRoadmapGoalClose("u", "goal1", NOW, deps(null, {}));
  check("a goal that is not open: input null, nothing read or written", gone.input === null && readingOpsCalls === 0 && spy.txs.length === 0);
}

// ═══ §6 only a final refusal closes unmeasured ═════════════════════════════

async function refusals(): Promise<void> {
  console.log("§6 only a final refusal closes unmeasured");
  reset();
  const arch = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base(), { ok: false, reason: "measures removed by a reset", final: true }, { lineage: lone() }));
  check(
    "a final refusal (an archived roadmap): the close pays 0, g null, 'not measured yet', with no reading or reach op",
    arch.ok && arch.payout.g === null && arch.payout.pays === 0 && arch.payout.why === "not measured yet" && spy.txs.length === 1 && j(labels(spy.txs[0])) === j(["lock", "taskTemplate.updateMany", "activityEvent.create"]),
    j({ arch, tx: spy.txs.map(labels) })
  );
  reset();
  const archPrep = await prepareRoadmapGoalClose("u", "goal1", NOW, deps(base(), { ok: false, reason: "measures removed by a reset", final: true }, { lineage: lone() }));
  check(
    "a final refusal: the preview agrees ('not measured yet') and writes nothing",
    archPrep.refused === "measures removed by a reset" && archPrep.input != null && closeDecision(archPrep.input).why === "not measured yet" && spy.txs.length === 0
  );

  const quietRetry = async (fake: Fake) => {
    reset();
    logged.length = 0;
    const res = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base(), fake, { lineage: lone() }));
    return { res, wrote: spy.writes.length + spy.txs.length, logs: logged.length };
  };
  const transient = await quietRetry({ ok: false, reason: "Can't reach database server at db:5432" });
  check(
    "a refusal that is not final: 'Couldn't close; try again.', nothing built or written, and the failure is logged",
    !transient.res.ok && transient.res.error === GOAL_CLOSE_RETRY && transient.wrote === 0 && transient.logs === 1,
    j(transient)
  );
  const thrown = await quietRetry("throw");
  check(
    "readingOpsFor throws (a pool timeout): 'Couldn't close; try again.', nothing written, never a 0 close",
    !thrown.res.ok && thrown.res.error === GOAL_CLOSE_RETRY && thrown.wrote === 0 && thrown.logs === 1,
    j(thrown)
  );
  check("GOAL_CLOSE_RETRY reads 'Couldn't close; try again.'", GOAL_CLOSE_RETRY === "Couldn't close; try again.");

  reset();
  const outcome = (p: Promise<unknown>) =>
    p.then(
      () => "resolved",
      () => "threw"
    );
  const prepThrows = await outcome(prepareRoadmapGoalClose("u", "goal1", NOW, deps(base(), "throw", { lineage: lone() })));
  const prepNotFinal = await outcome(prepareRoadmapGoalClose("u", "goal1", NOW, deps(base(), { ok: false, reason: "timeout" }, { lineage: lone() })));
  check("the preview throws on both (it never previews a 0 the close would not pay), writing nothing", prepThrows === "threw" && prepNotFinal === "threw" && spy.txs.length === 0);
}

// ═══ §7 the g paid is the g judged; one due day ════════════════════════════

async function oneG(): Promise<void> {
  console.log("§7 the g paid is the g R1 judged the reach on; one due day");
  // The re-review's case: R1 judged as of an older due day (g 0.2, no reach) while the close would pay today's 1.0.
  reset();
  logged.length = 0;
  const split = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base({ dueDay: "2026-12-01", steps: [] }), { point: pt(TODAY, 1), g: 0.2, reachOps: [] }, { lineage: lone(null) }));
  check("g 1 paid vs g 0.2 judged: refused with GOAL_CLOSE_RETRY, nothing written, logged", !split.ok && split.error === GOAL_CLOSE_RETRY && spy.writes.length === 0 && logged.length === 1, j(split));
  reset();
  const agree = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base({ dueDay: "2026-12-01", steps: [] }), { point: pt(TODAY, 1), g: 1 }, { lineage: lone(null) }));
  check("g 1 judged and paid: pays 6 and applies R1's reach op", agree.ok && agree.payout.pays === 6 && labels(spy.txs[0]).includes("reach:R1"), j(agree));
  reset();
  const tiny = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base({ steps: [] }), { point: pt(TODAY, 0.8), g: 0.8 + 1e-12 }, { lineage: lone() }));
  check("float noise between the two g values is one reading (within 1e-6)", tiny.ok && tiny.payout.pays === 4.8, j(tiny));
  reset();
  const steps = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base({ readings: [], steps: [{ completedDay: "2026-10-10" }, { completedDay: null }] }), { point: pt(TODAY, 0.9), g: 0.5 }, { lineage: lone() }));
  check("the steps' share counts on both sides (a 0.9 point and 1 of 2 steps → 0.5 = R1's g)", steps.ok && steps.payout.g === 0.5 && steps.payout.why === "below 70%", j(steps));
  reset();
  const bothNull = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base({ readings: [] }), { point: null, g: null }, { lineage: lone() }));
  check("both unmeasured agree (null = null): it closes at 0, 'not measured yet'", bothNull.ok && bothNull.payout.g === null && bothNull.payout.why === "not measured yet", j(bothNull));
  // Lead decision 4 (kept strict): a milestone with no PAYS measure has no point but a steps-only g from R1.
  // Start refuses such a milestone (NOTHING_MEASURES), so the close can't meet it; if it ever did, it refuses.
  reset();
  logged.length = 0;
  const noPays = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base({ readings: [] }), { point: null, g: 0.5, reachOps: [] }, { lineage: lone() }));
  check("no point but a steps-only g from R1 (no PAYS measure): refused, never paid on one g and judged on another", !noPays.ok && noPays.error === GOAL_CLOSE_RETRY && spy.writes.length === 0, j(noPays));

  // One due day: milestoneDueDayOf(the milestone's, the goal's).
  reset();
  const milestoneDue = await closeGoalCore(
    "u",
    "goal1",
    NOW,
    LAUNCH,
    deps(base({ dueDay: null, steps: [], readings: [pt("2026-11-14", 0.75)] }), { point: pt("2026-11-15", 0.75), g: 0.75 }, { lineage: lone("2026-11-15") })
  );
  check("a goal with no due day takes its milestone's (15 Nov): pays 6 × 0.75 as of it", milestoneDue.ok && milestoneDue.payout.g === 0.75 && milestoneDue.payout.pays === 4.5, j(milestoneDue));
  reset();
  const rescheduled = await closeGoalCore(
    "u",
    "goal1",
    NOW,
    LAUNCH,
    deps(base({ dueDay: "2026-12-01", steps: [], readings: [pt("2026-11-14", 0.5)] }), { point: pt(TODAY, 0.9), g: 0.9 }, { lineage: lone("2026-11-15") })
  );
  check("a rescheduled goal's own due day (1 Dec) wins over its milestone's (15 Nov): today's 0.9 pays 5.4", rescheduled.ok && rescheduled.payout.g === 0.9 && rescheduled.payout.pays === 5.4, j(rescheduled));
  reset();
  const past = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base({ dueDay: "2026-11-15", readings: [pt("2026-11-14", 0.6), pt("2026-11-18", 0.9)] }), { point: null, g: 0.6 }, { lineage: lone() }));
  check("past due with nothing measurable now: the stored points up to the due day (0.6), never the later 0.9", past.ok && past.payout.g === 0.6, j(past));
}

// ═══ §8 at most one goal of a lineage pays ═════════════════════════════════

async function lineageClose(): Promise<void> {
  console.log("§8 at most one goal of a lineage pays");
  reset();
  readingOpsCalls = 0;
  lineageCalls = [];
  const sup = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base(), { point: pt(TODAY, 1), g: 1 }, { lineage: { milestoneDueDay: "2026-12-13", otherGoalIds: ["copy1"], superseded: true } }));
  check(
    "superseded (its 'Start again' copy started): unmeasured, pays 0, readingOpsFor never called, nothing measured or reached",
    sup.ok && sup.payout.g === null && sup.payout.pays === 0 && sup.payout.why === "not measured yet" && readingOpsCalls === 0 && spy.txs.length === 1 && !spy.txs[0].some(isSent) && !spy.txs[0].some(isLineageGuard),
    j({ sup, n: readingOpsCalls, tx: spy.txs.map(labels) })
  );
  check("the close reads the lineage of its own goal only", j(lineageCalls) === j([["goal1"]]), j(lineageCalls));
  reset();
  const supPrep = await prepareRoadmapGoalClose("u", "goal1", NOW, deps(base(), {}, { lineage: { milestoneDueDay: null, otherGoalIds: ["copy1"], superseded: true } }));
  check(
    "superseded: the preview agrees ('replaced by Start again'), pays 0, writes nothing",
    supPrep.refused === "replaced by Start again" && supPrep.written === 0 && supPrep.input != null && closeDecision(supPrep.input).pays === 0 && spy.txs.length === 0
  );

  reset();
  const twice = await closeGoalCore(
    "u",
    "goal1",
    NOW,
    LAUNCH,
    deps(base({ goalMints: [mint("orig1", "2026-03-03", 6)] }), { point: pt(TODAY, 1), g: 1 }, { lineage: { milestoneDueDay: null, otherGoalIds: ["orig1"], superseded: false } })
  );
  check(
    "drop → Start again → unarchive: the other goal of the lineage paid on 3 Mar, so this close pays 0 'this milestone already paid on 3 Mar' (no lineage guard: it pays nothing)",
    twice.ok && twice.payout.pays === 0 && twice.payout.g === 1 && twice.payout.why === "this milestone already paid on 3 Mar" && !(spy.txs[0] ?? []).some(isLineageGuard),
    j(twice)
  );

  reset();
  const first = await closeGoalCore(
    "u",
    "goal1",
    NOW,
    LAUNCH,
    deps(base({ goalMints: [mint("orig1", "2026-03-03", 0)] }), { point: pt(TODAY, 1), g: 1 }, { lineage: { milestoneDueDay: null, otherGoalIds: ["orig1"], superseded: false } })
  );
  const tx = spy.txs[0] ?? [];
  check(
    "the first paying close of a lineage pays, and its transaction re-checks the lineage after the lock and the guard, before the readings",
    first.ok && first.payout.pays === 6 && j(labels(tx).slice(0, 5)) === j(["lock", "guard", "lineage", "reading:A", "reading:PROFICIENCY"]),
    j(labels(tx))
  );
  const guard = tx.find(isLineageGuard) as Token | undefined;
  const gv = flatValues(guard?.values);
  check(
    "the lineage guard counts a paying MP_MINT row of the other goals' keys only (never this goal's own)",
    tx.filter(isLineageGuard).length === 1 &&
      gv.includes("u") &&
      gv.includes(goalMintKey("orig1")) &&
      !gv.includes(goalMintKey("goal1")) &&
      /"source" = 'MP_MINT'/.test(guard?.raw ?? "") &&
      /"qty" > 0/.test(guard?.raw ?? "") &&
      /THEN 0 ELSE 1 END/.test(guard?.raw ?? ""),
    j({ raw: guard?.raw, values: gv })
  );
  reset();
  await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base(), { point: pt(TODAY, 1), g: 1 }, { lineage: lone(null) }));
  check("a lineage of one: no lineage guard", spy.txs.length === 1 && !spy.txs[0].some(isLineageGuard));

  // Two closes racing: the guard divides by zero (Postgres 22012) inside the transaction; Prisma raises P2010.
  const stale = knownError("P2010", "Raw query failed. Code: `22012`. Message: `ERROR: division by zero`", { code: "22012", message: "ERROR: division by zero" });
  reset({}, async () => {
    throw stale;
  });
  const raced = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base(), { point: pt(TODAY, 1), g: 1 }, { lineage: { milestoneDueDay: null, otherGoalIds: ["orig1"], superseded: false } }));
  check("a tripped lineage guard (another goal of the lineage paid in between) reads 'Something changed; try again.'", !raced.ok && raced.error === GOAL_CLOSE_STALE, j(raced));
  reset({}, async () => {
    throw knownError("P2002", "Unique constraint failed on the fields: (`dedupeKey`)", { target: ["dedupeKey"] });
  });
  const dup = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base(), { point: pt(TODAY, 1), g: 1 }, { lineage: lone() }));
  check("a replayed close of the same goal meets its decision row's key: 'Already closed.'", !dup.ok && dup.error === GOAL_ALREADY_CLOSED, j(dup));
  reset({}, async () => {
    throw new Error("Server has closed the connection.");
  });
  const other = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base(), { point: pt(TODAY, 1), g: 1 }, { lineage: lone() })).then(
    () => "resolved",
    (err: unknown) => (err as Error).message
  );
  check("any other transaction failure is thrown, never read as a close", other === "Server has closed the connection.", other);

  reset();
  logged.length = 0;
  readingOpsCalls = 0;
  const lineageFails = await closeGoalCore("u", "goal1", NOW, LAUNCH, { ...deps(base(), { point: pt(TODAY, 1), g: 1 }), lineages: async () => Promise.reject(new Error("P1001: Can't reach database server")) });
  check(
    "the lineage read failing: 'Couldn't close; try again.', readingOpsFor never called, nothing written, logged",
    !lineageFails.ok && lineageFails.error === GOAL_CLOSE_RETRY && readingOpsCalls === 0 && spy.writes.length === 0 && logged.length === 1,
    j(lineageFails)
  );
}

// ═══ §9 writes off ═════════════════════════════════════════════════════════

async function writesOff(): Promise<void> {
  console.log("§9 writes off");
  reset();
  readingOpsCalls = 0;
  lineageCalls = [];
  const off = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base(), {}, { env: WRITES_OFF, lineage: lone() }));
  check(
    "a ROADMAP close refuses with ROADMAP_WRITES_OFF, computing and writing nothing",
    !off.ok && off.error === ROADMAP_WRITES_OFF && spy.txs.length === 0 && spy.writes.length === 0 && readingOpsCalls === 0 && lineageCalls.length === 0,
    j(off)
  );
  reset();
  const offPrep = await prepareRoadmapGoalClose("u", "goal1", NOW, deps(base(), { live: true, ops: [], reachOps: [] }, { env: WRITES_OFF, lineage: lone() }));
  check(
    "the preview returns the live values, labelled 'not recorded on this server', and writes nothing",
    spy.txs.length === 0 && offPrep.live && offPrep.note === NOT_RECORDED_HERE && offPrep.input != null && closeDecision(offPrep.input).readingNote === NOT_RECORDED_HERE
  );
  reset();
  const offR1 = await prepareRoadmapGoalClose("u", "goal1", NOW, deps(base(), { point: pt(TODAY, 0.9), g: 0.9 }, { env: WRITES_OFF, lineage: lone() }));
  check("with writes off here, R1's ops are never written even if it returned some", spy.txs.length === 0 && offR1.live && offR1.written === 0);
  reset();
  const mismatch = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base(), { live: true, ops: [], reachOps: [] }, { lineage: lone() }));
  check("a live value is never paid from (readingOpsFor saw writes off where this server did not)", !mismatch.ok && mismatch.error === ROADMAP_WRITES_OFF && spy.txs.length === 0);
  reset();
  const offManual = await closeGoalCore("u", "goal1", NOW, LAUNCH, deps(base({ krMetric: "MANUAL", krTarget: 1, readings: undefined, progress: [{ day: "2026-10-02", qty: 1 }] }), {}, { env: WRITES_OFF }));
  check(
    "an ordinary goal still closes with writes off (M5 unchanged): no reading, reach or lineage op",
    offManual.ok && offManual.payout.pays === 6 && spy.txs.length === 1 && !spy.txs[0].some(isSent) && !spy.txs[0].some(isLineageGuard),
    j(offManual)
  );
}

// ═══ §10 loadGoalLineages on stored rows ═══════════════════════════════════

async function lineagesRead(): Promise<void> {
  console.log("§10 loadGoalLineages on stored rows");
  const t0 = new Date("2026-10-01T01:00:00Z");
  const t1 = new Date("2026-11-01T01:00:00Z");
  type Row = { id: string; roadmapId: string; lineageId: string; version: number; status: string; createdAt: Date; goalId: string | null; dueDay: Date | null };
  const rows: Row[] = [
    { id: "m-old", roadmapId: "r1", lineageId: "L1", version: 1, status: "STARTED", createdAt: t0, goalId: "g-old", dueDay: dateColumn("2026-11-15") },
    { id: "m-new", roadmapId: "r1", lineageId: "L1", version: 1, status: "STARTED", createdAt: t1, goalId: "g-new", dueDay: dateColumn("2026-12-20") },
    { id: "m-solo", roadmapId: "r1", lineageId: "L2", version: 1, status: "STARTED", createdAt: t0, goalId: "g-solo", dueDay: null },
    { id: "m-x", roadmapId: "r2", lineageId: "L1", version: 1, status: "STARTED", createdAt: t1, goalId: "g-x", dueDay: null },
  ];
  const wheres: Record<string, unknown>[] = [];
  const reads = (all: Row[]): typeof spy.reads => ({
    "roadmapMilestone.findMany": (a) => {
      const where = a?.where ?? {};
      wheres.push(where);
      if ("goalId" in where) {
        const ids = (where.goalId as { in: string[] }).in;
        return all.filter((r) => r.goalId && ids.includes(r.goalId));
      }
      const or = (where.OR ?? []) as { roadmapId: string; lineageId: string }[];
      return all.filter((r) => or.some((o) => o.roadmapId === r.roadmapId && o.lineageId === r.lineageId));
    },
  });

  reset(reads(rows));
  const out = await loadGoalLineages("u", ["g-old", "g-new", "g-solo", "g-old"]);
  check(
    "the first read holds these goals on the user's own roadmaps, deduplicated",
    j(wheres[0]) === j({ goalId: { in: ["g-old", "g-new", "g-solo"] }, roadmap: { userId: "u" } }),
    j(wheres[0])
  );
  check("the second read is scoped to (roadmap, lineage) pairs: another roadmap's L1 stays out", j(out["g-old"]?.otherGoalIds) === j(["g-new"]) && j(out["g-new"]?.otherGoalIds) === j(["g-old"]), j(out));
  check(
    "a STARTED row whose 'Start again' copy started is superseded; the copy and a lone row are not",
    out["g-old"]?.superseded === true && out["g-new"]?.superseded === false && out["g-solo"]?.superseded === false,
    j(out)
  );
  check(
    "each goal carries its own milestone's due day (null when none)",
    out["g-old"]?.milestoneDueDay === "2026-11-15" && out["g-new"]?.milestoneDueDay === "2026-12-20" && out["g-solo"]?.milestoneDueDay === null && j(out["g-solo"]?.otherGoalIds) === "[]"
  );

  const planned: Row[] = [rows[0], { ...rows[1], status: "PLANNED", goalId: null }];
  reset(reads(planned));
  wheres.length = 0;
  const p = await loadGoalLineages("u", ["g-old"]);
  check("a 'Start again' copy still PLANNED supersedes nothing (unarchiving the dropped goal undoes the drop)", p["g-old"]?.superseded === false && j(p["g-old"]?.otherGoalIds) === "[]", j(p));
  check("nothing is written while reading lineages", spy.writes.length === 0 && spy.txs.length === 0);

  reset(reads(rows));
  wheres.length = 0;
  const empty = await loadGoalLineages("u", []);
  check("no goals: {} with no read", j(empty) === "{}" && spy.touched.length === 0);
  const unheld = await loadGoalLineages("u", ["g-none"]);
  check("goals no milestone holds: {} after one read", j(unheld) === "{}" && wheres.length === 1);

  reset({
    "roadmapMilestone.findMany": () => {
      throw knownError("P2021", "The table `public.RoadmapMilestone` does not exist in the current database.", { modelName: "RoadmapMilestone", table: "public.RoadmapMilestone" });
    },
  });
  check("a missing roadmap table reads as {} (before the migration)", j(await loadGoalLineages("u", ["g-old"])) === "{}");
  reset({
    "roadmapMilestone.findMany": () => {
      throw knownError("P1001", "Can't reach database server at `db:5432`");
    },
  });
  const failure = await loadGoalLineages("u", ["g-old"]).then(
    () => "resolved",
    () => "threw"
  );
  check("any other failure is thrown (so the close refuses with GOAL_CLOSE_RETRY rather than paying unchecked)", failure === "threw");
}

// ═══ §11 the goal ladder ═══════════════════════════════════════════════════

async function ladder(): Promise<void> {
  console.log("§11 the goal ladder: an open ROADMAP goal's preview is the close's");
  const created = new Date("2026-10-01T01:00:00Z");
  const goal = (id: string, o: Record<string, unknown> = {}) => ({
    id,
    title: id,
    horizon: "MID",
    track: "CRAFT",
    goalMp: 6,
    krMetric: "ROADMAP",
    krTarget: null,
    krUnit: null,
    dueDay: null,
    createdAt: created,
    closedScore: null,
    completedAt: null,
    ...o,
  });
  const open = [
    goal("rm-due"),
    goal("rm-sup", { dueDay: dateColumn("2026-12-13") }),
    goal("rm-paid", { dueDay: dateColumn("2026-12-13") }),
    goal("rm-zero", { goalMp: 0, dueDay: dateColumn("2026-12-13") }),
    goal("plain", { krMetric: "CHILDREN", dueDay: dateColumn("2026-12-01") }),
  ];
  const closed = [goal("rm-closed", { closedScore: 0.82, completedAt: new Date("2026-11-10T01:00:00Z"), dueDay: dateColumn("2026-11-30") })];
  const mintRow = (goalId: string, day: string, qty: number) => ({
    dedupeKey: goalMintKey(goalId),
    templateId: goalId,
    track: "CRAFT",
    day: dateColumn(day),
    occurredAt: new Date(`${day}T01:00:00Z`),
    qty,
    detail: mintDetail("GOAL_MID"),
  });
  const reads = (openRows: ReturnType<typeof goal>[]): typeof spy.reads => ({
    "taskTemplate.findMany": (a) => {
      const w = a?.where ?? {};
      if ("parentId" in w) return [{ parentId: "plain", completedAt: new Date("2026-10-10T01:00:00Z") }, { parentId: "plain", completedAt: null }];
      return w.closedScore === null ? openRows : closed;
    },
    "activityEvent.groupBy": () => [],
    "activityEvent.findMany": (a) => (a?.where && "dedupeKey" in a.where ? [mintRow("orig", "2026-03-03", 6), mintRow("rm-closed", "2026-11-10", 4.92)] : []),
  });
  const entry = (series: RoadmapSeriesPoint[], o: Partial<RoadmapGoalEntry> = {}): RoadmapGoalEntry => ({ series, ord: 1, of: 3, zeroReason: null, note: null, ...o });
  const entries: Record<string, RoadmapGoalEntry> = {
    "rm-due": entry([pt("2026-11-14", 0.75), pt("2026-11-19", 1)]),
    "rm-sup": entry([pt(TODAY, 0.9)]),
    "rm-paid": entry([pt("2026-11-18", 0.9)]),
    "rm-zero": entry([pt("2026-11-18", 0.5)], { zeroReason: "knowledge is paid by reviews" }),
  };
  const lineages: Record<string, GoalLineage> = {
    "rm-due": { milestoneDueDay: "2026-11-15", otherGoalIds: [], superseded: false },
    "rm-sup": { milestoneDueDay: "2026-12-13", otherGoalIds: ["rm-sup-copy"], superseded: true },
    "rm-paid": { milestoneDueDay: "2026-12-13", otherGoalIds: ["orig"], superseded: false },
  };
  const seen: { series: (readonly string[])[]; lineages: (readonly string[])[] } = { series: [], lineages: [] };
  const ladderDeps = (lineageRead?: () => Promise<Record<string, GoalLineage>>) => ({
    series: async (_u: string, ids: readonly string[], today: string) => {
      seen.series.push([...ids, `@${today}`]);
      return entries;
    },
    lineages: async (_u: string, ids: readonly string[]) => {
      seen.lineages.push(ids);
      return lineageRead ? lineageRead() : lineages;
    },
  });

  reset(reads(open));
  const l = await loadGoalLadderUncached("u", NOW, ladderDeps());
  const item = (id: string) => l.open.find((x) => x.id === id);
  check(
    "the series and the lineage are each read once, for the open ROADMAP goals only, as of today",
    j(seen.series) === j([["rm-due", "rm-sup", "rm-paid", "rm-zero", `@${TODAY}`]]) && j(seen.lineages) === j([["rm-due", "rm-sup", "rm-paid", "rm-zero"]]),
    j(seen)
  );
  const due = item("rm-due");
  check(
    "no goal due day: the milestone's (15 Nov) is the due day, past due, g as of it (0.75, not today's 1.0), Carried 0.75",
    due?.dueDay === "2026-11-15" && due.pastDue && due.g === 0.75 && due.carried === 0.75,
    j(due)
  );
  check("its preview is the close's: pays 6 × 0.75 = 4.5", due?.preview?.pays === 4.5 && due.preview.why === null, j(due?.preview));
  check("its label names the binding part, and the board's entry rides along for the chip", due?.progressLabel === "tested by your reviews · slowest: cards at level 6+" && due.roadmap === entries["rm-due"]);
  const sup = item("rm-sup");
  check("a superseded row is unmeasured on the ladder even if a series came back: g null, 'not measured yet'", sup?.g === null && sup.preview?.why === "not measured yet" && sup.progressLabel === "not measured yet", j(sup));
  const paid = item("rm-paid");
  check("a lineage another goal paid previews 0, 'this milestone already paid on 3 Mar'", paid?.g === 0.9 && paid.preview?.pays === 0 && paid.preview.why === "this milestone already paid on 3 Mar", j(paid?.preview));
  const zero = item("rm-zero");
  check("a 0-stated milestone's line folds its reason: 'pays nothing · knowledge is paid by reviews'", zero?.copy === "pays nothing · knowledge is paid by reviews" && zero.preview?.why === "it states 0 MP", j(zero));
  const plain = item("plain");
  check("an ordinary goal: no roadmap entry, its steps as before (1 of 2)", plain != null && !("roadmap" in plain) && plain.g === 0.5 && plain.progressLabel === "1 of 2 steps", j(plain));
  const closedItem = l.closed.find((x) => x.id === "rm-closed");
  check(
    "a closed ROADMAP goal reads its closedScore (0.82, 'as measured at the close') and what it paid",
    closedItem?.g === 0.82 && closedItem.progressLabel === "as measured at the close" && closedItem.closed?.paid === 4.92 && !("roadmap" in closedItem),
    j(closedItem)
  );
  check("the ladder writes nothing", spy.writes.length === 0 && spy.txs.length === 0);

  seen.series = [];
  seen.lineages = [];
  reset(reads(open));
  logged.length = 0;
  const failed = await loadGoalLadderUncached("u", NOW, ladderDeps(() => Promise.reject(new Error("P1001"))));
  check(
    "the lineage read failing: the ladder still renders every goal and logs it (the close re-reads and refuses)",
    failed.open.length === 5 && logged.length === 1 && failed.open.find((x) => x.id === "rm-due")?.dueDay === null,
    j({ n: failed.open.length, logged })
  );

  seen.series = [];
  seen.lineages = [];
  reset(reads([open[4]]));
  const plainOnly = await loadGoalLadderUncached("u", NOW, ladderDeps());
  check("no open ROADMAP goal: neither the series nor the lineage is read", plainOnly.open.length === 1 && seen.series.length === 0 && seen.lineages.length === 0, j(seen));
}

// ═══ §12 nav and review.ts ═════════════════════════════════════════════════

function navAndReview(): void {
  console.log("§12 nav (seam 10) and review.ts (seam 7)");
  check("You subs: Sheet, Roadmap, Skills, Loadout, Moments, Stats, Settings", j(sectionById("you").subs.map((s) => s.label)) === j(["Sheet", "Roadmap", "Skills", "Loadout", "Moments", "Stats", "Settings"]));
  check("/you/roadmap titles {You, Roadmap}, under its own tab", j(titleFor("/you/roadmap")) === j({ eyebrow: "You", title: "Roadmap" }) && activeSub("/you/roadmap") === "/you/roadmap");
  check("/you/roadmap/new titles {You, Set an aim}, under the Roadmap tab", j(titleFor("/you/roadmap/new")) === j({ eyebrow: "You", title: "Set an aim" }) && activeSub("/you/roadmap/new") === "/you/roadmap");
  check("dev strip: Roadmap fixtures", DEV_STYLE_PAGES.some((p) => p.href === "/dev/style/roadmap" && p.label === "Roadmap fixtures"));

  const review = readFileSync(join(ROOT, "src/app/actions/review.ts"), "utf8");
  check(
    "review.ts schedules the roadmap's card writer in after(), only when the level moved",
    /if \(levelAfter !== idea\.level\) \{\s*after\(\(\) =>\s*recordCardsForReview\(userId, idea\.id, idea\.domainId, idea\.level, levelAfter, \{ now \}\)/.test(review)
  );
  check("…after the review's write, never before it", review.indexOf("recordCardsForReview(userId") > review.indexOf("await applyReviewResult("));
  check("…and a failure that escapes the writer is logged, never swallowed without a trace", /recordCardsForReview\([^\n]*\)\.catch\(\(err: unknown\) => \{\s*console\.error\(/.test(review));
}

// ═══ run ═══════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  // The ladder's previews read the launch gate from the environment: pin it, so a later LIFE_LAUNCH_DAY can't move these goldens.
  process.env.XTNL_LIFE_LAUNCH_DAY = "2026-10-01";
  goalsBranch();
  lineagePure();
  install();
  console.error = (...args: unknown[]) => {
    logged.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
  };
  try {
    await readInput();
    await closePath();
    await previewPath();
    await refusals();
    await oneG();
    await lineageClose();
    await writesOff();
    await lineagesRead();
    await ladder();
  } finally {
    console.error = realError;
    restore();
  }
  navAndReview();
}

main()
  .catch((err: unknown) => check("every section ran", false, err instanceof Error ? (err.stack ?? err.message) : String(err)))
  .finally(() => {
    console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} pass`);
    process.exit(failed ? 1 : 0);
  });
