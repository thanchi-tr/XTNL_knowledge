/**
 * The capture server's pure half (src/lib/tasks.ts, src/lib/today-board.ts):
 *
 *   - the edit planner (planRecapture): the new line is written before the
 *     old one is taken back, the ten-minute boundary, a retry that is a
 *     no-op undo, a missing old row, a done-now line ticked last;
 *   - an edit of a line already archived (C1): a resend (its key already
 *     wrote a row) gets that row back with no new create and no new tick,
 *     anything else is 'gone' (never a second row beside an earlier
 *     edit's); Undo of a line an edit replaced says so instead of
 *     'Removed' (planUndoCapture, standingReplacement);
 *   - a resent done-now line (C2): ticked again only on the life day its
 *     row was saved (resentTickBlock);
 *   - an edit of a ticked line (C3): a tick made on Today is kept on the
 *     new row, an 'x' taken out is not ticked, and the result carries the
 *     tick for the toast's 'Updated … +X' (tickFactsOf, toastCopy);
 *   - a pasted list (runCaptureBatch): the 20-line cap, and every line's
 *     result mapped in order through a stubbed core (saved, refused,
 *     thrown, keyless, a key used twice);
 *   - the empty line's 'Recent' chips (recentCaptureLines): distinct, newest
 *     first, at most eight;
 *   - the duplicate note's open titles (activeTitlesOf): open only, newest
 *     first, capped at 300, each with its board place;
 *   - where a real line goes (captureShapeOf, then placeOf): the toast's
 *     place for the lines capture.md's acceptance names, and an idea's
 *     answer kept as its note;
 *   - the roadmap seams (docs/life-plan/roadmap.md F16 seams 3, 5 and 6,
 *     lane G): captureKey in TEMPLATE_SELECT and on the board's template;
 *     createTemplateCore's `link` (an explicit parent replaces the '^name'
 *     match, the goal override replaces the metric and stated MP, a ROADMAP
 *     goal must come out MID); '+1' refused on a ROADMAP goal; and, read
 *     from the source, the completion and undo actions' practice hook and
 *     the close preview's readings first;
 *   - the unarchive of a roadmap milestone's goal (fix round; roadmap.md
 *     F15, F22; roadmap-types isSupersededRow): refused once its "Start
 *     again" copy has started, or while another milestone is under way;
 *     allowed while the copy is still PLANNED (Undo right after Drop). Run
 *     through unarchiveCore with every Prisma entry it can reach swapped for
 *     a stub or a throwing spy.
 *
 * No database: nothing here runs a query (importing tasks.ts only creates
 * the idle Prisma client; the unarchive cases swap its entries for stubs and
 * restore them). Today is Thursday 1 October 2026.
 *
 *   npx tsx scripts/capture-server-check.ts
 */
// tasks.ts and goals-server.ts read the roadmap's modules (roadmap.md F16 seam 22): no check can reach a model.
import "./_no-model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addDays, dayStartOf, type DayKey } from "../src/lib/life-day";
import { CAPTURE_BATCH_MAX, CAPTURE_UNDO_MS, PLACE_LANES, type ParsedCapture } from "../src/lib/life-types";
import { normTitleOf } from "../src/lib/life-lexicon";
import { MAX_CAPTURE_CHARS, parseCapture } from "../src/lib/capture-parse";
import { captureShapeOf } from "../src/lib/capture-shape";
import { parseRule } from "../src/lib/recurrence";
import { completionBlockOf, placeOf, statsFor, type BoardData, type BoardInstance, type BoardTemplate } from "../src/lib/today-board";
import { toastCopy } from "../src/components/capture/capture-ui";
import {
  ACTIVE_TITLES_MAX,
  BATCH_NO_KEY,
  ROADMAP_GOAL_PROGRESS_REFUSAL,
  TEMPLATE_SELECT,
  captureGoalFields,
  goalProgressRefusalOf,
  linkedGoalFields,
  linkedParentOf,
  toBoardTemplate,
  type CaptureLink,
  type TemplateRow,
  BATCH_SAME_KEY,
  BATCH_THREW,
  BATCH_TOO_MANY,
  RECAPTURE_GONE,
  RECAPTURE_SAME_KEY,
  RECAPTURE_TOO_LATE,
  RECENT_CAPTURE_MAX,
  REPLACEMENT_HOPS,
  RESENT_NOT_TICKED,
  UNDO_CAPTURE_GONE,
  UNDO_CAPTURE_REPLACED,
  UNDO_CAPTURE_TOO_LATE,
  activeTitlesOf,
  lineIsDoneNow,
  planRecapture,
  planUndoCapture,
  recentCaptureLines,
  resentEditOf,
  resentTickBlock,
  runCaptureBatch,
  standingReplacement,
  tickFactsOf,
  type CreatedTask,
  type LifeResult,
  ROADMAP_UNARCHIVE_OTHER_LIVE,
  ROADMAP_UNARCHIVE_REPLACED,
  roadmapUnarchiveRefusalOf,
  unarchiveCore,
  type RoadmapUnarchiveFacts,
  type UnarchiveMilestoneRow,
} from "../src/lib/tasks";
import { prisma } from "../src/lib/prisma";

