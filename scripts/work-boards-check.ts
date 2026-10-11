/**
 * Work tabs (2026-10-12; migration 20261217000000_work_boards): up to three
 * boards beside the personal Board, each with its own tasks, habits and
 * musts, kept SEPARATE from the game. This check pins:
 *
 *   1. the rules (src/lib/work-boards.ts): the cap of 3, the lowest free slot,
 *      slot reuse after an archive, names (1..24), the restore slot, the paths;
 *   2. the cores (src/lib/work-boards-server.ts) against an in-memory table
 *      that keeps the database's partial unique index on open slots: add,
 *      a 4th refused, a race for one slot, rename, archive, restore;
 *   3. board scoping of the task loaders and writers (src/lib/tasks.ts): the
 *      personal Board reads boardId null exactly as before, a work tab its own
 *      id; a capture into a work tab sets boardId;
 *   4. work excluded from every life-economy reader: a work tick writes no
 *      ledger row (so life XP, the streak, tracks, the knee, the week, the
 *      Full day and the throughput never see it), and every reader of
 *      TaskTemplate or TaskInstance in the game reads the personal Board only;
 *   5. the UI: the Tasks strip (Board · <work tabs> · [+] · Weekly review ·
 *      Rules), the '+' only while a slot is free, the work board's page and
 *      its game-free board, Settings › Work tabs, and capture into a tab.
 *
 * Pure: no database, no clock, no model.
 *
 *   npx tsx scripts/work-boards-check.ts
 */
import "./_no-model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PERSONAL_BOARD,
  WORK_BOARD_ARCHIVED,
  WORK_BOARD_CAP,
  WORK_BOARD_FULL,
  WORK_BOARD_GONE,
  WORK_BOARD_NAME_EMPTY,
  WORK_BOARD_NAME_LONG,
  WORK_BOARD_NAME_MAX,
  WORK_BOARD_RESTORE_FULL,
  WORK_KIND_REFUSAL,
  boardWhereOf,
  canAddWorkBoard,
  cleanWorkBoardName,
  freeSlotOf,
  restoreSlotOf,
  workBoardHref,
  workBoardIdOf,
  workClarifyAllowed,
  workKindRefusalOf,
} from "../src/lib/work-boards";
import {
  archiveWorkBoardCore,
  createWorkBoardCore,
  listOpenWorkBoards,
  loadWorkBoard,
  renameWorkBoardCore,
  restoreWorkBoardCore,
  type WorkBoardDb,
  type WorkBoardRow,
} from "../src/lib/work-boards-server";
import { emptyLedgerOf, workPaidOf, workReceiptOf } from "../src/lib/tasks";
import { buildBoard, canUndo, type BoardData, type BoardRow } from "../src/lib/today-board";
import { settleGuardSql } from "../src/lib/settlement";
import { SECTIONS, activeSub, addWorkTabAfter, sectionById, subsOf, titleFor } from "../src/components/shell/nav";
import { parsePendingList, stampLine, toastCopy } from "../src/components/capture/capture-ui";
import { fixtureBoardData, fixtureTemplate, FIXTURE_TODAY } from "../src/app/dev/style/today/fixtures";
import { TaskRow } from "../src/components/today/TaskRow";
import { addDays } from "../src/lib/life-day";

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
/** The body of a function declared in `src` (from its signature to the next top-level closing brace). */
const fnBody = (src: string, name: string) => new RegExp(`(?:export )?(?:async )?function ${name}\\b[\\s\\S]*?\\n\\}`).exec(src)?.[0] ?? "";

// ── 1. The rules ───────────────────────────────────────────────────────────
console.log("— the rules (work-boards.ts) —");
{
  const open = (...slots: number[]) => slots.map((slot) => ({ slot }));
  eq("cap: three work tabs at most", WORK_BOARD_CAP, 3);
  eq("slot: the lowest free one (none open → 1; 1,2 → 3; 1,3 → 2)", [freeSlotOf(open()), freeSlotOf(open(1, 2)), freeSlotOf(open(1, 3)), freeSlotOf(open(2, 3))], [1, 3, 2, 1]);
  check("slot: none free with all three taken (a 4th is refused)", freeSlotOf(open(1, 2, 3)) === null && !canAddWorkBoard(open(3, 1, 2)));
  check("the '+': shown while a slot is free (0, 1 or 2 open), never at 3", canAddWorkBoard(open()) && canAddWorkBoard(open(1)) && canAddWorkBoard(open(1, 3)) && !canAddWorkBoard(open(1, 2, 3)));
  eq("restore: its own slot when free, else the lowest free, else none", [restoreSlotOf(2, open(1)), restoreSlotOf(2, open(2)), restoreSlotOf(3, open(1, 3)), restoreSlotOf(1, open(1, 2, 3))], [2, 1, 2, null]);
  eq("name: trimmed, inner spaces collapsed", cleanWorkBoardName("  Acme   Corp  "), { ok: true, name: "Acme Corp" });
  eq("name: empty or spaces only is refused", [cleanWorkBoardName(""), cleanWorkBoardName("   "), cleanWorkBoardName(null)], [
    { ok: false, error: WORK_BOARD_NAME_EMPTY },
    { ok: false, error: WORK_BOARD_NAME_EMPTY },
    { ok: false, error: WORK_BOARD_NAME_EMPTY },
  ]);
  check(
    `name: ${WORK_BOARD_NAME_MAX} characters pass, ${WORK_BOARD_NAME_MAX + 1} are refused`,
    WORK_BOARD_NAME_MAX === 24 && cleanWorkBoardName("x".repeat(24)).ok && !cleanWorkBoardName("x".repeat(25)).ok && (cleanWorkBoardName("x".repeat(25)) as { error: string }).error === WORK_BOARD_NAME_LONG
  );
  eq("paths: /today/work/<id> and back; anything else is no tab", [workBoardHref("b1"), workBoardIdOf("/today/work/b1"), workBoardIdOf("/today/work/b1/x"), workBoardIdOf("/today"), workBoardIdOf("/today/work/"), workBoardIdOf("/today/workx/b1"), workBoardIdOf(null)], [
    "/today/work/b1",
    "b1",
    "b1",
    null,
    null,
    null,
    null,
  ]);
  eq("scope: the personal Board is boardId null; a work tab its id", [PERSONAL_BOARD, boardWhereOf(null), boardWhereOf("b1")], [{ boardId: null }, { boardId: null }, { boardId: "b1" }]);
  eq("kinds: a work tab takes tasks and habits; a goal or an idea draft is refused", [workKindRefusalOf("TASK"), workKindRefusalOf("HABIT"), workKindRefusalOf("GOAL"), workKindRefusalOf("IDEA_DRAFT")], [null, null, WORK_KIND_REFUSAL, WORK_KIND_REFUSAL]);
  eq("inbox: a work tab sorts to Today, Tomorrow, Anytime or Drop; never a goal or an idea", ["today", "tomorrow", "anytime", "drop", "goal", "idea"].map(workClarifyAllowed), [true, true, true, true, false, false]);
}

