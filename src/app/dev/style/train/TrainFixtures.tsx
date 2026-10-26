"use client";

/**
 * Fixture views for the Body weight card. The actions are fakes: they wait
 * a moment and answer ok, so the forms show their pending and saved states,
 * but nothing is written and the views never change.
 *
 * Mind (health-2026-10-27.md phase 1): Body › Mind's card in each fixture
 * state (MIND_FIXTURES: off, off with check-ins kept from before, not ready,
 * the read failed, empty, only older ones, calibrating, logged with Undo,
 * changed, the low-pattern card, paused) and Today's "Check in" strip, plain
 * and just logged. The check-in fakes save nothing: Save answers with a
 * receipt built from what was picked, "Show older" pages through the
 * fixture's own older rows, the rest answer ok, and the views never change.
 * `state` (the page's ?state=) opens the sheet on load: mind-sheet (blank) or
 * mind-sheet-picked (MIND_DRAFT).
 */
import { WeightCard } from "@/components/train/WeightCard";
import { FIXTURE_TODAY, MIND_DRAFT, MIND_FIXTURES, MIND_FIXTURE_TODAY, WEIGHT_FIXTURES, type MindFixture, type MindFixtureName, type WeightFixtureName } from "@/components/train/fixtures";
import type { WeightActions } from "@/components/train/types";
import { ExerciseCard, type ExerciseActions } from "@/components/train/ExerciseCard";
import { MonthDoneCard } from "@/components/task-style/MonthDoneCard";
import { TaskMonth } from "@/components/task-style/TaskMonth";
import { TaskStylePicker } from "@/components/task-style/TaskStylePicker";
import { exerciseWeekOf, type ExerciseSessionView } from "@/lib/exercise";
import type { MonthDoneTask } from "@/lib/task-style";
import { MindCard, MindOff } from "@/components/mind/MindCard";
import { CheckInStrip } from "@/components/mind/CheckInStrip";
import type { MindActions } from "@/components/mind/types";
import { zonedToInstant } from "@/lib/life-day";
import { OLDER_PAGE, pauseUntilOf, receiptLineOf, type MoodCheckView, type OlderCursor } from "@/lib/mind";

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

/** The fixture receipt's instant: 14:32 on the Mind fixture day, so a screenshot reads the same every run. */
const MIND_AT = (() => {
  const [y, m, d] = MIND_FIXTURE_TODAY.split("-").map(Number);
  return new Date(zonedToInstant(y, m, d, 14).getTime() + 32 * 60_000).toISOString();
})();
let mindSeq = 0;
const FAKE_MIND: MindActions = {
  logCheck: async (input) => {
    await wait();
    const row = {
      id: `fixture-${++mindSeq}`,
      day: MIND_FIXTURE_TODAY,
      at: MIND_AT,
      valence: input.valence,
      energy: input.energy,
      stress: input.stress ?? null,
      word: input.word ?? null,
      tags: input.tags ?? [],
      trigger: input.trigger ?? "self",
      via: input.via ?? "web",
    };
    return { ok: true, value: { ...row, line: receiptLineOf(row), replay: false } };
  },
  deleteCheck: async () => {
    await wait();
    return { ok: true, value: { deleted: 1 } };
  },
  deleteAllChecks: async () => {
    await wait();
    return { ok: true, value: { deleted: 0 } };
  },
  pauseChecks: async (length) => {
    await wait();
    return { ok: true, value: { pausedUntil: length === null ? null : pauseUntilOf(length, MIND_FIXTURE_TODAY) } };
  },
  dismissLowPattern: async () => {
    await wait();
    return { ok: true, value: { lowSeenAt: MIND_AT } };
  },
  loadOlderChecks: async () => {
    await wait();
    return { ok: true, value: { checks: [], more: false } };
  },
};

/** "Show older" over a fixture's own rows (newest first), OLDER_PAGE at a time, strictly after the cursor. */
function olderPager(rows: readonly MoodCheckView[]): MindActions["loadOlderChecks"] {
  return async (before: OlderCursor | null) => {
    await wait();
    const from = before ? rows.findIndex((c) => c.id === before.id) + 1 : 0;
    const page = rows.slice(from, from + OLDER_PAGE);
    return { ok: true, value: { checks: page, more: from + OLDER_PAGE < rows.length } };
  };
}

/** The fakes for one fixture: its older rows behind "Show older", and Delete all answering its own count. */
function mindActionsOf(f: MindFixture): MindActions {
  const stored = f.stored ?? f.view.storedCount;
  return {
    ...FAKE_MIND,
    ...(f.older ? { loadOlderChecks: olderPager(f.older) } : {}),
    deleteAllChecks: async () => {
      await wait();
      return { ok: true, value: { deleted: stored } };
    },
  };
}

/** Body › Mind's states and Today's strip. `state` opens the sheet on load (mind-sheet, mind-sheet-picked). */
export function MindFixtures({ state = null }: { state?: string | null }) {
  const sheet = state === "mind-sheet" || state === "mind-sheet-picked";
  const logged = MIND_FIXTURES.logged.receipt ?? null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <p className="t-meta" style={{ margin: 0 }}>
        Mind fixtures, on {MIND_FIXTURE_TODAY}. Check in opens the real sheet; Save answers with a receipt and saves nothing.
      </p>
      <div data-state="mind-sheet">
        <p className="t-eyebrow" style={{ margin: "0 0 8px" }}>
          Mind · the sheet{sheet ? " (open)" : ""}
        </p>
        <MindCard
          key={state ?? "none"}
          view={MIND_FIXTURES.empty.view}
          actions={FAKE_MIND}
          sheetOpen={sheet}
          draft={state === "mind-sheet-picked" ? MIND_DRAFT : undefined}
        />
      </div>
      {(Object.keys(MIND_FIXTURES) as MindFixtureName[]).map((k) => {
        const f = MIND_FIXTURES[k];
        return (
          <div key={k} data-state={`mind-${k}`}>
            <p className="t-eyebrow" style={{ margin: "0 0 8px" }}>
              {f.label}
            </p>
            {f.view.live ? (
              <MindCard view={f.view} actions={mindActionsOf(f)} receipt={f.receipt ?? null} holdUndo={f.receipt != null} />
            ) : (
              <MindOff stored={f.stored ?? 0} deleteAllChecks={mindActionsOf(f).deleteAllChecks} />
            )}
          </div>
        );
      })}
      <div data-state="mind-today-strip">
        <p className="t-eyebrow" style={{ margin: "0 0 8px" }}>
          Today · the Check in strip
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 420 }}>
          <CheckInStrip actions={FAKE_MIND} />
          <CheckInStrip actions={FAKE_MIND} logged={logged} holdUndo />
        </div>
      </div>
    </div>
  );
}

export function TrainFixtures({ state = null }: { state?: string | null }) {
  return (
    <div className="page narrow">
      <p className="t-meta" style={{ margin: "0 0 16px" }}>
        Fixtures only, on {FIXTURE_TODAY}. The forms answer as if saved and change nothing.
      </p>
      <MindFixtures state={state} />
      <div style={{ height: 24 }} />
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
