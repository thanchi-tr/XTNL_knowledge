/**
 * The Status panel (blueprint 1.1; docs/life-plan/blueprint-plan-2026-10-22.md P1; decisions D1 and D2): the five
 * attributes of the desired self, read from what the app already measures, and Capital as a reading only. Pure and
 * client-importable: no Prisma, no clock. /you builds it from the sheet's own life view and Knowledge row (loadSheet),
 * GET /api/mobile/v1/status from the same two reads (status-panel-server.ts), so the phone and the browser say the
 * same levels.
 *
 *   Vitality             the Body track (life-tracks.ts LifeTrackRow: level, meter, depth cap, kept weeks, pips, line)
 *   Intellect            Knowledge (sheet-math KnowledgeRow: the Fields' character level, its week's gain)
 *   Craft, Duty, Care    their tracks
 *   Capital              AUD won per month from Deals at stage WON (capitalReadingOf): a reading, no XP, no level
 *
 * A reading, never a writer, and never a second formula: each row's level, meter, cap, kept streak, pips and line are
 * the track's or Knowledge's own, passed through (scripts/status-check.ts pins both, and that nothing here writes).
 * The track names stay (Body, Duty, Craft, Care: the frozen life-tracks contract) with the blueprint's word beside
 * them where it differs (Vitality, Intellect). The track rows are shown once life counts (life.launched), as the Life
 * tracks card did before this one replaced it: before that, or on a life read that failed, Intellect stands alone and
 * no track level is claimed. P4's avatar targets (avatar.ts, blueprint 1.2) are the optional third input: each row
 * carries its attribute's targets ("Weight 82.4 → 75 kg · 38% of the way · on pace"), Capital's go with the Capital
 * row, and a target whose attribute has no row shown yet (before life counts) is kept apart (`unplaced`), never lost.
 * They are readings too: no target moves a level. P5's skills (competency.ts, blueprint 1.5) are the optional fourth:
 * each row counts its attribute's live skills (`skills`, "2 skills" on the card, linking the Skills page), and a count
 * moves nothing either (a skill's hours and tier are its own, never a level's). P28's conditions (skill-decay.ts,
 * blueprint 3.1b) are the optional fifth, only while DECAY_LAUNCH_DAY is in force: each row carries its attribute's
 * condition ("Body 82% · 12 days idle"), and a condition moves no level either (it lowers only what the traits read).
 *
 *   statusPanelOf(life, knowledge, avatar?, skills?, conditions?)   { launched, rows, capitalTargets, unplaced }:
 *                                                            Vitality, Intellect, Craft, Duty, Care, each with its
 *                                                            targets, its skill count and (P28) its condition
 *   capitalReadingOf(deals, month)                           AUD won in one month: cents, the deals, its words
 *   capitalPanelOf(deals, today, months?)                    this month and the CAPITAL_MONTHS - 1 before it, newest
 *                                                            first; null when no deal was won in them
 *   capitalSinceDay(today, months?)                          the first life day the Capital read needs
 */
import { dayKeyOf, monthKeyOf, type DayKey } from "./life-day";
import type { LifeSigil, LifeTrackRow, LifeTracksView, WeekMark } from "./life-tracks";
import type { Track } from "./life-types";
import { formatMoney } from "./deals";
import { monthLabelOf, shiftMonth, type MonthKey } from "./task-style";
import { knowledgeLine, type KnowledgeRow } from "../components/home/sheet-math";
import type { AvatarTargetView, AvatarView } from "./avatar";
import type { SkillView } from "./competency";
import type { Condition } from "./skill-decay";

// ── The five attributes ─────────────────────────────────────────────────────

export type StatusKey = "VITALITY" | "INTELLECT" | "CRAFT" | "DUTY" | "CARE";

/** The panel's order (D1): Vitality, Intellect, Craft, Duty, Care. */
export const STATUS_KEYS: readonly StatusKey[] = ["VITALITY", "INTELLECT", "CRAFT", "DUTY", "CARE"];

/** The blueprint's word for each attribute. */
export const STATUS_NAME: Readonly<Record<StatusKey, string>> = { VITALITY: "Vitality", INTELLECT: "Intellect", CRAFT: "Craft", DUTY: "Duty", CARE: "Care" };

/** What each attribute reads: a life track, or Knowledge (D2: the cognitive attribute). */
export const STATUS_SOURCE: Readonly<Record<StatusKey, Track | "KNOWLEDGE">> = { VITALITY: "BODY", INTELLECT: "KNOWLEDGE", CRAFT: "CRAFT", DUTY: "DUTY", CARE: "CARE" };

/** Knowledge's own name, as the Life tracks card and the radar's sources call it. */
export const KNOWLEDGE_NAME = "Knowledge";

/**
 * The card's title and its aside: with the tracks, how a level is held; with Intellect alone, where it comes from.
 * The title is "Attributes" since blueprint P2 (D6: the five axes are Attributes, the radar's 13 are Traits); the
 * code keeps the Status names (the blueprint's "Status Panel", GET /status, data-tour you-status).
 */
