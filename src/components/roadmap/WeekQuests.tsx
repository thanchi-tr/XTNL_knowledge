"use client";

/**
 * Week quests (lane R5; F13, F14, F17; final-today-quests.html and the Now
 * section of final-roadmap.html; UI motion lane R1: ui-motion.md §3.3
 * screens 5 and 10, §7.5, §7.10). One component, three variants:
 *
 *   today    Today's quiet card inside .o9, after GoalsStrip (lane T mounts it
 *            as questsSlot). "Week quests · Milestone 2" with "until Sun",
 *            «pays nothing», one «Not medical advice · ask a professional»
 *            chip on a body plan, and the card Key (its one InfoTip: the
 *            legend, the footer, each glyph's words and every row's place,
 *            due days, quota and slip). At most WEEK_QUEST_ROWS_TODAY rows
 *            (open first) and an "n more" toggle. A row is its KindGlyph (the
 *            quest shape + its evidence badge; the started pip at 1+, the check
 *            badge when done), the code-owned label, "n of N unit", a thin
 *            meter on RAISE and ADD, the PipStrip on RAISE (when the row
 *            carries its due days), [m.link] on a quota row and "↓n" on a slip.
 *            RAISE and ADD are links; PRACTICE and STEP are one-line buttons
 *            that dispatch SEEK_TEMPLATE_EVENT (never a '#t-' link, never
 *            data-template-id); CHECKPOINT links to the roadmap's checkpoint.
 *            All done: one collapsed line. While lane T's wrapper carries
 *            data-compact (Close the day is prominent) the card is its one
 *            summary line until opened. No Ask, no count, no red, no link to
 *            /review, no shader, no loop, no burst (D10).
 *   aim      The Aim card's one line: PromiseRing "2/5 Week quests →" (to Today).
 *   roadmap  The Now section's week quests: "Week quests · until Sun
 *            «pays nothing»", the same row grammar, and each row's ▸ (a 40 px
 *            button and the panel right after it) holding its evidence in
 *            words, the due days, "the milestone counts 80% of these", the
 *            add-count line and its On Today / Log a score actions; the basis
 *            sheet behind a 40 px button. Nothing here is red either.
 *
 * Motion (SEEN only, through glyph/useSeen and the gateway): a row's meter
 * from the last-seen count (meter-fill, either direction), and its done check
 * (quest-done) once the measured count reaches N — on Today the check draw
 * only. Keys are roadmap-ui-model's plan basis (seenQuestWhat): Today's card
 * and the Now section share them, so a done check plays once per viewer. A
 * view without its roadmap and acceptance gives no key and nothing moves.
 *
 * Every figure is the row's branded progress (Measured | Recorded |
 * SelfReported) with its caption; every count carries its unit. Labels are
 * the frozen set's own (YoursText, CodeText and Domain names only); Domain,
 * practice and stage names are marked data-wc="name" for the word count
 * (§3.1). Revision 4 (F-R4-13, F-R4-14): a RAISE or ADD row of generator 2
 * carries its parts by Domain under the label; a body plan's health line is
 * one chip per card (D12), never a line per row.
 */
