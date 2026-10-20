/**
 * Call backs, after them (2026-10-12; since 2026-10-20 a call back is a scheduled task, the one list that replaced call
 * backs and customer tasks): what a user who had call backs still relies on, and the work tab's reminder plumbing
 * around it. No database, no network, no browser: the cores run against an in-memory ScheduledDb, the components
 * render to static markup.
 *
 *   npx tsx scripts/callbacks-check.ts        (npm run callbacks:check; ui:check runs it too)
 *
 * Covers:
 *   1. the old links still land: a call back reminder's tap URL (/today?board=<b>&callback=<id>) redirects to the tab's
 *      Agenda keeping ?callback=, which resolves to the scheduled task backfilled from that call back
 *      (legacyCallBackId); the bell's old ?callback= link the same; a call back that is not there is said in a line;
 *      the Agenda shows the row past its fold, scrolls to it, focuses it, highlights it, then drops the parameter;
 *   2. the call back's rules that live on in the scheduled task: moving the reminder's time arms it again (and only
 *      that), a reminder never pushed twice for one time, Done keeping the history (the call itself is a log entry);
 *   3. Settings › Notifications never calls enablePush without a user gesture (only from the switch's tap, nothing
 *      awaited before it, never from an effect), and the test line;
 *   4. the bell's work rows (scheduled tasks, warnings, oldest first, capped); the capture sheet on a work tab (no Idea
 *      chip, no Idea link, a work example);
 *   5. wiring: no call back code left, the client never imports the server modules, package.json's order.
 * The scheduled tasks' own rules, cores, SQL and UI: scripts/scheduled-tasks-check.ts; the dispatcher: push-check.
 */
import "./_no-model";
import Module from "node:module";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LEGACY_CALLBACK_PARAM, TASK_PARAM, channelOfLegacyAction, focusParamOf, remindSentAtAfter, scheduledNotices, scheduledTaskHref, type ScheduledView } from "../src/lib/scheduled-tasks";
import { doneScheduledCore, editScheduledCore, loadAgenda, type ScheduledDb } from "../src/lib/scheduled-tasks-server";
import { captureShapeOf } from "../src/lib/capture-shape";
import { parseCapture } from "../src/lib/capture-parse";
import { CAPTURE_EXAMPLE, WORK_CAPTURE_EXAMPLE, WORK_LEGEND, captureExampleOf, insertRowChips } from "../src/components/capture/capture-ui";

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

const NOW = new Date("2026-10-12T04:00:00Z"); // 15:00 in Sydney (AEDT)
const TZ = "Australia/Sydney";
const U = "u1";
const min = (n: number) => new Date(NOW.getTime() + n * 60_000);

/** A small ScheduledDb: one tab, one customer, the tasks the backfill made from call backs. */
function memDb() {
  type Row = Parameters<ScheduledDb["insert"]>[0] & { id: string; remindSentAt: Date | null; doneAt: Date | null; archivedAt: Date | null; legacyCallBackId: string | null };
  const board = { id: "wb1", userId: U, name: "Acme", archivedAt: null as Date | null, crmOn: true };
  const customer = { id: "cu1", userId: U, boardId: "wb1", number: "A-12", name: "Acme Pty", phone: null, archivedAt: null as Date | null };
  const rows: Row[] = [];
  const log: { customerId: string; action: string; brief: string }[] = [];
  const view = (r: Row) => ({ ...r, customer: r.customerId === customer.id ? customer : null });
  const db: ScheduledDb = {
    board: async (u, b) => (u === U && b === board.id ? board : null),
    customer: async (u, id) => (u === U && id === customer.id ? customer : null),
    // No task collections here (Phase 2's are crm-check's).
    collection: async () => null,
    task: async (u, id) => {
      const r = rows.find((x) => x.id === id && x.userId === u);
      return r ? { ...view(r), board } : null;
    },
    byLegacy: async (u, kind, legacyId) => {
      const r = kind === "callback" ? rows.find((x) => x.userId === u && x.legacyCallBackId === legacyId) : undefined;
      return r ? { id: r.id, boardId: r.boardId, customerId: r.customerId } : null;
    },
    insert: async (row) => {
      const id = `st${rows.length + 1}`;
      rows.push({ ...row, id, remindSentAt: null, doneAt: null, archivedAt: null, legacyCallBackId: null });
      return { id };
    },
    patch: async (u, id, where, data) => {
      const r = rows.find((x) => x.id === id && x.userId === u);
      if (!r || (where.open && r.archivedAt) || (where.done && !r.doneAt) || (where.notDone && r.doneAt)) return 0;
      Object.assign(r, data);
      return 1;
    },
    markDone: async (u, id, at, entry) => {
      const r = rows.find((x) => x.id === id && x.userId === u && !x.doneAt && !x.archivedAt);
      if (!r) return { changed: 0, interactionId: null };
      r.doneAt = at;
      if (entry) log.push({ customerId: entry.customerId, action: entry.action, brief: entry.brief });
      return { changed: 1, interactionId: entry ? `ci${log.length}` : null };
    },
    archiveInteraction: async () => 1,
    agenda: async (u, b, since) => rows.filter((r) => r.userId === u && r.boardId === b && !r.archivedAt && (!r.doneAt || r.doneAt >= since)).map(view),
    forCustomer: async (u, c) => rows.filter((r) => r.userId === u && r.customerId === c && !r.archivedAt).map(view),
  };
  return { db, rows, log };
}

