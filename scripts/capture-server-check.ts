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
 *   - the aim from the capture line (roadmap-rev4 F-R4-7, lane C;
 *     components/capture/aim-capture.ts): 'aim: …' read with aimLineOf
 *     before the parse and kept as a task once its chip is tapped; the
 *     vocabulary's open roadmap ('NONE' on a missing table, unknown on any
 *     other failure); the button's words by state, never empty or disabled;
 *     the handoff written with writeAimHandoff (sessionStorage, the line as
 *     sheetText), never a URL; 'Make it an aim' only for a long goal with no
 *     roadmap open while set-an-aim suggestions are on and not snoozed (the
 *     vocabulary's aimPrompt, aimPromptOf over LifeSettings.aimSuggestions
 *     and the snooze cookie: decision 34, fix round 2), and its prefix
 *     rewrite; and, read from the source, that an aim line never reaches a
 *     capture save and adds no key.
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
import { MAX_CAPTURE_CHARS, parseCapture, sanitizeCaptureInput } from "../src/lib/capture-parse";
import * as aimCapture from "../src/components/capture/aim-capture";
import {
  AIM_CHIP,
  AIM_CHIP_SET,
  AIM_FORM_HREF,
  AIM_LONG_GOAL_NOTE,
  AIM_OPEN_DRAFT,
  AIM_OPEN_FORM,
  AIM_OPEN_ROADMAP,
  AIM_ROADMAP_HREF,
  MAKE_IT_AN_AIM,
  OPEN_ROADMAP_STATUSES,
  aimActionOf,
  aimCaptureOf,
  aimChipLabel,
  aimCounterOf,
  aimHandoffOf,
  aimPrefixSpan,
  aimPromptOnOpen,
  aimRewriteOf,
  captureAimOf,
  isCaptureAim,
  isCaptureAimPrompt,
  isLongGoalLine,
  offersAim,
  readCaptureAim,
  readCaptureAimPrompt,
} from "../src/components/capture/aim-capture";
import { AIM_LATER_DAYS, AIM_PROMPT_COOKIE, aimPromptOf, hideCookieValue, laterCookieValue, onCookieValue, type AimPrompt } from "../src/lib/roadmap-invite";
import { AIM_HANDOFF_KEY, aimLineOf, takeAimHandoff, writeAimHandoff, type AimHandoffStorage } from "../src/lib/roadmap-handoff";
import { AIM_MAX, REV4_COLUMNS } from "../src/lib/roadmap-types";
import { captureShapeOf } from "../src/lib/capture-shape";
import { parseRule } from "../src/lib/recurrence";
import { completionBlockOf, placeOf, statsFor, type BoardData, type BoardInstance, type BoardTemplate } from "../src/lib/today-board";
import { VOCAB_FRESH_MS, applyInsert, insertMenuOptions, lineHasPrefix, toastCopy, type Insert } from "../src/components/capture/capture-ui";
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

