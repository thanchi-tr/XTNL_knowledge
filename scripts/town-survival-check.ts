/**
 * The survival systems' golden scenarios (docs/town-survival-systems.md §10).
 * Each must land inside its band. Exits non-zero if any does not.
 *
 * Run with `npx tsx scripts/town-survival-check.ts`.
 */
import { newTown, makeVillager, makeStructure, clock, byId } from "../src/lib/town/sim/state";
import { advance, type SimContext } from "../src/lib/town/sim/tick";
import { stepCombat } from "../src/lib/town/sim/combat";
import { profileFor, type TownInput } from "../src/lib/town/rules";
import { FOG } from "../src/lib/town/sim/vision";
import { rng, wallMeta, wallMaxHp, idx } from "../src/lib/town/sim/world";
import { newBody, stepBody, clothesOf, type Env, type Place } from "../src/lib/town/sim/body";
import { stepZones, zoneOf, ppm, isZone, type Occ } from "../src/lib/town/sim/zones";
import type { Air } from "../src/lib/town/sim/weather";
import { kAt, spoilStep, storesHourly, storesOf } from "../src/lib/town/sim/stores";
import { aFloor, aggroOf, channelAggro, noteLoss, rho, launchWave } from "../src/lib/town/sim/aggro";
import { pandolf, driftStep, wakeStep, wakeState, TILE_KM } from "../src/lib/town/sim/wilds";
import { resolveFrame } from "../src/lib/town/sim/frame";
import { flowField, groupOf, downhill, fieldAt } from "../src/lib/town/sim/breach";
import { addCorpse, enactDecree, factionOf } from "../src/lib/town/sim/psyche";
import { Overlay, type Body, type GameState, type Villager } from "../src/lib/town/sim/types";
import { knowledgeHourly, kmod, rollDrop } from "../src/lib/town/sim/knowledge";
import { PRESSURE_CAP, TACTICS, exp3Update, fitness, nemesisOf, neglect, pickTactic, scoreWave, stalkOrStrike, tacticOdds } from "../src/lib/town/sim/nemesis";
import type { FieldDaily } from "../src/lib/town/rules";

