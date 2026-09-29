import type { Attribute } from "@prisma/client";
import { log } from "./state";
import { store } from "./loot";
import { passesOf, tithesHourly, type Focus, type Requisition, type Tithe } from "./tithes";
import { lastMomentId, pushMoment, type Moment } from "./moments";
import type { FieldDaily, TownInput } from "../rules";
import type { GameState, ResourceKey, ToolMat } from "./types";

/**
 * Knowledge into the town (design §12).
 *
 * Three couplings, all from the player's real study today:
 *
 * - **Ideas are buffs.** Every idea added to a Field today strengthens the
 *   town along that Field's two heaviest attributes: Physical puts strength
 *   in backs, Faith holds Hope up, Logic runs the refinery, and so on. The
 *   effect climbs with diminishing returns — 1 − e^(−stacks/3) of its cap —
 *   so the first few ideas in a Field matter most, and spreading study across
 *   Fields covers more of the town than piling it into one. An idea counts
 *   by how new it was (its payout over its base): a near-duplicate in a
 *   crowded topic is worth a fraction of one that opened new ground.
 *
 * - **Every passed review is a tithe** of goods, finer the deeper the card,
 *   turned by the quartermaster into what the town lacks — see ./tithes.
 *
 * - **A finished daily is a supply drop.** When a Field has been reviewed
 *   today and nothing in it is still due, the town receives one drop from it,
 *   once per calendar day. The Field's streak sets the rarity: common goods
 *   for a new streak, iron and salt from three days, silver and steel from a
 *   week, platinum and gold from a fortnight, diamond, mithril and jewels from
 *   a month. How much comes scales with how many were answered right.
 *   Nothing is rolled: the day and the Field fix what the cart holds, so its
 *   manifest is shown before a card is turned (./moments shows it arriving).
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
  /** Field ids whose broken banner cost Hope, by day: how saves before `broke` kept it. No longer added to; read so today's charge is not made twice. */
  banners: Record<string, string[]>;
  /** Broken banners that have cost Hope, keyed `<fieldId>:<bestStreak>`, with the day they came down (the last BROKE_KEEP). */
  broke?: Record<string, string>;
  /** The player's study today, as the adversary reads it. */
  reviewsToday: number;
  dueRemaining: number;
  overdue: number;
  ideasToday: number;
  completes: number;
  /** Last drops, for the readout. */
  drops: { field: string; tier: number; streak: number; got: string; at: number }[];
  /** Reviews passed today, all Fields. */
  passedToday?: number;
  /** What passed reviews become (./tithes); auto sends what the town lacks. */
  focus?: Focus;
  /** Passes, masteries and new Domains already paid for, by day and Field. */
  tithed?: Record<string, Record<string, { passed: number[]; mastered: number; domains: number }>>;
  /** Last tithes, for the readout. */
  tithes?: Tithe[];
  /** Today's requisitions, and the days they have been posted on. */
  reqs?: Requisition[];
  posted?: string[];
  /** Heirlooms from mastered cards waiting for room in an armoury. */
  owed?: string[];
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
/** What each tier can yield. A cart takes from its own tier and, one load in four, the one below. */
export const POOLS: readonly (readonly Drop[])[] = [
  [{ res: "wood", qty: [20, 40] }, { res: "stone", qty: [15, 30] }, { res: "meals", qty: [8, 16], school: "mind" }, { res: "potato", qty: [15, 30] }, { res: "coin", qty: [10, 25], school: "commerce" }],
  [{ res: "coal", qty: [8, 16] }, { res: "iron", qty: [5, 10], school: "science" }, { res: "salt", qty: [3, 6] }, { res: "torches", qty: [2, 5] }, { tool: "wrought", qty: [1, 2] }, { res: "tonic", qty: [1, 2], school: "mind" }],
  [{ res: "planks", qty: [5, 10] }, { res: "bricks", qty: [5, 10] }, { res: "ingots", qty: [2, 5], school: "science" }, { res: "silver", qty: [2, 5], school: "commerce" }, { res: "charcoal", qty: [3, 6] }, { tool: "steel", qty: [1, 2] }, { res: "fertiliser", qty: [3, 6] }],
  [{ res: "platinum", qty: [1, 2] }, { res: "gold", qty: [1, 1], school: "commerce" }, { res: "formula", qty: [1, 1], school: "science" }, { item: "jewel", qty: [1, 1] }, { res: "gunpowder", qty: [2, 4] }],
  [{ res: "diamond", qty: [1, 1] }, { res: "mithril", qty: [1, 1], school: "science" }, { item: "jewel", qty: [2, 3] }, { tool: "crucible", qty: [1, 2] }, { res: "gold", qty: [2, 3] }],
];

