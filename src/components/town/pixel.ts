/**
 * A 3×5 pixel font for the numbers the scene prints on itself — building
 * levels and monster levels. Text drawn with `fillText` would be
 * anti-aliased and blur into the pixel grid; these glyphs stay on it.
 */
type Ctx = CanvasRenderingContext2D;

const GLYPHS: Record<string, string> = {
  "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111",
  "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001001010010",
  "8": "111101111101111", "9": "111101111001111", L: "100100100100111", V: "101101101101010",
};

export function text(c: Ctx, s: string, x: number, y: number, color: string) {
  c.fillStyle = color;
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = GLYPHS[ch];
    if (g) for (let i = 0; i < 15; i++) if (g[i] === "1") c.fillRect(cx + (i % 3), y + Math.floor(i / 3), 1, 1);
    cx += 4;
  }
}
