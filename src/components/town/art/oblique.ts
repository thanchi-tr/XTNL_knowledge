import { makeCanvas, outline, cached, hash, px, type Ctx } from "./core";
import { M, LIT, MID, SHADE, DEEP, sag, sagFor, shift, occlude, roofTexel, eaveLine, type Ramp4, type RoofMat } from "./materials";
import { masonry, halfTimber, casement, doorway, boards, chimney, flowerBox } from "./textures";

/**
 * Oblique buildings: a front face, a side face receding up-right into shade,
 * and a roof that spans both.
 *
 * The flat-front buildings read as cardboard cut-outs next to good pixel-art
 * sets, and the difference is one plane: a visible side wall, darker than the
 * front, is what turns a facade into a volume. The side face and roof slopes
 * are filled per-pixel through an inverse mapping onto their own texture
 * space, so roof courses run *along* a slope and stone courses stay level on
 * a sheared wall — rather than a flat texture pasted onto a skewed shape.
 */

type Pt = [number, number];

/**
 * Fills the parallelogram O + a·u + b·v (a, b ∈ [0,1)) pixel by pixel, asking
 * `shade` for the colour at each (a, b). Pixel-exact: no canvas clipping, so
 * no anti-aliased edges leaking half-tones into the art.
 */
export function fillQuad(c: Ctx, O: Pt, u: Pt, v: Pt, shade: (a: number, b: number) => string | null) {
  const xs = [O[0], O[0] + u[0], O[0] + v[0], O[0] + u[0] + v[0]];
  const ys = [O[1], O[1] + u[1], O[1] + v[1], O[1] + u[1] + v[1]];
  const det = u[0] * v[1] - u[1] * v[0];
  if (Math.abs(det) < 1e-6) return;
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      const px0 = x + 0.5 - O[0];
      const py0 = y + 0.5 - O[1];
      const a = (px0 * v[1] - py0 * v[0]) / det;
      const b = (u[0] * py0 - u[1] * px0) / det;
      if (a < 0 || a >= 1 || b < 0 || b >= 1) continue;
      const col = shade(a, b);
      if (col) {
        c.fillStyle = col;
        c.fillRect(x, y, 1, 1);
      }
    }
  }
}

/**
 * Renders a texture once, turns it away from the sun — every palette pixel
 * one step down its own ramp, nothing lighter than the shade — then samples
 * it by (a, b) for mapping onto the sheared side face.
 */
function sideSampler(w: number, h: number, draw: (c: Ctx) => void, eaveBand: number) {
  const { c } = makeCanvas(w, h);
  draw(c);
  shift(c, 0, 0, w, h, 1, SHADE);
  // The roof's verge overhangs the side wall too.
  occlude(c, 0, w, () => 0, eaveBand);
  const d = c.getImageData(0, 0, w, h).data;
  return (a: number, b: number) => {
    const x = Math.min(w - 1, Math.floor(a * w));
    const y = Math.min(h - 1, Math.floor(b * h));
    const i = (y * w + x) * 4;
    if (d[i + 3] === 0) return null;
    return `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`;
  };
}

interface HouseSpec {
  key: string;
  fw: number; // front width
  depth: number; // receding depth, drawn as (depth, -depth/2)
  wallH: number;
  rise: number; // roof height
  roof: RoofMat;
  ridge: "across" | "along"; // eaves to the street, or gable to the street
  /** Stone for the plain side wall when no `side` is given; match it to the front. */
  stone?: Ramp4;
  front: (c: Ctx, x: number, y: number, w: number, h: number) => void;
  side?: (c: Ctx, w: number, h: number) => void;
  extras?: (c: Ctx, geo: Geo) => void;
}

export interface Geo {
  x0: number; // front-left, bottom
  yb: number;
  fw: number;
  dx: number;
  dy: number;
  wallH: number;
  rise: number;
  top: number; // y of the wall top on the front face
}

