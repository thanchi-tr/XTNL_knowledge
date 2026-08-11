import type { Attribute } from "@prisma/client";
import { ATTRIBUTES } from "@/lib/attributes";
import type { Skill } from "@/lib/skill-pool";
import { RANK_META } from "@/lib/skill-visuals";
import { themeFor } from "@/lib/attribute-themes";

/**
 * A deterministic, procedurally computed emblem per skill — no external
 * image files, no LLM image generation. Not a client component: gradient
 * IDs derive from the already-unique `skill.code` rather than `useId()`, so
 * a 478-skill grid never pays a hydration cost per icon.
 *
 * Three independent visual channels, so a glance reads three facts:
 *   shape   ← attribute (polygon side count)
 *   colour  ← attribute theme (attribute-themes.ts)
 *   density ← rank and tier (rings, particles, core)
 *
 * Particles are reserved for APEX and ULTIMATE. A grid of hundreds of
 * animated icons would be unusable, so orbital motion is the reward for
 * reaching the two ranks that end a path.
 */

const ACCENT = "#2fd0ff";

function sidesFor(attribute: Attribute): number {
  const index = ATTRIBUTES.indexOf(attribute);
  return 3 + (index % 5); // 3..7 — triangle through heptagon
}

function polygonPoints(cx: number, cy: number, r: number, sides: number, rotationDeg = -90): string {
  const points: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = ((rotationDeg + (360 / sides) * i) * Math.PI) / 180;
    points.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(" ");
}

