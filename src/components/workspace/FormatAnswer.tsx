"use client";

import { useState } from "react";
import type { QuestionType } from "@prisma/client";
import {
  decodeListQuestion,
  decodeOrderQuestion,
  decodeNumericQuestion,
  clozeBlank,
} from "@/lib/idea-payload";

/**
 * Review inputs for the four formats added after the original set.
 *
 * Extracted rather than added to `SessionCard`'s ternary chain, which was
 * already three formats deep — four more branches inline would have buried
 * the card's actual job (submit, hold, report) under input markup.
 *
 * Every one of these submits an array or a string; none can see the answer,
 * because `SessionCard` is never given it.
 */

interface Props {
  questionType: Extract<QuestionType, "CLOZE" | "LIST" | "ORDER" | "NUMERIC">;
  /** The stored, already-blanked/scrambled question payload. */
  question: string;
  disabled: boolean;
  onSubmit: (answer: string | string[]) => void;
}

const INPUT = "input";

export function FormatAnswer({ questionType, question, disabled, onSubmit }: Props) {
  if (questionType === "CLOZE") return <ClozeAnswer question={question} disabled={disabled} onSubmit={onSubmit} />;
  if (questionType === "LIST") return <ListAnswer question={question} disabled={disabled} onSubmit={onSubmit} />;
  if (questionType === "ORDER") return <OrderAnswer question={question} disabled={disabled} onSubmit={onSubmit} />;
  return <NumericAnswer question={question} disabled={disabled} onSubmit={onSubmit} />;
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
      // map, and a running counter would drift. (The previous version also
      // marked blanks with a sentinel string that had picked up a stray NUL
      // byte, which no equality check could match reliably.)
      segments.push({ kind: "blank", index: count });
      count += 1;
    } else if (part) {
      segments.push({ kind: "text", text: part });
    }
  }
  return { segments, count };
}

function ClozeAnswer({ question, disabled, onSubmit }: Omit<Props, "questionType">) {
  const { segments, count } = splitOnBlanks(question);
  const [blanks, setBlanks] = useState<string[]>(() => Array(count).fill(""));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(blanks);
      }}
    >
      <p className="text-[17px] leading-relaxed text-ink-0">
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
              className="mx-1 inline-block rounded border-b-2 bg-transparent px-1 text-center align-baseline"
              style={{
                width: `${Math.max(6, (blanks[idx]?.length ?? 0) + 2)}ch`,
                borderColor: blanks[idx]?.trim() ? "var(--green)" : "var(--line-act)",
                color: "var(--green)",
                outline: "none",
              }}
            />
          );
        })}
      </p>
      <button type="submit" disabled={disabled || blanks.some((b) => !b.trim())} className="btn-primary">
        Submit
      </button>
    </form>
  );
}

function ListAnswer({ question, disabled, onSubmit }: Omit<Props, "questionType">) {
  const { prompt, count } = decodeListQuestion(question);
  const [items, setItems] = useState<string[]>(() => Array(Math.max(1, count)).fill(""));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(items);
      }}
    >
      <p className="text-[17px] leading-snug text-ink-0">{prompt}</p>
      <p className="label-xs">
        {count} item{count === 1 ? "" : "s"} · order does not matter
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="mono w-4 shrink-0 text-right" style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {i + 1}
            </span>
            <input
              type="text"
              value={item}
              onChange={(e) => setItems((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
              aria-label={`Item ${i + 1}`}
              autoFocus={i === 0}
              className={INPUT}
            />
          </div>
        ))}
      </div>
      <button type="submit" disabled={disabled || items.some((i) => !i.trim())} className="btn-primary">
        Submit
      </button>
    </form>
  );
}

function OrderAnswer({ question, disabled, onSubmit }: Omit<Props, "questionType">) {
  const { prompt, items } = decodeOrderQuestion(question);
  const [sequence, setSequence] = useState<string[]>([]);
  const remaining = items.filter((i) => !sequence.includes(i));

  return (
    <div className="space-y-4">
      <p className="text-[17px] leading-snug text-ink-0">{prompt}</p>

      {/* Click-to-build rather than drag-and-drop: a sequence is short, and
          dragging is the least accessible interaction available. */}
      <div>
        <p className="label-xs mb-2">Your sequence</p>
        {sequence.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--ink-3)" }}>Choose the first step below.</p>
        ) : (
          <ol className="space-y-1.5">
            {sequence.map((item, i) => (
              <li key={item} className="flex items-center gap-2">
                <span className="mono w-4 text-right" style={{ fontSize: 11, color: "var(--green)" }}>
                  {i + 1}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setSequence((prev) => prev.slice(0, i))}
                  title={`Remove from step ${i + 1} onward`}
                  className="flex-1 rounded-control px-3 py-2 text-left text-sm"
                  style={{
                    border: "1px solid rgba(0,204,122,0.35)",
                    background: "var(--green-10)",
                    color: "var(--ink-0)",
                    cursor: "pointer",
                  }}
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
          <p className="label-xs mb-2">Remaining</p>
          <div className="flex flex-wrap gap-2">
            {remaining.map((item) => (
              <button
                key={item}
                type="button"
                disabled={disabled}
                onClick={() => setSequence((prev) => [...prev, item])}
                className="rounded-control border border-[var(--line-hi)] bg-sub px-3 py-2 text-sm text-ink-1 transition hover:border-[rgba(0,204,122,0.45)] hover:text-ink-0 disabled:opacity-40"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={disabled || sequence.length !== items.length}
        onClick={() => onSubmit(sequence)}
        className="btn-primary"
      >
        Submit
      </button>
    </div>
  );
}

function NumericAnswer({ question, disabled, onSubmit }: Omit<Props, "questionType">) {
  const { prompt, unit } = decodeNumericQuestion(question);
  const [value, setValue] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <p className="text-[17px] leading-snug text-ink-0">{prompt}</p>
      <div className="flex items-center gap-2">
        <input
          // `text`, not `number`: a spinner is useless for a recalled value
          // and number inputs silently reject intermediate states like
          // "6.02e" while you are still typing the exponent.
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Value"
          aria-label="Numeric answer"
          autoFocus
          className={`${INPUT} mono max-w-[220px]`}
        />
        {unit && (
          <span className="mono" style={{ fontSize: 13, color: "var(--ink-2)" }}>
            {unit}
          </span>
        )}
      </div>
      <button type="submit" disabled={disabled || !value.trim()} className="btn-primary">
        Submit
      </button>
    </form>
  );
}
