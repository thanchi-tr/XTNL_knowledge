/**
 * The town pulse, checked headlessly (design M1, "the review app speaks for
 * the town"; the pulse half of town:bridge).
 *
 * The review app states what each answer sends the player's town before the
 * town has settled it. That is only honest if the statement is the payout, so
 * this holds the pulse's receipts to the town's own allocate(), its lean to
 * neediest(), its cart manifests to what knowledgeHourly actually pays, and
 * the pulse itself to a size localStorage and the nav can carry every few
 * seconds. Run with `npx tsx scripts/town-pulse-check.ts`.
 */
import { isDeepStrictEqual } from "node:util";
import { newTown } from "../src/lib/town/sim/state";
import { knowledgeHourly, knowledgeOf } from "../src/lib/town/sim/knowledge";
import { DEPTH_NAMES, SCHOOL_BONUS as TOWN_SCHOOL_BONUS, STOCK_KEYS, allocate, neediest, type Stock } from "../src/lib/town/sim/tithes";
import { RAW_FOODS, type GameState, type ResourceKey } from "../src/lib/town/sim/types";
import type { FieldDaily, School, TownInput } from "../src/lib/town/rules";
import {
  DEPTHS,
  PULSE_MAX_BYTES,
  SCHOOL_BONUS,
  bandOf,
  cartAt,
  fitPulse,
  parsePulse,
  pulseOf,
  rawReceipt,
  receiptFor,
  runTown,
  settled,
  withSince,
  type Goods,
  type TownPulse,
} from "../src/lib/town/pulse";

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${what}`);
  if (!ok) failures++;
};
const show = (x: unknown) => JSON.stringify(x);
const bytes = (s: string) => new TextEncoder().encode(s).length;

const day = "2026-03-03";
const input: TownInput = {
  schools: { commerce: 10, science: 14, mind: 10 },
  scores: {},
  streakDays: 5,
  equippedAttributes: [],
  peakDepth: 3,
  reviewsToday: 0,
  newIdeasThisWeek: { commerce: 1, science: 1, mind: 1 },
  emblems: [],
  domainPeak: 4,
  domainSum: 20,
  dueRemaining: 0,
  newIdeasToday: 0,
  day,
};
const fd = (o: Partial<FieldDaily> = {}): FieldDaily => ({
  id: "stat", name: "Statistics", school: "science", level: 9, attrs: ["LOGIC", "STATISTIC"], ideasToday: 0, ideasWeek: 0,
  reviewedToday: 0, dueRemaining: 0, overdue: 0, streak: 0, bestStreak: 0, complete: false, ...o,
});
const at = (fields: FieldDaily[], o: Partial<TownInput> = {}): TownInput => ({ ...input, fields, ...o });
/** A town short of one stock only: everything plentiful but what `short` is made of. */
function shortOf(seed: number, short: Stock): GameState {
  const s = newTown(seed, 12);
  for (const k of Object.keys(s.res) as ResourceKey[]) s.res[k] = 5000;
  const zero: Record<Stock, ResourceKey[]> = {
    timber: ["wood", "stone", "planks", "bricks"],
    food: ["meals", ...RAW_FOODS],
    fuel: ["wood", "coal", "charcoal", "peat", "torches"],
    metal: ["iron", "ingots"],
    coin: ["coin"],
    precious: ["silver", "gold", "platinum", "quicksilver", "starchart"],
  };
  for (const k of zero[short]) if (k in s.res) s.res[k] = 0;
  return s;
}
const LEVEL_OF_BAND = [2, 5, 8, 11];

// ── Constants the review app keeps without the simulation ──
console.log("constants");
check(isDeepStrictEqual([...DEPTHS], [...DEPTH_NAMES]), `the depth names match the town's (${DEPTHS.join(", ")})`);
check(SCHOOL_BONUS === TOWN_SCHOOL_BONUS, `the school bonus matches the town's (×${SCHOOL_BONUS})`);

// ── Bands ──
console.log("bands");
{
  const got = [3, 4, 6, 7, 9, 10, 12].map(bandOf);
  check(isDeepStrictEqual(got, [0, 1, 1, 2, 2, 3, 3]), `bandOf(3, 4, 6, 7, 9, 10, 12) = ${got.join(", ")}`);
  check(bandOf(1) === 0 && bandOf(0) === 0, "a level-1 card (or a stray 0) is new");
}

