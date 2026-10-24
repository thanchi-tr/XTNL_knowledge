"use client";

import "@/components/home/week-audit.css";
import { useMemo } from "react";
import { addDays, weekKeyOf, weekStartKeyOf, type DayKey } from "@/lib/life-day";
import { buildBoard, type BoardData, type BoardInstance, type BoardRow, type BoardTemplate, type DayLedger } from "@/lib/today-board";
import { parseCapture } from "@/lib/capture-parse";
import { captureShapeOf } from "@/lib/capture-shape";
import { sideQuestCandidatesOf, sideTagKeyOf, sideWeekOf, type SideQuestDraft, type SideQuestFacts, type SideQuestTemplate } from "@/lib/side-quests";
import { weekAuditOf, type AuditTemplate } from "@/lib/week-audit";
import { SectionHeader } from "@/components/ui/Tabs";
import { TaskRow } from "@/components/today/TaskRow";
import { TaskDrawer } from "@/components/today/TaskDrawer";
import { Lane } from "@/components/today/Lane";
import { CaptureChips } from "@/components/capture/CaptureChips";
import { WeekAuditCard } from "@/components/home/WeekAudit";
import { FIXTURE_TODAY, fixtureTemplate } from "./fixtures";

const noop = () => {};
const T = FIXTURE_TODAY;
const at = (day: DayKey, hh: number) => new Date(`${day}T${String(hh).padStart(2, "0")}:00:00+10:00`).toISOString();
const ledger = (day: DayKey): DayLedger => ({ day, rawBefore: 0, lifeXp: 0, completions: [], reviews: 0, reviewXp: 0, ideas: 0, dayOpenQty: null });
// The drawer's steps never reach the server here.
const STEPS_SAVE = {
  add: async () => ({ ok: false as const, error: "Fixtures only." }),
  rename: async () => ({ ok: false as const, error: "Fixtures only." }),
  remove: async () => ({ ok: false as const, error: "Fixtures only." }),
};

/** The detectors' own drafts (side-quests sideQuestCandidatesOf) for a made-up day: their titles, sizes, notes and expiry. */
function draftsOn(day: DayKey, over: Partial<SideQuestFacts>): SideQuestDraft[] {
  return sideQuestCandidatesOf({
    today: day,
    weekKey: weekKeyOf(day),
    heldToday: false,
    restDays: 0,
    effortMinutes: 999,
    questRows: [],
    rows: [],
    templates: new Map<string, SideQuestTemplate>([
      ["gym", { id: "gym", title: "Gym legs", track: "BODY", intrinsic: false, autoMetric: null, mvv: "10 squats" }],
      ["tax", { id: "tax", title: "Lodge the tax return", track: "DUTY", intrinsic: false, autoMetric: null, mvv: null }],
    ]),
    usedKeys: new Set(),
    open: 0,
    ...over,
  });
}

/** A draft as the template the detectors write (tasks.ts createTemplateCore over side-quests sideParsedOf). */
const draftTemplate = (id: string, d: SideQuestDraft, offered: DayKey, over: Partial<BoardTemplate> = {}): BoardTemplate =>
  fixtureTemplate({ id, title: d.title, track: d.track, estMinutes: d.estMinutes, machineMinutes: d.estMinutes, band: "INTRO", lexicalBand: "INTRO", dueKind: "DEADLINE", dueDay: d.expiresDay, captureKey: d.key, note: d.note, startDay: offered, createdAt: at(offered, 9), ...over });

/** A '#side' line as it is stored (capture-shape over the parse; its key 'side:tag:<the line's key>'). */
function lineTemplate(id: string, line: string, over: Partial<BoardTemplate> = {}): BoardTemplate {
  const p = parseCapture(line, { today: T });
  const s = captureShapeOf(p, T);
  return fixtureTemplate({ id, title: p.title, estMinutes: 30, machineMinutes: 30, ...s, captureKey: sideTagKeyOf(`fixture-${id}`), startDay: T, createdAt: at(T, 8), ...over });
}

