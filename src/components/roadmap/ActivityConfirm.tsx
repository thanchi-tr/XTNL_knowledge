"use client";

/**
 * Constraint safety: confirm to unlock (lane R5; contracts §19). Every body
 * or care plan asks once, whatever the user wrote, and a craft plan asks when
 * its words carry a cue or can't be read: until the user answers here, every
 * plan path places only the track's own easy kinds (easy, mobility and
 * technique sessions; planning the week and keeping a log; the technique
 * session). This is where they answer:
 *
 *   "Your words mention “Running causes me knee pain”. Which activities
 *   should the plan avoid?" (with nothing to quote: "Before the plan adds
 *   harder or longer sessions, it asks once."), one box per session type;
 *   a box the user's words suggest comes pre-ticked, quoting them ("From
 *   your words: “…”"; a suggestion never leaves anything out by itself);
 *   after the words changed, "You answered on 3 Oct, before your words
 *   changed."; the plan's line while it waits; HEALTH_LINE.
 *
 * Answering is an explicit act (the lead's decision 1): with a box ticked the
 * button is [Save my answers], and the line beside it says what Save leaves
 * out and what the plan may then include; with nothing ticked it is [Nothing
 * to avoid]. Save with nothing ticked is never offered, and an unticked row
 * is never sent as "fine". Both send the card's answer (ActivityCardAnswer)
 * with the key of the words it was shown against: words changed meanwhile
 * (another tab, another device) are refused, the page re-reads, and the card
 * asks again (decision 3). Once answered the card shrinks to what the user
 * said ("You said to avoid: Strength session (5 Oct)." or "You said there's
 * nothing to avoid (5 Oct)."), with [Change], for the life of the plan. When
 * an answer takes a started practice off Today (decision 4, R4's reply
 * `paused`), a quiet toast says so, with Undo.
 *
 * UI motion (lane R7; ui-motion.md §3.3 screen 8, §7.8, D11, D12, D13): a
 * safety surface, static at every level. The consent text stays word for
 * word: the lead line (the user's words quoted once, data-wc="own"), the
 * question, the stale line, the plan's line led by the track's sigil,
 * activitySaveLine beside the button, the buttons, and the answered
 * summary's two lines. Only repetition and the how-to paragraph move:
 *   - each row is [checkbox] [sess.* glyph] + the session name; a ticked row
 *     strikes its glyph and adds the word "avoid"; a row whose box the user's
 *     words pre-ticked adds [m.quote]. The row's own line ("From your words:
 *     “…”", "Not ticked on 3 Oct, before your words changed", "You said to
 *     avoid it on 2 Jan") is read once, as its checkbox's description, from
 *     the card Key, where a touch user opens it (no sr-only copy, no `title`);
 *   - HEALTH_LINE is one chip per card, «Not medical advice · ask a
 *     professional», a button that opens the line itself;
 *   - ACTIVITY_HOW_LINE (or the intake's) sits behind an (i), which opens at
 *     once here ([data-safety]: glyph-motion never moves anything inside);
 *   - the answered summary names each kind beside its session glyph (struck:
 *     avoided; with a check: the plan can include it).
 * Nothing here plays a motion: only the kit checkbox changes state. The card
 * carries data-safety, data-fx="none" (no shader) and data-wc-block
 * "activities" (the §3.2 row 8 budgets).
 *
 * Places: the draft review and the living roadmap (ActivityConfirmCard), the
 * Start sheet (its "start" variant), and the intake (IntakeActivities: the
 * answer is confirmed on the form and saved right after the intake, before
 * the plan is built). Nothing here is red, and nothing reads a cue as a
 * diagnosis or calls a session safe.
 */
