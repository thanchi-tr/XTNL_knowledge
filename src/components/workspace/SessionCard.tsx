"use client";

/**
 * The runner's card: context line, question card (display 20/27, type chip,
 * last seen) and the answer area anchored low in the thumb zone — 56 px
 * options with their 1–4 keycaps for a multiple choice, a form for the
 * typed formats (FormatAnswer for CLOZE, LIST, ORDER and NUMERIC).
 *
 * Controlled: it never grades and never sees the answer. After grading the
 * runner passes back the answer the server returned (`expected`), and a
 * multiple choice marks the right option, the one picked, and dims the rest
 * to 45 %. Number keys are handled by the runner, which owns the keyboard.
 */
import { useMemo, useState } from "react";
import type { QuestionType } from "@prisma/client";
import type { ReviewAnswer } from "@/lib/verification";
import { daysBetween, type DayKey } from "@/lib/life-day";
import { MathText } from "@/components/math/MathText";
import { ReviewFormulaField } from "@/components/math/ReviewFormulaField";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon, Sigil } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { FormatAnswer, formatPrompt } from "./FormatAnswer";
import { answerText, sameOption, type RunCard } from "./review-model";

export type CardPhase = "ask" | "pending" | "answered";

interface Props {
  card: RunCard;
  today: DayKey;
  phase: CardPhase;
  /** After grading: the answer as the server stored it (a MULTI's correct option). */
  expected?: string | null;
  /** After grading: what the player picked (a MULTI option). */
  picked?: string | null;
  onAnswer: (answer: ReviewAnswer, display: string) => void;
}

export const TYPE_LABEL: Record<QuestionType, string> = {
  SHORT: "Short answer",
  MULTI: "Multiple choice",
  FORMULA: "Formula",
  DIAGRAM: "Diagram",
  CLOZE: "Fill the blanks",
  LIST: "List",
  ORDER: "Order",
  NUMERIC: "Number",
};

interface DiagramQuestion {
  image: string;
  hotspots: { id: string; x: number; y: number }[];
}

/** Parsed once per card: the MULTI options (the question payload is the option list). */
export function multiOptionsOf(card: Pick<RunCard, "questionType" | "question">): string[] {
  if (card.questionType !== "MULTI") return [];
  try {
    const parsed: unknown = JSON.parse(card.question);
    return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === "string") : [];
  } catch {
    return [];
  }
}

function lastSeenText(lastSeenDay: string | null, today: DayKey): string | null {
  if (!lastSeenDay) return null;
  const d = daysBetween(lastSeenDay, today);
  if (d <= 0) return "last seen today";
  if (d === 1) return "last seen yesterday";
  return `last seen ${d} days ago`;
}

function questionText(card: RunCard) {
  switch (card.questionType) {
    case "MULTI":
      return card.prompt ?? "Choose the correct answer";
    case "FORMULA":
      return <MathText text={card.preview} />;
    case "DIAGRAM":
      return "Label each hotspot";
    case "CLOZE":
    case "LIST":
    case "ORDER":
    case "NUMERIC":
      return formatPrompt(card.questionType, card.question);
    default:
      return card.preview;
  }
}

export function SessionCard({ card, today, phase, expected, picked, onAnswer }: Props) {
  const seen = lastSeenText(card.lastSeenDay, today);
  const options = useMemo(() => multiOptionsOf(card), [card]);
  return (
    <>
      <div className="rv-ctx">
        <span>
          <Sigil track="know" /> <b>{card.domainName}</b> · {card.fieldName}
        </span>
        <span>Idea level {card.level}</span>
      </div>
      <section className="card rv-q" aria-labelledby={`rv-q-${card.id}`} tabIndex={-1}>
        <div className="qh">
          <Chip>{TYPE_LABEL[card.questionType]}</Chip>
          {(seen || card.overdue) && <span className="t-meta">{[card.overdue ? "overdue" : null, seen].filter(Boolean).join(" · ")}</span>}
        </div>
        <h2 id={`rv-q-${card.id}`} className="t-question">
          {questionText(card)}
        </h2>
      </section>
      <div className="rv-spacer" />
      {card.questionType === "MULTI" ? (
        <MultiOptions options={options} phase={phase} expected={expected ?? null} picked={picked ?? null} onAnswer={onAnswer} />
      ) : card.questionType === "SHORT" || card.questionType === "FORMULA" ? (
        <TextAnswer formula={card.questionType === "FORMULA"} phase={phase} onAnswer={onAnswer} />
      ) : card.questionType === "DIAGRAM" ? (
        <DiagramAnswer question={card.question} phase={phase} onAnswer={onAnswer} />
      ) : (
        <FormatAnswer
          questionType={card.questionType}
          question={card.question}
          disabled={phase !== "ask"}
          pending={phase === "pending"}
          onSubmit={(a) => onAnswer(a, answerText(a))}
        />
      )}
    </>
  );
}

