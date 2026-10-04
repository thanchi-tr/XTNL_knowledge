/**
 * Plan history (F18 §7, F22): one line per acceptance from RoadmapAcceptance,
 * "v1 accepted 4 Oct · v2 accepted 12 Nov: end target 60 → 50, due unchanged".
 * A plain list, not a diff viewer; an undone acceptance says so.
 */
import type { PlanHistoryRow } from "@/lib/roadmap-types";
import { dayLabel } from "./roadmap-copy";

export function planHistoryLine(row: PlanHistoryRow, today?: string): string {
  const head = `v${row.version} accepted ${dayLabel(row.day, today)}`;
  const changes = row.changes.length > 0 ? `: ${row.changes.join(", ")}` : "";
  return `${head}${changes}${row.undone ? " · undone" : ""}`;
}

export function PlanHistory({ rows, today }: { rows: readonly PlanHistoryRow[]; today: string }) {
  if (rows.length === 0) return <span className="rm-tp-s">Not accepted yet.</span>;
  return <span className="rm-tp-s">{rows.map((r) => planHistoryLine(r, today)).join(" · ")}</span>;
}
