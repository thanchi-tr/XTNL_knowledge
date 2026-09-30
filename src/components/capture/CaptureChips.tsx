"use client";

import { useMemo } from "react";
import type { Attribute } from "@prisma/client";
import { ATTRIBUTE_META } from "@/lib/attributes";
import { themeFor } from "@/lib/attribute-themes";
import { formatMinutes, formatXp, matchParentGoal } from "@/lib/capture-parse";
import { BAND_META, TRACK_LABEL, priceTask } from "@/lib/life-grade";
import { sizeLexically } from "@/lib/life-lexicon";
import type { CaptureToken, ParsedCapture, PayMode, Sizing } from "@/lib/life-types";

/**
 * What the line was understood as, one chip per token, plus the grade it
 * will be written with.
 *
 * Every token chip is a button that turns its words back into title text —
 * the parse is a suggestion the user can refuse in one tap, which is what
 * lets the grammar be generous. Colour follows the app's grammar: green for
 * done, amber for anything due (a date, a deadline, a duty), blue for
 * information, muted for tags.
 *
 * The grade chip is the lexical grade, priced by the same pure function
 * that pays (life-grade.ts), against today's knee as it stood when the
 * sheet opened — hence '≈'. The toast after saving carries the server's
 * exact figure. The AI's refinement lands after the save, so it is never
 * shown here.
 */

const TOKEN_TONE: Record<CaptureToken["field"], string> = {
  done: "chip-green",
  date: "chip-amber",
  deadline: "chip-amber",
  compulsory: "chip-amber",
  mode: "chip-blue",
  recurrence: "chip-blue",
  duration: "chip-blue",
  study: "chip-blue",
  horizon: "chip-blue",
  parent: "chip-blue",
  tag: "chip-muted",
  play: "chip-muted",
  mvv: "chip-muted",
  inbox: "chip-muted",
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
            let tone = TOKEN_TONE[t.field];
            if (t.field === "parent" && parsed.parentHint && goals) {
              // The goal it will attach to, or an honest miss: the server
              // matches the same way (matchParentGoal), so this is what lands.
              if (parent) label = `^ ${parent.title}`;
              else {
                label = `^ ${parsed.parentHint} · no open goal`;
                tone = "chip-amber";
              }
            }
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className={`chip ${tone} capture-chip`}
                  data-warn={t.field === "compulsory" && parsed.compulsoryWarning ? "1" : undefined}
                  onClick={() => onRevert(t)}
                  title={`Tap to keep “${words}” as text`}
                  aria-label={`${label}. Tap to keep “${words}” as text.`}
                >
                  {label}
                  <span aria-hidden className="capture-chip-x">
                    ×
                  </span>
                </button>
              </li>
            );
          })}
          {grade && (
            <li>
              <span
                className="chip chip-muted capture-chip capture-grade"
                title={`${BAND_META[grade.sizing.band].blurb}. lexical · ${Math.round(grade.sizing.confidence * 100)}% · ${grade.sizing.basis}`}
              >
                {BAND_META[grade.sizing.band].label} · ~{formatMinutes(grade.minutes)} ·{" "}
                <span className="mono">
                  {parsed.intrinsic
                    ? "play, 0 XP"
                    : parsed.autoMetric
                      ? "paid by reviews"
                      : grade.xp === null
                        ? "XP after saving"
                        : `≈${formatXp(grade.xp)} XP`}
                </span>
                <span className="capture-grade-basis">lexical · {Math.round(grade.sizing.confidence * 100)}%</span>
              </span>
            </li>
          )}
          {parsed.kind === "GOAL" && (
            <li>
              <span className="chip chip-muted capture-chip capture-grade">Pays through its steps</span>
            </li>
          )}
          {parsed.kind === "IDEA_DRAFT" && (
            <li>
              <span className="chip chip-muted capture-chip capture-grade">Filed to Inbox · finish it in the full form</span>
            </li>
          )}
        </ul>
      )}

      {parsed.compulsoryWarning && (
        <p className="capture-warning" role="note">
          {parsed.compulsoryWarning}.{" "}
          <span style={{ color: "var(--ink-2)" }}>Add a schedule (every mon) or a deadline (by fri).</span>
        </p>
      )}

      {grade && track && feeds.length > 0 && (
        <div className="capture-feeds">
          <span className="label-xs" style={{ fontSize: 9.5 }}>
            Feeds · {TRACK_LABEL[track]}
          </span>
          {feeds.map(([attribute, weight]) => (
            <span key={attribute} className="capture-feed">
              <span aria-hidden className="capture-feed-dot" style={{ background: themeFor(attribute).color }} />
              <span style={{ color: "var(--ink-1)" }}>{ATTRIBUTE_META[attribute].label}</span>
              <span className="mono" style={{ color: "var(--ink-3)" }}>
                {weight}%
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
