/**
 * "Aim ranks on this plan" (F12, F18 §1; roadmap-rev4.md F-R4-12): the seven
 * names in order, each with what gives it (on = given, cur = the next rank,
 * ink outline), and "Top rank on this plan". A rank name here always sits in
 * the disclosure that names it; no rank line says "earn" (a rank pays
 * nothing).
 *
 * On a plan aimed at a depth each rank names the stage that gives it
 * ("Journeyman · milestone 2 · Familiar (level 6) · its cards part from 7.4%"),
 * with the floor of the cards part at that stage (LEVEL_WEIGHT(ℓ) ÷
 * LEVEL_WEIGHT(L*), R1's stageFloorOf), the fixed line that early stages read
 * low by design, and the top rank's missing condition ("Top rank on this
 * plan: Virtuoso — Paragon needs a standard you set").
 */
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { floorPercentOf, stageFloorOf } from "@/lib/roadmap-proficiency";
import type { AimDepth, AimRankView, MilestoneRowView, ParagonMissing } from "@/lib/roadmap-types";
import { ladderRowLine, proficiencyFloorLine, stageWords, topRankDepthLine, topRankLine } from "./roadmap-copy";

/** One rung's words on a depth plan: its milestone's stage and the cards part's floor there. */
export function ladderStageWords(row: AimRankView["ladder"][number], rows: readonly MilestoneRowView[], depth: AimDepth | null): string | null {
  if (row.milestoneOrd == null) return null;
  const ms = rows.find((r) => r.ord === row.milestoneOrd && !r.held) ?? null;
  if (!ms) return null;
  const stage = stageWords(ms.stage, ms.gateLevel);
  if (!stage) return null;
  const floor = depth != null && typeof ms.gateLevel === "number" ? floorPercentOf(stageFloorOf(ms.gateLevel, depth)) : null;
  return floor != null ? `${stage} · its cards part from ${floor}%` : stage;
}

export function PlanRanks({
  rank,
  scheduled,
  milestones = [],
  depth = null,
  paragonMissing,
}: {
  rank: AimRankView;
  scheduled: number;
  milestones?: readonly MilestoneRowView[];
  depth?: AimDepth | null;
  paragonMissing?: readonly ParagonMissing[];
}) {
  return (
    <details className="rm-parts">
      <summary>
        <Icon name="chev" />
        Aim ranks on this plan
      </summary>
      <ol className="rm-ladder" aria-label="Aim ranks on this plan">
        {rank.ladder.map((row) => {
          const stage = ladderStageWords(row, milestones, depth);
          return (
            <li key={row.index} className={cx(row.state === "given" && "rm-on", row.state === "next" && "rm-cur")}>
              <span>
                <b>{row.name}</b> · {ladderRowLine(row, scheduled)}
                {stage ? ` · ${stage}` : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="t-meta">{paragonMissing ? topRankDepthLine(rank.top, paragonMissing) : topRankLine(rank.top)}</p>
      {depth != null && <p className="t-meta">{proficiencyFloorLine(depth)}</p>}
    </details>
  );
}