const TODAY: DayKey = "2026-10-01";
const YESTERDAY = addDays(TODAY, -1);

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// ── Edit a line just saved: planRecapture ─────────────────────────────────
{
  const created = new Date("2026-10-01T02:00:00.000Z");
  const at = (ms: number) => new Date(created.getTime() + ms);
  const steps = (p: ReturnType<typeof planRecapture>) => (p.ok ? p.steps.join(",") : `${p.code ?? p.error}`);

  const fresh = planRecapture({ oldCreatedAt: created, oldArchived: false, now: at(60_000) });
  check(
    "edit: the new line is written before the old one is taken back",
    fresh.ok && fresh.steps.indexOf("create") === 0 && fresh.steps.indexOf("create") < fresh.steps.indexOf("undo-old"),
    steps(fresh)
  );
  const inside = planRecapture({ oldCreatedAt: created, oldArchived: false, now: at(599_999) });
  const edge = planRecapture({ oldCreatedAt: created, oldArchived: false, now: at(CAPTURE_UNDO_MS) });
  const past = planRecapture({ oldCreatedAt: created, oldArchived: false, now: at(600_001) });
  check(
    "edit: 599 999 ms is allowed, exactly 10 min is still in (as for Undo), 600 001 ms is too late",
    inside.ok && edge.ok && !past.ok && past.code === "too-late" && past.error === RECAPTURE_TOO_LATE && CAPTURE_UNDO_MS === 600_000,
    `${steps(inside)} / ${steps(edge)} / ${steps(past)}`
  );
  const again = planRecapture({ oldCreatedAt: created, oldArchived: true, now: at(90_000), oldId: "old", keyRowId: "new" });
  check(
    "edit: a second call after success (old row archived, its key wrote a row) finds that row and is a no-op undo",
    again.ok && again.steps.join(",") === "find" && !again.steps.includes("undo-old"),
    steps(again)
  );
  const gone = planRecapture({ oldCreatedAt: null, oldArchived: false, now: at(1_000) });
  check("edit: a missing old row fails as 'gone'", !gone.ok && gone.code === "gone" && gone.error === RECAPTURE_GONE, steps(gone));
  const done = planRecapture({ oldCreatedAt: created, oldArchived: false, now: at(30_000), doneNow: true });
  check(
    "edit: a done-now line is ticked last, after the old tick is netted out",
    done.ok && done.steps.join(",") === "create,undo-old,tick-new",
    steps(done)
  );
  const lateRetry = planRecapture({ oldCreatedAt: created, oldArchived: true, now: at(15 * 60_000), doneNow: true, oldId: "old", keyRowId: "new" });
  check(
    "edit: past the window, only a retry of an edit that landed goes on, and only to find its row (never a new undo)",
    lateRetry.ok && lateRetry.steps.join(",") === "find",
    steps(lateRetry)
  );
  const clockSkew = planRecapture({ oldCreatedAt: created, oldArchived: false, now: at(-2_000) });
  check("edit: a row stamped a moment ahead of the server's clock is still editable", clockSkew.ok, steps(clockSkew));

  // ── C1: an edit of a line already archived ──
  // Edit P2 replaced X with Y (X archived). Edit P3 of the same X (queued
  // behind P2, a fresh key) must not write Z beside Y and tick it again.
  const second = planRecapture({ oldCreatedAt: created, oldArchived: true, now: at(120_000), doneNow: true, oldId: "X", keyRowId: null });
  check(
    "C1 edit: archived old row + a fresh key (an earlier edit or an Undo took it) is 'gone', with no create and no tick",
    !second.ok && second.code === "gone" && second.error === RECAPTURE_GONE,
    steps(second)
  );
  const secondLate = planRecapture({ oldCreatedAt: created, oldArchived: true, now: at(15 * 60_000), oldId: "X", keyRowId: null });
  check("C1 edit: the same past the window is 'gone' too (the sheet offers Save as new)", !secondLate.ok && secondLate.code === "gone", steps(secondLate));
  const resend = planRecapture({ oldCreatedAt: created, oldArchived: true, now: at(120_000), doneNow: true, oldId: "X", keyRowId: "Y" });
  check(
    "C1 edit: archived old row + this edit's own key (a resend) is only 'find': no new create, no new tick",
    resend.ok && resend.steps.join(",") === "find" && !resend.steps.includes("create") && !resend.steps.includes("tick-new"),
    steps(resend)
  );
  const selfKey = planRecapture({ oldCreatedAt: created, oldArchived: false, now: at(30_000), oldId: "X", keyRowId: "X" });
  const selfKeyArchived = planRecapture({ oldCreatedAt: created, oldArchived: true, now: at(30_000), oldId: "X", keyRowId: "X" });
  check(
    "C1 edit: an edit sent under the old line's own key is refused before anything is written (archived or not)",
    !selfKey.ok && selfKey.error === RECAPTURE_SAME_KEY && !selfKeyArchived.ok && selfKeyArchived.error === RECAPTURE_SAME_KEY,
    `${steps(selfKey)} / ${steps(selfKeyArchived)}`
  );
}

// ── C1: what a resend reports for the row its first send wrote ────────────
{
  const base: CreatedTask = {
    id: "Y",
    title: "Run",
    projectedXp: 5.5,
    describe: "",
    completed: false,
    doneNowError: null,
    duplicate: true,
    where: { lane: "anytime", label: "Anytime" },
  };
  const tick = (day: DayKey, status: BoardInstance["status"] = "DONE", slot = 0) => ({ day, slot, status, xpPaid: 8.3 });
  const savedToday = dayStartOf(TODAY);
  const paid = resentEditOf(base, { doneNow: true, createdAt: savedToday, today: TODAY, instances: [tick(TODAY)] });
  check(
    "C1 resend: the row's tick standing today is reported (what it paid), nothing ticked again",
    paid.completed && paid.projectedXp === 8.3 && paid.doneNowError === null,
    JSON.stringify(paid)
  );
  const unticked = resentEditOf(base, { doneNow: true, createdAt: savedToday, today: TODAY, instances: [tick(TODAY, "UNDONE")] });
  check(
    "C1 resend: a done-now line whose row has no tick today (undone on the board) is not ticked, and says so",
    !unticked.completed && unticked.doneNowError === RESENT_NOT_TICKED && unticked.projectedXp === 5.5,
    JSON.stringify(unticked)
  );
  const plain = resentEditOf(base, { doneNow: false, createdAt: savedToday, today: TODAY, instances: [] });
  check("C1 resend: a plain line comes back as it stands", plain === base || JSON.stringify(plain) === JSON.stringify(base));
}

// ── C1: Undo of a line an edit replaced ───────────────────────────────────
{
  const created = new Date("2026-10-01T02:00:00.000Z");
  const at = (ms: number) => new Date(created.getTime() + ms);
  const shape = (p: ReturnType<typeof planUndoCapture>) => (p.ok ? `ok:${p.steps.join(",")}` : `${p.code ?? "-"}:${p.error}`);
  const replaced = planUndoCapture({ createdAt: created, archivedAt: at(60_000), now: at(70_000), replacedBy: "Y" });
  check(
    "C1 undo: a line an edit replaced (its new line still stands) is refused as 'gone', never 'Removed'",
    !replaced.ok && replaced.code === "gone" && replaced.error === UNDO_CAPTURE_REPLACED,
    shape(replaced)
  );
  const repeat = planUndoCapture({ createdAt: created, archivedAt: at(60_000), now: at(70_000), replacedBy: null });
  check("C1 undo: a repeat of a real Undo (archived, not replaced) is still a no-op ok", repeat.ok && repeat.steps.length === 0, shape(repeat));
  const fresh = planUndoCapture({ createdAt: created, archivedAt: null, now: at(CAPTURE_UNDO_MS) });
  const late = planUndoCapture({ createdAt: created, archivedAt: null, now: at(CAPTURE_UNDO_MS + 1) });
  const missing = planUndoCapture({ createdAt: null, archivedAt: null, now: at(1_000) });
  check(
    "C1 undo: in the window it unticks then archives; past it, too late; a missing row is 'gone'",
    fresh.ok && fresh.steps.join(",") === "untick,archive" && !late.ok && late.error === UNDO_CAPTURE_TOO_LATE && !missing.ok && missing.code === "gone" && missing.error === UNDO_CAPTURE_GONE,
    `${shape(fresh)} / ${shape(late)} / ${shape(missing)}`
  );
}