FOG.rules = false;
const input: TownInput = {
  schools: { commerce: 14, science: 16, mind: 12 },
  scores: { PHYSICAL: 40, FAITH: 30, CREATIVITY: 30, STATISTIC: 30, STUBBORNNESS: 40 },
  streakDays: 12, equippedAttributes: ["PHYSICAL", "FAITH"], peakDepth: 6, reviewsToday: 10,
  newIdeasThisWeek: { commerce: 2, science: 2, mind: 2 }, emblems: [], domainPeak: 6, domainSum: 40, dueRemaining: 0, newIdeasToday: 2,
};
const ctx: SimContext = { profile: profileFor(input), input };
let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${what}`);
  if (!ok) failures++;
};
const inBand = (x: number, lo: number, hi: number) => x >= lo && x <= hi;
const noHazard = () => 0.999999;
const standing: Place = { x: 0, y: 0, tier: 0, walking: false, asleep: false, working: false };
const dummy = { id: 1, name: "Test", house: null, role: "idle", rank: 0, xp: 0, health: 100, happy: 70, work: null } as Villager;

// ── T: the body ──────────────────────────────────────────
console.log("T — core temperature");
{
  const run = (W: number) => {
    const b: Body = newBody();
    b.W = W;
    const env: Env = { T: -20, v: 8, RH: 0.9, P: 0, rad: 0, co: 0, snowCm: 0, outdoors: true };
    const cl = { clo: 0.5, hands: 0.8, feet: 1.2, wp: 0 };
    const at: Record<number, number> = {};
    for (let m = 1; m <= 600; m++) {
      if (W === 1) b.W = 1;
      const r = stepBody(b, dummy, env, standing, cl, noHazard, 60, 0, 0);
      for (const th of [35, 32, 24]) if (b.Tc < th && at[th] === undefined) at[th] = m;
      if (r.died) {
        at[24] ??= m;
        break;
      }
    }
    return at;
  };
  const dry = run(0);
  check(inBand(dry[35], 25, 35) && inBand(dry[32], 115, 150) && inBand(dry[24] / 60, 3.5, 4.3), `T1 light clothes, −20 °C, 8 m/s: 35 °C at ${dry[35]} min, 32 °C at ${dry[32]} min, dead at ${(dry[24] / 60).toFixed(1)} h`);
  const wet = run(1);
  check(inBand(wet[32], 60, 80) && inBand(wet[24] / 60, 2.1, 2.7), `T2 soaked: 32 °C at ${wet[32]} min, dead at ${(wet[24] / 60).toFixed(1)} h`);

  const env: Env = { T: -10, v: 3, RH: 0.8, P: 0, rad: 0, co: 0, snowCm: 0, outdoors: true };
  const labour = (noStrip: boolean) => {
    const b = newBody();
    const work: Place = { x: 0, y: 0, tier: 250, walking: true, asleep: false, working: true, noStrip };
    let lo = 99, hi = 0;
    for (let m = 0; m < 240; m++) {
      stepBody(b, dummy, env, work, { clo: 2.5, hands: 1.5, feet: 1.2, wp: 0.3 }, noHazard, 60, 0, 0);
      if (m > 60) {
        lo = Math.min(lo, b.Tc);
        hi = Math.max(hi, b.Tc);
      }
    }
    return { lo, hi, W: b.W };
  };
  const kept = labour(true);
  check(kept.lo >= 36.9 && kept.hi <= 37.7 && inBand(kept.W, 0.05, 0.2), `T3 labourer keeping 2.5 clo on, −10 °C, 4 h: core ${kept.lo.toFixed(2)}–${kept.hi.toFixed(2)} °C, clothes ${(kept.W * 100).toFixed(0)}% wet with sweat`);
  const stripped = labour(false);
  check(stripped.W < kept.W && stripped.hi <= 37.3, `T3 … stripping a layer for the work keeps them drier (${(stripped.W * 100).toFixed(0)}% wet)`);

  const h = newBody();
  let fb2 = -1;
  for (let m = 1; m <= 200; m++) {
    h.Tc = 35.5;
    stepBody(h, dummy, env, standing, { clo: 2.2, hands: 0, feet: 1.2, wp: 0.3 }, noHazard, 60, 0, 0);
    if (h.frostH >= 180 && fb2 < 0) fb2 = m;
  }
  check(inBand(fb2, 60, 80), `T4 bare hand at −10 °C, core 35.5: frostbite II at ${fb2} min`);
}

// ── Z: zones, fuels, carbon monoxide ─────────────────────
console.log("Z — shelter and fuel");
const zoneRun = (hearth: "chimney" | "stove" | "brazier", opts: { T: number; v: number; hours: number; heat: number; people: number; asleep: boolean; mc?: number; fuel?: "wood" | "charcoal"; seed?: number }) => {
  const s = newTown(opts.seed ?? 3, 20);
  s.structures = [];
  const house = makeStructure(s, "house", 60, 60, true);
  house.level = 5; // a House: hewn log walls, thatch
  zoneOf(house, opts.T);
  house.zone!.T = opts.heat;
  house.zone!.Ts = opts.heat;
  house.hearth = hearth;
  s.policy = { heat: opts.heat, ration: 1, freshSoil: false, coalFirst: false, shift: 14 };
  s.stores!.woodMC = opts.mc ?? 0.2;
  s.res.wood = 1e6;
  s.res.coal = 0;
  s.res.peat = 0;
  s.res.charcoal = opts.fuel === "charcoal" ? 1e6 : 0;
  if (opts.fuel === "charcoal") s.res.wood = 0;
  const a: Air = { T: opts.T, v: opts.v, P: 0, snowing: false, RH: 0.8, vis: 3000, regime: "calm", Tg: 5, snowDepth: 0 };
  const occ = new Map<number, Occ>([[house.id, opts.asleep ? { awake: 0, asleep: opts.people } : { awake: opts.people, asleep: 0 }]]);
  const wood0 = s.res.wood;
  const coal0 = s.res.charcoal;
  const trace: { h: number; T: number; co: number }[] = [];
  for (let step = 0; step < opts.hours * 6; step++) {
    s.time += 10;
    stepZones(s, 10, a, occ);
    if (step % 6 === 5) trace.push({ h: (step + 1) / 6, T: house.zone!.T, co: house.zone!.co });
  }
  return { s, house, woodKg: (wood0 - s.res.wood) * 10, charKg: (coal0 - s.res.charcoal) * 10, trace };
};
{
  const ch = zoneRun("chimney", { T: -10, v: 3, hours: 48, heat: 10, people: 4, asleep: true });
  check(inBand(ch.woodKg / 2, 100, 130), `Z1 log house, chimney, −10 °C, holding 10 °C: ${(ch.woodKg / 2).toFixed(0)} kg of seasoned oak a game day (room ${ch.house.zone!.T.toFixed(1)} °C)`);
  const st = zoneRun("stove", { T: -10, v: 3, hours: 48, heat: 10, people: 4, asleep: true });
  const lastDay = st.trace.slice(24).map((x) => x.T);
  check(inBand(st.woodKg / 2, 30, 40) && Math.min(...lastDay) > 7, `Z2 same house, masonry stove: ${(st.woodKg / 2).toFixed(0)} kg a game day (room ${Math.min(...lastDay).toFixed(1)}–${Math.max(...lastDay).toFixed(1)} °C)`);

  // Z3: a charcoal brazier in a sealed room, and two sleepers.
  const br = zoneRun("brazier", { T: -10, v: 0, hours: 8, heat: 30, people: 2, asleep: true, fuel: "charcoal" });
  const over = br.trace.find((x) => ppm(x.co) > 800);
  const body = newBody();
  const rr = rng(99);
  let died = -1;
  for (let m = 0; m < 8 * 60; m++) {
    const tr = br.trace[Math.min(br.trace.length - 1, Math.floor(m / 60))];
    const env: Env = { T: tr.T, v: 0.2, RH: 0.6, P: 0, rad: 0, co: tr.co, snowCm: 0, outdoors: false };
    const r = stepBody(body, dummy, env, { ...standing, asleep: true }, { clo: 2.2, hands: 1.5, feet: 1.2, wp: 0.3 }, rr, 60, 1, 0);
    if (r.died) {
      died = m;
      break;
    }
  }
  check(!!over && over.h <= 3 && died > 0 && died <= 8 * 60, `Z3 charcoal brazier, sealed room: ${over ? `${Math.round(ppm(over.co))} ppm by hour ${over.h}` : "never over 800 ppm"}; sleeper ${died > 0 ? `dead at ${(died / 60).toFixed(1)} h (COHb ${body.cohb.toFixed(0)}%)` : `alive (COHb ${body.cohb.toFixed(0)}%)`}`);

  // F1: green wood all winter in a chimney.
  let fires = 0;
  let creo = 0;
  for (let seed = 0; seed < 50; seed++) {
    const g = zoneRun("chimney", { T: -14, v: 5, hours: 240, heat: 12, people: 4, asleep: true, mc: 0.5, seed: 100 + seed });
    const burnt = g.s.log.some((l) => /Chimney fire/.test(l.text));
    if (burnt) fires++;
    if (seed === 0) creo = g.house.zone!.creo + (burnt ? 0 : 0);
    void seed;
  }
  const clean = zoneRun("chimney", { T: -14, v: 5, hours: 240, heat: 12, people: 4, asleep: true, mc: 0.5 });
  const soot = clean.house.zone!.creo + (clean.s.log.some((l) => /Chimney fire/.test(l.text)) ? 99 : 0);
  void creo;
  check(inBand(soot, 4.5, 6.5) || soot >= 99, `F1 green wood all winter: ${soot >= 99 ? "the flue caught before the end" : `${soot.toFixed(1)} kg of creosote in the flue`}`);
  check(inBand(fires, 15, 30), `F1 … 15–30 of 50 winters see a chimney fire (${fires})`);
}

// ── S: spoilage ──────────────────────────────────────────
console.log("S — spoilage");
{
  const hoursTo = (key: "meat" | "potato", T: number) => {
    let total = 100;
    let spoiled = 0;
    for (let h = 1; h < 24 * 400; h++) {
      const k1 = kAt(key, T, 0.7, 0, 1) / 24;
      const n = spoilStep(total, spoiled, k1);
      total = n.total;
      spoiled = n.spoiled;
      if ((total - spoiled) / 100 < 0.6) return h;
    }
    return Infinity;
  };
  const m20 = hoursTo("meat", 20);
  const m5 = hoursTo("meat", 5);
  check(inBand(m20, 3, 5) && inBand(m5, 10, 16), `S1 fresh meat good for ${m20} h at 20 °C, ${m5} h in a cellar at 5 °C`);
  const p5 = hoursTo("potato", 5);
  check(p5 / 24 > 20, `S2 potatoes in a root cellar: ${(p5 / 24).toFixed(0)} game days`);
  const s = newTown(5, 20);
  const st = storesOf(s);
  s.res.potato = 100;
  st.spoiled.potato = 0;
  st.frozen = true;
  storesHourly(s, 2);
  st.frozen = false;
  storesHourly(s, -5);
  storesHourly(s, 2);
  const q = (s.res.potato - (st.spoiled.potato ?? 0)) / s.res.potato;
  check(1 - q >= 0.08 && st.kMul >= 1.69 * Math.exp(-2 / 120), `S3 two thaws: ${((1 - q) * 100).toFixed(1)}% of the cache bruised, decay ×${st.kMul.toFixed(2)}`);
}

// ── A: aggro and the director ────────────────────────────
console.log("A — the land's answer");
const fightAll = (s: GameState) => {
  let guard = 0;
  while (s.raid?.phase === "fighting" && guard++ < 60000) stepCombat(s, 0.05);
};
{
  const s = newTown(21, 20);
  while (s.villagers.length < 12) makeVillager(s, s.structures.find((x) => x.type === "house")!.id);
  s.res.meals = 2000;
  s.res.wood = 3000;
  // Idle, but not defenceless: a tower by the hall and four posted spearmen.
  const hall = s.structures.find((x) => x.type === "townhall")!;
  const tower = makeStructure(s, "watchtower", hall.x + hall.w + 2, hall.y, true);
  tower.level = 8;
  makeStructure(s, "lamppost", hall.x + hall.w + 1, hall.y + 4, true);
  for (let i = 0; i < 6; i++) {
    const g = makeVillager(s, s.structures.find((x) => x.type === "house")!.id, "infantry");
    g.rank = 6;
    g.guard = tower.id;
  }
  const totals: number[] = [];
  const perm: number[] = [];
  let lastWave = aggroOf(s).lastWaveAt;
  const waveDays: number[] = [];
  for (let d = 0; d < 20; d++) {
    for (let h = 0; h < 24; h++) {
      advance(s, 60, ctx);
      fightAll(s);
      if (aggroOf(s).lastWaveAt !== lastWave) {
        lastWave = aggroOf(s).lastWaveAt;
        waveDays.push(d);
      }
      if (s.fallen) break;
    }
    totals.push(channelAggro(s).reduce((a, b) => a + b, 0));
    perm.push(aggroOf(s).scar.reduce((a, b) => a + b, 0) + 4 * aFloor(s.time / 1440));
    if (s.fallen) break;
  }
  // The permanent part (scar and floor) never falls; the whole rises over the run.
  const rising = perm.every((t, i) => i === 0 || t >= perm[i - 1] - 1e-6) && totals[totals.length - 1] > totals[0];
  const late = waveDays.filter((d) => d >= 6).length;
  const span = Math.max(1, Math.min(totals.length, 20) - 6);
  check(rising && late >= span / 2, `A1 an idle town of twelve: the scar only grows (${perm[0].toFixed(0)} → ${perm[perm.length - 1].toFixed(0)}), aggro ${totals[0].toFixed(0)} → ${totals[totals.length - 1].toFixed(0)}; ${late} waves from day 6 over ${span} days`);

  const quiet = newTown(23, 20);
  const loud = newTown(23, 20);
  for (const t of [quiet, loud]) {
    while (t.villagers.length < 10) makeVillager(t, t.structures.find((x) => x.type === "house")!.id);
    t.res.meals = 2000;
    t.nextRaidAt = 1e9;
  }
  const mine = makeStructure(loud, "mine", 70, 20, true);
  for (let i = 0; i < 2; i++) {
    const v = makeVillager(loud, loud.structures.find((x) => x.type === "house")!.id, "miner");
    v.rank = 3; // strong enough for a full day's hard work at the face (./work)
    v.work = mine.id;
    mine.workers.push(v.id);
  }
  const quietCtl = makeVillager(quiet, quiet.structures.find((x) => x.type === "house")!.id);
  makeVillager(quiet, quietCtl.house);
  for (let h = 0; h < 10 * 24; h++) {
    advance(quiet, 60, ctx);
    advance(loud, 60, ctx);
  }
  const bq = aggroOf(quiet).hot[1] + aggroOf(quiet).scar[1];
  const bl = aggroOf(loud).hot[1] + aggroOf(loud).scar[1];
  check(bl >= 2 * Math.max(1e-6, bq), `A2 two extra miners for ten days: burrower aggro ${bl.toFixed(1)} against ${bq.toFixed(1)}`);

  const t = newTown(25, 20);
  while (t.villagers.length < 12) makeVillager(t, t.structures.find((x) => x.type === "house")!.id);
  t.time += 4 * 24 * 60;
  const before = rho(t);
  const n = Math.ceil(0.3 * Math.max(4, t.villagers.length));
  for (let i = 0; i < n; i++) noteLoss(t);
  const after = rho(t);
  t.time += 5 * 24 * 60;
  aggroOf(t).losses = aggroOf(t).losses.filter((x) => t.time - x <= 3 * 1440);
  const later = rho(t);
  check(before - after >= 0.15 - 1e-9 && later > before, `A3 a 30% loss eases the next wave (ρ ${before.toFixed(2)} → ${after.toFixed(2)}), and five days on it is harder than before (${later.toFixed(2)})`);
}

// ── X: expeditions ───────────────────────────────────────
console.log("X — expeditions");
{
  const M = pandolf(25, 1.2, 1.2);
  const kcal = ((M * 8 + 80 * 16) * 3600) / 4184;
  check(inBand(M, 350, 400) && inBand(kcal, 3600, 4800), `X1 25 kg on grass at 1.2 m/s: ${M.toFixed(0)} W, ${kcal.toFixed(0)} kcal a day of marching`);
  let lost = 0;
  for (let seed = 0; seed < 100; seed++) {
    const r = rng(seed * 7 + 1);
    const sc = { psi: 0, err: 0 };
    const tiles = 1 / TILE_KM;
    let gone = false;
    for (let k = 0; k < 20 && !gone; k++) gone = driftStep(sc, tiles / 20, 25, 0.6, false, 1, r);
    if (gone) lost++;
  }
  check(lost >= 70, `X2 a kilometre through a blizzard with no landmark: lost in ${lost} of 100`);
  const node = { kind: "bogiron" as const, wake: 0 };
  let stirring = -1;
  let awake = -1;
  for (let d = 1; d <= 8; d++) {
    wakeStep(node, 40, 10);
    if (node.wake >= 50 && stirring < 0) stirring = d;
    if (node.wake >= 100 && awake < 0) awake = d;
    node.wake = Math.max(0, node.wake - 3);
  }
  check(stirring > 0 && stirring <= 2 && inBand(awake, 3, 6), `X3 40 kg of bog iron a day: stirring on day ${stirring}, awake on day ${awake} (${wakeState(node.wake, awake > 0)})`);
}

// ── B: frames and breaches ───────────────────────────────
console.log("B — frames and breaches");
{
  const s = newTown(31, 20);
  const h = makeStructure(s, "house", 70, 60, true);
  h.level = 5;
  h.roofKind = "turf";
  h.roofSnow = 0.8 * 250;
  const dry: Air = { T: -8, v: 3, P: 0, snowing: false, RH: 0.8, vis: 3000, regime: "calm", Tg: 3, snowDepth: 0.5 };
  const held = resolveFrame(s, h, dry);
  s.weather!.thawUntil = s.time + 24 * 60;
  const thaw: Air = { ...dry, T: 3, regime: "thaw" };
  const res = s.structures.includes(h) ? resolveFrame(s, h, thaw) : { failed: 0, collapsed: 0 };
  check(held.failed === 0 && res.failed > 0 && res.collapsed >= 0.3, `B1 turf roof under 0.8 m of snow: holds on frozen ground (${held.failed} posts fail); at the thaw ${res.failed} posts fail, ${Math.round(res.collapsed * 100)}% of the roof down`);

  // B2: a granary behind a stout wall ring. On the west, a gate under two towers: the kill-box.
  // On the north, one stretch of old, thin wall. The beasts come from the north-west.
  let wall = 0;
  let total = 0;
  for (let seed = 0; seed < 10; seed++) {
    const g = newTown(41 + seed, 20);
    g.structures = g.structures.filter((x) => x.type === "townhall");
    const store = makeStructure(g, "storehouse", 90, 60, true);
    const gate = idx(86, 62);
    for (let y = 56; y <= 67; y++) for (let x = 86; x <= 99; x++) {
      if (!(x === 86 || x === 99 || y === 56 || y === 67)) continue;
      const i = idx(x, y);
      const thin = y === 56 && x >= 90 && x <= 95;
      g.map.overlay[i] = i === gate ? Overlay.Gate : Overlay.Wall;
      const lvl = i === gate ? 1 : thin ? 1 : 10;
      g.map.meta[i] = wallMeta(lvl, wallMaxHp(lvl, i === gate));
    }
    for (const [x, y] of [[81, 61], [81, 65]]) {
      const t = makeStructure(g, "watchtower", x, y, true);
      t.level = 6 + (seed % 3);
    }
    const f = flowField(g, store, groupOf([{ kind: "troll", level: 3 + seed, count: 3 + seed }]), "K");
    let x = 72.5;
    let y = 44.5;
    let crossed: "gate" | "wall" | null = null;
    for (let k = 0; k < 300 && !crossed; k++) {
      const next = downhill(f, x, y);
      if (!next) break;
      [x, y] = next;
      const o = g.map.overlay[idx(Math.floor(x), Math.floor(y))];
      if (o === Overlay.Gate) crossed = "gate";
      else if (o === Overlay.Wall) crossed = "wall";
    }
    if (crossed) total++;
    if (crossed === "wall") wall++;
    void fieldAt;
  }
  check(total > 0 && wall / total >= 0.7, `B2 siege beasts before a kill-box gate: ${wall} of ${total} break the wall instead`);
}

// ── P: minds ─────────────────────────────────────────────
console.log("P — minds");
{
  const make = (seed: number, dead: boolean) => {
    const s = newTown(seed, 20);
    while (s.villagers.length < 12) makeVillager(s, s.structures.find((x) => x.type === "house")!.id);
    s.res.meals = 1000;
    s.res.wood = 1000;
    s.nextRaidAt = 1e9;
    s.mood = 70;
    const hall = s.structures.find((x) => x.type === "townhall")!;
    if (dead) for (let i = 0; i < 5; i++) addCorpse(s, `Body ${i}`, hall.x + 3, hall.y + hall.h + 1);
    // Nobody idle to bury them.
    for (const v of s.villagers) if (v.role === "idle") v.role = "farmhand";
    return s;
  };
  const a = make(51, true);
  const b = make(51, false);
  let breaks = 0;
  for (let h = 0; h < 48; h++) {
    advance(a, 60, ctx);
    advance(b, 60, ctx);
  }
  const drop = b.mood - a.mood;
  for (let seed = 0; seed < 40; seed++) {
    const t = make(60 + seed, true);
    for (let h = 0; h < 48; h++) advance(t, 60, ctx);
    if (t.log.some((l) => /breaks down|eats .* meals alone|refuses/.test(l.text))) breaks++;
  }
  // Felt, if less than before the needs (sim/needs): a town whose other needs are met holds its minds up.
  check(inBand(drop, 5, 30) && breaks >= 1, `P1 five unburied dead beside the hall for two days: Hope ${drop.toFixed(1)} lower; minor breaks in ${breaks} of 40 towns`);

  const s = make(71, true);
  for (const v of s.villagers) v.fac = s.villagers.indexOf(v) % 2 === 0 ? 2 : 0;
  s.res.meals = 1;
  const faithShare = s.villagers.filter((v) => factionOf(v) === 2).length / s.villagers.length;
  const err = enactDecree(s, "protein");
  check(!err && faithShare > 0.3 && s.society?.ultimatum?.faction === 2, `P2 emergency protein: the Faith faction (${Math.round(faithShare * 100)}%) makes its demand at once${err ? ` — ${err}` : ""}`);
}

// ── K: study into the town ───────────────────────────────
console.log("K — study into the town");
{
  const f = (o: Partial<FieldDaily>): FieldDaily => ({
    id: "fx", name: "Physiology", school: "science", level: 6, attrs: ["PHYSICAL", "STUBBORNNESS"], ideasToday: 0, ideasWeek: 0,
    reviewedToday: 0, dueRemaining: 0, overdue: 0, streak: 0, bestStreak: 0, complete: false, ...o,
  });
  const base = { ...input, day: "2026-02-02" };
  const s = newTown(81, 20);
  knowledgeHourly(s, { ...base, fields: [f({ ideasToday: 3 })] });
  const phys = kmod(s, "PHYSICAL");
  const stub = kmod(s, "STUBBORNNESS");
  check(Math.abs(phys - 0.3 * (1 - Math.exp(-1))) < 1e-6 && Math.abs(stub - 0.3 * (1 - Math.exp(-0.5))) < 1e-6, `K1 three ideas in a Physical/Stubbornness Field: strong backs +${(phys * 100).toFixed(0)}%, stubborn timbers +${(stub * 100).toFixed(0)}%`);
  knowledgeHourly(s, { ...base, fields: [f({ ideasToday: 30 })] });
  check(kmod(s, "PHYSICAL") <= 0.3 + 1e-9 && kmod(s, "PHYSICAL") > 0.29, `K1 … thirty saturate at the cap (+${(kmod(s, "PHYSICAL") * 100).toFixed(0)}%), not ten times more`);

  const tiers = [0, 3, 7, 14, 30].map((streak) => rollDrop(f({ streak, reviewedToday: 9, passed: [9, 0, 0, 0], complete: true }), "2026-02-02"));
  check(tiers.map((t) => t.tier).join() === "0,1,2,3,4", `K2 streaks of 0, 3, 7, 14 and 30 days bring common, uncommon, rare, epic and legendary carts`);
  const legendary = tiers[4];
  const rare = ["diamond", "mithril", "gold", "platinum", "formula", "gunpowder"].some((k) => (legendary.res as Record<string, number>)[k]) || Object.keys(legendary.items).length > 0 || legendary.tools.includes("crucible");
  const common = tiers[0];
  const plain = Object.keys(common.res).every((k) => ["wood", "stone", "meals", "potato", "coin"].includes(k));
  check(rare && plain, `K2 … contents fixed by the day and the Field, stated before study: a new streak's cart holds ${Object.entries(common.res).map(([k, n]) => `${n} ${k}`).join(", ")}; a month-long one's ${[...Object.entries(legendary.res).map(([k, n]) => `${n} ${k}`), ...Object.entries(legendary.items).map(([k, n]) => `${n} ${k}`), ...legendary.tools].join(", ")}`);

  const t = newTown(83, 20);
  const done = { ...base, fields: [f({ streak: 8, reviewedToday: 12, passed: [12, 0, 0, 0], complete: true })] };
  const silver0 = t.res.silver + t.res.ingots + t.res.planks + t.res.bricks + t.res.charcoal + t.res.fertiliser + (t.toolsPending?.length ?? 0);
  knowledgeHourly(t, done);
  const once = t.res.silver + t.res.ingots + t.res.planks + t.res.bricks + t.res.charcoal + t.res.fertiliser + (t.toolsPending?.length ?? 0);
  knowledgeHourly(t, done);
  const twice = t.res.silver + t.res.ingots + t.res.planks + t.res.bricks + t.res.charcoal + t.res.fertiliser + (t.toolsPending?.length ?? 0);
  check(once > silver0 && twice === once, `K3 a finished daily pays once a day (+${Math.round(once - silver0)} in rare goods), not once an hour`);

  const n = newTown(85, 20);
  knowledgeHourly(n, { ...base, reviewsToday: 0, dueRemaining: 30, fields: [f({ overdue: 25, dueRemaining: 30, bestStreak: 14 })] });
  const ng = neglect(n);
  check(kmod(n, "PHYSICAL") < 0 && ng.budget > 2 && ng.rho > 0.1 && n.log.some((l) => /banner/.test(l.text)), `K4 neglect: the Field's buff turns (${(kmod(n, "PHYSICAL") * 100).toFixed(0)}%), the land's budget ×${ng.budget.toFixed(2)}, its aim +${ng.rho.toFixed(2)}, and a lapsed streak's banner falls`);
}

