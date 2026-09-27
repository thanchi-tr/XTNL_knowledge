import { M, E, CAVITY, type Ramp4 } from "./materials";
import { Grid, renderSprite, type Materials } from "./sprites";

/**
 * Mounted knights: the knight tree from Mounted Serjeant up rides. One horse,
 * built from shapes on a Grid like the bestiary, in side view facing right;
 * what changes by title is the horse's coat, the barding over it, the
 * rider's armour, the crest and the lance.
 *
 *   serjeant   a bay horse, bare; leather and a kettle hat; a light lance
 *   bachelor   a grey under a caparison in the town's blue, a great helm,
 *              a couched lance with a pennon
 *   champion   a white charger in linen and gold, masterwork plate with a
 *              lit visor — the paladin
 *   noble      a black destrier in violet and gold, a crested helm, and a
 *              lance that carries his banner
 */

export type MountedLook = "serjeant" | "bachelor" | "champion" | "nobleknight";
export const MOUNTED: MountedLook[] = ["serjeant", "bachelor", "champion", "nobleknight"];
export const isMounted = (k: string): k is MountedLook => (MOUNTED as string[]).includes(k);

interface RiderSpec {
  coat: Ramp4;
  mane: Ramp4;
  /** Caparison over the horse, and its trim; none for a bare horse. */
  barding?: [Ramp4, Ramp4];
  armour: Ramp4;
  tabard: Ramp4;
  /** Visor: a slit of cavity, or an emissive light. */
  visor: Ramp4 | readonly [string];
  plume?: Ramp4;
  /** Pennon or banner on the lance. */
  flag?: Ramp4;
  helm: "kettle" | "great" | "crest";
}

const SPEC: Record<MountedLook, RiderSpec> = {
  serjeant: { coat: M.FUR, mane: M.OAK, armour: M.STEEL, tabard: M.LEATHER, visor: [CAVITY], helm: "kettle" },
  bachelor: { coat: M.FURGREY, mane: M.SLATE, barding: [M.CLOTHBLU, M.BRASS], armour: M.STEEL, tabard: M.CLOTHBLU, visor: [CAVITY], flag: M.CLOTHRED, helm: "great" },
  champion: { coat: M.BONE, mane: M.LINEN, barding: [M.LINEN, M.BRASS], armour: M.BRASS, tabard: M.LINEN, visor: E.AMBER, plume: M.CLOTHRED, flag: M.LINEN, helm: "great" },
  nobleknight: { coat: M.CHITIN, mane: M.GLASS, barding: [M.ARCANE, M.BRASS], armour: M.STEEL, tabard: M.ARCANE, visor: [CAVITY], plume: M.BRASS, flag: M.ARCANE, helm: "crest" },
};

