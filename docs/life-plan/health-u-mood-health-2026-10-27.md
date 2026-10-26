# u-mood-health: what exists for mood, stress, energy, sleep and wellbeing, and where a 5-second check-in belongs

Read-only map, 2026-10-27. Repo `C:/Users/Thanc/OneDrive/Desktop/XTNL-idea` (branch main, 778d6d2 plus an uncommitted review/srs diff that does not touch this area). No database, Prisma, Gemini or env file was touched.

## 0. TL;DR

- **Today the app collects almost no psychology data.** The only mood input is Close the day's 1–5 row (`CloseDaySheet.tsx:133-141`). It is shown only while Duty is live (`TodayBoard.tsx:2094` `live = board.dutyLive`, `:2404`, `:2416`), and `DUTY_LAUNCH_DAY = null` (`duty-economy.ts:59`). So in production it never renders and no REFLECTION mood row is ever written. `docs/capability-summary-2026-10-22.md:85` says the same: "Close the day has no note, mood or Rest tomorrow switch."
- **No stress, energy or sleep field exists anywhere.** The nearest signals are a defer/abort reason chip `LOW_ENERGY` (`task-decisions.ts:51`, `TaskDecision.reasonTag`, schema `:1786-1790`) and `RestDay.kind = SICK` (schema `:869-882`). RestDay is also Duty-gated.
- **`android/.../feel/` is not about feelings.** `Feel.kt`, `Scores.kt` and `ToneSynth.kt` are the app's sound and haptics engine (per-moment haptic scores, synthesized E-major tones). Nothing to reuse for data. It is reusable for the tap's feedback: a check-in should get one soft TICK and no celebration.
- **Health Connect sends walks, hikes and weigh-ins only.** "Never steps, heart rate, sleep or another workout" (`HealthLine.kt:22`; `health-ingest.ts:6`; `docs/mobile-api.md:1006-1012`). The manifest declares only READ_EXERCISE, DISTANCE, ELEVATION_GAINED, WEIGHT and the background read (`AndroidManifest.xml:18-22`, pinned by `HealthManifestTest.kt`). The M4 steps, HR and sleep tables (StepInterval, HrBucket) were never built. `LifeSettings.hrMax` and `birthYear` exist (`schema.prisma:646-647`) but nothing in `src/` reads them.
- **Best homes for a 5-second check-in.**
  - *Phone:* (1) a one-tap row on the cover-screen widget, through the existing offline queue; (2) a row at the top of Check; (3) a local EMA notification with tap targets; (4) a QS tile and a launcher shortcut.
  - *Web:* (1) a capture-line reading ("mood 4 s2"), built exactly like the weigh-in line; (2) a slim one-tap strip in Today's side column; (3) a record-not-reward "Mind" card on Body (`/train`) beside the weight card; (4) Close the day's existing mood row, un-gated from Duty and pointed at the same store.
- **Store it as a record, never a reward.** Copy the BodyWeight / WeightCard model: its own additive table that survives a life reset, xp 0, no streak, no celebration. Use an `ActivityEvent` source only if a migration must be avoided, and then add it to `NEVER_STREAK_SOURCES`.
- **Data to correlate with** (all already stored): review answers per day (count, outcome, time of day, FATIGUED), task ticks, minimum versions, skips, defers and aborts with reasons, focus minutes (TaskSession), the daily quests kept, the momentum run, walks (distance, duration, incline, source), weight trend, Mall purchases, work-tab load, rest and sick days (once Duty is on), and the hour of the day. Missing: sleep, steps, heart rate, HRV. These need new Health Connect permissions, which reverses decision D22's "walks and weight only", so that is the user's call.

---

## 1. Inventory: everything that touches mood, feelings, stress, energy, sleep, wellbeing

