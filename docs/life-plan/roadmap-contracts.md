# Roadmap contracts (lane 0)

What every roadmap lane builds on. The spec is `roadmap.md` revision 3. Everything below is **frozen**: changing a name, a value, a shape or a signature is a lead decision, not a lane edit. A lane fills in the bodies behind the signatures in the files it owns, and may add private helpers, new exports and optional fields. It never removes or renames one.

Every shell export carries a `// STUB: lane X implements (F<n>)` comment. Before handing off, each lane greps `STUB: lane <X>` in its own files and leaves none behind.

State of the tree after lane 0:
- `npx tsc --noEmit -p .` is clean, and eslint is clean on every lane-0 file.
- `npm run roadmap-contract:check` passes 152 checks.
- `life:check`, `ui:check` (study-side-check now 123), `balance:horizon` and `novelty:check` pass unchanged.
- Every shell is inert, and Today and /you render exactly as before:
  - `loadWeekQuests` and `loadAimCard` return null;
  - `WeekQuests` and `AimCard` render nothing;
  - the writers write nothing;
  - every action answers "Not yet.";
  - the other pure functions throw `Not yet: <name>`.
- The migration `prisma/migrations/20261101000000_life_roadmap/migration.sql` is written, not applied. It sorts last, and its pre-apply grep is clean (no `DROP`; every `ALTER TABLE`, `ON` and `REFERENCES` names a Roadmap* table).
- `prisma validate` passes, and `prisma format --check` is clean.
- `prisma generate` wrote the TypeScript client (`prisma.roadmap`, `prisma.roadmapQuestWeek` and the rest), but the engine DLL rename failed on a locked file, as in M2. Code that reads these tables deploys only after the lead applies the migration. Until then, those reads catch the missing table with `isMissingRoadmapTable`.

`ROADMAP_GOALS_LIVE` is `false`. Start is hidden, not disabled, until the lead flips it (F16 seam 15).

**Fix round.** The reviewers' findings added helpers, optional fields and agreed rules to this contract; they are listed in §9 ("Added in the fix round"), with the build round's own lane additions in §10. Everything added is optional or new, so every earlier export still compiles as it was.

**Revision 4.** docs/life-plan/roadmap-rev4.md (the aim at the centre, plans that reach high mastery, drafting with no Gemini words) is §14 below. The spec calls it "§11 Revision 4"; fix round 2 had already taken §11, so it is §14 here, and §13 records what the lanes exported in fix round 2 (read from the code, as §12 does for fix round 1).

**Revision 4 fix round.** The three reviews of the revision-4 build are answered in lane-0 files first, in §15. It adds one definition each for clean entry, coverage frozen at intake, a PART at the depth, production practice, session picks, the acceptance order and the gap-names count. It also raises WRITE_MARGIN to 1.3, adds the HIDDEN prompt and two new shells, puts the view fields R5 had read through casts onto the contract, and records the revision-4 build round's exports (§15.14). roadmap-contract-check pins every other lane's adoption as PENDING; `--strict` fails them.

**Revision 4 fix round 2.** The re-review of the revision-4 fix round (gates, the hallucination bar and mastery; encouragement, UI and honesty at 344 px) left a short list. Lane 0 went first and alone again, in §16: the clean-entry window widened to srs.ts's worst case, `PlanHistoryRow.depthLowered` and `AimCardView.legacyView` on the contract, `AIM_INVITE_SINCE` set to the deploy day, PENDING pins for every adoption still open, and §16.7 records the exports §14 and §15.14 never named, read from the code.

**What the lanes shipped in fix round 2** is §17: every lane's round-2 exports and changed signatures, read from the code at the end of the round (R1's clean-entry reader, R2's spare-only dating, R3's constraint release, R4's frozen counts, pending-Domain masking and the week-quests view of the bar, R5's collapse-and-restore and legacy handoff, R7's word-list-free vocabulary and one-source sub-classes, T's text-fit estimate, Y's legacy fixtures and C's prompt-gated offer), the state of §16.8's PENDING lines, and the handoffs the finishing round closes. docs/life-plan/roadmap-rev4.md's "As shipped" says the same in product terms.

**The finishing round and the hardening round** are §18: the finishing round closed §17.3's handoffs (code comments call it "fix round 3"), and §18 records its exports and changed signatures, the hallucination bar's numbers after it (the re-blessed pin among them), and the minors a verifier still found open, with what the hardening round did about each. The hardening round (code comments: "fix round 4") also taught the constraint parser to read a negation written after its term, which re-blessed the pin append-only again (§18.1, §18.2). A second verifier's list after it is §18.5.

**Constraint safety, confirm to unlock** is §19, the lead's decision after the hardening round (roadmap-rev4.md decision 55, F-R4-25). On a BODY or CARE plan, safety rests on a broad cue detector and the user's per-kind answer, not on the parser: the parser's exclusions only pre-fill. Lane 0 wrote the contract and every pure part first and alone, with no schema change. Each plan path's adoption is a PENDING line (§19.5), so `--strict`, and with it life:check, failed until they landed; all have landed, and a fourth verifier's run of life:check exited 0 (roadmap-contract-check `--strict` 493 passed, 0 PENDING). After a third verifier, the lead's eight decisions (roadmap-rev4.md decision 56, "the safety-gaps round") rewrote §19 in place: every BODY or CARE plan asks once whatever the user wrote, CRAFT asks on a cue, answering is an explicit act that carries the key of the words it answers, CARE has two safe kinds, and the parser's reading is only a suggestion (§19.8). R3's vocabulary item in §19's first round re-blessed the hostile pin append-only to 6a7ed5cd…, and its suggest item in the safety-gaps round to **25b08ff54d41059d…**, the live pin (scripts/fixtures/roadmap-hostile/pin.json: K 3,007, 2,103 over-exclusion lines); §19.9 holds the pin's history, the bar's figures and the check chain's state. After the fourth verifier the lead ruled three follow-ups (roadmap-rev4.md decision 57): the release is per card (a Save with a tick answers every row the card listed, and "Nothing to avoid" stays hidden while any box is ticked); safety overrides the akrasia horizon (a pause caused by an "Avoid" is immediate even for a must, and the must's days before it keep their rules and debts); and a paused practice stops counting toward its started milestone's practice-kept target, said on the roadmap (as built, its whole practice-kept measure switches to context from the pause, so its sessions before the pause stop counting too). §19.11 records ruling (1) and the track's key (lane 0), §19.12 rulings (2) and (3) with the server's and the page's other follow-up items (R4, R5), §19.13 the lead's aim-conflict ruling (a limit is not an exclusion; roadmap-rev4.md 57.4), and §19.14 the probe run (7 of 7 production-configuration replies CLEAN; the gap schema and thinking LOW rejected by the API; once labelled, a no-go). After the follow-up round life:check was green again. Blessing the probe's 7 replies (42072fa) then moved the hostile pin, so roadmap-hostile-check's PIN item fails until the lead re-blesses pin.json (§19.9).

**The practice progression** is §20, the lead's decision after the probe's no-go (practice fit 29% of stages against 80%; arrangement 1 of 7): code owns the practice progression on every plan path, and Gemini's reply shrinks to `needs`, the outline's order and at most one pick per stage among code's candidates (ROADMAP_PROMPT_VERSION 4). Lane 0 wrote the pure progression (`progressionOf` and its rule checker in roadmap-catalog.ts), the v4 reply's shapes (roadmap-types.ts) and the sizing as one definition, first and alone, with no schema change. Each item's adoption is a HANDOFF line in roadmap-contract-check (§20.8): unlike PENDING, `--strict` (and with it life:check) passes them while the round runs, and `--handoffs` fails every one still open.

**Fix round 2.** The re-review's open items added a second, smaller set (§11: the run behind the accepted plan, the acceptance-day caption, struck title numbers off the review, the plan's position count, and one definition of "what a draft milestone still needs"), and §12 lists what every lane exported in the first fix round, read from the code. ui-audit now reads R5's FIXTURE_STATES from fixtures.ts (15 states), and roadmap-contract-check passes 200 checks.

## 0. Rules every lane keeps

- **No database, no dev server, no model.**
  - Every check that imports a roadmap module (`src/lib/roadmap-*`, `throughput*`, `src/components/roadmap/*`) starts with `import "./_no-model";` as its **first** import. roadmap-contract-check fails any that doesn't.
  - **Transitively too (fix round).** A check that *reaches* a roadmap module through any chain of imports (tasks.ts, settlement.ts, goals-server.ts, a "use server" action; static `import`, `export … from`, `import("…")` and `require("…")`, but not `import type`) imports it first as well. "A check" is every `scripts/*-check.*` plus every script a package.json check runs (`life:check`, `ui:check`, any `*:check`, `balance:horizon`). The two pure leaves, roadmap-types.ts and roadmap-events.ts, are exempt as targets (gemini.ts imports roadmap-types for packText), and the check pins that neither reaches a model module or Prisma.
  - `scripts/roadmap-probe.ts` never imports it.
- **_no-model blanks the key; it doesn't only delete it.**
  - Importing `@prisma/client`, or `dotenv/config`, loads `.env` into every *unset* variable. A deleted `GEMINI_API_KEY` therefore comes straight back the moment a check imports anything that touches Prisma (verified).
  - A blank key survives, because dotenv never overrides a set variable, and it reads as no key everywhere.
  - So `_no-model.ts` sets `GEMINI_API_KEY = ""` and `GOOGLE_API_KEY = ""`, and `ROADMAP_CHECK = "1"`.
  - A check that wants to assert "no key" asserts `!hasGeminiKey()`, never `=== undefined`.
- **Writes.**
  - Every write is gated by life-economy `lifeWritesEnabled(env)`. Every writer takes `opts: RoadmapWriteOpts` (`{env?}`, extend it with optional deps).
  - With writes off, a writer writes nothing, and a user action refuses with `ROADMAP_WRITES_OFF`.
  - Live values on such a server are labelled `NOT_RECORDED_HERE`.
- **Brands.**
  - The number constructors `measured()`, `recorded()`, `selfReported()`, `estimated()` and `workedOut()` are called only in roadmap-measures.ts, roadmap-realism.ts, roadmap-proficiency.ts, roadmap-quests.ts and throughput.ts.
  - `yoursText()` and `labelTextOf()` are called only in roadmap-server.ts and roadmap-quests-server.ts.
  - `codeText()`, and the literal origin `'CODE'`, appear only in roadmap-realism.ts.
  - **roadmap-types.ts itself is exempt.** It defines them, holds the `Origin` union and implements `provenanceOf`. R5's grep must exempt it and strip comments, since the shells' header comments name the constructors.
- **Names** (roadmap.md Names):
  - No declared identifier, property name included, in `src/lib/roadmap-*`, `throughput*` or `src/components/roadmap/**` contains `skill`, `mastery` or `Mp`. Lane 0's files pass this today. Imports from xp.ts, goals.ts and life-economy.ts are allow-listed.
  - No identifier named `quest`, `Quest`, `questOf`, `questTargetOf`, `QuestState`, `questStateOf` or `QUEST_CAP`, and no constant starting with `QUEST_`.
  - No import of review-facts.ts, board-ui.ts, full-day.ts, titles.ts, field-tier.ts or skill-visuals.ts. Only roadmap-contract-check reads the ladders.
- **Lib never imports components**, except roadmap-events.ts from client code. roadmap-copy.ts is UI copy; lib basis lines are the lib's own.
- **Missing tables.** Reads Today and /you make, and the 'life' reset, catch a missing table with `isMissingRoadmapTable(err)`.
- **IDs.** Raw INSERTs (the readings upsert, the quest freeze) supply their own id with `globalThis.crypto.randomUUID()`, as tasks.ts `newId()` does; that helper is private there. measureKey ids must match `[A-Za-z0-9_-]{1,64}`, which cuids and UUIDs do.

## 1. Schema and migration

`prisma/schema.prisma` gains 8 models at the end. Each has `@@schema("public")` and the foreign keys run only between them, with cascade delete from `Roadmap`. No existing model was edited.

| Model | Notes |
|---|---|
| `Roadmap` | `domainIds String[]`, `syllabus Json?`, `status` DRAFT by default, `version` 0, `firstAcceptedDay`, `reachedDay`, `doneAt` / `doneReason`, `archivedAt` / `archiveReason`. Index (userId, status). |
| `RoadmapRun` | kind, status, model, modelVersion, promptVersion, seedBase, inputHash, pack, samples, report and usage (Json), responseIds and finishReasons (`String[]`), latencyMs, error. Indexes (userId, day), (userId, inputHash), (roadmapId, status). |
| `RoadmapMilestone` | lineageId, ord, title with titleOrigin and titleDecision, nullable windowStart and dueDay (LATER), `goalId @unique`, startedDay, startingAt, reachedDay, reachPendingDay, overAccepted, feasibility Json, rankIndex. Indexes (roadmapId, version, ord), (lineageId). |
| `RoadmapItem` | Mirrors `ItemDraft`. flags and notes are `String[]`. Indexes milestoneId, templateId, domainId. |
| `RoadmapMeasure` | `scope Json`, target, targetSource, fittedTarget, rateSource, baseline, baselineDay, itemLineageId, measureKey. Indexes milestoneId, measureKey. |
| `RoadmapReading` | Unique (userId, measureKey, day); index (userId, day); source COMPUTED; observedAt. |
| `RoadmapAcceptance` | feasibility, endState (`EndStateTerm[]`), intervalMultiplier, overAccepted, undoneAt. Index (roadmapId, version). |
| `RoadmapQuestWeek` | Unique (userId, dedupeKey); indexes (roadmapId, weekStart) and milestoneId. Two foreign keys (Roadmap, RoadmapMilestone). |

The migration SQL is the spec's own text, with `-- CreateTable` and `-- CreateIndex` markers and a header that names no forbidden keyword, so the pre-apply grep passes on the file as written. List columns are `TEXT[] DEFAULT ARRAY[]::TEXT[]` without NOT NULL, as the spec wrote them. The lead's `migrate diff` decides list nullability (Migration step 2).

## 2. `src/lib/roadmap-types.ts` (pure, client-importable, final)

Imports: xp, life-day, recurrence, habit, life-economy (WEEK_JUDGE_LAG_DAYS, type LifeEnv), duty-economy (SETTLE_LAG_DAYS), life-lexicon (DURATION_BAND_MINUTES), and types from life-types and goals. No Prisma, no clock, no model.

### 2.1 Gate, strings and write results

| Export | Value / signature |
|---|---|
| `ROADMAP_GOALS_LIVE` | `false`. Start is hidden while false. Lead only. |
| `ROADMAP_WRITES_OFF` | `"Roadmap changes are recorded only on the live app"` |
| `NOT_RECORDED_HERE` | `"not recorded on this server"` |
| `ROADMAP_NOT_YET` | `"Not yet."`: what shell actions answer |
| `RoadmapActionResult<T>` | `{ok: true, value: T} \| {ok: false, error: string}` |
| `notYet(what): never` | Throws `Error("Not yet: <what>")`; the shells' body |
| `ROADMAP_CHECK_ENV` | `"ROADMAP_CHECK"` |
| `AIM_PROMPT_COOKIE`, `AIM_PROMPT_COOKIE_MAX_AGE_S` | `"xtnl-aim-prompt"`; a year in seconds |
| `RoadmapWriteOpts` | `{env?: LifeEnv}`; lanes add optional deps |
| `RoadmapSkip` | `"WRITES_OFF" \| "THROTTLED" \| "NO_ROADMAP" \| "MISSING_TABLE"` |
| `ReadingsRun` | `{written, reaches, skipped, error?}` (`error?` added in the fix round) |
| `QuestFreezeRun` | `{froze, skipped, error?}` |
| `QuestFinalizeRun` | `{finalized, skipped, error?}` |
| `RoadmapStepReport` | `{freeze, readings, finalize, errors: string[]}`: the crons' `roadmap: {…}` JSON (lane G assembles it) |
| `roadmapStepErrorsOf({freeze?, readings?, finalize?})` | Fix round: `["freeze: …", "readings: …", "finalize: …"]` for each part that *returned* an error (the writers never throw) |

### 2.2 Unions (TEXT columns)

`RoadmapStatus`, `MilestoneStatus`, `Origin`, `Decision`, `ItemKind`, `PlanSource`, `MeasureKind`, `MeasureRole`, `TargetSource`, `RateSource`, `RunKind`, `RunStatus`, `ReadingSource`, `PracticeMethod`, `CheckpointKind`, `PracticeBand` (D15..D120), `StartPoint`, `Intensity`, `BlockingFlag` (11), `ItemNote` (CHECK_LINK, ADDED_TO_SCOPE, RAISED, STUDY_ADDED, PLACEHOLDER), `KnowledgeVerdict` (FITTED, FITS, TIGHT, OVER, IMPOSSIBLE), `TimeVerdict` (FITS, TIGHT, OVER; unverified is a flag), `Remedy` (MOVE_DATE, REFIT_LIGHT, MOVE_TO_LATER), `ReplanKind` (REFIT, MANUAL), `ReplanTrigger` (7), `GeminiKeyTier`, and `WeekQuestKind`, `WeekQuestEvidence`, `WeekQuestState`, `WeekQuestSource` (CRON, START, RENDER) and `WeekQuestCap` (CATCHUP, CAPACITY).

Each has its `*_S` list where code iterates over it.

### 2.3 Constants (every value as published; roadmap-contract-check pins each one)

| Block | Exports |
|---|---|
| Intake | `AIM_MAX` 140, `CONSTRAINTS_MAX` 280, `EXAM_MAX` 80, `SOURCE_NOTE_MAX` 120, `SYLLABUS_MAX_LINES` 40, `SYLLABUS_LINE_MAX` 120, `HOURS_MIN/MAX` 1/40, `TYPICAL_HOURS_MIN/MAX` 1/5000, `NEW_CARDS_PER_WEEK_MIN/MAX` 0/100, `SPAN_MIN_DAYS` 35, `SPAN_MAX_DAYS` 1080, `START_POINT_FLOOR` {NEW 4, BASICS 4, WORKING 6, STRONG 6}, `INTENSITY` {LIGHT 0.5, STEADY 0.7, PUSH 0.9}, `DEFAULT_INTENSITY`, `ROADMAP_TRACKS` [CRAFT, BODY, CARE, DUTY], `DEFAULT_FIELD_TRACK`, `CREDENTIAL_WORDS` (11) |
| Milestones | `MILESTONE_TARGET_DAYS` 75, `MAX_MILESTONES` 6, `MILESTONE_MIN_DAYS` 35, `MILESTONE_MAX_DAYS` 186, `DOMAINS/NEW_DOMAINS/TOPICS/PRACTICES/STEPS/CHECKPOINTS_PER_MILESTONE` 4/2/6/3/3/1, `THRESHOLDS` [4, 6, 8, 10, 12], `THRESHOLD_SPAN_SHARE` 0.6, `MIN_INCREMENT_CARDS_FLOOR` 3, `MIN_INCREMENT_SHARE` 0.1, `KEEP_SHARE` 0.8, `START_MIN_DAYS_TO_DUE` 31, `PRACTICE_PAY_FLOOR_MIN` 60, `PRACTICE_PAY_SHARE` 1/3, `PRACTICE_BUDGET_SHARE` 0.8, `SESSIONS_MIN/MAX` 1/7, `METHOD_DEFAULT_BAND`, the label caps (`MILESTONE_TITLE_MAX` 80, `NEW_DOMAIN_NAME_MAX` 40, `NEW_DOMAIN_WORDS_MAX` 4, `TOPIC_LABEL_MAX` 80, `PRACTICE_NAME_MAX` 60, `STEP_TITLE_MAX` 80, `CHECKPOINT_LABEL_MAX` 60, `RAW_LABEL_MAX` 200), `STARTING_STALE_MS` 10 min, `ACCEPT_UNDO_MS` 10 s, `TARGET_LOWERED_SHOW_DAYS` 28 |
| Floors | `TOP_LEVEL` (= xp MASTERY_LEVEL, 12), `JITTER_LEVEL_MIN/MAX` 5/8, `JITTER_LOW` 0.75 |
| Realism | `DECLARED_FACTOR` 0.7, `ADHERENCE_FLOOR` 0.3, `ADHERENCE_MIN_JUDGED` 8, `ADHERENCE_MIN_MINUTES` 20, `ADHERENCE_MIN_BAND` "STANDARD", `RAMP_ALLOWANCE` 0.5, `RAMP_FLOOR_MIN` 120, `PASS_SHARE_MIN_REVIEWS` 30, `PASS_SHARE_WINDOW_DAYS` 28, `TIME_FITS_MAX` 0.8, `TIME_TIGHT_MAX` 1.0, `ADHERENCE_LOW` 0.6, `ADHERENCE_LOW_SESSIONS` 3, `CLEARANCE_MIN` 0.8, `CLEARANCE_WINDOW_DAYS` 14, `CARD_WRITE_MIN` 5, `REVIEW_SECONDS` 20, `PACE_WINDOW_WEEKS` 8, `PACE_MIN_WEEKS` 4 |
| Throughput | `CALIBRATION_WEEKS` 4, `WEEK_MIN_ELIGIBLE_DAYS` 4, `THROUGHPUT_LAG_DAYS` (= SETTLE_LAG_DAYS 2), `NEW_CARDS_SINCE` "2026-07-28", `REVIEW_PASSES_SINCE` "2026-08-12" |
| Pace | `BEHIND_DAYS` 14, `PRACTICE_LOW` 0.5, `PRACTICE_LOW_WEEKS` 4, `PRACTICE_LOW_MIN_UNITS` 8, `CARRIED_RESCHEDULE_DAYS` 14, `FAR_WEEKS` 104, `READINGS_THROTTLE_MS` 10 min, `REACH_CONFIRM_DAYS` (= SETTLE_LAG_DAYS 2) |
| Model | `ROADMAP_MODEL` "gemini-3.5-flash-lite", `ROADMAP_PROMPT_VERSION` 2, `ROADMAP_SAMPLES` 1, `SEED_BASE` 11, `SEED_REDRAFT_STEP` 100, `SEED_OFFSETS` [0, 12, 26], `ROADMAP_ABORT_MS` 35000, `ROADMAP_BACKSTOP_MS` 37000, `RUN_CLAIM_GUARD_MS` 60000, `RUN_STALE_MS` 90000, `ROADMAP_MAX_OUTPUT_TOKENS` 6000, `ROADMAP_THINKING_LOW` false (the probe decides), `GEMINI_KEY_TIER` "FREE", `ROADMAP_DRAFTS_PER_DAY` 5, `ROADMAP_REUSE_DAYS` 7, `PACK_MAX_DOMAINS` 40, `PACK_NAME_MAX` 80, `PACK_COUNT_BUCKET` 5, `RAW_SAMPLE_MAX` 32 KB, `UNVERIFIED_ALARM` 0.5, `ALARM_CORPUS_MAX` 0.2, `LATENCY_MIN_RUNS` 5, `DRAFT_REFRESH_MS` 3 s, `DRAFT_REFRESH_MAX_MS` 75 s, `LANGUAGE_ASCII_MIN` 0.85, `LANGUAGE_MIN_WORDS` 4, `ENGLISH_FUNCTION_WORDS` (60, frozen) |
| Week quests | `WEEK_QUEST_KINDS`, `WEEK_QUEST_EVIDENCE`, `WEEK_QUEST_EVIDENCE_OF` {RAISE TESTED, ADD RECORDED, others SELF_REPORTED}, `WEEK_QUEST_STATES`, `WEEK_QUEST_GENERATOR_VERSION` 1, `WEEK_QUEST_CATCHUP_FACTOR` 1.5, `WEEK_QUEST_ADD_MIN_CAP` 3, `WEEK_QUEST_CHECKPOINT_FROM` 0.8, `WEEK_QUEST_MAX_PER_KIND` {1, 1, 3, 1, 1}, `WEEK_QUESTS_PER_WEEK_MAX` 7, `WEEK_QUEST_ROWS_TODAY` 3, `WEEK_QUEST_FINAL_LAG_DAYS` (= WEEK_JUDGE_LAG_DAYS 3), `WEEK_QUEST_BEHIND_WRITING_WEEKS` 2 |
| Proficiency and rank | `PROFICIENCY_WEIGHTS` {cards 0.6, practice 0.25, milestones 0.15}, renormalised over the parts present (a Field Area without practices 0.8 / 0.2; a track Area 0.625 / 0.375; the comment's earlier "0.75 / 0.25" was a slip, corrected in the fix round), `PROFICIENCY_VERSION` 1, `AIM_RANKS` (7), `RANK_MILESTONE_MAX` 5, `RANK_TOP` 6, `PARAGON_MIN_MILESTONES` 4, `RANK_NEW_DAYS` 7 |

### 2.4 Pure schedule helpers (implemented and tested; R1, R2 and R6 share them)

| Export | Signature and meaning |
|---|---|
| `interval(l, m = 1)` | `round(BASE_INTERVAL_DAYS[l] × m)`; reads xp.ts `baseIntervalDays` |
| `strictInterval(l, m = 1)` | `round(base × 0.75 × m)` for levels 5–8 (the jitter's lower bound), else `interval` |
| `floorBase(L, m = 1)`, `floorStrict(L, m = 1)` | Σ over l = 2..L−1. Goldens at m = 1: 6/25/69/155/340 and 6/22/56/133/318. At m = 1.5: 9/38/104/233/511 and 9/34/83/199/477 |
| `LEVEL_WEIGHT(l)` | `floorBase(l, 1)`: 0, 0, 2, 6, 13, 25, 43, 69, 105, 155, 230, 340 |
| `CardState` | `{level, dueDay, graceEndsDay: DayKey \| null, createdDay?, domainId?}`, where graceEndsDay = `dayKeyOf(Idea.graceEndsAt)` |
| `EffectiveCard` | `{level, dueDay}` |
| `effectiveState(card, today)` | Past grace (graceEndsDay < today): (max(1, ℓ − 1), today). Overdue within grace: (ℓ, today). Otherwise (ℓ, dueDay) |
| `passesNeeded(card, L)` | max(0, L − ℓ) |
| `bestReach(card, L, m)`, `strictReach(card, L, m)` | dueDay + Σ_{l=ℓ+1..L−1} interval (or strictInterval). Take an **effective** card |
| `existingBest(cards, L, d, m)`, `existingStrict(…)` | Cards at ≥ L, plus cards whose reach ≤ d |
| `existingExpected(cards, L, d, p, m)` | Cards at ≥ L, plus Σ p^k × [bestReach ≤ d], unrounded. Pass **p = 1 while calibrating** (expected = best) |
| `DaySpan` | `{from, to}` (inclusive life days) |
| `plannedUnits(rule, {from, to, startDay?}, held = [])` | Fixed rules: occurrences on eligible days. TARGET: per period clipped, min(n, round(n × e ÷ periodDays)). AFTER:n: 1 + ⌊(e − 1) ÷ n⌋. One-off or unreadable: 0 |
| `keptUnits(rule, startDay, {from, to}, instances)` | **Added by lane 0**, so R1's PRACTICE_KEPT and R6's PRACTICE progress share one rule. TARGET: Σ habit.ts `targetUnits(clip).kept`, capped at n per period, two ticks on one day = one. Fixed: kept scheduled days (outcomesOf). AFTER: distinct kept days. One-off: ≤ 1. DONE_MVV never keeps |
| `milestoneCountFor(span)` | clamp(round(span ÷ 75), 1, 6) |
| `minIncrementCards(baseline)` | max(3, ceil(0.1 × baseline)) |
| `practiceBandMinutes(band)` | DURATION_BAND_MINUTES[band] |
| `isQuestWeekFinal(to, today)` | today ≥ to + 3 |

### 2.5 Ranks

| Export | Meaning |
|---|---|
| `AIM_RANKS`, `AimRankName` | Initiate … Paragon (0–6). Disjoint from the title bands, Transcendent ranks, Field tiers, emblem ranks, habit rungs and materials, and no name contains "master" (checked) |
| `rankIndexAt(place, first?)` | max(1, min(place, 5, first)). The goldens for n = 1..6 are pinned |
| `topRankIndexOf(maxScheduled)` | 6 (Paragon, with the aim) at ≥ 4, else min(count, 5); 0 with none |
| `aimRankName(i)` | Clamped `AIM_RANKS[i]` |
| `RankRow`, `AssignRankIndices` | `(rows, firstByLineage) => Record<rowId, number \| null>`. R1 implements `assignRankIndices` in roadmap-proficiency.ts. A place is a **position** (fix round): rows sharing a lineage (a dropped row and its "Start again" copy) take one place |

### 2.6 Provenance and brands

| Export | Meaning |
|---|---|
| `PROVENANCE_CLASSES`, `ProvenanceClass` | The 8 classes. CITED is reserved and not among them |
| `TextClass` | YOURS \| WORKED_OUT \| KEPT_SUGGESTION \| DRAFT |
| `ComputedClass`, `PROPAGATION_ORDER` | DRAFT < KEPT_SUGGESTION < SELF_REPORTED < ESTIMATED < WORKED_OUT |
| `provenanceOf(origin, decision)` | USER and SYLLABUS → YOURS. CHECKED and EDITED → YOURS. CODE (PENDING, KEPT, REMOVED) → WORKED_OUT. GEMINI KEPT → KEPT_SUGGESTION. GEMINI PENDING and REMOVED → DRAFT |
| `weakest(...classes)` | The weakest in PROPAGATION_ORDER. MEASURED, RECORDED and YOURS count as WORKED_OUT; with no inputs, WORKED_OUT |
| `Measured`, `Recorded`, `SelfReported`, `Estimated`, `WorkedOut` | Number brands, with constructors `measured()` … `workedOut()` |
| `EvidenceFigure`, `EvidenceValue` | `Measured \| Recorded \| SelfReported`; `{value, caption}`. Every Meter wrapper, MeasureRow, AimCard and WeekQuests figure takes an `EvidenceValue`. A plain number, an Estimated or a WorkedOut fails tsc (pinned) |
| `YoursText`, `CodeText`, `DomainName`, `WeekQuestLabelPart` | String brands. A quest label slot takes only these |
| `yoursText(origin, decision, text)` | `YoursText \| null` (only when YOURS) |
| `CODE_TEMPLATES`, `CodeTemplate`, `CodeFill`, `codeText(template, fill)` | "Study {domains}", "{domains} to level {L}+", "Practice for {aim}". Throws outside the list or on an unfilled slot. Domains are joined with ", " |
| `domainName({id, name})` | The Domain row's name on one line |
| `labelTextOf(origin, decision, text)` | YOURS → YoursText; CODE with PENDING or KEPT → CodeText; DRAFT and KEPT_SUGGESTION → null |
| `domainsText(names, "or" \| "comma")` | "A, B, C or D" for quest labels; "A, B" for code names |

### 2.7 Keys and text safety

| Export | Value |
|---|---|
| `cardsAtLevelKey(domainIds, L)` | `CARDS_AT_LEVEL\|d:<sorted, de-duplicated ids>\|L<n>` |
| `practiceKeptKey(templateIds, from)` | `PRACTICE_KEPT\|t:<sorted ids>\|from:<day>` |
| `proficiencyKey(roadmapId)` | `PROFICIENCY\|r:<id>` |
| `checkpointLogPrefix(lineage)`, `checkpointLogKey(lineage, nonce)`, `SELF_KEY_PREFIX` | `SELF\|CHECKPOINT\|i:<lineage>\|n:<nonce>`; `"SELF\|"` |
| `parseMeasureKey(key)`, `ParsedMeasureKey` | The inverse of the builders, ids sorted; null otherwise. Builders throw on an empty scope, an id with `\|` or `,`, a level outside 1..20 or a bad day |
| `ROADMAP_CAPTURE_PREFIX`, `milestoneGoalKey(id)`, `milestonePracticeKey(id, i)`, `milestoneStepKey(id, i)` | `rm:<id>`, `rm:<id>:p<i>`, `rm:<id>:s<i>` (i in 0..99, the caller's place). All pass `cleanCaptureKey` |
| `questWeekKey(milestoneId, weekStart)` | `rq:<id>:<weekStart>` |
| `packText(s, max)` | NFC → every whitespace run (U+2028, U+2029, NBSP …) to one space → \p{Cc}\p{Cf} stripped → `<`/`>` to `‹`/`›` → trimmed → capped at max code points |
| `isCredentialAim(aim, examLabel)` | An exam label, a CREDENTIAL_WORD, or an all-caps token of 2–6 letters. Note: "EUR/USD" counts, so the trading aim in the mockups reads as a credential aim and bulk keep is off for it. That is the spec's rule as written; flagged for the lead |
| `isMissingRoadmapTable(err)` | P2021 or 42P01 naming a Roadmap* table; false for another table, a missing column, any other error |

### 2.8 Shapes

All are serialisable: no Date objects (ISO strings and DayKeys only), and no functions.

- **Intake and pack:** `Syllabus`, `Intake`, `PackSection` and `PACK_SECTIONS` (the privacy line is generated from this list), `PackDomainLine` (atSix, atTop), `PackKeymap` (server-only), `EvidencePack`, `DraftReply` and `DraftReplyMilestone`.
- **Drafts:**
  - `ItemDraft` mirrors RoadmapItem. A TOPIC whose Domain is proposed carries that DOMAIN item's `proposedName`. `struck` holds the NUMBER spans.
  - `MeasureScope`, `MeasureSpec`, `MilestoneNote` (codes), `MilestoneDraft`, `DropReason`, `ReportEntry`, `ValidationReport` `{dropped, flagged, notes}`, and `ValidatedDraft` (bulkKeepOff, credential, nonEnglish, uncoveredSyllabus, alarm).
- **Readings and realism:**
  - `Reading`, `EndStateTerm`, `PlanWindow`, `RealismScope` (each scope carries its own rateSource and rate) and `RealismInput`.
  - `KnowledgeCheck`, `WeekLoad`, `TimeCheck`, `PlanWeek`, `MilestoneFeasibility` (`kind: "PLAN"`) and `AimCheck`.
  - `Feasibility` is plan-level: `{today, m, milestones: MilestoneFeasibility[], aimCheck, basis, remedies, impossible, over}`. The spec's `{knowledge, time, aimCheck, basis, remedies}` is split into the per-milestone part (knowledge per measure, time, worst) and the plan part (aimCheck and the plan's basis and remedies), because "no plan-level verdict chip exists".
  - `StartWeek` and `StartSnapshot` (`kind: "START"`; pStart, pCalibrating, yieldStart, newNeededStart, wwStart, and needRate per week). RoadmapMilestone.feasibility holds a `MilestoneFeasibility` before Start and a `StartSnapshot` after; read the `kind`.
- **Pace, Proficiency and rank:** `PaceResult`, `PracticePace`, `TriggerHit`, `ProficiencyCardTerm`, `ProficiencyPracticeTerm`, `ProficiencyBasis`, `ProficiencyParts`, `ProficiencyClass`, `ProficiencyRebaseCause`, `ProficiencyRebase`, `ProficiencyDetail` (the reading's detail), `ProficiencyChange`, `ProficiencyView` (figure, percent, class, parts, shares, measuredAt, change, live), `NextRank`, `AimRankLadderRow` and `AimRankView`.
- **Week quests:**
  - `WeekQuestUnit`, `WeekQuestVariant`, the spec kinds `RaiseQuestSpec`, `AddQuestSpec`, `PracticeQuestSpec`, `StepQuestSpec` and `CheckpointQuestSpec`, their union `WeekQuestSpec`, and `WeekQuestSet`.
  - The inputs: `WeekQuestCardInput`, `WeekQuestPracticeInput`, `WeekQuestStepInput`, `WeekQuestCheckpointInput` and `WeekQuestInput`.
  - `QuestEvidence` (one variant per kind), `WeekQuestProgress`, `WeekQuestResults`, `WeekQuestRow`, `WeekQuestsView` and `PastWeekView`.
  - Additions to the spec's fields:
    - `AddQuestSpec` carries `fieldId`, `pace`, `writingWeeksLeft` and `lastCardDay`. QUESTS_BEHIND and its copy ("asks 4 of the 8 needed … ends Sun 22 Nov") need them after the freeze.
    - `RaiseQuestSpec.bestCase` carries the "best case" label.
- **Economy and Start:** `StatedZeroReason`, `ItemDecisionChoice`, `ItemEdit`, `DomainResolution` (MAP, CREATE, CHECK, DROP), `AcceptChoices`, `StartChoices`, `TodayBoundRow`, `StartPracticeRow` and `StartPreview`.
- **Pages:**
  - `IntakeFieldOption` and `IntakeView`.
  - `AreaChip`, `TargetLowered`, `AimCardState`, `AimCardMilestone` and `AimCardView`. `questWeekUnfrozen` tells /you to schedule the fallback freeze.
  - `RoadmapViewState`, `RoadmapHeader`, `RunView`, `DraftView`, `MeasureRowView`, `MilestoneRowState`, `MilestoneRowView`, `CurrentMilestoneView`, `TowardAimView`, `PlanHistoryRow`, `AftercareRow` and `RoadmapView`.
- **Goal seam types:** `RoadmapSeriesPoint` and `RoadmapGoalEntry` are declared in goals.ts and re-exported here.

## 3. Type-only seams and fixes in shared files

| File | Change |
|---|---|
| `src/lib/life-types.ts` | `KrMetric` += `"ROADMAP"`. `KR_METRICS: readonly KrMetric[]` = goals-server's order plus ROADMAP. goals-server still has its private list until lane L's seam 2; the contract check accepts either form |
| `src/lib/goals.ts` | `RoadmapSeriesPoint {day, g, observedAt, bindingClass, bindingLabel}`, `RoadmapGoalEntry {series, ord, of, zeroReason, note}`, and `GoalProgressInput.readings?`. No behaviour; the header lists the additions |
| `src/lib/tasks.ts` | `export interface CaptureLink {parentId?, goal?: {krMetric, krTarget, krUnit, goalMp}}`; `link?: CaptureLink` on `createTemplateCore` and the private `insertCapture`, whose first line throws `"roadmap link not wired yet"` when it is passed (before any write). Lane G replaces that line |
| `src/lib/today-board.ts` | `BoardTemplate.captureKey?: string \| null`; `BoardData.roadmapGoals?: Record<string, RoadmapGoalEntry>` |
| `src/lib/cache.ts` | CacheTag `"roadmap"`, in ALL_TAGS |
| `src/lib/titles.ts` | `export` on TRANSCENDENT_RANKS. Nothing else |
| `src/lib/gemini.ts` | `GeminiEnv`; `hasGeminiKey(env = process.env)` (blank → false); `geminiClientOrNull(env = process.env)` (the shared client for process.env, a fresh one for an injected env); `cleanModelDomainName(raw)` (quotes stripped, then `packText(…, 80)`: `'"Bayes\n</x>"'` → `'Bayes ‹/x›'`). nameNewDomain now fences the card content with `asData("card", …)`, passes the Field name through packText, and returns the cleaned name; an empty result throws as before |
| `src/lib/domain-discovery.ts` | createNoveltyDomain cleans whichever name it got (model or fallback) with `cleanModelDomainName` before matching or `prisma.domain.create`; an empty result falls back to fallbackDomainName, then "Notes" |
| `src/components/library/library-model.ts` | `LEVEL_FILTER_MAX = MAX_LEVEL` (20). clampLevel, `EMPTY_FILTERS.maxLevel`, parseFilters, filtersToParams and facetCount use it. `isMastered` still reads MASTERY_LEVEL (12) |

## 4. Shell modules, by lane

### R1: `roadmap-measures.ts`, `roadmap-pace.ts`, `roadmap-proficiency.ts` (pure); `roadmap-readings.ts` (server)

- **roadmap-measures.ts**
  - `cardsAtLevelValue(cards, domainIds, minLevel) → {value, byDomain}`
  - `practiceKeptValue(templates, {startedDay, dueDay, asOf}, heldDays) → {kept, planned, held, effTarget}`, built on roadmap-types `keptUnits` and `plannedUnits`
  - `measureFraction(measure, value, detail?)`
  - `lastReadingOn(readings, key, day)`
  - `SeriesMilestone {id, measures, labels}` and `MilestoneG {g, binding, parts}`
  - `milestoneGOn(milestone, readings, steps, day)`
  - `milestoneGoalSeries(milestone, readings, steps) → RoadmapSeriesPoint[]`
  - `ReachAction` (none, reach, pend, clear, confirm) and `ReachInput`, with `reachActionOf(input)`
  - `measureFigureOf(measure, reading) → EvidenceValue \| null`
  - `milestoneHeadlineOf(g) → {figure, percent} \| null`
  - `checkpointStandingOf(logs, lineage, outOf, bar)`
- **roadmap-pace.ts**
  - `projectCards(measure, cards, p \| null, paceSinceStart, today, m)`
  - `projectPractice(kept, remainingPlanned, keptShare, effTarget)`
  - `TriggerMilestone` and `TriggerInput`, with `triggersOf(input) → TriggerHit[]`
- **roadmap-proficiency.ts**
  - `ProficiencyBasisInput` with `proficiencyBasisOf`
  - `ProficiencyInput` (cardLevels by measureKey, kept by lineage, reached, reachedOnTicks) and `ProficiencyResult`, with `proficiencyOf`
  - `proficiencyDetailOf(result, basis, {reached, scheduled, rebased})`
  - `proficiencyChangeOf(current, beforeThisWeek, today)`
  - `proficiencyViewOf(current, beforeThisWeek, today, live)`
  - `assignRankIndices` (typed `AssignRankIndices`)
  - `RankMilestone` and `AimRankInput`, with `aimRankOf(input) → AimRankView`
- **roadmap-readings.ts**
  - `ReadingsCaller` (CHAIN, LIFE_CRON, DEGRADE_CRON)
  - `recordRoadmapReadings(userId, now, opts & {caller?}) → ReadingsRun`. The stub returns `{written: 0, reaches: 0, skipped: "NO_ROADMAP"}` and never throws.
  - `recordCardsForReview(userId, ideaId, domainId, oldLevel, newLevel, opts)`
  - `recordPracticeForTemplate(userId, templateId, opts)`
  - `ReadingRow`, with `readingUpsertOp(userId, row, observedAt) → Prisma.PrismaPromise<number>` and `writeReadings(userId, rows, observedAt, opts) → number`
  - `ReadingOps` (ops, rows, point, reach, live), with `readingOpsFor(userId, goalId, now, opts)`
  - `loadRoadmapGoalSeries(userId, goalIds, today) → Record<goalId, RoadmapGoalEntry>`. The stub returns `{}`. It is the **one query** lanes T and L attach (a missing table → `{}`).
- **Notes:**
  - Every writer that writes a roadmap's reading also writes its PROFICIENCY reading.
  - The throttle applies only to the CHAIN caller.
  - A writer never fails its caller.
  - `measureFigureOf`, `milestoneHeadlineOf` and `proficiencyViewOf` are where R4's views get their branded figures (R4 may not call the constructors).

### R2: `throughput.ts` (pure), `throughput-server.ts`, `roadmap-realism.ts` (pure)

- **throughput.ts:** `ThroughputTaskRow`, `ThroughputTemplate`, `ThroughputRows`, `throughputOf(rows) → Throughput` and `weeklyFigureOf(weekly)`.
- **throughput-server.ts:** `loadThroughput(userId, finalDay) → Throughput`, cached on ['life', 'activity', 'fields']. R6 passes `weekStart − 2` to read "as if on Monday".
- **roadmap-realism.ts:**
  - `splitWindows(today, targetDay, count?) → PlanWindow[] \| null`. Passing `count` re-splits over fewer milestones (F6 step 1, for R3).
  - `thresholdFor(dueDay, today, startPoint, previous, m)`
  - `CardReach`, with `cardReach(scope, L, dueDay, input, rate)`
  - `availableFor(weekStart, input) → {minutes, class, unverified, rampBinds}`
  - `fitPlan(plan, input)`
  - `feasibilityOf(plan, input) → Feasibility`
  - `applyRemedy(plan, input, remedy)`
  - `starterLadder(intake, input, names, makeId)`
  - `manualLadder(intake, input, makeId)`
  - `refit(plan, input)`
  - `StartRefit`, with `refitForStart(milestone, plan, input)` and `startSnapshotOf(milestone, refitted, input, startedDay)`
- **Notes:**
  - The concrete splitWindows goldens (35 days from a Wednesday, 70/200/400/1,080, 1,081 refused) are R2's realism-check. roadmap-contract-check pins only the arithmetic splitWindows rests on.
  - roadmap-realism.ts is the only caller of `codeText()`.

### R3: `roadmap-model.ts` (server), `roadmap-evidence.ts`, `roadmap-validate.ts`, `roadmap-lexicon.ts` (pure)

- **roadmap-model.ts:**
  - `ROADMAP_SYSTEM_INSTRUCTION` (stub "")
  - `ModelRequest`, `CallModel = (req) => Promise<unknown>` and `ModelSample`
  - `buildResponseSchema(pack)`
  - `seedBaseFor(forcedRedraftsToday)`
  - `defaultCallModel`, which must refuse under `process.env.ROADMAP_CHECK === "1"` and use `geminiClientOrNull()`
  - `draftSamples(pack, n, {callModel?, seedBase}) → ModelResult<ModelSample>[]`. The stub returns `{ok: false, error: "Not yet."}` × n.
- **roadmap-evidence.ts:** `EvidenceDomain`, `EvidenceInput`, `buildEvidencePack(input)`, `packUserContent(pack)`, `methodsForRun(constraints, practicesAllowed)`, and `inputHashMaterial(pack, intake, model, samples)`, the string R4 hashes with sha256 (node:crypto stays out of pure code).
- **roadmap-validate.ts:** `ValidateDomain`, `ValidateContext` (with an injected `makeId`), `validateSample(parsed, ctx) → ValidatedDraft`, `LabelContext`, `LabelCheck`, `checkLabel(label, ctx)` (the client re-runs it on Edit and [Create]), `DomainMatch`, `matchDomainName(name, domains, areaFieldId)`, `isNonEnglish(aim)` and `bulkKeepAllowed(intake)`.
- **roadmap-lexicon.ts:** `RESOURCE_WORDS`, `CLAIM_WORDS`, `ABOUT_YOU_WORDS`, `HEALTH_WORDS`, `SPELLED_NUMBER_WORDS`, `DATE_WORDS`, `NEGATION_CUES`, `METHOD_KEYWORDS`, `SPEND_WORDS`, `COACH_EXCLUSIONS` and `DOMAIN_STOP_WORDS`. All are empty in the stub; the spec's lists are in each doc comment.
- **Notes:**
  - `CREDENTIAL_WORDS` and `ENGLISH_FUNCTION_WORDS` are in roadmap-types.
  - The spec's pack example says "starting point: SOME_BASICS", but the StartPoint union is NEW, BASICS, WORKING, STRONG. Print the union's value, or a word for it, consistently.
  - roadmap-model-check's spec says it "deletes GEMINI_API_KEY first": rely on `import "./_no-model"` instead (§0).

### R4: `roadmap-economy.ts` (pure), `roadmap-server.ts`, `src/app/actions/roadmap.ts`

- **roadmap-economy.ts:** `StatedInput {practiceMinutesPerWeek, plannedTrackedMinutesPerWeek, hasCards, lineagePaidOn}`, `StatedForMilestone {stated, zeroReason, paidOn}` and `statedForMilestone(input)`.
- **roadmap-server.ts** takes `RoadmapDeps extends RoadmapWriteOpts {defer?, applySizing?, callModel?}`. Every core returns `RoadmapActionResult` unless noted.
  - **Intake:** `saveIntakeCore(userId, intake, now, deps) → {roadmapId}`; `loadIntakeView(userId, now) → IntakeView`; `discardDraftCore` and `undoDiscardCore`.
  - **Drafting:**
    - `claimDraftCore(userId, roadmapId, {force}, now, deps) → {runId, status}`
    - `runDraftCore(runId, deps) → void`
    - `buildStarterCore` and `startManualCore` → `{runId}`
  - **Review:**
    - `decideItemCore(…, itemId, decision)`
    - `editItemCore(…, itemId, edit)`
    - `keepUnflaggedCore(…, milestoneId) → {kept}`
    - `resolveDomainCore(…, itemId, resolution) → {domainId}`
    - `applyRemedyCore(…, roadmapId, remedy)`
  - **Accept:** `acceptCore(…, roadmapId, choices) → {version}`; `undoAcceptCore(…, roadmapId, version)`.
  - **Start:**
    - `startPreview(userId, milestoneId, now, deps) → StartPreview \| null`
    - `startMilestoneCore(…, milestoneId, choices) → {goalId}`
    - `finishStartCore → {goalId}`
    - `returnStartingCore`
    - `startAgainCore → {milestoneId}`
  - **Measures:** `logCheckpointCore(…, itemLineageId, {score, outOf?, note?, nonce})`.
  - **Lifecycle:**
    - `replanCore(…, roadmapId, kind) → {version}`
    - `archiveRoadmapCore(…, roadmapId, {reason, archiveGoal})`
    - `markRoadmapDoneCore(…, roadmapId, reason)`
    - `practiceAftercare(userId, roadmapId) → AftercareRow[]`
  - **Views:** `loadRoadmapView(userId, now) → RoadmapView`; `loadAimCard(userId, now) → AimCardView \| null` (the stub returns null).
- **actions/roadmap.ts** ("use server"; every action reads the user id itself, never throws, and answers `ROADMAP_NOT_YET` until R4 lands):
  - Intake and drafting: `saveIntake(intake)`, `draftRoadmap(id)`, `redraft(id)`, `buildStarter(id)`, `startManual(id)`, `discardDraft(id)`, `undoDiscard(id)`
  - Review: `decideItem(itemId, decision)`, `editItem(itemId, edit)`, `keepUnflagged(milestoneId)`, `resolveDomain(itemId, resolution)`, `applyRemedy(id, remedy)`
  - Accept: `acceptPlan(id, choices)`, `undoAccept(id, version)`
  - Start: `loadStartPreview(milestoneId)`, `startMilestone(milestoneId, choices)`, `finishStarting(id)`, `returnStarting(id)`, `startAgain(id)`
  - Measures and lifecycle: `logCheckpoint(lineage, score, outOf, note, nonce)`, `replan(id, kind)`, `archiveRoadmap(id, {reason, archiveGoal})`, `markRoadmapDone(id, reason)`, `dismissAimPrompt()`
- **Notes:**
  - The roadmap's archive and done are named `archiveRoadmapCore` and `markRoadmapDoneCore`, so they don't collide with tasks.ts `archiveCore` (which practice aftercare uses).
  - inputHash = sha256(`inputHashMaterial(…)`).
  - Start passes `link` to tasks.ts createTemplateCore. It throws "roadmap link not wired yet" until lane G's seam 5, so your Start test goes green at integration, or inject the create.

### R5: `src/components/roadmap/roadmap-copy.ts`, `WeekQuests.tsx`, `AimCard.tsx` (replace the shells; not roadmap-events.ts)

- **roadmap-copy.ts:** `METHOD_HOW`, `topicHow(domain)`, `PROVENANCE_WORDS`, `WEEK_QUEST_CAPTIONS`, `TIME_FIXED_LINE`, `AIM_UNCHECKED_LINE`, `CREDENTIAL_LINE`, `HEALTH_LINE`, `CONSTRAINTS_LINE`, `NO_KEY_LINE`, `FREE_TIER_LINE`, `privacyLine(sections)`, `levelPhrase(level, m)` and `verdictWord(verdict, unverified?)`. In the stub every string is empty.
- **`WeekQuests({variant, view})`:** `WeekQuestsProps {variant: WeekQuestVariant; view: WeekQuestsView}`. Named export; renders nothing in the stub.
- **`AimCard({view, promptDismissed?})`:** `AimCardProps`. Named export; renders nothing in the stub.
- **Notes:**
  - Props are serialisable, so either component may become a client component. Today's PRACTICE and STEP rows call `seekTemplate(templateId)` from roadmap-events.ts.
  - Rows never carry `data-template-id`, and never link to /review.

### R6: `roadmap-quests.ts` (pure), `roadmap-quests-server.ts`

- **roadmap-quests.ts:**
  - `weekQuestsFor(input) → WeekQuestSet`
  - `questProgress(spec, evidence) → WeekQuestProgress`. PRACTICE uses roadmap-types `keptUnits`.
  - `weekQuestResultsOf(set, progress, closedDay, heldAfterFreeze)`
  - `weekDoneShare(set, results, nonHeldShare)`
  - `questsBehind(set)`
  - `WeekQuestsViewInput`, with `weekQuestsViewOf(input) → WeekQuestsView`
  - `pastWeekOf(set, results, milestoneOrd, today)`
- **roadmap-quests-server.ts:**
  - `WeekQuestsLoad {set, frozen, progress, view}`
  - `loadWeekQuests(userId, now) → WeekQuestsLoad \| null` (the stub returns null)
  - `freezeWeekQuests(userId, now, source, opts) → QuestFreezeRun`
  - `finalizeQuestWeeks(userId, now, opts) → QuestFinalizeRun`
  - `weekQuestSetFor(userId, milestoneId, weekStart, now)`
  - `questWeekInsertOp(userId, roadmapId, set, source, now) → Prisma.PrismaPromise<number>` (finishStartCore's transaction)
  - `loadPastWeeks(userId, roadmapId, today)`
- **Notes:** Your goldens need nothing from R1 or R2. The reach helpers, `plannedUnits` and `keptUnits` are all in roadmap-types.

## 5. `src/components/roadmap/roadmap-events.ts` (final)

| Export | Meaning |
|---|---|
| `SEEK_TEMPLATE_EVENT` | `"xtnl:seek-template"` (a window CustomEvent; typed through a `WindowEventMap` augmentation) |
| `SeekTemplateDetail` | `{templateId: string}` |
| `isSeekTemplateDetail(v)` | The guard: a `[A-Za-z0-9_-]{1,64}` id |
| `seekTemplate(templateId)` | Dispatches the event; R5's Today rows call it |
| `onSeekTemplate(handler) → unsubscribe` | Lane T's TodayBoard listener, which runs the board's existing seek and opens Anytime when the task is there |

## 6. Scripts and package.json

- **`scripts/_no-model.ts`:** see §0.
- **`scripts/roadmap-contract-check.ts`** runs 152 checks:
  - the floors and LEVEL_WEIGHT, against xp.ts's own `nextIntervalDays`, including its jitter's lowest draw;
  - the reach goldens and the worked example's 18.4;
  - plannedUnits and keptUnits;
  - the key round-trips and refusals, and every constant at its value;
  - the window arithmetic for every span from 35 to 1,080 days;
  - the brands: 8 `@ts-expect-error` lines, each verified to fail for the intended reason;
  - provenanceOf for all 20 pairs, weakest, labelTextOf, yoursText and codeText;
  - packText, the Domain-name cleaner and hasGeminiKey;
  - the rank goldens and ladder disjointness;
  - the week quest cap, isMissingRoadmapTable, and the seams (KR_METRICS, the cache tag, the event, the titles export, the 8 models with `@@schema`, and the migration's tables and pre-apply grep);
  - that every lane-0 module exists, and the quest-isolation grep;
  - the _no-model grep over every script.
  It never calls a shell, so it stays green after the lanes land.
- **`scripts/study-side-check.ts`:** the Library cases. The range clamps to 1..20; lv=13-20 survives the URL; a range ending at 12 now writes its `lv`; a level-15 and a level-20 card are listed under the default filter; a level-15 card is Mastered.
- **package.json** gains `roadmap-contract:check`, `roadmap-measures:check`, `throughput:check`, `roadmap-realism:check`, `roadmap-model:check`, `roadmap-server:check`, `roadmap-quests:check` and `roadmap-ui:check`. **Integrated in the fix round:** life:check ends with the seven in the Acceptance order (roadmap-contract, roadmap-measures, throughput, roadmap-realism, roadmap-model, roadmap-server, roadmap-quests), and ui:check ends with roadmap-ui-check (§9.5).

## 7. Notes for the integration lanes

- **Lane T (Today):**
  - BoardData.roadmapGoals comes from R1's `loadRoadmapGoalSeries(userId, goalIds, today)`, one query and only when an open ROADMAP goal exists; add 'roadmap' to the board's cache tags.
  - Mount `<WeekQuests variant="today" view={wq.view} />` as `questsSlot`.
  - When `!wq.frozen`, the page's existing after() calls `freezeWeekQuests(userId, now, "RENDER")`.
  - Listen with `onSeekTemplate`.
- **Lane G (goals, tasks, settlement, resets, degrade):**
  - The roadmap step is, in order:
    1. `freezeWeekQuests(userId, now, "CRON" | "RENDER")`;
    2. `recordRoadmapReadings(userId, now, {caller})`;
    3. `finalizeQuestWeeks(userId, now)`.
  - Each runs in its own try. Assemble `RoadmapStepReport` for the cron JSON.
  - The degrade route calls only `recordRoadmapReadings(…, {caller: "DEGRADE_CRON"})`.
  - The completion and undo hooks call `recordPracticeForTemplate(userId, templateId)` for every template.
  - Replace the `link` throw in insertCapture, and add `captureKey: true` to TEMPLATE_SELECT.
  - The reset catches `isMissingRoadmapTable`.
- **Lane Y (You and rules):**
  - Join `loadAimCard(userId, now).catch(() => null)` with loadSheet in one Promise.all, and read the `AIM_PROMPT_COOKIE` cookie on the server.
  - Render `<AimCard view promptDismissed />` under CharacterHero.
  - When `view.questWeekUnfrozen`, schedule the RENDER freeze in the page's after().
  - The rules page reads the constants from roadmap-types.
- **Lane L (frozen contracts):**
  - goals-server `metricOf` should read `KR_METRICS` from life-types. roadmap-contract-check then passes on the import.
  - The ROADMAP branch reads `GoalProgressInput.readings`.
  - `prepareRoadmapGoalClose` and closeGoalCore use R1's `readingOpsFor`.
  - review.ts's after() calls `recordCardsForReview`.

## 8. Open points for the lead

1. **_no-model blanks rather than deletes.** The spec's "deletes GEMINI_API_KEY" is defeated by `@prisma/client`'s `.env` load, which re-adds deleted variables (verified). Blanking keeps the guarantee.
2. **`keptUnits` was added to roadmap-types.** The spec lists only `plannedUnits`, but R1's PRACTICE_KEPT and R6's PRACTICE progress must count kept units by one rule (F14 says "by the PRACTICE_KEPT rules"). Putting it here keeps R6's goldens independent of R1.
3. **`Feasibility` is plan-level**, with per-milestone parts (§2.8).
4. **`isCredentialAim` counts any 2–6-letter all-caps token.** "EUR/USD" makes the mockups' trading aim a credential aim, so bulk keep is off for it. That is the spec's rule as written; decide whether to keep it.
5. **LibrarySearch.tsx** (not in any lane) still caps the level inputs at MASTERY_LEVEL, and its chip clears to 12 (see the lane-0 handoff; still open after both fix rounds, §9.7). Since library-model defaults the filter to 1–20, this is now a live bug: once the user edits the max input, levels 13–20 can't be listed again.
6. **The nameNewDomain cleaner swaps angle brackets to ‹ › rather than deleting them**, as the spec's golden `'Bayes ‹/x›'` requires.

## 9. Added in the fix round

Three reviewers read the built lanes (economy and idempotency; honesty and UI at 344 px; model safety). Lane 0 went first and alone in the fix round and added what their findings, gaps and handoffs needed in lane-0 files. Every addition is a new export or an **optional** field, so nothing that compiled before stops compiling. tsc does not force the producers to fill the optional fields, so each one names the lane that fills it, and that lane's check pins it.

### 9.1 New pure helpers in roadmap-types.ts (pinned in roadmap-contract-check)

| Export | Signature and meaning | Who calls it |
|---|---|---|
| `PositionRow` | `{id, lineageId, version, status, rankIndex?, createdAt?}`: a milestone row as the position helpers read it. `createdAt` (ISO, ms or Date) orders a "Start again" copy after the row it replaces | R1, R4, G |
| `isNewerRow(a, b)` | Higher version, then later createdAt, then the larger id | — |
| `isSupersededRow(row, rows)` | A STARTING or STARTED row whose lineage has a **newer STARTING or STARTED** row (its "Start again" copy, once that copy starts). It is never measured again and its goal pays 0 ("replaced by Start again"), whatever its goal does later, an unarchive included. A copy still PLANNED supersedes nothing: unarchiving the dropped goal before the copy starts undoes DROPPED (F15, F22). The copy then can't start while that goal is open (STARTED_ELSEWHERE), and Start's lineage-paid check states 0 if the original paid. At most one goal of a lineage pays. (The review proposed PLANNED as well; that would leave an unarchived original unmeasurable while blocking its copy's Start) | R1 readingOpsFor, its writers and loadRoadmapGoalSeries; R6's open milestone; R4's views; lane G's unarchive |
| `positionCountOf(rows)` | Distinct lineages. acceptCore's scheduled total against MAX_MILESTONES counts this, never rows | R4 acceptCore |
| `maxScheduledPositionsOf(rows)` | "The most milestones scheduled in one version": per version, the distinct lineages of its scheduled rows (rankIndex set; not DRAFT or DISCARDED) plus the lineages carried from earlier versions. A dropped row and its copy count once, so a 3-milestone plan tops out at Specialist, never Paragon | R4 rankInputOf (topRankIndexOf's input) |
| `milestoneDueDayOf(milestoneDue, goalDue?)` | **One due day:** the goal's TaskTemplate.dueDay once started (a Reschedule moves only that), else the milestone's | R1 (planRoadmapWrite, the as-of reads, readingOpsFor, loadRoadmapGoalSeries), R4 (headline, loadAimCard's pastDue, the views), R6 (already `goal?.dueDay ?? ms.dueDay`) |
| `countsTowardDraftCap(run)` | **The cap's one definition:** a GEMINI run of the life day whose status is not REUSED. RUNNING, OK, PARTIAL, FAILED and CAPPED all count (the spec's literal rule). R4's SQL guard mirrors it as `kind = 'GEMINI' AND status <> 'REUSED'` | R3 draftsCountedToday / draftCapReached / draftsLeftToday (CAPPED now counts), R4 claimPlanOf |
| `RunWriter`, `RUN_FALLBACK_STARTER` | `"GEMINI" \| "INHOUSE" \| "MANUAL" \| "STARTER"`; `"STARTER"` is stored as `RoadmapRun.report.fallback` on a FAILED Gemini run that wrote R2's starter | R4 runDraftCore's FAILED persist |
| `runWriterOf(run)` | What a run wrote: GEMINI for an OK, PARTIAL or REUSED Gemini run; STARTER for a FAILED one with the fallback; INHOUSE or MANUAL for an OK run of that kind; null for RUNNING, CAPPED or a FAILED run that wrote nothing | — |
| `rowsWriterOf(runsNewestFirst)` | The newest run that wrote rows. A CAPPED "Draft again" over a Gemini draft still reads Gemini | R4 runViewOf → `RunView.wrote` |
| `StartPayBasis` | `{otherMinutesPerWeek: number \| null, hasCards, lineagePaidOn}`: statedForMilestone's inputs that don't depend on the Start sheet's switches | R4 startPreview, finishStartCore |
| `practiceMinutesPerWeekOf(item)` | Sessions a week × the band (the method's default band, else D30): R4's private `weeklyMinutes` | R4, R1 |
| `otherTrackedMinutesOf(weeks)` | Mean over the weeks of reviewMin + newPerWeek × CARD_WRITE_MIN; null with no weeks | R4, R1 |
| `startStatedInputOf(basis, practices, off)` | statedForMilestone's `StatedInput` for one switch set: practice minutes = Σ weeklyMinutes of the practices left on, planned = other + practice. **One arithmetic** for the sheet (on every switch), startPreview, finishStartCore (frozen goalMp) and R1's zero-reason read-back | R4, R5, R1 |
| `roadmapStepErrorsOf(parts)` | `"freeze: …"`, `"readings: …"`, `"finalize: …"` for each part that returned `error` | Lane G (runRoadmapStep, recordRoadmapAfterDegrade) |

### 9.2 New optional fields on the shapes

| Field | Meaning | Filled by → rendered by |
|---|---|---|
| `ReadingsRun.error?`, `QuestFreezeRun.error?`, `QuestFinalizeRun.error?` | A caught failure, in words. The writers never throw, so this is how the cron JSON's `errors` learns of one. A missing table stays `skipped: "MISSING_TABLE"` | R1, R6 → G (roadmapStepErrorsOf) |
| `LibraryDomain` and `RoadmapView.library?` | `{id, name, fieldId, fieldName, cards, atSix, atTop, level, sample?}` for every Field's Domains, on every view that shows a roadmap. Sample titles are read on the server and never reach a model. **undefined means "not loaded here"**: no Map to… picker, and "Your Domains weren't checked here", never "None of your Domains is similar". R5's own `LibraryDomain` in roadmap-ui-model.ts has the same shape; re-export this one | R4 loadRoadmapView (from the Field tree it already reads) → R5 |
| `MeasureRowView.label?` | The measure's words, e.g. an end-state row's `EndStateTerm.label` ("Probability, Inference · cards at level 6+") | R4 → R5 TowardAim |
| `CurrentMilestoneView.stepDone?` | step lineage → the day its task was ticked, or null ("done Tue 12 Jan") | R4 → R5 |
| `CurrentMilestoneView.practiceKept?` | practice lineage → `{kept, of}` so far, from the stored PRACTICE_KEPT detail (`byLineage`) ("kept 10 of 16 so far") | R4 → R5 |
| `CurrentMilestoneView.paidOn?`, `StartPreview.pay.paidOn?`, `AimCardMilestone.start.paidOn?` | With LINEAGE_PAID: the day that lineage paid ("pays nothing · this milestone already paid on 3 Mar"). statedForMilestone already returns `paidOn` | R4 → R5 copy |
| `MilestoneRowView.titleClass?`, `AimCardMilestone.titleClass?` | `provenanceOf(titleOrigin, titleDecision)`. DRAFT and KEPT_SUGGESTION render "Gemini's words · not checked" beside the title: the Milestones list, the outline header, the Now header and the Aim card's milestone line | R4 → R5 |
| `MilestoneDraft.titleFlags?`, `titleStruck?`, `titleReasons?` | A GEMINI title's blocking flags, NUMBER spans and reasons. There is no column: R4 derives them on read with `checkLabel(title, labelContextFor(…, "MILESTONE", {milestoneOrd, milestoneCount}))` (R3 handoff 1) | R4 draftOf / draftRowsOf → R5 titleItemOf (not `flags: []`) |
| `ItemDraft.reasons?` | LabelCheck.reasons for a flagged row, naming what set the flag ('names "Kestrel", which you didn't write'). `ItemDraft.struck` is likewise **derived on read** by R4 for a flagged GEMINI row, with the roadmap's full LabelContext (the syllabus included, which the client doesn't have) | R4 → R5 ItemRow (a client recompute is only a fallback) |
| `RunView.wrote?` | `rowsWriterOf(the roadmap's runs, newest first)`. The draft header's lead line and the fallback banner key on this, never on the latest run's own kind or status | R4 runViewOf → R5 DraftReview |
| `RunView.capped?` | The latest run is CAPPED: show DRAFT_CAP_LINE and claim nothing about the rows shown | R4 → R5 |
| `StartPreview.payBasis?`, `StartPracticeRow.weeklyMinutes?` | What the pay line is worked out from. The sheet recomputes `statedForMilestone(startStatedInputOf(payBasis, practices, off))` on every switch, so the line it shows when the user taps Start is the figure finishStartCore freezes | R4 → R5 StartSheet |
| `StartSnapshot.aftercareKept?` | TaskTemplate ids the user kept on Today after the milestone finished ("Keep on Today"). It needs no column: it rides `RoadmapMilestone.feasibility`, as R4's milestone notes do. practiceAftercare leaves them out | R4 (a new action; see 9.4) → R5 |

### 9.3 Semantics the contract now states (doc comments in roadmap-types.ts)

- **AimCardState ACCEPTED** means a plan is accepted and **no milestone has ever been carried**. Between milestones (the next one still PLANNED after a reach), the card is ACTIVE. That keeps the rank-up's "new" marker, the Proficiency meter, its change line and its parts on the card (R4 loadAimCard; R5 uses the compact rank line only while ACCEPTED).
- **AimCardView.draftItems** counts **the next milestone's undecided rows only** (the review footer's "N items left in milestone 1"), never outline items.
- **RoadmapView.draft** is a DRAFT roadmap's draft **or an ACTIVE roadmap's pending re-plan** (version + 1). Both render the review with decide, accept and discard. The re-plan sits above Now as "Re-plan draft · not accepted yet" (R5). acceptCore and discardDraftCore take that version (R4).
- **MeasureRowView.basisClass** for an end-state row is the weakest class over the Domain items, across the scheduled milestones, in its scope. It is never a hard-coded WORKED_OUT (R4). R5 appends "worked out on Gemini's suggested Domains (not checked)" (or "(kept, not checked)") when it is DRAFT or KEPT_SUGGESTION.
- **A NUMBER-flagged title** offers only Edit: decideItemCore's title branch and the Start sheet's `ref === m.id` branch refuse KEPT and CHECKED when `titleFlags` holds NUMBER, and bulk keep skips any flagged title (R4, R5).
- **EDITED means the words changed** (lead to confirm; the spec says an Edit "makes the item EDITED (YOURS)"). A label edit that changes the text makes the item EDITED and clears its flags. A plan-only edit (sessions, band, rule, kind, bar, outOf, or a target) keeps the item's decision and sets `planSource` YOURS. Otherwise "Set the bar" or an unchanged Edit sheet turns Gemini's words into "You wrote this" with no tap (R4 editItemCore). R6's questLabelOf allows a NUMBER label only for origin USER or SYLLABUS, or a label actually edited (flags cleared).
- **The writers never throw.** A caught failure is the result's `error`, and the step reports it (roadmapStepErrorsOf).
- **Writes off** (`RoadmapView.writesOff`): the server records nothing, but the figures shown are the *stored* readings, with their real "measured" times. Only values computed on the request (R6's unfrozen week; a Proficiency with `live` true, which a stored reading never is) read NOT_RECORDED_HERE. R5's banner reads: "This server records nothing: readings here are the live app's own. Roadmap changes are recorded only on the live app."

### 9.4 Cross-lane agreements (each lane implements its side)

1. **readingOpsFor refusals** (R1 ↔ L). `{ok: false, reason, final: true}` is returned **only** for the deterministic cases: no roadmap or milestone for the goal, an ARCHIVED or DRAFT roadmap, a missing table, and a superseded row (`isSupersededRow`). Anything else is rethrown. goals-server empties the series and closes unmeasured only when `final` is true. Otherwise closeGoalCore fails with "Couldn't close; try again" and writes nothing.
2. **The close passes `closing: true`** and applies `res.reachOps`, R1's pending-day guarded ops (L). The PROFICIENCY row in the close's transaction then counts the reach that the close confirms.
3. **One due day** (`milestoneDueDayOf`; R1, R4, R6). R1's context loader selects the goal's dueDay with the goals read.
4. **Positions by lineage** (R1, R4, R6, G).
   - rankInputOf uses `maxScheduledPositionsOf`, and acceptCore's scheduledTotal uses `positionCountOf`.
   - assignRankIndices advances `place` once per lineage.
   - A superseded row is not measured (R1's isOpenMilestone, readingOpsFor with a final refusal "replaced by Start again", the goal series), so its goal pays 0. R6's open-milestone pick skips it. R1's context loader selects `createdAt` for `isNewerRow`.
   - Belt and braces: closeGoalCore's ROADMAP path, or lane G's unarchiveCore, refuses a second paying close of one lineage. R4's Start refuses a lineage already reached.
5. **Re-plan, then Start, then Accept** (R4). acceptCore refuses (or drops from the group) any draft row whose lineage is now STARTING or STARTED: "Milestone 2 started since this re-plan was drafted — re-plan again". It also guards that nothing started after the draft's run (NOTHING_STARTED_SINCE).
6. **The Start pay line** (R4, R5). startPreview fills `payBasis` and each row's `weeklyMinutes`. finishStartCore computes the stated MP as `statedForMilestone(startStatedInputOf(basis, claimedPractices, switchedOff))`, with the same basis taken from the Start weeks (reviewMin and newPerWeek don't depend on the switches).
7. **Run provenance** (R4, R5). runDraftCore's FAILED-with-starter persist writes `report.fallback = RUN_FALLBACK_STARTER`. runViewOf sets `wrote` and `capped`. Failed samples' facts (finishReason, responseId, usage, latencyMs, capped raw text with `ok: false`) go into the run row, and the reuse path skips `ok: false` samples (R3 handoff 3).
8. **The draft cap** (R3, R4): `countsTowardDraftCap`. R3's helpers then count CAPPED, R4 calls them or keeps its SQL guard as the enforcement, and DRAFT_CAP_LINE is the one cap copy.
9. **Aftercare** (R4, R5). R4 adds `keepOnTodayCore(userId, milestoneId, templateId, now, deps)` and an action that appends the id to `StartSnapshot.aftercareKept` under the usual guard. practiceAftercare skips kept ids. R5 calls it instead of hiding the row for the session.
10. **"Type a target"** (R4). editItemCore's milestone-id branch applies `{target, minLevel}` to the milestone's CARDS_AT_LEVEL measure (targetSource YOURS, measureKey null until accept) without touching any item's decision.

### 9.5 The ui-audit and the check lists (integration, done)

- **life:check** appends roadmap-contract, roadmap-measures, throughput, roadmap-realism, roadmap-model, roadmap-server and roadmap-quests after rituals-check. **ui:check** appends roadmap-ui-check. life-day-check's exact list names all seven, and each `<name>:check` runs its file alone. roadmap-contract-check pins both lists.
- **scripts/ui-audit.mjs**:
  - The default base is the rehearsal server, `http://localhost:3100`.
  - `--routes all|real|fixtures|<list>`. The fixtures are /dev/style, /dev/style/today (Today's quest states), the review states, celebrate, art, **/dev/style/art/you** (the Aim card states), settings, train, and **/dev/style/roadmap?state=** for every state in R5's `FIXTURE_STATES`: 15 at fix round 2 (empty, no-key, running, draft-mixed, draft-credential, accepted, active, behind, past-due, start-refit, body-practice, done, intake, **active-replan** and **draft-live**). Since fix round 2 the list is **read from src/app/dev/style/roadmap/fixtures.ts** at run time (the regex roadmap-contract-check uses), so a state R5 adds is audited without an ui-audit edit; the built-in list is only a fallback, and `--plan` reports `roadmapStatesFrom: "fixtures.ts" | "fallback"`. /you/roadmap and /you/roadmap/new join the real routes.
  - **The rehearsal-only guard:** /today, /today/week, /you, /you/roadmap and /you/roadmap/new (a query, a fragment, a doubled or trailing slash, other case or %-encoding all normalised first) are refused with exit 2, before Chrome starts, unless the base is the rehearsal server. /today/week is included because its render runs the life chain in after(). Since fix round 2, a route that doesn't start with "/" is refused too (exit 2, on any base). This catches a Git Bash path rewrite and names `MSYS_NO_PATHCONV=1`.
  - Off the rehearsal server, the reduced-motion gate reads /dev/style.
  - `--plan` prints the resolved plan and exits before Chrome; roadmap-contract-check runs it.
  - Each Aim card's height (`[data-aim-card]`, `.rm-ac`, `.rm-ac-empty`) and Today's `.rm-quests-slot` height are recorded per route and width. A NOTE flags an Aim card taller than 470 px on a phone.
  - Inline text links are **not** exempt from the 40 px rule: `.rm-ilink` gets a 40 px hit area in roadmap.css (R5).

### 9.6 Checks added in lane 0

roadmap-contract-check adds 36 cases, from 152 to 188:
- positions by lineage: a dropped row and its copy count once (Specialist, never Paragon); a re-plan's new milestone takes its true place; superseded rows (a PLANNED copy supersedes nothing, a STARTING or STARTED one does); isNewerRow; and DRAFT, DISCARDED and LATER rows don't count;
- milestoneDueDayOf;
- countsTowardDraftCap, runWriterOf and rowsWriterOf: a CAPPED redraft over a Gemini draft keeps Gemini; a FAILED run with the starter reads STARTER;
- the Start pay arithmetic, through R4's statedForMilestone: switching one of two 40-minute practices off flips ⬡6 to "practice under an hour", and a paid lineage states 0 with its day;
- roadmapStepErrorsOf;
- every new view field, compiled and serialisable;
- the transitive `_no-model` walk, and the two pure leaves reaching no model module and no Prisma;
- the life:check and ui:check lists, and life-day-check's list;
- the ui-audit guard, the fixture routes (against R5's FIXTURE_STATES), the rehearsal plan, that the guard runs before Chrome, and the height record.

### 9.7 Still open for the lead (files no lane owns)

- **src/components/library/LibrarySearch.tsx** must use `LEVEL_FILTER_MAX` (from `./library-model`) in place of MASTERY_LEVEL in five places (a live clamp bug since the default filter became 1–20: the max input shows 20 above its `max` of 12, and an edit clamps it to 12 for good):
  - lines 458–459: the chip test and its clear, which should reset to `{minLevel: 1, maxLevel: LEVEL_FILTER_MAX}`;
  - lines 596 and 612: the inputs' `max`;
  - line 615: the clamp and its fallback;
  - line 618: "of {LEVEL_FILTER_MAX}".

  Line 422's aria-label "Level n of 12" should read MAX_LEVEL.
- **src/components/taxonomy/DangerZone.tsx** should show `roadmaps` and `openRoadmaps` in the counts line, and show `roadmapsArchived` as "archived" (lane G handoff 1).
- **src/components/home/YouTabs.tsx and you.css** need two changes, after which the two pending keys in shell-check go (lane Y handoff 1):
  - scroll the `aria-current` tab into view (`scrollIntoView({inline: "nearest", block: "nearest"})` on mount and path change);
  - add a mask scroll cue to `.you-tabs`.
- **src/app/actions/duty.ts** (optional): add the `recordPracticeForTemplate` after() call to makeUp, doMinimum and undoMakeUp.
- **src/components/today/today.css** (optional): add `.today-board .o9 > .rm-quests-slot {margin-top: 16px}` and `.today-goals .goal-chips {gap: 6px}`, then delete TodayBoard's inline style.
- **src/app/api/cron/life/route.ts:** the doc comment should mention the roadmap step.
- **Docs** (still open after fix round 2; lane 0 owns only this file):
  - data-model.md needs the 8 tables (Roadmap, RoadmapRun, RoadmapMilestone, RoadmapItem, RoadmapMeasure, RoadmapReading, RoadmapAcceptance, RoadmapQuestWeek; §1 has each one's columns), plus `RoadmapQuestWeek.results.eligibleDays`, `StartSnapshot.aftercareKept` (inside `RoadmapMilestone.feasibility`) and `RoadmapRun.report.fallback`;
  - grading.md needs the F23 sentence;
  - roadmap.md F12 (line 2088, "cards 0.75, milestones 0.25") should read "cards 0.8, milestones 0.2": renormalising 0.6 and 0.15 over 0.75 gives 0.8 / 0.2, which is what roadmap-types, the code and /today/rules publish.
- **Product calls:**
  - `isCredentialAim`: does "EUR/USD" make the trading aim a credential aim?
  - Confirm the EDITED rule in 9.3.
- **Older checks that reach gemini.ts** (review-check, idea-capture-check, life-grade-check) don't import `_no-model`. They reach no roadmap module except the exempt roadmap-types, so the rule doesn't bind them. Adding the import would make "no check can reach Gemini" literal.

## 10. Additions the lanes made in the build round

Each lane may add new exports and optional fields (§ intro). These are the ones the lanes reported, so a caller in another lane finds them here.

- **R1:**
  - roadmap-measures: `LevelHistogram`, `histogramOf`, `cardsAtLevelFromHistogram`, `levelsInScope`, `measureLabelOf`, `measureProgressOf`, `cardsReadingRow`, `practiceReadingRow`, `practiceDetailOf` (`PracticeKeptDetail` with `byTemplate` and `byLineage`), `zeroReasonOf`, `ZERO_REASON_WORDS`, `plannedTrackedMinutesOf`, `countsFromOf`, `MEASURE_CAPTIONS`, `isWhole` and `G_EPSILON`.
  - roadmap-pace: `cardsExpectedBy` and `slowestPaceOf`. `TriggerMilestone` gains optional `id`, `dueDay` and `level`.
  - roadmap-proficiency: `basisSignature`, `basisWithout`, `rebaseDetailOf`, `parseProficiencyDetail`, `byDomainOf`, `proficiencyReadingOf`, `proficiencyPercent`, `proficiencyCaptionOf`, and `ProficiencyDetailR1` (the stored detail adds `byDomain`). `ProficiencyBasisInput` gains `heldDays?`.
  - roadmap-readings: `RoadmapContext`, `CtxMilestone`, `loadRoadmapContext`, `planRoadmapWrite`, `applyRoadmapWrite`, `reachOpOf`, `scopeMapOf`, `loadScopeMap`, `crossesLevel`, `seriesMilestoneOf`, `goalSeriesEntryOf`, `proficiencyReadingFor`, `loadProficiencyPair`, `upsertDecision`, `stableJson`, `ReadingOps.reachOps` and `.g`, and readingOpsFor's `closing` option. The upsert also compares `detail`.
- **R2:**
  - roadmap-realism: `remedyTargetDay` and `writingPlanOf`.
  - throughput: `ThroughputLedgerRow`, `taskRowsOf`, `scopePaceOf` and `ScopePace`, `trackedEstimate`, `countsForAdherence` and `throughputWindowStart`.
  - throughput-server: `loadThroughputRows`.
  - `splitWindows` with an explicit `count` enforces only the 35-day minimum.
- **R3:**
  - roadmap-model: `geminiCallModel`, `SampleResult`, `DraftSamplesOpts`, `readResponse`, `capRaw`, `NO_KEY`, `CALL_REFUSED`, `RunLike`, `draftsCountedToday`, `draftCapReached`, `draftsLeftToday`, `DRAFT_CAP_LINE`, `reusableRunOf`, `FREE_TIER_NOTE` and `freeTierNoteFor`.
  - roadmap-evidence: `packDomainLine`, `domainIdsHashOf` and `START_POINT_WORDS`.
  - roadmap-validate: `labelContextFor`, `LABEL_CAPS`, `FLAG_REASON`, `LabelCheck.reasons`, and `ValidateContext.version` and `.resplit`.
  - The lexicon's lists marked "(added)".
- **R4:**
  - roadmap-server: `RoadmapDeps.store/io/lanes/clock/makeId/goalsLive`; `prismaRoadmapStore` and `prismaRoadmapIo`; `addItemCore` and the `addItem` action (`NewItem`).
  - Pure helpers exported for checks: `validateIntake`, `claimPlanOf`, `acceptBlockersOf`, `todayBoundRowsOf`, `syncMeasures`, `planRowsOf`, `draftRowsOf`, `intakeOf`, `rateOf`, `realismInputOf`, `calibratingThroughput`, the capture builders, and copy constants such as `DRAFT_CAPPED` and `DISCARDED_REASON`.
  - `loadIntakeView`, `loadRoadmapView`, `loadAimCard` and `practiceAftercare` take an optional trailing `deps`.
  - A milestone's own id addresses its title in decideItem, editItem and StartChoices.
- **R6:**
  - roadmap-quests: `questsBehindLine`, `questWindowOf`, `nonHeldShareOf`, `scaledCountOf`, `unitWord`, `WEEK_QUEST_CAPTION`, `WEEK_QUEST_NOTE_PATTERNS` and `WeekQuestResultsStored`. `RoadmapQuestWeek.results` also stores `eligibleDays`.
  - roadmap-quests-server: `QuestStore`, `QuestSetOverrides` (lineage-keyed template ids, startedDay, snapshot, v0), `WeekQuestsLoad.viewInput`, `weekQuestsViewFor(load, variant, passRateNow?, fittedNow?)`, `questLabelOf`, `checkpointLabelOf`, `loadPastWeeks` and `prismaQuestStore`.
- **L:**
  - goals: `roadmapPointAsOf`, `ROADMAP_CAPTION`, `statedPayoutLine(h, stated, zeroReason?)`, `GoalInput.readingNote?`, `GoalPayout.readingNote?` and `GoalLadderItem.roadmap?`.
  - goals-server: `prepareRoadmapGoalClose(userId, goalId, now, deps?)` (`RoadmapGoalClosePrep`), and `GoalCloseDeps` as closeGoalCore's 5th parameter.
- **G:**
  - tasks: `linkedGoalFields`, `linkedParentOf`, `templateIdOfInstance`, `ROADMAP_GOAL_PROGRESS_REFUSAL` and `goalProgressRefusalOf`.
  - settlement: `runRoadmapStep`, `recordRoadmapAfterDegrade` and `DegradeRoadmapReport`.
  - reset-scopes: `LIFE_RESET_ORDER` with the roadmap tables, `lifeResetOrder(withRestDays, withRoadmaps)`, `ROADMAP_RESET_TABLES`, `ROADMAP_RESET_EFFECT`, `RESET_ARCHIVE_NOTE`, `resetArchiveReason` and `isResetArchiveReason`.
- **T:** today-board: `RoadmapGoalCard`, `roadmapGoalIdsOf`, `roadmapZeroReasonText`, `measuredLabelOf`, `roadmapGoalCardOf`, `weekQuestsShownOnToday` and `seekPlaceOf`.

## 11. Added in fix round 2

The re-review left a blocker (life:check red on the ui-audit list) and a set of open majors and minors. Lane 0 again went first and alone, and added what those items need in lane-0 files. Everything here is a new export or an **optional** field; nothing that compiled before stops compiling.

### 11.1 New pure helpers in roadmap-types.ts (pinned in roadmap-contract-check)

| Export | Signature and meaning | Who calls it |
|---|---|---|
| `acceptedRunOf(runsNewestFirst, acceptedVersion)` | Generic over `{kind, status, fallback?, version}`. The newest run **of the accepted version** (`RoadmapRun.version`, "the version its milestones are written at": roadmap.version + 1 while drafting or re-planning) that **wrote rows** (`runWriterOf` not null). That is the run behind the plan on screen. A pending re-plan run (version + 1), a CAPPED "Draft again" and a FAILED attempt never relabel it, and an accepted re-plan reads its own INHOUSE or MANUAL run. null when nothing is accepted (null, 0, not an integer) or no run of that version wrote rows | R4 → `RoadmapView.acceptedRun` |
| `isAcceptanceReading(measuredAt, acceptedDay)` | The reading's life day (`dayKeyOf`, LIFE_TZ, the 04:00 turn) is the acceptance day. False with either missing or an unreadable time | R5 AimCard (the ACCEPTED caption) |
| `isUndecidedItem({origin, decision})` | `decision === "PENDING" && origin === "GEMINI"`: Gemini's words not yet kept, checked, edited or removed. A PENDING syllabus topic or a row the user wrote needs no tap | R4 (`undecided`), R5 |
| `isPlaceholderItem({notes, decision})` | The PLACEHOLDER note on a row the user hasn't edited. Naming it (EDITED) settles it, as R4's `isPlaceholder` already says | R4, R5 |
| `DraftNeed`, `DraftNeedRow`, `draftNeedsOf(m)` | **One definition of "what a draft milestone still needs"**: one entry per row in the page's reading order (the title, then DOMAIN, TOPIC, PRACTICE, STEP, CHECKPOINT), each `{id, lineageId, kind, need}`. The title: empty → NAME, Gemini's PENDING → DECIDE. An item not REMOVED: placeholder → NAME, proposed Domain → MAP, Gemini's PENDING → DECIDE, checkpoint without bar or outOf → SET_BAR (the first that applies). The review footer's "N items left in milestone 1" is its length; "Next item to decide" is its first id | R4 `undecidedRowsOf` (= length), `nextToDecide`; R5 `undecidedOf` |

`draftNeedsOf` settles a three-way split the re-review found. R5's `undecidedOf` counted every PENDING row, including SYLLABUS topics (roadmap-validate creates them PENDING) and placeholders the user had already named. R4's `undecidedRowsOf` counted only Gemini's rows and unnamed placeholders. R4's `acceptBlockersOf` target ignored placeholders. The page footer and the Aim card therefore disagreed, and "Next item to decide" could scroll to a YOURS row with no button. acceptBlockersOf's **blockers** are unchanged; only the count and the target share this definition.

### 11.2 New optional fields

| Field | Meaning | Filled by → rendered by |
|---|---|---|
| `AimCardView.acceptedDay?` | The life day the current version was accepted (RoadmapAcceptance.day; the same as `RoadmapHeader.acceptedDay`). The ACCEPTED line reads "Proficiency 31% as measured at acceptance on 4 Oct" only while `isAcceptanceReading(proficiency.measuredAt, acceptedDay)`. Every chain day writes a new PROFICIENCY reading for an ACTIVE roadmap, so from the next day the caption is `measuredLabel(measuredAt)` | R4 loadAimCard → R5 AimCard |
| `MilestoneRowView.titleStruck?`, `AimCardMilestone.titleStruck?` | A Gemini title's NUMBER spans, derived on read exactly as `MilestoneDraft.titleStruck` (the same title check). The Milestones list and the Aim card strike them, as the review already does ("struck through, never rewritten") | R4 → R5 (StruckLabel) |
| `RoadmapView.acceptedRun?` | `RunView` of `acceptedRunOf(runs, the current acceptance's version)`. The living roadmap's "How this was drafted" (RunFacts, RunTable) reads this, never `run`. Undefined: not loaded (R5 labels the table "Latest run"); null: no acceptance yet or no run wrote it | R4 loadRoadmapView → R5 Reference |
| `RoadmapView.positions?` | The plan's milestone count as every surface reads it: `positionCountOf` over the plan's scheduled rows (carried rows, a dropped one included, and the version's PLANNED rows; LATER excluded). It is the figure loadAimCard's `of`, `StartPreview.of` and `toward.scheduled` already use (`positionCountOf(planRowsOf(b).filter(scheduled))`), and Today's chip counts lineages the same way. Now's "milestone N of M" and the Milestones list's count read it. Undefined before acceptance; R5's fallback is `positionCountOf(milestones.filter(r => r.state !== "LATER"))` (DROPPED included) | R4 → R5 RoadmapView |

`run` keeps its meaning: the **latest** run. Its `wrote` keys the draft header, and in replan mode an INHOUSE writer reads "Re-fitted from your accepted plan" and a MANUAL one "Edited from your accepted plan" (R5 copy), with "Gemini's words stay marked" while any row is DRAFT or KEPT_SUGGESTION.

### 11.3 Decisions that need no field

- **The Paragon line** on the Milestones list keys on `rank.top.withAim`, which comes from `maxScheduledPositionsOf` over every version. It never keys on a count of rows or of this version's positions.
- **The Start sheet's Practices list and Steps line.** `StartPracticeRow.itemId` and `StartPreview.steps[].itemId` already name the item, and the sheet holds `milestone.items`. R5 looks each one up and renders it through `labelWithClass` or StruckLabel with its ProvenanceChip, as the "What goes to Today" rows do. No class field is duplicated onto StartPreview.
- **The unverified-draft banner** is R3's `unverifiedAlarmOf` (roadmap-validate), the one rule. R4 sets `DraftView.alarm` from it over the draft rows `withLabelChecks` returns, so removing the flagged items clears the banner (`DraftView.alarm` doc).
- **R4's run helpers.** R4 calls R3's `runFactsOf`, `reusableSamplesOf` and `withLabelChecks`, rather than keeping its own copies (`storedSamplesOf`, its `runFactsOf`, `labelChecked`), so each rule has one definition. Alternatively R3 deletes its unused copies and their goldens; either way, not two.
- **liveShaped.** R5's `liveShaped` (fixtures.ts) strips the server-derived optional fields. It now strips `acceptedRun`, `positions`, `acceptedDay` and `titleStruck` too, so roadmap-ui-check proves the page degrades honestly without them.

### 11.4 Cross-lane items still open after fix round 1 (each lane does its side)

1. **R4: the planning engine's carried rows.** In applyRemedyCore, acceptCore, replanCore, draftViewOf and `rewrite()` (each now runs `planRowsOf(b).filter(isCarried).map(draftOf)`), map each carried row to `{...draftOf(m), dueDay: milestoneDueDayOf(m.dueDay, goal?.dueDay)}`. Drop rows where `isSupersededRow(m, b.milestones)` holds before `fitPlan`, `feasibilityOf`, `refit`, `applyRemedy` and `startSnapshotOf`. In `rewrite()`, fit `[...carried, ...drafts]` and keep only the draft rows. R2 pins that the engine follows the due day it is given.
2. **R4: `alarm: unverifiedAlarmOf(drafts)`** in draftViewOf, plus a server-check case where removing the flagged items turns it off.
3. **R4: `triggersFor`** logs its failure: `console.error("roadmap: triggers unavailable:", err)`.
4. **R4: fill §11.2.** `acceptedDay`, `titleStruck` (both views), `acceptedRun` and `positions`. undecidedRowsOf = `draftNeedsOf(m).length`, and nextToDecide = `draftNeedsOf(next)[0]?.id`.
5. **R5:**
   - Read `positions` for Now's "of" and the list count, and `rank.top.withAim` for the Paragon line.
   - Read `acceptedRun` for the Reference ("Latest run" while undefined), and use the re-plan lead lines in §11.2.
   - Apply the acceptance caption rule.
   - Strike `titleStruck` on the Milestones list and the Aim card, and add `FlagReasons(title.reasons)` under the outline header's chips.
   - Make `undecidedOf` follow `draftNeedsOf`.
   - Wire "Add a figure" (ACTIVE) to `setAimFigure`, and add [Add as topic] → `addItem(milestoneId, {kind: "TOPIC", syllabusRef: i})`.
   - Make `.rm-col .rm-grid` one column (or put the re-plan review full width above `.rm-cols`).
   - Give the Start sheet's practices and steps their provenance (§11.3).
   - Extend `liveShaped`.
6. **R1:** `ZERO_REASON_WORDS.PRACTICE_UNDER_SHARE` drops "is" ("practice under a third of this milestone's planned time"), so it equals R5's `ZERO_REASON_LINE`, and board-check's PENDING line becomes strict.
7. **T:** `measuredLabelOf` adds the year when it differs from today's (as `shortDayLabel` does); you-check's NOTE then becomes strict.
8. **G:** port lane L's close-path cases (`scratchpad/lane-l-check.ts`, G-L1 a–h, injecting `lineages` per G-L2) into character-check §10b. They pin `lineagePaidOnOf` and the closeDecision gate, `GOAL_CLOSE_STALE` from the lineage guard, the g mismatch refusal, `closing: true`, `res.reachOps` after the readings, `GOAL_CLOSE_RETRY` on a failed lineage read, and the milestone's due day for a goal without one.
9. **Lead** (no lane owns these): LibrarySearch.tsx, YouTabs.tsx and you.css, DangerZone.tsx, and the docs, all in §9.7. Then run ui-audit at 344, 375, 932 and 1440 over every fixture state, active-replan and draft-live included.

### 11.5 The ui-audit and the checks

- `scripts/ui-audit.mjs` reads `FIXTURE_STATES` from src/app/dev/style/roadmap/fixtures.ts, so `--routes fixtures` covers all 15 states, active-replan and draft-live included. `--plan` reports where the list came from, and the built-in fallback lists the same 15 states (§9.5). This turned life:check green again: roadmap-contract-check's fixture-route case was its only failure.
- roadmap-contract-check grows from 188 to 200 checks:
  - `acceptedRunOf`: a pending re-plan, a CAPPED "Draft again" and a FAILED attempt keep the accepted Gemini run, and the newest writer of that version wins; an accepted re-plan reads its own run; the starter fallback; no acceptance or no writer gives null.
  - `isAcceptanceReading`, including the 04:00 turn in Sydney.
  - `draftNeedsOf`, `isUndecidedItem` and `isPlaceholderItem`: page order regardless of item order; never a syllabus topic, a user row, a kept or checked row, a named placeholder or a REMOVED row.
  - The fix-round-2 view fields compiled and serialisable.
  - ui-audit's states read from fixtures.ts, and its fallback naming no stale state.
  - ui-audit refusing a route that isn't a path (exit 2, before Chrome). Git Bash rewrites a bare `/today` argument into `C:/Program Files/Git/today`, which used to slip past the rehearsal-only guard (harmlessly, as a 404). The refusal names `MSYS_NO_PATHCONV=1`.

## 12. Additions the lanes made in fix round 1 (read from the code)

The lanes ran at the same time as lane 0 in fix round 1, so their additions are listed here from the code after the fact. Every name below is exported; "for checks" means it is exported only so a check can pin it.

- **R1:**
  - roadmap-measures:
    - `nothingPlanned(measure, detail?)`: a PRACTICE_KEPT measure whose effTarget ≤ 0 reads as nothing kept, never 1.
    - `NO_PLANNED_SESSIONS` ("no planned sessions"), the binding label.
    - `zeroReasonWordsOf(reason, paidOn?)`: "this milestone already paid on 3 Mar".
    - `statedReadBackOf(milestone, snapshot, lineagePaidOn)` → `StatedInput`, through `startStatedInputOf` (the one Start-pay arithmetic).
    - The row types `CardLevelRow`, `PracticeTemplateRow` and `PracticeKeptValue`.
  - roadmap-pace: `CardPaceMeasure`.
  - roadmap-readings:
    - `dueOf(m)` (= `milestoneDueDayOf`), `supersededIdsOf(milestones)`, `isSupersededMilestone(m, all)` and `SUPERSEDED_NOTE` ("replaced by Start again").
    - `NOT_A_MILESTONE`, `MISSING_TABLES` and the `ReadingOps` refusal `{ok: false, reason, final: true}` (§9.4.1).
    - `CtxMilestone.createdAt` and `CtxMilestone.goal.dueDay`, and `resetReadingsThrottle` (for checks).
    - The types `RoadmapReadingsClient`, `ReadingsDeps`, `CtxTemplate`, `ContextQuery`, `RoadmapWritePlan`, `PlanOptions`, `RoadmapScopeMap` and `GoalSeriesFacts`.
  - roadmap-proficiency: `ProficiencyDomainFacts` and `ProficiencyReadingInput`. `assignRankIndices` advances a place once per lineage.
- **R2:**
  - roadmap-realism:
    - `availableFor` is no longer cut at the aim's date. R6 needs the whole week's capacity in the aim's final week and in any week a Reschedule moved past it.
    - The re-split counts positions (n ≤ MAX_MILESTONES − carried positions, `positionCountOf`), and a PLANNED "Start again" copy re-uses its dropped original's place.
    - `feasibilityOf` lists the row the plan can still change before the carried one of the same lineage.
  - throughput: `scopePaceOf` is what R4's `rateOf` now reads (the median of the scope's weekly sums over ≥ 4 weeks).
- **R3:**
  - roadmap-model:
    - `StoredSampleFacts` and `RunFacts`.
    - `runFactsOf(results)`: every SampleResult's facts, failures included, `ok: false` on a failed one.
    - `reusableSamplesOf(stored)`: the reuse path skips `ok: false`.
    - `draftsCountedToday` and `draftCapReached` count CAPPED (`countsTowardDraftCap`).
  - roadmap-validate:
    - `unverifiedAlarmOf(milestones)`: the one alarm rule.
    - `withLabelChecks(milestones, base, count?)` with `LabelChecked`, plus `LabelBase` and `labelBaseFor(intake, areaName, domainNames)`, to derive title flags, struck spans and reasons on read.
    - A capitalised word counts as an opener (exempt from PROPER_NOUN and the name test) only as the label's very first word, or as a start word right after a sentence break.
    - A non-Latin label sets LANGUAGE_UNCHECKED itself, and NUMBER reads `\p{N}`.
  - roadmap-lexicon: `RESOURCE_TERM_PHRASES`, `CLAIM_TERM_PHRASES`, `ABOUT_YOU_TERM_WORDS`, `NUMBER_TERM_PHRASES`, `NUMBER_UNIT_WORDS`, `NUMBER_COMPOUND_PARTNERS`, `DATE_WORDS_CAPITALISED`, `DATE_ABBREVIATIONS`, `NEGATION_CUES_AFTER`, `CONSTRAINT_FILLER_WORDS`, `BUDGET_WORDS`, `LABEL_START_WORDS` and `URL_TLDS`.
  - roadmap-probe: `REQUESTS_PER_CALL = 1`.
  - **F6 notes** (R3's validator choices, as they stand after fix round 1):
    - PROPER_NOUN does not flag a proposed Domain name in title case ("Risk Management"). Acronyms, inner capitals and single capital letters ("Exam P") still flag, except "I" and "A". This is deviation 1, kept by Lens 3.
    - LOOKS_LIKE_RESOURCE reads a capitalised first word as a name on **every** kind now. Known terms ("Geometric series", "Taylor series", "unit circle") are exempted through `RESOURCE_TERM_PHRASES` instead of the old first-word exemption (Lens 3 #3; deviation 2 withdrawn).
    - A NUMBER n-gram must hold a content word besides the number. A token mixing letters and digits ("B2", "C++20") is allowed on its own.
    - inputHashMaterial hashes only the fields the pack is built from, plus the D-key → id map.
    - The cap counts every GEMINI status but REUSED, CAPPED included (`countsTowardDraftCap`; deviation 6 withdrawn). The reuse age is in life days (≤ 7).
    - Validator choices:
      - an unknown D-key or a dangling N on a topic → TOPIC_OUTSIDE_SCOPE (the topic stays);
      - a new Domain matching one already in the milestone merges into it, with a note;
      - a title that held a link, or was empty, becomes "" and must be named;
      - duplicate S-keys are allowed;
      - item ord is 0-based within a milestone, and milestone ord is 1-based;
      - measures are skeletons: one PRACTICE_KEPT per practice, scoped by item lineage.
    - Title flags: `report.flagged` (kind MILESTONE) at draft time. On read they come from `MilestoneDraft.titleFlags`, derived by `withLabelChecks` (§9.2).
- **R4:**
  - roadmap-server refusals: `TITLE_NUMBER` (a NUMBER title takes only Edit), `REPLAN_STALE` (re-plan, then Start, then Accept), `LINEAGE_REACHED`, `NOTHING_MEASURES`, `DUE_TOO_SOON`, `STARTED_ELSEWHERE`, `NAME_THIS_PRACTICE`, `RACED`, `ANOTHER_ACTIVE`, `DRAFT_RUNNING` and `GATE_OFF`.
  - Start pay:
    - `payBasisOf(m, weeks, lineagePaidOn)` → `StartPayBasis`.
    - `statedFor(m, basis, off?)`, the one Start-pay arithmetic.
    - `practicePriceOf(item, track, today, ledger)`.
  - Lifecycle:
    - `setAimFigureCore(userId, roadmapId, {typicalHours, typicalHoursSource?}, now, deps)` with the `setAimFigure(roadmapId, hours, source)` action. It sets the aim check's figure on a DRAFT or ACTIVE roadmap.
    - `keepOnTodayCore(userId, milestoneId, templateId, now, deps)` with the `keepOnToday(milestoneId, templateId)` action (§9.4.9).
  - Views: `libraryOf(tree)` → `LibraryDomain[]`; `weightLineOf(w)`; `undecidedRowsOf(m)` (to become `draftNeedsOf(m).length`, §11.1).
  - Runs: ~~`storedSamplesOf` and a local `runFactsOf`~~ — removed in fix round 2: R4 calls R3's `runFactsOf` and `reusableSamplesOf` (§11.3, §13).
  - Store and test seams: `RoadmapRec`, `RunRec`, `MilestoneRec`, `ItemRec`, `MeasureRec`, `AcceptanceRec`, `MilestoneBundle`, `RoadmapBundle`, `RoadmapStore` and its `StoreOp` / `StoreGuard` / `Where`, `RoadmapIo`, `RoadmapLanes`, `TreeField` / `TreeDomain` / `TreeCard`, `treeOf`, `itemDraftOf`, `measureSpecOf`, `AcceptCheck`, `ClaimPlan`, `IntakeContext` and `starterReportOf`.
  - `editItemCore` with a milestone id applies `{target, minLevel}` to its CARDS_AT_LEVEL measure (§9.4.10). An edit makes a row EDITED only when its words changed (§9.3).
- **R6:**
  - roadmap-quests-server:
    - `scheduledPlacesOf(rows, version)` → `{placeOf, of}`: places by lineage.
    - `openMilestoneOf`, which skips superseded rows.
    - `questErrorText(err)`: the one-line error for the step's `errors`.
    - `questPlaceText(placement, today, repeating)` and `questPlaceOfTemplate(t, today, instances)`: "in Must", "in Habits", "in Planned", "in Anytime" or "in Inbox".
    - `startSnapshotOfRow`, `setOfStored`, `heldDaysAsOf`, `weekQuestInputFor`, `raiseEvidenceOf`, `boardTemplateOf`, `boardInstancesOf` and `questProgressFor`.
    - The row types `Quest*Row`, `StoredQuestWeek`, `QuestCapacity` and `QuestOpts`.
  - roadmap-quests: `questsBehindLine` is no longer emitted into `weekQuests.notes`. The Triggers banner is its one surface.
- **R5:**
  - roadmap-ui-model:
    - `libraryLoaded` and `canMapOf`.
    - `draftRunWriterOf` and `draftBannerOf`, keyed on `RunView.wrote` and `capped`.
    - `startPayOf(p, off, items)`, the sheet's pay line on every switch.
    - `startAgainOffered`, `aftercareMilestoneIdOf`, `carriedRowsOf`, `scheduledOf`, `rankPlanOf`, `typedTargetVerdict`, `measureDomainClassOf`, `behindBannerOf` and `notesShownOf`.
  - `roadmap-labels.ts` (new): `labelContextOf`, `deviceLabelCheck` and `deviceLabelFlags`. These re-run R3's checkLabel on the device only as a fallback; the server's `struck` and `reasons` win.
  - `roadmap-links.ts`: the hrefs and `addPreselectOf` (the /add preselect).
  - `roadmap-runtime.tsx`: Live and Fixture providers, so a fixture never calls a live action.
  - roadmap-copy additions:
    - `DRAFT_CAP_LINE`, `RUN_STARTER_LINE`, `RUN_UNFINISHED_LINE`, `GEMINI_LEAD_LINE`, `BUILT_LEAD_LINE`, `REPLAN_EYEBROW`, `WRITES_OFF_BANNER`, `LIBRARY_UNCHECKED_LINE` and `EDIT_NUMBERS_NOTE`;
    - `basisClassNote`, `labelWithClass`, `whyTitle`, `worstKnowledgeVerdict`, `calendarDayOf` (LIFE_TZ), `zeroReasonWords` and `ZERO_REASON_LINE`.
  - fixtures.ts:
    - `liveShaped(view)` strips the server-derived fields;
    - the states `active-replan` and `draft-live`;
    - `measuredAtOn(day)`.
- **G:**
  - tasks:
    - `ROADMAP_UNARCHIVE_REPLACED` and `ROADMAP_UNARCHIVE_OTHER_LIVE`;
    - `UnarchiveMilestoneRow` (= `PositionRow & {goalId}`) and `RoadmapUnarchiveFacts`;
    - `roadmapUnarchiveRefusalOf(facts)`: a superseded row's goal can't be unarchived, nor one whose roadmap already has another live milestone (the second is a lead decision).
  - settlement: `RoadmapStepDeps` and `RoadmapStepContext`. `runRoadmapStep` and `recordRoadmapAfterDegrade` push `roadmapStepErrorsOf(…)` into `errors`.
- **L:**
  - goals:
    - `lineagePaidOnOf(mints, goalIds)`: the first day any goal of the lineage paid;
    - the closeDecision gate "this milestone already paid on …".
  - goals-server:
    - `GOAL_CLOSE_RETRY` ("Couldn't close; try again.");
    - `GoalLineage` and `loadGoalLineages(userId, goalIds)`: milestoneDueDay, otherGoalIds and superseded;
    - the in-transaction lineage guard (`GOAL_CLOSE_STALE`);
    - `closing: true` with `res.reachOps`;
    - the strict refusal when R1's g and the paid g disagree (a lead decision).
- **T:** today-board's `roadmapZeroReasonText` uses the words R1's loader sends (`zeroReasonWordsOf`; LINEAGE_PAID with its day). Its own word table is only the fallback for a bare code, and board-check pins it equal to R5's `ZERO_REASON_LINE`. `measuredLabelOf` still needs the year across a year (§11.4.7).
- **Lane 0** (fix round 1): §9.

## 13. Additions the lanes made in fix round 2 (read from the code)

The lanes ran at the same time as lane 0 in fix round 2 too, so these are read from the code after the fact (the re-review found none of them recorded). Every name is exported.

- **R1:**
  - roadmap-measures: `zeroReasonWordsOf(reason, paidOn?, today?)` gains `today`: a LINEAGE_PAID day across a year carries its year ("already paid on 3 Mar 2026").
  - roadmap-readings: `GoalSeriesFacts.today`, the day the series is read on.
- **R2** (roadmap-realism; meanings, no new export):
  - The never-falls floor is per scope, taken from another lineage only.
  - Carried (started) rows get verdicts too (FITS, TIGHT, OVER, IMPOSSIBLE), judged as accepted; `refitForStart` judges the row as accepted.
  - A fitted target's basis adds "Kept at T, so …" only when the floor RAISED it, else "Worked out at T on an earlier day; with today's figures it would be F" when today's formula differs. R5 renders that line (the open R5 carry-over, §14.12).
  - REFIT_LIGHT is offered by judging only the open rows (the private `judgePlan`).
- **R3:**
  - roadmap-model: `isReusableRun(…)` (the reuse rule; R4 filters through it), `SAMPLE_ERROR_MAX`, and stored samples carry `ok: true`.
  - roadmap-validate: `labelCountOf`, `unverifiedAlarmOf` (the one alarm rule, §11.3) and `withLabelChecks` (§12).
- **R4:**
  - roadmap-server: `carriedPlanOf(b, others, goals)` (the carried rows the planning engine reads, each at its one due day, superseded rows left out), `RoadmapLanes.withLabelChecks`, `undecidedRowsOf(m)` = `draftNeedsOf(m).length`, `DraftView.nextToDecide` = its first id, and `DraftView.alarm` = `unverifiedAlarmOf`.
  - `storedSamplesOf` and the local `runFactsOf` are gone: R4 calls R3's `runFactsOf` and `reusableSamplesOf`.
- **R5:**
  - roadmap-ui-model: `positionsOf`, `paragonLineShown`, `referenceRunOf`, `draftHasGeminiWords` and `aimFigureOf`.
  - Components: `StruckLabel` (StruckLabel.tsx) and `AimFigure` (AimFigure.tsx).
  - fixtures.ts: `liveShapedAim`.
- **L** (goals-server): `GoalSeriesLoader`, `readGoalCloseInput`'s injectable deps, `GoalLadderDeps` and `loadGoalLadderUncached`. **scripts/goals-close-check.ts** now runs in life:check right after character-check, with its own `goals-close:check` script, and life-day-check's exact list names it (lane 0, revision 4; it was in no chain before).

## 14. Revision 4

The spec is docs/life-plan/roadmap-rev4.md, a delta on roadmap.md revision 3. Lane 0 went first and alone. Everything below is **frozen** as rev 3's contract is: a lane fills the bodies behind these signatures and may add private helpers, new exports and optional fields, never remove or rename one. Every shell carries a `STUB: lane X implements (F-R4-n)` comment.

### 14.1 State of the tree after lane 0

- `npx tsc --noEmit -p .` is clean; eslint is clean on every file lane 0 touched.
- `roadmap-contract-check` passes 313 checks (200 before), with two `PENDING` lines (§14.11). `roadmap-invite-check` (new) passes 53.
- Every rev-3 check of life:check is green except **roadmap-model-check**, which now fails two cases that are R3's to update: `prompt version 2` (the version is 3) and "no STUB marker left in roadmap-validate.ts" (lane 0's shells). **roadmap-hostile-check** is R7's shell and fails with "Not yet" on purpose, so the bar can't pass by being absent. ui:check is green except **roadmap-ui-check**'s three R5 items: its provenance grep must allow roadmap-catalog.ts (the spec says it may call codeText and write 'CODE'), and "no STUB marker left in R5's files" (AimLine.tsx, AimCard's new props). shell-check still prints its two YouTabs WARNs (lane Y's carry-over).
- The migration `prisma/migrations/20261106000000_life_roadmap_rev4/migration.sql` is written, not applied (§14.2). `prisma validate` and `prisma format --check` pass. `prisma generate` wrote the TypeScript client (the eight fields type-check); the engine DLL rename failed on the running server's lock, as in rev 3 (the engine is unchanged).
- Every shell is inert: `loadAimStep` returns null, `AimLine` renders nothing, every new action and core answers "Not yet.", every other new function throws `Not yet: <name>`. Today, /you and the roadmap pages render exactly as before.
- `ROADMAP_GEMINI_LIVE`, `ROADMAP_GAPS_LIVE` and `ROADMAP_GOALS_LIVE` are false.

### 14.2 Schema and migration (decision 48)

Eight additive columns on four tables, each nullable or with a default; nothing removed, renamed or retyped; no index; no foreign key. The models keep `@@schema("public")`, and no other model is edited.

| Model | Field | Meaning |
|---|---|---|
| Roadmap | `depth Int?` | 12, 10 or 8 on a Field Area; null on a track Area or a legacy plan |
| Roadmap | `dateMode String @default("CHOSEN")` | REALISTIC (only on a DRAFT) or CHOSEN |
| Roadmap | `coverage Json?` | `{[domainId]: n}`, only the user's typed figures (YOURS) |
| Roadmap | `suggestAreas Boolean @default(false)` | read only while ROADMAP_GAPS_LIVE |
| Roadmap | `examDay DateTime? @db.Date` | the user's exam date (YOURS); never the aim's date, never sent to Gemini |
| RoadmapMilestone | `stage String?` | a StageKey; null on legacy rows |
| RoadmapItem | `catalogKey String?` | a roadmap-catalog.ts key, or null |
| LifeSettings | `aimSuggestions Boolean?` | false is the lasting no; true or null (the default, and after a 'life' reset) is on |

The SQL is the spec's eight `ALTER TABLE … ADD COLUMN` statements; roadmap-contract-check pins them exactly, runs the pre-apply grep (no DROP; every ALTER TABLE names a Roadmap* table or LifeSettings, ADD COLUMN only; no index or foreign key) and pins that it sorts last. What rides existing JSON, with no migration, is the spec's list (Migration): DateCheck, depthChoice, coverageChoices and domainOrigins in RoadmapAcceptance.feasibility; the depth terms in endState; lineDomains in Roadmap.syllabus; report.integrity in RoadmapRun.report; the StartSnapshot's new fields; the new notes; retryEntries in the CARDS reading's detail; the REVIEW level tag in the ledger detail.

Reads that select the new columns go through the missing-table fallbacks plus **`isMissingRev4Column(err)`** (roadmap-types: P2022 or 42703 naming one of `REV4_COLUMNS`, the eight), so loadAimCard, loadAimStep, loadWeekQuests and the settings page render as before with aimSuggestions null (R4, Y). `isMissingRoadmapTable` deliberately stays false on a missing column.

### 14.3 roadmap-types.ts: gate, unions and constants

| Export | Value / meaning |
|---|---|
| `ROADMAP_GEMINI_LIVE` | false (P0; kept). `GEMINI_DRAFTING_OFF` kept |
| `ROADMAP_GAPS_LIVE` | false (decision 51; lead only). `GAPS_LIVE_MIN_LABELLED` 30, `REJECT_ALARM_SHARE` 0.2 |
| `AIM_PROMPT_COOKIE` | unchanged name; its values are now 'later:<day>', 'on:<day>' and the legacy 'off' (no action writes 'off') |
| `ItemKind` | += `GAP` (quarantined; `ITEM_KINDS` lists it). New `PlanItemKind` / `PLAN_ITEM_KINDS`: every kind but GAP |
| `TargetSource` | += `DEPTH`; new `TARGET_SOURCES` |
| `CheckpointKind` | += `EXAM_DAY` (code-placed). **`CHECKPOINT_KINDS` is unchanged** (the pickable three: what pickers and the v2 schema offer); new **`STORED_CHECKPOINT_KINDS`** adds EXAM_DAY: what a reader of stored rows accepts (R4's itemDraftOf must switch to it) |
| `BlockingFlag` | += `NOT_IN_YOUR_WORDS` (last in `BLOCKING_FLAGS`) |
| `ItemNote` | += `GEMINI_PICK`, `NOT_CHOSEN`, `FROM_SUGGESTION`, `PRODUCTION_ADDED` |
| `Remedy` | += `USE_REALISTIC_DATE`, `LOWER_DEPTH`; new `DEPTH_REMEDIES` (the only two a depth plan offers) |
| `ReplanTrigger` | += `CALIBRATED` (last; roadmap-pace's loop never finds it until R1 adds it) |
| `MilestoneNote` | += `HELD_AT_START`, `LONG_WINDOW`, `NO_PRODUCTION_SLOT`, `DEPTH_LOWERED`; new `MILESTONE_NOTES` |
| `DropReason` | += `DUPLICATE`, `NOT_A_NAME`, `REJECTED`, `CONSTRAINT`; new `DROP_REASONS` |
| `CREDENTIAL_WORDS` | 19: rev 3's eleven plus bar, chartered, registered, licensure, licensing, board, boards, accredited (the exam question's prefill, `examPrefillOf(aim)`) |
| Versions | `ROADMAP_PROMPT_VERSION` 3, `PROFICIENCY_VERSION` 2, `WEEK_QUEST_GENERATOR_VERSION` 2, `REACH_MODEL_VERSION` 2, each typed `number`, so another lane's pinned comparison fails at run time (honestly) rather than breaking tsc |
| Model | `GAPS_MAX` 4, `GAP_NAME_MAX` 40, `GAP_WORDS_MAX` 4, `GAP_WORD_CHARS_MAX` 24, `NO_SPACE_SCRIPTS` (Han, Hiragana, Katakana, Thai, Lao, Khmer, Myanmar, Tibetan), `REPORT_PATH_SEGMENT_MAX` 64, `REPORT_EXTRA_SEGMENT` "<extra>" |
| Week quests | `WEEK_QUEST_PARTS_TODAY` 2 |
| Depth | `DepthKey`, `AimDepth` (12 \| 10 \| 8), `AIM_DEPTHS` {MASTERED 12, FLUENT 10, RETAINED 8}, `DEPTH_KEYS`, `DEPTH_DEFAULT` "MASTERED", `isAimDepth`, `depthKeyOf`, `DEPTH_DOMAINS_MAX` 6 |
| Coverage | `COVER_FLOOR_CARDS` 25, `COVER_SHARE` 0.8, `CARDS_PER_OUTLINE_LINE` 3, `COVER_MIN` 1, `COVER_MAX` 500, `WRITE_MARGIN` 1.1, `NON_RECALL_TYPES` ["MULTI"], `RETRY_ENTRY_DAYS` 2, `isRecallType(type)`, **`coveragePolicyOf(liveRecall, lines)`** → {n, floor, share, outline} (the one arithmetic; float noise forgiven: 0.8 × 30 is 24), **`writeNeedOf(n, live)`** = max(0, ceil(1.1 n) − live) |
| Stages | `GateStage`, `STAGE_KEYS`, `STAGE_LEVEL` (4/6/8/10/12), `STAGE_NAMES` (Foundation, Familiar, Retained, Fluent, Mastered), `TrackStage`, `TRACK_STAGE_KEYS`, `TRACK_STAGE_SHARES` [0.2..1.0], `StageKey` (gates, BETWEEN, PART, STAGE_1..5), `STAGE_VALUES`, `isStageKey`, `FIRST_RANK_MAX_DAYS` (= MILESTONE_TARGET_DAYS 75), `STAGE_PRACTICE_BAND_MIN` {RETAINED D30, FLUENT D45, MASTERED D45}, `stageOfLevel(level)`, `gateStagesTo(depth)` (the schema's SLOTS), `stageLabelOf(stage, level?)` ("Toward Mastered" for BETWEEN at 11; "Familiar, part 1" for PART at 6; null for a track stage) |
| Ranks | `STAGE_RANK` {1..5}, `TRACK_PARAGON_MIN_DAYS` 180, `rankIndexForStage(stage, gateLevel?)` (BETWEEN takes the gate below; PART its own stage's; null for a track stage), `DepthRankInput`, `topRankIndexOfDepth(input)`, `ParagonMissing`, `paragonMissingOf(input)` |
| Dates | `DateMode`, `DATE_MODES`, `DateVerdict`, `DATE_VERDICTS`, `OVER_PACE_FACTOR` 2, `SCHEDULE_BOUND_SHARE` 0.9, `PACE_SHARE` (= INTENSITY, the same object) |
| Reach | `REACH_P_STEP` 0.005, `REACH_C_STEP` 0.01, `REACH_RHO_STEP` 0.05, `REACH_T_MAX` (= SPAN_MAX_DAYS), `P_PRIOR` 0.80, `C_PRIOR` 0.85, `RHO_PRIOR` 0.6, `LONG_GAP_LEVEL` 9, `P_LONG_CAP` 0.80, `CLEARANCE_SERIES_DAYS` 90, `OFF_DAY_CLEAR_SHARE` 0.5 (an off day clears under half its queue), `RHO_MIN_DAYS` 28 (ρ calibrating below), `REACH_STRIKE_LIMIT` 2 (srs.ts STRIKE_LIMIT, grep-pinned), `CalibratingInput` / `CALIBRATING_INPUTS` ('p', 'c', 'rho', 'pace') |
| Integrity | `IntegrityVerdict` / `INTEGRITY_VERDICTS`, `IntegrityCode` / `INTEGRITY_CODES`, `IntegrityViolation`, `ValidationIntegrity`, `integrityVerdictOf(violations)` |
| Keys | `CardSegment` ('r' \| 'rc'), `CARD_SEGMENTS` |
| Legacy | `isLegacyRoadmap({fieldId, depth}, rows)` |
| Missing columns | `REV4_COLUMNS` (the eight), `isMissingRev4Column(err)`: P2022 or 42703 naming one of them (the twin of isMissingRoadmapTable) |
| Ledger | `ReviewOutcomeWord`, `ReviewDetail`, `parseReviewDetail(detail)` |

### 14.4 The reach model (F-R4-8), implemented in full in roadmap-types.ts

| Export | Signature and meaning |
|---|---|
| `ReachParams` | {p, pLong, c, rho, m, strikeLimit, graceExtra} |
| `reachInputsOf(throughput, m, {extraStrikes?, graceExtraDays?})` | → {params, calibrating}: p from passShare (P_PRIOR while calibrating), pLong = min(p, P_LONG_CAP), c from clearance (C_PRIOR), ρ from `Throughput.absencePersistence` (RHO_PRIOR while calibrating or absent), strikeLimit = 2 + extra strikes, graceExtra = the GRACE_EXTENSION days. Never p = 1 or c = 1 while calibrating |
| `bestCaseParams(m, strikeLimit?, graceExtra?)` | p = pLong = c = 1: the secondary "earliest if every review passes" line |
| `reachParamsKey(params)` | the rounding and clamping the table is built (and memoised) with: p to 0.005, pLong and c to 0.01 (pLong never above p after rounding), ρ to 0.05, c ≥ 0.01, and ρ raised to (1 − 2c) ÷ (1 − c) when c < 0.5 (else no chain has on-share c) |
| `ReachOpts` | {cleanAt?: L*}: only the depth terms; it applies when cleanAt equals the target L |
| `ReachTable`, `reachTable(params)` | `.reachProb(level, L, slackDays, opts?)`: the probability a card due today at `level`, no strike, reaches L within Σ_{l=level+1..L−1} interval(l, m) + slack; 1 when level ≥ L; 0 for a negative slack; the first day's state drawn at the stationary on-share c; windows past REACH_T_MAX read as REACH_T_MAX |
| `reachProb(params, level, L, slack, opts?)` | the one-off form |
| `ReachCard` | EffectiveCard + `retryEntry?` |
| `existingExpectedSlack(cards, L, d, params, opts?)` | cards at ≥ L count 1 (with cleanAt = L, a card at exactly L on a retry entry counts reachProb(L, L + 1, d − its due day) instead); every other card reachProb(ℓ_eff, L, d − bestReach(L), opts); a negative slack 0 |
| `WriteDay`, `newExpectedSlack(writeDays, L, d, params, opts?)` | Σ count × reachProb(1, L, d − w − floorBase(L, m), opts); a WriteDay is a DayKey (one card) or {day, count} (fractional allowed) |
| `referenceWriteDaysOf(newByDomain, ratePerWeek, today)` | **the reference writing plan** (the worked examples' and every golden's): r_d = rate × new_d ÷ Σ new; card k (0-based) of Domain d on day floor(7k ÷ r_d). R2's plan must reduce to it with no held day and no capacity cap |
| `StageDomainInput`, `stageDayOf(domains, L, today, params, opts?)` | the first day every Domain's existing + new expected ≥ n_d (binary search; null past REACH_T_MAX) |

**The DP** mirrors srs.ts and the degrade cron as F-R4-8 states, over (days left, level, strikes, days overdue, today on/off). Three readings the spec leaves implicit, decided here:
1. **A strike keeps the grace clock** (srs.ts never resets graceEndsAt on a strike): the retry is tomorrow at overdue o + 1, and past grace that day the cron degrades it (max(1, ℓ − 1), due the next day, s = 0, o = 0), exactly as after an off day.
2. **The pass rate follows the level reviewed**: pLong for any review at ℓ ≥ 9, a next-day retry included.
3. **A wait of k days** uses the k-step two-state chain: P(on after k | on) = c + (1 − c)λ^k, P(on after k | off) = c − cλ^k, λ = ρ − (1 − c)(1 − ρ) ÷ c.

**Goldens** (roadmap-contract-check): reachProb(1, L, 0) = p^(L−1) (to 1e-12) for L 6/8/10/12 and p .75/.85/.92; at p .85, c = 1: L12 slack 7/30/60 → **0.822 / 0.904 / 0.950** (0.821870 / 0.904420 / 0.950450), L10 slack 7 → **0.862** (0.862463), L8 slack 30 → **0.993** (0.993155); p .75 L12 slack 60 → **0.842** (0.842352): design B's figures, reproduced. p = c = 1 gives 1; monotone in slack, p and c; m = 1.5 scales the floors; a card past grace projects from ℓ − 1; rev 3's 18.4 at zero slack; the spec pack's Inference **26.0** of 28 by day 434 (rev 3: 2.6). The new parameters, computed, printed and pinned: ρ = 1 − c equals an independent model of independent days exactly (with and without clean entry); strictly decreasing in ρ at c 0.9 (ρ .1 → .9: 0.9494 0.9490 0.9485 0.9475 0.9454 0.9397 0.9228 0.8742 0.7523); pLong 0.80 < p 0.85 lowers L10 (0.9307 < 0.9478) and L12 (0.9137 < 0.9504) and leaves L8 (0.9932); cleanAt 12 at p .85: **0.8265** against 0.9504, equal at p = 1 and at a strike limit of 1; the priors 0.80 / 0.85 / 0.6. Building a c < 1 table takes 4–15 ms (budget 400).

### 14.5 The worked examples, recomputed (F-R4-10)

**Superseded in the fix round:** WRITE_MARGIN is now 1.3, and §15.2 has the pinned figures. The table below is at 1.1, and the check keeps it as the reason for the change.

Stage days from today, before the Sunday snap, at c = 1 with no held day, through `stageDayOf` and `referenceWriteDaysOf`. Fixtures (R2's realism-check should reuse them):
- **The spec pack.** Inference: 9 cards at level 2 due today (the fixture rev 3's "2.6" implies: 9 × 0.8¹⁰ + 19 × 0.8¹¹), n 25, 19 new at 3 a week. Probability: 42 cards matching its D-line (2 at L12 due in 40–41 days; 6 at L8, 5 at L7, 5 at L6, 8 at L5, 8 at L4, 8 at L3, due within 30 days), n 34, no new cards; it binds no gate. p 0.8.
- **The new learner.** Two new Domains, n 25 each, 28 new each, 4.2 a week shared (Steady) and 5.4 (Push); p 0.85.

| Plan | Model | L4 | L6 | L8 | L10 | L11 | L12 | best L12 |
|---|---|---|---|---|---|---|---|---|
| Pack | design B (pLong = p, no clean entry) | 43 | 63 | 109 | 202 | 286 | 414 | 375 |
| Pack | **final** (pLong = min(p, 0.80), cleanAt 12) | 43 | 63 | 109 | 202 | 286 | **517** | 375 |
| New learner, Steady | design B | 89 | 108 | 153 | 241 | 318 | 431 | 420 |
| New learner, Steady | **final** | 89 | 108 | 153 | **242** | **321** | **547** | 420 |
| New learner, Push | design B | 70 | 89 | 135 | 223 | 300 | 412 | 402 |
| New learner, Push | **final** | 70 | 89 | 135 | **224** | **303** | **537** | 402 |

The reference reproduces every design-B figure exactly, so the recomputation differs only by the final model. The merges, the count gate (the learner's first window is still 108 days) and the ranks hold: the pack's [L6, L8, L10, L11, L12] → [2, 3, 4, 4, 5]; the learner's [PART(L6), L6, L8, L10, L11, L12] → [2, 2, 3, 4, 4, 5]. **Mastered moves 100–125 days later** (pack 414 → 517; learner 431 → 547 at Steady, 412 → 537 at Push): clean entry makes the ~20% of cards that miss their level-11 review at the first try wait for their next review, 160 days on, and WRITE_MARGIN 1.1 leaves only a 10% spare. A new learner's Mastered is about 18 months, not decision 41's "about 11–15 months" (§14.14).

Proficiency v2's arithmetic is pinned too: the floor table 1.8 / 7.4 / 20.3 / 45.6 / 67.6 / 100% and the worked example's 0.2859 → 28%.

### 14.6 roadmap-catalog.ts (F-R4-18), new, complete

| Export | Meaning |
|---|---|
| `CatalogTrack` ("FIELD" \| Track), `CATALOG_TRACKS`, `CatalogSlot` (PRACTICE \| STEP \| CHECKPOINT) | Where a type is used. A Field Area is FIELD whatever its life track |
| `PracticeKind` (24), `StepKind` (8), `CatalogKey` (+ the 4 CheckpointKinds) | The keys |
| `CatalogEntry` | {key, slot, method (null for steps and checkpoints: not sessions), template, trackTemplate? (the CRAFT track's {aim} form), tracks, needs, examOnly?, lastStageOnly?, codeOnly?, keywords, how (3–5 lines)} |
| `CATALOG` | every entry, in enum order; the spec's lists exactly (Field 13, BODY 6, CARE/DUTY 5 practices; 8 steps; 4 checkpoints). TECHNIQUE_SESSION serves BODY and CRAFT; SLOW_DRILLS, RUN_THROUGHS and WITH_A_PARTNER serve FIELD and CRAFT |
| `PRACTICE_KINDS`, `STEP_KINDS`, `CATALOG_CHECKPOINT_KINDS` | per slot |
| `RETRIEVAL_KINDS` | RECALL_DRILLS, READ_AND_CARD, LISTEN_AND_REPEAT |
| `PRODUCTION_KINDS` | PROBLEM_SETS, EXPLAIN_IT, WRITING_PRACTICE, BUILD_SOMETHING, RUN_THROUGHS, MISTAKE_REVIEW, SAY_IT_ALOUD, TIMED_PRACTICE |
| `BODY_SAFE_KINDS` | EASY_SESSION, MOBILITY_SESSION, TECHNIQUE_SESSION *(§19 marks the same three `CatalogEntry.safe: true`, and `CUE_SAFE_KINDS` reads them; a golden pins the two lists equal)* |
| `CATALOG_ENUM_MAX` | 42 |
| `isCatalogKey`, `catalogEntryOf(key)` | own-property lookups on a null-prototype map ('__proto__', 'constructor', 'toString' never resolve) |
| `catalogTrackOf({fieldId, track})`, `catalogTemplateOf(entry, track)`, `catalogNeedOf(entry, track)` | |
| `CatalogRunFilter`, `catalogKindsFor(slot, filter)` | the run's enum before the constraint filter: the slot's types for the track, no codeOnly, examOnly only with an exam, none with practices off, minus `excluded` (R3 passes constraintExclusionsOf's kinds). lastStageOnly types stay in (the validator drops them before the last stage). Empty → omit the property |
| `CatalogFill`, `catalogLabelOf(key, fill)` | the CodeText label; throws off its track or on a missing fill |
| `catalogOriginOf()`, `catalogHowOf(key)`, `catalogBandOf(key)` | 'CODE'; the how lines (R5's KIND_HOW reads them); the method's default band |

All of the catalog's templates are in `CODE_TEMPLATES`. roadmap-catalog.ts is the second place (after roadmap-realism.ts) that may call codeText() and write the literal origin 'CODE' (the spec's grep rule).

### 14.7 Code templates and titles (F-R4-10)

`CODE_TEMPLATES` gains the stage titles "{stage}: {domains} to level {L}+", "{stage}, part 1: {domains} to level {L}+", "{aim} · stage {k} of {n}" and every catalog template. `CodeFill` gains `stage` (a STAGE_NAMES name or "Toward <gate>", validated), `exam` (YoursText), `k` and `n` (1..MAX_MILESTONES, k ≤ n). `codeText` now fills every slot **in one pass** (a Domain named "{L}" or an aim holding "{aim}" is never filled again), and `{domains}` reads up to three names, then **"A, B and two more"** (spelled; new export `domainsShort`). `domainsText` is unchanged.

### 14.8 The measure-key segment (F-R4-9)

`cardsAtLevelKey(domainIds, level, segment?)` writes `CARDS_AT_LEVEL|d:<ids>|L<n>|r` or `…|rc`; `ParsedMeasureKey`'s CARDS_AT_LEVEL variant gains `segment?` (present only when the key has one, so a legacy key parses exactly as in rev 3). `parseMeasureKey` is the one parser: roadmap-contract-check greps src/ for any other (`CARDS_AT_LEVEL\|` or `PRACTICE_KEPT\|` in a regex, `startsWith("CARDS_AT_LEVEL`, `measureKey.split(`) and finds none.

### 14.9 New and changed shapes (all optional or new)

- `Syllabus.lineDomains?`; `Intake` gains `depth?`, `coverage?`, `dateMode?`, `exam?` (the Yes/No answer), `examDay?`, `newDomainNames?`, `replaces?`, `suggestAreas?`; `examPrefillOf(aim)`.
- `DraftReplyV3` {needs?, stages, gaps?} and `DraftReplyStage` {lines?, practices?, steps, checkpoint?}; `DraftReply` (v2) stays for legacy reads.
- `ItemDraft.catalogKey?` (and `groundRef?`, a GAP's source index, stored in syllabusRef); `MilestoneDraft.stage?`, `.arrangedBy?`.
- `ValidationReport.integrity?`; `ValidatedDraft` gains `needs?`, `exclusions?`, `sessionPicks?`, `gaps?`, `gapsHidden?`, `unassignedLines?`.
- New: `ConstraintExclusion` {kind, word}, `SessionPicks` {kinds, constraints, decision PENDING \| KEPT \| EASY}, `AimConflict` {word}, `DomainAddition` {itemId, domainId, name, cards, atSix, n, dateWith, blocked}, `GroundSourceKind`, `GapView`, `DomainOrigin` / `DomainOrigins`, `CoverageChoice` {domainId, policy, typed, day}, `DepthChoice` {from, to, day, reason CHOICE \| EXAM}, `CoverageBreakdown` (every Domain's three terms, typed, n, belowPolicy), `DateOrigin` {origin REALISTIC \| USER, calibrating}, `DateCheck` (the spec's field names: D_real, D_full, D_best_pace, D_best_2x, D_floor, verdict, rateAsked, reachByUserDate, reachByExam, scheduleBound, dateOrigin, basis), `MotivationTimeline`, `DepthView`, `LegacyView`.
- `CardState.recall?` and `.retryEntry?`; `Throughput.absencePersistence?` (ρ); `EndStateTerm.targetSource?`; `RealismInput` gains `depth?`, `dateMode?`, `userDate?`, `examDay?`, `reach?`, `calibrating?`, `sourceRate?`.
- `Feasibility` gains `reachModel?`, `dateCheck?`, `depthChoice?`, `coverageChoices?`, `domainOrigins?`; `StartWeek.needRateByDomain?`; `StartSnapshot` gains `reachModel?`, `pLongStart?`, `cStart?`, `rhoStart?` (the spec's pLong_start, c_start, ρ_start, named like rev 3's pStart), `calibrating?`, `newNeededByDomain?`.
- Week quests: `RaisePart`, `AddPart`, `RaiseQuestSpec.parts?`, `AddQuestSpec.parts?`, `WeekQuestCardInput.domainId?` and `.segment?`, `WeekQuestInput.cards?`, `QuestEvidence` RAISE `byDomain?` and ADD `addedByDomain?`, `WeekQuestProgress.parts?`, `WeekQuestRow.parts?`.
- Pages: `IntakeView` gains `m?`, `dateChips?` (`IntakeDateChip` {months, day, possible by depth}), `paceRate?`; `AimCardMilestone.stage?`, `.gateLevel?`; `LastAimView`; `AimCardView` gains `aimSuggestions?`, `lastAim?`, `depth?`, `dateChip?`, `heldDepth?`, `legacy?`; `AimStepMilestone`, `AimStep` (R4's loadAimStep), `AimLineView` (SET \| DRAFT \| START, with its href); `RoadmapHeader` gains `depth?`, `dateMode?`, `examDay?`, `dateOrigin?`, `legacy?`; `DraftView` gains `exclusions?`, `sessionPicks?`, `aimConflict?`, `gapsHidden?`, `gaps?`, `additions?`, `additionsMode?`, `unassignedLines?`, `dateCheck?`, `depth?`, `legacy?`; `MilestoneRowView` gains `stage?`, `gateLevel?`, `held?`; `RoadmapView` gains `depth?`, `dateCheck?`, `paragonMissing?`, `legacy?`, `gaps?`, `gapsHidden?`.

### 14.10 roadmap-invite.ts and roadmap-handoff.ts, new, complete

**roadmap-invite.ts** (client-importable; no database, no clock: every rule takes `today`):
- Constants: `AIM_LATER_DAYS` 28, `AIM_PROMPT_LATER_MAX_AGE_S` 365 days, `AIM_AWAY_DAYS` 7, `AIM_BACKOFF_FRESH_DAYS` 4, **`AIM_INVITE_SINCE` "2026-10-06"** (the deploy day, set in fix round 2, §16.5; it was the placeholder "2026-11-06"), `AIM_DRAFT_SHOWS_MAX` 3, `AIM_START_DAILY_DAYS` 7, `AIM_DONE_SHOW_DAYS` 28, `AIM_STEP_COOKIE` "xtnl-aim-step", `AIM_STEP_SNOOZE_DAYS` 7, `AIM_STEP_COOKIE_MAX_AGE_S` 8 days, `VAGUE_AIM_WORDS`, `VAGUE_AIM_IDLE_MS` 600; it re-exports `AIM_PROMPT_COOKIE`.
- `AimPrompt`, `aimPromptOf(cookie, setting, today)`, `laterCookieValue(today)`, `onCookieValue(today)`, `askAnchorOf(cookie, lastClosedDay, epochDay)`.
- `AimSeed` {goalId, title, targetDay?}, `SeedGoal`, `longGoalSeedOf(goals, today)` (takes s.goals, a GoalLadder, or a list; "no roadmap link" = no `roadmap` entry and krMetric not ROADMAP).
- `isFreshStartDay(today, lastOpenBefore)`, `freshStartDaysBetween(a, b)`, `AimStepKind`, `stepCookieValue(kind, id, today)`, `stepSnoozed(stepCookie, kind, id, today)`, `TodayAimLineInput`, `todayAimLineOf(input)` → `AimLineView | null`, and the three hrefs `AIM_LINE_SET_HREF`, `AIM_LINE_DRAFT_HREF`, `AIM_LINE_START_HREF`.
- `vagueAimHint(aim)` → boolean (R5 renders the copy).
- Choices the spec left open: START's "previous milestone" is the row just before by ord (not LATER); its close day is `closedDay`, or a held row's reachedDay; the rank it gives is its rankIndex when above the highest rank reached inside the plan, else "It keeps your rank" (null). DRAFT's count is s + 1 (when before today) plus the Mondays and 1sts after it, before today.

**roadmap-handoff.ts** (the idea-handoff pattern; never throws): `AIM_HANDOFF_KEY` "xtnl:roadmap:aim-handoff", `AIM_HANDOFF_TTL_MS` 600 000, `AIM_HANDOFF_AIM_MAX` 500, `AimHandoffSource`, `AimHandoff`, `StoredAimHandoff`, `AimHandoffStorage`, `writeAimHandoff(h, storage?, now?)` → boolean, `takeAimHandoff(now?, storage?)` → `StoredAimHandoff | null` (one use; drops stale, future-stamped or malformed entries, and malformed optional fields), `aimLineOf(text)`.

roadmap-invite-check imports `_no-model` first, and contract-check pins all three new lane-0 modules pure (no Prisma, model, cookie or cache module). They are roadmap modules for the _no-model rule: a check that reaches them (lane C's capture checks, through QuickCapture) imports `_no-model` first.

### 14.11 The REVIEW ledger tag (src/lib/srs.ts)

A pass's detail is now "advanced · L11→12" ("advanced · mastered · L11→12"); a miss's "strike · L11" (and "degraded · L11", "shielded · L11"): the level the review was taken at. It is appended at the end so every prefix reader still matches; existing rows are untouched. The miss tag rides `lateOutcome`'s value, so review-check's pin on the after() call still holds (review-check stays green). `parseReviewDetail` reads tagged and untagged rows alike.

**PENDING (lead), a live regression until fixed:** `src/components/library/library-model.ts outcomeOf` compares `d === "strike" || d === "degraded" || d === "shielded"`, so a tagged miss reads null and the idea page's history drops it. The fix is one line: `if (d.startsWith("strike") || d.startsWith("degraded") || d.startsWith("shielded")) return "miss";`. roadmap-contract-check lists the file as the one known exact reader and prints a PENDING line; it fails if any other exact reader appears, and once library-model.ts is fixed it fails until the KNOWN_EXACT_READERS entry is deleted. **Do not ship srs.ts without it.** *(Done in the finishing round: outcomeOf switches on `parseReviewDetail(detail).outcome`, the KNOWN_EXACT_READERS set and its PENDING are deleted, and the grep is strict, §18.1.)*

The other PENDING line: the rendered-label constraint golden ("no running" excludes HARDER_SESSION) waits for R3's constraintExclusionsOf.

### 14.12 Shells by lane, and the handoffs

Each shell is a signature with a `STUB: lane X implements (F-R4-n)` comment.

- **R2** (roadmap-realism.ts): `CoverageInput`, `coverageOf`, `lineDomainDefaultOf`, `depthTermsOf`, `StageLadderResult`, `stageLadderOf`, `motivationTimelineOf`, `dateCheckOf`, `lowerDepthPlanOf`, `dateEffectOf`, `floorDayOf`, `syncStagePractices`. Stage dating calls `stageDayOf`; the worked examples (§14.5) are its goldens.
- **R3** (roadmap-validate.ts): `integrityOf`, `normaliseReportPath`, `KeysOnlyContext`, `validateKeysOnly`, `constraintExclusionsOf`, `gapNameShape`, `GroundSource`, `groundingOf`. Also: roadmap-model-check's `prompt version 2` becomes 3; `NOT_IN_YOUR_WORDS` and the four new DropReasons have placeholder words in FLAG_REASON and DROP_REASON (lane-0 shells; R3 finalises). The rev-3 carry-overs (the enumerator first-token residual; the strict `isReusableRun` pin) are R3's.
- **R4** (roadmap-server.ts): `loadAimStep` (inert: null), `AimCookieJar`, `snoozeAimPromptCore`, `snoozeAimStepCore`, `setAimSuggestionsCore`, `lowerDepthCore`, `confirmDomainAdditionsCore`, `confirmSessionPicksCore`, `moveLineCore`, `setLineDomainCore`, `ModelTextContext`, `assertNoModelText`, `writeRoadmapRows`; actions/roadmap.ts: `snoozeAimPrompt`, `setAimSuggestions`, `snoozeAimStep`, `lowerDepth`, `confirmDomainAdditions`, `confirmSessionPicks`, `moveLine`, `setLineDomain` (each answers "Not yet."). Also: itemDraftOf must read `STORED_CHECKPOINT_KINDS` (EXAM_DAY); `LABEL_MAX.GAP`, `KIND_CAP.GAP` (0) and `NAME_OF_KIND.GAP` are lane-0 placeholders; `dismissAimPrompt` and its 'off' writer retire. The rev-3 carry-overs (milestone numbering after Drop → Start again → Re-plan; the opposite-state planning read; carried topics in "Not in this plan yet") are R4's.
- **R5**: new `AimLine.tsx` (renders nothing); `AimCardProps` gains `prompt?`, `seed?`, `lastAim?` (types only); roadmap-copy's `CHECKPOINT_KIND_WORD.EXAM_DAY`, `FLAG_WORD.NOT_IN_YOUR_WORDS` and its `flagReason` case, the four new `NOTE_WORD`s and four `MILESTONE_NOTE_LINE`s, and AddItemSheet's `CAP.GAP` (0) / `KIND_WORD.GAP` are lane-0 placeholders in the spec's words. roadmap-ui-check's provenance grep must allow roadmap-catalog.ts. The rev-3 carry-overs (ChecksPanel's FITTED sentence, DraftFooter's impossibleMs, the Reference's duplicate keys, an empty Gemini title kept, RunFacts' STARTER writer) are R5's.
- **R7**: scripts/roadmap-hostile-check.ts and roadmap-hostile-ablate.ts are shells that import `_no-model` first and exit 1 ("Not yet"), so life:check's last step fails until R7 lands; R7 replaces both files.
- **R1, R6**: no new shells (their names are rev 3's; the new types are here). roadmap-pace's `REPLAN_TRIGGERS` loop never finds CALIBRATED until R1 adds it.
- **T, Y, C**: mount `AimLine` from `todayAimLineOf(loadAimStep…)`; pass `prompt`, `seed`, `lastAim` to AimCard; Settings' switch calls `setAimSuggestions`; capture uses `aimLineOf` and `writeAimHandoff` (and its checks import `_no-model` first). Lane Y also owns the carry-overs LibrarySearch.tsx (LEVEL_FILTER_MAX, §9.7), YouTabs.tsx (scroll cue) and DangerZone.tsx (roadmap counts).

### 14.13 Scripts and package.json

- New `scripts/roadmap-invite-check.ts` (53 checks) and the R7 shells; package.json gains `roadmap-invite:check`, `roadmap-hostile:check`, `roadmap-hostile:ablate` and `goals-close:check`.
- **life:check** runs goals-close-check right after character-check, and appends roadmap-invite-check and roadmap-hostile-check after rev 3's seven roadmap checks (Acceptance). ui:check is unchanged (tour-check already runs). life-day-check's exact list and roadmap-contract-check's integration section pin both.
- roadmap-contract-check grows from 200 to 313: the rev-4 constants and unions; the reach model and its goldens (§14.4); the worked examples (§14.5); coverage arithmetic; stage names (disjoint from every ladder, the Aim ranks, "Recall" and "Working knowledge"; "Mastered" only at level 12), stageLabelOf, rankIndexForStage, and topRankIndexOfDepth's whole truth table (1,536 rows) against a table written apart; the measure-key segment and the one-parser grep; the titles and the one-pass fill; the catalog (renders, words, methods, enums, flags, keywords, retrieval and production, prototype keys); the ledger tag and its readers; isLegacyRoadmap, integrityVerdictOf and isMissingRev4Column; the rev-4 shapes, compiled and serialisable; the shells' presence; the three new modules' purity; no check importing the probe; the migration and the schema fields.

### 14.14 Deviations and open points for the lead

1. **The count gate's "part 1" holds a digit.** F-R4-10's test says titles hold no digit but {L}, {k}, {n}; the spec's own PART title and stage name ("Familiar, part 1", question 13) hold "1". Kept as written; the digit pin exempts that literal.
2. **ABOUT_YOU in code copy.** F-R4-18 bans ABOUT_YOU words in templates and how lines, but ABOUT_YOU_WORDS includes "you" and "your", which the spec's own templates and how example use ("Go over your mistakes", "Close your notes and cards."). The pin bans the evaluative words (weak, strong, already, gap, fix, struggle, beginner …) and allows the pronouns; "strength" is allowed only inside the type name "Strength session".
3. **Steps and checkpoints carry no method** (null): they are not sessions. "Every kind maps to a PracticeMethod" is pinned for every practice type.
4. **CHECKPOINT_KINDS stays the pickable three**; EXAM_DAY is in the union and in `STORED_CHECKPOINT_KINDS` (listing it in CHECKPOINT_KINDS changed the v2 prompt and let the editors offer it).
5. **AIM_INVITE_SINCE** was a placeholder ("2026-11-06", the migration's date). The lead sets the deploy day; an early value would spend the back-off before anyone saw the line. **Fix round 2:** now Tue 6 Oct 2026 (§16.5).
6. **Mastered moves later under the final model** (§14.5): a new learner's realistic Mastered is ~547 days at Steady (about 18 months), outside decision 41's "about 11–15 months" and question 9's wording. The arithmetic follows the spec; the copy and the reviewers should use the recomputed figures. If 18 months reads too far, the levers are WRITE_MARGIN (a larger spare absorbs retry entries) or P_LONG_CAP: product calls, not lane 0's. **Fix round:** WRITE_MARGIN is now 1.3 (§15.2), which puts the learner's Mastered on day 460, about 15 months.
7. **library-model.ts** (§14.11): one line, lead-owned, required before shipping srs.ts. *(Done in the finishing round, §18.1.)*
8. **The pack's Probability fixture** is lane 0's (the spec gives only its D-line); design B's Probability bound no gate either, so the pack's days are Inference's.

## 15. Revision 4 fix round (lane 0, first and alone)

The three read-only reviews of the revision-4 build (hallucination bar; high mastery, realism and economy; encouragement and honesty at 344 px) found places where lanes disagreed, read fields through casts, or needed a seam. Lane 0 ran first and alone and put **one definition** of each into lane-0 files. Everything added is new or optional, so every earlier export still compiles. Every other lane reads its files as this section leaves them. §15.14 records what the lanes exported in the revision-4 build round, read from the code, because §14 had none of it.

### 15.0 State of the tree after lane 0

- `npx tsc --noEmit -p .` is clean apart from one generated file outside the repo's sources. `.next/dev/types/routes.d.ts` was truncated to 0 bytes at 08:19 by a process outside this lane, so `.next/dev/types/validator.ts` fails to import it. With `.next` excluded, the type-check exits 0. eslint is clean on every file lane 0 touched.
- **roadmap-contract-check** passes **336 strict checks** (314 before this round) with **25 PENDING** lines (§15.13). **roadmap-invite-check** passes **54** (53 before).
- life:check: every script passes except two, and both fail only on re-pins this round asks for.
  - **roadmap-realism-check** (R2) has 12 failures, all from WRITE_MARGIN 1.3 (§15.2): `new_d` is 24 and 3, the worked examples, the learner's timeline and REALISTIC days, the StartSnapshot's `writeNeedOf(25, 0) = 33`, and two ladder fixtures whose writing changed.
  - **roadmap-quests-check** (R6) has 25 failures, all ADD goldens: coverage need, pace and caps follow `ceil(1.3 × n)`, plus the basis text "1.1 × 18 = 20, a 10% spare".
  - **roadmap-hostile-check** has 27 passes and the same 5 failures the reviews found, all R3's and R7's (§15.15):
    - H1 taint: 219 hits (379 before);
    - H3: 3 claim strings shown;
    - K: 39 of 1188;
    - M5: 4 of 400;
    - BUDGET: 83.9 s for H1–H5 and K, 97 s for the whole check.
- ui:check: every script passes except **you-check**, which has the 1 failure lane Y already owns (`empty-later-last-aim`). balance:horizon passes.
- package.json gains `roadmap-contract:strict`. The integration gate is `npm run roadmap-contract:strict`: it fails on any PENDING left over.

### 15.1 Clean entry: one definition (roadmap-types)

R1's rule moved into roadmap-types, because the reach DP follows the same rule (lens 2). It has one addition, taken from R6: a backfill or unrecognised row is skipped, not read as the row before the pass. R1 had `roadmap-measures.isRetryEntry` and R6 had its own `roadmap-quests.isRetryEntry`, and the two disagreed in three ways:
- R6 read tagged rows more than 2 days apart as clean;
- R6 read `shielded` or `degraded` before the pass as clean;
- R6 read a later `strike · L12` as clean.

| Export | Meaning |
|---|---|
| `ReviewLedgerRow` | `{day, detail, occurredAt?, at?}`. Rows are ordered by `occurredAt` (ISO; R1's rows), else `at` (epoch ms; R6's rows), else the day at 00:00 UTC. Ties keep their input order. |
| `isRetryEntry(rows, level)` | **The entering pass** is the latest `advanced…` row. On a tagged row it must read `L(level−1)→level`.<br>**It is a retry entry** when the row just before that pass is a miss: `strike`, `shielded`, or `degraded` from `level`. With tagged rows the climb decides, whatever the gap in days. With untagged rows the miss must fall within RETRY_ENTRY_DAYS of the pass.<br>**Backfill and unknown rows** are skipped. With no pass in the rows, the card reads as clean. |
| `retryReadDaysOf(level, m?, graceExtra?)` | ~~interval(level, m) + graceDays(level) + RETRY_ENTRY_DAYS + graceExtra (173 days at level 12)~~. **Fix round 2 (§16.1):** widened to hold the entering pass and the miss before it, 184 days at level 12 (264 at m = 1.5). |

R1's goldens and R6's still hold on this definition, except where the rule changed: R6's tagged case of "a strike 3 days before" now reads as a retry. roadmap-contract-check pins both sets.

### 15.2 WRITE_MARGIN 1.1 → 1.3 (lens 2 major; question 9, decision 41, F-R4-10)

Under clean entry, about 1 card in 5 misses its level-11 review at the first try and waits about 160 days for its next pass. A 10% spare can't cover that. At 1.1, a new learner reached Mastered on day 547 (about 18 months), and the final stretch ran 203–231 days on 6 corpus fixtures. Both broke question 9 ("about 11–15 months") and F-R4-10's bound (≤ MILESTONE_MAX_DAYS + 6 = 192).

The spec's own reason for the constant is "a spare, because some cards lag". 1.3 is the smallest round value that keeps both promises.

| Fixture (final model) | L4 | L6 | L8 | L10 | L11 | L12 | best | final stretch |
|---|---|---|---|---|---|---|---|---|
| Pack at 1.1 | 43 | 63 | 109 | 202 | 286 | 517 | 375 | 231 |
| **Pack at 1.3** | 48 | 68 | 114 | 205 | 282 | **430** | 379 | 148 |
| Learner Steady at 1.1 | 89 | 108 | 153 | 242 | 321 | 547 | 420 | 226 |
| **Learner Steady at 1.3** | 89 | 108 | 153 | 242 | 321 | **460** | 420 | 139 |
| **Learner Push at 1.3** | 70 | 89 | 135 | 224 | 302 | **446** | 402 | 144 |
| Learner Steady at 1.3, priors (p .80, c .85, ρ .6) | 90 | 112 | 160 | 251 | 330 | 479 | – | 149 |

What changes:
- `writeNeedOf`: Inference (n 25, 9 live) needs **24** new cards and Probability (n 34, 42 live) **3**. A new 25-card Domain needs 33; n 30 needs 39.
- The cost is about 16 more writing days: the learner's last card falls on day 106 instead of 90.
- Design B's figures, at the spec's 1.1, are still reproduced exactly. The 1.1 final-model figures stay pinned too, as the reason for the change.
- With a measured or prior-based pass rate, a new learner's Mastered is about 15 months (≤ 470 days; 479 at the priors).

**One corpus fixture is still over the bound.** actuarial-probability runs a 196-day final stretch at 1.3, and the cause is not reach. Its Mastered falls on day 503 at 1.3, 1.35 and 1.4 alike, because the hours bound holds it there (typicalHours 300 at 6 h a week). R2's split places BETWEEN at L11's stage day (307), which leaves 196 days. That fix belongs to R2 (§15.15). realism-check's PENDING wording ("only because of clean entry") is wrong for this case.

**Spec lines that now differ (lead):**
- Constants: "WRITE_MARGIN 1.1 (a 10% spare…)" becomes 1.3 (a 30% spare).
- F-R4-9's realism golden "new_d: Inference 19, Probability 0" becomes 24 and 3.
- F-R4-14's ADD example.

The rules page and the How-measured sheet read `pct(WRITE_MARGIN − 1)` and follow on their own. R6's ADD basis hard-codes "a 10% spare" and must read the constant.

### 15.3 Coverage frozen at intake (lens 2 major)

- `Feasibility.coverage?: CoverageBreakdown[]` is now on the contract. R4 already wrote it on acceptances through an intersection type. It holds every required Domain's breakdown as worked out for this draft or acceptance, with the counts frozen at intake.
- `CoverageCounts` = `{id, live, nonRecall}`.
- `frozenCoverageCountsOf(today, prior)`: a Domain already in `prior` keeps its stored live and nonRecall counts, and only a Domain newly in R reads today's library. A malformed stored entry is ignored. `prior` is the current live acceptance's `coverage`, or the draft's on a first acceptance.

The effect: archiving cards, a card becoming multiple choice, or writing more cards never moves n_d at a re-plan's accept or at `lowerDepthCore`. It also never turns a typed figure into a false coverage choice. n_d moves only by a typed figure, a line's Domain, or LOWER_DEPTH.

### 15.4 A PART at the depth never gives the depth's rank (lens 2 major; decision 40)

`rankIndexForStage(stage, gateLevel?, depth?)` takes the depth as a third, optional argument.
- A PART counting toward the depth's own gate gives the rank of the gate below. The depth is `depth`, or 12 when the argument is omitted, since a PART at level 12 is always at the depth.
  - Under Mastered it gives Expert.
  - At a Fluent depth it gives Specialist.
  - At a Retained depth it gives Journeyman.
- A PART below the depth is unchanged.
- **Why:** a PART's target is at most n − 1 cards counted on `r`, retry entries included. Without this, a library holding Fluent got Virtuoso, which is never lost, before the depth was held.
- **Deviation from decision 40's literal "a count gate gives its stage's rank early"**, recorded for the lead. It follows the decision's "Mastered gives Virtuoso" and "stage rank = verified depth".
- Callers on a depth-10 or depth-8 plan must pass the depth: R1's assignRankIndices, R4's rankIndicesOf and R2's motivationTimelineOf.

### 15.5 Gap names not shown: one count (lens 1 minor)

`gapsNotShownOf(integrity)` = gapsHidden + gapsDropped. A missing or malformed count reads 0. It is the one figure behind "n not shown". R4's draftViewOf and R5's integrityLine read it instead of gapsHidden alone. It is latent while ROADMAP_GAPS_LIVE is false.

### 15.6 Plan-born tasks: no model sizes or explains one (lens 1 major; decision 50)

`isRoadmapCaptureKey(captureKey)` is true for a key starting with 'rm:' (`ROADMAP_CAPTURE_PREFIX`).

The channel it closes:
1. At Start, roadmap-server defers `life-sizing.applySizing` for every plan-born TaskTemplate.
2. mergeSizing stores Gemini's free `rationale` as `gradeBasis`.
3. TaskDrawer shows `gradeBasis` under "Why".

So Gemini's words about the plan's own practice reached Today. The rule:
- **R4**: Start never calls applySizing for an 'rm:' template. The catalog method already sets the band.
- **Lead**: life-sizing.applySizing refuses an 'rm:' template whoever calls it, writing the code basis `<category> · <band> · <minutes>m`.
- **R4**: a monitor (`SELECT id FROM "TaskTemplate" WHERE "captureKey" LIKE 'rm:%' AND "gradeSource" = 'AI' AND "gradeBasis" IS NOT NULL`, expect 0) and a server-check golden.

### 15.7 Acceptances: one order (lens 2 major)

- `acceptanceOrderBy()` returns a fresh `[{version: "desc"}, {acceptedAt: "desc"}]` for Prisma's orderBy. lowerDepthCore writes a second record within the same version, so `version` alone ties.
- `isDepthLoweringRecord(a)`: previousVersion === version. Plan history words such a record as "lowered the depth", not "the re-plan lowered the end target". It is never Undo-able, as R4's undoAcceptCore already says.
- R1 orders both `take: 1` reads in roadmap-readings this way.

### 15.8 Session picks: what the body/care confirm holds (lens 1 minor; F-R4-17)

`SESSION_PICK_KINDS` (roadmap-catalog) is every practice type plus FULL_ATTEMPT and PERFORMANCE_CHECK, the two types that are the activity itself. A cue-less or cue-first constraint ("pregnant", "knee injury") never excludes them. SET_UP stays out (RT-3). `isSessionPickKind(key)` does an own-property read.

- **R3**: lists these in `SessionPicks.kinds`.
- **R4**:
  - `pendingPick` holds a GEMINI_PICK of any of them;
  - confirmSessionPicksCore's EASY removes a picked FULL_ATTEMPT or PERFORMANCE_CHECK;
  - add a golden: lose-8kg with "pregnant".

*(Since §19 this confirm is the second layer. The confirm-to-unlock gate decides which kinds a plan path may place at all, and Gemini's enums leave out what it blocks.)*

### 15.9 Retrieval or production: one definition (lens 2 minor)

`practiceRoleOf({catalogKey?, method?})` (roadmap-catalog) is R2's rule:
- **By catalog type first.** RETRIEVAL_KINDS read retrieval, PRODUCTION_KINDS read production, and any other type reads null, so an easy session is neither.
- **By method, when there is no type.** READING and DELIBERATE_PRACTICE read retrieval; WRITING and PROJECT_WORK read production.

These all read it:
- **R2**: syncStagePractices and productionPlannedFromFluentOf;
- **R4**: productionFromFluentOf, the top-rank facts;
- **R1**: the production-kept reading.

A "Write it myself" plan with a typed WRITING practice from Fluent on is then Paragon-open in every lane, as R2's basis line already says.

### 15.10 New shells, the HIDDEN prompt and the hide cookie

**roadmap-invite** (lens 3 major; decision 34):
- `AimPrompt` gains **HIDDEN**.
- `hideCookieValue(today)` gives 'hide:<today>'. aimPromptOf reads it as HIDDEN while today < day + AIM_LATER_DAYS. Setting false or 'off' still wins.
- askAnchorOf counts a 'hide:' day + 28, as it counts 'later:'.
- HIDDEN quiets Today's SET line (todayAimLineOf shows SET only on ASK). Settings still shows the switch on (only OFF is off).
- /you renders HIDDEN as it renders OFF, except that the last aim's achievement line may show, with no link to a new aim and no ×.
- With this, the LATER line's × does what its label says ("Not now: no aim suggestions for 4 weeks"). Before, the line came back on the next visit.

**Shells**, each with a `STUB: lane R4 implements (…, fix round)` comment:

| Export | File | What R4 implements |
|---|---|---|
| `hideAimPromptCore(jar, now)` | roadmap-server.ts | AIM_PROMPT_COOKIE = hideCookieValue(todayKey(now)), with the same options as snoozeAimPromptCore. No database write. |
| `hideAimPrompt()` | actions/roadmap.ts | The action R5's LATER × calls. |
| `keepCalibratedDatesCore(userId, roadmapId, now, deps)` | roadmap-server.ts | **[Keep the dates]** on the CALIBRATED offer. Under the roadmap lock and lifeWritesEnabled, it rewrites the current live acceptance's `feasibility.dateCheck.dateOrigin.calibrating` to the inputs still calibrating. No re-dating and nothing else changes. It refuses when the roadmap isn't ACTIVE or has no CALIBRATED offer, and revalidates 'roadmap'. |
| `keepCalibratedDates(roadmapId)` | actions/roadmap.ts | The action R5 calls in place of RoadmapView's localStorage `KEPT_DATES_KEY`. |

### 15.11 View fields now on the contract (R5 read them through casts)

| Field | Producer |
|---|---|
| `IntakeFieldOption.domains[].nonRecall?` | R4's loadIntakeView always fills it: `d.cards.filter(c => c.type != null && !isRecallType(c.type)).length`. Until R4 does, the intake's coverage preview counts multiple choice as recall (lens 3 major). |
| `StartPreview.pay.restsOnAdded?` | R4's roadmap-economy, which already writes it |
| `CurrentMilestoneView.startFeasibility?`, `.startedDay?` | R4, from the StartSnapshot (**not filled today**) |
| `ProficiencyView.toward?`, `.label?`; `ProficiencyToward` | R1's proficiencyViewOf, which fills them. R1 re-exports roadmap-types' `ProficiencyToward` and deletes its own copy. |
| `WeekQuestRow.partsLine?`, `.health?` | R6's weekQuestsViewOf, which fills them. `health` is typed boolean; R6 writes only true. |
| `ItemEdit.catalogKey?` | R4's editItemCore, which reads it through a cast today. `NewItem.catalogKey` is R4's own type and gets the same field. |
| `RoadmapHeader.domainIds?`; `LegacyView.domainIds?`, `.areaFieldId?` | R4. Both "Start again at a depth" handoffs carry `domainIds` (lens 3 minor). |

### 15.12 One draft-from-reply step (lens 1 major #9)

`DraftFromReplyResult` = `{integrity, validated, plan, refused: REJECTED | TRIPWIRE | EMPTY | null}`.

- **R4** extracts runDraftCore's per-sample step into one pure exported `draftFromReply(…)`: integrityFor (the path re-normalised, the verdict override) → the REJECTED gate → planFromReply with its KeysOnlyContext → the tripwire as a dry run. runDraftCore, reuseRun and hostileViewsOf all call it.
- **R4** also adds RoadmapView, the AimCardView and the week-quests view of a started first milestone to hostileViewsOf, or the bar's item is renamed.
- **R7's seam** passes only the reply and the run, and asserts that R4's `integrity.verdict` equals the case's expected verdict. H4's no-write clause and H1's views then test production code, not the bar's own `validate`.

### 15.13 roadmap-contract-check: what this round pins

**Strict checks:**
- every helper above, on goldens;
- the recomputed worked examples at 1.3, and at 1.1 as the reason for the change;
- every final stretch ≤ 192, and the learner ≤ 470 days;
- the PART ranks, including "a library holding Fluent ranks [Expert, Virtuoso]";
- R1's and R6's clean-entry cases;
- the view fields compiling;
- review-facts reading the tagged details (F-R4-8's review-check golden, which no lane owned);
- the new shells' presence;
- `roadmap-contract:strict`.

**PENDING lines** (`pending()`): another lane's adoption of a lane-0 definition. Each passes once it lands, and `--strict` turns every one into a failure. 25 are open:

| Owner | Pending items |
|---|---|
| R1 | isRetryEntry and retryReadDaysOf re-exported, not redefined; acceptance reads tie-broken; practiceRoleOf in production-kept; the depth passed to rankIndexForStage |
| R2 | practiceRoleOf, not its own; the depth passed in motivationTimelineOf |
| R3 | session picks by isSessionPickKind |
| R4 | CardState.retryEntry; frozenCoverageCountsOf; gapsNotShownOf; no applySizing at Start; practiceRoleOf; pendingPick by isSessionPickKind; the depth passed in rankIndicesOf; the two shells implemented; `draftFromReply` |
| R5 | integrityLine counts gapsNotShownOf; no casts; AimCard handles HIDDEN and calls hideAimPrompt; keepCalibratedDates in place of localStorage |
| R6 | isRetryEntry imported; the spare read from WRITE_MARGIN |
| R7 | the seam on draftFromReply |
| lead | life-sizing refuses an 'rm:' template; library-model outcomeOf (two lines) *(both done in the finishing round, §18.1)* |

### 15.14 What the lanes exported in the revision-4 build round (read from the code)

**R1:**
- roadmap-measures:
  - `AimReachInput`, `AimReachMissing`, `aimReachMissingOf` and `aimReachedOf`;
  - `CardCounts`, `CardGroupRow`, `cardCountsOf`, `countsOfHistogram`, `cardsAtLevelFromCounts`, `CardsReadingDetail` and `CardsValue`;
  - `PracticeKeep`, `keptEnough` and `levelEntriesOf`;
  - `ReviewLedgerRow`, `isRetryEntry` and `retryReadDaysOf` (now roadmap-types', §15.1).
- roadmap-pace: `ASSUMED_WORDS`, `PaceCard`, `PaceReachOpts` and `calibratedLineOf(measuredNow, p?, c?)`.
- roadmap-readings: `loadCardCounts`, `cleanLevelsOf`, `milestoneNotesOf`, `movesCardCount`, `practiceKeepOf`, `stageGateLevelOf`, `standardOf` and `standardMetOf`.
- roadmap-proficiency:
  - `ProficiencyToward` (now roadmap-types', §15.11), `proficiencyTowardOf`, `proficiencyLabelOf` and `proficiencyLineOf`;
  - `ProficiencyViewR1` (ProficiencyView with `toward` and `label` required);
  - `StageRankFields`, `StageRankRow`, `stageFloorOf` and `floorPercentOf`.

**R2:**
- roadmap-realism:
  - `CoverageInput`, `coverageOf`, `lineDomainDefaultOf` and `depthTermsOf`;
  - `StageLadderOpts`, `StageLadderResult` and `stageLadderOf`;
  - `motivationTimelineOf`, `dateCheckOf`, `lowerDepthPlanOf`, `dateEffectOf` and `floorDayOf`;
  - `syncStagePractices` and `productionPlannedFromFluentOf`.
- throughput: `absencePersistenceOf(rows)` (ρ) and `clearanceSeriesStart(finalDay)`.

**R3:**
- roadmap-validate:
  - `integrityOf`, `normaliseReportPath`, `KeysOnlyContext`, `KeysOnlyFill` and `validateKeysOnly`;
  - `keysOnlySchemaOf`, `packRunOf`, `PackRun`, `examAnswerOf` and `KEYS_ONLY_REASONS`;
  - `constraintExclusionsOf`, `ExclusionFill`, `negatedTermsOf`, `NegatedTerm`, `aimConflictOf` and `sessionConfirmNeeded`;
  - `GapShapeClause`, `GAP_SHAPE_CLAUSES`, `gapNameShape`, `GroundSource`, `groundingOf`, `groundingSourcesOf`, `gapNamesOf`, `GapNamesContext` and `GapNamesResult`;
  - `DROP_REASON`;
  - `RuleOpts` {rules, lexicon, trace}, `RuleName`, `RULE_NAMES`, `RULE_EXAMPLES`, `H6_RULE_NAMES` and `LexiconLists`.
- roadmap-lexicon: `CONSTRAINT_CUES`, `CONSTRAINT_SCOPE_BREAKS`, `CONSTRAINT_GENERIC_WORDS`, `AREA_GERUNDS`, `ORDINAL_WORDS`, `QUOTE_PAIRS`, `START_NOUN_WORDS` and `START_TERM_PHRASES`.
- roadmap-evidence: `EvidencePackV3`, `CATALOG_GLOSS` and `systemInstructionOf(gaps)`.
- roadmap-model: `systemInstructionFor(pack)`.

**R4:**
- roadmap-server:
  - the writer: `RowWrite`, `ModelTextContext`, `ModelTextError`, `assertNoModelText` and `writeRoadmapRows`;
  - the draft: `materialiseKeys(ladder, validated, slots, {gapsOn, makeId})`, `transplantOnto` and `groundSourcesOf`;
  - the hallucination bar's seam: `HostileViewDomain`, `HostileViewInput` and `hostileViewsOf`;
  - the aim: `AimCookieJar`, `loadAimStep`, `snoozeAimPromptCore`, `snoozeAimStepCore` and `setAimSuggestionsCore`;
  - the plan: `lowerDepthCore`, `confirmDomainAdditionsCore`, `confirmSessionPicksCore`, `moveLineCore`, `setLineDomainCore` and `replacedReasonOf`;
  - the refusal words: `CHANGE_NOT_SAVED`, `CONFIRM_PICKS`, `COVERAGE_RANGE`, `DATE_IMPOSSIBLE`, `DECIDE_ADDITIONS`, `DEPTH_ON_TRACK`, `DRAFT_IT_AGAIN`, `EXAM_DAY_RANGE`, `LINE_DOMAIN_OUTSIDE`, `NAME_IT_FIRST`, `NAME_THE_EXAM`, `NOTHING_LEFT`, `NOTHING_TO_CHECK`, `NOTHING_TO_KEEP`, `ONLY_WEEKS_AWAY`, `PICK_A_DEPTH_FIRST`, `START_AGAIN_AT_DEPTH`, `TOO_MANY_DOMAINS` and `UNGROUNDED_NAME`;
  - **`ROADMAP_MONITOR_QUERIES`**: gemini-items, gemini-titles, tasks-from-model-rows, from-suggestion-domains, constrained-picks-started, legacy-gemini-rows, v3-runs-integrity, report-path-hygiene, field-roadmaps-depth, started-on-legacy, depth-rows-stage-rank, held-rows, proficiency-v2-range and review-level-tag.
- actions/roadmap: `snoozeAimPrompt`, `setAimSuggestions`, `snoozeAimStep`, `lowerDepth`, `confirmDomainAdditions`, `confirmSessionPicks`, `moveLine` and `setLineDomain`. `dismissAimPrompt` is now "Not now".

**R6:**
- roadmap-quests:
  - `QuestReach` and `questReachOf(snapshot, m, loadout?)`;
  - `ReviewRowLike` and `isRetryEntry` (to be replaced, §15.1);
  - `questPartsLineOf(row, variant)` and `shareOutByPace`;
  - `WeekQuestInputExtras`, `WeekQuestRowV2` and `WeekQuestsViewV2`.
- roadmap-quests-server: `QuestReviewRow`, `WeekQuestInputR6` and `isLegacyFacts`.

**R5:**
- New files:
  - `AimLine.tsx`: `AimLine`, `AimLineProps` and `aimLineNotNowLabel`;
  - `GapPanel.tsx`: `GapPanel`, `gapPanelShown` and `LiveGates`;
  - `CatalogSheet.tsx`: `CatalogTypeSheet` and `catalogChoicesOf`;
  - `DateBlock.tsx`: `DateBlock`, `DateVerdictChip`, `LowerDepthSheet`, `StageDateRow` and `lowerDepthsOf`;
  - `roadmap-autosave.ts`: `INTAKE_STORAGE_KEY`, `readStoredIntake`, `writeStoredIntake`, `readUnsentAim` and `writeUnsentAim`. The ASK card and the form share one autosave.
- roadmap-ui-model: `CATALOG_PROVENANCE_NOTES`, `actionWordOf`, `additionsDatesOf`, `catalogByOf`, `catalogSlotOf`, `isHeldMilestone`, `isKeysOnlyDraft`, `isPendingAddition`, `partsLineOf`, `proficiencyBasisLabelOf`, `proficiencyBasisOf` and `rowHealthOf`.
- roadmap-copy: about 120 new strings and line builders:
  - the AIM_CALL_* family, `KIND_NAME` and `KIND_HOW`;
  - the depth, coverage, date and exam lines;
  - `integrityLine`, `lastAimLine`, `recallCountLine`, `restsOnAddedLine` and `sessionPicksLine`;
  - the LEGACY_* banners, `OUTLINE_EMPTY_LINE` and `RUN_REJECTED_LINE`.

**T, Y, C:**
- **T and Y**: tour-steps `YOU_COPY`; SettingsView `AIM_SUGGESTIONS_COPY`, `AimSuggestionsRow` and `SetAimSuggestions`; aim-fixtures `AimFixtureEmpty`, `PACK_DEPTH_RANK`, `PACK_ROWS` and `UNSENT_AIM`.
- **C**: actions/capture `CaptureAim`; new `src/components/capture/aim-capture.ts`, which holds:
  - `AIM_FORM_HREF`, `AIM_ROADMAP_HREF` and `OPEN_ROADMAP_STATUSES`;
  - `captureAimOf`, `captureAimOnError`, `readCaptureAim` and `isCaptureAim`;
  - `AimCapture`, `aimPrefixSpan` and `aimCaptureOf`;
  - `AimAction`, `aimActionOf`, `AIM_OPEN_FORM`, `AIM_OPEN_DRAFT` and `AIM_OPEN_ROADMAP`;
  - `AIM_CHIP`, `AIM_CHIP_SET`, `aimChipLabel` and `aimCounterOf`;
  - `aimHandoffOf`, `AIM_LONG_GOAL_NOTE`, `MAKE_IT_AN_AIM`, `isLongGoalLine`, `offersAim`, `AimRewrite` and `aimRewriteOf`.

**R7:**
- scripts/fixtures/roadmap-hostile:
  - `seam.ts`: `BarSeam`, `HostileViews`, `SeamState` and the result types;
  - `taint.ts`: `taintHits`, `vocabularyOf`, `literalsOf`, `tokensOf` and the schema readers;
  - `bar.ts`: `closureOf`, `structuralExceptions`, `quarantineExceptions`, `gapPanel`, `schemaDiff`, the pin and `digestOf`;
  - `generate.ts`, `grammar.ts`, `reference.ts` and `reference-validator.ts`.
- **What R7 asked R4 for:** `hostileViewsOf({run, parsed, validated, integrity, intake, areaName, domains, today}) → {views, logLines}`. It exists, but it ignores `parsed` and trusts the bar's `validated`; §15.12 replaces that.

### 15.15 Handoffs, by lane (exact)

**R1** (roadmap-measures, roadmap-readings, roadmap-proficiency):
- Replace your isRetryEntry and retryReadDaysOf bodies with `export { isRetryEntry, retryReadDaysOf, type ReviewLedgerRow } from "./roadmap-types"`. Your goldens hold unchanged.
- roadmap-readings.ts:717 and 1301: `orderBy: acceptanceOrderBy()`. Add a measures-check case: two acceptances of one version, and the later acceptedAt's endState is read.
- Plan history: a record with `isDepthLoweringRecord` reads as a lowered depth.
- `isProductionKind` (readings ~881) becomes `practiceRoleOf(item) === "PRODUCTION"`.
- assignRankIndices passes the plan's depth: `rankIndexForStage(r.stage, r.gateLevel ?? null, depth)`. Add a golden: a library holding Fluent never shows Virtuoso before Mastered is reached.
- Delete your `ProficiencyToward` and import roadmap-types'.

**R2** (roadmap-realism, throughput):
- Delete the local practiceRoleOf and import roadmap-catalog's.
- motivationTimelineOf passes the depth to rankIndexForStage.
- Re-pin for WRITE_MARGIN 1.3:
  - new_d is 24 and 3;
  - the worked examples are §15.2's table;
  - the learner's timeline, REALISTIC days and StartSnapshot (`writeNeedOf(25, 0) = 33`);
  - the "from a Monday… day 41" and STRONG-library fixtures, whose writing changed.
- **The split:** when the final due is held later than L11's stage day by the hours bound (actuarial-probability: Mastered 503, BETWEEN 307, a 196-day stretch), place BETWEEN no earlier than the final due − MILESTONE_MAX_DAYS, still Sunday-snapped and ≥ MILESTONE_MIN_DAYS after the gate below. Then turn realism-check:1409's PENDING into an assertion.
- Coverage: coverageOf takes the counts R4 passes, which are now frozen (§15.3). Nothing else changes.

**R3** (roadmap-validate):
- Session picks: `if (isSessionPickKind(entry.key)) picks.push(entry.key)`, which brings in FULL_ATTEMPT and PERFORMANCE_CHECK. Add a model-check golden on lose-8kg with "pregnant".
- Lens 1's H3, K and M5 findings are yours: CONSTRAINT_CONFLICT on negatedTermsOf and negated spans out of grounding; "while" ends a cue's scope only after the cue takes a term; strip `\p{Cf}` before collapsing whitespace.
- The rev-3 carry-overs: the enumerator first-token residual, and a strict `isReusableRun` pin at model-check:1346.

**R4** (roadmap-server, roadmap-economy, actions/roadmap):
- Implement `hideAimPromptCore`, `hideAimPrompt`, `keepCalibratedDatesCore` and `keepCalibratedDates` (§15.10), each with a server-check case.
- **Coverage:** coverageFor reads `frozenCoverageCountsOf(today's counts, prior)`, where `prior` is `feasibilityOfAcceptance(currentAcceptance(b))?.coverage`, or the draft feasibility's on a first accept. Also:
  - carry `coverage` on the draft feasibility;
  - in depthRecordsOf, keep a coverage choice only when the typed figure changed;
  - add server-check cases: archive 20 cards → re-plan → accept leaves n_d unchanged; write 18 → n_d unchanged and no coverage choice.
- **planContext:** for cards at exactly L* in R, read their REVIEW rows over `retryReadDaysOf(L*, m)` and set `CardState.retryEntry = isRetryEntry(rows, L*)`.
- **Start:** remove the two `e.defer(() => e.applySizing(t.id))` calls at ~6241 and ~6255 (plan-born templates). Add a server-check golden, and the monitor of §15.6 in ROADMAP_MONITOR_QUERIES.
- **Production practice:** productionFromFluentOf uses `practiceRoleOf(i) === "PRODUCTION"`.
- **Session picks:** pendingPick becomes `isSessionPickKind(i.catalogKey) && i.decision === "PENDING" && i.notes.includes("GEMINI_PICK")`, for any kind. confirmSessionPicksCore's EASY removes a picked FULL_ATTEMPT or PERFORMANCE_CHECK.
- **Ranks:** rankIndicesOf passes the plan's depth to rankIndexForStage.
- **gapsNotShownOf:** draftViewOf uses it.
- **View fields:**
  - `IntakeFieldOption.domains[].nonRecall` in loadIntakeView;
  - `CurrentMilestoneView.startFeasibility` and `startedDay` from the StartSnapshot;
  - `RoadmapHeader.domainIds`;
  - `LegacyView.domainIds` and `areaFieldId`;
  - `NewItem.catalogKey?: CatalogKey | null`.
- **draftFromReply** (§15.12): runDraftCore, reuseRun and hostileViewsOf call it. hostileViewsOf also builds RoadmapView, the AimCardView and the week-quests view, or R7 renames the item.
- **Lens 1:**
  - TEXT_FIELDS gains "proposedName" and "rawLabel". assertNoModelText throws on a rev-4 GEMINI item with a non-null proposedName or rawLabel.
  - The review-level-tag monitor excludes backfill rows: `AND (e."dedupeKey" IS NULL OR e."dedupeKey" NOT LIKE 'bf:%')`. srs.ts tags every live REVIEW variant.
- **Lens 2:**
  - editItemCore refuses `{target, minLevel}` on a depth plan's stage ("On a plan aimed at a depth, counts come from coverage: change coverage or choose a lower depth.");
  - addItemCore refuses kind DOMAIN on a depth plan;
  - pin both.
- **Lens 3:** saveIntakeCore's `replaces` refuses only when `!legacyOf(ob)` (drop the `fieldId == null` test). Add a server-check case: a legacy track ACTIVE plan replaced.
- **The rev-3 carry-overs:**
  - milestone numbering after Drop → Start again → Re-plan (`newOrd`);
  - the opposite-state planning read;
  - carried topics in "Not in this plan yet".

**R5** (src/components/roadmap/**):
- Read the §15.11 fields directly and delete the casts: RoadmapForm `nonRecall`, StartSheet `restsOnAdded`, RoadmapView `startSnapshotOf`, roadmap-ui-model `partsLineOf` and `rowHealthOf`, CatalogSheet `ItemEdit`.
- integrityLine counts `gapsNotShownOf(integrity)`; pin it in ui-check.
- AimCard: HIDDEN renders like OFF, keeping only a non-suggesting last-aim line. The LATER line's × calls `hideAimPrompt()` and keeps its label. Lift the snooze error to EmptyCard.
- RoadmapView: [Keep the dates] calls `keepCalibratedDates(roadmapId)`; delete `KEPT_DATES_KEY`.
- Both "Start again at a depth" handoffs pass `domainIds` (header or legacy). A legacy DONE or ARCHIVED card offers "Set your next aim" with no `replaces`, and shows `LEGACY_GEMINI_HIDDEN` when `geminiHidden`.
- Lens 3's other UI findings are yours:
  - last-aim line flex/ellipsis;
  - seed hidden while the box has text;
  - `.rm-chips .chip.btn-chip{min-height:40px}`;
  - the date input empty in REALISTIC;
  - handoffUsed;
  - HowMeasuredSheet's Gemini words gated;
  - OUTLINE_EMPTY_LINE's Gemini sentence gated;
  - `#syllabus` opens the outline;
  - Undo toast error;
  - OFF with a last aim.
- RunFacts: "Drafted by" is keyed on the cause.
- The rev-3 carry-overs: ChecksPanel FITTED, DraftFooter impossibleMs, the Reference's keys, an empty Gemini title kept, the RunFacts writer.

**R6** (roadmap-quests, roadmap-quests-server):
- Delete your isRetryEntry and import roadmap-types'. Map `at` as it is: ReviewLedgerRow takes `at`.
- Re-pin quests-check for WRITE_MARGIN 1.3:
  - the ADD fixtures;
  - "1.1 × 18 = 20" becomes "1.3 × 18 = 24";
  - "1.1 × 25" becomes "1.3 × 25 = 33";
  - pace, caps and the QUESTS_BEHIND line.
- The ADD basis reads `${pct(WRITE_MARGIN − 1)}% spare`, never "10%".
- Your R1-divergent clean-entry goldens flip: tagged rows 3 days apart now read as a retry. Add the shielded and later-strike cases.

**R7** (roadmap-hostile-check and its fixtures):
- The seam calls `draftFromReply`.
- V is built from every view-writing module's literals (roadmap-realism, -server, -pace, -proficiency, -quests, -invite, -economy, roadmap-ui-model) plus only the renderable roadmap-validate reasons (KEYS_ONLY_REASONS, DROP_REASON, FLAG_REASON, REPORT_EXTRA_SEGMENT), never RULE_EXAMPLES or messages. Add a non-vacuity item for "Genki textbook".
- Views only when `T.size > 0 || REJECTED`, plus every 50th reply per family (BUDGET).
- View hits are counted apart (H1 views).
- The gap exemption covers only `views[0].gaps[*]` and RoadmapView.gaps, and quarantine runs over the views.
- R7 owns the H6 required list, which covers every cue.*, resource.* and flag.* rule a gap string can reach. Add a gated E sub-class of one-source claims. *(The finishing round adds constraint.*: 62 rules, §18.2. The hardening round's parser item makes it 91.)*
- Re-bless pin.json after R3's fixes.

**T:** nothing new. todayAimLineOf already quiets HIDDEN.

**Y:**
- you-check:1930 accepts `/Set your next aim/` for `empty-later-last-aim`.
- Settings needs nothing new: `!== "OFF"` reads HIDDEN as on.
- The carry-overs:
  - LibrarySearch.tsx's LEVEL_FILTER_MAX at 422, 458, 459, 596, 612, 615 and 618;
  - YouTabs' scroll cue, then delete shell-check's 2 pending keys;
  - DangerZone's roadmap counts.

**C:** nothing new from lane 0.

**Lead:**
- **library-model.ts:397.** Change it to `if (d.startsWith("strike") || d.startsWith("degraded") || d.startsWith("shielded")) return "miss";`, then delete roadmap-contract-check's KNOWN_EXACT_READERS entry. The tagged-string goldens are now pinned in roadmap-contract-check (review-facts strict, library-model PENDING). **Do not ship srs.ts without it.** *(Done in the finishing round, §18.1.)*
- **life-sizing.ts applySizing.** Return early for `isRoadmapCaptureKey(template.captureKey)`, with no model call, writing the code basis. *(Done in the finishing round, §18.1.)*
- **Spec lines.** Write the §15.2 changes into roadmap-rev4.md: Constants, the F-R4-9 golden, and F-R4-14's example. *(Done after fix round 2, with the items below: roadmap-rev4.md "As shipped".)* Also record:
  - §15.4's deviation from decision 40;
  - §15.10's HIDDEN state and F-R4-1's LATER × wording;
  - the OUTLINE_EMPTY_LINE vs "no Gemini sentence" conflict (R5 gates it).
- **Also open:**
  - set `AIM_INVITE_SINCE` to the deploy day (done in fix round 2: Tue 6 Oct 2026, §16.5; move it on a later deploy);
  - the Goal ▾ "New aim" option (capture-ui.ts, InsertRow.tsx) *(done in the finishing round)*;
  - ui-audit's 410 px and 72 px gates *(in code since the finishing round; not yet measured in a browser, §18.3)*;
  - PART pay: R2's timeline counts PART as paying ⬡6 while R4 copies no practices to it, so one of them is wrong.
  - ADD during a PART stage asks only toward the PART count (R6), while R2's writing plan keeps writing at r_plan. Consider pacing ADD from the StartSnapshot's needRateByDomain.
- **At integration,** run `npm run roadmap-contract:strict`, then make life:check run it with `--strict`, and update life-day-check's exact list to match. *(roadmap-contract:strict passes since the finishing round; the hardening round made the switch, §18.3 row 6. §19's PENDING lines fail it again until they land.)*

### 15.16 Deviations and open points for the lead

1. **WRITE_MARGIN 1.3** is a constant change lane 0 made on the realism reviewer's numbers (§15.2), because question 9's wording and F-R4-10's bound were both false at 1.1. If you keep 1.1, revert the one constant and the contract-check pins. The spec's copy (11–15 months) and the 192-day bound must then change, and actuarial's stretch stays a split problem either way.
2. **A PART at the depth gives the gate below's rank** (§15.4), not its stage's (decision 40's literal text).
3. **HIDDEN** (§15.10) is a fourth AimPrompt state. F-R4-1 says the LATER × "calls snoozeAimPrompt() again", which kept showing the line; lens 3's option (a) is implemented. If you prefer option (b), relabel the × and drop HIDDEN; no lane but R4 and R5 needs to change.
4. **Clean entry follows R1, and so the DP** (§15.1). The spec's literal rule (strike then advanced within 2 days) reads about 0.5% higher at the L12 tail (lens 2's Monte Carlo).
5. **R6's goldens change meaning** where R6's rule differed: tagged rows days apart, shields, and a later strike.

## 16. Revision 4 fix round 2 (lane 0, first and alone)

The re-review of the revision-4 fix round found the gates almost all green. It left a short list:
- one blocker and one major, both the lead's: library-model's exact reader, and life-sizing's Resize channel;
- R2's frozen counts, never passed by R4;
- Plan history guessing "depth lowered" from a repeated version;
- the Aim card's legacy facts, missing from the contract;
- a clean-entry window too narrow at its start edge;
- a placeholder deploy day;
- this document, behind the lanes.

Lane 0 ran first and alone again, and put what the contract needs into lane-0 files. Everything added is new or optional; nothing is renamed or removed.

### 16.0 State of the tree after lane 0

**What lane 0 added** (all new or optional):
- roadmap-types: `retryReadDaysOf` widened (§16.1) with the new `JITTER_HIGH`; `PlanHistoryRow.depthLowered?` (§16.2); `AimCardView.legacyView?` (§16.3); `AssignRankIndices` gains R1's optional `depth` (§16.9, R4).
- roadmap-invite: `AIM_INVITE_SINCE` is the deploy day (§16.5).
- roadmap-contract-check: the window's worst-case pins, the new fields, and 10 PENDING pins on other lanes' adoption (§16.8); its integration pin accepts `--strict` (§16.6).
- roadmap-invite-check: the deploy day and its four asks.

- `npx tsc --noEmit -p .` exits 0. eslint is clean on every file lane 0 touched: roadmap-types.ts, roadmap-invite.ts, roadmap-contract-check.ts and roadmap-invite-check.ts.
- **roadmap-contract-check** passes **366 strict checks** (359 before), with **12 PENDING** lines (2 before, both the lead's). §16.8 lists them.
- **roadmap-invite-check** passes **57** (54 before).
- **life:check:** every script passes except two, and both fail only on the re-pin §16.1 asks for:
  - roadmap-measures-check (R1), 2 failures;
  - roadmap-quests-check (R6), 1 failure.

  Each failure is the window going from 173 to 184 days. roadmap-server-check reads the window through `retryReadDaysOf` and stays green.
- **ui:check** passes unchanged. package.json is unchanged (§16.6).

### 16.1 The clean-entry window holds srs.ts's worst case (lens 2 minor; R6 → lane 0)

`retryReadDaysOf(level, m?, graceExtra?)` was interval(L, m) + graceDays(L) + RETRY_ENTRY_DAYS + graceExtra: 173 days at level 12. That window could miss the rows the rule needs:
- The miss before the entering pass can lie graceDays(L − 1) + 1 + graceExtra days before the pass, and further back when the miss is a degrade. The window allowed only RETRY_ENTRY_DAYS (2).
- At levels 5–8, the ±25% jitter can push the entering pass itself out of the window.

With no row before the pass, `isRetryEntry` returns false. A retry entry then read as clean, which inflated the `rc` counts that Proficiency, the rank and RAISE parts read. R1, R4 and R6 share the window.

**The new window** reads three facts from srs.ts:
- a strike moves only the due day and keeps graceEndsAt;
- a pass and a degrade set graceEndsAt from the new due day;
- the daily cron degrades a card past graceEndsAt.

It adds two spans:
- **Since the entering pass:** the interval at L, plus graceDays(L) + graceExtra, plus 1 for the cron's lag. At levels 5–8 the interval is the jitter's top, `ceil(BASE × JITTER_HIGH × m)`, with the new export `JITTER_HIGH` = 1.25.
- **The miss before the pass:** max(RETRY_ENTRY_DAYS, graceDays(L − 1) + graceExtra + 2). A degrade from L is due the next day, then has the lower level's grace and the cron's lag. A strike at L − 1 sits closer.

Two instants less than N days apart lie at most N life days apart, so the sum bounds the window in life days. A wider window reads more rows and never changes the answer.

| Level | m 1 | m 1.5 | m 1, grace +2 | Before (m 1 / m 1.5 / +2) |
|---|---|---|---|---|
| 4 | 15 | 19 | 19 | 12 / 16 / 14 |
| 6 | 35 | 46 | 39 | 25 / 34 / 27 |
| 8 | 61 | 84 | 65 | 45 / 63 / 47 |
| 10 | 95 | 133 | 99 | 86 / 124 / 88 |
| 12 | **184** | **264** | 188 | 173 / 253 / 175 |

`retryReadDaysOf(12, 1.5, 2)` is 268 (255 before).

**Pinned** in roadmap-contract-check:
- the goldens above;
- srs.ts's latest retry entry, built from xp.ts's and srs.ts's rules at L 12, 10, 8 and 6, at m 1 and 1.5, and with a grace extension of 0 and 2. Read over the window it is a retry entry; one day narrower, it reads as clean. A strike at L − 1 sits inside the window;
- the old 173-day window reads that L12 case as clean;
- the new window is never narrower than the old one, at any level from 2 to 20;
- srs.ts's three facts above (grep).

**Residual (stated, not fixed):** a DEGRADATION_WARD that shields a card past its grace keeps it at its level longer than any fixed window, so that card reads as clean.

### 16.2 Plan history: `PlanHistoryRow.depthLowered?` (lens 2 minor, lens 3 major)

R5's `isDepthLoweringRow` inferred "depth lowered" from any row that repeats the version before it. That misfires both ways:
- Undo drops the roadmap's version back by one, so accept → Undo → accept writes a second acceptance of the same version. History [v1, v2 undone, v2] then read "v2 depth lowered …", which is false.
- After an Undo, a real lowering read "accepted".

The fix, by owner:
- **The field (lane 0):** `depthLowered?: boolean` on PlanHistoryRow. Absent reads false.
- **R4** (historyOf): set `depthLowered: isDepthLoweringRecord(a)` from the acceptance itself. For such a row, set `changes = [depthChangeLineOf(endStateOf(prev), endStateOf(a)) ?? "lowered the depth"]`. This is R1's handoff, which was never applied.
- **R5** (PlanHistory): key the verb on `row.depthLowered === true`, and delete the repeated-version rule.

### 16.3 The Aim card's legacy facts: `AimCardView.legacyView?` (lens 3 minor #13, #17)

`AimCardView.legacy` stayed a boolean, which caused two problems:
- The Aim card could not show LEGACY_GEMINI_HIDDEN (F-R4-16).
- Its "Start again at a depth" handoff carried no `domainIds`. The new intake then preselected every Domain with cards in the Area, under a note saying the old Domains were carried over.

The fix, by owner:
- **The field (lane 0):** `legacyView?: LegacyView | null`, the same LegacyView that RoadmapView carries. `legacy` stays the boolean the card keys on.
- **R4:** fill it in aimCardOfData from `legacyViewOf(b)`.
- **R5**, in the legacy card:
  - render LEGACY_GEMINI_HIDDEN when `view.legacyView?.geminiHidden`;
  - pass `domainIds` and `areaFieldId` from it to restartHandoffOf;
  - until those arrive, word the 'restart' note "its aim and Area" when the handoff has no `domainIds`.

### 16.4 Plan-born tasks: the Resize channel (lens 1 major; decision 50)

There is no new export. The fix is in files the lead owns, so roadmap-contract-check pins each part as PENDING (lead).

R4 removed Start's sizing call, but a second channel stays open:
1. TaskDrawer's "Resize" button calls `tasks.resizeTask`; its `canResize` ignores captureKey.
2. resizeTask calls `applySizing(templateId, {force: true})`, which calls `sizeLifeTask`.
3. mergeSizing stores the model's free `rationale` as `gradeBasis`, and TaskDrawer shows it under "Why" for a plan-born task.

The channel is latent while ROADMAP_GOALS_LIVE is false, and live once Start is.

The fix has three parts, each pinned:
- life-sizing.applySizing returns before any model call for `isRoadmapCaptureKey(t.captureKey)`, writing code's basis (the existing PENDING);
- tasks.ts `resizableCore` refuses with "A plan-born task's size comes from its practice.";
- TaskDrawer's `canResize` is false for an 'rm:' row.

*(All three done in the finishing round, with code's basis from life-lexicon `planBornBasisOf` and the PENDING lines replaced by contract-check's planBornCases, §18.1.)*

### 16.5 `AIM_INVITE_SINCE` is the deploy day (lens 3 minor)

The constant held the migration's placeholder, Fri 6 Nov 2026. That is a future day, so Today's back-off would not have started until a month after the deploy.

- **Now: Tue 6 Oct 2026.** This is the first life day after the revision-4 fix rounds, and the earliest day the gated push can deploy. The next fresh-start day is Mon 12 Oct, so a deploy on any day up to Sun 11 Oct leaves all four asks for after it.
- **The pin** (roadmap-invite-check): with no action from that day, SET shows on Mon 12, 19 and 26 Oct and Sun 1 Nov, then only on Tue 1 Dec. The check computes this from the constant, and also pins it for this value.
- **LEAD:** on a later deploy, move the constant and the pin together. Any Monday or 1st between this day and the deploy would count as an ask nobody saw. A later value only delays the back-off.

### 16.6 The check chain

- **goals-close-check:**
  - It runs in life:check after character-check, and has its own `goals-close:check`.
  - life-day-check's exact list names it.
  - The rev-3 carry-over is closed, as §13 recorded.
- **life:check is unchanged.** It can run `--strict` only after every lane's PENDING has landed. *(Superseded: the hardening round switched it to `--strict`, §18.3 row 6.)*
- **The integration pin:** roadmap-contract-check now accepts `tsx scripts/roadmap-contract-check.ts --strict` in the life:check tail, so the flip needs no edit to this check.
- **At integration** (lead), once `npm run roadmap-contract:strict` exits 0:
  - package.json life:check runs `tsx scripts/roadmap-contract-check.ts --strict`;
  - scripts/life-day-check.ts:253–254's exact list must expect that string, or life-day-check fails. It builds `tsx scripts/<name>-check.ts` for each name.
  - *(roadmap-contract:strict reached 0 in the finishing round. In the hardening round's working tree at 11:40, life:check runs roadmap-contract-check and today-ui-check with `--strict`, and life-day-check's STRICT_LIFE_CHECKS pins both, §18.3.)*

### 16.7 Exports §14 and §15.14 never named (read from the code)

These are the names added since the rev-3 push (HEAD 79e81d3) that no line of this document named before this section. They come from both the revision-4 build round and its fix round, and every one is exported.

**R1** (roadmap-proficiency):
- `basisMatchesEndState(basis, endState)`: whether the basis still measures this end state. The writers carry a basis within a version only while this holds.
- `rebaseCauseOf(before, after)`: within one version, changed card terms read as REPLAN (a lowered depth or a coverage change), never as SWITCHED_OFF.
- `endStateTowardOf(endState)`.
- `depthChangeLineOf(before, after)`: "lowered the depth Mastered → Fluent", "raised the depth …", or null. R4's historyOf calls it (§16.2).

R1's fix round also changed these, with no new name:
- isRetryEntry and retryReadDaysOf are re-exported from roadmap-types;
- the readings at :728 and :1322 use acceptanceOrderBy;
- production-kept uses practiceRoleOf;
- the depth is passed to rankIndexForStage.

**R2** (roadmap-realism): no new name.
- `StageLadderOpts.counts?` and `dateEffectOf(intake, input, add, counts?)` take the frozen counts (§15.3), for a redraft and for a date effect. R4 does not pass them yet (§16.9).
- BETWEEN's placement is the private `betweenDueOf`: no stretch after it is longer than MILESTONE_MAX_DAYS + 6, so realism-check asserts at most 192 days on every fixture.
- practiceRoleOf is imported, and motivationTimelineOf passes the depth.

**R3** (roadmap-validate, roadmap-lexicon): no new name.
- H3 reads the union of constraint terms (CONSTRAINT_CONFLICT's clash sub-class).
- A scope break ends a cue only after the cue has taken a term (K).
- The private `stripInvisibles` removes `\p{Cf}` before whitespace is collapsed (M5).
- Session picks use isSessionPickKind.

**R4** (roadmap-server, actions/roadmap):
- `draftFromReply(step, parsed)` implements §15.12; runDraftCore, reuseRun and hostileViewsOf all call it. Its types:
  - `DraftReplyStep`: {e, ctx, pack, schema, gapSourceExclude, tripwire, roadmapId, version, now, ladder?, gapsOn?, memo?};
  - `DraftFromReplyOutcome`: DraftFromReplyResult plus `feasibility` and `tripwireReason`.
- `HostileViews`: {views, logLines, result}.
- Two refusals:
  - `DEPTH_COUNTS_FROM_COVERAGE`: editItemCore on a depth plan's stage counts;
  - `NO_CALIBRATED_OFFER`: keepCalibratedDatesCore when nothing has been measured since.
- `hideAimPromptCore`, `hideAimPrompt`, `keepCalibratedDatesCore` and `keepCalibratedDates` are implemented. keepCalibratedDatesCore rewrites the live acceptance in place; that needs a lead ruling (§16.10).
- ROADMAP_MONITOR_QUERIES gains `rm-templates-model-basis`.
- TEXT_FIELDS gains `proposedName` and `rawLabel`.
- These fields are now filled: CardState.retryEntry, IntakeFieldOption's nonRecall, RoadmapHeader.domainIds, LegacyView.domainIds and areaFieldId, and CurrentMilestoneView.startFeasibility and startedDay.

**R6** (roadmap-quests):
- `addSpareText(target)`: "1.3 × 25 → 33, a 30% spare because some cards lag", read from WRITE_MARGIN.
- isRetryEntry is imported from roadmap-types.

**R5** (src/components/roadmap/**, the roadmap fixtures):
- **AimCard:**
  - `emptyPromptOf`, `askPrimaryWord` and `seedShown`;
  - `EmptySurface` (ASK | LATER | KEPT | NONE) and `emptySurfaceOf`;
  - `doneLeadsWithRoadmap`;
  - `LegacyAimAction` and `legacyAimActionOf`;
  - `restartHandoffOf`.
- **Other components:**
  - AimHeader: `DepthLines`;
  - ChecksPanel: `knowledgeNotesOf`;
  - DraftReview: `ADDITIONS_DOM_ID`, `PICKS_DOM_ID`, `nextTargetOf`, `runRejectedOf` and `AdditionsCard`;
  - HowMeasuredSheet: `howMeasuredDescription(gemini)`;
  - ItemRow: `CatalogChip`;
  - MilestoneCard: `measureSegmentOf`;
  - PlanHistory: `isDepthLoweringRow`, to be retired (§16.2);
  - PlanRanks: `ladderStageWords`;
  - PracticeRow: `howLinesOf` and `HowLines`;
  - RoadmapForm: `outlineLinesOf`, `lineDomainsOf`, `chosenDomainsOf`, `nonRecallOf`, `domainChipCount`, `clearsCaptureLine`, `opensOutline` and `coveragePreviewOf`;
  - RoadmapView: `depthListLine` and `isLegacyView`;
  - RunFacts: `wroteStarter` and `redactedEntry`;
  - StartSheet: `restsOnAddedOf`;
  - TopicRow: `OutlineMoves`;
  - roadmap-ui-model: `geminiNamedOf(live, run)`;
  - fixtures.ts: `REV4_STATES`.
- **roadmap-copy, the aim call:**
  - strings: AIM_CALL_HEADING, _BODY, _RANK_LINE, _LABEL, _PLACEHOLDER, _CONTINUE_LINE, _PRIMARY and _PRIMARY_TEXT; AIM_NOT_NOW, AIM_DONT_SUGGEST, AIM_NOT_NOW_SET_LABEL, AIM_NOT_NOW_STEP_LABEL, AIM_OFF_TOAST, AIM_UNDO_FAILED, AIM_LATER_TAIL, AIM_NEXT_AIM, AIM_NEW_AIM, AIM_HISTORY_LINE and NONE_GEMINI_LINE;
  - builders: `seedLine`, `lastAimRankLine`, `lastAimDayLine`, `heldDepthLine`, `depthDateChip`, `aimLineCopy`, `handoffNote` and `openDraftNote`.
- **roadmap-copy, the intake:**
  - strings: AIM_LONG_HINT, VAGUE_AIM_LINE, WHEN_REALISTIC, EXAM_WAYPOINT_HINT, NEW_CARDS_REQUIRED_HINT, EXAM_QUESTION, EXAM_NAME_LABEL, EXAM_DATE_LABEL, OUTLINE_EXAM_LABEL, OUTLINE_LABEL, LINE_NO_DOMAIN, NAME_AREAS_LABEL, NAME_AREAS_HINT, COVERAGE_TITLE and SUGGEST_AREAS_LABEL;
  - builders: `depthHint`, `realisticHint`, `chosenDateHint`, `chipVerdict`, `paceShareHint`, `geminiArrangesLine`, `coverageRowLine` and `unassignedLinesLine`.
- **roadmap-copy, depth and dates:**
  - stage, depth and date words: `stageLevelName`, `depthName`, `depthStage`, `milestoneStageLine`, `stageWords`, `depthGapDays`, `dateFull`, `dayFull`, `monthYear` and `andList`;
  - the depth line: `depthLine`, `domainOriginLine`, `coverageChoiceLine`, COVERAGE_UNCHECKED_LINE, `depthChoiceLine`, `examWaypointLine`, `userDateWaypointLine`, NEVER_LOWERED_LINE, `coverageJudgeLine`, `paragonDepthLine`, `scheduleBoundLine` and `dateAppSetLine`;
  - the date check and lowering: DATE_VERDICT_WORD, `realisticDateWord`, `overKeptLine`, KEEP_MY_DATE, KEEP_OVER_SWITCH, LOWER_DEPTH_WORD, LOWER_DEPTH_TITLE, LOWER_DEPTH_NOTE and BY_YOUR_EXAM_MARK;
  - ranks and Proficiency: PARAGON_MISSING_WORD, `topRankDepthLine`, PRODUCTION_PARAGON_LINE, CLOSE_SHORT_PARAGON_LINE, `proficiencyFloorLine` and `heldRowLine`;
  - re-dating: REDATE_WORD, KEEP_DATES_WORD and REDATE_NOTE.
- **roadmap-copy, drafting:**
  - the run lines: GEMINI_V3_LEAD_LINE, ARRANGEMENT_LINE, RUN_REFUSED_LINE, STARTER_WROTE_NO_ANSWER, STARTER_WROTE_REJECTED, STARTER_WROTE_REFUSED, `starterWriterWords` and `catalogProvenanceWords`;
  - exclusions and session picks: `exclusionsLine`, `aimConflictLine`, SESSION_PICKS_KEEP and SESSION_PICKS_EASY;
  - additions: `additionsLine`, `additionEffectLine`, `additionBlockedLine`, `addAllWord`, CHOOSE_WORD, LEAVE_OUT_WORD and CONFIRM_WORD.
- **roadmap-copy, outline, legacy and gaps:**
  - outline: OUTLINE_EMPTY_GEMINI_TAIL, `outlineEmptyLine` (its Gemini sentence only with `gemini`), OUTLINE_EMPTY_EXAM_LINE and ADD_OUTLINE_WORD;
  - legacy: LEGACY_DRAFT_BANNER, LEGACY_ACTIVE_BANNER, LEGACY_MEASURE_LINE, DRAFT_IT_AGAIN_WORD and START_AGAIN_AT_DEPTH_WORD;
  - gaps: GAPS_EYEBROW, GAPS_TITLE, GAPS_LINE, GAP_CREATE_WORD, GAP_DISMISS_WORD, `gapsHiddenLine`, `gapSourceLine`, `gapSimilarLine` and `gapUngroundedConfirm`.

**R7** (scripts/fixtures/roadmap-hostile):
- **bar.ts:** `draftGapRows`, `viewGapPanel`, `viewQuarantineExceptions`, `geminiRowAt`, `kindOrderOf`, `emptyStage`, `isAllowedText`, `norm`, `sha`, `short`, `readPacks`, `Pin` and `Closure`.
- **seam.ts:**
  - `DEFAULT_VIEW_NAMES`;
  - `H6_REQUIRED_PREFIXES`, `H6_GAP_UNREACHABLE` and `h6RequiredOf` (R7 owns the H6 required list of 60 rules; 62 since the finishing round added the `constraint.` prefix, §18.1);
  - `RuleOptions`, `LabelResult`, `ShapeResult`, `GroundResult` and `SeamStatus`.
- **taint.ts:**
  - `V_SOURCE_FILES` (15 view-writing modules), `HOSTILE_CANON` (16 words) and `appVocabularyOf`;
  - `taintOf`, `TaintHit`, `FoundString`, `scanStrings` and `stringsOf`;
  - `schemaWordsOf`, `keysOf`, `schemaKeysOf` and `schemaEnumsOf`.
- **generate.ts** (the corpus):
  - `mulberry32`, `HOSTILE_SEEDS` and `FAMILY_TARGETS`;
  - `HostileDomain`, `LibraryEntry`, `CorpusPack`, `ProbeFixture`, `GroundKind`, `ListedDomain` and `HostileRun`;
  - `specSchemaOf`, `runsOf` and `deriveConstraintRun`;
  - `Verdict`, `ReplyFamily`, `ReplyCase`, `GapCase`, `RecombinedCase`, `ConstraintCase`, `OverExclusionCase`, `MetaRel`, `MetaCase` and `HostileCorpus`;
  - `authorStrings`, `contentWords`, `controlOf` and `generateCorpus`.
- **grammar.ts:** the word and frame lists (SYLLABLES … SMUGGLE_PROPERTIES) and `digitsIn`.
- **reference.ts:** `RefVerdict`, `RefCode`, `RefViolation`, `referenceViolations`, `referenceVerdictOf` and `referenceVerdict`.
- **reference-validator.ts:** `refIntegrity`, `refShape`, `refGround`, `refNegatedTerms`, `refExclusions` and `refValidate`.

**T** (src/app/dev/style/today/fixtures.ts): `PART_DOMAIN_NAMES`, `AIM_MON`, `AIM_FIRST`, `AIM_LADDERS`, `AimLineKind`, `AimLineFixture`, `AIM_LINE_FIXTURES`, `aimLineOfFixture` and `aimLineKindOf`.

**Y:**
- DangerZone: `roadmapResetLine(scope, counts)`, the 'life' reset's roadmap counts (the rev-3 carry-over);
- SettingsFixtures: `aimSuggestionsRecorder` and `AIM_SUGGESTION_FIXTURES`.

**C:** nothing beyond §15.14.

### 16.8 roadmap-contract-check: the PENDING lines (12)

Each line passes once its change lands. `--strict` turns every line still pending into a failure.

| Owner | Pending |
|---|---|
| R4 | historyOf sets `depthLowered` and words the row with `depthChangeLineOf`; ladderOf passes `StageLadderOpts.counts` (5 arguments, including `counts`); every `lanes.dateEffectOf` call passes the counts as its 4th argument; `AimCardView.legacyView` is filled; rankIndicesOf passes the depth to `lanes.assignRankIndices` |
| R5 | PlanHistory keys on `row.depthLowered`, never on a repeated version; the legacy Aim card reads `legacyView` (LEGACY_GEMINI_HIDDEN and the handoff's Domains) |
| lead | library-model `outcomeOf` uses startsWith (two lines: the reader golden and the grep); life-sizing `applySizing` refuses `isRoadmapCaptureKey`; tasks.ts `resizableCore` refuses it; TaskDrawer hides Resize for 'rm:' rows; ui-audit gates 410 px and 72 px |

*(All 12 passed by the end of the finishing round: `roadmap-contract-check --strict` gives 396 passed, 0 failed, no PENDING. The lead's five became hard checks (library-model's golden over 9 details and a strict grep; planBornCases; ui-audit's `--gate` cases), §18.1.)*

### 16.9 Handoffs, by lane (exact)

**R1:**
- roadmap-measures-check:1520: want `[184, 264]` for `[M.retryReadDaysOf(12, 1), M.retryReadDaysOf(12, 1.5)]`. Rename the check to "(interval 160 + grace 11 + 1) + (grace 10 + 2) = 172 + 12 (m 1.5: 252 + 12)".
- roadmap-measures-check:1581–1582: "over the last 173 days" and `addDays(today4, -173)` become 184. Better, read `RT.retryReadDaysOf(12, 1)`.
- Nothing else: your readings already read the window through retryReadDaysOf.

**R2:** nothing from lane 0. The WRITE_MARGIN ruling (§16.10) may re-pin your goldens.

**R3:**
- **Optional (lens 1 minor):** a contrast break ("but", "however", "now") should end a cue before it takes a term when the next clause holds a positive cue ("cleared", "recovered", "fine", "ok"). Add body-plan goldens such as "injured, but cleared to run". Otherwise the lead states it under question 11 as a known over-exclusion. *(Done in fix round 2 as `constraint.release`, scoped to its own clause in the finishing round, §17.1, §18.1.)*
- **The rev-3 carry-overs, if still open:** the validator enumerator's first-token residual, and the soft `isReusableRun` pin.

**R4:**
- **ladderOf** (roadmap-server ~3448): pass `{ counts: frozenCoverageCountsOf(<today's counts for required>, ctx.coveragePrior ?? null) }` as stageLadderOf's 5th argument.
- **dateEffectOf** at ~7898: pass the same counts as the 4th argument. In hostileViewsOf (~9555), the memo wrapper `dateEffectOf: (intake, input, add) =>` must take `counts`, pass it on, and key its memo on it.
- **Server-check cases:** run useRealisticDate or setLineDomainCore on an ACTIVE plan after archiving 20 cards, and again after writing 18. The final stage's measure target must equal the end-state target (48). replanCore REFIT alone doesn't reach this path.
- **historyOf** (~7731): set `depthLowered: isDepthLoweringRecord(a)`. For those rows, set `changes: [depthChangeLineOf(endStateOf(prev), endStateOf(a)) ?? "lowered the depth"]`.
- **aimCardOfData:** `legacyView: <legacy> ? legacyViewOf(b) : null`.
- **Lens 1 minor (latent):**
  - render CODE labels over R only, never over a pending NOT_CHOSEN Domain;
  - re-render them in confirmDomainAdditionsCore once a Domain is CHECKED or left out (transplantOnto keeps the old labels today);
  - add a server-check case for [Leave out].
- **Lens 2 gap 8 (R6 → R4):** a Start → loadWeekQuests round trip in roadmap-server-check.
- **R7 → R4:** a week-quests view in hostileViewsOf (or R7 renames the bar's item), and an optional `viewNames`.
- **R1 → R4 (cosmetic):** rankIndicesOf passes the depth to `e.lanes.assignRankIndices(rows, firstByLineage, depth)`. The contract type `AssignRankIndices` now names R1's optional third argument `depth?: number | null`, so the call compiles against the contract and not only against R1's own type. The re-rank after the call can then go.
- **The rev-3 carry-overs, if still open:**
  - milestone numbering after Drop → Start again → Re-plan;
  - the opposite-state planning read;
  - coverage of carried topics.

**R5:**
- **PlanHistory:** key "depth lowered" on `row.depthLowered === true`, and delete the repeated-version rule. Add roadmap-ui-check goldens for:
  - accept → Undo → accept, at both versions;
  - Undo → lower the depth.
- **The legacy Aim card:**
  - render `{view.legacyView?.geminiHidden && <p className="t-meta">{LEGACY_GEMINI_HIDDEN}</p>}`;
  - pass `domainIds: view.legacyView?.domainIds` and `areaFieldId: view.legacyView?.areaFieldId` to restartHandoffOf;
  - word the 'restart' note "its aim and Area" when the handoff has no `domainIds`.
- **AimCard:** on a failed hide or snooze, restore the previous mode (keep it in a ref), so the line comes back with its error under it, as AimLine does.
- **Today's SET ×:** after the lead's ruling (§16.10), call `hideAimPrompt()` or relabel it, and pin the result in roadmap-ui-check.
- **The rev-3 carry-overs, if still open:**
  - ChecksPanel's FITTED sentence arithmetic;
  - DraftFooter's impossibleMs;
  - the Reference's duplicate keys;
  - an empty Gemini title that can be kept;
  - the RunFacts writer.

**R6:** in roadmap-quests-check:2122–2124, "173 days at m 1 (interval 160 + grace 11 + 2)" becomes "184 days at m 1 (172 + 12)". Replace `addDays(wk1, -173)` and the bare `173` with `retryReadDaysOf(12, 1)`.

**R7:**
- **V's word lists (lens 1 minor):** in literalsOf, skip roadmap-types' word-list constants (at least `CREDENTIAL_WORDS`). Or subtract roadmap-lexicon's CLAIM_WORDS, RESOURCE_WORDS and SPEND_WORDS, and the credential list, from V. Extend HOSTILE_CANON with certified, accredited, diploma, official and course, and assert that none of them is in V.
- **A gated E sub-class** of claims grounded in one source text, as the clash sub-class does for constraints, so flag.CLAIM_WORDS, flag.PROPER_NOUN and flag.ABOUT_YOU carry weight in gated H3.
- This round's roadmap-types changes add no string literal to V: they are doc comments, one number constant (`JITTER_HIGH`) and two optional fields.

**T, Y, C:** nothing new from lane 0. C applies the Goal ▾ "New aim" edit if the lead hands it over (§16.10).

**Lead:**
- **library-model.ts:397 (blocker):** change it to `if (d.startsWith("strike") || d.startsWith("degraded") || d.startsWith("shielded")) return "miss";`. Then delete roadmap-contract-check's `KNOWN_EXACT_READERS` entry; by design, its "still exact" check fails once the file is fixed. **Do not ship srs.ts without this fix.** *(Done in the finishing round: outcomeOf reads through parseReviewDetail, which gives the same results as the startsWith line, and the entry is deleted, §18.1.)*
- **The Resize channel (§16.4):**
  - life-sizing.applySizing selects captureKey and returns "done" for `isRoadmapCaptureKey` before any model call, writing code's basis;
  - tasks.ts `resizableCore` refuses with "A plan-born task's size comes from its practice.";
  - TaskDrawer's `canResize` excludes 'rm:' rows.
  - *(Done in the finishing round, §18.1.)*
- **ui-audit:**
  - Gate `[data-aim-card="empty-ask-continue"]` and `[data-aim-card="empty-ask-seed-last-aim"]` at ≤ 410 px at 344. State whether 410 bounds `section.rm-ac-call` or the whole fixture box, which is about 427 px with the "Aim" header.
  - On /dev/style/today, gate every visible `[data-state^="aim-"] .rm-aim-line` at ≤ 72 px, with `.rm-aim-line-t`'s scrollHeight ≤ clientHeight + 1.
- **The Goal ▾ "New aim" option (F-R4-7)** touches three files. capture-server-check's PENDING then switches on.
  - capture-ui.ts: a type-only CaptureAim import, `aim?` in insertMenuOptions' ctx, and the option when aim is "NONE" and the line has no mode;
  - InsertRow.tsx: an `aim` prop;
  - QuickCapture.tsx ~1891: `aim={vocab?.aim}`.
  - *(Done in the finishing round, with `aim={editing ? undefined : vocab?.aim}` and capture-ui `lineHasPrefix`, §18.1.)*
- **roadmap-rev4.md**, record *(done after fix round 2: every item below is written in place, marked "(shipped)", and listed in the spec's "As shipped")*:
  - in Constants, WRITE_MARGIN after the ruling;
  - the F-R4-9 and F-R4-14 goldens, written with "→";
  - the PART-at-depth deviation (§15.4);
  - HIDDEN and the LATER × (F-R4-1), and the OFF/HIDDEN last-aim line (F-R4-2);
  - OUTLINE_EMPTY_LINE's split (F-R4-24);
  - F-R4-7's "clears only when the aim was used";
  - F-R4-11's [Keep the dates], recorded on the acceptance;
  - F-R4-10's split placement;
  - F-R4-22's sampling, with its clash and resource sub-classes;
  - the two-line last aim, RUN_REFUSED_LINE, the new fixture states and question 9's months;
  - the clean-entry window (§16.1) and AIM_INVITE_SINCE (§16.5).
- **PROGRESS.md and question 11:** state the one-source grounded-claim residual (25 of 41, 61%) before ROADMAP_GAPS_LIVE can flip. *(Question 11 states it; PROGRESS.md is still the lead's, §18.3.)*
- **Mockups** (lane M or the lead) *(redrawn after fix round 2; §17.3)*:
  - final-aim-card.html: the two-line last aim, the LATER × as 'hide:', and the HIDDEN and KEPT frames;
  - final-today-quests.html: `.rm-aim-slot[data-close-due]`;
  - final-roadmap-new.html: REALISTIC's date control, and a ruling on "none" vs "0 at level 6+".
- **Review** the re-blessed hostile pin.json (sha d8f59181…). *(Superseded: re-blessed again in fix round 2, 0dd9a8be…, in the finishing round, 9d542fd5…, in the hardening round, df51f44f…, in the confirm-to-unlock round, 6a7ed5cd…, and in the safety-gaps round, 25b08ff5…, the live pin, each append-only, §18.2 and §19.9.)*
- **Integration** (§16.6): get roadmap-contract:strict to 0, then switch life:check to `--strict` and update life-day-check's exact list.

### 16.10 Deviations and open points for the lead

1. **retryReadDaysOf is wider than the reviewer's formula:** 184 days at L12, where the reviewer's gives 182. It also counts the cron's lag after each grace, and treats a degrade from L (due the next day) as the miss before the pass. A wider window never changes an answer. The ward residual is stated, not fixed.
2. **AIM_INVITE_SINCE = Tue 6 Oct 2026** is lane 0's reading of "the deploy day": the earliest day the gated push can deploy. Move it on a later deploy (§16.5).
3. **Rulings still open** (lane 0 changed none of them):
   - **WRITE_MARGIN 1.3's side effect.** COVER_SHARE × WRITE_MARGIN = 1.04 > 1, so every Domain not already at the depth needs at least 2 new cards, and REALISTIC with no pace always refuses NO_PACE. The options:
     - (a) a margin ≤ 1/COVER_SHARE (1.25 at most);
     - (b) dating with no pace when the cards already held reach the depth;
     - (c) writeNeedOf 0 for a Domain that holds n_d clean.

     Any of them re-pins realism-check and quests-check. Either way, the spec's "about 11–15 months" becomes about 15–16 months at the priors (day 479).
   - **Today's SET ×:** call hideAimPrompt ('hide:'), or relabel it.
   - Whether OFF or HIDDEN also quiets capture's "Make it an aim".
   - The DRAFT button's target.
   - The Names rule's "(level 12)" on the Today START line.
   - PART pay, and ADD pacing during a PART.
   - keepCalibratedDatesCore updating the acceptance in place, which breaks roadmap.md:1094's "never updated".
   - depthRecordsOf when a line choice raises the policy.
4. **The KNOWN_EXACT_READERS entry stays** until library-model.ts is fixed. Deleting it first would fail the grep. *(Both done in the finishing round: library-model is fixed and the entry is deleted.)*

## 17. Revision 4 fix round 2: what the lanes shipped (read from the code)

§16 is lane 0's opening of fix round 2. This section records what every other lane exported or changed in that round, read from the code at its end, so that §14–§16 plus this section name every revision-4 export up to fix round 2 (§18 adds the finishing round's). Everything listed is new or optional, or a private helper named for the record; no export was renamed or removed. Five signatures changed (handoffNote, isDepthLoweringRow, planHistoryLine, taintHits and offersAim), and each is marked. docs/life-plan/roadmap-rev4.md, "As shipped", states the same behaviour in product terms, with the rulings still open.

### 17.1 Exports and changed signatures, by lane

**R1** (roadmap-readings, roadmap-proficiency):
- `ReachWindowMods {intervalMultiplier, graceExtraDays}`.
- `cleanReadDaysOf(level, m, live?)` = `retryReadDaysOf(level, max(the acceptance's m, live m), live grace)`.
  - A bad or missing figure reads as m 1 with no grace.
  - Goldens: 184 with no loadout; 188 with 2 grace days; 264 with live m 1.5 or an acceptance at 1.5; 268 with both.
  - It is the only caller of retryReadDaysOf in roadmap-readings. So R1's window is never narrower than R4's or R6's; a grid of 480 cases finds none.
- `ReadingsDeps.reachModifiers?`. loaderOf passes it. Without it, loaderOf uses skill-effects `loadModifiers` on the real client (a dynamic import, the reader R6 uses), and nothing on an injected client, so a check never reaches the database.
- `loadRoadmapContext(client, q, today, live?)`: the optional 4th argument is passed on to the counts.
- `loadCardCounts`' query gains `live?: () => Promise<ReachWindowMods | null>`. It is called only when a card sits at exactly an `rc` level. A rejection or a synchronous throw is logged and reads as none; it is never thrown.
- assignRankIndices' doc now says the contract's `AssignRankIndices` types the optional depth (§16.0), so R4 calls it through RoadmapLanes.

**R2** (roadmap-realism): no new export.
- **Private `spareOnlyOf(model)` and `DateCore.spareOnly`.** These implement option (b) of §16.10's WRITE_MARGIN ruling.
  - It holds when there is no pace, some Domain has new_d > 0, and every Domain has live_d ≥ n_d.
  - dateCoreOf then dates the plan on the cards held: rate 0, D_full = D_real, rateAsked null, and no 'pace' in dateOrigin.calibrating. The basis reads "With only the cards you hold, …" and names the spare it doesn't count.
  - A CHOSEN date before D_floor is IMPOSSIBLE ("even if every review passes and the new cards are written today"). A date from D_floor up to D_real is OVER.
  - stageLadderOf's NO_PACE guard and refitForStart's stage date follow the same rule.
  - If the cards held can't reach the depth within SPAN_MAX_DAYS, the old rule applies.
  - To reverse it, return false and restore realism-check's two re-pinned cases.
- **Private `DATE_MEMO`.** dateCoreOf is memoised (LRU, 64 entries).
  - The key is everything the core reads: the mode, userDate, examDay, L, the reach levels, the targets and the whole model input. Non-finite numbers are written apart from null, and keys over 400,000 characters are skipped.
  - It memoises only when `ctx.input === model.input`, and it stores and returns copies.
  - It took R4's bar views from about 24 s back to under 10 s.
- **`dateEffectOf(…)` returns `pastSpan: !notDated && (D_real == null || D_real > SPAN_MAX_DAYS)`.** A plan that isn't dated gives dateWith null and pastSpan false, so R4's PAST_SPAN block no longer fires falsely.
- **realism-check pins question 9.** A new learner on the priors reaches Mastered on stage day 479, with D_real 482 (about 15.8 months). Measured Steady stays 460 (D_real 461).

**R3** (roadmap-lexicon, roadmap-validate):
- **roadmap-lexicon** gains four lists. They are compiled into the Lexicon, so the bar can inject and ablate them:
  - `CONSTRAINT_RELEASE_WORDS`: cleared, recovered, healed, fine, ok, okay, resolved, gone. They are matched as written, never by stem;
  - `CONSTRAINT_RELEASE_STARTS`: but, however, although, though, now;
  - `CONSTRAINT_RELEASE_BLOCKERS`;
  - `CONSTRAINT_STATE_CUES`: injury, injured, pain, doctor says.
- **roadmap-validate** gains the rule name `"constraint.release"`. It is in `RULE_NAMES` and not in `H6_RULE_NAMES`, so H6's required list was unchanged in fix round 2. *(The finishing round added `"constraint."` to R7's H6_REQUIRED_PREFIXES, so H6 now requires constraint.label and constraint.release to fire, §18.1.)* constraintTokens also records `afterPause`.
- **negatedTermsOf's semantics:**
  - A clause runs to the next pause, scope break or cue. It releases when a release word stands as a state before any blocker.
  - A release can happen after a pause, after a contrast word or "now", and in a state cue's own clause.
  - Terms a cue took before the release stand, and a release word is never a term.
  - "now" opens a clause but ends no scope.
  - One reading feeds constraintExclusionsOf, aimConflictOf and CONSTRAINT_CONFLICT.
  - **Open at the end of fix round 2 (landed in the finishing round):** the release ended the cue for the rest of the sentence; it now ends it only for its own clause (§17.3).
- model-check widens the enumerator-residual golden to every kind the reviewer probed. The isReusableRun pin was already strict.

**R4** (roadmap-server; roadmap-economy and actions/roadmap.ts are unchanged):
- **`HOSTILE_VIEW_NAMES`** and `HostileViews.viewNames`. The 7 names are "DraftView", "RunView (RunFacts' props)", "the Today-bound rows", "the AimStep", "RoadmapView", "AimCardView" and "the week-quests view of the first milestone, started".
  - `views[6]` is built from R2's refitForStart and startSnapshotOf, and R6's weekQuestsFor and weekQuestsViewOf (the roadmap variant).
  - It is cached per distinct plan. On an error it is null, with one log line.
- **Private `withPendingHidden(plan, step)`.** R2's naming steps run with each PENDING addition masked as REMOVED, then restored in place; carried rows are untouched. The naming steps are withStagePractices (in planFromReply and every redraftOf) and rewrite()'s re-fit.
- **Private `nameableDomainsOf`.** The tripwire's codeFillCandidates accepts a row's nameable Domains, so a row holding a subset of R plus a pending addition is never wrongly refused.
- **Private `todayCountsOf` and `frozenCountsOf`.** They give one reading of the frozen counts (frozenCoverageCountsOf over ctx.coveragePrior), used by:
  - coverageFor;
  - ladderOf, through `StageLadderOpts.counts`, stageLadderOf's 5th argument;
  - additionsOf, which calls dateEffectOf with the intake's Domains = R, R's frozen counts as the 4th argument, and each added Domain as a scope of its own. Before, an addition's own cards read 0.
  - The bar's memo wrapper takes the counts and keys on (add, intake.domainIds, counts).
  - A DRAFT's redraft still reads today's counts, because there is no prior yet. Whether it should freeze to the draft rows' coverage is a ruling.
- **historyOf** sets `depthLowered: isDepthLoweringRecord(a)`. For such a row, `changes` is `[depthChangeLineOf(endStateOf(prev), endStateOf(a)) ?? "lowered the depth"]`.
- **aimCardOfData** sets `legacyView: legacyViewOf(b)` on a legacy plan's card only.
- **rankIndicesOf** passes the depth to `lanes.assignRankIndices(rows, firstByLineage, depth)`. The re-rank after it stays as a guard, because roadmap-contract-check pins a 3-argument rankIndexForStage call in roadmap-server.ts.
- **server-check** gains:
  - a Start → loadWeekQuests round trip over R6's real QuestStore;
  - the frozen-counts cases (archive 20, write 18: the final stage asks for 48);
  - a REALISTIC intake with no pace, refused at intake.

**R5** (src/components/roadmap/**, the roadmap fixtures):
- **AimCard.tsx:**
  - `collapseWrite(call, back, {mode, error})` clears the error and runs the write. A refusal restores `back` with res.error; a throw restores `back` with NETWORK_RETRY;
  - `NETWORK_RETRY`;
  - `legacyRestartHandoffOf(view)`: restartHandoffOf with `legacyView.domainIds` and `.areaFieldId`. It returns null without an aim or a roadmapId;
  - LegacyCard renders LEGACY_GEMINI_HIDDEN on its own line when `legacyView.geminiHidden`, for ACTIVE, DRAFT and DONE.
- **RoadmapForm.tsx:** `handoffCarriedOf(h, fields)`. The Area counts only when its Field is in the intake, or a track Area came with its track. The Domains count only when the handoff carried them.
- **roadmap-copy.ts, changed signature:** `handoffNote(source, aim, carried?: {area, domains})`. The note reads "its aim, Area and Domains are", "its aim and Area are" or "its aim is" carried over. A 2-argument call never says "Domains".
- **PlanHistory.tsx, changed signatures:**
  - `isDepthLoweringRow(row)` reads only `row.depthLowered === true`;
  - `planHistoryLine(row, today)` no longer takes `prev`;
  - a lowered row's leading "lowered the depth" is stripped: "v1 depth lowered 5 Jan: Mastered → Fluent".
- **AimLine.tsx:** the SET × calls `a.hideAimPrompt()`, and the file has no snoozeAimPrompt.
- **Fixtures and checks:** the legacy and legacy-draft fixtures' Aim cards carry legacyView. ui-check adds a pin that bulkKeepRowsOf never counts an empty Gemini title.

**R6** (roadmap-quests, roadmap-quests-server): no new export.
- weekQuestInputFor's doc names the §16.1 window.
- quests-check reads the window only through retryReadDaysOf, and builds srs.ts's latest retry entry at levels 12, 10, 8 and 6 under three loadouts.
- quests-check adds R6's half of the Start round trip.
- It prints `PENDING (R4)` while finishStartCore counts without the key's segment (§17.3). *(Gone since the hardening round: a hard source check replaces it, §18.3 row 1.)*

**R7** (scripts/fixtures/roadmap-hostile, roadmap-hostile-check, roadmap-hostile-ablate):
- **taint.ts:**
  - new: `WORD_LIST_NAME`, `wordListsOf`, `literalsOf(source, {skipWordLists?})`, `OwnCopy {guarded, phrases, whole, keys}`, `wordsOf`, `decodeEscapes`, `ownCopyOf`, `ownOccurrence`, `AppVocabulary` and `appVocabularyOf(readSource, reasons, guarded?)`;
  - **changed signature:** `taintHits` gains a 6th argument, `own?`;
  - `HOSTILE_CANON` grows from 16 to 21 words: certified, accredited, diploma, official and course are added;
  - V drops 40 word lists and the 90 guarded words;
  - a guarded word counts as the app's own only inside a run of 2 or more words of an app literal, as a whole literal, or as an exact CONSTANT_CASE value.
- **grammar.ts:** `OneSourceFlag`, `ONE_SOURCE_LINES`, `ONE_SOURCE_NAME_FORMS` and `ACRONYM_LETTERS`.
- **generate.ts:** `GapCase.flag?`, `deriveOutlineRun`, `Builder.familyOneSource` and `counts.E_oneSource` (246 strings: one-source 141, one-source-name 105). The new families are appended last, so every earlier id is unchanged.
- **seam.ts:** `SHAPE_WORD_CLAUSES`, the layers switched off to read the flags alone.
- **bar.ts:** digestOf hashes GapCase.flag when present.
- **New gated items:**
  - V holds none of the 90 guarded words, and V's sources are read without their word lists;
  - every one-source name is GROUNDED;
  - the flags alone hide them: 0 shown of 92 (CLAIM_WORDS), 49 (ABOUT_YOU) and 105 (PROPER_NOUN);
  - the flags carry weight: with each one off, 92 of 92, 49 of 49 and 104 of 105 show;
  - the Today quests view is named and filled, on 2,814 of 2,814;
  - no code label names a pending NOT_CHOSEN Domain: 0 over 87 views.
- **Ablation** gains section 2b.
- **The pin is re-blessed:** sha256 0dd9a8be08e4d70b…, 162 runs, 22,231 E strings. *(Superseded by append-only re-blesses in the finishing round, the hardening round, the confirm-to-unlock round and the safety-gaps round; the live pin is 25b08ff54d41059d…, §19.9.)*

**T** (src/app/today/page.tsx, src/app/dev/style/today/**, today-ui-check):
- **today-ui-check** gains `--strict` and a `pending(owner, …)` helper.
- **It also gains the section "the aim line's text fits its 3-line clamp".** This is an estimate, not a browser measurement:
  - an embedded table of Inter advance widths at weights 400 and 600, read from the build's next/font woff2 (sha256 c940764593d0fe5d…);
  - a greedy word wrap;
  - layout numbers read from roadmap.css, components.css, tokens.css and today.css;
  - 545 copies, checked at 344, 375, 932 and 1440 px (least spare 2.8, 33.8, 29.9 and 6.2 px);
  - a sweep from 344 to 1920 px, PENDING on R5's c3 clamp.
- **The fixtures** draw `aim-in-place` and `aim-in-place-longest` inside `.dev-aim-board`, a copy of the board's columns, so c3 has its real width. AIM_SLOT_STYLE is pinned equal to TodayBoard's QUESTS_SLOT_STYLE.
- **page.tsx and the hidden fixture** name both × buttons: 'later:' comes from /you's ASK card, and 'hide:' from /you's LATER line and Today's SET ×.

**Y** (/you, rules, Settings, tour):
- **aim-fixtures.ts:** a LEGACY plan (a Field Area with no depth) and three states, each accepted before AIM_INVITE_SINCE (beforeRev4()):
  - `legacy-active`: a Gemini row hidden, with the plan's domainIds and areaFieldId;
  - `legacy-draft`;
  - `legacy-done`.
- **SettingsView:** `AIM_SUGGESTIONS_COPY.note` names capture.
- **The rules page:** the clean-entry window printed from `retryReadDaysOf(DEFAULT_DEPTH)` with the ward residual, and the two "Not now" sentences.
- **you-check:** every WARN is now a check: seedShown, HIDDEN rendering as OFF, the last aim's rank, the STUB gate, the rules sentence and others. `captureQuietedByPrompt()` ties the Settings note and the rules card to offersAim.
- **tour-check:** the you-aim target is checked like every other, and its WAIT is gone.

**C** (capture):
- **aim-capture.ts:**
  - `readCaptureAimPrompt(readSetting, cookie, today)`: aimPromptOf over LifeSettings.aimSuggestions and the cookie. A missing column (P2022) reads on; any other failure is unknown;
  - `isCaptureAimPrompt`;
  - `aimPromptOnOpen(v, today, now, freshMs)`: forgets a prompt read VOCAB_FRESH_MS (5 minutes) ago or on another life day;
  - **changed signature:** `offersAim(parsed, aim, prompt)` gains a required 3rd parameter, `prompt: AimPrompt | undefined | null`, and needs aim NONE and prompt ASK.
- **actions/capture.ts:**
  - `CaptureVocabulary.aimPrompt?: AimPrompt`, additive and optional;
  - `loadCaptureAimPrompt`: the cookie is read per request, outside the cache; one select of LifeSettings.aimSuggestions is cached on 'life'. It runs inside the existing Promise.all, and the field is returned only when known.
- **QuickCapture:** `SheetVocab.aimPrompt` is held in memory only and trusted through isCaptureAimPrompt. It is forgotten on each new opening per aimPromptOnOpen, and the aim-line path never reads it.
- **docs/life-plan/capture.md:** a new "The user's no" paragraph and updated Files and Tests lists. The Goal ▾ edit is unchanged.

### 17.2 Rules the lanes settled this round (no new name)

Each of these was a ruling §16.10 left open. A lane took the reading the spec's text supports, and the lead confirms or reverses it (roadmap-rev4.md, "As shipped").

| Ruling | Taken by | What the code does | To reverse |
|---|---|---|---|
| WRITE_MARGIN 1.3's side effect | R2 | Option (b): a spare-only plan is dated on the cards held | spareOnlyOf returns false |
| Today's SET × | R5 | It calls hideAimPrompt ('hide:'), as decision 34 requires | One line in AimLine.tsx, plus the ui-check, today-ui-check and you-check pins and the rules sentence |
| Capture's offer under OFF or a snooze | C | It shows only while aimPromptOf reads ASK | Drop `prompt === "ASK"` in offersAim, and revert Y's Settings and rules copy |
| An over-excluding contrast | R3 | The release rule (the finishing round scopes it to its clause) | `rules: {"constraint.release": false}` |
| R1's window arguments | R1 | The wider of the acceptance's and the live m, plus the live grace | None needed; R4 and R6 may adopt it |

### 17.3 §16.8's PENDING lines at the end of fix round 2, and what the finishing round closes

**Passed in this round:**
- all five of R4's: historyOf's depthLowered; ladderOf's counts; dateEffectOf's counts; AimCardView.legacyView filled; rankIndicesOf's depth;
- both of R5's: PlanHistory keyed on depthLowered; the legacy Aim card reading legacyView.

**Still pending, all the lead's.** `npm run roadmap-contract:strict` fails on these 5:
- library-model outcomeOf by prefix (the reader golden and the grep);
- life-sizing applySizing refusing an 'rm:' template;
- tasks.ts resizableCore refusing it;
- TaskDrawer hiding Resize for 'rm:' rows;
- ui-audit's 410 px and 72 px gates.

**Status at 11:10 on 5 Oct, read from the code while the finishing round was under way:** `roadmap-contract-check --strict` passes (396, 0 failed), so the lead's five lines above have landed (library-model reads each tagged detail as its untagged form; the Resize guards in life-sizing.ts, tasks.ts and TaskDrawer.tsx; ui-audit's 410 px, 72 px and no-clamp gates). R3's release is scoped to its own clause ("knee injury, swimming ok, running not ok" → running) and R7's K family has the release sub-class; R5's c3 unclamp is in roadmap.css. Still open then: R5's pace rule in RoadmapForm, R4's finishStartCore counts, Goal ▾ "New aim" (capture-ui.ts has the option; InsertRow.tsx and QuickCapture not yet), the optional cleanReadDaysOf adoption, PROGRESS.md, the pin review and the life:check switch.

**PENDING lines in other checks** (at the end of fix round 2):
- today-ui-check: R5's c3 clamp;
- roadmap-quests-check: R4's finishStartCore counts *(gone in the hardening round)*;
- capture-server-check: the lead's Goal ▾ "New aim".

**The finishing round's handoffs (exact).** Each is marked with its outcome, read from the code as committed after the finishing round (65645ea); §18 has the detail.
- **Lead:**
  - **library-model.ts:397.** Change it to `if (d.startsWith("strike") || d.startsWith("degraded") || d.startsWith("shielded")) return "miss";`. Then delete roadmap-contract-check's `KNOWN_EXACT_READERS` entry, and add tagged goldens to review-check. **Do not ship srs.ts without it.** *(Done: through parseReviewDetail, with the goldens in roadmap-contract-check and study-side-check.)*
  - **The Resize channel (§16.4):**
    - applySizing selects captureKey and returns "done" for `isRoadmapCaptureKey` before any model call, writing code's basis;
    - resizableCore refuses with "A plan-born task's size comes from its practice.";
    - TaskDrawer's canResize excludes 'rm:' rows.
    - *(Done.)*
  - **ui-audit:**
    - gate `[data-aim-card="empty-ask-continue"]` and `[data-aim-card="empty-ask-seed-last-aim"]` at ≤ 410 px at 344, and rule whether 410 bounds the section or the whole box;
    - gate every visible `[data-state^="aim-"] .rm-aim-line` at ≤ 72 px, with `.rm-aim-line-t`'s scrollHeight ≤ clientHeight + 1 at every audited width. Consider adding 768 and 1366;
    - add the legacy-active, legacy-draft and legacy-done boxes and the quiet boxes to the /dev/style/art/you 344 pass.
    - *(Done in code, with the extra widths 768 and 1366 on /dev/style/today and /today. 410 bounds `section.card.rm-ac-call` (the lane's reading, for the lead to confirm). No browser run yet, §18.3.)*
  - **Goal ▾ "New aim":** apply capture.md, revision 4, "The Goal ▾ menu" to capture-ui.ts, InsertRow.tsx and QuickCapture (`aim={vocab?.aim}`). *(Done, with `aim={editing ? undefined : vocab?.aim}`.)*
  - **PROGRESS.md and question 11:** state the one-source residual, 25 of 41 (61%), and the several-sources 0 of 1,958, before ROADMAP_GAPS_LIVE can flip. Question 11 in roadmap-rev4.md now states it. *(PROGRESS.md still open, §18.3.)*
  - **pin.json:** review it (0dd9a8be…). *(Superseded: the finishing round re-blessed it append-only to 9d542fd5…, the hardening round to df51f44f…, the confirm-to-unlock round to 6a7ed5cd…, and the safety-gaps round to 25b08ff5…, the live pin; the review is still the lead's, §19.9.)*
  - **Integration:** get roadmap-contract:strict to 0. Then life:check runs `tsx scripts/roadmap-contract-check.ts --strict`, and life-day-check's exact list follows. Optionally add a `today-ui:strict` script. *(roadmap-contract:strict reached 0 in the finishing round, and the hardening round made the switch, with `today-ui:strict` too, §18.3 row 6.)*
- **R3:** scope the release to its own clause. Suppress terms only up to the next pause, break or cue, then restore the cue that was active.
  - Goldens: "knee injury, swimming ok, running not ok" → [running]; "knee injury healed, but running not ok" → [running]; "knee injury, cycling fine, running hurts" includes running.
  - Keep "injured, but cleared to run" → [] and "injured last year, now fully recovered and running daily" → [last, year].
  - Optional: add newDomainNames to labelBaseFor and labelContextFor, so a Domain name the user typed isn't flagged PROPER_NOUN.
  - *(The scope is done, with the goldens kept; the optional newDomainNames item is still open, latent while ROADMAP_GAPS_LIVE is false.)*
- **R7:** add a K sub-class "{cue}, {other} is fine, {t} not ok / not allowed / is out / hurts" (it must exclude t), and the release phrasings R3 lists. Re-bless the pin after review. The REALISTIC-without-pace run waits on the option (b) ruling. *(The sub-class is done, 274 cases, and the pin is re-blessed append-only; the REALISTIC-without-pace run still waits on the ruling.)*
- **R5:**
  - RoadmapForm.tsx ~894: `const shortOfCount = coverage.some((c) => c.live < c.n)` and `newCardsRequired = realistic && shortOfCount && !paceMeasured`. Keep needsNewCards for askCards. Add ui-check goldens: 42 live cards against n 34 is not required; 9 against n 25 is;
  - roadmap.css: `@container main (min-width: 640px) { .rm-aim-line-t { -webkit-line-clamp: unset; } }`, or an equivalent rule ending in `.rm-aim-line-t`.
  - *(Both done: the form's rule is the exported `newCardsRequiredOf(realistic, coverage, paceMeasured)`, and roadmap.css holds that exact rule.)*
- **R4:**
  - finishStartCore: use `liveCountOfKey(ctx, x.measureKey)`, write no reading and take no v0 for an `rc` key, and pass `v0ByKey` in place of `v0`. Add a server-check case: with 3 multiple-choice cards at or above L, Start's reading equals the recall count;
  - intakeRefusalOf's doc reads "a Domain short of its count with no writing pace". Add a server-check case where a spare-only REALISTIC intake with no pace saves and drafts with rate null;
  - optional: read the clean-entry window through R1's cleanReadDaysOf.
  - *(The window is done: retryEntriesOf reads retryReadDaysOf at the wider of the acceptance's m (`RoadmapStore.acceptanceMultiplier`) and the live m, R1's window to the day. finishStartCore and intakeRefusalOf were still open after the finishing round, and the hardening round closed both, §18.3 rows 1 and 2.)*
- **R6 (optional):** read the window through cleanReadDaysOf. *(Done the same way, through `QuestStore.acceptanceMultiplier?` and the private cleanWindowDaysOf.)*
- **Lane M:** redraw the mockups to the shipped UI (docs/life-plan/roadmap/final-*.html). Each rev-4 section opens with an "As shipped" note. *(Done, with example data marked; never opened in a browser.)*

### 17.4 Open points for the lead

The rulings are listed once, in roadmap-rev4.md, "As shipped" ("Rulings for the lead"). Beyond §17.2's five, they are:
- HIDDEN as a fourth state (§15.10);
- a PART at the depth ranking below (§15.4);
- keepCalibratedDatesCore updating the acceptance in place;
- capture's DRAFT button target;
- "(level 12)" on Today's START line;
- "0 at level 6+" and the empty REALISTIC date input;
- PART pay;
- ADD pacing during a PART;
- depthRecordsOf when a line choice raises the policy;
- a DRAFT redraft's frozen coverage;
- the practice conditions on every depth plan's reach (R1).

If the deploy is after Sun 11 Oct 2026, AIM_INVITE_SINCE moves with its pins.

## 18. The finishing round and the hardening round (read from the code)

The finishing round closed §17.3's handoffs in five items (the library's tagged reader, the plan-born Resize channel, the encouragement entry points and their 344 px gates, the release scoped to its clause, and one clean-entry window), plus the docs and mockups. Code comments call it "fix round 3". It was committed as 65645ea, and this section was read from that code. A verifier then ran every gate and listed ten minors still open; the hardening round took them, and §18.3 gives each one's status. No export was renamed or removed. One interface gained a required member (`RoadmapStore.acceptanceMultiplier`); every other change is new, optional or private. The hardening round's own exports close §18.1. A second verifier ran every gate on it (all green) and listed nine items still open (§18.5); the lead answered the gravest with §19.

### 18.1 Exports and changed signatures, by item

**The library reads tagged review details** (lead; library-model.ts, roadmap-contract-check, study-side-check):
- `outcomeOf(detail)` switches on roadmap-types `parseReviewDetail(detail).outcome`: "advanced" or "backfill" gives "on"; "strike", "degraded" or "shielded" gives "miss"; anything else gives null. Old untagged rows and srs.ts's tagged rows ("strike · L11", "advanced · L11→12", "advanced · mastered · L11→12") read the same. It gives the same results as §16.9's startsWith line. library-model stays pure, because roadmap-types is a client-safe leaf.
- roadmap-contract-check: the `KNOWN_EXACT_READERS` set, its "still exact" check and its PENDING line are gone. The grep is strict: no file in src compares an outcome word with `===`. A source pin checks the import and the switch, and the golden is a hard `eq` over 9 details.
- study-side-check imports `_no-model` first and adds six cases. They cover tagged outcomes, a mixed ledger that keeps every miss, and agreement with review-facts `reviewMarkOf` and with `parseReviewDetail`.

**Plan-born tasks can't be resized by a model** (lead; life-lexicon.ts, life-sizing.ts, tasks.ts, TaskDrawer.tsx):
- life-lexicon:
  - `PlanBornGradeInput`;
  - `planBornBasisOf({category, band, estMinutes})` gives code's basis "<category> · <band> · <minutes>m", e.g. "Study · Standard · 45m"; an unknown value reads Other, Standard, 30m;
  - `planBornGradeOf(t)` gives `{gradeBasis}` and nothing else (no model field, attempt or copy), or null when that basis already stands;
  - `PLAN_BORN_CHIP` = "from the plan";
  - **changed (optional field):** `gradeChipOf(t)`'s `t` gains `planBorn?: boolean`. A plan-born task's chip reads PLAN_BORN_CHIP, not "sizing…".
- life-sizing `applySizing` selects captureKey, category and band. For an `isRoadmapCaptureKey` template it returns "done" before sizingSkipReason, the per-title copy, the cap and sizeLifeTask. If the stored basis differs, it first writes code's basis through the `gradeFrozenAt: null`-guarded write, so model words already stored are replaced. This holds for capture's after() and for Resize's force alike.
- tasks.ts:
  - `PLAN_BORN_RESIZE_REFUSAL` = "A plan-born task's size comes from its practice.";
  - resizableCore selects captureKey and refuses a plan-born template with it; a plan-born goal keeps the goals refusal;
  - toBoardTemplate's `sizing` is false for an 'rm:' row.
- TaskDrawer: `planBorn = isRoadmapCaptureKey(t.captureKey)`, and `canResize = !planBorn && …`. The "Why" and the chip's title show `planBornBasisOf(t)`, never `t.gradeBasis`. TaskDrawer is the only UI reader of gradeBasis.
- roadmap-contract-check: the three lead PENDING lines become `planBornCases()`. This async section runs after every synchronous case, behind a throwing `globalThis.prisma` Proxy installed before src/lib/prisma loads. It covers applySizing's exact reads and writes, an ordinary-task control and near-miss keys, resizableCore, toBoardTemplate, and the drawer rendered with renderToStaticMarkup. The summary waits on it.

**The encouragement entry points and their gates** (lead and R5; capture-ui.ts, InsertRow.tsx, QuickCapture.tsx, roadmap.css, RoadmapForm.tsx, ui-audit.mjs):
- capture-ui:
  - `lineHasPrefix(parsed, text)` is true for a parsed mode or a leading 'aim:', so a bare 'aim: ' hides "New goal" and "New aim";
  - `insertMenuOptions`' ctx gains `aim?` (a type-only CaptureAim import);
  - the option `goal-new-aim`, "New aim", follows "New goal" and inserts 'aim: ' only when aim is 'NONE' and the line has no prefix.
- InsertRow gains an `aim?` prop passed through, and hasMode = lineHasPrefix(parsed, text). QuickCapture passes `aim={editing ? undefined : vocab?.aim}`.
- roadmap.css: `@container main (min-width: 640px) { .rm-aim-line-t { -webkit-line-clamp: unset; } }`.
- RoadmapForm: `newCardsRequiredOf(realistic, coverage, paceMeasured)` = `realistic && !paceMeasured && coverage.some((c) => c.live < c.n)`, live counting recall cards only (option (b), as roadmap-realism spareOnlyOf). The writeNeedOf rule and its import are gone.
- ui-audit.mjs: `GATES`, the pure `heightGateProblems({route, width, ask, aimLines})`, `--gate '<json>'` (it runs the gates on given measurements and exits before Chrome), and `EXTRA_WIDTHS` (768 and 1366 for /dev/style/today and /today when no `--widths` is given). `--plan` prints the gates. Each route × width prints a "gated:" line.
  - ASK: every ASK card drawn is ≤ 410 px at 344, on `section.card.rm-ac-call`, and on /dev/style/art/you both tallest states must be drawn.
  - The aim line: ≤ 72 px at 344, and `.rm-aim-line-t` scrollHeight ≤ clientHeight + 1 at every width. aim-in-place and aim-in-place-longest must be drawn, in c3 under Goals from 932.
- The checks: capture-server-check's PENDING becomes passing cases; roadmap-ui-check gains the 42-against-34 and 9-against-25 goldens; roadmap-contract-check gains the `--gate` cases.

**The release scoped to its own clause** (R3 and R7; roadmap-validate.ts, the hostile fixtures, roadmap-hostile-check, -ablate, roadmap-model-check):
- roadmap-validate: no export changed. The private additions are `RELEASE_CLAUSE_JOINS` ("and", "or") and `RELEASE_DEGREE` (a word of 3 or more letters ending in -ly). `releasesFrom` became `releaseAt`, which returns the release word's index, and the term test is shared as `isTerm`. negatedTermsOf holds the cue (with its term count) over the releasing clause and restores it where the clause ends; the rule is in its docstring and in roadmap-rev4.md F-R4-17.
- roadmap-lexicon: the CONSTRAINT_RELEASE_WORDS and CONSTRAINT_STATE_CUES docs state the clause-scoped rule (the hardening round; comments only).
- grammar.ts:
  - `RELEASE_TEMPLATES`, with 17 BODY and 3 CARE phrasings of a cue, a cleared {o}, then a later {t}/{t2};
  - `RELEASE_CLEARED`, the activities a release clears;
  - `RELEASE_ENTRY_TEMPLATES`, one phrasing per release word, start and blocker.
- generate.ts:
  - `ConstraintCase.mustKeep?` holds the kinds only the cleared activity names, none of which may be excluded;
  - `ConstraintCase.sub?: "release"` is absent on every older case, so they hash as before;
  - `counts.K_release` is 274, appended after every older case, and 256 Field over-exclusion lines are added (K_overExclusion 1,031);
  - a private `cuesIn` and a multi-term assertQuiet.
- seam.ts: **`H6_REQUIRED_PREFIXES` = ["cue.", "resource.", "flag.", "constraint."]**. "constraint." is new, so H6 requires constraint.label and constraint.release to fire, and the SELF item checks it.
- roadmap-hostile-check gains a K item: "0 kinds excluded that a release clause cleared, and the release never drops a later exclusion". The ablation's `Outcome.kOver` ("K cleared kinds excluded") counts the cases that exclude a kind the user cleared. Lexicon entries are matched both as written and with apostrophes closed.
- roadmap-model-check gains 26 cases (736). They cover the verifier's probes with must-name and must-not-name words, clauses a release word opens, the "or" join, the rule switched off, the aim filter on "Run a sub-50 10K", the aim-conflict word, the CONSTRAINT_CONFLICT hint, and STRENGTH_SESSION out with MOBILITY_SESSION kept.
- pin.json is re-blessed (§18.2).

**One clean-entry window** (R4 and R6; roadmap-server.ts, roadmap-quests-server.ts and their checks):
- **changed (a new required member):** `RoadmapStore.acceptanceMultiplier(userId, roadmapId): Promise<number | null>`. prismaRoadmapStore reads the current acceptance (`undoneAt: null`, `acceptanceOrderBy()`), as R1 does. retryEntriesOf's `m` is renamed `liveM`. It reads the acceptance only when recall cards sit at exactly the depth on version ≥ 1, and uses `max(liveM, accepted)`.
- `QuestStore.acceptanceMultiplier?` is optional; without it the quests read the live m. The private `cleanWindowDaysOf(store, userId, roadmapId, L, liveM, loadout)` is read in wave 3 only when an `rc` measure has a card at exactly L.
- A failed acceptance read is logged and falls back to the live m; it never throws. The reach model's m (WeekQuestInput.m) is unchanged.
- So R1's cleanReadDaysOf, R4's planContext and R6's quests read one window: retryReadDaysOf(L, the wider of the acceptance's m and the live m, the live grace). roadmap-readings' docs and roadmap-measures-check's comments and case names say so since the hardening round. The case "R1's window is never narrower" still asserts its older bound, against the live-m-only and acceptance-only windows, and it holds.

**The hardening round** (code comments: "fix round 4"; read from the working tree after it, as the second verifier confirmed it):

**The constraint reader reads a negation after its term** (R3 and R7; roadmap-validate.ts, roadmap-lexicon.ts, the hostile fixtures, roadmap-model-check):
- roadmap-validate:
  - no export was renamed or removed;
  - `negatedTermsOf` is rewritten, and the forward reading is kept;
  - `RULE_NAMES` gains `constraint.after` (a pain or verdict word after its term names it), `constraint.carry` (a state cue or pain word that ends a sentence naming only body parts covers the next sentence, one hop) and `constraint.compound` (constraintExclusionsOf and aimConflictOf match a compound the user wrote by its last part, never "run-throughs" → run);
  - it also gains one `cue.<entry>` rule per CONSTRAINT_CUES_AFTER entry. These rules are not in R3's H6_RULE_NAMES; the bar requires them through the `cue.` and `constraint.` prefixes;
  - H6_RULE_NAMES gains the five new cues (49), and RULE_EXAMPLES covers them.
- roadmap-lexicon, new lists, each documented:
  - CONSTRAINT_EXTRA_CUES (nothing);
  - CONSTRAINT_EXCEPT_WORDS (but, except);
  - CONSTRAINT_INJURY_CUES (tore, torn, sprain, fracture);
  - CONSTRAINT_CUES_AFTER (21 words, from "hurts" to "unsafe");
  - CONSTRAINT_VERDICT_WORDS and CONSTRAINT_AFTER_NEGATORS;
  - CONSTRAINT_BODY_PARTS, CONSTRAINT_ANAPHORA, CONSTRAINT_ITEM_WORDS and CONSTRAINT_SKIP_WORDS;
  - CONSTRAINT_MIRROR_STARTS and CONSTRAINT_MIRROR_ENDS.
- grammar.ts:
  - `POSTFIX_AFTER_CUES` and `POSTFIX_PREFIX_CUES`, frozen copies of the lexicon's lists;
  - `POSTFIX_TEMPLATES` (67 BODY, 9 CARE);
  - `POSTFIX_COMPOUNDS` and `POSTFIX_COMPOUND_TEMPLATES`;
  - `POSTFIX_FOREIGN` (vi, ja) and `POSTFIX_MIXED`.
- generate.ts:
  - **changed (optional field widened):** `ConstraintCase.sub?: "release" | "postfix"`;
  - `HOSTILE_SEEDS.K_POSTFIX`, a private `familyKPostfix`, and `counts.K_postfix` (471);
  - the new cases are appended after every older K case and over-exclusion line: K1821 on, and X1031 to X1409 (379 more, K_overExclusion 1,410). pin.json is re-blessed (§18.2).
- One golden changed: "knee injury, cycling is fine or running hurts" names ["running"], no longer ["running", "hurts"], because "hurts" is now a cue after its term. The release behaviour it pins is unchanged.
- roadmap-model-check gains about 100 goldens (831). They cover the lead's and the verifier's phrasings on both sides, each new rule switched off, non-English parsing to nothing while still raising the confirm, and a MORE_EXAMPLES entry per postfix cue.

**What Start counts** (R4; roadmap-server.ts, server-check, quests-check):
- private `startCountsOf(ctx, measures)`: R1's `cardsAtLevelValue` per CARDS_AT_LEVEL key, recall cards only on an `r` key, and no count for an `rc` key;
- private `v0ByKeyOf(counts)`;
- finishStartCore and startPreview pass `QuestSetOverrides.v0ByKey` in place of the single `v0`, and finishStartCore no longer calls liveCount;
- intakeRefusalOf's doc names "a Domain short of its count with no writing pace" (option (b));
- server-check passes 619; quests-check passes 334, and its PENDING (R4) line is replaced by a hard source check.

**The drawer and the strict chain** (lead; TaskDrawer.tsx, today-ui-check, package.json, life-day-check):
- a plan-born task's Machine grade line reads "the plan set ~Nm (counts up to …)", and the drawer shows no "AI said" band and no Model row for it;
- life:check runs today-ui-check and roadmap-contract-check with `--strict`;
- package.json gains `today-ui:check` and `today-ui:strict`;
- life-day-check's `STRICT_LIFE_CHECKS` pins both.

**Docs and comments** (lane 0): the lexicon's release and state-cue docs, roadmap-readings' window docs, and roadmap-measures-check's comments and two case names.

### 18.2 The hallucination bar after the finishing round and the hardening round

Read from roadmap-hostile-check run alone (DATABASE_URL pointed at a closed port, no model key). The second verifier's run after the hardening round gave the same figures. *(This is the record of the bar after the hardening round. R3's vocabulary item in the confirm-to-unlock round re-blessed the pin append-only to 6a7ed5cd…, and its suggest item in the safety-gaps round to 25b08ff54d41059d…, the live pin, each growing K and the over-exclusion lines; §19.9 has the live counts and figures.)*
- **The pin** was sha256 **df51f44f066e4e7a2d433a0ac3c317f789de3b5f6befb528afcd585012c69d98** after the hardening round (superseded, §19.9). Its history up to then:
  - fix round 2 blessed 0dd9a8be08e4d70b…;
  - the finishing round re-blessed it append-only to 9d542fd58ec62bcef8a335da00490589e98f8ad260a5b94162db8341d3146d9d. It added the K release cases and 256 over-exclusion lines after every older case, and a scratch probe that drops them recomputes 0dd9a8be…;
  - the hardening round re-blessed it append-only to df51f44f…. It added K's postfix sub-class (K1821 on) and 379 over-exclusion lines (X1031 to X1409). The verifier recomputed digestOf without them and got 9d542fd5… exactly. The pack hashes are unchanged;
  - lane 0's §19 left it unchanged, because the corpus carries catalog keys, not entries; R3's vocabulary item then re-blessed it to 6a7ed5cd…, and R3's suggest item in the safety-gaps round to 25b08ff5… (K2909 to K3006, X2010 to X2102; §19.9).
- **Counts** (after the hardening round; §19.9 has the live ones):
  - 162 runs;
  - A 5,000, B 1,000, C 2,000, D 2,000;
  - E 1,700 replies and 22,231 strings (21,946 claim-bearing, 252 control, 303 clash, 246 one-source);
  - E-G 2,304;
  - **K 2,292** (K_release 274, K_postfix 471), with **1,410** over-exclusion lines. The finishing round had K 1,821 and 1,031 lines;
  - M 2,200;
  - F 0 (no blessed probe reply yet).
- **H1–H5:** 0 structural exceptions, 0 taint hits and 0 quarantine leaks. H4 has 0 mismatches (CLEAN 6,121, SALVAGED 809, REJECTED 4,770). H3 shows 0 of 21,946 claim-bearing gap strings, with control 252 of 252 shown.
- **The E-G residual:** several-sources claims are 0 of 1,958 shown. **One-source claims are 25 of 41 shown (60.98%)**, e.g. "Actuarial probability exam" and "Probability exam". That is why ROADMAP_GAPS_LIVE stays false (decision 51; roadmap-rev4.md F-R4-19, F-R4-22, question 11). With it false, `gaps` is absent from every schema, so no gap name reaches a view. The flags carry gated weight: with the layers above them off, CLAIM_WORDS hides 92 of 92 one-source claims, ABOUT_YOU 49 of 49 and PROPER_NOUN 104 of 105.
- **K:**
  - 0 of 1,894 parsed English cases missed (cases: en 1,933, vi 197, ja 162);
  - 0 of 2,292 without the session-picks confirm, 0 of them vacuous;
  - 0 of 1,410 body phrasings excluded a Field kind;
  - 0 of 244 release cases excluded a kind the user cleared.

  The finishing round's figures were 1,462, 1,821, 1,031 and 166.
- **What K can't see** (the second verifier):
  - POSTFIX_AFTER_CUES is a frozen copy of the lexicon's own CONSTRAINT_CUES_AFTER, so 100% recall there tests sentence shape, not vocabulary;
  - the over-exclusion lines are body phrasings only, so a Field or CARE constraint that names a Domain or the aim is never tested (§18.5 row 1);
  - the confirm item reads the validator's session-picks decision, not §19's gate (§19.7).
- **H6:** **91 rules fire** over 29,027 cases, and all 38 negation cues fire. R3 names 49, five more than before: the new cues nothing, tore, torn, sprain and fracture. The bar adds 42:
  - the six resource.\* rules;
  - 31 cue.\* rules: the finishing round's ten, plus one per CONSTRAINT_CUES_AFTER entry (21);
  - constraint.label, constraint.release, constraint.after, constraint.carry and constraint.compound.

  The finishing round had 62 (R3 44, the bar 18).
- **M1–M7:** 0 broken.
- **The budget:** H1–H5 and K take 19.5 s (K 0.8 s), and the whole check 36.3 s. The finishing round took 19.2 s and 34.3 s.
- **roadmap-hostile-ablate** (a report; 166.8 s in the verifier's run):
  - every rule off gives 32,644 new failures, including 1,841 K misses, so the bar is not vacuous. The finishing round had 32,236;
  - one rule off at a time:

    | Rule off | Effect |
    |---|---|
    | `constraint.after` | K misses +312 |
    | `constraint.carry` | +30 |
    | `constraint.compound` | +20 |
    | `constraint.release` | K misses +7, cleared kinds excluded +188 (the finishing round: +19 and +152) |
    | `cue.hurts` | +71 |
    | `cue.is out` | +37 |
    | `cue.nothing` | +10 |
    | `cue.tore`, `cue.torn`, `cue.sprain`, `cue.fracture` | +6, +6, +12, +6 |

  - every other postfix cue carries weight too, except `cue.is out of the question` and `cue.are out of the question`, which `cue.is out` covers;
  - lexicon entries that carry weight include the verdicts "possible" (+15), "option" (+10) and "recommended" (+5), the anaphora "it" (+11), the body parts "back" and "acl" (+6 each), "but" and "except" (keeps), the mirrors "too" and "so is" (keeps), and the negator "doesnt" (+12 keeps);
  - the release lists: all 8 CONSTRAINT_RELEASE_WORDS, all 5 RELEASE_STARTS and 32 of 36 blockers carry weight. The 4 idle ones (not, no, yet, unless) are already a cue or a scope break;
  - rules covered by another layer (shape.\*, keys.\* and several cue.\* and flag.\* rules) stay by design, since the layers overlap on purpose.

### 18.3 Still open after the finishing round, and the hardening round

A verifier ran every gate on 65645ea: tsc, eslint, all 26 life:check scripts, all 11 ui:check scripts, both `--strict` runs, balance:horizon, skills:stats, novelty:check, the hostile bar and its ablation. Every gate passed, and it listed these ten minors. The hardening round took them. The status column was first read from the working tree at 11:40 on 5 Oct, while the round was still under way. It now gives the state after the round, as the second verifier confirmed it by running every gate again (all green).

| # | Item | Owner | The rule | Status |
|---|---|---|---|---|
| 1 | finishStartCore counts | R4 | Count each card key as its readings do (liveCountOfKey), write no reading and take no v0 for an `rc` key, pass `v0ByKey` in place of `v0`, and pin it in server-check so quests-check's PENDING (R4) regex stops matching. | done, and confirmed: private `startCountsOf(ctx, measures)` (R1's cardsAtLevelValue per key, none for `rc`) and `v0ByKeyOf`; finishStartCore and startPreview pass `v0ByKey`. server-check 619 passed (3 multiple-choice cards: 12, not 15; no `rc` reading or v0; a rev-3 key still counts every card); quests-check 334 passed, no PENDING |
| 2 | intakeRefusalOf and option (b) | R4 | Reword the doc to "a Domain short of its count with no writing pace", and add a server-check case where a spare-only REALISTIC intake with no pace saves and drafts with rate null. | done, and confirmed: the doc names spareOnlyOf and newCardsRequiredOf; server-check's integration case saves, drafts with rate null and refuses the short case. The ruling is still the lead's |
| 3 | ui-audit in a browser | lead | Run `npm run ui:audit` against a dev server; confirm the gated lines at 344, 375, 932, 1440, 768 and 1366; rule whether 410 bounds the section or the box, and record it in roadmap-rev4.md. | open: no browser was allowed. The lane's reading (the section) is recorded in roadmap-rev4.md ("Rulings for the lead", F-R4-1) and §18.4 |
| 4 | PROGRESS.md and the gap residual | lead | State the one-source residual, 25 of 41 (60.98%), and several-sources 0 of 1,958, before ROADMAP_GAPS_LIVE can flip. | open: PROGRESS.md is the lead's. roadmap-rev4.md states it as the reason ROADMAP_GAPS_LIVE stays false (decision 51, F-R4-19, F-R4-22, Acceptance, question 11) |
| 5 | pin.json | lead | Review the pin re-blessed append-only to 9d542fd58ec62bce… (§18.2), and cite it in the docs. | superseded three times: the hardening round's parser item re-blessed it append-only to df51f44f066e4e7a… (§18.2), the confirm-to-unlock round's to 6a7ed5cd92ad9585…, and the safety-gaps round's to **25b08ff54d41059d…**, the live pin (§19.9); each time a verifier repeated the digest proof. Cited in roadmap-rev4.md Constants and F-R4-22; the review is open |
| 6 | life:check --strict | lead | life:check runs `tsx scripts/roadmap-contract-check.ts --strict`, life-day-check's exact list follows, optionally `today-ui:strict`. | done, and confirmed (life:check exited 0): life:check runs today-ui-check and roadmap-contract-check with `--strict`; package.json gains `today-ui:check` and `today-ui:strict`; life-day-check's STRICT_LIFE_CHECKS pins both. §19 made life:check fail again until its PENDING lines landed. All have landed: the fourth verifier's life:check exited 0, with roadmap-contract-check `--strict` at 493 passed, 0 PENDING |
| 7 | Docs | lead, lane 0 | Refresh roadmap-rev4.md's "Still open" table and its H6 sentence, mark the library-model handoffs done, add the finishing round's exports, and set capture.md's Goal ▾ status to built. | done at 11:40, overtaken by the parser item, and brought up to it after §19 (the pin, the K counts, the known misses, §18.1's hardening-round exports, §18.5). capture.md:796 still reads "Status: not built": the lead's |
| 8 | Stale comments | R1, R3, lane 0 | roadmap-lexicon's CONSTRAINT_RELEASE_WORDS doc and roadmap-readings' and roadmap-measures-check's window comments. | done: the lexicon's release and state-cue docs state the clause-scoped rule; roadmap-readings' header, cleanReadDaysOf and loadCardCounts docs and roadmap-measures-check's comments and two case names say the three windows are one. No behaviour change (measures-check 366 passed, model-check 736) |
| 9 | The parser's unsafe-side misses | lead (spec and lexicon) | Decide whether negatedTermsOf reads postfix negations ("running hurts my knee", "swimming is fine, running not allowed") and an earlier sentence's cue ("Knee injury. Running hurts."), with K sub-classes; otherwise state them in question 11. | closed. The hardening round's parser item reads both forms (`constraint.after`, `constraint.carry`), with K's postfix sub-class (471 cases), §18.1. The lead's §19 then made any reading a pre-fill only. The misses that remain are vocabulary (§18.5 row 3) |
| 10 | TaskDrawer's Machine grade line | lead, lane T | Word a plan-born task's minutes as the plan's, not "you said". | done, and confirmed: "the plan set ~Nm", and no AI band or Model row for a plan-born task; today-ui-check renders a plan-born and an ordinary row (740 passed, `--strict`) |

### 18.4 Open points for the lead

Beyond §17.4's list:
- **Confirm or reverse the lane rulings the finishing round took:**
  - The ASK card's 410 px bound applies to `section.card.rm-ac-call`, not the whole `[data-aim-card]` box. F-R4-1's "about 330 px" is the card's content plus its own padding and border (312 + 12 + 4 + 2). The whole box, about 427 px with its "Aim" header, stays under the 470 px note.
  - QuickCapture hides Goal ▾ "New aim" while a saved line is edited.
  - The aim line takes as many lines as it needs from 640 px of main, about 90 px at 768 and 1366. The 72 px gate applies at 344 only.
- **Run `npm run ui:audit`** against a dev server and confirm the gated lines pass at 344, 375, 932 and 1440, and at 768 and 1366. If ASK fails, the fallbacks are a 12 px rank line, or dropping the aim words from the ASK last-aim line.
- **Review the re-blessed pin** (§19.9): 25b08ff54d41059d… since the safety-gaps round (6a7ed5cd… after confirm to unlock's first round, df51f44f… after the hardening round, §18.2).
- **State the one-source residual** (25 of 41, 60.98%) and the several-sources 0 of 1,958 in PROGRESS.md before ROADMAP_GAPS_LIVE can flip. Question 11 already states both.
- **The constraint parser's misses: settled.** *(The hardening round reads a negation written after its term and an earlier sentence's cue, with K's postfix sub-class (§18.1). The lead's §19 then made safety rest on the user's answer: since the safety-gaps round every BODY or CARE plan asks whatever the cue detector reads, and the parser's reading is a suggestion only, §19.8.)*
- **Option (b)** (WRITE_MARGIN 1.3's side effect): the engine, saveIntake and now the form apply it.

### 18.5 Still open after the hardening round (the second verifier's list)

The second verifier ran every gate on the hardening round's working tree:
- tsc and `eslint src scripts`;
- `npm run life:check`, with both `--strict` runs;
- `npm run ui:check`, balance:horizon, skills:stats and novelty:check;
- the hostile bar and its ablation.

All passed. It also probed past the gates: 57 BODY phrasings, 12 Field, 8 CARE or BODY with the aim filled, 5 carry cases and 24 old-against-new, end to end through the real starterLadder and stageLadderOf. It listed these nine. The lead answered rows 2 and 3 with §19. The status column gives the owners' reports at the end of the confirm-to-unlock round, as the third verifier confirmed them (it was a 13:26 working-tree snapshot before they reported). The third verifier's own list is §19.8.

| # | Severity | Item | Owner | The rule | Status |
|---|---|---|---|---|---|
| 1 | major | A filled word read as the term (the hardening round's regression) | R3, R7 | When a pain or verdict word follows a word the plan fills into labels (a Domain name, the aim or the exam), `constraint.after` reads that word as the term, and constraintExclusionsOf meets it in every kind filled with it. On Field with [Probability, Random variables, Inference], "Inference is too hard for me, I need extra time on it." excludes 19 kinds, every retrieval and production practice among them. On CARE, "Mum's care is too much for me alone" excludes 7 kinds and shows "Your constraints say 'no care'…". The committed parser excluded 0 for all 20 such probes. The fix: a term read back by `constraint.after` or `constraint.carry` matches only through keywords and template words, never through the fill (or needs an activity word), and raises no aim-conflict line, or aimConflictLine quotes the user's clause. R7 adds Field and CARE over-exclusion lines ("{Domain} is too hard", "{aim word} is too much", "{Domain} hurts") with a mustKeep on the filled kinds, re-blessed append-only. | done (R3; rule `constraint.fill`, `NegatedTerm.read`): a term read after its cue, carried or in a state cue's scope matches a kind's fill only when it names an activity on the track. The three probes above exclude nothing, the "no care" line is gone, and the third verifier confirmed it. The bar's lines came with R3's vocab item (FILL_OVER_FIELD over-exclusion lines, FILL_OVER_KEEP keep cases; §19.9). The order constraint is moot since the safety-gaps round: a suggestion never blocks (§19.1) |
| 2 | major | The code-built plan ignores the exclusions (older than the hardening round) | R4, R2 | ladderOf and starterPlan call starterLadder and stageLadderOf without `excluded`, and syncStagePractices gets none, so realism's "code never places one" is dead in production. Through the real ladders: "No timed practice, it stresses me out." places Timed practice in both stages, "No mock tests please." places a Mock test, and CARE "No visits on weekdays, phone calls only." places Check-in, while the same draft lists each as left out. BODY was protected by bodySafeOf. | done under §19's first version (R4, R2): every plan path builds the gate (R4's `planGateOf`) and passes its blocked kinds, and server-check pinned "No timed practice, it stresses me out." (no TIMED_PRACTICE row) and "No mock tests please." (no MOCK_TEST). Since the safety-gaps round a Field suggestion is placed with its box pre-ticked (§19.1), and R4's server-check case now pins that: Timed practice is placed, and the card shows its row pre-ticked with the user's sentence |
| 3 | major | The parser's vocabulary misses | R3 (lexicon), R7 | 19 of 40 fresh BODY phrasings exclude nothing: "Running causes me knee pain.", "Running gives me shin pain.", "Running = pain.", "Never run on my bad knee.", "I shouldn't run until my knee heals.", "Knee surgery two weeks ago. Running and jumping.", "Bad knees. Jumping and running.", "Running is something I can't do right now." (reads "right"), "Running? My doctor said absolutely not." (reads "absolutely"), "aggravates", "bothers", "kill", "swell", "stay away from" and "off running"; "Weights are a no-go and so is running." excludes weights only. The lexicon fix is "pain" and "ache" after an activity, "never", "shouldn't", "mustn't" and "not supposed to", "surgery", "operation", "replacement", "splints" and "bad <body part>", "doctor/physio said" or "told me", and "and so is X" after a negative verdict. R7 adds a K sub-class drawn from a vocabulary list independent of the lexicon. | done as pre-fill quality (R3): 12 new lexicon lists, the rule `constraint.body`, and K's vocab sub-class (617 cases from VOCAB_TEMPLATES, 105 BODY and 8 CARE phrasings written from how people talk) at 100% English recall (§19.9). Not a safety item: since the safety-gaps round BODY and CARE ask whatever the parser reads. Still unread in the docs probe: "My ankle tends to swell after running." and "I'm off running for now." |
| 4 | minor | Over-reach that puts words in the user's mouth | R3 | Carry: "Sprained ankle. Swimming three times a week is my plan." gives "Your constraints say 'no swimming'" against "Swim 1 km without stopping", and "Knee injury. I'd like to get fitter." names "like" and "fitter". Older: "No problems with running or lifting." excludes Harder, Longer and Strength sessions; "Can't run, can't jump, can lift." excludes Strength. The fix: carry only into a bare list or a sentence with a pain or verdict word; "no problems/issues with" is a release; a positive "can <verb>" ends a can't scope; aimConflictLine quotes the user's clause. | done (R3): the "Sprained ankle" line is gone, "Knee injury. I'd like to get fitter." and "No problems with running or lifting." exclude nothing, and "can lift" keeps lifting. The aim-conflict line quoting the user's clause is the lead's decision 6 (R3 and R5, §19.5). A wrong pre-tick is one tap to change |
| 5 | minor | The docs after the parser item | lane 0, lead | rev4's known misses, the old-pin citations and the old K counts, and §18.1–§18.4; capture.md:796. | done: §18.1–§18.5 here, and roadmap-rev4.md (decision 55, F-R4-17, F-R4-22, F-R4-25, Constants, Acceptance, question 18); brought up to the safety-gaps round too (decision 56, §19.7), and to the follow-up rulings (decision 57, the live pin 25b08ff5…). capture.md:796 is the lead's |
| 6 | minor | pin.json | lead | Review df51f44f… (append-only, proven) and cite it. | superseded twice: re-blessed append-only to 6a7ed5cd…, then to 25b08ff54d41059d…, the live pin (§19.9), cited in roadmap-rev4.md Constants and F-R4-22; the review is open |
| 7 | minor | PROGRESS.md and the gap residual | lead | State one-source 25 of 41 (60.98%) and several-sources 0 of 1,958 before any gap flag flips. Latent. | open |
| 8 | minor | ui-audit in a browser | lead | `npm run ui:audit` at 344, 375, 932, 1440, 768 and 1366; rule whether 410 bounds the section or the box. | open |
| 9 | minor | The bar's week-quests view | R4 | hostileWeekQuestsOf still takes each card's v0 from liveCountOfKey, so for an `rc` key it counts retry entries, unlike startCountsOf and R6. Use startCountsOf and v0ByKeyOf. Test-only. | done (R4), and confirmed: `v0ByKeyOf(startCountsOf(ctx, d.measures))` |

## 19. Constraint safety: confirm to unlock (lane 0, first and alone)

**The lead's decision (fixed).** Constraint safety must not depend on the parser catching every phrasing, and, since the safety-gaps round, not on the cue detector either. The second verifier (§18.5, after the hardening round) showed why the parser can't carry it: 19 of 40 fresh BODY injury and avoidance phrasings excluded nothing. The third verifier (`ver.still_open`, after §19's first version) showed why the detector can't: with the Constraints box empty, 8 aims it didn't read ("Run 10K after ACL reconstruction", "Train for a 5K despite MS") left the gate off and the starter placed a longer session and a performance check.

**The rule, "confirm to unlock", as the safety-gaps round left it** (the lead's decisions 1–8):
- **Every BODY or CARE plan asks once, whatever the user wrote**: cue or not, constraints empty or not. A **CRAFT** plan asks the same way when any of the user's texts carries a cue or can't be read (wrist RSI, voice strain). A Field Area (knowledge practice) and DUTY never ask.
- Until the user answers the activity card under their current words, every plan path places only the track's **safe** kinds for its practice and the activity itself. The plan paths are the code-built starter and stage ladder, the Gemini keys-only plan, re-plans, Start and the week quests.
  - The safe kinds: easy, mobility and technique sessions on BODY; planning the week and keeping a log on CARE (decision 2, so a waiting CARE plan is never empty); the technique session on CRAFT.
- **Answering takes an explicit act**: tick what to avoid and Save, or tap "Nothing to avoid". An unticked row is never taken as fine by itself, so Save with nothing ticked unlocks nothing; the card offers "Nothing to avoid" for that.
- **The answer carries the key of the words it was given against.** The server refuses it when the words changed meanwhile, and the card asks again (decision 3). A changed text asks again on its own; an AVOID stands.
- **The parser's reading only suggests**: a pre-ticked box with the user's own sentence quoted. It never blocks and never unlocks anything (decision 7). "Take it easy" no longer blocks Easy session; "No timed practice" on a Field plan is a suggestion, not a block.
- A short aim in another language is unparseable, so it counts as a cue (decision 8). This matters on CRAFT and for the card's words; BODY and CARE ask anyway.
- The answer is the user's own decision (YOURS). It is stored on the roadmap, stays editable, and every later plan path honours it.

Lane 0 wrote the contract and every pure part. §19.0–§19.7 describe it as it stands now; §19.8 records what the safety-gaps round changed and where each of the verifier's open items went. The plan paths' adoption is handed off (§19.5), and each handoff is a PENDING line.

### 19.0 State of the tree after lane 0 (the safety-gaps round)

- **Files:**
  - roadmap-types.ts, the last section: the detector's new vocabularies and word test, the card's answer (`ActivityCardAnswer`), the stored answer (`ActivityConfirm.answered`), and the gate's and the view's new fields. The header index too. Nothing was removed or renamed; `ActivityAnswer` stays, marked as the earlier per-kind form.
  - roadmap-catalog.ts: `safe` on PLAN_AHEAD and KEEP_A_LOG, and the gate section rewritten: the tracks that ask, `cueSafeKindsOf`, `activityAsksOn`, `answerActivityCard`, the refusals, `withActivityPointer`. `answerActivities` stays as a deprecated wrapper.
  - roadmap-contract-check.ts: the §19 cases rewritten, and the PENDING lines.
  - This section.
- **No schema change and no migration.** The answers still live in the Roadmap.coverage JSON (§19.3); the card's answer is one more member of the same value.
- **Every caller of the gate changed behaviour without an edit** (the gate is the contract). Each is named in §19.5 under its owner:
  - BODY and CARE ask on any words;
  - CRAFT asks on a cue;
  - CARE places its two safe kinds meanwhile;
  - a suggestion (WORDS) is placed;
  - a stored per-kind FINE no longer unlocks;
  - the deprecated per-kind answer refuses a list with no AVOID.
- **Gates** (DATABASE_URL and DIRECT_URL pointed at a closed port, no model key):
  - `npx tsc --noEmit -p .` is clean, and eslint is clean on the three code files.
  - **roadmap-contract-check** passes **489, with 0 failed and 4 PENDING** (§19.5). `--strict`, and with it `npm run life:check`, fails until the owners land them.
  - roadmap-model-check 932, roadmap-quests-check 334, roadmap-measures-check 366, roadmap-invite-check 57 and today-ui-check `--strict` 740 pass with 0 failed. roadmap-hostile-check passes 54 of 54; the pin is unchanged (6a7ed5cd…), because the corpus carries catalog keys, not the gate. *(R3's suggest item re-blessed it later in the round, append-only, to 25b08ff5…, the live pin, §19.9.)*
  - **Three owners' checks now fail on the lead's rules**, as expected, until the owners adopt them (§19.5):
    - roadmap-realism-check (R2): 332 passed, 8 failed. The failures are BODY with no constraints now asking, CARE placing its safe kinds, and FINE answers given per kind.
    - roadmap-server-check (R4): 5 failed, then it stops at its fixture's per-kind FINE answers, which are now refused (`ACTIVITY_NOTHING_TICKED`).
    - roadmap-ui-check (R5): 801 passed, 9 failed. The failures are the summary, the stale row, the picker, the intake card and CARE's line.

### 19.1 The rule, exactly

Per kind on the plan's catalog track, in CATALOG order (`allowedKindsFor`, §19.4):

| The kind is… | The card isn't answered under the current words | The card is answered under the current words, listed the kind, and the user didn't tick it | The user ticked it (AVOID) |
|---|---|---|---|
| gated (the gate is on and the kind is in `cueGatedKindsOf(track)`) | PENDING: not placed. A suggestion pre-ticks its box. | FINE: placed | AVOID: not placed |
| suggested (the parser's reading names it), not gated | WORDS: placed, its box pre-ticked | FINE: placed | AVOID: not placed |
| neither | placed, no row | placed | AVOID: not placed, on every track |

- **When the gate is on** (`activityAsksOn`):
  - always on BODY and CARE (`ACTIVITY_ALWAYS_ASK_TRACKS`);
  - on CRAFT when `cueReadingOf(texts).hasCue`, over the constraints, the aim and the notes (`ACTIVITY_CUE_ASK_TRACKS`);
  - never on FIELD (a Field Area, whatever its life track) or DUTY.

  A suggestion never turns it on, and the Constraints box being non-empty no longer matters: BODY and CARE ask anyway.
- **The card's answer** (`ActivityCardAnswer {key, avoid, nothingToAvoid}`) is an explicit act:
  - at least one tick (a pre-ticked suggestion left ticked counts), or "Nothing to avoid" with no tick;
  - Save with nothing ticked is refused (`ACTIVITY_NOTHING_TICKED`);
  - a key other than the card's current one is refused (`ACTIVITY_ANSWER_STALE`). The key is the track's and the words' (`cueKeyOf(texts, track)`, §19.11), so an answer given on one track never answers another's card.
- **What it unlocks.** The answer releases only the kinds the card listed when the user answered (`answered.asked`). A gated kind the card didn't list waits, even under the same words: an exam added later, practices turned on, a type added to the catalog.
- **The release is per card (the lead's ruling, §19.11).** A Save with at least one tick is the user's answer for every row the card listed: each listed row left unticked is placed. "Nothing to avoid" stays hidden while any box is ticked, and ticks sent with it are refused.
- **Staleness.** When any of the user's texts changes, the card asks again. Each kind its earlier answer on this track released shows that answer's day (`staleDay`), and every AVOID stands. When the track changes, the card asks again, with no stale day when the earlier answer listed a kind this track doesn't have (§19.11); an AVOID stands on every track.
- **No per-kind FINE is ever read or written.** A FINE stored by the earlier per-kind card may have been a row the user left unticked, so `activityConfirmOf` drops it.
- **Safe kinds are never gated.** A safe kind is blocked only by the user's AVOID. A Field kind is too.
- **The view's rows** apply the plan's exam and practice filters: no Mock test row without an exam, and no practice rows with practices off. `blocked` still holds every blocked kind, so a hidden gated kind is never placed by accident; it stays PENDING and unlisted.

### 19.2 The cue detector (roadmap-types; pure, high recall, no meaning)

```ts
constraintCuesOf(text: string | null | undefined, source: CueSource = "CONSTRAINTS"): CueReading
  // CueReading = { hasCue: boolean; cues: CueSpan[]; unparseable: boolean }
  // CueSpan    = { source, note?, cls: CueClass, cue, quote, start, end, clause }
cueReadingOf(texts: CueTexts): CueReading          // over constraints, aim and notes, each cue tagged with its source
cueTextsOf(intake): CueTexts                       // constraints, aim, notes = [examLabel, typicalHoursSource, syllabus.source, ...syllabus.lines]
cueKeyOf(texts: CueTexts, track: CatalogTrack): string   // "k2-" + FNV-1a hex over the track and the texts; case and spacing ignored (§19.11)
cueLegacyKeyOf(texts: CueTexts): string            // "k1-" + FNV-1a hex over the texts alone: the key stored before §19.11; read only
userClauseOf(text, needle, max = ACTIVITY_REASON_MAX): string
```

**What it is for now.** On BODY and CARE the detector no longer decides anything: the gate asks whatever it reads, and the detector only chooses the sentences the card quotes. On CRAFT it decides whether the card asks. A false cue costs one tap; a missed one on CRAFT costs a question not asked.

**What it reads.** Words, normalised: lower case, no accents, no apostrophes ("can't" reads as "cant"), and a hyphen splits words ("no-go" reads as "no go"). Matching is exact on whole-word runs, and a final "*" is a prefix. These are cues:
- **Anywhere:**
  - `CUE_INJURY_WORDS`, `CUE_PAIN_WORDS`, `CUE_HEALTH_WORDS` and `CUE_AVOID_WORDS`. This round adds:
    - operations and breaks ("reconstruction", "breaking my", "a fall");
    - craft and voice words ("rsi", "carpal tunnel", "tennis elbow", "dystonia", "hoarse", "tinnitus");
    - conditions an aim names with no pain word ("post stroke", "twins", "dvt", "pneumon*", "fibromyalg*", "scolios*", "retina*");
    - "despite", and the hardening round's K phrasings ("ruled out", "bad idea", "is a problem", "kill me", "hard on").
  - `CUE_FOREIGN_WORDS` (16 languages written without accents) and `CUE_FOREIGN_INFIXES` (pain roots inside a compound, as in "Knieschmerzen").
  - **New:** `CUE_BODY_PARTS_MEDICAL`, the injury sites, bare and the aim included: "ACL", "rotator cuff", "labrum", "Achilles", "spinal". The everyday joints ("hip", "knee") stay bare in the constraints and notes only, where the aim uses them for the exercise ("Hip thrust 100kg").
  - **New:** a joint-type part before a `CUE_JOINT_PROCEDURES` word ("knee scope", "ankle fusion", "collarbone break"). "Repair furniture" and "bike repair" raise nothing, because the rule needs the joint.
  - **New:** a `CUE_ACRONYMS` condition as written in capitals ("despite MS", "I have POTS", "a TIA"). It is not read in lower case ("Throw 10 pots"), nor in a text whose other words are mostly capitals ("THROW 10 POTS").
  - **New:** a word ending in a `CUE_MEDICAL_SUFFIXES` ending, three or more letters before it: "meniscectomy", "arthroscopy", "angioplasty", "bursitis", "fibromyalgia", "neuropathy". `CUE_SUFFIX_GUARD` keeps out "dichotomy", "nostalgia" and "microscopy".
  - an adjective from `CUE_BODY_ADJECTIVES` before a body part, with up to two `CUE_BODY_FILLERS` between ("bad left knee", and now "detached retina");
  - a body part before a `CUE_PART_TROUBLE` word ("back problems");
  - a joint-type part (`CUE_BODY_PARTS`) after a `CUE_POSSESSIVES` word ("my knee", "Mum's hip");
  - a one-letter slip of a `CUE_FUZZY_WORDS` word ("injry", "surgury", "pregant"), unless the word is in `CUE_FUZZY_GUARD`.
- **In the constraints and notes only, never the aim:** `CUE_CONSTRAINT_ONLY_WORDS` (only, off, max, light, easy …), the bare joint-type parts, and any part after a possessive ("my back").
- **Never a cue:** a `CUE_BENIGN_PHRASES` goal phrasing ("without stopping", "heart rate", "recovery runs"), and "ill" from "I'll".

Negation is not read: "no injuries" is a cue. A cue is a reason to ask, never a verdict on what the user can do. A cue inside a longer one of its class is folded into it.

**Unparseable** counts as a cue. A text is unparseable when it holds any of these:
- a letter outside the Latin script;
- under LANGUAGE_ASCII_MIN of its letters in plain ASCII;
- an emoji;
- **the word test (decision 8):** words, none of them English, once `CUE_LOAN_WORDS` and numbers are set aside:
  - loan words are shared by many languages: "marathon", "km", "yoga", "tennis", "piano";
  - a number is a token that starts with a digit: "10K", "5km".

  In the aim and the constraints one such word is enough: "Correr 10K", "Lari 10K", "Chay 10km", "Hardlopen 10 km", "Biegać 5 km", "Einen Marathon laufen", "Abends". In a note it takes `CUE_LANGUAGE_MIN_WORDS` (3), because an exam's name or an outline line is naturally short ("SOA Exam P", "Arpeggios"). A word counts as English when:
  - it is in ENGLISH_FUNCTION_WORDS, `CUE_ENGLISH_WORDS` or an English cue vocabulary;
  - it starts with a stem of four or more letters from one of those vocabularies ("recovery");
  - or it has `CUE_ENGLISH_ING_MIN` (8) or more letters and ends in "ing" ("Powerlifting"). A shorter "-ing" word may be another language's ("pusing").

  A text of loan words alone ("Marathon", "Yoga") is readable.

A text past `CUE_TEXT_MAX` (4,000 characters) is also unparseable.

**Quoting.** Every `quote` is `text.slice(start, end)`. Every `clause` is the sentence holding it, verbatim, cut at word edges with "…" within `ACTIVITY_REASON_MAX` (120). `userClauseOf` finds a word case-insensitively, or failing that a stem's first four letters at a word start.

**Measured** (scratch probes, plus the goldens):
- All 24 of the third verifier's aim-only misses raise a quoted cue in the aim.
- Over the hostile corpus's K constraints, 2,903 of 2,909 raise a cue. The 6 that don't are K's deliberately cue-less CARE lines, and CARE asks anyway.
- K's 11 aims raise 0 cues. So do the goldens' controls: 16 everyday BODY and CARE aims, 9 craft aims ("Repair furniture", "Throw 10 pots on the wheel") and 5 one-word body aims ("Powerlifting", "Marathon").
- All 7 short foreign aims in the goldens read as unparseable.

### 19.3 The stored confirmation (YOURS)

```ts
interface ActivityCardAnswer { key: string; avoid: CatalogKey[]; nothingToAvoid: boolean }   // what the card sends; no reason is ever sent
interface ActivityCardAnswered { day: DayKey; asked: CatalogKey[]; none: boolean }           // the card's answer as stored
interface ActivityConfirmEntry { verdict: ActivityVerdict; day: DayKey; reason: string }     // only AVOID is written
interface ActivityConfirm { key: string; kinds: Partial<Record<CatalogKey, ActivityConfirmEntry>>; answered?: ActivityCardAnswered | null }
type ActivityVerdict = "AVOID" | "FINE"    // FINE: the earlier card's word, kept for old rows and callers; never written, never read
interface ActivityAnswer { kind: CatalogKey; verdict: ActivityVerdict | null }   // deprecated per-kind form (answerActivities)
Intake.activities?: ActivityConfirm | null
```

- **Where it is stored:** `Roadmap.coverage[ACTIVITY_CONFIRM_KEY]` ("$activities"). No column, as before. A Domain id is a cuid, so the key never collides with one. intakeOf's coverage read keeps numbers only, and saveIntake's coverage input keeps chosen Domain ids only.
- **The writer and the reader:**
  - `coverageJsonOf(coverage, confirm)` is the one writer. It keeps the figures, drops a "$activities" or "__proto__" figure, and adds the answers when the card was answered or any kind is avoided. "Nothing to avoid" is stored with no AVOID. It gives null when both are empty.
  - `activityConfirmOf(json)` reads back, with own-property reads only:
    - the key;
    - each AVOID on a catalog key with a valid day, its reason cut to 120 characters. A FINE is dropped.
    - the card's answer: a valid day, its catalog keys deduped in CATALOG order, and `none` only when true. An answer with a bad day is dropped, and the AVOIDs stand.
- **`answerActivityCard(prev, state, answer, day)`** gives `RoadmapActionResult<ActivityConfirm>`, pure. Its refusals:
  - `ACTIVITY_ANSWER_REFUSAL` for a malformed answer, an unknown, prototype-named, codeOnly or off-track kind, ticks together with "Nothing to avoid", or a bad day;
  - `ACTIVITY_ANSWER_STALE` when `answer.key !== state.key`: other words, another track, or a "k1-" key;
  - `ACTIVITY_NOTHING_TICKED` for no tick without "Nothing to avoid".

  Otherwise:
  - the ticks replace the card's earlier ones;
  - each ticked kind is an AVOID. An earlier AVOID keeps its first day and reason; a new one gets `day` and `reasonFor`: the suggestion's sentence, else the first cue's sentence, else the constraints' first sentence. Never text the client sends.
  - an AVOID the card didn't list stands (a kind hidden by the practice or exam filter);
  - the card is answered under `state.key` with `asked` = the gate's rows and the ticks, and `none` = nothingToAvoid. Kinds are in CATALOG order.
- **`answerActivities(prev, state, answers, day)`, deprecated.** It is kept so R4's and R5's current code still runs. It reads each per-kind answer as a tick: AVOID ticks the box, FINE or null unticks it, and the stored AVOIDs on the card's rows are the ticks before. It then calls `answerActivityCard` under the server's current key, because it carries none. So a list of FINEs alone is refused (`ACTIVITY_NOTHING_TICKED`), and the earlier one-tap unlock is gone. It refuses as before (`ACTIVITY_ANSWER_REFUSAL`).

### 19.4 The gate (roadmap-catalog)

| Export | What it is |
|---|---|
| `CatalogEntry.safe?: true` | Marked on EASY_SESSION, MOBILITY_SESSION, TECHNIQUE_SESSION, PLAN_AHEAD and KEEP_A_LOG. A code word only: no copy calls a session safe. |
| `CUE_SAFE_KINDS`, `isCueSafeKind(key)`, `cueSafeKindsOf(track)` | The marked kinds, in CATALOG order, and the ones on a track. BODY gives BODY_SAFE_KINDS (a golden pins them equal), CARE gives PLAN_AHEAD and KEEP_A_LOG, CRAFT gives TECHNIQUE_SESSION, FIELD gives []. |
| `ACTIVITY_ALWAYS_ASK_TRACKS`, `ACTIVITY_CUE_ASK_TRACKS`, `CUE_GATED_TRACKS` | `["BODY", "CARE"]`, `["CRAFT"]`, and their union in CATALOG_TRACKS order: `["CRAFT", "BODY", "CARE"]`. |
| `ACTIVITY_ITSELF_KINDS` | `["FULL_ATTEMPT", "PERFORMANCE_CHECK", "MOCK_TEST"]`. SET_UP and BOOK_EXAM name preparation and stay ungated; EXAM_DAY is the user's own date. |
| `cueGatedKindsOf(track)` | Every practice on the track that is not safe, plus the three activity-itself kinds. BODY: HARDER_SESSION, LONGER_SESSION, STRENGTH_SESSION. CARE: SET_TIME, CHECK_IN, ADMIN_SESSION. CRAFT: SLOW_DRILLS, RUN_THROUGHS, WITH_A_PARTNER. FIELD and DUTY: []. |
| `activityAsksOn(state)` | Whether the gate is on (§19.1). |
| `constraintsStateOf({track, texts, exam?, practicesAllowed?, exclusions?})`, `constraintsStateOfIntake(intake, exclusions?)` | The gate's input (`ConstraintsState`): the reading, the key, `stated` (now only for the quotes), and the parser's exclusions as suggestions (`ActivityPrefill`, one per kind on the track, with the user's sentence). |
| **`allowedKindsFor(state, confirmation)`** | **The one gate.** It gives `ActivityGate`: `on`, `track`, `key`, `answered` (the day, or null), `none`, `staleDay`, and `allowed`, `blocked`, `pending` and `rows`, all in CATALOG order. `allowed` and `blocked` split the track's kinds; `blocked` is PENDING and AVOID only. Pass `blocked` as `excluded`. |
| `activityGateOf(intake, exclusions?)` | `allowedKindsFor(constraintsStateOfIntake(…), intake.activities)`. |
| `isPlaceableKind(gate, key)` | False only for a blocked catalog type. An item with no type (the user's own words) is placeable, and so is a suggestion. |
| `activityConfirmViewOf(state, gate)` | The view field (`ActivityConfirmView`), described below. |
| `answerActivityCard`, `answerActivities` (deprecated), `activityConfirmOf`, `coverageJsonOf` | §19.3. |
| `ACTIVITY_CARD_NAME`, `ACTIVITY_NOTHING_TO_AVOID` | "Activities to avoid" (the card's name, as the refusals point at it) and "Nothing to avoid" (the all-clear's words). |
| `ACTIVITY_ANSWER_REFUSAL`, `ACTIVITY_NOTHING_TICKED`, `ACTIVITY_ANSWER_STALE` | The answer's refusals (§19.3). ACTIVITY_NOTHING_TICKED names "Nothing to avoid". |
| `ACTIVITY_PENDING_POINTER`, `withActivityPointer(gate, message)` | Decision 2: any refusal while the card waits points at it. The message gains "Some session types wait on your answer in “Activities to avoid”." when the gate is on with rows pending. Otherwise it is unchanged, and the pointer is never added twice. |

`ActivityConfirmView` holds:
- `on`, `track`, `key` (the answer carries it back) and `unparseable`;
- `quotes`: up to `CUE_QUOTES_MAX` (3) of the user's sentences. In order: the cue clauses (constraints first, then the aim and the notes); else the constraints' first sentence; else the first unreadable text's first sentence; else, on a card of suggestions only, the suggestions' sentences. It may be empty on BODY or CARE, which ask whatever the words say.
- `rows` (`ActivityRow`): `kind`, `state`, `gated`, `prefill`, `reason`, `day`, `staleDay`, and `cls`. `prefill` is "AVOID" on an unanswered suggested row, PENDING or WORDS. `cls` is YOURS on AVOID and FINE.
- `pending` (the count), `answered` (the day, or null), `none`, `staleDay`;
- `safeKinds`: what the plan places meanwhile (`cueSafeKindsOf`), or [] while off.

**The goldens pin:**
- BODY and CARE ask on every kind of text: empty, plain, cue-less constraints, a cue, unreadable text, an aim-only cue, a short foreign aim. No gated kind is placed unanswered.
- CARE places its two safe kinds meanwhile.
- CRAFT is off on a plain aim, and on with a cue in the constraints, the aim or a note, or with a foreign aim.
- DUTY never asks. A Field plan's "No timed practice" is a WORDS suggestion and blocks nothing, and "take it easy" never blocks Easy session.
- The answer:
  - Save with nothing ticked is refused, and so is the stale key;
  - the malformed cases are refused;
  - ticks store AVOIDs and the card's answer, with no FINE written;
  - a second answer replaces the ticks and keeps the first day;
  - "Nothing to avoid" clears the card's ticks, while an unlisted AVOID stands;
  - an unlisted gated kind waits;
  - a stored per-kind FINE is never read;
  - a suggestion left ticked is the user's AVOID;
  - the deprecated wrapper refuses FINEs alone.
- After the words change, the card asks again with the stale day, and an old-key answer is refused.
- The view's fields, quotes and safe kinds, and `withActivityPointer`.
- A property over 6 cases (BODY and CARE with and without words, CRAFT with a cue, FIELD) × 64 suggestion sets × 4 answers:
  - a suggestion never moves a kind;
  - a gated kind is placed only under a current answer that listed it, and never when avoided;
  - a safe kind and a Field kind are blocked only by the user's AVOID.
- The storage round trip, including "Nothing to avoid" and hostile JSON.

### 19.5 Handoffs, by owner (each is a PENDING line in roadmap-contract-check unless marked)

`roadmap-contract-check` (run alone): **489 passed, 0 failed, 4 PENDING.** The three earlier lines that still hold pass (R4's intakeOf/intakeData and gate lines, R2, R6, R5's card). R4's answer line is rewritten. R3's enum line and two new lines wait. *(All four landed in the safety-gaps round: 493 passed, 0 PENDING. The follow-up round brought it to 505, §19.9.)*

- **R4, roadmap-server.ts and the actions:**
  - **PENDING:** `setActivityVerdictsCore` answers through `answerActivityCard`, never `answerActivities`. The action `setActivityVerdicts(roadmapId, answer: ActivityCardAnswer)` passes the key, and the action cleans the shape (a string key, an array of strings, a boolean). A stale key returns `ACTIVITY_ANSWER_STALE` as the refusal, so the page re-reads and the card asks again (decision 3; the verifier's S12).
  - **PENDING:** a refusal while the card waits goes through `withActivityPointer(gate, message)`: accept's blockers, `ACTIVITY_WAITING_START`, and a pick's `ACTIVITY_WAITING_PICK` (decision 2; S6's "No measurable part…" points at the card). The existing server copy still says "Which activities are fine?". It should name `ACTIVITY_CARD_NAME` and the act ("say what to avoid"), not "fine".
  - Behaviour to re-check, which arrives without an edit:
    - BODY and CARE plans with empty constraints now hold the gated kinds;
    - `DraftView.exclusions` (leftOutOf) no longer lists WORDS kinds, since they are placed;
    - the session-picks confirm's EASY reads `BODY_SAFE_KINDS` (unchanged).
  - The fixture's per-kind FINE answers in roadmap-server-check must become card answers.
  - **Decisions 4 and 5 (no PENDING line; their own items):**
    - An AVOID given after Start pauses the started practice's Today template through the existing archive or pause path, with a quiet notice and an undo. `setActivityVerdictsCore` knows the kinds that moved (before.gate against after). *(Since ruling (2) the path is the safety pause, `pauseForSafetyCore` through RoadmapIo `pauseTemplate`, §19.12.)*
    - A kept Gemini pick or the user's own row of a kind the gate now blocks is held. `gatePlanRows` keeps YOURS rows of a PENDING kind, and `acceptBlockersOf` checks plan-placed rows only; both should read `isPlaceableKind` for every live row, so a stale answer re-gates a kept pick.
- **R3, roadmap-evidence.ts and roadmap-validate.ts:**
  - **PENDING (unchanged):** the run's enums take `excluded = activityGateOf(intake, exclusions).blocked`. That is PENDING and AVOID only; a suggestion stays in the enum (decision 7).
  - No PENDING line: the parser's over-reaches are now suggestions, not blocks. Pre-ticks still carry them: "take it easy", generic stems ("practice", "set", "study"), frequency limits ("more than twice a week"), and a body sentence naming a Field kind.
  - Decision 6 (the aim-conflict line quotes the user's own sentence and shows only while unresolved) is R3's `aimConflictOf` with R5's line.
- **R2, roadmap-realism.ts** (its PENDING line passes): `trackStarterKindsOf` reads `CUE_SAFE_KINDS` on the track, so CARE now places PLAN_AHEAD and KEEP_A_LOG and CRAFT the technique session. Nothing else to adopt. roadmap-realism-check's 8 failures are the lead's rules: BODY with no constraints asks, CARE is not empty, and FINE is no longer per kind.
- **R6, the week quests** (its PENDING line passes): `questGateOf` reads the gate; no change.
- **R5, the UI and the copy:**
  - **PENDING:** the card sends the card's answer, and four things are pinned:
    - roadmap-ui-model exports `activityCardAnswerOf(view, avoid): ActivityCardAnswer | null`, with the view's key, null when nothing is ticked, and Save disabled or pointing at the all-clear;
    - a component offers "Nothing to avoid" (`ACTIVITY_NOTHING_TO_AVOID`), which sends `{key, avoid: [], nothingToAvoid: true}`;
    - `activityAnswersOf`, which sent FINE for every unticked row, is gone;
    - no copy says "You said fine". A FINE row is the card's answer, not the user's word. The summary names the answer instead: "You said to avoid: Strength session (5 Oct)", or "You said there's nothing to avoid (5 Oct)", using `view.answered` and `view.none`.
  - **Not pinned:**
    - The card shows on every BODY and CARE plan. With no quote, the lead line asks without "Your words mention": "Before the plan adds harder sessions, say what to avoid."
    - The stale line uses `view.staleDay`: "You answered on 3 Oct, before your words changed."
    - `activityPendingLine` names CARE's two safe kinds ("Planning the week and a log only until you answer"). The CARE "no care sessions" branch is gone.
    - A WORDS row is a suggestion: "From your words: '…'", pre-ticked, not "Left out".
    - The type picker leaves out PENDING and AVOID kinds only (`activityBlockedOf` and `pickerExcludedOf` now also drop WORDS kinds).
    - The intake card keeps the `ActivityCardAnswer` it confirmed with `keyNow` and sends it after the save. A refused stale key asks again on the draft.
    - Decision 6: the aim-conflict line quotes the user's sentence ("You wrote: '…'") and shows only while the conflict is unresolved.
- **R7, the bar** (recommendations, no PENDING line):
  - an aim-only K sub-class asserting `allowedKindsFor(…, null)` blocks every gated kind on BODY and CARE, which it now does by rule;
  - a CRAFT sub-class with craft cues ("RSI", "voice strain") asserting the gate is on;
  - an aims control set counting false cues and false "unparseable" readings.

### 19.6 Deviations and open points for the lead

1. **The release is the card's, not per kind.** *(Ruled by the lead in the follow-up round, §19.11: the release is per card, as built; "Nothing to avoid" stays hidden while any box is ticked.)* "Unticked rows are never implicitly FINE" is kept literally: no FINE is ever written. A ticked Save or "Nothing to avoid" answers the card, and the kinds it listed and the user left unticked are placed (state FINE, `cls` YOURS, the answer's day). A gated kind the card didn't list waits. If you want each row answered on its own, `answered.asked` becomes the rows given an explicit "fine"; the gate already reads it per kind.
2. **"Nothing to avoid" clears the card's earlier ticks.** It is an explicit all-clear over the rows shown. An AVOID on a kind the card hid (practices off, no exam) stands. R5 may want "Nothing to avoid" offered only while nothing is ticked. *(Ruled with #1 in the follow-up round: "Nothing to avoid" stays hidden while any box is ticked, as R5 built it.)*
3. **CRAFT's gated kinds are every non-safe CRAFT practice** (slow drills, run-throughs, practice with a teacher or partner) plus the activity itself. The technique session stays safe on CRAFT, as on BODY. Practice with a teacher could be read as safe; it is gated here on the safe side.
4. **CRAFT asks on any cue, and the avoidance words are many** ("no", "don't", "only" in the constraints). Most CRAFT plans whose constraints hold a limit will ask once. An outline line of three foreign words also counts ("Clair de Lune" as a syllabus line, not "Play Clair de Lune" as the aim). Each costs one tap.
5. **The short-text rule reads "English" from a list.** A one-word English aim the lists lack and that isn't a long "-ing" word reads as unparseable. On BODY and CARE that only adds the "couldn't be read" line; on CRAFT it asks once. The lists cover the common body and craft aims; the bar's control set (R7) should measure the rest.
6. **The per-kind API is kept, deprecated.** Removing it would break tsc in R4's and R5's files before they adopt. `answerActivities` maps the old Save onto the card: one AVOID answers it, FINEs alone are refused. It carries no key, so decision 3 holds only once R4 and R5 adopt `ActivityCardAnswer`.
7. **`ActivityConfirm.key` now means the card's words.** An AVOID still stands across keys. The key is unchanged as `cueKeyOf` over the constraints, aim and notes, so a stored row from the first version reads as before, minus its FINEs: its card asks again. *(Superseded in the follow-up round, §19.11: the key is now the track's and the words', "k2-"; a "k1-" answer still holds under the same words only where the kinds it listed prove the track.)*
8. **No schema change.** As in the first version (§19.3).

### 19.7 What §19 leaves open, and where the spec records it (docs lane)

**Where roadmap-rev4.md records §19:** decisions 55, 56 and 57 (57.1 to 57.4, the lead's rulings since; §19.11 to §19.13) and F-R4-25, "As shipped", F-R4-17, F-R4-18 (`safe`), F-R4-22 (the pin), Constants, Names ("Activities to avoid" and "Nothing to avoid"), Migration (the "$activities" key), Lanes, Acceptance, and questions 11 and 18. The docs lane brought each up to the safety-gaps round after lane 0:
- **Decision 56** records the lead's eight decisions as 56.1 to 56.8 (this section's decisions 1 to 8), with the verifier's findings as its reason; decision 55 keeps its text, marked where 56 revises it.
- **The rule:** every BODY or CARE plan asks once, CRAFT asks on a cue, and Field and DUTY never ask.
- **The answer:** ticks and Save, or "Nothing to avoid", carrying the words' key; no "Fine" is written.
- **The parser suggests;** the known misses and over-reach are pre-tick quality only.
- **CARE's two safe kinds,** in F-R4-18 and Constants.
- **Names:** "Fine" is no longer a user answer, and "You said fine" is banned copy.
- **"As shipped"** gains a third still-open table, the third verifier's twelve items, beside the earlier two, whose statuses now give the owners' reports.

PROGRESS.md is the lead's, and the docs lane didn't edit it.

**Open points §19.5 doesn't name:**
1. **The production monitor** (unchanged): no rm: practice task created after the deploy on a BODY or CARE roadmap has a gated catalog kind unless that roadmap's `coverage->'$activities'->'answered'` is present with its key, and the kind is listed in `asked` and not under `kinds`. Expected 0.
2. **Copy words** (unchanged): no "safe", "cleared", "approved" or "risk" in user copy. A golden checks the contract's own strings.
3. **The docs' stale pin** (the third verifier's minor): closed. rev4.md (Constants, F-R4-22, Acceptance) and §18.2–§18.5 now cite the live pin, 6a7ed5cd…, with K 2,909 and X 2,010 (§19.9), and mark df51f44f… as the hardening round's. Lane 0's §19 work didn't move the pin. *(Superseded the same day: R3's suggest item re-blessed it to 25b08ff5…, with K 3,007 and X 2,103. The docs cite that pin since the follow-up round, and §19.9 since the minors round.)*

### 19.8 The safety-gaps round: what changed, and the verifier's open items

**Changed from §19's first version:**
- The gate is on for every BODY and CARE plan, and for CRAFT on a cue. Before, it was BODY and CARE only, with constraints, a cue or a gated pre-fill.
- The release is the card's answer, carrying the key. Before, a FINE was stored per kind.
- A pre-fill is a suggestion. Before, WORDS blocked until a FINE.
- PLAN_AHEAD and KEEP_A_LOG are safe.
- The detector gains the vocabularies and the word test in §19.2.
- The view and the gate gain `key`, `answered`, `none` and `staleDay`.
- New exports: `ActivityCardAnswer`, `ActivityCardAnswered`, `cueSafeKindsOf`, the two track lists, `activityAsksOn`, `answerActivityCard`, `ACTIVITY_NOTHING_TICKED`, `ACTIVITY_ANSWER_STALE`, `ACTIVITY_NOTHING_TO_AVOID`, `ACTIVITY_CARD_NAME`, `ACTIVITY_PENDING_POINTER`, `withActivityPointer`, and the detector lists `CUE_BODY_PARTS_MEDICAL`, `CUE_JOINT_PROCEDURES`, `CUE_ACRONYMS`, `CUE_MEDICAL_SUFFIXES`, `CUE_SUFFIX_GUARD`, `CUE_LOAN_WORDS` and `CUE_ENGLISH_ING_MIN`.
- Changed meaning: `ActivityRowState` FINE and WORDS (§19.1), `ActivityGate.blocked` (no WORDS), `ActivityPrefill` (a suggestion), `CUE_GATED_TRACKS` (CRAFT joins), `cueGatedKindsOf("CARE")` (PLAN_AHEAD and KEEP_A_LOG leave it), and `ACTIVITY_ANSWER_REFUSAL`'s words.

**The third verifier's `ver.still_open`, item by item** (it ran every gate on §19's first version, then probed 195 cases through the pure gate, 121 through the real server plan paths with a hostile Gemini reply, and lifecycle scenarios S1 to S12; not one avoided kind appeared on any path). Lane 0 wrote the column when it handed off. Every row has been closed or done since, as roadmap-rev4.md's "Still open after confirm to unlock" table records; §19.9 gives the check chain's state:

| # | Item | Where it stands |
|---|---|---|
| 1 | Safety rested on the detector reading the aim (8 unconfirmed placements) | Closed by rule: BODY and CARE ask whatever the words. The detector also reads all 24 listed aims now. |
| 2 | roadmap-evidence.ts enums (R3) | Still PENDING, R3 (§19.5). |
| 3 | The answer carries no key (S12) | Contract done (`ActivityCardAnswer.key`, `ACTIVITY_ANSWER_STALE`). R4 and R5 PENDING. |
| 4 | An AVOID after Start leaves the task live (S7) | Decision 4: R4's item (§19.5, no line here). |
| 5 | Kept picks outlive a stale FINE (S1) | Decision 5: R4's item (§19.5). The gate blocks the kind when the answer is stale. |
| 6 | The aim-conflict line puts "no X" in the user's mouth (S3) | Decision 6: R3 and R5 (§19.5). |
| 7 | CARE was a dead end (S6, C5) | Contract done: PLAN_AHEAD and KEEP_A_LOG are safe, and `withActivityPointer` exists. R4 PENDING for the refusals. |
| 8 | Pre-fill over-exclusions blocked kinds | Closed by rule: a suggestion never blocks. The pre-ticks are R3's to sharpen. |
| 9 | Short foreign aims raised no cue | Closed: the word test (§19.2). |
| 10 | One tap unlocked everything | Contract done: no tick is refused, and "Nothing to avoid" is the explicit all-clear; the deprecated wrapper refuses FINEs alone. R5 PENDING for the button. |
| 11 | The docs cite a stale pin | Closed by the docs lane: rev4.md and §18 cite 6a7ed5cd… with its history (§19.7, §19.9). *(Overtaken by the re-bless to 25b08ff5…; closed again since, §19.9.)* |
| 12 | CRAFT was never gated | Closed: CRAFT asks on a cue, with its non-safe practices and the activity itself gated. |

### 19.9 The hallucination bar and the check chain now (docs lane)

*(Refreshed in the minors round, after the follow-up round.)* The bar's figures are from roadmap-hostile-check, run alone by the fifth verifier at 16:21 on 5 Oct after the follow-up round (DATABASE_URL pointed at a closed port, no model key; 54 passed, 0 failed), and from scripts/fixtures/roadmap-hostile/pin.json. The ablation is the fourth verifier's run at 15:35 on the same pin; the follow-up round changed no parser rule.

- **The pin** is sha256 **25b08ff54d41059da9ec4ed6747a5811a32e6cc2afbe6151a06e17462cb5f81a**, since R3's suggest item in the safety-gaps round. The lead has not reviewed it yet. Its history, every step append-only after every older case:
  - fix round 2 blessed 0dd9a8be08e4d70b…;
  - the finishing round re-blessed it to 9d542fd58ec62bce…, adding K's release sub-class and 256 over-exclusion lines;
  - the hardening round re-blessed it to df51f44f066e4e7a…, adding K's postfix sub-class (K1821 on) and 379 over-exclusion lines (X1031 to X1409);
  - R3's vocabulary item in §19's first round re-blessed it to 6a7ed5cd92ad9585…, adding K's vocab sub-class (K2292 to K2908, 617 cases) and 600 over-exclusion lines (X1410 to X2009). The corpus without them hashes to df51f44f… exactly;
  - R3's suggest item in the safety-gaps round re-blessed it to 25b08ff5…, adding K's suggest sub-class (K2909 to K3006, 98 cases) and 93 over-exclusion lines (X2010 to X2102). The fifth verifier re-ran the digest proof: the corpus without them hashes to 6a7ed5cd… exactly, and the whole corpus to 25b08ff5…, which matches pin.json. The pack hashes are unchanged.

  Lane 0's §19 rounds, the follow-up round and the probe run itself left it unchanged, because the corpus carries catalog keys, not the gate.

  **Blessing the probe's replies moves it.** Family F reads every blessed probe reply, and 42072fa (committed after the follow-up round) blessed 7 (§19.14). The generator now gives 169 runs and F 707, and hashes to 4c4417efb77ed4719d08eff091fc60f702bbe071e73dd898e1a80ff382751c78. The docs lane recomputed both digests in the minors round: without the blessed replies the corpus still hashes to 25b08ff5… exactly, so the older corpus is unchanged and the change is family F's alone. Until the lead reviews it and re-blesses pin.json with `--bless`, the bar's PIN item fails (53 passed, 1 failed), and with it life:check. Every other item of the bar passes with F at 707.
- **Counts:**
  - 162 runs;
  - A 5,000, B 1,000, C 2,000, D 2,000;
  - E 1,700 replies and 22,231 strings (21,946 claim-bearing, 252 control, 303 clash, 246 one-source);
  - E-G 2,304;
  - **K 3,007** (K_release 274, K_postfix 471, K_vocab 617, K_suggest 98), with **2,103** over-exclusion lines. The confirm-to-unlock round had K 2,909 and 2,010 lines, and the hardening round K 2,292 and 1,410;
  - M 2,200;
  - F 0 on this pin. With the 7 replies blessed in 42072fa it is 707, over 169 runs, which moves the pin (above).
- **The vocab sub-class** (`sub: "vocab"`, seed HOSTILE_SEEDS.K_VOCAB): grammar.ts VOCAB_TEMPLATES, 105 BODY and 8 CARE phrasings written from how people talk, not copied from the lexicon. Each must exclude every kind its terms name and keep every kind only its cleared activities name. FILL_OVER_KEEP lines keep every kind their aim fills, and FILL_OVER_FIELD lines over the Field run's Domain names and aim words join the over-exclusion lines, after every new English BODY phrasing. So two of §18.2's "What K can't see" are answered: recall now measures vocabulary, and the fill is tested both ways. The third remains: K's confirm item reads the session-picks confirm, not §19's gate (§19.5, R7).
- **The suggest sub-class** (`sub: "suggest"`, seed HOSTILE_SEEDS.K_SUGGEST; the safety-gaps round, R3): grammar.ts SUGGEST_TEMPLATES, BODY and CARE phrasings that still exclude one activity and hold another to a limit or name kinds the user never said to avoid. Each must exclude every kind its excluded activity names and keep every kind only the limit ("more than twice a week", "two days in a row"), advice to go gently or a word too general to name a type names ("no running more than twice a week, no jumping": LONGER_SESSION kept). Its English BODY phrasings and FIELD_SUGGEST_LINES (a body sentence, a too-general word or a limit on a Field plan: "No writing by hand, I have RSI in my wrist.") are the 93 new over-exclusion lines.
- **V:** 1,538 words from 15 modules, read without their word lists.
- **H1–H5:** 0 structural exceptions, 0 taint hits and 0 quarantine leaks. H4 has 0 mismatches over 11,700 replies (CLEAN 6,121, SALVAGED 809, REJECTED 4,770). H3 shows 0 of 21,946 claim-bearing gap strings, with control 252 of 252 shown.
- **The E-G residual is unchanged:** several-sources claims 0 of 1,958 shown, one-source claims **25 of 41 shown (60.98%)**. ROADMAP_GAPS_LIVE stays false (decision 51), and the probe returned no real gap string (§19.14).
- **K:**
  - 0 of 2,609 parsed English cases missed (cases: en 2,648, vi 197, ja 162);
  - 0 of 3,007 without the session-picks confirm, 0 of them vacuous;
  - 0 of 2,103 body phrasings excluded a Field kind;
  - 0 of 417 keep cases excluded a kind the user's words keep (274 release and 98 suggest cases in the recall).

  The confirm-to-unlock round's figures were 2,511, 2,909, 2,010 and 320.
- **H6:** **168 rules fire** over 31,845 cases, and all 120 negation cues fire. R3 names 86 of its 189 named rules as required; the bar adds 82. The confirm-to-unlock round had 164.
- **M1–M7:** 0 broken.
- **The budget:** H1–H5 and K take 21.5 s (K 2.3 s), and the whole check 42.6 s. H5's p99 is 26 ms per reply (max 572 ms over 11,700), and 34 ms for the views (2,742 builds).
- **roadmap-hostile-ablate** (a report; 217.6 s, the fourth verifier's run on this pin):
  - every rule off gives 33,285 new failures, including 2,482 K misses, so the bar is not vacuous. The confirm-to-unlock round had 33,251;
  - one rule off at a time:

    | Rule off | Effect |
    |---|---|
    | `constraint.after` | K misses +672 |
    | `constraint.carry` | +65 |
    | `constraint.compound` | +20 |
    | `constraint.body` | +17 |
    | `constraint.release` | K misses +7, cleared kinds excluded +240 |
    | `constraint.limit` | cleared kinds excluded +73 |
    | `constraint.generic` | cleared kinds excluded +7 |
    | `constraint.gentle` | cleared kinds excluded +6 |
    | `constraint.fill` | cleared kinds excluded +4 |
    | `cue.doctor said`, `cue.bad idea`, `cue.never`, `cue.surgery` | +16, +15, +11, +6 |

**The check chain:**
- roadmap-contract-check, run alone: 489 passed and 4 PENDING at 14:44, 492 and 1 PENDING at 15:00, then **493 passed, 0 failed, 0 PENDING** at the end of the safety-gaps round, and **505 passed, 0 failed** after the follow-up round (lane 0's 12 new lines, §19.11).
- **`roadmap-contract:strict` and `npm run life:check` are green.** The fifth verifier's run (16:19 to 16:22 on 5 Oct, the database port closed, no model key, the tree unchanged from start to end by md5) gave:
  - `npx tsc --noEmit -p .` rc 0 (and rc 0 again with `--incremental false`), and `npx eslint src scripts` rc 0;
  - life:check rc 0, with 3,830 PASS lines and 0 FAIL: capture-parse 823, today-ui `--strict` 740, idea-capture 128, rituals 140, duty-actions and duty-check all passed, roadmap-contract `--strict` 505, roadmap-measures 366, throughput 62, roadmap-realism 344, roadmap-model 1,005, roadmap-server 664, roadmap-quests 343, roadmap-invite 57 and roadmap-hostile 54 of 54;
  - ui:check rc 0: shell 229, contrast 204, review 97, celebration 234, you 721, study-side 129, shortcut 182, train 169, tour 171 and roadmap-ui 868, each with 0 failed;
  - balance:horizon ("LIFE: all assertions hold"), skills:stats ("All checks passed") and novelty:check ("all pass").
- **After 42072fa**, life:check is red on one item: roadmap-hostile-check's PIN, for the reason above. In the docs lane's run at 16:51 on 5 Oct, on the minors round's working tree with the other lanes' edits under way, every other life:check script had 0 failed, roadmap-model-check among them at 1,026 with the 7 blessed replies re-validated against their snapshots, and ui:check passed. The fix is the lead's re-bless of pin.json after reviewing the new F cases; nothing in the docs or the code is wrong.

### 19.10 What the owners shipped in §19's first round (read from their reports and the code)

The first round's owners asked for these names to be recorded. Each was checked in the code at 14:50; private helpers are marked.

- **R4, roadmap-server.ts:**
  - `setActivityVerdictsCore` and `ActivityVerdictsResult` (the answer core: writes off, another user's roadmap and a closed one refused; one write through `coverageJsonOf`; a DRAFT re-synced in the same transaction, an ACTIVE plan returns `replan`);
  - `PlanGate` and `gatePlanRows` (every plan path's rows held to the gate); private `planGateOf` (one gate per roadmap row, the parser's suggestions matched by each kind's own words) and `gateValidated` (a Gemini pick of a blocked kind dropped before the caps, DropReason CONSTRAINT);
  - the refusals `ACTIVITY_WAITING_PICK`, `ACTIVITY_AVOIDED_PICK`, `ACTIVITY_HELD_IN_DRAFT` and `ACTIVITY_WAITING_START`;
  - the ROADMAP_IS guard's optional `updatedAt`, so an answer, an intake save and a Gemini run re-read rather than overwrite each other.
- **R4, src/app/actions/roadmap.ts:** `setActivityVerdicts(roadmapId, answers)`, the first round's per-kind form; §19.5's PENDING line moves it to `ActivityCardAnswer`.
- **R2, roadmap-realism.ts:** `blockedKindsOf`, `trackStarterKindsOf` (a blocked starter kind replaced by the next safe kind on the track), `syncTrackStarter`, `PlaceOpts.excluded` and `StageLadderOpts.gate`; `bodySafeOf` is gone.
- **R6, roadmap-quests-server.ts:** `questGateOf`, `QuestSetOverrides.gate`, `QuestItemRow.catalogKey`, the gate's inputs on the roadmap row it reads, and `measureCountOf`.
- **R3, roadmap-validate.ts and roadmap-lexicon.ts:** `NegatedTermRead` ("AFTER" | "CARRY" | "STATE") on `NegatedTerm.read`; the rules `constraint.body` and `constraint.fill`; and 12 lexicon lists: CONSTRAINT_MORE_CUES, CONSTRAINT_MORE_INJURY_CUES, CONSTRAINT_AUTHORITY_CUES, CONSTRAINT_MORE_CUES_AFTER, CONSTRAINT_CAUSE_WORDS, CONSTRAINT_BODY_STATE_WORDS, CONSTRAINT_BODY_SIDE_WORDS, CONSTRAINT_TROUBLE_WORDS, CONSTRAINT_TROUBLE_SKIP_WORDS, CONSTRAINT_CAN_WORDS, CONSTRAINT_WHEN_WORDS and CONSTRAINT_MORE_SKIP_WORDS. One exact golden changed: "injured last year, now fully recovered and running daily" now names nothing, because time words are no longer terms.
- **R3, the hostile corpus** (scripts/fixtures/roadmap-hostile): `VocabTemplate`, `VOCAB_TEMPLATES`, `FILL_OVER_FIELD`, `FILL_OVER_KEEP`, `HOSTILE_SEEDS.K_VOCAB`, `ConstraintCase.sub` "vocab", and the count `K_vocab`.
- **R5, roadmap-ui-model.ts and the card:** ActivityConfirm.tsx (new); `activityCardOf`, `activityAsksOf`, `activityAvoidOf`, `activityBlockedOf`, `pickerExcludedOf`, `activityWaitingOf`, `heldPracticesOf`, `practiceOnlyLineOf` and `intakeActivityOf`; the fixture states `draft-confirm`, `draft-words`, `active-confirm`, `active-answered` and `intake-confirm` in `CONFIRM_STATES`. The safety-gaps round's PENDING line replaces the first round's per-kind `activityAnswersOf` with `activityCardAnswerOf`.

### 19.11 The follow-up round: the release is per card, and the key is the track's (lane 0)

After the safety-gaps round, the verifier's `ver.still_open` left two items in lane 0's files: the catalog minor (the release is per card, §19.6 #1) and the types minor (probe L8, the key ignores the track). Both are closed here.

**The lead's ruling (1): the release is per card.**
- A Save with at least one tick is the user's answer for every row the card listed. Each listed row left unticked is placed (FINE, `cls` YOURS, the answer's day). A kind the card didn't list still waits.
- This holds when the only tick is a suggestion the parser pre-ticked. "Can't do burpees or jumping jacks." pre-ticks Harder session; one Save then avoids it and places Longer, Strength, Full attempt and Performance check. The line beside Save says so ("The plan leaves out 1 and can include the other 4.").
- "Nothing to avoid" stays hidden while any box is ticked (R5's card). The contract already refuses ticks sent with it (`ACTIVITY_ANSWER_REFUSAL`).
- No behaviour changed: `answerActivityCard` and the gate already worked this way. The doc comments now state the ruling, and a golden pins it by name.

**The key is the track's (probe L8).**
- **Before:** `cueKeyOf` hashed only the texts. A BODY draft answered "Nothing to avoid", then re-saved as CRAFT with the same words, showed Full attempt and Performance check as FINE on the CRAFT card. That answer was about running sessions; on CRAFT it released a full attempt at the piece.
- **Now:** `cueKeyOf(texts, track)` is "k2-" and FNV-1a over the catalog track and the texts. An answer given on one track never answers another track's card: its key is refused there (`ACTIVITY_ANSWER_STALE`), and the gate reads the card as not answered. An AVOID still stands on every track.
- **The stale day stays true.** `staleDay` is set only for an earlier answer this track's card could have given (every kind it listed is on this track). So "You answered on 3 Oct, before your words changed" appears when the words changed, and an answer from another track asks with no stale day. One case can't be told apart: an answer listing only kinds both tracks share (practices off: Full attempt and Performance check) shows its day after a track change. It still asks again.
- **The exam flag is not keyed.** The exam label is itself a note, so adding or changing an exam changes the key. A kind the card didn't list (Mock test) waits anyway.
- **Answers stored before this round ("k1-").** `cueLegacyKeyOf(texts)` is the old key, byte for byte; a golden pins "k1-1322744a". Under the same words, a legacy answer holds only when the kinds it listed fit exactly one catalog track, the plan's. A card lists only its own track's kinds, so a single fit proves where the answer was given.
  - A BODY answer with practices on holds, because Harder, Longer and Strength sessions are BODY's alone.
  - These ask again once, with no stale day: a CARE answer (CARE's practices are DUTY's too), a CRAFT answer listing only CRAFT's gated kinds (they are FIELD's too), and any answer listing only the shared kinds (practices off: Full attempt and Performance check). Until the user answers, every plan path treats those kinds as waiting, as for any stale answer.
  - Under other words, a legacy answer is stale as before, with its day.
  - Nothing writes a "k1-" key: the next answer stores the track's key. A "k1-" key sent with an answer is refused.
- **Callers.** Every caller gets the key through `constraintsStateOf`, which passes its track. So the server's gate, the week quests (`questGateOf`), the intake form (`intakeActivityOf`) and the views agree without an edit. Two check lines followed: roadmap-realism-check's fixture call passes "BODY", and roadmap-ui-check's prefix assertion reads "k2-".
- **The production monitor (§19.7 #1):** a placement counts as confirmed only under the roadmap's current key, or under a "k1-" key that the rule above holds.

**The goldens** (roadmap-contract-check):
- `cueKeyOf`: "k2-" and 8 hex, case and spacing ignored, and a different key on each of the five tracks. `cueKeyOf` and `cueLegacyKeyOf` are pinned.
- Ruling (1): the burpees card. One Save with only the pre-tick places the four untouched rows (FINE); ticks with "Nothing to avoid" are refused.
- Probe L8:
  - "Nothing to avoid" on BODY leaves Full attempt and Performance check waiting on CRAFT, with no stale day;
  - the BODY key is refused on CRAFT;
  - a BODY AVOID stands on CRAFT;
  - a CRAFT answer holds on CRAFT and not back on BODY;
  - CARE and BODY never share an answer.
- The legacy read: BODY holds; CRAFT, practices off and CARE ask again with no stale day; under other words it is stale with its day; a "k1-" answer is refused, and answering over one stores "k2-".
- The property gains a fifth answer, a legacy one, and its oracle reads the same rule: 6 cases × 64 suggestion sets × 5 answers.

**Checks** (DATABASE_URL and DIRECT_URL pointed at a closed port, no model key): `npx tsc --noEmit -p .` is clean, and eslint is clean on roadmap-types.ts, roadmap-catalog.ts and the three check files. `npm run life:check` and `npm run ui:check` end green, with 0 failed in each script: roadmap-contract-check `--strict` 505 (493 before), roadmap-realism-check 344, roadmap-server-check 653, roadmap-ui-check 856. *(Those were the counts when lane 0 ran them, while R4 and R5 were still adding cases. At the end of the follow-up round the fifth verifier's run had roadmap-server-check at 664 and roadmap-ui-check at 868, with roadmap-contract-check still 505 and every gate green, §19.9.)*

### 19.12 The follow-up round: rulings (2) and (3), and the other server and page items (R4, R5; read from the code)

The lead's rulings (2) and (3) are roadmap-rev4.md 57.2 and 57.3. With them, the follow-up round took the fourth verifier's rows 3, 5 and 7 and the STARTING window of row 8 (rev4's "Still open after the safety-gaps round"). The names below were checked in the code as committed in 9b8d233; private helpers are marked. A fifth verifier confirmed each item at file and line, ran every gate (all green, §19.9) and probed about 690 cases with all three bars at 0.

**Ruling (2): safety overrides the akrasia horizon** (57.2; row 1).
- **tasks.ts:**
  - `planSafetyPause(row, at): RuleEditPlan` archives the task at `at` whatever its rule, a must included. Nothing in the must's rule changes. A pending archive the user asked for earlier is folded in, any other pending change (an un-flag) is kept, and a task already archived writes nothing.
  - `pauseForSafetyCore(userId, templateId, now?)` goes through `applyRuleEdit` with the edit `{kind: "safety-pause"}`: the same compare-and-set write as every rule edit, without `classifyChange`'s deferral. archiveCore's doc and duty-rule.ts, beside `classifyChange`, state the exception.
  - In duty terms the days before the pause keep the rule and its debts (yesterday is still owed), nothing is owed from the pause day, and Undo is the normal unarchive.
- **roadmap-server.ts:** `RoadmapIo.pauseTemplate(userId, templateId, now)` calls `pauseForSafetyCore`, and `pauseAvoidedTasks` (private) uses it, never `archiveTemplate`'s deferring archive. `PausedTask.deferredTo` stays in the shape and is always null.
- **The checks:** duty-actions-check pins a must paused at once where an archive would be deferred, its rule unrewritten, the folded archive and the kept un-flag, an already archived task, a non-must, and Undo. roadmap-server-check pins a must off Today at once with `deferredTo` null, and a refused pause still listed in `notPaused`.

**Ruling (3): a paused practice stops counting** (57.3; row 8). As built, and kept by the lead: the paused practice's whole practice-kept measure switches to context from the pause.
- **`offTargetOpsOf(b, confirm, goals, only?)`** (private), in the answer's own write: on every STARTED row still worked (not superseded, its goal neither closed nor archived), each paying PRACTICE_KEPT measure whose practices are all live, started (they have a task) and avoided turns CONTEXT, each row guarded on its status. A measure that also holds a practice the user didn't avoid stays as it is.
- **The readers:** R1 reads paying measures only (roadmap-readings `payingKeyed`, `practiceKeepOf`). So no reading is written for the measure any more, and g, the aim reach, the aim's practice and production shares (F-R4-12) and the pay read the milestone's other measures and steps. Its readings so far stay as history.
- **What that means:** the sessions kept or missed before the pause stop counting too, for and against the milestone. The ruling as first written trimmed only the sessions from the pause day. R1 recomputes each practice's target every day from its task and ignores archiving, so the server can't cut the target at a day; the exact trim would be an R1 change in roadmap-readings and roadmap-measures. Because g is the minimum over the paying measures, the approximation can only help the user.
- **The page:** a CONTEXT measure gets no pace. `practiceSoFarOf` (private) plans the practice only up to the day before `offTargetDayOf` (private): the card's AVOID day, else the day its task was archived, else the day after the measure's last reading.
- **The lines (R5):** roadmap-ui-model `pausedItemsOf(current, confirm)` finds started practices and open steps with a Today task whose kind has an AVOID dated on or after the milestone's `startedDay`, and marks a practice `offTarget` when its own measure is CONTEXT; `pausedOfMeasure(row, paused)` matches a CONTEXT practice-kept row to its paused practices. roadmap-copy `pausedItemLine(day, offTarget, today?)` ("Paused on 5 Jan because you said to avoid it. From that day it no longer counts toward this milestone.") replaces the practice's "On Today" link, and `practiceKeptPausedLine(rows, today?)` is the measure row's new `note` ("Strength for knees and hips is paused because you said to avoid it, so from 5 Jan this no longer counts toward the milestone.").
- **One way.** A measure already CONTEXT is left alone: neither the Undo of a pause nor a later answer that lifts the AVOID makes it pay again, since its paused days would then count against the user. Start again or a re-plan gives the practice a measure afresh.
- **Open for the lead:** a started milestone whose practices are all paused and that has no steps reads NOT_MEASURABLE (g null), and PROFICIENCY gets no kept count from a CONTEXT practice measure (R1's to decide). The switch also happens when the pause itself was refused (the task still on Today, in `notPaused`); that is the fifth verifier's item below.

**Start's race** (row 8). `finishStartCore` re-reads the stored answer after its write-back (`pauseAvoidedAfterFinish`, private): every task it created of a kind now avoided is paused, and its measure is switched off the target. The write-back also moves the roadmap's `updatedAt` strictly past the read, so an answer that read the row while it was STARTING and is saved after the finish fails its `updatedAt` guard, re-reads, sees the row STARTED, and pauses the task itself. Tasks the re-check pauses are logged, not returned; the card's AVOID row and the CONTEXT measure show them.

**Every refusal points at the card** (56.2 as written; row 7). `pointedRefusal(deps, userId, ref, res)` (private) re-reads the roadmap only when a core refused, and adds the pointer through `withActivityPointer` while kinds wait on the card. It never adds it twice, and leaves the message alone with writes off, on another user's roadmap, or when no card waits. It wraps 18 cores, each exported name now a thin wrapper over a private `*Unpointed` body:
- the re-plan: `replanCore`;
- the builds: `claimDraftCore`, `buildStarterCore`, `startManualCore`;
- accept and Start: `acceptCore`, `startMilestoneCore`;
- the review's edits: `editItemCore`, `decideItemCore`, `addItemCore`, `keepUnflaggedCore`, `resolveDomainCore`, `moveLineCore`, `setLineDomainCore`, `applyRemedyCore`, `confirmSessionPicksCore`, `confirmDomainAdditionsCore`, `lowerDepthCore`, `keepCalibratedDatesCore`.

`finishStartCore` is not wrapped: its refusals are Start's own, and `startMilestoneCore` is.

**The re-gate after the words change** (row 3). `draftGateOps(e, userId, prev, next, tree, now)` (private) now takes the stored row. When new words move the gate on the same track, it calls `regatedDrafts` with the kinds `prev` blocked: picks that wait again leave, and the track's safe kinds take the place the starter gives them, as in a fresh build. When the gate didn't move, or the track changed, it only drops the blocked kinds, as before.

**The session-picks copy** (row 5, R5). roadmap-ui-model `sessionSwapKindsOf(track, confirm)` is the server's EASY swap: `cueSafeKindsOf(track)`'s practices less any kind the user avoided. roadmap-copy `sessionPicksSwapWord(kinds)` and `sessionPicksSwapLine(kinds)` word it: "Use easy, mobility and technique instead" on BODY (`SESSION_PICKS_EASY`, unchanged), "Use Plan the week ahead and Keep a log instead" on CARE, and "Leave them out" when every swap kind is avoided. The "Without Gemini…" line is per track, and `ACTIVITY_REPLAN_LINE` ends "…started ones keep their history.".

**The checks** (the fifth verifier's run, §19.9): roadmap-server-check 664 (653 before), duty-actions-check all passed, and roadmap-ui-check 868 (856 before), each with 0 failed. R4 turned each server change off once and saw its new cases fail: the re-gate, the re-check after the finish and the `updatedAt` move.

**The fifth verifier's still-open list** (the minors round's input; all minor). Nothing in it lets a kind the user hadn't released reach Today.

| # | Item | Owner in the minors round |
|---|---|---|
| 1 | A track switch on an answered draft keeps the old track's rows: `draftGateOps` only drops the new track's blocked kinds when the track changes. A BODY draft re-saved as CARE kept Easy and Longer sessions; accept passed, then Start and the re-plan tripped the model-text tripwire with the card's pointer, which answering the CARE card doesn't clear | R4 |
| 2 | Ruling (3)'s disclosure is wrong in three states: a refused pause (the measure turns CONTEXT and the row says "Paused" while the task is still on Today), after Undo (the row still says "Paused"), and once the AVOID is lifted (the measure stays CONTEXT with no line saying why) | R4, R5 |
| 3 | Decision 57.3's wording said the days before the pause count as they were | docs: reworded in roadmap-rev4.md (57.3, F-R4-25, Acceptance, question 18) |
| 4 | §19 behind the code: §19.9's pin, counts and red life:check, §19.11's counts, no record of rulings (2) and (3), and rev4's "through archiveCore" | docs: §19.9, §19.11, this section, and rev4's rows. grading.md's akrasia-horizon paragraph still lacks 57.2's exception (the lead's) |
| 5 | The server's CONFIRM_PICKS (accept's blocker) and the invalid-choice refusal still name easy, mobility and technique on every track, so on CARE accept contradicts the card; the doc comment in src/app/actions/roadmap.ts too | R4 |
| 6 | Carried over: the CRAFT cue detector misses "Acid reflux affects my singing." (37 of 38), and the aim-conflict questions | lane 0 ("reflux", "GERD"), the lead (§19.13), R3 (the exam clash) |

PROGRESS.md also lists a layout bug for the minors round: the "How this is worked out" row wraps its title one word per line at 375 px (R5).

### 19.13 The aim-conflict ruling (the lead's, the minors round; roadmap-rev4.md 57.4)

The fourth verifier's row 9 asked whether a limit should raise the aim-conflict line. **The lead's ruling: a limit is not an exclusion.**
- **A frequency limit** ("Shin splints flare up if I run more than twice a week.", 56.6's own example) names nothing to avoid: the user can still run. The activity card quotes the sentence, nothing is pre-ticked, and no conflict line shows.
- **A timing limit** ("No mock exams until the last month." on a Field exam plan) is the same: the card shows it as the user's quote, it never blocks a kind, and it doesn't clash with the exam aim.

What the code did at 8b7d4a3, read by calling the functions:
- **The frequency limit already behaves as ruled.** R3's `constraint.limit` reads the activity held to a limit as naming no kind, and `aimConflictOf("Shin splints flare up if I run more than twice a week.", "Run a sub-50 10K")` is null. On BODY the card asks anyway and quotes the sentence among its cue clauses. roadmap-model-check pins "a limit is no conflict", and K's suggest sub-class keeps the limited kinds (LONGER_SESSION in "no running more than twice a week, no jumping").
- **The timing limit doesn't yet.** `aimConflictOf("No mock exams until the last month.", "Pass SOA Exam P")` gives the word "exams" with the user's sentence, so the line shows a clash with the exam aim, and the reader names the exam's kinds as a pre-ticked suggestion. Under 56.7 that suggestion never blocks by itself, but a Save with it still ticked avoids them. Reading a timing word ("until the last month") as a limit, so that it names nothing and meets no aim, is R3's change (`constraint.limit`, `aimConflictOf`), with a K suggest case or a roadmap-model-check golden for it.
- **Under way in the minors round** (the parser item's working tree when the docs lane wrote this; its report gives the final state): roadmap-lexicon gains CONSTRAINT_REHEARSAL_WORDS ("mock", "practice", "trial", "sample") and CONSTRAINT_EXAM_WORDS under `constraint.fill`, so an exam word right after a rehearsal word meets a type only by the type's own words, never through the fill (the aim, the exam's name). On that tree `aimConflictOf("No mock exams until the last month.", "Pass SOA Exam P")` gives null, so no clash shows. The reader still pre-ticks Mock test there, a suggestion that never blocks by itself; which kinds it pre-ticks in the end is the parser item's to report.
- **No gate rule changes.** A BODY or CARE plan asks whatever the words say (56.1), and a CRAFT plan asks on a cue.

### 19.14 The probe run (the lead's approved calls, 5 Oct)

This is the run F-R4-23 specifies, made once: `npx tsx --env-file=.env scripts/roadmap-probe.ts --i-approved`, the user's approved 10 free-tier calls, on the synthetic corpus packs only, with no database. The replies were saved unedited as scripts/fixtures/roadmap-corpus/probe-*.json (`blessed: false`, `expected` null; 42072fa later labelled and blessed the 7 CLEAN ones, below), and PROGRESS.md holds the lead's lines. Every call went to gemini-3.5-flash-lite.

**The production configuration** (keys only, suggestions off, thinking off): **7 of 7 replies CLEAN.**

| Pack | Integrity | Latency |
|---|---|---|
| ielts | CLEAN | 2.4 s |
| guitar | CLEAN | 1.8 s |
| run-10k | CLEAN | 1.8 s |
| lose-8kg | CLEAN | 1.7 s |
| care-routine | CLEAN | 1.5 s |
| python-cert | CLEAN | 2.9 s |
| vietnamese-japanese | CLEAN | 2.2 s |

- 0 violation codes, 0 model characters, and 0 outline lines left out. Each reply finished with STOP.
- 1 duplicate was dropped (vietnamese-japanese: "the same type twice in one stage").
- lose-8kg ("knee injury, no running"): the constraint filter left Harder and Longer sessions out of the run by "running", and the session-picks confirm was raised (PENDING) over Gemini's picks, which were mobility, easy and technique sessions.
- The median latency was 1.8 s, and the max 2.9 s.

**Rejected by the API** (400 INVALID_ARGUMENT, so no reply):
- **The gap schema:** both calls with suggestions on, actuarial-probability and new-subject. The API rejects the gap slot's schema with its string bounds, so the gap slot can't be probed until R3's `buildResponseSchema` sends one the API accepts.
- **Thinking LOW** on actuarial-probability: gemini-3.5-flash-lite doesn't support it, so `ROADMAP_THINKING_LOW` stays false.

**The verdict at the run: no-go for now.**
- `ROADMAP_GEMINI_LIVE` stayed false until (a) the 7 replies were labelled (`needs` precision ≥ 0.8, practice fit ≥ 80% of stages), given their verdicts and blessed, and (b) actuarial-probability got a call in the production configuration, which needs the user's approval for about 2 more calls. With thinking LOW refused, F-R4-23's ninth keys-only reply can't exist; the lead's verdict reads the gate over the 7 and actuarial-probability's.
- `ROADMAP_GAPS_LIVE` stays false: there are 0 real gap strings (GAPS_LIVE_MIN_LABELLED is 30), and the gap schema was rejected.

**The labels (42072fa; PROGRESS.md has the lead's line).** Two independent judges labelled each reply, and a reconcile settled them. All 7 are blessed, and roadmap-model-check re-validates them (1,026 passed, 0 failed).
- `needs` precision 0.75 (3 of 4 keys; the lead calls it fragile), against the bar's 0.8.
- Practice fit 29.4% (10 of 34 stages), against 80%. The lead reads it as systemic: the keys-only schema makes practices optional on FIELD runs, and nothing flags a plan with no practice.
- The arrangement keeps earlier stages for what later ones build on in 1 of 7. No lastStageOnly kind was placed early.
- **Verdict: no-go.** `ROADMAP_GEMINI_LIVE` stays false. The user approved 2 more free-tier calls (actuarial-probability and new-subject, in the production configuration).
- **The lead's next step** (after the minors round): code owns the practice progression on every plan path (retrieval early, production later, a full attempt or performance check only in the last stage, practice in every stage when practices are allowed, and the starter on the same rules). Gemini keeps only `needs` (confirmed by the user), the outline's order, and at most a pick among code's candidates per stage (prompt v4). Then the 2 approved calls, their labels and the gate.

**What it changes elsewhere:** the run left the hostile pin, family F and every gate as they were. Blessing the 7 replies seeds family F (707) and moves the pin, so roadmap-hostile-check's PIN item fails until the lead re-blesses pin.json (§19.9).

## 20. The practice progression: code owns it (lane 0, first and alone)

**The lead's decision (fixed).** The approved probe (§19.14) failed the gate on practice fit (10 of 34 stages, 29%, against 80%) and on arrangement (1 of 7): the keys-only schema made practices optional on a Field run, and Gemini placed none, or cycled kinds with no build-up. The user's requirements are plans that lead to high mastery realistically, and no Gemini hallucination. So:
- **Code owns the practice progression on every plan path**: the starter, Gemini's keys-only plan, every re-plan, Start and the week quests. It is pure and deterministic, per track and stage.
- Every stage carries practice whenever practices are allowed. Retrieval and recognition come early, production and integration later, and spaced review runs throughout. Full attempts and performance checks sit in the last stage only, and mock tests only in the stage holding the exam. Checkpoints escalate (self-test → mock → performance). Each later stage builds on what earlier ones trained: the rule is named and tested ("carry and climb", §20.3). Sessions and durations are code's existing sizing, within the user's hours and the realism engine (§20.6).
- It always respects the constraint-safety gate (§19): a pending or avoided kind is never placed; a practice gives way to the track's safe kinds (§20.4).
- **Gemini's role shrinks** to three things: which of the user's Domains the aim needs (shown as Gemini's choice, confirmed by the user, as today), the order of the outline's lines, and at most one pick per stage among code's candidates (a per-stage enum; absent or invalid, code's default). It still writes no words. `ROADMAP_PROMPT_VERSION` is 4. `ROADMAP_GEMINI_LIVE` stays false.

### 20.0 State of the tree after lane 0

- **Files:**
  - roadmap-catalog.ts: a new last section, "The practice progression" (the tables, `progressionOf`, the pick enums, the notes, the rule checker) and its sizing helpers; the header index.
  - roadmap-types.ts: `ROADMAP_PROMPT_VERSION` 4 (its comment rewritten), `DraftReplyV4`, `REPLY_V4_PROPERTIES`, `OutlineOrder`, `outlineOrderOf`, `outlineStagesOf`; the header index.
  - scripts/roadmap-contract-check.ts: the constant's pin (4), a new section "the practice progression (§20)", and the `handoff()` helper with its 9 HANDOFF lines (§20.8).
  - scripts/roadmap-model-check.ts: the three cases that pin the constant itself (`prompt version 4`, `promptVersion` on the pack, the hashed material's `prompt:4`). Nothing else in R3's check moved; the v3 instruction text it pins is R3's to replace (§20.8).
  - This section and the intro's pointer.
- **No schema change and no migration.** `RoadmapItem.catalogKey` and the notes already carry everything the progression places.
- **Nothing calls the progression yet**, so every plan path behaves as before, and no other check's golden moved. The version bump changes the hashed input material, so no v3 run is reused; drafting is off anyway.
- **Gates** (DATABASE_URL and DIRECT_URL pointed at a closed port, no model key):
  - `npx tsc --noEmit -p .` is clean, and eslint is clean on the four changed code files.
  - roadmap-contract-check passes **564, 0 failed, 9 handoffs open**. `--strict` passes too, because HANDOFF lines don't fail it.
  - `npm run life:check` and `npm run ui:check` both exit 0. The hostile pin is unchanged.

### 20.1 What a stage holds (`progressionOf`)

> **Superseded in part by §20.11 (the review round).** The priority is now FOCUS (code's default, never Gemini's pick), EXAM, CORE, PICK, PARTNER or CARRY, BASE, SHAPE; a dated exam gets a run-up (timed practice and the mock test before it) and nothing after it; a Field plan reads its family's table; BETWEEN and PART stages take a self-test. The table and goldens below are the first round's; §20.11 gives the current ones.

Per stage that is neither held nor carried, in order:

| Part | What | Notes |
|---|---|---|
| FOCUS | Gemini's pick among the stage's candidates, else code's default (the first) | A blocked default gives way to the next placeable candidate, then to a stand-in (§20.4). |
| PARTNER | The chain's first stage only: the track's opening partner | A Field plan retrieves from day one (recall drills). |
| CARRY | Every later stage: the kind the stage before trained (its focus) | When that is this stage's own focus, it carries what the stage before carried. The build-up rule's carry. |
| EXAM | A Field plan's exam stage: timed practice | examOnly; never a candidate; never copied. |
| BASE | The track's spaced review, when a slot is still free | Recall drills on a Field plan, an easy session on BODY, slow drills on CRAFT, setting time on CARE, planning the week on DUTY. |
| SHAPE | F-R4-13's role on a Field stage when nothing above gave it | Retrieval below Retained, production from Retained (BETWEEN at L9 and L11 included). |

- The practices are capped at `maxPractices` (default `PRACTICES_PER_MILESTONE`, 3), kept in that priority. With room for one, the shape wins over a pick without the stage's role.
- A stage nothing filled, while the track still has a placeable practice (the user released only kinds this stage doesn't list), gets the least demanding one (the stage's role first). So every stage carries practice whenever practices are allowed and the gate leaves one.
- **BETWEEN and PART** copy the next gate stage's practices (else the one before), without its exam extra, then add their own exam extra and shape. *This reverses rev 4's "a count gate copies no practices" (F-R4-13), so every stage carries practice; R2's motivation timeline already counts a PART as able to pay.*
- **A held stage** gets nothing and is never first or last.
- **A carried stage** (`ProgressionStageInput.carried`: one under way, or a re-plan's started row) keeps its kinds (KEPT) and gets nothing new; its first practice is what the next stage carries. It still counts as first or last, so a re-plan never opens twice.
- **Steps**, at most `STEPS_PER_MILESTONE`, kept in the priority OPENING, BOOK, CLOSING, ROLE and listed OPENING, BOOK, ROLE, CLOSING:
  - OPENING on the first stage: choosing material on a Field plan, setting up on a track.
  - BOOK on the first stage with an exam (`BOOK_EXAM`, whether or not the exam has a day).
  - ROLE, a Field gate stage's own step: outline at Familiar, list the gaps at Retained, explain it once at Fluent, a small project at Mastered.
  - CLOSING on the last stage, unless the exam is held there: the track's, a full attempt on a Field, BODY or CRAFT plan, and none on a CARE or DUTY routine.
- **The checkpoint:**
  - the exam stage holds `EXAM_DAY` when the exam has a day, or `MOCK_TEST` when it has none (then the last stage holds the exam);
  - else the last stage holds `PERFORMANCE_CHECK`;
  - else a Field gate stage after the first and before the exam's stage (or the last) holds `SELF_TEST`.

  Between a dated exam and the last stage there is none.

The default plans (roadmap-contract-check's goldens):

| Stage | A Field plan to Mastered, no exam | BODY, the card answered | CARE, the card answered |
|---|---|---|---|
| 1 | study + recall drills · choose material | easy + mobility · set up | set time + keep a log · set up |
| 2 | recall drills + study · outline · self-test | technique + easy | check-in + set time |
| 3 | problem sets + recall drills · list the gaps · self-test | longer + technique + easy | set time + check-in |
| 4 | explain it + problem sets + recall drills · explain it once · self-test | harder + longer + easy | admin + set time |
| 5 | build something + explain it + recall drills · a small project, a full attempt · performance check | harder + longer + easy · a full attempt · performance check | set time + admin · performance check |

Two exam variants on the Field plan:
- **An exam with no day:** the first stage books it, and the last stage holds build something, explain it and timed practice, a small project, and the mock test (no full attempt).
- **The exam's day in Familiar:** Familiar holds timed practice and the exam, Retained and Fluent hold no checkpoint, and Mastered closes on the full attempt and the performance check.

### 20.2 The tables (`PROGRESSION`, per track; the lead may tune any list)

Rungs (`ProgressionRung`): 1 taking in, 2 retrieving and drilling the parts, 3 producing, 4 putting it together, 5 under exam conditions.

| Track | Stage → candidates (default first) | Partner · base · opening · closing |
|---|---|---|
| FIELD | Foundation: study, listen and repeat, slow drills · Familiar: recall drills, slow drills · Retained: problem sets, explain it, writing, say it aloud · Fluent: explain it, problem sets, writing, say it aloud, go over your mistakes, a teacher or partner, build something, run-throughs · Mastered: build something, a teacher or partner, run-throughs | recall drills (else study) · recall drills (else mistakes) · choose material · full attempt |
| BODY | 1: easy, mobility · 2: technique, strength · 3: longer, strength · 4: harder, longer, strength · 5: harder | mobility (else technique) · easy · set up · full attempt |
| CRAFT | 1: slow drills, technique · 2: slow drills · 3: run-throughs, a teacher · 4: a teacher, run-throughs · 5: run-throughs, a teacher | technique (else slow drills) · slow drills (else technique) · set up · full attempt |
| CARE | 1: set time, plan the week · 2: check-in, set time, admin · 3: set time, check-in, admin · 4: admin, set time, check-in · 5: set time, check-in, admin | keep a log (else plan) · set time (else the log) · set up · none |
| DUTY | 1: admin, plan the week, set time · 2: set time, admin, check-in · 3: admin, set time, check-in · 4: check-in, admin, set time · 5: admin, check-in, set time | plan (else the log) · plan (else the log) · set up · none |

- **Rungs per track:**
  - Field: study and listen-and-repeat 1; recall and slow drills 2; problem sets, explaining, writing, saying it and mistakes 3; building, run-throughs and a teacher 4; timed practice 5.
  - BODY: easy and mobility 1, technique 2, strength and longer 3, harder 4.
  - CRAFT: technique 1, slow drills 2, run-throughs and a teacher 3.
  - CARE and DUTY: planning and the log 1, the rest 2. A routine holds; it doesn't climb past that.
- **Stand-ins** (`standIn`, then the track's safe kinds in CATALOG order):
  - BODY: harder and longer → easy, strength → technique.
  - CRAFT: every gated practice → technique.
  - CARE and DUTY: set time and admin → plan the week, check-in → the log.
  - A Field plan has no safe kinds, because only the user's AVOID holds a Field kind. It takes the next kind of the same role (F-R4-13), or of the stage's role for slow drills or a teacher.
- **The table rules the check pins:**
  - each track's keys are its slots;
  - every candidate, partner and base is a rung-ed practice on the track, never examOnly or codeOnly;
  - every role and opening step is a step on the track, never examOnly or lastStageOnly, and the closing step is a lastStageOnly step;
  - every stand-in is safe;
  - every candidate of a stage sits at or above every candidate of the stage before, so no pick can step back.

### 20.3 The build-up rule, escalation and placement

- **`BUILD_UP_RULE` = "carry and climb".**
  - *Carry:* every gate or track stage after the chain's first keeps the kind the stage before trained, whenever the gate places it and a slot holds it.
  - *Climb:* a stage's focus is never less demanding than the stage before's. A stand-in, and a carried stage's kinds, are exempt.
- **`CHECKPOINT_RUNG`:** SELF_TEST 1, MOCK_TEST 2, EXAM_DAY 3, PERFORMANCE_CHECK 3. Over a plan's stages, in order, the rung never falls; a stand-in that would fall is not placed.
- **lastStageOnly** (the full attempt, the performance check): the last stage only.
- **examOnly**, only with the user's Yes:
  - `BOOK_EXAM` on the first stage;
  - `TIMED_PRACTICE` and `MOCK_TEST` on the exam stage only;
  - `EXAM_DAY` (codeOnly; the progression is code) on a dated exam's stage only.
- **`examStage`** (the caller's): the index of the stage whose window holds the exam's day. R2 gives the first kept stage due on or after it, else the last, and a held index moves to the next live stage. Absent or null means no day: the last stage holds the exam.

### 20.4 The gate interplay

- **Never placed:** every kind in `gate.blocked` (PENDING while the card waits, and the user's AVOIDs) or in `excluded`. So while the card waits on BODY, CARE or a cued CRAFT plan, only the safe kinds are placeable. The plan is then safe kinds only, never empty (CARE: planning the week and the log in every stage).
- **Practices:**
  - a blocked focus gives way to the stage's next placeable candidate (what the pick enum offers first), then to a stand-in (§20.2);
  - a blocked partner gives way to a stand-in;
  - the carry and the base are taken only when placeable.
- **Steps and checkpoints:** a blocked step is left out. A blocked checkpoint gives way to a self-test on a Field plan only, while escalation allows it; otherwise it is left out (the performance check and the mock test wait on the card, as before).
- Every `standsIn` names a kind something held (the rule checker's STANDIN).

### 20.5 Gemini's part: the v4 reply (roadmap-types) and the pick enums (roadmap-catalog)

```ts
interface DraftReplyV4 { needs?: string[]; order?: string[]; picks?: Partial<Record<string, string>>; gaps?: string[] }
REPLY_V4_PROPERTIES = ["needs", "order", "picks", "gaps"]          // the schema's propertyOrdering
outlineOrderOf(order: unknown, keymap: S-key → index, lines): OutlineOrder   // {order, dropped, appended}
outlineStagesOf(order: number[], stages): number[][]                // R2's even split, over the order
progressionPickEnumsOf({track, slots, exam, practicesAllowed, gate?, excluded?}): Record<slot, PracticeKind[]>
progressionCandidatesOf(track, stage, run) · progressionPickOf(candidates, pick)
```

- **The schema R3 builds** (keys only, no INTEGER or NUMBER; as shipped, read from `keysOnlySchemaOf` after the review round's fix items):
  - `needs`: as v3 (unchosen D-keys, omitted on a track Area or with none), optional.
  - `order`: an ARRAY of the run's S-keys (maxItems SYLLABUS_MAX_LINES), omitted without an outline. **Optional** (the review round, r3): an absent order is the user's own order, so a reply without one is never REJECTED and keeps its `needs`. `KeysOnlyDraft.reordered` says whether Gemini moved a line, so the page can show a reorder as Gemini's suggestion beside the user's order. *(The first round shipped it required; the second review flagged it.)*
  - `picks`: an OBJECT whose properties are the slots `progressionPickEnumsOf` returns (the run's family's candidates, §20.11), each a STRING enum of that slot's candidates, none required, `picks` itself optional. Only the slots the plan's own ladder reads a pick for (`EvidenceInput.pickStages`, R4 passes `pickStagesOf` over the dated ladder), so no pick is issued for a stage the plan won't hold. Omitted when no slot has a candidate (practices off, or every candidate blocked). No enum is ever empty, and the largest holds 6 values (≤ CATALOG_ENUM_MAX).
  - `gaps`: as v3, but its items carry **no maxLength** (both 5 Oct gap-slot calls with string bounds were refused, 400 INVALID_ARGUMENT; the shape rule drops an over-long name). `ROADMAP_GAPS_LIVE` stays false until an approved call accepts the new shape.
  - No `stages`, no practice, step or checkpoint list, no `on`, and no `family` (the family is the user's answer, §20.11, never Gemini's).
  - **The empty schema.** Nothing is required, so a Field Area with practices off, no outline and every listed Domain chosen gets an OBJECT with no property. The API refuses that shape and a reply could decide nothing, so such a run is never sent: `schemaAsksNothing` / `packAsksNothing` (R3) gate `draftSamples` (NOTHING_TO_ASK), R4's claim and `runDraftCore` (no run row, no cap use), and the form's "Draft with Gemini".
- **`outlineOrderOf`:**
  - It reads the reply's order with exact own-property lookups: no trim or case-fold, so `__proto__`, `S01` and `s1` never resolve.
  - Each line is kept once, in the reply's order, then every line the reply left out follows in the user's order. No line is ever lost, so v3's "uncovered" lines are gone.
  - A missing or non-array order gives the user's order.
- **A valid pick is added beside code's default, never in its place** (§20.11): the stage's FOCUS is always code's default; Gemini's pick, when it differs, is a PICK placed after the exam's practices and the core, before the carry. With room for one it waits. The next stage carries code's default, not the pick, and a BETWEEN or PART copy never copies a pick.
- **An invalid pick:**
  - `progressionOf` reads any pick outside the slot's candidates as absent, so the slot takes its default. That covers another kind, timed practice, a padded or case-folded key, a number, a prototype or inherited key, and a non-object.
  - The integrity walk (F-R4-20, unchanged) still REJECTs a reply holding an out-of-enum value, and the starter then renders: code's defaults throughout.
  - Either way, an invalid pick ends as code's default. A rejected reply also loses its `needs` and `order` (§20.10, point 10).
- **The notes** (`progressionNotesOf`, one definition for R2 and R4):
  - a valid pick: GEMINI_PICK;
  - any other practice the app placed: STUDY_ADDED (retrieval) or PRODUCTION_ADDED (production), so pay honesty reads it;
  - a step, a checkpoint, a practice of neither role, or a carried kind: none.

### 20.6 Sizing: code's existing allocation, one definition

- **`practiceSizeOf(kindOrMethod, shareMinutes, floor?)`** is R2's `bandFor` and `allocate` exactly:
  - the band is the method's, never under the floor (a method whose band is under it starts at it), stepped down while one session is more than the share, to D15 or the floor;
  - sessions are ⌊share ÷ band⌋, clamped to 1…7;
  - the rule is DAILY at 7, else `TARGET:n/W`.
- **`stageBandFloorOf(stage, level?)`** is R2's `floorBandOf`: Retained D30, Fluent and Mastered D45; BETWEEN keeps the gate below's; a PART, or a level alone, its gate's; none on a track stage.
- **`practicesThatFitOf(budgetMinutes, floor?)`** gives the stage's room: one session each at the floor (D30 without one), from 1 to 3. A budget of nothing still holds one, and R2's time verdict says OVER.
- R2 passes the room as `maxPractices`, so the progression stays within the user's hours. The priority (focus, partner or carry, exam, base) decides what waits for room.

### 20.7 Exports

| Module | Export |
|---|---|
| roadmap-catalog | `ProgressionRung`, `ProgressionStageRule`, `ProgressionTrackRule`, `PROGRESSION`, `progressionStageKeysOf`, `CHECKPOINT_RUNG`, `BUILD_UP_RULE` |
| | `ProgressionStageInput` (`stage`, `level?`, `held?`, `carried?`), `ProgressionInput` (`track`, `stages`, `practicesAllowed`, `exam`, `examStage?`, `gate?`, `excluded?`, `picks?`, `maxPractices?`) |
| | `ProgressionWhy`, `ProgressionItem` (`kind`, `slot`, `why`, `standsIn`, `picked`), `StageProgression`, `Progression` (`stages`, `first`, `last`, `examStage`, `examDated`) |
| | `progressionOf` (THE progression), `progressionShapeOf`, `progressionPickOf`, `progressionCandidatesOf`, `progressionPickEnumsOf`, `progressionNotesOf` |
| | `progressionViolationsOf(input, p)`: one line per breach, codes HELD, CAP, TRACK, BLOCKED, EXAM, LAST, ESCALATE, PRACTICE, CARRY, CLIMB, SHAPE, STANDIN, PICK; [] when every rule holds. Other items' checks can run it over their plans. |
| | `PracticeSize`, `stageBandFloorOf`, `practiceSizeOf`, `practicesThatFitOf` |
| roadmap-types | `ROADMAP_PROMPT_VERSION` = 4, `DraftReplyV4`, `REPLY_V4_PROPERTIES`, `OutlineOrder`, `outlineOrderOf`, `outlineStagesOf` |
| *the review round (§20.11)* | |
| roadmap-catalog | `FIELD_FAMILY_PROGRESSION`, `ProgressionTrackRule.examStages`, `progressionFamilyOf`, `progressionRuleFor(track, {family?, exam?})`, `practiceFamilyOf(intake)`, `practiceFamilyOfCoverage`, `coverageJsonOf(coverage, confirm, family?)` (a third argument) |
| | `EXAM_PREP_MIN_DAYS` (21), `examStagesOf(rows, examDay)` → `{examStage, examPrepStage}` |
| | `ProgressionInput.family?`, `.examPrepStage?`; `Progression.family`, `.examPrepStage`, `.mockStage`; `StageProgression.afterExam`; `ProgressionWhy` `CORE`, `PICK`; `progressionCandidatesOf` and `progressionPickEnumsOf` take the run's `family` |
| | `progressionViolationsOf` codes `EXAM_PREP`, `AFTER_EXAM`, `DEFAULT`, `CORE` (and PICK, CARRY and EXAM reworded) |
| | `PRACTICE_FOCUS_SHARES` (2), `practiceSizesOf(kinds, budget, floor?)`; `practicesThatFitOf` now ⌊budget ÷ unit⌋ − 1 |
| roadmap-types | `PracticeFamily`, `PRACTICE_FAMILIES`, `PRACTICE_FAMILY_DEFAULT`, `isPracticeFamily`, `practiceFamilyPrefillOf(aim, examLabel?)`, `Intake.practiceFamily?`, `PRACTICE_FAMILY_KEY` (`"$practiceFamily"`) |
| *R3, as shipped (read from the code; the second review asked for them here)* | |
| roadmap-validate | `KeysOnlyDraft.picks`, `.order`, `.reordered`; `KeysOnlyContext.progression` (`examStage`, `maxPractices`); `keysOnlySchemaV3Of`, `isV3Schema`, `runPickKindsOf`, `PackRun.pickKinds` (and `.family`), `keysOnlyProgressionInputOf`, `replyV4OfV3`, `schemaAsksNothing`, `packAsksNothing`; the rules `keys.pick`, `keys.pick-default`, `keys.pick-reshaped`, `keys.pick-code`, `keys.order-kept` and their `KEYS_ONLY_REASONS` |
| roadmap-evidence | `EvidencePackV4`, `pickStagesOf`, `PickStageRow`, `EvidenceInput.pickStages` |
| scripts/roadmap-probe.ts | `--offline` (the offline part only: no key, no network) |

### 20.8 Handoffs, by item (each is a HANDOFF line in roadmap-contract-check)

A HANDOFF line passes once its owner lands. Unlike PENDING, `--strict` (and with it life:check) passes the open ones while the round runs. For the lead at the round's integration, `npx tsx scripts/roadmap-contract-check.ts --strict --handoffs` fails every one still open.

- **R2, roadmap-realism.ts** (3 lines):
  - Place every stage's practices, steps and checkpoint with `progressionOf`: the depth starter (`depthMilestonesOf`), `trackLadderOf`, `syncStagePractices` and `syncTrackStarter`. `requiredKindOf` and `trackKindsOf` go.
  - Build the `ProgressionStageInput`s from the ladder rows: held rows `held`, a STARTING or STARTED row `carried` with its live catalog kinds, BETWEEN and PART with their level, and `examStage` from the exam's day.
  - Size with `practiceSizeOf` and `stageBandFloorOf` (no second `bandFor` or `floorBandOf`), and pass `maxPractices` from `practicesThatFitOf` over each stage's budget.
  - Split the outline in Gemini's order with `outlineStagesOf`, through a new `StageLadderOpts.order`, with `StageLadderOpts.picks` for the reply's picks. Write each placed kind's notes with `progressionNotesOf`.
  - Re-sync rules: keep the user's rows (YOURS, EDITED); never re-add a kind the user REMOVED on that stage; take out a code row the progression no longer wants (WORKED_OUT only).
  - roadmap-realism-check's starter goldens move with it: the starter now holds steps, self-tests and two or three practices per stage. `progressionViolationsOf` over its plans is the recommended property.
- **R3, roadmap-validate.ts, roadmap-evidence.ts and roadmap-model.ts** (3 lines):
  - The v4 schema (§20.5), with `progressionPickEnumsOf` over the pack's run (the gate's `blocked` as before). The pack's run facts gain the per-slot enums.
  - `validateKeysOnly` reads a v4 reply: `needs` as before; `order` through `outlineOrderOf`, so no line is dropped and none goes uncovered; `picks` per slot, handed to the plan path. It no longer makes practice, step or checkpoint items itself.
  - The v4 system instruction asks only for the three things: the Domains the aim needs, the outline's order, and one practice type per stage from its list. There is no "Pick practice, step and checkpoint kinds", and the glossary lists only the offered kinds.
  - roadmap-model-check's instruction golden and its v3 schema walk move to v4, and the canned corpus replies get v4 forms.
- **R4, roadmap-server.ts** (1 line):
  - Materialise a v4 reply through the progression: R2's ladder with the reply's picks and order, or `progressionOf` itself. GEMINI_PICK sits only on a picked focus (and its BETWEEN copy).
  - Re-plan and Start rebuild the DRAFT stages with the started stages `carried`. The week quests keep reading the started milestone's practices through the gate (R6: no change).
  - `draftFromReply` keeps the integrity walk, the REJECTED gate and the tripwire.
  - In roadmap-server-check, "every TOPIC label equals its intake line" still holds, now in Gemini's order.
- **R5, roadmap-copy.ts** (1 line):
  - The v4 draft header names Gemini's smaller part: the Domains it suggested, the outline's order, and the one practice type per stage it picked from the app's list. It no longer says Gemini "picked practice types from the app's list" for every kind.
  - A row still reads "practice type picked by Gemini from the app's list" (GEMINI_PICK) or "added by the app" (STUDY_ADDED, PRODUCTION_ADDED). Steps and checkpoints are always the app's.
  - *As shipped (the second review):* the pick reads as "Gemini's choice among the app's options" (`geminiChoiceOf`, `geminiChoiceLine`: how many options the stage had and the app's default). The lead line and the button line should name only the parts the run issued and the reply used (needs, order, any pick), and say "the app chose every practice" with no pick; and the options must be the gate-filtered, family's candidates Gemini was offered (§20.11 handoffs).
- **The probe item, scripts/roadmap-probe.ts** (1 line; updated, never run): send the v4 schema, and label practice fit and arrangement from the plan the progression builds with the reply's picks (`progressionOf`), so the gate reads code's plan, not the raw reply. The 2 approved calls (actuarial-probability and new-subject) wait for R3's v4 schema.
- **R7, the hallucination bar** (no line): family F's blessed replies are v3. A v4 corpus of replies (picks and order, hostile picks among them) seeds the v4 views. When blessed fixtures or generators change, the pin moves and the lead re-blesses.
- **R6, the week quests** (no line): practice quests come from the started milestone's practices, which are now the progression's, through the gate as before.
- **Docs** (no line): roadmap-rev4.md's F-R4-13, F-R4-17, F-R4-18 and F-R4-23 record §20 (PROGRESSION, the v4 reply, the probe's gate read over code's plan). PROGRESS.md is the lead's.

### 20.9 What roadmap-contract-check pins (the §20 section)

- **The tables** (one check of every rule in §20.2), the stage keys, code's defaults per track, `CHECKPOINT_RUNG`, `BUILD_UP_RULE`, and the closing step per track.
- **Goldens**, each as the whole plan, stage by stage:
  - a Field plan to Mastered: no exam; an exam with no day; its day in Familiar; depth 8 with the day in its last stage;
  - room for two, and room for one, the latter with picks the shape overrides and picks it keeps;
  - a language's picks, with the carry of an equal focus;
  - invalid picks of every kind, which give the defaults;
  - a held Foundation, a PART first and BETWEEN stages, with the exam's day in BETWEEN 7;
  - the user's Field AVOIDs;
  - practices off;
  - a re-plan with the first stage carried;
  - BODY waiting (lose-8kg's real gate), answered "Nothing to avoid" (run-10k), and with only the harder session avoided;
  - CARE waiting and answered; CRAFT with a cue and without; merged track stages; DUTY with an exam and room for two; a single stage;
  - a frozen input (pure and deterministic), and no stage at all.
- **The pick enums** (a Field exam run; BODY waiting; practices off; foreign slots), `progressionPickOf`, `progressionNotesOf` and `progressionShapeOf`.
- **The checker catches each breach.** 18 injected breaches cover every code (EXAM four ways, CAP two), and `progressionViolationsOf` names each one.
- **The property:**
  - The inputs: 12 corpus packs × 5 catalog tracks × each pack's gate states (1,068 in all) × 4–6 stage lists per track × every exam placement (none, no day, its day on each stage) × practices on and off, with picks and room varied. That is 62,594 plans.
  - The stage lists: full, with BETWEEN, held first, PART first, merged and carried first on a Field plan; full, merged, single and carried first on a track.
  - The gate states: unanswered, "Nothing to avoid", every practice avoided, the safe kinds avoided, a stale answer, and each kind avoided alone.
  - It asserts the lead's four independently: every stage has practice when practices are allowed and the gate leaves one; no lastStageOnly kind before the last stage; escalation never falls; no avoided or pending kind is placed.
  - It also asserts that `progressionViolationsOf` finds nothing, which covers the carry, the climb, the shape, the exam placement and the caps.
  - While it was being written, it found two defects, both fixed: a BETWEEN or PART copied its gate's exam extra off the exam stage, and with room for one practice the Field shape couldn't be restored when the stage's own role kind was avoided.
- **Sizing goldens** (`stageBandFloorOf`, `practiceSizeOf` at realism's numbers, `practicesThatFitOf`), and the v4 reply's shapes (`DraftReplyV4`, `REPLY_V4_PROPERTIES`, `outlineOrderOf` with hostile keys, `outlineStagesOf`).
- **The 9 HANDOFF lines** (§20.8).

### 20.10 Deviations and open points for the lead

*The review round (§20.11) settled points 1, 5, 9 and 11, and changed 10 and 12; each says how.*

1. **"Mock tests only from the stage holding the exam"** is read literally: a mock test sits only on the exam's stage. *(Settled in §20.11: the review ruled a dated exam needs its run-up, so the mock test now sits on the stage before a dated exam's; undated, on the last stage, which holds the exam.)*
   - With no day, the exam's stage is the last stage, and it holds the mock test.
   - With a day, that stage's one checkpoint is the exam itself, so no mock test is placed. The rehearsal is that stage's timed practice.

   Rev 4's starter put a mock test one stage before a dated exam. If you want that back ("the exam's run-up"), it is one rule in `progressionOf` and one line in the checker.
2. **No self-test on the first stage**, so accept (which checks the next milestone's bar) stays as light as before. Every Field gate stage after it and before the exam (or the last) holds one, and each asks for the user's bar when it becomes the next milestone. Between a dated exam and the last stage there is none, because escalation never falls. *(§20.11: a BETWEEN or PART stage now takes one too, escalation allowing; the first stage holds the mock test when a dated exam's stage is the second.)*
3. **A PART now carries its gate's practices** (rev 4: none), so every stage carries practice. This settles the open question in F-R4-13 in favour of R2's motivation timeline.
4. **A blocked focus first takes the stage's next placeable candidate**, which may be a non-safe kind the user's answer released (BODY with only the harder session avoided → longer). Only when there is none does a safe stand-in take its place. While the card waits, every non-safe kind is blocked, so a waiting plan is safe kinds only, as ruled. Say if you want only safe stand-ins even after a partial answer.
5. **The room's priority** is focus, partner or carry, the exam's timed practice, then the base. With room for two, an exam stage keeps the carry over timed practice. Say if the exam should come first. *(Settled in §20.11: EXAM and CORE now rank before the carry.)*
6. **The full attempt closes Field, BODY and CRAFT plans only**; a CARE or DUTY routine closes on the performance check alone. Rev 4's starter placed no full attempt on any plan; the probe's labellers read a last stage with no attempt as missing the aim.
7. **`BOOK_EXAM` sits on the first stage whenever there is an exam**, not only with a day (rev 4's starter). Booking is most needed when no date is set.
8. **HANDOFF, not PENDING.** life:check runs the contract check with `--strict`, and this round's items land after lane 0, so the adoption lines don't fail `--strict`. Run `--handoffs` at integration, or turn them into `pending()` once the round ends.
9. **The version is 4 before R3's v4 instruction and schema land.** A v4-numbered pack still carries the v3 schema and instruction until then. That is harmless while `ROADMAP_GEMINI_LIVE` is false, but the probe must not run before R3 lands. *(Settled: R3's v4 instruction and schema landed in the first round.)*
10. **An out-of-enum pick still REJECTs the whole reply** (F-R4-20 unchanged). The plan is then the starter, which is code's defaults, but the reply's `needs` and `order` are lost too. R3 could treat a bad pick as salvageable instead; that is your call. *(Changed in the review round: `order` is optional, so a reply without one is never REJECTED; an out-of-enum value still is.)*
11. **The tables are judgement.** CARE and DUTY don't climb past rung 2: a routine holds rather than escalates. Field Mastered's default is "Build something with {domains}", the most general integrating kind, which reads oddly for some aims (an actuarial exam). Gemini's pick, or the user's swap, covers that. *(Settled in §20.11: a Field plan reads its family's table, and a KNOW plan with an exam goes over mistakes at Mastered.)*
12. **The hostile pin didn't move**, because nothing in the corpus or its generators changed. It will move when R3's v4 replies or R7's v4 corpus land. *(It moved with them; the review round's table changes move it again through the generator's pick enums. The lead re-blesses.)*

### 20.11 The review round: the exam's run-up, the families, additive picks and the room (the contract item)

The two reviews of the progression round found that code's progression kept its own rules everywhere but did not yet lead to high mastery realistically:
- dated exams got no mock test and often no timed practice, and the full attempt and the performance check landed after the exam;
- every Field aim got the one maths-shaped table, with no speaking, listening or performing;
- a third practice diluted every kind to one session a week;
- Gemini's pick replaced code's default, was carried forward, and was copied into BETWEEN and PART stages.

This item fixed the catalog's half. The other items adopted it in the same round (§20.11.9).

#### 20.11.0 State of the tree after this item

- **Files:**
  - roadmap-catalog.ts: the progression section, the sizing, `coverageJsonOf` and the header index.
  - roadmap-types.ts: the practice family, `Intake.practiceFamily`, `PRACTICE_FAMILY_KEY` and the header index.
  - scripts/roadmap-contract-check.ts: the §20 section rewritten, and 6 new HANDOFF lines.
  - This section, and the notes in §20.1, §20.5, §20.7, §20.8 and §20.10.
- **No schema change and no migration.** The family is stored in `Roadmap.coverage` under `PRACTICE_FAMILY_KEY`, beside the activity answers.
- **Gates** (DATABASE_URL and DIRECT_URL pointed at a closed port, no model key):
  - `npx tsc --noEmit -p .` is clean, and eslint is clean on the three code files.
  - roadmap-contract-check `--strict` passes: 602 passed, 0 failed, and no handoff open. The other items had adopted every new definition by the end (§20.11.9).

#### 20.11.1 The exam (review 1: findings 1, 4 and 9)

- **The run-up.** `ProgressionInput.examPrepStage` is the stage that holds a dated exam's run-up. `examStagesOf(rows, examDay)` computes both indices from the rows' windows, one definition for R2 and R4:
  - `examStage`: the first stage not held whose window ends on or after the exam's day, else the last;
  - `examPrepStage`: the exam's own stage when the exam falls `EXAM_PREP_MIN_DAYS` (21) or more into its window, else the stage before it (the exam's own when there is none).
  - Absent with a day, the run-up is the stage before the exam's. Without a day, the exam's stage (the last) is its own run-up.
- **Timed practice (EXAM)** sits on the run-up and on the exam's stage, ranked right after the focus and before the carry. On a BETWEEN or PART stage that is full (room for two or more), it takes the place of the last copied practice. With room for one, the focus stays.
- **The mock test** is the checkpoint of the stage before a dated exam's (escalation: self-test → mock → exam). With no day, the last stage holds the exam and its mock test, as before. A blocked mock gives way to a self-test on a Field plan while escalation allows.
- **CORE.** On an exam plan, the plan's first production focus stays in every stage up to the exam's, ranked before Gemini's pick and the carry. By default that is problem sets; on a LANGUAGE plan, saying it aloud; on CRAFT, run-throughs.
- **Going over mistakes** is the first base kind on the run-up and the exam's stage (the review's fix), after the carry. Elsewhere the base is the first base kind not yet placed (§20.11.6). A BETWEEN or PART stage, or a stage after the exam, copies code's practices but never timed practice or a pick.
- **A KNOW plan with an exam** reads `examStages`:
  - Fluent offers explaining, problem sets, mistakes and writing.
  - Mastered's default is going over mistakes (then problem sets, explaining, a partner), and its role step is listing the gaps. On the exam's stage that gives going over mistakes, timed practice and the problem sets (the core).
  - Building is never offered on a KNOW exam plan.
- **After a dated exam** (`StageProgression.afterExam`), a stage keeps what the exam's stage trained: its practices, without timed practice or a pick, then the base and the shape. It holds no step and no checkpoint. So the full attempt and the performance check never land after the exam, and nothing climbs. R2 should end an exam aim's ladder at the exam's stage, or mark the later stages as optional (§20.11.9).
- **A BETWEEN or PART stage takes a self-test** (on a Field plan, not the first stage) while escalation allows, so a long copy stage is never unmeasured.
- **Disputed:** the review asked for FULL_ATTEMPT on the run-up when a dated exam comes before the last stage. It is not placed:
  - the mock test on the stage before the exam is that paper: "Use a practice paper in the exam's format. Sit it timed and without notes, as on the day";
  - FULL_ATTEMPT is lastStageOnly ("performs the aim itself"), a rule that four checks pin independently (contract, realism, server and ui) and that R3's validator enforces;
  - with nothing placed after the exam, no full attempt or performance check lands after it either.

#### 20.11.2 The practice families (review 1: finding 2)

- **`PracticeFamily`** (roadmap-types) is KNOW (the default), LANGUAGE, PERFORM or BUILD.
  - A Field plan reads its family's table (`FIELD_FAMILY_PROGRESSION`; KNOW is `PROGRESSION.FIELD`).
  - The rungs, the carry and the climb are the same for every family.
  - A track Area has no family; its table is its track's.

| Family | Foundation → Familiar → Retained → Fluent → Mastered (default first) | Partner · base · role steps |
|---|---|---|
| KNOW | study, recall · recall, slow drills · problem sets, explain, writing · explain, problem sets, mistakes, writing, a partner, building · building, a partner. *With an exam:* Fluent explain, problem sets, mistakes, writing · Mastered mistakes, problem sets, explain, a partner | recall (else study) · recall, mistakes · outline, gaps, explain once, a small project (the gaps with an exam) |
| LANGUAGE | listen and repeat, study · recall, slow drills · say it aloud, writing, explain · a partner, say it aloud, writing, mistakes · a partner, run-throughs | recall (else study) · listen and repeat, recall · gaps, explain once (aloud, to someone), a small project |
| PERFORM | study, listen, slow drills · slow drills, recall · run-throughs, say it aloud, mistakes · run-throughs, a partner · a partner, run-throughs | slow drills (else recall) · slow drills, recall · gaps, a small project |
| BUILD | study, recall · recall, slow drills · problem sets, writing, explain · building, problem sets, mistakes, a partner · building, a partner | recall (else study) · recall, mistakes · outline, gaps, a small project, explain once |

- KNOW no longer offers listening, saying it aloud or full run-throughs. The review had found "listen and repeat or say it aloud for maths, full run-throughs for code".
- **The family is one closed choice, and it is the user's.** `Intake.practiceFamily` is the answer to a form question. The form prefills it with `practiceFamilyPrefillOf(aim, examLabel)`, code's reading of the user's own words (examPrefillOf's pattern):
  - "public speaking" or a speech: PERFORM;
  - a language exam (IELTS, JLPT …), a language skill word, a word for "language" or "speak" (English and a few others), 語 or 语, or a language name not followed by a topic word: LANGUAGE;
  - an instrument, singing, dancing, sailing, playing: PERFORM;
  - making things (build, app, software, coding …) on an aim that is not a credential: BUILD;
  - else KNOW.

  On the corpus, this reads IELTS, Japanese at work and the Vietnamese aim as LANGUAGE; the guitar and the dinghy as PERFORM; and the Python certificate, the trader and the actuarial exam as KNOW.
- **Storage.** The family lives in `Roadmap.coverage["$practiceFamily"]` (`PRACTICE_FAMILY_KEY`). `coverageJsonOf(coverage, confirm, family?)` writes it, and `practiceFamilyOfCoverage` reads it. An unknown value is never written, and reads as null.
- **`practiceFamilyOf(intake)`** is what every plan path passes: as `ProgressionInput.family`, and as the run's family for the pick enums. It returns the user's answer, else the prefill.
  - *Deviation:* the review said "the default is KNOW". A plan whose intake has no answer (every intake before this round) reads the prefill, not KNOW. So the corpus's language and performance aims get their tables without waiting for an answer.
  - Making the fallback KNOW is one line in `practiceFamilyOf`.
- **Gemini never sets the family**, and it is not in the v4 schema. The review's alternative (one more enum, shown as Gemini's choice) is not taken: drafting is off (`ROADMAP_GEMINI_LIVE` false), so the starter every user gets must already have the right family.

#### 20.11.3 Gemini's pick is added, never in place of code's default (review 1: finding 3)

- **The focus is always code's default** (the first placeable candidate).
  - A valid pick that differs is a PICK, placed after EXAM and CORE and before the carry and the base.
  - A pick of the default itself marks the FOCUS (`picked`, GEMINI_PICK).
  - With room for one, or when EXAM and CORE fill the room, the pick waits. R3 logs `keys.pick-reshaped`, or `keys.pick-code` when the stage trains it anyway.
- **Nothing passes the pick on.** The next stage carries code's default, not the pick. A BETWEEN or PART stage, or a stage after the exam, never copies a pick, and a copied default is no longer marked picked.
- **The candidates are the family's**, so a kind that doesn't suit the aim is no longer offered as a pick.
- **The accept blocker is R4's.** `acceptBlockersOf` now blocks, on every track, a pending GEMINI_PICK that is not code's default (`DECIDE_PRACTICE_PICKS`: "Keep Gemini's picks, or use the app's default").
- **`isUndecidedItem` is unchanged.** It covers Gemini's words left PENDING, and a pick row holds code's words (origin CODE). Making it cover picks would change `draftNeedsOf` for every page that counts rows. R4's plan-wide blocker already holds a pick that differs from the default.
- **The rules:** `progressionViolationsOf` gains three codes:
  - DEFAULT: code's default missing with room for two or more;
  - PICK: a valid pick left out while a lower-ranked slot was free or used;
  - CORE.

  The contract check's property also asserts, independently, that for every pick vector each stage keeps the FOCUS, EXAM and CORE kinds of the plan built without picks.

#### 20.11.4 Start, then a re-plan (review 1: finding 5; review 2: the carried branch)

- **A carried stage** reads what it carried the way a fresh stage chose it: the partner on the chain's first stage, or else the carry from `[prevFocus, prevCarry]`. It never reads the exam's timed practice or the core as its carry.
- **A carried copy** (a BETWEEN or PART stage, or a stage after the exam) sets nothing the next stage builds on, as when it was built. So a started PART leaves Familiar with recall drills and study (the review's A'), not recall drills alone.
- **The property:** for every plan in the property without picks, carrying any stage with exactly its own kinds leaves every other stage as built (71,282 re-planned stages).

#### 20.11.5 The room and the sizing (review 1: finding 7)

- **`practicesThatFitOf(budget, floor?)`** is now the most practices that still give the focus two sessions a week and every other practice one, at the stage's floor (D30 without one): ⌊budget ÷ unit⌋ − 1, from 1 to 3. For example:
  - Fluent at 135 min a week holds two practices, not three;
  - 90 min at D45 holds one.
- **`practiceSizesOf(kinds, budget, floor?)`** sizes a stage's practices together, in the progression's order:
  - the focus takes `PRACTICE_FOCUS_SHARES` (2) shares, and every other practice one;
  - the focus also takes the rounding remainder;
  - a BODY longer session sits at least one band above the easy session.

  At Fluent's 135 min, explaining gets 2 × D45 and problem sets 1 × D45. On run-10k's Stage 3, the longer session gets 2 × D60, and the technique and easy sessions 1 × D45 each. `practiceSizeOf` is unchanged.
- **R2's `allocate` adopts `practiceSizesOf`** (its HANDOFF line passes).

#### 20.11.6 The rest

- **BODY's last stage (review 1: finding 8).** When the gate holds every candidate of a stage, a track's stand-in first tries the stage before's focus, then that stage's other candidates at or above its rung. Only then does it take a safe kind, and only if that kind isn't easier.
  - With harder avoided, Stage 5 keeps the longer session and its three practices.
  - With harder and longer avoided, it keeps strength.
  - While the card waits, every non-safe kind is blocked, so the stand-ins stay safe: the technique session the stage before trained stands in, not the easy one.
- **The base** is the first base kind that is placeable and not yet placed (`!taken`), so going over mistakes now appears from Retained. A retrieval stage (Foundation, Familiar) never takes a production kind as its base, because going over mistakes needs work to go over. The exam's run-up is the exception.
- **A copy with nothing to copy** (a carried source whose kinds the gate now holds) takes the least demanding placeable practice, so no stage is left without practice.

#### 20.11.7 The default plans now (contract-check goldens)

| Stage | KNOW, no exam | KNOW, an exam with no day | LANGUAGE | PERFORM |
|---|---|---|---|---|
| Foundation | study + recall · choose material | the same · + book the exam | listen and repeat + recall | study + slow drills + recall |
| Familiar | recall + study · outline · self-test | the same | recall + listen · the gaps · self-test | slow drills + study + recall · the gaps · self-test |
| Retained | problem sets + recall + mistakes · the gaps · self-test | the same | say it aloud + recall + listen · explain once · self-test | run-throughs + slow drills + recall · self-test |
| Fluent | explain + problem sets + recall · explain once · self-test | explain + problem sets (core) + recall · self-test | a partner + say it aloud + listen · a small project · self-test | run-throughs + slow drills + recall · a small project · self-test |
| Mastered | building + explain + recall · a small project, the full attempt · performance check | mistakes + timed practice + problem sets (core) · the gaps · mock test | a partner + say it aloud + listen · the full attempt · performance check | a partner + run-throughs + slow drills · the full attempt · performance check |

Some dated exams:
- **The day in Familiar** (no run-up given): Foundation takes timed practice and the mock test, and Familiar timed practice and the exam. Retained to Mastered keep Familiar's practices, with no step and no checkpoint.
- **IELTS, the review's case:** a LANGUAGE plan whose exam falls six days into Toward Mastered, so the run-up is Fluent.
  - Fluent holds a partner, timed practice and saying it aloud (the core), and closes on the mock test.
  - BETWEEN 11 copies Fluent and holds timed practice and the exam.
  - Mastered keeps what was trained.
- **CRAFT with a graded exam on Stage 4:** the mock test on Stage 3, run-throughs kept as the core, and Stage 5 after the exam.

#### 20.11.8 What roadmap-contract-check pins now (the §20 section)

- **The tables:** all 16 (the four Field families and the four track tables, each with and without the exam's stages). The check covers every §20.2 rule, each family's defaults, and that each family trains its aim's skill.
- **The family:**
  - `practiceFamilyPrefillOf` over the corpus's aims and hostile ones;
  - `practiceFamilyOf` (the answer wins);
  - `coverageJsonOf` and `practiceFamilyOfCoverage` round-trip (prototype keys and arrays read null).
- **Goldens:**
  - each family's default plan;
  - the exam undated, on Familiar, on Fluent with its run-up, at depth 8, IELTS, and CRAFT's graded exam;
  - room for two, and room for one;
  - additive picks, and picks on an exam plan; invalid picks;
  - held, PART and BETWEEN stages, and a BETWEEN's self-test;
  - the Field AVOIDs; practices off;
  - a carried first stage, and Start then a re-plan (A');
  - BODY waiting, answered, with harder avoided, and with harder and longer avoided;
  - CARE, CRAFT, merged stages, DUTY, a single stage, a frozen input and no stage.
- **Also:** `examStagesOf`, the per-family pick enums, and the notes (PICK, CORE, EXAM).
- **26 injected breaches** cover every code, among them EXAM_PREP ×3, AFTER_EXAM ×2, DEFAULT and CORE. The clean plan breaks nothing.
- **The property:** 62,594 plans. The inputs are the 12 packs × 5 tracks × 1,068 gate states × stage lists × exam placements and run-ups × practices on and off, with picks, room and the four families varied. It asserts, independently:
  - the lead's four;
  - nothing placed after a dated exam;
  - every pick vector keeps code's FOCUS, EXAM and CORE kinds;
  - carried equals fresh on a re-plan (71,282 stages);
  - and `progressionViolationsOf` finds nothing.
- **Sizing:** `practicesThatFitOf`, and `practiceSizesOf` within its budget.
- **6 new HANDOFF lines** (§20.11.9).

#### 20.11.9 Handoffs (HANDOFF lines; their state when this item finished, read from the tree)

- **R2, roadmap-realism.ts:**
  - Pass `family: practiceFamilyOf(intake)`, and `examStage` and `examPrepStage` from `examStagesOf` over the rows' windows. *(Landed.)*
  - Size with `practiceSizesOf`. *(Landed.)*
  - End an exam aim's ladder at the exam's stage, or mark the later stages as optional. *(No line.)*
  - Map merged track rows by position, so a short plan starts at STAGE_1 (STAGE_2 for WORKING) and ends at STAGE_5. *(Review 1, finding 6; no line.)*
- **R3, roadmap-validate.ts and roadmap-evidence.ts:**
  - The pick enums are the run's family's (`PackRun.family`). *(Landed.)*
  - `order` optional, the empty schema never sent, `gaps` without maxLength, and pick enums only for the ladder's stages. *(Landed; see §20.5.)*
  - roadmap-model-check's pins of the first round's tables, and of "GEMINI_PICK on the stage's first practice", move to the family tables and additive picks.
- **R4, roadmap-server.ts:**
  - `intakeOf` reads the family (`practiceFamilyOfCoverage`), and `intakeData` and the activity answer keep it (`coverageJsonOf`'s third argument). *(Landed.)*
  - A pending non-default pick blocks accept on every track (`DECIDE_PRACTICE_PICKS`). *(Landed; no line.)*
- **R5:**
  - The form asks the family, prefilled by `practiceFamilyPrefillOf`. *(Landed.)*
  - `stageOptionsOf` reads the plan's family and gate. *(Landed.)*
  - The plan shows the family, with [Change].
  - The lead line names only the parts the run used (§20.8).
- **R7, the hostile bar:** the generator's pick enums are `progressionPickEnumsOf`'s, so the tables' change moves the pin. The lead re-blesses.
- **The other items' goldens.** roadmap-realism-check and roadmap-model-check pinned the first round's plans:
  - Field defaults with no base at Retained;
  - timed practice on the exam's stage alone;
  - BODY's waiting stand-ins;
  - picks as the focus.

  Those lines fail until their owners re-pin them. Each failing line is this round's intended change (§20.11.1–§20.11.6).

#### 20.11.10 Deviations and open points for the lead

1. **The family's fallback is the prefill, not KNOW** (§20.11.2). Say if an unanswered intake should read KNOW.
2. **FULL_ATTEMPT is not placed on the run-up** (§20.11.1, disputed with evidence). The mock test before the exam is the full paper under exam conditions.
3. **After a dated exam the stages keep practising, unchecked.** This keeps the lead's "every stage carries practice whenever practices are allowed". If R2 ends the ladder at the exam, there are no such stages.
4. **The exam's stage at low hours.** With room for two it holds going over mistakes (Mastered's exam default) and timed practice; with room for one, going over mistakes alone. Problem sets as the exam default would serve a one-practice stage better (they generate the mistakes to go over); the other items had already pinned the mistakes default when this was weighed, so it is left to you (one line in `PROGRESSION.FIELD.examStages`).
5. **With room for one, the exam's stage keeps the focus, not timed practice.** At very low hours (3 h a week at a D45 floor), the exam's stage may hold only one practice. EXAM_PREP requires timed practice only with room for two or more.
6. **The tables are still judgement**, now per family. The lead may tune any list. The table checks hold every candidate list to the climb, with and without the exam's stages.
7. **R2's guard on BODY sizing.** R2's `allocate` holds a harder and a longer session to at most two a week each (`BODY_SESSIONS_MAX`, "for the lead to fold into" `practiceSizesOf`). `practiceSizesOf` itself doesn't cap them: its golden gives a harder focus three sessions at 240 min. Folding the cap in is one rule in `practiceSizesOf` and a golden.
8. **F-R4-13's shape and a PERFORM plan at low hours.** Slow drills have no retrieval or production role (`practiceRoleOf`), so with room for one, a PERFORM Familiar stage holds recall drills, not slow drills (guitar at 3 h a week). Giving slow drills a role is a change to the one definition of retrieval and production, which pay honesty also reads, so it is left to you.
