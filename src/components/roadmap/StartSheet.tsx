"use client";

/**
 * The Start sheet (F15; final-roadmap.html G), computed by code before
 * anything is created (loadStartPreview → startPreview → refitForStart):
 *
 *   Today's check   "Target 20 was fitted when you accepted; fitted today it
 *                   would be 14 …" with [Use 14] (re-fitted) and [Keep 20 —
 *                   Over] (needs the Over switch, stored); the time check re-run.
 *   Still to decide this milestone's PENDING items, in the same row grammar.
 *   What goes to Today  the goal title, each practice, each step, the
 *                   checkpoint label and the milestone's Domains. A row in
 *                   Gemini's words offers [I checked this] and [Edit]; a Domain
 *                   Gemini picked, [I checked this] and [Map to…]; a placeholder
 *                   practice, [Edit]. Start is offered only when every one is
 *                   YOURS or WORKED_OUT.
 *   Practices       each a Switch, on by default (off when the same name is
 *                   already on Today from an earlier milestone). Each name,
 *                   and each step below, is looked up in the milestone's
 *                   items: Gemini's words keep their chip and struck numbers
 *                   here too (the contract §11.3).
 *   Pay             the stated line, recomputed on every practice switch with
 *                   the arithmetic finishStartCore freezes (startPayOf), the
 *                   Mid-goal limit line, each practice's price.
 *   Week quests if you start now  the generator's set for the rest of this
 *                   life week, "fixed for the week once you start".
 *
 * Revision 4 (F-R4-13): when the stated pay rests on a practice the app added
 * (without it the milestone would fall under the practice gate) the sheet
 * says so ("… because of the practice the app added (Explain it in your own
 * words). Switch it off and this milestone pays nothing."), and a body
 * milestone's sheet carries HEALTH_LINE.
 *
 * Start is hidden (not disabled) while ROADMAP_GOALS_LIVE is false. The sticky
 * button is never dead: until Start can be offered it jumps to the next row to
 * check.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import { CurrencyGlyph } from "@/components/ui/Icon";
import { Switch } from "@/components/ui/Tabs";
import { pushToast } from "@/components/ui/toast-store";
import { ActionError } from "@/components/home/ActionError";
import {
  WEEK_QUEST_EVIDENCE_OF,
  provenanceOf,
  type MilestoneDraft,
  type StartChoices,
  type StartPracticeRow,
  type StartPreview,
  type TodayBoundRow,
  type WeekQuestSet,
} from "@/lib/roadmap-types";
import {
  CHECKPOINT_KIND_WORD,
  HEALTH_LINE,
  PROVENANCE_WORDS,
  TIME_FIXED_LINE,
  WEEK_QUEST_CAPTIONS,
  dayWithWeekday,
  givesRankByName,
  labelWithClass,
  plural,
  restsOnAddedLine,
  ruleWords,
  spanLabel,
  statedLine,
  windowLabel,
} from "./roadmap-copy";
import { canMapOf, editorRowOf, rowDomId, startPayOf, titleItemOf, type EditorRow, type ItemAction } from "./roadmap-ui-model";
import { useRoadmapAction, useRoadmapRuntime } from "./roadmap-runtime";
import { useItemEditor, type ActTarget } from "./ItemEditor";
import { ItemRow, StruckLabel, useDisplayLabel } from "./ItemRow";
import { PaysLine } from "./PaysLine";
import { VerdictChip, timeSentence } from "./ChecksPanel";
import { ProvenanceChip, TitleClassChip } from "./ProvenanceChip";
import { FlagChips, FlagReasons } from "./FlagChips";
import { milestoneLineOf } from "./EditItemSheet";

const TODAY_KIND_WORD: Readonly<Record<TodayBoundRow["kind"], string>> = {
  TITLE: "Mid goal",
  PRACTICE: "Practice",
  STEP: "Step",
  CHECKPOINT: "Checkpoint",
  DOMAIN: "Domain",
};

const NEEDS: Readonly<Record<TodayBoundRow["needs"], { why: string | null; actions: ItemAction[] }>> = {
  NONE: { why: null, actions: [] },
  CHECK_OR_EDIT: { why: "Gemini's words — goes to Today as written.", actions: ["CHECK", "EDIT"] },
  CHECK_OR_MAP: { why: "Gemini picked this Domain — it sets what counts.", actions: ["CHECK", "MAP"] },
  NAME_IT: { why: "Name this practice.", actions: ["EDIT"] },
};

/** "2 cards", "3 sessions": a preview count, with its unit. */
function previewCount(q: WeekQuestSet["quests"][number]): string {
  if (q.kind === "CHECKPOINT") return "log a score";
  const words: Record<string, [string, string]> = { card: ["card", "cards"], session: ["session", "sessions"], day: ["day", "days"], step: ["step", "steps"], log: ["score", "scores"] };
  const [one, many] = words[q.unit] ?? ["", ""];
  return `${q.count} ${q.count === 1 ? one : many}`;
}