// ── The lean ──
console.log("the lean");
{
  const s = newTown(4242, 12);
  check(pulseOf(s, at([]), 1).lean === neediest(s), `a new town leans to ${pulseOf(s, at([]), 1).lean}, as neediest() does`);
  for (const st of STOCK_KEYS) {
    const t = shortOf(5000 + STOCK_KEYS.indexOf(st), st);
    const p = pulseOf(t, at([]), 1);
    check(p.lean === neediest(t), `a town short of ${st}: the pulse leans to ${p.lean}, neediest() to ${neediest(t)}`);
  }
}

// ── Receipts against allocate() ──
console.log("receipts");
{
  const s = newTown(4243, 12);
  knowledgeOf(s).focus = "timber";
  const p = pulseOf(s, at([]), 1);
  const r = receiptFor(p, 5);
  const town = allocate(s, "timber", 1, 1, null).goods;
  check(isDeepStrictEqual(r.goods, town) && !r.approx && r.stock === "timber", `with focus timber, receiptFor(p, 5) = allocate(s, 'timber', 1, 1, null) (${show(r.goods)} vs ${show(town)})`);
  let all = true;
  for (let band = 0; band < 4; band++)
    for (const school of [null, "science", "mind", "commerce"] as (School | null)[]) {
      const a = receiptFor(p, LEVEL_OF_BAND[band], school).goods;
      const b = allocate(s, "timber", band, 1, school).goods;
      if (!isDeepStrictEqual(a, b)) {
        all = false;
        console.log(`        band ${band} ${school}: ${show(a)} vs ${show(b)}`);
      }
    }
  check(all, "with a focus, every band and school matches allocate() for one pass");

  // Metal is science's stock: a science Field sends it a quarter richer, and the receipt says so.
  const m = newTown(4244, 12);
  knowledgeOf(m).focus = "metal";
  const pm = pulseOf(m, at([]), 1);
  const rich = receiptFor(pm, 11, "science").goods;
  const plain = receiptFor(pm, 11, "mind").goods;
  check(isDeepStrictEqual(rich, allocate(m, "metal", 3, 1, "science").goods) && (rich.ingots ?? 0) > (plain.ingots ?? 0), `a rooted science pass sends metal a quarter richer (${show(rich)} vs ${show(plain)})`);

  // The fourth pass at one depth goes to what the town lacks most, as the town's own rule says.
  const f = shortOf(4245, "food");
  knowledgeOf(f).focus = "timber";
  const pf = pulseOf(f, at([]), 1);
  const fourth = receiptFor(pf, 5, null, 3);
  check(fourth.stock === pf.lean && pf.lean === "food" && fourth.approx, `with a focus, the fourth pass at a depth goes to the lean (${fourth.stock}) and is marked approximate`);
  const four = settled({ b: [0, 1, 2, 3].reduce<Goods>((g, nth) => {
    for (const [k, n] of Object.entries(rawReceipt(pf, 5, null, nth).goods)) g[k] = (g[k] ?? 0) + n;
    return g;
  }, {}) });
  const town4 = allocate(f, "timber", 1, 4, null).goods;
  check(isDeepStrictEqual(four, town4), `four settled passes on a timber focus total what allocate() pays for four (${show(four)} vs ${show(town4)})`);
}

// ── Auto: the first pass equals allocate(), and is flagged ──
console.log("auto");
{
  let all = true;
  let n = 0;
  for (const short of ["metal", "food", "coin", "timber"] as Stock[]) {
    const s = shortOf(4300 + n++, short);
    const p = pulseOf(s, at([]), 1);
    for (let band = 0; band < 4; band++)
      for (const school of [null, "science", "mind", "commerce"] as (School | null)[]) {
        const r = receiptFor(p, LEVEL_OF_BAND[band], school);
        const town = allocate(s, "auto", band, 1, school).goods;
        if (!isDeepStrictEqual(r.goods, town) || !r.approx) {
          all = false;
          console.log(`        ${short} band ${band} ${school}: ${show(r.goods)} vs ${show(town)} approx ${r.approx}`);
        }
      }
  }
  check(all, "on auto, the first pass matches allocate(s, 'auto', band, 1, school) at every band and school, flagged approximate");
}

