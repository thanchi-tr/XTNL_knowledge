import type { Skill } from "@/lib/skill-pool";
import {
  skinFor,
  particlesFor,
  paletteFor,
  sidesFor,
  depthOf,
  motifFor,
  auraFor,
} from "@/lib/skill-form";

/**
 * A deterministic, procedurally computed emblem per skill — no image files,
 * no generated art. Not a client component: gradient IDs derive from the
 * already-unique `skill.code` rather than `useId()`, so a 749-skill grid
 * never pays a hydration cost per icon.
 *
 * This is now a pure renderer. Every decision about *what* the emblem shows
 * lives in `skill-form.ts` — the form grammar (`skinFor`), the particle
 * ladder (`particlesFor`) and the charge-driven palette (`paletteFor`).
 * That grammar already existed but nothing imported it: this component
 * carried its own parallel set of hardcoded per-rank branches, so the
 * carefully-staged eight-step Pure ladder never actually reached the
 * screen. Two sources of truth, one of them dead.
 *
 * Five channels, so a glance reads five facts:
 *   silhouette ← attribute (polygon side count)
 *   colour     ← attribute hue, warmed by ladder charge
 *   structure  ← depth (echo, vertices, core, ring, spokes, corona)
 *   motion     ← rank and depth (orbits, sparks, embers, rays)
 *   motif      ← archetype (the centre glyph — what the skill does)
 */

interface Props {
  skill: Skill;
  size?: number;
  /** Particles cost a compositor layer each; the tree turns them off at node scale. */
  animated?: boolean;
}

const CX = 32;
const CY = 32;

