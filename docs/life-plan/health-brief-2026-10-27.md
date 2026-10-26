# Health tracking brief: a 5-second check-in, exercise variety and a strength logger

Design input for the lead. 2026-10-27, `main` at 778d6d2. This brief combines five read-only reports in the same folder: u-exercise, u-mood-health, u-platform, r-psych and r-training. This session re-checked three of their facts in the repo (see §0). Nothing here touched the database, Prisma, Gemini or any env file.

User request: "Improve the health tracking (mood, stress level). Research and engineer a 5s action that help track user psychology, add more exercise variety. If weight usage, allow to track maximum weight, have drop set, set count, rep etc. You have all rights regarding this new feature."

The user's standing authority (memory `health-psych-exercise.md`) covers:
- this feature's own design decisions;
- additive migrations, still with the Supabase ref check;
- this feature's own launch switch.

It does not cover other features' switches or acting on the live account. The same memory says: "never reward reporting a particular mood (reward the act of checking in, if anything)", and "safety signposting for persistently low mood (Lifeline 13 11 14, Beyond Blue). No diagnosis."

---

## 0. Corrections to the starting brief (verified)

1. **Momentum is live.** `src/lib/momentum.ts:76` reads `MOMENTUM_LAUNCH_DAY = "2026-10-12"`. A walk dated today or yesterday already pays BODY XP and writes several things:
   - WORKOUT rows (`workout:<sid>`);
   - PR rows (`pr:WALK:<metric>:<week>`), worth +15 XP;
   - crits and "Counts as" habit links.

   It also feeds the momentum run, Move minutes, the BODY kept week and Vitality. **Any new exercise kind that pays is therefore a live-economy change.** The "INERT" comments in `exercise*.ts` describe the code paths, not the current state.
2. **No mood is captured in production.** Close the day's 1–5 row (`CloseDaySheet.tsx:133-141`) only renders while Duty is live (`TodayBoard.tsx:2094`), and `DUTY_LAUNCH_DAY = null` (`duty-economy.ts:59`). The buttons are bare numbers with no anchors. Nothing reads `REFLECTION.qty` back.
3. **A check pin conflicts with the proposed `source` column.** `scripts/health-ingest-check.ts:423-428` fails if:
   - `model ExerciseSession` contains the text `source` or `externalId` anywhere, doc comments included;
   - any migration name matches `/health|ingest|hc_|connect/i`.

   Both exercise reports propose adding `source` to ExerciseSession. Do not add it. Re-pin that check's "ExerciseSession is unchanged" clause on purpose, so that it names the columns now allowed.
4. **Production has no login.** `capability-summary-2026-10-22.md:185` says "anyone with the URL can read and write". `MOBILE_API_TOKEN` is reportedly unset (`docs/mobile-api.md:9-11`). Mood data would be world-readable (§6 R1).

---

## 1. What exists and what to reuse

### 1.1 Mood and wellbeing

| Reuse | File(s) | How |
|---|---|---|
| Record-not-reward template | `src/lib/weight.ts`, `weight-server.ts`, `src/app/actions/weight.ts`, `src/components/train/WeightCard.tsx`, schema `BodyWeight`/`WeightGoal` (`schema.prisma:948-1000`) | Copy it whole: its own table, xp 0, no ledger row, fail-soft reads, `{ok:false,error}` writes, cache tag, a trend rather than a point, "calibrating" until there are enough points, and no reset scope. One change: allow **many readings a day**, not one. |
| Economy import guard | `scripts/weight-check.ts:433-457`; `scripts/train-check.ts:399-412` | Same guard for the mind modules: no economy file imports them, and they import none. |
| Capture line routed before task code | `src/components/capture/weight-capture.ts` (`mayBeWeighIn`/`routeWeighIn`, the chip escape hatch, Undo, sheet/server parity); `src/app/actions/capture.ts:425-432` | A whole-line `mood …` reading, routed **before** `applySizing` (Gemini) so it never becomes a task. |
| Mood rules and the never-streak list | `src/lib/rituals.ts:552-597` (MOOD_MIN/MAX, REFLECTION xp 0, sink NONE); `src/lib/streak-curve.ts:119-127` `NEVER_STREAK_SOURCES`; `src/lib/activity.ts:45` | Keep REFLECTION for the Close-the-day *note*. Mood itself moves to the new table. |
| An existing energy signal | `src/lib/task-decisions.ts:51-58` `LOW_ENERGY` reason on `TaskDecision` | Correlate with it later; it needs no new input. |
| Data to correlate with (already stored) | REVIEW rows (`srs.ts:366`), review fatigue (`review-fatigue-server.ts:69`), TaskInstance DONE/DONE_MVV/SKIPPED, TaskSession focus minutes, walks, BodyWeight, RestDay (Duty-gated), work tabs | Later "goes together" lines (§2.6). |
| Web prompts | `src/lib/reminders-server.ts` (the momentum evening nudge: a claim row `nudge:<day>`, `UserPrefs.nudge`), `src/lib/push-server.ts`, `public/sw.js` (no `actions` yet) | The template for a web check-in prompt. |
| Safety copy | `src/components/glyph/HonestyChip.tsx:100,138` ("Not medical advice · ask a professional") | Reuse it. There is **no** crisis signposting anywhere in the repo today. |

### 1.2 Exercise

| Reuse | File(s) | How |
|---|---|---|
| Session header | `ExerciseSession` (`schema.prisma:1002-1018`; kind `TEXT DEFAULT 'WALK'`, `distanceKm`/`durationMin` NOT NULL, `angleDeg`, `note`) | The header for every kind. ADD COLUMN only. |
| Ledger readers that already work for any kind | WORKOUT key `workout:<sid>`; Move minutes `momentum-server.ts:2015-2018`; `weekEffortOf` `:699-714`; BODY kept week `life-weeks.ts:455-476`; streak sources `momentum.ts:624`; `branchOfRow` `:799-814` | Any session that writes a WORKOUT row with `minutes` and a B factor is counted by all of these unchanged. |
| Day curve | `momentum.ts:302-387`: X(W) = 35·(1 − e^(−W/70)), W ≤ 240; MET bands LIGHT < 3 ≤ MODERATE < 6 ≤ VIGOROUS; `walkMet` (ACSM); `walkRefusal`; `sessionWeights`; `walkPaysOn` (today or yesterday) | New kinds add a **MET constant per kind**, not a redesign (`momentum.md:810`). |
| Pay transaction | `exercise-server.ts:494` `payOnce`: lock, settled guard, freshness guard, WORKOUT and PR rows, 3 retries; `:602` same-day reversal `undo:<id>` | Reuse as is. |
| "Counts as" | `exercise.ts:562` `linkCandidateOf`, `completeLinkedCore`, top-up `max(0, raw − tickedRaw)` | A lift session counts as the "Gym legs" habit with no new rule. |
| BODY quest | `exercise.ts:526` `bodyQuestDoneBy` reads minutes only | A 20-minute lift or yoga session already meets "Move 20 min", once it writes a WORKOUT row. |
| Open-session precedent | `TaskSession` (`schema.prisma:2085-2117`): startedAt/endedAt, clientId unique per user, a partial unique "one running per user"; `proof.ts` `counted = min(reported, wall)` | A live lift session and its wall-clock bound. |
| Health Connect ingest | `src/lib/health-ingest.ts` (`HC_KINDS` :55, the twin match :176/:202, `ingest:hc:<id>` rows); `health-ingest-server.ts:128` (the `lifeWritesEnabled` gate); `mobile-api.ts:1441`; Android `core/HealthLine.kt:33-40,105-112` | Widen the kinds. `READ_EXERCISE` already covers every exercise type, so this needs **no new permission**. |
| Goal metrics waiting for data | `KrMetric` `WORKOUTS`, `RUN_KM` (`life-types.ts:71`), which currently read "not measured" (`goals.ts:121`, `life-economy.ts:759`) | Measurable once the new kinds exist. |
| Fixtures and UI pins | `src/app/dev/style/train/TrainFixtures.tsx`, `src/components/train/fixtures.ts`, `src/components/train/train.css` (`wt-*`), `scripts/train-check.ts:302-445` | Every new card goes here. |

