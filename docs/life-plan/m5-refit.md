# M5 (refitted): character — life tracks, attribute seam, goals, mastery

Replaces m5.md for the build: M2 (settlement), M3 and M4 are absent; the redesign is shipped.

## Goal

Refit M5 so it can be built on M1 and the shipped redesign alone. M2, M3 and M4 are absent: no settlement cron, no debt, no rest days, no workouts, no sensor PRs.

What M5 delivers:
- Four life tracks (Body, Duty, Craft, Care), derived from the ActivityEvent ledger.
- Kept weeks, judged lazily and idempotently on page reads.
- Life feeding the 13 attributes, and through them the emblem gates and the title epithet.
- One character level over Fields and tracks.
- Goals that state their mastery points (MP) when created and pay them, within caps, when closed.
- The You sheet's life section, plus Stats.
- Three kinds of celebration: week kept, track level, goal finished.
- A balance guard.

No migration.

Root for every path: C:/Users/Thanc/OneDrive/Desktop/XTNL-idea.

Lead decisions taken here (each departs from m5.md or grading.md F/G, or fills a gap in them):

1. Weekly judgement. A lazy, idempotent week judge replaces the settlement Sunday step. Week W is judged from Wednesday 04:00 after its Sunday. That is one day later than M1 strictly needs, so M2's 48-hour make-ups never come too late. It runs in after() on page reads. M2's settlement will call the same function.

2. Depth. depth = 1.25·√keptWeeks + min(2, goal depth), where a paid MID adds 1 and a paid LONG adds 2. The PR term is gone and the goldens are replaced.
   - With the old 1·√kw, level 10 needs 81 kept weeks.
   - With 1.25, 4,900 XP and 52 kept weeks reach level 10 in the same week.
   - Uncapped goal depth was a flood channel; capping it at 2 removes it.

3. Effort floors without workouts.
   - BODY: 150 effort minutes, taken from EXERCISE-category receipts (×1 STANDARD, ×2 DEMANDING or SEVERE), on at least 3 days, with at least 30 raw XP.
   - DUTY: any missed compulsory occurrence breaks the week. With 3 or more occurrences, Duty raw must be ≥ 30. With 0–2 occurrences (none missed), the week needs ≥ 5 Duty completions on ≥ 3 days and ≥ 30 raw.

4. Launch gating. Everything stays inert until a code constant LIFE_LAUNCH_DAY is set. Outside production, an env override XTNL_LIFE_LAUNCH_DAY is honoured. A launch constant survives a 'life' reset, which a LifeSettings stamp would not.
   - Writes on read also need NODE_ENV production or XTNL_LIFE_JUDGE=1.
   - Reason: dev and prod share one Supabase database, so a local dev server must never write permanent WEEK or MP rows.
   - Phase A can therefore deploy dark.

5. Streak amplifier. Life attribute rows are not amplified by STREAK_AMPLIFIER (COVENANT). Their only multiplier is the kept-week bonus, capped at +20%.

6. Frozen shell contract. characterLevelOf gains an optional trackLevels argument. This is a compatible extension of the frozen shell contract.

7. Goal closing.
   - Closing is explicit and final.
   - g is measured as of min(today, dueDay).
   - Every close writes exactly one MP_MINT decision row 'mp:GOAL:<id>', with qty equal to the MP paid (0 allowed).
   - Goals never pay XP and never write TRACK rows.

8. Mastery-point reasons. LIFE_FULL_DAY is deferred to M2 and goes through the same helper and cap. LIFE_PR is dropped, kept only as a reserved reason. The goal metrics WORKOUTS and RUN_KM are not measured.

9. File placement. Contract types live in new pure modules (life-economy.ts, life-tracks.ts, goals.ts, life-weeks.ts), never in the capture-owned life-types.ts. Capture-owned Today files are touched only in phase B.

As built: after phase A, two reviews raised findings C1–C7 and U1–U10. The lead's decisions on them are recorded as short 'As built' notes under F3, F4, F6, F9, F10, F12, F13, F14 and F15, and in full in m5-contracts.md §10–§11. Every phase A lane deviation was accepted.

## Constants

Defined in life-economy.ts (pure), unless noted otherwise.

Track level:
- TRACK_LEVEL_STEP = 7 → pointsLevel = floor(√xp / 7). Level 10 needs 4,900 XP.
- TRACK_DEPTH_WEEK_COEF = 1.25; TRACK_DEPTH_GRACE = 1.
- depth = 1.25·√keptWeeks + min(GOAL_DEPTH_CAP, goal depth).
- level = min(pointsLevel, 1 + floor(depth + 1e-9)). Every track starts at 0.
- GOAL_DEPTH = {SHORT 0, MID 1, LONG 2}; GOAL_DEPTH_CAP = 2 per track. Only paid goals count.
- Kept-week attribute bonus = streakBonusPercent(7 × consecutive kept weeks). It reaches its 20% cap after 10 kept weeks and is not amplified by STREAK_AMPLIFIER.
- The track seed compositions are the existing TRACK_SEED in life-lexicon.ts:
  - BODY: PHYSICAL 46 / STUBBORNNESS 24 / SELF_RESPECT 20 / FAITH 10
  - DUTY: STUBBORNNESS 36 / SELF_RESPECT 26 / FAITH 22 / PHYSICAL 16
  - CRAFT: MIND 34 / CRITICAL_THINKING 24 / SELF_RESPECT 22 / STUBBORNNESS 20
  - CARE: COMPASSION 30 / SELF_RESPECT 28 / FAITH 24 / REASON 18
- Life attribute row name: 'Life · ' + track name.
- characterLevel = floor(Σ over Fields and tracks of L^0.75).

Kept-week floors:
- KEPT_MIN_DAYS = 3; KEPT_MIN_RAW = 30.
- BODY_EFFORT_MINUTES = 150, from EXERCISE-category receipts only. EFFORT_WEIGHT by the receipt's B factor: 5 → 0, 10 → 1, 20 → 2, 35 → 2.
- DUTY_MIN_OCCURRENCES = 3. Below that the fallback applies: DUTY_FALLBACK_COMPLETIONS = 5 on 3 days with raw ≥ 30. Any missed must means the week is not kept.

Judging:
- WEEK_JUDGE_LAG_DAYS = 3: week W is judged from Wednesday 04:00 after its Sunday.
- WEEK_JUDGE_MAX_WEEKS = 12 per run.
- WEEK row: dedupeKey 'week:<TRACK>:<YYYY-Www>', qty 1 when kept or 0, sink NONE, day = the week's Sunday, detail = the reason line (pre-launch weeks are prefixed 'backfill · ').

Life mastery points:
- LIFE_MP = {WEEK_KEPT 1.5, FULL_DAY 0.5 (minted from M2), GOAL_SHORT 1, GOAL_MID 6, GOAL_LONG 20}.
- LIFE_MP_WEEK_CAP = 8 per life week, shared by CAPPED_REASONS = [LIFE_WEEK_KEPT, GOAL_SHORT, LIFE_FULL_DAY]. Trim order inside a week: Short goals at close, then kept tracks (BODY, DUTY, CRAFT, CARE), then full days (M2).
- MP_MINT dedupe keys: 'mp:LIFE_WEEK_KEPT:<TRACK>:<week>' and 'mp:GOAL:<goalId>' (detail = the reason).
- LIFE_PR is reserved and never minted.

Goals:

| Horizon | Stated | Pays | Min lifetime | Limit | Depth |
|---|---|---|---|---|---|
| SHORT | 1 | binary: needs g = 1 | 3 d | ≤ 2 paying per life week | 0 |
| MID | 6 | 6 × g from g ≥ 0.7 | 21 d | ≤ 2 paying per rolling 30 d | 1 |
| LONG | 20 | 20 × g from g ≥ 0.7 | 90 d | ≤ 1 paying per rolling 91 d | 2 |

- g = min(1, progress) as of min(close day, due day).
- goalMp is frozen when the goal is created.
- Goals never pay XP. A missed goal shows 'Carried 0.55', with no debt.
- Measured metrics: CHILDREN and MANUAL. REVIEWS, IDEAS, WORKOUTS and RUN_KM are not measured.

Launch and gates:
- LIFE_LAUNCH_DAY: DayKey | null = null until the lead sets it.
- XTNL_LIFE_LAUNCH_DAY (an env override, honoured outside production only).
- Writes on read need NODE_ENV production or XTNL_LIFE_JUDGE = 1.
- DECAY_GRACE is a zero-delta mastery reason that resets the decay idle clock.

Goldens:
- trackLevel: (1225, 16) = 5; (7800, 45) = 9; (49, 0) = 1; (10, 0) = 0; (4900, 0) = 1; (4900, 52) = 10; (4899, 52) = 9; (4900, 51) = 9; (1225, 10) = 4; (1225, 11) = 5; (4900, 30, LONG) = 9; (4900, 30, MID+LONG) = 9; (4900, 44, MID) = 10.
- Depth line: 25 kept weeks → 7 more; 52 kept weeks → 12 more.
- A BODY L3 row adds PHYSICAL 1.38, or 1.66 with a 10-week kept streak.