| Thing | Where | What it does today | State in prod |
|---|---|---|---|
| Close the day mood 1–5 + one-line note | `src/components/today/CloseDaySheet.tsx:120-158` (buttons `:133-141`, CSS `today.css:614-616` 44 px buttons) | Five unlabeled number buttons "1…5" under "Mood"; tap toggles | **Hidden**: rendered only when `reflection` is passed, which needs `live` = `board.dutyLive` (`TodayBoard.tsx:2094, 2416`) |
| Mood save | `TodayBoard.tsx:2402-2414` → `saveReflection(day, note, mood)` `src/app/actions/rituals.ts:69-88` | Validates `isMood` 1–5, day = today or yesterday-before-04:00 | Never called while Duty is off (`closeDone` checks `live`) |
| Mood rules | `src/lib/rituals.ts:552-597` (`MOOD_MIN=1`, `MOOD_MAX=5`, `isMood`, `reflectionEventInput`) | ActivityEvent `source REFLECTION`, `sink NONE`, `xp 0`, `qty = mood`, `detail = note`, `countsForStreak false`, key `reflection:<day>:<nonce>` (`duty-economy.ts:376`) | Rules exist, no writer runs |
| REFLECTION never makes a streak day | `src/lib/streak-curve.ts:119-126` `NEVER_STREAK_SOURCES` includes REFLECTION | Good precedent | n/a |
| REFLECTION default sink NONE | `src/lib/activity.ts:45` | | |
| Defer/abort reason chip "Low energy" | `src/lib/task-decisions.ts:51-58` `REASON_TAGS` incl. `LOW_ENERGY`; `TaskDecision.reasonTag` (`schema.prisma:1786-1806`); UI `DecisionSheet.tsx:29,128,132` | A real, existing one-tap energy signal, attached to a task decision | Live |
| Rest / Sick / Vacation day | `RestDay` (`schema.prisma:869-882`), `RestKind` (`duty-economy.ts:285-286`) | A declared day kind | Declarations are refused while Duty is inert |
| Review fatigue | `review-fatigue-server.ts:69` counts REVIEW rows a day; /check `review.fatigued` (`docs/mobile-api.md` /check); D26 (`blueprint-plan:644`) "FATIGUED at 200 answers; no sleep rule" | A cognitive-load proxy | Live (behind its own launch) |
| "Feel" package (Android) | `android/app/src/main/java/com/xtnl/app/feel/Feel.kt` (508 lines), `Scores.kt` (79), `ToneSynth.kt` (153) | **Sound and haptics** for moments (tick, clear, correct/miss, forge, session, stamp, work, burn). No emotion data. | Live |
| Health Connect sync | `android/.../health/HealthReader.kt`, `HealthSync.kt`, `HealthSyncWorker.kt`, `core/HealthLine.kt`; server `src/lib/health-ingest.ts`, `health-ingest-server.ts`; route `src/app/api/mobile/v1/exercise/route.ts` | Reads WALKING (79) and HIKING (37) sessions with their own-origin distance and climb, plus weigh-ins. Every 6 h in the background (Android 15+ background read), and on app open at most every 15 min. Batches of 50. | Live; off until the user turns it on |
| Body weight | `BodyWeight`, `WeightGoal` (`schema.prisma:955-1000`), `src/lib/weight.ts`, `weight-server.ts`, `src/app/actions/weight.ts`, `components/train/WeightCard.tsx` | Record-not-reward card on Body (`/train`) | Live |
| Walks | `ExerciseSession` (`schema.prisma:1002-1019`, "Only WALK for now"), `src/lib/exercise.ts:45` `EXERCISE_KINDS = ["WALK"]` | Priced by Momentum §A.6 (`MOMENTUM_LAUNCH_DAY = "2026-10-12"`, `momentum.ts:76`, live) | Live |
| Sleep | none. `blueprint-plan:671` H8: "There is no sleep data"; D30 "sleep never priced"; `mall.ts` refuses sleep as a reward | — | — |
| Steps, HR | none. `dropped.md:14` (steps pay 0); M4 spec (`m4.md`) never shipped; `TaskTemplate.autoMetric` still lists `STEPS`/`WORKOUT` (`schema.prisma:747`) and `ActivitySource` has `STEPS` (`life-types.ts`), with no writer | — | — |

**Psychometric note on the existing mood row.** Bare "1…5" with no anchors is a weak item. The research below suggests anchored, low-burden items.

---

## 2. The Today board, Body and the capture bar

- **Today is the Tasks section only**, by ruling: `TodayBoard.tsx:503-511`. "The three sections (Ideas, Tasks, Body): Today ... shows only the tasks due today ... weight and walks on Body (/train)." What is due elsewhere is one slim strip, `due-elsewhere.ts` (`ElsewhereKind = "reviews" | "quests" | "bosses" | "weigh-in"`, line 42). The weigh-in item links to `/train`.
  - Rules in that file: "Never a count in the nav, never an Ask, never red: due is ink."
  - Each row is a link out, so it costs at least 2 interactions. That is too many for a 5-second write, unless the strip itself takes the tap (see §7).
- **There is no "body lane" on Today.** Lanes are `must | today | yesterday | anytime` (`today-board.ts:142`), placed as Must, Planned, Habits, Anytime, Inbox, Goals and Done.
- **Body (`/train`, `src/app/train/page.tsx`)** shows the WeightCard, then "Walking · this week" with "Log a walk" (`/train/exercise`). The header comment says: "No new data: what Body tracks is what it logs, weight and walks." A Mind card is a natural third card here.
- **Capture bar.**
  - Tags: `#body #duty #craft #care #short #mid #long #play` (`capture-parse.ts:993`), `#proof` (`:996`), `#side` (`:998`), plus spoken "tag body".
  - Modes: TASK | IDEA | GOAL (`life-types.ts:369`). A whole-line weigh-in ("weight 72.4", "w 72,4kg", "cân 72.4") is caught before task parsing and logged as a record, never a task (`components/capture/weight-capture.ts:1-41`). It has a chip that turns back into text (the escape hatch), parity between sheet and server, Undo, and a "same value = duplicate" rule.
  - **That file is the exact template for a mood/stress line** ("mood 4", "m4 s2 e3", "stress 3"). A `#mood` tag would be wrong: tags modify a task, while a check-in is a whole-line record like a weigh-in.
