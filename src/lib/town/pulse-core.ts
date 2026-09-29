import type { School } from "./rules";
import type { Focus, Stock } from "./sim/tithes";

/**
 * The town's pulse, as the review app reads it (design M1: "the review app
 * speaks for the town").
 *
 * The town lives in this browser's localStorage and runs only while /town is
 * open, but the study that feeds it happens on /review. The pulse is the
 * bridge: every few seconds the town writes down what a review is worth to it
 * right now (what a pass sends at each depth, today's requisitions, each
 * Field's cart) and the review app states those payouts before, during and
 * after a session, from the same numbers the town settles with. Nothing here
 * is a roll: every figure is fixed before the answer is given.
 *
 * This half is what the review app and the nav load, so it holds no
 * simulation code (type imports only) and the rates it multiplies travel
 * inside the pulse. The writer, which does need the simulation, is ./pulse.
 */

export const PULSE_KEY = "xtnl-town-pulse";
export const PULSE_V = 1;
/** Fired on this tab after a write: 'storage' events only reach the other tabs. */
export const PULSE_EVENT = "xtnl-town-pulse";
/** Answers given on /review since the town last read the server (see noteAnswer). */
export const SINCE_KEY = "xtnl-town-pulse-since";
/** The writer drops the least-due carts until the pulse fits. */
export const PULSE_MAX_BYTES = 8 * 1024;
/** Older than this, the review app says when the town last wrote. */
export const PULSE_STALE_MS = 30 * 60_000;

/** The town's names for a pass's depth band (./sim/tithes DEPTH_NAMES). */
export const DEPTHS = ["new", "settled", "deep", "rooted"] as const;
/** A Field of the stock's own school sends it a quarter richer (./sim/tithes SCHOOL_BONUS). */
export const SCHOOL_BONUS = 1.25;

/** Goods by resource or item key; a tool is `tool:<material>`. */
export type Goods = Record<string, number>;

export interface PulseRate {
  name: string;
  school?: School;
  /** One pass's goods at each depth band, before the scale. */
  bands: [Goods, Goods, Goods, Goods];
}

export interface PulseReq {
  fieldId: string;
  field: string;
  stock: Stock;
  need: number;
  /** Passes counted toward it so far, capped at `need`. */
  got: number;
  reward: Goods;
  /** Already paid by the town. */
  done: boolean;
}

export interface PulseCart {
  fieldId: string;
  field: string;
  tier: number;
  rarity: string;
  /** The Field's streak once today is reviewed: the one the cart is rolled on. */
  streak: number;
  /** Today's cart has already come in. */
  done: boolean;
  /** Cards still due in it, and today's right and wrong answers in it, as the town last read them. */
  due: number;
  passes: number;
  misses: number;
  /** What the cart brings, by the right answers the Field has when it is cleared: each step from `from` on. */
  manifest: { from: number; goods: Goods }[];
}

export interface TownPulse {
  v: 1;
  /** When the town wrote it (epoch ms). */
  at: number;
  /** The study day the town last read (TownInput.day): requisitions and carts are for this day only. */
  day: string;
  /** Today's answers, right and wrong, the town has read: moves when the town re-reads the server. */
  seen: number;
  town: {
    day: number;
    hour: number;
    pop: number;
    raid?: { name: string; etaH: number };
    fallen?: { day: number; cause?: string };
  };
  focus: Focus;
  /** The stock the town lacks most right now (./sim/tithes neediest). */
  lean: Stock;
  /** The supply scale on every study payout (1 until the M2 retune). */
  scale: number;
  /** The rates of the focus and the lean, so a receipt needs no simulation code. */
  rates: Partial<Record<Stock, PulseRate>>;
  reqs: PulseReq[];
  carts: PulseCart[];
}

/** A pulse as a component holds it: `stale` once it is older than half an hour; `today` is this device's day. */
export interface PulseView {
  pulse: TownPulse;
  stale: boolean;
  today: string;
}

/** The day key the town's study is claimed against (./input localDay). */
export const dayKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** A card's depth band by the level it now sits at: the same split as ./input's p1–p4 on the post-pass level. */
export const bandOf = (level: number) => (level >= 10 ? 3 : level >= 7 ? 2 : level >= 4 ? 1 : 0);

// ── Receipts ────────────────────────────────────────────────

