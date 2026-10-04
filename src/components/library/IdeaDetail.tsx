"use client";

/**
 * One idea, as the Library's sheet and the /library/[id] page show it:
 * question and answer, the level ring (mastery is a fixed target: 12),
 * next due, the history strip from the life ledger, Edit (text formats)
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
import { countClozeBlanks, parseCloze, type IdeaContent } from "@/lib/idea-payload";
import { shortAnswerProblem } from "@/lib/short-answer";
import { ShortAnswerOptions } from "./ShortAnswerOptions";
import { MASTERY_LEVEL } from "@/lib/xp";
import { MathText } from "@/components/math/MathText";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { SegmentStrip } from "@/components/ui/Meter";
import { PromiseRing } from "@/components/ui/PromiseRing";
import { Skeleton } from "@/components/ui/Tabs";
import {
  COLLECTION_NAME,
  EDITABLE_TYPES,
  TYPE_NAME,
  clozeTemplate,
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

/** Edit in place, text formats only (EDITABLE_TYPES). A correction: no points, no dedup, level and history untouched. */
function IdeaEditForm({ idea, onCancel, onSaved }: { idea: LibraryIdea; onCancel: () => void; onSaved: () => void }) {
  const qId = useId();
  const aId = useId();
  const cloze = idea.questionType === "CLOZE";
  const [question, setQuestion] = useState(cloze ? "" : idea.question);
  const [answer, setAnswer] = useState(cloze ? "" : idea.answer);
  const [caseSensitive, setCaseSensitive] = useState(idea.answerCaseSensitive);
  const [text, setText] = useState(cloze ? clozeTemplate(idea.question, idea.answer) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const content: IdeaContent | null = cloze
    ? text.trim() && countClozeBlanks(text) > 0
      ? { type: "CLOZE", text }
      : null
    : question.trim() && answer.trim() && !shortAnswerProblem(answer)
      ? { type: "SHORT", question, answer, caseSensitive }
      : null;

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

  return (
    <form
      className="idea-edit"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {cloze ? (
        <div>
          <label className="st-label" htmlFor={qId}>
            Sentence
          </label>
          <textarea id={qId} className="st-input" rows={4} value={text} onChange={(e) => setText(e.target.value)} data-autofocus />
          {text.trim() && countClozeBlanks(text) === 0 ? (
            <p className="st-hint">No blanks yet: wrap the part to recall in {"{{double braces}}"}.</p>
          ) : (
            text.trim() && (
              <div className="add-preview">
                <span className="t-eyebrow">Reviewer sees</span>
                {parseCloze(text).blanked}
              </div>
            )
          )}
        </div>
      ) : (
        <>
          <div>
            <label className="st-label" htmlFor={qId}>
              Question
            </label>
            <textarea id={qId} className="st-input" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} data-autofocus />
          </div>
          <div>
            <label className="st-label" htmlFor={aId}>
              Answer
            </label>
            <textarea id={aId} className="st-input" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} />
            <ShortAnswerOptions answer={answer} caseSensitive={caseSensitive} onCaseSensitive={setCaseSensitive} />
          </div>
        </>
      )}
      <p className="st-note">A correction: level, due date and history stay as they are, and nothing is paid.</p>
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

/** The /library/[id] page's client half: the same detail, and a delete that leaves for the Library. */
export function IdeaDetailPage({ idea, now, history }: { idea: LibraryIdea; now: number; history: IdeaHistory }) {
  const router = useRouter();
  return <IdeaDetail idea={idea} now={now} history={history} onDeleted={() => router.replace("/library")} />;
}