/** standingReplacement over a stubbed table: a row replaced X when it was created at exactly X's archivedAt. */
async function replacementChecks(): Promise<void> {
  const ms = (n: number) => new Date(Date.UTC(2026, 9, 1, 2, 0, 0, n));
  type Row = { id: string; createdAt: Date; archivedAt: Date | null };
  const lookup = (rows: Row[]) => async (a: { id: string; archivedAt: Date }) =>
    rows.find((r) => r.id !== a.id && r.createdAt.getTime() === a.archivedAt.getTime()) ?? null;

  // X edited into Y: X is archived at Y's createdAt.
  const edited: Row[] = [
    { id: "X", createdAt: ms(0), archivedAt: ms(500) },
    { id: "Y", createdAt: ms(500), archivedAt: null },
  ];
  check("C1 replaced: X edited into Y (Y standing) names Y", (await standingReplacement(edited[0], lookup(edited))) === "Y");
  // X → Y → Z: the line on the board is Z.
  const chain: Row[] = [
    { id: "X", createdAt: ms(0), archivedAt: ms(500) },
    { id: "Y", createdAt: ms(500), archivedAt: ms(900) },
    { id: "Z", createdAt: ms(900), archivedAt: null },
  ];
  check("C1 replaced: an edit of an edit (X → Y → Z) names the line still standing, Z", (await standingReplacement(chain[0], lookup(chain))) === "Z");
  // Undone (archived at the server's clock, no row created then), or replaced by a line since undone.
  const undone: Row[] = [
    { id: "X", createdAt: ms(0), archivedAt: ms(777) },
    { id: "W", createdAt: ms(500), archivedAt: null },
  ];
  const goneToo: Row[] = [
    { id: "X", createdAt: ms(0), archivedAt: ms(500) },
    { id: "Y", createdAt: ms(500), archivedAt: ms(999) },
  ];
  check(
    "C1 replaced: a line taken back by Undo, or whose replacement is gone too, has no standing replacement (Undo stays a no-op)",
    (await standingReplacement(undone[0], lookup(undone))) === null && (await standingReplacement(goneToo[0], lookup(goneToo))) === null
  );
  check("C1 replaced: a row not archived has none", (await standingReplacement({ id: "Y", archivedAt: null }, lookup(edited))) === null);
  let calls = 0;
  const loop = async (a: { id: string; archivedAt: Date }) => {
    calls++;
    return { id: a.id === "A" ? "B" : "A", archivedAt: ms(1) };
  };
  check(
    `C1 replaced: a looping chain stops after ${REPLACEMENT_HOPS} lookups`,
    (await standingReplacement({ id: "A", archivedAt: ms(1) }, loop)) === null && calls === REPLACEMENT_HOPS,
    `${calls} lookups`
  );
}

// ── C2: a resent done-now line, by the life day its row was saved ─────────
{
  const yesterday = new Date(dayStartOf(YESTERDAY).getTime() + 3_600_000);
  const today = new Date(dayStartOf(TODAY).getTime() + 3_600_000);
  const done = (day: DayKey) => [{ day, status: "DONE" as const }];
  const crossDay = resentTickBlock({ duplicate: true, createdAt: yesterday, today: TODAY, instances: [] });
  check(
    "C2 resend: a duplicate done-now line saved on an earlier life day is not ticked today, and says when it was saved",
    crossDay === "Saved on Wed 30 Sep; tick it on Today.",
    String(crossDay)
  );
  const crossDayTicked = resentTickBlock({ duplicate: true, createdAt: yesterday.toISOString(), today: TODAY, instances: done(YESTERDAY) });
  check(
    "C2 resend: one that was ticked that day is not paid a second time today",
    crossDayTicked === "Saved and ticked on Wed 30 Sep.",
    String(crossDayTicked)
  );
  const sameDay = resentTickBlock({ duplicate: true, createdAt: today, today: TODAY, instances: done(TODAY) });
  const fresh = resentTickBlock({ duplicate: false, createdAt: yesterday, today: TODAY, instances: [] });
  check(
    "C2 resend: a same-day duplicate keeps today's idempotent tick (no block), and a first send is never blocked",
    sameDay === null && fresh === null,
    `${sameDay} / ${fresh}`
  );
}

// ── C3: an edit of a ticked line ──────────────────────────────────────────
{
  const created = new Date("2026-10-01T02:00:00.000Z");
  const now = new Date(created.getTime() + 120_000);
  const steps = (p: ReturnType<typeof planRecapture>) => (p.ok ? p.steps.join(",") : `${p.code}`);
  /** The plan for editing `oldLine` (ticked or not) into `newLine`, with both lines read by the real parser. */
  const edit = (oldLine: string, newLine: string, oldTicked: boolean) =>
    planRecapture({
      oldCreatedAt: created,
      oldArchived: false,
      now,
      doneNow: parseCapture(newLine, { today: TODAY }).doneNow,
      oldTicked,
      oldDoneNow: lineIsDoneNow(oldLine, TODAY),
    });
  check(
    "C3 parse: the old row's own line decides (its rawText re-parsed): 'x run 30m' and 'done the dishes' are done-now, 'run 30m' is not",
    lineIsDoneNow("x run 30m", TODAY) && lineIsDoneNow("done the dishes", TODAY) && !lineIsDoneNow("run 30m", TODAY) && !lineIsDoneNow("", TODAY) && !lineIsDoneNow(null, TODAY)
  );
  const boardTicked = edit("gym 60m", "gym 45m", true);
  check("C3 edit: a line ticked on Today, edited, keeps its completion (the new row is ticked after the undo)", boardTicked.ok && steps(boardTicked) === "create,undo-old,keep-tick", steps(boardTicked));
  const xRemoved = edit("x run 30m", "run 30m", true);
  check("C3 edit: 'x run 30m' → 'run 30m' takes the 'x' out: no tick on the new row", xRemoved.ok && steps(xRemoved) === "create,undo-old", steps(xRemoved));
  const xKept = edit("x run 30m", "x run 45m", true);
  check("C3 edit: 'x run 30m' → 'x run 45m' nets the first tick and pays the second", xKept.ok && steps(xKept) === "create,undo-old,tick-new", steps(xKept));
  const xAdded = edit("gym 60m", "x gym 45m", true);
  const untouched = edit("gym 60m", "gym 45m", false);
  check(
    "C3 edit: a board-ticked line edited to done-now is ticked once (tick-new); an unticked line stays unticked",
    xAdded.ok && steps(xAdded) === "create,undo-old,tick-new" && untouched.ok && steps(untouched) === "create,undo-old",
    `${steps(xAdded)} / ${steps(untouched)}`
  );

  // The result carries the kept tick, so the toast reads 'Updated … +8.3'.
  const kept: CreatedTask = {
    id: "Y",
    title: "Gym",
    projectedXp: 8.3,
    describe: "",
    completed: true,
    doneNowError: null,
    duplicate: false,
    where: { lane: "done", label: "Done today" },
  };
  const facts = tickFactsOf(kept);
  const copy = toastCopy({ ...kept, kind: "TASK", href: null, ...facts }, { update: true });
  check(
    "C3 result: a kept completion reports its tick (doneNow, what it paid), and the update toast shows '+8.3'",
    facts.doneNow && facts.doneNowError === null && copy.head === "Updated" && copy.figure?.text === "+8.3" && copy.figure.exact,
    copy.body
  );
  const lost = tickFactsOf({ completed: false, doneNowError: "The old line's tick was taken back. It isn't due today." });
  check("C3 result: a kept completion that could not be made says why", !lost.doneNow && lost.doneNowError?.startsWith("The old line's tick was taken back.") === true);
}

