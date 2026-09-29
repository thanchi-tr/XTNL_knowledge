import { log } from "./state";
import { rng } from "./world";
import { store } from "./loot";
import { itemDef, poolOf } from "./items";
import { pushMoment } from "./moments";
import { RAW_FOODS, type GameState, type ResourceKey } from "./types";
import type { FieldDaily, School, TownInput } from "../rules";
import type { Knowledge } from "./knowledge";

/**
 * Reviews into stores (design §12.4).
 *
 * The daily supply cart pays for *finishing* a Field; until now nothing paid
 * for the reviews themselves, so the town could not tell twenty passed cards
 * from none until the last one was done, and could not tell a level-11 card
 * recalled after months from a card first seen yesterday. Now it can:
 *
 * - **Every passed review is a tithe.** It sends goods to town, and the
 *   deeper the card (the level it now sits at), the finer the goods: raw
 *   wood and stone for a new card, planks and iron for a settled one, ingots
 *   and silver for a deep one, gold and platinum for one nearly mastered.
 *   A failed review sends nothing. Paid once per pass, by day and Field,
 *   however often the page reloads.
 *
 * - **The quartermaster decides what they become.** Left to itself it sends
 *   what the town is shortest of, measured against its size; set to a stock
 *   it sends three passes in four there. This is the resource-management
 *   side of study: a town short of timber is a reason to review.
 *
 * - **The town asks.** Each day it posts a requisition or two against the
 *   Fields with cards still due, for the goods it most lacks: pass so many
 *   of that Field's reviews today and a larger load comes in on top.
 *
 * - **Mastery is an heirloom** — one legendary piece per card driven to
 *   level 12 — and **a new Domain charts the sky**: a star chart for every
 *   idea that matched nothing you had, which is what the Eye of Time reads by.
 */

export type Stock = "timber" | "food" | "fuel" | "metal" | "coin" | "precious";
export type Focus = Stock | "auto";

type Bundle = Partial<Record<ResourceKey, number>>;

export interface StockDef {
  name: string;
  blurb: string;
  /** The school whose Fields send it most readily (+25%). */
  school?: School;
  /** One pass's goods, by depth: levels 1–3, 4–6, 7–9, 10 up. */
  bands: [Bundle, Bundle, Bundle, Bundle];
}

export const STOCKS: Record<Stock, StockDef> = {
  timber: { name: "Timber & stone", blurb: "wood and stone; planks and bricks from deeper cards", bands: [{ wood: 4, stone: 3 }, { planks: 2, bricks: 1, wood: 3 }, { planks: 3, bricks: 3 }, { planks: 6, bricks: 5 }] },
  food: { name: "Food", blurb: "potatoes and fish; meals, salt and tonic from deeper cards", school: "mind", bands: [{ potato: 4, fish: 2 }, { meals: 4, salt: 1 }, { meals: 7, salt: 2 }, { meals: 14, tonic: 1 }] },
  fuel: { name: "Fuel & light", blurb: "wood and coal; charcoal and torches from deeper cards", bands: [{ wood: 5, coal: 1 }, { coal: 4, torches: 1 }, { charcoal: 4, torches: 2 }, { charcoal: 6, coal: 6, torches: 3 }] },
  metal: { name: "Metal", blurb: "iron; ingots from deeper cards", school: "science", bands: [{ iron: 1, stone: 2 }, { iron: 3 }, { ingots: 2, iron: 2 }, { ingots: 4, iron: 4 }] },
  coin: { name: "Coin & silver", blurb: "coin; silver and gold from deeper cards", school: "commerce", bands: [{ coin: 5 }, { coin: 12 }, { coin: 15, silver: 1 }, { silver: 2, gold: 1 }] },
  precious: { name: "Rare stock", blurb: "silver, quicksilver, gold, platinum and star charts — only deep cards send them", bands: [{ coin: 5 }, { silver: 1 }, { silver: 1, quicksilver: 1 }, { gold: 1, platinum: 1, starchart: 1 }] },
};
export const STOCK_KEYS = Object.keys(STOCKS) as Stock[];
export const DEPTH_NAMES = ["new", "settled", "deep", "rooted"] as const;
export const SCHOOL_BONUS = 1.25;

