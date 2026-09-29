"use client";

import {
  MASTERY_CAP, MASTERY_STEP, STEADY, WINDFALL, WORK_OF, choosePath, masteryLevel, pathsFor, retoolCost, retooling, type PathKind,
} from "@/lib/town/sim/paths";
import type { GameState, Structure } from "@/lib/town/sim/types";
import { Spark } from "./Visuals";

/**
 * A building's path (lib/town/sim/paths): the three or four ways it can
 * specialise, what each is worth to it now, and where Mastery overtakes
 * the others — drawn, because "flat early, compound late" is a shape.
 */

const x = (n: number) => `×${n.toFixed(2)}`;

/** Each path's worth over worker levels 1–30, for its card's curve. Thrift is drawn as the share of goods it saves. */
const CURVE: Record<PathKind, number[]> = {
  steady: Array.from({ length: 30 }, () => STEADY),
  mastery: Array.from({ length: 30 }, (_, i) => MASTERY_STEP ** i),
  windfall: Array.from({ length: 30 }, () => 1 + WINDFALL),
  thrift: Array.from({ length: 30 }, () => 1.3),
};
const KIND_LABEL: Record<PathKind, string> = { steady: "Steady", mastery: "Mastery", windfall: "Windfall", thrift: "Thrift" };

/** The three lines over worker level 1–30, with today's level marked. */
function Curve({ level }: { level: number }) {
  const W = 180;
  const H = 54;
  const top = 3.6;
  const px = (L: number) => ((L - 1) / 29) * W;
  const py = (v: number) => H - ((v - 1) / (top - 1)) * (H - 4) - 2;
  const mastery = Array.from({ length: 30 }, (_, i) => `${px(i + 1).toFixed(1)},${py(MASTERY_STEP ** i).toFixed(1)}`).join(" ");
  const cross = 1 + Math.log(STEADY) / Math.log(MASTERY_STEP);
  return (
    <svg className="tg-path-curve" viewBox={`-2 -2 ${W + 4} ${H + 14}`} role="img" aria-label={`Mastery overtakes Steady at level ${Math.ceil(cross)}`}>
      <line x1={0} x2={W} y1={py(STEADY)} y2={py(STEADY)} className="steady" />
      <line x1={0} x2={W} y1={py(1 + WINDFALL)} y2={py(1 + WINDFALL)} className="windfall" />
      <polyline points={mastery} className="mastery" />
      <line x1={px(cross)} x2={px(cross)} y1={0} y2={H} className="cross" />
      <circle cx={px(Math.min(30, level))} cy={py(MASTERY_STEP ** (Math.min(30, level) - 1))} r={2.6} className="now" />
      <text x={0} y={H + 10}>L1</text>
      <text x={px(cross) - 8} y={H + 10}>L{Math.ceil(cross)}</text>
      <text x={W - 14} y={H + 10}>L30</text>
    </svg>
  );
}

export function PathPanel({ s, st, run }: { s: GameState; st: Structure; run: (fn: () => string | null) => void }) {
  if (st.buildUntil) return null;
  const paths = pathsFor(st.type);
  const L = masteryLevel(s, st);
  const worth = (k: PathKind) => (k === "steady" ? STEADY : k === "mastery" ? MASTERY_STEP ** (L - 1) : k === "windfall" ? 1 + WINDFALL : 1);
  const current = paths.find((p) => p.kind === st.path);
  const tooling = retooling(s, st);
  const hoursLeft = Math.ceil(((st.pathReady ?? 0) - s.time) / 60);
  return (
    <div className="tg-paths">
      <p className="town-kicker">
        Path{current ? ` · ${current.name}` : " · none chosen"}
        {tooling ? <span className="warn-text"> · retooling, {hoursLeft}h</span> : current && st.path !== "thrift" && st.path !== "windfall" ? ` · ${x(st.pr ?? 1)}` : ""}
        {current && (st.lucky ?? 0) > 0 ? <span className="town-dim"> · {st.lucky} windfall{st.lucky === 1 ? "" : "s"}</span> : null}
      </p>
      {!current && (
        <p className="town-dim">
          How this {WORK_OF[st.type] === "shelter" ? "home" : "building"} specialises — the first pick is free, a change {retoolCost(st)} coin and 12h.
        </p>
      )}
      <div className="tg-path-grid">
        {paths.map((p) => {
          const on = st.path === p.kind;
          return (
            <button
              key={p.kind}
              className={`tg-path ${on ? "on" : ""} k-${p.kind}`}
              aria-pressed={on}
              onClick={() => run(() => (on ? null : choosePath(s, st.id, p.kind)))}
              title={`${p.name} — ${p.blurb}${on ? "\nThe path it is on." : st.path ? `\nRetool to it: ${retoolCost(st)} coin, 12 hours.` : "\nTake this path."}`}
            >
              <span className="tg-path-top">
                <Spark pts={CURVE[p.kind]} cls={p.kind} now={p.kind === "mastery" ? Math.min(29, L - 1) : undefined} dashed={p.kind === "windfall"} />
                <span className="tg-path-val">
                  {p.kind === "thrift" ? "−30%" : p.kind === "windfall" ? `≈${x(worth(p.kind))}` : x(worth(p.kind))}
                  <small>{p.kind === "thrift" ? "goods used" : p.kind === "mastery" ? `L${Math.round(L)} of ${MASTERY_CAP}` : p.kind === "windfall" ? "on average" : "from the start"}</small>
                </span>
              </span>
              <b>{p.name}</b>
              <span className="tg-path-kind">{KIND_LABEL[p.kind]}</span>
              <span className="tg-path-blurb">{p.blurb}</span>
            </button>
          );
        })}
      </div>
      <Curve level={L} />
      <p className="town-dim tg-path-legend"><span className="steady">— Steady</span> <span className="windfall">— Windfall (average)</span> <span className="mastery">— Mastery</span> · the dot is this building now</p>
    </div>
  );
}
