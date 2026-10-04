-- life_roadmap: an Aim, its drafting runs, milestones, items, measures,
-- forward-written readings, the acceptance log and the frozen week quests.
-- Additive: 8 new tables; no
-- existing table is altered; no foreign key into an existing table (Field,
-- Domain, Idea and TaskTemplate ids are plain TEXT, read tolerantly).
-- Target: the xtnl-idea Supabase project ONLY. Rehearse locally first.
--
-- Hand-authored from docs/life-plan/roadmap.md (revision 3, Migration) to
-- match the eight models appended to schema.prisma. Written by lane 0, not
-- applied. The lead follows data-model.md PROCEDURE and roadmap.md Migration
-- (the diff decides only for the eight new tables; the pre-apply grep; the
-- rehearsal; the project-ref check), then runs `prisma db execute --file`
-- on this file, `prisma migrate resolve --applied 20261101000000_life_roadmap`
-- and `prisma generate`. Apply it before the push that ships code reading
-- these tables; until then those reads catch the missing table
-- (roadmap-types.ts isMissingRoadmapTable) and render as before.

-- CreateTable
CREATE TABLE "public"."Roadmap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aim" TEXT NOT NULL,
    "fieldId" TEXT,
    "domainIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "track" TEXT NOT NULL DEFAULT 'CRAFT',
    "startDay" DATE NOT NULL,
    "targetDay" DATE NOT NULL,
    "hoursPerWeek" INTEGER NOT NULL,
    "newCardsPerWeek" INTEGER,
    "typicalHours" INTEGER,
    "typicalHoursSource" TEXT,
    "syllabus" JSONB,
    "startPoint" TEXT NOT NULL,
    "intensity" TEXT NOT NULL DEFAULT 'STEADY',
    "practicesAllowed" BOOLEAN NOT NULL DEFAULT true,
    "constraints" TEXT,
    "examLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "firstAcceptedDay" DATE,
    "reachedDay" DATE,
    "doneAt" TIMESTAMP(3),
    "doneReason" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archiveReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Roadmap_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "Roadmap_userId_status_idx" ON "public"."Roadmap"("userId", "status");

