/**
 * Scheduled task reminders (2026-10-12 for call backs and customer tasks; 2026-10-20 one list, ScheduledTask): the
 * dispatcher behind /api/reminders/dispatch. A scheduler calls it every minute (docs/life-plan/reminders.md: Supabase
 * pg_cron + pg_net, Vercel Cron on Pro, or any external cron); it sends each due scheduled task's reminder as a web
 * push once. (The in-app banner and the bell need none of this: they read the same tasks in place.)
 *
 *   REMINDER_BATCH · REMINDER_SECRET_HEADER · ReminderEnv
 *   dispatchAuthorized(headers, env)   'x-reminder-secret: <REMINDER_DISPATCH_SECRET>', or 'Authorization: Bearer'
 *                                      with REMINDER_DISPATCH_SECRET or CRON_SECRET (Vercel Cron's convention).
 *                                      No secret set means every request is refused
 *   DueReminder · ReminderStore · prismaReminderStore   claimDue(now, limit): the claim (below)
 *   reminderPayload(r, now, tz?) · reminderLine(payload)   what the notification says (scheduled-tasks.ts
 *                                      scheduledPayloadOf: the title; "Call · Jane Nguyen · C-1042 · 14:30"; a tap
 *                                      opens /today/work/<board>?task=<id>, the task highlighted on its agenda)
 *   DispatchDeps · runReminderDispatch(request, deps?)   the handler (a route file may export only its methods)
 *
 * Due: remind on, dueAt <= now, remindSentAt, doneAt and archivedAt null, its work tab not archived (an archived tab's
 * reminders wait, unclaimed, for its restore) and its customer, when it has one, not archived (held with them).
 * Oldest first; REMINDER_BATCH a run, the rest on the next minute (`more`).
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
 *
 * The evening momentum nudge (docs/life-plan/momentum.md §F, §E.7), on the same run, after the reminders:
 *   NudgeStore · prismaNudgeStore · nudgeDue(facts, pref) · nudgePayload(facts) · nudgeClaimData(userId, day, now)
 *   runMomentumNudges(now, deps)   from 20:00 to 22:00 Australia/Sydney (LIFE_TZ; nothing after 22:00, even late),
 *                                  for each user with a push subscription whose UserPrefs.nudge is not 'off' and whose
 *                                  run is 2+ with nothing that keeps it done today, it CLAIMS 'nudge:<day>' (a NUDGE row,
 *                                  sink NONE; P2002 = another run claimed it) and only then sends "Keep your 12-day run"
 *                                  / "<first undone quest> · <n> freezes banked · until 04:00", tap /today. At most one a
 *                                  life day under any number of concurrent runs; never un-claimed (a refusal or crash
 *                                  after the claim loses that nudge rather than risk two). Nothing at all before
 *                                  MOMENTUM_LAUNCH_DAY: it returns before listing anyone. Its count is its own
 *                                  (report.nudges): the reminders' claim, cap and `more` are unchanged.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { DAY_START_HOUR, LIFE_TZ, todayKey, type DayKey } from "./life-day";
import { prisma } from "./prisma";
import { activityData, isDuplicateActivity } from "./activity";
import { scheduledPayloadOf } from "./scheduled-tasks";
import { MOMENTUM_NUDGE, inNudgeWindow, momentumLaunchDay, momentumLive, nudgeOn, nudgeRowKey } from "./momentum";
import type { NudgeFacts } from "./momentum-server";
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
  title: string;
  /** CALL | VISIT | EMAIL | MESSAGE | OTHER. */
  channel: string;
  dueAt: Date;
  allDay: boolean;
  /** The task's customer (name and their own ID), when it has one. */
  customerName: string | null;
  customerNumber: string | null;
}

export interface ReminderStore {
  /**
   * Atomically marks up to `limit` due reminders sent (remindSentAt = now, only where it is still null) and returns
   * exactly the rows this call marked, oldest dueAt first. A row another run marked is never returned.
   */
  claimDue(now: Date, limit: number): Promise<DueReminder[]>;
}

