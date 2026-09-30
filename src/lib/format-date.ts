import { LIFE_TZ } from "./life-day";

/**
 * Deterministic date formatting for server-rendered markup.
 *
 * `date.toLocaleString(undefined, …)` resolves `undefined` to *the
 * runtime's* locale and time zone — Node's on the server, the browser's on
 * the client. When those differ (they nearly always do: Node commonly runs
 * UTC, the viewer does not) the two passes emit different text and React
 * aborts hydration for the whole tree. The visible symptom is not a wrong
 * date; it is that every click handler on the page silently stops working.
 *
 * Pinning both locale and time zone makes the string a pure function of the
 * instant, so both passes agree. The zone is the user's own (`LIFE_TZ`, the
 * one clock in life-day.ts): a NEXT_PUBLIC_ value inlined at build time, so
 * the server and browser bundles carry the same literal and SkillHub and
 * BossPanel still hydrate. It used to be UTC, which was honest about the
 * instant but made the player convert every expiry in their head; the
 * instants themselves (`dueDate`, `graceEndsAt`, boon and debuff expiry) are
 * unchanged, only the reading of them is local now.
 *
 * `tz` exists for the checks; the app never passes it.
 */
const LOCALE = "en-GB";

export function formatExpiry(date: Date, tz: string = LIFE_TZ): string {
  return date.toLocaleString(LOCALE, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
    hour12: false,
  });
}

/** Date only — no clock. */
export function formatDay(date: Date, tz: string = LIFE_TZ): string {
  return date.toLocaleString(LOCALE, {
    month: "short",
    day: "numeric",
    timeZone: tz,
  });
}
