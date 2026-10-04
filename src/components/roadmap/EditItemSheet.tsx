"use client";

/**
 * Edit one item, or a card measure's target (F9 "Edit"; final-roadmap-draft.html
 * G and H). Closed pickers for methods, bands, levels, checkpoint kinds and a
 * topic's Domain; free text only for titles and labels, capped at each
 * kind's limit. Changed words make the item EDITED (YOURS, "You wrote this");
 * the server re-runs the label checks (F6) and the engine (F4).
 *
 * Only what changed is sent. A plan-only edit of Gemini's words (sessions, a
 * band, a checkpoint's kind, bar or scale) makes the numbers the user's and
 * leaves the words Gemini's — the sheet says so, and the chip stays until the
 * words are edited or checked (the contract §9.3; R4's editItemCore keeps the
 * decision). Nothing changed: the sheet closes and sends nothing.
 *
 * On the device the label checks run as you type (roadmap-validate
 * checkLabel; an edited label is yours, so a flag here informs rather than
 * blocks), and a typed target gets its verdict from the engine's own figures
 * for that measure: ≤ expected Fits, ≤ best Tight, beyond Over, past the
 * spaced-repetition floor Impossible. A fitted target never gets a verdict.
 */
import { useId, useMemo, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Tabs";
import { IconButton } from "@/components/ui/Button";
import { ActionError } from "@/components/home/ActionError";
import {
  CHECKPOINT_KINDS,
  CHECKPOINT_LABEL_MAX,
  MILESTONE_TITLE_MAX,
  PRACTICE_BANDS,
  PRACTICE_METHODS,
  PRACTICE_NAME_MAX,
  SESSIONS_MAX,
  SESSIONS_MIN,
  STEP_TITLE_MAX,
  THRESHOLDS,
  TOPIC_LABEL_MAX,
  practiceBandMinutes,
  provenanceOf,
  type CheckpointKind,
  type ItemEdit,
  type KnowledgeCheck,
  type MeasureSpec,
  type MilestoneDraft,
  type PracticeBand,
  type PracticeMethod,
} from "@/lib/roadmap-types";
import { CHECKPOINT_KIND_WORD, EDIT_NUMBERS_NOTE, FLAG_WORD, METHOD_WORD, flagReasonLine, labelWithClass, levelGapPhrase, verdictWord } from "./roadmap-copy";
import { itemClassOf, typedTargetVerdict } from "./roadmap-ui-model";
import { useRoadmapAction } from "./roadmap-runtime";
import { GlyphButton, RoadmapGlyph } from "./RoadmapGlyph";
import { deviceLabelCheck, labelContextOf } from "./roadmap-labels";
import type { ActTarget, ItemEditorScope } from "./ItemEditor";

export { deviceLabelFlags, labelContextOf } from "./roadmap-labels";

const LABEL_MAX: Record<string, number> = {
  TITLE: MILESTONE_TITLE_MAX,
  TOPIC: TOPIC_LABEL_MAX,
  PRACTICE: PRACTICE_NAME_MAX,
  STEP: STEP_TITLE_MAX,
  CHECKPOINT: CHECKPOINT_LABEL_MAX,
};

/** A milestone named in a sheet's description, with its words' class when they are Gemini's. */
export function milestoneLineOf(m: Pick<MilestoneDraft, "ord" | "title" | "titleOrigin" | "titleDecision">): string {
  return `Milestone ${m.ord} · ${labelWithClass(m.title, provenanceOf(m.titleOrigin, m.titleDecision))}`;
}

/** The Edit sheet's fields (as opened, and as saved). */
export interface EditFields {
  text: string;
  method: PracticeMethod;
  sessions: number;
  band: PracticeBand;
  ckKind: CheckpointKind;
  bar: number | null;
  outOf: number | null;
  domainId: string;
}

/**
 * The edit to send: the label only when its words changed (or a placeholder is
 * named), and each plan field only when it differs from what the sheet opened
 * with. An empty edit sends nothing, so opening a sheet and saving it never
 * turns Gemini's words into the user's.
 */
export function itemEditOf(row: { kind: string; label: string; placeholder: boolean }, initial: EditFields, next: EditFields): ItemEdit {
  const edit: ItemEdit = {};
  if (next.text !== row.label || row.placeholder) edit.label = next.text;
  if (row.kind === "PRACTICE") {
    if (next.method !== initial.method) edit.method = next.method;
    if (next.sessions !== initial.sessions) {
      edit.sessionsPerWeek = next.sessions;
      edit.rule = ruleOfSessions(next.sessions);
    }
    if (next.band !== initial.band) edit.durationBand = next.band;
  }
  if (row.kind === "CHECKPOINT") {
    if (next.ckKind !== initial.ckKind) edit.checkpointKind = next.ckKind;
    if (next.bar != null && next.bar !== initial.bar) edit.bar = next.bar;
    if (next.outOf != null && next.outOf !== initial.outOf) edit.outOf = next.outOf;
  }
  if (row.kind === "TOPIC" && next.domainId && next.domainId !== initial.domainId) edit.domainId = next.domainId;
  return edit;
}

/** Whether a saved edit leaves Gemini's words as they were (a plan-only edit of Gemini's text). */
export function wordsStayGeminis(row: { origin: MilestoneDraft["titleOrigin"]; decision: MilestoneDraft["titleDecision"] }, edit: ItemEdit): boolean {
  const cls = itemClassOf(row);
  return (cls === "DRAFT" || cls === "KEPT_SUGGESTION") && edit.label === undefined;
}

function ruleOfSessions(n: number): string {
  return n >= 7 ? "DAILY" : `TARGET:${n}/W`;
}

function sessionsOfRule(rule: string | null, fallback: number | null): number {
  if (rule?.toUpperCase() === "DAILY") return 7;
  const m = /^TARGET:(\d+)\/W$/i.exec(rule ?? "");
  return m ? Number(m[1]) : (fallback ?? 2);
}

export function EditItemSheet({ target, scope, onClose }: { target: ActTarget | null; scope: ItemEditorScope; onClose: () => void }) {
  return (
    <Sheet open={target != null} onClose={onClose} title={target ? titleOf(target) : ""} description={target ? milestoneLineOf(target.milestone) : undefined}>
      {target && <EditBody key={target.row.id} target={target} scope={scope} onClose={onClose} />}
    </Sheet>
  );
}

function titleOf(t: ActTarget): string {
  switch (t.row.kind) {
    case "TITLE":
      return "Milestone title";
    case "PRACTICE":
      return t.row.placeholder ? "Name this practice" : "Practice";
    case "CHECKPOINT":
      return "Checkpoint";
    case "TOPIC":
      return "Topic";
    case "STEP":
      return "Step";
    default:
      return "Edit";
  }
}

function EditBody({ target, scope, onClose }: { target: ActTarget; scope: ItemEditorScope; onClose: () => void }) {
  const { row, item, milestone } = target;
  const ids = { label: useId(), bar: useId(), outOf: useId() };
  const { run, pending, error } = useRoadmapAction();
  const [initial] = useState<EditFields>(() => ({
    text: row.placeholder ? "" : row.label,
    method: item?.method ?? "DELIBERATE_PRACTICE",
    sessions: sessionsOfRule(item?.rule ?? null, item?.sessionsPerWeek ?? null),
    band: item?.durationBand ?? "D30",
    ckKind: item?.checkpointKind ?? "SELF_TEST",
    bar: item?.bar ?? null,
    outOf: item?.outOf ?? null,
    domainId: item?.domainId ?? "",
  }));
  const [label, setLabel] = useState(initial.text);
  const [method, setMethod] = useState<PracticeMethod>(initial.method);
  const [sessions, setSessions] = useState(initial.sessions);
  const [band, setBand] = useState<PracticeBand>(initial.band);
  const [ckKind, setCkKind] = useState<CheckpointKind>(initial.ckKind);
  const [bar, setBar] = useState(initial.bar != null ? String(initial.bar) : "");
  const [outOf, setOutOf] = useState(initial.outOf != null ? String(initial.outOf) : "");
  const [domainId, setDomainId] = useState(initial.domainId);
  const [problem, setProblem] = useState<string | null>(null);

  const max = LABEL_MAX[row.kind] ?? 80;
  const kind = row.kind === "TITLE" ? "MILESTONE" : row.kind;
  const check = useMemo(
    () => (label.trim() ? deviceLabelCheck(label, labelContextOf(scope, kind, milestone, row.kind === "PRACTICE" ? method : null)) : null),
    [label, scope, kind, milestone, row.kind, method]
  );
  const flags = check?.flags ?? [];
  const domains = milestone.items.filter((it) => it.kind === "DOMAIN" && it.domainId && it.decision !== "REMOVED");
  const text = label.replace(/\s+/g, " ").trim();
  const gemini = itemClassOf(row);
  // Plan fields on Gemini's words: the numbers become the user's, the words stay Gemini's (the contract §9.3).
  const numbersOnly = (gemini === "DRAFT" || gemini === "KEPT_SUGGESTION") && !row.placeholder && text === row.label;

  const save = () => {
    setProblem(null);
    if (!text) return setProblem("Write a few words first.");
    if (text.length > max) return setProblem(`At most ${max} characters.`);
    let b: number | null = null;
    let o: number | null = null;
    if (row.kind === "CHECKPOINT") {
      b = Number(bar);
      o = Number(outOf);
      if (!(o > 0) || !Number.isFinite(o)) return setProblem("Say what the score is out of (a number above 0).");
      if (!Number.isFinite(b) || b < 0 || b > o) return setProblem(`The bar is a score from 0 to ${o}.`);
    }
    const edit: ItemEdit = itemEditOf(row, initial, { text, method, sessions, band, ckKind, bar: b, outOf: o, domainId });
    if (Object.keys(edit).length === 0) return onClose();
    run(
      (a) => a.editItem(row.id, edit),
      () => onClose()
    );
  };

  return (
    <div className="rm-form">
      <div className="rm-f">
        <label className="st-label" htmlFor={ids.label}>
          {row.kind === "CHECKPOINT" ? "What you'll do to test yourself" : row.kind === "PRACTICE" ? "Name" : "Words"}
          <span className="rm-count">
            {label.length} / {max}
          </span>
        </label>
        <input id={ids.label} className="st-input" value={label} maxLength={max} onChange={(e) => setLabel(e.target.value)} data-autofocus autoComplete="off" />
        {row.placeholder && <p className="st-hint">Name this practice in your own words before it can go to Today.</p>}
        {flags.length > 0 && (
          <div className="rm-fact">
            <span className="t-eyebrow">The app&apos;s checks</span>
            {flags.map((f) => (
              <span key={f} style={{ display: "block" }}>
                <b className="ink-0">{FLAG_WORD[f]}</b> · {flagReasonLine(f, check?.reasons, { constraints: scope.constraints, milestoneOrd: milestone.ord, milestoneCount: scope.milestoneCount })}
              </span>
            ))}
            <span style={{ display: "block", marginTop: 4 }}>Saved as you wrote it, it becomes yours: you are its source.</span>
          </div>
        )}
      </div>

      {row.kind === "PRACTICE" && (
        <>
          <div className="rm-f">
            <span className="st-label">Method</span>
            <Segmented className="rm-seg-fill rm-seg-2" value={method} label="Method" onChange={setMethod} options={PRACTICE_METHODS.map((m) => ({ value: m, label: METHOD_WORD[m] }))} />
          </div>
          <div className="rm-f">
            <span className="st-label">Sessions a week</span>
            <div className="rm-step">
              <GlyphButton glyph="minus" label="One session less" onClick={() => setSessions((n) => Math.max(SESSIONS_MIN, n - 1))} />
              <input className="st-input" inputMode="numeric" aria-label="Sessions a week" value={sessions} onChange={(e) => setSessions(Math.max(SESSIONS_MIN, Math.min(SESSIONS_MAX, Number(e.target.value.replace(/\D/g, "")) || SESSIONS_MIN)))} />
              <IconButton icon="plus" label="One session more" onClick={() => setSessions((n) => Math.min(SESSIONS_MAX, n + 1))} />
              <span className="t-meta">
                {SESSIONS_MIN} to {SESSIONS_MAX} · {sessions >= 7 ? "every day" : `${sessions}× a week`}
              </span>
            </div>
          </div>
          <div className="rm-f">
            <span className="st-label">Each session</span>
            <Segmented className="rm-seg-fill" value={band} label="Minutes a session" onChange={setBand} options={PRACTICE_BANDS.map((b) => ({ value: b, label: `${practiceBandMinutes(b)}` }))} />
            <p className="st-hint">Minutes a session. The time check re-runs with your numbers when you save.</p>
          </div>
        </>
      )}

      {row.kind === "CHECKPOINT" && (
        <>
          <div className="rm-f">
            <span className="st-label">Kind</span>
            <Segmented className="rm-seg-fill" value={ckKind} label="Checkpoint kind" onChange={setCkKind} options={CHECKPOINT_KINDS.map((k) => ({ value: k, label: CHECKPOINT_KIND_WORD[k] }))} />
          </div>
          <div className="rm-f">
            <span className="st-label">Your bar</span>
            <div className="rm-step">
              <input id={ids.bar} className="st-input" inputMode="decimal" aria-label="Your bar" value={bar} onChange={(e) => setBar(e.target.value)} />
              <span className="t-meta">of</span>
              <input id={ids.outOf} className="st-input" inputMode="decimal" aria-label="Out of" value={outOf} onChange={(e) => setOutOf(e.target.value)} />
            </div>
            <p className="st-hint">The bar and the scale are yours. A score you log is context: it never moves your progress.</p>
          </div>
        </>
      )}

      {row.kind === "TOPIC" && domains.length > 1 && (
        <div className="rm-f">
          <span className="st-label">Domain</span>
          <div className="rm-dchips" role="group" aria-label="Domain">
            {domains.map((d) => (
              <button key={d.domainId} type="button" className="rm-dchip" aria-pressed={d.domainId === domainId} onClick={() => setDomainId(d.domainId ?? "")}>
                <b>{d.label}</b>
              </button>
            ))}
          </div>
        </div>
      )}

      {numbersOnly && (row.kind === "PRACTICE" || row.kind === "CHECKPOINT") && <p className="st-hint">{EDIT_NUMBERS_NOTE}</p>}
      {problem && <p className="t-error" role="alert">{problem}</p>}
      {error && <ActionError>{error}</ActionError>}
      <Button variant="primary" size="lg" block onClick={save} disabled={pending}>
        {pending ? "Saving…" : numbersOnly ? "Save your numbers" : "Save · it becomes yours"}
      </Button>
    </div>
  );
}

/** A card measure's typed target (F4 step 3, F9): level and target; the verdict from the engine's own figures. */
export function MeasureEditSheet({
  open,
  onClose,
  measure,
  check,
  milestone,
  m,
  scopeNames,
}: {
  open: boolean;
  onClose: () => void;
  measure: MeasureSpec;
  check: KnowledgeCheck | null;
  milestone: MilestoneDraft;
  m: number;
  scopeNames: string | null;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={`Cards at level ${measure.minLevel ?? ""}+`} description={milestoneLineOf(milestone)}>
      {open && <MeasureBody key={measure.id ?? measure.measureKey ?? "m"} milestoneId={milestone.id ?? milestone.lineageId} measure={measure} check={check} m={m} scopeNames={scopeNames} onClose={onClose} />}
    </Sheet>
  );
}

function MeasureBody({
  milestoneId,
  measure,
  check,
  m,
  scopeNames,
  onClose,
}: {
  milestoneId: string;
  measure: MeasureSpec;
  check: KnowledgeCheck | null;
  m: number;
  scopeNames: string | null;
  onClose: () => void;
}) {
  const id = useId();
  const { run, pending, error } = useRoadmapAction();
  const [level, setLevel] = useState(measure.minLevel ?? THRESHOLDS[0]);
  const [target, setTarget] = useState(String(measure.target));
  const [problem, setProblem] = useState<string | null>(null);
  const n = Number(target);
  const sameLevel = level === (measure.minLevel ?? level);
  const verdict = check && sameLevel && Number.isFinite(n) && n > 0 ? typedTargetVerdict(Math.floor(n), check) : null;
  const glyph = verdict === "FITS" ? "v-fits" : verdict === "TIGHT" ? "v-tight" : verdict === "OVER" ? "v-over" : verdict === "IMPOSSIBLE" ? "v-imp" : "v-fitted";

  const save = () => {
    if (!Number.isInteger(n) || n < 1) return setProblem("A target is a whole number of cards, 1 or more.");
    if (measure.baseline != null && n <= measure.baseline) return setProblem(`Above what you hold now (${measure.baseline}).`);
    run(
      // The milestone's own id addresses its card measure (a typed target never changes an item's decision).
      (a) => a.editItem(milestoneId, { target: n, minLevel: level }),
      () => onClose()
    );
  };

  return (
    <div className="rm-form">
      {scopeNames && <p className="t-meta">In {scopeNames}.</p>}
      <div className="rm-f">
        <span className="st-label">Level</span>
        <Segmented className="rm-seg-fill" value={String(level)} label="Level" onChange={(v) => {
            setProblem(null);
            setLevel(Number(v));
          }} options={THRESHOLDS.map((t) => ({ value: String(t), label: String(t) }))} />
        <p className="st-hint">
          Level {level}: {levelGapPhrase(level, m)}.
        </p>
      </div>
      <div className="rm-f">
        <label className="st-label" htmlFor={id}>
          Target
          {measure.fittedTarget != null && <span className="rm-opt">fitted: {measure.fittedTarget}</span>}
        </label>
        <input id={id} className="st-input rm-num" inputMode="numeric" value={target} onChange={(e) => {
            setProblem(null);
            setTarget(e.target.value.replace(/[^\d]/g, ""));
          }} />
      </div>
      {check && (
        <div className="sunk" style={{ padding: 12 }}>
          <div className="rm-ck-h">
            <b>Targets vs your pace</b>
            {verdict && (
              <span className={verdict === "IMPOSSIBLE" ? "rm-vd rm-vd-x" : verdict === "FITTED" ? "rm-vd rm-vd-q" : "rm-vd"}>
                <RoadmapGlyph name={glyph} />
                {verdictWord(verdict)}
              </span>
            )}
          </div>
          <p className="t-meta rm-ink1" style={{ marginTop: 6 }}>
            {!sameLevel
              ? "A different level is checked when you save."
              : verdict === "IMPOSSIBLE"
                ? `Past the floor: even with lucky gaps, about ${Math.floor(check.strictMax)} can reach level ${level} in time. Move the date or use a lower level.`
                : verdict === "OVER"
                  ? `Beyond the best case: even if every review passes on its day, about ${Math.floor(check.best)} reach level ${level}.`
                  : verdict === "TIGHT"
                    ? `Only in the best case: your reviews can be expected to bring about ${Math.floor(check.expected)} to level ${level}; ${Math.floor(check.best)} if every review passes on its day.`
                    : verdict === "FITTED"
                      ? "The target the app fitted: no verdict, since one would be true by construction."
                      : `Within what your reviews can be expected to bring to level ${level} (about ${Math.floor(check.expected)}).`}
          </p>
          {verdict === "OVER" && <p className="t-meta">Kept over, it needs “Keep it over my hours/pace” before Accept, and shows a quiet “Over” chip for good.</p>}
        </div>
      )}
      {problem && <p className="t-error" role="alert">{problem}</p>}
      {error && <ActionError>{error}</ActionError>}
      <Button variant="primary" size="lg" block onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save · it becomes yours"}
      </Button>
    </div>
  );
}
