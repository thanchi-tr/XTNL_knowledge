/**
 * Order lists (2026-10-14; migration 20261224000000_work_orders): a work
 * tab's own order list, switched on in the tab's menu (WorkBoard.ordersOn).
 * This check pins:
 *
 *   1. the rules (src/lib/work-orders.ts): the limits (name 1..60, contact
 *      <= 60, item 1..120, a calendar date, a customer ID <= 24), what a
 *      contact links to (tel:, mailto:, or words), the tick (orderedAt set
 *      and cleared, today filling an empty date), the order of the list, the
 *      To order · Ordered · All filters and their counts, the date's words
 *      (Overdue · 12 Oct), and the path;
 *   2. the cores (src/lib/work-orders-server.ts) against an in-memory store:
 *      the ordersOn gate (and the tab's owner, and archived tabs) on every
 *      action with nothing written; a new line dated today; a customer linked
 *      by ID (ignoring case, open customers of the same tab only, an unknown
 *      ID refused with a line) filling a blank name and contact; an edit that
 *      leaves the ID keeping its link; archive and restore; the pages' reads;
 *   3. the wiring: the actions, the route (loading, metadata, no <main>), the
 *      shell (the work tab stays current under /orders), the tab card's link
 *      and switch, a customer's Orders section, 44 px targets and tokens
 *      only, and no game write anywhere;
 *   4. the render: the list, a line's tick and contact links, the empty
 *      state, the gate and a customer's section, drawn to static markup.
 *
 * Pure: no database, no clock, no model.
 *
 *   npx tsx scripts/work-orders-check.ts
 */
import "./_no-model";
import Module from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ORDERS_OFF,
  ORDER_ARCHIVED,
  ORDER_CONTACT_LONG,
  ORDER_CUSTOMER_BAD,
  ORDER_CUSTOMER_LONG,
  ORDER_CUSTOMER_OFF,
  ORDER_DATE_BAD,
  ORDER_FILTERS,
  ORDER_FILTER_LABEL,
  ORDER_GONE,
  ORDER_ITEM_EMPTY,
  ORDER_ITEM_LONG,
  ORDER_NAME_EMPTY,
  ORDER_NAME_LONG,
  cleanOrderContact,
  cleanOrderCustomer,
  cleanOrderDate,
  cleanOrderItem,
  cleanOrderName,
  contactLinkOf,
  filterOrders,
  isOrderOverdue,
  matchOrderCustomer,
  orderCountsOf,
  orderCustomerUnknown,
  orderDateLabel,
  orderedPatch,
  ordersChipText,
  ordersHref,
  ordersPathOf,
  sortOrders,
  type OrderCustomerRef,
  type OrderView,
} from "../src/lib/work-orders";
import {
  addOrderCore,
  archiveOrderCore,
  editOrderCore,
  loadCustomerOrders,
  loadOrdersPage,
  orderCountCore,
  restoreOrderCore,
  setOrderedCore,
  setOrdersOnCore,
  type OrdersBoardRow,
  type WorkOrderDb,
  type WorkOrderFields,
  type WorkOrderRow,
} from "../src/lib/work-orders-server";
import { dateColumn, keyOfDateColumn, todayKey } from "../src/lib/life-day";
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

