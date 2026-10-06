/**
 * FROZEN CONTRACT (roadmap revision 5, lane 0; docs/life-plan/roadmap-contracts.md §23.2).
 *
 * Up to 3 goals: seats, one person's week (the shares and the hours' room),
 * Today's round robin, the aim line's pick, goal labels, the `?goal=` link
 * and the intake's autosave key. Keys and numbers only; its one line of copy
 * (hoursOverLineOf) reaches the hostile V through roadmap-copy's re-export
 * (ruling 38).
 *
 * Pure and client-safe (ruling 39): it reaches only roadmap-types,
 * roadmap-lexicon, synonyms and life-day at run time. No Prisma, model,
 * clock, cookie or cache module.
 *
 * Real now (lane 0): GOAL_PARAM and the types. Every function is a shell
 * that throws `Not yet: <name>` until lane 3 lands it (§22.17). Lane 3
 * removes each STUB marker, and this file's eslint line with the last of them.
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- lane-0 shells: the frozen signatures name parameters only lane 3's bodies read (§22.17). */
import { notYet, type GoalSlot, type RoadmapStatus } from "./roadmap-types";
import type { Track } from "./life-types";

// ═══ Real now (lane 0) ══════════════════════════════════════════════════════

/** ?goal=<roadmapId>: which goal a page shows. */
export const GOAL_PARAM = "goal";

/** A goal as the seat rules read it. */
export interface GoalRow {
  id: string;
  status: RoadmapStatus;
  slot: number | null;
  label: string | null;
  fieldId: string | null;
  track: Track;
  areaName: string;
  hoursPerWeek: number;
  /** ISO time. */
  updatedAt: string;
}
export interface GoalSeats {
  /** DRAFT and ACTIVE, in slot order with a NULL slot last. */
  open: GoalRow[];
  paused: GoalRow[];
  /** The slots 1..goalsMax no open row holds. */
  free: GoalSlot[];
  full: boolean;
}
export interface ShareGoal {
  roadmapId: string;
  status: RoadmapStatus;
  hoursPerWeek: number;
  fieldId: string | null;
}
export interface GoalShare {
  share: number;
  fieldShare: number;
  hours: number;
  of: number;
  fieldOf: number;
}
export interface AimLineCandidate {
  roadmapId: string;
  slot: GoalSlot;
  kind: "START" | "DRAFT" | "SET";
  ready: boolean;
}

// ═══ Shells (lane 3) ════════════════════════════════════════════════════════

/** goalsMax defaults to GOALS_MAX. */
// STUB: lane 3 implements (§23.2)
export function seatsOf(rows: readonly GoalRow[], goalsMax?: number): GoalSeats {
  return notYet("seatsOf");
}

/** The lowest free slot, or null when full. */
// STUB: lane 3 implements (§23.2)
export function seatForNewOf(rows: readonly GoalRow[], goalsMax?: number): GoalSlot | null {
  return notYet("seatForNewOf");
}

/** The row's own slot when free, else the lowest free one, else null. */
// STUB: lane 3 implements (§23.2)
export function seatForReopenOf(row: Pick<GoalRow, "id" | "slot">, rows: readonly GoalRow[], goalsMax?: number): GoalSlot | null {
  return notYet("seatForReopenOf");
}

/** s_g = h_g ÷ Σh over DRAFT and ACTIVE goals; fieldShare within the same Field; one goal gives exactly 1 and 1. */
// STUB: lane 3 implements (§23.2)
export function sharesOf(goals: readonly ShareGoal[]): Record<string, GoalShare> {
  return notYet("sharesOf");
}

/** taken = Σh of the other DRAFT and ACTIVE goals; left = max(0, HOURS_MAX − taken). */
// STUB: lane 3 implements (§23.2)
export function hoursRoomOf(goals: readonly ShareGoal[], exceptId: string | null): { taken: number; left: number } {
  return notYet("hoursRoomOf");
}

/** "Your goals already take 34 h; this one can have up to 6 h". */
// STUB: lane 3 implements (§23.2)
export function hoursOverLineOf(taken: number, left: number): string {
  return notYet("hoursOverLineOf");
}

/** Round robin by seat within `max` (default WEEK_QUEST_ROWS_TODAY); one goal gives its first 3, byte-identical to today. */
// STUB: lane 3 implements (§23.2)
export function todayRowsOf<T>(perGoal: readonly { slot: GoalSlot; rows: readonly T[] }[], max?: number): { picked: { slot: GoalSlot; row: T }[]; more: { slot: GoalSlot; count: number }[] } {
  return notYet("todayRowsOf");
}

/**
 * A ready START (lowest seat), then a waiting DRAFT (lowest seat), then SET
 * only while open < goalsMax (default GOALS_MAX, never the fixed 3: ruling
 * 53), so with GOALS_MAX 1 SET shows only with no goal open, as today.
 */
// STUB: lane 3 implements (§23.2)
export function aimLinePickOf(candidates: readonly AimLineCandidate[], open: number, goalsMax?: number): AimLineCandidate | null {
  return notYet("aimLinePickOf");
}

/** The Area name with the seat glyph. */
// STUB: lane 3 implements (§23.2)
export function defaultGoalLabelOf(row: Pick<GoalRow, "areaName" | "slot">): string {
  return notYet("defaultGoalLabelOf");
}

/** Yours, else the default; never the model's. */
// STUB: lane 3 implements (§23.2)
export function goalLabelOf(row: GoalRow): { text: string; yours: boolean } {
  return notYet("goalLabelOf");
}

/** The label equals another DRAFT, ACTIVE or PAUSED goal's (ruling 26). */
// STUB: lane 3 implements (§23.2)
export function labelClashOf(label: string, rows: readonly GoalRow[], exceptId: string | null): boolean {
  return notYet("labelClashOf");
}

/** One line of at most GOAL_LABEL_MAX characters, or null. */
// STUB: lane 3 implements (§23.2)
export function cleanGoalLabelOf(raw: unknown): string | null {
  return notYet("cleanGoalLabelOf");
}

/** goalHrefOf("/you/roadmap", id) → "/you/roadmap?goal=<id>", keeping a "#anchor" at the end; null → base. */
// STUB: lane 3 implements (§23.2)
export function goalHrefOf(base: string, roadmapId: string | null): string {
  return notYet("goalHrefOf");
}

/** The id only when it is one of `rows` (the user's own); anything else null. */
// STUB: lane 3 implements (§23.2)
export function goalOfParam(param: unknown, rows: readonly GoalRow[]): string | null {
  return notYet("goalOfParam");
}

/** "xtnl:roadmap:intake:<id>", or "xtnl:roadmap:intake:new" (whose first read also takes over the legacy "xtnl:roadmap:intake" once; ruling 66). */
// STUB: lane 3 implements (§23.2)
export function intakeAutosaveKeyOf(roadmapId: string | null): string {
  return notYet("intakeAutosaveKeyOf");
}
