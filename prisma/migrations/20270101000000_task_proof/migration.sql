-- task_proof (2026-10-24, docs/life-plan/blueprint-plan-2026-10-22.md P23; blueprint 2.6, decision D20): proof of work
-- for deep work. One new nullable column and one new table:
--   TaskTemplate.proof   'MINUTES': the task counts its time (a full tick needs its minutes or a timer), set by the
--                        '#proof' capture tag, or for the default deep-work set (WORK, STUDY or CREATIVE at Demanding
--                        or above, on the personal Board) only once the user approves the dry-run list
--                        (scripts/proof-dry-run.ts, read only). Null on every row: nothing is backfilled here.
--   TaskSession          a task's timer: started, stopped, and counted once by the tick that counts it
--     templateId         the task it times (a plain id, no foreign key, as the avatar's, the skills' and the Mall's)
--     day                the life day it started on
--     startedAt          when it started; endedAt when it stopped (null while it runs; a start stops any other)
--     minutes            what the tick that counted it counted (null until a tick counts it: then it is never
--                        counted again), 0 to 480
--     source             web | phone
--     clientId           the start's key: a resend of one start answers the session it started, once
-- Nothing in the economy reads this table to pay: only a tick pays (tasks.ts, its 'life-3' receipt), and a timer
-- only bounds and supplies the minutes the tick reports. The gate, the 'life-3' receipts and every timer write wait for
-- PROOF_LAUNCH_DAY (src/lib/proof.ts, null in code): until the user's go, nothing reads or writes either addition
-- except a '#proof' capture, which only records the column.
-- Every timestamp is timestamptz. Additive only: one nullable column with no default (no table rewrite), its CHECK, one
-- table and its indexes; no column is dropped, renamed or retyped, and nothing is backfilled.
-- Apply this BEFORE the code that reads it deploys: a '#proof' capture writes TaskTemplate.proof.
-- Target: the xtnl-idea Supabase project ONLY (ref xvlkujmtdcpaoxdftgpl, never XTNL_thesis). Rehearse locally first.
-- Prisma 6 cannot declare the CHECKs (TaskTemplate_proof_check, TaskSession_minutes_check, TaskSession_source_check,
-- TaskSession_ended_check, TaskSession_clientId_check) or the partial unique index (TaskSession_userId_running_key);
-- schema.prisma names them on the models, and a future `migrate diff` proposal to drop them must be deleted, never
-- applied.
BEGIN;
ALTER TABLE "public"."TaskTemplate" ADD COLUMN "proof" TEXT;
-- The kinds this build knows: MINUTES (P23). Null is no proof.
ALTER TABLE "public"."TaskTemplate" ADD CONSTRAINT "TaskTemplate_proof_check" CHECK ("proof" IS NULL OR "proof" IN ('MINUTES'));
CREATE TABLE "public"."TaskSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),
    "minutes" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'web',
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "TaskSession_pkey" PRIMARY KEY ("id")
);
-- A tick never counts more than 480 minutes (life-grade REPORTED_MINUTES_MAX).
ALTER TABLE "public"."TaskSession" ADD CONSTRAINT "TaskSession_minutes_check" CHECK ("minutes" IS NULL OR "minutes" BETWEEN 0 AND 480);
ALTER TABLE "public"."TaskSession" ADD CONSTRAINT "TaskSession_source_check" CHECK ("source" IN ('web', 'phone'));
-- A timer stops at or after it started.
ALTER TABLE "public"."TaskSession" ADD CONSTRAINT "TaskSession_ended_check" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt");
ALTER TABLE "public"."TaskSession" ADD CONSTRAINT "TaskSession_clientId_check" CHECK (char_length("clientId") BETWEEN 1 AND 64);
-- A resend of one start (a retried request, a second instance) finds the session it started.
CREATE UNIQUE INDEX "TaskSession_userId_clientId_key" ON "public"."TaskSession"("userId", "clientId");
-- The running timers' read (endedAt null) and the plan's (userId, endedAt) index.
CREATE INDEX "TaskSession_userId_endedAt_idx" ON "public"."TaskSession"("userId", "endedAt");
-- A tick's read: one task's timers not yet counted.
CREATE INDEX "TaskSession_userId_templateId_idx" ON "public"."TaskSession"("userId", "templateId");
-- One running timer a user: two starts racing on two devices cannot both leave one running.
CREATE UNIQUE INDEX "TaskSession_userId_running_key" ON "public"."TaskSession"("userId") WHERE "endedAt" IS NULL;
COMMIT;
