/**
 * Customers (2026-10-12; migration 20261218000000_customers): a work tab's
 * own customer list, switched on in the tab's menu (WorkBoard.crmOn). This
 * check pins:
 *
 *   1. the rules (src/lib/customers.ts): the limits (ID 1..24, name 1..60,
 *      nickname <= 40, phone, brief <= 280, task 1..80 / detail <= 500), the
 *      four actions, IDs compared ignoring case, the next-ID suggestion, the
 *      search by ID (exact first, then prefix, then names), the user's clock,
 *      the task states and the due count, the reminder's re-arm rules, and the
 *      paths (the reminder's tap URL among them);
 *   2. the cores (src/lib/customers-server.ts) against an in-memory store that
 *      keeps the partial unique index on (boardId, lower(number)) WHERE
 *      archivedAt IS NULL: the ID unique on a tab ignoring case and free again
 *      after an archive; the crmOn gate (and the tab's owner, and archived
 *      tabs) on every write; remindSentAt cleared when a task's time moves or
 *      its reminder is switched back on; a done task never due a reminder;
 *      the pages' reads;
 *   3. the wiring: the actions, the routes and their params, the shell (the
 *      work tab stays current under /customers), the tab card's link and
 *      switch, 44 px targets and tokens only, and no game write anywhere.
 *
 * Pure: no database, no clock, no model.
 *
 *   npx tsx scripts/customers-check.ts
 */
import "./_no-model";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CRM_OFF,
  CUSTOMER_ACTIONS,
  CUSTOMER_ACTION_GLYPH,
  CUSTOMER_ACTION_LABEL,
  CUSTOMER_ARCHIVED,
  CUSTOMER_GONE,
  CUSTOMER_NAME_EMPTY,
  CUSTOMER_NAME_LONG,
  CUSTOMER_NICKNAME_LONG,
  CUSTOMER_NUMBER_BAD,
  CUSTOMER_NUMBER_EMPTY,
  CUSTOMER_NUMBER_LONG,
  CUSTOMER_NUMBER_TAKEN,
  CUSTOMER_PHONE_BAD,
  CUSTOMER_PHONE_LONG,
  CUSTOMER_RESTORE_TAKEN,
  CUSTOMER_TASK_DETAIL_LONG,
  CUSTOMER_TASK_GONE,
  CUSTOMER_TASK_TITLE_EMPTY,
  CUSTOMER_TASK_TITLE_LONG,
  INTERACTION_ACTION_BAD,
  INTERACTION_BRIEF_LONG,
  INTERACTION_GONE,
  REMIND_LATE_MS,
  TASK_PARAM,
  WHEN_BAD,
  armedRemindSentAt,
  cleanAction,
  cleanBrief,
  cleanCustomerName,
  cleanCustomerNumber,
  cleanNickname,
  cleanPhone,
  cleanTaskDetail,
  cleanTaskTitle,
  cleanWhen,
  customerHref,
  customerTaskRemindDue,
  customersHref,
  customersPathOf,
  defaultTaskDue,
  dueChipText,
  dueCountOf,
  endOfLocalDay,
  idsNumeric,
  instantOfLocalInput,
  localInputOf,
  nextCustomerNumber,
  numberKey,
  numberUsed,
  phoneHref,
  remindSentAtAfterEdit,
  remindSentAtAfterUndo,
  searchCustomers,
  searchPick,
  sortTasks,
  taskParamOf,
  taskStateOf,
  whenLabel,
} from "../src/lib/customers";
import {
  addInteractionCore,
  addTaskCore,
  archiveCustomerCore,
  archiveInteractionCore,
  archiveTaskCore,
  createCustomerCore,
  customerDueCountCore,
  editCustomerCore,
  editInteractionCore,
  editTaskCore,
  isNumberTaken,
  loadCustomerPage,
  loadCustomersPage,
  restoreCustomerCore,
  restoreInteractionCore,
  restoreTaskCore,
  setCrmCore,
  setTaskDoneCore,
  type CrmBoardRow,
  type CustomerDb,
  type CustomerFields,
  type CustomerRow,
  type CustomerTaskRow,
  type InteractionFields,
  type InteractionRow,
  type LinkedCallBackRow,
  type TaskFields,
} from "../src/lib/customers-server";
import { WORK_BOARD_ARCHIVED, WORK_BOARD_GONE, workBoardIdOf } from "../src/lib/work-boards";
import { activeSub, captureModeOf, sectionOf, titleFor } from "../src/components/shell/nav";

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
const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
/** Source without comments, so a pin never matches a sentence about the code. */
const code = (f: string) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const err = (error: string) => ({ ok: false, error });
const TZ = "Australia/Sydney";