export interface Receipt {
  goods: Goods;
  stock: Stock;
  band: number;
  /** Routed by need: the town's guess as of the pulse, which moves as goods land. */
  approx: boolean;
}

/**
 * One pass's goods before rounding. The town settles a Field's passes at one
 * depth together and rounds the total (./sim/tithes allocate), so a run's
 * totals add these up and round once per Field and depth.
 */
export function rawReceipt(p: TownPulse, newLevel: number, school: School | null = null, nth = 0): Receipt {
  const band = bandOf(newLevel);
  // With a focus, three passes in four go there and the fourth to the gap; on auto every one goes to the gap.
  const byNeed = nth % 4 === 3;
  const stock: Stock = p.focus === "auto" || byNeed ? p.lean : p.focus;
  const rate = p.rates[stock];
  const goods: Goods = {};
  if (rate) {
    const k = p.scale * (school && rate.school === school ? SCHOOL_BONUS : 1);
    for (const [key, n] of Object.entries(rate.bands[band])) goods[key] = n * k;
  }
  return { goods, stock, band, approx: p.focus === "auto" || byNeed };
}

/**
 * What one pass sends to town, as the town will settle it: the pass's depth
 * band of the focus stock, or on auto of whatever the town lacks most, a
 * quarter richer when the Field's school matches the stock. `nth` is the
 * pass's place among this run's passes in the same Field and band.
 */
export function receiptFor(p: TownPulse, newLevel: number, school: School | null = null, nth = 0): Receipt {
  const r = rawReceipt(p, newLevel, school, nth);
  return { ...r, goods: rounded(r.goods) };
}

function rounded(g: Goods): Goods {
  const out: Goods = {};
  for (const [key, n] of Object.entries(g)) {
    const v = Math.round(n);
    if (v > 0) out[key] = v;
  }
  return out;
}

/** Adds `g` into `into` (a new object). */
export function addGoods(into: Goods, g: Goods, times = 1): Goods {
  const out = { ...into };
  for (const [key, n] of Object.entries(g)) out[key] = (out[key] ?? 0) + n * times;
  return out;
}

/** A run's goods: each batch (one Field at one depth) rounded as the town rounds it, then summed. */
export function settled(batches: Record<string, Goods>): Goods {
  let out: Goods = {};
  for (const g of Object.values(batches)) out = addGoods(out, rounded(g));
  return out;
}

// ── Carts and requisitions ──────────────────────────────────

/** Requisitions still asking: not paid, and not yet met. */
export const openReqs = (p: TownPulse) => p.reqs.filter((r) => !r.done && r.got < r.need);

/** The cart as it stands at `passes` right answers in the Field today; null before the first. */
export function cartAt(c: PulseCart, passes: number): { from: number; goods: Goods } | null {
  let step: { from: number; goods: Goods } | null = null;
  for (const m of c.manifest) if (m.from <= passes) step = m;
  return step;
}

/** The right answers at which the cart next grows, if it still can. */
export const nextRollAt = (c: PulseCart, passes: number) => c.manifest.find((m) => m.from > passes)?.from ?? null;

/** Requisitions and carts lapse with the study day they were posted for; the rates hold on any day. */
export const forDay = (p: TownPulse, day: string): TownPulse => (p.day === day ? p : { ...p, reqs: [], carts: [] });

// ── What this app has seen that the town has not ────────────

/**
 * Answers given here since the town last read the server, by Field:
 * [right, wrong]. The town only learns of a review when it next re-reads, so
 * until then the review app keeps its own count on top of the pulse. Keyed by
 * the pulse's day and `seen`: once the town has read those answers its
 * `seen` moves, and this count no longer applies.
 */
export interface PulseSince {
  day: string;
  seen: number;
  f: Record<string, [number, number]>;
}

export function parseSince(raw: string | null): PulseSince | null {
  if (!raw) return null;
  try {
    const x = JSON.parse(raw) as PulseSince;
    return x && typeof x.day === "string" && typeof x.seen === "number" && x.f && typeof x.f === "object" ? x : null;
  } catch {
    return null;
  }
}

