"use client";

/**
 * The Aim card on /you (lane R5; F19; roadmap-rev4.md F-R4-1, F-R4-2,
 * F-R4-11, F-R4-16; final-aim-card.html). Lane Y mounts it directly under
 * CharacterHero, from loadAimCard joined with loadSheet in one Promise.all: no
 * Suspense and no skeleton, so nothing shifts.
 *
 * EMPTY renders by `prompt` (aimPromptOf: the stored switch, then the cookie):
 *   ASK    the full card that asks for the aim in place (.card.rm-ac-call,
 *          data-tour="you-aim"): "Set an aim", the last aim's line (with one),
 *          the body, the true rank line, a 140-character box (it starts from
 *          RoadmapForm's unsent autosave: "Continue where you left off", and
 *          typing writes the same key, so "Not now" and leaving keep the
 *          text), the long-goal seed (with one), a primary that reads "Set an
 *          aim" while the box is empty and "Continue" once it has text (never
 *          disabled; both open /you/roadmap/new, with a sessionStorage
 *          handoff only when there is text or the seed was tapped — never a
 *          URL), and two quiet buttons: "Not now" (4 weeks) and "Don't suggest
 *          this" (the stored no, with an undo toast that names Settings; a
 *          failed Undo says so). The seed shows only while the box is empty,
 *          and the last aim reads on two lines (the aim clipped, the rank in
 *          full), so the card keeps within 410 px at 344.
 *   LATER  rev 3's 56 px line with the new copy; its × is "Not now: no aim
 *          suggestions for 4 weeks" and hides the line for 4 weeks (the
 *          'hide:' cookie, hideAimPrompt; the contract §15.10). With a last
 *          aim: "Last aim: Aim rank Paragon · Set your next aim →".
 *   HIDDEN, OFF   nothing that suggests an aim (the Roadmap tab always
 *          offers "Set an aim"); with a last aim, its achievement alone:
 *          "Last aim: Aim rank Paragon · reached 6 Aug 2026", no link, no ×
 *          (F-R4-2: the achievement never vanishes from the character page).
 * No string here names Gemini; the no-key copy is the same.
 *
 * With an aim: (a) "Aim" with "measured 09:12"; (b) the aim in the user's
 * words; (c) chips: the Area, "Mastered by Nov 2027" (or "by about … ·
 * estimate" while calibrating; rev 3's "by 31 Mar" on a plan with no depth),
 * quietly "Aim not checked", and "Over", "Draft waiting", "Target lowered"
 * when they apply; (d) the Aim rank and Proficiency, labelled with its basis
 * ("Proficiency toward Mastered (level 12)"); (e) "Milestone 3 of 6 ·
 * Retained (level 8)" over one line; (f) week quests; (g) "Open roadmap".
 *
 * DONE (F-R4-2): for RANK_NEW_DAYS after the reach the achievement leads
 * (the held depth, "Open roadmap" primary, "Set your next aim" second); after
 * that, and when the aim wasn't reached, "Set your next aim" leads. No dead
 * end: a closed aim always offers the next one.
 *
 * A plan made before revision 4 (legacy) shows its aim, its Area, the banner
 * (with LEGACY_GEMINI_HIDDEN when view.legacyView says Gemini words were
 * hidden) and its action, and no milestone title (F-R4-16): "Draft it again",
 * "Start again at a depth" (ACTIVE: a handoff with `replaces` and the old
 * plan's own Domains, legacyRestartHandoffOf), or, once DONE, only "Set your
 * next aim" with no `replaces`.
 *
 * A failed "Not now" (the ASK card's snooze, the LATER line's hide) brings
 * back the surface that was tapped with its reason (collapseWrite).
 *
 * "Aim rank" always precedes a rank name. "Mastered" appears only as the
 * stage name of level 12; no "mastery" and no ⬡ except in the stated-pay line
 * from statedPayoutCopy. Never red.
 */
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { SectionHeader } from "@/components/ui/Tabs";
import { pushToast } from "@/components/ui/toast-store";
import { goalPercent } from "@/lib/goals";
import { daysBetween, todayKey } from "@/lib/life-day";
import { AIM_MAX, NOT_RECORDED_HERE, RANK_NEW_DAYS, isAcceptanceReading, type AimCardView, type AreaChip, type LastAimView } from "@/lib/roadmap-types";
import type { Track } from "@/lib/life-types";
import type { AimPrompt, AimSeed } from "@/lib/roadmap-invite";
import { writeAimHandoff, type AimHandoff } from "@/lib/roadmap-handoff";
import { ActionError } from "@/components/home/ActionError";
import {
  AIM_CALL_BODY,
  AIM_CALL_CONTINUE_LINE,
  AIM_CALL_HEADING,
  AIM_CALL_LABEL,
  AIM_CALL_PLACEHOLDER,
  AIM_CALL_PRIMARY,
  AIM_CALL_PRIMARY_TEXT,
  AIM_CALL_RANK_LINE,
  AIM_DONT_SUGGEST,
  AIM_LATER_TAIL,
  AIM_NEXT_AIM,
  AIM_NOT_NOW,
  AIM_NOT_NOW_SET_LABEL,
  AIM_OFF_TOAST,
  AIM_UNDO_FAILED,
  DRAFT_IT_AGAIN_WORD,
  LEGACY_ACTIVE_BANNER,
  LEGACY_DRAFT_BANNER,
  LEGACY_GEMINI_HIDDEN,
  LEGACY_MEASURE_LINE,
  START_AGAIN_AT_DEPTH_WORD,
  TRACK_SIGIL,
  TRACK_WORD,
  acceptanceCaption,
  byLine,
  dayLabel,
  dayWithWeekday,
  depthDateChip,
  givesRankByName,
  heldDepthLine,
  lastAimDayLine,
  measuredLabel,
  pacePhrase,
  pastDueLine,
  pendingReachLine,
  proficiencyPartsLine,
  seedLine,
  stageWords,
  statedLine,
} from "./roadmap-copy";
import { ROADMAP_HREF, ROADMAP_NEW_HREF } from "./roadmap-links";
import { proficiencyBasisLabelOf } from "./roadmap-ui-model";
import { useRoadmapAction, useRoadmapRuntime } from "./roadmap-runtime";
import { readUnsentAim, writeUnsentAim } from "./roadmap-autosave";
import { PaysLine } from "./PaysLine";
import { ProficiencyBlock } from "./ProficiencyBlock";
import { TitleClassChip } from "./ProvenanceChip";
import { RoadmapGlyph } from "./RoadmapGlyph";
import { StruckLabel } from "./StruckLabel";
import { WeekQuestsLine } from "./WeekQuests";
import "@/components/library/study.css";
import "./roadmap.css";

