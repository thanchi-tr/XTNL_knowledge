/**
 * Blueprint P31 (2.5; decision D35; harm H14's safer variant): side quests. src/lib/side-quests.ts (the rules, the
 * detectors and their words), side-quests-server.ts (the run, through stubs), settlement.ts's step and the life cron,
 * the '#side' capture (capture-parse, capture-shape, tasks.ts's stored key), the board (placement, the row, the counts,
 * the expiry), the weekly audit's lane, the phone's row JSON and the rules page. Pure: no database, no network, no model;
 * every launch day is passed in, so it holds whatever SIDE_QUESTS_LAUNCH_DAY is and passes with the override on too.
 * PASS/FAIL per line; exits 1 on any failure.
 *
 *   npx tsx scripts/side-quests-check.ts      (npm run side-quests:check; life:check runs it after review-fatigue-check)
 *
 *   §1 the switch: null in code, the XTNL_ override honoured only outside production, sideQuestsOn from the launch day
 *   §2 the key: 'side:<detector>:<scope>:<YYYY-Www>' and 'side:tag:<key>', read back; no client key ever reads as one
 *   §3 the '#side' line: a plain one-off with an expiry (the day named, else 2 days on), never a must, never in the
 *      inbox; not taken on a line that repeats, a goal or an idea; the shape capture-shape stores
 *   §4 the board: its row says "Side quest · expires Fri" (in ink, its glyph), asks nothing while open, never a quest
 *      candidate, never suggested to move, never moved or deferred past its expiry, never on Close the day's list; once
 *      its day is over it is gone at no cost (no late row, its tick refused, never 'Already on your board'); every
 *      other row is exactly as before
 *   §5 never a must, never debt: no daily-quest slot, no effect on the must cap, never read by settlement
 *   §6 the detectors: body from Thursday under half the floor, a must missed twice, a habit one miss from a lower rung,
 *      a deadline more than 3 days overdue (a decision on it, never its own work); nothing on a held day; at most 2
 *      open; a key once a week, a subject once
 *   §7 the run and the step: nothing read while off or with writes off; a detector's write is an ordinary one-off with
 *      its week's key; the open count read again before each write (a '#side' line saved meanwhile takes the slot);
 *      idempotent per week; the chain throttled, the cron not; the cron's answer unchanged while off; personal Board
 *      only (no CRM read anywhere)
 *   §8 the audit: out of the rate, on a lane of its own, frozen with the copy only when the week had one
 *   §9 published: the phone's row JSON and docs, Android, the rules page, the web row, the package
 */
