import type { Cost } from "./catalog";
import { elementOfAttribute, type Element } from "./elements";
import { itemDef } from "./items";
import { fullSet, gearStats, stock, store, take } from "./loot";
import { log } from "./state";
import { stats } from "./stats";
import { canAfford, costText, pay } from "./world";
import type { GameState, Structure, Villager } from "./types";

/**
 * Champions: the last rung of the two hero ladders.
 *
 *   A Master of Mythic Arts is a grand wizard who wears a full set of sound
 *   gear and reads a Book of Enlightenment through. The book is written at the
 *   mythic laboratory from one of your real emblems — one book to an emblem.
 *
 *   The King is the final form of an emblem knight: level 60 or more, a real
 *   emblem bound, and the Crown of the Realm on his head. There is one crown,
 *   and one King. His blows are as strong as your emblems: every emblem you
 *   wear, and every rung of their depth, adds to them.
 *
 * Only a champion's blows land in full on a mythic thing (./combat) — the
 * elder dragon above all. And a champion cannot be killed: struck down, they
 * turn to stone, and the stone stands in the town hall until it is restored.
 * Offerings laid before a statue are worked in slowly, a hundredth an hour;
 * when the stone is whole again, the champion steps out of it.
 */

export const MASTER_FROM = 15;
export const KING_FROM = 60;
export const CROWN = "crown-of-the-realm";
export const isBook = (id?: string | null) => !!id && id.startsWith("book:");
export const bookFor = (code: string) => `book:${code}`;

type Result = string | null;
type Check = { label: string; ok: boolean };

/** The King's might: every real emblem you wear adds a tenth, and every rung of depth across them a twelfth-and-a-bit. */
export function kingMight(s: GameState): number {
  const em = s.realm?.emblems ?? [];
  return 1 + em.length * 0.1 + em.reduce((a, e) => a + e.depth, 0) * 0.08;
}

/** A champion's element: their weapon's, else their bound emblem's. */
export function championElement(v: Villager): Element | null {
  return gearStats(v).element ?? elementOfAttribute(v.emblem?.attribute ?? null);
}

export const championTitle = (v: Villager) => (v.champion === "master" ? "Master of Mythic Arts" : v.champion === "king" ? "King" : "");

export function masterChecks(v: Villager): Check[] {
  return [
    { label: "A grand wizard (level 15 or more)", ok: v.role === "wizard" && v.rank >= MASTER_FROM },
    { label: "Every slot filled with sound gear — weapon, armour, helm, boots, ring, amulet, relic", ok: fullSet(v) },
    { label: "A Book of Enlightenment in the relic slot", ok: isBook(v.gear?.relic) },
  ];
}

export function ascendMaster(s: GameState, villagerId: number): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v) return "No such villager.";
  if (v.champion) return `${v.name} is already a champion.`;
  const miss = masterChecks(v).find((c) => !c.ok);
  if (miss) return `Not yet: ${miss.label.toLowerCase()}.`;
  v.champion = "master";
  log(s, `${v.name} reads the Book of Enlightenment through, and rises a Master of Mythic Arts.`, "good");
  return null;
}

const kingNow = (s: GameState) => [...s.villagers, ...(s.statues ?? [])].find((x) => x.champion === "king");

export function kingChecks(s: GameState, v: Villager): Check[] {
  const king = kingNow(s);
  return [
    { label: `An emblem knight of level ${KING_FROM} or more`, ok: v.role === "knight" && v.rank >= KING_FROM },
    { label: "A real emblem bound", ok: !!v.emblem },
    { label: "The Crown of the Realm on his head", ok: v.gear?.helm === CROWN },
    { label: "No King in the land already", ok: !king || king === v },
  ];
}

export function crownKing(s: GameState, villagerId: number): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v) return "No such villager.";
  if (v.champion) return `${v.name} is already a champion.`;
  const miss = kingChecks(s, v).find((c) => !c.ok);
  if (miss) return `Not yet: ${miss.label.toLowerCase()}.`;
  v.champion = "king";
  log(s, `${v.name} is crowned King. His blows are as strong as your emblems (×${kingMight(s).toFixed(2)} now).`, "good");
  return null;
}

// ── The mythic laboratory's great works ───────────────────

export const BOOK_HOURS = 24;
export const CROWN_HOURS = 48;
export const BOOK_COST: Cost = { starchart: 3, quicksilver: 5, gold: 5, diamond: 2 };
export const BOOK_ITEMS: Record<string, number> = { ectoplasm: 10, jewel: 2 };
export const CROWN_COST: Cost = { gold: 20, platinum: 5, diamond: 5, starchart: 5 };
export const CROWN_ITEMS: Record<string, number> = { jewel: 5, "trophy-dragon": 1 };

export const mythicLab = (s: GameState): Structure | undefined => s.structures.find((st) => st.type === "mythiclab" && !st.buildUntil);

/** The greater essence a book written from this emblem needs: of its element. */
export const bookEssence = (emblem: { attributes: string[] }) =>
  `essence-${elementOfAttribute((emblem.attributes[0] ?? null) as Parameters<typeof elementOfAttribute>[0]) ?? "light"}-greater`;

function itemsCheck(s: GameState, items: Record<string, number>): string | null {
  for (const [id, n] of Object.entries(items)) if (stock(s, id) < n) return `Needs ${n} ${itemDef(id)?.name.toLowerCase() ?? id} (have ${stock(s, id)}).`;
  return null;
}

/** Whether a book has been written from this emblem already: it exists once. */
export const bookWritten = (s: GameState, code: string) => (s.singletons ?? []).includes(bookFor(code));

