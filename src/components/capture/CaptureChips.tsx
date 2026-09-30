"use client";

import { useMemo } from "react";
import type { Attribute } from "@prisma/client";
import { ATTRIBUTE_META } from "@/lib/attributes";
import { formatMinutes, formatXp, matchParentGoal } from "@/lib/capture-parse";
import { BAND_META, TRACK_LABEL, priceTask } from "@/lib/life-grade";
import { sizeLexically } from "@/lib/life-lexicon";
import type { CaptureToken, ParsedCapture, PayMode, Sizing } from "@/lib/life-types";
import { CurrencyGlyph, Icon, type IconName } from "@/components/ui/Icon";

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
 * that pays (life-grade.ts), against today's knee as it stood when the
 * sheet opened — hence '≈'. The toast after saving carries the server's
 * exact figure. The AI's refinement lands after the save, so it is never
 * shown here.
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
  /** Today's knee base, R_before. */
  rawBefore: number;
  onRevert: (token: CaptureToken) => void;
}

interface Grade {
  sizing: Sizing;
  minutes: number;
  xp: number | null;
}

/** The grade the server will write, and what one completion at the estimate would pay. */
function gradeOf(parsed: ParsedCapture, rawBefore: number): Grade | null {
  if (!parsed.title || parsed.kind === "IDEA_DRAFT" || parsed.kind === "GOAL") return null;
  let sizing: Sizing;
  try {
    sizing = sizeLexically(parsed.title, { tagTrack: parsed.track, minutes: parsed.estMinutes });
  } catch {
    return null;
  }
  const minutes = parsed.estMinutes ?? sizing.machineMinutes;
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

export function CaptureChips({ text, parsed, goals, rawBefore, onRevert }: Props) {
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
              <span
                className="chip capture-chip capture-grade"
                title={`${BAND_META[grade.sizing.band].blurb}. lexical · ${Math.round(grade.sizing.confidence * 100)}% · ${grade.sizing.basis}`}
              >
                {BAND_META[grade.sizing.band].label} · ~{formatMinutes(grade.minutes)} ·{" "}
                {parsed.intrinsic ? (
                  "play, pays 0"
                ) : parsed.autoMetric ? (
                  "paid by reviews"
                ) : grade.xp === null ? (
                  "priced after saving"
                ) : (
                  <span className="cur">
                    <CurrencyGlyph kind="xp" />
                    <span className="num">≈ {formatXp(grade.xp)}</span>
                  </span>
                )}
              </span>
            </li>
          )}
          {parsed.kind === "GOAL" && (
            <li>
              <span className="chip capture-chip capture-grade">Pays through its steps</span>
            </li>
          )}
          {parsed.kind === "IDEA_DRAFT" && (
            <li>
              <span className="chip capture-chip capture-grade">Filed to Inbox · finish it in the full form</span>
            </li>
          )}
        </ul>
      )}

      {parsed.compulsoryWarning && (
        <p className="capture-warning" role="note">
          {parsed.compulsoryWarning}. <span className="ink-2">Add a schedule (every mon) or a deadline (by fri).</span>
        </p>
      )}

      {grade && track && feeds.length > 0 && (
        <p className="capture-feeds">
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