### 1.3 Phone (Android)

All paths are under `android/app/src/main/java/com/xtnl/app/`.

| Reuse | File(s) | How |
|---|---|---|
| Offline queue | `data/SendQueue.kt`, `SendWorker.kt`, `core/SendLine.kt` (kinds TICK, LOG, WORK_DONE; each carries its clientId and its own day) | Add `CHECKIN` and `SET`. Both are safe to queue: they are never graded and are keyed by clientId. Review answers stay never-queued. |
| Cover widget | `widget/TodayWidget.kt` (Glance 1.1.1), `WidgetTick.kt` (an `ActionCallback` that enqueues), `core/WidgetRows.kt` (48 dp rows) | A one-tap entry point that opens no screen. |
| QS tile, shortcuts | `tile/LogTileService.kt` (`unlockAndRun`, a deep link), `res/xml/shortcuts.xml`, `ui/Nav.kt:63-80` | Add a second tile, "Check in", and `xtnl://app/checkin`. |
| Check screen | `ui/check/CheckScreen.kt` (LazyList at :631-641) | A check-in row directly under the header. |
| Local reminder | `notify/AuditReminder.kt`, `core/AuditAlarm.kt` (one AlarmManager alarm, re-armed at boot) | Clone it for the check-in prompt. There is no FCM. |
| Feedback | `feel/Feel.kt`, `Scores.kt`: **sound and haptics only, not feelings** | Add one neutral `Scores.checkIn` tick, the same for every value. |
| Demo | `data/DemoApi.kt` | Must answer every new route. |

---

## 2. The 5-second psychology check-in: recommendation

### 2.1 Inputs and scales

| Item | Recommendation | Evidence |
|---|---|---|
| Tap 1 (required): **mood grid** | A pleasantness (x) by energy (y) grid, 9×9, so one tap stores `valence` and `energy` as −4..+4 each. Draw it as 4 soft quadrants; the tap snaps to the nearest cell. Corner anchors: "Tense, wired" (top-left), "Excited, upbeat" (top-right), "Low, drained" (bottom-left), "Calm, content" (bottom-right). Axis labels: "Unpleasant ↔ Pleasant" and "Low energy ↔ High energy". | Affect Grid (Russell, Weiss & Mendelsohn 1989): one item, two dimensions, built for repeated use. Killgore 1998 rates it "moderately valid" for pleasure and arousal, but weak at telling specific emotions apart. Single-item momentary error is about 10 % of the scale, and about 27 % of within-person variance is noise (Dejonckheere et al. 2022), so about 9 levels per axis is enough. Users dislike unlabelled numbers (Schueller et al. 2021). |
| Tap 2 (optional, and it saves): **stress** | "How stressed are you right now?" with five labelled buttons: Not at all, A little, Some, Quite a lot, Very much. Stored as 0–4. | Elo, Leppänen & Jahkola 2003 validated this single item (5-point "not at all → very much") against longer scales. Elo used a "these days" window, so a "right now" rating is an adaptation. No validation was found for an unlabelled 0–10 single stress item. |
| Optional word | Six feeling words from the tapped quadrant, plus "+ my own" (≤ 24 chars). | Naming a feeling lowers its intensity (affect labelling; Lieberman et al. 2007). Finer emotion labels go with better regulation (Kashdan, Barrett & McKnight 2015). Optional, so it keeps within 5 s. |
| Optional tags (≤ 8) | Slept badly, Work, Study, People, Alone, Moved, Unwell or pain, plus custom. **Do not ask** for anything the app already knows (walks, tasks, reviews, rest days). | Users track to link moods to context (Schueller 2021). Sleep and mood are linked both ways (Konjarski et al. 2018). |
| Not asked | PHQ-9, GAD-7, and any suicide or self-harm item | The app cannot respond to them (no clinician pathway), and they invite misdiagnosis (§2.5). |

Taps and timing:
- Two taps, with Undo for 5 s. A grid tap alone saves after about 3 s if stress is skipped (or there is a "Save" target; lead decides).
- μEMA (Ponnada et al. 2022) is the closest research analogue: one question at a glance, about 3–4 s of interaction.
- **Measure time-to-save in the client** (a `tookMs` column) so the 5-second claim is checked, not asserted.

Target-size rule:
- At 344 px the card content box is 278 px, so a 9×9 cell is about 31 px. That is below the pinned 44 px.
- So make the **grid one control** (a 278×278 element, `role="slider"`-like with arrow-key support and an accessible name). Do not build 81 buttons. A ±1-cell slip is inside the measurement error.
- On the Fold cover, (475 − 32)/9 ≈ 49 dp per cell.
- Five stress buttons in 278 px are about 52 px each. Check that "Quite a lot" wraps cleanly at the 12 px floor.

### 2.2 Data model (new table; next free stamp)

Migration `20270104000000_mind_checks`. The name must avoid `/health|ingest|hc_|connect|audit|mobile|roadmap/`.

```
MoodCheck
  id cuid · userId (index) · day @db.Date (life day via dateColumn) · at TIMESTAMPTZ(3)
  valence SMALLINT CHECK -4..4 · energy SMALLINT CHECK -4..4 · stress SMALLINT NULL CHECK 0..4
  word TEXT NULL (≤24) · tags TEXT[] (≤8)
  trigger TEXT CHECK IN ('prompted','self','close')          -- r-psych: store it, because self-initiated entries skew
  via     TEXT CHECK IN ('web','today','check','widget','tile','notify','capture','close')
  promptedAt TIMESTAMPTZ(3) NULL · tookMs INT NULL
  clientId TEXT NOT NULL · createdAt
  UNIQUE(userId, clientId) · INDEX(userId, day) · INDEX(userId, at)
```

Design choices:
- **Not an ActivityEvent.**
  - `ActivityEvent.qty` holds one number.
  - The 'life' reset deletes all ActivityEvents (`reset.ts:43`).
  - The ledger is append-only, so a single entry cannot be deleted for privacy.
- If a no-migration fallback is ever forced, it needs `source CHECKIN` added to `NEVER_STREAK_SOURCES`, `DEFAULT_SINK` and the `ActivitySource` union.
- Legacy REFLECTION `qty` 1–5 shows as "end-of-day mood (old scale)": 1→−4, 2→−2, 3→0, 4→+2, 5→+4, valence only, flagged and never merged silently.

### 2.3 Timing (EMA schedule)

- **Self-initiated, any time**, from the surfaces in §2.4.
- **One prompt a day** at a random time inside a user window (default 11:00–19:00).
  - Skipped if there was a check-in in the last 3 h. It lapses after 60 min.
  - Never between 22:00 and 07:00. Never while a `TaskSession` is running.
  - **Hard cap: 3 prompts a day.**
- **Close the day** uses the same grid and stress row instead of today's bare 1–5 row (`trigger: close`). **Un-gate it from Duty**; otherwise it stays dead.
- **Opt-in "pattern fortnight"**: 3 prompts a day (morning, afternoon and evening windows) for 14 days, then it switches itself off.

Evidence:
- 1–3 prompts a day gave the best non-clinical compliance: 87 % vs 77–79 % (Williams et al. 2021, 168 studies).
- Questionnaire length drives burden (Eisele et al. 2022). Higher frequency raises careless responding that compliance figures hide (Ulitzsch et al. reanalysis).
- End-of-day ratings converge with the momentary mean but overstate negative affect (Neubauer et al. 2020), so keep that point but not as the only one.
- Recall bias grows with depressive symptoms, so at least one momentary point a day matters.
- The fixed-vs-random evidence is weak. Random-in-window spreads coverage across the day (Stone et al. 2006).

### 2.4 Surfaces

