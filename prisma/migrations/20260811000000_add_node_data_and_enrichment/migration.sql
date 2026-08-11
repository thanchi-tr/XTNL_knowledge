-- Hand-authored, for the same reason as the add_field_snapshot migration:
-- `prisma migrate dev`'s pre-flight drift check fails on Supabase because
-- its default extensions (pgcrypto, uuid-ossp, pg_stat_statements,
-- supabase_vault) exist in the real database but not in our migration
-- history, so the shadow-database replay never matches and Prisma offers to
-- reset the schema. See that migration's header and the README.
--
-- Apply directly, then record as applied:
--   npx prisma migrate resolve --applied 20260811000000_add_node_data_and_enrichment
--
-- Nothing here touches the `vector` column or the HNSW index, so unlike the
-- Phase 1 migration there is no extension dependency — these are plain
-- ALTER/CREATE statements Prisma would have generated itself.

-- ============================================================================
-- Idea: memory-engineering node data
-- ============================================================================
-- All four are nullable / defaulted: every Idea that predates the dedup
-- pipeline has no node data, and this migration deliberately does not
-- invent any — populating them would mean one Gemini call per existing
-- row, which does not belong inside a migration transaction. Existing
-- Ideas keep working without node data; see the field's doc comment in
-- schema.prisma for the fallbacks readers apply.
ALTER TABLE "Idea" ADD COLUMN "title" TEXT;
ALTER TABLE "Idea" ADD COLUMN "corePremise" TEXT;
ALTER TABLE "Idea" ADD COLUMN "atomicPrompt" TEXT;
ALTER TABLE "Idea" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ============================================================================
-- IdeaEnrichment
-- ============================================================================
CREATE TABLE "IdeaEnrichment" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdeaEnrichment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IdeaEnrichment_ideaId_idx" ON "IdeaEnrichment"("ideaId");

ALTER TABLE "IdeaEnrichment"
    ADD CONSTRAINT "IdeaEnrichment_ideaId_fkey"
    FOREIGN KEY ("ideaId") REFERENCES "Idea"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
