"use client";

import { useState, useTransition } from "react";
import type { BossState } from "@/lib/bosses";
import { fieldColor } from "@/lib/palette";

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
 * worth. That transparency is the whole difference between a challenge and
 * a gamble — the draw is random, the deal never is.
 */
export function BossPanel({ bosses, onChallenge, pendingFieldId, error }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isPending] = useTransition();

  const ready = bosses.filter((b) => b.availability.status === "ready");
  const others = bosses.filter((b) => b.availability.status !== "ready");

  if (bosses.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="label-xs">Encounters</p>
        {ready.length > 0 && (
          <p style={{ fontSize: 11, color: "var(--amber)" }}>
            {ready.length} boss{ready.length === 1 ? "" : "es"} ready
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-2" style={{ fontSize: 11, color: "var(--red)" }}>
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {[...ready, ...others].map((boss) => {
          const accent = fieldColor(boss.fieldName);
          const isReady = boss.availability.status === "ready";
          const isOpen = expanded === boss.fieldId;

          return (
            <div
              key={boss.fieldId}
              className={`card ${isReady ? "boss-rise card-hover" : ""}`}
              style={{
                padding: 13,
                borderColor: isReady ? "rgba(240,160,48,0.45)" : "var(--line)",
                background: isReady
                  ? "linear-gradient(160deg, rgba(240,160,48,0.09) 0%, transparent 55%), var(--card)"
                  : undefined,
                opacity: boss.availability.status === "locked" ? 0.6 : 1,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: accent,
                        display: "inline-block",
                        flexShrink: 0,
                      }}
                    />
                    <p style={{ fontSize: 12.5, fontWeight: 700, color: isReady ? "var(--amber)" : "var(--ink-1)" }}>
                      {boss.archetype.name}
                    </p>
                    <span className="chip chip-muted" style={{ fontSize: 9 }}>
                      T{boss.tier}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
                    {boss.fieldName}
                    {boss.victories > 0 && ` · ${boss.victories} felled`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : boss.fieldId)}
                  style={{
                    fontSize: 10,
                    color: "var(--ink-3)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  {isOpen ? "less" : "more"}
                </button>
              </div>

              {isOpen && (
                <p className="mt-2" style={{ fontSize: 11, lineHeight: 1.5, color: "var(--ink-2)", fontStyle: "italic" }}>
                  {boss.archetype.story}
                </p>
              )}

              {/* The deal, stated up front. */}
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1" style={{ fontSize: 10.5, color: "var(--ink-2)" }}>
                <span>
                  <span className="mono" style={{ color: "var(--ink-1)" }}>
                    {boss.batchSize}
                  </span>{" "}
                  cards
                </span>
                <span>
                  <span className="mono" style={{ color: "var(--ink-1)" }}>
                    {Math.round(boss.requiredAccuracy * 100)}%
                  </span>{" "}
                  to win
                </span>
                <span>
                  <span className="mono" style={{ color: "var(--amber)" }}>
                    +{boss.masteryReward}
                  </span>{" "}
                  mastery
                </span>
              </div>

              <div className="mt-3">
                {isReady ? (
                  <button
                    type="button"
                    onClick={() => onChallenge(boss.fieldId)}
                    disabled={isPending || pendingFieldId !== null}
                    className="btn-primary w-full"
                    style={{ padding: "8px 14px", fontSize: 11.5 }}
                  >
                    {pendingFieldId === boss.fieldId ? "Summoning…" : "Challenge"}
                  </button>
                ) : (
                  <p style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
                    {boss.availability.status === "locked" &&
                      `Field must reach level 5 — ${boss.availability.levelsNeeded} to go.`}
                    {boss.availability.status === "insufficient_material" &&
                      `Gathering strength — ${boss.availability.have}/${boss.availability.need} due ideas.`}
                    {boss.availability.status === "cooldown" &&
                      `Regrouping until ${boss.availability.until.toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                      })}.`}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
