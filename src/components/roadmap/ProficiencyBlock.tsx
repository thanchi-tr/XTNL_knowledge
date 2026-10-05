"use client";

/**
 * The Aim rank and Proficiency, one block (F12; F18 §1; F19 (d); ui-motion.md
 * §3.3 screens 4 and 9, §4.4 Rank, §4.5 RankSeal, §7.4, §7.9; lane R2).
 *
 *   Left: the RankSeal (40 on the Aim card, 48 with its 7-pip ladder on the
 *   roadmap page), aria-hidden beside its label: the rank name over "Aim
 *   rank" (the DOM reads "Aim rank Aspirant"), with ", 2 of 7, kept for good"
 *   sr-only (D5: "kept for good" is words, never a padlock), and the static
 *   "new 3 Nov" marker for RANK_NEW_DAYS after a rank-up.
 *   Right: "41% [ev.tested][ev.tick]" over "[ev.measured] 09:12" (or
 *   «[ev.measured] at acceptance» on the ACCEPTED card, a chip that opens
 *   acceptanceCaption) over "Proficiency → L12". A SELF_REPORTED reading
 *   adds the visible words "from your ticks". The compact figures are
 *   aria-hidden; one sr sentence carries the label with its basis, the %,
 *   the caption and when it was measured (D26).
 *   Under both: the Meter, aria-hidden (the sentence already says the %),
 *   moving from the value this viewer last saw under the same Proficiency
 *   basis signature (useSeenValue, `meter:proficiency`, D8; either way, D9);
 *   no basis key, a live (writes-off) figure or a first view: no motion.
 *   Beside the meter, the block's one (i) (D13): the next rank and "rank is
 *   kept for good", the caption, "What it's made of" and the parts, the
 *   change's cause, and the surface's own lines (`info`).
 *   Visible below: "↓ 1 since Sun" (a fall, in ink, never red); a pending
 *   reach in full ("counts from Thu"), once, unless the surface's milestone
 *   line already says it. A rebase's Changed line is in the (i) only (the
 *   surface shows «Target lowered» when the target was lowered).
 *   The roadmap page adds the three mini-meters (cards, practice,
 *   milestones; the parts line sr-only), "Next · [rank.N active] Journeyman
 *   · milestone 2" (a rank not yet held always carries its verb, C2-B3) or
 *   "[rank.N done] keeps your rank", and the "Aim ranks on this plan"
 *   disclosure (PlanRanks).
 *
 * Motion: rank-rise (SEEN) on the RankSeal, keyed on the plan basis with no
 * surface in its `what` ("rank"), so a counted rise plays once per viewer on
 * whichever surface sees it first; a pending reach moves no rank (D18). The
 * meter's meter-fill (SEEN). Nothing else moves; Proficiency is never
 * celebrated. "mastery" and the ⬡ glyph never appear here; "Mastered" only
 * inside the basis label ("Proficiency toward Mastered (level 12)"), sr-only
 * and in the meter's name.
 */
import { useMemo, type ReactNode } from "react";
import { Glyph, Mark, type MarkRef } from "@/components/glyph/Glyph";
import { Fig } from "@/components/glyph/GlyphStat";
import { HonestyChip } from "@/components/glyph/HonestyChip";
import { InfoTip } from "@/components/glyph/InfoTip";
import { RankSeal, rankSr } from "@/components/glyph/RankSeal";
import { useSeenValue } from "@/components/glyph/useSeen";
import type { RankName } from "@/components/glyph/paths/rank";
import type { EvidenceName } from "@/components/glyph/paths/evidence";
import { Meter } from "@/components/ui/Meter";
import { cx } from "@/components/ui/cx";
import { goalPercent } from "@/lib/goals";
import type { DayKey } from "@/lib/life-day";
import { NOT_RECORDED_HERE, type AimDepth, type AimRankView, type MilestoneRowView, type ParagonMissing, type ProficiencyView } from "@/lib/roadmap-types";
import {
  SHORT_AIM_RANK,
  SHORT_AT_ACCEPTANCE,
  SHORT_KEEPS_RANK,
  SHORT_NEXT,
  SHORT_NOT_RECORDED,
  acceptanceCaption,
  dayLabel,
  measuredLabel,
  nextRankLine,
  proficiencyChangeLine,
  proficiencyMissingLine,
  proficiencyPartsLine,
  rankPendingLine,
  shortProficiencyToward,
  weekdayName,
} from "./roadmap-copy";
import { proficiencyBasisLabelOf, rankSealOf, seenBaseOf, seenKeyOf, SEEN_WHAT, type ProficiencyBasisField, type SeenBases } from "./roadmap-ui-model";
import { PlanRanks } from "./PlanRanks";

