import type { Attribute } from "@prisma/client";
import { log } from "./state";
import { rng } from "./world";
import { store } from "./loot";
import type { FieldDaily, TownInput } from "../rules";
import type { GameState, ResourceKey, ToolMat } from "./types";

/**
 * Knowledge into the town (design §12).
 *
 * Two couplings, both from the player's real study today:
 *
 * - **Ideas are buffs.** Every idea added to a Field today strengthens the
 *   town along that Field's two heaviest attributes: Physical puts strength
 *   in backs, Faith holds Hope up, Logic runs the refinery, and so on. The
 *   effect climbs with diminishing returns — 1 − e^(−stacks/3) of its cap —
 *   so the first few ideas in a Field matter most, and spreading study across
 *   Fields covers more of the town than piling it into one.
 *
 * - **A finished daily is a supply drop.** When a Field has been reviewed
 *   today and nothing in it is still due, the town receives one drop from it,
 *   once per calendar day. The Field's streak sets the rarity: common goods
 *   for a new streak, iron and salt from three days, silver and steel from a
 *   week, platinum and gold from a fortnight, diamond, mithril and jewels from
 *   a month. How much comes scales with how much was reviewed.
 *
 * And a neglected Field costs: cards left more than a day overdue weaken
 * that Field's buffs and feed the land's hunger (./nemesis); a long streak
 * that breaks drops the Field's banner, and the town's Hope with it.
 */

export interface AttrBuff { name: string; blurb: string; cap: number }

/** What each attribute does in town, and its cap at saturation. */
export const ATTR_BUFFS: Record<Attribute, AttrBuff> = {
  PHYSICAL: { name: "Strong backs", blurb: "heavy labour — logging, mining, digging, ice — works harder, and tires slower", cap: 0.3 },
  STUBBORNNESS: { name: "Stubborn timbers", blurb: "every post and footing carries more before it gives", cap: 0.3 },
  FAITH: { name: "Faith", blurb: "Hope climbs back each hour", cap: 0.3 },
  COMPASSION: { name: "Care", blurb: "the sick die less often, and grief cuts shallower", cap: 0.3 },
  LOGIC: { name: "Method", blurb: "the refinery and laboratory turn out more", cap: 0.3 },
  STATISTIC: { name: "Measured fields", blurb: "the fields yield more", cap: 0.3 },
  CRITICAL_THINKING: { name: "Foresight", blurb: "what the town does draws less of the land's notice", cap: 0.3 },
  REASON: { name: "Craftsmanship", blurb: "tools dull and wear more slowly", cap: 0.3 },
  ABSTRACT: { name: "Draught and flue", blurb: "hearths put more of their fire into the room", cap: 0.2 },
  CREATIVITY: { name: "Good kitchens", blurb: "kitchens cook more meals from the same stores", cap: 0.3 },
  MIND: { name: "Steady minds", blurb: "minds break less often", cap: 0.4 },
  SELF_RESPECT: { name: "Dignity", blurb: "discontent gathers more slowly", cap: 0.4 },
  REBUTTAL: { name: "Counterstroke", blurb: "defenders strike harder", cap: 0.25 },
};

export const ATTRS = Object.keys(ATTR_BUFFS) as Attribute[];

export interface Knowledge {
  day: string;
  /** Effect per attribute, as a fraction (0.2 = 20%); negative when a Field is neglected. */
  mods: Partial<Record<Attribute, number>>;
  /** Ideas behind each attribute's buff. */
  stacks: Partial<Record<Attribute, number>>;
  /** Field ids whose daily drop has been paid, by day (the last few days kept). */
  claimed: Record<string, string[]>;
  /** Field ids whose broken banner has already cost Hope, by day. */
  banners: Record<string, string[]>;
  /** The player's study today, as the adversary reads it. */
  reviewsToday: number;
  dueRemaining: number;
  overdue: number;
  ideasToday: number;
  completes: number;
  /** Last drops, for the readout. */
  drops: { field: string; tier: number; streak: number; got: string; at: number }[];
}