/** The pulse with this app's unseen answers counted in. */
export function withSince(p: TownPulse, since: PulseSince | null): TownPulse {
  if (!since || since.day !== p.day || since.seen !== p.seen) return p;
  const right = (id: string) => Math.max(0, Number(since.f[id]?.[0]) || 0);
  const wrong = (id: string) => Math.max(0, Number(since.f[id]?.[1]) || 0);
  return {
    ...p,
    reqs: p.reqs.map((r) => (right(r.fieldId) ? { ...r, got: Math.min(r.need, r.got + right(r.fieldId)) } : r)),
    carts: p.carts.map((c) => (right(c.fieldId) || wrong(c.fieldId) ? { ...c, passes: c.passes + right(c.fieldId), misses: c.misses + wrong(c.fieldId) } : c)),
  };
}

/**
 * Counts one answer on /review toward today's pulse, so the nav, the Town card
 * and other tabs see a requisition fill before the town re-reads. `today` is
 * the server's study day; answers on a day the town has not read are the
 * town's to count when it opens.
 */
export function noteAnswer(today: string, fieldId: string, pass: boolean) {
  try {
    const p = parsePulse(localStorage.getItem(PULSE_KEY));
    if (!p || p.day !== today) return;
    const was = parseSince(localStorage.getItem(SINCE_KEY));
    const since: PulseSince = was && was.day === p.day && was.seen === p.seen ? was : { day: p.day, seen: p.seen, f: {} };
    const [r, w] = since.f[fieldId] ?? [0, 0];
    since.f[fieldId] = pass ? [r + 1, w] : [r, w + 1];
    localStorage.setItem(SINCE_KEY, JSON.stringify(since));
    window.dispatchEvent(new Event(PULSE_EVENT));
  } catch {
    /* no storage: the town counts these when it next reads the server */
  }
}

// ── Reading ─────────────────────────────────────────────────

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === "string";
const isGoods = (x: unknown): x is Goods => !!x && typeof x === "object" && Object.values(x).every(isNum);

/** The pulse in `raw`, or null when it is missing, malformed or another version. */
export function parsePulse(raw: string | null): TownPulse | null {
  if (!raw) return null;
  let p: TownPulse;
  try {
    p = JSON.parse(raw) as TownPulse;
  } catch {
    return null;
  }
  if (!p || p.v !== PULSE_V || !isNum(p.at) || !isStr(p.day) || !isNum(p.seen) || !p.town || !isNum(p.town.day) || !isNum(p.town.pop)) return null;
  if (!isStr(p.focus) || !isStr(p.lean) || !isNum(p.scale) || !p.rates || typeof p.rates !== "object" || !Array.isArray(p.reqs) || !Array.isArray(p.carts)) return null;
  const rateOk = (r: PulseRate | undefined) => !r || (Array.isArray(r.bands) && r.bands.length === 4 && r.bands.every(isGoods));
  if (!Object.values(p.rates).every(rateOk)) return null;
  return {
    ...p,
    reqs: p.reqs.filter((r) => r && isStr(r.fieldId) && isStr(r.field) && isNum(r.need) && isNum(r.got) && isGoods(r.reward)),
    carts: p.carts.filter(
      (c) => c && isStr(c.fieldId) && isStr(c.field) && isNum(c.tier) && isNum(c.streak) && isNum(c.passes) && isNum(c.misses) && Array.isArray(c.manifest) && c.manifest.every((m) => m && isNum(m.from) && isGoods(m.goods)),
    ),
  };
}

// ── Words ───────────────────────────────────────────────────

/** Singular and plural where the store key is not already the word to print. */
const NAMES: Record<string, [string, string]> = {
  planks: ["plank", "planks"],
  bricks: ["brick", "bricks"],
  ingots: ["ingot", "ingots"],
  torches: ["torch", "torches"],
  meals: ["meal", "meals"],
  potato: ["potato", "potatoes"],
  jewel: ["jewel", "jewels"],
  diamond: ["diamond", "diamonds"],
  formula: ["formula", "formulas"],
  tonic: ["tonic", "tonics"],
  starchart: ["star chart", "star charts"],
};

export function goodName(key: string, n: number): string {
  if (key.startsWith("tool:")) return `${key.slice(5)} tool${n === 1 ? "" : "s"}`;
  const w = NAMES[key];
  return w ? w[n === 1 ? 0 : 1] : key;
}