// ── 1. The rules ───────────────────────────────────────────────────────────
function rules() {
  console.log("— the rules (work-orders.ts) —");
  eq("name: spaces collapsed; empty refused; 60 pass, 61 refused", [cleanOrderName("  Jo   Bloggs "), cleanOrderName(" "), cleanOrderName("n".repeat(60)).ok, cleanOrderName("n".repeat(61))], [
    { ok: true, value: "Jo Bloggs" },
    err(ORDER_NAME_EMPTY),
    true,
    err(ORDER_NAME_LONG),
  ]);
  eq("contact: optional (empty is none), one line; 60 pass, 61 refused", [cleanOrderContact(""), cleanOrderContact(" jo@x.com\n"), cleanOrderContact("c".repeat(60)).ok, cleanOrderContact("c".repeat(61))], [
    { ok: true, value: null },
    { ok: true, value: "jo@x.com" },
    true,
    err(ORDER_CONTACT_LONG),
  ]);
  eq("item: spaces collapsed; empty refused; 120 pass, 121 refused", [cleanOrderItem(" Paper  A4 "), cleanOrderItem(""), cleanOrderItem("i".repeat(120)).ok, cleanOrderItem("i".repeat(121))], [
    { ok: true, value: "Paper A4" },
    err(ORDER_ITEM_EMPTY),
    true,
    err(ORDER_ITEM_LONG),
  ]);
  eq(
    "date: a real calendar day (YYYY-MM-DD, 2000..2099); empty or null is none; anything else refused",
    [cleanOrderDate("2026-10-14"), cleanOrderDate(""), cleanOrderDate(null), cleanOrderDate("2026-02-30"), cleanOrderDate("14/10/2026"), cleanOrderDate("1999-12-31"), cleanOrderDate(20261014)],
    [{ ok: true, value: "2026-10-14" }, { ok: true, value: null }, { ok: true, value: null }, err(ORDER_DATE_BAD), err(ORDER_DATE_BAD), err(ORDER_DATE_BAD), err(ORDER_DATE_BAD)]
  );
  eq("customer ID: optional, trimmed as typed; one line, 24 at most", [cleanOrderCustomer(""), cleanOrderCustomer(" A-12 "), cleanOrderCustomer("a\nb"), cleanOrderCustomer("x".repeat(24)).ok, cleanOrderCustomer("x".repeat(25))], [
    { ok: true, value: null },
    { ok: true, value: "A-12" },
    err(ORDER_CUSTOMER_BAD),
    true,
    err(ORDER_CUSTOMER_LONG),
  ]);
  eq("customer ID: the unknown one is said with the ID", orderCustomerUnknown("Q-9"), "No customer “Q-9” on this tab. Check the ID, or leave it empty.");

  // The contact's link.
  eq(
    "contact: a phone is a tel: link (digits and a leading +), an email a mailto: link, anything else words",
    ["+61 (2) 9000-1234", "0412 345 678", "02.9000.1234", "jo@example.com", "Jo at the shop", "123", "1234567890123456", "ring 0412 345 678", "a?cc=x@y.com", "jo@localhost"].map((c) => [contactLinkOf(c).kind, contactLinkOf(c).href]),
    [
      ["tel", "tel:+61290001234"],
      ["tel", "tel:0412345678"],
      ["tel", "tel:0290001234"],
      ["mail", "mailto:jo@example.com"],
      ["text", null],
      ["text", null],
      ["text", null],
      ["text", null],
      ["text", null],
      ["text", null],
    ]
  );

  // The tick.
  const now = new Date("2026-10-14T03:30:00.000Z");
  const before = new Date("2026-10-13T01:00:00.000Z");
  eq(
    "tick: ticked stamps orderedAt now and fills an empty date with today; a dated line keeps its date",
    [orderedPatch({ ordered: false, orderedAt: null, date: null }, true, now, "2026-10-14"), orderedPatch({ ordered: false, orderedAt: null, date: "2026-10-20" }, true, now, "2026-10-14")],
    [
      { ordered: true, orderedAt: now, date: "2026-10-14" },
      { ordered: true, orderedAt: now, date: "2026-10-20" },
    ]
  );
  eq(
    "tick: unticked clears orderedAt and keeps the date; ticked again keeps the first orderedAt",
    [orderedPatch({ ordered: true, orderedAt: before, date: "2026-10-12" }, false, now, "2026-10-14"), orderedPatch({ ordered: true, orderedAt: before, date: "2026-10-12" }, true, now, "2026-10-14")],
    [
      { ordered: false, orderedAt: null, date: "2026-10-12" },
      { ordered: true, orderedAt: before, date: "2026-10-12" },
    ]
  );

  // The order, the filters, the counts.
  const line = (id: string, o: { ordered?: boolean; orderedAt?: string | null; date?: string | null; createdAt: string }) => ({ id, ordered: o.ordered ?? false, orderedAt: o.orderedAt ?? null, date: o.date ?? null, createdAt: o.createdAt });
  const list = [
    line("a", { date: "2026-10-16", createdAt: "2026-10-01T00:00:01Z" }),
    line("b", { date: "2026-10-12", createdAt: "2026-10-01T00:00:02Z" }),
    line("c", { date: null, createdAt: "2026-10-01T00:00:00Z" }),
    line("d", { date: "2026-10-12", createdAt: "2026-10-01T00:00:01Z" }),
    line("e", { ordered: true, orderedAt: "2026-10-13T00:00:00Z", date: "2026-10-13", createdAt: "2026-09-01T00:00:00Z" }),
    line("f", { ordered: true, orderedAt: "2026-10-14T00:00:00Z", date: "2026-10-01", createdAt: "2026-09-02T00:00:00Z" }),
  ];
  const sorted = sortOrders(list);
  eq("sort: to order first by date (no date last), then the oldest added; ordered after, the newest ordered first", sorted.map((o) => o.id), ["d", "b", "a", "c", "f", "e"]);
  eq("filters: To order · Ordered · All, in that order", ORDER_FILTERS.map((f) => ORDER_FILTER_LABEL[f]), ["To order", "Ordered", "All"]);
  eq("filters: each shows its lines in the list's order", [filterOrders(sorted, "todo").map((o) => o.id), filterOrders(sorted, "ordered").map((o) => o.id), filterOrders(sorted, "all").length], [["d", "b", "a", "c"], ["f", "e"], 6]);
  eq("counts: each filter's count", orderCountsOf(list), { todo: 4, ordered: 2, all: 6 });
  eq("card chip: 'n to order'; none with nothing to order", [ordersChipText(0), ordersChipText(3)], [null, "3 to order"]);

  // The date's words (today is Wed 14 Oct 2026).
  const T = "2026-10-14";
  eq(
    "date words: Today, Tomorrow, Yesterday, else the day (and the year when not this one); none said",
    [orderDateLabel(T, T), orderDateLabel("2026-10-15", T), orderDateLabel("2026-10-13", T, true), orderDateLabel("2026-10-20", T), orderDateLabel("2026-10-12", T, true), orderDateLabel("2027-01-05", T), orderDateLabel(null, T)],
    ["Today", "Tomorrow", "Yesterday", "Tue 20 Oct", "Mon 12 Oct", "Tue 5 Jan 2027", "No date"]
  );
  eq("date words: a line not ordered whose date has gone by is overdue ('Overdue · 12 Oct')", [orderDateLabel("2026-10-12", T), orderDateLabel("2026-10-13", T), orderDateLabel("2025-12-30", T)], ["Overdue · 12 Oct", "Overdue · 13 Oct", "Overdue · 30 Dec 2025"]);
  eq(
    "overdue: not ordered and dated before today (an ordered line, today, or no date never is)",
    [isOrderOverdue({ ordered: false, date: "2026-10-13" }, T), isOrderOverdue({ ordered: true, date: "2026-10-13" }, T), isOrderOverdue({ ordered: false, date: T }, T), isOrderOverdue({ ordered: false, date: null }, T)],
    [true, false, false, false]
  );

  // A customer by their ID.
  const people = [{ id: "cu1", number: "A-12", name: "Acme Pty", phone: null }];
  eq("customer: matched by ID ignoring case; nothing typed or unknown is none", [matchOrderCustomer(people, " a-12 ")?.id, matchOrderCustomer(people, ""), matchOrderCustomer(people, "A-1")], ["cu1", null, null]);

  // The path and the shell.
  eq("path: /today/work/<board>/orders, read back", [ordersHref("b1"), ordersPathOf("/today/work/b1/orders"), ordersPathOf("/today/work/b1/orders/"), ordersPathOf("/today/work/b1"), ordersPathOf("/today/work/b1/customers"), ordersPathOf("/today/work/../orders")], [
    "/today/work/b1/orders",
    { boardId: "b1" },
    { boardId: "b1" },
    null,
    null,
    null,
  ]);
  eq(
    "shell: under /orders the work tab stays the current tab (never Board), on Tasks, with Tasks' capture",
    [workBoardIdOf("/today/work/b1/orders"), activeSub("/today/work/b1/orders"), sectionOf("/today/work/b1/orders"), captureModeOf("/today/work/b1/orders")],
    ["b1", "/today/work/b1", "tasks", "task"]
  );
  // The Office workspace (2026-10-20): the tab's index is its Agenda.
  eq("shell: the first-paint title (the page's ShellTitle then names the tab)", [titleFor("/today/work/b1/orders"), titleFor("/today/work/b1/customers"), titleFor("/today/work/b1")], [
    { eyebrow: "Work", title: "Orders" },
    { eyebrow: "Work", title: "Customers" },
    { eyebrow: "Work", title: "Agenda" },
  ]);
}

// ── 2. The cores, against an in-memory store ───────────────────────────────

type Person = OrderCustomerRef & { userId: string; boardId: string; archivedAt: Date | null };

