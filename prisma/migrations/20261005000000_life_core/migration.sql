-- life_core: additive. New tables only; deployed code never reads them.
-- Hand-authored from `prisma migrate diff` against a local mirror of production:
-- the false-positive DROP INDEX "Idea_embedding_hnsw_idx" and the existing
-- "UnlockedSkill_userId_equippedSlot_key" were removed. Apply with
-- `prisma db execute`, then `prisma migrate resolve --applied 20261005000000_life_core`.

-- CreateTable
CREATE TABLE "LifeSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "epochDay" DATE NOT NULL,
    "dailyCapacityMin" INTEGER NOT NULL DEFAULT 240,
    "capacitySetAt" TIMESTAMP(3),
    "restWeekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "settledThroughDay" DATE,
    "debtWriteOff" BOOLEAN NOT NULL DEFAULT false,
    "hrMax" INTEGER,
    "birthYear" INTEGER,
    "activityMap" JSONB,
    "weeklyTargets" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "LifeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "sink" TEXT NOT NULL DEFAULT 'NONE',
    "track" TEXT,
    "templateId" TEXT,
    "sourceId" TEXT,
    "compositionKey" TEXT,
    "xp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rawXp" DOUBLE PRECISION,
    "qty" DOUBLE PRECISION,
    "countsForStreak" BOOLEAN NOT NULL DEFAULT false,
    "receipt" JSONB,
    "detail" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normTitle" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "note" TEXT,
    "kind" TEXT NOT NULL,
    "inbox" BOOLEAN NOT NULL DEFAULT false,
    "recurrence" TEXT,
    "startDay" DATE NOT NULL,
    "dueDay" DATE,
    "dueKind" TEXT,
    "planDay" DATE,
    "horizon" TEXT,
    "parentId" TEXT,
    "krMetric" TEXT,
    "krTarget" DOUBLE PRECISION,
    "krUnit" TEXT,
    "goalMp" DOUBLE PRECISION,
    "closedScore" DOUBLE PRECISION,
    "compulsory" BOOLEAN NOT NULL DEFAULT false,
    "compulsoryOnRest" BOOLEAN NOT NULL DEFAULT false,
    "intrinsic" BOOLEAN NOT NULL DEFAULT false,
    "mvv" TEXT,
    "mvvMinutes" INTEGER,
    "autoMetric" TEXT,
    "autoTarget" DOUBLE PRECISION,
    "autoFamily" TEXT,
    "track" TEXT NOT NULL,
    "trackSource" TEXT NOT NULL DEFAULT 'CATEGORY',
    "category" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "lexicalBand" TEXT NOT NULL,
    "aiBand" TEXT,
    "bandOverride" INTEGER NOT NULL DEFAULT 0,
    "bandOverrideAt" TIMESTAMP(3),
    "estMinutes" INTEGER NOT NULL,
    "machineMinutes" INTEGER NOT NULL,
    "minutesSource" TEXT NOT NULL,
    "composition" JSONB NOT NULL,
    "gradeSource" TEXT NOT NULL,
    "gradeConfidence" DOUBLE PRECISION NOT NULL,
    "gradeBasis" TEXT,
    "gradeModel" TEXT,
    "gradePromptVersion" INTEGER,
    "gradeAttempts" INTEGER NOT NULL DEFAULT 0,
    "aiGradedAt" TIMESTAMP(3),
    "gradeCopiedFrom" TEXT,
    "gradeFrozenAt" TIMESTAMP(3),
    "pendingChange" JSONB,
    "pendingChangeAt" TIMESTAMP(3),
    "captureSource" TEXT NOT NULL DEFAULT 'quick',
    "captureKey" TEXT,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskInstance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "slot" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "completedAt" TIMESTAMP(3),
    "minutes" INTEGER,
    "rpe" INTEGER,
    "xpPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "debtXp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "debtOpen" BOOLEAN NOT NULL DEFAULT false,
    "repaired" BOOLEAN NOT NULL DEFAULT false,
    "judgedAt" TIMESTAMP(3),
    "workoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "TaskInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LifeSettings_userId_key" ON "LifeSettings"("userId");

-- CreateIndex
CREATE INDEX "ActivityEvent_userId_day_idx" ON "ActivityEvent"("userId", "day");

-- CreateIndex
CREATE INDEX "ActivityEvent_userId_source_day_idx" ON "ActivityEvent"("userId", "source", "day");

-- CreateIndex
CREATE INDEX "ActivityEvent_userId_track_day_idx" ON "ActivityEvent"("userId", "track", "day");

-- CreateIndex
CREATE INDEX "ActivityEvent_userId_templateId_day_idx" ON "ActivityEvent"("userId", "templateId", "day");

-- CreateIndex
CREATE INDEX "ActivityEvent_userId_sourceId_idx" ON "ActivityEvent"("userId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityEvent_userId_dedupeKey_key" ON "ActivityEvent"("userId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTemplate_userId_captureKey_key" ON "TaskTemplate"("userId", "captureKey");

-- CreateIndex
CREATE INDEX "TaskTemplate_userId_archivedAt_idx" ON "TaskTemplate"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "TaskTemplate_userId_normTitle_idx" ON "TaskTemplate"("userId", "normTitle");

-- CreateIndex
CREATE INDEX "TaskTemplate_parentId_idx" ON "TaskTemplate"("parentId");

-- CreateIndex
CREATE INDEX "TaskInstance_userId_day_idx" ON "TaskInstance"("userId", "day");

-- CreateIndex
CREATE INDEX "TaskInstance_userId_debtOpen_idx" ON "TaskInstance"("userId", "debtOpen");

-- CreateIndex
CREATE UNIQUE INDEX "TaskInstance_templateId_day_slot_key" ON "TaskInstance"("templateId", "day", "slot");

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskInstance" ADD CONSTRAINT "TaskInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
