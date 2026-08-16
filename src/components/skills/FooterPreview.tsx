"use client";

import { useState } from "react";
import { LoadoutBar, type LoadoutSlotView } from "./LoadoutBar";
import { tierForSkill, meteorVariantFor, collapseVariantFor } from "@/lib/cataclysm-variants";
import { depthOf } from "@/lib/skill-form";
import type { Skill } from "@/lib/skill-pool";

/**
 * Harness around the real footer.
 *
 * Owns nothing the bar does not already own — `LoadoutBar` keeps its own
 * optimistic slot state — except the ability to reset, and a few shortcuts
 * that make the terminal events reachable without hunting through a
 * 749-emblem picker for one of the twelve that actually fires a cataclysm.
 */

interface Props {
  bench: Skill[];
  slotCount: number;
}

/** One emblem per terminal variant, so all twelve are one click away. */
function variantShortcuts(pool: Skill[]): { label: string; skill: Skill }[] {
  const out: { label: string; skill: Skill }[] = [];
  const seen = new Set<string>();
  for (const s of pool) {
    const tier = tierForSkill(s);
    if (tier !== "meteor" && tier !== "collapse") continue;
    const v = tier === "meteor" ? meteorVariantFor(s) : collapseVariantFor(s);
    const key = `${tier}:${v}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: `d${depthOf(s)} ${v}`, skill: s });
  }
  return out;
}

export function FooterPreview({ bench, slotCount }: Props) {
  const empty = (): LoadoutSlotView[] =>
    Array.from({ length: slotCount }, (_, i) => ({ slot: i, skill: null, active: false }));

  const [slots, setSlots] = useState<LoadoutSlotView[]>(empty);
  const [available, setAvailable] = useState<Skill[]>(bench);
  // Remounts the bar, which is the only way to reset state it owns itself.
  const [generation, setGeneration] = useState(0);
  const [request, setRequest] = useState<{ skill: Skill; nonce: number } | null>(null);
  const [nonce, setNonce] = useState(0);

  const shortcuts = variantShortcuts(bench);

  /**
   * Hands the emblem to the bar rather than writing its slots directly.
   *
   * The first version set slot state here and remounted the bar, which
   * looked right and animated nothing: skipping `attach()` skips the burst,
   * the bar charge, the page surge and the cataclysm — every part of what
   * this page exists to show.
   */
  function quickEquip(skill: Skill) {
    setRequest({ skill, nonce: nonce + 1 });
    setNonce((n) => n + 1);
  }

  function reset() {
    setSlots(empty());
    setAvailable(bench);
    setRequest(null);
    setNonce(0);
    setGeneration((g) => g + 1);
  }

  return (
    <>
      <section className="card" style={{ padding: 14 }}>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="panel-title">Fire a terminal event</p>
            <p className="panel-sub mt-0.5">
              All twelve d14/d15 variants, straight into the next free slot — and the background evolves
              as the rarer ones land. Occupancy is the footer&apos;s own counter, on the left of the bar;
              when it reads {slotCount}/{slotCount} these do nothing until you detach or reset. Everything
              else is in the footer&apos;s picker.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {nonce} fired
            </span>
            <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: "5px 11px" }} onClick={reset}>
              Reset
            </button>
          </div>
        </div>

        <ul className="flex flex-wrap gap-1.5">
          {shortcuts.map((s) => (
            <li key={s.skill.code}>
              <button
                type="button"
                onClick={() => quickEquip(s.skill)}
                title={`${s.skill.name}\n${s.skill.effectText}`}
                className="mono"
                style={{
                  padding: "5px 10px",
                  borderRadius: 8,
                  fontSize: 10.5,
                  border: "1px solid var(--line-hi)",
                  background: "var(--sub)",
                  color: "var(--ink-1)",
                  cursor: "pointer",
                }}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>

      </section>

      {/* Spacer so the sticky footer has something to stick over. */}
      <div style={{ height: "58vh" }} aria-hidden />

      {/* The real component. `persist={false}` is the only difference from
          the one in the app shell. */}
      <LoadoutBar
        key={generation}
        slots={slots}
        bench={available}
        persist={false}
        ambient
        attachRequest={request}
      />
    </>
  );
}
