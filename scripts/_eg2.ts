import { endgameTown } from "../src/lib/town/sim/showcase";
import { advance, type SimContext } from "../src/lib/town/sim/tick";
import { stepCombat } from "../src/lib/town/sim/combat";
import { profileFor, type TownInput } from "../src/lib/town/rules";
import { byId, clock } from "../src/lib/town/sim/state";
import { bodyOf } from "../src/lib/town/sim/body";
import { air } from "../src/lib/town/sim/weather";
import { UTILITIES } from "../src/lib/town/sim/catalog";
const input: TownInput = {
  schools: { commerce: 14, science: 16, mind: 12 }, scores: { PHYSICAL: 40, FAITH: 30, CREATIVITY: 30, STATISTIC: 30, STUBBORNNESS: 40 },
  streakDays: 12, equippedAttributes: ["PHYSICAL", "FAITH"], peakDepth: 6, reviewsToday: 10, newIdeasThisWeek: { commerce: 2, science: 2, mind: 2 },
  emblems: [], domainPeak: 6, domainSum: 40, dueRemaining: 0, newIdeasToday: 2,
};
const ctx: SimContext = { profile: profileFor(input), input };
const s = endgameTown(1, 120);
s.raid = null;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
for (let h = 0; h < 60; h++) {
  // measure the terms as psycheHourly will see them at the end of this hour: take them just before
  advance(s, 59, ctx);
  const c = clock(s.time);
  const asleep = c.hour >= 22 || c.hour < 6;
  const rows = s.villagers.map((v) => {
    const b = bodyOf(v);
    const home = byId(s, v.house);
    const zoneT = home?.zone?.T ?? air(s).T;
    return {
      cold: -2.0 * Math.max(0, 36.5 - b.Tc),
      dark: !asleep && c.darkness > 0.5 && (b.at == null || !(byId(s, b.at)?.zone?.burn)) ? -0.5 : 0,
      energy: -1.5 * Math.max(0, Math.min(1, (0.3 - b.Eg / 2000) / 0.3)),
      sleep: asleep ? (zoneT >= 10 ? 1.5 : zoneT >= 5 ? 0.8 : 0) : 0,
      meal: 3 * Math.min(1, b.meals),
      company: !asleep && home && s.villagers.filter((o) => o.house === v.house).length >= 3 ? 0.5 : 0,
      util: (home?.utilities ?? []).reduce((a, id) => a + (UTILITIES.find((u) => u.id === id)?.happy ?? 0), 0),
      homeless: home ? 0 : 1,
      F: b.F < 5 && b.F >= 3 ? -0.5 : 0,
      cb: b.cb >= 8 ? -0.2 : 0,
    };
  });
  advance(s, 1, ctx);
  if (s.raid?.phase === "fighting") { let g = 0; while (s.raid && g++ < 40000) stepCombat(s, 0.05); }
  if (h % 3 === 2) {
    const keys = Object.keys(rows[0]) as (keyof (typeof rows)[0])[];
    console.log(`d${c.day} ${String(c.hour).padStart(2)}h san ${avg(s.villagers.map((v) => v.happy)).toFixed(0)} hope ${s.mood.toFixed(0)} pop ${s.villagers.length} T ${air(s).T.toFixed(1)} | ` + keys.map((k) => `${k} ${avg(rows.map((r) => Number(r[k]))).toFixed(2)}`).join(" "));
  }
}
