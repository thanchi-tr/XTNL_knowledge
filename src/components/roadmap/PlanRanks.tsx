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
 *
 * UI motion (ui-motion.md §3.3 screen 4 "▸ unchanged", §4.4 Rank; lane R2):
 * each rung leads with its own rank medallion, aria-hidden beside the name,
 * in the catalogue's states: done for a rank given (held for good), active
 * for the next rank (the open slot, never the held look), idle for a later
 * one or one beyond the plan's top. Static: nothing in the ladder moves.
 */
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { Glyph, type GlyphState } from "@/components/glyph/Glyph";
import type { RankName } from "@/components/glyph/paths/rank";
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

/** A rung's medallion state: a rank given is held (done), the next rank is the open slot (active), the rest idle (D5). */
export function rungGlyphState(row: Pick<AimRankView["ladder"][number], "state" | "index">, top: number): GlyphState {
  if (row.index > top) return "idle";
  return row.state === "given" ? "done" : row.state === "next" ? "active" : "idle";
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
      <ol className="rm-ladder rm-ladder-g" aria-label="Aim ranks on this plan">
        {rank.ladder.map((row) => {
          const stage = ladderStageWords(row, milestones, depth);
          return (
            <li key={row.index} className={cx(row.state === "given" && "rm-on", row.state === "next" && "rm-cur")} data-rung={rungGlyphState(row, rank.top.index)}>
              <Glyph name={`rank.${Math.max(0, Math.min(6, row.index))}` as RankName} state={rungGlyphState(row, rank.top.index)} size={16} className="rm-rung-g" />
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