export interface AimCardProps {
  view: AimCardView;
  /** Revision 4: an alias for prompt OFF during the transition (a legacy 'off' cookie or the stored no). */
  promptDismissed?: boolean;
  /** aimPromptOf(cookie, view.aimSuggestions, today): ASK (the full card), LATER (the line), HIDDEN and OFF (only a last aim's achievement line). Absent: ASK, unless promptDismissed. */
  prompt?: AimPrompt;
  /** longGoalSeedOf(s.goals, today): "Start from your long goal “<title>”". */
  seed?: AimSeed | null;
  /** The last aim's line (view.lastAim). */
  lastAim?: LastAimView | null;
  /** Today's life day (the page's todayKey); dates without a year inside it. */
  today?: string;
  /**
   * A fixture seam (/dev/style/art/you): the unsent aim the ASK card starts
   * from in place of RoadmapForm's autosave. When it is passed (or under the
   * fixtures provider) the card neither reads nor writes the real autosave,
   * so a fixture page never puts a made-up aim into the user's form.
   */
  autosaveAim?: string | null;
}

/** The Area chip: the know sigil with the Field and its level, or the track with "practice only". */
export function AreaChipView({ area }: { area: AreaChip }) {
  if (area.kind === "FIELD")
    return (
      <Chip sigil="know">
        {area.name} · level {area.level}
      </Chip>
    );
  return <Chip sigil={TRACK_SIGIL[area.track]}>{TRACK_WORD[area.track]} · practice only</Chip>;
}

function todayOf(today?: string): string {
  return today ?? todayKey();
}

/** The EMPTY state's resolved prompt: the page's (aimPromptOf), with promptDismissed as the transition alias for OFF. */
export function emptyPromptOf(prompt: AimPrompt | undefined, promptDismissed: boolean | undefined): AimPrompt {
  if (promptDismissed) return "OFF";
  return prompt ?? "ASK";
}

