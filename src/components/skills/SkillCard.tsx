"use client";

import type { Skill } from "@/lib/skill-pool";
import type { UnlockBlocker } from "@/lib/skill-gates";
import type { EtaEstimate } from "@/lib/skill-eta";
import { getSkill } from "@/lib/skill-pool";
import { RANK_META } from "@/lib/skill-visuals";
import { ATTRIBUTE_META } from "@/lib/attributes";
import { SkillLogo } from "./SkillLogo";
import { RankTag } from "./RankTag";
import { UnlockButton } from "./UnlockButton";

export type SkillStatus = "active" | "dormant" | "locked";

interface Props {
  skill: Skill;
  status: SkillStatus;
  /** Empty when unlockable right now. */
  blockers: UnlockBlocker[];
  /** Current balance, so an affordability bar can show real progress rather than a yes/no. */
  masteryBalance: number;
  /** Projected time to reach, from observed rates. Omitted where no projection is wanted. */
  eta?: EtaEstimate;
}

/**
 * A progress bar per unmet requirement, rather than a line of text saying
 * you fell short.
 *
 * This is the single most important piece of feedback on the page: a locked
 * skill showing "Mind 8.3 / 48.2" as a bar that is visibly one-sixth full
 * tells you the thing is *approachable and moving*, where the same figure
 * as prose reads as a wall. Everything gated in this app is gated on
 * something the player can watch tick upward, so every gate is drawn that
 * way.
 */
function RequirementBar({
  label,
  have,
  need,
  tone,
}: {
  label: string;
  have: number;
  need: number;
  tone: string;
}) {
  const pct = need > 0 ? Math.max(0, Math.min(1, have / need)) : 1;
  const met = have >= need;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span style={{ fontSize: 10, color: met ? "var(--green)" : "var(--ink-2)" }}>{label}</span>
        <span className="mono" style={{ fontSize: 10, color: met ? "var(--green)" : "var(--ink-3)" }}>
          {have.toFixed(have < 10 ? 1 : 0)}/{need.toFixed(need < 10 ? 1 : 0)}
        </span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden" style={{ borderRadius: 2, background: "var(--sub)" }}>
        <div
          className="h-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct * 100}%`, borderRadius: 2, background: met ? "var(--green)" : tone }}
        />
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<SkillStatus, string> = {
  active: "Active",
  dormant: "Dormant",
  locked: "Locked",
};

export function SkillCard({ skill, status, blockers, masteryBalance, eta }: Props) {
  const meta = RANK_META[skill.rank];
  const owned = status !== "locked";
  const legendary = skill.rank === "APEX" || skill.rank === "ULTIMATE";

  const prerequisiteBlockers = blockers.filter((b) => b.reason === "PREREQUISITE");
  const attributeBlockers = blockers.filter((b) => b.reason === "ATTRIBUTE" || b.reason === "BREADTH");
  const masteryBlocker = blockers.find((b) => b.reason === "MASTERY");
  const unlockable = status === "locked" && blockers.length === 0;

  return (
    <div
      className={`card card-hover foil relative ${unlockable ? "skill-unlock" : ""}`}
      style={
        {
          padding: 14,
          borderColor: owned ? `${meta.color}66` : unlockable ? "rgba(0,204,122,0.45)" : "var(--line)",
          background:
            owned || unlockable ? `linear-gradient(160deg, ${meta.wash} 0%, transparent 60%), var(--card)` : undefined,
          opacity: status === "locked" && !unlockable ? 0.82 : 1,
          // Legendary ranks sweep in their own colour; everything else gets a
          // plain white glint, so the foil marks rank rather than just "hover".
          "--foil": legendary ? `${meta.color}45` : "rgba(255,255,255,0.07)",
        } as React.CSSProperties
      }
    >
      {/* Legendary ranks get a breathing aura — the only ambient motion on
          the page, so it reads as "this one is different" without a badge. */}
      {legendary && owned && (
        <div
          aria-hidden
          className="aura-breathe pointer-events-none absolute -right-8 -top-8 h-24 w-24"
          style={{ background: `radial-gradient(circle, ${meta.color}33, transparent 70%)` }}
        />
      )}

      {/* Corner bracket — a frame cue that scales with rank without adding a
          second badge competing with the rank chip. */}
      {(owned || unlockable) && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0"
          style={{
            width: legendary ? 22 : 14,
            height: legendary ? 22 : 14,
            borderTop: `2px solid ${meta.color}`,
            borderLeft: `2px solid ${meta.color}`,
            borderTopLeftRadius: 12,
            opacity: owned ? 0.8 : 0.45,
          }}
        />
      )}

      <div className="relative flex items-start gap-3">
        <SkillLogo skill={skill} size={42} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-0)", lineHeight: 1.3 }}>{skill.name}</p>
            <RankTag rank={skill.rank} />
          </div>

          <p style={{ fontSize: 11, color: meta.color, marginTop: 3, fontWeight: 500 }}>{skill.effectText}</p>

          {status === "active" && (
            <span className="chip chip-green mt-2 inline-block" style={{ fontSize: 9 }}>
              {STATUS_LABEL.active}
            </span>
          )}
          {status === "dormant" && (
            <p style={{ fontSize: 10, color: "var(--amber)", marginTop: 6 }}>
              Owned but dormant — requirements no longer met.
            </p>
          )}
        </div>
      </div>

      {status === "locked" && (
        <div className="relative mt-3 space-y-2">
          {prerequisiteBlockers.length > 0 && (
            <p style={{ fontSize: 10, color: "var(--ink-3)" }}>
              Requires{" "}
              {prerequisiteBlockers
                .map((b) => (b.reason === "PREREQUISITE" ? getSkill(b.missing)?.name ?? b.missing : ""))
                .join(" + ")}
            </p>
          )}

          {attributeBlockers.map((b) =>
            b.reason === "ATTRIBUTE" || b.reason === "BREADTH" ? (
              <RequirementBar
                key={`${b.reason}-${b.attribute}`}
                label={
                  b.reason === "BREADTH"
                    ? `${ATTRIBUTE_META[b.attribute].label} (breadth)`
                    : ATTRIBUTE_META[b.attribute].label
                }
                have={b.have}
                need={b.need}
                tone={b.reason === "BREADTH" ? "var(--blue)" : meta.color}
              />
            ) : null
          )}

          <RequirementBar
            label="Mastery"
            have={masteryBlocker && masteryBlocker.reason === "MASTERY" ? masteryBlocker.have : masteryBalance}
            need={skill.masteryCost}
            tone="var(--amber)"
          />

          {/* Projected from this account's own observed rates — see
              progress-rate.ts. Never a hardcoded "typically N weeks". */}
          {eta && (
            <div className="flex items-baseline justify-between gap-2 pt-1.5" style={{ borderTop: "1px solid var(--line)" }}>
              <span className="label-xs" style={{ fontSize: 9 }}>
                Time to reach
              </span>
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color:
                    eta.status === "available"
                      ? "var(--green)"
                      : eta.status === "no_progress"
                        ? "var(--red)"
                        : "var(--ink-1)",
                }}
              >
                {eta.label}
              </span>
            </div>
          )}
          {eta?.bottleneck && (
            <p style={{ fontSize: 9.5, color: "var(--ink-3)", marginTop: -4, lineHeight: 1.45 }}>{eta.bottleneck}</p>
          )}

          <div className="pt-1">
            <UnlockButton skillCode={skill.code} disabled={!unlockable} masteryCost={skill.masteryCost} />
          </div>
        </div>
      )}
    </div>
  );
}
