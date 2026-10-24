"use client";

import { useMemo } from "react";
import type { Attribute } from "@prisma/client";
import { ATTRIBUTE_META } from "@/lib/attributes";
import { formatMinutes, formatXp, matchParentGoal } from "@/lib/capture-parse";
import { BAND_META, STUDY_AUTO_METRICS, TRACK_LABEL, priceTask } from "@/lib/life-grade";
import { sizeLexically } from "@/lib/life-lexicon";
import { dutyLaunchDay } from "@/lib/duty-economy";
import { todayKey } from "@/lib/life-day";
import { pagesCaptureLabelOf, proofChipLabelOf, proofLaunchDay, proofOn } from "@/lib/proof";
import { SIDE_WORK_LABEL } from "@/lib/side-quests";
import { DONE_NOW_AS_NEW, doneNowChipOf, doneNowChipParts } from "@/lib/done-now";
import type { CaptureToken, ParsedCapture, PayMode, Sizing } from "@/lib/life-types";
import { CurrencyGlyph, Icon, type IconName } from "@/components/ui/Icon";
import type { CaptureActiveTitle } from "@/app/actions/capture";
import {
  MUST_WARNING,
  MUST_WARNING_BEFORE,
  duplicateNote,
  ideaChipLabel,
  inboxMustNote,
  insertChipLabel,
  mustStakeLabel,
  type DutyStakeContext,
  type Insert,
} from "./capture-ui";

/**
 * What the line was understood as, one chip per token, plus the grade it
 * will be written with.
 *
 * Every token chip is a button that turns its words back into title text —
 * the parse is a suggestion the user can refuse in one tap, which is what
 * lets the grammar be generous. One dialect, all quiet (the kit's 40 px
 * interactive chip): the chips report what was read, they are not states,
 * so none of them takes a signal colour. A date or deadline carries the
 * clock glyph (due is ink plus a clock, never a hue).
 *
 * The grade chip is the lexical grade, priced by the same pure function
 * that pays (life-grade.ts), against today's knee as the sheet last read it
 * — hence '≈'. Until the vocabulary for today's life day has loaded it
 * says 'priced on save' rather than guess against an empty day: the toast
 * after saving carries the server's exact figure. On a phone the chip opens
 * the Feeds line (from 600 px it is always shown).
 *
 * Under the chips: the quiet duplicate note ('Already on your board'), and
 * a Must with no day to be judged on — the warning and its four fix chips,
 * which the first Enter stops on (QuickCapture's block-once gate).
 *
 * M2: a line that will be a must says its stake on the Must chip once Duty
 * is live ('Must · ≈ −4.2 if missed', debtFor on the lexical grade) or, with
 * a launch day ahead, when stakes start ('Must · stakes from Mon 12 Oct');
 * a must bound for the Inbox ('!' and '?') says it is 'A must once you
 * clarify it' (capture-ui mustStakeLabel, inboxMustNote).
 *
 * A weigh-in line ('weight 72.4', weight-capture.ts) shows one chip and
 * nothing else — 'Weight · 72.4 kg · today', no price, no feeds: a reading
 * is a record, not a task. Tapping it keeps the whole line as text (a task)
 * on the sheet and the server alike. A line shaped like a weigh-in whose
 * number is out of range is read as a task, and says so under its chips
 * (the same block-once gate as a Must).
 *
 * Proof of work (P23, P24): the '#proof' and pages chips say what is in force. Before PROOF_LAUNCH_DAY the tag is kept
 * and asks for nothing yet ('Proof · from its launch', a plain '30 pages'); on a work tab the server drops both (work
 * stays outside the game), so the '#proof' chip says so (a warned chip) and the pages one is plain words.
 *
 * Blueprint P6 (D33): a done-now line that names a row on today's Board (`ticks`, capture-ui tickMatchOf) shows
 * 'Ticks: Gym (Habits)' in place of the duplicate note, and one tap on it turns the line back into a new task. The
 * tick pays the row's own price, so the grade chip says so instead of pricing the line's words, and the tokens that
 * would only shape a new row (a day, a Must, a tag, a goal) are shown as not taken (a dashed chip): only the done mark
 * and the minutes go with the tick. A row ticked today already ('Already ticked: …') takes nothing from the line: the
 * grade chip says 'Paid already' and the minutes are dashed too. The chip is a 44 px target; its title is the part cut
 * short on a narrow screen, never 'Ticks:', the lane or the x.
 */

