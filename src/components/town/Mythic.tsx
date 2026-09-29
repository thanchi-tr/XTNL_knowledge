"use client";

import { useState } from "react";
import type { GameState, Structure, Villager } from "@/lib/town/sim/types";
import type { TownInput } from "@/lib/town/rules";
import {
  ITEM_SLOTS, RARITIES, RARITY_COLOR, RARITY_NAME, SLOT_NAME, itemDef, itemList, type ItemDef, type ItemFamily, type ItemSlot, type Rarity,
} from "@/lib/town/sim/items";
import { equip, gearOf, gearRole, repair, REPAIR_COIN, salvage, salvageYield, sellItem, stash, stock, unequip } from "@/lib/town/sim/loot";
import {
  BOOK_COST, BOOK_HOURS, BOOK_ITEMS, CROWN_COST, CROWN_HOURS, CROWN_ITEMS, KING_FROM, MASTER_FROM, OFFERING, OFFERING_SHARE, RESTORE_PER_HOUR,
  ascendMaster, bookCheck, bookEssence, bookWritten, championElement, championTitle, crownCheck, crownKing, crownMade, forgeCrown, kingChecks, kingMight,
  masterChecks, mythicLab, offerToStatue, statuesOf, writeBook,
} from "@/lib/town/sim/champions";
import { EXCURSION_LEVEL, EYE_AFTER, VISIONS, canExcursion, foresee, prophecyText, visionCost } from "@/lib/town/sim/seer";
import { burnWard, omenName, omenOf, omenText, wardFor } from "@/lib/town/sim/omens";
import { ALCHEMY_RECIPES, MYTHIC_RECIPES, OBSERVATORY_RECIPES, WARDS, type LabRecipe } from "@/lib/town/sim/catalog";
import { ELEMENT_GLYPH, ELEMENT_NAME, beatenBy, beats, type Element } from "@/lib/town/sim/elements";
import { setMode } from "@/lib/town/sim/actions";
import { costText } from "@/lib/town/sim/world";
import { clock } from "@/lib/town/sim/state";
import { stats } from "@/lib/town/sim/stats";
import { workLevel } from "@/lib/town/sim/work";
import { IconCanvas } from "./Inventory";

type Run = (fn: () => string | null) => void;

/** An item's name in its rarity's colour. */
export function ItemName({ id }: { id: string }) {
  const d = itemDef(id);
  if (!d) return <span>{id}</span>;
  return <span className="tg-rarity" style={{ color: RARITY_COLOR[d.rarity] }} title={`${RARITY_NAME[d.rarity]} · ${d.blurb}`}>{d.name}</span>;
}

/** An element, as a small coloured badge. */
export function ElementBadge({ e }: { e?: Element | null }) {
  if (!e) return null;
  return <span className={`tg-element el-${e}`} title={`${ELEMENT_NAME[e]}: beats ${beats(e).map((x) => ELEMENT_NAME[x]).join(", ")}; beaten by ${beatenBy(e).map((x) => ELEMENT_NAME[x]).join(", ")}`}>{ELEMENT_GLYPH[e]} {ELEMENT_NAME[e]}</span>;
}

/** What a piece adds, in words. */
export function itemStats(d: ItemDef): string {
  const bits: string[] = [];
  if (d.dmg) bits.push(`+${Math.round(d.dmg * 100)}% damage`);
  if (d.hp) bits.push(`+${Math.round(d.hp * 100)}% hit points`);
  if (d.speed) bits.push(`+${Math.round(d.speed * 100)}% pace`);
  if (d.haste) bits.push(`${Math.round(d.haste * 100)}% quicker blows`);
  if (d.range) bits.push(`+${d.range.toFixed(1)} reach`);
  if (d.element) bits.push(`strikes with ${ELEMENT_NAME[d.element].toLowerCase()}`);
  return bits.join(" · ");
}

// ── Gear: seven slots ─────────────────────────────────────

