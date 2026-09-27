import { CATALOG } from "./catalog";
import { MONSTERS } from "./bestiary";
import { log } from "./state";
import { stock, take } from "./loot";
import { stats } from "./stats";
import type { GameState, MonsterKind, Structure } from "./types";

/**
 * Monster parts set into the town's defences.
 *
 * Monsters of level 10 and more can leave four things beyond the common
 * spoils — a foot, a heart, a jewel, an eye — and a watchtower or a mage
 * spire past level 10 can have them set into it:
 *
 *   foot   of a kind: strikes at that kind come faster (up to +60%)
 *   heart  its passive reach: guards come out for fights further off (up to +6 tiles)
 *   jewel  its damage (up to +80%)
 *   eye    its active reach: sees and shoots further (up to +3 tiles)
 *
 * Every part does less than the one before: the bonus is cap × (1 − e^(−n/3)),
 * so the first three give most of what there is.
 */

export const AUG_LEVEL = 10;
export type AugPart = "foot" | "heart" | "jewel" | "eye";
export const AUG_CAP: Record<AugPart, number> = { foot: 0.6, heart: 6, jewel: 0.8, eye: 3 };
export const AUG_LABEL: Record<AugPart, string> = {
  foot: "attack speed against that kind", heart: "passive reach (tiles)", jewel: "damage", eye: "active reach (tiles)",
};

/** Diminishing returns: the bonus from n parts of a kind. */
export const dimReturn = (cap: number, n: number) => cap * (1 - Math.exp(-n / 3));

/** The item id of a monster kind's foot, as kept in the forge's store. */
export const footOf = (kind: MonsterKind) => `foot:${kind}`;
export const isFoot = (item: string) => item.startsWith("foot:");
export const footKind = (item: string) => item.slice(5) as MonsterKind;

/** A part's display name. */
export function partLabel(item: string): string | undefined {
  if (isFoot(item)) return `${MONSTERS[footKind(item)]?.name ?? "Monster"} foot`;
  if (item === "heart") return "Monster heart";
  if (item === "eye") return "Monster eye";
  return undefined;
}

export const canAugment = (st: Structure) => (st.type === "watchtower" || st.type === "wizardhut") && st.level >= AUG_LEVEL && !st.buildUntil;

/** What a structure's parts give it now. */
export function augBonus(st: Structure | undefined) {
  const a = st?.aug;
  return {
    jewel: dimReturn(AUG_CAP.jewel, a?.jewel ?? 0),
    heart: dimReturn(AUG_CAP.heart, a?.heart ?? 0),
    eye: dimReturn(AUG_CAP.eye, a?.eye ?? 0),
    foot: (kind: string) => dimReturn(AUG_CAP.foot, a?.feet?.[kind] ?? 0),
  };
}

/** Sets one part from the forge's store into a tower or spire. */
export function augment(s: GameState, id: number, item: string): string | null {
  const st = s.structures.find((x) => x.id === id);
  if (!st) return "No such building.";
  if (st.type !== "watchtower" && st.type !== "wizardhut") return "Only a watchtower or a mage spire takes monster parts.";
  if (st.level < AUG_LEVEL) return `It must stand at level ${AUG_LEVEL} first.`;
  if (stock(s, item) < 1) return "The forge's store has none of that.";
  const a = (st.aug ??= {});
  if (isFoot(item)) {
    a.feet ??= {};
    a.feet[footKind(item)] = (a.feet[footKind(item)] ?? 0) + 1;
  } else if (item === "heart" || item === "jewel" || item === "eye") a[item] = (a[item] ?? 0) + 1;
  else return "That part does nothing set into a tower.";
  take(s, item, 1);
  stats(s).augments += 1;
  log(s, `A ${(partLabel(item) ?? item).toLowerCase()} is set into the ${CATALOG[st.type].name.toLowerCase()}.`, "good");
  return null;
}

/** The mage spire whose parts the town's wizards fight with: the best-set one. */
export function wizardSpire(s: GameState): Structure | undefined {
  return s.structures.filter((x) => x.type === "wizardhut" && x.aug).sort((a, b) => augScore(b) - augScore(a))[0];
}
const augScore = (st: Structure) => (st.aug?.jewel ?? 0) + (st.aug?.eye ?? 0) + (st.aug?.heart ?? 0) + Object.values(st.aug?.feet ?? {}).reduce((x, n) => x + n, 0);
