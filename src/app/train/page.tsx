import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/Tabs";

export const metadata: Metadata = { title: "Train" };

/**
 * PLACEHOLDER (L0-foundation): the shell links Train from day one, and no
 * redesign lane owns /train, so it gets an honest page until M4 (health
 * sync) builds the real one (docs/life-plan/m4.md: the Move ring, strength
 * days, sessions with receipts, the gauges and PRs). It shows no numbers,
 * because none are tracked yet.
 */
export default function TrainPage() {
  return (
    <div className="page narrow">
      <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
        <section className="card pad-l" aria-labelledby="train-h">
          <p className="t-eyebrow">Movement · coming with health sync</p>
          <h2 id="train-h" className="t-display-m" style={{ marginTop: 6 }}>
            Nothing is tracked here yet
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