const TOKEN_ICON: Partial<Record<CaptureToken["field"], IconName>> = {
  date: "clock",
  deadline: "clock",
  done: "check",
  inbox: "inbox",
  parent: "flag",
  side: "side",
};

const FEEDS_SHOWN = 3;

interface Props {
  text: string;
  parsed: ParsedCapture;
  /** Open goals for '^name', or null while they load. */
  goals: { id: string; title: string }[] | null;
  /** Today's knee base, R_before; null until the vocabulary for today's life day has loaded (the chip then says 'priced on save'). */
  rawBefore: number | null;
  onRevert: (token: CaptureToken) => void;
  /** Under 600 px the Feeds line opens from the grade chip. */
  compact: boolean;
  feedsOpen: boolean;
  onToggleFeeds: () => void;
  /** An open template with the same title, for the quiet note. */
  duplicate: CaptureActiveTitle | null;
  /** P6: the row this done-now line will tick ('Ticks: Gym (Habits)'), or null: the line is saved as a new row. */
  ticks?: CaptureActiveTitle | null;
  /** The ticks chip, tapped: the line is saved as a new task instead. */
  onTickAsNew?: () => void;
  /** The first Enter stopped on a Must with no day: the full warning, announced. */
  mustBlocked: boolean;
  /** The four ways to give the Must a day (by today · by tmr · by fri · every <weekday>). */
  mustFixes: { id: string; label: string; insert: Insert }[];
  onFix: (insert: Insert) => void;
  /** The line is a weigh-in: its one chip's label ('Weight · 72.4 kg · today'), or null. */
  weighIn?: string | null;
  /** Tapping the weigh-in chip: the whole line stays text. */
  onKeepAsText?: () => void;
  /** A weigh-in-shaped line whose number is out of range: what the sheet says under the chips, or null. */
  weightRange?: string | null;
  /**
   * M2: today and the Duty launch day, for the Must chip's stake. Absent:
   * read here from this browser's clock and the code's launch day (a
   * rehearsal server's XTNL_DUTY_LAUNCH_DAY is not visible in the browser,
   * so a caller with the server's value passes it).
   */
  duty?: DutyStakeContext;
  /**
   * Proof of work (P23, P24): whether proof is in force today and whether the sheet is on a work tab, for the '#proof'
   * and pages chips' words. Absent: in force from this browser's view of the code's launch day, on the personal Board.
   */
  proof?: { live: boolean; work: boolean };
}

interface Grade {
  sizing: Sizing;
  minutes: number;
  xp: number | null;
}

/** P6: what a done-now line's tick of the row it names takes from the line: the done mark and the minutes. */
const TICK_TOKENS: ReadonlySet<CaptureToken["field"]> = new Set(["done", "duration"]);
/** A row ticked today already (P6 review): its tick stands, so only the done mark is the line's; its minutes go nowhere. */
const TICKED_TOKENS: ReadonlySet<CaptureToken["field"]> = new Set(["done"]);
/** The grade chip of a line that ticks the row it names: the row's own price is paid, not the line's words. */
export const TICK_GRADE_LABEL = "Pays its row's price";
/** The grade chip of a line whose row was ticked today already: nothing is paid again. */
export const TICK_PAID_LABEL = "Paid already";

/** A study link (reviews or ideas pay it); a pages line (P24) is ordinary paying work. */
const studyLinked = (parsed: Pick<ParsedCapture, "autoMetric">): boolean => !!parsed.autoMetric && (STUDY_AUTO_METRICS as readonly string[]).includes(parsed.autoMetric);