// ── 1. The rules ───────────────────────────────────────────────────────────
console.log("— the rules (customers.ts) —");
{
  eq("ID: trimmed, as typed (case kept)", cleanCustomerNumber("  Ab-12 "), { ok: true, value: "Ab-12" });
  eq("ID: empty, a line break, 25 characters are refused; 24 pass", [cleanCustomerNumber(" "), cleanCustomerNumber("a\nb"), cleanCustomerNumber("x".repeat(25)), cleanCustomerNumber("x".repeat(24)).ok], [
    err(CUSTOMER_NUMBER_EMPTY),
    err(CUSTOMER_NUMBER_BAD),
    err(CUSTOMER_NUMBER_LONG),
    true,
  ]);
  check("ID: compared ignoring case ('A-12' and 'a-12' are one ID)", numberKey(" A-12") === numberKey("a-12") && numberUsed([{ id: "c1", number: "A-12" }], "a-12") && !numberUsed([{ id: "c1", number: "A-12" }], "a-12", "c1"));
  eq("name: spaces collapsed; empty refused; 60 pass, 61 refused", [cleanCustomerName("  Jo   Bloggs "), cleanCustomerName(""), cleanCustomerName("n".repeat(60)).ok, cleanCustomerName("n".repeat(61))], [
    { ok: true, value: "Jo Bloggs" },
    err(CUSTOMER_NAME_EMPTY),
    true,
    err(CUSTOMER_NAME_LONG),
  ]);
  eq("nickname: optional (empty is none); 40 pass, 41 refused", [cleanNickname(" "), cleanNickname(" JB "), cleanNickname("k".repeat(40)).ok, cleanNickname("k".repeat(41))], [
    { ok: true, value: null },
    { ok: true, value: "JB" },
    true,
    err(CUSTOMER_NICKNAME_LONG),
  ]);
  eq("phone: optional; digits, spaces, + - ( ); letters or no digit refused; 24 pass, 25 refused", [cleanPhone(""), cleanPhone("+61 (2) 9000-1234"), cleanPhone("call me"), cleanPhone("+-()"), cleanPhone("1".repeat(24)).ok, cleanPhone("1".repeat(25))], [
    { ok: true, value: null },
    { ok: true, value: "+61 (2) 9000-1234" },
    err(CUSTOMER_PHONE_BAD),
    err(CUSTOMER_PHONE_BAD),
    true,
    err(CUSTOMER_PHONE_LONG),
  ]);
  eq("phone: the tap-to-call link keeps the digits and a leading +", [phoneHref("+61 (2) 9000-1234"), phoneHref("0412 345 678")], ["tel:+61290001234", "tel:0412345678"]);
  eq("actions: Purchase, Inquiry, Complaint, Credit check, each with a glyph", CUSTOMER_ACTIONS.map((a) => [a, CUSTOMER_ACTION_LABEL[a], CUSTOMER_ACTION_GLYPH[a].length > 0]), [
    ["PURCHASE", "Purchase", true],
    ["INQUIRY", "Inquiry", true],
    ["COMPLAINT", "Complaint", true],
    ["CREDIT_CHECK", "Credit check", true],
  ]);
  eq("actions: anything else is refused", [cleanAction("REFUND"), cleanAction("purchase"), cleanAction(null)], [err(INTERACTION_ACTION_BAD), err(INTERACTION_ACTION_BAD), err(INTERACTION_ACTION_BAD)]);
  eq("brief: optional, 280 pass, 281 refused, line breaks kept", [cleanBrief(undefined), cleanBrief("b".repeat(280)).ok, cleanBrief("b".repeat(281)), cleanBrief(" a\r\nb ")], [
    { ok: true, value: "" },
    true,
    err(INTERACTION_BRIEF_LONG),
    { ok: true, value: "a\nb" },
  ]);
  eq("task: title 1..80 (80 pass, 81 refused); detail optional, 500 pass, 501 refused", [cleanTaskTitle(" "), cleanTaskTitle("t".repeat(80)).ok, cleanTaskTitle("t".repeat(81)), cleanTaskDetail(""), cleanTaskDetail("d".repeat(500)).ok, cleanTaskDetail("d".repeat(501))], [
    err(CUSTOMER_TASK_TITLE_EMPTY),
    true,
    err(CUSTOMER_TASK_TITLE_LONG),
    { ok: true, value: null },
    true,
    err(CUSTOMER_TASK_DETAIL_LONG),
  ]);
  eq("when: an ISO instant; nonsense or out of range refused", [cleanWhen("2026-10-12T03:30:00.000Z").ok, cleanWhen("soon"), cleanWhen("1990-01-01T00:00:00Z"), cleanWhen(undefined)], [true, err(WHEN_BAD), err(WHEN_BAD), err(WHEN_BAD)]);

  // The next ID, while every ID is a number.
  eq("next ID: one past the highest, natural not alphabetical ('9','10' → '11')", nextCustomerNumber(["9", "10", "2"]), "11");
  eq("next ID: the zero padding is kept ('0041' → '0042'; '0099' → '0100')", [nextCustomerNumber(["0041", "0007"]), nextCustomerNumber(["0099"])], ["0042", "0100"]);
  eq("next ID: none with no ID yet, or any ID that is not a number, or past 24 digits", [nextCustomerNumber([]), nextCustomerNumber(["12", "A-3"]), nextCustomerNumber(["9".repeat(24)])], [null, null, null]);
  eq("numeric keyboard: only while every ID is a number", [idsNumeric(["1", "22"]), idsNumeric(["1", "x"]), idsNumeric([])], [true, false, false]);

  // The search, by ID first.
  const people = [
    { id: "c12", number: "12", name: "Alice Ng", nickname: null },
    { id: "c120", number: "120", name: "Bob Tran", nickname: "Bobby" },
    { id: "c1200", number: "1200", name: "Carol Ruiz", nickname: null },
    { id: "c7", number: "7", name: "Dan 12th Street", nickname: null },
    { id: "cA", number: "A-12", name: "Erin Ali", nickname: "Ally" },
    { id: "cX", number: "13", name: "Old Alice", nickname: null, archivedAt: "2026-10-01T00:00:00.000Z" },
  ];
  const s12 = searchCustomers(people, " 12 ");
  eq("search: the exact ID first, then IDs that start with it (natural order), then names, each once", [s12?.exact?.id, s12?.byId.map((c) => c.id), s12?.byName.map((c) => c.id)], ["c12", ["c120", "c1200"], ["c7"]]);
  eq("search: an ID matches ignoring case ('a-12' opens A-12)", searchCustomers(people, "a-12")?.exact?.id, "cA");
  eq("search: a prefix with no exact ID lists the prefix matches only", [searchCustomers(people, "120")?.exact?.id, searchCustomers(people, "1")?.byId.map((c) => c.id)], ["c120", ["c12", "c120", "c1200"]]);
  eq(
    "search: names and nicknames after the IDs: a start first (then by name), a word start, then anywhere; never an archived customer",
    [searchCustomers(people, "al")?.byName.map((c) => c.id), searchCustomers(people, "ali")?.byName.map((c) => c.id), searchCustomers(people, "uiz")?.byName.map((c) => c.id)],
    [["c12", "cA"], ["c12", "cA"], ["c1200"]]
  );
  eq("search: a word start outranks a match inside a word ('ng': Alice Ng before Wang Li)", searchCustomers([...people, { id: "cZ", number: "99", name: "Wang Li", nickname: null }], "ng")?.byName.map((c) => c.id), ["c12", "cZ"]);
  eq("search: an archived customer's ID finds nobody; empty is no search", [searchCustomers(people, "13")?.exact ?? null, searchCustomers(people, "13")?.byId.length, searchCustomers(people, "   ")], [null, 0, null]);
  eq("search: Enter opens the exact ID, else the only one found, else nothing", [searchPick(s12)?.id, searchPick(searchCustomers(people, "bobby"))?.id, searchPick(searchCustomers(people, "1")) ?? null], ["c12", "c120", null]);

  // The user's clock (LIFE_TZ in the app; Sydney here).
  const now = new Date("2026-10-12T03:30:00.000Z"); // 14:30 in Sydney (AEDT, +11)
  eq("clock: a datetime-local value names the zone's wall time, and back", [localInputOf(now, TZ), instantOfLocalInput("2026-10-12T14:30", TZ)?.toISOString(), instantOfLocalInput("nope", TZ)], ["2026-10-12T14:30", now.toISOString(), null]);
  eq("clock: today ends at the next local midnight; a new task defaults to tomorrow 09:00", [endOfLocalDay(now, TZ).toISOString(), localInputOf(defaultTaskDue(now, TZ), TZ)], ["2026-10-12T13:00:00.000Z", "2026-10-13T09:00"]);
  eq(
    "clock: labels say Today, Tomorrow, Yesterday, else the day (and the year when not this one)",
    ["2026-10-12T14:30", "2026-10-13T09:00", "2026-10-11T16:10", "2026-10-14T09:05", "2027-01-05T09:00"].map((v) => whenLabel(instantOfLocalInput(v, TZ) as Date, now, TZ)),
    ["Today 14:30", "Tomorrow 09:00", "Yesterday 16:10", "Wed 14 Oct, 09:05", "Tue 5 Jan 2027, 09:00"]
  );

  // Task states and the due count.
  const at = (v: string) => instantOfLocalInput(v, TZ) as Date;
  eq(
    "tasks: done, overdue (its time has passed), today (later today), upcoming",
    [taskStateOf({ dueAt: at("2026-10-12T09:00"), doneAt: now }, now, TZ), taskStateOf({ dueAt: at("2026-10-12T09:00"), doneAt: null }, now, TZ), taskStateOf({ dueAt: at("2026-10-12T18:00"), doneAt: null }, now, TZ), taskStateOf({ dueAt: at("2026-10-13T09:00"), doneAt: null }, now, TZ)],
    ["done", "overdue", "today", "upcoming"]
  );
  const sorted = sortTasks([
    { id: "late", dueAt: at("2026-10-15T09:00"), doneAt: null },
    { id: "over", dueAt: at("2026-10-11T09:00"), doneAt: null },
    { id: "d1", dueAt: at("2026-10-10T09:00"), doneAt: at("2026-10-10T10:00") },
    { id: "d2", dueAt: at("2026-10-09T09:00"), doneAt: at("2026-10-12T10:00") },
  ]);
  eq("tasks: open soonest first (the overdue lead), then done, most recent first", [sorted.open.map((t) => t.id), sorted.done.map((t) => t.id)], [["over", "late"], ["d2", "d1"]]);
  const count = dueCountOf([at("2026-10-11T09:00"), at("2026-10-12T18:00"), at("2026-10-13T00:30")], now, TZ);
  eq("due: by tonight, overdue included (tomorrow 00:30 is not due today)", count, { due: 2, overdue: 1 });
  eq("due: the card's words", [dueChipText({ due: 0, overdue: 0 }), dueChipText({ due: 2, overdue: 0 }), dueChipText({ due: 1, overdue: 1 }), dueChipText(count)], [null, "2 due today", "1 overdue", "1 overdue · 1 today"]);

  // The one reminder.
  const later = at("2026-10-13T09:00");
  const past = at("2026-10-12T09:00");
  const sent = at("2026-10-12T09:00");
  eq("reminder: armed for a time to come (null: the dispatcher sends it); a time gone by is spent, never pushed late", [armedRemindSentAt(later, now), armedRemindSentAt(past, now)?.toISOString(), armedRemindSentAt(new Date(now.getTime() - REMIND_LATE_MS + 1000), now)], [null, now.toISOString(), null]);
  eq(
    "reminder: a moved time clears remindSentAt; the reminder switched back on clears it; any other edit keeps it",
    [
      remindSentAtAfterEdit({ dueAt: past, remind: true, remindSentAt: sent }, { dueAt: later, remind: true }, now),
      remindSentAtAfterEdit({ dueAt: later, remind: false, remindSentAt: sent }, { dueAt: later, remind: true }, now),
      remindSentAtAfterEdit({ dueAt: later, remind: true, remindSentAt: sent }, { dueAt: later, remind: true }, now)?.toISOString(),
    ],
    [null, null, sent.toISOString()]
  );
  eq("reminder: a done task opened again keeps a sent reminder, and a time gone by is not pushed late", [remindSentAtAfterUndo({ dueAt: later, remindSentAt: null }, now), remindSentAtAfterUndo({ dueAt: past, remindSentAt: null }, now)?.toISOString(), remindSentAtAfterUndo({ dueAt: past, remindSentAt: sent }, now)?.toISOString()], [null, now.toISOString(), sent.toISOString()]);
  const dueTask = { dueAt: past, remind: true, doneAt: null, remindSentAt: null, archivedAt: null };
  eq(
    "reminder: due when its time came, on, not done, not sent, kept, on a kept customer of an open tab with its list on",
    [
      customerTaskRemindDue(dueTask, now),
      customerTaskRemindDue({ ...dueTask, doneAt: now }, now),
      customerTaskRemindDue({ ...dueTask, remind: false }, now),
      customerTaskRemindDue({ ...dueTask, remindSentAt: now }, now),
      customerTaskRemindDue({ ...dueTask, archivedAt: now }, now),
      customerTaskRemindDue({ ...dueTask, dueAt: later }, now),
      customerTaskRemindDue(dueTask, now, { customerArchived: true }),
      customerTaskRemindDue(dueTask, now, { crmOn: false }),
      customerTaskRemindDue(dueTask, now, { boardArchived: true }),
    ],
    [true, false, false, false, false, false, false, false, false]
  );

  // The paths: the list, a customer, and the reminder's tap URL.
  eq("paths: the list and a customer", [customersHref("b1"), customerHref("b1", "c1")], ["/today/work/b1/customers", "/today/work/b1/customers/c1"]);
  eq("tap URL: /today/work/<board>/customers/<customer>?task=<task>", [TASK_PARAM, customerHref("b1", "c1", "t1")], ["task", "/today/work/b1/customers/c1?task=t1"]);
  eq("tap URL: read back from the path and the query", [customersPathOf("/today/work/b1/customers/c1"), customersPathOf("/today/work/b1/customers"), customersPathOf("/today/work/b1"), customersPathOf("/today/work/b1/customers/../x"), taskParamOf("t1"), taskParamOf(["t1", "t2"]), taskParamOf("<x>"), taskParamOf(undefined)], [
    { boardId: "b1", customerId: "c1" },
    { boardId: "b1", customerId: null },
    null,
    null,
    "t1",
    null,
    null,
    null,
  ]);
  eq(
    "shell: under /customers the work tab stays the current tab (never Board), on Tasks, with Tasks' capture",
    [workBoardIdOf("/today/work/b1/customers/c1"), activeSub("/today/work/b1/customers"), activeSub("/today/work/b1/customers/c1"), sectionOf("/today/work/b1/customers/c1"), captureModeOf("/today/work/b1/customers")],
    ["b1", "/today/work/b1", "/today/work/b1", "tasks", "task"]
  );
  eq("shell: the first-paint titles (the page's ShellTitle then names the tab and the customer)", [titleFor("/today/work/b1/customers"), titleFor("/today/work/b1/customers/c1"), titleFor("/today/work/b1")], [
    { eyebrow: "Work", title: "Customers" },
    { eyebrow: "Work", title: "Customer" },
    { eyebrow: "Tasks", title: "Work" },
  ]);
}

