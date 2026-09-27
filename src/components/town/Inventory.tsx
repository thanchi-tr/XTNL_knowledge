"use client";

import { useEffect, useRef } from "react";
import type { GameState, ResourceKey } from "@/lib/town/sim/types";
import { HALL_GOODS, STORE_GOODS, capOf, hallCap, storeRoom, unlitBuildings } from "@/lib/town/sim/world";
import { STORE_PER_LEVEL } from "@/lib/town/sim/catalog";
import { clock } from "@/lib/town/sim/state";
import { raidForecast, trainingPace, IDEA_BOOST, type SimContext } from "@/lib/town/sim/tick";
import { icon } from "./art/icons";

/**
 * What the town holds, and where. The hall's cellar keeps only the base
 * goods, and not much of them; a storehouse keeps everything else bulky;
 * the treasury keeps coin and small precious things. The bar over the map
 * shows the three at a glance, each good with how full its room is; the
 * inventory opens the whole ledger, with what is being lost for want of room.
 */

export function IconCanvas({ id, scale = 2 }: { id: string; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const art = icon(id);
    cv.width = art.width;
    cv.height = art.height;
    const c = cv.getContext("2d")!;
    c.clearRect(0, 0, cv.width, cv.height);
    c.drawImage(art, 0, 0);
    cv.style.width = `${art.width * scale}px`;
    cv.style.height = `${art.height * scale}px`;
  }, [id, scale]);
  return <canvas ref={ref} className="tg-icon" aria-hidden />;
}

/** Display order for the treasury. */
const TREASURY: ResourceKey[] = [
  "coin", "silver", "gold", "platinum", "diamond", "mithril", "tools", "torches", "ingots", "gunpowder", "poison", "formula", "tonic", "fertiliser",
];

const NAME: Partial<Record<ResourceKey, string>> = { bogiron: "bog iron", meals: "meals", potato: "potatoes" };
const nameOf = (k: ResourceKey) => NAME[k] ?? k;

const hasStorehouse = (s: GameState) => s.structures.some((st) => st.type === "storehouse" && !st.buildUntil);
const lostOf = (s: GameState, k: ResourceKey) => s.wasted?.[k] ?? 0;

function Fill({ value, cap }: { value: number; cap: number }) {
  const f = cap > 0 && Number.isFinite(cap) ? Math.min(1, value / cap) : 0;
  return (
    <i className={`tg-fill ${f >= 0.95 ? "full" : f >= 0.8 ? "high" : ""}`} aria-hidden>
      <i style={{ width: `${Math.round(f * 100)}%` }} />
    </i>
  );
}

export function ResourceHud({ s, ctx, onSell, onOpen }: {
  s: GameState; ctx: SimContext; onSell: (k: ResourceKey) => void; onOpen: () => void;
}) {
  const clk = clock(s.time);
  const dark = clk.darkness > 0.2 ? unlitBuildings(s).length : 0;
  const pace = trainingPace(ctx.input);
  const store = hasStorehouse(s);
  const stored = STORE_GOODS.filter((k) => s.res[k] >= 1).sort((a, b) => s.res[b] - s.res[a]);
  const lostStore = STORE_GOODS.reduce((a, k) => a + lostOf(s, k), 0);
  const treasure = TREASURY.filter((k) => s.res[k] >= 1 || k === "coin").slice(0, 3);
  const chip = (k: ResourceKey) => {
    const cap = capOf(s, k);
    const full = Number.isFinite(cap) && s.res[k] >= cap - 0.5;
    return (
      <button
        key={k} role="listitem"
        className={`tg-hud-item tg-hud-good ${full || lostOf(s, k) >= 1 ? "warn" : ""}`}
        onClick={() => onSell(k)}
        title={`${nameOf(k)} — ${Math.floor(s.res[k])}${Number.isFinite(cap) ? ` of ${cap}` : ""}${lostOf(s, k) >= 1 ? " · going to waste" : ""} — click to sell 10 at the market`}
      >
        <IconCanvas id={k} />
        <b>{Math.floor(s.res[k])}</b>
        {Number.isFinite(cap) && <Fill value={s.res[k]} cap={cap} />}
      </button>
    );
  };
  return (
    <div className="tg-hud" role="list" aria-label="Resources">
      <span className="tg-hud-group" aria-label="Hall cellar">
        <span className="tg-hud-tag" title={`The hall's cellar: ${hallCap(s.structures.find((x) => x.type === "townhall")?.level ?? 1)} of each base good`}>Hall</span>
        {HALL_GOODS.map(chip)}
      </span>
      <span className="tg-hud-group" aria-label="Storehouse">
        <span className="tg-hud-tag">Store</span>
        {store ? (
          <>
            {stored.slice(0, 4).map(chip)}
            {stored.length > 4 && <button className="tg-hud-item" onClick={onOpen} title="Everything in the storehouses">+{stored.length - 4}</button>}
            {!stored.length && <span className="tg-hud-item">empty</span>}
          </>
        ) : (
          <button className={`tg-hud-item ${lostStore >= 1 ? "warn" : ""}`} onClick={onOpen} title="Without a storehouse, coal, iron, every crop but potatoes, planks and bricks cannot be kept">
            ⌂ none{lostStore >= 1 ? ` · losing ${Math.round(lostStore)}` : ""}
          </button>
        )}
      </span>
      <span className="tg-hud-group" aria-label="Treasury">
        {treasure.map(chip)}
        <button className="tg-hud-item tg-hud-open" onClick={onOpen} title="Open the inventory">▤ Inventory</button>
      </span>
      <span
        className={`tg-hud-item ${pace.slowed ? "warn" : "good"}`}
        title={pace.slowed
          ? `Training in town runs at ${Math.round(pace.factor * 100)}% until today's ${pace.due} due review${pace.due === 1 ? " is" : "s are"} done.`
          : `Reviews done. Each new idea added today adds ${Math.round(IDEA_BOOST * 100)}% to training speed.`}
      >
        {pace.slowed ? `⧗ ${Math.round(pace.factor * 100)}% · ${pace.due} due` : `✦ ${Math.round(pace.factor * 100)}%`}
      </span>
      {dark > 0 && <span className="tg-hud-item warn" title="Buildings no light reaches — a haunt will come for each">☾ {dark} unlit</span>}
      {!s.raid && (() => {
        const f = raidForecast(s);
        const top = f.monsters.slice(0, 3).map((m) => `${m.name} ${Math.round(m.pct * 100)}%`).join(", ");
        return (
          <span className={`tg-hud-item ${f.chance >= 0.5 ? "warn" : ""}`} title={`Chance of a raid at the next check, in ${Math.ceil(f.nextCheckIn / 60)}h. Most likely: ${top}. See the Raids tab.`}>
            ⚔ {Math.round(f.chance * 100)}% in {Math.ceil(f.nextCheckIn / 60)}h
          </span>
        );
      })()}
      {s.caravan && <span className="tg-hud-item good" title="A trade caravan is in town — see the Trade tab">⚖ Caravan · {Math.ceil((s.caravan.until - s.time) / 60)}h</span>}
    </div>
  );
}

