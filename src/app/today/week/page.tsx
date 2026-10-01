import "../rules/rules.css";
import type { Metadata } from "next";
import { after } from "next/server";
import { getCurrentUserId } from "@/lib/user";
import { addDays, todayKey, type DayKey } from "@/lib/life-day";
import { LIFE_MP_WEEK_CAP, isBackfillDetail, lifeWritesEnabled, weekKeptMintKey, withoutBackfill } from "@/lib/life-economy";
import {
  DISPLAY_ORDER,
  TRACK_NAME,
  TRACK_SIGIL,
  lifeMpInWeek,
  notLaunchedView,
  trackStateAt,
  type LifeLedger,
} from "@/lib/life-tracks";
import { loadLifeLedger, loadLifeTracks } from "@/lib/life-tracks-server";
import { maybeJudgeWeeks } from "@/lib/life-weeks-server";
import { firstWeekJudgement, longDayLabel, mpFigure, pendingWeek, weekReviewPromise, weekdayDayLabel } from "@/components/home/sheet-math";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { CurrencyGlyph, Sigil } from "@/components/ui/Icon";
import { SectionHeader } from "@/components/ui/Tabs";

export const metadata: Metadata = { title: "Weekly review" };

// Weeks are judged lazily on reads like this one; the page must never be baked at build time.
export const dynamic = "force-dynamic";

/**
 * /today/week — the last judged week, and the weekly review to come.
 *
 * Once life counts, the 'Last week' card shows the latest week the judge
 * wrote (every figure from its WEEK rows and mints: the stored reason, the
 * MP paid, the kept-week streak, the week's life MP against the cap). Before
 * a week is judged it says when the first one will be, computed from the
 * judging rule. While the week that just ended is not judged yet (Monday,
 * Tuesday, Wednesday before the judge runs) the card is headed 'Last judged
 * week' and says when that week is. Before launch it shows the review's placeholder only: kept
 * weeks are not judged yet, and a card with made-up tracks would be a
 * dishonest number. The five-step review runner arrives with daily
 * settlement.
 */

/** One track's row of the last judged week. */
interface WeekRow {
  track: (typeof DISPLAY_ORDER)[number];
  kept: boolean;
  /** The stored reason without 'backfill · ' or the verdict the chip already states. */
  reason: string;
  backfill: boolean;
  /** MP minted for this kept week; null when none was (not kept, backfill, or the cap). */
  mp: number | null;
  /** Consecutive kept weeks ending at this one. */
  streak: number;
}

interface LastWeek {
  weekKey: string;
  monday: DayKey;
  sunday: DayKey;
  backfill: boolean;
  rows: WeekRow[];
  /** Capped life MP dated in that week. */
  used: number;
}

function reasonOf(detail: string): string {
  return withoutBackfill(detail).replace(/^(Kept|Not kept)( · |$)/, "");
}

function lastWeekOf(ledger: LifeLedger, weekKey: string): LastWeek | null {
  const weeks = ledger.weeks.filter((w) => w.weekKey === weekKey);
  if (weeks.length === 0) return null;
  const sunday = weeks[0].sunday;
  const monday = addDays(sunday, -6);
  const streakOf = new Map(trackStateAt(ledger, sunday).map((s) => [s.track, s.keptStreak]));
  const rows: WeekRow[] = [];
  for (const track of DISPLAY_ORDER) {
    const w = weeks.find((x) => x.track === track);
    if (!w) continue;
    const mint = ledger.mints.find((m) => m.key === weekKeptMintKey(track, weekKey));
    rows.push({
      track,
      kept: w.kept,
      reason: reasonOf(w.detail),
      backfill: isBackfillDetail(w.detail),
      mp: mint && mint.qty > 0 ? mint.qty : null,
      streak: streakOf.get(track) ?? 0,
    });
  }
  return { weekKey, monday, sunday, backfill: rows.some((r) => r.backfill), rows, used: lifeMpInWeek(ledger, monday) };
}