export const knowledgeOf = (s: GameState): Knowledge =>
  (s.knowledge ??= { day: "", mods: {}, stacks: {}, claimed: {}, banners: {}, reviewsToday: 0, dueRemaining: 0, overdue: 0, ideasToday: 0, completes: 0, drops: [] });

/** An attribute's effect now (0.15 = +15%). */
export const kmod = (s: GameState, a: Attribute) => s.knowledge?.mods[a] ?? 0;

// ── Rewards ───────────────────────────────────────────────

export const TIERS = [
  { name: "Common", from: 0 },
  { name: "Uncommon", from: 3 },
  { name: "Rare", from: 7 },
  { name: "Epic", from: 14 },
  { name: "Legendary", from: 30 },
] as const;
export const tierOf = (streak: number) => TIERS.reduce((t, x, i) => (streak >= x.from ? i : t), 0);

type Drop = { res?: ResourceKey; item?: string; tool?: ToolMat; qty: [number, number]; school?: "commerce" | "science" | "mind" };
/** What each tier can yield. A drop rolls from its own tier and, less often, the one below. */
const POOLS: Drop[][] = [
  [{ res: "wood", qty: [20, 40] }, { res: "stone", qty: [15, 30] }, { res: "meals", qty: [8, 16], school: "mind" }, { res: "potato", qty: [15, 30] }, { res: "coin", qty: [10, 25], school: "commerce" }],
  [{ res: "coal", qty: [8, 16] }, { res: "iron", qty: [5, 10], school: "science" }, { res: "salt", qty: [3, 6] }, { res: "torches", qty: [2, 5] }, { tool: "wrought", qty: [1, 2] }, { res: "tonic", qty: [1, 2], school: "mind" }],
  [{ res: "planks", qty: [5, 10] }, { res: "bricks", qty: [5, 10] }, { res: "ingots", qty: [2, 5], school: "science" }, { res: "silver", qty: [2, 5], school: "commerce" }, { res: "charcoal", qty: [3, 6] }, { tool: "steel", qty: [1, 2] }, { res: "fertiliser", qty: [3, 6] }],
  [{ res: "platinum", qty: [1, 2] }, { res: "gold", qty: [1, 1], school: "commerce" }, { res: "formula", qty: [1, 1], school: "science" }, { item: "jewel", qty: [1, 1] }, { res: "gunpowder", qty: [2, 4] }],
  [{ res: "diamond", qty: [1, 1] }, { res: "mithril", qty: [1, 1], school: "science" }, { item: "jewel", qty: [2, 3] }, { tool: "crucible", qty: [1, 2] }, { res: "gold", qty: [2, 3] }],
];

/**
 * The drop for one finished daily: rolls count with the Field's level and
 * with how many cards were reviewed; each roll is its tier's (or, one time
 * in four, the tier below's), leaning toward the Field's school. Seeded by
 * day and Field, so a reload cannot reroll it.
 */
export function rollDrop(f: FieldDaily, day: string): { res: Partial<Record<ResourceKey, number>>; items: Record<string, number>; tools: ToolMat[]; tier: number } {
  let seed = 0;
  for (const ch of `${day}|${f.id}`) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const r = rng(Math.abs(seed) + 7);
  const tier = tierOf(f.streak);
  const rolls = 1 + Math.min(4, Math.floor(f.level / 3)) + Math.min(3, Math.floor(Math.sqrt(f.reviewedToday)));
  const res: Partial<Record<ResourceKey, number>> = {};
  const items: Record<string, number> = {};
  const tools: ToolMat[] = [];
  for (let i = 0; i < rolls; i++) {
    const t = tier > 0 && r() < 0.25 ? tier - 1 : tier;
    const pool = POOLS[t];
    const fits = pool.filter((d) => !d.school || d.school === f.school);
    const lean = fits.length && r() < 0.6 ? fits : pool;
    const d = lean[Math.floor(r() * lean.length)];
    const n = d.qty[0] + Math.floor(r() * (d.qty[1] - d.qty[0] + 1));
    if (d.res) res[d.res] = (res[d.res] ?? 0) + n;
    if (d.item) items[d.item] = (items[d.item] ?? 0) + n;
    if (d.tool) for (let k = 0; k < n; k++) tools.push(d.tool);
  }
  return { res, items, tools, tier };
}

