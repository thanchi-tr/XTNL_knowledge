import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { getCurrentUserId } from "@/lib/user";
import { recordTodaySnapshot } from "@/lib/snapshot";
import { Amount } from "@/components/ui/Amount";
import { Meter } from "@/components/ui/Meter";
import { SectionHeader } from "@/components/ui/Tabs";
import { DividendLine, TitleRing } from "@/components/home/StatsParts";
import { loadStats } from "../_lib/stats";

export const metadata: Metadata = { title: "Stats" };

// Levels and the queue change on every review.
export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString("en-GB");
const lvl = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/**
 * You › Stats (final-you.html ?tab=stats): the old Overview and Dashboard
 * merged, on tokens. Ink series, hue only for state (the queue) and currency
 * glyphs. Track levels over 12 weeks and the kept-weeks heatmap appear once
 * life tracks exist (M5); their components render on /dev/style/art/you.
 */
export default async function StatsPage() {
  const userId = getCurrentUserId();
  // Today's Field snapshot (the 7-day comparisons), after the response.
  after(async () => {
    await recordTodaySnapshot();
  });
  const s = await loadStats(userId);
  const q = s.queue;
  const queueTotal = q.due + q.struggling + q.learned;
  const maxBucket = Math.max(1, ...s.levelBuckets);
  const maxType = Math.max(1, ...s.questionTypes.map((t) => t.count));
  const maxField = Math.max(1, ...s.fieldLevels.map((f) => f.level));

  return (
    <>
      <section className="tiles" aria-label="Totals" style={{ marginBottom: 16 }}>
        <div className="card tile">
          <div className="v num">{s.level}</div>
          <div className="k">character level · {s.title}</div>
        </div>
        <div className="card tile">
          <div className="v num">
            {s.fields}
            <small>Fields</small>
          </div>
          <div className="k">{n(s.domains)} domains</div>
        </div>
        <div className="card tile">
          <div className="v num">{n(s.ideas)}</div>
          <div className="k">ideas tracked</div>
        </div>
        <div className="card tile">
          <div className="v">
            <Amount kind="pts" value={s.pointsAllTime} sign="none" dp={0} />
          </div>
          <div className="k">review points, all time</div>
        </div>
        <div className="card tile">
          <div className="v num">{n(s.mastered)}</div>
          <div className="k">ideas mastered</div>
        </div>
        <div className="card tile">
          <div className="v num">
            {s.streak}
            <small>{s.streak === 1 ? "day" : "days"}</small>
          </div>
          <div className="k">day streak</div>
        </div>
      </section>

      <div className="you-grid">
        <div className="you-stack">
          <div>
            <SectionHeader title="Field levels" aside={s.hasGhost ? "change over 7 days" : "ranked by level"} />
            <section className="card pad">
              {s.fieldLevels.length === 0 ? (
                <p className="t-meta">
                  No Fields yet.{" "}
                  <Link className="link" href="/structure">
                    Create one
                  </Link>{" "}
                  to begin.
                </p>
              ) : (
                <ul className="hbars">
                  {s.fieldLevels.map((f) => (
                    <li key={f.name}>
                      <span className="nm" title={f.name}>
                        {f.name}
                      </span>
                      <span className="fig">
                        L{lvl(f.level)}
                        {f.delta != null && f.delta > 0.05 ? ` · +${f.delta.toFixed(1)}` : ""} · {f.domains} {f.domains === 1 ? "domain" : "domains"}
                      </span>
                      <Meter thin value={f.level / maxField} label={`${f.name}, level ${lvl(f.level)}`} valueText={`level ${lvl(f.level)}`} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div>
            <SectionHeader title="Nearest thresholds" aside="domains closest to a level" />
            <section className="card pad">
              {s.nearest.length === 0 ? (
                <p className="t-meta">No domain is partway to its next level yet.</p>
              ) : (
                <ul className="hbars">
                  {s.nearest.map((d) => (
                    <li key={`${d.field}-${d.name}`}>
                      <span className="nm" title={`${d.name} · ${d.field}`}>
                        {d.name}
                      </span>
                      <span className="fig">
                        L{d.level} → {Math.floor(d.progress * 100)}%
                      </span>
                      <Meter thin value={d.progress} label={`${d.name}, level ${d.level}, ${Math.floor(d.progress * 100)}% to ${d.level + 1}`} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div>
            <SectionHeader title="Idea levels" aside="levels 1–12" />
            <section className="card pad">
              <div className="dist" role="img" aria-label={`Ideas by level: ${s.levelBuckets.map((c, i) => `level ${i + 1}: ${c}`).join(", ")}`}>
                {s.levelBuckets.map((c, i) => (
                  <i key={i} style={{ height: `${Math.max(2, (c / maxBucket) * 100)}%` }} />
                ))}
              </div>
              <div className="dist-x" aria-hidden="true">
                {s.levelBuckets.map((_, i) => (
                  <span key={i}>{i + 1}</span>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="you-stack">
          <div>
            <SectionHeader title="Distance to the next title" />
            <TitleRing fraction={s.distance.fraction} next={s.distance.next} nextAt={s.distance.nextAt} current={s.distance.current} />
          </div>

          <div>
            <SectionHeader title="Review queue" aside={`${n(queueTotal)} active ideas`} />
            <section className="card pad">
              {queueTotal === 0 ? (
                <p className="t-meta">Nothing in the queue yet.</p>
              ) : (
                <>
                  <div className="qbar" role="img" aria-label={`${q.due} due, ${q.struggling} struggling, ${q.learned} learned`}>
                    {q.due > 0 && <i className="due" style={{ flex: q.due }} />}
                    {q.struggling > 0 && <i className="str" style={{ flex: q.struggling }} />}
                    {q.learned > 0 && <i className="lrn" style={{ flex: q.learned }} />}
                  </div>
                  <p className="t-meta" style={{ marginTop: 8 }}>
                    <b className="ink-0">{n(q.due)}</b> due · <b className="ink-0">{n(q.struggling)}</b> struggling (past grace) ·{" "}
                    <b className="ink-0">{n(q.learned)}</b> learned
                  </p>
                </>
              )}
            </section>
          </div>

          <div>
            <SectionHeader title="Question types" aside="active ideas" />
            <section className="card pad">
              {s.questionTypes.length === 0 ? (
                <p className="t-meta">No ideas yet.</p>
              ) : (
                <ul className="hbars">
                  {s.questionTypes.map((t) => (
                    <li key={t.name}>
                      <span className="nm" title={t.name}>
                        {t.name}
                      </span>
                      <span className="fig">{n(t.count)}</span>
                      <Meter thin value={t.count / maxType} label={`${t.name}: ${t.count}`} valueText={String(t.count)} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div>
            <SectionHeader title="Line items" />
            <DividendLine amount={s.dividend.amount} perHour={s.dividend.perHour} capped={s.dividend.capped} balance={s.dividend.balance} />
          </div>
        </div>
      </div>
    </>
  );
}
