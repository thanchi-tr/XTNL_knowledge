import { cached, makeCanvas, outline, px } from "./core";
import { M, E, LIT, MID, SHADE, DEEP } from "./materials";
import { figure, type Look } from "./heroes";

/**
 * A champion turned to stone: their figure, every pixel turned to marble by
 * how light it was, stood on a plinth. As offerings are worked in, the stone
 * falls away from the feet up — the part restored shows in its own colours,
 * with a line of gold where the stone is giving way.
 */
export function statueSprite(look: Look, restore: number): HTMLCanvasElement {
  const r = Math.max(0, Math.min(10, Math.floor(restore * 10)));
  return cached(`statue:${look}:${r}`, () => {
    const fig = figure(look, 0);
    const W = fig.width + 6;
    const H = fig.height + 8;
    const { cv, c } = makeCanvas(W, H);
    // the plinth
    px(c, 1, H - 6, W - 2, 6, M.MARBLE[MID]);
    px(c, 1, H - 6, W - 2, 1, M.MARBLE[LIT]);
    px(c, 1, H - 1, W - 2, 1, M.MARBLE[SHADE]);
    px(c, W - 3, H - 6, 2, 6, M.MARBLE[SHADE]);
    // the figure, turned to stone above the line restoration has reached
    const src = fig.getContext("2d")!.getImageData(0, 0, fig.width, fig.height);
    const d = src.data;
    const line = Math.round(fig.height * (1 - r / 10));
    const ramp = [M.MARBLE[LIT], M.MARBLE[MID], M.MARBLE[SHADE], M.MARBLE[DEEP]];
    for (let y = 0; y < fig.height; y++) {
      for (let x = 0; x < fig.width; x++) {
        const i = (y * fig.width + x) * 4;
        if (d[i + 3] === 0) continue;
        if (y >= line) {
          c.fillStyle = `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`;
          c.fillRect(x + 3, y + 2, 1, 1);
          continue;
        }
        const lum = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
        px(c, x + 3, y + 2, 1, 1, ramp[lum > 0.65 ? 0 : lum > 0.4 ? 1 : lum > 0.2 ? 2 : 3]);
      }
    }
    outline(cv);
    // where the stone is giving way, a line of gold
    if (r > 0 && r < 10) for (let x = 3; x < fig.width + 3; x += 2) px(c, x, line + 2, 1, 1, E.GOLD[1]);
    return cv;
  });
}
