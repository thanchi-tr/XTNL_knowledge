"use client";

import type { Skill } from "@/lib/skill-pool";
import { skinFor, sidesFor } from "@/lib/skill-form";
import { themeFor } from "@/lib/attribute-themes";
import { RANK_META } from "@/lib/skill-visuals";

/**
 * The radial burst thrown when an emblem lands in a slot.
 *
 * Two channels, and keeping them separate is the whole point:
 *
 *   attribute → hue and spoke count. Mind throws four spokes in blue,
 *     Faith seven in indigo. The spoke count is the same number that
 *     decides the emblem's polygon (`sidesFor`), so the burst is
 *     recognisably *that skill's shape* flying apart rather than a generic
 *     ring. Two different skills never land the same way.
 *
 *   charge → intensity. `skinFor(...).charge` is the skill's position on
 *     the 15-deep ladder, so a Pure I gets one short ring at modest reach
 *     and an Ultimate gets four, further and slower. Slotting the thing you
 *     spent 14,700 mastery on should not look like slotting your first
 *     one-point trinket.
 *
 * Everything is handed to CSS as custom properties; the keyframes live in
 * globals.css so the reduced-motion block can switch them all off in one
 * place.
 */

interface Props {
  skill: Skill;
}

export function EquipPulse({ skill }: Props) {
  const { charge } = skinFor(skill);
  const theme = themeFor(skill.attributes[0]);
  const legendary = skill.rank === "APEX" || skill.rank === "ULTIMATE";

  // Rank takes the hue at the top of the ladder for the same reason the
  // emblem does — those two ranks are read by rank first, attribute second.
  const color = legendary ? RANK_META[skill.rank].color : theme.color;

  const spokes = sidesFor(skill.attributes[0]);
  const rings = 1 + Math.round(charge * 3); // 1..4
  const reach = 1.8 + charge * 1.4; // 1.8..3.2
  const duration = 620 + Math.round(charge * 520); // 620..1140ms

  return (
    <span
      aria-hidden
      className="equip-pulse"
      style={
        {
          "--pulse-color": color,
          "--pulse-reach": reach.toFixed(2),
          "--pulse-dur": `${duration}ms`,
        } as React.CSSProperties
      }
    >
      {Array.from({ length: rings }, (_, i) => (
        <span
          key={`r${i}`}
          className="equip-ring"
          // Stagger widens with charge, so a deep skill's rings arrive as a
          // sequence rather than a single thick edge.
          style={{ animationDelay: `${i * (60 + charge * 70)}ms` }}
        />
      ))}

      {Array.from({ length: spokes }, (_, i) => (
        <span
          key={`s${i}`}
          className="equip-spoke"
          style={{ ["--spoke-angle" as string]: `${(360 / spokes) * i}deg` }}
        />
      ))}
    </span>
  );
}
