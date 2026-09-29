"use client";

import { useState } from "react";
import type { TownInput } from "@/lib/town/rules";
import { ATTR_SHORT } from "@/lib/town/sim/attributes";
import { COURSES, type Cost } from "@/lib/town/sim/catalog";
import { recruit, schoolTrain } from "@/lib/town/sim/actions";
import { FIT_HEALTH, HEAVY_CLASSES, candidates, programmesAt, type HeavyClass, type Programme } from "@/lib/town/sim/enrol";
import {
  HERO_GATES, RANK_GATES, TRADE_KNOWLEDGE, WORK_GATES, WAR_KNOWLEDGE, knowledgeFor, learnedWits, masteryOf, nextGate, streakTalent, workCapOf, gateText,
} from "@/lib/town/sim/mastery";
import { reachOf } from "@/lib/town/sim/recognition";
import { IDEA_BOOST, trainingPace } from "@/lib/town/sim/tick";
import { computeLinks, houseReachesBarracks } from "@/lib/town/sim/world";
import { WORK_MAX } from "@/lib/town/sim/work";
import type { GameState, Structure, StructureType, Villager } from "@/lib/town/sim/types";
import { AttrChip } from "./People";
import { CostChips } from "./Visuals";

type Run = (fn: () => string | null) => void;

/**
 * A training building's programmes (lib/town/sim/enrol): the procedure step
 * by step, the bar a candidate must clear, the townsfolk who might be taken —
 * each with what they have and what stops them — and the one the building
 * would take now: the best-suited who clears the bar.
 */
export function TrainingPanel({ s, st, run, cost }: { s: GameState; st: Structure; run: Run; cost?: Cost }) {
  const progs = programmesAt(st.type);
  const [pick, setPick] = useState<string | null>(null);
  if (!progs.length) return null;
  const prog = progs.find((p) => p.id === pick) ?? progs[0];
  const school = st.type === "school";
  const links = school ? null : computeLinks(s);
  const joined = links ? (v: Villager) => {
    const home = s.structures.find((h) => h.id === v.house);
    return !!home && houseReachesBarracks(links, home, st);
  } : undefined;
  const list = candidates(s, prog, joined);
  const best = list.find((c) => c.ok);
  const shown = list.slice(0, 6);
  const course = school ? COURSES.find((c) => c.role === prog.role) : undefined;
  const bill = course?.cost ?? (prog.id === "heavy:juggernaut" && cost ? { ...cost, iron: 10 } : cost);
  const busy = !!st.training;
  const heavy = prog.id.startsWith("heavy:") ? HEAVY_CLASSES[prog.id.slice(6) as HeavyClass] : undefined;
  return (
    <div className="tg-train">
      <p className="town-kicker" style={{ marginTop: 10 }}>Training · {school ? "courses" : "who may enlist"}</p>
      {progs.length > 1 && (
        <div className="tg-train-tabs">
          {progs.map((p) => (
            <button key={p.id} className={`town-tag ${p.id === prog.id ? "" : "off"}`} onClick={() => setPick(p.id)}>{p.title}</button>
          ))}
        </div>
      )}
      <p className="tg-train-title"><b>{prog.title}</b> <span className="town-dim">{prog.blurb}</span></p>
      {heavy && (
        <p className="tg-train-mods">
          <span className="tg-attr">♥ ×{heavy.hp}</span> <span className="tg-attr">⚔ ×{heavy.dmg}</span>
          {heavy.reach ? <span className="tg-attr hi">reach +{heavy.reach}</span> : null}
          {heavy.pace !== 1 ? <span className="tg-attr lo">pace ×{heavy.pace}</span> : null}
          {heavy.vsGreat !== 1 ? <span className="tg-attr hi2">vs legendary ×{heavy.vsGreat}</span> : null}
          {heavy.atHall !== 1 ? <span className="tg-attr hi2">in the hall&apos;s circle ×{heavy.atHall}</span> : null}
        </p>
      )}
      <ol className="tg-train-steps">
        {prog.steps.map((t, i) => <li key={i}><b>{i + 1}</b><span>{t}</span></li>)}
      </ol>
      <p className="tg-train-bar">
        The bar: {prog.bars.length ? prog.bars.map((b) => <span key={b.attr} className="tg-attr hi">{ATTR_SHORT[b.attr]} {b.min}+</span>) : <span className="tg-attr">anyone</span>}
        <span className="tg-attr">♥ {FIT_HEALTH}+</span>
        {bill && <> · <CostChips s={s} cost={bill} compact /></>}
      </p>
      <ul className="tg-cands">
        {shown.map((c) => (
          <li key={c.v.id} className={c.ok ? "ok" : "no"}>
            <span className="tg-cand-mark">{c.ok ? "✓" : "✗"}</span>
            <b>{c.v.name}</b>
            {prog.bars.map((b) => <AttrChip key={b.attr} v={c.v} k={b.attr} />)}
            {!c.ok && <span className="town-dim">{c.fails.join(" · ")}</span>}
          </li>
        ))}
        {!shown.length && <li className="town-dim">No idle villager at all.</li>}
      </ul>
      <button className="town-btn sm" disabled={busy || !best} onClick={() => run(() => (school ? schoolTrain(s, st.id, prog.role) : recruit(s, st.id, prog.id)))}>
        {busy ? "Training is underway" : best ? `Enrol ${best.v.name} · ${prog.title.toLowerCase()}` : "No one clears the bar"}
      </button>
    </div>
  );
}

