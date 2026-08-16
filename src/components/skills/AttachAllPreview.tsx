"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SkillLogo } from "./SkillLogo";
import { EquipPulse } from "./EquipPulse";
import { BarCharge, type ChargeVariant } from "./BarCharge";
import { Cataclysm } from "./Cataclysm";
import { skinFor, depthOf } from "@/lib/skill-form";
import { themeFor } from "@/lib/attribute-themes";
import { RANK_META } from "@/lib/skill-visuals";
import type { Skill } from "@/lib/skill-pool";

/**
 * Every attach animation in the app, replayable side by side.
 *
 * The equip reaction is three layers that are tuned independently and only
 * ever seen together for a few hundred milliseconds: `EquipPulse` in the
 * slot, `BarCharge` across the footer, and the page surge over the whole
 * document. Each is driven by the emblem's charge on the 15-rung ladder, and
 * the entire design claim is that a Pure I and an Ultimate produce
 * recognisably different events rather than the same event at two sizes.
 *
 * That claim is unfalsifiable in the real app: you cannot equip an Ultimate
 * you do not own, you cannot replay an attach, and you certainly cannot put
 * two of them next to each other. Here every rung fires on demand, so the
 * escalation is something you can actually check.
 *
 * The page surge is deliberately *not* raised per row — one full-viewport
 * wash per emblem would make a grid of them unreadable. It gets its own
 * button, which fires it alone.
 */

interface Props {
  groups: { label: string; note: string; skills: Skill[] }[];
}

/** One emblem in a real slot, with the two local layers replayable. */
function AttachCell({ skill, take, onFire }: { skill: Skill; take: number; onFire: (s: Skill) => void }) {
  const { charge } = skinFor(skill);
  const legendary = skill.rank === "APEX" || skill.rank === "ULTIMATE";
  const color = legendary ? RANK_META[skill.rank].color : themeFor(skill.attributes[0]).color;
  const variant: ChargeVariant = legendary ? "bloom" : charge > 0.45 ? "surge" : "meter";

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => onFire(skill)}
        className="w-full p-2"
        style={{
          borderRadius: 10,
          background: "var(--sub)",
          border: "1px solid var(--line)",
          cursor: "pointer",
          position: "relative",
          overflow: "hidden",
        }}
        title={`${skill.name}\n${skill.effectText}\ndepth ${depthOf(skill)}/15 · charge ${(charge * 100).toFixed(0)}% · ${variant}`}
      >
        {/* The bar layer, scoped to this cell so each row shows its own. */}
        {take > 0 && (
          <BarCharge key={`bc-${take}`} skill={skill} variant={variant} originPercent={50} />
        )}

        <span className="relative flex flex-col items-center gap-1.5" style={{ zIndex: 1 }}>
          <span className="slot" style={{ position: "relative", borderColor: "rgba(0,204,122,.45)", background: "var(--raised)" }}>
            <SkillLogo skill={skill} size={34} />
            {take > 0 && <EquipPulse key={`ep-${take}`} skill={skill} />}
          </span>
          <span className="w-full truncate text-center" style={{ fontSize: 9.5, color: "var(--ink-1)" }}>
            {skill.name}
          </span>
          <span className="mono" style={{ fontSize: 8.5, color }}>
            d{depthOf(skill)} · {(charge * 100).toFixed(0)}% · {variant}
          </span>
        </span>
      </button>
    </li>
  );
}

export function AttachAllPreview({ groups }: Props) {
  /** Per-skill replay counter. Bumping it remounts both layers, which is what replays a one-shot. */
  const [takes, setTakes] = useState<Record<string, number>>({});
  const [surge, setSurge] = useState<{ key: number; color: string; intensity: string; dur: number } | null>(null);
  const [cataclysm, setCataclysm] = useState<{ key: number; skill: Skill } | null>(null);
  const surgeSeq = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const bump = useCallback((codes: string[]) => {
    setTakes((prev) => {
      const next = { ...prev };
      for (const c of codes) next[c] = (next[c] ?? 0) + 1;
      return next;
    });
  }, []);

  const firePageSurge = useCallback((skill: Skill) => {
    const { charge } = skinFor(skill);
    const legendary = skill.rank === "APEX" || skill.rank === "ULTIMATE";
    surgeSeq.current += 1;
    const dur = 720 + Math.round(charge * 780);
    setSurge({
      key: surgeSeq.current,
      color: legendary ? RANK_META[skill.rank].color : themeFor(skill.attributes[0]).color,
      intensity: (0.1 + Math.pow(charge, 3) * 0.62).toFixed(2),
      dur,
    });
    timers.current.push(window.setTimeout(() => setSurge(null), dur + 400));

    if (skill.rank === "APEX" || skill.rank === "ULTIMATE") {
      setCataclysm({ key: surgeSeq.current, skill });
      // Must outlive the branch it started: Apex runs 2.6s, and Ultimate's
      // collapse runs 4.2s with the rebound ring finishing at 4.4s.
      // Emblem prelude plus the event itself: Apex 1.2s + 3.4s, Ultimate
      // 1.8s + 3.6s with the rebound finishing last.
      timers.current.push(window.setTimeout(() => setCataclysm(null), skill.rank === "ULTIMATE" ? 6000 : 4000));
    }
  }, []);

  /** Walks a group one emblem at a time so the escalation is visible as a sequence. */
  const playGroup = useCallback(
    (skills: Skill[]) => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
      skills.forEach((s, i) => {
        timers.current.push(window.setTimeout(() => bump([s.code]), i * 320));
      });
    },
    [bump]
  );

  return (
    <div className="space-y-4">
      {cataclysm && <Cataclysm skill={cataclysm.skill} replayKey={cataclysm.key} />}

      {surge && (
        <span
          key={surge.key}
          className="page-surge"
          aria-hidden="true"
          style={
            {
              "--ps-color": surge.color,
              "--ps-origin": "50%",
              "--ps-dur": `${surge.dur}ms`,
              "--ps-intensity": surge.intensity,
            } as React.CSSProperties
          }
        />
      )}

      {groups.map((g) => (
        <section key={g.label} className="card" style={{ padding: 14 }}>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <p className="panel-title">{g.label}</p>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: 10.5, padding: "4px 10px" }}
                onClick={() => playGroup(g.skills)}
              >
                Play in sequence
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: 10.5, padding: "4px 10px" }}
                onClick={() => bump(g.skills.map((s) => s.code))}
              >
                All at once
              </button>
            </div>
          </div>
          <p className="panel-sub mb-3" style={{ maxWidth: "76ch" }}>
            {g.note}
          </p>

          <ul className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(104px,1fr))" }}>
            {g.skills.map((s) => (
              <AttachCell
                key={s.code}
                skill={s}
                take={takes[s.code] ?? 0}
                onFire={(sk) => {
                  bump([sk.code]);
                  firePageSurge(sk);
                }}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