/** The ACCEPTED card's caption (the contract §9.3): the reading of the acceptance day says so; any later one says when it was measured. */
export interface AcceptanceCaption {
  /** isAcceptanceReading(measuredAt, acceptedDay) on a stored (not live) reading. */
  atAcceptance: boolean;
  acceptedDay: DayKey | null;
}

export interface ProficiencyBlockProps {
  rank: AimRankView;
  proficiency: ProficiencyView | null;
  variant: "card" | "page";
  today: string;
  scheduled: number;
  writesOff: boolean;
  /** The roadmap's id (the card's roadmapId, the page's header id): the fallback seen bases when `seen` is not passed. */
  seenKey: string;
  /** The surface already states the pending reach (the Aim card's milestone line is that milestone). */
  pendingShownElsewhere?: boolean;
  /** The roadmap page's ladder (revision 4): the plan's rows for each rank's stage, the depth for the floors, and what keeps Paragon closed. */
  ladder?: { milestones: readonly MilestoneRowView[]; depth: AimDepth | null; paragonMissing: readonly ParagonMissing[] };
  /**
   * The roadmap's seen bases (roadmap-ui-model seenBasesOfAimCard / seenBasesOfRoadmap). The RankSeal's
   * rank-rise needs the plan basis; without `seen` only the meter can move (its Proficiency basis is built
   * from `seenKey` and the reading's basisKey) and the rank never does.
   */
  seen?: SeenBases | null;
  /** The ACCEPTED card while its first rank stands: the acceptance caption and «at acceptance». */
  acceptance?: AcceptanceCaption | null;
  /** The surface's own lines for the block's (i) (the Aim card's held depth, the target lowered; the header's plan line). */
  info?: ReactNode;
}

/** The evidence glyphs a Proficiency caption names: ev.tested for "tested by your reviews", ev.tick for "your ticks" (D27). */
export function evidenceGlyphsOf(caption: string): EvidenceName[] {
  const out: EvidenceName[] = [];
  if (/tested by your reviews/.test(caption)) out.push("ev.tested");
  if (/\byour ticks\b/.test(caption)) out.push("ev.tick");
  return out;
}

/** The level a Proficiency counts toward ("Proficiency → L12"): its `toward`, else the level its label names; null without a depth. */
export function towardLevelOf(p: Pick<ProficiencyView, "toward" | "label">): number | null {
  if (p.toward && Number.isFinite(p.toward.level)) return p.toward.level;
  const m = /\(level (\d+)\)/.exec(p.label ?? "");
  return m ? Number(m[1]) : null;
}

/** "09:12" (today), "Sat" (this week) or "25 Sep" from measuredLabel; null when not measured. The clock only ever sits beside one (D27). */
export function measuredTimeOf(iso: string | null, today: string): string | null {
  const l = measuredLabel(iso, today);
  return l.startsWith("measured ") ? l.slice("measured ".length) : null;
}

/** The block's seen bases: the surface's, else the Proficiency family alone from the roadmap id and the reading's basis key (D8). */
export function proficiencyBasesOf(seen: SeenBases | null | undefined, seenKey: string, p: ProficiencyView | null): SeenBases | null {
  if (seen !== undefined) return seen;
  const id = seenKey && /^[A-Za-z0-9_-]+$/.test(seenKey) ? seenKey : null;
  const k = (p as (ProficiencyView & ProficiencyBasisField) | null)?.basisKey;
  return id ? { roadmapId: id, prof: typeof k === "string" && k.length > 0 ? `prof/${k}` : null, plan: null } : null;
}

/** The meter's seen value: the stored figure to 3 places (the frozen LastSeenMeter rounding). */
const meterValueOf = (p: ProficiencyView) => Math.round(Number(p.figure.value) * 1000) / 1000;

const PART_GLYPH: Readonly<Record<"cards" | "practice" | "milestones", MarkRef>> = { cards: "s-know", practice: "ev.tick", milestones: "m.seal" };

