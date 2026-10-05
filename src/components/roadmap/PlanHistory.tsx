/**
 * Plan history (F18 §7, F22): one line per acceptance from RoadmapAcceptance,
 * "v1 accepted 4 Oct · v2 accepted 12 Nov: end target 60 → 50, due unchanged".
 * A plain list, not a diff viewer; an undone acceptance says so.
 *
 * Revision 4's fix round 2 (contracts §16.2): a record lowerDepthCore wrote
 * inside its version is a lowered depth, never a re-plan's acceptance. The
 * row says so itself (PlanHistoryRow.depthLowered, which R4's historyOf sets
 * from isDepthLoweringRecord), and it reads "v1 depth lowered 5 Jan: Mastered
 * → Fluent". Nothing is inferred from a version that repeats the row before:
 * after Undo the roadmap's version drops back by one, so accept → Undo →
 * accept writes a second acceptance of the same version, which lowered
 * nothing.
 */
import type { PlanHistoryRow } from "@/lib/roadmap-types";
import { dayLabel } from "./roadmap-copy";

/** lowerDepthCore's record within its version: the row's own flag (contracts §16.2); absent reads false. */
export function isDepthLoweringRow(row: Pick<PlanHistoryRow, "depthLowered">): boolean {
  return row.depthLowered === true;
}

/** The verb is already in the head, so a lowered depth's "lowered the depth Mastered → Fluent" reads "Mastered → Fluent" (and the bare fallback reads nothing more). */
function changesOf(row: PlanHistoryRow): string[] {
  if (!isDepthLoweringRow(row)) return row.changes;
  return row.changes.map((c) => c.replace(/^lowered the depth\b\s*/, "")).filter((c) => c.length > 0);
}

export function planHistoryLine(row: PlanHistoryRow, today?: string): string {
  const verb = isDepthLoweringRow(row) ? "depth lowered" : "accepted";
  const head = `v${row.version} ${verb} ${dayLabel(row.day, today)}`;
  const changes = changesOf(row);
  const tail = changes.length > 0 ? `: ${changes.join(", ")}` : "";
  return `${head}${tail}${row.undone ? " · undone" : ""}`;
}

export function PlanHistory({ rows, today }: { rows: readonly PlanHistoryRow[]; today: string }) {
  if (rows.length === 0) return <span className="rm-tp-s">Not accepted yet.</span>;
  return <span className="rm-tp-s">{rows.map((r) => planHistoryLine(r, today)).join(" · ")}</span>;
}
