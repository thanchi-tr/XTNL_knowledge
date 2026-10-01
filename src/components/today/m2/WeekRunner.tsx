"use client";

import "../today.css";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Material } from "@/lib/materials";
import type { WhatMoved } from "@/lib/celebration-types";
import { FocusMode } from "@/components/shell/FocusMode";
import { Button, IconButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { CurrencyGlyph, Icon, Sigil, type TrackSigil } from "@/components/ui/Icon";
import { Medallion } from "@/components/ui/Medallion";
import { SegmentStrip, type Segment } from "@/components/ui/Meter";
import { formatAmount } from "@/components/ui/format";

/**
 * M2-READY: the Monday weekly review as a runner (focus mode: no shell, max
 * 560, exit top-left, progress on top, actions in the thumb zone) with five
 * skippable steps — Last week, Inbox to zero, Goals check-in, Owed, Next
 * week — ending on the WEEK CARD. Presentational: the caller owns the step
 * and every number (fixtures on /dev/style/today until M2 lands).
 */
export const WEEK_STEPS = ["Last week", "Inbox", "Goals", "Owed", "Next week"] as const;

export function WeekRunner({
  step,
  onNext,
  onSkip,
  exitHref = "/today",
  focus = true,
  children,
}: {
  /** 1..5 are the steps, 6 is the week card. */
  step: number;
  onNext: () => void;
  onSkip: () => void;
  exitHref?: string;
  /** Render <FocusMode/> (the chrome steps aside). Off inside /dev/style. */
  focus?: boolean;
  children: ReactNode;
}) {
  const segs: Segment[] = WEEK_STEPS.map((_, i) => (i + 1 < step ? "on" : i + 1 === step ? "cur" : "off"));
  const done = step > WEEK_STEPS.length;
  return (
    <div className="wr">
      {focus && <FocusMode />}
      <div className="wr-top">
        {exitHref ? (
          <Link href={exitHref} className="icon-btn" aria-label="Leave the weekly review; progress is kept">
            <Icon name="x" />
          </Link>
        ) : (
          <IconButton icon="x" label="Leave the weekly review; progress is kept" />
        )}
        <SegmentStrip segs={segs} tall label={done ? "Weekly review done" : `Step ${step} of ${WEEK_STEPS.length}: ${WEEK_STEPS[step - 1]}`} />
        <span className="t-meta num">{done ? "Done" : `${step} of ${WEEK_STEPS.length}`}</span>
      </div>
      <section className="wr-step">{children}</section>
      <div className="wr-spacer" />
      <div className="wr-nav">
        {!done && (
          <Button variant="quiet" size="lg" onClick={onSkip}>
            Skip
          </Button>
        )}
        {done && exitHref ? (
          <Button variant="primary" size="lg" className="wr-grow" href={exitHref}>
            Back to Today
          </Button>
        ) : (
          <Button variant="primary" size="lg" className="wr-grow" onClick={onNext}>
            {done ? "Back to Today" : step === WEEK_STEPS.length ? "Finish" : "Next"}
          </Button>
        )}
      </div>
    </div>
  );
}

/** One track's line in "Last week". */
export function WeekTrack({ track, name, detail, kept, held }: { track: TrackSigil; name: string; detail: string; kept: boolean; held?: boolean }) {
  return (
    <div className="wr-tr">
      <Sigil track={track} />
      <div>
        <b>{name}</b>
        <div className="t-meta">{detail}</div>
      </div>
      {kept ? (
        <Chip tone="kept">Kept</Chip>
      ) : held ? (
        <Chip tone="held" held="rest">
          Held
        </Chip>
      ) : (
        <Chip>Not kept</Chip>
      )}
    </div>
  );
}

/**
 * The WEEK CARD, which IS the week's Tier 2 Seal (one per week, not one per
 * track): "3 of 4 tracks kept", the track chips, the exact MP paid (1.5 per
 * kept track) and What moved. It renders in the runner with no button of
 * its own; L3's presenter merges it rather than stacking a second Seal.
 */
export function WeekCard({
  eyebrow,
  kept,
  total,
  tracks,
  mp,
  line,
  what,
  material = "silver",
  sweep,
}: {
  /** "Week 40 · settled Sunday". */
  eyebrow: string;
  kept: number;
  total: number;
  tracks: { track: TrackSigil; name: string; kept: boolean }[];
  /** Exact MP paid for the kept tracks. */
  mp: number;
  /** "1.5 per kept track · Duty's kept-week streak is 9." */
  line: string;
  what: WhatMoved[];
  material?: Material;
  /** Play the card sweep (the T2 visual; Still shows it settled). */
  sweep?: boolean;
}) {
  return (
    <div className={`card weekcard${sweep ? " sweep go" : ""}`} aria-labelledby="weekcard-h">
      <Medallion material={material} numeral={kept} label={`${kept} of ${total} tracks kept`} />
      <p className="t-eyebrow">{eyebrow}</p>
      <h2 id="weekcard-h">
        {kept} of {total} tracks kept
      </h2>
      <div className="kw">
        {tracks.map((t) => (
          <Chip key={t.name} tone={t.kept ? "kept" : "quiet"} sigil={t.track}>
            {t.name}
          </Chip>
        ))}
      </div>
      <p className="t-meta">
        Paid{" "}
        <b className="ink-0 cur">
          <CurrencyGlyph kind="mp" />
          <span className="num">{formatAmount(mp)} MP</span>
        </b>{" "}
        · {line}
      </p>
      {what.length > 0 && (
        <div className="what">
          <p className="t-eyebrow">What moved</p>
          <ul>
            {what.map((w) => (
              <li key={w.label}>
                <span>{w.label}</span>
                <b>{w.value}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
