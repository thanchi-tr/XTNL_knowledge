/**
 * How the shell opens the one capture sheet (QuickCapture, L1) without
 * importing it: the same window event QuickCapture listens for. The event
 * name mirrors CAPTURE_EVENT in components/capture (scripts/shell-check.ts
 * asserts they agree while that constant exists).
 */
export const SHELL_CAPTURE_EVENT = "xtnl:capture";

export function openCaptureSheet(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SHELL_CAPTURE_EVENT, { detail: {} }));
}
