/**
 * A visit as a card (the list, and a visit's other visits): its first thumbnail (never a full image), the place, its
 * overall in stars, the visit's day, and the summary's first line. The whole card is one link to the visit. No hooks.
 */
import Link from "next/link";
import type { DayKey } from "@/lib/life-day";
import { dayWordsOf, firstLineOf, visitHref, type VisitView } from "@/lib/places";
import { Icon } from "@/components/ui/Icon";
import { Photo } from "./Photo";
import { Stars } from "./Stars";

export function Thumb({ visit }: { visit: VisitView }) {
  if (!visit.thumb) {
    return (
      <span className="pl-thumb pl-thumb-none" aria-hidden="true">
        <Icon name="pin" />
      </span>
    );
  }
  return <Photo className="pl-thumb" src={visit.thumb.src} width={visit.thumb.width} height={visit.thumb.height} alt="" />;
}

export function VisitCard({ visit, today, className = "card pl-card" }: { visit: VisitView; today: DayKey; className?: string }) {
  const line = firstLineOf(visit.summary);
  return (
    <Link href={visitHref(visit.id)} className={className} data-visit={visit.id}>
      <Thumb visit={visit} />
      <span className="pl-body">
        <span className="pl-name">{visit.placeName}</span>
        <span className="pl-meta">
          <Stars score={visit.overall} />
          <span>{dayWordsOf(visit.day, today)}</span>
          {visit.photoCount > 1 && <span>{`${visit.photoCount} photos`}</span>}
        </span>
        {line && <span className="pl-line">{line}</span>}
      </span>
    </Link>
  );
}