function Row({ s, k, onSell }: { s: GameState; k: ResourceKey; onSell: (k: ResourceKey) => void }) {
  const cap = capOf(s, k);
  const lost = lostOf(s, k);
  return (
    <li className={lost >= 1 ? "losing" : ""}>
      <IconCanvas id={k} />
      <span className="tg-inv-name">{nameOf(k)}</span>
      <span className="tg-inv-qty">
        <b>{Math.floor(s.res[k])}</b>
        {Number.isFinite(cap) && <span className="town-dim"> / {cap}</span>}
      </span>
      {Number.isFinite(cap) ? <Fill value={s.res[k]} cap={cap} /> : <span />}
      <span className="tg-inv-note">{lost >= 1 ? `losing ~${Math.round(lost)}` : ""}</span>
      <button className="town-btn ghost sm" disabled={s.res[k] < 10} onClick={() => onSell(k)} title="Sell 10 at the market">Sell 10</button>
    </li>
  );
}

export function InventoryPanel({ s, onSell, onClose, onBuildStore }: {
  s: GameState; onSell: (k: ResourceKey) => void; onClose: () => void; onBuildStore: () => void;
}) {
  const hall = s.structures.find((x) => x.type === "townhall");
  const stores = s.structures.filter((st) => st.type === "storehouse" && !st.buildUntil);
  const room = storeRoom(s);
  const kept = STORE_GOODS.filter((k) => s.res[k] >= 1 || lostOf(s, k) >= 1);
  const empty = STORE_GOODS.filter((k) => !kept.includes(k));
  const treasure = TREASURY.filter((k) => s.res[k] >= 1);
  const lostAll = Object.values(s.wasted ?? {}).reduce((a, n) => a + (n ?? 0), 0);
  return (
    <div className="tg-inv" role="dialog" aria-label="Inventory">
      <div className="tg-inv-head">
        <h2 className="town-title">Inventory</h2>
        <button className="tg-quest-close" onClick={onClose} aria-label="Close the inventory">✕</button>
      </div>
      {lostAll >= 1 && <p className="warn-text">About {Math.round(lostAll)} goods an hour are going to waste for want of room.</p>}

      <section>
        <p className="town-kicker">Hall cellar</p>
        <p className="town-sub">
          The level {hall?.level ?? 1} hall keeps only the base goods — {hallCap(hall?.level ?? 1)} of each
          {room ? `, and the storehouses add ${room}` : ""}. Raise the hall for {30} more a level.
        </p>
        <ul className="tg-inv-list">{HALL_GOODS.map((k) => <Row key={k} s={s} k={k} onSell={onSell} />)}</ul>
      </section>

      <section>
        <p className="town-kicker">Storehouse{stores.length > 1 ? `s · ${stores.length}` : ""}</p>
        {stores.length ? (
          <p className="town-sub">Room for {room} of each good — {STORE_PER_LEVEL} a storehouse level.</p>
        ) : (
          <div className="tg-inv-none">
            <p>
              <b>No storehouse.</b> Coal, iron, every crop but potatoes, fish and meat, planks, bricks, ice, peat and salt cannot be kept:
              whatever the town makes of them is lost as it comes in.
            </p>
            <button className="town-btn sm" onClick={onBuildStore}>Build a storehouse</button>
          </div>
        )}
        {kept.length > 0 && <ul className="tg-inv-list">{kept.map((k) => <Row key={k} s={s} k={k} onSell={onSell} />)}</ul>}
        {empty.length > 0 && <p className="town-dim tg-inv-empty">None held: {empty.map(nameOf).join(", ")}.</p>}
      </section>

      <section>
        <p className="town-kicker">Treasury</p>
        <p className="town-sub">Coin, precious metals, tools and laboratory goods keep anywhere, without limit.</p>
        <ul className="tg-inv-list">{treasure.map((k) => <Row key={k} s={s} k={k} onSell={onSell} />)}</ul>
      </section>
    </div>
  );
}

