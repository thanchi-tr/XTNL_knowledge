import { clock } from "./sim/state";
import { partyName } from "./sim/bestiary";
import { STOCKS, neediest, passesOf, type Stock } from "./sim/tithes";
import { TIERS, cartGoods, rollDrop, tierOf } from "./sim/knowledge";
import type { GameState } from "./sim/types";
import type { FieldDaily, TownInput } from "./rules";
import { PULSE_EVENT, PULSE_KEY, PULSE_MAX_BYTES, PULSE_V, type Goods, type PulseCart, type PulseRate, type PulseReq, type TownPulse } from "./pulse-core";

export * from "./pulse-core";

/**
 * The town's side of the pulse (./pulse-core): built from the running game
 * and written to localStorage for the review app.
 *
 * Pure but for the write: pulseOf reads the state and the input and changes
 * neither, so it can run on every save. The review app never imports this
 * file, since it pulls in the simulation; it reads ./pulse-core.
 */

/** Carts kept in the pulse: the Fields with the most still due, and any whose cart came in today. */
const CART_MAX = 12;
/** Right answers at which a cart gains a load (./sim/knowledge rollDrop: one more at 1, 4 and 9). */
const CART_STEPS = [1, 4, 9];

/**
 * Today's cart from one Field, as goods: the simulation's own fixed manifest
 * (./sim/knowledge rollDrop), flattened the way a cart moment records it, so
 * the manifest the review app states is the one the town pays. The one place
 * the pulse reads cart logic from.
 */
export function cartOf(f: FieldDaily, day: string): { tier: number; goods: Goods } {
  const d = rollDrop(f, day);
  return { tier: d.tier, goods: cartGoods(d) };
}

/** Wrong answers today, from the ledger's REVIEW_MISS rows (./input); `failed` on inputs from before they were counted. */
const missesOf = (f: FieldDaily) => f.misses ?? f.failed ?? 0;

const rateOf = (stock: Stock): PulseRate => {
  const def = STOCKS[stock];
  return { name: def.name, ...(def.school ? { school: def.school } : {}), bands: def.bands.map((b) => ({ ...b }) as Goods) as PulseRate["bands"] };
};

/** One Field's cart today as the review app and the town's Study panel state it; `done` once it has come in. */
export function cartFor(f: FieldDaily, day: string, done: boolean): PulseCart {
  const passes = passesOf(f);
  const misses = missesOf(f);
  // A Field's first review of the day carries its streak on (./field-streaks), and the town rolls the cart on
  // the streak it reads then: until the Field has been answered today, that is one more than it reads now.
  const streak = done || passes + misses > 0 ? f.streak : f.streak + 1;
  const at = { ...f, streak };
  // Each step as if the Field were cleared with that many right answers (rollDrop counts passes, or cards touched before them).
  const steps = done ? [] : CART_STEPS.map((from) => ({ from, cart: cartOf({ ...at, reviewedToday: from, passed: [from, 0, 0, 0] }, day) }));
  // The tier as the cart logic reads it, so the two cannot drift apart.
  const tier = steps[0]?.cart.tier ?? tierOf(streak);
  const manifest = steps
    .map((st) => ({ from: st.from, goods: st.cart.goods }))
    // Steps already passed can never apply again.
    .filter((m, i, all) => i === all.length - 1 || all[i + 1].from > passes);
  return { fieldId: f.id, field: f.name, tier, rarity: TIERS[tier]?.name ?? "", streak, done, due: f.dueRemaining, passes, misses, manifest };
}

/** What a review is worth to this town right now. `at` is the write time. */
export function pulseOf(s: GameState, input: TownInput, at = Date.now()): TownPulse {
  const k = s.knowledge;
  const day = input.day ?? "";
  const fields = input.fields ?? [];
  const byId = new Map(fields.map((f) => [f.id, f]));
  const focus = k?.focus ?? "auto";
  const lean = neediest(s);
  const rates: TownPulse["rates"] = {};
  for (const st of focus === "auto" ? [lean] : [focus, lean]) rates[st] = rateOf(st);

  const reqs: PulseReq[] = (k?.reqs ?? [])
    .filter((r) => r.day === day)
    .map((r) => {
      const f = byId.get(r.fieldId);
      const got = f ? Math.max(0, passesOf(f) - r.from) : 0;
      return { fieldId: r.fieldId, field: r.field, stock: r.stock, need: r.need, got: Math.min(r.need, got), reward: { ...r.reward } as Goods, done: r.done };
    });

  const claimed = new Set(k?.claimed?.[day] ?? []);
  const carts = fields
    .filter((f) => f.dueRemaining > 0 || claimed.has(f.id))
    .sort((a, b) => b.dueRemaining - a.dueRemaining)
    .slice(0, CART_MAX)
    .map((f) => cartFor(f, day, claimed.has(f.id)));

  const c = clock(s.time);
  const raid = s.raid && s.raid.phase !== "repelled" && s.raid.party.length
    ? { name: partyName(s.raid.party), etaH: s.raid.phase === "incoming" ? Math.max(0, Math.ceil((s.raid.arrivesAt - s.time) / 60)) : 0 }
    : null;
  const fallen = s.fallen && !s.fallen.seen ? { day: s.fallen.day, ...(s.fallCause ? { cause: s.fallCause } : {}) } : null;

  return {
    v: PULSE_V,
    at,
    day,
    seen: fields.reduce((a, f) => a + passesOf(f) + missesOf(f), 0),
    town: { day: c.day, hour: c.hour, pop: s.villagers.length, ...(raid ? { raid } : {}), ...(fallen ? { fallen } : {}) },
    focus,
    lean,
    // SUPPLY_SCALE (./sim/tithes) once the M2 retune adds it: receipts read it from here, so the promise stays the payout.
    scale: 1,
    rates,
    reqs,
    carts,
  };
}

const bytes = (json: string) => new TextEncoder().encode(json).length;

/** The pulse as JSON within PULSE_MAX_BYTES: the least-due carts go first; null if even none fit. */
export function fitPulse(p: TownPulse): string | null {
  let q = p;
  let json = JSON.stringify(q);
  while (bytes(json) >= PULSE_MAX_BYTES && q.carts.length) {
    q = { ...q, carts: q.carts.slice(0, -1) };
    json = JSON.stringify(q);
  }
  return bytes(json) < PULSE_MAX_BYTES ? json : null;
}

/**
 * Writes the pulse for the review app. Called with the player's own town only,
 * on every save. Never throws: a failure here must not cost the town its save.
 */
export function writePulse(s: GameState, input: TownInput) {
  try {
    const json = fitPulse(pulseOf(s, input));
    if (json === null) return;
    localStorage.setItem(PULSE_KEY, json);
    window.dispatchEvent(new Event(PULSE_EVENT));
  } catch {
    /* no storage (private mode, quota) or a bad input: the review app shows no town lines */
  }
}
