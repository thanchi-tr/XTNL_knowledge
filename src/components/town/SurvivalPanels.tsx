"use client";

import { CATALOG } from "@/lib/town/sim/catalog";
import { clock } from "@/lib/town/sim/state";
import { airBoost, center, costText, fireAir, warmthRange } from "@/lib/town/sim/world";
import { air, REGIME_EFFECT, REGIME_LABEL, weatherOf } from "@/lib/town/sim/weather";
import { FUEL_UNIT_KG, HEARTHS, envelope, isHeated, isZone, materials, ppm, woodFuel, lhv } from "@/lib/town/sim/zones";
import { FOOTING, footingOf, frameLoads, frameUtil, hasFrame } from "@/lib/town/sim/frame";
import { ILLNESS, STATE_LABEL, bodyOf } from "@/lib/town/sim/body";
import { soilOf, soilYield, CROP_SOIL } from "@/lib/town/sim/soil";
import { DECREES, FACTIONS, factionDiscontent, decreeWeight, enactDecree } from "@/lib/town/sim/psyche";
import { CHANNEL_LABEL, STIMULUS_LABEL, WEIGHTS, threatForecast } from "@/lib/town/sim/aggro";
import { storeSeal } from "@/lib/town/sim/aggro";
import { storeTemp, storesOf } from "@/lib/town/sim/stores";
import { TOOL_MATS, kitSummary } from "@/lib/town/sim/tools";
import { NODE_DEFS, wakeState } from "@/lib/town/sim/wilds";
import { fitHearth, reroof, setFooting, setPolicy, sweepChimney } from "@/lib/town/sim/actions";
import { CHANNELS, STIMULI, type Footing, type GameState, type HearthKind, type Structure, type Villager } from "@/lib/town/sim/types";
import { ATTR_BUFFS, TIERS, knowledgeOf, tierOf } from "@/lib/town/sim/knowledge";
import { DEPTH_NAMES, STOCKS, STOCK_KEYS, goodsText, neediest, needs, passesOf, setTitheFocus, type Focus } from "@/lib/town/sim/tithes";
import { TACTICS, TACTIC_LABEL, neglect, nemesisOf, tacticOdds, vulnerability, type Tactic } from "@/lib/town/sim/nemesis";
import type { TownInput } from "@/lib/town/rules";
import { cartAt, cartFor, goodsList, nextRollAt } from "@/lib/town/pulse";

/**
 * The survival systems' readouts and controls (docs/town-survival-systems.md).
 * Plain panels: numbers the player can act on, and the actions.
 */

type Run = (fn: () => string | null) => void;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const r1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);

/** Top-bar weather: temperature, wind, what the sky is doing, snow on the ground. */
export function WeatherBadge({ s }: { s: GameState }) {
  const a = air(s);
  const w = weatherOf(s);
  return (
    <div className={`tg-weather ${a.vis < 100 || ["sandstorm", "thunder", "heatwave", "gale"].includes(a.regime) ? "warn" : ""}`} title={`${REGIME_EFFECT[a.regime] ? `${REGIME_LABEL[a.regime]}: ${REGIME_EFFECT[a.regime]}. ` : ""}Visibility ${Math.round(a.vis)} m · humidity ${pct(a.RH)} · ground ${r1(a.Tg)} °C · frost depth ${r1(w.zf)} m${s.time < w.thawUntil ? " · the ground is thawing (soft)" : ""}`}>
      <b>{r1(a.T)} °C</b>
      <span>{REGIME_LABEL[a.regime]}</span>
      <span>{r1(a.v)} m/s</span>
      {a.snowDepth > 0.01 && <span>snow {Math.round(a.snowDepth * 100)} cm</span>}
    </div>
  );
}

