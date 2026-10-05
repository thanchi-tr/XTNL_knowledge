"use client";

/**
 * One milestone of a draft (F9; final-roadmap-draft.html). The next
 * milestone (the first not yet started) is expanded and decided now; later
 * ones are an outline, decided at their Start.
 *
 * UI motion (lane R4; ui-motion.md §3.3 screen 3, §7.3; "fewer words, more
 * motion"). The words a card needs to decide stay on screen; the explaining
 * sentences move one tap away (the card Key in its heading, the stage-why
 * (i), the checks' (i), each row's ▸) and stay in the DOM:
 *
 *   Expanded (data-wc-block="next-card", ≤ 120 app words on draft-v4):
 *     [1] title · its mark (or its own row: «Gemini · not checked», flags, Keep / Edit)
 *     [m.builds] Recall first (i: what it builds on and what closes it)
 *     [t.cal] Sun 4 Oct → Sun 20 Dec · 11 weeks [pv.app]   (sr "dates set by the app")
 *     gives Aim rank [rank.2 active] Journeyman             (a rank not yet held keeps its verb)
 *     the checks (R5's ChecksPanel): [ev.tested] Targets [Fits], CapacityGauge need ≈ 3 h 20 · have ≈ 4 h 30 /wk
 *       [v.fits] Fits ("Unverified · Fits" while calibrating), its (i) with every sentence and TIME_FIXED_LINE,
 *       Why, «Aim not checked» · Add a figure, the remedies when a verdict blocks
 *     one «Not medical advice · ask a professional» on a body card (D12)
 *     [s-know] Learn: target meters "[ev.tested] Probability 18 → 34 · L6+" (their verdicts are the checks'
 *       Targets row), Domains "42 · 18 at L6+ [L5]", topics
 *     [sigil] Practise · [quest.step] Steps · [quest.checkpoint] Checkpoint «context only»
 *     rows in one grammar (ItemRow), "+ Add" (AddItemSheet), bulk keep with its (i)
 *   Outline (data-wc-block="outline-node", ≤ 12 app words each): a collapsed node —
 *     [3] [stage.retained] title «Gemini · not checked» [quest.practice]2 [quest.step]2 ▸
 *     whose ▸ holds the stage, the dates, the rank it gives, its verdicts and measure lines,
 *     the items in the same row grammar, "+ Add" and "decide when you start it". The summary
 *     keeps the who-word of what it folds (Gemini's rows, a waiting pick), a blocking flag on
 *     the title with its reason beside it, and a count of the rows a flag holds back.
 *
 * The full strings are kept where the checks and the screen readers find
 * them: "dates set by the app", "Reaching it gives the Aim rank …" (the Key),
 * "Hold 43 cards at level 6+ in … (now 28)" and "worked out on Gemini's
 * suggested Domains (not checked)" (each measure's spoken line), the section
 * names and their captions (sr-only beside the short heads, and in the Key).
 * Nothing on the card moves on its own; the rows' one motion is pv-confirm.
 *
 * Before the UI motion round: "Keep this milestone's unflagged suggestions"
 * (absent for credential and non-English aims; never a global keep-all; it
 * makes items KEPT_SUGGESTION, never YOURS). Revision 4 (F-R4-10, F-R4-17,
 * F-R4-21): on a keys-only draft the title is code's, one card measure per
 * Domain ("multiple choice not counted"), no Keep and no bulk keep, outline
 * lines can be moved and tied to another Domain, Gemini's Domain additions
 * are decided once in the plan-level row, and a stage held when you began is
 * a one-line node that gives no rank. The practice progression (contracts
 * §20): each card's stage-why line in code's words, and Gemini's pick reads
 * as its choice among the stage's options.
 */
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { ActionError } from "@/components/home/ActionError";
import { Glyph, Mark, type MarkRef } from "@/components/glyph/Glyph";
import { HonestyChip, VerdictChip as GlyphVerdictChip } from "@/components/glyph/HonestyChip";
import { CardKey, InfoTip, type KeyEntry } from "@/components/glyph/InfoTip";
import { Fig } from "@/components/glyph/GlyphStat";
import type { TrackSigil } from "@/components/glyph/paths";
import { daysBetween } from "@/lib/life-day";
import {
  AIM_RANKS,
  parseMeasureKey,
  provenanceOf,
  type AimCheck,
  type Intensity,
  type ItemDraft,
  type KnowledgeCheck,
  type MeasureSpec,
  type MilestoneDraft,
  type MilestoneFeasibility,
  type Throughput,
} from "@/lib/roadmap-types";
import type { CatalogTrack } from "@/lib/roadmap-catalog";
import {
  CHECKPOINT_KIND_WORD,
  CREDENTIAL_LINE,
  GEMINI_CHOICE_WORDS,
  HEALTH_LINE,
  MILESTONE_NOTE_LINE,
  PARAGON_PARTS,
  PROVENANCE_WORDS,
  SHORT_CONTEXT_ONLY,
  SHORT_GEMINI,
  SHORT_GEMINI_GUESS,
  SHORT_GEMINI_KEPT,
  SHORT_GIVES_RANK,
  SHORT_HEALTH,
  SHORT_KEEPS_RANK,
  SHORT_SECTION,
  SHORT_YOURS,
  basisClassNote,
  catalogProvenanceWords,
  dayLabel,
  heldRowLine,
  levelGapPhrase,
  rankLineParts,
  plural,
  shortBar,
  shortGeminiChoice,
  spanLabel,
  stageWhyPartsOf,
  stageWords,
} from "./roadmap-copy";
import {
  bulkKeepCountOf,
  canMapOf,
  editorRowOf,
  healthChipShown,
  isHeldMilestone,
  isPendingAddition,
  itemActionsOf,
  itemClassOf,
  measureDomainClassOf,
  catalogSlotOf,
  rowDomId,
  scopeNamesOf,
  stageGlyphOf,
  titleItemOf,
  type LibraryDomain,
  type RankPlanEntry,
  type StageWhy,
} from "./roadmap-ui-model";
import { useRoadmapAction } from "./roadmap-runtime";
import { ItemRow, MilestoneTitleText, StruckLabel, trackSigilOf, useDisplayLabel } from "./ItemRow";
import { GeminiChip, ProvenanceChip, provMarkOf, provMarkWords } from "./ProvenanceChip";
import { FlagChips, FlagReasons } from "./FlagChips";
import { useItemEditor, type ActTarget } from "./ItemEditor";
import { ChecksPanel } from "./ChecksPanel";
import { DomainItemRow, SetTheBar } from "./DomainRow";
import { TopicRow, type OutlineMoves } from "./TopicRow";
import { PracticeRow } from "./PracticeRow";
import { MeasureEditSheet } from "./EditItemSheet";
import { AddItemBar } from "./AddItemSheet";

