"use client";

/**
 * One idea, as the Library's sheet and the /library/[id] page show it:
 * question and answer, the level ring (mastery is a fixed target: 12),
 * next due, the history strip from the life ledger, Edit (any written format, the format too)
 * and a quiet two-step Delete.
 *
 * History arrives as `history` (null while it loads; the sheet fetches it on
 * open). Nothing here is estimated: every figure is read from the row or the
 * ledger, and the strip says when older misses were never recorded.
 */
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteIdea, editIdea } from "@/app/actions/ideas";
import { bandFor, DIFFICULTY_META } from "@/lib/difficulty";
import { displayAnswer, displayQuestion } from "@/lib/idea-display";
import { countClozeBlanks, parseCloze } from "@/lib/idea-payload";
import { EDIT_FORMATS, EDIT_ROWS_MAX, contentOfAddState, editStateOf, switchEditFormat } from "@/lib/idea-edit";
import type { AddContentState } from "@/lib/idea-handoff";
import { ShortAnswerOptions } from "./ShortAnswerOptions";
import { MASTERY_LEVEL } from "@/lib/xp";
import { MathText } from "@/components/math/MathText";
import { Button } from "@/components/ui/Button";
import { Chip, ChipButton } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { SegmentStrip } from "@/components/ui/Meter";
import { PromiseRing } from "@/components/ui/PromiseRing";
import { Skeleton } from "@/components/ui/Tabs";
import {
  COLLECTION_NAME,
  EDITABLE_TYPES,
  TYPE_NAME,
  dueSentence,
  historySummary,
  isMastered,
  plural,
  shortDate,
  type IdeaHistory,
  type LibraryIdea,
} from "./library-model";

interface IdeaDetailProps {
  idea: LibraryIdea;
  now: number;
  /** null while loading. */
  history: IdeaHistory | null;
  /** Called after a delete succeeded (the sheet closes; the page leaves). */
  onDeleted?: (id: string) => void;
}

