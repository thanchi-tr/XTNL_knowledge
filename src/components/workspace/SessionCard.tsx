"use client";

import { useEffect, useState, useTransition } from "react";
import type { QuestionType } from "@prisma/client";
import { submitReview, type SubmitReviewResult } from "@/app/actions/review";
import { useStreak } from "@/components/StreakProvider";
import { FormatAnswer } from "./FormatAnswer";
import { MathText } from "@/components/math/MathText";
import type { DomainProgress } from "@/lib/srs";
import { baseIntervalDays, MASTERY_LEVEL, MASTERY_BONUS, COMBO_CAP, COMBO_STEP } from "@/lib/xp";

interface Props {
  ideaId: string;
  questionType: QuestionType;
  // Idea.question / displayQuestion() output only — never Idea.answer. See
  // the old ReviewForm's prop comment for why: passing the answer into a
  // client component leaks it into the RSC payload before it's earned.
  question: string;
  preview: string;
  level: number;
  domainName: string;
  onComplete: (result: SubmitReviewResult) => void;
}

interface DiagramQuestion {
  image: string;
  hotspots: { id: string; x: number; y: number }[];
}

const TYPE_STYLES: Record<QuestionType, string> = {
  SHORT: "chip chip-muted",
  MULTI: "chip chip-blue",
  FORMULA: "chip chip-green",
  DIAGRAM: "chip chip-amber",
  CLOZE: "chip chip-muted",
  LIST: "chip chip-blue",
  ORDER: "chip chip-green",
  NUMERIC: "chip chip-amber",
};

// Short, varied flavor text on a correct answer — presentation variety only,
// never affects the reward itself (still always the same real outcome), so
// this stays on the honest side of the line drawn earlier in this project.
/**
 * How far the Domain now sits toward its next level.
 *
 * The single biggest gap in the old reward loop: a correct answer said
 * "Advanced to level N" about the *Idea* and then went silent about the
 * Domain, so the points went into a number you could only see by leaving
 * the session. Showing the bar move is the payoff for the points.
 */
function ThresholdBar({ progress }: { progress: DomainProgress }) {
  const remaining = Math.max(0, progress.pointsForNextLevel - progress.pointsIntoLevel);
  return (
    <div className="mx-auto mt-5 max-w-xs text-left">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="label-xs">{progress.domainName}</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-2)" }}>
          L{progress.level} · {remaining.toFixed(0)} to next
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden" style={{ borderRadius: 3, background: "var(--sub)" }}>
        <div
          className="h-full transition-[width] duration-700 ease-out"
          style={{
            width: `${Math.max(2, progress.progress * 100)}%`,
            borderRadius: 3,
            background: "var(--green)",
          }}
        />
      </div>
    </div>
  );
}

const AFFIRMATIONS = ["Nice.", "Sharp.", "Exactly.", "Clean recall.", "Locked in.", "Nailed it.", "Solid."];

function describeOutcome(outcome: SubmitReviewResult["outcome"]): string {
  switch (outcome.outcome) {
    case "advanced":
      return `Advanced to level ${outcome.newLevel}`;
    case "strike":
      return `Strike ${outcome.failedAttempts}/${outcome.strikeLimit} — due again in 24h`;
    case "degraded":
      return `Degraded to level ${outcome.newLevel}`;
    case "shielded":
      return `${outcome.skillName} absorbed it — level ${outcome.level} held`;
  }
}

// Deliberately brisk — this is a sequential run, not a single embedded row,
// so routine feedback should hold just long enough to register and then get
// out of the way. The rarer domain-level-up gets a bit more spotlight since
// it's a genuinely special moment, not routine.
const RESULT_HOLD_MS = 650;
const LEVEL_UP_HOLD_MS = 1400;
// Mastery is once per Idea, ever — it earns the longest hold in the app.
const MASTERY_HOLD_MS = 2200;

const INPUT_CLASS =
  "input";

