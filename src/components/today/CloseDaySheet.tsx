"use client";

import { Button } from "@/components/ui/Button";
import { HeldGlyph } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { Switch } from "@/components/ui/Tabs";

/** One open item and the moves the server accepts for it. */
export interface CloseItem {
  key: string;
  title: string;
  /** "Planned · carries forward, never late". */
  meta: string;
  /** "tomorrow" | "anytime" | "drop" | "minimum" (the board decides which it can honour). */
  choices: { id: string; label: string }[];
}

/** M2: the day's reflection. Never graded; nothing here changes XP or the streak. */
export interface CloseReflection {
  note: string;
  onNote: (v: string) => void;
  mood: number | null;
  onMood: (v: number) => void;
  restTomorrow: boolean;
  onRestTomorrow: (v: boolean) => void;
  /** The switch, named by its day ('Rest Wednesday': between 00:00 and 04:00 'tomorrow' is ambiguous). Default 'Rest tomorrow'. */
  restLabel?: string;
  /** Why the switch is off limits (two rest days that week already); shown in place of its note. */
  restDisabledReason?: string | null;
  /** False hides the switch (no Duty launch day yet, or the day is before it). Default shown. */
  showRest?: boolean;
}

/**
 * Close the day: Tomorrow / Anytime / Drop per open todo, "Do the minimum"
 * for an open must (or, without one, the honest line of what leaving it
 * open costs, with no choices), Skip today for a habit, Roll all, and (M2)
 * a one-line note, a mood of 1–5 (never graded) and a 'Rest <weekday>'
 * switch.
 *
 * Presentational: the caller says which choices exist and what each does
 * (board-ui.ts closeItemsOf). On Today it acts at once with the moves the
 * server accepts; before Duty is live it leaves out the reflection.
 * `chosen` marks a pending pick when the caller batches them.
 */
export function CloseDaySheet({
  open,
  onClose,
  description = "Optional. One minute. Nothing here changes XP or the streak.",
  items,
  chosen,
  onChoose,
  onRollAll,
  reflection,
  busy,
  doneLabel = "Close today",
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  description?: string;
  items: CloseItem[];
  chosen?: Record<string, string>;
  onChoose: (key: string, choice: string) => void;
  onRollAll?: () => void;
  reflection?: CloseReflection;
  busy?: boolean;
  doneLabel?: string;
  onDone?: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Close the day"
      description={description}
      footer={
        onDone ? (
          <Button variant="primary" size="lg" block onClick={onDone}>
            {doneLabel}
          </Button>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <p className="t-meta">Nothing is left open today.</p>
      ) : (
        <div className="y-list">
          {items.map((it) => (
            <div key={it.key} className="y-row">
              <div className="n">
                <b>{it.title}</b>
                <span>{it.meta}</span>
              </div>
              {it.choices.length > 0 && (
                <div className="opt" role="group" aria-label={`What to do with ${it.title}`}>
                  {it.choices.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="y-opt"
                      aria-pressed={chosen ? chosen[it.key] === c.id : undefined}
                      disabled={busy}
                      onClick={() => onChoose(it.key, c.id)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {onRollAll && (
        <Button variant="secondary" block onClick={onRollAll} disabled={busy} className="y-roll">
          Roll all to tomorrow
        </Button>
      )}
      {reflection && (
        <>
          <label className="t-eyebrow y-label" htmlFor="close-note">
            One line (never graded)
          </label>
          <input
            id="close-note"
            className="today-input y-note"
            placeholder="What went well, or didn't"
            value={reflection.note}
            maxLength={200}
            onChange={(e) => reflection.onNote(e.target.value)}
          />
          <p className="t-eyebrow y-label" id="close-mood">
            Mood
          </p>
          <div className="moods" role="group" aria-labelledby="close-mood">
            {[1, 2, 3, 4, 5].map((m) => (
              <button key={m} type="button" aria-pressed={reflection.mood === m} onClick={() => reflection.onMood(m)}>
                {m}
              </button>
            ))}
          </div>
          {reflection.showRest !== false && (
            <div className="today-opt-card">
              <HeldGlyph kind="rest" size={22} className="held" />
              <div className="n">
                {reflection.restLabel ?? "Rest tomorrow"}
                <span>{reflection.restDisabledReason ?? "Declared the day before. Nothing is owed on a rest day, and the streak holds."}</span>
              </div>
              <Switch
                checked={reflection.restTomorrow}
                onChange={reflection.onRestTomorrow}
                label={reflection.restLabel ?? "Rest tomorrow"}
                disabled={!!reflection.restDisabledReason || busy}
              />
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
