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
const s = endgameTown(1, 120);
const t0 = s.time;
const seen: string[] = [];
for (let h = 0; h < 72 * 60; h++) {
  if (s.raid?.phase === "fighting") { let g = 0; while (s.raid && g++ < 40000) stepCombat(s, 0.05); }
  else advance(s, 1, ctx);
  for (const l of s.log) if (l.t >= t0 && !seen.includes(`${l.t}|${l.text}`)) seen.push(`${l.t}|${l.text}`);
}
const skip = /Achievement|arrives after|Word has gone|is buried|completes training|caravan|merchants/;
console.log(seen.map((x) => { const [t, txt] = x.split("|"); const c = clock(Number(t)); return `${c.day}/${c.hour}: ${txt}`; }).filter((x) => !skip.test(x)).slice(0, 80).join("\n"));