Budget:
- Knowledge income: 61.964 MP/day.
- Worst-case life income: 8/7 + 12/30 + 20/91 = 1.7626 MP/day = 2.845% of knowledge income (ceiling 1.8589).
- Committed life income: 1.209 MP/day.
- Pool horizon: 13.71 y → 13.33 y in the worst case (13.45 y committed).
- In M5 the most a week can pay is 4 × 1.5 + 2 × 1 = 8 = the cap.

Pacing:
- Steady mean track (about 101 XP/week, 6 of 7 weeks kept): level 3 at week 5, level 4 at week 8, level 5 at week 13, level 10 at week 49.
- Light: level 10 at week 81.
- Worst case: level 10 at week 32, level 12 at week 52.
- Flood check at week 52: worst SELF_RESPECT 13.82, below the tier-5 gate of 14.2.

## Migration

None.

- Mastery-point reasons (LIFE_WEEK_KEPT, GOAL_SHORT, GOAL_MID, GOAL_LONG, DECAY_GRACE, and later LIFE_FULL_DAY) fit in MasteryLedgerEntry.reason, a free String.
- WEEK and MP_MINT rows fit the existing ActivityEvent table: WEEK and MP_MINT are already in the ActivitySource union, the track column is nullable, and the dedupeKey unique index already exists.
- Goal state fits the existing TaskTemplate columns goalMp, closedScore and completedAt.
- The launch marker is a code constant (plus a non-production env override), not a LifeSettings stamp, so no column is needed. LifeSettings.weeklyTargets stays unused.
- No index is required: the loader groups by (track, day) and (track, compositionKey) over one user's TRACK rows, and the existing (userId, track, day) and (userId, source, day) indexes serve the judge.

## F1. Contract: pure economy, character level and life-track types (lane 0, first)

**Spec.** Lane 0 writes these first. Every other lane builds on them.

NEW life-economy.ts. Pure: it imports only types and helpers from life-types and life-day, never Prisma and never today-board. That lets balance-horizon, full-day, celebration-detect and the checks import it.

Level maths:
- TRACK_LEVEL_STEP = 7, TRACK_DEPTH_WEEK_COEF = 1.25, TRACK_DEPTH_GRACE = 1.
- GOAL_DEPTH = {SHORT 0, MID 1, LONG 2}; GOAL_DEPTH_CAP = 2.
- pointsLevel(xp) = floor(sqrt(max(0, xp)) / 7 + 1e-9).
- xpForLevel(L) = (7L)^2.
- trackDepth(keptWeeks, goalDepth) = 1.25 * sqrt(max(0, keptWeeks)) + min(2, max(0, goalDepth)).
- depthCap(depth) = 1 + floor(depth + 1e-9).
- trackLevel(xp, keptWeeks, goalDepth = 0) = min(pointsLevel(xp), depthCap(trackDepth(keptWeeks, goalDepth))). There is no PR argument, and every track starts at 0.
- moreKeptWeeks(keptWeeks, goalDepth) = max(1, ceil(((floor(depth + 1e-9) + 1 - min(2, goalDepth)) / 1.25)^2 - keptWeeks - 1e-9)).

Goal helpers:
- statedGoalMp(h): SHORT 1, MID 6, LONG 20.
- payBar(h): SHORT 1, MID and LONG 0.7.

All MP, cap, goal, floor, judge and launch constants listed under constants also live here.

Gates:
- lifeLaunchDay(): outside production, XTNL_LIFE_LAUNCH_DAY when it is a valid YYYY-MM-DD; otherwise LIFE_LAUNCH_DAY.
- isLaunched(today) = launchDay != null && today >= launchDay.
- lifeWritesEnabled() = NODE_ENV === 'production' || XTNL_LIFE_JUDGE === '1'.

NEW character.ts (pure):
- characterRaw(fieldLevels, trackLevels = []) = sum of max(0, L)^0.75 over both lists.
- characterLevel(fieldLevels, trackLevels = []) = {level: floor(raw), progress: raw - floor(raw)}.
- With no tracks it returns exactly today's numbers.

NEW life-tracks.ts (pure). Contract types and labels:
- WeekMark = 'kept' | 'held' | 'missed'. 'held' is never produced before M2. It is structurally the WeekPip of SheetSections.
- TRACK_NAME {BODY 'Body', DUTY 'Duty', CRAFT 'Craft', CARE 'Care'}.
- TRACK_SIGIL {BODY 'body', DUTY 'duty', CRAFT 'craft', CARE 'care'}.
- DISPLAY_ORDER [DUTY, CRAFT, BODY, CARE].
- LIFE_ROW_PREFIX 'Life · '.
- LifeLedger:
  - epochDay;
  - xpByDay {track, day, xp}[];
  - compositions {track, key, xp, composition | null}[];
  - weeks {track, weekKey, sunday, kept, detail}[];
  - mints {key, track | null, templateId | null, day, qty, reason, why}[].
- TrackState: track, xp, pointsLevel, keptWeeks, keptStreak, goalDepth, depth, cap, level, atCap, bonusPercent, effectiveLevel, composition.
- LifeTrackRow: track, name, sigil, level, xp, nextXp, cap, atCap, keptWeeks, keptStreak, goalDepth, banked, now, weeks: WeekMark[], line, edge.
- LifeTracksView:
  - launched, today;
  - levels: Record<Track, number>;
  - rows;
  - contributions: FieldContribution[];
  - edges {body, duty, craft, care} | null;
  - mpThisWeek {used, cap};
  - judgedWeeks: string[];
  - lastJudgedWeek: string | null.

Lane 0 also writes:
- the type shells of goals.ts (GoalInput, GoalPayout) and life-weeks.ts (WeekJudgeState, WeekPlan);
- a stub loadLifeTracks(userId) in life-tracks-server.ts that returns the not-launched view, so lanes B and C compile before lane A lands.

**Files.** new C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/life-economy.ts; new C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/character.ts; new C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/life-tracks.ts (types now, implementation in F3); type shells of C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/goals.ts, C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/life-weeks.ts and C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/life-tracks-server.ts

**Tests.** New scripts/character-check.ts (PASS/FAIL, exits 1 on failure).

§1 trackLevel goldens:
- (1225, 16) = 5; (7800, 45) = 9; (49, 0) = 1; (10, 0) = 0; (4900, 0) = 1.
- (4900, 52) = 10; (4899, 52) = 9; (4900, 51) = 9 (depth 8.927).
- (1225, 10) = 4; (1225, 11) = 5.
- (4900, 30, LONG) = 9 (depth 8.847); (4900, 30, MID+LONG) = 9 (goal depth capped at 2); (4900, 44, MID) = 10 (depth 9.292).
- The old (7800, 45, 10 PRs) = 8 golden is removed.

moreKeptWeeks:
- (25, 0) = 7 (cap 7);
- (52, 0) = 12;
- a one-week case has singular copy.

§2 Each TRACK_SEED composition sums to 100. Reuse the TRACK_SEED export in life-lexicon.ts; do not redefine it.

§3 Zero-life regression:
- characterRaw(levels) === characterRaw(levels, []).
- For the shell-check lists [], [1], [4,9,2], [16,16], [30,1,7,12,3], characterLevel(levels).level === xp.fieldLevel(levels).
- characterRaw([4,9,2], [3,1]) = 4^0.75 + 9^0.75 + 2^0.75 + 3^0.75 + 1.

## F2. Ledger row shape

**Spec.** activity.ts, activityData:
- Keep a valid track on WEEK and MP_MINT rows. This is an explicit allowlist: if the source is WEEK or MP_MINT and isTrack(e.track), store it.
- Every other non-TRACK row still stores null, and TRACK rows still require a track.
- Life XP still reads only sink = 'TRACK', so levels and the audit invariant are unchanged (0 TRACK rows share a sourceId with REVIEW or IDEA_CREATE).
- Without this fix, detectLedger labels real WEEK rows 'Life' and the week Seal claims nothing.

streak-curve.ts: add WEEK and MP_MINT to NEVER_STREAK_SOURCES. A WEEK row dated Sunday must never make Sunday active after the fact.

habit.ts: export instanceOutcome(statuses), which is the existing private dayOutcome:
- kept: DONE, DONE_LATE;
- held: DONE_MVV, SKIPPED, EXCUSED;
- missed: MISSED, WRITTEN_OFF;
- UNDONE counts as absent.
The week judge and the habits then share one rule.

full-day.ts: FULL_DAY_MP = LIFE_MP.FULL_DAY, one source. It stays 0.5 and still pays nothing until M2. DayLedger (capture-owned) keeps importing it from full-day unchanged.

**Files.** C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/activity.ts; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/streak-curve.ts; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/habit.ts; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/full-day.ts

**Tests.** character-check §2b:
- activityData(u, {source 'WEEK', track 'BODY'}).track === 'BODY';
- an MP_MINT row with track 'DUTY' keeps it;
- a DAY_OPEN row given a track stores null;
- a TASK row without a track still throws;
- countsForStreakOf('WEEK', true) === false and countsForStreakOf('MP_MINT', true) === false;
- instanceOutcome agrees with outcomesOf on 6 fixtures.

The existing life:check chain (life-day, streak, life-grade, recurrence, capture-parse, board, today-ui) passes unchanged.

## F3. Life ledger loader and track state (the only level reader)

