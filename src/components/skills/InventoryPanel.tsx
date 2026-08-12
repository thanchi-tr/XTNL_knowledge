"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SKILL_POOL, type Skill, type SkillRank } from "@/lib/skill-pool";
import { meetsRequirements, type ActiveModifiers } from "@/lib/skill-gates";
import { describeModifiers } from "@/lib/modifier-display";
import { RANK_META, RANK_ORDER } from "@/lib/skill-visuals";
import { ATTRIBUTE_META, type AttributeScores } from "@/lib/attributes";
import { SkillLogo } from "./SkillLogo";
import { equipSkill, clearSlot } from "@/app/actions/skills";
import { LOADOUT_SLOTS } from "@/lib/loadout";

/**
 * The inventory — what you own, what you are carrying, and what it does.
 *
 * Every stat line names the engine hook it lands on, so nothing here reads
 * as a decorative number.
 *
 * This panel predates the loadout and had not been told about it: it
 * derived "active" from `meetsRequirements` alone, so a benched skill was
 * reported as active and contributing while the engine — which folds only
 * equipped skills — was ignoring it entirely. The screen and the maths
 * disagreed. Active here now means *equipped and qualifying*, which is the
 * same condition `loadProgression` applies.
 */

interface Props {
  ownedCodes: string[];
  /** skillCode -> loadout slot. Absent means benched. */
  equippedByCode: Record<string, number>;
  scores: AttributeScores;
  modifiers: ActiveModifiers;
}