// ── A pasted list: runCaptureBatch through a stubbed core ─────────────────
async function batchChecks(): Promise<void> {
  const calls: string[] = [];
  const stub = async (line: { text: unknown; captureKey: string }): Promise<LifeResult<{ id: string; text: string }>> => {
    calls.push(line.captureKey);
    const text = String(line.text);
    if (text === "boom") throw new Error("database down");
    if (text === "") return { ok: false, error: "Type something to capture." };
    return { ok: true, value: { id: `tpl-${line.captureKey}`, text } };
  };
  const key = (i: number) => `line-${String(i).padStart(3, "0")}`;

  const many = Array.from({ length: CAPTURE_BATCH_MAX + 1 }, (_, i) => ({ text: `task ${i}`, captureKey: key(i) }));
  calls.length = 0;
  const capped = await runCaptureBatch(many, stub);
  const last = capped[CAPTURE_BATCH_MAX];
  check(
    `batch: ${CAPTURE_BATCH_MAX} lines are saved, line ${CAPTURE_BATCH_MAX + 1} is refused with its key and never written`,
    capped.length === CAPTURE_BATCH_MAX + 1 &&
      capped.slice(0, CAPTURE_BATCH_MAX).every((r) => r.ok) &&
      !last.ok &&
      last.captureKey === key(CAPTURE_BATCH_MAX) &&
      last.error === BATCH_TOO_MANY &&
      calls.length === CAPTURE_BATCH_MAX &&
      !calls.includes(key(CAPTURE_BATCH_MAX)),
    `${capped.filter((r) => r.ok).length} saved, ${calls.length} written`
  );

  calls.length = 0;
  // The thrown line is logged by the runner; this run expects it, so the log is held.
  const logError = console.error;
  const logged: unknown[] = [];
  console.error = (...args: unknown[]) => void logged.push(args);
  const mixed = await runCaptureBatch(
    [
      { text: "buy milk", captureKey: "k-milk" },
      { text: "", captureKey: "k-empty" },
      { text: "boom", captureKey: "k-boom" },
      { text: "eggs tmr", captureKey: "x" },
      { text: "bread", captureKey: "k-milk" },
      { text: "jam" },
      null,
      { text: "tea", captureKey: "k-tea" },
    ],
    stub
  ).finally(() => {
    console.error = logError;
  });
  check("batch: a line whose save throws is logged once, server-side", logged.length === 1, `${logged.length} logged`);
  const shape = mixed.map((r) => (r.ok ? `ok:${r.item.id}` : `no:${r.captureKey}:${r.error}`));
  const want = [
    "ok:tpl-k-milk",
    "no:k-empty:Type something to capture.",
    `no:k-boom:${BATCH_THREW}`,
    `no:x:${BATCH_NO_KEY}`,
    `no:k-milk:${BATCH_SAME_KEY}`,
    `no::${BATCH_NO_KEY}`,
    `no::${BATCH_NO_KEY}`,
    "ok:tpl-k-tea",
  ];
  check(
    "batch: every line answers in the order sent — saved, refused (its error), thrown (kept), keyless, a reused key",
    JSON.stringify(shape) === JSON.stringify(want),
    shape.join(" | ")
  );
  check(
    "batch: lines are written one at a time, in order, and refused lines are never written",
    calls.join(",") === "k-milk,k-empty,k-boom,k-tea",
    calls.join(",")
  );
  const notList = await runCaptureBatch("buy milk" as unknown, stub);
  check("batch: anything but a list saves nothing", Array.isArray(notList) && notList.length === 0);

  // A retry of the same list sends the same keys: the stub stands in for the
  // unique key, so a second send answers with the first send's rows.
  const written = new Map<string, string>();
  const dedupe = async (line: { text: unknown; captureKey: string }): Promise<LifeResult<{ id: string; duplicate: boolean }>> => {
    const seen = written.get(line.captureKey);
    if (seen) return { ok: true, value: { id: seen, duplicate: true } };
    const id = `tpl-${written.size + 1}`;
    written.set(line.captureKey, id);
    return { ok: true, value: { id, duplicate: false } };
  };
  const list = [
    { text: "buy milk", captureKey: "nonce-a1" },
    { text: "eggs tmr", captureKey: "nonce-b2" },
  ];
  const first = await runCaptureBatch(list, dedupe);
  const retry = await runCaptureBatch(list, dedupe);
  const ids = (rs: typeof first) => rs.map((r) => (r.ok ? `${r.item.id}${r.item.duplicate ? "*" : ""}` : "x")).join(",");
  check("batch: a resent list finds the rows its first send wrote (per-line keys), nothing twice", ids(first) === "tpl-1,tpl-2" && ids(retry) === "tpl-1*,tpl-2*" && written.size === 2, `${ids(first)} then ${ids(retry)}`);
}

// ── The empty line's 'Recent' chips ───────────────────────────────────────
{
  const rows = [
    { rawText: "gym legs 60m every mon,thu" },
    { rawText: "Gym  legs 60m every mon,thu " },
    { rawText: "call mum sun" },
    { rawText: "" },
    { rawText: null },
    { rawText: "   " },
    ...Array.from({ length: 12 }, (_, i) => ({ rawText: `task ${i}` })),
  ];
  const recent = recentCaptureLines(rows);
  check(
    `recent: distinct lines (case and spacing aside), newest spelling kept, blanks skipped, at most ${RECENT_CAPTURE_MAX}`,
    recent.length === RECENT_CAPTURE_MAX &&
      recent[0] === "gym legs 60m every mon,thu" &&
      recent[1] === "call mum sun" &&
      recent[2] === "task 0" &&
      new Set(recent.map((r) => r.toLowerCase())).size === recent.length,
    JSON.stringify(recent)
  );
  check("recent: the limit is the caller's, and an empty history gives none", recentCaptureLines(rows, 2).length === 2 && recentCaptureLines([]).length === 0);
  check("recent: a line is kept as typed (trimmed), so tapping it re-parses the saved line", recentCaptureLines([{ rawText: "  x run 30m  " }])[0] === "x run 30m");
}

// ── Templates the way the board reads them ────────────────────────────────
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
    estMinutes: 30,
    machineMinutes: 30,
    kind: "TASK",
    inbox: false,
    startDay: TODAY,
    planDay: null,
    horizon: null,
    parentId: null,
    krMetric: null,
    krTarget: null,
    krUnit: null,
    compulsory: false,
    autoTarget: null,
    category: "OTHER",
    lexicalBand: "STANDARD",
    aiBand: null,
    gradeSource: "LEXICAL",
    gradeConfidence: 0.4,
    gradeBasis: null,
    gradeModel: null,
    gradePromptVersion: null,
    gradeAttempts: 0,
    gradeFrozen: false,
    sizing: true,
    bandOverrideAt: null,
    gradeFrozenAt: null,
    topAttribute: null,
    note: null,
    completedAt: null,
    createdAt: "2026-10-01T02:00:00.000Z",
    sortOrder: 0,
    ...p,
  };
}

// ── The duplicate note's open titles ──────────────────────────────────────
{
  const open = Array.from({ length: ACTIVE_TITLES_MAX + 5 }, (_, i) =>
    tpl({ id: `t${String(i).padStart(3, "0")}`, title: `Task number ${i}`, createdAt: new Date(Date.UTC(2026, 8, 1) + i * 60_000).toISOString() })
  );
  const doneOne = tpl({ id: "done", title: "Already finished", completedAt: "2026-10-01T01:00:00.000Z", createdAt: "2026-10-01T00:59:00.000Z" });
  const monHabit = tpl({ id: "mon", title: "Gym legs 60m!", recurrence: "DOW:1", createdAt: "2026-10-01T03:00:00.000Z" });
  const templates = [...open, doneOne, monHabit];
  const stats: BoardData["stats"] = { mon: statsFor(monHabit, parseRule("DOW:1")!, [], TODAY) };
  const active = activeTitlesOf({ today: TODAY, yesterday: YESTERDAY, templates, instances: [], stats });
  check(
    `active: open templates only, newest first, capped at ${ACTIVE_TITLES_MAX}`,
    active.length === ACTIVE_TITLES_MAX && !active.some((a) => a.title === "Already finished") && active[0].title === "Gym legs 60m!" && active[1].title === `Task number ${ACTIVE_TITLES_MAX + 4}`,
    `${active.length}: ${active[0]?.title}, ${active[1]?.title}`
  );
  const gym = active[0];
  check(
    "active: normTitle is normTitleOf(title) (the sheet matches on equality) and where is the board's place",
    gym.normTitle === "gym legs" && gym.normTitle === normTitleOf(gym.title) && gym.where.lane === "upcoming" && gym.where.label === "Habits · next Mon",
    JSON.stringify(gym)
  );
}