import Link from "next/link";
import { useId, useRef, useState, type ReactNode, type Ref } from "react";
import { Icon } from "@/components/ui/Icon";
import { Meter } from "@/components/ui/Meter";
import { PromiseRing } from "@/components/ui/PromiseRing";
import { SectionHeader } from "@/components/ui/Tabs";
import { cx } from "@/components/ui/cx";
import { Glyph, GlyphButton, KIND_GLYPH, KindGlyph, type GlyphState, type QuestKind } from "@/components/glyph/Glyph";
import { Chips, HonestyChip } from "@/components/glyph/HonestyChip";
import { CardKey, type KeyEntry } from "@/components/glyph/InfoTip";
import { PipStrip, type PipDay } from "@/components/glyph/PipStrip";
import { usePlayOnSeen, useSeenValue, type SeenKey } from "@/components/glyph/useSeen";
import type { TrackSigil } from "@/components/glyph/paths";
// Revision 5, lane 9: pv.named after a Gemini-named Domain in a row's label (contracts ruling 67)
import { NamedText, hasNamed } from "@/components/glyph/NamedMark";
import { NOT_RECORDED_HERE, type WeekQuestKind, type WeekQuestRow, type WeekQuestVariant, type WeekQuestsView } from "@/lib/roadmap-types";
import { seekTemplate } from "./roadmap-events";
import {
  HEALTH_LINE,
  PRACTICE_KEEP_SHARE_LINE,
  SHORT_ADD,
  SHORT_CONTEXT_ONLY,
  SHORT_HEALTH,
  SHORT_NOT_RECORDED,
  SHORT_PAYS_NOTHING,
  SHORT_WEEK_QUESTS,
  SINCE_QUEST_ITEM,
  WEEK_QUEST_CAPTIONS,
  WRITES_OFF_BANNER,
  addCountsLine,
  pastDueLine,
  placeSuffix,
  shortMore,
  shortUntil,
  weekQuestsAside,
  weekQuestsFooter,
  weekQuestsHeading,
  weekQuestsLegend,
  weekQuestsSummary,
  windowLabel,
} from "./roadmap-copy";
import { ROADMAP_CHECKPOINT_HREF, ROADMAP_NOW_HREF, TODAY_HREF } from "./roadmap-links";
import {
  healthChipShown,
  notesShownOf,
  partsLineOf,
  pipDaysOf,
  practiceNameOf,
  rowHealthOf,
  seenBasesOfWeekQuests,
  seenKeyOf,
  seenQuestWhat,
  weekQuestAccessibleName,
  weekQuestCountOf,
  weekQuestKindsOf,
  weekQuestProgressOf,
  weekQuestRowsForToday,
  weekQuestRowsShown,
  type SeenBases,
  type WeekQuestDueDays,
} from "./roadmap-ui-model";
import "./roadmap.css";

export interface WeekQuestsProps {
  variant: WeekQuestVariant;
  view: WeekQuestsView;
  /** The roadmap variant: "Log a score" opens the checkpoint sheet. */
  onLogCheckpoint?: () => void;
  /** The roadmap variant: "How these were set" opens the basis sheet. */
  onShowBasis?: () => void;
  /** The roadmap variant: today's life day (dates without a year; the PipStrip's today and past days). */
  today?: string;
  /** The roadmap variant: sentences the page already shows (the QUESTS_BEHIND banner), so a note says them once. */
  shownElsewhere?: readonly string[];
  /**
   * The seen bases a row's motion keys on (roadmap-ui-model): the living page passes seenBasesOfRoadmap(view),
   * so the Now section and Today's card share one key per row. Default: the view's own (seenBasesOfWeekQuests),
   * null when it doesn't carry its roadmap and acceptance (nothing moves).
   */
  bases?: SeenBases | null;
  /** The plan's own track sigil for a Practice row's quest glyph (§4.4). Default: body on a body plan's health rows, else craft. */
  track?: TrackSigil;
  /** The roadmap variant: false when the Now card already shows its one health chip (D12: one per card). Default: from the rows. */
  health?: boolean;
}

/**
 * The set was computed on this request and recorded nowhere: writes off and
 * not frozen. A set the live app froze is its stored record, and reads as one
 * (the contract §9.3: only values computed here read "not recorded on this server").
 */
export function liveHere(view: Pick<WeekQuestsView, "writesOff" | "frozen">): boolean {
  return view.writesOff && !view.frozen;
}

/** Whether a set shows on Today at all: an OPEN week with at least one row. */
export function weekQuestsShowOnToday(view: WeekQuestsView | null | undefined): view is WeekQuestsView {
  return Boolean(view && view.state === "OPEN" && view.rows.length > 0);
}

// ─── The row grammar (shared by Today and Now) ───────────────────────────────

/** Each week quest kind's quest glyph (KindGlyph's kinds). */
export const WEEK_QUEST_GLYPH_KIND: Readonly<Record<WeekQuestKind, QuestKind>> = { RAISE: "raise", ADD: "add", PRACTICE: "practice", STEP: "step", CHECKPOINT: "checkpoint" };

/** A row's glyph state: idle at 0, active (the started pip) at 1+, done with the check badge. */
export function weekQuestGlyphStateOf(row: Pick<WeekQuestRow, "done" | "figure">): GlyphState {
  return row.done ? "done" : Number(row.figure.value) > 0 ? "active" : "idle";
}