export interface MilestoneCardContext {
  roadmapId: string;
  today: string;
  intensity: Intensity;
  m: number;
  /** The plan's last day (the last milestone "ends on your date"). */
  targetDay: string;
  /** Revision 4: the plan's date is the app's realistic date, never called the user's ("ends on the date the app set"). */
  dateByApp?: boolean;
  domainIndex: ReadonlyMap<string, LibraryDomain | { id: string; name: string }>;
  credentialNoSyllabus: boolean;
  bulkKeepOff: boolean;
  throughput: Throughput | null;
  hoursPerWeek: number;
  milestoneCount: number;
  /**
   * The intake can still be edited (a DRAFT roadmap): the checks' "Add a
   * figure" and "Change your hours" link to it. An ACTIVE roadmap's re-plan
   * has no editable intake, so its checks open the figure sheet instead.
   */
  intakeEditable?: boolean;
  /** Revision 4: a keys-only draft (no Keep, no bulk keep; outline lines movable; additions decided once, above). */
  keysOnly?: boolean;
  /** A keys-only draft's outline lines: where they can move and the Domains they can be tied to. */
  moves?: OutlineMoves | null;
  /** A BODY track plan: its card carries the one health chip (D12). */
  body?: boolean;
  /**
   * Constraint safety (contracts §19): while the plan waits on the user's
   * answer about activities, "Easy, mobility and technique practice only
   * until you confirm." (a care plan's "Planning the week and keeping a log
   * only until you confirm.", a craft plan's "Technique practice only …")
   * under Practise, verbatim; null otherwise.
   */
  practiceOnly?: string | null;
  /**
   * The practice progression (contracts §20): each stage's why by lineage
   * (roadmap-ui-model stageWhysOf over the plan's milestones) and the plan's
   * catalog track that words it. Absent: no why line (a rev-3 draft).
   */
  whys?: ReadonlyMap<string, StageWhy> | null;
  catalogTrack?: CatalogTrack;
}

/**
 * A stage's "why this stage" line under its title (contracts §20): what its
 * practice is for, in bold, then what it builds on and what closes it. Code's
 * words only (roadmap-copy stageWhyPartsOf); nothing with nothing to say.
 * (The living roadmap's Now still shows it whole; the draft's cards use
 * CompactWhy.)
 */
export function StageWhyLine({ why, track }: { why: StageWhy | null | undefined; track: CatalogTrack | null | undefined }) {
  const parts = why && track ? stageWhyPartsOf(why, track) : [];
  if (parts.length === 0) return null;
  return (
    <div className="rm-ms-w rm-ms-why">
      <b>{parts[0]}</b>
      {parts.slice(1).map((p) => ` · ${p}`).join("")}
    </div>
  );
}

/**
 * The why line, compact (§3.3 screen 3: "[m.builds] Recall first"): the focus
 * in bold; what it builds on and what closes it behind the stage-why (i),
 * whose panel continues the same line (so the line reads whole, in one
 * element, wherever it is read as text).
 */
export function CompactWhy({ why, track }: { why: StageWhy | null | undefined; track: CatalogTrack | null | undefined }) {
  const parts = why && track ? stageWhyPartsOf(why, track) : [];
  if (parts.length === 0) return null;
  const tail = parts.slice(1);
  return (
    <div className="rm-ms-w rm-ms-why">
      <Mark glyph="m.builds" size={14} />
      <b>{parts[0]}</b>
      {tail.length > 0 && <InfoTip topic="what this stage builds on">{tail.map((p) => ` · ${p}`).join("")}</InfoTip>}
    </div>
  );
}

const KIND_ORDER = ["DOMAIN", "TOPIC", "PRACTICE", "STEP", "CHECKPOINT"] as const;

function isLibrary(d: LibraryDomain | { id: string; name: string } | undefined): d is LibraryDomain {
  return Boolean(d && "cards" in d);
}

function weeksOf(m: MilestoneDraft): number | null {
  if (!m.windowStart || !m.dueDay) return null;
  return Math.max(1, Math.round((daysBetween(m.windowStart, m.dueDay) + 1) / 7));
}

/** A card measure's key segment (revision 4): `r` counts recall cards only, `rc` also clean entry; none on a rev-3 key. */
export function measureSegmentOf(measureKey: string | null): "r" | "rc" | null {
  const p = measureKey ? parseMeasureKey(measureKey) : null;
  return p?.kind === "CARDS_AT_LEVEL" ? (p.segment ?? null) : null;
}

/**
 * A card measure as a target meter (§3.3: "18 → 34 · L6+" with its [ev.tested]
 * badge; its verdict beside it in an outline node, where no checks panel
 * shows the Targets row). Its full sentence is its spoken line — "Hold 34
 * cards at level 6+ in Probability (now 18)", with the Gemini note when the
 * Domains are Gemini's — and the caption (the gap, the basis) is in its ▸.
 * The Gemini note stays visible as its chip (the who-word, D25).
 */
function MeasureLine({ measure, milestone, ctx, check, verdict = true, children }: { measure: MeasureSpec; milestone: MilestoneDraft; ctx: MilestoneCardContext; check: KnowledgeCheck | null; verdict?: boolean; children?: ReactNode }) {
  const names = scopeNamesOf(measure.scope.domainIds ?? [], ctx.domainIndex);
  const level = measure.minLevel ?? 0;
  const baseline = measure.baseline ?? check?.baseline ?? null;
  const cls = measureDomainClassOf(milestone, measure.scope.domainIds);
  const note = basisClassNote(cls);
  const segment = measureSegmentOf(measure.measureKey);
  const sentence = `Hold ${measure.target} cards at level ${level}+ in ${names ?? "this milestone's Domains"}${baseline != null ? ` (now ${baseline})` : ""}`;
  const caption = [
    levelGapPhrase(level, ctx.m),
    "tested by your reviews once started",
    measure.targetSource === "YOURS" ? "your target" : measure.targetSource === "DEPTH" ? "the depth" : null,
    segment ? "multiple choice not counted" : null,
    segment === "rc" ? "a card that got there on a retry counts after its next review" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="rm-mr rm-r4-mr">
      <div className="rm-r4-mh">
        <Mark glyph="ev.tested" size={14} />
        <span className="rm-r4-mv" aria-hidden="true">
          {names && <span data-wc="name">{names}</span>}
          <span className="num">{baseline != null ? `${baseline} → ${measure.target}` : `${measure.target}`}</span>
          <span className="num">· L{level}+</span>
        </span>
        <span className="sr-only">
          <b>{sentence}</b>
          {note ? ` · ${note}` : ""}
        </span>
        {verdict && check && <GlyphVerdictChip verdict={check.verdict} />}
        {note && <GeminiChip kind={cls === "KEPT_SUGGESTION" ? "kept" : "draft"} label={cls === "KEPT_SUGGESTION" ? SHORT_GEMINI_KEPT : SHORT_GEMINI} sr={null} />}
      </div>
      <details className="rm-r4-more">
        <summary aria-label={`More about ${sentence}`}>
          <Icon name="chev" />
        </summary>
        <div className="rm-r4-mb">
          <p>
            {sentence}: {caption}
          </p>
          {note && <p>{note} until you check or edit the Domains below</p>}
        </div>
      </details>
      {children}
    </div>
  );
}

