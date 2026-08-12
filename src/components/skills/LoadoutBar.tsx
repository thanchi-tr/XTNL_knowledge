"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SkillLogo } from "./SkillLogo";
import { equipSkill, clearSlot } from "@/app/actions/skills";
import { RANK_META } from "@/lib/skill-visuals";
import type { Skill } from "@/lib/skill-pool";

export interface LoadoutSlotView {
  slot: number;
  skill: Skill | null;
  /** Equipped but requirements no longer met — occupies a slot, yields nothing. */
  active: boolean;
}

interface Props {
  slots: LoadoutSlotView[];
  /** Owned but unequipped, offered in the picker. */
  bench: Skill[];
}

/**
 * The loadout bar: ten slots, and the only place a skill's effect becomes
 * real.
 *
 * Unlocking used to be the last decision a player ever made about a skill.
 * With 749 of them and no cap, a long-running account simply accumulated
 * every effect at once and the tree stopped being a set of choices. Ten
 * slots turn each unlock into an ongoing question — what am I carrying
 * *today* — and give a late-game player a reason to revisit skills they
 * bought months ago.
 *
 * Sticky, because the answer to "what does this do for me" should be
 * visible while browsing the tree, not one navigation away.
 */
export function LoadoutBar({ slots, bench }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [picking, setPicking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Slot that just received a skill — drives the one-shot attach animation. */
  const [justAttached, setJustAttached] = useState<number | null>(null);

  const filled = slots.filter((s) => s.skill).length;

  function attach(slot: number, skill: Skill) {
    setError(null);
    startTransition(async () => {
      const res = await equipSkill(skill.code, slot);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPicking(null);
      setJustAttached(slot);
      // Long enough to outlast the CSS animation, then cleared so the same
      // slot can flash again on the next attach.
      setTimeout(() => setJustAttached(null), 900);
      router.refresh();
    });
  }

  function detach(slot: number) {
    setError(null);
    startTransition(async () => {
      const res = await clearSlot(slot);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      {picking !== null && (
        <div
          className="fixed inset-0 z-30"
          style={{ background: "rgba(2,5,8,.72)", backdropFilter: "blur(3px)" }}
          onClick={() => setPicking(null)}
          role="presentation"
        >
          <div
            className="card fixed left-1/2 top-1/2 w-[min(94vw,760px)] -translate-x-1/2 -translate-y-1/2 p-4"
            style={{ maxHeight: "72vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="panel-title">Attach to slot {picking + 1}</h2>
              <button type="button" className="btn-ghost" onClick={() => setPicking(null)}>
                Cancel
              </button>
            </div>
            {bench.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
                Every skill you own is already equipped. Unlock more from a path to expand your options.
              </p>
            ) : (
              <ul className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))" }}>
                {bench.map((skill) => (
                  <li key={skill.code}>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => attach(picking, skill)}
                      // The emblem is aria-hidden and the label is split
                      // across nested spans, which left the control with no
                      // computed name in the accessibility tree.
                      aria-label={`Attach ${skill.name} — ${skill.effectText}`}
                      className="flex w-full items-center gap-2.5 p-2 text-left"
                      style={{
                        borderRadius: 10,
                        border: "1px solid var(--line)",
                        background: "var(--sub)",
                        cursor: "pointer",
                      }}
                    >
                      <SkillLogo skill={skill} size={34} animated={false} />
                      <span className="min-w-0">
                        <span
                          className="block truncate"
                          style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-0)" }}
                        >
                          {skill.name}
                        </span>
                        <span
                          className="block truncate"
                          style={{ fontSize: 10, color: RANK_META[skill.rank].color }}
                        >
                          {RANK_META[skill.rank].label} · {skill.effectText}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div
        className="sticky bottom-0 z-20 mt-6"
        style={{
          background: "rgba(4,8,15,.92)",
          backdropFilter: "blur(10px)",
          borderTop: "1px solid var(--line)",
        }}
      >
        <div className="site-container flex items-center gap-4 py-2.5">
          <div className="shrink-0">
            <p className="label-xs">Loadout</p>
            <p className="mono" style={{ fontSize: 11, color: filled === slots.length ? "var(--green)" : "var(--ink-2)" }}>
              {filled}/{slots.length} equipped
            </p>
          </div>

          <ul className="flex flex-1 items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {slots.map((s) => (
              <li key={s.slot} className="shrink-0">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => (s.skill ? detach(s.slot) : setPicking(s.slot))}
                  title={
                    s.skill
                      ? `${s.skill.name} — ${s.active ? s.skill.effectText : "dormant: requirements no longer met"} (click to remove)`
                      : `Slot ${s.slot + 1} — empty`
                  }
                  aria-label={s.skill ? `Slot ${s.slot + 1}: ${s.skill.name}` : `Slot ${s.slot + 1}, empty`}
                  className={`slot ${justAttached === s.slot ? "slot-attach" : ""}`}
                  style={{
                    borderColor: s.skill
                      ? s.active
                        ? "rgba(0,204,122,.45)"
                        : "rgba(240,160,48,.45)"
                      : "var(--line-hi)",
                    background: s.skill ? "var(--raised)" : "var(--sub)",
                    // A dormant skill is dimmed rather than hidden: it is
                    // still taking up one of your ten.
                    opacity: s.skill && !s.active ? 0.55 : 1,
                  }}
                >
                  {s.skill ? (
                    <SkillLogo skill={s.skill} size={34} />
                  ) : (
                    <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      {s.slot + 1}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {error && (
            <p className="shrink-0" style={{ fontSize: 11, color: "var(--red)" }} role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