/**
 * /dev/style/today · Side quests (blueprint P31, D35): the views a side quest draws, from the real builders over made-up
 * rows, so each can be seen at 344 px without a server (a '#side' capture on a dev server would write: dev and prod share
 * one database). The rows (open with the longest label, open on its last day, done, and yesterday's record window), two
 * drawers (a detector's note; a '#side' line on its last day, its move refused), the weekly audit's lane and the
 * capture chips. Every figure is a fixture.
 */
export function SideFixtures() {
  const v = useMemo(() => {
    const monday = weekStartKeyOf(T);
    // Wednesday's must detector (Gym legs missed twice by then): offered for Wednesday and 2 more, so 'expires tomorrow'.
    const prepare = draftsOn(addDays(T, -1), { questRows: [{ templateId: "gym", cells: ["0", "0", "o", "f", "f", "f", "f"] }] }).find((d) => d.detector === "must")!;
    // Today's body detector (Thursday, 40 of 150), done this morning.
    const walk = draftsOn(T, { effortMinutes: 40 }).find((d) => d.detector === "body")!;
    // Monday's late detector (the tax return 6 days past its deadline): it expired yesterday, so yesterday's window holds it.
    const decide = draftsOn(monday, {
      rows: [{ lane: "today", day: monday, state: "open", strength: null, late: true, heldToday: false, template: { id: "tax", recurrence: null, dueKind: "DEADLINE", dueDay: addDays(monday, -6), captureKey: null, autoMetric: null, intrinsic: false } }],
    }).find((d) => d.detector === "late")!;
    const templates: BoardTemplate[] = [
      draftTemplate("s-prepare", prepare, addDays(T, -1)),
      lineTemplate("s-bike", "fix the bike #side today"),
      draftTemplate("s-walk", walk, T, { completedAt: at(T, 8) }),
      draftTemplate("s-decide", decide, monday),
      fixtureTemplate({ id: "groceries", title: "Groceries", estMinutes: 20, machineMinutes: 20, dueKind: "PLANNED", dueDay: T }),
    ];
    const instances: BoardInstance[] = [{ id: "i-walk", templateId: "s-walk", day: T, slot: 0, status: "DONE", source: "manual", xpPaid: 3.4 }];
    const data: BoardData = { today: T, yesterday: addDays(T, -1), capacityMin: 240, templates, instances, stats: {}, ledger: { today: ledger(T), yesterday: ledger(addDays(T, -1)) }, paid: {}, goalQty: {}, dueNow: 0 };
    const board = buildBoard(data);
    // The audit's lane: this week's side quests (offered, done), beside one daily quest, provisional on Thursday.
    const gym: AuditTemplate = { id: "gym", title: "Gym legs", kind: "HABIT", recurrence: "DAILY", startDay: "2026-09-01", dueDay: null, dueKind: null, compulsory: true, compulsoryOnRest: false, inbox: false, archivedDay: null };
    const side = sideWeekOf(
      templates.filter((t) => t.captureKey?.startsWith("side:")).map((t) => ({ captureKey: t.captureKey ?? null, createdAt: new Date(t.createdAt), completedAt: t.completedAt ? new Date(t.completedAt) : null, archivedAt: null })),
      monday
    );
    const audit = weekAuditOf({
      week: { weekKey: weekKeyOf(T), monday, sunday: addDays(monday, 6) },
      launchDay: "2026-09-07",
      templates: [gym],
      instances: [0, 1, 2].map((i) => ({ templateId: "gym", day: addDays(monday, i), status: i === 1 ? "DONE" : "MISSED" })),
      side,
      today: T,
      now: new Date(at(T, 9)),
    });
    const chips = [
      { key: "chip-side", title: "'#side' on a one-off: its expiry named", text: "fix the bike #side", work: false },
      { key: "chip-must", title: "'#side' with a Must: never a must", text: "pay the fine #side fri !", work: false },
      { key: "chip-repeat", title: "'#side' on a line that repeats: not taken", text: "stretch #side daily", work: false },
      { key: "chip-work", title: "'#side' on a work tab: not taken, the Must as typed", text: "call the supplier #side fri !", work: true },
    ].map((c) => ({ ...c, parsed: parseCapture(c.text, { today: T, work: c.work }) }));
    return { board, audit, chips };
  }, []);

  const row = (r: BoardRow, drawer?: boolean) => (
    <TaskRow
      key={r.key}
      row={r}
      projection={r.projection}
      drawerOpen={!!drawer}
      undoable={false}
      busy={false}
      receiptOpen={false}
      receiptId="dev-side-receipt"
      onTick={noop}
      onUndo={noop}
      onToggleDrawer={noop}
      onToggleReceipt={noop}
    >
      {drawer && (
        <TaskDrawer
          row={r}
          now={Date.parse(at(T, 9))}
          today={T}
          minutes={null}
          onMinutes={noop}
          projection={r.projection}
          minimumProjection={null}
          busy={false}
          working={null}
          onDone={noop}
          onMinimum={noop}
          onSkip={noop}
          onTomorrow={noop}
          onAgain={noop}
          onRename={noop}
          onArchive={noop}
          onOverride={noop}
          onResize={noop}
          noMonth
          stepsSave={STEPS_SAVE}
          onDefer={noop}
          onAbort={noop}
        />
      )}
    </TaskRow>
  );
  const today = v.board.todayRows;
  const byId = (id: string) => [...today, ...v.board.yesterdayRows].find((r) => r.template.id === id);
  const prepare = byId("s-prepare");
  const bike = byId("s-bike");

  return (
    <>
      <SectionHeader title="Side quests (P31)" aside="the rows, two drawers, the audit's lane and the '#side' chips · built by the real rules over made-up rows; nothing here writes" />
      <div className="dev-grid">
        <div className="dev-quest" data-state="side-rows">
          <p className="t-meta">Today: open side quests ask nothing of the day (the longest label first, one on its last day), one done, an ordinary row for comparison.</p>
          <Lane id="dev-side-today" title="Today" count={`${today.filter((r) => r.state === "done").length} done`}>
            {today.map((r) => row(r))}
          </Lane>
          <Lane id="dev-side-yesterday" title="Yesterday" count="record window">
            {v.board.yesterdayRows.map((r) => row(r))}
          </Lane>
        </div>
        <div className="dev-quest" data-state="side-drawers">
          <p className="t-meta">A detector&apos;s side quest: its note says why. No Defer… on a side quest; Abort… drops it.</p>
          {prepare && row(prepare, true)}
          <p className="t-meta">A &apos;#side&apos; line on its last day: what a side quest is, and Tomorrow refused in place of the pill.</p>
          {bike && row(bike, true)}
        </div>
        <div className="dev-quest" data-state="side-audit">
          <p className="t-meta">The weekly audit: side quests on a lane of their own, never in the rate.</p>
          <WeekAuditCard audit={v.audit} today={T} headingId="dev-side-wa-h" />
        </div>
        <div className="dev-quest" data-state="side-chips">
          {v.chips.map((c) => (
            <div key={c.key} className="dev-quest">
              <p className="t-eyebrow">{c.title}</p>
              <p className="t-meta">{c.text}</p>
              <CaptureChips
                text={c.text}
                parsed={c.parsed}
                goals={[]}
                rawBefore={0}
                onRevert={noop}
                compact={false}
                feedsOpen={false}
                onToggleFeeds={noop}
                duplicate={null}
                mustBlocked={false}
                mustFixes={[]}
                onFix={noop}
                duty={{ today: T, launchDay: null }}
                proof={{ live: false, work: c.work }}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
