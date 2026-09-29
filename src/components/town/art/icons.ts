import { cached } from "./core";
import { M, E, CAVITY } from "./materials";
import { renderSprite, type Materials } from "./sprites";
import { crop, oreChunk, ORE_COLORS, type CropArt } from "./nature";
import { isItemIcon, itemIcon } from "./items";

/**
 * Icons for resources, monster parts and gear: tiny sprites through the same
 * shader as everything else, so a coin is lit from the top-left like the
 * town it is counted in. Each is typed as a material map.
 */

type Icon = { rows: string[]; mats: Materials };

const ICONS: Record<string, Icon> = {
  coin: { rows: [".ggg.", "gGGgg", "gGggg", "ggggg", ".ggg."], mats: { g: M.BRASS } },
  wood: { rows: ["..bbbb.", ".bbbbbb", "bwWwbbb", "bwwwbbb", ".bbbbb."], mats: { b: M.OAK, w: M.PINE } },
  stone: { rows: ["..sss..", ".sSsss.", "sSsssss", "sssssss", ".sssss."], mats: { s: M.STONE } },
  meals: { rows: ["..fff..", ".fFfff.", "wwwwwww", ".wwwww.", "..www.."], mats: { f: M.OCHRE, w: M.OAK } },
  ice: { rows: [".iiiii", "iIIiii", "iIiiii", "iiiiii", "iiiii."], mats: { i: M.ICE } },
  planks: { rows: ["ppppppp", "PPPPPPP", "ppppppp", "PPPPPPP", "ppppppp"], mats: { p: M.PINE } },
  bricks: { rows: ["bbb.bbb", "bbb.bbb", "bb.bbb.", "bb.bbb.", "bbb.bbb"], mats: { b: M.CLAY } },
  ingots: { rows: [".mmmmm.", "mMMmmmm", "mmmmmmm", "..mmm..", ".mMmmm."], mats: { m: M.STEEL } },
  gunpowder: { rows: [".kkkkk.", "wwwwwww", "kkkkkkk", "wwwwwww", ".kkkkk."], mats: { k: M.IRON, w: M.OAK } },
  poison: { rows: ["..c..", "..g..", ".ggg.", "gpppg", "gpppg", ".ggg."], mats: { c: M.OAK, g: M.GLASS, p: M.CLOTHGRN } },
  fish: { rows: ["..f....", ".fFff.f", "fkfffff", ".ffff.f", "..f...."], mats: { f: M.STEEL, k: [CAVITY] } },
  tonic: { rows: ["..c..", ".ggg.", "grrrg", "grRrg", ".ggg."], mats: { c: M.OAK, g: M.GLASS, r: M.CLOTHRED } },
  fertiliser: { rows: ["..t..", ".sss.", "sSsss", "sssss", ".sss."], mats: { t: M.WOOL, s: M.DIRT } },
  torches: { rows: ["..f..", ".fFf.", "..f..", "..w..", "..w..", "..w..", ".www."], mats: { f: E.AMBER, w: M.OAK } },
  tools: { rows: ["ss.....", "sSs..ww", ".sw.www", "..wwww.", "..ww...", ".ww....", "ww....."], mats: { s: M.STEEL, w: M.OAK } },
  formula: { rows: ["lllllll", "lLLllll", "lllllll", "lllrlll", "llrrrll"], mats: { l: M.LINEN, r: E.VOID } },
  rice: { rows: [".s.s.s", "s.s.s.", ".s.s.s", "..g.g.", "..g.g."], mats: { s: M.SAND, g: M.FOLIAGE } },
  taro: { rows: ["..gg..", ".gGgg.", "..tt..", ".tttt.", "tttttt", ".tttt."], mats: { g: M.FOLIAGE, t: M.FUR } },
  lotus: { rows: [".p.p.", "ppPpp", ".ppp.", "..g..", ".ggg."], mats: { p: M.ARCANE, g: M.FOLIAGE } },
  reed: { rows: ["b.b.b", "b.b.b", "r.r.r", "r.r.r", "r.r.r"], mats: { b: M.FUR, r: M.NEEDLE } },
  watercress: { rows: [".g.g.", "gGgGg", "ggggg", ".s.s.", ".s.s."], mats: { g: M.CLOTHGRN, s: M.FOLIAGE } },
  chestnut: { rows: ["..s..", ".ccc.", "cCccc", "ccccc", ".ccc."], mats: { s: M.FOLIAGE, c: M.LEATHER } },
  apple: { rows: ["..sl.", ".rrr.", "rRrrr", "rrrrr", ".rrr."], mats: { s: M.OAK, l: M.FOLIAGE, r: M.CLOTHRED } },
  // monster parts
  hide: { rows: ["hhhhh..", "hHHhhh.", ".hhhhhh", "..hhhhh", "...hhh."], mats: { h: M.LEATHER } },
  fang: { rows: ["fff", "fFf", ".ff", ".ff", "..f"], mats: { f: M.BONE } },
  bone: { rows: ["b...b", "bb.bb", ".bbb.", "..b..", ".bbb.", "bb.bb"], mats: { b: M.BONE } },
  ichor: { rows: ["..i..", ".iii.", "iIiii", "iiiii", ".iii."], mats: { i: M.SLIME } },
  scale: { rows: [".sss.", "sSsss", "sssss", ".sss.", "..s.."], mats: { s: M.SCALEGRN } },
  ectoplasm: { rows: [".eee.", "eEeee", "ekeke", "eeeee", "e.e.e"], mats: { e: M.ICE, k: [CAVITY] } },
  core: { rows: [".sss.", "sSscs", "ssCss", "scsss", ".sss."], mats: { s: M.STONE, c: E.CYAN } },
  jewel: { rows: [".jjj.", "jjJjj", "jjjjj", ".jjj.", "..j.."], mats: { j: E.VOID } },
  // high-tier parts, for the towers
  heart: { rows: [".h.h.", "hHhhh", "hhhhh", ".hhh.", "..h.."], mats: { h: E.BLOOD } },
  eye: { rows: [".www.", "wwiww", "wiIiw", "wwiww", ".www."], mats: { w: M.BONE, i: E.AMBER } },
  foot: { rows: ["..ff.", "..ff.", ".fff.", "fffff", "c.c.c"], mats: { f: M.FUR, c: M.BONE } },
  // The side panel's own marks: its tabs, and the gauges on a building.
  "ui-build": { rows: ["..sss..", ".sSsss.", "..sws..", "...w...", "...w...", "...w...", "...W..."], mats: { s: M.STEEL, w: M.OAK } },
  "ui-info": { rows: ["...r...", "..rRr..", ".rRrrr.", "rrrrrrr", ".wwdww.", ".wwdww.", ".wwdww."], mats: { r: M.CLOTHRED, w: M.DAUB, d: M.OAK } },
  "ui-hall": { rows: [".s...s.", "sSs.sSs", ".s...s.", ".c...b.", "cCc.bBb", "ccc.bbb", "c.c.b.b"], mats: { s: M.SKIN, c: M.CLOTHBLU, b: M.CLOTHRED } },
  "ui-raid": { rows: ["S.....S", ".s...s.", "..s.s..", "...s...", "..s.s..", ".h...h.", "h.....h"], mats: { s: M.STEEL, h: M.OAK } },
  "ui-trade": { rows: ["...t...", "..lll..", ".lLlll.", "lllglll", "llgGgll", "lllglll", ".lllll."], mats: { t: M.OCHRE, l: M.LEATHER, g: M.BRASS } },
  "ui-log": { rows: [".ppppp.", "pPpppp.", ".lllll.", ".lLlll.", ".lllll.", ".ppppp.", "pPpppp."], mats: { p: M.OAK, l: M.LINEN } },
  "ui-trophy": { rows: ["g.ggg.g", "gGGgggg", ".ggggg.", "..ggg..", "...g...", "..ggg..", ".ggggg."], mats: { g: M.BRASS } },
  "ui-codex": { rows: [".bbbbb.", "bBbbbbp", "bbbbbbp", "bbgbbbp", "bbbbbbp", "bbbbbbp", ".bbbbb."], mats: { b: M.CLOTHRED, p: M.LINEN, g: M.BRASS } },
  "ui-hp": { rows: [".h.h.", "hHhhh", "hhhhh", ".hhh.", "..h.."], mats: { h: M.CLOTHRED } },
  "ui-cond": { rows: ["bbb.bbb", "bBb.bbb", "bb.bbb.", "bb.bBb.", "bbb.bbb"], mats: { b: M.STONE } },
  "ui-fuel": { rows: ["...f...", "..fFf..", ".fFfff.", ".ffaff.", "ffaaaff", ".faAaf.", "..www.."], mats: { f: E.AMBER, a: E.GOLD, w: M.OAK } },
  "ui-lamp": { rows: ["..iii..", ".iiiii.", ".igggi.", ".igGgi.", ".igggi.", ".iiiii.", "...i..."], mats: { i: M.IRON, g: E.AMBER } },
  "ui-lamp-dry": { rows: ["..iii..", ".iiiii.", ".igggi.", ".igGgi.", ".igggi.", ".iiiii.", "...i..."], mats: { i: M.IRON, g: M.SLATE } },
  "ui-people": { rows: ["..sss..", "..sSs..", "...s...", ".ccccc.", "c.cCc.c", "..c.c..", "..c.c.."], mats: { s: M.SKIN, c: M.CLOTHGRN } },
  "ui-effort": { rows: ["..a....", ".aAa...", "aaaaa..", "..a....", "..a.a..", ".a...a.", "a.....a"], mats: { a: E.GOLD } },
};

