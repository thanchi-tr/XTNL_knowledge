"use client";

/**
 * One milestone of a draft (F9; final-roadmap-draft.html). The next
 * milestone (the first not yet started) is expanded and decided now; later
 * ones are an outline, decided at their Start.
 *
 * Expanded: order, title and its chip, the code window ("Sun 4 Oct → Sun 20
 * Dec · 11 weeks · dates set by the app"), the Aim rank reaching it gives,
 * its checks, its measures ("Hold 43 cards at level 6+ in … (now 28)", "·
 * worked out on Gemini's suggested Domains" until those Domains are checked
 * or edited), Domains needed, topics, practices, steps, a checkpoint with
 * "Set the bar" (context only), and "Keep this milestone's unflagged
 * suggestions" (absent for credential and non-English aims; never a global
 * keep-all; it makes items KEPT_SUGGESTION, never YOURS).
 *
 * Outline: the verdict chips, the measure line and the items with their
 * DRAFT chips, "decide when you start it".
 *
 * Revision 4 (F-R4-10, F-R4-17, F-R4-21): on a keys-only draft the title is
 * code's ("Familiar: Probability, Inference to level 6+"), one card measure
 * per Domain ("multiple choice not counted"), no Keep and no bulk keep, the
 * outline lines can be moved and tied to another Domain, a type from the
 * app's list says who chose it and can be changed, Gemini's Domain
 * additions are decided once in the plan-level row (never here), and a stage
 * held when you began is a one-line card that gives no rank.
 *
 * The practice progression (contracts §20): code owns every stage's
 * practice, so each card's header says why the stage holds what it does, in
 * code's words (StageWhyLine: "Put it to use · builds on Recall drills from
 * milestone 2 · full attempt at the end"), and Gemini's pick reads as its
 * choice among the stage's options.
 */
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import { ActionError } from "@/components/home/ActionError";
import { cx } from "@/components/ui/cx";
import { daysBetween } from "@/lib/life-day";
import {
  parseMeasureKey,
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
  HEALTH_LINE,
  MILESTONE_NOTE_LINE,
  PARAGON_PARTS,
  basisClassNote,
  dayLabel,
  heldRowLine,
  levelGapPhrase,
  rankLineParts,
  plural,
  spanLabel,
  stageWhyPartsOf,
  stageWords,
} from "./roadmap-copy";
import {
  bulkKeepCountOf,
  editorRowOf,
  isHeldMilestone,
  isPendingAddition,
  measureDomainClassOf,
  rowDomId,
  scopeNamesOf,
  titleItemOf,
  type LibraryDomain,
  type RankPlanEntry,
  type StageWhy,
} from "./roadmap-ui-model";
import { useRoadmapAction } from "./roadmap-runtime";
import { ItemRow, MilestoneTitleText, useDisplayLabel } from "./ItemRow";
import { ProvenanceChip } from "./ProvenanceChip";
import { FlagChips, FlagReasons } from "./FlagChips";
import { useItemEditor, type ActTarget } from "./ItemEditor";
import { ChecksPanel, VerdictChip } from "./ChecksPanel";
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
  /** A BODY track plan: its sessions carry HEALTH_LINE. */
  body?: boolean;
  /**
   * Constraint safety (contracts §19): while the plan waits on the user's
   * answer about activities, "Easy, mobility and technique practice only
   * until you confirm." (a care plan's "Planning the week and keeping a log
   * only until you confirm.", a craft plan's "Technique practice only …")
   * under What to practise; null otherwise.
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

/** "Hold 43 cards at level 6+ in A, B (now 28)", with its propagation note. */
function CardMeasure({ measure, milestone, check, ctx, editable }: { measure: MeasureSpec; milestone: MilestoneDraft; check: KnowledgeCheck | null; ctx: MilestoneCardContext; editable: boolean }) {
  const [edit, setEdit] = useState(false);
  const names = scopeNamesOf(measure.scope.domainIds ?? [], ctx.domainIndex);
  const level = measure.minLevel ?? 0;
  const baseline = measure.baseline ?? check?.baseline ?? null;
  const note = basisClassNote(measureDomainClassOf(milestone, measure.scope.domainIds));
  const segment = measureSegmentOf(measure.measureKey);
  return (
    <div className="rm-mr rm-mr-top">
      <div className="rm-mr-h">
        <b>
          Hold {measure.target} cards at level {level}+ in {names ?? "this milestone's Domains"}
          {baseline != null ? ` (now ${baseline})` : ""}
        </b>
      </div>
      <p className="t-meta">
        {levelGapPhrase(level, ctx.m)} · tested by your reviews once started
        {measure.targetSource === "YOURS" ? " · your target" : measure.targetSource === "DEPTH" ? " · the depth" : ""}
        {segment ? " · multiple choice not counted" : ""}
        {segment === "rc" ? " · a card that got there on a retry counts after its next review" : ""}
      </p>
      {note && (
        <p className="t-meta">
          <b>{note}</b> until you check or edit the Domains below
        </p>
      )}
      {/* A depth plan's counts are its coverage (F-R4-9): changed only through the coverage edit, never typed per stage. */}
      {editable && !segment && (
        <>
          <div className="rm-acts">
            <ChipButton onClick={() => setEdit(true)}>Type a target</ChipButton>
          </div>
          <MeasureEditSheet open={edit} onClose={() => setEdit(false)} measure={measure} check={check} milestone={milestone} m={ctx.m} scopeNames={names} />
        </>
      )}
    </div>
  );
}

