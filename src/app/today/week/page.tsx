import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/Tabs";

export const metadata: Metadata = { title: "Weekly review" };

/**
 * /today/week — the Monday weekly review (M2). Its runner and week card are
 * built (components/today/m2/WeekRunner.tsx, previewed from fixtures on
 * /dev/style/today), but kept weeks are judged by M2's daily settlement,
 * which does not exist yet. Until it does, this page says so and shows no
 * numbers: a week card with made-up tracks would be a dishonest number.
 */
export default function WeekPage() {
  return (
    <div className="page narrow">
      <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
        <section className="card pad-l" aria-labelledby="week-h">
          <p className="t-eyebrow">Weekly review · arrives with daily settlement</p>
          <h2 id="week-h" className="t-display-m" style={{ marginTop: 6 }}>
            No week has been judged yet
          </h2>
          <p className="t-meta" style={{ marginTop: 8 }}>
            Once each day is settled at 04:00, Monday opens a short review of the week that ended: what each track kept and
            why, the inbox to zero, a goals check-in, anything owed, and the shape of next week. It ends on the week card,
            which states the exact mastery points paid for each kept track.
          </p>
          <p className="t-meta" style={{ marginTop: 8 }}>
            Until then, every tick on Today is already counted, and nothing is lost.
          </p>
          <div style={{ marginTop: 16 }}>
            <Button variant="secondary" href="/today" icon="today">
              Back to Today
            </Button>
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
