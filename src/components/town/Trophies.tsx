"use client";

import { useEffect, useRef, useState } from "react";
import type { GameState } from "@/lib/town/sim/types";
import { achievementGroups, achievementList, type Achievement } from "@/lib/town/sim/achievements";
import { clock } from "@/lib/town/sim/state";
import { METAL_NAMES, trophy, trophyParts } from "./art/trophies";

/**
 * The trophy cabinet: five hundred achievements, each with its own trophy.
 * Earned ones stand in their metal; the rest wait as silhouettes, so the
 * cabinet shows what is still to win. Tap one for what it is and when it
 * was earned.
 */

function TrophyCanvas({ n, earned, scale = 2 }: { n: number; earned: boolean; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const art = trophy(n, earned);
    cv.width = art.width;
    cv.height = art.height;
    const c = cv.getContext("2d")!;
    c.clearRect(0, 0, cv.width, cv.height);
    c.drawImage(art, 0, 0);
    cv.style.width = `${art.width * scale}px`;
    cv.style.height = `${art.height * scale}px`;
  }, [n, earned, scale]);
  return <canvas ref={ref} className="tg-icon" aria-hidden />;
}

export function TrophyPanel({ s }: { s: GameState }) {
  const got = s.achievements ?? {};
  const [group, setGroup] = useState<string>("all");
  const [pick, setPick] = useState<Achievement | null>(null);
  const [onlyEarned, setOnlyEarned] = useState(false);
  const ACHIEVEMENTS = achievementList();
  const list = ACHIEVEMENTS.filter((a) => (group === "all" || a.group === group) && (!onlyEarned || got[a.id] !== undefined));
  const earned = Object.keys(got).length;
  return (
    <div className="tg-trophies">
      <p className="town-kicker">Trophies</p>
      <h2 className="town-title">{earned} of {ACHIEVEMENTS.length}</h2>
      <div className="tg-trophy-bar"><i style={{ width: `${(earned / ACHIEVEMENTS.length) * 100}%` }} /></div>
      <div className="town-row wrap" style={{ marginTop: 6 }}>
        <select className="town-select" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="all">Every family</option>
          {achievementGroups().map((g) => {
            const all = ACHIEVEMENTS.filter((a) => a.group === g);
            return <option key={g} value={g}>{g} — {all.filter((a) => got[a.id] !== undefined).length}/{all.length}</option>;
          })}
        </select>
        <label className="town-dim"><input type="checkbox" checked={onlyEarned} onChange={(e) => setOnlyEarned(e.target.checked)} /> earned only</label>
      </div>
      {pick && (
        <div className="tg-trophy-pick">
          <TrophyCanvas n={pick.n} earned={got[pick.id] !== undefined} scale={3} />
          <div>
            <b>{pick.name}</b>
            <span>{pick.blurb}</span>
            <span className="town-dim">
              Trophy {pick.n + 1}: a {METAL_NAMES[trophyParts(pick.n).metal]} {trophyParts(pick.n).shape} · {pick.group}
              {got[pick.id] !== undefined ? ` · earned on day ${clock(got[pick.id]).day}` : " · not yet earned"}
            </span>
          </div>
        </div>
      )}
      <div className="tg-trophy-grid">
        {list.map((a) => (
          <button key={a.id} className={`tg-trophy ${got[a.id] !== undefined ? "on" : ""} ${pick?.id === a.id ? "sel" : ""}`} title={`${a.name} — ${a.blurb}`} onClick={() => setPick(a)}>
            <TrophyCanvas n={a.n} earned={got[a.id] !== undefined} />
          </button>
        ))}
      </div>
    </div>
  );
}
