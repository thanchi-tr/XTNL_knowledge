import type { Metadata } from "next";
import { listMoments } from "@/app/actions/celebrations";
import type { CelebrationEvent } from "@/lib/celebration-types";
import { Chip } from "@/components/ui/Chip";
import { SectionHeader } from "@/components/ui/Tabs";
import { MomentArt } from "@/components/home/MomentArt";
import { ReplayButton } from "@/components/home/ReplayButton";

export const metadata: Metadata = { title: "Moments" };

export const dynamic = "force-dynamic";

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function monthsOf(events: CelebrationEvent[]): { month: string; events: CelebrationEvent[] }[] {
  const out: { month: string; events: CelebrationEvent[] }[] = [];
  for (const ev of events) {
    const at = ev.createdAt ? new Date(ev.createdAt) : null;
    const month = at && !Number.isNaN(at.getTime()) ? MONTH.format(at) : "Undated";
    const last = out[out.length - 1];
    if (last && last.month === month) last.events.push(ev);
    else out.push({ month, events: [ev] });
  }
  return out;
}

function metaOf(ev: CelebrationEvent): string {
  const at = ev.createdAt ? new Date(ev.createdAt) : null;
  const when = at && !Number.isNaN(at.getTime()) ? DAY.format(at) : null;
  const what = ev.tier === 3 ? (ev.facts.kicker ?? ev.facts.eyebrow) : ev.facts.eyebrow;
  return [what, when, ev.tier === 3 ? ev.facts.cost : null].filter(Boolean).join(" · ");
}

/**
 * You › Moments (final-you.html ?tab=moments): every Seal (T2) and
 * Ascension (T3) you earned, newest first, by month, each with its art.
 * Each plays once when it happens; Replay (T3 only) is here and nowhere else.
 */
export default async function MomentsPage() {
  const moments = (await listMoments()).filter((m) => m.tier >= 2);
  if (moments.length === 0) {
    return (
      <section className="card empty-c">
        <b>No moments yet</b>
        <span className="t-meta">
          Every Seal and Ascension you earn lands here, by month: a level, a kept week, a mastered idea, an unlock. Each
          plays once when it happens, and you can replay an Ascension here on purpose.
        </span>
      </section>
    );
  }
  return (
    <>
      <p className="t-meta" style={{ margin: "0 0 12px" }}>
        Every Seal and Ascension you earned, newest first. Each plays once when it happens; you can replay an Ascension
        here on purpose.
      </p>
      {monthsOf(moments).map((g) => (
        <div key={g.month} style={{ marginBottom: 16 }}>
          <SectionHeader title={g.month} aside={`${g.events.length} ${g.events.length === 1 ? "moment" : "moments"}`} />
          <section className="card">
            {g.events.map((ev) => (
              <div key={ev.id} className="mo">
                <span className="art">
                  <MomentArt event={ev} />
                </span>
                <div className="grow">
                  <b>{ev.facts.title}</b>
                  <span className="t-meta">{metaOf(ev)}</span>
                </div>
                {ev.tier === 3 ? <ReplayButton event={ev} label={ev.facts.title} /> : <Chip>Seal</Chip>}
              </div>
            ))}
          </section>
        </div>
      ))}
    </>
  );
}