/** "Set an aim" while the box is empty, "Continue" once it has words. */
export function askPrimaryWord(text: string): string {
  return text.trim().length > 0 ? AIM_CALL_PRIMARY_TEXT : AIM_CALL_PRIMARY;
}

/**
 * The long-goal seed shows only while the box is empty (lens 3): once the
 * user has typed, tapping it would replace their words with the goal's title
 * (the handoff wins over the autosave), and the card stays inside its 410 px.
 */
export function seedShown(seed: AimSeed | null | undefined, text: string): boolean {
  return seed != null && text.trim().length === 0;
}

/**
 * Which empty-card surface renders (F-R4-1, F-R4-2; the contract §15.10):
 *   ASK     the full card;  LATER   the 56 px line;
 *   HIDDEN, OFF   nothing that suggests an aim — only the last aim's
 *           achievement line when there is one (no link to a new aim, no ×),
 *           so a closed aim's rank never vanishes from the character page.
 */
export type EmptySurface = "ASK" | "LATER" | "KEPT" | "NONE";
export function emptySurfaceOf(prompt: AimPrompt, lastAim: LastAimView | null | undefined): EmptySurface {
  if (prompt === "ASK" || prompt === "LATER") return prompt;
  return lastAim ? "KEPT" : "NONE";
}

/**
 * The ASK card's last-aim line, in two lines so the achievement never clips
 * at 344 px: the aim (one line, ellipsised) and then "Aim rank Paragon ·
 * reached 6 Aug 2026" in full.
 */
function LastAimLines({ lastAim }: { lastAim: LastAimView }) {
  return (
    <div className="t-meta rm-ac-last">
      <p className="rm-ac-last-aim">Last aim: “{lastAim.aim}”</p>
      <p className="rm-ac-last-rank">
        Aim rank <b>{lastAim.rankName}</b> · {lastAimDayLine(lastAim)}
      </p>
    </div>
  );
}

/** HIDDEN or OFF with a last aim: the achievement alone — no link to a new aim, no ×, no data-tour (it invites nothing). */
function KeptLine({ lastAim }: { lastAim: LastAimView }) {
  return (
    <section className="card rm-ac-empty rm-ac-kept" aria-label="Last aim">
      <span className="rm-ac-later-t">
        Last aim: Aim rank <b>{lastAim.rankName}</b> · {lastAimDayLine(lastAim)}
      </span>
    </section>
  );
}

/** The ASK card (F-R4-1): the aim asked in place, one sentence and one tap. */
function AskCard({
  seed,
  lastAim,
  autosaveAim,
  onNotNow,
  onOff,
}: {
  seed: AimSeed | null;
  lastAim: LastAimView | null;
  autosaveAim: string | null | undefined;
  onNotNow: () => void;
  onOff: () => void;
}) {
  const runtime = useRoadmapRuntime();
  const { run, pending, error } = useRoadmapAction();
  const ids = { h: useId(), box: useId() };
  // The fixture seam replaces the real autosave; the fixtures provider never touches it either.
  const seam = autosaveAim !== undefined;
  const storage = !seam && !runtime.fixture;
  const [text, setText] = useState(seam ? (autosaveAim ?? "") : "");
  const [continuing, setContinuing] = useState(seam && Boolean(autosaveAim?.trim()));
  const read = useRef(false);

  // After mount: an unfinished aim is never lost (RoadmapForm's unsent autosave, read in a try/catch).
  useEffect(() => {
    if (read.current || !storage) return;
    read.current = true;
    const unsent = readUnsentAim();
    if (unsent) {
      // A stored form is an external system read once after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText(unsent.slice(0, AIM_MAX));
      setContinuing(true);
    }
  }, [storage]);

  const type = (v: string) => {
    setText(v);
    if (storage) writeUnsentAim(v);
  };
  // The handoff carries only what the user typed or chose; the aim never travels in a URL. Fixtures write nothing.
  const go = () => {
    const aim = text.replace(/\s+/g, " ").trim();
    if (aim && !runtime.fixture) writeAimHandoff({ aim, source: "you" });
  };
  const fromSeed = () => {
    if (!seed || runtime.fixture) return;
    writeAimHandoff({ aim: seed.title, source: "goal", ...(seed.targetDay ? { targetDay: seed.targetDay } : {}) });
  };
  const dontSuggest = () => run((a) => a.setAimSuggestions(false), () => onOff(), { refresh: false });

  return (
    <div>
      <SectionHeader title="Aim" />
      <section className="card rm-ac-call" data-tour="you-aim" aria-labelledby={ids.h}>
        <h3 className="rm-ac-h" id={ids.h}>
          {AIM_CALL_HEADING}
        </h3>
        {lastAim && <LastAimLines lastAim={lastAim} />}
        <p className="rm-ac-body">{AIM_CALL_BODY}</p>
        <p className="t-meta rm-ac-rank">{AIM_CALL_RANK_LINE}</p>
        {continuing && text.trim() && <p className="t-meta rm-ac-cont">{AIM_CALL_CONTINUE_LINE}</p>}
        <label className="sr-only" htmlFor={ids.box}>
          {AIM_CALL_LABEL}
        </label>
        <textarea id={ids.box} className="st-input rm-ac-box" rows={2} maxLength={AIM_MAX} placeholder={AIM_CALL_PLACEHOLDER} value={text} onChange={(e) => type(e.target.value)} />
        {text.length > 120 && (
          <p className="rm-count rm-ac-count" aria-live="polite">
            {text.length} / {AIM_MAX}
          </p>
        )}
        {seedShown(seed, text) && seed && (
          <Link className="rm-ac-seed" href={ROADMAP_NEW_HREF} onClick={fromSeed}>
            <RoadmapGlyph name="route" />
            <span>{seedLine(seed.title)}</span>
          </Link>
        )}
        <Button variant="primary" block className="rm-ac-go" href={ROADMAP_NEW_HREF} onClick={go}>
          {askPrimaryWord(text)}
        </Button>
        <div className="rm-ac-quiet">
          <Button variant="quiet" onClick={onNotNow}>
            {AIM_NOT_NOW}
          </Button>
          <Button variant="quiet" disabled={pending} onClick={dontSuggest}>
            {AIM_DONT_SUGGEST}
          </Button>
        </div>
        {error && <ActionError>{error}</ActionError>}
      </section>
    </div>
  );
}

