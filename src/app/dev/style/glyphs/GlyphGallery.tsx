"use client";

/**
 * /dev/style/glyphs (ui-motion.md §9.1, lane M0a): every glyph in idle, active
 * and done, each motion playable under the level the URL names
 * (?motion=full|calm|still, ?theme=night|vellum: attribute previews, restored
 * on leave; the saved prefs are never written), and the composites at the
 * 278 px content width of a card at 344. Every figure is made up.
 *
 * window.__xtnlGlyphCalls records each animate() call the gateway makes on this
 * page (keyframe properties, duration, delay, fill), for ui-audit's gateway probe.
 */
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MOTION_LICENCE, playGlyph, type GlyphMotion, type PlayGlyphOptions } from "@/lib/glyph-motion";
import { CapacityGauge } from "@/components/glyph/CapacityGauge";
import { Glyph, GlyphButton, KindGlyph, ProvMark, PROVMARK_WORDS, QUEST_KINDS, type ProvMarkClass, type QuestKind } from "@/components/glyph/Glyph";
import { GlyphDefs } from "@/components/glyph/GlyphDefs";
import { GlyphLane } from "@/components/glyph/GlyphLane";
import { Fig, GlyphStat, StatRow } from "@/components/glyph/GlyphStat";
import { Chips, HONESTY_KINDS, HONESTY_KIND_NAMES, HonestyChip, VERDICT_WORDS, VerdictChip, type VerdictKey } from "@/components/glyph/HonestyChip";
import { CardKey, InfoTip } from "@/components/glyph/InfoTip";
import { PipStrip } from "@/components/glyph/PipStrip";
import { RankSeal, RANK_SIZES } from "@/components/glyph/RankSeal";
import { RouteRail } from "@/components/glyph/RouteRail";
import { StageLadder } from "@/components/glyph/StageLadder";
import { TimeBar } from "@/components/glyph/TimeBar";
import { FAMILY_NAMES, GLYPH_INFO, type FamilyId, type GlyphName, type GlyphState } from "@/components/glyph/paths";
import { GLYPH_MEANS } from "@/components/glyph/paths/means";
import { RANK_WORDS } from "@/components/glyph/paths/rank";
import { LEVELS, PIP_DAYS, RAIL_NODES, STATS, STATS_CALIBRATING, STRIP_NODES, THEMES, TIMEBARS, TOPIC_RAIL_NODES, motionOfGlyph, type GalleryLevel, type GalleryTheme } from "./fixtures";
import "./glyphs.css";

const STATES: readonly GlyphState[] = ["idle", "active", "done"];
const FAMILIES: readonly { id: FamilyId; title: string; note: string }[] = [
  { id: "stage", title: "Stage · the cairn", note: "inline · build (SEEN)" },
  { id: "rank", title: "Rank · the medallion", note: "inline · rank-rise (SEEN)" },
  { id: "quest", title: "Quest kinds", note: "inline · quest-done (SEEN), drawn by KindGlyph" },
  { id: "evidence", title: "Evidence", note: "static · <use> into GlyphDefs" },
  { id: "provenance", title: "Provenance", note: "Gemini glyphs inline (pv-confirm, ACT); ProvMark glyphs static" },
  { id: "safety", title: "Honesty and safety", note: "static at every level" },
  { id: "session", title: "Session kinds", note: "static; struck = avoided" },
  { id: "verdict", title: "Verdicts", note: "inline · verdict-change (ACT); no done state; v.unv never moves" },
  { id: "time", title: "Time and pace", note: "static, ink" },
  { id: "misc", title: "Misc", note: "inline" },
  { id: "flame", title: "Flame (phase 3)", note: "inline · kindle (SEEN); idle unlit, active lit, done kept" },
  // Revision 5, lane 9 (ui-motion.md §15.1)
  { id: "layer", title: "Layer · the topic map", note: "inline · layer-open (SEEN); never dashed; locked is ink-mute beside m.builds" },
  { id: "goal", title: "Goal seats", note: "static · <use> into GlyphDefs (the goal family)" },
];

interface CallRecord {
  keys: string[];
  duration: number | null;
  delay: number | null;
  fill: string | null;
  iterations: number | null;
}

type Animate = (this: Element, frames: Keyframe[] | PropertyIndexedKeyframes | null, opts?: number | KeyframeAnimationOptions) => Animation;

