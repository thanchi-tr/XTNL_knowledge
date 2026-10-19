/**
 * Scheduled task reminders over web push (2026-10-12 for call backs; 2026-10-20 scheduled tasks, the one list;
 * docs/life-plan/reminders.md), with no database, no network and
 * no browser: fake stores, a fake sender, and public/sw.js run in a sandbox.
 *
 *   npx tsx scripts/push-check.ts        (npm run push:check; ui:check runs it too)
 *
 * Covers:
 *   - the dispatcher: refuses without the secret (and with a wrong or short one), accepts the reminder header and
 *     either Bearer form, refuses before claiming when the VAPID keys are missing; claims before it sends; skips
 *     archived, done, sent, reminder-off and future scheduled tasks; caps a run (oldest first, `more`); two overlapping runs never send one
 *     reminder twice (and the same interleaving against an unguarded claim does, so the test can fail); the real
 *     claim is one guarded UPDATE … RETURNING;
 *   - sending: 404/410 deletes the subscription, any other failure stamps failedAt, a delivery stamps lastUsedAt;
 *     sendToUser never throws; a run reuses each user's list and drops a deleted row before the next send;
 *   - the words: 'Send the quote · Call · Acme Pty · A-12 · 15:30', the tag and the task's agenda URL;
 *   - /api/push/subscribe: JSON from this site only, real push-service endpoints only, well-formed keys only;
 *   - /api/push/test (Settings › Notifications' "Send a test"): JSON from this site only, the current user's
 *     devices only, once a minute (429 with retryAfter);
 *   - public/sw.js: shows a notification for every push (bad or missing data too), focuses, moves or opens a
 *     window on a click (same-origin URLs only), saves a rotated subscription, and has no fetch handler or cache;
 *   - secrets: the browser's modules read only NEXT_PUBLIC_VAPID_PUBLIC_KEY; web-push and the server modules are
 *     never reachable from a client file; the env names are in .env.example with no values (where it exists:
 *     it is gitignored) and in the docs;
 *   - wiring: the two routes, package.json (dependency, push:check, ui:check), the docs.
 *   - the evening momentum nudge (momentum.md §F; lane D): inert before MOMENTUM_LAUNCH_DAY or with none (an explicit
 *     null launch day: nobody is even listed); launched 2026-10-12, so with nothing injected the launch day's 20:30 sends;
 *     only inside [20:00, 22:00) Sydney; only a run of 2+ with nothing kept today; UserPrefs.nudge 'off' respected (its
 *     facts are never read); the claim ('nudge:<day>', a NUDGE row) before the send; at most one nudge a day under
 *     concurrent runs (and the same interleaving against an unguarded claim double-sends, so the test can fail); the
 *     words; the reminders' claim, cap and counts unchanged beside it.
 */