/** The expanded card's measure, with "Type a target" when the target can be typed (never on a depth plan's coverage, F-R4-9). */
function CardMeasure({ measure, milestone, check, ctx, editable }: { measure: MeasureSpec; milestone: MilestoneDraft; check: KnowledgeCheck | null; ctx: MilestoneCardContext; editable: boolean }) {
  const [edit, setEdit] = useState(false);
  const names = scopeNamesOf(measure.scope.domainIds ?? [], ctx.domainIndex);
  const segment = measureSegmentOf(measure.measureKey);
  return (
    <MeasureLine measure={measure} milestone={milestone} ctx={ctx} check={check} verdict={false}>
      {editable && !segment && (
        <>
          <div className="rm-acts">
            <ChipButton onClick={() => setEdit(true)}>Type a target</ChipButton>
          </div>
          <MeasureEditSheet open={edit} onClose={() => setEdit(false)} measure={measure} check={check} milestone={milestone} m={ctx.m} scopeNames={names} />
        </>
      )}
    </MeasureLine>
  );
}

/** "Keep 3 sessions a week: 10 kept by Sun 22 Nov" as "[ev.tick] 3/wk · 10 kept by 22 Nov", its sentence spoken. */
function PracticeMeasure({ measure, milestone, today }: { measure: MeasureSpec; milestone: MilestoneDraft; today: string }) {
  const practices = milestone.items.filter((it) => it.kind === "PRACTICE" && it.decision !== "REMOVED" && it.addToToday);
  const perWeek = practices.reduce((s, it) => s + (it.sessionsPerWeek ?? 0), 0);
  const by = milestone.dueDay ? dayLabel(milestone.dueDay, today) : null;
  const sentence = `Keep ${plural(perWeek, "session")} a week: ${measure.target} kept${by ? ` by ${by}` : ""}`;
  return (
    <div className="rm-mr rm-r4-mr">
      <div className="rm-r4-mh">
        <Mark glyph="ev.tick" size={14} />
        <span className="rm-r4-mv" aria-hidden="true">
          <span className="num">{perWeek}/wk</span>
          <span>
            · <span className="num">{measure.target}</span> kept{by ? ` by ${by}` : ""}
          </span>
        </span>
        <span className="sr-only">{sentence} · the practices below · from your ticks once started · worked out from your hours</span>
      </div>
    </div>
  );
}

function sectionItems(m: MilestoneDraft, kind: (typeof KIND_ORDER)[number]): ItemDraft[] {
  return m.items.filter((it) => it.kind === kind).sort((a, b) => a.ord - b.ord);
}

/** The rows a card shows: on a keys-only draft Gemini's pending Domain additions are decided once, in the plan-level row, never here. */
function itemsShown(m: MilestoneDraft, kind: (typeof KIND_ORDER)[number], ctx: MilestoneCardContext): ItemDraft[] {
  const rows = sectionItems(m, kind);
  return ctx.keysOnly ? rows.filter((it) => !isPendingAddition(it) && !(it.decision === "REMOVED" && it.notes.includes("NOT_CHOSEN"))) : rows;
}

function domainNameOf(it: ItemDraft, ctx: MilestoneCardContext): string | null {
  if (it.domainId) return ctx.domainIndex.get(it.domainId)?.name ?? null;
  return it.proposedName ?? null;
}

function targetOf(it: ItemDraft, m: MilestoneDraft): ActTarget {
  return { row: editorRowOf(it), item: it, milestone: m };
}

function ItemsOf({ m, kind, stage, ctx }: { m: MilestoneDraft; kind: (typeof KIND_ORDER)[number]; stage: "draft" | "outline"; ctx: MilestoneCardContext }) {
  const editor = useItemEditor();
  return (
    <>
      {itemsShown(m, kind, ctx).map((it) => {
        const t = targetOf(it, m);
        if (kind === "DOMAIN") {
          const facts = it.domainId ? ctx.domainIndex.get(it.domainId) : undefined;
          return <DomainItemRow key={t.row.id} target={t} stage={stage} facts={isLibrary(facts) ? facts : null} />;
        }
        if (kind === "TOPIC") {
          const facts = it.domainId ? ctx.domainIndex.get(it.domainId) : undefined;
          return <TopicRow key={t.row.id} target={t} stage={stage} domainName={domainNameOf(it, ctx)} facts={isLibrary(facts) ? facts : null} moves={ctx.keysOnly ? ctx.moves : null} />;
        }
        if (kind === "PRACTICE") return <PracticeRow key={t.row.id} target={t} stage={stage} health="card" />;
        if (kind === "CHECKPOINT") {
          const bar = it.bar != null && it.outOf != null ? { bar: it.bar, outOf: it.outOf } : null;
          return (
            <ItemRow
              key={t.row.id}
              target={t}
              stage={stage}
              kindLabel={`Checkpoint · ${it.checkpointKind ? CHECKPOINT_KIND_WORD[it.checkpointKind] : "a test of your own"}`}
              meta={stage === "outline" || !bar ? null : <Fig compact={shortBar(bar.bar, bar.outOf)} speech={`your bar ${bar.bar} of ${bar.outOf}`} />}
              more={stage === "outline" ? undefined : [bar ? `your bar ${bar.bar} of ${bar.outOf}` : null, "Context only: doesn't move your progress. The bar and the scale are yours."]}
              chipsBefore={stage !== "outline" && !bar ? <SetTheBar onClick={() => editor?.act(t, "EDIT")} /> : null}
            />
          );
        }
        return <ItemRow key={t.row.id} target={t} stage={stage} kindLabel="Step" />;
      })}
    </>
  );
}