/** A worker at a gate: what the next levels need. */
export function GateNote({ s, v }: { s: GameState; v: Villager }) {
  const cap = workCapOf(s, v, WORK_MAX);
  const lvl = Math.max(v.level ?? 1, 1);
  if (lvl < cap || cap >= WORK_MAX) return null;
  const g = nextGate(WORK_GATES, lvl);
  return <span className="tg-gate" title={`Past level ${cap} this trade needs ${gateText(knowledgeFor(s, v), g?.depth ?? 3)} — earned in your own study`}>🔒 {cap}</span>;
}

/**
 * What the player's own study gives the town (lib/town/sim/mastery), live:
 * each real habit beside what it earns in town, and which trades its emblems
 * have opened past their gates.
 */
export function StudyBoons({ s, input }: { s: GameState; input: TownInput }) {
  const m = masteryOf(s);
  const pace = trainingPace(input);
  const k = reachOf(s);
  const trades = [...new Set(Object.values(TRADE_KNOWLEDGE))];
  const open = (depth: number, gates: readonly { from: number; depth: number }[]) => gates.filter((g) => depth >= g.depth).length;
  const warDepth = Math.max(0, ...WAR_KNOWLEDGE.map((a) => m.depth[a] ?? 0));
  const rows: { what: string; now: string; gives: string }[] = [
    { what: "Reviews done today", now: `${input.reviewsToday}${input.dueRemaining ? ` · ${input.dueRemaining} still due` : " · all due cleared"}`, gives: `Timers run up to 30% faster (${Math.min(30, input.reviewsToday)}% now); training in town at ${Math.round(pace.factor * 100)}%. With the day's due cleared: at dawn +${(3 * k).toFixed(1)}★ and +3 Hope.` },
    { what: "Ideas added today", now: String(input.newIdeasToday ?? 0), gives: `Training +${Math.round(IDEA_BOOST * 100)}% each once the reviews are done; at dawn +${(Math.min(5, input.newIdeasToday ?? 0) * k).toFixed(1)}★ for new ideas brought home.` },
    { what: "Study streak", now: `${input.streakDays} day${input.streakDays === 1 ? "" : "s"}`, gives: `Newcomers arrive gifted ${Math.round(streakTalent(s) * 100)}% more often (half a point a day, to ten).` },
    { what: "Domain level", now: `peak ${input.domainPeak}, sum ${input.domainSum}`, gives: `Every newcomer brings +${learnedWits(s)} Wits (a point per three levels); troops' training steadied.` },
    { what: "Emblems", now: input.emblems.length ? `${input.emblems.length}, deepest ${m.peak}` : "none equipped", gives: `Open the higher levels: soldiers ${open(warDepth, RANK_GATES)}/2 gates, heroes ${open(m.peak, HERO_GATES)}/2.` },
  ];
  return (
    <div className="tg-boons">
      <p className="town-kicker" style={{ marginTop: 12 }}>What your study gives the town</p>
      <table className="tg-table tg-boon-table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.what}><th>{r.what}</th><td className="tg-boon-now">{r.now}</td><td className="tg-boon-gives">{r.gives}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="town-dim" style={{ marginTop: 6 }}>
        Mastery gates: a worker climbs past level {WORK_GATES[0].from} only with an emblem of their trade&apos;s knowledge at depth {WORK_GATES[0].depth}, past {WORK_GATES[1].from} at depth {WORK_GATES[1].depth};
        a soldier past rank {RANK_GATES[0].from} with {gateText(WAR_KNOWLEDGE, RANK_GATES[0].depth)}; a hero past level {HERO_GATES[0].from} with any emblem at depth {HERO_GATES[0].depth}.
      </p>
      <ul className="tg-trades">
        {trades.map((a) => {
          const d = m.depth[a] ?? 0;
          const n = open(d, WORK_GATES);
          const types = (Object.entries(TRADE_KNOWLEDGE) as [StructureType, string][]).filter(([, x]) => x === a).map(([t]) => t);
          return (
            <li key={a} className={n === 2 ? "open" : n === 1 ? "half" : ""}>
              <b>{a.replace(/_/g, " ").toLowerCase()}</b> <span className="town-dim">{types.join(", ")}</span>
              <span className="tg-trade-gate">{n === 2 ? "all 30 levels" : n === 1 ? `to 20 · depth 6 opens the rest` : `to 10 · depth 3 opens more`}{d ? ` · your depth ${d}` : ""}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export type { Programme };
