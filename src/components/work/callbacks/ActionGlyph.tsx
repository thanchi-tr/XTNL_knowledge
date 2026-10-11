import type { CallBackAction } from "@/lib/callbacks";

/**
 * A call back's action as a glyph: a phone handset, or a person. Decorative (aria-hidden): the word ('Phone
 * call', 'In person') always stands beside it. Drawn in the kit's stroke style (svg.i: 1.75, round,
 * currentColor), so it follows the theme like every Icon.
 */
export function ActionGlyph({ action }: { action: CallBackAction }) {
  return action === "PHONE" ? (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6.6 3.5h2.8l1.5 4-2.1 1.4a11.5 11.5 0 0 0 6.3 6.3l1.4-2.1 4 1.5v2.8a2 2 0 0 1-2.2 2A16.6 16.6 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" />
    </svg>
  ) : (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0" />
    </svg>
  );
}
