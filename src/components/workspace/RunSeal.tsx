"use client";

/**
 * A Tier 2 Seal rendered INSIDE the review run: in the result panel under
 * the payout, and in the recap's What moved. `.seal-card.inline`, no button
 * of its own (redesign › Rewards, Tier 2). The events come from L3's
 * detectors via the review action; while a run is open the queue merges
 * them into the run (celebrate.ts openRun), so this is where they play.
 *
 * Motion (Full): the rim draws 520 ms, the notches pop 32 ms apart, the
 * numeral rolls at 380 ms, 14 seeded motes. Calm and Still show the
 * settled card with the same words. The words also go to the live region,
 * with the seal's sound and haptic, once per event id.
 */
import { useEffect, useRef } from "react";
import { Amount } from "@/components/ui/Amount";
import { Medallion } from "@/components/ui/Crest";
import { announce, haptic, sound } from "@/lib/celebrate";
import type { CelebrationEvent } from "@/lib/celebration-types";
import { burst, center, motionLevel, play, roll } from "@/lib/motion";

const played = new Set<string>();

export function RunSeal({ ev, quiet = false }: { ev: CelebrationEvent; quiet?: boolean }) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const f = ev.facts;
  const material = f.material ?? "bronze";

  useEffect(() => {
    if (quiet || played.has(ev.id)) return;
    played.add(ev.id);
    sound("seal");
    haptic("seal");
    announce(f.say ?? [f.eyebrow, f.title, ...(f.lines ?? [])].filter(Boolean).join(". "));
    const card = cardRef.current;
    void play(card?.querySelector(".medal .rim") ?? null, [{ strokeDasharray: "100", strokeDashoffset: 100 }, { strokeDasharray: "100", strokeDashoffset: 0 }], {
      duration: 520,
      flourish: true,
    });
    card?.querySelectorAll(".medal .notch").forEach((n, i) => void play(n, [{ opacity: 0 }, { opacity: 1 }], { duration: 120, delay: 300 + i * 32 }));
    const t = window.setTimeout(
      () => {
        if (f.numeral && f.numeral.from != null) roll(card?.querySelector<HTMLElement>(".num-wrap b") ?? null, String(f.numeral.to));
        const medal = card?.querySelector(".medal");
        if (medal) {
          const [x, y] = center(medal);
          burst(x, y, 14, ev.id, { spread: 64 });
        }
      },
      motionLevel() === "full" ? 380 : 0
    );
    return () => window.clearTimeout(t);
    // One play per event id; the facts are fixed for an id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.id, quiet]);

  // The numeral rests on its final value; a roll only runs from `from` when the card plays.
  const numeral = f.numeral ? (quiet || played.has(ev.id) || f.numeral.from == null ? f.numeral.to : f.numeral.from) : null;

  return (
    <div ref={cardRef} className="seal-card inline" role="group" aria-label={`${f.eyebrow}: ${f.title}`}>
      <div className="sc-top">
        <Medallion material={material} numeral={numeral} size={56} />
        <div className="sc-t">
          <div className="t-eyebrow">{f.eyebrow}</div>
          <h3>{f.title}</h3>
        </div>
      </div>
      {((f.lines?.length ?? 0) > 0 || (f.amounts?.length ?? 0) > 0) && (
        <ul className="facts">
          {f.lines?.map((l) => (
            <li key={l}>{l}</li>
          ))}
          {f.amounts?.map((a) => (
            <li key={`${a.kind}:${a.label ?? ""}`}>
              <Amount kind={a.kind} value={a.value} label={a.label} />
            </li>
          ))}
        </ul>
      )}
      {ev.what.length > 0 && (
        <div className="what">
          <div className="t-eyebrow">What moved</div>
          <ul>
            {ev.what.map((w) => (
              <li key={w.label}>
                <span>{w.label}</span>
                <b>{w.value}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