export const STATUS_TITLE = "Attributes";
export const STATUS_ASIDE = "levels capped by kept weeks and paid goals";
export const STATUS_ASIDE_FIELDS = "from your Fields";

/** At most this many judged weeks of pips per row (as the Life tracks card drew them). */
export const STATUS_PIPS = 8;

/** One attribute's row: its track's (or Knowledge's) own figures, under the blueprint's word. */
export interface StatusRow {
  key: StatusKey;
  /** The blueprint's word: Vitality, Intellect, Craft, Duty, Care. */
  attribute: string;
  /** What it reads, by its own name: Body, Knowledge, Craft, Duty, Care (the frozen track names). */
  name: string;
  sigil: LifeSigil | "know";
  source: Track | "KNOWLEDGE";
  level: number;
  /** 0..1 toward level + 1 now (1 at the cap): the track's meter, or Knowledge's. */
  progress: number;
  /** 0..1 at the end of last life week (Knowledge: 7 days ago) when the level was the same then, else 0; never above progress. */
  banked: number;
  /** The track's depth cap; null for Intellect (Knowledge has none). */
  cap: number | null;
  /** XP is banked at the cap: only kept weeks (or a paid goal) raise the level. Never for Intellect. */
  atCap: boolean;
  /** The trailing run of kept weeks; null for Intellect. */
  keptStreak: number | null;
  /** The last ≤ STATUS_PIPS judged weeks, oldest first, never padded (none for Intellect). */
  weeks: WeekMark[];
  /** The track's own line (life-tracks trackLine), or Knowledge's (sheet-math knowledgeLine). */
  line: string;
  /** What fills the meter: life XP for a track, review points for Intellect. */
  unit: "xp" | "pts";
  /** Its avatar targets (P4), in their order; none without the avatar input. */
  targets: AvatarTargetView[];
  /** Its live skills (P5), counted; 0 without the skills input. */
  skills: number;
  /** Its condition (P28: skill-decay.ts), only while condition decay is in force; null otherwise. Never moves `level`. */
  condition: Pick<Condition, "condition" | "idleDays"> | null;
}

export interface StatusPanel {
  /** Life counts (the life view is launched): the four track rows are in. */
  launched: boolean;
  /** In STATUS_KEYS order: five once life counts, Intellect alone before. */
  rows: StatusRow[];
  /** Capital's targets (revenue a month, or the user's own), shown with the Capital row. */
  capitalTargets: AvatarTargetView[];
  /** Targets whose attribute has no row shown (a track's before life counts): shown apart, never dropped. */
  unplaced: AvatarTargetView[];
}

function trackRow(key: StatusKey, r: LifeTrackRow): StatusRow {
  return {
    key,
    attribute: STATUS_NAME[key],
    name: r.name,
    sigil: r.sigil,
    source: r.track,
    level: r.level,
    progress: r.now,
    banked: r.banked,
    cap: r.cap,
    atCap: r.atCap,
    keptStreak: r.keptStreak,
    weeks: r.weeks.slice(-STATUS_PIPS),
    line: r.line,
    unit: "xp",
    targets: [],
    skills: 0,
    condition: null,
  };
}

function intellectRow(k: KnowledgeRow): StatusRow {
  return {
    key: "INTELLECT",
    attribute: STATUS_NAME.INTELLECT,
    name: KNOWLEDGE_NAME,
    sigil: "know",
    source: "KNOWLEDGE",
    level: k.level,
    progress: k.now,
    banked: k.banked,
    cap: null,
    atCap: false,
    keptStreak: null,
    weeks: [],
    line: knowledgeLine(k),
    unit: "pts",
    targets: [],
    skills: 0,
    condition: null,
  };
}

/**
 * The five rows, in STATUS_KEYS order, each its source's own figures. `life` is loadLifeTracks' view (the sheet's
 * s.life), `knowledge` the sheet's Knowledge row (s.knowledge). Not launched (before launch, or a failed life read's
 * notLaunchedView): Intellect alone. `avatar` (P4, optional: null or omitted reads as no targets) hands each row its
 * attribute's targets, in the avatar's own order; Capital's go to capitalTargets, and one whose row isn't shown to
 * unplaced. Every figure of a row stays its source's: a target never moves a level. `skills` (P5, optional: null or
 * omitted reads as none) gives each shown row the count of its attribute's live skills. `conditions` (P28, optional:
 * null or omitted while condition decay is off) gives each shown row its attribute's condition.
 */