import "./_no-model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { addDays, weekKeyOf, type DayKey } from "../src/lib/life-day";
import type { BoardPlace, ParsedCapture } from "../src/lib/life-types";
import { normTitleOf } from "../src/lib/life-lexicon";
import { parseCapture } from "../src/lib/capture-parse";
import { captureShapeOf } from "../src/lib/capture-shape";
import { parseRule } from "../src/lib/recurrence";
import { statsFor, buildBoard, placeOf, completionBlockOf, cheapestMovable, asksToday, moveBlockOf, type BoardData, type BoardInstance, type BoardTemplate, type DayLedger } from "../src/lib/today-board";
import { closeItemsOf, tomorrowOffer } from "../src/components/today/board-ui";
import { planDefer, type DecisionTemplate } from "../src/lib/task-decisions";
import { mustCapOf, takesQuestSlotOn, dailyQuestsOf } from "../src/lib/daily-quests";
import { questCandidatesOf } from "../src/lib/momentum-server";
import { dutyTemplateOf } from "../src/lib/today-board";
import { HABIT_ALPHA, rungOf } from "../src/lib/habit";
import {
  SIDE_CAPTURE_SOURCE,
  SIDE_CAP_LINE,
  SIDE_DETECTORS,
  SIDE_EXPIRY_DAYS,
  SIDE_KEY_PREFIX,
  SIDE_LATE_DAYS,
  SIDE_MUST_MISSES,
  SIDE_NOT_A_MUST,
  SIDE_ONE_OFF_ONLY,
  SIDE_OPEN_MAX,
  SIDE_PREPARE_MINUTES,
  SIDE_QUESTS_LAUNCH_DAY,
  SIDE_QUESTS_LAUNCH_DAY_ENV,
  bodyFloorOf,
  bodyLowOf,
  daysLateOf,
  isSideDetectorKey,
  isSideQuestKey,
  mustMissesOf,
  parseSideQuestKey,
  parseSideWeek,
  planSideQuests,
  rungLostOnMiss,
  sideAuditLine,
  sideExpiredOn,
  sideExpiredRefusalOf,
  sideExpiryOf,
  sideLabelOf,
  sideMoveRefusalOf,
  sideOpenOn,
  sideParsedOf,
  sideQuestCandidatesOf,
  sideQuestKeyOf,
  sideQuestsLaunchDay,
  sideQuestsOn,
  sideRuleLines,
  sideTagExpiryOf,
  sideTagKeyOf,
  sideWeekOf,
  SIDE_WORK_LABEL,
  type SideQuestFacts,
  type SideQuestTemplate,
} from "../src/lib/side-quests";
import { runSideQuests } from "../src/lib/side-quests-server";
import { SIDE_CHAIN_EVERY_MS, runLifeCron, runSideQuestStep, type SideQuestRunner } from "../src/lib/settlement";
import { activeTitlesOf, sideSendKeysOf, sideStoreOf, storedCaptureKeyOf } from "../src/lib/tasks";
import { auditReceiptOf, frozenAuditOf, parseAuditReceipt, weekAuditOf, type AuditTemplate } from "../src/lib/week-audit";
import { checkTasksOf, checkWeekOf } from "../src/lib/mobile-api";
import { WeekAuditCard } from "../src/components/home/WeekAudit";
import { BODY_EFFORT_MINUTES } from "../src/lib/life-economy";
import { MUSTS_PER_DAY_MAX } from "../src/lib/duty-economy";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function eq(name: string, got: unknown, want: unknown): void {
  check(name, same(got, want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

/** The side quests' launch day in this check (any day: the code constant stays null until the user's go). */
const L: DayKey = "2026-10-19";
// Wednesday 21 October 2026 (W43), 10:00 AEDT; Thursday 22 and Sunday 25 the same week.
const WED: DayKey = "2026-10-21";
const THU: DayKey = "2026-10-22";
const FRI: DayKey = "2026-10-23";
const SUN: DayKey = "2026-10-25";
const MON: DayKey = "2026-10-19";
const W43 = weekKeyOf(WED);
const at = (day: DayKey, hh = 10) => new Date(`${day}T${String(hh).padStart(2, "0")}:00:00+11:00`);

function tpl(p: Partial<BoardTemplate> & { id: string; title: string }): BoardTemplate {
  return {
    normTitle: normTitleOf(p.title),
    recurrence: null,
    dueDay: null,
    dueKind: null,
    intrinsic: false,
    autoMetric: null,
    mvv: null,
    track: "DUTY",
    band: "STANDARD",
    bandOverride: 0,
    estMinutes: 20,
    machineMinutes: 30,
    kind: "TASK",
    inbox: false,
    startDay: "2026-06-01",
    horizon: null,
    parentId: null,
    krMetric: null,
    krTarget: null,
    krUnit: null,
    compulsory: false,
    autoTarget: null,
    category: "OTHER",
    lexicalBand: p.band ?? "STANDARD",
    aiBand: null,
    gradeSource: "LEXICAL",
    gradeConfidence: 0.4,
    gradeBasis: null,
    gradeModel: null,
    gradePromptVersion: null,
    gradeAttempts: 1,
    gradeFrozen: true,
    sizing: false,
    bandOverrideAt: null,
    gradeFrozenAt: null,
    topAttribute: null,
    note: null,
    completedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    sortOrder: 0,
    ...p,
  };
}
const ledger = (day: DayKey, p: Partial<DayLedger> = {}): DayLedger => ({ day, rawBefore: 0, lifeXp: 0, completions: [], reviews: 0, reviewXp: 0, ideas: 0, dayOpenQty: null, ...p });
let seq = 0;
const inst = (templateId: string, day: DayKey, status: BoardInstance["status"] = "DONE"): BoardInstance => ({ id: `i${++seq}`, templateId, day, slot: 0, status, source: "manual", xpPaid: 0 });
function data(today: DayKey, templates: BoardTemplate[], history: BoardInstance[] = []): BoardData {
  const stats: BoardData["stats"] = {};
  for (const t of templates) {
    const rule = parseRule(t.recurrence);
    if (rule) stats[t.id] = statsFor(t, rule, history.filter((i) => i.templateId === t.id), today);
  }
  return {
    today,
    yesterday: addDays(today, -1),
    capacityMin: 240,
    templates,
    instances: history,
    stats,
    ledger: { today: ledger(today), yesterday: ledger(addDays(today, -1)) },
    paid: {},
    goalQty: {},
    dueNow: 0,
  };
}
const sideTpl = (id: string, expires: DayKey, over: Partial<BoardTemplate> = {}) =>
  tpl({ id, title: "20-minute walk", track: "BODY", category: "EXERCISE", dueDay: expires, dueKind: "DEADLINE", captureKey: sideQuestKeyOf("body", "week", W43), startDay: MON, ...over });

(async () => {
  // ══ §1 the switch ══════════════════════════════════════════════════════════

  console.log("— §1 the switch —");
  check("SIDE_QUESTS_LAUNCH_DAY is null in code: the detectors ship inert (D35; flipped only on the user's go)", SIDE_QUESTS_LAUNCH_DAY === null);
  check("its override is XTNL_SIDE_QUESTS_LAUNCH_DAY", SIDE_QUESTS_LAUNCH_DAY_ENV === "XTNL_SIDE_QUESTS_LAUNCH_DAY");
  eq(
    "the override is honoured outside production only, and only as a valid day",
    [
      sideQuestsLaunchDay({ XTNL_SIDE_QUESTS_LAUNCH_DAY: L }),
      sideQuestsLaunchDay({ NODE_ENV: "development", XTNL_SIDE_QUESTS_LAUNCH_DAY: ` ${L} ` }),
      sideQuestsLaunchDay({ NODE_ENV: "production", XTNL_SIDE_QUESTS_LAUNCH_DAY: L }),
      sideQuestsLaunchDay({ XTNL_SIDE_QUESTS_LAUNCH_DAY: "soon" }),
      sideQuestsLaunchDay({}),
    ],
    [L, L, SIDE_QUESTS_LAUNCH_DAY, SIDE_QUESTS_LAUNCH_DAY, SIDE_QUESTS_LAUNCH_DAY]
  );
  eq("sideQuestsOn: on and after the launch day, never with none", [sideQuestsOn(addDays(L, -1), L), sideQuestsOn(L, L), sideQuestsOn(WED, L), sideQuestsOn(WED, null)], [false, true, true, false]);

  // ══ §2 the key ═════════════════════════════════════════════════════════════

  console.log("— §2 the key —");
  const k = sideQuestKeyOf("must", "cmtpl0000000000000000001", W43);
  eq("a detector's key is 'side:<detector>:<scope>:<YYYY-Www>' and reads back", [k, parseSideQuestKey(k)], ["side:must:cmtpl0000000000000000001:2026-W43", { detector: "must", scope: "cmtpl0000000000000000001", weekKey: "2026-W43" }]);
  check("a detector's key is a capture key the column takes (4-64 plain characters)", /^[A-Za-z0-9:_-]{4,64}$/.test(k) && /^[A-Za-z0-9:_-]{4,64}$/.test(sideQuestKeyOf("body", "week", W43)));
  eq("a '#side' line's key is 'side:tag:<the line's key>'; it is a side quest's, never a detector's", [sideTagKeyOf("n1abc"), isSideQuestKey(sideTagKeyOf("n1abc")), isSideDetectorKey(sideTagKeyOf("n1abc")), isSideDetectorKey(k)], ["side:tag:n1abc", true, false, true]);
  eq("any other key is no side quest's: a roadmap row's, a nonce, the phone's, none", [isSideQuestKey("rm:m1:p0"), isSideQuestKey("n1abc"), isSideQuestKey("mobile:c1"), isSideQuestKey(null), parseSideQuestKey("side:nope:x")], [false, false, false, false, null]);
  eq("the detectors, in the order a slot goes to them (D35's)", SIDE_DETECTORS, ["body", "must", "rung", "late"]);
  check("a detector's template's channel is 'trigger' (TaskTemplate.captureSource, no CHECK on the column)", SIDE_CAPTURE_SOURCE === "trigger" && /"captureSource" TEXT NOT NULL DEFAULT 'quick'/.test(read("prisma/migrations/20261005000000_life_core/migration.sql")));
  eq(
    "tasks.ts storedCaptureKeyOf: a '#side' line keeps its key under 'side:tag:'; any other line its own, but never one that reads as a side quest's",
    [storedCaptureKeyOf("n1abc", true), storedCaptureKeyOf("n1abc", false), storedCaptureKeyOf(null, false), storedCaptureKeyOf("side:body:week:2026-W43", false), isSideQuestKey(storedCaptureKeyOf(null, true))],
    ["side:tag:n1abc", "n1abc", null, null, true]
  );

  // ══ §3 the '#side' line ════════════════════════════════════════════════════

  console.log("— §3 the '#side' line —");
  const p1 = parseCapture("fix the bike #side", { today: WED });
  eq(
    "'fix the bike #side': a side quest, its chip naming its expiry (2 days on: Fri), the tag out of the title",
    [p1.side, p1.title, p1.tokens.find((t) => t.field === "side")?.label, p1.compulsory, p1.recurrence],
    [true, "Fix the bike", "Side quest · expires Fri", false, null]
  );
  eq("capture-shape stores it as a one-off TASK, its expiry a DEADLINE 2 days on, never a must, never in the inbox", captureShapeOf(p1, WED), {
    kind: "TASK",
    recurrence: null,
    startDay: WED,
    dueDay: addDays(WED, SIDE_EXPIRY_DAYS),
    dueKind: "DEADLINE",
    compulsory: false,
    inbox: false,
    note: null,
  });
  const p2 = parseCapture("call the plumber #side sat", { today: WED });
  eq("a day it names is its expiry, a deadline ('#side sat': Sat)", [p2.side, p2.dueKind, captureShapeOf(p2, WED).dueDay, p2.tokens.find((t) => t.field === "side")?.label], [true, "DEADLINE", "2026-10-24", "Side quest · expires Sat"]);
  const p3 = parseCapture("pay the fine #side fri !", { today: WED });
  eq("a Must mark is not taken on a side line (its chip says so): never a must", [p3.side, p3.compulsory, p3.tokens.find((t) => t.field === "compulsory")?.label, captureShapeOf(p3, WED).compulsory], [true, false, SIDE_NOT_A_MUST, false]);
  const p4 = parseCapture("stretch #side daily", { today: WED });
  eq("on a line that repeats the tag is not taken (its chip says so); the line saves as it reads without it", [p4.side ?? false, p4.recurrence, p4.tokens.find((t) => t.field === "side")?.label, captureShapeOf(p4, WED).recurrence], [false, "DAILY", SIDE_ONE_OFF_ONLY, "DAILY"]);
  const p5 = parseCapture("goal: run a marathon #side", { today: WED });
  eq("a goal never takes it (the word stays title text)", [p5.side ?? false, p5.kind, p5.tokens.some((t) => t.field === "side")], [false, "GOAL", false]);
  const p6 = parseCapture("sort the garage #side?", { today: WED });
  eq("the Inbox mark is not taken on a side line (a side quest waits on the board, not in the inbox)", [p6.side, p6.inbox, captureShapeOf(p6, WED).inbox], [true, false, false]);
  const plain = parseCapture("fix the bike fri", { today: WED });
  check("a line with no '#side' carries no side key and is shaped exactly as before", !("side" in plain) && captureShapeOf(plain, WED).dueKind === "PLANNED");
  const reverted = parseCapture("fix the bike #side", { today: WED, reverted: [{ start: 13, end: 18 }] });
  check("turning the chip back into text restores the line (no side quest, '#side' in the title)", !reverted.side && reverted.title.includes("#side"));
  eq("sideTagExpiryOf: the day named (today at the earliest), else 2 days on", [sideTagExpiryOf(WED, FRI), sideTagExpiryOf(WED, MON), sideTagExpiryOf(WED, null)], [FRI, WED, FRI]);
  const ins = code("src/lib/tasks.ts");
  // Re-pinned for blueprint P31 review: the stored key is sideStoreOf's (a resent line finds its first send's row first).
  check(
    "tasks.ts insertCapture: '#side' only on the personal Board and only while fewer than SIDE_OPEN_MAX are open (else an ordinary task, never a must, with SIDE_CAP_LINE); a resent line first finds its first send's row under either key; a detector's trigger writes its own key, note and size",
    /const sideAsked = !!parsed\.side && !boardId && !opts\.trigger;/.test(ins) &&
      /if \(opts\.trigger\) captureKey = opts\.trigger\.key;\s*else if \(sideAsked\) \{\s*const earlier = lineKey \? await prisma\.taskTemplate\.findFirst\(\{ where: \{ userId, captureKey: \{ in: sideSendKeysOf\(lineKey\) \} \}, select: \{ captureKey: true \} \}\) : null;\s*const store = sideStoreOf\(lineKey, earlier\?\.captureKey \?\? null, earlier \? 0 : await countOpenSideQuests\(userId, today, opts\.replacing\)\);/.test(ins) &&
      /\} else captureKey = storedCaptureKeyOf\(lineKey, false\);/.test(ins) &&
      /sizeLexically\(opts\.trigger\?\.sizeAs \?\? title,/.test(ins) &&
      /sideNote: duplicate \|\| !sideCapped \? null : \{ capped: true, line: SIDE_CAP_LINE \}/.test(ins) &&
      /captureKey: \{ in: \[captureKey, sideTagKeyOf\(captureKey\)\] \}/.test(ins)
  );
  eq(
    "a resent '#side' line is stored under its first send's key whichever way the cap went (one open: the first send took the second slot; the resend, two open, finds it): never a second row",
    [sideStoreOf("k1", null, 1), sideStoreOf("k1", sideTagKeyOf("k1"), 2), sideStoreOf("k1", null, 2), sideStoreOf("k1", "k1", 0), sideSendKeysOf("k1")],
    [{ captureKey: "side:tag:k1", capped: false }, { captureKey: "side:tag:k1", capped: false }, { captureKey: "k1", capped: true }, { captureKey: "k1", capped: true }, ["k1", "side:tag:k1"]]
  );
  check("…a key that reads as a side quest's is looked up only under 'side:tag:' (it is never stored as itself)", same(sideSendKeysOf("side:x"), ["side:tag:side:x"]));
  const wk = parseCapture("call the supplier #side fri !", { today: WED, work: true });
  eq(
    "on a work tab '#side' is not taken (its chip says so) and the line reads as typed: its Must and its day (a must's planned day a deadline, R8), never a side quest",
    [wk.side ?? false, wk.compulsory, wk.dueKind, wk.tokens.find((t) => t.field === "side")?.label, wk.tokens.find((t) => t.field === "compulsory")?.label === SIDE_NOT_A_MUST],
    [false, true, "DEADLINE", SIDE_WORK_LABEL, false]
  );
  check(
    "…and the server reads a work tab's '#side' line that way (insertCapture parses it again with `work`, the line's own spans)",
    /const parsed: ParsedCapture = boardId && given\.side \? parseCapture\(opts\.rawText, \{ today, reverted: opts\.reverted \? \[\.\.\.opts\.reverted\] : undefined, work: true \}\) : given;/.test(ins) &&
      /reverted: line\.reverted \}\);/.test(code("src/app/actions/capture.ts")) &&
      /reverted: prepared\.reverted \}\);/.test(code("src/app/actions/capture.ts")) &&
      /parseCapture\(text, \{ today: day, reverted, work: onWork \}\)/.test(code("src/components/capture/QuickCapture.tsx"))
  );
  check("the cap's line and the toast's head say it plainly", SIDE_CAP_LINE === "Two side quests are open, the most at a time. Saved as an ordinary task." && /item\.sideNote \? "Added \(not a side quest\)"/.test(code("src/components/capture/capture-ui.ts")));

  // ══ §4 the board ═══════════════════════════════════════════════════════════

  console.log("— §4 the board —");
  const chore = tpl({ id: "chore", title: "Vacuum", dueDay: FRI, dueKind: "DEADLINE" });
  const walk = sideTpl("walk", FRI);
  const b1 = buildBoard(data(WED, [chore, walk]));
  const wr = b1.todayRows.find((r) => r.template.id === "walk");
  eq("its row: Today's lane, 'Side quest · expires Fri', never late, side.expiresDay its expiry", [wr?.lane, wr?.dueLabel, wr?.late, wr?.side], ["today", "Side quest · expires Fri", false, { expiresDay: FRI }]);
  const cr = b1.todayRows.find((r) => r.template.id === "chore");
  check("every other row is exactly as before: no side key at all ('by Fri')", !!cr && !("side" in cr) && cr.dueLabel === "by Fri");
  eq("open, it asks nothing of the day: not counted due, never keeps the board from clear, no capacity", [b1.counts.due, asksToday(wr!), b1.planned], [1, false, cr!.estMinutes]);
  const onlySide = buildBoard(data(WED, [walk]));
  check("with only a side quest open the board is clear (letting it go costs nothing)", onlySide.clear && onlySide.counts.due === 0);
  const doneSide = buildBoard(data(WED, [{ ...walk, completedAt: at(WED).toISOString() }], [inst("walk", WED)]));
  const dr = doneSide.todayRows.find((r) => r.template.id === "walk");
  check("done, it counts like any row (asks, kept)", !!dr && dr.state === "done" && asksToday(dr));
  eq("its place is its own words (the capture toast says it)", placeOf(walk, WED), { lane: "planned", label: "Side quest · expires Fri" } satisfies BoardPlace);
  eq("a far expiry waits in Anytime in the same words", placeOf(sideTpl("far", "2026-11-04"), WED), { lane: "anytime", label: "Anytime · Side quest · expires 4 Nov" });
  const gone = buildBoard(data(SUN, [walk]));
  check("its day over (Sun, it expired Fri): no row anywhere, never late, nothing owed", ![...gone.must, ...gone.todayRows, ...gone.yesterdayRows, ...gone.anytime].some((r) => r.template.id === "walk") && gone.counts.due === 0);
  eq("its place then reads 'Side quest · expired'", placeOf(walk, SUN), { lane: "done", label: "Side quest · expired" });
  const dayAfter = buildBoard(data(addDays(FRI, 1), [walk]));
  const yr = dayAfter.yesterdayRows.find((r) => r.template.id === "walk");
  check("the day after, yesterday's record window still holds it (as it holds any deadline), never a late row today", !!yr && yr.dueLabel === "Side quest · by yesterday" && !dayAfter.todayRows.some((r) => r.template.id === "walk"));
  eq(
    "its tick is refused once its day is over (a stale screen, the phone's last /check), at no cost; on its day and yesterday's window it is taken",
    [
      completionBlockOf({ t: walk, rule: null, day: addDays(FRI, 1), today: addDays(FRI, 1), lastDone: null, onDay: [] }),
      completionBlockOf({ t: walk, rule: null, day: FRI, today: addDays(FRI, 1), lastDone: null, onDay: [] }),
      completionBlockOf({ t: walk, rule: null, day: FRI, today: FRI, lastDone: null, onDay: [] }),
    ],
    [sideExpiredRefusalOf(FRI), null, null]
  );
  check("…in plain words", sideExpiredRefusalOf(FRI) === "This side quest expired at the end of Fri. Letting it go costs nothing.");
  check("never suggested to move when the day is over capacity (cheapestMovable)", cheapestMovable([wr!]) === null && cheapestMovable([cr!]) === cr);
  eq(
    "never moved past its expiry (moveBlockOf, the drawer's Tomorrow and rescheduleCore alike): on Fri, its last day, Tomorrow is refused in plain words; within its days it moves",
    [moveBlockOf(walk, addDays(FRI, 1), FRI), tomorrowOffer(walk, FRI), moveBlockOf(walk, THU, WED), moveBlockOf(chore, addDays(FRI, 3), FRI)],
    [sideMoveRefusalOf(FRI, FRI), { show: false, reason: sideMoveRefusalOf(FRI, FRI) }, null, null]
  );
  check("…its words", sideMoveRefusalOf(FRI, FRI) === "This side quest expires today, so it can't move past that. Letting it go costs nothing." && sideMoveRefusalOf(FRI, WED) === "This side quest expires Fri, so it can't move past that. Letting it go costs nothing.");
  check("…rescheduleCore reads its key for that rule", /select: \{ recurrence: true, compulsory: true, dueDay: true, dueKind: true, completedAt: true, archivedAt: true, kind: true, captureKey: true \}/.test(code("src/lib/tasks.ts")) && /captureKey: row\.captureKey,\s*\},\s*target,\s*today\s*\);/.test(code("src/lib/tasks.ts")));
  const dt = (over: Partial<DecisionTemplate> = {}): DecisionTemplate => ({ id: "walk", kind: "TASK", inbox: false, recurrence: null, startDay: MON, dueDay: FRI, dueKind: "DEADLINE", planDay: null, compulsory: false, autoMetric: null, completed: false, archived: false, deferUntil: null, pendingArchiveDay: null, captureKey: walk.captureKey, ...over });
  const defer = (t: DecisionTemplate, until: string) => planDefer(t, [], { id: "d1", until: new Date(until), now: at(WED), reason: "No time", reasonTag: "NO_TIME" });
  const pastExpiry = defer(dt(), "2026-10-24T09:00:00+11:00");
  eq(
    "never deferred past its expiry (task-decisions planDefer): Sat refused, Fri taken; an ordinary deadline still defers past its day",
    [pastExpiry.ok ? null : pastExpiry.error, defer(dt(), "2026-10-23T09:00:00+11:00").ok, defer(dt({ captureKey: null }), "2026-10-24T09:00:00+11:00").ok],
    [sideMoveRefusalOf(FRI, WED), true, true]
  );
  check(
    "…the drawer offers no Defer… on a side quest (Abort… still drops it); the server reads its key",
    /\{props\.onDefer && !completesItself\(t\.autoMetric\) && !row\.side && \(/.test(read("src/components/today/TaskDrawer.tsx")) && /captureKey: true,\s*\} satisfies Prisma\.TaskTemplateSelect;/.test(code("src/lib/task-decisions-server.ts")) && /captureKey: r\.captureKey \?\? null,/.test(code("src/lib/task-decisions-server.ts"))
  );
  const close = closeItemsOf({ must: b1.must, todayRows: b1.todayRows, today: WED, live: true });
  check("never on Close the day's list (it asks nothing of the day); an ordinary one-off still is", !close.some((i) => i.title === walk.title) && close.some((i) => i.title === chore.title) && !closeItemsOf({ must: b1.must, todayRows: b1.todayRows, today: WED, live: false }).some((i) => i.title === walk.title));
  const titles = (day: DayKey) => activeTitlesOf({ today: day, yesterday: addDays(day, -1), templates: [walk, chore], instances: [], stats: {} }).map((x) => x.title);
  eq("expired, never 'Already on your board' (tasks.ts activeTitlesOf, the sheet's note), so it takes no place in the count; an ordinary deadline still is", titles(addDays(FRI, 1)), [chore.title]);
  check("…open, on its days, it is", titles(FRI).includes(walk.title) && titles(FRI).includes(chore.title));
  const cands = questCandidatesOf([...b1.must, ...b1.todayRows, ...b1.anytime], b1.today === WED ? ledger(WED) : ledger(WED), WED);
  check("never Today's quest: momentum-server questCandidatesOf drops a side quest's row", cands.some((c) => c.templateId === "chore") && !cands.some((c) => c.templateId === "walk"));
  eq("sideExpiredOn / sideOpenOn", [sideExpiredOn(walk, FRI), sideExpiredOn(walk, SUN), sideOpenOn(walk, FRI), sideOpenOn({ ...walk, completedAt: "x" }, FRI), sideOpenOn({ ...walk, archivedAt: new Date() }, FRI), sideOpenOn(chore, FRI)], [false, true, true, false, false, false]);
  eq("its words: expires today, tomorrow, a weekday, a date; once gone, expired", [sideLabelOf(WED, WED), sideLabelOf(THU, WED), sideLabelOf(FRI, WED), sideLabelOf("2026-11-04", WED), sideLabelOf(WED, THU)], [
    "Side quest · expires today",
    "Side quest · expires tomorrow",
    "Side quest · expires Fri",
    "Side quest · expires 4 Nov",
    "Side quest · expired yesterday",
  ]);

  // ══ §5 never a must, never debt ════════════════════════════════════════════

  console.log("— §5 never a must, never debt —");
  check("a side quest takes no daily-quest slot (daily-quests takesQuestSlotOn), so the must cap never counts it", ![WED, THU, FRI].some((d) => takesQuestSlotOn(dutyTemplateOf(walk), d)));
  const fourMusts = ["a", "b", "c", "d"].map((id) => dutyTemplateOf(tpl({ id, title: id, recurrence: "DAILY", compulsory: true })));
  eq(
    "the must cap is the same with side quests standing as without (their rows are never compulsory)",
    mustCapOf([...fourMusts, dutyTemplateOf(walk), dutyTemplateOf(sideTpl("w2", THU))], { ...dutyTemplateOf(tpl({ id: "e", title: "e", recurrence: "DAILY" })), compulsory: true }, WED),
    mustCapOf(fourMusts, { ...dutyTemplateOf(tpl({ id: "e", title: "e", recurrence: "DAILY" })), compulsory: true }, WED)
  );
  check("…and the cap is still five", MUSTS_PER_DAY_MAX === 5);
  check("never in the Must lane, never a daily quest", dailyQuestsOf(b1).total === 0 && b1.must.length === 0);
  const settleSrc = code("src/lib/settlement.ts");
  check(
    "settlement reads only recurring templates, compulsory one-offs and those with a pending rule change (a must's), so a side quest (a non-compulsory one-off, never a must, so never a rule edit) never reaches Duty; and it charges only a must's miss: no MISSED, no DEBT",
    /\{ OR: \[\{ recurrence: \{ not: null \} \}, \{ compulsory: true \}, \{ pendingChange: \{ not: Prisma\.DbNull \} \}\] \}/.test(settleSrc) &&
      /for \(const r of open\) if \(r\.compulsory\) misses\.push\(\{ r, slot: 0 \}\);/.test(code("src/lib/settlement-plan.ts"))
  );
  check(
    "capture-shape: a side line's shape is compulsory false whatever the line says; a detector's draft is never a must",
    /compulsory: false, inbox: false, note: null \};/.test(code("src/lib/capture-shape.ts")) && sideParsedOf({ title: "x", track: "BODY", estMinutes: 20, expiresDay: FRI }).compulsory === false
  );

  // ══ §6 the detectors ═══════════════════════════════════════════════════════

  console.log("— §6 the detectors —");
  eq("Body's floor is the kept week's (150, pro-rated by rest days) and the line half of it (75)", [bodyFloorOf(0), bodyFloorOf(2).floor, BODY_EFFORT_MINUTES], [{ floor: 150, under: 75 }, 107.1, 150]);
  eq(
    "Body: from Thursday only, under half the floor (74 fires, 75 does not; Wednesday never; rest days lower the line)",
    [bodyLowOf({ today: WED, effortMinutes: 0, restDays: 0 }), bodyLowOf({ today: THU, effortMinutes: 74, restDays: 0 }), bodyLowOf({ today: THU, effortMinutes: 75, restDays: 0 }), bodyLowOf({ today: SUN, effortMinutes: 60, restDays: 2 }), bodyLowOf({ today: SUN, effortMinutes: 50, restDays: 2 })],
    [false, true, false, false, true]
  );
  eq("a must's misses are its '0' cells only (never a skip, a held day, an open one or one to come)", [mustMissesOf(["0", "1", "0", "s", "h", "o", "f"]), mustMissesOf(["0", "m", "s", "-", "o", "f", "f"])], [2, 1]);
  const est = 0.62;
  eq(
    "a rung lost on one miss: S × (1 − α) under its floor (Established at 0.62); none at 0.70 or at Seeded",
    [rungLostOnMiss(est), rungOf(est * (1 - HABIT_ALPHA)), rungLostOnMiss(0.7), rungLostOnMiss(0.1), rungLostOnMiss(null)],
    ["Established", "Forming", null, null, null]
  );
  eq("a deadline's days late", [daysLateOf(MON, FRI), daysLateOf(FRI, FRI), daysLateOf(SUN, FRI)], [4, 0, 0]);
  eq("a detector's expiry: 2 days on, never past the week's Sunday (its key is the week's)", [sideExpiryOf(WED), sideExpiryOf(THU), sideExpiryOf("2026-10-24"), sideExpiryOf(SUN)], [FRI, "2026-10-24", SUN, SUN]);

  const T = (id: string, over: Partial<SideQuestTemplate> = {}): SideQuestTemplate => ({ id, title: id, track: "DUTY", intrinsic: false, autoMetric: null, mvv: null, captureKey: null, ...over });
  const gymRow = { lane: "today", day: THU, state: "open", strength: 0.62, late: false, heldToday: false, template: { id: "gym", recurrence: "DAILY", dueKind: null, dueDay: null, captureKey: null, autoMetric: null, intrinsic: false } } as const;
  const taxRow = { lane: "today", day: THU, state: "open", strength: null, late: true, heldToday: false, template: { id: "tax", recurrence: null, dueKind: "DEADLINE", dueDay: "2026-10-17", captureKey: null, autoMetric: null, intrinsic: false } } as const;
  const base: SideQuestFacts = {
    today: THU,
    weekKey: W43,
    heldToday: false,
    restDays: 0,
    effortMinutes: 40,
    questRows: [{ templateId: "meds", cells: ["0", "1", "0", "o", "f", "f", "f"] }],
    rows: [gymRow, taxRow],
    templates: new Map([
      ["meds", T("meds", { title: "Morning meds", track: "CARE" })],
      ["gym", T("gym", { title: "Gym legs", track: "BODY", mvv: "10 squats" })],
      ["tax", T("tax", { title: "Lodge the tax return" })],
    ]),
    usedKeys: new Set(),
    open: 0,
  };
  const all = sideQuestCandidatesOf(base);
  eq("each detector fires on its anomaly, in D35's order", all.map((d) => [d.detector, d.scope, d.title]), [
    ["body", "week", "20-minute walk"],
    ["must", "meds", "Prepare for: Morning meds"],
    ["rung", "gym", "Prepare for: Gym legs"],
    ["late", "tax", "Decide on: Lodge the tax return"],
  ]);
  eq("each with its week's key, its expiry and its size (a neutral word when its title names another task)", all.map((d) => [d.key, d.expiresDay, d.sizeAs, d.estMinutes, d.track]), [
    [`side:body:week:${W43}`, "2026-10-24", "20-minute walk", 20, "BODY"],
    [`side:must:meds:${W43}`, "2026-10-24", "Prepare", 5, "CARE"],
    [`side:rung:gym:${W43}`, "2026-10-24", "Prepare", 5, "BODY"],
    [`side:late:tax:${W43}`, "2026-10-24", "Prepare", SIDE_PREPARE_MINUTES, "DUTY"],
  ]);
  eq("each note says why, neutrally, and that letting it expire costs nothing", all.map((d) => d.note), [
    "Body has 40 of 150 effort minutes this week. A 20-minute walk adds to them. Letting it expire costs nothing.",
    "Morning meds was missed 2 times this week. A few minutes getting it ready makes the next one easier. Letting it expire costs nothing.",
    "Gym legs is one miss from dropping below Established. Doing it today, or its minimum (10 squats), keeps the rung. Letting it expire costs nothing.",
    "Lodge the tax return is 5 days past its deadline. A few minutes to decide: start it, move it or drop it. Any of the three is fine. Letting it expire costs nothing.",
  ]);
  check(
    "the late quest is a decision, never minutes of its subject's own work (the subject's tick still pays all of that, so nothing pays twice): no minutes in its title, sized as the neutral 5-minute 'Prepare'",
    !/minutes on/.test(all[3].title) && all[3].sizeAs === "Prepare" && all[3].estMinutes === 5 && !/minutes on/.test(code("src/lib/side-quests.ts"))
  );
  check("…with no word of blame (never 'failed', 'should', 'must do', 'penalty', 'lazy')", !all.some((d) => /fail|should|must do|penalt|lazy|shame/i.test(d.note)));
  eq("nothing on a declared rest, sick or vacation day", sideQuestCandidatesOf({ ...base, heldToday: true }), []);
  eq("at most SIDE_OPEN_MAX open: two free slots take the first two", planSideQuests(base).map((d) => d.detector), ["body", "must"]);
  eq("…one open leaves one slot; two open leave none", [planSideQuests({ ...base, open: 1 }).map((d) => d.detector), planSideQuests({ ...base, open: 2 })], [["body"], []]);
  check("SIDE_OPEN_MAX is 2 (D35)", SIDE_OPEN_MAX === 2);
  const after1 = new Set(planSideQuests(base).map((d) => d.key));
  eq(
    "idempotent per week: once written (its key used, open or done, archived or not), a key is never planned again that week; re-planning after the write plans the rest",
    planSideQuests({ ...base, usedKeys: after1, open: 0 }).map((d) => d.detector),
    ["rung", "late"]
  );
  eq("…and a new week's keys are new", planSideQuests({ ...base, weekKey: "2026-W44", usedKeys: after1 }).map((d) => d.key.endsWith(":2026-W44")), [true, true]);
  eq(
    "a subject once a week whatever the detector (a must missed twice that is also one miss from a lower rung gets one)",
    sideQuestCandidatesOf({ ...base, questRows: [{ templateId: "gym", cells: ["0", "0", "1", "o", "f", "f", "f"] }], effortMinutes: 999, rows: [gymRow] }).map((d) => d.detector),
    ["must", "rung"]
  );
  eq("…planSideQuests keeps the first", planSideQuests({ ...base, questRows: [{ templateId: "gym", cells: ["0", "0", "1", "o", "f", "f", "f"] }], effortMinutes: 999, rows: [gymRow] }).map((d) => d.detector), ["must"]);
  eq("…and a subject already offered this week by another detector waits", planSideQuests({ ...base, effortMinutes: 999, questRows: [], usedKeys: new Set([`side:must:gym:${W43}`]) }).map((d) => d.scope), ["tax"]);
  eq(
    "no subject that is #play, a study task that completes itself, or a side quest itself",
    sideQuestCandidatesOf({
      ...base,
      effortMinutes: 999,
      templates: new Map([
        ["meds", T("meds", { intrinsic: true })],
        ["gym", T("gym", { autoMetric: "REVIEWS" })],
        ["tax", T("tax", { captureKey: sideTagKeyOf("x") })],
      ]),
    }),
    []
  );
  eq("a must missed once, a deadline 3 days late, a habit that holds its rung: nothing", sideQuestCandidatesOf({
    ...base,
    effortMinutes: 999,
    questRows: [{ templateId: "meds", cells: ["0", "1", "1", "o", "f", "f", "f"] }],
    rows: [{ ...gymRow, strength: 0.7 }, { ...taxRow, template: { ...taxRow.template, dueDay: "2026-10-19" } }],
  }), []);
  eq("a habit already done, held or not due today is never a rung subject", sideQuestCandidatesOf({ ...base, effortMinutes: 999, questRows: [], rows: [{ ...gymRow, state: "done" }, { ...gymRow, heldToday: true }, { ...gymRow, day: WED }] }), []);
  eq("a weekly target is never one (its strength is the period's, not today's)", sideQuestCandidatesOf({ ...base, effortMinutes: 999, questRows: [], rows: [{ ...gymRow, template: { ...gymRow.template, recurrence: "TARGET:3/W" } }] }), []);
  check("Body is once a week (its scope is the week)", planSideQuests({ ...base, usedKeys: new Set([`side:body:week:${W43}`]) })[0]?.detector === "must");
  const draft = sideParsedOf(all[3]);
  eq("a draft is written as a plain one-off line, built never parsed (a subject's title is never read for dates or tags)", [draft.title, draft.kind, draft.recurrence, draft.dueKind, draft.dueDay, draft.compulsory, draft.inbox, draft.doneNow, draft.tokens.length, draft.estMinutes], [
    "Decide on: Lodge the tax return",
    "TASK",
    null,
    "DEADLINE",
    "2026-10-24",
    false,
    false,
    false,
    0,
    5,
  ]);
  check(
    "…and stored as its shape says (capture-shape: the one-off it reads as, its expiry a deadline)",
    same(captureShapeOf(draft, THU), { kind: "TASK", recurrence: null, startDay: THU, dueDay: "2026-10-24", dueKind: "DEADLINE", compulsory: false, inbox: false, note: null })
  );

  // ══ §7 the run and the step ════════════════════════════════════════════════

  console.log("— §7 the run and the step —");
  let reads = 0;
  const writes: { key: string; source: string; note: string; sizeAs: string; parsed: ParsedCapture }[] = [];
  const facts = async () => {
    reads++;
    return base;
  };
  const create = (async (_u: string, parsed: ParsedCapture, opts: { captureSource: string; trigger?: { key: string; note: string; sizeAs: string } }) => {
    writes.push({ key: opts.trigger!.key, source: opts.captureSource, note: opts.trigger!.note, sizeAs: opts.trigger!.sizeAs, parsed });
    return { id: `t-${writes.length}`, duplicate: false } as never;
  }) as unknown as NonNullable<Parameters<typeof runSideQuests>[2]>["create"];
  eq("off (no launch day, or before it): at once, nothing read, nothing written", [await runSideQuests("u1", at(THU), { launch: null, writes: true, facts, create }), await runSideQuests("u1", at(THU), { launch: FRI, writes: true, facts, create }), reads, writes.length], [
    { skipped: "NOT_LAUNCHED", planned: 0, created: [] },
    { skipped: "NOT_LAUNCHED", planned: 0, created: [] },
    0,
    0,
  ]);
  eq("writes off (dev, a Preview): nothing read, nothing written", [await runSideQuests("u1", at(THU), { launch: L, writes: false, facts, create }), reads], [{ skipped: "WRITES_OFF", planned: 0, created: [] }, 0]);
  // The open count each write reads first: what the run wrote so far (a stub, so no database is read).
  const counted = (start = 0) => async () => start + writes.length;
  const run = await runSideQuests("u1", at(THU), { launch: L, writes: true, facts, create, count: counted() });
  eq("on: the plan written, each under its week's key, as captureSource 'trigger', with its note and its size", [run.planned, writes.map((w) => [w.key, w.source, w.sizeAs]), "full" in run], [2, [[`side:body:week:${W43}`, "trigger", "20-minute walk"], [`side:must:meds:${W43}`, "trigger", "Prepare"]], false]);
  writes.length = 0;
  const raced = await runSideQuests("u1", at(THU), { launch: L, writes: true, facts, create, count: counted(1) });
  const full = await runSideQuests("u1", at(THU), { launch: L, writes: true, facts, create, count: async () => SIDE_OPEN_MAX });
  eq(
    "the open count is read again right before each write: a '#side' line saved since the facts were read takes its slot, and the draft waits unwritten (`full`): never 3 open",
    [raced.created.length, raced.full, full.created.length, full.full],
    [1, 1, 0, 2]
  );
  check("…the run's default count is tasks.ts countOpenSideQuests, and it comes before the write", /const count = opts\.count \?\? countOpenSideQuests;/.test(code("src/lib/side-quests-server.ts")) && /if \(\(await count\(userId, today\)\) >= SIDE_OPEN_MAX\) \{\s*full = drafts\.length - created\.length;\s*break;\s*\}\s*const parsed: ParsedCapture = sideParsedOf\(d\);/.test(code("src/lib/side-quests-server.ts")));
  writes.length = 0;
  await runSideQuests("u1", at(THU), { launch: L, writes: true, facts, create, count: counted() });
  check("…each a plain one-off with its expiry (never a must)", writes.every((w) => w.parsed.dueKind === "DEADLINE" && !w.parsed.compulsory && w.parsed.recurrence == null));
  const srv = code("src/lib/side-quests-server.ts");
  check(
    "the run reads the personal Board only (no work tab, so no CRM row is ever a trigger) and no CRM table at all",
    /loadTodayBoard\(userId, today, now\)/.test(srv) && /\.\.\.PERSONAL_BOARD/.test(srv) && !/crm|customer|deal|workOrder|callBack|scheduledTask/i.test(srv)
  );
  check("…nor does the core (side-quests.ts imports no server module)", !/from "\.\/(prisma|tasks|crm|customers|deals|work-orders|scheduled-tasks)/.test(code("src/lib/side-quests.ts")));
  check(
    "idempotent across runs and races: a key already written is the unique (userId, captureKey) the core turns into the row it wrote (insertCapture's P2002 path)",
    /@@unique\(\[userId, captureKey\]\)/.test(read("prisma/schema.prisma")) && /if \(captureKey && isDuplicateActivity\(err\)\) \{\s*const row = await prisma\.taskTemplate\.findFirst\(\{ where: \{ userId, captureKey \}/.test(code("src/lib/tasks.ts"))
  );

  let ran = 0;
  const runner: SideQuestRunner = async () => {
    ran++;
    return { skipped: null, planned: 0, created: [] };
  };
  const on = { XTNL_LIFE_JUDGE: "1", XTNL_SIDE_QUESTS_LAUNCH_DAY: L, CRON_SECRET: "k" };
  eq("the step: NOT_LAUNCHED with no read while off; WRITES_OFF unless settlementWritesEnabled", [await runSideQuestStep("u2", at(THU), { env: { XTNL_LIFE_JUDGE: "1" }, source: "CRON", run: runner }), await runSideQuestStep("u2", at(THU), { env: { XTNL_SIDE_QUESTS_LAUNCH_DAY: L }, source: "CRON", run: runner }), ran], [
    { skipped: "NOT_LAUNCHED", planned: 0, created: [] },
    { skipped: "WRITES_OFF", planned: 0, created: [] },
    0,
  ]);
  await runSideQuestStep("u3", at(THU, 10), { env: on, source: "RENDER", run: runner });
  const throttled = await runSideQuestStep("u3", new Date(at(THU, 10).getTime() + SIDE_CHAIN_EVERY_MS - 1), { env: on, source: "RENDER", run: runner });
  await runSideQuestStep("u3", new Date(at(THU, 10).getTime() + SIDE_CHAIN_EVERY_MS), { env: on, source: "RENDER", run: runner });
  await runSideQuestStep("u3", new Date(at(THU, 10).getTime() + 1), { env: on, source: "CRON", run: runner });
  eq("the chain is throttled per user (30 min); the cron never", [throttled.skipped, ran, SIDE_CHAIN_EVERY_MS], ["THROTTLED", 3, 30 * 60_000]);
  const quiet = console.error;
  console.error = () => {};
  const boom = await runSideQuestStep("u4", at(THU), {
    env: on,
    source: "CRON",
    run: async () => {
      throw new Error("side boom");
    },
  }).finally(() => {
    console.error = quiet;
  });
  eq("it never throws: a failure is reported as `error`", boom, { skipped: null, planned: 0, created: [], error: "side boom" });
  const cronDeps = (env: Record<string, string>) => ({
    env,
    now: () => at(THU),
    userId: () => "u5",
    settle: async () => ({ launched: false, wrote: false, cursorBefore: null, cursorAfter: null, plans: [], refused: "off" }),
    judge: async () => ({ launched: false, committed: [] }),
    launchFinished: async () => true,
    roadmap: { freeze: async () => ({ froze: 0, skipped: null }), readings: async () => ({ written: 0, reaches: 0, skipped: null }), finalize: async () => ({ finalized: 0, skipped: null }) },
    side: runner,
  });
  const req = () => new Request("https://x.test/api/cron/life", { headers: { authorization: "Bearer k" } });
  const offBody = (await (await runLifeCron(req(), cronDeps({ CRON_SECRET: "k", XTNL_LIFE_JUDGE: "1" }) as never)).json()) as Record<string, unknown>;
  const onRes = await runLifeCron(req(), cronDeps(on) as never);
  const onBody = (await onRes.json()) as Record<string, unknown>;
  eq("the cron's answer: no `side` while the detectors are off (it reads as before); `side` once they run; the status never moves", [Object.keys(offBody), Object.keys(onBody), onRes.status], [
    ["settle", "judge", "roadmap", "audit"],
    ["settle", "judge", "roadmap", "audit", "side"],
    200,
  ]);

  // ══ §8 the audit ═══════════════════════════════════════════════════════════

  console.log("— §8 the audit —");
  const W = { weekKey: W43, monday: MON, sunday: SUN };
  const created = (day: DayKey, hh = 10) => at(day, hh);
  const rows = [
    { captureKey: sideQuestKeyOf("body", "week", W43), createdAt: created(THU), completedAt: created(THU, 18), archivedAt: null },
    { captureKey: sideTagKeyOf("n1"), createdAt: created(FRI), completedAt: null, archivedAt: null },
    // Taken back (an Undo): never offered.
    { captureKey: sideTagKeyOf("n2"), createdAt: created(FRI), completedAt: null, archivedAt: created(FRI, 11) },
    // Last week's, and an ordinary task: not this week's side quests.
    { captureKey: sideQuestKeyOf("late", "x", "2026-W42"), createdAt: created("2026-10-16"), completedAt: created(MON), archivedAt: null },
    { captureKey: "n3", createdAt: created(THU), completedAt: null, archivedAt: null },
  ];
  eq("sideWeekOf: the week's side quests added and done (an Undo never offered; last week's and ordinary tasks left out); none: null", [sideWeekOf(rows, MON), sideWeekOf([], MON)], [{ offered: 2, done: 1 }, null]);
  eq("…done by the copy's 04:00 in a frozen copy", sideWeekOf(rows, MON, created(THU, 12)), { offered: 1, done: 0 });
  eq("its lane's line", sideAuditLine({ offered: 2, done: 1 }), "1 of 2 done · not in the rate");
  const tmpl: AuditTemplate[] = [{ id: "gym", title: "gym", kind: "HABIT", recurrence: "DAILY", startDay: "2026-10-01", dueDay: null, dueKind: null, compulsory: true, compulsoryOnRest: false, inbox: false, archivedDay: null, autoMetric: null, intrinsic: false }];
  const insts = ["2026-10-19", "2026-10-20", "2026-10-21"].map((d) => ({ templateId: "gym", day: d, status: "DONE" }));
  const plainAudit = weekAuditOf({ week: W, launchDay: L, templates: tmpl, instances: insts, today: SUN, now: at(SUN, 19) });
  const sideAudit = weekAuditOf({ week: W, launchDay: L, templates: tmpl, instances: insts, side: { offered: 2, done: 1 }, today: SUN, now: at(SUN, 19) });
  check("a week with no side quest reads exactly as before (no `side` key)", !("side" in plainAudit) && same({ ...sideAudit, side: undefined }, { ...plainAudit, side: undefined }));
  eq("out of the rate: the rate and its counts are the same with side quests as without", [sideAudit.rate, sideAudit.daily.due, sideAudit.daily.kept], [plainAudit.rate, plainAudit.daily.due, plainAudit.daily.kept]);
  const receipt = auditReceiptOf(sideAudit, MON);
  check("the frozen copy keeps the lane only when the week had one; a copy without it reads as none", "side" in receipt && !("side" in auditReceiptOf(plainAudit, MON)) && !("side" in frozenAuditOf(parseAuditReceipt(auditReceiptOf(plainAudit, MON))!, MON, L)));
  eq("…read back, never recomputed", frozenAuditOf(parseAuditReceipt(receipt)!, MON, L).side, { offered: 2, done: 1 });
  eq("a stored lane this version cannot read is none", [parseSideWeek({ offered: 0, done: 0 }), parseSideWeek({ offered: 1, done: 2 }), parseSideWeek("x"), parseSideWeek({ offered: 2, done: 1 })], [null, null, null, { offered: 2, done: 1 }]);
  const card = renderToStaticMarkup(createElement(WeekAuditCard, { audit: sideAudit, today: SUN }));
  check("the card's lane: 'Side quests · 1 of 2 done · not in the rate', beside the daily quests, in the card's own type (no colour of its own)", /<li class="wa-lane" data-side="1"><b>Side quests<\/b><span class="wa-lane-line">1 of 2 done · not in the rate<\/span><\/li>/.test(card));
  check("…and none on a week without", !/Side quests/.test(renderToStaticMarkup(createElement(WeekAuditCard, { audit: plainAudit, today: SUN }))));
  eq("the phone's `week`: `side` only when the week had one", [checkWeekOf(sideAudit)?.side, "side" in (checkWeekOf(plainAudit) ?? {})], [{ done: 1, offered: 2 }, false]);

  // ══ §9 published ═══════════════════════════════════════════════════════════

  console.log("— §9 published —");
  const phone = checkTasksOf(b1, {});
  const pw = phone.tasks.find((t) => t.templateId === "walk");
  const pc = phone.tasks.find((t) => t.templateId === "chore");
  eq("the phone's row: side true and expiresDay on a side quest only; its dueLabel the board's", [pw?.side, pw?.expiresDay, pw?.dueLabel, pw?.lane, pc && "side" in pc, pc && "expiresDay" in pc], [true, FRI, "Side quest · expires Fri", "TASK", false, false]);
  eq("…never counted open in tasksSummary (it asks nothing)", phone.tasksSummary.open, 1);
  const doc = read("docs/mobile-api.md");
  check(
    "docs/mobile-api.md: the row's `side` and `expiresDay`, the refusal after expiry, SIDE_QUESTS_LAUNCH_DAY, and the week's `side`",
    /"side"\?: true, "expiresDay"\?: "2026-10-23"/.test(doc) && /`side` and `expiresDay` \(blueprint 2\.5, P31; decision D35\)/.test(doc) && /`SIDE_QUESTS_LAUNCH_DAY`/.test(doc) && /"side"\?: \{ "done": 1, "offered": 2 \}/.test(doc) && /This\s+side quest expired at the end of Fri/.test(doc.replace(/\n\s*/g, " "))
  );
  const kt = (p: string) => read(`android/app/src/main/java/com/xtnl/app/${p}`);
  check(
    "Android: Models.kt reads side and expiresDay (false and null from an older server), SideLine says the web's words, the row draws its glyph in ink on both displays, the week card its lane, and the demo carries one",
    /val side: Boolean = false,\s*val expiresDay: String\? = null,/.test(kt("data/Models.kt")) &&
      /val side: WeekSide\? = null,/.test(kt("data/Models.kt")) &&
      /"\$LABEL · \$\{if \(gap < 0\) "expired" else "expires"\} \$word"/.test(kt("core/SideLine.kt")) &&
      /Icon\(Glyphs\.Side, null, tint = c\.ink1/.test(kt("ui/check/CheckScreen.kt")) &&
      /SideLine\.audit\(w\)\?\.let/.test(kt("ui/check/CheckScreen.kt")) &&
      /DemoTask\(sideWalk\(\)\)/.test(kt("data/DemoApi.kt")) &&
      /fun sideRowFront\(\) = sideRow\("front"\)/.test(read("android/app/src/test/java/com/xtnl/app/ui/ScreensTest.kt")) &&
      /fun sideRowMain\(\) = sideRow\("main"\)/.test(read("android/app/src/test/java/com/xtnl/app/ui/ScreensTest.kt"))
  );
  check("the app's versionCode moved past 26", Number(/versionCode (\d+)/.exec(read("android/app/build.gradle"))?.[1]) > 26);
  // Re-pinned for blueprint P31 review: the audit's lane line only while the audit is in force (no copy names what is not there).
  const off = sideRuleLines({ detectors: false, audit: false });
  const auditOnly = sideRuleLines({ detectors: false, audit: true });
  const onLines = sideRuleLines({ detectors: true, audit: true });
  check(
    "the rules card: '#side' always (it works without the switch), every figure read from the code; the audit's lane only while the audit is in force, the detectors' line only once they run",
    off.length === 2 &&
      off[0].includes(`(${SIDE_EXPIRY_DAYS} days after you add it`) &&
      off[1].startsWith(`At most ${SIDE_OPEN_MAX} side quests are open`) &&
      !off.some((l) => /Thursday|audit/.test(l)) &&
      auditOnly.length === 3 &&
      auditOnly[2] === "Side quests stay out of the weekly audit's rate. The audit shows them on a line of their own." &&
      onLines.length === 4 &&
      onLines[3].includes(`under ${BODY_EFFORT_MINUTES / 2} of ${BODY_EFFORT_MINUTES} effort minutes by Thursday`) &&
      onLines[3].includes(`missed ${SIDE_MUST_MISSES} times`) &&
      onLines[3].includes(`more than ${SIDE_LATE_DAYS} days overdue`) &&
      sideRuleLines({ detectors: true, audit: false }).length === 3
  );
  const rules = code("src/app/today/rules/page.tsx");
  check(
    "the rules page renders the card with its audit line only while AUDIT_LAUNCH_DAY is in force and its detectors' line only while SIDE_QUESTS_LAUNCH_DAY is",
    /const sideDetectors = sideQuestsOn\(today, sideQuestsLaunchDay\(\)\);/.test(rules) &&
      /const calibrationLive = isAuditLaunched\(today, auditLaunchDay\(\)\);/.test(rules) &&
      /<SideQuestRules detectors=\{sideDetectors\} audit=\{calibrationLive\} \/>/.test(rules) &&
      /\{sideRuleLines\(\{ detectors, audit \}\)\.map\(\(line\) => \(/.test(rules)
  );
  check(
    "/dev/style/today shows the side quest's views from the real builders (rows, drawers, the audit's lane, the chips), so they can be seen at 344 px with nothing written",
    /<SideFixtures \/>/.test(code("src/app/dev/style/today/TodayFixtures.tsx")) &&
      /sideQuestCandidatesOf\(/.test(code("src/app/dev/style/today/SideFixtures.tsx")) &&
      /buildBoard\(data\)/.test(code("src/app/dev/style/today/SideFixtures.tsx")) &&
      /<WeekAuditCard /.test(code("src/app/dev/style/today/SideFixtures.tsx")) &&
      /stepsSave=\{STEPS_SAVE\}/.test(code("src/app/dev/style/today/SideFixtures.tsx")) &&
      !/@\/app\/actions/.test(code("src/app/dev/style/today/SideFixtures.tsx"))
  );
  const row = read("src/components/today/TaskRow.tsx");
  check(
    "the web row: the side glyph and the words in the due bit's own ink (.r-bit.due: --ink-0), no new hue; data-side marks it",
    /<Icon name=\{row\.side \? "side" : "clock"\} size=\{14\} \/>/.test(row) &&
      /data-side=\{row\.side \? "1" : undefined\}/.test(row) &&
      /\.t-row \.r-bit\.due \{ color: var\(--ink-0\); font-weight: 600; \}/.test(read("src/components/today/today.css")) &&
      !/data-side/.test(read("src/components/today/today.css"))
  );
  check("the sprite carries i-side (a signpost), the Icon name 'side', and the capture chip uses it", /<symbol id="i-side" viewBox="0 0 24 24">/.test(read("src/components/ui/Icon.tsx")) && /\| "side" \|/.test(read("src/components/ui/Icon.tsx")) && /side: "side",/.test(read("src/components/capture/CaptureChips.tsx")));
  check("the drawer says why it was offered (its note), or what a side quest is", /\{t\.note \?\? SIDE_DRAWER_NOTE\}/.test(read("src/components/today/TaskDrawer.tsx")));
  check(
    "a detector's side quest is never 'sizing…' (no model sizes it; a '#side' line is sized like any capture)",
    /!isSideDetectorKey\(r\.captureKey\) &&/.test(code("src/lib/tasks.ts"))
  );
  check("the key prefix is 'side:'", SIDE_KEY_PREFIX === "side:");
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  check(
    "life:check runs this check right after review-fatigue-check; npm run side-quests:check runs it alone",
    /tsx scripts\/review-fatigue-check\.ts && tsx scripts\/side-quests-check\.ts && /.test(pkg.scripts["life:check"]) && pkg.scripts["side-quests:check"] === "tsx scripts/side-quests-check.ts"
  );

  console.log(`\nside-quests-check: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
