/**
 * M2 rehearsal (docs/life-plan/m2-refit.md F20 and Acceptance): the lead's scripted-clock run of
 * the real Duty cores against the LOCAL Docker rehearsal database (container xtnl-rehearsal on
 * localhost:55432) and nothing else. Run by the lead only, never by a subagent.
 *
 *   npx tsx scripts/duty-rehearse.ts           # rehearse, then delete the rows it wrote
 *   npx tsx scripts/duty-rehearse.ts --keep    # rehearse and keep its rows for inspection
 *   npx tsx scripts/duty-rehearse.ts --clean   # delete every row an earlier --keep run left, then stop
 *
 * Safety, before anything touches a database:
 *   - DATABASE_URL and DIRECT_URL must each be unset or point at localhost (or 127.0.0.1) port
 *     55432. Unset, both are set to the rehearsal database (dev-rehearsal.mjs's URL). Anything
 *     else is refused, and so is NODE_ENV=production (it would ignore XTNL_DUTY_LAUNCH_DAY).
 *     No .env file is loaded here, and process env beats .env in Prisma, so Supabase is never
 *     reached. Prisma and every core are imported only after the check passes.
 *   - Every row it writes belongs to a user id 'rehearse-duty:<run>:<scenario>'. It deletes rows
 *     by that prefix only: this run's at the end, every earlier run's with --clean.
 *   - It needs the life_duty migration on the rehearsal database and a regenerated Prisma
 *     client (`npx prisma generate`); it says so and stops when either is missing.
 *
 * The clock: every step sets XTNL_DUTY_LAUNCH_DAY (Mon 5 Oct 2026 here: a Monday after
 * LIFE_LAUNCH_DAY, with the 2026-10-04 DST start on the Sunday before it) and an explicit
 * `now`, and calls the cores with it: capture (createTemplateCore), completeInstanceCore,
 * undoCompletionCore, recordDayOpen, makeUpCore, undoMakeUpCore, acceptLossCore,
 * spendFreezeCore, settleYesterdayCore, declareRestCore, cancelRestCore, the rule cores,
 * settleLifeDays, maybeMaintainLife, runLifeCron, judgeClosedWeeks, the Settings 'Life only'
 * reset (resetKnowledgeBase) and the board read (loadTodayBoard). The days run from Sat 3 Oct
 * (the 23-hour life day before the DST start) to Wed 14 Oct, the judge's Wednesday for the
 * first Duty week: 12 life days, since the Duty week needs Mon to Wed + 9 and the DST start
 * and the pre-launch days sit before it. XTNL_LIFE_JUDGE=1 lets settlement and the judge write.
 *
 * Scenarios (one user each, so one scenario's rows never change another's verdicts):
 *   A  the main line: captures before launch; no settlement or freeze before launch or before
 *      the cursor; --apply on firstDutyDay + 1; a missed must shows no card and no break until
 *      04:00 on d + 2 (03:59 settles nothing); the card and the break at 04:00; a debited
 *      one-off refuses a tick and accept-loss refuses (setting off, then too young); a make-up
 *      on d + 2 restores the per-duty streak; its undo reopens the debt and leaves the day's
 *      streak units as before; a second make-up keys ':1'; settling twice writes nothing; two
 *      settles at once leave one row per key; 'Settle yesterday' shows the card at once and
 *      then refuses a yesterday tick and an undo with the settled message; the cron after the
 *      early settle writes nothing (and answers 401 without the secret); a make-up on d + 3
 *      clears the debt and the streak stays broken; the M5 judge judges the pre-launch week on
 *      its Wednesday; on the Duty week's Wednesday BODY, CRAFT and CARE are judged while
 *      settlement is held back and DUTY waits; Full days are recorded on settlement and paid
 *      after the kept tracks, inside the cap, when DUTY is judged.
 *   B  a no-activity day with a live streak: the freeze earned on the 7th active day is spent
 *      automatically; the board's 'a freeze will cover it' shows the day before.
 *   C  a declared rest day: no freeze spent, its must excused, the streak held; an 8-day
 *      settlement in two chunks; a manual freeze refused for an active yesterday.
 *   D  'Use a freeze for Monday', then a record of Monday refused (frozen), then the early
 *      settle: exactly one FREEZE_USE.
 *   I  the manual spend and the early settle racing at balance 1: exactly one FREEZE_USE.
 *   E  a 'Life only' reset after launch, then a capture: the cursor starts at the new epoch − 1,
 *      settlement and the judge keep running from it, nothing older is written.
 *   F  --apply run before the launch Monday (what the old F20 wording allowed): every
 *      pre-launch tick, record and undo stays allowed, and on the launch Monday the last
 *      pre-Duty Sunday can still be recorded (settledFor's floor).
 *   G  a reset between an early --apply and the launch: the new row has no cursor; --apply is
 *      held until firstDutyDay + 1 and then switches settlement on.
 *   H  the akrasia horizon on the database: an un-flag before launch is immediate, after
 *      launch it waits 7 days, a second weakening is refused, 'Keep it' clears it, 'Even on
 *      rest days' on is immediate with its prior segment, off waits.
 *
 * It replicates one write instead of running a script: duty-launch.ts --apply (one conditional
 * update, settledThroughDay = firstDutyDay − 1 WHERE settledThroughDay IS NULL), because that
 * script reads the real clock and runs on import.
 */
import { DAY_START_HOUR, LIFE_TZ, addDays, dateColumn, dayEndOf, dayStartOf, daysBetween, keyOfDateColumn, todayKey, weekKeyOf, type DayKey } from "../src/lib/life-day";
import {
  DUTY_LAUNCH_DAY_ENV,
  debtKey,
  dutyLaunchDay,
  firstDutyDay,
  freezeEarnKey,
  freezeUseKey,
  fullDayKey,
  fullDayMintKey,
  repaidKey,
} from "../src/lib/duty-economy";

const KEEP = process.argv.includes("--keep");
const CLEAN = process.argv.includes("--clean");

/** The rehearsal database (docs/life-plan/dev-rehearsal.mjs). */
const LOCAL_DB = "postgresql://postgres:rehearsal@localhost:55432/postgres";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const LOCAL_PORT = "55432";
/** Every rehearsal user id starts with this; nothing else is ever deleted. */
const TAG = "rehearse-duty:";
const RUN = Date.now().toString(36);

// ── The days ─────────────────────────────────────────────────────────────

/** The rehearsal's Duty launch Monday. */
const L: DayKey = "2026-10-05";
const SAT3 = addDays(L, -2);
const SUN4 = addDays(L, -1);
const MON5 = L;
const TUE6 = addDays(L, 1);
const WED7 = addDays(L, 2);
const THU8 = addDays(L, 3);
const FRI9 = addDays(L, 4);
const SAT10 = addDays(L, 5);
const SUN11 = addDays(L, 6);
const MON12 = addDays(L, 7);
const TUE13 = addDays(L, 8);
const WED14 = addDays(L, 9);
const W40 = weekKeyOf(SUN4);
const W41 = weekKeyOf(L);

// ── The database guard (before any import that loads Prisma) ─────────────

