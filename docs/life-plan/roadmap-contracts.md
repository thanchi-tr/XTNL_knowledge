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
| `BODY_SAFE_KINDS` | EASY_SESSION, MOBILITY_SESSION, TECHNIQUE_SESSION |
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

**PENDING (lead), a live regression until fixed:** `src/components/library/library-model.ts outcomeOf` compares `d === "strike" || d === "degraded" || d === "shielded"`, so a tagged miss reads null and the idea page's history drops it. The fix is one line: `if (d.startsWith("strike") || d.startsWith("degraded") || d.startsWith("shielded")) return "miss";`. roadmap-contract-check lists the file as the one known exact reader and prints a PENDING line; it fails if any other exact reader appears, and once library-model.ts is fixed it fails until the KNOWN_EXACT_READERS entry is deleted. **Do not ship srs.ts without it.**

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
7. **library-model.ts** (§14.11): one line, lead-owned, required before shipping srs.ts.
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
| lead | life-sizing refuses an 'rm:' template; library-model outcomeOf (two lines) |

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
- R7 owns the H6 required list, which covers every cue.*, resource.* and flag.* rule a gap string can reach. Add a gated E sub-class of one-source claims.
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
- **library-model.ts:397.** Change it to `if (d.startsWith("strike") || d.startsWith("degraded") || d.startsWith("shielded")) return "miss";`, then delete roadmap-contract-check's KNOWN_EXACT_READERS entry. The tagged-string goldens are now pinned in roadmap-contract-check (review-facts strict, library-model PENDING). **Do not ship srs.ts without it.**
- **life-sizing.ts applySizing.** Return early for `isRoadmapCaptureKey(template.captureKey)`, with no model call, writing the code basis.
- **Spec lines.** Write the §15.2 changes into roadmap-rev4.md: Constants, the F-R4-9 golden, and F-R4-14's example. *(Done after fix round 2, with the items below: roadmap-rev4.md "As shipped".)* Also record:
  - §15.4's deviation from decision 40;
  - §15.10's HIDDEN state and F-R4-1's LATER × wording;
  - the OUTLINE_EMPTY_LINE vs "no Gemini sentence" conflict (R5 gates it).
- **Also open:**
  - set `AIM_INVITE_SINCE` to the deploy day (done in fix round 2: Tue 6 Oct 2026, §16.5; move it on a later deploy);
  - the Goal ▾ "New aim" option (capture-ui.ts, InsertRow.tsx);
  - ui-audit's 410 px and 72 px gates;
  - PART pay: R2's timeline counts PART as paying ⬡6 while R4 copies no practices to it, so one of them is wrong.
  - ADD during a PART stage asks only toward the PART count (R6), while R2's writing plan keeps writing at r_plan. Consider pacing ADD from the StartSnapshot's needRateByDomain.
- **At integration,** run `npm run roadmap-contract:strict`, then make life:check run it with `--strict`, and update life-day-check's exact list to match.

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
- **life:check is unchanged.** It can run `--strict` only after every lane's PENDING has landed.
- **The integration pin:** roadmap-contract-check now accepts `tsx scripts/roadmap-contract-check.ts --strict` in the life:check tail, so the flip needs no edit to this check.
- **At integration** (lead), once `npm run roadmap-contract:strict` exits 0:
  - package.json life:check runs `tsx scripts/roadmap-contract-check.ts --strict`;
  - scripts/life-day-check.ts:253–254's exact list must expect that string, or life-day-check fails. It builds `tsx scripts/<name>-check.ts` for each name.

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
  - `H6_REQUIRED_PREFIXES`, `H6_GAP_UNREACHABLE` and `h6RequiredOf` (R7 owns the H6 required list of 60 rules);
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

### 16.9 Handoffs, by lane (exact)

**R1:**
- roadmap-measures-check:1520: want `[184, 264]` for `[M.retryReadDaysOf(12, 1), M.retryReadDaysOf(12, 1.5)]`. Rename the check to "(interval 160 + grace 11 + 1) + (grace 10 + 2) = 172 + 12 (m 1.5: 252 + 12)".
- roadmap-measures-check:1581–1582: "over the last 173 days" and `addDays(today4, -173)` become 184. Better, read `RT.retryReadDaysOf(12, 1)`.
- Nothing else: your readings already read the window through retryReadDaysOf.

