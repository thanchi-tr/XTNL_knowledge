/**
 * Scheduled tasks and the Office workspace (2026-10-20; migration 20261227000000_scheduled_tasks). No database, no
 * network, no browser: the cores run against an in-memory ScheduledDb, the SQL is read as text, the components render
 * to static markup with next/navigation stubbed.
 *
 *   npx tsx scripts/scheduled-tasks-check.ts      (npm run scheduled-tasks:check; ui:check runs it too)
 *
 * Covers:
 *   1. the rules (src/lib/scheduled-tasks.ts): the channels and their glyphs, the sheet's input (title 1..200, detail
 *      ≤ 500, a datetime-local read in Australia/Sydney, all day at 09:00, remind, channel, customer), moving dueAt
 *      ALWAYS clears remindSentAt, the reminder's state, the agenda's sections on the 04:00 life day (Overdue · Today ·
 *      Upcoming 14 days · Later · Done today and 7 days back) and their order, the snooze presets, the deep links
 *      (?task=, and ?callback= kept), what a reminder says (push, bell, banner), and the banner's once-per-device rules;
 *   2. the customer look-up (src/lib/customer-search.ts), as truth tables: ID exact, prefix and substring; name and
 *      nickname word start and substring; accents, case and white space; a phone by its digits only (a phone-like
 *      query of 3+ digits); the rank order; ties; the cap and "+n more"; an empty query; the marks; tasks by title;
 *   3. the cores (src/lib/scheduled-tasks-server.ts): ownership (the tab, the customer on the same tab, archived ones
 *      refused, a customer list switched off), create, edit (a moved time re-arms), Done with "Log to history" in one
 *      write (its Undo archives the entry), open again, snooze, archive and restore, the agenda's ?task= / ?callback=
 *      focus (an old customer task's or call back's id), and the due route;
 *   4. the migration and the backfill: BEGIN/COMMIT, additive, the table's shape (timestamptz), its indexes (the partial
 *      one for the dispatcher), the CHECK, every INSERT idempotent (ON CONFLICT on a unique legacy id), the mapping, the
 *      archive of the call backs' linked tasks after the inserts, and the standalone file the same statements;
 *   5. the wiring and the UI: the work layout and its routes, the sub-navigation and titles, the search's keystrokes
 *      calling no server and no fetch, the banner mounted on every page, the work skin on the Tasks board, no game
 *      furniture on any work route, 44 px targets and tokens only;
 *   6. the 344 px arithmetic (work-layout.ts against work.css);
 *   7. the work accent (tokens.css --work / --on-work, Night and Vellum): ΔE ≥ 15 from --must, --habit, --xp, --pts and
 *      --hab-1..8; a mark ≥ 3:1 and text ≥ 4.5:1 on the card; its band keeps every ink step legible.
 */
import "./_no-model";
import Module from "node:module";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AGENDA_SECTIONS,
  ALL_DAY_HOUR,
  BANNER_BEHIND_MS,
  BANNER_STORAGE_KEY,
  BANNER_TIMER_MAX_MS,
  BELL_SCHEDULED_MAX,
  CHANNELS,
  CHANNEL_ICON,
  CHANNEL_WORDS,
  DONE_DAYS,
  REMINDER_TONES,
  SCHEDULED_ARCHIVED,
  SCHEDULED_CHANNEL_BAD,
  SCHEDULED_CRM_OFF,
  SCHEDULED_CUSTOMER_ARCHIVED,
  SCHEDULED_CUSTOMER_GONE,
  SCHEDULED_DAY_BAD,
  SCHEDULED_DETAIL_LONG,
  SCHEDULED_DETAIL_MAX,
  SCHEDULED_GONE,
  SCHEDULED_LOG_NO_CUSTOMER,
  SCHEDULED_MORE_ID,
  SCHEDULED_SNOOZE_BAD,
  SCHEDULED_TITLE_EMPTY,
  SCHEDULED_TITLE_LONG,
  SCHEDULED_TITLE_MAX,
  SCHEDULED_WHEN_BAD,
  SNOOZE_MENU,
  UPCOMING_DAYS,
  agendaOf,
  bannerHeadOf,
  bannerKeyOf,
  bannerMetaOf,
  bannerQueueOf,
  channelOf,
  channelOfLegacyAction,
  cleanScheduledInput,
  customersToWatchOf,
  defaultWhenOf,
  keptDueAt,
  detailPreviewOf,
  focusParamOf,
  logActionOf,
  nextBannerInMs,
  prunedShown,
  reminderLinesOf,
  reminderStateOf,
  remindSentAtAfter,
  rowWhenOf,
  scheduledNotices,
  scheduledPayloadOf,
  scheduledRemindDue,
  scheduledTaskHref,
  sectionOfTask,
  smsHref,
  snoozePresetsOf,
  snoozeTarget,
  taskAnchorId,
  whenInputOf,
  type BannerTask,
  type DueScheduled,
  type ScheduledView,
} from "../src/lib/scheduled-tasks";
import {
  PHONE_MIN_DIGITS,
  RANK,
  SEARCH_CAP,
  customerLabelOf,
  foldText,
  highlightParts,
  matchCustomers,
  matchTitles,
  moreLineOf,
  phoneQueryOf,
  prepareIndex,
  topMatch,
  type CustomerIndexEntry,
} from "../src/lib/customer-search";
import {
  archiveScheduledCore,
  createScheduledCore,
  doneScheduledCore,
  editScheduledCore,
  handleDueRequest,
  loadAgenda,
  reopenScheduledCore,
  resolveTaskParam,
  restoreScheduledCore,
  snoozeScheduledCore,
  type DoneLog,
  type PatchWhere,
  type ScheduledBoardRow,
  type ScheduledCustomerRow,
  type ScheduledDb,
  type ScheduledRow,
  type ScheduledWrite,
} from "../src/lib/scheduled-tasks-server";
import { CUSTOMER_ACTIONS, CUSTOMER_ACTION_ICON, CUSTOMER_ACTION_LABEL, INTERACTION_ACTION_BAD, isCustomerAction } from "../src/lib/customers";
import { TASK_ICONS } from "../src/lib/task-style";
import { WORK_BOARD_ARCHIVED, WORK_BOARD_GONE, workBoardHref, workTasksHref } from "../src/lib/work-boards";
import { activeSub, subsOf, titleFor, workSectionOf, workSubsOf } from "../src/components/shell/nav";
import { WORK_LAYOUT, actsWidth, bandSearchWidth, contentWidth, rowBodyWidth, subnavWidth } from "../src/components/work/work-layout";
import { contrast, deltaE, parseColor, wash, type Rgb } from "../src/app/dev/style/color-lab";

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
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const section = (t: string) => console.log(`— ${t} —`);

const TZ = "Australia/Sydney";
/** Tuesday 20 Oct 2026, 15:00 in Sydney (AEDT, UTC+11). */
const NOW = new Date("2026-10-20T04:00:00Z");
const U = "u1";
const min = (n: number) => new Date(NOW.getTime() + n * 60_000);
/** A wall-clock time in Sydney (AEDT in October and November), as an instant. */
const syd = (local: string) => new Date(`${local}:00+11:00`);

