"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { CurrencyKind } from "@/lib/celebration-types";
import type { FullDay, FullDayRingKind } from "@/lib/full-day";
import { FULL_DAY_MP } from "@/lib/full-day";
import { bump, countTo, formatFigure, roll } from "@/lib/motion";
import { useMiniLedger } from "@/components/shell/MiniLedger";
import { cx } from "@/components/ui/cx";
import { CurrencyGlyph, HeldGlyph, Icon } from "@/components/ui/Icon";
import { PromiseRing } from "@/components/ui/PromiseRing";
import { fmtMinutes } from "./format";
import { ledgerGate } from "./ledger-gate";

/**
 * The Day ledger tile (redesign "Sigil & Slate"): the day's one summary.
 *
 *   top      the DaySeal (flame in a dashed ring; lit = light ring + halo;
 *            broken = hollow flame), the streak numeral, a state caption,
 *            and freeze crystals when there are any;
 *   middle   the Full-day strip: three promise rings (Musts, Quest, Life)
 *            from lib/full-day.ts, "n of 3", and the stamp when all close;
 *   bottom   life XP · review pts · planned of capacity. Two ledgers, side
 *            by side and never summed. The cells are the landing target of
 *            every tick's token ([data-ledger-target]), and once they scroll
 *            away the top bar's MiniLedger docks so a flight always lands.
 *
 * Presentational: the board decides every number (honest ones only) and
 * which ring just closed. Figures count up from the last shown value, never
 * from 0, and only after the token lands (ledger-gate.ts).
 */

export interface DayLedgerRefs {
  tile?: RefObject<HTMLElement | null>;
  seal?: RefObject<HTMLDivElement | null>;
  rings?: Partial<Record<FullDayRingKind, RefObject<HTMLDivElement | null>>>;
  fullStamp?: RefObject<HTMLSpanElement | null>;
}

export interface DayLedgerProps {
  streak: {
    /** Day streak including today when kept. */
    count: number;
    /** The count is a floor (the read window's edge): "70+". */
    capped?: boolean;
    /** Today already counts (any tick or review). */
    kept: boolean;
    /** Ended (M2 knows when): hollow flame. Never shown as a red 0. */
    broken?: boolean;
  };
  /** The sentence under the numeral ("Kept today. Safe until 04:00."). */
  caption: ReactNode;
  /** Freeze crystals (M2). Null hides them. */
  freezes: { banked: number; used?: number } | null;
  fullDay: FullDay;
  /** M2's daily settlement pays Full days. False: the strip says the payout is not live yet. */
  settles: boolean;
  /** The note under the rings; a default says what a Full day does. */
  fullNote?: ReactNode;
  /** Rings that just closed (one glint each). */
  glint?: ReadonlySet<FullDayRingKind>;
  /** The FULL DAY stamp is landing now. */
  stampLanding?: boolean;
  xp: number;
  pts: number;
  planned: { minutes: number; capacity: number; chosen: boolean; over: number };
  /** Opens the capacity sheet; without it the cell is plain text. */
  onCapacity?: () => void;
  /** Publishes the figures to the top-bar MiniLedger (off on /dev/style fixtures). */
  publish?: boolean;
  refs?: DayLedgerRefs;
}