| Surface | Path | Taps | Notes |
|---|---|---|---|
| **Android Check screen** | A row under the header: inline grid, then the stress row | 2 | The app opens on Check. The neutral `Scores.checkIn` haptic. |
| **Android cover widget** | A "Check in" button opens a compact dialog activity (grid + stress). Alternative: an inline 3×3 mapped to {−3, 0, +3} (decision D2) | 1 + 2 | Through `SendQueue` `CHECKIN` with its own `at`. It works offline. **Never shows a past value**: the cover is visible on a closed phone. |
| **Android QS tile and launcher shortcut** | A second tile, "Check in" → `xtnl://app/checkin` → the compact sheet | 1 + 2 | Same sheet. |
| **Android local prompt** | An AuditReminder clone. The text is neutral ("Check in?") with no values; a tap opens the sheet | 1 + 2 | A notification allows at most 3 action buttons and cannot host the grid. `SCHEDULE_EXACT_ALARM` needs a prompt on Android 14+. |
| **Web: Body › Mind** | A "Mind" card on `/train` beside WeightCard (or a Body sub-page "Mind"): the entry grid plus the trend view (§2.6) | 2 | It needs no ruling. It is the home of the trend view. |
| **Web: Today strip** | A slim one-tap strip in the side column (the DueElsewhere slot, `TodayBoard.tsx:216-221`); the strip takes the tap inline | 2 | **Needs a ruling** extending Today's "Tasks only" (`TodayBoard.tsx:503-511`). Never a count, never red, never an Ask. |
| **Web: prompt** | A `UserPrefs.checkin` pref, a claim row per prompt, at most N a day, added to the reminders-server run; `sw.js` gains `actions` (it opens the sheet) | 1 + 2 | The web prompt fires only when the phone prompt is off, to avoid double prompts. |
| **Capture line** (later phase) | `mood 2 e-1 s3`, mirroring `weight-capture.ts`, routed before task code. "mood board", "stress test" and "energy drink" stay tasks | ≤ 3 presses | Notes never reach Gemini. Parity with `LogPreview.kt` (a Log section "Mood"). |

Mobile API:
- `POST /checkin {at, valence, energy, stress?, word?, tags?, trigger, via, promptedAt?, tookMs?, clientId}` returns `{id, day, line, undo}`, plus an undo route.
- `/check` gains `checkin: {lastAt, todayCount, prompt}`. It carries **no values**: a cached `/check` moves between phones (Android `data_extraction_rules.xml`).

### 2.5 What is shown back

**At save:**
- a neutral receipt, "Logged 14:32 · Calm, content", with Undo;
- the same haptic for every value;
- no colour judgement;
- no praise or shame. The words must pass the train-check PRAISE/SHAME regexes, with no "!". The reflection precedent is "Noted. Never graded."

**Mind view** (deterministic copy, **no Gemini**):
- A 14-day dot strip (valence, energy, stress) and a neutral count ("12 check-ins this month").
- **Weekly medians** with their interquartile range.
- A "changed" flag only when a weekly median moves **≥ 2 grid steps** from the 4-week median and that week has **≥ 4 check-ins**.
  - This follows from about one step of single-item error (Dejonckheere). It is a derived rule, not a published cutoff.
- "Calibrating" until there are enough points (the weight card uses `MIN_READINGS_FOR_RATE = 5`).
- A time-of-day view once there are about 3 weeks of data. It shows "steady" or "up and down" in words, not a variability index.
- Aggregated within-person variability is reliable (Scott et al. 2020); an RMSSD-type index mixes variance with autocorrelation.
- At most **one "goes together" line a week**, about walk days, "slept badly" or tags.
  - Only after **≥ 21 days**, with **≥ 7 days in each group**.
  - It shows the median difference and n, always as "went together, not proof that one causes the other".
  - Group findings often fail for one person (Fisher et al. 2018).
  - Activity's link to affect is small (Rehder et al. 2026, individual-participant data, 67 datasets), so promise little. Never frame it as a reward for walking.
- It shows "3 of 9 were prompted" so that self-initiated bias is visible.

### 2.6 Safety signposting (Australia; numbers verified 2026-10-27 from AIHW and Lifeline)

1. **Always visible:** a quiet "Need to talk? Lifeline 13 11 14" in the check-in footer and in the Mind view. It is tap-to-call on Android.
2. **Low-pattern card:**
   - Trigger: in the last 7 days, at least 5 days had a check-in, and on **5 or more of those days** the lowest valence was −3 or below, or stress was 4.
   - It shows while the pattern holds until the user hides it; once hidden it stays hidden for 7 days. It is never a modal, never red, and never sent anywhere.
   - Copy: "This week looks heavy. You don't have to sort it alone."
   - It lists **Lifeline 13 11 14** (text 0477 13 11 14), **Beyond Blue 1300 22 4636**, **Suicide Call Back Service 1300 659 467** and **000** for emergencies. It suggests a GP, who can arrange a Mental Health Treatment Plan.
   - The threshold is a conservative heuristic. **No validated cutoff exists for this scale.**
3. **Store the numbers as one constant** with a `checkedOn` date. Re-check them before shipping. Follow the Mindframe guidance that Lifeline's media page asks for.
4. **Never:**
   - diagnostic words ("you are depressed");
   - a suicidality item;
   - alerts to anyone;
   - mood data, notes or words sent to Gemini;
   - mood on the cover widget, lock screen, notification text, a URL or a push payload.
5. **Pause and delete:**
   - "Pause check-ins for 1 week / 1 month" keeps the data.
   - Each entry has its own Delete, plus "Delete all check-ins" (decision D8).
   - There is no export in the app today.
6. **Reactivity:** the evidence that tracking itself changes mood is mostly null but thin (Kivelä et al. 2022; two randomised ESM studies). One possible benefit: Kauer et al. 2012 found mobile self-monitoring raised emotional self-awareness. Against rumination: short entries, no forced reflection, no streak.
7. **Regulation:**
   - Keep it a self-monitoring and wellbeing feature. TGA exclusion 14A covers consumer wellness software. "Assess, treat or self-manage" mental-health tools are usually regulated unless the 14E conditions are met. The TGA text was not opened; check it if the app is ever distributed.
   - Under the Privacy Act, mood logs are sensitive health information. Design as if the Act applies.

### 2.7 Economy

- **0 XP. No ledger row. Never a streak or run source. Never a must, habit, debt, side-quest input, Momentum price, Mall reward or quest.**
- Nothing (no badge, title or animation) depends on the reported value.
- The economy import guard check enforces this (§4).
- Reason: engagement-contingent rewards cut free-choice motivation (d = −0.40) and completion-contingent ones d = −0.36 (Deci, Koestner & Ryan 1999, 128 experiments). Paying for content turns the measure into a target.
- No study directly tests incentive-induced mood misreporting, so that argument rests on reasoning.

---

## 3. Exercise variety and the strength logger: recommendation

### 3.1 Kinds and how intensity is derived

Only **objective inputs** set intensity. Self-chosen effort is recorded but never raises pay (`dropped.md:8`: the RPE multiplier was "a free +16 % for answering rpe10"). MET values come from the 2024 Adult Compendium (Herrmann et al.), unless noted.