// ── 1. The rules ────────────────────────────────────────────────────────────
function rules() {
  section("the rules (scheduled-tasks.ts)");
  eq("channels: five, in order, each a word", [CHANNELS, CHANNELS.map((c) => CHANNEL_WORDS[c])], [["CALL", "VISIT", "EMAIL", "MESSAGE", "OTHER"], ["Call", "Visit", "Email", "Message", "Other"]]);
  check("channels: each glyph is one of the app's own task icons (TASK_ICONS)", CHANNELS.every((c) => CHANNEL_ICON[c] in TASK_ICONS), JSON.stringify(CHANNEL_ICON));
  eq("channelOf: the five only", [channelOf("CALL"), channelOf("call"), channelOf("PHONE"), channelOf(undefined)], ["CALL", null, null, null]);
  eq("legacy actions: PHONE → CALL, IN_PERSON → VISIT, anything else a call", [channelOfLegacyAction("PHONE"), channelOfLegacyAction("IN_PERSON"), channelOfLegacyAction(null)], ["CALL", "VISIT", "CALL"]);
  eq("Log to history starts from the channel (Other: the user picks)", CHANNELS.map(logActionOf), ["CALL", "VISIT", "EMAIL", "MESSAGE", null]);

  // The sheet's input.
  const base = { title: "  Call   Jane ", when: "2026-10-21T09:30" };
  const got = cleanScheduledInput(base, TZ);
  check(
    "input: the title trimmed and collapsed; 09:30 Wed on the Sydney clock; channel Other and reminder on by default; timed",
    got.ok && got.value.title === "Call Jane" && got.value.dueAt.toISOString() === "2026-10-20T22:30:00.000Z" && got.value.channel === "OTHER" && got.value.remind && !got.value.allDay && got.value.customerId === null && got.value.detail === null,
    JSON.stringify(got)
  );
  const day = cleanScheduledInput({ title: "Visit", when: "2026-10-22", allDay: true, channel: "VISIT", remind: false }, TZ);
  check(`input: all day holds ${ALL_DAY_HOUR}:00 that day in Sydney (its reminder's hour); a datetime-local's date also works`, day.ok && day.value.dueAt.toISOString() === "2026-10-21T22:00:00.000Z" && day.value.allDay && !day.value.remind && cleanScheduledInput({ title: "x", when: "2026-10-22T17:45", allDay: true }, TZ).ok);
  eq(
    "input: the refusals, each its own line",
    [
      cleanScheduledInput({ ...base, title: "   " }),
      cleanScheduledInput({ ...base, title: "x".repeat(SCHEDULED_TITLE_MAX + 1) }),
      cleanScheduledInput({ ...base, detail: "d".repeat(SCHEDULED_DETAIL_MAX + 1) }),
      cleanScheduledInput({ ...base, when: "tomorrow" }),
      cleanScheduledInput({ ...base, when: "2026-13-01T10:00" }),
      cleanScheduledInput({ ...base, when: "1999-12-31T10:00" }),
      cleanScheduledInput({ ...base, when: "nope", allDay: true }),
      cleanScheduledInput({ ...base, channel: "PHONE" }),
    ],
    [
      { ok: false, error: SCHEDULED_TITLE_EMPTY },
      { ok: false, error: SCHEDULED_TITLE_LONG },
      { ok: false, error: SCHEDULED_DETAIL_LONG },
      { ok: false, error: SCHEDULED_WHEN_BAD },
      { ok: false, error: SCHEDULED_WHEN_BAD },
      { ok: false, error: SCHEDULED_WHEN_BAD },
      { ok: false, error: SCHEDULED_DAY_BAD },
      { ok: false, error: SCHEDULED_CHANNEL_BAD },
    ]
  );
  check(`input: ${SCHEDULED_TITLE_MAX} characters pass (every backfilled call-back task title stays editable); a detail keeps its line breaks`, cleanScheduledInput({ ...base, title: "x".repeat(SCHEDULED_TITLE_MAX) }).ok && (cleanScheduledInput({ ...base, detail: "a\r\nb" }) as { value: { detail: string } }).value.detail === "a\nb");
  check("input: a customer must be an id-shaped string ('' is none)", !cleanScheduledInput({ ...base, customerId: "../x" }).ok && (cleanScheduledInput({ ...base, customerId: "" }) as { value: { customerId: null } }).value.customerId === null);

  // The reminder.
  const sent = { dueAt: min(-60), remindSentAt: min(-59) };
  eq("remindSentAt: a moved dueAt ALWAYS clears it; the same dueAt keeps it", [remindSentAtAfter(sent, min(30)), remindSentAtAfter(sent, min(-60))?.toISOString()], [null, min(-59).toISOString()]);
  const secs = new Date(min(30).getTime() + 37_250);
  eq("an edit's time: the same minute keeps the stored instant (a snooze's seconds), another minute is a move", [keptDueAt(secs, min(30)).toISOString(), keptDueAt(secs, min(31)).toISOString()], [secs.toISOString(), min(31).toISOString()]);
  check("snooze: +1 hour and +10 min land on a whole minute", snoozeTarget("hour", new Date(NOW.getTime() + 12_345), TZ)?.getTime() === min(61).getTime() && snoozeTarget("10min", new Date(NOW.getTime() + 1), TZ)?.getTime() === min(11).getTime());
  eq(
    "reminder state: none (off, done, archived), set, due, sent",
    [
      reminderStateOf({ remind: false, dueAt: min(-5), remindSentAt: null }, NOW),
      reminderStateOf({ remind: true, dueAt: min(-5), remindSentAt: null, doneAt: min(-1) }, NOW),
      reminderStateOf({ remind: true, dueAt: min(-5), remindSentAt: null, archivedAt: min(-1) }, NOW),
      reminderStateOf({ remind: true, dueAt: min(5), remindSentAt: null }, NOW),
      reminderStateOf({ remind: true, dueAt: min(-5), remindSentAt: null }, NOW),
      reminderStateOf({ remind: true, dueAt: min(-5), remindSentAt: min(-4) }, NOW),
    ],
    ["none", "none", "none", "set", "due", "sent"]
  );

  // The dispatcher's rule in TypeScript (the customer tasks' customerTaskRemindDue, ported).
  const dueTask = { dueAt: min(-5), remind: true, doneAt: null, remindSentAt: null, archivedAt: null };
  eq(
    "remind due: its time come, on, not done, not sent, not archived, its tab open and its customer kept",
    [
      scheduledRemindDue(dueTask, NOW),
      scheduledRemindDue({ ...dueTask, doneAt: NOW }, NOW),
      scheduledRemindDue({ ...dueTask, remind: false }, NOW),
      scheduledRemindDue({ ...dueTask, remindSentAt: NOW }, NOW),
      scheduledRemindDue({ ...dueTask, archivedAt: NOW }, NOW),
      scheduledRemindDue({ ...dueTask, dueAt: min(5) }, NOW),
      scheduledRemindDue(dueTask, NOW, { customerArchived: true }),
      scheduledRemindDue(dueTask, NOW, { boardArchived: true }),
    ],
    [true, false, false, false, false, false, false, false]
  );
  eq("the sheet's start: the next whole hour today; after 17:00, 09:00 tomorrow (on the Sydney clock)", [defaultWhenOf(NOW, TZ), defaultWhenOf(syd("2026-10-20T17:30"), TZ), whenInputOf(syd("2026-10-21T09:30"), TZ)], ["2026-10-20T16:00", "2026-10-21T09:00", "2026-10-21T09:30"]);

  // The agenda, on the life day (04:00 turns it).
  const t = (id: string, dueAt: Date, over: Partial<{ allDay: boolean; doneAt: Date | null }> = {}) => ({ id, dueAt: dueAt.toISOString(), allDay: over.allDay ?? false, doneAt: over.doneAt ? over.doneAt.toISOString() : null });
  const rows = [
    t("a-earlier", syd("2026-10-20T10:00")),
    t("b-allday-today", syd("2026-10-20T09:00"), { allDay: true }),
    t("c-allday-yesterday", syd("2026-10-19T09:00"), { allDay: true }),
    t("d-later-today", syd("2026-10-20T17:00")),
    t("e-0130-wed", syd("2026-10-21T01:30")),
    t("f-tomorrow", syd("2026-10-21T09:00")),
    t("g-plus14", syd(`2026-11-03T10:00`)),
    t("h-plus15", syd(`2026-11-04T10:00`)),
    t("i-done-today", syd("2026-10-19T09:00"), { doneAt: syd("2026-10-20T11:00") }),
    t("j-done-7-back", syd("2026-10-12T09:00"), { doneAt: syd("2026-10-13T13:00") }),
    t("k-done-8-back", syd("2026-10-11T09:00"), { doneAt: syd("2026-10-12T13:00") }),
  ];
  const a = agendaOf(rows, NOW, TZ);
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
  eq(
    `agenda: Overdue (a time gone by; an all-day task once its day ended) · Today (01:30 Wed is still Tuesday's life day) · Upcoming (${UPCOMING_DAYS} days) · Later · Done (today and ${DONE_DAYS} days back)`,
    [ids(a.overdue), ids(a.today), ids(a.upcoming), ids(a.later), ids(a.done)],
    [["c-allday-yesterday", "a-earlier"], ["b-allday-today", "d-later-today", "e-0130-wed"], ["f-tomorrow", "g-plus14"], ["h-plus15"], ["i-done-today", "j-done-7-back"]]
  );
  eq("agenda: the sections, in order (Phase 2 adds to this list)", AGENDA_SECTIONS.map((s) => s.title), ["Overdue", "Today", "Upcoming", "Later", "Done"]);
  eq("agenda: sectionOfTask is the same rule one task at a time", rows.map((r) => sectionOfTask(r, NOW, TZ)), ["overdue", "today", "overdue", "today", "today", "upcoming", "upcoming", "later", "done", "done", null]);
  eq(
    "row: its time column (All day; the day when not today; the year when not this one)",
    [rowWhenOf(rows[1], NOW, TZ), rowWhenOf(rows[3], NOW, TZ), rowWhenOf(rows[5], NOW, TZ), rowWhenOf(rows[6], NOW, TZ), rowWhenOf({ dueAt: syd("2027-01-05T10:00").toISOString(), allDay: false }, NOW, TZ)],
    [{ day: "Today", time: "All day" }, { day: "Today", time: "17:00" }, { day: "Tomorrow", time: "09:00" }, { day: "Tue 3 Nov", time: "10:00" }, { day: "Tue 5 Jan 2027", time: "10:00" }]
  );
  eq("row: the detail's first line, spaces collapsed", [detailPreviewOf("\n  acme ·  pricing \nsecond"), detailPreviewOf(null)], ["acme · pricing", null]);
  eq("row: sms: the phone's digits (a leading + kept)", [smsHref("+61 (2) 9000-1234"), smsHref("0412 345 678")], ["sms:+61290001234", "sms:0412345678"]);

  // Snooze.
  eq(
    "snooze from Tue 15:00: +1 hour, this evening 18:00, tomorrow 09:00, next Monday 09:00 (and +10 min, the banner's)",
    (["hour", "evening", "tomorrow", "monday", "10min"] as const).map((p) => snoozeTarget(p, NOW, TZ)?.toISOString()),
    [min(60).toISOString(), syd("2026-10-20T18:00").toISOString(), syd("2026-10-21T09:00").toISOString(), syd("2026-10-26T09:00").toISOString(), min(10).toISOString()]
  );
  const late = syd("2026-10-20T19:00");
  check("snooze: after 18:00 'this evening' is gone from the menu", snoozeTarget("evening", late, TZ) === null && !snoozePresetsOf(late, TZ).some((p) => p.preset === "evening") && snoozePresetsOf(NOW, TZ).map((p) => p.preset).join() === SNOOZE_MENU.join());
  check("snooze: at 01:30 Wed (still Tuesday's life day) 'tomorrow' is Wed 09:00; on a Monday 'next Monday' is a week on", snoozeTarget("tomorrow", syd("2026-10-21T01:30"), TZ)?.toISOString() === syd("2026-10-21T09:00").toISOString() && snoozeTarget("monday", syd("2026-10-26T12:00"), TZ)?.toISOString() === syd("2026-11-02T09:00").toISOString());

  // Links.
  eq("links: /today/work/<board>?task=<id>; the row's anchor", [scheduledTaskHref("wb 1", "st?1"), taskAnchorId("x")], ["/today/work/wb%201?task=st%3F1", "st-x"]);
  eq("links: ?task= first, else the call backs' ?callback= (an id-shaped value only)", [focusParamOf({ task: "st1", callback: "cb1" }), focusParamOf({ callback: ["cb2"] }), focusParamOf({ task: "../x" }), focusParamOf({})], [{ kind: "task", id: "st1" }, { kind: "callback", id: "cb2" }, null, null]);

  // What a reminder says.
  const due: DueScheduled = { id: "st1", boardId: "wb1", boardName: "Acme", title: "Send the quote", channel: "CALL", dueAt: syd("2026-10-20T14:30"), allDay: false, customer: { name: "Jane Nguyen", number: "C-1042" } };
  eq("push: the title; 'Call · Jane Nguyen · C-1042 · 14:30'; one tag per task; its agenda row", scheduledPayloadOf(due, NOW, TZ), { title: "Send the quote", body: "Call · Jane Nguyen · C-1042 · 14:30", tag: "scheduled-st1", url: "/today/work/wb1?task=st1" });
  eq("push: another day carries its date; an all-day task says today", [reminderLinesOf({ ...due, dueAt: syd("2026-10-19T14:30") }, NOW, TZ).body, reminderLinesOf({ ...due, allDay: true, customer: null, channel: "OTHER" }, NOW, TZ).body], ["Call · Jane Nguyen · C-1042 · 19 Oct 14:30", "Other · today"]);
  const bell = scheduledNotices([due, { ...due, id: "st0", dueAt: syd("2026-10-20T13:00"), customer: null, channel: "EMAIL" }], NOW, TZ);
  eq(
    "bell: oldest first, 'Scheduled task · <channel>', a warning (counted), linking the task on its agenda",
    bell.map((n) => [n.id, n.tone, n.title, n.detail, n.href, n.action]),
    [
      ["scheduled-st0", "warn", "Scheduled task · Email", "Send the quote · Acme · due 13:00", "/today/work/wb1?task=st0", "Open"],
      ["scheduled-st1", "warn", "Scheduled task · Call", "Send the quote · Jane Nguyen · C-1042 · Acme · due 14:30", "/today/work/wb1?task=st1", "Open"],
    ]
  );
  const many = scheduledNotices(Array.from({ length: 7 }, (_, i) => ({ ...due, id: `m${i}`, dueAt: min(-i) })), NOW, TZ);
  check(`bell: at most ${BELL_SCHEDULED_MAX} one by one, then one 'N more' line`, many.length === BELL_SCHEDULED_MAX + 1 && many.at(-1)?.id === SCHEDULED_MORE_ID && many.at(-1)?.title === "3 more scheduled tasks due");

  // The banner.
  const b = (id: string, at: Date): BannerTask => ({ id, boardId: "wb1", boardName: "Acme", title: `Task ${id}`, channel: "CALL", dueAt: at.toISOString(), allDay: false, customer: { id: "cu1", name: "Jane Nguyen", number: "C-1042" } });
  const tasks = [b("s2", min(-2)), b("s1", min(-30)), b("old", new Date(NOW.getTime() - BANNER_BEHIND_MS - 60_000)), b("soon", min(25)), b("later", min(600))];
  const shown = new Set([bannerKeyOf(b("s2", min(-2)))]);
  eq("banner: due and not yet shown on this device, oldest first; older than a day is the agenda's, not a banner", bannerQueueOf(tasks, NOW.getTime(), new Set()).map((x) => x.id), ["old", "s1", "s2"].filter((x) => x !== "old"));
  eq("banner: once per device per due time (a shown key never shows again; a moved task, a new key, does)", [bannerQueueOf(tasks, NOW.getTime(), shown).map((x) => x.id), bannerQueueOf([b("s2", min(-1))], NOW.getTime(), shown).map((x) => x.id)], [["s1"], ["s2"]]);
  eq("banner: the local timer waits for the next one (capped)", [nextBannerInMs(tasks, NOW.getTime(), new Set()), nextBannerInMs([b("far", min(60 * 24))], NOW.getTime(), new Set()), nextBannerInMs([], NOW.getTime(), new Set())], [25 * 60_000, BANNER_TIMER_MAX_MS, null]);
  eq("banner: one task's title; a stack '3 due · Next: <title>'", [bannerHeadOf([b("s1", NOW)]), bannerHeadOf([b("s1", NOW), b("s2", NOW), b("s3", NOW)]), bannerHeadOf([])], ["Task s1", "3 due · Next: Task s1", ""]);
  eq("banner: the customer (name · ID), when, and the channel", bannerMetaOf(b("s1", syd("2026-10-20T14:30")), NOW, TZ), "Jane Nguyen · C-1042 · Today · 14:30 · Call");
  eq("banner: the device's record is pruned (old keys and junk dropped)", prunedShown({ a: NOW.getTime(), b: NOW.getTime() - 5 * 86_400_000, c: "x" }, NOW.getTime()), { a: NOW.getTime() });
  check("banner: its sound is soft (every partial under celebrate.ts SOUND_GAIN_MAX 0.05)", REMINDER_TONES.every(([, , , g]) => g > 0 && g <= 0.05));
  eq("customers to watch: those with an overdue task, the longest overdue first", customersToWatchOf([
    { id: "1", dueAt: "2026-10-19T00:00:00.000Z", customer: { id: "cA", name: "A", number: "1", phone: null } },
    { id: "2", dueAt: "2026-10-10T00:00:00.000Z", customer: { id: "cB", name: "B", number: "2", phone: null } },
    { id: "3", dueAt: "2026-10-18T00:00:00.000Z", customer: { id: "cA", name: "A", number: "1", phone: null } },
    { id: "4", dueAt: "2026-10-01T00:00:00.000Z", customer: null },
  ] as unknown as ScheduledView[]).map((w) => [w.customer.id, w.overdue]), [["cB", 1], ["cA", 2]]);
}