export function obliqueHouse(spec: HouseSpec): HTMLCanvasElement {
  return cached(`obl:${spec.key}`, () => {
    const dx = spec.depth;
    const dy = -Math.round(spec.depth / 2);
    const W = spec.fw + dx + 6;
    const H = spec.wallH + spec.rise + -dy + 10;
    const { cv, c } = makeCanvas(W, H);
    const x0 = 2;
    const yb = H - 2;
    const top = yb - spec.wallH;
    const geo: Geo = { x0, yb, fw: spec.fw, dx, dy, wallH: spec.wallH, rise: spec.rise, top };
    const over = 2; // eave overhang
    const m = spec.roof;
    const along = spec.ridge === "along";

    // Side wall, sheared, turned into shade.
    const sideTex = sideSampler(
      dx,
      spec.wallH,
      (sc) => (spec.side ? spec.side(sc, dx, spec.wallH) : masonry(sc, 0, 0, dx, spec.wallH, spec.stone ?? M.STONE, 7, { bw: 6, bh: 3, damp: true })),
      along ? 3 : 2,
    );
    fillQuad(c, [x0 + spec.fw, top], [dx, dy], [0, spec.wallH], sideTex);

    // Front wall goes down before the roof, so the eave and its shadow can
    // be laid over it.
    spec.front(c, x0, top, spec.fw, spec.wallH);

    if (along) {
      // Gable to the street: ridge runs back along the depth.
      const apex: Pt = [x0 + spec.fw / 2, top - spec.rise];
      const sl = Math.hypot(spec.fw / 2, spec.rise);
      const lenD = Math.hypot(dx, dy);
      // Left slope faces the sun, right slope turns away. Courses run
      // parallel to the eave, which lies along the depth axis.
      fillQuad(c, [x0 - over, top + 1], [apex[0] - (x0 - over), apex[1] - top - 1], [dx, dy], (a, b) =>
        roofTexel(m, MID, Math.floor(b * lenD), Math.floor((1 - a) * sl), sl, 3),
      );
      fillQuad(c, apex, [x0 + spec.fw + over - apex[0], top + 1 - apex[1]], [dx, dy], (a, b) =>
        roofTexel(m, SHADE, Math.floor(b * lenD), Math.floor(a * sl), sl, 5),
      );
      // Front gable wall: daub between a tie beam, a king post and the rakes.
      for (let y = 0; y < spec.rise; y++) {
        const half = Math.round(((y + 1) / spec.rise) * (spec.fw / 2));
        if (half > 0) timberRow(c, x0 + spec.fw / 2 - half, top - spec.rise + y, half * 2, y);
      }
      // Bargeboards overhang the gable, so the rake throws a band of shadow
      // down its inside edge.
      for (let y = 0; y < spec.rise; y++) {
        const yy = top - spec.rise + y;
        const inner = Math.round(((y + 1) / spec.rise) * (spec.fw / 2));
        const l = Math.round(x0 + spec.fw / 2 - inner);
        const r = Math.round(x0 + spec.fw / 2 + inner);
        shift(c, l, yy, 3, 1, DEEP, DEEP);
        shift(c, r - 3, yy, 3, 1, DEEP, DEEP);
        shift(c, l + 3, yy, 1, 1, 1, SHADE);
        shift(c, r - 4, yy, 1, 1, 1, SHADE);
        const half = ((y + 1) / spec.rise) * (spec.fw / 2 + over);
        px(c, Math.round(x0 + spec.fw / 2 - half), yy, 1, 1, M.OAK[LIT]);
        px(c, Math.round(x0 + spec.fw / 2 - half) + 1, yy, 1, 1, M.OAK[MID]);
        px(c, Math.round(x0 + spec.fw / 2 + half - 1), yy, 1, 1, M.OAK[SHADE]);
        px(c, Math.round(x0 + spec.fw / 2 + half), yy, 1, 1, M.OAK[DEEP]);
      }
      // Tie beam across the wall head, sagging over the span. The gable sits
      // flush on it, so there is no overhang here to throw a shadow.
      const d = sagFor(spec.fw);
      for (let i = 0; i < spec.fw; i++) {
        const s = sag(i, spec.fw, d);
        px(c, x0 + i, top, 1, 2 + s, M.OAK[MID]);
        px(c, x0 + i, top + 1 + s, 1, 1, M.OAK[SHADE]);
      }
    } else {
      // Eaves to the street: front slope up to a ridge halfway back, gable on the side.
      const rise = spec.rise;
      const ridgeOff: Pt = [dx / 2, dy / 2 - rise];
      const lenA = spec.fw + over * 2;
      const lenT = Math.hypot(...ridgeOff);
      const rs = sagFor(lenA);
      // side gable triangle, on the shaded side plane
      const B: Pt = [x0 + spec.fw, top];
      fillQuad(c, B, [dx, dy], [0, -rise], (a, b) => (b > 1 - Math.abs(2 * a - 1) ? null : sideTex(a, (1 - b) * 0.4)));
      // front slope, its ridge sagging between the gables
      fillQuad(c, [x0 - over, top + 1], [lenA, 0], ridgeOff, (a, t) => {
        const X = Math.floor(a * lenA);
        const Y = Math.floor((1 - t) * lenT) - sag(X, lenA, rs);
        if (Y < 0) return null;
        return roofTexel(m, MID, X, Y, lenT, 9);
      });
      eaveLine(c, m, x0 - over, top + 1, lenA, 11, spec.fw >= 40 ? 4 : 3);
    }

    spec.extras?.(c, geo);
    outline(cv);
    return cv;
  });
}

