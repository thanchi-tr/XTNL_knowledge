/**
 * Up to 3 goals (roadmap revision 5; docs/life-plan/roadmap-contracts.md
 * §23.2, written by lane 0 and implemented by lane 3).
 *
 * Seats, one person's week (the shares and the hours' room), Today's round
 * robin, the aim line's pick, goal labels, the `?goal=` link and the
 * intake's autosave key. Keys and numbers only; its one line of copy
 * (hoursOverLineOf) reaches the hostile V through roadmap-copy's re-export
 * (ruling 38).
 *
 * Pure and client-safe (ruling 39): it reaches only roadmap-types (and
 * life-types, for a type) at run time. No Prisma, model, clock, cookie or
 * cache module.
 *
 * GOALS_MAX is 1 until lane 4's last commit, so every answer here for
 * today's one-goal user is today's: one seat, a share of exactly 1, Today's
 * first 3 week-quest rows, and SET only with no goal open (ruling 53).
 */
import {
  GOALS_MAX,
  GOAL_LABEL_MAX,
  GOAL_SLOTS,
  GOAL_SLOTS_MAX,
  HOLD_STATUSES,
  HOURS_MAX,
  SEAT_STATUSES,
  WEEK_QUEST_ROWS_TODAY,
  isGoalSlot,
  type GoalSlot,
  type RoadmapStatus,
} from "./roadmap-types";
import type { Track } from "./life-types";

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

// ═══ Private helpers ═════════════════════════════════════════════════════════

const holdsSeat = (status: unknown): boolean => SEAT_STATUSES.includes(status as RoadmapStatus);
const holdsDomains = (status: unknown): boolean => HOLD_STATUSES.includes(status as RoadmapStatus);

/** The effective cap: a whole number within 1..GOAL_SLOTS_MAX; GOALS_MAX when absent or not a number. */
function capOf(goalsMax: number | undefined): number {
  const n = typeof goalsMax === "number" && Number.isFinite(goalsMax) ? Math.floor(goalsMax) : GOALS_MAX;
  return Math.max(1, Math.min(GOAL_SLOTS_MAX, n));
}