// ── 2. The cores, against a store that keeps the partial unique index ──────
console.log("— the cores (customers-server.ts) —");

type Row<T> = T & { createdAt: number };
/** An in-memory customer store: (boardId, lower(number)) unique among open customers, like Customer_boardId_number_open_key. */
class FakeCrm implements CustomerDb {
  boards: CrmBoardRow[] = [];
  people: Row<CustomerRow>[] = [];
  log: Row<InteractionRow>[] = [];
  todo: Row<CustomerTaskRow>[] = [];
  calls: (LinkedCallBackRow & { userId: string; customerId: string; archivedAt: Date | null })[] = [];
  writes = 0;
  seq = 0;
  private dup(): Error {
    return Object.assign(new Error("Unique constraint failed on the constraint: `Customer_boardId_number_open_key`"), { code: "P2002" });
  }
  private taken(boardId: string, number: string, except?: string) {
    return this.people.some((c) => c.boardId === boardId && c.archivedAt === null && c.id !== except && c.number.toLowerCase() === number.toLowerCase());
  }
  private withBoard(c: CustomerRow) {
    const board = this.boards.find((b) => b.id === c.boardId)!;
    return { ...c, board: { ...board } };
  }
  private plain<T extends { createdAt: number }>(r: T): Omit<T, "createdAt"> {
    const { createdAt, ...rest } = r;
    void createdAt;
    return { ...rest };
  }
  async board(userId: string, boardId: string) {
    const b = this.boards.find((x) => x.id === boardId && x.userId === userId);
    return b ? { ...b } : null;
  }
  async setCrm(userId: string, boardId: string, on: boolean) {
    const b = this.boards.find((x) => x.id === boardId && x.userId === userId && x.archivedAt === null);
    if (!b) return 0;
    b.crmOn = on;
    this.writes++;
    return 1;
  }
  async customers(userId: string, boardId: string, archived: boolean) {
    return this.people.filter((c) => c.userId === userId && c.boardId === boardId && (c.archivedAt !== null) === archived).map((c) => this.plain(c));
  }
  async customer(userId: string, id: string) {
    const c = this.people.find((x) => x.id === id && x.userId === userId);
    return c ? this.withBoard(this.plain(c)) : null;
  }
  async createCustomer(userId: string, boardId: string, f: CustomerFields) {
    if (this.taken(boardId, f.number)) throw this.dup();
    const row = { id: `cu${++this.seq}`, userId, boardId, ...f, archivedAt: null, createdAt: this.seq };
    this.people.push(row);
    this.writes++;
    return this.plain(row);
  }
  async updateCustomer(userId: string, id: string, f: CustomerFields) {
    const c = this.people.find((x) => x.id === id && x.userId === userId && x.archivedAt === null);
    if (!c) return 0;
    if (this.taken(c.boardId, f.number, id)) throw this.dup();
    Object.assign(c, f);
    this.writes++;
    return 1;
  }
  async setCustomerArchived(userId: string, id: string, at: Date | null) {
    const c = this.people.find((x) => x.id === id && x.userId === userId && (at ? x.archivedAt === null : x.archivedAt !== null));
    if (!c) return 0;
    if (!at && this.taken(c.boardId, c.number, id)) throw this.dup();
    c.archivedAt = at;
    this.writes++;
    return 1;
  }
  async interactions(userId: string, customerId: string) {
    return this.log.filter((i) => i.userId === userId && i.customerId === customerId && i.archivedAt === null).map((i) => this.plain(i));
  }
  async interaction(userId: string, id: string) {
    const i = this.log.find((x) => x.id === id && x.userId === userId);
    if (!i) return null;
    const c = this.people.find((x) => x.id === i.customerId)!;
    return { ...this.plain(i), customer: this.withBoard(this.plain(c)) };
  }
  async createInteraction(userId: string, customerId: string, f: InteractionFields) {
    const row = { id: `in${++this.seq}`, userId, customerId, ...f, archivedAt: null, createdAt: this.seq };
    this.log.push(row);
    this.writes++;
    return this.plain(row);
  }
  async updateInteraction(userId: string, id: string, f: InteractionFields) {
    const i = this.log.find((x) => x.id === id && x.userId === userId && x.archivedAt === null);
    if (!i) return 0;
    Object.assign(i, f);
    this.writes++;
    return 1;
  }
  async setInteractionArchived(userId: string, id: string, at: Date | null) {
    const i = this.log.find((x) => x.id === id && x.userId === userId && (at ? x.archivedAt === null : x.archivedAt !== null));
    if (!i) return 0;
    i.archivedAt = at;
    this.writes++;
    return 1;
  }
  async tasks(userId: string, customerId: string) {
    return this.todo.filter((t) => t.userId === userId && t.customerId === customerId && t.archivedAt === null).map((t) => this.plain(t));
  }
  async task(userId: string, id: string) {
    const t = this.todo.find((x) => x.id === id && x.userId === userId);
    if (!t) return null;
    const c = this.people.find((x) => x.id === t.customerId)!;
    return { ...this.plain(t), customer: this.withBoard(this.plain(c)) };
  }
  async createTask(userId: string, customerId: string, f: TaskFields & { remindSentAt: Date | null }) {
    const row = { id: `tk${++this.seq}`, userId, customerId, ...f, doneAt: null, archivedAt: null, createdAt: this.seq };
    this.todo.push(row);
    this.writes++;
    return this.plain(row);
  }
  async updateTask(userId: string, id: string, f: Partial<TaskFields & { doneAt: Date | null; remindSentAt: Date | null }>) {
    const t = this.todo.find((x) => x.id === id && x.userId === userId && x.archivedAt === null);
    if (!t) return 0;
    Object.assign(t, f);
    this.writes++;
    return 1;
  }
  async setTaskArchived(userId: string, id: string, at: Date | null) {
    const t = this.todo.find((x) => x.id === id && x.userId === userId && (at ? x.archivedAt === null : x.archivedAt !== null));
    if (!t) return 0;
    t.archivedAt = at;
    this.writes++;
    return 1;
  }
  async dueTasks(userId: string, boardId: string, before: Date) {
    return this.todo
      .filter((t) => {
        const c = this.people.find((x) => x.id === t.customerId);
        return t.userId === userId && !t.doneAt && !t.archivedAt && t.dueAt.getTime() < before.getTime() && c?.boardId === boardId && c.archivedAt === null;
      })
      .map((t) => ({ customerId: t.customerId, dueAt: t.dueAt }));
  }
  async callBacks(userId: string, customerId: string) {
    return this.calls.filter((c) => c.userId === userId && c.customerId === customerId && c.archivedAt === null).map(({ id, at, action, tags, remindAt }) => ({ id, at, action, tags, remindAt }));
  }
}

