import { CATALOG, DISHES } from "./catalog";
import { clock } from "./state";
import { computeLinks, farmReachesMarket, fieldFrozen, growsInWinter, MILITARY_TYPES } from "./world";
import { trainingPace, type SimContext } from "./tick";
import type { GameState } from "./types";

/**
 * What is acting on each building right now, in words and in kind, so the
 * map can show it and the panel can explain it. Nothing here changes the
 * town — every entry mirrors a rule that the tick already applies.
 */

export type EffectKind = "slowed" | "inspired" | "fertilised" | "cold" | "decay" | "cutoff" | "feast" | "forging";

export interface Effect {
  kind: EffectKind;
  tone: "buff" | "debuff";
  label: string;
  detail: string;
}

export function buildingEffects(s: GameState, ctx: SimContext): Map<number, Effect[]> {
  const out = new Map<number, Effect[]>();
  const add = (id: number, e: Effect) => out.set(id, [...(out.get(id) ?? []), e]);
  const pace = trainingPace(ctx.input);
  const links = computeLinks(s);
  const winter = clock(s.time).season === "winter";

  for (const st of s.structures) {
    if (st.buildUntil) continue;
    const trains = st.type === "school" || MILITARY_TYPES.includes(st.type);
    if (trains && pace.slowed) {
      add(st.id, {
        kind: "slowed", tone: "debuff", label: `Training slowed to ${Math.round(pace.factor * 100)}%`,
        detail: `${pace.due} review${pace.due === 1 ? "" : "s"} still due today. Finish them and training returns to full speed.`,
      });
    } else if (trains && pace.boost > 0) {
      add(st.id, {
        kind: "inspired", tone: "buff", label: `Training +${Math.round(pace.boost * 100)}%`,
        detail: `Reviews done, and ${pace.ideas} new idea${pace.ideas === 1 ? "" : "s"} added today — each adds 15%.`,
      });
    }
    if ((st.type === "farm" || st.type === "waterfarm") && st.workers.length) {
      if (fieldFrozen(s, st, winter)) {
        add(st.id, { kind: "cold", tone: "debuff", label: "Frozen", detail: "Iced over, outside every pit fire's warmth. Nothing grows here until spring." });
      } else if (winter && !growsInWinter(st)) {
        add(st.id, { kind: "cold", tone: "debuff", label: "Dormant", detail: "Only potatoes grow through winter. Switch this field to potatoes, or wait for spring." });
      } else if (!farmReachesMarket(s, links, st)) {
        add(st.id, { kind: "cutoff", tone: "debuff", label: "Harvest lost", detail: "No paved road to a market — the crop rots in the field." });
      } else if ((st.soil?.N ?? 12) < 8) {
        add(st.id, { kind: "decay", tone: "debuff", label: "Tired soil", detail: `Nitrogen down to ${(st.soil?.N ?? 0).toFixed(1)} g/m². Rotate to beans, leave it fallow, or spread compost or fertiliser.` });
      } else if (s.res.fertiliser >= 1 || s.res.compost >= 1) {
        add(st.id, { kind: "fertilised", tone: "buff", label: "Fed ground", detail: "Compost and fertiliser in store go on this field when its nitrogen runs low." });
      }
    }
    if ((st.type === "house" || st.type === "apartment") && st.zone && st.zone.T < 5) {
      add(st.id, { kind: "cold", tone: "debuff", label: `Cold · ${Math.round(st.zone.T)} °C`, detail: "The room is near freezing. Those who sleep here chill, and a cold core is how hypothermia starts. Fit a better hearth, feed it, or build warmer." });
    }
    if (st.zone && st.zone.co > 230) {
      add(st.id, { kind: "decay", tone: "debuff", label: "Fumes", detail: `Carbon monoxide ${Math.round(st.zone.co / 1.145)} ppm. Sleepers here may not wake.` });
    }
    if (st.type === "kitchen" && st.workers.length) {
      const dish = DISHES.find((d) => d.id === st.mode);
      const stocked = dish && Object.entries(dish.input).every(([k, n]) => s.res[k as keyof GameState["res"]] >= (n as number));
      if (dish && dish.id !== "pottage" && stocked && (dish.mood || dish.happy || dish.health)) {
        add(st.id, { kind: "feast", tone: "buff", label: `Serving ${dish.name.toLowerCase()}`, detail: dish.blurb });
      }
    }
    if (st.type === "forge" && st.craft && st.craft.until > s.time) {
      add(st.id, { kind: "forging", tone: "buff", label: "At the anvil", detail: "A piece is being forged." });
    }
    if (st.type !== "townhall" && st.condition < 50) {
      add(st.id, {
        kind: "decay", tone: "debuff", label: "Deteriorating",
        detail: `Condition ${Math.round(st.condition)}%. Mood below half wears ${CATALOG[st.type].name.toLowerCase()}s down until they lose a level.`,
      });
    }
  }
  return out;
}
