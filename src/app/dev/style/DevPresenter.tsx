"use client";

/**
 * The /dev/style FALLBACK presenter: plays queued T2/T3 events only while no
 * primary presenter (L3's CelebrationHost) is registered, so the playground
 * works before L3 lands. It is a reference sketch of the Seal card and the
 * Ascension curtain (redesign.md › Rewards), not the product component.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { pushEscapeLayer } from "@/components/capture/layers";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Crest, Medallion } from "@/components/ui/Crest";
import { burst, center, motionLevel, play, roll } from "@/lib/motion";
import { registerPresenter } from "@/lib/celebrate";
import type { CelebrationEvent } from "@/lib/celebration-types";

interface Showing {
  ev: CelebrationEvent;
  done: () => void;
}

export function DevPresenter() {
  const [showing, setShowing] = useState<Showing | null>(null);
  useEffect(() => registerPresenter((ev, done) => setShowing({ ev, done }), { fallback: true }), []);
  if (!showing || typeof document === "undefined") return null;
  const finish = () => {
    const d = showing.done;
    setShowing(null);
    d();
  };
  return createPortal(
    showing.ev.tier === 3 ? <DevCurtain ev={showing.ev} onDone={finish} /> : <DevSeal ev={showing.ev} onDone={finish} />,
    document.body
  );
}

function DevSeal({ ev, onDone }: { ev: CelebrationEvent; onDone: () => void }) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  const f = ev.facts;
  const material = f.material ?? "bronze";

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const card = cardRef.current;
    const rim = card?.querySelector(".medal .rim") ?? null;
    void play(rim, [{ strokeDasharray: "100", strokeDashoffset: 100 }, { strokeDasharray: "100", strokeDashoffset: 0 }], { duration: 520, flourish: true });
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
    let hold = window.setTimeout(onDone, 9000);
    const pause = () => window.clearTimeout(hold);
    const resume = () => {
      window.clearTimeout(hold);
      hold = window.setTimeout(onDone, 9000);
    };
    card?.addEventListener("mouseenter", pause);
    card?.addEventListener("mouseleave", resume);
    card?.addEventListener("focusin", pause);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      window.clearTimeout(hold);
      card?.removeEventListener("mouseenter", pause);
      card?.removeEventListener("mouseleave", resume);
      card?.removeEventListener("focusin", pause);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.id]);

  return (
    <div className="dock" style={{ zIndex: "calc(var(--z-toast) + 1)" }}>
      <div ref={cardRef} className={`seal-card sweep${shown ? " show" : ""}`} role="dialog" aria-label={f.title}>
        <div className="sc-top">
          <Medallion material={material} numeral={f.numeral ? (f.numeral.from ?? f.numeral.to) : null} />
          <div className="sc-t">
            <div className="t-eyebrow">{f.eyebrow}</div>
            <h3>{f.title}</h3>
          </div>
        </div>
        {(f.lines?.length || f.amounts?.length) && (
          <ul className="facts">
            {f.lines?.map((l) => <li key={l}>{l}</li>)}
            {f.amounts?.map((a) => (
              <li key={a.kind}>
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
        <div className="acts">
          <Button variant="primary" onClick={onDone} autoFocus>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

function DevCurtain({ ev, onDone }: { ev: CelebrationEvent; onDone: () => void }) {
  const f = ev.facts;
  const innerRef = useRef<HTMLDivElement | null>(null);
  const artRef = useRef<HTMLDivElement | null>(null);
  const [settled, setSettled] = useState(motionLevel() === "still");
  const settledRef = useRef(settled);

  useEffect(() => {
    settledRef.current = settled;
  }, [settled]);

  useEffect(() => {
    const opener = document.activeElement;
    innerRef.current?.focus({ preventScroll: true });
    document.body.style.overflow = "hidden";
    const pop = pushEscapeLayer(() => (settledRef.current ? onDone() : setSettled(true)));
    const art = artRef.current;
    void play(art, [{ transform: "scale(.6)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 600, delay: 200 });
    const t = window.setTimeout(() => {
      if (art) {
        const [x, y] = center(art);
        burst(x, y, 26, ev.id, { color: "var(--gold-a)", spread: 150 });
      }
    }, 1000);
    const s = window.setTimeout(() => setSettled(true), 1900);
    return () => {
      pop();
      window.clearTimeout(t);
      window.clearTimeout(s);
      document.body.style.overflow = "";
      if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.id]);

  return (
    <div className="curtain theme-night" role="dialog" aria-modal="true" aria-label={`${f.kicker ?? f.eyebrow}: ${f.title}`}>
      <div className="skyband" aria-hidden="true" />
      <div className="rays" aria-hidden="true" />
      <Button variant="quiet" className="cur-skip" onClick={() => (settled ? onDone() : setSettled(true))}>
        {settled ? "Close" : "Skip"}
      </Button>
      <div className="cur-in" tabIndex={-1} ref={innerRef}>
        <div className="cur-art" ref={artRef}>
          {f.art?.type === "crest" ? (
            <Crest level={f.art.level} material={f.art.material} size={168} />
          ) : (
            <Medallion material={f.material ?? "gold"} numeral={f.numeral?.to ?? null} size={168} />
          )}
        </div>
        <div className="cur-kick">{f.kicker ?? f.eyebrow}</div>
        <h2>{f.title}</h2>
        {f.epithet && <div className="t-epithet">{f.epithet}</div>}
        {f.lore && <p className="cur-lore">{f.lore}</p>}
        {f.grants && f.grants.length > 0 && (
          <ul className="grants">
            {f.grants.map((g) => (
              <li key={g}>
                <span>{g}</span>
              </li>
            ))}
          </ul>
        )}
        {f.cost && <p className="cur-cost">{f.cost}</p>}
        {f.cause && <p className="cur-cost">{f.cause}</p>}
        <div className="cur-acts">
          <Button variant="gold" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
