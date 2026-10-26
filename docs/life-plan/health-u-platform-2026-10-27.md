# u-platform: rules a new tracked feature (mood/stress check-in, strength logger) must follow

Read-only survey of `C:/Users/Thanc/OneDrive/Desktop/XTNL-idea` on 2026-10-27 (main at 778d6d2, with uncommitted
edits from another session; see Risks). No DB, prisma, Gemini or secrets were touched.

---

## 0. Corrections to the "known so far" brief

1. **Momentum is LIVE, not inert.** `src/lib/momentum.ts:76` reads
   `export const MOMENTUM_LAUNCH_DAY = "2026-10-12"` ("Launched 2026-10-12 (the user's go: "Launch today")").
   Today a walk dated today or yesterday already pays BODY XP through the daily knee. It writes a WORKOUT row
   (`workout:<sessionId>`), PR rows (`pr:WALK:<metric>:<week>`) and "Counts as" habit links, and a same-day delete
   writes reversals (`src/lib/exercise-server.ts:18-31`). "A record, never a reward" still holds for **weight**
   (`src/lib/weight-server.ts:23-24`, schema comment at `prisma/schema.prisma` "Body weight" block). For **exercise**
   it held only before the momentum launch. A new exercise kind that pays therefore takes on the whole momentum
   pay contract (section 4).
2. **No mood is captured in production today.** Mood is the Close-the-day REFLECTION row: an ActivityEvent with
   source REFLECTION, sink NONE, xp 0, qty = mood 1-5, detail = note, key `reflection:<d>:<nonce>`
   (`src/lib/rituals.ts:552-596`, `src/app/actions/rituals.ts:65-85`). The sheet's note and mood only show while
   Duty is live: `src/components/today/TodayBoard.tsx:2094` (`const live = board.dutyLive`), with saves at :2404 and
   :2416. `DUTY_LAUNCH_DAY` is null (`src/lib/duty-economy.ts:59`). `docs/capability-summary-2026-10-22.md` item 2
   says the same ("Close the day's note and mood" is part of the Duty economy, which is off). Nothing reads
   `REFLECTION.qty` back: grep finds REFLECTION only in rituals, activity (sink table), life-types, streak-curve
   (never-streak) and duty-economy (keys).
3. **Health Connect ingest is shipped and off by default.** It covers walks, hikes and weigh-ins only: `src/lib/health-ingest.ts:1-30`,
   `POST /api/mobile/v1/exercise`, Android `health/HealthSyncWorker.kt`, `connect-client:1.1.0-alpha10`.
4. **The strength logger is already a planned phase.** Blueprint P25 "Strength volume [migration `strength_sets`]
   (optional)" (`docs/life-plan/blueprint-plan-2026-10-22.md:518-521`, timestamp `20270103000000_strength_sets` at :26).
   It reverses a deliberate deferral (`docs/life-plan/dropped.md:4`: set grammar and e1RM PRs were deferred because
   "sets are not in Health Connect and the manual weight PRs cannot be checked for plausibility"). Decision D21 says
   "strength and commits only on request" (:639), and the user has now requested it. The harm table's H17 gives the
   safe variant: "sets above 2x the user's best are unpaid until confirmed" (:680).

---

## 1. Migration procedure (additive only)

Sources: `docs/life-plan/data-model.md:3-9` (conventions) and `:713-727` (PROCEDURE),
`docs/life-plan/PROGRESS.md:64-69` (standing rules), `docs/life-plan/blueprint-plan-2026-10-22.md:21-30` (rule 3),
memory `supabase-project-isolation`.

Conventions for every new table (`data-model.md:3-9`):
- `id TEXT cuid()`, `userId String` with an index, `@@schema("public")`. No foreign keys: every recent table uses plain
  TEXT ids (`20261231000000_mall` header).
- Kinds, sources and reasons are TEXT typed by TS unions. Never add a Postgres enum. Recent migrations add hand-written
  `CHECK` constraints and name them in a `///` comment on the model, because Prisma 6 cannot declare them. A later
  `migrate diff` proposal to drop them "must be deleted, never applied" (mall, avatar_targets, proof_qty headers).
- A life-day column is `@db.Date`, produced only by `life-day.ts dateColumn(key)`. The day turns at 04:00
  Australia/Sydney.
