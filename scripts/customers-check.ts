/**
 * Customers (2026-10-12; migration 20261218000000_customers): a work tab's
 * own customer list, switched on in the tab's menu (WorkBoard.crmOn). This
 * check pins:
 *
 *   1. the rules (src/lib/customers.ts): the limits (ID 1..24, name 1..60,
 *      nickname <= 40, phone, brief <= 280, an info's detail 1..1000 and its
 *      "Recorded at" never a minute ahead), the eight actions (Call, Visit,
 *      Email and Message added 2026-10-20), IDs compared ignoring case, the
 *      next-ID suggestion, the Customers page's search (customer-search.ts, the
 *      work frame's one engine: by ID first, then names), the user's clock, the
 *      due count, and the paths (an old customer task reminder's tap URL among
 *      them);
 *   2. the cores (src/lib/customers-server.ts) against an in-memory store that
 *      keeps the partial unique index on (boardId, lower(number)) WHERE
 *      archivedAt IS NULL: the ID unique on a tab ignoring case and free again
 *      after an archive; the crmOn gate (and the tab's owner, and archived
 *      tabs) on every write; an info recorded now by default, newest first,
 *      archived and restored; the pages' reads (their scheduled tasks, the due
 *      counts, the latest activity);
 *   3. the wiring: the actions, the routes and their params, the shell (the
 *      work tab stays current under /customers), the work frame's Customers
 *      page and the menu's switch, 44 px targets and tokens only, and no game
 *      write anywhere.
 *
 * A customer's tasks are scheduled tasks since 2026-10-20 (their rules, cores,
 * reminder and highlight: scripts/scheduled-tasks-check.ts, which took over the
 * customer task tests this check held).
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
  CUSTOMER_INFO_EMPTY,
  CUSTOMER_INFO_GONE,
  CUSTOMER_INFO_LONG,
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
  CUSTOMER_ACTION_ICON,
  INTERACTION_ACTION_BAD,
  INTERACTION_BRIEF_LONG,
  INTERACTION_GONE,
  RECORDED_FUTURE,
  TASK_PARAM,
  WHEN_BAD,
  cleanAction,
  cleanBrief,
  cleanCustomerName,
  cleanCustomerNumber,
  cleanInfoDetail,
  cleanNickname,
  cleanPhone,
  cleanRecordedAt,
  cleanWhen,
  customerHref,
  customersHref,
  customersPathOf,
  dueChipText,
  dueCountOf,
  endOfLocalDay,
  idsNumeric,
  infoFirstLine,
  infoLooksLong,
  infoRecordedLabel,
  instantOfLocalInput,
  localInputOf,
  nextCustomerNumber,
  numberKey,
  numberUsed,
  phoneHref,
  sortInfos,
  taskParamOf,
  whenLabel,
} from "../src/lib/customers";
import { matchCustomers, prepareIndex, topMatch } from "../src/lib/customer-search";
import { TASK_ICONS } from "../src/lib/task-style";
import type { ScheduledView } from "../src/lib/scheduled-tasks";
import {
  addInfoCore,
  addInteractionCore,
  archiveCustomerCore,
  archiveInfoCore,
  archiveInteractionCore,
  createCustomerCore,
  customerDueCountCore,
  editCustomerCore,
  editInfoCore,
  editInteractionCore,
  isNumberTaken,
  loadCustomerPage,
  loadCustomersPage,
  restoreCustomerCore,
  restoreInfoCore,
  restoreInteractionCore,
  setCrmCore,
  type CrmBoardRow,
  type CustomerDb,
  type CustomerFields,
  type CustomerInfoRow,
  type InfoFields,
  type CustomerRow,
  type InteractionFields,
  type InteractionRow,
} from "../src/lib/customers-server";
import { WORK_BOARD_ARCHIVED, WORK_BOARD_GONE, workBoardIdOf } from "../src/lib/work-boards";
import { activeSub, captureModeOf, sectionOf, titleFor, workSubsOf } from "../src/components/shell/nav";

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
  // 2026-10-20: Call, Visit, Email and Message join the four (stored as the same text column; old entries read as before).
  eq("actions: Call, Visit, Email, Message, Purchase, Inquiry, Complaint, Credit check, each with a glyph", CUSTOMER_ACTIONS.map((a) => [a, CUSTOMER_ACTION_LABEL[a], CUSTOMER_ACTION_GLYPH[a].length > 0]), [
    ["CALL", "Call", true],
    ["VISIT", "Visit", true],
    ["EMAIL", "Email", true],
    ["MESSAGE", "Message", true],
    ["PURCHASE", "Purchase", true],
    ["INQUIRY", "Inquiry", true],
    ["COMPLAINT", "Complaint", true],
    ["CREDIT_CHECK", "Credit check", true],
  ]);
  check("actions: the four contact actions draw the app's own task icons", ["CALL", "VISIT", "EMAIL", "MESSAGE"].every((a) => { const i = CUSTOMER_ACTION_ICON[a as keyof typeof CUSTOMER_ACTION_ICON]; return !!i && i in TASK_ICONS; }) && Object.keys(CUSTOMER_ACTION_ICON).length === 4);
  eq("actions: anything else is refused (the old four still pass)", [cleanAction("REFUND"), cleanAction("purchase"), cleanAction(null), cleanAction("CALL").ok, cleanAction("CREDIT_CHECK").ok], [err(INTERACTION_ACTION_BAD), err(INTERACTION_ACTION_BAD), err(INTERACTION_ACTION_BAD), true, true]);
  eq("brief: optional, 280 pass, 281 refused, line breaks kept", [cleanBrief(undefined), cleanBrief("b".repeat(280)).ok, cleanBrief("b".repeat(281)), cleanBrief(" a\r\nb ")], [
    { ok: true, value: "" },
    true,
    err(INTERACTION_BRIEF_LONG),
    { ok: true, value: "a\nb" },
  ]);
  eq("when: an ISO instant; nonsense or out of range refused", [cleanWhen("2026-10-12T03:30:00.000Z").ok, cleanWhen("soon"), cleanWhen("1990-01-01T00:00:00Z"), cleanWhen(undefined)], [true, err(WHEN_BAD), err(WHEN_BAD), err(WHEN_BAD)]);

  // Info: a detail and when it was recorded.
  eq("info: the detail is required, trimmed, line breaks kept; 1000 pass, 1001 refused", [cleanInfoDetail("  "), cleanInfoDetail(undefined), cleanInfoDetail(" Likes A5\r\nPays cash "), cleanInfoDetail("d".repeat(1000)).ok, cleanInfoDetail("d".repeat(1001))], [
    err(CUSTOMER_INFO_EMPTY),
    err(CUSTOMER_INFO_EMPTY),
    { ok: true, value: "Likes A5\nPays cash" },
    true,
    err(CUSTOMER_INFO_LONG),
  ]);
  {
    const n = new Date("2026-10-14T04:20:00.000Z");
    eq(
      "info: recorded at an instant, never more than a minute ahead of now (a minute ahead passes; past times pass)",
      [cleanRecordedAt("2026-10-14T04:21:00.000Z", n).ok, cleanRecordedAt("2026-10-14T04:21:01.000Z", n), cleanRecordedAt("2026-09-01T00:00:00.000Z", n).ok, cleanRecordedAt("yesterday", n)],
      [true, err(RECORDED_FUTURE), true, err(WHEN_BAD)]
    );
    eq("info: 'Recorded Wed 14 Oct · 15:20' in the user's zone (the year when not this one)", [infoRecordedLabel(n, n, TZ), infoRecordedLabel(new Date("2025-12-31T01:05:00.000Z"), n, TZ)], ["Recorded Wed 14 Oct · 15:20", "Recorded Wed 31 Dec 2025 · 12:05"]);
    eq(
      "info: newest recorded first; the same minute, the newest added first",
      sortInfos([
        { id: "i1", recordedAt: "2026-10-10T00:00:00.000Z", createdAt: "2026-10-10T00:00:00.000Z" },
        { id: "i2", recordedAt: "2026-10-14T00:00:00.000Z", createdAt: "2026-10-14T00:00:00.000Z" },
        { id: "i3", recordedAt: "2026-10-14T00:00:00.000Z", createdAt: "2026-10-14T00:05:00.000Z" },
      ]).map((i) => i.id),
      ["i3", "i2", "i1"]
    );
    eq("info: the list's subtitle is the first written line; 'More' is offered for a long one", [infoFirstLine("\n  Likes   A5 paper \nPays cash"), infoFirstLine("   "), infoLooksLong("short"), infoLooksLong("x".repeat(111)), infoLooksLong("a\nb\nc\nd")], ["Likes A5 paper", "", false, true, true]);
  }

  // The next ID, while every ID is a number.
  eq("next ID: one past the highest, natural not alphabetical ('9','10' → '11')", nextCustomerNumber(["9", "10", "2"]), "11");
  eq("next ID: the zero padding is kept ('0041' → '0042'; '0099' → '0100')", [nextCustomerNumber(["0041", "0007"]), nextCustomerNumber(["0099"])], ["0042", "0100"]);
  eq("next ID: none with no ID yet, or any ID that is not a number, or past 24 digits", [nextCustomerNumber([]), nextCustomerNumber(["12", "A-3"]), nextCustomerNumber(["9".repeat(24)])], [null, null, null]);
  eq("numeric keyboard: only while every ID is a number", [idsNumeric(["1", "22"]), idsNumeric(["1", "x"]), idsNumeric([])], [true, false, false]);

  // The Customers page's search (customer-search.ts, the work frame's one engine), by ID first, over the tab's kept customers.
  const people = [
    { id: "c12", number: "12", name: "Alice Ng", nickname: null, phone: null, activity: 0 },
    { id: "c120", number: "120", name: "Bob Tran", nickname: "Bobby", phone: null, activity: 0 },
    { id: "c1200", number: "1200", name: "Carol Ruiz", nickname: null, phone: null, activity: 0 },
    { id: "c7", number: "7", name: "Dan 12th Street", nickname: null, phone: null, activity: 0 },
    { id: "cA", number: "A-12", name: "Erin Ali", nickname: "Ally", phone: null, activity: 0 },
  ];
  const ix = prepareIndex(people);
  const ids = (q: string) => matchCustomers(ix, q, { limit: Infinity })?.results.map((m) => m.entry.id) ?? null;
  eq("search: the exact ID first, then IDs that start with it (by activity, then name), then a name's word, then IDs and names holding it", ids(" 12 "), ["c12", "c120", "c1200", "c7", "cA"]);
  eq("search: an ID matches ignoring case ('a-12' opens A-12)", topMatch(matchCustomers(ix, "a-12"))?.entry.id, "cA");
  eq("search: a prefix with no exact ID lists the prefix matches first", [ids("120"), ids("1")?.slice(0, 3)], [["c120", "c1200"], ["c12", "c120", "c1200"]]);
  eq("search: names and nicknames: a word's start before anywhere ('al': Alice, then Erin Ali's word, then Ally)", ids("al"), ["c12", "cA"]);
  eq("search: a word start outranks a match inside a word ('ng': Alice Ng before Wang Li)", matchCustomers(prepareIndex([...people, { id: "cZ", number: "99", name: "Wang Li", nickname: null, phone: null, activity: 0 }]), "ng")?.results.map((m) => m.entry.id), ["c12", "cZ"]);
  eq("search: empty is no search; the page lists the kept customers only (an archived one is never in its index)", [matchCustomers(ix, "   "), ids("13")], [null, []]);
  eq("search: Enter opens the top result (the exact ID when there is one)", [topMatch(matchCustomers(ix, "12"))?.entry.id, topMatch(matchCustomers(ix, "bobby"))?.entry.id], ["c12", "c120"]);

  // The user's clock (LIFE_TZ in the app; Sydney here).
  const now = new Date("2026-10-12T03:30:00.000Z"); // 14:30 in Sydney (AEDT, +11)
  eq("clock: a datetime-local value names the zone's wall time, and back", [localInputOf(now, TZ), instantOfLocalInput("2026-10-12T14:30", TZ)?.toISOString(), instantOfLocalInput("nope", TZ)], ["2026-10-12T14:30", now.toISOString(), null]);
  eq("clock: today ends at the next local midnight", endOfLocalDay(now, TZ).toISOString(), "2026-10-12T13:00:00.000Z");
  eq(
    "clock: labels say Today, Tomorrow, Yesterday, else the day (and the year when not this one)",
    ["2026-10-12T14:30", "2026-10-13T09:00", "2026-10-11T16:10", "2026-10-14T09:05", "2027-01-05T09:00"].map((v) => whenLabel(instantOfLocalInput(v, TZ) as Date, now, TZ)),
    ["Today 14:30", "Tomorrow 09:00", "Yesterday 16:10", "Wed 14 Oct, 09:05", "Tue 5 Jan 2027, 09:00"]
  );

  // The due count (the work frame's Customers count and the list's chips; scheduled tasks since 2026-10-20).
  const at = (v: string) => instantOfLocalInput(v, TZ) as Date;
  const count = dueCountOf([at("2026-10-11T09:00"), at("2026-10-12T18:00"), at("2026-10-13T00:30")], now, TZ);
  eq("due: by tonight, overdue included (tomorrow 00:30 is not due today)", count, { due: 2, overdue: 1 });
  eq("due: the card's words", [dueChipText({ due: 0, overdue: 0 }), dueChipText({ due: 2, overdue: 0 }), dueChipText({ due: 1, overdue: 1 }), dueChipText(count)], [null, "2 due today", "1 overdue", "1 overdue · 1 today"]);

  // The paths: the list, a customer, and the reminder's tap URL.
  eq("paths: the list and a customer", [customersHref("b1"), customerHref("b1", "c1")], ["/today/work/b1/customers", "/today/work/b1/customers/c1"]);
  eq("an old customer task reminder's tap URL: /today/work/<board>/customers/<customer>?task=<task>", [TASK_PARAM, customerHref("b1", "c1", "t1")], ["task", "/today/work/b1/customers/c1?task=t1"]);
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
  eq("shell: the first-paint titles (the page's ShellTitle then names the tab and the customer; the tab's index is its Agenda)", [titleFor("/today/work/b1/customers"), titleFor("/today/work/b1/customers/c1"), titleFor("/today/work/b1")], [
    { eyebrow: "Work", title: "Customers" },
    { eyebrow: "Work", title: "Customer" },
    { eyebrow: "Work", title: "Agenda" },
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
  notes: CustomerInfoRow[] = [];
  /** Scheduled tasks for the tab's customers (ScheduledTask; the counts and a customer's page read them). */
  scheduledRows: (ScheduledView & { userId: string; archivedAt: Date | null })[] = [];
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
  async infos(userId: string, customerId: string) {
    return this.notes.filter((i) => i.userId === userId && i.customerId === customerId && i.archivedAt === null).map((i) => ({ ...i }));
  }
  async info(userId: string, id: string) {
    const i = this.notes.find((x) => x.id === id && x.userId === userId);
    if (!i) return null;
    const c = this.people.find((x) => x.id === i.customerId)!;
    return { ...i, customer: this.withBoard(this.plain(c)) };
  }
  async createInfo(userId: string, customerId: string, f: InfoFields) {
    const row: CustomerInfoRow = { id: `if${++this.seq}`, userId, customerId, ...f, archivedAt: null, createdAt: new Date(Date.UTC(2026, 9, 1) + this.seq * 1000) };
    this.notes.push(row);
    this.writes++;
    return { ...row };
  }
  async updateInfo(userId: string, id: string, f: InfoFields) {
    const i = this.notes.find((x) => x.id === id && x.userId === userId && x.archivedAt === null);
    if (!i) return 0;
    Object.assign(i, f);
    this.writes++;
    return 1;
  }
  async setInfoArchived(userId: string, id: string, at: Date | null) {
    const i = this.notes.find((x) => x.id === id && x.userId === userId && (at ? x.archivedAt === null : x.archivedAt !== null));
    if (!i) return 0;
    i.archivedAt = at;
    this.writes++;
    return 1;
  }
  async latestInfos(userId: string, boardId: string) {
    const best = new Map<string, CustomerInfoRow>();
    for (const i of this.notes) {
      const c = this.people.find((x) => x.id === i.customerId);
      if (i.userId !== userId || i.archivedAt || !c || c.boardId !== boardId || c.archivedAt) continue;
      const b = best.get(i.customerId);
      if (!b || i.recordedAt.getTime() > b.recordedAt.getTime() || (i.recordedAt.getTime() === b.recordedAt.getTime() && i.createdAt.getTime() > b.createdAt.getTime())) best.set(i.customerId, i);
    }
    return [...best.values()].map((i) => ({ customerId: i.customerId, detail: i.detail.slice(0, 160) }));
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
  async dueTasks(userId: string, boardId: string, before: Date) {
    return this.scheduledRows
      .filter((t) => {
        const c = t.customer ? this.people.find((x) => x.id === t.customer!.id) : undefined;
        return t.userId === userId && t.boardId === boardId && !t.doneAt && !t.archivedAt && Date.parse(t.dueAt) < before.getTime() && c?.boardId === boardId && c.archivedAt === null;
      })
      .map((t) => ({ customerId: t.customer!.id, dueAt: new Date(t.dueAt) }));
  }
  async activity(userId: string, boardId: string) {
    return this.people
      .filter((c) => c.userId === userId && c.boardId === boardId && c.archivedAt === null)
      .map((c) => ({ customerId: c.id, at: Math.max(c.createdAt, ...this.log.filter((i) => i.customerId === c.id && !i.archivedAt).map((i) => i.at.getTime())) }));
  }
  async scheduled(userId: string, customerId: string) {
    return this.scheduledRows.filter((t) => t.userId === userId && t.customer?.id === customerId && !t.archivedAt).map(({ userId: _u, archivedAt: _a, ...v }) => (void _u, void _a, v));
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
  db.notes.push({ id: "ifOff", userId: U, customerId: offCustomer.id, detail: "Kept note", recordedAt: now, archivedAt: null, createdAt: now });
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
    await addInfoCore(U, offCustomer.id, { detail: "x" }, now, db),
    await editInfoCore(U, "ifOff", { detail: "x" }, now, db),
    await archiveInfoCore(U, "ifOff", now, db),
    await restoreInfoCore(U, "ifOff", db),
    await customerDueCountCore(U, "bOff", now, db),
  ];
  check("switch: off hides and deletes nothing (the tab's customer, their log and infos are all kept)", db.people.some((c) => c.id === offCustomer.id) && db.log.some((i) => i.id === "inOff" && !i.archivedAt) && db.notes.some((i) => i.id === "ifOff" && i.detail === "Kept note" && !i.archivedAt));
  check("crmOn gate: every action on a tab whose list is off is refused (13 of 13), and nothing is written", offResults.length === 13 && offResults.every((r) => !r.ok && r.error === CRM_OFF) && db.writes === before, JSON.stringify(offResults.filter((r) => r.ok || r.error !== CRM_OFF)));
  db.boards.find((b) => b.id === "bOff")!.crmOn = true;
  db.boards.find((b) => b.id === "bOff")!.archivedAt = now;
  check("gate: a tab archived since is refused for its customers' rows too", (await addInteractionCore(U, offCustomer.id, { at: now.toISOString(), action: "PURCHASE" }, db)).ok === false && (await addInfoCore(U, offCustomer.id, { detail: "x" }, now, db)).ok === false && db.writes === before);
  const theirs = { id: "cuT", userId: "u2", boardId: "bTheirs", number: "1", name: "Theirs", nickname: null, phone: null, archivedAt: null, createdAt: 0 };
  db.people.push(theirs);
  eq("gate: another user's tab, customer, entry or info is gone; a malformed id too", [
    await createCustomerCore(U, "bTheirs", person("5"), db),
    await addInteractionCore(U, "cuT", { at: now.toISOString(), action: "PURCHASE" }, db),
    await editInfoCore(U, "ifNope", { detail: "x" }, now, db),
    await archiveInteractionCore(U, "../in", now, db),
    await editCustomerCore(U, "<c>", person("5"), db),
  ], [err(WORK_BOARD_GONE), err(CUSTOMER_GONE), err(CUSTOMER_INFO_GONE), err(INTERACTION_GONE), err(CUSTOMER_GONE)]);
  await archiveCustomerCore(U, bId, now, db);
  eq("gate: an archived customer's log and infos are closed until they are restored (their scheduled tasks are held with them: scheduled-tasks-check)", [await addInteractionCore(U, bId, { at: now.toISOString(), action: "PURCHASE" }, db), await editCustomerCore(U, bId, person("13"), db), await addInfoCore(U, bId, { detail: "x" }, now, db)], [
    err(CUSTOMER_ARCHIVED),
    err(CUSTOMER_ARCHIVED),
    err(CUSTOMER_ARCHIVED),
  ]);
  await restoreCustomerCore(U, bId, db);

  // Info.
  const f1 = await addInfoCore(U, aId, { detail: "  Likes A5 paper\r\nPays cash  " }, now, db);
  const f1Id = f1.ok ? f1.value.id : "";
  const note = (id: string) => db.notes.find((i) => i.id === id)!;
  check("info: recorded now when no time is given; the detail cleaned, line breaks kept", f1.ok && note(f1Id).recordedAt.getTime() === now.getTime() && note(f1Id).detail === "Likes A5 paper\nPays cash", JSON.stringify(note(f1Id)));
  const f2 = await addInfoCore(U, aId, { detail: "Prefers email", recordedAt: "2026-10-01T00:00:00.000Z" }, now, db);
  const f2Id = f2.ok ? f2.value.id : "";
  check("info: a time given (in the past) is kept", note(f2Id).recordedAt.toISOString() === "2026-10-01T00:00:00.000Z");
  const wInfo = db.writes;
  eq("info: an empty or long detail, a time more than a minute ahead, or nonsense is refused, and nothing is written", [
    await addInfoCore(U, aId, { detail: " " }, now, db),
    await addInfoCore(U, aId, { detail: "d".repeat(1001) }, now, db),
    await addInfoCore(U, aId, { detail: "x", recordedAt: new Date(now.getTime() + 61_000).toISOString() }, now, db),
    await addInfoCore(U, aId, { detail: "x", recordedAt: "soon" }, now, db),
    await editInfoCore(U, f1Id, { detail: "" }, now, db),
  ], [err(CUSTOMER_INFO_EMPTY), err(CUSTOMER_INFO_LONG), err(RECORDED_FUTURE), err(WHEN_BAD), err(CUSTOMER_INFO_EMPTY)]);
  check("info: the refused ones wrote nothing", db.writes === wInfo);
  check("info: a time a minute ahead (a clock slightly fast) passes", (await addInfoCore(U, aId, { detail: "Just now", recordedAt: new Date(now.getTime() + 60_000).toISOString() }, now, db)).ok);
  const justNow = db.notes.at(-1)!;
  await editInfoCore(U, f2Id, { detail: "Prefers email, not calls" }, now, db);
  check("info: an edit with no time keeps when it was recorded", note(f2Id).detail === "Prefers email, not calls" && note(f2Id).recordedAt.toISOString() === "2026-10-01T00:00:00.000Z");
  await editInfoCore(U, f2Id, { detail: "Prefers email, not calls", recordedAt: "2026-10-02T00:00:00.000Z" }, now, db);
  check("info: an edit moves when it was recorded", note(f2Id).recordedAt.toISOString() === "2026-10-02T00:00:00.000Z");
  const withInfos = await loadCustomerPage(U, "bOn", aId, db);
  eq("info: their page lists them newest recorded first", withInfos.kind === "ok" ? withInfos.infos.map((i) => i.id) : null, [justNow.id, f1Id, f2Id]);
  eq("info: archive (again ok) takes it off the page; Undo (restore) brings it back as it was", [
    (await archiveInfoCore(U, justNow.id, now, db)).ok,
    (await archiveInfoCore(U, justNow.id, now, db)).ok,
    await loadCustomerPage(U, "bOn", aId, db).then((pg) => (pg.kind === "ok" ? pg.infos.map((i) => i.id) : null)),
    await editInfoCore(U, justNow.id, { detail: "x" }, now, db),
    (await restoreInfoCore(U, justNow.id, db)).ok,
    await loadCustomerPage(U, "bOn", aId, db).then((pg) => (pg.kind === "ok" ? pg.infos.map((i) => [i.id, i.detail]) : null)),
  ], [true, true, [f1Id, f2Id], err(CUSTOMER_INFO_GONE), true, [[justNow.id, "Just now"], [f1Id, "Likes A5 paper\nPays cash"], [f2Id, "Prefers email, not calls"]]]);
  await archiveInfoCore(U, justNow.id, now, db);
  eq("info: another user's info, an unknown one or a malformed id is gone", [await editInfoCore("u2", f1Id, { detail: "x" }, now, db), await archiveInfoCore(U, "ifNope", now, db), await restoreInfoCore(U, "../if", db)], [err(CUSTOMER_INFO_GONE), err(CUSTOMER_INFO_GONE), err(CUSTOMER_INFO_GONE)]);

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
  const afterArchive = await loadCustomerPage(U, "bOn", aId, db);
  check("log: an archived entry leaves the page; Undo (restore) brings it back, newest first", afterArchive.kind === "ok" && afterArchive.interactions.map((i) => i.id).join() === i1Id);
  await restoreInteractionCore(U, i2Id, db);
  const restored = await loadCustomerPage(U, "bOn", aId, db);
  eq("log: newest first", restored.kind === "ok" ? restored.interactions.map((i) => [i.id, i.action]) : null, [[i2Id, "COMPLAINT"], [i1Id, "CREDIT_CHECK"]]);
  const i3 = await addInteractionCore(U, aId, { at: "2026-10-12T02:00:00.000Z", action: "CALL", brief: "rang back" }, db);
  db.log.push({ id: "inOld", userId: U, customerId: aId, at: new Date("2026-10-01T00:00:00.000Z"), action: "LEGACY_THING", brief: "", archivedAt: null, createdAt: 0 });
  const withCall = await loadCustomerPage(U, "bOn", aId, db);
  eq("log: a Call is an entry like any other; an action outside the list is left out, never shown blank", withCall.kind === "ok" ? withCall.interactions.map((i) => i.action) : null, ["CALL", "COMPLAINT", "CREDIT_CHECK"]);
  check("log: the new entry was written", i3.ok);

  // Their scheduled tasks (ScheduledTask; scheduled-tasks-server writes them): the counts and their page read them.
  const st = (id: string, customerId: string, dueAt: string, over: Partial<ScheduledView & { archivedAt: Date | null }> = {}) => {
    const c = db.people.find((x) => x.id === customerId)!;
    db.scheduledRows.push({ id, userId: U, boardId: c.boardId, dueAt, allDay: false, title: id, detail: null, channel: "CALL", remind: true, remindSentAt: null, doneAt: null, customer: { id: c.id, number: c.number, name: c.name, phone: c.phone }, archivedAt: null, ...over });
  };
  st("stOver", aId, "2026-10-11T22:00:00.000Z");
  st("stLater", aId, "2026-10-14T00:00:00.000Z");
  st("stDone", aId, "2026-10-10T00:00:00.000Z", { doneAt: "2026-10-10T01:00:00.000Z" });
  st("stArch", aId, "2026-10-11T00:00:00.000Z", { archivedAt: now });

  // The reads.
  const list = await loadCustomersPage(U, "bOn", now, db);
  check(
    "list page: the tab's kept customers by ID with their due counts, the archived apart, IDs not all numbers (no suggestion)",
    list.kind === "ok" && list.customers.map((c) => c.number).join() === "13,a-12,A-12b" && list.customers.find((c) => c.id === aId)?.due === 1 && list.customers.find((c) => c.id === aId)?.overdue === 1 && list.numeric === false && list.suggestion === null,
    JSON.stringify(list)
  );
  eq(
    "list page: a row's quiet subtitle is the first line of their newest kept info (none without one)",
    list.kind === "ok" ? [list.customers.find((c) => c.id === aId)?.info, list.customers.find((c) => c.id === bId)?.info] : null,
    ["Likes A5 paper", null]
  );
  eq("list page: an archived tab, a list switched off, another user's tab", [(await loadCustomersPage(U, "bArch", now, db)).kind, (await setCrmCore(U, "bOn", false, db)).ok && (await loadCustomersPage(U, "bOn", now, db)).kind, (await loadCustomersPage(U, "bTheirs", now, db)).kind], ["archived", "off", "gone"]);
  await setCrmCore(U, "bOn", true, db);
  const numericDb = new FakeCrm();
  numericDb.boards.push({ id: "bN", userId: U, name: "Shop", archivedAt: null, crmOn: true });
  for (const n of ["0007", "0041", "12"]) await createCustomerCore(U, "bN", person(n), numericDb);
  const numericList = await loadCustomersPage(U, "bN", now, numericDb);
  eq("list page: numeric IDs get the numeric keyboard and the next ID", numericList.kind === "ok" ? [numericList.numeric, numericList.suggestion] : null, [true, "0042"]);
  const page = await loadCustomerPage(U, "bOn", aId, db);
  eq(
    "customer page: their scheduled tasks, open soonest first, then the done ones (an archived one is not theirs to show)",
    page.kind === "ok" ? [page.tasks.map((t) => t.id), page.customer.nickname] : null,
    [["stOver", "stLater", "stDone"], "Al"]
  );
  check("customer page: no call backs list (their call backs are scheduled tasks and log entries now)", page.kind === "ok" && !("callBacks" in page));
  eq("customer page: a customer opened under another tab's path, or unknown, is gone", [(await loadCustomerPage(U, "bN", aId, db)).kind, (await loadCustomerPage(U, "bOn", "nope", db)).kind, (await loadCustomerPage("u2", "bOn", aId, db)).kind], ["gone", "gone", "gone"]);
  eq("the work frame's Customers count: their scheduled tasks due by tonight, overdue included", await customerDueCountCore(U, "bOn", now, db), { ok: true, value: { due: 1, overdue: 1 } });
  check("list page: each customer's latest activity (their last change or newest log entry: the search's tie-break)", list.kind === "ok" && (list.customers.find((c) => c.id === aId)?.activity ?? 0) >= new Date("2026-10-12T01:00:00.000Z").getTime());
}

