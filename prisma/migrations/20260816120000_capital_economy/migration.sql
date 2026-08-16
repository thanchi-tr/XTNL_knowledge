-- Passive capital economy: an append-only ledger, and permanent augments
-- burned onto emblems the user already owns.
--
-- Hand-authored per this project's convention: `prisma migrate diff` against
-- this database reliably proposes DROP INDEX "Idea_embedding_hnsw_idx" as a
-- false positive, because Idea.embedding is Unsupported("vector(1536)") and
-- Prisma cannot model its HNSW index. Including that drop would destroy
-- vector search.
--
-- Purely additive: no existing table is touched, so an account with no rows
-- in either table behaves exactly as it did before.

CREATE TABLE "public"."CapitalLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapitalLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CapitalLedgerEntry_userId_createdAt_idx" ON "public"."CapitalLedgerEntry"("userId", "createdAt");
CREATE INDEX "CapitalLedgerEntry_userId_reason_idx" ON "public"."CapitalLedgerEntry"("userId", "reason");

CREATE TABLE "public"."EmblemAugment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillCode" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "costPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmblemAugment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmblemAugment_userId_skillCode_kind_key" ON "public"."EmblemAugment"("userId", "skillCode", "kind");
CREATE INDEX "EmblemAugment_userId_idx" ON "public"."EmblemAugment"("userId");
