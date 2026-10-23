/**
 * You › Stats' capital line once the dividend is retired (docs/life-plan/blueprint-plan-2026-10-22.md P17; decision
 * D28, harm H19): the banked balance, read only. No Claim, no rate and no accrual: credits replaced the dividend on
 * their launch day, the balance stays exactly as it was (every CapitalLedgerEntry row is kept), and it is never
 * converted into credits. A balance that can't be read says so rather than read 0. Nothing on it acts, so it is a
 * server component; while the dividend runs, StatsParts' DividendLine shows in its place.
 *
 * It keeps the dividend's own name ("Capital dividend (stopped)"): what stopped is the dividend, not the Capital reading
 * on You's Status panel (decision D1's won deals), which goes on as before. And it says plainly that dividend still
 * waiting to be claimed on that day stopped with it (H19: no figure the user saw vanishes without a word).
 */
import type { DayKey } from "@/lib/life-day";
import { shortDayLabel } from "./sheet-math";

const oneDp = (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

export const LEGACY_CAPITAL_TITLE = "Capital dividend (stopped)";

/** The line's words: '1,234.5 banked, kept as it was. The dividend stopped on 26 Oct, when credits started; …'. */
export function legacyCapitalLineOf(balance: number | null, since: DayKey): string {
  const held = balance == null ? "The balance can't be read just now" : `${oneDp(balance)} banked, kept as it was`;
  return `${held}. The dividend stopped on ${shortDayLabel(since)}, when credits started; dividend still waiting to be claimed that day stopped with it. The banked capital is never converted into credits, and it buys nothing.`;
}

export function LegacyCapitalLine({ balance, since }: { balance: number | null; since: DayKey }) {
  return (
    <section className="card pad" aria-label="Capital dividend, stopped">
      <b>{LEGACY_CAPITAL_TITLE}</b>
      <div className="t-meta">{legacyCapitalLineOf(balance, since)}</div>
    </section>
  );
}
