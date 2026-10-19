-- scheduled_tasks (2026-10-20): one "Scheduled task" list on a work tab, replacing call backs and customer tasks.
-- Additive: one new table (ScheduledTask; every timestamp timestamptz), its indexes (one partial: the reminder
-- dispatcher's claim), foreign keys and one CHECK; one nullable unique column on CustomerInteraction (legacyCallBackId).
-- Then the backfill (the same statements as prisma/backfill/scheduled_tasks.sql, between the BACKFILL markers): customer
-- tasks and call backs into ScheduledTask, each call back's call into its customer's log, and the call backs' linked
-- one-off work tasks archived (the only rows rewritten; archived, never deleted). No column is dropped or retyped;
-- CallBack and CustomerTask stay, and nothing writes them after this.
-- Target: the xtnl-idea Supabase project ONLY. Rehearse locally first. Run prisma/backfill/scheduled_tasks.sql again
-- right after the deploy (rows the old code wrote in between).
-- Prisma 6 cannot declare the CHECK or the partial index; schema.prisma names them on ScheduledTask, and a future
-- `migrate diff` proposal to drop them must be deleted, never applied.
BEGIN;
CREATE TABLE "public"."ScheduledTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "customerId" TEXT,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'OTHER',
    "remind" BOOLEAN NOT NULL DEFAULT true,
    "remindSentAt" TIMESTAMPTZ(3),
    "doneAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "legacyCallBackId" TEXT,
    "legacyCustomerTaskId" TEXT,
    CONSTRAINT "ScheduledTask_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "public"."ScheduledTask" ADD CONSTRAINT "ScheduledTask_channel_check" CHECK ("channel" IN ('CALL', 'VISIT', 'EMAIL', 'MESSAGE', 'OTHER'));

CREATE UNIQUE INDEX "ScheduledTask_legacyCallBackId_key" ON "public"."ScheduledTask"("legacyCallBackId");
CREATE UNIQUE INDEX "ScheduledTask_legacyCustomerTaskId_key" ON "public"."ScheduledTask"("legacyCustomerTaskId");
CREATE INDEX "ScheduledTask_boardId_doneAt_dueAt_idx" ON "public"."ScheduledTask"("boardId", "doneAt", "dueAt");
CREATE INDEX "ScheduledTask_userId_doneAt_dueAt_idx" ON "public"."ScheduledTask"("userId", "doneAt", "dueAt");
CREATE INDEX "ScheduledTask_customerId_dueAt_idx" ON "public"."ScheduledTask"("customerId", "dueAt");
CREATE INDEX "ScheduledTask_remind_due_idx" ON "public"."ScheduledTask"("dueAt") WHERE "remind" = true AND "remindSentAt" IS NULL AND "doneAt" IS NULL AND "archivedAt" IS NULL;

ALTER TABLE "public"."CustomerInteraction" ADD COLUMN "legacyCallBackId" TEXT;
CREATE UNIQUE INDEX "CustomerInteraction_legacyCallBackId_key" ON "public"."CustomerInteraction"("legacyCallBackId");

ALTER TABLE "public"."ScheduledTask" ADD CONSTRAINT "ScheduledTask_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "public"."WorkBoard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."ScheduledTask" ADD CONSTRAINT "ScheduledTask_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- BEGIN BACKFILL
-- 1. Customer tasks, as they are: the customer's tab, its customer, the time, title, detail, reminder, done and
--    archived. Channel CALL when the title starts a word with "call" or "phone", else OTHER.
INSERT INTO "public"."ScheduledTask" (
    "id", "userId", "boardId", "customerId", "dueAt", "allDay", "title", "detail", "channel",
    "remind", "remindSentAt", "doneAt", "archivedAt", "createdAt", "updatedAt", "legacyCustomerTaskId"
)
SELECT
    'sct_' || ct."id",
    ct."userId",
    cu."boardId",
    ct."customerId",
    ct."dueAt" AT TIME ZONE 'UTC',
    false,
    ct."title",
    ct."detail",
    CASE WHEN ct."title" ~* '\m(call|phone)' THEN 'CALL' ELSE 'OTHER' END,
    ct."remind",
    ct."remindSentAt" AT TIME ZONE 'UTC',
    ct."doneAt" AT TIME ZONE 'UTC',
    ct."archivedAt" AT TIME ZONE 'UTC',
    ct."createdAt" AT TIME ZONE 'UTC',
    ct."updatedAt" AT TIME ZONE 'UTC',
    ct."id"
FROM "public"."CustomerTask" ct
JOIN "public"."Customer" cu ON cu."id" = ct."customerId"
ON CONFLICT ("legacyCustomerTaskId") DO NOTHING;

-- 2. Call backs. When: the reminder's time; else the linked task's day (its planned day, else its due day) at 09:00
--    Sydney; else when the call happened. All day unless it had a reminder. Title: the linked task's, else 'Call back'.
--    Detail: the tags joined with ' · '. Channel: how to call back (remindAction), else how the call happened
--    (PHONE → CALL, IN_PERSON → VISIT). Reminder on only when it had one; its sent stamp, customer and archive copied.
--    Done: when the linked task was completed (TaskTemplate.completedAt, else its latest DONE* instance); when the
--    linked task was archived without being done (dropped on the board), at that time; and a call back with no
--    reminder and no task (a logged call that asked nothing more) at its last change. Otherwise open.
--    Read BEFORE step 4 archives the linked tasks, so "archived" here is only ever the user's own archive.
INSERT INTO "public"."ScheduledTask" (
    "id", "userId", "boardId", "customerId", "dueAt", "allDay", "title", "detail", "channel",
    "remind", "remindSentAt", "doneAt", "archivedAt", "createdAt", "updatedAt", "legacyCallBackId"
)
SELECT
    'scb_' || cb."id",
    cb."userId",
    cb."boardId",
    cb."customerId",
    CASE
        WHEN cb."remindAt" IS NOT NULL THEN cb."remindAt" AT TIME ZONE 'UTC'
        WHEN COALESCE(t."planDay", t."dueDay") IS NOT NULL THEN (COALESCE(t."planDay", t."dueDay") + TIME '09:00') AT TIME ZONE 'Australia/Sydney'
        ELSE cb."at" AT TIME ZONE 'UTC'
    END,
    cb."remindAt" IS NULL,
    COALESCE(NULLIF(btrim(t."title"), ''), 'Call back'),
    NULLIF(array_to_string(COALESCE(cb."tags", ARRAY[]::TEXT[]), ' · '), ''),
    CASE COALESCE(cb."remindAction", cb."action") WHEN 'IN_PERSON' THEN 'VISIT' ELSE 'CALL' END,
    cb."remindAt" IS NOT NULL,
    cb."remindSentAt" AT TIME ZONE 'UTC',
    CASE
        WHEN done."at" IS NOT NULL THEN done."at"
        WHEN t."id" IS NOT NULL AND t."archivedAt" IS NOT NULL THEN t."archivedAt" AT TIME ZONE 'UTC'
        WHEN cb."remindAt" IS NULL AND t."id" IS NULL THEN cb."updatedAt" AT TIME ZONE 'UTC'
        ELSE NULL
    END,
    cb."archivedAt" AT TIME ZONE 'UTC',
    cb."createdAt" AT TIME ZONE 'UTC',
    cb."updatedAt" AT TIME ZONE 'UTC',
    cb."id"
FROM "public"."CallBack" cb
LEFT JOIN "public"."TaskTemplate" t ON t."id" = cb."taskId"
LEFT JOIN LATERAL (
    SELECT COALESCE(
        t."completedAt",
        (SELECT max(i."completedAt") FROM "public"."TaskInstance" i WHERE i."templateId" = t."id" AND i."status" LIKE 'DONE%')
    ) AT TIME ZONE 'UTC' AS "at"
) done ON true
ON CONFLICT ("legacyCallBackId") DO NOTHING;

-- 3. The call itself, in the customer's log: a call back that names a customer becomes one interaction (when it
--    happened; Call or Visit; the tags as the brief, ≤ 280), archived when the call back was. Once per call back.
INSERT INTO "public"."CustomerInteraction" (
    "id", "userId", "customerId", "at", "action", "brief", "tags", "archivedAt", "createdAt", "updatedAt", "legacyCallBackId"
)
SELECT
    'icb_' || cb."id",
    cb."userId",
    cb."customerId",
    cb."at",
    CASE cb."action" WHEN 'IN_PERSON' THEN 'VISIT' ELSE 'CALL' END,
    left(array_to_string(COALESCE(cb."tags", ARRAY[]::TEXT[]), ' · '), 280),
    COALESCE(cb."tags", ARRAY[]::TEXT[]),
    cb."archivedAt",
    cb."createdAt",
    cb."updatedAt",
    cb."id"
FROM "public"."CallBack" cb
WHERE cb."customerId" IS NOT NULL
ON CONFLICT ("legacyCallBackId") DO NOTHING;

-- 4. The call backs' own tasks leave the work Tasks board (their scheduled task now carries them): each TaskTemplate a
--    call back links that is a one-off TASK on a work board, not completed and not archived, is archived (kept, never
--    deleted; the board's Archived list restores it).
UPDATE "public"."TaskTemplate" t
SET "archivedAt" = now() AT TIME ZONE 'UTC', "updatedAt" = now() AT TIME ZONE 'UTC'
WHERE t."archivedAt" IS NULL
    AND t."completedAt" IS NULL
    AND t."kind" = 'TASK'
    AND t."recurrence" IS NULL
    AND t."boardId" IS NOT NULL
    AND EXISTS (SELECT 1 FROM "public"."CallBack" cb WHERE cb."taskId" = t."id");
-- END BACKFILL
COMMIT;
