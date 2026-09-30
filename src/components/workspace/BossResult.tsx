"use client";

/**
 * The encounter's closing beat, at the top of the session recap.
 *
 * Victory states the fixed payout (the MP promised before the fight), the
 * real score against the real bar, and offers every boon to choose from:
 * nothing is drawn. Defeat names what the debuff costs, when it lifts on its
 * own, and the real score, so the gap always looks closeable. Either way the
 * encounter was a full session of genuine reviews, and the screen says so.
 */
import { useState } from "react";
import type { BossResolution } from "@/lib/bosses";
import { BOON_META, type BoonKind } from "@/lib/boon-meta";
import { DEBUFF_META } from "@/lib/debuff-meta";
import { formatExpiry } from "@/lib/format-date";
import { Amount } from "@/components/ui/Amount";
import { Chip } from "@/components/ui/Chip";
import { BossSigil } from "./BossSigil";

type Settled = Exclude<BossResolution, { outcome: "rejected" }>;

interface Props {
  resolution: Settled;
  fieldId: string;
  /** Grants the chosen boon; resolves to an error message, or null when it was granted. */
  onChoose: (kind: BoonKind) => Promise<string | null>;
}

export function BossResult({ resolution, fieldId, onChoose }: Props) {
  const victory = resolution.outcome === "victory";
  const score = `${resolution.correct} of ${resolution.total} correct · ${resolution.needCorrect} needed`;
  return (
    <section className="card rv-boss" aria-labelledby="rv-boss-h">
      <div className="top">
        <BossSigil seed={fieldId} tier={victory ? Math.max(1, resolution.newTier - 1) : 1} muted={!victory} className="rv-sig" />
        <div style={{ minWidth: 0 }}>
          <div className="t-eyebrow">{victory ? "Victory" : "Defeat"}</div>
          <h2 id="rv-boss-h" className="t-display-m" style={{ margin: "2px 0 0" }}>
            {victory ? `${resolution.defeated.name} falls` : "It holds"}
          </h2>
          <p className="t-meta">{score}</p>
        </div>
      </div>

      {victory ? (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Amount kind="mp" value={resolution.masteryAwarded} label="MP, as promised" className="ink-0" />
            <Chip tone="kept" icon="check">
              Won
            </Chip>
          </div>
          <BoonChoice
            choices={resolution.boon.choices}
            claimUntil={resolution.boon.claimUntil}
            onChoose={onChoose}
          />
          <p className="t-meta">
            Something older takes its place: <b className="ink-1">{resolution.nextBoss.name}</b> waits at tier {resolution.newTier}, after{" "}
            {formatExpiry(resolution.cooldownUntil)}.
          </p>
        </>
      ) : (
        <>
          <p className="t-epithet">“{resolution.taunt}”</p>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <Chip tone="owed">
              {DEBUFF_META[resolution.debuff].label} · {DEBUFF_META[resolution.debuff].effectText(DEBUFF_META[resolution.debuff].defaultMagnitude)}
            </Chip>
            <span className="t-meta">Lifts on its own at {formatExpiry(resolution.debuffUntil)}.</span>
          </div>
        </>
      )}
      <p className="t-meta">Every card in that encounter was a real review. The schedule moved regardless.</p>
    </section>
  );
}

/** Every boon, one tap each: the choice is the reward, and there is no wrong one (boon-meta.ts). */
export function BoonChoice({
  choices,
  claimUntil,
  onChoose,
}: {
  choices: BoonKind[];
  claimUntil: Date;
  onChoose: (kind: BoonKind) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState<BoonKind | null>(null);
  const [chosen, setChosen] = useState<BoonKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(kind: BoonKind) {
    if (busy || chosen) return;
    setBusy(kind);
    setError(null);
    const err = await onChoose(kind).catch(() => "Could not save the choice. Try again.");
    setBusy(null);
    if (err) setError(err);
    else setChosen(kind);
  }

  return (
    <div className="rv-col" style={{ gap: 8 }}>
      <div className="t-eyebrow">{chosen ? "Your boon" : "Choose a boon"}</div>
      {chosen ? (
        <p className="t-body">
          <b>{BOON_META[chosen].label}</b> · {BOON_META[chosen].effectText(BOON_META[chosen].magnitude)} for {BOON_META[chosen].durationHours} hours.
        </p>
      ) : (
        <>
          <div className="rv-boons" role="group" aria-label="Boons">
            {choices.map((k) => {
              const m = BOON_META[k];
              return (
                <button key={k} type="button" className="rv-boon" aria-pressed={busy === k} disabled={busy !== null} onClick={() => void choose(k)}>
                  <b>{m.label}</b>
                  <span className="fx">{m.effectText(m.magnitude)}</span>
                  <span className="t-meta">{m.blurb}</span>
                </button>
              );
            })}
          </div>
          <p className="t-meta">
            Each lasts {BOON_META[choices[0] ?? "INSIGHT"].durationHours} hours. Choose before {formatExpiry(claimUntil)}.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="rv-alert">
          {error}
        </p>
      )}
    </div>
  );
}
