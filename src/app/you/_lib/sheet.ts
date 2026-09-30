/**
 * The character sheet's reads (server only). Everything is real or null:
 * no placeholder figures (honest numbers). Composes cached reads; the one
 * query of its own (Field compositions, for the radar's sources and ghost)
 * is cached under the same tags as the attribute scores it explains.
 */
import type { Attribute } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/cache";
import { ATTRIBUTES, ATTRIBUTE_META, emptyComposition, type Composition } from "@/lib/attributes";
import { effectiveFieldComposition } from "@/lib/attribute-inference";
import { FIELD_TIERS, fieldTier } from "@/lib/field-tier";
import { getMasteryBalance } from "@/lib/mastery";
import { loadFieldTree } from "@/lib/queries";
import { loadProgression } from "@/lib/skill-effects";
import { SKILL_POOL, getSkill } from "@/lib/skill-pool";
import { getGhostLevelsFromDaysAgo } from "@/lib/snapshot";
import { computeTitle, dominantAttribute } from "@/lib/titles";
import { MASTERY_LEVEL } from "@/lib/xp";
import { crestMaterial, type Material } from "@/lib/materials";
import { themeFor } from "@/lib/attribute-themes";
import { sidesFor } from "@/lib/skill-form";
import { readyEmblems } from "@/components/skills/ladder";
import {
  characterRaw,
  ghostScores,
  knowledgeRow,
  mainSource,
  radarLayout,
  titleDistance,
  topAttributes,
  type FieldComposition,
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
}

export async function loadSheet(userId: string): Promise<SheetData> {
  const [progression, balance, tree, ghosts, compositions] = await Promise.all([
    loadProgression(userId),
    getMasteryBalance(userId),
    loadFieldTree(),
    getGhostLevelsFromDaysAgo(7),
    loadFieldCompositions().catch(() => [] as FieldComposition[]),
  ]);

  const fieldRows = tree.map((f) => ({ name: f.name, level: f.level }));
  const weekAgo = ghosts.map((g) => ({ name: g.fieldName, level: g.level }));
  const raw = characterRaw(fieldRows.map((f) => f.level));
  const level = Math.floor(raw);
  // Titles are earned once: counted from the Ultimates you own, not the ones equipped.
  const ultimates = progression.ownedCodes.filter((c) => getSkill(c)?.rank === "ULTIMATE").length;
  const title = computeTitle(level, progression.scores, ultimates);
  const transcendent = ultimates > 0;

  const ghost = ghostScores(progression.scores, compositions, weekAgo);
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
    top: topAttributes(progression.scores, ghost, (a) => mainSource(a, compositions)),
    tiers: {
      established: fieldRows.filter((f) => f.level >= establishedFrom).length,
      highest: best && best.level > 0 ? fieldTier(best.level).label : null,
      highestField: best && best.level > 0 ? best.name : null,
    },
  };
}