/** Records the gateway's animate() calls while the gallery is mounted (dev only). */
function useCallRecorder(onCall: (n: number) => void) {
  useEffect(() => {
    const proto = Element.prototype as unknown as { animate: Animate };
    const orig = proto.animate;
    const log: CallRecord[] = [];
    (window as unknown as { __xtnlGlyphCalls?: CallRecord[] }).__xtnlGlyphCalls = log;
    proto.animate = function (this: Element, frames, opts) {
      const list = Array.isArray(frames) ? frames : [];
      const o = typeof opts === "object" && opts ? opts : {};
      log.push({
        keys: [...new Set(list.flatMap((f) => Object.keys(f).filter((k) => k !== "offset" && k !== "easing" && k !== "composite")))],
        duration: typeof o.duration === "number" ? o.duration : null,
        delay: typeof o.delay === "number" ? o.delay : null,
        fill: typeof o.fill === "string" ? o.fill : null,
        iterations: typeof o.iterations === "number" ? o.iterations : null,
      });
      onCall(log.length);
      return orig.call(this, frames, opts);
    };
    return () => {
      proto.animate = orig;
    };
  }, [onCall]);
}

function Play({ label, onPlay }: { label: string; onPlay: () => void }) {
  return (
    <button type="button" className="gxl-play" aria-label={label} onClick={onPlay}>
      <Glyph name="pace.on" size={16} inherit />
    </button>
  );
}