/** The grade the server will write, and what one completion at the estimate would pay. */
function gradeOf(parsed: ParsedCapture, rawBefore: number | null): Grade | null {
  if (!parsed.title || parsed.kind === "IDEA_DRAFT" || parsed.kind === "GOAL") return null;
  let sizing: Sizing;
  try {
    sizing = sizeLexically(parsed.title, { tagTrack: parsed.track, minutes: parsed.estMinutes });
  } catch {
    return null;
  }
  const minutes = parsed.estMinutes ?? sizing.machineMinutes;
  if (rawBefore === null) return { sizing, minutes, xp: null };
  const mode: PayMode = parsed.intrinsic ? "PLAY" : studyLinked(parsed) ? "STUDY" : "FULL";
  let xp: number | null = null;
  try {
    const receipt = priceTask(
      {
        band: sizing.band,
        bandOverride: 0,
        machineMinutes: sizing.machineMinutes,
        estMinutes: minutes,
        minutes: null,
        timing: "ON_TIME",
        recurring: parsed.recurrence !== null,
        streakDays: 0,
        repeatN: 1,
        introBefore: 0,
        mode,
      },
      { rawBefore },
      parsed.track ?? sizing.track
    );
    xp = Number.isFinite(receipt.xp) ? receipt.xp : null;
  } catch {
    xp = null;
  }
  return { sizing, minutes, xp };
}

/** 'Standard · ~30m · ≈ 10', or '… · priced on save' before today's ledger is known. */
function GradeText({ grade, parsed }: { grade: Grade; parsed: ParsedCapture }) {
  return (
    <>
      {BAND_META[grade.sizing.band].label} · ~{formatMinutes(grade.minutes)} ·{" "}
      {parsed.intrinsic ? (
        "play, pays 0"
      ) : studyLinked(parsed) ? (
        "paid by reviews"
      ) : grade.xp === null ? (
        "priced on save"
      ) : (
        <span className="cur">
          <CurrencyGlyph kind="xp" />
          <span className="num">≈ {formatXp(grade.xp)}</span>
        </span>
      )}
    </>
  );
}

/**
 * P6: the 'Ticks: Gym (Habits)' chip, a 44 px target (P6 review). Its parts are drawn apart, so on a narrow screen
 * only the title is cut short (an ellipsis): 'Ticks:', the lane, which says which row it ticks, and the x, which says
 * it can be tapped away, always show. Its accessible name is the whole chip and what a tap does.
 */
function TicksChip({ ticks, onTap }: { ticks: CaptureActiveTitle; onTap?: () => void }) {
  const p = doneNowChipParts(ticks);
  return (
    <button
      type="button"
      className="chip btn-chip capture-chip capture-ticks"
      data-ticks={ticks.tick ?? undefined}
      onClick={onTap}
      onMouseDown={(e) => e.preventDefault()}
      title={`${doneNowChipOf(ticks)}. ${DONE_NOW_AS_NEW}`}
      aria-label={`${doneNowChipOf(ticks)}. ${DONE_NOW_AS_NEW}.`}
    >
      <Icon name="check" />
      <span className="capture-ticks-lead">{p.lead}</span>
      <span className="capture-ticks-title">{p.title}</span>
      <span className="capture-ticks-lane">{p.lane}</span>
      <Icon name="x" className="capture-chip-x" />
    </button>
  );
}