/**
 * The LATER line (rev 3's 56 px geometry, the new copy). Its × is "Not now:
 * no aim suggestions for 4 weeks" and does what it says (the contract
 * §15.10): EmptyCard writes the 'hide:<day>' cookie through hideAimPrompt,
 * so the line stays away on the next visit too, and Today's SET line is quiet.
 */
function LaterLine({ lastAim, onHide }: { lastAim: LastAimView | null; onHide: () => void }) {
  return (
    <div>
      <section className="card rm-ac-empty" data-tour="you-aim" aria-label="Aim">
        <span className="rm-ac-later-t">
          {lastAim ? (
            <>
              Last aim: Aim rank <b>{lastAim.rankName}</b> · <Link href={ROADMAP_NEW_HREF}>{AIM_NEXT_AIM} →</Link>
            </>
          ) : (
            <>
              <Link href={ROADMAP_NEW_HREF}>{AIM_CALL_PRIMARY}</Link>
              {AIM_LATER_TAIL}
            </>
          )}
        </span>
        <IconButton icon="x" label={AIM_NOT_NOW_SET_LABEL} onClick={onHide} />
      </section>
    </div>
  );
}

export const NETWORK_RETRY = "That didn't go through. Check your connection and try again.";

/**
 * A "Not now" write behind a surface that has already collapsed (lens 3, fix
 * round 2): the card folds at once; a refusal or a lost connection brings
 * `back` (the surface the user tapped) again with the reason beneath it, as
 * AimLine does, so an error never stands alone with nothing to retry. A
 * success leaves the collapsed surface as it is.
 */
export function collapseWrite(
  call: () => Promise<{ ok: true } | { ok: false; error: string }>,
  back: AimPrompt,
  set: { mode: (m: AimPrompt) => void; error: (e: string | null) => void }
): Promise<void> {
  set.error(null);
  const fail = (e: string) => {
    set.mode(back);
    set.error(e);
  };
  return call()
    .then((res) => {
      if (!res.ok) fail(res.error);
    })
    .catch(() => fail(NETWORK_RETRY));
}

/**
 * EMPTY: ASK, LATER, HIDDEN or OFF. "Not now" on the card collapses it to
 * the LATER line at once ('later:'); the LATER line's × hides it ('hide:');
 * "Don't suggest this" stores the no (with Undo). HIDDEN and OFF keep only
 * the last aim's achievement line. A failed snooze or hide brings back the
 * surface that was tapped, with the reason under it (collapseWrite).
 */