-- CreateTable
CREATE TABLE "public"."RoadmapRun" (
    "id" TEXT NOT NULL,
    "roadmapId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "model" TEXT,
    "modelVersion" TEXT,
    "promptVersion" INTEGER,
    "seedBase" INTEGER,
    "inputHash" TEXT,
    "pack" JSONB,
    "samples" JSONB,
    "report" JSONB,
    "usage" JSONB,
    "responseIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "finishReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "latencyMs" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "RoadmapRun_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "RoadmapRun_userId_day_idx" ON "public"."RoadmapRun"("userId", "day");
CREATE INDEX "RoadmapRun_userId_inputHash_idx" ON "public"."RoadmapRun"("userId", "inputHash");
CREATE INDEX "RoadmapRun_roadmapId_status_idx" ON "public"."RoadmapRun"("roadmapId", "status");

-- CreateTable
CREATE TABLE "public"."RoadmapMilestone" (
    "id" TEXT NOT NULL,
    "roadmapId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "lineageId" TEXT NOT NULL,
    "ord" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "titleOrigin" TEXT NOT NULL,
    "titleDecision" TEXT NOT NULL DEFAULT 'PENDING',
    "windowStart" DATE,
    "dueDay" DATE,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "goalId" TEXT,
    "startedDay" DATE,
    "startingAt" TIMESTAMP(3),
    "reachedDay" DATE,
    "reachPendingDay" DATE,
    "overAccepted" BOOLEAN NOT NULL DEFAULT false,
    "feasibility" JSONB,
    "rankIndex" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoadmapMilestone_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "RoadmapMilestone_goalId_key" ON "public"."RoadmapMilestone"("goalId");
CREATE INDEX "RoadmapMilestone_roadmapId_version_ord_idx" ON "public"."RoadmapMilestone"("roadmapId", "version", "ord");
CREATE INDEX "RoadmapMilestone_lineageId_idx" ON "public"."RoadmapMilestone"("lineageId");

-- CreateTable
CREATE TABLE "public"."RoadmapItem" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ord" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "rawLabel" TEXT,
    "origin" TEXT NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "domainId" TEXT,
    "proposedName" TEXT,
    "syllabusRef" INTEGER,
    "method" TEXT,
    "sessionsPerWeek" INTEGER,
    "durationBand" TEXT,
    "rule" TEXT,
    "planSource" TEXT,
    "checkpointKind" TEXT,
    "outOf" DOUBLE PRECISION,
    "bar" DOUBLE PRECISION,
    "addToToday" BOOLEAN NOT NULL DEFAULT true,
    "templateId" TEXT,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoadmapItem_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "RoadmapItem_milestoneId_idx" ON "public"."RoadmapItem"("milestoneId");
CREATE INDEX "RoadmapItem_templateId_idx" ON "public"."RoadmapItem"("templateId");
CREATE INDEX "RoadmapItem_domainId_idx" ON "public"."RoadmapItem"("domainId");

-- CreateTable
CREATE TABLE "public"."RoadmapMeasure" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "minLevel" INTEGER,
    "target" DOUBLE PRECISION NOT NULL,
    "targetSource" TEXT NOT NULL,
    "fittedTarget" DOUBLE PRECISION,
    "rateSource" TEXT,
    "baseline" DOUBLE PRECISION,
    "baselineDay" DATE,
    "unit" TEXT,
    "itemLineageId" TEXT,
    "measureKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoadmapMeasure_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "RoadmapMeasure_milestoneId_idx" ON "public"."RoadmapMeasure"("milestoneId");
CREATE INDEX "RoadmapMeasure_measureKey_idx" ON "public"."RoadmapMeasure"("measureKey");

-- CreateTable
CREATE TABLE "public"."RoadmapReading" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "measureKey" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "detail" JSONB,
    "source" TEXT NOT NULL DEFAULT 'COMPUTED',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoadmapReading_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "RoadmapReading_userId_measureKey_day_key" ON "public"."RoadmapReading"("userId", "measureKey", "day");
CREATE INDEX "RoadmapReading_userId_day_idx" ON "public"."RoadmapReading"("userId", "day");

-- CreateTable
CREATE TABLE "public"."RoadmapAcceptance" (
    "id" TEXT NOT NULL,
    "roadmapId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "day" DATE NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousVersion" INTEGER NOT NULL,
    "feasibility" JSONB NOT NULL,
    "endState" JSONB NOT NULL,
    "intervalMultiplier" DOUBLE PRECISION NOT NULL,
    "overAccepted" BOOLEAN NOT NULL DEFAULT false,
    "undoneAt" TIMESTAMP(3),
    CONSTRAINT "RoadmapAcceptance_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "RoadmapAcceptance_roadmapId_version_idx" ON "public"."RoadmapAcceptance"("roadmapId", "version");

-- CreateTable
CREATE TABLE "public"."RoadmapQuestWeek" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roadmapId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "generator" INTEGER NOT NULL,
    "quests" JSONB NOT NULL,
    "basis" JSONB NOT NULL,
    "cappedBy" TEXT,
    "results" JSONB,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoadmapQuestWeek_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "RoadmapQuestWeek_userId_dedupeKey_key" ON "public"."RoadmapQuestWeek"("userId", "dedupeKey");
CREATE INDEX "RoadmapQuestWeek_roadmapId_weekStart_idx" ON "public"."RoadmapQuestWeek"("roadmapId", "weekStart");
CREATE INDEX "RoadmapQuestWeek_milestoneId_idx" ON "public"."RoadmapQuestWeek"("milestoneId");

-- AddForeignKey (between Roadmap* tables only)
ALTER TABLE "public"."RoadmapRun" ADD CONSTRAINT "RoadmapRun_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "public"."Roadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."RoadmapMilestone" ADD CONSTRAINT "RoadmapMilestone_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "public"."Roadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."RoadmapItem" ADD CONSTRAINT "RoadmapItem_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "public"."RoadmapMilestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."RoadmapMeasure" ADD CONSTRAINT "RoadmapMeasure_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "public"."RoadmapMilestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."RoadmapAcceptance" ADD CONSTRAINT "RoadmapAcceptance_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "public"."Roadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."RoadmapQuestWeek" ADD CONSTRAINT "RoadmapQuestWeek_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "public"."Roadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."RoadmapQuestWeek" ADD CONSTRAINT "RoadmapQuestWeek_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "public"."RoadmapMilestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
