import { cached, px } from "./core";
import { M, E, CAVITY, LIT, type Ramp4 } from "./materials";
import { renderSprite, type Materials } from "./sprites";
import { itemDef, type ItemDef } from "@/lib/town/sim/items";
import type { Element } from "@/lib/town/sim/elements";

/**
 * An icon for every one of the eight hundred items: the family's silhouette
 * (two shapes each, picked by the item's number), the rarity's materials —
 * rusted and cracked, plain iron, steel, green-tempered, gold, the element's
 * own stuff burning, and for a singleton gold and fire with a spark over it
 * — and the element's glow in the gem or the orb.
 */

const SHAPES: Record<string, string[][]> = {
  sword: [
    ["........b", ".......bB", "......bb.", ".....bb..", "g...bb...", ".gbb.....", "..hg.....", ".h..g....", "o........"],
    [".......bb", "......bbB", ".....bbb.", "....bbb..", "g..bbb...", ".gbb.....", "..hg.....", ".h..g....", "o........"],
  ],
  bow: [
    ["...bb....", "..b..s...", ".b...s...", ".b...s...", "b....s...", ".b...s...", ".b...s...", "..b..s...", "...bb...."],
    ["..bb.....", ".b..bs...", "b....s...", "b....s...", ".b...s...", "b....s...", "b....s...", ".b..bs...", "..bb....."],
  ],
  crossbow: [
    ["....g....", "...bgb...", "bb.bhb.bb", ".bbbhbbb.", "..s.h.s..", "....h....", "....h....", "...hhh..."],
    ["....g....", "..bbgbb..", "bbb.h.bbb", "b.sshss.b", "....h....", "....h....", "...hhh...", "...h.h..."],
  ],
  staff: [
    ["...ooo...", "..oOooo..", "...ooo...", "...gbg...", "....b....", "....b....", "....b....", "....b....", "...bbb..."],
    ["..bbb....", ".b...b...", ".b..ob...", "....b....", "....b....", "....b....", "....b....", "....b....", "...bbb..."],
  ],
  halberd: [
    ["...b.....", "..bbbg...", ".bbbBg...", "..bbbh...", "....h....", "....h....", "....h....", "....h....", "....h...."],
    ["....b....", "..bbbb...", ".bbBbbb..", "..bbbb...", "....h....", "....h....", "....h....", "....h....", "...hhh..."],
  ],
  plate: [
    [".gg...gg.", "gbbbbbbbg", "gbBbbbbbg", ".bbbobbb.", ".bbbbbbb.", ".bbbbbbb.", "..bbbbb..", "..bg.gb.."],
    ["gg.....gg", "gbbbbbbbg", ".bBbobbb.", ".bbbbbbb.", ".bgbbbgb.", ".bbbbbbb.", "..bbbbb.."],
  ],
  robe: [
    ["...ggg...", "..bbbbb..", ".bbbobbb.", ".bbbbbbb.", "bbbbbbbbb", "bbbBbbbbb", "bbbbbbbbb", "ggggggggg"],
    ["...bbb...", "..bbobb..", ".bgbbbgb.", ".bbbbbbb.", "bbbbbbbbb", "bbbbbbbbb", "gg.ggg.gg"],
  ],
  leather: [
    [".bb...bb.", "bbbbbbbbb", "bbhbbbhbb", ".bbbgbbb.", ".bbbgbbb.", ".bbbbbbb.", ".bbbbbbb."],
    ["bb.....bb", "bbbbbbbbb", ".bbhghbb.", ".bbbgbbb.", ".bbbbbbb.", ".hhhhhhh."],
  ],
  helm: [
    ["...ggg...", "..bbbbb..", ".bbBbbbb.", "bbbbbbbbb", "bbkkkkkbb", "bbbbbbbbb", ".b.....b."],
    ["...ooo...", "..gbbbg..", ".bbBbbbb.", "bbbbbbbbb", "bkkbbbkkb", "bbbbbbbbb", "bb.....bb"],
  ],
  boots: [
    [".bb...bb.", ".bb...bb.", ".bb...bb.", ".bb...bb.", "bbb..bbb.", "bbbb.bbbb", "gggg.gggg"],
    [".gg...gg.", ".bb...bb.", ".bb...bb.", "bbb..bbb.", "bbbb.bbbb", "gggg.gggg"],
  ],
  ring: [
    ["...ooo...", "..oOooo..", "..bbbbb..", ".b.....b.", ".b.....b.", ".b.....b.", "..bbbbb.."],
    ["...o.o...", "..bbobb..", ".b.....b.", "b.......b", ".b.....b.", "..bbbbb.."],
  ],
  amulet: [
    ["b.......b", ".b.....b.", "..b...b..", "...bgb...", "...ooo...", "..oOoo...", "...ooo..."],
    ["g.......g", ".g.....g.", "..g...g..", "..bbbbb..", "..bobob..", "..bbbbb..", "...bbb..."],
  ],
  relic: [
    [".bbbbbbb.", ".bBbbbbgb", ".bbbobbgb", ".bbbbbbgb", ".bbbbbbgb", ".bbbbbbgb", ".ggggggg."],
    ["bbbbbbb", "bBbobbb", ".bbbbb.", "..bbb..", "...b...", "..bbb..", ".bbbbb."],
  ],
  essence: [["...g...", "..ggg..", "..beb..", ".beeeb.", ".beEeb.", ".beeeb.", "..bbb.."]],
  gem: [["..ooo..", ".oOooo.", "ooooooo", ".ooooo.", "..ooo..", "...o..."]],
  metal: [[".bbbbb.", "bBBbbbb", "bbbbbbb", "..bbb.."]],
  reagent: [["..g..", ".bbb.", "beeeb", "beEeb", ".bbb."]],
  trophy: [["....bb", "...bB.", "..bb..", ".bb...", "bbo..."]],
  scrap: [["..b..", ".b.b.", "b.bb.", ".bb.b"]],
  curio: [["..ooo..", ".obbbo.", "..bbb..", ".bbbbb.", "..b.b.."]],
};

