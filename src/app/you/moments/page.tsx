import type { Metadata } from "next";
import { listMoments } from "@/app/actions/celebrations";
import { Chip } from "@/components/ui/Chip";
import { SectionHeader } from "@/components/ui/Tabs";
import { MomentArt } from "@/components/home/MomentArt";
import { ReplayButton } from "@/components/home/ReplayButton";
import { momentMeta, momentMonths } from "../_lib/moments";

export const metadata: Metadata = { title: "Moments" };

export const dynamic = "force-dynamic";

/**
 * You › Moments (final-you.html ?tab=moments): every Seal (T2) and
 * Ascension (T3) you earned, newest first, by month, each with its art.
 * Each plays once when it happens; Replay (T3 only) is here and nowhere else.
 * Months and days are read in the life zone (../_lib/moments.ts).
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
      {momentMonths(moments).map((g) => (
        <div key={g.month} style={{ marginBottom: 16 }}>
          <SectionHeader title={g.month} aside={`${g.events.length} ${g.events.length === 1 ? "moment" : "moments"}`} />
          <section className="card">
            {g.events.map((ev) => (
              <div key={ev.id} className="mo">
                <span className="art">
                  <MomentArt event={ev} />
                </span>
                <div className="mo-body">
                  <b>{ev.facts.title}</b>
                  <span className="t-meta">{momentMeta(ev)}</span>
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
