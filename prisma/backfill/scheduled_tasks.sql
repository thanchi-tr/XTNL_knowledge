-- scheduled_tasks backfill (2026-10-20): call backs (CallBack) and customer tasks (CustomerTask) into the one
-- "Scheduled task" list (ScheduledTask), the call itself into the customer's log (CustomerInteraction), and the call
-- backs' linked one-off tasks off the work Tasks board. The same statements run inside migration
-- 20261227000000_scheduled_tasks (between its BACKFILL markers); this file is the copy to run AGAIN right after the
-- deploy, to catch rows the old code wrote between the migration and the deploy. Re-runnable: every INSERT is
-- ON CONFLICT (legacy id) DO NOTHING (unique columns), ids are derived from the legacy id ('sct_' / 'scb_' / 'icb_'),
-- and the archive UPDATE skips what is archived. Nothing is deleted; CallBack and CustomerTask stay as they are.
-- Target: the xtnl-idea Supabase project ONLY (check the ref first). Rehearse locally first.
-- Times: CallBack and CustomerTask hold timestamp(3) in UTC; ScheduledTask holds timestamptz, so each copy is
-- `<col> AT TIME ZONE 'UTC'`. A task's due day is a date: 09:00 that day in Australia/Sydney (LIFE_TZ).
BEGIN;
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

-- 5. Correction (2026-10-20, after the first production run): a call back with no reminder and no task whose call is
--    dated AFTER it was written was a call planned ahead, not one logged: step 2 closed it as done. It opens again, at
--    that time (not all day), as long as it was never touched since (updatedAt is still the backfill's createdAt copy).
UPDATE "public"."ScheduledTask" st
SET "doneAt" = NULL, "allDay" = false, "updatedAt" = now()
FROM "public"."CallBack" cb
WHERE st."legacyCallBackId" = cb."id"
    AND cb."remindAt" IS NULL
    AND cb."taskId" IS NULL
    AND cb."at" > cb."createdAt"
    AND st."doneAt" IS NOT NULL
    AND st."updatedAt" = cb."updatedAt" AT TIME ZONE 'UTC';
COMMIT;