function localUrlProblem(name: "DATABASE_URL" | "DIRECT_URL"): string | null {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") {
    process.env[name] = LOCAL_DB;
    return null;
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return `${name} is not a URL.`;
  }
  if (!/^postgres(ql)?:$/.test(u.protocol)) return `${name} is not a postgres URL.`;
  if (!LOCAL_HOSTS.has(u.hostname) || u.port !== LOCAL_PORT) {
    return `${name} points at ${u.hostname}:${u.port || "5432"}, not the rehearsal database (localhost:${LOCAL_PORT}).`;
  }
  return null;
}

function guard(): void {
  const problems = [localUrlProblem("DATABASE_URL"), localUrlProblem("DIRECT_URL")].filter((p): p is string => p != null);
  if (process.env.NODE_ENV === "production") problems.push("NODE_ENV is production: XTNL_DUTY_LAUNCH_DAY would be ignored.");
  if (problems.length > 0) {
    console.error("Refusing to run: this rehearsal writes, and only to the local rehearsal database.");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(2);
  }
  // Writes on read (settlement, the judge) for this process only; the M5 launch day fixed at production's.
  process.env.XTNL_LIFE_JUDGE = "1";
  process.env.XTNL_LIFE_LAUNCH_DAY = "2026-10-01";
  // No model calls; any stray getCurrentUserId() lands on a rehearsal user, never the real one.
  process.env.GEMINI_API_KEY = "";
  process.env.DEFAULT_USER_ID = `${TAG}${RUN}:default`;
  delete process.env.PRISMA_COUNT_QUERIES;
}

async function loadModules() {
  const [prismaMod, tasks, duty, settlement, weeks, streak, reset, scopes, cache, board, economy, parse, rule] = await Promise.all([
    import("../src/lib/prisma"),
    import("../src/lib/tasks"),
    import("../src/lib/duty"),
    import("../src/lib/settlement"),
    import("../src/lib/life-weeks-server"),
    import("../src/lib/streak"),
    import("../src/app/actions/reset"),
    import("../src/lib/reset-scopes"),
    import("../src/lib/cache"),
    import("../src/lib/today-board"),
    import("../src/lib/life-economy"),
    import("../src/lib/capture-parse"),
    import("../src/lib/duty-rule"),
  ]);
  return { prisma: prismaMod.prisma, tasks, duty, settlement, weeks, streak, reset, scopes, cache, board, economy, parse, rule };
}
type Mods = Awaited<ReturnType<typeof loadModules>>;
let M!: Mods;

// ── Checks ───────────────────────────────────────────────────────────────

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

let scenario = "";
const fails: string[] = [];
let passed = 0;

