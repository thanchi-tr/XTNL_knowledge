"use client";

import "@/components/today/today.css";
import { useMemo, useRef, useState } from "react";
import { chime, mark } from "@/lib/celebrate";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/Tabs";
import { AskCard } from "@/components/today/AskCard";
import { DayLedger } from "@/components/today/DayLedger";
import { NextUp } from "@/components/today/NextUp";
import { GoalsStrip } from "@/components/today/GoalsStrip";
import { CloseDaySheet } from "@/components/today/CloseDaySheet";
import { nextUpOf } from "@/components/today/board-ui";
import { MakeUpCard, OwedRow, OwedSummary, type MakeUp, type MakeUpState } from "@/components/today/m2/MakeUpCard";
import { RepairAsk, WelcomeBack, YesterdaySettled } from "@/components/today/m2/Notices";
import { RecordYesterdaySheet, RestControls, type DidAnswer } from "@/components/today/m2/Sheets";
import { WeekCard, WeekRunner, WeekTrack } from "@/components/today/m2/WeekRunner";
import { WeekQuests } from "@/components/roadmap/WeekQuests";
import { weekQuestsViewOf } from "@/lib/roadmap-quests";
import type { WeekQuestsView } from "@/lib/roadmap-types";
import { DAY_AWAY, DAY_FULL, DAY_KEPT, DAY_MORNING, QUEST_FIXTURES, fixtureBoard, fixtureRoadmapBoard, type QuestFixture } from "./fixtures";

/**
 * A week quests fixture as the card renders it: roadmap-quests'
 * weekQuestsViewOf over made-up inputs (it brands each figure). null until
 * lane R6 lands that builder; the page then says so instead of drawing.
 */
function questViewOf(f: QuestFixture): WeekQuestsView | null {
  try {
    return weekQuestsViewOf(f.input);
  } catch {
    return null;
  }
}

/**
 * /dev/style/today — L1's fixtures: every Today state and the M2-ready
 * pieces (make-up cards, owed summary, the settle and plan-time-off sheets,
 * the return and settled notices, the repair ask, the weekly runner and
 * its week card), so the M2 lanes only wire data. Every number on this
 * page is a labelled fixture.
 *
 * Roadmap (lane T, roadmap.md F23): ROADMAP goal cards (measured, stated 0
 * for knowledge only or a lineage already paid, reset-archived, replaced by
 * Start again) and the week quests card's six states (open, partial, all
 * done, compact, writes off, practice-only), the first beside the Day
 * ledger's Quest ring. Pure fixtures only; never the user's roadmap.
 */

const STRETCH: MakeUp = {
  id: "stretch-tue",
  owed: 3.8,
  when: "Stretch · Tuesday",
  text: "Tuesday's stretch is still open. Ten minutes makes it right.",
  window: "Make it up before Fri 04:00 and its 12-day streak comes back.",
  makeUpPrice: 3.2,
  minimum: { label: "2 min", price: 1.1 },
  resolved: {
    repaid: "Repaid 3.8 in full and paid 3.2 at the late rate (×0.85). The stretch streak is back at 12 days.",
    minimum: "Repaid 3.8 in full and paid 1.1 (×0.3). The streak is held at 12 days, not advanced.",
  },
};

const OWED_STACK: MakeUp[] = [
  { ...STRETCH, id: "meds", owed: 3.2, when: "Morning meds · Tuesday", text: "Tuesday's meds are owed.", makeUpPrice: 2.7 },
  { ...STRETCH, id: "stretch", owed: 3.8, when: "Stretch · Tuesday" },
  { ...STRETCH, id: "timesheet", owed: 8.1, when: "Timesheet · Tuesday", text: "Tuesday's timesheet is owed.", makeUpPrice: 6.9, minimum: null },
];

