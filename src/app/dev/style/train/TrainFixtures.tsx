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
 *
 * Exercise, every kind (health-2026-10-27.md phase 3): the card in each
 * EXERCISE_FIXTURES state (data-state="ex-<name>": the picker, empty, the
 * Again chip, a run, a run with More open, a run at a walking pace offered
 * as a walk, a swim with pool lengths, a sport, yoga, long names on the
 * chips, a ride counted as the habit, that ride on its Sure? step, a
 * refusal, the record-only line, a walk offered as a run, Lift's "arrives
 * next", walking only before the migration, and a run and a lift Health
 * Connect brought in, D21: records saying "from Health Connect"). Log answers
 * with the line the server would give for what was typed (cleanSessionInput,
 * sessionRefusalOf, and "Counts as" as counted) and saves nothing.
 *
 * Lift (health-2026-10-27.md phase 4): the card on Lift in each LIFT_FIXTURES
 * state (data-state="lift-<name>": Repeat, the ghosts, a warm-up, plate math
 * with the steppers, a drop chain, the rest timer, the Big jump question,
 * bodyweight movements with and without a weigh-in, the kind menu, Records,
 * the movement search, the user's own movement and the new-movement form,
 * Finish, the summary with a new best, a held 2x set, not ready, failed).
 * The fakes save nothing: each fixture keeps its lift in memory for as long
 * as the page is open and answers as the server would (training.ts
 * cleanSetInput, bigJumpOf against the fixture history, restAfterOf,
 * liftMomentsOf at Finish), so the logger can be clicked through.
 */
