/**
 * Runs the town simulation headlessly and reports what happened.
 *
 * The rules are only trustworthy if they can be watched without a canvas:
 * this founds a town, lets it run through the seasons with a scripted
 * player, forces raids, and prints the vital signs day by day. Run with
 * `npx tsx scripts/town-sim-check.ts`.
 */
import { newTown, clock, census, countedTroops } from "../src/lib/town/sim/state";
import { advance, scheduleRaid, type SimContext } from "../src/lib/town/sim/tick";
import { stepCombat } from "../src/lib/town/sim/combat";
import { fitHearth, sweepChimney, place, paint, hire, recruit, upgrade, assignGuard, stokeFire } from "../src/lib/town/sim/actions";
import { profileFor, type TownInput } from "../src/lib/town/rules";
import { rng, idx, checkPlacement, fuelCap, ringOf, unlitBuildings } from "../src/lib/town/sim/world";
import { MAP_W } from "../src/lib/town/sim/types";
import type { StructureType } from "../src/lib/town/sim/types";
import { FOG } from "../src/lib/town/sim/vision";
// These checks build wherever they need to; the fog has checks of its own.
FOG.rules = false;

const input: TownInput = {
  schools: { commerce: 14, science: 16, mind: 12 },
  scores: { PHYSICAL: 40, FAITH: 30, CREATIVITY: 30, STATISTIC: 30, STUBBORNNESS: 40 },
  streakDays: 12,
  equippedAttributes: ["PHYSICAL", "FAITH"],
  peakDepth: 6,
  reviewsToday: 10,
  newIdeasThisWeek: { commerce: 2, science: 2, mind: 2 },
  emblems: [],
  domainPeak: 4,
  domainSum: 20,
  dueRemaining: 0,
  newIdeasToday: 2,
};
const ctx: SimContext = { profile: profileFor(input), input };
const s = newTown(Number(process.env.TOWN_SEED ?? 42), 20);

function tryPlace(type: StructureType, x0: number, y0: number) {
  for (let y = y0; y < y0 + 12; y++) for (let x = x0; x < x0 + 16; x++) {
    if (checkPlacement(s, type, x, y).ok) {
      const err = place(s, ctx, type, x, y);
      if (!err) return `${type} @${x},${y}`;
    }
  }
  return `${type}: no spot`;
}

console.log("founded:", s.structures.map((st) => st.type).join(", "));
console.log("villagers:", s.villagers.length, "beds:", s.structures.filter((x) => x.type === "house").length);

// Scripted player: a few builds, then let time pass.
s.res.wood += 800;
s.res.stone += 800;
s.res.coin += 400;
s.res.iron += 80;
console.log(tryPlace("house", 44, 38), "|", tryPlace("house", 50, 38), "|", tryPlace("barracks", 46, 42), "|", tryPlace("pitfire", 52, 42), "|", tryPlace("watchtower", 60, 42), "|", tryPlace("mine", 52, 20));
// Towers watch every side of town now: a raid only meets guards inside a tower's circle.
console.log(tryPlace("watchtower", 22, 40), "|", tryPlace("watchtower", 40, 18));
// Room to put food by for winter.
console.log("storehouse:", tryPlace("storehouse", 56, 34), tryPlace("storehouse", 62, 30));
// Pave a spine so the new buildings connect.
paint(s, "pavement", Array.from({ length: 30 }, (_, i) => idx(49, 30 + i)).concat(Array.from({ length: 30 }, (_, i) => idx(45 + i, 41))));
// ice for summer, fuel for winter
s.res.coal += 200;