function polygonPoints(cx: number, cy: number, r: number, sides: number, rotationDeg = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((rotationDeg + (360 / sides) * i) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

/**
 * Evenly spaced points on a circle.
 *
 * Rounded to 2dp, and it is not cosmetic: `Math.cos`/`Math.sin` are
 * implementation-defined in ECMAScript, so Node's V8 and the browser's can
 * disagree in the final bit. Feeding a raw `58.99999999999999` into an SVG
 * `cx` renders one string on the server and another on the client, which
 * React reports as a hydration attribute mismatch. Rounding collapses that
 * difference well below a pixel.
 */
function ringPoints(cx: number, cy: number, r: number, count: number, offsetDeg = 0) {
  return Array.from({ length: count }, (_, i) => {
    const a = ((offsetDeg + (360 / count) * i) * Math.PI) / 180;
    return {
      x: Number((cx + r * Math.cos(a)).toFixed(2)),
      y: Number((cy + r * Math.sin(a)).toFixed(2)),
    };
  });
}

export function SkillLogo({ skill, size = 40, animated = true }: Props) {
  const skin = skinFor(skill);
  const particles = particlesFor(skill);
  const palette = paletteFor(skill);
  const depth = depthOf(skill);
  const motif = motifFor(skill);
  const aura = auraFor(skill);

  const primary = skill.attributes[0];
  const secondary = skill.attributes[1];
  const sides = sidesFor(primary);
  const secondarySides = secondary ? sidesFor(secondary) : sides;

  const gradId = `sk-g-${skill.code}`;
  const glowId = `sk-glow-${skill.code}`;
  const sweepId = `sk-sweep-${skill.code}`;
  const auraId = `sk-aura-${skill.code}`;
  const isSynergy = skill.rank === "SYNERGY" && Boolean(secondary);

  // The body shrinks once a containment ring exists, so the ring has
  // somewhere to sit instead of colliding with the silhouette.
  const bodyR = skin.outerRing ? 18.5 : 20.5;
  const ringR = 27;

  /**
   * Below this the finest channels stop being legible and start being
   * noise. The tree draws nodes at 30px: twelve Ultimate rays and a lens
   * flare in a 30px box is a smudge, not a crown. Coarse structure —
   * silhouette, ring, motif, core — survives at any size and is what
   * actually distinguishes a node at a glance.
   */
  const compact = size < 40;
  const rayCount = compact ? Math.min(4, particles.rays) : particles.rays;
  const showFlare = particles.flare && !compact;

  const show = (n: number) => animated && n > 0;

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={palette.inner} />
          <stop offset="60%" stopColor={palette.edge} />
          <stop offset="100%" stopColor={palette.glow} />
        </linearGradient>
        <radialGradient id={glowId} cx={CX} cy={CY} r="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={palette.glow} stopOpacity={0.06 + skin.charge * 0.3} />
          <stop offset="100%" stopColor={palette.glow} stopOpacity="0" />
        </radialGradient>
        {aura && (
          <radialGradient id={auraId} cx={CX} cy={CY} r={aura.radius} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={aura.color} stopOpacity={aura.intensity} />
            <stop offset="55%" stopColor={aura.color} stopOpacity={aura.intensity * 0.45} />
            <stop offset="100%" stopColor={aura.color} stopOpacity="0" />
          </radialGradient>
        )}
        {/* A linear ramp stood in a rotating group reads as a sweep — SVG 1.1
            has no conic gradient, and a foreignObject/CSS conic would not
            survive server rendering into a static <svg>. */}
        {particles.conicSweep && (
          <linearGradient id={sweepId} x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={palette.glow} stopOpacity="0" />
            <stop offset="50%" stopColor={palette.accent} stopOpacity="0.5" />
            <stop offset="100%" stopColor={palette.glow} stopOpacity="0" />
          </linearGradient>
        )}
      </defs>

      {/* ── Terminal aura: the soft coloured light a finished path casts ─ */}
      {aura && (
        <circle
          cx={CX}
          cy={CY}
          r={aura.radius}
          fill={`url(#${auraId})`}
          className={animated ? "corona-pulse" : undefined}
        />
      )}

      {/* ── Aura ──────────────────────────────────────────────────── */}
      {skin.charge > 0.15 && (
        <circle
          cx={CX}
          cy={CY}
          r={skin.corona ? 31 : 26}
          fill={`url(#${glowId})`}
          className={animated && particles.coronaPulse ? "corona-pulse" : undefined}
        />
      )}

      {/* ── Shockwaves: rings that burst outward and fade ───────────
          Staggered so one is always mid-expansion — the emblem never
          settles into a still frame. */}
      {show(particles.shockwaves) &&
        Array.from({ length: particles.shockwaves }, (_, i) => (
          <circle
            key={`sw-${i}`}
            cx={CX}
            cy={CY}
            r={14}
            fill="none"
            stroke={palette.glow}
            strokeWidth={1.4}
            className="shockwave"
            style={{ animationDelay: `${((i * 2.4) / particles.shockwaves).toFixed(2)}s` }}
          />
        ))}

      {/* ── Halo rings: tilted ellipses on separate axes ─────────────
          Three of these read as an orbital *shell* rather than a flat
          disc, which is the single biggest jump in perceived dimensionality
          available without leaving SVG. */}
      {show(particles.haloRings) &&
        Array.from({ length: particles.haloRings }, (_, i) => (
          <g
            key={`halo-${i}`}
            className={i % 2 === 0 ? "orbit-cw" : "orbit-ccw"}
            style={{ animationDuration: `${(16 + i * 7).toFixed(0)}s` }}
          >
            <ellipse
              cx={CX}
              cy={CY}
              rx={29}
              ry={10.5}
              fill="none"
              stroke={i === 0 ? palette.accent : palette.glow}
              strokeWidth={0.9}
              strokeOpacity={0.5}
              transform={`rotate(${(i * 180) / particles.haloRings} ${CX} ${CY})`}
            />
          </g>
        ))}

      {/* ── Conic sweep across the body ─────────────────────────────── */}
      {show(particles.conicSweep ? 1 : 0) && (
        <g className="orbit-cw" style={{ animationDuration: "9s" }}>
          {/* A circle, not a rect: a 60x60 rect rotating about the centre
              throws its corners out to r=42, well past the 32-unit viewBox,
              so the clip showed as hard straight edges sweeping across the
              emblem. A circle carries the same gradient with no corners to
              clip. */}
          <circle cx={CX} cy={CY} r={30} fill={`url(#${sweepId})`} opacity={0.5} />
        </g>
      )}

      {/* ── Rays: radiant spikes, top ranks only ───────────────────── */}
      {rayCount > 0 &&
        Array.from({ length: rayCount }, (_, i) => {
          const angle = (360 / rayCount) * i + 90 / rayCount;
          return (
            <line
              key={`ray-${i}`}
              x1={CX}
              y1={CY}
              x2={Number((CX + 30 * Math.cos((angle * Math.PI) / 180)).toFixed(2))}
              y2={Number((CY + 30 * Math.sin((angle * Math.PI) / 180)).toFixed(2))}
              stroke={palette.glow}
              strokeWidth={particles.rayPulse ? 1 : 0.7}
              strokeOpacity={0.28}
              className={animated && particles.rayPulse ? "ray-pulse" : undefined}
              style={
                animated && particles.rayPulse
                  ? { animationDelay: `${((i * 1.8) / rayCount).toFixed(2)}s` }
                  : undefined
              }
            />
          );
        })}

      {/* ── Containment ring ───────────────────────────────────────── */}
      {skin.outerRing && (
        <circle cx={CX} cy={CY} r={ringR} fill="none" stroke={palette.edge} strokeWidth={1.1} strokeOpacity={0.55} />
      )}
      {skin.corona && (
        <circle cx={CX} cy={CY} r={ringR + 3.5} fill="none" stroke={palette.glow} strokeWidth={0.8} strokeOpacity={0.4} />
      )}

      {/* ── Rotating dashed arcs ───────────────────────────────────── */}
      {show(particles.arcs) &&
        Array.from({ length: particles.arcs }, (_, i) => (
          <circle
            key={`arc-${i}`}
            cx={CX}
            cy={CY}
            r={ringR + (i === 0 ? 1.8 : -3.2)}
            fill="none"
            stroke={palette.accent}
            strokeWidth={1}
            strokeOpacity={0.5}
            strokeDasharray={i === 0 ? "10 26" : "5 18"}
            className={i % 2 === 0 ? "orbit-cw" : "orbit-ccw"}
          />
        ))}

      {/* ── Body ───────────────────────────────────────────────────── */}
      {isSynergy ? (
        <>
          {/* Two overlapping bodies, each in its own attribute's hue — a
              synergy literally shows the two paths it is made of. */}
          <polygon
            points={polygonPoints(CX - 5, CY - 2, bodyR - 3.5, sides)}
            fill={`url(#${gradId})`}
            fillOpacity={skin.fillOpacity}
            stroke={palette.edge}
            strokeWidth={skin.strokeWidth}
            strokeOpacity={0.85}
            strokeLinejoin="round"
          />
          <polygon
            points={polygonPoints(CX + 5, CY + 2, bodyR - 3.5, secondarySides)}
            fill="none"
            stroke={palette.accent}
            strokeWidth={skin.strokeWidth}
            strokeOpacity={0.7}
            strokeLinejoin="round"
          />
        </>
      ) : (
        <polygon
          points={polygonPoints(CX, CY, bodyR, sides)}
          fill={`url(#${gradId})`}
          fillOpacity={skin.fillOpacity}
          stroke={`url(#${gradId})`}
          strokeWidth={skin.strokeWidth}
          strokeOpacity={0.6 + skin.charge * 0.4}
          strokeLinejoin="round"
        />
      )}

      {/* ── Inner echo ─────────────────────────────────────────────── */}
      {skin.innerEcho && !isSynergy && (
        <polygon
          points={polygonPoints(CX, CY, bodyR * 0.55, sides, -90 + 180 / sides)}
          fill="none"
          stroke={palette.inner}
          strokeWidth={1}
          strokeOpacity={0.5}
          strokeLinejoin="round"
        />
      )}

      {/* ── Spokes ─────────────────────────────────────────────────── */}
      {skin.spokes &&
        !isSynergy &&
        ringPoints(CX, CY, bodyR, sides, -90).map((p, i) => (
          <line
            key={`spoke-${i}`}
            x1={CX}
            y1={CY}
            x2={p.x}
            y2={p.y}
            stroke={palette.inner}
            strokeWidth={0.7}
            strokeOpacity={0.4}
          />
        ))}

      {/* ── Vertex nodes ───────────────────────────────────────────── */}
      {skin.vertexNodes &&
        !isSynergy &&
        ringPoints(CX, CY, bodyR, sides, -90).map((p, i) => (
          <circle key={`v-${i}`} cx={p.x} cy={p.y} r={1.5 + skin.charge} fill={palette.accent} fillOpacity={0.95} />
        ))}

      {/* ── Orbiting particles ─────────────────────────────────────── */}
      {show(particles.orbitals) && (
        <g className="orbit-cw" style={{ animationDuration: `${particles.orbitSeconds}s` }}>
          {ringPoints(CX, CY, ringR, particles.orbitals).map((p, i) => (
            <circle key={`o-${i}`} cx={p.x} cy={p.y} r={1.9} fill={palette.glow} opacity={0.9} />
          ))}
          {/* Tails are drawn as three shrinking motes trailing each head at
              a few degrees of arc. Cheaper than a tapered path and it
              survives the group rotation without any extra maths. */}
          {particles.cometTails &&
            Array.from({ length: particles.orbitals }, (_, i) =>
              [0, 1, 2].map((t) => {
                const deg = (360 / particles.orbitals) * i - (t + 1) * 5;
                const a = (deg * Math.PI) / 180;
                return (
                  <circle
                    key={`t-${i}-${t}`}
                    cx={Number((CX + ringR * Math.cos(a)).toFixed(2))}
                    cy={Number((CY + ringR * Math.sin(a)).toFixed(2))}
                    r={1.5 - t * 0.4}
                    fill={palette.glow}
                    opacity={0.5 - t * 0.14}
                  />
                );
              })
            )}
        </g>
      )}
      {show(particles.counterOrbitals) && (
        <g className="orbit-ccw" style={{ animationDuration: `${(particles.orbitSeconds * 1.45).toFixed(1)}s` }}>
          {ringPoints(CX, CY, ringR - 7, particles.counterOrbitals, 24).map((p, i) => (
            <circle key={`c-${i}`} cx={p.x} cy={p.y} r={1.3} fill={palette.accent} opacity={0.85} />
          ))}
        </g>
      )}

      {/* ── Sparks: staggered so the ring shimmers rather than blinks ─ */}
      {show(particles.sparks) &&
        ringPoints(CX, CY, ringR + 2.5, particles.sparks, 18).map((p, i) => (
          <circle
            key={`s-${i}`}
            cx={p.x}
            cy={p.y}
            r={1}
            fill={palette.inner}
            className="twinkle"
            style={{ animationDelay: `${((i * 2.6) / particles.sparks).toFixed(2)}s` }}
          />
        ))}

      {/* ── Sparkle stars: four-point, sharper read than a round spark ─ */}
      {show(particles.sparkleStars) &&
        ringPoints(CX, CY, ringR + 5, particles.sparkleStars, 40).map((p, i) => (
          <path
            key={`st-${i}`}
            d={`M${p.x} ${p.y - 3.2}Q${p.x} ${p.y} ${p.x + 3.2} ${p.y}Q${p.x} ${p.y} ${p.x} ${p.y + 3.2}Q${p.x} ${p.y} ${p.x - 3.2} ${p.y}Q${p.x} ${p.y} ${p.x} ${p.y - 3.2}`}
            fill={palette.inner}
            className="twinkle"
            style={{ animationDelay: `${((i * 3.1) / particles.sparkleStars).toFixed(2)}s` }}
          />
        ))}

      {/* ── Embers: rise from the core and fade. Ultimate only. ────── */}
      {show(particles.embers) &&
        ringPoints(CX, CY, 8, particles.embers, 12).map((p, i) => (
          <circle
            key={`e-${i}`}
            cx={p.x}
            cy={CY + 6}
            r={0.9}
            fill={palette.glow}
            className="ember-rise"
            style={{ animationDelay: `${((i * 2.8) / particles.embers).toFixed(2)}s` }}
          />
        ))}

      {/* ── Core ────────────────────────────────────────────────────
          With a motif present the core becomes a backing plate rather than
          the focal point — a solid disc the same size would simply cover
          the glyph that says what the skill does. */}
      {skin.coreRadius > 0 && (
        <circle
          cx={CX}
          cy={CY}
          r={motif ? skin.coreRadius + 3.5 : skin.coreRadius}
          fill={palette.glow}
          fillOpacity={motif ? 0.16 : 1}
          className={animated && particles.corePulse ? "core-pulse" : undefined}
        />
      )}

      {/* ── Archetype motif: what the skill actually does ───────────── */}
      {motif && (
        <path
          d={motif}
          fill="none"
          stroke={palette.accent}
          strokeWidth={1.5}
          strokeOpacity={0.65 + skin.charge * 0.35}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {isSynergy && !motif && <circle cx={CX} cy={CY} r={2.6} fill={palette.glow} fillOpacity={0.95} />}

      {/* ── Lens flare: a crossed starburst over the core ───────────── */}
      {show(showFlare ? 1 : 0) && (
        <g className="flare-pulse">
          <path
            d={`M${CX} ${CY - 15}L${CX + 1.6} ${CY}L${CX} ${CY + 15}L${CX - 1.6} ${CY}Z`}
            fill={palette.inner}
            opacity={0.75}
          />
          <path
            d={`M${CX - 15} ${CY}L${CX} ${CY - 1.6}L${CX + 15} ${CY}L${CX} ${CY + 1.6}Z`}
            fill={palette.inner}
            opacity={0.75}
          />
        </g>
      )}

      {/* The single brightest pixel in the app belongs to a finished path. */}
      {depth >= 15 && !motif && <circle cx={CX} cy={CY} r={2.2} fill="#ffffff" fillOpacity={0.95} />}
    </svg>
  );
}
