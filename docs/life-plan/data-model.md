# Data model and migrations

CONVENTIONS for every new table:
- Columns: id TEXT cuid(), userId String with an index, and @@schema("public").
- Kinds, sources and reasons are TEXT columns typed with TS unions. No new Postgres enums.
- A 'life day' column is @db.Date and holds the local calendar date. Only life-day.ts dateColumn(key) produces it.
- Nothing that exists today is altered. MasteryLedgerEntry only gains new free-string reasons, which need no migration.
- Derived and never stored: the daily streak, freeze balance, habit strength, per-duty streaks, track XP and levels, and character level. Kept weeks are stored only as append-only WEEK events, and life MP decisions only as append-only MP_MINT events (M5).
- The ledger is the truth. TaskInstance.status and debtOpen are projections of it.

=== MIGRATION 1: prisma/migrations/20261005000000_life_core (ships with M1) ===

model LifeSettings {
  id                String    @id @default(cuid())
  userId            String    @unique
  epochDay          DateTime  @db.Date   // first life day; nothing earlier pays XP
  dailyCapacityMin  Int       @default(240)
  restWeekdays      Int[]     @default([]) // 1=Mon..7=Sun; unused: standing rest weekdays are deferred (m2-refit decision 14)
  settledThroughDay DateTime? @db.Date   // M2 settlement cursor: the last life day judged. Null until the launch script sets it (firstDutyDay − 1); a row created after launch starts at epochDay − 1 (duty-economy newLifeSettingsData)
  debtWriteOff      Boolean   @default(false) // M2 'accept the loss' switch (user decision); one writer: actions/duty.ts setDebtWriteOff → lib/duty.ts setDebtWriteOffCore (actions/rituals.ts setDebtWriteOff only delegates)
  hrMax             Int?
  birthYear         Int?
  activityMap       Json?     // M4: unmapped source code -> kind
  weeklyTargets     Json?     // unused: M5 judges kept weeks against fixed floors (grading F)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  @@schema("public")
}

model ActivityEvent {            // THE append-only life ledger
  id              String   @id @default(cuid())
  userId          String
  day             DateTime @db.Date
  occurredAt      DateTime
  source          String   // vocabulary below
  sink            String   @default("NONE") // DOMAIN | TRACK | NONE
  track           String?  // BODY | DUTY | CRAFT | CARE: required on TRACK rows, kept on WEEK and MP_MINT (M5), else null
  templateId      String?
  sourceId        String?  // Idea / TaskInstance / Workout id; no FK, like MasteryLedgerEntry.ideaId
  compositionKey  String?  // 'tpl:<id>' | 'wk:RUN'
  xp              Float    @default(0) // paid, after the knee
  rawXp           Float?   // pre-knee amount; the day's knee base = SUM(rawXp)
  qty             Float?
  countsForStreak Boolean  @default(false)
  receipt         Json?    // {v, factors[], raw, kneeBefore, xp, track}
  detail          String?
  dedupeKey       String?
  createdAt       DateTime @default(now())
  @@unique([userId, dedupeKey])        // NULLs allowed, so ordinary rows need no key
  @@index([userId, day])
  @@index([userId, source, day])
  @@index([userId, track, day])
  @@index([userId, templateId, day])
  @@index([userId, sourceId])
  @@schema("public")
}

model TaskTemplate {             // the frozen grade plus the rule
  id                 String    @id @default(cuid())
  userId             String
  title              String
  normTitle          String    // lowercase; parse tokens, digits and stop-words stripped
  rawText            String    // original capture line, for audit and re-parse
  note               String?
  kind               String    // TASK | HABIT | GOAL | IDEA_DRAFT
  inbox              Boolean   @default(false)
  recurrence         String?   // DAILY | WEEKDAYS | DOW:1,4 | EVERY:3 | AFTER:3 | TARGET:3/W | TARGET:2/M | MONTHLY:15
  startDay           DateTime  @db.Date
  dueDay             DateTime? @db.Date
  dueKind            String?   // PLANNED | DEADLINE
  horizon            String?   // SHORT | MID | LONG
  parentId           String?
  parent             TaskTemplate?  @relation("GoalTree", fields: [parentId], references: [id], onDelete: SetNull)
  children           TaskTemplate[] @relation("GoalTree")
  krMetric           String?   // CHILDREN | MANUAL | REVIEWS | IDEAS | WORKOUTS | RUN_KM
  krTarget           Float?
  krUnit             String?
  goalMp             Float?    // stated MP (1 / 6 / 20), frozen at creation (M5); the launch fills open goals
  closedScore        Float?    // g when the goal was closed, 0 if unmeasured (M5); non-null = closed, final
  compulsory         Boolean   @default(false)
  compulsoryOnRest   Boolean   @default(false)
  intrinsic          Boolean   @default(false) // #play
  mvv                String?
  mvvMinutes         Int?
  autoMetric         String?   // REVIEWS | IDEAS | REVIEW_DUE | STEPS | WORKOUT
  autoTarget         Float?
  autoFamily         String?
  track              String
  trackSource        String    @default("CATEGORY") // CATEGORY | TAG
  category           String
  band               String    // machine band after the merge
  lexicalBand        String
  aiBand             String?
  bandOverride       Int       @default(0) // self-rating, −3..+1, never above machine+1
  bandOverrideAt     DateTime?
  estMinutes         Int
  machineMinutes     Int
  minutesSource      String    // USER | AI | LEXICAL
  composition        Json      // Record<Attribute,int> summing to 100; frozen snapshot
  gradeSource        String    // LEXICAL | AI | COPIED
  gradeConfidence    Float
  gradeBasis         String?
  gradeModel         String?
  gradePromptVersion Int?
  gradeAttempts      Int       @default(0)
  aiGradedAt         DateTime?
  gradeCopiedFrom    String?
  gradeFrozenAt      DateTime?
  pendingChange      Json?     // M2 rule over time: PendingChange v1 (below)
  pendingChangeAt    DateTime? // dayStartOf(next.effectiveDay) while a weakening pends
  captureSource      String    @default("quick") // quick | share | api | form
  sortOrder          Float     @default(0)
  completedAt        DateTime? // for a goal: when it was closed (M5)
  archivedAt         DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  instances          TaskInstance[]
  @@index([userId, archivedAt])
  @@index([userId, normTitle])
  @@index([parentId])
  @@schema("public")
}

model TaskInstance {             // materialised only when acted on or judged
  id          String    @id @default(cuid())
  userId      String
  templateId  String
  template    TaskTemplate @relation(fields: [templateId], references: [id], onDelete: Restrict)
  day         DateTime  @db.Date
  slot        Int       @default(0) // 'Again' completions use slot n+1
  status      String    // DONE | DONE_LATE | DONE_MVV | MISSED | EXCUSED | SKIPPED | UNDONE | WRITTEN_OFF | MADE_UP (M2: a late make-up; the debt is cleared, the occurrence still reads missed)
  source      String    @default("manual") // manual | record-yesterday | make-up | auto:reviews | auto:ideas | auto:steps | auto:workout
  completedAt DateTime?
  minutes     Int?
  rpe         Int?
  xpPaid      Float     @default(0)
  debtXp      Float     @default(0)
  debtOpen    Boolean   @default(false)
  repaired    Boolean   @default(false)
  judgedAt    DateTime? // M2: set on the instances settlement creates or excuses
  workoutId   String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  @@unique([templateId, day, slot])
  @@index([userId, day])
  @@index([userId, debtOpen])
  @@schema("public")
}

