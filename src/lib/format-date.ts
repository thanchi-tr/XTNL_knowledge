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
 * instant, so both passes agree. UTC is the honest choice here because
 * every deadline in this app (`dueDate`, `graceEndsAt`, boon/debuff
 * expiry) is computed in UTC to begin with — rendering them in local time
 * would misreport when they actually land.
 */
const LOCALE = "en-GB";

export function formatExpiry(date: Date): string {
  return date.toLocaleString(LOCALE, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  });
}

/** Date only — no clock. */
export function formatDay(date: Date): string {
  return date.toLocaleString(LOCALE, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
