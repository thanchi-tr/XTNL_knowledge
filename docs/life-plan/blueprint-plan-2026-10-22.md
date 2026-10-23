# XTNL: phased build plan to bridge the gap to the self-growth blueprint

Source: `C:\Users\Thanc\OneDrive\Desktop\XTNL-idea\docs\life-plan\blueprint-2026-10-22.md` (its Decisions section is still empty), plus the five gap analyses run against `main` at `9b2a3f5` on 2026-10-22. This is a planning document. No code or data was changed to produce it.

---

> **Order changed by the user (2026-10-22):** Stage 2 (low-friction logging, P6–P8) now comes after Stage 5. Build order: Stage 0 ✅ → 1 → 3 → 4 → 5 → 2 → 6 → 7 → 8 → 9. Stages 3 and 4 go first. Decisions taken so far are in the blueprint's Decisions section.

## 0. How to read this

- There are **33 phases (P0 to P32)** in **10 stages**, listed in dependency order. Each phase builds, tests and ships on its own, with **at most one additive migration**. Six phases carry a migration, and three of those are optional.
- **Foundations come first.** The derived attribute model (P1), the vocabulary (P2) and the curve (P3) come before anything that pays into attributes. The credits ledger (P16) comes before the Mall (P18 and P19). The rest-token bank (P21) and the Duty launch (P22) come before the streak multiplier (P29) and condition decay (P28).
- **Where to start:** P0 → P1 → P2 → P3. P0 needs no decisions. P1 to P3 need D1, D2, D5 and D6 (section 3).
- Phases marked *independent* can be moved earlier. Stage 6 (Duty) and Stage 7 (Proof) can swap places.

### Rules for every phase (definition of done)

1. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code (AGENTS.md).
2. Gates: `tsc`, `life:check`, `ui:check` and every check the phase touches. Run `scripts/balance-horizon.ts` and `scripts/momentum-sim.ts` whenever a pay path, level or quest changes.
3. **Migrations:**
   - hand-authored and additive;
   - rehearsed on the local Docker DB;
   - applied with `prisma db execute` then `migrate resolve`, only after confirming the Supabase ref is **xvlkujmtdcpaoxdftgpl (xtnl-idea), not XTNL_thesis**;
   - followed by regenerating the Prisma client.
   
   Proposed timestamps, after `20261228000000_crm`: `20261229000000_avatar_targets` (P4), `20261230000000_competencies` (P5), `20261231000000_mall` (P18), `20270101000000_task_proof` (P23), `20270102000000_proof_qty` (P24), `20270103000000_strength_sets` (P25).
4. **Launch switches** are built inert: `null` in code, with an `XTNL_*` override outside production. Each is flipped **only on the user's direct go**. After a flip, re-pin the inert checks with an explicit injected `null`. New switches:
   - `TRACK_CURVE_LAUNCH_DAY`
   - `AUDIT_LAUNCH_DAY`
   - `CREDITS_LAUNCH_DAY`
   - `PROOF_LAUNCH_DAY`
   - `DECAY_LAUNCH_DAY`
   - `STREAK_LAUNCH_DAY`
   
   Existing switches: `ROADMAP_GOALS_LIVE`, `DUTY_LAUNCH_DAY`.
5. **Dev and prod share one database.** Rehearse writes only on local Docker with overrides. Never run a local server against prod. Every new write sits behind `settlementWritesEnabled` / `lifeWritesEnabled`.
6. **Mobile:** `docs/mobile-api.md`, the routes, `MOBILE_ENDPOINTS` and `scripts/mobile-api-check.ts` change together. On Android, update `DemoApi.kt` and `Models.kt`, bump `versionCode`, and keep the 132 JVM tests and `ScreensTest` green. Lay out both the Fold main screen (704x932 dp) and the cover screen.
7. **UI:** screenshot at 344 px first, then 375, 932 and 1440, and send the screenshots.
8. **Receipts are never repriced.** Each pay change gets a new formula version: the proof gate (P23) is `life-3` and the streak (P29) is `life-4`. Whichever ships first takes `life-3`.
9. Commit and push after each phase. Record each decision in the blueprint's Decisions section as the user makes it.

---

## 1. Phase overview

| # | Phase | Blueprint | Depends on | Migration | Switch | Decisions | Effort |
|---|---|---|---|---|---|---|---|
| P0 | Guardrails, rules copy, ops checks | 4.1, 3.3a, 3.1a copy, 4.5 | – | – | – | (D26, D27 copy only) | S |
| P1 | Status panel: five attributes | 1.1 | P0 | – | – | D1, D2 | M |
| P2 | Vocabulary: Attributes / Traits / Emblems / Skills | 1.4 | P1 | – | – | D6 | S-M |
| P3 | Track curve Base·L^1.5 | 1.3 | P1 | – | TRACK_CURVE_LAUNCH_DAY | D5 | S / M with re-pins |
| P4 | Avatar targets | 1.2 | P1 | **avatar_targets** | – | D3, D4 | M |
| P5 | Competencies with hour tiers | 1.5 | P1, P2 | **competencies** | – | D7, D8, D9 | L |
| P6 | Done-now line ticks the open row; board keys | 5.1a | P0 | – | – | D33 | M |
| P7 | Phone ticks: minutes, Yesterday, knee note | 5.1b, 3.3a | P0 (token) | – | – | D34 | S-M |
| P8 | Cover widget, quick tile, offline queue | 5.1b | P7 | – | – | D34 | M-L |
| P9 | Daily quests = Musts, cap 5, binary strip | 2.3, 2.4 | P0 | – | – | D14, D15 | S-M |
| P10 | Weekly review run without Duty | 2.2 | P0 | – | – | D13 | S |
| P11 | Weekly audit and completion rate | 5.2a, 5.2b | P9, P10 | – | AUDIT_LAUNCH_DAY | D12, D15-D17, D38 | M |
| P12 | Audit: decaying block and delivery | 5.2c, 5.2e | P11 | – | – | D37 | M |
| P13 | Knowledge decay 72 h floor; phone "fading" | 3.1a | P0 *(independent)* | – | – | D23 | S |
| P14 | Roadmap Start: rehearse, then flip | 2.1 | P0 | – | ROADMAP_GOALS_LIVE | D10 | M |
| P15 | Main quest card, sprint step, GET /quests | 2.1, 2.2 | P14, P10 | – | – | D11, D12 | M |
| P16 | Credits ledger (derived) | 4.1, 4.2 | P0 | – | CREDITS_LAUNCH_DAY | D27-D29 | L |
| P17 | Retire the capital dividend | 4.2 | P16 | – | – | D28 | S |
| P18 | Mall catalog | 4.3 | P16 | **mall** | – | D30 | M |
| P19 | Mall buy, burn, undo | 4.4, 4.5 | P18 | – | – | D31, D32 | M |
| P20 | Duty M2 leftovers + Postgres rehearsal | 2.3, 3.2b | P9 | – | – | D18 | M |
| P21 | One Rest Token bank | 3.2c | P20 | – | – | D19 | M |
| P22 | Duty launch | 2.3, 3.2b | P21 | – | DUTY_LAUNCH_DAY | D18 | M |
| P23 | Deep-work minutes proof and timer | 2.6 | P3, P7 | **task_proof** | PROOF_LAUNCH_DAY | D20 | M |
| P24 | Pages proof | 2.7 | P23 | **proof_qty** | – | D21 | S |
| P25 | Strength volume *(optional)* | 2.7 | P23 | **strength_sets** | – | D21 | M-L |
| P26 | GitHub commits webhook *(optional)* | 2.7, 5.1c | P6, P23 | – | – | D21 | M |
| P27 | Health Connect walks and weight *(optional)* | 5.1d | P7 | – (optional) | – | D22 | L |
| P28 | Condition decay for skills and attributes | 3.1b | P1, P5, P22 | – | DECAY_LAUNCH_DAY | D24 | M |
| P29 | Global daily-quest streak multiplier | 3.2a | P9, P21, P22 (P23 for versioning) | – | STREAK_LAUNCH_DAY | D25 | M |
| P30 | Cognitive breaker: FATIGUED past 200 answers | 3.3b | P0 *(independent)* | – | – | D26 | S-M |
| P31 | Side quests | 2.5 | P6, P9, P11 | – | – | D35 | M |
| P32 | Next-week calibration | 5.2d | P11 (2 frozen audits), P9, P10 | – | – | D36 | L |

