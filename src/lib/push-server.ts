/**
 * Web push, the server half (call back reminders, 2026-10-12; scheduled task reminders from 2026-10-20). The browser half is src/lib/push-client.ts and
 * public/sw.js; the dispatcher that decides what to send is src/lib/reminders-server.ts; the setup (VAPID keys,
 * env, the every-minute scheduler) is docs/life-plan/reminders.md.
 *
 *   PushPayload · PushSubscriptionRow · PushStore · PushSender · SendOptions · SendReport
 *   vapidOf(env)                       the VAPID details, or null when any of the three is missing or malformed
 *   sendToUser(userId, payload, opts?) every subscription the user has; NEVER throws. A 404 or 410 from the push
 *                                      service deletes that subscription (the browser forgot it); any other refusal
 *                                      or error stamps its failedAt; a delivery stamps lastUsedAt and clears failedAt
 *   sendToSubscriptions(subs, ...)     the same for a list already read (the dispatcher reads each user's once a run)
 *   pushEndpointAllowed(url) · parseSubscriptionInput(body)   untrusted input from the browser
 *   handleSubscribe(request, deps?) · handleUnsubscribe(request, deps?)   /api/push/subscribe POST and DELETE
 *                                      (a route file may export only its methods; these take injected fakes)
 *   handleTestPush(request, deps?)     /api/push/test POST: Settings › Notifications' "Send a test", once a minute
 *
 * Secrets: VAPID_PRIVATE_KEY and VAPID_SUBJECT are read here and nowhere the browser loads. The one value the
 * browser needs is the public key, which it reads as NEXT_PUBLIC_VAPID_PUBLIC_KEY. scripts/push-check.ts holds it.
 *
 * Endpoints are an allow-list of the real push services (FCM, Mozilla, Windows, Apple): the server POSTs to every
 * saved endpoint, so an arbitrary URL saved here would be a request the server makes for whoever saved it.
 */
import { sendNotification, type PushSubscription as WebPushSubscription, type RequestOptions } from "web-push";
import { prisma } from "./prisma";
import { getCurrentUserId } from "./user";

// ── Types ─────────────────────────────────────────────────────────────────