/** One row of the timbered gable triangle. */
function timberRow(c: Ctx, x: number, y: number, w: number, r: number) {
  for (let i = 0; i < w; i++) {
    const beam = i === 0 || i === w - 1 || i === Math.floor(w / 2) || r % 6 === 5;
    c.fillStyle = beam ? M.OAK[MID] : M.DAUB[hash(x + i, y, 2) > 0.9 ? LIT : MID];
    c.fillRect(x + i, y, 1, 1);
  }
}

// ── The buildings ─────────────────────────────────────────

export function townhouse(variant: number, roof: RoofMat, lit: boolean): HTMLCanvasElement {
  const along = variant % 2 === 1;
  return obliqueHouse({
    key: `house:${variant}:${roof.ramp[DEEP]}:${lit}`,
    fw: 28,
    depth: 12,
    wallH: 24,
    rise: along ? 13 : 11,
    roof,
    ridge: along ? "along" : "across",
    front: (c, x, y, w, h) => {
      halfTimber(c, x, y, w, 12, variant);
      masonry(c, x, y + 12, w, h - 12, M.STONEWM, variant * 3, { bw: 6, bh: 3, damp: true, ragged: true });
      casement(c, x + 4, y + 5, 5, 4, lit, variant % 3 === 0);
      casement(c, x + w - 9, y + 5, 5, 4, lit, variant % 3 === 0);
      doorway(c, x + w / 2 - 3, y + h - 10, 6, 10);
      casement(c, x + 3, y + 16, 4, 3, lit);
      if (variant % 3 === 2) flowerBox(c, x + 3, y + 10, 7);
    },
    side: (c, w, h) => {
      halfTimber(c, 0, 0, w, 12, variant + 1);
      masonry(c, 0, 12, w, h - 12, M.STONEWM, variant, { bw: 5, bh: 3, damp: true });
      casement(c, 3, 5, 4, 4, lit);
    },
    extras: (c, g) => {
      if (!along) chimney(c, g.x0 + g.fw - 6 + Math.round(g.dx / 2), g.top - g.rise + Math.round(g.dy / 2) - 4, 8);
    },
  });
}

export function forge(level: number, roof: RoofMat): HTMLCanvasElement {
  const tier = Math.min(3, Math.floor(level / 3));
  return obliqueHouse({
    key: `forge:${tier}:${roof.ramp[DEEP]}`,
    fw: 44,
    depth: 14,
    wallH: 24,
    rise: 12,
    roof,
    ridge: "across",
    stone: M.STONEWM,
    front: (c, x, y, w, h) => {
      masonry(c, x, y, w, h, M.STONEWM, 33, { damp: true, ragged: true });
      // open workshop mouth — the fire itself is drawn live by the scene
      px(c, x + 6, y + 6, 22, h - 6, VOID_WARM[0]);
      px(c, x + 8, y + 12, 18, h - 12, VOID_WARM[1]);
      px(c, x + 10, y + h - 6, 14, 6, VOID_WARM[2]);
      boards(c, x + 4, y + 3, 26, 3, M.OAK, 3, false);
      // hanging sign
      px(c, x + 36, y + 7, 1, 2, M.IRON[SHADE]);
      boards(c, x + 32, y + 9, 10, 6, M.PINE, 5, false);
      px(c, x + 35, y + 11, 4, 2, M.IRON[MID]);
      px(c, x + 37, y + 13, 1, 1, M.OAK[SHADE]);
      for (let i = 0; i <= tier; i++) {
        px(c, x + 31 + i * 3, y + h - 8, 1, 7, M.IRON[MID]);
        px(c, x + 31 + i * 3, y + h - 8, 1, 1, M.IRON[LIT]);
      }
    },
    extras: (c, g) => {
      chimney(c, g.x0 + g.fw - 10 + Math.round(g.dx / 2), g.top - g.rise - 12, 20);
    },
  });
}

