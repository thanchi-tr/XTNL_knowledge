import type { Metadata } from "next";
import "@/components/train/train.css";
import { getCurrentUserId } from "@/lib/user";
import { todayKey } from "@/lib/life-day";
import { loadWeightView } from "@/lib/weight-server";
import { deleteWeight, logWeight, setWeightGoal } from "@/app/actions/weight";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/Tabs";
import { WeightCard } from "@/components/train/WeightCard";

// A weigh-in turns over with the life day (04:00) — never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Train" };

/**
 * Train: the Body weight card (a record, never a reward: no XP, MP, streak
 * or celebration), then the honest movement placeholder until M4 (health
 * sync) builds the rest (docs/life-plan/m4.md: the Move ring, strength days,
 * sessions with receipts, the gauges and PRs). The movement section shows
 * no numbers, because none are tracked yet.
 */
export default async function TrainPage() {
  const now = new Date();
  const userId = getCurrentUserId();
  const today = todayKey(now);
  // Fails soft: the empty view when the weight tables are missing.
  const view = await loadWeightView(userId, now);

  return (
    <div className="page narrow">
      <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
        <WeightCard view={view} today={today} actions={{ logWeight, deleteWeight, setWeightGoal }} />
        <section className="card pad-l" aria-labelledby="train-h">
          <p className="t-eyebrow">Movement · coming with health sync</p>
          <h2 id="train-h" className="t-display-m" style={{ marginTop: 6 }}>
            Movement is not tracked here yet
          </h2>
          <p className="t-meta" style={{ marginTop: 8 }}>
            When health sync lands, this page shows the week&apos;s Move ring (150 active minutes, pro-rated for rest days),
            strength days, each session with its receipt, and personal records from sensor data only.
          </p>
          <p className="t-meta" style={{ marginTop: 8 }}>
            Until then, a workout you log as a task on Today still counts for your day and your streak.
          </p>
          <div style={{ marginTop: 16 }}>
            <Button variant="secondary" href="/today" icon="today">
              Back to Today
            </Button>
          </div>
        </section>
        <section aria-labelledby="train-soon">
          <SectionHeader id="train-soon" title="What will be here" />
          <ul className="card" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {[
              ["This week", "The Move ring closes at 150; a second lap shows and pays nothing."],
              ["Sessions", "Each with a paid pill, its receipt, and an optional effort rating."],
              ["Gauges", "Fitness, fatigue and form, or 'calibrating' until 28 days of data exist."],
              ["Records", "Personal records from sensor sessions only."],
            ].map(([k, v]) => (
              <li key={k} className="collapsed" style={{ alignItems: "flex-start", padding: "12px 14px" }}>
                <b className="ink-0" style={{ flex: "0 0 96px" }}>
                  {k}
                </b>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