/** The practice the stated pay rests on, when the app added it (R4's StartPreview.pay.restsOnAdded; the contract §15.11). */
export function restsOnAddedOf(p: Pick<StartPreview, "pay">): string | null {
  const name = p.pay.restsOnAdded;
  return typeof name === "string" && name.trim().length > 0 ? name : null;
}

/** The Today-bound rows' remaining count (Start waits on these). */
export function rowsToCheck(p: Pick<StartPreview, "todayRows">): TodayBoundRow[] {
  return p.todayRows.filter((r) => r.needs !== "NONE");
}

/**
 * What a Today-bound row offers: a NUMBER row (Gemini wrote a number, an item
 * or the title) offers only Edit — never "I checked this", which would put
 * Gemini's number on Today as the goal's words; Map to… only with the user's
 * Domains on the page.
 */
export function todayRowActionsOf(needs: TodayBoundRow["needs"], flags: readonly string[], canMap: boolean): ItemAction[] {
  let out = [...NEEDS[needs].actions];
  if (flags.includes("NUMBER")) out = out.filter((a) => a !== "CHECK");
  if (!canMap) out = out.filter((a) => a !== "MAP");
  return out;
}

function TodayRowView({ row, milestone }: { row: TodayBoundRow; milestone: MilestoneDraft }) {
  const editor = useItemEditor();
  const item = row.itemId ? (milestone.items.find((it) => it.id === row.itemId) ?? null) : null;
  const target: ActTarget = item ? { row: editorRowOf(item), item, milestone } : { row: titleItemOf(milestone), item: null, milestone };
  const needs = NEEDS[row.needs];
  const actions = todayRowActionsOf(row.needs, target.row.flags, canMapOf(editor?.scope.library));
  const shown = useDisplayLabel(target.row, milestone, editor?.scope, item?.method);
  const kindLabel = row.kind === "CHECKPOINT" && item?.checkpointKind ? `Checkpoint · ${CHECKPOINT_KIND_WORD[item.checkpointKind]}` : TODAY_KIND_WORD[row.kind];
  const cls = row.class;
  return (
    <div id={rowDomId(target.row.id)} className={cls === "DRAFT" ? "rm-it rm-it-draft" : cls === "KEPT_SUGGESTION" ? "rm-it rm-it-kept" : "rm-it"}>
      <div className="rm-it-k">{kindLabel}</div>
      <p className="rm-it-l">
        <StruckLabel label={row.label} struck={row.label === target.row.label ? shown.struck : undefined} />
      </p>
      <div className="rm-it-chips">
        {item ? <ProvenanceChip origin={item.origin} decision={item.decision} /> : <ProvenanceChip origin={milestone.titleOrigin} decision={milestone.titleDecision} />}
        <FlagChips flags={target.row.flags} />
      </div>
      <FlagReasons flags={target.row.flags} ctx={{ constraints: editor?.scope.constraints ?? null, milestoneOrd: milestone.ord, milestoneCount: editor?.scope.milestoneCount }} reasons={shown.reasons} />
      {needs.why && <p className="rm-it-why">{needs.why}</p>}
      {actions.length > 0 && (
        <div className="rm-acts">
          {actions.map((a) => (
            <ChipButton key={a} onClick={() => editor?.act(target, a)}>
              {a === "CHECK" ? "I checked this" : a === "MAP" ? "Map to…" : "Edit"}
            </ChipButton>
          ))}
        </div>
      )}
      {editor?.errorFor(target.row.id) && <ActionError>{editor.errorFor(target.row.id)}</ActionError>}
    </div>
  );
}

/**
 * An item's words echoed on the sheet outside its own row (the Practices
 * switches, the Steps list; the contract §11.3): looked up by its id in the
 * milestone, shown as written with its NUMBER spans struck (the server's, else
 * the device's re-check), and Gemini's words with their chip. A name that no
 * longer matches the item's label is shown plain (nothing to strike against).
 */