---

## 2. Phases

### Stage 0: Groundwork

#### P0 · Guardrails, rules copy, ops checks
- **Goal:** 4.1 (the rule that XP is never spent), 3.3a (name the knee as the fatigue breaker), 3.1a (publish the decay mapping), 4.5 (chance stays at two rolls). Record decisions as they come in.
- **Data:** none.
- **Cores:** no behaviour change. Add `scripts/status-check.ts` and `scripts/credits-check.ts`, both in the regex style of balance-horizon 3g's `LEDGER_WRITERS`:
  - `status-check` pins that there is no ledger writer in `avatar*`, `competency*` or `status-panel*`;
  - `credits-check` pins that `credits*` and `mall*` never import or write Domain points, sink-TRACK ActivityEvent rows or MasteryLedgerEntry.
  
  Both run now with no target files, so later phases fail fast.
- **Web:** new lines on `/today/rules`:
  - "XP is never spent; the Mall spends credits only."
  - "Fatigue breaker: full rate to 100 a day, half rate at 200, the day stops at 300."
  - "Daily decay = 0.105 / interval; 0.005-0.02 is L4-L6."
  - "Chance is limited to the chest and crits."
  
  Doc fixes:
  - the `vision.md` line "MP under 3% of knowledge income" becomes the 36% ceiling;
  - the headers of `actions/roadmap.ts`, `roadmap-goals.ts` and `roadmap-model.ts` say GOALS_MAX 3 and every TOPIC_* switch true.