/**
 * A section's short head (§3.3: "[s-know] Learn", "[sigil] Practise",
 * "[quest.step] Steps", "[quest.checkpoint] Checkpoint"): the glyph and the
 * short word aria-hidden; its full name and caption sr-only (and in the Key).
 */
function Head({ glyph, track, short, full, cap, children }: { glyph: MarkRef; track?: TrackSigil; short: string; full: string; cap?: string | null; children?: ReactNode }) {
  return (
    <div className="rm-ms-sh rm-r4-sh">
      <span className="t-eyebrow rm-r4-se">
        <Mark glyph={glyph} size={14} track={track} />
        <span aria-hidden="true">{short}</span>
        <span className="sr-only">{full}</span>
        {cap && <span className="sr-only">{cap}</span>}
      </span>
      {children}
    </div>
  );
}

/** "Reaching it gives the Aim rank Journeyman" (the name in bold), or "Reaching it keeps your rank"; Paragon on the last of 4+. (The living roadmap's Now; the draft's cards use RankGives.) */
export function RankLines({ rank }: { rank: RankPlanEntry | undefined }) {
  if (!rank) return null;
  const parts = rankLineParts(rank.rankIndex, rank.gives);
  return (
    <>
      <p className="rm-rk">
        {parts.lead}
        {parts.name && (
          <>
            &nbsp;<b>{parts.name}</b>
          </>
        )}
      </p>
      {rank.paragonAfter && (
        <p className="rm-rk">
          {PARAGON_PARTS.lead}&nbsp;<b>{PARAGON_PARTS.name}</b>
        </p>
      )}
    </>
  );
}

/**
 * The rank a milestone gives, compact (§3.3 screen 3, C2-B3): "gives Aim rank
 * [rank.2 active] Journeyman" — a rank not yet held keeps its verb and is
 * never drawn held — or "[rank.N done] keeps your rank". The full line is in
 * the card's Key.
 */
export function RankGives({ rank }: { rank: RankPlanEntry | undefined }) {
  if (!rank) return null;
  const idx = rank.rankIndex;
  const gives = rank.gives && idx != null;
  return (
    <p className="rm-rk rm-r4-rk">
      {gives ? (
        <>
          <span>{SHORT_GIVES_RANK}</span>
          <Glyph name={`rank.${Math.max(0, Math.min(6, idx!))}` as `rank.${0 | 1 | 2 | 3 | 4 | 5 | 6}`} state="active" size={16} inherit />
          <b data-wc="name">{AIM_RANKS[Math.max(0, Math.min(6, idx!))]}</b>
        </>
      ) : (
        <>
          {idx != null && <Glyph name={`rank.${Math.max(0, Math.min(6, idx))}` as `rank.${0 | 1 | 2 | 3 | 4 | 5 | 6}`} state="done" size={16} inherit />}
          <span>{SHORT_KEEPS_RANK}</span>
        </>
      )}
      {rank.paragonAfter && (
        <span className="rm-r4-pg">
          <span>{PARAGON_PARTS.lead}</span>
          <Glyph name="rank.6" state="active" size={16} inherit />
          <b data-wc="name">{PARAGON_PARTS.name}</b>
        </span>
      )}
    </p>
  );
}

/** The window, compact: "[t.cal] Sun 4 Oct → Sun 20 Dec · 11 weeks [pv.app]"; who set the dates is spoken (and in the Key). */
function WindowLine({ m, stage, ctx }: { m: MilestoneDraft; stage: "draft" | "outline"; ctx: MilestoneCardContext }) {
  const weeks = weeksOf(m);
  const last = m.dueDay === ctx.targetDay;
  if (!m.windowStart) return <div className="rm-ms-w rm-r4-dates">Later · no dates</div>;
  return (
    <div className="rm-ms-w rm-r4-dates">
      <Mark glyph="t.cal" size={14} />
      <span>
        {spanLabel(m.windowStart, m.dueDay, ctx.today)}
        {weeks ? ` · ${plural(weeks, "week")}` : ""}
      </span>
      {stage === "draft" && (
        <>
          <Mark glyph="pv.app" size={14} />
          <span className="sr-only"> · dates set by the app</span>
        </>
      )}
      {last && ctx.dateByApp && <span className="sr-only"> · ends on the date the app set</span>}
      {last && !ctx.dateByApp && (
        <>
          <span aria-hidden="true"> · </span>
          <Mark glyph="t.pin" size={14} />
          <span aria-hidden="true">{SHORT_YOURS}</span>
          <span className="sr-only"> · ends on your date</span>
        </>
      )}
    </div>
  );
}

/** The stage when the title doesn't already name it (a Gemini or user title on a staged plan): "[stage glyph] Familiar · L6", its words spoken. */
function StageLine({ m, title }: { m: MilestoneDraft; title: string }) {
  const words = stageWords(m.stage, gateOf(m));
  if (!words) return null;
  const parts = /^(.*) \(level (\d+)\)$/.exec(words);
  const name = parts ? parts[1] : words;
  if (title.trim().toLowerCase().startsWith(name.toLowerCase())) return null;
  return (
    <div className="rm-ms-w rm-ms-stage">
      <span data-wc="name" aria-hidden="true">
        {name}
      </span>
      {parts && <span aria-hidden="true">{` · L${parts[2]}`}</span>}
      <span className="sr-only">{words}</span>
    </div>
  );
}

/** The stage's cairn (stones = level; ui-motion.md §4.4), beside the title. */
function StageGlyph({ m, state, size = 18 }: { m: MilestoneDraft; state: "idle" | "active" | "done"; size?: number }) {
  const g = stageGlyphOf(m.stage, gateOf(m));
  if (!g) return null;
  return <Glyph name={g.glyph} gate={g.gate ?? undefined} n={g.n ?? undefined} state={state} size={size} className="rm-r4-stg" />;
}

function BulkKeep({ m }: { m: MilestoneDraft }) {
  const { run, pending, error } = useRoadmapAction();
  const id = useId();
  const n = bulkKeepCountOf(m);
  if (n === 0 || !m.id) return null;
  return (
    <div className="rm-bulk">
      <div className="rm-r4-bk">
        <Button id={`rm-bulk${id}`} block className="rm-btn-wrap" disabled={pending} onClick={() => run((a) => a.keepUnflagged(m.id!))}>
          Keep this milestone&apos;s unflagged suggestions ({n})
        </Button>
        <InfoTip topic="keeping suggestions" describes={`rm-bulk${id}`}>
          They become “Gemini&apos;s words · kept by you · not checked”. Flagged items and proposed Domains still need their own tap; kept Domains and the title are asked for again at Start, before
          anything reaches Today.
        </InfoTip>
      </div>
      {error && <ActionError>{error}</ActionError>}
    </div>
  );
}