// ── Where a real line goes: captureShapeOf, then placeOf ──────────────────
{
  /** The row createTemplateCore would write for a line, as the board reads it, and any done-now tick on it. */
  const placed = (line: string, ticked = false) => {
    const parsed = parseCapture(line, { today: TODAY });
    const s = captureShapeOf(parsed, TODAY);
    const t = tpl({ id: "new", title: parsed.title, ...s });
    const tick: BoardInstance[] = ticked ? [{ id: "i1", templateId: "new", day: TODAY, slot: 0, status: "DONE", source: "manual", xpPaid: 8 }] : [];
    return { parsed, shape: s, t, where: placeOf(t, TODAY, tick) };
  };
  const cases: [string, string][] = [
    ["call the bank", "anytime|Anytime"],
    ["call mum sat", "later|Planned later · Sat 3 Oct"],
    ["gym every mon", "upcoming|Habits · next Mon"],
    ["did i lock the door?", "inbox|Inbox"],
    ["file tax by 11 oct", "anytime|Anytime · by 11 Oct"],
    ["pay rent by fri !", "planned|Planned"],
    ["pay rent today !", "must|Must"],
    ["Q3 report due 30/9", "planned|Planned"],
    ["stretch daily", "habits|Habits"],
    ["yoga 3 times weekly", "habits|Habits"],
    ["every 2 weeks on mon clean gutters", "upcoming|Habits · from Mon"],
    ["goal: read 12 books", "goals|Goals"],
    ["idea: Why does X happen :: because Y", "inbox|Inbox"],
  ];
  const wrong = cases
    .map(([line, want]) => {
      const w = placed(line).where;
      return [line, want, `${w.lane}|${w.label}`] as const;
    })
    .filter(([, want, got]) => want !== got);
  check(
    "where: an undated todo, a planned-later one-off, a habit not due today, an inbox line, a 10-day deadline (and the rest) name their lane",
    wrong.length === 0,
    wrong.map(([l, want, got]) => `'${l}': want '${want}', got '${got}'`).join("; ")
  );
  check("where: every capture's place is a PLACE_LANES lane", cases.every(([line]) => PLACE_LANES.includes(placed(line).where.lane)));

  const run = placed("x run 30m", true);
  check("where: a done-now one-off that was ticked is 'Done today'", run.parsed.doneNow && run.where.lane === "done" && run.where.label === "Done today", `${run.where.label}`);
  // 'x gym every mon' on a Thursday: saved, not ticked, and it says where it waits.
  const gym = placed("x gym every mon");
  const block = completionBlockOf({ t: gym.t, rule: parseRule(gym.t.recurrence), day: TODAY, today: TODAY, lastDone: null, onDay: [] });
  check(
    "where: 'x gym every mon' on a Thursday is refused 'It isn't due today.' and waits under 'Habits · next Mon'",
    gym.parsed.doneNow && block === "It isn't due today." && gym.where.label === "Habits · next Mon",
    `${block} / ${gym.where.label}`
  );
}

// ── An idea's answer is its note; its title is the question ───────────────
{
  const shape = (line: string): { parsed: ParsedCapture; note: string | null; inbox: boolean } => {
    const parsed = parseCapture(line, { today: TODAY });
    const s = captureShapeOf(parsed, TODAY);
    return { parsed, note: s.note, inbox: s.inbox };
  };
  const qa = shape("idea: Why does X happen :: because Y");
  check("idea: 'idea: Q :: A' stores A as the note and Q as the title, in the Inbox", qa.note === "because Y" && qa.parsed.title === "Why does X happen" && qa.inbox, `${qa.parsed.title} / ${qa.note}`);
  const long = "b".repeat(MAX_CAPTURE_CHARS);
  const longQa = shape(`i: Q :: ${long}`);
  check("idea: an answer over 200 characters is kept whole (to the line's own cap)", longQa.note !== null && longQa.note.length > 200 && longQa.note.length <= MAX_CAPTURE_CHARS, `${longQa.note?.length}`);
  check("idea: no answer, no note; a task line never gets one", shape("idea: just a question").note === null && shape("call the bank :: later").note === null);
}

