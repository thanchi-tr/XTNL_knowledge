/**
 * Blueprint P14 (docs/life-plan/blueprint-plan-2026-10-22.md; decision D10): the roadmap Start rehearsal. One
 * end-to-end run of the real roadmap, task and momentum cores against the LOCAL Docker database and nothing else,
 * with the Start gate on for this process alone (XTNL_ROADMAP_GOALS_LIVE=1, roadmap-types roadmapGoalsLive).
 * ROADMAP_GOALS_LIVE stays false in code: flipping it is the user's go, after this run is green. Run by the lead
 * only, never by a subagent, and never against Supabase.
 *
 *   npx tsx scripts/roadmap-rehearse.ts           # rehearse, then archive what it created
 *   npx tsx scripts/roadmap-rehearse.ts --keep    # rehearse and leave the goal started (look at it on the rehearsal server)
 *   npx tsx scripts/roadmap-rehearse.ts --clean   # archive every rehearsal goal an earlier run left open, then stop
 *
 * Safety, before anything touches a database:
 *   - DATABASE_URL and DIRECT_URL must each be unset or point at localhost, 127.0.0.1 or [::1]. Unset, both are set to
 *     the rehearsal mirror (docs/life-plan/dev-rehearsal.mjs: localhost:55432). Any other host, any URL that names
 *     supabase, NODE_ENV=production (it would ignore the override) and a Vercel environment are refused. No .env file
 *     is read here for the database, and process env beats .env in Prisma, so Supabase is never reached. Prisma and
 *     every core are imported only after the check passes.
 *   - XTNL_LIFE_JUDGE=1 for this process (the rehearsal server's rule, life-economy lifeWritesEnabled), so the roadmap
 *     cores, the completion core, the readings writer and the momentum settle write as production's would.
 *   - No model is ever called: the Gemini keys are blanked and ROADMAP_CHECK=1 (roadmap-model's call refuses under it).
 *     The plan is built from the user's numbers (buildStarterCore), as "Build from my numbers" does.
 *
 * Whose data: the default user's (DEFAULT_USER_ID when set, else the one LifeSettings row on the local database that
 * is not a rehearsal user's), on a throwaway goal of the run's own whose aim starts "P14 rehearsal", in a free seat.
 * A leftover DRAFT of an earlier run is picked up; a leftover ACTIVE or PAUSED one is archived first.
 *
 * The steps, each printing PASS or FAIL lines. A step the rest depends on stops the run; the cleanup still runs.
 *   1  The goal: picked or created (saveIntakeCore, a CRAFT track Area, no Domains), the activity card answered
 *      "Nothing to avoid" if it asks, the plan built from the numbers (buildStarterCore), every row it waits on
 *      decided (editItemCore, decideItemCore), accepted (acceptCore).
 *   2  The gate as shipped: with no override the gate is the code value (false), the plan's hero reads START_LATER
 *      (a line, no Start button), and Start refuses with GATE_OFF.
 *   3  The switch on (XTNL_ROADMAP_GOALS_LIVE=1): the hero offers START (the button returns) and the Start sheet can
 *      start; reading the plans with it on starts nothing, on this goal or on any other ACTIVE plan of the user.
 *   4  Start (startMilestoneCore): the milestone STARTED with its MID ROADMAP goal; its practices are recurring tasks
 *      under the goal (rm:<milestoneId>:p<i>) and show on Today (loadTodayBoard and buildBoard), and the goal shows
 *      among Today's goals.
 *   5  The week quests: Start froze exactly one set for this life week (source START); a render's freeze after it
 *      (freezeWeekQuests) writes no second set and leaves it as issued.
 *   6  One practice ticked through the real completion core (completeInstanceCore), then the practice writer the
 *      action's after() runs (recordPracticeForTemplate): today's practice reading counts it, and the frozen set is
 *      still as issued.
 *   7  The milestone driven to reached through the reach rule's own guarded write (roadmap-readings reachOpOf, the
 *      write the readings writer applies at g = 1; a real g = 1 takes weeks of ticks), then the momentum settle every
 *      page render runs (settleMomentum): exactly one MILESTONE row ('ms:<lineageId>') and one LIFE_MILESTONE mint;
 *      a second settle and two at once write no more.
 *   8  Cleanup (skipped with --keep): the tick undone (undoCompletionCore), the milestone's practices and steps
 *      archived (archiveCore), the roadmap and its goal archived (archiveRoadmapCore). The pay rows stay, because the
 *      ledger is append-only; they are named at the end.
 *
 * Exit code: 0 when every check passed, 1 when any failed, 2 when the guard refused to run.
 */
import "./_no-model";
import type { DayKey } from "../src/lib/life-day";
import type { Intake, RoadmapView, StartChoices } from "../src/lib/roadmap-types";

const KEEP = process.argv.includes("--keep");
const CLEAN = process.argv.includes("--clean");