SQL for life_core. It is hand-authored, drafted with migrate diff, and carries the header comment '-- life_core: additive. New tables only; deployed code never reads them.':
- CREATE TABLE "public"."LifeSettings":
  - "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "epochDay" DATE NOT NULL
  - "dailyCapacityMin" INTEGER NOT NULL DEFAULT 240, "restWeekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[]
  - "settledThroughDay" DATE, "debtWriteOff" BOOLEAN NOT NULL DEFAULT false
  - "hrMax" INTEGER, "birthYear" INTEGER, "activityMap" JSONB, "weeklyTargets" JSONB
  - "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
  - CONSTRAINT "LifeSettings_pkey" PRIMARY KEY ("id")
  - CREATE UNIQUE INDEX "LifeSettings_userId_key" ON "public"."LifeSettings"("userId").
- CREATE TABLE "public"."ActivityEvent":
  - "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "day" DATE NOT NULL, "occurredAt" TIMESTAMP(3) NOT NULL
  - "source" TEXT NOT NULL, "sink" TEXT NOT NULL DEFAULT 'NONE', "track" TEXT, "templateId" TEXT, "sourceId" TEXT, "compositionKey" TEXT
  - "xp" DOUBLE PRECISION NOT NULL DEFAULT 0, "rawXp" DOUBLE PRECISION, "qty" DOUBLE PRECISION
  - "countsForStreak" BOOLEAN NOT NULL DEFAULT false, "receipt" JSONB, "detail" TEXT, "dedupeKey" TEXT
  - "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  - PK "ActivityEvent_pkey"
  - UNIQUE INDEX "ActivityEvent_userId_dedupeKey_key" ("userId","dedupeKey")
  - INDEXES "ActivityEvent_userId_day_idx", "ActivityEvent_userId_source_day_idx", "ActivityEvent_userId_track_day_idx", "ActivityEvent_userId_templateId_day_idx", "ActivityEvent_userId_sourceId_idx".
- CREATE TABLE "public"."TaskTemplate", with every column above:
  - TEXT, BOOLEAN NOT NULL DEFAULT false, DATE, DOUBLE PRECISION, INTEGER, JSONB and TIMESTAMP(3) as typed above.
  - "trackSource" DEFAULT 'CATEGORY', "captureSource" DEFAULT 'quick'.
  - "bandOverride", "gradeAttempts" and "sortOrder" DEFAULT 0.
  - PK, plus INDEXES ("userId","archivedAt"), ("userId","normTitle"), ("parentId").
- CREATE TABLE "public"."TaskInstance", with every column above:
  - "slot" INTEGER NOT NULL DEFAULT 0, "source" TEXT NOT NULL DEFAULT 'manual', "xpPaid"/"debtXp" DOUBLE PRECISION NOT NULL DEFAULT 0, "debtOpen"/"repaired" BOOLEAN NOT NULL DEFAULT false.
  - PK, UNIQUE INDEX "TaskInstance_templateId_day_slot_key", INDEXES ("userId","day"), ("userId","debtOpen").
- ALTER TABLE "public"."TaskTemplate" ADD CONSTRAINT "TaskTemplate_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."TaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE. This is an FK on the new table only.
- ALTER TABLE "public"."TaskInstance" ADD CONSTRAINT "TaskInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."TaskTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE.

=== MIGRATION 2: prisma/migrations/20261021000000_life_duty (ships with M2) ===
The name sorts after every applied migration (the last is 20261020000000_answer_case_sensitive; the old plan's 20261019000000 would sort before an applied one). Additive only: the RestDay table and nothing else. Standing rest weekdays were deferred (the user's answer 4), so LifeSettings gains no column. Every other column M2 uses shipped in life_core.
model RestDay {
  id          String    @id @default(cuid())
  userId      String
  day         DateTime  @db.Date  // the life day held (life-day.ts dateColumn)
  kind        String    // REST | SICK | VACATION
  declaredAt  DateTime  @default(now())
  cancelledAt DateTime? // a future declaration can be cancelled before its day starts; the row is reused
  @@unique([userId, day]) // also serves as the userId index
  @@schema("public")
}
SQL: CREATE TABLE "public"."RestDay" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "day" DATE NOT NULL, "kind" TEXT NOT NULL, "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "cancelledAt" TIMESTAMP(3), CONSTRAINT "RestDay_pkey" PRIMARY KEY ("id")); CREATE UNIQUE INDEX "RestDay_userId_day_key" ON "public"."RestDay"("userId","day").
- Every write upserts by (userId, day) and sets kind, declaredAt = now and cancelledAt = null, so a reused row is judged by its new declaration time.
- It is read only through duty-rule.ts heldDaysOf (validRestDays), which ignores a cancelled row, a REST or VACATION row declared at or after its day started (dayStartOf) and a SICK row declared at or after its day ended (dayEndOf). Settlement, streak.ts and snapshot.ts, the week judge and the board all call it, so they agree about a day.
- The code that reads RestDay deploys only after the migration is applied (the PROCEDURE below; the lead only).

TaskTemplate.pendingChange (M2, Json, no migration): PendingChange v1, the rule over time (duty-rule.ts; m2-refit decision 16):
  { v: 1,
    next?:  { effectiveDay: 'YYYY-MM-DD', compulsory?: false, compulsoryOnRest?: false, archive?: true },  // one pending weakening, in force from effectiveDay = today + 7
    prior?: [ { throughDay: 'YYYY-MM-DD', compulsory?: boolean, compulsoryOnRest?: boolean }, … ] }     // earlier values, each in force through its throughDay, ordered by throughDay
- A field's value on day d is the one recorded by the earliest prior segment with throughDay ≥ d that sets it, then next (when d ≥ effectiveDay), then the column (ruleOn). A pending archive is invisible before its effectiveDay and archives from it.
- A strengthening ('Even on rest days' on, a clarified Inbox must) appends a prior segment with the old values through today − 1. Settlement applies next after settling effectiveDay − 1: it writes the columns (archivedAt = dayStartOf(effectiveDay) for an archive), appends the prior segment of the old values through effectiveDay − 1 and clears next. A segment is dropped once the DUTY WEEK row of the week holding its throughDay exists. Null (Prisma.DbNull) when nothing is left.

