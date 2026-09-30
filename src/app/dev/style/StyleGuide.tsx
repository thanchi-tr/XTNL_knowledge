"use client";

/**
 * /dev/style (final-system.html). Every number on this page is a labelled
 * fixture, except the contrast and CVD tables, which are measured live from
 * the computed tokens of whichever theme is previewed.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Chip, ChipButton } from "@/components/ui/Chip";
import { Crest, EmblemCoin, Medallion } from "@/components/ui/Crest";
import { CurrencyGlyph, HeldGlyph, Icon, Sigil } from "@/components/ui/Icon";
import { Meter, SegmentStrip } from "@/components/ui/Meter";
import { useMotionPref } from "@/components/ui/MotionPrefs";
import { PricePill } from "@/components/ui/PricePill";
import { PromiseRing } from "@/components/ui/PromiseRing";
import { Receipt } from "@/components/ui/Receipt";
import { Sheet } from "@/components/ui/Sheet";
import { Segmented, SectionHeader, SkeletonCard, Switch, TabLinks } from "@/components/ui/Tabs";
import { Tick, type TickState } from "@/components/ui/Tick";
import { TypedConfirm } from "@/components/ui/TypedConfirm";
import { formatNumber } from "@/components/ui/format";
import { pushToast } from "@/components/ui/toast-store";
import { chime, clearLog, enqueue, getLog, getServerLog, mark, subscribeLog } from "@/lib/celebrate";
import { makeEvent, type MotionPref } from "@/lib/celebration-types";
import { MATERIALS, crestBandStarts } from "@/lib/materials";
import { bump, countTo } from "@/lib/motion";
import {
  LEDGER_DE_MIN,
  MARK_MIN,
  MARK_TOKENS,
  SURFACES,
  TEXT_MIN,
  TEXT_TOKENS,
  composite,
  contrast,
  deltaE,
  parseColor,
  toHex,
  type Rgb,
} from "./color-lab";
import { DevPresenter } from "./DevPresenter";
import "./style-guide.css";

// ─── live token tables ──────────────────────────────────────────────────────

function readToken(name: string, over?: Rgb): Rgb | null {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const c = parseColor(raw);
  if (!c) return null;
  return c.a < 1 && over ? composite(c, over) : c.rgb;
}

interface Tables {
  theme: string;
  swatches: { name: string; hex: string }[];
  rows: { name: string; use: string; min: number; ratios: number[] }[];
  cvd: { pair: string; n: number; p: number; d: number; need: number }[];
}

function measure(): Tables | null {
  const surfaces = SURFACES.map((s) => readToken(s));
  if (surfaces.some((s) => !s)) return null;
  const theme = document.documentElement.dataset.theme === "vellum" ? "Vellum (after launch)" : "Night";
  const vellum = theme.startsWith("Vellum");
  const text = vellum ? TEXT_TOKENS.filter((t) => t !== "--mp") : [...TEXT_TOKENS];
  const marks = vellum ? [...MARK_TOKENS, "--mp"] : [...MARK_TOKENS];
  const rows = [
    ...text.map((t) => ({ name: t, use: "text", min: TEXT_MIN })),
    ...marks.map((t) => ({ name: t, use: "non-text", min: MARK_MIN })),
  ].map((r) => ({ ...r, ratios: surfaces.map((bg) => contrast(readToken(r.name, bg!) ?? [0, 0, 0], bg!)) }));
  const swatches = [...SURFACES, ...TEXT_TOKENS, ...MARK_TOKENS].map((n) => ({ name: n, hex: toHex(readToken(n, surfaces[1]!) ?? [0, 0, 0]) }));
  const pairs: [string, string, string, number][] = [
    ["--xp", "--pts", "the two ledgers", LEDGER_DE_MIN],
    ["--pts", "--mp", "review pts vs MP", 0],
    ["--xp", "--mp", "life XP vs MP", 0],
    ["--kept", "--owed", "kept vs owed", 0],
    ["--kept", "--held", "kept vs held", 0],
    ["--owed", "--xp", "owed vs life XP", 0],
  ];
  const cvd = pairs.map(([a, b, pair, need]) => {
    const A = readToken(a) ?? [0, 0, 0];
    const B = readToken(b) ?? [0, 0, 0];
    return { pair, n: deltaE(A, B), p: deltaE(A, B, "protan"), d: deltaE(A, B, "deutan"), need };
  });
  return { theme, swatches, rows, cvd };
}

function TokenTables() {
  const [tables, setTables] = useState<Tables | null>(null);
  useEffect(() => {
    const run = () => setTables(measure());
    run();
    const mo = new MutationObserver(run);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  if (!tables) return <SkeletonCard lines={6} />;
  return (
    <>
      <section>
        <SectionHeader title="Tokens · live contrast" aside={tables.theme} />
        <div className="sg-grid">
          {tables.swatches.map((s) => (
            <div key={s.name} className="sg-tok">
              <span className="sg-sw" style={{ background: `var(${s.name})` }} />
              <div>
                <b>{s.name.slice(2)}</b>
                <span className="t-mono ink-2">{s.hex}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="card sg-scroll" style={{ marginTop: 12 }}>
          <table className="sg-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Use</th>
                {SURFACES.map((s) => (
                  <th key={s}>{s.slice(2)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tables.rows.map((r) => (
                <tr key={r.name}>
                  <td>{r.name.slice(2)}</td>
                  <td>{r.use}</td>
                  {r.ratios.map((v, i) => (
                    <td key={i} className={v >= r.min ? "ok" : "bad"}>
                      {v.toFixed(2)}
                      {v < r.min ? " fails" : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="t-meta" style={{ marginTop: 8 }}>
          Text needs 4.5 on every surface it can sit on; non-text marks and control borders need 3. scripts/contrast-check.ts asserts
          the same numbers from tokens.css.
        </p>
      </section>
      <section>
        <SectionHeader title="Colour-vision distance" aside="OKLab ΔE × 100, Machado simulation" />
        <div className="card sg-scroll">
          <table className="sg-table">
            <thead>
              <tr>
                <th>Pair</th>
                <th>Normal</th>
                <th>Protan</th>
                <th>Deutan</th>
              </tr>
            </thead>
            <tbody>
              {tables.cvd.map((c) => (
                <tr key={c.pair}>
                  <td>{c.pair}</td>
                  <td>{c.n.toFixed(1)}</td>
                  <td className={c.need && c.p < c.need ? "bad" : undefined}>{c.p.toFixed(1)}</td>
                  <td className={c.need && c.d < c.need ? "bad" : undefined}>{c.d.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="t-meta" style={{ marginTop: 8 }}>
          The two ledgers must stay ≥ 8 apart under protan and deutan. Every hue is paired with a glyph anyway: spark, lozenge, hex nut;
          check, rail, hatch.
        </p>
      </section>
    </>
  );
}

// ─── fixtures ───────────────────────────────────────────────────────────────

function DemoArt({ hue = "#00cc7a", sides = 5 }: { hue?: string; sides?: number }) {
  const pts = Array.from({ length: sides }, (_, i) => {
    const a = ((-90 + (360 / sides) * i) * Math.PI) / 180;
    return `${(50 + 30 * Math.cos(a)).toFixed(1)},${(50 + 30 * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
      <polygon points={pts} fill={`${hue}1f`} stroke={hue} strokeWidth={5} strokeLinejoin="round" />
    </svg>
  );
}

const RECEIPT_FIXTURE = {
  amount: 22.0,
  source: "Craft",
  factors: [
    { key: "band", label: "Band", detail: "45 min · base 20", mult: 1 },
    { key: "effort", label: "Effort", detail: "Hard", mult: 1.1 },
    { key: "timing", label: "Timing", detail: "On time", mult: 1 },
    { key: "streak", label: "Streak", detail: "Day 23", mult: 1.05 },
    { key: "repeat", label: "Repeat", detail: "2nd today", mult: 0.95 },
    { key: "volume", label: "Volume", detail: "Under the knee", mult: 1 },
    { key: "mode", label: "Mode", detail: "Planned", mult: 1 },
  ],
  formula: "20 base × factors = 22.0",
  note: "Fixture. The day's knee: after 90 minutes of one kind, each further minute pays a little less.",
};

// ─── the page ───────────────────────────────────────────────────────────────

export function StyleGuide() {
  const { prefs, motion, setPref } = useMotionPref();
  const [preview, setPreview] = useState<"night" | "vellum">("night");
  const [ticks, setTicks] = useState<TickState[]>(["open", "open", "done", "done", "minimum"]);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [centerOpen, setCenterOpen] = useState(false);
  const [sw, setSw] = useState(true);
  const [seg, setSeg] = useState<"day" | "week" | "month">("week");
  const [filter, setFilter] = useState(true);
  const [ring, setRing] = useState({ value: 2, glint: false });
  const [xp, setXp] = useState(0);
  const clicks = useRef(0);
  const pillRef = useRef<HTMLButtonElement | null>(null);
  const xpRef = useRef<HTMLElement | null>(null);
  const xpGlyphRef = useRef<HTMLSpanElement | null>(null);
  const ledgerRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const log = useSyncExternalStore(subscribeLog, getLog, getServerLog);

  useEffect(() => {
    if (xpRef.current && !xpRef.current.textContent) xpRef.current.textContent = formatNumber(0);
  }, []);

  // Theme preview: attribute only, restored on leave (it never writes the saved pref).
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", preview);
    return () => root.setAttribute("data-theme", prefs.theme);
  }, [preview, prefs.theme]);

  const t0 = () => {
    const from = xp;
    const to = Number((xp + 4.2).toFixed(1));
    setXp(to);
    void mark({ kind: "tick", id: `demo-tick-${++clicks.current}`, text: "Fixture: kept Demo row, paid 4.2 life XP exactly", amount: { kind: "xp", value: 4.2 }, from: pillRef.current, to: xpRef.current }).then(() => {
      countTo(xpRef.current, from, to);
      bump(xpGlyphRef.current);
    });
  };
  const t1 = () => {
    setRing({ value: 3, glint: true });
    window.setTimeout(() => setRing((r) => ({ ...r, glint: false })), 1000);
    chime({ kind: "ring-closed", id: `demo-ring-${++clicks.current}`, text: "Musts kept (fixture)", sweepEl: ledgerRef.current, burstEl: ringRef.current, ringEl: ringRef.current });
  };
  const t2 = () =>
    enqueue(
      makeEvent(
        "track-level",
        `demo-seal-${++clicks.current}`,
        {
          eyebrow: "Track level · fixture",
          title: "Duty reached level 12",
          lines: ["Sunday's kept week lifted the depth cap to 12."],
          numeral: { from: 11, to: 12 },
          material: "silver",
          amounts: [{ kind: "mp", value: 1.5, label: "MP" }],
        },
        [
          { label: "Character", value: "86% → 91%" },
          { label: "Duty kept weeks", value: "9 in a row" },
        ]
      )
    );
  const t3 = () =>
    enqueue(
      makeEvent(
        "band",
        `demo-ascend-${++clicks.current}`,
        {
          eyebrow: "Band re-forge",
          kicker: "Bronze · fixture",
          title: "Practitioner",
          epithet: "of the Deep Archive",
          lore: "Knowledge used, not merely stored.",
          grants: ["The crest is re-forged in bronze everywhere in the shell."],
          cause: "Character level 15, reached when Statistics reached level 9.",
          numeral: { from: 14, to: 15 },
          material: "bronze",
          art: { type: "crest", level: 15, material: "bronze" },
        },
        [{ label: "Character", value: "L14 → L15" }]
      )
    );

  const motionOptions: { value: MotionPref; label: string }[] = [
    { value: "system", label: "System" },
    { value: "full", label: "Full" },
    { value: "calm", label: "Calm" },
    { value: "still", label: "Still" },
  ];

  return (
    <div className="page cq-main sg">
      <DevPresenter />
      <section>
        <h2 className="t-display-m">Colour grammar</h2>
        <p className="t-meta" style={{ marginTop: 4 }}>
          One meaning per family. Ink = structure. Signal = state in time. Currency = which ledger. Material = rarity, depth, band. Light =
          earned, now. Attribute hues (attribute-themes.ts, unchanged) live only inside emblems, radar vertices and path headers.
        </p>
        <div className="sg-row" style={{ marginTop: 12 }}>
          <span className="t-meta">Preview theme</span>
          <Segmented
            label="Preview theme"
            value={preview}
            options={[
              { value: "night", label: "Night" },
              { value: "vellum", label: "Vellum" },
            ]}
            onChange={setPreview}
          />
          <span className="t-meta">Motion (your real pref)</span>
          <Segmented label="Motion" value={prefs.motion} options={motionOptions} onChange={(v) => setPref("motion", v)} />
          <span className="t-meta">now: {motion}</span>
        </div>
      </section>

      <TokenTables />

      <section>
        <SectionHeader title="Type roles" />
        <div className="card pad-l sg-col">
          <div className="t-display-xl">Display XL · ceremony</div>
          <div className="t-display-l">Display L · Adept</div>
          <div className="t-epithet">Epithet · of the Deep Archive</div>
          <div className="t-display-m">Display M · card and sheet titles</div>
          <div className="t-question">Question · what does the p-value measure?</div>
          <div className="t-display-s">Display S · top-bar title</div>
          <div className="t-numeral">1,346 · 23 · +6.4</div>
          <div className="t-body-l">Body L · row titles and answers</div>
          <div>Body · 15/1.45 for everything else.</div>
          <div className="t-meta">Meta · 13/18, ink-2</div>
          <div className="t-eyebrow">Eyebrow · caps, 12</div>
          <div className="t-mono">Mono · 4.2 base × 1.15 combo × 1.32 focus</div>
        </div>
      </section>

      <section>
        <SectionHeader title="Primitives" aside="fixtures" />
        <div className="sg-grid sg-wide">
          <Spec label="Button · five voices">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="quiet">Quiet</Button>
            <Button variant="gold">Unlock</Button>
            <Button variant="danger">Reset…</Button>
            <Button variant="primary" size="lg" kbd="R" icon="study">
              Start review
            </Button>
            <IconButton icon="bell" label="Asks: 3 waiting (fixture)">
              <Badge count={3} pinned />
            </IconButton>
          </Spec>
          <Spec label="Chip · one dialect">
            <Chip>Quiet</Chip>
            <Chip tone="kept">Kept</Chip>
            <Chip tone="owed">−3.8 owed</Chip>
            <Chip tone="held" held="freeze">
              Freeze
            </Chip>
            <Chip tone="ready">Ready</Chip>
            <ChipButton pressed={filter} onClick={() => setFilter((f) => !f)}>
              Filter · 40
            </ChipButton>
          </Spec>
          <Spec label="Currency · glyph + hue + figure">
            <Amount kind="xp" value={12.3} sign="none" label="life XP" />
            <Amount kind="pts" value={29.6} sign="none" label="review pts" />
            <Amount kind="mp" value={1346} dp={0} sign="none" label="MP" />
            <Amount kind="xp" value={-3.8} label="owed" />
          </Spec>
          <Spec label="Badge · ink asks, owed only for debt, nothing at 0">
            <Badge count={3} />
            <Badge count={17} />
            <Badge count={1} tone="owed" />
            <Badge count={0} />
            <span className="t-meta">(0 renders nothing)</span>
          </Spec>
          <Spec label="Tick · todo, must, done, minimum">
            {ticks.map((t, i) => (
              <Tick
                key={i}
                shape={i % 2 === 1 ? "diamond" : "circle"}
                state={t}
                label={`Fixture row ${i + 1}`}
                onClick={() => setTicks((all) => all.map((s, j) => (j === i ? (s === "open" ? "done" : "open") : s)))}
              />
            ))}
          </Spec>
          <Spec label="Price pill · open → paid (tap for the receipt)">
            <PricePill value={8.3} subject="Fixture row" onClick={() => setReceiptOpen(true)} expanded={receiptOpen} controls="sg-receipt" />
            <PricePill value={8.3} paid subject="Fixture row" onClick={() => setReceiptOpen(true)} />
            <PricePill value={6.4} paid kind="pts" subject="Fixture card" onClick={() => setReceiptOpen(true)} />
          </Spec>
          <Spec label="Meter · banked, this week's gain, cap" col>
            <Meter value={0.62} gain={{ value: 0.72, kind: "xp" }} cap={0.88} label="Fixture: Duty 62% banked, 72% with this week" />
            <Meter value={0.44} gain={{ value: 0.52, kind: "pts" }} label="Fixture: Knowledge 44% banked" />
            <Meter value={0.86} thin label="Fixture: 86% to level 15" />
          </Spec>
          <Spec label="Segment strip · on, miss (hatched), current" col>
            <SegmentStrip tall segs={["on", "on", "miss", "on", "cur", "off"]} label="Fixture: 3 of 6 correct, 1 missed" />
          </Spec>
          <Spec label="Promise ring · 0, partial, closed, calibrating, lap">
            <PromiseRing value={0} target={3} label="Musts (fixture)" />
            <PromiseRing value={6} target={15} label="Quest (fixture)" showCount />
            <PromiseRing value={1} target={1} label="Life deed (fixture)" />
            <PromiseRing value={9} target={28} dashed label="Calibrating (fixture)" />
            <PromiseRing value={150} target={150} lap={240} size={64} label="Move (fixture)" />
          </Spec>
          <Spec label="Crest · band materials (1–14, 15–27, 28–45, 46–69, 70+)">
            {MATERIALS.map((m) => (
              <Crest key={m} level={Math.max(crestBandStarts[m], 14)} material={m} size={44} label={`${m} crest`} />
            ))}
            <Crest level={14} size={80} tracks={{ body: 0.55, duty: 0.8, craft: 0.62, care: 0.4 }} label="Crest with track edges (fixture)" />
            <Crest level={null} size={38} label="No data yet" />
          </Spec>
          <Spec label="Emblem coin · rank rim, depth notches · owned, locked, ready">
            {(["PURE", "SYNERGY", "CAPSTONE", "APEX", "ULTIMATE"] as const).map((r, i) => (
              <EmblemCoin key={r} rank={r} depth={[3, 6, 10, 13, 15][i]} size={48} label={`${r} coin`}>
                <DemoArt />
              </EmblemCoin>
            ))}
            <EmblemCoin rank="APEX" depth={8} state="locked" percent={64} size={48} label="Locked coin, 64% (fixture)">
              <DemoArt hue="#4d9cf5" sides={6} />
            </EmblemCoin>
            <EmblemCoin rank="APEX" depth={8} state="ready" size={48} label="Ready coin (fixture)">
              <DemoArt />
            </EmblemCoin>
            <Medallion material="gold" numeral={7} size={48} label="Gold medallion 7" />
          </Spec>
          <Spec label="Held glyphs · always with a word">
            <Chip tone="held" held="freeze">
              Freeze
            </Chip>
            <Chip tone="held" held="rest">
              Rest
            </Chip>
            <Chip tone="held" held="sick">
              Sick
            </Chip>
            <Chip tone="held" held="away">
              Vacation
            </Chip>
          </Spec>
          <Spec label="Track sigils · shape, never hue">
            {(
              [
                ["body", "Body"],
                ["duty", "Duty"],
                ["craft", "Craft"],
                ["care", "Care"],
                ["know", "Knowledge"],
              ] as const
            ).map(([k, l]) => (
              <span key={k} className="cur">
                <Sigil track={k} />
                {l}
              </span>
            ))}
          </Spec>
          <Spec label="Icons · 24 px stroke sprite">
            {(["today", "study", "train", "plus", "bell", "inbox", "clock", "undo", "gear", "lock", "replay", "search", "flame"] as const).map((n) => (
              <Icon key={n} name={n} label={n} />
            ))}
            <CurrencyGlyph kind="xp" label />
            <CurrencyGlyph kind="pts" label />
            <CurrencyGlyph kind="mp" label />
            <HeldGlyph kind="freeze" />
          </Spec>
          <Spec label="Tabs · segmented · switch" col>
            <TabLinks
              label="Fixture tabs"
              current="/dev/style"
              items={[
                { href: "/dev/style", label: "Style" },
                { href: "/dev/style/art", label: "Art (L4)" },
              ]}
            />
            <Segmented
              label="Range (fixture)"
              value={seg}
              options={[
                { value: "day", label: "Day" },
                { value: "week", label: "Week" },
                { value: "month", label: "Month" },
              ]}
              onChange={setSeg}
            />
            <label className="sg-row">
              <Switch checked={sw} onChange={setSw} label="Rest tomorrow (fixture)" />
              <span>Rest tomorrow</span>
            </label>
          </Spec>
          <Spec label="Sheet · drawer, centred 560 · toast" >
            <Button variant="secondary" onClick={() => setReceiptOpen(true)}>
              Receipt sheet
            </Button>
            <Button variant="secondary" onClick={() => setCenterOpen(true)}>
              Centred dialog
            </Button>
            <Button
              variant="secondary"
              onClick={() => pushToast({ title: "Kept 08:05 (fixture)", body: "Paid 3.6 exactly.", action: { label: "Undo", onAction: () => undefined }, holdMs: 10000 })}
            >
              Toast with Undo
            </Button>
            <Button variant="secondary" onClick={() => pushToast({ title: "Musts kept (fixture)", ring: true })}>
              Toast with a closing ring
            </Button>
          </Spec>
          <Spec label="Skeleton · static, no shimmer" col>
            <SkeletonCard lines={2} />
          </Spec>
          <Spec label="Danger · typed-phrase confirm" col>
            <TypedConfirm phrase="reset demo" action="Reset demo (does nothing)" onConfirm={() => pushToast({ title: "Nothing was reset (fixture)" })} />
          </Spec>
        </div>
      </section>

      <section>
        <SectionHeader title="Reward ladder · playground" aside="deterministic, logged, skippable" />
        <div className="card sg-ledger" ref={ledgerRef}>
          <PricePill ref={pillRef} value={4.2} subject="Demo row" />
          <div ref={ringRef}>
            <PromiseRing value={ring.value} target={3} glint={ring.glint} label="Musts (fixture)" />
          </div>
          <span style={{ flex: 1 }} />
          <span className="cur t-numeral-s">
            <span ref={xpGlyphRef} style={{ display: "inline-flex" }}>
              <CurrencyGlyph kind="xp" size={16} />
            </span>
            {/* Text written by effect/countTo, not React: countTo rewrites it in place. */}
            <b ref={xpRef} className="num" data-ledger-target="xp" />
          </span>
        </div>
        <div className="sg-row" style={{ marginTop: 10 }}>
          <Button variant="secondary" onClick={t0}>
            T0 Mark
          </Button>
          <Button variant="secondary" onClick={t1}>
            T1 Chime
          </Button>
          <Button variant="secondary" onClick={t2}>
            T2 Seal
          </Button>
          <Button variant="secondary" onClick={t3}>
            T3 Ascension
          </Button>
        </div>
        <div className="card sg-scroll" style={{ marginTop: 12 }}>
          <table className="sg-table">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Fires on</th>
                <th>Looks like</th>
                <th>Budget</th>
                <th>Sound · haptic</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>0 · Mark</td>
                <td>tick, correct answer, capture saved, equip, make-up paid, idea created, RPE rated</td>
                <td>check draws; ≈ becomes exact; the +N token flies to its own ledger (Full only); count-up</td>
                <td>≤ 700 ms, in place, 0 particles</td>
                <td>1318 Hz · 8 ms</td>
              </tr>
              <tr>
                <td>1 · Chime</td>
                <td>first deed (day kept), a promise ring closes, Full day, lane kept, quest cleared, nothing owed, repair, yesterday settled</td>
                <td>seal lights or a KEPT stamp lands; one glint; light sweep; seeded burst of 8</td>
                <td>&lt; 1 s, in place</td>
                <td>2 notes · 12-40-18</td>
              </tr>
              <tr>
                <td>2 · Seal</td>
                <td>domain / field / track / character level in band, idea mastered, habit rung, streak 7·30·100·365, kept week, PR, boss won, Short or Mid goal</td>
                <td>medallion in the band&apos;s material, rolling numeral, 14 motes, the exact points, &quot;What moved&quot;</td>
                <td>hold ≤ 1.4 s (mastery 2.2 s), then dismissible; merges into the recap</td>
                <td>3 notes · 14-50-22-50-40</td>
              </tr>
              <tr>
                <td>3 · Ascension</td>
                <td>title change, band re-forge, emblem unlock (MP spent), Long goal, first Ultimate</td>
                <td>opaque night curtain; art flies in; rim draws; notches; flash, ring, ≤ 26 motes; slow rays; grants, cost, cause</td>
                <td>settles ≤ 2 s; skippable from frame 1; plays once (shownAt)</td>
                <td>4 notes · 20-80-20-80-40-120-60</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionHeader title="Motion tokens" />
        <div className="card sg-scroll">
          <table className="sg-table">
            <tbody>
              <tr>
                <td>press 90 · quick 160 · base 240 · slow 420 · flight 560–640 · seal hold ≤ 1400 · ceremony ≤ 2000</td>
              </tr>
              <tr>
                <td>out (.16,1,.3,1) default · in-out (.65,0,.35,1) sweeps · stamp (.34,1.56,.64,1) pops and rolls</td>
              </tr>
              <tr>
                <td>Only transform, opacity and stroke-dashoffset animate. Two ambient loops exist: the ready-emblem orbit (14 s) and the ceremony rays (90 s), both on --ambient-play.</td>
              </tr>
              <tr>
                <td>Full · Calm (opacity only, ≤ 260 ms, no flights or particles) · Still (nothing moves; every rule rests on its final state). Default follows prefers-reduced-motion.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionHeader title="Celebration log" aside={<Button variant="quiet" onClick={clearLog}>Clear</Button>} />
        <pre className="sg-log" aria-live="off">
          {log.length === 0
            ? "(nothing yet)"
            : log
                .slice(-40)
                .map((e) => `${new Date(e.at).toTimeString().slice(0, 8)}  T${e.tier} ${e.kind}  ${e.text}`)
                .join("\n")}
        </pre>
      </section>

      <Sheet open={receiptOpen} onClose={() => setReceiptOpen(false)} title="Receipt" description="Fixture: Thesis outline §3" id="sg-receipt">
        <Receipt {...RECEIPT_FIXTURE} version="fixture" howHref="/today/rules" />
      </Sheet>
      <Sheet open={centerOpen} onClose={() => setCenterOpen(false)} title="Capture (centred 560)" description="The centred dialog variant from 600 px." variant="center">
        <input className="input" placeholder="A fixture line" data-autofocus aria-label="Fixture capture line" />
      </Sheet>
    </div>
  );
}

function Spec({ label, children, col }: { label: string; children: React.ReactNode; col?: boolean }) {
  return (
    <div className="card sg-spec">
      <span className="t-mono ink-2">{label}</span>
      <div className={col ? "sg-col" : "sg-row"}>{children}</div>
    </div>
  );
}