/** What the service worker shows (public/sw.js reads exactly these keys). */
export interface PushPayload {
  title: string;
  body: string;
  /** One per thing announced ('scheduled-<id>'): a newer notification with the same tag replaces the older one. */
  tag?: string;
  /** A same-origin path the notification opens on a tap. */
  url?: string;
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** A browser's subscription, as validated from its PushSubscription.toJSON(). */
export interface SubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushStore {
  listFor(userId: string): Promise<PushSubscriptionRow[]>;
  remove(id: string): Promise<void>;
  markUsed(id: string, at: Date): Promise<void>;
  markFailed(id: string, at: Date): Promise<void>;
  /** Upsert by endpoint: a browser re-subscribing replaces its keys and clears failedAt. */
  save(userId: string, sub: SubscriptionInput, userAgent: string | null): Promise<void>;
  /** Deletes the user's row for this endpoint; the count deleted (0 or 1). */
  removeEndpoint(userId: string, endpoint: string): Promise<number>;
}

/** Sends one encrypted message; resolves on a 2xx, rejects with an error carrying `statusCode` otherwise. */
export type PushSender = (sub: WebPushSubscription, payload: string, options: RequestOptions) => Promise<unknown>;

/** process.env, or a check's literal: the names this module reads (any other key is ignored). */
export interface PushEnv {
  [name: string]: string | undefined;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  NEXT_PUBLIC_VAPID_PUBLIC_KEY?: string;
}

export interface SendOptions {
  /** Coalesces undelivered messages on the push service (up to 32 URL-safe characters): one per scheduled task. */
  topic?: string;
  /** How long the push service holds an undelivered message, in seconds (default 12 hours). */
  ttlSeconds?: number;
  store?: PushStore;
  sender?: PushSender;
  env?: PushEnv;
  now?: () => Date;
}

export interface SendReport {
  /** Subscriptions the send began with. */
  subscriptions: number;
  /** Accepted by the push service. */
  sent: number;
  /** 404 or 410: the push service no longer knows the subscription, so its row was deleted. */
  removed: number;
  /** Any other refusal or error: the row's failedAt was stamped. */
  failed: number;
  /** Why nothing was attempted, when nothing was. */
  skipped: null | "no-vapid" | "no-subscriptions" | "store-error";
  /** The rows deleted (the dispatcher drops them from the list it reuses). */
  removedIds: string[];
}

// ── VAPID ─────────────────────────────────────────────────────────────────

const B64URL = /^[A-Za-z0-9_-]+$/;

/** The VAPID details from env, or null unless all three are present and well formed. */
export function vapidOf(env: PushEnv = process.env): { subject: string; publicKey: string; privateKey: string } | null {
  const publicKey = (env.VAPID_PUBLIC_KEY || env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim();
  const privateKey = (env.VAPID_PRIVATE_KEY || "").trim();
  const subject = (env.VAPID_SUBJECT || "").trim();
  if (!B64URL.test(publicKey) || !B64URL.test(privateKey)) return null;
  if (!/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(subject)) return null;
  return { subject, publicKey, privateKey };
}

// ── Sending ───────────────────────────────────────────────────────────────

const TTL_DEFAULT = 12 * 60 * 60;
const TOPIC = /^[A-Za-z0-9_-]{1,32}$/;
/** A socket that says nothing for this long is dropped, so one stuck push service cannot hold the dispatcher. */
const SOCKET_TIMEOUT_MS = 10_000;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A same-origin path, or '/today': never a scheme or a host ('//x', '/\x' and '/\t/x' all name a host). */
export function safePath(url: string | undefined | null): string {
  if (typeof url !== "string" || !url.startsWith("/") || url.length > 512) return "/today";
  const base = "https://origin.invalid";
  try {
    const u = new URL(url, base);
    return u.origin === base ? `${u.pathname}${u.search}${u.hash}` : "/today";
  } catch {
    return "/today";
  }
}

/** The JSON the service worker parses; clipped so it stays far under the 4 KB a push message may carry. */
export function payloadJson(p: PushPayload): string {
  return JSON.stringify({
    title: clip(String(p.title ?? ""), 120),
    body: clip(String(p.body ?? ""), 400),
    ...(p.tag ? { tag: clip(String(p.tag), 64) } : {}),
    url: safePath(p.url),
  });
}

function statusOf(err: unknown): number | null {
  if (err && typeof err === "object" && "statusCode" in err) {
    const s = (err as { statusCode: unknown }).statusCode;
    return typeof s === "number" ? s : null;
  }
  return null;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const webPushSender: PushSender = (sub, payload, options) => sendNotification(sub, payload, options);

const emptyReport = (skipped: SendReport["skipped"], subscriptions = 0): SendReport => ({ subscriptions, sent: 0, removed: 0, failed: 0, skipped, removedIds: [] });

/** Sends one payload to each subscription in parallel. Never throws. */
export async function sendToSubscriptions(subs: readonly PushSubscriptionRow[], payload: PushPayload, opts: SendOptions = {}): Promise<SendReport> {
  try {
    const vapid = vapidOf(opts.env ?? process.env);
    if (!vapid) return emptyReport("no-vapid", subs.length);
    if (subs.length === 0) return emptyReport("no-subscriptions");
    const store = opts.store ?? prismaPushStore;
    const sender = opts.sender ?? webPushSender;
    const now = opts.now ?? (() => new Date());
    const body = payloadJson(payload);
    const options: RequestOptions = {
      vapidDetails: vapid,
      TTL: opts.ttlSeconds ?? TTL_DEFAULT,
      urgency: "high",
      timeout: SOCKET_TIMEOUT_MS,
      ...(opts.topic && TOPIC.test(opts.topic) ? { topic: opts.topic } : {}),
    };
    const report = emptyReport(null, subs.length);
    // A store write that fails is logged and swallowed: the send already happened (or did not), and the row is
    // corrected on the next send.
    const quietly = async (what: string, op: () => Promise<void>) => {
      try {
        await op();
      } catch (err) {
        console.error(`[push] ${what} failed`, errorText(err));
      }
    };
    await Promise.all(
      subs.map(async (s) => {
        try {
          await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, options);
          report.sent++;
          await quietly("markUsed", () => store.markUsed(s.id, now()));
        } catch (err) {
          const status = statusOf(err);
          if (status === 404 || status === 410) {
            report.removed++;
            report.removedIds.push(s.id);
            await quietly("remove", () => store.remove(s.id));
          } else {
            report.failed++;
            console.error(`[push] send failed (${status ?? "no status"})`, errorText(err));
            await quietly("markFailed", () => store.markFailed(s.id, now()));
          }
        }
      })
    );
    return report;
  } catch (err) {
    console.error("[push] send failed", errorText(err));
    return emptyReport("store-error", subs.length);
  }
}

/** Sends one payload to every subscription the user has. Never throws. */
export async function sendToUser(userId: string, payload: PushPayload, opts: SendOptions = {}): Promise<SendReport> {
  if (!vapidOf(opts.env ?? process.env)) return emptyReport("no-vapid");
  let subs: PushSubscriptionRow[];
  try {
    subs = await (opts.store ?? prismaPushStore).listFor(userId);
  } catch (err) {
    console.error("[push] listing subscriptions failed", errorText(err));
    return emptyReport("store-error");
  }
  return sendToSubscriptions(subs, payload, opts);
}

// ── The store ─────────────────────────────────────────────────────────────

export const prismaPushStore: PushStore = {
  async listFor(userId) {
    return prisma.pushSubscription.findMany({ where: { userId }, select: { id: true, endpoint: true, p256dh: true, auth: true }, orderBy: { createdAt: "asc" } });
  },
  async remove(id) {
    await prisma.pushSubscription.deleteMany({ where: { id } });
  },
  async markUsed(id, at) {
    await prisma.pushSubscription.updateMany({ where: { id }, data: { lastUsedAt: at, failedAt: null } });
  },
  async markFailed(id, at) {
    await prisma.pushSubscription.updateMany({ where: { id }, data: { failedAt: at } });
  },
  async save(userId, sub, userAgent) {
    await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, userAgent },
      update: { userId, p256dh: sub.p256dh, auth: sub.auth, userAgent, failedAt: null },
    });
  },
  async removeEndpoint(userId, endpoint) {
    const r = await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return r.count;
  },
};