// ── Roadmap seams (roadmap.md F16 seams 3, 5 and 6; lane G) ───────────────
{
  // Seam 3: the board's template carries its capture key ('rm:<milestoneId>' for a roadmap goal).
  const row = (captureKey: string | null): TemplateRow => {
    const r = Object.fromEntries(Object.keys(TEMPLATE_SELECT).map((k) => [k, null])) as Record<string, unknown>;
    Object.assign(r, {
      id: "g1",
      title: "Probability to level 6+",
      normTitle: normTitleOf("Probability to level 6+"),
      kind: "GOAL",
      inbox: false,
      startDay: new Date(Date.UTC(2026, 9, 1)),
      track: "CRAFT",
      category: "OTHER",
      band: "STANDARD",
      lexicalBand: "STANDARD",
      bandOverride: 0,
      estMinutes: 30,
      machineMinutes: 30,
      gradeSource: "LEXICAL",
      gradeConfidence: 0.4,
      gradeAttempts: 0,
      compulsory: false,
      compulsoryOnRest: false,
      intrinsic: false,
      sortOrder: 0,
      createdAt: new Date("2026-10-01T02:00:00.000Z"),
      captureKey,
    });
    return r as unknown as TemplateRow;
  };
  const now = new Date("2026-10-01T03:00:00.000Z");
  check(
    "roadmap seam 3: TEMPLATE_SELECT selects captureKey, and toBoardTemplate fills BoardTemplate.captureKey (null when none)",
    TEMPLATE_SELECT.captureKey === true && toBoardTemplate(row("rm:m1"), now).captureKey === "rm:m1" && toBoardTemplate(row(null), now).captureKey === null
  );

  // Seam 5: the goal override. A milestone whose title reads like a count is still measured by its roadmap.
  const due60 = addDays(TODAY, 60);
  const base = captureGoalFields("GOAL", "Read 12 books", "MID", due60, TODAY);
  const roadmap = (goalMp: number): CaptureLink => ({ goal: { krMetric: "ROADMAP", krTarget: null, krUnit: null, goalMp } });
  const six = linkedGoalFields("GOAL", base, roadmap(6));
  const zero = linkedGoalFields("GOAL", base, roadmap(0));
  check(
    "roadmap seam 5: a linked goal takes the link's metric, target, unit and stated MP (6 or 0), never the title's MANUAL 12 books",
    base.krMetric === "MANUAL" &&
      base.krTarget === 12 &&
      JSON.stringify(six) === JSON.stringify({ horizon: "MID", krMetric: "ROADMAP", krTarget: null, krUnit: null, goalMp: 6 }) &&
      zero.goalMp === 0 &&
      zero.krMetric === "ROADMAP",
    `${JSON.stringify(base)} → ${JSON.stringify(six)} / ${JSON.stringify(zero)}`
  );
  const habit = captureGoalFields("HABIT", "Backtest", null, null, TODAY);
  check(
    "roadmap seam 5: no link, or a link on anything but a goal, changes nothing (the horizon is always horizonFor's)",
    linkedGoalFields("GOAL", base, undefined) === base && linkedGoalFields("GOAL", base, { parentId: "p" }) === base && linkedGoalFields("HABIT", habit, roadmap(6)) === habit && habit.krMetric === null
  );
  const throws = (f: () => unknown): string | null => {
    try {
      f();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };
  const short = throws(() => linkedGoalFields("GOAL", captureGoalFields("GOAL", "Milestone", "MID", addDays(TODAY, 30), TODAY), roadmap(6)));
  const longUntagged = throws(() => linkedGoalFields("GOAL", captureGoalFields("GOAL", "Milestone", null, addDays(TODAY, 183), TODAY), roadmap(6)));
  const midTagged = throws(() => linkedGoalFields("GOAL", captureGoalFields("GOAL", "Milestone", "MID", addDays(TODAY, 183), TODAY), roadmap(6)));
  check(
    "roadmap seam 5: a ROADMAP goal that would not be MID (due in 30 days, or untagged at 183) throws before anything is written; tagged MID at 183 days is MID",
    short !== null && /Mid goal/.test(short) && longUntagged !== null && midTagged === null,
    `${short} / ${longUntagged} / ${midTagged}`
  );
  check(
    "roadmap seam 5: a stated MP that is not a finite number ≥ 0 throws",
    [Number.NaN, -1, Number.POSITIVE_INFINITY].every((mp) => throws(() => linkedGoalFields("GOAL", base, roadmap(mp))) !== null)
  );
  check(
    "roadmap seam 5: a ROADMAP goal states 6 (statedGoalMp('MID')) or 0 and nothing else; a non-roadmap link keeps its own figure",
    [20, 3, 1, 5.99].every((mp) => throws(() => linkedGoalFields("GOAL", base, roadmap(mp))) !== null) &&
      linkedGoalFields("GOAL", base, { goal: { krMetric: "MANUAL", krTarget: 5, krUnit: "runs", goalMp: 3 } }).goalMp === 3
  );
  check(
    "roadmap seam 5: an explicit parentId replaces the '^name' match for a practice or a step; a goal never takes a parent",
    linkedParentOf("HABIT", { parentId: "goal-1" }) === "goal-1" &&
      linkedParentOf("TASK", { parentId: "goal-1" }) === "goal-1" &&
      linkedParentOf("GOAL", { parentId: "goal-1" }) === null &&
      linkedParentOf("TASK", { parentId: "  " }) === null &&
      linkedParentOf("TASK", undefined) === null
  );

  // Seam 5: '+1' on a roadmap goal.
  check(
    "roadmap seam 5: '+1' on a ROADMAP goal is refused ('This goal is measured from your records.'); every other metric takes it",
    goalProgressRefusalOf({ krMetric: "ROADMAP" }) === ROADMAP_GOAL_PROGRESS_REFUSAL &&
      ROADMAP_GOAL_PROGRESS_REFUSAL === "This goal is measured from your records." &&
      ["MANUAL", "CHILDREN", null].every((m) => goalProgressRefusalOf({ krMetric: m }) === null)
  );

  // The wiring, read from the source (comments stripped).
  const ROOT = join(__dirname, "..");
  const code = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const tasks = code("src/lib/tasks.ts");
  const insert = tasks.slice(tasks.indexOf("async function insertCapture("), tasks.indexOf("export interface CaptureGoalFields"));
  check(
    "roadmap seam 5: insertCapture applies the link (linkedGoalFields, then linkedParentOf before the '^name' match) before its insert, and no longer throws 'not wired'",
    !/roadmap link not wired yet/.test(tasks) &&
      /linkedGoalFields\(kind, captureGoalFields\(kind, title, parsed\.horizon, dueDay, today\), opts\.link\)/.test(insert) &&
      insert.indexOf("linkedParentOf(kind, opts.link)") > 0 &&
      insert.indexOf("linkedParentOf(kind, opts.link)") < insert.indexOf("matchParentGoal(") &&
      insert.indexOf("linkedGoalFields(") < insert.indexOf("prisma.taskTemplate"),
    insert.length ? "" : "insertCapture not found"
  );
  const loader = tasks.slice(tasks.indexOf("export async function loadTodayBoard("), tasks.indexOf("export interface TodayCounts"));
  check(
    "roadmap seam 3: the board loader attaches BoardData.roadmapGoals (cached under 'roadmap'): one query, only for open ROADMAP goals, a failure reads as none",
    /cached\(`today:\$\{userId\}:\$\{day\}`, \["life", "activity", "ideas", "roadmap"\]/.test(loader) &&
      /roadmapGoals = await loadBoardRoadmapGoals\(userId, read\.core\.templates, day\)/.test(loader) &&
      /const ids = roadmapGoalIdsOf\(templates\);\s*if \(ids\.length === 0\) return \{\};/.test(loader) &&
      /return await loadRoadmapGoalSeries\(userId, ids, day\);/.test(loader) &&
      /catch \(err\) \{[\s\S]*?return \{\};/.test(loader)
  );
  const progress = tasks.slice(tasks.indexOf("export async function goalProgressCore("));
  check(
    "roadmap seam 5: goalProgressCore reads krMetric and refuses a ROADMAP goal before it records anything",
    /select: \{ id: true, krMetric: true \}/.test(progress) && progress.indexOf("goalProgressRefusalOf(goal)") > 0 && progress.indexOf("goalProgressRefusalOf(goal)") < progress.indexOf("recordActivity(")
  );
  const actions = code("src/app/actions/tasks.ts");
  const fn = (name: string) => {
    const at = actions.indexOf(`export async function ${name}(`);
    const next = actions.indexOf("export async function ", at + 1);
    return at < 0 ? "" : actions.slice(at, next < 0 ? undefined : next);
  };
  const hook = actions.slice(actions.indexOf("function recordPracticeAfter("), actions.indexOf("export type WithCelebrations"));
  check(
    "roadmap seam 6: the practice hook runs recordPracticeForTemplate in after(), only where life writes are on, and never fails the tick",
    /if \(!lifeWritesEnabled\(\)\) return;/.test(hook) && /after\(async \(\) => \{/.test(hook) && /await recordPracticeForTemplate\(userId, id\)/.test(hook) && /catch \(err\)/.test(hook)
  );
  check(
    "roadmap seam 6: completeTask and againTask hand their template to the hook on success",
    ["completeTask", "againTask"].every((n) => /if \(res\.ok\) recordPracticeAfter\(userId, templateId\);/.test(fn(n)))
  );
  const undo = fn("undoCompletion");
  check(
    "roadmap seam 6: undoCompletion hands the undone tick's template to the hook (a make-up's read only after the response), keeping its result's shape",
    /recordPracticeAfter\(userId, res\.value\.templateId\)/.test(undo) &&
      /recordPracticeAfter\(userId, \(\) => templateIdOfInstance\(userId, instanceId\)\)/.test(undo) &&
      /value: \{ instanceId: res\.value\.instanceId, xp: res\.value\.xp \}/.test(undo)
  );
  const preview = fn("previewGoalClose");
  check(
    "roadmap seam 6: previewGoalClose records a ROADMAP goal's readings first (prepareRoadmapGoalClose) and decides from that input",
    /const prep = await prepareRoadmapGoalClose\(userId, goalId, new Date\(\)\);/.test(preview) && /prep\.input \? closeDecision\(prep\.input\) : null/.test(preview) && !/readGoalCloseInput/.test(preview)
  );
  check(
    "previewGoalClose: readings that can't be worked out now (lane L's preview throws where the close would answer GOAL_CLOSE_RETRY) answer 'Couldn't work out what closing pays now', never 'Couldn't save that'",
    /catch \(err\) \{[\s\S]*?return \{ ok: false as const, error: PREVIEW_RETRY \};/.test(preview) &&
      /const PREVIEW_RETRY = "Couldn't work out what closing pays now\. Try again\.";/.test(actions)
  );
}

// ── Unarchive of a roadmap milestone's goal (roadmap.md F15, F22; fix round) ──
// The review (Lens 1) found a lineage paid twice: Drop, Start again (the copy states 6), then
// unarchive the original. roadmap-types isSupersededRow makes the replaced row unmeasurable (R1);
// unarchiveCore refuses to reopen it, and refuses a second open milestone (Start's own rule).
async function unarchiveChecks(): Promise<void> {
  console.log("\n— unarchive of a roadmap milestone's goal —");
  const T0 = Date.UTC(2026, 8, 1);
  const ms = (o: Partial<UnarchiveMilestoneRow> & Pick<UnarchiveMilestoneRow, "id">): UnarchiveMilestoneRow => ({
    lineageId: "L1",
    version: 1,
    status: "STARTED",
    rankIndex: 1,
    createdAt: new Date(T0),
    goalId: null,
    ...o,
  });
  // A 3-milestone plan: m1 reached and closed, m2 started (goal g2) and dropped, m3 planned.
  const m1 = ms({ id: "m1", lineageId: "L1", goalId: "g1" });
  const m2 = ms({ id: "m2", lineageId: "L2", rankIndex: 2, goalId: "g2", createdAt: new Date(T0) });
  const m3 = ms({ id: "m3", lineageId: "L3", rankIndex: 3, status: "PLANNED" });
  const copy = (status: string, goalId: string | null) => ms({ id: "m2b", lineageId: "L2", rankIndex: 2, status, goalId, createdAt: new Date(T0 + 86_400_000) });
  const facts = (row: UnarchiveMilestoneRow, rows: UnarchiveMilestoneRow[], open: string[], roadmapStatus = "ACTIVE"): RoadmapUnarchiveFacts => ({
    row,
    rows,
    roadmapStatus,
    openGoalIds: new Set(open),
  });

  check("unarchive: a goal with no milestone (or no roadmap table) is never refused", roadmapUnarchiveRefusalOf(null) === null);
  check(
    "unarchive: Undo right after Drop (no copy, nothing else under way) reopens the milestone",
    roadmapUnarchiveRefusalOf(facts(m2, [m1, m2, m3], [])) === null
  );
  check(
    "unarchive: a 'Start again' copy still PLANNED supersedes nothing, so the unarchive undoes DROPPED (spec: 'Unarchiving the goal undoes DROPPED')",
    roadmapUnarchiveRefusalOf(facts(m2, [m1, m2, m3, copy("PLANNED", null)], [])) === null
  );
  const replaced = [copy("STARTING", null), copy("STARTED", "g2b")].map((c) => roadmapUnarchiveRefusalOf(facts(m2, [m1, m2, m3, c], c.goalId ? [c.goalId] : [])));
  check(
    "unarchive: once the copy is STARTING or STARTED, the original is replaced: refused, so one lineage never has two paying goals",
    replaced.every((r) => r === ROADMAP_UNARCHIVE_REPLACED),
    JSON.stringify(replaced)
  );
  check(
    "unarchive: …also when the copy was dropped in turn (its goal archived), and on an archived roadmap: a replaced row stays replaced",
    roadmapUnarchiveRefusalOf(facts(m2, [m1, m2, m3, copy("STARTED", "g2b")], [])) === ROADMAP_UNARCHIVE_REPLACED &&
      roadmapUnarchiveRefusalOf(facts(m2, [m1, m2, m3, copy("STARTED", "g2b")], [], "ARCHIVED")) === ROADMAP_UNARCHIVE_REPLACED
  );
  check(
    "unarchive: the dropped copy itself reopens (the original it replaced is not 'another milestone under way')",
    roadmapUnarchiveRefusalOf(facts(copy("STARTED", "g2b"), [m1, m2, m3, copy("STARTED", "g2b")], ["g2"])) === null
  );
  const m3live = ms({ id: "m3", lineageId: "L3", rankIndex: 3, status: "STARTED", goalId: "g3" });
  check(
    "unarchive: refused while another milestone is STARTED with an open goal, or STARTING (Start is one milestone at a time)",
    roadmapUnarchiveRefusalOf(facts(m2, [m1, m2, m3live], ["g3"])) === ROADMAP_UNARCHIVE_OTHER_LIVE &&
      roadmapUnarchiveRefusalOf(facts(m2, [m1, m2, ms({ id: "m3", lineageId: "L3", status: "STARTING" })], [])) === ROADMAP_UNARCHIVE_OTHER_LIVE
  );
  check(
    "unarchive: …but not once that milestone's goal is closed or archived, nor on a roadmap that is no longer ACTIVE",
    roadmapUnarchiveRefusalOf(facts(m2, [m1, m2, m3live], [])) === null && roadmapUnarchiveRefusalOf(facts(m2, [m1, m2, m3live], ["g3"], "DONE")) === null
  );
  check(
    "unarchive: a re-plan's version + 1 rows (PLANNED, DRAFT) under way of nothing never block it",
    roadmapUnarchiveRefusalOf(
      facts(m2, [m1, m2, ms({ id: "m3v2", lineageId: "L3", version: 2, status: "PLANNED" }), ms({ id: "m4v2", lineageId: "L4", version: 2, status: "DRAFT" })], [])
    ) === null
  );

  // ── Through unarchiveCore, every Prisma entry it can reach stubbed (a missed one throws) ──
  const db = prisma as unknown as Record<string, unknown>;
  const ENTRIES = ["$transaction", "$executeRaw", "$queryRaw", "taskTemplate", "roadmapMilestone"] as const;
  const saved = ENTRIES.map((k) => [k, db[k]] as const);
  const calls: string[] = [];
  const NOW = new Date("2026-10-01T02:00:00.000Z");
  const archivedAt = new Date("2026-09-28T01:00:00.000Z");
  const ruleRow = (krMetric: string | null, archived: Date | null) => ({
    id: "g2",
    compulsory: false,
    compulsoryOnRest: false,
    inbox: false,
    kind: "GOAL",
    recurrence: null,
    startDay: new Date("2026-09-01T00:00:00.000Z"),
    dueDay: new Date("2026-11-30T00:00:00.000Z"),
    dueKind: null,
    archivedAt: archived,
    createdAt: new Date("2026-09-01T01:00:00.000Z"),
    pendingChange: null,
    krMetric,
  });
  const spy = (name: string) => () => {
    calls.push(name);
    throw new Error(`database reached: ${name}`);
  };
  /** One scenario: the goal's rule row, the milestone read's answer (a value or a thrown error), the open goals. */
  const scenario = (o: { rule: ReturnType<typeof ruleRow>; milestone?: unknown; milestoneThrows?: unknown; open?: string[] }) => {
    for (const k of ENTRIES) db[k] = k.startsWith("$") ? spy(k) : new Proxy({}, { get: (_t, m) => spy(`${k}.${String(m)}`) });
    db.taskTemplate = new Proxy(
      {
        findFirst: async () => (calls.push("taskTemplate.findFirst"), o.rule),
        findMany: async (args: { where: { id: { in: string[] } } }) => (calls.push(`taskTemplate.findMany:${args.where.id.in.join("|")}`), (o.open ?? []).map((id) => ({ id }))),
        updateMany: async (args: { data: { archivedAt?: unknown } }) => (calls.push(`taskTemplate.updateMany:archivedAt=${String(args.data.archivedAt)}`), { count: 1 }),
      },
      { get: (t, m) => (t as Record<string, unknown>)[String(m)] ?? spy(`taskTemplate.${String(m)}`) }
    );
    db.roadmapMilestone = new Proxy(
      {
        findFirst: async (args: { where: { goalId: string; roadmap: { userId: string } } }) => {
          calls.push(`roadmapMilestone.findFirst:${args.where.goalId}:${args.where.roadmap.userId}`);
          if (o.milestoneThrows) throw o.milestoneThrows;
          return o.milestone ?? null;
        },
      },
      { get: (t, m) => (t as Record<string, unknown>)[String(m)] ?? spy(`roadmapMilestone.${String(m)}`) }
    );
  };
  const withRoadmap = (row: UnarchiveMilestoneRow, rows: UnarchiveMilestoneRow[], status = "ACTIVE") => ({ ...row, roadmap: { status, milestones: rows } });
  const runIt = async (): Promise<LifeResult<null> | { threw: string }> => {
    try {
      return await unarchiveCore("u-unarchive", "g2", NOW);
    } catch (err) {
      return { threw: err instanceof Error ? err.message : String(err) };
    }
  };
  const wrote = () => calls.some((c) => c.startsWith("taskTemplate.updateMany"));
  try {
    calls.length = 0;
    scenario({ rule: ruleRow("ROADMAP", archivedAt), milestone: withRoadmap(m2, [m1, m2, m3, copy("STARTED", "g2b")]), open: ["g2b"] });
    const r1 = await runIt();
    check(
      "unarchiveCore: a dropped goal whose copy has started is refused with ROADMAP_UNARCHIVE_REPLACED (no goal-state read needed), and nothing is written",
      "ok" in r1 &&
        !r1.ok &&
        r1.error === ROADMAP_UNARCHIVE_REPLACED &&
        !wrote() &&
        calls.join() === "taskTemplate.findFirst,roadmapMilestone.findFirst:g2:u-unarchive",
      `${JSON.stringify(r1)} | ${calls.join()}`
    );

    calls.length = 0;
    scenario({ rule: ruleRow("ROADMAP", archivedAt), milestone: withRoadmap(m2, [m1, m2, m3, copy("PLANNED", null)]) });
    const r2 = await runIt();
    check(
      "unarchiveCore: with the copy still PLANNED (and m1's goal closed) it unarchives: archivedAt cleared",
      "ok" in r2 &&
        r2.ok &&
        calls.join() === "taskTemplate.findFirst,roadmapMilestone.findFirst:g2:u-unarchive,taskTemplate.findMany:g1,taskTemplate.updateMany:archivedAt=null",
      `${JSON.stringify(r2)} | ${calls.join()}`
    );

    calls.length = 0;
    scenario({ rule: ruleRow("ROADMAP", archivedAt), milestone: withRoadmap(m2, [m2, m3]) });
    const r2b = await runIt();
    check(
      "unarchiveCore: with no other STARTED milestone it reads no goal states at all",
      "ok" in r2b && r2b.ok && !calls.some((c) => c.startsWith("taskTemplate.findMany")) && wrote(),
      `${JSON.stringify(r2b)} | ${calls.join()}`
    );

    calls.length = 0;
    scenario({ rule: ruleRow("ROADMAP", archivedAt), milestone: withRoadmap(m2, [m1, m2, m3live]), open: ["g3"] });
    const r3 = await runIt();
    check(
      "unarchiveCore: another milestone open (its goal read among the other STARTED rows' goals) refuses with ROADMAP_UNARCHIVE_OTHER_LIVE, nothing written",
      "ok" in r3 && !r3.ok && r3.error === ROADMAP_UNARCHIVE_OTHER_LIVE && !wrote() && calls.includes("taskTemplate.findMany:g1|g3"),
      `${JSON.stringify(r3)} | ${calls.join()}`
    );

    calls.length = 0;
    scenario({ rule: ruleRow(null, archivedAt) });
    const r4 = await runIt();
    check(
      "unarchiveCore: any other template never reads a roadmap table (one rule read, then the write)",
      "ok" in r4 && r4.ok && !calls.some((c) => c.startsWith("roadmapMilestone")) && calls.join() === "taskTemplate.findFirst,taskTemplate.updateMany:archivedAt=null",
      `${JSON.stringify(r4)} | ${calls.join()}`
    );

    calls.length = 0;
    scenario({ rule: ruleRow("ROADMAP", null) });
    const r5 = await runIt();
    check(
      "unarchiveCore: a ROADMAP goal that is not archived (nothing to reopen) reads no roadmap table either",
      "ok" in r5 && r5.ok && !calls.some((c) => c.startsWith("roadmapMilestone")),
      `${JSON.stringify(r5)} | ${calls.join()}`
    );

    calls.length = 0;
    scenario({
      rule: ruleRow("ROADMAP", archivedAt),
      milestoneThrows: Object.assign(new Error("The table `public.RoadmapMilestone` does not exist in the current database."), { code: "P2021", meta: { table: "public.RoadmapMilestone" } }),
    });
    const r6 = await runIt();
    check(
      "unarchiveCore: a missing roadmap table (life_roadmap not applied) reads as no roadmap: the unarchive goes on",
      "ok" in r6 && r6.ok && wrote(),
      `${JSON.stringify(r6)} | ${calls.join()}`
    );

    calls.length = 0;
    scenario({ rule: ruleRow("ROADMAP", archivedAt), milestoneThrows: Object.assign(new Error("Timed out fetching a new connection from the connection pool."), { code: "P2024" }) });
    const r7 = await runIt();
    check(
      "unarchiveCore: any other failure of the roadmap read throws (the action answers 'Couldn't save that'), and the goal stays archived",
      "threw" in r7 && /connection pool/.test(r7.threw) && !wrote(),
      `${JSON.stringify(r7)} | ${calls.join()}`
    );
  } finally {
    for (const [k, v] of saved) db[k] = v;
  }
}

batchChecks()
  .then(replacementChecks)
  .then(unarchiveChecks)
  .catch((err) => {
    failed++;
    console.log(`FAIL batch checks threw — ${String(err)}`);
  })
  .finally(() => {
    console.log(failed ? `\n${failed} failed` : "\nall pass");
    process.exit(failed ? 1 : 0);
  });
