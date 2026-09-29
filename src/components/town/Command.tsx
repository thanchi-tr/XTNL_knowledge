"use client";

import { group, orderHold, orderReturn, orderStop, setGroup, units } from "@/lib/town/sim/command";
import type { GameState } from "@/lib/town/sim/types";

/**
 * The command bar (lib/town/sim/command): who is selected, what they can be
 * told, and the control groups. Every button has its key, shown on it, for
 * the players who will never click it.
 */

const GLYPH: Record<string, string> = {
  infantry: "⚔", footman: "⚔", heavy: "⛨", archer: "➶", crossbow: "➶", knight: "♞", wizard: "✦", battalion: "⚔", militia: "⚒", captain: "♜",
};

export function CommandBar({
  s, sel, setSel, run, amove, onAmove,
}: {
  s: GameState;
  sel: number[];
  setSel: (ids: number[]) => void;
  run: (fn: () => string | null) => void;
  amove: boolean;
  onAmove: () => void;
}) {
  const all = units(s);
  const chosen = all.filter((u) => sel.includes(u.id));
  const kinds = new Map<string, number>();
  for (const u of chosen) kinds.set(u.kind, (kinds.get(u.kind) ?? 0) + 1);
  const fighting = s.raid?.phase === "fighting";
  const none = !chosen.length;
  return (
    <div className="tg-command" aria-label="Command">
      <div className="tg-cmd-row">
        <b>{none ? "No troops selected" : `${chosen.length} selected`}</b>
        <span className="town-dim">
          {none ? `${all.length} troop${all.length === 1 ? "" : "s"} under your hand` : [...kinds].map(([k, n]) => `${n} ${k}`).join(" · ")}
          {fighting ? " · in the fight" : " · between raids a move stations them in the field"}
        </span>
      </div>
      {!none && (
        <div className="tg-cmd-units">
          {chosen.slice(0, 32).map((u) => (
            <span key={u.id} className={`tg-cmd-unit ${u.inside ? "in" : ""}`} title={`${u.kind} L${u.level}${u.inside ? " · inside its post" : u.stationed ? " · stationed" : ""}`}>
              {GLYPH[u.kind] ?? "•"}
              <i style={{ width: `${Math.round((u.hp / Math.max(1, u.maxHp)) * 100)}%` }} />
            </span>
          ))}
          {chosen.length > 32 && <span className="town-dim">+{chosen.length - 32}</span>}
        </div>
      )}
      <div className="tg-cmd-btns">
        <button className={`town-btn sm ${amove ? "" : "ghost"}`} disabled={none} onClick={onAmove} title="Then click where to go: they fight whatever they meet on the way">Attack-move <kbd>A</kbd></button>
        <button className="town-btn sm ghost" disabled={none} onClick={() => run(() => orderHold(s, sel))} title="Stand fast and strike only what comes in range">Hold <kbd>H</kbd></button>
        <button className="town-btn sm ghost" disabled={none} onClick={() => run(() => orderStop(s, sel))} title="Drop the order: back to their own judgement">Stop <kbd>S</kbd></button>
        <button className="town-btn sm ghost" disabled={none} onClick={() => run(() => orderReturn(s, sel))} title="Back to the post, and give up any station">Return to post <kbd>R</kbd></button>
        <button className="town-btn sm ghost" onClick={() => setSel(all.map((u) => u.id))}>All troops <kbd>Q</kbd></button>
        <button className="town-btn sm ghost" disabled={none} onClick={() => setSel([])}>Clear <kbd>Esc</kbd></button>
      </div>
      <div className="tg-cmd-groups">
        <span className="town-dim">Groups</span>
        {[1, 2, 3, 4, 5].map((n) => {
          const ids = group(s, n);
          return (
            <span key={n} className="tg-cmd-group">
              <button className="town-btn sm ghost" disabled={!ids.length} onClick={() => setSel(ids)} title={ids.length ? `Select group ${n} (${n})` : "Empty"}>
                {n}{ids.length ? ` · ${ids.length}` : ""}
              </button>
              <button className="town-btn sm ghost" disabled={none} onClick={() => run(() => { setGroup(s, n, sel); return null; })} title={`Bind the selection to ${n} (Ctrl, Alt or Shift + ${n})`}>＋</button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