const entries = (g: Goods) => Object.entries(g).filter(([, n]) => n > 0);
/** "+2 planks +1 brick +3 wood" */
export const goodsPlus = (g: Goods) => entries(g).map(([key, n]) => `+${n} ${goodName(key, n)}`).join(" ");
/** "2 planks, 1 brick, 3 wood" */
export const goodsList = (g: Goods) => entries(g).map(([key, n]) => `${n} ${goodName(key, n)}`).join(", ");
/** "4 wood 3 stone" */
const goodsBare = (g: Goods) => entries(g).map(([key, n]) => `${n} ${goodName(key, n)}`).join(" ");

/** A stock's short name: "Timber" for "Timber & stone". */
export const stockLabel = (p: TownPulse, stock: Stock) => (p.rates[stock]?.name ?? stock).split(" & ")[0];

/** The card's line under its outcome: "→ Town: +2 planks +1 brick +3 wood (Timber, settled card)". */
export const passLine = (p: TownPulse, r: Receipt) =>
  `→ Town: ${r.approx ? "≈ " : ""}${goodsPlus(r.goods)} (${stockLabel(p, r.stock)}, ${DEPTHS[r.band]} card)`;

export const MISS_LINE = "→ Town: no goods for a miss";

/** "Statistics 5/12 → 30 planks, 15 bricks, 45 wood" */
export const reqText = (r: PulseReq, got = r.got) => `${r.field} ${Math.min(r.need, got)}/${r.need} → ${goodsList(r.reward)}`;

/**
 * What a right answer sends, by depth, for a run over `scope` (a Field's name,
 * or null for every Field): the rates the town pays at, stated before the run.
 */
export function ratesLine(p: TownPulse, scope: string | null, scopeSchool: School | null): string {
  const stock = p.focus === "auto" ? p.lean : p.focus;
  const rate = p.rates[stock];
  if (!rate) return "";
  const bonus = scope && scopeSchool && rate.school === scopeSchool;
  const k = p.scale * (bonus ? SCHOOL_BONUS : 1);
  const bands = rate.bands.map((b, i) => `${DEPTHS[i]} ${goodsBare(rounded(addGoods({}, b, k)))}`).join(" · ");
  const why = [
    p.focus === "auto" ? `${stockLabel(p, stock)}, what the town lacks most now` : stockLabel(p, stock),
    bonus ? `+25% as a ${scopeSchool} Field` : !scope && rate.school ? `+25% from ${rate.school} Fields` : "",
    p.focus === "auto" ? "" : "every fourth pass goes to what the town lacks most",
  ].filter(Boolean);
  return `Right answers send your town goods by depth: ${bands} (${why.join("; ")}).`;
}

// ── A finished run, for the recap ───────────────────────────

/** One Field's answers in a run, and its passes by depth band. */
export interface FieldRun {
  passes: number;
  misses: number;
  bands: [number, number, number, number];
}

export interface RunTown {
  passes: number;
  goods: Goods;
  approx: boolean;
  carts: { field: string; rarity: string; streak: number; goods: Goods }[];
  reqs: { field: string; need: number; reward: Goods }[];
}

/**
 * What a finished run sends the town, from the pulse as it stood when the run
 * began. A Field counts as cleared when every card due in it at the start was
 * answered and, over the day, it has at least as many right answers as wrong
 * (./rules clearedField); its cart is the manifest at its day's right answers.
 */
export function runTown(p: TownPulse, byField: Record<string, FieldRun>, goods: Record<string, Goods>, approx: boolean, dueAtStart: Record<string, number>): RunTown {
  const passes = Object.values(byField).reduce((a, f) => a + f.passes, 0);
  const carts: RunTown["carts"] = [];
  for (const [id, run] of Object.entries(byField)) {
    const c = p.carts.find((x) => x.fieldId === id);
    const due = dueAtStart[id] ?? 0;
    if (!c || c.done || !due || run.passes + run.misses < due) continue;
    const right = c.passes + run.passes;
    const wrong = c.misses + run.misses;
    const step = right >= 1 && right >= wrong ? cartAt(c, right) : null;
    if (step) carts.push({ field: c.field, rarity: c.rarity, streak: c.streak, goods: step.goods });
  }
  const reqs = p.reqs
    .filter((r) => !r.done && r.got < r.need && r.got + (byField[r.fieldId]?.passes ?? 0) >= r.need)
    .map((r) => ({ field: r.field, need: r.need, reward: r.reward }));
  return { passes, goods: settled(goods), approx, carts, reqs };
}
