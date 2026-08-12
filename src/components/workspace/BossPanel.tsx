"use client";

import { useState } from "react";
import type { BossState } from "@/lib/bosses";
import { BOON_KINDS, BOON_META } from "@/lib/boon-meta";
import { fieldColor } from "@/lib/palette";
import { BossSigil } from "./BossSigil";
import { formatExpiry } from "@/lib/format-date";

interface Props {
  bosses: BossState[];
  onChallenge: (fieldId: string) => void;
  pendingFieldId: string | null;
  error: string | null;
}

/**
 * The Boss roster on the Review screen.
 *
 * Every card states, before you commit, exactly what the encounter costs
 * and pays: how many cards, what accuracy is required, what a victory is
 * worth, and what a defeat costs. That transparency is the whole
 * difference between a challenge and a gamble — the card draw is random,
 * the deal never is.
 */
export function BossPanel({ bosses, onChallenge, pendingFieldId, error }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (bosses.length === 0) return null;

  const ready = bosses.filter((b) => b.availability.status === "ready");
  const others = bosses.filter((b) => b.availability.status !== "ready");

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="label-xs">Encounters</p>
        {ready.length > 0 && (
          <p style={{ fontSize: 11, color: "var(--amber)" }}>
            {ready.length} ready
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-2" style={{ fontSize: 11, color: "var(--red)" }}>
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {[...ready, ...others].map((boss) => {
          const accent = fieldColor(boss.fieldName);
          const isReady = boss.availability.status === "ready";
          const isLocked = boss.availability.status === "locked";
          const isOpen = expanded === boss.fieldId;
          // How close this Field is to fielding an encounter at all — the
          // "gathering strength" bar. A boss is its Field's review debt, so
          // this genuinely is the creature growing.
          const gather =
            boss.availability.status === "insufficient_material"
              ? Math.min(1, boss.availability.have / boss.availability.need)
              : 1;

          return (
            <article
              key={boss.fieldId}
              className={`card relative overflow-hidden ${isReady ? "boss-rise card-hover" : ""}`}
              style={{
                padding: 13,
                borderColor: isReady ? "rgba(240,160,48,0.5)" : "var(--line)",
                background: isReady
                  ? "linear-gradient(150deg, rgba(240,160,48,0.11) 0%, transparent 58%), var(--card)"
                  : undefined,
                opacity: isLocked ? 0.55 : 1,
              }}
            >
              {isReady && (
                <div
                  aria-hidden
                  className="aura-breathe pointer-events-none absolute -right-12 -top-12 h-36 w-36"
                  style={{ background: "radial-gradient(circle, rgba(240,160,48,0.22), transparent 70%)" }}
                />
              )}

              <div className="relative flex items-start gap-3">
                <BossSigil seed={boss.fieldId} tier={boss.tier} size={44} muted={!isReady} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: isReady ? "var(--amber)" : "var(--ink-1)",
                          lineHeight: 1.25,
                        }}
                      >
                        {boss.archetype.name}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate" style={{ fontSize: 10, color: "var(--ink-3)" }}>
                        <span style={{ width: 5, height: 5, borderRadius: 999, background: accent, display: "inline-block", flexShrink: 0 }} />
                        {boss.fieldName}
                      </p>
                    </div>

                    {/* Tier as pips — a threat level you read rather than parse. */}
                    <div className="flex shrink-0 items-center gap-1" title={`Tier ${boss.tier}`}>
                      {Array.from({ length: Math.min(5, boss.tier) }, (_, i) => (
                        <span
                          key={i}
                          style={{
                            width: 4,
                            height: 10,
                            borderRadius: 1,
                            background: isReady ? "var(--amber)" : "var(--ink-3)",
                            opacity: 0.5 + i * 0.12,
                            display: "inline-block",
                          }}
                        />
                      ))}
                      {boss.tier > 5 && (
                        <span className="mono" style={{ fontSize: 9, color: "var(--amber)" }}>
                          +{boss.tier - 5}
                        </span>
                      )}
                    </div>
                  </div>

                  {boss.victories > 0 && (
                    <p className="mt-1" style={{ fontSize: 9.5, color: "var(--ink-3)" }}>
                      {boss.victories} felled · returns stronger each time
                    </p>
                  )}
                </div>
              </div>

              {/* The deal, stated up front — win and lose both. */}
              <div className="relative mt-3 grid grid-cols-3 gap-px overflow-hidden" style={{ background: "var(--line)", borderRadius: 8 }}>
                {[
                  { label: "Cards", value: String(boss.batchSize), tone: "var(--ink-0)" },
                  { label: "To win", value: `${Math.round(boss.requiredAccuracy * 100)}%`, tone: "var(--ink-0)" },
                  { label: "Reward", value: `+${boss.masteryReward}`, tone: "var(--amber)" },
                ].map((cell) => (
                  <div key={cell.label} className="px-2 py-1.5" style={{ background: "var(--card)" }}>
                    <p className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: cell.tone }}>
                      {cell.value}
                    </p>
                    <p className="label-xs" style={{ fontSize: 8.5 }}>
                      {cell.label}
                    </p>
                  </div>
                ))}
              </div>

              <p className="relative mt-2" style={{ fontSize: 9.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
                Victory also opens a <span style={{ color: "var(--green)" }}>Spoils Cache</span> — one of{" "}
                {BOON_KINDS.length} day-long boons ({BOON_KINDS.map((k) => BOON_META[k].label).join(", ")}). Defeat
                costs a day of reduced yield, nothing more.
              </p>

              {isOpen && (
                <p
                  className="relative mt-2"
                  style={{ fontSize: 11, lineHeight: 1.55, color: "var(--ink-2)", fontStyle: "italic" }}
                >
                  {boss.archetype.story}
                </p>
              )}

              <div className="relative mt-3 flex items-center gap-2">
                {isReady ? (
                  <button
                    type="button"
                    onClick={() => onChallenge(boss.fieldId)}
                    disabled={pendingFieldId !== null}
                    className="btn-primary flex-1"
                    style={{ padding: "8px 14px", fontSize: 11.5 }}
                  >
                    {pendingFieldId === boss.fieldId ? "Summoning…" : "Challenge"}
                  </button>
                ) : (
                  <div className="flex-1">
                    {boss.availability.status === "insufficient_material" && (
                      <>
                        <div className="mb-1 flex items-baseline justify-between">
                          <span style={{ fontSize: 9.5, color: "var(--ink-3)" }}>Gathering strength</span>
                          <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-3)" }}>
                            {boss.availability.have}/{boss.availability.need}
                          </span>
                        </div>
                        <div className="h-1 w-full overflow-hidden" style={{ borderRadius: 2, background: "var(--sub)" }}>
                          <div style={{ width: `${gather * 100}%`, height: "100%", borderRadius: 2, background: "var(--ink-2)" }} />
                        </div>
                      </>
                    )}
                    {isLocked && (
                      <p style={{ fontSize: 10, color: "var(--ink-3)" }}>
                        Sealed — this field must reach level 5 ({boss.availability.status === "locked" && boss.availability.levelsNeeded} to go).
                      </p>
                    )}
                    {boss.availability.status === "cooldown" && (
                      <p style={{ fontSize: 10, color: "var(--ink-3)" }}>
                        Regrouping until{" "}
                        {formatExpiry(boss.availability.until)}
                        .
                      </p>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : boss.fieldId)}
                  className="btn-ghost shrink-0"
                  style={{ padding: "6px 10px", fontSize: 10 }}
                  aria-expanded={isOpen}
                >
                  {isOpen ? "Less" : "Lore"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
