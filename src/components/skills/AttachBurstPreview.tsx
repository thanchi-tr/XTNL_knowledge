"use client";

import { useState } from "react";
import { SkillLogo } from "./SkillLogo";
import { EquipPulse } from "./EquipPulse";
import { RANK_META } from "@/lib/skill-visuals";
import type { Skill } from "@/lib/skill-pool";

/**
 * The attach burst at each stage, side by side and replayable.
 *
 * Same reason as the emblem ladder above it: the design claim is that the
 * stages differ in kind, and that is exactly what cannot be checked while
 * watching one attach at a time — by the time you have equipped a second
 * skill you no longer remember what the first looked like.
 *
 * Renders the real `EquipPulse` against real skills, so nothing here can
 * flatter the thing it stands for.
 */

interface Props {
  /** One skill per stage, chosen server-side from the real pool. */
  samples: { stage: number; layers: string; skill: Skill }[];
}

export function AttachBurstPreview({ samples }: Props) {
  // Bumping the key remounts every pulse, which is what replays a one-shot
  // animation — the same trick the loadout bar uses to let the *same* skill
  // flash again when it is re-slotted.
  const [take, setTake] = useState(0);

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="panel-title">Attach burst</h2>
          <p className="panel-sub">
            Each stage adds a layer the ones below it do not have. Thresholded on the same 15-deep charge
            ladder the emblem is drawn from.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => setTake((t) => t + 1)}>
          Replay
        </button>
      </div>

      <ul className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
        {samples.map((s) => (
          <li key={s.stage} className="text-center">
            <div
              className="mx-auto flex items-center justify-center"
              style={{
                position: "relative",
                width: 116,
                height: 116,
                borderRadius: 12,
                border: "1px solid var(--line)",
                background: "var(--canvas)",
                // The beam and shards travel well past the emblem; without
                // this they would spill across neighbouring cells and make
                // two stages look like one.
                overflow: "hidden",
              }}
            >
              <SkillLogo skill={s.skill} size={44} animated={false} />
              <EquipPulse key={`${s.stage}-${take}`} skill={s.skill} />
            </div>
            <p className="mono mt-1.5" style={{ fontSize: 10.5, color: "var(--ink-2)" }}>
              stage {s.stage}
            </p>
            <p style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{s.layers}</p>
            <p className="mt-0.5" style={{ fontSize: 10, color: RANK_META[s.skill.rank].color }}>
              {s.skill.rank} T{s.skill.tier}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
