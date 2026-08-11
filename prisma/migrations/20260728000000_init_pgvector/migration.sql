-- Hand-authored initial migration.
--
-- This file exists (rather than being generated purely by `prisma migrate dev`)
-- because Prisma Migrate does not know how to author two things this schema
-- needs: enabling the pgvector extension, and building an ANN index over a
-- `vector` column (`Unsupported("vector(1536)")` fields are opaque to the
-- migration engine's SQL diffing). Everything else mirrors exactly what
-- `prisma migrate dev` would generate from schema.prisma.
--
-- Apply with `npx prisma migrate deploy` (or `migrate dev` to keep continuing
-- from here) against a Postgres instance where the current DB role has
-- CREATE EXTENSION privileges (superuser, or `rds_superuser` / the Supabase
-- `postgres` role on managed providers).

-- ============================================================================
-- Extension
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Enums
-- ============================================================================
CREATE TYPE "CollectionLabel" AS ENUM ('BOOK', 'ACTIONABLE', 'PROPOSAL');
CREATE TYPE "QuestionType" AS ENUM ('SHORT', 'MULTI', 'DIAGRAM', 'FORMULA');

-- ============================================================================
-- Field
-- ============================================================================
CREATE TABLE "Field" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Field_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Field_name_key" ON "Field"("name");

-- ============================================================================
-- Domain
-- ============================================================================
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "totalPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Domain_fieldId_idx" ON "Domain"("fieldId");

ALTER TABLE "Domain"
    ADD CONSTRAINT "Domain_fieldId_fkey"
    FOREIGN KEY ("fieldId") REFERENCES "Field"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Idea
-- ============================================================================
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "collectionLabel" "CollectionLabel" NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "basePoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "yieldPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fragments" INTEGER NOT NULL DEFAULT 1,
    "question" TEXT NOT NULL,
    "questionType" "QuestionType" NOT NULL,
    "answer" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "graceEndsAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "endorsements" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "linkedIdeaIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Idea_domainId_idx" ON "Idea"("domainId");
CREATE INDEX "Idea_dueDate_idx" ON "Idea"("dueDate");

ALTER TABLE "Idea"
    ADD CONSTRAINT "Idea_domainId_fkey"
    FOREIGN KEY ("domainId") REFERENCES "Domain"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Approximate-nearest-neighbor index for cosine similarity search
-- (DomainDiscoveryService uses `<=>`, pgvector's cosine-distance operator).
-- HNSW over IVFFlat: no training/list-count tuning needed, and recall stays
-- high as the table grows from a cold, near-empty seed.
CREATE INDEX "Idea_embedding_hnsw_idx" ON "Idea"
    USING hnsw ("embedding" vector_cosine_ops);

-- ============================================================================
-- UnlockedSkill
-- ============================================================================
CREATE TABLE "UnlockedSkill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillCode" TEXT NOT NULL,
    "usesThisWeek" INTEGER NOT NULL DEFAULT 0,
    "weekAnchor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnlockedSkill_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UnlockedSkill_userId_skillCode_key" ON "UnlockedSkill"("userId", "skillCode");
