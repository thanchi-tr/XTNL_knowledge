/**
 * Momentum lane C: the server's critical pins (docs/life-plan/momentum.md §A.1, §A.2, §A.3,
 * §A.8, §B.4, §G.1 "C Momentum server"). Pure: no database, no clock, no network, no model.
 * src/lib/momentum-server.ts reads and writes through a MomentumStore; here that store is an
 * in-memory ledger with the database's unique (userId, dedupeKey) claim, all-or-nothing
 * transactions and the guards' re-checks, and every method yields once so two calls at once
 * interleave the way two requests do. PASS/FAIL per line; exits 1 on any failure.
 *
 *   npx tsx scripts/momentum-server-check.ts
 *
 *   §1 the gate closed (no launch day, or one still ahead, through MomentumDeps.launchDay): every
 *      writer writes nothing and reads nothing; every loader is inert. Launched (MOMENTUM_LAUNCH_DAY
 *      2026-10-12, the constant in force): the same day is live
 *   §2 the four readers L0 could not gate return today's values before launch (8 MP, today's
 *      capped reasons) and the launched ones after (91, + LIFE_PLAN_WEEK), under the constant too
 *   §3 Today's three: PLAN → BODY → TASK, no template in two slots; two concurrent
 *      ensureQuestSet write one row; swaps
 *   §4 work-board templates are never quest candidates
 *   §5 the chest: a double tap writes one CHEST and one mint; not ready writes nothing
 *   §6 settleMomentum auto-opens a past ready chest dated that day (receipt.auto), once
 *   §7 perks: a stale-count buy is refused; a double tap is one row; the tier gate
 *   §8 respec once per 30 life days; the epoch
 *   §9 milestones and checkpoints: idempotent mints, never "held when you began", the 2-per-30-day
 *      window's 0-MP decision row, the Summit chest; the moments pattern around the writes
 *   §10 the loaders, live: the run, the chest view, the nudge facts
 */
import "./_no-model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { activityData } from "../src/lib/activity";
import { lifeMintData } from "../src/lib/mastery";
import { addDays, keyOfDateColumn, todayKey, zonedToInstant, type DayKey } from "../src/lib/life-day";
import { mintDetail, parseMintDetail, round2 } from "../src/lib/life-economy";
import { closeDecision, type GoalInput } from "../src/lib/goals";
import { cappedSum } from "../src/lib/goals-server";
import { emptyLifeLedger, lifeMpInWeek, lifeTracksView, notLaunchedView } from "../src/lib/life-tracks";
import { MOMENTUM_LAUNCH_DAY, momentumLaunchDay, momentumUnitsOf, questIdentity, type QuestSet } from "../src/lib/momentum";
import type { BoardRow, DayLedger } from "../src/lib/today-board";
import type { ActivityInput } from "../src/lib/life-types";
import {
  MOMENTUM_NOT_LIVE,
  MOMENTUM_STALE,
  buyPerkCore,
  emptyDayFacts,
  ensureQuestSet,
  loadLifeTree,
  loadMomentum,
  loadNudgeFacts,
  openChestCore,
  pickQuests,
  planMilestone,
  questCandidatesOf,
  respecCore,
  setFlameSkinCore,
  setNudgeCore,
  settleMomentum,
  swapQuestCore,
  type BranchXpRow,
  type DayFacts,
  type EventQuery,
  type LedgerRow,
  type MomentsDeps,
  type MomentumDeps,
  type MomentumGuard,
  type MomentumLedger,
  type MomentumPrefs,
  type MomentumStore,
  type MomentumWrite,
  type QuestCandidate,
  type QuestSources,
  type RoadmapPayFacts,
} from "../src/lib/momentum-server";

const ROOT = join(__dirname, "..");
let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}
const j = (x: unknown) => JSON.stringify(x);
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// ── the clock and the gate ─────────────────────────────────────────────────

const LAUNCH: DayKey = "2026-10-05"; // a Monday
const TODAY: DayKey = "2026-10-20"; // a Tuesday
const nowOn = (day: DayKey, hour = 10): Date => {
  const [y, m, d] = day.split("-").map(Number);
  return zonedToInstant(y, m, d, hour);
};
const NOW = nowOn(TODAY);
/** A launch day still ahead: the Monday after TODAY's week, so TODAY's whole week is before it. */
const LATER: DayKey = "2026-10-26";
const GATE = "XTNL_MOMENTUM_LAUNCH_DAY";
/** The gate reads process.env on every call; outside production the override wins (a blank one reads as unset). */
const gateConstant = () => (process.env[GATE] = ""); // MOMENTUM_LAUNCH_DAY itself (2026-10-12)
const gateAhead = () => (process.env[GATE] = LATER);
const gateOpen = () => (process.env[GATE] = LAUNCH);
const USER = "u-momentum";

// ── the in-memory store ────────────────────────────────────────────────────

const tick = () => new Promise<void>((r) => setImmediate(r));

class FakeStore implements MomentumStore {
  rows: LedgerRow[] = [];
  reads = 0;
  attempts = 0;
  commits = 0;
  prefsWrites = 0;
  sourceCalls = 0;
  seq = 0;
  facts: (day: DayKey) => DayFacts = (d) => emptyDayFacts(d);
  sources: QuestSources = sourcesOf();
  pay: RoadmapPayFacts = { milestones: [], checkpoints: [] };
  branch: BranchXpRow[] = [];
  prefsRow: MomentumPrefs | null = null;

