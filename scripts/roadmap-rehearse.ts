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
 *   npx tsx scripts/roadmap-rehearse.ts --topics  # roadmap rework 1 (contracts §22.20 rulings N25–N33): a TOPICS plan from the
 *                                                 # recorded corpus replies, accepted with [Accept all], layer 1's Domains filled
 *                                                 # so the goal-less reach (N26) can be seen; then (rework 2, N34) a written map
 *                                                 # whose layer 1 holds eight topics, accepted as two parts; --keep and --clean as above
 *   npx tsx scripts/roadmap-rehearse.ts --dry     # no database: the recorded replies' builder alone, fed the chain's request
 *                                                 # shapes (what a check can run anywhere); the rest of this script is the lead's
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
 * --topics (roadmap rework 1, 2026-10-25; the same guard, the same user, the same local database, and still no model):
 *   T1 The goal: a TOPICS intake on the user's first Field (saveIntakeCore, planKind TOPICS, a chosen date 700 days out,
 *      20 new cards a week and 10 h typed, depth Familiar (6), 4 layers set), then [Break it down] (breakDownCore) and the page's own poll
 *      (advanceTopicChainCore until the chain is done), with the model's replies INJECTED from the recorded corpus packs
 *      exactly as roadmap-server-check injects them (scripts/fixtures/roadmap-corpus/probe-v5-P1/P3/P4/P5.json: RATE P1
 *      verbatim, MAP P3 verbatim or cut to the schema with code's milestone lines, LINK in P4's shape keyed by name,
 *      GROUND P5 verbatim or adapted to the batch). deps.callModel answers; the keys stay blank and ROADMAP_CHECK=1, so
 *      nothing could reach Gemini even if the injection were bypassed. A rerun may read RATE and MAP back from the run an
 *      earlier one stored (the chain's same-input reuse: no call), so those count 3 each or none.
 *      Why depth Familiar (rework 2, the lead's mirror run): the chain rebuilds the draft's milestones after each step with
 *      only layer 1 ticked (decision 64: from layer 2 on, you tick), so K = 1 and every layer-1 topic is the specialisation,
 *      dated to L* through the reach model on the user's own measured pass rate; at Retained (8) the mirror's history
 *      dated that past 3 years (layeredLadderOf TOO_FAR: "With these 1 layer, this map needs more than 3 years"), so no
 *      draft row was written and accept read "There's no draft to accept". Familiar dates every topic to level 6 only,
 *      the bar the gate, the layers' pay and the reach on cards read. When a rebuild is still refused, the run prints what
 *      the ladder read (topicLadderProbeOf: the chain per layer, L*, hours, new cards, the writing rate, the reach model's
 *      parameters) and the refusal's words.
 *   T2 [Accept all] under ruling N30: the sheet's own choices (topic-map-model acceptTopicChoicesOf with keepAll); a layer
 *      holding only not-checked names is first given one tap (chooseTopicCore on its first name, as the sheet's per-name
 *      tap does), since the server refuses it otherwise (ACCEPT_ALL_NOT_CHECKED); then acceptCore. The plan is ACTIVE and
 *      TOPICS, every layer a milestone, exactly `create` Domains made, none for an untapped not-checked name. Two ways the
 *      page itself gets a draft there: with no draft rows (a rebuild refused at K = 1), the shown names are ticked first
 *      as [Accept all] ticks them, deepest layer first (a layer-4 name's tick chooses its closure down to layer 1, so the
 *      first rebuild already reads K = 4 and spreads the specialisation); and while accept would refuse TOPIC_NAME_TAKEN
 *      (a Gemini name your library already holds, an earlier run's Domain included), each such row's offer is tapped
 *      (ruling N35: "Use your Domain «X»", useMyDomainCore).
 *   T3 The page as accepted: layer 1 is the current milestone with its topics short of 8 and no lock; layer 2 is locked
 *      on the whole layer before (ruling N27); with Start off the hero reads ADD_IDEA or STUDY for a layer-1 topic (ruling N28).
 *   T4 Cards: TOPIC_FLOOR_CARDS SHORT cards seeded at OPEN_LEVEL into each paying layer-1 topic's Domain (every part of
 *      the layer: layer 1 reaches only with all of them), then the real leveling core (recalculateLeveling). The idea core
 *      itself (submitIdea) embeds every card through Gemini, which this script never calls, and a card written at level 1
 *      would take weeks of reviews to reach level 6: so the rows are this script's own seed, tagged with the run, archived
 *      by the cleanup, and said so here.
 *   T5 The reach on cards alone (ruling N26): the readings chain as the cron runs it (recordRoadmapReadings, caller
 *      LIFE_CRON: no throttle) stamps reachedDay on each PLANNED layer-1 row with no goal (isCardsReachRow); the view reads
 *      it REACHED with reachedOnCards, the Aim rank unchanged, no pay row, layer 2 the current milestone and open, and the
 *      hero the study of a layer-2 topic.
 *   T6 Cleanup (skipped with --keep): the seeded cards archived, the roadmap archived (archiveRoadmapCore: a DRAFT is
 *      discarded). The Domains accept made stay in the library, as accept's Undo leaves them; they are named at the end.
 *   T7 A split layer (roadmap rework 2, ruling N34; no model: [Write the topics]): a second TOPICS goal on the same Field
 *      (after T6, so it takes the seat T1's goal gave back; with --keep it needs a free one), 2 layers set, eight topics
 *      you type in layer 1 and one in layer 2, accepted with [Accept all]'s choices. On the page: layer 1 is two LAYER
 *      rows (parts) of four, split as realism's layerSplitOf splits their equal needs, each titled with its own Domains
 *      and "· part i of 2", each paying only its own four topics; part 2 never locked on part 1, layer 2 locked on all
 *      eight; the hero on part 1's first topic. Then part 1's four Domains filled (T4's seed): part 1 reached on cards,
 *      layer 2 still locked (part 2 is not), part 2 the current milestone and the hero's. Archived after (as T6).
 *
 * Exit code: 0 when every check passed, 1 when any failed, 2 when the guard refused to run.
 */
import "./_no-model";
import type { DayKey } from "../src/lib/life-day";
import type { Intake, RoadmapView, StartChoices, TopicDepth, TopicRowView } from "../src/lib/roadmap-types";
import type { TopicLadderProbe } from "../src/lib/roadmap-server";

const KEEP = process.argv.includes("--keep");
const CLEAN = process.argv.includes("--clean");
/** Roadmap rework 1: the TOPICS rehearsal (steps T1–T6) instead of the Start rehearsal (steps 1–8). */
const TOPICS = process.argv.includes("--topics");
/** No database: the recorded replies' builder alone, on the chain's request shapes. */
const DRY = process.argv.includes("--dry");

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
  const [prismaMod, cache, lifeDay, economy, types, server, quests, readings, tasks, board, momentumServer, momentum, nextAction, topicModel, xp, leveling, topics, realism] = await Promise.all([
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
    import("../src/components/roadmap/topic-map-model"),
    import("../src/lib/xp"),
    import("../src/lib/leveling"),
    import("../src/lib/roadmap-topics"),
    import("../src/lib/roadmap-realism"),
  ]);
  return { prisma: prismaMod.prisma, cache, lifeDay, economy, types, server, quests, readings, tasks, board, momentumServer, momentum, nextAction, topicModel, xp, leveling, topics, realism };
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
  /** --topics: the cards this run seeded (archived by the cleanup), the Domains they went into, and the Domains accept made (left in the library, named). */
  seededIdeaIds: string[];
  seededDomainIds: string[];
  domainsMade: { id: string; name: string }[];
  /** --topics, T7: the split layer's goal (archived by its own cleanup). */
  splitRoadmapId: string | null;
  /** --topics: every layer-1 row of T1's plan (its parts, when split), for the reach on cards (T5). */
  layerOneIds: string[];
} = { roadmapId: null, milestoneId: null, lineageId: null, goalId: null, practiceIds: [], tick: null, seededIdeaIds: [], seededDomainIds: [], domainsMade: [], splitRoadmapId: null, layerOneIds: [] };

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

/** --topics: the cards seeded so far, archived by the cleanup that follows them (T6, then T7's own). */
let archivedSeeds = 0;

async function cleanup(step = TOPICS ? "T6" : "8", roadmapId: string | null = made.roadmapId): Promise<void> {
  stepName = `${step} cleanup`;
  console.log(`\n── ${step} · cleanup: archive what this run created`);
  M.cache.invalidateAll();
  if (made.tick) {
    const u = await M.tasks.undoCompletionCore(userId, made.tick.instanceId, new Date());
    check("the tick is undone (undoCompletionCore)", u.ok, u.ok ? "" : u.error);
  }
  if (made.seededIdeaIds.length > 0) {
    const a = await M.prisma.idea.updateMany({ where: { id: { in: made.seededIdeaIds }, isArchived: false }, data: { isArchived: true } });
    check(`the ${made.seededIdeaIds.length} seeded cards are archived (this run's own rows, by id)`, a.count === made.seededIdeaIds.length, show(a));
    for (const d of new Set([...made.domainsMade.map((x) => x.id), ...made.seededDomainIds])) await M.leveling.recalculateLeveling(d).catch(() => undefined);
    archivedSeeds += made.seededIdeaIds.length;
    made.seededIdeaIds = [];
    made.seededDomainIds = [];
  }
  if (roadmapId) await archiveGoal(roadmapId);
}

// ═══ --topics · roadmap rework 1: a TOPICS plan from the recorded replies, accepted, one Domain filled ═══════════════
//
// The replies come from probe stage 1 (scripts/fixtures/roadmap-corpus/probe-v5-P*.json, read, never edited), injected
// through deps.callModel exactly as roadmap-server-check's "names end to end" block injects them; no name, source or
// count is invented. The builder (recordedRepliesOf) is pure: --dry runs it with no database.

type Recorded = { raw: string; finishReason: string; usage: unknown };
type Term = { key: string; name: string };
type Support = { segment: { startIndex?: number; endIndex: number; text: string }; groundingChunkIndices: number[] };
type ModelRequest = import("../src/lib/roadmap-model").ModelRequest;
/** What roadmap-model's groundResponseOf takes (a recorded GROUND reply's parts, or the adapted shape built from one). */
type GroundPartsIn = Parameters<typeof import("../src/lib/roadmap-model").groundResponseOf>[0];

/** The recorded packs' aim and Area (P1 and P3 were sent for exactly these words); the rehearsal's aim carries the prefix the cleanup reads. */
const RECORDED_AIM = "Learn to run a household's investments and home loan, and keep the monthly budget on track";
const RECORDED_AREA = "Business & Finance";
const TOPICS_AIM = `${AIM_PREFIX}: ${RECORDED_AIM}`;
/** What each of P3's names builds on: the LINK reply's choice, by name (roadmap-server-check's table). */
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
/** Ruling N8's milestone lines for a layer key, as the check writes them (P3 predates them; a layer key in a line is a shape the strip removes). */
const STAGE_WORD: Readonly<Record<string, string>> = { L1: "budget", L2: "mortgage", L3: "portfolio", L4: "buffer", L5: "pension", L6: "legacy" };
const MILESTONE_OF = (l: string) => ({ title: `Stage ${STAGE_WORD[l] ?? l} of the household plan`, hurdle: `The ${STAGE_WORD[l] ?? l} hurdle`, target: `The ${STAGE_WORD[l] ?? l} target` });

/** The TOPICS intakes' depth (T1, T7): Familiar, every topic dated to level 6 (see T1's note in the header). */
const TOPICS_DEPTH: TopicDepth = 6;

/** A ladder probe (roadmap-server topicLadderProbeOf) in lines: its result first, then each layer, then what dated it. Pure. */
function probeLinesOf(p: TopicLadderProbe): string[] {
  const r = p.reach;
  return [
    p.result.ok ? `built ${p.result.rows} row(s), ${p.result.layerRows} of them layer milestones` : `refused: ${p.result.error}`,
    `K ${p.layers.length}: ${p.layers.map((l) => `layer ${l.layer} ${l.paying} paying of ${l.topics} (${l.held} held, ${l.known} known, ${l.deep} DEEP; floors ${l.floors.join("/") || "-"})`).join(" · ") || "no layer with a chosen topic"}`,
    `L* ${p.depth} · ${p.hoursPerWeek} h a week · ${p.newCardsPerWeek ?? "no"} new cards a week typed · ${p.dateMode} ${p.targetDay}`,
    `source rate ${p.sourceRate ?? "none"} new cards a week (the chain writes its pace share of it) · reach model ${r ? `p ${r.p}, pLong ${r.pLong}, c ${r.c}, rho ${r.rho}, m ${r.m}, strikes ${r.strikeLimit}, grace ${r.graceExtra}` : "none"} · priors standing in: ${p.calibrating.join(", ") || "none"}`,
  ];
}

/** [Accept all]'s ticks, as the rehearsal makes them one by one (T2, no draft rows): the deepest layer first, then the map's order within a layer. Pure. */
function deepestFirstOf<T extends Pick<TopicRowView, "key" | "layer">>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.layer - a.layer);
}

/** T7's typed topics: eight in layer 1 and one in layer 2, the run's own words (no Domain of the library holds them). Pure. */
function splitNamesOf(run: string): { layerOne: string[]; layerTwo: string } {
  return { layerOne: ["A", "B", "C", "D", "E", "F", "G", "H"].map((x) => `Split ${run} topic ${x}`), layerTwo: `Split ${run} deep topic` };
}

/** The four recorded packs, read from the corpus directory (never edited). */
async function readRecordedPacks() {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const recorded = (item: string) => JSON.parse(readFileSync(join(process.cwd(), "scripts/fixtures/roadmap-corpus", `probe-v5-${item}.json`), "utf8"));
  return { P1: recorded("P1"), P3: recorded("P3"), P4: recorded("P4"), P5: recorded("P5") };
}

/**
 * The injected model: RATE P1 verbatim; MAP P3 verbatim when the schema fits it (with code's milestone lines when asked),
 * else P3 cut to the schema's layers and maxItems; LINK in P4's shape (each child → the key of what it builds on,
 * enum-checked, else NONE); GROUND P5 verbatim for P5's own batch, else P5's shape over the batch. Pure: it reads the
 * packs and the request, and keeps its own counts.
 */
function recordedRepliesOf(packs: Awaited<ReturnType<typeof readRecordedPacks>>, groundResponseOf: (parts: GroundPartsIn) => unknown) {
  const { P1, P3, P4, P5 } = packs;
  const P3_REPLY = P3.replies[0] as Recorded & { parsed: { names: Record<string, { name: string; scope: string }[]> } };
  const P5_META = P5.parts.metadata as { groundingChunks: { web: { title: string; uri: string } }[]; groundingSupports: Support[]; webSearchQueries: string[] };
  const P5_TERMS = P5.terms as Term[];
  const P5_LINES = (P5.parts.parts[0].text as string).split("\n");
  const P5_CHUNKS = P5_META.groundingChunks;
  const p5SupportOf = (key: string) => P5_META.groundingSupports.find((s) => s.segment.text.startsWith(`${key}: `)) as Support;
  const P5_QUERY_TAIL = (() => {
    const q = P5_META.webSearchQueries[0];
    const t = P5_TERMS.find((x) => q.startsWith(x.name));
    return t ? q.slice(t.name.length) : "";
  })();
  const utf8 = (s: string) => new TextEncoder().encode(s).length;
  const groundReplyOf = (batch: readonly Term[]): { response: unknown; label: string } => {
    if (show(batch) === show(P5_TERMS)) return { response: groundResponseOf(P5.parts as GroundPartsIn), label: "P5 verbatim" };
    const lines: string[] = [];
    const supports: Support[] = [];
    let at = 0;
    batch.forEach((t, i) => {
      const own = P5_TERMS.findIndex((x) => x.name === t.name);
      const body = own >= 0 ? P5_LINES[own].replace(/^T\d+: /, "") : `${t.name} is a study topic in ${RECORDED_AREA}.`;
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
    return { response: groundResponseOf(parts as GroundPartsIn), label: "P5 adapted" };
  };
  const mapReplyOf = (req: ModelRequest): { reply: Recorded; label: string } => {
    const props = (req.responseSchema as { properties: Record<string, unknown> }).properties;
    const names = (props.names ?? { properties: {} }) as { properties: Record<string, { maxItems?: string }>; propertyOrdering?: string[] };
    const layers = names.propertyOrdering ?? Object.keys(names.properties);
    const recordedNames = P3_REPLY.parsed.names;
    const adapted = { names: Object.fromEntries(layers.filter((l) => recordedNames[l]).map((l) => [l, recordedNames[l].slice(0, Number(names.properties[l]?.maxItems ?? recordedNames[l].length))])) };
    const asked = (props.milestones as { propertyOrdering?: string[] } | undefined)?.propertyOrdering ?? null;
    const withMs = (body: object) => (asked ? { milestones: Object.fromEntries(asked.map((l) => [l, MILESTONE_OF(l)])), ...body } : body);
    const plus = asked ? " + milestones" : "";
    if (show(adapted) === show(P3_REPLY.parsed)) return { reply: asked ? { ...P3_REPLY, raw: JSON.stringify(withMs(P3_REPLY.parsed), null, 2) } : P3_REPLY, label: `P3 verbatim${plus}` };
    const max = layers.map((l) => names.properties[l]?.maxItems ?? "-").join("/");
    return { reply: { raw: JSON.stringify(withMs(adapted), null, 2), finishReason: P3_REPLY.finishReason, usage: P3_REPLY.usage }, label: `P3 adapted (${layers.join(" ")}; at most ${max})${plus}` };
  };
  let sent = 0;
  const replyOf = (r: Recorded) => ({ candidates: [{ content: { role: "model", parts: [{ text: r.raw }] }, finishReason: r.finishReason }], usageMetadata: r.usage, modelVersion: P1.model, responseId: `rec-${sent}` });
  const calls: Record<string, number> = {};
  const replies: string[] = [];
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
      const m = mapReplyOf(req);
      replies.push(`MAP: ${m.label}`);
      return replyOf(m.reply);
    }
    if (phase === "GROUND") {
      const batch = [...req.contents.matchAll(/^([STU]\d+) · (.+)$/gm)].map((m) => ({ key: m[1], name: m[2] }));
      const g = groundReplyOf(batch);
      replies.push(`GROUND: ${g.label} (${batch.length} terms)`);
      return g.response;
    }
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
  return { callModel, calls, replies };
}

/** --dry: the builder on the chain's four request shapes, with no database (a check can run this anywhere). */
async function dryRun(): Promise<void> {
  stepName = "dry";
  console.log("\n── dry · the recorded replies' builder on the chain's request shapes (no database, no model)");
  const { groundResponseOf } = await import("../src/lib/roadmap-model");
  const packs = await readRecordedPacks();
  const rec = recordedRepliesOf(packs, groundResponseOf);
  const req = (p: Partial<ModelRequest>): ModelRequest => ({ model: "recorded", systemInstruction: "", contents: "", responseSchema: null, seed: 1, maxOutputTokens: 1024, thinkingLow: true, abortSignal: new AbortController().signal, ...p });
  const text = (r: unknown) => (r as { candidates: { content: { parts: { text: string }[] } }[] }).candidates[0].content.parts[0].text;
  const rate = await rec.callModel(req({ responseSchema: { properties: { difficulty: {} } } }));
  check("RATE answers P1's reply verbatim (its parsed difficulty as recorded)", JSON.parse(text(rate)).difficulty === packs.P1.replies[0].parsed.difficulty, text(rate).slice(0, 80));
  const layers = ["L1", "L2", "L3", "L4"];
  const mapSchema = { properties: { milestones: { propertyOrdering: layers }, names: { propertyOrdering: layers, properties: Object.fromEntries(layers.map((l) => [l, { maxItems: "5" }])) } } };
  const map = JSON.parse(text(await rec.callModel(req({ responseSchema: mapSchema }))));
  check("MAP answers P3 verbatim for P3's own shape (4 layers, 5 a layer), with code's milestone lines in front", rec.replies[1] === "MAP: P3 verbatim + milestones" && show(map.names) === show(packs.P3.replies[0].parsed.names) && map.milestones.L1.title === MILESTONE_OF("L1").title, rec.replies[1]);
  const cut = JSON.parse(text(await rec.callModel(req({ responseSchema: { properties: { names: { propertyOrdering: ["L1", "L2"], properties: { L1: { maxItems: "2" }, L2: { maxItems: "2" } } } } } }))));
  check("MAP cuts P3 to a smaller schema (2 layers of 2) without inventing a name", rec.replies[2].startsWith("MAP: P3 adapted") && Object.keys(cut.names).join() === "L1,L2" && cut.names.L1.length === 2 && cut.names.L1.every((n: { name: string }) => packs.P3.replies[0].parsed.names.L1.some((r: { name: string }) => r.name === n.name)), rec.replies[2]);
  const linkReq = req({ contents: "T1 · Household Finance; T2 · Income and Expense Tracking; T3 · Loan Refinancing", responseSchema: { required: ["T2", "T3"], properties: { T2: { items: { enum: ["T1", "NONE"] } }, T3: { items: { enum: ["T1", "NONE"] } } } } });
  const link = JSON.parse(text(await rec.callModel(linkReq)));
  check("LINK answers in P4's shape: a child's recorded parent when the enum holds it, else NONE", show(link) === show({ T2: ["T1"], T3: ["NONE"] }), show(link));
  const terms = (packs.P5.terms as Term[]).map((t) => `${t.key} · ${t.name}`).join("\n");
  await rec.callModel(req({ googleSearch: true, contents: terms }));
  await rec.callModel(req({ googleSearch: true, contents: "T9 · Expense Categorization\nT10 · Household Finance" }));
  check("GROUND answers P5 verbatim for P5's own three terms and P5's shape for any other batch", rec.replies[4] === `GROUND: P5 verbatim (${(packs.P5.terms as Term[]).length} terms)` && rec.replies[5] === "GROUND: P5 adapted (2 terms)", rec.replies.slice(4).join(" | "));
  check("the builder counted one call a phase shape (RATE 1, MAP 2, LINK 1, GROUND 2)", show(rec.calls) === show({ RATE: 1, MAP: 2, LINK: 1, GROUND: 2 }), show(rec.calls));
  // Roadmap rework 2: the probe's lines, [Accept all]'s tick order (T2 with no draft rows) and T7's map, all pure.
  const probe: TopicLadderProbe = {
    layers: [{ layer: 1, topics: 3, paying: 3, held: 0, known: 0, deep: 3, floors: [25, 25, 25] }],
    depth: 8,
    hoursPerWeek: 10,
    newCardsPerWeek: 20,
    dateMode: "CHOSEN",
    targetDay: "2028-09-24" as DayKey,
    sourceRate: 20,
    reach: { p: 0.62, pLong: 0.6, c: 0.55, rho: 0.3, m: 1, strikeLimit: 3, graceExtra: 0 },
    calibrating: [],
    result: { ok: false, error: "With these 1 layer, this map needs more than 3 years at 10 h a week. Plan fewer layers, lower the depth, or raise your hours." },
  };
  const lines = probeLinesOf(probe);
  check(
    "the ladder probe prints the refusal first, then K with each layer's paying, held, known and DEEP topics and their floors, then L*, hours, new cards and the date, then the source rate and the reach model's parameters",
    lines.length === 4 &&
      lines[0] === `refused: ${probe.result.ok ? "" : probe.result.error}` &&
      lines[1] === "K 1: layer 1 3 paying of 3 (0 held, 0 known, 3 DEEP; floors 25/25/25)" &&
      lines[2] === "L* 8 · 10 h a week · 20 new cards a week typed · CHOSEN 2028-09-24" &&
      lines[3] === "source rate 20 new cards a week (the chain writes its pace share of it) · reach model p 0.62, pLong 0.6, c 0.55, rho 0.3, m 1, strikes 3, grace 0 · priors standing in: none",
    show(lines)
  );
  const ticks = deepestFirstOf([
    { key: "T2", layer: 2 },
    { key: "T9", layer: 4 },
    { key: "T3", layer: 2 },
    { key: "T7", layer: 3 },
  ]);
  check("[Accept all]'s ticks made one by one run deepest layer first, the map's order within a layer (a layer-4 tick's closure reaches layer 1: K at once)", show(ticks.map((t) => t.key)) === show(["T9", "T7", "T2", "T3"]), show(ticks));
  const split = splitNamesOf(RUN);
  const realism = await import("../src/lib/roadmap-realism");
  const t5 = await import("../src/lib/roadmap-types");
  const expected = realism.layerSplitOf(
    split.layerOne.map(() => t5.writeNeedOf(t5.TOPIC_FLOOR_CARDS, 0)),
    Math.ceil(split.layerOne.length / t5.TOPICS_PER_MILESTONE)
  );
  check(
    "T7's map: eight distinct layer-1 names of yours and one for layer 2, each within a topic's length, split as realism splits eight equal needs (4 and 4: ruling N34)",
    new Set(split.layerOne).size === 8 && [...split.layerOne, split.layerTwo].every((n) => n.length <= t5.TOPIC_LABEL_MAX) && show(expected) === show([4, 4]),
    show({ split, expected })
  );
}

// ── T1 · the TOPICS goal from the recorded replies ─────────────────────────

/** The user's Field for the rehearsal: the recorded Area by name when the library holds it, else the first Field by name. */
async function fieldForTopics(): Promise<{ id: string; name: string } | null> {
  const byName = await M.prisma.field.findFirst({ where: { name: RECORDED_AREA }, select: { id: true, name: true } });
  return byName ?? (await M.prisma.field.findFirst({ orderBy: { name: "asc" }, select: { id: true, name: true } }));
}

async function stepTopicsGoal(): Promise<{ roadmapId: string; replies: string[]; calls: Record<string, number> }> {
  step("T1", "a throwaway TOPICS goal: the intake, [Break it down] on the recorded replies, the page's poll to done");
  for (const old of await rehearsalGoals(["DRAFT", "ACTIVE", "PAUSED"])) {
    info(`an earlier run left goal ${old.id} ${old.status}: archiving it first`);
    await archiveGoal(old.id);
  }
  const field = must("a Field to break down in (the recorded Area by name, else the library's first)", await fieldForTopics());
  info(`Field ${field.name} (${field.id})`);
  const { groundResponseOf } = await import("../src/lib/roadmap-model");
  const rec = recordedRepliesOf(await readRecordedPacks(), groundResponseOf);
  const tasks: (() => Promise<void> | void)[] = [];
  // Every topic switch on for this process's cores (deps.topicSwitches; the build's constants are what they are), the key
  // "set" for the chain's own gate (ruling N11: the injected callModel answers for it), after() run by hand (settle).
  const deps: Parameters<Mods["server"]["breakDownCore"]>[3] = {
    callModel: rec.callModel,
    topicSwitches: { plans: true, rate: true, place: true, names: true, link: true, ground: true },
    hasKey: true,
    defer: (t) => tasks.push(t),
    clock: () => new Date(),
  };
  const settle = async () => {
    while (tasks.length) await (tasks.shift() as () => Promise<void> | void)();
  };
  const intake: Intake = {
    aim: TOPICS_AIM,
    fieldId: field.id,
    track: "CRAFT",
    domainIds: [],
    targetDay: M.lifeDay.addDays(today, 700),
    // Rework 2: 10 h and 20 new cards a week typed, at Familiar (6). Mastered (L12) at 5 h, and then Retained (L8) at
    // 10 h, dated the chain's K = 1 rebuilds (only layer 1 ticked while the chain runs) past 3 years on the mirror's
    // measured pass rate, so no draft row was written ("a topic step's milestones weren't rebuilt") and accept found
    // none. At 6 every topic is dated to the level the layers pay at; the probe below prints what the ladder read if
    // it still refuses.
    hoursPerWeek: 10,
    newCardsPerWeek: 20,
    typicalHours: null,
    typicalHoursSource: null,
    syllabus: null,
    startPoint: "BASICS",
    intensity: "STEADY",
    practicesAllowed: true,
    constraints: null,
    examLabel: null,
    dateMode: "CHOSEN",
    planKind: "TOPICS",
    topicDepth: TOPICS_DEPTH,
    depth: null,
    label: LABEL,
  };
  const saved = okOr("the goal is created in a free seat (saveIntakeCore: a TOPICS intake on the Field, 700 days, 20 new cards a week)", await M.server.saveIntakeCore(userId, intake, new Date(), deps, { createKey: `p14-topics-${RUN}` }));
  const roadmapId = saved.roadmapId;
  made.roadmapId = roadmapId;
  okOr("[Break it down] starts the chain (breakDownCore: RATE first, on the injected replies)", await M.server.breakDownCore(userId, roadmapId, new Date(), deps));
  await settle();
  okOr("your 4 layers set once RATE settled (setLayersCore SET 4: the pack P3 was recorded for)", await M.server.setLayersCore(userId, roadmapId, { kind: "SET", layers: 4 }, new Date(), deps));
  const polls: string[] = [];
  let done = false;
  for (let i = 0; i < 16; i++) {
    const v = await M.server.loadRoadmapView(userId, new Date(), deps, roadmapId);
    const chain = v.topicChain ?? null;
    polls.push(chain ? `${v.state} ${chain.phase ?? "-"}${chain.running ? " running" : ""}${chain.done ? " done" : ""}${chain.stop ? ` ${chain.stop}` : ""}` : `${v.state} (no chain)`);
    if (!chain || chain.done) {
      done = chain?.done === true && chain.stop == null;
      break;
    }
    const stepped = await M.server.advanceTopicChainCore(userId, roadmapId, false, new Date(), deps);
    if (!stepped.ok) {
      polls.push(`advance refused: ${stepped.error}`);
      break;
    }
    await settle();
  }
  // RATE and MAP are asked 3 times each, or read back from an earlier run's stored replies for the same inputs (the reuse: no call).
  const askedOrReused = (n: number | undefined) => n === 3 || n == null;
  check(
    "the page's poll runs RATE → MAP → LINK ∥ GROUND to done on the recorded replies (MAP: P3 verbatim with code's milestone lines; RATE and MAP asked 3 times each, or reused from an earlier run with the same inputs)",
    done && askedOrReused(rec.calls.RATE) && askedOrReused(rec.calls.MAP) && rec.calls.LINK === 3 && (rec.calls.GROUND ?? 0) >= 1 && rec.replies.filter((r) => r.startsWith("MAP")).every((r) => r === "MAP: P3 verbatim + milestones"),
    show({ polls, calls: rec.calls, replies: rec.replies })
  );
  if (rec.calls.RATE == null || rec.calls.MAP == null) info("RATE and MAP were read back from an earlier run's stored replies (the chain's same-input reuse): no call");
  for (const r of rec.replies) info(r);
  const named = await M.prisma.roadmapTopic.count({ where: { roadmapId, nameOrigin: "GEMINI", decision: { notIn: ["REMOVED", "MERGED"] } } });
  check("Gemini's names are on the draft map (RoadmapTopic rows with nameOrigin GEMINI)", named > 0, String(named));
  const rows = await draftRowCountOf(roadmapId);
  info(`the draft holds ${rows} milestone row(s) after the chain`);
  if (rows === 0) await printProbe(roadmapId, "the chain's last rebuild wrote no milestone row");
  return { roadmapId, replies: rec.replies, calls: rec.calls };
}

/** A TOPICS draft's milestone rows (DRAFT, at version + 1): none when every rebuild so far was refused. */
async function draftRowCountOf(roadmapId: string): Promise<number> {
  const r = await M.prisma.roadmap.findUnique({ where: { id: roadmapId }, select: { version: true } });
  return r ? M.prisma.roadmapMilestone.count({ where: { roadmapId, version: r.version + 1, status: { in: ["DRAFT", "LATER"] } } }) : 0;
}

/** What the ladder read when a rebuild refused (topicLadderProbeOf), in lines (probeLinesOf), and its words. */
async function printProbe(roadmapId: string, why: string): Promise<void> {
  const probe = await M.server.topicLadderProbeOf(userId, roadmapId, new Date(), topicsDeps());
  if (!probe) return info(`${why}; the ladder's inputs couldn't be read (no TOPICS draft)`);
  info(`${why}; what realism's layeredLadderOf read:`);
  for (const l of probeLinesOf(probe)) info(`  ${l}`);
}

// ── T2 · [Accept all] under ruling N30 ─────────────────────────────────────

async function stepAcceptAll(roadmapId: string): Promise<void> {
  step("T2", "[Accept all]: the shown names ticked, a not-checked name only by its own tap (ruling N30)");
  const deps = { topicSwitches: { plans: true, rate: true, place: true, names: true, link: true, ground: true } };
  const before = await M.server.loadRoadmapView(userId, new Date(), deps, roadmapId);
  const tm0 = must("the draft carries its topic map (DraftView.topicMap)", before.draft?.topicMap ?? null);
  const list = M.topicModel.acceptAllListOf(tm0);
  info(`the list: ${list.map((x) => `L${x.layer} ${x.names.length} name(s), ${x.links} link(s), ${x.unchecked?.length ?? 0} not checked`).join(" · ")}`);
  const bare = M.topicModel.acceptAllBareLayersOf(tm0, list);
  const untapped = list.flatMap((x) => (x.unchecked ?? []).map((u) => u.name));
  // A layer holding only not-checked names waits for a tap: the sheet's per-name tap is chooseTopic on that key.
  const tapped: string[] = [];
  for (const layer of bare) {
    const first = list.find((x) => x.layer === layer)?.unchecked?.[0];
    if (!first) continue;
    const t = await M.server.chooseTopicCore(userId, roadmapId, first.key, true, new Date(), deps);
    check(`layer ${layer} holds only not-checked names: its first (${first.key}) tapped as the sheet's checkbox taps it (chooseTopicCore)`, t.ok, t.ok ? "" : t.error);
    if (t.ok) tapped.push(first.name);
  }
  // No draft rows (every rebuild refused while only layer 1 was ticked): the shown names ticked first as [Accept all] ticks
  // them, deepest layer first, so the first tick's rebuild already reads K = layers (its closure chooses down to layer 1).
  if ((await draftRowCountOf(roadmapId)) === 0) {
    const tm1 = must("the map before the ticks", (await M.server.loadRoadmapView(userId, new Date(), deps, roadmapId)).draft?.topicMap ?? null);
    const ticks = deepestFirstOf(M.topicModel.acceptAllTickedOf(tm1, M.topicModel.acceptAllListOf(tm1)));
    info(`no draft row to accept: ticking the ${ticks.length} shown name(s) [Accept all] would tick, deepest layer first`);
    for (const t of ticks) {
      const r = await M.server.chooseTopicCore(userId, roadmapId, t.key, true, new Date(), deps);
      info(`tick ${t.key} (layer ${t.layer}): ${r.ok ? `chose ${r.value.chosen.length} more` : `refused: ${r.error}`}`);
    }
    const rows = await draftRowCountOf(roadmapId);
    if (rows === 0) await printProbe(roadmapId, "after the ticks the draft still holds no milestone row");
    must("the draft holds milestone rows to accept once the shown names are ticked", rows > 0 ? rows : null, "every rebuild was refused (the probe above says what realism read)");
  }
  // Ruling N35: a Gemini name your library already holds (an earlier run's Domain too) refuses accept (TOPIC_NAME_TAKEN)
  // until its row's offer is tapped, "Use your Domain «X»", as the page offers it (useMyDomainCore binds it).
  const taken = must("the map before accept", (await M.server.loadRoadmapView(userId, new Date(), deps, roadmapId)).draft?.topicMap ?? null);
  if (taken.acceptRefusal === M.types.TOPIC_NAME_TAKEN) {
    const sameName = taken.layers.flatMap((l) => l.topics).filter((r) => r.domainOffer && M.topics.formKeyOf(r.name) === M.topics.formKeyOf(r.domainOffer.name));
    for (const r of sameName) {
      const u = await M.server.useMyDomainCore(userId, roadmapId, r.key, (r.domainOffer as { id: string }).id, new Date(), deps);
      check(`«${r.name}» wears the name of your Domain «${r.domainOffer?.name}»: its offer tapped, as the row offers it (ruling N35, useMyDomainCore)`, u.ok, u.ok ? "" : u.error);
    }
  }
  const view = await M.server.loadRoadmapView(userId, new Date(), deps, roadmapId);
  const tm = must("the map after the taps", view.draft?.topicMap ?? null);
  const choices = M.topicModel.acceptTopicChoicesOf(tm, { keepAll: true, aftercare: null });
  const needsOver = tm.needsOver === true;
  const field = must("the plan's Field", await M.prisma.roadmap.findUnique({ where: { id: roadmapId }, select: { fieldId: true } }))?.fieldId ?? null;
  const domainsBefore = field ? await M.prisma.domain.findMany({ where: { fieldId: field }, select: { id: true, name: true } }) : [];
  info(`[Accept all] creates ${choices.create} Domain(s) (${choices.geminiNamed.length} named by Gemini)${needsOver ? ", over your hours or pace (kept on, as the sheet's switch defaults)" : ""}`);
  const accepted = await M.server.acceptCore(userId, roadmapId, { overAccepted: needsOver, topicMap: choices }, new Date(), deps);
  if (!accepted.ok) await printProbe(roadmapId, `accept refused ("${accepted.error}")`);
  const acc = okOr("the plan is accepted with the sheet's own choices (acceptCore, keepAll)", accepted);
  info(`version ${acc.version}`);
  const r = must("the accepted roadmap reads back", await M.prisma.roadmap.findUnique({ where: { id: roadmapId }, select: { status: true, version: true, planKind: true } }));
  check("the roadmap is ACTIVE and TOPICS", r.status === "ACTIVE" && r.planKind === "TOPICS", show(r));
  const domainsAfter = field ? await M.prisma.domain.findMany({ where: { fieldId: field }, select: { id: true, name: true } }) : [];
  const seen = new Set(domainsBefore.map((d) => d.id));
  made.domainsMade = domainsAfter.filter((d) => !seen.has(d.id));
  check(`exactly ${choices.create} Domain(s) made in the Field, as the confirm's first line says ("Creates n Domains")`, made.domainsMade.length === choices.create, show(made.domainsMade.map((d) => d.name)));
  const leaked = made.domainsMade.filter((d) => untapped.includes(d.name) && !tapped.includes(d.name));
  check("no Domain was made from a not-checked name without its own tap", leaked.length === 0, show(leaked.map((d) => d.name)));
  const rows = await M.prisma.roadmapMilestone.findMany({ where: { roadmapId, version: r.version, status: "PLANNED" }, orderBy: { ord: "asc" }, select: { id: true, lineageId: true, ord: true, chainRole: true, layer: true, title: true } });
  const layerRows = rows.filter((m) => m.chainRole === "LAYER");
  // A layer of more than six paying topics is its parts, rows of one layer in ord order (ruling N34): the layers read 1..K in order, each once or more.
  const layersInOrder = layerRows.map((m) => m.layer ?? 0).filter((l, i, a) => i === 0 || l !== a[i - 1]);
  check("every kept layer is a milestone (LAYER rows in order, a large layer as its parts), then the depth tail", layersInOrder.length >= 2 && layersInOrder.every((l, i) => l === i + 1), show(rows.map((m) => `${m.ord} ${m.chainRole} ${m.layer ?? ""}`)));
  made.milestoneId = layerRows[0]?.id ?? null;
  made.lineageId = layerRows[0]?.lineageId ?? null;
  made.layerOneIds = layerRows.filter((m) => m.layer === 1).map((m) => m.id);
}

// ── T3 · the page as accepted ──────────────────────────────────────────────

const topicsDeps = () => ({ topicSwitches: { plans: true, rate: true, place: true, names: true, link: true, ground: true } });

/** A layer-1 topic to fill (T4, T7): its Domain and name. */
type FillTopic = { domainId: string; name: string };

async function stepTopicsPage(roadmapId: string): Promise<FillTopic[]> {
  step("T3", "the accepted page: layer 1 current with its topics short of 8, layer 2 locked on it, the hero a layer-1 topic's study (Start off)");
  delete process.env[M.types.ROADMAP_GOALS_LIVE_ENV];
  const v = await M.server.loadRoadmapView(userId, new Date(), topicsDeps(), roadmapId);
  const cur = must("the current milestone", v.current);
  const l1 = v.milestones.find((m) => m.chainRole === "LAYER" && m.layer === 1);
  const l2 = v.milestones.find((m) => m.chainRole === "LAYER" && m.layer === 2);
  const made1 = new Set(made.domainsMade.map((d) => d.id));
  check(
    "layer 1 is the current milestone (its first part when split), PLANNED, no lock, its topics at n of 8 (0 on a Domain accept made; a Domain of yours already at 8 held when you began) (rulings N25, N27)",
    cur.milestone.id === l1?.id && cur.goalId == null && (cur.topics?.length ?? 0) > 0 && (cur.topics ?? []).every((t) => t.floor === M.types.TOPIC_FLOOR_CARDS && (t.held || t.skipped || !t.done) && (!t.domainId || !made1.has(t.domainId) || t.cards === 0)) && cur.lock == null,
    show({ ord: cur.milestone.ord, part: cur.part ?? null, topics: cur.topics?.map((t) => [t.name, t.cards, t.floor, t.held]), lock: cur.lock })
  );
  check("layer 2 is locked on the whole layer before (opensAfter 1; every parent short of cards, the gate's own list)", l2?.opensAfter === 1 && l2.lock != null && l2.lock.wholeLayer && l2.lock.parents.length > 0 && l2.lock.parents.some((p) => !p.met), show(l2?.lock));
  const hero = M.nextAction.nextActionOf(v).primary;
  check(
    "with Start off the hero is the study of a layer-1 topic: ADD_IDEA (no card due) to /add with its Domain preselected, or STUDY (a Domain of yours with cards due) to its review run (ruling N28)",
    (hero.kind === "ADD_IDEA" && hero.do.kind === "href" && /^\/add\?/.test(hero.do.href)) || (hero.kind === "STUDY" && hero.do.kind === "href" && /^\/review\?view=run&domain=/.test(hero.do.href)),
    show({ kind: hero.kind, label: hero.label, do: hero.do })
  );
  // Every paying topic of layer 1, each part's: layer 1 reaches only once all of them hold their floor.
  const fill = v.milestones
    .filter((m) => m.chainRole === "LAYER" && m.layer === 1)
    .flatMap((m) => m.topics ?? [])
    .filter((t) => t.domainId && !t.held && !t.skipped && !t.done)
    .map((t) => ({ domainId: t.domainId as string, name: t.name }));
  must("layer 1's paying topics with a Domain to fill", fill.length > 0 ? fill : null);
  return fill;
}

// ── T4 · cards into layer 1's Domains ───────────────────────────────────────

/** TOPIC_FLOOR_CARDS SHORT cards at OPEN_LEVEL into each Domain (this script's own rows, tagged with the run), then the real leveling core. */
async function seedCards(topics: readonly FillTopic[]): Promise<void> {
  const now = new Date();
  const level = M.types.OPEN_LEVEL;
  const base = M.xp.XP_BASE.SHORT;
  for (const { domainId, name } of topics) {
    const before = made.seededIdeaIds.length;
    for (let i = 1; i <= M.types.TOPIC_FLOOR_CARDS; i++) {
      const due = M.lifeDay.addDays(today, 7 + i);
      const row = await M.prisma.idea.create({
        data: {
          domainId,
          collectionLabel: "BOOK",
          level,
          basePoints: base,
          yieldPoints: base,
          question: `P14 rehearsal card ${i} of ${name}: what does this card stand for?`,
          questionType: "SHORT",
          answer: `A rehearsal card (run ${RUN})`,
          dueDate: new Date(`${due}T00:00:00.000Z`),
          graceEndsAt: M.xp.graceEndsAt(new Date(`${due}T00:00:00.000Z`), level),
          tags: ["rehearsal", `run:${RUN}`],
        },
        select: { id: true },
      });
      made.seededIdeaIds.push(row.id);
    }
    made.seededDomainIds.push(domainId);
    const lv = await M.leveling.recalculateLeveling(domainId, { now });
    const live = await M.prisma.idea.count({ where: { domainId, isArchived: false, level: { gte: level } } });
    check(`${name}: ${M.types.TOPIC_FLOOR_CARDS} cards seeded (no embedding: the rows never go through dedup or routing), so its Domain holds ${M.types.TOPIC_FLOOR_CARDS} live cards at level ${level} or above (the gate's count; Domain level ${lv.domainLevel})`, made.seededIdeaIds.length - before === M.types.TOPIC_FLOOR_CARDS && live >= M.types.TOPIC_FLOOR_CARDS, String(live));
  }
}

async function stepSeedCards(topics: readonly FillTopic[]): Promise<void> {
  step("T4", `${M.types.TOPIC_FLOOR_CARDS} cards at level ${M.types.OPEN_LEVEL} in each of layer 1's ${topics.length} paying Domain(s) (this script's own seed: the idea core would call Gemini to embed them)`);
  await seedCards(topics);
}

// ── T5 · the reach on cards alone ──────────────────────────────────────────

async function stepCardsReach(roadmapId: string, milestoneId: string, lineageId: string): Promise<void> {
  step("T5", "the readings chain stamps the goal-less reach on layer 1 (ruling N26); layer 2 opens; the hero moves on");
  M.cache.invalidateAll();
  const rankBefore = (await M.server.loadRoadmapView(userId, new Date(), topicsDeps(), roadmapId)).rank;
  const run = await M.readings.recordRoadmapReadings(userId, new Date(), { caller: "LIFE_CRON" });
  check("the chain ran for the goal (recordRoadmapReadings, caller LIFE_CRON: no throttle) and wrote readings", run.skipped == null && run.written > 0, show(run));
  const row = must("the layer-1 row reads back", await M.prisma.roadmapMilestone.findUnique({ where: { id: milestoneId }, select: { status: true, goalId: true, reachedDay: true, rankIndex: true, chainRole: true, feasibility: true } }));
  check("layer 1 reached on cards alone: reachedDay stamped on the PLANNED row with no goal (isCardsReachRow), nothing else changed", row.status === "PLANNED" && row.goalId == null && row.reachedDay != null && M.types.isCardsReachRow({ status: row.status, reachedDay: row.reachedDay, chainRole: row.chainRole, goalId: row.goalId, notes: M.readings.milestoneNotesOf(row.feasibility) }), show({ ...row, feasibility: undefined }));
  // Ruling N34: a layer of more than six paying topics is its parts; every part reaches on its own topics' cards.
  if (made.layerOneIds.length > 1) {
    const parts = await M.prisma.roadmapMilestone.findMany({ where: { id: { in: made.layerOneIds } }, select: { id: true, status: true, goalId: true, reachedDay: true } });
    check(`layer 1's ${made.layerOneIds.length} parts each reached on cards (PLANNED, no goal, reachedDay stamped)`, parts.length === made.layerOneIds.length && parts.every((m) => m.status === "PLANNED" && m.goalId == null && m.reachedDay != null), show(parts));
  }
  M.cache.invalidateAll();
  const v = await M.server.loadRoadmapView(userId, new Date(), topicsDeps(), roadmapId);
  const l1s = v.milestones.filter((m) => m.chainRole === "LAYER" && m.layer === 1);
  const l2 = v.milestones.find((m) => m.chainRole === "LAYER" && m.layer === 2);
  check("the rail reads layer 1 REACHED with reachedOnCards and no 'gave rank' line (each part, when split)", l1s.length > 0 && l1s.every((l1) => l1.state === "REACHED" && l1.reachedOnCards === true && l1.gaveRank == null), show(l1s.map((l1) => ({ state: l1.state, onCards: l1.reachedOnCards, gaveRank: l1.gaveRank }))));
  check("the Aim rank is as it was (a reach on cards gives no rank)", show(v.rank) === show(rankBefore), show({ before: rankBefore, after: v.rank }));
  check("layer 2 is the current milestone and open (no lock, opensAfter null)", v.current?.milestone.id === l2?.id && l2?.lock == null && l2?.opensAfter == null, show({ current: v.current?.milestone.ord, lock: l2?.lock, opensAfter: l2?.opensAfter }));
  const hero = M.nextAction.nextActionOf(v).primary;
  check("the hero moves on to a layer-2 topic (STUDY or ADD_IDEA, ruling N28), never Start", hero.kind === "STUDY" || hero.kind === "ADD_IDEA", show({ kind: hero.kind, label: hero.label }));
  const pay = await payRowsOf(lineageId);
  check("no pay row for the reach on cards (nothing paid, no mint)", pay.rows.length === 0 && pay.mints.length === 0, show(pay));
  const again = await M.readings.recordRoadmapReadings(userId, new Date(), { caller: "LIFE_CRON" });
  const row2 = await M.prisma.roadmapMilestone.findUnique({ where: { id: milestoneId }, select: { reachedDay: true } });
  check("a second run stamps nothing again (reachedDay set once)", again.reaches === 0 && show(row2?.reachedDay) === show(row.reachedDay), show({ again, day: row2?.reachedDay }));
}

// ── T7 · a split layer (ruling N34) ────────────────────────────────────────

async function stepSplit(): Promise<void> {
  step("T7", "a written map whose layer 1 holds eight topics, accepted as two parts: the rows, their titles, the gate across parts");
  const deps = topicsDeps();
  const field = must("a Field for the written map (T1's)", await fieldForTopics());
  const names = splitNamesOf(RUN);
  const intake: Intake = {
    aim: `${AIM_PREFIX}: a first layer too large for one milestone`,
    fieldId: field.id,
    track: "CRAFT",
    domainIds: [],
    targetDay: M.lifeDay.addDays(today, 700),
    hoursPerWeek: 10,
    newCardsPerWeek: 20,
    typicalHours: null,
    typicalHoursSource: null,
    syllabus: null,
    startPoint: "BASICS",
    intensity: "STEADY",
    practicesAllowed: true,
    constraints: null,
    examLabel: null,
    dateMode: "CHOSEN",
    planKind: "TOPICS",
    topicDepth: TOPICS_DEPTH,
    depth: null,
    label: "P14 split",
  };
  const saved = okOr("a second TOPICS goal in a free seat (saveIntakeCore; T1's goal archived first, unless --keep)", await M.server.saveIntakeCore(userId, intake, new Date(), deps, { createKey: `p14-split-${RUN}` }));
  const id = saved.roadmapId;
  made.splitRoadmapId = id;
  okOr("[Write the topics] writes the map with no model (writeTopicsCore)", await M.server.writeTopicsCore(userId, id, new Date(), deps));
  okOr("2 layers set (setLayersCore SET 2)", await M.server.setLayersCore(userId, id, { kind: "SET", layers: 2 }, new Date(), deps));
  for (const n of names.layerOne) okOr(`«${n}» typed in layer 1 (addTopicCore)`, await M.server.addTopicCore(userId, id, 1, n, new Date(), deps));
  okOr(`«${names.layerTwo}» typed in layer 2`, await M.server.addTopicCore(userId, id, 2, names.layerTwo, new Date(), deps));
  if ((await draftRowCountOf(id)) === 0) await printProbe(id, "the written map's rebuild wrote no milestone row");
  const tm = must("the written map (DraftView.topicMap)", (await M.server.loadRoadmapView(userId, new Date(), deps, id)).draft?.topicMap ?? null);
  check("the draft map reads layer 1 as two milestones (TopicLayerView.parts 2; nothing held large)", tm.layers.find((l) => l.layer === 1)?.parts === 2 && tm.layers.every((l) => l.large == null), show(tm.layers.map((l) => [l.layer, l.parts ?? 1, l.large ?? null])));
  const choices = M.topicModel.acceptTopicChoicesOf(tm, { keepAll: true, aftercare: null });
  const domainsBefore = new Set((await M.prisma.domain.findMany({ where: { fieldId: field.id }, select: { id: true } })).map((d) => d.id));
  const accepted = await M.server.acceptCore(userId, id, { overAccepted: tm.needsOver === true, topicMap: choices }, new Date(), deps);
  if (!accepted.ok) await printProbe(id, `accept refused ("${accepted.error}")`);
  okOr("the written map is accepted with [Accept all]'s choices (acceptCore)", accepted);
  const madeHere = (await M.prisma.domain.findMany({ where: { fieldId: field.id }, select: { id: true, name: true } })).filter((d) => !domainsBefore.has(d.id));
  made.domainsMade.push(...madeHere);
  check(`its ${choices.create} Domains made, one per topic you typed`, madeHere.length === choices.create && choices.create === names.layerOne.length + 1, show(madeHere.map((d) => d.name)));
  const r = must("the accepted roadmap reads back", await M.prisma.roadmap.findUnique({ where: { id }, select: { version: true } }));
  const rows = await M.prisma.roadmapMilestone.findMany({ where: { roadmapId: id, version: r.version, status: "PLANNED", chainRole: "LAYER" }, orderBy: { ord: "asc" }, select: { id: true, ord: true, layer: true, title: true } });
  const l1 = rows.filter((m) => m.layer === 1);
  const l2 = rows.filter((m) => m.layer === 2);
  const pays = await M.prisma.roadmapMeasure.findMany({ where: { milestoneId: { in: l1.map((m) => m.id) }, role: "PAYS", kind: "CARDS_AT_LEVEL" }, select: { milestoneId: true, topicLineageId: true } });
  const own = l1.map((m) => pays.filter((x) => x.milestoneId === m.id && x.topicLineageId).map((x) => x.topicLineageId as string));
  // The split realism makes of eight equal needs (each Domain new and empty: writeNeedOf at the floor), at most six a part.
  const expected = M.realism.layerSplitOf(
    names.layerOne.map(() => M.types.writeNeedOf(M.types.TOPIC_FLOOR_CARDS, 0)),
    Math.ceil(names.layerOne.length / M.types.TOPICS_PER_MILESTONE)
  );
  const all = own.flat();
  check(
    `layer 1 is two LAYER rows of one layer in ord order (no stored discriminator), ${expected.join(" and ")} topics as realism's layerSplitOf splits their equal needs, each paying only its own (disjoint, all eight between them); layer 2 one row`,
    l1.length === 2 && show(own.map((o) => o.length)) === show(expected) && new Set(all).size === all.length && all.length === names.layerOne.length && l2.length === 1,
    show({ rows: rows.map((m) => [m.ord, m.layer]), own: own.map((o) => o.length), expected })
  );
  check(
    "each part is titled by code over its own Domains, in the map's order, with its place («… · layer 1 of 2 · part 1 of 2», «… part 2 of 2»); layer 2 «… · layer 2 of 2»",
    l1[0]?.title.startsWith(`${names.layerOne[0]}, ${names.layerOne[1]}`) === true &&
      l1[0].title.endsWith("· layer 1 of 2 · part 1 of 2") &&
      l1[1]?.title.startsWith(`${names.layerOne[expected[0]]}, ${names.layerOne[expected[0] + 1]}`) === true &&
      l1[1].title.endsWith("· layer 1 of 2 · part 2 of 2") &&
      l2[0]?.title.endsWith("· layer 2 of 2") === true,
    show(rows.map((m) => m.title))
  );
  M.cache.invalidateAll();
  const v = await M.server.loadRoadmapView(userId, new Date(), deps, id);
  const parts = v.milestones.filter((m) => m.chainRole === "LAYER" && m.layer === 1);
  const deep = v.milestones.find((m) => m.chainRole === "LAYER" && m.layer === 2);
  const part1 = names.layerOne.slice(0, expected[0]);
  const part2 = names.layerOne.slice(expected[0]);
  check(
    "on the page: the rail's two layer-1 nodes read part 1 of 2 and 2 of 2 with their own topics; part 2 is never locked on part 1 (no lock, no opensAfter); layer 2 is locked on all eight (opensAfter 1, the whole layer)",
    show(parts.map((m) => m.part)) === show([{ i: 1, p: 2 }, { i: 2, p: 2 }]) &&
      show(parts.map((m) => (m.topics ?? []).map((t) => t.name))) === show([part1, part2]) &&
      parts[1]?.lock == null &&
      parts[1]?.opensAfter == null &&
      deep?.opensAfter === 1 &&
      deep.lock?.wholeLayer === true &&
      deep.lock.parents.length === names.layerOne.length,
    show({ parts: parts.map((m) => [m.part, m.lock, m.opensAfter]), deep: deep && [deep.opensAfter, deep.lock?.parents.length] })
  );
  const hero = M.nextAction.nextActionOf(v).primary;
  check(
    "the current milestone is part 1, and the hero (Start off) studies its first topic (ADD_IDEA: no card yet)",
    v.current?.milestone.id === parts[0]?.id && show(v.current?.part ?? null) === show({ i: 1, p: 2 }) && hero.kind === "ADD_IDEA" && hero.name === part1[0],
    show({ current: v.current?.milestone.title, part: v.current?.part, hero: [hero.kind, hero.label] })
  );
  // The gate across parts: part 1's four Domains filled, so part 1 reaches on cards; layer 2 waits on part 2 still.
  await seedCards((parts[0]?.topics ?? []).filter((t) => t.domainId).map((t) => ({ domainId: t.domainId as string, name: t.name })));
  const run = await M.readings.recordRoadmapReadings(userId, new Date(), { caller: "LIFE_CRON" });
  check("the readings chain ran (LIFE_CRON) and stamped part 1's reach", run.skipped == null && run.reaches >= 1, show(run));
  M.cache.invalidateAll();
  const w = await M.server.loadRoadmapView(userId, new Date(), deps, id);
  const parts2 = w.milestones.filter((m) => m.chainRole === "LAYER" && m.layer === 1);
  const deep2 = w.milestones.find((m) => m.chainRole === "LAYER" && m.layer === 2);
  const hero2 = M.nextAction.nextActionOf(w).primary;
  check(
    "part 1 reached on cards and part 2 not: layer 2 is still locked (opensAfter 1) on part 2's four topics alone, part 2 is the current milestone, and the hero studies its first topic",
    parts2[0]?.state === "REACHED" &&
      parts2[0].reachedOnCards === true &&
      parts2[1]?.state !== "REACHED" &&
      deep2?.opensAfter === 1 &&
      show((deep2.lock?.parents ?? []).filter((p) => !p.met).map((p) => p.name).sort()) === show([...part2].sort()) &&
      w.current?.milestone.id === parts2[1]?.id &&
      hero2.name === part2[0],
    show({ parts: parts2.map((m) => [m.state, m.reachedOnCards]), deep: deep2 && [deep2.opensAfter, (deep2.lock?.parents ?? []).filter((p) => !p.met).map((p) => p.name)], current: w.current?.milestone.title, hero: [hero2.kind, hero2.label] })
  );
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  guard();
  if (DRY) {
    console.log(`roadmap-rehearse --dry · run ${RUN} · no database is opened`);
    try {
      await dryRun();
    } catch (err) {
      check("the dry run ran to its end", false, err instanceof Error ? (err.stack ?? err.message) : String(err));
    }
    console.log(`\nroadmap-rehearse: ${passed} passed, ${fails.length} failed`);
    for (const f of fails) console.log(`  FAIL ${f}`);
    process.exitCode = fails.length ? 1 : 0;
    return;
  }
  M = await loadModules();
  const db = new URL(process.env.DATABASE_URL as string);
  console.log(`Database: ${db.hostname}:${db.port || "5432"}${db.pathname} (local) · run ${RUN}${TOPICS ? " · --topics" : ""}${KEEP ? " · --keep" : ""}${CLEAN ? " · --clean" : ""}`);

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
  } else if (TOPICS) {
    try {
      const { roadmapId } = await stepTopicsGoal();
      await stepAcceptAll(roadmapId);
      const fill = await stepTopicsPage(roadmapId);
      await stepSeedCards(fill);
      await stepCardsReach(roadmapId, made.milestoneId as string, made.lineageId as string);
    } catch (err) {
      if (err instanceof Abort) check("the topics rehearsal ran to its end", false, `stopped after: ${err.message}`);
      else check("the topics rehearsal ran to its end", false, err instanceof Error ? (err.stack ?? err.message) : String(err));
    }
    if (KEEP) {
      console.log(`\nKept: goal ${made.roadmapId ?? "-"} (${made.seededIdeaIds.length} seeded cards, ${made.domainsMade.length} Domains made at accept). Archive the goal and the cards with --topics --clean.`);
      console.log("To see it on a page, run the rehearsal server (docs/life-plan/dev-rehearsal.mjs) and open /you/roadmap, the Review hub and Today.");
    } else {
      try {
        await cleanup();
      } catch (err) {
        check("the cleanup ran to its end", false, err instanceof Error ? (err.stack ?? err.message) : String(err));
      }
    }
    // T7 (roadmap rework 2): after T6, so it takes the seat T1's goal gave back.
    try {
      await stepSplit();
    } catch (err) {
      if (err instanceof Abort) check("the split rehearsal ran to its end", false, `stopped after: ${err.message}`);
      else check("the split rehearsal ran to its end", false, err instanceof Error ? (err.stack ?? err.message) : String(err));
    }
    if (KEEP) console.log(`Kept: goal ${made.splitRoadmapId ?? "-"} (layer 1 as two parts; ${made.seededIdeaIds.length} seeded cards in all). Archive the goals with --topics --clean.`);
    else {
      try {
        await cleanup("T7", made.splitRoadmapId);
      } catch (err) {
        check("the split cleanup ran to its end", false, err instanceof Error ? (err.stack ?? err.message) : String(err));
      }
    }
    if (archivedSeeds > 0) console.log(`\nThe ${archivedSeeds} cards this run seeded are archived (by id; the Domains they went into recalculated).`);
    if (made.domainsMade.length > 0) console.log(`\nThe Domains accept made stay in the library, as accept's Undo leaves them: ${made.domainsMade.map((d) => d.name).join(", ")}.`);
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