// ── 1. The old links still land ────────────────────────────────────────────
async function links() {
  section("the old links still land");
  const today = code(read("src/app/today/page.tsx"));
  check("/today?board=<id>&callback=<id> (a call back reminder's tap URL) redirects to the tab's Agenda, every other parameter kept", /redirect\(`\$\{workBoardHref\(boardParam\)\}\$\{q \? `\?\$\{q\}` : ""\}`\)/.test(today) && /if \(k !== "board" && typeof v === "string"\) rest\.set\(k, v\)/.test(today));
  eq("the parameters: ?callback= is still read (after ?task=)", [LEGACY_CALLBACK_PARAM, TASK_PARAM, focusParamOf({ callback: "cbOld" }), focusParamOf({ task: "st1", callback: "cbOld" })], ["callback", "task", { kind: "callback", id: "cbOld" }, { kind: "task", id: "st1" }]);

  const { db, rows } = memDb();
  await db.insert({ userId: U, boardId: "wb1", customerId: "cu1", dueAt: min(-30), allDay: false, title: "Call back", detail: "acme · pricing", channel: channelOfLegacyAction("PHONE"), remind: true });
  rows[0].legacyCallBackId = "cbOld";
  const hit = await loadAgenda(U, "wb1", { now: NOW, query: { callback: "cbOld" } }, db);
  const miss = await loadAgenda(U, "wb1", { now: NOW, query: { callback: "cbNope" } }, db);
  check("?callback=<old id> on the Agenda resolves to the scheduled task backfilled from it (legacyCallBackId)", hit.kind === "ok" && hit.focus === "st1" && !hit.focusMissing, JSON.stringify(hit));
  check("?callback= naming nothing here is said, not shown", miss.kind === "ok" && miss.focus === null && miss.focusMissing);
  check("a backfilled call back: the call's brief (its tags) is the detail; PHONE is a Call", rows[0].detail === "acme · pricing" && rows[0].channel === "CALL" && channelOfLegacyAction("IN_PERSON") === "VISIT");
  eq("the new tap URL and the bell's link: the task on its tab's Agenda", scheduledTaskHref("wb1", "st1"), "/today/work/wb1?task=st1");

  const view = code(read("src/components/work/AgendaView.tsx"));
  check("Agenda: the asked-for row's fold opens (Later, Done), it is highlighted, then ?task= and ?callback= leave the address (replaceState)", /if \(agenda\.later\.some\(\(r\) => r\.id === focus\)\) setLaterOpen\(true\);/.test(view) && /if \(agenda\.done\.some\(\(r\) => r\.id === focus\)\) setDoneOpen\(true\);/.test(view) && /setHighlight\(focus\);/.test(view) && /params\.delete\(TASK_PARAM\);\s*params\.delete\(LEGACY_CALLBACK_PARAM\);/.test(view) && /window\.history\.replaceState\(null, ""/.test(view));
  check("Agenda: scrolls to the row (motion-aware), focuses it, and lets the highlight fade", /el\.scrollIntoView\(\{ block: "center", behavior: motionLevel\(\) === "still" \? "auto" : "smooth" \}\);/.test(view) && /el\.focus\(\{ preventScroll: true \}\);/.test(view) && /setTimeout\(\(\) => setHighlight\(null\), HIGHLIGHT_MS\)/.test(view));
  const row = code(read("src/components/work/ScheduledRow.tsx"));
  check("each row is its anchor (id st-<id>, focusable) with data-hl", /id=\{taskAnchorId\(task\.id\)\}/.test(row) && /tabIndex=\{-1\}/.test(row) && /data-hl=\{highlighted \? "" : undefined\}/.test(row));

  // Rendered: the line for a link that is not here.
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
    const rowsView = (hit.kind === "ok" ? hit.rows : []) as ScheduledView[];
    const html = renderToStaticMarkup(createElement(AgendaView, { board: { id: "wb1", name: "Acme", crmOn: true }, rows: rowsView, focus: null, focusMissing: true, nowIso: NOW.toISOString() }));
    check("render: a link that is not on this agenda is said in a line; the backfilled call back is a row ('Call back', its brief)", /not on this agenda/.test(html) && html.includes('id="st-st1"') && html.includes("Call back") && html.includes("acme · pricing"));
  } finally {
    M._load = load;
  }
}