// ── 2. The cores, against a table that keeps the partial unique index ──────
console.log("— the cores (work-boards-server.ts) —");

/** An in-memory WorkBoard table: (userId, slot) unique among open rows, like WorkBoard_userId_slot_open_key. */
class FakeBoards implements WorkBoardDb {
  rows: (WorkBoardRow & { userId: string })[] = [];
  seq = 0;
  /** A stale read to hand back once (two adds that read the same open set). */
  staleOpen: WorkBoardRow[] | null = null;
  private taken(userId: string, slot: number, except?: string) {
    return this.rows.some((r) => r.userId === userId && r.slot === slot && r.archivedAt === null && r.id !== except);
  }
  private dup(): Error {
    return Object.assign(new Error("Unique constraint failed on the constraint: `WorkBoard_userId_slot_open_key`"), { code: "P2002" });
  }
  async listOpen(userId: string) {
    if (this.staleOpen) {
      const s = this.staleOpen;
      this.staleOpen = null;
      return s.map((r) => ({ ...r }));
    }
    return this.rows.filter((r) => r.userId === userId && r.archivedAt === null).map((r) => ({ id: r.id, name: r.name, slot: r.slot, archivedAt: r.archivedAt }));
  }
  async find(userId: string, id: string) {
    const r = this.rows.find((x) => x.userId === userId && x.id === id);
    return r ? { id: r.id, name: r.name, slot: r.slot, archivedAt: r.archivedAt } : null;
  }
  async create(userId: string, name: string, slot: number) {
    if (slot < 1 || slot > 3) throw new Error("WorkBoard_slot_range");
    if (this.taken(userId, slot)) throw this.dup();
    const row = { id: `wb${++this.seq}`, userId, name, slot, archivedAt: null };
    this.rows.push(row);
    return { id: row.id, name, slot, archivedAt: null };
  }
  async rename(userId: string, id: string, name: string) {
    const r = this.rows.find((x) => x.userId === userId && x.id === id && x.archivedAt === null);
    if (!r) return 0;
    r.name = name;
    return 1;
  }
  async archive(userId: string, id: string, at: Date) {
    const r = this.rows.find((x) => x.userId === userId && x.id === id && x.archivedAt === null);
    if (!r) return 0;
    r.archivedAt = at;
    return 1;
  }
  async restore(userId: string, id: string, slot: number) {
    const r = this.rows.find((x) => x.userId === userId && x.id === id && x.archivedAt !== null);
    if (!r) return 0;
    if (this.taken(userId, slot, id)) throw this.dup();
    r.archivedAt = null;
    r.slot = slot;
    return 1;
  }
}