class FakeOrders implements WorkOrderDb {
  boards: OrdersBoardRow[] = [];
  people: Person[] = [];
  rows: WorkOrderRow[] = [];
  writes = 0;
  seq = 0;
  private linked(r: WorkOrderRow) {
    const c = r.customerId ? this.people.find((p) => p.id === r.customerId) : null;
    return { ...r, customer: c ? { id: c.id, number: c.number } : null };
  }
  async board(userId: string, boardId: string) {
    const b = this.boards.find((x) => x.id === boardId && x.userId === userId);
    return b ? { ...b } : null;
  }
  async setOrdersOn(userId: string, boardId: string, on: boolean) {
    const b = this.boards.find((x) => x.id === boardId && x.userId === userId && x.archivedAt === null);
    if (!b) return 0;
    b.ordersOn = on;
    this.writes++;
    return 1;
  }
  async orders(userId: string, boardId: string) {
    return this.rows.filter((r) => r.userId === userId && r.boardId === boardId && r.archivedAt === null).map((r) => this.linked(r));
  }
  async order(userId: string, id: string) {
    const r = this.rows.find((x) => x.id === id && x.userId === userId);
    if (!r) return null;
    const board = this.boards.find((b) => b.id === r.boardId)!;
    return { ...this.linked(r), board: { ...board } };
  }
  async customers(userId: string, boardId: string) {
    return this.people.filter((p) => p.userId === userId && p.boardId === boardId && p.archivedAt === null).map(({ id, number, name, phone }) => ({ id, number, name, phone }));
  }
  async customerByNumber(userId: string, boardId: string, number: string) {
    const p = this.people.find((x) => x.userId === userId && x.boardId === boardId && x.archivedAt === null && x.number.toLowerCase() === number.toLowerCase());
    return p ? { id: p.id, number: p.number, name: p.name, phone: p.phone } : null;
  }
  async createOrder(userId: string, boardId: string, f: WorkOrderFields) {
    const row: WorkOrderRow = { id: `wo${++this.seq}`, userId, boardId, ...f, archivedAt: null, createdAt: new Date(Date.UTC(2026, 9, 1) + this.seq * 1000) };
    this.rows.push(row);
    this.writes++;
    return { ...row };
  }
  async updateOrder(userId: string, id: string, f: Partial<WorkOrderFields>) {
    const r = this.rows.find((x) => x.id === id && x.userId === userId && x.archivedAt === null);
    if (!r) return 0;
    Object.assign(r, f);
    this.writes++;
    return 1;
  }
  async setOrderArchived(userId: string, id: string, at: Date | null) {
    const r = this.rows.find((x) => x.id === id && x.userId === userId && (at ? x.archivedAt === null : x.archivedAt !== null));
    if (!r) return 0;
    r.archivedAt = at;
    this.writes++;
    return 1;
  }
  async todoCount(userId: string, boardId: string) {
    return this.rows.filter((r) => r.userId === userId && r.boardId === boardId && r.archivedAt === null && !r.ordered).length;
  }
  async customerOrders(userId: string, boardId: string, customerId: string) {
    return this.rows.filter((r) => r.userId === userId && r.boardId === boardId && r.customerId === customerId && r.archivedAt === null).map((r) => this.linked(r));
  }
}

