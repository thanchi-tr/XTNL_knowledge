/**
 * Call backs on a work tab, their reminders, customer task reminders, the bell's work rows, Settings ›
 * Notifications and the work tab's capture polish (2026-10-12). No database, no network, no browser: the cores
 * run against an in-memory CallBackDb, the dispatcher against fake stores, the claim SQL is captured from
 * Prisma, and the components render to static markup.
 *
 *   npx tsx scripts/callbacks-check.ts        (npm run callbacks:check; ui:check runs it too)
 *
 * Covers:
 *   1. tags: normalisation (lowercase, trimmed, no '#', ≤ 24 chars, ≤ 8, deduped) and per-tab autocomplete (a tab's
 *      own recent tags only, prefix first, never one already chosen);
 *   2. the reminder: setting or moving remindAt clears remindSentAt (remindPatchOf and the core's write); only the
 *      action changing keeps it; a moved reminder in the past is refused, an unmoved one is kept;
 *   3. the call-back task: created through the capture path ON THAT WORK BOARD (boardId), a plain TASK (never a
 *      goal or an idea, never compulsory, never in the Inbox), planned on the reminder's day, keyed for retries;
 *      renamed and moved with the call back; cleared, it is let go (never deleted);
 *   4. skips: an archived board refuses writes and its reminders are never claimed; customer task reminders skip an
 *      archived customer or tab, done, archived, remind-off, sent and future tasks (the claim SQL and a fake run);
 *   5. the dispatcher's customer tasks: one cap shared with call backs, at most once under overlapping runs (and the
 *      same interleaving against an unguarded claim double-sends, so the test can fail), the words and the URL, a
 *      failed second claim still sends the call backs already claimed;
 *   6. ?callback=<id>: the tap URL, the page reading it, the loader adding an older card, the section's highlight
 *      wiring (scroll, focus, data-highlight, the parameter dropped), and a missing id said in a line;
 *   7. Settings › Notifications never calls enablePush without a user gesture (only from the switch's tap, nothing
 *      awaited before it, never from an effect), and the test line;
 *   8. the bell's work rows; the capture sheet on a work tab (no Idea chip, no Idea link, a work example);
 *   9. wiring: the slot, the page, Settings, package.json, the stylesheet (44 px targets, tokens only).
 */
import "./_no-model";
import Module from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "../src/lib/prisma";
import {
  ACTION_WORDS,
  BELL_WORK_MAX,
  CALLBACK_LOAD_MAX,
  CALLBACK_PARAM,
  REMIND_PAST,
  TAGS_MANY,
  TAG_LONG,
  TAG_MAX,
  WORK_REMINDERS_MORE_ID,
  callBackAnchorId,
  callBackHref,
  callBackTaskParse,
  cleanCallBackInput,
  cleanTags,
  customerTaskHref,
  customerUnknown,
  focusIdOf,
  instantOfWall,
  normalizeTag,
  recentTagsOf,
  reminderOpen,
  reminderStateOf,
  remindPatchOf,
  tagSuggestionsOf,
  wallOfInstant,
  workReminderNotices,
  type CallBackInput,
  type CustomerRef,
} from "../src/lib/callbacks";
import {
  archiveCallBackCore,
  clearReminderCore,
  loadCallBacks,
  restoreCallBackCore,
  restoreReminderCore,
  saveCallBackCore,
  withCrm,
  type CallBackDb,
  type CallBackListRow,
  type CallBackRecord,
  type CallBackWrite,
} from "../src/lib/callbacks-server";
import {
  REMINDER_BATCH,
  REMINDER_SECRET_HEADER,
  callBackUrl,
  customerTaskPayload,
  customerTaskUrl,
  prismaReminderStore,
  runReminderDispatch,
  type DispatchReport,
  type DueCustomerTask,
  type DueReminder,
  type ReminderEnv,
  type ReminderStore,
} from "../src/lib/reminders-server";
import type { PushSender, PushStore } from "../src/lib/push-server";
import { captureShapeOf } from "../src/lib/capture-shape";
import { parseCapture } from "../src/lib/capture-parse";
import { WORK_BOARD_ARCHIVED, WORK_BOARD_GONE } from "../src/lib/work-boards";
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
const tick = () => new Promise<void>((r) => setImmediate(r));
const section = (t: string) => console.log(`— ${t} —`);

const NOW = new Date("2026-10-12T04:00:00Z"); // 15:00 in Sydney (AEDT)
const TZ = "Australia/Sydney";
const U = "u1";
const min = (n: number) => new Date(NOW.getTime() + n * 60_000);

// ── An in-memory CallBackDb ───────────────────────────────────────────────

interface TaskRow {
  id: string;
  userId: string;
  title: string;
  boardId: string | null;
  dueDay: string | null;
  kind: string;
  done: boolean;
  archived: boolean;
  key: string | null;
}

class MemDb implements CallBackDb {
  boards = new Map<string, { id: string; userId: string; archivedAt: Date | null; crmOn: boolean }>();
  rows: CallBackRecord[] = [];
  tasks: TaskRow[] = [];
  customersList: (CustomerRef & { userId: string; boardId: string; archived: boolean })[] = [];
  created: { title: string; dueDay: string | null; boardId: string; key: string | null }[] = [];
  renamed: { id: string; title: string }[] = [];
  moved: { id: string; day: string }[] = [];
  seq = 0;

  addBoard(id: string, opts: { userId?: string; archived?: boolean; crmOn?: boolean } = {}) {
    this.boards.set(id, { id, userId: opts.userId ?? U, archivedAt: opts.archived ? new Date(0) : null, crmOn: opts.crmOn ?? false });
  }
  private joined(r: CallBackRecord): CallBackListRow {
    const t = r.taskId ? this.tasks.find((x) => x.id === r.taskId) : null;
    const c = r.customerId ? this.customersList.find((x) => x.id === r.customerId) : null;
    return {
      ...r,
      tags: [...r.tags],
      task: t ? { id: t.id, title: t.title, done: t.done, archived: t.archived } : null,
      customer: c ? { id: c.id, number: c.number, name: c.name } : null,
    };
  }
  async board(userId: string, boardId: string) {
    const b = this.boards.get(boardId);
    return b && b.userId === userId ? { id: b.id, archivedAt: b.archivedAt, crmOn: b.crmOn } : null;
  }
  async list(userId: string, boardId: string, take: number) {
    return this.rows
      .filter((r) => r.userId === userId && r.boardId === boardId && !r.archivedAt)
      .sort((a, b) => b.at.getTime() - a.at.getTime() || b.id.localeCompare(a.id))
      .slice(0, take)
      .map((r) => this.joined(r));
  }
  async find(userId: string, id: string) {
    const r = this.rows.find((x) => x.id === id && x.userId === userId);
    return r ? this.joined(r) : null;
  }
  async insert(row: Omit<CallBackRecord, "id" | "archivedAt">) {
    const id = `cb${String(++this.seq).padStart(3, "0")}`;
    this.rows.push({ ...row, id, archivedAt: null });
    return { id };
  }
  async patch(userId: string, id: string, where: { open?: boolean; archived?: boolean; noReminder?: boolean }, data: CallBackWrite) {
    const r = this.rows.find((x) => x.id === id && x.userId === userId);
    if (!r) return 0;
    if (where.open && r.archivedAt) return 0;
    if (where.archived && !r.archivedAt) return 0;
    if (where.noReminder && r.remindAt) return 0;
    Object.assign(r, data);
    return 1;
  }
  async customers(userId: string, boardId: string) {
    return this.customersList.filter((c) => c.userId === userId && c.boardId === boardId && !c.archived).map(({ id, number, name }) => ({ id, number, name }));
  }
  async customerByNumber(userId: string, boardId: string, number: string) {
    const c = this.customersList.find((x) => x.userId === userId && x.boardId === boardId && !x.archived && x.number.toLowerCase() === number.toLowerCase());
    return c ? { id: c.id, number: c.number, name: c.name } : null;
  }
  async createTask(userId: string, input: { title: string; dueDay: string | null; boardId: string; key: string | null }) {
    this.created.push(input);
    // The capture path's own shape for the task (createTemplateCore stores captureShapeOf of this parse).
    const shape = captureShapeOf(callBackTaskParse(input.title, input.dueDay), "2026-10-12");
    const again = input.key ? this.tasks.find((t) => t.key === input.key) : null;
    if (again) return { id: again.id, title: again.title };
    const t: TaskRow = { id: `t${this.tasks.length + 1}`, userId, title: input.title, boardId: input.boardId, dueDay: shape.dueDay, kind: shape.kind, done: false, archived: false, key: input.key };
    this.tasks.push(t);
    return { id: t.id, title: t.title };
  }
  async renameTask(_userId: string, taskId: string, title: string) {
    this.renamed.push({ id: taskId, title });
    const t = this.tasks.find((x) => x.id === taskId && !x.archived);
    if (t) t.title = title;
    return !!t;
  }
  async moveTask(_userId: string, taskId: string, day: string) {
    this.moved.push({ id: taskId, day });
    const t = this.tasks.find((x) => x.id === taskId);
    if (t) t.dueDay = day;
    return !!t;
  }
}

