"use client";

import { useMemo } from "react";
import type { Attribute } from "@prisma/client";
import { ATTRIBUTE_META } from "@/lib/attributes";
import { formatMinutes, formatXp, matchParentGoal } from "@/lib/capture-parse";
import { BAND_META, TRACK_LABEL, priceTask } from "@/lib/life-grade";
import { sizeLexically } from "@/lib/life-lexicon";
import type { CaptureToken, ParsedCapture, PayMode, Sizing } from "@/lib/life-types";
import { CurrencyGlyph, Icon, type IconName } from "@/components/ui/Icon";
import type { CaptureActiveTitle } from "@/app/actions/capture";
import { MUST_WARNING, MUST_WARNING_BEFORE, duplicateNote, ideaChipLabel, insertChipLabel, type Insert } from "./capture-ui";

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
 */

const TOKEN_ICON: Partial<Record<CaptureToken["field"], IconName>> = {
  date: "clock",
  deadline: "clock",
  done: "check",
  inbox: "inbox",
  parent: "flag",
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
  /** The first Enter stopped on a Must with no day: the full warning, announced. */
  mustBlocked: boolean;
  /** The four ways to give the Must a day (by today · by tmr · by fri · every <weekday>). */
  mustFixes: { id: string; label: string; insert: Insert }[];
  onFix: (insert: Insert) => void;
}

interface Grade {
  sizing: Sizing;
  minutes: number;
  xp: number | null;
}

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
  const mode: PayMode = parsed.intrinsic ? "PLAY" : parsed.autoMetric ? "STUDY" : "FULL";
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
      ) : parsed.autoMetric ? (
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

export function CaptureChips({ text, parsed, goals, rawBefore, onRevert, compact, feedsOpen, onToggleFeeds, duplicate, mustBlocked, mustFixes, onFix }: Props) {
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

  const track = parsed.track ?? grade?.sizing.track ?? null;
  const hasFeeds = !!grade && !!track && feeds.length > 0;
  const showFeeds = hasFeeds && (!compact || feedsOpen);

  return (
    <div className="capture-chips">
      {(parsed.tokens.length > 0 || grade || parsed.kind === "GOAL" || parsed.kind === "IDEA_DRAFT") && (
        <ul className="capture-chip-row" aria-label="How the line was read">
          {parsed.tokens.map((t) => {
            const words = text.slice(t.start, t.end);
            let label = t.label;
            let miss = false;
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
          {grade && (
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

      {duplicate && (
        <p className="capture-note" role="note">
          {duplicateNote(duplicate)}
        </p>
      )}

      {parsed.compulsoryWarning && (
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

      {showFeeds && grade && track && (
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