export function IdeaDetail({ idea, now, history, onDeleted }: IdeaDetailProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const mastered = isMastered(idea);
  const formula = idea.questionType === "FORMULA";
  const question = displayQuestion(idea.questionType, idea.question);
  const answer = displayAnswer(idea.questionType, idea.answer);
  const band = idea.difficulty > 0 ? DIFFICULTY_META[bandFor(idea.difficulty)] : null;
  const editable = EDITABLE_TYPES.includes(idea.questionType);

  function remove() {
    setError(null);
    start(async () => {
      const res = await deleteIdea(idea.id);
      if (!res.ok) {
        setError(res.error);
        setArmed(false);
        return;
      }
      onDeleted?.(idea.id);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <IdeaEditForm
        idea={idea}
        now={now}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          setSaved(true);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div>
      <section className="card idea-qa" aria-label="Question and answer">
        <div className="t-eyebrow">Question</div>
        <p className="t-body-l">{formula ? <MathText text={question} /> : question}</p>
        <div className="t-eyebrow idea-a-h">Answer</div>
        <p className={formula ? "t-mono" : undefined}>{answer}</p>
      </section>

      <div className="idea-lvl">
        <PromiseRing value={Math.min(idea.level, MASTERY_LEVEL)} target={MASTERY_LEVEL} size={56} label="Mastery level" closed={mastered}>
          <b className="num">{idea.level}</b>
        </PromiseRing>
        <div style={{ minWidth: 0 }}>
          <b>{mastered ? `Mastered · level ${idea.level}` : `Level ${idea.level} of ${MASTERY_LEVEL}`}</b>
          <div className="t-meta">
            {idea.isArchived ? "Archived · not scheduled" : dueSentence(idea.dueAt, now)}
            {history && history.total > 0 && ` · ${historySummary(history)}`} · added {shortDate(idea.createdAt, now)}
          </div>
        </div>
      </div>

      <div className="idea-tags">
        <Chip>{TYPE_NAME[idea.questionType]}</Chip>
        <Chip>{COLLECTION_NAME[idea.collectionLabel]}</Chip>
        {band && <Chip title={`Difficulty ${idea.difficulty} of 100: ${band.blurb}`}>{band.label}</Chip>}
        {mastered && (
          <Chip tone="kept" icon="check">
            Mastered
          </Chip>
        )}
        {idea.failedAttempts > 0 && <Chip>{plural(idea.failedAttempts, "strike")} since the last recall</Chip>}
        {idea.linkedCount > 0 && <Chip>{plural(idea.linkedCount, "link")}</Chip>}
        {idea.isArchived && <Chip>Archived</Chip>}
        {idea.tags.map((t) => (
          <Chip key={t}>#{t}</Chip>
        ))}
      </div>

      <section className="idea-hist" aria-label="Review history">
        <div className="t-eyebrow">History</div>
        {history === null ? (
          <Skeleton h={6} r={2} className="idea-hist-skel" />
        ) : history.total === 0 ? (
          <p className="st-note">No reviews recorded yet.</p>
        ) : (
          <>
            <SegmentStrip
              segs={history.segs}
              label={`Last ${history.segs.length} reviews: ${history.segs.filter((s) => s === "on").length} recalled, ${history.segs.filter((s) => s === "miss").length} missed`}
            />
            <p className="st-note">
              {history.segs.length < history.total ? `The last ${history.segs.length} of ${history.total}. ` : ""}
              {historySummary(history)} in all.
              {history.backfilled &&
                (history.firstLiveAt
                  ? ` Before ${shortDate(history.firstLiveAt, now)} only passed reviews were recorded.`
                  : " Only passed reviews were recorded for this idea so far.")}
            </p>
          </>
        )}
      </section>

      {saved && (
        <p className="st-note" role="status" style={{ marginTop: 12 }}>
          Saved. Level, due date and history are unchanged.
        </p>
      )}
      {error && (
        <p className="st-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      <div className="idea-acts">
        {armed ? (
          <>
            <span className="st-note" style={{ flexBasis: "100%" }}>
              Delete this idea for good? Its own points leave {idea.domainName}; review points already paid stay paid.
            </span>
            <Button variant="danger" onClick={remove} disabled={pending}>
              {pending ? "Deleting…" : "Delete idea"}
            </Button>
            <Button variant="quiet" onClick={() => setArmed(false)} disabled={pending}>
              Keep it
            </Button>
          </>
        ) : (
          <>
            {editable ? (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : (
              <span className="st-note" style={{ flexBasis: "100%" }}>
                {TYPE_NAME[idea.questionType]} ideas can&apos;t be edited here yet; delete and add it again to change it.
              </span>
            )}
            <Button
              variant="quiet"
              onClick={() => {
                setArmed(true);
                setError(null);
              }}
            >
              Delete…
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Edit in place, any format the add form writes (EDITABLE_TYPES), the format itself included. A correction: no
 * points, no dedup; level, due date, strikes and history stay (idea-edit.ts has the rules, editIdea the write).
 */
function IdeaEditForm({ idea, now, onCancel, onSaved }: { idea: LibraryIdea; now: number; onCancel: () => void; onSaved: () => void }) {
  const qId = useId();
  const aId = useId();
  const [state, setState] = useState<AddContentState>(() => editStateOf(idea));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<AddContentState>) => setState((s) => ({ ...s, ...patch }));
  const content = contentOfAddState(state);
  const moved = state.type !== idea.questionType;

  function save() {
    if (!content) return;
    setError(null);
    start(async () => {
      const res = await editIdea({ ideaId: idea.id, content });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved();
    });
  }

  const prompt = (label: string, value: string, onChange: (v: string) => void, opts: { mono?: boolean; rows?: number } = {}) => (
    <div>
      <label className="st-label" htmlFor={qId}>
        {label}
      </label>
      <textarea id={qId} className={opts.mono ? "st-input t-mono" : "st-input"} rows={opts.rows ?? 3} value={value} onChange={(e) => onChange(e.target.value)} data-autofocus />
    </div>
  );

  return (
    <form
      className="idea-edit"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div role="group" aria-label="Format">
        <span className="st-label">Format</span>
        <div className="idea-edit-types">
          {EDIT_FORMATS.map((t) => (
            <ChipButton key={t} pressed={state.type === t} onClick={() => setState((s) => switchEditFormat(s, t))}>
              {TYPE_NAME[t]}
            </ChipButton>
          ))}
        </div>
      </div>

      {state.type === "SHORT" && (
        <>
          {prompt("Question", state.shortQuestion, (v) => set({ shortQuestion: v }))}
          <div>
            <label className="st-label" htmlFor={aId}>
              Answer
            </label>
            <textarea id={aId} className="st-input" rows={3} value={state.shortAnswer} onChange={(e) => set({ shortAnswer: e.target.value })} />
            <ShortAnswerOptions answer={state.shortAnswer} caseSensitive={state.shortCaseSensitive} onCaseSensitive={(v) => set({ shortCaseSensitive: v })} />
          </div>
        </>
      )}

      {state.type === "FORMULA" && (
        <>
          {prompt("Question", state.formulaQuestion, (v) => set({ formulaQuestion: v }))}
          <div>
            <label className="st-label" htmlFor={aId}>
              Formula
            </label>
            <textarea id={aId} className="st-input t-mono" rows={2} value={state.formulaAnswer} onChange={(e) => set({ formulaAnswer: e.target.value })} />
          </div>
        </>
      )}

      {state.type === "CLOZE" && (
        <div>
          <label className="st-label" htmlFor={qId}>
            Sentence
          </label>
          <textarea id={qId} className="st-input" rows={4} value={state.clozeText} onChange={(e) => set({ clozeText: e.target.value })} data-autofocus />
          {state.clozeText.trim() && countClozeBlanks(state.clozeText) === 0 ? (
            <p className="st-hint">No blanks yet: wrap the part to recall in {"{{double braces}}"}.</p>
          ) : (
            state.clozeText.trim() && (
              <div className="add-preview">
                <span className="t-eyebrow">Reviewer sees</span>
                {parseCloze(state.clozeText).blanked}
              </div>
            )
          )}
        </div>
      )}

      {state.type === "NUMERIC" && (
        <>
          {prompt("Question", state.numericPrompt, (v) => set({ numericPrompt: v }), { rows: 2 })}
          <div className="add-three">
            <EditInput label="Value" mono inputMode="decimal" value={state.numericValue} onChange={(v) => set({ numericValue: v })} />
            <EditInput label="Tolerance ±" mono inputMode="decimal" value={state.numericTolerance} onChange={(v) => set({ numericTolerance: v })} />
            <EditInput label="Unit" value={state.numericUnit} onChange={(v) => set({ numericUnit: v })} />
          </div>
        </>
      )}

      {(state.type === "LIST" || state.type === "ORDER") && (
        <>
          {state.type === "LIST"
            ? prompt("Question", state.listPrompt, (v) => set({ listPrompt: v }), { rows: 2 })
            : prompt("Question", state.orderPrompt, (v) => set({ orderPrompt: v }), { rows: 2 })}
          <EditRows
            legend={state.type === "LIST" ? "Items, in any order" : "Steps, in the correct order"}
            noun={state.type === "LIST" ? "item" : "step"}
            rows={state.type === "LIST" ? state.listItems : state.orderItems}
            onRows={(rows) => set(state.type === "LIST" ? { listItems: rows } : { orderItems: rows })}
          />
        </>
      )}

      {state.type === "MULTI" && (
        <EditRows
          legend="Options: mark the right one. Multiple choice has no separate prompt; the options are the card."
          noun="option"
          rows={state.options}
          picked={state.correctIndex}
          onPick={(i) => set({ correctIndex: i })}
          onRows={(rows, removedAt) =>
            setState((s) => ({ ...s, options: rows, correctIndex: removedAt != null && s.correctIndex >= removedAt && s.correctIndex > 0 ? s.correctIndex - 1 : s.correctIndex }))
          }
        />
      )}

      <p className="st-note idea-edit-keep">
        {moved && (
          <>
            <b>Asked as {TYPE_NAME[state.type]}</b> from the next review.{" "}
          </>
        )}
        Kept as it is: level {idea.level}, {idea.isArchived ? "archived" : lowerFirst(dueSentence(idea.dueAt, now))}
        {idea.failedAttempts > 0 ? `, ${plural(idea.failedAttempts, "strike")}` : ""} and the history. Nothing is paid.
      </p>
      {error && (
        <p className="st-error" role="alert">
          {error}
        </p>
      )}
      <div className="st-row">
        <Button type="submit" variant="primary" disabled={!content || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button variant="quiet" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function EditInput({ label, value, onChange, mono, inputMode }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean; inputMode?: "decimal" }) {
  const id = useId();
  return (
    <div>
      <label className="st-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} type="text" className={mono ? "st-input t-mono" : "st-input"} inputMode={inputMode} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** A list's items, an order's steps or multiple choice's options: rows to type, add and remove (two at least). */
function EditRows({
  legend,
  noun,
  rows,
  onRows,
  picked,
  onPick,
}: {
  legend: string;
  noun: string;
  rows: string[];
  onRows: (rows: string[], removedAt?: number) => void;
  picked?: number;
  onPick?: (i: number) => void;
}) {
  const name = useId();
  return (
    <fieldset className="add-items" style={{ border: 0, margin: 0, padding: 0 }}>
      <legend className="st-label">{legend}</legend>
      {rows.map((row, i) => (
        <div key={i} className="add-item">
          {onPick ? (
            <label className="add-pick">
              <input type="radio" name={name} checked={picked === i} onChange={() => onPick(i)} />
              <span className="sr-only">
                {noun} {i + 1} is the right one
              </span>
            </label>
          ) : (
            <span className="n">{i + 1}</span>
          )}
          <input
            type="text"
            className="st-input"
            aria-label={`${noun[0].toUpperCase()}${noun.slice(1)} ${i + 1}${picked === i ? " (right)" : ""}`}
            value={row}
            onChange={(e) => onRows(rows.map((r, j) => (j === i ? e.target.value : r)))}
          />
          {rows.length > 2 && (
            <Button variant="quiet" aria-label={`Remove ${noun} ${i + 1}`} onClick={() => onRows(rows.filter((_, j) => j !== i), i)}>
              <Icon name="x" />
            </Button>
          )}
        </div>
      ))}
      {rows.length < EDIT_ROWS_MAX && (
        <div className="st-row">
          <Button variant="quiet" icon="plus" onClick={() => onRows([...rows, ""])}>
            Add {noun}
          </Button>
        </div>
      )}
    </fieldset>
  );
}

/** The /library/[id] page's client half: the same detail, and a delete that leaves for the Library. */
export function IdeaDetailPage({ idea, now, history }: { idea: LibraryIdea; now: number; history: IdeaHistory }) {
  const router = useRouter();
  return <IdeaDetail idea={idea} now={now} history={history} onDeleted={() => router.replace("/library")} />;
}