// ── 2. The customer look-up ────────────────────────────────────────────────
function lookup() {
  section("the customer look-up (customer-search.ts)");
  const e = (id: string, number: string, name: string, over: Partial<CustomerIndexEntry> = {}): CustomerIndexEntry => ({ id, number, name, nickname: null, phone: null, activity: 0, ...over });
  const people = [
    e("c1", "C-1042", "Jane Nguyen", { nickname: "JJ", phone: "0412 345 678", activity: 5 }),
    e("c2", "C-10", "Zoë Brown", { activity: 9 }),
    e("c3", "1042", "Bob Jameson", { nickname: "Bobby C", phone: "+61 2 9000 1042", activity: 1 }),
    e("c4", "X-7", "Renée Carlson", { phone: "(02) 4040-1042", activity: 7 }),
    e("c5", "A-100", "Ann Jameson", { activity: 7 }),
  ];
  const ix = prepareIndex(people);
  const q = (s: string) => matchCustomers(ix, s)?.results.map((m) => [m.entry.id, m.rank, m.field]) ?? null;
  eq("fold: accents, case and white space", [foldText("  Zoë   BROWN "), foldText("Renée"), foldText(null)], ["zoe brown", "renee", ""]);
  eq("ID exact, ignoring case", q("c-1042"), [["c1", RANK.EXACT_ID, "id"]]);
  eq("ID exact before an ID that starts with it", q("C-10"), [["c2", RANK.EXACT_ID, "id"], ["c1", RANK.ID_PREFIX, "id"]]);
  eq("ID prefix, then ID substring, then a phone's digits", q("104"), [["c3", RANK.ID_PREFIX, "id"], ["c1", RANK.ID_SUBSTRING, "id"], ["c4", RANK.PHONE, "phone"]]);
  eq("name: a word's start (the surname too); ties by recent activity", q("jam"), [["c5", RANK.NAME_WORD, "name"], ["c3", RANK.NAME_WORD, "name"]]);
  eq("name: anywhere in it", q("ame"), [["c5", RANK.NAME_SUBSTRING, "name"], ["c3", RANK.NAME_SUBSTRING, "name"]]);
  eq("accents both ways: 'zoe' finds Zoë, 'RENÉE' and 'renee' find Renée", [q("zoe"), q("RENÉE"), q("renee")], [[["c2", RANK.NAME_WORD, "name"]], [["c4", RANK.NAME_WORD, "name"]], [["c4", RANK.NAME_WORD, "name"]]]);
  eq("nickname: a word's start", q("bobby"), [["c3", RANK.NAME_WORD, "nickname"]]);
  eq("white space: trimmed and collapsed ('  jane   nguyen ')", q("  jane   nguyen "), [["c1", RANK.NAME_WORD, "name"]]);
  eq(`phone: by its digits only, from ${PHONE_MIN_DIGITS} digits of a phone-like query`, [q("0412 345"), q("0412345"), phoneQueryOf("04"), phoneQueryOf("04 12"), phoneQueryOf("a412"), phoneQueryOf("(04) 12-3")], [[["c1", RANK.PHONE, "phone"]], [["c1", RANK.PHONE, "phone"]], null, "0412", null, "04123"]);
  check("phone: two digits match IDs, never a phone (half the list would)", (q("04") ?? []).length > 0 && (q("04") ?? []).every(([, , f]) => f !== "phone"));
  eq("an empty or blank query is no search", [matchCustomers(ix, ""), matchCustomers(ix, "   "), matchCustomers(ix, null)], [null, null, null]);

  // The whole rank order, one tier per row.
  const tiers = prepareIndex([
    e("r5", "Z", "Vic", { phone: "0400 105 999", activity: 99 }),
    e("r4", "Y", "Shop105", { activity: 99 }),
    e("r3", "A1055", "Will", { activity: 99 }),
    e("r2", "W", "Unit 105 Traders", { activity: 99 }),
    e("r1", "1055", "Yan", { activity: 1 }),
    e("r0", "105", "Zed", { activity: 0 }),
  ]);
  eq("rank: exact ID · ID prefix · name word · ID substring · name substring · phone (activity only breaks ties)", matchCustomers(tiers, "105")?.results.map((m) => m.entry.id), ["r0", "r1", "r2", "r3", "r4", "r5"]);
  const ties = prepareIndex([e("t2", "2", "Beth Ng", { activity: 3 }), e("t1", "1", "Abe Ng", { activity: 3 }), e("t3", "3", "Cal Ng", { activity: 8 })]);
  eq("ties: recent activity, then the name", matchCustomers(ties, "ng")?.results.map((m) => m.entry.id), ["t3", "t1", "t2"]);
  const crowd = prepareIndex(Array.from({ length: 12 }, (_, i) => e(`k${i}`, `K-${i}`, `Kim ${i}`)));
  const capped = matchCustomers(crowd, "kim");
  check(`cap: at most ${SEARCH_CAP}, the total kept, and '+n more'`, capped?.results.length === SEARCH_CAP && capped.total === 12 && moreLineOf(capped) === "+4 more" && moreLineOf(matchCustomers(ix, "c-1042")) === null);
  check("cap: the Customers page asks for every match (Infinity)", matchCustomers(crowd, "kim", { limit: Infinity })?.results.length === 12);
  check("Enter: the top result", topMatch(matchCustomers(ix, "C-10"))?.entry.id === "c2" && topMatch(null) === null);

  // The marks.
  const jam = matchCustomers(ix, "jam")?.results.find((m) => m.entry.id === "c3");
  eq("marks: the matched part of the name, as written", [jam?.ranges.name, highlightParts("Bob Jameson", jam?.ranges.name ?? [])], [[[4, 7]], [{ text: "Bob ", mark: false }, { text: "Jam", mark: true }, { text: "eson", mark: false }]]);
  eq("marks: an accented name keeps its own letters marked ('zoe' marks 'Zoë')", highlightParts("Zoë Brown", matchCustomers(ix, "zoe")!.results[0].ranges.name), [{ text: "Zoë", mark: true }, { text: " Brown", mark: false }]);
  eq("marks: the ID's part and the phone's digits", [matchCustomers(ix, "C-10")!.results[1].ranges.number, matchCustomers(ix, "0412 345")!.results[0].ranges.phone], [[[0, 4]], [[0, 7]]]);
  eq("marks: none, merged, clipped", [highlightParts("abc", []), highlightParts("abcdef", [[1, 3], [2, 4], [5, 99]])], [[{ text: "abc", mark: false }], [{ text: "a", mark: false }, { text: "bcd", mark: true }, { text: "e", mark: false }, { text: "f", mark: true }]]);
  eq("a result names both: 'Jane Nguyen · C-1042'", customerLabelOf(people[0]), "Jane Nguyen · C-1042");

  const tasks = [
    { id: "t3", title: "Call supplier", dueAt: "2026-10-19T00:00:00.000Z", allDay: false, done: true },
    { id: "t2", title: "Recall order", dueAt: "2026-10-19T00:00:00.000Z", allDay: false, done: false },
    { id: "t1", title: "Call Jane about the quote", dueAt: "2026-10-21T00:00:00.000Z", allDay: false, done: false },
  ];
  eq("tasks by title: open first, a word's start before anywhere, then the soonest", matchTitles(tasks, "call")?.results.map((r) => r.entry.id), ["t1", "t2", "t3"]);
  check("tasks: blank is no search", matchTitles(tasks, "  ") === null);

  // Speed: thousands of customers, every keystroke.
  const big = prepareIndex(Array.from({ length: 5000 }, (_, i) => e(`b${i}`, `${10000 + i}`, `Customer ${i} Smith`, { phone: `04${String(i).padStart(8, "0")}` })));
  const t0 = performance.now();
  for (const s of ["1", "12", "123", "1234", "smi", "cust", "0400"]) matchCustomers(big, s);
  const per = (performance.now() - t0) / 7;
  check("speed: a keystroke over 5000 customers matches well under 100 ms", per < 100, `${per.toFixed(1)} ms`);
}

