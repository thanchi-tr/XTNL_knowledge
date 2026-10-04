"use client";

import { useState } from "react";
import type { MissPromptCopy } from "./board-ui";

/**
 * The miss prompt (M2, F6): an Ask under a must's MakeUpCard once it has
 * been missed MISS_PROMPT_RUN (3) times in a row. It never blames: it offers
 * a smaller version ('Add a minimum version', one line, immediate), letting
 * it stop being a must (deferred seven days once Duty is live, past the
 * 60-minute typo grace) and a quiet 'Not now', which hides it on this device
 * until the next miss. At most one on the board (board-ui.ts missPromptOf).
 *
 * The Ask's layout (ink diamond, a plain sentence, the actions), inside the
 * Must lane's card rather than as a card of its own.
 */
export function MissPrompt({
  copy,
  busy,
  onAddMinimum,
  onStop,
  onNotNow,
}: {
  copy: MissPromptCopy;
  busy?: boolean;
  /** Saves the minimum version ('10 pushups'); immediate. */
  onAddMinimum: (text: string) => void;
  onStop: () => void;
  onNotNow: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const clean = text.trim();
  return (
    <section className="today-ask miss-prompt" aria-label="A must missed in a row">
      <span className="ask-dot" aria-hidden="true" />
      <div className="txt">
        <b>{copy.title}</b>
        <span>{copy.detail}</span>
        {adding && (
          <form
            className="mp-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!clean) return;
              onAddMinimum(clean);
              setAdding(false);
              setText("");
            }}
          >
            <input
              className="today-input"
              value={text}
              maxLength={80}
              placeholder="The smallest version, e.g. 10 pushups"
              aria-label="Minimum version"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setAdding(false);
                }
              }}
              autoFocus
            />
            <button type="submit" className="today-pill" disabled={busy || !clean}>
              Save
            </button>
          </form>
        )}
        <div className="mp-acts">
          {copy.addMinimum && !adding && (
            <button type="button" className="today-pill" disabled={busy} onClick={() => setAdding(true)}>
              Add a minimum version
            </button>
          )}
          {copy.stop && (
            <button type="button" className="today-pill" disabled={busy} onClick={onStop}>
              {copy.stop}
            </button>
          )}
          <button type="button" className="today-pill" onClick={onNotNow}>
            Not now
          </button>
        </div>
      </div>
    </section>
  );
}
