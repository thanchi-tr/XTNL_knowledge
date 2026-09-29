import { Grid } from "./sprites";

/**
 * The desert's and the floating isles' own monsters (lib/town/sim/biomes),
 * built from shapes on the same grid as every other beast, so they go
 * through the same shader, outline and three looks. Material letters are
 * mapped in ./sprites (MONSTER_DEFS); a capital is its letter one shade up.
 */

// ── The desert ────────────────────────────────────────────

/** A giant scorpion: a low segmented body, pincers forward, the tail arched over its back. */
export function scorpion(): string[] {
  const g = new Grid(28, 17);
  // legs, four a side, under the body
  for (let k = 0; k < 4; k++) {
    const x = 9 + k * 3;
    g.path([[x, 12], [x - 1.5, 14.5], [x - 2.5, 16]], "l", 1);
  }
  g.ellipse(13, 11.5, 7.5, 2.8, "b");
  for (let k = 0; k < 4; k++) g.line(8 + k * 3, 9.5, 8 + k * 3, 13, "B", 1); // segment ridges
  g.ellipse(5.5, 11.5, 3, 2.4, "b");
  // pincers
  g.path([[4, 10], [1.5, 7.5]], "c", 1.8, 1.4);
  g.poly([[0, 5.5], [3, 5], [3.6, 7.6], [1.5, 8.5], [0, 7.8]], "c");
  g.set(1.5, 6.4, "k");
  g.path([[4, 13], [1.5, 15]], "c", 1.6, 1.2);
  // the tail: five segments arching over, the sting hanging forward
  g.path([[20, 11], [23.5, 8], [24.5, 4.5], [22.5, 1.6], [19, 1.4]], "b", 2.6, 1.8);
  g.path([[19, 1.4], [17.2, 3.2]], "s", 1.4, 0.7);
  g.set(4.2, 10.2, "y");
  g.set(5.6, 10, "y");
  return g.rows();
}

/** A jackal: long-legged and lean, ears up, tail low, running. */
export function jackal(): string[] {
  const g = new Grid(30, 18);
  g.path([[5, 9], [2, 11], [0.6, 12.4]], "w", 2.6, 1.2);
  g.ellipse(13, 9.5, 8, 3.4, "w");
  g.ellipse(12.5, 11.4, 6, 1.4, "b");
  // legs mid-stride
  g.path([[7, 12], [5, 15], [3.5, 17]], "w", 1.6, 1.2);
  g.path([[9.5, 12], [10.5, 15], [10, 17]], "w", 1.6, 1.2);
  g.path([[17, 12], [18.5, 15], [20, 17]], "w", 1.6, 1.2);
  g.path([[19, 11.5], [21, 14], [22.5, 16.6]], "w", 1.6, 1.2);
  // neck, head and the long muzzle
  g.path([[19.5, 8], [22.5, 5.5]], "w", 4, 3.4);
  g.ellipse(24, 5.4, 3, 2.4, "w");
  g.poly([[25, 4.2], [29.4, 5.6], [29, 7], [25, 7]], "w");
  g.set(29, 5.8, "n");
  g.line(26, 6.8, 28.6, 6.8, "t");
  // tall ears
  g.poly([[22, 3.8], [22.4, 0], [24, 3.2]], "w");
  g.poly([[24.2, 3.2], [25.6, 0.2], [26, 3.6]], "w");
  g.set(23, 2.4, "b");
  g.set(25.2, 2.2, "b");
  g.set(25.4, 4.6, "y");
  return g.rows();
}

/** A mummy: a figure wound in linen, arms out, eyes burning in the gap of its wrappings. */
export function mummy(): string[] {
  const g = new Grid(18, 24);
  g.ellipse(9, 5, 3.6, 3.8, "r");
  g.poly([[5, 8], [13, 8], [13.5, 17], [4.5, 17]], "r");
  // legs, stiff
  g.poly([[5, 17], [8.5, 17], [8.2, 23], [5.4, 23]], "r");
  g.poly([[9.5, 17], [13, 17], [12.6, 23], [9.8, 23]], "r");
  // arms held out before it
  g.path([[5.5, 9.5], [2, 11], [0.6, 11]], "r", 2.2, 1.8);
  g.path([[12.5, 9.5], [16, 11], [17.4, 11]], "r", 2.2, 1.8);
  // the wrappings: bands of lighter cloth wound round, and a loose end
  for (let y = 2; y < 23; y += 2) for (let x = 3; x < 16; x++) if ((x + y) % 5 === 0) g.set(x, y, "R");
  g.path([[12, 14], [14.5, 17], [15, 20]], "r", 1, 0.7);
  g.line(6.6, 4.4, 11.4, 4.4, "k");
  g.set(7.4, 4.4, "y");
  g.set(10.6, 4.4, "y");
  g.set(3, 20, "d");
  g.set(14, 22, "d");
  return g.rows();
}

