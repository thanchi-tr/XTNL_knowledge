/**
 * A procedural sigil per Boss — the enemy's face on its card.
 *
 * Derived entirely from the Field id and tier, so a given creature looks
 * the same every time you meet it and visibly *changes* when it respawns
 * stronger. Same rules as `SkillLogo`: geometry only, no image files, no
 * model involved, and every coordinate rounded so server and client agree
 * (`Math.sin` is implementation-defined — see that file's ringPoints note).
 */

interface Props {
  /** Stable per-Field seed; the bestiary index is already derived from this upstream. */
  seed: string;
  tier: number;
  size?: number;
  /** Dimmed when the encounter isn't available yet. */
  muted?: boolean;
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

export function BossSigil({ seed, tier, size = 44, muted = false }: Props) {
  const h = hash(seed);
  // Spikes grow with tier — the same creature at tier 5 reads as visibly
  // more dangerous than at tier 1 without needing a number.
  const spikes = 5 + ((h % 3) + Math.min(4, tier - 1));
  const innerSides = 3 + (h % 4);
  const rotation = h % 60;

  const outer = Array.from({ length: spikes }, (_, i) => {
    const a = ((rotation + (360 / spikes) * i) * Math.PI) / 180;
    const long = i % 2 === 0;
    const rad = long ? 27 : 17;
    return `${r2(32 + rad * Math.cos(a))},${r2(32 + rad * Math.sin(a))}`;
  }).join(" ");

  const inner = Array.from({ length: innerSides }, (_, i) => {
    const a = ((rotation + 180 + (360 / innerSides) * i) * Math.PI) / 180;
    return `${r2(32 + 11 * Math.cos(a))},${r2(32 + 11 * Math.sin(a))}`;
  }).join(" ");

  const stroke = muted ? "var(--ink-3)" : "var(--amber)";
  const eye = muted ? "var(--ink-3)" : "var(--red)";

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      {!muted && (
        <defs>
          <radialGradient id={`boss-glow-${seed}-${tier}`} cx="32" cy="32" r="30" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#f0a030" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#f0a030" stopOpacity="0" />
          </radialGradient>
        </defs>
      )}
      {!muted && <circle cx="32" cy="32" r="30" fill={`url(#boss-glow-${seed}-${tier})`} />}

      <polygon points={outer} fill="none" stroke={stroke} strokeWidth={1.6} strokeOpacity={muted ? 0.5 : 0.9} strokeLinejoin="round" />
      <polygon points={inner} fill={stroke} fillOpacity={muted ? 0.08 : 0.16} stroke={stroke} strokeWidth={1} strokeOpacity={muted ? 0.4 : 0.7} strokeLinejoin="round" />

      {/* The eye. One per creature, always looking straight out. */}
      <circle cx="32" cy="32" r={4.2} fill={eye} fillOpacity={muted ? 0.35 : 1} />
      <circle cx="32" cy="32" r={1.6} fill="#04080f" />
    </svg>
  );
}