// ── 2. The call back's rules, in the scheduled task ────────────────────────
async function rules() {
  section("the call back's rules, in the scheduled task");
  const sent = { dueAt: min(-60), remindSentAt: min(-59) };
  eq("moving the reminder's time arms it again (remindSentAt cleared); keeping it keeps the sent stamp", [remindSentAtAfter(sent, min(30)), remindSentAtAfter(sent, min(-60))?.toISOString()], [null, min(-59).toISOString()]);
  const { db, rows, log } = memDb();
  await db.insert({ userId: U, boardId: "wb1", customerId: "cu1", dueAt: min(-30), allDay: false, title: "Call back", detail: null, channel: "CALL", remind: true });
  rows[0].remindSentAt = min(-29);
  await editScheduledCore(U, "st1", { title: "Call back about pricing", when: "2026-10-12T14:30", channel: "VISIT", customerId: "cu1" }, db);
  check("an edit that keeps the time (14:30, as stored) changes how, never re-sends", rows[0].channel === "VISIT" && rows[0].remindSentAt?.getTime() === min(-29).getTime());
  await editScheduledCore(U, "st1", { title: "Call back about pricing", when: "2026-10-12T16:00", channel: "CALL", customerId: "cu1" }, db);
  check("a moved time clears the sent stamp: it is reminded again then", rows[0].remindSentAt === null);
  const done = await doneScheduledCore(U, "st1", { log: { action: "CALL", brief: "Rang back, sent pricing" } }, NOW, db);
  check("Done with 'Log to history': the call goes into the customer's log in the same write", done.ok && rows[0].doneAt?.getTime() === NOW.getTime() && log.length === 1 && log[0].action === "CALL" && log[0].customerId === "cu1");
}

// ── 3. Settings › Notifications ───────────────────────────────────────────
async function notifications() {
  section("Settings › Notifications");
  const raw = read("src/components/settings/NotificationsSection.tsx");
  const src = code(raw);
  const calls = [...src.matchAll(/enablePush\(\)/g)].length;
  check("enablePush is called exactly once in the section", calls === 1, String(calls));
  const toggle = src.slice(src.indexOf("function toggle("), src.indexOf("async function sendTest"));
  check("…inside toggle(), with nothing awaited before it (the permission prompt needs the tap)", /enablePush\(\)/.test(toggle) && !/await /.test(toggle.slice(0, toggle.indexOf("enablePush()"))));
  check("…and toggle is only the switch's tap handler", [...src.matchAll(/\btoggle\b/g)].length === 2 && /<Switch [^>]*onChange=\{toggle\}/.test(src));
  const effects = [...src.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n {2}\}, \[/g)].map((m) => m[1]);
  check("…never from an effect (on load it only reads pushStatus, which never prompts)", effects.length === 1 && !/enablePush|toggle/.test(effects[0]) && /pushStatus\(\)/.test(effects[0]));
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f)) files.push(p);
    }
  };
  walk(join(ROOT, "src"));
  // A call, not push-client's own definition ('function enablePush(').
  const callers = files.filter((p) => /(?<!function )\benablePush\(\)/.test(code(readFileSync(p, "utf8")))).map((p) => relative(ROOT, p).replace(/\\/g, "/")).sort();
  check("no other module calls enablePush (push-client defines it; the section's tap calls it; the in-app banner never asks)", callers.join() === "src/components/settings/NotificationsSection.tsx", callers.join(", "));

  const { testLineOf, NotificationsSection, TEST_IDLE_LINE } = await import("../src/components/settings/NotificationsSection");
  eq(
    "test line: sent, rate-limited, no device, no keys, refused, a failure",
    [
      testLineOf(200, { sent: 1, failed: 0, removed: 0 }),
      testLineOf(200, { sent: 2, failed: 1, removed: 0 }),
      testLineOf(429, { retryAfter: 42 }),
      testLineOf(200, { skipped: "no-subscriptions" }),
      testLineOf(200, { skipped: "no-vapid" }),
      testLineOf(200, { sent: 0, failed: 1 }),
      testLineOf(500, null),
    ],
    [
      "Sent to 1 device. It should arrive in a few seconds.",
      "Sent to 2 devices. It should arrive in a few seconds. 1 other device didn't take it.",
      "One test a minute. Try again in 42 s.",
      "No device has notifications on yet. Turn them on above, then send a test.",
      "Reminders aren't set up on this server yet.",
      "The push service refused it. Turn notifications off and on again on this device.",
      "Couldn't send a test. Try again.",
    ]
  );
  const html = renderToStaticMarkup(createElement(NotificationsSection));
  check("render: id 'notifications' (the sheet links /settings#notifications), checking at first, no switch until the status is read", /id="notifications"/.test(html) && /Checking this device/.test(html) && !/role="switch"/.test(html) && html.includes(TEST_IDLE_LINE) && /Send a test/.test(html));
  check("render: it names scheduled task reminders (never 'call back')", /Scheduled task reminders/.test(html) && !/call back/i.test(html));
  check("Settings: the section is in SettingsView", /<NotificationsSection \/>/.test(code(read("src/components/settings/SettingsView.tsx"))));
  check("the scheduled task sheet's reminder points to Settings › Notifications", /href="\/settings#notifications"/.test(read("src/components/work/ScheduledTaskSheet.tsx")));
}