const r = rng(9);
let lastDay = 0;
for (let step = 0; step < 24 * 60 && !s.fallen; step++) {
  advance(s, 60, ctx);
  // a sensible player puts chimneys in the homes as soon as they can, and keeps the flues swept
  for (const h of s.structures.filter((x) => (x.type === "house" || x.type === "apartment") && !x.buildUntil && x.hearth === "open")) fitHearth(s, h.id, "chimney");
  for (const h of s.structures) if ((h.zone?.creo ?? 0) > 2) sweepChimney(s, h.id);
  // a sensible player lights what they build, before the dusk warning comes true
  for (const st of unlitBuildings(s)) {
    const t = ringOf(st.x, st.y, st.w, st.h).find((i) => checkPlacement(s, "lamppost", i % MAP_W, Math.floor(i / MAP_W)).ok);
    if (t !== undefined) place(s, ctx, "lamppost", t % MAP_W, Math.floor(t / MAP_W));
  }
  // post every troop to a tower with room — only posted troops defend
  for (const v of s.villagers) {
    if (!["infantry", "archer", "heavy", "wizard", "knight"].includes(v.role) || v.guard) continue;
    for (const t of s.structures.filter((x) => x.type === "watchtower" && !x.buildUntil)) if (!assignGuard(s, v.id, t.id)) break;
  }
  // fires burn only what is loaded: top each grate up once it falls below half
  for (const f of s.structures.filter((x) => x.type === "pitfire" && !x.buildUntil)) {
    if ((f.fuel ?? 0) < fuelCap(f.level) / 2) {
      stokeFire(s, f.id, "coal", Infinity);
      stokeFire(s, f.id, "wood", Infinity);
    }
  }
  // keep everyone employed
  for (const st of s.structures) if (!st.buildUntil && st.type === "barracks") recruit(s, st.id);
  for (const st of s.structures) if (!st.buildUntil && st.type !== "barracks") hire(s, st.id);
  if (s.raid?.phase === "fighting") {
    let guard = 0;
    const party = s.raid.party.map((p) => `${p.count}x${p.kind} L${p.level}`).join("+");
    stepCombat(s, 0.05);
    const def = s.raid?.combatants.filter((c) => c.side === "defender").map((c) => `${c.kind}${c.level}(${c.hp}hp,${c.dmg}dmg)`).join(" ");
    while (s.raid && guard++ < 20000) stepCombat(s, 0.05);
    console.log(`  RAID day ${clock(s.time).day}: ${party} vs [${def}] -> ${s.log[0].text} (${(guard * 0.05).toFixed(0)}s)`);
  }
  const c = clock(s.time);
  if (c.day !== lastDay && c.day % 3 === 0) {
    lastDay = c.day;
    console.log(
      `day ${String(c.day).padStart(2)} ${c.season.padEnd(6)} mood ${s.mood.toFixed(0).padStart(3)} hunger ${s.hunger.toFixed(0).padStart(3)} ` +
      `pop ${String(s.villagers.length).padStart(2)} troops ${countedTroops(s).length} meals ${Math.round(s.res.meals)} ` +
      `wood ${Math.round(s.res.wood)} coal ${Math.round(s.res.coal)} deaths ${s.deaths} bld ${s.structures.length} ` +
      `happy ${(s.villagers.reduce((a, v) => a + v.happy, 0) / Math.max(1, s.villagers.length)).toFixed(0)} hp ${(s.villagers.reduce((a, v) => a + v.health, 0) / Math.max(1, s.villagers.length)).toFixed(0)}`
    );
  }
}
void r;
void upgrade;
// G1 (docs/town-survival-systems.md §10): the town must fall, and not too soon.
const fell = s.fallen?.day ?? null;
const inBand = fell !== null && fell >= 8 && fell <= 30;
console.log(`\nG1: ${fell === null ? "still standing after 60 days" : `fell on day ${fell}${s.fallCause ? ` (${s.fallCause})` : ""}`} — ${inBand ? "inside" : "OUTSIDE"} the 8–30 day band (a static player, no study data; see town:balance).`);
void scheduleRaid;
console.log("\ncensus:", census(s).map((c) => `${c.label} ${c.count}`).join(", "));
console.log("kills:", s.kills.map((k) => k.kind).join(", ") || "none");
console.log("\nlast log:");
for (const l of s.log.slice(0, 18)) console.log(" ", l.text);
