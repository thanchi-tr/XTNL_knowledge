"use client";

import { useEffect, useRef } from "react";
import type { TownProfile } from "@/lib/town/rules";
import { CATALOG, GRADE_NAMES, grade, homeTitle, jewelCost } from "@/lib/town/sim/catalog";
import { CANCEL_MS, placeBlock, placeMinutes, upgradeBlock, upgradeMinutes } from "@/lib/town/sim/actions";
import { beds, byId } from "@/lib/town/sim/state";
import { NIGHT_SHIFT_LEVEL, hasNightShift } from "@/lib/town/sim/work";
import type { SimContext } from "@/lib/town/sim/tick";
import { Overlay, type GameState, type StructureType } from "@/lib/town/sim/types";
import { CostChips, Portrait } from "./Visuals";

/**
 * An order waiting on the player's word: a building to put up where its
 * ghost stands on the map, or one to raise a level. Nothing is paid until
 * it is confirmed.
 */
export type Pending =
  | {
    kind: "build"; type: StructureType; x: number; y: number;
    /** Shift-click: the build tool stays in hand for the next one. */
    many?: boolean;
    /** Asked from the Build here list rather than on the map. */
    here?: boolean;
    /** Where on screen it was asked (client y), so the card stands clear of the ghost. */
    at?: number;
  }
  | { kind: "upgrade"; id: number };