/** A v1 RAISE or ADD label's Domain names, marked as names for the word count (§3.1); the words between stay app words. */
const NAMED_LABELS: readonly RegExp[] = [/^(Bring \d+ cards? in )(.+)( to level \d+\+)$/, /^(Add \d+ cards? to )(.+)()$/];
export function labelWithNames(label: string): ReactNode {
  for (const re of NAMED_LABELS) {
    const m = re.exec(label);
    if (!m) continue;
    const pieces = m[2].split(/( or |, | and )/);
    return (
      <>
        {m[1]}
        {pieces.map((p, i) =>
          i % 2 === 1 ? (
            p
          ) : (
            <span key={i} data-wc="name">
              {p}
            </span>
          )
        )}
        {m[3]}
      </>
    );
  }
  return label;
}

/**
 * Revision 5, lane 9 (contracts ruling 67): a row whose label carries a Gemini-named Domain (WeekQuestRow.labelParts,
 * namedPartsOf) renders its parts with pv.named after each such name; every other row is labelWithNames, unchanged.
 */
export function namedLabelOf(row: Pick<WeekQuestRow, "label" | "labelParts">): ReactNode {
  return hasNamed(row.labelParts) ? <NamedText parts={row.labelParts} /> : labelWithNames(row.label);
}

/** The Domain names a set's rows carry (a generator-2 row's parts), longest first: the names its lines may hold. */
export function weekQuestDomainNamesOf(view: Pick<WeekQuestsView, "rows">): string[] {
  const names = new Set<string>();
  for (const r of view.rows) for (const p of r.parts ?? []) if (p.name) names.add(String(p.name));
  return [...names].sort((a, b) => b.length - a.length);
}

/** `text` with each of `names` marked as a name for the word count (§3.1: Domain names are exempt); the words between stay app words. */
export function withDomainNames(text: string, names: readonly string[]): ReactNode {
  if (names.length === 0) return text;
  const esc = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pieces = text.split(new RegExp(`(${esc.join("|")})`));
  if (pieces.length === 1) return text;
  return pieces.map((p, i) =>
    i % 2 === 1 ? (
      <span key={i} data-wc="name">
        {p}
      </span>
    ) : (
      p
    )
  );
}

/** "Set a maximum daily loss" from "Step: Set a maximum daily loss" (the glyph says step; the full label stays in the row's name). */
export function stepTitleOf(label: string): string {
  return label.replace(/^Step: /, "");
}

/** "Mock test" from "Checkpoint: Mock test · log your score". */
export function checkpointTitleOf(label: string): string {
  return label.replace(/^Checkpoint: /, "").replace(/ · log your score$/, "");
}

/** A RAISE row's slipped count ("3 cards slipped back to level 5 on Tue" → 3), drawn "↓3"; the sentence is in the Key or the row's ▸. */
export function slipCountOf(row: Pick<WeekQuestRow, "slipLine">): number | null {
  const m = row.slipLine ? /^(\d+) /.exec(row.slipLine) : null;
  return m ? Number(m[1]) : null;
}

/** A RAISE row's due-day pips, in the row's own week (null without its due days: the due sentence stays in the Key). */
export function weekQuestPipsOf(row: WeekQuestRow & WeekQuestDueDays, weekStart: string, today?: string): { days: PipDay[]; label: string } | null {
  if (row.kind !== "RAISE" || !row.dueDays || row.dueDays.length === 0) return null;
  // without today's day (Today's card is given none) no day is outlined or marked past
  return pipDaysOf(row.dueDays, weekStart, today ?? "");
}

/** A row's due, quota and slip sentences (the Key's and the row's ▸ words). */
export function weekQuestRowExtrasOf(row: Pick<WeekQuestRow, "dueLine" | "quotaLine" | "slipLine">): string[] {
  return [row.dueLine, row.quotaLine, row.slipLine].filter((x): x is string => typeof x === "string" && x.length > 0);
}

function trackOfRow(row: WeekQuestRow, track: TrackSigil | undefined): TrackSigil {
  return track ?? (row.health ? "body" : "craft");
}

function fraction(row: WeekQuestRow): number {
  return row.count > 0 ? Math.min(1, weekQuestProgressOf(row) / row.count) : 0;
}

