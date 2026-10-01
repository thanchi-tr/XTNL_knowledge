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
 *     answer kept as its note.
 *
 * No database: nothing here runs a query (importing tasks.ts only creates
 * the idle Prisma client). Today is Thursday 1 October 2026.
 *
 *   npx tsx scripts/capture-server-check.ts
 */
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
} from "../src/lib/tasks";

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

batchChecks()
  .then(replacementChecks)
  .catch((err) => {
    failed++;
    console.log(`FAIL batch checks threw — ${String(err)}`);
  })
  .finally(() => {
    console.log(failed ? `\n${failed} failed` : "\nall pass");
    process.exit(failed ? 1 : 0);
  });
