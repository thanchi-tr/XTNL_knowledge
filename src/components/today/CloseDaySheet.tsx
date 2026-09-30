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
}

/**
 * Close the day: Tomorrow / Anytime / Drop per open todo, "Do the minimum"
 * for an open must, Roll all, and (M2) a one-line note, a mood of 1–5
 * (never graded) and a Rest tomorrow switch.
 *
 * Presentational: the caller says which choices exist and what each does.
 * On Today it acts at once with the moves the server already accepts (a
 * one-off to tomorrow, a must's minimum) and leaves out the reflection,
 * which needs M2's storage; /dev/style/today renders the full M2 sheet from
 * fixtures. `chosen` marks a pending pick when the caller batches them.
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
          <div className="today-opt-card">
            <HeldGlyph kind="rest" size={22} className="held" />
            <div className="n">
              Rest tomorrow
              <span>Nothing is owed on a rest day. The day after gets the rested bonus.</span>
            </div>
            <Switch checked={reflection.restTomorrow} onChange={reflection.onRestTomorrow} label="Rest tomorrow" />
          </div>
        </>
      )}
    </Sheet>
  );
}