/** The rehearsal database (docs/life-plan/dev-rehearsal.mjs). */
const LOCAL_DB = "postgresql://postgres:rehearsal@localhost:55432/postgres";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
/** Every rehearsal goal's aim starts with this; nothing else is ever archived by this script. */
const AIM_PREFIX = "P14 rehearsal";
const AIM = `${AIM_PREFIX}: sketch a page of drawings`;
/** The goal's name in the switcher (GOAL_LABEL_MAX 16). */
const LABEL = "P14 rehearsal";
const RUN = Date.now().toString(36);

// ── The database guard (before any import that loads Prisma) ─────────────

function localUrlProblem(name: "DATABASE_URL" | "DIRECT_URL", fallback: string): string | null {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") {
    process.env[name] = fallback;
    return null;
  }
  if (/supabase/i.test(raw)) return `${name} names supabase: this rehearsal runs on the local Docker database only.`;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return `${name} is not a URL.`;
  }
  if (!/^postgres(ql)?:$/.test(u.protocol)) return `${name} is not a postgres URL.`;
  if (!LOCAL_HOSTS.has(u.hostname.toLowerCase())) return `${name} points at ${u.hostname}, not localhost or 127.0.0.1.`;
  return null;
}

function guard(): void {
  const problems: string[] = [];
  const db = localUrlProblem("DATABASE_URL", LOCAL_DB);
  if (db) problems.push(db);
  const direct = localUrlProblem("DIRECT_URL", process.env.DATABASE_URL ?? LOCAL_DB);
  if (direct) problems.push(direct);
  if (process.env.NODE_ENV === "production") problems.push("NODE_ENV is production: XTNL_ROADMAP_GOALS_LIVE would be ignored, and this is not a production server.");
  if (process.env.VERCEL || process.env.VERCEL_ENV) problems.push("A Vercel environment is set: run this on your machine, against the local database.");
  if (problems.length > 0) {
    console.error("Refusing to run: this rehearsal writes, and only to the local Docker database.");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(2);
  }
  // Writes on read and on every core, as on the rehearsal server (XTNL_LIFE_JUDGE=1), for this process only.
  process.env.XTNL_LIFE_JUDGE = "1";
  // No model call, whatever .env holds (scripts/_no-model.ts did this first; kept here so the guard says it): blanked
  // keys stay blank (dotenv never overrides a set variable), and roadmap-model's call refuses under ROADMAP_CHECK.
  process.env.GEMINI_API_KEY = "";
  process.env.GOOGLE_API_KEY = "";
  process.env.ROADMAP_CHECK = "1";
  delete process.env.PRISMA_COUNT_QUERIES;
}

async function loadModules() {
  const [prismaMod, cache, lifeDay, economy, types, server, quests, readings, tasks, board, momentumServer, momentum, nextAction] = await Promise.all([
    import("../src/lib/prisma"),
    import("../src/lib/cache"),
    import("../src/lib/life-day"),
    import("../src/lib/life-economy"),
    import("../src/lib/roadmap-types"),
    import("../src/lib/roadmap-server"),
    import("../src/lib/roadmap-quests-server"),
    import("../src/lib/roadmap-readings"),
    import("../src/lib/tasks"),
    import("../src/lib/today-board"),
    import("../src/lib/momentum-server"),
    import("../src/lib/momentum"),
    import("../src/components/roadmap/next-action"),
  ]);
  return { prisma: prismaMod.prisma, cache, lifeDay, economy, types, server, quests, readings, tasks, board, momentumServer, momentum, nextAction };
}
type Mods = Awaited<ReturnType<typeof loadModules>>;
let M!: Mods;

// ── Checks ───────────────────────────────────────────────────────────────

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const fails: string[] = [];
let passed = 0;
let stepName = "";

