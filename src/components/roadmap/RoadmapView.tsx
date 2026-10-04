"use client";

/**
 * /you/roadmap (lane R5; F18; final-roadmap.html). One screen per state:
 *
 *   NONE      an empty card: "Set an aim" → /you/roadmap/new
 *   RUNNING   DraftRunning (F8)        DRAFT   DraftReview (F9)
 *   ACTIVE    the living roadmap; DONE and ARCHIVED read-only history
 *
 * ACTIVE, at 344 px (one column, by CSS order): the Aim header (Aim rank and
 * Proficiency), then Now with this week's quests first, then Toward the aim,
 * then Milestones, then one "How this is worked out" disclosure (Your
 * capacity, Is this realistic?, How this was drafted, How this is measured),
 * then practice aftercare and the footer actions. From 760 px of main: two
 * columns, the reference sections open on the right. No chart and no graph
 * canvas: the pace is text. Behind-pace signals live here and on the Aim
 * card only, never on Today. Nothing is red.
 *
 * Counts read the plan's positions (RoadmapView.positions, else positionsOf
 * over the rows: a dropped milestone keeps its place), so "milestone 2 of 6"
 * agrees with the Aim card, Today and Toward the aim; the Paragon line keys on
 * rank.top.withAim. "How this was drafted" describes RoadmapView.acceptedRun,
 * the run behind the accepted plan ("Latest run" while a view lacks it).
 */
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Chip, ChipButton } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { Meter } from "@/components/ui/Meter";
import { Sheet } from "@/components/ui/Sheet";
import { SectionHeader, Switch } from "@/components/ui/Tabs";
import { TypedConfirm } from "@/components/ui/TypedConfirm";
import { pushToast } from "@/components/ui/toast-store";
import { ActionError } from "@/components/home/ActionError";
import { cx } from "@/components/ui/cx";
import { goalPercent } from "@/lib/goals";
import { addDays, daysBetween } from "@/lib/life-day";
import { NOT_RECORDED_HERE, aimRankName, parseMeasureKey, provenanceOf, type CurrentMilestoneView, type ItemDraft, type MilestoneRowView, type RoadmapView, type StartPreview } from "@/lib/roadmap-types";
import {
  CHECKPOINT_KIND_WORD,
  MILESTONE_NOTE_LINE,
  PARAGON_PARTS,
  START_AGAIN_LINE,
  TIME_FIXED_LINE,
  WRITES_OFF_BANNER,
  dayLabel,
  dayWithWeekday,
  measuredLabel,
  pastDueLine,
  paceLine,
  spanLabel,
  statedLine,
} from "./roadmap-copy";
import { ROADMAP_NEW_HREF, TODAY_HREF, todayTaskHref } from "./roadmap-links";
import {
  aftercareMilestoneIdOf,
  behindBannerOf,
  domainIndexOf,
  editorRowOf,
  milestoneRowLine,
  paragonLineShown,
  positionsOf,
  referenceRunOf,
  scopeNamesOf,
  startAgainOffered,
  type LibraryDomain,
} from "./roadmap-ui-model";
import { useRoadmapAction } from "./roadmap-runtime";
import { ItemEditor } from "./ItemEditor";
import { editorScopeOf, DraftReview, DraftRunning } from "./DraftReview";
import { AimHeader } from "./AimHeader";
import { TowardAim } from "./TowardAim";
import { MeasureRow, measureFractionOf } from "./MeasureRow";
import { DomainItemRow, DomainRow } from "./DomainRow";
import { ItemRow, MilestoneTitleText } from "./ItemRow";
import { StruckLabel } from "./StruckLabel";
import { TopicRow } from "./TopicRow";
import { PracticeRow } from "./PracticeRow";
import { WeekQuests } from "./WeekQuests";
import { PastWeekQuests } from "./PastWeekQuests";
import { QuestBasisSheet } from "./QuestBasisSheet";
import { CheckpointSheet } from "./CheckpointSheet";
import { StartSheet } from "./StartSheet";
import { ReplanSheet } from "./ReplanSheet";
import { ThroughputPanel } from "./ThroughputPanel";
import { ChecksPanel, VerdictChip } from "./ChecksPanel";
import { RunFacts, RunTable } from "./RunFacts";
import { PlanHistory } from "./PlanHistory";
import { HowMeasuredSheet, WorkedOutSheet } from "./HowMeasuredSheet";
import { RankLines } from "./MilestoneCard";
import { PaysLine } from "./PaysLine";
import { RoadmapGlyph } from "./RoadmapGlyph";
import { TitleClassChip } from "./ProvenanceChip";
import "./roadmap.css";

function isLibrary(d: LibraryDomain | { id: string; name: string } | undefined): d is LibraryDomain {
  return Boolean(d && "cards" in d);
}

// ── NONE ────────────────────────────────────────────────────────────────────

