import { endgameTown } from "../src/lib/town/sim/showcase";
import { advance, type SimContext } from "../src/lib/town/sim/tick";
import { stepCombat } from "../src/lib/town/sim/combat";
import { profileFor, type TownInput } from "../src/lib/town/rules";
import { clock } from "../src/lib/town/sim/state";
const input: TownInput = {
  schools: { commerce: 14, science: 16, mind: 12 }, scores: { PHYSICAL: 40, FAITH: 30, CREATIVITY: 30, STATISTIC: 30, STUBBORNNESS: 40 },
  streakDays: 12, equippedAttributes: ["PHYSICAL", "FAITH"], peakDepth: 6, reviewsToday: 10, newIdeasThisWeek: { commerce: 2, science: 2, mind: 2 },
  emblems: [], domainPeak: 6, domainSum: 40, dueRemaining: 0, newIdeasToday: 2,
};
const ctx: SimContext = { profile: profileFor(input), input };
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
for (const seed of (process.env.SEEDS ?? "1,2,3,4,5,6,7,8").split(",").map(Number)) {
  const s = endgameTown(seed, 120);
  const san0 = Math.round(avg(s.villagers.map((v) => v.happy)));
  if (process.env.DL) for (const p of s.raid!.party) {
    if (p.kind === "dragon") { p.level = Number(process.env.DL); p.count = Number(process.env.DN ?? p.count); }
    if (p.kind === "wyvern") { p.level = Number(process.env.WL ?? p.level); p.count = Number(process.env.WN ?? p.count); }
  }
  if (process.env.SAN) for (const v of s.villagers) v.happy = Number(process.env.SAN);
  if (process.env.BOWS) for (const v of s.villagers) if (v.role === "infantry") { v.gear = { weapon: "wyrmbow", armour: "bonemail" }; v.rank = Number(process.env.BOWS); }
  if (process.env.KCAMP) {
    const camps = s.structures.filter((x) => x.type === "armypoint").map((x) => x.id);
    let k = 0;
    for (const v of s.villagers) if (v.role === "knight" && !camps.includes(v.guard ?? -1)) v.guard = camps[k++ % camps.length];
  }
  const pop0 = s.villagers.length;
  const roles0 = new Map<number, string>(s.villagers.map((v) => [v.id, v.role]));
  let guard = 0;
  while (s.raid && guard++ < 400) {
    if (s.raid.phase === "fighting") { let g = 0; while (s.raid && g++ < 40000) stepCombat(s, 0.05); }
    else advance(s, 1, ctx);
  }
  const pop1 = s.villagers.length;
  const alive = new Set(s.villagers.map((v) => v.id));
  const deadRoles: Record<string, number> = {};
  for (const [id, r] of roles0) if (!alive.has(id)) deadRoles[r] = (deadRoles[r] ?? 0) + 1;
  const hall = s.structures.find((x) => x.type === "townhall")!;
  const m1 = Math.round(s.mood), san1 = Math.round(avg(s.villagers.map((v) => v.happy)));
  for (let h = 0; h < Number(process.env.H ?? 6); h++) {
    advance(s, 60, ctx);
    if (s.raid?.phase === "fighting") { let g = 0; while (s.raid && g++ < 40000) stepCombat(s, 0.05); }
    if (process.env.TRACE && h % 6 === 5) {
      const c = clock(s.time);
      const idle = s.villagers.filter((v) => v.role === "idle" && !v.work).length;
      console.log(`  d${c.day} ${c.hour}h hope ${s.mood.toFixed(0)} san ${avg(s.villagers.map((v) => v.happy)).toFixed(0)} pop ${s.villagers.length} corpses ${(s.corpses ?? []).length} idle ${idle} soc ${s.society?.state} debuffs ${s.debuffs.map((d) => d.id).join(",")} meals ${Math.round(s.res.meals)} broken ${s.villagers.filter((v) => v.broken && v.broken.until > s.time).length}`);
    }
  }
  console.log(`seed ${seed}: san0 ${san0} pop ${pop0} -> ${pop1} (dead ${JSON.stringify(deadRoles)}) hall hp ${Math.round(hall.hp)} | right after: hope ${m1} sanity ${san1} | +6h: hope ${Math.round(s.mood)} sanity ${Math.round(avg(s.villagers.map((v) => v.happy)))} pop ${s.villagers.length} day ${clock(s.time).day} fallen ${!!s.fallen}`);
  const last = s.log.slice(0, 40).map((l) => l.text).filter((t) => /raid|dragon|Dragon|wyvern|Wyvern|broken|falls defending/.test(t)).slice(0, 4);
  if (process.env.V) console.log("   " + last.join("\n   "));
}