async function cores() {
  const U = "u1";
  const db = new FakeBoards();
  const a = await createWorkBoardCore(U, " Acme ", db);
  const b = await createWorkBoardCore(U, "Side gig", db);
  const c = await createWorkBoardCore(U, "Studio", db);
  eq("add: three tabs take slots 1, 2, 3 in order, names cleaned", [a, b, c].map((r) => (r.ok ? [r.value.name, r.value.slot] : r.error)), [
    ["Acme", 1],
    ["Side gig", 2],
    ["Studio", 3],
  ]);
  const d = await createWorkBoardCore(U, "Fourth", db);
  eq("add: a 4th open tab is refused with a clear line, nothing written", [d, db.rows.length], [{ ok: false, error: WORK_BOARD_FULL }, 3]);
  eq("add: an empty name is refused before any write", await createWorkBoardCore(U, "  ", db), { ok: false, error: WORK_BOARD_NAME_EMPTY });
  const other = await createWorkBoardCore("u2", "Theirs", db);
  check("add: another user's tabs are their own (slot 1 is free for them)", other.ok && other.value.slot === 1);

  const bId = b.ok ? b.value.id : "";
  const arch = await archiveWorkBoardCore(U, bId, new Date("2026-10-12T09:00:00Z"), db);
  check("archive: frees the slot, keeps the row (never deleted)", arch.ok && db.rows.some((r) => r.id === bId && r.archivedAt !== null) && (await listOpenWorkBoards(U, db)).map((x) => x.slot).join() === "1,3");
  eq("archive: again is ok and changes nothing (idempotent)", (await archiveWorkBoardCore(U, bId, new Date(), db)).ok, true);
  eq("archive: an unknown or another user's tab is gone", [await archiveWorkBoardCore(U, "nope", new Date(), db), await archiveWorkBoardCore("u2", bId, new Date(), db)], [
    { ok: false, error: WORK_BOARD_GONE },
    { ok: false, error: WORK_BOARD_GONE },
  ]);
  const e = await createWorkBoardCore(U, "Client X", db);
  check("add: after an archive the freed slot (2) is reused", e.ok && e.value.slot === 2);
  eq("restore: refused while all three slots are in use", await restoreWorkBoardCore(U, bId, db), { ok: false, error: WORK_BOARD_RESTORE_FULL });
  const eId = e.ok ? e.value.id : "";
  await archiveWorkBoardCore(U, a.ok ? a.value.id : "", new Date(), db);
  const back = await restoreWorkBoardCore(U, bId, db);
  check("restore: with a slot free it comes back; its own slot 2 is taken, so the lowest free (1)", back.ok && back.value.slot === 1 && back.value.name === "Side gig");
  eq("restore: an open tab restores to itself (ok)", (await restoreWorkBoardCore(U, eId, db)).ok, true);
  eq("restore: an unknown tab is gone", await restoreWorkBoardCore(U, "nope", db), { ok: false, error: WORK_BOARD_GONE });

  const rn = await renameWorkBoardCore(U, eId, "  Client   Y ", db);
  check("rename: an open tab, name cleaned", rn.ok && rn.value.name === "Client Y" && db.rows.find((r) => r.id === eId)?.name === "Client Y");
  eq("rename: empty and too long are refused", [await renameWorkBoardCore(U, eId, "", db), await renameWorkBoardCore(U, eId, "y".repeat(25), db)], [
    { ok: false, error: WORK_BOARD_NAME_EMPTY },
    { ok: false, error: WORK_BOARD_NAME_LONG },
  ]);
  eq("rename: an archived tab is refused (restore it first); an unknown one is gone", [await renameWorkBoardCore(U, a.ok ? a.value.id : "", "New", db), await renameWorkBoardCore(U, "nope", "New", db)], [
    { ok: false, error: WORK_BOARD_ARCHIVED },
    { ok: false, error: WORK_BOARD_GONE },
  ]);
  const view = await loadWorkBoard(U, a.ok ? a.value.id : "", db);
  check("page read: an archived tab reads archived (the page says so), a malformed id as none", view?.archived === true && (await loadWorkBoard(U, "../x", db)) === null);

  // Race-safe: two adds read the same open set; the index lets one in, the other re-reads and takes the next slot.
  const race = new FakeBoards();
  await createWorkBoardCore(U, "One", race);
  race.staleOpen = [];
  const r2 = await createWorkBoardCore(U, "Two", race);
  check("race: an add that read a stale open set hits the slot index (P2002), re-reads and takes the next free slot", r2.ok && r2.value.slot === 2 && race.rows.filter((r) => r.archivedAt === null).length === 2);
  const full = new FakeBoards();
  for (const n of ["A", "B", "C"]) await createWorkBoardCore(U, n, full);
  full.staleOpen = [{ id: "x", name: "A", slot: 1, archivedAt: null }];
  const r4 = await createWorkBoardCore(U, "D", full);
  eq("race: when the re-read finds all three taken, the add is refused (never a 4th open row)", [r4, full.rows.filter((r) => r.archivedAt === null).length], [{ ok: false, error: WORK_BOARD_FULL }, 3]);

  // The database holds it too: the migration's CHECK and partial unique index.
  const sql = read("prisma/migrations/20261217000000_work_boards/migration.sql");
  check(
    "database: CHECK slot 1..3 and the partial unique index on (userId, slot) WHERE archivedAt IS NULL",
    /CHECK \("slot" BETWEEN 1 AND 3\)/.test(sql) && /CREATE UNIQUE INDEX "WorkBoard_userId_slot_open_key" ON "public"\."WorkBoard"\("userId", "slot"\) WHERE "archivedAt" IS NULL/.test(sql)
  );
  const srv = code("src/lib/work-boards-server.ts");
  check("cores: add and restore retry on the slot index (isSlotTaken) a bounded number of times", /isSlotTaken\(err\)/.test(fnBody(srv, "createWorkBoardCore")) && /isSlotTaken\(err\)/.test(fnBody(srv, "restoreWorkBoardCore")) && /SLOT_ATTEMPTS = 3/.test(srv));
  check("cores: every write clears the 'life' cache (the strip's list and the shell)", ["createWorkBoardCore", "renameWorkBoardCore", "archiveWorkBoardCore", "restoreWorkBoardCore"].every((n) => /invalidate\("life"\)/.test(fnBody(srv, n))));
  check("cores: archive never deletes (no delete anywhere in the work board server)", !/\.delete(Many)?\(/.test(srv));
  const actions = code("src/app/actions/work-boards.ts");
  check(
    "actions: 'use server'; add, rename, archive, restore each run their core, never throw, refresh only when asked",
    /^"use server";/.test(actions.trim()) &&
      ["createWorkBoardCore", "renameWorkBoardCore", "archiveWorkBoardCore", "restoreWorkBoardCore"].every((n) => actions.includes(`${n}(userId`)) &&
      /if \(res\.ok && opts\?\.refresh === true\) refresh\(\);/.test(actions) &&
      /catch \(err\)/.test(actions)
  );
}

// ── 3. Board scoping of the task loaders and writers ─────────────────────────
function scoping() {
  console.log("— board scoping (tasks.ts) —");
  const tasks = code("src/lib/tasks.ts");
  const core = fnBody(tasks, "readBoardCore");
  check("personal Board: its template read is the personal Board's (…PERSONAL_BOARD, boardId null)", /archivedAt: null,\s*\.\.\.PERSONAL_BOARD,/.test(core));
  check("personal Board: its instance read and its debts read are the personal Board's (template: PERSONAL_BOARD)", (core.match(/template: PERSONAL_BOARD/g) ?? []).length === 2);
  const load = fnBody(tasks, "loadTodayBoard");
  check(
    "loadTodayBoard takes a board scope: null (the default) reads the personal Board under its old cache key; a work tab its own read",
    /board: BoardScope = null/.test(load) && /if \(board !== null\) return loadWorkBoardData\(userId, board, day, now\);/.test(load) && /cached\(`today:\$\{userId\}:\$\{day\}`/.test(load)
  );
  const work = fnBody(tasks, "loadWorkBoardData");
  check(
    "a work tab's read: its templates (boardId) and their instances (template: { boardId }), cached per board and day",
    /where: \{ userId, boardId, archivedAt: null,/.test(work) && /template: \{ boardId \}/.test(work) && /cached\(`work:\$\{userId\}:\$\{boardId\}:\$\{day\}`/.test(work)
  );
  check(
    "a work tab's read has nothing of the game: an empty ledger, no Duty, no goals, no study queue, no roadmap",
    /ledger: \{ today: emptyLedgerOf\(day\), yesterday: emptyLedgerOf\(yesterday\) \}/.test(work) && /goalQty: \{\}/.test(work) && /dueNow: null/.test(work) && /roadmapGoals: \{\}/.test(work) && !/duty:/.test(work) && !/readDayTotals|readDayTaskEvents|activityEvent/.test(work)
  );
  for (const [name, what] of [
    ["loadOpenGoals", "the '^goal' list"],
    ["loadRecentCaptures", "the Recent chips"],
    ["loadAutoTemplates", "the study tasks"],
  ] as const) {
    check(`personal Board only: ${name} (${what})`, /\.\.\.PERSONAL_BOARD/.test(fnBody(tasks, name)));
  }
  const insert = fnBody(tasks, "insertCapture");
  check(
    "capture: the INSERT writes boardId (null on the personal Board), refuses a goal or an idea draft on a work tab, links no goal and no study metric there",
    /const boardId = opts\.boardId \?\? null;/.test(insert) &&
      /boardId,\n\s*\};/.test(insert) &&
      /const workRefusal = boardId \? workKindRefusalOf\(kind\) : null;\s*if \(workRefusal\) throw new Error\(workRefusal\);/.test(insert) &&
      /let parentId: string \| null = boardId \? null :/.test(insert) &&
      /!boardId \? parsed\.autoMetric : null/.test(insert)
  );
  check("capture: a work line's toast names no price (projectedXp 0)", /projectedXp: row\.boardId \? 0 :/.test(fnBody(tasks, "capturedOf")));
  const recap = fnBody(tasks, "recaptureCore");
  check("capture: an edit stays on its line's board (boardId from the old row), tasks and habits only", /const boardId = old\?\.boardId \?\? null;/.test(recap) && /insertCapture\([^)]*boardId \}\)/.test(recap) && /workKindRefusalOf/.test(recap));
  check("capture: TEMPLATE_SELECT reads boardId (the tick's dispatch needs no extra read)", /boardId: true,\n\} satisfies Prisma\.TaskTemplateSelect;/.test(tasks));

  const act = code("src/app/actions/capture.ts");
  check(
    "capture action: a line's board is checked (open, the user's) and passed to createTemplateCore; a gone or archived tab is said, the line kept",
    /const scope = await boardOf\(userId, opts\?\.board\);\s*if \(!scope\.ok\) return scope;/.test(act) &&
      /boardId: scope\.boardId \}\);/.test(act) &&
      /WORK_BOARD_ARCHIVED : WORK_BOARD_GONE/.test(act) &&
      /const scope = await boardOf\(userId, line\.board\);/.test(act)
  );
  check("capture action: a goal or an idea draft into a work tab is refused with WORK_KIND_REFUSAL's line", /workLineRefusal\(scope\.boardId, line\.parsed, today\)/.test(act) && /workLineRefusal\(scope\.boardId, prepared\.parsed, today\)/.test(act));
  check("capture: a pasted list carries each line's board to its saver (runCaptureBatch)", /\.\.\.\(raw\.board != null \? \{ board: raw\.board \} : \{\}\)/.test(fnBody(tasks, "runCaptureBatch")));

  // The work board's paid records and lanes (pure).
  const t = FIXTURE_TODAY;
  const tpls = [
    fixtureTemplate({ id: "w-report", title: "Weekly report", compulsory: true, dueKind: "DEADLINE", dueDay: t }),
    fixtureTemplate({ id: "w-inbox", title: "Clear email", estMinutes: 15, machineMinutes: 15, dueKind: "PLANNED", dueDay: t }),
  ];
  const at = `${t}T09:00:00.000Z`;
  const rows = [
    { id: "i1", templateId: "w-report", status: "DONE", source: "manual", minutes: 30, completedAt: at },
    { id: "i2", templateId: "w-inbox", status: "UNDONE", source: "manual", completedAt: null },
  ];
  const paid = workPaidOf(rows, () => "DUTY", at);
  check("work paid: one record per done instance, 0 XP, its tick time, never undone", Object.keys(paid).join() === "i1" && paid.i1.xp === 0 && paid.i1.occurredAt === at && paid.i1.receipt?.xp === 0 && !paid.i1.undone);
  check("work paid: a step-finished instance reads as paid by its steps (done = total)", workPaidOf([{ ...rows[0], source: "auto:steps" }], () => "DUTY", at).i1.receipt?.steps?.done === 1);
  eq("work receipt: nothing priced, nothing paid", workReceiptOf("CRAFT", 20), { v: "work-0", factors: [], minutes: 20, raw: 0, kneeBefore: 0, xp: 0, track: "CRAFT" });
  const data: BoardData = {
    ...fixtureBoardData(),
    templates: tpls,
    instances: [{ id: "i1", templateId: "w-report", day: t, slot: 0, status: "DONE", source: "manual", xpPaid: 0 }],
    ledger: { today: emptyLedgerOf(t), yesterday: emptyLedgerOf(addDays(t, -1)) },
    paid,
    goalQty: {},
    dueNow: null,
    capacityMin: 0,
  };
  const board = buildBoard(data);
  const done = board.must.find((r) => r.template.id === "w-report");
  check("work board: the same lanes (a must in Must, a planned task in Planned), no life XP, no goals", !!done && board.todayRows.some((r) => r.template.id === "w-inbox") && board.lifeXpToday === 0 && board.goals.SHORT.length + board.goals.MID.length + board.goals.LONG.length === 0);
  check("work board: a ticked row is done with its record, and Undo is offered inside the same ten minutes", done?.state === "done" && done.paid?.xp === 0 && canUndo(new Date(at), new Date(Date.parse(at) + 5 * 60_000)) && !canUndo(new Date(at), new Date(Date.parse(at) + 11 * 60_000)));
  return { board, done };
}