export function MilestoneCard({
  milestone: m,
  stage,
  mf,
  rank,
  aimCheck,
  ctx,
}: {
  milestone: MilestoneDraft;
  stage: "draft" | "outline";
  mf: MilestoneFeasibility | null;
  rank: RankPlanEntry | undefined;
  aimCheck: AimCheck | null;
  ctx: MilestoneCardContext;
}) {
  const [showAll, setShowAll] = useState(false);
  const editor = useItemEditor();
  if (isHeldMilestone(m)) return <HeldCard milestone={m} />;
  if (stage === "outline") return <OutlineNode milestone={m} mf={mf} rank={rank} ctx={ctx} showAll={showAll} setShowAll={setShowAll} editor={editor} />;
  return <NextCard milestone={m} mf={mf} rank={rank} aimCheck={aimCheck} ctx={ctx} editor={editor} />;
}

/** A stage held when you began (F-R4-10, F-R4-12): one line, no items, never started, no rank given; why behind its ▸. */
function HeldCard({ milestone: m }: { milestone: MilestoneDraft }) {
  return (
    <section className="card rm-held rm-r4-node" aria-label={`Milestone ${m.ord}`} data-wc-block="outline-node">
      <details className="rm-r4-nd">
        <summary className="rm-r4-ns">
          <span className="rm-r4-nn rm-ms-n-held" aria-hidden="true">
            {m.ord}
          </span>
          <StageGlyph m={m} state="done" />
          <span className="rm-r4-nt">
            <span className="rm-r4-ntt" data-wc="name">
              <MilestoneTitleText milestone={m} />
            </span>
            <span className="rm-r4-nch">
              <span>{heldRowLine(m.rankIndex)}</span>
            </span>
          </span>
          <Icon name="chev" />
        </summary>
        <div className="rm-r4-nb">
          <p className="t-meta">{MILESTONE_NOTE_LINE.HELD_AT_START}</p>
        </div>
      </details>
    </section>
  );
}

/** The provenance classes and kinds a card shows, so its Key lists each glyph once with its words (D13). */
function keyEntriesOf(
  rows: readonly { kind: string; origin: ItemDraft["origin"]; decision: ItemDraft["decision"]; catalogPick?: boolean }[],
  o: { track?: TrackSigil; dates: boolean; why: boolean; rank: RankPlanEntry | undefined; lastLine: string | null; measures: boolean; practiceMeasure: boolean; pickWords: string }
): KeyEntry[] {
  const out: KeyEntry[] = [];
  const has = (pred: (r: (typeof rows)[number]) => boolean) => rows.some(pred);
  const cls = (r: (typeof rows)[number]) => provenanceOf(r.origin, r.decision);
  if (has((r) => cls(r) === "DRAFT" && !r.catalogPick)) out.push({ glyph: "pv.suggest", words: <>«{SHORT_GEMINI}»: {PROVENANCE_WORDS.DRAFT}</> });
  if (has((r) => cls(r) === "KEPT_SUGGESTION" && !r.catalogPick)) out.push({ glyph: "pv.kept", words: <>«{SHORT_GEMINI_KEPT}»: {PROVENANCE_WORDS.KEPT_SUGGESTION}</> });
  if (has((r) => Boolean(r.catalogPick))) out.push({ glyph: "pv.pick", words: <>«Gemini&apos;s choice»: {o.pickWords}; not checked until you keep it. The row&apos;s ▸ says how many options its stage had.</> });
  const marks = new Set(rows.map((r) => (cls(r) === "DRAFT" || cls(r) === "KEPT_SUGGESTION" ? null : provMarkOf(r.origin, r.decision))).filter(Boolean));
  if (marks.has("app-written") || o.dates) out.push({ glyph: "pv.app", words: <>Written by the app, or added by the app{o.dates ? "; beside the dates: dates set by the app" : ""}</> });
  if (marks.has("you")) out.push({ glyph: "pv.you", words: provMarkWords("you") });
  if (marks.has("checked")) out.push({ glyph: "pv.checked", words: provMarkWords("checked") });
  if (marks.has("syllabus")) out.push({ glyph: "pv.syllabus", words: provMarkWords("syllabus") });
  if (o.dates) out.push({ glyph: "t.cal", words: <>The milestone&apos;s dates{o.lastLine ? ` · ${o.lastLine}` : ""}</> });
  if (o.why) out.push({ glyph: "m.builds", words: "Why this stage holds what it does: its focus, what it builds on and what closes it (the (i) beside it)" });
  if (o.rank) {
    const parts = rankLineParts(o.rank.rankIndex, o.rank.gives);
    out.push({
      glyph: o.rank.rankIndex != null ? (`rank.${Math.max(0, Math.min(6, o.rank.rankIndex))}` as MarkRef) : undefined,
      state: o.rank.gives ? "active" : "done",
      words: (
        <>
          {parts.lead}
          {parts.name && (
            <>
              &nbsp;<b>{parts.name}</b>
            </>
          )}
          . An Aim rank is kept for good.
        </>
      ),
    });
  }
  if (o.measures) out.push({ glyph: "ev.tested", words: "Learn: the cards each Domain must hold, from now to the target (tested by your reviews once started), with the target's verdict" });
  if (o.practiceMeasure || has((r) => r.kind === "PRACTICE")) out.push({ glyph: "quest.practice", words: "Practise: sessions and minutes set by the app · from your ticks once started" });
  if (has((r) => r.kind === "STEP")) out.push({ glyph: "quest.step", words: "Steps: you tick these once started" });
  if (has((r) => r.kind === "CHECKPOINT")) out.push({ glyph: "quest.checkpoint", words: "Checkpoint: you log it · doesn't move your progress; the bar and the scale are yours" });
  if (has((r) => r.kind === "DOMAIN" || r.kind === "TOPIC")) out.push({ glyph: "s-know", words: "Domains needed: facts from your library · they set what counts and what week quests name. What to learn: write cards on it in its Domain and review them when due" });
  return out.map((e) => (e.glyph && e.glyph.startsWith("quest.practice") && o.track ? { ...e, track: o.track } : e));
}