// ── 3. The cores, on an in-memory ScheduledDb ──────────────────────────────

interface MemTask extends ScheduledRow {
  legacyCallBackId: string | null;
  legacyCustomerTaskId: string | null;
}

class MemDb implements ScheduledDb {
  boards = new Map<string, ScheduledBoardRow>();
  customersById = new Map<string, ScheduledCustomerRow>();
  rows: MemTask[] = [];
  interactions: { id: string; userId: string; customerId: string; at: Date; action: string; brief: string; archivedAt: Date | null }[] = [];
  seq = 0;
  failLog = false;

  addBoard(id: string, o: { userId?: string; archived?: boolean; crmOn?: boolean } = {}) {
    this.boards.set(id, { id, userId: o.userId ?? U, name: `Board ${id}`, archivedAt: o.archived ? new Date(0) : null, crmOn: o.crmOn ?? true });
  }
  addCustomer(id: string, boardId: string, o: { userId?: string; archived?: boolean; phone?: string | null } = {}) {
    this.customersById.set(id, { id, userId: o.userId ?? U, boardId, number: id.toUpperCase(), name: `Customer ${id}`, phone: o.phone ?? null, archivedAt: o.archived ? new Date(0) : null });
  }
  private withCustomer(r: MemTask) {
    return { ...r, customer: r.customerId ? (this.customersById.get(r.customerId) ?? null) : null };
  }
  async board(userId: string, boardId: string) {
    const b = this.boards.get(boardId);
    return b && b.userId === userId ? b : null;
  }
  async customer(userId: string, id: string) {
    const c = this.customersById.get(id);
    return c && c.userId === userId ? c : null;
  }
  /** Task collections (Phase 2) are crm-check's: none here. */
  async collection() {
    return null;
  }
  async task(userId: string, id: string) {
    const r = this.rows.find((x) => x.id === id && x.userId === userId);
    return r ? { ...this.withCustomer(r), board: this.boards.get(r.boardId)! } : null;
  }
  async byLegacy(userId: string, kind: "callback" | "customerTask", legacyId: string) {
    const r = this.rows.find((x) => x.userId === userId && (kind === "callback" ? x.legacyCallBackId : x.legacyCustomerTaskId) === legacyId);
    return r ? { id: r.id, boardId: r.boardId, customerId: r.customerId } : null;
  }
  async insert(row: Omit<ScheduledRow, "id" | "remindSentAt" | "doneAt" | "archivedAt">) {
    const id = `st${String(++this.seq).padStart(3, "0")}`;
    this.rows.push({ ...row, id, remindSentAt: null, doneAt: null, archivedAt: null, legacyCallBackId: null, legacyCustomerTaskId: null });
    return { id };
  }
  async patch(userId: string, id: string, where: PatchWhere, data: ScheduledWrite) {
    const r = this.rows.find((x) => x.id === id && x.userId === userId);
    if (!r) return 0;
    if (where.open && r.archivedAt) return 0;
    if (where.archived && !r.archivedAt) return 0;
    if (where.done && !r.doneAt) return 0;
    if (where.notDone && r.doneAt) return 0;
    Object.assign(r, data);
    return 1;
  }
  async markDone(userId: string, id: string, at: Date, log: DoneLog | null) {
    const r = this.rows.find((x) => x.id === id && x.userId === userId && !x.archivedAt && !x.doneAt);
    if (!r) return { changed: 0, interactionId: null };
    // One transaction: the entry fails, the task stays open.
    if (log && this.failLog) throw new Error("insert failed");
    r.doneAt = at;
    if (!log) return { changed: 1, interactionId: null };
    const entry = { id: `ci${this.interactions.length + 1}`, userId, customerId: log.customerId, at: log.at, action: log.action, brief: log.brief, archivedAt: null };
    this.interactions.push(entry);
    return { changed: 1, interactionId: entry.id };
  }
  async archiveInteraction(userId: string, interactionId: string, at: Date) {
    const i = this.interactions.find((x) => x.id === interactionId && x.userId === userId && !x.archivedAt);
    if (!i) return 0;
    i.archivedAt = at;
    return 1;
  }
  async agenda(userId: string, boardId: string, doneSince: Date) {
    return this.rows
      .filter((r) => r.userId === userId && r.boardId === boardId && !r.archivedAt && (!r.customerId || !this.customersById.get(r.customerId)?.archivedAt) && (!r.doneAt || r.doneAt >= doneSince))
      .map((r) => this.withCustomer(r));
  }
  async forCustomer(userId: string, customerId: string) {
    return this.rows.filter((r) => r.userId === userId && r.customerId === customerId && !r.archivedAt).map((r) => this.withCustomer(r));
  }
}

async function cores() {
  section("the cores (scheduled-tasks-server.ts)");
  const db = new MemDb();
  db.addBoard("wb1");
  db.addBoard("wb2");
  db.addBoard("wbOff", { crmOn: false });
  db.addBoard("wbOld", { archived: true });
  db.addBoard("wbTheirs", { userId: "u2" });
  db.addCustomer("cu1", "wb1", { phone: "0412 345 678" });
  db.addCustomer("cu2", "wb2");
  db.addCustomer("cuOld", "wb1", { archived: true });
  db.addCustomer("cuOff", "wbOff");
  db.addCustomer("cuTheirs", "wb1", { userId: "u2" });
  const input = (over: Record<string, unknown> = {}) => ({ title: "Call Jane", when: "2026-10-21T09:30", channel: "CALL", ...over });

  eq(
    "ownership: an unknown tab, another user's, an archived one",
    [await createScheduledCore(U, "nope", input(), db), await createScheduledCore(U, "wbTheirs", input(), db), await createScheduledCore(U, "wbOld", input(), db)],
    [{ ok: false, error: WORK_BOARD_GONE }, { ok: false, error: WORK_BOARD_GONE }, { ok: false, error: WORK_BOARD_ARCHIVED }]
  );
  eq(
    "ownership: a customer of another tab or user, an archived one, one on a tab whose list is off",
    [
      await createScheduledCore(U, "wb1", input({ customerId: "cu2" }), db),
      await createScheduledCore(U, "wb1", input({ customerId: "cuTheirs" }), db),
      await createScheduledCore(U, "wb1", input({ customerId: "cuOld" }), db),
      await createScheduledCore(U, "wbOff", input({ customerId: "cuOff" }), db),
    ],
    [{ ok: false, error: SCHEDULED_CUSTOMER_GONE }, { ok: false, error: SCHEDULED_CUSTOMER_GONE }, { ok: false, error: SCHEDULED_CUSTOMER_ARCHIVED }, { ok: false, error: SCHEDULED_CRM_OFF }]
  );
  check("refusals write nothing", db.rows.length === 0);
  const made = await createScheduledCore(U, "wb1", input({ customerId: "cu1", detail: "pricing" }), db);
  check("create: on the tab, for its customer, the reminder unsent; answers the row's view", made.ok && made.value.boardId === "wb1" && made.value.customer?.id === "cu1" && made.value.customer.phone === "0412 345 678" && made.value.channel === "CALL" && made.value.dueAt === "2026-10-20T22:30:00.000Z" && db.rows[0].remindSentAt === null, JSON.stringify(made));
  const id = made.ok ? made.value.id : "";
  const row = db.rows[0];
  row.remindSentAt = min(1); // the dispatcher sent it
  await editScheduledCore(U, id, input({ customerId: "cu1", title: "Call Jane back" }), db);
  check("edit: the same time keeps remindSentAt (never pushed twice)", row.title === "Call Jane back" && row.remindSentAt?.getTime() === min(1).getTime());
  row.dueAt = new Date(row.dueAt.getTime() + 25_000); // a time with seconds (a snooze, a backfilled reminder)
  await editScheduledCore(U, id, input({ customerId: "cu1", title: "Call Jane back today" }), db);
  check("edit: the sheet's whole-minute time over a stored time with seconds is no move (its seconds and sent stamp kept)", row.remindSentAt?.getTime() === min(1).getTime() && row.dueAt.toISOString() === "2026-10-20T22:30:25.000Z");
  await editScheduledCore(U, id, input({ customerId: "cu1", when: "2026-10-22T09:30" }), db);
  check("edit: a moved time clears remindSentAt (armed again)", row.remindSentAt === null && row.dueAt.toISOString() === "2026-10-21T22:30:00.000Z");
  eq("edit: another user's task is gone", await editScheduledCore("u2", id, input(), db), { ok: false, error: SCHEDULED_GONE });

  // Done, with and without the log.
  eq("done: 'Log to history' on a task with no customer is refused", await doneScheduledCore(U, (await createScheduledCore(U, "wb1", input(), db) as { value: { id: string } }).value.id, { log: { action: "CALL", brief: "x" } }, NOW, db), { ok: false, error: SCHEDULED_LOG_NO_CUSTOMER });
  eq("done: a log's action is one of the customer actions", await doneScheduledCore(U, id, { log: { action: "PHONE", brief: "x" } }, NOW, db), { ok: false, error: INTERACTION_ACTION_BAD });
  db.failLog = true;
  let threw = false;
  try {
    await doneScheduledCore(U, id, { log: { action: "CALL", brief: "Called about the quote" } }, NOW, db);
  } catch {
    threw = true;
  }
  check("done: one write (the entry failing leaves the task open)", threw && row.doneAt === null && db.interactions.length === 0);
  db.failLog = false;
  const done = await doneScheduledCore(U, id, { log: { action: "CALL", brief: "Called about the quote" } }, NOW, db);
  check("done + log: doneAt now, one entry in the customer's log (now, Call, the brief)", done.ok && row.doneAt?.getTime() === NOW.getTime() && db.interactions.length === 1 && db.interactions[0].customerId === "cu1" && db.interactions[0].action === "CALL" && db.interactions[0].brief === "Called about the quote" && done.value.interactionId === "ci1", JSON.stringify(done));
  const again = await doneScheduledCore(U, id, { log: { action: "CALL", brief: "again" } }, NOW, db);
  check("done: again is ok and writes nothing", again.ok && again.value.interactionId === null && db.interactions.length === 1);
  row.remindSentAt = min(2);
  await reopenScheduledCore(U, id, { interactionId: "ci1" }, NOW, db);
  check("open again (Done's Undo): open, its sent stamp kept, the logged entry archived", row.doneAt === null && row.remindSentAt?.getTime() === min(2).getTime() && db.interactions[0].archivedAt != null);

  // Snooze.
  row.allDay = true;
  const sn = await snoozeScheduledCore(U, id, "tomorrow", NOW, db);
  check("snooze: to the preset's time, timed, armed again", sn.ok && row.dueAt.toISOString() === syd("2026-10-21T09:00").toISOString() && !row.allDay && row.remindSentAt === null);
  eq("snooze: an unknown preset, or a done task, is refused", [await snoozeScheduledCore(U, id, "someday", NOW, db)], [{ ok: false, error: SCHEDULED_SNOOZE_BAD }]);

  // Archive and restore.
  check("archive: off every list (and again: ok)", (await archiveScheduledCore(U, id, NOW, db)).ok && (await archiveScheduledCore(U, id, NOW, db)).ok && row.archivedAt != null);
  eq("archive: an archived task cannot be edited", await editScheduledCore(U, id, input({ customerId: "cu1" }), db), { ok: false, error: SCHEDULED_ARCHIVED });
  check("restore: back", (await restoreScheduledCore(U, id, db)).ok && row.archivedAt === null);
  db.customersById.get("cu1")!.archivedAt = new Date(0);
  eq("a task whose customer is archived is held with them (refused)", await doneScheduledCore(U, id, {}, NOW, db), { ok: false, error: SCHEDULED_CUSTOMER_ARCHIVED });
  db.customersById.get("cu1")!.archivedAt = null;

  // The agenda and its links: ?task= (an id, or an old customer task's), ?callback= (an old call back's).
  const legacy = await createScheduledCore(U, "wb1", input({ title: "From a call back" }), db);
  const lid = legacy.ok ? legacy.value.id : "";
  db.rows.find((r) => r.id === lid)!.legacyCallBackId = "cbOld";
  db.rows.find((r) => r.id === id)!.legacyCustomerTaskId = "ctOld";
  const other = await createScheduledCore(U, "wb2", input(), db);
  const ag = (query: Record<string, unknown>) => loadAgenda(U, "wb1", { now: NOW, query }, db);
  const [byId, byTaskLegacy, byCallBack, foreign, unknown, none] = await Promise.all([ag({ task: id }), ag({ task: "ctOld" }), ag({ callback: "cbOld" }), ag({ task: other.ok ? other.value.id : "" }), ag({ callback: "zz" }), ag({})]);
  const focus = (a: Awaited<ReturnType<typeof loadAgenda>>) => (a.kind === "ok" ? [a.focus, a.focusMissing] : a.kind);
  eq("agenda focus: ?task=<id>; ?task=<old customer task id>; ?callback=<old call back id>; another tab's or an unknown one is said; none", [focus(byId), focus(byTaskLegacy), focus(byCallBack), focus(foreign), focus(unknown), focus(none)], [[id, false], [id, false], [lid, false], [null, true], [null, true], [null, false]]);
  eq("agenda: an unknown or another user's tab is gone; an archived one says so", [(await loadAgenda(U, "zz", { now: NOW }, db)).kind, (await loadAgenda(U, "wbTheirs", { now: NOW }, db)).kind, (await loadAgenda(U, "wbOld", { now: NOW }, db)).kind], ["gone", "gone", "archived"]);
  eq("?task= on a customer page resolves an old customer task's id too", [(await resolveTaskParam(U, "ctOld", db))?.id, await resolveTaskParam(U, "nope", db)], [id, null]);

  // The due route.
  const res = await handleDueRequest({ userId: () => U, now: () => NOW, load: async (u, n) => [{ id: `for-${u}`, boardId: "wb1", boardName: "B", title: n.toISOString(), channel: "CALL", dueAt: n.toISOString(), allDay: false, customer: null }] });
  const body = (await res.json()) as { nowIso: string; tasks: BannerTask[] };
  check("/api/scheduled/due: the user's tasks and the server's clock, never cached", res.status === 200 && res.headers.get("cache-control") === "no-store" && body.nowIso === NOW.toISOString() && body.tasks[0].id === "for-u1");
  const bad = await handleDueRequest({ userId: () => U, load: async () => Promise.reject(new Error("db down")) });
  check("/api/scheduled/due: a failed read is a 500 with no tasks (the banner keeps what it had)", bad.status === 500 && ((await bad.json()) as { tasks: unknown[] }).tasks.length === 0);
}

