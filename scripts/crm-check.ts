/**
 * The customer list's Phase 2 (2026-10-20; migration 20261228000000_crm): customer status, tags and details, the
 * customer page's tabs, the Check log, task collections, the deals pipeline and follow-up alerts. No database, no
 * network, no browser: the cores run against in-memory dbs, the SQL is read as text, the components render to static
 * markup with next/navigation stubbed.
 *
 *   npx tsx scripts/crm-check.ts      (npm run crm:check; ui:check runs it too)
 *
 * Covers:
 *   1. the rules (src/lib/crm.ts): the four statuses; tags (lowercase, ≤ 24, ≤ 8, the tab's recent ones offered);
 *      email, company, address; the list's status and tag filters; the customer page's tabs (?tab=, ?task= lands on
 *      Tasks, the roving keys); a check (Rate, Home, Work, Record at); a collection and its progress, and the grouping;
 *      follow-ups as truth tables (off, inactive, overdue, quiet for more than N days with nothing ahead, last contact);
 *   2. deals (src/lib/deals.ts): the stages and a move's closedAt, money formatting and parsing (AUD cents), the
 *      sheet's input, the pipeline and its totals, the day in words, a Won deal's order prefill, the paths;
 *   3. the search's secondary matches (company, email) after the name, the ID and the phone;
 *   4. the cores: crm-server (the follow-up alert, a status, checks, collections and their order gate, the reads),
 *      deals-server (create, edit, move, archive, Create order through the order list's core), scheduled-tasks-server's
 *      collection gate, customers-server's new fields;
 *   5. the migration and the schema: BEGIN/COMMIT, additive, the columns, the three tables (timestamptz), the CHECKs,
 *      the keys (board RESTRICT; a customer's own rows RESTRICT; a deal's customer and every order link SET NULL);
 *   6. the wiring: the routes, the actions, nav (Work · Deals), the header, the menu, the sheet, the caches, no game;
 *   7. the UI pins: the tablist, the labels, 44 px targets, tokens only, the empty states, the renders;
 *   8. 344 px: the tab strip scrolls inside itself, the deals switch fits, Call and Text fit, the follow-up row wraps;
 *   9. the new tints: the status chip's and the collection chip's words legible in Night and Vellum.
 */
