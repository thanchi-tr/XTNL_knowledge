/*
 * XTNL service worker: web push only (scheduled task reminders; docs/life-plan/reminders.md).
 *
 * Deliberately tiny. No fetch handler and no caches: every request goes to the network exactly as it would
 * without this worker, so it cannot serve a stale page or break the app. It is registered only when the user
 * turns reminders on (src/lib/push-client.ts enablePush).
 *
 *   push                    shows the notification: { title, body, tag, url } from src/lib/push-server.ts
 *                           payloadJson. Always shows one (a push the user cannot see costs the subscription).
 *   notificationclick       focuses the window already on that URL, else moves an open window there, else
 *                           opens one. Only same-origin paths: anything else opens /today.
 *   pushsubscriptionchange  the browser rotated the subscription: save the new one, forget the old.
 */

const FALLBACK_URL = "/today";
const SUBSCRIBE_API = "/api/push/subscribe";

/** An absolute URL on this origin for a path (or a URL already on this origin); anything else is /today. */
function targetUrl(url) {
  try {
    if (typeof url === "string" && url) {
      const u = new URL(url, self.location.origin);
      if (u.origin === self.location.origin) return u.href;
    }
  } catch {
    // Not a URL: fall through.
  }
  return new URL(FALLBACK_URL, self.location.origin).href;
}

function readPayload(data) {
  if (!data) return {};
  try {
    const parsed = data.json();
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    try {
      return { body: data.text() };
    } catch {
      return {};
    }
  }
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const data = readPayload(event.data);
  const title = typeof data.title === "string" && data.title ? data.title : "XTNL";
  const tag = typeof data.tag === "string" && data.tag ? data.tag : undefined;
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: "/icon-192.png",
    data: { url: targetUrl(data.url) },
  };
  if (tag) {
    options.tag = tag;
    // A newer reminder for the same scheduled task replaces the old one and still alerts.
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = targetUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const exact = windows.find((w) => w.url === url);
      if (exact) return exact.focus();
      for (const w of windows) {
        if (new URL(w.url).origin !== self.location.origin) continue;
        try {
          const moved = await w.navigate(url);
          if (moved) return moved.focus();
        } catch {
          // An uncontrolled window cannot be navigated from here: open a new one instead.
        }
      }
      return self.clients.openWindow(url);
    })()
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const old = event.oldSubscription;
        const fresh = event.newSubscription || (old && old.options ? await self.registration.pushManager.subscribe(old.options) : null);
        if (fresh) {
          await fetch(SUBSCRIBE_API, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(fresh.toJSON()) });
        }
        if (old && (!fresh || old.endpoint !== fresh.endpoint)) {
          await fetch(SUBSCRIBE_API, { method: "DELETE", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ endpoint: old.endpoint }) });
        }
      } catch {
        // Nothing to do: the app's next enablePush saves whatever subscription the browser holds.
      }
    })()
  );
});