| Kind | Required | Optional | Intensity → band | Refusal (recorded, unpaid) |
|---|---|---|---|---|
| WALK / HIKE | as now | | ACSM walking, as now | > 9 km/h (offer "Log it as a run?") |
| RUN (incl. treadmill: `variant`) | time, distance | climb, avg/max HR | ACSM running VO₂ = 0.2·s + 0.9·s·G + 3.5, or Compendium by speed: 6.5 MET at 6.4 km/h up to 12.0 at 12.9 | for example < 5 or > 25 km/h |
| CYCLE (road, MTB, stationary, spin) | time + distance, or avg watts | HR | Compendium by speed (6.8 at 16–19 km/h up to 12.0 at 25.7–30.6) or by watts (4.0 at 50 W up to 10.8 at 200–229 W) | for example > 60 km/h |
| SWIM | time, distance (or lengths × pool 25/50 m) | stroke | crawl 5.8–10.5 by pace; breaststroke 5.3; backstroke 4.8 | pace < 1:00 /100 m |
| ROW (erg) | time, distance | stroke rate | watts = 2.80/(s per m)³ from the split (Concept2), then 5.0–14.0 MET | split < 1:20 /500 m |
| ELLIPTICAL, HIIT, CIRCUIT | time (HIIT: rounds × work/rest) | effort chip | a fixed base MET: 5.0 / 7.0 / 5.0. "Vigorous" is recorded but never priced | < 5 min |
| SPORT (`variant`: tennis, football, climbing, …) | sport, time | casual or competitive | fixed casual MET per sport (tennis singles 8.0, soccer 7.0, …) | < 5 min |
| YOGA / PILATES / MOBILITY | style, time | | LIGHT: 2.3–2.8 (power yoga 4.0) | < 5 min |
| LIFT | movements and sets; wall clock from start to end | session RPE (record only) | **fixed MODERATE** (3.5–5.0 MET, w = 1). Never set by RPE or RIR | < 5 min |

Guard rails:
- The existing caps hold for every kind: minutes ≤ 180 a session, W ≤ 240 a day, pay only today or yesterday, and **one curve per day** (split-neutral).
- Show **no kcal** by default. 1 MET overestimates measured resting VO₂ by about 35 % on average (Byrne et al. 2005). If kcal is ever shown, it carries "≈", is never paid and never feeds the weight card.
- HR zones are out of scope: there is no age field in use, and Tanaka's HRmax error is about ±10 bpm.

### 3.2 Data model (one header, three new tables; migration `20270103000000_strength_sets`, as reserved by P25)

Keep `ExerciseSession` as the **one header for every kind**. That way the WORKOUT `sourceId`, reversals, the HC twin match, the competency JOIN, the snapshot's PB pace and "Counts as" all stay in one namespace. u-platform argued for a separate session table instead (decision D10).

```
ExerciseSession (existing; ADD COLUMN only; no CHECK added to the existing kind column, which the core enforces through EXERCISE_KINDS)
  kind        WALK | RUN | CYCLE | SWIM | ROW | ELLIPTICAL | HIIT | CIRCUIT | SPORT | YOGA | MOBILITY | LIFT
  distanceKm  stays NOT NULL; 0 = "no distance" (no altered column; a rolled-back build shows "0 km" rather than crashing)
  + variant TEXT NULL · label TEXT NULL (1..40, "Push day")
  + startedAt, endedAt TIMESTAMPTZ(3) NULL; partial UNIQUE(userId) WHERE startedAt IS NOT NULL AND endedAt IS NULL
  + avgHr, maxHr, avgWatts SMALLINT NULL · poolM REAL NULL · sessionRpe SMALLINT NULL (0..10, record only)
  + clientId TEXT NULL, UNIQUE(userId, clientId)
  NOT a "source" column (it breaks health-ingest-check; HC provenance is already the INGEST row 'ingest:hc:<id>')

UserMovement (new; custom movements only; the starter library lives in code)
  id, userId, name (1..40), normName, pattern, equipment, primary TEXT[], secondary TEXT[],
  load TEXT CHECK IN ('EXT','PAIR','ONE','BW','TIME','CARRY'), bodyFraction REAL NULL, unilateral BOOL,
  stepKg REAL NULL, restSec INT NULL, archivedAt; partial UNIQUE(userId, normName) WHERE archivedAt IS NULL

ExerciseEntry (new; one movement in a LIFT session; lets "Repeat Push day" and the phone's "Next: Bench" exist before any set)
  id, userId, sessionId, movementKey ('<library key>' | 'u:<UserMovement.id>'), ord, groupNo SMALLINT NULL (superset),
  bodyKg DECIMAL(6,2) NULL (a snapshot of the day's or the latest BodyWeight), note; INDEX(sessionId), INDEX(userId, movementKey)

ExerciseSet (new; one insert per "Set done", keyed by clientId so the offline queue replays safely)
  id, userId, sessionId, entryId, movementKey + day (denormalised for history reads), ord,
  kind TEXT CHECK IN ('WARMUP','WORKING','DROP','MINI') DEFAULT 'WORKING',
  chainOf INT NULL (the head set's ord; CHECK: null exactly when kind is WARMUP or WORKING),
  weightKg DECIMAL(6,2) NULL CHECK -200..500 (EXT total · PAIR/ONE per implement · BW signed added load),
  reps SMALLINT NULL CHECK 1..100, rir SMALLINT NULL CHECK 0..5 (5 = "4+"), toFailure BOOL, amrap BOOL,
  durationSec INT NULL (1..3600), distanceM REAL NULL, restSec INT NULL (from the timer, never typed),
  doneAt TIMESTAMPTZ(3) NOT NULL, clientId TEXT NOT NULL
  UNIQUE(userId, clientId) · INDEX(entryId) · INDEX(userId, movementKey, day)
```

Why tables and not P25's `sets JSONB`:
- Each "Set done" becomes an idempotent insert, not a read-modify-write of the session row.
- Per-movement history reads ("max weight", rep-maxes, e1RM) can use an index.
- One set can be edited on its own.
- Each field gets a CHECK, in house style.

Units and derived values:
- **kg are stored; the unit is display only** (`WeightGoal.unit`). Steps are 2.5 kg / 5 lb for barbells and 2 kg for dumbbells, editable per movement.
- **Derived on read, never stored** (house rule: no mutable counters): set count, reps, volume, top set, heaviest weight, e1RM, rep-max table, hard sets per muscle and strength days.

Starter library:
- 57 movements in `src/lib/training-library.ts`: squat, hinge, lunge, horizontal and vertical push, horizontal and vertical pull, carry, core and isolation, covering every WHO major muscle group (r-training §9 has the table).
- Vocabulary from **free-exercise-db (Unlicense)**. **Do not copy wger** (AGPL code; its data licence is unverified) or commercial databases.

### 3.3 Set kinds, drop sets and what counts where

| Kind | Rest timer after | Volume | Hard sets | e1RM / heaviest / rep-max |
|---|---|---|---|---|
| WARMUP | 60 s | no | 0 | no |
| WORKING (flags `toFailure` = RIR 0, `amrap`) | the movement default (180 s compound barbell, 120 other compound, 90 isolation, 60 calves/core) | yes | 1 if RIR ≤ 4 or unknown | yes (e1RM only at rEff ≤ 10) |
| DROP (`chainOf` = head) | none before it; the default after the chain | yes | +0.5 each, at most +1 a chain | no |
| MINI (rest-pause) | 20 s countdown | yes | +0.5 each, at most +1 a chain | no |

- The kind is kept separate from effort and grouping. Hevy's four values (warm-up, normal, failure, drop) cannot represent a drop chain whose last segment went to failure.
- **Drop set evidence:**
  - Hypertrophy is not different from traditional sets, in less time (Sødal et al. 2023 meta-analysis).
  - One drop chain with about 20 % drops matched 3 normal sets (Fink et al. 2018).
  - So the default drop is **−20 %, rounded down to the step**, with no rest timer before it.
- **Failure evidence:** a trivial hypertrophy edge, ES 0.19 (Refalo et al. 2023). A flag is enough.
- **Rest evidence:** a small benefit above 60 s and none detectable beyond 90 s for hypertrophy (Singer et al. 2024). 3 min beat 1 min for strength in trained men (Schoenfeld 2016). These justify the default timers.
- **RIR** is optional and off by default, with coarse chips 0/1/2/3/4+. Lifters under-predict reps to failure by about 1 rep (Halperin et al. 2022). RIR-based RPE comes from Zourdos et al. 2016 and Helms et al. 2016. **RIR is never priced.**
- **Weekly hard sets per muscle** (14 groups): count **fractionally**, 1.0 for a primary muscle and 0.5 for a secondary one, taking the max per group per set. The fractional method fit best in Pelland et al. 2025 (67 studies, preprint).
  - Display bands, **never a target or a debt** (`dropped.md:24`): 0 none, 1–3 light, 4–9 moderate, 10–20 the common range, > 20 high.
  - Schoenfeld, Ogborn & Krieger 2017: 5.4 / 6.6 / 9.8 % average gains for < 5, 5–9 and 10+ weekly sets (p = 0.074). The bands are a guide, not a rule.

