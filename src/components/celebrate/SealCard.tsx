"use client";

/**
 * L3-celebrate — the Seal (Tier 2): a Medallion in the band's material with
 * a rolling numeral, the eyebrow and display title, fact bullets with the
 * exact points (a level-up never hides the payout), and What moved.
 *
 *   Docked (the CelebrationHost plays it): Done button, Escape, auto-dismiss
 *   after 9 s that pauses on hover or focus.
 *   <SealCard ev={ev} inline/>  inside a result panel, recap or week card:
 *   no button of its own, and it marks the moment seen when it mounts.
 *
 * Motion (Full): rim draws 520 ms, notches pop at 32 ms each, the numeral
 * rolls at 380 ms, 14 seeded motes, one card sweep. Calm fades; Still shows
 * the settled card at once with identical words.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { pushEscapeLayer } from "@/components/capture/layers";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Medallion } from "@/components/ui/Crest";
import { cx } from "@/components/ui/cx";
import type { CelebrationEvent } from "@/lib/celebration-types";
import { burst, center, motionLevel, play } from "@/lib/motion";
import { ackShown } from "./stage";
import { WhatMoved } from "./WhatMoved";

/** The medal's face: a glyph for habit rungs and PRs, else the numeral (from → to). */
export function medalFace(ev: Pick<CelebrationEvent, "kind" | "facts">): { glyph: string | null; from: number | null; to: number | null } {
  if (ev.kind === "habit-rung") return { glyph: "◆", from: null, to: null };
  if (ev.kind === "pr") return { glyph: "PR", from: null, to: null };
  const n = ev.facts.numeral;
  return { glyph: null, from: n?.from ?? null, to: n?.to ?? null };
}

const SEAL_HOLD_MS = 9000;
const TYPING = "input, textarea, select, [contenteditable=''], [contenteditable='true']";

export interface SealCardProps {
  ev: CelebrationEvent;
  /** Inside a panel: no button, no hold, no Escape; marked seen on mount. */
  inline?: boolean;
  /** Docked: called once when it is dismissed (Done, Escape or the hold). */
  onDone?: () => void;
  /** False: render the settled card with no arrival motion (a recap listing, the lab). Default true. */
  animate?: boolean;
  className?: string;
}

export function SealCard({ ev, inline = false, onDone, animate = true, className }: SealCardProps) {
  const f = ev.facts;
  const face = medalFace(ev);
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  const [num, setNum] = useState<number | null>(face.to);
  const closing = useRef(false);
  const hold = useRef<number | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // Full motion starts the numeral on its old value, before the first paint (no flash).
  useLayoutEffect(() => {
    if (animate && face.from != null && face.to != null && face.from !== face.to && motionLevel() === "full") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNum(face.from);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.id]);

  const close = () => {
    if (inline || closing.current) return;
    closing.current = true;
    if (hold.current != null) window.clearTimeout(hold.current);
    const card = cardRef.current;
    if (card && card.contains(document.activeElement) && opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    setShown(false);
    window.setTimeout(() => onDoneRef.current?.(), motionLevel() === "still" ? 0 : 280);
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  const arm = () => {
    if (inline || closing.current) return;
    if (hold.current != null) window.clearTimeout(hold.current);
    hold.current = window.setTimeout(() => closeRef.current(), SEAL_HOLD_MS);
  };
  const pause = () => {
    if (hold.current != null) window.clearTimeout(hold.current);
    hold.current = null;
  };

  useEffect(() => {
    const card = cardRef.current;
    const level = motionLevel();
    const timers: number[] = [];
    const raf = requestAnimationFrame(() => setShown(true));
    if (inline) ackShown([ev]);
    if (!animate) {
      return () => cancelAnimationFrame(raf);
    }

    const medal = card?.querySelector(".medal") ?? null;
    void play(medal?.querySelector(".rim"), [{ strokeDasharray: "100", strokeDashoffset: 100 }, { strokeDasharray: "100", strokeDashoffset: 0 }], { duration: 520, flourish: true });
    medal?.querySelectorAll(".notch").forEach((n, i) => void play(n, [{ opacity: 0 }, { opacity: 1 }], { duration: 120, delay: 300 + i * 32 }));
    timers.push(
      window.setTimeout(
        () => {
          if (face.from != null && face.to != null && face.from !== face.to && level === "full") {
            const b = medal?.querySelector(".num-wrap b");
            void play(
              b,
              [
                { transform: "translateY(0)", opacity: 1 },
                { transform: "translateY(-60%)", opacity: 0, offset: 0.45 },
                { transform: "translateY(60%)", opacity: 0, offset: 0.5 },
                { transform: "none", opacity: 1 },
              ],
              { duration: 480, easing: "ease-out" }
            );
            timers.push(window.setTimeout(() => setNum(face.to), 215));
          }
          if (medal) {
            const [x, y] = center(medal);
            burst(x, y, 14, ev.id, { spread: 64 });
          }
        },
        level === "full" ? 380 : 0
      )
    );
    timers.push(window.setTimeout(() => card?.classList.add("go"), 400));

    let pop: (() => void) | null = null;
    if (!inline) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      pop = pushEscapeLayer(() => closeRef.current());
      arm();
      // Focus the Done button, unless the player is typing somewhere (never steal a keystroke).
      timers.push(
        window.setTimeout(() => {
          const active = document.activeElement;
          if (active instanceof Element && active.closest(TYPING)) return;
          card?.querySelector<HTMLElement>(".acts .btn")?.focus({ preventScroll: true });
        }, 240)
      );
    }
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
      pause();
      pop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.id]);

  const lines = f.lines ?? [];
  const amounts = f.amounts ?? [];
  return (
    <div
      ref={cardRef}
      className={cx("seal-card sweep", inline && "inline", shown && "show", className)}
      role={inline ? "group" : "dialog"}
      aria-labelledby={titleId}
      data-celebration={ev.kind}
      onMouseEnter={pause}
      onMouseLeave={arm}
      onFocus={pause}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) arm();
      }}
    >
      <div className="sc-top">
        <Medallion material={f.material ?? "bronze"} numeral={face.glyph ?? num} className={face.glyph ? "glyph" : undefined} />
        <div className="sc-t">
          <div className="t-eyebrow">{f.eyebrow}</div>
          <h3 id={titleId}>{f.title}</h3>
        </div>
      </div>
      {lines.length + amounts.length > 0 && (
        <ul className="facts">
          {lines.map((l, i) => (
            <li key={`l${i}`}>{l}</li>
          ))}
          {amounts.map((a, i) => (
            <li key={`a${i}`}>
              <Amount kind={a.kind} value={a.value} label={a.label} />
            </li>
          ))}
        </ul>
      )}
      <WhatMoved rows={ev.what} />
      {!inline && (
        <div className="acts">
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
