# M5 contracts (lane 0)

What lanes A, B, C and D (phase A) and phase B build on. The spec is `m5-refit.md`. Everything below is **frozen**: changing a name, a value, a shape or a signature is a lead decision, not a lane edit. A lane fills in the body behind a signature and may add private helpers (and new exports) in the files it owns. Each lane-0 file carries the same export list in its header comment.

Every stub carries a `// STUB: lane A implements (F<n>)` comment. Before handing off, lane A greps `STUB: lane A` across `src/lib` and leaves none behind.

With every stub in place the tree compiles (`npx tsc --noEmit -p .` is clean), eslint is clean on the lane-0 files, and `life:check`, `ui:check`, `novelty-check`, `skills:stats` and `balance:horizon` pass unchanged. `npx tsx scripts/character-check.ts` passes §1–§3 (123 checks). Until lane A lands, `loadLifeTracks` returns the not-launched view, so every page shows exactly today's numbers.

M5 is inert until the lead sets `LIFE_LAUNCH_DAY`. Nothing in phase A may write, pay or show a life level before that.

## 1. `src/lib/life-economy.ts` (pure, client-importable; final)

It imports only types from `life-types` and `life-day`. It never imports Prisma, today-board or any module with values.

| Export | Value / signature |
|---|---|
| `TRACK_LEVEL_STEP` | `7`. `pointsLevel = floor(√xp / 7)`; level 10 needs 4,900 XP |
| `TRACK_DEPTH_WEEK_COEF` | `1.25` |
| `TRACK_DEPTH_GRACE` | `1` |
| `LEVEL_EPSILON` | `1e-9`, the guard in every `floor` over a depth or a √ |
| `GOAL_DEPTH` | `{ SHORT: 0, MID: 1, LONG: 2 }`. Only paid goals count |
| `GOAL_DEPTH_CAP` | `2` per track |
| `pointsLevel(xp)` | `floor(√max(0, xp) / 7 + 1e-9)` |
| `xpForLevel(L)` | `(7L)²` |
| `trackDepth(keptWeeks, goalDepth = 0)` | `1.25·√max(0, kw) + min(2, max(0, gd))` |
| `depthCap(depth)` | `1 + floor(depth + 1e-9)` |
| `trackLevel(xp, keptWeeks, goalDepth = 0)` | `min(pointsLevel(xp), depthCap(trackDepth(kw, gd)))`. No PR argument. Goldens in §1 of character-check |
| `moreKeptWeeks(keptWeeks, goalDepth = 0)` | `max(1, ceil(((floor(depth) + 1 − min(2, gd)) / 1.25)² − kw − 1e-9))`. Exact: n weeks raise the cap and n − 1 do not (checked for kw 0..300, gd 0..2) |
| `KEPT_WEEK_STREAK_DAYS` | `7`. The kept-week bonus is `streakBonusPercent(7 × keptStreak)`; it is applied by life-tracks `keptWeekBonusPercent` |
| `TRACK_SHARE_CAP` | `16` (review C6). A track's share of one attribute is at most `max(seed share, 16)` points of 100; life-tracks `trackComposition` applies it. Σ over the four tracks of `max(seed, 16)` is 96 for every attribute, the seeds' own ceiling, so assertion 9's 13.82 bounds any mix (assertion 9b) |
| `KEPT_MIN_DAYS`, `KEPT_MIN_RAW` | `3`, `30` |
| `BODY_EFFORT_MINUTES` | `150` |
| `EFFORT_CATEGORY` | `'EXERCISE'`: only these receipts give effort minutes (HEALTH never does) |
| `EFFORT_WEIGHT` | `Record<Band, number>`: `{ INTRO: 0, STANDARD: 1, DEMANDING: 2, SEVERE: 2 }` |
| `effortWeightOfB(b)` | The weight from a receipt's B factor value: 5 → 0, 10 → 1, 20 → 2, 35 → 2. A non-finite value gives 0 |
| `DUTY_MIN_OCCURRENCES` | `3` |
| `DUTY_FALLBACK_COMPLETIONS` | `5` (on ≥ `KEPT_MIN_DAYS` days, raw ≥ `KEPT_MIN_RAW`) |
| `WEEK_JUDGE_LAG_DAYS` | `3`: week W is judged from Wednesday 04:00 after its Sunday |
| `WEEK_JUDGE_MAX_WEEKS` | `12` per run |
| `BACKFILL_PREFIX` | `'backfill · '` |
| `weekRowKey(track, weekKey)` | `'week:<TRACK>:<YYYY-Www>'` |
| `parseWeekRowKey(key)` | `{ track, weekKey } \| null` |
| `weekIsBackfill(sunday, launchDay)` | `sunday < launchDay`. A Sunday equal to the launch day mints |
| `isBackfillDetail(detail)` | `detail.startsWith('backfill')`. This is the snapshot test |
| `withoutBackfill(detail)` | The reason line without its prefix, for display |
| `LifeMpReason` | `'LIFE_WEEK_KEPT' \| 'LIFE_FULL_DAY' \| 'GOAL_SHORT' \| 'GOAL_MID' \| 'GOAL_LONG'` |
| `GoalMpReason` | `'GOAL_SHORT' \| 'GOAL_MID' \| 'GOAL_LONG'` |
| `ReservedMpReason`, `RESERVED_MP_REASONS` | `'LIFE_PR'`: reserved, never minted |
| `LIFE_MP_REASONS` | The five `LifeMpReason`s |
| `DECAY_GRACE_REASON` | `'DECAY_GRACE'`: a zero-delta reason that resets decay's idle clock |
| `LIFE_MP` | `{ WEEK_KEPT: 1.5, FULL_DAY: 0.5, GOAL_SHORT: 1, GOAL_MID: 6, GOAL_LONG: 20 }`, typed `number` so lane D can bump them temporarily |
| `LIFE_MP_WEEK_CAP` | `8` per life week (Monday–Sunday, by the mint's day) |
| `CAPPED_REASONS` | `['LIFE_WEEK_KEPT', 'GOAL_SHORT', 'LIFE_FULL_DAY']`. Trim order inside a week: Short goals at close, then kept tracks in `TRACKS` order, then full days (M2) |
| `isCappedReason(r)` | `boolean` |
| `LIFE_MP_REASON_LABEL` | `Record<LifeMpReason, string>`, for the rules page and the You sheet |
| `round2(x)` | MP to 2 dp. This is life-grade's `roundTo(x, 2)` (half away from zero, with a 1e-7 nudge) |
| `cappedMp(amount, used, cap = 8)` | `round2(clamp(amount, 0, cap − used))` |
| `weekKeptMintKey(track, weekKey)` | `'mp:LIFE_WEEK_KEPT:<TRACK>:<YYYY-Www>'` |
| `GOAL_MINT_PREFIX`, `goalMintKey(id)`, `goalIdOfMintKey(key)` | `'mp:GOAL:<goalId>'` |
| `MINT_DETAIL_SEP` | `' · '` |
| `mintDetail(reason, why?)` | `why ? reason + ' · ' + why : reason`. Used by MP_MINT.detail and MasteryLedgerEntry.detail |
| `parseMintDetail(detail)` | `{ reason, why }`: the reason is the text before the first `' · '`, and why is the rest or `null` |
| `LifeMintInput` | `{ reason: LifeMpReason; delta; why?; dedupeKey; day; track?; templateId? }`: one planned mint. `delta` ≥ 0 is already rounded and capped, and 0 writes the decision row alone |
| `GOAL_PAY_BAR` | `0.7` |
| `GoalRule`, `GOAL_RULES` | `Record<Horizon, GoalRule>`: `{ horizon, name 'Short'/'Mid'/'Long', reason, stated, bar, binary, minLifetimeDays, maxPaying, window 'LIFE_WEEK'/'ROLLING', windowDays, depth, capped }`. SHORT is 1 / bar 1 / binary / 3 d / 2 per life week / depth 0 / capped. MID is 6 / 0.7 / 21 d / 2 per rolling 30 d / depth 1. LONG is 20 / 0.7 / 90 d / 1 per rolling 91 d / depth 2. A rolling window is the days (close − N, close] |
| `statedGoalMp(h)`, `payBar(h)`, `goalReasonOf(h)` | Read from `GOAL_RULES` |
| `MEASURED_GOAL_METRICS`, `isMeasuredGoalMetric(m)` | `['CHILDREN', 'MANUAL']` |
| `LIFE_LAUNCH_DAY` | `null as DayKey \| null`. **Lead only**, set in the launch commit |
| `LIFE_LAUNCH_DAY_ENV`, `LIFE_JUDGE_ENV` | `'XTNL_LIFE_LAUNCH_DAY'`, `'XTNL_LIFE_JUDGE'` |
| `LifeEnv` | `{ NODE_ENV?, XTNL_LIFE_LAUNCH_DAY?, XTNL_LIFE_JUDGE? }`: a test seam. The default reads `process.env` |
| `isDayKey(x)` | A real calendar `'YYYY-MM-DD'` (`'2026-02-30'` is not one) |
| `lifeLaunchDay(env?)` | Outside production, a valid `XTNL_LIFE_LAUNCH_DAY`. Otherwise `LIFE_LAUNCH_DAY` |
| `isLaunched(today, launchDay = lifeLaunchDay())` | `launchDay != null && today >= launchDay` |
| `lifeWritesEnabled(env?)` | `NODE_ENV === 'production' \|\| XTNL_LIFE_JUDGE === '1'` |

The gates are server decisions. On a client the two `XTNL_` variables are undefined, because they are not `NEXT_PUBLIC_`. Pages pass `launched` down from `LifeTracksView`.

## 2. `src/lib/character.ts` (pure; final)

| Export | Signature |
|---|---|
| `characterRaw(fieldLevels, trackLevels = [])` | `Σ max(0, L)^0.75`, Fields first. With no tracks it is bit-identical to today's sheet-math `characterRaw` |
| `characterLevel(fieldLevels, trackLevels = [])` | `{ level: floor(raw), progress: clamp(raw − level, 0, 1) }`. With no tracks it equals today's shell `characterLevelOf` exactly, and `.level === xp.fieldLevel(levels)` |

Track levels here are the plain `TrackState.level`, never the bonus-scaled `effectiveLevel`; the attributes read `effectiveLevel`. Lane B makes shell-types `characterLevelOf(fieldLevels, trackLevels = [])` delegate here. Lane C does the same for sheet-math `characterRaw(fieldLevels, trackLevels = [])`.

## 3. `src/lib/life-tracks.ts` (pure, client-importable)

Labels and constructors are final (lane 0). The ledger readers are stubs that lane A implements (F3).

| Export | What | By |
|---|---|---|
| `WeekMark` | `'kept' \| 'held' \| 'missed'`. `'held'` is never produced before M2. It is structurally SheetSections' `WeekPip` | final |
| `LifeSigil` | `'body' \| 'duty' \| 'craft' \| 'care'`, assignable to ui/Icon's `TrackSigil` | final |
| `TRACK_NAME` | Body, Duty, Craft, Care. It is life-grade's `TRACK_LABEL`, so there is one source | final |
| `TRACK_SIGIL` | `{ BODY: 'body', DUTY: 'duty', CRAFT: 'craft', CARE: 'care' }` | final |
| `DISPLAY_ORDER` | `['DUTY', 'CRAFT', 'BODY', 'CARE']`, for display. Mints and plans use life-types `TRACKS` (BODY, DUTY, CRAFT, CARE) | final |
| `LIFE_ROW_PREFIX`, `lifeRowName(track)` | `'Life · '`, `'Life · Body'` | final |
| `keptWeeksRaiseCopy(n)` | `'1 more kept week raises it'`, or `'7 more kept weeks raise it'` | final |
| `keptWeekBonusPercent(keptStreak)` | `streakBonusPercent(7 × keptStreak)`: +20% at 10 weeks. Not amplified by STREAK_AMPLIFIER | final |
| `LedgerXpDay` | `{ track, day, xp }` | shape |
| `LedgerComposition` | `{ track, key: string \| null, xp, composition: Composition \| null }` | shape |
| `LedgerWeek` | `{ track, weekKey, sunday, kept, detail }` | shape |
| `LedgerMint` | `{ key, track \| null, templateId \| null, day, qty, reason, why \| null }` | shape |
| `LifeLedger` | `{ epochDay: DayKey \| null, xpByDay, compositions, weeks, mints }` | shape |
| `TrackState` | `{ track, xp, pointsLevel, keptWeeks, keptStreak, goalDepth, depth, cap, level, atCap, bonusPercent, effectiveLevel, composition }`. `composition` is the full `Record<Attribute, number>` | shape |
| `LifeTrackRow` | `{ track, name, sigil, level, xp, nextXp, cap, atCap, keptWeeks, keptStreak, goalDepth, banked, now, weeks: WeekMark[], line, edge }` | shape |
| `LifeEdges` | `{ body, duty, craft, care }`, structurally ui/Crest's `TrackEdges` | shape |
| `LifeContribution` | `FieldContribution & { source: 'LIFE' }` | shape |
| `LifeTracksView` | `{ launched, today, levels: Record<Track, number>, rows, contributions: LifeContribution[], edges: LifeEdges \| null, mpThisWeek: { used, cap }, mpLastWeek: { used, cap, weekKey: string \| null, backfill: boolean }, judgedWeeks: string[], lastJudgedWeek: string \| null }`. `mpLastWeek` (review U1) is `lifeMpInWeek` of the last judged week's Monday, the figure the hero and /today/week's footer show; `weekKey` is null (used 0) until a week is judged; `backfill` is true when that week's WEEK rows carry the 'backfill · ' prefix (phase B review). `mpThisWeek` stays for the checks and the launch script; no UI reads it | shape |
| `LevelSeries` | `{ sundays: DayKey[]; tracks: { track, name, levels: number[] }[] }` (DISPLAY_ORDER, oldest first) | shape |
| `KeptWeekGrid` | `{ weeks: { weekKey, monday, sunday }[]; rows: { track, name, weeks: WeekMark[] }[] }`: the same columns for every track | shape |
| `zeroLevels()`, `emptyLifeLedger(epochDay = null)` | | final |
| `notLaunchedView(today)` | `{ launched: false, levels all 0, rows [], contributions [], edges null, mpThisWeek { 0, 8 }, mpLastWeek { 0, 8, null, backfill false }, judgedWeeks [], lastJudgedWeek null }` | final |
| `lifeContributionRows(states)` | One row per state with level > 0: `{ fieldName: lifeRowName, level: effectiveLevel, composition, source: 'LIFE' }` | final |
| `lifeContributionsAt(ledger, day)` | `lifeContributionRows(trackStateAt(ledger, day))` | final (it reads lane A's `trackStateAt`) |
| `trackStateAt(ledger, day)` | `TrackState[]` in `TRACKS` order (F3 rules) | **STUB A** (until then: all zero) |
| `trackRowsView(ledger, today)` | `LifeTrackRow[]` in `DISPLAY_ORDER` (F3 meter, banked, pips and line copy) | **STUB A** |
| `judgedWeekKeys(ledger)` | Week keys with a WEEK row for **every** track, oldest first. This is `LifeTracksView.judgedWeeks`, and `maybeJudgeWeeks` tests the latest one | **STUB A** |
| `lifeMpInWeek(ledger, monday)` | Σ qty of mints whose reason is in `CAPPED_REASONS`, dated in `[monday, monday + 6]` | **STUB A** |
| `levelSeries(ledger, n = 12)` | `LevelSeries` over the last ≤ n judged Sundays | **STUB A** |
| `keptWeekGrid(ledger, n = 12)` | `KeptWeekGrid` over the last ≤ n judged weeks (the columns are `judgedWeekKeys`) | **STUB A** |
| `trackLine(state)` | One row's line, exactly the F3 strings. No per-row goal clause (review U7): the Life tracks aside says once 'levels capped by kept weeks and paid goals' | lane A |
| `lifeTracksView(ledger, today, launchDay?)` | The whole view `loadLifeTracks` returns, pure | lane A |
| `trackShareCap(track, attribute)` | `max(TRACK_SEED[track][attribute], TRACK_SHARE_CAP)` | review C6 |
| `clampTrackComposition(track, composition)` | Scales the pull away from the seed back, by one factor for every attribute, until none is above its `trackShareCap`. The result sums to 100 and keeps the pull's direction; a mix already within the caps is returned unchanged. `trackComposition` applies it after `effectiveFieldComposition` | review C6 |

## 4. `src/lib/life-tracks-server.ts` (server; stub, lane A implements F3)

| Export | Signature | Stub |
|---|---|---|
| `loadLifeLedger(userId)` | `Promise<LifeLedger>`. `cached('lifeLedger:' + userId, ['life'])`, with five reads in one `Promise.all`. As built: the empty ledger, with no query, until `isLaunched(todayKey())`, and while the user has no epochDay | `emptyLifeLedger()` |
| `loadLifeTracks(userId, now?)` | `Promise<LifeTracksView>`, wrapped in React `cache()`. Not launched (`isLaunched(todayKey(now))` false) or no epochDay → `notLaunchedView(today)`. Otherwise the full view. The celebration snapshot does not call it (review C1): it builds `lifeTracksView(await loadLifeLedger(userId), today)` itself, because React `cache()` keys a Date by identity | `notLaunchedView(todayKey(now))`, with no DB |
| `readLifeLedger(userId)` | The same five reads, uncached and ungated. Only `scripts/life-launch.ts` uses it (lane A) | — |
| `lifeMintLockOp(userId)` | `SELECT pg_advisory_xact_lock(hashtext('life-mint:' \|\| userId))`. The first op of every `$transaction` that mints life MP: a goal close and each judged week (review C3) | — |
| `isStaleGuard(err)` | True for a guard op's deliberate division by zero (SQLSTATE 22012) | — |

## 5. `src/lib/goals.ts` (pure; shell, lane A implements F6)

| Export | What | By |
|---|---|---|
| `GoalStep` | `{ completedDay: DayKey \| null }`: a non-recurring, non-goal, non-archived child | shape |
| `GoalProgressRow` | `{ day, qty }`: Σ GOAL_PROGRESS on one day | shape |
| `GoalProgressInput` | `{ krMetric: KrMetric \| null (null reads as CHILDREN), krTarget, steps, progress }` | shape |
| `GoalMintRow` | `{ key, templateId, track, reason, day, qty, occurredAt?: number }`: one 'mp:GOAL:*' row. `occurredAt` (epoch ms, review C5) orders two closes on one day; `goalDepthAdded` orders by day, then occurredAt, then key, as snapshot `readGoals` does | shape |
| `GoalInput` | `GoalProgressInput & { id, horizon, track, goalMp, dueDay, createdDay, today, launchDay, goalMints, cappedUsedThisWeek }` | shape |
| `GoalPayout` | `{ horizon, track, reason: GoalMpReason, stated, bar, scaled, g, pays, why: string \| null, depth }`. `scaled` is the amount before the gates and the cap: SHORT pays `stated` when g = 1, MID and LONG pay `round2(stated × g)`. `why` is null when it pays `scaled` in full | shape |
| `GoalClosed` | `{ paid, depth, day, why }` | shape |
| `GoalLadderItem` | `{ id, title, horizon, track, stated, copy, g, progressLabel, dueDay, pastDue, carried, preview: GoalPayout \| null, closed: GoalClosed \| null }` | shape |
| `GoalLadder` | `{ open: GoalLadderItem[]` (LONG → MID → SHORT, then by due day)`; closed: GoalLadderItem[]` (the last 30 days, newest first)` }`. A closed item's `g` and `progressLabel` are measured as of `goalAsOf(closeDay, dueDay)` (review U5); `g` is null when that cannot be measured or the close's why starts 'not measured'. `paid` is still the stored decision row | shape |
| `goalAsOf(today, dueDay)` | `min(today, dueDay)` | final |
| `statedPayoutCopy(horizon, stated = statedGoalMp(h))` | SHORT gives `'pays ⬡ 1 when done'`. MID and LONG give `'pays ⬡ 6 × progress from 70%'`, with their own stated amount | final |
| `goalProgress(input, asOf)` | `number \| null` (F6) | **STUB A** (null) |
| `closeDecision(input)` | `GoalPayout`. The gates run in F6 order, then the SHORT cap trim or MID/LONG `stated × g`; depth is `min(GOAL_DEPTH[h], 2 − the track's goal depth)` when it pays. Its limit gates count through `goalLimitWindow` | **STUB A** (pays 0) |
| `goalPercent(g)` | `floor(clamp01(g) × 100 + 1e-9)`: 2/3 → 66, 0.695 → 69, 0.7 → 70. The one percentage Today's goal cards and the You ladder render (review U6) | review |
| `GoalLimitWindow`, `goalLimitWindow(input)` | `{ reason, from, to, paying, cappedWeek: { monday, sunday, used } \| null }`. The window is the close day's life week for SHORT, otherwise `[close − N + 1, close]` (N = 30 or 91). `paying` counts this reason's paying rows in the window, the goal's own row excluded. `cappedWeek` is set for SHORT only. `closeDecision` decides from it, and goals-server's guard re-counts it inside the close transaction (review C3) | review |
| `closedGoalReading(input, closeDay, why)` | `{ g, progressLabel, asOf }` for a closed goal (review U5) | review |

## 6. `src/lib/life-weeks.ts` (pure; shell, lane A implements F4)

| Export | What | By |
|---|---|---|
| `WeekTaskRow` | `{ id, source: 'TASK' \| 'UNDO', dedupeKey, day, track, templateId, rawXp, receipt: Receipt \| null, category: Category \| null }` | shape |
| `WeekTemplate` | `{ id, kind, recurrence, startDay, dueDay, archivedDay }` (compulsory, archived ones included) | shape |
| `WeekInstance` | `{ templateId, day, status }` | shape |
| `WeekMintRow` | `{ day, qty, reason }` (reason from `parseMintDetail`) | shape |
| `WeekJudgeState` | `{ today, launchDay, epochDay, judged: ReadonlySet<string>` (WEEK dedupe keys)`, rows, templates, instances, mints, heldDays: ReadonlySet<DayKey>` (empty in M5)`, maxWeeks? }` | shape |
| `WeekTrackPlan` | `{ track, kept, detail }` | shape |
| `WeekPlan` | `{ weekKey, monday, sunday, backfill, tracks: WeekTrackPlan[]` (missing tracks only, in TRACKS order)`, mints: LifeMintInput[]` (empty for backfill)` }` | shape |
| `lastJudgeableSunday(today)` | The Sunday on or before `today − 3` | final |
| `judgeDayOf(sunday)` | `sunday + 3`: the Wednesday it is first judged. /today/week's "first week is judged on Wednesday 7 October" | final |
| `planWeeks(state)` | `WeekPlan[]`, oldest first, ≤ maxWeeks; empty when launchDay or epochDay is null | **STUB A** ([]) |
| `WeekToJudge`, `weeksToJudge(today, epochDay, judged, maxWeeks?)` | The weeks a run covers, so the server reads exactly their days | lane A |
| `ledgerWithPlans(ledger, plans)` | A copy of the ledger with the planned WEEK rows and LIFE_WEEK_KEPT mints folded in; a row already present (by week and track, or by mint key) is not added twice. The launch script's dry run computes everything after the plan from it (review C2) | review |

## 7. Signatures other lanes create (frozen here; lane 0 did not stub them)

Lanes B and C code against these. A lane that imports one before its owner lands it may see tsc report the missing export or module; that is expected and is resolved when the lanes merge. A lane never adds the missing export to another lane's file.

Lane A:
- **activity.ts** `activityData`: a WEEK or MP_MINT row keeps `track` when `isTrack(e.track)`. Every other non-TRACK row stores null, and TRACK rows still require a track.
- **streak-curve.ts**: `NEVER_STREAK_SOURCES` gains `'WEEK'` and `'MP_MINT'`.
- **habit.ts**: `export function instanceOutcome(statuses: readonly string[] | undefined): 'kept' | 'held' | 'missed' | null`. This is today's private `dayOutcome`; UNDONE reads as absent.
- **full-day.ts**: `FULL_DAY_MP = LIFE_MP.FULL_DAY` (still 0.5, still unpaid).
- **mastery.ts**: `mintLifeMasteryOps(userId: string, mint: LifeMintInput & { now: Date })` returns the ops for a `$transaction` array: the MP_MINT `activityOp` (sink NONE, `sourceId = templateId`, `qty = delta`, `detail = mintDetail(reason, why)`, the dedupeKey), then a `masteryLedgerEntry.create({ data: { userId, delta, reason, detail } })` only when `delta > 0`. The pure `lifeMintData(userId, mint & { now })` returns `{ event: ActivityInput; ledger: { userId; delta; reason; detail } | null }`. `decayStaleMastery`'s idle clock also counts `DECAY_GRACE_REASON`.
- **life-weeks-server.ts** (new): `judgeClosedWeeks(userId: string, now: Date, opts?: { force?: boolean; dryRun?: boolean; moments?: boolean; maxWeeks?: number }): Promise<{ launched: boolean; plans: WeekPlan[]; committed: string[] }>` (`committed` = week keys written).
  - `moments` defaults to true. When it is false, the plans are committed without `withMoments`; the launch script uses this.
  - `maxWeeks` is honoured only with `dryRun` (default 12). The launch script's dry run passes 520.
  - The withMoments snapshots each get their own Date (`new Date(now.getTime())`).
  - Each week's array opens with `lifeMintLockOp`.

  `maybeJudgeWeeks(userId: string, now?: Date): Promise<void>` never throws, flies once per user at a time, and is called inside `after()`. It also returns early until the launch's DECAY_GRACE row exists; once seen, that result is held in memory for the process.

  `launchGraceDetail(launchDay)` = `'life launch <day>'`: that row's detail (review C4).
- **goals-server.ts** (new): `readGoalCloseInput(userId, goalId, now: Date): Promise<GoalInput | null>`; `closeGoalCore(userId, goalId, now: Date, launchDay?: DayKey | null): Promise<{ ok: true; payout: GoalPayout } | { ok: false; error: string }>`.
  - Before launch it refuses with `GOAL_CLOSE_BEFORE_LAUNCH` = `'Goals can be closed once life counts.'` and reads and writes nothing (phase B review).
  - The transaction is `[lifeMintLockOp, closeGuardOp (only when it pays), the template update, the mint ops]`.
  - A P2002 gives `'Already closed.'` (`goals.ts GOAL_ALREADY_CLOSED`). Both guard subqueries leave out the goal's own key, so a same-goal race reaches the P2002. A failed guard gives `GOAL_CLOSE_STALE` = `'Something changed; try again.'` (exported, review C3).

  `rescheduleGoalCore(userId, goalId, day: DayKey, now?): Promise<{ ok: true } | { ok: false; error: string }>`.

  `loadGoalLadder(userId: string, now?: Date): Promise<GoalLadder>` is cached `'goalLadder:<user>:<today>'` with tags `['life', 'activity']`.

  `stateGoalMp(userId: string): Promise<number>` returns the rows updated.
- **actions/tasks.ts**: `closeGoal(goalId: string, opts?)` returns `{ paid, g, why, depth, celebrations }`; `previewGoalClose(goalId: string)` returns `GoalPayout | null` (null when the goal is not open) and is read-only; `rescheduleGoal(goalId: string, day: DayKey)`. Each follows the module's existing result convention.

Lane B:
- **attributes.ts**: `FieldContribution.source?: 'FIELD' | 'LIFE'`, passed through by `sourcesFor`.
- **skill-effects.ts**: `export function scoresWithStreak(rows, streakBonuses, streakMultiplier, lifeRows: FieldContribution[] = [])`. The life rows are appended unamplified.
- **shell-types.ts**: `characterLevelOf(fieldLevels: number[], trackLevels: number[] = [])` delegates to `character.ts characterLevel`.
- **celebration-detect.ts**: `LevelsPart.tracks?: Record<string, number>`; `GoalRow` gains `paid?`, `why?`, `track?`; `LedgerRow` gains `mp?`. All optional.

Lane C:
- **sheet-math.ts**: `characterRaw(fieldLevels, trackLevels = [])` delegates to `character.ts`. `mainSourceOf(a, comps): { name: string; value: number } | null` is added, and `mainSource` stays.

## 8. Conventions

- **Rows.** WEEK: `dedupeKey weekRowKey(track, weekKey)`, `qty` 1 or 0, sink NONE, `track` set, `day` = the week's Sunday, and `detail` = the reason line, prefixed `BACKFILL_PREFIX` before launch. MP_MINT: `dedupeKey` from `weekKeptMintKey` or `goalMintKey`, `qty` = MP paid (0 allowed for a goal), sink NONE, and `detail = mintDetail(reason, why)`. Goals never write TRACK rows and never pay XP.
- **The mint's day.** A kept week mints on its Sunday; a goal mints on its close day. `lifeMpInWeek` and the cap read the mint's day.
- **Week keys.** These are life-day `weekKeyOf` (ISO `'YYYY-Www'`) over Monday–Sunday life days. A week's Monday is `weekStartKeyOf`, and its Sunday is Monday + 6.
- **Cache.** The ledger is `'lifeLedger:<user>'` on `['life']`; TRACK writes already invalidate `'life'`. The ladder is `'goalLadder:<user>:<today>'` on `['life', 'activity']`. The judge and goal closes invalidate `('life', 'progress', 'activity')` after commit. `loadProgression` tags become `['fields', 'progress', 'life']`, and `loadProgressRates` adds `'life'`.
- **Writes on read** need `isLaunched(today)`, an epochDay, `lifeWritesEnabled()` and the launch's DECAY_GRACE row, or an explicit `force` from the launch script. A local `next dev` against the shared database never judges.
- **The life-mint lock.** Every transaction that writes life MP opens with `lifeMintLockOp(userId)`. A paying goal close follows it with a guard that divides by zero if the limits or the cap it decided on have moved (review C3).
- **Character versus attributes.** The character level reads `TrackState.level`. Attributes read `effectiveLevel` (× the kept-week bonus) through `LifeContribution`, and COVENANT's `streakMultiplier` never touches life rows.

## 9. Refinements to m5-refit.md made in lane 0 (compatible; lead to note)

1. `LifeTracksView.contributions` is `LifeContribution[]` (`FieldContribution & { source: 'LIFE' }`) rather than `FieldContribution[]`. It is assignable everywhere a `FieldContribution[]` is read, and lane A can build life rows before lane B adds `source?` to `FieldContribution`.
2. `isLaunched(today, launchDay = lifeLaunchDay())`, `lifeLaunchDay(env?)` and `lifeWritesEnabled(env?)` take optional test seams. The spec's one-argument calls are unchanged.
3. Added exports: `loadLifeLedger` (stub) in the server module, because lanes B (progress-rate) and C (sheet, stats) need it to compile; `judgedWeekKeys` (it defines `judgedWeeks`); `zeroLevels`, `emptyLifeLedger` and `notLaunchedView` (one not-launched source for the stub, lane A and the checks); the key, detail and backfill helpers, `cappedMp`, `round2`, `LifeMintInput`, `GOAL_RULES` (lane D's balance guard reads it), `LIFE_MP_REASON_LABEL`, `EFFORT_CATEGORY`, `effortWeightOfB` and `KEPT_WEEK_STREAK_DAYS`; the pure date helpers `lastJudgeableSunday` and `judgeDayOf` in life-weeks.ts (lane C's /today/week needs them, so they are final in lane 0); and `goalAsOf` and `statedPayoutCopy` in goals.ts (final).
4. `keptWeekBonusPercent` lives in life-tracks.ts, not life-economy.ts, because life-economy imports no values and the curve belongs to streak-curve.ts.
5. `loadGoalLadder` returns `GoalLadder { open, closed }`, not a flat list.
6. character-check.ts has lane-0 sections §1b (economy constants, keys and rounding), §1c (gates) and §1d (judging days), alongside the spec's §1–§3. Lane A appends §2b and §4–§7 above the summary line and keeps the one `check` helper.

## 10. Phase B handoffs (capture-owned files; phase B only)

- **package.json**: add `"character:check": "tsx scripts/character-check.ts"`, and append `&& tsx scripts/character-check.ts` to `life:check`.
- **tasks.ts** `createTemplateCore`: for kind GOAL, set `goalMp: statedGoalMp(horizon)` (from life-economy). `TEMPLATE_SELECT` and `toBoardTemplate` add `goalMp` and `closedScore`.
- **today-board.ts** `goalCards`: skip `closedScore != null`, and compute `progress` with `goalProgress(input, goalAsOf(d.today, dueDay))`. Steps are non-recurring, non-goal children, with `completedDay = dayKeyOf(completedAt)`. The board's `goalQty` is one total per goal; to honour "progress after the due day never counts", it needs GOAL_PROGRESS by day, or rows with `day ≤ dueDay`. Note that today's board treats REVIEWS and IDEAS goals like CHILDREN, while `goalProgress` returns null for them. Add `carried` to `GoalCard`.
- **components/today/format.ts** `TRACK_SIGIL` duplicates `life-tracks TRACK_SIGIL`, and **GoalsStrip.tsx** `HORIZON_LABEL` duplicates `GOAL_RULES[h].name`. Phase B may import the lane-0 sources. GoalsStrip's copy comes from `statedPayoutCopy`.

As built (phase B). Every item above landed, with these differences:
- **tasks.ts.** Goal fields come from the new pure `captureGoalFields(kind, title, tag, dueDay, today)`, which returns `{ horizon, krMetric, krTarget, krUnit, goalMp }`, with all fields null for any other kind. `insertCapture` spreads it into the INSERT.
  - The board's GOAL_PROGRESS groupBy is now by `['templateId', 'day']`. It feeds `goalQty` (every goal) and the new `goalDays` (open goals only, oldest day first).
  - Goal +1 (`goalProgressCore`) and linking an Inbox step to a goal refuse a closed goal: 'That goal is closed or no longer exists.'
- **today-board.ts.**
  - `BoardTemplate.goalMp?` / `closedScore?` and `BoardData.goalDays?` are optional, because capture fixtures build these shapes. Without `goalDays`, a goal's `goalQty` counts as logged on the day the goal was set.
  - `placementOf` files a closed goal as `{ lane: 'done', label: 'Closed' }`.
  - `goalCards` skips closed goals. Progress is `goalProgress(goalProgressInputOf(g, steps, d), goalAsOf(today, dueDay))`, from the new export `goalProgressInputOf`.
  - The MANUAL and CHILDREN labels keep the board's format but count as of the same day. REVIEWS, IDEAS, WORKOUTS and RUN_KM goals read 'not measured' with no meter.
  - `GoalCard.carried` is g when past due and below 1.
- **No `payoutOf`.** `GoalsStrip` and `TodayBoard` take a `launched` prop instead (`app/today/page.tsx` passes `isLaunched(day)`).
  - The pure copy lives in `components/today/board-ui.ts`: `goalCardCopy`, `goalCloseCopy`, `goalClosedNotice`, `goalMpFigure`, `carriedFigure`, `goalRescheduleRange` / `goalRescheduleError` (3650 days, duplicating goals-server's private limit), `goalRescheduledNotice` and `GOAL_CLOSE_FINAL`.
  - The card's percentage is `goalPercent`. It states its payout and offers Close only when launched.
  - The carried line is 'Carried 0.55 · Reschedule?' before launch and 'Carried 0.55 · Reschedule or close?' after.
- **New file.** `components/today/GoalSheets.tsx`: `GoalCloseSheet` (`previewGoalClose`'s figure, why, basis and depth, then Confirm) and `GoalRescheduleSheet`. A refused close, `'Already closed.'` or `GOAL_CLOSE_STALE` alike, stays in the sheet and fetches the figure again.

## 11. As built after the phase A review (lead decisions)

The review findings C1–C7 (correctness) and U1–U10 (UI) were fixed in place. Every change to the tables above is a compatible addition, approved by the lead:
- **Phase A deviations accepted:**
  - the two-round-trip judge read;
  - the gated `loadLifeLedger` and the ungated `readLifeLedger`;
  - `GoalLadder { open, closed }`;
  - `judgeClosedWeeks` returning `{ launched, plans, committed }`;
  - `LifeContribution`;
  - balance-horizon assertion 3 as an equality;
  - the printed life MP of 78 / 318 (the spec said about 80 / 340);
  - the pre-launch /you ladder without MP.
- **C1.** The snapshot reads life from `loadLifeLedger`, not the React-cached `loadLifeTracks`. The judge's withMoments snapshots each get their own Date.
- **C2.** The dry run plans every remaining week (`maxWeeks`, 520) and computes from `ledgerWithPlans`.
- **C3.** `lifeMintLockOp` plus the close guard, using `goalLimitWindow`, `isStaleGuard` and `GOAL_CLOSE_STALE`.
- **C4.** `JudgeOptions.moments`. `--apply` loops the judge with moments off, then runs `stateGoalMp`, then plays the launch moment, and writes the DECAY_GRACE row (`launchGraceDetail`) last. `maybeJudgeWeeks` waits for that row.
- **C5.** `GoalMintRow.occurredAt`.
- **C6.** `TRACK_SHARE_CAP`, `trackShareCap` and `clampTrackComposition`, with balance-horizon assertion 9b.
- **C7.** The docs.
- **U1.** `LifeTracksView.mpLastWeek`. The hero's cell is sheet-math `lifeMpCell(mpLastWeek, today)`:
  - 'life MP last week';
  - 'life MP, week of 21 Sep' while the week that just ended is unjudged;
  - used null, shown as '—', with 'life MP · no week judged yet' before any verdict;
  - the same '—', with 'life MP · first paid week not judged yet', while the last judged week is a backfill week (`mpLastWeek.backfill`, phase B review).
- **U2.** The ladder's '· reschedule or close it on Today' clause shows only once launched. Today hides Close before launch.
- **U5.** `closedGoalReading`.
- **U6.** `goalPercent`.
- **U7.** No per-row goal clause in `trackLine`. The aside reads 'levels capped by kept weeks and paid goals'.
- **U3, U4, U8, U9, U10.** Page copy only:
  - /today/rules states the per-track floors (Duty on its own), 'a goal closed below its bar pays nothing', kept-week MP 'dated the week's Sunday, paid once the week is judged', the share clamp, and sr-only ' MP' units;
  - /today/week heads its card 'Last judged week' with a 'judged on <Wednesday>' line while the week that just ended is pending (sheet-math `pendingWeek`), and once launched its review promise drops the Monday wording (`weekReviewPromise`).