export function CaptureChips({
  text,
  parsed,
  goals,
  rawBefore,
  onRevert,
  compact,
  feedsOpen,
  onToggleFeeds,
  duplicate,
  ticks = null,
  onTickAsNew,
  mustBlocked,
  mustFixes,
  onFix,
  weighIn = null,
  onKeepAsText,
  weightRange = null,
  duty,
  proof,
}: Props) {
  const grade = useMemo(() => gradeOf(parsed, rawBefore), [parsed, rawBefore]);
  const parent = useMemo(
    () => (parsed.parentHint && goals ? matchParentGoal(parsed.parentHint, goals) : null),
    [parsed.parentHint, goals]
  );

  const feeds = useMemo(() => {
    if (!grade) return [];
    return (Object.entries(grade.sizing.composition) as [Attribute, number][])
      .filter(([, w]) => w > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, FEEDS_SHOWN);
  }, [grade]);

  if (!text.trim()) return null;

  if (weighIn) {
    const words = text.trim();
    return (
      <div className="capture-chips">
        <ul className="capture-chip-row" aria-label="How the line was read">
          <li>
            <button
              type="button"
              className="chip btn-chip capture-chip"
              onClick={onKeepAsText}
              onMouseDown={(e) => e.preventDefault()}
              title={`Tap to keep “${words}” as text`}
              aria-label={`${weighIn}. Tap to keep “${words}” as text.`}
            >
              <span className="num">{weighIn}</span>
              <Icon name="x" className="capture-chip-x" />
            </button>
          </li>
        </ul>
      </div>
    );
  }

  const track = parsed.track ?? grade?.sizing.track ?? null;
  const hasFeeds = !!grade && !!track && feeds.length > 0;
  const showFeeds = hasFeeds && (!compact || feedsOpen);
  // The chips render only while a line is typed (client-side), so reading the clock here is safe.
  const stake = mustStakeLabel(
    parsed,
    grade ? { band: grade.sizing.band, machineMinutes: grade.sizing.machineMinutes, estMinutes: grade.minutes } : null,
    duty ?? { today: todayKey(), launchDay: dutyLaunchDay() }
  );
  const inboxMust = inboxMustNote(parsed);
  // Proof of work's chips (P23, P24): in force, not yet, or a work tab (the server drops '#proof' and pages there).
  const proofState = proof ?? { live: proofOn(todayKey(), proofLaunchDay()), work: false };

  return (
    <div className="capture-chips">
      {(parsed.tokens.length > 0 || grade || parsed.kind === "GOAL" || parsed.kind === "IDEA_DRAFT") && (
        <ul className="capture-chip-row" aria-label="How the line was read">
          {parsed.tokens.map((t) => {
            const words = text.slice(t.start, t.end);
            let label = t.field === "compulsory" && stake ? stake : t.label;
            let miss = false;
            if (t.field === "proof") {
              label = proofChipLabelOf(proofState);
              miss = proofState.work;
            }
            if (t.field === "pages" && parsed.autoTarget != null) label = pagesCaptureLabelOf(parsed.autoTarget, proofState);
            // Side quests (P31): '#side' on a work tab is dropped (work stays out of the game); on a line that repeats it is
            // not taken, and on a side line the Must and Inbox marks are not (the parse says so in their labels).
            if (t.field === "side") {
              if (proofState.work) label = SIDE_WORK_LABEL;
              miss = proofState.work || !parsed.side;
            }
            if (parsed.side && (t.field === "compulsory" || t.field === "inbox")) miss = true;
            // P6: a tick of the row the line names takes only its done mark and minutes; the rest would shape a new row.
            if (ticks && !(ticks.tick === "done" ? TICKED_TOKENS : TICK_TOKENS).has(t.field)) miss = true;
            if (t.field === "parent" && parsed.parentHint && goals) {
              // The goal it will attach to, or an honest miss: the server
              // matches the same way (matchParentGoal), so this is what lands.
              if (parent) label = `^ ${parent.title}`;
              else {
                label = `^ ${parsed.parentHint} · no open goal`;
                miss = true;
              }
            }
            const icon = TOKEN_ICON[t.field];
            // A study link cannot be undone: in-app reviews and ideas are paid by
            // the knowledge game, so the parser keeps this span linked either way.
            if (t.field === "study") {
              return (
                <li key={t.id}>
                  <span className="chip capture-chip" title="Paid by your reviews and ideas, never twice" aria-label={`${label}. Paid by your reviews and ideas, never twice.`}>
                    <Icon name="study" />
                    {label}
                  </span>
                </li>
              );
            }
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className="chip btn-chip capture-chip"
                  data-warn={(t.field === "compulsory" && parsed.compulsoryWarning) || miss ? "1" : undefined}
                  onClick={() => onRevert(t)}
                  // The line keeps focus through the tap, so a phone's
                  // keyboard does not drop and rise again for every chip.
                  onMouseDown={(e) => e.preventDefault()}
                  title={`Tap to keep “${words}” as text`}
                  aria-label={`${label}. Tap to keep “${words}” as text.`}
                >
                  {t.field === "compulsory" ? <span className="capture-must" aria-hidden="true" /> : icon ? <Icon name={icon} /> : null}
                  {label}
                  <Icon name="x" className="capture-chip-x" />
                </button>
              </li>
            );
          })}
          {grade && ticks && (
            <li>
              {ticks.tick === "done" ? (
                <span className="chip capture-chip capture-grade" data-warn="1" title="Its tick stands: nothing is written or paid again">
                  {TICK_PAID_LABEL}
                </span>
              ) : (
                <span className="chip capture-chip capture-grade" title="The tick pays what the row pays on Today">
                  {TICK_GRADE_LABEL}
                </span>
              )}
            </li>
          )}
          {grade && !ticks && (
            <li>
              {compact && hasFeeds ? (
                <button
                  type="button"
                  className="chip btn-chip capture-chip capture-grade"
                  aria-expanded={feedsOpen}
                  aria-controls="capture-feeds"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onToggleFeeds}
                  title={`${BAND_META[grade.sizing.band].blurb}. Tap for what it feeds.`}
                >
                  <GradeText grade={grade} parsed={parsed} />
                </button>
              ) : (
                <span
                  className="chip capture-chip capture-grade"
                  title={`${BAND_META[grade.sizing.band].blurb}. lexical · ${Math.round(grade.sizing.confidence * 100)}% · ${grade.sizing.basis}`}
                >
                  <GradeText grade={grade} parsed={parsed} />
                </span>
              )}
            </li>
          )}
          {parsed.kind === "GOAL" && (
            <li>
              <span className="chip capture-chip capture-grade">Pays through its steps</span>
            </li>
          )}
          {parsed.kind === "IDEA_DRAFT" && (
            <li>
              <span className="chip capture-chip capture-grade">{ideaChipLabel(!!parsed.answer?.trim())}</span>
            </li>
          )}
        </ul>
      )}

      {ticks ? (
        <ul className="capture-chip-row capture-ticks-row" aria-label="What the line does">
          <li>
            <TicksChip ticks={ticks} onTap={onTickAsNew} />
          </li>
        </ul>
      ) : (
        duplicate && (
          <p className="capture-note" role="note">
            {duplicateNote(duplicate)}
          </p>
        )
      )}

      {inboxMust && (
        <p className="capture-note" role="note">
          {inboxMust}
        </p>
      )}

      {/* P6: a line that ticks the row it names takes no Must from the line, so the warning is not its. */}
      {parsed.compulsoryWarning && !ticks && (
        <div className="capture-warning">
          <p aria-live="polite">{mustBlocked ? MUST_WARNING : MUST_WARNING_BEFORE}</p>
          <div className="capture-fixes" role="group" aria-label="Give the Must a day">
            {mustFixes.map((f) => (
              <button
                key={f.id}
                type="button"
                className="chip btn-chip capture-ins"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onFix(f.insert)}
                title={insertChipLabel(f.insert)}
                aria-label={`${f.label}: ${insertChipLabel(f.insert)}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {weightRange && (
        <div className="capture-warning">
          <p aria-live="polite">{weightRange}</p>
        </div>
      )}

      {showFeeds && grade && track && !ticks && (
        <p className="capture-feeds" id="capture-feeds">
          <span className="t-eyebrow">Feeds · {TRACK_LABEL[track]}</span>
          {feeds.map(([attribute, weight]) => (
            <span key={attribute} className="capture-feed">
              {ATTRIBUTE_META[attribute].label} <span className="num ink-2">{weight}%</span>
            </span>
          ))}
          <span className="capture-grade-basis">lexical · {Math.round(grade.sizing.confidence * 100)}% sure</span>
        </p>
      )}
    </div>
  );
}
