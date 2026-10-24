import type { Metadata } from "next";
import { cookies } from "next/headers";
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
import { fatigueOn, fatiguedOf, type FatigueSummary } from "@/lib/review-fatigue";
// Revision 5, lane 9 (contracts ruling 67): the Gemini mark on a Domain Gemini named
import { AIM_PROMPT_COOKIE, geminiNamedOf, roadmapGoalsLive } from "@/lib/roadmap-types";
import { weekQuestsShownOnToday } from "@/lib/today-board";
import { freezeWeekQuests, loadWeekQuests } from "@/lib/roadmap-quests-server";
import { loadAimStep } from "@/lib/roadmap-server";
import { AIM_STEP_COOKIE, aimPromptOf, todayAimLineOf } from "@/lib/roadmap-invite";
import { LoadoutStrip } from "@/components/skills/LoadoutStrip";
import { WorkspaceView, type WorkspaceField } from "@/components/workspace/WorkspaceView";
import type { RecentIdea, ReviewEffects } from "@/components/workspace/ReviewHub";
import { loadLastSeen, loadReviewDay, loadStudyFocusRows, studyFocusFromRows } from "./review-data";
import { IdeasLead } from "./IdeasLead";

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
 * Ideas › Review, the Ideas landing (the three sections: Ideas, Tasks, Body):
 * the hub (quest, Start, field chips, loadout, encounters, Recent) and, on
 * the same route, the focus runner and the recap (WorkspaceView; ?view=run
 * in the URL). Its lead, above the workspace, is what moved here from Today
 * (IdeasLead): this week's roadmap quests or the aim line (or, with no aim,
 * one link to the roadmap), and the encounters ready.
 *
 * One wave of reads, every one cached and shared with the pages that need
 * the same rows: the Field tree, the Boss roster, today's ledger counts (the
 * quest and whether the day is kept), progression (the combo's ceiling, the
 * loadout strip and what is in effect on a review), the daily streak, each
 * Idea's last review, and the lead's: this life week's quests (roadmap F17:
 * one cached indexed row once the week is frozen), the aim's step (R4's
 * loadAimStep, at most 4 indexed reads, cached for the life day) and the
 * request's cookies (the aim line's "Not now" snoozes). A failure in the
 * lead's reads reads as no card, never as a failed hub. The answer side of an
 * Idea never leaves this file: the client gets questions.
 */
export default async function ReviewPage() {
  const now = new Date();
  const userId = getCurrentUserId();
  const today = todayKey(now);

  const [allFields, bosses, day, progression, streak, lastSeen, focusRows, quests, aimStep, jar] = await Promise.all([
    loadFieldTree(),
    loadBossStates(userId),
    loadReviewDay(userId, today),
    loadProgression(userId),
    getDailyStreak(userId),
    loadLastSeen(userId),
    loadStudyFocusRows(userId),
    loadWeekQuests(userId, now).catch(() => null),
    loadAimStep(userId, now).catch(() => null),
    cookies(),
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

  // Roadmap F14: this week's quest set, frozen once. The life cron freezes it just after Monday 04:00; a render that
  // finds none (a failed cron) freezes it after the response, as Today's and the roadmap page's do. freezeWeekQuests
  // writes only where life writes are on and never throws; a writes-off server shows the live set and schedules nothing.
  if (quests && !quests.frozen && !quests.view.writesOff) {
    after(() => freezeWeekQuests(userId, now, "RENDER"));
  }

  // The lead (moved from Today): the week quests card for an OPEN week with a quest, else the one quiet aim line
  // (roadmap-invite todayAimLineOf over the step, the prompt from aimPromptOf: the Settings switch and the "Not now"
  // cookies; the page never branches on the prompt), else, with no goal open at all, one link to the roadmap.
  const aimCookie = jar.get(AIM_PROMPT_COOKIE)?.value;
  const aimLine = todayAimLineOf({
    step: aimStep,
    prompt: aimPromptOf(aimCookie, aimStep?.aimSuggestions ?? null, today),
    cookie: aimCookie,
    stepCookie: jar.get(AIM_STEP_COOKIE)?.value,
    today,
    // The Start gate in force (ROADMAP_GOALS_LIVE; outside production the rehearsal's XTNL_ROADMAP_GOALS_LIVE).
    goalsLive: roadmapGoalsLive(),
  });
  const weekQuests = quests && weekQuestsShownOnToday(quests.view) ? quests.view : null;
  const noAim = aimStep != null && aimStep.open == null && !((aimStep.openCount ?? 0) > 0);
  const lead = (
    <IdeasLead
      quests={weekQuests}
      aimLine={weekQuests ? null : aimLine}
      noAim={noAim}
      bossesReady={bosses.filter((b) => b.availability.status === "ready").map((b) => b.archetype.name)}
      today={today}
    />
  );

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
      <LoadoutStrip slots={progression.loadout.map((e, slot) => ({ slot, skill: e?.skill ?? null, active: e?.active ?? false, ...(e?.frozen ? { frozen: e.frozen } : {}) }))} />
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

  // Review fatigue (blueprint P30): the hub publishes the rule, with today's answers (the trigger's own count) and the
  // FATIGUED row in effect from the progression already read, only once FATIGUE_LAUNCH_DAY is in force; before, nothing.
  const fatigue: FatigueSummary | null = fatigueOn(today) ? { answers: day.reviews, until: fatiguedOf(progression.debuffs, now)?.until ?? null } : null;

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
      {...(fatigue ? { fatigue } : {})}
      recent={recent}
      focus={focus}
      lead={lead}
    />
  );
}
