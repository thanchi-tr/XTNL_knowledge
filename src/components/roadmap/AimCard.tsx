"use client";

/**
 * The Aim card on /you (lane R5; F19; final-aim-card.html). Lane Y mounts it
 * directly under CharacterHero, from loadAimCard joined with loadSheet in one
 * Promise.all: no Suspense and no skeleton, so nothing shifts.
 *
 *   (a) "Aim" with "measured 09:12" as a 40 px link to /you/roadmap
 *   (b) the aim in the user's words, clamped to 2 lines
 *   (c) chips: the Area, "by 31 Mar", quietly "Aim not checked", and only when
 *       they apply "Over", "Draft waiting", "Target lowered"
 *   (d) the Aim rank and Proficiency block (ProficiencyBlock, card variant)
 *   (e) the milestone: "Milestone 2 of 3 · Conditional reasoning" (a Gemini
 *       title's numbers struck, with its words chip) over one line (its
 *       headline, captioned by the binding part, and its pace)
 *
 * ACCEPTED shows the compact line "Aim rank Initiate · Proficiency 31%",
 * captioned "as measured at acceptance on 4 Oct" only while the reading is
 * that day's (isAcceptanceReading with AimCardView.acceptedDay); every chain
 * day writes a new reading, so later it reads "measured Sat" (measuredLabel).
 *   (f) week quests as one line; (g) "Open roadmap"
 *
 * States: EMPTY (one compact line, dismissed for a year by the ×; the page
 * reads the cookie on the server, so it never flashes), RUNNING, DRAFT,
 * ACCEPTED, ACTIVE, PAST_DUE, DONE. "Aim rank" always precedes a rank name;
 * no "mastery", "mastered" or ⬡ appears except in the stated-pay line from
 * statedPayoutCopy. Never red.
 */
import Link from "next/link";
import { useState } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { SectionHeader } from "@/components/ui/Tabs";
import { goalPercent } from "@/lib/goals";
import { todayKey } from "@/lib/life-day";
import { NOT_RECORDED_HERE, isAcceptanceReading, type AimCardView, type AreaChip } from "@/lib/roadmap-types";
import { ActionError } from "@/components/home/ActionError";
import {
  TRACK_SIGIL,
  TRACK_WORD,
  acceptanceCaption,
  byLine,
  dayLabel,
  dayWithWeekday,
  givesRankByName,
  measuredLabel,
  pacePhrase,
  pastDueLine,
  pendingReachLine,
  proficiencyPartsLine,
  statedLine,
} from "./roadmap-copy";
import { ROADMAP_HREF, ROADMAP_NEW_HREF } from "./roadmap-links";
import { useRoadmapAction } from "./roadmap-runtime";
import { PaysLine } from "./PaysLine";
import { ProficiencyBlock } from "./ProficiencyBlock";
import { TitleClassChip } from "./ProvenanceChip";
import { StruckLabel } from "./StruckLabel";
import { WeekQuestsLine } from "./WeekQuests";
import "./roadmap.css";

export interface AimCardProps {
  view: AimCardView;
  /** The EMPTY state's line was dismissed (cookie AIM_PROMPT_COOKIE = 'off', read on the server). */
  promptDismissed?: boolean;
  /** Today's life day (the page's todayKey); dates without a year inside it. */
  today?: string;
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

function EmptyLine({ view, onHide }: { view: AimCardView; onHide: () => void }) {
  const { run, error } = useRoadmapAction();
  return (
    <div>
      <section className="card rm-ac-empty" aria-label="Aim">
        <span className="rm-ac-empty-t">
          <Link href={ROADMAP_NEW_HREF}>Set an aim</Link>
          {view.hasKey ? " → Gemini can draft a roadmap, or build one from your numbers" : " → build one from your own numbers."}
        </span>
        <IconButton
          icon="x"
          label="Hide this"
          onClick={() => {
            onHide();
            run((a) => a.dismissAimPrompt(), undefined, { refresh: false });
          }}
        />
      </section>
      {error && <ActionError>{error}</ActionError>}
    </div>
  );
}

function Chips({ view, today }: { view: AimCardView; today: string }) {
  return (
    <div className="rm-chips">
      {view.area && <AreaChipView area={view.area} />}
      {view.targetDay && <Chip>{byLine(view.targetDay, today, false)}</Chip>}
      {!view.aimChecked && <Chip className="rm-qchip">Aim not checked</Chip>}
      {view.over && <Chip className="rm-qchip">Over</Chip>}
      {view.draftItems != null && view.state !== "DRAFT" && <Chip className="rm-qchip">Draft waiting</Chip>}
      {view.targetLowered && <Chip className="rm-qchip">Target lowered</Chip>}
    </div>
  );
}

/** (e): the milestone and its one line. */
function MilestoneLines({ view, today }: { view: AimCardView; today: string }) {
  const ms = view.milestone;
  if (!ms) return null;
  const head = (
    <div className="rm-ac-ms">
      <span>
        Milestone{" "}
        <b>
          {ms.ord} of {ms.of}
        </b>{" "}
        · <StruckLabel label={ms.title} struck={ms.titleStruck} /> <TitleClassChip cls={ms.titleClass} />
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

export function AimCard({ view, promptDismissed, today: todayProp }: AimCardProps) {
  const [hidden, setHidden] = useState(false);
  const today = todayOf(todayProp);

  if (view.state === "EMPTY") {
    if (promptDismissed || hidden) return null;
    return <EmptyLine view={view} onHide={() => setHidden(true)} />;
  }
  if (view.state === "RUNNING") {
    return (
      <div>
        <SectionHeader title="Aim" />
        <section className="card rm-ac-empty" aria-live="polite">
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
        <section className="card rm-ac-empty">
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
      <section className="card rm-ac" aria-label="Aim: rank, Proficiency and progress">
        {view.aim && <p className="rm-ac-t">{view.aim}</p>}
        <Chips view={view} today={today} />

        {accepted && view.rank ? (
          <>
            <p className="rm-rk" style={{ marginTop: 12 }}>
              Aim rank <b>{view.rank.name}</b>
              {view.proficiency && (
                <>
                  {" "}
                  · Proficiency <b className="num">{view.proficiency.percent}%</b>
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
              <span>{view.reachedDay ? `Aim reached ${dayWithWeekday(view.reachedDay, today)}` : view.doneDay ? `Marked done ${dayLabel(view.doneDay, today)}` : "Done"}</span>
            </div>
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

        <div className="rm-ac-acts">
          <Button href={ROADMAP_HREF}>Open roadmap</Button>
        </div>
      </section>
    </div>
  );
}

/** The milestone headline equals goalPercent(min(parts)) (F10); the card shows the view's own figure. */
export function aimHeadlinePercent(view: AimCardView): number | null {
  const h = view.milestone?.headline;
  return h ? goalPercent(Number(h.value)) : null;
}
