import Link from "next/link";
import { RECORD_YESTERDAY_HREF } from "@/lib/shortcuts";
import { Icon } from "@/components/ui/Icon";
import { FullDayCard, StreakCard } from "@/components/today/DayLedger";
import type { DayCardsView } from "./day-cards";

/**
 * Character's streak and Full day (day-cards.ts dayCardsOf): Today's own
 * StreakCard and the Full-day strip on its own card, static here (the
 * moments play on Today, after the tick that made them). While yesterday
 * has something open, "Record yesterday" links to Today's sheet, where a
 * tick counts on yesterday.
 */
export function DayCards({ view }: { view: DayCardsView }) {
  const n = view.yesterdayOpen;
  return (
    <>
      <StreakCard
        streak={view.streak}
        caption={
          <>
            {view.caption.lead && <b>{view.caption.lead}</b>}
            {view.caption.rest}
          </>
        }
        freezes={view.freezes}
        heldNote={view.heldNote}
      >
        {n > 0 && (
          <Link className="today-streak-y" href={RECORD_YESTERDAY_HREF}>
            Record yesterday · {n} open
            <Icon name="chev" size={14} />
          </Link>
        )}
      </StreakCard>
      <FullDayCard fullDay={view.fullDay} settles={view.settles} fullNote={view.fullNote ?? undefined} aside={view.aside ?? undefined} />
    </>
  );
}