- New timestamp columns are `TIMESTAMPTZ(3)` ("Every timestamp is timestamptz": avatar_targets and mall headers).
- "Nothing that exists today is altered": no DROP, RENAME or retype, and no backfill. Nullable columns with no default
  are fine (proof_qty). Relaxing a NOT NULL on `ExerciseSession.distanceKm` would be an ALTER of an existing column.
  Avoid it (section 4).
- Each migration's header comment says what it adds, that it is additive only, the target ref, the apply commands, and
  that deployed code tolerates its absence. Wrap it in `BEGIN; … COMMIT;` (recent ones do).

PROCEDURE (`data-model.md:713-727`):
1. Edit `prisma/schema.prisma`.
2. Draft the SQL with `npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script`.
   Only the lead may run this, never a subagent (PROGRESS.md:65).
3. Delete `DROP INDEX "Idea_embedding_hnsw_idx"`, any `CREATE INDEX` that already exists, and any DROP of
   `Roadmap_userId_slot_open_key`, `Roadmap_userId_createKey_key` or `Roadmap_slot_…`. Keep only this migration's
   statements and add the header.
4. Rehearse on the local Docker mirror `xtnl-rehearsal` (pgvector pg16, port 55432). Confirm the
   "Datasource … at localhost:55432" line first (PROGRESS.md:66-67).
5. Confirm the Supabase ref in DIRECT_URL is **xvlkujmtdcpaoxdftgpl (xtnl-idea)**, never `zhuqmqzxukuwdanpnygx`
   (XTNL_thesis). Parse it out of the URL: a host check is not enough, because both sit behind pooler.supabase.com.
6. `npx prisma db execute --file prisma/migrations/<name>/migration.sql --schema prisma/schema.prisma`
7. `npx prisma migrate resolve --applied <name>`
8. `npx prisma generate`. Stop the dev server first and delete `node_modules/.prisma/client` `.tmp` leftovers
   (PROGRESS log 2026-10-04).
9. Deploy the code only after that.
- Never run `npm run db:migrate` (that is `prisma migrate dev`), `migrate reset` or `db push`.
- Pre-approval: the user pre-approved additive migrations once they pass locally (PROGRESS.md:69). The 2026-10-27
  memory `health-psych-exercise` extends that to this feature ("additive migrations (still with the Supabase ref
  check)").

Timestamps. The last migration on disk is `20270102000000_proof_qty`. P25's reserved name is
`20270103000000_strength_sets`. A mood table would take the next free stamp, e.g. `20270104000000_<name>`. Note that
Supabase's `_prisma_migrations` has missed rows before (PROGRESS log 2026-10-11; capability-summary item 7), so run
`migrate status` before applying.

### Migration name and model landmines in the existing checks
- `scripts/health-ingest-check.ts:423-428` requires that **no migration name matches `/health|ingest|hc_|connect/i`**
  and that `model ExerciseSession` contains neither `source` nor `externalId`. A migration called `health_checkin`,
  or a `source` column on ExerciseSession, breaks life:check. Either name it something else (e.g. `mind_checkins`,
  `strength_sets`) or re-pin that check on purpose.
- `scripts/week-audit-check.ts:453`: no migration name matching `/audit/i`.
- `scripts/mobile-api-check.ts:3962`: no migration name matching `/mobile/i`.
- `scripts/roadmap-contract-check.ts:660-670`: no migration name containing `roadmap` out of order.
- `scripts/exercise-style-check.ts:205-206` pins the 20261201 migration (CREATE TABLE only). It does not stop a new
  migration, but a new ExerciseSession column would need its schema pins reviewed.

---

## 2. Fail-soft reads of new tables

The pattern is in 34 files (grep `isMissing\w*Table|P2021|missing table`). Two canonical helpers:

- `src/lib/exercise-server.ts:126-130`, `isMissingExerciseTable(err)`: true on Prisma `P2021`, or a message matching
  `/\b(P2021|42P01)\b|(relation|table) [`"][^`"]*ExerciseSession[`"]? does not exist/i`.
- `src/lib/weight-server.ts:71-77`, `isMissingTable(err)`, the same shape for `BodyWeight|WeightGoal`. It logs a
  missing table once per process and any other error every time.
- A missing column (an added column on an existing table) uses `P2022`/`42703`: `src/lib/competency-server.ts:148`,
  and `isMissingRev4Column` in `roadmap-types.ts`.

Rules a new module follows:
- **Every read** catches the missing-table error and returns the empty view, with `ready: false`
  (`ExerciseView.ready`, exercise-server.ts:107-108). The card then says why instead of failing on save.
- **Every write** returns `{ ok: false, error }` and never throws. When the table is missing, the line is plain:
  `EXERCISE_NOT_READY = "Exercise logging needs a one-time database update first."` (exercise-server.ts:102) and
  `"Weight tracking isn't set up on this database yet."` (weight-server.ts).
- Server actions wrap the core in `run(label, fn)`, which catches, logs `console.error(label failed)` and returns
  "Couldn't save that. Try again.". They call `refresh()` from `next/cache` on success
  (`src/app/actions/exercise.ts:17-26`). In this Next.js 16, `refresh()` may only be called from a Server Action
  (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/refresh.md`).
- Reads are cached: `cached(key, [tag])` in `src/lib/cache.ts`, and writes call `invalidate(tag)`. A new tag joins the
  `CacheTag` union and `ALL_TAGS` (cache.ts:38-71). `weight` and `exercise` are both in ALL_TAGS. `words` is
  deliberately left out, so a flush never rebuilds the shell (word-model-check.ts:505). weight-check pins
  "reads are cached under 'weight' and every write invalidates it" (weight-check.ts:427-431). Copy that pin for the
  new tag.
- A page that reads several health tables reads them in one `Promise.all` wave, each failing soft on its own
  (`src/app/train/page.tsx:32-34`).
- The pushed code must tolerate the migration being absent. That is why push-before-apply is allowed (memory
  `push-every-milestone`: "confirm the code's missing-table fallback").

---

## 3. Launch switches

Pattern (most recent, `src/lib/side-quests.ts:76-112`; the same in `proof.ts:75-108`, `credits.ts:59`,
`week-audit.ts:77`, `streak-mult.ts:52`, `skill-decay.ts:75`, `review-fatigue.ts:44`):

```ts
export const X_LAUNCH_DAY = null as DayKey | null;            // set in the launch commit only, on the user's go
export const X_LAUNCH_DAY_ENV = "XTNL_X_LAUNCH_DAY";            // honoured only when NODE_ENV !== "production"
export interface XEnv { NODE_ENV?: string; XTNL_X_LAUNCH_DAY?: string }
function readEnv(env?) { … each variable read by name … }       // on a client the XTNL_ var is undefined: a server decision
export function xLaunchDay(env?): DayKey | null { … isDayKey(override) ? override : X_LAUNCH_DAY }
export function xOn(day: DayKey, launchDay = xLaunchDay()): boolean { return launchDay != null && day >= launchDay; }
```

- Pages compute `live` on the server and pass it down. Client code never reads the env.
- The check pins the inert state: `check("X_LAUNCH_DAY is null in code …", X_LAUNCH_DAY === null)` and the override
  name. It exercises launched behaviour by **passing a launch day explicitly**, so the check passes with the override
  on (`scripts/side-quests-check.ts:202-213`).
- After a flip, re-pin: inject an explicit `null` for the inert tests and pin the constant to the launch day (memory
  `launch-switches`).
- Rehearse with a `.claude/launch.json` config that sets the override before `node docs/life-plan/dev-rehearsal.mjs`
  (port 3100, local DB, blank GEMINI_API_KEY, `XTNL_LIFE_JUDGE=1`). Existing examples: `xtnl-rehearsal-momentum`,
  `-proof`, `-s9`. Add an `xtnl-rehearsal-<feature>` entry.
- **Automatic** writes (cron, judge, a write made on page read) sit behind `lifeWritesEnabled`
  (`src/lib/life-economy.ts:883-886`) or `settlementWritesEnabled` (`src/lib/settlement.ts:235-238`). Both refuse a
  Vercel Preview or dev server unless `XTNL_LIFE_JUDGE=1`. User-initiated server actions are not gated by them, which
  is why a local server must never point at prod (dev and prod share one DB: blueprint-plan rule 5).
- Authority. The memory `health-psych-exercise` grants the user's standing authority for "its own launch switch".
  "It does not extend to other features' switches … or to acting on their live account." The auto-mode classifier
  may still block the flip edit. If it does, stop and give the user the one-line edit (memory `launch-switches`).
- Existing switch states: LIFE 2026-10-01 live; MOMENTUM 2026-10-12 live; DUTY, CREDITS, PROOF, AUDIT, DECAY, STREAK,
  FATIGUE, SIDE_QUESTS and TRACK_CURVE all null; ROADMAP_GOALS_LIVE, ROADMAP_GEMINI_LIVE and ROADMAP_GAPS_LIVE false;
  TOPIC_* true.
- Consequence for mood. The existing Close-the-day mood is behind DUTY_LAUNCH_DAY. A new check-in should **not** reuse
  that gate. Give it its own switch, e.g. `CHECKIN_LAUNCH_DAY`, or ship it with no switch if it pays nothing (weight
  shipped with no switch).

---

## 4. The economy: "a record, never a reward" vs momentum pay

What the economy reads:
- **ActivityEvent** is THE append-only ledger. Life levels read only `SUM(xp) WHERE sink='TRACK'` (data-model.md:612).
  The daily streak, the momentum run, chests, habit strength, credits (`src/lib/credits.ts:6-9`: a fold over QUEST_SET,
  CHEST, WEEK, PLAN_WEEK, MILESTONE, CHECKPOINT and MP_MINT rows plus MALL_BUY/MALL_REFUND) and the week judge are
  all folds over it.
- **MasteryLedgerEntry** holds MP mints. **TaskInstance/TaskTemplate** hold ticks. **CapitalLedgerEntry** is legacy.
- **ExerciseSession** is read by `momentum-server.ts:1996` (walk minutes for WORKOUT rows), `snapshot.ts:311` (PB Seal
  pace), `competency-server.ts:253,264` (walk hours, `kind = 'WALK'` only) and `health-ingest-server.ts:70`.
- **BodyWeight/WeightGoal** are read only by `weight-server.ts` and `actions/capture.ts`. `scripts/weight-check.ts:433-457`
  enforces that no economy file (`life-economy, life-tracks(-server), activity, mastery, celebrations,
  celebration-detect, celebration-types, xp, streak, today-board, goals(-server)`) imports weight, and that weight's
  files import none of them. `train-check.ts:402` bans `@/lib/(xp|streak|life-grade|life-economy|rewards|celebrations|
  mastery|tasks|today-board|momentum-roll|momentum-server)` imports in the Train components.

For a **mood/stress check-in** (memory: "never reward reporting a particular mood (reward the act of checking in, if
anything)"):
- Option A (cleanest). A new table, read by nothing in the economy, plus a weight-check-style import guard. This
  keeps it out of every ledger fold, out of the 'life' reset's ActivityEvent wipe, and lets a single entry be deleted.
  ActivityEvent is append-only ("corrections are new rows", schema.prisma), so a REFLECTION row cannot really be
  deleted for privacy.
- Option B. Reuse REFLECTION rows. This needs a new reader, and the rows are append-only. REFLECTION is already in
  `NEVER_STREAK_SOURCES` (`src/lib/streak-curve.ts:126`) with `DEFAULT_SINK` NONE (`src/lib/activity.ts:45`).
- If the check-in pays at all (e.g. a flat amount for the act), it becomes an economy change. It needs a new
  ActivitySource in `life-types.ts` and in `DEFAULT_SINK` (activity.ts:34-70), a place in
  `NEVER_STREAK_SOURCES`/`STREAK_SOURCES`, a receipt version, and re-runs of `balance-horizon.ts`, `momentum-sim.ts`
  and `--credits`. dropped.md:24 bans a quota or daily bar on the board, and blueprint H8/H12/H14 ban shame or
  penalty loops. The pay must never depend on the reported value.

For a **strength logger** (P25):
- Pay, if any, goes through momentum's split-neutral per-day curve `X(W) = A·(1 − e^(−W/H))` inside the daily knee
  (`momentum.ts:348-358`; dropped.md "Per-session saturating workout pay … Still dropped"). It needs a MET or
  intensity mapping (momentum.md:810: "The MET table makes adding them a constant"), the today/yesterday window
  (`walkPaysOn`), reversal rows on a same-day delete (`reversalSourceOf`), "Counts as" linking so a ticked "Gym legs"
  habit is not paid twice (momentum.md:33 "Never pay twice"; SESSION pay mode), and the BODY quest and kept-week
  minutes.
- PRs (max weight, e1RM) are self-reported. Per H17, a set over 2x the user's best is recorded but unpaid until
  confirmed. PR keys follow `pr:<KIND>:<metric>:<weekKey>` (data-model.md "MOMENTUM" block). Celebrations: the PB Seal
  reads PR rows (snapshot.ts:307-317).
- Re-pins named by P25: balance-horizon (the basket's gym row, `scripts/balance-horizon.ts:238`), momentum-sim
  C5-C7 and C10, the BODY kept rate, and the exercise-style-check and momentum-check goldens.
- **Do not put strength rows into ExerciseSession as it stands.** `loadExerciseView`
  (`exercise-server.ts:147-148`), the same-day lookup (:288) and the Health Connect match
  (`health-ingest-server.ts:70`) read every row with **no kind filter**. `viewOf` forces `kind: "WALK"` (:135) and the
  insert hard-codes `kind: "WALK"` (:262). `distanceKm` and `durationMin` are NOT NULL (schema). A strength row would
  show as a walk with a pace, be matched against Health Connect walks, and be priced as a walk (or refused as INVALID
  at 0 km). Prefer new tables (a session plus its sets: weight, reps, set index, a drop-set marker or parent set).
  Otherwise add `kind` filters to every reader, keep `EXERCISE_KINDS` (`src/lib/exercise.ts:45`) as the union, and
  re-pin health-ingest-check.

---

## 5. Privacy and sensitivity of personal data

What exists:
- **There is no login.** It is a single user (`src/lib/user.ts:7`, `DEFAULT_USER_ID`). There is no `proxy.ts` or
  `middleware.ts` in the repo. `docs/capability-summary-2026-10-22.md:185`: "Production is open. There is no login,
  and anyone with the URL can read and write." MOBILE_API_TOKEN is "reportedly unset", so `/api/mobile/v1` is open
  too. Mood and stress entries (and free-text notes) would be world-readable at the production URL. This is the
  biggest privacy fact for the feature. Flag it to the user, and do not put mood in any URL, push payload, widget or
  lock-screen surface.
- **Gemini sees capture lines.** A non-routed capture line becomes a task and goes through `applySizing`
  (`src/app/actions/capture.ts:391`), and Gemini runs "on the free tier, so Google may use the data"
  (capability-summary item 5). A weigh-in is routed **before** any task code (`capture.ts:425-432`, pinned by
  weight-capture-check "source guards"). A mood or stress line typed into capture must be routed the same way, and its
  note must never reach `life-sizing`, `life-lexicon`, `dedup` or any Gemini caller (the importers are listed by
  `grep from "@/lib/gemini"`). The capture sheet also keeps an unsaved line in localStorage (capture.ts comment).
- **Export.** There is no data export anywhere (no `text/csv` or Content-Disposition in src).
  `/api/debug/queries` is 404 in production unless profiling (`src/app/api/debug/queries/route.ts`).
- **Reset.** The 'life' scope deletes TaskInstance, TaskTemplate, RestDay, ActivityEvent, RoadmapReading, Roadmap and
  LifeSettings (`src/lib/reset-scopes.ts:44-52`, `src/app/actions/reset.ts:37-52`). **BodyWeight, WeightGoal and
  ExerciseSession are in no reset scope**, not even 'everything'. A new sensitive table needs an explicit decision:
  add it to a scope, which means LifeResetTable, getResetPreview counts, the blurb and a fail-soft skip while the
  table is missing (reset.ts:92-93), or give it its own per-entry Delete, as weight (`deleteWeightCore`) and walks
  (`deleteExerciseCore`, "Delete asks twice") have.
- **Android.** `allowBackup="false"`, and `data_extraction_rules.xml` excludes only the sealed tokens and webview
  cookies, so a cached `/check` carrying mood would move phone-to-phone. The API token is AES-256-GCM in the Keystore
  (android/README.md "API token"). The cover-screen widget is visible on a closed phone, so keep mood off it.
- **Copy and safety.** The HonestyChip `health` reads "Not medical advice · ask a professional"
  (`src/components/glyph/HonestyChip.tsx:100`, `caution-medical` at :138). There is no crisis signposting in the repo
  (grep for Lifeline or Beyond Blue finds nothing). The memory requires "safety signposting for persistently low mood
  (Australia: Lifeline 13 11 14, Beyond Blue). No diagnosis."

---

## 6. Gates, and which check owns a new module

Chains (package.json):
- `life:check` runs about 60 tsx scripts in sequence, including weight-check, weight-capture-check,
  exercise-style-check, momentum-check, momentum-server-check, rest-tokens-check, balance-horizon, momentum-sim,
  momentum-sim --credits, status-check, credits-check, proof-check, proof-pages-check, health-ingest-check,
  settle-check, … side-quests-check, calibration-check, rituals-check, and then the roadmap checks.
- `ui:check` runs shell-check, contrast-check, review-check, …, train-check, …, mobile-api-check and roadmap-ui-check.
- Per blueprint rule 2, the full gate is `tsc`, `eslint`, `life:check`, `ui:check`, `next build`, plus every check the
  change touches, plus `balance-horizon` and `momentum-sim` whenever a pay path changes. Then commit and push
  (memory `push-every-milestone`).

Ownership:
| New thing | Owning check (existing) | Add |
|---|---|---|
| Pure mood/stress rules (`src/lib/<checkin>.ts`) | none | a new `scripts/<checkin>-check.ts` in life:check, pinning its own position in the chain (pattern side-quests-check.ts:719-720) and an `npm run <x>:check` alias |
| Its server reads/writes | none | the same check, with fake loaders (no DB), the fail-soft pins and the economy-import guard (copy weight-check.ts:433-457) |
| Strength rules in `exercise.ts`/`momentum.ts` | exercise-style-check, momentum-check, momentum-server-check | goldens; balance-horizon and momentum-sim re-pins if paid |
| Health Connect changes | health-ingest-check (life:check) | its name and model pins (section 1) |
| Capture routing (`#mood`, `stress 3`) | capture-parse-check, capture-server-check, weight-capture-check-style source guards, today-ui-check --strict | a parity table (client and server) |
| Ritual and Close-the-day changes | rituals-check (life:check), today-ui-check --strict | |
| Train/Body cards and copy | train-check (ui:check: copy, 12 px floor, 40/44 px targets, 16 px inputs, no motion, no Tailwind-like class names, nothing paid) | |
| Nav tab (e.g. Body > Mind or Strength) | shell-check (`:134-136` pins Body's subs exactly "This week, Exercise"; `:162`, `:178-179`, `:205` titles) | update the pins |
| Colours, new tokens | contrast-check (reads `src/app/styles/tokens.css`) | |
| Mobile endpoint | mobile-api-check (ui:check) | |
| Rules page lines | the owning check (e.g. proof's `proofRuleLines()` on `/today/rules`) | |

---

## 7. Dev fixtures and the UI audit

- `/dev/style/*` is open in development, and in a production build only with `XTNL_DEV_STYLE=1`
  (`src/app/dev/style/gate.ts:5`). Sub-pages share the gate through `layout.tsx`. The nav lists them
  (`src/components/shell/nav.ts:288`: `/dev/style/train` "Train fixtures").
- Pattern: `src/app/dev/style/train/TrainFixtures.tsx` renders the real cards with **fake actions** that wait about
  400 ms and answer ok, or `"Fixtures save nothing."`, so nothing is written. Fixture data lives beside the components
  (`src/components/train/fixtures.ts`). Add the check-in and strength states there (empty, not-ready, calibrating,
  logged, a low-mood signpost, a drop set, a PR pending confirmation).
- `scripts/ui-audit.mjs` lists the routes. `REAL_ROUTES` (:138-157) holds the app's pages and has `/train` but not
  `/train/exercise`; add any new real page. `FIXTURE_ROUTES` (:197-211) includes `/dev/style/train`; a new fixture
  page or `?state=` must be added. Widths are 344, 375, 932 and 1440 (`EXTRA_WIDTHS` adds 768 and 1366 for Today).
  Real routes run only against the rehearsal server (`REHEARSAL_BASES`, :133); otherwise use `--routes fixtures`.
- UI evidence: screenshot at 344 px first, then 375, 932 and 1440, and send the screenshots (blueprint rule 7; memory
  `ui-change-snapshots`). The browser pane is production: use your own tab on the rehearsal server and never act on
  the live account (memory `roadmap-rework`).

---

## 8. Mobile API and the Android app

Contract (`docs/mobile-api.md`):
- Base `<server>/api/mobile/v1`, production `https://xtnl-knowledge-xpis.vercel.app`.
- Optional Bearer token, compared in constant time. JSON `{ok, data}` / `{ok:false, error, code}`, `no-store`.
- A body is at most 256 KB and **unknown fields are refused**. An optional `clientId` gives a 10-minute replay cache.
- Every route is a thin wrapper over a web core.
- Endpoints are pinned three ways that change together: the doc's table (`docs/mobile-api.md:58-81`),
  `MOBILE_ENDPOINTS` (`src/lib/mobile-api.ts:116-138`) and `scripts/mobile-api-check.ts`.
- Files: the route file exports only its method and segment config and delegates to `mobile-api-server.ts
  handle<X>(request, realMobileDeps)`. The pure request parsing lives in `mobile-api.ts`, and the real bindings in
  `mobile-api-cores.ts` (`src/app/api/mobile/v1/exercise/route.ts`).
- The **offline queue** replays exactly `POST /tasks/complete`, `/log` and `/work/done`; review answers never wait
  (mobile-api-check.ts:3589; docs:44). A queued check-in needs that pin and `SendQueue.kt`/`SendQueueTest` changed on
  purpose. Otherwise it shows Retry like the other writes. Keep the day fixed at the tap (reflectionDayAllowed:
  today, or yesterday until 04:00).

Android (`android/app/build.gradle`, `android/README.md`):
- `com.xtnl.app`, compileSdk and targetSdk 35, minSdk 26, **versionCode 31, versionName "2.19"**.
- Kotlin 2.0.21, AGP 8.7.2, Gradle 8.11.1, Compose BOM 2024.11.00, OkHttp, kotlinx.serialization, WorkManager 2.9.1,
  Glance 1.1.1, Health Connect 1.1.0-alpha10.
- Each feature bumps versionCode and versionName. mobile-api-check pins the minimum, e.g. `>= 31 && 2.19`
  (mobile-api-check.ts:3654), so add a new `>= 32 (2.20)` pin.
- Update `data/Models.kt`, `data/Api.kt`, `data/HttpApi.kt` and `data/DemoApi.kt` (the demo must model the new
  behaviour), and add a `core/<X>Line.kt` with its JVM test. There are now 361 `@Test` methods (the plan's "132" is
  stale), plus ScreensTest.
- `HttpApi.kt:35` sets `ignoreUnknownKeys = true`, so additive `/check` fields are safe for older apps.
- `HealthManifestTest` pins exactly the Health Connect permissions declared (`AndroidManifest.xml:18-22`: exercise,
  distance, elevation, weight, background). Reading strength sessions from HC needs that test, the rationale screen
  and the README updated.
- Build: `$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"; .\gradlew.bat assembleDebug test`.
  Screens: `.\gradlew.bat testDebugUnitTest "-Pxtnl.shots=true" --tests com.xtnl.app.ui.ScreensTest`
  (PNGs in `app/build/screens/`).
- Layouts: the cover screen (about 475x751 dp) and the main screen (704x932 dp upright and 932x704 sideways, plus
  tabletop).
- Install: `adb install -r app\build\outputs\apk\debug\app-debug.apk` (`-r` keeps the data). A local dev server is
  reached with `adb reverse tcp:3100 tcp:3100`.
- Local reminders follow `core/AuditAlarm.kt` and `notify/AuditReminder.kt` (decision D37: local notification,
  Sunday 19:00 Sydney). This is the template for a "check in" nudge, since web push is not set up.

---

## 9. Copy style

- Plain, neutral, honest words. The FEEL is "calm, dense and fast … Honest numbers everywhere"
  (`docs/life-plan/redesign.md:40`). Sentence case everywhere except eyebrows and lane labels, a 12 px floor and
  16 px inputs on phones (redesign.md:131). No exclamation marks in health copy.
- Health copy bans praise and shame words. `scripts/train-check.ts:302-303`: PRAISE =
  `great|good job|well done|amazing|awesome|congrat*|proud|nice work|keep it up|crushing|fantastic|excellent|bravo|nailed|you did it|on fire`;
  SHAME = `bad|lazy|failed|failure|cheat*|guilt*|ashamed|disappoint*|should have|overweight|obese`.
  weight-check.ts:273 bans `good|great|well done|bad|fail|danger|warning|must|should|!` in a note.
  weight-capture-check.ts:539 asks for "no praise, no shame, no points, no exclamation".
- The reflection's own confirmation is "Noted. Never graded." (TodayBoard.tsx:2411). Weight uses "calibrating" with
  no invented dates.
- Honesty marks stay visible: "Not medical advice · ask a professional" (HonestyChip). Every T2 or T3 celebration
  shows an exact number and a cause (redesign.md:890-896). Reward honesty means no daily life-XP bar.
- System-novel style (memory `system-novel-ui-style`): use the function and layout of a "System" window (status
  window, issued quests, reward prompts, evaluation), with genre-neutral words (Host, Status, Quests, Rewards,
  Evaluation). Use **English only, no CJK glyphs, no ink, seals or cultivation dressing**. Draw in XTNL's own tokens
  (`src/app/styles/tokens.css`, Night theme: one meaning per hue, the white primary button, Inter / Fraunces /
  JetBrains Mono).
- CSS: every hand-written sheet starts with `@layer theme, base, components, art, effects, utilities;`
  (`src/components/train/train.css:1`). Namespace classes (e.g. `wt-`), with no name that collides with a Tailwind
  utility.

---

## 10. Shipping checklist for a new tracked feature

**Before code**
- [ ] Read the relevant `node_modules/next/dist/docs/01-app/...` guides (Server Actions and `refresh`, caching, route
      handlers; AGENTS.md).
- [ ] Record the design decisions in the blueprint's Decisions section (rule 9), under the user's standing authority
      for this feature (memory `health-psych-exercise`).
- [ ] Do not edit files another session has open (git status shows uncommitted edits to `scripts/ui-audit.mjs`,
      `.claude/launch.json`, review files and `src/lib/srs.ts`).

**Data**
- [ ] New tables only, following the conventions (cuid, userId index, TEXT kinds with named CHECKs, life-day
      `@db.Date`, timestamptz, no FK, BEGIN/COMMIT, a full header).
- [ ] A migration name that avoids `/health|ingest|hc_|connect|audit|mobile|roadmap/`; the next stamps are
      `20270103000000_strength_sets` and then `20270104000000_<mood>`.
- [ ] Strength in its own session and set tables, not in ExerciseSession as it stands (section 4).
- [ ] Document the model in `docs/life-plan/data-model.md`.

**Server**
- [ ] A pure module with no Prisma and no clock, and a `-server.ts` with `isMissing<X>Table` (P2021/42P01 plus the
      table name), reads that fail soft with `ready:false`, writes that return `{ok:false,error}` and a NOT_READY
      line, `cached(…,[tag])`, `invalidate(tag)`, and the tag added to CacheTag and ALL_TAGS.
- [ ] Server actions in `src/app/actions/<x>.ts` with `run()`, `getCurrentUserId()` and `refresh()` on success.
      Input is checked again in the core.
- [ ] Mood: never priced by its value; kept out of every economy fold, with an import guard and a check; kept out of
      the streak and the run; no daily quota.
- [ ] Strength: if paid, through the X(W) day curve, the knee, the today/yesterday window, reversals, "Counts as"
      (never pay twice) and the PR plausibility gate (over 2x best is unpaid until confirmed).
- [ ] Capture lines routed before task code, so no Gemini sizing and no task.
- [ ] A reset and delete decision for the new tables.
- [ ] Safety signposting (Lifeline 13 11 14, Beyond Blue) for persistently low mood, "Not medical advice", no
      diagnosis.

**Switch**
- [ ] `<X>_LAUNCH_DAY = null as DayKey|null`, the `XTNL_<X>_LAUNCH_DAY` override outside production, `<x>On(day, ld)`,
      the inert pin in the check, a rehearsal `launch.json` entry.
- [ ] Automatic writes behind `lifeWritesEnabled`/`settlementWritesEnabled`.
- [ ] Flip only on the user's go, then re-pin.

**UI**
- [ ] Cards in `src/components/train/` (or a new folder) with fixtures in `components/train/fixtures.ts` and the
      fixture page `/dev/style/train` (fake actions).
- [ ] Routes added to `ui-audit.mjs` REAL_ROUTES and FIXTURE_ROUTES; nav and shell-check pins if a tab is added.
- [ ] Copy that passes the PRAISE and SHAME regexes; System-novel layout in XTNL tokens.
- [ ] 344, 375, 932 and 1440 px screenshots on the rehearsal server, sent to the user.

**Mobile**
- [ ] The doc, MOBILE_ENDPOINTS, the route, `handle<X>` and mobile-api-check changed together.
- [ ] Android Models, Api, HttpApi, DemoApi, a Line with its test, ScreensTest renders on the cover and main screens,
      versionCode 32 / 2.20 with its pin.
- [ ] The offline-queue pin is updated only if the check-in may wait.
- [ ] Nothing sensitive on the widget, the tile or a notification.

**Gates and ship**
- [ ] The new check wired into life:check (or ui:check) and pinning its own position.
- [ ] `tsc`, `eslint`, `life:check`, `ui:check` and `next build`, plus balance-horizon and momentum-sim if pay
      changed.
- [ ] Rehearse the migration locally, check the ref, `db execute`, `migrate resolve`, `generate`.
- [ ] Commit with the Co-Authored-By line, push, and add a PROGRESS.md log line.