const SLOTS_FOR = (role: string): ItemSlot[] => (role === "wizard" || role === "knight" ? ITEM_SLOTS : ITEM_SLOTS.filter((x) => x !== "relic"));

/** Every slot a troop can fill, what is in it, and what the forge's store holds that fits. */
export function GearSlots({ s, v, run }: { s: GameState; v: Villager; run: Run }) {
  const role = gearRole(v);
  return (
    <div className="tg-gear-grid">
      {SLOTS_FOR(role).map((sl) => {
        const cur = gearOf(v, sl);
        const options = stash(s).filter((x) => {
          const d = itemDef(x.item);
          return d?.kind === "equipment" && d.slot === sl && d.roles?.includes(role);
        });
        return (
          <label key={sl} className="tg-gear-slot" title={cur ? `${cur.name} — ${itemStats(cur)}` : `No ${SLOT_NAME[sl].toLowerCase()}`}>
            {cur ? <IconCanvas id={v.gear![sl]!} /> : <span className="tg-slot empty sm" />}
            <select
              className="town-select"
              value=""
              onChange={(e) => {
                const val = e.target.value;
                if (val === "-") run(() => unequip(s, v.id, sl));
                else if (val) run(() => equip(s, v.id, val));
              }}
              style={cur ? { color: RARITY_COLOR[cur.rarity] } : undefined}
            >
              <option value="">{cur ? cur.name : `${SLOT_NAME[sl]}: none`}</option>
              {[...new Set(options.map((o) => o.item))].map((id) => <option key={id} value={id}>Wear {itemDef(id)?.name} ({RARITY_NAME[itemDef(id)!.rarity]})</option>)}
              {cur && <option value="-">Take off</option>}
            </select>
          </label>
        );
      })}
    </div>
  );
}

// ── Champions ─────────────────────────────────────────────

/** A hero's road to championship, or a champion's standing. */
export function ChampionRise({ s, v, run }: { s: GameState; v: Villager; run: Run }) {
  if (v.champion) {
    const e = championElement(v);
    return (
      <div className="tg-champion">
        <b>✦ {championTitle(v)}</b> <ElementBadge e={e} />
        <span className="town-dim">
          {v.champion === "king"
            ? ` Strikes at ×${(2 * kingMight(s)).toFixed(2)}, from your ${s.realm?.emblems.length ?? 0} real emblems (depth ${s.realm?.emblems.reduce((a, x) => a + x.depth, 0) ?? 0}).`
            : " Spells that burst on everything around the target, at three times a grand wizard's force."}
          {" "}Only a champion&apos;s blows land in full on a mythic thing. Struck down, they turn to stone, not to dust.
        </span>
      </div>
    );
  }
  if (v.role === "wizard" && v.rank >= MASTER_FROM) {
    const checks = masterChecks(v);
    return (
      <div className="tg-champion">
        <button className="town-btn sm" disabled={!checks.every((c) => c.ok)} onClick={() => run(() => ascendMaster(s, v.id))}>Rise a Master of Mythic Arts</button>
        <ul className="town-checks tight">{checks.map((c) => <li key={c.label} data-ok={c.ok ? "1" : undefined}>{c.label}</li>)}</ul>
      </div>
    );
  }
  if (v.role === "knight" && v.rank >= 22) {
    const checks = kingChecks(s, v);
    return (
      <div className="tg-champion">
        <button className="town-btn sm" disabled={!checks.every((c) => c.ok)} onClick={() => run(() => crownKing(s, v.id))}>Crown him King</button>
        <ul className="town-checks tight">{checks.map((c) => <li key={c.label} data-ok={c.ok ? "1" : undefined}>{c.label}</li>)}</ul>
        {v.rank < KING_FROM && <span className="town-dim">The crown waits for level {KING_FROM}.</span>}
      </div>
    );
  }
  return null;
}

