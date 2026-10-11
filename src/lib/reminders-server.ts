/**
 * Call back and customer task reminders (2026-10-12): the dispatcher behind /api/reminders/dispatch. A scheduler
 * calls it every minute (docs/life-plan/reminders.md: Supabase pg_cron + pg_net, Vercel Cron on Pro, or any
 * external cron); it sends each due CallBack reminder, and each due CustomerTask (a work tab's CRM), as a web
 * push once.
 *
 *   REMINDER_BATCH · REMINDER_SECRET_HEADER · ReminderEnv
 *   dispatchAuthorized(headers, env)   'x-reminder-secret: <REMINDER_DISPATCH_SECRET>', or 'Authorization: Bearer'
 *                                      with REMINDER_DISPATCH_SECRET or CRON_SECRET (Vercel Cron's convention).
 *                                      No secret set means every request is refused
 *   DueReminder · DueCustomerTask · ReminderStore · prismaReminderStore
 *                                      claimDue(now, limit) and claimDueCustomerTasks(now, limit): the claims (below)
 *   callBackUrl(boardId, id) · reminderPayload(r, now, tz?) · reminderLine(payload)   what the notification says
 *   customerTaskUrl(boardId, customerId, id) · customerTaskPayload(t, now, tz?)      the same for a customer task
 *   DispatchDeps · runReminderDispatch(request, deps?)   the handler (a route file may export only its methods)
 *
 * Due call back: remindAt <= now, remindSentAt null, archivedAt null, its work tab not archived (an archived
 * tab's reminders wait, unclaimed, for its restore). Due customer task: remind true, dueAt <= now, remindSentAt,
 * doneAt and archivedAt null, its customer and its tab not archived. Oldest first; ONE cap a run for both
 * (REMINDER_BATCH: call backs first, customer tasks take what is left), the rest on the next minute (`more`).
 *
 * At most once. A run CLAIMS before it sends: one guarded UPDATE sets remindSentAt where it is still null and
 * returns exactly the rows it set (FOR UPDATE SKIP LOCKED, and the null test again on the row it locked), so two
 * overlapping runs split the due rows and never both send one. A reminder is never un-claimed: a push service that
 * refuses, a device with no subscription, or a crash after the claim loses that one notification rather than risk
 * sending it twice. The run refuses before claiming anything when the VAPID keys are missing (503), so a
 * misconfigured deployment does not burn reminders.
 *
 * Shared database: dev and production read one Supabase database (settlement.ts, decision 2), and a subscription
 * only accepts pushes signed with the VAPID key it was made with. Schedule exactly one deployment's dispatcher
 * (production's), and give every deployment the same VAPID keys.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { LIFE_TZ } from "./life-day";
import { prisma } from "./prisma";
import {
  prismaPushStore,
  sendToSubscriptions,
  vapidOf,
  type PushEnv,
  type PushPayload,
  type PushSender,
  type PushStore,
  type PushSubscriptionRow,
} from "./push-server";

export const REMINDER_BATCH = 50;
export const REMINDER_SECRET_HEADER = "x-reminder-secret";
/** A REMINDER_DISPATCH_SECRET shorter than this is treated as unset (the docs make one with `openssl rand -hex 32`). */
const MIN_SECRET = 16;

export interface ReminderEnv extends PushEnv {
  REMINDER_DISPATCH_SECRET?: string;
  CRON_SECRET?: string;
}

// ── Who may run it ────────────────────────────────────────────────────────