### 3.4 Max weight, e1RM and PRs (the user's "maximum weight")

- **e1RM: Brzycki** w·36/(37 − rEff), with rEff = reps + (RIR ?? 0), WORKING sets only, 1 ≤ rEff ≤ 10.
  - Above 10 reps there is no e1RM; the rep-max table covers those sets.
  - Linear 1RM equations should use no more than 10 reps (Reynolds, Gordon & Robergs 2006).
  - Brzycki is the more conservative formula below 10 reps, and treating unknown RIR as 0 can only under-estimate. Both matter for plausibility (`dropped.md:4`).
  - Pin the one formula in `training-check`. u-exercise preferred Epley ≤ 12 (decision D15).
- **Bodyweight loads on one axis:** effective load = f × bodyKg + signed added load.
  - f is 1.0 for pull-up, chin-up and dip, and 0.65 for push-up (force-plate data: about 64–75 % of body mass).
  - An assisted pull-up (−20 kg), a bodyweight one (0) and a weighted one (+10 kg) are one progress line, so less assistance reads as progress.
  - With no BodyWeight reading the movement is reps-only, and the screen says so.
  - Negative loads display as "assist 20 kg". PAIR movements are labelled "per dumbbell".
- **Records** (derived, quiet, always on, per movement):
  - heaviest weight (WORKING sets, effective load);
  - best e1RM;
  - rep-max table: best load at ≥ r reps for r ∈ {1, 2, 3, 5, 8, 10, 12, 15};
  - best set volume and best session volume;
  - most reps at a given load;
  - longest hold, and heaviest × longest carry.
  - Loads are compared in stored kg, so switching kg/lb never makes a PR.
- **PR moment (a Seal)**: only for best e1RM and heaviest weight.
  - Needs ≥ 3 earlier sessions with the movement.
  - Must beat the best by ≥ 1 % (e1RM) or by ≥ one step (heaviest).
  - At most one per movement per life week (a later, better one updates silently), and at most 2 per session.
  - Never from WARMUP, DROP or MINI sets, backfill or imports (H17).
- **Plausibility checks:**
  - More than +15 % over the 8-week best asks "Big jump: 100 kg (best 80). Keep it?" with Keep or Fix. The Seal comes only after Keep.
  - More than 2× the best is recorded and never paid until confirmed (P25).
- **Strength Seals carry no XP** (D14). Loads are self-reported and cannot be checked.

### 3.5 The 5-second actions (344 px first; targets ≥ 44 px; 16 px inputs)

| Action | Taps | Behaviour |
|---|---|---|
| Repeat a workout | 1 | "Repeat Push day" copies the last session's entries. Each row shows a **ghost** "last 60 × 8" from the last session (or the same `ord`). |
| Set done, same as last time | 1 | ✓ accepts the ghost values and starts the rest timer. |
| Set done, changed | 2–3 | Tap the field, ± steppers (one step a tap, five on long-press), then ✓. |
| Another set | 1 | "+ Set" copies the previous row. |
| Drop | 1 + reps | A DROP row chained to the set, at −20 % rounded to the step, with no timer. |
| Set kind | 2 | Tap the set number chip: Warm-up, Working, Drop, Rest-pause, Failure, AMRAP. |
| Plate math | 0 | "per side 25 + 15" from a 20 kg bar and 25/20/15/10/5/2.5/1.25 plates, with any shortfall named. |
| Finish | 1 (+1) | Minutes = min(reported, or ended − started, last set + grace, 180). Optional sRPE chips 0–10 (session RPE, Foster 2001; record only). "Counts as: Gym legs" is preselected. The summary follows. |
| Cardio again | 1 | "Again: 5 km · 27 min" fills in the last session of that kind on today's date. |
| Phone mid-workout | 1 | The cover widget, tile or an ongoing notification shows "Next: Bench 60 × 8 ✓". `SendQueue` `SET` carries its own clientId. |

Engineering notes:
- **Set row at 278 px:** number chip 44 + kg field 76 + reps field 56 + ✓ 44 + gaps about 24 ≈ 244 px. It fits on one line **without** steppers. The steppers appear on a second line only while a field is focused.
- RIR chips go on a second line, only when "Log RIR" is on.
- **Pay is written once, at Finish**, never per set. Editing a set never changes pay (pay reads minutes). Editing the minutes follows the same-day reverse-and-repay rule.
- A session left open past its life day closes lazily at its last set plus the grace.
- Prefill-and-confirm is the evidence-backed pattern: semi-automated tracking eases capture burden (Choe et al. 2017). Design for resuming after lapses, not for perfect streaks (Epstein et al. 2015).

### 3.6 Fixes required before a single non-walk row is written

These are the hard-coded WALK spots (u-exercise §2):

- **H4 (critical, live money).** `readLiveWalks` (`exercise-server.ts:369-382`) keeps only `walk-1` receipts. A run plus a walk on one day would each start the curve at 0, which **pays twice** and breaks split-neutrality (pins C10 and G3).
  - Replace it with `readLiveSessions`, which reads `walk-1` and a new `session-1` receipt.
  - Keep `walk-1` byte-for-byte for walks.
- **H2 and H3.** `viewOf` forces `kind: "WALK"` (:135). The view `findMany` and `importedWalksOn` (:147, :288) and the HC match (`health-ingest-server.ts:70`) have **no kind filter**. A run could be taken as a walk's "twin", and a lift would show as a "0 km walk".
- **H6.** PR keys: `pr:LIFT:<movementKey>:<metric>:<week>` shifts the metric from `split(":")[2]` to `[3]`. Fix `metricOfPrKey`, `celebration-detect.ts:1233` `WALK_PR_KEY`, and `snapshot.ts:309` (`pr:WALK:` only).
- **H8.** `competency-server.ts:253,264` read `kind = 'WALK'`. Widen them, and change "h of walks" to "h of exercise" (`competency.ts:34,52`).
- **H9 and H10.** Perk and copy text that names walks (`momentum.ts:857-865`, ExerciseCard, `/today/rules`, side quests, skill decay, ReceiptSheet). Rename it when pay flips.
- **H12.** `train-check.ts:385-395` pins the one `mark(` and the one `enqueue(` in ExerciseCard. Any new SessionCard or SetLogger must be added to that rule.

---

## 4. Platform checklist

**Before code**
- [ ] Read `node_modules/next/dist/docs/01-app/...` on Server Actions, `refresh()` (Server Actions only), caching and route handlers (AGENTS.md).
- [ ] Record the decisions in the blueprint's Decisions section, under the user's standing authority.
- [ ] Do not edit files another session has open: `.claude/launch.json`, `scripts/ui-audit.mjs`, `src/lib/srs.ts` and the review files were uncommitted at 778d6d2. Re-check `git status` first.