export function TodayFixtures() {
  const board = useMemo(() => fixtureBoard(), []);
  const roadmapBoard = useMemo(() => fixtureRoadmapBoard(), []);
  const questStates = useMemo(() => QUEST_FIXTURES.map((f) => ({ ...f, view: questViewOf(f) })), []);
  const [muState, setMuState] = useState<MakeUpState>("open");
  const [ySheet, setYSheet] = useState(false);
  const [answers, setAnswers] = useState<Record<string, DidAnswer>>({});
  const [freeze, setFreeze] = useState(false);
  const [closeSheet, setCloseSheet] = useState(false);
  const [closeChosen, setCloseChosen] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [rest, setRest] = useState(false);
  const [restSheet, setRestSheet] = useState(false);
  const [step, setStep] = useState(1);
  const makeupRef = useRef<HTMLDivElement | null>(null);

  const questNext = nextUpOf({ quest: { reviews: 3, target: 17, dueNow: 14, met: false, cap: 15 }, must: board.must });
  const mustNext = nextUpOf({ quest: { reviews: 15, target: 17, dueNow: 2, met: true, cap: 15 }, must: board.must });
  const clearNext = nextUpOf({ quest: { reviews: 15, target: 17, dueNow: 2, met: true, cap: 15 }, must: [] });
  const planned = { minutes: 185, capacity: 240, chosen: true, over: 0 };

  const resolve = (next: MakeUpState, paid: number, from: Element | null) => {
    setMuState(next);
    void mark({ kind: "makeup-paid", id: `fixture:makeup:${next}`, text: `Fixture: stretch made up, +${paid} life XP`, amount: { kind: "xp", value: paid }, from, to: null }).then(() => {
      if (next === "repaid") chime({ kind: "nothing-owed", id: "fixture:nothing-owed", text: "Nothing owed", sweepEl: makeupRef.current, say: "Fixture: Tuesday made up. Nothing is owed." });
    });
  };

  return (
    <div className="page today-board cq-main dev-today">
      <p className="t-meta dev-banner">Fixtures only. Every number on this page is made up; no real page shows these values.</p>

      <SectionHeader title="Day ledger" aside="morning · kept · full · broken (M2: freezes, settles)" />
      <div className="dev-grid">
        <DayLedger
          streak={{ count: 23, kept: false }}
          caption="Not kept yet. Any tick or review keeps it."
          freezes={null}
          fullDay={DAY_MORNING}
          settles={false}
          xp={0}
          pts={0}
          planned={planned}
          publish={false}
        />
        <DayLedger
          streak={{ count: 24, kept: true }}
          caption={
            <>
              <b>Kept today.</b> Safe until 04:00.
            </>
          }
          freezes={{ banked: 2 }}
          fullDay={DAY_KEPT}
          settles
          xp={12.3}
          pts={9.6}
          planned={{ ...planned, over: 25, minutes: 265 }}
          publish={false}
        />
        <DayLedger
          streak={{ count: 24, kept: true }}
          caption={
            <>
              <b>Kept today.</b> Safe until 04:00.
            </>
          }
          freezes={{ banked: 2 }}
          fullDay={DAY_FULL}
          settles
          xp={31.4}
          pts={29.6}
          planned={planned}
          publish={false}
        />
        <DayLedger
          streak={{ count: 0, kept: false, broken: true }}
          caption="Ended Tuesday at 23 days. Best 41. Any tick starts a new one."
          freezes={{ banked: 0, used: 2 }}
          fullDay={DAY_AWAY}
          settles
          fullNote="A Full day today is worth +0.5 MP. Tuesday cannot be repaired from today."
          xp={0}
          pts={0}
          planned={planned}
          publish={false}
        />
      </div>

      <SectionHeader title="Next up" aside="quest · oldest must · nothing asking" />
      <div className="dev-grid">
        <NextUp next={questNext} focus="Statistics pays +32% today" bosses={["Linear Algebra"]} quota={null} reviewHref="#" />
        <NextUp next={mustNext} focus={null} bosses={[]} quota={null} mustPrice={mustNext.kind === "must" ? mustNext.row.projection.xp : undefined} onKeepMust={() => undefined} />
        <NextUp next={clearNext} focus={null} bosses={[]} quota={null} reviewHref="#" />
      </div>

      <SectionHeader title="Asks and notices" aside="M2: welcome back · yesterday settled · repair" />
      <div className="dev-grid">
        <AskCard title="Yesterday: 2 to record" detail="Tick what you did at the full rate, record by 04:00 tomorrow." action="Record" onAction={() => setYSheet(true)} />
        <RepairAsk
          title="Tuesday can still be repaired"
          detail="Wednesday was 2 of 3 of a Full day. If you did its last must, record it and your streak returns as 25."
          onRecord={() => setYSheet(true)}
        />
        <WelcomeBack
          title="You were away 4 days, Sunday to Wednesday."
          lines={[
            { glyph: { held: "freeze" }, tone: "held", text: <>Two freezes held <b>Sunday and Monday</b>. None left; the next one comes after 7 active days.</> },
            { glyph: { icon: "flame" }, text: <><b>Tuesday ended your 23-day streak.</b> Your best stays 41. Today starts a new one.</> },
            { glyph: { sigil: "duty" }, tone: "owed", text: <>3 musts from Tuesday are owed, <b>−15.1 life XP</b>. Making one up before Fri 04:00 also restores its own streak.</> },
            { glyph: { icon: "clock" }, text: "Wednesday isn't judged yet. You can record it until Fri 04:00." },
            { glyph: { currency: "pts" }, text: <>142 reviews are due. Today&apos;s quest is still <b>15</b>; the rest can wait and nothing is lost.</> },
          ]}
          actions={[
            { label: "Record Wednesday", variant: "primary", onClick: () => setYSheet(true) },
            { label: "See what's owed", onClick: () => makeupRef.current?.scrollIntoView({ block: "center" }) },
            { label: "Plan time off", variant: "quiet", onClick: () => setRestSheet(true) },
          ]}
        />
        <YesterdaySettled
          title="Wednesday was a Full day."
          chips={[
            { tone: "kept", icon: "check", text: "Day kept · streak 23" },
            { tone: "kept", text: "Full day · +0.5 MP" },
            { tone: "held", held: "freeze", text: "Freeze earned · 2 banked" },
          ]}
          note="Judged at 04:00 today, after the full day you had to record it. Nothing else changed."
          onOk={() => undefined}
        />
      </div>

      <SectionHeader title="Owed (M2)" aside="make-up card · collapsed stack · owed row" />
      <div className="dev-grid">
        <div className="card lane-body" ref={makeupRef}>
          <MakeUpCard item={STRETCH} state={muState} onMakeUp={(from) => resolve("repaid", 3.2, from)} onMinimum={(from) => resolve("minimum", 1.1, from)} />
          {muState !== "open" && (
            <div className="makeup">
              <Button variant="quiet" onClick={() => setMuState("open")}>
                Reset fixture
              </Button>
            </div>
          )}
        </div>
        <div className="card lane-body">
          <OwedSummary total={15.1} count={3} when="3 musts · Tuesday" text="Tuesday's three musts are owed. Each can be made up until Fri 04:00." sub="Making one up repays it in full, pays at ×0.85 and restores that duty's streak. Leaving them is allowed; the amount never grows.">
            {OWED_STACK.map((m) => (
              <MakeUpCard key={m.id} item={m} onMakeUp={() => undefined} onMinimum={m.minimum ? () => undefined : undefined} />
            ))}
          </OwedSummary>
        </div>
        <OwedRow count={1} total={3.8} onOpen={() => makeupRef.current?.scrollIntoView({ block: "center" })} />
      </div>

      <SectionHeader title="Goals (M5 payout)" aside="launched: the stated MP, Close, and a goal carried past its due day" />
      <div className="dev-grid">
        <GoalsStrip goals={board.goals} busy={false} onProgress={() => undefined} launched onClose={() => undefined} onReschedule={() => undefined} />
      </div>

      <SectionHeader
        title="Roadmap goals"
        aside="measured from stored readings · stated 0 (knowledge only; already paid) · measures removed by a reset · replaced by Start again (one open milestone in real use)"
      />
      <div className="dev-grid">
        <GoalsStrip goals={roadmapBoard.goals} busy={false} onProgress={() => undefined} launched onClose={() => undefined} onReschedule={() => undefined} />
      </div>

      <SectionHeader title="Week quests" aside="open · partial · all done · compact · writes off · practice-only (the card under the goals)" />
      {questStates.some((q) => !q.view) && (
        <p className="t-meta dev-banner">The week quests views are built by roadmap-quests (lane R6) and drawn by WeekQuests (lane R5); until both land, the states below are listed but not drawn.</p>
      )}
      <div className="dev-grid">
        {/* At 932 the first card sits beside the Day ledger's Quest ring, as on the board: two quests, never confused. */}
        <DayLedger
          streak={{ count: 24, kept: true }}
          caption={
            <>
              <b>Kept today.</b> Safe until 04:00.
            </>
          }
          freezes={{ banked: 2 }}
          fullDay={DAY_KEPT}
          settles
          xp={12.3}
          pts={9.6}
          planned={planned}
          publish={false}
        />
        {questStates.map((q) => (
          <div key={q.key} className="dev-quest" data-state={q.key}>
            <p className="t-eyebrow">{q.title}</p>
            {q.view ? (
              <div className="rm-quests-slot" data-compact={q.compact ? "1" : undefined}>
                <WeekQuests variant="today" view={q.view} />
              </div>
            ) : (
              <p className="t-meta">Not drawn yet.</p>
            )}
          </div>
        ))}
      </div>

      <SectionHeader title="Sheets (M2)" aside="record yesterday · close the day · plan time off" />
      <div className="dev-row">
        <Button variant="secondary" onClick={() => setYSheet(true)}>
          Record yesterday
        </Button>
        <Button variant="secondary" onClick={() => setCloseSheet(true)}>
          Close the day
        </Button>
        <Button variant="secondary" onClick={() => setRestSheet(true)}>
          Plan time off
        </Button>
      </div>

      <SectionHeader title="Weekly review (M2)" aside="the five-step runner and its week card" />
      <div className="card dev-runner">
        <WeekRunner step={step} focus={false} exitHref="" onNext={() => setStep((s) => (s > 5 ? 1 : s + 1))} onSkip={() => setStep((s) => s + 1)}>
          {step === 1 && (
            <>
              <p className="t-eyebrow">Last week · 28 Sep – 4 Oct</p>
              <h1>You showed up 6 of 7 days.</h1>
              <div className="card">
                <WeekTrack track="duty" name="Duty" detail="Compulsory kept 92% · Morning meds 31 days, Established" kept />
                <WeekTrack track="craft" name="Craft" detail="5 sessions on 4 days · 142 raw XP" kept />
                <WeekTrack track="body" name="Body" detail="152 of 150 active min · 2 strength days" kept />
                <WeekTrack track="care" name="Care" detail="2 completions on 1 day · needs 3 days" kept={false} />
              </div>
            </>
          )}
          {step > 1 && step <= 5 && (
            <>
              <p className="t-eyebrow">Step {step}</p>
              <h1>{["", "", "3 lines to sort.", "One goal has stalled 14 days.", "One thing is owed.", "Plan the shape of the week."][step]}</h1>
              <p className="t-meta">Fixture step. M2 wires the inbox, goals, owed and next-week data here.</p>
            </>
          )}
          {step > 5 && (
            <WeekCard
              eyebrow="Week 40 · settled Sunday"
              kept={3}
              total={4}
              tracks={[
                { track: "duty", name: "Duty", kept: true },
                { track: "craft", name: "Craft", kept: true },
                { track: "body", name: "Body", kept: true },
                { track: "care", name: "Care", kept: false },
              ]}
              mp={4.5}
              line="1.5 per kept track · Duty's kept-week streak is 9."
              what={[
                { label: "Duty depth cap", value: "12 → 12.2" },
                { label: "Craft depth cap", value: "9 → 9.2" },
              ]}
              sweep
            />
          )}
        </WeekRunner>
      </div>

      <RecordYesterdaySheet
        open={ySheet}
        onClose={() => setYSheet(false)}
        day="Wednesday"
        until="Fri 04:00"
        items={[
          { key: "stretch", title: "Evening stretch", meta: "Must · Body · ≈ 4.1" },
          { key: "journal", title: "Journal, 5 min", meta: "Habit · Care · ≈ 3.2" },
        ]}
        answers={answers}
        onAnswer={(k, a) => setAnswers((s) => ({ ...s, [k]: a }))}
        freezes={2}
        useFreeze={freeze}
        onUseFreeze={setFreeze}
        onSettle={() => setYSheet(false)}
      />
      <CloseDaySheet
        open={closeSheet}
        onClose={() => setCloseSheet(false)}
        items={[
          { key: "groceries", title: "Groceries", meta: "Planned · carries forward, never late", choices: [{ id: "tomorrow", label: "Tomorrow" }, { id: "anytime", label: "Anytime" }, { id: "drop", label: "Drop" }] },
          { key: "timesheet", title: "Submit timesheet", meta: "Must · due 12:00 · still open", choices: [{ id: "minimum", label: "Do the minimum · 5 min" }] },
        ]}
        chosen={closeChosen}
        onChoose={(k, c) => setCloseChosen((s) => ({ ...s, [k]: c }))}
        onRollAll={() => setCloseChosen((s) => ({ ...s, groceries: "tomorrow" }))}
        reflection={{ note, onNote: setNote, mood, onMood: setMood, restTomorrow: rest, onRestTomorrow: setRest }}
        onDone={() => setCloseSheet(false)}
      />
      <RestControls
        open={restSheet}
        onClose={() => setRestSheet(false)}
        options={[
          { kind: "rest", title: "Rest day tomorrow", meta: "Declared the day before", action: "Set", onAction: () => setRestSheet(false) },
          { kind: "sick", title: "Sick today", meta: "Same day is fine · once per 14 days", action: "Declare", onAction: () => setRestSheet(false) },
          { kind: "away", title: "Vacation", meta: "From tomorrow, up to 30 days", action: "Choose dates", disabledReason: null, onAction: () => setRestSheet(false) },
        ]}
      />
    </div>
  );
}