// ── What the town lacks ─────────────────────────────────────

const has = (s: GameState, k: ResourceKey) => s.res[k] ?? 0;

/**
 * Each stock's shortfall, 0 (well stocked) to 1 (empty), against a target
 * that grows with the town. Deliberately rough — a few days' use for a town
 * of this size — since it only has to rank the stocks, not plan a budget.
 */
export function needs(s: GameState, extra: Bundle = {}): Record<Stock, number> {
  const pop = Math.max(1, s.villagers.length);
  const r = (k: ResourceKey) => has(s, k) + (extra[k] ?? 0);
  const raw = RAW_FOODS.reduce((a, k) => a + r(k), 0);
  const tallies: Record<Stock, [number, number]> = {
    timber: [r("wood") + r("stone") + 2 * (r("planks") + r("bricks")), 80 + 14 * pop],
    food: [r("meals") + 0.5 * raw, 40 + 12 * pop],
    fuel: [0.5 * r("wood") + 2 * (r("coal") + r("charcoal")) + r("peat") + r("torches"), 30 + 6 * pop],
    metal: [r("iron") + 3 * r("ingots"), 20 + 2 * pop],
    coin: [r("coin"), 100 + 10 * pop],
    precious: [r("silver") + 3 * (r("gold") + r("platinum")) + r("quicksilver") + r("starchart"), 12 + pop / 2],
  };
  const out = {} as Record<Stock, number>;
  for (const k of STOCK_KEYS) out[k] = Math.max(0, Math.min(1, 1 - tallies[k][0] / tallies[k][1]));
  return out;
}

/** Buildings and people that burn rare stock: until one stands, silver and star charts can wait. */
const RARE_USERS = new Set(["alchemy", "observatory", "mythiclab"]);

/**
 * How much each shortfall matters. An empty larder is worse than an empty
 * purse, and a hamlet with nothing to spend rare stock on should not be
 * sent it ahead of timber — so the shortfalls are weighed before ranking.
 */
export function urgency(s: GameState, extra: Bundle = {}): Record<Stock, number> {
  const n = needs(s, extra);
  const rare = s.structures.some((st) => RARE_USERS.has(st.type)) || s.villagers.some((v) => v.role === "seer");
  const w: Record<Stock, number> = { timber: 1, food: 1.2, fuel: 1, metal: 0.7, coin: 0.6, precious: rare ? 0.8 : 0.15 };
  const out = {} as Record<Stock, number>;
  for (const k of STOCK_KEYS) out[k] = n[k] * w[k];
  return out;
}

const top = (n: Record<Stock, number>) => STOCK_KEYS.reduce((a, b) => (n[b] > n[a] ? b : a), STOCK_KEYS[0]);
/** The stock the town most needs now, after `extra` has landed. */
export const neediest = (s: GameState, extra: Bundle = {}) => top(urgency(s, extra));

const add = (into: Bundle, b: Bundle, times = 1) => {
  for (const [k, v] of Object.entries(b)) into[k as ResourceKey] = (into[k as ResourceKey] ?? 0) + (v as number) * times;
};

/**
 * Where `count` passes at depth `band` go. With a focus, three in four go
 * there; every other pass (and all of them on auto) goes to whatever is
 * shortest *after* the passes before it have landed, so thirty passes on
 * auto spread across the gaps rather than all piling into one.
 */
export function allocate(s: GameState, focus: Focus, band: number, count: number, school: School | null): { goods: Bundle; into: Partial<Record<Stock, number>> } {
  const goods: Bundle = {};
  const into: Partial<Record<Stock, number>> = {};
  for (let i = 0; i < count; i++) {
    const stock = focus !== "auto" && i % 4 !== 3 ? focus : neediest(s, goods);
    const bonus = school && STOCKS[stock].school === school ? SCHOOL_BONUS : 1;
    add(goods, STOCKS[stock].bands[band], bonus);
    into[stock] = (into[stock] ?? 0) + 1;
  }
  for (const k of Object.keys(goods) as ResourceKey[]) goods[k] = Math.round(goods[k]!);
  return { goods, into };
}