function EmptyCard({ prompt, seed, lastAim, autosaveAim }: { prompt: AimPrompt; seed: AimSeed | null; lastAim: LastAimView | null; autosaveAim: string | null | undefined }) {
  const runtime = useRoadmapRuntime();
  const [mode, setMode] = useState<AimPrompt>(prompt);
  const [writeError, setWriteError] = useState<string | null>(null);
  const write = (back: AimPrompt, call: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    void collapseWrite(call, back, { mode: setMode, error: setWriteError });
  };
  const errorLine = writeError ? <ActionError>{writeError}</ActionError> : null;
  const surface = emptySurfaceOf(mode, lastAim);
  if (surface === "NONE") return errorLine;
  if (surface === "KEPT")
    return (
      <>
        <KeptLine lastAim={lastAim!} />
        {errorLine}
      </>
    );
  if (surface === "LATER") {
    const hide = () => {
      setMode("HIDDEN");
      // The 4-week 'hide:' cookie, shared with Today's line: no aim suggestion on either until it lapses.
      write("LATER", () => runtime.actions.hideAimPrompt());
    };
    return (
      <>
        <LaterLine lastAim={lastAim} onHide={hide} />
        {errorLine}
      </>
    );
  }
  const notNow = () => {
    setMode("LATER");
    // The 4-week 'later:' cookie, shared with Today's line; the typed text stays in the autosave.
    write("ASK", () => runtime.actions.snoozeAimPrompt());
  };
  const off = () => {
    setMode("OFF");
    pushToast({
      title: AIM_OFF_TOAST,
      action: {
        label: "Undo",
        onAction: () =>
          void runtime.actions
            .setAimSuggestions(true)
            .then((res) => {
              if (res.ok) {
                setMode("ASK");
                runtime.refresh();
              } else pushToast({ title: AIM_UNDO_FAILED, body: res.error });
            })
            .catch(() => pushToast({ title: AIM_UNDO_FAILED, body: NETWORK_RETRY })),
      },
    });
  };
  return (
    <>
      <AskCard seed={seed} lastAim={lastAim} autosaveAim={autosaveAim} onNotNow={notNow} onOff={off} />
      {errorLine}
    </>
  );
}

function Chips({ view, today }: { view: AimCardView; today: string }) {
  if (view.state === "DONE" && view.doneDay)
    return (
      <div className="rm-chips">
        {view.area && <AreaChipView area={view.area} />}
        <Chip>Done {dayLabel(view.doneDay, today)}</Chip>
      </div>
    );
  return (
    <div className="rm-chips">
      {view.area && <AreaChipView area={view.area} />}
      {view.dateChip ? <Chip>{depthDateChip(view.dateChip)}</Chip> : view.targetDay && <Chip>{byLine(view.targetDay, today, false)}</Chip>}
      {!view.aimChecked && <Chip className="rm-qchip">Aim not checked</Chip>}
      {view.over && <Chip className="rm-qchip">Over</Chip>}
      {view.draftItems != null && view.state !== "DRAFT" && <Chip className="rm-qchip">Draft waiting</Chip>}
      {view.targetLowered && <Chip className="rm-qchip">Target lowered</Chip>}
    </div>
  );
}

