/**
 * You › Stats reads (server only): the old Overview and Dashboard merged into
 * one honest set of figures. Everything is counted from real rows.
 */
import { isDue } from "@/lib/due";
import { getCapitalBalance, pendingDividend } from "@/lib/capital";
import { loadFieldTree } from "@/lib/queries";
import { loadProgression } from "@/lib/skill-effects";
import { getSkill } from "@/lib/skill-pool";
import { getGhostLevelsFromDaysAgo } from "@/lib/snapshot";
import { getDailyStreak } from "@/lib/streak";
import { domainLevelProgress, MASTERY_LEVEL } from "@/lib/xp";
import { characterRaw, titleDistance, type TitleDistance } from "@/components/home/sheet-math";

export interface StatsData {
  level: number;
  title: string;
  distance: TitleDistance;
  fields: number;
  domains: number;
  ideas: number;
  pointsAllTime: number;
  mastered: number;
  streak: number;
  queue: { due: number; struggling: number; learned: number };
  fieldLevels: { name: string; level: number; delta: number | null; points: number; domains: number }[];
  nearest: { name: string; field: string; level: number; progress: number }[];
  levelBuckets: number[];
  questionTypes: { name: string; count: number }[];
  dividend: { amount: number; perHour: number; capped: boolean; balance: number };
  hasGhost: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  SHORT: "Short answer",
  CLOZE: "Cloze",
  NUMERIC: "Numeric",
  MULTI: "Multiple choice",
  LIST: "List",
  ORDER: "Order",
  FORMULA: "Formula",
  DIAGRAM: "Diagram",
};

export async function loadStats(userId: string, now = new Date()): Promise<StatsData> {
  const [tree, progression, ghosts, streak, balance] = await Promise.all([
    loadFieldTree(),
    loadProgression(userId),
    getGhostLevelsFromDaysAgo(7),
    getDailyStreak(userId).catch(() => null),
    getCapitalBalance(userId).catch(() => 0),
  ]);
  const pending = await pendingDividend(userId, progression.activeSkills).catch(() => ({ amount: 0, perHour: 0, capped: false, hoursAccrued: 0 }));

  const raw = characterRaw(tree.map((f) => f.level));
  const level = Math.floor(raw);
  const ultimates = progression.ownedCodes.filter((c) => getSkill(c)?.rank === "ULTIMATE").length;
  const distance = titleDistance(raw, ultimates > 0);

  const ideas = tree.flatMap((f) => f.domains.flatMap((d) => d.ideas));
  let due = 0;
  let struggling = 0;
  const buckets = Array.from({ length: 12 }, () => 0);
  const types = new Map<string, number>();
  for (const i of ideas) {
    const pastGrace = i.graceEndsAt !== null && i.graceEndsAt <= now;
    if (pastGrace) struggling += 1;
    else if (isDue(i.dueDate, now)) due += 1;
    buckets[Math.min(11, Math.max(0, i.level - 1))] += 1;
    types.set(i.questionType, (types.get(i.questionType) ?? 0) + 1);
  }

  const ghostBy = new Map(ghosts.map((g) => [g.fieldName, g.level]));
  const fieldLevels = tree
    .map((f) => ({
      name: f.name,
      level: f.level,
      delta: ghosts.length > 0 ? f.level - (ghostBy.get(f.name) ?? 0) : null,
      points: f.domains.reduce((s, d) => s + d.totalPoints, 0),
      domains: f.domains.length,
    }))
    .sort((a, b) => b.level - a.level || b.points - a.points);

  const nearest = tree
    .flatMap((f) => f.domains.map((d) => ({ name: d.name, field: f.name, ...domainLevelProgress(d.totalPoints) })))
    .filter((d) => d.progress > 0 && d.progress < 1)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 5)
    .map((d) => ({ name: d.name, field: d.field, level: d.level, progress: d.progress }));

  return {
    level,
    title: distance.current,
    distance,
    fields: tree.length,
    domains: tree.reduce((s, f) => s + f.domains.length, 0),
    ideas: ideas.length,
    pointsAllTime: fieldLevels.reduce((s, f) => s + f.points, 0),
    mastered: ideas.filter((i) => i.level >= MASTERY_LEVEL).length,
    streak: streak?.current ?? 0,
    queue: { due, struggling, learned: Math.max(0, ideas.length - due - struggling) },
    fieldLevels,
    nearest,
    levelBuckets: buckets,
    questionTypes: [...types.entries()].map(([k, n]) => ({ name: TYPE_LABEL[k] ?? k, count: n })).sort((a, b) => b.count - a.count),
    dividend: { amount: pending.amount, perHour: pending.perHour, capped: pending.capped, balance },
    hasGhost: ghosts.length > 0,
  };
}