import "./_no-model";
import { createECDH, randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { runInNewContext } from "node:vm";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import {
  TEST_PUSH_GAP_MS,
  TEST_PUSH_PAYLOAD,
  handleSubscribe,
  handleTestPush,
  handleUnsubscribe,
  parseSubscriptionInput,
  payloadJson,
  pushEndpointAllowed,
  safePath,
  sendToSubscriptions,
  sendToUser,
  vapidOf,
  type PushSender,
  type PushStore,
  type PushSubscriptionRow,
  type SubscriptionInput,
} from "../src/lib/push-server";
import {
  NUDGE_TOPIC,
  REMINDER_BATCH,
  REMINDER_SECRET_HEADER,
  dispatchAuthorized,
  nudgeClaimData,
  nudgeDue,
  nudgePayload,
  prismaNudgeStore,
  prismaReminderStore,
  reminderLine,
  reminderPayload,
  runMomentumNudges,
  runReminderDispatch,
  type DispatchReport,
  type DueReminder,
  type NudgeStore,
  type ReminderEnv,
  type ReminderStore,
} from "../src/lib/reminders-server";
import type { NudgeFacts } from "../src/lib/momentum-server";
import { MOMENTUM_LAUNCH_DAY } from "../src/lib/momentum";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`);
  }
}
const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const tick = () => new Promise<void>((r) => setImmediate(r));

// ── Fixtures ──────────────────────────────────────────────────────────────

const OWN_SECRET = "s3cret-reminder-dispatch-0123456789";
const CRON = "cron-secret-abcdef";
const VAPID = { VAPID_PUBLIC_KEY: "BPublicKey_-123", VAPID_PRIVATE_KEY: "privateKey_-456", VAPID_SUBJECT: "mailto:me@example.com" };
const ENV: ReminderEnv = { ...VAPID, REMINDER_DISPATCH_SECRET: OWN_SECRET, CRON_SECRET: CRON };
const NOW = new Date("2026-10-12T04:00:00Z"); // 15:00 in Sydney (AEDT)
const TZ = "Australia/Sydney";
const ORIGIN = "https://xtnl.example";

/** A scheduled task as the dispatcher sees it (ScheduledTask, 2026-10-20), with the columns the claim tests. */
interface Row extends DueReminder {
  remind: boolean;
  remindSentAt: Date | null;
  doneAt: Date | null;
  archivedAt: Date | null;
}

/** A task due `minutesFromNow` from now; null: its reminder is off. */
function row(id: string, minutesFromNow: number | null, extra: Partial<Row> = {}): Row {
  return {
    id,
    userId: "u1",
    boardId: "b1",
    title: "Send the quote",
    channel: "CALL",
    dueAt: new Date(NOW.getTime() + (minutesFromNow ?? -1) * 60_000),
    allDay: false,
    customerName: "Acme Pty",
    customerNumber: "A-12",
    remind: minutesFromNow != null,
    remindSentAt: null,
    doneAt: null,
    archivedAt: null,
    ...extra,
  };
}

/** The claim's contract over an array. `guarded: false` drops the second null test (the bug the real UPDATE prevents). */
function fakeReminderStore(rows: Row[], log: string[], opts: { guarded?: boolean } = {}): ReminderStore & { calls: number } {
  const guarded = opts.guarded ?? true;
  const store = {
    calls: 0,
    async claimDue(now: Date, limit: number): Promise<DueReminder[]> {
      store.calls++;
      const due = rows
        .filter((r) => r.remind && r.dueAt <= now && r.remindSentAt == null && r.doneAt == null && r.archivedAt == null)
        .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.id.localeCompare(b.id))
        .slice(0, limit);
      await tick(); // another run may select the same rows here
      const won: Row[] = [];
      for (const r of due) {
        if (guarded && r.remindSentAt != null) continue;
        r.remindSentAt = now;
        won.push(r);
      }
      log.push(`claim:${won.map((r) => r.id).join(",")}`);
      return won.map(({ id, userId, boardId, title, channel, dueAt, allDay, customerName, customerNumber }) => ({ id, userId, boardId, title, channel, dueAt, allDay, customerName, customerNumber }));
    },
  };
  return store;
}

interface FakePush extends PushStore {
  subs: (PushSubscriptionRow & { userId: string; lastUsedAt?: Date | null; failedAt?: Date | null })[];
  removed: string[];
  used: string[];
  failedIds: string[];
  saved: { userId: string; sub: SubscriptionInput; ua: string | null }[];
  lists: number;
}

function fakePushStore(subs: FakePush["subs"] = []): FakePush {
  const s: FakePush = {
    subs,
    removed: [],
    used: [],
    failedIds: [],
    saved: [],
    lists: 0,
    async listFor(userId) {
      s.lists++;
      return s.subs.filter((x) => x.userId === userId).map(({ id, endpoint, p256dh, auth }) => ({ id, endpoint, p256dh, auth }));
    },
    async remove(id) {
      s.removed.push(id);
      s.subs = s.subs.filter((x) => x.id !== id);
    },
    async markUsed(id, at) {
      s.used.push(id);
      const x = s.subs.find((y) => y.id === id);
      if (x) {
        x.lastUsedAt = at;
        x.failedAt = null;
      }
    },
    async markFailed(id, at) {
      s.failedIds.push(id);
      const x = s.subs.find((y) => y.id === id);
      if (x) x.failedAt = at;
    },
    async save(userId, sub, ua) {
      s.saved.push({ userId, sub, ua });
    },
    async removeEndpoint(userId, endpoint) {
      const before = s.subs.length;
      s.subs = s.subs.filter((x) => !(x.userId === userId && x.endpoint === endpoint));
      return before - s.subs.length;
    },
  };
  return s;
}

const sub = (id: string, userId = "u1") => ({ id, userId, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: "p", auth: "a" });

/** Records every send; `fail` maps an endpoint suffix to the status (or thrown value) it answers. */
function fakeSender(log: string[], fail: Record<string, number | "throw-string" | "throw-null"> = {}, onSend?: (payload: string) => Promise<void>) {
  const sent: { endpoint: string; payload: string; options: Parameters<PushSender>[2] }[] = [];
  const sender: PushSender = async (s, payload, options) => {
    const tag = JSON.parse(payload).tag as string;
    log.push(`send:${tag}:${s.endpoint.split("/").pop()}`);
    sent.push({ endpoint: s.endpoint, payload, options });
    if (onSend) await onSend(payload);
    const f = fail[s.endpoint.split("/").pop() ?? ""];
    if (f === "throw-string") throw "boom";
    if (f === "throw-null") throw null;
    if (typeof f === "number") throw Object.assign(new Error(`Received unexpected response code`), { statusCode: f });
    return { statusCode: 201 };
  };
  return { sender, sent };
}

function request(headers: Record<string, string> = {}, method = "GET", body?: string): Request {
  return new Request(`${ORIGIN}/api/reminders/dispatch`, { method, headers, body });
}
const authed = () => request({ [REMINDER_SECRET_HEADER]: OWN_SECRET });
const reportOf = async (res: Response) => (await res.json()) as DispatchReport & { error?: string };

// ── 1. Who may run the dispatcher ─────────────────────────────────────────
async function auth() {
  const h = (o: Record<string, string>) => new Headers(o);
  check("auth: no secret set refuses everyone, even a matching-looking header", !dispatchAuthorized(h({ [REMINDER_SECRET_HEADER]: "" }), { ...VAPID }) && !dispatchAuthorized(h({ authorization: "Bearer " }), { ...VAPID }) && !dispatchAuthorized(h({ authorization: "Bearer undefined" }), { ...VAPID }));
  check("auth: no header refuses", !dispatchAuthorized(h({}), ENV));
  check("auth: a wrong secret refuses (header and Bearer)", !dispatchAuthorized(h({ [REMINDER_SECRET_HEADER]: OWN_SECRET + "x" }), ENV) && !dispatchAuthorized(h({ authorization: `Bearer ${OWN_SECRET.slice(0, -1)}` }), ENV));
  check("auth: the reminder header with REMINDER_DISPATCH_SECRET passes", dispatchAuthorized(h({ [REMINDER_SECRET_HEADER]: OWN_SECRET }), ENV));
  check("auth: 'Authorization: Bearer <REMINDER_DISPATCH_SECRET>' passes", dispatchAuthorized(h({ authorization: `Bearer ${OWN_SECRET}` }), ENV));
  check("auth: Vercel Cron's 'Authorization: Bearer <CRON_SECRET>' passes", dispatchAuthorized(h({ authorization: `Bearer ${CRON}` }), ENV) && dispatchAuthorized(h({ authorization: `Bearer ${CRON}` }), { CRON_SECRET: CRON }));
  check("auth: CRON_SECRET in the reminder header does not pass (that header carries only the reminder secret)", !dispatchAuthorized(h({ [REMINDER_SECRET_HEADER]: CRON }), { CRON_SECRET: CRON }));
  check("auth: a REMINDER_DISPATCH_SECRET under 16 characters counts as unset", !dispatchAuthorized(h({ [REMINDER_SECRET_HEADER]: "short" }), { REMINDER_DISPATCH_SECRET: "short" }));

  const log: string[] = [];
  const store = fakeReminderStore([row("c1", -1)], log);
  const push = fakePushStore([sub("s1")]);
  const { sender, sent } = fakeSender(log);
  const deps = { store, push, sender, now: () => NOW, timeZone: TZ };
  const noSecret = await runReminderDispatch(authed(), { ...deps, env: { ...VAPID } });
  const wrong = await runReminderDispatch(request({ [REMINDER_SECRET_HEADER]: "nope-nope-nope-nope" }), { ...deps, env: ENV });
  const none = await runReminderDispatch(request(), { ...deps, env: ENV });
  check("dispatch: refused requests answer 401 (no secret set, wrong secret, no header)", noSecret.status === 401 && wrong.status === 401 && none.status === 401, `${noSecret.status} ${wrong.status} ${none.status}`);
  check("dispatch: a refused request claims nothing and sends nothing", store.calls === 0 && sent.length === 0 && log.length === 0);
  const noVapid = await runReminderDispatch(authed(), { ...deps, env: { REMINDER_DISPATCH_SECRET: OWN_SECRET } });
  check("dispatch: missing VAPID keys answer 503 before any claim (no reminder is burnt)", noVapid.status === 503 && store.calls === 0 && sent.length === 0);
  check("vapid: all three are required, the subject is mailto: or https:", vapidOf(VAPID) != null && vapidOf({ ...VAPID, VAPID_SUBJECT: "me@example.com" }) == null && vapidOf({ ...VAPID, VAPID_PRIVATE_KEY: "" }) == null && vapidOf({ VAPID_PRIVATE_KEY: VAPID.VAPID_PRIVATE_KEY, VAPID_SUBJECT: "https://xtnl.example", NEXT_PUBLIC_VAPID_PUBLIC_KEY: VAPID.VAPID_PUBLIC_KEY })?.publicKey === VAPID.VAPID_PUBLIC_KEY);
  const ok = await runReminderDispatch(request({ authorization: `Bearer ${CRON}` }, "POST"), { ...deps, env: ENV });
  const okBody = await reportOf(ok);
  check("dispatch: POST with Vercel's Bearer runs and answers the counts", ok.status === 200 && okBody.claimed === 1 && okBody.delivered === 1 && ok.headers.get("cache-control") === "no-store", JSON.stringify(okBody));
  const claimFails = await runReminderDispatch(authed(), { ...deps, env: ENV, store: { claimDue: async () => { throw new Error("db down"); } } });
  check("dispatch: a failed claim answers 500 and sends nothing", claimFails.status === 500 && sent.length === 1);
}

// ── 2. Claim, skip, cap, overlap ──────────────────────────────────────────
async function dispatch() {
  // Claim before send, and the skips.
  {
    const log: string[] = [];
    const rows = [
      row("due1", -5),
      row("due2", 0),
      row("future", 1),
      row("archived", -10, { archivedAt: new Date(NOW.getTime() - 60_000) }),
      row("done", -10, { doneAt: new Date(NOW.getTime() - 60_000) }),
      row("sent", -20, { remindSentAt: new Date(NOW.getTime() - 19 * 60_000) }),
      row("noremind", null),
    ];
    const before = JSON.stringify(rows.filter((r) => !r.id.startsWith("due")));
    const store = fakeReminderStore(rows, log);
    const push = fakePushStore([sub("s1"), sub("s2")]);
    const { sender, sent } = fakeSender(log);
    const res = await runReminderDispatch(authed(), { env: ENV, store, push, sender, now: () => NOW, timeZone: TZ });
    const r = await reportOf(res);
    const claimAt = log.findIndex((l) => l.startsWith("claim:"));
    const firstSend = log.findIndex((l) => l.startsWith("send:"));
    check("dispatch: it claims before it sends (one claim, then the sends)", claimAt === 0 && firstSend > claimAt && log.filter((l) => l.startsWith("claim:")).length === 1, log.join(" | "));
    check("dispatch: sends only what it claimed", sent.every((s) => /scheduled-due[12]/.test(JSON.parse(s.payload).tag)), sent.map((s) => JSON.parse(s.payload).tag).join(","));
    check("dispatch: due (dueAt <= now, the boundary included, reminder on) are claimed and sent to every subscription", r.claimed === 2 && r.delivered === 2 && sent.length === 4 && rows.find((x) => x.id === "due2")!.remindSentAt?.getTime() === NOW.getTime(), JSON.stringify(r));
    check("dispatch: future, archived, done, already sent and reminder-off scheduled tasks are untouched", JSON.stringify(rows.filter((x) => !x.id.startsWith("due"))) === before);
    check("dispatch: oldest dueAt first", log[0] === "claim:due1,due2");
    check("dispatch: a delivery stamps lastUsedAt", push.used.length === 4 && push.subs.every((s) => s.lastUsedAt?.getTime() === NOW.getTime()));
    check("dispatch: each user's subscriptions are read once a run", push.lists === 1, String(push.lists));
    check("dispatch: the push carries the VAPID keys, a 12 h TTL, high urgency and the task as its topic", sent.every((s) => s.options.vapidDetails?.privateKey === VAPID.VAPID_PRIVATE_KEY && s.options.vapidDetails?.subject === VAPID.VAPID_SUBJECT && s.options.TTL === 43200 && s.options.urgency === "high" && /^due[12]$/.test(s.options.topic ?? "")));
    const again = await reportOf(await runReminderDispatch(authed(), { env: ENV, store, push, sender, now: () => NOW, timeZone: TZ }));
    check("dispatch: idempotent: a second run at the same minute claims and sends nothing", again.claimed === 0 && sent.length === 4 && again.more === false);
  }

  // The cap.
  {
    const log: string[] = [];
    const rows = Array.from({ length: 120 }, (_, i) => row(`c${String(i).padStart(3, "0")}`, -200 + i));
    const store = fakeReminderStore(rows, log);
    const push = fakePushStore([sub("s1")]);
    const { sender, sent } = fakeSender(log);
    const run = async () => reportOf(await runReminderDispatch(authed(), { env: ENV, store, push, sender, now: () => NOW, timeZone: TZ }));
    const [a, b, c, d] = [await run(), await run(), await run(), await run()];
    check(`cap: ${REMINDER_BATCH} a run, then the rest on the next runs (50, 50, 20, 0)`, a.claimed === 50 && b.claimed === 50 && c.claimed === 20 && d.claimed === 0, [a, b, c, d].map((x) => x.claimed).join(","));
    check("cap: `more` is true only when a run took its cap", a.more && b.more && !c.more && !d.more);
    check("cap: the first run took the 50 oldest", log[0] === `claim:${rows.slice(0, 50).map((r) => r.id).join(",")}`);
    const tags = sent.map((s) => JSON.parse(s.payload).tag as string);
    check("cap: every reminder sent exactly once over the runs", tags.length === 120 && new Set(tags).size === 120);
    const big = await reportOf(await runReminderDispatch(authed(), { env: ENV, store: fakeReminderStore(Array.from({ length: 80 }, (_, i) => row(`x${i}`, -1)), []), push, sender, now: () => NOW, limit: 500, timeZone: TZ }));
    check("cap: a larger limit is clamped to the cap", big.claimed === REMINDER_BATCH);
  }

  // Two overlapping runs: concurrent, and one started from inside the other's send.
  const overlap = async (guarded: boolean) => {
    const log: string[] = [];
    const rows = Array.from({ length: 6 }, (_, i) => row(`o${i}`, -i - 1));
    const store = fakeReminderStore(rows, log, { guarded });
    const push = fakePushStore([sub("s1")]);
    let nested: Promise<unknown> | null = null;
    const { sender, sent } = fakeSender(log, {}, async () => {
      await tick();
      if (!nested) nested = runReminderDispatch(authed(), { env: ENV, store, push, sender, now: () => NOW, timeZone: TZ });
    });
    const deps = { env: ENV, store, push, sender, now: () => NOW, timeZone: TZ };
    const [r1, r2] = await Promise.all([runReminderDispatch(authed(), deps).then(reportOf), runReminderDispatch(authed(), deps).then(reportOf)]);
    if (nested) await nested;
    const counts = new Map<string, number>();
    for (const s of sent) {
      const t = JSON.parse(s.payload).tag as string;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return { r1, r2, counts, rows };
  };
  {
    const { r1, r2, counts, rows } = await overlap(true);
    check("overlap: two concurrent runs (and a third started mid-send) send each reminder exactly once", counts.size === 6 && [...counts.values()].every((n) => n === 1), JSON.stringify([...counts]));
    check("overlap: the runs split the claim between them (no row claimed twice)", r1.claimed + r2.claimed === 6 && rows.every((r) => r.remindSentAt != null), `${r1.claimed}+${r2.claimed}`);
    const naive = await overlap(false);
    check("overlap: the test can fail: the same interleaving against an unguarded claim double-sends", [...naive.counts.values()].some((n) => n > 1), JSON.stringify([...naive.counts]));
  }

  // The real claim: one guarded statement, captured from Prisma (no database).
  {
    const client = prisma as unknown as { $queryRaw: unknown };
    const original = client.$queryRaw;
    let captured: { sql: string; values: unknown[] } | null = null;
    client.$queryRaw = async (q: { sql: string; values: unknown[] }) => {
      captured = q;
      return [{ id: "c1", userId: "u1", boardId: "b1", title: "Send the quote", channel: "CALL", dueAt: NOW, allDay: false, customerName: null, customerNumber: null }];
    };
    let out: DueReminder[] = [];
    try {
      out = await prismaReminderStore.claimDue(NOW, 50);
    } finally {
      client.$queryRaw = original;
    }
    const q = captured as { sql: string; values: unknown[] } | null;
    const sql = (q?.sql ?? "").replace(/\s+/g, " ");
    const update = sql.indexOf('UPDATE "ScheduledTask" SET "remindSentAt" = ?::timestamptz, "updatedAt" = ?::timestamptz');
    const inner = sql.slice(sql.indexOf('WHERE "id" IN ('), sql.indexOf("FOR UPDATE SKIP LOCKED )") + 24);
    const outer = sql.slice(sql.indexOf("FOR UPDATE SKIP LOCKED )") + 24, sql.indexOf("RETURNING"));
    check("claim SQL: one UPDATE of ScheduledTask that sets remindSentAt and returns the rows it set", update >= 0 && /RETURNING "id", "userId", "boardId", "customerId", "title", "channel", "dueAt", "allDay"/.test(sql), sql.slice(0, 200));
    check(
      "claim SQL: picks due rows only (remind on, dueAt <= now, remindSentAt, doneAt and archivedAt null, its work tab open, its customer if any kept), oldest first, LIMIT, FOR UPDATE SKIP LOCKED",
      /"remind" = true AND "dueAt" <= \?::timestamptz AND "remindSentAt" IS NULL AND "doneAt" IS NULL AND "archivedAt" IS NULL AND EXISTS \(SELECT 1 FROM "WorkBoard" wb WHERE wb\."id" = "ScheduledTask"\."boardId" AND wb\."archivedAt" IS NULL\) AND NOT EXISTS \(SELECT 1 FROM "Customer" cu WHERE cu\."id" = "ScheduledTask"\."customerId" AND cu\."archivedAt" IS NOT NULL\) ORDER BY "dueAt" ASC, "id" ASC LIMIT \?::int FOR UPDATE SKIP LOCKED/.test(inner),
      inner
    );
    check("claim SQL: re-tests the claim's conditions on the locked row (an overlapping run's row is never set twice)", /"remind" = true AND "remindSentAt" IS NULL AND "doneAt" IS NULL AND "archivedAt" IS NULL/.test(outer), outer);
    check("claim SQL: now (an ISO instant cast to timestamptz: no session zone assumed) and the cap are parameters (now, now, now, 50)", q != null && q.values.length === 4 && q.values.slice(0, 3).every((v) => v === NOW.toISOString()) && q.values[3] === 50, JSON.stringify(q?.values));
    check("claim SQL: the customer (name and ID) joins in the same statement; dueAt reads as a Date", /LEFT JOIN "Customer" cu ON cu\."id" = c\."customerId"/.test(sql) && out.length === 1 && out[0].dueAt instanceof Date && out[0].title === "Send the quote" && out[0].customerName === null);
  }
}

// ── 3. Sending and subscriptions ──────────────────────────────────────────
async function sending() {
  const payload = { title: "Send the quote", body: "Call · Acme Pty · A-12 · 15:30", tag: "scheduled-c1", url: "/today/work/b1?task=c1" };
  {
    const log: string[] = [];
    const push = fakePushStore([sub("gone410"), sub("gone404"), sub("err500"), sub("err403"), sub("ok"), sub("other", "u2")]);
    const { sender, sent } = fakeSender(log, { gone410: 410, gone404: 404, err500: 500, err403: 403 });
    const r = await sendToUser("u1", payload, { store: push, sender, env: VAPID, now: () => NOW });
    check("send: every subscription of that user only", sent.length === 5 && !sent.some((s) => s.endpoint.endsWith("/other")));
    check("send: 404 and 410 delete the subscription", r.removed === 2 && push.removed.sort().join(",") === "gone404,gone410" && !push.subs.some((s) => s.id.startsWith("gone")));
    check("send: any other failure stamps failedAt and keeps the row", r.failed === 2 && push.failedIds.sort().join(",") === "err403,err500" && push.subs.find((s) => s.id === "err500")?.failedAt?.getTime() === NOW.getTime());
    check("send: a delivery stamps lastUsedAt and clears failedAt", r.sent === 1 && push.used.join() === "ok" && push.subs.find((s) => s.id === "ok")?.failedAt === null);
    check("send: the report names the deleted rows", r.removedIds.sort().join(",") === "gone404,gone410" && r.subscriptions === 5 && r.skipped === null);
    const body = JSON.parse(sent[0].payload);
    check("send: the payload is the worker's JSON (title, body, tag, url)", body.title === payload.title && body.body === payload.body && body.tag === payload.tag && body.url === payload.url);
  }
  {
    const log: string[] = [];
    const { sender, sent } = fakeSender(log, { a: "throw-string", b: "throw-null" });
    const push = fakePushStore([sub("a"), sub("b")]);
    push.markFailed = async () => {
      throw new Error("db down");
    };
    let threw = false;
    let r1, r2, r3, r4;
    try {
      r1 = await sendToUser("u1", payload, { store: push, sender, env: VAPID });
      r2 = await sendToUser("u1", payload, { store: { ...push, listFor: async () => { throw new Error("db down"); } }, sender, env: VAPID });
      r3 = await sendToUser("u1", payload, { store: push, sender, env: {} });
      r4 = await sendToSubscriptions([sub("a")], payload, { store: push, sender: () => { throw new Error("sync throw"); }, env: VAPID });
    } catch {
      threw = true;
    }
    check("send: never throws (odd rejections, a failing store, a listing that fails, a sender that throws synchronously)", !threw);
    check("send: odd rejections count as failures", r1?.failed === 2 && r1.sent === 0);
    check("send: a listing that fails is 'store-error'", r2?.skipped === "store-error" && r2.sent === 0);
    check("send: no VAPID keys is 'no-vapid' and nothing is sent", r3?.skipped === "no-vapid" && sent.length === 2);
    check("send: a sender that throws synchronously is one failure", r4?.failed === 1);
    const empty = await sendToUser("nobody", payload, { store: fakePushStore([]), sender, env: VAPID });
    check("send: a user with no subscription is 'no-subscriptions'", empty.skipped === "no-subscriptions" && empty.subscriptions === 0);
  }
  {
    // A run reuses each user's list and drops a deleted row before the next send; no device is counted.
    const log: string[] = [];
    const rows = [row("r1", -3), row("r2", -2), row("r3", -1, { userId: "lonely" })];
    const push = fakePushStore([sub("dead"), sub("live")]);
    const { sender, sent } = fakeSender(log, { dead: 410 });
    const r = await reportOf(await runReminderDispatch(authed(), { env: ENV, store: fakeReminderStore(rows, log), push, sender, now: () => NOW, timeZone: TZ }));
    check("run: a subscription deleted on one send is not tried again in the same run", sent.filter((s) => s.endpoint.endsWith("/dead")).length === 1 && sent.filter((s) => s.endpoint.endsWith("/live")).length === 2);
    check("run: a user with no subscription counts as noDevice (and is still claimed: at most once)", r.noDevice === 1 && rows[2].remindSentAt != null && r.claimed === 3 && r.delivered === 2, JSON.stringify(r));
    check("run: per-push counts add up", r.pushes.sent === 2 && r.pushes.removed === 1 && r.pushes.failed === 0);
    const allFail = await reportOf(await runReminderDispatch(authed(), { env: ENV, store: fakeReminderStore([row("f1", -1)], []), push: fakePushStore([sub("x")]), sender: fakeSender([], { x: 500 }).sender, now: () => NOW, timeZone: TZ }));
    check("run: a reminder every device refused is undelivered (and not retried)", allFail.undelivered === 1 && allFail.delivered === 0 && allFail.pushes.failed === 1);
  }
  {
    const long = payloadJson({ title: "t".repeat(500), body: "b".repeat(5000), tag: "g".repeat(100), url: "/x" });
    check("payload: clipped far under the 4 KB a push may carry", long.length < 1000 && JSON.parse(long).body.length === 400);
    check("payload: only same-origin paths survive", safePath("https://evil.example/x") === "/today" && safePath("//evil.example") === "/today" && safePath("/\\evil") === "/today" && safePath("/\t/evil.example") === "/today" && safePath("/\n/evil.example") === "/today" && safePath(undefined) === "/today" && safePath("/today?board=b") === "/today?board=b");
  }
}

// ── 4. The words ──────────────────────────────────────────────────────────
function words() {
  const base = row("c1", 30);
  const p = reminderPayload(base, NOW, TZ);
  check("words: the title is the task's", p.title === "Send the quote", p.title);
  check("words: body '<channel> · <customer name> · <their ID> · <time in the user's zone>'", p.body === "Call · Acme Pty · A-12 · 15:30", p.body);
  check("words: the one line reads 'Send the quote · Call · Acme Pty · A-12 · 15:30'", reminderLine(p) === "Send the quote · Call · Acme Pty · A-12 · 15:30", reminderLine(p));
  check("words: one tag per task, and its agenda URL with the task highlighted", p.tag === "scheduled-c1" && p.url === "/today/work/b1?task=c1" && reminderPayload({ ...base, boardId: "b 1", id: "c&1" }, NOW, TZ).url === "/today/work/b%201?task=c%261");
  check("words: the channel's word (Visit); an unknown one reads as Other", reminderPayload({ ...base, channel: "VISIT" }, NOW, TZ).body.startsWith("Visit · ") && reminderPayload({ ...base, channel: "VIDEO_CALL" }, NOW, TZ).body.startsWith("Other · "));
  check("words: another day carries its date ('11 Oct 15:30')", reminderPayload(row("c2", -24 * 60 + 30), NOW, TZ).body.endsWith("· 11 Oct 15:30"), reminderPayload(row("c2", -24 * 60 + 30), NOW, TZ).body);
  check("words: no customer leaves the channel and the time", reminderPayload(row("c3", 0, { customerName: null, customerNumber: null }), NOW, TZ).body === "Call · 15:00");
  check("words: an all-day task says today", reminderPayload(row("c4", 0, { allDay: true, customerName: null, customerNumber: null }), NOW, TZ).body === "Call · today");
}

// ── 5. /api/push/subscribe ────────────────────────────────────────────────
async function subscribeApi() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const p256dh = ecdh.getPublicKey().toString("base64url");
  const auth = randomBytes(16).toString("base64url");
  const endpoint = "https://fcm.googleapis.com/fcm/send/abc:def";
  const good = { endpoint, expirationTime: null, keys: { p256dh, auth } };
  const req = (body: unknown, headers: Record<string, string> = {}, method = "POST") =>
    new Request(`${ORIGIN}/api/push/subscribe`, { method, headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "user-agent": "Mozilla/5.0 test", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

  check("endpoint: the real push services pass", ["https://fcm.googleapis.com/fcm/send/x", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://wns2-sg2p.notify.windows.com/w/?token=x", "https://web.push.apple.com/QK", "https://android.googleapis.com/gcm/send/x"].every(pushEndpointAllowed));
  check("endpoint: anything else is refused (http, look-alike hosts, ports, credentials, junk)", !["http://fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.example/x", "https://evilpush.apple.com/x", "https://fcm.googleapis.com:8443/x", "https://u:p@fcm.googleapis.com/x", "https://localhost/x", "https://169.254.169.254/x", "not a url", ""].some(pushEndpointAllowed));
  check("input: a browser's toJSON() parses", JSON.stringify(parseSubscriptionInput(good)) === JSON.stringify({ endpoint, p256dh, auth }));
  check("input: malformed keys are refused (short p256dh, not a point, short auth, missing keys)", parseSubscriptionInput({ endpoint, keys: { p256dh: auth, auth } }) == null && parseSubscriptionInput({ endpoint, keys: { p256dh: Buffer.alloc(65, 7).toString("base64url"), auth } }) == null && parseSubscriptionInput({ endpoint, keys: { p256dh, auth: "abc" } }) == null && parseSubscriptionInput({ endpoint }) == null && parseSubscriptionInput(null) == null);

  const store = fakePushStore([]);
  const deps = { store, userId: () => "u1" };
  const ok = await handleSubscribe(req(good), deps);
  check("subscribe: a valid subscription is saved for the current user (with the user agent)", ok.status === 200 && store.saved.length === 1 && store.saved[0].userId === "u1" && store.saved[0].sub.endpoint === endpoint && store.saved[0].ua === "Mozilla/5.0 test");
  const notJson = await handleSubscribe(new Request(`${ORIGIN}/api/push/subscribe`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "endpoint=x" }), deps);
  const cross = await handleSubscribe(req(good, { "sec-fetch-site": "cross-site" }), deps);
  const badJson = await handleSubscribe(req("{nope"), deps);
  const badHost = await handleSubscribe(req({ ...good, endpoint: "https://evil.example/collect" }), deps);
  const huge = await handleSubscribe(req({ ...good, pad: "x".repeat(9000) }), deps);
  check("subscribe: refuses a form post (415), a cross-site call (403), bad JSON (400), a foreign endpoint (400), a huge body (413)", notJson.status === 415 && cross.status === 403 && badJson.status === 400 && badHost.status === 400 && huge.status === 413, [notJson, cross, badJson, badHost, huge].map((r) => r.status).join(","));
  check("subscribe: nothing refused was saved", store.saved.length === 1);
  const broken = await handleSubscribe(req(good), { store: { ...store, save: async () => { throw new Error("db down"); } }, userId: () => "u1" });
  check("subscribe: a store failure answers 500", broken.status === 500);

  store.subs.push({ ...sub("mine"), endpoint }, { ...sub("theirs", "u2"), endpoint: endpoint + "2" });
  const del = await handleUnsubscribe(req({ endpoint }, {}, "DELETE"), deps);
  const delOther = await handleUnsubscribe(req({ endpoint: endpoint + "2" }, {}, "DELETE"), deps);
  const delBad = await handleUnsubscribe(req({}, {}, "DELETE"), deps);
  check("unsubscribe: removes this user's row for that endpoint, never another user's", (await del.json()).removed === 1 && (await delOther.json()).removed === 0 && store.subs.length === 1 && delBad.status === 400);
  const delCross = await handleUnsubscribe(req({ endpoint }, { "sec-fetch-site": "cross-site" }, "DELETE"), deps);
  check("unsubscribe: same site only", delCross.status === 403);

  // /api/push/test: Settings › Notifications' "Send a test".
  {
    const log: string[] = [];
    const push = fakePushStore([sub("t1"), sub("t2"), sub("other", "u2")]);
    const { sender, sent } = fakeSender(log);
    const limiter = new Map<string, number>();
    let clock = NOW.getTime();
    const tdeps = { store: push, sender, env: VAPID, userId: () => "u1", limiter, now: () => new Date(clock) };
    const testReq = (headers: Record<string, string> = {}, body: unknown = {}) =>
      new Request(`${ORIGIN}/api/push/test`, { method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
    const first = await handleTestPush(testReq(), tdeps);
    const firstBody = (await first.json()) as { sent?: number; subscriptions?: number };
    check("test push: sends the test payload to every device of the current user only", first.status === 200 && firstBody.sent === 2 && sent.length === 2 && sent.every((x) => !x.endpoint.endsWith("/other")) && JSON.parse(sent[0].payload).title === TEST_PUSH_PAYLOAD.title && JSON.parse(sent[0].payload).url === "/settings#notifications", JSON.stringify(firstBody));
    clock += 30_000;
    const again = await handleTestPush(testReq(), tdeps);
    const againBody = (await again.json()) as { retryAfter?: number };
    check("test push: a second within a minute is 429 with retryAfter (and Retry-After), nothing sent", again.status === 429 && againBody.retryAfter === 30 && again.headers.get("retry-after") === "30" && sent.length === 2, JSON.stringify(againBody));
    clock += TEST_PUSH_GAP_MS;
    const later = await handleTestPush(testReq(), tdeps);
    check("test push: a minute later it sends again", later.status === 200 && sent.length === 4);
    const otherUser = await handleTestPush(testReq(), { ...tdeps, userId: () => "u2" });
    check("test push: the limit is per user", otherUser.status === 200 && sent.length === 5);
    const cross = await handleTestPush(testReq({ "sec-fetch-site": "cross-site" }), { ...tdeps, limiter: new Map() });
    const form = await handleTestPush(new Request(`${ORIGIN}/api/push/test`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "x=1" }), { ...tdeps, limiter: new Map() });
    check("test push: JSON from this site only (a cross-site call 403, a form post 415), nothing sent", cross.status === 403 && form.status === 415 && sent.length === 5);
    const noKeys = (await (await handleTestPush(testReq(), { ...tdeps, env: {}, limiter: new Map() })).json()) as { skipped?: string };
    const none = (await (await handleTestPush(testReq(), { ...tdeps, userId: () => "nobody", limiter: new Map() })).json()) as { skipped?: string };
    check("test push: says why nothing went (no VAPID keys, no device)", noKeys.skipped === "no-vapid" && none.skipped === "no-subscriptions");
  }
}

// ── 6. public/sw.js, run ──────────────────────────────────────────────────
async function serviceWorker() {
  const src = read("public/sw.js");
  type Win = { url: string; focused: number; navigate: (u: string) => Promise<Win | null>; focus: () => Promise<Win> };
  const boot = (windows: Win[] = []) => {
    const handlers: Record<string, (e: unknown) => void> = {};
    const shown: { title: string; options: Record<string, unknown> }[] = [];
    const opened: string[] = [];
    const fetched: { url: string; method: string; body: string }[] = [];
    const self = {
      location: { origin: ORIGIN },
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        handlers[type] = fn;
      },
      skipWaiting: () => Promise.resolve(),
      clients: {
        claim: async () => undefined,
        matchAll: async () => windows,
        openWindow: async (u: string) => {
          opened.push(u);
          return null;
        },
      },
      registration: {
        showNotification: async (title: string, options: Record<string, unknown>) => {
          shown.push({ title, options });
        },
        pushManager: { subscribe: async () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/new", toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/new", keys: {} }) }) },
      },
    };
    const fetch = async (url: string, init: { method: string; body: string }) => {
      fetched.push({ url, method: init.method, body: init.body });
      return { ok: true };
    };
    runInNewContext(src, { self, URL, fetch, console, setTimeout });
    const fire = async (type: string, event: Record<string, unknown>) => {
      const waits: Promise<unknown>[] = [];
      handlers[type]?.({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) });
      await Promise.all(waits);
    };
    return { handlers, shown, opened, fetched, fire };
  };
  const data = (v: unknown) => ({ json: () => v, text: () => JSON.stringify(v) });
  const win = (url: string, navigable = true): Win => {
    const w: Win = {
      url,
      focused: 0,
      navigate: async (u: string) => {
        if (!navigable) throw new TypeError("not controlled");
        w.url = u;
        return w;
      },
      focus: async () => {
        w.focused++;
        return w;
      },
    };
    return w;
  };

  {
    const sw = boot();
    check("sw: listens for install, activate, push, notificationclick, pushsubscriptionchange, and nothing else", Object.keys(sw.handlers).sort().join(",") === "activate,install,notificationclick,push,pushsubscriptionchange", Object.keys(sw.handlers).join(","));
    const body = code(src);
    check("sw: no fetch handler, no Cache Storage, no importScripts (it cannot serve a stale page)", !/addEventListener\(\s*["']fetch["']/.test(body) && !/\bcaches\b/.test(body) && !/importScripts/.test(body));
    await sw.fire("push", { data: data({ title: "Send the quote", body: "Call · Acme · 15:30", tag: "scheduled-c1", url: "/today/work/b1?task=c1" }) });
    const n = sw.shown[0];
    check("sw push: shows the title and body", n?.title === "Send the quote" && n.options.body === "Call · Acme · 15:30");
    check("sw push: one tag per task, re-alerting on a replacement", n?.options.tag === "scheduled-c1" && n.options.renotify === true);
    check("sw push: data.url is the absolute same-origin URL to open", (n?.options.data as { url?: string })?.url === `${ORIGIN}/today/work/b1?task=c1`);
    await sw.fire("push", { data: { json: () => { throw new SyntaxError("bad"); }, text: () => "plain words" } });
    await sw.fire("push", { data: null });
    const foreign = ["https://evil.example/phish", "//evil.example/x", "/\\evil.example/x", "/\t/evil.example/x", "javascript:alert(1)", 42];
    for (const url of foreign) await sw.fire("push", { data: data({ title: "x", url }) });
    check("sw push: bad JSON still shows a notification (its text as the body)", sw.shown[1]?.title === "XTNL" && sw.shown[1]?.options.body === "plain words");
    check("sw push: an empty push still shows a notification", sw.shown[2]?.title === "XTNL" && sw.shown[2]?.options.tag === undefined);
    const foreignUrls = sw.shown.slice(3).map((x) => (x.options.data as { url?: string })?.url);
    check("sw push: a foreign URL (another host, protocol-relative, backslash, javascript:, not a string) opens /today instead", foreignUrls.length === foreign.length && foreignUrls.every((u) => u === `${ORIGIN}/today`), foreignUrls.join(" "));
  }
  const click = async (windows: Win[], url = `${ORIGIN}/today?board=b1&callback=c1`) => {
    const sw = boot(windows);
    let closed = 0;
    await sw.fire("notificationclick", { notification: { close: () => closed++, data: { url } } });
    return { closed, opened: sw.opened };
  };
  {
    const target = `${ORIGIN}/today?board=b1&callback=c1`;
    const none = await click([]);
    check("sw click: closes the notification and opens the URL when no window is open", none.closed === 1 && none.opened.join() === target);
    const exact = win(target);
    const other = win(`${ORIGIN}/review`);
    const r1 = await click([other, exact]);
    check("sw click: focuses a window already on that URL (opens nothing)", exact.focused === 1 && other.focused === 0 && r1.opened.length === 0);
    const moved = win(`${ORIGIN}/review`);
    const r2 = await click([win("https://elsewhere.example/", true), moved]);
    check("sw click: moves an open app window to the URL and focuses it", moved.url === target && moved.focused === 1 && r2.opened.length === 0);
    const stuck = win(`${ORIGIN}/review`, false);
    const r3 = await click([stuck]);
    check("sw click: a window it cannot move means a new window", r3.opened.join() === target && stuck.focused === 0);
    const r4 = await click([], "https://evil.example/");
    check("sw click: a foreign URL in the notification opens /today", r4.opened.join() === `${ORIGIN}/today`);
  }
  {
    const sw = boot();
    const fresh = { endpoint: "https://fcm.googleapis.com/fcm/send/rotated", toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/rotated", keys: { p256dh: "p", auth: "a" } }) };
    await sw.fire("pushsubscriptionchange", { oldSubscription: { endpoint: "https://fcm.googleapis.com/fcm/send/old", options: {} }, newSubscription: fresh });
    check("sw rotate: saves the new subscription and forgets the old one", sw.fetched.length === 2 && sw.fetched[0].method === "POST" && sw.fetched[0].url === "/api/push/subscribe" && JSON.parse(sw.fetched[0].body).endpoint.endsWith("/rotated") && sw.fetched[1].method === "DELETE" && JSON.parse(sw.fetched[1].body).endpoint.endsWith("/old"));
    const sw2 = boot();
    await sw2.fire("pushsubscriptionchange", { oldSubscription: { endpoint: "https://fcm.googleapis.com/fcm/send/old", options: { userVisibleOnly: true } }, newSubscription: null });
    check("sw rotate: with no new subscription it subscribes again with the old options", sw2.fetched[0]?.method === "POST" && JSON.parse(sw2.fetched[0].body).endpoint.endsWith("/new"));
  }
}

// ── 7. Secrets stay on the server ─────────────────────────────────────────
function secrets() {
  const SECRET_NAMES = ["VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "REMINDER_DISPATCH_SECRET", "CRON_SECRET"];
  const client = code(read("src/lib/push-client.ts"));
  const envNames = [...client.matchAll(/process\.env\.(\w+)/g)].map((m) => m[1]);
  check("client: push-client.ts reads only process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY", envNames.length > 0 && envNames.every((n) => n === "NEXT_PUBLIC_VAPID_PUBLIC_KEY"), envNames.join(","));
  check("client: push-client.ts imports nothing (so it reaches no server module)", !/^\s*import\s/m.test(client) && !/require\(/.test(client));
  check("client: push-client.ts subscribes with userVisibleOnly and the public key, from /sw.js at scope /", /userVisibleOnly: true, applicationServerKey: key/.test(client) && /register\(SW_URL, \{ scope: "\/", updateViaCache: "none" \}\)/.test(client) && /const SW_URL = "\/sw\.js"/.test(client));
  check("client: enablePush asks permission before any other await (Safari prompts only inside the tap)", (() => {
    const fn = client.slice(client.indexOf("export async function enablePush"), client.indexOf("export async function disablePush"));
    const firstAwait = fn.indexOf("await ");
    return firstAwait > 0 && fn.slice(firstAwait).startsWith("await Notification.requestPermission()");
  })());
  check("client: iOS outside the Home Screen app answers 'ios-install' with a line that says so", /if \(isIos\(\) && !isStandalone\(\)\) return "ios-install"/.test(client) && /Home Screen/.test(read("src/lib/push-client.ts")));
  const sw = code(read("public/sw.js"));
  check("sw: no process.env and no secret name in the worker", !/process\.env/.test(sw) && !SECRET_NAMES.some((n) => sw.includes(n)) && !/VAPID_PUBLIC_KEY/.test(sw));

  // Every client module (a 'use client' file, or anything under src/components) and push-client.ts.
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|mjs)$/.test(f)) files.push(p);
    }
  };
  walk(join(ROOT, "src"));
  const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");
  const clientFiles = files.filter((p) => {
    const s = readFileSync(p, "utf8");
    return /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']use client["']/.test(s) || rel(p).startsWith("src/components/") || rel(p) === "src/lib/push-client.ts";
  });
  const leaks = clientFiles.filter((p) => {
    const s = code(readFileSync(p, "utf8"));
    return SECRET_NAMES.some((n) => new RegExp(`process\\.env\\.${n}\\b|process\\.env\\[["']${n}["']\\]`).test(s)) || /process\.env\.VAPID_PUBLIC_KEY\b/.test(s);
  });
  check("client: no client module reads a secret env name", leaks.length === 0 && clientFiles.length > 10, leaks.map(rel).join(", "));
  const reach = clientFiles.filter((p) => /from\s+["'](?:@\/lib\/|(?:\.\.?\/)+(?:lib\/)?)(push-server|reminders-server)["']|from\s+["']web-push["']/.test(readFileSync(p, "utf8")));
  check("client: no client module imports push-server, reminders-server or web-push", reach.length === 0, reach.map(rel).join(", "));
  const webPushUsers = files.filter((p) => /from\s+["']web-push["']|require\(["']web-push["']\)/.test(readFileSync(p, "utf8"))).map(rel);
  check("server: web-push is imported by src/lib/push-server.ts alone", webPushUsers.join() === "src/lib/push-server.ts", webPushUsers.join(", "));
  const pushServerUsers = files.filter((p) => /from\s+["'](?:@\/lib\/|\.\/)push-server["']/.test(readFileSync(p, "utf8"))).map(rel).sort();
  check(
    "server: push-server is reached only from the subscribe and test routes and the dispatcher",
    pushServerUsers.join() === "src/app/api/push/subscribe/route.ts,src/app/api/push/test/route.ts,src/lib/reminders-server.ts",
    pushServerUsers.join(", ")
  );
  const publicSecrets = files.flatMap((p) => [...readFileSync(p, "utf8").matchAll(/NEXT_PUBLIC_\w*(PRIVATE|SECRET)\w*/g)].map((m) => `${rel(p)}: ${m[0]}`));
  // .env.example is gitignored (.gitignore's '.env*'), so a fresh clone has none: checked where it exists.
  const example = existsSync(join(ROOT, ".env.example")) ? read(".env.example") : null;
  check("env: no NEXT_PUBLIC_ name carries PRIVATE or SECRET", publicSecrets.length === 0 && !/NEXT_PUBLIC_\w*(PRIVATE|SECRET)/.test(example ?? ""), publicSecrets.join(", "));
  const NAMES = ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "REMINDER_DISPATCH_SECRET"];
  if (example == null) console.log("  (no .env.example here: it is gitignored; the env names are checked in docs/life-plan/reminders.md)");
  else {
    const missing = NAMES.filter((n) => !new RegExp(`^${n}=\\s*$`, "m").test(example));
    check(".env.example: every push env name, with no value", missing.length === 0, missing.join(", "));
  }
}

// ── 8. Wiring ─────────────────────────────────────────────────────────────
function wiring() {
  const exportsOf = (f: string) => [...code(read(f)).matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map((m) => m[1]).sort().join(",");
  const sub = read("src/app/api/push/subscribe/route.ts");
  check("route /api/push/subscribe: exports POST, DELETE and dynamic only, delegating to push-server", exportsOf("src/app/api/push/subscribe/route.ts") === "DELETE,POST,dynamic" && /return handleSubscribe\(request\)/.test(sub) && /return handleUnsubscribe\(request\)/.test(sub));
  const testRoute = read("src/app/api/push/test/route.ts");
  check("route /api/push/test: exports POST and dynamic only, delegating to push-server", exportsOf("src/app/api/push/test/route.ts") === "POST,dynamic" && /return handleTestPush\(request\)/.test(testRoute) && /export const dynamic = "force-dynamic"/.test(testRoute));
  const disp = read("src/app/api/reminders/dispatch/route.ts");
  check("route /api/reminders/dispatch: exports GET, POST and dynamic only, both running the dispatcher", exportsOf("src/app/api/reminders/dispatch/route.ts") === "GET,POST,dynamic" && (disp.match(/return runReminderDispatch\(request\)/g) ?? []).length === 2 && /export const dynamic = "force-dynamic"/.test(disp));
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string>; dependencies: Record<string, string>; devDependencies: Record<string, string> };
  check("package.json: web-push is a dependency and @types/web-push a dev dependency", !!pkg.dependencies["web-push"] && !!pkg.devDependencies["@types/web-push"] && existsSync(join(ROOT, "node_modules/web-push/package.json")));
  check("package.json: push:check runs this check alone, and ui:check runs it (still ending with roadmap-ui-check)", pkg.scripts["push:check"] === "tsx scripts/push-check.ts" && pkg.scripts["ui:check"].split("&&").map((s) => s.trim()).includes("tsx scripts/push-check.ts") && pkg.scripts["ui:check"].endsWith(" && tsx scripts/roadmap-ui-check.ts"));
  const doc = existsSync(join(ROOT, "docs/life-plan/reminders.md")) ? read("docs/life-plan/reminders.md") : "";
  const docNeeds = ["npx web-push generate-vapid-keys", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "REMINDER_DISPATCH_SECRET", "CRON_SECRET", "cron.schedule", "net.http_post", "Hobby", REMINDER_SECRET_HEADER, "/api/reminders/dispatch"];
  const docMissing = docNeeds.filter((n) => !doc.includes(n));
  check("docs/life-plan/reminders.md: the keys, the env names, and the three schedulers", docMissing.length === 0, docMissing.join(", "));
}

// ── 9. The evening momentum nudge (momentum.md §F) ────────────────────────
async function nudges() {
  const LAUNCH = "2026-10-01";
  const DAY = "2026-10-12";
  // Sydney is on AEDT (UTC+11) in October.
  const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00+11:00`);
  const EVENING = at("20:30");
  const facts = (o: Partial<NudgeFacts> = {}): NudgeFacts => ({
    live: true,
    day: DAY,
    localHour: 20,
    inWindow: true,
    nudgeOn: true,
    run: 12,
    bank: 1,
    actionDone: false,
    claimed: false,
    atRisk: true,
    quest: { slot: "BODY", kind: "MOVE", minutes: 20, title: "Move 20 min" },
    hoursLeft: 8,
    ...o,
  });
  interface User {
    id: string;
    pref?: string | null;
    facts?: Partial<NudgeFacts>;
    factsThrow?: boolean;
    claimThrow?: boolean;
  }
  /** The claim's contract: one 'nudge:<day>' a user a day. `guarded: false` checks before it waits (the race a unique key prevents). */
  const fakeNudgeStore = (users: User[], log: string[], opts: { guarded?: boolean } = {}) => {
    const guarded = opts.guarded ?? true;
    const claims = new Set<string>();
    const s: NudgeStore & { lists: number; factsRead: string[]; claims: Set<string> } = {
      lists: 0,
      factsRead: [],
      claims,
      async listSubscribedUsers() {
        s.lists++;
        return users.map((u) => u.id);
      },
      async prefsOf(userId) {
        return users.find((u) => u.id === userId)?.pref ?? null;
      },
      async factsOf(userId) {
        s.factsRead.push(userId);
        const u = users.find((x) => x.id === userId);
        if (u?.factsThrow) throw new Error("db down");
        return facts({ ...u?.facts, claimed: (u?.facts?.claimed ?? false) || claims.has(`${userId}|${DAY}`) });
      },
      async claim(userId, day) {
        const u = users.find((x) => x.id === userId);
        if (u?.claimThrow) throw new Error("db down");
        const key = `${userId}|${day}`;
        if (!guarded) {
          const seen = claims.has(key);
          await tick();
          if (seen) return false;
          claims.add(key);
          log.push(`nclaim:${userId}`);
          return true;
        }
        await tick(); // another run may be claiming here
        if (claims.has(key)) return false;
        claims.add(key);
        log.push(`nclaim:${userId}`);
        return true;
      },
    };
    return s;
  };
  const prevEnv = process.env.XTNL_MOMENTUM_LAUNCH_DAY;
  delete process.env.XTNL_MOMENTUM_LAUNCH_DAY;
  try {
    // Inert with no launch day (DispatchDeps.momentumLaunchDay null), so nobody is listed, claimed or sent, even at 20:30.
    {
      const log: string[] = [];
      const store = fakeNudgeStore([{ id: "u1" }], log);
      const push = fakePushStore([sub("s1")]);
      const { sender, sent } = fakeSender(log);
      const r = await reportOf(await runReminderDispatch(authed(), { env: ENV, store: fakeReminderStore([], log), push, sender, now: () => EVENING, timeZone: TZ, nudgeStore: store, momentumLaunchDay: null }));
      check(
        "nudge: inert with no launch day (DispatchDeps.momentumLaunchDay null): no user listed, nothing claimed or sent at 20:30",
        store.lists === 0 && store.claims.size === 0 && sent.length === 0 && r.nudges.considered === 0 && r.nudges.claimed === 0,
        JSON.stringify(r.nudges)
      );
      const direct = await runMomentumNudges(EVENING, { store, push, sender, env: ENV, timeZone: TZ, launchDay: null });
      check("nudge: an explicit null launch day is inert too", direct.considered === 0 && store.lists === 0);
      const ahead = await reportOf(await runReminderDispatch(authed(), { env: ENV, store: fakeReminderStore([], log), push, sender, now: () => EVENING, timeZone: TZ, nudgeStore: store, momentumLaunchDay: "2026-10-13" }));
      check("nudge: inert before launch (a launch day still ahead, 2026-10-13): nobody listed, claimed or sent", ahead.nudges.considered === 0 && store.lists === 0 && store.claims.size === 0 && sent.length === 0, JSON.stringify(ahead.nudges));
    }

    // Launched: with nothing injected the dispatcher reads MOMENTUM_LAUNCH_DAY (2026-10-12, DAY itself), so 20:30 nudges.
    {
      const log: string[] = [];
      const store = fakeNudgeStore([{ id: "u1" }], log);
      const push = fakePushStore([sub("s1")]);
      const { sender, sent } = fakeSender(log);
      const r = await reportOf(await runReminderDispatch(authed(), { env: ENV, store: fakeReminderStore([], log), push, sender, now: () => EVENING, timeZone: TZ, nudgeStore: store }));
      check(
        "nudge: launched (MOMENTUM_LAUNCH_DAY 2026-10-12, nothing injected): on the launch day at 20:30 the user at risk is listed, claimed and sent once",
        MOMENTUM_LAUNCH_DAY === "2026-10-12" && DAY === MOMENTUM_LAUNCH_DAY && store.lists === 1 && store.claims.size === 1 && sent.length === 1 && r.nudges.considered === 1 && r.nudges.claimed === 1,
        JSON.stringify(r.nudges)
      );
    }

    // The window: [20:00, 22:00) in Sydney, nothing before or after (even a late scheduler).
    {
      const runAt = async (when: Date) => {
        const log: string[] = [];
        const store = fakeNudgeStore([{ id: "u1" }], log);
        const { sender, sent } = fakeSender(log);
        const r = await runMomentumNudges(when, { store, push: fakePushStore([sub("s1")]), sender, env: ENV, timeZone: TZ, launchDay: LAUNCH });
        return { r, sent: sent.length, lists: store.lists };
      };
      const [w1959, w2000, w2159, w2200, w1500, w2330] = await Promise.all([at("19:59"), at("20:00"), at("21:59"), at("22:00"), at("15:00"), at("23:30")].map(runAt));
      check("nudge window: 20:00 and 21:59 Sydney send", w2000.sent === 1 && w2159.sent === 1 && w2000.r.delivered === 1, `${w2000.sent} ${w2159.sent}`);
      check("nudge window: 19:59, 22:00, 23:30 and 15:00 send nothing and list nobody", [w1959, w2200, w1500, w2330].every((x) => x.sent === 0 && x.lists === 0 && x.r.considered === 0));
    }

    // Who is nudged: run 2+, nothing kept today, not yet claimed, the toggle not off; claim before send.
    {
      const log: string[] = [];
      const users: User[] = [
        { id: "u-risk" },
        { id: "u-two", facts: { run: 2, bank: 0, quest: null } },
        { id: "u-one", facts: { run: 1 } },
        { id: "u-kept", facts: { actionDone: true } },
        { id: "u-off", pref: "off" },
        { id: "u-claimed", facts: { claimed: true } },
        { id: "u-nodevice" },
        { id: "u-on", pref: "on", facts: { run: 30, bank: 2 } },
      ];
      const store = fakeNudgeStore(users, log);
      const push = fakePushStore(["u-risk", "u-two", "u-one", "u-kept", "u-off", "u-claimed", "u-on"].map((u) => sub(`s-${u}`, u)));
      const { sender, sent } = fakeSender(log);
      const r = await reportOf(await runReminderDispatch(authed(), { env: ENV, store: fakeReminderStore([], log), push, sender, now: () => EVENING, timeZone: TZ, nudgeStore: store, momentumLaunchDay: LAUNCH }));
      const sentTo = sent.map((x) => x.endpoint.split("/").pop());
      check("nudge: only a run of 2+ with nothing kept today and no claim yet (u-risk, u-two, u-on)", sentTo.sort().join(",") === "s-u-on,s-u-risk,s-u-two", sentTo.join(","));
      check("nudge: a run of 1, a kept day and an existing claim send nothing", !sentTo.some((x) => /u-one|u-kept|u-claimed/.test(x ?? "")));
      check("nudge: UserPrefs.nudge 'off' is respected (its facts are never read, nothing is claimed or sent)", !store.factsRead.includes("u-off") && !sentTo.includes("s-u-off") && ![...store.claims].some((k) => k.startsWith("u-off|")));
      check("nudge: a user with no device is still claimed (at most once) and counts as not delivered", store.claims.has(`u-nodevice|${DAY}`) && r.nudges.claimed === 4 && r.nudges.delivered === 3, JSON.stringify(r.nudges));
      check("nudge: the report counts considered, at risk, claimed and delivered", r.nudges.considered === 8 && r.nudges.atRisk === 4, JSON.stringify(r.nudges));
      const claimAt = log.indexOf("nclaim:u-risk");
      const sendAt = log.findIndex((l) => l === `send:momentum-${DAY}:s-u-risk`);
      check("nudge: it claims before it sends", claimAt >= 0 && sendAt > claimAt, log.join(" | "));
      check("nudge: the reminders' counts are untouched (claimed 0, more false)", r.claimed === 0 && r.delivered === 0 && r.more === false);
      const payload = JSON.parse(sent.find((x) => x.endpoint.endsWith("/s-u-risk"))!.payload);
      check("nudge words: 'Keep your 12-day run' / 'Move 20 min · 1 freeze banked · until 04:00', one tag a day, Today's Momentum card on a tap", payload.title === "Keep your 12-day run" && payload.body === "Move 20 min · 1 freeze banked · until 04:00" && payload.tag === `momentum-${DAY}` && payload.url === "/today#momentum", JSON.stringify(payload));
      const two = JSON.parse(sent.find((x) => x.endpoint.endsWith("/s-u-two"))!.payload);
      check("nudge words: with no quest left to name, any task keeps it ('· 0 freezes banked')", two.title === "Keep your 2-day run" && two.body === "Any task, a 10-minute walk or a checkpoint · 0 freezes banked · until 04:00", JSON.stringify(two));
      check("nudge: the push's topic is 'momentum'", sent.every((x) => x.options.topic === NUDGE_TOPIC) && NUDGE_TOPIC === "momentum");
      const again = await runMomentumNudges(at("21:10"), { store, push, sender, env: ENV, timeZone: TZ, launchDay: LAUNCH });
      check("nudge: a later run the same evening sends nothing (the claim stands)", again.claimed === 0 && sent.length === 3, JSON.stringify(again));
    }

    // At most one a day under concurrent runs (and one started from inside another's send).
    const concurrent = async (guarded: boolean) => {
      const log: string[] = [];
      const store = fakeNudgeStore([{ id: "u1" }], log, { guarded });
      const push = fakePushStore([sub("s1")]);
      let nested: Promise<unknown> | null = null;
      const deps = { env: ENV, store: fakeReminderStore([], log), push, now: () => EVENING, timeZone: TZ, nudgeStore: store, momentumLaunchDay: LAUNCH };
      const { sender, sent } = fakeSender(log, {}, async () => {
        await tick();
        if (!nested) nested = runReminderDispatch(authed(), { ...deps, sender });
      });
      await Promise.all([runReminderDispatch(authed(), { ...deps, sender }), runReminderDispatch(authed(), { ...deps, sender }), runReminderDispatch(authed(), { ...deps, sender })]);
      if (nested) await nested;
      return sent.length;
    };
    {
      const n = await concurrent(true);
      check("nudge: three concurrent runs and one started mid-send send exactly one nudge", n === 1, String(n));
      const naive = await concurrent(false);
      check("nudge: the test can fail: the same interleaving against an unguarded claim sends more than one", naive > 1, String(naive));
    }

    // Failures: a claim that errors sends nothing; facts that fail skip that user only.
    {
      const log: string[] = [];
      const store = fakeNudgeStore([{ id: "u-claimfail", claimThrow: true }, { id: "u-factsfail", factsThrow: true }, { id: "u-ok" }], log);
      const { sender, sent } = fakeSender(log);
      const r = await runMomentumNudges(EVENING, { store, push: fakePushStore([sub("a", "u-claimfail"), sub("b", "u-factsfail"), sub("c", "u-ok")]), sender, env: ENV, timeZone: TZ, launchDay: LAUNCH });
      check("nudge: a claim that fails sends nothing; failed facts skip only that user", sent.length === 1 && sent[0].endpoint.endsWith("/c") && r.claimed === 1 && r.delivered === 1, JSON.stringify(r));
      let threw = false;
      try {
        await runMomentumNudges(EVENING, { store: { ...store, listSubscribedUsers: async () => { throw new Error("db down"); } }, push: fakePushStore([]), env: ENV, timeZone: TZ, launchDay: LAUNCH });
      } catch {
        threw = true;
      }
      check("nudge: never throws (a listing that fails is no nudge)", !threw);
    }

    // Beside the scheduled task reminders: one run sends both, the cap and the counts are the reminders' own, each user listed once.
    {
      const log: string[] = [];
      const rows = [row("c1", -1)];
      rows[0].dueAt = new Date(EVENING.getTime() - 60_000);
      const push = fakePushStore([sub("s1")]);
      const { sender, sent } = fakeSender(log);
      const r = await reportOf(await runReminderDispatch(authed(), { env: ENV, store: fakeReminderStore(rows, log), push, sender, now: () => EVENING, timeZone: TZ, nudgeStore: fakeNudgeStore([{ id: "u1" }], log), momentumLaunchDay: LAUNCH }));
      check("nudge + reminder: both sent; claimed/delivered/more are the reminders' (1/1/false); the nudge is counted apart", sent.length === 2 && r.claimed === 1 && r.delivered === 1 && r.more === false && r.nudges.delivered === 1, JSON.stringify(r));
      check("nudge + reminder: the user's subscriptions are read once in the run", push.lists === 1, String(push.lists));
      check("nudge + reminder: the scheduled task is claimed and sent first", log.indexOf("claim:c1") < log.findIndex((l) => l.startsWith("send:scheduled-c1")) && log.findIndex((l) => l.startsWith("send:scheduled-c1")) < log.indexOf("nclaim:u1"), log.join(" | "));
    }

    // The rule and the claim row, pure.
    {
      check("nudgeDue: run 2+, nothing kept, not claimed, toggle not off, live", nudgeDue(facts(), null) && nudgeDue(facts({ run: 2 }), "on") && !nudgeDue(facts({ run: 1 }), null) && !nudgeDue(facts({ actionDone: true }), null) && !nudgeDue(facts({ claimed: true }), null) && !nudgeDue(facts(), "off") && !nudgeDue(facts({ live: false }), null));
      const words = nudgePayload(facts({ run: 7, bank: 2, quest: { slot: "TASK", kind: "TEMPLATE", templateId: "t", track: "DUTY", raw: 20, score: 30, title: "Tax return" } }));
      check("nudgePayload: names the run, the first undone quest and the freezes", words.title === "Keep your 7-day run" && words.body === "Tax return · 2 freezes banked · until 04:00", JSON.stringify(words));
      const data = nudgeClaimData("u1", DAY, EVENING);
      check(
        "claim row: a NUDGE row, sink NONE, 0 XP, never a streak unit, keyed 'nudge:<day>' on that life day",
        data.source === "NUDGE" && data.sink === "NONE" && data.xp === 0 && data.countsForStreak === false && data.dedupeKey === `nudge:${DAY}` && (data.day as Date).toISOString().slice(0, 10) === DAY && data.userId === "u1",
        JSON.stringify(data)
      );
      // The real claim, against a captured create: a P2002 is "already claimed" (false), anything else throws.
      const delegate = (prisma as unknown as { activityEvent: { create: (a: unknown) => Promise<unknown> } }).activityEvent;
      const original = delegate.create;
      let captured: unknown = null;
      let answer: "ok" | "dup" | "boom" = "ok";
      delegate.create = async (a: unknown) => {
        captured = a;
        if (answer === "dup") throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6" });
        if (answer === "boom") throw new Error("db down");
        return {};
      };
      let won = false;
      let dup = true;
      let boom = false;
      try {
        won = await prismaNudgeStore.claim("u1", DAY, EVENING);
        answer = "dup";
        dup = await prismaNudgeStore.claim("u1", DAY, EVENING);
        answer = "boom";
        await prismaNudgeStore.claim("u1", DAY, EVENING).catch(() => {
          boom = true;
        });
      } finally {
        delegate.create = original;
      }
      check("claim: the real claim writes the NUDGE row; P2002 reads as already claimed; any other error throws", won && !dup && boom && (captured as { data?: { dedupeKey?: string } })?.data?.dedupeKey === `nudge:${DAY}`, JSON.stringify(captured));
    }
  } finally {
    if (prevEnv === undefined) delete process.env.XTNL_MOMENTUM_LAUNCH_DAY;
    else process.env.XTNL_MOMENTUM_LAUNCH_DAY = prevEnv;
  }
  // The dispatcher keeps the momentum server out of its static graph (loaded on first use, by the real store only).
  const src = code(read("src/lib/reminders-server.ts"));
  check("nudge: reminders-server loads momentum-server lazily (no static import), and claims through activityData", !/^import [^;]*from "\.\/momentum-server";/m.test(src.replace(/^import type [^;]*;/gm, "")) && /await import\("\.\/momentum-server"\)/.test(src) && /activityData\(userId, \{ source: "NUDGE"/.test(src));
}

(async () => {
  // The modules log every refusal they swallow; the check provokes dozens. Keep them, print them only on a failure.
  const logged: string[] = [];
  const realError = console.error;
  console.error = (...a: unknown[]) => {
    logged.push(a.map((x) => (x instanceof Error ? x.message : String(x))).join(" "));
  };
  await auth();
  await dispatch();
  await sending();
  words();
  await subscribeApi();
  await serviceWorker();
  secrets();
  wiring();
  await nudges();
  console.error = realError;
  check("logs: a swallowed failure is logged, and no log line carries a secret or a key", logged.length > 0 && !logged.some((l) => [OWN_SECRET, CRON, VAPID.VAPID_PRIVATE_KEY].some((v) => l.includes(v))));
  if (failed) console.log(`  (${logged.length} swallowed errors were logged)`);
  console.log(`\npush-check: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
