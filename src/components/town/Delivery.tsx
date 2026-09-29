"use client";

import { useEffect, useMemo, useState } from "react";
import type { TownInput } from "@/lib/town/rules";
import type { GameState, Raid } from "@/lib/town/sim/types";
import { RARITY_COLOR, itemDef, type Rarity } from "@/lib/town/sim/items";
import { lastMomentId, unseenMoments, type Moment, type MomentKind } from "@/lib/town/sim/moments";
import { reviewHref } from "@/lib/town/sim/orders";
import { goodName, pulseOf } from "@/lib/town/pulse";
import { FX_LIFE, type Fx } from "./map/render";
import { IconCanvas } from "./Inventory";

/**
 * The delivery (design M1, "Moments and juice"): what today's study has just
 * brought the town, shown whole the moment it lands.
 *
 * One card covers every cart, tithe, requisition, heirloom and star chart
 * not yet shown, framed in the colour of the best cart's tier. Every row is
 * there from the first frame and its number counts up to the amount already
 * paid; nothing is revealed late, spun or left to chance, because nothing
 * was. Any key or click puts it away.
 *
 * Also here: the watcher the town's loop runs four times a second, which
 * turns what just happened into numbers over the map (./map/render Fx) and
 * says when a delivery is waiting.
 */

/** The moments a delivery shows: what study brought. Waves have their own toast; peril and the audit are the Run's own. */
export const DELIVERY_KINDS: ReadonlySet<MomentKind> = new Set<MomentKind>(["cart", "tithe", "req", "heirloom", "chart"]);

/** A cart tier's frame, in the items' rarity colours. */
const TIER_RARITY: Rarity[] = ["common", "rare", "special", "legendary", "mythic"];
const tierColor = (tier: number) => RARITY_COLOR[TIER_RARITY[Math.max(0, Math.min(TIER_RARITY.length - 1, tier))]];

/** How long the numbers take to count up to what was paid. */
const COUNT_MS = 800;

/** The icon for a goods key: a tool of any material shows the tools icon. */
const iconOf = (key: string) => (key.startsWith("tool:") ? "tools" : key);

const entries = (g: Record<string, number> | undefined) => Object.entries(g ?? {}).filter(([, n]) => n > 0);

/** Goods summed over several moments. */
function sum(ms: Moment[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of ms) for (const [k, n] of entries(m.goods)) out[k] = (out[k] ?? 0) + n;
  return out;
}

const lessMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** 0 to 1 over COUNT_MS from when the card opens, eased; at once for a player who has asked for less motion. */
function useCountUp(): number {
  const [f, setF] = useState(() => (lessMotion() ? 1 : 0));
  useEffect(() => {
    if (lessMotion()) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / COUNT_MS);
      setF(k);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  return 1 - (1 - f) ** 3;
}

function Rows({ goods, k }: { goods: Record<string, number>; k: number }) {
  return (
    <ul className="tg-dl-rows">
      {entries(goods).map(([key, n]) => (
        <li key={key}>
          <IconCanvas id={iconOf(key)} />
          <b>{Math.round(n * k)}</b>
          <span>{goodName(key, n)}</span>
        </li>
      ))}
    </ul>
  );
}

/** "164 wood, 123 stone", each number counted up. */
const counted = (goods: Record<string, number>, k: number) => entries(goods).map(([key, n]) => `${Math.round(n * k)} ${goodName(key, n)}`).join(", ");

/** The Field to clear next, with the cart it would bring: the richest first, and of those the nearest to done. */
function nextCart(s: GameState, input: TownInput) {
  if (!input.day) return null;
  const c = pulseOf(s, input, 0).carts.filter((x) => !x.done && x.due > 0).sort((a, b) => b.tier - a.tier || a.due - b.due)[0];
  return c ? { href: reviewHref(c.fieldId), text: `${c.field}: ${c.due} due · its cart is ${c.rarity} (${c.streak}-day streak)` } : null;
}

export function Delivery({ s, input, moments, onClose }: { s: GameState; input: TownInput; moments: Moment[]; onClose: () => void }) {
  const k = useCountUp();
  const hook = useMemo(() => nextCart(s, input), [s, input]);

  // Any key or click puts it away; the key goes no further, so it does not also act on the town. A click
  // already under way when the card opened, or a key held down from before, does not count.
  useEffect(() => {
    const opened = performance.now();
    const fresh = () => performance.now() - opened > 250;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !fresh()) return;
      e.stopPropagation();
      onClose();
    };
    const onClick = () => {
      if (fresh()) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("click", onClick, true);
    };
  }, [onClose]);

  const carts = moments.filter((m) => m.kind === "cart").sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0));
  const tithes = moments.filter((m) => m.kind === "tithe");
  const reqs = moments.filter((m) => m.kind === "req");
  const charts = moments.filter((m) => m.kind === "chart");
  const heirlooms = moments.filter((m) => m.kind === "heirloom");
  const color = carts.length ? tierColor(carts[0].tier ?? 0) : heirlooms.length ? RARITY_COLOR.legendary : RARITY_COLOR.common;
  const passes = tithes.reduce((a, m) => a + (parseInt(m.title, 10) || 0), 0);
  const title = carts[0]?.title ?? (heirlooms.length ? `${heirlooms.length === 1 ? "An heirloom" : `${heirlooms.length} heirlooms`} for the town` : reqs.length ? "Requisition filled" : tithes.length ? `${passes} right answer${passes === 1 ? "" : "s"} came in` : (charts[0]?.title ?? "Delivered"));

  return (
    <div className="tg-delivery" role="dialog" aria-label={`Delivery: ${title}`} style={{ borderColor: color, boxShadow: `0 0 0 2px #000, 0 0 28px ${color}66` }}>
      <p className="town-kicker" style={{ color }}>Delivered to the town</p>
      <h2 className="town-title">{title}</h2>
      {carts.map((m, i) => (
        <section key={m.id} className="tg-dl-cart">
          {i > 0 && <h3 style={{ color: tierColor(m.tier ?? 0) }}>{m.title}</h3>}
          <Rows goods={m.goods ?? {}} k={k} />
        </section>
      ))}
      {tithes.length > 0 && (carts.length
        ? <p className="tg-dl-line"><b>{passes} right answer{passes === 1 ? "" : "s"}</b> → {counted(sum(tithes), k)}</p>
        : <Rows goods={sum(tithes)} k={k} />)}
      {reqs.map((m) => (
        <p key={m.id} className="tg-dl-line tg-dl-req">
          <span className="tg-stamp">Filled</span> {m.title.replace(/^Requisition filled: /, "")} → {counted(m.goods ?? {}, k)}
        </p>
      ))}
      {charts.map((m) => (
        <p key={m.id} className="tg-dl-line">✦ {m.title} → {counted(m.goods ?? {}, k)}</p>
      ))}
      {heirlooms.map((m) => {
        const id = Object.keys(m.goods ?? {})[0];
        return (
          <div key={m.id} className="tg-dl-heirloom" style={{ borderColor: RARITY_COLOR.legendary }}>
            {id && <IconCanvas id={id} scale={6} />}
            <b style={{ color: RARITY_COLOR.legendary }}>{itemDef(id ?? "")?.name ?? m.title}</b>
            <span>{m.lines.join(" ")}</span>
          </div>
        );
      })}
      {hook && (
        <p className="tg-dl-hook">
          {hook.text} · <a href={hook.href}>Review it →</a>
        </p>
      )}
      <p className="town-dim tg-dl-close">Any key or click to close</p>
    </div>
  );
}

