"use client";

import { skinFor } from "@/lib/skill-form";
import { themeFor } from "@/lib/attribute-themes";
import { RANK_META } from "@/lib/skill-visuals";
import type { Skill } from "@/lib/skill-pool";

/**
 * A bar-wide reaction to an emblem landing in a slot.
 *
 * The existing `EquipPulse` is 34 pixels of burst on a footer that spans the
 * whole viewport, so on a wide screen the most consequential action in the
 * app happens in a corner and is easy to miss entirely. This treats the
 * loadout bar itself as the thing that reacts — the slot is where the emblem
 * goes, but the bar is what gains power.
 *
 * Three concepts, deliberately different in *what is happening* rather than
 * in styling, because that is the choice actually worth making:
 *
 *   surge — conduction. Two waves leave the slot and run to both ends of the
 *     bar, lighting a rail as they pass. The bar is a busbar and the emblem
 *     closed a circuit. Reads directional: you can see *which* slot did it.
 *
 *   meter — accumulation. A segmented charge sweeps the full width like a
 *     capacitor filling, holds at full, then discharges. Closest to a literal
 *     power loader, and the only one that gives the moment a duration you
 *     watch rather than an impact you catch.
 *
 *   bloom — ignition. The bar browns out for a beat, then floods with light
 *     from the slot outward while columns rise across its width. The most
 *     violent of the three, and the only one that takes something away first.
 *
 * All three take hue from the emblem and intensity from its charge, so the
 * level of what you slotted is legible in any of them.
 */

export type ChargeVariant = "surge" | "meter" | "bloom";

interface Props {
  skill: Skill;
  variant: ChargeVariant;
  /** Horizontal position of the slot that received the emblem, 0–100. */
  originPercent: number;
}

export function BarCharge({ skill, variant, originPercent }: Props) {
  const { charge } = skinFor(skill);
  const legendary = skill.rank === "APEX" || skill.rank === "ULTIMATE";
  const color = legendary ? RANK_META[skill.rank].color : themeFor(skill.attributes[0]).color;

  // A deep emblem takes longer and reaches further. Same charge ladder the
  // emblem and the slot burst are drawn from, so all three agree.
  const duration = 620 + Math.round(charge * 700);

  /**
   * The bloom ladder, weighted hard toward the top.
   *
   * `intensity` used to run 0.35–1.0 linearly, which spent most of the range
   * on emblems nobody is excited to slot. Cubed, a Pure I sits near 0.1 and
   * only the last stretch of the ladder approaches full — the low tiers are
   * a flicker and the top two are an event.
   */
  const stage = charge < 0.2 ? 0 : charge < 0.45 ? 1 : charge < 0.7 ? 2 : charge < 0.9 ? 3 : 4;
  const intensity = (0.08 + Math.pow(charge, 3) * 0.92).toFixed(2);
  const columns = [4, 6, 9, 14, 18][stage];
  const coreSize = [90, 130, 190, 260, 340][stage];

  /**
   * What the bar keeps after the burst. Reserved for the top two ranks,
   * because an aftermath asserts the bar has been permanently changed and
   * that should not be true of a trinket.
   */
  const aftermath: "none" | "halo" | "hole" =
    skill.rank === "ULTIMATE" ? "hole" : skill.rank === "APEX" ? "halo" : "none";

  const style = {
    "--bc-color": color,
    "--bc-dur": `${duration}ms`,
    "--bc-origin": `${originPercent}%`,
    "--bc-intensity": intensity,
    "--bc-core": `${coreSize}px`,
  } as React.CSSProperties;

  return (
    <span className={`barcharge bc-${variant}`} aria-hidden="true" style={style}>
      {variant === "surge" && (
        <>
          <span className="bc-wave bc-wave-l" />
          <span className="bc-wave bc-wave-r" />
          <span className="bc-rail bc-rail-l" />
          <span className="bc-rail bc-rail-r" />
        </>
      )}

      {variant === "meter" && (
        <>
          <span className="bc-fill" />
          <span className="bc-edge" />
          {/* Fires as the fill completes, so the bar acknowledges reaching
              full rather than just stopping. */}
          <span className="bc-full" />
        </>
      )}

      {variant === "bloom" && (
        <>
          {/* The brownout is withheld below stage 2. Dimming the whole bar is
              the loudest thing this effect does, and spending it on a Pure I
              leaves nothing in reserve for the emblems that deserve it. */}
          {stage >= 2 && <span className="bc-dim" />}
          <span className="bc-core" />

          {/* Columns rise across the whole width. Deterministic offsets, not
              random, so server and client render the same thing. */}
          {Array.from({ length: columns }, (_, i) => {
            const at = (100 / columns) * i + 100 / (columns * 2);
            return (
              <span
                key={i}
                className="bc-column"
                style={
                  {
                    left: `${at}%`,
                    "--col-delay": `${Math.abs(originPercent - at) * 3.4}ms`,
                  } as React.CSSProperties
                }
              />
            );
          })}

          {/* ── Aftermath ────────────────────────────────────────────
              What the bar is left holding once the burst is over. Only the
              top two ranks get one: an aftermath is a statement that the bar
              has been changed, and that should not be true of a trinket. */}
          {aftermath === "halo" && <span className="bc-halo" />}

          {aftermath === "hole" && (
            <>
              {/* Order matters: pull streaks, then the disc, then the core on
                  top, so the dark centre genuinely occludes what falls in. */}
              {Array.from({ length: 10 }, (_, i) => (
                <span
                  key={`p${i}`}
                  className="bc-pull"
                  style={
                    {
                      "--pull-from": `${(100 / 10) * i + 100 / 20}%`,
                      "--pull-top": `${12 + ((i * 37) % 76)}%`,
                      "--pull-delay": `${(i % 5) * 130}ms`,
                    } as React.CSSProperties
                  }
                />
              ))}
              <span className="bc-accretion" />
              <span className="bc-hole" />
            </>
          )}
        </>
      )}
    </span>
  );
}