/** The page's three mini-meters: the cards part, the practice part, the milestones reached (aria-hidden; the parts line is their sr twin). */
function PartMeters({ p }: { p: ProficiencyView }) {
  const items: { k: keyof typeof PART_GLYPH; fig: string; v: number }[] = [];
  if (p.parts.cards != null) items.push({ k: "cards", fig: `${goalPercent(p.parts.cards)}%`, v: p.parts.cards });
  if (p.parts.practice != null) items.push({ k: "practice", fig: `${goalPercent(p.parts.practice)}%`, v: p.parts.practice });
  if (p.parts.milestones != null) items.push({ k: "milestones", fig: `${p.reached}/${p.scheduled}`, v: p.scheduled > 0 ? p.reached / p.scheduled : 0 });
  if (items.length === 0) return null;
  return (
    <div className="rm-rp-parts">
      <span className="rm-rp-parts-g" aria-hidden="true">
        {items.map((it) => (
          <span key={it.k} className="rm-rp-part" data-part-k={it.k}>
            <Mark glyph={PART_GLYPH[it.k]} size={14} />
            <span className="num">{it.fig}</span>
            <i className="rm-rp-bar" style={{ ["--v" as string]: Math.max(0, Math.min(1, it.v)) }} />
          </span>
        ))}
      </span>
      <span className="sr-only">{proficiencyPartsLine(p)}</span>
    </div>
  );
}

/** The page's next-rank line: "Next · [rank.2 active] Journeyman · milestone 2", "Milestone 6 · [rank.N done] keeps your rank", or nothing at the top. */
function NextRankLine({ rank }: { rank: AimRankView }) {
  const m = rankSealOf(rank);
  if (!m) return null;
  if (m.keeps && rank.next.kind === "keeps") {
    return (
      <p className="rm-rp-next">
        <span aria-hidden="true">
          Milestone {rank.next.milestoneOrd} · <Glyph name={`rank.${m.index}` as RankName} state="done" size={16} /> {SHORT_KEEPS_RANK}
        </span>
        <span className="sr-only">{nextRankLine(rank.next)}</span>
      </p>
    );
  }
  if (!m.next) return null;
  return (
    <p className="rm-rp-next">
      <span aria-hidden="true">
        {SHORT_NEXT} · <Glyph name={`rank.${m.next.index}` as RankName} state="active" size={16} /> <b data-wc="name">{m.next.name}</b>
        {m.next.milestoneOrd != null && <> · milestone {m.next.milestoneOrd}</>}
      </span>
      <span className="sr-only">{nextRankLine(rank.next)}</span>
    </p>
  );
}