- **Ops (user's hands, confirm only), before Stage 0 is pushed:**
  - Confirm `CRON_SECRET` is set for Vercel's Production environment. Stage 0 makes `/api/cron/degrade` fail closed, so without it every nightly run answers 503 and runs nothing: no idea forgets, no Domain or Field level is recomputed, no mastery decays, no weekly quota is judged, nothing is purged, and only Vercel's cron log shows it.
    - A recent 200 from `/api/cron/life` (18:15 UTC) in that log proves it is set, since that route already answers 401 without it.
    - If it is missing, add one (`openssl rand -hex 32`) and redeploy so the functions see it.
    - After the deploy, `GET /api/cron/degrade` with no header answers 401, not 503, and the next 00:00 UTC run in the cron log answers 200.
  - Set `MOBILE_API_TOKEN` in Vercel Production and in the app together (an app without it then gets 401), and check that `GET /api/mobile/v1/check` with no header answers 401. Until then the mobile routes, the paying writes included, stay open (`mobileAuthorized` lets every request through while it is unset); the code stays open on purpose so the phone keeps working. P8 needs it.
- **Mobile + Android:** none.
- **Re-pins:** you-check (rules page imports), the rules-page copy fixtures.
- **Acceptance:**
  - `life:check` and `ui:check` green, with both new checks in the chain;
  - the rules page renders at 344 px;
  - grep shows the doc drift fixed;
  - no balance-horizon or momentum-sim number moves.

### Stage 1: Attribute foundation

#### P1 · Status panel: five attributes
- **Goal:** 1.1. Capital as a reading only (D1); Knowledge as the cognitive attribute (D2).
- **Data:** none. Everything is derived from ActivityEvent, Field, Domain, and from Deal (stage WON, `closedAt`) for Capital.
- **Cores:**
  - New pure `src/lib/status-panel.ts`: `statusPanelOf(lifeView, knowledgeRow, avatar?, competencies?)` returns five rows (key, name, level, progress, cap, atCap, keptStreak, the last 8 weeks of pips, line). Avatar and competency inputs are optional (`null`) so P4 and P5 plug in later.
  - `capitalReadingOf(deals, month)` returns AUD won per month, with no level and no XP.
- **Web:** a "Status" card directly under the `/you` hero replaces the LifeTracks card:
  - Vitality = Body, Intellect = Knowledge, Craft, Duty, Care;
  - an optional Capital reading row.
  
  Track names stay (Body, Duty, Craft, Care) with the blueprint names as subtitles; this is a frozen contract. The 13-trait radar moves below the card.
- **Mobile + Android:**
  - API: `GET /api/mobile/v1/status` (`statusCore` in `mobile-api-cores.ts`).
  - Kotlin: `StatusPanel` models, `getStatus` in `HttpApi` and `DemoApi`, `ui/status/StatusScreen.kt` and a `Nav.kt` entry.
  - Layout: two panes on the main screen, one column on the cover.
- **Re-pins:** you-check sheet-order pins, tour-check data-tour anchors, a new mobile-api-check section. No balance pin moves; assert balance-horizon is unchanged.
- **Acceptance:**
  - the row levels equal the existing LifeTrackRow and KnowledgeRow values for the same fixture;
  - the Capital row writes nothing and reads only Deals with stage WON;
  - `/status` is unchanged across two reads;
  - screenshots at 344 px and on the Fold (both screens).

#### P2 · Vocabulary: Attributes / Traits / Emblems / Skills
- **Goal:** 1.4 (D6).
- **Data and cores:** none. The Prisma enum `Attribute` stays. The new table in P5 is named `Competency`, never `Skill`.
- **Web (copy only):**
  - the five axes are "Attributes";
  - the 13 radar traits are "Traits";
  - the `/skills` nav label becomes "Emblems" (the route stays);
  - the Life tree is "Life perks";
  - the tour copy is updated.
- **Mobile + Android:** the StatusScreen title becomes "Attributes". The app has no emblem screen.
- **Re-pins:** shell-check:134 (nav labels), goals-close-check:926 (Profile menu), tour-check, you-check (radar heading and aside), character-check §2.
- **Acceptance:** every re-pinned check is green, `/skills` and `/skills/life` still resolve, and screenshots of the nav, `/you` and `/skills` at 344 px.

#### P3 · Track curve Base·L^1.5 (launch switch)
- **Goal:** 1.3 (D5). The formula is per level: the XP from L-1 to L is Base·L^1.5, so the cumulative total grows like L^2.5.
- **Data:** none. Levels are derived on read.
- **Cores:** in `life-economy.ts`:
  - `TRACK_CURVE_BASE = 34.344`;
  - an integer threshold table: 34, 131, 310, 585, 969, 1,473, 2,109, 2,887, 3,814, **4,900 (L10)**, … 26,129 (L20) (each round(34.344 · Σk^1.5); L7 is 2,109.48);
  - `pointsLevel` and `xpForLevel` read the table when `TRACK_CURVE_LAUNCH_DAY` is reached.
  
  The kept-week cap stays. Domains are **not** re-curved.
- **Web:** the rules-page formula and the `trackLine` copy ("34 XP reaches level 1") follow the switch.
- **Mobile + Android:** none (they read levels).
- **Re-pins:**
  - character-check §1: add curve-on goldens (4900,52)=10, (4899,52)=9, (969,16)=5, (968,16)=4; the §4 line copy;
  - shell-check xpForLevel fixtures;
  - you-check:1076 (also import `TRACK_CURVE_BASE`);
  - celebration-check charOf;
  - balance-horizon 5-9b and L1-L3, and momentum-sim C5-C7, run with the switch both on and off. Watch C5's upper bound of 11.
- **Acceptance:**
  - with the switch `null`, every existing check is unchanged;
  - with the override on, balance-horizon and momentum-sim pass;
  - a local rehearsal shows the live account's levels only rise, and stay at or under the kept-week cap (at most 3);
  - no celebration plays on the flip.
- **Flip:** early, on the user's go. Above L10 the thresholds rise, and the live account is still low.

#### P4 · Avatar targets [migration `avatar_targets`]
- **Goal:** 1.2 (D3; D4 numbers can be entered after ship).
- **Data:**
  - New table `AvatarTarget`: attribute, label, metric, scope Json, unit, direction, baselineValue and baselineDay, targetValue and targetDay, sortOrder, archivedAt and timestamps.
  - Readings go into `RoadmapReading` under `AVATAR|a:<id>`. The weight target reads and writes `WeightGoal`; there is no second copy.
- **Cores:**
  - `avatar.ts` (pure): the metric catalog, the current value, the share of the way, on pace or not, and the words.
  - `avatar-server.ts`: loaders and the **only** writer. An edit archives the old row and adds a new one.
  - The degrade cron's "record roadmap readings" step writes COMPUTED readings.
- **Web:** Status rows read like "Weight 82.4 → 75 kg · 38% of the way · on pace". An "Edit avatar" sheet. A rules line: "targets pay nothing".
- **Mobile + Android:** `/status` includes the targets (additive fields).
- **Re-pins:** status-check now has targets; mobile-api-check; a fixture through every RoadmapReading reader (`roadmap-readings.ts:701/1924`, `momentum-server.ts:2017/2171`, `roadmap-server.ts:1691/1699`).
- **Acceptance:**
  - the migration is rehearsed locally, then applied after the ref check;
  - an `AVATAR|` row is ignored by every existing reader;
  - an edit leaves the archived history;
  - no ActivityEvent or MasteryLedgerEntry row comes from any avatar path;
  - MANUAL readings are labelled SELF.

#### P5 · Competencies with hour tiers [migration `competencies`]
- **Goal:** 1.5 (D7, D8, D9).
- **Data:** table `Competency` (name, attribute, kind PRACTICE|EXERCISE, fieldId?, archivedAt), plus nullable `TaskTemplate.competencyId` and `Roadmap.competencyId`. No backfill writes.
- **Cores:**
  - `competency.ts` (pure): tiers 0-100, 100-500, 500-2,000 and 2,000-10,000 h, with a meter within the tier.
  - Hours are derived from receipt minutes net of `undo:` rows. The fallback is `TaskInstance.minutes`, then `estMinutes`. An EXERCISE competency adds `ExerciseSession.durationMin`.
  - Labelled "≈ 42 h (task estimates, not timed)".
  - A tier-up is a T2 Seal `competency:<id>:t<n>`.
  - Work-board templates are refused. A template links to at most one competency.
  - Suggestions come from `normTitle` families with 10 or more completions.
- **Web:** `/you/skills` lists the Fields (by level and Field tier) and the competencies (by hours). A link control in the task sheet. Skill counts on the Status rows.
- **Mobile + Android:** `/status` gains `skills[]`. `/tasks/complete` returns an optional `competency{name, hoursAfter, tier, tierUp}`. A Skills pane in StatusScreen.
- **Re-pins:** status-check (no writer; work-board link refused), the task checks pinning the `tasks.ts` selects, the capture writes, the mobile-api template shapes, celebration-check kinds.
- **Acceptance:**
  - linking a template credits its history exactly once, and an undo nets out;
  - tier boundary goldens (99.9 h = T1, 100 h = T2, 2,000 h = T4);
  - zero XP or MP rows;
  - templates with `competencyId` null behave exactly as before.

### Stage 2: Low-friction logging

#### P6 · Done-now line ticks the open row; board keys; tap budget
- **Goal:** 5.1a (D33). This fixes the verified duplicate defect at `tasks.ts:1209`.
- **Data:** none.
- **Cores:** when `parsed.doneNow` is set and the server's own parse plus `duplicateOf` finds a personal TASK or HABIT that is due today (not done, no autoMetric, not on a work tab, not deferred), `createFromCapture` ticks it through `completeInstanceCore` with the typed minutes instead of inserting a new template.
- **Web:**
  - The sheet shows the chip "Ticks: Gym (Habits)"; one tap turns the line back into a new task.
  - Board keys: j/k or the arrows move, x ticks, m does the minimum, u undoes.
  - New `scripts/ingest-budget-check.ts`, added to `ui:check`: a tick is 1 interaction; a done-now line is open + one line + Enter; the Android quick check is at most 2 taps from the launcher.
- **Mobile + Android:** `/log` gets the fix for free; only its line wording changes.
- **Re-pins:** capture-server-check, capture-parse-check, today-ui-check, mobile-api-check (`/log` line), shortcut-check (the Chrome/Edge key list, the `g` sequences, IME).
- **Acceptance:**
  - `x gym 45m` with a due "Gym" habit ticks that habit with 45 min and creates no template;
  - with no match, the one-off is created as before;
  - work-tab and autoMetric rows are never matched;
  - existing duplicate one-offs are left as they are.

#### P7 · Phone ticks: minutes, Yesterday, celebrations, knee note
- **Goal:** 5.1b (API), 3.3a (mobile). This is a prerequisite for P23.
- **Prerequisite:** `MOBILE_API_TOKEN` is set (P0).
- **Data:** none.
- **API:**
  - `/tasks/complete` accepts an optional `minutes` (1-480), added to the allow list. The clamp is the drawer's: [0.5, 2] x the effective estimate.
  - `/check` gains the Yesterday lane.
  - The tick response gains `knee` once the day passes 200 raw.
- **Android:** minute chips (10/20/30/45/60/90) on the long-press sheet, a Yesterday section, tick celebrations shown, and a knee toast.
- **Re-pins:** mobile-api-check (allow list, shapes, doc), the JVM tests and `ScreensTest`, a `versionCode` bump.
- **Acceptance:**
  - the clamp golden matches the drawer's (an estimate of 30 reported as 90 counts 60);
  - unknown fields are still refused;
  - day `yesterday` books at T 1.00;
  - the knee note appears only past 200 raw.

#### P8 · Cover-screen widget, quick-settings tile, offline queue
- **Goal:** 5.1b (the rest) (D34).
- **Data:** none on the server. Android adds the `androidx.glance` and `work-runtime` dependencies.
- **Android:**
  - A Glance widget sized for the cover screen, listing today's open Must and Habit rows with a tick button.
  - A quick-settings tile that opens `/log?section=task`.
  - A WorkManager queue keyed by `clientId` for `/tasks/complete`, `/log` and `/work/done` only. Each queued item carries its **own life-day key**, never `today`.
- **Re-pins:** the Android tests; ingest-budget-check (a widget tick is 1 tap).
- **Acceptance:**
  - a tick queued offline before 04:00 and replayed after it books on its original day;
  - a replay with the same `clientId` writes once;
  - review answers are never queued.

### Stage 3: Daily quests and the weekly loop

#### P9 · Daily quests = Musts, cap 5, binary strip
- **Goal:** 2.3 (the cap) and 2.4 (D14, D15).
- **Data:** none.
- **Cores:**
  - `MUSTS_PER_DAY_MAX = 5` in `duty-economy.ts`.
  - The guard runs in `createTemplateCore` / `captureShapeOf`, `setCompulsoryCore` and recapture/edit.
  - The count is the most musts due on any of the next 7 life days (`mustsDueOn`), plus deadline one-offs due that day.
  - A 6th is saved as an ordinary task with the line "Five daily quests is the cap. Soften one first."
  - The warning shows from the 4th.
  - Days already over the cap keep their musts and show "n over the cap", with "Not a must" in the drawer.
- **Web:**
  - "Daily quests · 3 of 4 kept".
  - A 1/0 strip per must on Today and on `/today/habits`. DONE, DONE_LATE, DONE_MVV and EXCUSED count 1; MISSED counts 0.
  - The habit year view counts the minimum version as 1 (D15), with "n at minimum" beside it.
  - Pay (`priceTask`) is unchanged.
- **Mobile + Android:** `/check` gains `daily{kept,total,full,cap}`. The Must-lane header reads "Daily quests 3 of 4".
- **Re-pins:** duty-check (the new constant), capture-server-check, today-ui-check, the habit-history fixtures (½ → 1), mobile-api-check. balance-horizon 4/4b must be unchanged (the cap is on musts only).
- **Acceptance:**
  - the 6th must is saved as an ordinary task;
  - the 7-day look-ahead counts correctly;
  - no existing must is demoted;
  - the strip maps every status correctly;
  - momentum C8, C11 and C12 are unchanged.

#### P10 · Weekly review run without Duty
- **Goal:** 2.2 (D13).
- **Data:** none.
- **Cores:** split the steps in `rituals.ts`:
  - inbox to zero, goals check-in and next week run now;
  - "owed" and "rest days" stay hidden until `DUTY_LAUNCH_DAY`.
  
  The `weekReviewProgressKey` is unchanged.
- **Web:** `/today/week?view=run` is live.
- **Mobile + Android:** none.
- **Re-pins:** rituals-check (the live flag; the Saturday-Wednesday windows stay as they are), today-ui-check --strict.
- **Acceptance:** the run renders with `DUTY_LAUNCH_DAY` null, and the Duty-only steps are absent.

#### P11 · Weekly audit and completion rate (launch switch)
- **Goal:** 5.2a and 5.2b (D12, D15, D16, D17, D38).
- **Data:** none. The frozen copy is one append-only `ActivityEvent{source 'AUDIT', sink NONE, xp 0, dedupeKey 'audit:<YYYY-Www>'}`.
- **Cores:** pure `week-audit.ts` with `weekCompletionOf`, reusing `instanceOutcome`, `outcomesOf`, `targetUnits` and `heldDaysOf`.
  - **Denominator:** personal occurrences due in the week.
  - **Kept:** DONE, DONE_LATE, MADE_UP and DONE_MVV (each counts 1).
  - **Held days:** left out of the rate, shown as a count.
  - **Left out entirely:** autoMetric study tasks, #play and work tabs.
  - **Provisional** on read from Sunday 18:00 Sydney.
  - **Frozen** in the existing life cron just after the Monday 04:00 turn, behind `settlementWritesEnabled`.
  - The Wednesday judge stays the only verdict, and the audit never pays.
- **Web:** an audit card on `/today/week` ("87% · 26 of 30 · target 85%", a split by lane, the 3 weakest rows, "calibrating" for the first 2 weeks). The 85% appears **only here**.
- **Mobile + Android:** `/check` gains `week{rate,kept,due,target,status}`. A Week card on the Check tab.
- **Re-pins:**
  - settle-check §5 (the `audit` key in the `runLifeCron` JSON);
  - the life-day-check chain list;
  - a new week-audit-check;
  - today-ui-check and you-check fixtures;
  - mobile-api-check.
  
  **Do not touch** character-check §1d (lag 3) or the rituals-check windows.
- **Acceptance:**
  - the rate equals `/today/habits` for the same week;
  - one AUDIT row per ISO week, with none on dev or a Preview;
  - the row says "as of Mon 04:00";
  - no XP or MP is written.

#### P12 · Audit: decaying block and delivery
- **Goal:** 5.2c and 5.2e (D37).
- **Data:** none (`receipt.decaying` on the AUDIT row).
- **Cores:** "Decaying this week" is built only from existing reads:
  - traits against the 7-day FieldSnapshot;
  - Domain and Field drops;
  - habits whose strength fell or dropped a rung;
  - kept-week streaks that broke;
  - MP idle decay.
  
  The audit reads decay and never applies any.
- **Web:** a bell row and an Ask card, "Week audit ready", from Sunday 18:00 to Wednesday. No Duty gate, info tone, not counted in the badge. Each decay line links to its fix.
- **Mobile + Android:** `/check` week gains a decaying count and the top 3. A local WorkManager notification on Sunday at 19:00 Australia/Sydney (needs `POST_NOTIFICATIONS`, no FCM) opens `xtnl://app/week`.
- **Re-pins:** notifications/shell-check, push-check, mobile-api-check, the Android tests.
- **Acceptance:**
  - the notification fires at 19:00 Sydney even when the device is set to another zone;
  - the bell badge count is unchanged;
  - FieldSnapshot rows before 2026-10-11 are ignored without error.

#### P13 · Knowledge decay 72 h floor; phone "fading" *(independent)*
- **Goal:** 3.1a (D23).
- **Data:** none.
- **Cores:** `graceDays(L) = max(3, L-1)` in `xp.ts`. Only L2 changes (first loss moves from 1.65 to 3 days past due).
- **Web:** the Library outlook shows the λ mapping (the copy shipped in P0).
- **Mobile + Android:** `/check` gains `fading{domains[], forgetting}`. A "Fading" line on Check opens Review.
- **Re-pins:** forgetting-check: add an L2 pin; the L4 5-7, L6 14-17, L12 100-150 and L20 > 2000 pins stay. mobile-api-check.
- **Acceptance:** the first cron after the deploy writes **fewer or equal** FORGET rows than before for the same fixture, and no card at L4 or above changes.

### Stage 4: Main quests

#### P14 · Roadmap Start: rehearse, then flip `ROADMAP_GOALS_LIVE`
- **Goal:** 2.1 (D10).
- **Data:** none (the tables are applied).
- **Cores:** rehearse end to end on the local mirror with `XTNL_LIFE_JUDGE=1`: Start, practices on Today, week quests frozen, a milestone reached, the pay written. Fix what the rehearsal finds.
- **Web:** the Start button returns.
- **Mobile + Android:** none.
- **Re-pins:** roadmap-contract-check:372, today-ui-check:3468-3471, roadmap-server-check goalsLive, roadmap-ui-check copy. Run balance-horizon 1-m, 2-m, 3-m, 3f and 3g, and momentum-sim. They already price the roadmap.
- **Acceptance:**
  - the rehearsal is green;
  - existing ACTIVE plans stay START_LATER and nothing auto-starts;
  - production writes begin only after the flip, on the user's go.

#### P15 · Main quest card, sprint step, GET /quests
- **Goal:** 2.1 (UI) and 2.2 (sprints) (D11, D12).
- **Data:** none.
- **Cores:** one vocabulary: roadmap goal = "Main quest", milestone = "Milestone", week quests = "This week's sprint". Fix the TOPICS layer-1 focus in `roadmap-study.ts`. Short, Mid and Long goals stay as key results.
- **Web:**
  - A Main quest card in Today's side column (`AimCard` and `next-action.ts`).
  - A Sprint step in the review run.
  - A Sunday provisional sprint share, "provisional · final Wed 04:00".
- **Mobile + Android:** read-only `GET /api/mobile/v1/quests` (main quest, sprint rows, Today's three). A Quest card on Android.
- **Re-pins:** today-ui-check, rituals-check, roadmap-ui-check, mobile-api-check.
- **Acceptance:**
  - no verdict is written before Wednesday 04:00;
  - practices tick through the existing `/tasks/complete`;
  - Start and plan edits stay web-only.

### Stage 5: Credits and the Mall

#### P16 · Credits ledger, derived (launch switch)
- **Goal:** 4.1 (enforced) and 4.2 (D27, D28, D29).
- **Data:** none. Income is a fold, not stored rows.
- **Cores:**
  - New pure `credits.ts`: `CREDITS_LAUNCH_DAY`, a dated `creditModelOn(day)`, integer amounts.
  - Income: 10 per quest, +10 for 3 of 3, 15 per kept track week, 25 per plan week, 25 per checkpoint, 100 per milestone, goals 10 / 40×g / 120×g (with MP's windows).
  - `creditsEarned` folds QUEST_SET/DayFacts, CHEST, WEEK, PLAN_WEEK, MILESTONE, CHECKPOINT and `mp:GOAL` rows from the launch day.
  - Balance = earned − buys + refunds.
  - `credits-server.ts` `loadWallet`, cached on the life/activity tags.
- **Web:** a "+10 cr" price tag on the MomentumCard rows, a Credits line in the purse, and a Credits card on the rules page.
- **Mobile + Android:** `/check` gains `credits{balance,today}` (null when unreadable). Tick, answer and log responses return `credits{delta,balance}`. A wallet chip on Android.
- **Re-pins:**
  - credits-check;
  - a new CREDITS block in momentum-sim (realistic about 200 cr a week, about 260 with roadmap pay, worst case about 500);
  - mobile-api-check;
  - assert balance-horizon 1-m (21.7531), 2-m (10.15 y), 3-m and 3e-m are unchanged;
  - 3g: no roadmap module imports a credits writer.
- **Acceptance:**
  - with the switch `null`, the wallet is hidden and every check is unchanged;
  - fold golden: 3 quests + the 3-of-3 bonus + 2 kept track weeks = 70;
  - undoing a quest-completing tick lowers today's credits;
  - the fold writes no rows.
- **Flip:** after rehearsal, on the user's go. Credits start at 0 and are not backfilled. They can accrue while P18 and P19 are built.

#### P17 · Retire the capital dividend
- **Goal:** 4.2 (D28).
- **First:** a read-only query of the current capital balance, reported to the user before anything is hidden.
- **Changes:** hide `DividendLine` on `/you/stats` and stop computing the dividend. The table and its rows stay; `purchaseAugment` stays unwired.
- **Re-pins:** you-check (stats). balance-horizon 3g is unchanged.
- **Acceptance:** no CapitalLedgerEntry writes after the deploy, and the existing rows are intact.

#### P18 · Mall catalog [migration `mall`]
- **Goal:** 4.3 (D30).
- **Data:** `MallReward` (title 1-60, category, `price Int CHECK 1..100000`, note?, cooldownDays?, sortOrder, archivedAt?, timestamps), with an index on (userId, archivedAt).
- **Cores:** `validatePrice` and `priceHint` ("≈ 2 good days", or "calibrating" until there are 14 days of data). `actions/mall.ts`: create, edit, archive.
- **Web:** `/you/mall` (a wallet header, cards by category, an Add sheet, an Archived list). A line saying the app cannot block leisure: the Mall is a commitment device. **#play stays free.** "Mall" in the Profile menu and a new glyph.
- **Mobile + Android:** `GET /mall`, `POST /mall/rewards`, and a Mall pane under More.
- **Re-pins:** shell-check:134, goals-close-check:926, glyph-check, contrast-check, mobile-api-check.
- **Acceptance:** the migration is rehearsed, then applied after the ref check; the price CHECK refuses 0 and 100001; an archive keeps the row.

#### P19 · Mall buy, burn, undo
- **Goal:** 4.4 and 4.5 (D31, D32).
- **Data:** none. New ActivityEvent sources `MALL_BUY` and `MALL_REFUND` (sink NONE, xp 0, `countsForStreak` false); the dedupe keys are `buy:<clientId>` and `refund:<buyEventId>`.
- **Cores:** `buyRewardCore` copies `buyPerkCore`:
  - `lifeLockOp`, a row-count guard and one re-read when the guard is stale;
  - **no overdraft**, and a cooldown;
  - after an undo-driven drop, the balance shows as "−10 · earn it back" and purchases are refused;
  - a T2 Seal `mall-buy`;
  - the receipt `{v:'mall-1', …}`.
- **Web:** Buy, then Confirm. Undo for 10 minutes in the purchase history.
- **Mobile + Android:** `POST /mall/buy`, `POST /mall/undo`, a burn motion and haptics.
- **Re-pins:** the ActivitySource union and `DEFAULT_SINK`, momentum-check:357 (the exhaustive source record), streak-check (both sources left out of the counted list), celebration-check kinds, the glyph-motion licence, mobile-api-check.
- **Acceptance:**
  - two concurrent buys (Fold and desktop) cannot overspend;
  - a resend with the same `clientId` writes once;
  - a refund works only within 10 minutes;
  - credits-check confirms that no penalty path debits credits.

### Stage 6: Stakes (Duty)

#### P20 · Duty M2 leftovers and Postgres rehearsal (no flip)
- **Goal:** the groundwork for 2.3 and 3.2b (D18).
- **Changes:** `PROGRESS.md:118`, items 1-10:
  - run `duty-rehearse` on Postgres;
  - change the duty-check:377 null pin to "null or valid";
  - settle the capped-miss late tick of a deadline one-off;
  - refuse a freeze on a declared rest day;
  - the docs fixes;
  - scope the env override.
  
  Then a 10-day scripted-clock rehearsal on the local DB.
- **Re-pins:** duty-check, settle-check, duty-actions-check.
- **Acceptance:** `duty-rehearse` is green on Postgres, and nothing is written to prod.

#### P21 · One Rest Token bank
- **Goal:** 3.2c (D19). momentum.md decision 6 requires this before Duty launches.
- **Data:** none (the FREEZE_EARN and FREEZE_USE sources exist).
- **Cores:** settlement step 3 spends from the momentum freeze bank by writing FREEZE_USE, and the momentum fold counts that row. One owner for every spend. A token may excuse a day's missed musts, at most one per day; the bank is 2 (3 with Spare flame).
- **Web:** a "Rest tokens 2" chip on Today and `/you`, and a rules entry.
- **Mobile + Android:** `/check` `streak.restTokens` from the unified bank. This also fixes `freezes`, which always reads 0 today.
- **Re-pins:** momentum-check G6/G8, settle-check freeze fixtures, mobile-api-check.
- **Acceptance:** fold and settlement on the same day spend one token, not two, and the earned history is unchanged.

#### P22 · Duty launch (launch switch)
- **Goal:** 2.3 (stakes) and 3.2b (D18).
- **Changes:**
  - run `scripts/duty-launch.ts` as a dry run with the user (every must and the debt it would carry), then `--apply`;
  - set `DUTY_LAUNCH_DAY` to a Monday on or after the deploy;
  - optional copy "Willpower −4.2".
- **Mobile + Android:** `/check` gains `owed[]`, plus `POST /tasks/makeup` and make-up cards.
- **Re-pins:** duty-check:377, settle-check, duty-actions-check, rituals-check live cases, streak-check, today-ui-check (Time off, Owed card), mobile-api-check. balance-horizon 3b-m (92.5 > 91, trimmed).
- **Acceptance:**
  - no debt is charged for days before the launch day;
  - the caps hold (20 per miss, 3 open per task, 100 in total);
  - a make-up within 2 days pays ×0.85;
  - **new `scripts/spiral-check.ts`:** a persona that misses everything for 7 days loses at most 100 XP of debt and **0 credits**, and the review's owed and rest steps appear.

### Stage 7: Proof of work

#### P23 · Deep-work minutes proof and timer [migration `task_proof`] (launch switch)
- **Goal:** 2.6 (D20).
- **Data:** `TaskTemplate.proof TEXT NULL`, and table `TaskSession` (templateId, day, startedAt, endedAt?, minutes?, source, `clientId` unique) indexed on (userId, endedAt).
- **Cores:**
  - A FULL tick of a proof template with no minutes and no session is refused: "Log the minutes".
  - Counted minutes = min(reported, the wall-clock time since the session start or the previous tick, 480).
  - The minimum version is unaffected.
  - Receipts are `life-3`.
  - The default deep-work set (WORK, STUDY or CREATIVE at Demanding or above, personal board) is switched on **from a dry-run list the user approves**. A `#proof` capture tag.
  - From `PROOF_LAUNCH_DAY` **forward only**, `weekEffortOf` and `moveMinutes` count EXERCISE task minutes only when they were reported.
- **Web:** the tick on a proof row opens the minute chips; a timer chip on the row.
- **Mobile + Android:** `/tasks/complete` accepts `sessionId`, plus `POST /tasks/start` and `/tasks/stop`, a minutes sheet and a running timer.
- **Re-pins:**
  - life-grade-check (`clampMinutes`; the goldens stay), today-ui-check --strict, momentum-server-check, exercise-style-check, subtasks-check, mobile-api-check, capture-parse-check;
  - momentum-sim C11 (first perk within 3 weeks), the BODY kept rate (61%) and the BODY quest rate (55.8%);
  - balance-horizon 4/4b.
- **Acceptance:**
  - weeks before the launch are never re-judged;
  - a chore still ticks in one tap;
  - a session survives a reload and an app restart;
  - a 90-minute logged deep-work tick prices the same as the basket row.

#### P24 · Pages proof [migration `proof_qty`]
- **Goal:** 2.7, pages (D21).
- **Data:** `TaskInstance.proofQty FLOAT NULL` and `proofKind TEXT NULL`. AutoMetric gains `PAGES` (a TEXT column, so no SQL).
- **Cores:** "Done · 30 pages" chips. The capture token is `pg` or `pages`, **never `p`**. With `autoTarget` set, the tick is refused below the day's target.
- **Mobile + Android:** `/tasks/complete` accepts `proof{kind:'PAGES',qty}`.
- **Re-pins:** capture-parse-check (`30p` is still 30 minutes), life-grade-check, mobile-api-check.

#### P25 · Strength volume [migration `strength_sets`] *(optional; reverses the strength-grammar deferral)*
- **Data:** ExerciseSession kind `STRENGTH`, plus `sets JSONB NULL` and `volumeKg FLOAT NULL`.
- **Cores:** pays through a split-neutral day curve like X(W). A set over 2× the user's best for that exercise is recorded but unpaid until confirmed.
- **Re-pins:** balance-horizon (the basket's gym row), momentum-sim C5-C7, C10 and the BODY kept rate, exercise-style-check and momentum-check goldens.

#### P26 · GitHub commits webhook *(optional; narrowly reverses the 2026-10-01 M3 drop)*
- **Changes:**
  - `POST /api/ingest/github` **fails closed**: 503 while `GITHUB_WEBHOOK_SECRET` is unset; HMAC-SHA256 checked in constant time; body at most 256 KB; push events on the configured branch and author only.
  - Writes evidence rows `COMMIT` (sink NONE, `commit:<sha>`).
  - The `COMMITS` autoMetric completes a habit once a day at its normal price. Never pay per commit.
  - Late commits outside the record window are recorded only.
- **Re-pins:** life-day-check, capture-parse-check, board-check, today-ui-check, the rules page.

#### P27 · Health Connect walks and weight *(optional; narrowly reverses the M4 drop)*
- **Changes:**
  - A WorkManager job reads walking and hiking sessions and weight from Health Connect, then calls `POST /api/mobile/v1/exercise`.
  - It runs `logWalkCore` with the dedupe row `ingest:hc:<externalId>`; weight goes through the weigh-in core with source `import`.
  - **The backfill is record-only:** no pay and no personal bests.
- **Re-pins:** exercise-style-check, mobile-api-check, weight-capture-check, the Android permission-rationale tests.

### Stage 8: Decay, streak and fatigue

#### P28 · Condition decay for skills and attributes (launch switch)
- **Goal:** 3.1b (D24).
- **Pre-check:** confirm whether equipped emblems or the loadout re-check `requiredAttributeScore` on read. If they do, condition must not feed that path.
- **Data:** none.
- **Cores:**
  - Pure `skill-decay.ts`: condition = max(0.5, e^(−λ·max(0, idleDays − 3))), with λ 0.02 for physical (BODY / EXERCISE), 0.01 for cognitive (KNOWLEDGE / CRAFT) and 0.005 for other.
  - `idleDays` counts only from `DECAY_LAUNCH_DAY` and skips REST, SICK, VACATION and freeze days.
  - It applies to Status rows and competencies, and to the trait contributions only if the user chooses (D24b).
  - **It never touches levels, XP, hours, titles or the character level.**
- **Web:** "Body 82% · 12 days idle" on Status and Skills. The audit's decaying block (P12) gains this source.
- **Mobile + Android:** `/check` gains `skills[{name,condition,idleDays}]` for anything under 0.9.
- **Re-pins:** a new skill-decay check, you-check fixtures, balance-horizon 9 (only safer), L3; spiral-check is extended.
- **Acceptance:**
  - a fixture with no history before the launch shows 100%;
  - a 30-day vacation shows no decay;
  - the floor holds at 0.5;
  - owned emblems are never re-locked.

#### P29 · Global daily-quest streak multiplier (launch switch)
- **Goal:** 3.2a (D25).
- **Data:** none. The streak comes from FULL_DAY rows; the factor is stored in the receipt.
- **Cores:**
  - d = consecutive judged Full days. Rest tokens and held days bridge the streak without adding to it.
  - m(d) = min(1.2, 1.05^d), used as C on every FULL personal tick, one-offs included.
  - It does not apply to reviews or MP.
  - Receipts are `life-4`.
  - Per-habit streaks stay for display and habit strength.
- **Web:** a Today chip "Streak ×1.16 · day 3", a rules card, and the board projection reading the same d.
- **Mobile + Android:** `streak{days,multiplier,keptToday,restTokens}`, and "×1.16" in the tick line.
- **Re-pins:** balance-horizon 4/4b (expected about 110.8 and 121), life-grade-check RAW_WORST_CASE and RAW_WORST_CASE_MOMENTUM (re-derive, since one-offs now get C), momentum-check G10, the momentum-sim basket, today-ui and board `≈ N XP` fixtures. spiral-check: one miss resets to ×1.0 and a token bridges it.
- **Acceptance:** past receipts are unchanged, the projection equals the paid amount, and MP is unaffected.

#### P30 · Cognitive breaker: FATIGUED past 200 answers *(independent)*
- **Goal:** 3.3b (D26).
- **Changes:**
  - Apply the existing FATIGUED debuff (combo ceiling ×0.5 for 18 h) once per day, keyed by the day, when the day's REVIEW rows pass 200.
  - Published on the rules page and the Review hub.
  - `fatigued{until}` on `/review/queue` and `/check`.
  - No sleep rule.
- **Re-pins:** review-check, UI fixtures, mobile-api-check. The balance-horizon MP horizon only lengthens.
- **Acceptance:** 199 answers apply nothing; 200 apply it exactly once; it is never applied for a miss.

### Stage 9: Adaptive layer

#### P31 · Side quests
- **Goal:** 2.5 (D35).
- **Data:** none. Side quests are ordinary one-off templates: `captureKey 'side:<detector>:<scope>:<weekKey>'`, `captureSource 'trigger'`, a DEADLINE `dueDay` as the expiry.
- **Cores:** pure `side-quests.ts`, run by the life maintenance and the cron. Detectors:
  - BODY under 75 of 150 by Thursday;
  - a must missed twice this week;
  - a habit about to lose a rung;
  - a deadline more than 3 days overdue.
  
  Also a `#side` tag. At most 2 open at a time. **Never a must, never debt, normal price only, and an expiry costs nothing.** Side quests are **left out of the audit rate** and shown separately ("side quests 1 of 2").
- **Web:** an amber row "Side quest · expires Fri".
- **Mobile + Android:** `side:true` and `expiresDay` on the row JSON.
- **Re-pins:** capture-server-check, board-check, today-ui-check, momentum-server-check (TASK candidates), mobile-api-check, week-audit-check.
- **Acceptance:** idempotent per week, no CRM triggers, and no effect on the must cap.

#### P32 · Next-week calibration
- **Goal:** 5.2d (D36). Needs at least 2 frozen audits.
- **Data:** none. The calibration is frozen into the Monday AUDIT row and optionally mirrored to `LifeSettings.weeklyTargets`.
- **Cores:** `calibrationOf(audit, last 4 weeks)`.
  - **Suggested capacity:** clamp(p50 of daily tracked minutes × rate / 0.85, 120, the declared value), in 15-minute steps.
  - **Today's three sizes:** BODY move 10/20/30 and "Finish any 2/3", as QUEST_SET `quests-2`; v1 sets render as before.
  - **Habit and must changes are suggestions only,** through `pendingChange`, so the akrasia horizon still applies. Ease a habit after 2 weeks under 85%; step one up only at 95% or more with every habit Established.
  - **It never changes prices, bands or kept-week floors.**
- **Web:** a "Next week" card with each change's basis line and Accept / Keep.
- **Mobile + Android:** a calibration line on `/check`.
- **Re-pins:** momentum-check `bodyMoveMinutes`, momentum-server-check fallbacks, push-check nudge copy, celebration-check, exercise-style-check, the life-grade-check frog fixture, today-ui-check, momentum-sim. Assert that balance-horizon 4, 4b, 5, L1-L3, 3-m and 2-m are unchanged.

---

## 3. Decisions (each listed once)

**Launch switch** means the user's direct go is also needed at flip time.

| ID | Question | Recommended | Why | Blocks |
|---|---|---|---|---|
| D1 | Capital / Sales Velocity | A **reading only** (AUD won per month from Deals), no XP, no level | Keeps "work stays outside the game" and every balance pin | P1 |
| D2 | Knowledge as the cognitive attribute | **Yes** | It is already a measured row on `/you` | P1 |
| D3 | Where avatar targets live | **New `AvatarTarget` table**, readings in RoadmapReading | Keeps history, any metric, no balance effect | P4 |
| D4 | Baseline and target numbers per attribute | **The user supplies them** (weight, effort minutes a week, a Field level, deep-work hours, revenue a month) | Only the user knows the desired self; this does not block the build | P4 (data) |
| D5 | Level curve | **Per-level Base·L^1.5, tracks only, Base 34.344, keep the kept-week cap, behind a switch** | L10 stays at 4,900 so the year-one pins hold; removing the cap fails pin 8 | P3 |
| D6 | Naming | **Attributes = 5 axes, Traits = 13, nav "Emblems", new Skills page** | Matches the blueprint's words with no economy change | P2 |
| D7 | What a Skill is | **A named Competency** that tasks, roadmaps and walks link to | Avoids "dishes" becoming a skill and split synonyms | P5 |
| D8 | Above 2,000 h | **Tier 4 (2,000-10,000 h)** | A long practice never tops out | P5 |
| D9 | Does a tier-up pay? | **No, a Seal only** | Any MP re-opens balance 1-m, 2-m and 3e | P5 |
| D10 | Flip `ROADMAP_GOALS_LIVE` after the rehearsal *(launch switch)* | **Yes** | It is the main-quest and sprint engine and is already inside every pin | P14 |
| D11 | Main quest model | **The roadmap; goals stay as key results** | One milestone system, not two | P15 |
| D12 | Week verdict timing | **Final on Wednesday; provisional on Sunday; audit frozen Monday 04:00** | A written verdict never changes after a late tick | P11, P15 |
| D13 | Ungate the weekly review from Duty now | **Yes**; Duty-only steps stay hidden | The audit needs it and Duty has open blockers | P10 |
| D14 | Which surface is Daily Quests | **The user's Musts, hard cap 5, warning from 4** | User-chosen, carries stakes later, and Today's three keeps its chest; no basket pin moves | P9 |
| D15 | Meaning of "binary"; weight of the minimum version | **Status only (XP stays graded); the minimum counts as 1 everywhere** (ring, audit, habit year view) with "n at minimum" shown | *Reconciles a conflict between analyses 2.4 (1) and 5.2b (½):* one definition, and a slip stays recoverable | P9, P11 |
| D16 | Skips in the audit | **Held (left out), with "n skipped" shown** | Matches how the app already treats skips, and stays visible | P11 |
| D17 | Where the 85% target appears | **Only on the weekly audit, never on Today** | dropped.md bans quota bars on the board | P11 |
| D18 | Penalty for a missed Daily Quest *(launch switch)* | **Launch Duty debt, min(20, B×E), after the M2 leftovers**, not a flat HP pool | Built, capped, scaled, and the user's own 2026-10-01 rule | P20, P22 |
| D19 | What a Rest Token shields | **One unified bank (momentum freezes); it may excuse a day's missed musts, one per day, bank 2; keep the minimum version, make-ups and rest days** | Scarce tokens plus the existing forgiveness paths stop one bad day spiralling | P21 |
| D20 | Where proof of work is required | **Deep-work templates only (hard gate); BODY counts EXERCISE minutes only when reported, from launch forward** | Chores stay one tap, no basket re-pin, and the BODY hole is closed without re-judging the past | P23 |
| D21 | Telemetry order | **Minutes, then pages; strength and commits only on request** | Cheapest and fully in-app first; the other two reverse earlier user calls | P24-P26 |
| D22 | Health Connect | **Yes, inside the app, walks and weight only, record-only backfill** | Removes the most frequent manual log with no new pay rules | P27 |
| D23 | Knowledge decay model | **Keep the per-card Ebbinghaus model, add the 72 h floor** | It already matches the λ band at L4-L6 and never decays cards the scheduler has not asked for | P13 |
| D24 | Non-knowledge decay | **A derived condition, floor 0.5, λ 0.02 / 0.01 / 0.005, never levels, XP or hours**; (b) feeding the 13 traits is opt-in and never re-locks emblems | Neglect is visible without erasing history | P28 |
| D25 | Streak multiplier | **1.05^d capped at 1.2 (day 4), global, from Full days; not on reviews or MP** | Keeps the compounding and the reset without breaking pins 4/4b | P29 |
| D26 | Fatigue breaker | **Keep the life knee; FATIGUED at 200 answers a day; no sleep rule** | The knee already pays 0.5× at 200 and stops at 300; there is no sleep data | P0, P30 |
| D27 | What "immutable XP" means | **Append-only, never spent or converted; forgetting and Duty debt stay** | Moves no pin and matches the blueprint's own section 3 | P0, P16 |
| D28 | Credits currency; legacy capital | **New derived Credits; retire the capital dividend without conversion, after reading its balance** | No MP pin moves, no idle decay on savings, same number of currencies | P16, P17 |
| D29 | Credits income and start | **Accept the table in P16; start at 0, no backfill** | Fixed, published amounts; follows the `weekIsBackfill` rule | P16 |
| D30 | How far "lock all leisure" goes | **Only rewards the user lists; #play stays free; no starter rewards** | Keeps the overjustification safeguard and avoids a guilt loop | P18 |
| D31 | Buying rules | **No overdraft; 10-minute undo; penalties never debit credits; a purchase is permission now** | Burns exactly what was earned and keeps the Mall guilt-free | P19 |
| D32 | Variable-ratio rewards | **Credits stay deterministic; chance stays with the existing chest and crits** | The user's 2026-10-12 two-rolls rule | P19 |
| D33 | Should `x <title>` tick the open row? | **Yes, with a visible chip and one tap to make it a new task** | Fixes silent duplicates; every shortcut and webhook reuses this path | P6 |
| D34 | Phone scope and order | **Token first, then minutes and Yesterday, then the widget, then the offline queue**; phone minutes use the drawer's clamp | Biggest friction cut once the API is closed | P7, P8 |
| D35 | Side-quest sources and reward | **Life detectors plus `#side`; normal price; at most 2 open; no CRM triggers** | No re-pin, and keeps the 2026-10-12 work rule | P31 |
| D36 | Calibration | **Automatic only for Today's three sizes and the capacity suggestion; habit and must changes are one-tap suggestions; never prices or floors** | Respects the akrasia pre-commitment and keeps every pin | P32 |
| D37 | Audit prompt on the phone | **Local Android notification, Sunday 19:00 Sydney** | No server setup; works before web push is finished | P12 |
| D38 | Ship the audit before Duty | **Yes, behind `AUDIT_LAUNCH_DAY`** | Duty has open M2 blockers; the audit is display-only | P11 |

---

## 4. Blueprint items that could harm the user or the data, and the safer variant

| # | Blueprint text, read literally | Harm | Safer variant (phase) |
|---|---|---|---|
| H1 | A flat λ of 0.005-0.02 from the last practice after 72 h, applied to knowledge | Ignores the spacing schedule. An L12 card would lose about 55% inside its own 160-day interval. The first cron would drop many real Domain levels and flood the bell. **Erases real knowledge history.** | Keep the per-card, schedule-aware model and add only the 72 h floor (P13, D23) |
| H2 | Atrophy of attributes, skills or levels | Decaying track levels, the character level or logged hours **rewrites facts** (hours practised are history, not a state) | A derived condition with a 0.5 floor, never levels, XP or hours; counts only from the launch day; rest, sick and vacation days are not idle; owned emblems never re-lock (P28, D24) |
| H3 | Streak ×2.0 at day 14, reset to 1.0 on any miss | Inflates XP 1.6-1.8× (against the blueprint's own anti-inflation goal), and the all-or-nothing reset is the classic what-the-hell trigger after one bad day | 1.05^d capped at 1.2; rest tokens bridge; the minimum version counts as kept (P29, D25) |
| H4 | A flat HP/Willpower penalty per missed Daily Quest | Charges a 5-minute must the same as a 4-hour one, which pushes the user to drop hard musts. An HP pool that can reach zero invites a spiral and a game-over feeling. | Scaled, capped Duty debt (≤ 20 per miss, ≤ 3 open per task, ≤ 100 total, which bounds the worst drop to about one Duty level); make-ups and accept-the-loss; no level-down ceremony; `spiral-check` pins the worst week (P22, D18) |
| H5 | "Lock all discretionary leisure behind the Mall" | Pricing hobbies turns them into jobs (overjustification, Deci et al. 1999). Rest becomes something to earn, which **works against the blueprint's own recovery goal**. | Only user-listed rewards are priced; #play, rest days and sleep are never priced; honest copy that it runs on honour (P18, D30) |
| H6 | "Burn the exact balance" | A credit line or an overdraft is debt by another name; penalties that debit credits create a guilt loop | No overdraft; an undo-driven negative is shown plainly and blocks purchases; **penalties never touch credits** (P19, D31) |
| H7 | Variable-ratio reinforcement (Skinner) for the Mall | A slot-machine schedule on spendable credits tied to real purchases encourages compulsive play | Credits stay deterministic; chance stays with the two published, seeded rolls (D32) |
| H8 | "Enforce sleep and recovery compliance" | There is no sleep data (Health Connect was dropped), so any sleep rule would be invented | Keep the knee for life XP and FATIGUED for review over-volume only; never penalise a low-output day (P0, P30, D26) |
| H9 | "Reject simple checkbox completion" for all tasks | Logging friction exceeds execution friction (against section 5), so the user stops logging and real data is lost | Proof for deep work only; the minimum version and chores stay one tap (P23, D20) |
| H10 | Closing the BODY minutes hole | Applied backwards, it would re-judge kept weeks and claw back the 18 MP mints | Forward-only from `PROOF_LAUNCH_DAY`; receipts are never repriced (P23) |
| H11 | A Sunday-night verdict | A late "record yesterday" tick or a 48 h make-up would change a verdict already written, or be locked out | Provisional on Sunday, frozen on Monday as "as of", final on Wednesday (P11, D12) |
| H12 | "Hostile audit" with an 85% target | A shame tone and a daily quota encourage gaming or quitting | Neutral copy; the rate appears only on the audit; held days are left out; "calibrating" for the first 2 weeks (P11, D17) |
| H13 | Auto-calibrate difficulty | Silently ratcheting habits or musts up bypasses the user's own pre-commitment and causes overload | Automatic only for Today's three sizes and a capacity suggestion bounded by the declared value; habit and must changes need Accept (P32, D36) |
| H14 | Side quests from anomalies | Spawning "reset" quests after misses stacks punishment on a bad week | Never musts, never debt, at most 2 open, expiry costs nothing, kept out of the audit rate (P31) |
| H15 | Retroactive curve change | Every track level is recomputed on read | Behind a switch, flipped early; the live account can only rise, within its kept-week cap; no ceremony on the flip (P3) |
| H16 | Webhooks, a widget and ingestion on an app with no login | Anyone could write ticks or trigger the degrade cron (which is **open today if `CRON_SECRET` is unset**) | Confirm `CRON_SECRET` and set `MOBILE_API_TOKEN` in P0 before the widget; the webhook fails closed with HMAC (P0, P8, P26) |
| H17 | Health Connect or strength imports | A history backfill could mass-pay or mint fake personal bests; strength PRs are self-reported | Record-only backfill with no PBs; sets above 2× the user's best are unpaid until confirmed (P25, P27) |
| H18 | Capital as an XP attribute | Pulls work into the game (burnout) and reverses momentum decision 4 | A reading only (P1, D1) |
| H19 | Retiring capital | Hides a balance the user may remember | Read and report the balance first; keep every row (P17) |
| H20 | Any write while building | Dev and prod share one database; two Supabase projects exist | Rehearse only on local Docker; write gates on every new writer; check the ref (xvlkujmtdcpaoxdftgpl) before each migration (section 0) |

---

## 5. Notes on sequencing

- **Fully independent** (can be pulled earlier): P13, P30, P10, P6.
- **Stage 6 (Duty) and Stage 7 (Proof) can swap.** Proof needs only P3 and P7. If Proof ships first it takes receipt version `life-3` and the streak (P29) takes `life-4`.
- **Strict chains:** P16 → P18 → P19 · P20 → P21 → P22 → {P28, P29} · P9 → P11 → P12 → P32 · P14 → P15 · P7 → P23 → P24.
- **Launch switches, in expected flip order:**
  1. `TRACK_CURVE_LAUNCH_DAY` (P3)
  2. `AUDIT_LAUNCH_DAY` (P11)
  3. `ROADMAP_GOALS_LIVE` (P14)
  4. `CREDITS_LAUNCH_DAY` (P16)
  5. `DUTY_LAUNCH_DAY` (P22)
  6. `PROOF_LAUNCH_DAY` (P23)
  7. `DECAY_LAUNCH_DAY` (P28)
  8. `STREAK_LAUNCH_DAY` (P29)
  
  Each one is flipped only on the user's direct go, followed by re-pinning its inert checks.