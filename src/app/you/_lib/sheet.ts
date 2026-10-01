/**
 * The character sheet's reads (server only). Everything is real or null:
 * no placeholder figures (honest numbers). Composes cached reads; the one
 * query of its own (Field compositions, for the radar's sources and ghost)
 * is cached under the same tags as the attribute scores it explains.
 *
 * Life (life-tracks-server.ts) joins in one place each: the character level
 * counts the track levels (character.ts, as the shell does), the radar's
 * sources and its 7-days-ago ghost include the life rows ('Life · Body'),
 * and the Life tracks, goal ladder and purse read the same view. Before
 * launch that view is the not-launched one (every level 0, no rows), so the
 * sheet shows exactly the Fields-only numbers it always did.
 */
import type { Attribute } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/cache";
import { ATTRIBUTES, ATTRIBUTE_META, emptyComposition, type Composition } from "@/lib/attributes";
import { effectiveFieldComposition } from "@/lib/attribute-inference";
import { FIELD_TIERS, fieldTier } from "@/lib/field-tier";
import type { GoalLadder } from "@/lib/goals";
import { loadGoalLadder } from "@/lib/goals-server";
import { rungOf } from "@/lib/habit";
import { addDays, todayKey, type DayKey } from "@/lib/life-day";
import { isLaunched, lifeLaunchDay } from "@/lib/life-economy";
import { emptyLifeLedger, lifeContributionsAt, notLaunchedView, type LifeTracksView } from "@/lib/life-tracks";
import { loadLifeLedger, loadLifeTracks } from "@/lib/life-tracks-server";
import { TRACKS } from "@/lib/life-types";
import { getMasteryBalance } from "@/lib/mastery";
import { loadFieldTree } from "@/lib/queries";
import { loadProgression } from "@/lib/skill-effects";
import { SKILL_POOL, getSkill } from "@/lib/skill-pool";
import { getGhostLevelsFromDaysAgo, readProgress } from "@/lib/snapshot";
import { computeTitle, dominantAttribute } from "@/lib/titles";
import { MASTERY_LEVEL } from "@/lib/xp";
import { crestMaterial, type Material } from "@/lib/materials";
import { themeFor } from "@/lib/attribute-themes";
import { sidesFor } from "@/lib/skill-form";
import { readyEmblems } from "@/components/skills/ladder";
import type { RungCounts } from "@/components/home/GoalLadder";
import {
  characterRaw,
  ghostScores,
  knowledgeRow,
  lifeCompositions,
  lifeNoteDue,
  mainSourceOf,
  radarLayout,
  sourceLabel,
  titleDistance,
  topAttributes,
  type FieldComposition,
  type FieldLevelRow,
  type KnowledgeRow,
  type RadarLayout,
  type TitleDistance,
  type TopAttribute,
} from "@/components/home/sheet-math";


/** Every Field's effective composition and level (the attribute substrate). */
export async function loadFieldCompositions(): Promise<FieldComposition[]> {
  return cached("you:fieldCompositions", ["fields", "ideas"], async () => {
    const fields = await prisma.field.findMany({
      relationLoadStrategy: "join",
      select: {
        name: true,
        level: true,
        attributes: { select: { attribute: true, weight: true } },
        domains: { select: { totalPoints: true, attributes: { select: { attribute: true, weight: true } } } },
      },
    });
    return fields.map((f) => {
      const own = emptyComposition();
      for (const a of f.attributes) own[a.attribute] = a.weight;
      const domains = f.domains
        .filter((d) => d.attributes.length > 0)
        .map((d) => {
          const composition = emptyComposition();
          for (const a of d.attributes) composition[a.attribute] = a.weight;
          return { composition: composition as Composition, totalPoints: d.totalPoints };
        });
      return { name: f.name, level: f.level, composition: effectiveFieldComposition(own as Composition, domains) };
    });
  });
}

export interface SheetData {
  level: number;
  /** 0..1 toward level + 1. */
  progress: number;
  material: Material;
  title: string;
  epithet: string;
  transcendent: boolean;
  dominant: Attribute | null;
  distance: TitleDistance;
  balance: number;
  mastered: number;
  owned: number;
  poolSize: number;
  ready: { code: string; name: string; rank: string; cost: number; more: number } | null;
  knowledge: KnowledgeRow;
  radar: RadarLayout;
  hasGhost: boolean;
  top: TopAttribute[];
  tiers: { established: number; highest: string | null; highestField: string | null };
  /** The life day the sheet was read on. */
  today: DayKey;
  /** The life tracks (the not-launched view before launch: levels 0, no rows, no edges). */
  life: LifeTracksView;
  /** Open goals and goals closed in the last 30 days; null when they could not be read. */
  goals: GoalLadder | null;
  /** Recurring tasks by habit rung; null when they could not be read. */
  rungs: RungCounts | null;
  /** Show 'Life now counts toward your character': launched within the last 14 days (lifeNoteDue). */
  lifeNote: boolean;
}

