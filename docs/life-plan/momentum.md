# Momentum: chance, stakes and a life skill tree

Status: DESIGN (2026-10-12). Nothing here is built. The balance model is `scripts/momentum-sim.ts` (`npx tsx scripts/momentum-sim.ts`). It holds the reference implementation of every pure formula below, and its printout is quoted in §C.

The user asked: "Rework the skill system, add more gamify mechanism to ensure complete task, follow up with milestone, do exercise etc is addicted."

**The user's decisions (binding)**

| # | Decision | Where it lands |
|---|---|---|
| 1 | CHANCE: a daily chest that opens when Today's three are done (XP, MP, a freeze or a cosmetic), plus rare crits (any finished task may pay ×2). This lifts the dropped.md ban for exactly these two. | §A.2, §A.5, §A.9, dropped.md changes |
| 2 | STAKES: a visible streak on Tasks. Freezes are earned, not bought. A push at 20:00 Australia/Sydney when the streak is at risk (the life day turns at 04:00), sent through the existing dispatcher. Duty debt stays off. | §A.3, §F |
| 3 | SKILLS: a Life skill tree beside the knowledge emblems. Three branches: Discipline (tasks), Pathfinder (roadmap) and Vitality (exercise). Points come from doing the thing, and perks have real effects. The emblems and the loadout do not change. | §B |
| 4 | BALANCE: exercise pays BODY XP, counts for BODY's kept week and has personal bests. Milestones and checkpoints pay XP and MP with a big ceremony. Life income ≈ one third of knowledge income. The Lv 10 ≈ 3 months and Lv 20 ≈ 1 year pins hold. Work-board tasks stay outside the game. | §A.6–A.8, §A.10, §C |

**The launch gate.** `MOMENTUM_LAUNCH_DAY` in `src/lib/momentum.ts` works like `LIFE_LAUNCH_DAY`:
- While it is `null`, everything here is inert: no row is written and no UI is shown.
- Only the lead sets it, in the launch commit.
- Outside production, `XTNL_MOMENTUM_LAUNCH_DAY` overrides it, for the rehearsal DB.
- Every mechanic counts from that day. Earlier days hold no momentum and earn nothing.

---

## 0. House rules, applied

| Rule (data-model.md, dropped.md) | How momentum keeps it |
|---|---|
| The ledger is the truth; no mutable counters | The streak, the freeze bank, quest completion, the chest's readiness, chains, Life Skill Points and perk ownership are all derived on read. Every new fact is an append-only `ActivityEvent` decision row (§D), or a `MasteryLedgerEntry` paired with an `MP_MINT` row. |
| Idempotency through dedupe rows in batch `$transaction([...])` arrays | Every write has a unique dedupe key (§D.2). Writes that touch the day's knee take `lifeLockOp` + `freshnessGuardOp` from tasks.ts:1514/1570, the same as a tick. Perk buys take `lifeLockOp` + a count guard. There are no interactive transactions. |
| Randomness | Only through `roll(secret, key)`, an HMAC-SHA256 (§A.9). The result is stored on the row it pays. `Math.random` never appears in `momentum*.ts`; the momentum-check greps for it. |
| Work is kept apart from the game | A work tick writes no `ActivityEvent` at all (tasks.ts:3340). Every momentum reader works on ledger rows or on `PERSONAL_BOARD` templates (work-boards.ts:46), so a work task can never be a quest, a crit, a chain link, a momentum day or a source of skill points. |
| Honesty: what a row says is what the tick pays | The board's "≈ N XP" includes perk multipliers (S) and the live chain (M), never a crit (X). A crit is the one published surprise. Its receipt shows "Crit ×2 · sealed roll 0.031 under 0.080", and /today/rules publishes the odds. |
| Never pay twice | A study-linked task still pays 0. A logged walk linked to an exercise habit pays once (§A.6). A roadmap practice task counts toward Pathfinder points, not Discipline (§B.2). |
| Today stays calm (ui-motion D10/H9) | The flame is a static glyph. A chest reveals only on the user's tap, inside a sheet. Each event gets one flourish chain of at most 1.6 s (H13). |
| Duty off (`DUTY_LAUNCH_DAY` null) | No debt. Momentum freezes are a pure fold that needs no settlement (§A.3). Duty's FREEZE_EARN/FREEZE_USE rows stay inert and untouched. |
| Additive migrations | One migration adds two nullable columns to `UserPrefs` (§D.4). No new table, no new enum, no altered column. |

---

## A. The core loops

### A.0 One loop per behaviour

| | Finish tasks | Advance the roadmap | Exercise |
|---|---|---|---|
| **Trigger** | Today's three names the day's biggest due task ("the big one"). The chain chip reads "Chain 2 · keep it within 45 min". The bell from 18:00 and the push at 20:00 fire when the run is at risk. | The Plan pip names today's practice, step or checkpoint. The roadmap card counts down to the milestone's due day. | The Body pip says "Move 20 min" or names the exercise habit. Train shows the week's effort minutes ("112 of 150") and the best to beat ("best 8.4 km"). |
| **Action** | Tick (manual, Again or a step) | Tick the practice or step, log the checkpoint, reach the milestone | Log a walk on Train › Exercise |
| **Immediate feedback** | T0 mark "+12". On a crit, a gold "Crit ×2 · +24"; on a link, "Chain 3". T1 `momentum-kept` on the day's first momentum action; T1 `quest-done` for each of Today's three. | T0 on the tick. T2 `checkpoint` Seal. T2 `plan-week` Seal on Wednesday. T3 `milestone` Ascension. | T0 "+17 XP · moderate 45 min". T2 `pr` Seal on a personal best. T1 `quest-done`. |
| **Variable reward** | A crit (8%). The chest at 3 of 3: XP, MP, a freeze or a cosmetic. | Fair winds improves chest odds. Summit chest opens a rare chest on each milestone. | A PB moment (about 1 a month). Body spark gives walks a crit chance. |
| **Investment** | Discipline XP toward Life Skill Points (§B) | Pathfinder XP toward Life Skill Points | Vitality XP toward Life Skill Points |
| **Next-day hook** | The run is +1 and the freeze counter moves ("freeze in 4 days"). Tomorrow brings new quests. | The next milestone's countdown. The next week's quest set freezes Monday. | BODY's kept week (18 MP). The PB to beat. |

### A.1 Today's three

There are three slots, picked once per life day and frozen as one `QUEST_SET` row (key `quests:<day>`, sink NONE, `receipt` = `QuestSet`). The first call of `ensureQuestSet(userId, day)` that day wins (P2002 is swallowed). Callers are:
- `settleMomentum` on the Today, /you, Train › Exercise and /skills/life renders
- the 20:00 dispatcher pass
- `openChestCore`

A day with no set has no chest. That happens only when none of those ran all day.

**Pick order:** PLAN, then BODY, then TASK, so no template fills two slots.

**PLAN slot.** The first of these that exists wins:

| # | Kind | Source | Title | Done when |
|---|---|---|---|---|
| 1 | `TEMPLATE` (practice) | A practice template (`RoadmapItem.kind = PRACTICE`, `templateId`) of a STARTED milestone of an ACTIVE roadmap, expected today by its rule (or a `TARGET:n/W` with count left this week). Lowest goal seat first, then lowest item `ord`. | "Plan practice · <title>" | Today's instance of the template is DONE or DONE_LATE |
| 2 | `TEMPLATE` (step) | An open STEP template of a started milestone | "Plan step · <title>" | Same |
| 3 | `CHECKPOINT` | An open CHECKPOINT week quest in this week's frozen set (it appears from 80% of the window) | "Take the checkpoint · <label>" | A SELF log for that `itemLineageId` today |
| 4 | `ADD` | This week's ADD quest, not done | "Add 1 card to <Domain>" | At least 1 `IDEA_CREATE` today in its `domainIds` |
| 5 | `REVIEWS` | No roadmap, or nothing above; reviews due ≥ 1 | "Review min(10, due) cards" (count frozen) | At least that many `REVIEW` rows today |
| 6 | `IDEA` | Nothing else | "Capture one idea" | At least 1 `IDEA_CREATE` today |

**BODY slot**

| # | Kind | Source | Title | Done when |
|---|---|---|---|---|
| 1 | `TEMPLATE` | A personal template with category EXERCISE that is due today, not #play | "<title>" | Its instance is DONE or DONE_LATE, or a walk is linked to it (§A.6) |
| 2 | `MOVE 20` | This week's BODY effort minutes are under 150 | "Move 20 min" | A live `WORKOUT` row today with session minutes ≥ 20, or an EXERCISE instance done with receipt minutes ≥ 20 |
| 3 | `MOVE 10` | The week's 150 is already met | "Move 10 min" | The same rule, at 10 minutes |

**TASK slot ("the big one").** The candidates are personal templates that meet all of these:
- kind TASK or HABIT
- due today or overdue: a must, a planned day ≤ today, a deadline ≤ today, or a habit expected today
- not in the inbox
- not #play, and with no `autoMetric`
- not EXERCISE category
- not the PLAN or BODY slot's template

Each candidate is scored:

`score = priceTask(projected, rawBefore 0).raw × 1.5 (compulsory) × 1.3 (DEADLINE ≤ today)`

The highest score wins. Ties go to the smaller `roll(secret, "quest:v1|<user>|<day>|<templateId>")`. Done means today's instance is DONE or DONE_LATE; a minimum version does not count. With no candidate, the slot falls back to `ANY 2`, "Finish any 2 tasks", done at 2 live FULL `TASK` rows today.