/** A villager's body in one line: core, state, energy, wet, what ails them. */
export function Vitals({ s, v }: { s: GameState; v: Villager }) {
  const b = bodyOf(v);
  const ill = b.ill.filter((i) => i.onset <= s.time).map((i) => ILLNESS[i.kind].name);
  const warn = b.state !== "normal" || ill.length || b.F < 5 || b.cohb >= 10 || b.blood >= 0.75;
  return (
    <span className={warn ? "warn-text" : "town-dim"} title={`Glycogen ${Math.round(b.Eg)} kcal · fat ${r1(b.F)} kg${b.B > 0.2 ? ` · muscle lost ${r1(b.B)} kg` : ""} · vitamin C ${Math.round(b.vitC)} mg · fatigue ${pct(b.phi)} · output ${pct(b.effDay ?? b.eff)}${b.frostH > 60 ? ` · frostbite (hands) ${Math.round(b.frostH)}` : ""}${b.tf > 10 ? " · trench foot" : ""}${b.cohb > 5 ? ` · CO ${Math.round(b.cohb)}%` : ""}`}>
      {r1(b.Tc)}° {b.state !== "normal" ? STATE_LABEL[b.state] : ""} · {Math.round(b.Eg)} kcal{b.W > 0.3 ? ` · ${pct(b.W)} wet` : ""}{b.blood > 0.2 ? ` · lost ${r1(b.blood)} L blood` : ""}{ill.length ? ` · ${ill.join(", ")}` : ""}{b.amputee ? ` · lost ${b.amputee} limb${b.amputee > 1 ? "s" : ""}` : ""}
    </span>
  );
}

