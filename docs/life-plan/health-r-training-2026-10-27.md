# r-training: how to log strength and varied exercise well, and what to build in XTNL

Key: r-training. Read-only research, 2026-10-27. Web sources are cited inline as [S#] and listed in section 15. Some
help-centre pages (help.hevyapp.com) refuse direct fetches (HTTP 403), so their content was read through search-result
summaries. Those sources are marked "(via search)". Repo facts are cited as file:line.

---

## 0. Repo facts that change the brief

1. **Momentum is live, not inert.** `src/lib/momentum.ts:76` sets `MOMENTUM_LAUNCH_DAY = "2026-10-12"`, and
   `docs/life-plan/momentum.md:3` reads "Status: LIVE since 2026-10-12". The "INERT until launch" comments in
   `src/lib/exercise.ts:2-4` describe code paths, not the current state. The sibling report `u-exercise.md` §0 found
   the same. Any exercise kind that goes on the day curve therefore changes live pay.
2. **Strength logging was deferred on purpose.** `docs/life-plan/dropped.md:4` says the strength-set grammar, Epley
   e1RM PRs and double progression were deferred because sets are not in Health Connect and manual weight PRs cannot
   be checked for plausibility. The blueprint already planned the reversal as P25 "Strength volume", with migration
   `20270103000000_strength_sets` reserved (`docs/life-plan/blueprint-plan-2026-10-22.md:26, 518-521`). P25's guard
   is that a set over 2× the user's best is recorded but unpaid until confirmed, and H17 makes backfill record-only
   (`blueprint-plan:680`). Decision D21 put strength "only on request" (`blueprint-plan:639`). The user has now asked.
3. **Self-reported intensity must never multiply pay.** `dropped.md:8` dropped daily-board's RPE multiplier as "a
   free +16% for answering rpe10". This decides how RPE, RIR and "effort" choices may be used (section 11).
4. Walks pay through **one curve per day**, so a split session pays the same as one session (`momentum.md:204`).
   Intensity comes from MET bands: LIGHT below 3, MODERATE below 6, VIGOROUS from 6 (`momentum.md:210`). A walk
   faster than 9 km/h is recorded but pays nothing (`momentum.md:208`), so runs logged as walks are unpaid today.
   Exercise kinds beyond the walk were left out, with the note that the MET table makes adding them "a constant, not
   a redesign" (`momentum.md:810`).
5. Storage conventions to keep:
   - Migrations are additive, with no foreign keys and fail-soft reads (`prisma/schema.prisma:996, 1035, 1055`).
   - Offline idempotency uses `clientId` with `@@unique([userId, clientId])` (`schema.prisma:2111-2115`, TaskSession).
   - Body weight is kg as `Decimal(6,2)`, one reading a day (`schema.prisma:955-971`). The unit is display-only and
     lives on `WeightGoal.unit` (`schema.prisma:979-980`, `src/lib/weight.ts:5`).
6. Health Connect ingest narrowly covers walks, hikes and weight, with "no other workout" (`src/lib/health-ingest.ts:5-6`,
   decision D22). The phone pins `androidx.health.connect:connect-client:1.1.0-alpha10` (`android/app/build.gradle:94`).

---

## 1. What the best loggers model

| App | Exercise library | Session structure | Set data | Notable |
|---|---|---|---|---|
| **Hevy** | Library templates with a primary muscle group, secondary groups, an "is custom" flag and a tracking type. Community API docs list `weight_reps`, `reps_only`, `duration`, `distance_duration` and `weight_distance`/`short_distance_weight`, plus bodyweight, assisted and weighted-bodyweight kinds in the help centre [S1, S2, S8 via search] | workout → exercises (a `superset_id` shared by adjacent exercises) → sets [S2] | `type` ∈ warmup, normal, failure, dropset; weight_kg; reps; distance_meters; duration_seconds; optional RPE in {6, 7, 7.5 … 10} [S2] | PR types: heaviest weight, best 1RM, best set volume, best session volume, most reps in a set, most session reps. "Set records" (heaviest weight at a given rep count) do not trigger live PR announcements [S3 via search] |
| **Strong** | Custom exercises with categories; exercise types include Assisted Bodyweight and Duration [S5] | workout → exercise → ordered sets. The 2021 CSV export had Date, Workout Name, Duration, Exercise Name, Set Order, Weight, Reps, Distance, Seconds, Notes, Workout Notes, RPE [S4] | warm-up, failure and drop tags; supersets; an automatic rest countdown [S5] | warm-up calculator, plate calculator, volume and 1RM graphs [S5] |
| **JEFIT** | 1,300–1,400 exercises, browsable by equipment (barbell, dumbbell, machine, cable, band) and body part [S6] | custom routines, supersets | sets tagged warm-up, working, drop or failure; notes [S6] | rest timer that starts on its own after a set is logged [S6] |
| **Fitbod** | 800–900+ exercises tagged by muscle group, equipment and movement pattern [S7] | generated workouts | sets × reps × load | a per-muscle "recovery %" heat map built from logged work. It favours muscles not heavily trained in the last 48–72 h. This is a heuristic, not a validated model [S7] |
| **StrongLifts** | a fixed program (5×5) | automatic progression | weight × reps per set | e1RM only for 1–12 reps (NA above). It assumes RPE 8 when every rep is done and RPE 10 on missed reps or a single set [S9] |
| **free-exercise-db** (open data) | 873 exercises in the public domain (Unlicense). Fields: id, name, force (push, pull, static), level, mechanic (compound, isolation), equipment (12 values), primaryMuscles and secondaryMuscles (17 values: abdominals, abductors, adductors, biceps, calves, chest, forearms, glutes, hamstrings, lats, lower back, middle back, neck, quadriceps, shoulders, traps, triceps), category, instructions, images [S10] | – | – | the safe vocabulary and expansion source (wger's code is AGPL-3.0 and its data licence is unverified [S11]) |

**The model the field has converged on:**
- library exercise (pattern, primary and secondary muscles, equipment, a tracking/load type, unilateral or not)
- → workout (day, start and end, note)
- → exercise entry (order, superset group)
- → set (order, set type, weight, reps, optional effort, time and distance)

Records are derived from the sets. XTNL should adopt this shape and add two things the field handles poorly. One is
an explicit load convention per exercise: dumbbell per hand or total is a known source of confusion [S12]. The other
is a single load axis for bodyweight moves, so that assisted, bodyweight and weighted work is one progress line
(section 5).

---

## 2. Set types: definitions, evidence and how apps treat them

| Kind | Definition | Evidence | App behaviour |
|---|---|---|---|
| Warm-up | lighter sets before the work sets | none needed; they are excluded from stats | Hevy can leave warm-ups out of total sets, volume and PRs, and recomputes history when the toggle changes [S1, S8 via search] |
| Working (normal) | the sets that count | – | the default row |
| Failure | a working set taken to momentary failure. Hevy logs the last completed rep [S1 via search] | Refalo 2023 meta-analysis (15 studies): failure gives a trivial hypertrophy edge over non-failure, ES 0.19 [S16] | a tag on the set |
| AMRAP | as many reps as possible at a fixed load: a target, not an outcome | – | a flag; reps are what was done |
| Drop set | a chain: reach failure, cut the load, continue with no rest, possibly several times | Sødal 2023 meta-analysis: hypertrophy not different from traditional sets, in less time [S17]. Fink 2018: a single drop set of triceps pushdowns with about 20% drops matched 3 normal sets [S17 table, S18]. Ozaki 2018 used one chain of 80→65→50→40→30% [S17 table] | Hevy marks drop sets with a blue "D" and starts no rest timer before one [S1 via search] |
| Rest-pause / myo-rep "mini" | a continuation at the same load after a short pause (~15–20 s) | Prestes 2019 (n = 18): no difference in 1RM versus traditional sets [S19] | rarely first-class; usually a note |
| Superset / circuit | two or more exercises alternated: a grouping of entries, not a set type | – | Hevy and Strong group exercises. Hevy can auto-scroll to the next exercise of the superset [S2, S8] |
| Back-off sets | working sets at a lower load after a top set | – | ordinary working sets; no kind needed |

**The XTNL set kinds:**
- `WARMUP`, `WORKING`, `DROP` and `MINI` (rest-pause).
- Two flags on `WORKING`: `toFailure` (which implies RIR 0) and `amrap`.
- `DROP` and `MINI` rows name the head set they continue (`chainOf`).
- A superset is a `groupNo` on the exercise entry.

This keeps the kind orthogonal to effort and to grouping. Hevy's 4-value enum folds failure into the type, which
makes "a failure set that was also a drop" impossible to represent.

---

## 3. Per-set metrics

| Field | Keep? | Why |
|---|---|---|
| weight (kg stored, unit display-only) | yes | repo rule (`weight.ts:5`). Steps: 2.5 kg / 5 lb for barbells, 2 kg (or 2.5) / 5 lb for dumbbells, 5 kg / 10 lb for machines, editable per movement |
| reps | yes | integer 1–100 |
| RIR (0, 1, 2, 3, 4+) or RPE | optional, off by default | RIR-based RPE: RPE 10 = 0 RIR, RPE 9 = 1 RIR, and so on (Zourdos 2016, n = 29 squatters; RPE tracks bar velocity in experienced lifters) [S13]. Helms 2016 argues that RIR anchors beat Borg RPE for lifting [S14]. People under-predict reps to failure by about 1 rep on average (95% CI 0.17–1.73), and are more accurate near failure and on sets of 12 reps or fewer (Halperin 2022, 12 studies, I² 97.9%) [S15]. So: coarse chips, never required, never priced (`dropped.md:8`) |
| duration (s) | for holds, carries and timed sets | Hevy has an inline per-set stopwatch for planks [S8] |
| distance (m) | carries, sled | Hevy `weight_distance` [S2] |
| rest before the set (s) | auto-filled from the timer, never typed | Singer 2024 (Bayesian meta-analysis): resting more than 60 s gives a small hypertrophy benefit, and no appreciable further difference was found beyond 90 s [S20]. Schoenfeld 2016: 3 min beat 1 min for strength in trained men [S21, secondary] |
| tempo | no (a note, if ever) | no logger makes it first-class, and it costs taps |

---

## 4. Derived metrics

### 4.1 Estimated 1RM

- **Epley:** e1RM = w × (1 + r/30).
- **Brzycki:** e1RM = w × 36 / (37 − r).
- The two are equal at r = 10 (both 1.333 w).
- Below 10 reps, Epley reads higher: by 3.7% at 2 reps, 3.9% at 3, 3.7% at 5 and 2.0% at 8. Brzycki gives exactly w at
  r = 1, while Epley gives 1.033 w.
- **Valid range.** Reynolds, Gordon and Robergs 2006 conclude that no more than 10 reps should be used in linear
  1RM equations (bench and leg press) [S22]. StrongLifts shows e1RM only for 1–12 reps [S9].
- A 2026 single-author arXiv preprint (Marzagao; 303,494 near-failure sets, 388 exercises) proposes a
  weight-dependent factor that is 17–22% more internally consistent than classical formulas [S23]. It is not
  adopted: it is observational, has no measured maxima and is not peer-reviewed.
- **Recommendation:** Brzycki, on WORKING sets only, with effective reps rEff = reps + (RIR ?? 0) and 1 ≤ rEff ≤ 10.
  - Above 10, show no e1RM; the rep-max records cover those sets.
  - Unknown RIR counts as 0 (to failure). The estimate can then only be conservative, never inflated, which matters
    for PR plausibility (`dropped.md:4`).
  - Brzycki is the conservative of the two below 10 reps.
  - The sibling report suggests Epley up to 12 reps. Pick one formula and pin it in a check script.
  - Drop and mini sets start fatigued, so they never give an e1RM.

### 4.2 Best set, volume load, session figures
- **Top set** of an exercise in a session: the set with the highest e1RM, shown as "100 kg × 5 · e1RM 112.5".
- **Volume load** = Σ load × reps × sides over WORKING, DROP and MINI sets. WARMUP is excluded, as in Hevy's default.
  "Sides" is 2 for a unilateral move logged per side. For a PAIR load (two dumbbells), load = 2 × the implement.
- **Session:** duration, working sets, total reps, volume load, top set per exercise, PRs, and sets per muscle group.

### 4.3 Weekly hard sets per muscle group
- **Count fractionally:** 1.0 for each set where the group is a primary muscle, and 0.5 where it is only secondary.
  Pelland et al. (Sports Med 2025; 67 studies, 2,058 participants) tested three ways of counting indirect sets. The
  "fractional" method (indirect = 0.5) fit best, and their primary models use it [S24].
- Per set, a group gets max(primary 1, secondary 0.5) over its muscles, never a sum. Lats + middle back = Back,
  counted once.
- A **hard set** is a WORKING set with RIR ≤ 4 or unknown. Each DROP or MINI segment adds 0.5, at most +1 per chain.
  This is a design choice: no study defines how to count drop segments. Fink 2018 found one drop chain ≈ 3 normal
  sets [S18], so counting a chain as 1 would undercount it.
- **Display bands, never a target or a debt** (`dropped.md:24`):
  - 0 none
  - 1–3 light
  - 4–9 moderate
  - 10–20 the common productive range
  - above 20 high
- Evidence for the bands:
  - Schoenfeld, Ogborn and Krieger 2017 (15 studies): average gains of 5.4%, 6.6% and 9.8% for under 5, 5–9 and
    10+ weekly sets per muscle. The categorical model had p = 0.074, and only 2 studies used trained lifters [S25].
  - Pelland 2025: volume helps both hypertrophy and strength, with diminishing returns, much sooner for strength.
    The preprint reports no detectable benefit beyond ~31 fractional sets a week for hypertrophy [S24].
  - RP's MV/MEV/MAV/MRV landmarks differ by muscle (chest MEV 4–6, MAV 6–16, MRV 16–24; hamstrings MRV 8–14) and
    are personal [S26].
  - So the 10–20 band is a guide line, not a rule.
- **Muscle groups shown (14), mapped from free-exercise-db names:**
  - Chest (chest); Back (lats, middle back); Shoulders (shoulders); Traps (traps)
  - Biceps; Triceps; Forearms
  - Quads (quadriceps); Hamstrings; Glutes; Calves
  - Abs (abdominals); Lower back (lower back); Hips (abductors, adductors)
  - Neck is not shown.
  - Limitation: free-exercise-db has only "shoulders", so per-head delt counts are not possible without extending the
    vocabulary.

### 4.4 Strength days
WHO 2020 asks adults for muscle-strengthening activity of moderate or greater intensity, involving all major muscle
groups, on 2 or more days a week, in addition to 150–300 aerobic minutes [S27]. Show "Strength days 1 of 2" as its
own record line. Do not fold lifting minutes into the aerobic "150" line.

---

## 5. Bodyweight and assisted exercises

How Hevy counts these (via search) [S8a]:
- Exercises that move 100% of body weight (pull-up, chin-up, dip) count body weight + added weight in volume, but
  only when the user has logged a body weight.
- Partial-bodyweight moves (push-ups, sit-ups) count only the added weight.
- Custom bodyweight exercises never include body weight.
- Assisted exercises count body weight − assistance and have no weight PRs.

Measured share of body weight in a push-up:
- About 64% of body mass for a standard push-up, about 49% on the knees, 41–55% with the hands raised and 70–74%
  with the feet raised. These are Ebben-group force-plate data (Wurm et al. 2010, ISBS), with the numbers from a
  secondary summary [S28].
- Suprak 2011 reports about 69% (top) to 75% (bottom) for a standard push-up, and 54–62% on the knees, also via
  secondary sources [S29].

**XTNL rule (one load axis):**
- A bodyweight movement has a body fraction f: 1.0 for pull-up, chin-up and dip; 0.65 for push-up; null otherwise.
- The set's weight is the signed added load: +10 is a belt plate, −20 is 20 kg of machine or band assistance.
- Effective load = f × bodyKg + weight. bodyKg is the day's BodyWeight reading, or the latest earlier one, copied
  onto the entry when it is created.
- Assisted (−20), bodyweight (0) and weighted (+10) pull-ups are then **one movement with one progress line**, and
  less assistance reads as a PR. Hevy instead splits these into separate exercises and gives assisted ones no weight
  PRs.
- With f null, or no body-weight reading, the movement is reps-only: volume load is not computed, and the screen
  says so.

---

## 6. Cardio and other activities: what to log and what to derive

MET values below are from the 2024 Adult Compendium (adults aged 19–59; 1,114 activities; 1 MET = 3.5 mL/kg/min ≈ 1
kcal/kg/h) [S30, S31-S35]. Speeds are converted to metric.

| Kind | Required | Optional | Derived live | Pay intensity source (section 11) |
|---|---|---|---|---|
| RUN (outdoor or treadmill) | time, distance | avg HR, climb | pace min/km, speed | speed → running METs, interpolated: 6.5 at 6.4 km/h, 8.5 at 8.0, 9.3 at 9.7, 11.0 at 11.3, 12.0 at 12.9 (codes 12028–12090). Jogging, general, is 7.5 [S32] |
| CYCLE (road, MTB, stationary, spin) | time + distance (outdoor) or avg watts (stationary) | HR, climb | speed; W/kg when watts and body weight are known | outdoor by speed: 6.8 at 16–19 km/h, 8.0 at 19–22, 10.0 at 22.5–25.6, 12.0 at 25.7–30.6. Stationary by watts: 4.0 at 50 W, 6.0 at 90–100 W, 8.0 at 126–150 W, 10.8 at 200–229 W. Spin class 9.0, MTB general 8.5 [S33] |
| SWIM | time, distance (or lengths × pool length) | stroke, pool length 25/50 m | pace per 100 m | crawl by speed: 5.8 at 27–41 m/min, 8.0 at ~46 m/min, 10.5 at ~69 m/min. Breaststroke recreational 5.3, backstroke recreational 4.8, butterfly 13.8 [S34] |
| ROW (ergometer) | time, distance | stroke rate, HR | split per 500 m; watts = 2.80 / (s per m)³ (a 2:05 split ≈ 179 W; 2:00 ≈ 202 W) [S36] | by watts: 5.0 under 100 W, 7.5 at 100–149, 11.0 at 150–199, 14.0 at 200 W and above [S31] |
| ELLIPTICAL | time | effort, HR | – | 5.0 moderate (9.0 vigorous is recorded, not priced) [S31] |
| HIIT | time, or rounds × work s / rest s | effort, HR | work minutes, work:rest | 7.0 moderate (11.0 Tabata-style is recorded, not priced) [S31] |
| CIRCUIT / calisthenics | time | effort | – | 5.0 moderate circuit; 3.8 moderate calisthenics; kettlebell swings 9.8 [S31] |
| SPORT | sport, time | casual or competitive, HR | – | casual value: basketball 7.5, soccer 7.0, tennis doubles 6.0 / singles 8.0, badminton 5.5, volleyball 4.0, table tennis 4.0, martial arts practice 5.3, boxing bag 5.8, rock climbing 8.0, bouldering 8.8, squash 7.3, rope jumping (slow) 8.3 [S35] |
| YOGA / PILATES / MOBILITY | style, time | – | – | hatha 2.3, vinyasa 2.7, power 4.0, pilates 2.8 (mat 1.8), stretching 2.3. These are LIGHT except power yoga [S31] |
| LIFT | exercises and sets; time from start and end | session RPE | section 4 | multiple exercises at 8–15 reps 3.5, squats/deadlifts 5.0, vigorous 6.0 (codes 02054, 02052, 02050) [S31] |
| HIKE | stays a WALK with an incline (existing) | – | – | existing ACSM walking equation |

**Energy (kcal) caveats.**
- kcal ≈ MET × kg × hours.
- The Compendium says it does not reflect precise individual energy expenditure. Resting metabolic rate varies with
  age, sex, height and weight, and a "corrected MET" based on Harris-Benedict exists [S30].
- Byrne 2005 (769 adults): measured resting VO₂ averaged 2.6 mL/kg/min. The standard 1 MET (3.5) overestimates it by
  35% on average, and the 1 kcal/kg/h figure by 20% [S37].
- Recommendation: show no kcal by default. If kcal is ever shown, it carries "≈", is never paid and is never fed into
  the weight card.

**Heart rate.**
- Store avg and max HR when Health Connect has them.
- %HRmax needs an age. Tanaka 2001 (meta-analysis of 18,712 subjects) gives HRmax = 208 − 0.7 × age, with an error of
  about ±10 bpm [S38].
- The app has no age field, so HR zones are out of scope for v1.

**Session RPE.**
- After any workout, ask "How hard was it?" on a 0–10 scale (CR10). Load = sRPE × minutes (Foster 2001).
- Studies of the method report session-RPE load correlating with HR-based load at r = 0.50–0.85, and 36 validity and
  reliability studies [S39, S40].
- It is one tap, works for every kind, and is the natural bridge to the mood and stress work. It is a record only
  and never priced (`dropped.md:8`).

---

## 7. Fast logging UX (the 5-second actions)

**Evidence.**
- Manual self-monitoring has a high capture burden that hinders long-term use. Semi-automated designs, which pre-fill
  and let the user confirm, balance burden and engagement (Choe et al. 2017) [S41].
- Tracking lapses are normal, so design for resuming, not for perfect streaks (Epstein et al. 2015) [S42].

**Proven patterns:**
- Previous values beside each set, from either the last session or the last time in the same routine [S8].
- A default rest timer that each exercise inherits; no timer before a drop set [S1, S8].
- A warm-up calculator with editable percentages and plate rounding. A common third-party ramp is 40/55/70/85% of the
  work weight [S8, S43].
- A plate calculator for the bar and the user's plates [S8, S43].
- An optional RPE column [S8], smart superset scrolling and an inline timer for holds [S8].
- Live PR notices [S3].
- Auto-start rest after logging (JEFIT) [S6].

**XTNL flows, with target taps (≤ 44 px targets, 344 px first, as `u-exercise.md` §7 pins):**

| Action | Taps | Behaviour |
|---|---|---|
| Repeat a workout | 1 | "Repeat Push day" copies the last session's exercise list. Every set row shows last time's weight × reps as a ghost value |
| Set done, same as last time | 1 | ✓ accepts the ghost values. This starts the rest timer: the exercise default, else 180 s compound barbell, 120 s other compound, 90 s isolation, 60 s calves and core, 60 s after a warm-up |
| Set done, changed | 2–3 | ± steppers (one step a tap, five on long-press), then ✓ |
| Another set | 1 | "+ Set" copies the previous row |
| Drop | 1 + reps | adds a DROP row chained to the set, at −20% rounded down to the step (Fink 2018 used about 20% drops [S17 table]). No rest timer |
| Set kind | 2 | tap the set number: Warm-up, Working, Drop, Rest-pause, Failure, AMRAP (Hevy's pattern) |
| Effort (optional) | 1 | RIR chips 0, 1, 2, 3, 4+ under the row, only when "Log RIR" is on |
| Plate math | 0 (shown) | for a barbell weight, a line such as "per side 25 + 15", from a default 20 kg bar and plates 25/20/15/10/5/2.5/1.25 kg (45/35/25/10/5/2.5 lb), with any shortfall named |
| Finish | 1 (+1) | minutes from the wall clock, then optional sRPE chips 0–10, then the summary |
| Cardio again | 1 | "Again: 5 km · 27 min" pre-fills the last session of that kind on today's date |
| Phone, mid-workout | 1 | the ongoing notification, tile or cover widget shows "Next: Bench 60 × 8 ✓". The set queues offline with its own clientId (u-exercise §6: a `SendQueue` kind SET) |
| Capture line | type | a separate `lift-parse.ts` (u-exercise §6). Examples: `bench 3x8 60`, `squat 100x5 100x5 90x8`, `pullup 3x8 +10`, `pullup 3x6 -20` (assisted), `run 5k 27m`, `row 2k 8:10`, `swim 1000m 25m`, `yoga 30m`. It must not collide with `capture-parse-check` fixtures (`x run 30m`, `run 5k 28m`, `5x5 squats`) or capture rule R11 (`docs/life-plan/capture.md:221`) |

The 344 px set row:
- one line: kind/number chip, kg field with steppers, reps field with steppers, ✓ (44 px);
- the ghost "last 60 × 8" under the fields;
- RIR on a second line only when switched on.

---

## 8. Recommended data model

This follows the sibling report's repo-level choice: keep `ExerciseSession` as the one header for every kind, so the
WORKOUT `sourceId`, reversals, Health Connect dedupe and "Counts as" links stay single-namespace (`u-exercise.md` §5).
All changes are additive, with no foreign keys, CHECKs in SQL, fail-soft reads, and the migration
`20270103000000_strength_sets`.

```
ExerciseSession (existing; ADD COLUMN only)
  kind         WALK | RUN | CYCLE | SWIM | ROW | ELLIPTICAL | HIIT | CIRCUIT | SPORT | YOGA | MOBILITY | LIFT
  distanceKm   kept NOT NULL; 0 = no distance (u-exercise D-a)
  + variant    TEXT NULL        sport or style: TENNIS, VINYASA, SPIN, TREADMILL, BREAST, ...
  + label      TEXT NULL        "Push day" (1..40)
  + startedAt, endedAt TIMESTAMPTZ NULL; partial UNIQUE(userId) WHERE startedAt NOT NULL AND endedAt NULL
  + avgHr, maxHr SMALLINT NULL · avgWatts SMALLINT NULL · poolM REAL NULL · rounds, workSec, restSec SMALLINT NULL
  + effort     TEXT NULL        LIGHT | MODERATE | VIGOROUS as chosen (recorded, never priced)
  + sessionRpe REAL NULL        0..10 (CR10)
  + source     TEXT DEFAULT 'manual' (manual | capture | import | phone) · clientId TEXT NULL, UNIQUE(userId, clientId)

ExerciseEntry (new)   one movement within a LIFT session
  id, userId, sessionId, movementKey TEXT (a library key, or 'u:<UserMovement.id>'), ord INT,
  groupNo SMALLINT NULL (superset/circuit), bodyKg DECIMAL(6,2) NULL (snapshot for BW loads), note TEXT NULL
  INDEX(sessionId) · INDEX(userId, movementKey)

ExerciseSet (new)
  id, userId, sessionId, entryId, movementKey (denormalised), day DATE (denormalised), ord INT,
  kind TEXT CHECK IN ('WARMUP','WORKING','DROP','MINI') DEFAULT 'WORKING',
  chainOf INT NULL (DROP/MINI: the ord of the chain's head; CHECK: null exactly when kind is WARMUP or WORKING),
  weightKg DECIMAL(6,2) NULL CHECK (-200..500)  -- EXT: total; PAIR/ONE: one implement; BW: signed added load
  reps SMALLINT NULL CHECK (1..100), rir REAL NULL CHECK (0..5), toFailure BOOL DEFAULT false, amrap BOOL DEFAULT false,
  durationSec INT NULL (1..3600), distanceM REAL NULL, restSec INT NULL (from the timer), doneAt TIMESTAMPTZ NOT NULL,
  clientId TEXT NOT NULL, UNIQUE(userId, clientId) · INDEX(entryId) · INDEX(userId, movementKey, day)

UserMovement (new)    the user's own movements (the starter library lives in code)
  id, userId, name (1..40), normName, pattern, equipment, primary TEXT[], secondary TEXT[], load TEXT,
  bodyFraction REAL NULL, unilateral BOOL, stepKg REAL NULL, restSec INT NULL, archivedAt TIMESTAMPTZ NULL
  partial UNIQUE(userId, normName) WHERE archivedAt IS NULL
```

Pure modules, following the repo's existing pattern:
- `src/lib/training.ts` (pure): set-kind rules, e1RM, volume, the muscle-set tally, records and PR moments, plate
  math, words.
- `src/lib/training-library.ts`: the starter library (section 9).
- `src/lib/training-server.ts`, plus actions in `src/app/actions/training.ts`.
- `scripts/training-check.ts`, appended to `life:check` (`package.json:19`).
- Records are derived on read and never stored as counters (`dropped.md:19`). Only a PR moment, if one is written,
  is a ledger row.

---

## 9. Starter library: 57 movements

Load codes:
- EXT: the total external load as typed (a barbell includes the bar; a stack; a cable).
- PAIR: one implement, two used (volume ×2, e1RM and max weight per implement).
- ONE: a single implement.
- BW f: the body fraction plus a signed added load.
- TIME: a hold.
- CARRY: per hand × distance or time.

Uni = reps per side, both sides done: volume ×2, and one hard set per side-pair. Rest is in seconds; step is in kg.

| # | key | Movement | Pattern | Equipment | Primary | Secondary | Load | Uni | Step | Rest |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | back_squat | Back squat | squat | barbell | quadriceps, glutes | adductors, lower back | EXT | | 2.5 | 180 |
| 2 | front_squat | Front squat | squat | barbell | quadriceps | glutes, abdominals | EXT | | 2.5 | 180 |
| 3 | goblet_squat | Goblet squat | squat | dumbbell/kettlebell | quadriceps | glutes, adductors | ONE | | 2 | 120 |
| 4 | leg_press | Leg press | squat | machine | quadriceps | glutes, adductors | EXT | | 5 | 150 |
| 5 | hack_squat | Hack squat | squat | machine | quadriceps | glutes | EXT | | 5 | 150 |
| 6 | air_squat | Bodyweight squat | squat | body only | quadriceps | glutes | BW (f null) | | – | 60 |
| 7 | deadlift | Deadlift | hinge | barbell | hamstrings, glutes | lower back, quadriceps, traps, forearms | EXT | | 2.5 | 180 |
| 8 | romanian_deadlift | Romanian deadlift | hinge | barbell | hamstrings | glutes, lower back | EXT | | 2.5 | 150 |
| 9 | db_romanian_deadlift | Dumbbell Romanian deadlift | hinge | dumbbell | hamstrings | glutes, lower back | PAIR | | 2 | 120 |
| 10 | hip_thrust | Hip thrust | hinge | barbell | glutes | hamstrings | EXT | | 2.5 | 120 |
| 11 | kettlebell_swing | Kettlebell swing | hinge | kettlebell | glutes, hamstrings | lower back, shoulders | ONE | | 4 | 90 |
| 12 | back_extension | Back extension | hinge | body only | lower back | glutes, hamstrings | BW (f null, + plate) | | 2.5 | 90 |
| 13 | bulgarian_split_squat | Bulgarian split squat | lunge | dumbbell | quadriceps, glutes | adductors | PAIR | yes | 2 | 120 |
| 14 | walking_lunge | Walking lunge | lunge | dumbbell | quadriceps, glutes | hamstrings, adductors | PAIR | yes | 2 | 120 |
| 15 | reverse_lunge | Reverse lunge | lunge | body only | quadriceps, glutes | hamstrings | BW (f null) | yes | – | 90 |
| 16 | step_up | Step-up | lunge | dumbbell | quadriceps, glutes | hamstrings | PAIR | yes | 2 | 90 |
| 17 | bench_press | Bench press | horizontal push | barbell | chest | triceps, shoulders | EXT | | 2.5 | 180 |
| 18 | incline_bench_press | Incline bench press | horizontal push | barbell | chest | shoulders, triceps | EXT | | 2.5 | 150 |
| 19 | db_bench_press | Dumbbell bench press | horizontal push | dumbbell | chest | triceps, shoulders | PAIR | | 2 | 120 |
| 20 | incline_db_press | Incline dumbbell press | horizontal push | dumbbell | chest | shoulders, triceps | PAIR | | 2 | 120 |
| 21 | machine_chest_press | Machine chest press | horizontal push | machine | chest | triceps, shoulders | EXT | | 5 | 120 |
| 22 | push_up | Push-up | horizontal push | body only | chest | triceps, shoulders | BW f 0.65 | | 2.5 | 90 |
| 23 | dip | Dip | vertical push (down) | body only | chest, triceps | shoulders | BW f 1.0 | | 2.5 | 120 |
| 24 | cable_fly | Cable fly | horizontal push (isolation) | cable | chest | shoulders | EXT | | 2.5 | 90 |
| 25 | overhead_press | Overhead press | vertical push | barbell | shoulders | triceps | EXT | | 2.5 | 150 |
| 26 | db_shoulder_press | Dumbbell shoulder press | vertical push | dumbbell | shoulders | triceps | PAIR | | 2 | 120 |
| 27 | machine_shoulder_press | Machine shoulder press | vertical push | machine | shoulders | triceps | EXT | | 5 | 120 |
| 28 | barbell_row | Barbell row | horizontal pull | barbell | middle back, lats | biceps, lower back, shoulders | EXT | | 2.5 | 150 |
| 29 | one_arm_db_row | One-arm dumbbell row | horizontal pull | dumbbell | lats, middle back | biceps | ONE | yes | 2 | 90 |
| 30 | seated_cable_row | Seated cable row | horizontal pull | cable | middle back, lats | biceps | EXT | | 5 | 120 |
| 31 | chest_supported_row | Chest-supported row | horizontal pull | machine | middle back | lats, biceps, shoulders | EXT | | 5 | 120 |
| 32 | inverted_row | Inverted row | horizontal pull | body only | middle back | lats, biceps | BW (f null) | | – | 90 |
| 33 | face_pull | Face pull | horizontal pull (isolation) | cable | shoulders | traps, middle back | EXT | | 2.5 | 90 |
| 34 | pull_up | Pull-up (− = assisted) | vertical pull | body only | lats | biceps, middle back | BW f 1.0 | | 2.5 | 150 |
| 35 | chin_up | Chin-up (− = assisted) | vertical pull | body only | lats, biceps | middle back | BW f 1.0 | | 2.5 | 150 |
| 36 | lat_pulldown | Lat pulldown | vertical pull | cable | lats | biceps, middle back | EXT | | 5 | 120 |
| 37 | straight_arm_pulldown | Straight-arm pulldown | vertical pull (isolation) | cable | lats | triceps | EXT | | 2.5 | 90 |
| 38 | lateral_raise | Lateral raise | shoulder isolation | dumbbell | shoulders | traps | PAIR | | 1 | 90 |
| 39 | rear_delt_fly | Rear-delt fly | shoulder isolation | dumbbell/machine | shoulders | middle back, traps | PAIR | | 1 | 90 |
| 40 | shrug | Shrug | shoulder isolation | dumbbell | traps | forearms | PAIR | | 2 | 90 |
| 41 | barbell_curl | Barbell or EZ curl | arm isolation | barbell/e-z bar | biceps | forearms | EXT | | 2.5 | 90 |
| 42 | db_curl | Dumbbell curl | arm isolation | dumbbell | biceps | forearms | PAIR | | 1 | 90 |
| 43 | hammer_curl | Hammer curl | arm isolation | dumbbell | biceps, forearms | – | PAIR | | 1 | 90 |
| 44 | triceps_pushdown | Triceps pushdown | arm isolation | cable | triceps | – | EXT | | 2.5 | 90 |
| 45 | overhead_triceps_extension | Overhead triceps extension | arm isolation | cable/dumbbell | triceps | – | EXT | | 2.5 | 90 |
| 46 | lying_triceps_extension | Lying triceps extension | arm isolation | e-z bar | triceps | – | EXT | | 2.5 | 90 |
| 47 | leg_extension | Leg extension | leg isolation | machine | quadriceps | – | EXT | | 5 | 90 |
| 48 | leg_curl | Leg curl | leg isolation | machine | hamstrings | calves | EXT | | 5 | 90 |
| 49 | calf_raise | Standing calf raise | leg isolation | machine | calves | – | EXT | | 5 | 60 |
| 50 | hip_abduction | Hip abduction | leg isolation | machine | abductors | glutes | EXT | | 5 | 60 |
| 51 | hip_adduction | Hip adduction | leg isolation | machine | adductors | – | EXT | | 5 | 60 |
| 52 | plank | Plank | core (anti-extension) | body only | abdominals | – | TIME | | – | 60 |
| 53 | hanging_leg_raise | Hanging leg raise | core (flexion) | body only | abdominals | forearms | BW (f null) | | – | 60 |
| 54 | cable_crunch | Cable crunch | core (flexion) | cable | abdominals | – | EXT | | 2.5 | 60 |
| 55 | ab_wheel_rollout | Ab-wheel rollout | core (anti-extension) | other | abdominals | lats | BW (f null) | | – | 60 |
| 56 | pallof_press | Pallof press | core (anti-rotation) | cable | abdominals | – | EXT | yes | 2.5 | 60 |
| 57 | farmers_carry | Farmer's carry | carry | dumbbell/kettlebell | forearms, traps | abdominals, glutes | CARRY | | 2 | 90 |

Notes on the library:
- The pattern set is squat, hinge, lunge, horizontal and vertical push, horizontal and vertical pull, carry, core and
  isolation. It covers every WHO "major muscle group" [S27].
- Every primary muscle uses the free-exercise-db vocabulary [S10]. The library can therefore grow later from that
  public-domain set without a licence question.
- Steps (2 vs 2.5 kg dumbbells) differ by gym, so the user's last step per movement wins.

---

## 10. Set-kind rules (what counts where)

| Kind | Rest timer after | Volume load | Hard sets | e1RM / heaviest / rep-max | Best set volume |
|---|---|---|---|---|---|
| WARMUP | 60 s | no | 0 | no | no |
| WORKING (incl. toFailure, amrap) | the movement default | yes | 1 if RIR ≤ 4 or unknown, else 0 | yes (e1RM only at rEff ≤ 10) | yes |
| DROP (chainOf = head) | none before it; after the chain ends, the default | yes | +0.5 each, at most +1 per chain | no | no; it counts toward session volume |
| MINI (rest-pause) | 20 s countdown | yes | +0.5 each, at most +1 per chain | no | no |

---

## 11. PR rules and pay

**Records**: derived, quiet and always on, per movement (Hevy-like [S3]):
- heaviest weight (WORKING, any reps ≥ 1, effective load);
- best e1RM;
- rep-max table: the best load at ≥ r reps for r ∈ {1, 2, 3, 5, 8, 10, 12, 15};
- best set volume and best session volume;
- most reps in one set at a given effective load (bodyweight work);
- longest hold (TIME) and heaviest × longest carry.
- Assisted work improves "heaviest" automatically (−15 beats −20).
- Loads are compared in stored kg, so a kg/lb switch never makes a PR.

**PR moments** (a Seal; the user's requested "maximum weight" lives here):
- Only best e1RM and heaviest weight.
- Needs at least 3 earlier sessions with the movement.
- Must beat the best by at least 1% (e1RM), or by at least one step (heaviest).
- At most one per movement per life week; a better one later that week updates silently.
- At most 2 a session, the biggest relative gains first.
- These mirror the walk debounce (`momentum.md:237`).
- Never from WARMUP, DROP or MINI sets, never from backfill or imports (H17), never on the first 3 sessions.

**Plausibility** (`dropped.md:4`, P25/H17):
- More than +15% over the 8-week best asks "Big jump: 100 kg (best 80). Keep it?" with Keep or Fix. It is a Seal
  only after Keep.
- More than 2× the best is recorded but never paid until confirmed (P25).
- Recommended: Seals carry no XP at first (u-exercise §9 decision 2, the same view). Load is self-reported and
  unverifiable. If PRs ever pay, key the row `pr:LIFT:<movementKey>:<metric>:<weekKey>` (the walk key is
  `pr:WALK:<metric>:<weekKey>`, `momentum.ts:270`).

**Day-curve pay, if new kinds go on the curve:**
- Intensity comes only from **objective inputs**:
  - run speed;
  - cycle speed (outdoor) or watts (stationary);
  - row watts from the split;
  - swim pace.
- Kinds with only a self-chosen effort (ELLIPTICAL, HIIT, CIRCUIT, SPORT, YOGA) pay at their casual or base MET.
  "Competitive" or "vigorous" is recorded but never raises W (`dropped.md:8`).
- LIFT pays at a fixed MODERATE (3.5–5.0 MET, w = 1). sRPE and RIR never change it. Example: a 60-minute lift is W 60,
  which on a fresh day is X(60) = 35 × (1 − e^(−60/70)) = **20.1** raw, the same as the walk golden with W 60
  (`momentum.md:224-229`).
- YOGA, PILATES and MOBILITY are LIGHT (w 0.5; WHO effort weight 0).
- The existing caps hold: minutes capped at 180, nothing under 5 minutes, pay only today or yesterday, and split
  neutrality through one day curve (`momentum.md:204, 211, 218`).
- Whether LIFT minutes count toward the aerobic "150" line is a decision. WHO counts strengthening separately [S27],
  so the recommendation is no, with a "Strength days n of 2" line instead.

---

## 12. Health Connect

- `ExerciseSessionRecord` session types cover running (and treadmill), biking (and stationary), pool and open-water
  swimming, rowing machine, elliptical, HIIT, strength training, weightlifting, calisthenics, yoga, pilates,
  stretching and many sports.
- **Use the SDK's named constants, never integers.** This session's documentation fetch returned unverified integers
  that disagree with the sibling report's (for example, rowing machine 46 vs 54, pilates 41 vs 48, HIIT 34 vs 36).
- `ExerciseSegment` carries start and end times, a segment type (for example `EXERCISE_SEGMENT_TYPE_BENCH_PRESS`) and
  optional repetitions [S44].
- Newer reference pages add optional per-segment weight, set index and RPE (0–10, Borg CR10). The platform's
  set-index getter is marked API 36.1 [S44, S45]. The app pins connect-client `1.1.0-alpha10`
  (`android/app/build.gradle:94`), and most writers (Samsung Health) are not known to fill these fields.
- So imported strength stays a **minutes-only session**, which the user can open and fill with sets.
- Imported cardio brings duration, distance and, where written, avg HR.
- This widens D22 (`health-ingest.ts:5-6`) and should be recorded as a decision.

---

## 13. Risks

- **Self-reported loads.** Inflated PRs are the reason strength was dropped (`dropped.md:4`). Mitigations: a
  conservative e1RM (Brzycki, unknown RIR = 0, ≤ 10 reps), the debounce, the +15% confirm, the 2× unpaid rule, and
  Seals without XP.
- **Unit and convention confusion.**
  - Per-dumbbell vs total is genuinely ambiguous [S12], so the row label says "per dumbbell" on PAIR movements.
  - Negative weights must read "assist 20 kg", never "−20 kg".
- **Body weight missing:** BW volume and e1RM fall back to reps-only, and the screen says so.
- **RIR inaccuracy** of about 1 rep [S15]: optional, coarse, never priced.
- **Economy re-pins.** Putting new kinds on the live curve re-pins balance-horizon, momentum-sim C5–C7, C10, the BODY
  kept rate, and the exercise-style and momentum goldens (`blueprint-plan:521`). Gym habits linked by "Counts as"
  change pay (u-exercise §4.2).
- **Capture collisions** with pinned fixtures (`x run 30m`, `run 5k 28m`, `5x5 squats`, `x gym 45m`): use a separate
  parser.
- **Offline gyms.** Every set needs a client-made id and clientId; the session must be creatable offline; review
  answers are still never queued.
- **344 px** set row width, a 16 px input font and 44 px targets, as `train-check` pins (u-exercise §7).
- **kcal figures can mislead** (35% average RMR overestimate [S37]), so they are not shown by default.
- **Weekly set bands must never read as a quota** (`dropped.md:24`). They are a guide only: wording carries no
  "behind" and no debt.
- **Licensing:** take only free-exercise-db (Unlicense) data. Do not copy wger (AGPL code, unverified data licence)
  or commercial databases.

---

## 14. Decisions to put to the lead or user

1. Brzycki ≤ 10 (recommended) or Epley ≤ 12 (sibling) as the one pinned e1RM formula.
2. Signed added load on bodyweight movements (one progress line for assisted, bodyweight and weighted), or Hevy-style
   separate assisted movements.
3. Strength Seals: no XP (recommended), or +15 XP behind the guards.
4. Do LIFT minutes count toward the aerobic 150 line? Recommended: no, with a "Strength days n of 2" line instead.
5. Drop and mini segments count +0.5 hard sets each, at most +1 per chain (recommended), or each segment counts 1.
6. Widen the Health Connect ingest to cardio and strength sessions (minutes-only for strength).

---

## 15. Sources

- [S1] Hevy help, Set Types (warm-up, drop, failure): https://help.hevyapp.com/hc/en-us/articles/34896293707927-Set-Types-in-Hevy-Explained-Drop-Sets-Warm-Up-Sets-and-More (via search); https://www.hevyapp.com/features/workout-set-types/
- [S2] Hevy API (community docs): https://mintlify.wiki/imalfect/hevy-http-mcp/api-reference/exercise-templates ; https://glama.ai/mcp/servers/diecoscai/hevy-mcp/tools/hevy_create_workout
- [S3] Hevy PRs and set records: https://help.hevyapp.com/hc/en-us/articles/35649367857175-Personal-Records-PRs-and-Set-Records-Explained-How-They-Work-in-the-Hevy-App ; https://help.hevyapp.com/hc/en-us/articles/38279531346455-Set-Records-vs-Personal-Records (via search)
- [S4] Strong CSV export columns (intervals.icu forum, 2021): https://forum.intervals.icu/t/import-strong-data-weightlifting-app/5531
- [S5] Strong app listings: https://apps.apple.com/za/app/id464254577 ; https://www.apkmirror.com/apk/strong-fitness-pte-ltd/strong-workout-tracker-gym-log
- [S6] JEFIT listings: https://www.apkmirror.com/?p=678069 ; https://www.bluestacks.com/campaign/je.fit/it
- [S7] Fitbod algorithm: https://fitbod.me/blog/fitbod-algorithm
- [S8] Hevy workout settings: https://www.hevyapp.com/features/workout-settings/ ; https://help.hevyapp.com/hc/en-us/articles/33882110558743-Workout-Settings-Preferences-Timer-Warm-up-calculator-Plate-Calculator-Smart-Superset-Scrolling
- [S8a] Hevy bodyweight, weighted and assisted (via search): https://help.hevyapp.com/hc/en-us/articles/38387131819799-Weighted-Bodyweight-Exercises-Is-Bodyweight-Included-in-Volume ; https://help.hevyapp.com/hc/en-us/articles/34380762441111-Assisted-Bodyweight-Exercises-How-it-Calculates-Volume-and-PRs ; https://help.hevyapp.com/hc/en-us/articles/38386262243223-Bodyweight-Exercises-in-Hevy-Bodyweight-vs-Assisted-vs-Weighted
- [S9] StrongLifts e1RM: https://support.stronglifts.com/article/138-one-rep-max-calculator
- [S10] free-exercise-db schema and overview: https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/schema.json ; https://apis.io/providers/free-exercise-db/
- [S11] wger README (AGPL-3.0): https://cdn.jsdelivr.net/gh/wger-project/wger@master/README.md
- [S12] Dumbbell weight ambiguity (Garmin forum): https://forums.garmin.com/sports-fitness/healthandwellness/f/vivoactive-4-series/218833/strength-app
- [S13] Zourdos et al. 2016, RIR-based RPE: https://openrepository.aut.ac.nz/items/efef3b25-6701-4fb5-bb82-55fcd2a26027/full
- [S14] Helms et al. 2016, applying the RIR scale: https://openrepository.aut.ac.nz/items/92cefeac-7c32-44f1-bfbc-f48f4a5dd8cf/full
- [S15] Halperin et al. 2022, accuracy of predicting reps to failure: https://pubmed.ncbi.nlm.nih.gov/34542869/
- [S16] Refalo et al. 2023, proximity to failure: https://dro.deakin.edu.au/articles/journal_contribution/Influence_of_Resistance_Training_Proximity-to-Failure_on_Skeletal_Muscle_Hypertrophy_A_Systematic_Review_with_Meta-analysis/22030796
- [S17] Sødal et al. 2023, drop sets meta-analysis: https://doaj.org/article/21e0b210caf1433594359186eee617b9 ; protocol table: https://sportsmedicine-open.springeropen.com/articles/10.1186/s40798-023-00620-5/tables/1
- [S18] Fink et al. 2018, drop sets: https://pubmed.ncbi.nlm.nih.gov/28474868/
- [S19] Prestes et al. 2019, rest-pause: https://pubmed.ncbi.nlm.nih.gov/28617715/
- [S20] Singer et al. 2024, rest intervals: https://www.frontiersin.org/articles/10.3389/fspor.2024.1429789/full
- [S21] Schoenfeld et al. 2016, longer rest (secondary review): https://brookbushinstitute.com/article/longer-interset-rest-periods-enhance-muscle-strength-hypertrophy-resistance-trained-men
- [S22] Reynolds, Gordon and Robergs 2006: https://www.unm.edu/~rrobergs/478RMStrengthPrediction.pdf
- [S23] Marzagao 2026 (arXiv preprint): https://arxiv.org/abs/2603.17495
- [S24] Pelland et al. 2025, dose-response (preprint): https://sportrxiv.org/index.php/server/preprint/view/537
- [S25] Schoenfeld, Ogborn and Krieger 2017: https://researchgate.net/profile/Brad-Schoenfeld/publication/305455324_Dose-response_relationship_between_weekly_resistance_training_volume_and_increases_in_muscle_mass_A_systematic_review_and_meta-analysis/links/59dc0269458515e9ab4527d6/Dose-response-relationship-between-weekly-resistance-training-volume-and-increases-in-muscle-mass-A-systematic-review-and-meta-analysis.pdf
- [S26] RP volume landmarks: https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth ; https://rpstrength.com/chest-training-tips-hypertrophy
- [S27] WHO 2020 guidelines (Bull et al.): https://pmc.ncbi.nlm.nih.gov/articles/PMC7719906/
- [S28] Wurm, Ebben et al. 2010, push-up kinetics: https://ojs.ub.uni-konstanz.de/cpa/article/view/4457 (numbers via https://breakingmuscle.com/?p=868)
- [S29] Suprak et al. 2011: https://pubmed.ncbi.nlm.nih.gov/20179649
- [S30] 2024 Adult Compendium: https://pmc.ncbi.nlm.nih.gov/articles/PMC10818145/ ; https://pubmed.ncbi.nlm.nih.gov/38242596/
- [S31] Compendium, conditioning exercise: https://pacompendium.com/conditioning-exercise
- [S32] Compendium, running: https://pacompendium.com/running
- [S33] Compendium, bicycling: https://pacompendium.com/bicycling
- [S34] Compendium, water activities: https://pacompendium.com/water-activities
- [S35] Compendium, sports: https://pacompendium.com/sports
- [S36] Concept2 pace-to-watts: https://www.concept2.com/training/watts-calculator
- [S37] Byrne et al. 2005, one MET does not fit all: https://pubmed.ncbi.nlm.nih.gov/15831804/
- [S38] Tanaka, Monahan and Seals 2001: https://pubmed.ncbi.nlm.nih.gov/11153730/
- [S39] Session-RPE review: https://www.frontiersin.org/articles/10.3389/fnins.2017.00612/full
- [S40] Impellizzeri et al. 2004, session-RPE in soccer: https://pubmed.ncbi.nlm.nih.gov/15179175/
- [S41] Choe et al. 2017, semi-automated tracking: https://pure.psu.edu/en/publications/semi-automated-tracking-a-balanced-approach-for-self-monitoring-a/
- [S42] Epstein et al. 2015, lived informatics: https://library.selfresearch.org/research/a-lived-informatics-model-of-personal-informatics/
- [S43] Plate and warm-up calculators: https://www.boostcamp.app/features/plate-calculator ; https://liftvault.com/resources/warmup-set-calculator/ ; https://help.hevyapp.com/hc/en-us/articles/35650921359639-How-to-Use-the-Warm-Up-Calculator-for-Percentage-Based-Warm-Up-Sets
- [S44] Health Connect ExerciseSegment (androidx): https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/ExerciseSegment
- [S45] Health Connect ExerciseSegment (platform): https://developer.android.com/reference/android/health/connect/datatypes/ExerciseSegment
