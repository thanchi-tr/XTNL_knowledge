-- Field maintenance mode: the set of Fields excused the weekly new-Idea
-- quota and excluded from Boss encounters.
--
-- Hand-authored rather than generated. `prisma migrate diff` against this
-- database reliably proposes `DROP INDEX "Idea_embedding_hnsw_idx"` as a
-- false positive — Idea.embedding is Unsupported("vector(1536)"), so Prisma
-- cannot model its HNSW index and believes it is orphaned. Including that
-- drop would silently destroy vector search.
--
-- Stored as the exception, so no backfill is needed: an empty table means
-- every Field is of interest, which is precisely the pre-existing behaviour.

CREATE TABLE "public"."FieldMaintenance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldMaintenance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FieldMaintenance_userId_fieldId_key" ON "public"."FieldMaintenance"("userId", "fieldId");
CREATE INDEX "FieldMaintenance_fieldId_idx" ON "public"."FieldMaintenance"("fieldId");

ALTER TABLE "public"."FieldMaintenance"
  ADD CONSTRAINT "FieldMaintenance_fieldId_fkey"
  FOREIGN KEY ("fieldId") REFERENCES "public"."Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;