export function EmptyRoadmap({ hasKey }: { hasKey: boolean }) {
  return (
    <section className="card" style={{ padding: "20px 16px", textAlign: "center" }}>
      <RoadmapGlyph name="route" size={28} style={{ margin: "0 auto" }} />
      <b style={{ display: "block", font: "600 19px/23px var(--font-display)", marginTop: 8 }}>Set an aim</b>
      <p className="t-meta" style={{ margin: "6px auto 14px", maxWidth: "30ch" }}>
        {hasKey ? "Say what you want to be able to do. Gemini can draft a roadmap, or build one from your numbers." : "Say what you want to be able to do. The app builds a roadmap from your own numbers."}
      </p>
      <Button variant="primary" href={ROADMAP_NEW_HREF}>
        Set an aim
      </Button>
    </section>
  );
}

// ── Small sheets ──────────────────────────────────────────────────────────────

function RescheduleSheet({ open, onClose, goalId, ord, today }: { open: boolean; onClose: () => void; goalId: string; ord: number; today: string }) {
  const [day, setDay] = useState(addDays(today, 14));
  const { run, pending, error } = useRoadmapAction();
  return (
    <Sheet open={open} onClose={onClose} title={`Reschedule Milestone ${ord}`} description="A later due day counts as Carried when you close it.">
      <div className="rm-form">
        <div className="rm-f">
          <label className="st-label" htmlFor="rm-resched">
            New due day
          </label>
          <input id="rm-resched" type="date" className="st-input" min={addDays(today, 1)} value={day} onChange={(e) => setDay(e.target.value)} />
          <p className="st-hint">{dayWithWeekday(day, today)} · the goal on Today moves with it; its pay rules don&apos;t change.</p>
        </div>
        {error && <ActionError>{error}</ActionError>}
        <Button variant="primary" size="lg" block disabled={pending} onClick={() => run((a) => a.rescheduleGoal(goalId, day), () => onClose())}>
          {pending ? "Moving…" : `Move to ${dayWithWeekday(day, today)}`}
        </Button>
      </div>
    </Sheet>
  );
}

function ArchiveSheet({ open, onClose, roadmapId, openGoal }: { open: boolean; onClose: () => void; roadmapId: string; openGoal: boolean }) {
  const [archiveGoal, setArchiveGoal] = useState(false);
  const { run, pending, error } = useRoadmapAction();
  return (
    <Sheet open={open} onClose={onClose} title="Archive this roadmap" description="Its history, readings, past week quests and Aim rank are kept. No new week quests are set.">
      <div className="rm-form">
        {openGoal && (
          <div className="rm-sw">
            <span className="rm-sw-t">Archive its open milestone goal too (it has progress; otherwise it stays on Today)</span>
            <Switch checked={archiveGoal} onChange={setArchiveGoal} label="Archive its open milestone goal too" />
          </div>
        )}
        <TypedConfirm phrase="archive" action="Archive roadmap" pending={pending} onConfirm={() => run((a) => a.archiveRoadmap(roadmapId, { reason: "archived by you", archiveGoal }), () => onClose())} />
        {error && <ActionError>{error}</ActionError>}
      </div>
    </Sheet>
  );
}