/** The rider and horse on one grid: letters name materials for the sprite shader. */
function riderRows(look: MountedLook, frame: 0 | 1): string[] {
  const sp = SPEC[look];
  const g = new Grid(28, 25);
  const dip = frame; // the passing frame drops the whole mount a pixel

  // ── the lance, behind the rider: couched forward and up ──
  // held high enough to clear the horse's head
  g.line(13.4, 9 + dip, 26.6, 0.4 + dip, "w", 1);
  g.set(26.6, 0.4 + dip, "s");
  g.set(25.8, 0.9 + dip, "s");
  if (sp.flag) {
    g.poly([[22.6, 3 + dip], [25.4, 1.2 + dip], [25.6, 3 + dip], [23.4, 4.4 + dip]], "q");
  }

  // ── the horse ──
  g.path([[6, 15 + dip], [3, 17 + dip], [2.2, 21 + dip]], "n", 2.6, 1.2); // tail
  g.ellipse(13, 15.5 + dip, 7.6, 3.8, "h"); // barrel
  g.path([[18, 14 + dip], [21, 8.6 + dip]], "h", 3.8, 3); // neck
  g.ellipse(22.2, 8.2 + dip, 2.4, 2, "h"); // skull
  g.poly([[21.5, 7.2 + dip], [26, 8.4 + dip], [26, 10.2 + dip], [21.4, 10 + dip]], "h"); // muzzle
  g.poly([[21, 6.6 + dip], [21.6, 4 + dip], [22.6, 6.4 + dip]], "h"); // ear
  g.set(26, 9.8 + dip, "k"); // nostril
  g.set(22.4, 7.8 + dip, "e"); // eye
  g.path([[17.6, 12.6 + dip], [20.6, 7 + dip]], "n", 1.4); // mane
  // legs: the stride, then legs gathered under
  const legs: [number, number, number, number][] = frame === 0
    ? [[18, 17.5, 19.6, 23], [16, 17.5, 15, 23], [8, 17.5, 6.2, 23], [10.5, 17.5, 11, 23]]
    : [[17.4, 18.5, 17.6, 23.6], [15.4, 18.5, 16, 23.6], [8.6, 18.5, 8.2, 23.6], [10.4, 18.5, 10.2, 23.6]];
  for (const [x0, y0, x1, y1] of legs) g.path([[x0, y0], [x1, y1 - 0.8]], "h", 1.7, 1.3);
  for (const [, , x1, y1] of legs) g.set(x1, y1, "k");

  // ── barding: a caparison over the barrel, hanging to the knees, with a trim ──
  if (sp.barding) {
    g.ellipse(12.6, 15.6 + dip, 7.9, 3.6, "c");
    g.poly([[5.2, 15 + dip], [20.2, 15 + dip], [19.6, 20 + dip], [5.8, 20 + dip]], "c");
    g.line(5.8, 20 + dip, 19.6, 20 + dip, "g");
    g.path([[18.4, 13.6 + dip], [20.8, 9 + dip]], "c", 2.8, 2); // over the neck
    for (const x of [8, 12, 16]) g.set(x, 17 + dip, "C"); // a device on the cloth
  } else {
    g.poly([[10, 11.4 + dip], [15.4, 11.4 + dip], [15, 13 + dip], [10.4, 13 + dip]], "b"); // saddle cloth
  }

  // ── the rider ──
  const ry = dip;
  g.ellipse(12.2, 9.6 + ry, 2.5, 2.8, "t"); // torso
  g.set(11, 8.4 + ry, "T");
  g.path([[12.2, 11.8 + ry], [13.6, 16 + ry]], "a", 1.8, 1.4); // leg down the horse's flank
  g.set(13.8, 16.6 + ry, "d"); // stirrup and boot
  g.path([[12.4, 9.6 + ry], [14.6, 10.8 + ry]], "a", 1.4); // lance arm
  g.ellipse(12.2, 5 + ry, 2.4, 2.3, "m"); // helm
  if (sp.helm === "kettle") {
    g.line(9.2, 5.8 + ry, 15.2, 5.8 + ry, "m"); // the brim
    g.set(13.6, 6.8 + ry, "f");
    g.set(14.2, 6.8 + ry, "f"); // a face under it
  } else {
    g.line(12.8, 5.2 + ry, 14.4, 5.2 + ry, "y"); // visor slit
  }
  if (sp.helm === "crest") g.path([[11, 2.6 + ry], [13.6, 1.8 + ry]], "p", 1.6);
  else if (sp.plume) g.path([[11.4, 2.8 + ry], [9.6, 1 + ry]], "p", 1.4);
  g.set(11.2, 4 + ry, "M");
  return g.rows();
}

export function mountedSprite(look: MountedLook, frame: 0 | 1): HTMLCanvasElement {
  const sp = SPEC[look];
  const mats: Materials = {
    h: sp.coat, n: sp.mane, k: [CAVITY], e: [CAVITY],
    c: sp.barding?.[0] ?? sp.tabard, g: sp.barding?.[1] ?? M.BRASS, b: sp.tabard,
    t: sp.tabard, a: sp.armour, m: sp.armour, y: sp.visor, f: M.SKIN, d: M.LEATHER,
    p: sp.plume ?? M.CLOTHRED, w: M.PINE, s: M.STEEL, q: sp.flag ?? M.CLOTHRED,
  };
  return renderSprite(riderRows(look, frame), mats, `rider3:${look}:${frame}`);
}
