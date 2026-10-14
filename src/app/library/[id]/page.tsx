import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { ideaHistory } from "@/app/actions/ideas";
import { loadVariants } from "@/lib/idea-variants-server";
import { ideaOutlook } from "@/lib/forgetting";
import { loadModifiers } from "@/lib/skill-effects";
import { getCurrentUserId } from "@/lib/user";
import { Button } from "@/components/ui/Button";
import { PageActions } from "@/components/ui/Tabs";
import { IdeaDetailPage } from "@/components/library/IdeaDetail";
import { historyOf, ideaHeadline, type LibraryIdea } from "@/components/library/library-model";
import "@/components/library/study.css";
// Revision 5, lane 9 (contracts ruling 67): pv.named after a Domain Gemini named
import { DomainName } from "@/components/glyph/NamedMark";
import { geminiNamedOf } from "@/lib/roadmap-types";

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
      answerCaseSensitive: true,
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
      graceEndsAt: true,
      cleanStreak: true,
      failedAttempts: true,
      ease: true,
      cycleMissed: true,
      createdAt: true,
      // nameOrigin and originName: the Gemini mark (revision 5, lane 9; contracts ruling 67; migration B's Domain columns)
      domain: { select: { id: true, name: true, nameOrigin: true, originName: true, field: { select: { id: true, name: true } } } },
    },
  });
});

/**
 * The idea's ledger history, the skills' grace extension (the outlook's), and the request time (read once, outside
 * render, so server and browser agree on "due" and "fading").
 */
async function loadHistory(id: string) {
  const [rows, modifiers] = await Promise.all([ideaHistory(id), loadModifiers(getCurrentUserId())]);
  return { rows, now: new Date(), graceExtraDays: Math.max(0, modifiers.graceExtraDays || 0) };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const row = await loadIdea(id);
  if (!row) return { title: "Idea" };
  const headline = ideaHeadline(row);
  return { title: headline.length > 60 ? `${headline.slice(0, 59).trimEnd()}…` : headline };
}

/**
 * Study › Library › an idea: question, answer (and its other wordings), level
 * ring, history strip, next due, Edit and a quiet Delete. Review results and the recap link here.
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
  const [{ rows, now: nowDate, graceExtraDays }, variants] = await Promise.all([loadHistory(row.id), loadVariants([row.id])]);
  const now = nowDate.getTime();

  const idea: LibraryIdea = {
    id: row.id,
    question: row.question,
    answer: row.answer,
    answerCaseSensitive: row.answerCaseSensitive,
    questionType: row.questionType,
    collectionLabel: row.collectionLabel,
    level: row.level,
    isArchived: row.isArchived,
    fieldId: row.domain.field.id,
    fieldName: row.domain.field.name,
    domainId: row.domain.id,
    domainName: row.domain.name,
    domainGeminiNamed: geminiNamedOf(row.domain),
    title: row.title,
    corePremise: row.corePremise,
    tags: row.tags,
    linkedCount: row.linkedIdeaIds.length,
    difficulty: row.difficulty,
    dueAt: row.dueDate.getTime(),
    failedAttempts: row.failedAttempts,
    createdAt: row.createdAt.getTime(),
    outlook: ideaOutlook(
      { level: row.level, dueDate: row.dueDate, graceEndsAt: row.graceEndsAt, cleanStreak: row.cleanStreak, failedAttempts: row.failedAttempts, ease: row.ease, cycleMissed: row.cycleMissed },
      nowDate,
      graceExtraDays
    ),
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
            {idea.domainGeminiNamed ? <DomainName name={idea.domainName} geminiNamed /> : idea.domainName} · {idea.fieldName}
          </div>
          <h2 className="t-display-m">{headline}</h2>
          {idea.corePremise && idea.corePremise !== headline && (
            <p className="t-meta" style={{ marginTop: 6 }}>
              {idea.corePremise}
            </p>
          )}
        </header>
        <IdeaDetailPage idea={idea} now={now} history={historyOf(rows)} variants={variants.get(idea.id) ?? []} />
      </div>
    </div>
  );
}