/** The worst verdict that doesn't fit (Tight, Over, Impossible), for a collapsed node's summary; null when every part fits. */
function worstOf(mf: MilestoneFeasibility | null): { verdict: "TIGHT" | "OVER" | "IMPOSSIBLE"; unverified: boolean } | null {
  if (!mf) return null;
  const order = ["TIGHT", "OVER", "IMPOSSIBLE"] as const;
  let worst: (typeof order)[number] | null = null;
  let unverified = false;
  for (const v of [...mf.knowledge.map((k) => k.verdict), mf.time.verdict]) {
    const i = order.indexOf(v as (typeof order)[number]);
    if (i >= 0 && (worst == null || i > order.indexOf(worst))) {
      worst = order[i];
      unverified = v === mf.time.verdict && mf.time.unverified && !mf.knowledge.some((k) => k.verdict === v);
    }
  }
  return worst ? { verdict: worst, unverified } : null;
}

/**
 * What a collapsed node holds in Gemini's words, so the who-word stays visible
 * while its rows are folded (D25): «Gemini · not checked» when an item is
 * Gemini's and not checked (the title's own chip sits before it),
 * «Gemini · kept · not checked» when one is kept, «Gemini's choice · not
 * checked» while a pick of a type waits (or «Gemini's choice» once kept).
 */
function NodeGeminiChips({ items, titleCls }: { items: readonly ItemDraft[]; titleCls: ReturnType<typeof itemClassOf> }) {
  const live = items.filter((it) => it.decision !== "REMOVED");
  const pick = (it: ItemDraft) => Boolean(it.catalogKey) && it.notes.includes("GEMINI_PICK") && it.decision !== "EDITED";
  const cls = (it: ItemDraft) => provenanceOf(it.origin, it.decision);
  const draft = titleCls !== "DRAFT" && live.some((it) => !pick(it) && cls(it) === "DRAFT");
  const kept = titleCls !== "KEPT_SUGGESTION" && live.some((it) => !pick(it) && cls(it) === "KEPT_SUGGESTION");
  const picks = live.filter(pick);
  const pickDraft = picks.some((it) => it.decision === "PENDING");
  return (
    <>
      {draft && <GeminiChip kind="draft" label={SHORT_GEMINI} sr={`Items: ${PROVENANCE_WORDS.DRAFT}`} />}
      {kept && <GeminiChip kind="kept" label={SHORT_GEMINI_KEPT} sr={`Items: ${PROVENANCE_WORDS.KEPT_SUGGESTION}`} />}
      {picks.length > 0 && <GeminiChip kind="pick" label={shortGeminiChoice(pickDraft)} sr={`A practice: ${shortGeminiChoice(pickDraft)}`} />}
    </>
  );
}

/** The glyph counts of a collapsed node ("[quest.practice]2 [quest.step]2 [quest.checkpoint]1"), spoken in words. */
function NodeCounts({ items, track }: { items: readonly ItemDraft[]; track?: TrackSigil }) {
  const live = items.filter((it) => it.decision !== "REMOVED");
  const n = (k: ItemDraft["kind"]) => live.filter((it) => it.kind === k).length;
  const learn = n("TOPIC");
  const all: { glyph: MarkRef; n: number; words: string }[] = [
    { glyph: "s-know", n: learn, words: plural(learn, "topic") },
    { glyph: "quest.practice", n: n("PRACTICE"), words: plural(n("PRACTICE"), "practice") },
    { glyph: "quest.step", n: n("STEP"), words: plural(n("STEP"), "step") },
    { glyph: "quest.checkpoint", n: n("CHECKPOINT"), words: plural(n("CHECKPOINT"), "checkpoint") },
  ];
  const parts = all.filter((p) => p.n > 0);
  // A row a blocking flag holds back is counted too, so a folded node never hides that something needs a look.
  const flagged = live.filter((it) => it.flags.length > 0).length;
  if (parts.length === 0 && flagged === 0) return null;
  return (
    <span className="rm-r4-nc">
      <span aria-hidden="true" className="rm-r4-ncs">
        {parts.map((p) => (
          <span key={p.glyph} className="rm-r4-nci">
            <Mark glyph={p.glyph} size={14} track={p.glyph === "quest.practice" ? track : undefined} />
            <span className="num">{p.n}</span>
          </span>
        ))}
        {flagged > 0 && (
          <span className="rm-r4-nci">
            <Mark glyph="i-flag" size={14} />
            <span className="num">{flagged}</span>
          </span>
        )}
      </span>
      <span className="sr-only">{[...parts.map((p) => p.words), flagged > 0 ? `${flagged} flagged` : null].filter(Boolean).join(", ")}</span>
    </span>
  );
}

