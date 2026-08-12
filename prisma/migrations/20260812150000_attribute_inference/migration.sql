-- Hand-authored, per this project's convention (see the init_pgvector and
-- add_field_snapshot headers for why `prisma migrate dev` cannot be used
-- against this Supabase instance).
--
-- Generated with `prisma migrate diff --from-url ... --to-schema-datamodel`,
-- with TWO proposed statements removed after checking the live database:
--
--   DROP INDEX "Idea_embedding_hnsw_idx"
--     The standing artifact of `Idea.embedding` being
--     Unsupported("vector(1536)") — Prisma cannot model the column, so any
--     hand-built index on it always reads as "should not exist". It stays.
--
--   CREATE UNIQUE INDEX "UnlockedSkill_userId_equippedSlot_key"
--     Already present (verified against pg_indexes: the table carries
--     UnlockedSkill_pkey, _userId_skillCode_key and _userId_equippedSlot_key).
--     The diff proposes it regardless; running it would fail on a duplicate.

-- AlterTable: how many Ideas have been folded into a Domain's attribute
-- split so far. Distinct from a live count of its Ideas — deleting one must
-- not make the next submission swing the Domain harder.
ALTER TABLE "Domain" ADD COLUMN "attributeObservations" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: the single attribute an Idea most exercises. Nullable: every
-- row predating inference has none, and a generic submission may be
-- genuinely uncallable.
ALTER TABLE "Idea" ADD COLUMN "attribute" "Attribute";

-- CreateTable
CREATE TABLE "DomainAttribute" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "attribute" "Attribute" NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DomainAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DomainAttribute_domainId_idx" ON "DomainAttribute"("domainId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainAttribute_domainId_attribute_key" ON "DomainAttribute"("domainId", "attribute");

-- AddForeignKey
ALTER TABLE "DomainAttribute" ADD CONSTRAINT "DomainAttribute_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