function MultiOptions({
  options,
  phase,
  expected,
  picked,
  onAnswer,
}: {
  options: string[];
  phase: CardPhase;
  expected: string | null;
  picked: string | null;
  onAnswer: Props["onAnswer"];
}) {
  const answered = phase === "answered";
  if (options.length === 0) return <p className="t-meta">This card has no options to choose from.</p>;
  return (
    <div className={cx("rv-opts", phase !== "ask" && "locked")} role="group" aria-label="Answers">
      {options.map((opt, i) => {
        const isRight = answered && expected != null && sameOption(opt, expected);
        const isPicked = answered && picked != null && sameOption(opt, picked);
        const state = answered ? (isRight ? "right" : isPicked ? "picked-wrong" : "dim") : null;
        return (
          <button
            key={`${i}:${opt}`}
            type="button"
            className={cx("rv-opt", state)}
            disabled={phase !== "ask"}
            aria-keyshortcuts={i < 9 ? String(i + 1) : undefined}
            onClick={() => onAnswer(opt, opt)}
          >
            {/* The number is the shortcut, shown rather than hidden in a hint. */}
            <span className="key" aria-hidden="true">
              {isRight ? <Icon name="check" /> : i < 9 ? i + 1 : "·"}
            </span>
            <span className="txt">{opt}</span>
            {(isRight || isPicked) && <span className="res">{isRight ? (isPicked ? "Correct" : "The answer") : "Your answer"}</span>}
          </button>
        );
      })}
    </div>
  );
}

function TextAnswer({ formula, phase, onAnswer }: { formula: boolean; phase: CardPhase; onAnswer: Props["onAnswer"] }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="rv-form"
      onSubmit={(e) => {
        e.preventDefault();
        const v = value.trim();
        if (v && phase === "ask") onAnswer(v, v);
      }}
    >
      {formula ? (
        <ReviewFormulaField value={value} onChange={setValue} disabled={phase !== "ask"} />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Your answer"
          aria-label="Your answer"
          className="rv-input"
          disabled={phase !== "ask"}
          autoFocus
          autoComplete="off"
        />
      )}
      <Button type="submit" variant="primary" size="lg" block kbd="Enter" disabled={phase !== "ask" || !value.trim()}>
        {phase === "pending" ? "Checking…" : "Check answer"}
      </Button>
    </form>
  );
}

/**
 * The diagram's image with a numbered marker on each hotspot (x and y are
 * fractions of the image's width and height). If the image can't load, the
 * markers stay on a blank frame and the card says which file is missing, so
 * the labels can still be typed.
 */
function DiagramFigure({ diagram }: { diagram: DiagramQuestion }) {
  const [failed, setFailed] = useState(false);
  const pct = (v: number) => `${Math.min(100, Math.max(0, v * 100))}%`;
  return (
    <figure className={cx("rv-diagram", failed && "missing")}>
      {!failed && (
        // A plain img: the diagrams are local SVGs, which next/image would refuse to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={diagram.image} alt="The diagram to label" onError={() => setFailed(true)} />
      )}
      {diagram.hotspots.map((h, i) => (
        <span key={h.id} className="rv-hot" style={{ left: pct(h.x), top: pct(h.y) }} aria-hidden="true">
          {i + 1}
        </span>
      ))}
      {failed && <figcaption className="miss t-meta">The image {diagram.image} is missing. The markers are where the labels go.</figcaption>}
    </figure>
  );
}

function DiagramAnswer({ question, phase, onAnswer }: { question: string; phase: CardPhase; onAnswer: Props["onAnswer"] }) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const diagram = useMemo<DiagramQuestion | null>(() => {
    try {
      return JSON.parse(question) as DiagramQuestion;
    } catch {
      return null;
    }
  }, [question]);
  if (!diagram) return <p className="t-meta">This diagram card could not be read.</p>;
  return (
    <form
      className="rv-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (phase === "ask") onAnswer(labels, answerText(labels));
      }}
    >
      <DiagramFigure diagram={diagram} />
      {diagram.hotspots.map((h, i) => (
        <div key={h.id} className="row">
          <span className="rv-hot-n" aria-hidden="true">
            {i + 1}
          </span>
          <input
            type="text"
            value={labels[h.id] ?? ""}
            onChange={(e) => setLabels((prev) => ({ ...prev, [h.id]: e.target.value }))}
            aria-label={`Label for marker ${i + 1}`}
            placeholder={`Marker ${i + 1}`}
            className="rv-input"
            disabled={phase !== "ask"}
            autoFocus={i === 0}
          />
        </div>
      ))}
      <Button type="submit" variant="primary" size="lg" block kbd="Enter" disabled={phase !== "ask"}>
        {phase === "pending" ? "Checking…" : "Check answer"}
      </Button>
    </form>
  );
}