function OutlineNode({
  milestone: m,
  mf,
  rank,
  ctx,
  showAll,
  setShowAll,
  editor,
}: {
  milestone: MilestoneDraft;
  mf: MilestoneFeasibility | null;
  rank: RankPlanEntry | undefined;
  ctx: MilestoneCardContext;
  showAll: boolean;
  setShowAll: (f: (v: boolean) => boolean) => void;
  editor: ReturnType<typeof useItemEditor>;
}) {
  const title = titleItemOf(m);
  const titleCls = itemClassOf(title);
  const titleShown = useDisplayLabel(title, m, editor?.scope);
  const items = KIND_ORDER.flatMap((k) => itemsShown(m, k, ctx));
  const shown = showAll ? items : items.slice(0, 7);
  const cards = m.measures.filter((x) => x.kind === "CARDS_AT_LEVEL" && x.role === "PAYS");
  const track = trackSigilOf(editor?.scope);
  const gemini = titleCls === "DRAFT" || titleCls === "KEPT_SUGGESTION";
  const worst = worstOf(mf);
  const titleOwn = title.origin === "USER" || title.decision === "EDITED";
  const healthRows = m.notes.includes("HEALTH_LINE") || items.some((it) => it.kind === "PRACTICE" && it.method === "WORKOUT" && it.decision !== "REMOVED");
  const healthFlagShown = title.flags.includes("HEALTH") || items.some((it) => it.flags.includes("HEALTH") && it.decision !== "REMOVED");
  const health = healthChipShown({ track: ctx.body ? "BODY" : null, healthRows, healthFlagShown });

  return (
    <section className="card rm-r4-node" aria-label={`Milestone ${m.ord}`} data-wc-block="outline-node">
      <details className="rm-r4-nd">
        <summary className="rm-r4-ns">
          <span className="rm-r4-nn" aria-hidden="true">
            {m.ord}
          </span>
          <StageGlyph m={m} state="idle" />
          <span className="rm-r4-nt">
            <span className="rm-r4-ntt" id={rowDomId(title.id)} data-wc={titleOwn ? "own" : "name"}>
              <StruckLabel label={title.label} struck={titleShown.struck} />
            </span>
            <span className="rm-r4-nch">
              {gemini && <ProvenanceChip origin={m.titleOrigin} decision={m.titleDecision} />}
              <FlagChips flags={title.flags} />
              <FlagReasons flags={title.flags} ctx={{ constraints: editor?.scope.constraints ?? null, milestoneOrd: m.ord, milestoneCount: ctx.milestoneCount }} reasons={titleShown.reasons} inline />
              <NodeGeminiChips items={items} titleCls={titleCls} />
              {worst && <GlyphVerdictChip verdict={worst.verdict} unverified={worst.unverified} />}
              <NodeCounts items={items} track={track} />
            </span>
          </span>
          <Icon name="chev" />
        </summary>
        <div className="rm-r4-nb">
          {gemini && (
            <p className="rm-cap rm-r4-tw" data-wc="honest">
              Title: {PROVENANCE_WORDS[titleCls as "DRAFT" | "KEPT_SUGGESTION"]}
            </p>
          )}
          <div className="rm-r4-nh">
            <StageLine m={m} title={title.label} />
            <CompactWhy why={ctx.whys?.get(m.lineageId)} track={ctx.catalogTrack} />
            <WindowLine m={m} stage="outline" ctx={ctx} />
            <RankGives rank={rank} />
          </div>
          {mf && (
            <div className="rm-ms-sec rm-r4-ck">
              <div className="rm-r4-tv">
                <span className="rm-cap">App-tracked time</span>
                <GlyphVerdictChip verdict={mf.time.verdict} unverified={mf.time.unverified} />
              </div>
              {cards.map((c) => (
                <MeasureLine key={c.measureKey ?? c.id ?? "c"} measure={c} milestone={m} ctx={ctx} check={mf.knowledge.find((k) => k.measureKey === c.measureKey) ?? null} />
              ))}
            </div>
          )}
          {health && (
            <div className="rm-ms-sec rm-r4-hc" data-safety="">
              <HonestyChip kind="health" label={SHORT_HEALTH} full={HEALTH_LINE} wrap />
            </div>
          )}
          {shown.length > 0 && (
            <div className="rm-ms-sec">
              <ul className="rm-oi-list">
                {shown.map((it) => {
                  const t = targetOf(it, m);
                  const dn = domainNameOf(it, ctx);
                  const label = it.kind === "TOPIC" && dn ? `Topic · ${dn}` : it.kind === "PRACTICE" && it.method ? `Practice` : it.kind.charAt(0) + it.kind.slice(1).toLowerCase();
                  return <ItemRow key={t.row.id} target={t} stage="outline" kindLabel={label} />;
                })}
              </ul>
            </div>
          )}
          {m.notes
            .filter((n) => !(n === "HEALTH_LINE" && (health || healthFlagShown)))
            .map((n) => (
              <p key={n} className="rm-note rm-note-top">
                {MILESTONE_NOTE_LINE[n]}
              </p>
            ))}
          {editor && m.status === "DRAFT" && <AddItemBar milestone={m} scope={editor.scope} />}
          <div className="rm-ms-foot">
            <span className="rm-cap">
              {items.length > 7 && !showAll ? `Showing 7 of ${items.length} · ` : `${plural(items.length, "item")} · `}decide when you start it
            </span>
            {items.length > 7 && (
              <button type="button" className="rm-ilink rm-cap" style={{ minHeight: 40 }} onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show fewer" : "Show all"}
              </button>
            )}
          </div>
        </div>
      </details>
    </section>
  );
}

