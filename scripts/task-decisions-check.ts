/**
 * Defer and abort (2026-10-13; migration 20261222000000_task_defer_abort). This check pins:
 *
 *   1. the reason (1..200 characters, trimmed; a chip fills it when nothing is typed) and the six chips;
 *   2. the return: the quick picks relative to now in the life zone (across 04:00 too), a picked date
 *      and time, and the refusals (past, more than 60 days, a must on its own day);
 *   3. each defer's writes (task-decisions.ts planDefer): a one-off off the board until its return
 *      (planDay, dueDay untouched: a deadline stays late after its day), a repeating non-must's days
 *      skipped until then, a must skipped nowhere; the refusals;
 *   4. each abort's: just this time (a non-must skipped, a must hidden for the rest of today and not
 *      kept), for good (the archive path, the must's akrasia horizon as Archive has it);
 *   5. the cores (task-decisions-server.ts) against an in-memory store that runs the real rule edit
 *      (duty-plan planRuleEdit): the writes, the decision rows, Undo restoring exactly what changed,
 *      ten minutes and the same day, a race answered "try again", a work tab's task with no game;
 *   6. the board (today-board.ts buildBoard): hidden until deferUntil, then back with "Deferred until
 *      Tue 09:00 · n×"; the Must lane "1 of 2 kept · 1 deferred"; no Full day with a deferred must;
 *      no record of yesterday for a must decided then; the counts, the quest picker and a quest's done
 *      read never see a hidden task;
 *   7. no XP and no ledger row anywhere in a decision; the wiring (actions, the drawer, the sheet, the
 *      toast's Undo, the weekly review's section, life:check) and the CSS (tokens only, 44 px targets).
 *
 * Pure: no database, no clock, no model.
 *
 *   npx tsx scripts/task-decisions-check.ts
 */