function check(name: string, ok: boolean, detail = ""): boolean {
  if (ok) passed += 1;
  else fails.push(`${stepName} · ${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`    ${ok ? "PASS" : "FAIL"} ${name}${detail && !ok ? ` — ${detail}` : ""}`);
  return ok;
}

function info(text: string): void {
  console.log(`    ·    ${text}`);
}

/** A step the rest of the run depends on failed: the run stops there (the cleanup still runs). */
class Abort extends Error {}

function okOr<T>(name: string, r: Result<T>): T {
  check(name, r.ok, r.ok ? "" : r.error);
  if (!r.ok) throw new Abort(name);
  return r.value;
}

function must<T>(name: string, v: T | null | undefined, detail = "missing"): T {
  check(name, v != null, detail);
  if (v == null) throw new Abort(name);
  return v;
}

const show = (x: unknown) => JSON.stringify(x);

function step(n: string, what: string): void {
  stepName = `${n} ${what}`;
  console.log(`\n── ${n} · ${what}`);
  // One life day for the whole run: a run straddling 04:00 Sydney would compare days that are no longer today.
  if (M.lifeDay.todayKey(new Date()) !== today) throw new Abort("the life day turned over (04:00 Sydney) during the run: run it again");
  M.cache.invalidateAll();
}

// ── The run's facts ──────────────────────────────────────────────────────

let userId = "";
let today = "" as DayKey;
const made: {
  roadmapId: string | null;
  milestoneId: string | null;
  lineageId: string | null;
  goalId: string | null;
  practiceIds: string[];
  tick: { instanceId: string; templateId: string } | null;
} = { roadmapId: null, milestoneId: null, lineageId: null, goalId: null, practiceIds: [], tick: null };

/** The default user: DEFAULT_USER_ID, else the one LifeSettings row that isn't a rehearsal user's. */
async function defaultUser(): Promise<string | null> {
  const fromEnv = process.env.DEFAULT_USER_ID?.trim();
  if (fromEnv) return fromEnv;
  const rows = await M.prisma.lifeSettings.findMany({ select: { userId: true } });
  const real = rows.map((r) => r.userId).filter((u) => !u.startsWith("rehearse-"));
  return real.length === 1 ? real[0] : null;
}

const viewOf = (roadmapId: string): Promise<RoadmapView> => M.server.loadRoadmapView(userId, new Date(), {}, roadmapId);

/** The open rehearsal goals of the default user (by the aim's prefix), oldest first. */
function rehearsalGoals(statuses: readonly string[]) {
  return M.prisma.roadmap.findMany({
    where: { userId, aim: { startsWith: AIM_PREFIX }, status: { in: [...statuses] } },
    select: { id: true, status: true, aim: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

/** The open tasks a goal's milestones created ('rm:<milestoneId>' and its children 'rm:<milestoneId>:…'). */
async function openTasksOf(roadmapId: string) {
  const milestones = await M.prisma.roadmapMilestone.findMany({ where: { roadmapId }, select: { id: true } });
  const keys = milestones.map((m) => M.types.milestoneGoalKey(m.id));
  if (keys.length === 0) return [];
  const rows = await M.prisma.taskTemplate.findMany({
    where: { userId, archivedAt: null, captureKey: { startsWith: "rm:" } },
    select: { id: true, kind: true, captureKey: true },
  });
  return rows.filter((t) => keys.some((k) => t.captureKey === k || (t.captureKey ?? "").startsWith(`${k}:`)));
}

/** STARTING or STARTED milestones on the user's other goals (none exist while Start has never been live). */
const otherStarted = (roadmapId: string) =>
  M.prisma.roadmapMilestone.count({ where: { roadmap: { userId, id: { not: roadmapId } }, status: { in: ["STARTING", "STARTED"] } } });

/** A goal's milestone statuses and its open tasks, to compare before and after a read. */
async function footprintOf(roadmapId: string): Promise<string> {
  const rows = await M.prisma.roadmapMilestone.findMany({ where: { roadmapId }, select: { id: true, status: true, goalId: true, startingAt: true }, orderBy: { id: "asc" } });
  return show({ rows, tasks: (await openTasksOf(roadmapId)).map((t) => t.id).sort() });
}

/**
 * Archives one rehearsal goal and everything its milestones put on Today: the practices and steps (archiveCore), then
 * the roadmap with its goal (archiveRoadmapCore; a DRAFT is discarded instead), then a goal a STARTING row left.
 */
async function archiveGoal(roadmapId: string): Promise<void> {
  const row = await M.prisma.roadmap.findUnique({ where: { id: roadmapId }, select: { status: true } });
  if (!row) return info(`goal ${roadmapId} no longer exists`);
  const tasks = await openTasksOf(roadmapId);
  for (const t of tasks.filter((x) => x.kind !== "GOAL")) {
    const a = await M.tasks.archiveCore(userId, t.id, new Date());
    check(`its task ${t.captureKey} is archived (archiveCore)`, a.ok, a.ok ? "" : a.error);
  }
  if (row.status === "DRAFT") {
    const d = await M.server.discardDraftCore(userId, roadmapId, new Date(), {});
    check("the draft is discarded (discardDraftCore)", d.ok, d.ok ? "" : d.error);
  } else if (row.status === "ACTIVE" || row.status === "PAUSED" || row.status === "DONE") {
    const a = await M.server.archiveRoadmapCore(userId, roadmapId, { reason: "P14 rehearsal: archived by scripts/roadmap-rehearse.ts", archiveGoal: true }, new Date(), {});
    check("the roadmap and its open goal are archived (archiveRoadmapCore)", a.ok, a.ok ? "" : a.error);
  }
  for (const g of (await openTasksOf(roadmapId)).filter((x) => x.kind === "GOAL")) {
    const a = await M.tasks.archiveCore(userId, g.id, new Date());
    check(`its goal ${g.captureKey} is archived (archiveCore)`, a.ok, a.ok ? "" : a.error);
  }
  const after = await M.prisma.roadmap.findUnique({ where: { id: roadmapId }, select: { status: true } });
  const left = await openTasksOf(roadmapId);
  check("nothing of it is left open (the roadmap closed, no task of its milestones on Today)", after != null && !["DRAFT", "ACTIVE", "PAUSED"].includes(after.status) && left.length === 0, show({ status: after?.status, left }));
}

// ── 1 · The goal: picked or created, built from the numbers, accepted ─────

async function stepGoal(): Promise<{ roadmapId: string; milestoneId: string }> {
  step("1", "a throwaway goal: picked or created, built from the numbers, accepted");
  for (const old of await rehearsalGoals(["ACTIVE", "PAUSED"])) {
    info(`an earlier run left goal ${old.id} ${old.status}: archiving it first`);
    await archiveGoal(old.id);
  }
  const leftover = (await rehearsalGoals(["DRAFT"]))[0] ?? null;
  let roadmapId: string;
  if (leftover) {
    roadmapId = leftover.id;
    info(`picked the leftover draft ${roadmapId} ("${leftover.aim}")`);
  } else roadmapId = await createGoal();
  made.roadmapId = roadmapId;
  await answerCardIfAsked(roadmapId);
  let built = await M.server.buildStarterCore(userId, roadmapId, new Date(), {});
  if (!built.ok && leftover) {
    info(`the leftover draft can't be rebuilt ("${built.error}"): discarding it and creating a fresh goal`);
    await archiveGoal(roadmapId);
    roadmapId = await createGoal();
    made.roadmapId = roadmapId;
    await answerCardIfAsked(roadmapId);
    built = await M.server.buildStarterCore(userId, roadmapId, new Date(), {});
  }
  okOr("the plan is built from the numbers (buildStarterCore: no model)", built);
  await answerCardIfAsked(roadmapId);
  await decideWhatWaits(roadmapId);
  let acc = await M.server.acceptCore(userId, roadmapId, { overAccepted: false }, new Date(), {});
  if (!acc.ok && /over|hours|pace/i.test(acc.error)) {
    info(`accept answered "${acc.error}": accepting with "Keep it over my hours/pace" on`);
    acc = await M.server.acceptCore(userId, roadmapId, { overAccepted: true }, new Date(), {});
  }
  okOr("the plan is accepted (acceptCore)", acc);
  const r = must("the accepted roadmap reads back", await M.prisma.roadmap.findUnique({ where: { id: roadmapId }, select: { status: true, version: true } }));
  check("the roadmap is ACTIVE", r.status === "ACTIVE", r.status);
  const first = must(
    "the accepted plan has a milestone waiting to start (PLANNED)",
    await M.prisma.roadmapMilestone.findFirst({ where: { roadmapId, version: r.version, status: "PLANNED", goalId: null }, orderBy: { ord: "asc" }, select: { id: true, lineageId: true, ord: true, title: true, dueDay: true } })
  );
  made.milestoneId = first.id;
  made.lineageId = first.lineageId;
  info(`milestone ${first.ord} "${first.title}", due ${first.dueDay ? M.lifeDay.keyOfDateColumn(first.dueDay) : "?"} (id ${first.id})`);
  return { roadmapId, milestoneId: first.id };
}