// ── 3. The wiring ──────────────────────────────────────────────────────────
function wiring() {
  console.log("— actions, routes, shell, the work frame, the sheets —");
  const actions = code("src/app/actions/customers.ts");
  check("actions: a 'use server' module", read("src/app/actions/customers.ts").trimStart().startsWith('"use server";'));
  const exported = [...actions.matchAll(/export async function (\w+)\(([^)]*)\)[^{]*\{([\s\S]*?)\n\}/g)].map((m) => ({ name: m[1], body: m[3] }));
  eq(
    "actions: the tab's switch, customers, infos and interactions (their scheduled tasks are actions/scheduled-tasks.ts; the count is the work frame's, read on the server)",
    exported.map((e) => e.name),
    [
      "setCrm",
      "createCustomer",
      "editCustomer",
      "archiveCustomer",
      "restoreCustomer",
      "addCustomerInfo",
      "editCustomerInfo",
      "archiveCustomerInfo",
      "restoreCustomerInfo",
      "addInteraction",
      "editInteraction",
      "archiveInteraction",
      "restoreInteraction",
    ]
  );
  check("actions: each goes through a core (the gate) with the current user, and never throws", exported.every((e) => /return run\("\w+", (opts|undefined), \(userId\) => \w+Core\(userId, /.test(e.body)) && /catch \(err\) \{[\s\S]*?return \{ ok: false, error:/.test(actions));

  const server = code("src/lib/customers-server.ts");
  const writeCores = ["createCustomerCore", "editCustomerCore", "archiveCustomerCore", "restoreCustomerCore", "addInfoCore", "editInfoCore", "archiveInfoCore", "restoreInfoCore", "addInteractionCore", "editInteractionCore", "archiveInteractionCore", "restoreInteractionCore", "customerDueCountCore"];
  const body = (name: string) => new RegExp(`export async function ${name}\\b[\\s\\S]*?\\n\\}`).exec(server)?.[0] ?? "";
  const ungated = writeCores.filter((n) => !/await (openBoard|openCustomer|openInfo|openInteraction)\(db, userId, /.test(body(n)));
  check("cores: every write opens through a gate (the tab is the user's, open, and keeps a list) before it writes", ungated.length === 0, ungated.join(", "));
  check("cores: the gate refuses a foreign, archived or list-off tab, in that order", /if \(!board \|\| board\.userId !== userId\) return fail\(WORK_BOARD_GONE\);\s*if \(board\.archivedAt\) return fail\(WORK_BOARD_ARCHIVED\);\s*if \(!board\.crmOn\) return fail\(CRM_OFF\);/.test(server));
  check("cores: a taken ID (the partial unique index's P2002) reads 'That ID is already used on this tab'", CUSTOMER_NUMBER_TAKEN === "That ID is already used on this tab" && (server.match(/if \(isNumberTaken\(err\)\) return fail\(CUSTOMER_NUMBER_TAKEN\);/g) ?? []).length === 2);
  check("cores: no customer task core is left (CustomerTask is the backfill's only)", !/addTaskCore|editTaskCore|setTaskDoneCore|archiveTaskCore|restoreTaskCore|prisma\.customerTask/.test(server));
  check("cores: customer and log writes clear the work frame's search index ('work'); archiving or restoring a customer the bell too ('life')", (server.match(/invalidate\("work"\);/g) ?? []).length === 3 && (server.match(/invalidate\("work", "life"\);/g) ?? []).length === 2);

  // No game writes: the customer code reads and writes the customer tables and the tab's crmOn, and reads scheduled tasks.
  const crmCode = ["src/lib/customers.ts", "src/lib/customers-server.ts", "src/app/actions/customers.ts", "src/components/customers/CustomersView.tsx", "src/components/customers/CustomerView.tsx", "src/components/customers/CustomerSheets.tsx", "src/components/customers/CrmGate.tsx"];
  // The work frame's own caches ('work': its search index; 'life': the bell) are not the game's.
  const workCaches = (src: string) => src.replace(/invalidate\("work"(, "life")?\);/g, "");
  const gameWords = crmCode.filter((f) => /activityEvent|ActivityEvent|ledger|\bxp\b|streak|invalidate\(|life-economy|lifeXp|awardXp|debt/i.test(workCaches(code(f)).replace(/[^\n]*"[^"\n]*"[^\n]*/g, (l) => l.replace(/"[^"\n]*"/g, '""'))));
  check("no game: nothing in the customer code names the ledger, XP, the streak, debt, or a game cache", gameWords.length === 0, gameWords.join(", "));
  const models = [...new Set([...server.matchAll(/prisma\.(\w+)\./g)].map((m) => m[1]))].sort();
  eq("no game: the cores touch only WorkBoard (crmOn), Customer, CustomerInfo, CustomerInteraction, and read ScheduledTask", models, ["customer", "customerInfo", "customerInteraction", "scheduledTask", "workBoard"]);
  check(
    "info: the list's subtitle read is one row per customer (DISTINCT ON, newest recorded), kept infos of kept customers on this tab, 160 characters",
    /SELECT DISTINCT ON \(i\."customerId"\) i\."customerId" AS "customerId", left\(i\."detail", 160\) AS "detail"/.test(server) &&
      /WHERE i\."userId" = \$\{userId\} AND i\."archivedAt" IS NULL AND c\."boardId" = \$\{boardId\} AND c\."archivedAt" IS NULL/.test(server) &&
      /ORDER BY i\."customerId", i\."recordedAt" DESC, i\."createdAt" DESC/.test(server)
  );
  check("no game: ScheduledTask is only read here; CallBack is never touched; WorkBoard only has crmOn written", !/prisma\.scheduledTask\.(create|update|upsert|delete)/.test(server) && !/prisma\.callBack/.test(server) && /prisma\.workBoard\.updateMany\(\{ where: \{ id: boardId, userId, archivedAt: null \}, data: \{ crmOn: on \} \}\)/.test(server) && !/prisma\.workBoard\.(create|delete|upsert)/.test(server));

  // Routes and their params (Next 16: Promises).
  const listPage = "src/app/today/work/[boardId]/customers/page.tsx";
  const onePage = "src/app/today/work/[boardId]/customers/[customerId]/page.tsx";
  check("routes: the list and a customer", existsSync(join(ROOT, listPage)) && existsSync(join(ROOT, onePage)));
  const lp = code(listPage);
  const op = code(onePage);
  check("route /customers: params awaited, one read, an unknown tab 404s, the tab's name as the eyebrow", /params: Promise<\{ boardId: string \}>/.test(lp) && /await params/.test(lp) && /loadCustomersPage\(getCurrentUserId\(\), boardId, new Date\(\)\)/.test(lp) && /if \(page\.kind === "gone"\) notFound\(\);/.test(lp) && /<ShellTitle eyebrow=\{page\.board\.name\} title="Customers" \/>/.test(lp));
  check(
    "route /customers/[customerId]: the tap URL's params and ?task= (a scheduled task's id, or an old customer task's: resolveTaskParam), the task highlighted, the customer's name as the title",
    /params: Promise<\{ boardId: string; customerId: string \}>/.test(op) &&
      /searchParams: Promise<\{ \[key: string\]: string \| string\[\] \| undefined \}>/.test(op) &&
      /loadCustomerPage\(getCurrentUserId\(\), boardId, customerId\)/.test(op) &&
      /const asked = taskParamOf\(query\[TASK_PARAM\]\);/.test(op) &&
      /asked \? resolveTaskParam\(getCurrentUserId\(\), asked\)\.catch\(\(\) => null\) : Promise\.resolve\(null\)/.test(op) &&
      /highlightTask=\{asked \? \(focus\?\.id \?\? asked\) : null\}/.test(op) &&
      /<ShellTitle eyebrow=\{page\.board\.name\} title=\{page\.customer\.name\} \/>/.test(op)
  );
  const view = code("src/components/customers/CustomerView.tsx");
  check("customer page: their tasks are the Agenda's rows; the highlighted one is marked and scrolled into view (a done one opens its fold)", /highlighted=\{t\.id === highlightTask\}/.test(view) && /data-hl=\{highlighted \? "" : undefined\}/.test(code("src/components/work/ScheduledRow.tsx")) && /document\.getElementById\(taskAnchorId\(highlightTask\)\)/.test(view) && /scrollIntoView\(\{ block: "center" \}\)/.test(view) && /open=\{hlTask\?\.doneAt \? true : undefined\}/.test(view) && /openScheduledSheet\(\{ customerId: customer\.id \}\)/.test(view));
  check("customer page: the phone is a tap-to-call link (tel:), a 44 px button", /<a className="btn btn-secondary btn-block crm-call" href=\{phoneHref\(customer\.phone\)\}>/.test(view));
  check("customer page: archiving an entry, or a scheduled task (in its sheet), offers Undo", /title: "Entry archived"[\s\S]*?label: "Undo", onAction: \(\) => undo\(\(\) => restoreInteraction\(e\.id/.test(view) && /title: "Scheduled task archived"[\s\S]*?label: "Undo", onAction: \(\) => void call\(\(\) => restoreScheduledTask\(edit\.id/.test(code("src/components/work/ScheduledTaskSheet.tsx")));
  const list = code("src/components/customers/CustomersView.tsx");
  check("list page: the search is live by ID or name (the numeric keyboard while IDs are numbers), Enter opens the top result", /inputMode=\{numericKeys \? "numeric" : "text"\}/.test(list) && /const pick = topMatch\(search\);/.test(list) && /router\.push\(customerHref\(board\.id, pick\.entry\.id\)\)/.test(list) && /matchCustomers\(index, query, \{ limit: SEARCH_LIST_MAX \}\)/.test(list));
  check("list page: the matches in one ranked list (name · ID marked); archived customers folded with Restore", /aria-label="Matching customers"/.test(list) && /<CustomerResult m=\{match\} \/>/.test(list) && /<details className="card crm-arch">/.test(list) && /restoreCustomer\(c\.id, \{ refresh: true \}\)/.test(list));
  check("list page: Add customer suggests the next ID (and opens on ?new=1, the work frame's New › Customer); a new customer opens on their page", /openAdd\(suggestion \?\? ""\)/.test(list) && /createCustomer\(board\.id, value, \{ refresh: true \}\)/.test(list) && /router\.push\(customerHref\(board\.id, res\.value\.id\)\)/.test(list) && /searchParams\.get\("new"\) === "1"/.test(list));
  const sheets = code("src/components/customers/CustomerSheets.tsx");
  check("sheets: the action chips are a radio group of the four, each a 44 px label", /CUSTOMER_ACTIONS\.map\(\(a\) => \(\s*<label key=\{a\} className="crm-chip">\s*<input\s+type="radio"/.test(sheets));
  check("sheets: date-time fields (an info, an entry), read in the user's zone (instantOfLocalInput); no customer task sheet", (sheets.match(/type="datetime-local"/g) ?? []).length === 2 && (sheets.match(/instantOfLocalInput\(v\.when\)/g) ?? []).length === 2 && !/TaskSheet/.test(sheets));
  check(
    "sheets: an info's detail (1000 at most) and 'Recorded at' (not ahead of now by more than a minute; left out while untouched)",
    /label="Recorded at"/.test(sheets) && /cleanInfoDetail\(v\.detail\)/.test(sheets) && /at\.getTime\(\) > Date\.now\(\) \+ RECORDED_AHEAD_MS/.test(sheets) && /onSave\(untouched \? \{ detail: detail\.value \} : \{ detail: detail\.value, recordedAt: at\.toISOString\(\) \}\)/.test(sheets)
  );
  check(
    "customer page: Info sits above Interactions; a row is the detail (three lines, then More) and 'Recorded …', tapping opens its sheet; archiving offers Undo",
    view.indexOf('aria-labelledby="crm-info-h"') > 0 &&
      view.indexOf('aria-labelledby="crm-info-h"') < view.indexOf('aria-labelledby="crm-log-h"') &&
      /className="crm-info-more" aria-expanded=\{expanded\}/.test(view) &&
      /infoRecordedLabel\(new Date\(info\.recordedAt\), now\)/.test(view) &&
      /title: "Info archived"[\s\S]*?label: "Undo", onAction: \(\) => undo\(\(\) => restoreCustomerInfo\(i\.id/.test(view)
  );
  check("customers.css: an info is clamped to three lines until More opens it", /\.crm-info-d \{[^}]*-webkit-line-clamp: 3;/.test(read("src/components/customers/customers.css")) && /\.crm-info-d\[data-open\] \{/.test(read("src/components/customers/customers.css")));
  check("list page: the newest info's first line is a quiet one-line subtitle", /\{c\.info && <span className="crm-row-info">\{c\.info\}<\/span>\}/.test(list) && /\.crm-row-info \{[^}]*text-overflow: ellipsis; white-space: nowrap;/.test(read("src/components/customers/customers.css")));
  const sts = code("src/components/work/ScheduledTaskSheet.tsx");
  check("the scheduled task sheet: the reminder is a switch, on by default for a new task", /<Switch checked=\{remind\} onChange=\{setRemind\} label="Reminder" \/>/.test(sts) && /useState\(edit\?\.remind \?\? true\)/.test(sts));

  // The work frame (2026-10-20; it replaced the tab card): Customers in its sub-navigation, the switch in its menu.
  const slot = code("src/components/work/WorkHeaderSlot.tsx");
  check(
    "work frame: Customers is a page of the tab while its list is on, with the due count (customerDueCountCore in the header's one wave)",
    workSubsOf({ id: "b1", crmOn: true }).some((s) => s.label === "Customers" && s.href === customersHref("b1")) &&
      !workSubsOf({ id: "b1" }).some((s) => s.label === "Customers") &&
      /customerDueCountCore\(userId, boardId\)\.catch\(\(\) => null\)/.test(slot) &&
      /customers: due\?\.ok \? dueChipText\(due\.value\) : null/.test(slot)
  );
  const menu = code("src/components/work/WorkTabMenu.tsx");
  check("work tab menu: the 'Customer list' switch (setCrm, refreshed); off hides, nothing deleted", /<h3>Customer list<\/h3>/.test(menu) && /setCrm\(board\.id, on, \{ refresh: true \}\)/.test(menu) && /<Switch checked=\{crmWant \?\? board\.crmOn\} onChange=\{\(on\) => toggle\("crm", on\)\} label="Customer list"/.test(menu) && /nothing is deleted/.test(read("src/components/work/WorkTabMenu.tsx")));

  // 44 px, tokens only, the layer order.
  const css = read("src/components/customers/customers.css");
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  check("customers.css: tokens only (no hex, rgb() or hsl()), in @layer components after the layer order", !/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(bare) && css.startsWith("@layer theme, base, components, art, effects, utilities;") && /@layer components \{/.test(bare));
  const rule = (sel: string) => new RegExp(`(?:^|\\})\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "m").exec(bare)?.[1] ?? "";
  const minH = (sel: string) => Number(/min-height:\s*(\d+)px/.exec(rule(sel))?.[1] ?? 0);
  const targets = [".crm-back", ".crm-kb", ".crm-input", ".crm-chip", ".crm-row", ".crm-arch > summary", ".crm-done > summary", ".crm-entry-btn", ".crm-arch-row", ".crm-info-btn", ".crm-info-more"];
  const small = targets.filter((s) => minH(s) < 44);
  check("customers.css: every control is a 44 px target (rows 52 to 56)", small.length === 0, small.map((s) => `${s} ${minH(s)}`).join(", "));
  const work = read("src/components/work/work.css").replace(/\/\*[\s\S]*?\*\//g, "");
  check("work.css: the sub-navigation's Customers link is a 44 px target", /\.wk-sub \{[^}]*min-height: 44px;/.test(work));

  // package.json and the shell.
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  check("package.json: life:check runs customers-check right after work-boards-check; customers:check runs it alone", pkg.scripts["life:check"].includes("tsx scripts/work-boards-check.ts && tsx scripts/customers-check.ts && ") && pkg.scripts["customers:check"] === "tsx scripts/customers-check.ts");
  check("nav: the work tab's path match covers its customer pages (workBoardIdOf, no section of its own)", /const work = workBoardIdOf\(pathname\);\s*if \(work\) return workBoardHref\(work\);/.test(code("src/components/shell/nav.ts")) && /const crm = customersPathOf\(path\);/.test(code("src/components/shell/nav.ts")));
}

/**
 * An old customer task reminder's tap URL (/today/work/<b>/customers/<c>?task=<customer task id>, already on devices and
 * in the bell before 2026-10-20) still lands: the page reads the path and ?task=, and resolves the id to the scheduled
 * task backfilled from it (scheduled-tasks-server resolveTaskParam: its own id, else legacyCustomerTaskId).
 */
async function tapUrls() {
  console.log("— an old reminder's tap URL —");
  const url = new URL(customerHref("b1", "c1", "t1"), "https://x.test");
  eq("tap URL: read back from the path and the query", [customersPathOf(url.pathname), taskParamOf(url.searchParams.get(TASK_PARAM))], [{ boardId: "b1", customerId: "c1" }, "t1"]);
  const srv = code("src/lib/scheduled-tasks-server.ts");
  check(
    "tap URL: ?task= resolves a scheduled task's id, else an old customer task's (legacyCustomerTaskId)",
    /const own = await db\.task\(userId, raw\);\s*if \(own\) return \{ id: own\.id, boardId: own\.boardId, customerId: own\.customerId \};\s*return db\.byLegacy\(userId, "customerTask", raw\);/.test(srv)
  );
  check("new reminders open the task on its tab's Agenda (/today/work/<b>?task=<id>), not the customer page", /url: scheduledTaskHref\(t\.boardId, t\.id\)/.test(code("src/lib/scheduled-tasks.ts")));
}

async function main() {
  await cores();
  await tapUrls();
  wiring();
  console.log(`customers-check: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