// ── The hour ──────────────────────────────────────────────

/**
 * On the hour: today's buffs from today's ideas, drops for finished dailies
 * not yet paid, banners for broken streaks, and the study picture the
 * adversary reads.
 */
export function knowledgeHourly(s: GameState, input: TownInput) {
  const k = knowledgeOf(s);
  const fields = input.fields ?? [];
  const day = input.day ?? "";
  k.day = day;
  // Buffs: ideas today stack on the Field's first attribute, half on its second.
  const stacks: Partial<Record<Attribute, number>> = {};
  const neglect: Partial<Record<Attribute, number>> = {};
  for (const f of fields) {
    const [a1, a2] = f.attrs;
    if (a1) stacks[a1] = (stacks[a1] ?? 0) + f.ideasToday;
    if (a2) stacks[a2] = (stacks[a2] ?? 0) + f.ideasToday / 2;
    if (a1 && f.overdue > 0) neglect[a1] = (neglect[a1] ?? 0) + f.overdue;
  }
  k.stacks = stacks;
  const mods: Partial<Record<Attribute, number>> = {};
  for (const a of ATTRS) {
    const up = ATTR_BUFFS[a].cap * (1 - Math.exp(-(stacks[a] ?? 0) / 3));
    // Overdue cards in a Field eat its own buff, and past that turn it against the town (to a tenth).
    const down = Math.min(ATTR_BUFFS[a].cap + 0.1, 0.02 * (neglect[a] ?? 0));
    const m = up - down;
    if (Math.abs(m) > 1e-4) mods[a] = m;
  }
  k.mods = mods;
  k.reviewsToday = input.reviewsToday;
  k.dueRemaining = input.dueRemaining;
  k.overdue = fields.reduce((a, f) => a + f.overdue, 0);
  k.ideasToday = input.newIdeasToday;
  k.completes = fields.filter((f) => f.complete).length;
  if (!day) return;

  // Drops for finished dailies.
  const paid = (k.claimed[day] ??= []);
  for (const f of fields) {
    if (!f.complete || paid.includes(f.id)) continue;
    paid.push(f.id);
    const d = rollDrop(f, day);
    for (const [key, n] of Object.entries(d.res)) s.res[key as ResourceKey] += n as number;
    for (const [item, n] of Object.entries(d.items)) store(s, item, n);
    if (d.tools.length) {
      (s.toolsPending ??= []).push(...d.tools);
      s.res.tools += d.tools.length;
    }
    const got = [
      ...Object.entries(d.res).map(([key, n]) => `${n} ${key}`),
      ...Object.entries(d.items).map(([item, n]) => `${n} ${item}`),
      ...(d.tools.length ? [`${d.tools.length} ${d.tools[0]} tool${d.tools.length > 1 ? "s" : ""}`] : []),
    ].join(", ");
    k.drops.unshift({ field: f.name, tier: d.tier, streak: f.streak, got, at: s.time });
    if (k.drops.length > 12) k.drops.length = 12;
    log(s, `${f.name}: today's reviews done (${f.streak}-day streak, ${TIERS[d.tier].name.toLowerCase()}). A supply cart comes in: ${got}.`, "good");
  }
  // Banners: a streak of a week or more that has broken costs Hope, once.
  const fallen = (k.banners[day] ??= []);
  for (const f of fields) {
    if (f.bestStreak < 7 || f.streak > 0 || fallen.includes(f.id)) continue;
    fallen.push(f.id);
    s.hopeEvents = (s.hopeEvents ?? 0) - 4;
    log(s, `The banner of ${f.name} comes down: its study has lapsed. The town notices.`, "bad");
  }
  // Keep a few days of history.
  for (const key of Object.keys(k.claimed)) if (key < day && Object.keys(k.claimed).length > 4) delete k.claimed[key];
  for (const key of Object.keys(k.banners)) if (key < day && Object.keys(k.banners).length > 4) delete k.banners[key];
}