async function cores() {
  const U = "u1";
  const now = new Date("2026-10-12T03:30:00.000Z"); // 14:30 Sydney
  const db = new FakeCrm();
  db.boards.push(
    { id: "bOn", userId: U, name: "Acme", archivedAt: null, crmOn: true },
    { id: "bOff", userId: U, name: "Studio", archivedAt: null, crmOn: false },
    { id: "bArch", userId: U, name: "Old", archivedAt: new Date("2026-10-01T00:00:00Z"), crmOn: true },
    { id: "bTheirs", userId: "u2", name: "Theirs", archivedAt: null, crmOn: true }
  );
  const person = (number: string, name = "Jo Bloggs") => ({ number, name, nickname: "", phone: "0412 345 678" });

  // The switch.
  eq("switch: on and off on an open tab; an archived tab or another user's is refused", [
    await setCrmCore(U, "bOff", true, db),
    await setCrmCore(U, "bOff", false, db),
    await setCrmCore(U, "bArch", false, db),
    await setCrmCore(U, "bTheirs", true, db),
    await setCrmCore(U, "../x", true, db),
  ], [{ ok: true, value: { crmOn: true } }, { ok: true, value: { crmOn: false } }, err(WORK_BOARD_ARCHIVED), err(WORK_BOARD_GONE), err(WORK_BOARD_GONE)]);

  // IDs: unique on a tab ignoring case, free again after an archive.
  const a = await createCustomerCore(U, "bOn", { number: " A-12 ", name: "  Alice   Ng ", nickname: " Al ", phone: "+61 2 9000 1234" }, db);
  check("create: cleaned and stored (ID trimmed as typed, name collapsed, nickname, phone)", a.ok && db.people[0]?.number === "A-12" && db.people[0]?.name === "Alice Ng" && db.people[0]?.nickname === "Al" && db.people[0]?.phone === "+61 2 9000 1234", JSON.stringify(db.people[0]));
  const aId = a.ok ? a.value.id : "";
  eq("create: the same ID in another case on the same tab is refused with the index's line", await createCustomerCore(U, "bOn", person("a-12"), db), err(CUSTOMER_NUMBER_TAKEN));
  db.boards.find((b) => b.id === "bOff")!.crmOn = true;
  const other = await createCustomerCore(U, "bOff", person("A-12"), db);
  db.boards.find((b) => b.id === "bOff")!.crmOn = false;
  check("create: the same ID on another tab is that tab's own", other.ok);
  const b = await createCustomerCore(U, "bOn", person("13", "Bob Tran"), db);
  const bId = b.ok ? b.value.id : "";
  eq("edit: their own ID in another case is fine; another customer's is refused", [await editCustomerCore(U, aId, { ...person("a-12", "Alice Ng"), nickname: "Al" }, db), await editCustomerCore(U, bId, person("A-12", "Bob Tran"), db)], [{ ok: true, value: { id: aId } }, err(CUSTOMER_NUMBER_TAKEN)]);
  eq("edit: the limits hold in the core too, before any write", [await editCustomerCore(U, bId, person("13", "n".repeat(61)), db), await editCustomerCore(U, bId, { ...person("13"), phone: "ring" }, db), await createCustomerCore(U, "bOn", person(""), db)], [
    err(CUSTOMER_NAME_LONG),
    err(CUSTOMER_PHONE_BAD),
    err(CUSTOMER_NUMBER_EMPTY),
  ]);
  eq("archive: their ID is free again on the tab (the index covers open customers only)", [(await archiveCustomerCore(U, aId, now, db)).ok, (await createCustomerCore(U, "bOn", person("A-12", "New Al"), db)).ok], [true, true]);
  eq("restore: refused while their ID is another's; archive again is ok", [await restoreCustomerCore(U, aId, db), (await archiveCustomerCore(U, aId, now, db)).ok], [err(CUSTOMER_RESTORE_TAKEN), true]);
  const newAl = db.people.find((c) => c.name === "New Al")!;
  await editCustomerCore(U, newAl.id, person("A-12b", "New Al"), db);
  eq("restore: once the ID is free it comes back; an open customer restores to itself", [await restoreCustomerCore(U, aId, db), await restoreCustomerCore(U, aId, db)], [{ ok: true, value: { id: aId } }, { ok: true, value: { id: aId } }]);
  check("isNumberTaken: P2002, 23505 and the index's name read as a taken ID; anything else does not", isNumberTaken({ code: "P2002" }) && isNumberTaken({ code: "23505" }) && isNumberTaken(new Error("duplicate key value violates unique constraint \"Customer_boardId_number_open_key\"")) && !isNumberTaken(new Error("timeout")));

  // The gate: the tab is the user's, open, and keeps a list; the customer is kept.
  db.boards.find((b) => b.id === "bOff")!.crmOn = false;
  const offCustomer = db.people.find((c) => c.boardId === "bOff")!;
  db.log.push({ id: "inOff", userId: U, customerId: offCustomer.id, at: now, action: "PURCHASE", brief: "", archivedAt: null, createdAt: 0 });
  db.todo.push({ id: "tkOff", userId: U, customerId: offCustomer.id, dueAt: now, title: "Ring", detail: null, remind: true, doneAt: null, remindSentAt: null, archivedAt: null, createdAt: 0 });
  const before = db.writes;
  const offResults = [
    await createCustomerCore(U, "bOff", person("99"), db),
    await editCustomerCore(U, offCustomer.id, person("A-12"), db),
    await archiveCustomerCore(U, offCustomer.id, now, db),
    await restoreCustomerCore(U, offCustomer.id, db),
    await addInteractionCore(U, offCustomer.id, { at: now.toISOString(), action: "PURCHASE" }, db),
    await editInteractionCore(U, "inOff", { at: now.toISOString(), action: "INQUIRY" }, db),
    await archiveInteractionCore(U, "inOff", now, db),
    await restoreInteractionCore(U, "inOff", db),
    await addTaskCore(U, offCustomer.id, { dueAt: now.toISOString(), title: "x" }, now, db),
    await editTaskCore(U, "tkOff", { dueAt: now.toISOString(), title: "x" }, now, db),
    await setTaskDoneCore(U, "tkOff", true, now, db),
    await archiveTaskCore(U, "tkOff", now, db),
    await restoreTaskCore(U, "tkOff", now, db),
    await customerDueCountCore(U, "bOff", now, db),
  ];
  check("switch: off hides and deletes nothing (the tab's customer, their log and tasks are all kept)", db.people.some((c) => c.id === offCustomer.id) && db.log.some((i) => i.id === "inOff" && !i.archivedAt) && db.todo.some((t) => t.id === "tkOff" && !t.archivedAt));
  check("crmOn gate: every action on a tab whose list is off is refused (14 of 14), and nothing is written", offResults.every((r) => !r.ok && r.error === CRM_OFF) && db.writes === before, JSON.stringify(offResults.filter((r) => r.ok || r.error !== CRM_OFF)));
  db.boards.find((b) => b.id === "bOff")!.crmOn = true;
  db.boards.find((b) => b.id === "bOff")!.archivedAt = now;
  check("gate: a tab archived since is refused for its customers' rows too", (await addInteractionCore(U, offCustomer.id, { at: now.toISOString(), action: "PURCHASE" }, db)).ok === false && (await setTaskDoneCore(U, "tkOff", true, now, db)).ok === false && db.writes === before);
  const theirs = { id: "cuT", userId: "u2", boardId: "bTheirs", number: "1", name: "Theirs", nickname: null, phone: null, archivedAt: null, createdAt: 0 };
  db.people.push(theirs);
  eq("gate: another user's tab, customer, entry or task is gone; a malformed id too", [
    await createCustomerCore(U, "bTheirs", person("5"), db),
    await addInteractionCore(U, "cuT", { at: now.toISOString(), action: "PURCHASE" }, db),
    await editTaskCore(U, "tkNope", { dueAt: now.toISOString(), title: "x" }, now, db),
    await archiveInteractionCore(U, "../in", now, db),
    await editCustomerCore(U, "<c>", person("5"), db),
  ], [err(WORK_BOARD_GONE), err(CUSTOMER_GONE), err(CUSTOMER_TASK_GONE), err(INTERACTION_GONE), err(CUSTOMER_GONE)]);
  await archiveCustomerCore(U, bId, now, db);
  eq("gate: an archived customer's log and tasks are closed until they are restored", [await addInteractionCore(U, bId, { at: now.toISOString(), action: "PURCHASE" }, db), await addTaskCore(U, bId, { dueAt: now.toISOString(), title: "x" }, now, db), await editCustomerCore(U, bId, person("13"), db)], [
    err(CUSTOMER_ARCHIVED),
    err(CUSTOMER_ARCHIVED),
    err(CUSTOMER_ARCHIVED),
  ]);
  await restoreCustomerCore(U, bId, db);

  // Interactions.
  const i1 = await addInteractionCore(U, aId, { at: "2026-10-10T01:00:00.000Z", action: "PURCHASE", brief: " 2 boxes " }, db);
  const i2 = await addInteractionCore(U, aId, { at: "2026-10-12T01:00:00.000Z", action: "COMPLAINT", brief: "late delivery" }, db);
  const i1Id = i1.ok ? i1.value.id : "";
  const i2Id = i2.ok ? i2.value.id : "";
  eq("log: an unknown action or a long brief is refused", [await addInteractionCore(U, aId, { at: now.toISOString(), action: "REFUND" }, db), await addInteractionCore(U, aId, { at: now.toISOString(), action: "INQUIRY", brief: "b".repeat(281) }, db), await addInteractionCore(U, aId, { at: "later", action: "INQUIRY" }, db)], [
    err(INTERACTION_ACTION_BAD),
    err(INTERACTION_BRIEF_LONG),
    err(WHEN_BAD),
  ]);
  check("log: an edit changes the entry", (await editInteractionCore(U, i1Id, { at: "2026-10-10T01:00:00.000Z", action: "CREDIT_CHECK", brief: "ok" }, db)).ok && db.log.find((i) => i.id === i1Id)?.action === "CREDIT_CHECK");
  await archiveInteractionCore(U, i2Id, now, db);
  const afterArchive = await loadCustomerPage(U, "bOn", aId, now, db);
  check("log: an archived entry leaves the page; Undo (restore) brings it back, newest first", afterArchive.kind === "ok" && afterArchive.interactions.map((i) => i.id).join() === i1Id);
  await restoreInteractionCore(U, i2Id, db);
  const restored = await loadCustomerPage(U, "bOn", aId, now, db);
  eq("log: newest first", restored.kind === "ok" ? restored.interactions.map((i) => [i.id, i.action]) : null, [[i2Id, "COMPLAINT"], [i1Id, "CREDIT_CHECK"]]);

  // Tasks and their one reminder.
  const t1 = await addTaskCore(U, aId, { dueAt: "2026-10-13T00:00:00.000Z", title: " Call back ", detail: " about the invoice " }, now, db);
  const t1Id = t1.ok ? t1.value.id : "";
  const row = () => db.todo.find((t) => t.id === t1Id)!;
  check("task: scheduled with its reminder on and armed (remindSentAt null)", t1.ok && row().remind && row().remindSentAt === null && row().title === "Call back" && row().detail === "about the invoice");
  const pastTask = await addTaskCore(U, aId, { dueAt: "2026-10-11T22:00:00.000Z", title: "Missed", remind: true }, now, db);
  check("task: one scheduled for a time already gone by shows overdue and is not pushed late (remindSentAt spent)", pastTask.ok && db.todo.find((t) => t.id === pastTask.value.id)?.remindSentAt?.getTime() === now.getTime());
  row().remindSentAt = new Date("2026-10-13T00:00:30.000Z"); // the dispatcher sent it
  await editTaskCore(U, t1Id, { dueAt: "2026-10-13T00:00:00.000Z", title: "Call back re invoice", detail: "about the invoice" }, now, db);
  check("task: an edit that keeps the time keeps remindSentAt (never sent twice)", row().remindSentAt !== null && row().title === "Call back re invoice");
  await editTaskCore(U, t1Id, { dueAt: "2026-10-14T00:00:00.000Z", title: "Call back re invoice" }, now, db);
  check("task: a moved time clears remindSentAt (re-armed)", row().remindSentAt === null && row().dueAt.toISOString() === "2026-10-14T00:00:00.000Z");
  row().remindSentAt = new Date("2026-10-14T00:00:30.000Z");
  await editTaskCore(U, t1Id, { dueAt: "2026-10-14T00:00:00.000Z", title: "Call back re invoice", remind: false }, now, db);
  check("task: switching the reminder off keeps remindSentAt", row().remind === false && row().remindSentAt !== null);
  await editTaskCore(U, t1Id, { dueAt: "2026-10-14T00:00:00.000Z", title: "Call back re invoice", remind: true }, now, db);
  check("task: switching the reminder back on clears remindSentAt", row().remind === true && row().remindSentAt === null);
  eq("task: the limits hold in the core", [await addTaskCore(U, aId, { dueAt: now.toISOString(), title: "" }, now, db), await addTaskCore(U, aId, { dueAt: now.toISOString(), title: "t".repeat(81) }, now, db), await editTaskCore(U, t1Id, { dueAt: "x", title: "y" }, now, db)], [
    err(CUSTOMER_TASK_TITLE_EMPTY),
    err(CUSTOMER_TASK_TITLE_LONG),
    err(WHEN_BAD),
  ]);
  await setTaskDoneCore(U, t1Id, true, now, db);
  const doneRow = row();
  check("task: a done task is never due a reminder (even with its time come and remindSentAt null)", doneRow.doneAt !== null && !customerTaskRemindDue(doneRow, new Date("2026-10-20T00:00:00.000Z")));
  await setTaskDoneCore(U, t1Id, false, now, db);
  check("task: opened again, its reminder for a time to come stays armed", row().doneAt === null && row().remindSentAt === null && customerTaskRemindDue(row(), new Date("2026-10-14T00:01:00.000Z")));
  await archiveTaskCore(U, t1Id, now, db);
  check("task: an archived task leaves the page and is never reminded", row().archivedAt !== null && !customerTaskRemindDue(row(), new Date("2026-10-14T00:01:00.000Z")));
  await restoreTaskCore(U, t1Id, now, db);
  check("task: Undo brings it back as it was", row().archivedAt === null && row().remindSentAt === null);

  // The reads.
  const list = await loadCustomersPage(U, "bOn", now, db);
  check(
    "list page: the tab's kept customers by ID with their due counts, the archived apart, IDs not all numbers (no suggestion)",
    list.kind === "ok" && list.customers.map((c) => c.number).join() === "13,a-12,A-12b" && list.customers.find((c) => c.id === aId)?.due === 1 && list.customers.find((c) => c.id === aId)?.overdue === 1 && list.numeric === false && list.suggestion === null,
    JSON.stringify(list)
  );
  eq("list page: an archived tab, a list switched off, another user's tab", [(await loadCustomersPage(U, "bArch", now, db)).kind, (await setCrmCore(U, "bOn", false, db)).ok && (await loadCustomersPage(U, "bOn", now, db)).kind, (await loadCustomersPage(U, "bTheirs", now, db)).kind], ["archived", "off", "gone"]);
  await setCrmCore(U, "bOn", true, db);
  const numericDb = new FakeCrm();
  numericDb.boards.push({ id: "bN", userId: U, name: "Shop", archivedAt: null, crmOn: true });
  for (const n of ["0007", "0041", "12"]) await createCustomerCore(U, "bN", person(n), numericDb);
  const numericList = await loadCustomersPage(U, "bN", now, numericDb);
  eq("list page: numeric IDs get the numeric keyboard and the next ID", numericList.kind === "ok" ? [numericList.numeric, numericList.suggestion] : null, [true, "0042"]);
  const page = await loadCustomerPage(U, "bOn", aId, now, db);
  check(
    "customer page: tasks open soonest first with their states, then done; the call backs linked to them",
    page.kind === "ok" && page.tasks[0]?.state === "overdue" && page.tasks.some((t) => t.id === t1Id && t.state === "upcoming") && page.customer.nickname === "Al",
    JSON.stringify(page)
  );
  db.calls.push({ id: "cb1", userId: U, customerId: aId, at: now, action: "Ring about refund", tags: ["urgent"], remindAt: null, archivedAt: null });
  const withCalls = await loadCustomerPage(U, "bOn", aId, now, db);
  eq("customer page: the linked call backs, read-only", withCalls.kind === "ok" ? withCalls.callBacks.map((c) => [c.id, c.action, c.tags]) : null, [["cb1", "Ring about refund", ["urgent"]]]);
  eq("customer page: a customer opened under another tab's path, or unknown, is gone", [(await loadCustomerPage(U, "bN", aId, now, db)).kind, (await loadCustomerPage(U, "bOn", "nope", now, db)).kind, (await loadCustomerPage("u2", "bOn", aId, now, db)).kind], ["gone", "gone", "gone"]);
  eq("the tab card's count: due by tonight, overdue included", await customerDueCountCore(U, "bOn", now, db), { ok: true, value: { due: 1, overdue: 1 } });
}

