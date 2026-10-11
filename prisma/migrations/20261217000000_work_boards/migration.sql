-- work_boards (2026-10-12): up to 3 work tabs beside the personal Board, call back cards, and web-push subscriptions.
-- Additive only: three new tables, one nullable column on TaskTemplate (boardId; null = the personal Board), their indexes
-- and foreign keys, one CHECK and one partial unique index. No row is rewritten; no column is dropped or retyped.
-- Target: the xtnl-idea Supabase project ONLY. Rehearse locally first.
-- Prisma 6 cannot declare the CHECK or the partial unique index; schema.prisma names them on WorkBoard, and a future
-- `migrate diff` proposal to drop them must be deleted, never applied.
BEGIN;
ALTER TABLE "public"."TaskTemplate" ADD COLUMN "boardId" TEXT;

CREATE TABLE "public"."WorkBoard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkBoard_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "public"."WorkBoard" ADD CONSTRAINT "WorkBoard_slot_range" CHECK ("slot" BETWEEN 1 AND 3);
CREATE UNIQUE INDEX "WorkBoard_userId_slot_open_key" ON "public"."WorkBoard"("userId", "slot") WHERE "archivedAt" IS NULL;

CREATE TABLE "public"."CallBack" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "action" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "taskId" TEXT,
    "remindAt" TIMESTAMP(3),
    "remindAction" TEXT,
    "remindSentAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CallBack_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkBoard_userId_archivedAt_idx" ON "public"."WorkBoard"("userId", "archivedAt");
CREATE INDEX "CallBack_userId_boardId_at_idx" ON "public"."CallBack"("userId", "boardId", "at");
CREATE INDEX "CallBack_remindAt_idx" ON "public"."CallBack"("remindAt");
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "public"."PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx" ON "public"."PushSubscription"("userId");
CREATE INDEX "TaskTemplate_userId_boardId_idx" ON "public"."TaskTemplate"("userId", "boardId");

ALTER TABLE "public"."TaskTemplate" ADD CONSTRAINT "TaskTemplate_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "public"."WorkBoard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."CallBack" ADD CONSTRAINT "CallBack_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "public"."WorkBoard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."CallBack" ADD CONSTRAINT "CallBack_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."TaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;