export function DayLedger(props: DayLedgerProps) {
  const { streak, fullDay, planned, refs } = props;
  const cellsRef = useRef<HTMLDivElement | null>(null);
  const noWatch = useRef<HTMLDivElement | null>(null);
  const publish = props.publish !== false;
  useMiniLedger(publish ? { xp: props.xp, pts: props.pts } : null, publish ? cellsRef : noWatch);
  const over = planned.chosen && planned.over > 0;

  const aside = props.settles ? `+${FULL_DAY_MP} MP when it settles` : "Musts · quest · one life deed";
  const note =
    props.fullNote ??
    (fullDay.full
      ? props.settles
        ? `Full day. Pays +${FULL_DAY_MP} MP when today settles.`
        : "Full day: musts, the quest and a life deed, all kept."
      : props.settles
        ? "A Full day also repairs a broken day before it, once a week."
        : `Full days are counted now; the +${FULL_DAY_MP} MP payout starts with daily settlement.`);

  return (
    <section ref={refs?.tile} className={cx("card today-day", fullDay.full && "full")} aria-label="Day ledger">
      <div className="d-top">
        <DaySeal lit={streak.kept} broken={!!streak.broken && !streak.kept} sealRef={refs?.seal} />
        <div className="d-streak">
          <div className="streak-line">
            <StreakNumber value={streak.count} capped={!!streak.capped} />
            <span className="streak-word">day streak</span>
          </div>
          <p className="streak-cap">{props.caption}</p>
        </div>
        {props.freezes && props.freezes.banked + (props.freezes.used ?? 0) > 0 && <Freezes {...props.freezes} />}
      </div>

      <div className="d-full">
        <span ref={refs?.fullStamp} className={cx("stamp full-stamp", props.stampLanding && "landing")} aria-hidden={!fullDay.full}>
          Full day
        </span>
        <div className="d-full-h">
          <span className="t-eyebrow">Full day</span>
          <span className="t-meta num">{fullDay.met} of 3</span>
          <span className="aside">{aside}</span>
        </div>
        <div className="rings">
          {fullDay.rings.map((r) => (
            <div key={r.kind} className="rg">
              <div ref={refs?.rings?.[r.kind]}>
                <PromiseRing value={r.value} target={r.target} size={40} label={r.label} closed={r.met} glint={props.glint?.has(r.kind)} />
              </div>
              <div className="lbl">
                <b>{r.label}</b>
                <span className="num">{r.caption}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="full-note">
          <Icon name="clock" size={14} />
          <span>{note}</span>
        </p>
      </div>

      <div className="cells" ref={cellsRef}>
        <div className="cell">
          <LedgerFigure kind="xp" value={props.xp} publishTarget={publish} />
          <div className="k">life XP</div>
        </div>
        <div className="cell">
          <LedgerFigure kind="pts" value={props.pts} publishTarget={publish} />
          <div className="k">review pts</div>
        </div>
        <div className="cell">
          {props.onCapacity ? (
            <button type="button" className="cap-cell" onClick={props.onCapacity} aria-haspopup="dialog" aria-label={capacityLabel(planned)}>
              <CapacityFigure planned={planned} />
              <span className="k">{over ? `over by ${fmtMinutes(planned.over)}` : planned.chosen ? "planned of capacity" : "planned · set capacity"}</span>
            </button>
          ) : (
            <>
              <CapacityFigure planned={planned} />
              <div className="k">planned of capacity</div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function capacityLabel(p: DayLedgerProps["planned"]): string {
  const base = `${fmtMinutes(p.minutes)} planned of ${fmtMinutes(p.capacity)}${p.chosen ? "" : " (the default)"}`;
  return p.chosen && p.over > 0 ? `${base}, over by ${fmtMinutes(p.over)}. Capacity` : `${base}. Capacity`;
}

function CapacityFigure({ planned }: { planned: DayLedgerProps["planned"] }) {
  return (
    <span className="v">
      <span className="num">{fmtMinutes(planned.minutes)}</span>
      <small>/ {fmtMinutes(planned.capacity)}</small>
    </span>
  );
}

/** The flame in a ring: grey and dashed until the day counts, lit once it does, hollow when a streak has ended. */
export function DaySeal({ lit, broken, sealRef, size }: { lit: boolean; broken?: boolean; sealRef?: RefObject<HTMLDivElement | null>; size?: number }) {
  return (
    <div ref={sealRef} className={cx("seal", lit && "lit", broken && "broken")} aria-hidden="true" style={size ? { width: size, height: size } : undefined}>
      <svg viewBox="0 0 52 52">
        <circle className="halo" cx="26" cy="26" r="25" />
        <circle className="ring-dash" cx="26" cy="26" r="21" />
        <circle className="ring-lit" cx="26" cy="26" r="21" pathLength={100} transform="rotate(-90 26 26)" />
        <path
          className="flame"
          d="M26.6 13.5c.5 2.6-.9 4.2-2.3 5.8-1.4 1.6-2.7 3.1-2.7 5.5a4.7 4.7 0 0 0 9.4 0c0-1.8-.8-3.2-1.6-4.3-.3 1.1-.9 2-1.7 2.4.5-3.1-.2-6.8-1.1-9.4z"
        />
      </svg>
    </div>
  );
}

/** Freeze crystals: "2 banked" / "0 banked · 2 used". Held glyph plus words, never colour alone. */
export function Freezes({ banked, used = 0 }: { banked: number; used?: number }) {
  const crystals = [...Array.from({ length: banked }, () => false), ...Array.from({ length: used }, () => true)].slice(0, 4);
  return (
    <div className="freezes" aria-label={`${banked} freeze${banked === 1 ? "" : "s"} banked${used ? `, ${used} used` : ""}`}>
      <div className="pips" aria-hidden="true">
        {crystals.map((isUsed, i) => (
          <HeldGlyph key={i} kind="freeze" size={18} className={isUsed ? "used" : undefined} />
        ))}
      </div>
      <div className="cap">
        {banked} banked{used ? ` · ${used} used` : ""}
      </div>
    </div>
  );
}

/**
 * The streak numeral. Written imperatively after the first paint (roll()
 * swaps the text in place, which a React-owned text node would fight), and
 * it rolls old → new only when it rises after its token lands.
 */
function StreakNumber({ value, capped }: { value: number; capped: boolean }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const text = `${value}${capped ? "+" : ""}`;
  const [initial] = useState(text);
  const last = useRef({ value, text });
  useEffect(() => {
    const el = ref.current;
    const prev = last.current;
    if (!el || prev.text === text) return;
    last.current = { value, text };
    let live = true;
    const apply = () => {
      if (!live) return;
      if (value > prev.value) roll(el, text);
      else el.textContent = text;
    };
    void (ledgerGate("xp") ?? Promise.resolve()).then(apply, apply);
    return () => {
      live = false;
    };
  }, [value, text]);
  return (
    <span ref={ref} className="streak-num num">
      {initial}
    </span>
  );
}

/**
 * One ledger cell's figure: the glyph in its currency hue, the figure in
 * ink. It is the landing target for its ledger's token; when the value
 * changes it waits for any flight in the air, then counts from the last
 * shown value and bumps the glyph once.
 */
export function LedgerFigure({ kind, value, publishTarget = true }: { kind: CurrencyKind; value: number; publishTarget?: boolean }) {
  const numRef = useRef<HTMLElement | null>(null);
  const glyphRef = useRef<HTMLSpanElement | null>(null);
  const [initial] = useState(() => formatFigure(value));
  const shown = useRef(value);
  const seq = useRef(0);
  useEffect(() => {
    const el = numRef.current;
    if (!el || shown.current === value) return;
    const mine = ++seq.current;
    const gate = ledgerGate(kind);
    const run = () => {
      if (mine !== seq.current) return;
      countTo(el, shown.current, value);
      shown.current = value;
      if (gate) bump(glyphRef.current);
    };
    void (gate ?? Promise.resolve()).then(run, run);
  }, [value, kind]);
  return (
    <span className="v">
      <span ref={glyphRef} className="gl">
        <CurrencyGlyph kind={kind} />
      </span>
      <b ref={numRef} className="num" data-ledger-target={publishTarget ? kind : undefined}>
        {initial}
      </b>
    </span>
  );
}
