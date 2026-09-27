/**
 * A scripted player, for the balance checks (docs/town-survival-systems.md
 * §10, §13). The same opening every time; then, each hour, the chores a
 * sensible player does. Two dials:
 *
 * - `study`: none (no study data reaches the town), active (three Fields'
 *   dailies finished on long streaks, ideas added across them), or neglect
 *   (nothing reviewed, a backlog overdue, a long streak lapsed);
 * - `adaptive`: a strategist who reads the land's forecast and answers it —
 *   towers where the next wave will aim, bowmen against fliers, lamps against
 *   the night, walls against siege — rather than holding one fixed defence.
 */
import { newTown, clock, countedTroops } from "../src/lib/town/sim/state";
import { advance, type SimContext } from "../src/lib/town/sim/tick";
import { stepCombat } from "../src/lib/town/sim/combat";
import { fitHearth, sweepChimney, place, paint, hire, recruit, assignGuard, stokeFire, setFooting } from "../src/lib/town/sim/actions";
import { profileFor, type FieldDaily, type TownInput } from "../src/lib/town/rules";
import { idx, checkPlacement, fuelCap, ringOf, unlitBuildings, center } from "../src/lib/town/sim/world";
import { targetValue } from "../src/lib/town/sim/breach";
import { TACTICS, nemesisOf, tacticOdds } from "../src/lib/town/sim/nemesis";
import { frameUtil } from "../src/lib/town/sim/frame";
import { MAP_W, type GameState, type StructureType } from "../src/lib/town/sim/types";
import { FOG } from "../src/lib/town/sim/vision";

export type Study = "none" | "active" | "neglect";