/** The forge mouth: soot, ember-lit floor, glowing hearth. Emissive, so outside the index. */
const VOID_WARM = ["#1C1016", "#3A1A18", "#6E2E16"] as const;

export function barracks(level: number, roof: RoofMat, bannerColor: Ramp4): HTMLCanvasElement {
  const tier = Math.min(2, Math.floor(level / 4));
  return cached(`barracks2:${tier}:${roof.ramp[DEEP]}:${bannerColor[MID]}`, () => {
    const hall = obliqueHouse({
      key: `barracksHall:${roof.ramp[DEEP]}:${bannerColor[MID]}`,
      fw: 52,
      depth: 14,
      wallH: 26,
      rise: 12,
      roof,
      ridge: "across",
      front: (c, x, y, w, h) => {
        halfTimber(c, x, y, w, 10, 42);
        masonry(c, x, y + 10, w, h - 10, M.STONE, 43, { damp: true, ragged: true });
        doorway(c, x + w / 2 - 4, y + h - 13, 8, 13);
        for (const wx of [4, 14, 34, 44]) casement(c, x + wx, y + 5, 4, 3, true);
        // war banner
        px(c, x + w / 2 + 8, y + 12, 5, 10, bannerColor[MID]);
        px(c, x + w / 2 + 8, y + 12, 1, 10, bannerColor[LIT]);
        px(c, x + w / 2 + 12, y + 12, 1, 10, bannerColor[SHADE]);
        px(c, x + w / 2 + 10, y + 15, 1, 3, M.BRASS[LIT]);
      },
    });
    const { cv: yardCv, c } = makeCanvas(hall.width + 30, hall.height);
    // training yard: fence, dummy, rack
    const yx = hall.width - 4;
    const gy = hall.height - 14;
    for (let x = yx; x < yx + 30; x += 4) {
      px(c, x, gy, 2, 12, M.PINE[MID]);
      px(c, x + 1, gy, 1, 12, M.PINE[SHADE]);
    }
    // rails, sagging between the end posts
    for (let i = 0; i < 30; i++) {
      const s = sag(i, 30, 2);
      px(c, yx + i, gy + 3 + s, 1, 1, M.PINE[LIT]);
      px(c, yx + i, gy + 4 + s, 1, 1, M.PINE[MID]);
      px(c, yx + i, gy + 8 + s, 1, 2, M.PINE[SHADE]);
    }
    px(c, yx + 12, gy - 16, 2, 18, M.OAK[MID]);
    px(c, yx + 13, gy - 16, 1, 18, M.OAK[SHADE]);
    px(c, yx + 8, gy - 12, 10, 2, M.OAK[MID]);
    px(c, yx + 10, gy - 12, 6, 8, M.SAND[MID]);
    px(c, yx + 10, gy - 12, 2, 8, M.SAND[LIT]);
    px(c, yx + 14, gy - 12, 2, 8, M.SAND[SHADE]);
    px(c, yx + 10, gy - 9, 6, 1, M.OAK[SHADE]); // lashing
    px(c, yx + 11, gy - 17, 4, 4, M.SAND[MID]);
    px(c, yx + 11, gy - 17, 2, 1, M.SAND[LIT]);
    for (let i = 0; i < 3 + tier * 2; i++) {
      px(c, yx + 21 + (i % 3) * 3, gy - 18 - (i >> 1), 1, 20, M.PINE[MID]);
      px(c, yx + 21 + (i % 3) * 3, gy - 20 - (i >> 1), 1, 2, M.IRON[LIT]);
    }
    // The yard is outlined on its own, then the hall laid over it: outlining
    // the composite would put a second ring round the already-outlined hall.
    outline(yardCv);
    const { cv, c: out } = makeCanvas(hall.width + 30, hall.height);
    out.drawImage(yardCv, 0, 0);
    out.drawImage(hall, 0, 0);
    return cv;
  });
}

