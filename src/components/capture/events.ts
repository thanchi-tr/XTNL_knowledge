/**
 * How anything in the app opens the capture sheet.
 *
 * The sheet lives once, in the root layout (QuickCapture); everything else
 * asks for it with a window event rather than importing it: the tab bar's
 * +, the rail and sidebar Capture (shell/capture-bridge.ts dispatches the
 * same event name, and scripts/shell-check.ts asserts they agree), and any
 * page that wants to start a line (`{ text: "goal: " }`). A caller's text
 * only ever fills an empty line; a draft in progress is never overwritten.
 *
 * The phone's old corner button (CaptureFab) is retired: the tab bar's +
 * replaces it.
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
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CaptureRequest>(CAPTURE_EVENT, { detail: request }));
}
