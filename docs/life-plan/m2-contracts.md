# M2 contracts (lane 0)

What lanes A–E build on. The spec is `m2-refit.md` (revision 2, the user's four answers taken as recommended). Everything below is **frozen**: changing a name, a value, a shape or a signature is a lead decision, not a lane edit. A lane fills in the body behind a signature in a file it owns and may add private helpers, new exports and optional fields; it never removes or renames one. Each lane-0 file carries the same export list in its header comment.

Every shell carries a `// STUB: lane X implements (F<n>)` comment. Before handing off, each lane greps `STUB: lane <X>` and leaves none behind.

With every shell in place the tree compiles (`npx tsc --noEmit -p .` is clean), eslint is clean on the lane-0 files, `npx tsx scripts/duty-check.ts` passes (131 checks), and `life:check`, `ui:check` and `balance:horizon` pass unchanged. Every shell is inert: the actions answer "Not yet.", settlement plans and writes nothing, and `maybeMaintainLife` runs only `maybeJudgeWeeks`, so a page that switches to it early keeps M5's behaviour.

M2 is inert until the lead sets `DUTY_LAUNCH_DAY` (null in code; 2026-10-12 is the intended Monday, set at launch only). Nothing may judge, charge or show stakes before it.

The migration `prisma/migrations/20261021000000_life_duty/migration.sql` (RestDay only) is written, not applied. `schema.prisma` has `model RestDay` and the `MADE_UP` status comment; the Prisma client types include `prisma.restDay` (the generate step's DLL rename failed on a locked file, but the TypeScript client was written). Code that reads RestDay deploys only after the lead applies the migration.

## 1. `src/lib/duty-economy.ts` (pure, client-importable; final)

Imports only `life-day` values and types. It never imports Prisma or `life-economy` (so `life-economy` may import from here without a cycle). Nothing reads a clock.

| Export | Value / signature |
|---|---|
| `DUTY_LAUNCH_DAY` | `null as DayKey \| null`. A Monday ≥ the deploy day and ≥ `LIFE_LAUNCH_DAY`. Lead only |
| `DUTY_LAUNCH_DAY_ENV` | `'XTNL_DUTY_LAUNCH_DAY'`, honoured outside production only |
| `DutyEnv` | `{ NODE_ENV?, XTNL_DUTY_LAUNCH_DAY? }`; every gate takes an optional env (the checks inject one) |
| `dutyLaunchDay(env?)` | Outside production a valid env day, else the constant. Production reads the constant only |
| `isDutyLaunched(today, launchDay = dutyLaunchDay())` | `launchDay != null && today ≥ launchDay`. `dutyLive` everywhere |
| `firstDutyDay(epochDay, launchDay?)` | `max(launchDay, epochDay)`; `null` without a launch day. No earlier day is ever judged |
| `newLifeSettingsDays(today, launchDay?)` | `{ epochDay: today, settledThroughDay: isDutyLaunched(today) ? today − 1 : null }` |
| `newLifeSettingsData(today, launchDay?)` | The same as `@db.Date` values. **Every** `lifeSettings.create`/`upsert.create` spreads it (decision 1; tasks.ts's two creates already do) |
| `DutyLaunchCheck`, `validateDutyLaunchDay(launchDay, { deployDay, lifeLaunchDay })` | `{ valid, problems[] }`: invalid when null, not a day, not a Monday, before `LIFE_LAUNCH_DAY`, or before `deployDay`. The launch script's gate |
| `SETTLE_LAG_DAYS` | `2`: d is judgeable when d ≤ today − 2 |
| `SETTLE_MAX_DAYS_PER_RUN`, `SETTLE_CHUNK_DAYS` | `14`, `7` |
| `DUTY_LAG_NOTICE_DAYS` | `3` |
| `lastSettleableDay(today)`, `isSettleable(day, today)` | `today − 2`; `day ≤ today − 2` |
| `dutyLagging(cursor, today)` | `cursor < today − 2 − 3` (false for a null cursor) |
| `DUTY_CRON_PATH`, `DUTY_CRON_SCHEDULE` | `'/api/cron/life'`, `'15 18 * * *'` |
| `MAKEUP_RESTORE_DAYS` | `2`: restored iff make-up day ≤ d + 2 |
| `MAKEUP_RESTORE_EVERY_DAYS` | `7`: one repaired instance per template in (makeUpDay − 7, makeUpDay] |
| `WRITE_OFF_MIN_DAYS` | `14` |
| `MISS_PROMPT_RUN` | `3` |
| `restoreDeadlineOf(d)`, `withinRestoreWindow(d, makeUpDay)`, `canWriteOff(d, today)` | `d + 2`; `makeUpDay ≤ d + 2`; `today ≥ d + 14` |
| `DEBT_COMPOSITION_KEY` | `'debt'` (DEBT, DEBT_REPAID ±: rawXp NULL, countsForStreak false) |
| `MAKE_UP_SOURCE` | `'make-up'` (InstanceSource) |
| `FREEZE_MAX`, `FREEZE_EARN_ACTIVE_DAYS`, `FREEZE_START_BALANCE` | `2`, `7`, `0` |
| `REPAIR_EVERY_DAYS` | `7` |
| `RestKind`, `REST_KINDS`, `isRestKind(x)` | `'REST' \| 'SICK' \| 'VACATION'` |
| `REST_PER_WEEK`, `SICK_EVERY_DAYS` | `2` per life week; `1` per rolling `14` life days |
| `VACATION_MIN_DAYS`, `VACATION_MAX_DAYS` | `3`, `30` |
| `VACATION_DAYS_PER_365`, `VACATION_BUDGET_SPAN_DAYS` | `30` non-cancelled VACATION days with day in [from − 364, to], new ones included; `365` |
| `AKRASIA_DAYS`, `TYPO_GRACE_MIN` | `7`, `60` |
| `akrasiaEffectiveDay(today)` | `today + 7`; `pendingChangeAt = dayStartOf(that day)` |
| `debtKey(tpl, d, slot)` | `'debt:<tpl>:<d>:<slot>'` |
| `repaidKey(tpl, d, slot, n)` | `'repaid:<tpl>:<d>:<slot>:<n>'`, n = the `'unrepaid:'` rows on that slot |
| `unrepaidKey(repaidRowId)` | `'unrepaid:<repaidRowId>'` (a negative DEBT_REPAID; never an UNDO) |
| `writeOffKey(tpl, d, slot)` | `'writeoff:<tpl>:<d>:<slot>'` |
| `freezeEarnKey(d)`, `freezeUseKey(d)` | `'freeze-earn:<d>'`, `'freeze-use:<d>'` (one key for the manual and the automatic spend) |
| `repairKey(repairedDay)` | `'repair:<d − 1>'`: pass the repaired day (the row is dated that day) |
| `fullDayKey(d)`, `fullDayMintKey(d)` | `'fullday:<d>'`; `'mp:LIFE_FULL_DAY:<d>'` |
| `reflectionKey(d, nonce)` | `'reflection:<d>:<nonce>'` |
| `weekReviewKey(weekKey)`, `WEEK_REVIEW_DETAIL` | `'week-review:<YYYY-Www>'`; `'week review'` |

Not here, by the spec: `debtFor` and the debt caps (life-grade.ts), `HELD_WEEK_REST_DAYS`, the held mark and `HELD_PREFIX` (life-economy.ts, lane B), `reviewedWeek` (rituals.ts, lane E), `lifeWritesEnabled` (life-economy.ts, reused).

## 2. `src/lib/duty-rule.ts` (pure, client-importable; final, complete)

Imports `life-day`, `recurrence` and `duty-economy` only.

| Export | Signature and meaning |
|---|---|
| `PENDING_CHANGE_VERSION` | `1` |
| `PendingNext` | `{ effectiveDay: DayKey; compulsory?: false; compulsoryOnRest?: false; archive?: true }`. Weakenings only |
| `PriorSegment` | `{ throughDay: DayKey; compulsory?: boolean; compulsoryOnRest?: boolean }`: the values in force through throughDay |
| `PendingChange` | `{ v: 1; next?: PendingNext; prior?: PriorSegment[] }` (prior ordered by throughDay). Stored in `TaskTemplate.pendingChange` |
| `parsePendingChange(json: unknown)` | `PendingChange \| null`. Tolerant; drops malformed parts; idempotent on a parsed value |
| `pendingChangeJson(change: unknown)` | The normalised value to store, or `null` (write `Prisma.DbNull`) |
| `appendPrior(change: unknown, seg)` | A strengthening: append `{ throughDay: today − 1, <old values> }`. Same throughDay merges; an already-recorded field keeps its value |
| `withNext(change: unknown, next)` | Sets `next` (the caller refuses a second weakening while one pends) |
| `withoutNext(change: unknown)` | Cancels `next` (immediate); `null` when nothing is left |
| `pruneSettledPrior(change: unknown, judgedDutyWeeks: ReadonlySet<'YYYY-Www'>)` | Drops segments whose throughDay's week has its DUTY WEEK row; `null` when nothing is left |
| `nextIsDue(change: unknown, settledThroughDay)` | `cursor ≥ next.effectiveDay − 1`: settlement applies it now |
| `DutyTemplate` | `{ kind?; recurrence; startDay; dueDay; dueKind; compulsory; compulsoryOnRest; inbox; archivedDay: DayKey \| null; pendingChange?: unknown }` (archivedDay = `dayKeyOf(archivedAt)`) |
| `DayRule`, `Ruled<T>` | `{ compulsory; compulsoryOnRest; archivedDay; recurrence; ruledOn: DayKey }`, spread over the template |
| `ruleOn(t, d)` | The rule on d. Per field: the earliest prior segment with throughDay ≥ d that sets it, else `next` when d ≥ effectiveDay, else the column. A pending archive is invisible before its effectiveDay and archives from it. Recurrence is the column's (v1 keeps no schedule history). A no-op on a template already ruled for d |
| `AppliedChange`, `applyNext(t)` | `{ compulsory, compulsoryOnRest, archivedDay, pendingChange, prior } \| null`. An un-flag appends `{ throughDay: effectiveDay − 1, compulsory: true }`; 'Even on rest days' off appends `{ compulsoryOnRest: true }`; an archive sets `archivedDay = effectiveDay` (settlement writes `archivedAt = dayStartOf(archivedDay)`) and needs no segment |
| `RuleState` | `{ compulsory; compulsoryOnRest?; archived?; inbox?; recurrence?; dueDay? }`; in `after` an absent field is unchanged |
| `Weakening`, `weakeningsOf(before, after)` | `'unflag' \| 'rest-off' \| 'archive' \| 'to-inbox' \| 'fewer-days' \| 'no-schedule' \| 'later-deadline' \| 'no-deadline'`. Only a compulsory `before` can be weakened. Fewer days compares `scheduledPerWeek` |
| `classifyChange(before, after, { createdAt, now, launched })` | `'immediate' \| 'deferred'`: immediate before launch, or when the template is ≤ 60 min old, or when nothing weakens; else deferred (to `akrasiaEffectiveDay(today)`) |
| `expectedOn(t, d)` | Under `ruleOn(t, d)`: a TASK/HABIT, not inbox, d ≥ startDay, d < archivedDay, and either a fixed-schedule day (DAILY, WEEKDAYS, DOW, EVERY, MONTHLY) or a DEADLINE one-off's dueDay. Never TARGET (judged per period through `targetUnits`), AFTER, PLANNED one-offs, goals. No launch floor. Independent of `compulsory` |
| `mustsDueOn(templates, d)` | `Ruled<T>[]`: compulsory on d and `expectedOn` d (fixed occurrences and deadline one-offs; never TARGET) |
| `RestRow` | `{ day; kind: string; declaredAt: Date; cancelledAt: Date \| null }` |
| `validRestDays(rows, from, to, tz?)` | `Map<DayKey, RestKind>`: not cancelled; REST/VACATION declared before `dayStartOf(day)`; SICK before `dayEndOf(day)`; unknown kinds ignored |
| `heldDaysOf(rows, from, to, tz?)` | `Set<DayKey>`, the keys of `validRestDays`. The one reader for settlement, streak.ts, snapshot.ts, the judge and the board. Freeze days are not in it: readers add FREEZE_USE days themselves |

## 3. `src/lib/habit.ts` (frozen M5 contract, compatible M2 extension)

| Change | Meaning |
|---|---|
| `BREAKS` += `'MADE_UP'` | `instanceOutcome(['MADE_UP'])` is `'missed'`; a kept slot on the same day still keeps it. Signature unchanged |
| `InstanceLike.repaired?: boolean` | A repaired or `DONE_LATE` instance of a recurring template is a make-up slot. Readers that hold `TaskInstance.repaired` should pass it (lane B: `WeekInstance` should carry it for repaired DONE_MVV slots) |
| `TargetUnits`, `targetUnits(rule, period, instances, heldDays = ∅)` | `{ kept, held, short }`: kept = min(n, distinct days with a non-make-up kept instance + kept make-up slots); held = min(n − kept, distinct held days (held instances or `heldDays`, on days not kept) + held make-up slots); short = n − kept − held. A MADE_UP slot counts nothing. Counts days in [period.start, period.end]; pass end = today for a running period. Non-TARGET rules count against n = 1 |
| `StreakOptions.settledThroughDay?: DayKey \| null` | When non-null, an expected day after it with no instance reads `pending` (never `missed`), and a TARGET period ending after it is `open`. Null or absent: the record window alone (M1/M5 behaviour). Pass it only when `dutyLive` |
| `StreakOptions.heldDays?: ReadonlySet<DayKey>` | An expected day in it with no instance reads `held`. For a compulsoryOnRest must pass only the freeze days |
| `perDutyStreak`, `habitStrength`, `outcomesOf` | Take the two options; TARGET periods count through `targetUnits`. Unchanged without them |

## 4. Small contract lines in shared files

| File | Change |
|---|---|
| `life-types.ts` | `InstanceStatus` += `'MADE_UP'` |
| `life-grade.ts` | `debtFor(t: { band; bandOverride; estMinutes; machineMinutes })` = `min(DEBT_CAP, round1(BAND_BASE[effBand] × E(estEff(est, machine))))`. Goldens: dishes (INTRO 15) 4.2; 'stretch 15m' (STANDARD 15) 8.3; SEVERE 240 → 20 (48.6 uncapped) |
| `today-board.ts` | `DONE_STATUSES` += `'MADE_UP'` (`isDoneStatus('MADE_UP')` is true). `PlanInput.makeUp?: boolean`: timing `MAKE_UP` (T 0.85) and streakDays 0 (C 1.00); status and source stay planCompletion's (`'DONE'`/`'DONE_MVV'`, `'manual'`/`'record-yesterday'`), the make-up caller maps them. `taskEventInput`'s `at.keyDay?: DayKey`: the dedupe key uses `keyDay ?? day`; the row stays dated `day`. `BoardTemplate.pendingChange?: PendingChange \| null` (optional so existing fixtures compile; lane D fills it with `parsePendingChange`) |
| `streak-curve.ts` | `NEVER_STREAK_SOURCES` += `DEBT_REPAID`, `DEBT_WRITTEN_OFF`, `FULL_DAY`, `REPAIR` (REPAIR still holds through `HELD_SOURCES`) |
| `tasks.ts` | `TodayCounts.yesterdayMusts: number` (`loadTodayCounts` returns 0; lane C fills it). Both LifeSettings creates spread `newLifeSettingsData(today)` |
| `package.json` | `settle:check`, `duty:check`, `duty-actions:check`, `rituals:check`. Not yet in `life:check` (the lead appends them at integration) |

## 5. Type shells

### `src/lib/settlement-plan.ts` (lane A implements F4 and step 11)

`SettlementTemplate extends DutyTemplate` (+ id, kind, title, track, band, bandOverride, estMinutes, machineMinutes, intrinsic, mvv, mvvMinutes, autoMetric, autoTarget, createdAt: Date, pendingChange: PendingChange \| null) · `SettlementInstance` (id, templateId, day, slot, status, source, debtXp, debtOpen, repaired) · `SettlementLedgerRow` (id, day, source, sink, track, templateId, sourceId, xp, rawXp, qty, countsForStreak, dedupeKey, receipt) · `SettlementDayFacts` (day, streakUnits, reviews, ideas, dayOpenQty \| null) · `SettlementDebt` (instanceId, templateId, day, slot, debtXp) · `SettlementState` (today, now, dutyLaunchDay, epochDay, cursor, through?, templates, instances, rows, days, freezeEarned, freezeUsed, lastFreezeEarnDay, openDebts, restRows: RestRow[], judgedDutyWeeks: ReadonlySet<'YYYY-Www'>).

Ops: `InstanceCreateOp` `{kind: 'instanceCreate', data}` · `InstanceUpdateOp` `{kind: 'instanceUpdate', id, data}` · `EventOp` `{kind: 'event', input: ActivityInput}` · `TemplateHousekeepingOp` `{kind: 'templateHousekeeping', templateId, data: {compulsory?, compulsoryOnRest?, archivedDay?, pendingChange}}` · `CursorOp` `{kind: 'cursor', day}` · `SettlementOp` (their union) · `DayPlan` `{ day, held, ops, notes }`.

`planSettlement(state): DayPlan[]`. Shell: `[]`.

### `src/lib/settlement.ts` (lane A implements F5; server only)

`SettleOptions` `{ through?, early?, dryRun?, force?, env?: LifeEnv & DutyEnv }` · `SettleResult` `{ launched, wrote, cursorBefore, cursorAfter, plans: DayPlan[], refused: string \| null }`.

`settleLifeDays(userId, now, opts = {}): Promise<SettleResult>`. Shell: writes nothing; `refused` set for an early settle before launch.
`maybeMaintainLife(userId, now = new Date()): Promise<void>`. Never throws. Shell: `maybeJudgeWeeks(userId, now)` only.

### `src/lib/duty-view.ts` (lane D implements F12)

`OwedCard` (instanceId, templateId, title, archived, day, slot, debtXp, restoreBy, restoresToday, restoresStreak \| null, mvv, makeUpXp, minimumXp \| null, studyLinked, canWriteOff) · `OwedView` (`{kind: 'none'}` \| `{kind: 'inline', card}` \| `{kind: 'summary', count, totalDebt, cards}`) · `RestState` (yesterday, today, tomorrow: RestKind \| null; vacationUntil) · `RestBanner` (kind, text, cancelDay) · `FreezeState` (banked, willCover) · `SettledFact` (source, day, xp, qty, templateId, dedupeKey) · `SettledChip` (tone 'kept' \| 'held' \| 'quiet', text — never owed) · `SettledNotice` (day, chips, repairedDay, fullDay) · `DutyBoard` (live, launchDay, cursor, owed, rest, freezes, pending: Record<templateId, PendingNext>, settled: SettledFact[]) — `BoardData.duty`.

`owedViewOf(owed): OwedView` · `makeUpCopy(card, today): string` · `restBannerOf(rest, today): RestBanner | null` · `settledNoticeOf(rows, cursor, today): SettledNotice | null`. Shells: none / '' / null / null.

### `src/lib/duty-plan.ts` (lane C implements F6)

`MakeUpStatus` `{ status: 'DONE_LATE' | 'DONE_MVV' | 'MADE_UP'; repaired }`.
`makeUpStatusOf(day, today, repairedInLast7, minimum = false)` — **final**: restored (DONE_LATE, or DONE_MVV for a minimum; repaired) when `withinRestoreWindow(day, today)` and not `repairedInLast7`; else MADE_UP.
`DutyPlanResult<T>` `{ok: true, value} | {ok: false, error}` · `MakeUpInput` (template: PricedTemplate, instance {id, templateId, day, slot, debtXp}, today, now, minimum, minutes?, ledger: DayLedger, repairedInLast7, taskAttempt, repaidAttempt) · `MakeUpPlan` (plan: CompletionPlan, status, repaired, restored, taskEvent, repaidEvent, instance update) · `planMakeUp(input)` · `UndoMakeUpInput` (taskRow: UndoneEvent, repaidRow {id, day, templateId, sourceId, xp}, instance, now) · `UndoMakeUpPlan` (undoEvent, unrepaidEvent, instance → MISSED, debtOpen, not repaired, xpPaid 0, completedAt null) · `planUndoMakeUp(input)`. Shells: `{ok: false, error: 'Not yet.'}`.

### `src/app/actions/duty.ts` (lane C implements; `"use server"`)

All return `Promise<DutyActionResult<T>>` (`{ok, value} | {ok, error}`), never throw, and `refresh()` on `{refresh: true}` (`DutyActionOptions`). Shells answer 'Not yet.'.

| Action | Value |
|---|---|
| `makeUp(instanceId, opts?: {refresh?, minutes?})` | `MakeUpResult` {instanceId, templateId, day, status, restored, receipt, xp, debtXp, clearedLast, owedLeft, undoUntil (ISO)} |
| `doMinimum(instanceId, opts?)` | `MakeUpResult` |
| `undoMakeUp(instanceId, opts?)` | `{ instanceId, debtXp }` |
| `acceptLoss(instanceId, opts?)` | `{ instanceId, debtXp }` |
| `setMinimum(templateId, text, minutes?, opts?)` | `{ templateId, mvv, mvvMinutes }` |
| `spendFreeze(opts?)` | `{ day, left }` |
| `settleYesterday(opts?)` | `{ settledThrough }` |
| `declareRest(day, opts?)` | `{ day, kind }` |
| `declareSick(opts?)` | `{ day, kind }` |
| `setVacation(from, to, opts?)` | `{ from, to, days, budgetLeft }` |
| `cancelRest(from, to?, opts?)` | `{ cancelled: DayKey[] }` |
| `setCompulsory(templateId, on: false, opts?)` | `RuleChangeResult` {templateId, effect: 'immediate' \| 'deferred', effectiveDay \| null} |
| `setCompulsoryOnRest(templateId, on, opts?)` | `RuleChangeResult` |
| `cancelPendingChange(templateId, opts?)` | `{ templateId }` |

F3 places the cores of the last three in `lib/tasks.ts`; their actions are declared here so lane D has one frozen import. Lane C implements them here (or re-exports from `actions/tasks.ts` under these exact signatures).

### `src/app/actions/rituals.ts` (lane E implements; `"use server"`)

`saveReflection(day, note, mood: number | null, opts?)` → `{ day, key }` · `markWeekReviewed(opts?)` → `{ weekKey }` (the week is `reviewedWeek(today)`, computed on the server). Shells answer 'Not yet.'.

## 6. `scripts/duty-check.ts` (lane 0; pure; 131 checks)

§1 debtFor goldens; `planCompletion({makeUp: true})` goldens (dishes 3.5 with C 1.00 whatever streakDays; 'stretch 15m' minimum 2.1); the dishes ledger nets +3.5; `taskEventInput` keyDay; MADE_UP reads done on the board; `makeUpStatusOf`; ruleOn (pending archive, prior segments, an applied un-flag then a re-flag), applyNext, appendPrior/withNext/withoutNext/prune/nextIsDue; classifyChange (59/61 min, pre-launch, 'Even on rest days' on/off, fewer days, later deadline); expectedOn (inbox, no launch floor, TARGET, AFTER, deadlines, archive) and mustsDueOn; heldDaysOf (late REST, cancelled, re-declared, SICK during its day, the DST start day); MADE_UP missed, targetUnits (two made-up Sunday slots are two units, MADE_UP slots nothing, rest days), habit reads with the cursor and held days; NEVER_STREAK_SOURCES and countsForStreakOf; newLifeSettingsDays/Data and firstDutyDay; every dedupe key; settlement and restore windows across both DST switches. §2 dutyLaunchDay ignores the env in production; the launch validator (non-Monday, before LIFE_LAUNCH_DAY, before the deploy day, null).

## 7. Notes for the lanes

- **Lane A.** `planSettlement` calls `ruleOn`/`expectedOn` per day and applies the launch floor (`firstDutyDay`) itself; `heldDaysOf(restRows, d, d)` for held days; `targetUnits(..., heldDays)` for TARGET closes; `debtFor` for debt; the keys above. Step 11: `nextIsDue`, `applyNext`, `pruneSettledPrior`. The full-day rule needs `mustsDueOn` (TARGET excluded by construction).
- **Lane B.** The judge reads compulsory templates plus every template with a pendingChange, through `ruleOn` per day (`WeekTemplate` will need `compulsory`, `compulsoryOnRest`, `inbox`, `dueKind`, `pendingChange`); TARGET via `targetUnits`; `restDays` via `heldDaysOf`; `HELD_WEEK_REST_DAYS` lives in life-economy.ts. `life-economy` may import `duty-economy` (no cycle). streak.ts/snapshot.ts read RestDay through `heldDaysOf`.
- **Lane C.** Every weakening through `classifyChange`, with `withNext`/`appendPrior`/`withoutNext`; `pendingChangeAt = dayStartOf(next.effectiveDay)`. Store `pendingChangeJson(...)` (null → `Prisma.DbNull`). Any new LifeSettings create spreads `newLifeSettingsData(today)`. The make-up TASK row uses `taskEventInput({..., day: today, keyDay: d})`.
- **Lane D.** Fill `BoardTemplate.pendingChange` with `parsePendingChange`; habit reads pass `{ settledThroughDay: dutyLive ? cursor : null, heldDays }`; decide compulsory/archived per day with `ruleOn`.
- **Lane E.** `weekReviewKey`, `reflectionKey`, `WEEK_REVIEW_DETAIL`; the rules page reads every constant from duty-economy.ts and life-grade.ts.

## Added by the lead after review (compatible)

- `settledFor(day, cursor, floor): boolean` (duty-economy.ts) — the ONE settled-day rule: `cursor != null && day <= cursor && (floor == null || day >= floor)`, with `floor = firstDutyDay(epochDay)`. Every settled-day check uses it: tick/record/undo refusals in tasks.ts, settledDayGuardOp's SQL (`day <= settledThroughDay AND day >= GREATEST(launch, epochDay)` when a launch day is set), spendFreezeCore, and the board's yesterday lane. Reason: the launch script may set the cursor to firstDutyDay − 1 days before the launch; a cursor-only test would lock every pre-launch day (M2 review blocker).
