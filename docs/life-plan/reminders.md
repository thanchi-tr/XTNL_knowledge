# Call back reminders: web push

Real notifications on the phone and the desktop when a call back is due (2026-10-12). The user chose web push:
no app store, no SMS, no email. This page covers the plumbing and its setup. The call back UI is a separate step.

## How it fits together

```
the work board UI ──enablePush()──▶ /sw.js registered, PushManager.subscribe(NEXT_PUBLIC_VAPID_PUBLIC_KEY)
                                    └─▶ POST /api/push/subscribe ──▶ PushSubscription row (one per browser)

scheduler, every minute ──▶ GET|POST /api/reminders/dispatch  (secret header)
                              1. claim: UPDATE CallBack SET remindSentAt = now
                                        WHERE remindAt <= now AND remindSentAt IS NULL AND archivedAt IS NULL
                                        (oldest first, at most 50, RETURNING the rows this run set)
                              2. send each claimed reminder to every subscription its user has (web-push, VAPID)
                                 404/410 → delete that subscription; any other failure → its failedAt
                              3. answer the counts
phone / desktop ──▶ sw.js 'push' shows "Call back · Phone" / "Acme, pricing · 15:30"
                    tap ──▶ /today?board=<boardId>&callback=<callBackId> (focus, reuse or open a window)
```

| File | What it holds |
| --- | --- |
| `public/sw.js` | The service worker: `push`, `notificationclick`, `pushsubscriptionchange`. No fetch handler, no cache. |
| `src/lib/push-client.ts` | `pushSupported()`, `pushStatus()`, `currentSubscription()`, `enablePush()`, `disablePush()`; every answer has a `line` for the UI. |
| `src/lib/push-server.ts` | `sendToUser(userId, payload)` (never throws), the subscription store, `/api/push/subscribe`'s handlers. |
| `src/lib/reminders-server.ts` | The dispatcher: who may call it, the claim, the notification text, `callBackUrl`. |
| `src/app/api/push/subscribe/route.ts` | POST (upsert by endpoint) and DELETE `{ endpoint }`. |
| `src/app/api/reminders/dispatch/route.ts` | GET and POST, both behind the secret. |
| `scripts/push-check.ts` | The check (`npm run push:check`, also in `ui:check`). |

## 1. Make the VAPID keys (once)

```
npx web-push generate-vapid-keys
```

It prints a public and a private key. Make them once and keep them: changing the pair orphans every subscription
(the browser's subscription is bound to the public key it was made with; `enablePush()` notices a changed key and
re-subscribes the next time the user turns reminders on, but nothing reaches that device until then).

Use the **same pair on every deployment and on the dev server**: dev and production share one database, so they
share the subscriptions too.

## 2. Environment variables

| Name | Value | Seen by the browser |
| --- | --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the public key | yes (inlined at build time) |
| `VAPID_PUBLIC_KEY` | the same public key | no |
| `VAPID_PRIVATE_KEY` | the private key | **no, never** |
| `VAPID_SUBJECT` | `mailto:you@example.com` (or an `https://` URL) | no |
| `REMINDER_DISPATCH_SECRET` | at least 16 random characters: `openssl rand -hex 32` | no |
| `CRON_SECRET` (exists already) | accepted too, as `Authorization: Bearer <CRON_SECRET>` (Vercel Cron) | no |

On Vercel: Project Settings, Environment Variables; add all five for Production (and Preview if you test push on
previews), then **redeploy**: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is baked into the browser bundle at build time, so a
build made before it was set shows "Reminders aren't set up on this server yet."

Locally: the same names in `.env.local`. `http://localhost` counts as a secure context, so push works on the
desktop's own browser; a phone on the LAN needs HTTPS (`next dev --experimental-https`) or the deployed site.

Without the VAPID keys the dispatcher answers 503 and claims nothing, so no reminder is lost to a misconfiguration.
Without either secret it answers 401 to everyone.