/** A new throwaway goal in the lowest free seat (saveIntakeCore with a createKey, as the form's "New aim" saves). */
async function createGoal(): Promise<string> {
  const intake: Intake = {
    aim: AIM,
    fieldId: null,
    track: "CRAFT",
    domainIds: [],
    targetDay: M.lifeDay.addDays(today, 300),
    hoursPerWeek: 3,
    newCardsPerWeek: null,
    typicalHours: null,
    typicalHoursSource: null,
    syllabus: null,
    startPoint: "BASICS",
    intensity: "STEADY",
    practicesAllowed: true,
    constraints: null,
    examLabel: null,
    dateMode: "CHOSEN",
    label: LABEL,
  };
  const saved = okOr(
    "the goal is created in a free seat (saveIntakeCore: a CRAFT track Area, 3 h a week, 300 days)",
    await M.server.saveIntakeCore(userId, intake, new Date(), {}, { createKey: `p14-rehearsal-${RUN}` })
  );
  return saved.roadmapId;
}

/** The activity card (contracts §19): when it asks on this plan, the user answers "Nothing to avoid". */
async function answerCardIfAsked(roadmapId: string): Promise<void> {
  const v = await viewOf(roadmapId);
  const card = v.activityConfirm ?? v.draft?.activityConfirm ?? null;
  if (!card || !card.on || card.answered != null) return;
  okOr(
    "the activity card is answered 'Nothing to avoid' (setActivityVerdictsCore)",
    await M.server.setActivityVerdictsCore(userId, roadmapId, { key: card.key, avoid: [], nothingToAvoid: true }, new Date(), {})
  );
}

/** Every row accept waits on (roadmap-types draftNeedsOf), settled as a user would: a bar set, a name given, Gemini's words checked. */
async function decideWhatWaits(roadmapId: string): Promise<void> {
  for (let pass = 0; ; pass++) {
    const rows = await M.prisma.roadmapMilestone.findMany({ where: { roadmapId, status: "DRAFT" }, include: { items: true }, orderBy: { ord: "asc" } });
    const needs = rows.flatMap((m) => M.types.draftNeedsOf(m as unknown as Parameters<Mods["types"]["draftNeedsOf"]>[0]));
    if (needs.length === 0) return;
    if (pass === 3) {
      check("nothing on the draft still waits for the user", false, `still waiting after three passes: ${show(needs)}`);
      return;
    }
    for (const n of needs) {
      const id = must(`the row that waits (${n.kind} · ${n.need}) has an id`, n.id);
      const now = new Date();
      const res =
        n.need === "SET_BAR"
          ? await M.server.editItemCore(userId, id, { outOf: 100, bar: 70 }, now, {})
          : n.need === "NAME"
            ? await M.server.editItemCore(userId, id, { label: n.kind === "TITLE" ? "Rehearsal milestone" : "Rehearsal practice" }, now, {})
            : n.need === "DECIDE"
              ? await M.server.decideItemCore(userId, id, n.kind === "TITLE" ? "KEPT" : "CHECKED", now, {})
              : ({ ok: false, error: "a Domain to map: a track plan has none" } as Result<null>);
      check(`a ${n.kind} that waits (${n.need}) is settled`, res.ok, res.ok ? "" : res.error);
    }
  }
}

