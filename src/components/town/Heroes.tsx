"use client";

import {
  CAPSTONE_FROM, HERO_BLURB, HERO_MAX, HERO_NAME, POINT_AT, RAISED, RAISE_COST, RAISE_JEWELS, RESPEC_COST, TREES,
  heroCap, heroClassOf, heroLevelOf, heroXpToNext, learnBlock, learnSkill, pointsOf, raiseBlock, raiseHero, raisedHeroes, respec, spentOf,
  type HeroClass,
} from "@/lib/town/sim/heroes";
import { SOLDIER_MAX, roleLabel } from "@/lib/town/sim/catalog";
import { costText } from "@/lib/town/sim/world";
import type { GameState, Villager } from "@/lib/town/sim/types";
import { GROUPS } from "@/lib/town/sim/attributes";
import { AttrChip, GiftBadge } from "./People";

type Run = (fn: () => string | null) => void;
const pct = (x: number) => `${Math.round(Math.max(0, Math.min(1, x)) * 100)}%`;

/** One hero: level, experience, points, and the tree. */
function HeroCard({ s, v, run }: { s: GameState; v: Villager; run: Run }) {
  const cls = heroClassOf(v)!;
  const tree = TREES[cls];
  const lvl = heroLevelOf(v);
  const points = pointsOf(v);
  const spent = spentOf(v);
  const have = v.hero?.skills ?? [];
  const raised = RAISED.includes(cls);
  const next = POINT_AT.find((l) => l > lvl);
  return (
    <div className={`tg-hero c-${cls}`}>
      <div className="tg-hero-head">
        <div>
          <b>{v.name}</b> <GiftBadge v={v} /> <span className="town-dim">— {HERO_NAME[cls]} {lvl}{lvl >= HERO_MAX ? " (the height)" : ""}</span>
          <p className="town-dim">{roleLabel(v.role, v.rank)} · health {Math.round(v.health)}</p>
        </div>
        <span className={`tg-hero-pts ${spent < points ? "free" : ""}`} title="Skill points spent of those earned">{spent}/{points}</span>
      </div>
      <div className="tg-hero-attrs">{(cls === "wizard" ? GROUPS.arcane : GROUPS.war).map((k) => <AttrChip key={k} v={v} k={k} />)}</div>
      {raised && lvl < HERO_MAX && (
        <div className="tg-hero-xp" title={`${Math.floor(v.hero?.xp ?? 0)} of ${heroXpToNext(lvl)} to level ${lvl + 1} — only battle teaches`}>
          <i style={{ width: pct((v.hero?.xp ?? 0) / heroXpToNext(lvl)) }} />
        </div>
      )}
      <p className="town-dim tg-hero-next">
        {spent < points ? "A skill to choose." : next ? `Next skill at hero level ${next}.` : "Every skill point is spent."}
        {!raised && (cls === "knight" ? " A knight's hero level follows rank: a level every four ranks past 22." : " A wizard's hero level follows rank: a level every sixteen ranks past 14.")}
      </p>
      <div className="tg-tree">
        {tree.branches.map((b, bi) => (
          <div key={b} className="tg-branch">
            <p className="tg-branch-name">{b}</p>
            {tree.skills.filter((k) => k.branch === bi).sort((a, c) => a.tier - c.tier).map((k) => {
              const owned = have.includes(k.id);
              const why = owned ? null : learnBlock(v, k.id);
              return (
                <button
                  key={k.id}
                  className={`tg-skill t${k.tier} ${owned ? "owned" : why ? "locked" : "ready"}`}
                  disabled={owned || !!why}
                  title={`${k.name}${k.tier === 3 ? ` — capstone (hero level ${CAPSTONE_FROM}, one to a hero)` : ""}: ${k.blurb}${why && !owned ? `\n${why}` : ""}`}
                  onClick={() => run(() => learnSkill(s, v.id, k.id))}
                >
                  <b>{k.name}</b>
                  <span>{k.blurb}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {have.length > 0 && (
        <button className="town-btn ghost sm" style={{ marginTop: 6 }} onClick={() => run(() => respec(s, v.id))}>Unlearn all · {costText(RESPEC_COST)}</button>
      )}
    </div>
  );
}

/**
 * The town's heroes (lib/town/sim/heroes): each with the tree of what they
 * can become, and the soldiers at the top of their ladder who could be
 * raised. Heroes are few by design — one, and one more for every five levels
 * of the hall — slow to level, and gone for good if they fall.
 */
export function HeroesPanel({ s, run }: { s: GameState; run: Run }) {
  const heroes = s.villagers.filter((v) => heroClassOf(v));
  const ready = s.villagers.filter((v) => ["infantry", "archer", "heavy"].includes(v.role) && v.rank >= SOLDIER_MAX && !(v.hero && RAISED.includes(v.hero.cls)));
  const hall = s.structures.find((b) => b.type === "townhall");
  return (
    <div className="tg-heroes">
      <p className="town-kicker" style={{ marginTop: 4 }}>Heroes</p>
      <p className="town-dim">
        Raised heroes: {raisedHeroes(s)} of {heroCap(hall?.level ?? 1)} the hall allows. A hero is raised from a soldier at level {SOLDIER_MAX} for {costText(RAISE_COST)} and {RAISE_JEWELS} monster jewels,
        learns only in battle, and does not come back if they fall.
      </p>
      {heroes.length === 0 && ready.length === 0 && (
        <p className="town-sub">No heroes yet. Soldiers rise by battle to level {SOLDIER_MAX}; knights past 22 and wizards past 15 are heroes of their own ladders.</p>
      )}
      {heroes.map((v) => <HeroCard key={v.id} s={s} v={v} run={run} />)}
      {ready.length > 0 && (
        <div className="tg-raise">
          <p className="town-kicker">Ready to be raised</p>
          {ready.map((v) => (
            <div key={v.id} className="tg-raise-row">
              <span>{v.name} <span className="town-dim">— {roleLabel(v.role, v.rank)}</span></span>
              <span className="tg-raise-btns">
                {(RAISED as HeroClass[]).map((cls) => {
                  const why = raiseBlock(s, v, cls);
                  return (
                    <button key={cls} className="town-btn sm" disabled={!!why} title={why ?? HERO_BLURB[cls]} onClick={() => run(() => raiseHero(s, v.id, cls))}>
                      {HERO_NAME[cls]}
                    </button>
                  );
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