**Spec.** NEW life-tracks-server.ts (server only).

loadLifeLedger(userId) = cached('lifeLedger:' + userId, ['life']). Five reads in one Promise.all, so one round trip:
1. SELECT track, day, SUM(xp) FROM ActivityEvent WHERE userId AND sink = 'TRACK' AND track IS NOT NULL GROUP BY track, day.
2. SELECT e.track, e.compositionKey, SUM(e.xp), MAX(t.composition::text) FROM ActivityEvent e LEFT JOIN TaskTemplate t ON t.id = e.templateId WHERE e.userId AND e.sink = 'TRACK' GROUP BY e.track, e.compositionKey.
3. WEEK rows: track, dedupeKey, day, qty, detail.
4. MP_MINT rows: track, templateId, dedupeKey, day, qty, detail. reason = detail before ' · '; why = the rest.
5. LifeSettings.epochDay.

This loader and the week judge are the only readers of TRACK rows. The judge reads TASK and UNDO rows for its floors only. Record this in data-model.md.

Pure, in life-tracks.ts: trackStateAt(ledger, D), per track:
- xp = max(0, Σ xpByDay with day ≤ D).
- Judged weeks: rows with sunday ≤ D, ordered by weekKey.
- keptWeeks = count of kept weeks. Backfill rows count: they are real judgements.
- keptStreak = the trailing run of kept weeks ending at the latest judged week. A not-kept week ends it; the unjudged current week does not.
- goalDepth = min(2, Σ GOAL_DEPTH[reason]) over mints keyed 'mp:GOAL:*' with qty > 0, this track, day ≤ D.
- level, depth, cap and pointsLevel via life-economy. atCap = pointsLevel > level.
- bonusPercent = streakBonusPercent(7 × keptStreak). It hits the +20% cap after 10 kept weeks.
- effectiveLevel = level × (1 + bonusPercent / 100).
- composition = effectiveFieldComposition(TRACK_SEED[track], ...). The inputs are this track's keys with xp > 0 and a parseable composition, each as {composition: normalised({...emptyComposition(), ...json}), totalPoints: xp}. Keys with xp ≤ 0 are dropped; with none left, the composition is the seed. Compositions are not replayed: past days use today's mix, as the Field ghost does.

lifeContributionRows(states): one row per state with level > 0 = {fieldName: 'Life · ' + name, level: effectiveLevel, composition, source: 'LIFE'}.

trackRowsView(ledger, today), per track in DISPLAY_ORDER:
- meter = atCap ? 1 : (xp − xpForLevel(L)) / (xpForLevel(L + 1) − xpForLevel(L)).
- now = the meter today.
- banked = the meter at the end of last life week (state at addDays(weekStartKeyOf(today), −1)) when the level was the same then, else 0.
- The Meter's cap tick is passed only when atCap, at 1.
- weeks = the last ≤ 8 judged weeks, oldest first: 'kept' or 'missed'. Never padded.
- edge = level / cap, and 0 at level 0.
- line (integers formatted en-GB):
  - xp = 0: 'No Body tasks yet · 49 XP reaches level 1'.
  - atCap: 'Capped at {cap} · {n} more kept weeks raise it · {xp} XP banked'.
  - otherwise: '{xp} / {nextXp} XP · depth cap {cap} · {n} more kept weeks raise it'.
  - n = moreKeptWeeks. For n = 1 the copy is singular: '1 more kept week raises it'.
  - Append ' (or a paid Mid goal)' when goalDepth < 2 and depthCap(trackDepth(kw, goalDepth + 1)) > cap.

Other pure helpers:
- lifeMpInWeek(ledger, monday) = Σ qty of mints whose reason is in CAPPED_REASONS and whose day falls in [monday, monday + 6].
- levelSeries(ledger, n = 12) = per track, the level at each of the last ≤ n judged Sundays.
- keptWeekGrid(ledger, n = 12).
- lifeContributionsAt(ledger, day).

loadLifeTracks(userId, now):
- Not launched, or no epochDay: return {launched: false, levels all 0, rows [], contributions [], edges null, mpThisWeek {0, 8}}. Phase A therefore changes nothing live.
- Otherwise return the full view from trackStateAt(todayKey).
- Wrapped in React cache() over the process cache.

**As built (lead decisions after the phase A review).**
- The ' (or a paid Mid goal)' clause is dropped (U7): `trackLine` returns exactly the strings above, and the Life tracks aside says once 'levels capped by kept weeks and paid goals'.
- `trackComposition` clamps each attribute at max(seed share, TRACK_SHARE_CAP 16) via `clampTrackComposition` (C6).
- `loadLifeLedger` is the empty ledger, with no query, until launch, and while there is no epochDay. `readLifeLedger` is the ungated read, for the launch script only.
- The view adds `mpLastWeek {used, cap, weekKey}` (U1).

**Files.** new C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/life-tracks-server.ts; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/life-tracks.ts (implementation)

**Tests.** character-check §4 (fixture ledgers, no DB):
- Level replay at weekly points from fixture events.
- A not-kept week resets keptStreak, while keptWeeks keeps counting.
- A backfill week counts for depth.
- Goal depth from MID + LONG is capped at 2; a 0-qty goal row adds nothing.
- A synthetic BODY level 3 on the seed alone adds PHYSICAL 1.38. With a kept streak of 10 weeks it adds 1.66 (×1.20).
- A negative-XP composition key is dropped, and all keys ≤ 0 fall back to the seed.
- Lines:
  - (1960 xp, 25 kept) gives '1,960 / 2,401 XP · depth cap 7 · 7 more kept weeks raise it';
  - (4900, 25) gives 'Capped at 7 · 7 more kept weeks raise it · 4,900 XP banked';
  - zero XP gives 'No Body tasks yet · 49 XP reaches level 1'.
- Pips: at most 8, never padded.
- lifeMpInWeek counts only capped reasons inside the week.
- Not launched: levels all 0 and contributions [].

## F4. Lazy, idempotent weekly judgement (replaces the settlement Sunday step)

**Spec.** NEW life-weeks.ts (pure). The analogue of settlement-plan.ts.

Which weeks are judged:
- lastJudgeableSunday(today): d = addDays(today, −3); take the Sunday on or before d. W is judgeable from Wednesday 04:00 after its Sunday.
- planWeeks(state) covers weeks oldest first, from weekKeyOf(epochDay) to the week of lastJudgeableSunday(today). It skips weeks whose four WEEK rows exist (and plans only the missing tracks of a partial week), at most 12 weeks per run.
- The epoch week is judged on its days ≥ epochDay.

Per-track week inputs come from TASK rows with sink TRACK:
- An UNDO whose dedupeKey is 'undo:<id>' marks TASK row <id> undone; UNDO rows themselves are ignored.
- days = distinct days with ≥ 1 live row.
- completions = count of live rows.
- raw = Σ rawXp.
- effortMinutes (BODY only) = Σ over rows whose template category is EXERCISE of receipt.minutes × weight. The weight comes from the receipt's B factor: B 5 → 0, B 10 → 1, B 20 or 35 → 2.

Floors (KEPT_MIN_DAYS 3, KEPT_MIN_RAW 30):
- CRAFT and CARE: kept iff days ≥ 3 and raw ≥ 30.
- BODY: kept iff days ≥ 3, raw ≥ 30 and effortMinutes ≥ 150. This is WHO's moderate-equivalent rule applied to the receipt band. There is no strength-day rule and no pro-rating until M2's rest days.
- DUTY: count occurrences of every compulsory TASK or HABIT template on any track, on days ≥ max(startDay, epochDay) and before the day it was archived:
  - fixed schedules: occurrencesBetween over the week;
  - TARGET:n/W: n occurrences, kept = min(n, distinct kept days), held = min(n − kept, distinct held days), the rest missed; skip it that week if the template started after Monday; monthly targets are not judged weekly;
  - a compulsory one-off with dueDay in the week: one occurrence, kept or held by a done instance with day ≤ dueDay;
  - outcome via instanceOutcome; no instance means missed.
  - Rule: any missed occurrence → not kept. Otherwise, ≥ 3 occurrences → kept iff Duty raw ≥ 30. Otherwise (0–2 occurrences, none missed) → kept iff Duty completions ≥ 5 on ≥ 3 days and raw ≥ 30.
  - MVV holds and still needs the floor.
  - #play, study-linked and other sink-NONE completions never count.
- heldDays: Set<DayKey> is an input, empty in M5; M2 fills it from RestDay.

The WEEK.detail reason line:
- Kept: 'Kept · 4 days · 52.0 raw XP'. BODY adds ' · 180 effort min'; DUTY adds ' · 5 musts kept' when there were musts.
- Not kept: 'Not kept · ' plus the failing parts from '2 of 3 days', '12.0 of 30 raw XP', '90 of 150 effort min', '1 must missed (Tue)', '4 of 5 completions'.
- backfill = sunday < launchDay. Backfill rows prefix 'backfill · ' and never mint.