function check(name: string, ok: boolean, detail = ""): boolean {
  if (ok) passed += 1;
  else fails.push(`${scenario} · ${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`    ${ok ? "PASS" : "FAIL"} ${name}${detail && !ok ? ` — ${detail}` : ""}`);
  return ok;
}

/** A step the rest of its scenario depends on failed: the scenario stops, the others still run. */
class Abort extends Error {}

function okOr<T>(name: string, r: Result<T>): T {
  check(name, r.ok, r.ok ? "" : r.error);
  if (!r.ok) throw new Abort(name);
  return r.value;
}

function refused(name: string, r: Result<unknown>, why?: RegExp): void {
  check(name, !r.ok && (why == null || why.test(r.error)), r.ok ? "it went through" : r.error);
}

function must<T>(name: string, v: T | null | undefined): T {
  check(name, v != null, "missing");
  if (v == null) throw new Abort(name);
  return v;
}

const show = (x: unknown) => JSON.stringify(x);

// ── The clock ────────────────────────────────────────────────────────────

let NOW = new Date(0);

/** hh:mm on the life day `day`: from 04:00 on its date to 03:59 on the next morning (a DST day is 23 or 25 hours). */
function at(day: DayKey, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  if (h >= DAY_START_HOUR) return new Date(dayStartOf(day).getTime() + ((h - DAY_START_HOUR) * 60 + m) * 60_000);
  return new Date(dayStartOf(addDays(day, 1)).getTime() - ((DAY_START_HOUR - h) * 60 - m) * 60_000);
}

/** Sets the launch day and the clock for the next calls, and drops the process cache (the rehearsal reads the database, not a TTL). */
function step(day: DayKey, hhmm: string, what: string, launch: DayKey | null = L): Date {
  if (launch) process.env[DUTY_LAUNCH_DAY_ENV] = launch;
  else delete process.env[DUTY_LAUNCH_DAY_ENV];
  NOW = at(day, hhmm);
  if (todayKey(NOW) !== day) throw new Error(`clock: ${hhmm} on ${day} reads as ${todayKey(NOW)}`);
  M.cache.invalidateAll();
  console.log(`  ${day} ${hhmm}${launch ? "" : " (no launch day)"} · ${what}`);
  return NOW;
}

// ── Helpers over the real cores ──────────────────────────────────────────

const userOf = (s: string) => `${TAG}${RUN}:${s}`;
const NAMES = new Map<string, string>();
const nameOf = (tpl: string) => NAMES.get(tpl) ?? tpl;

async function capture(u: string, line: string): Promise<string> {
  const parsed = M.parse.parseCapture(line, { today: todayKey(NOW) });
  try {
    const created = await M.tasks.createTemplateCore(u, parsed, { rawText: line, captureSource: "quick", now: NOW });
    NAMES.set(created.id, parsed.title);
    return created.id;
  } catch (err) {
    check(`capture '${line}'`, false, err instanceof Error ? err.message : String(err));
    throw new Abort(`capture '${line}'`);
  }
}

function tick(u: string, tpl: string, day: "today" | "yesterday" = "today") {
  return M.tasks.completeInstanceCore(u, tpl, { day, now: NOW });
}

/** A day's routine: the board opens with nothing due (the quest's target is 0), then each tick. */
async function doDay(u: string, tpls: readonly string[]): Promise<void> {
  await M.tasks.recordDayOpen(u, 0, NOW);
  for (const t of tpls) okOr(`tick ${nameOf(t)} on ${todayKey(NOW)}`, await tick(u, t));
}

async function templateOf(id: string) {
  return M.prisma.taskTemplate.findUnique({
    where: { id },
    select: { kind: true, recurrence: true, compulsory: true, compulsoryOnRest: true, dueDay: true, dueKind: true, inbox: true, pendingChange: true },
  });
}

async function instancesOf(u: string, tpl: string, day: DayKey) {
  return M.prisma.taskInstance.findMany({
    where: { userId: u, templateId: tpl, day: dateColumn(day) },
    orderBy: { slot: "asc" },
    select: { id: true, slot: true, status: true, source: true, debtOpen: true, debtXp: true, repaired: true, judgedAt: true },
  });
}

async function keysOf(u: string, prefix: string): Promise<string[]> {
  const rows = await M.prisma.activityEvent.findMany({ where: { userId: u, dedupeKey: { startsWith: prefix } }, select: { dedupeKey: true } });
  return rows.map((r) => r.dedupeKey ?? "");
}

async function rowCounts(u: string): Promise<{ events: number; instances: number }> {
  const [events, instances] = await Promise.all([
    M.prisma.activityEvent.count({ where: { userId: u } }),
    M.prisma.taskInstance.count({ where: { userId: u } }),
  ]);
  return { events, instances };
}

async function settingsOf(u: string): Promise<{ epochDay: DayKey; cursor: DayKey | null } | null> {
  const s = await M.prisma.lifeSettings.findUnique({ where: { userId: u }, select: { epochDay: true, settledThroughDay: true } });
  return s ? { epochDay: keyOfDateColumn(s.epochDay), cursor: s.settledThroughDay ? keyOfDateColumn(s.settledThroughDay) : null } : null;
}

async function boardOf(u: string) {
  M.cache.invalidateAll();
  const data = await M.tasks.loadTodayBoard(u, todayKey(NOW), NOW);
  return { data, board: M.board.buildBoard(data) };
}
type BoardRead = Awaited<ReturnType<typeof boardOf>>;
const cardOf = (b: BoardRead, tpl: string, day: DayKey) => b.data.duty?.owed.find((c) => c.templateId === tpl && c.day === day) ?? null;
const keptRun = (b: BoardRead, tpl: string) => b.data.stats[tpl]?.streak.before.kept ?? -1;

async function streakOf(u: string) {
  const facts = await M.streak.readStreakFacts(u, NOW);
  return { facts, s: M.streak.dailyStreakOf(facts) };
}
const unitsOn = (facts: { rows: readonly { day: DayKey; units: number }[] }, day: DayKey) => facts.rows.find((r) => r.day === day)?.units ?? 0;
/** held7Days index of `day` (oldest first, today last). */
const held7 = (s: { held7Days: boolean[] }, day: DayKey) => s.held7Days[6 - daysBetween(day, todayKey(NOW))] ?? false;

function settle(u: string, opts: Parameters<Mods["settlement"]["settleLifeDays"]>[2] = {}) {
  return M.settlement.settleLifeDays(u, NOW, opts);
}

/** F20's rule for --apply: on firstDutyDay + 1 or later, by the launch script's own test (settlement.ts launchApplyTooEarly). */
function applyAllowed(today: DayKey, first: DayKey): boolean {
  return M.settlement.launchApplyTooEarly(today, first) == null;
}

/**
 * duty-launch.ts --apply's one write, replicated (that script reads the real clock and runs on
 * import): settledThroughDay = firstDutyDay(epochDay) − 1 WHERE settledThroughDay IS NULL.
 * Returns the rows written (0 or 1).
 */
async function applyLaunchCursor(u: string): Promise<number> {
  const s = await settingsOf(u);
  const first = s ? firstDutyDay(s.epochDay, dutyLaunchDay()) : null;
  if (!s || !first) return 0;
  const r = await M.prisma.lifeSettings.updateMany({ where: { userId: u, settledThroughDay: null }, data: { settledThroughDay: dateColumn(addDays(first, -1)) } });
  M.cache.invalidateAll();
  return r.count;
}

/** The Settings 'Life only' reset, as the signed-in user u (the action reads DEFAULT_USER_ID). */
async function lifeReset(u: string) {
  const before = process.env.DEFAULT_USER_ID;
  process.env.DEFAULT_USER_ID = u;
  try {
    return await M.reset.resetKnowledgeBase("life", M.scopes.RESET_SCOPES.life.phrase);
  } finally {
    process.env.DEFAULT_USER_ID = before;
    M.cache.invalidateAll();
  }
}

/** The MP_MINT and WEEK rows of one week, with when they were written (occurredAt is the scripted clock). */
async function weekRows(u: string, weekKey: string) {
  const rows = await M.prisma.activityEvent.findMany({
    where: { userId: u, source: { in: ["WEEK", "MP_MINT"] } },
    select: { source: true, dedupeKey: true, qty: true, day: true, occurredAt: true },
  });
  const monday = addDays(L, (Number(weekKey.slice(6)) - Number(W41.slice(6))) * 7);
  const sunday = addDays(monday, 6);
  const inWeek = rows.filter((r) => {
    const d = keyOfDateColumn(r.day);
    return d >= monday && d <= sunday;
  });
  const weekKeys = new Set(inWeek.filter((r) => r.source === "WEEK").map((r) => r.dedupeKey ?? ""));
  return {
    has: (track: string) => weekKeys.has(M.economy.weekRowKey(track as Parameters<Mods["economy"]["weekRowKey"]>[0], weekKey)),
    trackMints: inWeek.filter((r) => r.source === "MP_MINT" && (r.dedupeKey ?? "").startsWith("mp:LIFE_WEEK_KEPT:")),
    fullDayMints: inWeek.filter((r) => r.source === "MP_MINT" && (r.dedupeKey ?? "").startsWith("mp:LIFE_FULL_DAY:")),
    cappedMp: inWeek.filter((r) => r.source === "MP_MINT").reduce((s, r) => s + (r.qty ?? 0), 0),
  };
}

// ── Scenario A: the main line ────────────────────────────────────────────

async function scenarioA(): Promise<void> {
  const u = userOf("A");

  step(SAT3, "09:00", "no launch day set: rest is refused", null);
  refused("rest is refused while no launch day is set", await M.duty.declareRestCore(u, MON5, NOW), /hasn't started/);

  step(SAT3, "10:00", "captures before launch (Sat 3 Oct is the 23-hour life day before the DST start)");
  check("Sat 3 Oct is a 23-hour life day (Sydney's DST starts at 02:00 on Sun 4 Oct)", LIFE_TZ !== "Australia/Sydney" || dayEndOf(SAT3).getTime() - dayStartOf(SAT3).getTime() === 23 * 3_600_000, LIFE_TZ);
  const S = await capture(u, "stretch 15m daily !");
  const Dsh = await capture(u, "dishes 15m daily !");
  const W = await capture(u, "write chapter 60m daily #craft");
  const R = await capture(u, "read 20m daily #care");
  const O = await capture(u, "pay rent tue !");
  const tS = await templateOf(S);
  const tO = await templateOf(O);
  check("'stretch 15m daily !' is a daily must habit", tS?.kind === "HABIT" && tS.recurrence === "DAILY" && tS.compulsory === true, show(tS));
  check("'pay rent tue !' is a must deadline one-off due Tue 6 Oct", tO?.compulsory === true && tO.dueKind === "DEADLINE" && tO.dueDay != null && keyOfDateColumn(tO.dueDay) === TUE6, show(tO));
  const s0 = await settingsOf(u);
  check("a LifeSettings row made before launch: epoch Sat 3, no cursor (newLifeSettingsData)", s0?.epochDay === SAT3 && s0.cursor === null, show(s0));
  // The M5 launch marker (life-launch.ts --apply step 4), so page-load judging runs for this user as for the live account.
  await M.prisma.masteryLedgerEntry.create({
    data: { userId: u, delta: 0, reason: M.economy.DECAY_GRACE_REASON, detail: M.weeks.launchGraceDetail(must("the M5 launch day", M.economy.lifeLaunchDay())) },
  });
  await doDay(u, [S, Dsh, W]);
  const b0 = await boardOf(u);
  check("before launch the board's Duty part is not live and names the launch day", b0.data.duty?.live === false && b0.data.duty?.launchDay === L, show({ live: b0.data.duty?.live, launchDay: b0.data.duty?.launchDay }));
  refused("rest for a day before the launch day is refused", await M.duty.declareRestCore(u, SUN4, NOW), /Duty starts/);
  okOr("rest for the launch Monday can be declared ahead (decision 2)", await M.duty.declareRestCore(u, MON5, NOW));
  const cancelled = okOr("and cancelled before it starts", await M.duty.cancelRestCore(u, MON5, null, NOW));
  check("the cancel names the launch Monday", cancelled.cancelled.includes(MON5), show(cancelled));

  step(SUN4, "10:00", "the DST start; still before launch");
  await doDay(u, [S, Dsh, W]);
  refused("settlement is refused before launch", { ok: false, error: (await settle(u)).refused ?? "(it ran)" }, /Duty starts/);
  refused("a freeze is refused before launch", await M.duty.spendFreezeCore(u, NOW), /Duty starts/);

  step(MON5, "10:00", "the launch day");
  await doDay(u, [S, Dsh, W]);
  const rNoCursor = await settle(u);
  check("settlement writes nothing while the cursor is null (before --apply)", !rNoCursor.wrote && /not switched on/.test(rNoCursor.refused ?? ""), show(rNoCursor.refused));
  refused("'Settle yesterday' is refused on the launch day (Sunday carried no stakes)", await M.duty.settleYesterdayCore(u, NOW), /before Duty started/);
  refused("a freeze for the pre-Duty Sunday is refused", await M.duty.spendFreezeCore(u, NOW), /before Duty started/);
  check("on the launch day the board's Duty part is live", (await boardOf(u)).data.duty?.live === true);

  step(TUE6, "10:00", "Stretch and the rent are missed");
  await doDay(u, [Dsh, W]);
  step(TUE6, "12:00", "the launch script's --apply on firstDutyDay + 1");
  check("F20: --apply is allowed today (firstDutyDay + 1)", applyAllowed(TUE6, L));
  check("--apply writes the cursor once", (await applyLaunchCursor(u)) === 1);
  check("a second --apply writes nothing", (await applyLaunchCursor(u)) === 0);
  check("the cursor is firstDutyDay − 1 (Sun 4)", (await settingsOf(u))?.cursor === SUN4);

  step(WED7, "04:00", "04:00 on Mon + 2: Monday settles");
  const rMon = await settle(u);
  check("Monday is settled", rMon.wrote && rMon.cursorAfter === MON5, show({ wrote: rMon.wrote, cursor: rMon.cursorAfter, refused: rMon.refused }));
  const judgedEarly = await M.prisma.taskInstance.count({ where: { userId: u, judgedAt: { not: null }, day: { lt: dateColumn(MON5) } } });
  check("no instance before the first Duty day is judged", judgedEarly === 0, String(judgedEarly));
  const preLaunchRows = await M.prisma.activityEvent.count({
    where: { userId: u, day: { lt: dateColumn(MON5) }, source: { in: ["DEBT", "FREEZE_EARN", "FREEZE_USE", "REPAIR", "FULL_DAY"] } },
  });
  check("no DEBT, FREEZE_*, REPAIR or FULL_DAY row before the launch day", preLaunchRows === 0, String(preLaunchRows));
  check("Monday was a Full day: settlement recorded it", (await keysOf(u, fullDayKey(MON5))).length === 1);

  step(WED7, "04:05", "the M5 judge: the week of 28 Sep ended before the launch day");
  const j40 = await M.weeks.judgeClosedWeeks(u, NOW);
  const w40 = await weekRows(u, W40);
  check("the pre-launch week is judged on its Wednesday, all four tracks, no Duty gate", j40.committed.includes(W40) && ["BODY", "CRAFT", "CARE", "DUTY"].every((t) => w40.has(t)), show(j40.committed));

  step(WED7, "10:00", "the day's routine");
  await doDay(u, [S, Dsh, W]);
  step(WED7, "12:00", "Tuesday is not settled yet: no card, no break");
  const b1 = await boardOf(u);
  check("no make-up card for Tuesday's stretch before 04:00 on Thursday", cardOf(b1, S, TUE6) == null);
  check("no card for the rent before its due day settles", cardOf(b1, O, TUE6) == null);
  check("the rent is a late row in the Must lane meanwhile", b1.board.must.some((r) => r.template.id === O && r.late));
  check("Stretch's streak is not broken by the unsettled Tuesday (it reads pending)", keptRun(b1, S) >= 3, String(keptRun(b1, S)));
  check("the daily streak runs on (a missed must on an active day never breaks it)", (await streakOf(u)).s.current >= 4);
  okOr("'Even on rest days' on: immediate", await M.tasks.setCompulsoryOnRestCore(u, S, true, NOW));

  step(THU8, "03:59", "still Wednesday's life day");
  const r359 = await settle(u);
  check("03:59 on d + 2 settles nothing", !r359.wrote && r359.plans.length === 0, show({ wrote: r359.wrote, plans: r359.plans.length }));
  check("and the board still shows no card", cardOf(await boardOf(u), S, TUE6) == null);

  step(THU8, "04:00", "04:00 on Tue + 2: Tuesday settles");
  const rTue = await settle(u);
  check("Tuesday is settled", rTue.wrote && rTue.cursorAfter === TUE6, show({ wrote: rTue.wrote, cursor: rTue.cursorAfter }));
  const sTue = await instancesOf(u, S, TUE6);
  const sMiss = must("Tuesday's stretch has an instance", sTue[0]);
  check("Tuesday's stretch is MISSED with its debt open", sMiss.status === "MISSED" && sMiss.debtOpen && sMiss.debtXp > 0, show(sMiss));
  check("one DEBT row for it", (await keysOf(u, debtKey(S, TUE6, 0))).length === 1);
  const oMiss = must("the rent has a MISSED instance", (await instancesOf(u, O, TUE6))[0]);
  check("the rent is MISSED with its debt open", oMiss.status === "MISSED" && oMiss.debtOpen, show(oMiss));
  const b2 = await boardOf(u);
  const card = cardOf(b2, S, TUE6);
  check("from 04:00 on d + 2 the make-up card shows, and it restores", card != null && card.restoresToday, show(card && { restoresToday: card.restoresToday, debt: card.debtXp }));
  check("the rent shows only its card, no late row (decision 18)", cardOf(b2, O, TUE6) != null && !b2.board.must.some((r) => r.template.id === O));
  check("and now the break shows on Stretch's streak", keptRun(b2, S) < 3, String(keptRun(b2, S)));

  step(THU8, "09:00", "the rent's late row is closed; accept-loss is refused");
  refused("a tick on the debited rent is refused", await tick(u, O), /Make it up from its card/);
  refused("accept-loss is refused with the setting off", await M.duty.acceptLossCore(u, oMiss.id, NOW));
  await M.prisma.lifeSettings.update({ where: { userId: u }, data: { debtWriteOff: true } });
  refused("accept-loss is refused for a debt younger than 14 days", await M.duty.acceptLossCore(u, oMiss.id, NOW));
  await M.prisma.lifeSettings.update({ where: { userId: u }, data: { debtWriteOff: false } });

  step(THU8, "09:30", "make up Tuesday's stretch on d + 2");
  const before = await streakOf(u);
  const mu = okOr("the make-up", await M.duty.makeUpCore(u, sMiss.id, { minimum: false }, NOW));
  check("a make-up on d + 2 restores (DONE_LATE)", mu.status === "DONE_LATE" && mu.restored, show(mu));
  const sMade = must("the instance", (await instancesOf(u, S, TUE6))[0]);
  check("the instance is repaired, its debt cleared", sMade.status === "DONE_LATE" && sMade.repaired && !sMade.debtOpen, show(sMade));
  check("the repayment is 'repaid:<tpl>:<d>:0:0'", (await keysOf(u, repaidKey(S, TUE6, 0, 0))).length === 1);
  const b3 = await boardOf(u);
  check("the card is gone and the per-duty streak is back", cardOf(b3, S, TUE6) == null && keptRun(b3, S) >= 5, String(keptRun(b3, S)));

  step(THU8, "09:35", "undo the make-up within 10 minutes");
  okOr("the undo", await M.duty.undoMakeUpCore(u, sMiss.id, NOW));
  const sUndone = must("the instance", (await instancesOf(u, S, TUE6))[0]);
  check("the undo reopens the debt", sUndone.status === "MISSED" && sUndone.debtOpen && !sUndone.repaired, show(sUndone));
  check("the card is back", cardOf(await boardOf(u), S, TUE6) != null);
  const after = await streakOf(u);
  check("the make-up day's streak units are as before the make-up", unitsOn(after.facts, THU8) === unitsOn(before.facts, THU8), `${unitsOn(before.facts, THU8)} → ${unitsOn(after.facts, THU8)}`);
  check("the repayment is reversed by an 'unrepaid:' row, never an UNDO", (await keysOf(u, "unrepaid:")).length === 1 && (await keysOf(u, "undo:")).length === 1);

  step(THU8, "09:40", "make it up again");
  const mu2 = okOr("the second make-up", await M.duty.makeUpCore(u, sMiss.id, { minimum: false }, NOW));
  check("it restores again", mu2.restored, show(mu2));
  check("its repayment key carries the attempt ':1'", (await keysOf(u, repaidKey(S, TUE6, 0, 1))).length === 1);

  step(THU8, "10:00", "the day's routine");
  await doDay(u, [S, Dsh, W]);
  step(THU8, "12:00", "settlement again: nothing is due");
  const c0 = await rowCounts(u);
  const rAgain = await settle(u);
  const c1 = await rowCounts(u);
  check("settling twice writes nothing", !rAgain.wrote && c0.events === c1.events && c0.instances === c1.instances, show({ c0, c1 }));

  step(FRI9, "04:00", "two settles at once");
  const both = await Promise.all([settle(u), settle(u)]);
  check("two settles at once: one writes, the other finds nothing", both.filter((r) => r.wrote).length === 1, show(both.map((r) => ({ wrote: r.wrote, refused: r.refused }))));
  check("one row per key (Wednesday's Full day once)", (await keysOf(u, fullDayKey(WED7))).length === 1);
  check("the cursor is Wednesday", (await settingsOf(u))?.cursor === WED7);

  step(FRI9, "10:00", "Dishes is missed");
  await doDay(u, [S, W]);
  step(SAT10, "10:00", "the day's routine");
  await doDay(u, [S, Dsh, W]);
  step(SAT10, "11:00", "Friday is not settled yet");
  const b4 = await boardOf(u);
  check("no card for Friday's dishes yet, and no break", cardOf(b4, Dsh, FRI9) == null && keptRun(b4, Dsh) >= 6, String(keptRun(b4, Dsh)));
  step(SAT10, "11:50", "record Friday's reading");
  const rec = okOr("record yesterday", await tick(u, R, "yesterday"));
  step(SAT10, "11:52", "'Settle Friday now'");
  const early = okOr("the early settle", await M.duty.settleYesterdayCore(u, NOW));
  check("it settles through Friday", early.settledThrough === FRI9, show(early));
  const dMiss = must("Friday's dishes has an instance", (await instancesOf(u, Dsh, FRI9))[0]);
  check("Friday's dishes is MISSED with its debt open", dMiss.status === "MISSED" && dMiss.debtOpen, show(dMiss));
  const b5 = await boardOf(u);
  check("after 'Settle yesterday' the card shows at once", cardOf(b5, Dsh, FRI9) != null);
  check("and the break shows", keptRun(b5, Dsh) < 6, String(keptRun(b5, Dsh)));
  step(SAT10, "11:55", "Friday is locked");
  refused("an undo of Friday's record is refused with the settled message", await M.tasks.undoCompletionCore(u, rec.instanceId, NOW), /Friday is settled; this tick stands/);
  refused("a record of Friday's dishes is refused with the settled message", await tick(u, Dsh, "yesterday"), /Friday is settled\. Make it up from its card/);

  step(SUN11, "04:15", "the life cron after the early settle");
  const cronEnv = {
    NODE_ENV: process.env.NODE_ENV,
    XTNL_LIFE_JUDGE: "1",
    XTNL_LIFE_LAUNCH_DAY: process.env.XTNL_LIFE_LAUNCH_DAY,
    XTNL_DUTY_LAUNCH_DAY: L,
    CRON_SECRET: `rehearse-${RUN}`,
  };
  const cronReq = (auth: string | null) => new Request("http://localhost/api/cron/life", auth ? { headers: { authorization: auth } } : {});
  const deps = { env: cronEnv, now: () => NOW, userId: () => u };
  check("the cron answers 401 without the header", (await M.settlement.runLifeCron(cronReq(null), deps)).status === 401);
  check("the cron answers 401 with a wrong header", (await M.settlement.runLifeCron(cronReq("Bearer nope"), deps)).status === 401);
  check("the cron answers 401 when CRON_SECRET is unset", (await M.settlement.runLifeCron(cronReq(`Bearer ${cronEnv.CRON_SECRET}`), { ...deps, env: { ...cronEnv, CRON_SECRET: undefined } })).status === 401);
  const c2 = await rowCounts(u);
  const cron = await M.settlement.runLifeCron(cronReq(`Bearer ${cronEnv.CRON_SECRET}`), deps);
  const body = (await cron.json()) as { settle?: { wrote?: boolean } };
  const c3 = await rowCounts(u);
  check("the cron after an early settle writes nothing new", cron.status === 200 && body.settle?.wrote === false && c2.events === c3.events && c2.instances === c3.instances, show({ status: cron.status, body, c2, c3 }));

  step(SUN11, "10:00", "the day's routine");
  await doDay(u, [S, Dsh, W]);
  step(MON12, "04:30", "a page load's after(): the maintenance chain settles Saturday");
  await M.settlement.maybeMaintainLife(u, NOW);
  check("maybeMaintainLife settled Saturday", (await settingsOf(u))?.cursor === SAT10);

  step(MON12, "10:00", "make up Friday's dishes on d + 3");
  const late = okOr("the late make-up", await M.duty.makeUpCore(u, dMiss.id, { minimum: false }, NOW));
  check("a make-up on d + 3 is MADE_UP and does not restore", late.status === "MADE_UP" && !late.restored, show(late));
  const dMade = must("the instance", (await instancesOf(u, Dsh, FRI9))[0]);
  check("its debt is cleared and it is not repaired", dMade.status === "MADE_UP" && !dMade.debtOpen && !dMade.repaired, show(dMade));
  const b6 = await boardOf(u);
  check("no card, and Dishes' streak stays broken", cardOf(b6, Dsh, FRI9) == null && keptRun(b6, Dsh) < 6, String(keptRun(b6, Dsh)));
  await doDay(u, [S, Dsh, W]);
  step(TUE13, "10:00", "the day's routine; settlement is held back today (no page load, no cron)");
  await doDay(u, [S, Dsh, W]);

  step(WED14, "04:05", "Wednesday's judge while settlement is held at Saturday");
  check("the cursor is still Saturday", (await settingsOf(u))?.cursor === SAT10);
  await M.weeks.judgeClosedWeeks(u, NOW);
  const g = await weekRows(u, W41);
  check("BODY, CRAFT and CARE of the first Duty week are judged on Wednesday", g.has("BODY") && g.has("CRAFT") && g.has("CARE"));
  check("DUTY waits for its Sunday to settle", !g.has("DUTY"));
  check("no Full-day MP before DUTY is judged", g.fullDayMints.length === 0);
  check("a kept track minted (Write, 7 days of CRAFT)", g.trackMints.length >= 1, String(g.trackMints.length));

  step(WED14, "04:10", "settlement catches up: Sunday and Monday");
  const rCatch = await settle(u);
  check("settled through Monday", rCatch.cursorAfter === MON12, show(rCatch.cursorAfter));
  const fullDays = (await keysOf(u, "fullday:")).map((k) => k.slice("fullday:".length)).sort();
  check("Full days recorded on settlement: Mon, Wed, Sat and Sun (Tue and Fri had a miss)", [MON5, WED7, SAT10, SUN11].every((d) => fullDays.includes(d)) && !fullDays.includes(TUE6) && !fullDays.includes(FRI9), show(fullDays));
  check("no Full day before the launch day", fullDays.every((d) => d >= MON5), show(fullDays));

  step(WED14, "04:15", "the judge again: DUTY, then the Full days");
  await M.weeks.judgeClosedWeeks(u, NOW);
  const h = await weekRows(u, W41);
  check("DUTY is judged once its Sunday is settled", h.has("DUTY"));
  const weekFull = fullDays.filter((d) => d >= MON5 && d <= SUN11);
  const mintedFor = new Set(h.fullDayMints.map((m) => (m.dedupeKey ?? "").slice("mp:LIFE_FULL_DAY:".length)));
  check("each Full day of the week has its mint 'mp:LIFE_FULL_DAY:<d>'", weekFull.length > 0 && weekFull.every((d) => mintedFor.has(d)) && weekFull.every((d) => h.fullDayMints.some((m) => m.dedupeKey === fullDayMintKey(d))), show({ weekFull, minted: [...mintedFor] }));
  // The tracks judged on the gated run were minted first; a DUTY mint shares the Full days' run and
  // transaction, where planWeeks lists the full days last (one clock, so >= there).
  const gatedTrack = Math.max(...g.trackMints.map((m) => m.occurredAt.getTime()));
  const lastTrack = Math.max(...h.trackMints.map((m) => m.occurredAt.getTime()));
  const firstFull = Math.min(...h.fullDayMints.map((m) => m.occurredAt.getTime()));
  check("the Full days are paid after the kept tracks", g.trackMints.length > 0 && firstFull > gatedTrack && firstFull >= lastTrack);
  check("the first Full day pays 0.5 MP (nothing trimmed below the cap)", h.fullDayMints.some((m) => (m.qty ?? 0) === 0.5), show(h.fullDayMints.map((m) => m.qty)));
  check("the week's MP stays inside the 8 MP cap", h.cappedMp <= 8 + 1e-9, String(h.cappedMp));
}

// ── Scenarios B, C, D, I: freezes and rest ───────────────────────────────

/** Captures on the launch day (the row is made after launch: cursor Sun 4), then seven active days. */
async function activeWeek(u: string): Promise<{ meds: string; walk: string }> {
  step(MON5, "09:00", "captures on the launch day");
  const meds = await capture(u, "meds daily !");
  const walk = await capture(u, "walk 20m daily");
  const s = await settingsOf(u);
  check("a LifeSettings row made after launch starts its cursor at epoch − 1 (decision 1)", s?.epochDay === MON5 && s.cursor === SUN4, show(s));
  for (let d = MON5; d <= SUN11; d = addDays(d, 1)) {
    step(d, "10:00", "an active day");
    await doDay(u, [meds, walk]);
  }
  return { meds, walk };
}

async function noDebtOn(u: string, tpl: string, day: DayKey): Promise<void> {
  const inst = await instancesOf(u, tpl, day);
  check(`${nameOf(tpl)} on ${day} is EXCUSED, not owed`, inst.length > 0 && inst.every((i) => i.status === "EXCUSED" && !i.debtOpen), show(inst));
  check(`no DEBT row for ${nameOf(tpl)} on ${day}`, (await keysOf(u, debtKey(tpl, day, 0))).length === 0);
}

async function scenarioB(): Promise<void> {
  const u = userOf("B");
  const { meds, walk } = await activeWeek(u);
  step(TUE13, "04:00", "Sunday settles: 7 active days earn a freeze");
  const r = await settle(u);
  check("settled through Sunday", r.cursorAfter === SUN11, show(r.cursorAfter));
  check("the freeze is earned on Sunday", (await keysOf(u, freezeEarnKey(SUN11))).length === 1);
  step(TUE13, "12:00", "Monday had nothing in it");
  const st = await streakOf(u);
  check("the board says a freeze will cover Monday", st.s.freezeWillCover && st.s.bankedFreezes === 1, show({ will: st.s.freezeWillCover, banked: st.s.bankedFreezes }));
  await doDay(u, [meds, walk]);
  step(WED14, "04:00", "Monday settles: the freeze is spent on its own");
  const r2 = await settle(u);
  check("settled through Monday", r2.cursorAfter === MON12, show(r2.cursorAfter));
  check("a no-activity day with a live streak consumes the freeze", (await keysOf(u, freezeUseKey(MON12))).length === 1);
  await noDebtOn(u, meds, MON12);
  step(WED14, "10:00", "the day's routine");
  await doDay(u, [meds, walk]);
  const st2 = await streakOf(u);
  check("the streak is held over Monday and runs on", st2.s.current >= 9 && held7(st2.s, MON12) && st2.s.bankedFreezes === 0, show({ current: st2.s.current, held7: st2.s.held7Days, banked: st2.s.bankedFreezes }));
}

async function scenarioC(): Promise<void> {
  const u = userOf("C");
  const { meds, walk } = await activeWeek(u);
  step(SUN11, "20:00", "declare rest for Monday");
  refused("rest for today is refused (declared before the day starts)", await M.duty.declareRestCore(u, SUN11, NOW), /declared before it starts/);
  okOr("rest for Monday", await M.duty.declareRestCore(u, MON12, NOW));
  step(TUE13, "10:00", "back to it (no settlement since Sunday)");
  await doDay(u, [meds, walk]);
  step(WED14, "04:00", "eight days settle in two chunks: the freeze is earned on Sunday and Monday is rest");
  const r = await settle(u);
  check("eight days settled, through Monday", r.cursorAfter === MON12 && r.plans.length === 8, show({ cursor: r.cursorAfter, days: r.plans.length }));
  check("the freeze is earned", (await keysOf(u, freezeEarnKey(SUN11))).length === 1);
  check("a rest day consumes no freeze", (await keysOf(u, "freeze-use:")).length === 0);
  await noDebtOn(u, meds, MON12);
  step(WED14, "12:00", "a manual freeze for an active yesterday");
  refused("a manual freeze is refused for an active yesterday", await M.duty.spendFreezeCore(u, NOW), /has activity/);
  const st = await streakOf(u);
  check("the rest day holds the streak and the freeze stays banked", st.s.current >= 8 && held7(st.s, MON12) && st.s.bankedFreezes === 1, show({ current: st.s.current, held7: st.s.held7Days, banked: st.s.bankedFreezes }));
}

async function scenarioD(): Promise<void> {
  const u = userOf("D");
  const { meds, walk } = await activeWeek(u);
  step(TUE13, "04:00", "Sunday settles: the freeze is earned");
  await settle(u);
  step(TUE13, "12:00", "'Use a freeze for Monday'");
  const spent = okOr("the manual freeze", await M.duty.spendFreezeCore(u, NOW));
  check("it covers Monday and leaves none", spent.day === MON12 && spent.left === 0, show(spent));
  refused("a record of the frozen Monday is refused (a freeze is a no-activity day)", await tick(u, walk, "yesterday"), /frozen/);
  step(TUE13, "12:05", "the early settle, with a repeated spend beside it");
  const [again, early] = await Promise.all([M.duty.spendFreezeCore(u, NOW), M.duty.settleYesterdayCore(u, NOW)]);
  console.log(`    (spend again: ${show(again)}; settle: ${show(early)})`);
  if (!early.ok) okOr("the settle, once more", await M.duty.settleYesterdayCore(u, NOW));
  check("exactly one FREEZE_USE for Monday", (await keysOf(u, "freeze-use:")).length === 1);
  check("Monday is settled", (await settingsOf(u))?.cursor === MON12);
  await noDebtOn(u, meds, MON12);
}

async function scenarioI(): Promise<void> {
  const u = userOf("I");
  const { meds } = await activeWeek(u);
  step(TUE13, "04:00", "Sunday settles: the freeze is earned");
  await settle(u);
  step(TUE13, "12:00", "a manual freeze and the early settle race at balance 1");
  const [spend, early] = await Promise.all([M.duty.spendFreezeCore(u, NOW), M.duty.settleYesterdayCore(u, NOW)]);
  console.log(`    (spend: ${show(spend)}; settle: ${show(early)})`);
  if (!early.ok) okOr("the settle, once more", await M.duty.settleYesterdayCore(u, NOW));
  check("exactly one FREEZE_USE for Monday", (await keysOf(u, "freeze-use:")).length === 1 && (await keysOf(u, freezeUseKey(MON12))).length === 1);
  check("Monday is settled", (await settingsOf(u))?.cursor === MON12);
  await noDebtOn(u, meds, MON12);
}

// ── Scenario E: a reset after launch ─────────────────────────────────────

async function scenarioE(): Promise<void> {
  const u = userOf("E");
  step(MON5, "09:00", "capture on the launch day");
  const floss = await capture(u, "floss daily !");
  await doDay(u, [floss]);
  step(TUE6, "10:00", "the day's routine");
  await doDay(u, [floss]);
  step(WED7, "04:00", "Monday settles");
  check("settled through Monday", (await settle(u)).cursorAfter === MON5);
  step(WED7, "10:00", "Settings › Data › Life only");
  const res = await lifeReset(u);
  check("the life reset ran", res.ok, show(res));
  const gone = await rowCounts(u);
  check("it removed the settings, the ledger and the instances", (await settingsOf(u)) == null && gone.events === 0 && gone.instances === 0, show(gone));
  step(WED7, "10:05", "the first capture after the reset (Wednesday's floss is then missed)");
  const floss2 = await capture(u, "floss daily !");
  check("the new row starts its cursor at the new epoch − 1", show(await settingsOf(u)) === show({ epochDay: WED7, cursor: TUE6 }), show(await settingsOf(u)));
  for (let d = THU8; d <= TUE13; d = addDays(d, 1)) {
    step(d, "10:00", "the day's routine");
    await doDay(u, [floss2]);
    if (d === FRI9) {
      step(FRI9, "10:05", "settlement after 04:00 on Fri (Wednesday is due)");
      const r = await settle(u);
      check("settlement runs from the new epoch", r.cursorAfter === WED7, show(r.cursorAfter));
      check("Wednesday's floss is owed", (await keysOf(u, debtKey(floss2, WED7, 0))).length === 1);
      const older = await M.prisma.activityEvent.count({ where: { userId: u, day: { lt: dateColumn(WED7) } } });
      check("nothing is written before the new epoch", older === 0, String(older));
    }
  }
  step(WED14, "04:00", "settlement through Monday, then the judge");
  check("settled through Monday", (await settle(u)).cursorAfter === MON12);
  await M.weeks.judgeClosedWeeks(u, NOW);
  check("the judge keeps judging from the new epoch: the week's DUTY is written", (await weekRows(u, W41)).has("DUTY"));
}

// ── Scenarios F and G: --apply before launch ─────────────────────────────

async function scenarioF(): Promise<void> {
  const u = userOf("F");
  step(SAT3, "10:00", "captures before launch");
  const meds = await capture(u, "meds daily !");
  const journal = await capture(u, "journal daily");
  step(SAT3, "12:00", "--apply run before the launch Monday (the old wording allowed it; the script now refuses)");
  check("F20 now refuses this --apply", !applyAllowed(SAT3, L));
  check("the early --apply writes the cursor Sun 4", (await applyLaunchCursor(u)) === 1 && (await settingsOf(u))?.cursor === SUN4);
  step(SUN4, "10:00", "the DST start; the cursor (Sun 4) is ahead of today, the floor (Mon 5) is ahead of both");
  okOr("today's tick is allowed", await tick(u, journal));
  const b = await boardOf(u);
  check("the yesterday lane is open", b.board.yesterdayRows.some((r) => r.template.id === meds), show(b.board.yesterdayRows.map((r) => r.template.title)));
  const rec = okOr("a record of Saturday is allowed", await tick(u, meds, "yesterday"));
  step(SUN4, "10:05", "undo that record");
  okOr("its undo is allowed", await M.tasks.undoCompletionCore(u, rec.instanceId, NOW));
  step(MON5, "10:00", "the launch Monday");
  const b2 = await boardOf(u);
  check("the last pre-Duty day (Sunday) is still in the yesterday lane", b2.board.yesterdayRows.some((r) => r.template.id === meds));
  okOr("a record of Sunday is allowed on the launch day", await tick(u, meds, "yesterday"));
  okOr("today's tick", await tick(u, meds));
  step(WED7, "04:00", "Monday settles");
  check("settled through Monday", (await settle(u)).cursorAfter === MON5);
  const judged = await M.prisma.taskInstance.count({ where: { userId: u, judgedAt: { not: null }, day: { lt: dateColumn(MON5) } } });
  check("Saturday and Sunday were never judged", judged === 0, String(judged));
}

async function scenarioG(): Promise<void> {
  const u = userOf("G");
  step(SAT3, "10:00", "capture before launch");
  await capture(u, "meds daily !");
  step(SAT3, "12:00", "an early --apply");
  check("the cursor is set", (await applyLaunchCursor(u)) === 1);
  step(SUN4, "12:00", "a 'Life only' reset before the launch");
  check("the reset ran", (await lifeReset(u)).ok);
  step(SUN4, "12:05", "the first capture after it");
  const meds2 = await capture(u, "meds daily !");
  check("a row made before launch has no cursor again", show(await settingsOf(u)) === show({ epochDay: SUN4, cursor: null }), show(await settingsOf(u)));
  step(MON5, "10:00", "the launch day");
  await doDay(u, [meds2]);
  check("settlement does nothing without the cursor", /not switched on/.test((await settle(u)).refused ?? ""));
  check("--apply is held on the launch day (firstDutyDay + 1 is Tuesday)", !applyAllowed(MON5, must("firstDutyDay", firstDutyDay(SUN4, L))));
  step(TUE6, "12:00", "--apply on firstDutyDay + 1");
  check("F20: --apply is allowed now", applyAllowed(TUE6, L));
  check("it writes the cursor max(launch, epoch) − 1 = Sun 4", (await applyLaunchCursor(u)) === 1 && (await settingsOf(u))?.cursor === SUN4);
  await doDay(u, [meds2]);
  step(WED7, "04:00", "Monday settles");
  check("settlement runs", (await settle(u)).cursorAfter === MON5);
}

// ── Scenario H: the akrasia horizon ──────────────────────────────────────

async function scenarioH(): Promise<void> {
  const u = userOf("H");
  step(SAT3, "10:00", "captures before launch");
  const meds = await capture(u, "meds daily !");
  const floss = await capture(u, "floss daily !");
  step(SAT3, "12:00", "before launch an un-flag is immediate");
  const pre = okOr("'Not a must'", await M.tasks.setCompulsoryCore(u, floss, NOW));
  check("it is immediate", pre.effect === "immediate" && (await templateOf(floss))?.compulsory === false, show(pre));
  step(WED7, "12:00", "after launch an un-flag waits 7 days");
  const def = okOr("'Not a must'", await M.tasks.setCompulsoryCore(u, meds, NOW));
  const t1 = await templateOf(meds);
  const pc1 = M.rule.parsePendingChange(t1?.pendingChange ?? null);
  check("it is deferred to Wed 14 Oct and the must stays a must meanwhile", def.effect === "deferred" && def.effectiveDay === WED14 && t1?.compulsory === true && pc1?.next?.effectiveDay === WED14 && pc1.next.compulsory === false, show({ def, pc1 }));
  refused("a second weakening is refused while one pends", await M.tasks.setCompulsoryCore(u, meds, NOW), /already pending/);
  step(WED7, "12:05", "'Keep it'");
  okOr("cancel the pending change", await M.tasks.cancelPendingChangeCore(u, meds, NOW));
  check("nothing is pending", M.rule.parsePendingChange((await templateOf(meds))?.pendingChange ?? null)?.next == null);
  step(WED7, "12:10", "'Even on rest days' on: immediate, never retroactive");
  const on = okOr("'Even on rest days' on", await M.tasks.setCompulsoryOnRestCore(u, meds, true, NOW));
  const t2 = await templateOf(meds);
  const pc2 = M.rule.parsePendingChange(t2?.pendingChange ?? null);
  check("it is immediate and keeps the old rule through yesterday", on.effect === "immediate" && t2?.compulsoryOnRest === true && (pc2?.prior ?? []).some((p) => p.throughDay === TUE6 && p.compulsoryOnRest === false), show({ on, pc2 }));
  step(WED7, "12:15", "'Even on rest days' off: a weakening, deferred");
  const off = okOr("'Even on rest days' off", await M.tasks.setCompulsoryOnRestCore(u, meds, false, NOW));
  check("it waits 7 days", off.effect === "deferred" && off.effectiveDay === WED14 && (await templateOf(meds))?.compulsoryOnRest === true, show(off));
}

// ── Cleanup ──────────────────────────────────────────────────────────────

/** Deletes the rows of every user whose id starts with `prefix` (always a 'rehearse-duty:' prefix). */
async function deleteRows(prefix: string): Promise<Record<string, number>> {
  if (!prefix.startsWith(TAG)) throw new Error(`refusing to delete outside ${TAG}`);
  const where = { userId: { startsWith: prefix } };
  const p = M.prisma;
  // Instances before the templates they reference.
  const out: Record<string, number> = {};
  out.taskInstances = (await p.taskInstance.deleteMany({ where })).count;
  out.taskTemplates = (await p.taskTemplate.deleteMany({ where })).count;
  out.restDays = (await p.restDay.deleteMany({ where })).count;
  out.activityEvents = (await p.activityEvent.deleteMany({ where })).count;
  out.lifeSettings = (await p.lifeSettings.deleteMany({ where })).count;
  out.masteryEntries = (await p.masteryLedgerEntry.deleteMany({ where })).count;
  out.celebrations = (await p.celebrationEvent.deleteMany({ where })).count;
  out.userPrefs = (await p.userPrefs.deleteMany({ where })).count;
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────

async function run(name: string, fn: () => Promise<void>): Promise<void> {
  scenario = name;
  console.log(`\n── ${name}`);
  try {
    await fn();
  } catch (err) {
    if (err instanceof Abort) check("the scenario ran to its end", false, `stopped after: ${err.message}`);
    else check("the scenario ran to its end", false, err instanceof Error ? (err.stack ?? err.message) : String(err));
  }
}

async function main(): Promise<void> {
  guard();
  M = await loadModules();
  // The launch script's own guard, too (settlement.ts launchTargetOf), before the first query.
  const target = M.settlement.launchTargetOf({ DATABASE_URL: process.env.DATABASE_URL, DIRECT_URL: process.env.DIRECT_URL });
  if (target.kind !== "rehearsal") {
    console.error(`Refusing to run: ${target.label} is not the rehearsal database.`, target.problems.join(" "));
    process.exitCode = 2;
    return;
  }
  console.log(`Rehearsal database: ${target.label} · life zone ${LIFE_TZ} · run ${RUN}`);

  if (typeof (M.prisma as unknown as { restDay?: { findMany?: unknown } }).restDay?.findMany !== "function") {
    console.error("The Prisma client has no RestDay model: run `npx prisma generate` first.");
    process.exitCode = 2;
    return;
  }
  const ready = await M.prisma.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('public."RestDay"') IS NOT NULL AS ok`;
  if (!ready[0]?.ok) {
    console.error('The rehearsal database has no "RestDay" table: apply the life_duty migration to it first.');
    process.exitCode = 2;
    return;
  }

  if (CLEAN) {
    console.log("Deleted:", show(await deleteRows(TAG)));
    return;
  }

  await run("A · the main line: cards, make-ups, settled days, the cron, the judge's gate and Full days", scenarioA);
  await run("B · an empty day with a live streak spends the freeze", scenarioB);
  await run("C · a rest day holds without a freeze", scenarioC);
  await run("D · a manual freeze, then the early settle", scenarioD);
  await run("I · a manual freeze racing the early settle", scenarioI);
  await run("E · a life reset after launch, then a capture", scenarioE);
  await run("F · --apply before launch leaves pre-launch days open", scenarioF);
  await run("G · a reset between an early --apply and the launch", scenarioG);
  await run("H · the akrasia horizon on the database", scenarioH);

  if (KEEP) console.log(`\nKept this run's rows (user ids '${TAG}${RUN}:…'); remove them with --clean.`);
  else console.log(`\nCleaned up: ${show(await deleteRows(`${TAG}${RUN}:`))}`);

  console.log(`\nduty-rehearse: ${passed} passed, ${fails.length} failed`);
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