export const prismaReminderStore: ReminderStore = {
  async claimDue(now, limit) {
    // One statement: the inner SELECT locks the due rows (skipping any a concurrent run holds), and the outer UPDATE
    // tests the claim's conditions again on each locked row, so a row is set, and returned, by one run only. `now` is
    // an ISO instant cast to timestamptz: the columns are timestamptz, and no session time zone is ever assumed.
    const at = now.toISOString();
    const rows = await prisma.$queryRaw<
      { id: string; userId: string; boardId: string; title: string; channel: string; dueAt: Date; allDay: boolean; customerName: string | null; customerNumber: string | null }[]
    >(Prisma.sql`
      WITH claimed AS (
        UPDATE "ScheduledTask" SET "remindSentAt" = ${at}::timestamptz, "updatedAt" = ${at}::timestamptz
        WHERE "id" IN (
          SELECT "id" FROM "ScheduledTask"
          WHERE "remind" = true AND "dueAt" <= ${at}::timestamptz AND "remindSentAt" IS NULL AND "doneAt" IS NULL AND "archivedAt" IS NULL
            AND EXISTS (SELECT 1 FROM "WorkBoard" wb WHERE wb."id" = "ScheduledTask"."boardId" AND wb."archivedAt" IS NULL)
            AND NOT EXISTS (SELECT 1 FROM "Customer" cu WHERE cu."id" = "ScheduledTask"."customerId" AND cu."archivedAt" IS NOT NULL)
          ORDER BY "dueAt" ASC, "id" ASC
          LIMIT ${limit}::int
          FOR UPDATE SKIP LOCKED
        )
        AND "remind" = true AND "remindSentAt" IS NULL AND "doneAt" IS NULL AND "archivedAt" IS NULL
        RETURNING "id", "userId", "boardId", "customerId", "title", "channel", "dueAt", "allDay"
      )
      SELECT c."id", c."userId", c."boardId", c."title", c."channel", c."dueAt", c."allDay", cu."name" AS "customerName", cu."number" AS "customerNumber"
      FROM claimed c LEFT JOIN "Customer" cu ON cu."id" = c."customerId"
      ORDER BY c."dueAt" ASC, c."id" ASC
    `);
    return rows.map((r) => ({ ...r, dueAt: new Date(r.dueAt), allDay: r.allDay === true }));
  },
};

// ── What it says ──────────────────────────────────────────────────────────

/** The push for a claimed reminder: scheduled-tasks.ts scheduledPayloadOf (one tag per task; its agenda row on a tap). */
export function reminderPayload(r: DueReminder, now: Date, tz: string = LIFE_TZ): PushPayload {
  return scheduledPayloadOf(
    {
      id: r.id,
      boardId: r.boardId,
      title: r.title,
      channel: r.channel,
      dueAt: r.dueAt,
      allDay: r.allDay,
      customer: r.customerName != null && r.customerNumber != null ? { name: r.customerName, number: r.customerNumber } : null,
    },
    now,
    tz
  );
}

/** The notification as one line: 'Send the quote · Call · Acme Pty · A-12 · 14:30'. */
export function reminderLine(p: PushPayload): string {
  return `${p.title} · ${p.body}`;
}

// ── The evening momentum nudge (momentum.md §F) ───────────────────────────

/** Where the life day ends, as the push prints it ('04:00'). */
const DAY_EDGE = `${String(DAY_START_HOUR).padStart(2, "0")}:00`;

export interface NudgeStore {
  /** Every user with at least one push subscription (SELECT DISTINCT "userId" FROM "PushSubscription"). */
  listSubscribedUsers(): Promise<string[]>;
  /** UserPrefs.nudge, fail soft: null (never chosen, or the column missing) reads as on. */
  prefsOf(userId: string): Promise<string | null>;
  /** momentum-server loadNudgeFacts: the run, today's action, the claim and the first undone quest. */
  factsOf(userId: string, now: Date): Promise<NudgeFacts>;
  /** Claims 'nudge:<day>': true when this call wrote it, false when it already existed (P2002). Throws otherwise. */
  claim(userId: string, day: DayKey, now: Date): Promise<boolean>;
}

