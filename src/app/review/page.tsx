import type { Metadata } from "next";
import { after } from "next/server";
import { loadFieldTree } from "@/lib/queries";
import { isDue, daysUntilDue } from "@/lib/due";
import { displayQuestion } from "@/lib/idea-display";
import { pickCardWording } from "@/lib/idea-variants";
import { loadVariants } from "@/lib/idea-variants-server";
import { loadBossStates } from "@/lib/bosses";
import { recordDayOpen } from "@/lib/tasks";
import { getCurrentUserId } from "@/lib/user";
import { todayKey } from "@/lib/life-day";
import { loadProgression } from "@/lib/skill-effects";
import { getDailyStreak } from "@/lib/streak";
import { describeModifiers } from "@/lib/modifier-display";
import { BOON_META } from "@/lib/boon-meta";
import { DEBUFF_META } from "@/lib/debuff-meta";
import { MASTERY_LEVEL } from "@/lib/xp";
import { questTargetOf } from "@/lib/review-facts";
// Revision 5, lane 9 (contracts ruling 67): the Gemini mark on a Domain Gemini named
import { geminiNamedOf } from "@/lib/roadmap-types";
import { LoadoutStrip } from "@/components/skills/LoadoutStrip";
import { WorkspaceView, type WorkspaceField } from "@/components/workspace/WorkspaceView";
import type { RecentIdea, ReviewEffects } from "@/components/workspace/ReviewHub";
import { loadLastSeen, loadReviewDay, loadStudyFocusRows, studyFocusFromRows } from "./review-data";

// Due-ness changes by the second (dueDate <= now) — never let this be
// statically cached/prerendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Review" };

function daysLabel(days: number): string {
  if (days <= 0) return "later today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/**
 * Study › Review: the hub (quest, Start, field chips, loadout, encounters,
 * Recent) and, on the same route, the focus runner and the recap
 * (WorkspaceView; ?view=run in the URL).
 *
 * One wave of reads, every one cached and shared with the pages that need
 * the same rows: the Field tree, the Boss roster, today's ledger counts (the
 * quest and whether the day is kept), progression (the combo's ceiling, the
 * loadout strip and what is in effect on a review), the daily streak and
 * each Idea's last review. The answer side of an Idea never leaves this
 * file: the client gets questions.
 */