// ── The aim from the capture line (roadmap-rev4 F-R4-7, lane C) ────────────
// 'aim: …' opens the aim form with a handoff and is never saved as a task; a
// long goal is offered as an aim. aim-capture.ts holds the rules; the sheet's
// wiring and the vocabulary read are pinned from the source.
async function aimCaptureChecks(): Promise<void> {
  console.log("\n— the aim from the capture line —");
  const p0 = (t: string) => parseCapture(t, { today: TODAY });

  // The aim line: aimLineOf is the one parser, and the chip's revert makes the line a task.
  const table: [string, string | null][] = [
    ["aim: Price options", "Price options"],
    ["  AIM :x", "x"],
    ["Aim:   hold a conversation in Japanese  ", "hold a conversation in Japanese"],
    ["aim:", null],
    ["aim:   ", null],
    ["aimless walk", null],
    ["aimless", null],
    ["goal: aim: x", null],
    ["idea: aim: x", null],
    ["x aim: run", null],
    ["my aim: run", null],
    ["", null],
  ];
  const wrong = table.filter(([t, want]) => (aimCaptureOf(t)?.aim ?? null) !== want || aimLineOf(t) !== want);
  check("aim line: aimCaptureOf reads exactly what aimLineOf reads (start of line only; 'aim:' alone, 'aimless', 'goal: aim:' and 'idea: aim:' are not aims)", wrong.length === 0, JSON.stringify(wrong));
  const pa = aimPrefixSpan("  AIM :x");
  check("aim line: the chip's span is the 'aim:' prefix itself ('  AIM :x' → 2..7), and none on a line that is not an aim", !!pa && pa.start === 2 && pa.end === 7 && aimPrefixSpan("aimless") === null && aimPrefixSpan("goal: aim: x") === null);
  const line = "aim: Price options";
  const prefix = aimPrefixSpan(line)!;
  check("aim line: once its chip is tapped (a reverted span over 'aim:') the line is no aim", aimCaptureOf(line, [prefix]) === null && aimCaptureOf(line, [{ start: 2, end: 3 }]) === null);
  check("aim line: a span kept as text elsewhere in the line leaves it an aim", aimCaptureOf(line, [{ start: 5, end: 10 }])?.aim === "Price options");
  const asTask = parseCapture(line, { today: TODAY, reverted: [prefix] });
  const server = sanitizeCaptureInput(line, [prefix]);
  check(
    "aim line: tapped back, it reads as a task on the sheet and the server alike (the server keeps the span and parses the same line)",
    asTask.mode === "TASK" && asTask.kind === "TASK" && !!asTask.title && server.reverted.length === 1 && server.reverted[0].start === 0 && server.reverted[0].end === 4 && JSON.stringify(parseCapture(server.text, { today: TODAY, reverted: server.reverted })) === JSON.stringify(asTask),
    `${asTask.mode} “${asTask.title}”`
  );

  // The open roadmap: the vocabulary's one read.
  check("vocab aim: the statuses read are the open ones, DRAFT and ACTIVE", JSON.stringify([...OPEN_ROADMAP_STATUSES]) === JSON.stringify(["DRAFT", "ACTIVE"]));
  check(
    "vocab aim: no open row is NONE, a DRAFT is DRAFT, an ACTIVE wins over a DRAFT",
    captureAimOf([]) === "NONE" && captureAimOf(["DRAFT"]) === "DRAFT" && captureAimOf(["ACTIVE"]) === "ACTIVE" && captureAimOf(["DRAFT", "ACTIVE"]) === "ACTIVE" && captureAimOf(["DONE", "ARCHIVED"]) === "NONE"
  );
  const missingTable = Object.assign(new Error("The table `public.Roadmap` does not exist in the current database."), { code: "P2021", meta: { modelName: "Roadmap", table: "public.Roadmap" } });
  const missingRelation = Object.assign(new Error('relation "public.Roadmap" does not exist'), { code: "42P01" });
  const missingColumn = Object.assign(new Error("The column `Roadmap.depth` does not exist in the current database."), { code: "P2022", meta: { column: "Roadmap.depth" } });
  const pool = Object.assign(new Error("Timed out fetching a new connection from the connection pool."), { code: "P2024" });
  const throwing = (err: unknown) => async (): Promise<readonly unknown[]> => {
    throw err;
  };
  const [aMissing, aRelation, aColumn, aPool, aNone, aDraft, aBad] = await Promise.all([
    readCaptureAim(throwing(missingTable)),
    readCaptureAim(throwing(missingRelation)),
    readCaptureAim(throwing(missingColumn)),
    readCaptureAim(throwing(pool)),
    readCaptureAim(async () => []),
    readCaptureAim(async () => ["DRAFT"]),
    readCaptureAim(async () => "DRAFT" as unknown as readonly unknown[]),
  ]);
  check("vocab aim: a missing Roadmap table (life_roadmap not applied) is NONE (P2021 and 42P01)", aMissing === "NONE" && aRelation === "NONE", `${aMissing} ${aRelation}`);
  check("vocab aim: any other failure is unknown, never a guessed NONE (a missing column, a pool timeout, a malformed answer)", aColumn === undefined && aPool === undefined && aBad === undefined, `${aColumn} ${aPool} ${aBad}`);
  check("vocab aim: a read that answers is its state", aNone === "NONE" && aDraft === "DRAFT");
  check("vocab aim: the sheet trusts only the three states", isCaptureAim("NONE") && isCaptureAim("DRAFT") && isCaptureAim("ACTIVE") && !isCaptureAim("DONE") && !isCaptureAim(undefined) && !isCaptureAim(null) && !isCaptureAim("none"));

  // The user's "no" (fix round 2): the vocabulary's aimPrompt, aimPromptOf over the stored switch and the snooze cookie.
  const missingAimSuggestions = Object.assign(new Error("The column `LifeSettings.aimSuggestions` does not exist in the current database."), { code: "P2022", meta: { column: "LifeSettings.aimSuggestions" } });
  const missingOther = Object.assign(new Error("The column `LifeSettings.dailyCapacityMin` does not exist in the current database."), { code: "P2022", meta: { column: "LifeSettings.dailyCapacityMin" } });
  const setting = (v: unknown) => async () => v as boolean | null;
  const failing = (err: unknown) => async (): Promise<boolean | null> => {
    throw err;
  };
  // [name, the stored switch's read, the cookie, the switch as aimPromptOf takes it (null: unreadable), want]
  const promptCases: [string, () => Promise<boolean | null | undefined>, string | undefined, boolean | null, AimPrompt | undefined][] = [
    ["on (true), no cookie", setting(true), undefined, true, "ASK"],
    ["never set (null), no cookie", setting(null), undefined, null, "ASK"],
    ["no LifeSettings row (undefined)", setting(undefined), undefined, null, "ASK"],
    ["\"Don't suggest this\" (false)", setting(false), undefined, false, "OFF"],
    ["false beats a fresh 'on:' cookie", setting(false), onCookieValue(TODAY), false, "OFF"],
    ["a legacy 'off' cookie", setting(null), "off", null, "OFF"],
    ["\"Not now\" today ('later:')", setting(true), laterCookieValue(TODAY), true, "LATER"],
    ["the LATER line's x ('hide:', its last day)", setting(null), hideCookieValue(addDays(TODAY, -(AIM_LATER_DAYS - 1))), null, "HIDDEN"],
    ["a 'later:' 28 days old (expired)", setting(null), laterCookieValue(addDays(TODAY, -AIM_LATER_DAYS)), null, "ASK"],
    ["'on:' (the switch turned back on)", setting(true), onCookieValue(TODAY), true, "ASK"],
    ["a malformed cookie", setting(null), "later:2026-02-30", null, "ASK"],
    ["a malformed setting ('yes')", setting("yes"), undefined, null, "ASK"],
    ["the aimSuggestions column missing (P2022: migration not applied) reads on", failing(missingAimSuggestions), undefined, null, "ASK"],
    ["the column missing, with a snooze cookie", failing(missingAimSuggestions), laterCookieValue(TODAY), null, "LATER"],
    ["another column missing is unknown", failing(missingOther), undefined, null, undefined],
    ["a pool timeout is unknown", failing(pool), undefined, null, undefined],
    ["a pool timeout with an 'off' cookie is still unknown (no guess)", failing(pool), "off", null, undefined],
  ];
  const promptGot = await Promise.all(promptCases.map(([, read, cookie]) => readCaptureAimPrompt(read, cookie, TODAY)));
  const promptWrong = promptCases.map(([name, , cookie, , want], i) => ({ name, cookie, want, got: promptGot[i] })).filter((c) => c.got !== c.want);
  check("vocab prompt: readCaptureAimPrompt is aimPromptOf over the switch and the cookie; a missing aimSuggestions column reads on; any other failure is unknown", promptWrong.length === 0, JSON.stringify(promptWrong));
  check(
    "vocab prompt: every answer agrees with aimPromptOf, the one rule /you, Today and Settings read",
    promptCases.every(([, , cookie, sw], i) => promptGot[i] === undefined || promptGot[i] === aimPromptOf(cookie, sw, TODAY)) && promptGot.filter((g) => g !== undefined).length === promptCases.length - 3 && AIM_PROMPT_COOKIE.length > 0
  );
  check("vocab prompt: the sheet trusts only the four states", ["ASK", "LATER", "HIDDEN", "OFF"].every(isCaptureAimPrompt) && ![undefined, null, "ask", "ON", "", 1].some(isCaptureAimPrompt));
  const fresh = { day: TODAY, at: 1_000_000, aimPrompt: "ASK" as AimPrompt, aim: "NONE" as const };
  const keptFresh = aimPromptOnOpen(fresh, TODAY, 1_000_000 + VOCAB_FRESH_MS - 1, VOCAB_FRESH_MS);
  const droppedOld = aimPromptOnOpen(fresh, TODAY, 1_000_000 + VOCAB_FRESH_MS, VOCAB_FRESH_MS);
  const droppedDay = aimPromptOnOpen(fresh, addDays(TODAY, 1), 1_000_001, VOCAB_FRESH_MS);
  const noPrompt: { day: DayKey; at: number; aimPrompt?: AimPrompt } = { day: TODAY, at: 0 };
  const longLine = p0("goal long: run a marathon");
  check(
    "vocab prompt: on a new opening, a prompt read VOCAB_FRESH_MS ago or on another life day is unknown again (the next load reads it), a fresher one is kept as it is, and nothing else changes",
    keptFresh === fresh &&
      droppedOld !== null &&
      droppedOld.aimPrompt === undefined &&
      droppedOld.aim === "NONE" &&
      droppedOld.at === fresh.at &&
      fresh.aimPrompt === "ASK" &&
      droppedDay !== null &&
      droppedDay.aimPrompt === undefined &&
      aimPromptOnOpen(noPrompt, TODAY, 10 * VOCAB_FRESH_MS, VOCAB_FRESH_MS) === noPrompt &&
      aimPromptOnOpen(null, TODAY, 0, VOCAB_FRESH_MS) === null &&
      !offersAim(longLine, droppedOld.aim, droppedOld.aimPrompt) &&
      offersAim(longLine, keptFresh!.aim, keptFresh!.aimPrompt),
    JSON.stringify([droppedOld, droppedDay])
  );

  // The button, the chip and the counter.
  const states = [undefined, null, "NONE", "DRAFT", "ACTIVE", "junk"] as const;
  const acts = states.map((s) => aimActionOf(s as Parameters<typeof aimActionOf>[0]));
  check(
    "aim button: never empty, and only ever one of the three fixed paths' words",
    acts.every((a) => typeof a.label === "string" && a.label.trim().length > 0 && [AIM_FORM_HREF, AIM_ROADMAP_HREF].includes(a.href) && a.keyHint.length > 0 && a.touchHint.length > 0),
    JSON.stringify(acts.map((a) => a.label))
  );
  check(
    "aim button: 'Open the aim form' (→ /you/roadmap/new) with no roadmap or unknown, 'Open your draft' (→ /you/roadmap) with a DRAFT, 'Open your roadmap' (→ /you/roadmap) with an ACTIVE one",
    acts[0].label === AIM_OPEN_FORM && acts[1].label === AIM_OPEN_FORM && acts[2].label === AIM_OPEN_FORM && acts[5].label === AIM_OPEN_FORM && acts[2].href === "/you/roadmap/new" &&
      acts[3].label === AIM_OPEN_DRAFT && acts[3].href === "/you/roadmap" && acts[4].label === AIM_OPEN_ROADMAP && acts[4].href === "/you/roadmap" &&
      AIM_OPEN_FORM === "Open the aim form" && AIM_OPEN_DRAFT === "Open your draft" && AIM_OPEN_ROADMAP === "Open your roadmap"
  );
  check("aim button: the aim is handed over except to an ACTIVE roadmap (which can't take a new aim)", acts[2].handoff && acts[3].handoff && !acts[4].handoff && acts[0].handoff);
  check("aim button: the footer says what Enter does instead of 'Enter saves'", acts.every((a) => /^Enter opens /.test(a.keyHint) && /^Enter opens /.test(a.touchHint) && !/saves/.test(a.keyHint)));
  check(
    "aim chip: 'Aim → roadmap form', and 'Aim · one is already set' with an ACTIVE roadmap",
    AIM_CHIP === "Aim → roadmap form" && AIM_CHIP_SET === "Aim · one is already set" && aimChipLabel("ACTIVE") === AIM_CHIP_SET && aimChipLabel("DRAFT") === AIM_CHIP && aimChipLabel("NONE") === AIM_CHIP && aimChipLabel(undefined) === AIM_CHIP
  );
  check("aim counter: 'n / 140' only past the form's 140 (counted as the form counts)", AIM_MAX === 140 && aimCounterOf("x".repeat(140)) === null && aimCounterOf("x".repeat(141)) === "141 / 140" && aimCounterOf("") === null);

  // The handoff: sessionStorage, the line as sheetText, never a URL.
  const mem = new Map<string, string>();
  const store: AimHandoffStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
  const sheet = "aim: hold a conversation in Japanese";
  const cap = aimCaptureOf(sheet)!;
  const h = aimHandoffOf(cap, sheet);
  check("handoff: {aim, source 'capture', sheetText: the line exactly}", h.aim === "hold a conversation in Japanese" && h.source === "capture" && h.sheetText === sheet && Object.keys(h).sort().join() === "aim,sheetText,source");
  const NOW = Date.UTC(2026, 9, 1, 2);
  const wrote = writeAimHandoff(h, store, NOW);
  const back = takeAimHandoff(NOW + 60_000, store);
  check(
    "handoff: written with writeAimHandoff under its sessionStorage key, taken once with the aim, the source and the line intact",
    wrote && back !== null && back.aim === h.aim && back.source === "capture" && back.sheetText === sheet && !mem.has(AIM_HANDOFF_KEY) && takeAimHandoff(NOW + 60_000, store) === null
  );
  const long = `aim: ${"y".repeat(495)}`;
  check("handoff: the longest aim a line can hold (495) travels whole", long.length === MAX_CAPTURE_CHARS && writeAimHandoff(aimHandoffOf(aimCaptureOf(long)!, long), store, NOW) && takeAimHandoff(NOW, store)?.aim.length === 495);

  // A long goal, offered as an aim.
  const p = (t: string) => parseCapture(t, { today: TODAY });
  const longLines = ["goal long: run a marathon", "run a marathon #long", "goal: run a marathon #long", "goal: run a marathon by 30 jun 2027"];
  const notLong = ["goal: run a marathon", "goal mid: run a 10K", "goal short: tidy the desk", "run a marathon", "#long", "idea: what is long? :: x", "aim: run a marathon"];
  check("long goal: 'goal long:', '#long' and a goal dated over 180 days out are long goals", longLines.every((t) => isLongGoalLine(p(t))), longLines.filter((t) => !isLongGoalLine(p(t))).join(" | "));
  check("long goal: a goal with no horizon, MID, SHORT, a task, a bare '#long' (no title), an idea and an aim line are not", notLong.every((t) => !isLongGoalLine(p(t))), notLong.filter((t) => isLongGoalLine(p(t))).join(" | "));
  const prompts = ["ASK", "LATER", "HIDDEN", "OFF", undefined, null] as const;
  const offerTable = longLines.flatMap((t) => (["NONE", "DRAFT", "ACTIVE", undefined] as const).flatMap((a) => prompts.map((q) => [t, a, q, offersAim(p(t), a, q)] as const)));
  check(
    "'Make it an aim' shows only for a long goal with no roadmap open (NONE), never with a DRAFT, an ACTIVE roadmap or an unknown state",
    offerTable.filter(([, , q]) => q === "ASK").every(([, a, , o]) => o === (a === "NONE")) && notLong.every((t) => !offersAim(p(t), "NONE", "ASK")),
    JSON.stringify(offerTable.filter(([, a, q, o]) => q === "ASK" && o !== (a === "NONE")))
  );
  // Fix round 2 (decision 34: "Not now" quiets every set-an-aim suggestion; the lasting no is the user's).
  check(
    "'Make it an aim' is a set-an-aim suggestion: only while the prompt is ASK; never after \"Don't suggest this\" or the Settings switch (OFF), never in a 4-week \"Not now\" (LATER, HIDDEN), never when the prompt is unknown",
    offerTable.every(([, a, q, o]) => o === (a === "NONE" && q === "ASK")) && offerTable.filter(([, a, q]) => a === "NONE" && q !== "ASK").length === longLines.length * 5,
    JSON.stringify(offerTable.filter(([, a, q, o]) => o !== (a === "NONE" && q === "ASK")))
  );
  check("'Make it an aim': the copy", AIM_LONG_GOAL_NOTE === "Long-term? Make it your aim: the app plans milestones and measures them." && MAKE_IT_AN_AIM === "Make it an aim");
  const rewrites: [string, string, string][] = [
    ["goal long: run a marathon", "aim: run a marathon", "run a marathon"],
    ["run a marathon #long", "aim: run a marathon", "run a marathon"],
    ["run #long a marathon", "aim: run a marathon", "run a marathon"],
    ["goal: run a marathon #long", "aim: run a marathon", "run a marathon"],
    ["goal long: learn Japanese #care", "aim: learn Japanese #care", "learn Japanese #care"],
    ["goal: run a marathon by 30 jun 2027", "aim: run a marathon by 30 jun 2027", "run a marathon by 30 jun 2027"],
    ["  goal long:  learn x", "  aim:  learn x", "learn x"],
  ];
  const badRewrites = rewrites.filter(([t, want, aim]) => {
    const r = aimRewriteOf(t, [], p(t));
    return !r || r.text !== want || r.caret !== want.length || aimCaptureOf(r.text, r.reverted)?.aim !== aim;
  });
  check("'Make it an aim': the goal prefix becomes 'aim:' and the '#long' that made it a goal goes; every other word stays as typed", badRewrites.length === 0, JSON.stringify(badRewrites.map(([t]) => [t, aimRewriteOf(t, [], p(t))?.text])));
  check("'Make it an aim': nothing to rewrite on a line that is not a long goal", notLong.every((t) => aimRewriteOf(t, [], p(t)) === null));
  const kept = "goal long: pay rent by fri";
  const keptSpan = { start: kept.indexOf("by fri"), end: kept.length };
  const keptRw = aimRewriteOf(kept, [keptSpan], parseCapture(kept, { today: TODAY, reverted: [keptSpan] }));
  check(
    "'Make it an aim': a span kept as text moves with its words",
    !!keptRw && keptRw.text === "aim: pay rent by fri" && keptRw.reverted.length === 1 && keptRw.text.slice(keptRw.reverted[0].start, keptRw.reverted[0].end) === "by fri",
    JSON.stringify(keptRw)
  );

  // The Goal ▾ menu's 'New aim' inserts 'aim: ' (capture-ui applyInsert treats it as a prefix, like 'goal: ').
  const newAim: Insert = { text: "aim: ", field: "mode" };
  const ins = (t: string) => applyInsert(t, [], newAim, p(t), { today: TODAY });
  const intoWords = ins("hold a conversation in Japanese");
  const intoEmpty = ins("");
  check(
    "goal menu: 'aim: ' in front of the words makes an aim line; on an empty line it waits for the words",
    intoWords?.text === "aim: hold a conversation in Japanese" && aimCaptureOf(intoWords.text, intoWords.reverted)?.aim === "hold a conversation in Japanese" && intoEmpty?.text === "aim: " && aimCaptureOf(intoEmpty.text) === null,
    JSON.stringify([intoWords?.text, intoEmpty?.text])
  );
  // The option itself (the lead's handoff, landed): capture-ui insertMenuOptions, InsertRow and the sheet's one attribute.
  {
    const goalMenu = (ctx: object) => insertMenuOptions("goal", ctx as Parameters<typeof insertMenuOptions>[1]);
    const goalIds = (ctx: object) => goalMenu(ctx).map((c) => c.id);
    const withAim = (aim: unknown, hasMode = false, goals: { id: string; title: string }[] | null = []) => goalIds({ today: TODAY, goals, hasMode, aim });
    const strip = (s: string) => s.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    const rowSrc = strip(readFileSync(join(__dirname, "..", "src/components/capture/InsertRow.tsx"), "utf8"));
    const qcSrc = strip(readFileSync(join(__dirname, "..", "src/components/capture/QuickCapture.tsx"), "utf8"));
    const uiSrc = strip(readFileSync(join(__dirname, "..", "src/components/capture/capture-ui.ts"), "utf8"));
    check(
      "goal menu: 'New aim' (after 'New goal') only with no roadmap open and no prefix; the sheet passes the open roadmap to the row",
      withAim("NONE").join() === "goal-new,goal-new-aim,goal-none" &&
        ["DRAFT", "ACTIVE", undefined].every((a) => !withAim(a).includes("goal-new-aim")) &&
        !withAim("NONE", true).includes("goal-new-aim") &&
        /insertMenuOptions\(menu, \{ today, goals, hasMode, aim \}\)/.test(rowSrc) &&
        /<InsertRow [^>]*aim=\{editing \? undefined : vocab\?\.aim\}/.test(qcSrc),
      withAim("NONE").join()
    );
    check(
      "goal menu: 'New aim' sits between 'New goal' and the goals to link, while the goals load and once they have loaded",
      withAim("NONE", false, null).join() === "goal-new,goal-new-aim,goal-loading" &&
        withAim("NONE", false, [{ id: "g1", title: "Run a marathon" }]).join() === "goal-new,goal-new-aim,goal-links,goal-to-g1" &&
        withAim("ACTIVE", false, [{ id: "g1", title: "Run a marathon" }]).join() === "goal-new,goal-links,goal-to-g1" &&
        withAim("NONE", true, [{ id: "g1", title: "Run a marathon" }]).join() === "goal-links,goal-to-g1",
      JSON.stringify([withAim("NONE", false, null), withAim("NONE", false, [{ id: "g1", title: "Run a marathon" }])])
    );
    const opt = goalMenu({ today: TODAY, goals: [], aim: "NONE" }).find((c) => c.id === "goal-new-aim");
    check(
      "goal menu: 'New aim' inserts the 'aim: ' prefix, named for a screen reader ('New aim: Add “aim:” to the line'), and is never disabled",
      !!opt && opt.label === "New aim" && opt.name === "New aim: Add “aim:” to the line" && opt.insert?.text === "aim: " && opt.insert.field === "mode" && !opt.disabled && !opt.menu && !opt.eyebrow,
      JSON.stringify(opt)
    );
    // Tapping it on a line of words makes the aim line, whose Enter opens the aim form through the handoff (submit → openAimForm).
    const tapped = opt?.insert ? applyInsert("speak Japanese at work", [], opt.insert, p("speak Japanese at work"), { today: TODAY }) : null;
    check(
      "goal menu: tapping 'New aim' on a line of words makes an aim line (the form opens from it with the handoff, never a URL)",
      tapped?.text === "aim: speak Japanese at work" && aimCaptureOf(tapped.text, tapped.reverted)?.aim === "speak Japanese at work" && aimLineOf(tapped.text) === "speak Japanese at work",
      JSON.stringify(tapped)
    );
    // "The line already has a prefix": a parsed mode, or a leading 'aim:' (bare or with words), which the parser never reads.
    const prefixed = ["goal: run a marathon", "idea: what is a p-value :: the chance of data this extreme", "aim: ", "aim:", "aim: run a marathon", "  AIM : x"];
    const plain = ["", "buy milk", "aimless walk", "tmr aim: x", "the aim: x", "goal"];
    check(
      "goal menu: a line with a prefix (a parsed mode, or a leading 'aim:') hides 'New goal' and 'New aim'; any other line keeps both",
      prefixed.every((t) => lineHasPrefix(p(t), t)) && plain.every((t) => !lineHasPrefix(p(t), t)) && /const hasMode = lineHasPrefix\(parsed, text\)/.test(rowSrc),
      JSON.stringify([prefixed.filter((t) => !lineHasPrefix(p(t), t)), plain.filter((t) => lineHasPrefix(p(t), t))])
    );
    check(
      "goal menu: 'New aim' is a tool the user opens: it reads the open roadmap only, never the prompt (no aimPrompt in the row or the menu), and adds no key",
      !/aimPrompt/.test(rowSrc) && !/aimPrompt/.test(uiSrc) && !/addEventListener\(\s*["']key/.test(rowSrc) && !/onKeyDown=\{[^}]*aim/i.test(rowSrc) && /import type \{[^}]*\bCaptureAim\b[^}]*\} from "\.\.\/\.\.\/app\/actions\/capture"/.test(uiSrc) && !/from "\.\/aim-capture"|roadmap-handoff/.test(uiSrc),
      "capture-ui.ts keeps a type-only import of CaptureAim (no runtime path to the roadmap modules)"
    );
  }

  // Copy: no model, no reward words, no counts (roadmap-rev4 decision 33 and the Names rules).
  const words = (Object.values(aimCapture) as unknown[]).filter((v): v is string => typeof v === "string");
  const copy = [...words, ...acts.flatMap((a) => [a.label, a.keyHint, a.touchHint])];
  const badCopy = copy.filter((s) => /gemini|\bearn|mastery|⬡|\bquests?\b|\bdeadline\b/i.test(s));
  check("copy: no Gemini, earn, mastery, ⬡, quest or deadline in the aim copy", badCopy.length === 0 && copy.length >= 10, badCopy.join(" | "));

  // ── The wiring, read from the source ──
  const ROOT = join(__dirname, "..");
  const strip = (s: string) => s.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const qc = strip(readFileSync(join(ROOT, "src/components/capture/QuickCapture.tsx"), "utf8"));
  const bodyOf = (src: string, head: string) => {
    const at = src.indexOf(head);
    if (at < 0) return "";
    const end = src.indexOf("\n  };\n", at);
    return src.slice(at, end < 0 ? undefined : end);
  };
  const submitBody = bodyOf(qc, "const submit = (");
  const ia = submitBody.indexOf("aimCaptureOf(line.text, line.reverted)");
  check(
    "sheet: submit reads the aim line before the parse and returns before anything is stored or sent (every Enter, the button and compositionend come through submit)",
    ia > 0 &&
      ia < submitBody.indexOf("parseCapture(line.text") &&
      ia < submitBody.indexOf("addPending(pending)") &&
      ia < submitBody.indexOf("sendLine(pending") &&
      /const aimLine = editing \? null : aimCaptureOf\(line\.text, line\.reverted\);\s*if \(aimLine\) \{\s*openAimForm\(aimLine, line\.text\);\s*return;\s*\}/.test(submitBody),
    `submit: ${submitBody.length} chars`
  );
  const open = bodyOf(qc, "const openAimForm = (");
  check(
    "sheet: an aim line never calls a capture save: openAimForm writes the handoff with writeAimHandoff, closes and navigates, and stores or sends nothing",
    /if \(act\.handoff\) writeAimHandoff\(aimHandoffOf\(capture, sheetText\)\);/.test(open) &&
      /closeSheet\("navigate"\);\s*router\.push\(act\.href\);/.test(open) &&
      !/createFromCapture|createManyFromCapture|recaptureFromCapture|sendLine|sendBatch|addPending|writeDraft|startTransition/.test(open),
    `openAimForm: ${open.length} chars`
  );
  const pushes = [...qc.matchAll(/router\.push\(([^)]*)\)/g)].map((m) => m[1]);
  check(
    "sheet: the aim never travels in a URL (no '?aim=', no search params; every router.push takes a fixed path)",
    pushes.length === 1 && pushes[0] === "act.href" && !/[?&]aim=/.test(qc) && !/searchParams/.test(qc) && AIM_FORM_HREF === "/you/roadmap/new" && AIM_ROADMAP_HREF === "/you/roadmap",
    pushes.join(", ")
  );
  check(
    "sheet: the aim line's primary is never disabled and reads the action's words; it gets no To Inbox and no insert row",
    /const primaryDisabled = aimAct \? false : !primary\.done && !canSave;/.test(qc) &&
      /disabled=\{primaryDisabled\}/.test(qc) &&
      /const primaryLabel = aimAct \? aimAct\.label :/.test(qc) &&
      /const canInbox = canSave && !aimCap &&/.test(qc) &&
      /if \(!paste && !weighIn && !aimCap\) \{/.test(qc)
  );
  check(
    "sheet: an aim line is read only off an edit and off a paste preview (an edit replaces a task row)",
    /const aimCap = useMemo\(\(\) => \(open && day && !editing && !paste \? aimCaptureOf\(text, reverted\) : null\)/.test(qc)
  );
  check(
    "sheet: 'Make it an aim' renders only under aimOffer = a long goal (not an aim line, not an edit, not a paste) with aim NONE and the prompt ASK",
    /const longGoal = !aimCap && !editing && !paste && isLongGoalLine\(parsed\);/.test(qc) &&
      /const aimOffer = longGoal && offersAim\(parsed, vocab\?\.aim, vocab\?\.aimPrompt\);/.test(qc) &&
      /\{aimOffer && \([\s\S]{0,400}AIM_LONG_GOAL_NOTE[\s\S]{0,400}onClick=\{makeItAnAim\}[\s\S]{0,80}MAKE_IT_AN_AIM/.test(qc) &&
      (qc.match(/MAKE_IT_AN_AIM/g) ?? []).length === 2
  );
  check(
    "sheet: the aim chip reverts the 'aim:' prefix through the reverted spans, or puts back the goal line right after 'Make it an aim'",
    /const revertAim = \(\) => \{[\s\S]*?if \(rewrite && rewrite\.to === line\.text\) \{\s*setLine\(rewrite\.from\.text, rewrite\.from\.reverted\);[\s\S]*?const span = aimPrefixSpan\(line\.text\);[\s\S]*?setLine\(line\.text, \[\.\.\.line\.reverted, span\]\);/.test(qc) &&
      /onClick=\{revertAim\}/.test(qc)
  );
  const cacheLiteral = /const cache: VocabCache = \{[^}]*\}/.exec(qc)?.[0] ?? "";
  check("sheet: the open roadmap and the suggestions prompt are never written to the stored vocabulary (they ride in memory, unknown after a reload)", cacheLiteral.length > 0 && !/\baim\b|aimPrompt/.test(cacheLiteral));
  const loadBody = qc.slice(qc.indexOf("const loadVocab = useCallback("), qc.indexOf("const considerVocab = useCallback("));
  check(
    "sheet: the prompt comes only from a server answer it trusts (isCaptureAimPrompt), unknown otherwise, and rides beside the open roadmap",
    /const aimPrompt = isCaptureAimPrompt\(v\.aimPrompt\) \? v\.aimPrompt : undefined;/.test(loadBody) &&
      /setVocab\(\(prev\) => \(\{ \.\.\.cache, priced: true, words: [^}]*, aim, aimPrompt \}\)\);/.test(loadBody) &&
      (qc.match(/\baimPrompt:/g) ?? []).length === 0,
    `loadVocab: ${loadBody.length} chars`
  );
  check(
    "sheet: a new opening forgets a prompt read over VOCAB_FRESH_MS ago (aimPromptOnOpen over vocabOnOpen), so a \"no\" tapped since is never contradicted",
    /if \(!wasOpen\) \{[\s\S]*?setVocab\(\(v\) => vocabOnOpen\(v, today, Date\.now\(\)\)\);\s*setVocab\(\(v\) => aimPromptOnOpen\(v, today, Date\.now\(\), VOCAB_FRESH_MS\)\);[\s\S]*?\n      \}/.test(qc) &&
      (qc.match(/aimPromptOnOpen\(/g) ?? []).length === 1
  );
  check(
    "sheet: a long goal asks for the prompt too (stale until a load says it), under the refresh rules that keep saves first; an aim line's action never reads it",
    /aimPromptWantedRef\.current = longGoal;/.test(qc) &&
      /\|\| \(aimPromptWantedRef\.current && v\?\.aimPrompt === undefined\)/.test(qc) &&
      /if \(open && \(\(aimWanted && vocab\?\.aim === undefined\) \|\| \(longGoal && vocab\?\.aimPrompt === undefined\)\)\) considerVocab\(\);/.test(qc) &&
      !/aimPrompt/.test(submitBody) &&
      !/aimPrompt/.test(open) &&
      aimActionOf.length === 1
  );
  check(
    "sheet: an aim line asks for the open roadmap at once, once per opening; a long goal asks under the refresh rules that keep saves first",
    /if \(openRef\.current && aimLineRef\.current && v\?\.aim === undefined && !o\.refreshed\) \{\s*o\.refreshed = true;\s*loadVocab\(false\);/.test(qc) &&
      /stale: vocabStale\(v, todayKey\(\), now\) \|\| \(aimWantedRef\.current && v\?\.aim === undefined\)/.test(qc)
  );
  check(
    "keys: no new shortcut (still the two window keydown listeners: the capture hotkey and Ctrl+Z's undo), and shortcuts.ts has no aim key",
    (qc.match(/addEventListener\("keydown"/g) ?? []).length === 2 && !/\baim\b/i.test(readFileSync(join(ROOT, "src/lib/shortcuts.ts"), "utf8"))
  );

  const ac = readFileSync(join(ROOT, "src/components/capture/aim-capture.ts"), "utf8");
  const acImports = ac.match(/^import[^;]+;/gm) ?? [];
  check(
    "guard: aim-capture imports no database, task, ledger, cache or model code, and only types from the server actions (it runs in the browser too)",
    acImports.length > 0 &&
      acImports.every((l) => !/prisma|tasks|ledger|activity|cache|gemini|roadmap-model|roadmap-server|roadmap-evidence|next\//i.test(l)) &&
      acImports.filter((l) => l.includes("app/actions")).every((l) => l.startsWith("import type")),
    acImports.join(" | ")
  );

  const actions = strip(readFileSync(join(ROOT, "src/app/actions/capture.ts"), "utf8"));
  const loader = actions.slice(actions.indexOf("const loadCaptureAim = "), actions.indexOf("type VocabWords"));
  check(
    "action: the vocabulary's aim is one read cached on 'roadmap', of the open rows' status only (no revision-4 column), through readCaptureAim",
    /readCaptureAim\(\(\) =>\s*cached\(`captureAim:\$\{userId\}`, \["roadmap"\], async \(\) => \{/.test(loader) &&
      /prisma\.roadmap\.findMany\(\{\s*where: \{ userId, status: \{ in: \[\.\.\.OPEN_ROADMAP_STATUSES\] \} \},\s*select: \{ status: true \},\s*take: 2,\s*\}\)/.test(loader) &&
      !REV4_COLUMNS.some((c) => new RegExp(`\\b${c}\\b`).test(loader)),
    `loader: ${loader.length} chars`
  );
  const vocabFn = actions.slice(actions.indexOf("export async function loadCaptureVocabulary("));
  check(
    "action: loadCaptureVocabulary reads the aim and the prompt in its one Promise.all and returns each only when known",
    /const \[vocab, structure, goals, rawBefore, recent, active, weightUnit, aim, aimPrompt\] = await Promise\.all\(\[/.test(vocabFn) &&
      /loadCaptureAim\(userId\),\s*loadCaptureAimPrompt\(userId, day\),\s*\]\);/.test(vocabFn) &&
      /return \{ words, goals, rawBefore, day, recent, active, weightUnit, \.\.\.\(aim \? \{ aim \} : \{\}\), \.\.\.\(aimPrompt \? \{ aimPrompt \} : \{\}\) \};/.test(vocabFn)
  );
  const promptLoader = actions.slice(actions.indexOf("const loadCaptureAimPrompt = "), actions.indexOf("export async function loadCaptureVocabulary("));
  const cachedAt = promptLoader.indexOf("cached(");
  check(
    "action: the prompt is the snooze cookie, read per request outside the cache (a failed read is unknown), and one select of LifeSettings.aimSuggestions only, cached on 'life', through readCaptureAimPrompt",
    cachedAt > 0 &&
      /cookie = \(await cookies\(\)\)\.get\(AIM_PROMPT_COOKIE\)\?\.value;\s*\} catch \{\s*return undefined;\s*\}/.test(promptLoader) &&
      promptLoader.indexOf("cookies()") < cachedAt &&
      !/cookies\(\)/.test(promptLoader.slice(cachedAt)) &&
      /return readCaptureAimPrompt\(\s*\(\) =>\s*cached\(`captureAimSuggestions:\$\{userId\}`, \["life"\], async \(\) => \{/.test(promptLoader) &&
      /prisma\.lifeSettings\.findUnique\(\{ where: \{ userId \}, select: \{ aimSuggestions: true \} \}\)/.test(promptLoader) &&
      /return row\?\.aimSuggestions \?\? null;/.test(promptLoader) &&
      /cookie,\s*day\s*\);/.test(promptLoader) &&
      /import \{ cookies \} from "next\/headers";/.test(actions),
    `prompt loader: ${promptLoader.length} chars`
  );
  check(
    "action: CaptureVocabulary.aim and .aimPrompt are optional, typed 'NONE' | 'DRAFT' | 'ACTIVE' and roadmap-invite's AimPrompt",
    /\n  aim\?: CaptureAim;\s*aimPrompt\?: AimPrompt;\s*\}/.test(actions) &&
      /export type CaptureAim = "NONE" \| "DRAFT" \| "ACTIVE";/.test(actions) &&
      /import \{ AIM_PROMPT_COOKIE, type AimPrompt \} from "@\/lib\/roadmap-invite";/.test(actions)
  );

  // The line is never lost (fix round, lens 3 #8): the intake form clears the sheet's 'aim: …' line
  // only after saveIntake succeeded AND the intake took the line's aim (no open draft, or 'Use it').
  // RoadmapForm.tsx is R5's, read here (never imported: it pulls in CSS) because the guarantee is the
  // capture line's. A guard helper the statement calls (R5's clearsCaptureLine) is read into the guard.
  const form = strip(readFileSync(join(ROOT, "src/components/roadmap/RoadmapForm.tsx"), "utf8"));
  const formSubmit = bodyOf(form, "const submit = async (");
  const clearAt = formSubmit.indexOf("clearSheetDraftIf(");
  const okAt = formSubmit.indexOf("if (!saved.ok)");
  const clearStmt = clearAt < 0 ? "" : formSubmit.slice(Math.max(formSubmit.lastIndexOf(";", clearAt), formSubmit.lastIndexOf("}", clearAt)) + 1, formSubmit.indexOf(";", clearAt) + 1);
  const helperName = /\b(\w+)\(handoff\b[^)]*\)/.exec(clearStmt.replace(/clearSheetDraftIf\([^)]*\)/, ""))?.[1] ?? null;
  const helperAt = helperName ? form.indexOf(`function ${helperName}(`) : -1;
  const helperBody = helperAt < 0 ? "" : form.slice(helperAt, form.indexOf("\n}\n", helperAt));
  const helperReturn = helperBody.slice(Math.max(0, helperBody.indexOf("return ")));
  const guard = `${clearStmt}\n${helperBody}`;
  check(
    "intake: the form clears the capture line once, only after saveIntake answered ok, and only a 'capture' handoff's own line",
    clearAt > 0 && okAt > 0 && okAt < clearAt && (form.match(/clearSheetDraftIf\(/g) ?? []).length === 1 && /source === "capture"/.test(guard) && /clearSheetDraftIf\(handoff\.sheetText\)/.test(clearStmt),
    clearStmt.trim()
  );
  // R5 landed the gate (handoffUsed + clearsCaptureLine) in this fix round, so it is pinned, not pending:
  // the clear needs the use (a conjunction, no '||'); an open draft's mount (which only shows 'The aim you
  // typed · Use it') never marks it used; only the no-draft merge and the 'Use it' tap mark it.
  // Ablated in a scratch copy: a mount that marks, a helper with '||', the rev-3 ungated clear, a clear
  // before saveIntake answered, and a 'Use it' that does not mark each fail one of the two checks.
  const mount = bodyOf(form, "useEffect(() => {\n    if (loaded.current) return;");
  const draftBranch = /if \(view\.draft\) \{([\s\S]*?)return;\s*\}/.exec(mount)?.[1] ?? "";
  const afterDraft = draftBranch ? mount.slice(mount.indexOf(draftBranch) + draftBranch.length) : "";
  const marks = form.match(/setHandoffUsed\(true\)|handoffUsed(?:\.current)?\s*=\s*true/g) ?? [];
  const mergeMarks = afterDraft.match(/setHandoff\(h\);\s*setHandoffUsed\(true\);/g) ?? [];
  const useItMarks = form.match(/set\("aim", handoff\.aim[^;]*\);\s*setHandoffUsed\(true\);\s*\}\}\s*>\s*Use it/g) ?? [];
  check(
    "intake: an open draft saved without 'Use it' keeps the capture line (the clear needs the aim used; only the no-draft merge and 'Use it' mark it, never an open draft's mount)",
    /handoffUsed/.test(clearStmt) &&
      draftBranch.length > 0 &&
      !/setHandoffUsed\(true\)|handoffUsed(?:\.current)?\s*=\s*true/.test(draftBranch) &&
      (helperBody === "" || (!/\|\|/.test(helperReturn) && /\bused\b/.test(helperReturn))) &&
      marks.length === 2 &&
      mergeMarks.length === 1 &&
      useItMarks.length === 1,
    `${clearStmt.trim()} · marks ${marks.length}, merge ${mergeMarks.length}, Use it ${useItMarks.length}`
  );
}

batchChecks()
  .then(replacementChecks)
  .then(unarchiveChecks)
  .then(aimCaptureChecks)
  .catch((err) => {
    failed++;
    console.log(`FAIL batch checks threw — ${String(err)}`);
  })
  .finally(() => {
    console.log(failed ? `\n${failed} failed` : "\nall pass");
    process.exit(failed ? 1 : 0);
  });
