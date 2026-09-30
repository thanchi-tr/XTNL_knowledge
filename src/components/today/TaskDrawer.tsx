"use client";

import { useState } from "react";
import { BANDS, type Band, type Receipt } from "@/lib/life-types";
import { MINUTE_CHIPS, ruleOf, type BoardRow } from "@/lib/today-board";
import { SIZING_MAX_ATTEMPTS, effBand } from "@/lib/life-grade";
import { gradeChipOf } from "@/lib/life-lexicon";
import type { DayKey } from "@/lib/life-day";
import { formatExpiry } from "@/lib/format-date";
import { BAND_BLURB, BAND_LABEL, fmtMinutes, fmtXp } from "./format";
import { ratingGate, tomorrowOffer } from "./board-ui";

/** A slower write this drawer started and is waiting on. */
export type DrawerWork = { kind: "resize" } | { kind: "rate"; override: number } | { kind: "rename"; title: string };

interface Props {
  row: BoardRow;
  /** The board's clock (ms), for the grade chip's 'sizing…' and 'frozen' and the self-rating cooldown. */
  now: number;
  /** The board's life day. */
  today: DayKey;
  /** Minutes picked from the chips; null means 'at the estimate'. */
  minutes: number | null;
  onMinutes: (m: number | null) => void;
  /** The price with those minutes. */
  projection: Receipt;
  /** The price as the minimum version, when the task has one. */
  minimumProjection: Receipt | null;
  busy: boolean;
  /** A resize, self-rating or rename in flight for this task. */
  working: DrawerWork | null;
  onDone: () => void;
  onMinimum: () => void;
  onSkip: () => void;
  onTomorrow: () => void;
  onAgain: () => void;
  onRename: (title: string) => void;
  onArchive: () => void;
  onOverride: (override: number) => void;
  onResize: () => void;
}

const CHIP_COLOR = { muted: "var(--ink-2)", blue: "var(--blue)", green: "var(--green)" } as const;

/**
 * Everything a row can do besides the one-tap tick: report real minutes (the
 * price re-projects as the chips change), do the minimum version, skip,
 * move to tomorrow, do it again, rename, archive — and the Size panel, which
 * says how the task was graded and lets the player self-rate within the
 * published limits.
 *
 * It only offers what the server will accept: no 'Tomorrow' on a deadline
 * (compulsory ones only move earlier; the others would be pulled in or
 * shed their late factor), and the size buttons close, with the date they
 * reopen, while the weekly self-rating cooldown runs.
 */