// ── Carts: the manifest stated is the cart paid ──
console.log("carts");
{
  // Statistics: a 6-day streak, not yet answered today, three cards due, level 9.
  const f0 = fd({ streak: 6, bestStreak: 6, dueRemaining: 3 });
  const s = newTown(4250, 12);
  const p = pulseOf(s, at([f0]), 1);
  const cart = p.carts.find((c) => c.fieldId === "stat")!;
  check(!!cart && cart.streak === 7 && cart.rarity === "Rare" && !cart.done, `a Field on a 6-day streak, unanswered today, promises the cart of its 7th day (${cart?.rarity}, streak ${cart?.streak})`);
  const answered = pulseOf(s, at([fd({ streak: 7, bestStreak: 7, dueRemaining: 2, passed: [1, 0, 0, 0] })]), 1).carts[0];
  check(answered.streak === 7, "once the Field has been answered today, the streak it reads is the one the cart rolls on");
  // Clear it with four right answers: the town pays exactly the manifest at four.
  const promised = cartAt(cart, 4)!.goods;
  const t = newTown(4250, 12);
  knowledgeOf(t);
  const before = { ...t.res };
  knowledgeHourly(t, at([fd({ streak: 7, bestStreak: 7, dueRemaining: 0, reviewedToday: 4, complete: true })]));
  const paid: Goods = {};
  for (const k of Object.keys(t.res) as ResourceKey[]) if (t.res[k] !== before[k] && k !== "tools") paid[k] = t.res[k] - before[k];
  const tools = t.res.tools - before.tools;
  const promisedRes = Object.fromEntries(Object.entries(promised).filter(([k]) => !k.startsWith("tool:")));
  const promisedTools = Object.entries(promised).filter(([k]) => k.startsWith("tool:")).reduce((a, [, v]) => a + v, 0);
  check(isDeepStrictEqual(paid, promisedRes) && tools === promisedTools, `cleared with four right answers, the town pays the manifest stated for four (${show(promised)}; paid ${show(paid)} and ${tools} tools)`);
  check(cartAt(cart, 0) === null && cartAt(cart, 9)!.from === 9 && Object.keys(cartAt(cart, 9)!.goods).length >= Object.keys(cartAt(cart, 1)!.goods).length - 1, "no cart before the first right answer; more rolls at nine");
  const done = pulseOf(t, at([fd({ streak: 7, bestStreak: 7, dueRemaining: 0, reviewedToday: 4, complete: true })]), 1).carts[0];
  check(!!done && done.done && done.manifest.length === 0, "a cart already paid today is listed as done, with nothing more to promise");
}

// ── The pulse whole: round trip and size ──
console.log("round trip");
{
  const s = newTown(4260, 12);
  const names = ["Behavioural Economics and Decision Science", "Human Physiology and Clinical Medicine", "Philosophy of Mind and Personal Ethics"];
  const fields = Array.from({ length: 14 }, (_, i) =>
    fd({ id: `field-${i}-cjld2cjxh0000qzrmn831i7rn`, name: `${names[i % 3]} ${i}`, school: (["commerce", "science", "mind"] as School[])[i % 3], level: 9 + i, dueRemaining: 14 - i, overdue: i % 4, streak: [0, 3, 7, 14, 30][i % 5], bestStreak: 30 }),
  );
  knowledgeHourly(s, at(fields));
  const before = JSON.stringify(s.knowledge);
  const p = pulseOf(s, at(fields), 1_700_000_000_000);
  check(JSON.stringify(s.knowledge) === before, "pulseOf changes nothing in the town");
  check(p.reqs.length === 2 && p.carts.length === 12, `the pulse carries ${p.reqs.length} requisitions and ${p.carts.length} carts (the twelve Fields with most due)`);
  const json = JSON.stringify(p);
  check(isDeepStrictEqual(JSON.parse(json), p), "the pulse round-trips through JSON unchanged");
  check(isDeepStrictEqual(parsePulse(json), p), "parsePulse reads back what pulseOf wrote");
  check(bytes(json) < PULSE_MAX_BYTES && bytes(json) < 8 * 1024, `and it is under 8 KB (${bytes(json)} bytes)`);
  check(fitPulse(p) === json, "fitPulse leaves a pulse that fits alone");
  check(p.reqs.every((r) => r.got === 0 && !r.done) && p.carts.every((c) => c.manifest.length === 3), "nothing answered yet: requisitions at 0, each cart with its three roll steps");

  // Far too many long Fields: the writer drops the least-due carts until it fits.
  const huge: TownPulse = { ...p, carts: Array.from({ length: 40 }, (_, i) => ({ ...p.carts[i % p.carts.length], fieldId: `x${i}`, field: `${"Ω".repeat(60)} ${i}` })) };
  const fit = fitPulse(huge);
  const back = fit ? parsePulse(fit) : null;
  check(!!back && bytes(fit!) < PULSE_MAX_BYTES && back.carts.length < 40 && back.carts[0].fieldId === "x0", `forty carts with long names are trimmed to ${back?.carts.length} to stay under 8 KB (${fit ? bytes(fit) : 0} bytes)`);
}

