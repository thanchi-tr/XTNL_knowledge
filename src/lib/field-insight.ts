import { cache } from "react";
import type { Attribute } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { loadLibraryTree } from "./queries";
import { loadBossStates } from "./bosses";
import { loadMaintenanceIds } from "./field-focus";
import { loadWeeklyQuotas } from "./field-quota";
import { getGhostLevelsFromDaysAgo } from "./snapshot";
import { loadModifiers } from "./skill-effects";
import { ideaOutlook, type IdeaOutlook } from "./forgetting";
import { effectiveFieldComposition } from "./attribute-inference";
import { emptyComposition, type Composition } from "./attributes";
import { keyOfDateColumn, todayKey } from "./life-day";
import { geminiNamedOf } from "./roadmap-types";
import type { LibraryIdea } from "@/components/library/library-model";
import { byDomainLevel, domainSectionOf, summarizeField, type DomainSection, type FieldSummary } from "@/components/library/field-model";

/**
 * The Field reads behind the Library's Field pop-up and the Field page
 * (/library/field/[fieldId]). Server only (Prisma). Every read is one the app
 * already caches (the library tree, the Boss roster, the quotas, the ghost
 * levels, progression for the skills' grace extension) plus two small cached
 * queries of its own (compositions, streaks); the sums are field-model.ts's,
 * pure, so scripts/library-check.ts pins them on fixtures.
 *
 *   loadFieldInsights(userId, now)            every idea with its outlook, and every Field's summary (the light one)
 *   loadFieldPage(userId, fieldId, now)       one Field: its summary and its Domains with their ideas; null when unknown
 *   ideaOutlookOf(idea, now, graceExtraDays)  forgetting.ts ideaOutlook over an Idea row
 *
 * `now` is read once by the caller (outside render) and passed down, so the
 * server render and the browser agree on what is due and what is fading.
 */

type LibraryTree = Awaited<ReturnType<typeof loadLibraryTree>>;
type TreeField = LibraryTree[number];
type TreeDomain = TreeField["domains"][number];
type TreeIdea = TreeDomain["ideas"][number];

/** forgetting.ts ideaOutlook over an Idea row, at `now`, with the skills' grace extension. */
export function ideaOutlookOf(
  idea: { level: number; dueDate: Date; graceEndsAt: Date | null; cleanStreak: number; failedAttempts: number; ease: number; cycleMissed: boolean },
  now: Date,
  graceExtraDays: number
): IdeaOutlook {
  return ideaOutlook(
    { level: idea.level, dueDate: idea.dueDate, graceEndsAt: idea.graceEndsAt, cleanStreak: idea.cleanStreak, failedAttempts: idea.failedAttempts, ease: idea.ease, cycleMissed: idea.cycleMissed },
    now,
    graceExtraDays
  );
}

/** One Idea row as the Library carries it. */
export function libraryIdeaOf(f: Pick<TreeField, "id" | "name">, d: TreeDomain, i: TreeIdea, outlook: IdeaOutlook): LibraryIdea {
  return {
    id: i.id,
    question: i.question,
    answer: i.answer,
    answerCaseSensitive: i.answerCaseSensitive,
    questionType: i.questionType,
    collectionLabel: i.collectionLabel,
    level: i.level,
    isArchived: i.isArchived,
    fieldId: f.id,
    fieldName: f.name,
    domainId: d.id,
    domainName: d.name,
    domainGeminiNamed: geminiNamedOf(d),
    // Node data from the dedup pipeline. Nullable on anything created
    // before it existed, so every consumer treats it as optional.
    title: i.title,
    corePremise: i.corePremise,
    tags: i.tags,
    linkedCount: i.linkedIdeaIds.length,
    difficulty: i.difficulty,
    dueAt: i.dueDate.getTime(),
    failedAttempts: i.failedAttempts,
    createdAt: i.createdAt.getTime(),
    outlook,
  };
}

/** Every Field's effective attribute composition (attribute-inference.ts), keyed by Field id. */
const loadCompositions = cache(async (): Promise<Record<string, Composition>> =>
  cached("fieldInsight:compositions", ["fields", "ideas"], async () => {
    const fields = await prisma.field.findMany({
      relationLoadStrategy: "join",
      select: {
        id: true,
        attributes: { select: { attribute: true, weight: true } },
        domains: { select: { totalPoints: true, attributes: { select: { attribute: true, weight: true } } } },
      },
    });
    const out: Record<string, Composition> = {};
    for (const f of fields) {
      const own = emptyComposition();
      for (const a of f.attributes) own[a.attribute] = a.weight;
      const domains = f.domains
        .filter((d) => d.attributes.length > 0)
        .map((d) => {
          const composition = emptyComposition();
          for (const a of d.attributes) composition[a.attribute] = a.weight;
          return { composition, totalPoints: d.totalPoints };
        });
      out[f.id] = effectiveFieldComposition(own, domains);
    }
    return out;
  })
);

