/**
 * The week of exercise, every kind (health-2026-10-27.md D19, D23), for Train › Exercise and Body › This week: the
 * sessions and the time from Monday, the WHO record line (effort minutes of 150, strength days of 2) and the kinds
 * logged. "Strength days" shows once a lift can be logged (LIFT_LOGGER_READY, phase 4) or one is there: until then
 * nothing can raise it, so it never stands at "0 of 2". A record of the week, never a target or a debt, and never
 * BODY's kept week: that one reads only paid rows (life-weeks.ts), so it counts a walk and a ticked habit, never a
 * record kind on its own. No hooks: the server page and the client card both render it.
 *
 *   SessionWeekSummary({ sessions, today })   the week's dl, the kinds line, and the WHO notes that apply
 *   todaySessionsLine(sessions, today)         'Today: 1 walk and 1 run.', or null when nothing is logged today
 */
import { EXERCISE_KINDS, EXERCISE_LABEL, LIFT_LOGGER_READY, WHO_LIGHT_NOTE, WHO_STRENGTH_NOTE, asSessionView, distanceLabelOf, durationLabel, sessionNounOf, sessionWeekOf, whoWeekOf } from "@/lib/exercise";
import type { DayKey } from "@/lib/life-day";
import type { ListedSession } from "@/lib/exercise-server";

/** 'a', 'a and b', 'a, b and c'. */
function listOf(parts: readonly string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** 'Today: 1 walk and 1 run.' (in EXERCISE_KINDS order), or null when nothing is logged today. */
export function todaySessionsLine(sessions: readonly Pick<ListedSession, "kind" | "day">[], today: DayKey): string | null {
  const parts = EXERCISE_KINDS.flatMap((k) => {
    const n = sessions.filter((s) => s.kind === k && s.day === today).length;
    return n > 0 ? [sessionNounOf(k, n)] : [];
  });
  return parts.length > 0 ? `Today: ${listOf(parts)}.` : null;
}

export function SessionWeekSummary({ sessions, today }: { sessions: readonly ListedSession[]; today: DayKey }) {
  const all = sessions.map(asSessionView);
  const week = sessionWeekOf(all, today);
  const who = whoWeekOf(all, today);
  // A figure never breaks across lines ("1,500 m" stays whole): a no-break space inside it.
  const kinds = week.byKind.map((k) => `${EXERCISE_LABEL[k.kind]} ${k.sessions}${k.distanceKm > 0 ? ` (${distanceLabelOf(k.kind, k.distanceKm).replace(/ /g, "\u00a0")})` : ""}`);
  const strength = LIFT_LOGGER_READY || who.strengthDays > 0;
  return (
    <div className="wt-ex-sum">
      <dl className={strength ? "wt-ex-week" : "wt-ex-week wt-ex-week-3"} aria-label="This week">
        <div>
          <dt>Sessions</dt>
          <dd>{week.sessions}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{durationLabel(week.durationMin)}</dd>
        </div>
        <div>
          <dt>Effort (WHO)</dt>
          <dd>
            {who.effortMinutes} of {who.effortTarget}
          </dd>
        </div>
        {strength && (
          <div>
            <dt>Strength days</dt>
            <dd>
              {who.strengthDays} of {who.strengthTarget}
            </dd>
          </div>
        )}
      </dl>
      <p className="t-meta">{kinds.length > 0 ? `From Monday: ${kinds.join(", ")}.` : "This week, from Monday. Nothing logged yet."}</p>
      {who.lightMinutes > 0 && <p className="t-meta wt-ex-note">{WHO_LIGHT_NOTE}</p>}
      {who.strengthDays > 0 && <p className="t-meta wt-ex-note">{WHO_STRENGTH_NOTE}</p>}
    </div>
  );
}