function MarkDoneSheet({ open, onClose, roadmapId, reached }: { open: boolean; onClose: () => void; roadmapId: string; reached: boolean }) {
  const [reason, setReason] = useState("");
  const { run, pending, error } = useRoadmapAction();
  return (
    <Sheet open={open} onClose={onClose} title="Mark the aim done" description={reached ? "The aim is reached on your readings." : "The aim isn't reached on your readings yet, so say why it's done."}>
      <div className="rm-form">
        {!reached && (
          <div className="rm-f">
            <label className="st-label" htmlFor="rm-done-reason">
              Why it&apos;s done
            </label>
            <textarea id="rm-done-reason" className="st-input" rows={2} maxLength={280} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        {error && <ActionError>{error}</ActionError>}
        <Button
          variant="primary"
          size="lg"
          block
          disabled={pending}
          onClick={() => {
            if (!reached && !reason.trim()) return;
            run((a) => a.markRoadmapDone(roadmapId, reached ? null : reason.trim()), () => onClose());
          }}
        >
          {pending ? "Saving…" : "Mark done"}
        </Button>
        {!reached && !reason.trim() && <p className="t-meta">Write a reason first; it&apos;s stored with the aim.</p>}
      </div>
    </Sheet>
  );
}

// ── Now ─────────────────────────────────────────────────────────────────────

function NowSection({ view, current, onStartOpen }: { view: RoadmapView; current: CurrentMilestoneView; onStartOpen: () => void }) {
  const m = current.milestone;
  const today = view.today;
  const index = useMemo(() => domainIndexOf(view), [view]);
  const [basis, setBasis] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [resched, setResched] = useState(false);
  const { run, pending, error } = useRoadmapAction();
  const rows = view.milestones;
  // Positions, as the Aim card, Today's chip and Toward the aim count them (a dropped milestone keeps its place).
  const of = positionsOf(view);
  const started = Boolean(current.goalId);
  const checkpoint = m.items.find((it) => it.kind === "CHECKPOINT" && it.decision !== "REMOVED") ?? null;
  const dayOf = m.windowStart && m.dueDay ? `day ${Math.max(1, Math.min(daysBetween(m.windowStart, m.dueDay) + 1, daysBetween(m.windowStart, today) + 1))} of ${daysBetween(m.windowStart, m.dueDay) + 1}` : null;
  const fractions = current.measures.filter((x) => x.role === "PAYS").map((x) => ({ key: x.measureKey, g: measureFractionOf(x) }));
  const slowest = fractions.length > 1 ? fractions.reduce((a, b) => ((b.g ?? 1) < (a.g ?? 1) ? b : a)).key : null;
  const headPct = current.headline ? goalPercent(Number(current.headline.value)) : null;
  // A stored reading keeps its real "measured" time even with writes off; only a value computed here reads NOT_RECORDED_HERE.
  const headMeasuredAt = current.measures.find((x) => x.measuredAt)?.measuredAt ?? null;
  const prevBest = Math.max(0, ...rows.filter((r) => r.ord < m.ord && r.rankIndex != null).map((r) => r.rankIndex!));
  const rank = { rankIndex: m.rankIndex, gives: m.rankIndex != null && m.rankIndex > prevBest, paragonAfter: false };

  const items = (kind: ItemDraft["kind"]) => m.items.filter((it) => it.kind === kind && it.decision !== "REMOVED").sort((a, b) => a.ord - b.ord);
  const sec = (title: string, cap: string | null, body: ReactNode) => (
    <div className="rm-ms-sec">
      <div className="rm-ms-sh">
        <span className="t-eyebrow">{title}</span>
        {cap && <span className="rm-cap">{cap}</span>}
      </div>
      {body}
    </div>
  );

  return (
    <div className="rm-o2" id="now">
      <SectionHeader title={`Now · milestone ${m.ord} of ${of || m.ord}`} aside={dayOf ?? undefined} />
      <section className="card" aria-label="Current milestone">
        <div className="rm-ms-h">
          <span className="rm-ms-n rm-ms-n-cur">{m.ord}</span>
          <div>
            <p className="rm-ms-t">
              <MilestoneTitleText milestone={m} />
            </p>
            <div className="rm-ms-w">{spanLabel(m.windowStart, m.dueDay, today)}</div>
            <div className="rm-chips" style={{ marginTop: 8 }}>
              <Chip>{current.pastDue ? "Past due" : current.starting ? "Starting" : started ? "Current" : "Planned"}</Chip>
              <TitleClassChip cls={provenanceOf(m.titleOrigin, m.titleDecision)} />
              {started && (
                <span className="rm-pv">
                  Mid goal on Today · <PaysLine text={statedLine(current.stated, current.zeroReason, current.paidOn, today)} />
                </span>
              )}
            </div>
            <RankLines rank={rank} />
          </div>
        </div>

        {current.pastDue && (
          <div className="rm-ms-sec">
            <p className="t-body" style={{ fontWeight: 600, margin: 0 }}>
              {pastDueLine(m.ord, m.dueDay, today)}
            </p>
            <p className="t-meta" style={{ marginTop: 4 }}>
              No week quests this week. The goal on Today is Carried, never owed.
            </p>
            <div className="rm-acts">
              {current.goalId && <ChipButton onClick={() => setResched(true)}>Reschedule Milestone {m.ord}</ChipButton>}
              <Link className="chip btn-chip" href={TODAY_HREF}>
                Close it on Today
              </Link>
            </div>
            <PastWeekQuests weeks={view.pastWeeks} today={today} />
          </div>
        )}

        {!current.pastDue && view.weekQuests && started && (
          <>
            <WeekQuests
              variant="roadmap"
              view={view.weekQuests}
              today={today}
              onShowBasis={() => setBasis(true)}
              onLogCheckpoint={checkpoint ? () => setLogOpen(true) : undefined}
              shownElsewhere={view.triggers.map((t) => t.line)}
            />
            <div className="rm-ms-sec" style={{ borderTop: 0, paddingTop: 0 }}>
              <PastWeekQuests weeks={view.pastWeeks} today={today} />
            </div>
            <QuestBasisSheet open={basis} onClose={() => setBasis(false)} view={view.weekQuests} today={today} />
          </>
        )}

        {started && (
          <div className="rm-ms-sec">
            {current.headline ? (
              <>
                <div className="rm-head">
                  <span className="rm-big">{headPct}%</span>
                  <span className="rm-cap" style={{ textAlign: "right" }}>
                    {current.headline.caption}
                    <br />
                    {headMeasuredAt ? measuredLabel(headMeasuredAt, today) : view.writesOff ? NOT_RECORDED_HERE : "not measured yet"}
                  </span>
                </div>
                <Meter className="rm-head-m" value={Number(current.headline.value)} label={`Milestone ${m.ord}, ${headPct}%, ${current.headline.caption}`} />
                <p className="t-meta">
                  The slowest part sets the milestone
                  {(() => {
                    const p = current.measures.find((x) => x.measureKey === slowest)?.pace ?? current.measures[0]?.pace ?? null;
                    const line = paceLine(p, { today });
                    return line ? ` · ${line}` : ".";
                  })()}
                </p>
              </>
            ) : (
              <p className="t-meta">{view.writesOff ? "Not recorded on this server." : "Not measured yet — the first reading is recorded when you next open Today or You in the app."}</p>
            )}
          </div>
        )}

        {current.measures.length > 0 &&
          sec(
            "Measures",
            "the same numbers as Today's goal card",
            current.measures
              .filter((x) => x.kind !== "CHECKPOINT")
              .map((x) => {
                const parsed = parseMeasureKey(x.measureKey);
                const label =
                  x.label ?? (parsed?.kind === "CARDS_AT_LEVEL" ? `Cards at level ${parsed.level}+ in ${scopeNamesOf(parsed.domainIds, index) ?? "this milestone's Domains"}` : "Practice kept");
                return <MeasureRow key={x.measureKey} row={x} label={label} m={view.feasibility?.m ?? 1} today={today} slowest={slowest === x.measureKey} since="since start" writesOff={view.writesOff} />;
              })
          )}

        {items("DOMAIN").length > 0 &&
          sec(
            "Domains needed",
            "from your library",
            items("DOMAIN").map((it) => {
              const f = it.domainId ? index.get(it.domainId) : undefined;
              const cls = provenanceOf(it.origin, it.decision);
              if (!it.domainId || (cls !== "YOURS" && cls !== "WORKED_OUT"))
                return <DomainItemRow key={it.id ?? it.lineageId} target={{ row: editorRowOf(it), item: it, milestone: m }} stage="active" facts={isLibrary(f) ? f : null} />;
              return <DomainRow key={it.id ?? it.lineageId} name={it.label} domainId={it.domainId} facts={isLibrary(f) ? f : null} createdNote={it.origin === "USER" ? "you created it" : null} />;
            })
          )}

        {items("TOPIC").length > 0 &&
          sec(
            "What to learn",
            "write cards on it in its Domain; review them when due",
            items("TOPIC").map((it) => {
              const f = it.domainId ? index.get(it.domainId) : undefined;
              return <TopicRow key={it.id ?? it.lineageId} target={{ row: editorRowOf(it), item: it, milestone: m }} stage="active" domainName={f?.name ?? it.proposedName} facts={isLibrary(f) ? f : null} />;
            })
          )}

        {items("PRACTICE").length > 0 &&
          sec(
            "What to practise",
            started ? "on Today under this goal" : "goes to Today when you start it",
            items("PRACTICE").map((it) => (
              <PracticeRow key={it.id ?? it.lineageId} target={{ row: editorRowOf(it), item: it, milestone: m }} stage="active" kept={current.practiceKept?.[it.lineageId] ?? null} />
            ))
          )}

        {m.notes.length > 0 && (
          <div className="rm-ms-sec">
            {m.notes.map((n) => (
              <p key={n} className="t-meta" style={{ margin: 0 }}>
                {MILESTONE_NOTE_LINE[n]}
              </p>
            ))}
          </div>
        )}

        {items("STEP").length > 0 &&
          sec(
            "Steps",
            "you tick these",
            items("STEP").map((it) => {
              const done = current.stepDone?.[it.lineageId] ?? null;
              const cls = provenanceOf(it.origin, it.decision);
              if (cls === "DRAFT" || cls === "KEPT_SUGGESTION") return <ItemRow key={it.id ?? it.lineageId} target={{ row: editorRowOf(it), item: it, milestone: m }} stage="active" kindLabel="Step" />;
              return done ? (
                <div key={it.id ?? it.lineageId} className="rm-done-l">
                  <RoadmapGlyph name="tick" />
                  <div>
                    <p className="rm-it-l">{it.label}</p>
                    <div className="rm-it-m">done {dayWithWeekday(done, today)}</div>
                  </div>
                </div>
              ) : (
                <div key={it.id ?? it.lineageId} className="rm-dr" style={{ paddingBottom: 0 }}>
                  <RoadmapGlyph name="step" />
                  <div>
                    <p className="rm-it-l">{it.label}</p>
                    {started && it.templateId && (
                      <div className="rm-it-m">
                        <Link className="rm-ilink" href={todayTaskHref(it.templateId)}>
                          On Today
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

        {checkpoint && (
          <div className="rm-ms-sec" id="checkpoint">
            <div className="rm-ms-sh">
              <span className="t-eyebrow">Checkpoint</span>
              <span className="rm-cap">context only</span>
            </div>
            {/* Through ItemRow, so its words keep their chip (a kept checkpoint still reads "Gemini's words …") and its ⋯. */}
            <ItemRow
              target={{ row: editorRowOf(checkpoint), item: checkpoint, milestone: m }}
              stage="active"
              kindLabel={checkpoint.checkpointKind ? CHECKPOINT_KIND_WORD[checkpoint.checkpointKind] : "a test of your own"}
              meta={
                <>
                  {current.checkpointLog
                    ? `you logged ${current.checkpointLog.score}/${current.checkpointLog.outOf} on ${dayLabel(current.checkpointLog.day, today)}`
                    : "no score logged yet"}
                  {checkpoint.bar != null && checkpoint.outOf != null ? ` · your bar ${checkpoint.bar} of ${checkpoint.outOf}` : ""} · doesn&apos;t move your progress
                </>
              }
            >
              {started && (
                <div className="rm-acts">
                  <ChipButton onClick={() => setLogOpen(true)}>Log a score</ChipButton>
                </div>
              )}
            </ItemRow>
            <CheckpointSheet open={logOpen} onClose={() => setLogOpen(false)} item={checkpoint} />
          </div>
        )}

        {!started && !current.starting && !current.pastDue && (
          <div className="rm-ms-sec">
            <p className="t-body" style={{ margin: 0 }}>
              Start milestone {m.ord} when you&apos;re ready.
            </p>
            {current.stated != null && (
              <p className="t-meta" style={{ marginTop: 4 }}>
                Becomes a Mid goal on Today · <PaysLine text={statedLine(current.stated, current.zeroReason, current.paidOn, today)} />.
              </p>
            )}
            {view.goalsLive ? (
              <Button variant="primary" block style={{ marginTop: 12 }} onClick={onStartOpen}>
                Start milestone {m.ord}
              </Button>
            ) : (
              <p className="t-meta rm-ink1" style={{ marginTop: 8 }}>
                Starting milestones arrives with the next update.
              </p>
            )}
          </div>
        )}

        {current.starting && (
          <div className="rm-ms-sec">
            <p className="t-body" style={{ margin: 0 }}>
              Starting milestone {m.ord} didn&apos;t finish.
            </p>
            <div className="rm-acts">
              <Button variant="primary" disabled={pending} onClick={() => m.id && run((a) => a.finishStarting(m.id!))}>
                Finish starting
              </Button>
              <Button variant="quiet" disabled={pending} onClick={() => m.id && run((a) => a.returnStarting(m.id!))}>
                Return it to planned
              </Button>
            </div>
            {error && <ActionError>{error}</ActionError>}
          </div>
        )}
      </section>
      {current.goalId && <RescheduleSheet open={resched} onClose={() => setResched(false)} goalId={current.goalId} ord={m.ord} today={today} />}
    </div>
  );
}

// ── Triggers and levers ─────────────────────────────────────────────────────

function Triggers({ view, current, onReplan }: { view: RoadmapView; current: CurrentMilestoneView | null; onReplan: () => void }) {
  const [resched, setResched] = useState(false);
  const { run, pending, error } = useRoadmapAction();
  const behind = view.triggers.find((t) => t.trigger === "QUESTS_BEHIND");
  const others = view.triggers.filter((t) => t.trigger !== "QUESTS_BEHIND");
  if (view.triggers.length === 0) return null;
  const ord = current?.milestone.ord ?? behind?.milestoneOrd ?? 0;
  const banner = behind ? behindBannerOf(behind.line, ord) : null;
  const later = view.milestones.filter((r) => r.ord > ord && r.state !== "LATER").map((r) => r.ord);
  const laterLine = later.length > 1 ? `Milestones ${later[0]} to ${later[later.length - 1]}` : later.length === 1 ? `Milestone ${later[0]}` : "later milestones";
  return (
    <div className="rm-o2 rm-stack">
      {behind && (
        <>
          <section className="card rm-banner">
            <p className="rm-banner-t">
              <b>{banner!.head}</b>
              {banner!.body}
            </p>
          </section>
          <section className="card pad">
            <div className="t-eyebrow">What acts on Milestone {ord}</div>
            <div className="rm-lever">
              {current?.goalId && (
                <>
                  <Button variant="primary" className="rm-btn-wrap" onClick={() => setResched(true)}>
                    Reschedule Milestone {ord}
                  </Button>
                  <p className="t-meta">A later due day counts as Carried when you close it.</p>
                </>
              )}
              {current?.stated != null && current.stated > 0 && (
                <p className="t-meta rm-ink1">
                  Or let it close short: it <PaysLine text={statedLine(current.stated, null)} />.
                </p>
              )}
              {later.length > 0 && (
                <>
                  <Button className="rm-btn-wrap" disabled={pending} onClick={() => run((a) => a.replan(view.header!.id, "REFIT"))}>
                    Re-fit later milestones
                  </Button>
                  <p className="t-meta">This re-fits {laterLine}; it doesn&apos;t change Milestone {ord}.</p>
                </>
              )}
              {error && <ActionError>{error}</ActionError>}
            </div>
          </section>
          {current?.goalId && <RescheduleSheet open={resched} onClose={() => setResched(false)} goalId={current.goalId} ord={ord} today={view.today} />}
        </>
      )}
      {others.length > 0 && (
        <section className="card rm-banner">
          <div className="rm-banner-t">
            {others.map((t) => (
              <p key={`${t.trigger}-${t.milestoneOrd}`} style={{ margin: "0 0 4px" }}>
                {t.line}
              </p>
            ))}
          </div>
          <Button variant="primary" onClick={onReplan}>
            Re-plan
          </Button>
        </section>
      )}
    </div>
  );
}

// ── Milestones ──────────────────────────────────────────────────────────────

function StartAgain({ row }: { row: MilestoneRowView }) {
  const { run, pending, error } = useRoadmapAction();
  return (
    <>
      <p className="t-meta">{START_AGAIN_LINE}</p>
      <div className="rm-acts" style={{ marginTop: 4 }}>
        <ChipButton
          disabled={pending}
          onClick={() => run((a) => a.startAgain(row.id), () => pushToast({ title: `Milestone ${row.ord} planned again`, body: "Start it from Now when you're ready." }))}
        >
          Start again
        </ChipButton>
      </div>
      {error && <ActionError>{error}</ActionError>}
    </>
  );
}

function MilestonesList({
  rows,
  today,
  targetDay,
  open,
  positions,
  paragon,
}: {
  rows: readonly MilestoneRowView[];
  today: string;
  targetDay: string;
  open: boolean;
  /** The plan's positions (positionsOf): the count every surface reads. */
  positions: number;
  /** The Aim rank's own top says Paragon comes with the aim (rank.top.withAim). */
  paragon: boolean;
}) {
  let best = 0;
  const gives = new Map<string, boolean>();
  for (const r of [...rows].sort((a, b) => a.ord - b.ord)) {
    const g = r.rankIndex != null && r.rankIndex > best;
    gives.set(r.id, g);
    if (r.rankIndex != null) best = Math.max(best, r.rankIndex);
  }
  return (
    <div className="rm-o4">
      <SectionHeader title="Milestones" aside={`${positions} · to ${dayLabel(targetDay, today)}`} />
      <section className="card">
        {rows.map((r) => {
          const parts = r.rankIndex != null && gives.get(r.id);
          return (
            <details key={r.id} className="rm-ml">
              <summary className={cx("rm-ml-row", r.state === "LATER" && "rm-ml-later")}>
                <span className={cx("rm-ms-n", r.state === "CURRENT" && "rm-ms-n-cur", r.state === "REACHED" && "rm-ms-n-done")}>{r.ord}</span>
                <div>
                  <b>
                    <StruckLabel label={r.title} struck={r.titleStruck} />
                  </b>
                  <TitleClassChip cls={r.titleClass} />
                  <span className="t-meta">{milestoneRowLine(r, today)}</span>
                </div>
                <span className="rm-ml-r">
                  {r.percent != null ? `${r.percent}%` : r.closedPercent != null ? `${r.closedPercent}%` : ""}
                  {r.state !== "CLOSED_UNREACHED" && <small>{parts ? `→ ${aimRankName(r.rankIndex!)}` : r.rankIndex != null ? "keeps your rank" : ""}</small>}
                </span>
              </summary>
              <div className="rm-ml-more">
                <p className="t-meta">{r.windowStart && r.dueDay ? spanLabel(r.windowStart, r.dueDay, today) : "No dates: a Later milestone gets its dates when a re-plan brings it back."}</p>
                {r.rankIndex != null && r.state !== "CLOSED_UNREACHED" && (
                  <p className="t-meta">{parts ? `Reaching it gives the Aim rank ${aimRankName(r.rankIndex)}.` : "Reaching it keeps your rank."}</p>
                )}
                {r.state === "CURRENT" && (
                  <p className="t-meta">
                    <a className="rm-ilink" href="#now">
                      Its week quests and measures are in Now
                    </a>
                  </p>
                )}
                {startAgainOffered(r, rows, open) && <StartAgain row={r} />}
              </div>
            </details>
          );
        })}
        {paragon && (
          <p className="rm-note rm-note-top">
            {PARAGON_PARTS.lead} {PARAGON_PARTS.name}.
          </p>
        )}
      </section>
    </div>
  );
}

// ── Reference ───────────────────────────────────────────────────────────────

function Reference({ view, current }: { view: RoadmapView; current: CurrentMilestoneView | null }) {
  const [open, setOpen] = useState(false);
  const [measured, setMeasured] = useState(false);
  const [worked, setWorked] = useState(false);
  const header = view.header!;
  const f = view.feasibility;
  const cur = current ? (f?.milestones.find((x) => x.lineageId === current.milestone.lineageId) ?? null) : null;
  const others = f ? f.milestones.filter((x) => x !== cur) : [];
  const drafted = referenceRunOf(view);
  return (
    <div className="rm-ref rm-o5" data-open={open ? "1" : undefined}>
      <button type="button" className="rm-ref-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <b>How this is worked out</b>
        <span>capacity · realism · drafting · measuring</span>
        <Icon name="chev" />
      </button>
      <div className="rm-ref-b">
        <div>
          <SectionHeader title="Your capacity" aside="what the app has seen" />
          <ThroughputPanel throughput={view.throughput} hoursPerWeek={header.hoursPerWeek} />
        </div>
        <div>
          <SectionHeader
            title="Is this realistic?"
            aside={
              <button type="button" className="rm-hit rm-ilink" onClick={() => setWorked(true)}>
                Constants
              </button>
            }
          />
          <section className="card">
            {cur && current ? (
              <ChecksPanel
                roadmapId={header.id}
                mf={cur}
                aimCheck={f?.aimCheck ?? header.aimCheck}
                intensity={header.intensity}
                dueDay={current.milestone.dueDay}
                m={f?.m ?? 1}
                today={view.today}
                title={`Milestone ${current.milestone.ord}`}
                throughput={view.throughput}
                hoursPerWeek={header.hoursPerWeek}
                intakeEditable={false}
              />
            ) : (
              <p className="rm-ms-sec t-meta" style={{ borderTop: 0 }}>
                The checks show here once a milestone is current.
              </p>
            )}
            {others.length > 0 && (
              <div className="rm-ms-sec">
                <div className="t-eyebrow">Other milestones · as accepted</div>
                <ul className="rm-oi-list" style={{ marginTop: 6 }}>
                  {others.map((x) => (
                    <li key={x.lineageId} className="rm-oi">
                      <div className="rm-vds">
                        <span className="t-meta" style={{ minWidth: 16 }}>
                          {x.ord}
                        </span>
                        {x.knowledge.map((k) => (
                          <VerdictChip key={k.measureKey} verdict={k.verdict} />
                        ))}
                        <VerdictChip verdict={x.time.verdict} unverified={x.time.unverified} />
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="rm-cap" style={{ marginTop: 6 }}>
                  {TIME_FIXED_LINE}
                </p>
              </div>
            )}
          </section>
        </div>
        <div>
          <SectionHeader title="How this was drafted" />
          {/* The run behind the accepted plan (acceptedRun); the latest run only as "Latest run", never "Drafted by". */}
          {drafted.run && (
            <p className="t-meta" style={{ margin: "0 4px 8px" }}>
              <RunFacts run={drafted.run} today={view.today} label={drafted.label} />
            </p>
          )}
          {drafted.run && <RunTable run={drafted.run} today={view.today} label={drafted.label} />}
          <section className="card rm-tp" style={{ marginTop: 8 }}>
            <div>
              <span className="rm-tp-k">Plan history</span>
              <span className="rm-tp-v">v{header.version}</span>
              <PlanHistory rows={view.history} today={view.today} />
            </div>
          </section>
        </div>
        <section className="card rm-note">
          <RoadmapGlyph name="info" />
          <span>
            <b>How this is measured</b> Cards your reviews bring to a level are tested; cards you add are counted by the app; practice sessions and steps are your own ticks.
            Proficiency, the Aim rank and week quests are worked out from those rows. No model judges progress.{" "}
            <button type="button" className="rm-ilink" onClick={() => setMeasured(true)}>
              Open
            </button>
          </span>
        </section>
      </div>
      <HowMeasuredSheet open={measured} onClose={() => setMeasured(false)} />
      <WorkedOutSheet open={worked} onClose={() => setWorked(false)} m={f?.m ?? 1} />
    </div>
  );
}

// ── Aftercare and footer ────────────────────────────────────────────────────

function Aftercare({ view }: { view: RoadmapView }) {
  const [kept, setKept] = useState<Set<string>>(new Set());
  const { run, pending, error, runtime } = useRoadmapAction();
  const rows = view.aftercare.filter((r) => !kept.has(r.templateId));
  // "Keep on Today" is stored (StartSnapshot.aftercareKept through R4's keepOnToday), so the row stops asking.
  // The id names the roadmap (the server finds the milestone holding the practice); the row's own when known.
  const keep = (r: (typeof rows)[number]) => {
    const hide = () => setKept((s) => new Set([...s, r.templateId]));
    const milestoneId = aftercareMilestoneIdOf(r, view.milestones) ?? view.milestones[0]?.id ?? null;
    if (!milestoneId) return hide();
    run((a) => a.keepOnToday(milestoneId, r.templateId), hide);
  };
  if (rows.length === 0) return null;
  const ords = Array.from(new Set(rows.map((r) => r.milestoneOrd))).sort((a, b) => a - b);
  return (
    <div className="rm-o6">
      <SectionHeader title={`Still on Today from milestone${ords.length > 1 ? "s" : ""} ${ords.join(", ")}`} />
      <section className="card pad">
        {rows.map((r) => (
          <div key={r.templateId} className="rm-dr">
            <Icon name="today" />
            <div>
              <b>{r.title}</b>
              <div className="t-meta">on Today · from milestone {r.milestoneOrd}</div>
              <div className="rm-dr-acts">
                <ChipButton disabled={pending} onClick={() => keep(r)}>
                  Keep on Today
                </ChipButton>
                <ChipButton
                  disabled={pending}
                  onClick={() =>
                    run(
                      (a) => a.archiveTask(r.templateId),
                      () =>
                        pushToast({
                          title: "Archived",
                          body: `${r.title} left Today.`,
                          action: { label: "Undo", onAction: () => void runtime.actions.unarchiveTask(r.templateId).then(() => runtime.refresh()) },
                        })
                    )
                  }
                >
                  Archive
                </ChipButton>
              </div>
            </div>
          </div>
        ))}
        <p className="t-meta">Nothing is archived silently: each waits for your choice.</p>
        {error && <ActionError>{error}</ActionError>}
      </section>
    </div>
  );
}

function Footer({ view, current, onReplan }: { view: RoadmapView; current: CurrentMilestoneView | null; onReplan: () => void }) {
  const [archive, setArchive] = useState(false);
  const [done, setDone] = useState(false);
  const header = view.header!;
  if (header.status !== "ACTIVE") return null;
  const reached = Boolean(header.reachedDay);
  return (
    <div className="rm-o7 rm-acts" id="archive" style={{ marginTop: 0 }}>
      {reached && (
        <Button variant="primary" onClick={() => setDone(true)}>
          Mark the aim done
        </Button>
      )}
      <Button onClick={onReplan}>Re-plan</Button>
      <Button variant="danger" onClick={() => setArchive(true)}>
        Archive
      </Button>
      {!reached && (
        <Button variant="quiet" onClick={() => setDone(true)}>
          Mark done
        </Button>
      )}
      <ArchiveSheet open={archive} onClose={() => setArchive(false)} roadmapId={header.id} openGoal={Boolean(current?.goalId)} />
      <MarkDoneSheet open={done} onClose={() => setDone(false)} roadmapId={header.id} reached={reached} />
    </div>
  );
}

// ── ACTIVE / DONE / ARCHIVED ────────────────────────────────────────────────

function LivingRoadmap({ view, startPreview }: { view: RoadmapView; startPreview?: StartPreview | null }) {
  const header = view.header!;
  const current = view.current as CurrentMilestoneView | null;
  const [replan, setReplan] = useState(false);
  const [start, setStart] = useState(Boolean(startPreview));
  const index = useMemo(() => domainIndexOf(view), [view]);
  const scope = useMemo(() => editorScopeOf(view, current ? [current.milestone] : []), [view, current]);
  const scheduled = positionsOf(view);
  const closed = header.status !== "ACTIVE";
  const body = (
    <div className="rm-cols">
      <div className="rm-col">
        <AimHeader className="rm-o1" header={header} rank={view.rank} proficiency={view.proficiency} today={view.today} scheduled={scheduled} writesOff={view.writesOff} />
        {!closed && <Triggers view={view} current={current} onReplan={() => setReplan(true)} />}
        {!closed && view.draft && (
          <div className="rm-o2" id="replan">
            <DraftReview view={view} mode="replan" />
          </div>
        )}
        {!closed && current && <NowSection view={view} current={current} onStartOpen={() => setStart(true)} />}
        {view.milestones.length > 0 && (
          <MilestonesList rows={view.milestones} today={view.today} targetDay={header.targetDay} open={!closed} positions={scheduled} paragon={paragonLineShown(view.rank)} />
        )}
        <Footer view={view} current={current} onReplan={() => setReplan(true)} />
      </div>
      <div className="rm-col">
        {view.toward && (
          <div className="rm-o3">
            <SectionHeader title="Toward the aim" aside={header.firstAcceptedDay ? `since you began · ${dayLabel(header.firstAcceptedDay, view.today)}` : undefined} />
            <TowardAim
              toward={view.toward}
              rows={view.milestones}
              aim={header.aim}
              cardsArea={header.area.kind === "FIELD"}
              m={view.feasibility?.m ?? 1}
              today={view.today}
              firstAcceptedDay={header.firstAcceptedDay}
              domainIndex={index}
              writesOff={view.writesOff}
            />
          </div>
        )}
        {!closed && <Reference view={view} current={current} />}
        {view.aftercare.length > 0 && <Aftercare view={view} />}
      </div>
    </div>
  );
  return (
    <>
      {scope ? <ItemEditor scope={scope}>{body}</ItemEditor> : body}
      {!closed && <ReplanSheet open={replan} onClose={() => setReplan(false)} roadmapId={header.id} startedOrd={current?.goalId ? current.milestone.ord : null} />}
      {!closed && current && scope && (
        <ItemEditor scope={scope}>
          <StartSheet open={start} onClose={() => setStart(false)} milestone={current.milestone} today={view.today} initial={startPreview ?? null} />
        </ItemEditor>
      )}
    </>
  );
}

/** The screen for one RoadmapView (the page and the fixtures render it). */
export function RoadmapScreen({ view, startPreview }: { view: RoadmapView; /** Fixtures: a Start sheet already computed (it opens with it). */ startPreview?: StartPreview | null }) {
  const writesOffNote = view.writesOff ? (
    <section className="card rm-note" style={{ marginBottom: 16 }}>
      <RoadmapGlyph name="info" />
      <span>{WRITES_OFF_BANNER}</span>
    </section>
  ) : null;
  let screen: ReactNode = null;
  if (view.state === "NONE" || !view.header) screen = <EmptyRoadmap hasKey={view.hasKey} />;
  else if (view.state === "RUNNING" && view.run) screen = <DraftRunning view={view} />;
  else if (view.state === "DRAFT" && view.draft) screen = <DraftReview view={view} />;
  else screen = <LivingRoadmap view={view} startPreview={startPreview} />;
  return (
    <>
      {writesOffNote}
      {screen}
    </>
  );
}

