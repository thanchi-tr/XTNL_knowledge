/**
 * You › Moments: grouping and dating, pure (you-check runs it).
 *
 * Every date is read in the life zone (LIFE_TZ, the one clock in
 * life-day.ts), never the host's: on a UTC server a moment earned on the
 * morning of 1 Oct in Sydney would otherwise read "30 Sept" and land under
 * September. `tz` exists for the checks; the page never passes it.
 */
import { LIFE_TZ } from "@/lib/life-day";
import type { CelebrationEvent } from "@/lib/celebration-types";

const LOCALE = "en-GB";

function instantOf(ev: Pick<CelebrationEvent, "createdAt">): Date | null {
  const at = ev.createdAt ? new Date(ev.createdAt) : null;
  return at && !Number.isNaN(at.getTime()) ? at : null;
}

/** "October 2026", in the life zone. */
export function momentMonth(at: Date, tz: string = LIFE_TZ): string {
  return new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric", timeZone: tz }).format(at);
}

/** "1 Oct", in the life zone. */
export function momentDay(at: Date, tz: string = LIFE_TZ): string {
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", timeZone: tz }).format(at);
}

/** Newest-first events into consecutive month groups (undated ones together). */
export function momentMonths<E extends Pick<CelebrationEvent, "createdAt">>(events: readonly E[], tz: string = LIFE_TZ): { month: string; events: E[] }[] {
  const out: { month: string; events: E[] }[] = [];
  for (const ev of events) {
    const at = instantOf(ev);
    const month = at ? momentMonth(at, tz) : "Undated";
    const last = out[out.length - 1];
    if (last && last.month === month) last.events.push(ev);
    else out.push({ month, events: [ev] });
  }
  return out;
}

/** The row's meta line: what it was, the day, and (for an Ascension) its cost. */
export function momentMeta(ev: Pick<CelebrationEvent, "tier" | "facts" | "createdAt">, tz: string = LIFE_TZ): string {
  const at = instantOf(ev);
  const when = at ? momentDay(at, tz) : null;
  const what = ev.tier === 3 ? (ev.facts.kicker ?? ev.facts.eyebrow) : ev.facts.eyebrow;
  return [what, when, ev.tier === 3 ? ev.facts.cost : null].filter(Boolean).join(" · ");
}
