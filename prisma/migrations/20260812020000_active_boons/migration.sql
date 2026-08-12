-- Hand-authored, same reason as every migration in this directory: Supabase
-- ships extensions this schema never declared, so `prisma migrate dev`
-- reports drift and offers to reset rather than diffing tables. Generated
-- with `prisma migrate diff --from-url ... --to-schema-datamodel` against
-- the real DIRECT_URL, with one proposed line removed —
-- `DROP INDEX "Idea_embedding_hnsw_idx"` — which is an artifact of
-- `Idea.embedding` being `Unsupported("vector(1536)")`: Prisma cannot model
-- that column, so any hand-created index on it always reads as "not supposed
-- to exist". The HNSW index stays.

-- CreateTable
CREATE TABLE "ActiveBoon" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "magnitude" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActiveBoon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActiveBoon_userId_idx" ON "ActiveBoon"("userId");
