/**
 * The colour lab: WCAG 2.x contrast and OKLab ΔE×100 under simulated colour
 * vision (Machado 2009, severity 1). Pure; shared by /dev/style (live, from
 * computed CSS variables) and scripts/contrast-check.ts (from tokens.css).
 * Mirrors scratchpad/redesign/final-src/lab.mjs, which measured the tokens.
 */

export type Rgb = [number, number, number];
export type Vision = "normal" | "protan" | "deutan" | "tritan";

const MACHADO: Record<Exclude<Vision, "normal">, number[][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

/** "#abc", "#aabbcc", "rgb(…)" or "rgba(…)" → 0..255 channels and alpha. Null when unparseable. */
export function parseColor(input: string): { rgb: Rgb; a: number } | null {
  const s = input.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return { rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb, a: 1 };
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(s);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
    return { rgb: [parts[0], parts[1], parts[2]], a: parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1 };
  }
  if (s === "#fff" || s === "white") return { rgb: [255, 255, 255], a: 1 };
  return null;
}

/** A translucent colour over an opaque background → the opaque colour you see. */
export function composite(fg: { rgb: Rgb; a: number }, bg: Rgb): Rgb {
  return fg.rgb.map((c, i) => Math.round(c * fg.a + bg[i] * (1 - fg.a))) as Rgb;
}

export function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;
}

const s2l = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin = (rgb: Rgb): Rgb => rgb.map((c) => s2l(c / 255)) as Rgb;

export function luminance(rgb: Rgb): number {
  const [r, g, b] = lin(rgb);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio. */
export function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function oklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function simulate(rgb: Rgb, vision: Vision): Rgb {
  const c = lin(rgb);
  if (vision === "normal") return c;
  const X = MACHADO[vision];
  return X.map((row) => Math.max(0, Math.min(1, row[0] * c[0] + row[1] * c[1] + row[2] * c[2]))) as Rgb;
}

/** OKLab ΔE × 100 between two colours as seen with `vision`. */
export function deltaE(a: Rgb, b: Rgb, vision: Vision = "normal"): number {
  const p = oklab(simulate(a, vision));
  const q = oklab(simulate(b, vision));
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** Token groups the gates are written against (redesign.md › Acceptance 1). */
export const SURFACES = ["--page", "--card", "--raised", "--overlay", "--sunken"] as const;
export const TEXT_TOKENS = ["--ink-0", "--ink-1", "--ink-2", "--kept", "--owed", "--held", "--xp", "--pts", "--mp"] as const;
export const MARK_TOKENS = ["--ink-mute", "--line-ctl"] as const;
export const TEXT_MIN = 4.5;
export const MARK_MIN = 3;
export const LEDGER_DE_MIN = 8;
