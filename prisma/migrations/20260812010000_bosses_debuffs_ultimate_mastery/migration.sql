-- Hand-authored, same reason as 20260728000000_init_pgvector and
-- 20260729000000_add_field_snapshot: `prisma migrate dev`'s drift check
-- compares against Supabase's actual installed extensions
-- (pg_stat_statements, pgcrypto, supabase_vault, uuid-ossp) which this
-- schema never declared, and offers to reset the database rather than
-- diffing tables. Generated via `prisma migrate diff --from-url ... --to-schema-datamodel`
-- against the real DIRECT_URL (which sidesteps the extension-list compare),
-- with one line removed: that diff also proposed
-- `DROP INDEX "Idea_embedding_hnsw_idx"` — an artifact of `Idea.embedding`
-- being `Unsupported("vector(1536)")`, which Prisma cannot model at all, so
-- any hand-created index on it always reads as "not supposed to exist" from
-- the datamodel side. The HNSW index stays.

-- AlterTable
ALTER TABLE "MasteryLedgerEntry" ALTER COLUMN "delta" SET DATA TYPE DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "BossEncounter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "victories" INTEGER NOT NULL DEFAULT 0,
    "lastVictoryAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "cooldownUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BossEncounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiveDebuff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "magnitude" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActiveDebuff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BossEncounter_fieldId_idx" ON "BossEncounter"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "BossEncounter_userId_fieldId_key" ON "BossEncounter"("userId", "fieldId");

-- CreateIndex
CREATE INDEX "ActiveDebuff_userId_idx" ON "ActiveDebuff"("userId");

-- AddForeignKey
ALTER TABLE "BossEncounter" ADD CONSTRAINT "BossEncounter_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;
