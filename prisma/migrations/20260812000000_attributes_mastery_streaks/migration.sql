-- Hand-authored, for the same reason as the preceding migrations: Supabase's
-- default extensions make `prisma migrate dev`'s drift pre-flight fail, so
-- migrations are written by hand, applied directly, and recorded with
--   npx prisma migrate resolve --applied 20260812000000_attributes_mastery_streaks
-- See prisma/migrations/20260729000000_add_field_snapshot/migration.sql.
--
-- Reworks the progression architecture:
--   * `Attribute` — the thirteen base attributes.
--   * `FieldAttribute` — each Field's weighting across them.
--   * `MasteryLedgerEntry` — append-only mastery-point ledger.
--   * `FieldStreak` — per-Field daily activity streaks.
--   * `UnlockedSkill` gains what it cost and when it was bought.

-- ============================================================================
-- Attribute
-- ============================================================================
CREATE TYPE "Attribute" AS ENUM (
    'MIND',
    'PHYSICAL',
    'CRITICAL_THINKING',
    'COMPASSION',
    'ABSTRACT',
    'LOGIC',
    'REASON',
    'REBUTTAL',
    'SELF_RESPECT',
    'FAITH',
    'CREATIVITY',
    'STUBBORNNESS',
    'STATISTIC'
);

-- ============================================================================
-- FieldAttribute
-- ============================================================================
CREATE TABLE "FieldAttribute" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "attribute" "Attribute" NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldAttribute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FieldAttribute_fieldId_attribute_key" ON "FieldAttribute"("fieldId", "attribute");
CREATE INDEX "FieldAttribute_fieldId_idx" ON "FieldAttribute"("fieldId");

ALTER TABLE "FieldAttribute"
    ADD CONSTRAINT "FieldAttribute_fieldId_fkey"
    FOREIGN KEY ("fieldId") REFERENCES "Field"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- A weight is a percentage point. The per-Field sum-to-100 invariant is
-- enforced in the write path (allocateFieldAttributes) rather than here,
-- because a row-level CHECK cannot see its siblings and a deferred
-- constraint trigger would make partial reallocation impossible.
ALTER TABLE "FieldAttribute"
    ADD CONSTRAINT "FieldAttribute_weight_range" CHECK ("weight" >= 0 AND "weight" <= 100);

-- ============================================================================
-- MasteryLedgerEntry
-- ============================================================================
CREATE TABLE "MasteryLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "ideaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasteryLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MasteryLedgerEntry_userId_idx" ON "MasteryLedgerEntry"("userId");

-- ============================================================================
-- FieldStreak
-- ============================================================================
CREATE TABLE "FieldStreak" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "currentDays" INTEGER NOT NULL DEFAULT 0,
    "bestDays" INTEGER NOT NULL DEFAULT 0,
    "lastActiveDay" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldStreak_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FieldStreak_userId_fieldId_key" ON "FieldStreak"("userId", "fieldId");
CREATE INDEX "FieldStreak_fieldId_idx" ON "FieldStreak"("fieldId");

ALTER TABLE "FieldStreak"
    ADD CONSTRAINT "FieldStreak_fieldId_fkey"
    FOREIGN KEY ("fieldId") REFERENCES "Field"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- UnlockedSkill: what it cost, and when
-- ============================================================================
ALTER TABLE "UnlockedSkill" ADD COLUMN "masteryPaid" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UnlockedSkill" ADD COLUMN "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