- **Tap budget.** `scripts/ingest-budget-check.ts` (in `ui:check`) pins: a tick is 1 interaction, a done-now line is ≤ 3 presses (open + line + Enter), the Android quick check is ≤ 2 taps from the launcher, and a widget tick is 1 tap. A check-in should be pinned the same way: 1 tap on the widget, Check and the web strip; ≤ 3 presses for the capture line.

---

## 3. The weight card as the model of a record-not-reward card

The rules to copy (`weight.ts:1-26`, `weight-server.ts:1-35`, `actions/weight.ts:15-30`, `WeightCard.tsx:1-20`, schema comment `:948-952`):

1. **Never a reward.** No XP, MP, streak, celebration or ledger row, and "none of the economy files import this". For mood this matters more than for weight: paying for logging teaches logging, and paying for *good* moods teaches lying. The blueprint's own H5 (overjustification, Deci et al. 1999) points the same way.
2. **One reading per life day** for weight (`@@unique([userId, day])`). For mood, **don't** copy this: momentary EMA wants several readings a day keyed by instant and clientId. A daily summary is derived on read.
3. **The trend, not the point.** The card leads with an exponentially smoothed trend, because one morning swings. For mood use a 7-day rolling mean and a diurnal view, and show "calibrating" until there are enough points (weight uses `MIN_READINGS_FOR_RATE = 5`).
4. **Fail-soft reads.** A missing table reads as the empty view. Writes return `{ok:false,error}` and never throw. There is a cache tag ('weight') and `refresh: true` for the route.
5. **Untrusted input re-checked in the action and again in the core.** Range clamp; the day is a real life day, not future, at most a year back.
6. **Import never overrides a manual reading** (`importReplaces`). Relevant if a future Health Connect "mindfulness" or sleep import ever lands.
7. **Survives a life reset.** `reset.ts:44-46` keeps avatar readings "like a weigh-in, and no reset clears one". BodyWeight is not in `lifeDeleteOp`, but `activityEvents` are deleted wholesale (`reset.ts:43`).
   - **So mood stored as ActivityEvent rows would be wiped by a 'life' reset; a dedicated table survives.** This is the strongest argument for a table over a new ActivityEvent source.
8. **Capture-line entry with an escape hatch and Undo** (`weight-capture.ts`).
9. **The phone sends it through `/log` `section: "weight"`.** It is a LogSection (`LogPreview.kt:6-14`).

---

## 4. Phone: the paths that avoid opening the app