/** The NUDGE claim row (§D.2): sink NONE, 0 XP, never a streak unit, keyed 'nudge:<day>'. */
export function nudgeClaimData(userId: string, day: DayKey, now: Date): Prisma.ActivityEventUncheckedCreateInput {
  return activityData(userId, { source: "NUDGE", sink: "NONE", day, occurredAt: now, xp: 0, countsForStreak: false, detail: "evening momentum nudge", dedupeKey: nudgeRowKey(day) });
}

export const prismaNudgeStore: NudgeStore = {
  async listSubscribedUsers() {
    const rows = await prisma.pushSubscription.findMany({ distinct: ["userId"], select: { userId: true }, orderBy: { userId: "asc" } });
    return rows.map((r) => r.userId);
  },
  async prefsOf(userId) {
    try {
      return (await prisma.userPrefs.findUnique({ where: { userId }, select: { nudge: true } }))?.nudge ?? null;
    } catch (err) {
      // Before the momentum migration the column is missing: never chosen, so on.
      console.error("[reminders] UserPrefs.nudge unreadable; reading it as on", err);
      return null;
    }
  },
  async factsOf(userId, now) {
    // Loaded on first use: the dispatcher's route (and push-check) never load the momentum server otherwise.
    const { loadNudgeFacts } = await import("./momentum-server");
    return loadNudgeFacts(userId, now);
  },
  async claim(userId, day, now) {
    try {
      await prisma.activityEvent.create({ data: nudgeClaimData(userId, day, now) });
      return true;
    } catch (err) {
      if (isDuplicateActivity(err)) return false;
      throw err;
    }
  },
};

/**
 * Is this user nudged now (§F)? Momentum live, UserPrefs.nudge not 'off', the run 2+, nothing that keeps it done
 * today, and no 'nudge:<day>' claim yet. The window and the subscription are checked by the run.
 */
export function nudgeDue(f: Pick<NudgeFacts, "live" | "run" | "actionDone" | "claimed">, pref: string | null): boolean {
  return f.live && nudgeOn(pref) && f.run >= MOMENTUM_NUDGE.MIN_RUN && !f.actionDone && !f.claimed;
}

/** "Keep your 12-day run" / "Move 20 min · 1 freeze banked · until 04:00"; one tag a life day; Today on a tap. */
export function nudgePayload(f: Pick<NudgeFacts, "day" | "run" | "bank" | "quest">): PushPayload {
  const keeps = f.quest?.title?.trim() || "Any task, a 10-minute walk or a checkpoint";
  return {
    title: `Keep your ${f.run}-day run`,
    body: [keeps, `${f.bank} ${f.bank === 1 ? "freeze" : "freezes"} banked`, `until ${DAY_EDGE}`].join(" · "),
    tag: `momentum-${f.day}`,
    // The Momentum card (TodayBoard, id="momentum"), as the bell links it.
    url: "/today#momentum",
  };
}

/** The push service's topic for the nudge (one undelivered nudge replaces another). */
export const NUDGE_TOPIC = "momentum";

export interface NudgeReport {
  /** Subscribed users looked at (inside the window, once momentum is live). */
  considered: number;
  /** Of those: nudge on, run 2+, nothing kept today, not yet claimed. */
  atRisk: number;
  /** Claims this run won ('nudge:<day>'). */
  claimed: number;
  /** Claimed nudges at least one device accepted. */
  delivered: number;
}

export interface NudgeDeps {
  store?: NudgeStore;
  push: PushStore;
  sender?: PushSender;
  env: ReminderEnv;
  /** The life zone (LIFE_TZ, Australia/Sydney) the window is read in. */
  timeZone?: string;
  /** The launch day (default momentum.ts momentumLaunchDay(): null keeps it inert). */
  launchDay?: DayKey | null;
  /** The run's per-user subscription lists, shared with the reminders (each user is listed once a run). */
  subsOf?: Map<string, PushSubscriptionRow[] | null>;
}