function LastWeekCard({ week, today }: { week: LastWeek; today: DayKey }) {
  const kept = week.rows.filter((r) => r.kept).length;
  // The week that just ended, while it is not judged yet: this card is then the week before.
  const pending = pendingWeek(week.sunday, today);
  return (
    <section aria-labelledby="lw-h">
      <SectionHeader title={pending ? "Last judged week" : "Last week"} />
      <div className="card">
        <h2 id="lw-h" className="lw-head">
          Week of {longDayLabel(week.monday)} · {kept} of {week.rows.length} {week.rows.length === 1 ? "track" : "tracks"} kept
        </h2>
        {pending && (
          <p className="t-meta lw-pending">
            {pending.due
              ? lifeWritesEnabled()
                ? `The week of ${longDayLabel(pending.monday)} can be judged now: it is judged in the background as this page opens.`
                : `The week of ${longDayLabel(pending.monday)} can be judged now; this server only reads weeks.`
              : `The week of ${longDayLabel(pending.monday)} is judged on ${weekdayDayLabel(pending.judgeDay)}.`}
          </p>
        )}
        <ul className="lw-rows">
          {week.rows.map((r) => (
            <li key={r.track} className="lw-row">
              <Sigil track={TRACK_SIGIL[r.track]} />
              <div className="lw-body">
                <b>{TRACK_NAME[r.track]}</b>
                {r.reason && <span className="t-meta lw-line">{r.reason}</span>}
                <span className="t-meta lw-line">
                  {r.kept && r.backfill && "kept before life MP began · "}
                  {r.kept && !r.backfill && r.mp != null && (
                    <>
                      <span className="cur">
                        <CurrencyGlyph kind="mp" />+{mpFigure(r.mp)}
                      </span>{" "}
                      MP ·{" "}
                    </>
                  )}
                  {r.kept && !r.backfill && r.mp == null && "no MP: the life week's cap was reached · "}
                  kept-week streak {r.streak}
                </span>
              </div>
              <Chip tone={r.kept ? "kept" : "quiet"}>{r.kept ? "Kept" : "Not kept"}</Chip>
            </li>
          ))}
        </ul>
        <p className="t-meta lw-foot">
          {week.backfill
            ? "That week closed before life MP began, so it paid none. Its kept weeks still raise each track's depth cap."
            : `Life MP for that week: ${mpFigure(week.used)} of ${mpFigure(LIFE_MP_WEEK_CAP)}`}
        </p>
      </div>
    </section>
  );
}

/** No week judged yet: when the first one is, from the judging rule (or that it is due now). */
function FirstWeekCard({ epochDay, today }: { epochDay: DayKey | null; today: DayKey }) {
  const first = firstWeekJudgement(epochDay ?? today, today);
  const due = first.due;
  const monday = longDayLabel(first.monday);
  return (
    <section aria-labelledby="lw-h">
      <SectionHeader title="Last week" />
      <div className="card pad-l">
        <h2 id="lw-h" className="lw-head-plain">
          {due ? `The week of ${monday} can be judged now` : "No week has been judged yet"}
        </h2>
        <p className="t-meta" style={{ marginTop: 8 }}>
          {due
            ? lifeWritesEnabled()
              ? "It is judged in the background as this page opens; reload in a moment to see it."
              : "This server only reads weeks; the live app judges them."
            : `The first week is judged on ${weekdayDayLabel(first.judgeDay)}, once the last day of the week of ${monday} can no longer be recorded.`}
        </p>
      </div>
    </section>
  );
}

export default async function WeekPage() {
  const userId = getCurrentUserId();
  const now = new Date();
  // The lazy week judge, after the response (idempotent; it writes only once life counts, on a
  // server allowed to write). A newly judged week shows here, with its Seal, on the next load.
  after(async () => {
    await maybeJudgeWeeks(userId);
  });
  const life = await loadLifeTracks(userId).catch(() => notLaunchedView(todayKey(now)));
  const ledger = life.launched ? await loadLifeLedger(userId).catch(() => null) : null;
  const week = ledger && life.lastJudgedWeek ? lastWeekOf(ledger, life.lastJudgedWeek) : null;

  return (
    <div className="page narrow today-week">
      <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
        {life.launched && ledger && (week ? <LastWeekCard week={week} today={life.today} /> : <FirstWeekCard epochDay={ledger.epochDay} today={life.today} />)}
        <section className="card pad-l" aria-labelledby="week-h">
          <p className="t-eyebrow">Weekly review · arrives with daily settlement</p>
          <h2 id="week-h" className="t-display-m" style={{ marginTop: 6 }}>
            A short review of the week that ended
          </h2>
          <p className="t-meta" style={{ marginTop: 8 }}>
            {weekReviewPromise(life.launched)}
          </p>
          <p className="t-meta" style={{ marginTop: 8 }}>
            Until then, every tick on Today is already counted, and nothing is lost.
          </p>
          <div className="lw-actions">
            <Button variant="secondary" href="/today" icon="today">
              Back to Today
            </Button>
            {life.launched && (
              <Button variant="quiet" href="/today/rules">
                How weeks are judged
              </Button>
            )}
          </div>
        </section>
        <section aria-labelledby="week-steps">
          <SectionHeader id="week-steps" title="Five steps, each skippable" />
          <ol className="card" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {[
              ["Last week", "Kept or not per track, with the reason; days shown up; freezes used."],
              ["Inbox", "Sort what is left to zero, one tap each."],
              ["Goals", "Check in on anything that has stalled."],
              ["Owed", "Make up, or leave it: it never grows."],
              ["Next week", "Rest days and daily capacity."],
            ].map(([k, v]) => (
              <li key={k} className="collapsed" style={{ alignItems: "flex-start", padding: "12px 14px" }}>
                <b className="ink-0" style={{ flex: "0 0 96px" }}>
                  {k}
                </b>
                <span>{v}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
