-- competencies (2026-10-24, docs/life-plan/blueprint-plan-2026-10-22.md P5; blueprint 1.5, decisions D7, D8 and D9):
-- the real skills. One new table, Competency: a named skill of one attribute (VITALITY | INTELLECT | CRAFT | DUTY |
-- CARE), PRACTICE (fed by the tasks and roadmaps linked to it) or EXERCISE (also every logged walk), with an optional
-- Field for an Intellect skill. Two new nullable columns name the skill a row feeds:
--   TaskTemplate.competencyId   the skill a task or habit's ticks count toward (a work tab's task never: refused)
--   Roadmap.competencyId        the skill a roadmap's practices and steps count toward, unless a practice names its own
-- Hours are derived on read (competency.ts): the receipt minutes of the linked templates' live TASK rows, net of every
-- 'undo:<id>' row, falling back to TaskInstance.minutes and then the template's estMinutes; an EXERCISE skill adds
-- ExerciseSession.durationMin. The tiers are 0-100, 100-500, 500-2,000 and 2,000-10,000 h. A record, never a reward:
-- no hour and no tier pays XP, MP or a level, and a tier-up is a Seal only ('competency:<id>:t<n>', D9).
-- No backfill: every existing template and roadmap reads competencyId null and behaves exactly as before. Linking one
-- later credits its whole history once, on read, with no write but the link.
-- Plain TEXT ids with no foreign key (as the roadmap's references and the avatar's), read tolerantly: a link to a
-- skill that is archived or gone counts toward nothing. A skill is never deleted, only archived (archivedAt).
-- Every timestamp is timestamptz. Additive only: one table, two nullable columns with no default (no table rewrite),
-- and their indexes; no column is dropped, renamed or retyped, and nothing is backfilled.
-- Apply this BEFORE the code that reads it deploys: a Prisma client generated from the new schema selects and returns
-- TaskTemplate.competencyId, so a server on that client needs the column.
-- Target: the xtnl-idea Supabase project ONLY (ref xvlkujmtdcpaoxdftgpl, never XTNL_thesis). Rehearse locally first.
-- Prisma 6 cannot declare the CHECKs (Competency_attribute_check, Competency_kind_check, Competency_name_check,
-- Competency_exercise_check, Competency_field_check) or the partial unique indexes (Competency_userId_name_live_key,
-- Competency_userId_exercise_live_key); schema.prisma names them on the model, and a future `migrate diff` proposal to
-- drop them must be deleted, never applied.
BEGIN;
CREATE TABLE "public"."Competency" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "attribute" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PRACTICE',
    "fieldId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Competency_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "public"."Competency" ADD CONSTRAINT "Competency_attribute_check" CHECK ("attribute" IN ('VITALITY', 'INTELLECT', 'CRAFT', 'DUTY', 'CARE'));
ALTER TABLE "public"."Competency" ADD CONSTRAINT "Competency_kind_check" CHECK ("kind" IN ('PRACTICE', 'EXERCISE'));
ALTER TABLE "public"."Competency" ADD CONSTRAINT "Competency_name_check" CHECK (char_length("name") BETWEEN 1 AND 40);
-- Walks are Vitality's: an EXERCISE skill is a Vitality one.
ALTER TABLE "public"."Competency" ADD CONSTRAINT "Competency_exercise_check" CHECK ("kind" <> 'EXERCISE' OR "attribute" = 'VITALITY');
-- A Field names an Intellect skill's subject only.
ALTER TABLE "public"."Competency" ADD CONSTRAINT "Competency_field_check" CHECK ("fieldId" IS NULL OR "attribute" = 'INTELLECT');
-- The Skills page's read (a user's live skills).
CREATE INDEX "Competency_userId_archivedAt_idx" ON "public"."Competency"("userId", "archivedAt");
-- One live skill a name (in any case), so two racing adds cannot both write "Writing".
CREATE UNIQUE INDEX "Competency_userId_name_live_key" ON "public"."Competency"("userId", lower("name")) WHERE "archivedAt" IS NULL;
-- One live EXERCISE skill: every walk counts toward it, so a second would count the same walks twice.
CREATE UNIQUE INDEX "Competency_userId_exercise_live_key" ON "public"."Competency"("userId") WHERE "kind" = 'EXERCISE' AND "archivedAt" IS NULL;
ALTER TABLE "public"."TaskTemplate" ADD COLUMN "competencyId" TEXT;
ALTER TABLE "public"."Roadmap" ADD COLUMN "competencyId" TEXT;
-- The hours' read: a user's templates that feed a skill.
CREATE INDEX "TaskTemplate_userId_competencyId_idx" ON "public"."TaskTemplate"("userId", "competencyId");
COMMIT;