/** Days since 1970-01-01 for a study day ("2026-03-09"); 0 without one. */
const dayIndex = (day: string) => {
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(t) ? Math.round(t / 864e5) : 0;
};
/** A Field's fixed place in the rotation, from its id. */
const fieldTurn = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h >>> 0;
};

export interface Cart { res: Partial<Record<ResourceKey, number>>; items: Record<string, number>; tools: ToolMat[]; tier: number }

/**
 * The cart for one finished daily. Nothing is rolled: the Field's level and
 * today's right answers set how many loads it carries; each load comes from
 * the streak's tier (every fourth from the tier below), three in five from
 * the goods that suit the Field's school, and which good it is turns with
 * the day and the Field, at the middle of its range. So a day's cart can be
 * stated before the first card is turned, a reload cannot change it, and
 * over the days each good comes round as often, and as many, as a fair roll
 * would bring it.
 */
export function rollDrop(f: FieldDaily, day: string): Cart {
  const tier = tierOf(f.streak);
  // Right answers from the ledger; on an input from before they were counted, the cards touched.
  const passes = f.passed ? passesOf(f) : f.reviewedToday;
  const rolls = 1 + Math.min(4, Math.floor(f.level / 3)) + Math.min(3, Math.floor(Math.sqrt(passes)));
  const turn = dayIndex(day) + fieldTurn(f.id);
  const res: Partial<Record<ResourceKey, number>> = {};
  const items: Record<string, number> = {};
  const tools: ToolMat[] = [];
  for (let i = 0; i < rolls; i++) {
    const pool = POOLS[tier > 0 && i % 4 === 3 ? tier - 1 : tier];
    const fits = pool.filter((d) => !d.school || d.school === f.school);
    const list = i % 5 < 3 && fits.length ? fits : pool;
    const d = list[(i + turn) % list.length];
    // The middle of the good's range. A middle between two counts (1.5 tools) is the lower one and the
    // upper in turn, each time the good comes round, so over the days it pays exactly what a fair roll would.
    const mid = (d.qty[0] + d.qty[1]) / 2;
    const n = Number.isInteger(mid) ? mid : Math.floor(mid) + (Math.floor((i + turn) / list.length) % 2);
    if (d.res) res[d.res] = (res[d.res] ?? 0) + n;
    if (d.item) items[d.item] = (items[d.item] ?? 0) + n;
    if (d.tool) for (let k = 0; k < n; k++) tools.push(d.tool);
  }
  return { res, items, tools, tier };
}

/** A cart as goods by key, tools as `tool:<material>`: how the pulse states it and a moment records it. */
export function cartGoods(d: Cart): Record<string, number> {
  const goods: Record<string, number> = {};
  for (const [key, n] of Object.entries(d.res)) if (n) goods[key] = (goods[key] ?? 0) + n;
  for (const [key, n] of Object.entries(d.items)) if (n) goods[key] = (goods[key] ?? 0) + n;
  for (const mat of d.tools) goods[`tool:${mat}`] = (goods[`tool:${mat}`] ?? 0) + 1;
  return goods;
}

/** "9-day streak"; a Field with none yet is on a new one. */
const streakText = (n: number) => (n > 0 ? `${n}-day streak` : "new streak");

// ── The hour ──────────────────────────────────────────────