export function InventoryPanel({ ownedCodes, equippedByCode, scores, modifiers }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<SkillRank | "ALL">("ALL");
  const [error, setError] = useState<string | null>(null);

  const owned = useMemo(() => {
    const set = new Set(ownedCodes);
    return SKILL_POOL.filter((s) => set.has(s.code)).sort(
      (a, b) => RANK_META[b.rank].order - RANK_META[a.rank].order || b.tier - a.tier || a.name.localeCompare(b.name)
    );
  }, [ownedCodes]);

  const slotOf = (s: Skill): number | undefined => equippedByCode[s.code];
  const isEquipped = (s: Skill) => slotOf(s) !== undefined;
  const qualifies = (s: Skill) =>
    meetsRequirements(s, scores, modifiers.resonancePercent, modifiers.attributePenaltyPercent);
  /** The engine's own condition: a slot AND the requirements still met. */
  const isActive = (s: Skill) => isEquipped(s) && qualifies(s);

  const equippedCount = owned.filter(isEquipped).length;
  const activeCount = owned.filter(isActive).length;
  /** Equipped but no longer qualifying — burning a slot for nothing. */
  const dormant = owned.filter((s) => isEquipped(s) && !qualifies(s));
  const stats = describeModifiers(modifiers);

  const usedSlots = new Set(Object.values(equippedByCode));
  const firstFreeSlot = Array.from({ length: LOADOUT_SLOTS }, (_, i) => i).find((i) => !usedSlots.has(i));

  function toggleEquip(skill: Skill) {
    setError(null);
    const slot = slotOf(skill);
    startTransition(async () => {
      const res =
        slot !== undefined
          ? await clearSlot(slot)
          : firstFreeSlot === undefined
            ? { ok: false as const, error: "All ten slots are full — remove one first." }
            : await equipSkill(skill.code, firstFreeSlot);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const countsByRank = useMemo(() => {
    const out = {} as Record<SkillRank, number>;
    for (const rank of RANK_ORDER) out[rank] = 0;
    for (const s of owned) out[s.rank] += 1;
    return out;
  }, [owned]);

  const visible = filter === "ALL" ? owned : owned.filter((s) => s.rank === filter);

  if (owned.length === 0) {
    return (
      <div className="card px-6 py-14 text-center">
        <p style={{ fontSize: 13, color: "var(--ink-1)" }}>Nothing acquired yet.</p>
        <p className="mt-1.5" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          Unlock a skill from the tree and it will appear here, with exactly what it changes.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
      {/* ── Active effects: the loadout readout ── */}
      <div className="card" style={{ padding: 16, alignSelf: "start" }}>
        <div className="flex items-baseline justify-between">
          <p className="label-xs">Active effects</p>
          <span className="mono" style={{ fontSize: 11, color: "var(--green)" }}>
            {activeCount}/{LOADOUT_SLOTS}
          </span>
        </div>
        <p style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 3 }}>
          {equippedCount} of {LOADOUT_SLOTS} slots filled · {owned.length} owned. Only equipped skills
          modify the engine.
        </p>

        {stats.length === 0 ? (
          <p className="mt-3" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            {equippedCount === 0
              ? "Nothing equipped. Attach a skill to a slot and its effect starts applying."
              : "Everything equipped is dormant — requirements are no longer met."}
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {stats.map((line) => (
              <div key={line.label}>
                <div className="flex items-baseline justify-between gap-2">
                  <span style={{ fontSize: 11.5, color: "var(--ink-1)" }}>{line.label}</span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: line.tone === "debuff" ? "var(--red)" : "var(--green)",
                    }}
                  >
                    {line.value}
                  </span>
                </div>
                <p style={{ fontSize: 10, color: "var(--ink-3)", lineHeight: 1.45 }}>{line.hook}</p>
              </div>
            ))}
          </div>
        )}

        {dormant.length > 0 && (
          <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
            <p style={{ fontSize: 10.5, color: "var(--amber)" }}>
              {dormant.length} equipped skill{dormant.length === 1 ? "" : "s"} dormant — requirements no
              longer met.
            </p>
            <p style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 3 }}>
              Each is still holding a slot and yielding nothing. They reactivate when the attribute score
              recovers — or free the slot for something that works now.
            </p>
          </div>
        )}
      </div>

      {/* ── The collection ── */}
      <div>
        {error && (
          <p
            role="alert"
            className="mb-2 px-3 py-2"
            style={{
              fontSize: 11,
              borderRadius: 8,
              background: "var(--red-10)",
              border: "1px solid rgba(240,58,87,0.20)",
              color: "var(--red)",
            }}
          >
            {error}
          </p>
        )}
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className="chip"
            style={{
              cursor: "pointer",
              background: filter === "ALL" ? "var(--green-10)" : "var(--sub)",
              color: filter === "ALL" ? "var(--green)" : "var(--ink-2)",
              border: `1px solid ${filter === "ALL" ? "rgba(0,204,122,0.25)" : "var(--line)"}`,
            }}
          >
            All {owned.length}
          </button>
          {RANK_ORDER.filter((r) => countsByRank[r] > 0).map((rank) => {
            const meta = RANK_META[rank];
            const on = filter === rank;
            return (
              <button
                key={rank}
                type="button"
                onClick={() => setFilter(rank)}
                className="chip"
                style={{
                  cursor: "pointer",
                  background: on ? meta.wash : "var(--sub)",
                  color: on ? meta.color : "var(--ink-2)",
                  border: `1px solid ${on ? `${meta.color}40` : "var(--line)"}`,
                }}
              >
                {meta.label} {countsByRank[rank]}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((skill) => {
            const meta = RANK_META[skill.rank];
            const equipped = isEquipped(skill);
            const active = isActive(skill);
            const slot = slotOf(skill);
            const legendary = skill.rank === "APEX" || skill.rank === "ULTIMATE";
            // Benched is the resting state, not a fault — it is dimmed, but
            // less harshly than a dormant skill, which is actively wasting
            // one of your ten.
            const borderColor = active
              ? `${meta.color}59`
              : equipped
                ? "rgba(240,160,48,0.35)"
                : "var(--line)";

            return (
              <div
                key={skill.code}
                className={`card equipped ${legendary ? "foil" : ""}`}
                style={
                  {
                    padding: 12,
                    borderColor,
                    background: active
                      ? `linear-gradient(160deg, ${meta.wash} 0%, transparent 62%), var(--card)`
                      : "var(--card)",
                    opacity: active ? 1 : equipped ? 0.78 : 0.62,
                    "--equipped-line": `${meta.color}22`,
                    "--equipped-glow": `${meta.color}55`,
                    "--foil": `${meta.color}30`,
                  } as React.CSSProperties
                }
              >
                <div className="flex items-start gap-2.5">
                  <div className="relative shrink-0">
                    <SkillLogo skill={skill} size={34} />
                    {!active && (
                      <span
                        aria-hidden
                        className="absolute inset-0"
                        style={{ background: "var(--card)", opacity: 0.45, borderRadius: 8 }}
                      />
                    )}
                    {/* Slot number, so the card and the bar can be matched
                        up without counting along the footer. */}
                    {equipped && (
                      <span
                        className="mono absolute -right-1.5 -top-1.5 grid place-items-center"
                        style={{
                          width: 15,
                          height: 15,
                          borderRadius: 5,
                          fontSize: 9,
                          fontWeight: 700,
                          color: "var(--base)",
                          background: active ? "var(--green)" : "var(--amber)",
                        }}
                      >
                        {slot! + 1}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: "var(--ink-0)",
                        lineHeight: 1.3,
                      }}
                    >
                      {skill.name}
                    </p>
                    <p style={{ fontSize: 10.5, color: meta.color, marginTop: 2 }}>{skill.effectText}</p>
                    <p style={{ fontSize: 9.5, color: "var(--ink-3)", marginTop: 3 }}>
                      {skill.attributes.map((a) => ATTRIBUTE_META[a].label).join(" · ")}
                      {equipped && !active && " · dormant"}
                      {!equipped && " · benched"}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isPending || (!equipped && firstFreeSlot === undefined)}
                  onClick={() => toggleEquip(skill)}
                  className="mt-2.5 w-full"
                  title={
                    equipped
                      ? `Remove from slot ${slot! + 1}`
                      : firstFreeSlot === undefined
                        ? "All ten slots are full"
                        : `Equip to slot ${firstFreeSlot + 1}`
                  }
                  style={{
                    padding: "5px 8px",
                    borderRadius: 8,
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    cursor: isPending || (!equipped && firstFreeSlot === undefined) ? "not-allowed" : "pointer",
                    border: `1px solid ${equipped ? "var(--line-hi)" : "rgba(0,204,122,0.35)"}`,
                    background: equipped ? "transparent" : "var(--green-10)",
                    color: equipped ? "var(--ink-2)" : "var(--green)",
                    opacity: !equipped && firstFreeSlot === undefined ? 0.4 : 1,
                  }}
                >
                  {equipped
                    ? `Unequip · slot ${slot! + 1}`
                    : firstFreeSlot === undefined
                      ? "Slots full"
                      : `Equip · slot ${firstFreeSlot + 1}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