/** A stored slot, read as a seat: a slot outside 1..GOAL_SLOTS_MAX reads as none (NULL). */
const seatOf = (slot: unknown): GoalSlot | null => (isGoalSlot(slot) ? slot : null);
const seatRank = (slot: unknown): number => seatOf(slot) ?? GOAL_SLOTS_MAX + 1;
const cmpText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Each id once (the first row wins), dropping anything that isn't a row. */
function uniqueRows(rows: readonly GoalRow[]): GoalRow[] {
  const seen = new Set<string>();
  const out: GoalRow[] = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r !== "object" || typeof r.id !== "string" || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

/** Slot order, a NULL slot last; then the older row, then the id (a total order). */
const bySeat = (a: GoalRow, b: GoalRow): number => seatRank(a.slot) - seatRank(b.slot) || cmpText(String(a.updatedAt), String(b.updatedAt)) || cmpText(a.id, b.id);
/** The most recently changed first (a paused goal has no seat on screen: ruling 55); then the id. */
const byRecent = (a: GoalRow, b: GoalRow): number => cmpText(String(b.updatedAt), String(a.updatedAt)) || cmpText(a.id, b.id);

/** A goal's hours as the sums read them: a finite, non-negative number, else 0. */
const hoursOf = (h: unknown): number => (typeof h === "number" && Number.isFinite(h) && h > 0 ? h : 0);

/** Each roadmap id once (the first wins), dropping anything that isn't a goal. */
function uniqueGoals(goals: readonly ShareGoal[]): ShareGoal[] {
  const seen = new Set<string>();
  const out: ShareGoal[] = [];
  for (const g of Array.isArray(goals) ? goals : []) {
    if (!g || typeof g !== "object" || typeof g.roadmapId !== "string" || seen.has(g.roadmapId)) continue;
    seen.add(g.roadmapId);
    out.push(g);
  }
  return out;
}

/** Hours as the line writes them: whole hours as they are, else one decimal ("2.5"). */
function hoursText(h: number): string {
  const v = typeof h === "number" && Number.isFinite(h) ? Math.max(0, h) : 0;
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** Line and paragraph separators, LRM and RLM, and the bidi embeddings, overrides and isolates (code points). */
const LABEL_BREAKS: ReadonlySet<number> = new Set([0x2028, 0x2029, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]);
/** Line breaks, other control characters and bidi controls: a label is one plain line. */
const isLabelBreak = (ch: string): boolean => /\p{Cc}/u.test(ch) || LABEL_BREAKS.has(ch.codePointAt(0) ?? 0);
const oneLine = (s: string): string =>
  Array.from(s, (ch) => (isLabelBreak(ch) ? " " : ch))
    .join("")
    .replace(/\s+/gu, " ")
    .trim();
/** Labels compare without case, width or spacing ("Guitar" = "guitar " = "ＧＵＩＴＡＲ"). */
const labelKeyOf = (s: string): string => oneLine(s.normalize("NFKC")).toLowerCase();

/** The intake's autosave key's stem (roadmap-autosave's INTAKE_STORAGE_KEY, the legacy key; ruling 66). */
const INTAKE_KEY_STEM = "xtnl:roadmap:intake";

// ═══ Seats (§23.1) ═══════════════════════════════════════════════════════════

/**
 * The seats: `open` (DRAFT and ACTIVE) in slot order with a NULL slot last,
 * `paused` (most recently changed first), and `free`: the slots
 * 1..goalsMax no open row holds. A NULL-slot open row (saved by old code
 * before lane 3; ruling 24) still counts: it takes the lowest slot no other
 * open row holds. `full` is open ≥ goalsMax (default GOALS_MAX). DONE and
 * ARCHIVED rows hold nothing.
 */
export function seatsOf(rows: readonly GoalRow[], goalsMax?: number): GoalSeats {
  const cap = capOf(goalsMax);
  const all = uniqueRows(rows);
  const open = all.filter((r) => holdsSeat(r.status)).sort(bySeat);
  const paused = all.filter((r) => r.status === "PAUSED").sort(byRecent);
  const held = new Set<GoalSlot>();
  for (const r of open) {
    const s = seatOf(r.slot);
    if (s != null) held.add(s);
  }
  for (const r of open) {
    if (seatOf(r.slot) != null) continue;
    const s = GOAL_SLOTS.find((x) => !held.has(x));
    if (s !== undefined) held.add(s);
  }
  return { open, paused, free: GOAL_SLOTS.filter((s) => s <= cap && !held.has(s)), full: open.length >= cap };
}

/** The lowest free slot, or null when full (ANOTHER_ACTIVE at GOALS_MAX 1, GOALS_FULL at 3: the caller's words). */
export function seatForNewOf(rows: readonly GoalRow[], goalsMax?: number): GoalSlot | null {
  const seats = seatsOf(rows, goalsMax);
  return seats.full ? null : (seats.free[0] ?? null);
}

/**
 * The seat a reopened row takes (undo-discard, resume): its own slot when
 * it is free, else the lowest free one, else null. The row itself never
 * counts against its own reopening (it is read out of `rows` by id).
 */
export function seatForReopenOf(row: Pick<GoalRow, "id" | "slot">, rows: readonly GoalRow[], goalsMax?: number): GoalSlot | null {
  const id = row && typeof row === "object" ? row.id : null;
  const seats = seatsOf(
    uniqueRows(rows).filter((r) => r.id !== id),
    goalsMax
  );
  if (seats.full) return null;
  const own = seatOf(row?.slot);
  if (own != null && seats.free.includes(own)) return own;
  return seats.free[0] ?? null;
}

// ═══ One person's week (§23.3) ═══════════════════════════════════════════════

/**
 * The shares: s_g = h_g ÷ Σh over the DRAFT and ACTIVE goals; fieldShare =
 * h_g ÷ Σh over the DRAFT and ACTIVE goals with the same non-null fieldId (a
 * track goal's is 1). A goal outside SEAT_STATUSES gets 0 and 0 (a PAUSED
 * goal places nothing: ruling 25). One goal gives exactly 1 and 1. With no
 * hours to divide (every goal at 0), the seat goals split evenly. `of` is
 * Σh over the seat goals, `fieldOf` the same-Field sum (a track goal's own
 * hours). The golden: 5, 1 and 5 h give 5/11, 1/11 and 5/11.
 */
export function sharesOf(goals: readonly ShareGoal[]): Record<string, GoalShare> {
  const list = uniqueGoals(goals);
  const seat = list.filter((g) => holdsSeat(g.status));
  const of = seat.reduce((s, g) => s + hoursOf(g.hoursPerWeek), 0);
  const fieldSum = new Map<string, number>();
  const fieldCount = new Map<string, number>();
  for (const g of seat) {
    if (g.fieldId == null) continue;
    fieldSum.set(g.fieldId, (fieldSum.get(g.fieldId) ?? 0) + hoursOf(g.hoursPerWeek));
    fieldCount.set(g.fieldId, (fieldCount.get(g.fieldId) ?? 0) + 1);
  }
  const entries = list.map((g): [string, GoalShare] => {
    const h = hoursOf(g.hoursPerWeek);
    if (!holdsSeat(g.status)) return [g.roadmapId, { share: 0, fieldShare: 0, hours: h, of, fieldOf: g.fieldId != null ? (fieldSum.get(g.fieldId) ?? 0) : 0 }];
    const share = of > 0 ? h / of : 1 / seat.length;
    if (g.fieldId == null) return [g.roadmapId, { share, fieldShare: 1, hours: h, of, fieldOf: h }];
    const fOf = fieldSum.get(g.fieldId) ?? 0;
    const fieldShare = fOf > 0 ? h / fOf : 1 / (fieldCount.get(g.fieldId) ?? 1);
    return [g.roadmapId, { share, fieldShare, hours: h, of, fieldOf: fOf }];
  });
  // fromEntries defines own properties, so no id is ever read as a prototype name.
  return Object.fromEntries(entries);
}

/** taken = Σh of the DRAFT and ACTIVE goals other than exceptId; left = max(0, HOURS_MAX − taken). A PAUSED goal's hours leave the sum (ruling 25). */
export function hoursRoomOf(goals: readonly ShareGoal[], exceptId: string | null): { taken: number; left: number } {
  const taken = uniqueGoals(goals)
    .filter((g) => holdsSeat(g.status) && g.roadmapId !== exceptId)
    .reduce((s, g) => s + hoursOf(g.hoursPerWeek), 0);
  return { taken, left: Math.max(0, HOURS_MAX - taken) };
}

/** The intake's and resume's refusal when the hours would pass HOURS_MAX: "Your goals already take 34 h; this one can have up to 6 h". */
export function hoursOverLineOf(taken: number, left: number): string {
  return `Your goals already take ${hoursText(taken)} h; this one can have up to ${hoursText(left)} h`;
}

// ═══ Today (§23.3) ═══════════════════════════════════════════════════════════

/**
 * Today's week-quest rows, round robin by seat within `max` (default
 * WEEK_QUEST_ROWS_TODAY): each round gives one row to each goal in seat
 * order while it has rows left, until `max` are picked. So 1 goal gives its
 * first 3 (byte-identical to today), 2 goals give 2 and 1 (the lower seat
 * first), 3 goals 1 each, and a goal with fewer rows than its share gives
 * its rest to the next seat. Each goal's rows keep their own order;
 * `picked` lists them by seat. `more` counts each goal's rows left out
 * ("n more" leads to its roadmap page), only where some are, by seat. An
 * entry whose slot isn't a seat is left out.
 */
export function todayRowsOf<T>(perGoal: readonly { slot: GoalSlot; rows: readonly T[] }[], max?: number): { picked: { slot: GoalSlot; row: T }[]; more: { slot: GoalSlot; count: number }[] } {
  const cap = max === undefined ? WEEK_QUEST_ROWS_TODAY : typeof max === "number" && Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 0;
  const list: readonly { slot: GoalSlot; rows: readonly T[] }[] = Array.isArray(perGoal) ? perGoal : [];
  const goals: { slot: GoalSlot; rows: readonly T[] }[] = list
    .filter((g) => g && isGoalSlot(g.slot))
    .map((g) => ({ slot: g.slot, rows: Array.isArray(g.rows) ? (g.rows as readonly T[]) : [] }))
    .sort((a, b) => a.slot - b.slot);
  const taken = goals.map(() => 0);
  let left = cap;
  while (left > 0) {
    let moved = false;
    for (let i = 0; i < goals.length && left > 0; i++) {
      if (taken[i] >= goals[i].rows.length) continue;
      taken[i] += 1;
      left -= 1;
      moved = true;
    }
    if (!moved) break;
  }
  return {
    picked: goals.flatMap((g, i) => g.rows.slice(0, taken[i]).map((row) => ({ slot: g.slot, row }))),
    more: goals.map((g, i) => ({ slot: g.slot, count: g.rows.length - taken[i] })).filter((m) => m.count > 0),
  };
}

/**
 * The one aim line (ruling 53): a ready START (lowest seat), then a ready
 * (waiting) DRAFT (lowest seat), then a ready SET, but only while
 * open < goalsMax (default GOALS_MAX, never the fixed 3); null when none
 * applies. A candidate that isn't ready never shows: `ready` is the
 * caller's account of todayAimLineOf's own conditions for that line. With
 * GOALS_MAX 1, SET shows only with no goal open, as today.
 */
export function aimLinePickOf(candidates: readonly AimLineCandidate[], open: number, goalsMax?: number): AimLineCandidate | null {
  const cap = capOf(goalsMax);
  const ready = (Array.isArray(candidates) ? candidates : []).filter((c) => c && c.ready === true && isGoalSlot(c.slot));
  const lowest = (kind: AimLineCandidate["kind"]): AimLineCandidate | null =>
    ready.filter((c) => c.kind === kind).sort((a, b) => a.slot - b.slot || cmpText(String(a.roadmapId), String(b.roadmapId)))[0] ?? null;
  const setRoom = typeof open === "number" && Number.isFinite(open) && open < cap;
  return lowest("START") ?? lowest("DRAFT") ?? (setRoom ? lowest("SET") : null);
}

// ═══ Labels (§23.1) ══════════════════════════════════════════════════════════

/**
 * The default label: the Area name, one line (the seat glyph sits beside
 * it as a glyph, never as text: ui-motion §15.1). An Area with no name
 * reads "Goal {k}" ("Goal" with no seat).
 */
export function defaultGoalLabelOf(row: Pick<GoalRow, "areaName" | "slot">): string {
  const name = typeof row?.areaName === "string" ? oneLine(row.areaName) : "";
  if (name) return name;
  const seat = seatOf(row?.slot);
  return seat == null ? "Goal" : `Goal ${seat}`;
}

/** The label the switcher shows: yours (Roadmap.label, cleaned), else the default. Never the model's: the column holds yours only. A PAUSED row has no seat on screen (ruling 55). */
export function goalLabelOf(row: GoalRow): { text: string; yours: boolean } {
  const yours = cleanGoalLabelOf(row?.label);
  if (yours != null) return { text: yours, yours: true };
  return { text: defaultGoalLabelOf({ areaName: row?.areaName, slot: row?.status === "PAUSED" ? null : row?.slot }), yours: false };
}

/**
 * The label equals another DRAFT, ACTIVE or PAUSED goal's shown label (yours,
 * else its default; ruling 26), ignoring case, width and spacing. So two
 * goals in one Area clash until one has a label of its own (LABEL_CLASH).
 * An empty label clashes with nothing.
 */
export function labelClashOf(label: string, rows: readonly GoalRow[], exceptId: string | null): boolean {
  const key = typeof label === "string" ? labelKeyOf(label) : "";
  if (!key) return false;
  return uniqueRows(rows).some((r) => r.id !== exceptId && holdsDomains(r.status) && labelKeyOf(goalLabelOf(r).text) === key);
}

/** One line of at most GOAL_LABEL_MAX characters (code points, as the column counts them; a longer one is cut), or null (not a string, or nothing left). */
export function cleanGoalLabelOf(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const line = oneLine(raw);
  if (!line) return null;
  const chars = Array.from(line);
  return chars.length <= GOAL_LABEL_MAX ? line : chars.slice(0, GOAL_LABEL_MAX).join("").trimEnd();
}

// ═══ Links and client state (§23.5) ══════════════════════════════════════════

/**
 * goalHrefOf("/you/roadmap", id) → "/you/roadmap?goal=<id>": the goal
 * param added (replacing any earlier one; other params kept as written),
 * a "#anchor" kept at the end. null (or "") → `base` unchanged.
 */
export function goalHrefOf(base: string, roadmapId: string | null): string {
  if (typeof roadmapId !== "string" || roadmapId === "") return base;
  const hashAt = base.indexOf("#");
  const head = hashAt < 0 ? base : base.slice(0, hashAt);
  const hash = hashAt < 0 ? "" : base.slice(hashAt);
  const queryAt = head.indexOf("?");
  const path = queryAt < 0 ? head : head.slice(0, queryAt);
  const params = queryAt < 0 ? [] : head.slice(queryAt + 1).split("&").filter((p) => p !== "" && p.split("=")[0] !== GOAL_PARAM);
  params.push(`${GOAL_PARAM}=${encodeURIComponent(roadmapId)}`);
  return `${path}?${params.join("&")}${hash}`;
}

/** The id only when it is one of `rows` (the user's own); anything else (a forged id, an array, a non-string) is null, and the page shows the lowest-seat goal. */
export function goalOfParam(param: unknown, rows: readonly GoalRow[]): string | null {
  if (typeof param !== "string" || param === "") return null;
  return uniqueRows(rows).some((r) => r.id === param) ? param : null;
}

/** "xtnl:roadmap:intake:<id>", or "xtnl:roadmap:intake:new" (whose first read also takes over the legacy "xtnl:roadmap:intake" once: the form's part; ruling 66). */
export function intakeAutosaveKeyOf(roadmapId: string | null): string {
  return typeof roadmapId === "string" && roadmapId !== "" ? `${INTAKE_KEY_STEM}:${roadmapId}` : `${INTAKE_KEY_STEM}:new`;
}