// ── The watcher ────────────────────────────────────────────

/** Numbers over the map at once, at most: more would be noise, and each costs a copy per frame. */
export const FX_MAX = 40;

/** What the watcher has already turned into fx, for one town. */
export interface MomentWatch {
  s: GameState | null;
  /** The newest moment already looked at. */
  last: number;
  /** Buildings under construction or upgrade, by id: those that finish next rise their level. */
  building: Set<number>;
  /** The raid being watched for kills, kept a moment past its end for the last ones. */
  raid: Raid | null;
  paid: Set<number>;
}

export const newWatch = (): MomentWatch => ({ s: null, last: 0, building: new Set(), raid: null, paid: new Set() });

const isDead = (c: Raid["combatants"][number]) => !!(c as { dead?: boolean }).dead && !(c as { faded?: boolean }).faded;

function addFx(fx: Fx[], f: Fx) {
  fx.push(f);
  if (fx.length > FX_MAX) fx.splice(0, fx.length - FX_MAX);
}

/**
 * Four times a second from the town's loop: tithes rise over the hall as
 * '+164' and the good's icon, a finished building rises its level, each kill
 * its purse. Returns the waves broken since the last look (for their toast
 * and sound) and whether a delivery is waiting. Reads the town; changes only
 * `w` and `fx`.
 */
export function watchMoments(s: GameState, w: MomentWatch, fx: Fx[], now: number): { waves: Moment[]; deliver: boolean } {
  // Spent fx go; a new town starts the watch afresh, with nothing it did before replayed.
  for (let i = fx.length - 1; i >= 0; i--) if (now - fx[i].t0 > FX_LIFE) fx.splice(i, 1);
  if (w.s !== s) {
    w.s = s;
    w.last = lastMomentId(s);
    w.building = new Set(s.structures.filter((st) => st.buildUntil).map((st) => st.id));
    w.raid = s.raid;
    w.paid = new Set((s.raid?.combatants ?? []).filter(isDead).map((c) => c.id));
    return { waves: [], deliver: unseenMoments(s, DELIVERY_KINDS).length > 0 };
  }

  const fresh = (s.moments ?? []).filter((m) => m.id > w.last);
  if (fresh.length) w.last = fresh[fresh.length - 1].id;
  const hall = s.structures.find((st) => st.type === "townhall");
  for (const m of fresh) {
    if (m.kind !== "tithe" || !hall) continue;
    // The three largest goods, stacked over the hall.
    entries(m.goods).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([key, n], i) => {
      addFx(fx, { x: hall.x + hall.w / 2, y: hall.y - i, text: `+${n}`, icon: iconOf(key), tone: "goods", t0: now });
    });
  }

  const building = new Set<number>();
  for (const st of s.structures) {
    if (st.buildUntil) building.add(st.id);
    else if (w.building.has(st.id)) addFx(fx, { x: st.x + st.w / 2, y: st.y, text: `L${st.level}`, tone: "level", t0: now });
  }
  w.building = building;

  // Kills pay their purse where they fall; the raid that just ended is read once more for its last.
  const coins = (r: Raid) => {
    for (const c of r.combatants) {
      if (c.side !== "monster" || w.paid.has(c.id) || !isDead(c)) continue;
      w.paid.add(c.id);
      addFx(fx, { x: c.x, y: c.y - 0.5, text: `+${c.level * 4}`, icon: "coin", tone: "coin", t0: now });
    }
  };
  if (w.raid && w.raid !== s.raid) {
    coins(w.raid);
    w.raid = null;
  }
  if (s.raid && s.raid !== w.raid) {
    w.raid = s.raid;
    w.paid = new Set();
  }
  if (w.raid) coins(w.raid);

  return { waves: fresh.filter((m) => m.kind === "wave" && !m.seen), deliver: unseenMoments(s, DELIVERY_KINDS).length > 0 };
}
