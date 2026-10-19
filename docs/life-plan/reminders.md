# Scheduled task reminders: in the app, and on the phone by web push

A work tab's **scheduled tasks** (2026-10-20: the one list that replaced call backs and customer tasks;
`src/lib/scheduled-tasks.ts`) each carry one reminder at their time (an all-day task's at 09:00 that day). It reaches
you three ways:

| Where | Needs | What it does |
| --- | --- | --- |
| **The in-app banner** | nothing: works as soon as the code is deployed | While the app is open on any page, a task that comes due shows a banner above the bottom navigation (top right from 600 px) with Done, Snooze 10 min, Open and ×, a soft sound and a short haptic (Settings › Feedback). Once per device per due time. |
| **The bell** | nothing | Lists every open task whose time has come, push or no push. |
| **Web push** | the setup below | A notification on each device that turned reminders on, even with the app closed. |

The user chose web push for the phone: no app store, no SMS, no email.

## How it fits together

```
in the app (every page) ──▶ GET /api/scheduled/due every 60 s while visible, and on focus
                             (open tasks with a reminder, due from a day ago to a day ahead)
                            ──▶ local timer for the next one ──▶ the banner (never marks anything sent)

Settings › Notifications ──enablePush()──▶ /sw.js registered, PushManager.subscribe(NEXT_PUBLIC_VAPID_PUBLIC_KEY)
                                          └─▶ POST /api/push/subscribe ──▶ PushSubscription row (one per browser)

scheduler, every minute ──▶ GET|POST /api/reminders/dispatch  (secret header)
                              1. claim: UPDATE "ScheduledTask" SET remindSentAt = now
                                        WHERE remind AND dueAt <= now AND remindSentAt, doneAt, archivedAt IS NULL
                                          AND its WorkBoard is not archived AND its Customer (if any) is not archived
                                        (oldest first, at most 50, FOR UPDATE SKIP LOCKED, RETURNING the rows this run set)
                              2. send each claimed reminder to every subscription its user has (web-push, VAPID)
                                 404/410 → delete that subscription; any other failure → its failedAt
                              3. the evening momentum nudge (unchanged), then answer the counts
phone / desktop ──▶ sw.js 'push' shows "Send the quote" / "Call · Acme Pty · A-12 · 14:30"
                    tap ──▶ /today/work/<boardId>?task=<taskId> (the task highlighted on its tab's Agenda)
```

| File | What it holds |
| --- | --- |
| `src/components/work/WorkReminders.tsx` | The in-app banner (mounted once by `src/app/layout.tsx`). |
| `src/app/api/scheduled/due/route.ts` | GET: the banner's read (`scheduled-tasks-server.ts handleDueRequest`). |
| `public/sw.js` | The service worker: `push`, `notificationclick`, `pushsubscriptionchange`. No fetch handler, no cache. |
| `src/lib/push-client.ts` | `pushSupported()`, `pushStatus()`, `currentSubscription()`, `enablePush()`, `disablePush()`; every answer has a `line` for the UI. |
| `src/lib/push-server.ts` | `sendToUser(userId, payload)` (never throws), the subscription store, `/api/push/subscribe`'s and `/api/push/test`'s handlers. Reads `VAPID_PUBLIC_KEY` (else `NEXT_PUBLIC_VAPID_PUBLIC_KEY`), `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. |
| `src/lib/reminders-server.ts` | The dispatcher: who may call it (`REMINDER_DISPATCH_SECRET`, or `CRON_SECRET` as a Bearer), the claim, the notification. |
| `src/app/api/push/subscribe/route.ts` | POST (upsert by endpoint) and DELETE `{ endpoint }`. |
| `src/app/api/push/test/route.ts` | POST: Settings › Notifications' "Send a test", once a minute per user. |
| `src/app/api/reminders/dispatch/route.ts` | GET and POST, both behind the secret. |
| `scripts/vapid-keys.ts` | Prints a fresh VAPID pair and a dispatch secret (it writes no file). |
| `scripts/push-check.ts`, `scripts/scheduled-tasks-check.ts` | The checks (`npm run push:check`, `npm run scheduled-tasks:check`; both in `ui:check`). |

## Turning push on: the exact steps

### 1. Make the keys (once)

```
npx tsx scripts/vapid-keys.ts
```

(`npm run vapid:keys` runs the same.) It prints five lines: the public key twice (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
`VAPID_PUBLIC_KEY`), the private key, a placeholder `VAPID_SUBJECT` and a random 64-character
`REMINDER_DISPATCH_SECRET`. It writes no file: copy the lines straight into the next step, never into a tracked file.
The same pair by hand: `npx web-push generate-vapid-keys` and `openssl rand -hex 32`.

Make the pair once and keep it: changing it orphans every subscription (a browser's subscription is bound to the public
key it was made with; `enablePush()` notices a changed key and re-subscribes the next time the user turns reminders on,
but nothing reaches that device until then). Use the **same pair on every deployment and on the dev server**: dev and
production share one database, so they share the subscriptions too.

### 2. Vercel environment variables

Vercel › the project › Settings › Environment Variables. Add for **Production** (and Preview if you test push there):

| Name | Value | Seen by the browser |
| --- | --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the public key | yes (inlined at build time) |
| `VAPID_PUBLIC_KEY` | the same public key (optional: the server falls back to the one above) | no |
| `VAPID_PRIVATE_KEY` | the private key | **no, never** |
| `VAPID_SUBJECT` | `mailto:you@yourdomain` (or an `https://` URL of yours) | no |
| `REMINDER_DISPATCH_SECRET` | the 64-character secret | no |
| `CRON_SECRET` (exists already) | also accepted, as `Authorization: Bearer <CRON_SECRET>` (Vercel Cron) | no |

Then **redeploy** (Deployments › the latest › Redeploy): `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is baked into the browser
bundle at build time, so a build made before it was set shows "Reminders aren't set up on this server yet."

Locally: the same names in `.env.local` (gitignored). `http://localhost` counts as a secure context, so push works on the
desktop's own browser; a phone on the LAN needs HTTPS (`next dev --experimental-https`) or the deployed site.

Without the VAPID keys the dispatcher answers 503 and claims nothing, so no reminder is lost to a misconfiguration.
Without either secret it answers 401 to everyone.

### 3. Call the dispatcher every minute: Supabase pg_cron + pg_net (recommended)

Free on the free plan, every minute, nothing new to sign up for. Point it at **production only**: a dev server
answering the same database would claim reminders too. In the **xtnl-idea** project's SQL editor (check the project
ref first: never XTNL_thesis), with the placeholders filled in:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The secret lives in Vault, not in the job's text. <REMINDER_DISPATCH_SECRET>: the value from step 1.
select vault.create_secret('<REMINDER_DISPATCH_SECRET>', 'reminder_dispatch_secret');