/** A sandworm: segments rising in a curve out of a mound of sand, its round maw ringed with teeth. */
export function sandworm(): string[] {
  const g = new Grid(40, 34);
  // the mound it breaks out of
  g.ellipse(26, 31, 13, 3, "d");
  g.ellipse(26, 30, 9, 2, "D");
  // body segments along the curve, largest at the base
  const pts: [number, number, number][] = [[27, 27, 6.4], [24, 21.5, 6], [20, 16.5, 5.6], [15.5, 12.5, 5.2], [11, 9.5, 5]];
  pts.forEach(([x, y, r], k) => {
    g.ellipse(x, y, r, r * 0.9, "s");
    g.line(x - r * 0.7, y + r * 0.6, x + r * 0.5, y - r * 0.7, "r", 1.2); // the ring between segments
    if (k % 2 === 0) g.set(x - r * 0.3, y - r * 0.4, "S");
  });
  // the maw, open toward the town, ringed with teeth
  g.ellipse(7, 7, 5.5, 5, "s");
  g.ellipse(6, 6.5, 3.8, 3.4, "m");
  for (let a = 0; a < 10; a++) {
    const t = (a / 10) * Math.PI * 2;
    g.set(6 + Math.cos(t) * 3.4, 6.5 + Math.sin(t) * 3.1, "t");
  }
  g.ellipse(5.6, 6.4, 1.4, 1.2, "k");
  return g.rows();
}

/** A djinn: a broad torso over a tail of smoke, arms folded, a turban and burning eyes. */
export function djinn(): string[] {
  const g = new Grid(28, 32);
  // the smoke it rises out of, curling to a point
  g.path([[14, 18], [12, 23], [15, 27], [19, 29], [22, 30.5]], "c", 6, 1);
  g.path([[12, 22], [9, 26]], "C", 2, 0.8);
  // the torso and shoulders
  g.poly([[7, 9], [21, 9], [18, 19], [10, 19]], "s");
  g.ellipse(7, 10.5, 3, 2.6, "s");
  g.ellipse(21, 10.5, 3, 2.6, "s");
  // arms folded across the chest, gold at the wrists
  g.path([[6, 12], [8, 16], [16, 15.5]], "s", 2.6, 2.4);
  g.path([[22, 12], [20, 16], [12, 15]], "s", 2.6, 2.4);
  g.set(8.5, 15.6, "g");
  g.set(19.5, 15.8, "g");
  g.line(10, 18.4, 18, 18.4, "g");
  // the head and turban, a jewel at its front
  g.ellipse(14, 6.4, 3.4, 3.2, "s");
  g.ellipse(14, 3.2, 4.4, 2.6, "c");
  g.poly([[13, 1], [15, 1], [14, -0.6]], "c");
  g.set(14, 3, "j");
  g.set(12.7, 6.4, "y");
  g.set(15.3, 6.4, "y");
  g.line(12.6, 8.4, 15.4, 8.4, "k");
  return g.rows();
}

/** A sphinx: a lion couchant, wings folded along its back, a pharaoh's striped headdress and a stone face. */
export function sphinx(): string[] {
  const g = new Grid(44, 30);
  // the lion's body, lying, forepaws stretched out before it
  g.ellipse(24, 21, 13, 5.4, "b");
  g.ellipse(33, 22, 6, 4.6, "b");
  g.poly([[4, 25], [16, 24], [16, 27.5], [3, 28]], "b");
  g.set(4, 27.4, "B");
  g.set(6, 27.4, "B");
  g.path([[36, 19], [40, 15], [42.5, 17]], "b", 1.6, 1);
  // folded wings along the back, feathered
  g.poly([[14, 17], [30, 13], [36, 17], [22, 19]], "w");
  for (let x = 18; x < 34; x += 3) g.line(x, 15.5, x + 2, 18, "W", 1);
  // the chest and the head, high
  g.ellipse(13, 17, 5, 5.6, "b");
  g.ellipse(12, 9, 4, 4.4, "f");
  // the headdress: striped lappets down each side, a band across the brow
  g.poly([[7, 7], [17, 7], [18.5, 16], [5.5, 16]], "h");
  for (let y = 8; y < 16; y += 2) g.line(6, y, 18, y, "s");
  g.ellipse(12, 9.4, 3.2, 3.6, "f");
  g.line(8.6, 6.2, 15.4, 6.2, "h");
  g.set(12, 4.4, "g");
  g.set(10.8, 9, "y");
  g.set(13.2, 9, "y");
  g.line(11, 11.6, 13, 11.6, "k");
  return g.rows();
}

