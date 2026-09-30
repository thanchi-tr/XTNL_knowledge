"use client";

/**
 * The hub's encounters (redesign › Study › Review › Hub).
 *
 * A ready encounter states the whole deal before you commit: how many
 * cards, how many correct answers win ("win with 7 correct"), what a win
 * pays (exact MP, a Seal, and a boon you choose) and what a loss costs. The
 * card draw is random; the deal never is. Everything not ready collapses to
 * one line. A victory whose boon has not been chosen yet stays at the top
 * until it is (or its window closes).
 */
import type { BossState } from "@/lib/bosses";
import { DEBUFF_META } from "@/lib/debuff-meta";
import { formatExpiry } from "@/lib/format-date";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/Tabs";
import { BossSigil } from "./BossSigil";

interface Props {
  bosses: BossState[];
  onChallenge: (fieldId: string) => void;
  onChooseBoon: (fieldId: string) => void;
  pendingFieldId: string | null;
  error: string | null;
}

function statusLine(b: BossState): string {
  switch (b.availability.status) {
    case "locked":
      return `Sealed until ${b.fieldName} reaches level 5 (${b.availability.levelsNeeded} to go)`;
    case "insufficient_material":
      return `Gathering strength · ${b.availability.have} of ${b.availability.need} due`;
    case "cooldown":
      return `Regrouping until ${formatExpiry(b.availability.until)}`;
    case "ready":
      return "Ready";
  }
}

const SHAKEN = DEBUFF_META.SHAKEN;

export function BossPanel({ bosses, onChallenge, onChooseBoon, pendingFieldId, error }: Props) {
  if (bosses.length === 0) return null;
  const boons = bosses.filter((b) => b.pendingBoon);
  const ready = bosses.filter((b) => b.availability.status === "ready");
  const others = bosses.filter((b) => b.availability.status !== "ready");

  return (
    <section aria-labelledby="rv-enc-h" className="rv-col" style={{ gap: 10 }}>
      <SectionHeader id="rv-enc-h" title="Encounters" aside={ready.length > 0 ? `${ready.length} ready` : undefined} />
      {error && (
        <p role="alert" className="rv-alert">
          {error}
        </p>
      )}

      {boons.map((b) => (
        <article key={`boon:${b.fieldId}`} className="card rv-enc">
          <BossSigil seed={b.fieldId} tier={Math.max(1, b.tier - 1)} className="rv-sig" />
          <div className="who">
            <b>Choose your boon</b>
            <span className="t-meta">
              {b.fieldName}: a victory&apos;s boon waits until {b.pendingBoon ? formatExpiry(b.pendingBoon.claimUntil) : "soon"}. Every boon lasts 24 hours.
            </span>
          </div>
          <Button variant="primary" onClick={() => onChooseBoon(b.fieldId)}>
            Choose
          </Button>
        </article>
      ))}

      {ready.map((b) => (
        <article key={b.fieldId} className="card rv-enc">
          <BossSigil seed={b.fieldId} tier={b.tier} className="rv-sig" />
          <div className="who">
            <b>{b.archetype.name}</b>
            <span className="t-meta">
              {b.fieldName} · {b.batchSize} cards · win with {b.needCorrect} correct. A win pays {b.masteryReward} MP, a Seal and a boon you
              choose; a loss costs {SHAKEN.effectText(SHAKEN.defaultMagnitude)} for {SHAKEN.durationHours} hours.
            </span>
          </div>
          <Button variant="secondary" onClick={() => onChallenge(b.fieldId)} disabled={pendingFieldId !== null}>
            {pendingFieldId === b.fieldId ? "Summoning…" : "Face it"}
          </Button>
        </article>
      ))}

      {others.length > 0 && (
        <details className="card rv-enc-more">
          <summary className="collapsed">
            <b>
              {others.length} {ready.length > 0 ? "more " : ""}encounter{others.length === 1 ? "" : "s"}
            </b>
            <span>{others.length === 1 ? statusLine(others[0]) : "not ready yet"}</span>
          </summary>
          {others.map((b) => (
            <div key={b.fieldId} className="rv-enc-row">
              <BossSigil seed={b.fieldId} tier={b.tier} muted className="rv-sig" />
              <div className="who">
                <b>{b.archetype.name}</b>
                <span className="t-meta">
                  {b.fieldName} · {statusLine(b)}
                </span>
              </div>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