**Migrations** (only the lead runs Prisma, PROGRESS.md:65)
- [ ] `20270103000000_strength_sets`: ExerciseSession ADD COLUMNs plus UserMovement, ExerciseEntry and ExerciseSet.
- [ ] `20270104000000_mind_checks`: MoodCheck.
- [ ] The names avoid `/health|ingest|hc_|connect|audit|mobile|roadmap/i`.
- [ ] Each migration is hand-authored, `BEGIN; … COMMIT;`, with a full header (what it adds, that it is additive only, the target ref, the apply commands, and that the code tolerates its absence).
- [ ] Table conventions: cuid ids, a userId index, TEXT kinds with CHECKs named in `///` comments, no FKs, `TIMESTAMPTZ(3)`, life days `@db.Date` via `dateColumn`.
- [ ] Delete any `migrate diff` proposal that drops CHECKs, `Idea_embedding_hnsw_idx` or the Roadmap indexes.
- [ ] Rehearse on `xtnl-rehearsal` (pg16, port 55432; confirm the "Datasource … localhost:55432" line).
- [ ] Run `migrate status` first: Supabase has missed rows before.
- [ ] Parse the ref out of DIRECT_URL and confirm it is **xvlkujmtdcpaoxdftgpl** (never `zhuqmqzxukuwdanpnygx`).
- [ ] Apply: `prisma db execute --file …` → `migrate resolve --applied …` → `generate` (stop the dev server; delete the `.tmp` leftovers in `node_modules/.prisma/client`).
- [ ] Never run `db:migrate`, `migrate reset` or `db push`.
- [ ] Document the models in `docs/life-plan/data-model.md`.

**Fail-soft**
- [ ] Each `-server.ts` has an `isMissing<X>Table` for P2021/42P01 plus the table name.
- [ ] The **added ExerciseSession columns** need P2022/42703 handling (`competency-server.ts:148` pattern). Deployed code that selects `label` or `startedAt` before the migration is applied would otherwise break the live walk card. Select explicitly, or catch and fall back to the walk-only view.
- [ ] Reads return the empty view with `ready:false`. Writes return `{ok:false,error}` with a NOT_READY line and never throw. Actions use `run()`, `getCurrentUserId()` and `refresh()`, and re-check input in the core.
- [ ] New cache tags (`mind`; `exercise` reused or a `training` tag) join `CacheTag` and `ALL_TAGS` (`cache.ts:38-71`). Pin "cached under the tag, every write invalidates it", as `weight-check.ts:427-431` does.
- [ ] `/train` reads the new tables in its one `Promise.all` wave (`train/page.tsx:32-34`), each failing soft on its own.