export default async function ReviewPage() {
  const now = new Date();
  const userId = getCurrentUserId();
  const today = todayKey(now);

  const [allFields, bosses, day, progression, streak, lastSeen, focusRows] = await Promise.all([
    loadFieldTree(),
    loadBossStates(userId),
    loadReviewDay(userId, today),
    loadProgression(userId),
    getDailyStreak(userId),
    loadLastSeen(userId),
    loadStudyFocusRows(userId),
  ]);

  // Day-granular, not instant — see `src/lib/due.ts`. A card due today is
  // reviewable today, not from whatever time of day it happened to be
  // scheduled at.
  const dueFields: WorkspaceField[] = allFields
    .map((field) => ({
      id: field.id,
      name: field.name,
      cards: field.domains.flatMap((domain) =>
        domain.ideas
          .filter((idea) => isDue(idea.dueDate, now))
          .map((idea) => ({
            id: idea.id,
            level: idea.level,
            questionType: idea.questionType,
            question: idea.question,
            preview: displayQuestion(idea.questionType, idea.question),
            // A MULTI card's payload is only its options; its retrieval question is the prompt. Never the answer.
            prompt: idea.questionType === "MULTI" ? idea.atomicPrompt?.trim() || null : null,
            domainName: domain.name,
            domainId: domain.id,
            domainGeminiNamed: geminiNamedOf(domain),
            fieldName: field.name,
            lastSeenDay: lastSeen.byIdea[idea.id] ?? null,
            overdue: daysUntilDue(idea.dueDate, now) < 0,
          }))
      ),
    }))
    .filter((f) => f.cards.length > 0);

  // Question variants: each card shows its original wording or one of its other wordings, picked at random each time
  // the queue loads (idea-variants.ts pickCardWording). Grading reads only the answer, so nothing else changes.
  const variants = await loadVariants(dueFields.flatMap((f) => f.cards.map((c) => c.id)));
  const fields: WorkspaceField[] = dueFields.map((f) => ({ ...f, cards: f.cards.map((c) => pickCardWording(c, variants.get(c.id), displayQuestion)) }));

  const totalDue = fields.reduce((s, f) => s + f.cards.length, 0);

  // Ruling N14: the accepted roadmap's open layer and its one topic now (null without one; never blocks the hub).
  const focus = studyFocusFromRows(focusRows, allFields, (d) => isDue(d, now));

  // The day's first look at the queue fixes the Today quest's target ("clear
  // the 17 that were due this morning"), so cards falling due later cannot
  // move it. After the response, once per life day; nothing here waits on it.
  after(() => recordDayOpen(userId, totalDue, now));

  // The soonest thing that is *not* due yet, so an empty queue can say when to come back.
  const allIdeas = allFields.flatMap((f) => f.domains.flatMap((d) => d.ideas.map((i) => ({ idea: i, domainName: d.name, domainGeminiNamed: geminiNamedOf(d) }))));
  const notYetDue = allIdeas.filter(({ idea }) => !isDue(idea.dueDate, now)).sort((a, b) => a.idea.dueDate.getTime() - b.idea.dueDate.getTime());
  const nextDate = notYetDue[0]?.idea.dueDate ?? null;
  const upcoming = nextDate
    ? {
        label: daysLabel(daysUntilDue(nextDate, now)),
        // Everything landing on the same day, not just the single soonest.
        count: notYetDue.filter(({ idea }) => daysUntilDue(idea.dueDate, now) === daysUntilDue(nextDate, now)).length,
      }
    : null;

  const quest = { done: day.reviews, target: questTargetOf(day.dayOpenQty, day.reviews, totalDue) };

  const m = progression.modifiers;
  // L4's one loadout strip (mini coins, "7 of 10"), from the progression this page already read.
  // Like LoadoutStripSlot, it shows nothing until the first emblem is owned.
  const loadoutStrip =
    progression.ownedCodes.length > 0 ? (
      <LoadoutStrip slots={progression.loadout.map((e, slot) => ({ slot, skill: e?.skill ?? null, active: e?.active ?? false }))} />
    ) : null;

  const effects: ReviewEffects = {
    lines: describeModifiers(m)
      .slice(0, 3)
      .map((l) => `${l.label} ${l.value}`),
    boons: progression.boons.map((b) => ({
      kind: b.kind,
      label: BOON_META[b.kind].label,
      effect: BOON_META[b.kind].effectText(b.magnitude),
      until: b.expiresAt,
    })),
    penalties: progression.debuffs.map((d) => ({
      kind: d.kind,
      label: DEBUFF_META[d.kind].label,
      effect: DEBUFF_META[d.kind].effectText(d.magnitude),
      clears: DEBUFF_META[d.kind].clears,
      until: d.expiresAt,
    })),
  };

  const byId = new Map(allIdeas.map((x) => [x.idea.id, x]));
  const recent: RecentIdea[] = lastSeen.recent
    .map((id) => byId.get(id))
    .filter((x): x is NonNullable<typeof x> => x != null && !isDue(x.idea.dueDate, now))
    .slice(0, 4)
    .map(({ idea, domainName, domainGeminiNamed }) => {
      const days = daysUntilDue(idea.dueDate, now);
      return {
        id: idea.id,
        title: idea.title?.trim() || displayQuestion(idea.questionType, idea.question),
        domainName,
        domainGeminiNamed,
        nextLabel: days === 1 ? "next tomorrow" : `next in ${days} days`,
        level: idea.level,
        mastered: idea.level >= MASTERY_LEVEL,
      };
    });

  return (
    <WorkspaceView
      fields={fields}
      totalDue={totalDue}
      bosses={bosses}
      upcoming={upcoming}
      scheduledCount={notYetDue.length}
      quest={quest}
      comboCap={m.comboCap}
      today={today}
      dayKept={streak.last7Days[streak.last7Days.length - 1] === true}
      dayStreak={streak.current}
      loadoutStrip={loadoutStrip}
      effects={effects}
      recent={recent}
      focus={focus}
    />
  );
}