=== MIGRATION 3: prisma/migrations/20261109000000_life_body (not planned: the user dropped M3 and M4; kept for the record) ===
model Workout {
  id              String    @id @default(cuid())
  userId          String
  source          String    // HC_WEBHOOK | TASKER | GENERIC | SAMSUNG_EXPORT | MANUAL
  externalKey     String    // HC metadata.id | Samsung datauuid | 'nk:<family>:<UTC start minute>:<rounded min>'
  canonicalId     String?   // null = the canonical (paid) row; else points at it
  kind            String    // WALK RUN CYCLE SWIM STRENGTH HIIT YOGA HIKE CLIMB SPORT CARDIO_MACHINE OTHER
  family          String    // ENDURANCE | STRENGTH | MOBILITY | SPORT | WALK | OTHER
  rawType         String?
  title           String?
  startAt         DateTime
  endAt           DateTime
  day             DateTime  @db.Date
  durationSec     Int
  distanceM       Float?
  activeKcal      Float?
  avgHr           Int?
  maxHr           Int?
  steps           Int?
  rpe             Int?
  rpeAt           DateTime?
  intensity       Float
  intensitySource String    // USER | USER_HR_CAPPED | HR | DEFAULT
  load            Float     // effective load after the guard
  mem             Float     // WHO moderate-equivalent minutes
  historical      Boolean   @default(false)
  batchId         String?
  voidedAt        DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  @@unique([userId, source, externalKey])
  @@index([userId, startAt])
  @@index([userId, day])
  @@schema("public")
}
model HrBucket {        // 1-minute HR, purged after 14 days by the life cron
  id     String   @id @default(cuid())
  userId String
  source String
  minute DateTime
  avg    Float
  min    Float?
  max    Float?
  @@unique([userId, source, minute])
  @@index([userId, minute])
  @@schema("public")
}
model StepInterval {    // stored intervals; the day total is derived, never max(existing, batch)
  id      String   @id @default(cuid())
  userId  String
  source  String
  startAt DateTime
  endAt   DateTime
  day     DateTime @db.Date
  count   Int
  coarse  Boolean  @default(false) // daily summaries and intervals > 6 h
  @@unique([userId, source, startAt, endAt])
  @@index([userId, day])
  @@schema("public")
}
model IngestLog {
  id         String   @id @default(cuid())
  userId     String
  source     String
  format     String
  receivedAt DateTime @default(now())
  bytes      Int
  counts     Json     // {accepted, duplicate, merged, historical, rejected, steps, hr}
  unmapped   Json?
  error      String?
  @@index([userId, receivedAt])
  @@schema("public")
}
SQL: four CREATE TABLEs with the matching TEXT/DOUBLE PRECISION/INTEGER/BOOLEAN/DATE/TIMESTAMP(3)/JSONB types, PKs, and the unique indexes and indexes listed above. No FKs, because Workout ids are referenced by sourceId only.

M3 and M5 need no migration. For M5:
- The new mastery reasons fit MasteryLedgerEntry.reason, a free String.
- WEEK and MP_MINT rows fit ActivityEvent: both sources are already in the ActivitySource union, track is nullable, and the (userId, dedupeKey) unique index already exists.
- Goal state fits the existing TaskTemplate columns goalMp, closedScore and completedAt.
- The launch marker is a code constant, LIFE_LAUNCH_DAY in src/lib/life-economy.ts (plus the non-production override XTNL_LIFE_LAUNCH_DAY), not a column. A code constant survives a 'life' reset.
- No index is added. The ledger loader groups one user's TRACK rows by (track, day) and (track, compositionKey), and the judge reads through (userId, track, day) and (userId, source, day).

=== ROADMAP REVISION 5: two migrations (docs/life-plan/roadmap-topic-map.md, Migration; roadmap-contracts.md §22, §23) ===
The roadmap's earlier migrations are documented with their specs:
- 20261101000000_life_roadmap (roadmap.md, Migration);
- 20261106000000_life_roadmap_rev4 (roadmap-rev4.md, Migration).

Revision 5's two migrations are documented here.
- **Who writes them.** Lane 2 writes migration A and lane 5 writes migration B (each the migration.sql and the schema.prisma fields). Lane 0 wrote only this text.
- **How they are applied.** Each is rehearsed on a disposable local pgvector Postgres. The lead applies each one only with the user's go-ahead, after checking that the Supabase project ref is xtnl-idea (not XTNL_thesis), by PROCEDURE below.
- **Not pre-approved.** life_roadmap and life_roadmap_rev4 were pre-approved once local tests passed. These two are not, because each rewrites rows (the slot backfill) and adds constraints.
- Never run migrate dev, migrate reset or db push.

Order:
1. **A applies before lane 3's push**, which ships the code that reads and writes the five new columns. Until lane 3 is deployed, today's code saves new rows with a NULL slot. That is harmless: a NULL never conflicts in the unique index, and today's guard still allows one open row per user.
2. **B applies after lane 3's code is live.** Its CHECK needs every insert and reopen path to set the slot, and server-check asserts each one. B also applies before the push that ships code reading B's columns (lanes 8 and 10). As with rev 4, a read that selects a new column falls back on a P2022 naming it, and renders as before.

Prisma 6 cannot declare a partial index or a CHECK. Migration A's two partial unique indexes and both migrations' CHECKs exist only in SQL, in a `///` comment on schema.prisma's Roadmap model, and here. PROCEDURE step 3 therefore deletes any proposal from `migrate diff` to drop them.

=== ROADMAP MIGRATION A: prisma/migrations/20261110000000_life_roadmap_goals (revision 5 F-R5-15, F-R5-20; contracts §23.1; lane 2) ===
schema.prisma's Roadmap gains five fields, and its status comment gains PAUSED. No other model is edited.
  /// DRAFT | ACTIVE | PAUSED | DONE | ARCHIVED. DRAFT and ACTIVE hold a seat; PAUSED, DONE and ARCHIVED free it (decision 68).
  status      String    @default("DRAFT")          // unchanged column; comment only
  /// Revision 5: the goal's seat, 1..3. Set on every DRAFT and ACTIVE row from lane 3 on; a PAUSED row keeps its last value outside the index (contracts §22.1 ruling 46); null on rows saved before lane 3.
  /// Not expressible in Prisma 6 (data-model.md): CHECK "Roadmap_slot_range" (slot null or 1..3); partial UNIQUE "Roadmap_userId_slot_open_key" (userId, slot) WHERE status IN ('DRAFT','ACTIVE').
  slot        Int?
  /// Revision 5: the user's own name for the goal (at most GOAL_LABEL_MAX, 16 characters); null = the Area name.
  label       String?
  pausedAt    DateTime?
  /// Revision 5: the user's reason for a pause (at most GOAL_PAUSE_REASON_MAX, 120 characters).
  pauseReason String?
  /// Revision 5: the client nonce that created the row ([A-Za-z0-9_-]{8,64}), so a double tap returns the same id.
  /// Not expressible in Prisma 6: partial UNIQUE "Roadmap_userId_createKey_key" (userId, createKey) WHERE createKey IS NOT NULL.
  createKey   String?