import { useId, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { pushToast } from "@/components/ui/toast-store";
import { ActionError } from "@/components/home/ActionError";
import { Glyph, Mark, type MarkRef } from "@/components/glyph/Glyph";
import { Chips, HonestyChip } from "@/components/glyph/HonestyChip";
import { CardKey, InfoTip, type KeyEntry } from "@/components/glyph/InfoTip";
import { GLYPH_MEANS } from "@/components/glyph/paths/means";
import { SESSION_KEY, type SessionName } from "@/components/glyph/paths/session";
import type { DayKey } from "@/lib/life-day";
import type { ActivityCardAnswer, ActivityConfirmView, ActivityRow } from "@/lib/roadmap-types";
import { ACTIVITY_ANSWER_STALE, ACTIVITY_CARD_NAME, ACTIVITY_NOTHING_TO_AVOID, type CatalogKey } from "@/lib/roadmap-catalog";
import {
  ACTIVITY_CHANGE_WORD,
  ACTIVITY_CONFIRMED_LINE,
  ACTIVITY_CONFIRM_WORD,
  ACTIVITY_HOW_LINE,
  ACTIVITY_INTAKE_HOW_LINE,
  ACTIVITY_NOT_PAUSED_TITLE,
  ACTIVITY_PAUSED_TITLE,
  ACTIVITY_QUESTION,
  ACTIVITY_REPLAN_LINE,
  ACTIVITY_SAVED_LINE,
  ACTIVITY_SAVE_WORD,
  ACTIVITY_UNREAD_LINE,
  HEALTH_LINE,
  KIND_NAME,
  SHORT_AVOID,
  SHORT_HEALTH,
  TRACK_SIGIL,
  activityLeadLine,
  activityNotPausedLine,
  activityPausedLine,
  activityPendingLine,
  activityRowLine,
  activitySaveLine,
  activityStaleLine,
  activitySuggestedLine,
  activitySummaryLines,
  dayLabel,
} from "./roadmap-copy";
import { activityAsksOf, activityAvoidOf, activityCardAnswerOf, activityCardOf, activityNothingToAvoidOf, activityOpenOf, notPausedOfReply, pausedOfReply, rowsAnsweredBy } from "./roadmap-ui-model";
import { useRoadmapAction, type RoadmapRuntime } from "./roadmap-runtime";
import { notePauseSeen } from "./roadmap-pauses";
import "./roadmap.css";

/** The card's DOM id ("Next item to decide" and the Start sheet's pointer land here). */
export const ACTIVITY_DOM_ID = "rm-activities";

/** A body or care plan's card carries HEALTH_LINE ("Not medical advice …"), and so does a craft plan's that asks (its words name a strain or a pain). */
export function activityHealthOf(v: { track: string; on?: boolean }): boolean {
  return v.track === "BODY" || v.track === "CARE" || (v.track === "CRAFT" && v.on === true);
}

// ─── The glyphs (ui-motion.md §4.4: session kinds, safety marks) ────────────

/** Each catalog kind's session glyph (paths/session SESSION_KEY, inverted); a kind with no session glyph draws none. */
const SESSION_OF: ReadonlyMap<string, SessionName> = new Map(Object.entries(SESSION_KEY).map(([glyph, kind]) => [kind, glyph as SessionName]));

/** The glyph a kind draws beside its name, if it has one. */
export function activityGlyphOf(kind: CatalogKey): SessionName | null {
  return SESSION_OF.get(kind) ?? null;
}

/** The sigil that leads the plan's line ("[s-body] Easy, mobility and technique practice only until you confirm."). */
function sigilOf(track: string): MarkRef {
  return track === "BODY" || track === "CARE" || track === "CRAFT" || track === "DUTY" ? `s-${TRACK_SIGIL[track]}` : "s-know";
}

/** The row's line quotes the user's words (its box came pre-ticked from them): it shows [m.quote]. */
export function activityQuotesRow(r: Pick<ActivityRow, "state" | "prefill" | "reason">): boolean {
  return r.reason.trim().length > 0 && (r.state === "WORDS" || (r.prefill === "AVOID" && r.state === "PENDING"));
}

// ─── Lines with the user's words and the kinds' names marked ────────────────

type LinePart = { t: "text"; s: string } | { t: "own"; s: string } | { t: "name"; s: string; kind: CatalogKey | null; tail: string };

/**
 * A line split into the app's words, the user's quoted words (“…”, kept with
 * the punctuation right after them) and the kinds' names (kept with theirs),
 * so each part can be marked for the word count and drawn with its glyph,
 * while the rendered text reads exactly as the line.
 */
export function activityLineParts(text: string, names: readonly { name: string; kind: CatalogKey | null }[] = []): LinePart[] {
  const byLength = [...names].filter((n) => n.name).sort((a, b) => b.name.length - a.name.length);
  const out: LinePart[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", s: buf });
    buf = "";
  };
  const letter = (c: string | undefined) => c != null && /[\p{L}\p{N}]/u.test(c);
  let i = 0;
  while (i < text.length) {
    if (text[i] === "“") {
      const end = text.indexOf("”", i + 1);
      if (end > i) {
        let j = end + 1;
        while (j < text.length && /[.,;:]/.test(text[j])) j++;
        flush();
        out.push({ t: "own", s: text.slice(i, j) });
        i = j;
        continue;
      }
    }
    const hit = letter(text[i - 1]) ? undefined : byLength.find((n) => text.startsWith(n.name, i) && !letter(text[i + n.name.length]));
    if (hit) {
      let j = i + hit.name.length;
      while (j < text.length && /[.,;:]/.test(text[j])) j++;
      flush();
      out.push({ t: "name", s: hit.name, kind: hit.kind, tail: text.slice(i + hit.name.length, j) });
      i = j;
      continue;
    }
    buf += text[i];
    i++;
  }
  flush();
  return out;
}

/** A line as activityLineParts reads it: the user's words data-wc="own", each name data-wc="name" with its glyph (struck when avoided, with a check when the plan can include it). */
function MarkedLine({ text, names, mark }: { text: string; names?: readonly { name: string; kind: CatalogKey | null }[]; mark?: "avoid" | "in" }) {
  return (
    <>
      {activityLineParts(text, names).map((p, i) => {
        if (p.t === "text") return p.s;
        if (p.t === "own")
          return (
            <span key={i} data-wc="own">
              {p.s}
            </span>
          );
        const g = p.kind ? activityGlyphOf(p.kind) : null;
        return (
          <span key={i} className="rm-avd-nm" data-wc="name">
            {mark && g && (
              <span className="rm-avd-gl" aria-hidden="true">
                <Glyph name={g} struck={mark === "avoid"} size={16} inherit />
                {mark === "in" && (
                  <span className="rm-avd-ok">
                    <Glyph name="safe.in" size={12} inherit />
                  </span>
                )}
              </span>
            )}
            {p.s}
            {p.tail}
          </span>
        );
      })}
    </>
  );
}

/** The kinds a card names (for MarkedLine): every row's name, with its kind. */
function namesOf(rows: readonly Pick<ActivityRow, "kind">[]): { name: string; kind: CatalogKey }[] {
  return rows.map((r) => ({ name: KIND_NAME[r.kind] ?? r.kind, kind: r.kind }));
}

// ─── The open card ──────────────────────────────────────────────────────────

/** The id of a row's checkbox and of its line in the card Key (the checkbox's description): `${base}-${i}` and `${base}-${i}-w`. */
function rowId(base: string, i: number): string {
  return `${base}-${i}`;
}

/**
 * The list of boxes: each ticked box is a kind to avoid. A row is its
 * checkbox, its session glyph (struck once ticked) and its name (a name:
 * data-wc="name"), then the visible word "avoid" while ticked and [m.quote]
 * on a row the user's words pre-ticked. The row's line is its description,
 * read from the card Key (ActivityKey), never repeated under the row.
 */
function AvoidList({ rows, avoid, onToggle, today, disabled, base }: { rows: readonly ActivityRow[]; avoid: ReadonlySet<CatalogKey>; onToggle: (k: CatalogKey) => void; today?: DayKey; disabled?: boolean; base: string }) {
  return (
    <ul className="rm-avd-list">
      {rows.map((r, i) => {
        const id = rowId(base, i);
        const line = activityRowLine(r, today);
        const on = avoid.has(r.kind);
        const glyph = activityGlyphOf(r.kind);
        return (
          <li key={r.kind} className="rm-avd-row rm-avd-r" data-state={r.state} data-avoid={on ? "" : undefined}>
            <div className="rm-avd-lb" data-wc="name">
              <label className="rm-avd-hit">
                <input id={id} type="checkbox" className="rm-avd-box" checked={on} disabled={disabled} onChange={() => onToggle(r.kind)} aria-describedby={line ? `${id}-w` : undefined} />
                <span className="rm-avd-n">{KIND_NAME[r.kind] ?? r.kind}</span>
                {glyph && (
                  <span className="rm-avd-g" aria-hidden="true">
                    <Glyph name={glyph} state={on ? "idle" : "active"} struck={on} size={20} inherit />
                  </span>
                )}
              </label>
            </div>
            {on && (
              <span className="rm-avd-av" aria-hidden="true">
                {SHORT_AVOID}
              </span>
            )}
            {activityQuotesRow(r) && (
              <span className="rm-avd-qm" aria-hidden="true">
                <Glyph name="m.quote" size={16} inherit />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function useAvoid(rows: readonly ActivityRow[]) {
  const initial = useMemo(() => activityAvoidOf(rows), [rows]);
  const [avoid, setAvoid] = useState<ReadonlySet<CatalogKey>>(() => new Set(initial));
  const toggle = (k: CatalogKey) => setAvoid((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : new Set([...s, k])));
  const reset = () => setAvoid(new Set(initial));
  return { avoid, toggle, reset };
}

/** The ticks that count: the boxes on the card's rows (a kind hidden by the exam or practice filter is never sent). */
function tickedOf(rows: readonly ActivityRow[], avoid: ReadonlySet<CatalogKey>): number {
  return rows.filter((r) => avoid.has(r.kind)).length;
}

/** The question: the user's quoted words (or, with none, what the plan asks before), then "Which activities should the plan avoid?" (one legend for the boxes). */
function Question({ view, today }: { view: ActivityConfirmView; today?: DayKey }) {
  const stale = activityAsksOf(view) ? activityStaleLine(view.staleDay, today) : null;
  return (
    <>
      <legend className="rm-avd-q">
        <MarkedLine text={activityLeadLine(view.quotes, view.track)} /> {ACTIVITY_QUESTION}
      </legend>
      {stale && <p className="rm-avd-m rm-ink1">{stale}</p>}
      {view.unparseable && <p className="rm-avd-m">{ACTIVITY_UNREAD_LINE}</p>}
    </>
  );
}

/** The health chip (D12): one per card, its visible label keeping the instruction; the chip opens HEALTH_LINE itself. */
function HealthChip() {
  return (
    <Chips className="rm-avd-chips">
      <HonestyChip kind="health" label={SHORT_HEALTH} full={HEALTH_LINE} wrap />
    </Chips>
  );
}

/** The lines under the boxes: what the plan places meanwhile (while it asks, led by the track's sigil), the suggestions still placed, the health chip. */
function OpenLines({ view, health }: { view: ActivityConfirmView; health: boolean }) {
  const words = view.rows.filter((r) => r.state === "WORDS");
  const suggested = activitySuggestedLine(words.map((r) => KIND_NAME[r.kind] ?? r.kind));
  return (
    <>
      {activityAsksOf(view) && (
        <p className="rm-avd-p rm-avd-pl">
          <Mark glyph={sigilOf(view.track)} size={16} />
          <span>{activityPendingLine(view.safeKinds)}</span>
        </p>
      )}
      {suggested && (
        <p className="rm-avd-m">
          <MarkedLine text={suggested} names={namesOf(words)} />
        </p>
      )}
      {health && <HealthChip />}
    </>
  );
}

/**
 * The card Key (D13) and the how-to (i): each glyph the card draws with its
 * words, and each row's own line, which its checkbox reads as its
 * description (the span's id is the row's `-w`), so a touch user reads it by
 * opening the Key and a screen reader hears it once. On a safety surface
 * both open at once.
 */
function CardTips({ rows, today, base, how }: { rows: readonly ActivityRow[]; today?: DayKey; base: string; how: string }) {
  const lines = rows.map((r, i) => ({ r, i, line: activityRowLine(r, today) })).filter((x): x is { r: ActivityRow; i: number; line: string } => x.line != null);
  const glyphs = rows.some((r) => activityGlyphOf(r.kind) != null);
  const entries: KeyEntry[] = [...(glyphs ? [{ glyph: "safe.strike" as const, words: GLYPH_MEANS["safe.strike"] }] : []), ...(rows.some(activityQuotesRow) ? [{ glyph: "m.quote" as const, words: GLYPH_MEANS["m.quote"] }] : [])];
  return (
    <div className="rm-avd-tips">
      <InfoTip topic="how to answer">{how}</InfoTip>
      <CardKey
        entries={entries}
        rows={lines.map(({ r, i, line }) => (
          <>
            <b data-wc="name">{KIND_NAME[r.kind] ?? r.kind}</b> <span id={`${rowId(base, i)}-w`}>{line}</span>
          </>
        ))}
      />
    </div>
  );
}

/**
 * The answer's button, never a Save with nothing ticked (the lead's decision
 * 1): [Save my answers] (or the intake's [Confirm these]) with a box ticked,
 * [Nothing to avoid] with none; the line beside it says what the act does.
 */
function AnswerActs({ ticked, listed, pending, saveWord, onSave, onNothing, onCancel }: { ticked: number; listed: number; pending?: boolean; saveWord: string; onSave: () => void; onNothing: () => void; onCancel?: () => void }) {
  const line = activitySaveLine(ticked, listed);
  return (
    <>
      {line && (
        <p className="rm-avd-m rm-ink1" aria-live="polite">
          {line}
        </p>
      )}
      <div className="rm-acts">
        {ticked > 0 ? (
          <Button variant="primary" disabled={pending} onClick={onSave}>
            {pending ? "Saving…" : saveWord}
          </Button>
        ) : (
          <Button variant="primary" disabled={pending} onClick={onNothing}>
            {pending ? "Saving…" : ACTIVITY_NOTHING_TO_AVOID}
          </Button>
        )}
        {onCancel && (
          <Button variant="quiet" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </>
  );
}

/** The answered card's lines: the user's answer and what the plan may now include; "You answered on …" when nothing else shows. */
function summaryOf(view: Pick<ActivityConfirmView, "rows" | "answered" | "none">, today?: DayKey): string[] {
  const lines = activitySummaryLines(view, today);
  if (lines.length === 0 && view.answered) return [`You answered on ${dayLabel(view.answered, today)}.`];
  return lines;
}

/** The answered summary, verbatim: each name beside its session glyph, struck on "You said to avoid:", with a check on "The plan can include:". */
function SummaryLines({ lines, rows }: { lines: readonly string[]; rows: readonly Pick<ActivityRow, "kind">[] }) {
  const names = namesOf(rows);
  return (
    <>
      {lines.map((l) => (
        <p key={l} className="rm-avd-m rm-ink1">
          <MarkedLine text={l} names={names} mark={l.startsWith("You said to avoid:") ? "avoid" : l.startsWith("The plan can include:") ? "in" : undefined} />
        </p>
      ))}
    </>
  );
}

/** The safety surface's own box inside each place's wrapper: static (data-safety), no shader (data-fx), its words counted as §3.2 row 8 (data-wc-block). */
function SafetyBox({ children }: { children: ReactNode }) {
  return (
    <div className="rm-avd-c" data-safety="" data-fx="none" data-wc-block="activities">
      {children}
    </div>
  );
}

/**
 * After a save: the toast (with Re-plan when an ACTIVE plan's unstarted
 * milestones change), and, when the answer took started practices off Today
 * (decision 4), a quiet toast naming them with Undo (the existing
 * unarchiveTask, history kept). What happened to each task is noted for the
 * roadmap's rows (roadmap-pauses; the lead's ruling 3): taken off Today,
 * still on Today (R4's `notPaused`), and, once its Undo lands, back on Today.
 */
export function announceActivitySaved(reply: unknown, roadmapId: string, runtime: Pick<RoadmapRuntime, "actions" | "refresh">, onReplan?: () => void) {
  const replan = Boolean(reply && typeof reply === "object" && (reply as { replan?: unknown }).replan === true);
  if (replan && onReplan) pushToast({ title: "Answers saved", body: ACTIVITY_REPLAN_LINE, action: { label: "Re-plan", onAction: onReplan } });
  else pushToast({ title: "Answers saved", body: ACTIVITY_SAVED_LINE });
  const notPaused = notPausedOfReply(reply);
  const paused = pausedOfReply(reply);
  notePauseSeen(roadmapId, [...notPaused.map((p) => ({ templateId: p.templateId, seen: "NOT_PAUSED" as const })), ...paused.map((p) => ({ templateId: p.templateId, seen: "PAUSED" as const }))]);
  const stuck = activityNotPausedLine(notPaused.map((p) => p.title));
  if (stuck) pushToast({ key: `rm-not-paused:${roadmapId}`, title: ACTIVITY_NOT_PAUSED_TITLE, body: stuck, holdMs: 10000 });
  const body = activityPausedLine(paused.map((p) => p.title));
  if (paused.length === 0 || !body) return;
  pushToast({
    key: `rm-paused:${roadmapId}`,
    title: ACTIVITY_PAUSED_TITLE,
    body,
    holdMs: 10000,
    action: {
      label: "Undo",
      onAction: () =>
        void Promise.all(paused.map((p) => runtime.actions.unarchiveTask(p.templateId).catch(() => ({ ok: false as const, error: "That didn't go through." }))))
          .then((all) => {
            // Only a task whose unarchive landed is back on Today; the others stay paused (their rows keep saying so).
            notePauseSeen(roadmapId, paused.filter((_, i) => all[i]?.ok).map((p) => ({ templateId: p.templateId, seen: "UNDONE" as const })));
            const failed = all.find((r) => !r.ok);
            if (failed && !failed.ok) pushToast({ title: "Not back on Today", body: failed.error });
          })
          .finally(() => runtime.refresh()),
    },
  });
}

/**
 * The confirm card on the draft review, the living roadmap ("plan") and the
 * Start sheet ("start"). It asks while rows wait (or suggestions wait on an
 * answer); otherwise it shows what the user said, with [Change]. Null when
 * there is nothing to show.
 */
export function ActivityConfirmCard({
  view,
  roadmapId,
  today,
  place,
  onReplan,
}: {
  view: ActivityConfirmView | null | undefined;
  roadmapId: string;
  today?: DayKey;
  place: "draft" | "plan" | "start";
  /** An ACTIVE plan's Re-plan (the save's toast offers it when the answers change milestones not started yet). */
  onReplan?: () => void;
}) {
  // A save refused because the words changed meanwhile: said once the page re-reads (the list below is the new words').
  const [staleRefused, setStaleRefused] = useState(false);
  const card = activityCardOf(view);
  if (!card) return null;
  return (
    <ActivityCardBody
      key={`${roadmapId}:${card.key}:${card.rows.map((r) => `${r.kind}.${r.state}.${r.day ?? ""}`).join(",")}`}
      view={card}
      roadmapId={roadmapId}
      today={today}
      place={place}
      onReplan={onReplan}
      staleRefused={staleRefused}
      setStaleRefused={setStaleRefused}
    />
  );
}

function ActivityCardBody({
  view,
  roadmapId,
  today,
  place,
  onReplan,
  staleRefused,
  setStaleRefused,
}: {
  view: ActivityConfirmView;
  roadmapId: string;
  today?: DayKey;
  place: "draft" | "plan" | "start";
  onReplan?: () => void;
  staleRefused: boolean;
  setStaleRefused: (v: boolean) => void;
}) {
  const base = useId();
  const opens = activityOpenOf(view);
  const [editing, setEditing] = useState(false);
  const { avoid, toggle, reset } = useAvoid(view.rows);
  const { run, pending, error, setError, runtime } = useRoadmapAction();
  // The Start sheet of a body plan carries HEALTH_LINE already (once per sheet).
  const health = activityHealthOf(view) && !(place === "start" && view.track === "BODY");
  const open = opens || editing;
  const Wrap = place === "start" ? "div" : "section";
  const wrapClass = place === "start" ? "sunk rm-avd rm-avd-in" : "card rm-avd";
  const role = place === "start" ? "group" : undefined;

  if (!open) {
    return (
      <Wrap className={wrapClass} id={place === "start" ? undefined : ACTIVITY_DOM_ID} role={role} aria-label={ACTIVITY_CARD_NAME}>
        <SafetyBox>
          <div className="rm-avd-sum">
            <SummaryLines lines={summaryOf(view, today)} rows={view.rows} />
            <button type="button" className="rm-ilink" onClick={() => setEditing(true)} aria-label="Change which activities the plan avoids">
              {ACTIVITY_CHANGE_WORD}
            </button>
          </div>
          {health && <HealthChip />}
        </SafetyBox>
      </Wrap>
    );
  }

  // The card's answer, with the key of the words on screen (refused, and asked again, when they changed meanwhile).
  const send = (answer: ActivityCardAnswer) =>
    run(
      async (a) => {
        const res = await a.setActivityVerdicts(roadmapId, answer);
        if (!res.ok && res.error.includes(ACTIVITY_ANSWER_STALE)) {
          setStaleRefused(true);
          runtime.refresh();
        }
        return res;
      },
      (reply) => {
        setStaleRefused(false);
        setEditing(false);
        announceActivitySaved(reply, roadmapId, runtime, onReplan);
      }
    );
  const save = () => {
    const answer = activityCardAnswerOf(view, avoid);
    if (answer) send(answer);
  };
  const cancel = () => {
    reset();
    setError(null);
    setEditing(false);
  };

  return (
    <Wrap className={wrapClass} id={place === "start" ? undefined : ACTIVITY_DOM_ID} role={role} aria-label={ACTIVITY_CARD_NAME}>
      <SafetyBox>
        <fieldset className="rm-avd-set" disabled={pending}>
          <Question view={view} today={today} />
          <AvoidList rows={view.rows} avoid={avoid} onToggle={toggle} today={today} base={base} />
        </fieldset>
        <OpenLines view={view} health={health} />
        {staleRefused && !error && (
          <p className="rm-avd-m rm-ink1" role="status">
            {ACTIVITY_ANSWER_STALE}
          </p>
        )}
        <AnswerActs
          ticked={tickedOf(view.rows, avoid)}
          listed={view.rows.length}
          pending={pending}
          saveWord={ACTIVITY_SAVE_WORD}
          onSave={save}
          onNothing={() => send(activityNothingToAvoidOf(view))}
          onCancel={editing && !opens ? cancel : undefined}
        />
        {error && <ActionError>{error}</ActionError>}
        <CardTips rows={view.rows} today={today} base={base} how={ACTIVITY_HOW_LINE} />
      </SafetyBox>
    </Wrap>
  );
}

/**
 * The intake's card (a body, care or craft track Area): the same question and
 * boxes as the plan's, run on the form as typed. [Confirm these] (a box
 * ticked) or [Nothing to avoid] records the user's answer on the form, with
 * the key of the words it was given against (`keyNow`); the form saves it
 * right after the intake (setActivityVerdicts), before the plan is built.
 * Words changed since: it asks again here, and a key the server no longer
 * holds is refused and asked again on the draft. An open draft's stored
 * answer shows as said, with [Change]. Nothing here unlocks without the
 * user's tap.
 */
export function IntakeActivities({
  view,
  keyNow,
  confirmed,
  onConfirm,
  today,
}: {
  view: ActivityConfirmView;
  /** The key the answer would be given against now (cueKeyOf the form's words). */
  keyNow: string;
  confirmed: ActivityCardAnswer | null;
  onConfirm: (a: ActivityCardAnswer | null) => void;
  today?: DayKey;
}) {
  const card = activityCardOf(view);
  if (!card) return null;
  return <IntakeActivitiesBody key={`${keyNow}:${card.rows.map((r) => `${r.kind}.${r.state}`).join(",")}`} view={card} keyNow={keyNow} confirmed={confirmed} onConfirm={onConfirm} today={today} />;
}

function IntakeActivitiesBody({ view, keyNow, confirmed, onConfirm, today }: { view: ActivityConfirmView; keyNow: string; confirmed: ActivityCardAnswer | null; onConfirm: (a: ActivityCardAnswer | null) => void; today?: DayKey }) {
  const base = useId();
  const { avoid, toggle, reset } = useAvoid(view.rows);
  const [editing, setEditing] = useState(false);
  const fresh = confirmed != null && confirmed.key === keyNow;
  const opens = activityOpenOf(view) && !fresh;
  const health = activityHealthOf(view);
  if (!opens && !editing) {
    // Confirmed on this form (not saved yet), or the open draft's stored answer.
    const rows = fresh ? rowsAnsweredBy(view.rows, confirmed) : view.rows;
    const lines = fresh ? activitySummaryLines({ rows, answered: null, none: confirmed.nothingToAvoid }, today) : summaryOf(view, today);
    return (
      <div className="sunk rm-avd rm-avd-in" id="rm-f-activities" role="group" aria-label={ACTIVITY_CARD_NAME}>
        <SafetyBox>
          <div className="rm-avd-sum">
            {fresh && <p className="rm-avd-m rm-ink1">{ACTIVITY_CONFIRMED_LINE}</p>}
            <SummaryLines lines={lines} rows={rows} />
            <button type="button" className="rm-ilink" onClick={() => setEditing(true)} aria-label="Change which activities the plan avoids">
              {ACTIVITY_CHANGE_WORD}
            </button>
          </div>
          {health && <HealthChip />}
        </SafetyBox>
      </div>
    );
  }
  const confirm = (answer: ActivityCardAnswer | null) => {
    if (!answer) return;
    onConfirm(answer);
    setEditing(false);
  };
  return (
    <div className="sunk rm-avd rm-avd-in" id="rm-f-activities">
      <SafetyBox>
        <fieldset className="rm-avd-set">
          <Question view={view} today={today} />
          <AvoidList rows={view.rows} avoid={avoid} onToggle={toggle} today={today} base={base} />
        </fieldset>
        <OpenLines view={view} health={health} />
        <AnswerActs
          ticked={tickedOf(view.rows, avoid)}
          listed={view.rows.length}
          saveWord={ACTIVITY_CONFIRM_WORD}
          onSave={() => confirm(activityCardAnswerOf({ key: keyNow, rows: view.rows }, avoid))}
          onNothing={() => confirm(activityNothingToAvoidOf({ key: keyNow }))}
          onCancel={
            editing && !opens
              ? () => {
                  reset();
                  setEditing(false);
                }
              : undefined
          }
        />
        <CardTips rows={view.rows} today={today} base={base} how={ACTIVITY_INTAKE_HOW_LINE} />
      </SafetyBox>
    </div>
  );
}
