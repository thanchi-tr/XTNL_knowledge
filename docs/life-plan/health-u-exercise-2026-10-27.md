# u-exercise: the exercise subsystem end to end, and how new kinds fit

Read-only map, 2026-10-27, `main` at 778d6d2 (with the uncommitted review work in the tree, none of it exercise). No DB, no prisma, no Gemini. Research notes in section 8 are from domain knowledge, not fetched this session. Check them before building.

---

## 0. Correction to the brief: momentum is LIVE, so walks pay today

`src/lib/momentum.ts:76` reads `export const MOMENTUM_LAUNCH_DAY = "2026-10-12"`, and `docs/life-plan/momentum.md:3` says "Status: LIVE since 2026-10-12". The "INERT until MOMENTUM_LAUNCH_DAY" comments in `exercise.ts`, `exercise-server.ts`, `ExerciseCard.tsx` and `actions/exercise.ts` describe the code paths. They do not describe the current state. In production a walk dated today or yesterday writes a `WORKOUT` row through the daily knee, can write `PR` rows (+15 XP, or 22 with Pacer), can crit (Body spark), can complete or top up an EXERCISE habit ("Counts as"), counts for the momentum run from 10 min, feeds the BODY quest's Move minutes, BODY's kept week and the Vitality branch.

Consequences:
- Any change to walk pricing changes live pay.
- The `walk-1` receipts already in the ledger must stay readable byte for byte.
- New kinds must not break split-neutrality (one curve per day).

---

## 1. The pieces, file by file