import { useMemo } from "react";
import { WeightCard } from "@/components/train/WeightCard";
import {
  EXERCISE_FIXTURES,
  EXERCISE_FIXTURE_TODAY,
  FIXTURE_TODAY,
  LIFT_FIXTURES,
  LIFT_FIXTURE_HISTORY,
  MIND_DRAFT,
  MIND_FIXTURES,
  MIND_FIXTURE_TODAY,
  WEIGHT_FIXTURES,
  type ExerciseFixtureName,
  type LiftFixture,
  type LiftFixtureName,
  type MindFixture,
  type MindFixtureName,
  type WeightFixtureName,
} from "@/components/train/fixtures";
import type { WeightActions } from "@/components/train/types";
import { ExerciseCard, type ExerciseActions } from "@/components/train/ExerciseCard";
import { liftResolverOf, nowMs, type LiftActions } from "@/components/train/lift-model";
import { cleanUserMovementInput, normNameOf, userMovementKey } from "@/lib/training-library";
import {
  bigJumpLineOf,
  bigJumpOf,
  chainHeadOf,
  cleanSetInput,
  finishMinutesOf,
  jumpBaselineOf,
  liftMomentsOf,
  repsOnlyOf,
  restAfterOf,
  sessionSummaryOf,
  summaryLinesOf,
  type JumpAnswer,
  type LiftSet,
} from "@/lib/training";
import type { FinishedLift, LiftEntryView, LiftSessionView, LiftSetView, UserMovementView } from "@/lib/training-server";
import { MonthDoneCard } from "@/components/task-style/MonthDoneCard";
import { TaskMonth } from "@/components/task-style/TaskMonth";
import { TaskStylePicker } from "@/components/task-style/TaskStylePicker";
import { cleanSessionInput, exerciseWeekOf, sessionLoggedLineOf, sessionRefusalOf, type ExerciseSessionView, type SessionView } from "@/lib/exercise";
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
let exSeq = 0;
const FAKE_EX: ExerciseActions = {
  logWalk: async () => {
    await wait();
    return { ok: false, error: "Fixtures save nothing." };
  },
  deleteExercise: async () => {
    await wait();
    return { ok: true, value: null };
  },
  // The answer the server would give for what was typed, saved nowhere: "Counts as" reads as counted.
  logSession: async (input) => {
    await wait();
    const clean = cleanSessionInput(input, EXERCISE_FIXTURE_TODAY);
    if (!clean.ok) return clean;
    const session = { ...clean.value, id: `fixture-ex-${++exSeq}` };
    const refusal = sessionRefusalOf(session);
    const link = input.countsAs ? (refusal ? { kind: "NOT_COUNTED" as const, error: "this session can't count" } : { kind: "COUNTED" as const, title: "Cardio 30 min" }) : null;
    return { ok: true, value: { ...session, refusal, link, replay: false } };
  },
  deleteSession: async () => {
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
      <p className="t-meta" style={{ margin: 0 }}>
        Every kind, on {EXERCISE_FIXTURE_TODAY}. Log answers with the server&apos;s line for what was typed and saves nothing.
      </p>
      {(Object.keys(EXERCISE_FIXTURES) as ExerciseFixtureName[]).map((k) => {
        const f = EXERCISE_FIXTURES[k];
        return (
          <div key={k} data-state={`ex-${k}`}>
            <p className="t-eyebrow" style={{ margin: "0 0 8px" }}>
              {f.label}
            </p>
            <ExerciseCard view={f.view} actions={FAKE_EX} initial={f.initial} />
          </div>
        );
      })}
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

/** The fakes for one lift fixture: its lift kept in memory while the page is open, answered as the server would. */
function liftFakesOf(f: LiftFixture): LiftActions {
  const view = f.lift;
  const unit = view.unit;
  let seq = 0;
  const next = (p: string) => `fx-${p}-${++seq}`;
  const own: UserMovementView[] = [...view.movements];
  const resolve = (key: string) => liftResolverOf(own)(key);
  let lift: LiftSessionView | null = view.open ? { ...view.open, entries: view.open.entries.map((e) => ({ ...e, sets: [...e.sets] })) } : null;
  let ended: LiftSessionView | null = f.ended ?? null;
  // The fixtures' own clock: three minutes a set on from the fixture lift's last instant (its day is not today's).
  let clock = Math.max(...[view.open?.startedAt, ...(view.open?.entries.flatMap((e) => e.sets.map((s) => s.doneAt)) ?? [])].map((x) => (x ? Date.parse(x) : 0)));
  const tick = () => (clock = Math.max(nowMs(), clock + 3 * 60_000));
  const entryOf = (id: string) => lift?.entries.find((e) => e.id === id) ?? null;
  const setOf = (id: string) => lift?.entries.flatMap((e) => e.sets).find((s) => s.id === id) ?? null;
  const jumpOf = (s: LiftSet, e: LiftEntryView) => {
    const m = resolve(e.movementKey);
    const jump = m ? bigJumpOf(s, m, e.bodyKg, jumpBaselineOf(LIFT_FIXTURE_HISTORY, e.movementKey, view.today, resolve)) : null;
    return { jump, jumpLine: jump && m ? bigJumpLineOf(jump, m.load, unit) : null };
  };
  const finishedOf = (s: LiftSessionView, answers: Record<string, JumpAnswer>, replay: boolean): FinishedLift => {
    const answered = { ...s, entries: s.entries.map((e) => ({ ...e, sets: e.sets.map((x) => (answers[x.id] ? { ...x, jumpAnswer: answers[x.id] } : x)) })) };
    const lm = liftMomentsOf([...LIFT_FIXTURE_HISTORY, answered], unit, resolve);
    const moments = lm.moments.get(s.id) ?? [];
    const held = lm.held.get(s.id) ?? [];
    const session: SessionView = {
      id: s.id,
      kind: "LIFT",
      day: s.day,
      angleDeg: 0,
      distanceKm: 0,
      durationMin: s.durationMin,
      note: null,
      variant: null,
      label: s.label,
      poolM: null,
      avgWatts: null,
      avgHr: null,
      maxHr: null,
      sessionRpe: null,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      clientId: null,
    };
    const refusal = sessionRefusalOf(session);
    const link = refusal ? null : { kind: "COUNTED" as const, title: "Gym session" };
    const summary = sessionSummaryOf(s, resolve);
    return { session, by: null, refusal, link, replay, unit, summary, moments, held, records: [], line: sessionLoggedLineOf(session, refusal, link), lines: summaryLinesOf(summary, unit, moments, held) };
  };
  return {
    startLift: async (input) => {
      await wait();
      const from = input.repeat ? (view.recent.find((r) => r.id === input.repeat) ?? null) : null;
      const id = next("lift");
      const entries = (from?.movements ?? []).map((x, i): LiftEntryView => {
        const m = resolve(x.movementKey);
        return { id: `${id}-e${i + 1}`, movementKey: x.movementKey, ord: i + 1, groupNo: null, bodyKg: m?.load === "BW" ? (view.body?.kg ?? null) : null, note: null, sets: [] };
      });
      lift = { id, day: view.today, label: from?.label ?? null, startedAt: new Date(tick()).toISOString(), endedAt: null, durationMin: 0, backfill: false, entries };
      return { ok: true, value: { session: lift, replay: false, already: false, closed: [] } };
    },
    addLiftEntry: async (input) => {
      await wait();
      const m = resolve(input.movementKey);
      if (!lift || !m) return { ok: false, error: "Pick a movement from the list." };
      const bodyKg = m.load === "BW" ? (view.body?.kg ?? null) : null;
      const entry: LiftEntryView = { id: next("e"), movementKey: input.movementKey, ord: lift.entries.length + 1, groupNo: null, bodyKg, note: null, sets: [] };
      lift.entries.push(entry);
      return { ok: true, value: { entry, replay: false, repsOnly: repsOnlyOf(m, bodyKg) } };
    },
    removeLiftEntry: async (entryId) => {
      await wait();
      if (lift) lift.entries = lift.entries.filter((e) => e.id !== entryId);
      return { ok: true, value: { deleted: true, sets: 0 } };
    },
    logLiftSet: async (input) => {
      await wait();
      const e = entryOf(input.entryId);
      const m = e ? resolve(e.movementKey) : null;
      if (!e || !m) return { ok: false, error: "That movement is no longer in this lift." };
      const links = e.sets.map((x) => ({ ord: x.ord, kind: x.kind, chainOf: x.chainOf }));
      const kind = input.kind ?? "WORKING";
      const prev = links[links.length - 1];
      const chainOf = (kind === "DROP" || kind === "MINI") && prev ? chainHeadOf(prev) : null;
      const clean = cleanSetInput({ ...input, ord: links.reduce((n, x) => Math.max(n, x.ord), 0) + 1, kind, chainOf }, { movement: m, unit, others: links, bodyKg: e.bodyKg });
      if (!clean.ok) return clean;
      const set: LiftSetView = { id: next("s"), entryId: e.id, ...clean.value, clientId: input.clientId, doneAt: new Date(tick()).toISOString(), afterFinish: false };
      e.sets.push(set);
      return { ok: true, value: { set, replay: false, ...jumpOf(set, e), restSec: restAfterOf(set.kind, null, m) } };
    },
    confirmLiftSet: async (input) => {
      await wait();
      return { ok: true, value: { setId: input.setId, jump: null, jumpLine: null, answer: input.answer, counts: true } };
    },
    editLiftSet: async (input) => {
      await wait();
      const s = setOf(input.setId);
      const e = s ? entryOf(s.entryId) : null;
      const m = e ? resolve(e.movementKey) : null;
      if (!s || !e || !m) return { ok: false, error: "That set is no longer here." };
      const others = e.sets.filter((x) => x.id !== s.id).map((x) => ({ ord: x.ord, kind: x.kind, chainOf: x.chainOf }));
      const clean = cleanSetInput({ ...s, ...input }, { movement: m, unit, others, bodyKg: e.bodyKg });
      if (!clean.ok) return clean;
      const set: LiftSetView = { ...s, ...clean.value, restSec: s.restSec };
      e.sets = e.sets.map((x) => (x.id === s.id ? set : x));
      return { ok: true, value: { set, ...jumpOf(set, e) } };
    },
    deleteLiftSet: async (setId) => {
      await wait();
      for (const e of lift?.entries ?? []) e.sets = e.sets.filter((x) => x.id !== setId);
      return { ok: true, value: { deleted: true } };
    },
    finishLift: async (input) => {
      await wait();
      const answers = input.answers ?? {};
      if (ended && ended.id === input.sessionId) return { ok: true, value: finishedOf(ended, answers, true) };
      if (!lift || lift.id !== input.sessionId) return { ok: false, error: "That lift is no longer here." };
      const sets = lift.entries.flatMap((e) => e.sets);
      if (sets.length === 0) return { ok: false, error: "No sets yet. Log a set, or discard this lift." };
      const end = tick();
      const lastSetAt = sets.reduce((n, x) => Math.max(n, Date.parse(x.doneAt)), 0);
      const { minutes } = finishMinutesOf({ startedAt: lift.startedAt, endedAt: end, lastSetAt, reportedMin: input.reportedMin ?? null });
      ended = { ...lift, label: input.label !== undefined ? input.label : lift.label, endedAt: new Date(end).toISOString(), durationMin: minutes };
      lift = null;
      return { ok: true, value: finishedOf(ended, answers, false) };
    },
    discardLift: async () => {
      await wait();
      lift = null;
      return { ok: true, value: { discarded: true } };
    },
    createMovement: async (input) => {
      await wait();
      const clean = cleanUserMovementInput(input, new Set(own.filter((m) => !m.archived).map((m) => normNameOf(m.name))));
      if (!clean.ok) return clean;
      const id = next("m");
      const v = clean.value;
      const made: UserMovementView = {
        id,
        key: userMovementKey(id),
        name: v.name,
        pattern: v.pattern,
        equipment: v.equipment,
        primaryMuscles: v.primaryMuscles,
        secondaryMuscles: v.secondaryMuscles,
        load: v.load,
        bodyFraction: v.bodyFraction,
        unilateral: v.unilateral,
        stepKg: v.stepKg,
        restSec: v.restSec,
        archived: false,
      };
      own.push(made);
      return { ok: true, value: made };
    },
  };
}

/** The card on Lift in each LIFT_FIXTURES state, each with its own fakes. */
export function LiftStyleFixtures() {
  const fakes = useMemo(() => Object.fromEntries((Object.keys(LIFT_FIXTURES) as LiftFixtureName[]).map((k) => [k, liftFakesOf(LIFT_FIXTURES[k])])) as Record<LiftFixtureName, LiftActions>, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <p className="t-meta" style={{ margin: 0 }}>
        Lift, on {LIFT_FIXTURES.start.lift.today}. The fakes keep each lift in memory while this page is open and save nothing.
      </p>
      {(Object.keys(LIFT_FIXTURES) as LiftFixtureName[]).map((k) => {
        const f = LIFT_FIXTURES[k];
        return (
          <div key={k} data-state={`lift-${k}`}>
            <p className="t-eyebrow" style={{ margin: "0 0 8px" }}>
              {f.label}
            </p>
            <ExerciseCard view={f.view} actions={FAKE_EX} initial={f.initial} lift={f.lift} liftActions={fakes[k]} />
          </div>
        );
      })}
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
      <div style={{ height: 24 }} />
      <LiftStyleFixtures />
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
