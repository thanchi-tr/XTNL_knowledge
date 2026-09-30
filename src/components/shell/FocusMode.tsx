/**
 * FROZEN CONTRACT — <FocusMode/> (L0-foundation).
 *
 * Render it anywhere inside a page (server or client) and the shell's chrome
 * (top bar, tab bar, rail, sidebar) steps aside while it is mounted: the
 * runner template (no shell, max 560, exit top-left). Pure CSS
 * (`.app:has(.focus-mode) [data-chrome] { display: none }`), so it holds from
 * the first server-rendered paint with no flash and no JavaScript.
 */
export function FocusMode() {
  return <span className="focus-mode" hidden />;
}