import "./_no-model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ABORT_ALREADY_SKIPPED,
  DECISION_DONE,
  DECISION_DONE_TODAY,
  DECISION_GOAL,
  DECISION_INBOX,
  DECISION_STALE,
  DECISION_UNDO_LATE,
  DEFER_AUTO,
  DEFER_MAX_DAYS,
  DEFER_MUST_SAME_DAY,
  DEFER_NO_TIME,
  DEFER_PAST,
  DEFER_TOO_FAR,
  REASON_EMPTY,
  REASON_LONG,
  REASON_MAX,
  REASON_TAGS,
  REASON_TAG_LABEL,
  REASON_TAG_UNKNOWN,
  canUndoDecision,
  cleanReason,
  decisionOpOf,
  decisionToastOf,
  deferLineOf,
  deferNoteOf,
  deferNudgeOf,
  deferPicksOf,
  deferShapeOf,
  deferTimeRefusalOf,
  deferredLineOf,
  instantAt,
  localInputOf,
  mustCountOf,
  nextDecisionTick,
  nextMondayOf,
  parseLocalDateTime,
  planAbort,
  planDefer,
  planUndo,
  skipDaysOf,
  templateDecisionsOf,
  untilLabelOf,
  weekDecisionsViewOf,
  type DecisionInstance,
  type DecisionRowLike,
  type DecisionTemplate,
  type DecisionWrite,
  type TemplateDecisions,
} from "../src/lib/task-decisions";
import { abortCore, deferCore, undoDecisionCore, type DecisionDb, type DecisionTemplateRow } from "../src/lib/task-decisions-server";
import { planRuleEdit, type RuleRow } from "../src/lib/duty-plan";
import { parsePendingChange } from "../src/lib/duty-rule";
import { TEMPLATE_SELECT, toBoardTemplate, type LifeResult, type RuleChangeOutcome, type TemplateRow } from "../src/lib/tasks";
import { applyOps, buildBoard, reflected, seekPlaceOf, type BoardData, type BoardInstance, type BoardTemplate } from "../src/lib/today-board";
import { fullDayInputOf, fullDayOf } from "../src/lib/full-day";
import { questCandidatesOf, questDone } from "../src/lib/momentum-server";
import { mustLaneOf, laneTally } from "../src/components/today/board-ui";
import { LIFE_TZ, addDays, dayEndOf, dayKeyOf, type DayKey } from "../src/lib/life-day";
import { fixtureTemplate } from "../src/app/dev/style/today/fixtures";
import { TaskDrawer } from "../src/components/today/TaskDrawer";
import { TaskRow } from "../src/components/today/TaskRow";
import { DecisionForm, type DecisionTarget } from "../src/components/today/DecisionSheet";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`);
  }
}
function eq(name: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  check(name, a === b, a === b ? "" : `got ${a}, want ${b}`);
}
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8").replace(/\r\n/g, "\n");
/** Source without comments, so a pin never matches a sentence about the code. */
const code = (f: string) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const fnBody = (src: string, name: string) => new RegExp(`(?:export )?(?:async )?function ${name}\\b[\\s\\S]*?\\n\\}`).exec(src)?.[0] ?? "";

const TZ = LIFE_TZ;
/** An instant at hh:mm on a calendar date in the life zone. */
const at = (day: DayKey, h: number, m = 0) => instantAt(day, h, m, TZ);
const TUE: DayKey = "2026-10-13";
const NOW = at(TUE, 10); // Tue 10:00
const iso = (d: Date) => d.toISOString();

// ── 1. The reason ─────────────────────────────────────────────────────────
console.log("— the reason —");
{
  eq("reason: trimmed, its runs of white space made one", cleanReason("  waiting   on\nSam  "), { ok: true, reason: "waiting on Sam", reasonTag: null });
  eq("reason: a chip with nothing typed is the reason itself", cleanReason("", "BLOCKED"), { ok: true, reason: "Blocked", reasonTag: "BLOCKED" });
  eq("reason: typed words win over the chip's, the chip is kept", cleanReason("Sam hasn't replied", "WAITING"), { ok: true, reason: "Sam hasn't replied", reasonTag: "WAITING" });
  eq("reason: nothing typed and no chip is refused", [cleanReason(""), cleanReason("   "), cleanReason(null)], [
    { ok: false, error: REASON_EMPTY },
    { ok: false, error: REASON_EMPTY },
    { ok: false, error: REASON_EMPTY },
  ]);
  check(`reason: ${REASON_MAX} characters pass, ${REASON_MAX + 1} are refused`, REASON_MAX === 200 && cleanReason("x".repeat(200)).ok && JSON.stringify(cleanReason("x".repeat(201))) === JSON.stringify({ ok: false, error: REASON_LONG }));
  eq("reason: an unknown chip is refused, never dropped", cleanReason("x", "SLEEPY"), { ok: false, error: REASON_TAG_UNKNOWN });
  eq("chips: the six, in order, with their words", REASON_TAGS.map((t) => REASON_TAG_LABEL[t]), ["Blocked", "No time", "Low energy", "Not needed", "Plan changed", "Waiting on someone"]);
}

// ── 2. When it comes back ─────────────────────────────────────────────────
console.log("— the return —");
{
  const picks = (now: Date, must = false) => deferPicksOf(now, { must }, TZ).map((p) => [p.id, p.at] as const);
  eq("picks at Tue 10:00: in an hour, this evening 18:00, tomorrow 09:00, next Monday 09:00", picks(NOW), [
    ["hour", iso(at(TUE, 11))],
    ["evening", iso(at(TUE, 18))],
    ["tomorrow", iso(at("2026-10-14", 9))],
    ["monday", iso(at("2026-10-19", 9))],
  ]);
  eq("picks at Tue 19:00: this evening has passed", picks(at(TUE, 19)).map(([id]) => id), ["hour", "tomorrow", "monday"]);
  // Across 04:00: Wed 02:00 is still Tuesday's life day.
  const night = at("2026-10-14", 2);
  eq("picks at 02:00 (still the night before): 'Tomorrow' is this morning's 09:00, no evening", picks(night), [
    ["hour", iso(at("2026-10-14", 3))],
    ["tomorrow", iso(at("2026-10-14", 9))],
    ["monday", iso(at("2026-10-19", 9))],
  ]);
  eq("picks for a must at 02:00: only those on a later life day (03:00 is still Tuesday's)", picks(night, true).map(([id]) => id), ["tomorrow", "monday"]);
  eq("picks for a must at 03:30: in an hour lands after 04:00, a later life day", picks(at("2026-10-14", 3, 30), true).map(([id]) => id), ["hour", "tomorrow", "monday"]);
  eq("picks for a must at Tue 10:00: neither in an hour nor this evening", picks(NOW, true).map(([id]) => id), ["tomorrow", "monday"]);
  eq("picks on a Sunday: next Monday is tomorrow, listed once", picks(at("2026-10-18", 10)).map(([id]) => id), ["hour", "evening", "tomorrow"]);
  eq("next Monday: a Monday's is a week on", [nextMondayOf("2026-10-19"), nextMondayOf("2026-10-18"), nextMondayOf(TUE)], ["2026-10-26", "2026-10-19", "2026-10-19"]);
  check("refused: no time, a past time, now itself", deferTimeRefusalOf(null, NOW) === DEFER_NO_TIME && deferTimeRefusalOf(Number.NaN, NOW) === DEFER_NO_TIME && deferTimeRefusalOf(at(TUE, 9), NOW) === DEFER_PAST && deferTimeRefusalOf(NOW, NOW) === DEFER_PAST);
  const limit = NOW.getTime() + DEFER_MAX_DAYS * 86_400_000;
  check(`refused: more than ${DEFER_MAX_DAYS} days ahead; exactly ${DEFER_MAX_DAYS} passes`, DEFER_MAX_DAYS === 60 && deferTimeRefusalOf(limit, NOW) === null && deferTimeRefusalOf(limit + 60_000, NOW) === DEFER_TOO_FAR);
  check("refused: a must's return on its own life day (even 03:00 after midnight)", deferTimeRefusalOf(at(TUE, 18), NOW, { must: true }) === DEFER_MUST_SAME_DAY && deferTimeRefusalOf(at("2026-10-14", 3), NOW, { must: true }) === DEFER_MUST_SAME_DAY && deferTimeRefusalOf(at("2026-10-14", 9), NOW, { must: true }) === null);
  const picked = parseLocalDateTime("2026-10-14T09:30", TZ);
  check("a picked date and time is read in the life zone, and written back the same", picked?.getTime() === at("2026-10-14", 9, 30).getTime() && localInputOf(picked!, TZ) === "2026-10-14T09:30");
  check("a date that does not exist, or a garbled one, reads as none", parseLocalDateTime("2026-02-31T09:00", TZ) === null && parseLocalDateTime("tomorrow", TZ) === null && parseLocalDateTime(42, TZ) === null);
  eq("labels: the same day's clock, a weekday within six days, a date further off", [untilLabelOf(at(TUE, 18), NOW, TZ), untilLabelOf(at("2026-10-14", 9), NOW, TZ), untilLabelOf(at("2026-11-30", 9), NOW, TZ)], ["18:00", "Wed 09:00", "Mon 30 Nov 09:00"]);
}

// ── 3. Each defer's writes ────────────────────────────────────────────────
console.log("— defer —");
const tpl = (p: Partial<DecisionTemplate> & { id: string }): DecisionTemplate => ({
  kind: "TASK",
  inbox: false,
  recurrence: null,
  startDay: "2026-09-01",
  dueDay: null,
  dueKind: null,
  planDay: null,
  compulsory: false,
  autoMetric: null,
  completed: false,
  archived: false,
  deferUntil: null,
  pendingArchiveDay: null,
  boardId: null,
  ...p,
});
const RS = { reason: "No time", reasonTag: "NO_TIME" as const };
const FRI9 = at("2026-10-16", 9);
const WED9 = at("2026-10-14", 9);
{
  const plan = (t: DecisionTemplate, until: Date, instances: DecisionInstance[] = [], now = NOW) => planDefer(t, instances, { id: "d1", until, now, ...RS }, TZ);
  const w = (p: ReturnType<typeof plan>): DecisionWrite => (p.ok ? p.value.write : (null as unknown as DecisionWrite));

  const undated = plan(tpl({ id: "u" }), FRI9);
  check(
    "one-off: off the board until then (deferUntil), planned for its return day (planDay); dueDay and dueKind untouched",
    undated.ok && w(undated).template?.deferUntil?.getTime() === FRI9.getTime() && w(undated).template?.planDay === "2026-10-16" && !("dueDay" in (w(undated).template ?? {})) && w(undated).createSkipped.length === 0
  );
  check("one-off: the decision row (DEFER, no scope, the reason and its chip, today, the return)", undated.ok && JSON.stringify(w(undated).insert) === JSON.stringify({ id: "d1", templateId: "u", kind: "DEFER", scope: null, reason: "No time", reasonTag: "NO_TIME", day: TUE, untilAt: FRI9, compulsory: false, createdAt: NOW }));
  const sameDay = plan(tpl({ id: "u2", dueKind: "PLANNED", dueDay: TUE }), at(TUE, 18));
  check("one-off back later today: hidden until then, no planDay (it comes back as it was)", sameDay.ok && w(sameDay).template?.deferUntil?.getTime() === at(TUE, 18).getTime() && w(sameDay).template?.planDay === undefined);

  const deadline = plan(tpl({ id: "dl", dueKind: "DEADLINE", dueDay: "2026-10-15" }), at("2026-10-17", 9));
  check("deadline: put off (planDay) past its own day; dueDay stays, so it is late after it", deadline.ok && deadline.value.shape === "deadline" && w(deadline).template?.planDay === "2026-10-17" && !("dueDay" in (w(deadline).template ?? {})));
  const putOff = plan(tpl({ id: "dl2", dueKind: "DEADLINE", dueDay: TUE, planDay: TUE }), FRI9);
  check("deadline already put off to today: its planDay is kept (so Undo can tell what it wrote)", putOff.ok && w(putOff).template?.planDay === undefined && w(putOff).expect?.planDay === TUE);

  const daily = tpl({ id: "h", kind: "HABIT", recurrence: "DAILY" });
  const undone: DecisionInstance = { id: "i-tue", day: TUE, slot: 0, status: "UNDONE" };
  const habit = plan(daily, FRI9, [undone]);
  check(
    "repeating non-must: today and every day before the return skipped (Tue's UNDONE moved, Wed and Thu new); Fri, the return day, not",
    habit.ok && habit.value.shape === "repeating" && JSON.stringify(w(habit).skipUndone) === '["i-tue"]' && JSON.stringify(w(habit).createSkipped) === '["2026-10-14","2026-10-15"]' && habit.value.skipped === 3
  );
  check("repeating non-must: hidden until then too (deferUntil), and no planDay", habit.ok && w(habit).template?.deferUntil?.getTime() === FRI9.getTime() && w(habit).template?.planDay === undefined);
  eq("skip days: a Mon/Thu habit from Tue to next Tue skips Thu and Mon only", skipDaysOf({ recurrence: "DOW:1,4", startDay: "2026-09-01" }, TUE, "2026-10-20"), ["2026-10-15", "2026-10-19"]);
  eq("skip days: back later today, today alone", skipDaysOf({ recurrence: "DAILY", startDay: "2026-09-01" }, TUE, TUE), [TUE]);
  eq("skip days: AFTER and TARGET rules (no fixed days) skip today only", [skipDaysOf({ recurrence: "AFTER:3", startDay: "2026-09-01" }, TUE, "2026-10-20"), skipDaysOf({ recurrence: "TARGET:3/W", startDay: "2026-09-01" }, TUE, "2026-10-20")], [[TUE], [TUE]]);
  const settled = plan(daily, FRI9, [{ id: "i-wed", day: "2026-10-14", slot: 0, status: "SKIPPED" }]);
  check("repeating: a day already skipped is left as it is", settled.ok && !w(settled).createSkipped.includes("2026-10-14") && w(settled).skipUndone.length === 0);

  const must = plan(tpl({ id: "m", kind: "HABIT", recurrence: "DAILY", compulsory: true }), FRI9);
  check("must (repeating): nothing skipped, hidden until then, the row says it was a must", must.ok && must.value.shape === "must" && w(must).createSkipped.length === 0 && w(must).skipUndone.length === 0 && w(must).template?.deferUntil?.getTime() === FRI9.getTime() && w(must).insert?.compulsory === true);
  const mustDeadline = plan(tpl({ id: "md", compulsory: true, dueKind: "DEADLINE", dueDay: TUE }), FRI9);
  check("must deadline: may be deferred past its own day (planDay), its day still counted", mustDeadline.ok && mustDeadline.value.shape === "must" && w(mustDeadline).template?.planDay === "2026-10-16");
  eq("must: never back the same day", plan(tpl({ id: "m2", compulsory: true, recurrence: "DAILY" }), at(TUE, 18)), { ok: false, error: DEFER_MUST_SAME_DAY });

  eq("refused: done today (undo the tick first: nothing paid is ever taken back)", plan(daily, FRI9, [{ id: "d", day: TUE, slot: 0, status: "DONE" }]), { ok: false, error: DECISION_DONE_TODAY });
  eq("refused: a one-off already done", plan(tpl({ id: "c", completed: true }), FRI9), { ok: false, error: DECISION_DONE });
  eq("refused: a goal, an inbox item, an idea draft", [plan(tpl({ id: "g", kind: "GOAL" }), FRI9), plan(tpl({ id: "in", inbox: true }), FRI9), plan(tpl({ id: "id", kind: "IDEA_DRAFT" }), FRI9)].map((p) => (p.ok ? null : p.error)), [DECISION_GOAL, DECISION_INBOX, DECISION_INBOX]);
  eq("refused: a task that completes itself", plan(tpl({ id: "a", autoMetric: "REVIEWS" }), FRI9), { ok: false, error: DEFER_AUTO });
  check("refused: already deferred (until a time still ahead)", !plan(tpl({ id: "x", deferUntil: WED9 }), FRI9).ok && plan(tpl({ id: "x2", deferUntil: at(TUE, 9) }), FRI9).ok);
  check("refused: a time past, or more than 60 days", !plan(tpl({ id: "p" }), at(TUE, 9)).ok && !plan(tpl({ id: "f" }), at("2026-12-20", 9)).ok);
  check("work tab: a must there has no stakes, so it may come back later today", plan(tpl({ id: "wm", compulsory: true, boardId: "b1", recurrence: "DAILY" }), at(TUE, 18)).ok);

  eq("shapes: must, repeating, deadline, one-off", [deferShapeOf({ compulsory: true, recurrence: null, dueKind: null, dueDay: null }), deferShapeOf({ compulsory: false, recurrence: "DAILY", dueKind: null, dueDay: null }), deferShapeOf({ compulsory: false, recurrence: null, dueKind: "DEADLINE", dueDay: TUE }), deferShapeOf({ compulsory: false, recurrence: null, dueKind: "PLANNED", dueDay: TUE })], ["must", "repeating", "deadline", "one-off"]);
  check("words: a must's defer says its day counts as not kept and nothing is skipped", /not kept/.test(deferLineOf("must", { recurring: true })) && /nothing is skipped/.test(deferLineOf("must")) && /streak holds/.test(deferLineOf("repeating")) && /late/.test(deferLineOf("deadline", { dueLabel: "by Thu" })));
  eq("the nudge: from the third defer of one task", [deferNudgeOf(2), deferNudgeOf(3)], [null, "Deferred 3 times — break it into steps or abort it?"]);
}

// ── 4. Each abort's ───────────────────────────────────────────────────────
console.log("— abort —");
{
  const plan = (t: DecisionTemplate, scope: "ONCE" | "SERIES", instances: DecisionInstance[] = []) => planAbort(t, instances, { id: "a1", scope, now: NOW, ...RS }, TZ);
  const daily = tpl({ id: "h", kind: "HABIT", recurrence: "DAILY" });
  const once = plan(daily, "ONCE");
  check("just this time (non-must): today skipped, as Skip; nothing hidden", once.ok && once.value.kind === "write" && JSON.stringify(once.value.write.createSkipped) === `["${TUE}"]` && once.value.write.template === null && once.value.write.insert?.scope === "ONCE" && once.value.write.insert.untilAt === null);
  const mustOnce = plan(tpl({ id: "m", kind: "HABIT", recurrence: "DAILY", compulsory: true }), "ONCE");
  check(
    "just this time (must): not skipped, off the board until today ends, recorded as a must",
    mustOnce.ok && mustOnce.value.kind === "write" && mustOnce.value.write.createSkipped.length === 0 && mustOnce.value.write.template?.deferUntil?.getTime() === dayEndOf(TUE, TZ).getTime() && mustOnce.value.write.insert?.compulsory === true
  );
  check("for good: the archive path, then the decision row (scope SERIES)", (() => {
    const p = plan(daily, "SERIES");
    return p.ok && p.value.kind === "archive" && p.value.insert.scope === "SERIES" && p.value.insert.untilAt === null;
  })());
  check("a one-off is always for good", (() => {
    const p = plan(tpl({ id: "o" }), "ONCE");
    return p.ok && p.value.kind === "archive" && p.value.insert.scope === "SERIES";
  })());
  eq("refused: an archive already pending (Undo must not cancel the earlier one)", plan(tpl({ id: "pm", recurrence: "DAILY", compulsory: true, pendingArchiveDay: "2026-10-20" }), "SERIES"), { ok: false, error: "Already ending: it leaves Today on Tue 20 Oct." });
  eq("refused: just this time on a day already skipped", plan(daily, "ONCE", [{ id: "s", day: TUE, slot: 0, status: "SKIPPED" }]), { ok: false, error: ABORT_ALREADY_SKIPPED });
  eq("refused: just this time on a day already done", plan(daily, "ONCE", [{ id: "d", day: TUE, slot: 0, status: "DONE" }]), { ok: false, error: DECISION_DONE_TODAY });
  check("for good is allowed after a tick (nothing paid is touched; the series just ends)", plan(daily, "SERIES", [{ id: "d", day: TUE, slot: 0, status: "DONE" }]).ok);
}

// ── 5. The cores, against an in-memory store ──────────────────────────────
console.log("— the cores —");
type MemTemplate = DecisionTemplateRow & { userId: string; createdAt: Date; pendingChangeAt: Date | null };
type MemInstance = DecisionInstance & { userId: string; templateId: string; createdAt: Date; updatedAt: Date };
type MemDecision = DecisionRowLike & { userId: string };
class MemDb implements DecisionDb {
  tpl = new Map<string, MemTemplate>();
  inst: MemInstance[] = [];
  dec: MemDecision[] = [];
  /** Duty is launched for the personal Board (work tabs never): archiveCore's own rule. */
  launched = true;
  /** Rows written into the ledger: there is no way to, which is the point. */
  ledgerRows = 0;
  private seq = 0;
  async template(userId: string, id: string) {
    const t = this.tpl.get(id);
    return t && t.userId === userId ? { ...t } : null;
  }
  async instances(userId: string, templateId: string, from: DayKey, to: DayKey) {
    return this.inst.filter((i) => i.userId === userId && i.templateId === templateId && i.day >= from && i.day <= to).map((i) => ({ ...i }));
  }
  async decisions(userId: string, templateId: string) {
    return this.dec.filter((d) => d.userId === userId && d.templateId === templateId).map((d) => ({ ...d }));
  }
  async decision(userId: string, id: string) {
    const d = this.dec.find((x) => x.id === id && x.userId === userId);
    return d ? { ...d } : null;
  }
  async apply(userId: string, w: DecisionWrite): Promise<"ok" | "stale"> {
    const t = this.tpl.get(w.templateId);
    if (w.expect && (!t || t.archivedAt || (t.deferUntil?.getTime() ?? null) !== (w.expect.deferUntil?.getTime() ?? null) || t.planDay !== w.expect.planDay)) return "stale";
    if (w.undo && this.dec.find((d) => d.id === w.undo!.id)?.undoneAt != null) return "stale";
    if (w.createSkipped.some((day) => this.inst.some((i) => i.templateId === w.templateId && i.day === day && i.slot === 0))) return "stale";
    if (w.template && t) {
      if (w.template.deferUntil !== undefined) t.deferUntil = w.template.deferUntil;
      if (w.template.planDay !== undefined) t.planDay = w.template.planDay;
    }
    for (const day of w.createSkipped) this.inst.push({ id: `inst-${++this.seq}`, userId, templateId: w.templateId, day, slot: 0, status: "SKIPPED", createdAt: w.at, updatedAt: w.at });
    for (const i of this.inst) if (w.skipUndone.includes(i.id) && i.status === "UNDONE") Object.assign(i, { status: "SKIPPED", updatedAt: w.at });
    this.inst = this.inst.filter((i) => !(w.removeSkipped.includes(i.id) && i.status === "SKIPPED"));
    for (const i of this.inst) if (w.reopen.includes(i.id) && i.status === "SKIPPED") Object.assign(i, { status: "UNDONE", updatedAt: w.at });
    if (w.insert) this.dec.push({ ...w.insert, userId, undoneAt: null });
    if (w.undo) for (const d of this.dec) if (d.id === w.undo.id) d.undoneAt = w.at;
    return "ok";
  }
  private ruleRow(t: MemTemplate): RuleRow {
    return { compulsory: t.compulsory, compulsoryOnRest: t.compulsoryOnRest, inbox: t.inbox, kind: t.kind, recurrence: t.recurrence, startDay: t.startDay, dueDay: t.dueDay, dueKind: t.dueKind, archivedAt: t.archivedAt, createdAt: t.createdAt, pendingChange: t.pendingChange };
  }
  private edit(userId: string, templateId: string, kind: "archive" | "unarchive", now: Date): LifeResult<RuleChangeOutcome> {
    const t = this.tpl.get(templateId);
    if (!t || t.userId !== userId) return { ok: false, error: "That task no longer exists." };
    const plan = planRuleEdit(this.ruleRow(t), kind === "archive" ? { kind: "archive", at: now } : { kind: "unarchive" }, { today: dayKeyOf(now, TZ), now, launched: this.launched && !t.boardId });
    if (!plan.ok) return plan;
    const wr = plan.value.write;
    if (wr) {
      if (wr.archivedAt !== undefined) t.archivedAt = wr.archivedAt;
      if (wr.pendingChange !== undefined) t.pendingChange = wr.pendingChange;
      if (wr.pendingChangeAt !== undefined) t.pendingChangeAt = wr.pendingChangeAt;
      if (wr.compulsory !== undefined) t.compulsory = wr.compulsory;
    }
    return { ok: true, value: { templateId, effect: plan.value.effect, effectiveDay: plan.value.effectiveDay } };
  }
  async archive(userId: string, templateId: string, now: Date) {
    return this.edit(userId, templateId, "archive", now);
  }
  async unarchive(userId: string, templateId: string, now: Date): Promise<LifeResult<null>> {
    const r = this.edit(userId, templateId, "unarchive", now);
    return r.ok ? { ok: true, value: null } : r;
  }
  add(p: Partial<MemTemplate> & { id: string }): MemTemplate {
    const t: MemTemplate = {
      userId: "u1",
      title: p.id,
      kind: "TASK",
      inbox: false,
      recurrence: null,
      startDay: "2026-09-01",
      dueDay: null,
      dueKind: null,
      planDay: null,
      compulsory: false,
      compulsoryOnRest: false,
      pendingChange: null,
      pendingChangeAt: null,
      autoMetric: null,
      completedAt: null,
      archivedAt: null,
      deferUntil: null,
      boardId: null,
      createdAt: new Date("2026-09-01T00:00:00Z"),
      ...p,
    };
    this.tpl.set(t.id, t);
    return t;
  }
}
/** Everything but the decision rows, normalised: what an Undo must restore exactly. */
const pcOf = (x: unknown) => {
  const p = parsePendingChange(x);
  return p && (p.next || (p.prior?.length ?? 0) > 0) ? JSON.stringify(p) : null;
};
const stateOf = (db: MemDb, id: string) => {
  const t = db.tpl.get(id)!;
  return JSON.stringify({
    t: { ...t, pendingChange: pcOf(t.pendingChange), pendingChangeAt: t.pendingChange && pcOf(t.pendingChange) ? t.pendingChangeAt : null },
    i: db.inst.filter((i) => i.templateId === id).map((i) => [i.id, i.day, i.slot, i.status]).sort(),
  });
};
const later = (min: number) => new Date(NOW.getTime() + min * 60_000);

async function cores() {
  // A one-off, deferred and undone: exactly as it was.
  {
    const db = new MemDb();
    db.add({ id: "call", title: "Call the bank", dueKind: "PLANNED", dueDay: "2026-10-12" });
    const before = stateOf(db, "call");
    const res = await deferCore("u1", "call", { reason: "", reasonTag: "WAITING", until: iso(FRI9) }, NOW, db, TZ);
    const t = db.tpl.get("call")!;
    check("core defer (one-off): deferUntil, planDay its return day, dueDay untouched; one DEFER row", res.ok && t.deferUntil?.getTime() === FRI9.getTime() && t.planDay === "2026-10-16" && t.dueDay === "2026-10-12" && db.dec.length === 1 && db.dec[0].kind === "DEFER" && db.dec[0].reason === "Waiting on someone");
    check("core defer: the answer (back Fri, 1×, nothing skipped, not a must)", res.ok && res.value.untilAt === iso(FRI9) && res.value.defers === 1 && res.value.skipped === 0 && !res.value.notKept && res.value.nudge === null);
    const undo = await undoDecisionCore("u1", res.ok ? res.value.decisionId : "", later(9), db, TZ);
    check("undo (one-off): restored exactly; the row stays, marked undone", undo.ok && stateOf(db, "call") === before && db.dec[0].undoneAt != null);
    const again = await undoDecisionCore("u1", res.ok ? res.value.decisionId : "", later(9), db, TZ);
    check("undo twice: the second answers as the first, changing nothing", again.ok && stateOf(db, "call") === before);
  }
  // A repeating non-must: its days skipped, then undone (created rows deleted, the UNDONE one back to UNDONE).
  {
    const db = new MemDb();
    db.add({ id: "walk", kind: "HABIT", recurrence: "DAILY" });
    db.inst.push({ id: "tue", userId: "u1", templateId: "walk", day: TUE, slot: 0, status: "UNDONE", createdAt: new Date("2026-10-12T22:00:00Z"), updatedAt: new Date("2026-10-12T22:05:00Z") });
    const before = stateOf(db, "walk");
    const res = await deferCore("u1", "walk", { reason: "Knee is sore", until: iso(FRI9) }, NOW, db, TZ);
    const statuses = db.inst.filter((i) => i.templateId === "walk").map((i) => `${i.day}:${i.status}`).sort();
    check("core defer (repeating): Tue, Wed, Thu SKIPPED (the streak holds), Fri untouched", res.ok && JSON.stringify(statuses) === JSON.stringify([`${TUE}:SKIPPED`, "2026-10-14:SKIPPED", "2026-10-15:SKIPPED"]) && res.value.skipped === 3);
    const undo = await undoDecisionCore("u1", res.ok ? res.value.decisionId : "", later(5), db, TZ);
    check("undo (repeating): the rows it made are gone, Tue's UNDONE is UNDONE again, deferUntil none", undo.ok && stateOf(db, "walk") === before);
  }
  // A must: nothing skipped, its day not kept; the undo.
  {
    const db = new MemDb();
    db.add({ id: "meds", kind: "HABIT", recurrence: "DAILY", compulsory: true });
    const before = stateOf(db, "meds");
    const same = await deferCore("u1", "meds", { reason: "x", until: iso(at(TUE, 18)) }, NOW, db, TZ);
    check("core defer (must): never back the same day", !same.ok && same.error === DEFER_MUST_SAME_DAY && db.dec.length === 0);
    const res = await deferCore("u1", "meds", { reason: "Out of stock", until: iso(WED9) }, NOW, db, TZ);
    check("core defer (must): no instance written, hidden until Wed, the day not kept", res.ok && db.inst.length === 0 && db.tpl.get("meds")!.deferUntil?.getTime() === WED9.getTime() && res.value.notKept && db.dec[0].compulsory);
    const undo = await undoDecisionCore("u1", res.ok ? res.value.decisionId : "", later(2), db, TZ);
    check("undo (must): exactly as it was", undo.ok && stateOf(db, "meds") === before);
  }
  // Abort just this time: a non-must skipped; a must hidden for the rest of today. Undo both.
  {
    const db = new MemDb();
    db.add({ id: "stretch", kind: "HABIT", recurrence: "DAILY" });
    db.add({ id: "pills", kind: "HABIT", recurrence: "DAILY", compulsory: true });
    const b1 = stateOf(db, "stretch");
    const b2 = stateOf(db, "pills");
    const a1 = await abortCore("u1", "stretch", { reason: "Low energy", reasonTag: "LOW_ENERGY", scope: "ONCE" }, NOW, db, TZ);
    const a2 = await abortCore("u1", "pills", { reason: "Ran out", scope: "ONCE" }, NOW, db, TZ);
    check("abort once (non-must): today SKIPPED, nothing hidden", a1.ok && db.inst.some((i) => i.templateId === "stretch" && i.day === TUE && i.status === "SKIPPED") && db.tpl.get("stretch")!.deferUntil === null && a1.value.scope === "ONCE" && !a1.value.notKept);
    check("abort once (must): not skipped, off the board until 04:00, not kept", a2.ok && !db.inst.some((i) => i.templateId === "pills") && db.tpl.get("pills")!.deferUntil?.getTime() === dayEndOf(TUE, TZ).getTime() && a2.value.notKept && a2.value.untilAt === iso(dayEndOf(TUE, TZ)));
    const u1 = await undoDecisionCore("u1", a1.ok ? a1.value.decisionId : "", later(3), db, TZ);
    const u2 = await undoDecisionCore("u1", a2.ok ? a2.value.decisionId : "", later(3), db, TZ);
    check("undo of both: exactly as before", u1.ok && u2.ok && stateOf(db, "stretch") === b1 && stateOf(db, "pills") === b2);
  }
  // Abort for good: archived at once (non-must), or after the must's akrasia horizon; both undone.
  {
    const db = new MemDb();
    db.add({ id: "yoga", kind: "HABIT", recurrence: "DAILY" });
    db.add({ id: "floss", kind: "HABIT", recurrence: "DAILY", compulsory: true });
    const b1 = stateOf(db, "yoga");
    const b2 = stateOf(db, "floss");
    const a1 = await abortCore("u1", "yoga", { reason: "Not needed", reasonTag: "NOT_NEEDED", scope: "SERIES" }, NOW, db, TZ);
    check("abort for good (non-must): archived now, with its decision row (SERIES)", a1.ok && db.tpl.get("yoga")!.archivedAt?.getTime() === NOW.getTime() && a1.value.archive?.effect === "immediate" && db.dec.some((d) => d.templateId === "yoga" && d.scope === "SERIES"));
    const a2 = await abortCore("u1", "floss", { reason: "Plan changed", scope: "SERIES" }, NOW, db, TZ);
    const next = parsePendingChange(db.tpl.get("floss")!.pendingChange)?.next;
    check(
      "abort for good (must, Duty live, past its typo grace): the archive waits seven days, as Archive's (and the answer says when)",
      a2.ok && db.tpl.get("floss")!.archivedAt === null && next?.archive === true && next.effectiveDay === addDays(TUE, 7) && a2.value.archive?.effect === "deferred" && a2.value.archive.effectiveDay === addDays(TUE, 7)
    );
    const again = await abortCore("u1", "floss", { reason: "again", scope: "SERIES" }, later(1), db, TZ);
    check("a second abort while it is pending is refused", !again.ok);
    const u1 = await undoDecisionCore("u1", a1.ok ? a1.value.decisionId : "", later(4), db, TZ);
    const u2 = await undoDecisionCore("u1", a2.ok ? a2.value.decisionId : "", later(4), db, TZ);
    check("undo of both: unarchived, and the pending archive cancelled — exactly as before", u1.ok && u2.ok && stateOf(db, "yoga") === b1 && stateOf(db, "floss") === b2);
    const young = new MemDb();
    young.add({ id: "new", kind: "HABIT", recurrence: "DAILY", compulsory: true, createdAt: later(-20) });
    const a3 = await abortCore("u1", "new", { reason: "typo", scope: "SERIES" }, NOW, young, TZ);
    check("a must inside its 60-minute typo grace archives at once (archiveCore's own rule)", a3.ok && a3.value.archive?.effect === "immediate" && young.tpl.get("new")!.archivedAt != null);
  }
  // Ten minutes, the same life day; a race.
  {
    const db = new MemDb();
    db.add({ id: "t" });
    const res = await deferCore("u1", "t", { reason: "x", until: iso(FRI9) }, NOW, db, TZ);
    const late = await undoDecisionCore("u1", res.ok ? res.value.decisionId : "", later(11), db, TZ);
    eq("undo after ten minutes is refused", late, { ok: false, error: DECISION_UNDO_LATE });
    const edge = at("2026-10-14", 3, 55);
    const db2 = new MemDb();
    db2.add({ id: "t" });
    const r2 = await deferCore("u1", "t", { reason: "x", until: iso(FRI9) }, edge, db2, TZ);
    const across = await undoDecisionCore("u1", r2.ok ? r2.value.decisionId : "", new Date(edge.getTime() + 6 * 60_000), db2, TZ);
    check("undo across 04:00 is refused (a new life day), like a tick's", !across.ok && !canUndoDecision(edge, new Date(edge.getTime() + 6 * 60_000), TZ) && canUndoDecision(edge, new Date(edge.getTime() + 4 * 60_000), TZ));
    const db3 = new MemDb();
    db3.add({ id: "t" });
    const racer: DecisionDb = Object.assign(Object.create(Object.getPrototypeOf(db3)), db3, {
      template: async (u: string, id: string) => {
        const row = await db3.template(u, id);
        db3.tpl.get("t")!.deferUntil = later(30); // another device deferred it meanwhile
        return row;
      },
    });
    const raced = await deferCore("u1", "t", { reason: "x", until: iso(FRI9) }, NOW, racer, TZ);
    check("a race (the template moved since the read): nothing lands, 'try again'", !raced.ok && raced.error === DECISION_STALE && db3.dec.length === 0 && db3.tpl.get("t")!.planDay === null);
    const bad = await deferCore("u1", "t", { reason: "x", until: "next tuesday" }, NOW, new MemDb(), TZ);
    check("a garbled return is refused before any read is used", !bad.ok);
  }
  // A work tab's task: the same decisions, nothing of the game.
  {
    const db = new MemDb();
    db.add({ id: "w", kind: "HABIT", recurrence: "DAILY", compulsory: true, boardId: "b1" });
    const res = await deferCore("u1", "w", { reason: "Waiting on the client", until: iso(at(TUE, 15)) }, NOW, db, TZ);
    check("work tab: a must there may be deferred to later today; the answer says work, no 'not kept'", res.ok && res.value.work && !res.value.notKept);
    const ab = await abortCore("u1", "w", { reason: "x", scope: "ONCE" }, later(1), db, TZ);
    check("work tab: once it is hidden, just-this-time is refused (it is off the board already)", !ab.ok);
    const db2 = new MemDb();
    db2.add({ id: "w2", kind: "HABIT", recurrence: "DAILY", compulsory: true, boardId: "b1" });
    const ab2 = await abortCore("u1", "w2", { reason: "x", scope: "ONCE" }, NOW, db2, TZ);
    check("work tab: a must's abort just this time skips today (no stakes to keep it owed)", ab2.ok && db2.inst.some((i) => i.templateId === "w2" && i.status === "SKIPPED") && !ab2.value.notKept);
    const series = await abortCore("u1", "w2", { reason: "x", scope: "SERIES" }, later(2), db2, TZ);
    check("work tab: for good archives at once (no Duty, no akrasia horizon)", series.ok && series.value.archive?.effect === "immediate");
  }
  // Counts and the nudge through the cores.
  {
    const db = new MemDb();
    db.add({ id: "essay" });
    let last: Awaited<ReturnType<typeof deferCore>> | null = null;
    for (let k = 0; k < 3; k++) {
      last = await deferCore("u1", "essay", { reason: "No time", until: iso(at("2026-10-14", 9 + k)) }, later(k), db, TZ);
      db.tpl.get("essay")!.deferUntil = null; // back
      db.tpl.get("essay")!.planDay = null;
    }
    check("the third defer of one task answers 3× and the nudge", !!last?.ok && last.value.defers === 3 && last.value.nudge === "Deferred 3 times — break it into steps or abort it?");
  }
  check("no ledger: the in-memory store has no ledger to write, and none was asked for", true);
}

// ── 6. The board ──────────────────────────────────────────────────────────
console.log("— the board —");
function boardChecks() {
  const today = TUE;
  const ledger = (day: DayKey) => ({ day, rawBefore: 0, lifeXp: 0, completions: [], reviews: 0, reviewXp: 0, ideas: 0, dayOpenQty: null });
  const data = (templates: BoardTemplate[], extra: Partial<BoardData> = {}): BoardData => ({
    today,
    yesterday: addDays(today, -1),
    capacityMin: 240,
    templates,
    instances: [],
    stats: {},
    ledger: { today: ledger(today), yesterday: ledger(addDays(today, -1)) },
    paid: {},
    goalQty: {},
    dueNow: 0,
    ...extra,
  });
  const T = (p: Partial<BoardTemplate> & { id: string }) => fixtureTemplate({ title: p.id, startDay: "2026-09-01", ...p });
  const fact = (p: Partial<DecisionRowLike> & { id: string; templateId: string }): DecisionRowLike => ({ kind: "DEFER", scope: null, reason: "No time", reasonTag: "NO_TIME", day: today, untilAt: null, compulsory: false, createdAt: NOW, ...p });
  const ids = (rows: { template: { id: string } }[]) => rows.map((r) => r.template.id);

  // toBoardTemplate: only while it is still ahead of the read.
  const rowOf = (deferUntil: Date | null): TemplateRow => {
    const r = Object.fromEntries(Object.keys(TEMPLATE_SELECT).map((k) => [k, null])) as Record<string, unknown>;
    Object.assign(r, { id: "x", title: "x", normTitle: "x", kind: "TASK", inbox: false, startDay: new Date(Date.UTC(2026, 8, 1)), track: "DUTY", category: "OTHER", band: "STANDARD", lexicalBand: "STANDARD", bandOverride: 0, estMinutes: 30, machineMinutes: 30, gradeSource: "LEXICAL", gradeConfidence: 0.4, gradeAttempts: 0, compulsory: false, compulsoryOnRest: false, intrinsic: false, sortOrder: 0, createdAt: new Date("2026-09-01T00:00:00Z"), deferUntil });
    return r as unknown as TemplateRow;
  };
  check("read: TEMPLATE_SELECT reads deferUntil; a value still ahead is sent, a past one reads as none", TEMPLATE_SELECT.deferUntil === true && toBoardTemplate(rowOf(FRI9), NOW).deferUntil === iso(FRI9) && toBoardTemplate(rowOf(at(TUE, 9)), NOW).deferUntil === null);

  // Hidden until deferUntil, then back with its note.
  const back = at(TUE, 18);
  const habit = T({ id: "walk", kind: "HABIT", recurrence: "DAILY", deferUntil: iso(back) });
  const decisions: Record<string, TemplateDecisions> = templateDecisionsOf([fact({ id: "d0", templateId: "walk", createdAt: later(-60), untilAt: at(TUE, 8) }), fact({ id: "d1", templateId: "walk", untilAt: back })]);
  const d1 = data([habit], { decisions });
  const before = buildBoard(d1, [], back.getTime() - 1);
  check("hidden while deferUntil is ahead: on no lane, in no count, in Anytime's Deferred list", ids([...before.must, ...before.todayRows, ...before.anytime]).length === 0 && before.counts.due === 0 && before.deferred.length === 1 && !before.deferred[0].must && before.deferred[0].defers === 2);
  const afterB = buildBoard(d1, [], back.getTime() + 1);
  const row = afterB.todayRows.find((r) => r.template.id === "walk");
  check("back once it passes: a row again, its meta 'Deferred until Tue 18:00 · 2×'", !!row && afterB.deferred.length === 0 && row.deferNote === "Deferred until Tue 18:00 · 2×", row?.deferNote ?? "no row");
  check("no clock given: whatever the server sent is still ahead (it sends none once passed)", buildBoard(d1).deferred.length === 1);
  eq("the note: only on the day it is back, only after its time", [deferNoteOf(decisions.walk, today, back.getTime() - 1), deferNoteOf(decisions.walk, addDays(today, 1), back.getTime() + 1)], [null, null]);
  check("seek: a hidden task is found in Anytime (a must: the Must lane, drawn)", seekPlaceOf(d1, "walk").open === "anytime" && seekPlaceOf(data([T({ id: "m", compulsory: true, deferUntil: iso(back) })]), "m").open === null);

  // The Must lane: 1 of 2 kept · 1 deferred; no Full day.
  const meds = T({ id: "meds", kind: "HABIT", recurrence: "DAILY", compulsory: true });
  const pills = T({ id: "pills", kind: "HABIT", recurrence: "DAILY", compulsory: true, deferUntil: iso(WED9) });
  const done: BoardInstance = { id: "i1", templateId: "meds", day: today, slot: 0, status: "DONE", source: "manual", xpPaid: 3 };
  const d2 = data([meds, pills], { instances: [done], decisions: templateDecisionsOf([fact({ id: "dp", templateId: "pills", untilAt: WED9, compulsory: true })]), ledger: { today: { ...ledger(today), completions: [{ eventId: "e1", templateId: "meds", groupKey: "meds", intro: false, raw: 3, xp: 3, sink: "TRACK" }] }, yesterday: ledger(addDays(today, -1)) } });
  const b2 = buildBoard(d2, [], NOW.getTime());
  check("a deferred must due today is a quiet item of the Must lane, not a row", ids(b2.must).join() === "meds" && b2.deferred.length === 1 && b2.deferred[0].must && b2.deferred[0].reason === "No time");
  eq("the Must lane says '1 of 2 kept · 1 deferred'", mustLaneOf({ must: b2.must, owed: [], restToday: null, live: true, launchDay: "2026-10-01", today, deferred: b2.deferred }).count, "1 of 2 kept · 1 deferred");
  eq("…and counts it in its tally (the KEPT stamp waits)", mustCountOf(laneTally(b2.must), b2.deferred), { kept: 1, total: 2, deferred: 1, aborted: 0, text: "1 of 2 kept · 1 deferred" });
  const fd = fullDayOf(fullDayInputOf(d2, b2, { progress: 20, target: 15, dueNow: 0 }));
  check("no Full day with a deferred must: the Musts ring reads 1 of 2 (quest and life met)", !fd.full && fd.rings[0].caption === "1 of 2" && fd.rings[1].met && fd.rings[2].met);
  check("the bell and nav count no hidden must as open", b2.counts.musts === 0);
  eq("an aborted-today must reads 'aborted'", mustCountOf({ kept: 0, total: 0 }, [{ must: true, held: false, kind: "ABORT" }]).text, "0 of 1 kept · 1 aborted");
  eq("its line: 'Deferred to Wed 09:00 · No time'", deferredLineOf(b2.deferred[0], NOW.getTime(), TZ), "Deferred to Wed 09:00 · No time");

  // A must deferred yesterday: no record of yesterday (the day counts as not kept).
  const yMust = T({ id: "ym", kind: "HABIT", recurrence: "DAILY", compulsory: true });
  const d3 = data([yMust], { decisions: templateDecisionsOf([fact({ id: "dy", templateId: "ym", day: addDays(today, -1), compulsory: true, untilAt: at(today, 9), createdAt: at(addDays(today, -1), 20) })]) });
  const b3 = buildBoard(d3, [], NOW.getTime());
  const control = buildBoard(data([yMust]), [], NOW.getTime());
  check("a must deferred yesterday: no Yesterday row and no 'Did it yesterday' (the control has both)", b3.yesterdayRows.length === 0 && !b3.must[0]?.recordYesterday && control.yesterdayRows.length === 1);
  check("completion: a record of a must decided on that day is refused on the server", /if \(read\.decidedNotKept\) return fail\(DECIDED_NOT_KEPT\);/.test(fnBody(code("src/lib/tasks.ts"), "completeInstanceCore")) && /prisma\.taskDecision\.findFirst\(\{ where: \{ userId, templateId, day: dateColumn\(day\), undoneAt: null, compulsory: true \}/.test(fnBody(code("src/lib/tasks.ts"), "readForCompletion")));
  check("completion: a tick (or Again) on a task deferred now is refused until it is back", /completableReason\(t, row\) \?\? deferredRefusalOf\(t, now\)/.test(code("src/lib/tasks.ts")) && /completableReason\(read\.t, read\.row\) \?\? deferredRefusalOf\(read\.t, now\)/.test(code("src/lib/tasks.ts")));

  // A one-off deferred to a later day, back: planned for that day (Today lane), carried after.
  const book = T({ id: "book", planDay: today });
  const carried = T({ id: "book2", planDay: addDays(today, -2) });
  const b4 = buildBoard(data([book, carried]), [], NOW.getTime());
  check("an undated one-off back from a defer is planned for its return day (Today lane); a day later it carries ('from Sun')", ids(b4.todayRows).includes("book") && b4.todayRows.find((r) => r.template.id === "book2")?.dueLabel === "from Sun" && b4.anytime.length === 0);

  // The quest picker and a quest's done read never see a hidden task.
  const cands = questCandidatesOf([...before.must, ...before.todayRows, ...before.anytime], d1.ledger.today, today);
  check("momentum: a hidden task is never a quest candidate (its board rows are gone)", !cands.some((c) => c.templateId === "walk"));
  const facts = { day: today, doneTemplates: new Set<string>(), walkLinked: new Set<string>(), moveMinutes: [], fullTasks: 0, reviews: 0, ideas: 0, ideaDomains: [], checkpoints: new Set<string>(), links: [] };
  check("momentum: a deferred task's quest stays not done (only a tick does it)", !questDone({ slot: "TASK", kind: "TEMPLATE", templateId: "walk", title: "walk" } as Parameters<typeof questDone>[0], facts));
  check("momentum: the quest picker's board reads on its own clock", /const board = buildBoard\(data, \[\], now\.getTime\(\)\);/.test(code("src/lib/momentum-server.ts")));

  // Optimistic holds.
  const op = { id: "o1", kind: "defer" as const, templateId: "meds", until: iso(WED9) };
  const held = applyOps(data([meds]), [op]);
  check("the board's hold: a defer op hides it until the props say the same", held.templates[0].deferUntil === iso(WED9) && buildBoard(held, [], NOW.getTime()).deferred.length === 1 && reflected(held, op) && !reflected(data([meds]), op));
  const out = { decisionId: "d", templateId: "t", title: "Call the bank", kind: "DEFER" as const, scope: null, untilAt: iso(FRI9), skipped: 0, notKept: false, defers: 3, nudge: deferNudgeOf(3), archive: null, work: false };
  eq("the toast: 'Deferred · Call the bank · back Fri 09:00', and the nudge", decisionToastOf(out, NOW.getTime(), TZ), { title: "Deferred", body: "Call the bank · back Fri 09:00. Deferred 3 times — break it into steps or abort it?" });
  eq("the holds per answer: defer, skip (once), hide (for good now), none (a must's archive waits)", [
    decisionOpOf(out, today),
    decisionOpOf({ ...out, kind: "ABORT", scope: "ONCE", untilAt: null }, today),
    decisionOpOf({ ...out, kind: "ABORT", scope: "SERIES", untilAt: null, archive: { effect: "immediate", effectiveDay: null } }, today),
    decisionOpOf({ ...out, kind: "ABORT", scope: "SERIES", untilAt: null, archive: { effect: "deferred", effectiveDay: "2026-10-20" } }, today),
  ], [{ kind: "defer", templateId: "t", until: iso(FRI9) }, { kind: "skip", templateId: "t", day: today }, { kind: "hide", templateId: "t" }, null]);
  check("the board's clock moves at a hidden task's return and at its Undo's close", nextDecisionTick([{ until: iso(back), decidedAt: iso(NOW) }], NOW.getTime(), TZ) === NOW.getTime() + 10 * 60_000 + 1 && nextDecisionTick([{ until: iso(back), decidedAt: null }], NOW.getTime(), TZ) === back.getTime());

  // Undo plans derived from the row (a deadline's own put-off is never cleared).
  const dl = planUndo(fact({ id: "u", templateId: "dl", untilAt: FRI9 }), { deferUntil: FRI9, planDay: TUE, recurrence: null }, [], later(1), TZ);
  check("undo plan: a deadline put off before the defer keeps its planDay", dl.ok && dl.value.kind === "write" && dl.value.write.template?.deferUntil === null && dl.value.write.template.planDay === undefined);
  const series = planUndo(fact({ id: "s", templateId: "y", kind: "ABORT", scope: "SERIES" }), null, [], later(1), TZ);
  check("undo plan: an abort for good is unarchived", series.ok && series.value.kind === "unarchive");

  // The weekly review's section.
  const week = weekDecisionsViewOf(
    [
      { id: "a", templateId: "t1", title: "Call the bank", kind: "DEFER", scope: null, reason: "Waiting on someone", day: "2026-10-12", untilAt: FRI9, compulsory: false, archived: false, createdAt: at("2026-10-12", 9) },
      { id: "b", templateId: "t2", title: "Yoga", kind: "ABORT", scope: "SERIES", reason: "Not needed", day: TUE, untilAt: null, compulsory: false, archived: true, createdAt: at(TUE, 9) },
      { id: "c", templateId: "t3", title: "Meds", kind: "DEFER", scope: null, reason: "Ran out", day: TUE, untilAt: WED9, compulsory: true, archived: false, createdAt: at(TUE, 8) },
    ],
    NOW,
    TZ
  );
  check(
    "weekly review: 'Deferred 2 · Aborted 1', newest first, links to Today, Restore for the one archived",
    week.head === "Deferred 2 · Aborted 1" && week.items.map((i) => i.id).join() === "b,c,a" && week.items[0].href === null && week.items[0].restorable && week.items[2].href === "/today#t-t1" && week.items[1].what === "Deferred to Wed 09:00 · must, not kept"
  );

  // The UI, rendered.
  const drawerRow = buildBoard(data([T({ id: "plain" })]), [], NOW.getTime()).anytime[0];
  const drawer = (extra: Record<string, unknown>) =>
    renderToStaticMarkup(
      createElement(TaskDrawer, {
        row: drawerRow,
        now: NOW.getTime(),
        today,
        minutes: null,
        onMinutes: () => {},
        projection: drawerRow.projection,
        minimumProjection: null,
        busy: false,
        working: null,
        onDone: () => {},
        onMinimum: () => {},
        onSkip: () => {},
        onTomorrow: () => {},
        onAgain: () => {},
        onRename: () => {},
        onArchive: () => {},
        onOverride: () => {},
        onResize: () => {},
        noMonth: true,
        ...extra,
      })
    );
  const withActs = drawer({ onDefer: () => {}, onAbort: () => {}, decision: { nudge: "Deferred 3 times — break it into steps or abort it?", recent: null } });
  check("drawer: 'Defer…' and 'Abort…' at full touch height, and the nudge", /class="today-pill td-act"[^>]*>Defer…</.test(withActs) && /class="today-pill td-act"[^>]*>Abort…</.test(withActs) && withActs.includes("Deferred 3 times — break it into steps or abort it?"));
  check("drawer: without the handlers (fixtures), neither", !drawer({}).includes("Defer…"));
  const metaRow = { ...row!, deferNote: "Deferred until Tue 18:00 · 2×" };
  const rowHtml = renderToStaticMarkup(createElement(TaskRow, { row: metaRow, projection: metaRow.projection, drawerOpen: false, undoable: false, busy: false, receiptOpen: false, receiptId: "r", onTick: () => {}, onUndo: () => {}, onToggleDrawer: () => {}, onToggleReceipt: () => {} }));
  check("row: the meta says 'Deferred until Tue 18:00 · 2×' on the day it is back", rowHtml.includes("Deferred until Tue 18:00 · 2×"));
  const target = (p: Partial<DecisionTarget>): DecisionTarget => ({ title: "Meds", shape: "must", recurring: true, must: true, work: false, dueLabel: null, defers: 0, endsOn: null, ...p });
  const form = (mode: "defer" | "abort", t: DecisionTarget) => renderToStaticMarkup(createElement(DecisionForm, { mode, target: t, nowMs: NOW.getTime(), busy: false, error: null, onSubmit: () => {} }));
  const deferMust = form("defer", target({}));
  check("sheet: no nudge below three defers", !form("defer", target({ shape: "repeating", must: false, defers: 2 })).includes("Deferred 2 times"));
  check("sheet (defer, a must): the six chips, the field, only later-day picks, and 'today counts as not kept'", REASON_TAGS.every((t) => deferMust.includes(`>${REASON_TAG_LABEL[t]}</button>`)) && deferMust.includes('maxLength="200"') && !deferMust.includes("In 1 hour") && !deferMust.includes("This evening") && deferMust.includes("Tomorrow 09:00") && deferMust.includes("Pick a date &amp; time") && /today counts as not kept/.test(deferMust));
  const deferHabit = form("defer", target({ shape: "repeating", must: false, defers: 3 }));
  check("sheet (defer, a habit): every pick, the nudge once deferred three times, 'Defer to Wed 09:00'", deferHabit.includes("In 1 hour · 11:00") && deferHabit.includes("This evening 18:00") && deferHabit.includes("Deferred 3 times") && deferHabit.includes("Defer to Wed 09:00"));
  const abortMust = form("abort", target({ endsOn: "Tue 20 Oct" }));
  check("sheet (abort, a repeating must): 'Just this time' / 'Stop it for good', not kept, and the seven days", abortMust.includes("Just this time") && abortMust.includes("Stop it for good") && abortMust.includes("Today still counts as not kept.") && abortMust.includes("it leaves Today on Tue 20 Oct"));
  const abortOne = form("abort", target({ shape: "one-off", recurring: false, must: false }));
  check("sheet (abort, a one-off): no scope choice, archived with the reason", !abortOne.includes("Just this time") && abortOne.includes("archived with your reason") && abortOne.includes("Abort it"));
}

// ── 7. No ledger, the wiring, the CSS ─────────────────────────────────────
console.log("— no XP, the wiring, the CSS —");
function wiring() {
  const server = code("src/lib/task-decisions-server.ts");
  const LEDGER = /activityOp\(|recordActivity\(|activityEvent\.|taskEventInput\(|undoEventInput\(|lifeLockOp\(|freshnessGuardOp\(|settledDayGuardOp\(|xp:\s|lifeXp/;
  check("no XP, no ledger: a decision writes TaskTemplate, TaskInstance and TaskDecision only (no ActivityEvent, no lock, no price)", !LEDGER.test(server) && !LEDGER.test(code("src/lib/task-decisions.ts")));
  check("no XP: an instance it writes pays 0 (xpPaid: 0 on create and on a move)", (server.match(/xpPaid: 0/g) ?? []).length === 2 && !/xpPaid: (?!0)/.test(server));
  check("for good goes through Archive's own path (archiveCore: the akrasia horizon), its Undo through unarchiveCore", /archive: \(userId, templateId, now\) => archiveCore\(userId, templateId, now\)/.test(server) && /unarchive: \(userId, templateId, now\) => unarchiveCore\(userId, templateId, now\)/.test(server));
  check("one array per write, opened by its guard (division by zero: the template or the decision moved)", /if \(w\.expect \|\| w\.undo\) ops\.push\(prisma\.\$executeRaw\(decisionGuardSql\(userId, w\)\)\);/.test(server) && /await prisma\.\$transaction\(ops\);/.test(server) && /SELECT 1 \/ \(CASE WHEN TRUE/.test(server));
  check("every write clears the board's caches", (server.match(/invalidate\("life", "activity"\)/g) ?? []).length >= 3);
  const tasks = code("src/lib/tasks.ts");
  check("the board reads: BoardData.decisions on the personal Board and on a work tab (one query each, fails soft)", /readBoardDecisions\(userId, null\)/.test(fnBody(tasks, "readBoardCore")) && /readBoardDecisions\(userId, boardId\)/.test(fnBody(tasks, "loadWorkBoardData")) && /return \{\};/.test(fnBody(tasks, "readBoardDecisions")));
  check("the walk never links a deferred exercise task", /OR: \[\{ deferUntil: null \}, \{ deferUntil: \{ lte: new Date\(\) \} \}\]/.test(code("src/lib/exercise-server.ts")));
  const actions = code("src/app/actions/tasks.ts");
  check("actions: deferTask, abortTask and undoDecision, each through run() to its core", /export async function deferTask\([\s\S]*?deferCore\(userId, templateId,/.test(actions) && /export async function abortTask\([\s\S]*?abortCore\(userId, templateId,/.test(actions) && /export async function undoDecision\([\s\S]*?undoDecisionCore\(userId, decisionId\)/.test(actions));
  const board = code("src/components/today/TodayBoard.tsx");
  check("board: the drawer's Defer… and Abort… open the sheet; the sheet is rendered", board.includes('onDefer={() => openDecision(row, "defer")}') && board.includes('onAbort={() => openDecision(row, "abort")}') && board.includes("<DecisionSheet"));
  check("board: built on its clock (a deferred task comes back at its time)", board.includes("buildBoard(current, [], clock)"));
  check("board: after each decision, a toast with Undo (undoDecision, ten minutes on the server)", /pushToast\(\{ key: `decision:\$\{out\.decisionId\}`[\s\S]*?action: \{ label: "Undo", onAction: \(\) => undoDecisionNow\(/.test(board) && /undoDecision\(decisionId, REFRESH\)/.test(board));
  check("board: a hidden must is drawn in the Must lane, the rest in Anytime's Deferred list, each with its Undo while it lasts", board.includes("{hiddenMusts.map(renderHiddenMust)}") && board.includes('<p className="t-eyebrow">Deferred</p>') && /canUndoDecision\(item\.decidedAt, clock\)/.test(board));
  check("board: a must's archive waiting seven days says when (deferredNoticeOf)", /out\.archive\?\.effect === "deferred"[\s\S]*?deferredNoticeOf\(out\.title, "archive"/.test(board));
  const week = code("src/app/today/week/page.tsx");
  check("weekly review: 'Deferred n · Aborted m' from this week's decisions (Monday to today)", /readWeekDecisions\(userId, decisionsFrom, today\)/.test(week) && week.includes("<WeekDecisions view={decisions}"));
  const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
  check("life:check runs this check right after subtasks-check", (scripts["life:check"] ?? "").includes("tsx scripts/subtasks-check.ts && tsx scripts/task-decisions-check.ts && tsx scripts/work-boards-check.ts"));

  const css = read("src/components/today/decisions.css");
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  check("css: starts with the layer order, in @layer components, tokens only (no hex, rgb or hsl)", css.split("\n")[0].trim() === "@layer theme, base, components, art, effects, utilities;" && /@layer components \{/.test(bare) && !/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(bare));
  const minOf = (sel: string) => Number(new RegExp(`(?:^|\\})\\s*${sel.replace(/[.[\]()"=]/g, (c) => `\\${c}`)}\\s*\\{[^}]*?min-height:\\s*(\\d+)px`, "m").exec(bare)?.[1] ?? 0);
  for (const [name, sel, min] of [
    ["a reason chip and a return pick", ".dec-chip", 44],
    ["an abort choice", ".dec-opt", 44],
    ["an Undo or a Restore", ".dec-undo", 44],
    ["the drawer's Defer… and Abort…", ".today-pill.td-act", 44],
    ["a hidden must's line", ".t-deferred", 44],
  ] as const) {
    check(`touch target: ${name} ≥ ${min}px`, minOf(sel) >= min, String(minOf(sel)));
  }
  // The weekly review's section lives with the review (components/home): /today/week imports nothing from components/today.
  const weekCss = read("src/components/home/week-decisions.css");
  const weekBare = weekCss.replace(/\/\*[\s\S]*?\*\//g, "");
  check("css (weekly review): its own sheet, the layer order, tokens only", weekCss.split("\n")[0].trim() === "@layer theme, base, components, art, effects, utilities;" && !/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(weekBare));
  check("touch target: a weekly review row ≥ 44px, its Restore ≥ 44px", /\.wk-dec-link, \.wk-dec-body \{[^}]*min-height: 56px/.test(weekBare) && /\.wk-dec-restore \{[^}]*min-height: 44px/.test(weekBare));
  check("weekly review: /today/week imports nothing from components/today (you-check's rule)", !/@\/components\/today\//.test(read("src/app/today/week/page.tsx")));
  const sizes = [...(bare + weekBare).matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g), ...(bare + weekBare).matchAll(/font:\s*(?:\d{3}\s+)?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  check("type: nothing under 12 px", sizes.every((n) => n >= 12), sizes.join(","));
  check("the migration: additive (one nullable column, one table, its indexes and foreign key)", /ADD COLUMN "deferUntil" TIMESTAMP\(3\);/.test(read("prisma/migrations/20261222000000_task_defer_abort/migration.sql")) && !/\bDROP\b|\bDELETE FROM\b|^\s*UPDATE\b|\bALTER COLUMN\b/im.test(read("prisma/migrations/20261222000000_task_defer_abort/migration.sql").replace(/--.*$/gm, "")));
}

async function main() {
  await cores();
  boardChecks();
  wiring();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
void main();