## 3. Call the dispatcher every minute

The dispatcher is idempotent and cheap when nothing is due (one UPDATE that matches no row). Pick one scheduler and
point it at **production only**: a dev server answering the same database would claim reminders too.

### (a) Supabase pg_cron + pg_net: recommended (free, every minute, nothing new to sign up for)

Both extensions are available on the free plan. In the **xtnl-idea** project's SQL editor (check the project ref:
never XTNL_thesis), with your production domain and secret in place of the placeholders:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The secret lives in Vault, not in the job's text.
select vault.create_secret('<REMINDER_DISPATCH_SECRET>', 'reminder_dispatch_secret');

select cron.schedule(
  'call-back-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<your-domain>/api/reminders/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminder-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_dispatch_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
```

Watching it:

```sql
select jobid, jobname, schedule, active from cron.job;
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
select status_code, content, created from net._http_response order by created desc limit 10;
```

Stopping it: `select cron.unschedule('call-back-reminders');`

### (b) Vercel Cron: only on a Pro plan

On Hobby a cron job runs at most once a day, which is useless for reminders. On Pro, add to `vercel.json`'s
`crons` and redeploy; Vercel sends `Authorization: Bearer $CRON_SECRET` itself:

```json
{ "path": "/api/reminders/dispatch", "schedule": "* * * * *" }
```

### (c) Any external cron

Anything that can make an HTTPS request every minute (cron-job.org, a server's crontab, …):

```
curl -fsS -X POST "https://<your-domain>/api/reminders/dispatch" -H "x-reminder-secret: $REMINDER_DISPATCH_SECRET"
```

GitHub Actions' `schedule` is not a fit: five minutes at best, and often late.

### What a run answers

```json
{ "claimed": 2, "delivered": 1, "noDevice": 0, "undelivered": 1,
  "pushes": { "sent": 1, "removed": 1, "failed": 0 }, "more": false }
```

`more: true` means the run took its cap of 50; the next minute takes the rest, oldest first.

## Rules the dispatcher keeps

- **At most once.** A run claims (sets `remindSentAt`) before it sends, in one guarded statement that returns only
  the rows it set, so overlapping runs never send one reminder twice. A reminder is never un-claimed: a push service
  that refuses, a user with no device, or a crash after the claim loses that one notification instead.
- **Due** means `remindAt <= now`, `remindSentAt` null, `archivedAt` null. A future, sent or archived call back is
  never touched.
- **Subscriptions clean themselves.** A 404 or 410 from the push service means the browser forgot the subscription:
  the row is deleted. Any other failure stamps `failedAt`; the next delivery stamps `lastUsedAt` and clears it.
- **The text**: title `Call back · Phone` (or `In person`, from `remindAction`, else `action`); body the tags, the
  call-back task's title, and the reminder time in the user's zone (`15:30` today, `12 Oct 15:30` otherwise). One
  notification tag per call back (`callback-<id>`), so a newer one replaces an older one on the device.
- **Secrets stay on the server.** The browser gets `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and nothing else; `push-check`
  scans the client modules and `sw.js` for the other names.

## For the call back UI (the next step)

- Turn reminders on with `enablePush()` **from a tap** (Safari only prompts inside a user gesture), and show the
  returned `line`. `pushStatus()` says where this device stands; `disablePush()` turns it off.
- On iPhone and iPad web push works only from the Home Screen app (iOS 16.4+); in a Safari tab `pushStatus()` and
  `enablePush()` answer `ios-install` with the instructions.
- A tap on a reminder opens `callBackUrl(boardId, callBackId)` = `/today?board=<boardId>&callback=<callBackId>`
  (`src/lib/reminders-server.ts`). The board should read both and highlight the call back; change the shape there.
- Setting or moving `remindAt` must also set `remindSentAt` back to null, or a re-scheduled reminder never fires.
  Archiving a call back (`archivedAt`) silences its reminder.