/**
 * A row's SEEN motion: the done check (quest-done) when the measured count reached N since this viewer last saw
 * it, and its meter from the last-seen count (meter-fill, either direction). A first-ever view plays nothing; a
 * view with no seen bases plays nothing.
 */
function useRowSeen(row: WeekQuestRow, weekStart: string, bases: SeenBases | null, onToday: boolean) {
  const kgRef = useRef<HTMLSpanElement>(null);
  const key = seenKeyOf(bases, seenQuestWhat(weekStart, row.ord));
  const progress = weekQuestProgressOf(row);
  usePlayOnSeen(kgRef, key, progress, "quest-done", {
    today: onToday,
    label: SINCE_QUEST_ITEM,
    when: (from, to) => row.done && to >= row.count && (from == null || from < row.count),
  });
  // the meter's last-seen count under its own `what` (useSeenValue stores at once; the done event keeps its own)
  const meterKey: SeenKey | null = key && (row.kind === "RAISE" || row.kind === "ADD") ? { ...key, what: `${key.what}:m` } : null;
  const last = useSeenValue(meterKey, progress);
  const from = last != null && row.count > 0 ? Math.min(1, Math.max(0, last / row.count)) : null;
  return { kgRef, from };
}

function RowGlyph({ row, track, words, ref }: { row: WeekQuestRow; track?: TrackSigil; words?: string; ref?: Ref<HTMLSpanElement> }) {
  return (
    <KindGlyph
      ref={ref}
      kind={WEEK_QUEST_GLYPH_KIND[row.kind]}
      state={weekQuestGlyphStateOf(row)}
      track={row.kind === "PRACTICE" ? trackOfRow(row, track) : undefined}
      words={words}
      size={20}
      className="rm-wq-kg"
    />
  );
}

function RowMeter({ row, from }: { row: WeekQuestRow; from: number | null }) {
  if (row.kind !== "RAISE" && row.kind !== "ADD") return null;
  return <Meter thin value={fraction(row)} from={from} label={`${row.label}: ${weekQuestCountOf(row)}`} valueText={weekQuestCountOf(row)} />;
}

/**
 * The glyph line under a row: the due-day pips (RAISE), [m.link] for a quota (ADD), "↓n" for a slip, and the
 * Now row's own extras. `quiet`: inside Today's row link, whose name says the row (the Key holds the words).
 */
function RowAux({ row, weekStart, today, quiet, children }: { row: WeekQuestRow; weekStart: string; today?: string; quiet?: boolean; children?: ReactNode }) {
  const pips = weekQuestPipsOf(row, weekStart, today);
  const slip = slipCountOf(row);
  const quota = row.kind === "ADD" && Boolean(row.quotaLine);
  if (!pips && slip == null && !quota && !children) return null;
  return (
    <span className="rm-wq-aux" aria-hidden={quiet ? true : undefined}>
      {pips && <PipStrip days={pips.days} label={pips.label} className="rm-wq-pips" />}
      {quota && <Glyph name="m.link" size={16} inherit className="rm-wq-link" />}
      {slip != null && (
        <>
          <span className="rm-wq-slip num" aria-hidden="true">
            ↓{slip}
          </span>
          {/* the spoken twin (D26): the row's own slip sentence */}
          {!quiet && <span className="sr-only">{row.slipLine}</span>}
        </>
      )}
      {children}
    </span>
  );
}

/**
 * The one «Not medical advice · ask a professional» of a card (D12): a chip button opening HEALTH_LINE. A safety
 * mark is static at every level (D11): inside [data-safety] its panel opens instantly (no tip-open).
 */
function HealthChip() {
  return (
    <span className="rm-wq-safe" data-safety="">
      <HonestyChip kind="health" label={SHORT_HEALTH} full={HEALTH_LINE} />
    </span>
  );
}

// ─── Today ───────────────────────────────────────────────────────────────────