**R2:** nothing from lane 0. The WRITE_MARGIN ruling (§16.10) may re-pin your goldens.

**R3:**
- **Optional (lens 1 minor):** a contrast break ("but", "however", "now") should end a cue before it takes a term when the next clause holds a positive cue ("cleared", "recovered", "fine", "ok"). Add body-plan goldens such as "injured, but cleared to run". Otherwise the lead states it under question 11 as a known over-exclusion.
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
- **library-model.ts:397 (blocker):** change it to `if (d.startsWith("strike") || d.startsWith("degraded") || d.startsWith("shielded")) return "miss";`. Then delete roadmap-contract-check's `KNOWN_EXACT_READERS` entry; by design, its "still exact" check fails once the file is fixed. **Do not ship srs.ts without this fix.**
- **The Resize channel (§16.4):**
  - life-sizing.applySizing selects captureKey and returns "done" for `isRoadmapCaptureKey` before any model call, writing code's basis;
  - tasks.ts `resizableCore` refuses with "A plan-born task's size comes from its practice.";
  - TaskDrawer's `canResize` excludes 'rm:' rows.
- **ui-audit:**
  - Gate `[data-aim-card="empty-ask-continue"]` and `[data-aim-card="empty-ask-seed-last-aim"]` at ≤ 410 px at 344. State whether 410 bounds `section.rm-ac-call` or the whole fixture box, which is about 427 px with the "Aim" header.
  - On /dev/style/today, gate every visible `[data-state^="aim-"] .rm-aim-line` at ≤ 72 px, with `.rm-aim-line-t`'s scrollHeight ≤ clientHeight + 1.
- **The Goal ▾ "New aim" option (F-R4-7)** touches three files. capture-server-check's PENDING then switches on.
  - capture-ui.ts: a type-only CaptureAim import, `aim?` in insertMenuOptions' ctx, and the option when aim is "NONE" and the line has no mode;
  - InsertRow.tsx: an `aim` prop;
  - QuickCapture.tsx ~1891: `aim={vocab?.aim}`.
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
- **PROGRESS.md and question 11:** state the one-source grounded-claim residual (25 of 41, 61%) before ROADMAP_GAPS_LIVE can flip.
- **Mockups** (lane M or the lead) *(redrawn after fix round 2; §17.3)*:
  - final-aim-card.html: the two-line last aim, the LATER × as 'hide:', and the HIDDEN and KEPT frames;
  - final-today-quests.html: `.rm-aim-slot[data-close-due]`;
  - final-roadmap-new.html: REALISTIC's date control, and a ruling on "none" vs "0 at level 6+".
- **Review** the re-blessed hostile pin.json (sha d8f59181…).
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
4. **The KNOWN_EXACT_READERS entry stays** until library-model.ts is fixed. Deleting it first would fail the grep.

## 17. Revision 4 fix round 2: what the lanes shipped (read from the code)

§16 is lane 0's opening of fix round 2. This section records what every other lane exported or changed in that round, read from the code at its end, so that §14–§16 plus this section name every revision-4 export. Everything listed is new or optional, or a private helper named for the record; no export was renamed or removed. Five signatures changed (handoffNote, isDepthLoweringRow, planHistoryLine, taintHits and offersAim), and each is marked. docs/life-plan/roadmap-rev4.md, "As shipped", states the same behaviour in product terms, with the rulings still open.

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
- **roadmap-validate** gains the rule name `"constraint.release"`. It is in `RULE_NAMES` and not in `H6_RULE_NAMES`, so H6's required list is unchanged. constraintTokens also records `afterPause`.
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
- It prints `PENDING (R4)` while finishStartCore counts without the key's segment (§17.3).

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
- **The pin is re-blessed:** sha256 0dd9a8be08e4d70b…, 162 runs, 22,231 E strings.

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
- roadmap-quests-check: R4's finishStartCore counts;
- capture-server-check: the lead's Goal ▾ "New aim".