export function useEchoedItem(milestone: MilestoneDraft, itemId: string, label: string) {
  const editor = useItemEditor();
  const item = milestone.items.find((it) => it.id === itemId) ?? null;
  const row = useMemo<EditorRow>(
    () =>
      item
        ? editorRowOf(item)
        : { id: itemId, kind: "STEP", label, origin: "USER", decision: "EDITED", flags: [], domainId: null, proposed: false, placeholder: false },
    [item, itemId, label]
  );
  const shown = useDisplayLabel(row, milestone, editor?.scope, item?.method);
  const cls = item ? provenanceOf(item.origin, item.decision) : null;
  return { cls, struck: item && label === item.label ? shown.struck : undefined };
}

function EchoedLabel({ milestone, itemId, label }: { milestone: MilestoneDraft; itemId: string; label: string }) {
  const { cls, struck } = useEchoedItem(milestone, itemId, label);
  return (
    <>
      <p className="rm-it-l">
        <StruckLabel label={label} struck={struck} />
      </p>
      {(cls === "DRAFT" || cls === "KEPT_SUGGESTION") && (
        <div className="rm-it-chips">
          <TitleClassChip cls={cls} />
        </div>
      )}
    </>
  );
}

function PracticeSwitchRow({ pr, milestone, off, onToggle }: { pr: StartPracticeRow; milestone: MilestoneDraft; off: boolean; onToggle: () => void }) {
  const { cls } = useEchoedItem(milestone, pr.itemId, pr.name);
  const named = labelWithClass(pr.name, cls);
  return (
    <div className={cls === "DRAFT" ? "rm-it rm-it-draft" : cls === "KEPT_SUGGESTION" ? "rm-it rm-it-kept" : "rm-it"}>
      <EchoedLabel milestone={milestone} itemId={pr.itemId} label={pr.name} />
      <div className="rm-it-m">
        {ruleWords(pr.rule)} · {pr.minutes} min
        {pr.price != null && (
          <>
            {" · ≈ "}
            <span className="cur">
              <CurrencyGlyph kind="xp" />
              <span className="num">{pr.price.toFixed(1)}</span>
            </span>{" "}
            a session
          </>
        )}
      </div>
      {pr.alreadyOnToday && (
        <p className="rm-it-why">
          {named} is already on Today (from Milestone {pr.alreadyOnToday.fromOrd}).
        </p>
      )}
      <div className="rm-sw" style={{ marginTop: 4 }}>
        <span className="rm-sw-t">{off ? "Not added: its sessions leave the plan's practice part" : "Add to Today"}</span>
        <Switch checked={!off} onChange={onToggle} label={`Add ${named} to Today`} />
      </div>
    </div>
  );
}

/** The sheet's practice switches, each with its words' class (the Start sheet's "Practices"). */
export function StartPractices({
  practices,
  milestone,
  isOff,
  onToggle,
}: {
  practices: readonly StartPracticeRow[];
  milestone: MilestoneDraft;
  isOff: (lineageId: string) => boolean;
  onToggle: (lineageId: string) => void;
}) {
  return (
    <>
      {practices.map((pr) => (
        <PracticeSwitchRow key={pr.lineageId} pr={pr} milestone={milestone} off={isOff(pr.lineageId)} onToggle={() => onToggle(pr.lineageId)} />
      ))}
    </>
  );
}

/** The steps going to Today, each as written with its words' class (never a bare joined line). */
export function StartSteps({ steps, milestone }: { steps: readonly { itemId: string; title: string }[]; milestone: MilestoneDraft }) {
  return (
    <ul className="rm-oi-list" aria-label="Steps going to Today">
      {steps.map((s) => (
        <li key={s.itemId} className="rm-oi">
          <EchoedLabel milestone={milestone} itemId={s.itemId} label={s.title} />
        </li>
      ))}
    </ul>
  );
}

function WeekQuestPreview({ set, today }: { set: WeekQuestSet; today: string }) {
  if (set.quests.length === 0) return <p className="t-meta">No week quests this week: {set.basis[0] ?? "nothing is asked of it"}.</p>;
  const from = set.quests[0].from;
  const to = set.quests[0].to;
  return (
    <>
      <div className="rm-quest">
        {set.quests.map((q) => (
          <div key={q.ord} className="rm-quest-row">
            <span aria-hidden="true" />
            <span className="rm-q-lbl">{q.label}</span>
            <span className="rm-q-cnt num">{previewCount(q)}</span>
            <p className="rm-q-ev">{q.kind === "CHECKPOINT" ? WEEK_QUEST_CAPTIONS.CHECKPOINT : WEEK_QUEST_EVIDENCE_OF[q.kind] === "TESTED" ? PROVENANCE_WORDS.MEASURED : WEEK_QUEST_CAPTIONS[q.kind]}</p>
          </div>
        ))}
      </div>
      <p className="t-meta">{windowLabel(from, to, today)} · fixed for the week once you start. Worked out from your cards and the plan; they pay nothing.</p>
    </>
  );
}

