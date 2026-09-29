"use client";

import { useState } from "react";
import {
  ALL_ATTRS, ATTR_BLURB, ATTR_NAME, ATTR_SHORT, GIFT_NAME, GROUPS, GROUP_NAME, JOB_ATTR, attrsOf, bestAttrs,
  type AttrGroup, type AttrKey,
} from "@/lib/town/sim/attributes";
import { REC_MAX, nextTier, recognitionOf, talentOdds, tierFor } from "@/lib/town/sim/recognition";
import { WATCH_REST, WATCH_WORK, isMythicWatcher, setNightWatch } from "@/lib/town/sim/menace";
import { roleLabel } from "@/lib/town/sim/catalog";
import { MILITARY, type GameState, type StructureType, type Villager } from "@/lib/town/sim/types";

type Run = (fn: () => string | null) => void;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const tone = (a: number) => (a >= 16 ? "hi2" : a >= 12 ? "hi" : a <= 5 ? "lo" : "");

/** One attribute, as a chip: its short name and value, coloured by how far from a commoner's it stands. */
export function AttrChip({ v, k }: { v: Villager; k: AttrKey }) {
  const a = attrsOf(v)[k];
  return (
    <span className={`tg-attr ${tone(a)}`} title={`${ATTR_NAME[k]} ${a} — ${ATTR_BLURB[k]}`}>
      {ATTR_SHORT[k]} <b>{a}</b>
    </span>
  );
}

/** The attribute a job leans on, for the worker at it. */
export function JobAttr({ v, job }: { v: Villager; job: StructureType }) {
  const k = JOB_ATTR[job];
  return k ? <AttrChip v={v} k={k} /> : null;
}

/** A gifted or prodigy badge beside a name. */
export function GiftBadge({ v }: { v: Villager }) {
  if (!v.gift) return null;
  return <span className={`tg-gift ${v.gift}`} title={v.gift === "prodigy" ? "A prodigy: three attributes of a calling raised, one near the height" : "Gifted: two attributes of a calling raised"}>{GIFT_NAME[v.gift]}</span>;
}

/** Every attribute of a villager, in its three groups. */
export function AttrGrid({ v }: { v: Villager }) {
  return (
    <div className="tg-attrgrid">
      {(Object.keys(GROUPS) as AttrGroup[]).map((g) => (
        <div key={g}>
          <span className="tg-attrgroup">{GROUP_NAME[g]}</span>
          {GROUPS[g].map((k) => <AttrChip key={k} v={v} k={k} />)}
        </div>
      ))}
    </div>
  );
}

/** The town's name in the top bar: a star and the points, the tier on hover. */
export function RecognitionBadge({ s }: { s: GameState }) {
  const r = recognitionOf(s);
  const t = tierFor(r.points);
  return (
    <span className="tg-rec" title={`Recognition ${Math.round(r.points)} — ${t.name}. Good stewardship earns it; deaths spend it. It draws the gifted.`}>
      ★ <b>{Math.round(r.points)}</b>
    </span>
  );
}

/**
 * The town's name (lib/town/sim/recognition): the points and the tier, what
 * they buy — the odds a newcomer arrives gifted or a prodigy — and the
 * ledger of how they were earned and spent, today and yesterday.
 */
export function RecognitionPanel({ s }: { s: GameState }) {
  const r = recognitionOf(s);
  const t = tierFor(r.points);
  const nx = nextTier(r.points);
  const odds = talentOdds(r.points);
  const ledger = (list: { why: string; n: number }[]) =>
    list.length ? list.map((e) => <li key={e.why} className={e.n < 0 ? "warn-text" : ""}><span>{e.why}</span><b>{e.n > 0 ? "+" : ""}{Math.round(e.n)}</b></li>) : <li className="town-dim">Nothing yet.</li>;
  return (
    <div className="tg-recpanel">
      <p className="town-kicker" style={{ marginTop: 12 }}>Recognition</p>
      <div className="tg-rec-head">
        <b className="tg-rec-points">★ {Math.round(r.points)}</b>
        <span>{t.name}{nx ? ` — ${Math.ceil(nx.from - r.points)} to ${nx.name.toLowerCase()}` : " — as high as a name goes"}</span>
      </div>
      <div className="tg-rec-bar" aria-hidden><i style={{ width: pct(r.points / REC_MAX) }} /></div>
      <p className="town-dim">
        Earned at every dawn by good stewardship — a full cycle with no one lost, full bellies, warm homes, a fair working day, a bed for everyone — and by broken raids, slain legends, feasts and heroes. Spent by every death, the more the more die in a day, and most by the deaths of neglect.
      </p>
      <p className="tg-rec-odds">A newcomer arrives <b>gifted</b> {pct(odds.gifted)} of the time, a <b>prodigy</b> {pct(odds.prodigy)}.</p>
      <div className="tg-rec-ledger">
        <div><p className="tg-branch-name">Today</p><ul>{ledger(r.today)}</ul></div>
        <div><p className="tg-branch-name">Yesterday</p><ul>{ledger(r.yesterday)}</ul></div>
      </div>
    </div>
  );
}