const BASE: TownInput = {
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

const field = (id: string, name: string, school: FieldDaily["school"], attrs: FieldDaily["attrs"], o: Partial<FieldDaily>): FieldDaily => ({
  id, name, school, level: 6, attrs, ideasToday: 0, ideasWeek: 0, reviewedToday: 0, dueRemaining: 0, overdue: 0, streak: 0, bestStreak: 0, complete: false, ...o,
});

export function studyInput(study: Study): TownInput {
  if (study === "none") return BASE;
  if (study === "active") {
    const fields = [
      field("f1", "Physiology", "science", ["PHYSICAL", "STUBBORNNESS"], { ideasToday: 2, ideasWeek: 9, reviewedToday: 14, streak: 12, bestStreak: 12, complete: true }),
      field("f2", "Philosophy", "mind", ["FAITH", "COMPASSION"], { ideasToday: 2, ideasWeek: 8, reviewedToday: 11, streak: 22, bestStreak: 22, complete: true }),
      field("f3", "Statistics", "science", ["STATISTIC", "CRITICAL_THINKING"], { ideasToday: 2, ideasWeek: 7, reviewedToday: 16, streak: 35, bestStreak: 35, complete: true }),
    ];
    return { ...BASE, fields, day: "2026-01-01", reviewsToday: 41, dueRemaining: 0, newIdeasToday: 6 };
  }
  const fields = [
    field("f1", "Physiology", "science", ["PHYSICAL", "STUBBORNNESS"], { dueRemaining: 15, overdue: 20, bestStreak: 12 }),
    field("f2", "Philosophy", "mind", ["FAITH", "COMPASSION"], { dueRemaining: 12, overdue: 18, bestStreak: 22 }),
    field("f3", "Statistics", "science", ["STATISTIC", "CRITICAL_THINKING"], { dueRemaining: 18, overdue: 25, bestStreak: 35 }),
  ];
  return { ...BASE, fields, day: "2026-01-01", reviewsToday: 0, dueRemaining: 45, newIdeasToday: 0 };
}

export interface Outcome {
  fell: number | null;
  cause?: string;
  s: GameState;
}

export function playthrough(seed: number, study: Study, adaptive: boolean, onHour?: (s: GameState) => void): Outcome {
  FOG.rules = false;
  const input = studyInput(study);
  const ctx: SimContext = { profile: profileFor(input), input };
  const s = newTown(seed, 20);
  const tryPlace = (type: StructureType, x0: number, y0: number, span = 12) => {
    for (let y = y0; y < y0 + span; y++) for (let x = x0; x < x0 + span + 4; x++) {
      if (checkPlacement(s, type, x, y).ok && !place(s, ctx, type, x, y)) return true;
    }
    return false;
  };
  const near = (type: StructureType, cx: number, cy: number) => {
    for (let r = 2; r < 14; r++) for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
      if (checkPlacement(s, type, x, y).ok && !place(s, ctx, type, x, y)) return true;
    }
    return false;
  };

  s.res.wood += 800;
  s.res.stone += 800;
  s.res.coin += 400;
  s.res.iron += 80;
  tryPlace("house", 44, 38);
  tryPlace("house", 50, 38);
  tryPlace("barracks", 46, 42);
  tryPlace("pitfire", 52, 42);
  tryPlace("watchtower", 60, 42);
  tryPlace("mine", 52, 20);
  tryPlace("watchtower", 22, 40);
  tryPlace("watchtower", 40, 18);
  tryPlace("storehouse", 56, 34);
  tryPlace("storehouse", 62, 30);
  paint(s, "pavement", Array.from({ length: 30 }, (_, i) => idx(49, 30 + i)).concat(Array.from({ length: 30 }, (_, i) => idx(45 + i, 41))));
  s.res.coal += 200;


  for (let step = 0; step < 24 * 60 && !s.fallen; step++) {
    advance(s, 60, ctx);
    for (const h of s.structures.filter((x) => (x.type === "house" || x.type === "apartment") && !x.buildUntil && x.hearth === "open")) fitHearth(s, h.id, "chimney");
    for (const h of s.structures) if ((h.zone?.creo ?? 0) > 2) sweepChimney(s, h.id);
    for (const st of unlitBuildings(s)) {
      const t = ringOf(st.x, st.y, st.w, st.h).find((i) => checkPlacement(s, "lamppost", i % MAP_W, Math.floor(i / MAP_W)).ok);
      if (t !== undefined) place(s, ctx, "lamppost", t % MAP_W, Math.floor(t / MAP_W));
    }
    // Guards go to the first post with room — the strategist fills the posts nearest the hall first.
    const hallAt = s.structures.find((b) => b.type === "townhall");
    const posts = s.structures.filter((x) => (x.type === "watchtower" || x.type === "armypoint") && !x.buildUntil);
    if (adaptive && hallAt) posts.sort((a, b) => Math.hypot(center(a)[0] - center(hallAt)[0], center(a)[1] - center(hallAt)[1]) - Math.hypot(center(b)[0] - center(hallAt)[0], center(b)[1] - center(hallAt)[1]));
    for (const v of s.villagers) {
      if (!["infantry", "archer", "heavy", "wizard", "knight"].includes(v.role) || v.guard) continue;
      for (const t of posts) if (!assignGuard(s, v.id, t.id)) break;
    }
    for (const f of s.structures.filter((x) => x.type === "pitfire" && !x.buildUntil)) {
      if ((f.fuel ?? 0) < fuelCap(f.level) / 2) {
        stokeFire(s, f.id, "coal", Infinity);
        stokeFire(s, f.id, "wood", Infinity);
      }
    }
    // The static player recruits whenever it can; the strategist keeps troops under a third of the town, so there are hands to feed it.
    const troops = s.villagers.filter((v) => ["infantry", "archer", "heavy", "wizard", "knight"].includes(v.role)).length;
    const mayRecruit = !adaptive || troops < 0.3 * s.villagers.length;
    for (const st of s.structures) if (mayRecruit && !st.buildUntil && (st.type === "barracks" || st.type === "archery")) recruit(s, st.id);
    for (const st of s.structures) if (!st.buildUntil && st.type !== "barracks" && st.type !== "archery") hire(s, st.id);

    // The strategist reads the land once a day, at dawn, and answers it.
    if (adaptive && clock(s.time).hour === 6) {
      const odds = tacticOdds(s);
      const top = TACTICS[odds.indexOf(Math.max(...odds))];
      // A tower beside whatever is most tempting and least guarded.
      const tempting = s.structures
        .filter((b) => !b.buildUntil && !["watchtower", "lamppost", "pitfire", "brazier"].includes(b.type))
        .sort((a, b) => targetValue(s, b, "K") - targetValue(s, a, "K"));
      const towers = s.structures.filter((t) => t.type === "watchtower").length;
      const bare = tempting.find((b) => !s.structures.some((t) => t.type === "watchtower" && Math.hypot(center(t)[0] - center(b)[0], center(t)[1] - center(b)[1]) < 9));
      if (bare && towers < 6) near("watchtower", Math.round(center(bare)[0]), Math.round(center(bare)[1]));
      // Bowmen against fliers and armour-less night swarms.
      if ((top === "flyers" || top === "night" || top === "swarm") && !s.structures.some((b) => b.type === "archery")) tryPlace("archery", 40, 44, 16);
      // Underpin the most loaded roof against siege and the thaw.
      const loaded = [...s.structures].sort((a, b) => frameUtil(s, b) - frameUtil(s, a))[0];
      if (loaded && frameUtil(s, loaded) > 0.9) setFooting(s, loaded.id, "trench");
      // Keep the hall guarded once the land can see it.
      if (nemesisOf(s).model.hallWeak > 0.4 && s.structures.filter((t) => t.type === "watchtower").length < 7) {
        const hall = s.structures.find((b) => b.type === "townhall");
        if (hall) near("watchtower", Math.round(center(hall)[0]), Math.round(center(hall)[1]));
      }
    }
    if (s.raid?.phase === "fighting") {
      let guard = 0;
      while (s.raid && guard++ < 20000) stepCombat(s, 0.05);
    }
    onHour?.(s);
  }
  void countedTroops;
  return { fell: s.fallen?.day ?? null, cause: s.fallCause, s };
}