// ── The floating isles ────────────────────────────────────

/** A pixie: a scrap of a figure between two glassy wings, trailing light. */
export function pixie(): string[] {
  const g = new Grid(16, 13);
  g.ellipse(4, 4.5, 3.6, 2.6, "w");
  g.ellipse(12, 4.5, 3.6, 2.6, "w");
  g.ellipse(4.5, 8.5, 2.6, 1.8, "w");
  g.ellipse(11.5, 8.5, 2.6, 1.8, "w");
  g.set(3, 4, "W");
  g.set(13, 4, "W");
  g.ellipse(8, 7, 1.6, 2.6, "b");
  g.ellipse(8, 3.6, 1.8, 1.8, "f");
  g.line(6.6, 2, 9.4, 2, "h");
  g.set(7.3, 3.6, "y");
  g.set(8.7, 3.6, "y");
  g.set(8, 10.6, "g");
  g.set(8, 12, "g");
  return g.rows();
}

/** A sky ray: a manta of the open air, wide and flat, the barbed tail streaming. */
export function skyray(): string[] {
  const g = new Grid(32, 15);
  g.poly([[1, 7], [10, 2.5], [16, 3.5], [22, 2.5], [31, 7], [22, 10], [16, 11], [10, 10]], "w");
  g.poly([[9, 8], [16, 6], [23, 8], [16, 10.5]], "b");
  // the head lobes, forward
  g.poly([[13, 3.4], [14, 0.6], [15.2, 3.2]], "w");
  g.poly([[16.8, 3.2], [18, 0.6], [19, 3.4]], "w");
  g.set(14, 4.2, "y");
  g.set(18, 4.2, "y");
  for (let x = 5; x < 28; x += 4) g.set(x, 6.4 - Math.abs(x - 16) / 10, "W");
  // the tail and its barb
  g.path([[16, 11], [16.5, 13], [18, 14.4]], "t", 1, 0.6);
  g.set(18.6, 14.4, "s");
  return g.rows();
}

/** A cloud jelly: a bell of mist with a glow in its heart, stinging threads trailing under it. */
export function cloudjelly(): string[] {
  const g = new Grid(20, 24);
  // threads first, so the bell hangs over them
  for (const x of [5, 8, 11, 14]) g.path([[x, 9], [x + (x % 2 ? 1.5 : -1.5), 15], [x, 20], [x + 1, 23.4]], "t", 1, 0.6);
  g.ellipse(10, 6.5, 8.4, 5.6, "c");
  g.poly([[1.6, 7], [18.4, 7], [16.5, 10.4], [3.5, 10.4]], "c");
  for (let x = 3; x < 18; x += 3) g.set(x, 10.4, "C");
  g.ellipse(10, 6.6, 3.6, 2.8, "g");
  g.ellipse(6, 3.6, 1.8, 1, "C");
  return g.rows();
}