SQL. The file runs as one transaction, so a failed statement leaves nothing half-applied (the rehearsal asserts it):
```sql
-- life_roadmap_goals: revision 5 (docs/life-plan/roadmap-topic-map.md, F-R5-15): up to 3 open goals.
-- Additive: five nullable columns on Roadmap, the slot backfill on open rows, one CHECK and two
-- partial unique indexes; no foreign key; no column dropped, renamed or retyped.
-- Target: the xtnl-idea Supabase project ONLY. Rehearse locally first.
-- PRE-APPLY (abort if it returns a row): no user may hold more than one open roadmap.
--   SELECT "userId", count(*) FROM "public"."Roadmap" WHERE "status" IN ('DRAFT','ACTIVE') GROUP BY "userId" HAVING count(*) > 1;
BEGIN;
ALTER TABLE "public"."Roadmap" ADD COLUMN "slot" INTEGER;
ALTER TABLE "public"."Roadmap" ADD COLUMN "label" TEXT;
ALTER TABLE "public"."Roadmap" ADD COLUMN "pausedAt" TIMESTAMP(3);
ALTER TABLE "public"."Roadmap" ADD COLUMN "pauseReason" TEXT;
ALTER TABLE "public"."Roadmap" ADD COLUMN "createKey" TEXT;
UPDATE "public"."Roadmap" SET "slot" = 1 WHERE "status" IN ('DRAFT','ACTIVE');
ALTER TABLE "public"."Roadmap" ADD CONSTRAINT "Roadmap_slot_range" CHECK ("slot" IS NULL OR "slot" BETWEEN 1 AND 3);
CREATE UNIQUE INDEX "Roadmap_userId_slot_open_key" ON "public"."Roadmap"("userId", "slot") WHERE "status" IN ('DRAFT','ACTIVE');
CREATE UNIQUE INDEX "Roadmap_userId_createKey_key" ON "public"."Roadmap"("userId", "createKey") WHERE "createKey" IS NOT NULL;
COMMIT;
```
- **The schema prefix.** The spec writes this SQL without the "public". prefix. The file uses it, as every roadmap migration does (@@schema("public")).
- **PAUSED needs no DDL.** It is a new TEXT value of status. It sits outside the index predicate, so pausing frees the seat. The paused row keeps its slot value, and resume prefers that seat when it is free.
- **The 3 in the CHECK** is GOAL_SLOTS_MAX. GOALS_MAX stays 1 until lane 4, so the app allows one open row while the database allows three.
- **The backfill touches nothing else.** It sets slot = 1 on the open rows only. The aim, version, milestones, readings, quest weeks, Proficiency rows and cookies are keyed by roadmapId and stay as they are: the live plan becomes goal 1, still LEVELS (F-R5-20).
- **The pre-apply SELECT** holds because decision 15 held: one open row per user, under the per-user advisory lock. If it returns a row, stop and tell the lead. Never pick a winner in SQL.
- **Why "an open row has a seat" is not a CHECK yet.**
  - Between the apply and lane 3's deploy, today's code saves new drafts with no slot, and such a CHECK would fail that save.
  - A NULL slot never conflicts in the unique index, and today's guard still allows only one open row. Lane 3's SLOT_FREE also counts NULL-slot rows (contracts §22.1 ruling 24).
  - Migration B seats any such row and adds the CHECK, after lane 3's code is live.
- **The pre-apply grep.**
  - No DROP at all.
  - Every ALTER TABLE names "Roadmap", with ADD COLUMN, or ADD CONSTRAINT "Roadmap_slot_range" CHECK.
  - Both CREATE INDEX lines name "Roadmap".
  - The one UPDATE is the slot backfill.