export function statusPanelOf(
  life: Pick<LifeTracksView, "launched" | "rows">,
  knowledge: KnowledgeRow,
  avatar?: Pick<AvatarView, "targets"> | null,
  skills?: readonly Pick<SkillView, "attribute">[] | null,
  conditions?: Readonly<Partial<Record<StatusKey, Pick<Condition, "condition" | "idleDays">>>> | null
): StatusPanel {
  const byTrack = new Map(life.rows.map((r) => [r.track, r]));
  const rows = STATUS_KEYS.flatMap((key): StatusRow[] => {
    const source = STATUS_SOURCE[key];
    if (source === "KNOWLEDGE") return [intellectRow(knowledge)];
    const r = life.launched ? byTrack.get(source) : undefined;
    return r ? [trackRow(key, r)] : [];
  });
  const shown = new Map(rows.map((r) => [r.key as string, r]));
  const capitalTargets: AvatarTargetView[] = [];
  const unplaced: AvatarTargetView[] = [];
  for (const t of avatar?.targets ?? []) {
    if (t.attribute === "CAPITAL") capitalTargets.push(t);
    else (shown.get(t.attribute)?.targets ?? unplaced).push(t);
  }
  for (const k of skills ?? []) {
    const row = shown.get(k.attribute);
    if (row) row.skills += 1;
  }
  if (conditions) for (const r of rows) r.condition = conditions[r.key] ? { condition: conditions[r.key]!.condition, idleDays: conditions[r.key]!.idleDays } : null;
  return { launched: life.launched, rows, capitalTargets, unplaced };
}

// ── Capital: a reading only (D1) ────────────────────────────────────────────

/** "Capital": the reading's name, and what it is (never a level, never XP). */
export const CAPITAL_NAME = "Capital";
export const CAPITAL_SUB = "reading only";

/** This month and the two before it. */
export const CAPITAL_MONTHS = 3;

/** The stage that counts: a deal won. */
export const CAPITAL_STAGE = "WON";

/** A deal as the Capital read selects it (deals-server's columns; a fixture may pass strings for the instants). */
export interface CapitalDeal {
  stage: string;
  /** AUD cents (≥ 0). */
  valueCents: number;
  /** When it was won; a deal with none is not counted. */
  closedAt: Date | string | null;
  /** An archived deal is not counted (deals-server reads none). */
  archivedAt?: Date | string | null;
}

export interface CapitalReading {
  month: MonthKey;
  /** "October 2026". */
  label: string;
  /** AUD cents won in the month: an integer, never a float. */
  wonCents: number;
  /** "$12,400" (deals formatMoney). */
  won: string;
  /** How many deals were won in it. */
  deals: number;
}

export interface CapitalPanel extends CapitalReading {
  /** "3 deals won in October" or "No deal won in October yet". */
  line: string;
  /** The months before, newest first: "September $8,200 · August $0". */
  history: string;
  /** The whole window, newest first (this month first). */
  months: CapitalReading[];
}

const instantOf = (v: Date | string | null | undefined): Date | null => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
};

/** A won, unarchived deal with a close instant and a whole, non-negative value: what Capital counts. */
function countedDeal(d: CapitalDeal): { month: MonthKey; cents: number } | null {
  if (d.stage !== CAPITAL_STAGE || instantOf(d.archivedAt) !== null) return null;
  const at = instantOf(d.closedAt);
  if (!at || !Number.isFinite(d.valueCents)) return null;
  return { month: monthKeyOf(dayKeyOf(at)), cents: Math.max(0, Math.round(d.valueCents)) };
}

const monthName = (month: MonthKey): string => monthLabelOf(month).split(" ")[0];

/**
 * AUD won in one month: every deal at stage WON, not archived, whose close falls in that month's life days (Sydney;
 * the life day turns at 04:00, as every day in the app does). Cents stay whole; nothing is read but the deals passed.
 */
export function capitalReadingOf(deals: readonly CapitalDeal[], month: MonthKey): CapitalReading {
  let wonCents = 0;
  let count = 0;
  for (const d of deals) {
    const c = countedDeal(d);
    if (!c || c.month !== month) continue;
    wonCents += c.cents;
    count += 1;
  }
  return { month, label: monthLabelOf(month), wonCents, won: formatMoney(wonCents), deals: count };
}

/** The first life day the Capital read needs: the 1st of the window's first month. */
export function capitalSinceDay(today: DayKey, months: number = CAPITAL_MONTHS): DayKey {
  return `${shiftMonth(monthKeyOf(today), -(Math.max(1, Math.floor(months)) - 1))}-01`;
}

/**
 * The Capital row: this month's reading, with the months before it, newest first. Null when no deal was won in the
 * whole window: then the row is not shown (it is optional), and no "$0" is claimed for work that has no deals.
 */
export function capitalPanelOf(deals: readonly CapitalDeal[], today: DayKey, months: number = CAPITAL_MONTHS): CapitalPanel | null {
  const n = Math.max(1, Math.floor(months));
  const now = monthKeyOf(today);
  const window = Array.from({ length: n }, (_, i) => capitalReadingOf(deals, shiftMonth(now, -i)));
  if (window.every((m) => m.deals === 0)) return null;
  const [head, ...before] = window;
  const line = head.deals === 0 ? `No deal won in ${monthName(head.month)} yet` : `${head.deals} ${head.deals === 1 ? "deal" : "deals"} won in ${monthName(head.month)}`;
  return {
    ...head,
    line,
    history: before.map((m) => `${monthName(m.month)} ${m.won}`).join(" · "),
    months: window,
  };
}