function PracticeMeasure({ measure, milestone, today }: { measure: MeasureSpec; milestone: MilestoneDraft; today: string }) {
  const practices = milestone.items.filter((it) => it.kind === "PRACTICE" && it.decision !== "REMOVED" && it.addToToday);
  const perWeek = practices.reduce((s, it) => s + (it.sessionsPerWeek ?? 0), 0);
  return (
    <div className="rm-mr">
      <div className="rm-mr-h">
        <b>
          Keep {plural(perWeek, "session")} a week: {measure.target} kept{milestone.dueDay ? ` by ${dayLabel(milestone.dueDay, today)}` : ""}
        </b>
      </div>
      <p className="t-meta">the practices below · from your ticks once started · worked out from your hours</p>
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
        if (kind === "PRACTICE") return <PracticeRow key={t.row.id} target={t} stage={stage} />;
        if (kind === "CHECKPOINT") {
          const bar = it.bar != null && it.outOf != null ? `your bar ${it.bar} of ${it.outOf}` : null;
          return (
            <ItemRow
              key={t.row.id}
              target={t}
              stage={stage}
              kindLabel={`Checkpoint · ${it.checkpointKind ? CHECKPOINT_KIND_WORD[it.checkpointKind] : "a test of your own"}`}
              meta={stage === "outline" ? null : `Context only: doesn't move your progress. The bar and the scale are yours.${bar ? ` · ${bar}` : ""}`}
              chipsBefore={stage !== "outline" && !bar ? <SetTheBar onClick={() => editor?.act(t, "EDIT")} /> : null}
            />
          );
        }
        return <ItemRow key={t.row.id} target={t} stage={stage} kindLabel="Step" />;
      })}
    </>
  );
}

function Section({ title, cap, children, show }: { title: string; cap?: string; children: React.ReactNode; show: boolean }) {
  if (!show) return null;
  return (
    <div className="rm-ms-sec">
      <div className="rm-ms-sh">
        <span className="t-eyebrow">{title}</span>
        {cap && <span className="rm-cap">{cap}</span>}
      </div>
      {children}
    </div>
  );
}

/** "Reaching it gives the Aim rank Journeyman" (the name in bold), or "Reaching it keeps your rank"; Paragon on the last of 4+. */
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