// ── 2 · The gate as shipped ──────────────────────────────────────────────

async function stepShipped(roadmapId: string, milestoneId: string): Promise<void> {
  step("2", "the gate as shipped: Start hidden and refused");
  delete process.env[M.types.ROADMAP_GOALS_LIVE_ENV];
  check("ROADMAP_GOALS_LIVE is false in code", M.types.ROADMAP_GOALS_LIVE === false);
  check("with no override the gate is the code value (roadmapGoalsLive() is false)", M.types.roadmapGoalsLive() === false);
  const v = await viewOf(roadmapId);
  const hero = M.nextAction.nextActionOf(v).primary;
  check("the plan's view says Start is not live", v.goalsLive === false);
  check("the hero reads START_LATER ('Starting milestones arrives with the next update.'), no Start button", hero.kind === "START_LATER", show({ kind: hero.kind, label: hero.label }));
  const before = await footprintOf(roadmapId);
  const refused = await M.server.startMilestoneCore(userId, milestoneId, startChoices(false), new Date(), {});
  check("Start refuses with GATE_OFF", !refused.ok && refused.error.includes(M.server.GATE_OFF), refused.ok ? "it went through" : refused.error);
  check("…and writes nothing", (await footprintOf(roadmapId)) === before);
}

const startChoices = (overAccepted: boolean): StartChoices => ({ target: "STORED", overAccepted, practicesOff: [], rules: {}, decisions: {}, edits: {} });

// ── 3 · The switch on for this process ───────────────────────────────────

async function stepSwitchOn(roadmapId: string, milestoneId: string): Promise<boolean> {
  step("3", "XTNL_ROADMAP_GOALS_LIVE=1: the Start button returns, and nothing starts by itself");
  const othersBefore = await otherStarted(roadmapId);
  const before = await footprintOf(roadmapId);
  process.env[M.types.ROADMAP_GOALS_LIVE_ENV] = "1";
  check("outside production the override turns the gate on (roadmapGoalsLive() is true)", M.types.roadmapGoalsLive() === true);
  check("production would still read the code value", M.types.roadmapGoalsLive({ NODE_ENV: "production", XTNL_ROADMAP_GOALS_LIVE: "1" }) === false);
  const v = await viewOf(roadmapId);
  const hero = M.nextAction.nextActionOf(v).primary;
  check("the plan's view says Start is live", v.goalsLive === true);
  check("the hero offers START (the Start button returns)", hero.kind === "START", show({ kind: hero.kind, label: hero.label }));
  const sheet = must("the Start sheet loads (startPreview)", await M.server.startPreview(userId, milestoneId, new Date(), {}));
  check("the Start sheet is live and can start", sheet.goalsLive === true && sheet.canStart, show({ refusal: sheet.refusal, blockers: sheet.blockers }));
  info(`the sheet: ${sheet.practices.length} practice(s), ${sheet.steps.length} step(s), pays ⬡${sheet.pay.stated}${sheet.pay.zeroReason ? ` (${sheet.pay.zeroReason})` : ""}, week quests ${sheet.weekQuests ? sheet.weekQuests.quests.length : "none"}`);
  // The user's other ACTIVE plans, read with the switch on as their pages would be: none starts.
  const others = await M.prisma.roadmap.findMany({ where: { userId, status: "ACTIVE", id: { not: roadmapId } }, select: { id: true } });
  for (const o of others) await viewOf(o.id);
  await M.server.loadAimCards(userId, new Date(), {});
  check("reading this plan and its sheet with the switch on changed nothing (no milestone STARTING or STARTED, no task)", (await footprintOf(roadmapId)) === before);
  check(
    `nothing auto-starts on the flip: the user's ${others.length} other ACTIVE plan(s), read with the switch on, still have no started milestone`,
    (await otherStarted(roadmapId)) === othersBefore,
    show({ before: othersBefore, after: await otherStarted(roadmapId) })
  );
  const fz = sheet.feasibility;
  return fz.worst === "OVER" || fz.time.verdict === "OVER" || fz.knowledge.some((k) => k.verdict === "OVER");
}

// ── 4 · Start: the goal and its practices on Today ───────────────────────