// ── 4. The migration and the backfill ──────────────────────────────────────
function sql() {
  section("the migration and the backfill");
  const migPath = "prisma/migrations/20261227000000_scheduled_tasks/migration.sql";
  const bfPath = "prisma/backfill/scheduled_tasks.sql";
  check("files: the migration and the standalone backfill exist", existsSync(join(ROOT, migPath)) && existsSync(join(ROOT, bfPath)));
  const mig = read(migPath);
  const bf = read(bfPath);
  const body = (s: string) => s.replace(/--[^\n]*\n/g, "\n");
  const m = body(mig);
  check("migration: one transaction (BEGIN … COMMIT)", /^BEGIN;$/m.test(mig) && /^COMMIT;\s*$/m.test(mig) && mig.trimEnd().endsWith("COMMIT;"));
  check("migration: additive (no DROP, no DELETE FROM, no TRUNCATE, no retyped or renamed column)", !/\bDROP\b|DELETE FROM|\bTRUNCATE\b|ALTER COLUMN|RENAME/i.test(m));
  check(
    "table: ScheduledTask with every column, timestamptz throughout",
    /CREATE TABLE "public"\."ScheduledTask"/.test(m) &&
      ['"dueAt" TIMESTAMPTZ(3) NOT NULL', '"allDay" BOOLEAN NOT NULL DEFAULT false', '"title" TEXT NOT NULL', '"detail" TEXT,', `"channel" TEXT NOT NULL DEFAULT 'OTHER'`, '"remind" BOOLEAN NOT NULL DEFAULT true', '"remindSentAt" TIMESTAMPTZ(3),', '"doneAt" TIMESTAMPTZ(3),', '"archivedAt" TIMESTAMPTZ(3),', '"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP', '"updatedAt" TIMESTAMPTZ(3) NOT NULL', '"legacyCallBackId" TEXT,', '"legacyCustomerTaskId" TEXT,', '"customerId" TEXT,', '"boardId" TEXT NOT NULL'].every((c) => m.includes(c))
  );
  check("table: the channel CHECK (the five)", m.includes(`CHECK ("channel" IN ('CALL', 'VISIT', 'EMAIL', 'MESSAGE', 'OTHER'))`));
  check(
    "indexes: the agenda (boardId, doneAt, dueAt), the user's (bell, banner), a customer's, the two unique legacy ids",
    ['"ScheduledTask_boardId_doneAt_dueAt_idx" ON "public"."ScheduledTask"("boardId", "doneAt", "dueAt")', '"ScheduledTask_userId_doneAt_dueAt_idx"', '"ScheduledTask_customerId_dueAt_idx"', 'UNIQUE INDEX "ScheduledTask_legacyCallBackId_key"', 'UNIQUE INDEX "ScheduledTask_legacyCustomerTaskId_key"'].every((c) => m.includes(c))
  );
  check("indexes: the dispatcher's partial index (dueAt WHERE remind AND unsent, open, kept)", m.includes(`CREATE INDEX "ScheduledTask_remind_due_idx" ON "public"."ScheduledTask"("dueAt") WHERE "remind" = true AND "remindSentAt" IS NULL AND "doneAt" IS NULL AND "archivedAt" IS NULL;`));
  check("keys: the tab (RESTRICT, as every work row) and the customer (SET NULL)", m.includes(`FOREIGN KEY ("boardId") REFERENCES "public"."WorkBoard"("id") ON DELETE RESTRICT`) && m.includes(`FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL`));
  check("CustomerInteraction: one nullable unique legacyCallBackId", m.includes(`ALTER TABLE "public"."CustomerInteraction" ADD COLUMN "legacyCallBackId" TEXT;`) && m.includes(`CREATE UNIQUE INDEX "CustomerInteraction_legacyCallBackId_key"`));

  const block = (s: string) => {
    const a = s.indexOf("-- BEGIN BACKFILL");
    const b = s.indexOf("-- END BACKFILL");
    return a >= 0 && b > a ? s.slice(a, b).replace(/\r\n/g, "\n") : "";
  };
  check("backfill: the migration's BACKFILL block and the standalone file's are the same statements", block(mig) !== "" && block(mig) === block(bf));
  check("backfill file: its own transaction, re-runnable, nothing but the block", /^BEGIN;$/m.test(bf) && bf.trimEnd().endsWith("COMMIT;") && !/\bDROP\b|DELETE FROM|\bTRUNCATE\b|CREATE TABLE/i.test(body(bf)));
  const b = body(block(mig));
  const inserts = [...b.matchAll(/INSERT INTO[\s\S]*?;/g)].map((x) => x[0]);
  check("backfill: three INSERTs, each ON CONFLICT on its unique legacy id DO NOTHING (idempotent)", inserts.length === 3 && /ON CONFLICT \("legacyCustomerTaskId"\) DO NOTHING;$/.test(inserts[0]) && /ON CONFLICT \("legacyCallBackId"\) DO NOTHING;$/.test(inserts[1]) && /ON CONFLICT \("legacyCallBackId"\) DO NOTHING;$/.test(inserts[2]));
  check("backfill: ids derived from the legacy ids ('sct_', 'scb_', 'icb_'), so a re-run collides instead of doubling", inserts[0].includes(`'sct_' || ct."id"`) && inserts[1].includes(`'scb_' || cb."id"`) && inserts[2].includes(`'icb_' || cb."id"`));
  const [ct, cb, ci] = inserts;
  check(
    "customer tasks: as they are (the customer's tab, the time, remind, sent, done, archived; UTC → timestamptz); CALL when the title says call",
    ct.includes(`cu."boardId"`) && ct.includes(`ct."dueAt" AT TIME ZONE 'UTC'`) && ct.includes(`ct."remind",`) && ct.includes(`ct."remindSentAt" AT TIME ZONE 'UTC'`) && ct.includes(`ct."doneAt" AT TIME ZONE 'UTC'`) && ct.includes(`ct."archivedAt" AT TIME ZONE 'UTC'`) && ct.includes(`CASE WHEN ct."title" ~* '\\m(call|phone)' THEN 'CALL' ELSE 'OTHER' END`) && ct.includes(`JOIN "public"."Customer" cu ON cu."id" = ct."customerId"`)
  );
  check(
    "call backs, when: the reminder; else the linked task's day at 09:00 Sydney; else when the call happened",
    cb.includes(`WHEN cb."remindAt" IS NOT NULL THEN cb."remindAt" AT TIME ZONE 'UTC'`) && cb.includes(`(COALESCE(t."planDay", t."dueDay") + TIME '09:00') AT TIME ZONE 'Australia/Sydney'`) && cb.includes(`ELSE cb."at" AT TIME ZONE 'UTC'`)
  );
  check(
    "call backs: all day without a reminder; the task's title else 'Call back'; the tags joined ' · '; how (remindAction, else action) PHONE → CALL, IN_PERSON → VISIT; remind iff it had one",
    cb.includes(`cb."remindAt" IS NULL,`) && cb.includes(`COALESCE(NULLIF(btrim(t."title"), ''), 'Call back')`) && cb.includes(`NULLIF(array_to_string(COALESCE(cb."tags", ARRAY[]::TEXT[]), ' · '), '')`) && cb.includes(`CASE COALESCE(cb."remindAction", cb."action") WHEN 'IN_PERSON' THEN 'VISIT' ELSE 'CALL' END`) && cb.includes(`cb."remindAt" IS NOT NULL,`)
  );
  check(
    "call backs, done: the linked task's completion (completedAt, else its latest DONE* instance); a dropped task; a log that asked nothing more",
    cb.includes(`t."completedAt",`) && cb.includes(`i."status" LIKE 'DONE%'`) && cb.includes(`WHEN t."id" IS NOT NULL AND t."archivedAt" IS NOT NULL THEN t."archivedAt" AT TIME ZONE 'UTC'`) && cb.includes(`WHEN cb."remindAt" IS NULL AND t."id" IS NULL THEN cb."updatedAt" AT TIME ZONE 'UTC'`)
  );
  check("call backs: customer, sent stamp and archive copied", cb.includes(`cb."customerId",`) && cb.includes(`cb."remindSentAt" AT TIME ZONE 'UTC'`) && cb.includes(`cb."archivedAt" AT TIME ZONE 'UTC'`));
  check("the call itself: a call back with a customer becomes one log entry (Call or Visit, the tags, ≤ 280; archived with it)", ci.includes(`INSERT INTO "public"."CustomerInteraction"`) && ci.includes(`WHERE cb."customerId" IS NOT NULL`) && ci.includes(`CASE cb."action" WHEN 'IN_PERSON' THEN 'VISIT' ELSE 'CALL' END`) && ci.includes(`left(array_to_string(COALESCE(cb."tags", ARRAY[]::TEXT[]), ' · '), 280)`) && ci.includes(`cb."archivedAt",`));
  const upd = b.slice(b.indexOf(`UPDATE "public"."TaskTemplate"`));
  check(
    "the linked tasks: archived only when a call back links them, a one-off TASK on a work board, not done, not archived; after the inserts (so they read the user's own archive only)",
    b.indexOf(`UPDATE "public"."TaskTemplate"`) > b.lastIndexOf("INSERT INTO") &&
      /WHERE t\."archivedAt" IS NULL\s+AND t\."completedAt" IS NULL\s+AND t\."kind" = 'TASK'\s+AND t\."recurrence" IS NULL\s+AND t\."boardId" IS NOT NULL\s+AND EXISTS \(SELECT 1 FROM "public"\."CallBack" cb WHERE cb\."taskId" = t\."id"\);/.test(upd)
  );
  check("the old tables stay: CallBack and CustomerTask are read, never written or dropped", !/(INSERT INTO|UPDATE|DELETE FROM)\s+"public"\."(CallBack|CustomerTask)"/.test(b) && /model CallBack \{/.test(read("prisma/schema.prisma")) && /model CustomerTask \{/.test(read("prisma/schema.prisma")));

  const schema = read("prisma/schema.prisma");
  // Spaces collapsed: Phase 2's collection relation (migration 20261228000000_crm) widened the model's columns when
  // `prisma format` realigned them; the fields themselves are as they were.
  const model = (/model ScheduledTask \{([\s\S]*?)\n\}/.exec(schema.replace(/\r\n/g, "\n"))?.[1] ?? "").replace(/[ \t]+/g, " ");
  check(
    "schema: ScheduledTask's fields, timestamptz, the legacy ids unique, the three indexes",
    ["dueAt DateTime @db.Timestamptz(3)", "remindSentAt DateTime? @db.Timestamptz(3)", "doneAt DateTime? @db.Timestamptz(3)", "archivedAt DateTime? @db.Timestamptz(3)", "legacyCallBackId String? @unique", "legacyCustomerTaskId String? @unique", "@@index([boardId, doneAt, dueAt])", "@@index([userId, doneAt, dueAt])", "@@index([customerId, dueAt])", "onDelete: SetNull", 'channel String @default("OTHER")'].every((c) => model.includes(c)),
    model.slice(0, 200)
  );
  check("schema: the CHECK and the partial index named where Prisma 6 cannot declare them", /Not expressible in Prisma 6: CHECK "ScheduledTask_channel_check"/.test(schema) && /partial INDEX\s*\n?\/\/\/ "ScheduledTask_remind_due_idx"|"ScheduledTask_remind_due_idx" \("dueAt"\) WHERE/.test(schema.replace(/\r\n/g, "\n")));
  check("schema: CustomerInteraction.legacyCallBackId; WorkBoard and Customer relate", /legacyCallBackId String\?\s+@unique/.test(schema) && /scheduledTasks ScheduledTask\[\]/.test(schema));
  check("schema: still CRLF (as checked in)", schema.includes("\r\n") && !/[^\r]\n/.test(schema));
}

// ── 5. The wiring and the UI ───────────────────────────────────────────────
async function wiring() {
  section("the wiring and the UI");
  const dir = "src/app/today/work/[boardId]";
  const layout = code(read(`${dir}/layout.tsx`));
  check("frame: the work layout wraps every work page; its header streams in Suspense (the layout awaits nothing); data-skin='work'", /<Suspense fallback=\{<WorkHeaderFallback \/>\}>\s*<WorkHeaderSlot params=\{params\} \/>\s*<\/Suspense>/.test(layout) && /data-skin="work"/.test(layout) && !/\bawait\b/.test(layout) && /import "@\/components\/work\/work\.css";/.test(layout));
  const agenda = code(read(`${dir}/page.tsx`));
  check("Agenda: the tab's index, force-dynamic, titled '<tab> · Agenda', reading ?task= and ?callback= through loadAgenda", /export const dynamic = "force-dynamic";/.test(agenda) && /title: "Agenda"/.test(agenda) && /loadAgenda\(getCurrentUserId\(\), boardId, \{ now, query \}\)/.test(agenda) && /<ShellTitle eyebrow=\{agenda\.board\.name\} title="Agenda" \/>/.test(agenda) && /notFound\(\)/.test(agenda));
  const tasks = code(read(`${dir}/tasks/page.tsx`));
  check("Tasks: the tab's board moved to /tasks (TodayBoard work), no call backs", existsSync(join(ROOT, `${dir}/tasks/loading.tsx`)) && /<TodayBoard [^>]*work=\{\{ id: board\.id/.test(tasks) && !/callBacks|CALLBACK/.test(tasks) && /title="Tasks"/.test(tasks));
  check("the old call back code is gone", ["src/lib/callbacks.ts", "src/lib/callbacks-server.ts", "src/app/actions/callbacks.ts", "src/components/work/callbacks", "src/components/today/WorkBoardCard.tsx"].every((f) => !existsSync(join(ROOT, f))));

  // Phase 2 (2026-10-20): Deals joins right after Customers, while the customer list is on (deals live with it).
  eq("nav: a tab's pages (Agenda · Customers · Deals · Orders · Tasks, the lists only while on)", [workSubsOf({ id: "w1", crmOn: true, ordersOn: true }).map((s) => `${s.label} ${s.href}`), workSubsOf({ id: "w1" }).map((s) => s.label)], [["Agenda /today/work/w1", "Customers /today/work/w1/customers", "Deals /today/work/w1/deals", "Orders /today/work/w1/orders", "Tasks /today/work/w1/tasks"], ["Agenda", "Tasks"]]);
  eq("nav: which page a path is on", ["/today/work/w1", "/today/work/w1/", "/today/work/w1/customers", "/today/work/w1/customers/c1", "/today/work/w1/orders", "/today/work/w1/tasks", "/today", "/today/work/w1/zz"].map(workSectionOf), ["agenda", "agenda", "customers", "customers", "orders", "tasks", null, null]);
  eq("nav: titles 'Work · Agenda', 'Work · Tasks' (the page's eyebrow is the tab's name)", [titleFor("/today/work/w1"), titleFor("/today/work/w1/tasks"), titleFor("/today/work/w1/customers"), titleFor("/today/work/w1/orders")], [{ eyebrow: "Work", title: "Agenda" }, { eyebrow: "Work", title: "Tasks" }, { eyebrow: "Work", title: "Customers" }, { eyebrow: "Work", title: "Orders" }]);
  check("nav: the Tasks strip links each work tab's Agenda, and keeps it current on every work page", subsOf("tasks", [{ id: "w1", name: "Acme" }]).some((s) => s.href === workBoardHref("w1") && s.label === "Acme") && ["/today/work/w1", "/today/work/w1/tasks", "/today/work/w1/customers/c1"].every((p) => activeSub(p) === workBoardHref("w1")) && workTasksHref("w1") === "/today/work/w1/tasks");

  // The search: no server, no fetch, per keystroke.
  const search = code(read("src/components/work/WorkSearch.tsx"));
  const onChange = /onChange=\{\(e\) => \{([\s\S]*?)\}\}/.exec(search)?.[1] ?? "";
  check("search: a keystroke only sets state (setQuery, setOpen, setActive): no server action, no fetch", /setQuery\(e\.target\.value\)/.test(onChange) && !/searchWorkFallback|fetch\(|await/.test(onChange));
  check("search: the browser matches over the frame's index (prepareIndex once, matchCustomers and matchTitles per query)", /useMemo\(\(\) => \(index \? prepareIndex\(index\.customers\) : null\), \[index\]\)/.test(search) && /matchCustomers\(prepared, deferred\)/.test(search) && /matchTitles\(index\.tasks, deferred\)/.test(search));
  check("search: the server only without an index (searchWorkFallback behind `if (index …) return`), never fetch()", (search.match(/searchWorkFallback\(/g) ?? []).length === 1 && /if \(index \|\| !deferred\.trim\(\)\) return;/.test(search) && !/\bfetch\(/.test(search));
  check("search: a combobox over a listbox (aria-expanded, aria-controls, aria-activedescendant), a polite count line, Arrow keys, Enter, Escape", /role="combobox"/.test(search) && /aria-activedescendant=\{activeId\}/.test(search) && /role="listbox"/.test(search) && /aria-live="polite"/.test(search) && /e\.key === "ArrowDown"/.test(search) && /e\.key === "Enter"/.test(search) && /e\.key === "Escape"/.test(search) && /role="option"/.test(search));
  check("search: each result names both (name · ID), the match marked; '+n more' opens the Customers page with ?q=", /<Marked text=\{e\.name\} ranges=\{m\.ranges\.name\} \/>/.test(search) && /<Marked text=\{e\.number\} ranges=\{m\.ranges\.number\} \/>/.test(search) && /customersHref\(board\.id\)\}\?q=\$\{encodeURIComponent\(query\.trim\(\)\)\}/.test(search));
  const cv = code(read("src/components/customers/CustomersView.tsx"));
  check("Customers page: the same matcher, live (no submit button), ?q= kept with replaceState, no server action or fetch per keystroke", /matchCustomers\(index, query, \{ limit: SEARCH_LIST_MAX \}\)/.test(cv) && /onChange=\{\(e\) => type\(e\.target\.value\)\}/.test(cv) && /window\.history\.replaceState\(null, ""/.test(cv) && /params\.set\(QUERY_PARAM, next\)/.test(cv) && !/fetch\(/.test(cv) && !/searchCustomers|searchPick/.test(cv) && !/type="submit"/.test(cv));
  check("the old search is gone (customers.ts searchCustomers / searchPick)", !/export function searchCustomers|export function searchPick/.test(read("src/lib/customers.ts")));

  // The banner.
  const rootLayout = code(read("src/app/layout.tsx"));
  check("banner: mounted once by the root layout, outside <main> (every page)", (rootLayout.match(/<WorkReminders \/>/g) ?? []).length === 1 && rootLayout.indexOf("<WorkReminders />") > rootLayout.indexOf("</AppShell>"));
  const wr = code(read("src/components/work/WorkReminders.tsx"));
  check("banner: polls the due route every minute while visible, and on focus and visibilitychange", /fetch\(DUE_ROUTE, \{ cache: "no-store"/.test(wr) && /setInterval\(\(\) => void load\(\), BANNER_POLL_MS\)/.test(wr) && /addEventListener\("focus", onBack\)/.test(wr) && /addEventListener\("visibilitychange", onBack\)/.test(wr) && /document\.visibilityState !== "visible"\) return;/.test(wr));
  check("banner: once per device per due time, in localStorage under try/catch", wr.includes("BANNER_STORAGE_KEY") && /try \{\s*return prunedShown\(JSON\.parse\(window\.localStorage\.getItem\(BANNER_STORAGE_KEY\)/.test(wr) && /try \{\s*window\.localStorage\.setItem\(BANNER_STORAGE_KEY/.test(wr) && BANNER_STORAGE_KEY === "xtnl:work:reminders-shown");
  check("banner: polite, never takes focus (no .focus(), no autofocus)", /role="status" aria-live="polite"/.test(wr) && !/\.focus\(|autoFocus|data-autofocus/.test(wr));
  check("banner: Done, Snooze 10 min, Open and dismiss (×); a stack's head line", />\s*Done\s*</.test(wr) && /Snooze 10 min/.test(wr) && />\s*Open\s*</.test(wr) && /aria-label=\{stack\.length > 1 \? "Dismiss these reminders" : "Dismiss this reminder"\}/.test(wr) && /bannerHeadOf\(stack\)/.test(wr) && /snoozeScheduledTask\(t\.id, "10min"/.test(wr));
  check("banner: sound and haptic by this device's prefs (DEVICE_PREFS_STORAGE_KEY), silent in Still", /readStoredPrefs\(window\.localStorage\.getItem\(PREFS_STORAGE_KEY\), window\.localStorage\.getItem\(DEVICE_PREFS_STORAGE_KEY\)\)/.test(wr) && /if \(motionLevel\(\) === "still"\) return;/.test(wr) && /prefs\.sound === "soft"/.test(wr) && /prefs\.haptics === "on"/.test(wr));
  const srv = code(read("src/lib/scheduled-tasks-server.ts"));
  const bannerRead = srv.slice(srv.indexOf("export async function loadBannerTasks"), srv.indexOf("const INDEX_CUSTOMERS_MAX"));
  check("banner: its read never marks a reminder sent (findMany only)", /prisma\.scheduledTask\.findMany\(/.test(bannerRead) && !/\.update|updateMany|\$queryRaw|remindSentAt/.test(bannerRead), bannerRead.slice(0, 300));
  const route = code(read("src/app/api/scheduled/due/route.ts"));
  check("route /api/scheduled/due: GET and dynamic only, delegating to handleDueRequest", /export const dynamic = "force-dynamic";/.test(route) && /export async function GET\(\): Promise<Response> \{\s*return handleDueRequest\(\);\s*\}/.test(route) && !/export async function (POST|PUT|DELETE)/.test(route));
  const rcss = read("src/components/work/reminders.css");
  check("banner css: above the tab bar on a phone (clear of the capture button), top right from 600, under the toasts, motion only when Full", /bottom: calc\(var\(--tabbar-h\) \+ 12px \+ env\(safe-area-inset-bottom\)\)/.test(rcss) && /left: 12px; right: 12px;/.test(rcss) && /@media \(min-width: 600px\) \{ \.wrm \{ left: auto; right: 20px; bottom: auto; top: calc\(var\(--topbar-h\) \+ 12px\); width: 380px; \} \}/.test(rcss) && /z-index: calc\(var\(--z-toast\) - 1\)/.test(rcss) && /html\[data-motion="full"\] \.wrm-card\[data-fresh\]/.test(rcss) && /prefers-reduced-motion: reduce/.test(rcss));

  // The bell and the dispatcher read ScheduledTask.
  const notif = code(read("src/lib/notifications.ts"));
  check("bell: notifications.ts reads the due scheduled tasks (a failed read is no line)", /return scheduledNotices\(await loadScheduledBellRows\(userId, now\), now\);\s*\} catch \{\s*return \[\];/.test(notif) && !/callbacks/.test(notif));
  const bell = srv.slice(srv.indexOf("export async function loadScheduledBellRows"), srv.indexOf("const BANNER_READ"));
  check("bell read: reminder on, not done, not archived, due, on an open tab, customer kept", /where: \{ userId, remind: true, doneAt: null, archivedAt: null, dueAt: \{ lte: now \}, \.\.\.OPEN_BOARD, \.\.\.KEPT_CUSTOMER \}/.test(bell));

  // The work skin on the Tasks board, and no game furniture on any work route.
  const tb = code(read("src/components/today/TodayBoard.tsx"));
  check("work skin: the board says data-skin='work'", /data-skin=\{isWork \? "work" : undefined\}/.test(tb));
  check("work skin: a tick is a calm check (words to the live region; no mark, no pluck, no flight)", /if \(isWork\) \{\s*announce\(`Done: \$\{row\.template\.title\}`\);\s*return;\s*\}/.test(tb));
  check("work skin: no moments, no Board clear card, no lane colour or KEPT stamp", !/if \(isWork && ticked\)/.test(tb) && /!isWork && shown\.snapshot\.clear/.test(tb) && /must=\{!isWork\}/.test(tb) && /habit=\{!isWork\}/.test(tb) && /kept=\{!isWork && shown\.mustLaneKept\}/.test(tb) && /kept=\{!isWork && !!shown\.snapshot\.planned\}/.test(tb) && /kept=\{!isWork && !!shown\.snapshot\.habits\}/.test(tb));
  check("work skin: no call backs slot and no card on the board", !/CallBacksSection|work-callbacks|WorkBoardCard/.test(tb));
  const tr = code(read("src/components/today/TaskRow.tsx"));
  check("work skin: a work row has no colour code and no diamond, and no streak", /const accent = props\.work \? null : rowAccentOf\(row\);/.test(tr) && /if \(!work && row\.streak && row\.streak\.days > 0\)/.test(tr));
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f)) files.push(p);
    }
  };
  walk(join(ROOT, "src/components/work"));
  walk(join(ROOT, "src/app/today/work"));
  const game = files.filter((p) => /from "@\/lib\/celebrate"|PricePill|Crest|MomentumCard|xp-|lifeXp|\bfmtXp\b|streak\b(?!:)/.test(code(readFileSync(p, "utf8"))) && !p.endsWith(join("tasks", "page.tsx")));
  check("no game furniture on a work route (no celebration, price, crest, momentum, XP or streak in components/work and the work pages)", game.length === 0, game.map((p) => relative(ROOT, p)).join(", "));

  // CSS: tokens only, 44 px targets, the layer order.
  const css = read("src/components/work/work.css");
  const cssBody = css.replace(/\/\*[\s\S]*?\*\//g, "");
  check("work.css: the layer order first; tokens only (no hex, rgb() or hsl())", css.startsWith("@layer theme, base, components, art, effects, utilities;") && !/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(cssBody) && rcss.startsWith("@layer theme, base, components, art, effects, utilities;") && !/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(rcss.replace(/\/\*[\s\S]*?\*\//g, "")));
  const targets = [".wk-search-in", ".wk-res", ".wk-new", ".wk-tabmenu", ".wk-menu-item", ".wk-sub", ".wk-sec-toggle", ".wk-watch-row", ".st-open", ".st-act", ".st-input", ".st-chan", ".st-x", ".st-pick", ".st-picked"];
  const small = targets.filter((sel) => {
    const rule = new RegExp(`\\${sel} \\{([^}]*)\\}`).exec(cssBody);
    return !rule || !/min-height: 44px/.test(rule[1]);
  });
  check("work.css: every control a 44 px target", small.length === 0, small.join(", "));
  check("work.css: the customer chip is 32 px with a hit area reaching 44 (its ::after, 6 px each way)", /\.st-chip \{[^}]*min-height: 32px;/.test(cssBody) && /\.st-chip::after \{ content: ""; position: absolute; inset: -6px -2px; \}/.test(cssBody));
  const wrSmall = [".wrm-x", ".wrm-act"].filter((sel) => !new RegExp(`\\${sel} \\{[^}]*min-height: 44px`).test(rcss));
  check("reminders.css: every control a 44 px target", wrSmall.length === 0, wrSmall.join(", "));
  check("work.css: no text under 12 px", [...cssBody.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?(\d+(?:\.\d+)?)px/g)].every((x) => Number(x[1]) >= 12));
  check("work.css: overdue in owed ink (never an alarm red); the highlight and the current page in the work accent", /\.wk-sec\[data-sec="overdue"\] \.wk-sec-t, \.wk-sec\[data-sec="overdue"\] \.wk-count \{ color: var\(--owed\); \}/.test(cssBody) && /\.st-row\[data-hl\] \{ background: var\(--raised\); box-shadow: inset 3px 0 0 var\(--work\); \}/.test(cssBody) && /\.wk-sub\[aria-current="page"\] \{[^}]*var\(--work\)/.test(cssBody));
  check("work.css: the band is the accent at 8% over the page, with a 2 px rule", /background: color-mix\(in srgb, var\(--work\) 8%, var\(--page\)\); box-shadow: inset 0 2px 0 var\(--work\);/.test(cssBody));
  check("work.css: the work skin drops the lane marks, colours and flourish", /\.today-board\[data-skin="work"\] \.lane-mark \{ display: none; \}/.test(cssBody) && /\.today-board\[data-skin="work"\] \.t-row\[data-motion="hold"\] \.tick\[data-state="done"\]::after \{ animation: none; opacity: 0; \}/.test(cssBody));
  check("work.css: transitions change colour and shadow only (one chevron turns)", [...cssBody.matchAll(/transition:([^;]*);/g)].every((x) => !/width|height|margin|padding|top|left/.test(x[1])));

  // Interactions: the four contact actions, old rows still reading.
  eq("interactions: Call · Visit · Email · Message join the four (stored as text, old rows unchanged)", [CUSTOMER_ACTIONS.slice(0, 4), CUSTOMER_ACTIONS.slice(0, 4).map((x) => CUSTOMER_ACTION_LABEL[x]), ["PURCHASE", "INQUIRY", "COMPLAINT", "CREDIT_CHECK", "CALL", "VISIT", "EMAIL", "MESSAGE"].every(isCustomerAction), isCustomerAction("PHONE")], [["CALL", "VISIT", "EMAIL", "MESSAGE"], ["Call", "Visit", "Email", "Message"], true, false]);
  check("interactions: the contact actions draw the app's own icons", Object.values(CUSTOMER_ACTION_ICON).every((i) => i && i in TASK_ICONS));

  await render();
}

/** The Agenda and a row, rendered with next/navigation stubbed. */
async function render() {
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
    const { AgendaView } = await import("../src/components/work/AgendaView");
    const v = (id: string, dueAt: Date, over: Partial<ScheduledView> = {}): ScheduledView => ({ id, boardId: "wb1", dueAt: dueAt.toISOString(), allDay: false, title: `Task ${id}`, detail: null, channel: "CALL", remind: true, remindSentAt: null, doneAt: null, customer: null, ...over });
    const rows = [
      v("o1", syd("2026-10-20T10:00"), { customer: { id: "cu1", number: "C-1042", name: "Jane Nguyen", phone: "0412 345 678" }, detail: "pricing\nsecond line" }),
      v("t1", syd("2026-10-20T17:00"), { channel: "EMAIL" }),
      v("l1", syd("2026-12-20T10:00")),
      v("d1", syd("2026-10-19T10:00"), { doneAt: syd("2026-10-20T09:00").toISOString() }),
    ];
    const html = renderToStaticMarkup(createElement(AgendaView, { board: { id: "wb1", name: "Acme", crmOn: true }, rows, focus: null, focusMissing: false, nowIso: NOW.toISOString() }));
    check("render: the sections (Overdue, Today; Later and Done folded with their counts)", /Overdue/.test(html) && /Today/.test(html) && /aria-expanded="false"[^>]*>.*Later.*1/.test(html.replace(/\n/g, "")) && /Done/.test(html) && !html.includes('id="st-l1"') && !html.includes('id="st-d1"'));
    check("render: a row: its time, the channel's glyph, the title, the bell, the customer chip (name · ID, a link), the detail's first line", html.includes('id="st-o1"') && html.includes("<b>10:00</b>") && /class="i st-glyph"/.test(html) && html.includes("Task o1") && /class="st-bell"/.test(html) && /<a class="st-chip" href="\/today\/work\/wb1\/customers\/cu1">Jane Nguyen · C-1042<\/a>/.test(html) && html.includes("pricing") && !html.includes("second line"));
    check("render: Call and Text (tel:, sms:) for a customer with a phone; Snooze; Done as the kit's tick", /href="tel:0412345678"/.test(html) && /href="sms:0412345678"/.test(html) && /aria-haspopup="menu"/.test(html) && />Snooze</.test(html) && /role="checkbox"[^>]*aria-label="Done: Task o1"/.test(html));
    check("render: the side column (Customers to watch: Jane, overdue) for the desktop", /Customers to watch/.test(html) && /1 overdue/.test(html));
    const empty = renderToStaticMarkup(createElement(AgendaView, { board: { id: "wb1", name: "Acme", crmOn: false }, rows: [], focus: null, focusMissing: true, nowIso: NOW.toISOString() }));
    check("render: nothing scheduled is one calm line and 'Schedule a task'; a missing ?task= is said", /Nothing scheduled/.test(empty) && /Schedule a task/.test(empty) && /not on this agenda/.test(empty));
    check("render: no game words on the Agenda (XP, streak, kept, momentum)", !/\bXP\b|streak|Kept|momentum/i.test(html + empty));
  } finally {
    M._load = load;
  }
}

// ── 6. The 344 px arithmetic ───────────────────────────────────────────────
function fit() {
  section("344 px");
  const L = WORK_LAYOUT;
  const css = read("src/components/work/work.css").replace(/\/\*[\s\S]*?\*\//g, "");
  check(
    "work.css draws the row with work-layout's numbers ([time 44] [body] [done 44], gap 8, padding 8; actions gap 6)",
    css.includes(`grid-template-columns: ${L.ROW_TIME}px minmax(0, 1fr) ${L.ROW_DONE}px; column-gap: ${L.ROW_GAP}px;`) && css.includes(`padding: 4px ${L.ROW_PAD}px;`) && /\.st-acts \{[^}]*gap: 6px;/.test(css) && L.ACT_GAP === 6
  );
  check("work.css draws the band with work-layout's numbers (gap 8, the search ≥ 140)", /\.wk-band \{[^}]*gap: 8px;/.test(css) && css.includes(`min-width: ${L.SEARCH_MIN}px;`) && L.BAND_GAP === 8);
  const body = rowBodyWidth(L.PHONE);
  check(`row at 344: the body is ${body} px; Call · Text · Snooze need ${actsWidth(true)} (no wrap, no sideways scroll)`, body >= actsWidth(true) && body > 0, `${body} vs ${actsWidth(true)}`);
  check(`band at 344: the search keeps ${bandSearchWidth(L.PHONE)} px (≥ ${L.SEARCH_MIN}) beside New and the menu`, bandSearchWidth(L.PHONE) >= L.SEARCH_MIN);
  // Phase 2 (2026-10-20): Deals is the fifth page Phase 1 planned for: the five overrun 312, so the strip scrolls inside
  // itself (the page never does) and the header keeps the current page in the strip's view.
  const four = ["Agenda", "Customers", "Orders", "Tasks"];
  const five = workSubsOf({ id: "w", crmOn: true, ordersOn: true }).map((s) => s.label);
  check(
    `344: the content is 312 px; the four Phase 1 pages need ${subnavWidth(four)} px (14 px, 10 px each side, 2 apart; counts from 600 only), so they fit; with Deals the five need ${subnavWidth(five)}, so the strip scrolls inside itself, never the page`,
    contentWidth(344) === 312 &&
      subnavWidth(four) <= contentWidth(344) &&
      five.length === 5 &&
      subnavWidth(five) > contentWidth(344) &&
      /\.wk-subnav \{[^}]*min-width: 0;[^}]*overflow-x: auto;/.test(css) &&
      /\.wk-sub \{[^}]*padding: 0 10px;[^}]*font: 600 14px/.test(css) &&
      /\.wk-subnav \{ display: flex; gap: 2px;/.test(css) &&
      /\.wk-sub-n \{ display: none;/.test(css) &&
      /@container main \(min-width: 600px\) \{ \.wk-sub-n \{ display: inline; \} \}/.test(css) &&
      /querySelector<HTMLElement>\('\[aria-current="page"\]'\)/.test(code(read("src/components/work/WorkHeader.tsx"))),
    `${subnavWidth(four)} / ${subnavWidth(five)}`
  );
  check("344: the banner is 320 px wide (12 px each side) and its three actions wrap if they must", /\.wrm-acts \{ display: flex; flex-wrap: wrap;/.test(read("src/components/work/reminders.css")));
  check("344: the result list and the menus never run off the screen (the band's full width; a menu aligned to its button's end, at most 100vw − 32)", /\.wk-results \{[^}]*left: 0; right: 0;/.test(css) && /\.wk-menu-list \{[^}]*right: 0;[^}]*max-width: calc\(100vw - 32px\);/.test(css));
}

// ── 7. The work accent ─────────────────────────────────────────────────────
function tokens() {
  section("the work accent (tokens.css)");
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
  const vellumOwn = block(':root[data-theme="vellum"]');
  const vellum = { ...night, ...vellumOwn };
  const rgb = (v: string): Rgb => parseColor(v)!.rgb;
  const FAR = ["--must", "--habit", "--xp", "--pts", ...Array.from({ length: 8 }, (_, i) => `--hab-${i + 1}`)];
  for (const [label, theme, own] of [["Night", night, night], ["Vellum", vellum, vellumOwn]] as const) {
    check(`${label}: --work and --on-work are declared in its own block as colours`, !!own["--work"] && !!parseColor(own["--work"]) && !!own["--on-work"] && !!parseColor(own["--on-work"]));
    if (!own["--work"] || !parseColor(own["--work"])) continue;
    const w = rgb(theme["--work"]);
    const near = FAR.map((k) => [k, deltaE(w, rgb(theme[k]))] as const).filter(([, d]) => d < 15);
    check(`${label}: ΔE ≥ 15 from --must, --habit, --xp, --pts and --hab-1..8`, near.length === 0, near.map(([k, d]) => `${k} ${d.toFixed(1)}`).join(", "));
    const sig = ["--kept", "--owed", "--held"].map((k) => [k, deltaE(w, rgb(theme[k]))] as const).filter(([, d]) => d < 8);
    check(`${label}: ΔE ≥ 8 from every signal (kept, owed, held)`, sig.length === 0, sig.map(([k, d]) => `${k} ${d.toFixed(1)}`).join(", "));
    const textOn = ["--card", "--page", "--raised", "--sunken"].map((s) => [s, contrast(w, rgb(theme[s]))] as const).filter(([, r]) => r < 4.5);
    check(`${label}: text-grade (≥ 4.5) on card, page, raised and sunken`, textOn.length === 0, textOn.map(([s, r]) => `${s} ${r.toFixed(2)}`).join(", "));
    check(`${label}: a mark (≥ 3) on the overlay (the menus, the banner)`, contrast(w, rgb(theme["--overlay"])) >= 3, contrast(w, rgb(theme["--overlay"])).toFixed(2));
    check(`${label}: --on-work on --work ≥ 4.5 (New, a chosen channel, the banner's Done)`, contrast(rgb(theme["--on-work"]), w) >= 4.5, contrast(rgb(theme["--on-work"]), w).toFixed(2));
    const band = wash(w, 8, rgb(theme["--page"]));
    const inks = ["--ink-0", "--ink-1", "--ink-2"].map((k) => [k, contrast(rgb(theme[k]), band)] as const).filter(([, r]) => r < 4.5);
    check(`${label}: on the band (8% over the page) every ink step stays ≥ 4.5, and the accent's marks ≥ 3`, inks.length === 0 && contrast(w, band) >= 3, inks.map(([k, r]) => `${k} ${r.toFixed(2)}`).join(", "));
    const values = FAR.map((k) => theme[k].toLowerCase());
    check(`${label}: --work is none of the lane, currency or habit hues`, !values.includes(theme["--work"].toLowerCase()));
  }
}

(async () => {
  const realError = console.error;
  console.error = () => {};
  try {
    rules();
    lookup();
    await cores();
    sql();
    await wiring();
    fit();
    tokens();
  } finally {
    console.error = realError;
  }
  console.log(`\nscheduled-tasks-check: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