// ── Untrusted input ───────────────────────────────────────────────────────

/** The push services browsers subscribe through: Chrome/Edge-on-Android/Samsung/Opera (FCM), Firefox, Edge on Windows, Safari and iOS. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];

export function pushEndpointAllowed(url: string): boolean {
  if (typeof url !== "string" || url.length > 2048) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  return PUSH_HOSTS.some((h) => h.test(u.hostname.toLowerCase()));
}

function keyBytes(s: unknown): Buffer | null {
  if (typeof s !== "string") return null;
  const t = s.trim().replace(/=+$/, "");
  if (!t || t.length > 200 || !B64URL.test(t)) return null;
  return Buffer.from(t, "base64url");
}

/** { endpoint, keys: { p256dh, auth } } (PushSubscription.toJSON()), or null unless every part is well formed. */
export function parseSubscriptionInput(body: unknown): SubscriptionInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const keys = (b.keys && typeof b.keys === "object" ? b.keys : {}) as Record<string, unknown>;
  const endpoint = typeof b.endpoint === "string" ? b.endpoint.trim() : "";
  if (!pushEndpointAllowed(endpoint)) return null;
  const p256dh = keyBytes(keys.p256dh);
  const auth = keyBytes(keys.auth);
  // An uncompressed P-256 point (65 bytes, 0x04 first) and a 16-byte auth secret: what web-push itself requires.
  if (!p256dh || p256dh.length !== 65 || p256dh[0] !== 0x04) return null;
  if (!auth || auth.length < 16 || auth.length > 64) return null;
  return { endpoint, p256dh: (keys.p256dh as string).trim(), auth: (keys.auth as string).trim() };
}

// ── /api/push/subscribe ───────────────────────────────────────────────────

export interface SubscribeDeps {
  store?: PushStore;
  userId?: () => string;
}

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_BODY = 8 * 1024;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