Mints for a non-backfill week:
- used = Σ capped MP dated in [monday, sunday]. Short goals closed that week use the cap first.
- For each kept track in TRACKS order (BODY, DUTY, CRAFT, CARE): delta = round2(min(1.5, 8 − used)). Mint when delta > 0 with key 'mp:LIFE_WEEK_KEPT:<TRACK>:<weekKey>', day = sunday, reason LIFE_WEEK_KEPT, detail 'kept week <weekKey>' (+ ' · trimmed by the weekly cap' when below 1.5). Then used += delta.
- In M5 a week can hold at most 2 × 1 + 4 × 1.5 = 8, so nothing is ever trimmed. M2 appends LIFE_FULL_DAY after these through the same cap.

WeekPlan = {weekKey, monday, sunday, backfill, tracks: {track, kept, detail}[], mints}.

NEW life-weeks-server.ts.

judgeClosedWeeks(userId, now, {force?, dryRun?}):
- Writes only if launched and (lifeWritesEnabled() || force); dryRun returns the plans.
- Fresh reads in one Promise.all:
  - LifeSettings.epochDay;
  - WEEK keys in the range;
  - TASK and UNDO rows with sink TRACK in the range, joined to TaskTemplate.category through $queryRaw (id, source, dedupeKey, day, track, templateId, rawXp, receipt, category);
  - compulsory templates, archived ones included (recurrence, startDay, dueDay, archivedAt, kind);
  - their instances in the range (templateId, day, status);
  - MP_MINT rows dated in the range (day, qty, detail).
- Per planned week, oldest first: one $transaction array of 4 WEEK activityOps ({source 'WEEK', sink 'NONE', track, day = sunday, occurredAt = now, qty 1 or 0, detail, dedupeKey 'week:<TRACK>:<weekKey>'}) plus the mintLifeMasteryOps pairs.
- A P2002 means another run judged that week: stop and let the next run re-read.
- After commit: invalidate('life', 'progress', 'activity').
- No interactive transactions.
- The writes are wrapped in withMoments (today-board.ts) with captureSnapshot(userId, {scope: 'settle'}) before and after, and detectCelebrations({cause: 'settle'}). T2 and T3 moments persist as pending and the CelebrationHost plays them on the next load.

maybeJudgeWeeks(userId, now), the after() entry:
- Returns at once unless lifeWritesEnabled(), launched, epochDay is set, and the week of lastJudgeableSunday is missing from the cached ledger's judgedWeeks. Weeks commit oldest first, so that week judged means every earlier one is.
- Single flight per user (a module Map of in-flight promises).
- Never throws; it logs.

Hooks:
- after() on /you and /today/week (phase A);
- after() on /today (phase B).

M2's settleLifeDays later calls judgeClosedWeeks as its Sunday step. The dedupe keys keep the two safe together.

**As built.**
- The judge reads in two round trips: the epoch and the WEEK keys, then the planned weeks' rows.
- Each week's array opens with the life-mint advisory lock (C3).
- `JudgeOptions` adds `moments?` (default true) and `maxWeeks?`, which is honoured only with `dryRun` (C2, C4).
- The withMoments snapshots each get their own Date (C1).
- `maybeJudgeWeeks` also waits for the launch's DECAY_GRACE row 'life launch <day>' (C4).
- Phase B added the /today `after()`.

**Files.** new C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/life-weeks.ts; new C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/life-weeks-server.ts

**Tests.** character-check §5 (pure, on planWeeks):
- DUTY:
  - 3 trivial musts with 12 raw XP: not kept; with 30 raw: kept.
  - An MVV-only week with 30 raw: kept; with 12: not.
  - One missed must with 60 raw: not kept.
  - No musts: 5 completions on 3 days with 30 raw is kept; 4 completions is not.
  - 2 kept musts plus the volume floor: kept.
  - An archived template's days after archiving are not counted.
- CRAFT: 5 ticks on 2 days is not kept; 3 days with 30 raw is kept; a day whose only tick was undone does not count.
- BODY:
  - 2 × 60-minute DEMANDING gym sessions plus 1 × 30-minute walk on 3 days: kept (270 effort minutes).
  - 3 × 30-minute walks: not kept (90).
  - Daily meds plus 1 walk: not kept.
  - HEALTH-category minutes do not count.
- Timing:
  - With today = Sunday + 2 (Tuesday), W is not planned; on Wednesday it is.
  - Applying a plan and re-planning gives 0 ops.
  - The epoch week starting Thursday uses days ≥ epochDay only.
  - A week spanning the Sydney DST change judges 7 day keys.
- Launch:
  - LIFE_LAUNCH_DAY null gives an empty plan.
  - A week whose Sunday is before the launch day is backfill: detail starts 'backfill · ' and there are no mints.
  - A week whose Sunday equals the launch day mints.
- Cap:
  - 2 Short goals (2 MP) plus 4 kept tracks makes exactly 8, no trim.
  - With 7 already used, the first kept track mints 1.0 and the rest are not minted; a 9th MP is trimmed to 8.
- 12 weeks per run at most.

Rehearsal (the lead, on xtnl-rehearsal with XTNL_LIFE_JUDGE=1):
- Two concurrent judge calls leave one WEEK row per key and one MasteryLedgerEntry per mp key.
- A second render writes nothing.
- The week Seal appears on the next load.

## F5. Life MP minting

**Spec.** mastery.ts gets mintLifeMasteryOps(userId, {reason, delta, why?, dedupeKey, day, track?, templateId?, now}). It returns the ops for a $transaction array:
- activityOp(userId, {source 'MP_MINT', sink 'NONE', track, templateId, sourceId: templateId, day, occurredAt: now, qty: delta, detail: why ? reason + ' · ' + why : reason, dedupeKey});
- and, only when delta > 0, prisma.masteryLedgerEntry.create({data: {userId, delta, reason, detail}}).

A delta of 0 writes the decision row alone, as for a goal closed for nothing. A P2002 on the event rolls back both ops. Export the pure lifeMintData(...) for the check.

Callers run invalidate('progress', 'life', 'activity') after commit, because the balance is cached under 'progress' (mastery.ts:107) and MP_MINT rows are sink NONE.

Reasons:
- now: LIFE_WEEK_KEPT, GOAL_SHORT, GOAL_MID, GOAL_LONG;
- LIFE_FULL_DAY: from M2, through the same helper and cap;
- LIFE_PR: reserved, never minted.

MasteryLedgerEntry.reason is a free String, so no migration is needed.

decayStaleMastery's idle-clock query adds reason 'DECAY_GRACE' next to SKILL_UNLOCK and DECAY. The launch script writes one zero-delta DECAY_GRACE row, because life can make an emblem affordable and start the 5%/day decay sooner.

measureMasteryRate needs no change: it already counts every delta > 0.

**Files.** C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/mastery.ts

**Tests.** character-check §6:
- The op pair: the first op is the MP_MINT carrying the dedupeKey, the second the ledger entry with the same delta and reason.
- Delta 0 gives one op and no ledger entry.
- Detail format: 'GOAL_MID · 2 Mid goals paid in the last 30 days'.

Rehearsal: replaying a mint raises P2002 and leaves exactly one MasteryLedgerEntry.

npm run skills:stats output is byte-identical.

## F6. Goals: state, measure, close, pay

**Spec.** NEW goals.ts. Pure; it imports life-economy and life-day, not today-board.

goalProgress(input, asOf) gives g, clamped to 0..1:
- CHILDREN: done one-off steps (completedDay ≤ asOf) ÷ steps, where steps are non-recurring, non-goal, non-archived children. With 0 steps, g = null.
- MANUAL: Σ GOAL_PROGRESS qty with day ≤ asOf ÷ krTarget. With no target, g = null.
- REVIEWS, IDEAS, WORKOUTS and RUN_KM: null (not measured in M5; capture only produces CHILDREN and MANUAL).
- asOf = dueDay ? min(today, dueDay) : today, so progress after the due day never counts.

closeDecision(input) returns a GoalPayout {horizon, track, reason, stated, bar, scaled, g, pays, why, depth}:
- stated = goal.goalMp ?? statedGoalMp(horizon).
- lifetime = daysBetween(createdDay, today).
- Gates in order; the first one that fails sets why and pays 0:
  1. not launched → 'before life MP began';
  2. g null → 'not measured: add a step or a number';
  3. g < bar → 'not finished' (SHORT) or 'below 70%';
  4. lifetime < 3 / 21 / 90 → 'set N days ago; it pays once 21 days old';
  5. SHORT: ≥ 2 Short goals already paid in the same life week → '2 Short goals already paid this week';
  6. MID: ≥ 2 paid with day in (today − 30, today] → '2 Mid goals paid in the last 30 days';
  7. LONG: ≥ 1 paid in (today − 91, today] → 'a Long goal paid in the last 91 days'.