/** (e): the milestone and its one line. A depth plan names the stage ("Milestone 3 of 6 · Retained (level 8)"), never a title. */
function MilestoneLines({ view, today }: { view: AimCardView; today: string }) {
  const ms = view.milestone;
  if (!ms) return null;
  const stage = stageWords(ms.stage, ms.gateLevel);
  const head = (
    <div className="rm-ac-ms">
      <span>
        Milestone{" "}
        <b>
          {ms.ord} of {ms.of}
        </b>{" "}
        ·{" "}
        {stage ?? (
          <>
            <StruckLabel label={ms.title} struck={ms.titleStruck} /> <TitleClassChip cls={ms.titleClass} />
          </>
        )}
      </span>
    </div>
  );
  if (view.state === "PAST_DUE" || ms.status === "PAST_DUE") {
    return (
      <>
        {head}
        <p className="rm-ac-line">
          <b className="ink-0">{pastDueLine(ms.ord, ms.dueDay, today)}</b>
        </p>
      </>
    );
  }
  if (ms.status === "PLANNED") {
    const start = ms.start;
    return (
      <>
        {head}
        {view.goalsLive ? (
          <p className="rm-ac-line">
            Start milestone {ms.ord} when you&apos;re ready.
            {start && (
              <>
                <br />
                <span className="t-meta">
                  Becomes a Mid goal on Today · <PaysLine text={statedLine(start.stated, start.zeroReason, start.paidOn, today)} />.
                </span>
                <br />
                <span className="t-meta">{givesRankByName(start.givesRank)}</span>
              </>
            )}
          </p>
        ) : (
          <p className="rm-ac-line">Milestone {ms.ord} is planned.</p>
        )}
      </>
    );
  }
  if (ms.status === "REACHED") {
    return (
      <>
        {head}
        <p className="rm-ac-line">{ms.reachedDay ? `Reached ${dayLabel(ms.reachedDay, today)}` : "Reached"}</p>
      </>
    );
  }
  if (ms.status === "PENDING_REACH") {
    return (
      <>
        {head}
        <p className="rm-ac-line">{ms.countsFrom ? pendingReachLine(ms.countsFrom) : "Reached · counts once your ticks settle"}</p>
      </>
    );
  }
  const pace = pacePhrase(ms.pace, today);
  const percent = ms.headline ? goalPercent(Number(ms.headline.value)) : null;
  return (
    <>
      {head}
      <p className="rm-ac-line">{ms.headline && percent != null ? `${percent}% · ${ms.headline.caption}${pace ? ` · ${pace}` : ""}` : view.writesOff ? "Not recorded on this server" : "Not measured yet"}</p>
    </>
  );
}

/** For RANK_NEW_DAYS after the reach the achievement leads ("Open roadmap" first); otherwise "Set your next aim" leads (F-R4-2). */
export function doneLeadsWithRoadmap(view: Pick<AimCardView, "reachedDay">, today: string): boolean {
  return view.reachedDay != null && daysBetween(view.reachedDay, today) < RANK_NEW_DAYS;
}

/**
 * What a legacy Aim card offers (F-R4-16, decision 47): a DRAFT "Draft it
 * again"; an ACTIVE plan "Start again at a depth" (a handoff with `replaces`,
 * so saving archives it); a DONE one only "Set your next aim", with no
 * `replaces` (saveIntakeCore replaces an ACTIVE roadmap only).
 */
export type LegacyAimAction = "DRAFT_AGAIN" | "START_AGAIN" | "NEXT_AIM";
export function legacyAimActionOf(state: AimCardView["state"]): LegacyAimAction {
  if (state === "DRAFT" || state === "RUNNING") return "DRAFT_AGAIN";
  return state === "DONE" ? "NEXT_AIM" : "START_AGAIN";
}

/**
 * "Start again at a depth"'s handoff (F-R4-16): the aim, the Area and the
 * plan's Domains, and `replaces`. Never a URL. `domainIds` come from the
 * view when it carries them (RoadmapHeader.domainIds or LegacyView.domainIds;
 * the contract §15.11); without them the form preselects the Area's Domains.
 */
export function restartHandoffOf(plan: {
  aim: string;
  roadmapId: string;
  area: AreaChip | null;
  domainIds?: readonly string[] | null;
  /** LegacyView.areaFieldId, read only when the view has no Area chip. */
  areaFieldId?: string | null;
  /** A Field plan's "Practices count toward" track (RoadmapHeader.track). */
  track?: Track | null;
}): AimHandoff {
  const area =
    plan.area?.kind === "FIELD"
      ? { areaFieldId: plan.area.fieldId, ...(plan.track ? { track: plan.track } : {}) }
      : plan.area?.kind === "TRACK"
        ? { areaFieldId: null, track: plan.area.track }
        : plan.areaFieldId !== undefined
          ? { areaFieldId: plan.areaFieldId }
          : {};
  const domainIds = plan.domainIds && plan.domainIds.length > 0 ? { domainIds: [...plan.domainIds] } : {};
  return { aim: plan.aim, source: "restart", replaces: plan.roadmapId, ...area, ...domainIds };
}

/**
 * The Aim card's "Start again at a depth" handoff (F-R4-16; contracts §16.3):
 * the same facts as the roadmap page's banner — the aim, the Area, and the old
 * plan's own Domains and Area Field from view.legacyView (R4's legacyViewOf) —
 * so the new intake preselects that plan's Domains, not every Domain with
 * cards in the Area. Null without an aim or a roadmap.
 */
