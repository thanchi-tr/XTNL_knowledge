"use client";

/**
 * How anything in the app opens the capture sheet, and the phone's button
 * for it.
 *
 * The sheet lives once, in the layout; everything else asks for it with a
 * window event rather than importing it — the header button, this button,
 * and any page that wants to start a line for the user (the Today board's
 * inbox, say, with `{ text: "goal: " }`). A caller's text only ever fills an
 * empty line; a draft in progress is never overwritten.
 */

/** Opens the sheet. `detail` is a CaptureRequest. */
export const CAPTURE_EVENT = "xtnl:capture";
/** Fired after the server confirms a capture. `detail` is the CapturedItem. */
export const CAPTURED_EVENT = "xtnl:captured";

export interface CaptureRequest {
  /** 'idea' starts the line with 'idea: '. */
  mode?: "task" | "idea";
  /** Text to start the line with, when the line is empty. */
  text?: string;
}

export function openCapture(request: CaptureRequest = {}): void {
  window.dispatchEvent(new CustomEvent<CaptureRequest>(CAPTURE_EVENT, { detail: request }));
}

/**
 * Bottom-left, because the notification bubble owns bottom-right, and on
 * the same row as it: both sit the same distance above the loadout bar, so
 * the two corners read as a pair rather than two things stacked at random.
 * Phones only — from 640px the header's '+ Capture' is in reach.
 */
export function CaptureFab({ hidden }: { hidden: boolean }) {
  if (hidden) return null;
  return (
    <button
      type="button"
      className="capture-fab"
      data-capture-fab=""
      onClick={() => openCapture()}
      aria-label="Capture a task"
      title="Capture"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </button>
  );
}