// Gear: one shape per kind, its materials by tier.
const GEAR_SHAPES: Record<string, string[]> = {
  sword: ["......b", ".....b.", "....b..", "...b...", "gGgb...", ".h.....", "h......"],
  bow: ["..ww.", ".w..s", "w...s", "w...s", "w...s", ".w..s", "..ww."],
  staff: ["..o.", ".oOo", "..o.", "..w.", "..w.", "..w.", "..w."],
  halberd: [".bb..", "bbbw.", ".b.w.", "...w.", "...w.", "...w.", "...w."],
  coat: [".aa.aa.", "aaAaaaa", "aaaaaaa", ".aaaaa.", ".aaaaa.", ".aaaaa."],
};
const TIER_MATS: Record<number, Materials> = {
  1: { b: M.STEEL, g: M.IRON, h: M.LEATHER, w: M.OAK, s: M.LINEN, o: E.CYAN, a: M.LEATHER },
  2: { b: M.SCALEGRN, g: M.STEEL, h: M.LEATHER, w: M.PINE, s: M.LINEN, o: E.BILE, a: M.BONE },
  3: { b: M.BRASS, g: M.ARCANE, h: M.CLOTHRED, w: M.OAK, s: E.AMBER, o: E.VOID, a: M.BRASS },
};
const GEAR_KIND: Record<string, [string, number]> = {
  sword1: ["sword", 1], sword2: ["sword", 2], oathblade: ["sword", 3],
  bow1: ["bow", 1], bow2: ["bow", 2], wyrmbow: ["bow", 3],
  staff1: ["staff", 1], staff2: ["staff", 2], hexstaff: ["staff", 3],
  halberd1: ["halberd", 1], halberd2: ["halberd", 2], worldsplitter: ["halberd", 3],
  hidecoat: ["coat", 1], bonemail: ["coat", 2], aegis: ["coat", 3], starweave: ["coat", 3],
};

const LAND = new Set(["potato", "wheat", "grape", "herb", "cabbage", "carrot", "pumpkin", "barley", "onion", "bean", "turnip", "corn", "strawberry", "garlic", "date", "millet", "chickpea", "melon", "saffron", "cloudberry", "sunflower", "starfruit", "windroot"]);

/** The icon for a resource, part or gear id — or any of the eight hundred items (./items). Unknown ids get a plain stone. */
export function icon(id: string): HTMLCanvasElement {
  if (LAND.has(id)) return crop(id as CropArt, 2);
  if (ORE_COLORS[id]) return oreChunk(id);
  if (!GEAR_KIND[id] && !ICONS[id] && isItemIcon(id)) return itemIcon(id);
  return cached(`icon:${id}`, () => {
    const g = GEAR_KIND[id];
    if (g) return renderSprite(GEAR_SHAPES[g[0]], TIER_MATS[g[1]], `icon-gear:${id}`);
    const def = ICONS[id.startsWith("foot:") ? "foot" : id] ?? ICONS.stone;
    return renderSprite(def.rows, def.mats, `icon:${id}`);
  });
}
