"use client";

/**
 * The Aim card on /you (lane R5; F19; roadmap-rev4.md F-R4-1, F-R4-2,
 * F-R4-11, F-R4-16; final-aim-card.html). Lane Y mounts it directly under
 * CharacterHero, from loadAimCard joined with loadSheet in one Promise.all: no
 * Suspense and no skeleton, so nothing shifts.
 *
 * EMPTY renders by `prompt` (aimPromptOf: the stored switch, then the cookie):
 *   ASK    the full card that asks for the aim in place (.card.rm-ac-call,
 *          data-tour="you-aim"): "Set an aim" with its (i) (the body and the
 *          true rank line, which the box's aria-describedby points at), an
 *          unlit RankSeal and the static [route] beside a 140-character box
 *          (it starts from RoadmapForm's unsent autosave: "Continue where you
 *          left off", and typing writes the same key, so "Not now" and
 *          leaving keep the text), the last aim's line (with one), the
 *          long-goal seed (with one), a primary that reads "Set an aim" while
 *          the box is empty and "Continue" once it has text (never disabled;
 *          both open /you/roadmap/new, with a sessionStorage handoff only when
 *          there is text or the seed was tapped — never a URL), and two quiet
 *          buttons: "Not now" (4 weeks) and "Don't suggest this" (the stored
 *          no, with an undo toast that names Settings; a failed Undo says so).
 *          The seed shows only while the box is empty, and the last aim reads
 *          on two lines (the aim clipped, the rank in full), so the card keeps
 *          within 410 px at 344.
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
 * With an aim (ui-motion.md §3.3 screen 9, §7.9; ≤ 14 app words in every
 * state, lane R2): the horizon band edge to edge at the top (ACTIVE,
 * ACCEPTED, PAST_DUE: AMBIENT air ≤ 5 s per session in full only; DONE: SVG,
 * no context); the aim in the user's words; one chip row — the Area
 * "[s-know] Trading · L6", the date "[t.cal] L12 by ≈ Dec 2027" (the app's
 * estimate at month precision) or "[t.pin] 31 Dec 2027 · yours", «Aim not
 * checked» (opens AIM_UNCHECKED_LINE), «Over», «Target lowered 46 → 38»,
 * "Draft waiting", «not recorded here» on a writes-off server; then the Aim
 * rank and Proficiency (ProficiencyBlock: the RankSeal and its label, the %
 * with its evidence glyphs and measured time, "Proficiency → L12", the meter,
 * and the card's one (i)); then the milestone: a 16 px RouteRail strip
 * (one node per row, the current one its measured arc, a pending reach a
 * dashed ring, never counted), "Milestone 2 of 6 · <title>" (a Gemini title
 * keeps its chip), and "23% [ev] · [pace.on] On pace · 7 Mar" (the full
 * line sr-only), or the planned, pending, reached or past-due line; the
 * week quests line; "Open roadmap".
 *
 * DONE (F-R4-2): the RankSeal of the rank actually held; reached: the
 * [m.seal] (seal-reached, SEEN, once per viewer) and "Aim reached …";
 * closed unreached: no seal, "Closed … · the aim wasn't reached". For
 * RANK_NEW_DAYS after the reach the achievement leads ("Open roadmap"
 * primary, "Set your next aim" second, the held depth in the (i)); after
 * that, and when the aim wasn't reached, "Set your next aim" leads. No dead
 * end: a closed aim always offers the next one.
 *
 * RUNNING: "[route.weave] Drafting · started 09:12" over the weave band
 * (WAIT, ≤ 90 s, its 40 px pause button in the row; static once the run is
 * stale or when the card can't say), and Open. DRAFT: "Draft waiting".
 *
 * A plan made before revision 4 (legacy) shows its aim, its Area, «older
 * plan» (its banner and the measure line one tap away), the Gemini-hidden
 * line verbatim when view.legacyView says Gemini words were hidden, and its
 * action, and no milestone title (F-R4-16): "Draft it again", "Start again at
 * a depth" (ACTIVE: a handoff with `replaces` and the old plan's own Domains,
 * legacyRestartHandoffOf), or, once DONE, only "Set your next aim" with no
 * `replaces`.
 *
 * A failed "Not now" (the ASK card's snooze, the LATER line's hide) brings
 * back the surface that was tapped with its reason (collapseWrite).
 *
 * Motion (each through the gateway, none on a first view, none under still):
 * rank-rise and reach (SEEN; the plan basis, no surface in the key, so each
 * plays once per viewer on /you or /you/roadmap, whichever sees it first),
 * meter-fill and horizon-front (SEEN; the Proficiency basis signature, D8),
 * seal-reached (SEEN), the horizon air (AMBIENT) and the weave (WAIT). A
 * pending reach and an aim closed unreached play nothing (D18).
 *
 * "Aim rank" always precedes a rank name. "Mastered" appears only as the
 * stage name of level 12; no "mastery" and no ⬡ except in the stated-pay line
 * from statedPayoutCopy. Never red.
 */
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Glyph } from "@/components/glyph/Glyph";
import { Fig } from "@/components/glyph/GlyphStat";
import { Chips, HonestyChip } from "@/components/glyph/HonestyChip";
import { InfoTip } from "@/components/glyph/InfoTip";
import { RankSeal } from "@/components/glyph/RankSeal";
import { RouteRail, type RailNode } from "@/components/glyph/RouteRail";
import { usePlayOnSeen, useSeenEvent } from "@/components/glyph/useSeen";
import type { RankName } from "@/components/glyph/paths/rank";
import { DraftWeave } from "@/components/fx/DraftWeave";
import { HorizonField } from "@/components/fx/HorizonField";
import { ShaderSlot } from "@/components/fx/ShaderSlot";
import { WeavePause } from "@/components/fx/WeavePause";
import { HorizonDawn, HorizonMarks } from "@/components/fx/fallbacks";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Chip } from "@/components/ui/Chip";
import { SectionHeader } from "@/components/ui/Tabs";
import { pushToast } from "@/components/ui/toast-store";
import { goalPercent } from "@/lib/goals";
import { daysBetween, todayKey } from "@/lib/life-day";
import { BAND, horizonParams } from "@/lib/shader/params";
import { AIM_MAX, AIM_RANKS, RANK_NEW_DAYS, isAcceptanceReading, type AimCardView, type AreaChip, type LastAimView, type PaceResult, type PracticePace } from "@/lib/roadmap-types";
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
  AIM_UNCHECKED_LINE,
  AIM_UNDO_FAILED,
  DRAFT_IT_AGAIN_WORD,
  LEGACY_ACTIVE_BANNER,
  LEGACY_DRAFT_BANNER,
  LEGACY_GEMINI_HIDDEN,
  LEGACY_MEASURE_LINE,
  MILESTONE_STATE_WORD,
  SHORT_AIM_UNCHECKED,
  SHORT_BEST_CASE,
  SHORT_DRAFT_WAITING,
  SHORT_GIVES_RANK,
  SHORT_KEEPS_RANK,
  SHORT_LEGACY,
  SHORT_NOT_RECORDED,
  SHORT_OPEN_ROADMAP,
  SHORT_OVER,
  SHORT_PAUSE_LABEL,
  SINCE_SEAL_ITEM,
  START_AGAIN_AT_DEPTH_WORD,
  WRITES_OFF_BANNER,
  TRACK_SIGIL,
  TRACK_WORD,
  byLine,
  dateFull,
  dayLabel,
  dayWithWeekday,
  depthDateChip,
  givesRankByName,
  heldDepthLine,
  lastAimDayLine,
  monthYear,
  pacePhrase,
  pastDueLine,
  pendingReachLine,
  proficiencyMissingLine,
  seedLine,
  shortDraftingSince,
  shortLowered,
  shortMilestoneOf,
  shortStartMilestone,
  stageWords,
  statedLine,
  timeLabel,
} from "./roadmap-copy";
import { ROADMAP_HREF, ROADMAP_NEW_HREF, ROADMAP_NOW_HREF } from "./roadmap-links";
import {
  aimDateOfCard,
  aimRailOf,
  horizonOfAimCard,
  paceFlagsOf,
  seenBaseOf,
  seenBasesOfAimCard,
  seenKeyOf,
  SEEN_WHAT,
  type AimCardMotionFields,
  type HorizonModel,
  type RailNodeModel,
  type SeenBases,
} from "./roadmap-ui-model";
import { useRoadmapAction, useRoadmapRuntime } from "./roadmap-runtime";
import { readUnsentAim, writeUnsentAim } from "./roadmap-autosave";
import { PaysLine } from "./PaysLine";
import { evidenceGlyphsOf, ProficiencyBlock } from "./ProficiencyBlock";
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

