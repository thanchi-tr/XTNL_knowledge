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
  restWeekdays      Int[]     @default([]) // 1=Mon..7=Sun, used from M2
  settledThroughDay DateTime? @db.Date   // M2 settlement cursor
  debtWriteOff      Boolean   @default(false) // M2 'accept the loss' switch (user decision)
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
  pendingChange      Json?     // M2 akrasia horizon
  pendingChangeAt    DateTime?
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
  status      String    // DONE | DONE_LATE | DONE_MVV | MISSED | EXCUSED | SKIPPED | UNDONE | WRITTEN_OFF
  source      String    @default("manual") // manual | record-yesterday | make-up | auto:reviews | auto:ideas | auto:steps | auto:workout
  completedAt DateTime?
  minutes     Int?
  rpe         Int?
  xpPaid      Float     @default(0)
  debtXp      Float     @default(0)
  debtOpen    Boolean   @default(false)
  repaired    Boolean   @default(false)
  judgedAt    DateTime?
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

=== MIGRATION 2: prisma/migrations/20261019000000_life_duty (ships with M2) ===
model RestDay {
  id          String    @id @default(cuid())
  userId      String
  day         DateTime  @db.Date
  kind        String    // REST | SICK | VACATION
  declaredAt  DateTime  @default(now())
  cancelledAt DateTime? // a future declaration can be cancelled before its day starts; the row is reused
  @@unique([userId, day])
  @@schema("public")
}
SQL: CREATE TABLE "public"."RestDay" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "day" DATE NOT NULL, "kind" TEXT NOT NULL, "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "cancelledAt" TIMESTAMP(3), PK); CREATE UNIQUE INDEX "RestDay_userId_day_key" ON "public"."RestDay"("userId","day").

=== MIGRATION 3: prisma/migrations/20261109000000_life_body (ships with M4) ===
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

LEDGER VOCABULARY (ActivityEvent.source → sink):
- REVIEW → DOMAIN, with xp = pointsAwarded, or 0 on a strike or degrade.
- IDEA_CREATE → DOMAIN.
- ATTESTATION, BOSS, LEGACY_DAY, DAY_OPEN → NONE.
- TASK → TRACK, or NONE when it pays 0 (#play, study-linked, auto-completed by a workout).
- UNDO → TRACK, negating the row it undoes.
- GOAL_PROGRESS, REFLECTION, FULL_DAY, REPAIR, FREEZE_EARN, FREEZE_USE, DEBT_WRITTEN_OFF → NONE.
- WEEK → NONE (M5). The week judge writes one row per track per judged week:
  - track set; day = the judged week's Sunday; occurredAt = when it was judged;
  - qty 1 when kept, 0 when not;
  - detail = the reason line, for example 'Kept · 4 days · 52.0 raw XP · 180 effort min' or 'Not kept · 2 of 3 days · 12.0 of 30 raw XP' (grading F);
  - a week whose Sunday is before LIFE_LAUNCH_DAY is prefixed 'backfill · '. It counts for depth, never mints MP and plays no Seal (the snapshot test is detail starting with 'backfill').
- MP_MINT → NONE (M5). One decision row per life mint, written with its MasteryLedgerEntry in one $transaction array:
  - track kept (the kept track, or the goal's track);
  - templateId and sourceId = the goal id for a goal, null for a kept week;
  - day = the week's Sunday for a kept week, the close day for a goal;
  - qty = the MP paid. 0 is allowed: a goal closed for nothing still writes its row;
  - detail = '<REASON> · <why>', or the reason alone. The reason is the text before the first ' · ', for example 'GOAL_MID · 2 Mid goals paid in the last 30 days'.
- WEEK and MP_MINT never count for the streak (NEVER_STREAK_SOURCES), so a WEEK row dated Sunday never makes Sunday active after the fact.
- DEBT → TRACK DUTY (negative). DEBT_REPAID → TRACK DUTY (positive).
- ADJUST → TRACK. The detail names the cause: KNEE_RECONCILE, RPE_RATED, HR_LATE, MERGE or TEST_REVERSAL.
- WORKOUT and PR → TRACK BODY.
Invariant: DOMAIN rows only record points srs.ts or ideas.ts already credited to Domain.totalPoints. Life levels read ONLY SUM(xp) WHERE sink='TRACK'.
- The level reader is src/lib/life-tracks-server.ts loadLifeLedger (cached 'lifeLedger:<user>' on ['life']). It does five reads in one round trip: XP by (track, day), XP and compositions by (track, compositionKey), WEEK rows, MP_MINT rows and LifeSettings.epochDay. loadLifeTracks builds every level view from it.
- The week judge, src/lib/life-weeks-server.ts, reads TASK and UNDO rows (sink TRACK) for its floors only, never for levels.
- Goal closes write only NONE rows, never a TRACK row.
- Audit query: 0 TRACK rows share a sourceId with any REVIEW or IDEA_CREATE row.

Dedupe keys:
- 'task:<tpl>:<day>:<slot>:<attempt>' (attempt = UNDO count on that slot)
- 'undo:<eventId>'
- 'debt:<tpl>:<day>:<slot>', 'repaid:<tpl>:<day>:<slot>'
- 'freeze-earn:<day>', 'freeze-use:<day>', 'repair:<day>', 'fullday:<day>', 'knee:<day>:<n>', 'dayopen:<day>'
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
- The notifications key (notifications.ts:181) adds both tags.
- M5:
  - loadProgression's tags become ['fields','progress','life'], because life rows join the attribute scores. A tick recomputes progression once; its inner loaders stay warm.
  - loadProgressRates adds 'life'.
  - 'lifeLedger:<user>' is cached on ['life'], and 'goalLadder:<user>' on ['life','activity'].
  - The celebration snapshot's tracks part reads ['life','activity'], and its levels part adds 'life'.
  - The week judge and goal closes invalidate 'life', 'progress' and 'activity' after commit. TRACK writes already invalidate 'life'.

RESET (reset-scopes.ts plus actions/reset.ts):
- New scope 'life', phrase 'DELETE LIFE'. It deletes in FK order: TaskInstance, TaskTemplate, RestDay, ActivityEvent, Workout, HrBucket, StepInterval, IngestLog, LifeSettings.
- 'ideas' and 'knowledge' also delete knowledge-source events (REVIEW, IDEA_CREATE, ATTESTATION, BOSS, LEGACY_DAY, DAY_OPEN).
- 'everything' deletes every life table plus CapitalLedgerEntry and EmblemAugment, which it misses today.
- getResetPreview counts them.

PROCEDURE for each migration:
1. Edit schema.prisma.
2. Draft the SQL: npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script.
3. Delete DROP INDEX "Idea_embedding_hnsw_idx" and any CREATE INDEX that already exists. Keep only this migration's CREATE TABLE, CREATE INDEX and FK statements, and add the header comment.
4. Rehearse on a disposable local pgvector Postgres (see user_setup).
5. With the user's go-ahead, verify the Supabase project ref is xtnl-idea (not XTNL_thesis).
6. npx prisma db execute --file prisma/migrations/<name>/migration.sql --schema prisma/schema.prisma
7. npx prisma migrate resolve --applied <name>
8. npx prisma generate
9. Deploy the code only after that.
Never run npm run db:migrate (it is prisma migrate dev), migrate reset or db push.
