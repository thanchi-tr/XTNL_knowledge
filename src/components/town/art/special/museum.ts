import { cached, px, type Ctx } from "../core";
import { M, E, GLOW, VOID, LIT, MID, SHADE, DEEP, type Ramp4 } from "../materials";
import { masonry } from "../textures";
import { obliqueHouse } from "../oblique";
import { ROOF, type RoofStyle } from "../buildings";
import { sheet } from "../signature";
import { stack, type Part } from "./common";

/**
 * The museum: a temple of the town's own making. A portico of columns under
 * a pediment with a carved frieze, broad steps, a statue on a plinth either
 * side, banners hung between the columns with paintings behind them. It
 * rises in three steps: sandstone to level 9, marble with gilt capitals from
 * 10, and from 20 a dome over the hall with a lantern of light on top.
 */

function column(c: Ctx, x: number, y: number, h: number, S: Ramp4, gilt: boolean) {
  px(c, x - 1, y, 5, 2, gilt ? M.BRASS[MID] : S[LIT]); // capital
  px(c, x, y + 2, 3, h - 4, S[MID]);
  px(c, x, y + 2, 1, h - 4, S[LIT]);
  px(c, x + 2, y + 2, 1, h - 4, S[SHADE]);
  for (let yy = y + 4; yy < y + h - 3; yy += 3) px(c, x + 1, yy, 1, 2, S[SHADE]); // fluting
  px(c, x - 1, y + h - 2, 5, 2, S[MID]); // base
}

function statue(c: Ctx, x: number, y: number, S: Ramp4) {
  px(c, x, y + 10, 6, 4, S[SHADE]);
  px(c, x, y + 10, 6, 1, S[MID]);
  px(c, x + 1, y + 3, 4, 7, S[MID]);
  px(c, x + 1, y + 3, 1, 7, S[LIT]);
  px(c, x + 2, y, 2, 3, S[LIT]);
  px(c, x + 5, y + 3, 1, 3, S[MID]); // an arm raised
  px(c, x + 5, y + 1, 1, 2, S[LIT]);
}

function painting(c: Ctx, x: number, y: number, k: number) {
  const skies = [M.CLOTHBLU, M.OCHRE, M.CLOTHRED, M.CLOTHGRN];
  px(c, x - 1, y - 1, 7, 7, M.BRASS[MID]);
  px(c, x, y, 5, 3, skies[k % 4][LIT]);
  px(c, x, y + 3, 5, 2, M.FOLIAGE[MID]);
  px(c, x + 1 + (k % 3), y + 1, 1, 1, GLOW[LIT]); // a sun, or a lamp
}

export function museum(level: number, rs: RoofStyle, banner: Ramp4 = M.CLOTHRED): HTMLCanvasElement {
  const L = Math.max(1, Math.min(30, Math.round(level)));
  const tier = L >= 20 ? 2 : L >= 10 ? 1 : 0;
  return cached(`museum:${L}:${rs}:${banner[MID]}`, () => {
    const S = tier ? M.MARBLE : M.STONEWM;
    const fw = 44 + tier * 4;
    const wallH = 24 + tier * 3;
    const rise = 10;
    const cols = 4 + (tier >= 1 ? 2 : 0);
    const hall = obliqueHouse({
      key: `museum:${L}:${rs}:${banner[MID]}`,
      fw, depth: 12, wallH, rise, roof: tier ? ROOF.slate : ROOF[rs === "thatch" ? "red" : rs], ridge: "across", stone: S,
      front: (c, x, y, w, h) => {
        masonry(c, x, y, w, h, S, 301, { bw: 8, bh: 4, ragged: true });
        // the hall behind the portico, in shadow: paintings on its wall, a doorway of light
        px(c, x + 3, y + 6, w - 6, h - 9, S[DEEP]);
        const gap = (w - 6) / cols;
        for (let k = 0; k < cols - 1; k++) painting(c, Math.round(x + 3 + gap * (k + 0.5) + gap / 2 - 2), y + 10, k + L);
        px(c, x + Math.round(w / 2) - 3, y + h - 12, 6, 9, VOID);
        px(c, x + Math.round(w / 2) - 2, y + h - 11, 4, 8, GLOW[SHADE]);
        // banners between some columns, one more every few levels
        for (let k = 0; k < Math.min(cols - 1, 1 + Math.floor(L / 4)); k += 2) {
          const bx = Math.round(x + 3 + gap * (k + 1)) - 2;
          px(c, bx, y + 7, 4, 10, banner[MID]);
          px(c, bx, y + 7, 1, 10, banner[LIT]);
          px(c, bx + 1, y + 10, 2, 2, M.BRASS[LIT]);
        }
        // the portico
        for (let k = 0; k <= cols; k++) column(c, Math.round(x + 1 + ((w - 5) * k) / cols), y + 4, h - 7, S, tier >= 1);
        px(c, x - 1, y + 2, w + 2, 3, S[LIT]); // architrave
        px(c, x - 1, y + 4, w + 2, 1, S[SHADE]);
        // steps
        for (let st = 0; st < 3; st++) {
          px(c, x - 2 + st, y + h - 3 + st, w + 4 - st * 2, 1, S[st ? MID : LIT]);
        }
      },
      extras: (c, g) => {
        // the pediment: a low triangle over the portico, a frieze of figures carved in it
        const cx = g.x0 + g.fw / 2;
        const base = g.top + 1;
        for (let r = 0; r < 9; r++) {
          const half = Math.round(((r + 1) / 9) * (g.fw / 2 + 2));
          px(c, cx - half, base - 9 + r, half * 2, 1, S[r < 2 ? LIT : MID]);
        }
        px(c, cx - g.fw / 2 - 2, base, g.fw + 4, 1, S[SHADE]);
        for (let k = -3; k <= 3; k++) px(c, cx + k * 4, base - 4 + Math.abs(k) / 2, 2, 3, S[SHADE]); // figures
        if (tier >= 1) px(c, cx - 1, base - 12, 3, 3, M.BRASS[LIT]); // a gilt acroterion
        if (tier >= 2) {
          // a dome over the hall, a lantern of light on its crown
          const dx = cx + Math.round(g.dx / 2);
          const dy = g.top - g.rise + Math.round(g.dy / 2) - 2;
          const r = 11;
          for (let y = 0; y < r; y++) {
            const half = Math.round(Math.sqrt(r * r - y * y));
            for (let x = -half; x < half; x++) px(c, dx + x, dy - y, 1, 1, M.COPPER[x < -half * 0.4 ? LIT : x < half * 0.35 ? MID : SHADE]);
          }
          px(c, dx - 2, dy - r - 4, 4, 4, S[MID]);
          px(c, dx - 1, dy - r - 3, 2, 2, E.AMBER[1]);
        }
      },
    });
    const base = hall.height - 2;
    const W = hall.width + 16;
    const statues = sheet(W, hall.height, (c) => {
      statue(c, 1, base - 14, S);
      if (L >= 5) statue(c, hall.width + 6, base - 14, S);
      if (L >= 15) px(c, hall.width + 4, base - 1, 10, 1, M.BRASS[MID]);
    });
    const parts: Part[] = [{ cv: hall, x: 8 }, { cv: statues, x: 0 }];
    return stack(W, parts).cv;
  });
}
