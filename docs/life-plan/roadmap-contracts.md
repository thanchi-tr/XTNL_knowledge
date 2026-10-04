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
  - Runs: `storedSamplesOf` and a local `runFactsOf` (to be replaced by R3's, §11.3).
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