async function stepStart(milestoneId: string, over: boolean): Promise<void> {
  step("4", "Start: the milestone's goal and practices on Today");
  if (over) info("the milestone is over your hours or pace now: starting with “Keep it over my hours/pace” on");
  const started = okOr("Start answers with the goal (startMilestoneCore)", await M.server.startMilestoneCore(userId, milestoneId, startChoices(over), new Date(), {}));
  made.goalId = started.goalId;
  const row = must("the milestone reads back", await M.prisma.roadmapMilestone.findUnique({ where: { id: milestoneId }, include: { items: true } }));
  check(
    "the milestone is STARTED with its goal, started today",
    row.status === "STARTED" && row.goalId === started.goalId && row.startedDay != null && M.lifeDay.keyOfDateColumn(row.startedDay) === today,
    show({ status: row.status, goalId: row.goalId, startedDay: row.startedDay })
  );
  const goalKey = M.types.milestoneGoalKey(milestoneId);
  const goal = must("the goal reads back", await M.prisma.taskTemplate.findUnique({ where: { id: started.goalId }, select: { kind: true, horizon: true, krMetric: true, goalMp: true, captureKey: true, archivedAt: true } }));
  check("the goal is an open MID ROADMAP goal keyed rm:<milestoneId>", goal.kind === "GOAL" && goal.horizon === "MID" && goal.krMetric === "ROADMAP" && goal.captureKey === goalKey && goal.archivedAt == null, show(goal));
  info(`the goal states ⬡${goal.goalMp ?? 0} for its close (6 or 0: the practice gate)`);
  const practices = row.items.filter((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED");
  const withTask = practices.filter((i) => i.templateId != null);
  for (const i of practices.filter((x) => x.templateId == null)) info(`practice "${i.label}" has no task (addToToday ${i.addToToday}; held back or switched off)`);
  check("Start created the milestone's practices (each row carries its task)", withTask.length > 0, `${practices.length} practice row(s), none with a task`);
  made.practiceIds = withTask.map((i) => i.templateId as string);
  const tpls = await M.prisma.taskTemplate.findMany({ where: { id: { in: made.practiceIds } }, select: { id: true, title: true, kind: true, recurrence: true, parentId: true, captureKey: true, archivedAt: true, compulsory: true } });
  check(
    "each practice is an open recurring habit under the goal, keyed rm:<milestoneId>:p<i>, never a must",
    tpls.length === made.practiceIds.length &&
      tpls.every((t) => t.kind === "HABIT" && !!t.recurrence && t.parentId === started.goalId && (t.captureKey ?? "").startsWith(`${goalKey}:p`) && t.archivedAt == null && !t.compulsory),
    show(tpls)
  );
  for (const t of tpls) info(`practice task "${t.title}" · ${t.recurrence} · ${t.captureKey}`);

  M.cache.invalidateAll();
  const data = await M.tasks.loadTodayBoard(userId, today, new Date());
  const board = M.board.buildBoard(data);
  const rows = [...board.must, ...board.todayRows, ...board.anytime];
  const shown = new Set<string>([...rows.map((r) => r.template.id), ...board.laterRows.map((r) => r.templateId)]);
  const missing = made.practiceIds.filter((id) => !shown.has(id));
  check("every practice shows on Today (Must, Today, Anytime or Planned later)", missing.length === 0, show({ missing }));
  const goals = Object.values(board.goals).flat();
  check("the milestone's goal shows among Today's goals", goals.some((g) => g.template.id === started.goalId));
}

// ── 5 · The week quests freeze ───────────────────────────────────────────

async function weekRowsOf(milestoneId: string) {
  return M.prisma.roadmapQuestWeek.findMany({ where: { userId, milestoneId }, select: { id: true, dedupeKey: true, source: true, weekStart: true, quests: true, finalizedAt: true } });
}

async function stepWeekQuests(milestoneId: string): Promise<string | null> {
  step("5", "the week quests: frozen by Start, once");
  const weekStart = M.lifeDay.weekStartKeyOf(today);
  const key = M.types.questWeekKey(milestoneId, weekStart);
  const rows = await weekRowsOf(milestoneId);
  const ok = check(
    `Start froze exactly one set for the life week of ${weekStart} (source START, ${key})`,
    rows.length === 1 && rows[0].source === "START" && rows[0].dedupeKey === key && M.lifeDay.keyOfDateColumn(rows[0].weekStart) === weekStart,
    show(rows.map((r) => ({ source: r.source, key: r.dedupeKey })))
  );
  const issued = rows.length === 1 ? show(rows[0].quests) : null;
  if (rows.length === 1) info(`the set holds ${Array.isArray(rows[0].quests) ? rows[0].quests.length : "?"} quest(s)`);
  const fr = await M.quests.freezeWeekQuests(userId, new Date(), "RENDER");
  const again = await weekRowsOf(milestoneId);
  check(
    "a render's freeze after Start writes no second set and leaves the first as issued",
    again.length === 1 && (!ok || (again[0].id === rows[0].id && show(again[0].quests) === issued)),
    show({ run: fr, rows: again.length })
  );
  return again.length === 1 ? show(again[0].quests) : issued;
}

// ── 6 · A tick through the real completion core ──────────────────────────

async function stepTick(milestoneId: string, issued: string | null): Promise<void> {
  step("6", "one practice ticked through the completion core");
  M.cache.invalidateAll();
  const board = M.board.buildBoard(await M.tasks.loadTodayBoard(userId, today, new Date()));
  const row = must(
    "a practice is open on Today to tick",
    [...board.must, ...board.todayRows, ...board.anytime].find((r) => made.practiceIds.includes(r.template.id) && r.state === "open" && r.day === today),
    "none of the practices is open today"
  );
  const done = okOr("the practice is ticked (completeInstanceCore, today)", await M.tasks.completeInstanceCore(userId, row.template.id, { day: "today", now: new Date() }));
  made.tick = { instanceId: done.instanceId, templateId: row.template.id };
  check("…a fresh tick that paid like any task's (not a repeat)", !done.duplicate && done.day === today, show({ status: done.status, xp: done.receipt.xp, duplicate: done.duplicate }));
  info(`the tick paid ${done.receipt.xp} XP`);
  // What the tick action's after() runs (src/app/actions/tasks.ts): the roadmap's practice writer.
  await M.readings.recordPracticeForTemplate(userId, row.template.id, { now: new Date() });
  const measures = await M.prisma.roadmapMeasure.findMany({ where: { milestoneId, kind: "PRACTICE_KEPT" }, select: { measureKey: true, scope: true } });
  const measure = measures.find((x) => {
    const ids = (x.scope as { templateIds?: unknown } | null)?.templateIds;
    return Array.isArray(ids) && ids.includes(row.template.id);
  });
  const measureKey = must("the ticked practice is measured by the milestone (a PRACTICE_KEPT measure holds its task)", measure?.measureKey ?? null, show(measures));
  const reading = await M.prisma.roadmapReading.findFirst({
    where: { userId, measureKey, day: M.lifeDay.dateColumn(today) },
    orderBy: { observedAt: "desc" },
    select: { value: true, source: true, observedAt: true },
  });
  check("today's practice reading counts the tick (kept ≥ 1)", reading != null && reading.value >= 1, show(reading));
  const rows = await weekRowsOf(milestoneId);
  check("the week's frozen set is still as issued after the tick (progress is read live)", rows.length === 1 && (issued == null || show(rows[0].quests) === issued));
}

// ── 7 · Reached, and the pay written once ────────────────────────────────

async function payRowsOf(lineageId: string) {
  const [rows, mints] = await Promise.all([
    M.prisma.activityEvent.findMany({ where: { userId, source: "MILESTONE", dedupeKey: M.momentum.milestoneRowKey(lineageId) }, select: { id: true, xp: true, track: true, day: true } }),
    M.prisma.activityEvent.findMany({ where: { userId, source: "MP_MINT", dedupeKey: M.momentum.milestoneMintKey(lineageId) }, select: { id: true, qty: true, detail: true } }),
  ]);
  return { rows, mints };
}

async function stepReachAndPay(milestoneId: string, lineageId: string): Promise<void> {
  step("7", "the milestone reached, and its pay written exactly once");
  check(`momentum is live today (MOMENTUM_LAUNCH_DAY ${M.momentum.momentumLaunchDay() ?? "null"})`, M.momentum.momentumLive(today));
  const before = await payRowsOf(lineageId);
  check("no pay row exists for this milestone before its reach", before.rows.length === 0 && before.mints.length === 0, show(before));
  const reach = M.readings.reachOpOf(M.prisma, milestoneId, { kind: "reach", day: today }, null);
  const first = reach ? await reach : null;
  check("the reach rule's guarded write sets reachedDay (reachOpOf, as the readings writer applies it at g = 1)", first?.count === 1, show(first));
  const second = M.readings.reachOpOf(M.prisma, milestoneId, { kind: "reach", day: M.lifeDay.addDays(today, 1) }, null);
  check("…once: a second reach moves nothing (reachedDay is set where null, never moved)", (second ? (await second).count : -1) === 0);
  // The settle pays oldest first and stops at a row another writer got to first (the next render goes on), so a past
  // day's chest it opens on the way can take a run of its own: up to three, as three renders would.
  const runs: Awaited<ReturnType<Mods["momentumServer"]["settleMomentum"]>>[] = [];
  for (let i = 0; i < 3; i++) {
    runs.push(await M.momentumServer.settleMomentum(userId, today, { now: new Date() }));
    if ((await payRowsOf(lineageId)).rows.length > 0) break;
  }
  const s1 = runs[runs.length - 1];
  for (const r of runs) if (r.chests.length > 0) info(`the settle also opened the user's ready chest(s) for ${r.chests.join(", ")} (what any render would)`);
  check(
    "the momentum settle (what every render runs) is live and pays this milestone",
    s1.live && runs.some((r) => r.milestones.includes(lineageId)),
    show(runs.map((r) => ({ live: r.live, wrote: r.wrote, milestones: r.milestones })))
  );
  const paid = await payRowsOf(lineageId);
  check("exactly one MILESTONE row ('ms:<lineageId>') and one LIFE_MILESTONE mint", paid.rows.length === 1 && paid.mints.length === 1, show(paid));
  if (paid.rows[0]) info(`MILESTONE row: ${paid.rows[0].xp} XP to ${paid.rows[0].track}`);
  if (paid.mints[0]) info(`LIFE_MILESTONE mint: ${paid.mints[0].qty ?? 0} MP${paid.mints[0].qty ? "" : " (a 0 decision row: 2 milestones already paid in the last 30 days)"}`);
  const s2 = await M.momentumServer.settleMomentum(userId, today, { now: new Date() });
  const [s3, s4] = await Promise.all([M.momentumServer.settleMomentum(userId, today, { now: new Date() }), M.momentumServer.settleMomentum(userId, today, { now: new Date() })]);
  const after = await payRowsOf(lineageId);
  check(
    "a second settle and two at once write no more pay",
    after.rows.length === 1 && after.mints.length === 1 && ![s2, s3, s4].some((s) => s.milestones.includes(lineageId)),
    show({ rows: after.rows.length, mints: after.mints.length })
  );
}

// ── 8 · Cleanup ──────────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
  stepName = "8 cleanup";
  console.log("\n── 8 · cleanup: archive what this run created");
  M.cache.invalidateAll();
  if (made.tick) {
    const u = await M.tasks.undoCompletionCore(userId, made.tick.instanceId, new Date());
    check("the tick is undone (undoCompletionCore)", u.ok, u.ok ? "" : u.error);
  }
  if (made.roadmapId) await archiveGoal(made.roadmapId);
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  guard();
  M = await loadModules();
  const db = new URL(process.env.DATABASE_URL as string);
  console.log(`Database: ${db.hostname}:${db.port || "5432"}${db.pathname} (local) · run ${RUN}${KEEP ? " · --keep" : ""}${CLEAN ? " · --clean" : ""}`);

  const ready = await M.prisma.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('public."RoadmapQuestWeek"') IS NOT NULL AS ok`;
  if (!ready[0]?.ok) {
    console.error('The local database has no "RoadmapQuestWeek" table: apply the roadmap migrations to it first.');
    process.exitCode = 2;
    return;
  }
  const user = await defaultUser();
  if (!user) {
    console.error("No default user: set DEFAULT_USER_ID (the local database holds no single user to pick).");
    process.exitCode = 2;
    return;
  }
  userId = user;
  // Any stray getCurrentUserId() reads the same user.
  process.env.DEFAULT_USER_ID = userId;
  today = M.lifeDay.todayKey(new Date());
  console.log(
    `User ${userId} · life day ${today} · writes ${M.economy.lifeWritesEnabled() ? "on (XTNL_LIFE_JUDGE=1)" : "OFF"} · ROADMAP_GOALS_LIVE ${M.types.ROADMAP_GOALS_LIVE} in code`
  );
  if (!M.economy.lifeWritesEnabled()) {
    console.error("Writes are off in this process: nothing would be recorded.");
    process.exitCode = 2;
    return;
  }

  if (CLEAN) {
    stepName = "clean";
    const left = await rehearsalGoals(["DRAFT", "ACTIVE", "PAUSED"]);
    console.log(`\n── clean · ${left.length} open rehearsal goal(s)`);
    for (const g of left) await archiveGoal(g.id);
  } else {
    try {
      const { roadmapId, milestoneId } = await stepGoal();
      await stepShipped(roadmapId, milestoneId);
      const over = await stepSwitchOn(roadmapId, milestoneId);
      await stepStart(milestoneId, over);
      const issued = await stepWeekQuests(milestoneId);
      await stepTick(milestoneId, issued);
      await stepReachAndPay(milestoneId, made.lineageId as string);
    } catch (err) {
      if (err instanceof Abort) check("the rehearsal ran to its end", false, `stopped after: ${err.message}`);
      else check("the rehearsal ran to its end", false, err instanceof Error ? (err.stack ?? err.message) : String(err));
    }
    // The cleanup runs with the switch off again, as production reads it.
    delete process.env[M.types.ROADMAP_GOALS_LIVE_ENV];
    if (KEEP) {
      console.log(`\nKept: goal ${made.roadmapId ?? "-"}, milestone ${made.milestoneId ?? "-"}, goal task ${made.goalId ?? "-"}. Archive them with --clean.`);
      console.log("To see Start on a page, run the rehearsal server with XTNL_ROADMAP_GOALS_LIVE=1 set in the shell (dev-rehearsal.mjs passes it through).");
    } else {
      try {
        await cleanup();
      } catch (err) {
        check("the cleanup ran to its end", false, err instanceof Error ? (err.stack ?? err.message) : String(err));
      }
    }
    if (made.lineageId) {
      const pay = await payRowsOf(made.lineageId);
      if (pay.rows.length + pay.mints.length > 0) {
        console.log(
          `\nThe pay rows stay (the ledger is append-only): ${M.momentum.milestoneRowKey(made.lineageId)} (${pay.rows.map((r) => `${r.xp} XP`).join(", ")}) and ${M.momentum.milestoneMintKey(made.lineageId)} (${pay.mints.map((r) => `${r.qty ?? 0} MP`).join(", ")}), on the local database only.`
        );
      }
    }
  }

  console.log(`\nroadmap-rehearse: ${passed} passed, ${fails.length} failed`);
  for (const f of fails) console.log(`  FAIL ${f}`);
  process.exitCode = fails.length ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (M) await M.prisma.$disconnect();
  });