export function SessionCard({ ideaId, questionType, question, preview, level, domainName, onComplete }: Props) {
  const { streak, recordResult } = useStreak();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SubmitReviewResult | null>(null);
  const [affirmation, setAffirmation] = useState("");
  const [shortAnswer, setShortAnswer] = useState("");
  const [formulaAnswer, setFormulaAnswer] = useState("");
  const [diagramLabels, setDiagramLabels] = useState<Record<string, string>>({});

  function submit(userAnswer: string | string[] | Record<string, string>) {
    startTransition(async () => {
      // `streak` is the run *before* this answer, which is exactly the
      // combo the reward curve expects.
      const res = await submitReview({ ideaId, userAnswer, combo: streak });
      if (res.correct) setAffirmation(AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)]);
      setResult(res);
      recordResult(res.outcome.nextCombo);
    });
  }

  useEffect(() => {
    if (!result) return;
    const advanced = result.outcome.outcome === "advanced" ? result.outcome : null;
    const hold = advanced?.mastered
      ? MASTERY_HOLD_MS
      : advanced?.domainLeveledUp
        ? LEVEL_UP_HOLD_MS
        : RESULT_HOLD_MS;
    const t = setTimeout(() => onComplete(result), hold);
    return () => clearTimeout(t);
    // onComplete intentionally excluded — it closes over stale run state by
    // design each render, and re-firing this timer on every parent render
    // would break the hold duration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  if (result) {
    const advanced = result.outcome.outcome === "advanced" ? result.outcome : null;

    // Mastery — the top of the 12-tier ladder, reachable once per Idea.
    // Previously indistinguishable from any other advance.
    if (advanced?.mastered) {
      return (
        <div
          className="fade-up rounded-card border px-6 py-12 text-center"
          style={{ borderColor: "rgba(0,204,122,0.4)", background: "var(--green-06)" }}
        >
          <p className="chip chip-green mx-auto">Mastered</p>
          <p className="mt-3 text-[17px] font-semibold" style={{ color: "var(--ink-0)" }}>
            Level {MASTERY_LEVEL} reached
          </p>
          <p className="mt-1" style={{ fontSize: 12, color: "var(--ink-1)" }}>
            Fully retained — next review in {baseIntervalDays(MASTERY_LEVEL)} days.
          </p>
          <p className="mono mt-4" style={{ fontSize: 22, fontWeight: 800, color: "var(--green)" }}>
            +{advanced.pointsAwarded.toFixed(0)}
          </p>
          <p className="label-xs mt-1">
            includes +{MASTERY_BONUS} mastery bonus
          </p>
        </div>
      );
    }

    if (advanced?.domainLeveledUp) {
      return (
        <div className="card fade-up px-6 py-12 text-center">
          <p className="chip chip-green mx-auto">Level up</p>
          <p className="mt-3 text-[17px] font-semibold" style={{ color: "var(--ink-0)" }}>
            {domainName} reached level {advanced.newDomainLevel}
          </p>
          <ThresholdBar progress={advanced.domainProgress} />
        </div>
      );
    }

    return (
      <div
        className={`relative rounded-card border px-6 py-12 text-center ${
          result.correct
            ? "fade-up border-[rgba(0,204,122,0.28)] bg-[var(--green-10)] text-green"
            : "fade-up border-[rgba(240,58,87,0.28)] bg-[var(--red-10)] text-red"
        }`}
      >
        <p className="text-3xl leading-none">{result.correct ? "✓" : "✗"}</p>
        <p className="mt-3 text-[17px] font-semibold">{result.correct ? affirmation : "Incorrect"}</p>
        <p className="mt-1 text-xs opacity-70">{describeOutcome(result.outcome)}</p>

        {advanced && (
          <>
            {/* The real figure. This was hardcoded "+2 XP" and had already
                stopped matching what the server actually credits. */}
            <span
              aria-hidden
              className="animate-float-up-fade mono pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-base font-bold"
              style={{ color: "var(--green)" }}
            >
              +{advanced.pointsAwarded.toFixed(1)}
            </span>
            {streak >= 2 && (
              <p className="label-xs mt-2" style={{ color: "var(--green)" }}>
                {streak} in a row · x{(1 + Math.min(streak, COMBO_CAP) * COMBO_STEP).toFixed(2)}
              </p>
            )}
            <ThresholdBar progress={advanced.domainProgress} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="card px-6 py-7">
      <div className="mb-5 flex items-center justify-between">
        <span className={`shrink-0 ${TYPE_STYLES[questionType]}`}>{questionType}</span>
        <span className="font-mono text-xs text-ink-2">
          {domainName} · Lv{level}
        </span>
      </div>

      {questionType === "SHORT" || questionType === "FORMULA" ? (
        <>
          <p className="mb-5 text-[17px] leading-snug text-ink-0">
            {questionType === "FORMULA" ? <MathText text={preview} /> : preview}
          </p>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const value = questionType === "SHORT" ? shortAnswer : formulaAnswer;
              if (value.trim()) submit(value.trim());
            }}
          >
            <input
              type="text"
              value={questionType === "SHORT" ? shortAnswer : formulaAnswer}
              onChange={(e) => (questionType === "SHORT" ? setShortAnswer : setFormulaAnswer)(e.target.value)}
              placeholder={questionType === "FORMULA" ? "e.g. sqrt(x^2 + y^2)" : "Your answer"}
              className={`${INPUT_CLASS} ${questionType === "FORMULA" ? "font-mono" : ""}`}
              disabled={isPending}
              autoFocus
            />
            <button
              type="submit"
              disabled={isPending || !(questionType === "SHORT" ? shortAnswer : formulaAnswer).trim()}
              className="btn-primary shrink-0"
            >
              {isPending ? "…" : "Submit"}
            </button>
          </form>
        </>
      ) : questionType === "CLOZE" ||
        questionType === "LIST" ||
        questionType === "ORDER" ||
        questionType === "NUMERIC" ? (
        <FormatAnswer
          questionType={questionType}
          question={question}
          disabled={isPending}
          onSubmit={submit}
        />
      ) : questionType === "MULTI" ? (
        (() => {
          let options: string[] = [];
          try {
            options = JSON.parse(question);
          } catch {
            // malformed stored question — fall through with an empty list
          }
          return (
            <>
              <p className="mb-5 text-[17px] leading-snug text-ink-0">Choose the correct answer</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={isPending}
                    onClick={() => submit(opt)}
                    className="rounded-control border border-[var(--line-hi)] bg-sub px-4 py-3 text-left text-sm text-ink-1 transition hover:border-[rgba(0,204,122,0.45)] hover:text-ink-0 disabled:opacity-40"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </>
          );
        })()
      ) : (
        (() => {
          let diagram: DiagramQuestion | null = null;
          try {
            diagram = JSON.parse(question);
          } catch {
            diagram = null;
          }
          if (!diagram) return <p className="text-sm text-crimson">Malformed diagram data.</p>;
          return (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                submit(diagramLabels);
              }}
            >
              <p className="mb-2 text-sm text-ink-2">
                No image renderer yet ({diagram.image}) — label each hotspot by ID.
              </p>
              {diagram.hotspots.map((h) => (
                <div key={h.id} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 font-mono text-xs text-arcane-bright/80">{h.id}</span>
                  <input
                    type="text"
                    value={diagramLabels[h.id] ?? ""}
                    onChange={(e) => setDiagramLabels((prev) => ({ ...prev, [h.id]: e.target.value }))}
                    className={INPUT_CLASS}
                    disabled={isPending}
                  />
                </div>
              ))}
              <button type="submit" disabled={isPending} className="btn-primary">
                {isPending ? "…" : "Submit"}
              </button>
            </form>
          );
        })()
      )}
    </div>
  );
}