/** The fields the lib's AimCardView doesn't carry yet (roadmap-ui-model AimCardMotionFields, contracts §21.6): read when present, silent when not. */
type CardView = AimCardView & AimCardMotionFields;

/** The Area chip: "[s-know] Trading · L6" (the name a name; "L6" spoken "level 6"), or the track with "practice only". */
export function AreaChipView({ area }: { area: AreaChip }) {
  if (area.kind === "FIELD")
    return (
      <Chip sigil="know">
        <span data-wc="name">{area.name}</span> <Fig compact={`· L${area.level}`} speech={`, level ${area.level}`} />
      </Chip>
    );
  return (
    <Chip sigil={TRACK_SIGIL[area.track]}>
      <span data-wc="name">{TRACK_WORD[area.track]}</span> · practice only
    </Chip>
  );
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

/** A last aim's medallion: the rank it held, done (aria-hidden; "Aim rank Paragon" is in the words beside it). */
function LastRankGlyph({ lastAim }: { lastAim: LastAimView }) {
  return <Glyph name={`rank.${Math.max(0, Math.min(6, lastAim.rankIndex))}` as RankName} state="done" size={16} className="rm-ac-last-g" />;
}

/**
 * The ASK card's last-aim line, in two lines so the achievement never clips
 * at 344 px: the aim (one line, ellipsised) and then "[rank.6 done] Aim rank
 * Paragon · reached 6 Aug 2026" in full.
 */
function LastAimLines({ lastAim }: { lastAim: LastAimView }) {
  return (
    <div className="t-meta rm-ac-last rm-ac-last-gr">
      <LastRankGlyph lastAim={lastAim} />
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
    <section className="card rm-ac-empty rm-ac-kept" aria-label="Last aim" data-wc-block="aim-card">
      <LastRankGlyph lastAim={lastAim} />
      <span className="rm-ac-later-t">
        Last aim: Aim rank <b>{lastAim.rankName}</b> · {lastAimDayLine(lastAim)}
      </span>
    </section>
  );
}

/** The ASK card (F-R4-1): the aim asked in place, one sentence and one tap; the why one tap away. */
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
      <section className="card rm-ac-call" data-tour="you-aim" data-wc-block="aim-card" aria-labelledby={ids.h}>
        <div className="rm-ac-callh">
          <h3 className="rm-ac-h" id={ids.h}>
            {AIM_CALL_HEADING}
          </h3>
          {/* The year-or-three question and the true rank line, one tap away; the box's aria-describedby points here (C1-m2). */}
          <InfoTip topic="setting an aim" describes={ids.box} className="rm-ac-tip">
            <span className="rm-rp-tp">{AIM_CALL_BODY}</span>
            <span className="rm-rp-tp">{AIM_CALL_RANK_LINE}</span>
          </InfoTip>
        </div>
        {lastAim && <LastAimLines lastAim={lastAim} />}
        {continuing && text.trim() && <p className="t-meta rm-ac-cont">{AIM_CALL_CONTINUE_LINE}</p>}
        <label className="sr-only" htmlFor={ids.box}>
          {AIM_CALL_LABEL}
        </label>
        <div className="rm-ac-ask">
          {/* An unlit seal and the static route: what an aim starts (no motion, no invitation id, ui-motion.md §4.7). */}
          <span className="rm-ac-ask-g" aria-hidden="true">
            <RankSeal index={0} size={34} state="idle" />
            <Glyph name="route" size={20} />
          </span>
          <textarea id={ids.box} className="st-input rm-ac-box" rows={2} maxLength={AIM_MAX} placeholder={AIM_CALL_PLACEHOLDER} value={text} onChange={(e) => type(e.target.value)} />
        </div>
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
      <section className="card rm-ac-empty" data-tour="you-aim" aria-label="Aim" data-wc-block="aim-card">
        {lastAim && <LastRankGlyph lastAim={lastAim} />}
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
        {/* The kit's 44 px icon button, without a `title` (ui-motion.md D13: a tooltip gives nothing on touch; the name is aria-label). */}
        <button type="button" className="icon-btn" aria-label={AIM_NOT_NOW_SET_LABEL} onClick={onHide}>
          <Icon name="x" />
        </button>
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

// ─── The horizon band (§6.1, §6.2) ──────────────────────────────────────────

/**
 * The card's band. With the reading's Proficiency basis key, HorizonField
 * (AMBIENT air, horizon-front from the last-seen % under the same basis).
 * Without one (a view the lib round hasn't filled yet, contracts §21.6) the
 * band still draws its measured SVG marks over the dawn, with the same air
 * (it carries no number, D15), but no horizon-front: no seen key, so the
 * walked path never moves from a value that may sit on another basis (D8).
 */
function AimBand({ h }: { h: HorizonModel }) {
  return (
    <div className="rm-band">
      {h.basisKey ? (
        <HorizonField proficiency={h.proficiency} roadmapId={h.roadmapId} basisKey={h.basisKey} depth={h.depth} status={h.status} variant="card" />
      ) : (
        <BandWithoutBasis h={h} />
      )}
    </div>
  );
}

function BandWithoutBasis({ h }: { h: HorizonModel }) {
  const id = useId();
  const p = horizonParams({ proficiency: h.proficiency, status: h.status, depth: h.depth, roadmapId: h.roadmapId });
  const [w, ht] = BAND.card;
  return (
    <ShaderSlot
      program="horizon"
      kind={p.kind}
      params={[p.seed]}
      measured={p.measured}
      className="shd-band-card"
      fallback={p.measured ? <HorizonDawn w={w} h={ht} id={id} /> : null}
      marks={<HorizonMarks w={w} h={ht} front={p.front} contours={p.contours} dotted={p.dotted} />}
    />
  );
}

// ─── The chip row ───────────────────────────────────────────────────────────

/**
 * The date: the app's estimate "[t.cal] L12 by ≈ Dec 2027", your own "[t.pin] 31 Dec 2027 · yours", or
 * (whose not said) "[t.cal] by Dec 2027". Spoken in full: a depth plan's chip words (depthDateChip, "Mastered
 * (level 12) by about Mar 2028 · estimate") with whose it is, else the date in words.
 */
export function dateChipSpeechOf(view: Pick<CardView, "dateChip">, d: { whose: "app" | "yours" | null; day: string; level: number | null }): string | undefined {
  const whose = d.whose === "app" ? "an estimate set by the app" : d.whose === "yours" ? "your own date" : null;
  if (view.dateChip) {
    const words = depthDateChip(view.dateChip);
    return whose && !(d.whose === "app" && view.dateChip.estimate) ? `${words}, ${whose}` : words;
  }
  if (d.whose === "app") return `${d.level != null ? `level ${d.level} ` : ""}by about ${monthYear(d.day)}, ${whose}`;
  if (d.whose === "yours") return `${dateFull(d.day)}, ${whose}`;
  return undefined;
}

function DateChip({ view }: { view: CardView }) {
  const d = aimDateOfCard(view);
  if (!d) return null;
  const speech = dateChipSpeechOf(view, d);
  return (
    <span className="chip rm-ac-date" data-whose={d.whose ?? undefined}>
      <Glyph name={d.glyph} size={12} inherit />
      <Fig compact={d.text} speech={speech} />
    </span>
  );
}

function CardChips({ view }: { view: CardView }) {
  return (
    <Chips className="rm-ac-chips">
      {view.area && <AreaChipView area={view.area} />}
      <DateChip view={view} />
      {!view.aimChecked && <HonestyChip kind="aim-unchecked" label={SHORT_AIM_UNCHECKED} full={AIM_UNCHECKED_LINE} />}
      {view.over && <HonestyChip kind="over" label={SHORT_OVER} />}
      {view.targetLowered && <HonestyChip kind="lowered" label={shortLowered(view.targetLowered.from, view.targetLowered.to)} />}
      {view.draftItems != null && view.state !== "DRAFT" && <Chip className="rm-qchip">{SHORT_DRAFT_WAITING}</Chip>}
      {view.writesOff && (
        <HonestyChip
          kind="not-recorded"
          label={SHORT_NOT_RECORDED}
          full={
            <>
              {proficiencyMissingLine(true)}. {WRITES_OFF_BANNER}
            </>
          }
        />
      )}
    </Chips>
  );
}

// ─── The milestone: the strip, its head and its one line ────────────────────

/** A strip node's one label: its place and state in words (no title, so no Gemini words are spoken without their chip; a pending node says "not counted yet", once — the line beside says from when). */
export function stripLabelOf(n: Pick<RailNodeModel, "n" | "state" | "pct" | "meta" | "heldAtStart">): string {
  const word = n.heldAtStart
    ? (n.meta ?? "Held when you began")
    : n.state === "CURRENT"
      ? n.pct != null
        ? `Current · ${n.pct}%`
        : "Current"
      : n.state === "PENDING_REACH"
        ? "Reached · not counted yet"
        : n.state === "CLOSED_UNREACHED"
          ? (n.meta ?? "Closed · not reached")
          : MILESTONE_STATE_WORD[n.state];
  return `Milestone ${n.n} · ${word}`;
}

/** The model's rail nodes as RouteRail draws them on the strip. */
export function stripNodesOf(nodes: readonly RailNodeModel[]): RailNode[] {
  return nodes.map((n) => ({
    n: n.n,
    state: n.state,
    label: stripLabelOf(n),
    pct: n.pct,
    gate: n.gate ?? undefined,
    rankIndex: n.rankIndex,
    countsFrom: n.countsFrom ?? undefined,
    closedPct: n.closedPct,
  }));
}

/** The pace in ink, compact: "On pace · 7 Mar", "About 3 weeks behind" (pacePhrase's words, the "for" dropped). */
export function paceShortOf(pace: PaceResult | PracticePace | null, today?: string): { text: string; on: boolean } | null {
  if (!pace) return null;
  if (pace.kind === "on-pace") return { text: "day" in pace ? `On pace · ${dayLabel(pace.day, today)}` : "On pace", on: true };
  const phrase = pacePhrase(pace, today);
  if (!phrase) return null;
  return { text: phrase.charAt(0).toUpperCase() + phrase.slice(1), on: pace.kind === "reached" };
}

function MilestoneBlock({ view, today, bases }: { view: CardView; today: string; bases: SeenBases | null }) {
  const ms = view.milestone;
  const railNodes = useMemo(() => aimRailOf(view, today), [view, today]);
  if (!ms) return null;
  const stage = stageWords(ms.stage, ms.gateLevel);
  const strip = railNodes ? (
    <RouteRail nodes={stripNodesOf(railNodes)} orientation="strip" seenKey={seenBaseOf(bases, "plan")} label="Milestones" className="rm-ac-strip" />
  ) : null;
  const head = (
    <p className="rm-ac-mh">
      <span>{shortMilestoneOf(ms.ord, ms.of)}</span> ·{" "}
      {stage ? (
        <span data-wc="name">{stage}</span>
      ) : (
        <span data-wc="name">
          <StruckLabel label={ms.title} struck={ms.titleStruck} /> <TitleClassChip cls={ms.titleClass} />
        </span>
      )}
    </p>
  );
  let line: ReactNode;
  if (view.state === "PAST_DUE" || ms.status === "PAST_DUE") {
    line = (
      <p className="rm-ac-line" data-wc="honest">
        <b className="ink-0">{pastDueLine(ms.ord, ms.dueDay, today)}</b>
      </p>
    );
  } else if (ms.status === "PLANNED") {
    const start = ms.start;
    line = view.goalsLive ? (
      <>
        <p className="rm-ac-line">
          <Link className="rm-ac-start" href={ROADMAP_NOW_HREF}>
            <span className="rm-ac-num num" aria-hidden="true">
              {ms.ord}
            </span>
            {shortStartMilestone(ms.ord)} →
          </Link>
        </p>
        {start && (
          <>
            <p className="rm-ac-line">
              <PaysLine text={statedLine(start.stated, start.zeroReason, start.paidOn, today)} />
            </p>
            <p className="rm-ac-line rm-ac-gives">
              <span aria-hidden="true">
                {start.givesRank ? (
                  <>
                    {SHORT_GIVES_RANK} <Glyph name={`rank.${Math.max(0, AIM_RANKS.indexOf(start.givesRank))}` as RankName} state="active" size={16} />{" "}
                    <b data-wc="name">{start.givesRank}</b>
                  </>
                ) : (
                  <>
                    <Glyph name={`rank.${view.rank?.index ?? 0}` as RankName} state="done" size={16} /> {SHORT_KEEPS_RANK}
                  </>
                )}
              </span>
              <span className="sr-only">{givesRankByName(start.givesRank)}</span>
            </p>
          </>
        )}
      </>
    ) : (
      <p className="rm-ac-line">Milestone {ms.ord} is planned.</p>
    );
  } else if (ms.status === "REACHED") {
    line = <p className="rm-ac-line">{ms.reachedDay ? `Reached ${dayLabel(ms.reachedDay, today)}` : "Reached"}</p>;
  } else if (ms.status === "PENDING_REACH") {
    // Stated once, in full: a pending reach is not counted, so nothing moves (no seal, no rank, D18).
    line = (
      <p className="rm-ac-line" data-wc="honest">
        {ms.countsFrom ? pendingReachLine(ms.countsFrom) : "Reached · counts once your ticks settle"}
      </p>
    );
  } else {
    const pace = paceShortOf(ms.pace, today);
    const phrase = pacePhrase(ms.pace, today);
    const percent = ms.headline ? goalPercent(Number(ms.headline.value)) : null;
    const full = ms.headline && percent != null ? `${percent}% · ${ms.headline.caption}${phrase ? ` · ${phrase}` : ""}` : view.writesOff ? "Not recorded on this server" : "Not measured yet";
    // The % with its evidence glyphs; nothing on a writes-off server with no reading (the chip row says so once).
    const lead =
      ms.headline && percent != null ? (
        <>
          <b className="num">{percent}%</b>
          {evidenceGlyphsOf(ms.headline.caption).map((g) => (
            <Glyph key={g} name={g} size={14} inherit />
          ))}
        </>
      ) : view.writesOff ? null : (
        <span>Not measured yet</span>
      );
    line = (
      <p className="rm-ac-line rm-ac-prog">
        <span className="rm-ac-prog-v" aria-hidden="true">
          {lead}
          {pace && (
            <>
              {lead && <span className="rm-ac-sep">·</span>}
              <Glyph name={pace.on ? "pace.on" : "pace.behind"} size={14} inherit />
              <span data-wc="honest">{pace.text}</span>
            </>
          )}
        </span>
        <span className="sr-only">{full}</span>
        {paceFlagsOf(ms.pace).bestCase && <HonestyChip kind="best-case" label={SHORT_BEST_CASE} />}
      </p>
    );
  }
  return (
    <div className="rm-ac-msb">
      {strip}
      {head}
      {line}
    </div>
  );
}

// ─── The card with an aim ───────────────────────────────────────────────────

/** For RANK_NEW_DAYS after the reach the achievement leads ("Open roadmap" first); otherwise "Set your next aim" leads (F-R4-2). */
export function doneLeadsWithRoadmap(view: Pick<AimCardView, "reachedDay">, today: string): boolean {
  return view.reachedDay != null && daysBetween(view.reachedDay, today) < RANK_NEW_DAYS;
}

/** The ACCEPTED card's acceptance caption applies only while nothing ever carried and the first rank stands (the contract §9.3). */
export function acceptanceModeOf(view: Pick<AimCardView, "state" | "rank">): boolean {
  return view.state === "ACCEPTED" && view.rank != null && view.rank.index === 0 && !view.rank.newSince && !view.rank.pending;
}

/** The DONE card's last line: "Aim reached Sun 18 Apr", or "Closed Mon 19 Apr · the aim wasn't reached" (no seal on that one). */
function DoneLine({ view, today, bases }: { view: CardView; today: string; bases: SeenBases | null }) {
  const sealRef = useRef<HTMLSpanElement>(null);
  const reached = view.reachedDay != null;
  // seal-reached (SEEN): a counted done reach new since this viewer last saw the plan open (its "seal" key held 0); never on an aim closed unreached.
  usePlayOnSeen(sealRef, reached ? seenKeyOf(bases, SEEN_WHAT.seal) : null, 1, "seal-reached", { label: SINCE_SEAL_ITEM });
  return (
    <p className="rm-ac-mh rm-ac-done">
      {reached && (
        <span ref={sealRef} className="rm-ac-seal" aria-hidden="true">
          <Glyph name="m.seal" state="done" size={20} />
        </span>
      )}
      {reached ? (
        <span>{`Aim reached ${dayWithWeekday(view.reachedDay!, today)}`}</span>
      ) : view.doneDay ? (
        <span>
          Closed {dayWithWeekday(view.doneDay, today)} · <span data-wc="honest">the aim wasn&apos;t reached</span>
        </span>
      ) : (
        <span>Done</span>
      )}
    </p>
  );
}

function PlanCard({ view, today }: { view: CardView; today: string }) {
  const cardRef = useRef<HTMLElement>(null);
  const bases = seenBasesOfAimCard(view);
  const done = view.state === "DONE";
  // While the aim is open, the seal key holds 0, so the done reach plays once when it lands (seal-reached; the page's header reads the same key).
  useSeenEvent(!done ? seenKeyOf(bases, SEEN_WHAT.seal) : null, 0, cardRef);
  const band = horizonOfAimCard(view);
  const leadsWithRoadmap = done && doneLeadsWithRoadmap(view, today);
  const acceptance = acceptanceModeOf(view);
  const p = view.proficiency;
  const info: string[] = [];
  if (view.targetLowered) info.push(`Target lowered ${view.targetLowered.from} → ${view.targetLowered.to} on ${dayLabel(view.targetLowered.on, today)} (re-plan)`);
  if (done && view.heldDepth && leadsWithRoadmap) info.push(heldDepthLine(view.heldDepth));

  return (
    <div>
      <SectionHeader title="Aim" />
      <section ref={cardRef} className="card rm-ac" data-tour="you-aim" data-wc-block="aim-card" aria-label={done ? "Aim: done" : "Aim: rank, Proficiency and progress"}>
        {band && <AimBand h={band} />}
        {view.aim && (
          <p className="rm-ac-t" data-wc="own">
            {view.aim}
          </p>
        )}
        {!done && <CardChips view={view} />}

        {view.rank && (
          <ProficiencyBlock
            rank={view.rank}
            proficiency={p}
            variant="card"
            today={today}
            scheduled={view.milestone?.of ?? 0}
            writesOff={view.writesOff}
            seenKey={view.roadmapId ?? ""}
            seen={bases}
            pendingShownElsewhere={view.milestone?.status === "PENDING_REACH"}
            acceptance={acceptance ? { atAcceptance: Boolean(p && !p.live && isAcceptanceReading(p.measuredAt, view.acceptedDay)), acceptedDay: view.acceptedDay ?? null } : null}
            info={info.map((l) => (
              <span key={l} className="rm-rp-tp">
                {l}
              </span>
            ))}
          />
        )}

        {done ? <DoneLine view={view} today={today} bases={bases} /> : <MilestoneBlock view={view} today={today} bases={bases} />}

        {!done && view.reachedDay && view.state === "ACTIVE" && (
          <p className="rm-ac-line">
            Aim reached {dayWithWeekday(view.reachedDay, today)} · <Link className="rm-ilink" href={ROADMAP_HREF}>Mark the aim done</Link>
          </p>
        )}

        {view.weekQuests && view.weekQuests.total > 0 && view.state === "ACTIVE" && (
          <div className="rm-ac-wq">
            <WeekQuestsLine className="rm-ac-q" done={view.weekQuests.done} total={view.weekQuests.total} />
          </div>
        )}

        {done ? (
          <div className="rm-ac-acts rm-ac-acts-col">
            {leadsWithRoadmap ? (
              <>
                <Button variant="primary" href={ROADMAP_HREF}>
                  {SHORT_OPEN_ROADMAP}
                </Button>
                <Button href={ROADMAP_NEW_HREF}>{AIM_NEXT_AIM}</Button>
              </>
            ) : (
              <>
                <Button variant="primary" href={ROADMAP_NEW_HREF}>
                  {AIM_NEXT_AIM}
                </Button>
                <Button href={ROADMAP_HREF}>{SHORT_OPEN_ROADMAP}</Button>
              </>
            )}
          </div>
        ) : (
          <div className="rm-ac-acts">
            <Button href={ROADMAP_HREF}>{SHORT_OPEN_ROADMAP}</Button>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── RUNNING and DRAFT ──────────────────────────────────────────────────────

/**
 * RUNNING: the weave band (WAIT: it loops in full only while the run is
 * fresh, ≤ 90 s, with its pause button in the row; static once stale, or
 * when the card doesn't carry the run, so no loop claims a draft it can't
 * see), "[route.weave] Drafting · started 09:12" (the honest elapsed start,
 * never a %), and Open.
 */
function RunningCard({ view }: { view: CardView }) {
  const run = view.run ?? null;
  const live = run != null && !run.stale;
  return (
    <div>
      <SectionHeader title="Aim" />
      <section className="card rm-ac rm-ac-run" data-tour="you-aim" data-wc-block="aim-card" data-wait={live ? "" : undefined} aria-live="polite">
        <div className="rm-band">
          <DraftWeave stale={!live} startedAt={run?.startedAt ?? null} />
        </div>
        <div className="rm-ac-runrow">
          <Glyph name="route.weave" size={32} className="rm-ac-rung" />
          <p className="rm-ac-empty-t">
            {run ? (
              <>
                <span aria-hidden="true">{shortDraftingSince(run.startedAt)}</span>
                <span className="sr-only">{`Drafting your roadmap… started ${timeLabel(run.startedAt)}`}</span>
              </>
            ) : (
              "Drafting your roadmap…"
            )}
          </p>
          {live && <WeavePause label={SHORT_PAUSE_LABEL} />}
          <Button href={ROADMAP_HREF}>Open</Button>
        </div>
      </section>
    </div>
  );
}

/** DRAFT: "Draft waiting · 14 items" (the full words sr-only) and Review draft. */
function DraftCard({ view }: { view: CardView }) {
  const items = view.draftItems != null ? ` · ${view.draftItems} ${view.draftItems === 1 ? "item" : "items"}` : "";
  return (
    <div>
      <SectionHeader title="Aim" />
      <section className="card rm-ac-empty" data-tour="you-aim" data-wc-block="aim-card">
        <span className="rm-ac-empty-t">
          <span aria-hidden="true">
            <b>{SHORT_DRAFT_WAITING}</b>
            {items}
          </span>
          <span className="sr-only">{`A draft is waiting for your check${items}`}</span>
        </span>
        <Button href={ROADMAP_HREF}>Review draft</Button>
      </section>
    </div>
  );
}

// ─── Legacy ─────────────────────────────────────────────────────────────────

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
 * the contract §15.11); without them the form preselects only the Area's Domains the aim
 * names (F-R5-8).
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

/**
 * A plan made before revision 4 (F-R4-16): the aim, the Area, «older plan»
 * (its banner, and the measure line for an open plan, one tap away), the
 * Gemini-hidden line verbatim when it had any, and its one action; no
 * milestone title, no Proficiency.
 */
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
      <section className="card rm-ac" data-tour="you-aim" data-wc-block="aim-card" aria-label="Aim: planned before plans aimed at a depth">
        {view.aim && (
          <p className="rm-ac-t" data-wc="own">
            {view.aim}
          </p>
        )}
        <Chips className="rm-ac-chips">
          {view.area && <AreaChipView area={view.area} />}
          {action === "NEXT_AIM" && view.doneDay ? <Chip>Done {dayLabel(view.doneDay, today)}</Chip> : view.targetDay && <Chip>{byLine(view.targetDay, today, false)}</Chip>}
          <HonestyChip
            kind="legacy"
            label={SHORT_LEGACY}
            full={
              <>
                {action === "DRAFT_AGAIN" ? LEGACY_DRAFT_BANNER : LEGACY_ACTIVE_BANNER}
                {action === "START_AGAIN" && <> {LEGACY_MEASURE_LINE}</>}
              </>
            }
          />
        </Chips>
        {view.legacyView?.geminiHidden && (
          <p className="t-meta rm-ac-line" data-wc="honest">
            {LEGACY_GEMINI_HIDDEN}
          </p>
        )}
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
              <Button href={ROADMAP_HREF}>{SHORT_OPEN_ROADMAP}</Button>
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
  if (view.state === "RUNNING") return <RunningCard view={view} />;
  if (view.state === "DRAFT") return <DraftCard view={view} />;
  return <PlanCard view={view} today={today} />;
}

/** The milestone headline equals goalPercent(min(parts)) (F10); the card shows the view's own figure. */
export function aimHeadlinePercent(view: AimCardView): number | null {
  const h = view.milestone?.headline;
  return h ? goalPercent(Number(h.value)) : null;
}