select cron.schedule(
  'scheduled-task-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<your-production-domain>/api/reminders/dispatch',
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

A job made before 2026-10-20 under the old name is the same job: `select cron.unschedule('call-back-reminders');`
before scheduling this one, or keep the old one (only one of the two).

**Optional, before the first run:** no device ever had a subscription and nothing ran the dispatcher, so every past
reminder is still unsent, and the first run would push the oldest 50 at once (then 50 a minute). To start quiet, mark
the ones more than an hour gone as sent (they stay on the agenda and in the bell, overdue):

```sql
update "ScheduledTask" set "remindSentAt" = now()
where "remind" and "remindSentAt" is null and "doneAt" is null and "archivedAt" is null
  and "dueAt" < now() - interval '1 hour';
```

Watching it:

```sql
select jobid, jobname, schedule, active from cron.job;
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
select status_code, content, created from net._http_response order by created desc limit 10;
```

Stopping it: `select cron.unschedule('scheduled-task-reminders');`

Other schedulers, if pg_cron is not wanted:

- **Vercel Cron: only on a Pro plan.** On Hobby a cron job runs at most once a day, which is useless for reminders.
  On Pro, add `{ "path": "/api/reminders/dispatch", "schedule": "* * * * *" }` to `vercel.json`'s `crons` and
  redeploy; Vercel sends `Authorization: Bearer $CRON_SECRET` itself.
- **Any external cron** (cron-job.org, a server's crontab):
  `curl -fsS -X POST "https://<your-production-domain>/api/reminders/dispatch" -H "x-reminder-secret: $REMINDER_DISPATCH_SECRET"`.
  GitHub Actions' `schedule` is not a fit: five minutes at best, and often late.

### 4. Turn on reminders on your phone

- **iPhone or iPad (iOS 16.4 or later):** web push works **only from the Home Screen app**. In Safari, open the
  production site, tap Share, then **Add to Home Screen**, and open the app from the Home Screen icon (not from
  Safari). Then You › Settings › **Notifications**, switch **On this device** on, and tap **Allow** when iOS asks.
  Settings says "On iPhone and iPad, reminders only work from the Home Screen app…" if it is opened from Safari.
- **Android (Chrome, Edge, Samsung Internet) and desktop browsers:** Settings › **Notifications**, switch **On this
  device** on, and allow notifications when the browser asks. (The installed Android app is the same site: the same
  steps there.)
- Each device is its own: turn it on on every phone and computer that should ring.

### 5. Test it

1. **Settings › Notifications › Send a test** (once a minute): "Sent to 1 device" and a notification within seconds.
   "No device has notifications on yet" means step 4 is not done on this device; "Reminders aren't set up on this
   server yet" means step 2's keys are missing or the deployment predates them (redeploy).
2. **The dispatcher by hand:**
   `curl -i -X POST "https://<your-production-domain>/api/reminders/dispatch" -H "x-reminder-secret: <REMINDER_DISPATCH_SECRET>"`
   answers 200 with the counts below. 401: the secret is wrong or unset; 503: the VAPID keys are missing.
3. **End to end:** on a work tab's Agenda, New › Scheduled task, two minutes ahead, Reminder on. Keep the app open on
   any page: the banner shows at its time. Close the app: within a minute of its time the phone shows the notification,
   and a tap opens the task highlighted on its Agenda. In Supabase, `cron.job_run_details` shows a run every minute.

### What a run answers

```json
{ "claimed": 2, "delivered": 1, "noDevice": 0, "undelivered": 1,
  "pushes": { "sent": 1, "removed": 1, "failed": 0 }, "more": false,
  "nudges": { "considered": 0, "atRisk": 0, "claimed": 0, "delivered": 0 } }
```

`more: true` means the run took its cap of 50; the next minute takes the rest, oldest first.

## Rules the dispatcher keeps

- **At most once.** A run claims (sets `remindSentAt`) before it sends, in one guarded statement that returns only
  the rows it set (`FOR UPDATE SKIP LOCKED`, and the conditions tested again on the locked row), so overlapping runs
  never send one reminder twice. A reminder is never un-claimed: a push service that refuses, a user with no device,
  or a crash after the claim loses that one notification instead.
- **Due** means `remind` on, `dueAt <= now`, `remindSentAt`, `doneAt` and `archivedAt` null, on a work tab that is not
  archived, and its customer (when it has one) not archived. An archived tab's or customer's reminders wait, unclaimed,
  for the restore. `now` is cast to `timestamptz` (the table's own type), so no session time zone is assumed.
- **Moving a task's time ALWAYS clears `remindSentAt`** (`scheduled-tasks.ts remindSentAtAfter`): a moved or snoozed
  task is reminded again at its new time. Anything else (the title, the channel, switching the reminder off and on)
  keeps it, so one time is never pushed twice. Done and archived tasks are never claimed.
- **The in-app banner never claims.** It reads the same tasks and records only on the device (localStorage) what it
  has shown; push and the banner can both remind of one task, once each.
- **Subscriptions clean themselves.** A 404 or 410 from the push service means the browser forgot the subscription:
  the row is deleted. Any other failure stamps `failedAt`; the next delivery stamps `lastUsedAt` and clears it.
- **The text**: title the task's title; body its channel, its customer by name and ID, and the time in the user's zone
  (`14:30` on its own day, else `12 Oct 14:30`; an all-day task "today"). One notification tag per task
  (`scheduled-<id>`), so a newer one replaces an older one on the device. A tap opens `/today/work/<boardId>?task=<id>`.
- **Old links still land.** A notification or bell row from before the change opens `/today?board=<id>&callback=<id>`
  (redirected to `/today/work/<id>?callback=<id>`) or `/today/work/<id>/customers/<customerId>?task=<customerTaskId>`:
  both resolve to the scheduled task backfilled from that call back or customer task (`legacyCallBackId`,
  `legacyCustomerTaskId`).
- **Secrets stay on the server.** The browser gets `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and nothing else; `push-check`
  scans the client modules and `sw.js` for the other names.

## The UI and Settings › Notifications

- A work tab's **Agenda** (`/today/work/<id>`, the Office workspace's home; `src/components/work/AgendaView.tsx`):
  Overdue · Today · Upcoming · Later · Done, each task with Done, Snooze and a tap to edit; New › Scheduled task (the
  work header) adds one. A customer's page lists their own.
- **The bell** (`src/lib/notifications.ts`) lists open scheduled tasks whose time has come, reminder on, as warnings
  ("Scheduled task · Call") linking to the task on its Agenda.
- **Settings › Notifications** turns push on or off on this device with `enablePush()` **from a tap** (Safari only
  prompts inside a user gesture) and `disablePush()`, shows `pushStatus()`'s line (on iPhone and iPad, web push
  works only from the Home Screen app, iOS 16.4+: `ios-install` says how), and sends a test through `/api/push/test`
  (once a minute).