// ── N: the nemesis ───────────────────────────────────────
console.log("N — the nemesis");
{
  const s = newTown(91, 20);
  const nm = nemesisOf(s);
  const r = rng(5);
  const flyers = TACTICS.indexOf("flyers");
  for (let k = 0; k < 80; k++) {
    const { tactic, p } = pickTactic(s, r);
    exp3Update(nm, TACTICS.indexOf(tactic), tactic === "flyers" ? 1 : 0.05, p);
  }
  const odds = tacticOdds(s);
  check(odds[flyers] > 0.5, `N1 EXP3 learns what works: after 80 waves where only fliers paid, it sends them ${(odds[flyers] * 100).toFixed(0)}% of the time`);

  const fit = fitness({ ranged: 0.05, walls: 60, coverage: 0.9, elite: 0, unlit: 0, foodDays: 1, fuelDays: 3, leverage: 0.2, hallWeak: 0, outdoors: 0 }, false, false);
  const best = TACTICS[fit.indexOf(Math.max(...fit))];
  const fit2 = fitness({ ranged: 0.95, walls: 0, coverage: 0.9, elite: 0, unlit: 0, foodDays: 1, fuelDays: 3, leverage: 0.2, hallWeak: 0, outdoors: 0 }, false, false);
  const best2 = TACTICS[fit2.indexOf(Math.max(...fit2))];
  check(best === "flyers" && best2 === "armoured", `N2 it counter-picks: walls and swords draw ${best}; a town of archers draws ${best2}`);

  const t = newTown(93, 20);
  nemesisOf(t).stalk = { since: t.time, best: 0, tactic: "night" };
  while (clock(t.time).hour !== 12) t.time += 60;
  const day = stalkOrStrike(t, rng(1));
  while (clock(t.time).hour !== 23) t.time += 60;
  const night = stalkOrStrike(t, rng(1));
  check(day === null && night === "night", `N3 a night wave waits for the dark: at noon it holds, at 23:00 it strikes`);

  const u = newTown(95, 20);
  const rho0 = rho(u);
  for (let k = 0; k < 3; k++) {
    nemesisOf(u).before = { pop: u.villagers.length, buildings: u.structures.length, food: 0, hallHp: u.structures[0].hp, tactic: "assault", p: 0.2 };
    scoreWave(u);
  }
  // It presses harder — but only so far: a strategist who keeps winning should keep standing (§19).
  check(nemesisOf(u).pressure >= PRESSURE_CAP - 1e-9 && rho(u) > rho0 + 0.1 && rho(u) <= rho0 + PRESSURE_CAP + 1e-9,
    `N4 three clean defences and it presses harder, but only so far: aim ${rho0.toFixed(2)} → ${rho(u).toFixed(2)} (pressure capped at ${PRESSURE_CAP})`);

  // N5: the answers work. The same flier wave on the same house: spearmen, then bowmen, posted beside it.
  const flierFight = (rank: number) => {
    const g = newTown(97, 20);
    const house = g.structures.find((x) => x.type === "house")!;
    const tower = makeStructure(g, "watchtower", house.x + house.w + 1, house.y, true);
    for (let k = 0; k < 4; k++) {
      const v = makeVillager(g, house.id, "infantry");
      v.rank = rank;
      v.guard = tower.id;
    }
    g.raid = { arrivesAt: g.time, party: [{ kind: "harpy", level: 2, count: 3 }], side: "west", target: house.id, phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1, archetype: "K" };
    let guard = 0;
    while (g.raid && guard++ < 20000) stepCombat(g, 0.05);
    const standing = g.structures.includes(house);
    const lost = 4 - g.villagers.filter((v) => v.role === "infantry").length;
    return { standing, lost };
  };
  const melee = flierFight(3);
  const bows = flierFight(5);
  check((bows.standing && !melee.standing) || bows.lost < melee.lost, `N5 bowmen against fliers: spearmen ${melee.standing ? "hold" : "lose"} the house with ${melee.lost} dead; bowmen ${bows.standing ? "hold" : "lose"} it with ${bows.lost} dead`);

  const hallFight = (guarded: boolean) => {
    const g = newTown(99, 20);
    const hall = g.structures.find((x) => x.type === "townhall")!;
    if (guarded) {
      const tw = makeStructure(g, "watchtower", hall.x - 5, hall.y + 2, true);
      tw.level = 4;
      for (let k = 0; k < 4; k++) {
        const v = makeVillager(g, null, "infantry");
        v.rank = 5;
        v.guard = tw.id;
      }
    }
    g.raid = { arrivesAt: g.time, party: [{ kind: "troll", level: 3, count: 2 }], side: "west", target: hall.id, phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1, archetype: "K" };
    let guard = 0;
    while (g.raid && guard++ < 20000) stepCombat(g, 0.05);
    // The hall falling is a looting now, not the end of a town this size: either counts as not holding.
    return !g.fallen && !g.hallFalls;
  };
  const bare = hallFight(false);
  const kept = hallFight(true);
  check(!bare && kept, `N5 a blow at the hall: unguarded it ${bare ? "holds" : "falls"}; with a tower and four bowmen beside it, it ${kept ? "holds" : "falls"}`);
}

void clock;
void byId;
void isZone;
void launchWave;
void clothesOf;
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
