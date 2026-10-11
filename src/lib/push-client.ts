/**
 * Web push, the browser half (call back reminders, 2026-10-12): turn reminders on or off on this device. The
 * server half is src/lib/push-server.ts (and /api/push/subscribe); the worker that shows the notification is
 * public/sw.js; setup is docs/life-plan/reminders.md.
 *
 *   PushState · PushResult           every answer carries a `line` the UI can show as is
 *   pushSupported()                  true when reminders can be turned on here (no prompt, no request)
 *   pushStatus()                     on, off, denied, ios-install, unsupported or not-configured, with its line
 *   currentSubscription()            this browser's subscription, or null (never registers the worker)
 *   enablePush()                     call it from a tap: asks permission FIRST (Safari shows the prompt only inside
 *                                    a user gesture), then registers /sw.js, subscribes with
 *                                    NEXT_PUBLIC_VAPID_PUBLIC_KEY and saves the subscription to /api/push/subscribe
 *   disablePush()                    unsubscribes here, then tells the server (best effort: a dead row is deleted
 *                                    on its next send anyway)
 *
 * iPhone and iPad: web push works only in the app added to the Home Screen (iOS 16.4+), never in a Safari tab;
 * the 'ios-install' line says how. Nothing here runs on import, and nothing throws: on the server (no window)
 * everything answers 'unsupported'. The only env value read is NEXT_PUBLIC_VAPID_PUBLIC_KEY, which is public.
 */

const SW_URL = "/sw.js";
const SUBSCRIBE_API = "/api/push/subscribe";
const READY_TIMEOUT_MS = 10_000;

export type PushState = "on" | "off" | "denied" | "ios-install" | "unsupported" | "not-configured" | "error";

export interface PushResult {
  ok: boolean;
  state: PushState;
  /** One plain sentence for the UI. */
  line: string;
}

export const PUSH_LINES: Record<PushState, string> = {
  on: "Call back reminders will arrive on this device.",
  off: "Reminders are off on this device.",
  denied: "Notifications are blocked for this site. Allow them in the browser's site settings, then turn reminders on again.",
  "ios-install": "On iPhone and iPad, reminders only work from the Home Screen app: tap Share, then Add to Home Screen, and turn them on from there.",
  unsupported: "This browser can't show reminders. Try Chrome, Edge, Firefox or Safari.",
  "not-configured": "Reminders aren't set up on this server yet.",
  error: "Couldn't change reminders on this device. Try again.",
};

const DISMISSED_LINE = "Notifications weren't allowed, so reminders stay off.";
const UNSAVED_LINE = "This device subscribed, but the server didn't save it. Try again.";

const result = (state: PushState, line: string = PUSH_LINES[state]): PushResult => ({ ok: state === "on" || state === "off", state, line });

function vapidPublicKey(): string {
  return (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
}

function inBrowser(): boolean {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

/** iPhone, iPod, or an iPad (which reports itself as a Mac with a touch screen). */
function isIos(): boolean {
  if (!inBrowser()) return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Opened from the Home Screen (or as an installed app) rather than in a browser tab. */
function isStandalone(): boolean {
  if (!inBrowser()) return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches);
}

/** Why reminders cannot be turned on here, or null when they can. */
function blocker(): PushState | null {
  if (!inBrowser()) return "unsupported";
  if (isIos() && !isStandalone()) return "ios-install";
  const apis = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;
  if (!apis) return "unsupported";
  if (!vapidPublicKey()) return "not-configured";
  return null;
}

/** True when reminders can be turned on in this browser (it asks nothing and sends nothing). */
export function pushSupported(): boolean {
  return blocker() === null;
}

/** The base64url VAPID public key as the bytes PushManager.subscribe wants. */
function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const b64 = (key + "=".repeat((4 - (key.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

/** This browser's push subscription, or null. Never registers the worker, never throws. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!inBrowser() || !("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

/** Where this device stands, with its line. */
export async function pushStatus(): Promise<PushResult> {
  const blocked = blocker();
  if (blocked) return result(blocked);
  if (Notification.permission === "denied") return result("denied");
  return (await currentSubscription()) ? result("on") : result("off");
}

async function callApi(method: "POST" | "DELETE", body: unknown): Promise<boolean> {
  try {
    const res = await fetch(SUBSCRIBE_API, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * Turns reminders on for this device. Call it only from a user's tap: the permission prompt is its first step.
 * A subscription made with an older VAPID key is replaced.
 */
export async function enablePush(): Promise<PushResult> {
  const blocked = blocker();
  if (blocked) return result(blocked);
  let permission = Notification.permission;
  if (permission === "denied") return result("denied");
  if (permission !== "granted") {
    try {
      permission = await Notification.requestPermission();
    } catch {
      return result("error");
    }
  }
  if (permission === "denied") return result("denied");
  if (permission !== "granted") return { ok: false, state: "off", line: DISMISSED_LINE };
  try {
    await navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" });
    const reg = await withTimeout(navigator.serviceWorker.ready, READY_TIMEOUT_MS);
    const key = keyBytes(vapidPublicKey());
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub.options.applicationServerKey, key)) {
      await sub.unsubscribe().catch(() => false);
      sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    if (!(await callApi("POST", sub.toJSON()))) return { ok: false, state: "error", line: UNSAVED_LINE };
    return result("on");
  } catch {
    return Notification.permission === "denied" ? result("denied") : result("error");
  }
}

/** Turns reminders off for this device. */
export async function disablePush(): Promise<PushResult> {
  const sub = await currentSubscription();
  if (!sub) return result("off");
  const endpoint = sub.endpoint;
  let gone = false;
  try {
    gone = await sub.unsubscribe();
  } catch {
    gone = false;
  }
  await callApi("DELETE", { endpoint });
  return gone ? result("off") : result("error");
}