export function TaskDrawer(props: Props) {
  const { row, minutes, projection, busy, working } = props;
  const t = row.template;
  const open = row.state === "open" || row.state === "skipped";
  const recurring = !!ruleOf(t);
  const study = !!row.auto;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(t.title);

  const machineIdx = BANDS.indexOf(t.band);
  const pendingRate = working?.kind === "rate" ? working.override : null;
  const effective: Band = effBand(t.band, pendingRate ?? t.bandOverride);
  const maxIdx = Math.min(BANDS.length - 1, machineIdx + 1);
  const resizing = working?.kind === "resize";
  const canResize = !t.gradeFrozen && t.gradeAttempts < SIZING_MAX_ATTEMPTS && !t.sizing;
  const rating = ratingGate(t, props.now);
  const tomorrow = tomorrowOffer(t, props.today);
  const locked = busy || working !== null;
  const chip = gradeChipOf(
    {
      gradeSource: t.gradeSource,
      gradeConfidence: t.gradeConfidence,
      gradeAttempts: t.gradeAttempts,
      gradeFrozenAt: t.gradeFrozenAt ? new Date(t.gradeFrozenAt) : null,
      bandOverride: t.bandOverride,
      createdAt: new Date(t.createdAt),
    },
    new Date(props.now)
  );

  const closeEditor = () => {
    setTitle(t.title);
    setEditing(false);
  };

  return (
    <div className="today-drawer">
      {open && !study && (
        <>
          <div className="today-drawer-row" role="group" aria-label="Minutes it took">
            {MINUTE_CHIPS.map((m) => (
              <button
                key={m}
                type="button"
                className="today-pill mono"
                aria-pressed={minutes === m}
                onClick={() => props.onMinutes(minutes === m ? null : m)}
              >
                {m}m
              </button>
            ))}
          </div>
          <div className="today-drawer-row">
            <button type="button" className="today-pill" data-tone="green" disabled={busy} onClick={props.onDone}>
              Done · {minutes != null ? fmtMinutes(minutes) : `~${fmtMinutes(row.estMinutes)}`} · ≈ {fmtXp(projection.xp)} XP
            </button>
            {t.mvv && props.minimumProjection && (
              <button type="button" className="today-pill" disabled={busy} onClick={props.onMinimum}>
                Do minimum: {t.mvv} · ≈ {fmtXp(props.minimumProjection.xp)} XP
              </button>
            )}
          </div>
        </>
      )}

      <div className="today-drawer-row">
        {open && recurring && !t.compulsory && row.lane !== "yesterday" && row.state !== "skipped" && (
          <button type="button" className="today-pill" disabled={busy} onClick={props.onSkip} title="0 XP; the streak holds">
            Skip today
          </button>
        )}
        {open && !recurring && row.lane !== "yesterday" && tomorrow.show && (
          <button type="button" className="today-pill" disabled={busy} onClick={props.onTomorrow}>
            Tomorrow
          </button>
        )}
        {row.state === "done" && recurring && !study && row.lane !== "yesterday" && (
          <button type="button" className="today-pill" disabled={busy} onClick={props.onAgain} title="Once more today; repeat decay applies">
            Again · ≈ {fmtXp(projection.xp)} XP
          </button>
        )}
        <button
          type="button"
          className="today-pill"
          disabled={locked}
          onClick={() => {
            if (editing) return closeEditor();
            setTitle(t.title);
            setEditing(true);
          }}
          aria-expanded={editing}
        >
          {working?.kind === "rename" ? "Renaming…" : "Edit"}
        </button>
        <button type="button" className="today-pill" data-tone="red" disabled={busy} onClick={props.onArchive} title="Archive it. Undo stays on screen for 10 seconds.">
          Archive
        </button>
      </div>
      {open && !recurring && row.lane !== "yesterday" && !tomorrow.show && tomorrow.reason && (
        <p className="today-drawer-note">{tomorrow.reason}</p>
      )}

      {editing && (
        <form
          className="today-drawer-row"
          onSubmit={(e) => {
            e.preventDefault();
            const clean = title.trim();
            if (clean && clean !== t.title) props.onRename(clean);
            setEditing(false);
          }}
        >
          <input
            className="input"
            style={{ flex: "1 1 200px" }}
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              // Escape cancels the edit, and only the edit: the receipt and
              // any sheet above stay as they are.
              if (e.key === "Escape") {
                e.preventDefault();
                closeEditor();
              }
            }}
            aria-label="Title"
            // A tap on Edit is asking to type: the keyboard comes up with it.
            autoFocus
          />
          <button type="submit" className="today-pill" disabled={locked || !title.trim()}>
            Save
          </button>
        </form>
      )}

      <div className="today-size">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="label-xs">Size</span>
          <span className="mono" style={{ fontSize: 11, color: CHIP_COLOR[chip.tone] }} title={t.gradeBasis ?? undefined}>
            {chip.label}
          </span>
        </div>

        <div className="today-bands" role="radiogroup" aria-label="Self-rated size" aria-busy={pendingRate !== null}>
          {BANDS.map((b, i) => {
            const allowed = i <= maxIdx;
            const current = b === effective;
            const usable = allowed && rating.open;
            return (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={current}
                className="today-band"
                data-current={current ? "1" : undefined}
                disabled={locked || !usable || current}
                onClick={() => props.onOverride(i - machineIdx)}
                style={{ textAlign: "left", background: current ? undefined : "transparent", cursor: usable && !current ? "pointer" : "default", opacity: allowed ? 1 : 0.4 }}
                title={!allowed ? "A self-rating can go at most one band above the machine's" : !rating.open ? "Self-rating is closed until the weekly cooldown ends" : undefined}
              >
                <span style={{ fontSize: 11.5, fontWeight: 600, color: current ? "var(--ink-0)" : "var(--ink-1)", minWidth: 78 }}>
                  {BAND_LABEL[b]}
                  {i === machineIdx ? " ·" : ""}
                </span>
                <span style={{ fontSize: 11 }}>
                  {BAND_BLURB[b]}
                  {current && pendingRate !== null ? " · saving…" : ""}
                </span>
              </button>
            );
          })}
        </div>

        <dl>
          <dt>Why</dt>
          <dd>{t.gradeBasis || "No rule matched; sized as ordinary effort until the AI's answer lands."}</dd>
          <dt>Machine grade</dt>
          <dd>
            {BAND_LABEL[t.band]} · ~{fmtMinutes(t.machineMinutes)}
            {t.estMinutes !== t.machineMinutes ? ` · you said ~${fmtMinutes(t.estMinutes)} (counts up to ${fmtMinutes(t.machineMinutes * 2)})` : ""}
            {t.aiBand && t.aiBand !== t.band ? ` · AI said ${BAND_LABEL[t.aiBand]}` : ""}
          </dd>
          {t.gradeModel && (
            <>
              <dt>Model</dt>
              <dd className="mono" style={{ fontSize: 10.5 }}>
                {t.gradeModel}
                {t.gradePromptVersion != null ? ` · prompt v${t.gradePromptVersion}` : ""}
              </dd>
            </>
          )}
        </dl>

        <div className="today-drawer-row">
          {t.bandOverride !== 0 && (
            <button type="button" className="today-pill" disabled={locked || !rating.open} onClick={() => props.onOverride(0)}>
              Back to the machine&apos;s size
            </button>
          )}
          {(canResize || resizing) && (
            <button
              type="button"
              className="today-pill"
              disabled={locked}
              aria-busy={resizing}
              onClick={props.onResize}
              title="Ask the AI once more, before the size freezes"
            >
              {resizing ? "Sizing…" : "Resize"}
            </button>
          )}
          <span style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
            {!rating.open && rating.nextAt != null
              ? `Self-rated this week. The size can change again from ${formatExpiry(new Date(rating.nextAt))}.`
              : t.gradeFrozen
                ? "Frozen. A self-rating applies to later ticks and can change once a week."
                : "Freezes at the first tick or 24 h after capture."}
          </span>
        </div>
      </div>
    </div>
  );
}