// ── Reading: only a pulse of this version ──
console.log("reading");
{
  const p = pulseOf(newTown(4270, 12), at([fd({ dueRemaining: 2 })]), 1);
  const json = JSON.stringify(p);
  check(parsePulse(null) === null && parsePulse("") === null && parsePulse("{") === null && parsePulse("[]") === null, "no pulse, or garbage: null");
  check(parsePulse(JSON.stringify({ ...p, v: 2 })) === null, "another version: null");
  check(parsePulse(JSON.stringify({ ...p, town: null })) === null, "a pulse with no town: null");
  const bad = JSON.parse(json);
  bad.reqs = [{ fieldId: 3 }, ...bad.reqs];
  bad.carts = [{ field: "x" }, ...bad.carts];
  const read = parsePulse(JSON.stringify(bad));
  check(!!read && read.reqs.length === p.reqs.length && read.carts.length === p.carts.length, "a malformed requisition or cart is dropped, the rest kept");
}

// ── What the review app has seen that the town has not ──
console.log("since");
{
  const s = newTown(4280, 12);
  const fields = [fd({ dueRemaining: 5, overdue: 2 }), fd({ id: "phil", name: "Philosophy", school: "mind", dueRemaining: 3 })];
  knowledgeHourly(s, at(fields));
  const p = pulseOf(s, at(fields), 1);
  const req = p.reqs.find((r) => r.fieldId === "stat")!;
  const since = { day, seen: p.seen, f: { stat: [3, 1] as [number, number] } };
  const m = withSince(p, since);
  const mr = m.reqs.find((r) => r.fieldId === "stat")!;
  const mc = m.carts.find((c) => c.fieldId === "stat")!;
  check(!!req && mr.got === Math.min(req.need, 3) && mc.passes === 3 && mc.misses === 1, `three right answers here count toward Statistics' requisition (${mr.got}/${mr.need}) and its cart`);
  check(withSince(p, { ...since, seen: p.seen + 4 }) === p && withSince(p, { ...since, day: "2026-03-04" }) === p, "once the town has read them (its count moved), or on another day, they are not counted twice");
}

// ── A finished run ──
console.log("the recap");
{
  const s = newTown(4290, 12);
  const fields = [fd({ dueRemaining: 3, overdue: 1, streak: 3, bestStreak: 3 }), fd({ id: "phil", name: "Philosophy", school: "mind", dueRemaining: 2 })];
  knowledgeHourly(s, at(fields));
  const p = pulseOf(s, at(fields), 1);
  const req = p.reqs.find((r) => r.fieldId === "stat")!;
  const three = { passes: 3, misses: 0, bands: [3, 0, 0, 0] as [number, number, number, number] };
  const r = runTown(p, { stat: three }, {}, false, { stat: 3, phil: 2 });
  check(r.carts.length === 1 && r.carts[0].field === "Statistics" && isDeepStrictEqual(r.carts[0].goods, cartAt(p.carts.find((c) => c.fieldId === "stat")!, 3)!.goods), `all three due answered right: Statistics cleared, its ${r.carts[0]?.rarity} cart stated (${show(r.carts[0]?.goods)})`);
  check(r.reqs.length === 1 && r.reqs[0].need === req.need && req.need === 3, `and its requisition of ${req.need} is filled`);
  const mixed = runTown(p, { stat: { passes: 1, misses: 2, bands: [1, 0, 0, 0] } }, {}, false, { stat: 3 });
  check(mixed.carts.length === 0 && mixed.reqs.length === 0, "one right and two wrong: every card answered, but not cleared, and the requisition still open");
  const partial = runTown(p, { stat: { passes: 2, misses: 0, bands: [2, 0, 0, 0] } }, {}, false, { stat: 3 });
  check(partial.carts.length === 0, "two of three answered: no cart yet");
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