/** The user's FieldStreak rows (current and best days, the last active life day). */
const loadStreaks = cache(async (userId: string) =>
  cached(`fieldInsight:streaks:${userId}`, ["progress"], () =>
    prisma.fieldStreak.findMany({ where: { userId }, select: { fieldId: true, currentDays: true, bestDays: true, lastActiveDay: true } })
  )
);

/** Everything a summary reads beside the tree, loaded together. */
async function loadContext(userId: string, now: Date) {
  const [tree, compositions, streaks, bosses, quotas, maintained, ghosts, modifiers] = await Promise.all([
    loadLibraryTree(),
    loadCompositions(),
    loadStreaks(userId),
    loadBossStates(userId),
    loadWeeklyQuotas(userId, now),
    loadMaintenanceIds(userId),
    getGhostLevelsFromDaysAgo(7),
    loadModifiers(userId),
  ]);
  const graceExtraDays = Math.max(0, modifiers.graceExtraDays || 0);
  return {
    tree,
    graceExtraDays,
    today: todayKey(now),
    compositions,
    streakBy: new Map(streaks.map((s) => [s.fieldId, s])),
    bossBy: new Map(bosses.map((b) => [b.fieldId, b])),
    quotaBy: new Map(quotas.map((q) => [q.fieldId, q])),
    maintained,
    ghostBy: new Map(ghosts.map((g) => [g.fieldName, g.level])),
  };
}

type Context = Awaited<ReturnType<typeof loadContext>>;

function summaryOf(ctx: Context, f: TreeField, outlooks: Map<string, IdeaOutlook>): FieldSummary {
  const streak = ctx.streakBy.get(f.id);
  const quota = ctx.quotaBy.get(f.id);
  return summarizeField(
    {
      id: f.id,
      name: f.name,
      level: f.level,
      droppedFrom: f.droppedFrom,
      droppedAt: f.droppedAt?.getTime() ?? null,
      domains: f.domains.map((d) => ({
        id: d.id,
        name: d.name,
        level: d.level,
        ideas: d.ideas.map((i) => ({ level: i.level, isArchived: i.isArchived, outlook: outlooks.get(i.id)! })),
      })),
    },
    {
      todayKey: ctx.today,
      levelWeekAgo: ctx.ghostBy.get(f.name) ?? null,
      composition: (ctx.compositions[f.id] as Partial<Record<Attribute, number>> | undefined) ?? null,
      boss: ctx.bossBy.get(f.id) ?? null,
      streak: streak ? { currentDays: streak.currentDays, bestDays: streak.bestDays, lastActiveKey: keyOfDateColumn(streak.lastActiveDay) } : null,
      quota: quota ? { added: quota.added, quota: quota.quota } : null,
      maintained: ctx.maintained.has(f.id),
    }
  );
}

function outlooksOf(fields: readonly TreeField[], now: Date, graceExtraDays: number): Map<string, IdeaOutlook> {
  const out = new Map<string, IdeaOutlook>();
  for (const f of fields) for (const d of f.domains) for (const i of d.ideas) out.set(i.id, ideaOutlookOf(i, now, graceExtraDays));
  return out;
}

export interface LibraryInsight {
  /** The library tree (every Field, its Domains, every Idea, archived ones included). */
  tree: LibraryTree;
  /** Every idea, archived ones included, with its outlook at `now`. */
  ideas: LibraryIdea[];
  /** Every Field's summary, in the tree's order. */
  summaries: FieldSummary[];
}

/** The light read, for the Library: every idea with its outlook, and every Field's summary (the tiles and the pop-up). */
export async function loadFieldInsights(userId: string, now: Date): Promise<LibraryInsight> {
  const ctx = await loadContext(userId, now);
  const outlooks = outlooksOf(ctx.tree, now, ctx.graceExtraDays);
  const ideas = ctx.tree.flatMap((f) => f.domains.flatMap((d) => d.ideas.map((i) => libraryIdeaOf(f, d, i, outlooks.get(i.id)!))));
  return { tree: ctx.tree, ideas, summaries: ctx.tree.map((f) => summaryOf(ctx, f, outlooks)) };
}

export interface FieldPage {
  summary: FieldSummary;
  /** Highest level first; each with its non-archived ideas, most urgent first. */
  domains: DomainSection[];
}

/** One Field for its page: null when the id is unknown (the page 404s). */
export async function loadFieldPage(userId: string, fieldId: string, now: Date): Promise<FieldPage | null> {
  if (!fieldId || fieldId.length > 64) return null;
  const ctx = await loadContext(userId, now);
  const f = ctx.tree.find((x) => x.id === fieldId);
  if (!f) return null;
  const outlooks = outlooksOf([f], now, ctx.graceExtraDays);
  const domains = f.domains
    .map((d) =>
      domainSectionOf(
        { id: d.id, name: d.name, geminiNamed: geminiNamedOf(d), level: d.level, totalPoints: d.totalPoints, droppedFrom: d.droppedFrom, droppedAt: d.droppedAt?.getTime() ?? null },
        d.ideas.map((i) => libraryIdeaOf(f, d, i, outlooks.get(i.id)!))
      )
    )
    .sort(byDomainLevel);
  return { summary: summaryOf(ctx, f, outlooks), domains };
}