/** Evenly spaced points on a circle — the particle rings. */
function ringPoints(cx: number, cy: number, r: number, count: number, offsetDeg = 0) {
  return Array.from({ length: count }, (_, i) => {
    const angle = ((offsetDeg + (360 / count) * i) * Math.PI) / 180;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

interface Props {
  skill: Skill;
  size?: number;
  /** Particles cost a compositor layer each; the tree turns them off at node scale. */
  animated?: boolean;
}

export function SkillLogo({ skill, size = 40, animated = true }: Props) {
  const gradId = `sk-g-${skill.code}`;
  const glowId = `sk-glow-${skill.code}`;
  const primary = skill.attributes[0];
  const secondary = skill.attributes[1];
  const tierFrac = skill.rank === "PURE" ? Math.min(1, skill.tier / 5) : 1;

  const theme = themeFor(primary);
  const secondaryTheme = secondary ? themeFor(secondary) : theme;
  const rankColor = RANK_META[skill.rank].color;
  const legendary = skill.rank === "APEX" || skill.rank === "ULTIMATE";
  const showParticles = animated && legendary;

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={theme.bright} />
          <stop offset="55%" stopColor={theme.color} />
          <stop offset="100%" stopColor={legendary ? rankColor : theme.color} />
        </linearGradient>
        <radialGradient id={glowId} cx="32" cy="32" r="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={legendary ? rankColor : theme.color} stopOpacity="0.30" />
          <stop offset="100%" stopColor={theme.color} stopOpacity="0" />
        </radialGradient>
      </defs>

      {(skill.rank !== "PURE" || tierFrac > 0.4) && (
        <circle
          cx="32"
          cy="32"
          r={skill.rank === "PURE" ? 24 : 30}
          fill={`url(#${glowId})`}
          opacity={skill.rank === "PURE" ? tierFrac : 1}
        />
      )}

      {skill.rank === "PURE" && (
        <>
          <polygon
            points={polygonPoints(32, 32, 20, sidesFor(primary))}
            fill={tierFrac > 0.75 ? `url(#${gradId})` : "none"}
            fillOpacity={tierFrac > 0.75 ? 0.18 : 0}
            stroke={`url(#${gradId})`}
            strokeWidth={1.4 + tierFrac * 1.6}
            strokeOpacity={0.55 + tierFrac * 0.45}
            strokeLinejoin="round"
          />
          {/* An inner echo appears from tier III — the emblem visibly gains
              structure as the lineage deepens, so tier is readable from the
              shape alone without counting pips. */}
          {skill.tier >= 3 && (
            <polygon
              points={polygonPoints(32, 32, 11, sidesFor(primary), -90 + 180 / sidesFor(primary))}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth={1}
              strokeOpacity={0.45}
              strokeLinejoin="round"
            />
          )}
          {skill.tier >= 5 && <circle cx="32" cy="32" r="3.4" fill={theme.bright} fillOpacity={0.9} />}
        </>
      )}

      {skill.rank === "SYNERGY" && secondary && (
        <>
          {/* Each lens carries its own attribute's colour, so a synergy
              literally shows the two paths it is made of. */}
          <polygon
            points={polygonPoints(27, 30, 16, sidesFor(primary))}
            fill="none"
            stroke={theme.color}
            strokeWidth={1.6}
            strokeOpacity={0.8}
            strokeLinejoin="round"
          />
          <polygon
            points={polygonPoints(37, 34, 16, sidesFor(secondary))}
            fill="none"
            stroke={secondaryTheme.color}
            strokeWidth={1.6}
            strokeOpacity={0.65}
            strokeLinejoin="round"
          />
          <circle cx="32" cy="32" r="3" fill={RANK_META.SYNERGY.color} fillOpacity={0.9} />
        </>
      )}

      {skill.rank === "CAPSTONE" && (
        <>
          <polygon
            points={polygonPoints(32, 32, 21, sidesFor(primary))}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={2}
            strokeOpacity={0.9}
            strokeLinejoin="round"
          />
          <circle cx="32" cy="32" r="26" fill="none" stroke={rankColor} strokeWidth={1.2} strokeOpacity={0.6} strokeDasharray="3 3" />
          <circle cx="32" cy="9" r="2.6" fill={rankColor} />
          {skill.tier >= 2 && <circle cx="55" cy="45" r="2.2" fill={rankColor} fillOpacity={0.85} />}
          {skill.tier >= 3 && <circle cx="9" cy="45" r="2.2" fill={rankColor} fillOpacity={0.85} />}
        </>
      )}

      {skill.rank === "APEX" && (
        <>
          {[0, 1, 2].map((i) => (
            <polygon
              key={i}
              points={polygonPoints(32, 32, 13 + i * 5, sidesFor(primary), -90 + i * 12)}
              fill="none"
              stroke={i === 2 ? rankColor : `url(#${gradId})`}
              strokeWidth={1.2}
              strokeOpacity={0.55 + i * 0.15}
              strokeLinejoin="round"
            />
          ))}
          {showParticles && (
            <g className="orbit-cw">
              {ringPoints(32, 32, 27, 6).map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={1.7} fill={rankColor} opacity={0.85} />
              ))}
            </g>
          )}
          <circle cx="32" cy="32" r="4" fill={rankColor} className={showParticles ? "core-pulse" : undefined} />
        </>
      )}

      {/* ULTIMATE: the Apex rosette closed inside a full ring, with two
          counter-rotating particle orbits and a twinkling outer field. The
          most elaborate thing the app draws, for the only rank that ends a
          path — it should be unmistakable at any size. */}
      {skill.rank === "ULTIMATE" && (
        <>
          <circle cx="32" cy="32" r="27" fill="none" stroke={rankColor} strokeWidth={1.6} strokeOpacity={0.75} />
          {[0, 1, 2, 3].map((i) => (
            <polygon
              key={i}
              points={polygonPoints(32, 32, 10 + i * 4.5, sidesFor(primary), -90 + i * 22)}
              fill="none"
              stroke={i % 2 === 0 ? rankColor : `url(#${gradId})`}
              strokeWidth={1.3}
              strokeOpacity={0.5 + i * 0.13}
              strokeLinejoin="round"
            />
          ))}

          {showParticles && (
            <>
              <g className="orbit-cw">
                {ringPoints(32, 32, 27, 3).map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={2.6} fill={ACCENT} />
                ))}
              </g>
              <g className="orbit-ccw">
                {ringPoints(32, 32, 20, 6, 30).map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={1.4} fill={rankColor} opacity={0.9} />
                ))}
              </g>
              <g className="twinkle">
                {ringPoints(32, 32, 30.5, 8, 22).map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={1} fill={theme.bright} />
                ))}
              </g>
            </>
          )}

          {!showParticles && ringPoints(32, 32, 27, 3).map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={2.6} fill={ACCENT} />
          ))}

          <circle cx="32" cy="32" r="5.5" fill={rankColor} className={showParticles ? "core-pulse" : undefined} />
          <circle cx="32" cy="32" r="2.4" fill="#ffffff" fillOpacity={0.95} />
        </>
      )}
    </svg>
  );
}
