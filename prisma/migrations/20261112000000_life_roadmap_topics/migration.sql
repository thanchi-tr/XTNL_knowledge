-- life_roadmap_topics: revision 5 (docs/life-plan/roadmap-topic-map.md, F-R5-1, F-R5-11, F-R5-12, F-R5-15):
-- the topic map, the plan kind, the Gemini mark on a Domain, the run phases, and the open-row seat CHECK.
-- Additive: nullable columns or columns with a default on Roadmap, RoadmapAcceptance, Domain, RoadmapMilestone,
-- RoadmapMeasure and RoadmapRun; two new tables with foreign keys to Roadmap only; one CHECK; the seat backfill on any open row
-- with no seat. Nothing is dropped, renamed or retyped. Target: the xtnl-idea Supabase project ONLY.
-- Rehearse locally first.
--
-- Hand-authored from docs/life-plan/data-model.md (ROADMAP MIGRATION B; contracts §22.0, §22.3, §23.1; lane 5).
-- Applies only after lane 3's code is live: the CHECK needs every insert and reopen path to set the slot.
-- Prisma 6 cannot declare the CHECK; schema.prisma names it in a /// comment on Roadmap.slot, and
-- PROCEDURE step 3 deletes any proposal from `migrate diff` to remove it.
-- The seat backfill is not the spec's literal "slot = 1" (contracts §23.10 item 6): each unseated open row
-- takes its user's lowest free seat, oldest row first.
--
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