export function StartSheet({
  open,
  onClose,
  milestone,
  today,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  milestone: MilestoneDraft;
  today: string;
  /** A preview already in hand (fixtures); otherwise it loads when the sheet opens. */
  initial?: StartPreview | null;
}) {
  const runtime = useRoadmapRuntime();
  const editor = useItemEditor();
  const [preview, setPreview] = useState<StartPreview | null>(initial ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [target, setTarget] = useState<StartChoices["target"]>("FITTED_NOW");
  const [over, setOver] = useState(false);
  const [off, setOff] = useState<Set<string>>(new Set());
  const { run, pending, error } = useRoadmapAction();

  const load = useCallback(() => {
    if (!milestone.id || initial) return;
    runtime.actions
      .loadStartPreview(milestone.id)
      .then((res) => {
        if (res.ok) {
          setPreview(res.value);
          setLoadError(null);
        } else setLoadError(res.error);
      })
      .catch(() => setLoadError("The Start sheet didn't load. Try again."));
  }, [milestone.id, initial, runtime.actions]);

  // Load when opened, and again whenever the milestone's rows change (a decision taken on the sheet).
  useEffect(() => {
    if (open) load();
  }, [open, load, milestone]);

  // Practices already on Today from an earlier milestone start switched off.
  const initialOff = useMemo(() => new Set((preview?.practices ?? []).filter((p) => !p.on).map((p) => p.lineageId)), [preview]);
  const isOff = (lineage: string) => off.has(lineage) !== initialOff.has(lineage);

  const p = preview;
  const toCheck = p ? rowsToCheck(p) : [];
  const keepOver = p?.todayCheck && target === "STORED";
  // The pay line for the switches as they stand now: the figure finishStartCore freezes into the goal (startPayOf).
  const offNow = p ? p.practices.filter((x) => isOff(x.lineageId)).map((x) => x.lineageId) : [];
  const pay = p ? startPayOf(p, offNow, milestone.items) : null;

  const start = () => {
    if (!p || !milestone.id) return;
    if (keepOver && !over) return;
    const choices: StartChoices = {
      target: p.todayCheck ? target : "STORED",
      overAccepted: Boolean(keepOver && over),
      practicesOff: offNow,
      rules: {},
      decisions: {},
      edits: {},
    };
    run(
      (a) => a.startMilestone(milestone.id!, choices),
      () => {
        pushToast({ title: `Milestone ${p.ord} started`, body: "It is a Mid goal on Today now, with its practices and steps." });
        onClose();
      }
    );
  };

  const jump = () => {
    const first = toCheck[0];
    if (!first) return;
    const item = first.itemId ? milestone.items.find((it) => it.id === first.itemId) : null;
    const id = item ? (item.id ?? item.lineageId) : (milestone.id ?? milestone.lineageId);
    document.getElementById(rowDomId(id))?.scrollIntoView({ block: "center" });
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Start milestone ${milestone.ord}`} description={`${milestoneLineOf(milestone)} · ${spanLabel(milestone.windowStart, milestone.dueDay, today)}`}>
      {!p && !loadError && <p className="t-meta">Working out today&apos;s check…</p>}
      {loadError && <ActionError>{loadError}</ActionError>}
      {p && (
        <div className="rm-form" style={{ gap: 0 }}>
          {p.refusal && (
            <p className="t-error" role="alert">
              {p.refusal}
            </p>
          )}
          {(milestone.notes.includes("HEALTH_LINE") || (editor?.scope.areaFieldId == null && editor?.scope.track === "BODY")) && <p className="rm-it-why">{HEALTH_LINE}</p>}
          <span className="t-eyebrow rm-sheet-eyebrow">Today&apos;s check</span>
          <div className="sunk" style={{ padding: 12 }}>
            {p.todayCheck ? (
              <>
                <p className="t-meta rm-ink1">{p.todayCheck.reason}</p>
                <div className="rm-acts">
                  <ChipButton pressed={target === "FITTED_NOW"} onClick={() => setTarget("FITTED_NOW")}>
                    Use {p.todayCheck.fittedNow}
                  </ChipButton>
                  <ChipButton pressed={target === "STORED"} onClick={() => setTarget("STORED")}>
                    Keep {p.todayCheck.stored} — Over
                  </ChipButton>
                </div>
                {keepOver && (
                  <div className="rm-sw" style={{ marginTop: 8 }}>
                    <span className="rm-sw-t">Keep it over my hours/pace</span>
                    <Switch checked={over} onChange={setOver} label="Keep it over my hours/pace" />
                  </div>
                )}
              </>
            ) : (
              <p className="t-meta rm-ink1">The target fitted when you accepted still fits today&apos;s cards and pace.</p>
            )}
            <div className="rm-ck" style={{ paddingBottom: 0 }}>
              <div className="rm-ck-h">
                <b>App-tracked time</b>
                <VerdictChip verdict={p.feasibility.time.verdict} unverified={p.feasibility.time.unverified} />
              </div>
              <p>{timeSentence(p.feasibility.time)}</p>
              <p className="rm-ck-fixed">{TIME_FIXED_LINE}</p>
            </div>
          </div>

          {p.pending.length > 0 && (
            <>
              <span className="t-eyebrow rm-sheet-eyebrow">Still to decide</span>
              {p.pending.map((it) => (
                <ItemRow key={it.id ?? it.lineageId} target={{ row: editorRowOf(it), item: it, milestone }} stage="start" kindLabel={it.kind.charAt(0) + it.kind.slice(1).toLowerCase()} />
              ))}
            </>
          )}

          <span className="t-eyebrow rm-sheet-eyebrow">What goes to Today</span>
          {p.todayRows.map((r) => (
            <TodayRowView key={`${r.kind}-${r.itemId ?? "title"}`} row={r} milestone={milestone} />
          ))}

          {p.practices.length > 0 && (
            <>
              <span className="t-eyebrow rm-sheet-eyebrow">Practices</span>
              <StartPractices
                practices={p.practices}
                milestone={milestone}
                isOff={isOff}
                onToggle={(lineage) => setOff((s) => new Set(s.has(lineage) ? [...s].filter((x) => x !== lineage) : [...s, lineage]))}
              />
            </>
          )}

          {p.steps.length > 0 && (
            <>
              <span className="t-eyebrow rm-sheet-eyebrow">Steps</span>
              <StartSteps steps={p.steps} milestone={milestone} />
            </>
          )}

          <span className="t-eyebrow rm-sheet-eyebrow">Pay</span>
          <p className="t-meta rm-ink1">
            Becomes a Mid goal on Today, due {dayWithWeekday(p.dueDay, today)} · <PaysLine text={statedLine(pay!.stated, pay!.zeroReason, pay!.paidOn, today)} />
            {pay!.stated > 0 ? ", once 21 days old" : ""} · progress from your records, no +1
          </p>
          {restsOnAddedOf(p) && pay!.stated > 0 && <p className="t-meta rm-ink1">{restsOnAddedLine(pay!.stated, restsOnAddedOf(p) as string)}</p>}
          {p.pay.limitLine && <p className="t-meta">{p.pay.limitLine}</p>}
          <p className="rm-rk">{givesRankByName(p.givesRank)}</p>

          {p.weekQuests && (
            <>
              <span className="t-eyebrow rm-sheet-eyebrow">Week quests if you start now</span>
              <WeekQuestPreview set={p.weekQuests} today={today} />
            </>
          )}

          <div className="rm-sticky rm-static" style={{ marginTop: 8 }}>
            {!p.goalsLive ? (
              <p className="t-meta">Starting milestones arrives with the next update.</p>
            ) : p.canStart && !p.refusal ? (
              <>
                <Button variant="primary" size="lg" onClick={start} disabled={pending}>
                  {pending ? "Starting…" : `Start milestone ${p.ord}`}
                </Button>
                {keepOver && !over && <p className="t-meta">Turn on “Keep it over my hours/pace” to keep {p.todayCheck?.stored}.</p>}
              </>
            ) : toCheck.length > 0 ? (
              <>
                <Button variant="primary" size="lg" onClick={jump}>
                  Next row to check
                </Button>
                <p className="t-meta">Start is offered when every row going to Today is yours or written by the app · {plural(toCheck.length, "row")} left.</p>
              </>
            ) : (
              <p className="t-meta">{p.blockers[0] ?? p.refusal ?? "Start isn't offered yet."}</p>
            )}
            {error && <ActionError>{error}</ActionError>}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** Whether a Today-bound row's class lets it reach Today (YOURS or WORKED_OUT). */
export function todayBoundOk(origin: Parameters<typeof provenanceOf>[0], decision: Parameters<typeof provenanceOf>[1]): boolean {
  const c = provenanceOf(origin, decision);
  return c === "YOURS" || c === "WORKED_OUT";
}
