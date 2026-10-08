-- life_exercise_style: additive. Two new tables only; no existing table is altered, no foreign keys.
-- ExerciseSession (Train › Exercise: walks with incline angle, distance and duration) and TaskStyle (a task's or
-- habit's icon and colour). Hand-authored to match `prisma migrate diff` for the two models in schema.prisma.
--
-- Target: the xtnl-idea Supabase project ONLY. Check the project ref first, then apply with
-- `npx prisma db execute --file prisma/migrations/20261201000000_life_exercise_style/migration.sql --schema prisma/schema.prisma`
-- and `npx prisma migrate resolve --applied 20261201000000_life_exercise_style`.
-- Deployed code tolerates the tables being absent: reads fail soft (nothing logged, no style) and writes say so.

-- CreateTable
CREATE TABLE "public"."ExerciseSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'WALK',
    "angleDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "durationMin" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskStyle" (
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskStyle_pkey" PRIMARY KEY ("templateId")
);

-- CreateIndex
CREATE INDEX "ExerciseSession_userId_day_idx" ON "public"."ExerciseSession"("userId", "day");

-- CreateIndex
CREATE INDEX "TaskStyle_userId_idx" ON "public"."TaskStyle"("userId");
