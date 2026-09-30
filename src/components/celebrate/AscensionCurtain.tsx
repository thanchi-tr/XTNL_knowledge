"use client";

/**
 * L3-celebrate — the Ascension (Tier 3): a full-screen opaque night curtain
 * (.theme-night in both themes, aria-modal) for a title, a band re-forge, an
 * emblem unlock, a Long goal or the first Ultimate.
 *
 *   Skip from frame 1 (tap, Escape or the button): the first skip jumps to the
 *   final tableau and the button becomes Close; the second closes.
 *   Art and backdrop come from the caller (stage/present); otherwise the art is
 *   drawn from facts.art (crest, medallion, or the emblem from its code).
 *   Text: kicker in the material colour, display-xl title, epithet, lore, grant
 *   cards, the cost line and the cause line; a gold primary plus quiet Done.
 *   Still: the final tableau at once, identical words. Calm: fades only.
 *   Full: art flies from the tapped node 640 ms, rims draw 760, notches or
 *   crest edges pop at 32 ms each, then at 1.0 s the flash, one shockwave
 *   ring and 26 seeded motes; rays turn at 90 s per revolution; text rises at
 *   an 80 ms stagger from 1.15 s; settled by 1.9 s.
 *   Focus: a tabindex=-1 container takes it (no ring), Tab is trapped, and it
 *   returns to the opener on close.
 */
import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { pushEscapeLayer, trapTab } from "@/components/capture/layers";
import { Button } from "@/components/ui/Button";
import { Crest, Medallion } from "@/components/ui/Crest";
import type { CelebrationEvent } from "@/lib/celebration-types";
import { MATERIAL_STOPS, type Material } from "@/lib/materials";
import { EASE, burst, center, motionLevel, play } from "@/lib/motion";
import type { CurtainAction } from "./stage";
import { WhatMoved } from "./WhatMoved";

const EmblemArt = dynamic(() => import("./EmblemArt"), { ssr: false });