export function ProficiencyBlock({
  rank,
  proficiency,
  variant,
  today,
  scheduled,
  writesOff,
  seenKey,
  pendingShownElsewhere = false,
  ladder,
  seen,
  acceptance = null,
  info,
}: ProficiencyBlockProps) {
  const p = proficiency;
  const bases = useMemo(() => proficiencyBasesOf(seen, seenKey, p), [seen, seenKey, p]);
  // meter-fill (SEEN, D8): only under the reading's own basis signature, never for a live (unrecorded) figure.
  const meterKey = p && !p.live ? seenKeyOf(bases, SEEN_WHAT.proficiency) : null;
  const from = useSeenValue(meterKey, p ? meterValueOf(p) : 0);
  const sealKey = seenBaseOf(bases, "plan");
  const label = p ? proficiencyBasisLabelOf(p) : "Proficiency";
  const level = p ? towardLevelOf(p) : null;
  const time = p && !p.live ? measuredTimeOf(p.measuredAt, today) : null;
  const fromTicks = p?.class === "SELF_REPORTED";
  const atAcceptance = Boolean(acceptance?.atAcceptance && p && !p.live);
  const parts = p ? proficiencyPartsLine(p) : "";
  const change = p ? proficiencyChangeLine(p.change, today) : null;
  const pending = rank.pending && !pendingShownElsewhere ? rankPendingLine(rank.pending.milestoneOrd, rank.pending.countsFrom) : null;
  const when = p ? (p.live ? NOT_RECORDED_HERE : acceptance ? acceptanceCaption(atAcceptance, acceptance.acceptedDay, p.measuredAt, today) : measuredLabel(p.measuredAt, today)) : null;
  const speech = p ? `${label} ${p.percent}%, ${p.figure.caption}${when ? `, ${when}` : ""}` : proficiencyMissingLine(writesOff);
  const fall = p?.change?.kind === "fall" ? p.change : null;

  return (
    <div className={cx("rm-rp", variant === "page" ? "rm-rp-page" : "rm-rp-card")} data-rp={variant}>
      <div className="rm-rs-u">
        <RankSeal index={rank.index} top={rank.top.index} size={variant === "page" ? 48 : 40} state="done" seenKey={sealKey} />
        <span className="rm-rs-l">
          <span className="rm-rs-k">{SHORT_AIM_RANK}</span>
          <span className="rm-rs-nw">
            <b className="rm-rs-n" data-wc="name">
              {rank.name}
            </b>
            {rank.newSince && <span className="rm-new">new {dayLabel(rank.newSince, today)}</span>}
          </span>
          <span className="sr-only">{rankSr(rank.index, true)}</span>
        </span>
      </div>

      {p ? (
        <div className="rm-rp-pf">
          <span className="sr-only">{speech}</span>
          <div className="rm-pf-v">
            <b className="rm-pf-n num" aria-hidden="true">
              {p.percent}%
            </b>
            <span className="rm-pf-ev" aria-hidden="true">
              {evidenceGlyphsOf(p.figure.caption).map((g) => (
                <Glyph key={g} name={g} size={16} inherit />
              ))}
            </span>
          </div>
          {(atAcceptance || time || fromTicks) && (
            <div className="rm-pf-t">
              {atAcceptance && acceptance ? (
                <HonestyChip kind="at-acceptance" label={SHORT_AT_ACCEPTANCE} full={acceptanceCaption(true, acceptance.acceptedDay, p.measuredAt, today)} />
              ) : (
                time && (
                  <span className="rm-pf-at" aria-hidden="true">
                    <Glyph name="ev.measured" size={12} inherit />
                    <span className="num">{time}</span>
                  </span>
                )
              )}
              {fromTicks && (
                <span className="rm-pf-ticks" aria-hidden="true" data-wc="honest">
                  from your ticks
                </span>
              )}
            </div>
          )}
          <div className="rm-pf-l" aria-hidden="true">
            <span>Proficiency</span>
            {level != null ? shortProficiencyToward(level).slice("Proficiency".length) : ""}
          </div>
        </div>
      ) : (
        <div className="rm-rp-pf rm-rp-none">
          <span className="sr-only">{speech}</span>
          <div className="rm-pf-t" aria-hidden="true" data-wc={writesOff ? "honest" : undefined}>
            {writesOff ? SHORT_NOT_RECORDED : "not measured yet"}
          </div>
          <div className="rm-pf-l" aria-hidden="true">
            <span>Proficiency</span>
          </div>
        </div>
      )}

      <div className="rm-rp-mrow">
        {p && (
          <div className="rm-rp-meter" aria-hidden="true">
            <Meter value={Number(p.figure.value)} from={from} label={`${label}: ${p.percent}%, ${p.figure.caption}`} valueText={`${p.percent}%`} />
          </div>
        )}
        <InfoTip topic={variant === "card" ? "this aim's rank and Proficiency" : "Proficiency and the Aim rank"} className="rm-rp-tip">
          {acceptance && p && (
            <span className="rm-rp-tp">
              Aim rank {rank.name} · Proficiency {p.percent}%
            </span>
          )}
          <span className="rm-rp-tp">
            <b>{nextRankLine(rank.next)}</b>
          </span>
          {p ? (
            acceptance ? (
              <span className="rm-rp-tp">{parts ? `${when} · ${parts}` : when}</span>
            ) : (
              <>
                <span className="rm-rp-tp">{`${label} ${p.percent}% · ${p.figure.caption} · ${when}`}</span>
                {parts && (
                  <span className="rm-rp-tp">
                    <b>What it&apos;s made of</b> · {parts}
                  </span>
                )}
              </>
            )
          ) : (
            <span className="rm-rp-tp">{proficiencyMissingLine(writesOff)}</span>
          )}
          {change && <span className="rm-rp-tp">{change}</span>}
          {info}
        </InfoTip>
      </div>

      {fall && (
        <p className="rm-rp-chg" data-wc="honest">
          <Fig compact={`↓ ${fall.points} since ${weekdayName(fall.since)}`} />
        </p>
      )}
      {/* A pending reach is stated once: on the Aim card its milestone line says it when that line is the pending milestone. */}
      {pending && (
        <p className="rm-rp-pend" data-wc="honest">
          {pending}
        </p>
      )}

      {variant === "page" && p && <PartMeters p={p} />}
      {variant === "page" && <NextRankLine rank={rank} />}
      {variant === "page" && <PlanRanks rank={rank} scheduled={scheduled} milestones={ladder?.milestones} depth={ladder?.depth ?? null} paragonMissing={ladder?.paragonMissing} />}
    </div>
  );
}