// ── Requisitions ───────────────────────────────────────────

export interface Requisition {
  day: string;
  fieldId: string;
  field: string;
  stock: Stock;
  /** Passes wanted, counted from `from` (the Field's passes when it was posted). */
  need: number;
  from: number;
  reward: Bundle;
  done: boolean;
}

export const REQ_MAX = 2;
export const REQ_CAP = 15;
/** A requisition pays this many times a settled card's goods per pass asked for. */
export const REQ_RATE = 1;

export const passesOf = (f: FieldDaily) => (f.passed ?? [0, 0, 0, 0]).reduce((a, b) => a + b, 0);

/** Today's requisitions: against the Fields most in arrears, for the goods the town most lacks. */
function post(s: GameState, k: Knowledge, fields: FieldDaily[], day: string) {
  const owing = fields.filter((f) => f.dueRemaining > 0).sort((a, b) => b.overdue - a.overdue || b.dueRemaining - a.dueRemaining).slice(0, REQ_MAX);
  if (!owing.length) return;
  const n = urgency(s);
  const ranked = [...STOCK_KEYS].sort((a, b) => n[b] - n[a]);
  owing.forEach((f, i) => {
    const stock = ranked[i];
    const need = Math.max(1, Math.min(REQ_CAP, f.dueRemaining));
    const reward: Bundle = {};
    add(reward, STOCKS[stock].bands[1], need * REQ_RATE * (f.school && STOCKS[stock].school === f.school ? SCHOOL_BONUS : 1));
    for (const key of Object.keys(reward) as ResourceKey[]) reward[key] = Math.round(reward[key]!);
    (k.reqs ??= []).push({ day, fieldId: f.id, field: f.name, stock, need, from: passesOf(f), reward, done: false });
  });
  log(s, `The quartermaster posts today's requisitions: ${k.reqs!.filter((r) => r.day === day).map((r) => `${STOCKS[r.stock].name.toLowerCase()} from ${r.field} (${r.need} reviews)`).join("; ")}.`, "info");
}

// ── The hour ───────────────────────────────────────────────

export interface Tithe {
  field: string;
  passes: number;
  got: string;
  at: number;
}

export const goodsText = (b: Bundle) =>
  Object.entries(b)
    .filter(([, v]) => (v as number) > 0)
    .map(([key, v]) => `${v} ${key}`)
    .join(", ");