/** Game minutes as a player reads them: 40m, 3h 20m, 2d 4h. */
function span(min: number): string {
  const m = Math.max(1, Math.round(min));
  if (m < 60) return `${m}m`;
  if (m < 24 * 60) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h}h ${r}m` : `${h}h`;
  }
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return h ? `${d}d ${h}h` : `${d}d`;
}

const article = (name: string) => (/^[aeiou]/i.test(name) ? "an" : "a");

/**
 * Asks before anything is built or raised: what it costs against what the
 * town has, how long it takes, what it tramples or idles — and whether it
 * can go ahead at all. Live: it follows the stores while it is open, and
 * refuses to confirm the moment the order could no longer be carried out.
 *
 * A native modal <dialog>: above full screen and the quest log, the map
 * behind it inert, Esc to cancel, Enter on the focused button to confirm.
 */
export function ConfirmOrder({ s, ctx, arch, p, onConfirm, onCancel }: {
  s: GameState; ctx: SimContext; arch: TownProfile["archetype"]; p: Pending;
  onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const yes = useRef<HTMLButtonElement>(null);
  const no = useRef<HTMLButtonElement>(null);
  const opened = useRef(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    opened.current = performance.now();
    (yes.current && !yes.current.disabled ? yes.current : no.current)?.focus();
    return () => d.close();
  }, []);

  // A tap on the map opens this on pointer-up; the click that follows the
  // same tap must not land on the card or the backdrop and answer it.
  const settled = () => performance.now() - opened.current > 350;

  const st = p.kind === "upgrade" ? byId(s, p.id) : null;
  let card: React.ReactNode;
  let block: string | null;
  let verb: string;
  let place: "top" | "bottom" = "bottom";

  if (p.kind === "build") {
    const def = CATALOG[p.type];
    block = placeBlock(s, p.type, p.x, p.y);
    verb = "Build";
    let crops = 0;
    for (let y = p.y; y < p.y + def.h; y++) for (let x = p.x; x < p.x + def.w; x++) {
      if (x >= 0 && y >= 0 && x < s.map.w && y < s.map.h && s.map.overlay[y * s.map.w + x] === Overlay.Crop) crops++;
    }
    if (p.at !== undefined && typeof window !== "undefined" && p.at > window.innerHeight * 0.5) place = "top";
    card = (
      <>
        <div className="tg-confirm-head">
          <Portrait type={p.type} level={1} arch={arch} />
          <div>
            <p className="town-kicker">New building · tile {p.x}, {p.y}</p>
            <h2 className="town-title">Build {article(def.name)} {def.name.toLowerCase()}?</h2>
            <p className="town-dim">{def.blurb}</p>
          </div>
        </div>
        <dl className="tg-confirm-facts">
          <dt>Cost</dt>
          <dd><CostChips s={s} cost={def.cost} /></dd>
          <dt>Time</dt>
          <dd>about {span(placeMinutes(s, ctx, p.type))}{!hasNightShift(s) && <span className="town-dim"> · stops at night</span>}</dd>
          <dt>Plot</dt>
          <dd>{def.w} × {def.h} tiles</dd>
        </dl>
        {crops > 0 && <p className="warn-text">Tramples {crops} wild crop{crops === 1 ? "" : "s"} on the plot.</p>}
      </>
    );
  } else if (st) {
    const def = CATALOG[st.type];
    const next = st.level + 1;
    const step = grade(next) > grade(st.level);
    const home = st.type === "house" || st.type === "apartment";
    const name = home ? homeTitle(st.type, st.level) : def.name;
    const bedCount = home ? beds(s, st) : 0;
    block = upgradeBlock(s, st.id);
    verb = "Upgrade";
    card = (
      <>
        <div className="tg-confirm-head">
          <Portrait type={st.type} level={Math.min(next, def.maxLevel)} arch={arch} />
          <div>
            <p className="town-kicker">{name} · level {st.level} → {next}{home && homeTitle(st.type, next) !== name ? ` · becomes a ${homeTitle(st.type, next).toLowerCase()}` : ""}</p>
            <h2 className="town-title">Upgrade to level {next}{step ? ` — ${GRADE_NAMES[grade(next)]}` : ""}?</h2>
            {step && <p className="town-dim">A major step: rebuilt grander, with more hit points and a quarter more from everything it does.</p>}
          </div>
        </div>
        <dl className="tg-confirm-facts">
          <dt>Cost</dt>
          <dd><CostChips s={s} cost={def.upgrade(st.level)} jewels={jewelCost(next, st.type)} /></dd>
          <dt>Time</dt>
          <dd>about {span(upgradeMinutes(s, ctx, st))}{!hasNightShift(s) && <span className="town-dim"> · stops at night</span>}</dd>
          <dt>Meanwhile</dt>
          <dd>
            {home
              ? `its ${bedCount} bed${bedCount === 1 ? " is" : "s are"} out of use`
              : `it stands idle${st.workers.length ? ` — its ${st.workers.length} worker${st.workers.length === 1 ? " waits" : "s wait"}` : ""}`}
          </dd>
        </dl>
      </>
    );
  } else {
    block = "The building is gone.";
    verb = "Upgrade";
    card = <h2 className="town-title">That building is no longer standing.</h2>;
  }

  return (
    <dialog
      ref={ref}
      className={`tg-confirm ${place}`}
      aria-label={p.kind === "build" ? "Confirm the new building" : "Confirm the upgrade"}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        // The backdrop is the dialog itself; the card fills it inside.
        if (e.target === e.currentTarget && settled()) onCancel();
      }}
    >
      <div className="tg-confirm-card">
        {card}
        {block ? (
          <p className="tg-confirm-block">✗ {block}</p>
        ) : (
          <p className="town-dim tg-confirm-note">
            Nothing is paid until you confirm, and for {CANCEL_MS / 1000} seconds after it can still be called off for a full refund.
            {!hasNightShift(s) && ` A worker of level ${NIGHT_SHIFT_LEVEL} on the night shift keeps the builders going after dark.`}
          </p>
        )}
        <div className="tg-confirm-btns">
          <button ref={no} type="button" className="town-btn ghost" onClick={() => settled() && onCancel()}>Cancel</button>
          <button ref={yes} type="button" className="town-btn" disabled={!!block} onClick={() => settled() && onConfirm()}>
            {verb}
          </button>
        </div>
      </div>
    </dialog>
  );
}
