-- task_defer_abort (2026-10-13): a task can be deferred (with a reason, until a time) or aborted (with a reason, this
-- time or for good). TaskTemplate.deferUntil keeps a deferred task off the board until then; TaskDecision logs every
-- defer and abort with its reason. Additive only: one nullable column, one new table, its indexes and foreign key
-- (CASCADE: a task deleted by a reset or an undone capture takes its decisions with it).
-- Target: the xtnl-idea Supabase project ONLY. Rehearse locally first.
BEGIN;
ALTER TABLE "public"."TaskTemplate" ADD COLUMN "deferUntil" TIMESTAMP(3);

CREATE TABLE "public"."TaskDecision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scope" TEXT,
    "reason" TEXT NOT NULL,
    "reasonTag" TEXT,
    "day" DATE NOT NULL,
    "untilAt" TIMESTAMP(3),
    "compulsory" BOOLEAN NOT NULL DEFAULT false,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskDecision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaskDecision_userId_day_idx" ON "public"."TaskDecision"("userId", "day");
CREATE INDEX "TaskDecision_templateId_idx" ON "public"."TaskDecision"("templateId");
ALTER TABLE "public"."TaskDecision" ADD CONSTRAINT "TaskDecision_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."TaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