/** The rays and the kicker take the band's light stop. */
function rayOf(m: Material): string {
  const hex = MATERIAL_STOPS[m][0].replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},.12)`;
}

export function defaultPrimary(ev: Pick<CelebrationEvent, "kind">): CurtainAction | null {
  switch (ev.kind) {
    case "emblem-unlock":
    case "first-ultimate":
      return { label: "Equip now", href: "/you/loadout" };
    case "title":
    case "band":
    case "goal-long":
      return { label: "See your sheet", href: "/you" };
    default:
      return null;
  }
}

/** The curtain's art when the caller staged none. */
export function CurtainArt({ ev, size = 168 }: { ev: CelebrationEvent; size?: number }) {
  const art = ev.facts.art;
  if (art?.type === "crest") return <Crest level={art.level} material={art.material} size={size} />;
  if (art?.type === "emblem") return <EmblemArt code={art.code} size={size} />;
  if (art?.type === "medallion") return <Medallion material={art.material} numeral={art.numeral} size={size} />;
  return <Medallion material={ev.facts.material ?? "gold"} numeral={ev.facts.numeral?.to ?? null} size={size} />;
}

export interface AscensionCurtainProps {
  ev: CelebrationEvent;
  art?: ReactNode;
  backdrop?: ReactNode;
  sky?: string;
  fromEl?: Element | null;
  primary?: CurtainAction | null;
  onDone: () => void;
}

export function AscensionCurtain({ ev, art, backdrop, sky, fromEl, primary, onDone }: AscensionCurtainProps) {
  const f = ev.facts;
  const material: Material = f.material ?? "gold";
  const action = primary === undefined ? defaultPrimary(ev) : primary;
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const artRef = useRef<HTMLDivElement | null>(null);
  const [settled, setSettled] = useState(false);
  // Client-only (portalled after mount), so the level is known at first render.
  const [full] = useState(() => motionLevel() === "full");
  const settledRef = useRef(false);
  const closedRef = useRef(false);
  const armedRef = useRef(false);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  /** Jump to the final tableau: every running animation finishes, the motes go. */
  const finalize = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    rootRef.current?.getAnimations({ subtree: true }).forEach((a) => {
      try {
        a.finish(); // the rays' 90 s loop is infinite and refuses: it keeps turning, as designed
      } catch {
        /* infinite */
      }
    });
    document.querySelectorAll(".fx > .fx-mote").forEach((n) => n.remove());
    setSettled(true);
    window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>(".cur-acts .btn")?.focus({ preventScroll: true }), 0);
  };
  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    onDoneRef.current();
  };
  const handlers = useRef({ finalize, close });
  useEffect(() => {
    handlers.current = { finalize, close };
  });

  useEffect(() => {
    const root = rootRef.current;
    const inner = innerRef.current;
    const artEl = artRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inner?.focus({ preventScroll: true });
    const pop = pushEscapeLayer(() => (settledRef.current ? handlers.current.close() : handlers.current.finalize()));
    const timers: number[] = [window.setTimeout(() => (armedRef.current = true), 220)];
    const level = motionLevel();
    const texts = inner ? Array.from(inner.children).filter((c) => !c.classList.contains("cur-art")) : [];

    if (level === "still") {
      handlers.current.finalize();
    } else {
      void play(root, [{ opacity: 0 }, { opacity: 1 }], { duration: 320 });
      if (level === "calm") {
        void play(artEl, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 120 });
        texts.forEach((el) => void play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 200 }));
        timers.push(window.setTimeout(() => handlers.current.finalize(), 900));
      } else {
        if (fromEl && fromEl.isConnected && artEl) {
          const a = fromEl.getBoundingClientRect();
          const b = artEl.getBoundingClientRect();
          const dx = a.left + a.width / 2 - (b.left + b.width / 2);
          const dy = a.top + a.height / 2 - (b.top + b.height / 2);
          const s = Math.max(0.2, a.width / Math.max(1, b.width));
          void play(artEl, [{ transform: `translate(${dx}px,${dy}px) scale(${s})` }, { transform: "none" }], { duration: 640, delay: 200, easing: EASE.inout, flourish: true });
        } else {
          void play(artEl, [{ transform: "scale(.6)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 600, delay: 200 });
        }
        artEl?.querySelectorAll(".rim, .poly").forEach(
          (r) => void play(r, [{ strokeDasharray: "100", strokeDashoffset: 100 }, { strokeDasharray: "100", strokeDashoffset: 0 }], { duration: 760, delay: 480, flourish: true })
        );
        artEl?.querySelectorAll(".spoke").forEach((r, i) => void play(r, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 820 + i * 40 }));
        artEl?.querySelectorAll(".notch, .edge").forEach(
          (n, i) => void play(n, [{ opacity: 0, transform: "scale(0)" }, { opacity: 1, transform: "none" }], { duration: 240, delay: 900 + i * 32, easing: EASE.stamp })
        );
        void play(root?.querySelector(".rays"), [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { duration: 2000 });
        void play(root?.querySelector(".flash"), [{ opacity: 0 }, { opacity: 0, offset: 0.01 }, { opacity: 0.9, offset: 0.15 }, { opacity: 0 }], { duration: 900, delay: 1000, flourish: true });
        timers.push(
          window.setTimeout(() => {
            if (settledRef.current || !artEl) return;
            const [x, y] = center(artEl);
            const wave = root?.querySelector<HTMLElement>(".wave");
            if (wave) {
              wave.style.top = `${y - 160}px`;
              void play(wave, [{ transform: "scale(.12)", opacity: 0.9 }, { transform: "scale(1.5)", opacity: 0 }], { duration: 900, flourish: true });
            }
            burst(x, y, 26, ev.id, { color: "var(--gold-a)", spread: 150 });
          }, 1000)
        );
        texts.forEach((el, i) => void play(el, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 1150 + i * 80 }));
        timers.push(window.setTimeout(() => handlers.current.finalize(), 1900));
      }
    }
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      pop();
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.id]);

  const grants = f.grants ?? [];
  const style = {
    "--ray": rayOf(material),
    "--cur-kick": `var(--${material}-a)`,
    ...(sky ? { "--sky": sky } : {}),
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={`curtain theme-night${settled ? " final" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-celebration={ev.kind}
      style={style}
      onKeyDown={(e) => trapTab(e, rootRef.current)}
      onPointerDown={(e) => {
        if (armedRef.current && !settledRef.current && !(e.target as Element).closest("button, a")) finalize();
      }}
    >
      <div className="skyband" aria-hidden="true" />
      {backdrop && (
        <div className="cur-backdrop" aria-hidden="true">
          {backdrop}
        </div>
      )}
      <div className="rays" aria-hidden="true" />
      {full && <div className="flash" aria-hidden="true" />}
      {full && <div className="wave" aria-hidden="true" />}
      <Button variant="quiet" className="cur-skip" onClick={() => (settled ? close() : finalize())}>
        {settled ? "Close" : "Skip"}
      </Button>
      <div className="cur-in" tabIndex={-1} ref={innerRef}>
        <div className="cur-art" ref={artRef}>
          {art ?? <CurtainArt ev={ev} />}
        </div>
        <div className="cur-kick">{f.kicker ?? f.eyebrow}</div>
        <h2 id={titleId}>{f.title}</h2>
        {f.epithet && <div className="t-epithet">{f.epithet}</div>}
        {f.lore && <p className="cur-lore">{f.lore}</p>}
        {grants.length > 0 && (
          <ul className="grants">
            {grants.map((g, i) => (
              <li key={i}>
                <span>{g}</span>
              </li>
            ))}
          </ul>
        )}
        {f.cost && <p className="cur-cost">{f.cost}</p>}
        {f.cause && <p className="cur-cost">{f.cause}</p>}
        {/* The why is the cause line or the grant cards; only a moment with neither shows its What-moved rows. */}
        {!f.cause && grants.length === 0 && <WhatMoved rows={ev.what} className="cur-what" />}
        <div className="cur-acts">
          {action &&
            (action.href ? (
              <Button variant="gold" href={action.href} onClick={() => close()}>
                {action.label}
              </Button>
            ) : (
              <Button
                variant="gold"
                onClick={() => {
                  close();
                  action.onClick?.();
                }}
              >
                {action.label}
              </Button>
            ))}
          <Button variant="quiet" onClick={close}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