function BulkKeep({ m }: { m: MilestoneDraft }) {
  const { run, pending, error } = useRoadmapAction();
  const n = bulkKeepCountOf(m);
  if (n === 0 || !m.id) return null;
  return (
    <div className="rm-bulk">
      <Button block className="rm-btn-wrap" disabled={pending} onClick={() => run((a) => a.keepUnflagged(m.id!))}>
        Keep this milestone&apos;s unflagged suggestions ({n})
      </Button>
      <p className="rm-cap">
        They become “Gemini&apos;s words · kept by you · not checked”. Flagged items and proposed Domains still need their own tap; kept Domains and the title are asked for
        again at Start, before anything reaches Today.
      </p>
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
  return <MilestoneBody milestone={m} stage={stage} mf={mf} rank={rank} aimCheck={aimCheck} ctx={ctx} showAll={showAll} setShowAll={setShowAll} editor={editor} />;
}

/** A stage held when you began (F-R4-10, F-R4-12): one line, no items, never started, no rank given. */
function HeldCard({ milestone: m }: { milestone: MilestoneDraft }) {
  return (
    <section className="card rm-held" aria-label={`Milestone ${m.ord}`}>
      <div className="rm-ms-h">
        <span className="rm-ms-n rm-ms-n-held">{m.ord}</span>
        <div>
          <p className="rm-ms-t">
            <MilestoneTitleText milestone={m} />
          </p>
          <div className="rm-ms-w">{heldRowLine(m.rankIndex)}</div>
          <p className="t-meta" style={{ margin: "4px 0 0" }}>
            {MILESTONE_NOTE_LINE.HELD_AT_START}
          </p>
        </div>
      </div>
    </section>
  );
}

function MilestoneBody({
  milestone: m,
  stage,
  mf,
  rank,
  aimCheck,
  ctx,
  showAll,
  setShowAll,
  editor,
}: {
  milestone: MilestoneDraft;
  stage: "draft" | "outline";
  mf: MilestoneFeasibility | null;
  rank: RankPlanEntry | undefined;
  aimCheck: AimCheck | null;
  ctx: MilestoneCardContext;
  showAll: boolean;
  setShowAll: (f: (v: boolean) => boolean) => void;
  editor: ReturnType<typeof useItemEditor>;
}) {
  const weeks = weeksOf(m);
  const last = m.dueDay === ctx.targetDay;
  const windowLine = m.windowStart ? `${spanLabel(m.windowStart, m.dueDay, ctx.today)}${weeks ? ` · ${plural(weeks, "week")}` : ""}${stage === "draft" ? " · dates set by the app" : ""}${last ? (ctx.dateByApp ? " · ends on the date the app set" : " · ends on your date") : ""}` : "Later · no dates";
  const cards = m.measures.filter((x) => x.kind === "CARDS_AT_LEVEL" && x.role === "PAYS");
  const practice = m.measures.find((x) => x.kind === "PRACTICE_KEPT" && x.role === "PAYS");
  const has = (k: (typeof KIND_ORDER)[number]) => itemsShown(m, k, ctx).length > 0;
  const title = titleItemOf(m);
  // The title's reasons as every row shows them: the server's, else the device's re-check (a fallback).
  const titleShown = useDisplayLabel(title, m, editor?.scope);

  // The outline has no title row, so its header carries the title's chip, flags with their reasons, and id ("the title with its chip", F9).
  const header = (
    <div className="rm-ms-h">
      <span className={cx("rm-ms-n", stage === "draft" && "rm-ms-n-cur")}>{m.ord}</span>
      <div>
        <p className="rm-ms-t" id={stage === "outline" ? rowDomId(title.id) : undefined}>
          <MilestoneTitleText milestone={m} />
        </p>
        {stage === "outline" && (
          <>
            <div className="rm-it-chips" style={{ marginTop: 6 }}>
              <ProvenanceChip origin={m.titleOrigin} decision={m.titleDecision} />
              <FlagChips flags={title.flags} />
            </div>
            <FlagReasons flags={title.flags} ctx={{ constraints: editor?.scope.constraints ?? null, milestoneOrd: m.ord, milestoneCount: ctx.milestoneCount }} reasons={titleShown.reasons} />
          </>
        )}
        {stageWords(m.stage, gateOf(m)) && <div className="rm-ms-w rm-ms-stage">{stageWords(m.stage, gateOf(m))}</div>}
        <StageWhyLine why={ctx.whys?.get(m.lineageId)} track={ctx.catalogTrack} />
        <div className="rm-ms-w">{windowLine}</div>
        <RankLines rank={rank} />
      </div>
    </div>
  );

  if (stage === "outline") {
    const items = KIND_ORDER.flatMap((k) => itemsShown(m, k, ctx));
    const shown = showAll ? items : items.slice(0, 7);
    return (
      <section className="card" aria-label={`Milestone ${m.ord}`}>
        {header}
        {mf && (
          <div className="rm-ms-sec">
            <div className="rm-vds">
              {mf.knowledge.map((k) => (
                <VerdictChip key={k.measureKey} verdict={k.verdict} />
              ))}
              <VerdictChip verdict={mf.time.verdict} unverified={mf.time.unverified} />
            </div>
            {cards.map((c) => {
              const note = basisClassNote(measureDomainClassOf(m, c.scope.domainIds));
              return (
                <p key={c.measureKey ?? c.id ?? "c"} className="t-meta" style={{ marginTop: 8 }}>
                  <b className="rm-ink1">
                    Hold {c.target} cards at level {c.minLevel}+ in {scopeNamesOf(c.scope.domainIds ?? [], ctx.domainIndex) ?? "this milestone's Domains"}
                    {c.baseline != null ? ` (now ${c.baseline})` : ""}
                  </b>
                  {note ? ` · ${note}` : ""}
                </p>
              );
            })}
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
        {m.notes.map((n) => (
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
      </section>
    );
  }

  return (
    <section className="card" aria-label={`Milestone ${m.ord}`}>
      {header}
      <div className="rm-ms-pad">
        <ItemRow target={{ row: title, item: null, milestone: m }} stage="draft" kindLabel="Milestone title" />
      </div>
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
      <Section title="Measures" cap="what progress is judged by" show={cards.length > 0 || Boolean(practice) || has("CHECKPOINT")}>
        {cards.map((c) => (
          <CardMeasure key={c.measureKey ?? c.id ?? "c"} measure={c} milestone={m} check={mf?.knowledge.find((k) => k.measureKey === c.measureKey) ?? null} ctx={ctx} editable={Boolean(c.id)} />
        ))}
        {practice && <PracticeMeasure measure={practice} milestone={m} today={ctx.today} />}
        {has("CHECKPOINT") && (
          <div className="rm-mr">
            <ItemsOf m={m} kind="CHECKPOINT" stage="draft" ctx={ctx} />
          </div>
        )}
        {cards.length === 0 && !practice && <p className="t-meta">{MILESTONE_NOTE_LINE.NOT_MEASURABLE}</p>}
      </Section>
      <Section title="Domains needed" cap="facts from your library · they set what counts and what week quests name" show={has("DOMAIN")}>
        <ItemsOf m={m} kind="DOMAIN" stage="draft" ctx={ctx} />
      </Section>
      <Section
        title={ctx.credentialNoSyllabus && !ctx.keysOnly ? "Gemini's guess at what to learn — not checked against the official syllabus" : "What to learn"}
        cap={ctx.keysOnly ? "your outline lines · write cards on each in its Domain" : ctx.credentialNoSyllabus ? undefined : "How, for every topic: write cards on it in its Domain and review them when due."}
        show={has("TOPIC")}
      >
        <ItemsOf m={m} kind="TOPIC" stage="draft" ctx={ctx} />
      </Section>
      <Section title="What to practise" cap="sessions and minutes set by the app" show={has("PRACTICE") || Boolean(ctx.practiceOnly)}>
        {ctx.practiceOnly && <p className="rm-avd-p rm-avd-ms">{ctx.practiceOnly}</p>}
        <ItemsOf m={m} kind="PRACTICE" stage="draft" ctx={ctx} />
        {ctx.body && <p className="rm-it-why">{HEALTH_LINE}</p>}
      </Section>
      <Section title="Steps" cap="you tick these once started" show={has("STEP")}>
        <ItemsOf m={m} kind="STEP" stage="draft" ctx={ctx} />
      </Section>
      {m.notes.map((n) => (
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