| Layer | File | What it does |
|---|---|---|
| Rules (pure) | `src/lib/exercise.ts` (679 lines) | `EXERCISE_KINDS = ["WALK"]` (:45). `cleanWalkInput` checks the input: angle 0–45°, distance 0.01–200 km, duration 1–1440 min, a year back, note ≤ 200 (:78). `walkFactsOf` gives speed, pace, grade and climb (:104). `exerciseWeekOf` sums the week from Monday (:143). `priceWalk` (:251). `walkReceiptOf` builds the `walk-1` receipt (:306). `isWalkReceipt` (:337). `walkEventInput` builds the WORKOUT row (:352). `personalBestsOf` (:419). `prEventInput` (:452). `reversalInputOf` (:489). `bodyQuestDoneBy` (:526). `linkCandidateOf` ("Counts as", :562). Pay and delete copy: `WALK_PAY_COPY`, `walkPayLine`, `walkDeleteLine` (:637–676). |
| Economy constants (pure) | `src/lib/momentum.ts` | EX_* constants (:149–170): A 35, H 70, speed clamp [2, 7.5], refused above 9 km/h, angle clamp 15°, 180 min a session, W cap 240 a day, MET 3/6, pay weights 0.5/1/2, WHO effort weights 0/1/2, streak from 10 min, PR 15 XP, ≥ 3 prior sessions, ≥ 3 % gain, pace ≥ 0.15 min/km on ≥ 2 km, 2 PBs a session. `EX_SESSION_MIN_MINUTES` 5 and `EX_PAY_BACK_DAYS` 1 (:208–211). `excritKey` (:248). `workoutRowKey` `workout:<id>` and `prRowKey` `pr:WALK:<metric>:<week>` (:269–270). `walkMet` (ACSM walking, :302). `intensityOf` (:310). `walkRefusal` (:323). `sessionWeights` (:337). `exerciseDayRaw` X(W) (:348). `sessionRaw` (:354). `walkSessionRaw` (:362). `WALK_B_OF_INTENSITY` gives B 5/10/20 (:373). `walkCountsForStreak` (:376). `walkPaysOn` (:381). `PrMetric` = DISTANCE, DURATION, CLIMB, PACE, WEEK_KM (:386). `branchOfRow` sends WORKOUT and PR rows to VITALITY (:799–814). The Vitality perks all name walks (:857–865). `lifeModsOf` (:986–993). |
| Server | `src/lib/exercise-server.ts` (667 lines) | `loadExerciseView` is cached under `exercise:<user>:<day>`, tag `exercise`, reads 90 days and fails soft (:143). `loadWalkMomentum` adds pay per session plus the "Counts as" link on live days (:165). `logWalkCore` validates, checks for a Health Connect twin, creates the row (or the ingest transaction), then pays (:250). `logWalkMomentsCore` wraps it in `withMoments` for Seals (:337). `readLiveWalks` uses raw SQL over `workout:%` rows with no undo (:369). `payOnce` reads the knee, the day's walks, this week's PR keys and perks, prices, then batches lock + settled guard + freshness guard + WORKOUT + PRs, retrying 3 times (:494). `payWalkCore` handles the pay window, refusal, link, then pay (:565). `deleteExerciseCore`: a same-life-day delete writes reversals; a later one keeps the pay (:602). |
| Action | `src/app/actions/exercise.ts` | `logWalk` and `deleteExercise` (`"use server"`, `refresh()`). |
| Pages | `src/app/train/exercise/page.tsx` | `loadExerciseView(..., {momentum: true})` plus `settleMomentum`, then renders `<ExerciseCard>`. |
| | `src/app/train/page.tsx` | Body › This week: WeightCard, then a "Walking · this week" card with totals and a "Log a walk" button (:42–73). |
| UI | `src/components/train/ExerciseCard.tsx` (250 lines) | Card "Walking": a week `dl` (Walks, Distance, Time, Climb), a form (Angle, Distance, Duration, Day; angle chips Flat/2/5/8/12°; a live grade/speed/pace/climb line), a "Counts as: <title>" chip, "Log walk", the pay line, then the history (90 days, "Sure?" double-tap delete). |
| CSS | `src/components/train/train.css:96–119` | `wt-ex-*` classes. At narrow widths the week grid goes from 4 to 2 columns. |
| Nav | `src/components/shell/nav.ts:103–113` | Section Body (`/train`): subs "This week" and "Exercise". |
| Fixtures | `src/app/dev/style/train/TrainFixtures.tsx` | Three WALK fixtures. Used for the 344 px screenshots (`/dev/style/train`, which is in ui-audit's route list). |
| Health Connect | `src/lib/health-ingest.ts`, `health-ingest-server.ts` | `HC_KINDS = ["WALK","HIKE"]` (:55). A hike is stored as a WALK with `angleOfClimb` (:112). `walkInputOf` (:132). `matchOf` and `importedTwinOf` (:176, :202). Rows `ingest:hc:<externalId>`. A backfill is a record only. Header: "walks and weight only, no steps, no heart rate, no other workout, no new pay rule" (decision D22). |
| Mobile API | `src/lib/mobile-api.ts:1392–1471`, `mobile-api-server.ts:310, :849`, route `src/app/api/mobile/v1/exercise/route.ts` | POST /exercise is the only exercise route: the Health Connect batch (kind must be 'WALK' or 'HIKE', :1441). There is no manual exercise endpoint. Exercise is not in `/status` beyond the BODY quest. |
| Android | `android/.../core/HealthLine.kt:33–40, :105–112`; `health/HealthReader.kt`, `HealthSync.kt`, `HealthSyncWorker.kt`; `ui/more/HealthConnectSettings.kt` | Reads `ExerciseSessionRecord` types 79 (walking) and 37 (hiking) only. Drops sessions under 10 m of distance. Already asks for `READ_EXERCISE`, which covers every exercise type. No manual exercise logging UI anywhere on the phone. `SendQueue` kinds are TICK, LOG and WORK_DONE (`data/SendQueue.kt:52–63`). |
| Capture | `src/lib/capture-parse.ts:293, :1636`; `life-lexicon.ts:206–212` | No session capture. "walk 30m", "run 5k 28m", "5x5 squats", "x gym 45m" are **tasks** (lexicon category EXERCISE: gym/lift/squat/deadlift = DEMANDING D60; run/swim/cycle/row = DEMANDING D30; hike = DEMANDING D120; sports = DEMANDING D60; push-ups/planks = STANDARD D10; walk/stretch/mobility/yoga/pilates = STANDARD D30). `DISTANCE_VERBS` only stops "run 100" from reading as minutes. The weigh-in path is the precedent for routing a whole line to a record instead of a task (`src/components/capture/weight-capture.ts`, `mayBeWeighIn`/`routeWeighIn`, an escape-hatch chip). |
| Ledger readers that already generalise | `momentum-server.ts:2015–2018` (Move minutes = the session's `durationMin` for any WORKOUT row, capped at 180), `momentum-server.ts:699–714` (`weekEffortOf`: receipt minutes × `effortWeightOfB(B)` over any live WORKOUT row), `life-weeks.ts:455–462, :476` (BODY's kept week reads a walk's `countedEffort`, otherwise minutes × the weight of B; `isWalkRow` matches by `workout:` key), streak sources TASK/WORKOUT/CHECKPOINT (`momentum.ts:624`), `branchOfRow`, avatar-server:310 and life-weeks-server:325 (a WORKOUT row counts as category EXERCISE) | Any session that writes a WORKOUT row with `minutes` and a B factor is counted by these unchanged. |
| Readers hard-wired to WALK | `competency-server.ts:253, :264` (`"kind" = 'WALK'` in both SQL reads), `celebration-detect.ts:1233` (`WALK_PR_KEY`), `snapshot.ts:309` (`pr:WALK:` only), `exercise-server.ts:135` (`viewOf` forces `kind: "WALK"`), `:262` (writes 'WALK'), `:147` and `:288` (no kind filter) | Detailed in §2. |

The ledger flow for one walk on a live day:

```
ExerciseSession row ─┬─ (HC) INGEST row 'ingest:hc:<id>' (sink NONE, xp 0), same $transaction
                     ├─ (Counts as) completeLinkedCore → TaskInstance source auto:workout, TASK row pay mode SESSION (K=0)
                     └─ payOnce $transaction[ lifeLockOp, settledDayGuardOp?, freshnessGuardOp,
                                             WORKOUT 'workout:<sid>' (sink TRACK, track BODY, rawXp=raw, qty=minutes,
                                                      countsForStreak ≥10 min, receipt walk-1 {B 5/10/20, minutes, walk{…w,wBefore,effort,countedEffort,…}}),
                                             PR 'pr:WALK:<metric>:<week>' ×≤2 (xp 15/22, rawXp null) ]
delete (same life day) → $transaction[ lock, guard?, 'undo:<eventId>' rows, deleteMany(session) ]
```

---

## 2. What is hard-coded to WALK

| # | Where | Hard-coding | What breaks with a second kind |
|---|---|---|---|
| H1 | `prisma/schema.prisma:1002–1018`; migration `20261201000000_life_exercise_style` | `kind TEXT DEFAULT 'WALK'` (no CHECK). `distanceKm DOUBLE PRECISION NOT NULL`. `angleDeg NOT NULL DEFAULT 0`. No start/end time, no sets, no label. | A distance-less kind (strength, yoga, sport) has no honest value for `distanceKm`. Either write 0 or drop NOT NULL (an altered column; see §5). |
| H2 | `exercise-server.ts:132–141` `viewOf` | `kind: "WALK"` whatever the row says | Every non-walk row would show as a "0 km walk". `walkFactsOf` would divide by 0 (pace = ∞, which `paceLabel` prints as "–"). `exerciseWeekOf` would count it as a walk. |
| H3 | `exercise-server.ts:147–151`, `:288` | `findMany` with no `kind` filter (the view, and `importedWalksOn`'s twin check) | A run could block a hand-logged walk as its "twin", or the other way round. |
| H4 | `exercise-server.ts:369–382` `readLiveWalks` | Keeps only `isWalkReceipt` (`v === "walk-1"`) | **Critical.** A new receipt version is skipped when computing the day's `wBefore` and the crit's `k`. A run plus a walk on one day would each start the curve at 0, so the user is paid twice (this breaks pin C10/G3, split-neutrality). The PB history would also lose them. |
| H5 | `momentum.ts:302–345` | `walkMet` (ACSM walking, speed clamped to [2, 7.5] km/h, angle ≤ 15°). `walkRefusal` refuses above 9 km/h ("faster than a walk"). `sessionWeights(WalkLike)`. | A run is refused today (pin G3 "12 km/h is refused"). Strength and yoga have no speed. |
| H6 | `momentum.ts:269–270, :386–387`; `exercise.ts:374–449`; `celebration-detect.ts:1233–1300`; `snapshot.ts:309`; `exercise-server.ts:484–487, :501` | `PrMetric` is walk metrics only. The key is `pr:WALK:<metric>:<week>`. `PB_TITLE` is "Longest walk" and similar. `prWasOf` parses walk details. `metricOfPrKey` takes `split(":")[2]`. | A `pr:RUN:...` row would fall to celebration-detect's generic M4 branch, "Recorded <day> from a sensor session" (:1078–1090), which is the wrong copy. A strength key needs an extra segment (the movement), which shifts `split(":")[2]`. |
| H7 | `exercise.ts:165, :300–342, :352–366` | `WALK_RECEIPT_VERSION "walk-1"`, `WalkReceipt.walk`, detail `walk 3.75 km · 45 min · moderate` | Needs a sibling receipt for sessions. Keep `walk-1` for walks so old rows and the goldens stand. |
| H8 | `competency-server.ts:251–270` | `SUM(durationMin) ... WHERE "kind" = 'WALK'` and a JOIN on `s."kind" = 'WALK'`. Copy: "12.5 h of walks" (`competency.ts:34`), `SKILL_KIND_NAME.EXERCISE = "Exercise (walks count)"` (`competency.ts:52`) | New kinds would not add hours to the user's one EXERCISE skill (partial unique `Competency_userId_exercise_live_key`, schema :2027). |
| H9 | `momentum.ts:857–865` perk copy | "Light walking counts ×0.75", "Walks pay ×1.05", "Walks can crit", "The day's walking curve…", "Walks pay ×1.2…" | Decide whether perks apply to every session kind (the simplest choice, since the curve is shared) and rename them. That means re-pinning the perk copy and the rules page. |
| H10 | UI and copy | ExerciseCard eyebrow "Walking", "Log walk", "Recent walks", "No walks yet", `WALK_PAY_COPY` ("walks pay only today or yesterday", "faster than a walk"), `walkDeleteLine` "Walk deleted". `/train` "Walking · this week" and "Log a walk". `/today/rules/page.tsx:1105–1118` (the Walks card, ACSM walking), `:593` (SESSION: "Paid by the walk"), `:895` (Vitality: "walks, personal bests and exercise tasks"). `ReceiptSheet.tsx:27`. `side-quests.ts:432` ("20-minute walk"). `skill-decay.ts:477` ("a walk or a tick…"). Android `HealthLine.kt` rationale and permission copy. | Copy re-pins across `train-check`, `exercise-style-check`, `side-quests-check`, `skill-decay-check`, `status-check`, `mobile-api-check`, `celebration-check`. |
| H11 | `health-ingest.ts:55`; `mobile-api.ts:1441`; `HealthLine.kt:33–40, :105–112` | Only Health Connect types 79 and 37. A session needs ≥ 10 m of distance. | Runs, rides, swims and rows from a watch would be ignored. Strength and yoga sessions have no distance. |
| H12 | `train-check.ts:385–395` | Pins the record line exactly: `` `Logged a ${km(v.distanceKm)} walk, ${durationLabel(v.durationMin)} at ${v.angleDeg}°.` ``, the one `mark(` and the one `enqueue(` in ExerciseCard, and that no other train component marks or enqueues. | A new SetLogger or SessionCard component that marks the paid XP must be added to this rule. |

---

## 3. What already generalises (reuse, do not rebuild)

- **The WORKOUT row and its key** `workout:<sessionId>`. These read any WORKOUT row with a `minutes` and a B factor: the streak, Move minutes, BODY effort, the BODY kept week, Vitality branch XP and avatar categories. They do not care what kind the session was.
- **One curve per day** X(W) = 35·(1 − e^(−W/70)), W ≤ 240, inside the knee, under `lifeLockOp` + `freshnessGuardOp`. Splitting a session is neutral (pins C10, G3) **as long as every kind adds to the same day W** (H4).
- **"Counts as"** (`linkCandidateOf`, `completeLinkedCore`, top-up `max(0, raw − tickedRaw)`). It works on any personal EXERCISE template, so a strength session counts as the "Gym legs" habit with no new rule.
- **The BODY quest** (`bodyQuestDoneBy`): Move n min reads session minutes only (not intensity), so a 20-minute yoga or strength session already satisfies "Move 20 min".
- **The pay window** (today or yesterday), **refusal → record**, **settled-day guard**, **same-day reversal** (`undo:<id>`), the **Health Connect dedupe and ingest transaction** pattern, and the **Seals via `withMoments`**.
- **Rest timers and wall-clock bounds**: `TaskSession` (schema :2085–2117, P23) is the house precedent for an open session with `startedAt`/`endedAt`, `clientId` unique per user, and a partial unique index on "one running per user". So is proof.ts's `counted = min(reported, wall)`.
- **Goal metrics** `WORKOUTS` and `RUN_KM` already exist in `KrMetric` (`life-types.ts:71`) but read "not measured" (`goals.ts:121`, `life-economy.ts:759`). Session kinds would make them measurable for free.

---

## 4. What the economy would do with new kinds

### 4.1 The rule I recommend
Every kind pays through **the same day curve**, by **minutes × a pay weight from MET**, never by volume, load or self-rated effort.
- `dropped.md:4` deferred strength sets because "manual weight PRs cannot be checked for plausibility".
- `dropped.md:8` dropped an RPE multiplier because it was "a free +16% for answering 'rpe10'".
- `dropped.md:15` dropped any per-session or out-of-cap workout pay.
- `momentum.md:809` already says "The MET table makes adding them a constant, not a redesign."

| Kind | Intensity source | Typical MET (to confirm) | Band (LIGHT < 3, MODERATE < 6, VIGOROUS ≥ 6) | Refusal (recorded, pays nothing) |
|---|---|---|---|---|
| WALK / HIKE | ACSM walking, as now | 2.9–8.4 | as now | > 9 km/h (keep, and the card can offer "Log it as a run?") |
| RUN (incl. treadmill) | ACSM running VO₂ = 0.2·s + 0.9·s·grade + 3.5 | 8–12 | VIGOROUS almost always | e.g. > 25 km/h or < 5 km/h average |
| CYCLE | Compendium speed bands (or, with watts and the BodyWeight reading, ACSM leg ergometry) | 4 (< 16 km/h) to 8–10 | MODERATE / VIGOROUS | e.g. > 60 km/h |
| SWIM | Compendium by pace per 100 m | 5.8 to 9.8 | MODERATE / VIGOROUS | e.g. pace < 1:00 /100 m |
| ROW (erg) | Compendium by watts or 500 m split | 4.8 to 8.5+ | MODERATE / VIGOROUS | e.g. split < 1:20 /500 m |
| STRENGTH | fixed per kind, **never** the user's RPE | ~3.5 general (6.0 "vigorous" lifting) | MODERATE (recommend fixed) | under 5 min. Minutes bounded by the wall clock from first to last set plus grace. |
| MOBILITY / YOGA / PILATES / STRETCH | fixed | 2.3–3.0 (power yoga ~4) | LIGHT (w 0.5, WHO effort 0) | under 5 min |
| SPORT (tennis, football…) | fixed per sport | 6–8 | VIGOROUS / MODERATE | under 5 min |

Worked prices with no perks, as the first session of a day: `X(W)`, then the knee.
- 45 min strength, MODERATE: W 45 → **16.6 raw**, 45 effort min (the same as the walk golden).
- 60 min strength: W 60 → **20.1**.
- 30 min run at 10 km/h (MET ≈ 10.5, VIGOROUS): W 60 → **20.1**, 60 effort min. 45 min run → W 90 → **25.3**.
- 60 min hatha yoga (LIGHT): W 30 → **12.2**, **0 effort min**. It still keeps the run and counts for Move.
- Day cap X(240) = **33.9** raw (38.7 with Endurance), whatever the mix. **The ceiling does not move.**

### 4.2 Effects to model and pin
- **Balance.** `scripts/momentum-sim.ts:487` already models "the walk and the gym moved to logged sessions (they are walks now)". So curve-paid gym is what the balance model assumes. What changes is the typical W: vigorous kinds pay weight 2. Re-run `momentum-sim` (C5–C7, C10, C11, the BODY kept rate of about 61 %, the BODY quest rate) and `balance-horizon` (basket rows `walk` STANDARD 30 ×4 and `gym` DEMANDING 60 ×2, `balance-horizon.ts:237–238`). P25 in `blueprint-plan-2026-10-22.md:518–521` lists the same re-pins.
- **A perverse case to settle.** Today a "Gym" habit tick prices through `priceTask`: B 20 (DEMANDING) × E(60) ≈ 1.167, so about **23.3 raw**, as a TASK row outside the walk curve. If a 60-min strength session is logged first with "Counts as: Gym", the tick pays K = 0 and the session pays **20.1**. Logging more detail would pay less. And a gym day plus a walk day moves from 23.3 + 20.1 to one curve, X(120) = 28.7. If the habit was ticked first, the top-up is max(0, 20.1 − 23.3) = 0, and nothing is lost. Options, for the lead or the user to choose:
  - (a) Accept it. One curve is the rule, and the session path is optional.
  - (b) Strength MET 5.0. Still MODERATE, so nothing changes.
  - (c) A "Counts as" session pays max(session, the tick's projected price) on that habit's day.
  - (d) Leave strength off the curve: the session is a record and still ticks the habit, which pays as now.

  I lean to (d) for STRENGTH at first: the sets are the record and the habit tick stays the pay. That keeps today's balance exactly and needs no sim re-pin for strength. Cardio kinds go on the curve (they replace walks, which already are on it).
- **PBs.**
  - *Cardio PBs* (longest, fastest pace over ≥ N km, most km in a week, per kind) are as checkable as walk PBs. They can pay like walks: +15 XP, debounced, `pr:<KIND>:<metric>:<week>`.
  - *Strength PBs* (heaviest set, best e1RM, rep-max at a weight, session volume) should be **a Seal with no XP**, recorded only. The reason is `dropped.md:4` plausibility, and P25's guard: "a set over 2× the user's best for that exercise is recorded but unpaid until confirmed". Debounce: ≥ 3 earlier sessions of that movement, ≥ 2.5 kg or ≥ 3 %, once per movement per metric per life week, at most 2 per session. Warm-up and drop sets never count for max weight or e1RM.
- **The skill tree.** WORKOUT and PR rows → VITALITY (`momentum.ts:805`). `LSP_WEEK_XP_CAP.VITALITY = 320` still caps points. Perk scope (H9) is a decision: apply them to every curve-paid session and rename them.
- **The BODY kept week** (150 effort minutes, WHO). This is unchanged. LIGHT kinds add 0 effort minutes, which is WHO-correct but may feel unfair for yoga. Say so in the copy ("Light · counts for the run, not the 150"). A WHO-aligned *record* line, "Strength days 1 of 2 this week" (muscle strengthening on ≥ 2 days a week), is cheap and pays nothing. Making it part of the kept week would be an economy change: MP, `life-weeks` pins.
- **Skill hours** (H8). Widen `competency-server`'s `kind = 'WALK'` filter so every kind feeds the one EXERCISE skill, and change "h of walks" to "h of exercise".

---

## 5. Where a set-based logger's data model should live

### Recommendation: keep `ExerciseSession` as the one session header for every kind, and add new tables for sets and movements. Do not use a JSONB blob.

Why keep the header:
- One session, one WORKOUT row, `sourceId = session.id`. Every ledger reader, the reversal, the Health Connect ingest transaction, the competency JOIN, the snapshot's PB pace and the "Counts as" link already key on it.
- A second session table would mean a second `sourceId` namespace and changes to every reader.

Why new tables rather than P25's `sets JSONB` + `volumeKg` on the session (`blueprint-plan:519`):
1. **The 5-second action is one write per set**, logged during the workout. A set table makes each "Set done" an insert keyed by `clientId` (the phone's offline queue replays safely). With JSONB, each set would be a read-modify-write of the session row.
2. **PB and "max weight" reads go per movement across history** (heaviest set, rep-maxes, e1RM). An index on (userId, movementId, weightKg) serves them. JSONB would need `jsonb_array_elements` scans.
3. **Editing one set** (a typo in the weight) and the **SQL CHECKs per field** follow the house style (TaskSession, Competency).
4. JSONB only wins if sets are always typed after the session in one go, and that rules out live logging.

Sketch (hand-authored, additive, no foreign keys, CHECKs in SQL, like `20270101000000_task_proof`; the next free timestamp after `20270102000000_proof_qty`, and P25 had reserved `20270103000000_strength_sets`):

```
ExerciseSession  (existing; ADD COLUMN only)
  kind        TEXT  — add a CHECK: WALK | RUN | CYCLE | SWIM | ROW | STRENGTH | MOBILITY | SPORT
  distanceKm  NOT NULL kept; 0 = "no distance" for STRENGTH/MOBILITY/SPORT (no altered column)   ← decision D-a
  + label      TEXT NULL      ("Push day", "Tennis"; 1..40)
  + startedAt  TIMESTAMPTZ NULL, endedAt TIMESTAMPTZ NULL   (a live session; null on a typed one)
  + source     TEXT NOT NULL DEFAULT 'manual'   (manual | capture | import | phone; BodyWeight precedent)
  + clientId   TEXT NULL, UNIQUE (userId, clientId)
  partial UNIQUE (userId) WHERE startedAt IS NOT NULL AND endedAt IS NULL   — one open session a user

ExerciseMovement (new): the user's own exercise names
  id, userId, name (1..40), normName, pattern TEXT (WEIGHTED | BODYWEIGHT | TIMED | CARRY), archivedAt
  partial UNIQUE (userId, normName) WHERE archivedAt IS NULL
  (a starter catalogue lives in code: squat, bench, deadlift, OHP, row, pull-up, …, picked on first use, never DB-seeded)

ExerciseSet (new)
  id, userId, sessionId (no FK: the session's delete removes its sets in the same $transaction array),
  movementId, ord INT, setType TEXT (NORMAL | WARMUP | DROP | FAILURE),
  dropOf TEXT NULL (the set this drop continues: a drop set is a chain 85×8 → 65×6 → 45×8), groupKey TEXT NULL (superset),
  reps INT NULL (1..100), weightKg DECIMAL(6,2) NULL (−200..500; negative = assisted; bodyweight = added load),
  durationSec INT NULL (1..3600: planks, holds), distanceM FLOAT NULL (carries, sled),
  rir SMALLINT NULL (0..10, a record only, never priced), doneAt TIMESTAMPTZ NOT NULL, clientId TEXT NOT NULL,
  UNIQUE (userId, clientId); INDEX (sessionId); INDEX (userId, movementId, weightKg)
```

Rules that follow:
- **kg are stored and the unit is display only**, as with BodyWeight and WeightGoal.unit (schema :948–993). Steps are 2.5 kg or 5 lb.
- **Derived on read, never stored** (the house rule "no mutable counters"): set count, reps, volume load (Σ reps × kg over NORMAL, FAILURE and DROP sets, not warm-ups), top set, heaviest set per movement, e1RM. Epley is w·(1 + r/30), used only for 1 ≤ r ≤ 12 on NORMAL or FAILURE sets.
- **Pay is written once, at Finish**, never per set. If the session sits on the curve, it is one WORKOUT row with a new receipt version (say `session-1`: kind, minutes, met, intensity, w, wBefore, effort, countedEffort, multipliers, a summary of sets and volume). Minutes = min(reported or ended − started, last set + grace, 180), the proof-of-work bound. A session left open past its life day is closed lazily at its last set plus the grace.
- **Editing a set after pay never changes the pay**, because pay reads minutes, not load. Editing the minutes after pay follows the delete rule (same day: reverse and re-pay; later: no change).
- **`readLiveWalks` becomes `readLiveSessions`**: it reads `walk-1` and `session-1`, so the day's W and the crit's k span every kind (H4). This is the one change that keeps C10 true.
- **Decision D-a.** Write 0 into `distanceKm` (purely additive, and a rolled-back build shows a "0 km walk" rather than crashing), or `ALTER COLUMN "distanceKm" DROP NOT NULL`. That second option is an altered column, which `momentum.md:36` and the exercise migration both avoid, and an old build would crash on `null.toFixed` after a rollback. I recommend 0 plus kind-aware readers.

---

## 6. 5-second actions for exercise (UI engineering)

Target: each action takes ≤ 2 taps and < 5 s at 344 px, every target ≥ 44 px (40 px for the history Delete).

| Action | Tap path | Prefill |
|---|---|---|
| **Set done** | one tap on the open row's ✓ | the movement's last set this session, else last session's same `ord` ("last 80 × 8"). ± steppers (2.5 kg / 1 rep) only when it changed |
| **Drop** | one tap "Drop" on a just-done set | a new DROP row linked by `dropOf`, weight cut by about 20–25 % (rounded to the step), reps blank, timer not restarted |
| **Warm-up / failure tag** | long-press, or a W/F chip on the row | the common W / D / F set-type convention (Strong, Hevy) |
| **Again (cardio)** | one chip "Again: 5 km · 28 min" | the last session of that kind, today's date |
| **Finish** | one tap | minutes from the wall clock, "Counts as: Gym legs" pre-selected (the existing link), the pay or record line from the server |

Phone:
- The quick-settings tile and the Fold cover-screen widget are the natural homes for "Set done" during an open session.
- It needs a `SendQueue` kind SET keyed by `clientId`. Sets can be queued; review answers stay never-queued.
- It needs a GET that serves the open session and the "last time" values, for example in `/status` or a new GET /exercise.
- Health Connect: extend `HealthLine.kindOf` to running (56/57), biking (8/9), swimming (73/74), rowing machine (54), strength (70), weightlifting (81), yoga (83), pilates (48), stretching (71) and HIIT (36). `READ_EXERCISE` is already granted for all of them. A distance-less kind must not need ≥ 10 m. Health Connect carries segment types and repetitions, but **no load**, so imported strength is a session (minutes) with no sets. This reverses part of D22 ("no other workout"); the user's "all rights" covers it, but write it down as a decision.

Capture (web and phone POST /log):
- A whole-line lift grammar such as "bench 3x8 80kg", "squat 5x5 100" or "run 5k 28m" could route to a session as weigh-ins do: a precheck like `mayBeWeighIn`, a chip, and an escape hatch back to a task.
- It collides with pinned fixtures in `scripts/capture-parse-check.ts`: :180 `x run 30m` (a done-now tick), :183–184 `run 5km` / `run 5k 28m` (tasks), :214 `walk 90min`, :284 `5x5 squats` (a title). There is also the done-now habit match ("x gym 45m" ticks a due Gym habit, `blueprint-plan:231`).
- Recommendation: leave the task parser alone. Add a separate pure `lift-parse.ts` that claims a line only when it has a set pattern (N×M [@] W [kg|lb]) and a known movement.

---

## 7. UI conventions any new exercise surface must keep (and the pins that enforce them)

- **344 px first.** The card content box is 278 px. Every target is ≥ 44 px measured on the element (`momentum.md:581`). In `train.css`, `scripts/train-check.ts:322–340` pins: `.wt-input` at 44 px tall and **16 px** font at every width, `.wt-log` at 44 px, `.wt-del` and `.wt-item` at 40 px, the **12 px font floor**, `@layer components`, the layer-order first line, **no transition, animation, keyframes or !important**, and a 2 px focus-visible outline. Every class must be `wt-*` and must not collide with a Tailwind utility (`train-check.ts:443–445`).
- **Honesty and record-not-reward.**
  - The card states only what the server paid and prices nothing on the client.
  - The T0 mark is the server's `pay.xp` only, and only T2/T3 celebrations are enqueued (`train-check.ts:385–395`).
  - Before or without pay the line is the record ("Logged …"); a refusal says "Recorded · <why>".
  - Weight copy has no praise words, no shame words, no exclamation marks, and on the weight card no "XP", "MP" or "streak" (`train-check.ts:302–311`).
  - Imports are restricted: no xp, streak, life-grade, life-economy, rewards, mastery, tasks, roll or server value; from momentum.ts, display helpers only (`train-check.ts:399–412`).
  - Day words come from fixed English arrays, never the locale (`ExerciseCard.tsx:61–67`).
- **Word budgets.** None are set yet for Train. `ui-motion.md:1990` defers non-roadmap budgets to "Phase 3 adoption". The norms are ≤ 8 app words per Today line (`ui-motion.md:1758`) and counting with `scripts/word-count.mjs`; numbers and honesty marks are never cut to meet a budget (`ui-motion.md:104`). Give the set logger its own budget and pin it in train-check.
- **Style.** English only. System-novel function words (Quest, Status, Seal) are fine. No CJK and no cultivation dressing (memory). Use the app's tokens.
- **Process** (memory). Screenshot the changed elements at 344 px first, from `/dev/style/train` fixtures or the rehearsal server, never production data, and send them. Then commit and push after each step.

---

## 8. Research notes (domain knowledge, not fetched this session; verify before pinning)

- **ACSM metabolic equations.** Walking VO₂ = 0.1·s + 1.8·s·G + 3.5, which the app already uses. Running VO₂ = 0.2·s + 0.9·s·G + 3.5 (s in m/min, valid above about 134 m/min). Leg cycling VO₂ = 1.8·(work rate)/body mass + 7, which needs watts plus the BodyWeight reading the app already keeps.
- **Compendium of Physical Activities** (Ainsworth 2011; 2024 adult update). Resistance training, general, about 3.5 MET; vigorous or power lifting about 6.0; circuit about 8.0; hatha yoga 2.5; stretching 2.3; pilates 3.0; cycling under 16 km/h 4.0, 19–22 km/h 8.0; swimming freestyle slow to fast 5.8 to 9.8; rowing ergometer moderate to vigorous 4.8 to 8.5+; tennis singles about 8.
- **WHO 2020.** 150–300 min moderate or 75–150 min vigorous a week (vigorous counts double; this matches EX_EFFORT_WEIGHT 1/2), plus muscle-strengthening on ≥ 2 days a week.
- **e1RM.** Epley w(1 + r/30) and Brzycki w·36/(37 − r). Both are reasonable at ≤ 10–12 reps and unreliable on fatigued (drop) sets.
- **Set types.** Logging apps' W / D / F (warm-up, drop, failure) is a known convention. A drop typically cuts the load by about 20–30 %. Meta-analyses find drop sets about as effective as traditional sets for hypertrophy, in less time.
- **RIR-based RPE** (Zourdos 2016). Record only. Never price it: `dropped.md:8`.

---

## 9. Decisions to put to the user or lead

1. Should strength go on the day curve, which changes the Gym-habit economics (§4.2: 23.3 → 20.1 when "Counts as"), or stay a record that ticks the habit (option d)?
2. Should strength PBs be a Seal with no XP (recommended), or pay +15 behind P25's 2× guard?
3. Do the Vitality perks apply to every curve-paid kind? (This means renaming them and re-pinning the copy.)
4. Should Health Connect widen beyond walks and hikes? (This reverses part of D22.)
5. D-a: `distanceKm` = 0, or DROP NOT NULL?
6. A capture lift grammar now, or after the web logger?