const STUFF_OF: Record<string, "metal" | "wood" | "cloth" | "hide"> = {
  sword: "metal", halberd: "metal", plate: "metal", helm: "metal", ring: "metal", amulet: "metal", relic: "metal",
  bow: "wood", crossbow: "wood", staff: "wood", robe: "cloth", leather: "hide", boots: "hide",
};
/** Body materials by stuff, broken → legendary (mythic and singleton take the element's). */
const BODY: Record<string, Ramp4[]> = {
  metal: [M.CLAY, M.IRON, M.STEEL, M.SCALEGRN, M.BRASS],
  wood: [M.PINE, M.OAK, M.LEATHER, M.CHITIN, M.BONE],
  cloth: [M.WOOL, M.LINEN, M.CLOTHBLU, M.CLOTHGRN, M.CLOTHRED],
  hide: [M.LEATHER, M.LEATHER, M.FUR, M.CHITIN, M.SCALERED],
};
const ELEMENT_BODY: Record<Element, Ramp4> = {
  earth: M.MOSS, fire: M.SCALERED, water: M.CLOTHBLU, air: M.LINEN, thunder: M.STEEL, light: M.BRASS, dark: M.CHITIN, time: M.SAND, space: M.ARCANE,
};
const ELEMENT_GLOW: Record<Element, Ramp4> = {
  earth: E.EARTH, fire: E.AMBER, water: E.SEA, air: E.MINT, thunder: E.GOLD, light: E.SUN, dark: E.DUSK, time: E.SAND, space: E.STAR,
};
const GEM_RAMP: Record<string, Ramp4> = {
  ruby: E.BLOOD, sapphire: E.SEA, emerald: E.BILE, topaz: E.GOLD, amethyst: E.VOID, onyx: E.DUSK, opal: E.MINT, pearl: E.SUN,
  garnet: E.BLOOD, jade: E.BILE, moonstone: E.CYAN, sunstone: E.AMBER,
};
const DULL_GEM: Record<string, Ramp4> = {
  ruby: M.CLOTHRED, sapphire: M.CLOTHBLU, emerald: M.CLOTHGRN, topaz: M.OCHRE, amethyst: M.ARCANE, onyx: M.CHITIN, opal: M.ICE, pearl: M.LINEN,
  garnet: M.SCALERED, jade: M.MOSS, moonstone: M.ICE, sunstone: M.OCHRE,
};
const METAL_RAMP: Record<string, Ramp4> = {
  "star-iron": M.SLATE, "moon-silver": M.STEEL, "sky-bronze": M.COPPER, "deep-gold": M.BRASS, "meteoric-glass": M.CHITIN,
  orichalcum: M.COPPER, adamant: M.STEEL, dragonsteel: M.SCALERED,
};

