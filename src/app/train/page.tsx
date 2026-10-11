import type { Metadata } from "next";
import "@/components/train/train.css";
import { getCurrentUserId } from "@/lib/user";
import { todayKey } from "@/lib/life-day";
import { loadWeightView } from "@/lib/weight-server";
import { loadExerciseView } from "@/lib/exercise-server";
import { durationLabel } from "@/lib/exercise";
import { deleteWeight, logWeight, setWeightGoal } from "@/app/actions/weight";
import { Button } from "@/components/ui/Button";
import { WeightCard } from "@/components/train/WeightCard";

// A weigh-in and a walk turn over with the life day (04:00) — never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Body" };

/** "3.46 km", "12.5 km", "0 km": the Exercise card's own figure. */
const km = (v: number): string => `${v.toFixed(v < 10 ? 2 : 1).replace(/\.?0+$/, "")} km`;

/**
 * Body › This week (the three sections: Ideas, Tasks, Body): the health log.
 * The weight card (a record, never a reward: no XP, MP, streak or
 * celebration), then this week's walks, the Exercise card's own totals
 * (sessions, distance, time and climb from Monday), with "Log a walk" to
 * Body › Exercise, where walks are logged and listed. Both reads are cached
 * per life day and fail soft (the empty views) before their migrations. No
 * new data: what Body tracks is what it logs, weight and walks.
 */
export default async function TrainPage() {
  const now = new Date();
  const userId = getCurrentUserId();
  const today = todayKey(now);
  // One wave; each fails soft to its empty view when its tables are missing.
  const [view, walks] = await Promise.all([loadWeightView(userId, now), loadExerciseView(userId, now)]);
  const w = walks.week;
  const walkedToday = walks.sessions.filter((s) => s.day === today);

  return (
    <div className="page narrow">
      <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
        <WeightCard view={view} today={today} actions={{ logWeight, deleteWeight, setWeightGoal }} />
        <section className="card pad-l wt-ex-card" aria-labelledby="train-walks-h">
          <h2 id="train-walks-h" className="t-eyebrow wt-eyebrow">
            Walking · this week
          </h2>
          <dl className="wt-ex-week" aria-label="This week">
            <div>
              <dt>Walks</dt>
              <dd>{w.sessions}</dd>
            </div>
            <div>
              <dt>Distance</dt>
              <dd>{km(w.distanceKm)}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{durationLabel(w.durationMin)}</dd>
            </div>
            <div>
              <dt>Climb</dt>
              <dd>{w.climbM} m</dd>
            </div>
          </dl>
          <p className="t-meta wt-ex-week-l">
            {walkedToday.length > 0
              ? `Today: ${walkedToday.length} ${walkedToday.length === 1 ? "walk" : "walks"}, ${km(walkedToday.reduce((n, s) => n + s.distanceKm, 0))}.`
              : "From Monday. Nothing logged today yet."}
          </p>
          <div>
            <Button variant="primary" href="/train/exercise" icon="train">
              Log a walk
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