=== ROADMAP MIGRATION B: prisma/migrations/20261112000000_life_roadmap_topics (revision 5 F-R5-1, F-R5-2, F-R5-11, F-R5-12, F-R5-15; contracts §22.0, §22.3, §23.1; lane 5) ===
schema.prisma gains these fields on existing models:
- **Roadmap:**
  - `planKind String @default("LEVELS")` (LEVELS | TOPICS; every existing row is LEVELS);
  - `rating Json?` (RatingRecord, copied to the acceptance);
  - `splitClauses Json?` (SplitClause[]: the aim's clauses tracked in another goal);
  - `draftPlan Json?` (DraftPlan, contracts §22.1 ruling 49: an open re-plan draft's {version, planKind, depth, rating} while they differ from the live version's, as a [Break into topics] draft of a LEVELS plan has them. planKind, depth and rating stay the live version's, and change only inside acceptCore's transaction and undoAcceptCore's. Null on every existing row);
  - the back relations `topics RoadmapTopic[]` and `topicEdges RoadmapTopicEdge[]`;
  - the slot comment gains the CHECK "Roadmap_slot_open_required".
- **Domain** (the Gemini mark, decision 63):
  - `nameOrigin String?` ('GEMINI'; NULL means the user's, as every row is today);
  - `originName String?` (the name as Gemini gave it). The mark shows while name = originName, so a rename removes it with no other code path changed (roadmap-types geminiNamedOf).
- **RoadmapMilestone:** `layer Int?` (1..6 on a TOPICS layer milestone) and `chainRole String?` (LAYER | DEPTH). Both are null on every LEVELS row.
- **RoadmapMeasure:** `topicLineageId String?` (display only; null on LEVELS).
- **RoadmapRun:**
  - `phase String?` (RATE | MAP | LINK | GROUND | DEEPER). Null is a run with no model phase: every LEVELS run, and a TOPICS draft built with no model. A GEMINI run with a null phase still counts toward ROADMAP_DRAFTS_PER_DAY as before, and so does phase RATE, the chain head (contracts §22.1 ruling 17);
  - `grounding Json?` (GroundRunRecord: webSearchQueries, chunk titles and uris, the verdict per key, the title mode, toolUsePromptTokenCount; server only, never in a view);
  - `requests Int @default(0)` (every model request the run made, against ROADMAP_REQUESTS_PER_DAY and GROUNDED_REQUESTS_PER_DAY; older rows read 0. From lane 10 a LEVELS run writes it too, contracts ruling 66).
- **RoadmapAcceptance:** `previousPlan Json?` (PreviousPlan, contracts ruling 49: the planKind, depth, rating and domainIds an accept of another kind replaced, which undoAcceptCore restores; null on every existing row and on any accept that keeps the kind).

Two new tables. Like RoadmapMilestone and RoadmapItem, neither has a userId column: ownership is the parent Roadmap's (FK, cascade), and every read goes through a roadmap the user owns. The CONVENTIONS' userId rule is for top-level tables.
model RoadmapTopic {
  id          String    @id @default(cuid())
  roadmapId   String
  roadmap     Roadmap   @relation(fields: [roadmapId], references: [id], onDelete: Cascade)
  /// The version its map belongs to (a draft or re-plan writes version + 1, as milestones do).
  version     Int
  /// Stable across versions; edges and RoadmapMeasure.topicLineageId point at it.
  lineageId   String
  /// S<n> (outline line n), U<n> (intake Domain n) or T<n> (every other topic); unique per version.
  key         String
  /// 1..6 (LAYERS_MAX).
  layer       Int
  /// What is shown: the exact sample form, the aim's own span, your words, or the Domain's name.
  name        String
  /// The text exactly as the model returned it (at most 200 characters). Server only, never in a view.
  rawName     String?
  /// GEMINI | SYLLABUS | USER | LIBRARY | AIM.
  nameOrigin  String
  /// GENERAL | REGION_SPECIFIC; null when the name is not Gemini's.
  scope       String?
  /// GEMINI | YOU | CODE: who set its layer.
  placedBy    String
  /// LINKED | WEAK | NONE | NOT_RUN | OWN (OWN: a name that was never Gemini's).
  grounding   String
  /// At most 5 {title, uri}, from groundingChunks.web only.
  sources     Json      @default("[]")
  /// Samples holding the exact form (or the aim's span), 0..3; valid samples of the phase.
  formVotes   Int       @default(0)
  samples     Int       @default(0)
  /// Each voting sample's layer.
  layerVotes  Json      @default("[]")
  /// PENDING | KEPT | EDITED | REMOVED | MERGED.
  decision    String    @default("PENDING")
  /// The lineage id it was merged into (MERGED).
  mergedInto  String?
  chosen      Boolean   @default(false)
  /// BASE | DEEP (DEEP: chosen in the last layer, the specialisation).
  role        String    @default("BASE")
  /// Its Domain once bound or created at accept. No foreign key, like Roadmap.domainIds.
  domainId    String?
  /// You bound it ([Use my Domain…], or a seed or a pick you ticked).
  bound       Boolean   @default(false)
  /// "Held when you began" (measured at accept).
  heldDay     DateTime? @db.Date
  /// "I know this" (your skip).
  skippedDay  DateTime? @db.Date
  flags       String[]  @default([])
  notes       String[]  @default([])
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  @@unique([roadmapId, version, key])
  @@index([roadmapId, version])
  @@index([domainId])
  @@schema("public")
}
model RoadmapTopicEdge {         // a "builds on" link; the whole-layer default ("after layer N") is no row at all
  id              String   @id @default(cuid())
  roadmapId       String
  roadmap         Roadmap  @relation(fields: [roadmapId], references: [id], onDelete: Cascade)
  version         Int
  /// For a cross-goal parent: "x:<parentDomainId>" (CROSS_GOAL_PARENT_PREFIX; the Domain is the parent), so one child's edges to two other goals' Domains keep distinct keys (contracts §22.1 ruling 48).
  parentLineageId String
  childLineageId  String
  /// Cross-goal only: the other goal's Domain and roadmap. Read-only: it can open a gate, and pays and counts nothing here.
  parentDomainId  String?
  parentRoadmapId String?
  /// GEMINI | USER | CODE | SYLLABUS | CROSS_GOAL (CODE and SYLLABUS are reserved; nothing writes them in this build).
  origin          String
  /// Valid LINK samples that chose it; valid LINK samples for that child.
  votes           Int      @default(0)
  samples         Int      @default(0)
  /// A GEMINI edge counts as a parent only when drawn (3 of 3 valid replies, previous layer of at least 4 kept topics).
  drawn           Boolean  @default(false)
  /// PENDING | KEPT | EDITED | REMOVED.
  decision        String   @default("PENDING")
  /// OUTLINE | LINE_DOMAIN | NONE (C8).
  match           String   @default("NONE")
  createdAt       DateTime @default(now())
  @@unique([roadmapId, version, parentLineageId, childLineageId], map: "RoadmapTopicEdge_version_parent_child_key")
  @@schema("public")
}
The edge's unique index carries an explicit name. Its default name, "RoadmapTopicEdge_roadmapId_version_parentLineageId_childLineageId_key", is 69 characters, over Postgres's 63, and Postgres would truncate it out from under Prisma.

SQL (one transaction, as A):
```sql
-- life_roadmap_topics: revision 5 (docs/life-plan/roadmap-topic-map.md, F-R5-1, F-R5-11, F-R5-12, F-R5-15):
-- the topic map, the plan kind, the Gemini mark on a Domain, the run phases, and the open-row seat CHECK.
-- Additive: nullable columns or columns with a default on Roadmap, RoadmapAcceptance, Domain, RoadmapMilestone,
-- RoadmapMeasure and RoadmapRun; two new tables with foreign keys to Roadmap only; one CHECK; the seat backfill on any open row
-- with no seat. Nothing is dropped, renamed or retyped. Target: the xtnl-idea Supabase project ONLY.
-- Rehearse locally first.
-- PRE-APPLY (abort if it returns a row): no user may hold more than GOAL_SLOTS_MAX (3) open roadmaps.
--   SELECT "userId", count(*) FROM "public"."Roadmap" WHERE "status" IN ('DRAFT','ACTIVE') GROUP BY "userId" HAVING count(*) > 3;
-- For the record (expected empty once lane 3 is live; rows saved between A's apply and lane 3's deploy show here):
--   SELECT "id", "userId", "status" FROM "public"."Roadmap" WHERE "status" IN ('DRAFT','ACTIVE') AND "slot" IS NULL;
BEGIN;
-- Seat every open row that has none: each user's unseated rows, oldest first, take that user's free seats, lowest first.
WITH unseated AS (
  SELECT "id", "userId", row_number() OVER (PARTITION BY "userId" ORDER BY "createdAt", "id") AS n
  FROM "public"."Roadmap" WHERE "status" IN ('DRAFT','ACTIVE') AND "slot" IS NULL
), free AS (
  SELECT u."userId", s AS slot, row_number() OVER (PARTITION BY u."userId" ORDER BY s) AS n
  FROM (SELECT DISTINCT "userId" FROM unseated) u CROSS JOIN generate_series(1, 3) AS s
  WHERE NOT EXISTS (SELECT 1 FROM "public"."Roadmap" o
                    WHERE o."userId" = u."userId" AND o."status" IN ('DRAFT','ACTIVE') AND o."slot" = s)
)
UPDATE "public"."Roadmap" r SET "slot" = f.slot
FROM unseated x JOIN free f ON f."userId" = x."userId" AND f.n = x.n
WHERE r."id" = x."id";
ALTER TABLE "public"."Roadmap" ADD CONSTRAINT "Roadmap_slot_open_required" CHECK ("status" NOT IN ('DRAFT','ACTIVE') OR "slot" IS NOT NULL);
ALTER TABLE "public"."Roadmap" ADD COLUMN "planKind" TEXT NOT NULL DEFAULT 'LEVELS';
ALTER TABLE "public"."Roadmap" ADD COLUMN "rating" JSONB;
ALTER TABLE "public"."Roadmap" ADD COLUMN "splitClauses" JSONB;
ALTER TABLE "public"."Roadmap" ADD COLUMN "draftPlan" JSONB;
ALTER TABLE "public"."RoadmapAcceptance" ADD COLUMN "previousPlan" JSONB;
ALTER TABLE "public"."Domain" ADD COLUMN "nameOrigin" TEXT;
ALTER TABLE "public"."Domain" ADD COLUMN "originName" TEXT;
ALTER TABLE "public"."RoadmapMilestone" ADD COLUMN "layer" INTEGER;
ALTER TABLE "public"."RoadmapMilestone" ADD COLUMN "chainRole" TEXT;
ALTER TABLE "public"."RoadmapMeasure" ADD COLUMN "topicLineageId" TEXT;
ALTER TABLE "public"."RoadmapRun" ADD COLUMN "phase" TEXT;
ALTER TABLE "public"."RoadmapRun" ADD COLUMN "grounding" JSONB;
ALTER TABLE "public"."RoadmapRun" ADD COLUMN "requests" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "public"."RoadmapTopic" (
    "id" TEXT NOT NULL,
    "roadmapId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "lineageId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "layer" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "rawName" TEXT,
    "nameOrigin" TEXT NOT NULL,
    "scope" TEXT,
    "placedBy" TEXT NOT NULL,
    "grounding" TEXT NOT NULL,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "formVotes" INTEGER NOT NULL DEFAULT 0,
    "samples" INTEGER NOT NULL DEFAULT 0,
    "layerVotes" JSONB NOT NULL DEFAULT '[]',
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "mergedInto" TEXT,
    "chosen" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT NOT NULL DEFAULT 'BASE',
    "domainId" TEXT,
    "bound" BOOLEAN NOT NULL DEFAULT false,
    "heldDay" DATE,
    "skippedDay" DATE,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoadmapTopic_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoadmapTopic_roadmapId_version_key_key" ON "public"."RoadmapTopic"("roadmapId", "version", "key");
CREATE INDEX "RoadmapTopic_roadmapId_version_idx" ON "public"."RoadmapTopic"("roadmapId", "version");
CREATE INDEX "RoadmapTopic_domainId_idx" ON "public"."RoadmapTopic"("domainId");
CREATE TABLE "public"."RoadmapTopicEdge" (
    "id" TEXT NOT NULL,
    "roadmapId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "parentLineageId" TEXT NOT NULL,
    "childLineageId" TEXT NOT NULL,
    "parentDomainId" TEXT,
    "parentRoadmapId" TEXT,
    "origin" TEXT NOT NULL,
    "votes" INTEGER NOT NULL DEFAULT 0,
    "samples" INTEGER NOT NULL DEFAULT 0,
    "drawn" BOOLEAN NOT NULL DEFAULT false,
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "match" TEXT NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoadmapTopicEdge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoadmapTopicEdge_version_parent_child_key" ON "public"."RoadmapTopicEdge"("roadmapId", "version", "parentLineageId", "childLineageId");
ALTER TABLE "public"."RoadmapTopic" ADD CONSTRAINT "RoadmapTopic_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "public"."Roadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."RoadmapTopicEdge" ADD CONSTRAINT "RoadmapTopicEdge_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "public"."Roadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
```
- **Why the seat backfill is not the spec's literal "slot = 1".** The spec says "re-run the slot backfill (same pre-apply SELECT)". Lane 4 (GOALS_MAX → 3) lands before lane 5, so by B's apply a user may hold up to 3 open rows. A NULL-slot row could then sit beside a row already at slot 1, and "slot = 1" would break the unique index. This deviation is recorded in contracts §23.10 item 6, and lane 5's HANDOFF line pins both the pre-apply SELECT (count(*) > 3) and this UPDATE.
  - So the pre-apply bound is GOAL_SLOTS_MAX.
  - Each unseated row takes its user's lowest free seat, oldest row first.
  - If a user had more unseated rows than free seats, the CHECK would fail and the transaction would roll back. The pre-apply SELECT rules that out first.
- **Why draftPlan and previousPlan** (contracts ruling 49). Plan kind, depth and rating are per-row columns, but a [Break into topics] draft lives beside the live LEVELS version until accept. The draft's own kind, depth and rating therefore sit in Roadmap.draftPlan, and the row's columns keep describing the live version, so every reader of goal 1 reads LEVELS byte for byte while the draft exists. acceptCore copies draftPlan into the columns, writes what it replaced to RoadmapAcceptance.previousPlan and clears draftPlan, all in one transaction; undoAcceptCore reverses it. Both columns are nullable JSONB and NULL on every existing row.
- **Domain's two columns** are nullable and stay NULL on every existing row: every Domain today is the user's. Only accept's FROM_SUGGESTION path for a kept Gemini name writes them (lane 8). A rename leaves originName as it was, which removes the mark.
- **Nothing else is rewritten.** No column is dropped or altered, and no row is rewritten except the seat backfill. planKind 'LEVELS' and requests 0 come from column defaults, so every existing plan, the user's live goal 1 included, reads exactly as before.
- **Deletes.** RoadmapTopic and RoadmapTopicEdge rows cascade with their Roadmap. A 'life' reset that archives roadmaps (PAUSED among them from lane 3, reset.ts) deletes no topic row. A topic's domainId has no FK, so a deleted Domain leaves a dangling id that readers treat as unbound, as they treat Roadmap.domainIds.
- **The pre-apply grep.**
  - No DROP at all.
  - Every ALTER TABLE names "Roadmap", "RoadmapAcceptance", "Domain", "RoadmapMilestone", "RoadmapMeasure", "RoadmapRun", "RoadmapTopic" or "RoadmapTopicEdge". The statements allowed are ADD COLUMN, ADD CONSTRAINT "Roadmap_slot_open_required" CHECK, and the two new tables' FKs to Roadmap.
  - CREATE TABLE and CREATE INDEX name only the two new tables.
  - The one UPDATE is the seat backfill.

The rehearsal (both migrations, on the disposable local pgvector Postgres, seeded with synthetic rows shaped like production's, never a copy of them) asserts:
- **A's backfill** sets slot = 1 on exactly the open rows. The index then refuses a second open row at slot 1, the CHECK refuses slot 4, and a PAUSED row at slot 1 beside a new open row at slot 1 is allowed.
- **The createKey index** refuses the same (userId, createKey) twice and allows any number of NULLs.
- **B's backfill** seats a NULL-slot open row beside a seated one without conflict. B's CHECK refuses an open row with no slot. The pre-apply SELECT catches a user with 4 open rows.
- **Defaults.** Every Domain's new columns are NULL. Every Roadmap is planKind 'LEVELS' with draftPlan NULL, and every RoadmapAcceptance has previousPlan NULL. Every older RoadmapRun has requests 0 and phase NULL.
- **Cross-goal edges.** One child with two cross-goal parents inserts two RoadmapTopicEdge rows ("x:<domainA>" and "x:<domainB>", same version and child) without a unique violation, and a second insert of the same pair is refused.
- **Goal 1 is unchanged.** Its milestones, readings, quest weeks and Proficiency rows are the same by count and checksum after each migration.
- **Atomicity.** A forced failure in the last statement leaves nothing applied.

LEDGER VOCABULARY (ActivityEvent.source → sink):
- REVIEW → DOMAIN, with xp = pointsAwarded, or 0 on a strike or degrade.
- IDEA_CREATE → DOMAIN.
- ATTESTATION, BOSS, LEGACY_DAY, DAY_OPEN → NONE.
- TASK → TRACK, or NONE when it pays 0 (#play, study-linked, auto-completed by a workout).
- UNDO → TRACK, negating the row it undoes.
- GOAL_PROGRESS, REFLECTION, FULL_DAY, REPAIR, FREEZE_EARN, FREEZE_USE, DEBT_WRITTEN_OFF → NONE.
- REFLECTION (M2): Close the day's note and mood (qty = mood 1–5 or null, detail = the one-line note, key 'reflection:<d>:<nonce>'; a later save supersedes, append-only), and the weekly review's done marker (detail 'week review', key 'week-review:<YYYY-Www>' of rituals.ts reviewedWeek, dated the day it was done). xp 0, never graded, never for the streak.
- WEEK → NONE (M5). The week judge writes one row per track per judged week:
  - track set; day = the judged week's Sunday; occurredAt = when it was judged;
  - qty 1 when kept, 0 when not;
  - detail = the reason line, for example 'Kept · 4 days · 52.0 raw XP · 180 effort min', 'Kept · 3 days · 41.0 raw XP · 4 musts kept, 1 held', 'Not kept · 2 of 3 days · 12.0 of 30 raw XP' or 'Not kept · 1 must missed (weekly target)' (grading F);
  - a week whose Sunday is before LIFE_LAUNCH_DAY is prefixed 'backfill · '. It counts for depth, never mints MP and plays no Seal (the snapshot test is detail starting with 'backfill').
- MP_MINT → NONE (M5). One decision row per life mint, written with its MasteryLedgerEntry in one $transaction array:
  - track kept (the kept track, or the goal's track);
  - templateId and sourceId = the goal id for a goal, null for a kept week;
  - day = the week's Sunday for a kept week, the close day for a goal;
  - qty = the MP paid. 0 is allowed: a goal closed for nothing still writes its row;
  - detail = '<REASON> · <why>', or the reason alone. The reason is the text before the first ' · ', for example 'GOAL_MID · 2 Mid goals paid in the last 30 days';
  - occurredAt = when it was decided. Two goal closes on one day are ordered by (day, occurredAt, dedupeKey), both in the ladder's 'depth added' (goals.ts goalDepthAdded) and in the Seal (snapshot readGoals).
- Every transaction that writes MP_MINT rows opens with the life-mint lock, pg_advisory_xact_lock(hashtext('life-mint:<user>')) (life-tracks-server lifeMintLockOp; released at commit or rollback). That covers a goal close and each judged week.
  - A goal close that pays then runs a guard op (goals-server closeGuardOp). It re-counts the paying 'mp:GOAL:*' rows of its reason in its limit window, its own key excluded (goals.ts goalLimitWindow: the close day's life week for SHORT, otherwise (close − 30 or 91, close]). For a SHORT it also re-sums the capped MP of the close week, ROUND(Σ qty, 2).
  - If either figure differs from what the decision read, the guard divides by zero (SQLSTATE 22012, isStaleGuard). Everything rolls back and the close returns GOAL_CLOSE_STALE, 'Something changed; try again.'
  - A close that pays 0 takes the lock but needs no guard: other writes can only raise the counts it was refused on.
- GOAL_PROGRESS: the Today board sums it by (templateId, day) (phase B, goalDays), so a goal is measured as of min(today, due day). Goal +1 and linking an Inbox step to a goal refuse a closed goal ('That goal is closed or no longer exists.').
- WEEK and MP_MINT never count for the streak (NEVER_STREAK_SOURCES), so a WEEK row dated Sunday never makes Sunday active after the fact.
- DEBT → TRACK DUTY (negative), dated the missed day: xp −debt, rawXp NULL, compositionKey 'debt', countsForStreak false, templateId and sourceId = the instance.
- DEBT_REPAID → TRACK DUTY, dated the make-up day: positive for a repayment ('repaid:…'), negative for a make-up's undo ('unrepaid:<repaidRowId>', never an UNDO row). rawXp NULL, compositionKey 'debt', countsForStreak false. rawXp NULL keeps both out of the knee base and the judge's raw reads. readLifeLedger groups by compositionKey and borrows some template's composition for the 'debt' group; that is harmless only because the group nets ≤ 0 and life-tracks.ts skips groups whose sum is ≤ 0, so any future positive bookkeeping row (a knee ADJUST) must carry templateId NULL.
- DEBT_WRITTEN_OFF → NONE ('Accept the loss'): qty = the debt written off; the DEBT row stays.
- FREEZE_EARN, FREEZE_USE → NONE ('freeze-earn:<d>', 'freeze-use:<d>', one key for the automatic and the manual spend). The balance is count(FREEZE_EARN) − count(FREEZE_USE) over all history, at most 2; it is derived, never stored.
- FULL_DAY → NONE, qty 1, detail the rings' line ('fullday:<d>'); its MP is the week judge's 'mp:LIFE_FULL_DAY:<d>' mint (qty 0 allowed when trimmed). REPAIR → NONE, dated the repaired day d − 1 ('repair:<d − 1>'); it holds that day through HELD_SOURCES.
- Streak flags (streak-curve.ts): NEVER_STREAK_SOURCES = STEPS, DAY_OPEN, DEBT, ADJUST, FREEZE_EARN, FREEZE_USE, REFLECTION, UNDO, WEEK, MP_MINT and (M2) DEBT_REPAID, DEBT_WRITTEN_OFF, FULL_DAY, REPAIR. HELD_SOURCES = FREEZE_USE, REPAIR; declared rest days hold through RestDay. Every row settlement writes carries countsForStreak false: a row written after the fact must never make a past day active.
- ADJUST → TRACK. The detail names the cause: KNEE_RECONCILE, RPE_RATED, HR_LATE, MERGE or TEST_REVERSAL.
- WORKOUT and PR → TRACK BODY.
Invariant: DOMAIN rows only record points srs.ts or ideas.ts already credited to Domain.totalPoints. Life levels read ONLY SUM(xp) WHERE sink='TRACK'.
- The level reader is src/lib/life-tracks-server.ts loadLifeLedger (cached 'lifeLedger:<user>' on ['life']). It does five reads in one round trip: XP by (track, day), XP and compositions by (track, compositionKey), WEEK rows, MP_MINT rows and LifeSettings.epochDay. loadLifeTracks builds every level view from it.
  - loadLifeLedger is the empty ledger, with no query, until isLaunched(today), and while the user has no epochDay. That keeps every reader inert before launch: the attribute seam, progress rates, the You sheet, Stats and the snapshot.
  - readLifeLedger is the same five reads, uncached and ungated. Only scripts/life-launch.ts uses it, so its dry run can read the real ledger before the launch day.
  - The celebration snapshot's life parts are built from loadLifeLedger directly (lifeTracksView), never through the React-cached loadLifeTracks. A before and an after snapshot that share one Date would otherwise get the same memoised view.
- The week judge, src/lib/life-weeks-server.ts, reads TASK and UNDO rows (sink TRACK) for its floors only, never for levels. It reads in two round trips:
  1. LifeSettings.epochDay (and, from M2, settledThroughDay for the DUTY gate) and every WEEK dedupe key;
  2. then, in one Promise.all over exactly the planned weeks' days, the TASK and UNDO rows, the compulsory templates and (M2) every template with a pendingChange, their instances (one-offs through Sunday + 2), the RestDay rows, the FREEZE_USE and FULL_DAY rows, and the MP_MINT rows.
- Settlement (M2), src/lib/settlement.ts, is the second ledger writer. Pure planning in settlement-plan.ts; two reads (LifeSettings, then one Promise.all of the state); then one $transaction array per chunk of up to 7 days (14 days a run at most, oldest first), with no interactive transactions:
  1. lifeLockOp, pg_advisory_xact_lock(hashtext('life-complete:<user>')), the lock every completion takes. Settlement never mints, so it never takes life-mint and never nests locks with goal closes or the judge.
  2. one guard statement (SQLSTATE 22012, then re-read and re-plan, up to 3 tries): the cursor is still chunkStart − 1, the FREEZE_* count is what was read, and for an early settle yesterday's TASK/UNDO count is what was read;
  3. the instance creates (createMany, no skipDuplicates, so a conflict rolls back), one guarded updateMany per moved UNDONE instance (filtered on status 'UNDONE', also asserted in the guard), the events (createMany), one updateMany per template whose pending change takes effect (a compare-and-set: it lands only while pendingChange still equals the value read, so a user's cancel in between wins; it clears pendingChangeAt when no next is left), and the cursor. Both updateMany kinds are rare, so a common chunk is 3 to 5 statements; they replace the planned UPDATE … FROM (VALUES …) so no untested raw SQL runs against the shared database.
  Instances settlement creates (EXCUSED, MISSED, the study-must DONE) have the id 'stl_<tpl>_<yyyymmdd>_<slot>', source 'manual' (the column default) and judgedAt set; judgedAt is what marks them as settlement's.
  A P2002 or the guard means another run won: it re-reads. Writes happen only where Duty is launched, the cursor is set, and lifeWritesEnabled() (production, or XTNL_LIFE_JUDGE=1); the cron refuses without a matching CRON_SECRET. After commit it invalidates 'life', 'activity' and 'progress'.
- A settled day is locked for completions: a separate guard statement in the completion array raises SQLSTATE 22003 (a smallint cast overflow, never retried, unlike 22012) when the day is settled. Settled is duty-economy.ts settledFor(day, cursor, firstDutyDay), the one rule every check uses: day ≤ settledThroughDay and, when a launch day is set, day ≥ GREATEST(launch, epochDay). A day before the first judged day is never locked, so the launch script's cursor (firstDutyDay − 1, possibly set days early) locks no pre-launch tick.
- Goal closes write only NONE rows, never a TRACK row.
- Audit query: 0 TRACK rows share a sourceId with any REVIEW or IDEA_CREATE row.

Dedupe keys:
- 'task:<tpl>:<day>:<slot>:<attempt>' (attempt = UNDO count on that slot). A make-up's TASK row keeps the missed day d in its key (taskEventInput keyDay) while the row is dated the make-up day.
- 'undo:<eventId>' (TASK rows only)
- M2 (builders in src/lib/duty-economy.ts):
  - 'debt:<tpl>:<d>:<slot>'
  - 'repaid:<tpl>:<d>:<slot>:<n>' (n = the 'unrepaid:' rows on that slot) and 'unrepaid:<repaidRowId>' (a negative DEBT_REPAID, a make-up's undo)
  - 'writeoff:<tpl>:<d>:<slot>'
  - 'freeze-earn:<d>', 'freeze-use:<d>' (one key for the manual and the automatic spend)
  - 'repair:<d − 1>' (dated the repaired day)
  - 'fullday:<d>' and the week judge's 'mp:LIFE_FULL_DAY:<d>' (qty 0 allowed)
  - 'reflection:<d>:<nonce>' (a later save supersedes) and 'week-review:<YYYY-Www>'
- 'knee:<day>:<n>' is reserved for the deferred knee reconcile; 'dayopen:<day>'
- 'workout:<id>', 'wk-adjust:<id>:<n>', 'pr:<metric>:<workoutId>'
- 'week:<TRACK>:<YYYY-Www>', one per track per judged week, backfill included
- 'mp:<reason>:<scope>':
  - 'mp:LIFE_WEEK_KEPT:<TRACK>:<YYYY-Www>', for example 'mp:LIFE_WEEK_KEPT:BODY:2026-W43';
  - 'mp:GOAL:<goalId>', exactly one per closed goal, qty 0 allowed.
  These keys make the judge and the goal close idempotent: a second render, a second device or a double tap raises P2002 and pays nothing.
- 'bf:legacy:<day>', 'bf:mle:<id>', 'bf:idea:<id>'

MASTERY LEDGER (M5):
- New reasons:
  - minted now: LIFE_WEEK_KEPT, GOAL_SHORT, GOAL_MID, GOAL_LONG;
  - LIFE_FULL_DAY: minted from M2, through the same helper and the same 8 MP weekly cap;
  - LIFE_PR: reserved, never minted (M4 is dropped).
- DECAY_GRACE is a zero-delta reason that resets decay's idle clock. decayStaleMastery's idle query counts SKILL_UNLOCK, DECAY and DECAY_GRACE. The launch writes one, because life can make an emblem affordable and so start the 5%/day decay sooner.
  - Its detail is 'life launch <day>' (life-weeks-server launchGraceDetail). That detail is the launch script's idempotency key.
  - `--apply` writes it last, so it also marks the launch as finished. Until it exists, maybeJudgeWeeks judges nothing on page loads. Once it is seen, the result is held in memory for the life of the process.
- mastery.ts mintLifeMasteryOps(userId, {reason, delta, why?, dedupeKey, day, track?, templateId?, now}) returns the ops for a $transaction array:
  - the MP_MINT activityOp, with qty = delta and detail = '<reason> · <why>';
  - then masteryLedgerEntry.create({userId, delta, reason, detail}), only when delta > 0. A delta of 0 writes the decision row alone.
  - A P2002 on the event rolls back both ops. There are no interactive transactions.
  - The pure lifeMintData(...) builds the same rows for the checks.
- Callers invalidate('life', 'progress', 'activity') after commit. The balance is cached under 'progress', and MP_MINT rows are sink NONE.
- No sourceType column and no partial index are added. measureMasteryRate already counts every positive delta, so emblem ETAs pick up the new income.

CACHE:
- CacheTag gains 'life' (templates, settings, workouts, tracks) and 'activity' (streak, board, day totals). Both go into ALL_TAGS.
- Every write invalidates 'activity'. TRACK writes and template/settings writes also invalidate 'life'. Reviews invalidate 'activity' only, so the progression cache stays warm.
- The notifications key (notifications.ts) adds both tags. From M2 the feed also reads the open debts (one aggregate over debtOpen instances: the bell's 'Owed' row and ShellData.owed.count) and the weekly review's marker, under the same key.
- M5:
  - loadProgression's tags become ['fields','progress','life'], because life rows join the attribute scores. A tick recomputes progression once; its inner loaders stay warm.
  - loadProgressRates adds 'life'.
  - 'lifeLedger:<user>' is cached on ['life'] (only once launched; before, nothing is read or cached), and 'goalLadder:<user>:<today>' on ['life','activity'], so a ladder built before 04:00 is never reused after it.
  - The Today board core 'boardCore:<user>:<day>' stays on ['life','activity'] and now carries goalMp, closedScore and GOAL_PROGRESS by day (phase B).
  - The celebration snapshot's tracks part reads ['life','activity'], and its levels part adds 'life'. SNAPSHOT_SCOPES.tick is streak, habits, goals, levels and tracks; settle is streak, ledger, habits, goals, tracks and levels. readGoals reads only goals with closedScore set, with their 'mp:GOAL' decision rows; readLedger attaches each kept week's 'mp:LIFE_WEEK_KEPT' amount.
  - The week judge and goal closes invalidate 'life', 'progress' and 'activity' after commit. TRACK writes already invalidate 'life'.

RESET (reset-scopes.ts plus actions/reset.ts):
- New scope 'life', phrase 'DELETE LIFE'. It deletes in FK order: TaskInstance, TaskTemplate, RestDay, ActivityEvent, LifeSettings (M2; Workout, HrBucket, StepInterval and IngestLog left the plan with M4). getResetPreview counts RestDay. The next LifeSettings create goes through newLifeSettingsData: after Duty's launch the cursor starts at the new epoch − 1, so settlement resumes from the new epoch with no launch script run, and the week judge (whose launch marker is a MasteryLedgerEntry, untouched by the life scope) keeps judging.
- 'ideas' and 'knowledge' also delete knowledge-source events (REVIEW, IDEA_CREATE, ATTESTATION, BOSS, LEGACY_DAY, DAY_OPEN).
- 'everything' deletes every life table plus CapitalLedgerEntry and EmblemAugment, which it misses today.
- getResetPreview counts them.

PROCEDURE for each migration:
1. Edit schema.prisma.
2. Draft the SQL: npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script.
3. Delete DROP INDEX "Idea_embedding_hnsw_idx" and any CREATE INDEX that already exists. Keep only this migration's CREATE TABLE, CREATE INDEX and FK statements, and add the header comment.
   - In this migration and every later one, also delete any DROP INDEX "Roadmap_userId_slot_open_key", DROP INDEX "Roadmap_userId_createKey_key" or DROP CONSTRAINT "Roadmap_slot_…" that `migrate diff` proposes. Never apply one: dropping them would let a 4th open goal or a duplicate create in past a forgotten guard.
     - Prisma 6 cannot declare those partial unique indexes and CHECKs (roadmap migrations A and B above), so the diff reads them as drift.
     - schema.prisma names them in a `///` comment on Roadmap.
   - The diff cannot produce migrations A and B's partial unique indexes, CHECKs and seat backfills, so they are written by hand, as above.
4. Rehearse on a disposable local pgvector Postgres (see user_setup).
5. With the user's go-ahead, verify the Supabase project ref is xtnl-idea (not XTNL_thesis).
6. npx prisma db execute --file prisma/migrations/<name>/migration.sql --schema prisma/schema.prisma
7. npx prisma migrate resolve --applied <name>
8. npx prisma generate
9. Deploy the code only after that.
Never run npm run db:migrate (it is prisma migrate dev), migrate reset or db push.