| Surface | File | What it does | Reuse for a check-in |
|---|---|---|---|
| Cover-screen widget | `widget/TodayWidget.kt` (Glance 1.1.1), `widget/WidgetTick.kt`, `core/WidgetRows.kt`, `res/xml/today_widget_info.xml` | 4×2 cells on the Fold cover (about 475 dp wide), min 250×110 dp, responsive sizes. 48 dp row targets (`WidgetRows.ROW_DP`). A row's tick is an `ActionCallback` that enqueues a `QueuedWrite` and kicks the queue: no dialog, no screen | **Best 1-tap path.** Add a check-in strip (5 × 48 dp = 240 dp fits the width) or a separate small "Check in" widget (its own `GlanceAppWidgetReceiver`). Its `ActionCallback` enqueues a new queue kind |
| Offline queue | `data/SendQueue.kt`, `data/SendWorker.kt`, `core/SendLine.kt` | On-disk JSON queue keyed by clientId. Each item carries its own life day, fixed at the tap. WorkManager sends it when online, with backoff (30 s doubling); 8 server-fault tries; 200 max. **Only three kinds wait: TICK, LOG, WORK_DONE** (`SendLine.kt:12, 29-37`); "review answers never queued". `QueuedWrite` already has optional fields per kind | Add `Kind.CHECKIN("/checkin")` with fields (valence, energy, stress, atMs). It suits a queue even better than `/log`: the item should carry its instant `at`, so a late send still books when it was felt. The server takes any `at` within a window (`/log` has no day; old-day lines are kept back) |
| Quick-settings tile | `tile/LogTileService.kt` | "Log a task" opens `xtnl://app/log?section=task`; `unlockAndRun` on the lock screen | A second tile "Check in" that opens a small dialog-styled activity (5 faces, plus optional stress). 2 taps. A tile can't take an inline value, so it must open something |
| Launcher shortcuts | `res/xml/shortcuts.xml` (check, task, idea, review) | Deep links handled in `ui/Nav.kt:63-80` | Add `xtnl://app/checkin` (and `log?section=mood`) |
| Check screen | `ui/check/CheckScreen.kt` (2188 lines). LazyList order: header → notSent → tasks → owed → yesterday → review → week → calibration → condition → quests → work (`:631-641`) | The app opens on Check (Nav's first tab) | A one-row "How are you?" strip right after the header: 1 tap. Feedback is one soft TICK from `Feel`/`Scores` (a new `Scores.checkIn`), never a moment: "A sync is never a moment" (mobile-api.md /exercise) |
| Log tab | `ui/log/LogScreen.kt`, `LogViewModel.kt`, `core/LogPreview.kt` | Sections Task / Weigh-in / Idea | A fourth section "Mood" for the line grammar, as WEIGHT is |
| Local notification | `notify/AuditReminder.kt`, `core/AuditAlarm.kt`; manifest `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED` | One AlarmManager alarm (Sunday 19:00 Sydney), re-armed at boot and update, gated by a Settings toggle and a server flag. **There is no server push to the phone (no FCM).** Memory says "phone push/notifications are not in the native app yet" beyond this | Clone it as a check-in reminder: one to three prompts a day in user-set windows, semi-random inside each window (EMA signal-contingent). A notification allows **at most 3 action buttons**, so either Low / OK / Good actions or a `DecoratedCustomViewStyle` RemoteViews with 5 tap targets. Its `BroadcastReceiver` enqueues into SendQueue without opening the app |
| Health Connect settings | `ui/more/HealthConnectSettings.kt`, `health/HealthRationaleActivity.kt` | Rationale copy for the read permissions | Any new read (sleep, HR, HRV, steps) needs new manifest permissions, new rationale words, the `HealthManifestTest` re-pin and `HealthLine.REQUIRED`/`asked` changes. The client is `androidx.health.connect:connect-client:1.1.0-alpha10` (`app/build.gradle`) |

The Android stack has no Wear OS module. Fold 8 cover ≈ 475×751 dp (memory: android-fold-app).

---

## 5. Notifications and reminders (EMA prompts)

- **Web push.**
  - Pieces: `src/lib/push-server.ts` (payload `{title, body, tag, url}`, VAPID, endpoint allow-list), `public/sw.js` (109 lines; shows a notification and focuses or opens its URL), `src/lib/reminders-server.ts` (every-minute dispatcher: scheduled-task reminders, then the **momentum evening nudge** 20:00–22:00 Sydney).
  - The nudge claims `nudge:<day>` (a NUDGE ActivityEvent row) before sending, is at most one a day, and is gated by `UserPrefs.nudge` (`schema.prisma:939`) and `MOMENTUM_LAUNCH_DAY`.
  - **An EMA prompt on the web fits the same run:** a `UserPrefs.checkin` pref (on | off | windows), a claim row per prompt, at most N a day, never after 22:00.
  - sw.js has no notification `actions` today. Adding `actions` would allow a 1-tap answer from the desktop notification: a `notificationclick` with `event.action` POSTs to `/api/checkin` from the service worker.
- **Shell bell** (`src/lib/notifications.ts`): derived, read-only notices ("Anything with a deadline should come to you"). A check-in is not due and has no deadline, so the bell is a poor home. Never make it an Ask or red.
- **Phone:** only the local AuditReminder alarm (above). There is no FCM, so phone EMA must be local alarms. That is fine: it is private and works offline.

---

## 6. The mobile API contract (`src/app/api/mobile/v1`, `src/lib/mobile-api*.ts`, `docs/mobile-api.md`)

- **The routes** (21): check, exercise, ideas/meta, ideas, log, log/undo, mall (+buy, rewards, undo), quests, review/answer, review/queue, status, tasks/complete, makeup, start, stop, undo, work/done, work/reopen.
- **The pattern.**
  - Each route file is a thin `POST` that calls a handler in `mobile-api-server.ts` with `realMobileDeps` (`mobile-api-cores.ts`). Pure shape checks live in `mobile-api.ts`, and `scripts/mobile-api-check.ts` drives them with fakes (see `exercise/route.ts`).
  - Contract rules (`docs/mobile-api.md:8-56`): optional Bearer `MOBILE_API_TOKEN`, `{ok,data}` / `{ok:false,error,code}`. Unknown fields are refused (400); body ≤ 256 KB. `clientId` gets a 10-minute per-instance replay cache, and the cores keep their own guards. Days are Sydney life days turning at 04:00, and `now` is the server's clock.
- **The live-only write gate.** `lifeWritesEnabled` (`life-economy.ts:883-887`): production, or `XTNL_LIFE_JUDGE=1`. A dev server answers 409 for Health Connect imports (`HC_WRITES_OFF`, `health-ingest.ts:288`), because dev and prod share one database. A check-in writer needs the same gate, or must be rehearsal-only, since dev writes would land in the live account.
- **What a check-in route would look like.**
  - `POST /checkin {at, valence?, energy?, stress?, tags?, note?, source: "widget"|"check"|"tile"|"notify"|"log", clientId}`.
  - It returns `{id, day, line, undo}`, and `/log/undo` gains a kind `checkin` (or `/checkin/undo`).
  - `/check` gains `checkin: {last: {at, valence, stress, energy} | null, today: n, prompt: bool}`, so the widget and Check can show "logged 14:05" and grey the strip for a short cooldown.
  - The phone's `DemoApi.kt` (1341 lines) must answer it too, since demo data answers on the phone.

---

## 7. Where the 5-second check-in should live

**Item design (§10 has the research).**
- Tap 1 is required: **pleasantness × energy in one tap**, a 3×3 grid on the phone widget and Check, 5×5 or 3×3 on the web (Russell's Affect Grid, the Mood Meter). Falling back to a 5-face pleasantness row is fine.
- Tap 2 is optional: **stress 0–4**, a single anchored item.
- Optional chips, only for what the app can't see: "slept badly", "unwell", "social", "conflict". The app already knows walks, tasks and reviews.
- Target ~2 s for tap 1 and ≤ 5 s for both.

**Web.**
1. **The capture line**, a whole-line reading like a weigh-in: `mood 4`, `m4 s2`, `stress 3`, `e2` (Vietnamese too, as weight has `cân`). It gets a chip, an escape hatch, Undo, and parity between sheet and server. It costs 3 presses (`c`, the line, Enter), matching `DONE_NOW_BUDGET`. Files: new `components/capture/checkin-capture.ts` mirroring `weight-capture.ts`; the `createFromCapture` branch; a `mobile-api.ts` `/log` section `mood`.
2. **Today's side column**, a slim one-tap strip in the DueElsewhere slot (an `elsewhere`-like prop, drawn first in the side column, `TodayBoard.tsx:216-221`). The strip itself takes the tap (faces inline); it is not a link. It needs a ruling, because Today is "Tasks only". Precedent: the weigh-in item lives there as a link.
3. **A Body "Mind" card** on `/train` beside the WeightCard. It holds the trend, today's points, the time-of-day pattern and correlations (§8), and is never graded. Rename Body to "Body & mind", or keep "Body" with a Mind card (a copy decision).
4. **Close the day.** Un-gate the mood row from Duty (it is "never graded" and needs no settlement), give its five buttons anchors, and write it to the same store as an end-of-day reading (`kind: "day"`). Today the whole reflection block is gated with Duty.
5. **Optional, event-contingent:** a one-line "energy now?" after a review session ends. It pairs with FATIGUED and review accuracy. Keep it skippable and never modal.

**Phone (Fold 8).**
1. **The cover widget's one-tap strip**, through `SendQueue` `Kind.CHECKIN`. It works offline and opens nothing. It is the true 5-second action from the cover screen.
2. **Check, right under the header**, as a one-tap row.
3. **A local EMA notification** (an AuditReminder clone). The user sets windows; prompts land at a random time inside each window, 1–3 a day, never 22:00–07:00. The notification carries tap targets that enqueue directly.
4. **A QS tile "Check in" and a launcher shortcut** opening a dialog activity: 2 taps.
5. **The Log section "Mood"** for typed lines.

**Data model.**
- Preferred: a new additive table, e.g. `MoodCheck`.
  - Columns: `id`, `userId`, `day` @db.Date, `at` timestamptz, `valence` Int? (1–5 or −2..2), `energy` Int?, `stress` Int? (0–4), `tags` text[], `note` String?, `kind` (`moment` | `day`), `source` CHECK IN ('web','phone','widget','tile','notify','capture'), `clientId` @unique per user.
  - Indexes `(userId, day)` and `(userId, at)`.
  - It is a record, never a reward, survives a life reset, and gets a fail-soft reader (as weight does).
  - The migration follows the house rule: hand-authored, additive, rehearsed on local Docker, with the Supabase ref checked first.
- No-migration fallback: ActivityEvent `source: "CHECKIN"`, `sink NONE`, `xp 0`, values in `receipt {v:'checkin-1', …}`, key `checkin:<clientId>`.
  - It must be added to `NEVER_STREAK_SOURCES`, otherwise a mood tap could keep the streak or momentum run.
  - It must be added to `DEFAULT_SINK` (`activity.ts:32-70`) and the `ActivitySource` union (`life-types.ts:121+`).
  - Downside: a life reset wipes it.
- Either way: never priced, never in the knee, never in the audit rate, never a Today's-three quest, never a Mall reward, never a side-quest detector input (H14: don't stack punishment on a bad week).

---

## 8. Data already stored that a check-in can be correlated with

| Signal | Source | Granularity | Notes |
|---|---|---|---|
| Review volume, accuracy, time of day | `ActivityEvent` source REVIEW (`srs.ts:366-367`: `occurredAt`, `xp`, `detail` "advanced · L3→L4" / "strike…" / "retry…") | per answer | Same-day accuracy vs mood, and late-night reviews vs next-day energy |
| Review fatigue | `review-fatigue-server.ts` (≥ 200 answers a day → FATIGUED) | per day | |
| Task ticks: full vs minimum vs skipped | `TaskInstance.status` (DONE / DONE_MVV / SKIPPED …), ActivityEvent TASK rows with receipts (band, minutes, crit) | per tick | Share of the minimum version used is a good low-energy proxy |
| Defers and aborts with reason | `TaskDecision` (`kind`, `reasonTag` incl. LOW_ENERGY, NO_TIME, BLOCKED) | per decision | An existing self-report of energy |
| Focus minutes | `TaskSession` (startedAt, endedAt, minutes, source web/phone) | per session | Deep-work time vs stress |
| Daily quests kept, momentum run, Today's three, chest | ActivityEvent momentum rows (QUEST_SET, CHEST, NUDGE …), `daily-quests.ts` | per day | Show "mood on kept vs missed days" in neutral words only, never as a lever |
| Walks | `ExerciseSession` (distance, duration, angleDeg, note "Walk · Health Connect"), WORKOUT/PR rows | per session | The classic correlate (mood and energy after a walk day) |
| Weight | `BodyWeight` (daily), trend in `weight.ts` | per day | Weak link; show only on request |
| Mall purchases | ActivityEvent MALL_BUY / MALL_REFUND | per purchase | Possible stress-spend signal; sensitive, so off by default |
| Work load | `ScheduledTask` done/overdue, `CustomerInteraction`, CallBack (work tabs, /check `work`) | per item | Work stress |
| Rest / sick / vacation | `RestDay` | per day | Only once Duty is live |
| Week audit rate | ActivityEvent AUDIT rows, `week-audit.ts` | per week | Behind `AUDIT_LAUNCH_DAY` (null) |
| Hour of day, weekday | the check-in's own `at` | — | The diurnal pattern is the first useful insight |
| **Missing** | sleep (SleepSessionRecord), steps (StepsRecord), resting HR, HRV (RMSSD) | — | Not read. They need new Health Connect permissions and rationale, and **reverse D22's "walks and weight only"**. Health Connect has no mood or stress record type, and Samsung Health's own stress score is not expected to reach Health Connect (verify on the device). A sleep question can stand in until then: a "slept badly" chip or a morning "sleep 1–5" item |

Correlation rules worth fixing early:
- At least 14 days and at least 20 check-ins before any "on days you X, mood was Y" line.
- Show effect size and n, and say "goes with", never "causes".
- Never alter pay, quests or calibration from mood data.

---

## 9. Constraints (with evidence)

1. **Record, never reward.** No XP, MP, credits, streak or celebration from a check-in. Precedent: `weight.ts:1-3`, `weight-server.ts:22-23`, `rituals.ts:579-597` (REFLECTION xp 0, sink NONE, countsForStreak false), `blueprint-plan:668` H5 and `:671` H8.
2. **A check-in source must never make a day active.** Add it to `NEVER_STREAK_SOURCES` (`streak-curve.ts:119`), as REFLECTION is.
3. **Launch gating.** Anything that changes the live account ships inert behind a `*_LAUNCH_DAY` constant (null) and flips only on the user's direct go. Evidence: `duty-economy.ts:59`, `side-quests.ts:84`, `week-audit.ts:77`; memory "launch-switches". The user's request says "You have all right regard this new feature", but the memory rule still says to ask before flipping a live switch. A pure record (no pay) may not need a gate; confirm with the lead.
4. **Dev and prod share one database.** Writers need `lifeWritesEnabled` (`life-economy.ts:883`), as health ingest does (`health-ingest-server.ts:128`). Verify on local Docker rehearsal only, and never act on the live account (memory "roadmap-rework").
5. **Additive, hand-authored migrations only.** The latest is `20270102000000_proof_qty`, and the plan reserves `20270103000000_strength_sets` (P25, `blueprint-plan:26`). Check the Supabase ref before applying (memory "supabase-project-isolation").
6. **Mobile contract.** Unknown fields are refused; `clientId` replay; the reply shape is `{ok,data}`; each route needs a fake-driven `mobile-api-check` case. Only queue-safe writes may wait on the phone. A check-in qualifies if keyed by clientId with its own `at` (`SendLine.kt:12-37`).
7. **Tap budget pinned by `scripts/ingest-budget-check.ts`.** Add check-in pins: 1 tap on the widget and Check, ≤ 3 presses for the capture line.
8. **Today is "Tasks only"** (`TodayBoard.tsx:503-511`, `due-elsewhere.ts:1-21`). A check-in strip on Today needs that ruling extended. Never an Ask, never a count, never red.
9. **The capture parse is mirrored.** The sheet and the server run one function, and the phone's `LogPreview.kt` mirrors the common grammar. A mood line must be a whole-line reading with a chip escape hatch (weight-capture precedent) and must not collide with task words: "mood board", "stress test" and "energy bill" must stay tasks. Use the weight rule, which only triggers when the whole line is a reading.
10. **Health Connect reads are opt-in, read-only and enumerated.** New permissions mean manifest, `HealthManifestTest`, `HealthLine.REQUIRED`/`asked`, the rationale copy, and a user decision reversing D22 (`HealthLine.kt:14-22`, `docs/mobile-api.md:1006-1012`).
11. **No new Gemini calls** for mood (house rule; memory: Gemini only with approval). Any "insight" text must be deterministic copy.
12. **UI snapshots.** After any UI change, screenshot at 344 px first (memory "ui-change-snapshots"). System-novel style without Chinese characters (memory "system-novel-ui-style").
13. **Next.js 16 differs from training data.** Read `node_modules/next/dist/docs/` before writing routes and actions. For example, `refresh()` from `next/cache` is used in the actions (`actions/weight.ts:3`).

---

## 10. Research grounding for "a 5-second psychology action" (brief)

- **EMA (ecological momentary assessment).** Shiffman, Stone & Hufford, *Annu Rev Clin Psychol* 2008. Brief, repeated, in-the-moment reports beat end-of-day recall, which is biased by peak and end moments. Compliance falls with item count and prompt frequency, so use 1–3 items and 1–4 prompts a day. Mix signal-contingent prompts (random inside windows) with event-contingent ones (after a session or a walk) and allow self-initiated entries (widget, line).
- **Affect Grid.** Russell, Weiss & Mendelsohn, *JPSP* 1989. A single-item 9×9 grid of pleasure × arousal, built on Russell's circumplex (1980). One tap gives two dimensions, which is ideal for 5 s. The Yale Mood Meter (four colour quadrants) and Apple Health's State of Mind (iOS 17: a 7-point very unpleasant → very pleasant scale, plus optional labels and "what's affecting you") are consumer versions. A 3×3 grid suits 48 dp targets on the cover widget.
- **Single-item stress.** Elo, Leppänen & Jahkola, *Scand J Work Environ Health* 2003, validated a one-item stress-symptom measure against longer scales. An anchored 0–4 item ("not at all … very much") is enough for tracking.
- **Energy / vitality.** A single "How much energy do you have right now?" item is standard in EMA fatigue work. On the grid, arousal covers it.
- **Affect labelling.** Lieberman et al., *Psychological Science* 2007 ("Putting feelings into words"). Naming a feeling dampens its intensity, so an optional one-word label chip after the tap has value of its own. Keep it optional to stay within 5 s.
- **What to avoid.**
  - Clinical screeners (PHQ-9/GAD-7) as gamified items: the app is not clinical, and scoring them invites mis-diagnosis.
  - Rewarding the logging of *good* states.
  - Showing mood beside XP or streaks.
  - Prompts after 22:00 or during focus timers (a running `TaskSession`).

---

## 11. Risks

- **The gating trap.** Wiring the new check-in into Close the day without un-gating repeats today's dead path: mood UI exists but never renders because `DUTY_LAUNCH_DAY` is null.
- **Streak leak.** A new ActivityEvent source not added to `NEVER_STREAK_SOURCES` would let a mood tap count as an active day, keeping the momentum run or streak. That is perverse and breaks "showing up = doing".
- **Reset wipe.** Mood stored in ActivityEvent is deleted by the 'life' reset (`reset.ts:43`), unlike weight.
- **Perverse incentives.** Any XP, credits or quest for check-ins (or for good moods) corrupts the data. Correlations displayed next to pay invite gaming.
- **Shared DB.** A dev or preview server writing check-ins lands them in the live account unless gated by `lifeWritesEnabled`.
- **Notification fatigue.** Too many EMA prompts lowers compliance and annoys. The Android cap is 3 action buttons, and 5 buttons need custom RemoteViews (test on the Fold cover and in the notification shade). Exact alarms need `SCHEDULE_EXACT_ALARM` (Android 14+ asks).
- **Capture-parse collisions.** "mood board", "stress test", "energy drink", "feel better" must stay tasks. The whole-line rule and the chip escape hatch mitigate this, and the parity checks (`capture-parse-check`, `weight-capture-check`, `mobile-api-check`) must be extended.
- **Health Connect scope creep.** Reading sleep, HR or HRV reverses D22 and adds sensitive data. It needs user consent, a rationale-screen rewrite and manifest test re-pins. `connect-client` is an alpha (1.1.0-alpha10), and feature availability (background read, any mindfulness record) varies by device.
- **Sensitive data.** Mood and stress are health data in a single-user app whose API is open when `MOBILE_API_TOKEN` is unset (`docs/mobile-api.md:9-11`; memory: the token was "still open"). Confirm the token is set before shipping a mood endpoint. Keep mood out of URLs and query strings.
- **Stale docs to fix while there.**
  - The `ExerciseSession` schema comment says "nothing in the economy reads them", but Momentum now prices walks.
  - `capability-summary:142` says "There is no Health Connect import", but P27 shipped.
- **The Today "Tasks only" ruling.** A Today strip needs the user's or lead's ruling, otherwise only Body, the capture line and the phone are in scope.
- **Demo parity.** `DemoApi.kt` must answer `/checkin` and `/check.checkin`, or the demo crashes or diverges.

---

## 12. Files that matter

- `src/lib/rituals.ts` (552-597): mood constants and the REFLECTION row shape
- `src/app/actions/rituals.ts` (65-88): `saveReflection`
- `src/components/today/CloseDaySheet.tsx` (120-158) and `TodayBoard.tsx` (2094, 2385-2430): the hidden mood UI and its Duty gate
- `src/lib/duty-economy.ts` (59, 285, 376): `DUTY_LAUNCH_DAY` null, RestKind, reflectionKey
- `src/lib/streak-curve.ts` (119-140): `NEVER_STREAK_SOURCES`
- `src/lib/activity.ts` (32-70): `DEFAULT_SINK`
- `src/lib/life-types.ts` (121+, 369): ActivitySource, CaptureMode
- `src/lib/task-decisions.ts` (51-58): the `LOW_ENERGY` reason
- `prisma/schema.prisma`: ActivityEvent 667, RestDay 869, UserPrefs 925 (nudge 939), BodyWeight 955, WeightGoal 976, ExerciseSession 1002, TaskDecision 1786, TaskSession 2098, LifeSettings hrMax/birthYear 646-647
- `src/lib/weight.ts`, `weight-server.ts`, `app/actions/weight.ts`, `components/train/WeightCard.tsx`, `components/capture/weight-capture.ts`: the record-not-reward and capture-line templates
- `src/app/train/page.tsx`: Body, the home for a Mind card
- `src/components/today/due-elsewhere.ts`: the "elsewhere" strip and its rules
- `src/lib/capture-parse.ts` (956-998): tags; `MAX_CAPTURE_CHARS`
- `src/lib/health-ingest.ts`, `health-ingest-server.ts` (128 gate), `src/lib/life-economy.ts` (883 `lifeWritesEnabled`)
- `src/lib/mobile-api.ts`, `mobile-api-server.ts`, `mobile-api-cores.ts`, `src/app/api/mobile/v1/*`, `docs/mobile-api.md`
- `src/lib/reminders-server.ts`, `push-server.ts`, `public/sw.js`: web push and the momentum nudge (an EMA prompt template)
- `src/lib/notifications.ts`: the bell (not a home for check-ins)
- `scripts/ingest-budget-check.ts`: the tap-budget pins
- Android:
  - `feel/Feel.kt`, `Scores.kt`: sound and haptics only
  - `health/*`, `core/HealthLine.kt`
  - `widget/TodayWidget.kt`, `WidgetTick.kt`, `core/WidgetRows.kt`, `res/xml/today_widget_info.xml`
  - `data/SendQueue.kt`, `SendWorker.kt`, `core/SendLine.kt`
  - `tile/LogTileService.kt`
  - `notify/AuditReminder.kt`, `core/AuditAlarm.kt`
  - `res/xml/shortcuts.xml`, `ui/Nav.kt`
  - `ui/check/CheckScreen.kt`, `ui/log/*`, `core/LogPreview.kt`
  - `data/DemoApi.kt`
  - `AndroidManifest.xml` (18-22), `app/build.gradle`
- Docs: `docs/life-plan/dropped.md` (4: the strength grammar deferred; 14: steps), `blueprint-plan-2026-10-22.md` (P25 at 518: strength sets; P27; H5, H8, H14, H17; D22, D26), `capability-summary-2026-10-22.md` (85, 189)