**Swaps.**
- The TASK slot can be swapped once a day, or twice with Second look. The PLAN slot can be swapped once with Scout.
- A swap writes `quests:<day>:swap:<SLOT>:<n>`, whose receipt is the replacement. The latest swap row for a slot wins.
- The next candidate comes in the same order, skipping every quest already shown today.
- A slot whose quest is done cannot be swapped.

**Completion is derived on every read** from rows of that life day. An undone tick, which is possible for 10 minutes, reopens its quest.

### A.2 The chest

**States**
- *locked* ("n of 3")
- *ready* (3 of 3 done, no `CHEST` row for the day)
- *opened*

**Opening.**
1. The user taps Open, which calls `openChestCore(userId)`.
2. It re-derives readiness and refuses if the chest is not ready.
3. It writes one `$transaction`:
   - `lifeLockOp`
   - the `CHEST` row (key `chest:<day>`, `sink TRACK` when it pays XP, otherwise `NONE`; `track` = the TASK quest's track, or CRAFT for `ANY 2`; `rawXp` NULL; `receipt` = `{v:'chest-1', u1, u2, tier, item, xp, mp, freeze, cosmetic, pity, sinceRare}`)
   - when it pays MP, `mintLifeMasteryOps(LIFE_CHEST, key mp:LIFE_CHEST:<day>)`, trimmed to the chest pool (§A.10)
4. A double tap gets P2002, rolls back and returns the stored row.

**Auto-open.** A ready chest of a past day is opened by the next `settleMomentum` with `day` = that day and `receipt.auto = true`. It reveals on the next Today open as "Yesterday's chest". A chest is never lost.

**Undo.** An opened chest stays even if a quest is undone afterwards. Ticks are self-reported, so voiding would add machinery without closing any hole that a false tick doesn't already open.

**Drop table.** One roll `u1` picks the tier and `u2` picks the rare item.

| Tier | Weight | Contents | Per chest |
|---|---|---|---|
| COMMON | 60 | +20 XP | 60.0% |
| UNCOMMON | 28 | +8 MP | 28.0% |
| RARE · FREEZE | 12 × 40% | +1 freeze; with a full bank it becomes +8 MP | 4.8% |
| RARE · HOARD | 12 × 35% | +40 XP and +12 MP | 4.2% |
| RARE · COSMETIC | 12 × 25% | One of 12 cosmetics: 6 flame skins (Ember, Cobalt, Verdant, Aurora, Obsidian, Gilt) and 6 chest trims (Oak, Iron, Jade, Ivory, Coral, Star). The first not owned, from a seeded start; when all are owned, +8 MP. | 3.0% |

**Pity.** After 9 opened chests in a row without a RARE, the 10th is RARE. `sinceRare` is derived from the `CHEST` rows. The pity chest still rolls `u2` for its item.

**Fair winds.** On a day the PLAN quest is done, 4 weight points move from COMMON to RARE.

**Seeds.** `u1 = roll(secret, "chest:v1|<user>|<day>|1")` and `u2 = …|2`. The day fixes the contents: re-opening, a retry or an auto-open all give the same chest.

**Expected value.** Analytic, without pity: 13.68 XP + 2.74 MP per chest. In the sim: 13.6 XP + 3.30 MP per chest, 18.4% rare including 4.2% from pity, and 2.14 chests a week for the realistic player.

**Chest MP pool.** At most 28 MP a life week comes from chests. MP beyond the pool turns into XP at 1 MP = 4 XP, so a drop is never empty.

### A.3 The momentum streak and freezes

**What counts.** A momentum day is a life day on or after launch with net momentum units > 0:
- **+1** for each row with `countsForStreak` that is a `TASK` (any personal tick, including the minimum version, #play and a self-completing habit), a `WORKOUT` (a walk of ≥ 10 min) or a `CHECKPOINT` (a checkpoint log)
- **−1** for each `UNDO`

UNDO rows only ever negate TASK and WORKOUT rows. The SQL is `streak.ts`'s `CASE` restricted to those sources. Reviews alone do not count: this is the life streak shown on Tasks. The daily streak on /you is unchanged, except that WORKOUT and CHECKPOINT rows now count there too.

The fold is `foldMomentum` (pure; the sim's reference is G8). It walks the days from `MOMENTUM_LAUNCH_DAY` to today and is never stored.

| Rule | Value |
|---|---|
| A run | Consecutive momentum days ending today, or yesterday while today is still empty. Today never breaks a run. |
| Earning a freeze | +1 after every **10** momentum days since the last earn. Held days don't count toward the 10. |
| Other freezes | +1 from a chest FREEZE. +1 per kept BODY week with Recovery, dated that week's Sunday. |
| Starting bank | 1 freeze on the launch day (`MOMENTUM_START_FREEZES = 1`), so the mechanic shows on day one |
| Most held | **2**, or 3 with Spare flame. An earn beyond the bank is lost. A chest freeze with a full bank becomes 8 MP. |
| Automatic use | A past day with no momentum action, while a run is alive and a freeze is banked, is *held*: it bridges the run but doesn't count. One freeze per day. |
| Recording yesterday | Yesterday can be recorded until today ends (`RECORD_WINDOW_DAYS`). If it is, the freeze "spent" on it comes back, because the fold is derived. The sheet says "A freeze covers Tue · record Tue's tasks to keep it." |
| Run milestones | At 7, 30, 100 and 365 days, a T2 `momentum-run` Seal, once ever per threshold (`momentum:<n>`) |

In the sim, the realistic player earns 21.1 freezes a year, spends 18.5, and breaks the run **2.30 times a year** (p90: 5). Freezes forgive single misses, not lapses (pin C12).

### A.4 Chains (the task combo)

The review combo's idea, made proof against batch ticking.

**What qualifies.** The same completions a crit can land on (§A.5).

**A link.** A qualifying completion links to the previous live one today when the gap between their `occurredAt` satisfies:

`0.5 × est_eff(this task) ≤ gap ≤ est_eff(this task) + 45 min` (60 min with Quick link)

In words: "you started this within 45 minutes of finishing the last." Ticking a batch at once fails the lower bound. A 90-minute task done straight after another links (gap 100 is in [45, 135]); a 15-minute task ticked 3 minutes after the last does not (G4).

**The multiplier.** `links` = the previous link count + 1, or 0 when broken. `M = 1 + 0.03 × min(links, 5)`, which tops out at ×1.15 (7 links and ×1.21 with Long chain). M multiplies raw inside the knee.

**Derived.** The chain comes from the day's live TASK rows, which are already in the tick's read wave (`readDayTaskEvents`). An undone link drops out for later ticks; a paid receipt is never repriced.

**Shown** as receipt factor `M`, "chain 3 · ×1.09", on the T0 mark ("Chain 3"), and as a chip on the Momentum card.

**Worth.** About +1.7% of raw for the realistic player. It is a nudge to start the next thing, not an income, and its budget is small on purpose.

### A.5 Crits

| | |
|---|---|
| Which completions qualify | A `TASK` row with mode FULL and K > 0, from a manual tick, Again, the step tick that completes the task, or record-yesterday. Never #play (sink NONE), study-linked (K 0), the minimum version, `auto:*`, a make-up, or a work board (no row). |
| Chance | p = **0.08**, or 0.10 with Lucky strike. At most **3** crits a life day; later rolls count as misses. |
| Effect | X = **×2**, or ×2.5 with Critical mass. It multiplies raw inside the knee: `raw = round1(B·E·T·C·D·V·K · S · M · X)`, `xp = kneePay(rawBefore, raw)`. |
| Roll | `u = roll(secret, "crit:v1|<userId>|<day>|<normTitle>|<k>")`, where k = 1 + the live qualifying completions earlier today of templates with this `normTitle` |
| Re-rolls | Undo then re-tick: the same k gives the same u and the same outcome. Archiving and re-creating the same title gives the same normTitle and the same u. Only a different task gets a different roll. |
| Receipt | Factor `X` {label "crit", value 2, note "sealed roll 0.031 under 0.080"}. Any receipt carrying S, M or X is `v: "life-2"`; others stay "life-1", byte for byte. |
| Feedback | T0 gold mark "Crit ×2 · +24". The board's paid-vs-projected notice (TodayBoard.tsx:907) ignores the difference X explains. |
| EV (sim) | 9.72% of finished tasks (0.08 rising to 0.10 once Lucky strike is learned), 0.63 a day, +7.4% task XP after the knee |
| Worst single raw | 58.8 × 1.04 × 1.08 × 1.15 × 1.21 (7 links) × 2.5 = **229.8**. As the day's first completion it pays g = 183.2. The knee and the depth cap remain the brakes (G10). |

### A.6 Exercise pay

A logged walk (`ExerciseSession`) writes a `WORKOUT` row: sink TRACK, track BODY, and it goes **through the daily knee** like a task. There is one curve per day, so splitting a session pays exactly what one session pays (pin C10). The dropped rules ("per-session saturating pay", "workout XP outside the daily cap") stay dropped.

| Step | Rule |
|---|---|
| Speed | v = km ÷ h, clamped to [2, 7.5] km/h. A session faster than **9 km/h** is recorded but pays nothing ("faster than a walk"). |
| Grade | tan(min(angle, 15°)) |
| Intensity | ACSM walking: VO₂ = 0.1·s + 1.8·s·grade + 3.5 (s in m/min); MET = VO₂ ÷ 3.5. LIGHT if MET < 3, MODERATE if MET < 6, VIGOROUS otherwise. |
| Minutes | min(duration, 180) per session. A session under 5 min pays nothing. |
| Pay weight w | LIGHT 0.5 (0.75 with Warm-up), MODERATE 1, VIGOROUS 2. W_session = minutes × w. |
| Day curve | X(W) = **35 · (1 − e^(−W/70))**, with W capped at 240 a day. A = 40 with Endurance; H = 60 with Quick breath. The day's cap is X(240) = **33.9** raw (38.7 with Endurance). |
| Session raw | round1((X(W_before + W_s) − X(W_before)) × 1.05 (Stride) × 1.2 (Peak, on a day the BODY quest is done) × 2 (Body spark crit: 8%, key `excrit:v1\|<user>\|<day>\|<k>`)) |
| Paid | `kneePay(rawBefore, raw)`, under `lifeLockOp` + `freshnessGuardOp`, the same as a tick |
| Kept week | WORKOUT rows count for BODY like TASK rows: days, raw, and effort minutes = minutes × the WHO weight (LIGHT 0, MODERATE 1, VIGOROUS 2). The receipt's `B` factor is 5, 10 or 20 by intensity, so `effortWeightOfB` reads it unchanged, with category EXERCISE. |
| Streak | `countsForStreak` = minutes ≥ 10 (streak-check :113 already allows "a workout counts when its writer says so") |
| Backdating | Pays only when the session's day is today or yesterday. Older sessions are records only, with no ledger row; the form says "Logged · walks pay only today or yesterday". |
| Delete | A delete on the same life day the session was logged writes `UNDO` rows for its WORKOUT and PR rows (`undo:<eventId>`), then deletes the record. A later delete removes the record and keeps the pay ("Paid Tue · the XP stays"). |
| One payment for one walk | The form pre-selects "Counts as: <title>" when a personal EXERCISE template is due today and not done. That completes its instance (`source auto:workout`, `workoutId`), whose TASK row has new pay mode `SESSION` (K = 0, "paid by the walk", `countsForStreak` true). If the user already ticked it today, the walk tops up: raw = max(0, raw − the tick's raw), with the note "tops up Walk (ticked 07:12, 11.4)". |

Goldens:

| Walk | MET | Intensity | W | Raw |
|---|---|---|---|---|
| 45 min, 3.75 km, flat (5 km/h) | 3.38 | MODERATE | 45 | **16.6** |
| 30 min, 3 km, 5° (6 km/h) | 8.36 | VIGOROUS | 60 | **20.1** |
| 30 min, 2 km, flat (4 km/h) | 2.90 | LIGHT | 15 | **6.8** |

In the sim, a walk averages 19.8 raw and 19.5 XP. BODY is kept in 61% of weeks at 3.9 walks a week.

### A.7 Personal bests

| | |
|---|---|
| Metrics (WALK) | Longest distance, longest duration and most climb (one session each); fastest pace on a session ≥ 2 km (lower is better); most km in a life week |
| Debounce | Needs ≥ 3 earlier paid sessions. Must beat the previous best by ≥ 3%, or by 0.15 min/km (9 s) for pace. At most one PB per metric per life week; a better one later that week updates silently. At most 2 PB moments per session, the biggest gains first. |
| Pay | A `PR` row: sink TRACK, track BODY, **+15 XP** (22 with Pacer), `rawXp` NULL (outside the knee), `qty` = the value, detail "distance 8.4 km (was 7.9)", `sourceId` = the session, key `pr:WALK:<metric>:<weekKey>`. No MP; `LIFE_PR` stays reserved. |
| Moment | The existing T2 `pr` detector fires (snapshot.ts:251 reads PR rows; celebration-detect.ts:844; dedupe `pr:<key>`). |
| Rate (sim) | 11.6 PB moments a year |

### A.8 The roadmap: milestones, checkpoints, plan weeks

All roadmap pay is written by `momentum-server.ts` `settleMomentum` (milestones and checkpoints) and by the week judge (plan weeks). No `roadmap-*` module gains a ledger writer, so balance-horizon pin 3g holds unchanged. The payers only read `RoadmapMilestone`, `RoadmapReading` and `RoadmapQuestWeek`.

| | Milestone reached | Checkpoint taken | Plan week kept |
|---|---|---|---|
| Trigger | `reachedDay` set (confirmed: roadmap-measures.ts `reachActionOf`, never cleared), `startedDay` not null and ≤ `reachedDay`, `reachedDay` ≥ launch. Milestones "held when you began" (reachedDay at accept, roadmap-server.ts:7280) never pay. | The first SELF log (`SELF\|CHECKPOINT\|i:<lineage>\|n:*`) of an item of a started milestone, logged on or after launch. Pays for **taking** it, never for the score, because the score is self-reported. | A `RoadmapQuestWeek` with `finalizedAt` set, ≥ 2 quests and every quest done (≥ 80% with Forward camp). At most 1 paying week per roadmap per life week. |
| XP | **120** (150 with Summit fire) to `Roadmap.track`, outside the knee | **40** (60 with Waymarker) | **30** (37.5 with Surveyor) |
| MP | **50**, `LIFE_MILESTONE`, at most 2 paying in any rolling 30 days; beyond that a decision row with 0 | **12**, `LIFE_CHECKPOINT`, at most 2 per rolling 30 days | **10** (12 with Trail rations), `LIFE_PLAN_WEEK`, in the judge pool after the kept tracks |
| Once | `ms:<lineageId>` and `mp:LIFE_MILESTONE:<lineageId>`. The lineage is stable across re-plans and "Start again". | `cp:<itemLineageId>` and `mp:LIFE_CHECKPOINT:<itemLineageId>` | `pw:<questWeekId>` and `mp:LIFE_PLAN_WEEK:<questWeekId>` |
| Row | `MILESTONE`: sink TRACK, `rawXp` NULL, dated `reachedDay`, `countsForStreak` false | `CHECKPOINT`: sink TRACK, dated the log's day, `countsForStreak` **true** (it is an action) | `PLAN_WEEK`: sink TRACK, dated the week's Sunday, written by the judge in the run that writes the WEEK rows |
| Undo | None. A reach is never cleared; a user reset is the only exception and deletes readings, not ledger rows. | None. Logs are append-only. | None. Results are written once. |
| Moment | **T3 `milestone`** (below) | T2 `checkpoint` | T2 `plan-week` |
| Extra | Summit chest: a rare chest (`chest:ms:<lineageId>`, `u1` forced RARE). Its MP comes out of the chest pool. | | |

The milestone's MID goal still closes and pays as it does today (6 or 0, statedForMilestone, 2 per 30 days). A practice-backed milestone therefore pays 50 + 6 MP.

**The milestone ceremony (T3 Ascension, AscensionCurtain):**
- kicker "Milestone reached"
- title = the milestone title
- epithet = the aim, verbatim
- lines: "Stage 2 of 5 · 34 days", "Confirmed on your readings, 12 Oct"
- grants: "+120 XP → Craft", "+50 MP", "Pathfinder · 412 of 600 to point 5"
- primary "Done", secondary "See the roadmap"

Exact amounts are always shown (celebration-types `honestyProblem`). It plays on the first render after the reach is written:
- The action refreshes the page.
- `settleMomentum` runs its writes inside the existing before/after pattern (`captureSnapshot` → write → `detectCelebrations`, celebrations.ts:9-16).
- It persists what lane D's detectors return (`milestone:<lineageId>`, skipDuplicates).

The same applies to checkpoint, auto-opened chest and perk moments.

### A.9 The seeded roll

`roll(secret, key)` is the first 52 bits of HMAC-SHA256(secret, key) ÷ 2⁵².

| | |
|---|---|
| Secret | Env `MOMENTUM_SEED_SECRET`, ≥ 16 characters, the **same on every deployment** (they share one database, like the VAPID keys). Missing: a fixed public salt plus a logged warning; nothing else changes. Server only, in `src/lib/momentum-roll.ts`. |
| Keys | `crit:v1\|user\|day\|normTitle\|k` · `excrit:v1\|user\|day\|k` · `chest:v1\|user\|day\|1\|2` · `quest:v1\|user\|day\|templateId` (tie-break) |
| Stored | `u` (and `u2`) goes on the receipt it decided. Changing the secret never changes a past result. |
| Golden (G5) | `roll("golden-secret", "crit:v1\|u1\|2026-10-19\|dishes\|1") = 0.672194971195` |
| Forbidden | `Math.random` and any unkeyed draw in `momentum*.ts`, celebration modules (celebration-check :225) and srs. review-check :423's ban on `VARIANCE_`, "Strong roll" and `RewardBand` holds: the chest uses `ChestTier`. |

### A.10 Life MP: every reason, amount and cap

| Reason | Amount | Pool / limit | Change |
|---|---|---|---|
| `LIFE_WEEK_KEPT` | **18** per kept track (BODY 21 with Iron lungs) | Judge pool | was 1.5 |
| `GOAL_SHORT` | 1 | Judge pool, 2 a week | unchanged |
| `LIFE_PLAN_WEEK` | **10** (12) | Judge pool, after the tracks | new |
| `LIFE_FULL_DAY` | 0.5 | Judge pool, minted last (inert: Duty off) | unchanged |
| **Judge pool cap** `LIFE_MP_WEEK_CAP` | **91** a life week (13/day) | Mint order: Shorts at close, then BODY, DUTY, CRAFT, CARE, then plan weeks by seat, then full days | was 8 |
| `LIFE_CHEST` | the drop | **Chest pool 28** a life week; overflow becomes XP at ×4 | new |
| `LIFE_MILESTONE` | **50** | 2 paying per rolling 30 days | new |
| `LIFE_CHECKPOINT` | **12** | 2 paying per rolling 30 days | new |
| `GOAL_MID` / `GOAL_LONG` | 6 / 20 | 2 per 30 days / 1 per 91 days | unchanged |
| `LIFE_PR` | — | reserved, never minted | unchanged |

The most the judge pool can be asked for is 2 + 4 × 18 + 3 + 12 = 89 ≤ 91, so **no kept track is ever trimmed**. With full days, 92.5 > 91, so the cap trims full days and second plan weeks only (re-pinned 3b).

---

## B. The Life skill tree

### B.1 Branches

| Branch | Colour token | Behaviour | Earns from |
|---|---|---|---|
| **Discipline** | `--life-discipline` (amber) | Finishing tasks | XP of `TASK` rows (net of UNDO) whose template is neither EXERCISE category nor a roadmap item's template |
| **Pathfinder** | `--life-pathfinder` (teal) | Following the plan | XP of `TASK` rows of roadmap item templates (`RoadmapItem.templateId`: practices and steps), plus `MILESTONE`, `CHECKPOINT` and `PLAN_WEEK` rows |
| **Vitality** | `--life-vitality` (rose) | Moving | XP of `WORKOUT` rows (net of UNDO), `PR` rows, and `TASK` rows of EXERCISE-category templates |

Chest XP counts for no branch: luck does not buy skill. Every XP counts for exactly one branch.

### B.2 Life Skill Points (LSP)

**Derived, never stored.** For each branch:
1. Sum its XP per life week (Mon–Sun), counting at most the weekly cap.
2. counted XP → points: the n-th point costs **S·n(n+1)/2** branch XP in total.
3. Points are never lost.
4. available = points − Σ cost of the perks owned now.

| | Discipline | Pathfinder | Vitality |
|---|---|---|---|
| S | **90** | **40** | **22** |
| Weekly counted cap | 700 XP | 260 XP | 320 XP |
| Points 1–5 at | 90 · 270 · 540 · 900 · 1,350 | 40 · 120 · 240 · 400 · 600 | 22 · 66 · 132 · 220 · 330 |
| Point 10 at | 4,950 | 2,200 | 1,210 |
| Point 20 (the whole branch) at | 18,900 | 8,400 | 4,620 |

Sim, realistic player, mean LSP earned:

| Branch | Day 30 | Day 90 | Day 180 | Day 365 | First perk |
|---|---|---|---|---|---|
| Discipline | 4.2 | 8.1 | 11.9 | 17.7 | day 3 |
| Pathfinder | 3.6 | 7.6 | 11.5 | 17.1 | day 6 |
| Vitality | 4.8 | 8.7 | 12.6 | 18.6 | day 4 |

- Perks owned: 9.9 (day 30), 15.8 (day 90), 20.4 (day 180) and 24.1 (day 365) of 27.
- No seed completes a branch before day 270. 14 of 200 complete Vitality within the year.

### B.3 The perks

There are 27 perks, 9 per branch, each branch costing 20 LSP.

| Tier | Cost each | Unlocks after spending in the branch |
|---|---|---|
| I | 1 | 0 |
| II | 2 | 2 |
| III | 3 | 6 |
| Capstone | 5 | 12 |

The default values reproduce the un-perked rules exactly (`lifeModsOf(∅)`).

**Discipline**

| Code | Name | Tier | Cost | Effect | Applied in |
|---|---|---|---|---|---|
| D_STEADY | Steady hand | I | 1 | FULL task raw ×1.04 (factor S) | life-grade `priceTask` momentum arg, from today-board `planCompletion` |
| D_LINK | Quick link | I | 1 | Chain window 45 → 60 min | momentum.ts `chainLinks` |
| D_SWAP | Second look | I | 1 | Task-quest swaps 1 → 2 a day | momentum-server `swapQuestCore` |
| D_SPARE | Spare flame | II | 2 | Freezes held 2 → 3 | momentum.ts `foldMomentum` |
| D_LUCK | Lucky strike | II | 2 | Crit chance 8% → 10% | momentum.ts `critOf` |
| D_CHAIN | Long chain | II | 2 | Chain cap 5 → 7 links (×1.15 → ×1.21) | momentum.ts `chainMult` |
| D_FROG | Frog eater | III | 3 | The TASK quest's completion raw ×1.15 | `priceTask` S, given the frozen quest |
| D_DEEP | Deep work | III | 3 | DEMANDING and SEVERE task raw ×1.08 | `priceTask` S |
| D_MASS | Critical mass | Cap | 5 | Crits pay ×2.5 | momentum.ts `critOf` |

**Pathfinder**

| Code | Name | Tier | Cost | Effect | Applied in |
|---|---|---|---|---|---|
| P_PRACTICE | Practice makes | I | 1 | Roadmap practice and step task raw ×1.06 | `priceTask` S |
| P_WAYMARK | Waymarker | I | 1 | Checkpoint XP 40 → 60 | momentum-server `settleMomentum` |
| P_SCOUT | Scout | I | 1 | The PLAN quest may be swapped once a day | `swapQuestCore` |
| P_SURVEY | Surveyor | II | 2 | Plan-week XP ×1.25 (30 → 37.5) | life-weeks `planWeeks` |
| P_RATIONS | Trail rations | II | 2 | Plan-week MP +2 (judge pool) | life-weeks `planWeeks` |
| P_WINDS | Fair winds | II | 2 | On a day the PLAN quest is done, chest RARE weight +4 (from COMMON) | momentum.ts `chestDrop` |
| P_CAMP | Forward camp | III | 3 | A plan week with ≥ 80% of its quests done counts as kept | life-weeks `planWeeks` |
| P_SUMMIT | Summit fire | III | 3 | Milestone XP 120 → 150 | `settleMomentum` |
| P_CHEST | Summit chest | Cap | 5 | Each paid milestone also opens a rare chest | `settleMomentum` |

**Vitality**

| Code | Name | Tier | Cost | Effect | Applied in |
|---|---|---|---|---|---|
| V_WARM | Warm-up | I | 1 | LIGHT walking pay weight 0.5 → 0.75 | momentum.ts `sessionWeights` |
| V_STRIDE | Stride | I | 1 | Walk raw ×1.05 | exercise-server pay |
| V_PACER | Pacer | I | 1 | PB XP 15 → 22 | exercise-server PB |
| V_BREATH | Quick breath | II | 2 | Day curve H 70 → 60 (a 30-min moderate walk: 12.2 → 13.8) | `exerciseDayRaw` |
| V_SPARK | Body spark | II | 2 | Walks can crit: 8%, ×2 | exercise-server pay |
| V_IRON | Iron lungs | II | 2 | A kept BODY week pays +3 MP (judge pool) | life-weeks `planWeeks` |
| V_RECOVER | Recovery | III | 3 | A kept BODY week earns +1 freeze (bank max unchanged) | `foldMomentum` (reads BODY WEEK rows) |
| V_ENDURE | Endurance | III | 3 | Day curve A 35 → 40 (day cap 33.9 → 38.7) | `exerciseDayRaw` |
| V_PEAK | Peak | Cap | 5 | Walks on a day the BODY quest is done pay ×1.2 | exercise-server pay |

**Caps that hold however the perks are combined:**
- Every MP perk adds to a capped pool (Iron lungs and Trail rations to the judge pool; Fair winds and Summit chest to the chest pool). The worst-case income in §C therefore does not move with perks.
- XP perks inside the knee are eased by it.
- Lumps outside the knee (milestone, checkpoint, plan week, PR) are limited by their counts.

### B.4 Learning and respec

**Learn.** `buyPerkCore(userId, code)` runs one `$transaction`:
1. `lifeLockOp`
2. a guard that divides by zero unless the count of `PERK` + `RESPEC` rows still equals the count read
3. the `PERK` row: sink NONE, `qty` = cost, `detail` = code, key `perk:<code>:<epoch>`, where epoch = the number of RESPEC rows

It refuses when:
- the perk is already owned
- the tier gate is not met
- not enough LSP are available

**Effective from** the PERK row's `occurredAt`. A tick prices with the perks owned now; the freeze fold uses the perks owned on each day.

**Respec.**
- Free, once per **30** life days.
- Writes a `RESPEC` row (`respec:<day>`).
- Owned perks = the PERK rows after the latest RESPEC, so every point comes back at once.
- Points can be re-learned immediately.

**Capstones.** Learning a capstone is a T3 `capstone` moment, at most 3 ever (`capstone:<code>`). Every other perk is a T2 `perk` Seal (`perk:<code>:<epoch>`).

### B.5 The Life tab on /skills (344 px first)

**Route.** `/skills/life`, a static segment, so the `[attribute]` route never sees it. "Life" is the **first** chip in `PathChips` (PathChips.tsx:29), ahead of the 13 attribute chips; the same `.pchip`, with `aria-current`.

**Layout at 344 px** (card content box 278 px):
- `ShellTitle` eyebrow "Skills", title "Life".
- **Branch switch**: a 3-way segmented control. Each segment is 86 × 44 px with a gap of 10 px; the label is the branch name and a badge shows available points.
- **Branch header**:
  - "5 to spend · 12 earned"
  - "Next point: 1,712 / 1,890 task XP"
  - one thin bar toward the next point. This is a branch-lifetime bar, not a daily meter.
  - the weekly-cap note "This week counts 640 of 700"
- **Tier ladder**: 4 tiers stacked, using the same visual grammar as PathLadder.
  - Each perk is a full-width card (min-height 64 px): name, effect line in exact numbers ("Crits pay ×2.5 instead of ×2"), cost badge.
  - State: learned ✓, or a **Learn · 2** button (44 px tall, ≥ 88 px wide), or locked with the reason ("Spend 2 in Discipline first" / "3 more points").
- **Footer**: "Respec all · free" (secondary, 44 px) or "Next respec in 18 days" (disabled, with the reason).
- Touch targets measured on the element (≥ 44 px); chip row gaps ≥ 8 px, row gap ≥ 16 px. Text ≥ 12 px.


---

## C. Balance

`npx tsx scripts/momentum-sim.ts --seeds 200`. The output below is from 2026-10-12.

### C.1 The model

**The realistic player** (PERSONA in the sim; 200 seeded users, one year from a Monday):
- 4% of days are blank, and a blank day repeats with probability 0.35, because lapses cluster.
- 62% of the other days are good days.
- 6.45 life tasks a day from balance-horizon's 17-row basket. Its walk and gym rows become logged walks; meds stays as an INTRO BODY task.
- 3.90 walks a week of 25–60 min at 4.3–6.2 km/h; 40% of them at 2–8°.
- One roadmap: a milestone every 21–42 days (11.1 a year), its checkpoint in the last week with probability 0.9 (7.5 a year), and its plan week fully done 72% of weeks (41.1 a year).
- Today's three done on 65.4% (task), 61.0% (plan) and 55.8% (body) of days.

**Knowledge:**
- The frame-1 knowledge income is balance-horizon's: 25 reviews a day at level 10.5 plus 10 ideas a week mastering, **61.964 MP/day**.
- The year-one model runs balance-horizon's library: 10 NUMERIC ideas a week over 3 Fields × 4 Domains, every due review passed.

**The rules** are imported from the paying modules (priceTask, kneeG/kneePay, trackLevel, characterLevel, xp.ts, mastery.ts). Only the new constants live in the sim.

### C.2 Headline numbers

| Measure | Today | With momentum |
|---|---|---|
| Worst-case life MP (frame 1) | 1.76 MP/day = 2.85% | **21.75 MP/day = 35.1%** (judge 13 + chest 4 + Mid/Long 0.62 + milestone and checkpoint 4.13) |
| Committed life MP (both pools full, a milestone every 4.5 weeks) | 1.21 = 1.95% | **19.03 = 30.7%** |
| Whole emblem pool (310,099 MP) | 13.71 y knowledge only · 13.33 y worst | **10.49 y committed · 10.15 y worst** (≥ 10 y holds) |
| Realistic year-one life MP | ≈ 7 MP/week (3.6 kept tracks × 1.5 + goals) | **95.8 MP/week = 22.1% of 61.96/day** (p10 21.3%, p90 22.8%) |
| …against the knowledge model's own year-one MP | — | 60.1 MP/week, so life is **1.59×** knowledge in year one: 5.1× in weeks 1–13 and 1.31× in weeks 14–52, because knowledge MP is back-loaded |
| Life MP by source (per week) | — | kept weeks 64.2 · milestones 10.7 · plan weeks 9.2 · chest 7.1 · Iron lungs 1.6 · checkpoints 1.7 · Mid 0.8 · Short 0.5. The judge pool was never trimmed; the chest pool filled in 1.0 week a year. |
| Life XP per week | steady basket ≈ 406 (4 × 101.5) | **496 (weeks 1–13) → 513 (weeks 14–52)**, against knowledge Domain points 301 → 503 |
| Character level, day 90: spread · focused · life only | 8 · 10 · 8 | **9.2 · 10.5 · 8.9** (every seed in [8, 11]) |
| Character level, day 365 | 19 · 25 · 16 | **19.5 · 25.5 · 16.7** (every seed in [19, 26]; life only [16, 17]) |
| Tracks at day 365, B/D/Cr/Ca | 10/9/10/8 (basket) | 7.5 / 9.5 / 11.7 / 8.2. BODY kept only 61% of weeks; CRAFT carries roadmap goal depth. |
| Chest | — | 2.14 a week · EV 13.6 XP + 3.30 MP · rare 18.4% (pity 4.2%) |
| Crit | — | 9.72% of finished tasks · +7.4% task XP |
| Chain | — | +1.7% raw |
| Walk | pays 0 | 19.8 raw, 19.5 XP each · 11.6 PBs a year |
| Momentum run | — | breaks 2.30 times a year · 21.1 freezes earned, 18.5 spent |

**Why the level pins hold.** A track's level is `min(⌊√xp/7⌋, 1 + ⌊1.25√kept + goal depth⌋)`. The depth cap binds the realistic player at both 13 and 52 weeks, so the extra life XP shows up as XP and LSP, not as levels. The +0.5 at day 365 comes from CRAFT's roadmap goal depth (MID goals), which exists today. The steady basket with crit and chain EV is 101.5 × 1.091 ≈ 110.7 XP per track per week, still inside balance-horizon assertion 4's [80, 130].

**"≈ one third".** The pin the user named is balance-horizon assertion 1, the worst case against committed knowledge income. Momentum sets that at **35.1%**, and committed life sits at 30.7%. The realistic player earns 22% of that figure, but in year one life is the larger MP source (1.59×). Pushing the realistic figure to 33% would put the worst case near 53% and shorten the pool to about 9.0 years (§H, decision 1).

### C.3 Sim pins (C1–C12, all pass)

C1 worst ∈ [30%, 36%] · C2 horizon ≥ 10 y · C3 committed ∈ [26%, 34%] · C4 realistic year one ∈ [18%, 30%] and above the knowledge model's year-one MP · C5–C7 every seed's levels inside L1–L3's bands · C8 chest EV ∈ 10–20 XP, 1.5–4 MP · C9 crit rate ∈ [7.5%, 10.5%] · C10 splitting a walk is neutral · C11 first perk within 3 weeks and no branch complete before day 270 · C12 the run breaks 1–4 times a year.

### C.4 Goldens (momentum-check pins `src/lib/momentum.ts` to the sim's G1–G10)

| # | Golden |
|---|---|
| G1 | `walkMet(5, 0°)` = 3.381; (4, 0°) = 2.905; (6, 5°) = 8.357; (12 → 7.5, 0°) = 4.571 |
| G2 | The three walks in the §A.6 table: 16.6 / 20.1 / 6.8 raw |
| G3 | X(60) = 20.1470 = X(30) + (X(60) − X(30)). X(∞) = 33.86. 12 km/h is refused. |
| G4 | `chainMult(0..7)` = 1.00, 1.03, 1.06, 1.09, 1.12, 1.15, 1.15, 1.15. Links: (3, 15) false, (20, 15) true, (70, 15) false, (100, 90) true. |
| G5 | `roll("golden-secret", crit key)` = 0.672194971195; the chest key gives 0.913302589789 |
| G6 | `chestDrop`: u1 0.10 → COMMON 20 XP; 0.70 → UNCOMMON 8 MP; 0.95/u2 0.20 → FREEZE (bank full → 8 MP); 9 without a rare → RARE HOARD; all cosmetics owned → 8 MP |
| G7 | `lspThreshold(D, 1..5)` = 90, 270, 540, 900, 1350; `lspOf(D, 899)` = 3, `lspOf(D, 900)` = 4 |
| G8 | Fold: 10 active, day 11 empty, 2 active → run 12 (held 1). Day 4 empty with no freeze → run 9 (1 break). Today empty → run 12. |
| G9 | 27 perks, 20 LSP per branch, gates {I 0, II 2, III 6, Cap 12} |
| G10 | `RAW_WORST_CASE_MOMENTUM` = 229.8 |

---

## D. Data model

### D.1 Why the existing tables suffice

**ActivityEvent** already gives everything momentum needs:
- the unique `(userId, dedupeKey)` claim
- a `receipt` Json for structured decisions
- `sink`/`track`/`xp` for pay
- `countsForStreak` for the run
- an index `(userId, source, day)` for every read here

There is precedent for decision rows in it: WEEK, MP_MINT, FREEZE_*, REFLECTION.

**MasteryLedgerEntry** takes new free-string reasons with no migration.

Perk ownership, LSP, the freeze bank, the chest pity count and the cosmetics owned are all folds over these rows. **No new table.**

### D.2 New ledger vocabulary (life-types `ActivitySource` and the keys)

| Source | Sink / track | xp, rawXp | Counts for streak | Dedupe key | Written by |
|---|---|---|---|---|---|
| `QUEST_SET` | NONE | 0, NULL | never | `quests:<day>` · `quests:<day>:swap:<SLOT>:<n>` | momentum-server |
| `CHEST` | TRACK (XP) or NONE | drop XP, NULL | never | `chest:<day>` · `chest:ms:<lineageId>` | momentum-server |
| `WORKOUT` (exists) | TRACK / BODY | kneed, raw | minutes ≥ 10 | `workout:<sessionId>` | exercise-server |
| `PR` (exists) | TRACK / BODY | 15, NULL | never | `pr:WALK:<metric>:<weekKey>` | exercise-server |
| `UNDO` (exists) | as the row undone | −xp, −raw | −1 unit | `undo:<eventId>` | exercise-server (same-day delete) |
| `MILESTONE` | TRACK / roadmap track | 120, NULL | never | `ms:<lineageId>` | momentum-server |
| `CHECKPOINT` | TRACK / roadmap track | 40, NULL | **yes** | `cp:<itemLineageId>` | momentum-server |
| `PLAN_WEEK` | TRACK / roadmap track | 30, NULL | never | `pw:<questWeekId>` | the week judge |
| `PERK` | NONE | 0, NULL, qty = cost | never | `perk:<code>:<epoch>` | momentum-server |
| `RESPEC` | NONE | 0 | never | `respec:<day>` | momentum-server |
| `NUDGE` | NONE | 0 | never | `nudge:<day>` | reminders-server (the claim) |
| `MP_MINT` (exists) | NONE | qty = MP | never | `mp:LIFE_CHEST:<day>` · `mp:LIFE_MILESTONE:<lineageId>` · `mp:LIFE_CHECKPOINT:<itemLineageId>` · `mp:LIFE_PLAN_WEEK:<questWeekId>` | the payers above |

**Contract edits these imply:**
- `NEVER_STREAK_SOURCES` gains QUEST_SET, CHEST, MILESTONE, PLAN_WEEK, PERK, RESPEC, NUDGE.
- `STREAK_SOURCES` gains CHECKPOINT.
- PR stays out of both lists, so it never counts, because its writer always writes `countsForStreak: false`.
- `ReceiptFactor.key` gains `S | M | X`.
- `PayMode` gains `SESSION` (K = 0, "paid by the walk").
- `LIFE_MP_REASONS` gains LIFE_PLAN_WEEK, LIFE_CHEST, LIFE_MILESTONE, LIFE_CHECKPOINT.
- `CAPPED_REASONS` gains LIFE_PLAN_WEEK.
- New `CHEST_REASONS = ['LIFE_CHEST']` with `LIFE_CHEST_WEEK_CAP = 28`.

**Every reader of TRACK rows already counts the new rows correctly:**
- `readLifeLedger` sums every `sink TRACK` row (life-tracks-server.ts:79).
- The knee base, `readDayTotals`, sums `rawXp`. Only WORKOUT carries one, so lumps never move the knee.
- The freshness guard counts `source IN ('TASK','UNDO') OR rawXp IS NOT NULL`, so it sees WORKOUT and its UNDO, which is correct for the knee.
- One edit is needed: `planWeeks` reads `source IN ('TASK','UNDO')` (life-weeks-server.ts:212). Lane B adds WORKOUT (and its UNDO) with category EXERCISE.

### D.3 MasteryLedgerEntry

New reasons LIFE_PLAN_WEEK, LIFE_CHEST, LIFE_MILESTONE and LIFE_CHECKPOINT. Each is written only through `mintLifeMasteryOps` (an MP_MINT decision row, plus a ledger entry when the delta is > 0). A mint can never debit. A capped or windowed zero writes the decision row alone, for example "LIFE_MILESTONE · 2 paid in the last 30 days".

### D.4 The migration: `prisma/migrations/20261220000000_momentum/migration.sql`

```sql
-- Momentum (docs/life-plan/momentum.md §D.4): two nullable preference columns. Additive; no default, no backfill.
ALTER TABLE "public"."UserPrefs" ADD COLUMN "nudge" TEXT;      -- 'on' | 'off'; null = on (the evening momentum push)
ALTER TABLE "public"."UserPrefs" ADD COLUMN "flameSkin" TEXT;  -- a cosmetic id from momentum.ts COSMETICS; null = the default flame
```

- The schema gets `nudge String?` and `flameSkin String?` on `UserPrefs`, each with a `///` doc line.
- Readers are fail-soft: a missing column reads as null.
- **Before applying, check the Supabase project ref**: xtnl-idea, not XTNL_thesis.
- Apply before the lanes C and E deploy.

---

## E. UI (phones first: 344 px, card content box 278 px, every target ≥ 44 px measured on the element)

### E.1 Today: the Momentum card

It goes at the top of `.c1`, above the Duty card and the elsewhere strip (TodayBoard.tsx around :1757), with id `#momentum`. It renders only once launched.

```
┌ 278 ───────────────────────────────────────────┐
│ [▲ 12 days ]  ❄❄   2 of 3          [ ▣ chest ] │  row 1, 44 px: flame button 104 × 44 → Momentum sheet;
│                                                │  freezes 2 × 18 px glyphs (aria "2 freezes banked");
│ [▣ Task ✓ ] [◈ Plan ○ ] [◆ Body ○ ]            │  chest 44 × 44 (locked, ready with a lit edge, or opened).
│  Chain 2 · keep it within 45 min               │  row 2, 44 px: three pips, each 87 × 44 (gap 8); tap → Quest sheet.
└────────────────────────────────────────────────┘  row 3 (only while a chain is live): 12 px caption, not a target.
```

**The flame**
- A static SVG in the owned `flameSkin`. No loop, no shader (D10/H9).
- Hollow when the run is 0. A small ❄ mark when yesterday was held.

**Momentum sheet** (opened from the flame)
- a 5 × 7 grid of the last 35 days: active, held, missed or before launch
- "Run 12 · longest 41"
- "2 freezes · next in 4 momentum days"
- the rules in two lines: "Any task, a 10-minute walk or a checkpoint keeps it. A freeze covers a missed day automatically."
- the flame-skin picker: owned skins, each 44 × 44, saved to `UserPrefs.flameSkin`
- a link to /today/rules#momentum

**Quest sheet**
- Three 56 px rows, each with an icon, the full title, why it was picked ("Your biggest due task · ≈ 23 XP" — the row's own price, which is already on the board), state, **Go** (scrolls to the row, opens Train › Exercise or opens the roadmap), and **Swap** with the count left.
- Footer: "1 of 3 keeps your run · 3 of 3 opens the chest".

**Why this is not the dropped daily XP bar.** The ban (dropped.md; redesign.md:548; grading.md:99) is on a meter that totals XP toward a number, which makes the knee a target and invites grinding volume. Today's three is different:
- three named, binary actions picked from the user's own due list
- no XP total, no fill, no knee position anywhere on the strip
- one action keeps the run, so the other two are a bonus, not a quota
- missing the chest costs nothing
- the knee still appears only on receipts

### E.2 The chest sheet

A bottom `Sheet`:
- static chest art 120 × 120 in the owned trim
- a primary **Open** button, full width, 44 px
- an **Odds** disclosure: "60% · 20 XP · 28% · 8 MP · 12% rare (freeze 4.8%, hoard 4.2%, cosmetic 3.0%) · a rare at least every 10 chests · 3 chests since your last rare"

When opened:
- One reveal of ≤ 1.6 s.
- COMMON and UNCOMMON play a T1 chime in the sheet (kind `chest`).
- RARE plays the T2 Seal `chest-rare` inline, with exact contents: "+40 XP → Craft · +12 MP".
- A conversion says so: "Freeze bank full · +8 MP".
- The sheet then shows the next hook: "Run 12 → 13 tomorrow · freeze in 4 days".

**Still motion:** contents appear with no movement.

### E.3 The crit receipt

- **T0 mark**: the existing `mark()` with variant `crit` (gold numeral), "Crit ×2 · +24". Sound: the mark tone up a fifth, 1976 Hz.
- **ReceiptSheet**: a factor row "Crit ×2.00" with the note "sealed roll 0.031 under 0.080 · crits are 1 in 12, set per task per day". Chain row: "Chain ×1.09 · 3 links". Perk row: "Skills ×1.04 · Steady hand".
- The formula line includes S, M and X.

### E.4 The PB moment

T2 Seal `pr`, persisted. It is presented by ExerciseCard after the action returns its celebrations; this re-pins train-check :313/:314.
- eyebrow "Personal best"
- title "Longest walk"
- numeral 7.9 → 8.4 km
- amounts [+15 XP]
- what: Distance 8.4 km · Was 7.9 km (12 Sep) · Pace 9:48 /km

The card itself shows the pay line "Paid +17 XP · moderate · 45 effort min", or "Logged · pays only today or yesterday", or "Recorded · faster than a walk".

### E.5 The milestone ceremony

T3 per §A.8, using AscensionCurtain. Done (gold primary, 44 px). Under Still: no motes, and the text appears at once.

### E.6 The Life tab

See §B.5.

### E.7 The bell, the push and Settings

**The bell notice** (notifications.ts):
- `{id:'momentum', group:'Due', tone:'warn', title:'Momentum at risk', detail:'12-day run · any task, a 10-minute walk or a checkpoint keeps it', href:'/today#momentum'}`
- Shown from **18:00** life-local while the run is at risk (§F).
- When yesterday was held, a 'quiet' notice: `{id:'momentum-held', title:'A freeze kept your run', detail:'Tue was covered · 1 freeze left'}`.

**The push** (20:00):

| Field | Value |
|---|---|
| title | "Keep your 12-day run going" |
| body | "One thing keeps it: Walk 10 min · or any task. 8 h left." With a freeze banked: "A freeze would cover today, but one thing keeps it: Walk 10 min. 8 h left." |
| tag | `momentum-<day>` |
| url | `/today#momentum` |
| topic | `momentum` |

The body names the first undone quest, Body first because it is the quickest; "h left" counts to 04:00.

**Settings › Notifications** (new section; push-client.ts has no UI caller today):
- "Push on this device" — `enablePush` / `disablePush`. This also turns on the call-back reminders.
- "Evening momentum nudge · 20:00" — a toggle saved to `UserPrefs.nudge`, with the note "Only when your run is 2+ days and nothing that keeps it is done yet. At most once a day."
- Both rows are 44 px.

---

## F. The at-risk nudge

**Rule.** A user is nudged on life day *d* iff all of these hold:
1. Momentum is launched.
2. Local time is in **[20:00, 22:00)** Australia/Sydney (`LIFE_TZ`). After 22:00 nothing is sent, even if the scheduler was down.
3. `UserPrefs.nudge` is not `'off'`.
4. The user has ≥ 1 `PushSubscription`.
5. The run (fold, §A.3) is ≥ 2.
6. *d* has no momentum action yet.
7. No `NUDGE` row exists for *d*.

**Where.** `runReminderDispatch` (reminders-server.ts) keeps its call-back loop. It then calls `runMomentumNudges(now, deps)`. There is no second endpoint, and the scheduler and secret stay the same.

**The claim** (at most once, mirroring the call-back claim):
1. Return at once outside the window.
2. `SELECT DISTINCT "userId" FROM "PushSubscription"`.
3. For each user: read `UserPrefs.nudge`, then `loadNudgeFacts(userId, now)`. That is one grouped query for the fold's days (`(userId, source, day)` index) plus the frozen quest set, or `ensureQuestSet` if none.
4. If at risk: `prisma.activityEvent.create({ source:'NUDGE', sink:'NONE', day: d, occurredAt: now, countsForStreak:false, dedupeKey:'nudge:'+d })`. P2002 means another run claimed it, so skip.
5. Then `sendToSubscriptions(subs, payload, {topic:'momentum'})`.

Claim before send: a refusal or crash after the claim loses that nudge rather than risk sending two. It never un-claims. The run refuses (503) before claiming when VAPID is missing, as today. The dispatch report gains `nudges: {considered, atRisk, claimed, delivered}`.

**Fakes.** `DispatchDeps` gains `nudgeStore` (listSubscribedUsers, prefsOf, factsOf, claim) so push-check runs it without a database.

---

## G. The build plan

### G.0 Prerequisite and order

**Prerequisite.** The other builder's work-boards change is committed and pushed. It touches tasks.ts, settlement.ts, notifications.ts, life-weeks-server.ts, snapshot.ts, goals-server.ts, capture.ts and today/**. No lane starts before that. Each lane commits and pushes after its gates pass.

**Order**

```
L0 contracts (lead, serial)
  ├─► A  tasks: crit · chain · perks in the price          ┐
  ├─► B  body + the week judge                             ├─ in parallel
  └─► C  momentum server + actions                         ┘
          ├─► D  moments · bell · nudge                     ┐ in parallel
          └─► E  UI (Today card · chest · Life tab · Settings)┘
Integration (lead): migration applied → all checks → set MOMENTUM_LAUNCH_DAY → push.
```
B builds everything except the walk-to-habit link in parallel with A. The link (`completeLinkedCore`, a tasks.ts export that A adds) lands after A. C can stub D's detectors until D lands.

### G.1 Lanes and disjoint file ownership

| Lane | Owns (only these files) | Depends on | Adds or changes checks (critical pins only) |
|---|---|---|---|
| **L0 Contracts** (lead) | `src/lib/momentum.ts` (new: the sim's maths block, `MOMENTUM_LAUNCH_DAY`, the perk catalog, `QuestSet` types, the quest-scoring fn) · `src/lib/momentum-roll.ts` (new, server HMAC) · `src/lib/life-types.ts` · `src/lib/life-economy.ts` (LIFE_MP 18, the new reasons, cap 91, chest cap 28, windows) · `src/lib/streak-curve.ts` (source lists) · `src/lib/life-grade.ts` (`PAY_MODE_FACTOR.SESSION`, MODE_LABEL, factor-key types only) · `src/lib/celebration-types.ts` (kinds, tiers) · `prisma/schema.prisma` · `prisma/migrations/20261220000000_momentum/` · `docs/life-plan/dropped.md` · `docs/life-plan/data-model.md` · `package.json` · `scripts/momentum-check.ts` (new) · `scripts/balance-horizon.ts` · `scripts/character-check.ts` | work boards landed | **momentum-check**: G1–G10 against the module; the §A.10 table; key formats; no `Math.random` in `momentum*.ts`; `lifeModsOf(∅)` = defaults. **balance-horizon** re-pins (G.3). **character-check** cap and reason re-pins. Adds `momentum:check` to `life:check`, and `balance:horizon` + `tsx scripts/momentum-sim.ts` to it. |
| **A Tasks** | `src/lib/life-grade.ts` (`priceTask` momentum arg → S, M, X factors, describe/shownFactors) · `src/lib/today-board.ts` (`planCompletion`, projection with S and M, `taskEventInput`) · `src/lib/tasks.ts` (read wave: perks owned, frozen quest, roadmap template ids, chain state; crit roll) · `src/components/today/ReceiptSheet.tsx` · `scripts/life-grade-check.ts` | L0 | life-grade-check: without momentum, every golden byte for byte; S/M/X goldens; undo → re-tick gives the same crit; the 3-a-day cap; `RAW_WORST_CASE_MOMENTUM` 229.8 |
| **B Body and weeks** | `src/lib/exercise.ts` · `src/lib/exercise-server.ts` · `src/app/actions/exercise.ts` · `src/components/train/ExerciseCard.tsx` · `src/app/train/exercise/page.tsx` · `src/lib/life-weeks.ts` · `src/lib/life-weeks-server.ts` · `scripts/train-check.ts` · `scripts/exercise-style-check.ts` | L0 (and A's `SESSION` row writer: B calls a tasks.ts export A adds, `completeLinkedCore`) | exercise-style-check: pay goldens; split-neutral; > 9 km/h pays 0; > 1 day back pays 0; same-day delete reverses; link top-up. train-check re-pins :313/:314. A planWeeks fixture: WORKOUT rows keep BODY; Iron lungs 21; plan week minted after the tracks, never trimming one. |
| **C Momentum server** | `src/lib/momentum-server.ts` (new: `loadMomentum`, `ensureQuestSet`, `swapQuestCore`, `openChestCore`, `settleMomentum` (milestone, checkpoint, chest auto-open), `buyPerkCore`, `respecCore`, `loadLifeTree`, `loadNudgeFacts`) · `src/app/actions/momentum.ts` (new) · `scripts/momentum-server-check.ts` (new, fakes) | L0 | momentum-server-check: two concurrent `ensureQuestSet` write one row; a chest double tap writes one CHEST and one mint; auto-open dated the past day; a stale-count perk buy is refused; respec once per 30 days; milestone and checkpoint mints are idempotent and skip "held when you began"; work-board templates are never quest candidates |
| **D Moments, bell and nudge** | `src/lib/celebration-detect.ts` · `src/lib/snapshot.ts` (momentum parts: CHEST, MILESTONE, CHECKPOINT, PLAN_WEEK, PERK rows, the run) · `src/lib/notifications.ts` · `src/lib/reminders-server.ts` · `scripts/celebration-check.ts` · `scripts/push-check.ts` | L0, C | celebration-check: a detector and fixture for every new T2/T3 kind (its rule at :103-106). push-check: at most one nudge a day under concurrent runs; only run ≥ 2 and no action; toggle off is respected; 20:00–22:00 window; claim before send. |
| **E UI** | `src/components/today/TodayBoard.tsx` · `src/components/today/MomentumCard.tsx` (new) · `ChestSheet.tsx` (new) · `QuestSheet.tsx` (new) · `momentum.css` (new) · `src/app/today/page.tsx` · `src/app/today/rules/page.tsx` · `src/app/skills/life/page.tsx` (new) · `src/components/skills/LifeTree.tsx` (new) · `src/components/skills/PathChips.tsx` · `src/components/settings/SettingsView.tsx` · `src/components/settings/NotificationsSection.tsx` (new) · `src/app/settings/page.tsx` · `src/lib/celebrate.ts` (the `crit` mark variant) · `scripts/today-ui-check.ts` · `scripts/you-check.ts` | C (loaders and actions), A (receipt factors) | today-ui-check: card targets ≥ 44 px at 344; no XP total or meter on the strip; static flame; odds shown in the chest sheet. you-check: rules copy re-pins. Per the memory rule, screenshots of each changed element at 344 px first. |

New celebration kinds (L0 contract, D detectors, E presenters):

| Tier | Kinds |
|---|---|
| T0 | `crit`, `chain` |
| T1 | `momentum-kept` (`momentum-day:<day>`; replaces the `day-kept` chime when both fire on one tick), `quest-done` (`quest:<day>:<slot>`), `freeze-held` (`held:<day>`), `chest` |
| T2 | `chest-rare` (`chest:<day>`), `checkpoint` (`checkpoint:<lineage>`), `plan-week` (`planweek:<id>`), `perk` (`perk:<code>:<epoch>`), `momentum-run` (`momentum:<n>`) |
| T3 | `milestone` (`milestone:<lineageId>`), `capstone` (`capstone:<code>`) |

### G.2 The migration step

1. L0 writes the SQL and schema.
2. The lead applies it to **xtnl-idea**, after checking the project ref.
3. Then the lead runs `prisma generate`.
4. Then C and E may deploy.

Every read of the two columns is fail-soft.

### G.3 Existing pins to re-pin

| Check | Pin | Today | New |
|---|---|---|---|
| balance-horizon | 1 `LIFE_SHARE_CEILING` (worst ≤ x% of knowledge) | 0.03 (1.7626 ≤ 1.8589) | **0.36** (21.7531 ≤ 22.307) |
| balance-horizon | 2 horizon with worst-case life | 13.33 y ≥ 10 | **10.15 y ≥ 10** (unchanged bound) |
| balance-horizon | 3 "M5's most fills the cap exactly" | 4 × 1.5 + 2 × 1 = 8 | **2 + 4 × 18 + 3 + 12 = 89 ≤ 91**, and the kept tracks are never trimmed |
| balance-horizon | 3b, 3c | 11.5 > 8 | Full days and a second plan week are what the cap trims: 92.5 > 91; split runs equal one run |
| balance-horizon | 3e reasons list, worst 1.7626 | 5 reasons, no MILESTONE/QUEST | + LIFE_PLAN_WEEK, LIFE_CHEST, LIFE_MILESTONE, LIFE_CHECKPOINT (the name ban is lifted for exactly these); worst **21.7531** |
| balance-horizon | 3g no roadmap module writes the ledger | holds | **holds unchanged**: the payers live in momentum-server.ts and life-weeks |
| balance-horizon | 4 steady basket [80, 130] | 101.5 | unchanged (basket priced without luck). Add **4b**: with crit and chain EV, 110.7 ≤ 130. |
| balance-horizon | 5–9, 9b, L1–L6 | pass | unchanged. The sim confirms them for the realistic player (C5–C7). |
| character-check | :287 `LIFE_MP_WEEK_CAP` = 8; :288 4 × 1.5 + 2 × 1 ≤ cap; :1027 and :1033 (a 9th MP trimmed); :1608, :1639 | 8 | **91**; the trim fixtures move to the 90th and 92nd MP |
| character-check | :289-292 `CAPPED_REASONS` | 3 reasons | + LIFE_PLAN_WEEK |
| character-check | :293 and :1067-1071 LIFE_PR reserved and refused | holds | unchanged |
| character-check | `LIFE_MP.WEEK_KEPT` goldens | 1.5 | **18** |
| life-grade-check | :350 `RAW_WORST_CASE` 58.8 | 58.8 | unchanged; add `RAW_WORST_CASE_MOMENTUM` 229.8 |
| train-check | :313 "the card never marks, chimes, enqueues or celebrates" | | "the card marks the paid XP (T0) and presents only server-returned Seals" |
| train-check | :314 "the card reads no economy module" | | it may import `@/lib/celebrate` and `momentum.ts` display helpers only |
| you-check | :1986 "week quests pay nothing… add nothing to Today" | | "a single quest pays nothing; a fully kept plan week pays 30 XP and 10 MP; one plan quest a day is on Today" |
| you-check | :1076-1079 rules-page constants | | add the momentum constants |
| today-ui-check | :4058 «pays nothing» on open quest cards | | unchanged: single quests still pay nothing |
| celebration-check | :103-106 every T2/T3 kind has a detector and fixture | | the new kinds (D) |
| review-check | :135-140, :423, :427, :459 | | **unchanged**: reviews keep "no roll" |
| streak-check | :113 a workout counts only when its writer says so | | unchanged (≥ 10 min). The momentum fold lives in momentum-check. |
| settle-check, duty-* freeze pins | FREEZE_MAX 2 for Duty | | unchanged (Duty's freezes stay inert and separate) |

---

## H. Risks, and what is left out

**Risks**

| Risk | Mitigation |
|---|---|
| MP inflation: the emblem pool goes from 13.7 to about 10.2–10.5 years | The 10-year pin holds (worst 10.15 y). Every new MP source sits in a capped pool or a 30-day window. The levels are depth-capped. |
| Year-one life MP is 1.6× knowledge MP, so emblems early on are mostly bought by life | They are still gated by attributes, which come mostly from Fields. Idle decay keeps points moving. Decision 1 below. |
| Two streaks (the daily streak on /you, Momentum on Today) could confuse | Different names and glyphs; Momentum counts life only. redesign.md's "the streak is Character's" is consciously reversed for Today. Decision 2. |
| Self-reported ticks can farm chests and crits | They gain nothing a false tick doesn't already gain. Crits and chains are kneed; quests are frozen per day; chests are once a day. |
| Lazy mints (milestone, checkpoint, chest auto-open) depend on a render or the dispatcher | Pay can arrive late but is never lost. It is idempotent, and the rows are dated the real day. |
| Plan weeks need `finalizeQuestWeeks` | It runs in `runRoadmapStep`, gated only on `settlementWritesEnabled` (settlement.ts:1000), not on Duty. Dev never pays plan weeks, which is correct given the shared DB. |
| Secret drift between deployments | Results are stored on rows. The secret is documented next to the VAPID keys in reminders.md. |
| Focused level at a year touches 26, the top of L2 | Caused by roadmap goal depth (MID), which exists today, not by momentum. Watch it; if it breaches, lower `GOAL_DEPTH_CAP` for the ROADMAP metric to 1. |
| The other builder edits the same files | G.0: no lane starts until work boards lands. Ownership is disjoint afterwards. |
| The Today card adds vertical height (≈ 110 px) | It is a single card, and collapses to row 1 once 3 of 3 are done and the chest is opened. |

**Deliberately left out**
- Buying freezes or streak repairs with MP or money.
- Any loot or roll on reviews, ideas or knowledge emblems.
- Leaderboards and social features.
- Exercise kinds beyond the walk: run, gym, strength sets and e1RM (dropped.md stands). The MET table makes adding them a constant, not a redesign.
- Heart-rate effort; Health Connect.
- A morning push. More than one nudge a day.
- Perk ranks, prestige or a sink after the tree is complete (about 15 months for the realistic player). Deferred until there is data.
- Life emblem effect kinds in the knowledge pool (dropped.md stands).
- Duty debt.
- A daily XP bar (still dropped; §E.1).
- Chest pity as a purchasable, and duplicate trading.
- The chest voiding on undo (§A.2).

---

## dropped.md changes (L0 applies these verbatim)

1. Replace the line "Any variance roll, loot, random boon or random freeze on life actions. Also new debuff kinds for life misses (FATIGUED/DOUBT reuse); debt is XP, not a modifier." with:

   > Any variance roll, loot, random boon or random freeze on life actions, **except exactly two seeded, derived mechanics (momentum.md, user decision 2026-10-12): the daily chest that Today's three opens, and task crits (8%, ×2, at most 3 a day).** Both are HMAC rolls over (user, life day, item) stored on the row they pay. They are reproducible and idempotent, cannot be re-rolled by undo, redo or reopening, and their odds are published. Reviews still never roll (xp.ts rollRewardVariance stays 1). Also new debuff kinds for life misses (FATIGUED/DOUBT reuse); debt is XP, not a modifier.

2. Append to the line about "daily-board's tracks with max(1, …) floors, milestones paying +10 XP outside the cap…":

   > Reinstated narrowly by momentum.md §A.8: a roadmap milestone (120 XP, once per lineage), a checkpoint taken (40 XP, once per item) and a kept plan week (30 XP) pay outside the daily knee, with MP limited to 2 per 30 days (milestones, checkpoints) or the weekly pool (plan weeks). None adds track depth.

3. Append to the line "Per-session saturating workout pay … Also workout XP outside the daily cap …":

   > Still dropped. Exercise pays through one per-day curve X(W) = 35·(1 − e^(−W/70)) inside the daily knee (momentum.md §A.6), so splitting a walk pays exactly what one walk pays.

4. Append to the line "A daily XP bar or '100 full-rate' target on the board, which reads as a quota":

   > Today's three (momentum.md §E.1) is three named binary actions with no XP total or meter, and one of them is enough to keep the run.

---

## Decisions the lead should confirm with the user

1. **What "≈ one third" means.** As specced, the worst case is 35% of committed knowledge income, as balance-horizon measures it, and the 10-year emblem horizon holds (10.15 y). The realistic player is at 22% of that figure, yet life is 1.6× knowledge MP in year one. If the user wants the *realistic* player at 33%, scale `WEEK_KEPT_MP` to 27 and the pools by 1.5. The worst case then rises to about 53% and the horizon to about 9.0 y, so pin 2 must drop to 9 y.
2. **Two streaks.** Momentum (life only, on Today) sits next to the existing daily streak (/you, study plus life). The alternative is one streak: freezes and the nudge move to the daily streak, and a review alone keeps "Tasks".
3. **Chest undo policy.** An opened chest stays even if a quest is undone. The alternative is voiding with reversal rows, which is more machinery.
4. **Exercise backdating.** Only today and yesterday pay; older logs are records. Walks can currently be backdated up to a year.
5. **Chains.** Kept as a small nudge (+1.7%). Dropping them removes factor M and one perk pair (Quick link, Long chain).
6. **Freezes independent of Duty.** If Duty ever launches, its FREEZE rows and the momentum fold must be unified first.
7. **`MOMENTUM_SEED_SECRET`** must be set identically on every deployment before launch.