async function cores() {
  console.log("— the cores (work-orders-server.ts) —");
  const U = "u1";
  const now = new Date("2026-10-14T03:30:00.000Z"); // 14:30 in Sydney
  const today = todayKey(now);
  const later = new Date("2026-10-14T05:00:00.000Z");
  const db = new FakeOrders();
  const at = (y: number) => new Date(Date.UTC(y, 0, 1));
  db.boards.push(
    { id: "bOn", userId: U, name: "Acme", archivedAt: null, crmOn: true, ordersOn: true },
    { id: "bNoCrm", userId: U, name: "Studio", archivedAt: null, crmOn: false, ordersOn: true },
    { id: "bOff", userId: U, name: "Shop", archivedAt: null, crmOn: true, ordersOn: false },
    { id: "bArch", userId: U, name: "Old", archivedAt: at(2026), crmOn: true, ordersOn: true },
    { id: "bTheirs", userId: "u2", name: "Theirs", archivedAt: null, crmOn: true, ordersOn: true }
  );
  db.people.push(
    { id: "cu1", userId: U, boardId: "bOn", number: "A-12", name: "Acme Pty", phone: "0412 345 678", archivedAt: null },
    { id: "cuGone", userId: U, boardId: "bOn", number: "Z-1", name: "Gone Co", phone: null, archivedAt: at(2026) },
    { id: "cuShop", userId: U, boardId: "bOff", number: "C-3", name: "Shop Customer", phone: null, archivedAt: null },
    { id: "cuT", userId: "u2", boardId: "bTheirs", number: "A-12", name: "Their Acme", phone: null, archivedAt: null }
  );
  const row = (id: string) => db.rows.find((r) => r.id === id)!;
  const idOf = (r: { ok: boolean; value?: { id: string } }) => (r.ok && r.value ? r.value.id : "");

  // The switch.
  eq("switch: on and off on an open tab; an archived tab, another user's, or a malformed id is refused", [
    await setOrdersOnCore(U, "bOff", true, db),
    await setOrdersOnCore(U, "bOff", false, db),
    await setOrdersOnCore(U, "bArch", false, db),
    await setOrdersOnCore(U, "bTheirs", true, db),
    await setOrdersOnCore(U, "../x", true, db),
  ], [{ ok: true, value: { ordersOn: true } }, { ok: true, value: { ordersOn: false } }, err(WORK_BOARD_ARCHIVED), err(WORK_BOARD_GONE), err(WORK_BOARD_GONE)]);

  // A new line.
  const a = await addOrderCore(U, "bOn", { name: "  Jo   Bloggs ", contact: " jo@example.com ", item: " Paper  A4 x5 " }, now, db);
  const aId = idOf(a);
  const ar = row(aId);
  check(
    "add: cleaned and stored, dated today (the life day), not ordered, no customer",
    a.ok && ar.name === "Jo Bloggs" && ar.contact === "jo@example.com" && ar.item === "Paper A4 x5" && ar.date?.getTime() === dateColumn(today).getTime() && ar.ordered === false && ar.orderedAt === null && ar.customerId === null,
    JSON.stringify(ar)
  );
  const noDate = await addOrderCore(U, "bOn", { name: "Bo", item: "Ink", date: "" }, now, db);
  const dated = await addOrderCore(U, "bOn", { name: "Cy", item: "Toner", date: "2026-10-20" }, now, db);
  check("add: an empty date is none; a picked date is kept", row(idOf(noDate)).date === null && keyOfDateColumn(row(idOf(dated)).date as Date) === "2026-10-20");
  const tickedNoDate = await addOrderCore(U, "bOn", { name: "Di", item: "Staples", date: "", ordered: true }, now, db);
  const tickedDated = await addOrderCore(U, "bOn", { name: "Ed", item: "Pens", date: "2026-10-01", ordered: true }, now, db);
  check(
    "add: ticked ordered, it is stamped now; with no date it takes today, a picked date stays",
    row(idOf(tickedNoDate)).orderedAt?.getTime() === now.getTime() && keyOfDateColumn(row(idOf(tickedNoDate)).date as Date) === today && keyOfDateColumn(row(idOf(tickedDated)).date as Date) === "2026-10-01" && row(idOf(tickedDated)).ordered
  );
  const w0 = db.writes;
  eq("add: the limits hold in the core too, before any write", [
    await addOrderCore(U, "bOn", { name: "Jo", item: "" }, now, db),
    await addOrderCore(U, "bOn", { name: "n".repeat(61), item: "x" }, now, db),
    await addOrderCore(U, "bOn", { name: "Jo", item: "x", date: "2026-13-01" }, now, db),
    await addOrderCore(U, "bOn", { name: "Jo", item: "x", contact: "c".repeat(61) }, now, db),
    await addOrderCore(U, "bOn", { name: "", item: "x" }, now, db),
  ], [err(ORDER_ITEM_EMPTY), err(ORDER_NAME_LONG), err(ORDER_DATE_BAD), err(ORDER_CONTACT_LONG), err(ORDER_NAME_EMPTY)]);
  check("add: a refused line writes nothing", db.writes === w0);

  // A customer by their ID: ignoring case, open customers of THIS tab only; fills a blank name and contact.
  const linked = await addOrderCore(U, "bOn", { item: "Brochures", customer: " a-12 " }, now, db);
  const lr = row(idOf(linked));
  check("customer: linked by ID ignoring case; a blank name and contact come from the customer", linked.ok && lr.customerId === "cu1" && lr.name === "Acme Pty" && lr.contact === "0412 345 678", JSON.stringify(lr));
  const typedName = await addOrderCore(U, "bOn", { item: "Flyers", name: "Bob at Acme", customer: "A-12" }, now, db);
  check("customer: a name typed by hand is kept (only blanks are filled)", row(idOf(typedName)).name === "Bob at Acme" && row(idOf(typedName)).contact === "0412 345 678" && row(idOf(typedName)).customerId === "cu1");
  const w1 = db.writes;
  eq("customer: an unknown ID, another tab's customer, an archived customer, or another user's is refused with a line", [
    await addOrderCore(U, "bOn", { item: "x", name: "Jo", customer: "Q-9" }, now, db),
    await addOrderCore(U, "bOn", { item: "x", name: "Jo", customer: "C-3" }, now, db),
    await addOrderCore(U, "bOn", { item: "x", name: "Jo", customer: "z-1" }, now, db),
    await addOrderCore(U, "bTheirs", { item: "x", name: "Jo", customer: "A-12" }, now, db),
  ], [err(orderCustomerUnknown("Q-9")), err(orderCustomerUnknown("C-3")), err(orderCustomerUnknown("z-1")), err(WORK_BOARD_GONE)]);
  eq("customer: on a tab with no customer list an ID is refused; empty is fine", [(await addOrderCore(U, "bNoCrm", { item: "x", name: "Jo", customer: "A-12" }, now, db)), (await addOrderCore(U, "bNoCrm", { item: "x", name: "Jo", customer: "" }, now, db)).ok], [err(ORDER_CUSTOMER_OFF), true]);
  check("customer: the refused lines wrote nothing (one fine line on the tab with no list)", db.writes === w1 + 1);

  // Edits.
  const lId = idOf(linked);
  await editOrderCore(U, lId, { item: "Brochures (glossy)", name: "Acme Pty", contact: "0412 345 678" }, later, db);
  check("edit: the customer left out keeps the link; the date left out stays", row(lId).customerId === "cu1" && row(lId).item === "Brochures (glossy)" && keyOfDateColumn(row(lId).date as Date) === today);
  db.people.find((p) => p.id === "cu1")!.archivedAt = now;
  check("edit: the same ID (any case) keeps the link even to a customer archived since", (await editOrderCore(U, lId, { item: "Brochures", name: "Acme Pty", customer: "A-12" }, later, db)).ok && row(lId).customerId === "cu1");
  eq("edit: a new link to an archived customer is refused", await editOrderCore(U, idOf(typedName), { item: "Flyers", name: "Bob", customer: "Z-1" }, later, db), err(orderCustomerUnknown("Z-1")));
  db.people.find((p) => p.id === "cu1")!.archivedAt = null;
  await editOrderCore(U, lId, { item: "Brochures", customer: "" }, later, db);
  check("edit: an empty customer ID unlinks the line; a name and contact left out stay", row(lId).customerId === null && row(lId).name === "Acme Pty" && row(lId).contact === "0412 345 678");
  await editOrderCore(U, lId, { item: "Brochures", contact: "" }, later, db);
  check("edit: an empty contact clears it", row(lId).contact === null && row(lId).name === "Acme Pty");
  await editOrderCore(U, aId, { item: "Paper A4 x5", name: "Jo Bloggs", contact: "jo@example.com", customer: "A-12" }, later, db);
  check("edit: a newly linked customer does not overwrite a name and contact typed in", row(aId).customerId === "cu1" && row(aId).name === "Jo Bloggs" && row(aId).contact === "jo@example.com");
  const tdId = idOf(tickedDated);
  await editOrderCore(U, tdId, { item: "Pens (blue)", name: "Ed" }, later, db);
  check("edit: the tick left out stays as it was (orderedAt kept)", row(tdId).ordered && row(tdId).orderedAt?.getTime() === now.getTime() && row(tdId).item === "Pens (blue)");
  await editOrderCore(U, tdId, { item: "Pens (blue)", name: "Ed", ordered: false }, later, db);
  check("edit: the Ordered switch off clears orderedAt", !row(tdId).ordered && row(tdId).orderedAt === null);

  // The tick.
  const ndId = idOf(noDate);
  eq("tick: ticked, ok", await setOrderedCore(U, ndId, true, now, db), { ok: true, value: { id: ndId, ordered: true } });
  check("tick: orderedAt now, and today fills the empty date", row(ndId).ordered && row(ndId).orderedAt?.getTime() === now.getTime() && keyOfDateColumn(row(ndId).date as Date) === today);
  const w2 = db.writes;
  await setOrderedCore(U, ndId, true, later, db);
  check("tick: ticking a ticked line again changes nothing (its orderedAt stays)", db.writes === w2 && row(ndId).orderedAt?.getTime() === now.getTime());
  await setOrderedCore(U, ndId, false, later, db);
  check("tick: unticked clears orderedAt; the date stays", !row(ndId).ordered && row(ndId).orderedAt === null && keyOfDateColumn(row(ndId).date as Date) === today);
  const dId = idOf(dated);
  await setOrderedCore(U, dId, true, later, db);
  check("tick: a dated line keeps its date", keyOfDateColumn(row(dId).date as Date) === "2026-10-20" && row(dId).ordered);

  // Archive and restore.
  eq("archive: ok, and again ok", [await archiveOrderCore(U, dId, now, db), await archiveOrderCore(U, dId, now, db)], [{ ok: true, value: { id: dId } }, { ok: true, value: { id: dId } }]);
  check("archive: the line leaves the list (it is kept)", row(dId).archivedAt !== null && !(await db.orders(U, "bOn")).some((r) => r.id === dId));
  eq("archive: an archived line takes no edit and no tick", [await editOrderCore(U, dId, { item: "x", name: "y" }, now, db), await setOrderedCore(U, dId, false, now, db)], [err(ORDER_ARCHIVED), err(ORDER_ARCHIVED)]);
  eq("restore (Undo): it comes back as it was; a kept line restores to itself", [await restoreOrderCore(U, dId, db), await restoreOrderCore(U, dId, db)], [{ ok: true, value: { id: dId } }, { ok: true, value: { id: dId } }]);
  check("restore: ordered and dated as before", row(dId).archivedAt === null && row(dId).ordered && keyOfDateColumn(row(dId).date as Date) === "2026-10-20");

  // The ordersOn gate, on every action, and nothing written.
  db.rows.push({ id: "woOff", userId: U, boardId: "bOff", name: "Kept", contact: null, item: "Kept item", ordered: false, orderedAt: null, date: null, customerId: null, archivedAt: null, createdAt: now });
  const w3 = db.writes;
  const offResults = [
    await addOrderCore(U, "bOff", { name: "Jo", item: "x" }, now, db),
    await editOrderCore(U, "woOff", { name: "Jo", item: "x" }, now, db),
    await setOrderedCore(U, "woOff", true, now, db),
    await archiveOrderCore(U, "woOff", now, db),
    await restoreOrderCore(U, "woOff", db),
    await orderCountCore(U, "bOff", db),
  ];
  check("ordersOn gate: every action on a tab whose list is off is refused (6 of 6), and nothing is written", offResults.every((r) => !r.ok && r.error === ORDERS_OFF) && db.writes === w3, JSON.stringify(offResults));
  check("switch: off hides and deletes nothing (the tab's line is kept as it was)", row("woOff").item === "Kept item" && row("woOff").archivedAt === null);
  const offBoard = db.boards.find((b) => b.id === "bOff")!;
  offBoard.ordersOn = true;
  offBoard.archivedAt = now;
  eq("gate: a tab archived since is refused for its lines too", [await setOrderedCore(U, "woOff", true, now, db), await addOrderCore(U, "bArch", { name: "Jo", item: "x" }, now, db)], [err(WORK_BOARD_ARCHIVED), err(WORK_BOARD_ARCHIVED)]);
  offBoard.archivedAt = null;
  offBoard.ordersOn = false;
  db.rows.push({ id: "woT", userId: "u2", boardId: "bTheirs", name: "T", contact: null, item: "Theirs", ordered: false, orderedAt: null, date: null, customerId: null, archivedAt: null, createdAt: now });
  eq("gate: another user's tab or line is gone; a malformed id too", [
    await addOrderCore(U, "bTheirs", { name: "Jo", item: "x" }, now, db),
    await editOrderCore(U, "woT", { name: "Jo", item: "x" }, now, db),
    await setOrderedCore(U, "../wo", true, now, db),
    await archiveOrderCore(U, "<x>", now, db),
    await orderCountCore(U, "../b", db),
  ], [err(WORK_BOARD_GONE), err(ORDER_GONE), err(ORDER_GONE), err(ORDER_GONE), err(WORK_BOARD_GONE)]);
  check("gate: the refused writes changed nothing", db.writes === w3 && row("woT").item === "Theirs");

  // The reads.
  await addOrderCore(U, "bOn", { name: "Fay", item: "Glue", date: "" }, now, db);
  const page = await loadOrdersPage(U, "bOn", now, db);
  check(
    "page: the tab's kept lines, sorted (to order first, soonest date, no date last; ordered after, newest first), today, the tab's open customers",
    page.kind === "ok" &&
      page.today === today &&
      page.board.crmOn === true &&
      page.orders.map((o) => o.id).join() === sortOrders(page.orders).map((o) => o.id).join() &&
      page.orders.findIndex((o) => o.ordered) === page.orders.filter((o) => !o.ordered).length &&
      page.orders.filter((o) => !o.ordered).at(-1)?.item === "Glue" &&
      page.orders.filter((o) => o.ordered).map((o) => o.item).join() === "Toner,Staples" &&
      page.customers.map((c) => c.id).join() === "cu1",
    JSON.stringify(page)
  );
  eq(
    "page: a line's view (ISO instants, the date as its key, the customer's ID)",
    page.kind === "ok" ? (({ id, name, contact, item, ordered, orderedAt, date, customer }: OrderView) => ({ id, name, contact, item, ordered, orderedAt, date, customer }))(page.orders.find((o) => o.id === aId)!) : null,
    { id: aId, name: "Jo Bloggs", contact: "jo@example.com", item: "Paper A4 x5", ordered: false, orderedAt: null, date: today, customer: { id: "cu1", number: "A-12" } }
  );
  const noCrm = await loadOrdersPage(U, "bNoCrm", now, db);
  check("page: on a tab with no customer list, no customers are read", noCrm.kind === "ok" && noCrm.customers.length === 0 && noCrm.board.crmOn === false);
  eq("page: a list switched off, an archived tab, another user's, a malformed id", [(await loadOrdersPage(U, "bOff", now, db)).kind, (await loadOrdersPage(U, "bArch", now, db)).kind, (await loadOrdersPage(U, "bTheirs", now, db)).kind, (await loadOrdersPage(U, "../x", now, db)).kind], ["off", "archived", "gone", "gone"]);
  const todo = (await db.orders(U, "bOn")).filter((r) => !r.ordered).length;
  eq("the tab card's count: the kept lines not ordered yet", await orderCountCore(U, "bOn", db), { ok: true, value: { todo } });
  const theirs = await loadCustomerOrders(U, "bOn", "cu1", now, db);
  check("a customer's section: their kept lines on this tab only, sorted", theirs !== null && theirs.orders.length === 2 && theirs.orders.every((o) => o.customer?.id === "cu1") && theirs.today === today, JSON.stringify(theirs));
  eq("a customer's section: none where the tab's list is off, the tab is another user's, or the id is malformed", [await loadCustomerOrders(U, "bOff", "cuShop", now, db), await loadCustomerOrders("u2", "bOn", "cu1", now, db), await loadCustomerOrders(U, "bOn", "../c", now, db)], [null, null, null]);
}

