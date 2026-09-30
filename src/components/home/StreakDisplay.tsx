import type { DailyStreak } from "@/lib/streak";

const DAY_LABELS = ["6d", "5d", "4d", "3d", "2d", "Yest", "Today"];
const FULL_LABELS = [
  "6 days ago",
  "5 days ago",
  "4 days ago",
  "3 days ago",
  "2 days ago",
  "Yesterday",
  "Today",
];

/**
 * Seven-day activity strip.
 *
 * Was a 🔥 emoji beside a glowing gold numeral, with active days rendered
 * as gold-glowing blocks. The mechanic is unchanged; the presentation is
 * now a plain activity bar in the ecosystem's green, which reads as a
 * measurement rather than a reward.
 *
 * A held day (a freeze or a repair kept the streak through it) is drawn in
 * the info blue rather than green: it did not add a day, it only kept the
 * run from breaking, and the strip should not claim work that was not done.
 * A streak that reaches the edge of what the ledger query reads is shown as
 * a floor, "70+", never as a number the app did not count.
 */
export function StreakDisplay({ streak }: { streak: DailyStreak }) {
  return (
    <section className="card flex flex-col p-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="panel-title">Activity</h2>
          <p className="panel-sub">Consecutive days with a review, an idea or a task</p>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span
            className="mono"
            style={{
              fontSize: 26,
              fontWeight: 800,
              lineHeight: 1,
              color: streak.current > 0 ? "var(--green)" : "var(--ink-3)",
            }}
          >
            {streak.current}
            {streak.capped ? "+" : ""}
          </span>
          <span className="label-xs">days</span>
        </div>
      </div>

      <div className="mt-auto grid grid-cols-7 gap-1.5 pt-5">
        {streak.last7Days.map((active, i) => {
          const isHeld = !active && streak.held7Days[i] === true;
          return (
            <div
              key={i}
              className="flex flex-col items-center gap-1.5"
              title={isHeld ? `${FULL_LABELS[i]} · held` : FULL_LABELS[i]}
            >
              <div
                className="h-9 w-full"
                style={{
                  borderRadius: 6,
                  background: active ? "var(--green-10)" : isHeld ? "var(--blue-10)" : "var(--sub)",
                  border: `1px solid ${
                    active ? "rgba(0,204,122,0.35)" : isHeld ? "rgba(77,156,245,0.35)" : "var(--line)"
                  }`,
                }}
              />
              <span className="mono" style={{ fontSize: 9, color: "var(--ink-3)" }}>
                {DAY_LABELS[i]}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