**The finishing round's handoffs (exact):**
- **Lead:**
  - **library-model.ts:397.** Change it to `if (d.startsWith("strike") || d.startsWith("degraded") || d.startsWith("shielded")) return "miss";`. Then delete roadmap-contract-check's `KNOWN_EXACT_READERS` entry, and add tagged goldens to review-check. **Do not ship srs.ts without it.**
  - **The Resize channel (§16.4):**
    - applySizing selects captureKey and returns "done" for `isRoadmapCaptureKey` before any model call, writing code's basis;
    - resizableCore refuses with "A plan-born task's size comes from its practice.";
    - TaskDrawer's canResize excludes 'rm:' rows.
  - **ui-audit:**
    - gate `[data-aim-card="empty-ask-continue"]` and `[data-aim-card="empty-ask-seed-last-aim"]` at ≤ 410 px at 344, and rule whether 410 bounds the section or the whole box;
    - gate every visible `[data-state^="aim-"] .rm-aim-line` at ≤ 72 px, with `.rm-aim-line-t`'s scrollHeight ≤ clientHeight + 1 at every audited width. Consider adding 768 and 1366;
    - add the legacy-active, legacy-draft and legacy-done boxes and the quiet boxes to the /dev/style/art/you 344 pass.
  - **Goal ▾ "New aim":** apply capture.md, revision 4, "The Goal ▾ menu" to capture-ui.ts, InsertRow.tsx and QuickCapture (`aim={vocab?.aim}`).
  - **PROGRESS.md and question 11:** state the one-source residual, 25 of 41 (61%), and the several-sources 0 of 1,958, before ROADMAP_GAPS_LIVE can flip. Question 11 in roadmap-rev4.md now states it.
  - **pin.json:** review it (0dd9a8be…).
  - **Integration:** get roadmap-contract:strict to 0. Then life:check runs `tsx scripts/roadmap-contract-check.ts --strict`, and life-day-check's exact list follows. Optionally add a `today-ui:strict` script.
- **R3:** scope the release to its own clause. Suppress terms only up to the next pause, break or cue, then restore the cue that was active.
  - Goldens: "knee injury, swimming ok, running not ok" → [running]; "knee injury healed, but running not ok" → [running]; "knee injury, cycling fine, running hurts" includes running.
  - Keep "injured, but cleared to run" → [] and "injured last year, now fully recovered and running daily" → [last, year].
  - Optional: add newDomainNames to labelBaseFor and labelContextFor, so a Domain name the user typed isn't flagged PROPER_NOUN.
- **R7:** add a K sub-class "{cue}, {other} is fine, {t} not ok / not allowed / is out / hurts" (it must exclude t), and the release phrasings R3 lists. Re-bless the pin after review. The REALISTIC-without-pace run waits on the option (b) ruling.
- **R5:**
  - RoadmapForm.tsx ~894: `const shortOfCount = coverage.some((c) => c.live < c.n)` and `newCardsRequired = realistic && shortOfCount && !paceMeasured`. Keep needsNewCards for askCards. Add ui-check goldens: 42 live cards against n 34 is not required; 9 against n 25 is;
  - roadmap.css: `@container main (min-width: 640px) { .rm-aim-line-t { -webkit-line-clamp: unset; } }`, or an equivalent rule ending in `.rm-aim-line-t`.
- **R4:**
  - finishStartCore: use `liveCountOfKey(ctx, x.measureKey)`, write no reading and take no v0 for an `rc` key, and pass `v0ByKey` in place of `v0`. Add a server-check case: with 3 multiple-choice cards at or above L, Start's reading equals the recall count;
  - intakeRefusalOf's doc reads "a Domain short of its count with no writing pace". Add a server-check case where a spare-only REALISTIC intake with no pace saves and drafts with rate null;
  - optional: read the clean-entry window through R1's cleanReadDaysOf.
- **R6 (optional):** read the window through cleanReadDaysOf.
- **Lane M:** redraw the mockups to the shipped UI (docs/life-plan/roadmap/final-*.html). Each rev-4 section opens with an "As shipped" note.

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
