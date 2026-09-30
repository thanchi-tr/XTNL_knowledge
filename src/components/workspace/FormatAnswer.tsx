"use client";

import { useState } from "react";
import type { QuestionType } from "@prisma/client";
import { decodeListQuestion, decodeOrderQuestion, decodeNumericQuestion, clozeBlank } from "@/lib/idea-payload";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";

/**
 * Review inputs for the four formats added after the original set: CLOZE,
 * LIST, ORDER and NUMERIC.
 *
 * Every one of these submits an array or a string; none can see the answer,
 * because the runner is never given it before grading.
 */

interface Props {
  questionType: Extract<QuestionType, "CLOZE" | "LIST" | "ORDER" | "NUMERIC">;
  /** The stored, already-blanked/scrambled question payload. */
  question: string;
  disabled: boolean;
  /** True while the answer is being checked. */
  pending?: boolean;
  onSubmit: (answer: string | string[]) => void;
}

export function FormatAnswer({ questionType, question, disabled, pending, onSubmit }: Props) {
  if (questionType === "CLOZE") return <ClozeAnswer question={question} disabled={disabled} pending={pending} onSubmit={onSubmit} />;
  if (questionType === "LIST") return <ListAnswer question={question} disabled={disabled} pending={pending} onSubmit={onSubmit} />;
  if (questionType === "ORDER") return <OrderAnswer question={question} disabled={disabled} pending={pending} onSubmit={onSubmit} />;
  return <NumericAnswer question={question} disabled={disabled} pending={pending} onSubmit={onSubmit} />;
}

/** The prompt each format shows on the question card (no answer in any of them). */
export function formatPrompt(questionType: Props["questionType"], question: string): string {
  if (questionType === "CLOZE") return "Fill the blanks";
  if (questionType === "LIST") return decodeListQuestion(question).prompt;
  if (questionType === "ORDER") return decodeOrderQuestion(question).prompt;
  return decodeNumericQuestion(question).prompt;
}

function SubmitButton({ disabled, pending }: { disabled: boolean; pending?: boolean }) {
  return (
    <Button type="submit" variant="primary" size="lg" block disabled={disabled} kbd="Enter">
      {pending ? "Checking…" : "Check answer"}
    </Button>
  );
}

/**
 * Splits blanked text around its `[1]`, `[2]` markers so an input can be
 * rendered in the gap rather than beneath the sentence — reading the
 * sentence with the field where the word belongs is the whole point of a
 * cloze.
 */
type Segment = { kind: "text"; text: string } | { kind: "blank"; index: number };

function splitOnBlanks(text: string): { segments: Segment[]; count: number } {
  const parts = text.split(/(\[\d+\])/g);
  const segments: Segment[] = [];
  let count = 0;
  for (const part of parts) {
    if (/^\[\d+\]$/.test(part)) {
      // The blank's index is assigned while building this list, not by a
      // counter mutated inside the render's `map` — React may re-run that
      // map, and a running counter would drift.
      segments.push({ kind: "blank", index: count });
      count += 1;
    } else if (part) {
      segments.push({ kind: "text", text: part });
    }
  }
  return { segments, count };
}

type Inner = Omit<Props, "questionType">;

function ClozeAnswer({ question, disabled, pending, onSubmit }: Inner) {
  const { segments, count } = splitOnBlanks(question);
  const [blanks, setBlanks] = useState<string[]>(() => Array(count).fill(""));

  return (
    <form
      className="rv-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && blanks.every((b) => b.trim())) onSubmit(blanks);
      }}
    >
      <p className="rv-cloze">
        {segments.map((seg, i) => {
          if (seg.kind === "text") return <span key={i}>{seg.text}</span>;
          const idx = seg.index;
          return (
            <input
              key={i}
              type="text"
              value={blanks[idx] ?? ""}
              onChange={(e) => setBlanks((prev) => prev.map((b, j) => (j === idx ? e.target.value : b)))}
              aria-label={`Blank ${idx + 1}`}
              placeholder={clozeBlank(idx + 1)}
              autoFocus={idx === 0}
              disabled={disabled}
              className={cx("rv-blank", blanks[idx]?.trim() && "filled")}
              style={{ width: `${Math.max(6, (blanks[idx]?.length ?? 0) + 2)}ch` }}
            />
          );
        })}
      </p>
      <SubmitButton disabled={disabled || blanks.some((b) => !b.trim())} pending={pending} />
    </form>
  );
}