**Switches** (pattern `side-quests.ts:76-112`: `X_LAUNCH_DAY = null`, an `XTNL_X_LAUNCH_DAY` override outside production only, `xOn(day, ld)`, an inert pin, tests passing an explicit day)
- [ ] `MIND_LAUNCH_DAY` gates the check-in surfaces and the prompts.
- [ ] `SESSION_PAY_LAUNCH_DAY` gates **curve pay for non-walk kinds**. Until it flips, the new kinds are records.
- [ ] Pages compute `live` on the server; client code never reads the env.
- [ ] Automatic writes (prompt claim rows, HC imports of new kinds) sit behind `lifeWritesEnabled` (`life-economy.ts:883`). Dev and prod share one database.
- [ ] Rehearsal entries `xtnl-rehearsal-mind` and `xtnl-rehearsal-training` in `.claude/launch.json` (merge with the other session's edits).
- [ ] Flip only these two switches, under the standing authority. If the classifier blocks the edit, give the user the one-line edit. Re-pin after the flip.

**Economy**
- [ ] Mind: no ActivityEvent, an import guard both ways (copy `weight-check.ts:433-457`), and kept out of side-quest detectors, the Mall and calibration.
- [ ] Training: the H2–H12 fixes (§3.6), MET constants in `momentum.ts`, per-kind refusals and the `session-1` receipt.
- [ ] Before the pay switch flips, re-run `balance-horizon` (basket rows `walk` and `gym`, `balance-horizon.ts:237-238`), `momentum-sim` (C5–C7, C10, C11, a BODY kept rate of about 61 %, the BODY quest rate) and `momentum-sim --credits`, and update the exercise-style-check and momentum-check goldens.
- [ ] Strength PRs: the +15 % confirm, 2× unpaid, no XP, never from imports or backfill.

**Checks**
- [ ] New `scripts/mind-check.ts` and `scripts/training-check.ts` in `life:check`, each pinning its own position, with `npm run …:check` aliases.
- [ ] Re-pins:
  - `health-ingest-check` (the model and migration pins, §0.3);
  - `train-check` (H12, the PRAISE/SHAME copy, the 12 px floor, 44/40 px targets, 16 px inputs, no motion or `!important`, `wt-*` class names, import bans);
  - `shell-check:134-136` (Body subs exactly "This week, Exercise");
  - `exercise-style-check`;
  - `capture-parse-check` (:180 `x run 30m`, :183-184 `run 5k 28m`, :214, :284 `5x5 squats`);
  - `capture-server-check`, a weight-capture-style source guard, and `today-ui-check --strict`;
  - `rituals-check` (Close the day);
  - **`ingest-budget-check`** (check-in: 1 tap to open plus 2 taps on the widget and tile, 2 on Check and web; capture line ≤ 3 presses; "Set done" 1 tap);
  - `mobile-api-check` (endpoints, the queue pin at :3589, the version pin at :3654, no `/mobile/` migration name);
  - `celebration-check`, `side-quests-check`, `skill-decay-check`, `status-check` (copy);
  - `contrast-check` (new tokens);
  - a word budget per new card, counted with `scripts/word-count.mjs`.
- [ ] Gate: `tsc`, `eslint`, `life:check`, `ui:check` and `next build`, plus the sims whenever pay changes. Then commit and push (memory `push-every-milestone`).

**Fixtures and UI evidence**
- [ ] States go in `src/components/train/fixtures.ts` and `/dev/style/train` (fake actions, about 400 ms, "Fixtures save nothing."):
  - **Mind:** empty, not-ready, calibrating, logged with Undo, the trend with "changed", the low-pattern card, paused.
  - **Training:** empty, an open session with ghosts, a drop chain, a warm-up, the PR confirm (+15 %), 2× unpaid, BW reps-only (no body weight), the cardio "Again" chip, a refusal, record-only (pay switch off).
- [ ] Add any new real route to `scripts/ui-audit.mjs` `REAL_ROUTES` (it lacks `/train/exercise` today) and fixture routes to `FIXTURE_ROUTES`.
- [ ] Screenshots at 344, then 375, 932 and 1440 px, on the rehearsal server or fixtures only, sent to the user. The browser pane is production: never act on the live account.

**Android** (versionCode 31 / 2.19 → **32 / 2.20**, with a mobile-api-check pin)
- [ ] `Models.kt`, `Api.kt`, `HttpApi.kt` (`ignoreUnknownKeys = true`, so additive `/check` fields are safe for older apps) and **`DemoApi.kt`**, which answers `/checkin`, its undo, `/check.checkin` and the session/set routes.
- [ ] `SendLine.Kind.CHECKIN` and `SET`, each with its own `at` or day and clientId. Update `SendQueueTest` and the mobile-api-check queue pin on purpose.
- [ ] `core/CheckinLine.kt` and `core/SetLine.kt`, each with a JVM test.
- [ ] Surfaces:
  - the Check row;
  - the widget entry (Glance, 48 dp);
  - a second QS tile (`unlockAndRun`);
  - the shortcut and `Nav.kt` deep link;
  - an AuditReminder-clone prompt with neutral text;
  - `Scores.checkIn`;
  - tap-to-call for Lifeline.
- [ ] ScreensTest renders on the cover (475×751 dp) and main screens (704×932 and 932×704). Build: `.\gradlew.bat assembleDebug test`, with `-Pxtnl.shots=true` for the screens.
- [ ] Health Connect: widen `HealthLine.kindOf`, `HC_KINDS` and the `mobile-api.ts:1441` kind list. **Use the SDK's named constants, never integers**: the two reports disagree (rowing 46 vs 54, pilates 41 vs 48, HIIT 34 vs 36).
  - Drop the ≥ 10 m rule for distance-less kinds.
  - Imported strength is minutes only (HC carries no reliable load).
  - No new permission is needed. Update the rationale copy and the README, and check that `HealthManifestTest` is unchanged.
  - Sleep, HR and HRV would need new permissions and are out of scope by default.
- [ ] Nothing sensitive (values, trends, notes) goes on the widget, the tile, notification text or the lock screen.

---

## 5. Open decisions for the lead (each with a recommended default)

| # | Decision | Recommended default | Why |
|---|---|---|---|
| D1 | Check-in items | 9×9 valence × energy grid + 5-level Elo stress (optional) + optional word and tags | Two validated single items in 2 taps (Russell 1989, Elo 2003). A 5-face row loses the energy axis, which the user's "stress level" and the energy proxies need. |
| D2 | Cover widget behaviour | A "Check in" button that opens the compact sheet (1 + 2 taps). No past value is ever shown. | Keeps one scale and one sheet everywhere, and shows nothing private on the cover. The inline 3×3 variant (1 tap, coarser) is the alternative if a measured `tookMs` shows the sheet is too slow. |
| D3 | Today strip (extending the "Tasks only" ruling) | Yes: a slim strip in the side column that takes the tap inline. Never a count or red. | The web needs a one-place, 2-tap entry, and Today is where the user is. Body › Mind stays the home of the trend. |
| D4 | Prompts | Phone: 1 a day, random in 11:00–19:00, after a one-time opt-in. Web push only if the phone prompt is off. The pattern fortnight is opt-in. | Best non-clinical compliance (Williams 2021); careless responding rises with frequency (Ulitzsch). |
| D5 | Any reward for checking in (the memory allows "the act, if anything") | **None** in v1. If the user asks: one flat, content-blind weekly line ("4 check-ins this week") outside XP and the streak. | Overjustification (Deci 1999). A reward for the act still teaches logging for the reward. |
| D6 | PHQ-4 and PSS-4 opt-in checks | Defer: not in v1. If added: PHQ-4 at most every 2 weeks, PSS-4 monthly, labelled "screening, not a diagnosis". | They are validated (Kroenke 2009; Levis 2020: PHQ-2 ≥ 3 gives 0.72 / 0.85), but they add clinical weight and TGA exposure. Ship the single items first. |
| D7 | Close the day | Replace the bare 1–5 with the grid, write MoodCheck `trigger: close`, and **un-gate it from Duty**. The note stays REFLECTION. | Otherwise the end-of-day point stays dead (Duty is null). It gives one comparable point a day. |
| D8 | Deleting and resetting mood | A per-entry Delete, "Delete all check-ins" in Settings, outside the 'life' reset (as weight is). | Sensitive data should be deletable on its own. A life reset should not silently wipe health history. |
| D9 | **Privacy on an open production** | Require `MOBILE_API_TOKEN` to be set before `/checkin` ships. Raise with the user whether the Mind view (values and trend) may render on an unauthenticated web URL, or ships phone-first until there is a login. | Mood is health information, and today it would be world-readable (§0.4). This is the one decision the lead should put to the user rather than take under the standing authority. |
| D10 | Exercise session storage | Extend `ExerciseSession` (ADD COLUMN) and fix H2–H12 in the same change, **before** any non-walk write. | One sourceId namespace keeps every ledger reader, the reversal, the HC dedupe and "Counts as" working. A second table means changing every reader (u-platform's alternative). |
| D11 | `distanceKm` for distance-less kinds | Write 0 and make the readers kind-aware. | Purely additive. Dropping NOT NULL would alter an existing column, and a rolled-back build would crash on `null.toFixed`. |
| D12 | **Strength pay** | LIFT is a record at first. The linked "Gym" habit tick stays the pay ("Counts as" ticks it). Revisit when `SESSION_PAY_LAUNCH_DAY` flips. | Today a Gym tick pays about 23.3 raw as a TASK row. A curve-paid 60-minute lift pays 20.1, and a gym day plus a walk collapses to one curve, X(120) = 28.7. Logging more detail would pay less. The record-first option keeps today's balance with no sim re-pin. **Trade-off:** an unlinked lift writes no WORKOUT row, so it does not feed Move minutes, the BODY quest or the run. Say so on the card ("Link it to a habit to count it"). |
| D13 | Cardio kinds on the curve | Yes, behind `SESSION_PAY_LAUNCH_DAY`, after the readLiveSessions fix and the sim re-pins. Intensity from speed, watts or pace only. | They replace walks, which are already on the curve. A run at > 9 km/h is refused today, which is the most visible gap. |
| D14 | Strength PR Seals | No XP. Produce them at Finish via `withMoments`, with no ledger row if the Seal path allows it. Otherwise a 0-XP PR row with sink NONE, pinned to be ignored by streak and branch folds. | Self-reported loads cannot be checked (`dropped.md:4`). This still celebrates the user's "max weight". |
| D15 | e1RM formula | Brzycki, rEff ≤ 10, unknown RIR = 0 | The conservative choice: it can only under-estimate, which matters for plausibility (Reynolds 2006). |
| D16 | Set-kind model | WARMUP / WORKING / DROP / MINI, plus `toFailure` and `amrap` flags, with `chainOf` | It represents every real case. The Hevy 4-value enum cannot. |
| D17 | Bodyweight movements | One signed-load axis with a body fraction | One progress line from assisted to weighted. Hevy splits them and loses that line. |
| D18 | Drop or rest-pause segments in hard sets | +0.5 each, at most +1 a chain | No study defines this. Fink 2018 found one chain ≈ 3 normal sets, so 0 undercounts. |
| D19 | Do LIFT minutes count toward the "150"? | No. Add a record line "Strength days n of 2". | WHO 2020 counts muscle-strengthening on ≥ 2 days a week separately. LIGHT kinds add 0 effort minutes (WHO-correct); say so in the copy. |
| D20 | Vitality perk scope | When pay flips, apply the perks to every curve-paid kind and rename them ("sessions", not "walks") | The curve is shared, so splitting perks by kind would break split-neutrality in spirit. |
| D21 | Health Connect widening (reverses part of D22) | Yes for cardio and strength sessions (strength as minutes only), with no new permission. **No** sleep, HR, HRV or steps in v1. | The data the user already records. Sleep and HR are more sensitive and need new consent. A "Slept badly" tag stands in for sleep. |
| D22 | Capture grammars (`bench 3x8 60`, `mood 2 s3`) | A later phase: a separate pure `lift-parse.ts` and `checkin-capture.ts`, claiming a line only on a full-line pattern | Avoids collisions with the pinned task fixtures. The web loggers come first. |
| D23 | Nav and names | Body subs "This week, Exercise, Mind". Exercise becomes multi-kind with a "Lift" mode. | One shell-check re-pin. Uses System-novel function words only, English, no CJK. |
| D24 | Phase order | (1) Mind: table, web card, Close the day, safety, phone Check row, queue. (2) Exercise kinds as records, plus the H2–H12 fixes. (3) The lift logger: sets, records, PR Seals, phone SET. (4) HC widening. (5) The pay switch after the sims. (6) Capture grammars and prompts tuning. | Each phase is shippable and gated. The live-pay change comes last and alone. |

---

## 6. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Open production**: mood, stress and notes are readable and writable by anyone with the URL; the mobile token is reportedly unset | D9. Keep values out of URLs, push payloads, the widget, the lock screen and `/check`. |
| R2 | **Double pay**: a non-walk session pays from W = 0 because `readLiveWalks` skips it (H4) | `readLiveSessions` in the same change as the first non-walk write. A split-neutral pin across kinds. Pay stays behind its switch. |
| R3 | **Live economy drift**: momentum is live; the Gym-habit case pays less for more detail; `walk-1` receipts must stay readable | D12 record-first for LIFT. Keep `walk-1` byte-for-byte. Re-run the sims before the pay flip. |
| R4 | **Missing-column crash**: code selecting new ExerciseSession columns deploys before the migration and breaks the live walk card | P2022/42703 fallbacks. Push code that tolerates the absence, then apply. |
| R5 | **Check landmines**: `health-ingest-check` (no `source` in the model text, migration-name regex), `shell-check` Body subs, `train-check` mark/enqueue | Re-pin on purpose (§0.3, §4). Never add `source` to ExerciseSession, not even in a doc comment. |
| R6 | **Gemini leakage**: a mood or lift line that falls through to task capture goes through `applySizing` (free tier, Google may use the data) | Route before task code (weight precedent) with a source-guard check. Notes never reach any `@/lib/gemini` importer. |
| R7 | **Perverse incentives**: any reward tied to mood corrupts the data; mood shown beside XP invites gaming | §2.7 rules and an import-guard check. Same haptic and copy for every value. |
| R8 | **Safety**: persistently low mood with no clinician; thresholds are heuristics, not validated cutoffs; rumination risk | §2.6 signposting, always visible. A conservative card limited to once a week. No suicidality item. Pause. Re-check the numbers before shipping. |
| R9 | **Self-reported loads**: inflated PRs (the reason strength was dropped) | Brzycki ≤ 10, the debounce, the +15 % confirm, 2× unpaid, no-XP Seals, no PRs from imports or backfill. |
| R10 | **Shared dev/prod database**: a dev or preview server writing check-ins or sets lands them in the live account | `lifeWritesEnabled` for automatic writes. Verify only on the rehearsal server (port 3100, local DB). Never act on the live account. |
| R11 | **Prompt fatigue and careless answers** | 1 prompt a day by default, a cap of 3, lapse after 60 min, quiet hours, measured `tookMs`. |
| R12 | **344 px fit**: 9×9 cells below 44 px; a set row with steppers overflows 278 px | The grid as one control; steppers only on focus (§3.5). Screenshot at 344 px first. |
| R13 | **Health Connect**: the alpha client (1.1.0-alpha10); integer type ids disagree; writers like Samsung Health do not fill load or sets | Named SDK constants. Imported strength is minutes only. Device test on the Fold. |
| R14 | **Regulation**: TGA 14A/14E, if the app is distributed beyond personal use; the Privacy Act treats mood as sensitive information | A wellbeing framing, no diagnosis, PHQ/PSS deferred (D6). Check before any distribution. |
| R15 | **Concurrent edits**: another session has `.claude/launch.json`, `ui-audit.mjs` and `srs.ts` open | Check `git status` before editing those files, and merge rather than overwrite. |
| R16 | **Demo divergence**: `DemoApi.kt` does not answer the new routes, so the phone demo crashes | Part of the Android checklist. ScreensTest covers the new states. |
| R17 | **Research limits**: Elo's coefficients, König 2022, the Konjarski abstract, Stone's curves, the TGA text and the Hevy help pages were read at summary level; Pelland 2025 and Marzagao 2026 are preprints | Treat the thresholds as tunable constants pinned in the checks, not as facts. |

---

## Sources (cited above; full lists are in r-psych.md §9 and r-training.md §15)

Psychology:
- Russell, Weiss & Mendelsohn 1989 (Affect Grid): https://arc.psych.wisc.edu/self-report/affect-grid-agrid/
- Killgore 1998: https://experts.arizona.edu/en/publications/the-affect-grid-a-moderately-valid-nonspecific-measure-of-pleasur/
- Elo, Leppänen & Jahkola 2003: https://www.sjweh.fi/article/752
- Dejonckheere et al. 2022: https://research.tilburguniversity.edu/en/publications/assessing-the-reliability-of-single-item-momentary-affective-meas/
- Williams et al. 2021 (EMA compliance): https://pmc.ncbi.nlm.nih.gov/articles/PMC7970161
- Eisele et al. 2022: https://cris.maastrichtuniversity.nl/en/publications/the-effects-of-sampling-frequency-and-questionnaire-length-on-per/
- Ulitzsch et al.: https://www.leibniz-ipn.de/en/research/publications/investigating-the-effect-of-experience-sampling-study-design-on-careless-and-insufficient-effort-responding-identified-with-a-screen-time-based-mixture-model
- Ponnada et al. 2022 (μEMA): https://pmc.ncbi.nlm.nih.gov/articles/PMC8867293
- Neubauer et al. 2020: https://pmc.ncbi.nlm.nih.gov/articles/PMC6842033
- Stone et al. 2006: https://pdodds.w3.uvm.edu/files/papers/others/2006/stone2006a.pdf
- Schueller et al. 2021: https://pmc.ncbi.nlm.nih.gov/articles/PMC8387890/
- Lieberman et al. 2007: https://sites.lifesci.ucla.edu/psych-sanlab/wp-content/uploads/sites/31/2016/03/Lieberman_2007_PsychScience.pdf
- Kashdan, Barrett & McKnight 2015: https://www.affective-science.org/pubs/2015/kashdan-et-all-unpacking-emotion-differentiation-2015.pdf
- Scott et al. 2020: https://stacks.cdc.gov/view/cdc/217574
- Fisher et al. 2018: https://pmc.ncbi.nlm.nih.gov/articles/PMC6142277
- Konjarski et al. 2018: https://doi.org/10.1016/j.smrv.2018.05.005
- Rehder et al. 2026: https://iro.uiowa.edu/esploro/outputs/journalArticle/An-individual-participant-data-meta-analysis-of/9985163468202771
- Kivelä et al. 2022: https://frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2022.876595/full
- Kauer et al. 2012: https://www.jmir.org/2012/3/e67/
- Deci, Koestner & Ryan 1999: https://home.ubalt.edu/ntygmitc/642/Articles%20syllabus/Deci%20Koestner%20Ryan%20meta%20IM%20psy%20bull%2099.pdf
- Kroenke et al. 2009 (PHQ-4): https://fis.uke.de/portal/en/publications/an-ultrabrief-screening-scale-for-anxiety-and-depression-the-phq4(3969b34b-29e4-403d-ba80-11112c46edcb).html
- Levis et al. 2020: https://researchportalplus.anu.edu.au/en/publications/accuracy-of-the-phq-2-alone-and-in-combination-with-the-phq-9-for/
- Helplines: https://www.aihw.gov.au/suicide-self-harm-monitoring/resources/crisis-helplines-support-services ; https://www.lifeline.org.au/get-help/topics/lifeline-services
- TGA: https://www.tga.gov.au/resource/examples-regulated-and-unregulated-software-excluded-software-based-medical-devices

Training:
- 2024 Adult Compendium: https://pmc.ncbi.nlm.nih.gov/articles/PMC10818145/ ; https://pacompendium.com/conditioning-exercise
- WHO 2020 (Bull et al.): https://pmc.ncbi.nlm.nih.gov/articles/PMC7719906/
- Sødal et al. 2023 (drop sets): https://doaj.org/article/21e0b210caf1433594359186eee617b9
- Fink et al. 2018: https://pubmed.ncbi.nlm.nih.gov/28474868/
- Refalo et al. 2023: https://dro.deakin.edu.au/articles/journal_contribution/Influence_of_Resistance_Training_Proximity-to-Failure_on_Skeletal_Muscle_Hypertrophy_A_Systematic_Review_with_Meta-analysis/22030796
- Singer et al. 2024: https://www.frontiersin.org/articles/10.3389/fspor.2024.1429789/full
- Reynolds, Gordon & Robergs 2006: https://www.unm.edu/~rrobergs/478RMStrengthPrediction.pdf
- Zourdos et al. 2016: https://openrepository.aut.ac.nz/items/efef3b25-6701-4fb5-bb82-55fcd2a26027/full
- Halperin et al. 2022: https://pubmed.ncbi.nlm.nih.gov/34542869/
- Pelland et al. 2025 (preprint): https://sportrxiv.org/index.php/server/preprint/view/537
- Schoenfeld, Ogborn & Krieger 2017: see r-training [S25]
- Byrne et al. 2005: https://pubmed.ncbi.nlm.nih.gov/15831804/
- Choe et al. 2017: https://pure.psu.edu/en/publications/semi-automated-tracking-a-balanced-approach-for-self-monitoring-a/
- Epstein et al. 2015: https://library.selfresearch.org/research/a-lived-informatics-model-of-personal-informatics/
- free-exercise-db: https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/schema.json
- Health Connect ExerciseSegment: https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/ExerciseSegment
- Concept2 watts: https://www.concept2.com/training/watts-calculator