/**
 * The townsfolk and what they are made of (lib/town/sim/attributes): each
 * with their three best attributes; open one for all twelve. The gifted
 * first, then by how strong their best is.
 */
export function PeoplePanel({ s }: { s: GameState }) {
  const [open, setOpen] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const order = [...s.villagers].sort((a, b) =>
    (b.gift === "prodigy" ? 2 : b.gift ? 1 : 0) - (a.gift === "prodigy" ? 2 : a.gift ? 1 : 0) || bestAttrs(b, 1)[0].a - bestAttrs(a, 1)[0].a);
  const shown = all ? order : order.slice(0, 12);
  return (
    <div className="tg-people-attrs">
      <p className="town-kicker" style={{ marginTop: 12 }}>The townsfolk</p>
      <p className="town-dim">Twelve attributes each — labour, war and the arcane — kept through every job and promotion, and grown a point now and then as they rise. A point either side of 8 is 3% in what it governs.</p>
      <ul className="tg-folk">
        {shown.map((v) => (
          <li key={v.id}>
            <button className="tg-folk-row" aria-expanded={open === v.id} onClick={() => setOpen(open === v.id ? null : v.id)}>
              <span><b>{v.name}</b> <GiftBadge v={v} /> <span className="town-dim">{roleLabel(v.role, v.rank)}{v.nightWatch ? " · ☾ watch" : ""}</span></span>
              <span className="tg-folk-best">{bestAttrs(v).map((x) => <AttrChip key={x.k} v={v} k={x.k} />)}</span>
            </button>
            {open === v.id && <AttrGrid v={v} />}
          </li>
        ))}
      </ul>
      {order.length > 12 && <button className="town-btn ghost sm" onClick={() => setAll(!all)}>{all ? "Fewer" : `All ${order.length}`}</button>}
      <p className="town-dim" style={{ marginTop: 6 }}>{ALL_ATTRS.length} attributes: {ALL_ATTRS.map((k) => ATTR_NAME[k]).join(", ")}.</p>
    </div>
  );
}

/**
 * The night watch (lib/town/sim/menace): only those on it answer an alarm
 * between eight at night and six in the morning; everyone else sleeps, and
 * only the towers and the hall answer for them. The watch rest from nine to
 * five, at half their day's work and drill, and do not answer an alarm then.
 */
export function NightWatchPanel({ s, run }: { s: GameState; run: Run }) {
  const troops = s.villagers.filter((v) => MILITARY.includes(v.role));
  const folk = s.villagers.filter((v) => !MILITARY.includes(v.role));
  const watch = s.villagers.filter((v) => v.nightWatch);
  const [more, setMore] = useState(false);
  const row = (v: Villager) => (
    <li key={v.id}>
      <label title={v.nightWatch ? "Answers alarms at night; rests nine to five" : "Sleeps through the night's alarms"}>
        <input type="checkbox" checked={!!v.nightWatch} onChange={(e) => run(() => setNightWatch(s, v.id, e.target.checked))} />
        {" "}<b>{v.name}</b> <span className="town-dim">{roleLabel(v.role, v.rank)} · ♥{Math.round(v.health)}</span> <AttrChip v={v} k="val" />
      </label>
    </li>
  );
  return (
    <div className="tg-watch">
      <p className="town-kicker" style={{ marginTop: 12 }}>The night watch · {watch.length}</p>
      <p className={`town-dim ${watch.length ? "" : "warn-text"}`}>
        {watch.length
          ? `${watch.length} keep${watch.length === 1 ? "s" : ""} the watch: only they answer an alarm from eight at night to six in the morning. They rest ${WATCH_REST[0]} to ${WATCH_REST[1]}, at ${pct(WATCH_WORK)} of their day's work and drill.`
          : "No one keeps the night watch: at night only the towers and the hall answer an alarm. Name a few — troops fight as themselves, townsfolk as militia."}
      </p>
      {(() => {
        const myth = s.villagers.filter(isMythicWatcher);
        return myth.length ? (
          <p className="tg-mythwatch">
            ✦ The mythic watch: <b>{myth.map((v) => v.name).join(", ")}</b> — {myth.length === 1 ? "keeps" : "keep"} it always, and ride out on
            their own the moment anything mythic comes, night or day, posted or not.
          </p>
        ) : (
          <p className="town-dim">✦ No one keeps the mythic watch yet: a grand wizard (past level 15), an emblem knight (past 22) or a champion would answer anything mythic unbidden.</p>
        );
      })()}
      {troops.length > 0 && <ul className="tg-watch-list">{troops.map(row)}</ul>}
      {folk.length > 0 && (
        <details className="tg-watch-folk" open={more} onToggle={(e) => setMore((e.target as HTMLDetailsElement).open)}>
          <summary>Townsfolk as militia ({folk.filter((v) => v.nightWatch).length} of {folk.length})</summary>
          <ul className="tg-watch-list">{folk.map(row)}</ul>
        </details>
      )}
    </div>
  );
}