/** A thunderbird: wings raised wide, lightning marked on them, eyes like struck sparks. */
export function thunderbird(): string[] {
  const g = new Grid(36, 26);
  const wing = (dir: 1 | -1) => {
    const X = (x: number) => 18 + dir * x;
    g.poly([[X(3), 12], [X(9), 4], [X(16), 1], [X(17.4), 5], [X(15), 9], [X(12), 13], [X(6), 15]], "w");
    for (let k = 0; k < 4; k++) g.line(X(8 + k * 2.2), 5 + k * 0.6, X(9 + k * 2.2), 12 - k, "W", 1); // flight feathers
    // the lightning marked across it
    g.path([[X(7), 7], [X(10), 9], [X(9), 10.6], [X(13), 12]], "z", 1);
  };
  wing(1);
  wing(-1);
  // body, tail fanned below
  g.ellipse(18, 14, 4, 5.6, "w");
  g.ellipse(18, 14.6, 2.4, 4, "b");
  g.poly([[15, 18.5], [21, 18.5], [23, 24.6], [18, 22.4], [13, 24.6]], "w");
  g.path([[16, 20.5], [18, 23], [20, 20.5]], "z", 1);
  // head and the hooked beak
  g.ellipse(18, 7.4, 2.8, 2.6, "w");
  g.poly([[18.4, 8], [21, 8.6], [19.6, 10.4]], "k");
  g.set(17.2, 7, "y");
  g.set(19.2, 7, "y");
  return g.rows();
}

/** A storm giant: huge and blue-grey, a beard of cloud, a mail shirt and a hammer that rings like thunder. */
export function stormgiant(): string[] {
  const g = new Grid(30, 36);
  // legs
  g.poly([[9, 24], [14, 24], [13.5, 34], [8.5, 34]], "s");
  g.poly([[16, 24], [21, 24], [21.5, 34], [16.5, 34]], "s");
  g.line(8, 34.6, 14, 34.6, "a", 1.4);
  g.line(16, 34.6, 22.5, 34.6, "a", 1.4);
  // the body in mail
  g.poly([[7, 11], [23, 11], [22, 25], [8, 25]], "a");
  for (let y = 12; y < 25; y += 2) for (let x = 8 + (y % 4 === 0 ? 0 : 1); x < 22; x += 2) g.set(x, y, "A");
  g.line(8, 23, 22, 23, "m", 1.4); // the belt
  // arms: one hanging, one bearing the hammer up
  g.path([[7, 12], [4.4, 18], [4, 23]], "s", 3, 2.6);
  g.path([[23, 12], [26, 9], [27, 5]], "s", 3, 2.6);
  g.line(27, 7, 27.4, -1, "m", 1.2); // the haft
  g.poly([[24, -0.4], [30, -0.4], [30, 3.4], [24, 3.4]], "m");
  g.set(29, 0.6, "y");
  // head, and the beard of cloud spilling over the chest
  g.ellipse(15, 6.4, 4.2, 4.4, "s");
  g.ellipse(15, 11.4, 5.4, 3.6, "h");
  g.ellipse(15, 14.6, 3.2, 2, "h");
  g.ellipse(15, 3, 4.6, 2, "h");
  g.set(13.4, 6, "y");
  g.set(16.6, 6, "y");
  return g.rows();
}

/** A sky serpent: a long body coiling through the air, finned along its back, horned and whiskered. */
export function skyserpent(): string[] {
  const g = new Grid(50, 28);
  // the body along an S, thick at the middle and thin at the tail
  const body: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    body.push([2 + u * 38, 14 + Math.sin(u * Math.PI * 2.2) * 7]);
  }
  for (let i = 0; i < body.length - 1; i++) {
    const u = i / (body.length - 1);
    const r = 1 + Math.sin(u * Math.PI * 0.95) * 3.4;
    g.line(body[i][0], body[i][1], body[i + 1][0], body[i + 1][1], "s", r * 2);
    if (i % 3 === 0) g.set(body[i][0], body[i][1] + r * 0.6, "b"); // the pale belly scales
    if (i % 4 === 0 && i > 2 && i < 38) g.poly([[body[i][0] - 1, body[i][1] - r], [body[i][0] + 1, body[i][1] - r - 3], [body[i][0] + 2.4, body[i][1] - r]], "f");
  }
  // the head, turned toward the town
  const [hx, hy] = body[body.length - 1];
  g.ellipse(hx + 3.5, hy - 1, 4.4, 3.2, "s");
  g.poly([[hx + 6, hy - 1.6], [hx + 9.6, hy - 0.4], [hx + 6, hy + 1.2]], "s");
  g.path([[hx + 2, hy - 3.4], [hx - 1, hy - 7]], "h", 1.2, 0.6);
  g.path([[hx + 4, hy - 3.6], [hx + 3, hy - 7.6]], "h", 1.2, 0.6);
  g.path([[hx + 7, hy + 0.6], [hx + 10, hy + 3.4]], "f", 1, 0.5); // a whisker
  g.set(hx + 4.6, hy - 1.6, "y");
  return g.rows();
}