// ── 3. The wiring ──────────────────────────────────────────────────────────
function wiring() {
  console.log("— actions, routes, shell, the tab card, the sheets —");
  const actions = code("src/app/actions/customers.ts");
  check("actions: a 'use server' module", read("src/app/actions/customers.ts").trimStart().startsWith('"use server";'));
  const exported = [...actions.matchAll(/export async function (\w+)\(([^)]*)\)[^{]*\{([\s\S]*?)\n\}/g)].map((m) => ({ name: m[1], body: m[3] }));
  eq(
    "actions: the tab's switch, the card's count, customers, interactions and tasks",
    exported.map((e) => e.name),
    ["setCrm", "customerDueCount", "createCustomer", "editCustomer", "archiveCustomer", "restoreCustomer", "addInteraction", "editInteraction", "archiveInteraction", "restoreInteraction", "addCustomerTask", "editCustomerTask", "setCustomerTaskDone", "archiveCustomerTask", "restoreCustomerTask"]
  );
  check("actions: each goes through a core (the gate) with the current user, and never throws", exported.every((e) => /return run\("\w+", (opts|undefined), \(userId\) => \w+Core\(userId, /.test(e.body)) && /catch \(err\) \{[\s\S]*?return \{ ok: false, error:/.test(actions));

  const server = code("src/lib/customers-server.ts");
  const writeCores = ["createCustomerCore", "editCustomerCore", "archiveCustomerCore", "restoreCustomerCore", "addInteractionCore", "editInteractionCore", "archiveInteractionCore", "restoreInteractionCore", "addTaskCore", "editTaskCore", "setTaskDoneCore", "archiveTaskCore", "restoreTaskCore", "customerDueCountCore"];
  const body = (name: string) => new RegExp(`export async function ${name}\\b[\\s\\S]*?\\n\\}`).exec(server)?.[0] ?? "";
  const ungated = writeCores.filter((n) => !/await (openBoard|openCustomer|openInteraction|openTask)\(db, userId, /.test(body(n)));
  check("cores: every write opens through a gate (the tab is the user's, open, and keeps a list) before it writes", ungated.length === 0, ungated.join(", "));
  check("cores: the gate refuses a foreign, archived or list-off tab, in that order", /if \(!board \|\| board\.userId !== userId\) return fail\(WORK_BOARD_GONE\);\s*if \(board\.archivedAt\) return fail\(WORK_BOARD_ARCHIVED\);\s*if \(!board\.crmOn\) return fail\(CRM_OFF\);/.test(server));
  check("cores: a taken ID (the partial unique index's P2002) reads 'That ID is already used on this tab'", CUSTOMER_NUMBER_TAKEN === "That ID is already used on this tab" && (server.match(/if \(isNumberTaken\(err\)\) return fail\(CUSTOMER_NUMBER_TAKEN\);/g) ?? []).length === 2);
  check("cores: a task's edit re-arms through remindSentAtAfterEdit; its undo through remindSentAtAfterUndo", /const remindSentAt = remindSentAtAfterEdit\(row\.value, f\.value, now\);/.test(server) && /remindSentAt: remindSentAtAfterUndo\(row\.value, now\)/.test(server));

  // No game writes: the customer code reads and writes the customer tables, the tab's crmOn, and reads call backs.
  const crmCode = ["src/lib/customers.ts", "src/lib/customers-server.ts", "src/app/actions/customers.ts", "src/components/customers/CustomersView.tsx", "src/components/customers/CustomerView.tsx", "src/components/customers/CustomerSheets.tsx", "src/components/customers/CrmGate.tsx"];
  const gameWords = crmCode.filter((f) => /activityEvent|ActivityEvent|ledger|\bxp\b|streak|invalidate\(|life-economy|lifeXp|awardXp|debt/i.test(code(f).replace(/[^\n]*"[^"\n]*"[^\n]*/g, (l) => l.replace(/"[^"\n]*"/g, '""'))));
  check("no game: nothing in the customer code names the ledger, XP, the streak, debt, or a game cache", gameWords.length === 0, gameWords.join(", "));
  const models = [...new Set([...server.matchAll(/prisma\.(\w+)\./g)].map((m) => m[1]))].sort();
  eq("no game: the cores touch only WorkBoard (crmOn), Customer, CustomerInteraction, CustomerTask, and read CallBack", models, ["callBack", "customer", "customerInteraction", "customerTask", "workBoard"]);
  check("no game: CallBack is only read; WorkBoard only has crmOn written", !/prisma\.callBack\.(create|update|upsert|delete)/.test(server) && /prisma\.workBoard\.updateMany\(\{ where: \{ id: boardId, userId, archivedAt: null \}, data: \{ crmOn: on \} \}\)/.test(server) && !/prisma\.workBoard\.(create|delete|upsert)/.test(server));

  // Routes and their params (Next 16: Promises).
  const listPage = "src/app/today/work/[boardId]/customers/page.tsx";
  const onePage = "src/app/today/work/[boardId]/customers/[customerId]/page.tsx";
  check("routes: the list and a customer", existsSync(join(ROOT, listPage)) && existsSync(join(ROOT, onePage)));
  const lp = code(listPage);
  const op = code(onePage);
  check("route /customers: params awaited, one read, an unknown tab 404s, the tab's name as the eyebrow", /params: Promise<\{ boardId: string \}>/.test(lp) && /await params/.test(lp) && /loadCustomersPage\(getCurrentUserId\(\), boardId, new Date\(\)\)/.test(lp) && /if \(page\.kind === "gone"\) notFound\(\);/.test(lp) && /<ShellTitle eyebrow=\{page\.board\.name\} title="Customers" \/>/.test(lp));
  check(
    "route /customers/[customerId]: the tap URL's params and ?task=, the task highlighted, the customer's name as the title",
    /params: Promise<\{ boardId: string; customerId: string \}>/.test(op) &&
      /searchParams: Promise<\{ \[key: string\]: string \| string\[\] \| undefined \}>/.test(op) &&
      /loadCustomerPage\(getCurrentUserId\(\), boardId, customerId, now\)/.test(op) &&
      /highlightTask=\{taskParamOf\(query\[TASK_PARAM\]\)\}/.test(op) &&
      /<ShellTitle eyebrow=\{page\.board\.name\} title=\{page\.customer\.name\} \/>/.test(op)
  );
  const view = code("src/components/customers/CustomerView.tsx");
  check("customer page: the highlighted task is marked and scrolled into view (a done one opens its fold)", /data-hl=\{highlighted \? "" : undefined\}/.test(view) && /document\.getElementById\(`crm-task-\$\{highlightTask\}`\)/.test(view) && /scrollIntoView\(\{ block: "center" \}\)/.test(view) && /open=\{hlTask\?\.doneAt \? true : undefined\}/.test(view));
  check("customer page: the phone is a tap-to-call link (tel:), a 44 px button", /<a className="btn btn-secondary btn-block crm-call" href=\{phoneHref\(customer\.phone\)\}>/.test(view));
  check("customer page: archiving an entry or a task offers Undo", /title: "Entry archived"[\s\S]*?label: "Undo", onAction: \(\) => undo\(\(\) => restoreInteraction\(e\.id/.test(view) && /title: "Task archived"[\s\S]*?label: "Undo", onAction: \(\) => undo\(\(\) => restoreCustomerTask\(t\.id/.test(view));
  const list = code("src/components/customers/CustomersView.tsx");
  check("list page: the search is by ID (the numeric keyboard while IDs are numbers), Enter opens the pick", /inputMode=\{numericKeys \? "numeric" : "text"\}/.test(list) && /searchPick\(searchCustomers\(customers, query\)\)/.test(list) && /router\.push\(customerHref\(board\.id, pick\.id\)\)/.test(list));
  check("list page: name matches under their own heading; archived customers folded with Restore", /title="Name matches"/.test(list) && /<details className="card crm-arch">/.test(list) && /restoreCustomer\(c\.id, \{ refresh: true \}\)/.test(list));
  check("list page: Add customer suggests the next ID; a new customer opens on their page", /openAdd\(suggestion \?\? ""\)/.test(list) && /createCustomer\(board\.id, value\)/.test(list) && /router\.push\(customerHref\(board\.id, res\.value\.id\)\)/.test(list));
  const sheets = code("src/components/customers/CustomerSheets.tsx");
  check("sheets: the action chips are a radio group of the four, each a 44 px label", /CUSTOMER_ACTIONS\.map\(\(a\) => \(\s*<label key=\{a\} className="crm-chip">\s*<input\s+type="radio"/.test(sheets));
  check("sheets: date-time fields, read in the user's zone (instantOfLocalInput)", (sheets.match(/type="datetime-local"/g) ?? []).length === 2 && (sheets.match(/instantOfLocalInput\(v\.when\)/g) ?? []).length === 2);
  check("sheets: a task's reminder is a switch, on by default for a new task", /<Switch checked=\{v\.remind\}/.test(sheets) && /remind: true \} \}\);/.test(view));

  // The tab card.
  const card = code("src/components/today/WorkBoardCard.tsx");
  check("tab card: 'Customers' links to the list while it is on, with the due count", /\{crmOn && \(\s*<Link className="work-crm-link" href=\{customersHref\(board\.id\)\}>/.test(card) && /customerDueCount\(board\.id\)/.test(card) && /dueChipText\(due\)/.test(card));
  check("tab card: the menu's 'Customer list' switch (setCrm, refreshed); off hides, nothing deleted", /<h3>Customer list<\/h3>/.test(card) && /setCrm\(board\.id, on, \{ refresh: true \}\)/.test(card) && /<Switch checked=\{crmWant \?\? crmOn\} onChange=\{toggleCrm\} label="Customer list"/.test(card) && /nothing is deleted/.test(read("src/components/today/WorkBoardCard.tsx")));

  // 44 px, tokens only, the layer order.
  const css = read("src/components/customers/customers.css");
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  check("customers.css: tokens only (no hex, rgb() or hsl()), in @layer components after the layer order", !/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(bare) && css.startsWith("@layer theme, base, components, art, effects, utilities;") && /@layer components \{/.test(bare));
  const rule = (sel: string) => new RegExp(`(?:^|\\})\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "m").exec(bare)?.[1] ?? "";
  const minH = (sel: string) => Number(/min-height:\s*(\d+)px/.exec(rule(sel))?.[1] ?? 0);
  const targets = [".crm-back", ".crm-kb", ".crm-input", ".crm-chip", ".crm-row", ".crm-arch > summary", ".crm-task-body", ".crm-done > summary", ".crm-entry-btn", ".crm-arch-row"];
  const small = targets.filter((s) => minH(s) < 44);
  check("customers.css: every control is a 44 px target (rows 52 to 56)", small.length === 0, small.map((s) => `${s} ${minH(s)}`).join(", "));
  const work = read("src/components/shell/work-tabs.css").replace(/\/\*[\s\S]*?\*\//g, "");
  check("work-tabs.css: the card's Customers link is a 44 px target", /\.work-crm-link \{[^}]*min-height: 44px;/.test(work));

  // package.json and the shell.
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  check("package.json: life:check runs customers-check right after work-boards-check; customers:check runs it alone", pkg.scripts["life:check"].includes("tsx scripts/work-boards-check.ts && tsx scripts/customers-check.ts && ") && pkg.scripts["customers:check"] === "tsx scripts/customers-check.ts");
  check("nav: the work tab's path match covers its customer pages (workBoardIdOf, no section of its own)", /const work = workBoardIdOf\(pathname\);\s*if \(work\) return workBoardHref\(work\);/.test(code("src/components/shell/nav.ts")) && /const crm = customersPathOf\(path\);/.test(code("src/components/shell/nav.ts")));
}

/** The reminder's tap URL as the dispatcher and the bell build it (callbacks' own modules) lands on the customer's page. */
async function tapUrls() {
  console.log("— the reminder's tap URL (the dispatcher's and the bell's) —");
  const lands = (u: string) => {
    const url = new URL(u, "https://x.test");
    return JSON.stringify([customersPathOf(url.pathname), taskParamOf(url.searchParams.get(TASK_PARAM))]) === JSON.stringify([{ boardId: "b1", customerId: "c1" }, "t1"]);
  };
  const builders: [string, unknown][] = [];
  try {
    builders.push(["reminders-server customerTaskUrl", (await import("../src/lib/reminders-server")).customerTaskUrl]);
  } catch (e) {
    builders.push(["reminders-server customerTaskUrl", String(e)]);
  }
  try {
    builders.push(["callbacks customerTaskHref", (await import("../src/lib/callbacks")).customerTaskHref]);
  } catch (e) {
    builders.push(["callbacks customerTaskHref", String(e)]);
  }
  for (const [name, fn] of builders) {
    const url = typeof fn === "function" ? (fn as (b: string, c: string, t: string) => string)("b1", "c1", "t1") : null;
    check(`tap URL: ${name}("b1","c1","t1") opens customer c1 on tab b1 with task t1 highlighted`, url !== null && lands(url) && url === customerHref("b1", "c1", "t1"), String(url ?? fn));
  }
}

async function main() {
  await cores();
  await tapUrls();
  wiring();
  console.log(`customers-check: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
