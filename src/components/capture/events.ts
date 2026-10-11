/**
 * How anything in the app opens the capture sheet.
 *
 * The sheet lives once, in the root layout (QuickCapture); everything else
 * asks for it with a window event rather than importing it: the tab bar's
 * +, the rail and sidebar Capture (shell/capture-bridge.ts dispatches the
 * same event name with the section's mode, and scripts/shell-check.ts
 * asserts they agree), and any page that wants to start a line
 * (`{ text: "goal: " }`). A caller's text only ever fills an empty line; a
 * draft in progress is never overwritten.
 *
 * The phone's old corner button (CaptureFab) is retired: the tab bar's +
 * replaces it.
 */

/** Opens the sheet. `detail` is a CaptureRequest. */
export const CAPTURE_EVENT = "xtnl:capture";
/** Fired after the server confirms a capture. `detail` is the CapturedItem. */
export const CAPTURED_EVENT = "xtnl:captured";

/**
 * What a line starts as. The shell's '+' and the 'c' / Alt+N hotkey ask for
 * the current section's mode (shell/nav.ts captureModeOf): Ideas an idea,
 * Tasks a task, Body a weigh-in. Each is the line's own grammar, typed out,
 * so it is edited or cleared like any line, and the chips read it as usual.
 */
export type CaptureMode = "task" | "idea" | "body";

/** The words a mode starts an empty line with: 'idea: ' (an idea), 'weight ' (a weigh-in, weight-capture.ts); a task starts empty. */
export const CAPTURE_MODE_START: Readonly<Record<CaptureMode, string | null>> = { task: null, idea: "idea: ", body: "weight " };

/**
 * A line that is only a mode's own start ('idea: ', 'weight '), nothing
 * typed after it: the '+' wrote it and the person closed the sheet. It is
 * no draft, so the next opening in a mode replaces it with that mode's
 * start (a task's empties it); anything typed after the start is kept.
 */
export function isBareModeStart(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t !== "" && Object.values(CAPTURE_MODE_START).some((s) => s !== null && s.trim() === t);
}

export interface CaptureRequest {
  /** 'idea' starts the line with 'idea: ', 'body' with 'weight ' (CAPTURE_MODE_START); 'task' leaves it empty. */
  mode?: CaptureMode;
  /** Text to start the line with, when the line is empty. */
  text?: string;
}

export function openCapture(request: CaptureRequest = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CaptureRequest>(CAPTURE_EVENT, { detail: request }));
}
