/**
 * How the shell opens the one capture sheet (QuickCapture, L1) without
 * importing it: the same window event QuickCapture listens for. The event
 * name mirrors CAPTURE_EVENT in components/capture (scripts/shell-check.ts
 * asserts they agree while that constant exists). The shell's '+' passes
 * the section's mode (nav.ts captureModeOf), so the line starts as an idea
 * on Ideas, a weigh-in on Body and a task elsewhere.
 */
import type { CaptureMode } from "@/components/capture/events";

export const SHELL_CAPTURE_EVENT = "xtnl:capture";

export function openCaptureSheet(mode?: CaptureMode): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SHELL_CAPTURE_EVENT, { detail: mode ? { mode } : {} }));
}