/** Pays what today's reviews have earned and not yet been paid, and settles the requisitions. */
export function tithesHourly(s: GameState, k: Knowledge, input: TownInput) {
  const day = input.day;
  const fields = input.fields ?? [];
  if (!day) return;
  const paid = ((k.tithed ??= {})[day] ??= {});
  const focus = k.focus ?? "auto";
  // This settlement's tithes, all Fields together: one moment for the lot (./moments).
  const settled: Bundle = {};
  const byField: string[] = [];
  let settledPasses = 0;

  for (const f of fields) {
    const passed = f.passed ?? [0, 0, 0, 0];
    const was = (paid[f.id] ??= { passed: [0, 0, 0, 0], mastered: 0, domains: 0 });
    const goods: Bundle = {};
    let passes = 0;
    for (let band = 0; band < 4; band++) {
      const due = passed[band] - was.passed[band];
      if (due <= 0) continue;
      was.passed[band] = passed[band];
      passes += due;
      add(goods, allocate(s, focus, band, due, f.school).goods);
    }
    if (passes > 0) {
      for (const [key, v] of Object.entries(goods)) s.res[key as ResourceKey] += v as number;
      const got = goodsText(goods);
      (k.tithes ??= []).unshift({ field: f.name, passes, got, at: s.time });
      if (k.tithes.length > 12) k.tithes.length = 12;
      log(s, `${f.name}: ${passes} review${passes > 1 ? "s" : ""} passed — ${got} to the stores.`, "good");
      add(settled, goods);
      settledPasses += passes;
      byField.push(`${f.name}: ${passes} → ${got}`);
    }

    // Mastery: an heirloom per card, chosen by day, Field and count so a reload cannot reroll it.
    const mastered = f.mastered ?? 0;
    if (mastered > was.mastered) {
      const pool = poolOf("legendary");
      for (let i = was.mastered; i < mastered; i++) {
        let seed = 0;
        for (const ch of `${day}|${f.id}|m${i}`) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
        const item = pool[Math.floor(rng(Math.abs(seed) + 11)() * pool.length)];
        if (!item) break;
        const name = itemDef(item.id)?.name ?? item.id;
        const waits = store(s, item.id, 1) > 0;
        if (waits) {
          // No armoury, or no room in it: the heirloom waits rather than being lost.
          (k.owed ??= []).push(item.id);
          log(s, `A card in ${f.name} is mastered: ${name} is the town's, and waits for room in a forge's armoury.`, "good");
        } else {
          log(s, `A card in ${f.name} is mastered: the town is given ${name}.`, "good");
        }
        pushMoment(s, { kind: "heirloom", title: name, lines: [`A card in ${f.name} is mastered.${waits ? " It waits for room in a forge's armoury." : ""}`], goods: { [item.id]: 1 } });
      }
      was.mastered = mastered;
    }

    // A Domain opened today: an idea that matched nothing you had charts a new corner of the sky.
    const domains = f.newDomains ?? 0;
    if (domains > was.domains) {
      const n = domains - was.domains;
      s.res.starchart += n;
      was.domains = domains;
      log(s, `${f.name} opens ${n === 1 ? "a new domain" : `${n} new domains`}: the observatory draws ${n === 1 ? "a star chart" : `${n} star charts`} of it.`, "good");
      pushMoment(s, { kind: "chart", title: `${f.name} opens ${n === 1 ? "a new domain" : `${n} new domains`}`, lines: [], goods: { starchart: n } });
    }
  }
  if (settledPasses > 0) {
    pushMoment(s, { kind: "tithe", title: `${settledPasses} right answer${settledPasses > 1 ? "s" : ""} → ${goodsText(settled)}`, lines: byField, goods: { ...settled } as Record<string, number> });
  }

  // Heirlooms still owed go in as soon as there is room.
  if (k.owed?.length) k.owed = k.owed.filter((id) => store(s, id, 1) > 0);

  // Requisitions: post today's once, settle any the reviews have met.
  const reqs = (k.reqs ??= []).filter((r) => r.day === day);
  if (!reqs.length && !(k.posted ?? []).includes(day)) {
    (k.posted ??= []).push(day);
    if (k.posted.length > 4) k.posted.shift();
    post(s, k, fields, day);
  }
  for (const r of k.reqs) {
    if (r.day !== day || r.done) continue;
    const f = fields.find((x) => x.id === r.fieldId);
    if (!f || passesOf(f) - r.from < r.need) continue;
    r.done = true;
    for (const [key, v] of Object.entries(r.reward)) s.res[key as ResourceKey] += v as number;
    log(s, `Requisition filled: ${r.need} reviews in ${r.field}. ${goodsText(r.reward)} come in.`, "good");
    pushMoment(s, { kind: "req", title: `Requisition filled: ${r.field} ${r.need}/${r.need}`, lines: [], goods: { ...r.reward } as Record<string, number> });
  }
  // Only today's requisitions are kept; yesterday's lapse.
  k.reqs = k.reqs.filter((r) => r.day === day);
  for (const key of Object.keys(k.tithed)) if (key !== day) delete k.tithed[key];
}

/** Sets what passed reviews become. */
export function setTitheFocus(s: GameState, k: Knowledge, focus: Focus): string | null {
  if (focus !== "auto" && !STOCKS[focus]) return "No such stock.";
  k.focus = focus;
  log(s, focus === "auto" ? "The quartermaster will send whatever the town lacks." : `The quartermaster will turn reviews into ${STOCKS[focus].name.toLowerCase()}.`);
  return null;
}