function matsFor(d: ItemDef): Materials {
  const r = ["broken", "common", "rare", "special", "legendary", "mythic", "singleton"].indexOf(d.rarity);
  const glow = d.element ? ELEMENT_GLOW[d.element] : r >= 4 ? E.AMBER : r === 3 ? E.BILE : E.CYAN;
  switch (d.family) {
    case "essence":
    case "reagent":
      return { b: M.GLASS, g: M.OAK, e: glow, E: glow };
    case "gem": {
      const name = d.id.split("-")[1];
      return { o: d.rarity === "common" ? DULL_GEM[name] ?? M.STONE : GEM_RAMP[name] ?? E.CYAN };
    }
    case "metal": {
      const name = d.id.slice(6);
      return { b: METAL_RAMP[name] ?? M.STEEL };
    }
    case "trophy":
      return { b: d.rarity === "mythic" ? M.BRASS : M.BONE, o: glow };
    case "scrap":
      return { b: d.id === "scrap-cloth" ? M.WOOL : d.id === "scrap-wood" ? M.PINE : d.id === "scrap-bone" ? M.BONE : d.id === "scrap-gem" ? M.GLASS : d.id === "scrap-coin" ? M.COPPER : M.IRON };
    case "curio":
      return { b: M.BRASS, o: E.BLOOD };
  }
  const stuff = STUFF_OF[d.family] ?? "metal";
  const body = r >= 5 ? (d.element ? ELEMENT_BODY[d.element] : M.BRASS) : BODY[stuff][Math.max(0, Math.min(4, r))];
  const trim = r >= 4 ? M.BRASS : r >= 2 ? M.STEEL : M.IRON;
  return {
    b: body, B: body, g: trim, h: stuff === "wood" ? M.OAK : M.LEATHER, s: M.LINEN,
    o: r >= 2 ? glow : r === 1 ? M.GLASS : M.STONE, O: glow, k: [CAVITY],
  };
}

/** The icon for any of the eight hundred items. Unknown ids fall back to their family's shape in plain iron. */
export function itemIcon(id: string): HTMLCanvasElement {
  return cached(`item:${id}`, () => {
    const d = itemDef(id);
    if (!d) return renderSprite(SHAPES.scrap[0], { b: M.IRON }, `item:?:${id}`);
    const shapes = SHAPES[d.family] ?? SHAPES.scrap;
    const rows = [...shapes[d.n % shapes.length]];
    const mats = matsFor(d);
    const cv = renderSprite(rows, mats, `item:${id}`);
    const c = cv.getContext("2d")!;
    // broken: a crack across it
    if (d.rarity === "broken") {
      for (let i = 0; i < 3; i++) px(c, 3 + i, 3 + i + (i % 2), 1, 1, CAVITY);
    }
    // a singleton: a spark over it that is never still in the eye
    if (d.rarity === "singleton") {
      const g = d.element ? ELEMENT_GLOW[d.element] : E.GOLD;
      px(c, cv.width - 2, 0, 1, 1, g[0]);
      px(c, cv.width - 3, 1, 1, 1, g[1]);
      px(c, cv.width - 1, 1, 1, 1, g[1]);
      px(c, cv.width - 2, 2, 1, 1, g[1]);
    }
    // legendary and up: a glint on the top-left of the body
    if (d.kind === "equipment" && (d.rarity === "legendary" || d.rarity === "mythic")) px(c, 1, 1, 1, 1, M.LINEN[LIT]);
    return cv;
  });
}

/** Whether an id is one of the eight hundred and should use an item icon rather than a resource icon. */
export const isItemIcon = (id: string) => {
  const d = itemDef(id);
  return !!d && d.family !== "part" && d.family !== "foot";
};