// ── 4. Work is never in the game ─────────────────────────────────────────────
function exclusion() {
  console.log("— work excluded from every life-economy reader —");
  const tasks = code("src/lib/tasks.ts");
  const complete = fnBody(tasks, "completeInstanceCore");
  const dispatchAt = complete.indexOf("if (row.boardId) return completeWorkCore(");
  check(
    "tick: a work task goes to completeWorkCore before any price, Duty refusal, ledger read or settle",
    dispatchAt > 0 && dispatchAt < complete.indexOf("doneOnDay(") && dispatchAt < complete.indexOf("tickRefusalFor(") && dispatchAt < complete.indexOf("settleCompletion(")
  );
  check("Again: a work task's next slot goes to completeWorkCore, never settleCompletion", /if \(read\.row\.boardId\) return completeWorkCore\(userId, read, \{ day: today, today, slot,/.test(fnBody(tasks, "againCore")));
  check("steps: a work task's step goes to workStepTick (first line of stepTickOnce)", /^async function stepTickOnce[\s\S]*?\): Promise<[^>]*>[^{]*\{\s*if \(read\.row\.boardId\) return workStepTick\(/.test(fnBody(tasks, "stepTickOnce")));
  check("undo: a work tick goes to undoWorkCore before any ledger read is used", /if \(inst\.template\.boardId\) return undoWorkCore\(userId, inst, now\);/.test(fnBody(tasks, "undoCompletionCore")));
  const LEDGER_WRITES = /activityOp\(|recordActivity\(|activityEvent\.|taskEventInput\(|undoEventInput\(|lifeLockOp\(|freshnessGuardOp\(|settledDayGuardOp\(|tickRefusalFor\(/;
  for (const n of ["completeWorkCore", "undoWorkCore", "workStepTick"]) {
    const body = fnBody(tasks, n);
    check(`${n}: writes no ledger row (no ActivityEvent: no life XP, streak unit, knee, track, week or Full day) and takes no Duty lock or guard`, body.length > 0 && !LEDGER_WRITES.test(body), body.slice(0, 60));
  }
  check("completeWorkCore: the instance pays 0 (xpPaid: 0, create and update)", (fnBody(tasks, "completeWorkCore").match(/xpPaid: 0/g) ?? []).length === 2);
  check("rule edits on a work task are immediate (no Duty: planned as before launch)", /launched: launched && !row\.boardId/.test(fnBody(tasks, "applyRuleEdit")));
  const clarify = fnBody(tasks, "clarifyInboxCore");
  check("inbox on a work tab: no goal, no idea draft; its must has no Duty", /if \(row\.boardId && !workClarifyAllowed\(choice\)\) return fail\(WORK_CLARIFY_REFUSAL\);/.test(clarify) && /launched: isDutyLaunched\(today\) && !row\.boardId/.test(clarify));
  check("size: a work task takes no self-rating and no resize (sizing prices XP)", /if \(row\.boardId\) return fail\(WORK_NO_SIZE\);/.test(fnBody(tasks, "setBandOverrideCore")) && /if \(row\.boardId\) return fail\(WORK_NO_SIZE\);/.test(fnBody(tasks, "resizableCore")));
  check("sizing: a work task spends no model call and no cap slot (applySizing → 'done')", /if \(t\.boardId\) return "done";/.test(code("src/lib/life-sizing.ts")));
  check("sizing: the capture's after() never queues a work line", /!s\.created\.boardId\)\.map\(\(s\) => s\.created\.id\)/.test(code("src/app/actions/capture.ts")));

  // Readers of TaskTemplate / TaskInstance in the game: the personal Board only.
  const settle = code("src/lib/settlement.ts");
  check("settlement: judges the personal Board's templates and instances only, and its open debts", /\.\.\.PERSONAL_BOARD,\s*kind: \{ in: \["TASK", "HABIT"\] \}/.test(settle) && /userId,\s*template: PERSONAL_BOARD,\s*OR:/.test(settle) && /where: \{ userId, debtOpen: true, template: PERSONAL_BOARD \}/.test(settle));
  const guard = settleGuardSql("u", { cursor: "2026-10-09", epochDay: "2026-10-01", freezeRows: 0, fresh: { from: "2026-10-10", to: "2026-10-10", events: 1, instances: 2, rest: 0 }, undone: [], oneOffs: [] }).strings.join("?");
  check("settlement: its freshness guard counts the same instances its read does (a work tick never stales a settle)", /FROM "TaskInstance" WHERE "userId" = \? AND "day" >= \?::date AND "day" <= \?::date AND "templateId" NOT IN \(SELECT "id" FROM "TaskTemplate" WHERE "userId" = \? AND "boardId" IS NOT NULL\)\) = \?::int/.test(guard), guard);
  check("kept weeks (the week judge): Duty's templates and instances are the personal Board's", /const DUTY_TEMPLATES = \{\s*kind: \{ in: \["TASK", "HABIT"\] \},\s*boardId: null,/.test(code("src/lib/life-weeks-server.ts")));
  check("weekly review: the week's musts are the personal Board's", /const DUTY_TEMPLATES: Prisma\.TaskTemplateWhereInput = \{\s*kind: \{ in: \["TASK", "HABIT"\] \},\s*boardId: null,/.test(code("src/app/today/week/page.tsx")));
  const snap = code("src/lib/snapshot.ts");
  check(
    "moments (celebrations' snapshot): habits, their instances and closed goals are the personal Board's",
    /recurrence: \{ not: null \}, \.\.\.PERSONAL_BOARD,/.test(snap) && /templateId: \{ in: ids \}, template: PERSONAL_BOARD/.test(snap) && /recurrence: \{ not: null \}, \.\.\.PERSONAL_BOARD \}/.test(snap) && /closedScore: \{ not: null \}, \.\.\.PERSONAL_BOARD/.test(snap)
  );
  const goals = code("src/lib/goals-server.ts");
  check("goals: the ladder's open, closed and step reads and a close's steps are the personal Board's", (goals.match(/\.\.\.PERSONAL_BOARD/g) ?? []).length >= 4);
  check("throughput (the roadmap's adherence): recurring templates are the personal Board's", /archivedAt: null,\s*\.\.\.PERSONAL_BOARD,\s*recurrence: \{ not: null \}/.test(code("src/lib/throughput-server.ts")));
  check("notices / asks: the owed totals are the personal Board's debts", /where: \{ userId, debtOpen: true, template: PERSONAL_BOARD \}/.test(code("src/lib/notifications.ts")));
  check("profile calendar: the month's done tasks are the personal Board's", /status: \{ in: \[\.\.\.DONE_MARK_STATUSES\] \}, template: PERSONAL_BOARD/.test(code("src/lib/task-style-server.ts")));
  // The ledger readers never need a filter: a work tick writes no ActivityEvent (pinned above). They read the ledger only.
  for (const f of ["src/lib/streak.ts", "src/lib/life-tracks-server.ts"]) {
    check(`${f}: reads the ledger (ActivityEvent) only, so work, which writes none, is never in it`, !/taskTemplate\.|taskInstance\.|FROM "TaskInstance"/.test(code(f)));
  }
  check("the personal Board's day ledger (life XP, the knee, the INTRO count, capacity, the Full day) is read from ActivityEvent only", /FROM "ActivityEvent"/.test(fnBody(tasks, "readDayTotals")) && /FROM "ActivityEvent" e/.test(fnBody(tasks, "readDayTaskEvents")));
  check("the nav badge and the bell's Today line count the personal Board (loadTodayCounts reads the personal board core)", /loadBoardCore\(userId, day, now\)/.test(fnBody(tasks, "loadTodayCounts")));
}

// ── 5. The UI ───────────────────────────────────────────────────────────────
function ui(board: ReturnType<typeof scoping>) {
  console.log("— the strip, the '+', the work board —");
  const tasksSubs = sectionById("tasks").subs.map((s) => s.href);
  eq("strip: nav.ts's Tasks stay Board, Weekly review, Rules (no work tab is static)", tasksSubs, ["/today", "/today/week", "/today/rules"]);
  eq("strip: with no work tab the Tasks strip is exactly nav.ts's", subsOf("tasks", []).map((s) => s.label), ["Board", "Weekly review", "Rules"]);
  eq(
    "strip: work tabs come right after Board, by slot (Board · Acme · Studio · Weekly review · Rules), each to /today/work/<id>",
    subsOf("tasks", [
      { id: "a", name: "Acme" },
      { id: "s", name: "Studio" },
    ]).map((s) => [s.label, s.href]),
    [
      ["Board", "/today"],
      ["Acme", "/today/work/a"],
      ["Studio", "/today/work/s"],
      ["Weekly review", "/today/week"],
      ["Rules", "/today/rules"],
    ]
  );
  check("strip: no other section ever shows a work tab", SECTIONS.filter((s) => s.id !== "tasks").every((s) => subsOf(s.id, [{ id: "a", name: "Acme" }]).length === s.subs.length));
  eq("the '+': after the last work tab, else after Board", [addWorkTabAfter([]), addWorkTabAfter([{ id: "a", name: "A" }, { id: "b", name: "B" }])], ["/today", "/today/work/b"]);
  eq("current: a work tab is its own current tab (never Board), from the path alone", [activeSub("/today/work/a"), activeSub("/today"), activeSub("/today/week")], ["/today/work/a", "/today", "/today/week"]);
  eq("title: Tasks · Work until the page names it", titleFor("/today/work/a"), { eyebrow: "Tasks", title: "Work" });

  const subTabs = code("src/components/shell/SubTabs.tsx");
  const topbar = code("src/components/shell/TopBar.tsx");
  const chrome = code("src/components/shell/Chrome.tsx");
  check(
    "the '+' (phone strip): only while a slot is free (ShellData.work.canAdd), right after the last work tab or Board",
    /const add = tasks && work\?\.canAdd \? \{ href: addWorkTabAfter\(work\.tabs\), node: <AddWorkTab \/> \} : null;/.test(subTabs) && /items=\{subsOf\(id, tasks \? work\?\.tabs : null\)\}/.test(subTabs) && /after=\{add\}/.test(subTabs)
  );
  check(
    "the '+' (top bar, 600–1279): the same rule over the same data",
    /const add = tasks && work\?\.canAdd \? \{ href: addWorkTabAfter\(work\.tabs\), node: <AddWorkTab \/> \} : null;/.test(topbar) && /items=\{subsOf\(group, tasks \? work\?\.tabs : null\)\}/.test(topbar) && /after=\{add\}/.test(topbar)
  );
  check("the '+' (sidebar, ≥ 1280): under Tasks, after the last work tab, only while a slot is free", /s\.id === "tasks" && data\?\.work\?\.canAdd && p\.href === addWorkTabAfter\(data\.work\.tabs\) && <AddWorkTab variant="side" \/>/.test(chrome));
  check("the '+': drawn after exactly one tab in each strip (SubTabs, TabLinks)", /\{after && after\.href === s\.href \? after\.node : null\}/.test(subTabs) && /\{after && after\.href === it\.href \? after\.node : null\}/.test(code("src/components/ui/Tabs.tsx")));
  const shellData = code("src/lib/shell-data.ts");
  check("shell data: the open tabs by slot and canAdd = canAddWorkBoard(open); a failed read draws neither", /canAdd: canAddWorkBoard\(open\)/.test(shellData) && /catch \{\s*return null;\s*\}/.test(fnBody(shellData, "loadWorkTabs")));
  const add = code("src/components/shell/AddWorkTab.tsx");
  const css = read("src/components/shell/work-tabs.css");
  check("the '+': named 'Add a work tab', opens a name prompt (a dialog), 44 px target", /ADD_WORK_TAB_LABEL = "Add a work tab"/.test(add) && /aria-label=\{ADD_WORK_TAB_LABEL\}/.test(add) && /aria-haspopup="dialog"/.test(add) && /\.work-add \{[^}]*min-width: 44px; min-height: 44px;/.test(css));
  check("the prompt: the name is checked (cleanWorkBoardName), then createWorkBoard refreshes and goes to the new tab", /cleanWorkBoardName\(name\)/.test(add) && /createWorkBoard\(clean\.name, \{ refresh: true \}\)/.test(add) && /router\.push\(workBoardHref\(res\.value\.id\)\)/.test(add));
  check("work-tabs.css: tokens only (no hex, rgb() or hsl()), in @layer components", !/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(css.replace(/\/\*[\s\S]*?\*\//g, "")) && css.trimStart().startsWith("@layer theme, base, components, art, effects, utilities;"));

  const page = code("src/app/today/work/[boardId]/page.tsx");
  check(
    "page /today/work/[boardId]: the tab and its board in one wave, the tab's name as the title, the same TodayBoard in work mode, no due-elsewhere strip",
    /Promise\.all\(\[loadWorkBoard\(userId, boardId\), loadTodayBoard\(userId, day, now, boardId\)\]\)/.test(page) &&
      /<ShellTitle eyebrow="Work" title=\{board\.name\} \/>/.test(page) &&
      /<TodayBoard [^>]*work=\{\{ id: board\.id, name: board\.name \}\}/.test(page) &&
      !/elsewhere=|DueElsewhere/.test(page) &&
      /if \(!board\) notFound\(\);/.test(page) &&
      /board\.archived/.test(page)
  );
  check("page: params are awaited (Next 16: a Promise)", /params: Promise<\{ boardId: string \}>/.test(page) && /await params/.test(page));
  const today = code("src/app/today/page.tsx");
  check("/today?board=<id> (the reminder's tap URL) goes to that work tab, other parameters kept", /redirect\(`\$\{workBoardHref\(boardParam\)\}\$\{q \? `\?\$\{q\}` : ""\}`\)/.test(today) && /isBoardId\(boardParam\)/.test(today));

  const tb = code("src/components/today/TodayBoard.tsx");
  check("work board: no plan card (life XP, capacity), no goals, no Close the day", /\{!isWork && \(\s*<div className="o2 ask-host">/.test(tb) && /<div className="o9">\s*<GoalsStrip\s*off=\{isWork\}/.test(tb) && /if \(off\) return null;/.test(code("src/components/today/GoalsStrip.tsx")) && /\{!isWork && \(\s*<section className="card today-close o11"/.test(tb));
  check("work board: its card (name, menu) stands where the plan card stands", /\{workTab && \(\s*<div className="o2">\s*<WorkBoardCard board=\{workTab\} \/>/.test(tb));
  check("work board: no day moments, no XP token, no price notice", /if \(isWork \|\| Date\.now\(\) - actedAt\.current > MOMENT_WINDOW_MS\) return;/.test(tb) && /const paid = isWork \? 0 : xp;/.test(tb) && /else if \(!isWork && Math\.abs\(v\.receipt\.xp - shown\.xp\) > 0\.05\)/.test(tb));
  check("work board: a clearly marked slot where the Call backs section will mount", /CALL BACKS SLOT/.test(read("src/components/today/TodayBoard.tsx")) && /\{isWork && <div className="work-callbacks" data-slot="call-backs"/.test(tb));
  check("work board: rows and drawers in work mode; the inbox offers no idea, no goal", /work=\{isWork\}\n\s*>/.test(tb) && (tb.match(/work=\{isWork\}/g) ?? []).length === 3);
  const card = code("src/components/today/WorkBoardCard.tsx");
  check(
    "work board menu: Rename (renameWorkBoard) and Archive behind a confirm (archiveWorkBoard), then back to Board",
    /WORK_MENU_LABEL = "Work tab menu"/.test(card) && /renameWorkBoard\(board\.id, clean\.name, \{ refresh: true \}\)/.test(card) && /confirming \? \(/.test(card) && /archiveWorkBoard\(board\.id, \{ refresh: true \}\)/.test(card) && /router\.replace\("\/today"\)/.test(card)
  );

  // TaskRow in work mode: no price pill, 'Done', no track; the personal row unchanged.
  const done = board.done!;
  const html = (work: boolean) =>
    renderToStaticMarkup(
      createElement(TaskRow, {
        row: done as BoardRow,
        projection: done.projection,
        drawerOpen: false,
        undoable: false,
        busy: false,
        receiptOpen: false,
        receiptId: "rcpt",
        onTick: () => {},
        onUndo: () => {},
        onToggleDrawer: () => {},
        onToggleReceipt: () => {},
        work,
      })
    );
  const workHtml = html(true);
  const lifeHtml = html(false);
  check("TaskRow (work): no price pill, 'Done', nothing paid", !/class="price/.test(workHtml) && /Done/.test(workHtml) && !/paid /.test(workHtml), workHtml.slice(0, 200));
  check("TaskRow (personal): the price pill and 'Kept' as before", /class="price/.test(lifeHtml) && /Kept/.test(lifeHtml));
  const drawer = code("src/components/today/TaskDrawer.tsx");
  check("TaskDrawer (work): no '≈ XP' on any action, no Size panel", /const price = \(xp: number\) => \(props\.work \? "" : ` · ≈ \$\{fmtXp\(xp\)\}`\);/.test(drawer) && /\{!props\.work && \(\s*<div className="today-size">/.test(drawer) && !/· ≈ \{fmtXp/.test(drawer));
  check("InboxSheet (work): Today, Tomorrow, Anytime, Drop; no Idea, no Goal ^", /const choices = work \? CHOICES\.filter\(\(c\) => c\.choice !== "idea"\) : CHOICES;/.test(code("src/components/today/InboxSheet.tsx")) && /\{!work && goals\.length > 0 && \(/.test(code("src/components/today/InboxSheet.tsx")));

  // Capture into a work tab: the sheet stamps the tab, a retry keeps it, the toast's View goes there.
  const line = stampLine({ text: "send invoice", reverted: [] }, 1, Date.parse("2026-10-12T09:00:00Z"), "ab", null, "wb1");
  check("capture: a line stamped on a work tab carries it; a malformed board is dropped; the personal Board stamps none", line.board === "wb1" && stampLine({ text: "x", reverted: [] }, 2, 0, "ab", null, "../x").board === undefined && stampLine({ text: "x", reverted: [] }, 3, 0, "ab").board === undefined);
  check("capture: the stored line keeps its board through a reload (parsePendingList)", parsePendingList([line])[0]?.board === "wb1" && parsePendingList([{ ...line, board: "<script>" }])[0]?.board === undefined);
  const view = toastCopy({ id: "t1", title: "Send invoice", projectedXp: 0, kind: "TASK", doneNow: false, doneNowError: null, duplicate: false, href: null, where: { lane: "planned", label: "Planned" }, board: "wb1" }, { offToday: true });
  check("capture: a work line's View goes to its tab (/today/work/<id>#t-<id>)", view.link?.href === "/today/work/wb1#t-t1", JSON.stringify(view.link));
  const quick = code("src/components/capture/QuickCapture.tsx");
  check(
    "capture: on a work tab the sheet stamps every line with it, refreshes that page, and sends the board with each line",
    /const workBoard = workBoardIdOf\(pathname\);\s*const onToday = pathname === "\/today" \|\| workBoard !== null;/.test(quick) &&
      /randomSalt\(\), editing\?\.oldId \?\? null, workBoardRef\.current\)/.test(quick) &&
      /randomSalt\(\), null, workBoardRef\.current\)/.test(quick) &&
      /createFromCapture\(line\.text, line\.reverted, \{ refresh: refreshPage, captureKey: line\.nonce, board: line\.board \?\? null, weightUnit \}\)/.test(quick) &&
      /\.\.\.\(l\.board \? \{ board: l\.board \} : \{\}\)/.test(quick)
  );

  const settings = code("src/components/settings/WorkTabsSection.tsx");
  check(
    "Settings › Work tabs: each archived tab with Restore (restoreWorkBoard), off with all three in use and said why",
    /restoreWorkBoard\(tab\.id, \{ refresh: true \}\)/.test(settings) && /disabled=\{full \|\| busy !== null\}/.test(settings) && /const full = data\.open >= WORK_BOARD_CAP;/.test(settings) && /id="work-tabs"/.test(settings)
  );
  check("Settings: the page reads the archived tabs and the open count (fails soft: no section)", /listArchivedWorkBoards\(userId\), listOpenWorkBoards\(userId\)/.test(code("src/app/settings/page.tsx")) && /\{data\.workTabs && <WorkTabsSection data=\{data\.workTabs\} \/>\}/.test(code("src/components/settings/SettingsView.tsx")));

  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  check("package.json: life:check runs work-boards-check, and work-boards:check runs it alone", pkg.scripts["life:check"].includes("tsx scripts/work-boards-check.ts") && pkg.scripts["work-boards:check"] === "tsx scripts/work-boards-check.ts");
}

async function main() {
  await cores();
  const board = scoping();
  exclusion();
  ui(board);
  console.log(`work-boards-check: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
