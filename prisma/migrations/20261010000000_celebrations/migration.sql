-- celebrations: additive. Two new tables only; no existing table is altered.
-- Hand-authored to match `prisma migrate diff` output for the two models in
-- schema.prisma (CelebrationEvent, UserPrefs). Kinds are TEXT typed in
-- src/lib/celebration-types.ts; no foreign keys, like ActivityEvent.
--
-- Target: the xtnl-idea Supabase project ONLY (never XTNL_thesis). Check the
-- project ref first, rehearse on a local mirror, then apply with
-- `prisma db execute --file prisma/migrations/20261010000000_celebrations/migration.sql`
-- and `prisma migrate resolve --applied 20261010000000_celebrations`.
-- Deployed code tolerates the tables being absent: every read and write in
-- src/lib/celebrations.ts fails soft (no Seals persist, nothing breaks).

-- CreateTable
CREATE TABLE "CelebrationEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "facts" JSONB NOT NULL,
    "what" JSONB NOT NULL DEFAULT '[]',
    "mergedInto" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shownAt" TIMESTAMP(3),

    CONSTRAINT "CelebrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPrefs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "theme" TEXT,
    "motion" TEXT,
    "sound" TEXT,
    "haptics" TEXT,
    "autoAdvance" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPrefs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CelebrationEvent_userId_shownAt_idx" ON "CelebrationEvent"("userId", "shownAt");

-- CreateIndex
CREATE INDEX "CelebrationEvent_userId_createdAt_idx" ON "CelebrationEvent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CelebrationEvent_userId_dedupeKey_key" ON "CelebrationEvent"("userId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "UserPrefs_userId_key" ON "UserPrefs"("userId");
