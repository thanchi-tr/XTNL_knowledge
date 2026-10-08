"use client";

import type { ReactNode } from "react";
import { questMinutesOf, type NextUp as NextUpModel } from "./board-ui";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { CurrencyGlyph, Icon, Sigil } from "@/components/ui/Icon";
import { SegmentStrip, type Segment } from "@/components/ui/Meter";
import { approx } from "@/components/ui/format";
import { TRACK_SIGIL } from "./format";

interface Props {
  next: NextUpModel;
  /** Today's focus line from the feed ("Statistics pays +32% today"), or null. */
  focus: string | null;
  /** Encounters ready ("Linear Algebra"), or []. */
  bosses: string[];
  /** The weekly new-idea quota line, when it is owed. */
  quota: string | null;
  /** The oldest Must's price and one-tap keep. */
  mustPrice?: number;
  onKeepMust?: () => void;
  busy?: boolean;
  /** Where the quest's Start goes (the review runner). */
  reviewHref?: string;
}

/**
 * Next up: one priority and one primary action. The review quest (15 cards
 * of N due) while its Full-day ring is open, then the oldest open Must,
 * then nothing (board-ui.nextUpOf). The quest pays review points and no
 * life XP, and says so; R starts it from anywhere on the board. Its time
 * estimate is the /review hub's own (questMinutesOf → minutesFor).
 */
export function NextUp({ next, focus, bosses, quota, mustPrice, onKeepMust, busy, reviewHref = "/review" }: Props) {
  const side: ReactNode = (focus || bosses.length > 0 || quota) && (
    <div className="focus-line">
      {focus && (
        // Wraps (never nowrap): a long field name and its boost fit a 344 px card.
        <span className="focus-what">
          <Sigil track="know" />
          <span>Focus: {focus}</span>
        </span>
      )}
      {bosses.length > 0 && (
        <Chip icon="sword">
          Boss ready · {bosses[0]}
          {bosses.length > 1 ? ` +${bosses.length - 1}` : ""}
        </Chip>
      )}
      {quota && <span className="t-meta">{quota}</span>}
    </div>
  );

  if (next.kind === "quest") {
    const segs: Segment[] = Array.from({ length: next.cards }, (_, i) => (i < next.reviews ? "on" : i === next.reviews ? "cur" : "off"));
    const done = Math.min(next.reviews, next.cards);
    return (
      <section className="card today-hero" aria-labelledby="nu-h">
        <div className="hero-top">
          <span className="t-eyebrow">Next up · Quest</span>
          <span className="t-meta num">about {questMinutesOf(next)} min</span>
        </div>
        <h2 id="nu-h" className="t-display-m">
          Clear the review quest
        </h2>
        <p className="t-meta">
          {done > 0 ? `${done} of ${next.cards} done · ` : ""}
          {next.cards} card{next.cards === 1 ? "" : "s"} of {Math.max(next.dueAtOpen, next.cards)} due · paid in review points, 0 life XP
        </p>
        <SegmentStrip segs={segs} label={`Quest: ${done} of ${next.cards} reviewed`} className="hero-segs" />
        {side}
        <Button variant="primary" size="lg" block icon="study" kbd="R" href={reviewHref}>
          Start review
        </Button>
      </section>
    );
  }

  if (next.kind === "must") {
    const t = next.row.template;
    return (
      <section className="card today-hero" aria-labelledby="nu-h">
        <div className="hero-top">
          <span className="t-eyebrow">Next up · Must</span>
          {next.row.dueLabel && (
            <span className="t-meta due">
              <Icon name="clock" size={14} />
              {next.row.dueLabel}
            </span>
          )}
        </div>
        <h2 id="nu-h" className="t-display-m">
          {t.title}
        </h2>
        <p className="t-meta cur">
          <Sigil track={TRACK_SIGIL[t.track]} />
          <span>
            The oldest open must{next.row.carriedFrom ? ", carried from an earlier day" : ""}. The quest is met.
          </span>
        </p>
        {side}
        <Button variant="primary" size="lg" block icon="check" onClick={onKeepMust} disabled={busy || !onKeepMust}>
          Keep it
          {mustPrice != null && (
            <span className="cur">
              · <CurrencyGlyph kind="xp" /> <span className="num">{approx(mustPrice)}</span>
            </span>
          )}
        </Button>
      </section>
    );
  }

  return (
    <section className="card today-hero" aria-labelledby="nu-h">
      <div className="hero-top">
        <span className="t-eyebrow">Next up</span>
      </div>
      <h2 id="nu-h" className="t-display-m">
        Essentials done
      </h2>
      <p className="t-meta">
        The quest is met and every must is kept. Anything else today is extra.
        {next.dueNow > 0 ? ` ${next.dueNow} card${next.dueNow === 1 ? "" : "s"} still due can wait; nothing is lost.` : ""}
      </p>
      {side}
      {next.dueNow > 0 && (
        <Button variant="secondary" block icon="study" href={reviewHref}>
          Review more
        </Button>
      )}
    </section>
  );
}