export function legacyRestartHandoffOf(view: Pick<AimCardView, "aim" | "roadmapId" | "area" | "legacyView">): AimHandoff | null {
  if (!view.aim || !view.roadmapId) return null;
  return restartHandoffOf({ aim: view.aim, roadmapId: view.roadmapId, area: view.area, domainIds: view.legacyView?.domainIds ?? null, areaFieldId: view.legacyView?.areaFieldId });
}

/** A plan made before revision 4 (F-R4-16): the aim, the Area, the banner (with "Wording from an earlier Gemini draft is hidden." when it had any) and its one action; no milestone title, no Proficiency. */
function LegacyCard({ view, today }: { view: AimCardView; today: string }) {
  const runtime = useRoadmapRuntime();
  const action = legacyAimActionOf(view.state);
  const restart = () => {
    const handoff = legacyRestartHandoffOf(view);
    if (runtime.fixture || !handoff) return;
    writeAimHandoff(handoff);
  };
  return (
    <div>
      <SectionHeader title="Aim" />
      <section className="card rm-ac" data-tour="you-aim" aria-label="Aim: planned before plans aimed at a depth">
        {view.aim && <p className="rm-ac-t">{view.aim}</p>}
        <div className="rm-chips">
          {view.area && <AreaChipView area={view.area} />}
          {action === "NEXT_AIM" && view.doneDay ? <Chip>Done {dayLabel(view.doneDay, today)}</Chip> : view.targetDay && <Chip>{byLine(view.targetDay, today, false)}</Chip>}
        </div>
        <p className="rm-lead">{action === "DRAFT_AGAIN" ? LEGACY_DRAFT_BANNER : LEGACY_ACTIVE_BANNER}</p>
        {view.legacyView?.geminiHidden && (
          <p className="t-meta" style={{ marginTop: 4 }}>
            {LEGACY_GEMINI_HIDDEN}
          </p>
        )}
        {action === "START_AGAIN" && <p className="t-meta" style={{ marginTop: 4 }}>{LEGACY_MEASURE_LINE}</p>}
        <div className="rm-ac-acts">
          {action === "DRAFT_AGAIN" ? (
            <Button variant="primary" href={ROADMAP_NEW_HREF}>
              {DRAFT_IT_AGAIN_WORD}
            </Button>
          ) : action === "START_AGAIN" ? (
            <Button variant="primary" href={ROADMAP_NEW_HREF} onClick={restart}>
              {START_AGAIN_AT_DEPTH_WORD}
            </Button>
          ) : (
            <>
              <Button variant="primary" href={ROADMAP_NEW_HREF}>
                {AIM_NEXT_AIM}
              </Button>
              <Button href={ROADMAP_HREF}>Open roadmap</Button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export function AimCard({ view, promptDismissed, prompt, seed, lastAim, today: todayProp, autosaveAim }: AimCardProps) {
  const today = todayOf(todayProp);

  if (view.state === "EMPTY") {
    return <EmptyCard prompt={emptyPromptOf(prompt, promptDismissed)} seed={seed ?? null} lastAim={lastAim ?? view.lastAim ?? null} autosaveAim={autosaveAim} />;
  }
  if (view.legacy) return <LegacyCard view={view} today={today} />;
  if (view.state === "RUNNING") {
    return (
      <div>
        <SectionHeader title="Aim" />
        <section className="card rm-ac-empty" data-tour="you-aim" aria-live="polite">
          <span className="rm-ac-empty-t">Drafting your roadmap…</span>
          <Button href={ROADMAP_HREF}>Open</Button>
        </section>
      </div>
    );
  }
  if (view.state === "DRAFT") {
    return (
      <div>
        <SectionHeader title="Aim" />
        <section className="card rm-ac-empty" data-tour="you-aim">
          <span className="rm-ac-empty-t">
            <b>A draft is waiting for your check</b>
            {view.draftItems != null ? ` · ${view.draftItems} ${view.draftItems === 1 ? "item" : "items"}` : ""}
          </span>
          <Button href={ROADMAP_HREF}>Review draft</Button>
        </section>
      </div>
    );
  }

  const seenKey = view.roadmapId ?? "aim";
  // The compact rank line only while ACCEPTED (nothing ever carried, the contract §9.3) and the first rank stands;
  // otherwise the full block, so a rank-up's "new" marker, the meter, the change line and the parts stay.
  const accepted = view.state === "ACCEPTED" && view.rank != null && view.rank.index === 0 && !view.rank.newSince && !view.rank.pending;
  const done = view.state === "DONE";
  const leadsWithRoadmap = done && doneLeadsWithRoadmap(view, today);

  return (
    <div>
      <SectionHeader
        title="Aim"
        aside={
          view.measuredAt ? (
            <Link className="rm-hit" href={ROADMAP_HREF}>
              {measuredLabel(view.measuredAt, today)}
            </Link>
          ) : undefined
        }
      />
      <section className="card rm-ac" data-tour="you-aim" aria-label={done ? "Aim: done" : "Aim: rank, Proficiency and progress"}>
        {view.aim && <p className="rm-ac-t">{view.aim}</p>}
        <Chips view={view} today={today} />

        {accepted && view.rank ? (
          <>
            <p className="rm-rk" style={{ marginTop: 12 }}>
              Aim rank <b>{view.rank.name}</b>
              {view.proficiency && (
                <>
                  {" "}
                  · {proficiencyBasisLabelOf(view.proficiency)} <b className="num">{view.proficiency.percent}%</b>
                </>
              )}
            </p>
            {view.proficiency && (
              <p className="rm-cap">
                {view.proficiency.live
                  ? NOT_RECORDED_HERE
                  : acceptanceCaption(isAcceptanceReading(view.proficiency.measuredAt, view.acceptedDay), view.acceptedDay, view.proficiency.measuredAt, today)}{" "}
                · {proficiencyPartsLine(view.proficiency)}
              </p>
            )}
          </>
        ) : (
          view.rank && (
            <ProficiencyBlock
              rank={view.rank}
              proficiency={view.proficiency}
              variant="card"
              today={today}
              scheduled={view.milestone?.of ?? 0}
              writesOff={view.writesOff}
              seenKey={seenKey}
              pendingShownElsewhere={view.milestone?.status === "PENDING_REACH"}
            />
          )
        )}

        {done ? (
          <>
            <div className="rm-ac-ms">
              <span>
                {view.reachedDay ? `Aim reached ${dayWithWeekday(view.reachedDay, today)}` : view.doneDay ? `Closed ${dayWithWeekday(view.doneDay, today)} · the aim wasn't reached` : "Done"}
              </span>
            </div>
            {view.heldDepth && leadsWithRoadmap && <p className="rm-ac-line">{heldDepthLine(view.heldDepth)}</p>}
          </>
        ) : (
          <MilestoneLines view={view} today={today} />
        )}

        {!done && view.reachedDay && view.state === "ACTIVE" && (
          <p className="rm-ac-line">
            Aim reached {dayWithWeekday(view.reachedDay, today)} · <Link className="rm-ilink" href={ROADMAP_HREF}>Mark the aim done</Link>
          </p>
        )}

        {view.targetLowered && (
          <p className="rm-ac-line t-meta">
            Target lowered {view.targetLowered.from} → {view.targetLowered.to} on {dayLabel(view.targetLowered.on, today)} (re-plan)
          </p>
        )}
        {view.weekQuests && view.weekQuests.total > 0 && view.state === "ACTIVE" && <WeekQuestsLine className="rm-ac-q" done={view.weekQuests.done} total={view.weekQuests.total} />}

        {done ? (
          <div className="rm-ac-acts rm-ac-acts-col">
            {leadsWithRoadmap ? (
              <>
                <Button variant="primary" href={ROADMAP_HREF}>
                  Open roadmap
                </Button>
                <Button href={ROADMAP_NEW_HREF}>{AIM_NEXT_AIM}</Button>
              </>
            ) : (
              <>
                <Button variant="primary" href={ROADMAP_NEW_HREF}>
                  {AIM_NEXT_AIM}
                </Button>
                <Button href={ROADMAP_HREF}>Open roadmap</Button>
              </>
            )}
          </div>
        ) : (
          <div className="rm-ac-acts">
            <Button href={ROADMAP_HREF}>Open roadmap</Button>
          </div>
        )}
      </section>
    </div>
  );
}

/** The milestone headline equals goalPercent(min(parts)) (F10); the card shows the view's own figure. */
export function aimHeadlinePercent(view: AimCardView): number | null {
  const h = view.milestone?.headline;
  return h ? goalPercent(Number(h.value)) : null;
}