- If every gate passes: SHORT pays stated (binary), trimmed to 8 minus the capped MP already in the close day's life week (0 gives the why 'the life week's 8 MP cap is reached'). MID and LONG pay round2(stated × g).
- depth = pays > 0 ? min(GOAL_DEPTH[h], 2 − that track's current goal depth) : 0.
- Goals never pay XP.

statedPayoutCopy(horizon, stated):
- SHORT: 'pays ⬡ 1 when done';
- MID and LONG: 'pays ⬡ 6 × progress from 70%'.

NEW goals-server.ts.

readGoalCloseInput reads in one Promise.all:
- the goal (own user, kind GOAL, not archived, closedScore null; track, horizon, goalMp, krMetric, krTarget, dueDay, createdAt);
- its children;
- Σ GOAL_PROGRESS by day;
- the goal mints (the last 91 days, plus this track's paying ones, from a fresh read);
- the capped mints of the close week.

closeGoalCore(userId, goalId, now):
- One $transaction: taskTemplate.updateMany({where: {id, userId, kind 'GOAL', closedScore: null}, data: {closedScore: g ?? 0, completedAt: now}}) plus mintLifeMasteryOps({reason, delta: pays, why, dedupeKey: 'mp:GOAL:<id>', day: today, track, templateId: id}).
- A P2002 returns 'Already closed.'
- After commit: invalidate('life', 'progress', 'activity').
- It writes only NONE rows, never a TRACK row. Closing is final.

rescheduleGoalCore(userId, goalId, day):
- today ≤ day ≤ today + 3650;
- sets dueDay only; horizon and goalMp stay frozen;
- invalidate('life', 'activity').

loadGoalLadder(userId, now), cached 'goalLadder:<user>' with tags ['life', 'activity'], covers open goals and goals closed in the last 30 days. Each item: {id, title, horizon, track, stated, copy, g, progressLabel ('3 of 5 steps', '4 of 12 books'), dueDay, pastDue, carried (g when past due and g < 1), preview: GoalPayout | null, closed: {paid, depth, day, why} | null}.

stateGoalMp(userId), for the launch: updateMany goalMp = statedGoalMp(horizon) where kind is GOAL, goalMp is null and closedScore is null.

actions/tasks.ts (not capture-owned) gains:
- closeGoal(goalId, opts) = aroundTick(userId, {scope: ['goals', 'levels', 'tracks']}, closeGoalCore), returning {paid, g, why, depth, celebrations};
- previewGoalClose(goalId) → GoalPayout, read-only;
- rescheduleGoal(goalId, day).
No UI calls them until phase B.

**As built.**
- A close's `$transaction` opens with `lifeMintLockOp`. When it pays, `closeGuardOp` follows: it re-counts `goalLimitWindow` and, for a SHORT, the week's capped MP. A lost race returns `GOAL_CLOSE_STALE`, 'Something changed; try again.' (C3).
- Same-day rows order by (day, occurredAt, key) (C5).
- Closed ladder items are measured as of min(close day, due day) (`closedGoalReading`, U5).
- The shared floored percentage is `goalPercent` (U6).
- The ladder's cache key is 'goalLadder:<user>:<today>'.
- More why strings: 'trimmed by the life week's 8 MP cap', 'set today; it pays once 3 days old' and 'it states 0 MP'.

**Files.** new C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/goals.ts; new C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/goals-server.ts; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/app/actions/tasks.ts

**Tests.** character-check §7 (the payout table):
- SHORT: same-day close pays 0; lifetime 3 at g 1 pays 1; a 3rd SHORT in a life week pays 0.
- MID:
  - g 0.69 pays 0;
  - g 0.8 at lifetime 21 pays 4.8 and adds depth 1;
  - a 3rd MID within 30 days pays 0;
  - a MID 31 days after two paid ones pays.
- LONG: lifetime 89 pays 0; g 0.9 at lifetime 90 pays 18 and adds depth 2.
- Depth: MID + LONG on one track adds 2 in total (capped); a SHORT adds 0.
- A CHILDREN goal with no steps pays 0 'not measured'; REVIEWS, IDEAS, WORKOUTS and RUN_KM pay 0.
- Steps done after the due day do not count.
- Before launch: 0 'before life MP began'.
- goalMp null falls back to statedGoalMp.
- The close ops are all sink NONE with exactly one 'mp:GOAL:<id>' row, plus a ledger entry only when pays > 0: a goal close writes no TRACK row.

Rehearsal: a double tap on Close leaves one decision row and one payout.

## F7. Attribute seam: life feeds the 13 attributes, gates and epithet

**Spec.** skill-effects.ts:
- loadProgressionUncached adds loadLifeTracks(userId) to its Promise.all.
- Export scoresWithStreak(rows, streakBonuses, streakMultiplier, lifeRows: FieldContribution[] = []). It concatenates lifeRows after the Field rows, unamplified: STREAK_AMPLIFIER / COVENANT's streakMultiplier still multiplies Field streak bonuses only.
- Pass the life rows in the base pass (line 209), the second pass (line 223) and loadAttributeScores (line 172, which celebrations.ts uses for the Seal epithet).
- loadProgression's tags become ['fields', 'progress', 'life']. A tick now recomputes progression once; its inner loaders (field rows, streak bonuses, augments) stay warm.

No change is needed in skill-gates (meetsRequirements, unlockBlockers), readyEmblems, decay or titles.ts. They read scores, so emblem gates and 'the Unwearied' (PHYSICAL leads) follow automatically.

attributes.ts: FieldContribution gains optional source?: 'FIELD' | 'LIFE', and sourcesFor passes it through.

progress-rate.ts:
- measureScoreRate(userId, now) adds lifeContributionsAt(ledger, then) to thenScores and lifeContributionsAt(ledger, today) to nowScores, where then is the oldest snapshot day it already uses.
- loadProgressRates tags add 'life'.

**Files.** C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/skill-effects.ts; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/attributes.ts; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/progress-rate.ts

**Tests.** character-check §3b:
- scoresWithStreak(rows, bonuses, 1, []) deep-equals the pre-M5 result.
- With lifeRows from an empty ledger, the scores are identical.
- A COVENANT multiplier of 1.5 leaves the life share unchanged.
- A BODY L3 row adds PHYSICAL 1.38.
- sourcesFor carries source 'LIFE' on life rows.

npm run skills:stats is unchanged. The audit SQL (scripts/life-audit.sql) is unaffected.

## F8. One character level, title and crest edges

**Spec.** shell-types.ts (a frozen contract, extended compatibly; lead decision):
- characterLevelOf(fieldLevels, trackLevels: number[] = []) delegates to character.ts.

shell-data.ts build():
- adds loadLifeTracks(userId).catch(() => null);
- level = characterLevelOf(fieldLevels, Object.values(view.levels));
- character.tracks = view?.launched ? view.edges : null, where edges are level ÷ depth cap per track;
- title = computeTitle(level, progression.scores, ultimates). Scores now include life, so the epithet can become 'the Unwearied' when PHYSICAL leads.

sheet-math.ts:
- characterRaw(fieldLevels, trackLevels = []) delegates to character.ts.
- knowledgeRow stays Fields-only: Knowledge is its own row.
- Add mainSourceOf(a, comps) → {name, value} | null and keep mainSource.

Call sites that pass tracks:
- shell-data.ts;
- you/_lib/sheet.ts;
- you/_lib/stats.ts;
- celebration-detect detectLevels (F9).

leveling.ts and xp.fieldLevel are untouched. Titles, the crest material band and level captions follow the new level everywhere.

**Files.** C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/components/shell/shell-types.ts; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/shell-data.ts; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/components/home/sheet-math.ts

**Tests.** shell-check:
- The existing rows 'character level equals xp.fieldLevel for [...]' pass unchanged.
- New: characterLevelOf([4,9,2], [3,1]).level = floor(Σ both), with progress in [0, 1).

you-check:
- 'sheet: character level and progress agree with the shell' also holds with tracks.
- characterRaw(levels) is unchanged for one argument.
- mainSourceOf returns 'Life · Body' when the life row contributes most.

## F9. Celebrations: week kept, track level, goal finished, character

**Spec.** snapshot.ts:
- Add readTracks(userId) = {levels: loadLifeTracks().levels} under PART_TAGS.tracks ['life', 'activity'], and remove the 'tracks' exclusion (ReadablePart = SnapshotPart).
- readLevels adds tracks (only when launched) to LevelsPart, and PART_TAGS.levels adds 'life'.
- readGoals returns goals with closedScore not null, plus paid, why and track from their 'mp:GOAL:<id>' row.
- readLedger:
  - the backfill test becomes detail?.startsWith('backfill');
  - WEEK rows now carry their track (F2);
  - each kept week row gets mp = the qty of 'mp:LIFE_WEEK_KEPT:<track>:<week>'.

celebration-detect.ts types. All new fields are optional, so stored snapshots still parse:
- LevelsPart.tracks?: Record<string, number>;
- GoalRow gains paid?, why?, track?;
- LedgerRow gains mp?.

Scopes:
- SNAPSHOT_SCOPES.tick = ['streak', 'habits', 'goals', 'levels', 'tracks'].
- settle adds 'levels'.

detectLevels(b, a, trackUps = []):
- The character counts tracks only when BOTH snapshots carry them; otherwise both sides are Fields-only, so a stale read never invents a level.
- When the main moment is title, band or character-level, the trackUps fold in as lower drafts. The cause line then reads 'Duty reached level 12, which lifted your character level'.

diffProgress:
- trackUps = detectTracks(...).
- If they are not folded into a levels moment and a week-kept draft exists in the same diff, fold them into the latest week Seal. Their 'Body track L3 → L4' rows lead its What-moved list and their keys are claimed.
- Otherwise they play alone.
- So one kept week gives at most one week Seal plus one character or title moment.

detectLedger (the week Seal):
- amounts [{kind 'mp', value Σ mp, label 'MP'}] when Σ mp > 0;
- the line '+1.5 MP for each kept track.', or '+X MP, trimmed by the life week's cap of 8.';
- title, numeral and href /today/week unchanged.

detectGoals:
- Fires only for newly closed goals with closedScore ≥ payBar(horizon); a missed goal never gets a Seal.
- States what was paid, never goalMp.
- paid > 0:
  - SHORT line 'It pays the 1 MP stated when you set it.'; MID line 'It pays 4.8 MP: 6 × 80%.';
  - amounts = MP paid;
  - What-moved rows 'MP paid +4.8' and 'Duty depth +1' when depth was added.
- paid 0: 'Finished at 100%. It pays no MP: <why>.' with numeral = progress %.
- LONG keeps the goal-long T3 with grants ['+18 MP: 20 × 90%', 'Craft depth +2'].
- The PR detector and its copy stay inert.

celebrations.ts: CAUSE_WORD gains launch: 'life tracks joining your character'.

**As built.** `readLife` builds the view from `loadLifeLedger` (`lifeTracksView`), not the React-cached `loadLifeTracks`, so a before and an after snapshot that share one Date still differ (C1).

**Files.** C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/snapshot.ts; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/celebration-detect.ts; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/celebrations.ts

**Tests.** celebration-check:
- Week fixtures read the track from the row, as activity.ts now stores it.
- A week with Σ mp 4.5 states amounts 4.5. A backfill week fires nothing.
- A track level-up in the same settle as a kept week folds into the week Seal (claims track:BODY:4).
- A track level-up that lifts the character folds into the character-level or title moment and leaves the week Seal separate: 2 moments.
- Asymmetric tracks (before without, after with) fire no character moment.
- A tick scope that lifts BODY from L1 to L2 alone gives one track-level Seal.
- Goals:
  - closed below the bar: no Seal;
  - MID paid 4.8 states 4.8, not 6;
  - finished but paid 0 states the why;
  - LONG is T3 with grants.
- Every T2 and T3 passes honestyProblem.

## F10. You sheet: life section, radar with life, goals and mastery

**Spec.** you/_lib/sheet.ts, loadSheet:
- Adds loadLifeTracks(userId), loadGoalLadder(userId) and readProgress(userId, {scope: ['habits']}) (habits by rung, via habitStrength and rungOf) to its Promise.all.
- level, progress, title and distance use characterRaw(fieldLevels, life levels).
- Radar compositions = Field compositions plus life.contributions as {name, level: effectiveLevel, composition}.
- weekAgo = the Field ghosts plus lifeContributionsAt(ledger, today − 7). ghostScores stays exact.
- Top-3 notes use mainSourceOf: 'from Life · Body +2.8'.
- New SheetData fields: life: LifeTracksView; goals; rungs; lifeNote (launched and the launch day within the last 14 days).

you/page.tsx:
- after() runs recordTodaySnapshot() and then maybeJudgeWeeks(userId).
- CharacterHero gets tracks = s.life.edges and lifeMp = launched ? mpThisWeek : null.
- LifeNote renders above LifeTracks when s.lifeNote.
- LifeTracks gets the life rows.
- MasteryCard becomes the 'Goals and mastery' card with GoalLadder.

CharacterHero: when lifeMp is set, the purse gains a cell 'life MP this week' showing '{used}/8' with the mp glyph.

SheetSections:
- LifeTracks({knowledge, life}) renders TrackRows in Duty, Craft, Body, Care order (sigil, level, 8-week pips, meter with banked, now and an xp gain, cap tick when atCap, line), then Knowledge. The aside reads 'levels capped by kept weeks'. When not launched it shows Knowledge only and no longer promises 'arrive with life tracks'.
- AttributeRadar aside: '13, from your Fields and life tracks' when any life contribution exists; empty-state copy 'Attributes grow from Field levels and life tracks.'
- MasteryCard aside: 'goals pay MP when finished'.

NEW GoalLadder.tsx (presentational):
- Open goals, LONG → MID → SHORT. Each shows:
  - the title;
  - the track sigil and name, so a wrong lexical track is visible;
  - the progress label and %;
  - statedPayoutCopy;
  - the due label;
  - 'Carried 0.55 · reschedule or close it on Today' when past due with g < 1;
  - the preview's why when closing now would pay 0.
- Goals closed in the last 30 days: 'Closed · paid ⬡ 4.8 · Duty depth +1', or 'Closed · paid 0: <why>'.
- Mastery rows: ideas mastered and Field tiers (as now), habits by rung ('Automatic 1 · Established 3 · Forming 2 · Seeded 4'). No PRs.
- Empty state: 'No goals yet. Capture one with goal: read 12 books by dec.'

NEW LifeNote.tsx (client):
- Copy: 'Life now counts toward your character: Body, Duty, Craft and Care feed your attributes, emblem gates, title and level. Kept weeks raise each track's cap.' Button 'Got it'.
- localStorage key 'xtnl:you:life-note:v1'; every read and write in try/catch. With no stored value it renders.

you.css: ladder, 4-cell purse and note styles in @layer components. Respect the 12 px floor and use no Tailwind-colliding class names.

/dev/style/art/you fixtures: use the new line copy, and the KeptWeeks legend drops 'held (vacation)'.

No 'M5' tokens in non-comment code (you-check). No recharts.

**As built.**
- The hero's cell shows the last judged week, not this week (U1): `lifeMp = launched ? lifeMpCell(s.life.mpLastWeek, s.today) : null`. It reads:
  - 'life MP last week';
  - 'life MP, week of 21 Sep' while the week that just ended is unjudged;
  - '—' with 'life MP · no week judged yet' before any verdict.
- The ladder's '· reschedule or close it on Today' clause shows only once launched (U2).
- Closed goals show no % when unmeasured (U5).
- The aside reads 'levels capped by kept weeks and paid goals' (U7).

**Files.** C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/app/you/_lib/sheet.ts; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/app/you/page.tsx; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/components/home/SheetSections.tsx; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/components/home/CharacterHero.tsx; new C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/components/home/GoalLadder.tsx; new C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/components/home/LifeNote.tsx; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/components/home/you.css; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/app/dev/style/art/you/page.tsx

**Tests.** you-check:
- Milestone-code and class-collision rules hold.
- ghostScores with a life row moves only by that row's level change.
- The top-3 note is 'from Life · Body +2.8' for a life source; 'from Stats' still holds for the existing fixture.
- LifeTracks renders 5 rows when launched and 1 when not.
- GoalLadder copy for SHORT and MID.
- LifeNote guards storage.

ui-audit on the rehearsal server at 344, 375, 932 and 1440 for /you and /dev/style/art/you: no overflow, targets ≥ 40, text ≥ 12 px, no console errors.

## F11. You › Stats: track levels over time and kept weeks

**Spec.** you/_lib/stats.ts, loadStats:
- Adds loadLifeTracks and loadLifeLedger.
- level, title and distance use characterRaw(fields, track levels).
- New life field: {launched, series, kept}.
  - series: TrackSeries[] from levelSeries over ≤ 12 judged Sundays, named Duty, Craft, Body, Care, with integer levels.
  - kept: {name, weeks: WeekMark[]}[] for ≤ 12 judged weeks, with the same week columns for every track, plus week labels ('28 Sep').

stats/page.tsx, when launched:
- A 'Track levels' card with TrackLines over up to 12 weeks, only when ≥ 2 points exist; otherwise 'Levels chart from the second judged week.'
- A 'Kept weeks' card with KeptWeeks and the legend 'Filled: kept · outline: not kept.'
- The character-level tile includes tracks.

TrackCharts.tsx:
- TrackLines must draw 2–12 points.
- KeptWeeks gains an optional labels prop, so cells read 'Week of 28 Sep: kept'.
- No recharts.

**Files.** C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/app/you/_lib/stats.ts; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/app/you/stats/page.tsx; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/components/home/TrackCharts.tsx

**Tests.** you-check: endLabelTops is unchanged, TrackLines is fine with 2 points, and the KeptWeeks labels work.

character-check §4: levelSeries from fixture events gives the expected weekly levels.

ui-audit on /you/stats at 344, 375, 932 and 1440.

## F12. /today/week (last judged week) and /today/rules (published constants)

**Spec.** today/week/page.tsx:
- Add export const dynamic = 'force-dynamic', and after() → maybeJudgeWeeks(userId).
- When launched and a week has been judged, show a 'Last week' card for the latest judged week:
  - heading 'Week of 28 September · 3 of 4 tracks kept';
  - one row per track (Duty, Craft, Body, Care): sigil, a kept / not-kept chip, the stored reason (WEEK.detail without 'backfill · '), the MP paid ('+1.5 MP', or 'kept before life MP began' for backfill weeks) and the kept-week streak;
  - footer 'Life MP for that week: 4.5 of 8'.
- No judged week yet: 'The first week is judged on Wednesday 7 October, once the last day of the week of 28 September can no longer be recorded.' The date is computed from lastJudgeableSunday.
- Not launched: today's placeholder, minus the false 'No week has been judged yet' heading. Keep the five-steps list: that is the M2 runner.
- Must not import the capture-owned components/today/**.

today/rules/page.tsx: a 'Tracks and kept weeks' card rendered from life-economy constants:
- the level and depth formulas;
- the four floors;
- judging at Wednesday 04:00;
- the LIFE_MP amounts;
- the 8 MP weekly cap and which reasons share it;
- the goal table (stated amount, bar, lifetime, limits, depth, cap 2);
- 'Goals never pay XP'.
Full day stays 'pays from daily settlement'.

**As built.**
- /today/week heads its card 'Last judged week' while the week that just ended is pending, with 'The week of 28 September is judged on Wednesday 7 October.' (U8).
- Once launched, the review promise drops 'Monday' and the track verdicts (U9).
- /today/rules (U3, U4, U10):
  - states Craft/Care, Body and Duty floors separately;
  - says 'a goal closed below its bar pays nothing', and that a goal past due is carried until rescheduled or closed;
  - kept-week MP is 'dated the week's Sunday, paid once the week is judged';
  - a Short goal pays 'at 100%';
  - sr-only ' MP' units;
  - the TRACK_SHARE_CAP clamp.

**Files.** C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/app/today/week/page.tsx; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/app/today/rules/page.tsx; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/app/today/rules/rules.css

**Tests.** ui-audit on /today/week and /today/rules at 344, 375, 932 and 1440.

you-check-style grep: rules constants are imported, never hard-coded.

Manual on rehearsal: the card matches the WEEK rows.

## F13. Economy guard: balance-horizon LIFE block

**Spec.** scripts/balance-horizon.ts imports the pure constants and functions it needs:
- LIFE_MP, LIFE_MP_WEEK_CAP, GOAL_RULES, trackLevel and the depth constants from life-economy;
- priceTask and kneeG from life-grade;
- requiredAttributeScore and SKILL_POOL from skill-pool;
- TRACK_SEED from life-lexicon;
- streakBonusPercent from streak-curve.

knowledgePerDay comes from the existing model: 25 × 0.1 × 10.5 + (10/7) × 25 = 61.964.

It prints a LIFE block and exits 1 on any failed assertion.

The basket (17 rows, streak 30 days, priceTask raw × perWeek, with the knee applied to an even daily raw):
- DUTY: dishes INTRO 15 ×7; tidy INTRO 15 ×3; laundry INTRO 15 ×2; bins INTRO 5 ×1; groceries STANDARD 60 ×1; bill INTRO 10 one-off ×2; big admin DEMANDING 120 one-off ×0.25.
- CRAFT: deep work DEMANDING 90 one-off ×3; emails INTRO 5 ×5; practice STANDARD 30 ×3.
- BODY: walk STANDARD 30 ×4; gym DEMANDING 60 ×2; meds INTRO 5 ×7.
- CARE: meditate INTRO 10 ×7; call mum STANDARD 20 ×1; see a friend STANDARD 120 one-off ×1; journal INTRO 10 ×3.
- Personas: light ×0.6, steady ×1, heavy ×1.8.

Assertions:
1. worst = CAP/7 + 6 × 2/30 + 20 × 1/91 ≤ 0.03 × knowledgePerDay. Now 1.7626 ≤ 1.8589.
2. pool / (knowledgePerDay + worst) / 365 ≥ 10 y. Now 13.33.
3. M5-reachable weekly MP = 4 × 1.5 + 2 × 1 ≤ CAP. Now 8 ≤ 8.
4. Steady basket: 5 ≤ tasks/day ≤ 10 (7.5), and 80 ≤ mean track XP/week ≤ 130 (101.5).
5. Steady mean track, 6 of 7 weeks kept, one MID at week 26: level at week 9 in [3,5] (4); at week 13 in [3,5] (5); first level-10 week in [44,60] (49).
6. Light: first level-10 week > 60 (81).
7. Heavy, all weeks kept, no goals: level(52) − steady all-kept level(52) ≤ 1 (10 vs 10).
8. Worst case (heavy, all kept, a MID every 15 days from day 21, a LONG every 91 days, all in one track): level(13) ≤ 7 (6), and first level 10 at week ≥ 26 (32).
9. Flood: all four tracks at the worst week-52 level (12) with the full +20% bonus, on seed compositions, keep the maximum life-only attribute below requiredAttributeScore(5) = 14.2 (now SELF_RESPECT 13.82). Steady, all at level 10, is 11.52.

Printed only, not asserted:
- emblems whose attribute gates and prerequisites life alone opens at weeks 13 and 52 (38 / 256 MP and 85 / 1,262 MP), against life MP earned by then (about 80 and 340);
- committed life of 1.209 MP/day and its horizon of 13.45 y.

**As built.**
- Assertion 3 is an equality (8 = 8).
- New assertion 9b (C6) models the 65% task pull:
  - unclamped, all-in task mixes reach SELF_RESPECT 42.34;
  - with the share clamp, any mix reaches at most 13.82 < 14.2, and the all-in mixes run through the code agree.
- A TRACK_SHARE_CAP of 18 fails it (PHYSICAL 14.40), and so does 100.
- The printed life MP earned by weeks 13 and 52 is 78 and 318.

**Files.** C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/scripts/balance-horizon.ts

**Tests.** npm run balance:horizon prints the LIFE block and exits 0.

Temporary bumps, verified locally and then reverted:
- LIFE_MP_WEEK_CAP 30 exits 1 (assertions 1 and 3);
- GOAL_DEPTH_CAP 3 exits 1 (assertion 9 gives 14.98);
- a third MID per 30 days exits 1.

## F14. Launch and rehearsal (lead only)

**Spec.** NEW scripts/life-launch.ts. Run by the lead only, never by a subagent. It requires lifeLaunchDay() to be set.

The default dry run prints:
- the launch day;
- the WEEK plan from judgeClosedWeeks({dryRun}), with backfill flags and reasons, and no mints for weeks closed before the launch day;
- open goals with goalMp null, and the stated amount each will get;
- the character level Fields-only versus with tracks, and the title before and after;
- the per-attribute life contribution;
- emblems whose gates life alone newly opens;
- the MP balance, the last SKILL_UNLOCK and whether decay would start.

--apply, after the user's go-ahead:
- judgeClosedWeeks(force);
- stateGoalMp;
- one zero-delta DECAY_GRACE MasteryLedgerEntry;
- the launch moment: after = captureSnapshot(scope ['levels', 'tracks'], fresh); before = the same snapshot with every track at 0; then detectCelebrations(before, after, {cause: 'launch'}). This gives one character or title moment with the track level-ups folded in, idempotent by its dedupe keys. It covers the jump at deploy, which no before-snapshot would otherwise see.

Every write is idempotent and independent of order. So the order is:
1. Rehearse on xtnl-rehearsal. Add XTNL_LIFE_JUDGE '1' and XTNL_LIFE_LAUNCH_DAY to the env of docs/life-plan/dev-rehearsal.mjs (lead file). Use a scripted clock across 2 weeks.
2. In production, set LIFE_LAUNCH_DAY to the deploy day in life-economy.ts.
3. Dry run, then review with the user.
4. Deploy.
5. Run --apply.

scripts/backfill-weeks.ts is not written: the judge itself writes pre-launch weeks as 'backfill · ...' rows with no MP and no Seal.

**As built (C2, C4).**
- The dry run plans every remaining week, up to 520, with a warning if more remain. It computes tracks, character, title, attributes, emblems and decay from `ledgerWithPlans`.
- `--apply` runs in this order:
  1. `judgeClosedWeeks({force, moments: false})`, looped until the plan is empty (at most 100 passes, else exit 1, writing nothing more);
  2. `stateGoalMp`;
  3. the one launch moment;
  4. last, the DECAY_GRACE row 'life launch <day>'. That row is also the marker `maybeJudgeWeeks` waits for.
- On rehearsal, page-load judging starts only after `--apply` has run.

**Files.** new C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/scripts/life-launch.ts; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/docs/life-plan/dev-rehearsal.mjs (lead); C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/life-economy.ts (LIFE_LAUNCH_DAY, set by the lead at launch)

**Tests.** The dry run on rehearsal matches what --apply then writes.

A second --apply writes 0 rows.

A backfill plan contains no MP_MINT rows (character-check §5).

## F15. Phase B: Today integration (only after the capture build merges)

**Spec.** tasks.ts:
- createTemplateCore sets goalMp = statedGoalMp(horizon) for kind GOAL, frozen at creation.
- TEMPLATE_SELECT and toBoardTemplate add goalMp and closedScore.

today-board.ts:
- BoardTemplate += goalMp, closedScore.
- goalCards skips closed goals (closedScore != null).
- Progress comes from goals.ts goalProgress, one source, replacing the inline rule at line 1151; the MANUAL and CHILDREN labels are unchanged.
- GoalCard += carried (g when past due and below 1).

GoalsStrip.tsx:
- Its local GoalPayout is replaced by the stated rule from goals.ts. Copy: SHORT 'pays ⬡ 1 when done'; MID and LONG 'pays ⬡ 6 × progress from 70%'.
- Show the track sigil.
- A Close button calls previewGoalClose, opens a Sheet with the exact figure and why, then closeGoal on Confirm and enqueues the returned celebrations.
- Past due with g < 1: 'Carried 0.55 · Reschedule or close?', where Reschedule uses rescheduleGoal with a date. No debt.

TodayBoard.tsx: wires payoutOf, onClose and onReschedule.

app/today/page.tsx: a separate after() → maybeJudgeWeeks(userId).

package.json:
- "character:check": "tsx scripts/character-check.ts";
- append '&& tsx scripts/character-check.ts' to life:check.

life-types.ts needs no change.

**As built.**
- There is no `payoutOf` prop. `GoalsStrip` and `TodayBoard` take `launched`. Close is hidden before launch, because a pre-launch close would write a permanent qty-0 row (U2).
- The card shows `goalPercent`. It shows the stated payout only once launched ('pays through its steps' before), and reads:
  - 'Carried 0.55 · Reschedule?' before launch;
  - 'Carried 0.55 · Reschedule or close?' after.
- The Close sheet (new `GoalSheets.tsx`) shows 'Closing now pays ⬡ X', the why, the basis and the depth. If the close pays differently, the notice states both figures.
- The board reads GOAL_PROGRESS by (templateId, day) (`goalDays`) and files a closed goal under `{done, 'Closed'}`.
- Goal +1 and Inbox step links refuse a closed goal.
- REVIEWS, IDEAS, WORKOUTS and RUN_KM goals read 'not measured'.
- New fields are optional on the board types.

**Files.** C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/tasks.ts; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/lib/today-board.ts; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/components/today/GoalsStrip.tsx; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/components/today/TodayBoard.tsx; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/src/app/today/page.tsx; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/package.json

**Tests.** board-check:
- a goal card's progress equals goals.ts goalProgress;
- a closed goal leaves the strip;
- a new goal stores goalMp 1 / 6 / 20.

today-ui-check: the Close and Reschedule controls.

ui-audit on /today at 344, 375, 932 and 1440.

Rehearsal: closing a MID at 80% after 21 days pays 4.8, shows a Seal stating 4.8, and adds depth to its track.

## F16. Docs

**Spec.** Rewrite docs/life-plan/m5.md to this refit:
- the lazy judge;
- the floors;
- depth 1.25 and the goal-depth cap of 2;
- no PRs, FULL_DAY in M2;
- the launch constant and env gates;
- the new files, lanes and phases.

grading.md:
- F: the depth formula; the new goldens; the BODY and DUTY floors; Wednesday judging.
- G: LIFE_PR dropped; LIFE_FULL_DAY from M2; goal depth MID 1, LONG 2, cap 2; the trim order (week kept, then full day); qty-0 decision rows.

data-model.md:
- WEEK and MP_MINT keep their track;
- WEEK.day is the judged week's Sunday;
- the WEEK.detail reason and 'backfill · ' prefix;
- 'mp:GOAL:<id>' rows with detail = reason, qty 0 allowed;
- the DECAY_GRACE reason;
- loadProgression and loadProgressRates tags;
- life-tracks-server.ts is the level reader.

PROGRESS.md: the lead updates the heartbeat, status and log.

**Files.** C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/docs/life-plan/m5.md; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/docs/life-plan/grading.md; C:/Users/Thanc/OneDrive/Desktop/XTNL-idea/docs/life-plan/data-model.md

**Tests.** Reviewer reads the docs against the code: every constant and golden matches life-economy.ts and character-check.

## Lanes

Lane 0, contract. Runs first, about an hour, by the lead or lane A. It does not wait for the capture build.
- Files: life-economy.ts (complete), character.ts (complete), and the life-tracks.ts types and labels.
- Type shells of goals.ts (GoalInput, GoalPayout) and life-weeks.ts (WeekJudgeState, WeekPlan).
- A stub life-tracks-server.ts whose loadLifeTracks returns the not-launched view.
- Lanes A–D start once it lands.

Phase A. Four lanes run in parallel on disjoint files, none owned by the capture build.
- Lane A (core, judgement, mint, goals):
  - new: life-tracks.ts (implementation), life-tracks-server.ts, life-weeks.ts, life-weeks-server.ts, goals.ts, goals-server.ts, scripts/character-check.ts, scripts/life-launch.ts;
  - edits: activity.ts, streak-curve.ts, habit.ts, full-day.ts, mastery.ts, src/app/actions/tasks.ts.
- Lane B (seam, character, celebrations): skill-effects.ts, attributes.ts, progress-rate.ts, components/shell/shell-types.ts, shell-data.ts, celebration-detect.ts, snapshot.ts, celebrations.ts, scripts/celebration-check.ts, scripts/shell-check.ts.
- Lane C (UI): app/you/_lib/sheet.ts, app/you/_lib/stats.ts, app/you/page.tsx, app/you/stats/page.tsx, components/home/sheet-math.ts, SheetSections.tsx, CharacterHero.tsx, TrackCharts.tsx, GoalLadder.tsx (new), LifeNote.tsx (new), you.css, app/today/week/page.tsx, app/today/rules/page.tsx and rules.css, app/dev/style/art/you/page.tsx, scripts/you-check.ts.
- Lane D (guards and docs): scripts/balance-horizon.ts, docs/life-plan/m5.md, grading.md, data-model.md.

Every phase A lane avoids the capture-owned files: capture-parse, life-types, autocorrect, components/capture/**, actions/capture.ts, tasks.ts, today-board.ts, components/today/**, app/add/**, AddIdeaForm, actions/ideas.ts, dedup, domain-discovery, Chrome.tsx, package.json. Phase A imports from today-board.ts (withMoments) and tasks.ts (types) only. Phase A is inert in production while LIFE_LAUNCH_DAY is null, so it can merge and deploy dark.

After phase A, two independent reviewers, read-only, findings fixed:
- one for correctness, economy and idempotency;
- one for UI, honesty and copy.

Phase B waits for the capture build. Start only when:
- the PROGRESS.md capture checkbox is ticked and its 2 reviewers are done;
- the heartbeat is stale;
- git status shows no uncommitted capture files.
It is one lane: tasks.ts, today-board.ts, components/today/GoalsStrip.tsx, TodayBoard.tsx, app/today/page.tsx (after() judge) and package.json (character:check plus the life:check chain).

Then the lead runs the launch:
1. Rehearse on xtnl-rehearsal (dev-rehearsal.mjs env XTNL_LIFE_JUDGE=1 and XTNL_LIFE_LAUNCH_DAY) with a scripted 2-week clock.
2. Check the Supabase project ref is xtnl-idea.
3. Set LIFE_LAUNCH_DAY.
4. Dry-run scripts/life-launch.ts, review it with the user.
5. Deploy.
6. Run --apply with the user's go-ahead.
7. Commit and push to main.

No subagent ever touches a database.

## Acceptance

Checks that must pass:
- npx tsc --noEmit, npm run lint and next build pass.
- npm run life:check passes, with character-check appended in phase B. Before that, run tsx scripts/character-check.ts on its own.
- npm run ui:check passes (shell, contrast, review, celebration, you, study-side).
- npm run balance:horizon prints the LIFE block and exits 0:
  - worst case 1.7626 ≤ 1.8589 MP/day (≤ 3%);
  - horizon 13.33 y ≥ 10 y;
  - pacing and flood assertions hold.
  - Each temporary bump (LIFE_MP_WEEK_CAP 30, GOAL_DEPTH_CAP 3, a third MID per 30 days) exits 1, verified and then reverted.
- npm run skills:stats is byte-identical.

Zero-life regression:
- With LIFE_LAUNCH_DAY null, or with no TRACK rows, attribute scores, the character level and the title are identical to today's.
- shell-check's 'character level equals xp.fieldLevel' rows pass unchanged.

On the rehearsal database (xtnl-rehearsal only), with a scripted clock:
- Ticks across two weeks write no WEEK row on Tuesday. On Wednesday they write four WEEK rows with reasons and 1.5 MP per kept track.
- A second render, and two concurrent renders, write nothing more: one row per dedupe key, one MasteryLedgerEntry per mp key.
- A pre-launch week becomes 'backfill · ...' with no MP and no Seal.
- The week Seal plays on the next load with its exact MP. A track level-up folds into it, and a character or title change plays as a separate moment.
- Closing a MID at 80% after 21 days pays 4.8 MP, adds depth 1 and shows a Seal stating 4.8. A 0-pay close shows its reason and no Seal.
- /you, /you/stats, /today/week, /today/rules and /today pass ui-audit at 344, 375, 932 and 1440 with no console errors.

Shared database safety:
- A local next dev against Supabase (NODE_ENV development, no XTNL_LIFE_JUDGE) never writes WEEK or MP rows on read.

Production, run by the lead:
- Verify the project ref is xtnl-idea.
- Review the life-launch dry run with the user: weeks, goalMp, character before → after, newly opened gates, MP balance and the decay check.
- --apply only with the user's go-ahead.
- Read-only queries afterwards:
  - the audit SQL returns 0 TRACK rows sharing a sourceId with REVIEW or IDEA_CREATE;
  - no MP_MINT exists for any week whose Sunday is before LIFE_LAUNCH_DAY;
  - no WEEK row is dated in the current open week.
- Also compare the user's measured 21-day knowledge MP income against the modelled 61.96 MP/day, and note the life share.

The You sheet shows each track at its earned level from TRACK XP and judged weeks only. Nothing jumps without recorded activity; the one-time launch moment and the 'Life now counts toward your character' note explain the deploy-day change.