const input = (over: Partial<CallBackInput> = {}): CallBackInput => ({ at: NOW.toISOString(), action: "PHONE", tags: [], task: "", remind: null, customer: "", ...over });

// ── 1. Tags ───────────────────────────────────────────────────────────────
async function tags() {
  section("tags");
  eq("normalize: lowercase, trimmed, inner spaces collapsed, no leading '#', no commas", ["  #Acme   Pty ", "ACME", "##vip", "a,b", " \u0007follow\tup ", "", 42 as unknown as string].map(normalizeTag), ["acme pty", "acme", "vip", "a b", "follow up", "", ""]);
  const ok = cleanTags(["Acme", " acme ", "#ACME", "Pricing", "", "  "]);
  eq("clean: deduped in order, empties dropped", ok, { ok: true, tags: ["acme", "pricing"] });
  eq("clean: 24 characters pass, 25 are refused", [cleanTags(["x".repeat(24)]).ok, cleanTags(["x".repeat(25)])], [true, { ok: false, error: TAG_LONG }]);
  eq(`clean: ${TAG_MAX} tags pass, ${TAG_MAX + 1} are refused (counted after dedupe)`, [cleanTags(Array.from({ length: TAG_MAX }, (_, i) => `t${i}`)).ok, cleanTags(Array.from({ length: TAG_MAX + 1 }, (_, i) => `t${i}`)), cleanTags([...Array.from({ length: TAG_MAX }, (_, i) => `t${i}`), "T0"]).ok], [true, { ok: false, error: TAGS_MANY }, true]);
  eq("clean: not a list reads as no tags", cleanTags("acme"), { ok: true, tags: [] });
  eq("recent: newest call back first, each tag once", recentTagsOf([{ tags: ["Acme", "pricing"] }, { tags: ["acme", "follow up"] }, { tags: ["vip"] }]), ["acme", "pricing", "follow up", "vip"]);
  const recent = ["acme", "pricing", "pay later", "apac", "vip", "acme west", "plan b"];
  eq("suggest: nothing typed → the newest, minus the chosen", tagSuggestionsOf(recent, "", ["pricing"], 4), ["acme", "pay later", "apac", "vip"]);
  eq("suggest: prefix matches first, then contains, never a chosen one", tagSuggestionsOf(recent, "a", ["apac"]), ["acme", "acme west", "pay later", "plan b"]);
  eq("suggest: typed words are normalized ('#AC' → 'ac')", tagSuggestionsOf(recent, "#AC", []), ["acme", "acme west", "apac"]);

  // Per tab: the loader reads one tab's call backs, so its tags are that tab's alone.
  const db = new MemDb();
  db.addBoard("wbA");
  db.addBoard("wbB");
  await saveCallBackCore(U, "wbA", null, input({ tags: ["Acme", "Pricing"] }), NOW, db);
  await saveCallBackCore(U, "wbB", null, input({ tags: ["Globex"] }), NOW, db);
  const gone = await saveCallBackCore(U, "wbA", null, input({ tags: ["secret"], at: min(-5).toISOString() }), NOW, db);
  if (gone.ok) await archiveCallBackCore(U, gone.value.id, NOW, db);
  const a = await loadCallBacks(U, "wbA", { now: NOW }, db);
  const b = await loadCallBacks(U, "wbB", { now: NOW }, db);
  check("per tab: tab A's autocomplete holds A's tags only; tab B's holds B's", JSON.stringify(a.recentTags) === JSON.stringify(["acme", "pricing"]) && JSON.stringify(b.recentTags) === JSON.stringify(["globex"]), `${a.recentTags} | ${b.recentTags}`);
  check("per tab: an archived call back's tags are not offered", !a.recentTags.includes("secret"));
  check("stored: the tags saved are the normalized ones", a.rows[0]?.tags.join() === "acme,pricing");
  const srv = code(read("src/lib/callbacks-server.ts"));
  check("per tab: the app's list reads one board (where userId, boardId, archivedAt null)", /prisma\.callBack\.findMany\(\{\s*where: \{ userId, boardId, archivedAt: null \}/.test(srv));
}

// ── 2. The reminder ───────────────────────────────────────────────────────
async function reminder() {
  section("the reminder");
  const sent = { remindAt: min(-60), remindAction: "PHONE", remindSentAt: min(-59) };
  eq("patch: set for the first time → remindSentAt cleared", remindPatchOf({ remindAt: null, remindAction: null, remindSentAt: null }, { at: min(30), action: "PHONE" }), { remindAt: min(30), remindAction: "PHONE", remindSentAt: null });
  eq("patch: moved → remindSentAt cleared (it is sent again at its new time)", remindPatchOf(sent, { at: min(30), action: "PHONE" }), { remindAt: min(30), remindAction: "PHONE", remindSentAt: null });
  eq("patch: the same time, only the action changed → remindSentAt kept", remindPatchOf(sent, { at: min(-60), action: "IN_PERSON" }), { remindAction: "IN_PERSON" });
  eq("patch: cleared → all three null", remindPatchOf(sent, null), { remindAt: null, remindAction: null, remindSentAt: null });
  eq("patch: a new call back (no previous row) with a reminder", remindPatchOf(null, { at: min(30), action: "IN_PERSON" }), { remindAt: min(30), remindAction: "IN_PERSON", remindSentAt: null });

  const past = input({ remind: { at: min(-30).toISOString(), action: "PHONE" } });
  eq("input: a new reminder in the past is refused", cleanCallBackInput(past, NOW), { ok: false, error: REMIND_PAST });
  check("input: an unmoved reminder in the past is kept (an edit of something else)", cleanCallBackInput(past, NOW, min(-30)).ok);
  check("input: a few minutes' slack (a reminder set for 'now' still saves)", cleanCallBackInput(input({ remind: { at: min(-3).toISOString(), action: "PHONE" } }), NOW).ok);

  const db = new MemDb();
  db.addBoard("wb1");
  const made = await saveCallBackCore(U, "wb1", null, input({ remind: { at: min(30).toISOString(), action: "PHONE" } }), NOW, db);
  check("core: a new call back's reminder starts unsent", made.ok && db.rows[0].remindSentAt === null && db.rows[0].remindAt?.getTime() === min(30).getTime());
  const id = made.ok ? made.value.id : "";
  db.rows[0].remindSentAt = min(31); // the dispatcher sent it
  const later = new Date(min(40).getTime());
  const tagsOnly = await saveCallBackCore(U, "wb1", id, input({ tags: ["acme"], remind: { at: min(30).toISOString(), action: "PHONE" } }), later, db);
  check("core: an edit that keeps the reminder's time keeps remindSentAt (no second push)", tagsOnly.ok && db.rows[0].remindSentAt?.getTime() === min(31).getTime());
  const moved = await saveCallBackCore(U, "wb1", id, input({ tags: ["acme"], remind: { at: min(120).toISOString(), action: "IN_PERSON" } }), later, db);
  check("core: moving remindAt clears remindSentAt (it is armed again)", moved.ok && db.rows[0].remindSentAt === null && db.rows[0].remindAt?.getTime() === min(120).getTime() && db.rows[0].remindAction === "IN_PERSON");
  db.rows[0].remindSentAt = min(121);
  const cleared = await saveCallBackCore(U, "wb1", id, input({ tags: ["acme"], remind: null }), later, db);
  check("core: clearing the reminder clears all three columns", cleared.ok && db.rows[0].remindAt === null && db.rows[0].remindAction === null && db.rows[0].remindSentAt === null);

  // 'Done' and its Undo: the exact reminder back, sent stamp too (never fires twice).
  db.rows[0].remindAt = min(-10);
  db.rows[0].remindAction = "PHONE";
  db.rows[0].remindSentAt = min(-9);
  const done = await clearReminderCore(U, id, db);
  check("done: clears the reminder and answers what it was", done.ok && db.rows[0].remindAt === null && done.value.remindSentAt === min(-9).toISOString());
  const undo = done.ok ? await restoreReminderCore(U, id, done.value, db) : { ok: false };
  check("done's undo: the same time, action and sent stamp come back", undo.ok && db.rows[0].remindAt?.getTime() === min(-10).getTime() && db.rows[0].remindSentAt?.getTime() === min(-9).getTime());
  const twice = done.ok ? await restoreReminderCore(U, id, done.value, db) : { ok: true };
  check("done's undo: refused once the call back has a reminder again (never overwrites a newer one)", !twice.ok);

  eq(
    "state: none, set, due (waiting for the next run), sent",
    [reminderStateOf({ remindAt: null, remindSentAt: null }, NOW), reminderStateOf({ remindAt: min(5), remindSentAt: null }, NOW), reminderStateOf({ remindAt: min(-5), remindSentAt: null }, NOW), reminderStateOf({ remindAt: min(-5), remindSentAt: min(-4) }, NOW)],
    ["none", "set", "due", "sent"]
  );
  eq(
    "open (the bell's): its time has come, not archived, its task not done or archived",
    [
      reminderOpen({ remindAt: min(-1) }, NOW),
      reminderOpen({ remindAt: min(1) }, NOW),
      reminderOpen({ remindAt: min(-1), archived: true }, NOW),
      reminderOpen({ remindAt: min(-1), task: { done: true } }, NOW),
      reminderOpen({ remindAt: min(-1), task: { done: false, archived: true } }, NOW),
      reminderOpen({ remindAt: min(-1), task: { done: false } }, NOW),
    ],
    [true, false, false, false, false, true]
  );
}

// ── 3. The call-back task ─────────────────────────────────────────────────
async function task() {
  section("the call-back task");
  const p = callBackTaskParse("idea: goal: send the quote !", "2026-10-14");
  const shape = captureShapeOf(p, "2026-10-12");
  check("parse: a plain TASK whatever the words (never a goal or an idea draft)", p.mode === "TASK" && p.kind === "TASK" && shape.kind === "TASK" && p.title === "idea: goal: send the quote !");
  check("parse: planned on the reminder's day, never a Must, never in the Inbox, no study link, no goal link", shape.dueDay === "2026-10-14" && shape.dueKind === "PLANNED" && !shape.compulsory && !shape.inbox && p.autoMetric === null && p.parentHint === null);
  check("parse: no reminder → undated (Anytime)", captureShapeOf(callBackTaskParse("ring Sam", null), "2026-10-12").dueDay === null);

  const db = new MemDb();
  db.addBoard("wb1");
  db.addBoard("wb2");
  const remindAt = new Date("2026-10-14T00:30:00Z"); // 11:30 on Wed 14 Oct in Sydney
  const made = await saveCallBackCore(U, "wb1", null, input({ task: "  Send   the quote ", remind: { at: remindAt.toISOString(), action: "PHONE" }, key: "k-abc123" }), NOW, db);
  const t = db.tasks[0];
  check("create: the task is made on THAT work board (boardId wb1), with the reminder's day", made.ok && db.created.length === 1 && db.created[0].boardId === "wb1" && t?.boardId === "wb1" && t.dueDay === "2026-10-14", JSON.stringify(db.created));
  check("create: the title is cleaned, the call back links the task", t?.title === "Send the quote" && db.rows[0].taskId === t.id && made.ok && made.value.task?.title === "Send the quote" && made.value.task.done === false);
  check("create: keyed by the sheet's nonce (cb:<key>), so a retry finds the same task", db.created[0].key === "cb:k-abc123");
  const retry = await saveCallBackCore(U, "wb1", null, input({ task: "Send the quote", key: "k-abc123" }), NOW, db);
  check("retry: the same key adds no second task", retry.ok && db.tasks.length === 1 && db.rows[1].taskId === t.id);
  const none = await saveCallBackCore(U, "wb2", null, input({ task: "" }), NOW, db);
  check("empty by default: no task, nothing created", none.ok && none.value.task === null && db.created.length === 2);
  const noRemind = await saveCallBackCore(U, "wb2", null, input({ task: "ring Sam" }), NOW, db);
  check("create without a reminder: undated, on its own board (wb2)", noRemind.ok && db.tasks[1]?.dueDay === null && db.tasks[1]?.boardId === "wb2");

  const id = made.ok ? made.value.id : "";
  const moved = await saveCallBackCore(U, "wb1", id, input({ task: "Send the revised quote", remind: { at: new Date("2026-10-16T00:30:00Z").toISOString(), action: "PHONE" } }), NOW, db);
  check("edit: a new title renames the task; a moved reminder moves its day", moved.ok && db.renamed.at(-1)?.title === "Send the revised quote" && db.moved.at(-1)?.day === "2026-10-16" && t.title === "Send the revised quote");
  db.tasks[0].done = true;
  const movedDone = await saveCallBackCore(U, "wb1", id, input({ task: "Send the revised quote", remind: { at: new Date("2026-10-17T00:30:00Z").toISOString(), action: "PHONE" } }), NOW, db);
  check("edit: a done task is not moved", movedDone.ok && db.moved.length === 1);
  const cleared = await saveCallBackCore(U, "wb1", id, input({ task: "" }), NOW, db);
  check("edit: clearing the task lets it go; the task itself stays (never deleted or archived)", cleared.ok && db.rows[0].taskId === null && db.tasks[0] && !db.tasks[0].archived);

  const srv = code(read("src/lib/callbacks-server.ts"));
  const createBody = srv.slice(srv.indexOf("createTask: async"), srv.indexOf("renameTask: async"));
  check(
    "app: the task goes through the capture path (createTemplateCore) with the board's id and a plain parse",
    /createTemplateCore\(userId, callBackTaskParse\(input\.title, input\.dueDay\), \{/.test(createBody) && /boardId: input\.boardId,/.test(createBody) && /captureKey: input\.key,/.test(createBody)
  );
  check("app: createTemplateCore is called once in the module (never without the board)", (srv.match(/createTemplateCore\(/g) ?? []).length === 1);
  const tasksSrc = code(read("src/lib/tasks.ts"));
  check("the game never sees it: a boardId row links no goal and no study metric (insertCapture), and pays no sizing", /let parentId: string \| null = boardId \? null :/.test(tasksSrc) && /!boardId \? parsed\.autoMetric : null/.test(tasksSrc) && /if \(t\.boardId\) return "done";/.test(code(read("src/lib/life-sizing.ts"))));
}

// ── 4. Refusals and skips ─────────────────────────────────────────────────
async function refusals() {
  section("refusals and skips");
  const db = new MemDb();
  db.addBoard("wb1", { crmOn: true });
  db.addBoard("wbOff");
  db.addBoard("wbOld", { archived: true });
  db.addBoard("wbTheirs", { userId: "u2" });
  db.customersList.push(
    { id: "cu1", userId: U, boardId: "wb1", number: "A-12", name: "Acme Pty", archived: false },
    { id: "cu2", userId: U, boardId: "wb1", number: "OLD-1", name: "Gone Co", archived: true },
    { id: "cu3", userId: U, boardId: "wbOff", number: "B-7", name: "Other tab", archived: false }
  );
  eq("board: an archived tab refuses a call back", await saveCallBackCore(U, "wbOld", null, input(), NOW, db), { ok: false, error: WORK_BOARD_ARCHIVED });
  eq("board: another user's or an unknown tab is gone", [await saveCallBackCore(U, "wbTheirs", null, input(), NOW, db), await saveCallBackCore(U, "nope", null, input(), NOW, db)], [{ ok: false, error: WORK_BOARD_GONE }, { ok: false, error: WORK_BOARD_GONE }]);
  check("fields: a bad action or time is refused before any write", !(await saveCallBackCore(U, "wb1", null, input({ action: "EMAIL" }), NOW, db)).ok && !(await saveCallBackCore(U, "wb1", null, input({ at: "yesterday" }), NOW, db)).ok && db.rows.length === 0 && db.tasks.length === 0);

  const matched = await saveCallBackCore(U, "wb1", null, input({ customer: "a-12", task: "quote" }), NOW, db);
  check("customer: matched by ID ignoring case among this tab's open customers", matched.ok && matched.value.customer?.id === "cu1" && matched.value.customer.name === "Acme Pty");
  eq("customer: an unknown ID is refused with a line (and no task is made)", [await saveCallBackCore(U, "wb1", null, input({ customer: "ZZ-9", task: "x" }), NOW, db), db.tasks.length], [{ ok: false, error: customerUnknown("ZZ-9") }, 1]);
  check("customer: an archived customer, or another tab's, is unknown here", !(await saveCallBackCore(U, "wb1", null, input({ customer: "OLD-1" }), NOW, db)).ok && !(await saveCallBackCore(U, "wb1", null, input({ customer: "B-7" }), NOW, db)).ok);
  check("customer: a tab without its CRM refuses an ID", !(await saveCallBackCore(U, "wbOff", null, input({ customer: "B-7" }), NOW, db)).ok);

  // Archive and restore: an archived tab's call back cannot come back while the tab is archived.
  const id = matched.ok ? matched.value.id : "";
  check("archive: hides the call back (and is idempotent)", (await archiveCallBackCore(U, id, NOW, db)).ok && (await archiveCallBackCore(U, id, NOW, db)).ok && (await loadCallBacks(U, "wb1", { now: NOW }, db)).rows.length === 0);
  check("archive: an archived call back cannot be edited", !(await saveCallBackCore(U, "wb1", id, input(), NOW, db)).ok);
  check("restore: brings it back", (await restoreCallBackCore(U, id, db)).ok && (await loadCallBacks(U, "wb1", { now: NOW }, db)).rows.length === 1);
  await archiveCallBackCore(U, id, NOW, db);
  db.boards.get("wb1")!.archivedAt = new Date(0);
  eq("restore: refused while its tab is archived", await restoreCallBackCore(U, id, db), { ok: false, error: WORK_BOARD_ARCHIVED });

  // The claim SQL (captured from Prisma): archived tabs, customers, done and remind-off tasks never claimed.
  const client = prisma as unknown as { $queryRaw: unknown };
  const original = client.$queryRaw;
  const captured: { sql: string; values: unknown[] }[] = [];
  client.$queryRaw = async (q: { sql: string; values: unknown[] }) => {
    captured.push(q);
    return captured.length === 1
      ? []
      : [{ id: "ct1", userId: U, customerId: "cu1", title: "Send price list", dueAt: NOW, customerName: "Acme Pty", customerNumber: "A-12", boardId: "wb1" }];
  };
  let out: DueCustomerTask[] = [];
  try {
    await prismaReminderStore.claimDue(NOW, 50);
    out = (await prismaReminderStore.claimDueCustomerTasks?.(NOW, 7)) ?? [];
  } finally {
    client.$queryRaw = original;
  }
  const cb = (captured[0]?.sql ?? "").replace(/\s+/g, " ");
  check("claim SQL (call backs): an archived work tab's reminders are never claimed", /AND EXISTS \(SELECT 1 FROM "WorkBoard" wb WHERE wb\."id" = "CallBack"\."boardId" AND wb\."archivedAt" IS NULL\)/.test(cb), cb.slice(0, 300));
  const ct = (captured[1]?.sql ?? "").replace(/\s+/g, " ");
  const inner = ct.slice(ct.indexOf('WHERE "id" IN ('), ct.indexOf("FOR UPDATE SKIP LOCKED )") + 24);
  const outer = ct.slice(ct.indexOf("FOR UPDATE SKIP LOCKED )") + 24, ct.indexOf("RETURNING"));
  check("claim SQL (customer tasks): one UPDATE that sets remindSentAt and returns the rows it set", /UPDATE "CustomerTask" SET "remindSentAt" = \?, "updatedAt" = \?/.test(ct) && /RETURNING "id", "userId", "customerId", "title", "dueAt"/.test(ct), ct.slice(0, 200));
  check(
    "claim SQL (customer tasks): remind on, due, unsent, not done, not archived, oldest first, LIMIT, FOR UPDATE SKIP LOCKED",
    /"remind" = true AND "dueAt" <= \? AND "remindSentAt" IS NULL AND "doneAt" IS NULL AND "archivedAt" IS NULL/.test(inner) && /ORDER BY "dueAt" ASC, "id" ASC LIMIT \?::int FOR UPDATE SKIP LOCKED/.test(inner),
    inner
  );
  check("claim SQL (customer tasks): never an archived customer, a task on an archived tab, or a tab whose list is off", /EXISTS \( SELECT 1 FROM "Customer" cu JOIN "WorkBoard" wb ON wb\."id" = cu\."boardId" WHERE cu\."id" = "CustomerTask"\."customerId" AND cu\."archivedAt" IS NULL AND wb\."archivedAt" IS NULL AND wb\."crmOn" = true \)/.test(inner), inner);
  check("claim SQL (customer tasks): the locked row is tested again (an overlapping run's row is never set twice)", /"remind" = true AND "remindSentAt" IS NULL AND "doneAt" IS NULL AND "archivedAt" IS NULL/.test(outer), outer);
  check("claim SQL (customer tasks): now and the cap are parameters (now, now, now, 7); the customer joins in", captured[1]?.values.length === 4 && captured[1].values.slice(0, 3).every((v) => v instanceof Date && v.getTime() === NOW.getTime()) && captured[1].values[3] === 7 && /JOIN "Customer" cu ON cu\."id" = c\."customerId"/.test(ct) && out[0]?.customerName === "Acme Pty" && out[0].dueAt instanceof Date);

  const srv = code(read("src/lib/callbacks-server.ts"));
  const bell = srv.slice(srv.indexOf("export async function loadWorkReminderRows"));
  check("bell read: open call backs on open tabs whose task is not done or archived", /archivedAt: null,\s*remindAt: \{ lte: now \},\s*board: \{ archivedAt: null \},\s*OR: \[\{ taskId: null \}, \{ task: \{ is: \{ completedAt: null, archivedAt: null \} \} \}\]/.test(bell));
  check("bell read: customer tasks with a reminder, due, not done or archived, of an open customer on an open tab whose list is on", /remind: true,\s*doneAt: null,\s*archivedAt: null,\s*dueAt: \{ lte: now \},\s*customer: \{ is: \{ archivedAt: null, board: \{ is: \{ archivedAt: null, crmOn: true \} \} \} \}/.test(bell));
}

// ── 5. The dispatcher's customer tasks ────────────────────────────────────
const OWN_SECRET = "s3cret-reminder-dispatch-0123456789";
const VAPID = { VAPID_PUBLIC_KEY: "BPublicKey_-123", VAPID_PRIVATE_KEY: "privateKey_-456", VAPID_SUBJECT: "mailto:me@example.com" };
const ENV: ReminderEnv = { ...VAPID, REMINDER_DISPATCH_SECRET: OWN_SECRET };
const authed = () => new Request("https://xtnl.example/api/reminders/dispatch", { headers: { [REMINDER_SECRET_HEADER]: OWN_SECRET } });

interface CbRow extends DueReminder {
  sentAt: Date | null;
}
interface CtRow extends DueCustomerTask {
  remind: boolean;
  doneAt: Date | null;
  archivedAt: Date | null;
  sentAt: Date | null;
  customerArchived: boolean;
  boardArchived: boolean;
}

function cbRow(id: string, minutes: number): CbRow {
  return { id, userId: U, boardId: "wb1", action: "PHONE", remindAction: null, tags: ["acme"], remindAt: min(minutes), taskTitle: null, sentAt: null };
}
function ctRow(id: string, minutes: number, over: Partial<CtRow> = {}): CtRow {
  return { id, userId: U, boardId: "wb1", customerId: "cu1", title: "Send price list", customerName: "Acme Pty", customerNumber: "A-12", dueAt: min(minutes), remind: true, doneAt: null, archivedAt: null, sentAt: null, customerArchived: false, boardArchived: false, ...over };
}

/** Both claims' contract over arrays. `guarded: false` drops the second test (the bug the real UPDATE prevents). */
function fakeStore(cbs: CbRow[], cts: CtRow[], log: string[], opts: { guarded?: boolean; failTasks?: boolean } = {}): ReminderStore {
  const guarded = opts.guarded ?? true;
  return {
    async claimDue(now, limit) {
      const due = cbs.filter((r) => r.remindAt <= now && !r.sentAt).sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime() || a.id.localeCompare(b.id)).slice(0, limit);
      await tick();
      const won = due.filter((r) => !(guarded && r.sentAt));
      for (const r of won) r.sentAt = now;
      log.push(`cb:${won.map((r) => r.id).join(",")}`);
      return won;
    },
    async claimDueCustomerTasks(now, limit) {
      if (opts.failTasks) throw new Error("db down");
      const due = cts
        .filter((t) => t.remind && t.dueAt <= now && !t.sentAt && !t.doneAt && !t.archivedAt && !t.customerArchived && !t.boardArchived)
        .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.id.localeCompare(b.id))
        .slice(0, limit);
      await tick();
      const won = due.filter((t) => !(guarded && t.sentAt));
      for (const t of won) t.sentAt = now;
      log.push(`ct:${won.map((t) => t.id).join(",")}`);
      return won;
    },
  };
}

function fakePush(): PushStore {
  return {
    listFor: async (userId) => (userId === U ? [{ id: "s1", endpoint: "https://fcm.googleapis.com/fcm/send/s1", p256dh: "p", auth: "a" }] : []),
    remove: async () => undefined,
    markUsed: async () => undefined,
    markFailed: async () => undefined,
    save: async () => undefined,
    removeEndpoint: async () => 0,
  };
}

function recorder(onSend?: () => Promise<void>) {
  const sent: { tag: string; payload: { title: string; body: string; tag: string; url: string } }[] = [];
  const sender: PushSender = async (_s, payload) => {
    const p = JSON.parse(payload);
    sent.push({ tag: p.tag, payload: p });
    if (onSend) await onSend();
    return { statusCode: 201 };
  };
  return { sender, sent };
}

async function dispatch() {
  section("customer task reminders");
  {
    const log: string[] = [];
    const cts = [
      ctRow("due1", -5),
      ctRow("due2", 0),
      ctRow("future", 1),
      ctRow("done", -5, { doneAt: min(-1) }),
      ctRow("archived", -5, { archivedAt: min(-1) }),
      ctRow("off", -5, { remind: false }),
      ctRow("sent", -5, { sentAt: min(-4) }),
      ctRow("oldcust", -5, { customerArchived: true }),
      ctRow("oldtab", -5, { boardArchived: true }),
    ];
    const { sender, sent } = recorder();
    const run = async () => (await (await runReminderDispatch(authed(), { env: ENV, store: fakeStore([], cts, log), push: fakePush(), sender, now: () => NOW, timeZone: TZ })).json()) as DispatchReport;
    const r = await run();
    check("skips: only due tasks (remind on, dueAt <= now, unsent, not done or archived, customer and tab open)", r.customerTasks === 2 && sent.map((s) => s.tag).join() === "customer-task-due1,customer-task-due2", JSON.stringify(r));
    check("words: title 'Customer task'; body '<task title> · <customer name> (#<number>) · <time>'", sent[0]?.payload.title === "Customer task" && sent[0].payload.body === "Send price list · Acme Pty (#A-12) · 14:55", sent[0]?.payload.body);
    check("url: the customer's page with the task asked for", sent[0]?.payload.url === "/today/work/wb1/customers/cu1?task=due1" && customerTaskUrl("w b", "c&1", "t?1") === "/today/work/w%20b/customers/c%261?task=t%3F1");
    check("url: the bell's link and the push's are the same", customerTaskHref("wb1", "cu1", "due1") === customerTaskUrl("wb1", "cu1", "due1"));
    const again = await run();
    check("at most once: a second run claims and sends nothing", again.claimed === 0 && sent.length === 2);
    check("words: another day carries its date", customerTaskPayload(ctRow("x", -24 * 60), NOW, TZ).body.endsWith("· 11 Oct 15:00"));
  }
  {
    // One cap for the run: call backs first, customer tasks take what is left.
    const log: string[] = [];
    const cbs = Array.from({ length: 30 }, (_, i) => cbRow(`c${String(i).padStart(2, "0")}`, -100 + i));
    const cts = Array.from({ length: 40 }, (_, i) => ctRow(`t${String(i).padStart(2, "0")}`, -200 + i));
    const { sender, sent } = recorder();
    const store = fakeStore(cbs, cts, log);
    const run = async () => (await (await runReminderDispatch(authed(), { env: ENV, store, push: fakePush(), sender, now: () => NOW, timeZone: TZ })).json()) as DispatchReport;
    const [a, b, c] = [await run(), await run(), await run()];
    check(`cap: one ${REMINDER_BATCH} a run for both (30 call backs + 20 tasks, then 20 tasks, then none)`, a.callBacks === 30 && a.customerTasks === 20 && a.claimed === 50 && b.callBacks === 0 && b.customerTasks === 20 && c.claimed === 0, [a, b, c].map((x) => `${x.callBacks}+${x.customerTasks}`).join(" "));
    check("cap: `more` while a run took its cap", a.more && !b.more && !c.more);
    check("cap: the oldest tasks first", log[1] === `ct:${cts.slice(0, 20).map((t) => t.id).join(",")}`);
    const tags = sent.map((s) => s.tag);
    check("cap: every reminder sent exactly once over the runs", tags.length === 70 && new Set(tags).size === 70);
  }
  const overlap = async (guarded: boolean) => {
    const log: string[] = [];
    const cbs = Array.from({ length: 3 }, (_, i) => cbRow(`oc${i}`, -i - 1));
    const cts = Array.from({ length: 4 }, (_, i) => ctRow(`ot${i}`, -i - 1));
    const store = fakeStore(cbs, cts, log, { guarded });
    let nested: Promise<unknown> | null = null;
    const deps = { env: ENV, store, push: fakePush(), now: () => NOW, timeZone: TZ };
    const { sender, sent } = recorder(async () => {
      await tick();
      if (!nested) nested = runReminderDispatch(authed(), { ...deps, sender });
    });
    await Promise.all([runReminderDispatch(authed(), { ...deps, sender }), runReminderDispatch(authed(), { ...deps, sender })]);
    if (nested) await nested;
    const counts = new Map<string, number>();
    for (const s of sent) counts.set(s.tag, (counts.get(s.tag) ?? 0) + 1);
    return counts;
  };
  {
    const counts = await overlap(true);
    check("overlap: two concurrent runs (and a third started mid-send) send each call back and task exactly once", counts.size === 7 && [...counts.values()].every((n) => n === 1), JSON.stringify([...counts]));
    const naive = await overlap(false);
    check("overlap: the test can fail: an unguarded claim double-sends", [...naive.values()].some((n) => n > 1), JSON.stringify([...naive]));
  }
  {
    const log: string[] = [];
    const { sender, sent } = recorder();
    const res = await runReminderDispatch(authed(), { env: ENV, store: fakeStore([cbRow("c1", -1)], [ctRow("t1", -1)], log, { failTasks: true }), push: fakePush(), sender, now: () => NOW, timeZone: TZ });
    const r = (await res.json()) as DispatchReport;
    check("a failed customer task claim still sends the call backs already claimed (and says so)", res.status === 200 && r.callBacks === 1 && r.customerTasks === 0 && r.customerTaskError === true && sent.map((s) => s.tag).join() === "callback-c1", JSON.stringify(r));
    const older: ReminderStore = { claimDue: async () => [] };
    const r2 = (await (await runReminderDispatch(authed(), { env: ENV, store: older, push: fakePush(), sender, now: () => NOW })).json()) as DispatchReport;
    check("a store without the customer task claim claims none (older fakes still work)", r2.claimed === 0 && r2.customerTasks === 0);
  }
}

// ── 6. ?callback=<id> ─────────────────────────────────────────────────────
async function highlight() {
  section("?callback highlight");
  check("tap URL: /today?board=…&callback=… (the push); the bell links the work tab directly", callBackUrl("wb1", "cb1") === "/today?board=wb1&callback=cb1" && callBackHref("wb1", "cb1") === "/today/work/wb1?callback=cb1" && CALLBACK_PARAM === "callback");
  const today = code(read("src/app/today/page.tsx"));
  check("/today?board= redirects to the work tab keeping callback", /redirect\(`\$\{workBoardHref\(boardParam\)\}\$\{q \? `\?\$\{q\}` : ""\}`\)/.test(today) && /if \(k !== "board" && typeof v === "string"\) rest\.set\(k, v\)/.test(today));
  const page = code(read("src/app/today/work/[boardId]/page.tsx"));
  check("page: reads ?callback (searchParams, a Promise in Next 16) and hands it to the loader", /searchParams: Promise</.test(page) && /await searchParams/.test(page) && /loadCallBacks\(userId, boardId, \{ focus: query\[CALLBACK_PARAM\], now \}\)/.test(page));
  check("page: the call backs reach TodayBoard (customers only on a CRM tab)", /callBacks=\{callBacks\}/.test(page) && /withCrm\(callBacksRead, board\.crmOn\)/.test(page));
  eq("focus id: an id-shaped value only", [focusIdOf("cb_1-x"), focusIdOf(["cb2"]), focusIdOf("../x"), focusIdOf(undefined), focusIdOf("x".repeat(65))], ["cb_1-x", "cb2", null, null, null]);

  const db = new MemDb();
  db.addBoard("wb1", { crmOn: true });
  db.addBoard("wb2");
  db.customersList.push({ id: "cu1", userId: U, boardId: "wb1", number: "A-12", name: "Acme Pty", archived: false });
  for (let i = 0; i < CALLBACK_LOAD_MAX + 3; i++) await saveCallBackCore(U, "wb1", null, input({ at: min(-i).toISOString(), tags: [`t${i % 5}`] }), NOW, db);
  const oldest = db.rows[db.rows.length - 1].id;
  const other = await saveCallBackCore(U, "wb2", null, input(), NOW, db);
  const page1 = await loadCallBacks(U, "wb1", { now: NOW }, db);
  check(`load: the newest ${CALLBACK_LOAD_MAX}, newest first, 'older' when more exist`, page1.rows.length === CALLBACK_LOAD_MAX && page1.older && page1.rows[0].at === NOW.toISOString() && page1.focus === null && !page1.focusMissing);
  const withOld = await loadCallBacks(U, "wb1", { now: NOW, focus: oldest }, db);
  check("load: a ?callback older than the newest page is read and added, and is the focus", withOld.focus === oldest && withOld.rows.at(-1)?.id === oldest && withOld.rows.length === CALLBACK_LOAD_MAX + 1);
  const foreign = await loadCallBacks(U, "wb1", { now: NOW, focus: other.ok ? other.value.id : "x" }, db);
  check("load: another tab's call back is no focus here (said, not shown)", foreign.focus === null && foreign.focusMissing && foreign.rows.length === CALLBACK_LOAD_MAX);
  check("load: the customer list only where the CRM is on", withCrm(page1, true).customers.length === 1 && withCrm(page1, false).customers.length === 0 && withCrm(page1, false).crmOn === false);

  const src = code(read("src/components/work/callbacks/CallBacksSection.tsx"));
  check("section: reads ?callback from the address (same-route taps too)", /const wanted = focusIdOf\(searchParams\.get\(CALLBACK_PARAM\)\);/.test(src));
  check("section: shows the card past 'Show more', highlights it, then drops the parameter (replaceState)", /setShown\(\(n\) => Math\.max\(n, at \+ 1\)\);/.test(src) && /setHighlight\(target\);/.test(src) && /params\.delete\(CALLBACK_PARAM\);/.test(src) && /window\.history\.replaceState\(null, ""/.test(src));
  check("section: scrolls to the card (motion-aware), focuses it, and lets the highlight fade", /el\.scrollIntoView\(\{ block: "center", behavior: motionLevel\(\) === "still" \? "auto" : "smooth" \}\);/.test(src) && /el\.focus\(\{ preventScroll: true \}\);/.test(src) && /setTimeout\(\(\) => setHighlight\(null\), HIGHLIGHT_MS\)/.test(src));
  check("section: each card is its anchor (id cb-<id>, focusable) with data-highlight", /id=\{callBackAnchorId\(row\.id\)\}/.test(src) && /tabIndex=\{-1\}/.test(src) && /data-highlight=\{highlighted \? "1" : undefined\}/.test(src) && callBackAnchorId("x") === "cb-x");
  check("css: the highlight is drawn ([data-highlight=\"1\"]), colour and shadow only", /\.cb-card\[data-highlight="1"\] \{ background: var\(--raised\); box-shadow:/.test(read("src/components/work/callbacks/callbacks.css")));

  // Render the section with a stubbed router: the anchors, the words, a missing id said in a line.
  const params = { value: new URLSearchParams() };
  const M = Module as unknown as { _load: (req: string, parent: unknown, isMain: boolean) => unknown; _extensions: Record<string, (m: { exports: unknown }) => void> };
  const load = M._load;
  M._extensions[".css"] = (m) => {
    m.exports = {};
  };
  M._load = function (req: string, parent: unknown, isMain: boolean) {
    if (req === "next/navigation") return { useRouter: () => ({ refresh() {}, push() {}, replace() {} }), useSearchParams: () => params.value, usePathname: () => "/today/work/wb1" };
    return load.call(this, req, parent, isMain);
  };
  try {
    const { CallBacksSection } = await import("../src/components/work/callbacks/CallBacksSection");
    const data = withCrm(await loadCallBacks(U, "wb1", { now: NOW }, db), true);
    data.rows[0] = { ...data.rows[0], tags: ["acme", "pricing"], task: { id: "t1", title: "Send the quote", done: true }, customer: { id: "cu1", number: "A-12", name: "Acme Pty" }, remindAt: min(-30).toISOString(), remindAction: "IN_PERSON", remindSentAt: min(-29).toISOString() };
    const html = renderToStaticMarkup(createElement(CallBacksSection, { data }));
    check("render: the heading, the Add button, and the first 8 cards with their anchors", /Call backs/.test(html) && /Add a call back/.test(html) && (html.match(/class="cb-card"/g) ?? []).length === 8 && html.includes(`id="${callBackAnchorId(data.rows[0].id)}"`));
    check("render: date-time, action word, tag chips, customer, task with its done state, reminder with 'sent'", html.includes("Today · 15:00") && html.includes(ACTION_WORDS.PHONE) && /<span class="chip">acme<\/span>/.test(html) && html.includes("Acme Pty") && html.includes("#A-12") && /data-done="1"/.test(html) && html.includes("Send the quote") && /Today · 14:30 · In person/.test(html) && />sent</.test(html));
    check("render: 'Show more' past the first page; older ones said", /Show 8 more/.test(html));
    check("render: a done task's reminder offers no Done (it is not open)", !/>Done</.test(html));
    params.value = new URLSearchParams("callback=nope");
    const missing = renderToStaticMarkup(createElement(CallBacksSection, { data }));
    check("render: a ?callback that is not on this tab is said in a line", /no longer on this tab/.test(missing));
    params.value = new URLSearchParams();
    const open = { ...data, rows: [{ ...data.rows[0], task: null, remindSentAt: null }] };
    const openHtml = renderToStaticMarkup(createElement(CallBacksSection, { data: open }));
    check("render: an open reminder is 'due' with a Done button (44 px .cb-act)", />due</.test(openHtml) && /class="cb-act"[^>]*>Done</.test(openHtml));
    const empty = renderToStaticMarkup(createElement(CallBacksSection, { data: { ...data, rows: [] } }));
    check("render: the empty state invites the first call back", /No call backs yet/.test(empty) && /none yet/.test(empty));
  } finally {
    M._load = load;
  }
}

// ── 7. Settings › Notifications ───────────────────────────────────────────
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
  check("no other module calls enablePush (push-client defines it; the section's tap calls it)", callers.join() === "src/components/settings/NotificationsSection.tsx", callers.join(", "));

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
  check("Settings: the section is in SettingsView", /<NotificationsSection \/>/.test(code(read("src/components/settings/SettingsView.tsx"))));
  const sheet = read("src/components/work/callbacks/CallBackSheet.tsx");
  check("the reminder field points to Settings › Notifications", /href="\/settings#notifications"/.test(sheet));
}

// ── 8. The bell and the capture sheet ─────────────────────────────────────
function bellAndCapture() {
  section("the bell and the capture sheet");
  const cb = (id: string, m: number) => ({ id, boardId: "wb1", boardName: "Acme", action: "PHONE", remindAction: "IN_PERSON", tags: ["acme", "pricing"], remindAt: min(m), taskTitle: "Send the quote" });
  const ct = (id: string, m: number) => ({ id, boardId: "wb1", customerId: "cu1", customerName: "Acme Pty", customerNumber: "A-12", title: "Price list", dueAt: min(m) });
  const notes = workReminderNotices({ callBacks: [cb("c1", -10)], customerTasks: [ct("t1", -20)] }, NOW, TZ);
  eq(
    "bell: oldest first; a call back links its card, a customer task its customer; warnings (counted)",
    notes.map((n) => [n.id, n.tone, n.title, n.detail, n.href, n.action]),
    [
      ["customer-task-t1", "warn", "Customer task", "Price list · Acme Pty (#A-12) · due 14:40", "/today/work/wb1/customers/cu1?task=t1", "Open"],
      ["callback-c1", "warn", "Call back · In person", "acme, pricing · Send the quote · Acme · due 14:50", "/today/work/wb1?callback=c1", "Open"],
    ]
  );
  const many = workReminderNotices({ callBacks: Array.from({ length: 5 }, (_, i) => cb(`c${i}`, -i)), customerTasks: Array.from({ length: 3 }, (_, i) => ct(`t${i}`, -10 - i)) }, NOW, TZ);
  check(`bell: at most ${BELL_WORK_MAX} one by one, then one 'N more' line`, many.length === BELL_WORK_MAX + 1 && many.at(-1)?.id === WORK_REMINDERS_MORE_ID && many.at(-1)?.title === "4 more work reminders");
  const feed = code(read("src/lib/notifications.ts"));
  check("bell: the feed reads them in its one wave and a failed read is no line (never a missing bell)", /loadWorkReminders\(userId, now\),\s*\]\);/.test(feed) && /return workReminderNotices\(await loadWorkReminderRows\(userId, now\), now\);\s*\} catch \{\s*return \[\];/.test(feed) && /notices\.push\(\.\.\.workReminders\);/.test(feed));
  check("bell: Today's own Asks never repeat them (they read named ids only)", /if \(n\.id !== "overdue" && n\.id !== "quota" && !penalty\) continue;/.test(code(read("src/components/today/board-ui.ts"))));

  const parsed = parseCapture("send quote", { today: "2026-10-12" });
  const ids = (work: boolean) => insertRowChips(parsed, "send quote", { work }).map((c) => c.id);
  check("capture: a work tab's grammar row has no Idea chip; the personal Board's keeps it", !ids(true).includes("idea") && ids(false).includes("idea") && ids(true).includes("inbox"));
  check("capture: the narrow row on a work tab has no Idea chip either", !insertRowChips(parsed, "send quote", { work: true, narrow: true }).some((c) => c.id === "idea"));
  check("capture: the example line is a work line on a work tab", captureExampleOf(true) === WORK_CAPTURE_EXAMPLE && captureExampleOf(false) === CAPTURE_EXAMPLE && WORK_CAPTURE_EXAMPLE === "send quote to Acme fri !" && !/gym/.test(WORK_CAPTURE_EXAMPLE) && !/idea|goal|weight|#/.test(WORK_LEGEND));
  const ex = parseCapture(WORK_CAPTURE_EXAMPLE, { today: "2026-10-12" });
  check("capture: the work example parses clean (a task, a Must by Friday, no warning)", ex.kind === "TASK" && ex.mode === "TASK" && ex.compulsory && ex.compulsoryWarning === null && ex.dueDay === "2026-10-16");
  const quick = code(read("src/components/capture/QuickCapture.tsx"));
  check("capture sheet: the placeholder follows the board (captureExampleOf)", /placeholder=\{pocket && empty \? POCKET_PLACEHOLDER : captureExampleOf\(workBoard !== null\)\}/.test(quick) && !/"gym legs 60m every mon,thu !"/.test(quick));
  check("capture sheet: no 'Idea (full form)' link on a work tab", /pathname !== "\/add" && workBoard === null \? \(\s*<Link href="\/add"/.test(quick));
  check("capture sheet: the grammar row is told it is on a work tab", /work=\{workBoard !== null\}/.test(quick) && /insertRowChips\(parsed, text, \{ narrow, work \}\)/.test(code(read("src/components/capture/InsertRow.tsx"))));
  const tb = code(read("src/components/today/TodayBoard.tsx"));
  check("work board: the empty state's example is the work line", /e\.g\. <span className="t-mono">\{captureExampleOf\(isWork\)\}<\/span>/.test(tb) && !/gym legs 60m/.test(tb));
}

// ── 9. Wiring ─────────────────────────────────────────────────────────────
function wiring() {
  section("wiring");
  const tb = code(read("src/components/today/TodayBoard.tsx"));
  check("TodayBoard: the section mounts in the call-backs slot, work tabs only", /\{isWork && <div className="work-callbacks" data-slot="call-backs" data-board=\{workTab\?\.id\}>\{callBacks && <CallBacksSection data=\{callBacks\} \/>\}<\/div>\}/.test(tb));
  check("TodayBoard: still three work={isWork} (the section takes no `work` prop)", (tb.match(/work=\{isWork\}/g) ?? []).length === 3);
  const actions = code(read("src/app/actions/callbacks.ts"));
  check("actions: every write refreshes on request and never throws", /"use server"/.test(read("src/app/actions/callbacks.ts")) && /if \(res\.ok && opts\?\.refresh === true\) refresh\(\);/.test(actions) && /catch \(err\)/.test(actions));
  const sectionSrc = read("src/components/work/callbacks/CallBacksSection.tsx") + read("src/components/work/callbacks/CallBackSheet.tsx");
  check("client: the section and sheet never import the server modules", !/callbacks-server|reminders-server|push-server|@\/lib\/prisma/.test(sectionSrc));

  const css = read("src/components/work/callbacks/callbacks.css");
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
  check("css: the layer order first, tokens only (no hex, rgb() or hsl())", css.startsWith("@layer theme, base, components, art, effects, utilities;") && !/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(body));
  const targets = [".cb-edit", ".cb-act", ".cb-tog", ".cb-sug", ".cb-tag-x", ".cb-input"];
  const small = targets.filter((sel) => {
    const rule = new RegExp(`\\${sel} \\{([^}]*)\\}`).exec(body);
    return !rule || !/min-height: 44px/.test(rule[1]);
  });
  check("css: every control is a 44 px target (Edit, Done, the toggles, suggestions, tag chips, fields)", small.length === 0, small.join(", "));
  check("css: transitions change colour and shadow only (no layout)", [...body.matchAll(/transition:([^;]*);/g)].every((m) => !/width|height|margin|padding|top|left|transform/.test(m[1])));

  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  const ui = pkg.scripts["ui:check"].split("&&").map((s) => s.trim());
  const at = ui.indexOf("tsx scripts/callbacks-check.ts");
  // word-model-check (2026-10-13) runs between this check and push-check.
  check(
    "package.json: ui:check runs this check before push-check (word-model-check between), still ending with roadmap-ui-check",
    at >= 0 && ui[at + 1] === "tsx scripts/word-model-check.ts" && ui[at + 2] === "tsx scripts/push-check.ts" && pkg.scripts["ui:check"].endsWith(" && tsx scripts/roadmap-ui-check.ts")
  );
  check("package.json: callbacks:check runs it alone", pkg.scripts["callbacks:check"] === "tsx scripts/callbacks-check.ts");

  check("datetime-local: read and written on the user's clock (15:00 Sydney ⇄ 04:00Z)", wallOfInstant(NOW, TZ) === "2026-10-12T15:00" && instantOfWall("2026-10-12T15:00", TZ)?.getTime() === NOW.getTime() && instantOfWall("2026-13-01T10:00", TZ) === null && instantOfWall("tomorrow", TZ) === null);
}

(async () => {
  const realError = console.error;
  const logged: string[] = [];
  console.error = (...a: unknown[]) => {
    logged.push(a.map((x) => (x instanceof Error ? x.message : String(x))).join(" "));
  };
  try {
    await tags();
    await reminder();
    await task();
    await refusals();
    await dispatch();
    await highlight();
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