/** Today's row: a link (RAISE, ADD, CHECKPOINT) or a seek button (PRACTICE, STEP). The row's name is its accessible name. */
function TodayRow({ row, weekStart, bases, track, names }: { row: WeekQuestRow; weekStart: string; bases: SeenBases | null; track?: TrackSigil; names: readonly string[] }) {
  const { kgRef, from } = useRowSeen(row, weekStart, bases, true);
  // a RAISE row's name also says its due days and slip (the pips and "↓n" are drawn aria-hidden); an ADD row's quota is in the Key
  const extras = row.kind === "RAISE" ? [row.dueLine, row.slipLine].filter(Boolean) : [];
  const name = `${weekQuestAccessibleName(row)}${extras.length ? `. ${extras.join(". ")}` : ""}`;
  const cls = cx(row.done && "rm-quest-done");
  const glyph = <RowGlyph ref={kgRef} row={row} track={track} />;
  if (row.kind === "RAISE" || row.kind === "ADD") {
    const href = row.href ?? ROADMAP_NOW_HREF;
    return (
      <Link className={cx("rm-quest-row", cls)} href={href} aria-label={name}>
        {glyph}
        <span className="rm-q-lbl">{namedLabelOf(row)}</span>
        <span className="rm-q-cnt num">{weekQuestCountOf(row)}</span>
        {partsLineOf(row) && <p className="rm-parts-l">{withDomainNames(partsLineOf(row)!, names)}</p>}
        <RowMeter row={row} from={from} />
        {/* inside the row's link, whose name says the row; the Key says the due days, the quota and the slip in words */}
        <RowAux row={row} weekStart={weekStart} quiet />
      </Link>
    );
  }
  if (row.kind === "CHECKPOINT") {
    return (
      <Link className={cx("rm-quest-line", cls)} href={row.href ?? ROADMAP_CHECKPOINT_HREF} aria-label={name}>
        {glyph}
        <span className="rm-q-lbl">
          {checkpointTitleOf(row.label)}
          <span className="rm-q-dim"> · {weekQuestCountOf(row)}</span> <HonestyChip kind="context-only" label={SHORT_CONTEXT_ONLY} className="rm-wq-ctx" />
        </span>
      </Link>
    );
  }
  const head = row.kind === "PRACTICE" ? practiceNameOf(row.label) : stepTitleOf(row.label);
  return (
    <button
      type="button"
      className={cx("rm-quest-line", cls)}
      aria-label={name}
      onClick={() => {
        if (row.seekTemplateId) seekTemplate(row.seekTemplateId);
      }}
    >
      {glyph}
      <span className="rm-q-lbl">
        {withDomainNames(head, names)}
        <span className="rm-q-dim">
          {` · ${weekQuestCountOf(row)}`}
          {!row.done ? placeSuffix(row.place) : ""}
        </span>
      </span>
    </button>
  );
}

/** Each glyph a set's card uses, with its words (the Key's list; D13). */
export function weekQuestKeyEntriesOf(view: Pick<WeekQuestsView, "rows">, track?: TrackSigil): KeyEntry[] {
  const kinds = weekQuestKindsOf(view);
  const out: KeyEntry[] = [];
  for (const k of ["RAISE", "ADD", "STEP", "PRACTICE", "CHECKPOINT"] as const) {
    if (!kinds.has(k)) continue;
    const practiceRow = k === "PRACTICE" ? view.rows.find((r) => r.kind === "PRACTICE") : undefined;
    out.push({ glyph: KIND_GLYPH[WEEK_QUEST_GLYPH_KIND[k]], state: "active", track: practiceRow ? trackOfRow(practiceRow, track) : undefined, words: WEEK_QUEST_CAPTIONS[k] });
  }
  const quota = view.rows.find((r) => r.kind === "ADD" && r.quotaLine)?.quotaLine;
  if (quota) out.push({ glyph: "m.link", words: quota });
  return out;
}

/** Every row's own words, as the Key lists them: its label and place, then its due days, quota and slip ("Bring 3 cards …: 1 comes due Tue, 2 Wed, 1 Sat"). */
export function weekQuestKeyRowsOf(view: Pick<WeekQuestsView, "rows">): string[] {
  return weekQuestRowsForToday(view.rows).map((row) => `${row.label}${keyRowTailOf(row)}`);
}

/** A Key row's words after its label: its place, then its due days, quota and slip. */
function keyRowTailOf(row: WeekQuestRow): string {
  const extras = weekQuestRowExtrasOf(row);
  return `${placeSuffix(row.place)}${extras.length ? `: ${extras.join(" · ")}` : ""}`;
}

