"use client";

/**
 * Fixture views for the Body weight card. The actions are fakes: they wait
 * a moment and answer ok, so the forms show their pending and saved states,
 * but nothing is written and the views never change.
 */
import { WeightCard } from "@/components/train/WeightCard";
import { FIXTURE_TODAY, WEIGHT_FIXTURES, type WeightFixtureName } from "@/components/train/fixtures";
import type { WeightActions } from "@/components/train/types";
import { ExerciseCard, type ExerciseActions } from "@/components/train/ExerciseCard";
import { MonthDoneCard } from "@/components/task-style/MonthDoneCard";
import { TaskMonth } from "@/components/task-style/TaskMonth";
import { TaskStylePicker } from "@/components/task-style/TaskStylePicker";
import { exerciseWeekOf, type ExerciseSessionView } from "@/lib/exercise";
import type { MonthDoneTask } from "@/lib/task-style";

const wait = () => new Promise<void>((r) => setTimeout(r, 400));
const FAKE: WeightActions = {
  logWeight: async () => {
    await wait();
    return { ok: true, value: { replaced: false } };
  },
  deleteWeight: async () => {
    await wait();
    return { ok: true };
  },
  setWeightGoal: async () => {
    await wait();
    return { ok: true };
  },
};

const EX_TODAY = "2026-10-08";
const WALKS: ExerciseSessionView[] = [
  { id: "w1", kind: "WALK", day: "2026-10-08", angleDeg: 5, distanceKm: 3.2, durationMin: 42, note: null },
  { id: "w2", kind: "WALK", day: "2026-10-07", angleDeg: 0, distanceKm: 5, durationMin: 58, note: null },
  { id: "w3", kind: "WALK", day: "2026-10-05", angleDeg: 8.5, distanceKm: 2.4, durationMin: 40, note: null },
];
const FAKE_EX: ExerciseActions = {
  logWalk: async () => {
    await wait();
    return { ok: false, error: "Fixtures save nothing." };
  },
  deleteExercise: async () => {
    await wait();
    return { ok: true, value: null };
  },
};
const T = (templateId: string, title: string, icon: MonthDoneTask["icon"], color: MonthDoneTask["color"]): MonthDoneTask => ({ templateId, title, icon, color });
const WALK = T("t1", "Walk 30 minutes", "walk", "teal");
const READ = T("t2", "Read 20 pages", "book", "indigo");
const BILLS = T("t3", "Pay the bills", "money", "amber");
const WATER = T("t4", "Drink 2 L of water", "water", "blue");
const PLAIN = T("t5", "Stretch", null, null);
const MONTH_DAYS: Record<string, MonthDoneTask[]> = {};
for (let d = 1; d <= 8; d++) {
  const key = `2026-10-${String(d).padStart(2, "0")}`;
  MONTH_DAYS[key] = [WALK, ...(d % 2 ? [READ] : []), ...(d === 3 ? [BILLS] : []), ...(d % 3 ? [WATER] : []), ...(d === 6 ? [PLAIN] : [])];
}
const MONTH = { month: "2026-10", days: MONTH_DAYS };
const TASK_MARKS = { "2026-10-01": "done", "2026-10-02": "done", "2026-10-03": "missed", "2026-10-04": "done", "2026-10-06": "done", "2026-10-07": "done" } as const;

export function ExerciseStyleFixtures() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <p className="t-eyebrow" style={{ margin: "0 0 8px" }}>
          Exercise · walking
        </p>
        <ExerciseCard view={{ today: EX_TODAY, sessions: WALKS, week: exerciseWeekOf(WALKS, EX_TODAY), ready: true }} actions={FAKE_EX} />
      </div>
      <div>
        <p className="t-eyebrow" style={{ margin: "0 0 8px" }}>
          A task&apos;s drawer: its month and its look
        </p>
        {/* As narrow as a board column's drawer, inside a box that clips (as a lane does): the pop-ups must still show whole. */}
        <section className="card pad-l" data-fixture="task-month" style={{ maxWidth: 340, overflow: "hidden" }}>
          <div className="tsk-sec-grid">
            <TaskMonth templateId="t1" title="Walk 30 minutes" today={EX_TODAY} style={{ icon: "walk", color: "teal" }} load={async (_id, month) => ({ ok: true, value: { month, marks: month === "2026-10" ? { ...TASK_MARKS } : {} } })} />
            <TaskStylePicker templateId="t1" style={{ icon: "walk", color: "teal" }} save={async (_id, st) => ({ ok: true, value: { icon: st.icon as never, color: st.color as never } })} />
          </div>
        </section>
      </div>
      <div data-fixture="month-done">
        <p className="t-eyebrow" style={{ margin: "0 0 8px" }}>
          You · done this month
        </p>
        <MonthDoneCard today={EX_TODAY} initial={MONTH} load={async (month) => ({ ok: true, value: month === "2026-10" ? MONTH : { month, days: {} } })} />
      </div>
    </div>
  );
}

export function TrainFixtures() {
  return (
    <div className="page narrow">
      <p className="t-meta" style={{ margin: "0 0 16px" }}>
        Fixtures only, on {FIXTURE_TODAY}. The forms answer as if saved and change nothing.
      </p>
      <ExerciseStyleFixtures />
      <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 24 }}>
        {(Object.keys(WEIGHT_FIXTURES) as WeightFixtureName[]).map((k) => (
          <div key={k}>
            <p className="t-eyebrow" style={{ margin: "0 0 8px" }}>
              {WEIGHT_FIXTURES[k].label}
            </p>
            <WeightCard view={WEIGHT_FIXTURES[k].view} today={FIXTURE_TODAY} actions={FAKE} />
          </div>
        ))}
      </div>
    </div>
  );
}
