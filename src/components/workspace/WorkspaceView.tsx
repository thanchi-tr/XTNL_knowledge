"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { QuestionType } from "@prisma/client";
import type { SubmitReviewResult } from "@/app/actions/review";
import { startBossEncounter, resolveBossEncounter } from "@/app/actions/bosses";
import type { BossState, BossResolution } from "@/lib/bosses";
import { useStreak } from "@/components/StreakProvider";
import { SessionCard } from "@/components/workspace/SessionCard";
import { SessionSummary } from "@/components/workspace/SessionSummary";
import { SessionComplete } from "@/components/workspace/SessionComplete";
import { BossPanel } from "@/components/workspace/BossPanel";
import { BossResult } from "@/components/workspace/BossResult";
import { fieldColor } from "@/lib/palette";

export interface WorkspaceIdea {
  id: string;
  level: number;
  questionType: QuestionType;
  question: string;
  preview: string;
  dueLabel: string;
  overdue: boolean;
}

export interface WorkspaceDomain {
  id: string;
  name: string;
  level: number;
  totalPoints: number;
  ideas: WorkspaceIdea[];
}

export interface WorkspaceField {
  id: string;
  name: string;
  level: number;
  domains: WorkspaceDomain[];
}

interface Props {
  fieldsWithDue: WorkspaceField[];
  allFieldNames: string[];
  totalDue: number;
  bosses: BossState[];
}

interface RunIdea extends WorkspaceIdea {
  domainName: string;
}

interface RunTally {
  correct: number;
  incorrect: number;
  domainLevelUps: string[];
  /** Sum of everything the server actually credited this run. */
  pointsEarned: number;
  /** Ideas that hit level 12 this run. */
  mastered: string[];
  /** Consecutive correct answers right now. */
  currentCombo: number;
  /** Longest such run seen this session. */
  bestCombo: number;
}

const EMPTY_TALLY: RunTally = {
  correct: 0,
  incorrect: 0,
  domainLevelUps: [],
  pointsEarned: 0,
  mastered: [],
  currentCombo: 0,
  bestCombo: 0,
};

const CELEBRATE_MS = 2600;

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function flattenIdeas(fields: WorkspaceField[]): RunIdea[] {
  const out: RunIdea[] = [];
  for (const field of fields) {
    for (const domain of field.domains) {
      for (const idea of domain.ideas) {
        out.push({ ...idea, domainName: domain.name });
      }
    }
  }
  return out;
}