  insert(userId: string, e: ActivityInput): LedgerRow {
    const d = activityData(userId, e);
    const row: LedgerRow = {
      id: `row${++this.seq}`,
      day: keyOfDateColumn(d.day as Date),
      occurredAt: d.occurredAt as Date,
      source: d.source,
      sink: d.sink ?? "NONE",
      track: d.track ?? null,
      templateId: d.templateId ?? null,
      sourceId: d.sourceId ?? null,
      xp: Number(d.xp ?? 0),
      rawXp: d.rawXp ?? null,
      qty: d.qty ?? null,
      countsForStreak: !!d.countsForStreak,
      receipt: e.receipt ?? null,
      detail: d.detail ?? null,
      dedupeKey: d.dedupeKey ?? null,
    };
    this.rows.push(row);
    return row;
  }
  of(source: string, keyPrefix = ""): LedgerRow[] {
    return this.rows.filter((r) => r.source === source && (r.dedupeKey ?? "").startsWith(keyPrefix));
  }
  async events(_userId: string, q: EventQuery): Promise<LedgerRow[]> {
    await tick();
    this.reads++;
    return this.rows
      .filter(
        (r) =>
          q.sources.includes(r.source) &&
          (!q.from || r.day >= q.from) &&
          (!q.to || r.day <= q.to) &&
          (!q.keyPrefixes || q.keyPrefixes.length === 0 || q.keyPrefixes.some((p) => (r.dedupeKey ?? "").startsWith(p)))
      )
      .map((r) => ({ ...r }));
  }
  async units(_userId: string, from: DayKey, to: DayKey): Promise<Map<DayKey, number>> {
    await tick();
    this.reads++;
    const out = new Map<DayKey, number>();
    for (const r of this.rows) if (r.day >= from && r.day <= to && ["TASK", "WORKOUT", "CHECKPOINT", "UNDO"].includes(r.source)) out.set(r.day, (out.get(r.day) ?? 0) + momentumUnitsOf(r));
    return out;
  }
  async branchXp(): Promise<BranchXpRow[]> {
    await tick();
    this.reads++;
    return this.branch;
  }
  async dayFacts(_userId: string, days: readonly DayKey[]): Promise<Map<DayKey, DayFacts>> {
    await tick();
    this.reads++;
    return new Map(days.map((d) => [d, this.facts(d)]));
  }
  async questSources(): Promise<QuestSources> {
    await tick();
    this.reads++;
    this.sourceCalls++;
    return this.sources;
  }
  async roadmapPay(): Promise<RoadmapPayFacts> {
    await tick();
    this.reads++;
    return this.pay;
  }
  async prefs(): Promise<MomentumPrefs | null> {
    this.reads++;
    return this.prefsRow;
  }
  async savePrefs(_userId: string, patch: Partial<MomentumPrefs>): Promise<void> {
    this.prefsWrites++;
    this.prefsRow = { nudge: null, flameSkin: null, ...(this.prefsRow ?? {}), ...patch };
  }
  holds(g: MomentumGuard): boolean {
    if (g.kind === "rows") return this.rows.filter((r) => g.sources.includes(r.source)).length === g.count;
    const mints = this.rows.filter((r) => r.source === "MP_MINT" && (r.qty ?? 0) > 0 && parseMintDetail(r.detail).reason === g.reason && r.day >= g.from && r.day <= g.to);
    if (g.kind === "mintSum") return round2(mints.reduce((s, r) => s + (r.qty ?? 0), 0)) === round2(g.sum);
    return mints.length === g.paying;
  }
  async commit(userId: string, w: MomentumWrite): Promise<void> {
    await tick();
    this.attempts++;
    for (const g of w.guards) if (!this.holds(g)) throw new Error("division by zero");
    const inputs: ActivityInput[] = [...w.events, ...w.mints.map((m) => lifeMintData(userId, m).event)];
    const keys = inputs.map((e) => e.dedupeKey).filter((k): k is string => !!k);
    for (const k of keys) {
      if (this.rows.some((r) => r.dedupeKey === k) || keys.filter((x) => x === k).length > 1) {
        throw new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on (userId, dedupeKey): ${k}`, { code: "P2002", clientVersion: "fake" });
      }
    }
    for (const e of inputs) this.insert(userId, e);
    this.commits++;
  }
}

function cand(o: Partial<QuestCandidate> & { templateId: string }): QuestCandidate {
  return {
    title: o.templateId,
    track: "DUTY",
    kind: "TASK",
    category: "HOME",
    intrinsic: false,
    autoMetric: null,
    inbox: false,
    lane: "today",
    open: true,
    dueKind: "PLANNED",
    dueDay: TODAY,
    recurring: false,
    raw: 10,
    ...o,
  };
}

function sourcesOf(o: Partial<QuestSources> = {}): QuestSources {
  return {
    day: TODAY,
    candidates: [
      cand({ templateId: "t-practice", title: "Scales", category: "LEARNING", recurring: true, dueDay: null, dueKind: null, track: "CRAFT" }),
      cand({ templateId: "t-walk", title: "Walk", category: "EXERCISE", recurring: true, dueDay: null, dueKind: null, track: "BODY" }),
      cand({ templateId: "t-big", title: "Tax return", raw: 30, dueKind: "DEADLINE", dueDay: TODAY }),
      cand({ templateId: "t-small", title: "Email Sam", raw: 8 }),
      cand({ templateId: "t-later", title: "Book flights", raw: 50, dueKind: "DEADLINE", dueDay: addDays(TODAY, 2) }),
      cand({ templateId: "t-work", title: "Quarterly report", raw: 99, dueKind: "DEADLINE", lane: "must", boardId: "wb-1" }),
    ],
    weekEffortMinutes: 40,
    reviewsDue: 25,
    plan: { hasRoadmap: true, practices: [{ templateId: "t-practice", roadmapId: "rm1", seat: 1, ord: 1, role: "PRACTICE" }], checkpoints: [], adds: [] },
    ...o,
  };
}

const allDone = (day: DayKey, templates: string[] = ["t-practice", "t-walk", "t-big"]): DayFacts => ({
  ...emptyDayFacts(day),
  doneTemplates: new Set(templates),
  moveMinutes: [30],
  fullTasks: 3,
  reviews: 12,
  ideas: 1,
});

/** u1 0.70 → UNCOMMON (8 MP); every other roll 0.5. */
const ROLL = (key: string): number => (key.startsWith("chest:v1|") && key.endsWith("|1") ? 0.7 : 0.5);
const depsOf = (store: FakeStore, o: MomentumDeps = {}): MomentumDeps => ({ store, now: NOW, roll: ROLL, writesOn: true, moments: false, ...o });
const taskRow = (store: FakeStore, day: DayKey, id: string) =>
  store.insert(USER, { source: "TASK", sink: "TRACK", track: "DUTY", day, occurredAt: nowOn(day, 9), templateId: "t-x", sourceId: id, xp: 10, rawXp: 10, countsForStreak: true, dedupeKey: `task:t-x:${day}:${id}` });

async function main(): Promise<void> {
  // ════ §1 the gate closed ════
  console.log("\n§1 the gate closed");
  gateConstant();
  check("the fixture clock: 10:00 in LIFE_TZ is life day TODAY, 20:00 too", todayKey(NOW) === TODAY && todayKey(nowOn(TODAY, 20)) === TODAY);
  check("MOMENTUM_LAUNCH_DAY is 2026-10-12 (launched), and a blank override reads as unset (the constant is in force)", MOMENTUM_LAUNCH_DAY === "2026-10-12" && momentumLaunchDay() === MOMENTUM_LAUNCH_DAY);
  const closedGates: [string, MomentumDeps][] = [
    ["no launch day (launchDay null)", { launchDay: null }],
    ["a launch day still ahead (launchDay after TODAY)", { launchDay: LATER }],
  ];
  for (const [gate, closed] of closedGates) {
    console.log(`  ${gate}`);
    const s = new FakeStore();
    const d = depsOf(s, closed);
    const results = {
      ensure: await ensureQuestSet(USER, TODAY, d),
      swap: await swapQuestCore(USER, "TASK", d),
      chest: await openChestCore(USER, d),
      settle: await settleMomentum(USER, TODAY, { ...d, force: true }),
      buy: await buyPerkCore(USER, "D_STEADY", d),
      respec: await respecCore(USER, d),
      flame: await setFlameSkinCore(USER, "flame-ember", d),
      nudge: await setNudgeCore(USER, false, d),
    };
    check(`${gate}: ensureQuestSet returns null`, results.ensure === null);
    check(
      `${gate}: swap, chest, perk, respec, flame and nudge refuse with MOMENTUM_NOT_LIVE`,
      [results.swap, results.chest, results.buy, results.respec, results.flame, results.nudge].every((r) => !r.ok && r.error === MOMENTUM_NOT_LIVE),
      j([results.swap, results.chest, results.buy, results.respec, results.flame, results.nudge])
    );
    check(`${gate}: settleMomentum (even forced) writes nothing`, !results.settle.live && !results.settle.wrote);
    const lm = await loadMomentum(USER, TODAY, d);
    const lt = await loadLifeTree(USER, d);
    const nf = await loadNudgeFacts(USER, nowOn(TODAY, 20), d);
    check(`${gate}: loaders are inert: loadMomentum {live: false}, loadLifeTree {live: false}, loadNudgeFacts live false and never at risk`, !lm.live && !lt.live && !nf.live && !nf.atRisk && nf.quest === null);
    check(`${gate}: no write was attempted, no preference saved and nothing was read`, s.attempts === 0 && s.commits === 0 && s.prefsWrites === 0 && s.reads === 0 && s.rows.length === 0, j({ attempts: s.attempts, reads: s.reads, prefs: s.prefsWrites }));
  }
  {
    // Launched: no launchDay in the deps reads momentumLaunchDay(), the constant 2026-10-12; TODAY (2026-10-20) is live.
    const s = new FakeStore();
    const d = depsOf(s);
    const set = await ensureQuestSet(USER, TODAY, d);
    const lm = await loadMomentum(USER, TODAY, d);
    const lt = await loadLifeTree(USER, d);
    check("launched (MOMENTUM_LAUNCH_DAY 2026-10-12, no launchDay in the deps): TODAY is live: ensureQuestSet writes Today's three, loadMomentum and loadLifeTree are live", set !== null && s.commits === 1 && lm.live && lt.live, j({ set: set !== null, commits: s.commits, lm: lm.live, lt: lt.live }));
    const before = new FakeStore();
    const beforeDeps = depsOf(before, { now: nowOn("2026-10-11") });
    check("launched: the day before 2026-10-12 is still inert (null set, {live: false}, nothing read)", (await ensureQuestSet(USER, "2026-10-11", beforeDeps)) === null && !(await loadMomentum(USER, "2026-10-11", beforeDeps)).live && before.reads === 0 && before.attempts === 0);
  }

  // ════ §2 the four readers ════
  console.log("\n§2 the four readers before and after launch");
  {
    const MONDAY = "2026-10-19";
    const goal = (used: number): GoalInput => ({
      id: "g-short",
      horizon: "SHORT",
      track: "DUTY",
      goalMp: 1,
      krMetric: "CHILDREN",
      krTarget: null,
      steps: [{ completedDay: addDays(TODAY, -1) }],
      progress: [],
      dueDay: null,
      createdDay: addDays(TODAY, -10),
      today: TODAY,
      launchDay: "2026-10-01",
      goalMints: [],
      cappedUsedThisWeek: used,
    });
    const mints = [
      { qty: 1.5, detail: mintDetail("LIFE_WEEK_KEPT") },
      { qty: 10, detail: mintDetail("LIFE_PLAN_WEEK") },
      { qty: 8, detail: mintDetail("LIFE_CHEST") },
    ];
    const ledger = { ...emptyLifeLedger("2026-10-01"), mints: mints.map((m, i) => ({ key: `k${i}`, track: null, templateId: null, day: TODAY, qty: m.qty, reason: parseMintDetail(m.detail).reason, why: null })) };

    gateAhead(); // before launch: TODAY's week ends before the launch day (lifeMpModelOf(false), as with no launch day)
    const a = closeDecision(goal(7.5));
    const b = closeDecision(goal(8));
    check("goals.ts: a Short close is trimmed by the 8 MP cap before launch", a.pays === 0.5 && a.why === "trimmed by the life week's 8 MP cap", j(a));
    check("goals.ts: and refused at it ('the life week's 8 MP cap is reached')", b.pays === 0 && b.why === "the life week's 8 MP cap is reached", j(b));
    check("goals-server cappedSum: today's capped reasons only (LIFE_PLAN_WEEK and LIFE_CHEST are not)", cappedSum(mints, TODAY) === 1.5, String(cappedSum(mints, TODAY)));
    check("life-tracks: the cap shown on /you is 8 (notLaunchedView and lifeTracksView)", notLaunchedView(TODAY).mpThisWeek.cap === 8 && lifeTracksView(ledger, TODAY, "2026-10-01").mpThisWeek.cap === 8 && lifeTracksView(ledger, TODAY, "2026-10-01").mpLastWeek.cap === 8);
    check("life-tracks lifeMpInWeek: today's capped reasons only", lifeMpInWeek(ledger, MONDAY) === 1.5, String(lifeMpInWeek(ledger, MONDAY)));
    const rehearse = read("scripts/duty-rehearse.ts");
    check(
      "duty-rehearse: the week's cap is lifeMpModelOfWeek(SUN11).weekCap (a dynamic import, after the guard), not a hard-coded 8",
      /M\.momentum\.lifeMpModelOfWeek\(SUN11\)\.weekCap/.test(rehearse) && /import\("\.\.\/src\/lib\/momentum"\)/.test(rehearse) && !/8 MP cap/.test(rehearse) && !/cappedMp <= 8\b/.test(rehearse)
    );

    gateOpen();
    const c = closeDecision(goal(7.5));
    const e = closeDecision(goal(90.5));
    check("after launch: a Short close pays in full under the 91 MP pool", c.pays === 1 && c.why === null, j(c));
    check("after launch: trimmed by 'the life week's 91 MP cap'", e.pays === 0.5 && e.why === "trimmed by the life week's 91 MP cap", j(e));
    check("after launch: cappedSum adds LIFE_PLAN_WEEK (never the chest pool)", cappedSum(mints, TODAY) === 11.5, String(cappedSum(mints, TODAY)));
    check("after launch: /you shows 91, and lifeMpInWeek adds LIFE_PLAN_WEEK", lifeTracksView(ledger, TODAY, "2026-10-01").mpThisWeek.cap === 91 && lifeMpInWeek(ledger, MONDAY) === 11.5);
    check("a week whose Sunday is before the launch keeps 8 (the weekIsBackfill rule)", notLaunchedView("2026-09-30").mpThisWeek.cap === 8 && lifeMpInWeek(ledger, "2026-09-28") === 0);

    gateConstant(); // launched: MOMENTUM_LAUNCH_DAY 2026-10-12 itself
    const f = closeDecision(goal(7.5));
    check("launched (the constant): TODAY's week pays a Short close in full under the 91 MP pool, cappedSum adds LIFE_PLAN_WEEK, /you shows 91", f.pays === 1 && f.why === null && cappedSum(mints, TODAY) === 11.5 && lifeTracksView(ledger, TODAY, "2026-10-01").mpThisWeek.cap === 91 && lifeMpInWeek(ledger, MONDAY) === 11.5, j(f));
    check(
      "launched (the constant): the week of 5 October (its Sunday the 11th, before 2026-10-12) keeps 8 and today's capped reasons; the week of 12 October is 91",
      notLaunchedView("2026-10-07").mpThisWeek.cap === 8 && notLaunchedView("2026-10-12").mpThisWeek.cap === 91 && notLaunchedView("2026-10-12").mpLastWeek.cap === 8 && cappedSum(mints, "2026-10-07") === 1.5 && cappedSum(mints, "2026-10-12") === 11.5
    );
  }

  // ════ §3 Today's three ════
  console.log("\n§3 Today's three");
  {
    gateOpen();
    const tie = () => 0.5;
    const three = pickQuests(sourcesOf(), tie);
    check(
      "PLAN → BODY → TASK: the practice, the exercise habit, the biggest due task (30 × 1.3 deadline)",
      j(three.map((q) => questIdentity(q))) === j(["PLAN:TEMPLATE:t-practice", "BODY:TEMPLATE:t-walk", "TASK:TEMPLATE:t-big"]),
      j(three.map((q) => questIdentity(q)))
    );
    const t = three[2];
    check("the TASK quest carries its track, raw and score (39)", t.kind === "TEMPLATE" && t.slot === "TASK" && t.track === "DUTY" && t.raw === 30 && t.score === 39, j(t));
    check("a deadline two days out is not 'due today or overdue'", !three.some((q) => q.kind === "TEMPLATE" && q.templateId === "t-later"));
    const shared = pickQuests(sourcesOf({ plan: { hasRoadmap: true, practices: [{ templateId: "t-walk", roadmapId: "rm1", seat: 1, ord: 1, role: "PRACTICE" }], checkpoints: [], adds: [] } }), tie);
    check(
      "no template fills two slots: a walk that is the roadmap's practice is PLAN, and BODY falls back to 'Move 20 min'",
      questIdentity(shared[0]) === "PLAN:TEMPLATE:t-walk" && questIdentity(shared[1]) === "BODY:MOVE:20",
      j(shared.map(questIdentity))
    );
    const bare = pickQuests(sourcesOf({ candidates: [], plan: { hasRoadmap: false, practices: [], checkpoints: [], adds: [] }, reviewsDue: 3, weekEffortMinutes: 160 }), tie);
    check("fallbacks: 'Review 3 cards', 'Move 10 min' (150 met), 'Finish any 2 tasks'", j(bare.map((q) => q.title)) === j(["Review 3 cards", "Move 10 min", "Finish any 2 tasks"]), j(bare.map((q) => q.title)));

    const s = new FakeStore();
    const d = depsOf(s);
    const [x, y] = await Promise.all([ensureQuestSet(USER, TODAY, d), ensureQuestSet(USER, TODAY, d)]);
    const setRows = s.of("QUEST_SET", `quests:${TODAY}`);
    check("two concurrent ensureQuestSet write one 'quests:<day>' row", setRows.length === 1 && s.commits === 1 && s.attempts === 2, j({ rows: setRows.length, commits: s.commits, attempts: s.attempts }));
    check("both get the one stored set (the loser's P2002 is swallowed)", !!x && !!y && j(x) === j(y) && j(setRows[0].receipt) === j(x), j({ x, y }));
    check("the row is a sink NONE decision row that never counts for the streak", setRows[0].sink === "NONE" && setRows[0].xp === 0 && !setRows[0].countsForStreak);
    const calls = s.sourceCalls;
    const z = await ensureQuestSet(USER, TODAY, d);
    check("a third call reads the stored set and picks nothing", j(z) === j(x) && s.sourceCalls === calls && s.commits === 1);
    check("a past day without a set gets none (no chest then)", (await ensureQuestSet(USER, addDays(TODAY, -1), d)) === null && s.commits === 1);

    const sw = await swapQuestCore(USER, "TASK", d);
    check("swap TASK: the next candidate ('Email Sam'), written 'quests:<day>:swap:TASK:1'", sw.ok && sw.value.quest.kind === "TEMPLATE" && sw.value.quest.title === "Email Sam" && s.of("QUEST_SET", `quests:${TODAY}:swap:TASK:1`).length === 1, j(sw));
    const sw2 = await swapQuestCore(USER, "TASK", d);
    check("a second TASK swap without Second look is refused", !sw2.ok && /No swaps left/.test(sw2.error), j(sw2));
    const sp = await swapQuestCore(USER, "PLAN", d);
    const sb = await swapQuestCore(USER, "BODY", d);
    check("PLAN needs Scout; BODY is never swapped", !sp.ok && /Scout/.test(sp.error) && !sb.ok && /can't be swapped/.test(sb.error), j([sp, sb]));
    s.facts = (day) => ({ ...emptyDayFacts(day), doneTemplates: new Set(["t-small"]) });
    s.insert(USER, { source: "PERK", sink: "NONE", day: TODAY, occurredAt: nowOn(TODAY, 8), qty: 1, detail: "D_SWAP", dedupeKey: "perk:D_SWAP:0" });
    const sw3 = await swapQuestCore(USER, "TASK", d);
    check("a done quest cannot be swapped (even with a swap left)", !sw3.ok && /done already/.test(sw3.error), j(sw3));
  }

  // ════ §4 work boards ════
  console.log("\n§4 work-board templates are never quest candidates");
  {
    gateOpen();
    const onlyWork = sourcesOf({
      candidates: [
        cand({ templateId: "w-1", raw: 99, lane: "must", boardId: "wb-1" }),
        cand({ templateId: "w-2", category: "EXERCISE", boardId: "wb-1", recurring: true }),
      ],
      plan: { hasRoadmap: true, practices: [{ templateId: "w-1", roadmapId: "rm1", seat: 1, ord: 1, role: "STEP" }], checkpoints: [], adds: [] },
      reviewsDue: 0,
    });
    const q = pickQuests(onlyWork, () => 0.5);
    check(
      "with only work templates due, every slot falls back (no work template in any slot)",
      j(q.map(questIdentity)) === j(["PLAN:IDEA", "BODY:MOVE:20", "TASK:ANY"]) && !q.some((x) => x.kind === "TEMPLATE"),
      j(q.map(questIdentity))
    );
    const mixed = pickQuests(sourcesOf(), () => 0.5);
    check("the 99-raw work must never outranks a personal task", !mixed.some((x) => x.kind === "TEMPLATE" && x.templateId === "t-work"));
    const ledger: DayLedger = { day: TODAY, rawBefore: 0, lifeXp: 0, completions: [], reviews: 0, reviewXp: 0, ideas: 0, dayOpenQty: null };
    const tpl = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      title: id,
      normTitle: id,
      recurrence: null,
      dueDay: TODAY,
      dueKind: "PLANNED",
      intrinsic: false,
      autoMetric: null,
      mvv: null,
      track: "DUTY",
      band: "STANDARD",
      bandOverride: 0,
      estMinutes: 30,
      machineMinutes: 30,
      kind: "TASK",
      inbox: false,
      category: "HOME",
      ...extra,
    });
    const row = (template: Record<string, unknown>) => ({ key: String(template.id), template, lane: "today", day: TODAY, state: "open", slot: 0, streakDays: 0, projection: { raw: 10 } }) as unknown as BoardRow;
    const cands = questCandidatesOf([row(tpl("mine")), row(tpl("theirs", { boardId: "wb-1" }))], ledger, TODAY);
    check("questCandidatesOf drops a row whose template carries a work board id, and prices the rest at rawBefore 0", cands.length === 1 && cands[0].templateId === "mine" && cands[0].raw > 0, j(cands));
    const src = read("src/lib/momentum-server.ts");
    check(
      "the default store reads the personal Board only: loadTodayBoard(…, PERSONAL_SCOPE) and instances under PERSONAL_BOARD",
      /loadTodayBoard\(userId, day, now, PERSONAL_SCOPE\)/.test(src) && /template: PERSONAL_BOARD/.test(src)
    );
  }

  // ════ §5 the chest ════
  console.log("\n§5 the chest");
  {
    gateOpen();
    const s = new FakeStore();
    const d = depsOf(s);
    s.facts = (day) => ({ ...emptyDayFacts(day), doneTemplates: new Set(["t-practice", "t-big"]) });
    const early = await openChestCore(USER, d);
    check("2 of 3 done: refused, and only the quest set is written", !early.ok && /2 of 3 done/.test(early.error) && s.of("CHEST").length === 0 && s.of("MP_MINT").length === 0, j(early));
    s.facts = (day) => allDone(day);
    const [a, b] = await Promise.all([openChestCore(USER, d), openChestCore(USER, d)]);
    const chests = s.of("CHEST", `chest:${TODAY}`);
    const mints = s.of("MP_MINT", `mp:LIFE_CHEST:${TODAY}`);
    check("a double tap writes one CHEST row and one LIFE_CHEST mint", chests.length === 1 && mints.length === 1 && s.of("CHEST").length === 1, j({ chests: chests.length, mints: mints.length }));
    check(
      "both taps answer with the same chest; exactly one is the duplicate",
      a.ok && b.ok && j(a.value.receipt) === j(b.value.receipt) && [a.value.duplicate, b.value.duplicate].filter(Boolean).length === 1,
      j([a, b])
    );
    const r = a.ok ? a.value.receipt : null;
    check("u1 0.70 → UNCOMMON +8 MP; the receipt stores both rolls; the row is sink NONE (no XP)", !!r && r.tier === "UNCOMMON" && r.mp === 8 && r.xp === 0 && r.u1 === 0.7 && r.u2 === 0.5 && chests[0].sink === "NONE" && chests[0].rawXp === null, j(r));
    check("the mint is 8 MP, dated the chest's day, reason LIFE_CHEST", mints[0].qty === 8 && mints[0].day === TODAY && parseMintDetail(mints[0].detail).reason === "LIFE_CHEST");
    const third = await openChestCore(USER, d);
    check("a later tap returns the stored chest and writes nothing", third.ok && third.value.duplicate && s.of("CHEST").length === 1 && s.of("MP_MINT").length === 1);
    const old = await openChestCore(USER, { ...d, day: addDays(TODAY, -2) });
    check("only today's or yesterday's chest can be opened by tap", !old.ok);
  }

  // ════ §6 auto-open ════
  console.log("\n§6 settleMomentum auto-opens a past ready chest");
  {
    gateOpen();
    const s = new FakeStore();
    const D2 = addDays(TODAY, -2);
    const D3 = addDays(TODAY, -3);
    const pastSet = (day: DayKey): QuestSet => ({
      v: "quests-1",
      day,
      quests: [
        { slot: "PLAN", kind: "IDEA", title: "Capture one idea" },
        { slot: "BODY", kind: "MOVE", minutes: 20, title: "Move 20 min" },
        { slot: "TASK", kind: "ANY", count: 2, title: "Finish any 2 tasks" },
      ],
    });
    for (const day of [D2, D3]) s.insert(USER, { source: "QUEST_SET", sink: "NONE", day, occurredAt: nowOn(day, 6), receipt: pastSet(day) as never, dedupeKey: `quests:${day}` });
    s.facts = (day) => (day === D2 ? { ...emptyDayFacts(day), ideas: 1, moveMinutes: [25], fullTasks: 2 } : day === D3 ? { ...emptyDayFacts(day), ideas: 1 } : emptyDayFacts(day));
    const res = await settleMomentum(USER, TODAY, depsOf(s));
    const c = s.of("CHEST", `chest:${D2}`)[0];
    check("the ready past day's chest is written, dated that day (not today)", !!c && c.day === D2 && res.chests.includes(D2), j({ c, res }));
    check("its receipt is marked auto, and its XP goes to CRAFT ('Finish any 2 tasks')", !!c && (c.receipt as { auto?: boolean }).auto === true && (c.sink === "NONE" || c.track === "CRAFT"), j(c?.receipt));
    check("a past day that was not 3 of 3 gets no chest", s.of("CHEST", `chest:${D3}`).length === 0);
    check("today's quest set was frozen by the same run", s.of("QUEST_SET", `quests:${TODAY}`).length === 1 && res.questSet);
    const before = s.rows.length;
    const again = await settleMomentum(USER, TODAY, depsOf(s));
    check("a second settle writes nothing", s.rows.length === before && !again.wrote, j(again));
    const off = new FakeStore();
    off.insert(USER, { source: "QUEST_SET", sink: "NONE", day: D2, occurredAt: nowOn(D2, 6), receipt: pastSet(D2) as never, dedupeKey: `quests:${D2}` });
    off.facts = s.facts;
    const quiet = await settleMomentum(USER, TODAY, depsOf(off, { writesOn: false }));
    check("with writes on read off (a dev server on the shared database) settle writes nothing", !quiet.wrote && off.commits === 0 && off.attempts === 0);
  }

  // ════ §7 perks ════
  console.log("\n§7 perks");
  {
    gateOpen();
    const s = new FakeStore();
    const d = depsOf(s);
    // Two weeks of 900 Discipline XP count 700 each: 1,400 → 5 points (1,350 ≤ 1,400 < 1,890).
    s.branch = [
      { day: "2026-10-06", source: "TASK", templateId: "t1", xp: 900, category: "HOME", roadmapTemplate: false },
      { day: "2026-10-13", source: "TASK", templateId: "t1", xp: 900, category: "HOME", roadmapTemplate: false },
    ];
    const gate = await buyPerkCore(USER, "D_SPARE", d);
    check("the tier gate: a tier-II perk needs 2 spent in the branch first", !gate.ok && gate.error === "Spend 2 in Discipline first.", j(gate));
    const [a, b] = await Promise.all([buyPerkCore(USER, "D_STEADY", d), buyPerkCore(USER, "D_LINK", d)]);
    const okOne = [a, b].filter((r) => r.ok).length;
    const stale = [a, b].find((r) => !r.ok);
    check("two different buys at once: one lands, the stale-count one is refused", okOne === 1 && !!stale && !stale.ok && stale.error === MOMENTUM_STALE && s.of("PERK").length === 1, j([a, b]));
    const retry = await buyPerkCore(USER, a.ok ? "D_LINK" : "D_STEADY", d);
    check("the refused buy, tried again, reads the new count and lands", retry.ok && !retry.value.duplicate && s.of("PERK").length === 2, j(retry));
    const [c, e] = await Promise.all([buyPerkCore(USER, "D_SWAP", d), buyPerkCore(USER, "D_SWAP", d)]);
    check("a double tap of one perk is one PERK row; both taps answer ok", c.ok && e.ok && s.of("PERK", "perk:D_SWAP:").length === 1 && [c, e].filter((r) => r.ok && r.value.duplicate).length === 1, j([c, e]));
    const row = s.of("PERK", "perk:D_SWAP:")[0];
    check("the PERK row: sink NONE, qty = cost, detail = code, key 'perk:<code>:<epoch>'", row.sink === "NONE" && row.qty === 1 && row.detail === "D_SWAP" && row.dedupeKey === "perk:D_SWAP:0" && !row.countsForStreak);
    const tree = await loadLifeTree(USER, d);
    check(
      "loadLifeTree: Discipline 5 earned, 3 spent, 2 available; the tier-II gate is now open",
      tree.live && tree.branches.DISCIPLINE.earned === 5 && tree.branches.DISCIPLINE.spent === 3 && tree.branches.DISCIPLINE.available === 2 && tree.branches.DISCIPLINE.perks.find((p) => p.perk.code === "D_SPARE")?.state === "learnable",
      tree.live ? j(tree.branches.DISCIPLINE) : "not live"
    );
    const broke = await buyPerkCore(USER, "D_MASS", d);
    check("a capstone with too few points or spent is refused, nothing written", !broke.ok && s.of("PERK").length === 3, j(broke));
  }

  // ════ §8 respec ════
  console.log("\n§8 respec once per 30 life days");
  {
    gateOpen();
    const s = new FakeStore();
    s.branch = [{ day: "2026-10-06", source: "TASK", templateId: "t1", xp: 600, category: "HOME", roadmapTemplate: false }];
    const on = (day: DayKey) => depsOf(s, { now: nowOn(day) });
    const R = TODAY;
    await buyPerkCore(USER, "D_STEADY", on(addDays(R, -1)));
    const empty = await respecCore(USER, depsOf(new FakeStore()));
    check("nothing owned: refused", !empty.ok && /No perks/.test(empty.error));
    const r1 = await respecCore(USER, on(R));
    check("the first respec: the RESPEC row 'respec:<day>', 1 point back", r1.ok && r1.value.refunded === 1 && s.of("RESPEC", `respec:${R}`).length === 1 && r1.value.nextDay === addDays(R, 30), j(r1));
    const t1 = await loadLifeTree(USER, on(R));
    check("after it nothing is owned and the point is available again", t1.live && t1.owned.length === 0 && t1.branches.DISCIPLINE.available === t1.branches.DISCIPLINE.earned && !t1.respec.allowed);
    const again = await buyPerkCore(USER, "D_STEADY", on(R));
    check("re-learning at once writes epoch 1 ('perk:D_STEADY:1')", again.ok && s.of("PERK", "perk:D_STEADY:1").length === 1, j(again));
    const early = await respecCore(USER, on(addDays(R, 10)));
    check("10 days later: refused, 'Next respec in 20 days.'", !early.ok && early.error === "Next respec in 20 days.", j(early));
    const day29 = await respecCore(USER, on(addDays(R, 29)));
    const day30 = await respecCore(USER, on(addDays(R, 30)));
    check("day 29 refused, day 30 allowed", !day29.ok && day30.ok && s.of("RESPEC").length === 2, j([day29, day30]));
  }

  // ════ §9 milestones and checkpoints ════
  console.log("\n§9 milestones and checkpoints");
  {
    gateOpen();
    const s = new FakeStore();
    let captures = 0;
    const moments: MomentsDeps = {
      capture: async () => {
        captures++;
        return { snap: captures };
      },
      detect: async () => [],
    };
    const d = depsOf(s, { moments });
    const D1 = "2026-10-08";
    const ms = (lineageId: string, reachedDay: DayKey, o: Partial<RoadmapPayFacts["milestones"][number]> = {}) => ({
      lineageId,
      roadmapId: "rm1",
      title: `Stage ${lineageId}`,
      track: "CRAFT" as const,
      reachedDay,
      startedDay: "2026-10-06",
      held: false,
      ...o,
    });
    s.pay = {
      milestones: [
        ms("L1", D1),
        ms("L2", D1, { held: true }),
        ms("L3", D1, { startedDay: null }),
        ms("L4", "2026-10-02", { startedDay: "2026-09-20" }),
        ms("L5", addDays(D1, 3)),
        ms("L6", addDays(D1, 5)),
        ms("L1", addDays(D1, 4)),
      ],
      checkpoints: [
        { itemLineageId: "C1", roadmapId: "rm1", label: "Mock test 1", track: "CRAFT", firstLogDay: "2026-10-09", startedDay: "2026-10-06" },
        { itemLineageId: "C0", roadmapId: "rm1", label: "Logged before launch", track: "CRAFT", firstLogDay: "2026-10-03", startedDay: "2026-09-28" },
        { itemLineageId: "C9", roadmapId: "rm1", label: "Never started", track: "CRAFT", firstLogDay: "2026-10-09", startedDay: null },
      ],
    };
    const res = await settleMomentum(USER, TODAY, d);
    const m1 = s.of("MILESTONE", "ms:L1");
    check("a reached, started milestone pays once per lineage: MILESTONE 120 XP dated reachedDay", m1.length === 1 && m1[0].xp === 120 && m1[0].day === D1 && m1[0].sink === "TRACK" && m1[0].track === "CRAFT" && m1[0].rawXp === null && !m1[0].countsForStreak, j(m1));
    check("its LIFE_MILESTONE mint is 50 MP", s.of("MP_MINT", "mp:LIFE_MILESTONE:L1")[0]?.qty === 50);
    check(
      "never held when you began (HELD_AT_START, or never started) and never before launch",
      ["L2", "L3", "L4"].every((l) => s.of("MILESTONE", `ms:${l}`).length === 0 && s.of("MP_MINT", `mp:LIFE_MILESTONE:${l}`).length === 0),
      j(s.of("MILESTONE").map((r) => r.dedupeKey))
    );
    const l6 = s.of("MP_MINT", "mp:LIFE_MILESTONE:L6")[0];
    check(
      "the third in 30 days pays its XP but a 0-MP decision row ('2 milestones paid in the last 30 days')",
      s.of("MP_MINT", "mp:LIFE_MILESTONE:L5")[0]?.qty === 50 && !!l6 && l6.qty === 0 && l6.detail === "LIFE_MILESTONE · 2 milestones paid in the last 30 days" && s.of("MILESTONE", "ms:L6").length === 1,
      j(l6)
    );
    const cp = s.of("CHECKPOINT", "cp:C1");
    check("a checkpoint taken: CHECKPOINT 40 XP dated the log's day, counting for the run; 12 MP", cp.length === 1 && cp[0].xp === 40 && cp[0].day === "2026-10-09" && cp[0].countsForStreak && s.of("MP_MINT", "mp:LIFE_CHECKPOINT:C1")[0]?.qty === 12, j(cp));
    check("no checkpoint logged before launch or of a milestone never started pays", s.of("CHECKPOINT").length === 1);
    check("the run reports what it paid", j(res.milestones) === j(["L1", "L5", "L6"]) && j(res.checkpoints) === j(["C1"]), j(res));
    check("the writes ran inside the moments pattern: one snapshot before, one after", captures === 2, String(captures));
    const n = s.rows.length;
    const again = await settleMomentum(USER, TODAY, d);
    check("idempotent: a second settle writes nothing and takes no snapshot", s.rows.length === n && !again.wrote && captures === 2);
    // The ledger as stored, so the window guard holds and only the row's own key can refuse the replay.
    const L: MomentumLedger = { launch: LAUNCH, units: new Map(), chests: [], perkRows: [], paid: [], bodyKept: new Set(), mints: s.of("MP_MINT") };
    let dup = false;
    try {
      await s.commit(USER, planMilestone(USER, ms("L1", D1), L, NOW, ROLL));
    } catch (err) {
      dup = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
    }
    check("replaying a paid milestone's rows meets its key (P2002) and writes nothing", dup && s.rows.length === n);

    const sc = new FakeStore();
    sc.insert(USER, { source: "PERK", sink: "NONE", day: "2026-10-06", occurredAt: nowOn("2026-10-06", 9), qty: 5, detail: "P_CHEST", dedupeKey: "perk:P_CHEST:0" });
    sc.insert(USER, { source: "PERK", sink: "NONE", day: "2026-10-06", occurredAt: nowOn("2026-10-06", 9), qty: 3, detail: "P_SUMMIT", dedupeKey: "perk:P_SUMMIT:0" });
    sc.pay = { milestones: [ms("S1", D1)], checkpoints: [] };
    await settleMomentum(USER, TODAY, depsOf(sc));
    const summit = sc.of("CHEST", "chest:ms:S1")[0];
    const sr = summit?.receipt as { tier?: string; summit?: boolean } | undefined;
    check("Summit fire pays 150 XP; Summit chest opens a RARE chest 'chest:ms:<lineage>' dated the reach", sc.of("MILESTONE", "ms:S1")[0]?.xp === 150 && !!summit && sr?.tier === "RARE" && sr?.summit === true && summit.day === D1, j(summit));
  }

  // ════ §10 the loaders, live ════
  console.log("\n§10 the loaders, live");
  {
    gateOpen();
    const s = new FakeStore();
    const d = depsOf(s);
    // Active 16, 17, 18; 19 empty (a freeze holds it: the bank starts at 1); today empty so far.
    for (const day of ["2026-10-16", "2026-10-17", "2026-10-18"]) taskRow(s, day, `i-${day}`);
    const view = await loadMomentum(USER, TODAY, d);
    check("before any set is frozen the loader previews the three and writes nothing", view.live && !view.frozen && view.quests.length === 3 && s.commits === 0);
    if (view.live) {
      check(
        "the run: 3 days, yesterday held by the starting freeze, at risk, bank 0",
        view.run.current === 3 && view.run.heldYesterday && view.run.atRisk && view.run.bank === 0 && view.run.grid.length === 35 && view.run.grid[view.run.grid.length - 1].mark === "open",
        j({ ...view.run, grid: view.run.grid.slice(-6) })
      );
      check("the chest is locked at 0 of 3, with the published odds", view.chest.state === "locked" && view.chest.done === 0 && view.chest.of === 3 && Math.round(view.chest.odds.rare) === 12);
    }
    const quiet = await loadNudgeFacts(USER, nowOn(TODAY, 20), depsOf(s, { writesOn: false }));
    check("with writes on read off the nudge previews the three and writes nothing", quiet.atRisk && quiet.quest?.slot === "BODY" && s.commits === 0);
    const nf = await loadNudgeFacts(USER, nowOn(TODAY, 20), d);
    check("the nudge at 20:00: in the window, run 3, no action, not claimed: at risk, naming the Body quest first", nf.live && nf.inWindow && nf.run === 3 && nf.atRisk && nf.quest?.slot === "BODY" && nf.hoursLeft === 8, j(nf));
    check("with writes on, the nudge freezes the day's set when none exists (ensureQuestSet)", s.of("QUEST_SET", `quests:${TODAY}`).length === 1);
    s.prefsRow = { nudge: "off", flameSkin: null };
    const offN = await loadNudgeFacts(USER, nowOn(TODAY, 20), d);
    check("UserPrefs.nudge 'off' is respected", !offN.atRisk && !offN.nudgeOn);
    s.prefsRow = null;
    taskRow(s, TODAY, "i-today");
    const kept = await loadNudgeFacts(USER, nowOn(TODAY, 20), d);
    check("once today has a momentum action it is no longer at risk", !kept.atRisk && kept.actionDone && kept.run === 4, j(kept));
    const commits = s.commits;
    const fresh = await loadMomentum(USER, TODAY, d);
    check("loadMomentum never writes; with the set frozen it reads it (frozen) and offers the TASK swap", fresh.live && s.commits === commits && fresh.frozen && fresh.quests.find((q) => q.slot === "TASK")?.swapsLeft === 1, fresh.live ? j(fresh.quests) : "not live");
  }

  // ── sources ──
  console.log("\n§11 sources");
  {
    const src = read("src/lib/momentum-server.ts");
    const actions = read("src/app/actions/momentum.ts");
    check("momentum-server has no unkeyed draw (momentum-check scans src/lib/momentum*.ts too)", !/Math\.random|getRandomValues|randomBytes|randomUUID|randomInt\b/.test(src));
    check("every chance is momentumRoll over a momentum.ts key", /momentumRoll\(key\)/.test(src) && /chestKey\(p\.userId, p\.day, 1\)/.test(src) && /questTieKey\(userId, day, templateId\)/.test(src));
    check("mints go through mastery.ts mintLifeMasteryOps; no MasteryLedgerEntry write of its own", /mintLifeMasteryOps\(userId, m\)/.test(src) && !/masteryLedgerEntry\s*\.\s*(create|createMany|upsert|update)/.test(src));
    check("roadmap tables are read only from momentum-server", !/roadmap(Milestone|Item|Reading|QuestWeek)?\s*\.\s*(create|createMany|upsert|update|updateMany|delete|deleteMany)\b/.test(src));
    check("the paying writes open with lifeLockOp", /if \(w\.lock\) ops\.push\(lifeLockOp\(userId\)\)/.test(src));
    check(
      "actions: 'use server', and every export an async function that never throws (run(...) catches)",
      actions.startsWith('"use server";') && (actions.match(/^export async function \w+/gm) ?? []).length === 6 && !/^export (const|let|function) /m.test(actions) && /catch \(err\)/.test(actions)
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