function NextCard({
  milestone: m,
  mf,
  rank,
  aimCheck,
  ctx,
  editor,
}: {
  milestone: MilestoneDraft;
  mf: MilestoneFeasibility | null;
  rank: RankPlanEntry | undefined;
  aimCheck: AimCheck | null;
  ctx: MilestoneCardContext;
  editor: ReturnType<typeof useItemEditor>;
}) {
  const cards = m.measures.filter((x) => x.kind === "CARDS_AT_LEVEL" && x.role === "PAYS");
  const practice = m.measures.find((x) => x.kind === "PRACTICE_KEPT" && x.role === "PAYS");
  const has = (k: (typeof KIND_ORDER)[number]) => itemsShown(m, k, ctx).length > 0;
  const title = titleItemOf(m);
  const track = trackSigilOf(editor?.scope);
  const why = ctx.whys?.get(m.lineageId);
  const last = m.dueDay === ctx.targetDay;
  // The title's own row (chips, flags, Keep / Edit) only when it has something to decide or say; otherwise its mark sits in the header.
  const titleActions = itemActionsOf(title, "draft", { canMap: canMapOf(editor?.scope.library) });
  const titleRow = title.flags.length > 0 || titleActions.wide.length > 0 || titleActions.narrow.more.length > 0;
  const titleMark = provMarkOf(m.titleOrigin, m.titleDecision);
  const shownItems = KIND_ORDER.flatMap((k) => itemsShown(m, k, ctx));
  const live = shownItems.filter((it) => it.decision !== "REMOVED");
  const healthRows = Boolean(ctx.body) || m.notes.includes("HEALTH_LINE") || live.some((it) => it.kind === "PRACTICE" && it.method === "WORKOUT");
  const healthFlagShown = title.flags.includes("HEALTH") || live.some((it) => it.flags.includes("HEALTH"));
  const health = healthChipShown({ track: ctx.body ? "BODY" : null, healthRows, healthFlagShown });
  const keyRows = [
    { kind: "TITLE", origin: m.titleOrigin, decision: m.titleDecision },
    ...shownItems.map((it) => ({ kind: it.kind, origin: it.origin, decision: it.decision, catalogPick: it.notes.includes("GEMINI_PICK") && it.decision !== "EDITED" })),
  ];
  const lastLine = last ? (ctx.dateByApp ? "ends on the date the app set" : "ends on your date") : null;
  const firstPick = shownItems.find((it) => it.notes.includes("GEMINI_PICK") && it.decision !== "EDITED" && it.catalogKey);
  const pickSlot = firstPick ? (catalogSlotOf(firstPick.catalogKey) ?? "PRACTICE") : "PRACTICE";
  const pickWords = editor?.scope.choices ? GEMINI_CHOICE_WORDS : catalogProvenanceWords(pickSlot, "GEMINI");
  const entries = keyEntriesOf(keyRows, { track, dates: Boolean(m.windowStart), why: Boolean(why && ctx.catalogTrack), rank, lastLine, measures: cards.length > 0, practiceMeasure: Boolean(practice), pickWords });

  return (
    <section className="card rm-r4-card" aria-label={`Milestone ${m.ord}`} data-wc-block="next-card">
      <div className="rm-ms-h">
        <span className="rm-ms-n rm-ms-n-cur">{m.ord}</span>
        <div>
          <p className="rm-ms-t" id={titleRow ? undefined : rowDomId(title.id)}>
            <StageGlyph m={m} state="active" />
            <span data-wc={title.origin === "USER" || title.decision === "EDITED" ? "own" : "name"}>
              <MilestoneTitleText milestone={m} />
            </span>
            <ProvenanceChip origin={m.titleOrigin} decision={m.titleDecision} className={titleMark ? "rm-r4-pm" : undefined} />
          </p>
          <StageLine m={m} title={title.label} />
          <CompactWhy why={why} track={ctx.catalogTrack} />
          <WindowLine m={m} stage="draft" ctx={ctx} />
          <RankGives rank={rank} />
        </div>
      </div>
      <div className="rm-r4-key">
        <CardKey entries={entries} topic="the marks on this milestone">
          <p>
            Sections: Learn (Measures, what progress is judged by; Domains needed; What to learn{ctx.keysOnly ? ": your outline lines · write cards on each in its Domain" : ""}) · Practise (What to practise: sessions and minutes set
            by the app) · Steps (you tick these once started) · Checkpoint (context only).
          </p>
        </CardKey>
      </div>
      {titleRow && (
        <div className="rm-ms-pad">
          <ItemRow target={{ row: title, item: null, milestone: m }} stage="draft" kindLabel="Milestone title" variant="title" hideProvenance />
        </div>
      )}
      <ChecksPanel
        roadmapId={ctx.roadmapId}
        mf={mf}
        aimCheck={aimCheck}
        intensity={ctx.intensity}
        dueDay={m.dueDay}
        m={ctx.m}
        today={ctx.today}
        title={`Milestone ${m.ord}`}
        throughput={ctx.throughput}
        hoursPerWeek={ctx.hoursPerWeek}
        intakeEditable={ctx.intakeEditable ?? true}
      />
      {health && (
        <div className="rm-ms-sec rm-r4-hc" data-safety="">
          <HonestyChip kind="health" label={SHORT_HEALTH} full={HEALTH_LINE} wrap />
        </div>
      )}
      {(cards.length > 0 || has("DOMAIN") || has("TOPIC") || !practice) && (
        <div className="rm-ms-sec">
          <Head
            glyph="s-know"
            short={SHORT_SECTION.learn}
            full={has("TOPIC") ? "Measures, Domains needed and What to learn" : "Measures and Domains needed"}
            cap={ctx.keysOnly && has("TOPIC") ? "your outline lines · write cards on each in its Domain" : "what progress is judged by"}
          >
            {ctx.credentialNoSyllabus && !ctx.keysOnly && has("TOPIC") && (
              <HonestyChip kind="credential" label={SHORT_GEMINI_GUESS} full={<>Gemini&apos;s guess at what to learn — not checked against the official syllabus. {CREDENTIAL_LINE}</>} />
            )}
          </Head>
          {cards.map((c) => (
            <CardMeasure key={c.measureKey ?? c.id ?? "c"} measure={c} milestone={m} check={mf?.knowledge.find((k) => k.measureKey === c.measureKey) ?? null} ctx={ctx} editable={Boolean(c.id)} />
          ))}
          {cards.length === 0 && !practice && <p className="t-meta">{MILESTONE_NOTE_LINE.NOT_MEASURABLE}</p>}
          {has("DOMAIN") && (
            <div className="rm-r4-grp">
              <span className="sr-only">Domains needed · facts from your library · they set what counts and what week quests name</span>
              <ItemsOf m={m} kind="DOMAIN" stage="draft" ctx={ctx} />
            </div>
          )}
          {has("TOPIC") && (
            <div className="rm-r4-grp">
              <span className="sr-only">{ctx.credentialNoSyllabus && !ctx.keysOnly ? "Gemini's guess at what to learn" : "What to learn"}</span>
              {!ctx.keysOnly && !ctx.credentialNoSyllabus && <span className="sr-only">How, for every topic: write cards on it in its Domain and review them when due.</span>}
              <ItemsOf m={m} kind="TOPIC" stage="draft" ctx={ctx} />
            </div>
          )}
        </div>
      )}
      {(has("PRACTICE") || Boolean(ctx.practiceOnly) || Boolean(practice)) && (
        <div className="rm-ms-sec">
          <Head glyph={`s-${track ?? "craft"}` as MarkRef} short={SHORT_SECTION.practise} full="What to practise" cap="sessions and minutes set by the app" />
          {ctx.practiceOnly && (
            <p className="rm-avd-p rm-avd-ms" data-wc="honest">
              {ctx.practiceOnly}
            </p>
          )}
          {practice && <PracticeMeasure measure={practice} milestone={m} today={ctx.today} />}
          <ItemsOf m={m} kind="PRACTICE" stage="draft" ctx={ctx} />
        </div>
      )}
      {has("STEP") && (
        <div className="rm-ms-sec">
          <Head glyph="quest.step" short={SHORT_SECTION.steps} full="Steps" cap="you tick these once started" />
          <ItemsOf m={m} kind="STEP" stage="draft" ctx={ctx} />
        </div>
      )}
      {has("CHECKPOINT") && (
        <div className="rm-ms-sec">
          <Head glyph="quest.checkpoint" short={SHORT_SECTION.checkpoint} full="Checkpoint">
            <HonestyChip kind="context-only" label={SHORT_CONTEXT_ONLY} />
          </Head>
          <ItemsOf m={m} kind="CHECKPOINT" stage="draft" ctx={ctx} />
        </div>
      )}
      {m.notes
        .filter((n) => !(n === "HEALTH_LINE" && (health || healthFlagShown)))
        .map((n) => (
          <p key={n} className="rm-note rm-note-top">
            {MILESTONE_NOTE_LINE[n]}
          </p>
        ))}
      {editor && <AddItemBar milestone={m} scope={editor.scope} />}
      {!ctx.bulkKeepOff && !ctx.keysOnly && <BulkKeep m={m} />}
    </section>
  );
}

/** A stage's gate level: its paying card measure's level (BETWEEN's odd level, PART's count level). */
function gateOf(m: Pick<MilestoneDraft, "measures">): number | null {
  return m.measures.find((x) => x.kind === "CARDS_AT_LEVEL" && x.role === "PAYS" && x.minLevel != null)?.minLevel ?? null;
}
