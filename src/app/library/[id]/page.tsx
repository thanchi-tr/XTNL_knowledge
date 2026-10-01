import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { ideaHistory } from "@/app/actions/ideas";
import { Button } from "@/components/ui/Button";
import { PageActions } from "@/components/ui/Tabs";
import { IdeaDetailPage } from "@/components/library/IdeaDetail";
import { historyOf, ideaHeadline, type LibraryIdea } from "@/components/library/library-model";
import "@/components/library/study.css";

export const dynamic = "force-dynamic";

/** One read per request, shared by the metadata and the page. */
const loadIdea = cache(async (id: string) => {
  if (!id || id.length > 64) return null;
  return prisma.idea.findUnique({
    where: { id },
    select: {
      id: true,
      question: true,
      answer: true,
      questionType: true,
      collectionLabel: true,
      level: true,
      isArchived: true,
      title: true,
      corePremise: true,
      tags: true,
      linkedIdeaIds: true,
      difficulty: true,
      dueDate: true,
      failedAttempts: true,
      createdAt: true,
      domain: { select: { id: true, name: true, field: { select: { id: true, name: true } } } },
    },
  });
});

/** The idea's ledger history plus the request time (read once, outside render, so server and browser agree on "due"). */
async function loadHistory(id: string) {
  const rows = await ideaHistory(id);
  return { rows, now: Date.now() };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const row = await loadIdea(id);
  if (!row) return { title: "Idea" };
  const headline = ideaHeadline(row);
  return { title: headline.length > 60 ? `${headline.slice(0, 59).trimEnd()}…` : headline };
}

/**
 * Study › Library › an idea: question, answer, level ring, history strip,
 * next due, Edit and a quiet Delete. Review results and the recap link here.
 * The Library opens the same detail as a sheet; this is its deep link.
 *
 * The top bar keeps the shell's own "Study / Idea" (nav.titleFor, rendered on
 * the server), so nothing swaps after the first paint; the headline is said
 * once, in the card below, under its domain · field eyebrow.
 */
export default async function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await loadIdea(id);
  if (!row) notFound();
  const { rows, now } = await loadHistory(row.id);

  const idea: LibraryIdea = {
    id: row.id,
    question: row.question,
    answer: row.answer,
    questionType: row.questionType,
    collectionLabel: row.collectionLabel,
    level: row.level,
    isArchived: row.isArchived,
    fieldId: row.domain.field.id,
    fieldName: row.domain.field.name,
    domainId: row.domain.id,
    domainName: row.domain.name,
    title: row.title,
    corePremise: row.corePremise,
    tags: row.tags,
    linkedCount: row.linkedIdeaIds.length,
    difficulty: row.difficulty,
    dueAt: row.dueDate.getTime(),
    failedAttempts: row.failedAttempts,
    createdAt: row.createdAt.getTime(),
  };
  const headline = ideaHeadline(idea);

  return (
    <div className="page narrow cq-main">
      <PageActions>
        <Button variant="quiet" href="/library" icon="back">
          Library
        </Button>
      </PageActions>
      <div className="idea-page">
        <header className="card idea-head">
          <div className="t-eyebrow">
            {idea.domainName} · {idea.fieldName}
          </div>
          <h2 className="t-display-m">{headline}</h2>
          {idea.corePremise && idea.corePremise !== headline && (
            <p className="t-meta" style={{ marginTop: 6 }}>
              {idea.corePremise}
            </p>
          )}
        </header>
        <IdeaDetailPage idea={idea} now={now} history={historyOf(rows)} />
      </div>
    </div>
  );
}