export function GlyphGallery({ level, theme }: { level: GalleryLevel | null; theme: GalleryTheme | null }) {
  const [calls, setCalls] = useState(0);
  const [accent, setAccent] = useState(false);
  useCallRecorder(setCalls);

  // attribute previews, restored on leave (they never write the saved prefs)
  useEffect(() => {
    const root = document.documentElement;
    const m = root.getAttribute("data-motion");
    const t = root.getAttribute("data-theme");
    if (level) root.setAttribute("data-motion", level);
    if (theme) root.setAttribute("data-theme", theme);
    return () => {
      if (m != null) root.setAttribute("data-motion", m);
      if (t != null) root.setAttribute("data-theme", t);
    };
  }, [level, theme]);

  const play = (el: Element | null | undefined, motion: GlyphMotion, o: Omit<PlayGlyphOptions, "licence"> = {}) =>
    void playGlyph(el, motion, { ...o, licence: MOTION_LICENCE[motion], accent: accent && MOTION_LICENCE[motion] === "SEEN" });
  const href = (l: GalleryLevel | null, t: GalleryTheme | null) => {
    const q = [l && `motion=${l}`, t && `theme=${t}`].filter(Boolean).join("&");
    return `/dev/style/glyphs${q ? `?${q}` : ""}`;
  };

  return (
    <div className="page gxl">
      <GlyphDefs route="gx" />
      <header className="gxl-head">
        <h1 className="t-display-m">Glyphs</h1>
        <p className="t-meta">
          The ui-motion glyph set (§4): 24 × 24, currentColor, states told apart by shape. Each motion plays under the level in the URL. Fixtures only.
        </p>
        <nav className="gxl-bar" aria-label="Motion level and theme">
          {LEVELS.map((l) => (
            <Link key={l} className="chip btn-chip" aria-current={level === l ? "page" : undefined} href={href(l, theme)}>
              {l}
            </Link>
          ))}
          {THEMES.map((t) => (
            <Link key={t} className="chip btn-chip" aria-current={theme === t ? "page" : undefined} href={href(level, t)}>
              {t}
            </Link>
          ))}
          <button type="button" className="chip btn-chip" aria-pressed={accent} onClick={() => setAccent((a) => !a)}>
            In view at hydration
          </button>
          <span className="t-meta gxl-calls" aria-live="polite">
            animate() calls: {calls}
          </span>
        </nav>
      </header>

      <section className="gxl-sec" aria-labelledby="gxl-glyphs">
        <h2 id="gxl-glyphs" className="t-eyebrow">
          Every glyph × idle · active · done
        </h2>
        {FAMILIES.map((f) => (
          <div key={f.id} className="gxl-fam">
            <h3 className="gxl-fh">
              {f.title} <span className="t-meta">{f.note}</span>
            </h3>
            <div className="gxl-grid">
              {FAMILY_NAMES[f.id].map((name) => (
                <GlyphTile key={name} name={name} play={play} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="gxl-sec" aria-labelledby="gxl-comp">
        <h2 id="gxl-comp" className="t-eyebrow">
          Composites at 278 px (a card at 344)
        </h2>
        <Composites play={play} />
      </section>
    </div>
  );
}

type PlayFn = (el: Element | null | undefined, motion: GlyphMotion, o?: Omit<PlayGlyphOptions, "licence">) => void;

function GlyphTile({ name, play }: { name: GlyphName; play: PlayFn }) {
  const refs = useRef<Record<string, Element | null>>({});
  const motion = motionOfGlyph(name);
  const fam = GLYPH_INFO[name].family;
  const rankIndex = fam === "rank" ? Number(name.slice(5)) : 0;
  const kind = fam === "quest" ? (QUEST_KINDS.find((k) => `quest.${{ raise: "bring", add: "add", practice: "practice", step: "step", checkpoint: "checkpoint" }[k]}` === name) as QuestKind) : null;
  const run = () => {
    if (!motion) return;
    if (motion === "pv-confirm") return play(refs.current.extra?.querySelector("svg"), motion);
    if (motion === "unlock") return play(refs.current.extra, motion);
    if (motion === "rank-rise") return play(refs.current.done, motion, { name: RANK_WORDS[rankIndex], seed: `aimrank:gallery:${rankIndex}` });
    if (motion === "seal-reached" || motion === "bars") return play(refs.current.idle, motion);
    if (motion === "verdict-change") return play(refs.current.active, motion);
    play(refs.current.done, motion);
    if (motion === "build") play(refs.current.active, motion);
  };
  return (
    <div className="gxl-tile">
      <div className="gxl-th">
        <code>{name}</code>
        <span className="t-meta">{GLYPH_MEANS[name]}</span>
      </div>
      <div className="gxl-states">
        {STATES.map((s) => (
          <figure key={s} ref={(el) => void (refs.current[s] = kind ? el?.querySelector(".mg-kg") ?? null : el?.querySelector("svg") ?? null)}>
            <span className="gxl-cell">{kind ? <KindGlyph kind={kind} state={s} size={24} defs="gx" /> : <Glyph name={name} state={s} size={24} defs="gx" />}</span>
            <figcaption>{s}</figcaption>
          </figure>
        ))}
        {(motion === "pv-confirm" || motion === "unlock") && (
          <figure ref={(el) => void (refs.current.extra = el?.querySelector("svg") ?? null)}>
            <span className="gxl-cell">{motion === "pv-confirm" ? <ProvMark cls="checked" size={24} confirming /> : <Glyph name="m.lock" state="idle" size={24} open />}</span>
            <figcaption>{motion === "pv-confirm" ? "checked" : "open"}</figcaption>
          </figure>
        )}
        {name.startsWith("sess.") && (
          <figure>
            <span className="gxl-cell">
              <Glyph name={name} size={24} defs="gx" struck />
            </span>
            <figcaption>struck</figcaption>
          </figure>
        )}
      </div>
      {motion && <Play label={`Play ${motion} on ${name}`} onPlay={run} />}
    </div>
  );
}

function Box({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <div className="gxl-frame">
      <div className="gxl-card">
        <h3 className="gxl-fh">{title}</h3>
        {note && <p className="t-meta">{note}</p>}
        {children}
      </div>
    </div>
  );
}

const PROV_CLASSES = Object.keys(PROVMARK_WORDS) as ProvMarkClass[];
const VERDICTS = Object.keys(VERDICT_WORDS) as VerdictKey[];

function Composites({ play }: { play: PlayFn }) {
  const [depth, setDepth] = useState(12);
  const [startTick, setStartTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pay, setPay] = useState(6);
  const kgRef = useRef<HTMLDivElement>(null);
  const sealRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const topicRailRef = useRef<HTMLDivElement>(null);
  const tbRef = useRef<HTMLDivElement>(null);
  const payRef = useRef<HTMLSpanElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const tickRef = useRef<SVGSVGElement>(null);
  return (
    <div className="gxl-comp">
      <Box title="KindGlyph" note="Quest glyph + evidence badge; done adds the check badge.">
        <div ref={kgRef} className="gxl-row">
          {QUEST_KINDS.map((k) => (
            <span key={k} className="gxl-col">
              {STATES.map((s) => (
                <KindGlyph key={s} kind={k} state={s} defs="gx" track="craft" />
              ))}
            </span>
          ))}
        </div>
        <Play label="Play quest-done on the done row" onPlay={() => kgRef.current?.querySelectorAll('.mg-kg[data-s="done"]').forEach((el) => play(el, "quest-done"))} />
      </Box>

      <Box title="ProvMark" note="Glyph only; the exact words are sr-only.">
        <div className="gxl-row">
          {PROV_CLASSES.map((c) => (
            <span key={c} className="gxl-lab">
              <ProvMark cls={c} defs="gx" />
              <span className="t-meta">{c}</span>
            </span>
          ))}
        </div>
      </Box>

      <Box title="HonestyChip, every kind" note="Static chips read their full string once; button chips open it.">
        <Chips>
          {HONESTY_KIND_NAMES.map((k) =>
            HONESTY_KINDS[k].button ? (
              <HonestyChip key={k} kind={k} wrap full={`Fixture: the full text behind the ${k} chip.`} defs="gx" />
            ) : (
              <HonestyChip key={k} kind={k} wrap defs="gx" />
            )
          )}
        </Chips>
      </Box>

      <Box title="VerdictChip" note="A verdict glyph sits only here, with its word.">
        <Chips>
          {VERDICTS.map((v) => (
            <VerdictChip key={v} verdict={v} />
          ))}
          <VerdictChip verdict="FITS" unverified />
          <VerdictChip verdict="TIGHT" unverified chosen />
        </Chips>
      </Box>

      <Box title="GlyphStat, StatRow, Fig" note="Compact text aria-hidden; the spoken twin sr-only.">
        <StatRow items={STATS} />
        <StatRow items={STATS_CALIBRATING} />
        <p className="gxl-line">
          <GlyphStat glyph="t.span" value={110} unit="d" label="review gap" estimate />
          <GlyphStat glyph="ev.measured" value="09:12" at="09:12" />
          <GlyphStat glyph="quest.step" value={2} unit="steps" unverified />
        </p>
        <p className="gxl-line">
          <Fig compact="↓ 1 since Sun" /> · <Fig compact="46 → 38" /> · <Fig compact="L6+" />
        </p>
      </Box>

      <Box title="GlyphLane" note="The who-word stays visible.">
        <GlyphLane who="gemini" items={["Domains", "order", "picks"]} defs="gx" />
        <GlyphLane who="app" items={["practices", "words", "numbers"]} defs="gx" />
      </Box>

      <Box title="RankSeal" note="34 · 40 · 48 · 72; idle, active (next), done (held). No padlock.">
        <div ref={sealRef} className="gxl-row gxl-end">
          {RANK_SIZES.map((s) => (
            <RankSeal key={s} index={2} top={5} size={s} state="done" label={s === 72 ? "Aim rank Journeyman, 3 of 7, kept for good" : undefined} />
          ))}
        </div>
        <div className="gxl-row">
          {RANK_WORDS.map((w, i) => (
            <span key={w} className="gxl-col">
              <RankSeal index={i} size={34} state="idle" />
              <RankSeal index={i} size={34} state="active" />
              <RankSeal index={i} size={34} state="done" />
            </span>
          ))}
        </div>
        <Play label="Play rank-rise on the 48 px seal" onPlay={() => play(sealRef.current?.querySelector(".mg-rs-48"), "rank-rise", { name: "Journeyman", seed: "aimrank:gallery:2" })} />
      </Box>

      <Box title="StageLadder" note="Pick a depth: the rungs light up (ladder, ACT).">
        <div className="gxl-seg" role="group" aria-label="Depth">
          {[8, 10, 12].map((d) => (
            <button key={d} type="button" className="chip btn-chip" aria-pressed={depth === d} onClick={() => setDepth(d)}>
              L{d}
            </button>
          ))}
        </div>
        <StageLadder chosen={depth} exam={8} gapDays={110} />
        <HonestyChip kind="review-gap" label="review gap ≈ 110 d" />
      </Box>

      <Box title="TimeBar" note="Labels placed on the server; the Dates toggle shows the marker list.">
        <span id="gxl-realism" hidden>
          Fixture: realistic about March 2028 at your pace; earliest December 2027 if every review passes.
        </span>
        <div ref={tbRef} className="gxl-stack">
          {TIMEBARS.map((t) => (
            <TimeBar key={t.name} {...t.props} labelledBy="gxl-realism" />
          ))}
        </div>
        <Play label="Play date-moved on the realistic marker" onPlay={() => tbRef.current?.querySelectorAll('[data-k="realistic"]').forEach((el) => play(el, "date-moved"))} />
      </Box>

      <Box title="RouteRail" note="Every MilestoneRowState; the current node never pulses.">
        <div ref={railRef}>
          <RouteRail nodes={RAIL_NODES} startTick={startTick} label="Milestones (fixture)" />
        </div>
        <RouteRail nodes={STRIP_NODES} orientation="strip" label="Milestones strip (fixture)" />
        <div className="gxl-row">
          <Play label="Play start on the current node" onPlay={() => setStartTick((t) => t + 1)} />
          <Play label="Play reach on milestone 2" onPlay={() => play(railRef.current?.querySelector('[data-n="2"]'), "reach")} />
        </div>
      </Box>

      <Box title="RouteRail · topics (revision 5)" note="Layer nodes, a locked node (m.builds, after 2: no padlock, no dash), a held layer you know, a depth node.">
        <div ref={topicRailRef}>
          <RouteRail nodes={TOPIC_RAIL_NODES} label="Topic milestones (fixture)" />
        </div>
        <RouteRail nodes={TOPIC_RAIL_NODES} orientation="strip" label="Topic milestones strip (fixture)" />
        <div className="gxl-row">
          <Play label="Play layer-open on milestone 2" onPlay={() => play(topicRailRef.current?.querySelector('[data-n="2"]'), "layer-open")} />
        </div>
      </Box>

      <Box title="PipStrip and CapacityGauge">
        <PipStrip days={PIP_DAYS} label="Due: Tuesday 1, Wednesday 2 (today), Saturday 1" />
        <CapacityGauge need={{ value: 200, text: "3 h 20" }} have={{ value: 270, text: "4 h 30" }} unit="/wk" verdict="FITS" unverified label="Needs about 3 hours 20 a week; you have about 4 hours 30 a week." />
        <CapacityGauge need={{ value: 300, text: "5 h" }} have={{ value: 270, text: "4 h 30" }} unit="/wk" verdict="TIGHT" label="Needs about 5 hours a week; you have about 4 hours 30 a week." />
      </Box>

      <Box title="InfoTip and the card Key" note="At most 3 per card, the Key included.">
        <p className="gxl-line">
          Set an aim
          <InfoTip topic="setting an aim">Fixture: the form lead, one tap away.</InfoTip>
          <CardKey
            defs="gx"
            entries={[
              { glyph: "ev.tested", words: "tested by your reviews" },
              { glyph: "pv.app", words: "Written by the app" },
              { glyph: "pv.suggest", words: "Gemini suggestion · not checked" },
            ]}
            rows={["Row 1: From your words: “longer runs hurt my knee”."]}
          />
        </p>
      </Box>

      <Box title="One-shots" note="step-done, pay-swap, meter-fill (from last seen, either way).">
        <div className="gxl-row">
          <svg ref={tickRef} className="mg mg-ok mg-is-done" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M6 12.5l4 4 8-8.5" data-part="mark" pathLength={100} />
          </svg>
          <Play label="Play step-done" onPlay={() => play(tickRef.current, "step-done")} />
          <span className="gxl-lab">
            pays <span ref={payRef} className="num">{pay}</span> × progress
          </span>
          <Play
            label="Play pay-swap"
            onPlay={() => {
              setPay((p) => (p === 6 ? 4 : 6));
              play(payRef.current, "pay-swap");
            }}
          />
        </div>
        <div ref={meterRef} className="meter" role="meter" aria-label="Fixture meter, 41%" aria-valuenow={41} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ ["--v" as string]: 0.41 }} />
        </div>
        <div className="gxl-row">
          <Play label="Play meter-fill from 30% to 41%" onPlay={() => play(meterRef.current, "meter-fill", { from: 0.3, to: 0.41 })} />
          <Play label="Play meter-fill from 50% to 41% (a fall, in ink)" onPlay={() => play(meterRef.current, "meter-fill", { from: 0.5, to: 0.41 })} />
        </div>
      </Box>

      <Box title="WAIT: the drafting glyph" note="Breathes in opacity on its svg (≤ 74 half-periods) under Full; still under Calm and Still; the pause stops it.">
        <div className="gxl-wait" data-wait="" data-paused={paused ? "" : undefined}>
          <Glyph name="route.weave" size={32} />
          <span className="gxl-lab">Drafting · started 09:12</span>
          <GlyphButton glyph="m.pause" label="Pause animation" pressed={paused} size={40} onClick={() => setPaused((p) => !p)} />
        </div>
      </Box>
    </div>
  );
}
