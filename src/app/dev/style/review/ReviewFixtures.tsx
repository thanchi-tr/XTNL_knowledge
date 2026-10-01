"use client";

/**
 * The client half of /dev/style/review: renders the real review components
 * (ReviewRunner, ResultPanel, SessionComplete, the hub) from fixtures. The
 * runner is interactive: answer, Next and the keys all work, against canned
 * results instead of the server.
 */
import { useState, type ReactNode } from "react";
import type { BoonKind } from "@/lib/boon-meta";
import { TabLinks } from "@/components/ui/Tabs";
import { BossPanel } from "@/components/workspace/BossPanel";
import { BossResult } from "@/components/workspace/BossResult";
import { EffectsCard, RecentIdeas } from "@/components/workspace/ReviewHub";
import { ReviewRunner, type RunPhase } from "@/components/workspace/ReviewRunner";
import { SessionComplete } from "@/components/workspace/SessionComplete";
import { ALL_FIELDS, SessionSummary } from "@/components/workspace/SessionSummary";
import { questNow, tallyOf, type CardResult } from "@/components/workspace/review-model";
import type { ReviewFixtureData } from "./fixtures";
import { FIXTURE_LABEL, FIXTURE_STATES, type FixtureState } from "./states";
import "@/components/workspace/review.css";

const TODAY = "2026-10-01";

function Nav({ state }: { state: FixtureState }) {
  return (
    <div className="page" style={{ paddingBottom: 0 }}>
      <p className="t-eyebrow">Dev · review fixtures</p>
      <p className="t-meta" style={{ margin: "4px 0 8px" }}>
        Made-up rows, real formulas. No real page shows these numbers.
      </p>
      <TabLinks
        items={FIXTURE_STATES.map((s) => ({ href: `/dev/style/review?state=${s}`, label: FIXTURE_LABEL[s] }))}
        current={`/dev/style/review?state=${state}`}
        label="Review fixture states"
      />
    </div>
  );
}

function start(state: FixtureState): { index: number; answered: number; phase: "ask" | "answered" } {
  switch (state) {
    case "question":
      return { index: 3, answered: 3, phase: "ask" };
    case "correct":
      return { index: 3, answered: 4, phase: "answered" };
    case "seal":
      return { index: 4, answered: 5, phase: "answered" };
    case "miss":
      return { index: 5, answered: 6, phase: "answered" };
    case "boss":
      return { index: 3, answered: 3, phase: "ask" };
    default:
      return { index: 0, answered: 0, phase: "ask" };
  }
}

export function ReviewFixtures({ state, data, loadoutStrip }: { state: FixtureState; data: ReviewFixtureData; loadoutStrip: ReactNode }) {
  const s = start(state);
  const all = data.results;
  const [index, setIndex] = useState(s.index);
  const [results, setResults] = useState<CardResult[]>(all.slice(0, s.answered));
  const [phase, setPhase] = useState<RunPhase>(() => {
    if (s.phase !== "answered") return { kind: "ask" };
    const r = all[s.answered - 1];
    return { kind: "answered", result: r.result, answer: r.answer, picked: r.card.questionType === "MULTI" ? r.answer : null };
  });
  const [ended, setEnded] = useState(false);
  const [selected, setSelected] = useState(ALL_FIELDS);
  const choose = async (k: BoonKind) => (k ? null : "No such boon.");

  if (state === "hub" || state === "empty") {
    const empty = state === "empty";
    return (
      <>
        <Nav state={state} />
        <div className="page cq-main">
          <div className="rv-hub">
            <div className="rv-col">
              <SessionSummary
                quest={empty ? { done: 17, target: 15 } : data.questStart}
                dueCount={empty ? 0 : selected === ALL_FIELDS ? 17 : selected === "Statistics" ? 8 : 5}
                totalDue={empty ? 0 : 17}
                fields={[
                  { id: "fx-stat", name: "Statistics", due: 8 },
                  { id: "fx-econ", name: "Economics", due: 5 },
                  { id: "fx-linalg", name: "Linear Algebra", due: 4 },
                ]}
                selected={selected}
                onSelect={setSelected}
                onStart={() => undefined}
                scheduledCount={412}
                upcoming={{ label: "tomorrow", count: 9 }}
              />
              {loadoutStrip}
              <EffectsCard effects={data.effects} />
            </div>
            <div className="rv-col">
              <BossPanel bosses={data.bosses} onChallenge={() => undefined} onChooseBoon={() => undefined} pendingFieldId={null} error={null} />
              <RecentIdeas ideas={data.recent} />
            </div>
          </div>
        </div>
      </>
    );
  }

  if (state === "recap" || state === "boss-won" || ended) {
    const shown = state === "boss-won" ? all.slice(0, 3) : ended ? results : all;
    return (
      <>
        <Nav state={state} />
        <SessionComplete
          results={shown}
          merged={state === "boss-won" ? [] : [data.seal]}
          questBefore={questNow(data.questStart, [])}
          questAfter={questNow(data.questStart, shown)}
          startedAt={Date.parse("2026-10-01T08:34:00+10:00")}
          endedAt={Date.parse("2026-10-01T08:41:00+10:00")}
          dayKept={{ streak: 24 }}
          remainingDue={2}
          upcoming={{ label: "tomorrow", count: 9 }}
          fieldsCleared={[]}
          today={TODAY}
          boss={state === "boss-won" ? <BossResult resolution={data.bossVictory} fieldId={data.boss.fieldId} onChoose={choose} /> : undefined}
          onBackToReview={() => window.location.assign("/dev/style/review?state=hub")}
        />
      </>
    );
  }

  const boss = state === "boss" ? data.boss : null;
  const combo = results.reduce((c, r) => (r.result.correct ? c + 1 : 0), 0);
  return (
    <>
      <Nav state={state} />
      <ReviewRunner
        queue={data.cards}
        index={index}
        results={results}
        phase={phase}
        today={TODAY}
        combo={phase.kind === "answered" ? phase.result.combo.before : combo}
        comboCap={10}
        tally={tallyOf(results).pts}
        quest={questNow(data.questStart, results)}
        boss={boss}
        autoAdvance={false}
        dayStreakIfKept={24}
        onAnswer={(_, display) => {
          const r = all[index];
          // Scripted: a pass card picked wrongly borrows the scripted miss, with this card's own answer.
          const result =
            display === r.result.expected || !r.result.correct
              ? r.result
              : { ...all[5].result, expected: r.result.expected, explanation: null, combo: { ...all[5].result.combo, before: combo } };
          setResults((prev) => [...prev, { card: r.card, result, answer: display }]);
          setPhase({ kind: "answered", result, answer: display, picked: r.card.questionType === "MULTI" ? display : null });
        }}
        onNext={() => {
          if (index + 1 >= data.cards.length) setEnded(true);
          else {
            setIndex(index + 1);
            setPhase({ kind: "ask" });
          }
        }}
        onRetry={() => setPhase({ kind: "ask" })}
        onRequestExit={() => window.location.assign("/dev/style/review?state=hub")}
      />
    </>
  );
}