/** Broken banners remembered: enough for every Field a player keeps, several breaks over. */
const BROKE_KEEP = 60;

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
    // Weighed by novelty where the server supplies it; a bare count otherwise.
    const ideas = f.novelty ?? f.ideasToday;
    if (a1) stacks[a1] = (stacks[a1] ?? 0) + ideas;
    if (a2) stacks[a2] = (stacks[a2] ?? 0) + ideas / 2;
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
  // The land reads effort — any review, passed or not; the stores are paid for passes.
  k.reviewsToday = input.reviewsAttempted ?? input.reviewsToday;
  k.passedToday = input.reviewsToday;
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
    pushMoment(s, { kind: "cart", title: `${f.name} · ${streakText(f.streak)} · ${TIERS[d.tier].name} cart`, lines: [], tier: d.tier, goods: cartGoods(d) });
  }
  // Banners: a streak of a week or more that has broken costs Hope, once per break. Keyed by the
  // streak it was, not the day: a streak that stays at 0 for a week is one fall, not seven.
  const broke = (k.broke ??= {});
  for (const f of fields) {
    if (f.bestStreak < 7 || f.streak > 0) continue;
    const key = `${f.id}:${f.bestStreak}`;
    if (key in broke) continue;
    broke[key] = day;
    // A save from before `broke` charged by the day: a fall it charged today is this one.
    if (k.banners?.[day]?.includes(f.id)) continue;
    s.hopeEvents = (s.hopeEvents ?? 0) - 4;
    log(s, `The banner of ${f.name} comes down: its study has lapsed. The town notices.`, "bad");
  }
  const keys = Object.keys(broke);
  for (let i = 0; i < keys.length - BROKE_KEEP; i++) delete broke[keys[i]];
  // Tithes for today's passes, heirlooms, charts, and the quartermaster's requisitions.
  tithesHourly(s, k, input);
  // Keep a few days of history.
  for (const key of Object.keys(k.claimed)) if (key < day && Object.keys(k.claimed).length > 4) delete k.claimed[key];
  for (const key of Object.keys(k.banners)) if (key < day) delete k.banners[key];
}

/**
 * Pays what today's study has earned now, not on the next game hour: the
 * town calls it whenever it reads the player's study afresh, paused or not,
 * so a cart comes in the moment the town learns of it. Everything it pays is
 * keyed by day and Field (claimed, tithed, posted), so the hour that follows
 * pays nothing twice. Returns the moments it pushed.
 */
export function settleStudy(s: GameState, input: TownInput): Moment[] {
  const before = lastMomentId(s);
  knowledgeHourly(s, input);
  return (s.moments ?? []).filter((m) => m.id > before);
}

/**
 * A town refounded mid-day takes over what today's study has already paid
 * the old one: the carts claimed, the passes, masteries and Domains tithed,
 * the requisitions posted and filled, and the banners that have cost Hope.
 * Without it every refound paid the same reviews again — a second cart, a
 * second tithe, a second requisition — for nothing studied. Called on the
 * fresh state before its first save; `day` is today's study day.
 */
export function carryDay(fresh: GameState, old: GameState, day: string) {
  const was = old.knowledge;
  if (!was || !day) return;
  const k = knowledgeOf(fresh);
  if (was.claimed[day]) k.claimed[day] = [...was.claimed[day]];
  const tithed = was.tithed?.[day];
  if (tithed) {
    const copy: NonNullable<Knowledge["tithed"]>[string] = {};
    for (const [id, t] of Object.entries(tithed)) copy[id] = { passed: [...t.passed], mastered: t.mastered, domains: t.domains };
    (k.tithed ??= {})[day] = copy;
  }
  // Posted marks the day as asked for, so the new town posts nothing fresh; the requisitions keep their count and whether they are paid.
  if (was.posted?.includes(day)) k.posted = [...(k.posted ?? []).filter((d) => d !== day), day];
  const reqs = (was.reqs ?? []).filter((r) => r.day === day);
  if (reqs.length) k.reqs = [...(k.reqs ?? []).filter((r) => r.day !== day), ...reqs.map((r) => ({ ...r, reward: { ...r.reward } }))];
  if (was.banners?.[day]) k.banners[day] = [...was.banners[day]];
  if (was.broke) k.broke = { ...was.broke, ...k.broke };
}