/** The statues in the town hall: champions struck down, and the offerings that bring them back. */
export function StatueHall({ s, run }: { s: GameState; run: Run }) {
  const list = statuesOf(s);
  if (!list.length) return null;
  return (
    <div className="tg-statues">
      <p className="town-kicker" style={{ marginTop: 12 }}>The hall of statues</p>
      <p className="town-dim">
        Champions struck down turn to stone. Each offering ({costText(OFFERING)}) restores {Math.round(OFFERING_SHARE * 100)}% of the stone, worked in at {Math.round(RESTORE_PER_HOUR * 100)}% an hour.
      </p>
      <ul className="tg-people">
        {list.map((v) => {
          const st = v.statue!;
          const pct = Math.round(st.restore * 100);
          const coming = Math.round((st.restore + st.fuel) * 100);
          return (
            <li key={v.id}>
              <b>{v.name}</b> <span>{championTitle(v)}</span>
              <div className="tg-restore" title={`${pct}% restored; offerings laid for ${coming}%`}>
                <i style={{ width: `${coming}%` }} className="laid" />
                <i style={{ width: `${pct}%` }} />
              </div>
              <span className="town-dim">{pct}% restored{st.fuel > 0 ? `, ${Math.ceil(st.fuel / RESTORE_PER_HOUR)}h of offerings to work in` : ""} · stone since day {clock(st.since).day}</span>{" "}
              <button className="town-btn sm" disabled={st.restore + st.fuel >= 1} onClick={() => run(() => offerToStatue(s, v.id))}>Lay an offering</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── The Eye of Time ───────────────────────────────────────

export function EyeOfTime({ s, run }: { s: GameState; run: Run }) {
  const eyes = s.villagers.filter((v) => v.role === "seer");
  const walkers = s.villagers.filter((v) => canExcursion(v) && v.role !== "seer").sort((a, b) => (b.excursions ?? 0) - (a.excursions ?? 0));
  const seen = prophecyText(s);
  return (
    <div className="tg-eye">
      <p className="town-kicker" style={{ marginTop: 12 }}>The Eye of Time</p>
      {eyes.length ? (
        <>
          {seen ? <p className="town-sub tg-prophecy">👁 {seen}</p> : <p className="town-dim">Nothing seen yet of the next wave.</p>}
          <ul className="tg-people">
            {eyes.map((v) => (
              <li key={v.id}>
                <b>{v.name}</b> <span>Eye of Time</span>
                <div className="town-row wrap">
                  {VISIONS.map((vis) => {
                    const cost = visionCost(s, vis.metal);
                    return (
                      <button key={vis.metal} className="town-btn sm ghost" disabled={s.res[vis.metal] < cost.qty} onClick={() => run(() => foresee(s, v.id, vis.metal))} title={`Shows ${vis.shows}.`}>
                        Burn {cost.qty} {vis.metal}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
          <p className="town-dim">What the Eye sees comes true: the wave comes from that side. A star chart halves the metal; so does the Hourglass of the Eye in the forge&apos;s store.</p>
        </>
      ) : (
        <p className="town-dim">
          No one in town sees ahead. A worker of level {EXCURSION_LEVEL} can go on excursions into the fog — pack torches and rations at their workplace.
          One who comes home from {EYE_AFTER} of them may come home changed.
        </p>
      )}
      {walkers.length > 0 && (
        <p className="town-dim">
          Out in the fog most: {walkers.slice(0, 4).map((v) => `${v.name} (level ${workLevel(v)}, ${v.excursions ?? 0} excursions)`).join(" · ")}.
        </p>
      )}
    </div>
  );
}

// ── Omens ─────────────────────────────────────────────────

export function OmenBanner({ s, run }: { s: GameState; run: Run }) {
  const o = omenOf(s);
  const ward = o ? wardFor(o.element) : null;
  const shown = o ?? (s.omen && s.omen.warded && s.omen.until > s.time ? s.omen : null);
  if (!shown) return null;
  return (
    <div className={`tg-omen el-${shown.element} ${o ? "" : "warded"}`}>
      <b>{omenName(shown.element, shown.power)}</b> <ElementBadge e={shown.element} />
      <span className="town-dim"> — brought by the {shown.source.toLowerCase()}, {o ? `until ${Math.max(0, Math.ceil((shown.until - s.time) / 60))}h from now` : "warded: it does not take"}.</span>
      {o && <p className="town-sub">{omenText(o.element, o.power)}</p>}
      {o && ward && (
        <button className="town-btn sm" disabled={s.res[ward] < 1} onClick={() => run(() => burnWard(s))}>
          Burn a {ELEMENT_NAME[o.element].toLowerCase()} ward ({Math.floor(s.res[ward])} in store)
        </button>
      )}
    </div>
  );
}

// ── The newer laboratories ────────────────────────────────

function Recipes({ s, st, list, run }: { s: GameState; st: Structure; list: LabRecipe[]; run: Run }) {
  return (
    <ul className="tg-dishes">
      {list.map((r) => {
        const goods = Object.entries(r.input).every(([k, n]) => s.res[k as keyof GameState["res"]] >= (n as number));
        const items = Object.entries(r.items ?? {}).every(([id, n]) => stock(s, id) >= n);
        return (
          <li key={r.id}>
            <button className={`town-tag ${st.mode === r.id ? "" : "off"}`} onClick={() => run(() => setMode(s, st.id, st.mode === r.id ? "" : r.id))}>{r.name}</button>
            <span className="town-dim">
              {costText(r.input)}{r.items ? ` + ${Object.entries(r.items).map(([id, n]) => `${n} ${itemDef(id)?.name.toLowerCase() ?? id} (${stock(s, id)})`).join(", ")}` : ""}
              {Object.keys(r.output).length ? ` → ${costText(r.output)}` : ""} · {r.blurb}{r.night ? " Only at night." : ""}{r.keep ? ` Stops at ${r.keep} in store.` : ""}{goods && items ? "" : " — missing inputs"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function LabPanel({ s, st, run, input }: { s: GameState; st: Structure; run: Run; input: TownInput }) {
  const [code, setCode] = useState("");
  const sci = st.workers.filter((id) => s.villagers.find((v) => v.id === id)?.role === "scientist").length;
  const list = st.type === "alchemy" ? ALCHEMY_RECIPES : st.type === "observatory" ? OBSERVATORY_RECIPES : MYTHIC_RECIPES;
  return (
    <>
      <p className="town-sub">
        {sci} scientist{sci === 1 ? "" : "s"} at work — each works the recipe {Math.ceil(st.level / 2)} time{Math.ceil(st.level / 2) === 1 ? "" : "s"} an hour.
        In store: {Math.floor(s.res.quicksilver)} quicksilver · {Math.floor(s.res.starchart)} star charts · wards {WARDS.map((w) => `${ELEMENT_GLYPH[w.element]}${Math.floor(s.res[w.key])}`).join(" ")}.
      </p>
      {!st.mode && <p className="town-dim warn-text">The bench stands idle: choose what it makes.</p>}
      <Recipes s={s} st={st} list={list} run={run} />
      {st.type === "mythiclab" && (
        <div className="tg-great">
          <p className="town-kicker" style={{ marginTop: 10 }}>Great works{st.craft ? ` — ${st.craft.item.startsWith("book:") ? "a Book of Enlightenment" : "the Crown of the Realm"}, ${Math.max(0, Math.ceil((st.craft.until - s.time) / 60))}h` : ""}</p>
          {mythicLab(s) !== st && <p className="town-dim">Great works are done at the mythic laboratory.</p>}
          <div className="tg-work">
            <b>The Book of Enlightenment</b>
            <span className="town-dim"> — {BOOK_HOURS}h. Written from one of your real emblems, one book to an emblem: {costText(BOOK_COST)}, {Object.entries(BOOK_ITEMS).map(([id, n]) => `${n} ${itemDef(id)?.name.toLowerCase()}`).join(", ")} and a greater essence of the emblem&apos;s element.</span>
            <div className="town-row wrap">
              <select className="town-select" value={code} onChange={(e) => setCode(e.target.value)}>
                <option value="">{input.emblems.length ? "Choose an emblem…" : "No emblems equipped"}</option>
                {input.emblems.map((em) => (
                  <option key={em.code} value={em.code} disabled={bookWritten(s, em.code)}>{em.name} (depth {em.depth}){bookWritten(s, em.code) ? " — written" : ""}</option>
                ))}
              </select>
              {(() => {
                const em = input.emblems.find((x) => x.code === code);
                const why = em ? bookCheck(s, em) : "Choose an emblem.";
                return (
                  <button className="town-btn sm" disabled={!!why} title={why ?? ""} onClick={() => em && run(() => writeBook(s, em))}>
                    Write it{em ? ` (needs ${itemDef(bookEssence(em))?.name.toLowerCase()})` : ""}
                  </button>
                );
              })()}
            </div>
          </div>
          <div className="tg-work">
            <b>The Crown of the Realm</b>
            <span className="town-dim"> — {CROWN_HOURS}h. There is one crown: {costText(CROWN_COST)}, {Object.entries(CROWN_ITEMS).map(([id, n]) => `${n} ${itemDef(id)?.name.toLowerCase()}`).join(", ")}. {crownMade(s) ? "It has been made." : ""}</span>
            {(() => {
              const why = crownCheck(s);
              return <button className="town-btn sm" disabled={!!why} title={why ?? ""} onClick={() => run(() => forgeCrown(s))}>Forge the crown</button>;
            })()}
          </div>
        </div>
      )}
    </>
  );
}

// ── The forge's store: what a piece is, and what to do with it ─

export function StoreItem({ s, id, run }: { s: GameState; id: string; run: Run }) {
  const d = itemDef(id);
  if (!d) return <p className="town-dim">{id}</p>;
  const yieldText = Object.entries(salvageYield(id)).map(([k, n]) => `${n} ${itemDef(k)?.name.toLowerCase() ?? k}`).join(", ");
  const market = s.structures.some((m) => m.type === "market" && !m.buildUntil);
  return (
    <div className="tg-store-pick">
      <IconCanvas id={id} scale={3} />
      <div>
        <ItemName id={id} /> <span className="town-dim">×{stock(s, id)} · {RARITY_NAME[d.rarity]} {d.slot ? SLOT_NAME[d.slot].toLowerCase() : d.family}</span> <ElementBadge e={d.element} />
        <span className="tg-bblurb">{d.blurb}</span>
        {d.kind === "equipment" && <span className="tg-brule">• {itemStats(d) || "no bonus"}{d.roles ? ` · worn by ${d.roles.join(", ")}` : ""}</span>}
        <div className="town-row wrap">
          {d.rarity === "broken" && <button className="town-btn sm" onClick={() => run(() => repair(s, id))} title={`Two of its scrap and ${REPAIR_COIN} coin`}>Mend</button>}
          {d.kind === "equipment" && d.rarity !== "singleton" && <button className="town-btn sm ghost" onClick={() => run(() => salvage(s, id))} title={`Gives back ${yieldText}`}>Break down</button>}
          {d.rarity !== "singleton" && <button className="town-btn sm ghost" disabled={!market} onClick={() => run(() => sellItem(s, id))} title={market ? "" : "Build a market"}>Sell · {d.value} coin</button>}
        </div>
      </div>
    </div>
  );
}

// ── The codex: all eight hundred ─────────────────────────

const FAMILY_LABEL: Partial<Record<ItemFamily, string>> = {
  sword: "Swords", bow: "Bows", crossbow: "Crossbows", staff: "Staves", halberd: "Polearms", plate: "Plate", robe: "Robes", leather: "Leathers",
  helm: "Helms", boots: "Boots", ring: "Rings", amulet: "Amulets", relic: "Relics", part: "Parts", foot: "Feet", essence: "Essences", gem: "Gems",
  metal: "Rare metals", reagent: "Reagents", trophy: "Trophies", scrap: "Scrap", curio: "Curios",
};

export function ItemCodex({ s }: { s: GameState }) {
  const all = itemList();
  const found = new Set(stats(s).found ?? []);
  for (const id of s.singletons ?? []) found.add(id.startsWith("book:") ? "book-of-enlightenment" : id);
  const [rarity, setRarity] = useState<Rarity | "all">("all");
  const [family, setFamily] = useState<ItemFamily | "all">("all");
  const [onlyFound, setOnlyFound] = useState(false);
  const [pick, setPick] = useState<ItemDef | null>(null);
  const [page, setPage] = useState(0);
  const list = all.filter((d) => (rarity === "all" || d.rarity === rarity) && (family === "all" || d.family === family) && (!onlyFound || found.has(d.id)));
  // A page at a time: eight hundred little canvases at once is a long wait for a tab to open.
  const PAGE = 120;
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const at = Math.min(page, pages - 1);
  return (
    <div className="tg-codex">
      <p className="town-kicker">Codex</p>
      <h2 className="town-title">{[...found].filter((id) => itemDef(id)).length} of {all.length} found</h2>
      <div className="town-row wrap" style={{ marginTop: 6 }}>
        <select className="town-select" value={rarity} onChange={(e) => { setRarity(e.target.value as Rarity | "all"); setPage(0); }}>
          <option value="all">Every rarity</option>
          {RARITIES.map((r) => <option key={r} value={r}>{RARITY_NAME[r]} — {all.filter((d) => d.rarity === r).length}</option>)}
        </select>
        <select className="town-select" value={family} onChange={(e) => { setFamily(e.target.value as ItemFamily | "all"); setPage(0); }}>
          <option value="all">Every kind</option>
          {(Object.keys(FAMILY_LABEL) as ItemFamily[]).map((f) => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}
        </select>
        <label className="town-dim"><input type="checkbox" checked={onlyFound} onChange={(e) => setOnlyFound(e.target.checked)} /> found only</label>
      </div>
      {pick && (
        <div className="tg-trophy-pick">
          <IconCanvas id={pick.id} scale={3} />
          <div>
            <b style={{ color: RARITY_COLOR[pick.rarity] }}>{pick.name}</b> <ElementBadge e={pick.element} />
            <span>{pick.blurb}</span>
            <span className="town-dim">
              {RARITY_NAME[pick.rarity]} {pick.slot ? SLOT_NAME[pick.slot].toLowerCase() : FAMILY_LABEL[pick.family]?.toLowerCase()} · {pick.kind === "equipment" ? itemStats(pick) || "no bonus" : `worth ${pick.value} coin`}
              {found.has(pick.id) ? " · found" : " · not yet found"}
            </span>
          </div>
        </div>
      )}
      {pages > 1 && (
        <div className="town-row wrap" style={{ marginTop: 6 }}>
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} className={`town-btn sm ${i === at ? "" : "ghost"}`} onClick={() => setPage(i)}>{i * PAGE + 1}–{Math.min(list.length, (i + 1) * PAGE)}</button>
          ))}
        </div>
      )}
      <div className="tg-codex-grid">
        {list.slice(at * PAGE, (at + 1) * PAGE).map((d) => (
          <button key={d.id} className={`tg-codex-item ${found.has(d.id) ? "on" : ""} ${pick?.id === d.id ? "sel" : ""}`} style={{ borderColor: RARITY_COLOR[d.rarity] }} title={`${d.name} — ${RARITY_NAME[d.rarity]}`} onClick={() => setPick(d)}>
            <IconCanvas id={d.id} />
          </button>
        ))}
      </div>
    </div>
  );
}
