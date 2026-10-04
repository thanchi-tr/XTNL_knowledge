/**
 * FINAL (roadmap lane 0; F17): how a week quest row on Today finds its task.
 *
 * On Today a PRACTICE or STEP week quest row is a button, not a '#t-' link:
 * a same-page hash does nothing once the board has mounted (TodayBoard reads
 * '#t-' only on arrival), and quest rows carry no data-template-id, so the
 * board's own `[data-template-id]` lookups can never find a quest row in
 * place of a task. The row dispatches SEEK_TEMPLATE_EVENT (R5, seekTemplate);
 * TodayBoard listens (lane T, onSeekTemplate) and runs its existing seek:
 * it opens Anytime when the task is there, scrolls the row into view and
 * flashes it. On the Aim card and the roadmap page the same rows are links to
 * /today#t-<templateId>, which the board handles on arrival.
 *
 * Client-only helpers; both are no-ops on the server.
 */

/** The window CustomEvent's name. */
export const SEEK_TEMPLATE_EVENT = "xtnl:seek-template";

/** The event's detail. */
export interface SeekTemplateDetail {
  templateId: string;
}

declare global {
  interface WindowEventMap {
    "xtnl:seek-template": CustomEvent<SeekTemplateDetail>;
  }
}

/** Whether a value is a SeekTemplateDetail (a template id of 1–64 safe characters). */
export function isSeekTemplateDetail(value: unknown): value is SeekTemplateDetail {
  if (!value || typeof value !== "object") return false;
  const id = (value as { templateId?: unknown }).templateId;
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

/** Asks Today's board to seek a task (R5's WeekQuests rows on Today). */
export function seekTemplate(templateId: string): void {
  if (typeof window === "undefined") return;
  const detail: SeekTemplateDetail = { templateId };
  if (!isSeekTemplateDetail(detail)) return;
  window.dispatchEvent(new CustomEvent<SeekTemplateDetail>(SEEK_TEMPLATE_EVENT, { detail }));
}

/** Listens for seek requests (lane T's TodayBoard); returns the unsubscribe. */
export function onSeekTemplate(handler: (detail: SeekTemplateDetail) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: CustomEvent<SeekTemplateDetail>) => {
    if (isSeekTemplateDetail(e.detail)) handler(e.detail);
  };
  window.addEventListener(SEEK_TEMPLATE_EVENT, listener);
  return () => window.removeEventListener(SEEK_TEMPLATE_EVENT, listener);
}