export function bookCheck(s: GameState, emblem: { code: string; attributes: string[] }): string | null {
  const lab = mythicLab(s);
  if (!lab) return "Needs a mythic laboratory.";
  if (lab.craft) return "The laboratory is at another great work.";
  if (bookWritten(s, emblem.code)) return "A book has been written from that emblem already.";
  if (!canAfford(s.res, BOOK_COST)) return `Needs ${costText(BOOK_COST)}.`;
  return itemsCheck(s, { ...BOOK_ITEMS, [bookEssence(emblem)]: 1 });
}

/** Starts writing a Book of Enlightenment from one of the player's real emblems. */
export function writeBook(s: GameState, emblem: { code: string; name: string; attributes: string[] }): Result {
  const bad = bookCheck(s, emblem);
  if (bad) return bad;
  const lab = mythicLab(s)!;
  pay(s.res, BOOK_COST);
  for (const [id, n] of Object.entries({ ...BOOK_ITEMS, [bookEssence(emblem)]: 1 })) take(s, id, n);
  (s.singletons ??= []).push(bookFor(emblem.code));
  lab.craft = { item: bookFor(emblem.code), until: s.time + BOOK_HOURS * 60 };
  log(s, `The mythic laboratory begins a Book of Enlightenment, written from your emblem ${emblem.name}.`, "info");
  return null;
}

export const crownMade = (s: GameState) => (s.singletons ?? []).includes(CROWN);

export function crownCheck(s: GameState): string | null {
  const lab = mythicLab(s);
  if (!lab) return "Needs a mythic laboratory.";
  if (lab.craft) return "The laboratory is at another great work.";
  if (crownMade(s)) return "There is one crown, and it has been made.";
  if (!s.villagers.some((v) => v.role === "knight" && v.rank >= KING_FROM)) return `A crown is made for someone: an emblem knight of level ${KING_FROM} must be in town.`;
  if (!canAfford(s.res, CROWN_COST)) return `Needs ${costText(CROWN_COST)}.`;
  return itemsCheck(s, CROWN_ITEMS);
}

export function forgeCrown(s: GameState): Result {
  const bad = crownCheck(s);
  if (bad) return bad;
  const lab = mythicLab(s)!;
  pay(s.res, CROWN_COST);
  for (const [id, n] of Object.entries(CROWN_ITEMS)) take(s, id, n);
  (s.singletons ??= []).push(CROWN);
  lab.craft = { item: CROWN, until: s.time + CROWN_HOURS * 60 };
  log(s, "The mythic laboratory begins the Crown of the Realm.", "info");
  return null;
}

/** A great work finished: into the forge's store (it waits in the laboratory while there is no room). */
export function finishWorks(s: GameState) {
  const lab = mythicLab(s);
  if (!lab?.craft || lab.craft.until > s.time) return;
  if (store(s, lab.craft.item, 1) > 0) return;
  log(s, `The mythic laboratory finishes ${isBook(lab.craft.item) ? "a Book of Enlightenment" : "the Crown of the Realm"}. It waits in the forge's store.`, "good");
  lab.craft = null;
}

// ── Statues ───────────────────────────────────────────────

/** What one offering at a statue costs, and how much of the stone it will restore. */
export const OFFERING: Cost = { stone: 40, silver: 4, gold: 2 };
export const OFFERING_SHARE = 0.05;
/** The stone is worked back to life at most this much an hour, while there are offerings to work in. */
export const RESTORE_PER_HOUR = 0.01;

export const statuesOf = (s: GameState) => (s.statues ??= []);

/**
 * A champion struck down turns to stone rather than die: out of the fight,
 * out of work and off guard, standing in the town hall until restored.
 */
export function petrify(s: GameState, v: Villager, how = "is struck down") {
  if (!s.villagers.includes(v)) return;
  s.villagers = s.villagers.filter((x) => x !== v);
  for (const st of s.structures) st.workers = st.workers.filter((id) => id !== v.id);
  v.guard = null;
  v.work = null;
  v.scout = null;
  v.statue = { since: s.time, restore: 0, fuel: 0 };
  statuesOf(s).push(v);
  log(s, `${v.name}, ${championTitle(v)}, ${how} — and turns to stone. The statue stands in the town hall; offerings laid before it will bring them back.`, "bad");
}

export function offerToStatue(s: GameState, villagerId: number): Result {
  const v = statuesOf(s).find((x) => x.id === villagerId);
  if (!v?.statue) return "No such statue.";
  if (!s.structures.some((st) => st.type === "townhall")) return "The statues stand in the town hall.";
  if (v.statue.restore + v.statue.fuel >= 1) return "Enough has been laid before it; now it only needs time.";
  if (!canAfford(s.res, OFFERING)) return `An offering is ${costText(OFFERING)}.`;
  pay(s.res, OFFERING);
  v.statue.fuel = Math.min(1 - v.statue.restore, v.statue.fuel + OFFERING_SHARE);
  return null;
}

/** The hour: offerings are worked into the stone, and a restored champion steps out of it. */
export function statuesHourly(s: GameState) {
  for (const v of [...statuesOf(s)]) {
    const st = v.statue;
    if (!st || st.fuel <= 0) continue;
    const d = Math.min(st.fuel, RESTORE_PER_HOUR);
    st.restore = Math.min(1, st.restore + d);
    st.fuel -= d;
    if (st.restore >= 1 - 1e-9) {
      s.statues = statuesOf(s).filter((x) => x !== v);
      v.statue = null;
      v.health = 100;
      if (v.body) {
        v.body.bleed = 0;
        v.body.blood = 0;
        v.body.Tc = 37;
      }
      s.villagers.push(v);
      stats(s).restored = (stats(s).restored ?? 0) + 1;
      log(s, `The stone falls away: ${v.name}, ${championTitle(v)}, steps down from the plinth.`, "good");
    }
  }
}
