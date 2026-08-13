"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { SkillLogo } from "./SkillLogo";
import { EquipPulse } from "./EquipPulse";
import { BarCharge, type ChargeVariant } from "./BarCharge";
import { LOADOUT_SLOTS } from "@/lib/loadout";
import { RANK_META } from "@/lib/skill-visuals";
import type { Skill } from "@/lib/skill-pool";

/**
 * The three bar-charge concepts, side by side on a mock loadout bar.
 *
 * A mock rather than the real footer, deliberately: the real bar is sticky,
 * lives in the app shell, and equipping through it writes to the database.
 * Comparing three concepts means replaying the same attach many times, which
 * is not something to do to real rows — and three sticky footers cannot be
 * shown at once anyway. The bar's geometry, slot styling and `EquipPulse`
 * are the real ones, so what is being judged is the effect and not a
 * different bar.
 */

const VARIANTS: { key: ChargeVariant; name: string; idea: string }[] = [
  {
    key: "surge",
    name: "1 · Surge",
    idea: "Conduction. Two waves leave the slot and run to both ends, lighting a rail as they pass. The only one where you can see which slot did it.",
  },
  {
    key: "meter",
    name: "2 · Meter",
    idea: "Accumulation. A segmented charge sweeps the full width, holds at full, then discharges. The literal power loader — a moment you watch rather than catch.",
  },
  {
    key: "bloom",
    name: "3 · Bloom",
    idea: "Ignition. The bar browns out, then floods with light from the slot outward while columns rise. The only one that takes something away before it gives.",
  },
];

interface Props {
  /** One low, one mid, one top-of-ladder skill, chosen from the real pool. */
  samples: Skill[];
}

/**
 * One mock bar, which measures where its own slot actually is.
 *
 * The origin was first computed as `(index + 0.5) / slots`, which assumes the
 * slot strip spans the whole bar. It does not — there is a "Loadout" label to
 * its left and the container's own padding on both sides — so at 375px the
 * computed 35% pointed at a slot whose real centre was 50.7%, and the surge
 * would have visibly left from the wrong place. Measuring costs one layout
 * read per replay and cannot drift as the bar's contents change.
 */
function MockBar({
  variant,
  skill,
  slot,
  take,
  onPick,
}: {
  variant: ChargeVariant;
  skill: Skill;
  slot: number;
  take: number;
  onPick: (i: number) => void;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [originPercent, setOriginPercent] = useState(50);

  useLayoutEffect(() => {
    const bar = barRef.current;
    const el = slotRefs.current[slot];
    if (!bar || !el) return;
    const b = bar.getBoundingClientRect();
    const s = el.getBoundingClientRect();
    if (b.width === 0) return;
    setOriginPercent(((s.left + s.width / 2 - b.left) / b.width) * 100);
  }, [slot, take]);

  return (
    <div
      ref={barRef}
      style={{
        position: "relative",
        isolation: "isolate",
        background: "rgba(4,8,15,.92)",
        borderTop: "1px solid var(--line)",
        overflow: "hidden",
      }}
    >
      <BarCharge key={`${variant}-${take}`} skill={skill} variant={variant} originPercent={originPercent} />

      <div className="site-container relative flex items-center gap-4 py-2.5" style={{ zIndex: 1 }}>
        <div className="shrink-0">
          <p className="label-xs">Loadout</p>
          <p className="mono" style={{ fontSize: 11, color: "var(--ink-2)" }}>
            slot {slot + 1}
          </p>
        </div>

        <ul className="flex flex-1 items-center gap-1.5">
          {Array.from({ length: LOADOUT_SLOTS }, (_, i) => (
            <li key={i} className="min-w-0 flex-1">
              <button
                ref={(el) => {
                  slotRefs.current[i] = el;
                }}
                type="button"
                onClick={() => onPick(i)}
                title={`Fire from slot ${i + 1}`}
                className={`slot ${i === slot ? "slot-attach" : ""}`}
                style={{
                  // Slots shrink here rather than scrolling as they do in the
                  // real bar, so all ten stay visible at 375px and every
                  // origin remains reachable in the preview.
                  width: "100%",
                  minWidth: 0,
                  borderColor: i === slot ? "rgba(0,204,122,.45)" : "var(--line-hi)",
                  background: i === slot ? "var(--raised)" : "var(--sub)",
                }}
              >
                {i === slot ? (
                  <>
                    <SkillLogo skill={skill} size={30} />
                    <EquipPulse key={`${variant}-${take}-pulse`} skill={skill} />
                  </>
                ) : (
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {i + 1}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}


export function BarChargePreview({ samples }: Props) {
  const [variant, setVariant] = useState<ChargeVariant>("bloom");
  const [slot, setSlot] = useState(4);
  // Bumping this remounts every effect, which is what replays a one-shot.
  const [take, setTake] = useState(1);

  function fire(nextSlot = slot) {
    setSlot(nextSlot);
    setTake((t) => t + 1);
  }

  const active = VARIANTS.find((v) => v.key === variant)!;

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="panel-title">{active.name}</h2>
            <p className="panel-sub mt-0.5" style={{ maxWidth: "72ch" }}>
              {active.idea}
            </p>
          </div>
          <button type="button" className="btn-secondary shrink-0" onClick={() => fire()}>
            Replay all
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {VARIANTS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => {
                setVariant(v.key);
                setTake((t) => t + 1);
              }}
              style={{
                padding: "4px 12px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                border: `1px solid ${v.key === variant ? "rgba(0,204,122,.45)" : "var(--line-hi)"}`,
                background: v.key === variant ? "var(--green-10)" : "transparent",
                color: v.key === variant ? "var(--green)" : "var(--ink-2)",
                cursor: "pointer",
              }}
            >
              {v.name}
            </button>
          ))}
        </div>
      </section>

      {/* One bar per rung of the ladder, all firing together. The whole claim
          is that the low tiers are a flicker and the top two are an event,
          and that is only checkable side by side. */}
      {samples.map((s) => (
        <section key={s.code} className="card overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 p-3 pb-2">
            <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: RANK_META[s.rank].color }}>
              {s.rank} · T{s.tier}
            </span>
            <span style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
              {s.rank === "ULTIMATE"
                ? "aftermath — collapse, accretion, gravity"
                : s.rank === "APEX"
                  ? "aftermath — deep violet residue"
                  : "burst only"}
            </span>
          </div>
          <MockBar variant={variant} skill={s} slot={slot} take={take} onPick={fire} />
        </section>
      ))}
    </div>
  );
}