/** The hour (0–23) of an instant in a zone. */
function hourIn(now: Date, tz: string): number {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now));
  return Number.isFinite(h) ? h % 24 : -1;
}

/**
 * One pass of the evening nudge (§F). Returns at once before momentum's launch day and outside [20:00, 22:00); then,
 * per subscribed user: the toggle, the facts, the claim, and only then the send. Never throws.
 */
export async function runMomentumNudges(now: Date, deps: NudgeDeps): Promise<NudgeReport> {
  const report: NudgeReport = { considered: 0, atRisk: 0, claimed: 0, delivered: 0 };
  try {
    const tz = deps.timeZone ?? LIFE_TZ;
    const launch = deps.launchDay !== undefined ? deps.launchDay : momentumLaunchDay();
    if (!momentumLive(todayKey(now, tz), launch)) return report;
    if (!inNudgeWindow(hourIn(now, tz))) return report;
    const store = deps.store ?? prismaNudgeStore;
    const subsOf = deps.subsOf ?? new Map<string, PushSubscriptionRow[] | null>();
    let users: string[];
    try {
      users = await store.listSubscribedUsers();
    } catch (err) {
      console.error("[reminders] listing the nudge's users failed", err);
      return report;
    }
    for (const userId of [...new Set(users)]) {
      report.considered++;
      try {
        const pref = await store.prefsOf(userId).catch(() => null);
        if (!nudgeOn(pref)) continue;
        const facts = await store.factsOf(userId, now);
        if (!nudgeDue(facts, pref)) continue;
        report.atRisk++;
        // Claim before send: a second run (or a crash after this line) can never send a second nudge today.
        if (!(await store.claim(userId, facts.day, now))) continue;
        report.claimed++;
        if (!subsOf.has(userId)) subsOf.set(userId, await deps.push.listFor(userId).catch(() => null));
        const subs = subsOf.get(userId);
        if (!subs || subs.length === 0) continue;
        const sent = await sendToSubscriptions(subs, nudgePayload(facts), { topic: NUDGE_TOPIC, store: deps.push, sender: deps.sender, env: deps.env, now: () => now });
        if (sent.sent > 0) report.delivered++;
        if (sent.removedIds.length) subsOf.set(userId, subs.filter((s) => !sent.removedIds.includes(s.id)));
      } catch (err) {
        console.error("[reminders] a momentum nudge failed; that user is skipped", err);
      }
    }
  } catch (err) {
    console.error("[reminders] the momentum nudges failed", err);
  }
  return report;
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
  /** The evening momentum nudge's reads and claim (prismaNudgeStore by default; push-check passes a fake). */
  nudgeStore?: NudgeStore;
  /** The momentum launch day the nudge reads (default momentumLaunchDay()). */
  momentumLaunchDay?: DayKey | null;
}

export interface DispatchReport {
  /** Scheduled task reminders this run claimed (and so marked sent). */
  claimed: number;
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
  /** The evening momentum nudge (§F): its own counts, outside `claimed`, `delivered` and the cap. */
  nudges: NudgeReport;
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
  // The push service's topic is the task's id cut to 32 URL-safe characters (one undelivered push per task).
  const jobs: { userId: string; topic: string; payload: PushPayload }[] = claimed.map((r) => ({ userId: r.userId, topic: r.id.slice(-32), payload: reminderPayload(r, now, tz) }));
  const total = jobs.length;
  const report: DispatchReport = {
    claimed: total,
    delivered: 0,
    noDevice: 0,
    undelivered: 0,
    pushes: { sent: 0, removed: 0, failed: 0 },
    more: total >= limit,
    nudges: { considered: 0, atRisk: 0, claimed: 0, delivered: 0 },
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
  // The evening momentum nudge (§F): after the reminders, on the same subscription lists; inert before launch.
  report.nudges = await runMomentumNudges(now, {
    store: deps.nudgeStore,
    push,
    sender: deps.sender,
    env,
    timeZone: tz,
    ...(deps.momentumLaunchDay !== undefined ? { launchDay: deps.momentumLaunchDay } : {}),
    subsOf,
  });
  return Response.json(report, { headers: NO_STORE });
}