/** A room: its temperature, the fire, the air, the flue, and the frame and roof above. */
export function ZonePanel({ s, st, run }: { s: GameState; st: Structure; run: Run }) {
  if (!isZone(st) || !st.zone) return null;
  const z = st.zone;
  const env = envelope(st);
  const { wall, roof } = materials(st);
  const a = air(s);
  const [bx, by] = center(st);
  const boost = airBoost(fireAir(s), bx, by);
  // A pit fire in reach that has burned out warms nothing: say so, or the player wonders why.
  const coldFire = !boost && s.structures.some((f) => f.type === "pitfire" && !f.buildUntil && (f.fuel ?? 0) <= 0 && Math.hypot(f.x + f.w / 2 - bx, f.y + f.h / 2 - by) <= warmthRange(f.level));
  const co = ppm(z.co);
  const H = env.UAwalls + env.UAroof + env.UAfloor;
  return (
    <div className="tg-zone">
      <p className="town-kicker" style={{ marginTop: 10 }}>Inside</p>
      <p className={`town-sub ${z.T < 5 ? "warn-text" : ""}`}>
        <b>{r1(z.T)} °C</b> inside, {r1(a.T + boost)} °C out{boost > 0 ? ` (${r1(a.T)} °C air + ${r1(boost)} °C from the pit fire)` : coldFire ? " (the pit fire in reach is out — load its grate)" : ""} · {wall.name.toLowerCase()} walls, {roof.name.toLowerCase()} roof · loses {Math.round(H)} W/K through its shell
        {st.hearth ? ` · ${HEARTHS[st.hearth].name.toLowerCase()}` : ""}
        {z.burn > 0 ? `, burning ${r1(z.burn)} kg/h of ${z.fuel ?? "fuel"}` : st.hearth ? ", unlit" : ""}
      </p>
      {co > 50 && <p className="town-sub warn-text">Carbon monoxide {Math.round(co)} ppm{co > 400 ? " — deadly to sleep in" : co > 200 ? " — headaches, then worse" : ""}.</p>}
      {isHeated(st) && (
        <>
          {(() => {
            // The heating ladder: where this room stands, and the next rung up.
            const cur = HEARTHS[st.hearth ?? "open"];
            const top = Math.max(...Object.values(HEARTHS).map((h) => h.tier));
            const next = Object.values(HEARTHS).find((h) => h.tier === cur.tier + 1 && h.kind !== "brazier");
            const others = (Object.keys(HEARTHS) as HearthKind[]).filter((k) => k !== st.hearth && k !== next?.kind && (HEARTHS[k].tier <= cur.tier || k === "brazier"));
            return (
              <>
                <p className="town-dim">
                  Heating level {cur.tier} of {top} — {cur.name.toLowerCase()}: {pct(cur.eta)} of the fire into the room{cur.floor ? `, floor warmed (${pct(cur.floor)} less lost to the ground)` : ""}. {cur.blurb}
                </p>
                {next && (
                  <button className="town-btn sm" onClick={() => run(() => fitHearth(s, st.id, next.kind))} title={next.blurb}>
                    Heating level {next.tier}: fit a {next.name.toLowerCase()} ({costText(next.cost)}) — {pct(next.eta)} of the fire into the room
                  </button>
                )}
                {others.length > 0 && (
                  <div className="town-row wrap">
                    {others.map((k) => (
                      <button key={k} className="town-btn ghost sm" onClick={() => run(() => fitHearth(s, st.id, k))} title={`${HEARTHS[k].blurb} Heat to the room ${pct(HEARTHS[k].eta)} · flue catches ${pct(HEARTHS[k].flue)} of the fumes`}>
                        {HEARTHS[k].tier < cur.tier ? "Back to" : "Fit"} {HEARTHS[k].name.toLowerCase()}{Object.keys(HEARTHS[k].cost).length ? ` (${costText(HEARTHS[k].cost)})` : ""}
                      </button>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
          {st.hearth && HEARTHS[st.hearth].flued && (
            <p className={`town-dim ${z.creo > 3 ? "warn-text" : ""}`}>
              Creosote in the flue: {r1(z.creo)} kg{z.creo > 3 ? " — a chimney fire waiting to happen" : ""}.{" "}
              <button className="town-btn ghost sm" onClick={() => run(() => sweepChimney(s, st.id))}>Sweep (2 coin)</button>
            </p>
          )}
        </>
      )}
      {hasFrame(st) && <FrameLine s={s} st={st} run={run} />}
    </div>
  );
}

function FrameLine({ s, st, run }: { s: GameState; st: Structure; run: Run }) {
  const util = frameUtil(s, st);
  const { q } = frameLoads(s, st);
  const failed = (st.frame ?? []).filter((x) => x <= 0).length;
  const foot = footingOf(st);
  return (
    <>
      <p className={`town-dim ${util > 0.8 ? "warn-text" : ""}`}>
        Roof load {r1(q)} kPa{(st.roofSnow ?? 0) > 1 ? ` (${Math.round(st.roofSnow ?? 0)} kg/m² of snow)` : ""} · worst post at {pct(util)} of what it can carry
        {failed ? ` · ${failed} post${failed > 1 ? "s" : ""} down` : ""} · {FOOTING[foot].name.toLowerCase()}
        {(st.rot ?? 0) > 0.05 ? ` · timber ${pct(st.rot ?? 0)} rotten` : ""}
      </p>
      <div className="town-row wrap">
        {(Object.keys(FOOTING) as Footing[]).filter((f) => FOOTING[f].depth > FOOTING[foot].depth).map((f) => (
          <button key={f} className="town-btn ghost sm" onClick={() => run(() => setFooting(s, st.id, f))} title={`${FOOTING[f].depth} m deep, ${FOOTING[f].area} m² per post: below the frost, and bearing through the thaw`}>
            Underpin: {FOOTING[f].name.toLowerCase()}
          </button>
        ))}
        {isZone(st) && (
          <button className="town-btn ghost sm" onClick={() => run(() => reroof(s, st.id, st.roofKind === "turf" ? "default" : "turf"))} title="Turf: warm, fireproof — and very heavy when wet or under snow">
            {st.roofKind === "turf" ? "Re-roof as before" : "Re-roof in turf"}
          </button>
        )}
      </div>
    </>
  );
}

/** A field's ground: nitrogen, phosphorus, organic matter, and what the crop is doing to it. */
export function SoilPanel({ st }: { st: Structure }) {
  const soil = soilOf(st);
  const crop = CROP_SOIL[st.mode ?? "potato"];
  return (
    <p className={`town-sub ${soilYield(st) < 0.7 ? "warn-text" : ""}`}>
      Soil: N {r1(soil.N)} · P {r1(soil.P)} g/m² · organic {r1(soil.O)}% — yielding {pct(soilYield(st))} of good ground
      {soil.nc > 1 ? ` · ${soil.nc} seasons of ${soil.crop} in a row (pests)` : ""}
      {crop ? ` · ${st.mode} ${crop.N < 0 ? "puts back" : "takes"} ${Math.abs(crop.N)} g N a ${crop.cycle}-day cycle` : ""}.
      Beans, fallow, compost and fertiliser put it back; phosphorus only from what is spread.
    </p>
  );
}

/** Hope, the society's state, factions, policies and the decrees. */
export function SocietyPanel({ s, run }: { s: GameState; run: Run }) {
  const soc = s.society;
  const facs = factionDiscontent(s);
  const pol = s.policy ?? { heat: 10, ration: 1, freshSoil: false, coalFirst: false, shift: 14 };
  const corpses = s.corpses?.length ?? 0;
  return (
    <div className="tg-society">
      <p className="town-kicker" style={{ marginTop: 12 }}>The town&apos;s spirit</p>
      <p className="town-sub">
        Hope <b>{Math.round(s.mood)}</b> · {soc ? soc.state : "stable"}
        {soc?.ultimatum ? ` · the ${FACTIONS[soc.ultimatum.faction]} faction demands ${soc.ultimatum.demand === "rations" ? "full rations" : soc.ultimatum.demand === "rest" ? "a day of rest" : "a repeal"} within ${Math.max(0, Math.ceil((soc.ultimatum.until - s.time) / 60))}h` : ""}
        {corpses ? ` · ${corpses} unburied dead` : ""}
        {decreeWeight(s) ? ` · decrees weigh ${decreeWeight(s)} on every mind` : ""}
      </p>
      <table className="tg-table">
        <thead><tr><th>Faction</th><th>Share</th><th>Discontent</th></tr></thead>
        <tbody>
          {FACTIONS.map((f, i) => (
            <tr key={f}><td>{f}</td><td>{pct(facs[i].share)}</td><td className={facs[i].disc > 60 ? "warn-text" : ""}>{Math.round(facs[i].disc)}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="town-kicker" style={{ marginTop: 10 }}>Policy</p>
      <div className="town-row wrap">
        <label className="town-dim">Heat homes to{" "}
          <select className="town-select" value={pol.heat} onChange={(e) => run(() => setPolicy(s, { heat: Number(e.target.value) }))}>
            {[6, 8, 10, 12, 14, 16, 18].map((t) => <option key={t} value={t}>{t} °C</option>)}
          </select>
        </label>
        <label className="town-dim" title="Longer days get more done; discontent settles higher the longer they are — about 45 at fourteen hours, 70 at sixteen. Past fourteen takes the extended-shift decree.">Working day{" "}
          <select className="town-select" value={pol.shift ?? 14} onChange={(e) => run(() => setPolicy(s, { shift: Number(e.target.value) }))}>
            {[10, 11, 12, 13, 14, ...(s.decrees?.includes("shifts") ? [16, 18] : [])].map((h) => <option key={h} value={h}>{h} h</option>)}
          </select>
        </label>
        <label className="town-dim">Rations{" "}
          <select className="town-select" value={pol.ration} onChange={(e) => run(() => setPolicy(s, { ration: Number(e.target.value) }))}>
            {[1, 0.85, 0.7, 0.5].map((x) => <option key={x} value={x}>{pct(x)}</option>)}
          </select>
        </label>
        <label className="town-dim"><input type="checkbox" checked={pol.coalFirst} onChange={(e) => run(() => setPolicy(s, { coalFirst: e.target.checked }))} /> Coal before wood</label>
        <label className="town-dim"><input type="checkbox" checked={pol.freshSoil} onChange={(e) => run(() => setPolicy(s, { freshSoil: e.target.checked }))} /> Spread nightsoil fresh</label>
      </div>
      <p className="town-kicker" style={{ marginTop: 10 }}>Emergency decrees — none can be repealed</p>
      <ul className="tg-decrees">
        {DECREES.map((d) => {
          const law = s.decrees?.includes(d.id);
          const why = law ? null : d.unlock(s);
          return (
            <li key={d.id}>
              <b>{d.name}</b> <span className="town-dim">{d.blurb} Hope {d.hope > 0 ? "+" : ""}{d.hope}.</span>{" "}
              {law ? <span className="warn-text">In force.</span> : (
                <button className="town-btn danger sm" disabled={!!why} title={why ?? "Enact — for good"} onClick={() => {
                  if (window.confirm(`Enact “${d.name}”? It can never be repealed.`)) run(() => enactDecree(s, d.id));
                }}>{why ? why : "Enact"}</button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Food, fuel and tools: spoilage, contamination, the wood's seasoning, the kit. */
export function StoresPanel({ s }: { s: GameState }) {
  const st = storesOf(s);
  const t = storeTemp(s);
  const spoiled = Object.entries(st.spoiled).filter(([k, n]) => (n ?? 0) > 0.5 && s.res[k as keyof GameState["res"]] > 0);
  const wood = woodFuel(st.woodMC);
  const kit = kitSummary(s);
  return (
    <div className="tg-stores">
      <p className="town-kicker" style={{ marginTop: 12 }}>Stores</p>
      <p className="town-sub">
        Kept at {r1(t.T)} °C{t.iced ? " (the ice house)" : ""} · miasma {r1(st.miasma * 100)} · freeze–thaw bruising ×{r1(st.kMul)} ·
        spores on the grain {pct(st.contamFood)}, in the water {pct(st.contamWater)} (the stores keep out {pct(storeSeal(s))}) ·
        meals {pct(st.mealTaint)} spoiled, {Math.round(st.mealVitC)} mg vitamin C each
      </p>
      {spoiled.length > 0 && <p className="town-dim">Spoiling: {spoiled.map(([k, n]) => `${Math.round(n ?? 0)} ${k}`).join(", ")}.</p>}
      <p className="town-sub">
        Wood moisture {pct(st.woodMC)}: {r1(lhv(wood.lhvDry, wood.mc))} MJ/kg, {r1(wood.pm)} g of smoke a kilo ({FUEL_UNIT_KG} kg a unit){st.woodMC > 0.35 ? " — green: it burns poorly and chokes the flues" : ""} ·
        compost {Math.round(s.res.compost)}, nightsoil ageing {Math.round(st.soilAging)} person-days
      </p>
      <p className="town-sub">
        Tools: {kit.length ? kit.map((k) => `${k.n} ${TOOL_MATS[k.mat].name.toLowerCase()} (edge ${pct(k.s)}, wear ${pct(Math.min(1, k.D))})`).join(" · ") : "none — bare hands work at half pace"}
      </p>
    </div>
  );
}

/** The land's answer: channels, what feeds them, the purse, the next wave. */
export function ThreatPanel({ s }: { s: GameState }) {
  const f = threatForecast(s);
  return (
    <div className="tg-threat">
      <p className="town-kicker" style={{ marginTop: 12 }}>The land&apos;s answer</p>
      <p className="town-sub">
        Everything the town does is noticed. Aggro {Math.round(f.total)} (of which {Math.round(f.scar)} is scar that never fades) · budget {Math.round(f.budget)} a day ·
        purse {Math.round(f.purse)} of {Math.round(f.trigger)} · next wave in about {Number.isFinite(f.hoursToWave) ? Math.ceil(f.hoursToWave) : "—"}h, aimed at {pct(f.rho)} of what defends its target.
      </p>
      <table className="tg-table">
        <thead><tr><th>Answer</th><th>Aggro</th><th>Last day</th><th>Odds</th><th>Level</th></tr></thead>
        <tbody>
          {CHANNELS.map((ch, j) => (
            <tr key={ch}><td>{CHANNEL_LABEL[ch]}</td><td>{Math.round(f.aggro[j])}</td><td>+{r1(f.daily[j])}</td><td>{pct(f.odds[j])}</td><td>~{f.levels[j]}</td></tr>
          ))}
        </tbody>
      </table>
      <details className="tg-test">
        <summary>What feeds each answer</summary>
        <table className="tg-table">
          <thead><tr><th>Stimulus</th>{CHANNELS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {STIMULI.map((k) => <tr key={k}><td>{STIMULUS_LABEL[k]}</td>{WEIGHTS[k].map((w, j) => <td key={j}>{w}</td>)}</tr>)}
          </tbody>
        </table>
        <p className="town-dim">K siege beasts go for the posts that hold roofs up; B burrowers come up under the stores; Wr stalkers take the cold and alone in blizzards; I spores settle on grain and water.</p>
      </details>
    </div>
  );
}

/** Extraction nodes found in the fog, and how awake each is. */
export function NodeList({ s, onSend }: { s: GameState; onSend?: (x: number, y: number) => void }) {
  const found = (s.nodes ?? []).filter((n) => n.discovered);
  if (!found.length) return <p className="town-dim">No extraction sites found yet: bog iron, salt, coal, peat, flint and silver lie out in the fog.</p>;
  return (
    <ul className="tg-people">
      {found.map((n) => (
        <li key={n.id}>
          <b>{NODE_DEFS[n.kind].name}</b> <span className="town-dim">at {n.x},{n.y} · {wakeState(n.wake, n.awakened)} ({Math.round(n.wake)})</span>
          {onSend && <button className="town-btn ghost sm" onClick={() => onSend(n.x, n.y)}>Send here</button>}
        </li>
      ))}
    </ul>
  );
}

void CATALOG;
void clock;

// ── Study and the nemesis (design §12–13) ─────────────────

/** Today's study, Field by Field: the buffs it gives, the goods and drop it pays, what the town asks, what neglect costs. */
export function StudyPanel({ s, input, run }: { s: GameState; input: TownInput; run?: (fn: () => string | null) => void }) {
  const fields = input.fields ?? [];
  const k = s.knowledge;
  const paid = new Set(k?.claimed[input.day ?? ""] ?? []);
  const focus: Focus = k?.focus ?? "auto";
  const lack = needs(s);
  const worst = neediest(s);
  const passed = fields.reduce((a, f) => a + passesOf(f), 0);
  const failed = fields.reduce((a, f) => a + (f.failed ?? 0), 0);
  const reqs = (k?.reqs ?? []).filter((r) => r.day === input.day);
  const mods = Object.entries(k?.mods ?? {}).filter(([, m]) => Math.abs(m ?? 0) > 0.005).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const ng = neglect(s);
  // Today's carts, as the review app states them (lib/town/pulse): a Field with cards due, its cart not yet in.
  const carts = input.day ? fields.filter((f) => f.dueRemaining > 0 && !paid.has(f.id)).map((f) => cartFor(f, input.day!, false)) : [];
  return (
    <div className="tg-study">
      <p className="town-kicker" style={{ marginTop: 12 }}>Study</p>
      {!fields.length ? (
        <p className="town-dim">No study reaches this town. Add ideas and finish your reviews: every idea is a buff here, every finished Field a supply cart.</p>
      ) : (
        <>
          <p className="town-sub">
            Each idea you add today strengthens the town along its Field&apos;s attributes. Finish a Field&apos;s reviews for today and a supply cart comes in —
            the longer its streak, the rarer the load, and each one finished calms the land a little. Leave cards overdue and the land grows hungrier
            {ng.budget > 1.01 ? ` (right now ×${r1(ng.budget)} its budget, +${r1(ng.rho * 100)}% its aim)` : ng.budget < 0.99 ? ` — today it is calmed to ×${r1(ng.budget)} its budget` : ""}.
          </p>
          <div className="tg-quarter">
            <p className="town-sub">
              <b>Every review you pass pays the town.</b> A new card sends raw goods; a settled one (level 4–6) worked goods; a deep one (7–9)
              ingots and silver; a rooted one (10+) gold and platinum. Failed reviews send nothing. Today: <b>{passed}</b> passed
              {failed ? <>, <span className="town-dim">{failed} not yet</span></> : null}.
            </p>
            <p className="town-kicker">The quartermaster turns them into</p>
            <div className="tg-stocks">
              {(["auto", ...STOCK_KEYS] as Focus[]).map((st) => (
                <button
                  key={st}
                  className={`town-tag tg-stock ${focus === st ? "on" : ""}`}
                  aria-pressed={focus === st}
                  disabled={!run}
                  title={st === "auto" ? "Whatever the town is shortest of, pass by pass" : `${STOCKS[st].blurb}${STOCKS[st].school ? ` · ${STOCKS[st].school} Fields send 25% more` : ""}`}
                  onClick={() => run?.(() => setTitheFocus(s, knowledgeOf(s), st))}
                >
                  {st === "auto" ? `What we lack (${STOCKS[worst].name.toLowerCase()})` : STOCKS[st].name}
                  {st !== "auto" && (
                    <span className={`tg-bar tg-need ${lack[st] > 0.6 ? "short" : ""}`} aria-label={`${pct(lack[st])} short`}>
                      <span style={{ width: `${Math.round(lack[st] * 100)}%` }} />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="town-dim">{focus === "auto" ? "Each pass goes to whatever is shortest once the passes before it have landed." : "Three passes in four go there; the fourth to whatever is shortest."} Bars show how short each stock is for a town this size.</p>
          </div>
          {reqs.length > 0 && (
            <div className="tg-reqs">
              <p className="town-kicker">Requisitions today</p>
              <ul className="tg-people">
                {reqs.map((r) => {
                  const f = fields.find((x) => x.id === r.fieldId);
                  const got = Math.max(0, Math.min(r.need, (f ? passesOf(f) : r.from) - r.from));
                  return (
                    <li key={r.fieldId} className={r.done ? "" : undefined}>
                      <b>{r.done ? "✓ " : ""}{r.field}</b>{" "}
                      <span className="town-dim">— {r.done ? "filled" : `pass ${r.need - got} more of its reviews`}: {goodsText(r.reward)} ({STOCKS[r.stock].name.toLowerCase()})</span>
                      <span className="tg-restore"><i style={{ width: `${Math.round((got / r.need) * 100)}%` }} /></span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {carts.length > 0 && (
            <div>
              <p className="town-kicker">Carts today</p>
              <ul className="tg-carts">
                {carts.map((c) => {
                  // What it brings if cleared now, or at the first right answer; and where it next grows.
                  const at = Math.max(1, c.passes);
                  const step = cartAt(c, at);
                  const next = nextRollAt(c, at);
                  return (
                    <li key={c.fieldId}>
                      <b>{c.field} cart today ({c.rarity})</b>: {step ? goodsList(step.goods) : "nothing yet"}
                      {next ? <span className="town-dim"> · +1 load at {next} right answers</span> : null}
                    </li>
                  );
                })}
              </ul>
              <p className="town-dim">A cart comes when the Field has nothing left due and at least half of today&apos;s answers in it were right. Nothing in it is rolled: the day and the Field fix what it holds.</p>
            </div>
          )}
          <table className="tg-table">
            <thead><tr><th>Field</th><th>Ideas</th><th>Passed</th><th>Due</th><th>Streak</th><th>Today</th></tr></thead>
            <tbody>
              {fields.map((f) => {
                const tier = tierOf(f.streak);
                const next = TIERS[tier + 1];
                // Answers from the ledger, right and wrong; a card merely touched today (the midnight reschedule) is not one.
                const answered = passesOf(f) + (f.misses ?? 0);
                return (
                  <tr key={f.id} title={`Trains ${f.attrs.map((a) => ATTR_BUFFS[a].name.toLowerCase()).join(" and ") || "nothing yet"}`}>
                    <td>{f.name}<br /><span className="town-dim">{f.attrs.map((a) => ATTR_BUFFS[a].name).join(" · ")}</span></td>
                    <td>{f.ideasToday}{f.novelty !== undefined && f.ideasToday > 0 && f.novelty < f.ideasToday - 0.05 ? <><br /><span className="town-dim" title="Ideas count by how new they were: a near-duplicate in a crowded topic buffs the town less">worth {r1(f.novelty)}</span></> : null}{f.newDomains ? <><br /><span className="town-dim">{f.newDomains} new domain{f.newDomains > 1 ? "s" : ""}</span></> : null}</td>
                    <td title={f.passed ? f.passed.map((n, i) => `${n} ${DEPTH_NAMES[i]}`).join(" · ") : undefined}>
                      {passesOf(f)}{f.failed ? <span className="town-dim"> / {f.failed}✗</span> : null}
                      {f.mastered ? <><br /><span className="town-dim">{f.mastered} mastered</span></> : null}
                    </td>
                    <td className={f.overdue ? "warn-text" : ""}>{f.dueRemaining}{f.overdue ? ` (${f.overdue} overdue)` : ""}</td>
                    <td>{f.streak}d · {TIERS[tier].name}{next ? <><br /><span className="town-dim">{next.name} at {next.from}d</span></> : null}</td>
                    <td>{f.complete ? (paid.has(f.id) ? "✓ cart in" : "✓ cart coming") : answered ? `${answered} answered, ${f.dueRemaining} to go` : f.dueRemaining ? "not started" : "nothing due"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {mods.length > 0 && (
            <ul className="tg-people">
              {mods.map(([a, m]) => (
                <li key={a} className={(m ?? 0) < 0 ? "warn-text" : ""}>
                  <b>{ATTR_BUFFS[a as keyof typeof ATTR_BUFFS].name} {(m ?? 0) > 0 ? "+" : ""}{Math.round((m ?? 0) * 100)}%</b>{" "}
                  <span className="town-dim">{ATTR_BUFFS[a as keyof typeof ATTR_BUFFS].blurb}{(m ?? 0) < 0 ? " — turned against you by overdue cards" : ""}</span>
                </li>
              ))}
            </ul>
          )}
          {(k?.tithes?.length ?? 0) > 0 && (
            <p className="town-dim">Last tithes: {k!.tithes!.slice(0, 3).map((t) => `${t.field} (${t.passes} passed): ${t.got}`).join(" · ")}</p>
          )}
          {(k?.drops.length ?? 0) > 0 && (
            <p className="town-dim">Last carts: {k!.drops.slice(0, 3).map((d) => `${d.field} (${TIERS[d.tier].name.toLowerCase()}): ${d.got}`).join(" · ")}</p>
          )}
        </>
      )}
    </div>
  );
}

/** What the land has learnt about you, and what it means to do (§13). */
export function NemesisPanel({ s }: { s: GameState }) {
  const n = nemesisOf(s);
  const odds = tacticOdds(s);
  const top = TACTICS.map((t, i) => ({ t, p: odds[i] })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p).slice(0, 4);
  const m = n.model;
  const reads: string[] = [];
  if (m.ranged < 0.35) reads.push("your defence is mostly swords — fliers will come over");
  if (m.ranged > 0.7) reads.push("you trust your archers — expect armour");
  if (m.walls > 30) reads.push(`${m.walls} wall tiles — it will fly, burrow or break the thinnest`);
  if (m.coverage < 0.5) reads.push(`only ${pct(m.coverage)} of the town lies inside a tower's circle`);
  if (m.elite > 0.5) reads.push("a few champions hold the line — a swarm answers that");
  if (m.unlit > 0.15) reads.push(`${pct(m.unlit)} of your buildings stand dark`);
  if (m.foodDays > 5) reads.push(`${Math.round(m.foodDays)} days of food in store — burrowers smell it`);
  if (m.leverage > 0.7) reads.push(`a roof is at ${pct(Math.min(1, m.leverage))} of what its posts can bear`);
  if (m.hallWeak > 0.4 && s.time / 1440 >= 7) reads.push("the hall stands unguarded");
  return (
    <div className="tg-nemesis">
      <p className="town-kicker" style={{ marginTop: 12 }}>What the land has learnt about you</p>
      <p className="town-sub">
        It studies how you defend and learns what hurts you. Beat it cleanly and it presses harder (aim +{pct(n.pressure)}{n.winStreak ? `, ${n.winStreak} clean defence${n.winStreak > 1 ? "s" : ""} in a row` : ""});
        a ready wave waits for your worst hour — dark, whiteout, guards hurt, fuel short, Hope low.
        {n.stalk ? ` One is waiting now (${TACTIC_LABEL[n.stalk.tactic as Tactic]}), watching for its moment: the town's weakness is ${r1(vulnerability(s))} against the worst it has seen, ${r1(n.stalk.best)}.` : ""}
      </p>
      {reads.length > 0 && <ul className="tg-people">{reads.map((x) => <li key={x} className="town-dim">• {x}</li>)}</ul>}
      <table className="tg-table">
        <thead><tr><th>Its likely answer</th><th>Odds</th></tr></thead>
        <tbody>{top.map((x) => <tr key={x.t}><td>{TACTIC_LABEL[x.t]}</td><td>{pct(x.p)}</td></tr>)}</tbody>
      </table>
      {n.history.length > 0 && <p className="town-dim">Its record: {n.history.slice(0, 6).map((h) => `${h.tactic} ${pct(h.reward)}`).join(" · ")} (share of the damage it hoped to do).</p>}
    </div>
  );
}
