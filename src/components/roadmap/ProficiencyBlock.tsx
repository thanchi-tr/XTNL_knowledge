"use client";

/**
 * The Aim rank and Proficiency, one block (F12; F18 §1; F19 (d)).
 *
 *   Left: the eyebrow "Aim rank" over the rank name ("new 3 Nov" for
 *   RANK_NEW_DAYS after a rank-up). Right: "Proficiency" over "41%". Under
 *   both: a LastSeenMeter branded by the stored reading's class (it animates
 *   from the last value this viewer saw, never from 0), its caption, the next
 *   rank line, the one change line in ink (a fall's cause from the parts diff,
 *   or "Changed on … (was 41%)" for a plan decision, never a gain glyph), and
 *   the parts: in a "What it's made of" disclosure on the Aim card, always
 *   shown on the roadmap page with the "Aim ranks on this plan" ladder.
 *
 * Proficiency pays nothing and is never celebrated; "mastery" and the ⬡
 * glyph never appear in this block, and "Mastered" only as the basis in its
 * label (revision 4, F-R4-12): the eyebrow "Proficiency" over "toward
 * Mastered (level 12)", and the meter's name "Proficiency toward Mastered
 * (level 12): 28%, …", so a figure after a lowered depth never reads as more.
 * On the roadmap page the ladder shows each stage's floor (PlanRanks).
 */
import { Icon } from "@/components/ui/Icon";
import { LastSeenMeter } from "@/components/home/LastSeenMeter";
import type { AimDepth, AimRankView, MilestoneRowView, ParagonMissing, ProficiencyView } from "@/lib/roadmap-types";
import { dayLabel, measuredLabel, nextRankLine, proficiencyChangeLine, proficiencyMissingLine, proficiencyPartsLine, rankPendingLine } from "./roadmap-copy";
import { proficiencyBasisLabelOf, proficiencyBasisOf } from "./roadmap-ui-model";
import { PlanRanks } from "./PlanRanks";

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
}: {
  rank: AimRankView;
  proficiency: ProficiencyView | null;
  variant: "card" | "page";
  today: string;
  scheduled: number;
  writesOff: boolean;
  /** localStorage key for the last-seen meter ("aim:<roadmapId>"). */
  seenKey: string;
  /** The surface already states the pending reach (the Aim card's milestone line is that milestone). */
  pendingShownElsewhere?: boolean;
  /** The roadmap page's ladder (revision 4): the plan's rows for each rank's stage, the depth for the floors, and what keeps Paragon closed. */
  ladder?: { milestones: readonly MilestoneRowView[]; depth: AimDepth | null; paragonMissing: readonly ParagonMissing[] };
}) {
  const change = proficiency ? proficiencyChangeLine(proficiency.change, today) : null;
  const basis = proficiency ? proficiencyBasisOf(proficiency) : null;
  const parts = proficiency ? proficiencyPartsLine(proficiency) : "";
  const caption = proficiency
    ? variant === "page"
      ? `${proficiency.figure.caption} · ${proficiency.live ? "not recorded on this server" : measuredLabel(proficiency.measuredAt, today)}`
      : proficiency.live
        ? `${proficiency.figure.caption} · not recorded on this server`
        : proficiency.figure.caption
    : null;
  return (
    <div className="rm-rp">
      <div>
        <div className="rm-rp-k">Aim rank</div>
        <div className="rm-rp-v">
          {rank.name}
          {rank.newSince && <span className="rm-new">new {dayLabel(rank.newSince, today)}</span>}
        </div>
      </div>
      {proficiency ? (
        <>
          <div className="rm-rp-pf">
            <div className="rm-rp-k">
              Proficiency
              {basis && <span className="rm-basisk">{basis}</span>}
            </div>
            <div className="rm-rp-v num">{proficiency.percent}%</div>
          </div>
          <LastSeenMeter
            seenKey={`roadmap:${seenKey}:proficiency`}
            value={Number(proficiency.figure.value)}
            label={`${proficiencyBasisLabelOf(proficiency)}: ${proficiency.percent}%, ${proficiency.figure.caption}`}
            valueText={`${proficiency.percent}%`}
          />
          <p className="rm-cap rm-rp-full">{caption}</p>
          {variant === "page" && parts && <p className="t-meta rm-rp-full">{parts}</p>}
          {change && <p className="t-meta rm-rp-full rm-chg">{change}</p>}
          <p className="t-meta rm-rp-full">{nextRankLine(rank.next)}</p>
          {/* A pending reach is stated once: on the Aim card its milestone line says it when that line is the pending milestone. */}
          {rank.pending && !pendingShownElsewhere && <p className="t-meta rm-rp-full">{rankPendingLine(rank.pending.milestoneOrd, rank.pending.countsFrom)}</p>}
          {variant === "card" && parts && (
            <details className="rm-parts">
              <summary>
                <Icon name="chev" />
                What it&apos;s made of
              </summary>
              <p>{parts}</p>
            </details>
          )}
        </>
      ) : (
        <>
          <p className="t-body rm-rp-full" style={{ marginTop: 10 }}>
            {proficiencyMissingLine(writesOff)}
          </p>
          <p className="t-meta rm-rp-full">{nextRankLine(rank.next)}</p>
        </>
      )}
      {variant === "page" && <PlanRanks rank={rank} scheduled={scheduled} milestones={ladder?.milestones} depth={ladder?.depth ?? null} paragonMissing={ladder?.paragonMissing} />}
    </div>
  );
}