/** Constant time over the SHA-256 of both sides, so neither the length nor a prefix leaks. */
function sameSecret(got: string, expected: string): boolean {
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function dispatchAuthorized(headers: Headers, env: ReminderEnv): boolean {
  const own = (env.REMINDER_DISPATCH_SECRET ?? "").trim();
  const cron = (env.CRON_SECRET ?? "").trim();
  const header = headers.get(REMINDER_SECRET_HEADER);
  const auth = headers.get("authorization");
  let ok = false;
  if (own.length >= MIN_SECRET) {
    if (header != null && sameSecret(header.trim(), own)) ok = true;
    if (auth != null && sameSecret(auth.trim(), `Bearer ${own}`)) ok = true;
  }
  if (cron && auth != null && sameSecret(auth.trim(), `Bearer ${cron}`)) ok = true;
  return ok;
}

// ── The claim ─────────────────────────────────────────────────────────────

export interface DueReminder {
  id: string;
  userId: string;
  boardId: string;
  /** How the call happened: PHONE | IN_PERSON. */
  action: string;
  /** How to call back, when the reminder names it (else `action`). */
  remindAction: string | null;
  tags: string[];
  remindAt: Date;
  /** The call-back task's title, when the call back has one. */
  taskTitle: string | null;
}

/** A due customer task (a work tab's CRM: CustomerTask with remind on). */
export interface DueCustomerTask {
  id: string;
  userId: string;
  /** The customer's work tab. */
  boardId: string;
  customerId: string;
  title: string;
  customerName: string;
  /** The customer's own ID as the user typed it. */
  customerNumber: string;
  dueAt: Date;
}

export interface ReminderStore {
  /**
   * Atomically marks up to `limit` due reminders sent (remindSentAt = now, only where it is still null) and
   * returns exactly the rows this call marked, oldest remindAt first. A row another run marked is never returned.
   */
  claimDue(now: Date, limit: number): Promise<DueReminder[]>;
  /**
   * The same guarded claim over due customer tasks, oldest dueAt first. Optional: a store without it (an older
   * fake) claims none.
   */
  claimDueCustomerTasks?(now: Date, limit: number): Promise<DueCustomerTask[]>;
}

export const prismaReminderStore: ReminderStore = {
  async claimDue(now, limit) {
    // One statement: the inner SELECT locks the due rows (skipping any a concurrent run holds), and the outer
    // UPDATE tests remindSentAt IS NULL again on each locked row, so a row is set, and returned, by one run only.
    const rows = await prisma.$queryRaw<
      { id: string; userId: string; boardId: string; action: string; remindAction: string | null; tags: string[] | null; remindAt: Date; taskTitle: string | null }[]
    >(Prisma.sql`
      WITH claimed AS (
        UPDATE "CallBack" SET "remindSentAt" = ${now}, "updatedAt" = ${now}
        WHERE "id" IN (
          SELECT "id" FROM "CallBack"
          WHERE "remindAt" <= ${now} AND "remindSentAt" IS NULL AND "archivedAt" IS NULL
            AND EXISTS (SELECT 1 FROM "WorkBoard" wb WHERE wb."id" = "CallBack"."boardId" AND wb."archivedAt" IS NULL)
          ORDER BY "remindAt" ASC, "id" ASC
          LIMIT ${limit}::int
          FOR UPDATE SKIP LOCKED
        )
        AND "remindSentAt" IS NULL AND "archivedAt" IS NULL
        RETURNING "id", "userId", "boardId", "action", "remindAction", "tags", "remindAt", "taskId"
      )
      SELECT c."id", c."userId", c."boardId", c."action", c."remindAction", c."tags", c."remindAt", t."title" AS "taskTitle"
      FROM claimed c LEFT JOIN "TaskTemplate" t ON t."id" = c."taskId"
      ORDER BY c."remindAt" ASC, c."id" ASC
    `);
    return rows.map((r) => ({ ...r, tags: r.tags ?? [], remindAt: new Date(r.remindAt) }));
  },
  async claimDueCustomerTasks(now, limit) {
    // The same shape: one statement, the inner SELECT locks the due tasks of open customers on open tabs whose
    // customer list is on (skipping any a concurrent run holds), and the outer UPDATE tests the claim's conditions
    // again on each locked row. A tab with its list off holds its reminders, as an archived tab does.
    const rows = await prisma.$queryRaw<
      { id: string; userId: string; customerId: string; title: string; dueAt: Date; customerName: string; customerNumber: string; boardId: string }[]
    >(Prisma.sql`
      WITH claimed AS (
        UPDATE "CustomerTask" SET "remindSentAt" = ${now}, "updatedAt" = ${now}
        WHERE "id" IN (
          SELECT "id" FROM "CustomerTask"
          WHERE "remind" = true AND "dueAt" <= ${now} AND "remindSentAt" IS NULL AND "doneAt" IS NULL AND "archivedAt" IS NULL
            AND EXISTS (
              SELECT 1 FROM "Customer" cu JOIN "WorkBoard" wb ON wb."id" = cu."boardId"
              WHERE cu."id" = "CustomerTask"."customerId" AND cu."archivedAt" IS NULL AND wb."archivedAt" IS NULL AND wb."crmOn" = true
            )
          ORDER BY "dueAt" ASC, "id" ASC
          LIMIT ${limit}::int
          FOR UPDATE SKIP LOCKED
        )
        AND "remind" = true AND "remindSentAt" IS NULL AND "doneAt" IS NULL AND "archivedAt" IS NULL
        RETURNING "id", "userId", "customerId", "title", "dueAt"
      )
      SELECT c."id", c."userId", c."customerId", c."title", c."dueAt", cu."name" AS "customerName", cu."number" AS "customerNumber", cu."boardId"
      FROM claimed c JOIN "Customer" cu ON cu."id" = c."customerId"
      ORDER BY c."dueAt" ASC, c."id" ASC
    `);
    return rows.map((r) => ({ ...r, dueAt: new Date(r.dueAt) }));
  },
};

// ── What it says ──────────────────────────────────────────────────────────

/**
 * Where a tap on the reminder lands: the call back's work board with that call back highlighted. The work board
 * UI reads `board` and `callback`; change the shape here and nowhere else.
 */
export function callBackUrl(boardId: string, callBackId: string): string {
  return `/today?board=${encodeURIComponent(boardId)}&callback=${encodeURIComponent(callBackId)}`;
}

const ACTION_LABELS: Record<string, string> = { PHONE: "Phone", IN_PERSON: "In person" };

function actionLabel(action: string | null | undefined): string {
  const a = (action ?? "").trim();
  if (!a) return "Call";
  if (ACTION_LABELS[a]) return ACTION_LABELS[a];
  const words = a.toLowerCase().replace(/_+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function localParts(d: Date, tz: string): { day: string; time: string; date: string } {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short" }).format(d);
  return { day, time, date };
}

/** '15:30' when the reminder falls on today's date in the user's zone, else '12 Oct 15:30'. */
function reminderTime(at: Date, now: Date, tz: string): string {
  const a = localParts(at, tz);
  return a.day === localParts(now, tz).day ? a.time : `${a.date} ${a.time}`;
}

/** Title 'Call back · Phone'; body '<tags>, <task title> · <time>'; one tag per call back; the board's URL. */
export function reminderPayload(r: DueReminder, now: Date, tz: string = LIFE_TZ): PushPayload {
  const tags = r.tags.map((t) => t.trim()).filter(Boolean).join(", ");
  const brief = [tags, (r.taskTitle ?? "").trim()].filter(Boolean).join(" · ");
  return {
    title: `Call back · ${actionLabel(r.remindAction ?? r.action)}`,
    body: [brief, reminderTime(r.remindAt, now, tz)].filter(Boolean).join(" · "),
    tag: `callback-${r.id}`,
    url: callBackUrl(r.boardId, r.id),
  };
}

/**
 * Where a tap on a customer task's reminder lands: the customer's page on its work tab, that task asked for (the
 * CRM's page reads `task`; callbacks.ts customerTaskHref is the bell's same link).
 */
export function customerTaskUrl(boardId: string, customerId: string, taskId: string): string {
  return `/today/work/${encodeURIComponent(boardId)}/customers/${encodeURIComponent(customerId)}?task=${encodeURIComponent(taskId)}`;
}

/** Title 'Customer task'; body '<task title> · <customer name> (#<number>) · <time>'; one tag per task. */
export function customerTaskPayload(t: DueCustomerTask, now: Date, tz: string = LIFE_TZ): PushPayload {
  return {
    title: "Customer task",
    body: [t.title.trim(), `${t.customerName.trim()} (#${t.customerNumber.trim()})`, reminderTime(t.dueAt, now, tz)].filter(Boolean).join(" · "),
    tag: `customer-task-${t.id}`,
    url: customerTaskUrl(t.boardId, t.customerId, t.id),
  };
}

/** The notification as one line: 'Call back · Phone · Acme, pricing · 15:30'. */
export function reminderLine(p: PushPayload): string {
  return `${p.title} · ${p.body}`;
}

// ── The run ───────────────────────────────────────────────────────────────

export interface DispatchDeps {
  env?: ReminderEnv;
  now?: () => Date;
  store?: ReminderStore;
  push?: PushStore;
  sender?: PushSender;
  limit?: number;
  timeZone?: string;
}

export interface DispatchReport {
  /** Reminders this run claimed (and so marked sent): call backs and customer tasks together. */
  claimed: number;
  /** Of `claimed`: call backs. */
  callBacks: number;
  /** Of `claimed`: customer tasks. */
  customerTasks: number;
  /** Claimed reminders at least one device accepted. */
  delivered: number;
  /** Claimed reminders whose user had no subscription. */
  noDevice: number;
  /** Claimed reminders every device refused, or that could not be sent. */
  undelivered: number;
  /** Per push: accepted, deleted (404/410), failed (failedAt stamped). */
  pushes: { sent: number; removed: number; failed: number };
  /** The run hit its cap: more may be due, and the next run takes them. */
  more: boolean;
  /** The customer task claim failed (the call backs it had claimed were still sent). */
  customerTaskError?: boolean;
}

const NO_STORE = { "Cache-Control": "no-store" };

export async function runReminderDispatch(request: Request, deps: DispatchDeps = {}): Promise<Response> {
  const env: ReminderEnv = deps.env ?? process.env;
  if (!dispatchAuthorized(request.headers, env)) return Response.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  if (!vapidOf(env)) return Response.json({ error: "VAPID keys are not set; nothing was claimed" }, { status: 503, headers: NO_STORE });

  const now = deps.now ? deps.now() : new Date();
  const limit = Math.max(1, Math.min(deps.limit ?? REMINDER_BATCH, REMINDER_BATCH));
  const push = deps.push ?? prismaPushStore;
  const store = deps.store ?? prismaReminderStore;
  const tz = deps.timeZone ?? LIFE_TZ;
  let claimed: DueReminder[];
  try {
    claimed = await store.claimDue(now, limit);
  } catch (err) {
    console.error("[reminders] claim failed", err);
    return Response.json({ error: "Claim failed; nothing was sent" }, { status: 500, headers: NO_STORE });
  }
  // One cap for the run: customer tasks take what the call backs left. Their claim failing never stops the call
  // backs already claimed from being sent (a claimed reminder is sent or lost, never left half-way).
  let tasks: DueCustomerTask[] = [];
  let customerTaskError = false;
  const room = limit - claimed.length;
  if (room > 0 && store.claimDueCustomerTasks) {
    try {
      tasks = await store.claimDueCustomerTasks(now, room);
    } catch (err) {
      console.error("[reminders] customer task claim failed", err);
      customerTaskError = true;
    }
  }

  const jobs: { userId: string; topic: string; payload: PushPayload }[] = [
    ...claimed.map((r) => ({ userId: r.userId, topic: r.id, payload: reminderPayload(r, now, tz) })),
    ...tasks.map((t) => ({ userId: t.userId, topic: t.id, payload: customerTaskPayload(t, now, tz) })),
  ];
  const total = jobs.length;
  const report: DispatchReport = {
    claimed: total,
    callBacks: claimed.length,
    customerTasks: tasks.length,
    delivered: 0,
    noDevice: 0,
    undelivered: 0,
    pushes: { sent: 0, removed: 0, failed: 0 },
    more: total >= limit,
    ...(customerTaskError ? { customerTaskError } : {}),
  };
  // Each user's subscriptions are read once a run; a row a send deleted is dropped before the next send.
  const subsOf = new Map<string, PushSubscriptionRow[] | null>();
  for (const job of jobs) {
    if (!subsOf.has(job.userId)) {
      try {
        subsOf.set(job.userId, await push.listFor(job.userId));
      } catch (err) {
        console.error("[reminders] listing subscriptions failed", err);
        subsOf.set(job.userId, null);
      }
    }
    const subs = subsOf.get(job.userId);
    if (subs == null) {
      report.undelivered++;
      continue;
    }
    if (subs.length === 0) {
      report.noDevice++;
      continue;
    }
    const sent = await sendToSubscriptions(subs, job.payload, { topic: job.topic, store: push, sender: deps.sender, env, now: () => now });
    report.pushes.sent += sent.sent;
    report.pushes.removed += sent.removed;
    report.pushes.failed += sent.failed;
    if (sent.sent > 0) report.delivered++;
    else report.undelivered++;
    if (sent.removedIds.length) subsOf.set(job.userId, subs.filter((s) => !sent.removedIds.includes(s.id)));
  }
  return Response.json(report, { headers: NO_STORE });
}