export function WorkspaceView({ fieldsWithDue, allFieldNames, totalDue, bosses }: Props) {
  const router = useRouter();
  const { streak } = useStreak();
  const [selected, setSelected] = useState<string>("ALL");
  // Captured once on mount, deliberately not re-synced on later prop
  // updates — this is the fixed denominator for "today's progress."
  const [initialTotal] = useState(totalDue);
  const [celebrateField, setCelebrateField] = useState<string | null>(null);
  const prevCountsRef = useRef<Record<string, number> | null>(null);

  const [mode, setMode] = useState<"summary" | "running" | "complete" | "boss_result">("summary");
  const [runQueue, setRunQueue] = useState<RunIdea[]>([]);
  const [runIndex, setRunIndex] = useState(0);
  const [tally, setTally] = useState<RunTally>(EMPTY_TALLY);

  // Boss mode. `bossFieldId` being set is what makes a run an encounter:
  // the cards come from the server's weighted draw instead of the local
  // shuffle, and finishing resolves the fight rather than showing a recap.
  const [bossFieldId, setBossFieldId] = useState<string | null>(null);
  const [bossName, setBossName] = useState<string | null>(null);
  const [bossResolution, setBossResolution] = useState<BossResolution | null>(null);
  const [bossError, setBossError] = useState<string | null>(null);
  const [pendingBossField, setPendingBossField] = useState<string | null>(null);
  const [, startBossTransition] = useTransition();

  function handleChallengeBoss(fieldId: string) {
    setBossError(null);
    setPendingBossField(fieldId);
    startBossTransition(async () => {
      const res = await startBossEncounter(fieldId);
      setPendingBossField(null);
      if (!res.ok) {
        setBossError(res.error);
        return;
      }
      const boss = bosses.find((b) => b.fieldId === fieldId);
      setBossName(boss?.archetype.name ?? "The encounter");
      setBossFieldId(fieldId);
      setRunQueue(res.value.cards.map((c) => ({ ...c, dueLabel: "", overdue: false })));
      setRunIndex(0);
      setTally(EMPTY_TALLY);
      setMode("running");
    });
  }

  function finishBossEncounter(finalTally: RunTally) {
    if (!bossFieldId) return;
    startBossTransition(async () => {
      const res = await resolveBossEncounter(
        bossFieldId,
        finalTally.correct,
        finalTally.correct + finalTally.incorrect
      );
      setBossResolution(
        res.ok ? res.value : { outcome: "rejected", why: res.error }
      );
      setMode("boss_result");
    });
  }

  const countsByField = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const name of allFieldNames) counts[name] = 0;
    for (const f of fieldsWithDue) {
      counts[f.name] = f.domains.reduce((s, d) => s + d.ideas.length, 0);
    }
    return counts;
  }, [fieldsWithDue, allFieldNames]);

  // Fires a transient "cleared!" toast the moment any Field's due count
  // drops from >0 to 0 between renders — not just a static empty state
  // shown on next visit, an actual celebration of the moment it happens.
  useEffect(() => {
    const prev = prevCountsRef.current;
    prevCountsRef.current = countsByField;
    if (!prev) return;

    for (const name of allFieldNames) {
      if ((prev[name] ?? 0) > 0 && (countsByField[name] ?? 0) === 0) {
        setCelebrateField(name);
        const t = setTimeout(() => setCelebrateField(null), CELEBRATE_MS);
        return () => clearTimeout(t);
      }
    }
  }, [countsByField, allFieldNames]);

  const completed = Math.max(0, initialTotal - totalDue);
  const progressPct = initialTotal > 0 ? Math.min(100, Math.round((completed / initialTotal) * 100)) : 0;
  const allCaughtUp = initialTotal > 0 && totalDue === 0;

  const visibleFields = selected === "ALL" ? fieldsWithDue : fieldsWithDue.filter((f) => f.name === selected);
  const visibleDueCount = visibleFields.reduce((s, f) => s + f.domains.reduce((s2, d) => s2 + d.ideas.length, 0), 0);
  const visibleDomainCount = visibleFields.reduce((s, f) => s + f.domains.length, 0);

  function handleStart() {
    const queue = shuffle(flattenIdeas(visibleFields));
    if (queue.length === 0) return;
    setRunQueue(queue);
    setRunIndex(0);
    setTally(EMPTY_TALLY);
    setMode("running");
  }

  function handleCardComplete(result: SubmitReviewResult) {
    const current = runQueue[runIndex];
    const advanced = result.outcome.outcome === "advanced" ? result.outcome : null;

    // Computed synchronously rather than only inside the setState updater:
    // a boss encounter has to hand its *final* tally to the resolver on the
    // last card, and reading it back out of state here would race the
    // pending update.
    const currentCombo = result.correct ? tally.currentCombo + 1 : 0;
    const nextTally: RunTally = {
      correct: tally.correct + (result.correct ? 1 : 0),
      incorrect: tally.incorrect + (result.correct ? 0 : 1),
      domainLevelUps: advanced?.domainLeveledUp ? [...tally.domainLevelUps, current.domainName] : tally.domainLevelUps,
      pointsEarned: tally.pointsEarned + (advanced?.pointsAwarded ?? 0),
      mastered: advanced?.mastered ? [...tally.mastered, current.preview] : tally.mastered,
      currentCombo,
      bestCombo: Math.max(tally.bestCombo, currentCombo),
    };
    setTally(nextTally);

    if (runIndex + 1 >= runQueue.length) {
      if (bossFieldId) {
        finishBossEncounter(nextTally);
      } else {
        setMode("complete");
      }
    } else {
      setRunIndex((i) => i + 1);
    }
  }

  function handleReturnToSummary() {
    setMode("summary");
    setRunQueue([]);
    setRunIndex(0);
    setBossFieldId(null);
    setBossName(null);
    setBossResolution(null);
    router.refresh();
  }

  if (mode === "boss_result" && bossResolution) {
    return (
      <div className="mx-auto max-w-lg">
        <BossResult resolution={bossResolution} onDone={handleReturnToSummary} />
      </div>
    );
  }

  if (mode === "running") {
    const current = runQueue[runIndex];
    const runPct = runQueue.length > 0 ? Math.round((runIndex / runQueue.length) * 100) : 0;
    const inBossFight = bossFieldId !== null;
    // During an encounter the bar reads as the boss's remaining health, not
    // your progress — same underlying number, opposite framing, which is
    // what makes the last few cards feel like finishing something off.
    const bossHealthPct = 100 - runPct;

    return (
      <div>
        <div className="mb-6">
          <div className="mb-1.5 flex items-center justify-between font-mono text-xs tabular-nums text-ink-2">
            <span className="uppercase tracking-wide" style={inBossFight ? { color: "var(--amber)" } : undefined}>
              {inBossFight ? bossName : selected === "ALL" ? "All Fields" : selected}
              {streak >= 3 && (
                <span className="ml-2" style={{ color: "var(--green)" }}>{streak} in a row</span>
              )}
            </span>
            <span>
              {inBossFight ? `${runQueue.length - runIndex} left` : `${runIndex}/${runQueue.length}`}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-sub">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${inBossFight ? bossHealthPct : runPct}%`,
                background: inBossFight ? "var(--amber)" : "var(--green)",
                marginLeft: inBossFight ? "auto" : undefined,
              }}
            />
          </div>
        </div>

        <div className="mx-auto max-w-lg">
          {current && (
            <SessionCard
              key={current.id}
              ideaId={current.id}
              questionType={current.questionType}
              question={current.question}
              preview={current.preview}
              level={current.level}
              domainName={current.domainName}
              onComplete={handleCardComplete}
            />
          )}
          <button
            type="button"
            onClick={handleReturnToSummary}
            className="mt-6 block w-full text-center text-xs text-ink-3 transition hover:text-ink-1"
          >
            {/* Bailing mid-encounter forfeits it — no debuff, no reward, and
                the reviews already answered still counted. Said plainly so
                leaving never feels like a trap. */}
            {bossFieldId ? "Retreat — the encounter is forfeit" : "Exit session"}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "complete") {
    return (
      <div className="mx-auto max-w-lg">
        <SessionComplete
          correct={tally.correct}
          incorrect={tally.incorrect}
          domainLevelUps={tally.domainLevelUps}
          pointsEarned={tally.pointsEarned}
          mastered={tally.mastered}
          bestCombo={tally.bestCombo}
          onDone={handleReturnToSummary}
        />
      </div>
    );
  }

  return (
    <div>
      {initialTotal > 0 && (
        <div className="mb-6">
          <div className="mb-1.5 flex items-center justify-between font-mono text-xs tabular-nums text-ink-2">
            <span className="uppercase tracking-wide">Today&apos;s progress</span>
            <span>
              {completed}/{initialTotal}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-sub">
            <div
              className="h-full rounded-full bg-green transition-[width] duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      <BossPanel
        bosses={bosses}
        onChallenge={handleChallengeBoss}
        pendingFieldId={pendingBossField}
        error={bossError}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelected("ALL")}
          className={`rounded-chip border px-3 py-1.5 text-xs font-semibold transition ${
            selected === "ALL"
              ? "border-[rgba(0,204,122,0.35)] bg-[var(--green-10)] text-green"
              : "border-[var(--line)] text-ink-2 hover:text-ink-1"
          }`}
        >
          All <span className="ml-1 tabular-nums opacity-70">({totalDue})</span>
        </button>
        {allFieldNames.map((name) => {
          const accent = fieldColor(name);
          const count = countsByField[name] ?? 0;
          const active = selected === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setSelected(name)}
              className={`rounded-chip border px-3 py-1.5 text-xs font-semibold transition ${
                count === 0 && !active ? "opacity-40" : ""
              } ${active ? "" : "border-[var(--line)] text-ink-2 hover:text-ink-1"}`}
              style={
                active
                  ? { borderColor: `${accent}59`, backgroundColor: `${accent}1a`, color: accent }
                  : undefined
              }
            >
              <span className="max-w-[16ch] truncate align-bottom" title={name}>
                {name}
              </span>{" "}
              <span className="ml-1 tabular-nums opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {celebrateField && (
        <div className="card fade-up mb-6 px-4 py-3 text-center">
          <p style={{ fontSize: 13, color: "var(--green)" }}>{celebrateField} cleared</p>
        </div>
      )}

      {allCaughtUp ? (
        <div className="card fade-up px-6 py-12 text-center">
          <span className="chip chip-green">Clear</span>
          <p className="mt-3 text-[15px] font-semibold" style={{ color: "var(--ink-0)" }}>All caught up</p>
          <p className="mt-1" style={{ fontSize: 13, color: "var(--ink-2)" }}>
            Nothing due right now. Check back later.
          </p>
        </div>
      ) : visibleDueCount === 0 ? (
        <p style={{ fontSize: 13, color: "var(--ink-2)" }}>Nothing due in this field right now.</p>
      ) : (
        <div className="mx-auto max-w-lg">
          <SessionSummary
            scopeName={selected === "ALL" ? "All Fields" : selected}
            dueCount={visibleDueCount}
            domainCount={visibleDomainCount}
            onStart={handleStart}
          />
        </div>
      )}
    </div>
  );
}
