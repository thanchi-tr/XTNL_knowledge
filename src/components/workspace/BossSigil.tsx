/**
 * A procedural sigil per Boss — the enemy's face on its card, and the face
 * of the "boss won" Seal.
 *
 * Derived entirely from the Field id and tier, so a given creature looks
 * the same every time you meet it and visibly *changes* when it respawns
 * stronger. Same rules as `SkillLogo`: geometry only, no image files, no
 * model involved, and every coordinate rounded so server and client agree
 * (`Math.sin` is implementation-defined — see that file's ringPoints note).
 *
 * Drawn on the coin face every crest, emblem and medallion shares (#0d1017),
 * with a material rim: silver when it can be fought, iron while it gathers
 * or is sealed. The glyph is ink; nothing here is a status colour.
 */
import { materialGradientId } from "@/lib/materials";

interface Props {
  /** Stable per-Field seed; the bestiary index is already derived from this upstream. */
  seed: string;
  tier: number;
  size?: number;
  /** Dimmed when the encounter isn't available yet. */
  muted?: boolean;
  className?: string;
  /** Give a label when the sigil stands alone; otherwise it is decorative. */
  label?: string;
}

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function r2(n: number): number {
  return Number(n.toFixed(2));
}

const FACE = "#0d1017";

export function BossSigil({ seed, tier, size = 56, muted = false, className, label }: Props) {
  const h = hash(seed);
  // Spikes grow with tier — the same creature at tier 5 reads as visibly
  // more dangerous than at tier 1 without needing a number.
  const spikes = 5 + ((h % 3) + Math.min(4, tier - 1));
  const innerSides = 3 + (h % 4);
  const rotation = h % 60;

  const outer = Array.from({ length: spikes }, (_, i) => {
    const a = ((rotation + (360 / spikes) * i) * Math.PI) / 180;
    const long = i % 2 === 0;
    const rad = long ? 21 : 13;
    return `${r2(32 + rad * Math.cos(a))},${r2(32 + rad * Math.sin(a))}`;
  }).join(" ");

  const inner = Array.from({ length: innerSides }, (_, i) => {
    const a = ((rotation + 180 + (360 / innerSides) * i) * Math.PI) / 180;
    return `${r2(32 + 8.5 * Math.cos(a))},${r2(32 + 8.5 * Math.sin(a))}`;
  }).join(" ");

  const rim = `url(#${materialGradientId(muted ? "iron" : "silver")})`;
  const ink = muted ? "var(--ink-mute)" : "#c3cad8";

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <circle cx="32" cy="32" r="29" fill={FACE} stroke={rim} strokeWidth={2.6} />
      <circle cx="32" cy="32" r="25" fill="none" stroke={rim} strokeOpacity={0.3} strokeWidth={1} />
      <polygon points={outer} fill="none" stroke={ink} strokeWidth={1.6} strokeLinejoin="round" />
      <polygon points={inner} fill={ink} fillOpacity={0.14} stroke={ink} strokeWidth={1} strokeLinejoin="round" />
      {/* The eye. One per creature, always looking straight out. */}
      <circle cx="32" cy="32" r={3.4} fill={muted ? "var(--ink-mute)" : "#f1f3f8"} />
      <circle cx="32" cy="32" r={1.3} fill={FACE} />
    </svg>
  );
}