function ListAnswer({ question, disabled, pending, onSubmit }: Inner) {
  const { count } = decodeListQuestion(question);
  const [items, setItems] = useState<string[]>(() => Array(Math.max(1, count)).fill(""));

  return (
    <form
      className="rv-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && items.every((i) => i.trim())) onSubmit(items);
      }}
    >
      <p className="t-meta">
        {count} item{count === 1 ? "" : "s"} · order does not matter
      </p>
      <ol className="rv-seq">
        {items.map((item, i) => (
          <li key={i}>
            <span className="n" aria-hidden="true">
              {i + 1}
            </span>
            <input
              type="text"
              value={item}
              onChange={(e) => setItems((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
              aria-label={`Item ${i + 1}`}
              autoFocus={i === 0}
              disabled={disabled}
              className="rv-input"
            />
          </li>
        ))}
      </ol>
      <SubmitButton disabled={disabled || items.some((i) => !i.trim())} pending={pending} />
    </form>
  );
}

function OrderAnswer({ question, disabled, pending, onSubmit }: Inner) {
  const { items } = decodeOrderQuestion(question);
  const [sequence, setSequence] = useState<string[]>([]);
  const remaining = items.filter((i) => !sequence.includes(i));

  return (
    <form
      className="rv-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && sequence.length === items.length) onSubmit(sequence);
      }}
    >
      {/* Click-to-build rather than drag-and-drop: a sequence is short, and
          dragging is the least accessible interaction available. */}
      <div>
        <p className="t-eyebrow">Your sequence</p>
        {sequence.length === 0 ? (
          <p className="t-meta" style={{ marginTop: 6 }}>
            Choose the first step below.
          </p>
        ) : (
          <ol className="rv-seq" style={{ marginTop: 6 }}>
            {sequence.map((item, i) => (
              <li key={item}>
                <span className="n" aria-hidden="true">
                  {i + 1}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setSequence((prev) => prev.slice(0, i))}
                  aria-label={`Step ${i + 1}: ${item}. Remove it and every later step`}
                  className="rv-pill placed"
                >
                  {item}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {remaining.length > 0 && (
        <div>
          <p className="t-eyebrow">Remaining</p>
          <div className="rv-pick" style={{ marginTop: 6 }}>
            {remaining.map((item) => (
              <button key={item} type="button" disabled={disabled} onClick={() => setSequence((prev) => [...prev, item])} className="rv-pill">
                {item}
              </button>
            ))}
          </div>
        </div>
      )}

      <SubmitButton disabled={disabled || sequence.length !== items.length} pending={pending} />
    </form>
  );
}

function NumericAnswer({ question, disabled, pending, onSubmit }: Inner) {
  const { unit } = decodeNumericQuestion(question);
  const [value, setValue] = useState("");

  return (
    <form
      className="rv-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && value.trim()) onSubmit(value);
      }}
    >
      <div className="row">
        <input
          // `text`, not `number`: a spinner is useless for a recalled value
          // and number inputs silently reject intermediate states like
          // "6.02e" while you are still typing the exponent.
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Value"
          aria-label={unit ? `Numeric answer, in ${unit}` : "Numeric answer"}
          autoFocus
          disabled={disabled}
          className="rv-input mono"
        />
        {unit && <span className="t-mono ink-1">{unit}</span>}
      </div>
      <SubmitButton disabled={disabled || !value.trim()} pending={pending} />
    </form>
  );
}
