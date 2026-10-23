-- avatar_targets (2026-10-24, docs/life-plan/blueprint-plan-2026-10-22.md P4; blueprint 1.2, decisions D3 and D4): the
-- desired self in numbers. One new table, AvatarTarget: a target for one attribute (VITALITY | INTELLECT | CRAFT |
-- DUTY | CARE, or CAPITAL, a reading only), read by one metric (avatar.ts AVATAR_METRICS), from a baseline toward a
-- target value by an optional day. A record, never a reward: no target pays XP, MP or a level.
--   lineageId   the first version's id. An edit archives the row (archivedAt) and adds a new one with the same lineage,
--               so the history stays; at most one live row per lineage (the partial unique index below).
--   readings    in RoadmapReading under measureKey 'AVATAR|a:<lineageId>' (no new column there): COMPUTED rows from the
--               degrade cron, SELF rows for a MANUAL target's own logs. Every existing reader filters by a key it built
--               (a measure's, a checkpoint log's prefix, PROFICIENCY), so an AVATAR row is ignored by them all.
--   weight      the weight target is WeightGoal's own (no second copy): no AvatarTarget row has the metric WEIGHT.
-- Every timestamp is timestamptz; a baseline's and a target's day are calendar days (life days).
-- Additive only: no existing table is altered, no column is dropped, renamed or retyped, and nothing is backfilled.
-- Target: the xtnl-idea Supabase project ONLY (ref xvlkujmtdcpaoxdftgpl, never XTNL_thesis). Rehearse locally first.
-- Prisma 6 cannot declare the CHECKs (AvatarTarget_attribute_check, AvatarTarget_metric_check,
-- AvatarTarget_direction_check, AvatarTarget_label_check, AvatarTarget_baseline_check) or the partial unique index
-- (AvatarTarget_lineageId_live_key); schema.prisma names them on the model, and a future `migrate diff` proposal to drop
-- them must be deleted, never applied.
BEGIN;
CREATE TABLE "public"."AvatarTarget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "attribute" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "scope" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "unit" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "baselineValue" DOUBLE PRECISION,
    "baselineDay" DATE,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "targetDay" DATE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "AvatarTarget_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "public"."AvatarTarget" ADD CONSTRAINT "AvatarTarget_attribute_check" CHECK ("attribute" IN ('VITALITY', 'INTELLECT', 'CRAFT', 'DUTY', 'CARE', 'CAPITAL'));
ALTER TABLE "public"."AvatarTarget" ADD CONSTRAINT "AvatarTarget_metric_check" CHECK ("metric" IN ('EFFORT_MINUTES', 'FIELD_LEVEL', 'TRACK_HOURS', 'REVENUE_MONTH', 'MANUAL'));
ALTER TABLE "public"."AvatarTarget" ADD CONSTRAINT "AvatarTarget_direction_check" CHECK ("direction" IN ('UP', 'DOWN'));
ALTER TABLE "public"."AvatarTarget" ADD CONSTRAINT "AvatarTarget_label_check" CHECK (char_length("label") BETWEEN 1 AND 40);
ALTER TABLE "public"."AvatarTarget" ADD CONSTRAINT "AvatarTarget_baseline_check" CHECK (("baselineValue" IS NULL) = ("baselineDay" IS NULL));
-- The Status card's read (a user's live targets) and a lineage's history.
CREATE INDEX "AvatarTarget_userId_archivedAt_idx" ON "public"."AvatarTarget"("userId", "archivedAt");
CREATE INDEX "AvatarTarget_lineageId_idx" ON "public"."AvatarTarget"("lineageId");
-- One live version per lineage: two edits racing on one target cannot both add a row.
CREATE UNIQUE INDEX "AvatarTarget_lineageId_live_key" ON "public"."AvatarTarget"("lineageId") WHERE "archivedAt" IS NULL;
COMMIT;
