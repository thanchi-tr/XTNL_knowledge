/**
 * The emblem-unlock Ascension, as data (pure: the server action builds it,
 * scripts/you-check.ts asserts it).
 *
 *   buildUnlockEvent(input)       the T3 CelebrationEvent for one unlock: what it is, what it
 *                                 grants, what it cost (balance before → after) and why it was allowed
 *   firstOfDepth(skill, owned)    true for the FIRST emblem the player owns at depth 13, 14 or 15:
 *                                 only those play the Cataclysm backdrop (still tableau otherwise)
 *   mergeUnlockEvents(local, fromServer)
 *                                 L3's detectors may also emit the unlock (persisted, with a
 *                                 server id). The server row wins identity (id, dedupeKey,
 *                                 shownAt), these facts win content; nothing plays twice.
 *
 * Deterministic and exact: every number is the ledger's own (cost, balance),
 * nothing is rolled, and honestyProblem(event) is null by construction.
 */
import type { CelebrationEvent, CelebrationFacts, WhatMoved } from "@/lib/celebration-types";
import { KIND_TIER } from "@/lib/celebration-types";
import { ATTRIBUTE_META } from "@/lib/attributes";
import { attributeSlug } from "@/lib/attribute-themes";
import { RANK_MATERIAL } from "@/lib/materials";
import { depthOf } from "@/lib/skill-form";
import { getSkill, type Skill } from "@/lib/skill-pool";
import { RANK_META } from "@/lib/skill-visuals";
import type { Requirement } from "./ladder";

export interface UnlockInput {
  skill: Skill;
  balanceBefore: number;
  balanceAfter: number;
  /** Emblems owned before this unlock, and the pool size (749). */
  ownedBefore: number;
  poolSize: number;
  /** requirementsOf(skill) at the moment of unlock (all met). */
  requirements: readonly Requirement[];
  /** opensAfter(skill): what this unlock makes reachable next. */
  opens: readonly Skill[];
}

const whole = (v: number) => Math.round(v).toLocaleString("en-GB");
const oneDp = (v: number) => (Number.isInteger(v) ? whole(v) : v.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

export function unlockDedupeKey(code: string): string {
  return `unlock:${code}`;
}

/** The cause line: the met attribute gates, then the lineage. */
export function unlockCause(skill: Skill, requirements: readonly Requirement[]): string {
  const gates = requirements.filter((r) => r.kind === "attribute" || r.kind === "breadth");
  const parts = gates.map((r) => `${r.subject} reached ${oneDp(r.have)}`);
  const lineage = skill.prerequisites.length > 0 ? "every earlier emblem on its lineage is yours" : null;
  const all = [...parts, ...(lineage ? [lineage] : [])];
  if (all.length === 0) return `Unlocked with ${whole(skill.masteryCost)} MP.`;
  const joined = all.length === 1 ? all[0] : `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]}`;
  return `Unlocked because ${joined}.`;
}

export function buildUnlockEvent(i: UnlockInput): CelebrationEvent {
  const { skill } = i;
  const depth = depthOf(skill);
  const rankLabel = RANK_META[skill.rank].label;
  const paths = skill.attributes.map((a) => ATTRIBUTE_META[a].label).join(" and ");
  const grants = [`${skill.effectText}, while it is in your loadout`];
  if (i.opens.length > 0) {
    const names = i.opens.slice(0, 2).map((s) => s.name);
    const more = i.opens.length - names.length;
    grants.push(`Opens ${names.join(" and ")}${more > 0 ? ` and ${more} more` : ""} on this path`);
  }
  const facts: CelebrationFacts = {
    eyebrow: "Emblem unlocked",
    kicker: `${rankLabel} emblem unlocked`,
    title: skill.name,
    epithet: `${paths} path · depth ${depth}`,
    lore: skill.flavour,
    grants,
    cost: `Spent ${whole(skill.masteryCost)} MP · ${whole(i.balanceAfter)} left`,
    cause: unlockCause(skill, i.requirements),
    amounts: [{ kind: "mp", value: -skill.masteryCost, label: "MP spent" }],
    material: RANK_MATERIAL[skill.rank],
    art: { type: "emblem", code: skill.code, rank: skill.rank, depth },
    href: `/skills/${attributeSlug(skill.attributes[0])}?emblem=${encodeURIComponent(skill.code)}`,
    say: `${rankLabel} emblem unlocked: ${skill.name}. Spent ${whole(skill.masteryCost)} MP, ${whole(i.balanceAfter)} left.`,
  };
  const what: WhatMoved[] = [
    { label: "Mastery points", value: `${whole(i.balanceBefore)} → ${whole(i.balanceAfter)}` },
    { label: "Emblems owned", value: `${i.ownedBefore} → ${i.ownedBefore + 1} of ${i.poolSize}` },
  ];
  const key = unlockDedupeKey(skill.code);
  return { id: key, kind: "emblem-unlock", tier: KIND_TIER["emblem-unlock"], facts, what, dedupeKey: key };
}

/** Only the first emblem owned at depth 13, 14 or 15 plays the Cataclysm. */
export function firstOfDepth(skill: Skill, ownedCodesBefore: readonly string[]): boolean {
  const depth = depthOf(skill);
  if (depth < 13) return false;
  return !ownedCodesBefore.some((code) => {
    const s = getSkill(code);
    return s !== undefined && depthOf(s) === depth;
  });
}

/**
 * One unlock plays once. L3's detectors emit the same unlock (persisted, with
 * a server id): an "emblem-unlock" keyed `unlock:<code>`, or, for the first
 * Ultimate, a "first-ultimate" that folds the title change in. Either is the
 * twin when it names the same emblem. The server row keeps its identity
 * (id, kind, dedupeKey, shownAt); these facts win the content (lore, cost
 * with the balance, cause), and the twin's extra grants and What-moved rows
 * are kept. Every other detected event passes through after it.
 */
export function mergeUnlockEvents(local: CelebrationEvent, fromServer: readonly CelebrationEvent[]): CelebrationEvent[] {
  const code = local.facts.art?.type === "emblem" ? local.facts.art.code : null;
  const twin = fromServer.find(
    (e) =>
      e.tier === 3 &&
      ((e.kind === "emblem-unlock" && e.dedupeKey === local.dedupeKey) ||
        (code !== null && e.facts.art?.type === "emblem" && e.facts.art.code === code))
  );
  if (!twin) return [local, ...fromServer];
  const mine = local.facts.grants ?? [];
  const grants = [...mine, ...(twin.facts.grants ?? []).filter((g) => !mine.includes(g))];
  const what = [...local.what, ...twin.what.filter((w) => !local.what.some((l) => l.label === w.label))];
  const merged: CelebrationEvent = {
    ...local,
    id: twin.id,
    kind: twin.kind,
    tier: twin.tier,
    dedupeKey: twin.dedupeKey,
    shownAt: twin.shownAt ?? null,
    createdAt: twin.createdAt,
    facts: {
      ...twin.facts,
      ...local.facts,
      kicker: twin.kind === "first-ultimate" ? (twin.facts.kicker ?? local.facts.kicker) : local.facts.kicker,
      grants,
    },
    what,
  };
  return [merged, ...fromServer.filter((e) => e !== twin)];
}