// ── 4. The bell and the capture sheet ─────────────────────────────────────
function bellAndCapture() {
  section("the bell and the capture sheet");
  const st = (id: string, m: number) => ({ id, boardId: "wb1", boardName: "Acme", title: "Send the quote", channel: "CALL", dueAt: min(m), allDay: false, customer: { name: "Acme Pty", number: "A-12" } });
  const notes = scheduledNotices([st("s1", -10), { ...st("s2", -20), customer: null, channel: "VISIT", title: "Price list" }], NOW, TZ);
  eq(
    "bell: oldest first; each links its task on the Agenda; warnings (counted)",
    notes.map((n) => [n.id, n.tone, n.title, n.detail, n.href, n.action]),
    [
      ["scheduled-s2", "warn", "Scheduled task · Visit", "Price list · Acme · due 14:40", "/today/work/wb1?task=s2", "Open"],
      ["scheduled-s1", "warn", "Scheduled task · Call", "Send the quote · Acme Pty · A-12 · Acme · due 14:50", "/today/work/wb1?task=s1", "Open"],
    ]
  );
  const feed = code(read("src/lib/notifications.ts"));
  check("bell: the feed reads them in its one wave and a failed read is no line (never a missing bell)", /loadWorkReminders\(userId, now\),\s*\]\);/.test(feed) && /return scheduledNotices\(await loadScheduledBellRows\(userId, now\), now\);\s*\} catch \{\s*return \[\];/.test(feed) && /notices\.push\(\.\.\.workReminders\);/.test(feed));
  check("bell: Today's own Asks never repeat them (they read named ids only)", /if \(n\.id !== "overdue" && n\.id !== "quota" && !penalty\) continue;/.test(code(read("src/components/today/board-ui.ts"))));

  const parsed = parseCapture("send quote", { today: "2026-10-12" });
  const ids = (work: boolean) => insertRowChips(parsed, "send quote", { work }).map((c) => c.id);
  check("capture: a work tab's grammar row has no Idea chip; the personal Board's keeps it", !ids(true).includes("idea") && ids(false).includes("idea") && ids(true).includes("inbox"));
  check("capture: the narrow row on a work tab has no Idea chip either", !insertRowChips(parsed, "send quote", { work: true, narrow: true }).some((c) => c.id === "idea"));
  check("capture: the example line is a work line on a work tab", captureExampleOf(true) === WORK_CAPTURE_EXAMPLE && captureExampleOf(false) === CAPTURE_EXAMPLE && WORK_CAPTURE_EXAMPLE === "send quote to Acme fri !" && !/gym/.test(WORK_CAPTURE_EXAMPLE) && !/idea|goal|weight|#/.test(WORK_LEGEND));
  const ex = parseCapture(WORK_CAPTURE_EXAMPLE, { today: "2026-10-12" });
  check("capture: the work example parses clean (a task, a Must by Friday, no warning)", ex.kind === "TASK" && ex.mode === "TASK" && ex.compulsory && ex.compulsoryWarning === null && ex.dueDay === "2026-10-16" && captureShapeOf(ex, "2026-10-12").kind === "TASK");
  const quick = code(read("src/components/capture/QuickCapture.tsx"));
  check("capture sheet: the placeholder follows the board (captureExampleOf)", /placeholder=\{pocket && empty \? POCKET_PLACEHOLDER : captureExampleOf\(workBoard !== null\)\}/.test(quick) && !/"gym legs 60m every mon,thu !"/.test(quick));
  check("capture sheet: no 'Idea (full form)' link on a work tab", /pathname !== "\/add" && workBoard === null \? \(\s*<Link href="\/add"/.test(quick));
  check("capture sheet: the grammar row is told it is on a work tab", /work=\{workBoard !== null\}/.test(quick) && /insertRowChips\(parsed, text, \{ narrow, work \}\)/.test(code(read("src/components/capture/InsertRow.tsx"))));
  const tb = code(read("src/components/today/TodayBoard.tsx"));
  check("work board: the empty state's example is the work line", /e\.g\. <span className="t-mono">\{captureExampleOf\(isWork\)\}<\/span>/.test(tb) && !/gym legs 60m/.test(tb));
}

// ── 5. Wiring ─────────────────────────────────────────────────────────────
function wiring() {
  section("wiring");
  check("no call back code is left (lib, actions, components, the board's slot)", ["src/lib/callbacks.ts", "src/lib/callbacks-server.ts", "src/app/actions/callbacks.ts", "src/components/work/callbacks"].every((f) => !existsSync(join(ROOT, f))) && !/CallBacksSection|work-callbacks/.test(read("src/components/today/TodayBoard.tsx")));
  const tb = code(read("src/components/today/TodayBoard.tsx"));
  check("TodayBoard: still three work={isWork}", (tb.match(/work=\{isWork\}/g) ?? []).length === 3);
  const actions = code(read("src/app/actions/scheduled-tasks.ts"));
  check("actions: every write refreshes on request and never throws", /"use server"/.test(read("src/app/actions/scheduled-tasks.ts")) && /if \(res\.ok && opts\?\.refresh === true\) refresh\(\);/.test(actions) && /catch \(err\)/.test(actions));
  const client = ["src/components/work/AgendaView.tsx", "src/components/work/ScheduledRow.tsx", "src/components/work/ScheduledTaskSheet.tsx", "src/components/work/WorkSearch.tsx", "src/components/work/WorkHeader.tsx", "src/components/work/WorkReminders.tsx", "src/components/work/work-store.ts"].map((f) => code(read(f))).join("\n");
  check("client: the workspace's components never import the server modules", !/scheduled-tasks-server|reminders-server|push-server|customers-server|@\/lib\/prisma/.test(client));
  const nobody = (re: RegExp) => {
    const out: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && re.test(code(readFileSync(p, "utf8")))) out.push(relative(ROOT, p));
      }
    };
    walk(join(ROOT, "src"));
    return out;
  };
  const writers = nobody(/prisma\.(callBack|customerTask)\.(create|update|upsert|delete)/);
  const readers = nobody(/prisma\.(callBack|customerTask)\./);
  check("nothing writes CallBack or CustomerTask any more (the backfill read them), and nothing in the app reads them", writers.length === 0 && readers.length === 0, [...writers, ...readers].join(", "));

  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  const ui = pkg.scripts["ui:check"].split("&&").map((s) => s.trim());
  const at = ui.indexOf("tsx scripts/callbacks-check.ts");
  // word-model-check (2026-10-13), habit-history-check (2026-10-15) and scheduled-tasks-check (2026-10-20) run between
  // this check and push-check.
  check(
    "package.json: ui:check runs this check before push-check (word-model, habit-history and scheduled-tasks checks between), still ending with roadmap-ui-check",
    at >= 0 &&
      ui[at + 1] === "tsx scripts/word-model-check.ts" &&
      ui[at + 2] === "tsx scripts/habit-history-check.ts" &&
      ui[at + 3] === "tsx scripts/scheduled-tasks-check.ts" &&
      ui[at + 4] === "tsx scripts/push-check.ts" &&
      pkg.scripts["ui:check"].endsWith(" && tsx scripts/roadmap-ui-check.ts")
  );
  check("package.json: callbacks:check runs it alone", pkg.scripts["callbacks:check"] === "tsx scripts/callbacks-check.ts");
}

(async () => {
  const realError = console.error;
  const logged: string[] = [];
  console.error = (...a: unknown[]) => {
    logged.push(a.map((x) => (x instanceof Error ? x.message : String(x))).join(" "));
  };
  try {
    await links();
    await rules();
    await notifications();
    bellAndCapture();
    wiring();
  } finally {
    console.error = realError;
  }
  if (failed) console.log(`  (${logged.length} swallowed errors were logged)`);
  console.log(`\ncallbacks-check: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