/** Habit strengths: how many stand on each rung. */
function countRungs(strengths: readonly number[]): RungCounts {
  const out: RungCounts = { Seeded: 0, Forming: 0, Established: 0, Automatic: 0 };
  for (const s of strengths) out[rungOf(s)] += 1;
  return out;
}

/** Life rows as they stood on `day` (for the radar's ghost); none when life did not count then. */
async function lifeRowsOn(userId: string, day: DayKey): Promise<FieldLevelRow[]> {
  if (!isLaunched(day)) return [];
  const ledger = await loadLifeLedger(userId).catch(() => emptyLifeLedger());
  return lifeContributionsAt(ledger, day).map((c) => ({ name: c.fieldName, level: c.level }));
}

export async function loadSheet(userId: string, now: Date = new Date()): Promise<SheetData> {
  const [progression, balance, tree, ghosts, compositions, life, goals, habits] = await Promise.all([
    loadProgression(userId),
    getMasteryBalance(userId),
    loadFieldTree(),
    getGhostLevelsFromDaysAgo(7),
    loadFieldCompositions().catch(() => [] as FieldComposition[]),
    // A failed life read shows the Fields-only sheet (as the shell does), never invented levels.
    loadLifeTracks(userId).catch((err: unknown) => {
      console.error("[you] life tracks unavailable", err);
      return notLaunchedView(todayKey(now));
    }),
    loadGoalLadder(userId).catch((err: unknown) => {
      console.error("[you] goal ladder unavailable", err);
      return null;
    }),
    readProgress(userId, { scope: ["habits"] }).catch(() => null),
  ]);

  const today = life.today;
  const fieldRows = tree.map((f) => ({ name: f.name, level: f.level }));
  const weekAgo: FieldLevelRow[] = ghosts.map((g) => ({ name: g.fieldName, level: g.level }));
  // Track levels in TRACKS order (Body, Duty, Craft, Care), as the shell sums them: the same floats.
  const raw = characterRaw(
    fieldRows.map((f) => f.level),
    TRACKS.map((t) => life.levels[t])
  );
  const level = Math.floor(raw);
  // Titles are earned once: counted from the Ultimates you own, not the ones equipped.
  const ultimates = progression.ownedCodes.filter((c) => getSkill(c)?.rank === "ULTIMATE").length;
  const title = computeTitle(level, progression.scores, ultimates);
  const transcendent = ultimates > 0;

  // The radar's sources: every Field, then the life rows at the levels the attributes read.
  const sources = [...compositions, ...lifeCompositions(life.contributions)];
  // The ghost needs the Fields' week-old snapshot: without it there is no honest "then". The
  // life rows then come from the same ledger (none for a day before launch: life fed nothing).
  const lifeWeekAgo = life.launched && weekAgo.length > 0 ? await lifeRowsOn(userId, addDays(today, -7)) : [];
  const ghost = compositions.length > 0 ? ghostScores(progression.scores, sources, [...weekAgo, ...lifeWeekAgo]) : null;
  const axes = ATTRIBUTES.map((a) => ({
    attribute: a,
    label: ATTRIBUTE_META[a].label,
    value: progression.scores[a],
    sides: sidesFor(a),
    hue: themeFor(a).color,
  }));

  const ctx = { scores: progression.scores, ownedCodes: progression.ownedCodes, balance, modifiers: progression.modifiers };
  const ready = readyEmblems(ctx);

  const mastered = tree.reduce((n, f) => n + f.domains.reduce((m, d) => m + d.ideas.filter((i) => i.level >= MASTERY_LEVEL).length, 0), 0);
  const establishedFrom = FIELD_TIERS.find((t) => t.tier === "ESTABLISHED")?.from ?? 3;
  const best = [...fieldRows].sort((a, b) => b.level - a.level)[0];

  return {
    level,
    progress: raw - level,
    material: crestMaterial(level, transcendent),
    title: title.rank,
    epithet: title.epithet,
    transcendent,
    dominant: dominantAttribute(progression.scores),
    distance: titleDistance(raw, transcendent),
    balance,
    mastered,
    owned: progression.ownedCodes.length,
    poolSize: SKILL_POOL.length,
    ready: ready[0]
      ? { code: ready[0].code, name: ready[0].name, rank: ready[0].rank, cost: ready[0].masteryCost, more: ready.length - 1 }
      : null,
    knowledge: knowledgeRow(fieldRows, weekAgo),
    radar: radarLayout(axes, ghost),
    hasGhost: ghost !== null,
    top: topAttributes(progression.scores, ghost, (a) => sourceLabel(mainSourceOf(a, sources))),
    tiers: {
      established: fieldRows.filter((f) => f.level >= establishedFrom).length,
      highest: best && best.level > 0 ? fieldTier(best.level).label : null,
      highestField: best && best.level > 0 ? best.name : null,
    },
    today,
    life,
    goals,
    rungs: habits?.habits ? countRungs(habits.habits.rows.map((r) => r.strength)) : null,
    lifeNote: lifeNoteDue(life.launched, lifeLaunchDay(), today),
  };
}