/**
 * The Key's rows as drawn (revision 5, lane 9; contracts ruling 67): a label carrying a Gemini-named Domain renders its
 * parts with pv.named after each such name (the Key's panel shows on one tap); every other row is weekQuestKeyRowsOf's
 * string, unchanged.
 */
function weekQuestKeyRowNodesOf(view: Pick<WeekQuestsView, "rows">): ReactNode[] {
  return weekQuestRowsForToday(view.rows).map((row) =>
    hasNamed(row.labelParts) ? (
      <>
        <NamedText parts={row.labelParts} />
        {keyRowTailOf(row)}
      </>
    ) : (
      `${row.label}${keyRowTailOf(row)}`
    )
  );
}

function TodayCard({ view, bases, track }: { view: WeekQuestsView; bases: SeenBases | null; track?: TrackSigil }) {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const kinds = weekQuestKindsOf(view);
  const allDone = view.total > 0 && view.done >= view.total;
  const { shown, hidden } = weekQuestRowsShown(view.rows, expanded);
  const heading = weekQuestsHeading(view.milestoneOrd);
  const summary = weekQuestsSummary(view.milestoneOrd, view.done, view.total);
  const footer = weekQuestsFooter(kinds, view.milestoneOrd, view.level);
  const health = healthChipShown({ healthRows: view.rows.some(rowHealthOf) });
  const names = weekQuestDomainNamesOf(view);

  const summaryLine = (
    <button type="button" className={cx("rm-quest-one", allDone && "rm-quest-done")} aria-expanded={false} onClick={() => setOpen(true)}>
      <span className="rm-wq-ring" aria-hidden="true">
        <PromiseRing value={view.done} target={view.total} size={20} label={SHORT_WEEK_QUESTS} />
      </span>
      <b>{heading}</b>
      <span className="rm-q-n">{allDone ? `all ${view.total} done` : `${view.done} of ${view.total} done`}</span>
      <Icon name="chev" />
    </button>
  );

  // All done and not opened: one collapsed line (it can be expanded). Nothing else plays.
  if (allDone && !open) {
    return (
      <section className="rm-quests-today" aria-label={summary}>
        <div className="card rm-quest">{summaryLine}</div>
      </section>
    );
  }

  return (
    <section className="rm-quests-today" aria-label={heading} data-open={open ? "1" : undefined}>
      <div className="rm-quests-compact">
        <div className="card rm-quest">{summaryLine}</div>
      </div>
      <div className="rm-quests-full" data-wc-block="week-quests">
        <SectionHeader
          title={heading}
          aside={
            <Link className="rm-hit" href={ROADMAP_NOW_HREF}>
              {weekQuestsAside(view.weekEnd, liveHere(view))}
            </Link>
          }
        />
        <div className="card rm-quest">
          <div className="rm-wq-top">
            <Chips className="rm-wq-chips">
              <HonestyChip kind="pays-nothing" label={SHORT_PAYS_NOTHING} sr={footer} />
              {health && <HealthChip />}
            </Chips>
            <CardKey topic="week quests" entries={weekQuestKeyEntriesOf(view, track)} rows={weekQuestKeyRowNodesOf(view)}>
              <span className="rm-wq-kl">{weekQuestsLegend(kinds)}</span>
              <span className="rm-wq-kl">{footer}</span>
            </CardKey>
          </div>
          <div id={listId}>
            {shown.map((row) => (
              <TodayRow key={row.ord} row={row} weekStart={view.weekStart} bases={bases} track={track} names={names} />
            ))}
          </div>
          {(hidden > 0 || expanded) && (
            <button type="button" className="rm-quest-more" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded((e) => !e)}>
              <Glyph name="m.down" size={16} inherit />
              {expanded ? "Show fewer" : shortMore(hidden)}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── The Aim card's line ─────────────────────────────────────────────────────

/** The Aim card's line for a set's counts: PromiseRing "2/5 Week quests →" to Today (its words, "2 of 5 done · Today", read aloud). */
export function WeekQuestsLine({ done, total, className }: { done: number; total: number; className?: string }) {
  const allDone = total > 0 && done >= total;
  return (
    <Link className={cx("rm-quest-one", "rm-wq-line", allDone && "rm-quest-done", className)} href={TODAY_HREF}>
      <span className="rm-wq-ring" aria-hidden="true">
        <PromiseRing value={done} target={total} size={24} label={SHORT_WEEK_QUESTS} />
      </span>
      <span className="rm-wq-n num" aria-hidden="true">
        {`${Math.min(done, total)}/${total}`}
      </span>
      <b>{SHORT_WEEK_QUESTS}</b>
      <span className="sr-only">{allDone ? `all ${total} done · Today` : `${done} of ${total} done · Today`}</span>
      <Icon name="chev" />
    </Link>
  );
}

// ─── The Now section ─────────────────────────────────────────────────────────

/** A Now row's label: Domain and practice names marked; STEP and CHECKPOINT without their prefix (sr keeps it). */
function nowLabelOf(row: WeekQuestRow): ReactNode {
  switch (row.kind) {
    case "RAISE":
    case "ADD":
      return namedLabelOf(row);
    case "PRACTICE": {
      const name = practiceNameOf(row.label);
      return (
        <>
          <span data-wc="name">{name}</span>
          {row.label.slice(name.length)}
        </>
      );
    }
    case "STEP":
      return (
        <>
          <span className="sr-only">Step: </span>
          {stepTitleOf(row.label)}
        </>
      );
    case "CHECKPOINT":
      return (
        <>
          <span className="sr-only">Checkpoint: </span>
          {checkpointTitleOf(row.label)}
        </>
      );
  }
}

/** A Now row's ▸ words: its evidence in words, then what the Today card's Key says of it (the page's own lines, unchanged). */
export function weekQuestMoreLinesOf(row: WeekQuestRow, view: Pick<WeekQuestsView, "milestoneOrd" | "level">): string[] {
  switch (row.kind) {
    case "RAISE":
      return [row.figure.caption, ...weekQuestRowExtrasOf(row)];
    case "ADD":
      return [row.quotaLine ? `${row.figure.caption} · ${row.quotaLine}` : row.figure.caption, addCountsLine(view.milestoneOrd, view.level)];
    case "PRACTICE":
      return [`${row.figure.caption} · ${PRACTICE_KEEP_SHARE_LINE}`];
    case "STEP":
      return [WEEK_QUEST_CAPTIONS.STEP];
    case "CHECKPOINT":
      return [WEEK_QUEST_CAPTIONS.CHECKPOINT];
  }
}

function NowRow({ row, view, bases, track, today, onLogCheckpoint, names }: { row: WeekQuestRow; view: WeekQuestsView; bases: SeenBases | null; track?: TrackSigil; today?: string; onLogCheckpoint?: () => void; names: readonly string[] }) {
  const { kgRef, from } = useRowSeen(row, view.weekStart, bases, false);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const lines = weekQuestMoreLinesOf(row, view);
  const onToday = (row.kind === "PRACTICE" || row.kind === "STEP") && row.href && !row.done ? row.href : null;
  const logScore = row.kind === "CHECKPOINT" && !row.done && onLogCheckpoint ? onLogCheckpoint : null;
  return (
    <div className={cx("rm-quest-row", "rm-wq-r", row.done && "rm-quest-done")} data-kind={row.kind}>
      <RowGlyph ref={kgRef} row={row} track={track} words={row.figure.caption} />
      <span className="rm-q-lbl">{nowLabelOf(row)}</span>
      <span className="rm-q-cnt num">{weekQuestCountOf(row)}</span>
      <button type="button" className="rm-wq-x" aria-expanded={open} aria-controls={panelId} aria-label={`More: ${row.label}`} onClick={() => setOpen((o) => !o)}>
        <Icon name="chev" />
      </button>
      {/* the row's ▸ panel, right after its button in DOM order (it opens under the label's line) */}
      <div id={panelId} className="rm-wq-p" hidden={!open}>
        {lines.map((l) => (
          <p key={l} className="rm-q-ev">
            {l}
          </p>
        ))}
        {onToday && (
          <Link className="link rm-q-lnk" href={onToday}>
            On Today
          </Link>
        )}
        {logScore && (
          <button type="button" className="link rm-q-lnk rm-ilink" onClick={logScore}>
            Log a score
          </button>
        )}
      </div>
      {partsLineOf(row) && <p className="rm-parts-l">{withDomainNames(partsLineOf(row)!, names)}</p>}
      <RowMeter row={row} from={from} />
      <RowAux row={row} weekStart={view.weekStart} today={today}>
        {row.kind === "ADD" && row.href && (
          <Link className="rm-wq-add" href={row.href} aria-label="Add a card here">
            <Icon name="plus" />
            {SHORT_ADD}
          </Link>
        )}
        {row.kind === "CHECKPOINT" && <HonestyChip kind="context-only" label={SHORT_CONTEXT_ONLY} />}
      </RowAux>
    </div>
  );
}

function RoadmapVariant({ view, onLogCheckpoint, onShowBasis, today, shownElsewhere = [], bases, track, health }: WeekQuestsProps & { bases: SeenBases | null }) {
  const kinds = weekQuestKindsOf(view);
  const notes = notesShownOf(view.notes, shownElsewhere);
  const span = windowLabel(view.weekStart, view.weekEnd, today);
  const live = liveHere(view);
  const fixed = view.frozen ? "fixed for the week" : view.writesOff ? NOT_RECORDED_HERE : "fixed when the week's first run records it";
  const showHealth = health ?? healthChipShown({ healthRows: view.rows.some(rowHealthOf) });
  const names = weekQuestDomainNamesOf(view);
  return (
    <div className="rm-ms-sec" id="week-quests">
      <div className="rm-ms-sh rm-wq-sh">
        <span className="t-eyebrow">{SHORT_WEEK_QUESTS}</span>
        <span className="rm-cap">{shortUntil(view.weekEnd)}</span>
        <Chips className="rm-wq-chips">
          {/* the Now card's own Key is the page's (R3): this chip opens the set's footer, legend and window itself */}
          <HonestyChip
            kind="pays-nothing"
            label={SHORT_PAYS_NOTHING}
            full={
              <>
                <span className="rm-wq-kl">{weekQuestsFooter(kinds, view.milestoneOrd, view.level)}</span>
                {view.rows.length > 0 && <span className="rm-wq-kl">{weekQuestsLegend(kinds)}</span>}
                <span className="rm-wq-kl">
                  {span} · {fixed}
                </span>
              </>
            }
          />
          {live && (
            <HonestyChip
              kind="not-recorded"
              label={SHORT_NOT_RECORDED}
              full={
                <>
                  <span className="rm-wq-kl">{weekQuestsAside(view.weekEnd, true)}</span>
                  <span className="rm-wq-kl">{WRITES_OFF_BANNER}</span>
                </>
              }
            />
          )}
          {showHealth && <HealthChip />}
        </Chips>
        {onShowBasis && view.basis.length > 0 && <GlyphButton glyph="m.info" label="How these were set" onClick={onShowBasis} size={40} className="rm-wq-basis" />}
      </div>
      {view.state === "PAST_DUE" && <p className="rm-lag t-meta">{pastDueLine(view.milestoneOrd, null)}. No week quests this week.</p>}
      {view.state === "HELD" && <p className="rm-lag t-meta">A held week: no week quests, and nothing is asked of it.</p>}
      {notes.map((n) => (
        <p key={n} className="rm-lag t-meta">
          {n}
        </p>
      ))}
      {view.rows.length > 0 && (
        <div className="rm-quest">
          {view.rows.map((row) => (
            <NowRow key={row.ord} row={row} view={view} bases={bases} track={track} today={today} onLogCheckpoint={onLogCheckpoint} names={names} />
          ))}
        </div>
      )}
      {view.state === "OPEN" && view.rows.length === 0 && <p className="rm-lag t-meta">No week quests this week: the basis says why.</p>}
    </div>
  );
}

export function WeekQuests(props: WeekQuestsProps) {
  const { variant, view } = props;
  if (variant === "aim") {
    if (view.state !== "OPEN" || view.total === 0) return null;
    return <WeekQuestsLine done={view.done} total={view.total} />;
  }
  const bases = props.bases !== undefined ? props.bases : seenBasesOfWeekQuests(view);
  if (variant === "roadmap") return <RoadmapVariant {...props} bases={bases} />;
  if (!weekQuestsShowOnToday(view)) return null;
  return <TodayCard view={view} bases={bases} track={props.track} />;
}
