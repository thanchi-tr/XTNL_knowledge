-- life_subtasks: additive. Two new tables only; no existing table is altered, no foreign keys.
-- TaskSubtask (a task's or habit's steps, added by the user in the task drawer) and TaskSubtaskTick (a step ticked on a
-- life day). Hand-authored to match `prisma migrate diff` for the two models in schema.prisma.
--
-- Target: the xtnl-idea Supabase project ONLY. Check the project ref first, then apply with
-- `npx prisma db execute --file prisma/migrations/20261210000000_life_subtasks/migration.sql --schema prisma/schema.prisma`
-- and `npx prisma migrate resolve --applied 20261210000000_life_subtasks`.
-- Deployed code tolerates the tables being absent: reads fail soft (no steps) and writes say so.

-- CreateTable
CREATE TABLE "public"."TaskSubtask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "ord" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "TaskSubtask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskSubtaskTick" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "subtaskId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskSubtaskTick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskSubtask_templateId_idx" ON "public"."TaskSubtask"("templateId");

-- CreateIndex
CREATE INDEX "TaskSubtask_userId_idx" ON "public"."TaskSubtask"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskSubtaskTick_subtaskId_day_key" ON "public"."TaskSubtaskTick"("subtaskId", "day");

-- CreateIndex
CREATE INDEX "TaskSubtaskTick_userId_day_idx" ON "public"."TaskSubtaskTick"("userId", "day");

-- CreateIndex
CREATE INDEX "TaskSubtaskTick_templateId_day_idx" ON "public"."TaskSubtaskTick"("templateId", "day");