// ── 3. The wiring ──────────────────────────────────────────────────────────
function wiring() {
  console.log("— actions, routes, shell, the work frame, a customer's page —");
  const actionsFile = "src/app/actions/work-orders.ts";
  const actions = code(actionsFile);
  check("actions: a 'use server' module", read(actionsFile).trimStart().startsWith('"use server";'));
  const exported = [...actions.matchAll(/export async function (\w+)\(([^)]*)\)[^{]*\{([\s\S]*?)\n\}/g)].map((m) => ({ name: m[1], body: m[3] }));
  // The count is read by the work frame's header on the server (orderCountCore), no longer by a client action.
  eq("actions: the tab's switch, add, edit, the tick, archive, restore", exported.map((e) => e.name), ["setOrdersOn", "addWorkOrder", "editWorkOrder", "setWorkOrderOrdered", "archiveWorkOrder", "restoreWorkOrder"]);
  check("actions: each goes through a core (the gate) with the current user, and never throws", exported.every((e) => /return run\("\w+", (opts|undefined), \(userId\) => \w+Core\(userId, /.test(e.body)) && /catch \(err\) \{[\s\S]*?return \{ ok: false, error:/.test(actions));
  check("actions: refresh only on a successful write that asked for it", /if \(res\.ok && opts\?\.refresh === true\) refresh\(\);/.test(actions));

  const serverFile = "src/lib/work-orders-server.ts";
  const server = code(serverFile);
  const body = (name: string) => new RegExp(`export async function ${name}\\b[\\s\\S]*?\\n\\}`).exec(server)?.[0] ?? "";
  const gated = ["addOrderCore", "editOrderCore", "setOrderedCore", "archiveOrderCore", "restoreOrderCore", "orderCountCore"];
  const ungated = gated.filter((n) => !/await (openBoard|openOrder)\(db, userId, /.test(body(n)));
  check("cores: every action opens through a gate (the tab is the user's, open, and keeps an order list) before it writes", ungated.length === 0, ungated.join(", "));
  check("cores: the gate refuses a foreign, archived or list-off tab, in that order", /if \(!board \|\| board\.userId !== userId\) return fail\(WORK_BOARD_GONE\);\s*if \(board\.archivedAt\) return fail\(WORK_BOARD_ARCHIVED\);\s*if \(!board\.ordersOn\) return fail\(ORDERS_OFF\);/.test(server));
  check("cores: a new customer link needs the tab's customer list, and an open customer of THIS tab by ID (ignoring case)", /if \(!board\.crmOn\) return fail\(ORDER_CUSTOMER_OFF\);\s*const found = await db\.customerByNumber\(userId, board\.id, typed\.value\);\s*if \(!found\) return fail\(orderCustomerUnknown\(typed\.value\)\);/.test(server) && /number: \{ equals: number, mode: "insensitive" \}/.test(server) && /prisma\.customer\.findFirst\(\{ where: \{ userId, boardId, archivedAt: null,/.test(server));
  check("cores: the tick goes through orderedPatch (orderedAt now, today for an empty date)", (server.match(/orderedPatch\(/g) ?? []).length === 2);

  // No game writes.
  const orderCode = [
    "src/lib/work-orders.ts",
    serverFile,
    actionsFile,
    "src/components/orders/OrdersView.tsx",
    "src/components/orders/OrderSheet.tsx",
    "src/components/orders/OrdersGate.tsx",
    "src/components/orders/CustomerOrders.tsx",
    "src/app/today/work/[boardId]/orders/page.tsx",
    "src/app/today/work/[boardId]/orders/loading.tsx",
  ];
  const gameWords = orderCode.filter((f) => /activityEvent|ActivityEvent|ledger|\bxp\b|streak|momentum|invalidate\(|life-economy|lifeXp|awardXp|recordActivity|debt/i.test(code(f).replace(/[^\n]*"[^"\n]*"[^\n]*/g, (l) => l.replace(/"[^"\n]*"/g, '""'))));
  check("no game: nothing in the order code names the ledger, XP, the streak, momentum, debt, or a game cache", gameWords.length === 0, gameWords.join(", "));
  const imports = orderCode.flatMap((f) => [...read(f).matchAll(/from "([^"]+)"/g)].map((m) => m[1]));
  const gameMods = imports.filter((m) => /activity|life-economy|momentum|streak|leveling|character|duty|settle|xp|grade/i.test(m));
  check("no game: no order module imports a game module", gameMods.length === 0, gameMods.join(", "));
  const models = [...new Set([...server.matchAll(/prisma\.(\w+)\./g)].map((m) => m[1]))].sort();
  eq("no game: the cores touch only WorkBoard (ordersOn), WorkOrder, and read Customer", models, ["customer", "workBoard", "workOrder"]);
  check(
    "no game: Customer is only read; WorkBoard only has ordersOn written",
    !/prisma\.customer\.(create|update|upsert|delete)/.test(server) && /prisma\.workBoard\.updateMany\(\{ where: \{ id: boardId, userId, archivedAt: null \}, data: \{ ordersOn: on \} \}\)/.test(server) && !/prisma\.workBoard\.(create|delete|upsert)/.test(server) && !/prisma\.workOrder\.delete/.test(server)
  );

  // The route.
  const dir = "src/app/today/work/[boardId]/orders";
  check("route /orders: page, loading skeleton, metadata, no <main>", existsSync(join(ROOT, dir, "page.tsx")) && existsSync(join(ROOT, dir, "loading.tsx")) && /export const metadata: Metadata = \{ title: "Orders" \};/.test(code(`${dir}/page.tsx`)) && !/<main\b/.test(code(`${dir}/page.tsx`)) && !/<main\b/.test(code(`${dir}/loading.tsx`)));
  const page = code(`${dir}/page.tsx`);
  check(
    "route /orders: params awaited (Next 16), one read, an unknown tab 404s, the tab's name as the eyebrow, the gate for an archived or list-off tab",
    /params: Promise<\{ boardId: string \}>/.test(page) &&
      /await params/.test(page) &&
      /loadOrdersPage\(getCurrentUserId\(\), boardId, new Date\(\)\)/.test(page) &&
      /if \(page\.kind === "gone"\) notFound\(\);/.test(page) &&
      /<ShellTitle eyebrow=\{page\.board\.name\} title="Orders" \/>/.test(page) &&
      /<OrdersGate board=\{page\.board\} kind=\{page\.kind\} \/>/.test(page) &&
      /export const dynamic = "force-dynamic";/.test(page)
  );
  const loading = code(`${dir}/loading.tsx`);
  check("route /orders: the skeleton says it is loading (aria-busy, a status line) and draws the list's shape", /aria-busy="true"/.test(loading) && /role="status"/.test(loading) && /className="card ord-head"/.test(loading) && /className="ord-row"/.test(loading));
  const gate = code("src/components/orders/OrdersGate.tsx");
  check("gate: 'Turn the order list on' (setOrdersOn, refreshed); an archived tab points to Settings", /Turn the order list on/.test(gate) && /setOrdersOn\(board\.id, true, \{ refresh: true \}\)/.test(gate) && /href="\/settings#work-tabs"/.test(gate));

  // The page's view and sheet.
  const view = code("src/components/orders/OrdersView.tsx");
  check("list: each line's tick is the 44 px Tick (a checkbox named for the item); tapping the line opens its sheet", /<Tick state=\{o\.ordered \? "done" : "open"\} label=\{`Ordered: \$\{o\.item\}`\} onClick=\{onTick\} \/>/.test(view) && /className="ord-edit" onClick=\{onOpen\} aria-haspopup="dialog"/.test(view));
  check("list: the contact is a tel: or mailto: link (contactLinkOf), else words", /const link = o\.contact \? contactLinkOf\(o\.contact\) : null;/.test(view) && /<a className="ord-contact" href=\{link\.href\}/.test(view));
  check("list: the date in words (orderDateLabel), overdue lines marked", /orderDateLabel\(o\.date, today, o\.ordered\)/.test(view) && /data-overdue=\{overdue \? "" : undefined\}/.test(view));
  check("list: the filters are a radio group of To order · Ordered · All with counts, To order first", /useState<OrderFilter>\("todo"\)/.test(view) && /ORDER_FILTERS\.map\(\(f\) => \(\s*<label key=\{f\} className="ord-filter">\s*<input\s+type="radio"/.test(view) && /<span className="ord-n">\{counts\[f\]\}<\/span>/.test(view));
  check("list: a tick shows at once (useOptimistic) and offers Undo; Archive offers Undo (restoreWorkOrder)", /useOptimistic\(orders,/.test(view) && /setWorkOrderOrdered\(o\.id, ordered, \{ refresh: true \}\)/.test(view) && /label: "Undo", onAction: \(\) => undo\(\(\) => setWorkOrderOrdered\(o\.id, false, \{ refresh: true \}\)\)/.test(view) && /title: "Order archived"[\s\S]*?label: "Undo", onAction: \(\) => undo\(\(\) => restoreWorkOrder\(o\.id, \{ refresh: true \}\)\)/.test(view));
  check("list: Add order opens the sheet dated today; an empty list invites the first order", /initial: \{ item: "", name: "", contact: "", date: today, ordered: false, customer: "" \}/.test(view) && /Nothing on the order list yet/.test(view));
  check("list: the Customer ID field only where the tab keeps a customer list (or the line is linked)", /customerField=\{board\.crmOn \|\| Boolean\(sheet\.order\?\.customer\)\}/.test(view));
  const sheet = code("src/components/orders/OrderSheet.tsx");
  check("sheet: a date field and the Ordered switch; every field checked with the server's clean*", /type="date"/.test(sheet) && /<Switch checked=\{v\.ordered\}/.test(sheet) && ["cleanOrderItem(", "cleanOrderName(", "cleanOrderContact(", "cleanOrderDate(", "cleanOrderCustomer("].every((c) => sheet.includes(c)));
  check("sheet: a typed customer ID that matches fills a blank name and contact; an unknown one is said", /matchOrderCustomer\(customers, value\)/.test(sheet) && /if \(!name\.trim\(\) \|\| \(was && name === was\.name\)\) name = now\.name;/.test(sheet) && /orderCustomerUnknown\(customer\.value\)/.test(sheet));

  // The work frame (2026-10-20; it replaced the tab card): Orders in its sub-navigation, the switch in its menu.
  const slot = code("src/components/work/WorkHeaderSlot.tsx");
  const header = code("src/components/work/WorkHeader.tsx");
  check(
    "work frame: Orders is a page of the tab while its list is on, with 'n to order' (orderCountCore in the header's one wave)",
    workSubsOf({ id: "b1", ordersOn: true }).some((s) => s.label === "Orders" && s.href === "/today/work/b1/orders") &&
      !workSubsOf({ id: "b1" }).some((s) => s.label === "Orders") &&
      /orderCountCore\(userId, boardId\)\.catch\(\(\) => null\)/.test(slot) &&
      /orders: toOrder\?\.ok \? ordersChipText\(toOrder\.value\.todo\) : null/.test(slot) &&
      /\{s\.id === "orders" && counts\.orders && <span className="wk-sub-n">\{counts\.orders\}<\/span>\}/.test(header)
  );
  const menu = code("src/components/work/WorkTabMenu.tsx");
  check("work tab menu: the 'Order list' switch (setOrdersOn, refreshed); off hides, nothing deleted", /<h3>Order list<\/h3>/.test(menu) && /setOrdersOn\(board\.id, on, \{ refresh: true \}\)/.test(menu) && /<Switch checked=\{ordersWant \?\? board\.ordersOn\} onChange=\{\(on\) => toggle\("orders", on\)\} label="Order list"/.test(menu) && /ORDERS_SWITCH_NOTE = "[^"]*nothing is deleted\."/.test(read("src/components/work/WorkTabMenu.tsx")));
  // Phase 2 (2026-10-20): Deals (deals.ts) sits between them, so a customer's pipeline comes before what to order.
  eq("work frame: Orders sits right after Customers and their Deals", workSubsOf({ id: "b1", crmOn: true, ordersOn: true }).map((s) => s.label), ["Agenda", "Customers", "Deals", "Orders", "Tasks"]);
  const workPage = code("src/app/today/work/[boardId]/tasks/page.tsx");
  check("work page (Tasks): the tab's switches reach the board (ordersOn beside crmOn)", /work=\{\{ id: board\.id, name: board\.name, crmOn: board\.crmOn, ordersOn: board\.ordersOn \}\}/.test(workPage));
  const wbs = code("src/lib/work-boards-server.ts");
  // Phase 2: the follow-up alert's days (followUpDays) are read after it.
  check("work tab read: ordersOn is selected and returned (false when absent)", /const SELECT = \{[^}]*ordersOn: true(, followUpDays: true)? \} as const;/.test(wbs) && /ordersOn: row\.ordersOn \?\? false/.test(wbs));
  check("board: the work tab's view carries ordersOn", /ordersOn\?: boolean;/.test(code("src/components/today/TodayBoard.tsx")));
  const nav = code("src/components/shell/nav.ts");
  check("nav: the order list paints 'Orders' under 'Work' from the path (ordersPathOf); the work tab's match covers it", /if \(ordersPathOf\(path\)\) return \{ eyebrow: "Work", title: "Orders" \};/.test(nav) && /const work = workBoardIdOf\(pathname\);\s*if \(work\) return workBoardHref\(work\);/.test(nav));

  // A customer's page.
  const cp = code("src/app/today/work/[boardId]/customers/[customerId]/page.tsx");
  check("customer page: their orders read in the same wave (a failed read is no section), drawn only while the list is on", /Promise\.all\(\[\s*loadCustomerPage\(getCurrentUserId\(\), boardId, customerId\),\s*loadCustomerOrders\(getCurrentUserId\(\), boardId, customerId, now\)\.catch\(/.test(cp) && /orders && \(\s*<CustomerOrders/.test(cp));
  // Phase 2 (2026-10-20): the customer page is tabs; the section is the Orders tab, after History, shown only while the
  // tab keeps an order list (the page's read is null otherwise).
  const cv = code("src/components/customers/CustomerView.tsx");
  check(
    "customer page: the section is its own tab (Orders, after History; only while the list is on: a null read is no tab)",
    /\{tab === "orders" && orders\}/.test(cv) &&
      cv.indexOf('{tab === "history" && (') > 0 &&
      cv.indexOf('{tab === "history" && (') < cv.indexOf('{tab === "orders" && orders}') &&
      /const tabs = customerTabsOf\(\{ ordersOn \}\);/.test(cv) &&
      /const ordersOn = orders !== null;/.test(cp)
  );
  const co = code("src/components/orders/CustomerOrders.tsx");
  check("customer section: read-only lines, Add order with the customer fixed (name and phone filled), a link to the list", !/setWorkOrderOrdered|editWorkOrder|archiveWorkOrder/.test(co) && /fixedCustomer=\{customer\}/.test(co) && /name: customer\.name, contact: customer\.phone \?\? ""/.test(co) && /href=\{ordersHref\(board\.id\)\}/.test(co));

  // 44 px, tokens only, the layer order.
  const css = read("src/components/orders/orders.css");
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  check("orders.css: tokens only (no hex, rgb() or hsl()), in @layer components after the layer order", !/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(bare) && css.startsWith("@layer theme, base, components, art, effects, utilities;") && /@layer components \{/.test(bare));
  const rule = (sel: string) => new RegExp(`(?:^|\\})\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "m").exec(bare)?.[1] ?? "";
  const minH = (sel: string) => Number(/min-height:\s*(\d+)px/.exec(rule(sel))?.[1] ?? 0);
  const targets = [".ord-filter", ".ord-main", ".ord-edit", ".ord-contact", ".ord-mini-row", ".ord-all"];
  const small = targets.filter((s) => minH(s) < 44);
  check("orders.css: every control is a 44 px target (the filter, the line, its contact link, the links)", small.length === 0, small.map((s) => `${s} ${minH(s)}`).join(", "));
  check("orders.css: the line's text lets taps through to its button; the contact link takes its own", /\.ord-main > :not\(\.ord-edit\) \{ position: relative; pointer-events: none; \}/.test(bare) && /\.ord-contact \{[^}]*pointer-events: auto;/.test(bare));

  // package.json.
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  check("package.json: life:check runs work-orders-check right after customers-check; work-orders:check runs it alone", pkg.scripts["life:check"].includes("tsx scripts/customers-check.ts && tsx scripts/work-orders-check.ts && ") && pkg.scripts["work-orders:check"] === "tsx scripts/work-orders-check.ts");
}

// ── 4. The render ──────────────────────────────────────────────────────────
async function render() {
  console.log("— the render (static markup) —");
  const M = Module as unknown as { _load: (req: string, parent: unknown, isMain: boolean) => unknown; _extensions: Record<string, (m: { exports: unknown }) => void> };
  const load = M._load;
  M._extensions[".css"] = (m) => {
    m.exports = {};
  };
  M._load = function (req: string, parent: unknown, isMain: boolean) {
    if (req === "next/navigation") return { useRouter: () => ({ refresh() {}, push() {}, replace() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/today/work/b1/orders" };
    return load.call(this, req, parent, isMain);
  };
  try {
    const { OrdersView } = await import("../src/components/orders/OrdersView");
    const { OrdersGate } = await import("../src/components/orders/OrdersGate");
    const { CustomerOrders } = await import("../src/components/orders/CustomerOrders");
    const T = "2026-10-14";
    const o = (id: string, p: Partial<OrderView>): OrderView => ({ id, name: "Jo Bloggs", contact: null, item: "Item", ordered: false, orderedAt: null, date: T, createdAt: "2026-10-01T00:00:00.000Z", customer: null, ...p });
    const orders = sortOrders([
      o("o1", { item: "Paper A4 x5", contact: "0412 345 678", date: "2026-10-12", customer: { id: "cu1", number: "A-12" } }),
      o("o2", { item: "Toner", name: "Cy", contact: "cy@example.com" }),
      o("o3", { item: "Ink", name: "Di", contact: "front desk" }),
      o("o4", { item: "Pens", ordered: true, orderedAt: "2026-10-13T00:00:00.000Z", date: "2026-10-13" }),
    ]);
    const html = renderToStaticMarkup(createElement(OrdersView, { board: { id: "b1", name: "Acme", crmOn: true }, orders, customers: [], today: T }));
    check("render: the header counts what is left (3 to order, 1 overdue) and holds Add order", /<b>3<\/b> to order/.test(html) && /1 overdue/.test(html) && />Add order</.test(html));
    check("render: the filter chips with counts, To order checked", /To order<span class="ord-n">3<\/span>/.test(html) && /Ordered<span class="ord-n">1<\/span>/.test(html) && /All<span class="ord-n">4<\/span>/.test(html) && /checked="" value="todo"/.test(html));
    check("render: To order shows its three lines (the ordered one hidden), soonest first", (html.match(/<li class="ord-row"/g) ?? []).length === 3 && !html.includes(">Pens<") && html.indexOf("Paper A4 x5") < html.indexOf("Toner"));
    check("render: each line's tick is a checkbox named for its item", /role="checkbox" aria-checked="false" aria-label="Ordered: Paper A4 x5"/.test(html));
    check("render: a phone is a tap to call, an email a tap to email, other words stay words", /<a class="ord-contact" href="tel:0412345678" aria-label="Call Jo Bloggs: 0412 345 678">0412 345 678<\/a>/.test(html) && /href="mailto:cy@example.com"/.test(html) && /<span>front desk<\/span>/.test(html));
    check("render: the date in words, an overdue line marked; a linked customer's ID shown", /data-overdue=""/.test(html) && />Overdue · 12 Oct</.test(html) && />Today</.test(html) && />#A-12</.test(html));
    check("render: each line opens its sheet (a button named for the line)", /class="ord-edit" aria-haspopup="dialog" aria-label="Edit order: Paper A4 x5, for Jo Bloggs"/.test(html));
    check("render: no <main> (the shell owns it)", !/<main\b/.test(html));
    const empty = renderToStaticMarkup(createElement(OrdersView, { board: { id: "b1", name: "Acme", crmOn: false }, orders: [], customers: [], today: T }));
    check("render: an empty list invites the first order (no filter yet)", /Nothing on the order list yet/.test(empty) && /Add the first order/.test(empty) && !/ord-filters/.test(empty));
    const gateHtml = renderToStaticMarkup(createElement(OrdersGate, { board: { id: "b1", name: "Acme" }, kind: "off" }));
    check("render: the gate says the list is off and turns it on", /The order list is off on Acme/.test(gateHtml) && /Turn the order list on/.test(gateHtml) && /Nothing was deleted/.test(gateHtml));
    const archHtml = renderToStaticMarkup(createElement(OrdersGate, { board: { id: "b1", name: "Acme" }, kind: "archived" }));
    check("render: an archived tab says so and points to Settings", /Acme is archived/.test(archHtml) && /Open Settings/.test(archHtml));
    const custHtml = renderToStaticMarkup(createElement(CustomerOrders, { board: { id: "b1", name: "Acme" }, customer: { id: "cu1", number: "A-12", name: "Acme Pty", phone: null }, orders: [orders[0], orders[3]], today: T }));
    check("render: a customer's section lists their lines read-only (no tick), with Add order and the list's link", /Orders<\/h2>/.test(custHtml) && /1 to order/.test(custHtml) && />To order</.test(custHtml) && />Ordered</.test(custHtml) && !/role="checkbox"/.test(custHtml) && /href="\/today\/work\/b1\/orders"/.test(custHtml) && />Add order</.test(custHtml));
  } finally {
    M._load = load;
  }
}

async function main() {
  rules();
  await cores();
  wiring();
  await render();
  console.log(`work-orders-check: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