import "./_no-model";
import Module from "node:module";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CHECK_DATE_BAD,
  CHECK_DATE_FUTURE,
  CHECK_EMPTY,
  CHECK_FIELDS,
  CHECK_FIELD_MAX,
  CHECK_LABELS,
  CHECK_LONG,
  COLLECTION_ARCHIVED,
  COLLECTION_NAME_EMPTY,
  COLLECTION_NAME_LONG,
  COLLECTION_NAME_MAX,
  COLLECTION_NOTE_LONG,
  COLLECTION_ORDERS_OFF,
  COLLECTION_ORDER_BAD,
  CUSTOMER_ADDRESS_LONG,
  CUSTOMER_COMPANY_LONG,
  CUSTOMER_EMAIL_BAD,
  CUSTOMER_EMAIL_LONG,
  CUSTOMER_STATUSES,
  CUSTOMER_TABS,
  CUSTOMER_TAB_LABEL,
  DEFAULT_STATUS,
  FOLLOW_UP_BAD,
  FOLLOW_UP_CHOICES,
  FOLLOW_UP_DEFAULT,
  STATUS_BAD,
  STATUS_LABEL,
  TAGS_MANY,
  TAG_LONG,
  TAG_MAX,
  TAG_MAX_CHARS,
  cleanAddress,
  cleanCheckInput,
  cleanCollectionInput,
  cleanCompany,
  cleanEmail,
  cleanFollowUpDays,
  cleanStatus,
  cleanTags,
  collectionProgressOf,
  customerTabHref,
  customerTabOf,
  customerTabsOf,
  customersCountText,
  dayLabel,
  emailHref,
  filterCustomers,
  followUpCountText,
  followUpLabel,
  followUpLineOf,
  followUpOf,
  followUpTaskOf,
  followUpsOf,
  groupByCollection,
  lastContactAtOf,
  lastContactLineOf,
  nextTabIndex,
  normalizeTag,
  progressLabel,
  readStatus,
  recentTagsOf,
  sortChecks,
  statusCountsOf,
  statusFilterOf,
  statusOf,
  statusParamOf,
  tagCountsOf,
  tagFilterOf,
  tagSuggestionsOf,
  type CollectionView,
  type FollowUpFacts,
} from "../src/lib/crm";
import {
  DEALS_CRM_OFF,
  DEAL_ARCHIVED,
  DEAL_CLOSE_BAD,
  DEAL_CUSTOMER_ARCHIVED,
  DEAL_CUSTOMER_BAD,
  DEAL_CUSTOMER_GONE,
  DEAL_GONE,
  DEAL_HAS_ORDER,
  DEAL_NOTE_LONG,
  DEAL_NOT_WON,
  DEAL_STAGES,
  DEAL_STAGE_BAD,
  DEAL_STAGE_LABEL,
  DEAL_TITLE_EMPTY,
  DEAL_TITLE_LONG,
  MONEY_BAD,
  MONEY_LONG,
  MONEY_MAX_CENTS,
  MONEY_NEGATIVE,
  cleanDealInput,
  dealCloseLabel,
  dealStageOf,
  dealsHref,
  dealsPathOf,
  formatMoney,
  isDealOverdue,
  moneyInputOf,
  moveTargetsOf,
  nextSortOrder,
  openDealsLine,
  openDealsOf,
  orderPrefillOf,
  parseMoney,
  pipelineOf,
  stageParamOf,
  stagePatchOf,
  stageTotalLine,
  stageTotalsOf,
  type DealStage,
  type DealView,
} from "../src/lib/deals";
import { RANK, matchCustomers, prepareIndex, type CustomerIndexEntry } from "../src/lib/customer-search";
import {
  addCheckCore,
  archiveCheckCore,
  archiveCollectionCore,
  createCollectionCore,
  customerOrderOptionsCore,
  editCheckCore,
  editCollectionCore,
  followUpCountCore,
  loadCustomerCrm,
  loadFollowUps,
  restoreCheckCore,
  restoreCollectionCore,
  setCollectionClosedCore,
  setCustomerStatusCore,
  setFollowUpDaysCore,
  type CheckFields,
  type CheckRow,
  type CollectionRow,
  type CollectionWrite,
  type CrmCustomerRow,
  type CrmDb,
  type CrmTabRow,
  type OrderRefRow,
} from "../src/lib/crm-server";
import {
  archiveDealCore,
  createDealCore,
  createOrderFromDealCore,
  editDealCore,
  loadCustomerDeals,
  loadDealsPage,
  moveDealCore,
  restoreDealCore,
  type DealCustomerRow,
  type DealDb,
  type DealFields,
  type DealListRow,
  type DealTabRow,
  type DealWithBoard,
} from "../src/lib/deals-server";
import {
  createScheduledCore,
  editScheduledCore,
  scheduledViewOf,
  type DoneLog,
  type PatchWhere,
  type ScheduledBoardRow,
  type ScheduledCollectionRow,
  type ScheduledCustomerRow,
  type ScheduledDb,
  type ScheduledRow,
  type ScheduledWrite,
} from "../src/lib/scheduled-tasks-server";
import {
  SCHEDULED_COLLECTION_ARCHIVED,
  SCHEDULED_COLLECTION_BAD,
  SCHEDULED_COLLECTION_CLOSED,
  SCHEDULED_COLLECTION_GONE,
  SCHEDULED_COLLECTION_NO_CUSTOMER,
  SCHEDULED_COLLECTION_OTHER,
  cleanScheduledInput,
  type ScheduledView,
} from "../src/lib/scheduled-tasks";
import { customerFieldsOf } from "../src/lib/customers-server";
import { CRM_OFF, CUSTOMER_ARCHIVED, CUSTOMER_GONE } from "../src/lib/customers";
import { WORK_BOARD_ARCHIVED, WORK_BOARD_GONE } from "../src/lib/work-boards";
import { ORDERS_OFF } from "../src/lib/work-orders";
import { activeSub, titleFor, workSectionOf, workSubsOf } from "../src/components/shell/nav";
import { CRM_LAYOUT, WORK_LAYOUT, contentWidth, customerTabsWidth, dealSegmentWidth, dealSwitchFits, overviewCallsWidth, overviewValueWidth } from "../src/components/work/work-layout";
import { contrast, parseColor, wash, type Rgb } from "../src/app/dev/style/color-lab";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? `  — ${String(detail).slice(0, 400)}` : ""}`);
  }
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
/** Source without comments, so a pin never matches a sentence about the code. */
const code = (f: string) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const err = (error: string) => ({ ok: false, error });
const section = (t: string) => console.log(`— ${t} —`);

const TZ = "Australia/Sydney";
/** Tuesday 20 Oct 2026, 15:00 in Sydney (AEDT, UTC+11). */
const NOW = new Date("2026-10-20T04:00:00Z");
const TODAY = "2026-10-20";
const U = "u1";
const DAY = 86_400_000;
/** A wall-clock time in Sydney (AEDT from 4 Oct; AEST before), as an instant. */
const syd = (local: string) => new Date(`${local}:00${local < "2026-10-04" ? "+10:00" : "+11:00"}`);

// ── 1. The rules ────────────────────────────────────────────────────────────
function rules() {
  section("the rules (crm.ts)");
  // Status.
  eq("status: Lead → Prospect → Customer → Inactive, each a word; every customer before Phase 2 reads Customer", [CUSTOMER_STATUSES, CUSTOMER_STATUSES.map((s) => STATUS_LABEL[s]), DEFAULT_STATUS], [["LEAD", "PROSPECT", "CUSTOMER", "INACTIVE"], ["Lead", "Prospect", "Customer", "Inactive"], "CUSTOMER"]);
  eq("status: the four only (case kept); a stored stray reads as Customer", [statusOf("LEAD"), statusOf("lead"), statusOf(undefined), readStatus("ODD"), readStatus(undefined), readStatus("INACTIVE")], ["LEAD", null, null, "CUSTOMER", "CUSTOMER", "INACTIVE"]);
  eq("status: a sheet's empty is the default; a stray is refused with its line", [cleanStatus(undefined), cleanStatus(""), cleanStatus("PROSPECT"), cleanStatus("VIP")], [{ ok: true, value: "CUSTOMER" }, { ok: true, value: "CUSTOMER" }, { ok: true, value: "PROSPECT" }, err(STATUS_BAD)]);

  // Tags (the call backs' idiom, 781b49d callbacks.ts).
  eq("tags: lowercase, trimmed, spaces collapsed, no leading # or commas", [normalizeTag("  #NBN  100 "), normalizeTag("##Vip"), normalizeTag("a,b"), normalizeTag(7), normalizeTag("Café")], ["nbn 100", "vip", "a b", "", "café"]);
  eq("tags: cleaned, deduped in order, blanks dropped", cleanTags(["VIP", " vip ", "", "nbn", "#Referral"]), { ok: true, value: ["vip", "nbn", "referral"] });
  eq(`tags: one over ${TAG_MAX_CHARS} characters, or more than ${TAG_MAX}, is refused with its line`, [cleanTags(["x".repeat(25)]), cleanTags(Array.from({ length: TAG_MAX + 1 }, (_, i) => `t${i}`)), cleanTags(Array.from({ length: TAG_MAX }, (_, i) => `t${i}`)).ok, cleanTags("vip")], [err(TAG_LONG), err(TAGS_MANY), true, { ok: true, value: [] }]);
  const rows = [
    { tags: ["nbn", "vip"], activity: 5 },
    { tags: ["Referral", "nbn"], activity: 9 },
    { tags: ["vip", "slow payer"], activity: 1 },
    { tags: null, activity: 99 },
  ];
  eq("recent tags: the most recently active customer's first, each once", recentTagsOf(rows), ["referral", "nbn", "vip", "slow payer"]);
  eq("recent tags: capped", recentTagsOf(rows, 2), ["referral", "nbn"]);
  eq("suggestions: nothing typed, the newest; typed, those starting with it then those holding it; never one already on", [tagSuggestionsOf(["referral", "nbn", "vip", "nbn fibre"], "", ["vip"]), tagSuggestionsOf(["referral", "nbn", "vip", "fibre nbn", "nbn fibre"], "NB", []), tagSuggestionsOf(["a", "b", "c"], "", [], 2)], [["referral", "nbn", "nbn fibre"], ["nbn", "nbn fibre", "fibre nbn"], ["a", "b"]]);
  eq("tag counts: each tag once per customer, the most used first, then by name", tagCountsOf([{ tags: ["vip", "VIP", "nbn"] }, { tags: ["nbn"] }, { tags: ["b"] }, { tags: ["a"] }]), [{ tag: "nbn", count: 2 }, { tag: "a", count: 1 }, { tag: "b", count: 1 }, { tag: "vip", count: 1 }]);

  // More details.
  eq("email: optional; a plausible address; nothing that breaks a mailto:; ≤ 120", [cleanEmail(""), cleanEmail(" Jane@Acme.com.au "), cleanEmail("jane@acme"), cleanEmail("a b@c.com"), cleanEmail("x@y.com?cc=z"), cleanEmail(`${"a".repeat(115)}@b.com`)], [{ ok: true, value: null }, { ok: true, value: "Jane@Acme.com.au" }, err(CUSTOMER_EMAIL_BAD), err(CUSTOMER_EMAIL_BAD), err(CUSTOMER_EMAIL_BAD), err(CUSTOMER_EMAIL_LONG)]);
  eq("company: optional, one line, ≤ 80", [cleanCompany("  Acme   Pty\nLtd "), cleanCompany(""), cleanCompany("c".repeat(81))], [{ ok: true, value: "Acme Pty Ltd" }, { ok: true, value: null }, err(CUSTOMER_COMPANY_LONG)]);
  eq("address: optional, its lines kept (each trimmed, blanks dropped), ≤ 240", [cleanAddress(" 1 Main St \r\n\r\n  Newtown  NSW 2042 "), cleanAddress("   "), cleanAddress("a".repeat(241))], [{ ok: true, value: "1 Main St\nNewtown NSW 2042" }, { ok: true, value: null }, err(CUSTOMER_ADDRESS_LONG)]);
  eq("email: the tap to mail", emailHref(" jane@acme.com "), "mailto:jane@acme.com");

  // The list's filters.
  eq("filters: ?status= in lower case (any case read), anything else All; ?tag= normalized", [statusFilterOf("lead"), statusFilterOf("Prospect"), statusFilterOf(["inactive"]), statusFilterOf("vip"), statusFilterOf(null), statusParamOf("CUSTOMER"), statusParamOf("all"), tagFilterOf(" #VIP "), tagFilterOf(""), tagFilterOf("x".repeat(30))], ["LEAD", "PROSPECT", "INACTIVE", "all", "all", "customer", "", "vip", null, null]);
  const list = [
    { id: "a", status: "LEAD", tags: ["nbn"] },
    { id: "b", status: "CUSTOMER", tags: ["vip", "nbn"] },
    { id: "c", status: undefined, tags: [] },
    { id: "d", status: "INACTIVE", tags: ["vip"] },
  ];
  eq("filters: status, tag, both, and an unset status reads Customer", [filterCustomers(list, { status: "LEAD", tag: null }).map((c) => c.id), filterCustomers(list, { status: "all", tag: "vip" }).map((c) => c.id), filterCustomers(list, { status: "CUSTOMER", tag: "nbn" }).map((c) => c.id), filterCustomers(list, { status: "CUSTOMER", tag: null }).map((c) => c.id)], [["a"], ["b", "d"], ["b"], ["b", "c"]]);
  eq("filters: each status's count", statusCountsOf(list), { all: 4, LEAD: 1, PROSPECT: 0, CUSTOMER: 2, INACTIVE: 1 });

  // A customer's tabs.
  eq("tabs: Overview · Tasks · Check · Info · History · Orders · Deals", CUSTOMER_TABS.map((t) => CUSTOMER_TAB_LABEL[t]), ["Overview", "Tasks", "Check", "Info", "History", "Orders", "Deals"]);
  eq("tabs: Orders only while the tab keeps an order list", [customerTabsOf({ ordersOn: true }).length, customerTabsOf({ ordersOn: false })], [7, ["overview", "tasks", "check", "info", "history", "deals"]]);
  const on = { ordersOn: true };
  eq(
    "?tab=: a shown tab (any case); Orders while off, junk or none is Overview; ?task=<id> (a reminder's link) always lands on Tasks",
    [customerTabOf({ tab: "check" }, on), customerTabOf({ tab: "DEALS" }, on), customerTabOf({ tab: "orders" }, { ordersOn: false }), customerTabOf({ tab: "x" }, on), customerTabOf({}, on), customerTabOf({ tab: "info", task: "st1" }, on), customerTabOf({ task: "../x" }, on), customerTabOf({ tab: ["history", "info"] }, on)],
    ["check", "deals", "overview", "overview", "overview", "tasks", "overview", "history"]
  );
  eq("tab links: the bare page for Overview, else ?tab=", [customerTabHref("b1", "c1", "overview"), customerTabHref("b1", "c1", "check")], ["/today/work/b1/customers/c1", "/today/work/b1/customers/c1?tab=check"]);
  eq("the tablist's keys: → and ← wrap, Home and End jump, anything else is not the tablist's", [nextTabIndex("ArrowRight", 6, 7), nextTabIndex("ArrowLeft", 0, 7), nextTabIndex("Home", 4, 7), nextTabIndex("End", 1, 7), nextTabIndex("ArrowDown", 1, 7), nextTabIndex("ArrowRight", 0, 0)], [0, 6, 0, 6, null, null]);

  // A check.
  eq("check: the labels, exactly the user's", [CHECK_LABELS.rate, CHECK_LABELS.home, CHECK_LABELS.work, CHECK_LABELS.recordedAt, CHECK_FIELDS], ["Rate", "Home", "Work", "Record at", ["rate", "home", "work"]]);
  eq(
    "check: each field one line (spaces collapsed); one is enough; Record at defaults to today; empty values are none",
    [cleanCheckInput({ rate: "  $65 /\n month ", home: "", work: null }, TODAY), cleanCheckInput({ work: "Acme", recordedAt: "2026-10-01" }, TODAY), cleanCheckInput({ home: "Owns", recordedAt: "" }, TODAY)],
    [{ ok: true, value: { rate: "$65 / month", home: null, work: null, recordedAt: TODAY } }, { ok: true, value: { rate: null, home: null, work: "Acme", recordedAt: "2026-10-01" } }, { ok: true, value: { rate: null, home: "Owns", work: null, recordedAt: TODAY } }]
  );
  eq(
    `check: none filled, one over ${CHECK_FIELD_MAX}, a day that is not one, a day after today: each its own line`,
    [cleanCheckInput({ rate: " ", home: "", work: "" }, TODAY), cleanCheckInput({ home: "h".repeat(CHECK_FIELD_MAX + 1) }, TODAY), cleanCheckInput({ work: "w".repeat(CHECK_FIELD_MAX + 1), rate: "r" }, TODAY), cleanCheckInput({ rate: "r", recordedAt: "2026-02-30" }, TODAY), cleanCheckInput({ rate: "r", recordedAt: "2026-10-21" }, TODAY), cleanCheckInput({ rate: "r".repeat(CHECK_FIELD_MAX) }, TODAY).ok, cleanCheckInput({ rate: "r", recordedAt: "2028-02-29" }, "2028-03-01").ok],
    [err(CHECK_EMPTY), err(CHECK_LONG.home), err(CHECK_LONG.work), err(CHECK_DATE_BAD), err(CHECK_DATE_FUTURE), true, true]
  );
  eq("checks: newest recorded first; the same day, the newest added first", sortChecks([{ id: "k1", recordedAt: "2026-10-01", createdAt: "2026-10-01T00:00:00Z" }, { id: "k2", recordedAt: "2026-10-19", createdAt: "2026-10-19T00:00:00Z" }, { id: "k3", recordedAt: "2026-10-19", createdAt: "2026-10-19T05:00:00Z" }]).map((c) => c.id), ["k3", "k2", "k1"]);
  eq("a day in words: Today, Yesterday, Tomorrow, the weekday, the year when not this one", [dayLabel(TODAY, TODAY), dayLabel("2026-10-19", TODAY), dayLabel("2026-10-21", TODAY), dayLabel("2026-10-13", TODAY), dayLabel("2025-12-31", TODAY)], ["Today", "Yesterday", "Tomorrow", "Tue 13 Oct", "Wed 31 Dec 2025"]);

  // A collection.
  eq(
    "collection: a name (1..80, one line), a note (≤ 500), an order's id (left out, none, or an id)",
    [cleanCollectionInput({ name: "  New  NBN\nservice " }), cleanCollectionInput({ name: "Order", orderId: "" }), cleanCollectionInput({ name: "Order", orderId: "wo_1", note: " a\r\nb " }), cleanCollectionInput({ name: " " }), cleanCollectionInput({ name: "n".repeat(COLLECTION_NAME_MAX + 1) }), cleanCollectionInput({ name: "x", note: "n".repeat(501) }), cleanCollectionInput({ name: "x", orderId: "../x" })],
    [{ ok: true, value: { name: "New NBN service", note: null } }, { ok: true, value: { name: "Order", note: null, orderId: null } }, { ok: true, value: { name: "Order", note: "a\nb", orderId: "wo_1" } }, err(COLLECTION_NAME_EMPTY), err(COLLECTION_NAME_LONG), err(COLLECTION_NOTE_LONG), err(COLLECTION_ORDER_BAD)]
  );
  eq("progress: its tasks and the done ones, in words", [collectionProgressOf([{ doneAt: null }, { doneAt: "x" }, { doneAt: null }]), progressLabel({ done: 2, total: 5 }), progressLabel({ done: 0, total: 0 }), progressLabel({ done: 3, total: 3 })], [{ done: 1, total: 3 }, "2 of 5 done", "No tasks yet", "All 3 done"]);
  const coll = (id: string, created: string, closed: string | null = null): CollectionView => ({ id, customerId: "c1", name: `Coll ${id}`, note: null, order: null, closedAt: closed, createdAt: `${created}T00:00:00.000Z` });
  const cols = [coll("A", "2026-10-01"), coll("B", "2026-10-05"), coll("C", "2026-10-10", "2026-10-18T00:00:00.000Z"), coll("D", "2026-10-15"), coll("E", "2026-10-02", "2026-10-19T00:00:00.000Z")];
  const t = (id: string, due: string, collection: string | null, doneAt: string | null = null) => ({ id, dueAt: `${due}T00:00:00.000Z`, doneAt, collection: collection ? { id: collection } : null });
  const g = groupByCollection(
    [t("t1", "2026-10-22", "A"), t("t2", "2026-10-21", "B"), t("t3", "2026-10-01", "A", "2026-10-02T00:00:00.000Z"), t("t4", "2026-10-25", null), t("t5", "2026-10-20", "X"), t("t6", "2026-10-30", "C"), t("t7", "2026-10-09", "A", "2026-10-09T00:00:00.000Z")],
    cols
  );
  eq(
    "grouping: open collections by their next task (none open: newest first), then No collection (an unknown collection's task too), then the closed (newest closed first)",
    [g.open.map((x) => x.collection?.id), g.none?.open.map((x) => x.id), g.closed.map((x) => x.collection?.id)],
    [["B", "A", "D"], ["t5", "t4"], ["E", "C"]]
  );
  eq("grouping: a group's open tasks soonest first, its done ones newest first, its progress", [g.open[1].open.map((x) => x.id), g.open[1].done.map((x) => x.id), g.open[1].progress, g.open[2].progress], [["t1"], ["t7", "t3"], { done: 2, total: 3 }, { done: 0, total: 0 }]);
  check("grouping: no task outside a collection is no No collection group", groupByCollection([t("t1", "2026-10-22", "A")], cols).none === null);

  // Follow-ups, as truth tables.
  const f = (over: Partial<FollowUpFacts> = {}): FollowUpFacts => ({ id: "c1", number: "C-1", name: "Jane", phone: null, status: "CUSTOMER", createdAt: NOW.getTime() - 50 * DAY, lastInteractionAt: null, lastDoneAt: null, open: [], ...over });
  const at = (days: number) => NOW.getTime() - days * DAY;
  const pastTask = { dueAt: new Date(NOW.getTime() - 3_600_000).toISOString(), allDay: false };
  const aheadTask = { dueAt: new Date(NOW.getTime() + 3 * DAY).toISOString(), allDay: false };
  const allDayToday = { dueAt: syd("2026-10-20T09:00").toISOString(), allDay: true };
  const allDayYesterday = { dueAt: syd("2026-10-19T09:00").toISOString(), allDay: true };
  const why = (x: FollowUpFacts, days: number | null = 30) => followUpOf(x, days, NOW, TZ)?.reasons ?? null;
  eq(
    "follow-up (30 days): quiet for more than 30 with nothing ahead; exactly 30 is not; a task ahead holds it; an overdue one always flags; Inactive never; Off never",
    [
      why(f()),
      why(f({ lastInteractionAt: at(30) })),
      why(f({ lastInteractionAt: at(31) })),
      why(f({ open: [aheadTask] })),
      why(f({ open: [pastTask] })),
      why(f({ lastInteractionAt: at(2), open: [pastTask, pastTask, aheadTask] })),
      why(f({ status: "INACTIVE", open: [pastTask] })),
      why(f({ open: [pastTask] }), null),
      why(f({ lastInteractionAt: at(8) }), 7),
    ],
    [["No contact for 50 days"], null, ["No contact for 31 days"], null, ["1 overdue", "No contact for 50 days"], ["2 overdue"], null, null, ["No contact for 8 days"]]
  );
  eq(
    "follow-up: an all-day task is overdue once its day has ended (today's is still ahead); a timed one once its time has passed",
    [why(f({ lastInteractionAt: at(2), open: [allDayToday] })), why(f({ lastInteractionAt: at(2), open: [allDayYesterday] })), why(f({ open: [allDayToday] }))],
    [null, ["1 overdue"], null]
  );
  eq(
    "last contact: the newest of the latest interaction and the latest done task; failing both, when they were added",
    [lastContactAtOf(f({ lastInteractionAt: at(35), lastDoneAt: at(40) })) === at(35), lastContactAtOf(f({ lastInteractionAt: at(60), lastDoneAt: at(3) })) === at(3), lastContactAtOf(f()) === at(50), why(f({ lastInteractionAt: at(60), lastDoneAt: at(3) }))],
    [true, true, true, null]
  );
  const facts = [f({ id: "q40", name: "Quiet40", lastInteractionAt: at(40) }), f({ id: "o1", name: "Over1", open: [pastTask], lastInteractionAt: at(1) }), f({ id: "q90", name: "Quiet90", lastInteractionAt: at(90) }), f({ id: "o2", name: "Over2", open: [pastTask, pastTask], lastInteractionAt: at(1) }), f({ id: "ok", name: "Fine", lastInteractionAt: at(1) })];
  eq("follow-ups: the overdue first (the most overdue first), then the quietest", followUpsOf(facts, 30, NOW, TZ).map((x) => x.customer.id), ["o2", "o1", "q90", "q40"]);
  eq("follow-ups: off is nobody", followUpsOf(facts, null, NOW, TZ), []);
  eq("follow-up words: the reasons joined; the Customers count; the sub-navigation's composed line", [followUpLineOf({ reasons: ["2 overdue", "No contact for 42 days"] }), followUpCountText(3), followUpCountText(0), customersCountText("2 due today", "3 to follow up"), customersCountText(null, "1 to follow up"), customersCountText(null, null)], ["2 overdue · No contact for 42 days", "3 to follow up", null, "2 due today · 3 to follow up", "1 to follow up", null]);
  eq("Schedule follow-up: 'Follow up with <name>', tomorrow 09:00 on the Sydney clock, a call (01:30 Wed is still Tuesday's life day)", [followUpTaskOf({ name: "Jane Nguyen" }, NOW, TZ), followUpTaskOf({ name: "Jane" }, syd("2026-10-21T01:30"), TZ).when], [{ title: "Follow up with Jane Nguyen", when: "2026-10-21T09:00", channel: "CALL" }, "2026-10-21T09:00"]);
  eq("the alert: Off, 7, 14, 30, 60, 90 days (30 by default)", [FOLLOW_UP_CHOICES, FOLLOW_UP_DEFAULT, FOLLOW_UP_CHOICES.map(followUpLabel)], [[null, 7, 14, 30, 60, 90], 30, ["Off", "7 days", "14 days", "30 days", "60 days", "90 days"]]);
  eq("the alert: one of the choices ('off' and null are Off; '30' reads as 30); anything else refused", [cleanFollowUpDays(null), cleanFollowUpDays("off"), cleanFollowUpDays("30"), cleanFollowUpDays(14), cleanFollowUpDays(45), cleanFollowUpDays(undefined)], [{ ok: true, value: null }, { ok: true, value: null }, { ok: true, value: 30 }, { ok: true, value: 14 }, err(FOLLOW_UP_BAD), err(FOLLOW_UP_BAD)]);
  eq(
    "the Overview's last contact: the newest of a log entry and a done task, in words; none: null",
    [
      lastContactLineOf([{ at: syd("2026-10-19T16:10").toISOString(), action: "CALL" }], [{ doneAt: syd("2026-10-18T09:00").toISOString(), title: "Quote", channel: "EMAIL" }], NOW, TZ),
      lastContactLineOf([{ at: syd("2026-10-10T16:10").toISOString(), action: "VISIT" }], [{ doneAt: syd("2026-10-20T09:12").toISOString(), title: "Ring about the quote", channel: "CALL" }], NOW, TZ),
      lastContactLineOf([], [{ doneAt: null, title: "x", channel: "CALL" }], NOW, TZ),
    ],
    ["Call · Yesterday 16:10", "Call done: Ring about the quote · Today 09:12", null]
  );
}

// ── 2. Deals ───────────────────────────────────────────────────────────────
function deals() {
  section("deals (deals.ts)");
  eq("stages: New · Quoted · Won · Lost", [DEAL_STAGES, DEAL_STAGES.map((s) => DEAL_STAGE_LABEL[s]), dealStageOf("WON"), dealStageOf("won")], [["NEW", "QUOTED", "WON", "LOST"], ["New", "Quoted", "Won", "Lost"], "WON", null]);
  const later = new Date(NOW.getTime() + 60_000);
  eq(
    "a move: to Won or Lost stamps closedAt (now); back to New or Quoted clears it; the same stage keeps it; Won → Lost is closed now",
    [stagePatchOf({ stage: "NEW", closedAt: null }, "WON", NOW), stagePatchOf({ stage: "WON", closedAt: NOW }, "WON", later), stagePatchOf({ stage: "WON", closedAt: NOW }, "LOST", later), stagePatchOf({ stage: "LOST", closedAt: NOW }, "QUOTED", later), stagePatchOf({ stage: "NEW", closedAt: null }, "QUOTED", later)].map((p) => [p.stage, p.closedAt?.toISOString() ?? null]),
    [["WON", NOW.toISOString()], ["WON", NOW.toISOString()], ["LOST", later.toISOString()], ["QUOTED", null], ["QUOTED", null]]
  );
  eq("Move to…: every other stage, in order", moveTargetsOf("QUOTED"), ["NEW", "WON", "LOST"]);
  eq("money: '$1,250', cents only when there are some, never a float", [formatMoney(0), formatMoney(125000), formatMoney(125050), formatMoney(5), formatMoney(123456789), formatMoney(-5), formatMoney(Number.NaN)], ["$0", "$1,250", "$1,250.50", "$0.05", "$1,234,567.89", "$0", "$0"]);
  eq(
    "money parsed: dollars as typed into whole cents ('' is $0); a minus, a third decimal, letters, over $10,000,000 refused",
    [parseMoney(""), parseMoney("1250"), parseMoney("$1,250"), parseMoney(" 1 250.5 "), parseMoney(".5"), parseMoney("$ 99.99"), parseMoney("AUD 50"), parseMoney(12.5), parseMoney("10000000"), parseMoney("1,250.505"), parseMoney("-5"), parseMoney("abc"), parseMoney("10000000.01"), parseMoney("."), parseMoney(null)],
    [{ ok: true, value: 0 }, { ok: true, value: 125000 }, { ok: true, value: 125000 }, { ok: true, value: 125050 }, { ok: true, value: 50 }, { ok: true, value: 9999 }, { ok: true, value: 5000 }, { ok: true, value: 1250 }, { ok: true, value: MONEY_MAX_CENTS }, err(MONEY_BAD), err(MONEY_NEGATIVE), err(MONEY_BAD), err(MONEY_LONG), err(MONEY_BAD), { ok: true, value: 0 }]
  );
  eq("money: the field's text and back (a round trip)", [moneyInputOf(125050), moneyInputOf(125000), moneyInputOf(0), parseMoney(moneyInputOf(123456789))], ["1250.50", "1250", "", { ok: true, value: 123456789 }]);
  eq(
    "the sheet: a title (1..120), a value, a stage (New when none), a close day, a note (≤ 500), a customer (left out, none, an id)",
    [cleanDealInput({ title: "  NBN  100 ", value: "1,250", expectedCloseDay: "2026-10-30" }), cleanDealInput({ title: "x", stage: "WON", customerId: "", note: " n " })],
    [{ ok: true, value: { title: "NBN 100", valueCents: 125000, stage: "NEW", expectedCloseDay: "2026-10-30", note: null } }, { ok: true, value: { title: "x", valueCents: 0, stage: "WON", expectedCloseDay: null, note: "n", customerId: null } }]
  );
  eq(
    "the sheet's refusals, each its own line",
    [cleanDealInput({ title: " " }), cleanDealInput({ title: "t".repeat(121) }), cleanDealInput({ title: "x", value: "lots" }), cleanDealInput({ title: "x", stage: "DONE" }), cleanDealInput({ title: "x", expectedCloseDay: "2026-13-01" }), cleanDealInput({ title: "x", note: "n".repeat(501) }), cleanDealInput({ title: "x", customerId: "../c" })],
    [err(DEAL_TITLE_EMPTY), err(DEAL_TITLE_LONG), err(MONEY_BAD), err(DEAL_STAGE_BAD), err(DEAL_CLOSE_BAD), err(DEAL_NOTE_LONG), err(DEAL_CUSTOMER_BAD)]
  );
  const d = (id: string, stage: DealStage, valueCents: number, sortOrder = 0, createdAt = "2026-10-01T00:00:00.000Z") => ({ id, stage, valueCents, sortOrder, createdAt });
  const all = [d("n2", "NEW", 50000, 2), d("n1", "NEW", 125000, 1), d("q1", "QUOTED", 30000, 1), d("w1", "WON", 99900, 1), d("n3", "NEW", 1000, 1, "2026-10-02T00:00:00.000Z")];
  const p = pipelineOf(all);
  eq("pipeline: four columns, each by sortOrder then the oldest added", [p.NEW.map((x) => x.id), p.QUOTED.map((x) => x.id), p.WON.map((x) => x.id), p.LOST], [["n1", "n3", "n2"], ["q1"], ["w1"], []]);
  eq("totals: each column's count and value; the open ones (New and Quoted)", [stageTotalsOf(all).NEW, stageTotalsOf(all).LOST, openDealsOf(all), openDealsLine(openDealsOf(all)), openDealsLine({ count: 0, valueCents: 0 }), stageTotalLine({ count: 1, valueCents: 99900 })], [{ count: 3, valueCents: 176000 }, { count: 0, valueCents: 0 }, { count: 4, valueCents: 206000 }, "$2,060 · 4 open", null, "1 deal · $999"]);
  eq("a column's end: one past its last sortOrder", [nextSortOrder(p.NEW), nextSortOrder([])], [3, 1]);
  const v = (stage: DealStage, expectedCloseDay: string | null, closedAt: string | null = null) => ({ stage, expectedCloseDay, closedAt });
  eq(
    "a deal's day: Close by / today / tomorrow; Overdue once an open one's day has passed; Won and Lost name the day they closed",
    [dealCloseLabel(v("NEW", "2026-10-30"), TODAY, TZ), dealCloseLabel(v("QUOTED", TODAY), TODAY, TZ), dealCloseLabel(v("NEW", "2026-10-21"), TODAY, TZ), dealCloseLabel(v("QUOTED", "2026-10-12"), TODAY, TZ), dealCloseLabel(v("WON", "2026-10-12", NOW.toISOString()), TODAY, TZ), dealCloseLabel(v("LOST", null), TODAY, TZ), dealCloseLabel(v("NEW", null), TODAY, TZ), dealCloseLabel(v("NEW", "2027-01-05"), TODAY, TZ)],
    ["Close by Fri 30 Oct", "Close today", "Close tomorrow", "Overdue · 12 Oct", "Won Tue 20 Oct", null, null, "Close by Tue 5 Jan 2027"]
  );
  eq("overdue: an open deal past its day only", [isDealOverdue(v("NEW", "2026-10-19"), TODAY), isDealOverdue(v("WON", "2026-10-19"), TODAY), isDealOverdue(v("NEW", TODAY), TODAY)], [true, false, false]);
  eq(
    "Create order's prefill: the deal's title as the item (≤ 120), the customer's name, phone and ID, today, not ordered",
    [orderPrefillOf({ title: "NBN 100", customer: { id: "c1", number: "C-1", name: "Jane", phone: "0412" } }, TODAY), orderPrefillOf({ title: "t".repeat(130), customer: null }, TODAY).item.length],
    [{ item: "NBN 100", name: "Jane", contact: "0412", date: TODAY, ordered: false, customer: "C-1" }, 120]
  );
  eq("paths: /today/work/<board>/deals, ?stage= (lower case) else New", [dealsHref("b1"), dealsPathOf("/today/work/b1/deals"), dealsPathOf("/today/work/b1/deals/x"), dealsPathOf("/today/work/b1"), stageParamOf("won"), stageParamOf("nope"), stageParamOf(undefined)], ["/today/work/b1/deals", { boardId: "b1" }, null, null, "WON", "NEW", "NEW"]);
}

// ── 3. The search's secondary matches ─────────────────────────────────────
function search() {
  section("the search's secondary matches (customer-search.ts)");
  const e = (id: string, number: string, name: string, over: Partial<CustomerIndexEntry> = {}): CustomerIndexEntry => ({ id, number, name, nickname: null, phone: null, activity: 0, ...over });
  const ix = prepareIndex([e("c1", "C-1", "Jane Nguyen", { company: "Acme Pty", email: "jane@acme.com.au" }), e("c2", "ACME-9", "Bob", { activity: 1 }), e("c3", "C-3", "Acme Lee"), e("c4", "C-4", "Zed", { email: "zed@fibre.net", company: "Fibre Co" })]);
  const q = (s: string) => matchCustomers(ix, s)?.results.map((m) => [m.entry.id, m.rank, m.field]) ?? null;
  eq("rank: the ID and the name first, then the company, then the email (secondary matches)", q("acme"), [["c2", RANK.ID_PREFIX, "id"], ["c3", RANK.NAME_WORD, "name"], ["c1", RANK.COMPANY, "company"]]);
  eq("company: a word's start or anywhere; email: anywhere in it", [q("fibre"), q("@acme"), q("net")], [[["c4", RANK.COMPANY, "company"]], [["c1", RANK.EMAIL, "email"]], [["c4", RANK.EMAIL, "email"]]]);
  check("the tiers stay in order: phone before company before email", RANK.PHONE < RANK.COMPANY && RANK.COMPANY < RANK.EMAIL && RANK.NAME_SUBSTRING < RANK.PHONE);
  const m = matchCustomers(ix, "@acme")!.results[0];
  eq("marks: the email's matched part, as written", m.ranges.email, [[4, 9]]);
  check("an entry without the new fields still matches (the index is optional about them)", matchCustomers(prepareIndex([e("x", "1", "Old")]), "old")?.results.length === 1);
}

// ── 4. The cores, on in-memory dbs ─────────────────────────────────────────

class MemCrm implements CrmDb {
  boards = new Map<string, CrmTabRow>();
  people = new Map<string, Omit<CrmCustomerRow, "board"> & { status: string; createdAt: number }>();
  checksRows: CheckRow[] = [];
  collectionsRows: (Omit<CollectionRow, "order"> & { order?: undefined })[] = [];
  ordersRows: OrderRefRow[] = [];
  facts: FollowUpFacts[] = [];
  writes = 0;
  seq = 0;
  addBoard(id: string, o: Partial<CrmTabRow> = {}) {
    this.boards.set(id, { id, userId: U, name: `Tab ${id}`, archivedAt: null, crmOn: true, ordersOn: true, followUpDays: 30, ...o });
  }
  addCustomer(id: string, boardId: string, o: { userId?: string; archived?: boolean } = {}) {
    this.people.set(id, { id, userId: o.userId ?? U, boardId, number: id.toUpperCase(), name: `Customer ${id}`, archivedAt: o.archived ? new Date(0) : null, status: "CUSTOMER", createdAt: 0 });
  }
  private withBoard(c: Omit<CrmCustomerRow, "board">): CrmCustomerRow {
    return { id: c.id, userId: c.userId, boardId: c.boardId, number: c.number, name: c.name, archivedAt: c.archivedAt, board: { ...this.boards.get(c.boardId)! } };
  }
  private withOrder(r: Omit<CollectionRow, "order">): CollectionRow {
    const o = r.orderId ? this.ordersRows.find((x) => x.id === r.orderId) : undefined;
    return { ...r, order: o ? { id: o.id, item: o.item, ordered: o.ordered, archivedAt: o.archivedAt } : null };
  }
  async board(userId: string, boardId: string) {
    const b = this.boards.get(boardId);
    return b && b.userId === userId ? { ...b } : null;
  }
  async setFollowUpDays(userId: string, boardId: string, days: number | null) {
    const b = this.boards.get(boardId);
    if (!b || b.userId !== userId || b.archivedAt) return 0;
    b.followUpDays = days;
    this.writes++;
    return 1;
  }
  async customer(userId: string, id: string) {
    const c = this.people.get(id);
    return c && c.userId === userId ? this.withBoard(c) : null;
  }
  async setStatus(userId: string, customerId: string, status: string) {
    const c = this.people.get(customerId);
    if (!c || c.userId !== userId || c.archivedAt) return 0;
    c.status = status;
    this.writes++;
    return 1;
  }
  async checks(userId: string, customerId: string) {
    return this.checksRows.filter((k) => k.userId === userId && k.customerId === customerId && !k.archivedAt).map((k) => ({ ...k }));
  }
  async check(userId: string, id: string) {
    const k = this.checksRows.find((x) => x.id === id && x.userId === userId);
    const c = k ? this.people.get(k.customerId) : undefined;
    return k && c ? { ...k, customer: this.withBoard(c) } : null;
  }
  async createCheck(userId: string, customerId: string, f: CheckFields) {
    const id = `ck${++this.seq}`;
    this.checksRows.push({ id, userId, customerId, ...f, archivedAt: null, createdAt: new Date(NOW.getTime() + this.seq * 1000) });
    this.writes++;
    return { id };
  }
  async updateCheck(userId: string, id: string, f: CheckFields) {
    const k = this.checksRows.find((x) => x.id === id && x.userId === userId && !x.archivedAt);
    if (!k) return 0;
    Object.assign(k, f);
    this.writes++;
    return 1;
  }
  async setCheckArchived(userId: string, id: string, at: Date | null) {
    const k = this.checksRows.find((x) => x.id === id && x.userId === userId && (at ? !x.archivedAt : x.archivedAt));
    if (!k) return 0;
    k.archivedAt = at;
    this.writes++;
    return 1;
  }
  async collections(userId: string, customerId: string) {
    return this.collectionsRows.filter((r) => r.userId === userId && r.customerId === customerId && !r.archivedAt).map((r) => this.withOrder(r));
  }
  async collection(userId: string, id: string) {
    const r = this.collectionsRows.find((x) => x.id === id && x.userId === userId);
    const c = r ? this.people.get(r.customerId) : undefined;
    return r && c ? { ...this.withOrder(r), customer: this.withBoard(c) } : null;
  }
  async createCollection(userId: string, f: { boardId: string; customerId: string; name: string; note: string | null; orderId: string | null }) {
    const id = `co${++this.seq}`;
    this.collectionsRows.push({ id, userId, ...f, closedAt: null, archivedAt: null, createdAt: new Date(NOW.getTime() + this.seq * 1000) });
    this.writes++;
    return { id, name: f.name };
  }
  async updateCollection(userId: string, id: string, where: { open?: boolean; archived?: boolean }, data: CollectionWrite) {
    const r = this.collectionsRows.find((x) => x.id === id && x.userId === userId);
    if (!r || (where.open && r.archivedAt) || (where.archived && !r.archivedAt)) return 0;
    Object.assign(r, data);
    this.writes++;
    return 1;
  }
  async order(userId: string, id: string) {
    const o = this.ordersRows.find((x) => x.id === id && x.userId === userId);
    return o ? { ...o } : null;
  }
  async customerOrders(userId: string, boardId: string, customerId: string) {
    return this.ordersRows.filter((o) => o.userId === userId && o.boardId === boardId && o.customerId === customerId && !o.archivedAt);
  }
  async followUpFacts(userId: string, boardId: string) {
    return this.facts.filter((x) => this.people.get(x.id)?.boardId === boardId && this.people.get(x.id)?.userId === userId);
  }
}

class MemDeals implements DealDb {
  boards = new Map<string, DealTabRow>();
  people = new Map<string, DealCustomerRow>();
  rows: (Omit<DealListRow, "customer" | "order">)[] = [];
  orders = new Map<string, { id: string; item: string; archivedAt: Date | null }>();
  seq = 0;
  writes = 0;
  addBoard(id: string, o: Partial<DealTabRow> = {}) {
    this.boards.set(id, { id, userId: U, name: `Tab ${id}`, archivedAt: null, crmOn: true, ordersOn: true, ...o });
  }
  addCustomer(id: string, boardId: string, o: { userId?: string; archived?: boolean } = {}) {
    this.people.set(id, { id, userId: o.userId ?? U, boardId, number: id.toUpperCase(), name: `Customer ${id}`, phone: "0412 345 678", archivedAt: o.archived ? new Date(0) : null });
  }
  private full(r: Omit<DealListRow, "customer" | "order">): DealListRow {
    const c = r.customerId ? this.people.get(r.customerId) : undefined;
    return { ...r, customer: c ? { id: c.id, number: c.number, name: c.name, phone: c.phone, archivedAt: c.archivedAt } : null, order: r.orderId ? (this.orders.get(r.orderId) ?? null) : null };
  }
  async board(userId: string, boardId: string) {
    const b = this.boards.get(boardId);
    return b && b.userId === userId ? { ...b } : null;
  }
  async customer(userId: string, id: string) {
    const c = this.people.get(id);
    return c && c.userId === userId ? { ...c } : null;
  }
  async deals(userId: string, boardId: string) {
    return this.rows.filter((r) => r.userId === userId && r.boardId === boardId && !r.archivedAt).map((r) => this.full(r));
  }
  async customerDeals(userId: string, customerId: string) {
    return this.rows.filter((r) => r.userId === userId && r.customerId === customerId && !r.archivedAt).map((r) => this.full(r));
  }
  async deal(userId: string, id: string): Promise<DealWithBoard | null> {
    const r = this.rows.find((x) => x.id === id && x.userId === userId);
    return r ? { ...this.full(r), board: { ...this.boards.get(r.boardId)! } } : null;
  }
  async maxSortOrder(userId: string, boardId: string, stage: DealStage) {
    return this.rows.filter((r) => r.userId === userId && r.boardId === boardId && r.stage === stage && !r.archivedAt).reduce((m, r) => Math.max(m, r.sortOrder), 0);
  }
  async createDeal(userId: string, boardId: string, f: DealFields & { sortOrder: number }) {
    const id = `dl${++this.seq}`;
    this.rows.push({ id, userId, boardId, ...f, orderId: null, archivedAt: null, createdAt: new Date(NOW.getTime() + this.seq * 1000) });
    this.writes++;
    return { id };
  }
  async updateDeal(userId: string, id: string, data: Partial<DealFields & { sortOrder: number }>) {
    const r = this.rows.find((x) => x.id === id && x.userId === userId && !x.archivedAt);
    if (!r) return 0;
    Object.assign(r, data);
    this.writes++;
    return 1;
  }
  async setDealArchived(userId: string, id: string, at: Date | null) {
    const r = this.rows.find((x) => x.id === id && x.userId === userId && (at ? !x.archivedAt : x.archivedAt));
    if (!r) return 0;
    r.archivedAt = at;
    this.writes++;
    return 1;
  }
  async setDealOrder(userId: string, id: string, orderId: string) {
    const r = this.rows.find((x) => x.id === id && x.userId === userId && !x.archivedAt && x.stage === "WON" && !x.orderId);
    if (!r) return 0;
    r.orderId = orderId;
    this.writes++;
    return 1;
  }
}

/** A small ScheduledDb for the collection gate (the rest of the cores are scheduled-tasks-check's). */
class MemSched implements ScheduledDb {
  boards = new Map<string, ScheduledBoardRow>();
  people = new Map<string, ScheduledCustomerRow>();
  colls = new Map<string, ScheduledCollectionRow>();
  rows: ScheduledRow[] = [];
  seq = 0;
  async board(userId: string, boardId: string) {
    const b = this.boards.get(boardId);
    return b && b.userId === userId ? b : null;
  }
  async customer(userId: string, id: string) {
    const c = this.people.get(id);
    return c && c.userId === userId ? c : null;
  }
  async collection(userId: string, id: string) {
    const c = this.colls.get(id);
    return c && c.userId === userId ? c : null;
  }
  async task(userId: string, id: string) {
    const r = this.rows.find((x) => x.id === id && x.userId === userId);
    if (!r) return null;
    const coll = r.collectionId ? this.colls.get(r.collectionId) : undefined;
    return { ...r, customer: r.customerId ? (this.people.get(r.customerId) ?? null) : null, collection: coll ? { id: coll.id, name: coll.name, archivedAt: coll.archivedAt } : null, board: this.boards.get(r.boardId)! };
  }
  async byLegacy() {
    return null;
  }
  async insert(row: Omit<ScheduledRow, "id" | "remindSentAt" | "doneAt" | "archivedAt">) {
    const id = `st${++this.seq}`;
    this.rows.push({ ...row, id, remindSentAt: null, doneAt: null, archivedAt: null });
    return { id };
  }
  async patch(userId: string, id: string, where: PatchWhere, data: ScheduledWrite) {
    const r = this.rows.find((x) => x.id === id && x.userId === userId);
    if (!r || (where.open && r.archivedAt)) return 0;
    Object.assign(r, data);
    return 1;
  }
  async markDone(_userId: string, _id: string, _at: Date, _log: DoneLog | null) {
    void _userId;
    void _id;
    void _at;
    void _log;
    return { changed: 0, interactionId: null };
  }
  async archiveInteraction() {
    return 0;
  }
  async agenda() {
    return [];
  }
  async forCustomer() {
    return [];
  }
}

async function crmCores() {
  section("the cores (crm-server.ts)");
  const db = new MemCrm();
  db.addBoard("wb1");
  db.addBoard("wb2");
  db.addBoard("wbOff", { crmOn: false });
  db.addBoard("wbNoOrders", { ordersOn: false });
  db.addBoard("wbOld", { archivedAt: new Date(0) });
  db.addBoard("wbTheirs", { userId: "u2" });
  db.addCustomer("cu1", "wb1");
  db.addCustomer("cu2", "wb1");
  db.addCustomer("cuOther", "wb2");
  db.addCustomer("cuOff", "wbOff");
  db.addCustomer("cuOld", "wb1", { archived: true });
  db.addCustomer("cuNo", "wbNoOrders");
  db.addCustomer("cuTheirs", "wbTheirs", { userId: "u2" });
  db.ordersRows.push(
    { id: "wo1", userId: U, boardId: "wb1", customerId: "cu1", item: "NBN 100", ordered: false, archivedAt: null },
    { id: "wo2", userId: U, boardId: "wb1", customerId: "cu2", item: "Modem", ordered: false, archivedAt: null },
    { id: "wo3", userId: U, boardId: "wb2", customerId: "cuOther", item: "Phone", ordered: true, archivedAt: null },
    { id: "wo4", userId: U, boardId: "wb1", customerId: "cu1", item: "Old", ordered: false, archivedAt: new Date(0) },
    { id: "wo5", userId: U, boardId: "wbNoOrders", customerId: "cuNo", item: "Kept", ordered: false, archivedAt: null }
  );

  // The tab's follow-up alert.
  eq(
    "follow-up alert: Off or 7..90 days on an open tab (the list need not be on); another user's or an archived tab refused; a stray refused before any read",
    [await setFollowUpDaysCore(U, "wb1", null, db), await setFollowUpDaysCore(U, "wbOff", 14, db), await setFollowUpDaysCore(U, "wb1", 45, db), await setFollowUpDaysCore(U, "wbOld", 7, db), await setFollowUpDaysCore(U, "wbTheirs", 7, db), await setFollowUpDaysCore(U, "../x", 7, db)],
    [{ ok: true, value: { followUpDays: null } }, { ok: true, value: { followUpDays: 14 } }, err(FOLLOW_UP_BAD), err(WORK_BOARD_ARCHIVED), err(WORK_BOARD_GONE), err(WORK_BOARD_GONE)]
  );
  check("follow-up alert: written", db.boards.get("wb1")!.followUpDays === null && db.boards.get("wbOff")!.followUpDays === 14);
  db.boards.get("wb1")!.followUpDays = 30;

  // A customer's status.
  eq(
    "status: one of the four on a kept customer of a listed tab; an empty or stray one, an archived customer, a list switched off, another user's: refused",
    [await setCustomerStatusCore(U, "cu1", "LEAD", db), await setCustomerStatusCore(U, "cu1", "", db), await setCustomerStatusCore(U, "cu1", "VIP", db), await setCustomerStatusCore(U, "cuOld", "LEAD", db), await setCustomerStatusCore(U, "cuOff", "LEAD", db), await setCustomerStatusCore(U, "cuTheirs", "LEAD", db)],
    [{ ok: true, value: { id: "cu1", status: "LEAD" } }, err(STATUS_BAD), err(STATUS_BAD), err(CUSTOMER_ARCHIVED), err(CRM_OFF), err(CUSTOMER_GONE)]
  );
  check("status: written", db.people.get("cu1")!.status === "LEAD");

  // Checks.
  const w0 = db.writes;
  eq(
    "checks: refused on a list switched off, an archived customer, another user's; nothing filled; a day after today; nothing written",
    [await addCheckCore(U, "cuOff", { rate: "1" }, NOW, db), await addCheckCore(U, "cuOld", { rate: "1" }, NOW, db), await addCheckCore(U, "cuTheirs", { rate: "1" }, NOW, db), await addCheckCore(U, "cu1", { rate: " " }, NOW, db), await addCheckCore(U, "cu1", { rate: "1", recordedAt: "2026-10-21" }, NOW, db)],
    [err(CRM_OFF), err(CUSTOMER_ARCHIVED), err(CUSTOMER_GONE), err(CHECK_EMPTY), err(CHECK_DATE_FUTURE)]
  );
  check("checks: the refusals wrote nothing", db.writes === w0);
  const k1 = await addCheckCore(U, "cu1", { rate: "$65/mo", home: "Owns" }, NOW, db);
  const k1Id = k1.ok ? k1.value.id : "";
  check("check: Record at is today's life day as a date column (UTC midnight of the day) unless picked", db.checksRows[0]?.recordedAt.toISOString() === "2026-10-20T00:00:00.000Z" && db.checksRows[0]?.rate === "$65/mo" && db.checksRows[0]?.work === null);
  const late = await addCheckCore(U, "cu1", { work: "Acme" }, syd("2026-10-21T01:30"), db);
  check("check: at 01:30 Wednesday the day is still Tuesday (the life day turns at 04:00)", late.ok && db.checksRows[1]?.recordedAt.toISOString() === "2026-10-20T00:00:00.000Z");
  await addCheckCore(U, "cu1", { work: "Older", recordedAt: "2026-09-01" }, NOW, db);
  check("check: an edit rewrites its fields and day", (await editCheckCore(U, k1Id, { rate: "$70/mo", recordedAt: "2026-10-19" }, NOW, db)).ok && db.checksRows[0].rate === "$70/mo" && db.checksRows[0].home === null && db.checksRows[0].recordedAt.toISOString() === "2026-10-19T00:00:00.000Z");
  eq("check: archive (again ok), an archived one can't be edited, Undo restores", [(await archiveCheckCore(U, k1Id, NOW, db)).ok, (await archiveCheckCore(U, k1Id, NOW, db)).ok, await editCheckCore(U, k1Id, { rate: "x" }, NOW, db), (await restoreCheckCore(U, k1Id, db)).ok, db.checksRows[0].archivedAt], [true, true, err("That check no longer exists."), true, null]);
  eq("check: another user's, a malformed id: gone", [await editCheckCore("u2", k1Id, { rate: "x" }, NOW, db), await archiveCheckCore(U, "../k", NOW, db)], [err("That check no longer exists."), err("That check no longer exists.")]);

  // Collections.
  eq(
    "collections: an order must be the same customer's, on this tab, kept, with the order list on",
    [await createCollectionCore(U, "cu1", { name: "x", orderId: "wo2" }, db), await createCollectionCore(U, "cu1", { name: "x", orderId: "wo3" }, db), await createCollectionCore(U, "cu1", { name: "x", orderId: "wo4" }, db), await createCollectionCore(U, "cuNo", { name: "x", orderId: "wo5" }, db), await createCollectionCore(U, "cu1", { name: "x", orderId: "nope" }, db), await createCollectionCore(U, "cuOff", { name: "x" }, db), await createCollectionCore(U, "cu1", { name: " " }, db)],
    [err(COLLECTION_ORDER_BAD), err(COLLECTION_ORDER_BAD), err(COLLECTION_ORDER_BAD), err(COLLECTION_ORDERS_OFF), err(COLLECTION_ORDER_BAD), err(CRM_OFF), err(COLLECTION_NAME_EMPTY)]
  );
  const c1 = await createCollectionCore(U, "cu1", { name: "New NBN service", orderId: "wo1", note: "Install Fri" }, db);
  const c1Id = c1.ok ? c1.value.id : "";
  check("collection: started on the customer's tab with its order and note", c1.ok && c1.value.name === "New NBN service" && db.collectionsRows[0].boardId === "wb1" && db.collectionsRows[0].orderId === "wo1" && db.collectionsRows[0].note === "Install Fri");
  check("collection: an edit with the order left out keeps it; '' unlinks it", (await editCollectionCore(U, c1Id, { name: "NBN" }, db)).ok && db.collectionsRows[0].orderId === "wo1" && db.collectionsRows[0].name === "NBN" && (await editCollectionCore(U, c1Id, { name: "NBN", orderId: "" }, db)).ok && db.collectionsRows[0].orderId === null);
  await editCollectionCore(U, c1Id, { name: "NBN", orderId: "wo1" }, db);
  db.ordersRows.find((o) => o.id === "wo1")!.archivedAt = new Date(0);
  check("collection: an order archived since stays linked on an edit that leaves it", (await editCollectionCore(U, c1Id, { name: "NBN again" }, db)).ok && db.collectionsRows[0].orderId === "wo1");
  db.ordersRows.find((o) => o.id === "wo1")!.archivedAt = null;
  eq("collection: close and open again (its tasks untouched); archive (again ok), an archived one can't be closed, Undo restores", [(await setCollectionClosedCore(U, c1Id, true, NOW, db)).ok && db.collectionsRows[0].closedAt?.getTime() === NOW.getTime(), (await setCollectionClosedCore(U, c1Id, false, NOW, db)).ok && db.collectionsRows[0].closedAt === null, (await archiveCollectionCore(U, c1Id, NOW, db)).ok, (await archiveCollectionCore(U, c1Id, NOW, db)).ok, await setCollectionClosedCore(U, c1Id, true, NOW, db), (await restoreCollectionCore(U, c1Id, db)).ok && db.collectionsRows[0].archivedAt === null], [true, true, true, true, err(COLLECTION_ARCHIVED), true]);
  eq("the order picker: the customer's kept orders on this tab; none while the list is off", [(await customerOrderOptionsCore(U, "cu1", db)), await customerOrderOptionsCore(U, "cuNo", db), await customerOrderOptionsCore(U, "cuOld", db)], [{ ok: true, value: [{ id: "wo1", item: "NBN 100", ordered: false }] }, { ok: true, value: [] }, err(CUSTOMER_ARCHIVED)]);

  // The reads.
  db.facts = [
    { id: "cu1", number: "CU1", name: "Customer cu1", phone: null, status: "LEAD", createdAt: NOW.getTime() - 50 * DAY, lastInteractionAt: null, lastDoneAt: null, open: [] },
    { id: "cu2", number: "CU2", name: "Customer cu2", phone: null, status: "CUSTOMER", createdAt: NOW.getTime() - 5 * DAY, lastInteractionAt: null, lastDoneAt: null, open: [] },
  ];
  const fu = await loadFollowUps(U, "wb1", NOW, db);
  eq("follow-ups: the tab's days and who needs one", fu ? [fu.days, fu.rows.map((r) => [r.customer.id, r.reasons])] : null, [30, [["cu1", ["No contact for 50 days"]]]]);
  db.boards.get("wb1")!.followUpDays = null;
  eq("follow-ups: Off is nobody (the days say so); a list switched off or another user's tab is no section", [await loadFollowUps(U, "wb1", NOW, db), await loadFollowUps(U, "wbOff", NOW, db), await loadFollowUps(U, "wbTheirs", NOW, db), await followUpCountCore(U, "wbOff", NOW, db)], [{ days: null, rows: [] }, null, null, err(WORK_BOARD_GONE)]);
  db.boards.get("wb1")!.followUpDays = 30;
  eq("the Customers count", await followUpCountCore(U, "wb1", NOW, db), { ok: true, value: { count: 1 } });
  const page = await loadCustomerCrm(U, "wb1", "cu1", NOW, db);
  check(
    "a customer's page: their checks newest first (archived ones out), their collections with the order, their follow-up and the tab's days",
    page !== null && page.checks.map((k) => k.recordedAt).join() === "2026-10-20,2026-10-19,2026-09-01" && page.collections.length === 1 && page.collections[0].order?.item === "NBN 100" && page.followUp?.reasons[0] === "No contact for 50 days" && page.followUpDays === 30,
    JSON.stringify(page)
  );
  eq("a customer's page: under another tab's path, another user's, a list switched off: none", [await loadCustomerCrm(U, "wb2", "cu1", NOW, db), await loadCustomerCrm("u2", "wb1", "cu1", NOW, db), await loadCustomerCrm(U, "wbOff", "cuOff", NOW, db)], [null, null, null]);
}

async function dealCores() {
  section("the cores (deals-server.ts)");
  const db = new MemDeals();
  db.addBoard("wb1");
  db.addBoard("wb2");
  db.addBoard("wbOff", { crmOn: false });
  db.addBoard("wbOld", { archivedAt: new Date(0) });
  db.addCustomer("cu1", "wb1");
  db.addCustomer("cuOther", "wb2");
  db.addCustomer("cuOld", "wb1", { archived: true });
  db.addCustomer("cuTheirs", "wb1", { userId: "u2" });
  eq(
    "create: the tab's customer list must be on; a customer of another tab or user, or archived, refused; the fields checked",
    [await createDealCore(U, "wbOff", { title: "x" }, NOW, db), await createDealCore(U, "wbOld", { title: "x" }, NOW, db), await createDealCore(U, "nope", { title: "x" }, NOW, db), await createDealCore(U, "wb1", { title: "x", customerId: "cuOther" }, NOW, db), await createDealCore(U, "wb1", { title: "x", customerId: "cuTheirs" }, NOW, db), await createDealCore(U, "wb1", { title: "x", customerId: "cuOld" }, NOW, db), await createDealCore(U, "wb1", { title: "x", value: "-1" }, NOW, db)],
    [err(DEALS_CRM_OFF), err(WORK_BOARD_ARCHIVED), err(WORK_BOARD_GONE), err(DEAL_CUSTOMER_GONE), err(DEAL_CUSTOMER_GONE), err(DEAL_CUSTOMER_ARCHIVED), err(MONEY_NEGATIVE)]
  );
  check("create: refusals wrote nothing", db.writes === 0);
  const a = await createDealCore(U, "wb1", { title: "NBN 100", value: "1,250", customerId: "cu1", expectedCloseDay: "2026-10-30" }, NOW, db);
  const b = await createDealCore(U, "wb1", { title: "Modem", value: "99" }, NOW, db);
  const w = await createDealCore(U, "wb1", { title: "Signed", value: "500", stage: "WON" }, NOW, db);
  const aId = a.ok ? a.value.id : "";
  const bId = b.ok ? b.value.id : "";
  const wId = w.ok ? w.value.id : "";
  const row = (id: string) => db.rows.find((r) => r.id === id)!;
  check("create: New at the end of its column; its value in cents, its day as a date column", row(aId).stage === "NEW" && row(aId).sortOrder === 1 && row(bId).sortOrder === 2 && row(aId).valueCents === 125000 && row(aId).expectedCloseDay?.toISOString() === "2026-10-30T00:00:00.000Z" && row(aId).closedAt === null);
  check("create: a deal made Won is stamped closed now", row(wId).stage === "WON" && row(wId).closedAt?.getTime() === NOW.getTime() && row(wId).sortOrder === 1);
  const later = new Date(NOW.getTime() + 60_000);
  const mv = await moveDealCore(U, aId, "WON", later, db);
  check("move to Won: closedAt now, the end of the Won column", mv.ok && mv.value.closedAt === later.toISOString() && row(aId).stage === "WON" && row(aId).sortOrder === 2);
  check("move back to Quoted: closedAt cleared", (await moveDealCore(U, aId, "QUOTED", later, db)).ok && row(aId).closedAt === null && row(aId).stage === "QUOTED");
  eq("move: a stray stage, an archived deal, another user's", [await moveDealCore(U, aId, "DONE", NOW, db), await moveDealCore("u2", aId, "WON", NOW, db)], [err(DEAL_STAGE_BAD), err(DEAL_GONE)]);
  check("edit: every field; the customer left out is kept; a new stage moves it (Lost: closed now)", (await editDealCore(U, aId, { title: "NBN 100 plan", value: "1300", stage: "LOST" }, later, db)).ok && row(aId).title === "NBN 100 plan" && row(aId).valueCents === 130000 && row(aId).customerId === "cu1" && row(aId).closedAt?.getTime() === later.getTime() && row(aId).expectedCloseDay === null);
  db.people.get("cu1")!.archivedAt = new Date(0);
  check("edit: a customer archived since stays linked while the edit leaves them", (await editDealCore(U, aId, { title: "NBN 100 plan", stage: "LOST", customerId: "cu1" }, later, db)).ok && row(aId).customerId === "cu1");
  db.people.get("cu1")!.archivedAt = null;
  check("archive (again ok); an archived deal can't move; Undo restores", (await archiveDealCore(U, bId, NOW, db)).ok && (await archiveDealCore(U, bId, NOW, db)).ok && JSON.stringify(await moveDealCore(U, bId, "WON", NOW, db)) === JSON.stringify(err(DEAL_ARCHIVED)) && (await restoreDealCore(U, bId, db)).ok && row(bId).archivedAt === null);

  // Create order from a Won deal.
  const calls: { boardId: string; input: unknown }[] = [];
  const addOrder = async (_u: string, boardId: string, input: unknown) => {
    calls.push({ boardId, input });
    return { ok: true as const, value: { id: `wo${calls.length}` } };
  };
  eq("Create order: only a Won deal", await createOrderFromDealCore(U, bId, { item: "x" }, NOW, db, { addOrder }), err(DEAL_NOT_WON));
  const made = await createOrderFromDealCore(U, wId, { item: "Signed", name: "Walk-in" }, NOW, db, { addOrder });
  check("Create order: through the order list's own core, on the deal's tab; the deal keeps the order", made.ok && made.value.orderId === "wo1" && calls.length === 1 && calls[0].boardId === "wb1" && row(wId).orderId === "wo1");
  eq("Create order: once (a deal with its order refuses another)", await createOrderFromDealCore(U, wId, { item: "Again" }, NOW, db, { addOrder }), err(DEAL_HAS_ORDER));
  const w2 = await createDealCore(U, "wb1", { title: "Second", stage: "WON" }, NOW, db);
  const offRes = await createOrderFromDealCore(U, w2.ok ? w2.value.id : "", { item: "x" }, NOW, db, { addOrder: async () => ({ ok: false as const, error: ORDERS_OFF }) });
  check("Create order: the order list's own refusal (off) comes back as it is, and the deal is untouched", JSON.stringify(offRes) === JSON.stringify(err(ORDERS_OFF)) && row(w2.ok ? w2.value.id : "").orderId === null);
  db.orders.set("wo1", { id: "wo1", item: "Signed", archivedAt: null });

  // The reads.
  const pg = await loadDealsPage(U, "wb1", NOW, db);
  check("the Deals page: the kept deals in pipeline order, with the order and the customer", pg.kind === "ok" && pg.deals.map((x) => x.id).join() === [bId, wId, w2.ok ? w2.value.id : "", aId].join() && pg.deals.find((x) => x.id === wId)?.order?.item === "Signed" && pg.today === TODAY, JSON.stringify(pg));
  eq("the Deals page: a list switched off, an archived tab, another user's or unknown", [(await loadDealsPage(U, "wbOff", NOW, db)).kind, (await loadDealsPage(U, "wbOld", NOW, db)).kind, (await loadDealsPage("u2", "wb1", NOW, db)).kind], ["off", "archived", "gone"]);
  await createDealCore(U, "wb1", { title: "Open one", customerId: "cu1" }, NOW, db);
  const mine = await loadCustomerDeals(U, "wb1", "cu1", db);
  eq("a customer's deals: the open ones first, then the closed (newest closed first); none where the list is off", [mine?.map((x) => [x.title, x.stage]), await loadCustomerDeals(U, "wbOff", "cu1", db)], [[["Open one", "NEW"], ["NBN 100 plan", "LOST"]], null]);
}

async function scheduledCollections() {
  section("a scheduled task's collection (scheduled-tasks-server.ts)");
  const db = new MemSched();
  db.boards.set("wb1", { id: "wb1", userId: U, name: "Acme", archivedAt: null, crmOn: true });
  db.boards.set("wb2", { id: "wb2", userId: U, name: "Other", archivedAt: null, crmOn: true });
  for (const [id, boardId] of [["cu1", "wb1"], ["cu2", "wb1"], ["cuX", "wb2"]] as const) db.people.set(id, { id, userId: U, boardId, number: id.toUpperCase(), name: id, phone: null, archivedAt: null });
  const coll = (id: string, customerId: string, boardId = "wb1", o: Partial<ScheduledCollectionRow> = {}) => db.colls.set(id, { id, userId: U, boardId, customerId, name: `Coll ${id}`, closedAt: null, archivedAt: null, ...o });
  coll("co1", "cu1");
  coll("coOther", "cu2");
  coll("coTab", "cuX", "wb2");
  coll("coClosed", "cu1", "wb1", { closedAt: new Date(0) });
  coll("coArch", "cu1", "wb1", { archivedAt: new Date(0) });
  const input = (o: Record<string, unknown> = {}) => ({ title: "Ring", when: "2026-10-21T09:30", channel: "CALL", customerId: "cu1", ...o });
  eq("input: a collection's id is id-shaped ('' and null are none)", [cleanScheduledInput(input({ collectionId: "../x" })), (cleanScheduledInput(input({ collectionId: "" })) as { value: { collectionId: unknown } }).value.collectionId, (cleanScheduledInput(input()) as { value: { collectionId: unknown } }).value.collectionId], [err(SCHEDULED_COLLECTION_BAD), null, undefined]);
  eq(
    "gate: one of the task's own customer's, on this tab, neither closed nor archived; no customer, no collection",
    [await createScheduledCore(U, "wb1", input({ collectionId: "co1", customerId: "" }), db), await createScheduledCore(U, "wb1", input({ collectionId: "coOther" }), db), await createScheduledCore(U, "wb1", input({ collectionId: "coTab" }), db), await createScheduledCore(U, "wb1", input({ collectionId: "coClosed" }), db), await createScheduledCore(U, "wb1", input({ collectionId: "coArch" }), db), await createScheduledCore(U, "wb1", input({ collectionId: "nope" }), db)],
    [err(SCHEDULED_COLLECTION_NO_CUSTOMER), err(SCHEDULED_COLLECTION_OTHER), err(SCHEDULED_COLLECTION_GONE), err(SCHEDULED_COLLECTION_CLOSED), err(SCHEDULED_COLLECTION_ARCHIVED), err(SCHEDULED_COLLECTION_GONE)]
  );
  check("gate: the refusals wrote nothing", db.rows.length === 0);
  const made = await createScheduledCore(U, "wb1", input({ collectionId: "co1" }), db);
  const id = made.ok ? made.value.id : "";
  check("create: in the collection; the view names it (the row's chip)", made.ok && db.rows[0].collectionId === "co1" && made.value.collection?.name === "Coll co1", JSON.stringify(made));
  db.colls.get("co1")!.closedAt = new Date(0);
  check("edit: a collection closed since stays while the edit leaves it (left out, or the same id)", (await editScheduledCore(U, id, input({ title: "Ring again" }), db)).ok && db.rows[0].collectionId === "co1" && (await editScheduledCore(U, id, input({ collectionId: "co1" }), db)).ok && db.rows[0].collectionId === "co1");
  check("edit: another customer (the collection left out) takes the task out of it", (await editScheduledCore(U, id, input({ customerId: "cu2" }), db)).ok && db.rows[0].collectionId === null && db.rows[0].customerId === "cu2");
  check("edit: none clears it", (await editScheduledCore(U, id, input({ customerId: "cu2", collectionId: "coOther" }), db)).ok && db.rows[0].collectionId === "coOther" && (await editScheduledCore(U, id, input({ customerId: "cu2", collectionId: null }), db)).ok && db.rows[0].collectionId === null);
  const base = { id: "s", userId: U, boardId: "wb1", customerId: null, dueAt: NOW, allDay: false, title: "t", detail: null, channel: "CALL", remind: true, remindSentAt: null, doneAt: null, archivedAt: null, customer: null };
  eq("the view: an archived collection draws no chip; none without one", [scheduledViewOf({ ...base, collection: { id: "c", name: "Gone", archivedAt: new Date(0) } }).collection, scheduledViewOf({ ...base, collection: { id: "c", name: "Here", archivedAt: null } }).collection, scheduledViewOf(base).collection], [null, { id: "c", name: "Here" }, null]);
}

function customerFields() {
  section("a customer's new fields (customers-server.ts customerFieldsOf)");
  const add = customerFieldsOf({ number: "1", name: "Jane" });
  eq("add: Customer, no tags, none", add.ok ? [add.value.status, add.value.tags, add.value.email, add.value.company, add.value.address] : add, ["CUSTOMER", [], null, null, null]);
  const prev = { status: "PROSPECT", tags: ["vip"], email: "j@a.com", company: "Acme", address: "1 Main St" };
  const kept = customerFieldsOf({ number: "1", name: "Jane" }, prev);
  eq("edit: each left out keeps the customer's own", kept.ok ? [kept.value.status, kept.value.tags, kept.value.email, kept.value.company, kept.value.address] : kept, ["PROSPECT", ["vip"], "j@a.com", "Acme", "1 Main St"]);
  const set = customerFieldsOf({ number: "1", name: "Jane", status: "INACTIVE", tags: ["#NBN", "nbn"], email: "", company: " Fibre  Co ", address: "" }, prev);
  eq("edit: each sent is cleaned (an empty one is none)", set.ok ? [set.value.status, set.value.tags, set.value.email, set.value.company, set.value.address] : set, ["INACTIVE", ["nbn"], null, "Fibre Co", null]);
  eq("refusals: a stray status, a bad email, too many tags", [customerFieldsOf({ number: "1", name: "J", status: "VIP" }), customerFieldsOf({ number: "1", name: "J", email: "nope" }), customerFieldsOf({ number: "1", name: "J", tags: Array.from({ length: 9 }, (_, i) => `t${i}`) })], [err(STATUS_BAD), err(CUSTOMER_EMAIL_BAD), err(TAGS_MANY)]);
}

// ── 5. The migration and the schema ────────────────────────────────────────
function sql() {
  section("the migration and the schema");
  const path = "prisma/migrations/20261228000000_crm/migration.sql";
  check("the migration exists", existsSync(join(ROOT, path)));
  const mig = read(path);
  const m = mig.replace(/--[^\n]*\n/g, "\n");
  check("one transaction (BEGIN … COMMIT)", /^BEGIN;$/m.test(mig) && mig.trimEnd().endsWith("COMMIT;"));
  check("additive: no DROP, DELETE, TRUNCATE, UPDATE, INSERT (no backfill beyond the defaults), no retyped or renamed column", !/\bDROP\b|DELETE FROM|\bTRUNCATE\b|^\s*UPDATE\s|INSERT INTO|ALTER COLUMN|RENAME/im.test(m));
  check(
    "Customer: status (NOT NULL, CUSTOMER by default, its CHECK), tags (an array, empty by default), email, company, address",
    m.includes(`ALTER TABLE "public"."Customer" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'CUSTOMER';`) &&
      m.includes(`ALTER TABLE "public"."Customer" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];`) &&
      ["email", "company", "address"].every((c) => m.includes(`ALTER TABLE "public"."Customer" ADD COLUMN "${c}" TEXT;`)) &&
      m.includes(`ADD CONSTRAINT "Customer_status_check" CHECK ("status" IN ('LEAD', 'PROSPECT', 'CUSTOMER', 'INACTIVE'));`)
  );
  check("WorkBoard: followUpDays (nullable, 30 by default) and its range CHECK", m.includes(`ALTER TABLE "public"."WorkBoard" ADD COLUMN "followUpDays" INTEGER DEFAULT 30;`) && m.includes(`"WorkBoard_followUpDays_check" CHECK ("followUpDays" IS NULL OR ("followUpDays" >= 1 AND "followUpDays" <= 365))`));
  check("ScheduledTask: collectionId (nullable), its index and key (SET NULL)", m.includes(`ALTER TABLE "public"."ScheduledTask" ADD COLUMN "collectionId" TEXT;`) && m.includes(`CREATE INDEX "ScheduledTask_collectionId_idx" ON "public"."ScheduledTask"("collectionId");`) && m.includes(`FOREIGN KEY ("collectionId") REFERENCES "public"."TaskCollection"("id") ON DELETE SET NULL`));
  const table = (name: string) => new RegExp(`CREATE TABLE "public"\\."${name}" \\(([\\s\\S]*?)\\n\\);`).exec(m)?.[1] ?? "";
  const cc = table("CustomerCheck");
  const tc = table("TaskCollection");
  const dl = table("Deal");
  check("CustomerCheck: Rate, Home, Work (optional), Record at (a DATE, required), archived, timestamptz", ['"rate" TEXT,', '"home" TEXT,', '"work" TEXT,', '"recordedAt" DATE NOT NULL', '"archivedAt" TIMESTAMPTZ(3)', '"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP', '"updatedAt" TIMESTAMPTZ(3) NOT NULL'].every((c) => cc.includes(c)) && m.includes(`"CustomerCheck_some_check" CHECK ("rate" IS NOT NULL OR "home" IS NOT NULL OR "work" IS NOT NULL)`));
  check("TaskCollection: the tab, the customer, a name, an order, a note, closed and archived, timestamptz", ['"boardId" TEXT NOT NULL', '"customerId" TEXT NOT NULL', '"name" TEXT NOT NULL', '"orderId" TEXT,', '"note" TEXT,', '"closedAt" TIMESTAMPTZ(3)', '"archivedAt" TIMESTAMPTZ(3)', '"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP'].every((c) => tc.includes(c)));
  check(
    "Deal: the tab, a customer (optional), title, valueCents (≥ 0), stage (NEW by default; the four), its close day (DATE), note, closedAt, its order, sortOrder, archived, timestamptz",
    ['"customerId" TEXT,', '"title" TEXT NOT NULL', '"valueCents" INTEGER NOT NULL DEFAULT 0', `"stage" TEXT NOT NULL DEFAULT 'NEW'`, '"expectedCloseDay" DATE,', '"note" TEXT,', '"closedAt" TIMESTAMPTZ(3),', '"orderId" TEXT,', '"sortOrder" INTEGER NOT NULL DEFAULT 0', '"archivedAt" TIMESTAMPTZ(3),', '"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP'].every((c) => dl.includes(c)) &&
      m.includes(`"Deal_stage_check" CHECK ("stage" IN ('NEW', 'QUOTED', 'WON', 'LOST'))`) &&
      m.includes(`"Deal_valueCents_check" CHECK ("valueCents" >= 0)`)
  );
  check("every new timestamp is timestamptz (no TIMESTAMP(3) without a zone)", [cc, tc, dl].every((t) => t !== "" && !/TIMESTAMP\(3\)/.test(t)));
  check("indexes: a customer's checks by day; collections by customer, tab and order; the pipeline (board, stage, sortOrder), a customer's deals, an order's", ['"CustomerCheck_customerId_recordedAt_idx"', '"TaskCollection_customerId_closedAt_idx"', '"TaskCollection_boardId_closedAt_idx"', '"TaskCollection_orderId_idx"', '"Deal_boardId_stage_sortOrder_idx" ON "public"."Deal"("boardId", "stage", "sortOrder")', '"Deal_customerId_idx"', '"Deal_orderId_idx"'].every((c) => m.includes(c)));
  const fk = (from: string, col: string, to: string, rule: string) => m.includes(`ALTER TABLE "public"."${from}" ADD CONSTRAINT "${from}_${col}_fkey" FOREIGN KEY ("${col}") REFERENCES "public"."${to}"("id") ON DELETE ${rule} ON UPDATE CASCADE;`);
  check(
    "keys: a tab's rows RESTRICT; a customer's own checks and collections RESTRICT; a deal's customer, and every order link, SET NULL",
    fk("CustomerCheck", "customerId", "Customer", "RESTRICT") && fk("TaskCollection", "boardId", "WorkBoard", "RESTRICT") && fk("TaskCollection", "customerId", "Customer", "RESTRICT") && fk("TaskCollection", "orderId", "WorkOrder", "SET NULL") && fk("Deal", "boardId", "WorkBoard", "RESTRICT") && fk("Deal", "customerId", "Customer", "SET NULL") && fk("Deal", "orderId", "WorkOrder", "SET NULL") && fk("ScheduledTask", "collectionId", "TaskCollection", "SET NULL")
  );
  check("the target is named (the xtnl-idea Supabase project only), and the CHECKs Prisma can't declare are listed", /Target: the xtnl-idea Supabase project ONLY/.test(mig) && ["Customer_status_check", "WorkBoard_followUpDays_check", "CustomerCheck_some_check", "Deal_stage_check", "Deal_valueCents_check"].every((c) => mig.includes(c)));

  const raw = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
  const schema = raw.replace(/\r\n/g, "\n");
  const model = (name: string) => (new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema)?.[1] ?? "").replace(/[ \t]+/g, " ");
  check("schema: Customer's new fields", ['status String @default("CUSTOMER")', "tags String[] @default([])", "email String?", "company String?", "address String?", "checks CustomerCheck[]", "collections TaskCollection[]", "deals Deal[]"].every((c) => model("Customer").includes(c)));
  check("schema: WorkBoard.followUpDays (Int?, 30) and its collections and deals", ["followUpDays Int? @default(30)", "collections TaskCollection[]", "deals Deal[]"].every((c) => model("WorkBoard").includes(c)));
  check("schema: ScheduledTask.collectionId (SetNull) and its index", ["collectionId String?", "collection TaskCollection? @relation(fields: [collectionId], references: [id], onDelete: SetNull)", "@@index([collectionId])"].every((c) => model("ScheduledTask").includes(c)));
  check("schema: CustomerCheck (a @db.Date day; timestamptz)", ["recordedAt DateTime @db.Date", "archivedAt DateTime? @db.Timestamptz(3)", "createdAt DateTime @default(now()) @db.Timestamptz(3)", "onDelete: Restrict", "@@index([customerId, recordedAt])"].every((c) => model("CustomerCheck").includes(c)));
  check("schema: TaskCollection (tab and customer RESTRICT, order SET NULL, timestamptz)", ["board WorkBoard @relation(fields: [boardId], references: [id], onDelete: Restrict)", "customer Customer @relation(fields: [customerId], references: [id], onDelete: Restrict)", "order WorkOrder? @relation(fields: [orderId], references: [id], onDelete: SetNull)", "closedAt DateTime? @db.Timestamptz(3)", "tasks ScheduledTask[]"].every((c) => model("TaskCollection").includes(c)));
  check("schema: Deal (the stage NEW, value 0, the close day a @db.Date, customer and order SET NULL, timestamptz)", ['stage String @default("NEW")', "valueCents Int @default(0)", "expectedCloseDay DateTime? @db.Date", "customer Customer? @relation(fields: [customerId], references: [id], onDelete: SetNull)", "order WorkOrder? @relation(fields: [orderId], references: [id], onDelete: SetNull)", "sortOrder Int @default(0)", "@@index([boardId, stage, sortOrder])"].every((c) => model("Deal").includes(c)));
  check("schema: the CHECKs Prisma can't declare are named on their models", ['CHECK "Customer_status_check"', 'CHECK "WorkBoard_followUpDays_check"', 'CHECK "CustomerCheck_some_check"', 'CHECK "Deal_stage_check"', 'CHECK "Deal_valueCents_check"'].every((c) => schema.includes(c)));
  check("schema: still CRLF (as checked in)", raw.includes("\r\n") && !/[^\r]\n/.test(raw));
}

// ── 6. The wiring ──────────────────────────────────────────────────────────
function wiring() {
  section("the wiring");
  const dir = "src/app/today/work/[boardId]";
  check("route /deals: a page and its skeleton", existsSync(join(ROOT, `${dir}/deals/page.tsx`)) && existsSync(join(ROOT, `${dir}/deals/loading.tsx`)));
  const dp = code(`${dir}/deals/page.tsx`);
  check(
    "route /deals: params awaited (Next 16: a Promise), force-dynamic, one read, a 404 when gone, '<tab> · Deals', the list's gate when off",
    /params: Promise<\{ boardId: string \}>/.test(dp) && /await params/.test(dp) && /export const dynamic = "force-dynamic";/.test(dp) && /loadDealsPage\(getCurrentUserId\(\), boardId, new Date\(\)\)/.test(dp) && /if \(page\.kind === "gone"\) notFound\(\);/.test(dp) && /<ShellTitle eyebrow=\{page\.board\.name\} title="Deals" \/>/.test(dp) && /<CrmGate board=\{page\.board\} kind=\{page\.kind\} offNote=/.test(dp)
  );
  const cp = code(`${dir}/customers/[customerId]/page.tsx`);
  check("route /customers/[id]: the checks, collections and follow-up (crm-server) and the deals in the same wave, each failing to no section", /loadCustomerCrm\(getCurrentUserId\(\), boardId, customerId, now\)\.catch\(/.test(cp) && /loadCustomerDeals\(getCurrentUserId\(\), boardId, customerId\)\.catch\(/.test(cp) && /tab=\{customerTabOf\(query, \{ ordersOn \}\)\}/.test(cp));
  check("route /today/work/[id] (Agenda): the follow-ups in the same wave as the agenda (a failed read is no section)", /Promise\.all\(\[\s*loadAgenda\(getCurrentUserId\(\), boardId, \{ now, query \}\),\s*loadFollowUps\(getCurrentUserId\(\), boardId, now\)\.catch\(/.test(code(`${dir}/page.tsx`)) && /followUps=\{followUps\}/.test(code(`${dir}/page.tsx`)));

  // The actions: 'use server', each through a core with the current user, never throwing.
  for (const [file, names] of [
    ["src/app/actions/crm.ts", ["setFollowUpDays", "setCustomerStatus", "addCustomerCheck", "editCustomerCheck", "archiveCustomerCheck", "restoreCustomerCheck", "createTaskCollection", "editTaskCollection", "closeTaskCollection", "archiveTaskCollection", "restoreTaskCollection", "customerOrderOptions"]],
    ["src/app/actions/deals.ts", ["createDeal", "editDeal", "moveDeal", "archiveDeal", "restoreDeal", "createOrderFromDeal"]],
  ] as const) {
    const src = code(file);
    const exported = [...src.matchAll(/export async function (\w+)\(([^)]*)\)[^{]*\{([\s\S]*?)\n\}/g)].map((x) => ({ name: x[1], body: x[3] }));
    eq(`${file}: its actions`, exported.map((x) => x.name), names);
    check(`${file}: 'use server'; each through a core with the current user; a throw is a line, never a crash`, read(file).trimStart().startsWith('"use server";') && exported.every((x) => /return run\("\w+", (opts|undefined), \(userId\) => \w+Core\(userId, /.test(x.body)) && /catch \(err\) \{[\s\S]*?return \{ ok: false, error:/.test(src));
  }

  // nav: Deals, its title, the tab kept current.
  eq("nav: Deals while the customer list is on (right after Customers), its page, its first-paint title 'Work · Deals', the tab kept current", [workSubsOf({ id: "w1", crmOn: true }).map((s) => s.label), workSubsOf({ id: "w1", ordersOn: true }).map((s) => s.label), workSectionOf("/today/work/w1/deals"), titleFor("/today/work/w1/deals"), activeSub("/today/work/w1/deals")], [["Agenda", "Customers", "Deals", "Tasks"], ["Agenda", "Orders", "Tasks"], "deals", { eyebrow: "Work", title: "Deals" }, "/today/work/w1"]);

  const header = code("src/components/work/WorkHeader.tsx");
  check("header: New › Deal while the customer list is on (the Deals page's ?new=1)", /\.\.\.\(board\.crmOn \? \[\{ id: "deal", label: "Deal", icon: <WorkGlyph icon="money" \/>, onSelect: \(\) => router\.push\(`\$\{dealsHref\(board\.id\)\}\?new=1`\) \}\] : \[\]\)/.test(header));
  const slot = code("src/components/work/WorkHeaderSlot.tsx");
  check("header: the follow-ups' count in the same wave (a failed count is no count); the tab's days handed to the menu", /followUpCountCore\(userId, boardId\)\.catch\(\(\) => null\)/.test(slot) && /followUpDays: board\.followUpDays/.test(slot));
  const menu = code("src/components/work/WorkTabMenu.tsx");
  check("menu: Follow-ups while the list is on: a radio group of Off, 7, 14, 30, 60, 90 days (setFollowUpDays, refreshed)", /\{board\.crmOn && \(/.test(menu) && /<h3 id=\{`\$\{ids\}-follow`\}>Follow-ups<\/h3>/.test(menu) && /role="radiogroup" aria-labelledby=\{`\$\{ids\}-follow`\}/.test(menu) && /FOLLOW_UP_CHOICES\.map\(/.test(menu) && /setFollowUpDays\(board\.id, days, \{ refresh: true \}\)/.test(menu) && /type="radio"/.test(menu));
  const sheet = code("src/components/work/ScheduledTaskSheet.tsx");
  check(
    "the scheduled task sheet: a Collection picker once a customer is chosen (their open ones, 'New collection…' made inline: a name, one of their orders), another customer clears it, and the task carries it",
    /\{showCustomer && customer && \(/.test(sheet) && /<option value=\{NEW_COLLECTION\}>New collection…<\/option>/.test(sheet) && /createTaskCollection\(forCustomer, value\)/.test(sheet) && /customerOrderOptions\(forId\)/.test(sheet) && /collectionId: customer \? collectionId : null/.test(sheet) && /if \(next\?\.id !== customer\?\.id\) \{\s*setCollectionId\(null\);/.test(sheet)
  );
  check("the sheet's order list is read when 'New collection…' opens, never per keystroke", !/onChange=\{\(e\) => \{[^}]*customerOrderOptions/.test(sheet) && (sheet.match(/customerOrderOptions\(/g) ?? []).length === 1);
  const row = code("src/components/work/ScheduledRow.tsx");
  check("an agenda row: its collection's name as a small chip (not on the grouped customer list)", /\{collection && \(\s*<span className="st-coll"/.test(row) && /showCollection = true/.test(row) && /showCollection=\{false\}/.test(code("src/components/customers/CustomerTasks.tsx")));
  const agenda = code("src/components/work/AgendaView.tsx");
  check("Agenda: Follow up right after Today (and under the empty card), the side column's Customers to watch lists the follow-ups (the overdue ones while off)", /return id === "today" && followSection \? \[card, followSection\] : card;/.test(agenda) && /\{followSection\}/.test(agenda) && /<FollowUpList boardId=\{board\.id\} rows=\{follow\} compact \/>/.test(agenda) && /\) : watch\.length === 0 \? \(/.test(agenda));
  const fu = code("src/components/work/FollowUps.tsx");
  check("Schedule follow-up: the sheet prefilled (that customer, 'Follow up with <name>', tomorrow 09:00, a call), nothing saved until Schedule", /openScheduledSheet\(\{ customer: \{ id: c\.id, number: c\.number, name: c\.name \}, \.\.\.followUpTaskOf\(c, new Date\(\)\) \}\)/.test(fu) && !/createScheduledTask/.test(fu));
  const store = code("src/components/work/work-store.ts");
  check("the store: a new task's prefill (title, channel, customer, collection, when)", /when: task \? whenInputOf\(task\.dueAt\) : \(req\.when \?\? defaultWhenOf\(new Date\(\)\)\)/.test(store) && /title: req\.title, channel: req\.channel, customer: req\.customer \?\? null, collection: req\.collection \?\? null/.test(store));
  const co = code("src/components/orders/CustomerOrders.tsx");
  check("a customer's order: 'Start a collection' (prefilled with its item and the order), or the collection it has (a link to Tasks)", /aria-label=\{`Start a collection for \$\{o\.item\}`\}/.test(co) && /initial=\{\{ name: \[\.\.\.collect\.item\]\.slice\(0, COLLECTION_NAME_MAX\)\.join\(""\), note: "", orderId: collect\.id \}\}/.test(co) && /customerTabHref\(board\.id, customer\.id, "tasks"\)/.test(co));
  const dealSheet = code("src/components/deals/DealSheet.tsx");
  check("a Won deal: Create order (the order sheet prefilled), or, with the order list off, its own switch (setOrdersOn)", /onCreateOrder\?\.\(editing\)/.test(dealSheet) && /setOrdersOn\(board\.id, true, \{ refresh: true \}\)/.test(dealSheet) && /initial=\{orderPrefillOf\(order, today\)\}/.test(code("src/components/deals/DealCard.tsx")) && /createOrderFromDeal\(order\.id, value, \{ refresh: true \}\)/.test(code("src/components/deals/DealCard.tsx")));
  check("Move to…: a menu (the work frame's WorkMenu: role=menu, the arrows, Escape), the other stages, each move with Undo", /<WorkMenu\s+label=\{`Move \$\{deal\.title\} to…`\}/.test(code("src/components/deals/DealCard.tsx")) && /moveTargetsOf\(deal\.stage\)\.map/.test(code("src/components/deals/DealCard.tsx")) && /onAction: \(\) => void dealCall\(\(\) => moveDeal\(d\.id, from, \{ refresh: true \}\)\)/.test(code("src/components/deals/DealCard.tsx")));

  // The caches: the follow-ups' facts and the index under 'work'.
  const crmSrv = code("src/lib/crm-server.ts");
  check("caches: the follow-ups' facts cached under 'work'; collection and status writes clear 'work'; the alert 'life' and 'work'", /cached\(`followUps:\$\{userId\}:\$\{boardId\}`, \["work"\], load\)/.test(crmSrv) && (crmSrv.match(/invalidate\("work"\);/g) ?? []).length === 6 && /invalidate\("life", "work"\);/.test(crmSrv));
  const sched = code("src/lib/scheduled-tasks-server.ts");
  check("the index: the customers' company, email, status and tags; their open collections", /company: true, email: true, status: true, tags: true/.test(sched) && /prisma\.taskCollection\.findMany\(\{\s*where: \{ userId, boardId, archivedAt: null, closedAt: null, customer: \{ is: \{ archivedAt: null \} \} \}/.test(sched));

  // The models each core touches; nothing deleted; no game.
  const models = (src: string) => [...new Set([...src.matchAll(/prisma\.(\w+)\./g)].map((x) => x[1]))].sort();
  eq("crm-server touches WorkBoard (followUpDays), Customer, CustomerCheck, TaskCollection, WorkOrder (read), the log and scheduled tasks (read)", models(crmSrv), ["customer", "customerCheck", "customerInteraction", "scheduledTask", "taskCollection", "workBoard", "workOrder"]);
  const dealSrv = code("src/lib/deals-server.ts");
  eq("deals-server touches WorkBoard, Customer (read) and Deal; orders only through the order list's core", models(dealSrv), ["customer", "deal", "workBoard"]);
  check("no row is ever deleted; WorkBoard only has followUpDays written; Customer only its status (here)", ![crmSrv, dealSrv].some((s) => /\.delete(Many)?\(/.test(s)) && /prisma\.workBoard\.updateMany\(\{ where: \{ id: boardId, userId, archivedAt: null \}, data: \{ followUpDays: days \} \}\)/.test(crmSrv) && /prisma\.customer\.updateMany\(\{ where: \{ id: customerId, userId, archivedAt: null \}, data: \{ status \} \}\)/.test(crmSrv) && !/prisma\.workOrder\.(create|update|upsert)/.test(crmSrv + dealSrv));
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f)) files.push(p);
    }
  };
  walk(join(ROOT, "src/components/deals"));
  for (const f of ["src/lib/crm.ts", "src/lib/crm-server.ts", "src/lib/deals.ts", "src/lib/deals-server.ts", "src/app/actions/crm.ts", "src/app/actions/deals.ts", "src/components/customers/CustomerOverview.tsx", "src/components/customers/CustomerTasks.tsx", "src/components/customers/CustomerChecks.tsx", "src/components/customers/CollectionSheet.tsx", "src/components/customers/TagField.tsx", "src/components/customers/StatusChip.tsx", "src/components/work/FollowUps.tsx", "src/components/work/CustomerPicker.tsx"]) files.push(join(ROOT, f));
  const game = files.filter((p) => /from "@\/lib\/celebrate"|PricePill|Crest|MomentumCard|activityEvent|ActivityEvent|lifeXp|awardXp|\bfmtXp\b|\bstreak\b|invalidate\("(activity|progress|ideas|fields)"/.test(readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1")));
  check("no game: no celebration, price, crest, momentum, ledger, XP, streak or game cache in the Phase 2 code", game.length === 0, game.map((p) => relative(ROOT, p)).join(", "));

  // package.json.
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  const ui = pkg.scripts["ui:check"].split("&&").map((s) => s.trim());
  check("package.json: crm:check runs it alone; ui:check runs it after push-check, still ending with roadmap-ui-check", pkg.scripts["crm:check"] === "tsx scripts/crm-check.ts" && ui[ui.indexOf("tsx scripts/push-check.ts") + 1] === "tsx scripts/crm-check.ts" && pkg.scripts["ui:check"].endsWith(" && tsx scripts/roadmap-ui-check.ts"));
}

// ── 7. The UI pins ─────────────────────────────────────────────────────────
function ui() {
  section("the UI pins");
  const view = code("src/components/customers/CustomerView.tsx");
  check(
    "tabs: a tablist (role=tablist, each role=tab with aria-selected and aria-controls), roving focus (one Tab stop), the arrows, Home and End",
    /role="tablist"/.test(view) && /role="tab"/.test(view) && /aria-selected=\{t === tab\}/.test(view) && /aria-controls=\{`\$\{ids\}-panel`\}/.test(view) && /tabIndex=\{t === tab \? 0 : -1\}/.test(view) && /const next = nextTabIndex\(e\.key, at, tabs\.length\);/.test(view) && /role="tabpanel" aria-labelledby=\{`\$\{ids\}-tab-\$\{tab\}`\}/.test(view)
  );
  check("tabs: ?tab= kept with replaceState (Overview is the bare page; leaving Tasks drops ?task=); a link to another ?tab= is followed", /window\.history\.replaceState\(null, ""/.test(view) && /if \(t === "overview"\) params\.delete\(TAB_PARAM\);/.test(view) && /if \(t !== "tasks"\) params\.delete\(TASK_PARAM\);/.test(view) && /if \(asked !== askedTab\) \{\s*setAsked\(askedTab\);\s*setTabState\(askedTab\);\s*\}/.test(view));
  check("tabs: every one drawn where it belongs (Overview, Tasks, Check, Info, History, Orders, Deals)", ['tab === "overview"', 'tab === "tasks"', 'tab === "check"', 'tab === "info"', 'tab === "history"', 'tab === "orders"', 'tab === "deals"'].every((s) => view.includes(s)));
  check("the header on every tab: the status (a menu of the four) and the tags", /label=\{`Status: \$\{STATUS_LABEL\[customer\.status\]\}\. Change it`\}/.test(view) && /CUSTOMER_STATUSES\.map\(\(s\) => \(\{ id: s, label: STATUS_LABEL\[s\]/.test(view) && /setCustomerStatus\(customer\.id, status, \{ refresh: true \}\)/.test(view));
  const checks = code("src/components/customers/CustomerChecks.tsx");
  const sheets = code("src/components/customers/CustomerSheets.tsx");
  check("Check: its words come from CHECK_LABELS (Rate, Home, Work, Record at), the day today unless picked and never after it", /CHECK_LABELS\.recordedAt/.test(checks) && /CHECK_LABELS\[f\]/.test(checks) && /label=\{CHECK_LABELS\.recordedAt\}/.test(sheets) && /type="date" value=\{v\.recordedAt\} min="2000-01-01" max=\{today\}/.test(sheets) && /cleanCheckInput\(v, today\)/.test(sheets));
  check("Check: archive with Undo", /title: "Check archived"[\s\S]*?label: "Undo"[\s\S]*?restoreCustomerCheck\(c\.id/.test(checks));
  check("the customer sheet: status (a radio group of the four), email, company, address, tags (the tab's recent ones offered)", /CUSTOMER_STATUSES\.map\(\(s\) => \(\s*<label key=\{s\} className="crm-chip crm-chip-plain">\s*<input type="radio"/.test(sheets) && /label="Email"/.test(sheets) && /label="Company"/.test(sheets) && /label="Address"/.test(sheets) && /<TagField/.test(sheets) && /recent=\{recentTags\}/.test(sheets));
  const tags = code("src/components/customers/TagField.tsx");
  check("tags: Enter or a comma adds, Backspace takes the last off, a chip removes itself (named), the recent ones offered (named)", /e\.key === "Enter" \|\| e\.key === ","/.test(tags) && /e\.key === "Backspace" && typed === "" && tags\.length > 0/.test(tags) && /aria-label=\{`Remove the tag \$\{t\}`\}/.test(tags) && /aria-label=\{`Add the tag \$\{s\}`\}/.test(tags) && /tagSuggestionsOf\(recent, typed, tags\)/.test(tags));
  const list = code("src/components/customers/CustomersView.tsx");
  check("the list: filters by status (a radio strip with counts) and tag (a select), both in the address (replaceState), over the search too; a status chip on every row", /STATUS_FILTERS\.map\(\(f\) => \(/.test(list) && /params\.set\(STATUS_PARAM, statusParamOf\(s\)\)/.test(list) && /params\.set\(TAG_PARAM, t\)/.test(list) && /const index = useMemo\(\(\) => prepareIndex\(filtered\), \[filtered\]\);/.test(list) && /<StatusChip status=\{c\.status\} \/>/.test(list));
  check("the list: the follow-ups first (#follow-up, the Agenda's See all), each with Schedule follow-up", /id=\{FOLLOW_UP_ANCHOR\}/.test(list) && /<FollowUpList boardId=\{board\.id\} rows=\{follow\} max=\{LIST_MAX\} \/>/.test(list));
  const tasks = code("src/components/customers/CustomerTasks.tsx");
  check("Tasks: grouped by collection with progress and its order chip, Add a task (named) and Close / Open again; No collection last; the closed folded", /groupByCollection\(tasks, collections\)/.test(tasks) && /progressLabel\(g\.progress\)/.test(tasks) && /aria-label=\{`Add a task to \$\{c\.name\}`\}/.test(tasks) && /\{c\.closedAt \? "Open again" : "Close"\}/.test(tasks) && /\{grouped\.open\.map\(group\)\}\s*\{grouped\.none && group\(grouped\.none\)\}/.test(tasks) && /Closed collections · \{grouped\.closed\.length\}/.test(tasks) && /className="st-chip crm-coll-order"/.test(tasks));
  check("Tasks: a collection's Add a task opens the sheet with its customer and collection set", /openScheduledSheet\(\{ customer, collection: \{ id: c\.id, name: c\.name \} \}\)/.test(tasks));
  const deals = code("src/components/deals/DealsView.tsx");
  check("Deals: the stage switch (a radio group, ?stage= kept with replaceState) and four columns with their count and total", /<fieldset className="dl-switch">/.test(deals) && /type="radio" name=\{`\$\{id\}-stage`\}/.test(deals) && /params\.set\(STAGE_PARAM, s\.toLowerCase\(\)\)/.test(deals) && /data-active=\{stage === s \? "" : undefined\}/.test(deals) && /stageTotalLine\(totals\[s\]\)/.test(deals));
  check("Deals: ?new=1 opens Add deal on arrival, then leaves the address", /searchParams\.get\("new"\) === "1"/.test(deals) && /params\.delete\("new"\);/.test(deals));

  // Empty states: every new list says so.
  const empties: [string, RegExp][] = [
    ["src/components/deals/DealsView.tsx", /No deals yet/],
    ["src/components/deals/DealsView.tsx", /No deals here\./],
    ["src/components/deals/CustomerDeals.tsx", /No deals for \{customer\.name\} yet\./],
    ["src/components/customers/CustomerChecks.tsx", /No checks yet\./],
    ["src/components/customers/CustomerTasks.tsx", /No tasks yet\. Add one with \+\./],
    ["src/components/customers/CustomerTasks.tsx", /Nothing scheduled\./],
    ["src/components/customers/CustomerOverview.tsx", /No contact details yet\./],
    ["src/components/customers/CustomerOverview.tsx", /None open\./],
    ["src/components/customers/CustomersView.tsx", /No customer here/],
    ["src/components/work/FollowUps.tsx", /Everyone is in touch/],
  ];
  const missing = empties.filter(([f, re]) => !re.test(read(f)));
  check("every new list has an empty state", missing.length === 0, missing.map(([f, re]) => `${f} ${re}`).join(", "));

  // Live regions only where Phase 1 has them (the pickers' count line).
  const newFiles = ["src/components/deals/DealsView.tsx", "src/components/deals/DealCard.tsx", "src/components/deals/DealSheet.tsx", "src/components/deals/CustomerDeals.tsx", "src/components/customers/CustomerOverview.tsx", "src/components/customers/CustomerTasks.tsx", "src/components/customers/CustomerChecks.tsx", "src/components/customers/CollectionSheet.tsx", "src/components/customers/TagField.tsx", "src/components/work/FollowUps.tsx"];
  const live = newFiles.filter((f) => /aria-live/.test(read(f)));
  check("no new live region (the picker's count line is Phase 1's own)", live.length === 0 && (read("src/components/work/CustomerPicker.tsx").match(/aria-live="polite"/g) ?? []).length === 1, live.join(", "));
  check("icon-only buttons are named (Add a task, Schedule follow-up, a tag's ×, the picker's ×)", /aria-label=\{`Add a task to/.test(tasks) && /aria-label=\{`Schedule follow-up with \$\{f\.customer\.name\}`\}/.test(code("src/components/work/FollowUps.tsx")) && /aria-label=\{`Remove the customer \$\{customerLabelOf\(value\)\}`\}/.test(code("src/components/work/CustomerPicker.tsx")));

  // CSS: tokens only, 44 px targets, no text under 12 px, colour-only transitions.
  const deCss = read("src/components/deals/deals.css");
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
  const cuCss = strip(read("src/components/customers/customers.css"));
  const woCss = strip(read("src/components/work/work.css"));
  const orCss = strip(read("src/components/orders/orders.css"));
  const de = strip(deCss);
  check("deals.css: the layer order first, then @layer components; tokens only (no hex, rgb() or hsl())", deCss.startsWith("@layer theme, base, components, art, effects, utilities;") && /@layer components \{/.test(de) && !/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(de));
  check("customers.css, work.css and orders.css stay tokens only", [cuCss, woCss, orCss].every((c) => !/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(c)));
  const rule = (css: string, sel: string) => new RegExp(`(?:^|\\})\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "m").exec(css)?.[1] ?? "";
  const minH = (css: string, sel: string) => Number(/min-height:\s*(\d+)px/.exec(rule(css, sel))?.[1] ?? 0);
  const targets: [string, string][] = [
    [cuCss, ".crm-tab"],
    [cuCss, ".crm-seg-o"],
    [cuCss, ".crm-status-btn"],
    [cuCss, ".crm-ov-btn"],
    [cuCss, ".crm-check-btn"],
    [cuCss, ".crm-coll-name"],
    [cuCss, ".crm-coll-act"],
    [cuCss, ".crm-ov-v"],
    [orCss, ".ord-mini-act"],
    [de, ".dl-seg"],
    [de, ".dl-open"],
    [woCss, ".wk-follow-who"],
  ];
  const small = targets.filter(([css, sel]) => minH(css, sel) < 44);
  check("every new control is a 44 px target (the tabs, the filters, the status menu, the Overview, a check, a collection, an order's action, the switch, a deal, a follow-up)", small.length === 0, small.map(([, s]) => s).join(", "));
  check("the tag chips are 44 px targets", /\.crm-tag-x, \.crm-tag-sug \{[^}]*min-height: 44px;/.test(cuCss));
  check("deals.css: no text under 12 px; transitions change colour only", [...de.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?(\d+(?:\.\d+)?)px/g)].every((x) => Number(x[1]) >= 12) && [...de.matchAll(/transition:([^;]*);/g)].every((x) => !/width|height|margin|padding|top|left|transform/.test(x[1])));
  check("Phase 2's own rules in customers.css: no text under 12 px", [...cuCss.slice(cuCss.indexOf(".crm-chip-plain")).matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?(\d+(?:\.\d+)?)px/g)].every((x) => Number(x[1]) >= 12));
  check("overdue in the owed ink (a deal past its day, a follow-up's overdue), never an alarm red", /\.dl-when\[data-overdue\] \{ color: var\(--owed\);/.test(de) && /\.wk-follow-owed \{ color: var\(--owed\);/.test(woCss));
}

/** The Phase 2 views, rendered with next/navigation stubbed. */
async function render() {
  section("the renders");
  const M = Module as unknown as { _load: (req: string, parent: unknown, isMain: boolean) => unknown; _extensions: Record<string, (m: { exports: unknown }) => void> };
  const load = M._load;
  M._extensions[".css"] = (m) => {
    m.exports = {};
  };
  M._load = function (req: string, parent: unknown, isMain: boolean) {
    if (req === "next/navigation") return { useRouter: () => ({ refresh() {}, push() {}, replace() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/today/work/wb1" };
    return load.call(this, req, parent, isMain);
  };
  try {
    const { DealsView } = await import("../src/components/deals/DealsView");
    const dv = (id: string, stage: DealStage, valueCents: number, over: Partial<DealView> = {}): DealView => ({ id, boardId: "wb1", title: `Deal ${id}`, valueCents, stage, expectedCloseDay: null, note: null, closedAt: null, order: null, sortOrder: 1, createdAt: NOW.toISOString(), customer: null, ...over });
    const list = [dv("n1", "NEW", 125000, { customer: { id: "cu1", number: "C-1", name: "Jane", phone: null }, expectedCloseDay: "2026-10-12" }), dv("q1", "QUOTED", 5000), dv("w1", "WON", 99900, { order: { id: "wo1", item: "Modem" }, closedAt: NOW.toISOString() }), dv("w2", "WON", 100)];
    const html = renderToStaticMarkup(createElement(DealsView, { board: { id: "wb1", name: "Acme", ordersOn: true }, deals: list, today: TODAY }));
    check("render Deals: four columns, New the phone's one (data-active), each with its count and total", (html.match(/class="card dl-col"/g) ?? []).length === 4 && /data-stage="NEW" data-active=""/.test(html) && !/data-stage="WON" data-active/.test(html) && html.includes("1 deal · $1,250") && html.includes("2 deals · $1,000"));
    check("render Deals: the head's open value and the switch's four radios with counts", html.includes("$1,300") && (html.match(/type="radio"/g) ?? []).length === 4 && /Quoted<span class="ord-n">1<\/span>/.test(html));
    check("render Deals: a card's title and value, its customer chip, Overdue in words, Move to… (a menu), a Won one's order chip or Create order", html.includes("Deal n1") && /<a class="st-chip" href="\/today\/work\/wb1\/customers\/cu1">Jane · C-1<\/a>/.test(html) && html.includes("Overdue · 12 Oct") && /aria-haspopup="menu"[^>]*>.*?Move to…/.test(html.replace(/\n/g, "")) && html.includes("Modem") && html.includes("Create order"));
    const empty = renderToStaticMarkup(createElement(DealsView, { board: { id: "wb1", name: "Acme", ordersOn: false }, deals: [], today: TODAY }));
    check("render Deals: nothing yet is one calm card and Add the first deal (no switch, no columns)", empty.includes("No deals yet") && empty.includes("Add the first deal") && !empty.includes("dl-switch") && !empty.includes("dl-col"));

    const { CustomerChecks } = await import("../src/components/customers/CustomerChecks");
    const ch = renderToStaticMarkup(createElement(CustomerChecks, { customer: { id: "cu1", name: "Jane" }, checks: [{ id: "k1", rate: "$65/mo", home: null, work: "Acme", recordedAt: TODAY, createdAt: NOW.toISOString() }], today: TODAY }));
    check("render Check: 'Record at Today', only the filled fields with their words, Add check", ch.includes("Record at Today") && ch.includes("<dt>Rate</dt><dd>$65/mo</dd>") && ch.includes("<dt>Work</dt><dd>Acme</dd>") && !ch.includes("<dt>Home</dt>") && ch.includes("Add check"));
    check("render Check: empty is one line", renderToStaticMarkup(createElement(CustomerChecks, { customer: { id: "cu1", name: "Jane" }, checks: [], today: TODAY })).includes("No checks yet."));

    const { FollowUpSection } = await import("../src/components/work/FollowUps");
    const fus = followUpsOf([{ id: "cu1", number: "C-1", name: "Jane", phone: null, status: "LEAD", createdAt: NOW.getTime() - 42 * DAY, lastInteractionAt: null, lastDoneAt: null, open: [{ dueAt: new Date(NOW.getTime() - 60_000).toISOString(), allDay: false }] }], 30, NOW, TZ);
    const fh = renderToStaticMarkup(createElement(FollowUpSection, { boardId: "wb1", rows: fus, days: 30 }));
    check("render Follow up: the customer (a link), why (the overdue part in the owed ink), Schedule follow-up (named)", fh.includes(">Follow up<") && /href="\/today\/work\/wb1\/customers\/cu1"/.test(fh) && fh.includes('<span class="wk-follow-owed">1 overdue</span>') && fh.includes("No contact for 42 days") && fh.includes('aria-label="Schedule follow-up with Jane"'));
    check("render Follow up: nobody is one calm line", renderToStaticMarkup(createElement(FollowUpSection, { boardId: "wb1", rows: [], days: 30 })).includes("Everyone is in touch"));

    const { AgendaView } = await import("../src/components/work/AgendaView");
    const sv = (id: string, dueAt: Date, over: Partial<ScheduledView> = {}): ScheduledView => ({ id, boardId: "wb1", dueAt: dueAt.toISOString(), allDay: false, title: `Task ${id}`, detail: null, channel: "CALL", remind: true, remindSentAt: null, doneAt: null, customer: null, ...over });
    const ah = renderToStaticMarkup(createElement(AgendaView, { board: { id: "wb1", name: "Acme", crmOn: true }, rows: [sv("t1", syd("2026-10-20T17:00"), { collection: { id: "co1", name: "New NBN service" } })], focus: null, focusMissing: false, nowIso: NOW.toISOString(), followUps: { days: 30, rows: fus } }));
    check("render Agenda: Follow up right after Today; the side column lists the follow-ups; a row's collection chip", ah.indexOf("wk-sec-today") < ah.indexOf("wk-sec-follow") && ah.indexOf("wk-sec-follow") > 0 && (ah.match(/wk-follow-row/g) ?? []).length === 2 && /<span class="st-coll" title="Collection: New NBN service"><span class="sr-only">Collection: <\/span>New NBN service<\/span>/.test(ah));
    const off = renderToStaticMarkup(createElement(AgendaView, { board: { id: "wb1", name: "Acme", crmOn: true }, rows: [], focus: null, focusMissing: false, nowIso: NOW.toISOString(), followUps: { days: null, rows: [] } }));
    check("render Agenda: with the alert Off there is no Follow up (the side column keeps the overdue list)", !off.includes("wk-sec-follow") && off.includes("No customer has an overdue task."));

    const { CustomerView } = await import("../src/components/customers/CustomerView");
    const props = {
      board: { id: "wb1", name: "Acme" },
      customer: { id: "cu1", number: "C-1", name: "Jane Nguyen", nickname: null, phone: "0412 345 678", archived: false, status: "PROSPECT" as const, tags: ["vip", "nbn"], email: "jane@acme.com", company: "Acme Pty", address: "1 Main St\nNewtown" },
      tasks: [],
      infos: [],
      interactions: [],
      checks: [],
      collections: [],
      deals: [],
      followUp: null,
      followUpDays: 30,
      orderRefs: null,
      ordersOn: true,
      highlightTask: null,
      nowIso: NOW.toISOString(),
      today: TODAY,
    };
    const cv = renderToStaticMarkup(createElement(CustomerView, { ...props, tab: "overview" }));
    check("render customer: the tablist with seven tabs, Overview selected and the only Tab stop", /role="tablist"/.test(cv) && (cv.match(/role="tab"/g) ?? []).length === 7 && (cv.match(/tabindex="0"/g) ?? []).length === 1 && /aria-selected="true"[^>]*tabindex="0"[^>]*>Overview/.test(cv) && /role="tabpanel"/.test(cv));
    check("render customer: the header's status menu and tags; the Overview's Call, Text and Email, company and address", /aria-label="Status: Prospect\. Change it"/.test(cv) && cv.includes('<li class="crm-tag">vip</li>') && /href="tel:0412345678"/.test(cv) && /href="sms:0412345678"/.test(cv) && /href="mailto:jane@acme\.com"/.test(cv) && cv.includes("Acme Pty") && cv.includes("1 Main St\nNewtown"));
    check("render customer: the Overview's empty parts say so (nothing scheduled, no contact logged, none open)", cv.includes("Nothing scheduled.") && cv.includes("No contact logged yet.") && (cv.match(/None open\./g) ?? []).length === 2);
    const noOrders = renderToStaticMarkup(createElement(CustomerView, { ...props, ordersOn: false, tab: "check" }));
    check("render customer: no Orders tab while the order list is off; Check selected shows the Check log", (noOrders.match(/role="tab"/g) ?? []).length === 6 && !noOrders.includes(">Orders<") && /aria-selected="true"[^>]*>Check/.test(noOrders) && noOrders.includes("No checks yet."));
  } finally {
    M._load = load;
  }
}

// ── 8. 344 px ──────────────────────────────────────────────────────────────
function fit() {
  section("344 px");
  const C = CRM_LAYOUT;
  const cu = read("src/components/customers/customers.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const de = read("src/components/deals/deals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const wo = read("src/components/work/work.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const labels = CUSTOMER_TABS.map((t) => CUSTOMER_TAB_LABEL[t]);
  check(
    `a customer's tabs: ${customerTabsWidth(labels)} px of tabs in a 312 px column, so the strip scrolls inside itself (overflow-x, min-width 0, at most the column), never the page; customers.css draws them with work-layout's numbers`,
    contentWidth(WORK_LAYOUT.PHONE) === 312 &&
      customerTabsWidth(labels) > contentWidth(WORK_LAYOUT.PHONE) &&
      /\.crm-tabs \{[^}]*gap: 2px; min-width: 0; max-width: 100%; padding: 2px; overflow-x: auto;/.test(cu) &&
      /\.crm-tab \{[^}]*flex: none;[^}]*padding: 0 12px;[^}]*font: 600 14px/.test(cu) &&
      C.TAB_PAD === 12 && C.TAB_GAP === 2 && C.STRIP_PAD === 2,
    String(customerTabsWidth(labels))
  );
  check("a customer's tabs: the selected one is kept in the strip's view (the strip scrolls, never the page)", /strip\.scrollLeft \+= r\.left - s\.left - 12;/.test(code("src/components/customers/CustomerView.tsx")) && !/scrollIntoView/.test(code("src/components/customers/CustomerView.tsx")));
  const seg = dealSegmentWidth(WORK_LAYOUT.PHONE);
  check(
    `the deals switch: four segments of ${seg} px; the longest word (Quoted) needs ${Math.ceil(6 * C.SEG_CHAR_W) + 2 * C.SEG_PAD}, its count under it, so the four fit with no sideways scroll; deals.css draws it with work-layout's numbers`,
    dealSwitchFits(DEAL_STAGES.map((s) => DEAL_STAGE_LABEL[s]), WORK_LAYOUT.PHONE) &&
      /\.dl-head \{[^}]*padding: 14px;/.test(de) &&
      /\.dl-switch \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); gap: 2px;[^}]*padding: 2px;/.test(de) &&
      /\.dl-seg \{[^}]*flex-direction: column;[^}]*padding: 2px 4px;[^}]*font: 600 13px/.test(de) &&
      C.DEAL_HEAD_PAD === 14 && C.SEG_STRIP_PAD === 2 && C.SEG_GAP === 2 && C.SEG_PAD === 4,
    String(seg)
  );
  check("the deals board: one column below 900 px (the switch picks it), four side by side from 900", /\.dl-col \{ display: none;/.test(de) && /\.dl-col\[data-active\] \{ display: block; \}/.test(de) && /@container main \(min-width: 900px\) \{\s*\.dl-switch \{ display: none; \}\s*\.dl-board \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); \}\s*\.dl-col \{ display: block; \}\s*\}/.test(de));
  check(
    `the Overview: Call and Text need ${overviewCallsWidth()} px beside the ${overviewValueWidth(WORK_LAYOUT.PHONE)} px value column at 344 (customers.css draws it with work-layout's numbers)`,
    overviewCallsWidth() <= overviewValueWidth(WORK_LAYOUT.PHONE) &&
      /\.crm-ov \{[^}]*padding: 0 14px 6px;/.test(cu) &&
      /\.crm-ov-row \{[^}]*grid-template-columns: 96px minmax\(0, 1fr\); column-gap: 8px;/.test(cu) &&
      /\.crm-ov-acts \{[^}]*gap: 6px;/.test(cu) &&
      /\.crm-ov-acts \.crm-call \{ gap: 6px; padding: 0 14px; \}/.test(cu) &&
      C.OV_KEY === 96 && C.OV_PAD === 14 && C.OV_GAP === 8 && C.CALL_GAP === 6,
    `${overviewCallsWidth()} vs ${overviewValueWidth(WORK_LAYOUT.PHONE)}`
  );
  check("a follow-up row wraps on a phone (the button under the words); in the side column the button is its icon", /\.wk-follow-row \{ display: flex; flex-wrap: wrap;/.test(wo) && /\.wk-follow-who \{[^}]*flex: 1 1 180px;/.test(wo) && /\.wk-follow\.compact \.wk-follow-go span \{ position: absolute; width: 1px; height: 1px;/.test(wo));
  check("the list's status strip scrolls inside itself; the tag select shares the row and wraps under it on a phone", /\.crm-seg \{[^}]*min-width: 0; max-width: 100%;[^}]*overflow-x: auto;/.test(cu) && /\.crm-filters \{ display: flex; flex-wrap: wrap;/.test(cu));
  check("a collection's head: the name takes what is left beside Add a task (44) and Close (wraps its words, never the page)", /\.crm-coll-name \{[^}]*flex: 1 1 auto; min-width: 0;/.test(cu) && /\.crm-coll-name b \{[^}]*overflow-wrap: anywhere;/.test(cu));
}

// ── 9. The new tints ───────────────────────────────────────────────────────
function tints() {
  section("the new tints (tokens.css)");
  const css = read("src/app/styles/tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const block = (selector: string): Record<string, string> => {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(`(?:^|})\\s*${esc}\\s*\\{([^}]*)\\}`, "m").exec(css);
    const out: Record<string, string> = {};
    for (const decl of (m?.[1] ?? "").split(";")) {
      const i = decl.indexOf(":");
      if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
    }
    return out;
  };
  const night = block(":root, .theme-night");
  const vellum = { ...night, ...block(':root[data-theme="vellum"]') };
  const rgb = (v: string): Rgb => parseColor(v)!.rgb;
  for (const [label, th] of [["Night", night], ["Vellum", vellum]] as const) {
    if (!th["--work"] || !th["--card"]) {
      check(`${label}: the tokens read`, false);
      continue;
    }
    const card = rgb(th["--card"]);
    const prospect = wash(rgb(th["--work"]), 14, card);
    const collChip = wash(rgb(th["--work"]), 10, card);
    check(`${label}: a Prospect chip's words (ink-0 on the work accent at 14% over the card) ≥ 4.5`, contrast(rgb(th["--ink-0"]), prospect) >= 4.5, contrast(rgb(th["--ink-0"]), prospect).toFixed(2));
    check(`${label}: a collection chip's words (ink-1 on the accent at 10%) ≥ 4.5`, contrast(rgb(th["--ink-1"]), collChip) >= 4.5, contrast(rgb(th["--ink-1"]), collChip).toFixed(2));
    check(`${label}: an Inactive chip's words (ink-2 on the card) ≥ 4.5`, contrast(rgb(th["--ink-2"]), card) >= 4.5, contrast(rgb(th["--ink-2"]), card).toFixed(2));
    check(`${label}: the progress bar (the work accent on line-2) and a Lead chip's rule (the accent on the card) ≥ 3`, contrast(rgb(th["--work"]), card) >= 3, contrast(rgb(th["--work"]), card).toFixed(2));
  }
}

(async () => {
  const realError = console.error;
  console.error = () => {};
  try {
    rules();
    deals();
    search();
    await crmCores();
    await dealCores();
    await scheduledCollections();
    customerFields();
    sql();
    wiring();
    ui();
    await render();
    fit();
    tints();
  } finally {
    console.error = realError;
  }
  console.log(`\ncrm-check: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