/** JSON from this site only (a cross-site form cannot send JSON without a preflight), at most 8 KB. */
async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return { ok: false, res: json({ error: "JSON only" }, 415) };
  if (request.headers.get("sec-fetch-site") === "cross-site") return { ok: false, res: json({ error: "Same site only" }, 403) };
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, res: json({ error: "Bad body" }, 400) };
  }
  if (text.length > MAX_BODY) return { ok: false, res: json({ error: "Too large" }, 413) };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, res: json({ error: "Bad JSON" }, 400) };
  }
}

/** POST: save (upsert by endpoint) this browser's subscription for the current user. */
export async function handleSubscribe(request: Request, deps: SubscribeDeps = {}): Promise<Response> {
  const read = await readJson(request);
  if (!read.ok) return read.res;
  const sub = parseSubscriptionInput(read.body);
  if (!sub) return json({ error: "Not a push subscription" }, 400);
  try {
    const userId = (deps.userId ?? getCurrentUserId)();
    const ua = request.headers.get("user-agent");
    await (deps.store ?? prismaPushStore).save(userId, sub, ua ? ua.slice(0, 300) : null);
    return json({ saved: true });
  } catch (err) {
    console.error("[push] subscribe failed", errorText(err));
    return json({ error: "Could not save" }, 500);
  }
}

// ── /api/push/test ────────────────────────────────────────────────────────

/** One test notification a minute per user (Settings › Notifications' "Send a test"). */
export const TEST_PUSH_GAP_MS = 60_000;

/** The test notification: what a reminder looks like, and a tap back to Settings. */
export const TEST_PUSH_PAYLOAD: PushPayload = {
  title: "Test notification",
  body: "Scheduled task reminders will arrive like this.",
  tag: "test-push",
  url: "/settings#notifications",
};

/** When each user last sent a test (per server process: enough for a one-person app; a cold start resets it). */
const lastTestAt = new Map<string, number>();

export interface TestPushDeps extends SubscribeDeps {
  sender?: PushSender;
  env?: PushEnv;
  now?: () => Date;
  /** The rate limit's memory (the check passes its own). */
  limiter?: Map<string, number>;
}

/**
 * POST (JSON from this site only): sends TEST_PUSH_PAYLOAD to every subscription the current user has
 * (sendToUser), at most once a minute (429 with `retryAfter` seconds otherwise). Answers the send's counts and
 * why nothing went (`skipped`: no-vapid, no-subscriptions, store-error).
 */
export async function handleTestPush(request: Request, deps: TestPushDeps = {}): Promise<Response> {
  const read = await readJson(request);
  if (!read.ok) return read.res;
  try {
    const userId = (deps.userId ?? getCurrentUserId)();
    const now = (deps.now ?? (() => new Date()))().getTime();
    const limiter = deps.limiter ?? lastTestAt;
    const last = limiter.get(userId);
    if (last != null && now - last < TEST_PUSH_GAP_MS) {
      const retryAfter = Math.max(1, Math.ceil((TEST_PUSH_GAP_MS - (now - last)) / 1000));
      return Response.json({ error: "One test a minute", retryAfter }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(retryAfter) } });
    }
    limiter.set(userId, now);
    const r = await sendToUser(userId, TEST_PUSH_PAYLOAD, { topic: "test-push", ttlSeconds: 300, store: deps.store, sender: deps.sender, env: deps.env, now: deps.now });
    return json({ subscriptions: r.subscriptions, sent: r.sent, removed: r.removed, failed: r.failed, skipped: r.skipped });
  } catch (err) {
    console.error("[push] test failed", errorText(err));
    return json({ error: "Could not send" }, 500);
  }
}

/** DELETE { endpoint }: forget this browser's subscription. */
export async function handleUnsubscribe(request: Request, deps: SubscribeDeps = {}): Promise<Response> {
  const read = await readJson(request);
  if (!read.ok) return read.res;
  const b = read.body as Record<string, unknown> | null;
  const endpoint = b && typeof b === "object" && typeof b.endpoint === "string" ? b.endpoint.trim() : "";
  if (!endpoint || endpoint.length > 2048) return json({ error: "No endpoint" }, 400);
  try {
    const userId = (deps.userId ?? getCurrentUserId)();
    const removed = await (deps.store ?? prismaPushStore).removeEndpoint(userId, endpoint);
    return json({ removed });
  } catch (err) {
    console.error("[push] unsubscribe failed", errorText(err));
    return json({ error: "Could not remove" }, 500);
  }
}
