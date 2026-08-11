import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fieldLevel } from "@/lib/xp";
import { getDailyStreak } from "@/lib/streak";
import { FieldRadarChart, type RadarDatum } from "@/components/home/FieldRadarChart";
import { StreakDisplay } from "@/components/home/StreakDisplay";
import { StatTile } from "@/components/dashboard/StatTile";

// Levels/streak change on every review — never statically cache this.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const now = new Date();
  const graceCutoff = new Date(now.getTime() - 86_400_000);

  const [fields, streak, dueCount, overdueCount, ideaCount] = await Promise.all([
    prisma.field.findMany({
      orderBy: { name: "asc" },
      include: {
        domains: {
          select: { totalPoints: true, level: true, _count: { select: { ideas: true } } },
        },
      },
    }),
    getDailyStreak(),
    prisma.idea.count({ where: { isArchived: false, dueDate: { lte: now } } }),
    prisma.idea.count({ where: { isArchived: false, dueDate: { lt: graceCutoff } } }),
    prisma.idea.count({ where: { isArchived: false } }),
  ]);

  // Proficiency index: the same sub-linear "breadth over depth" formula the
  // spec uses for Field level (floor(sum(level^0.75))), applied one level up
  // over the Field levels instead of a Field's Domain levels.
  const proficiency = fieldLevel(fields.map((f) => f.level));

  const rows = fields
    .map((f) => ({
      name: f.name,
      level: f.level,
      domainCount: f.domains.length,
      ideaCount: f.domains.reduce((sum, d) => sum + d._count.ideas, 0),
      points: f.domains.reduce((sum, d) => sum + d.totalPoints, 0),
    }))
    // Ranked by contribution rather than alphabetically — the top row of a
    // metrics table should be the thing that matters most.
    .sort((a, b) => b.points - a.points);

  const radarData: RadarDatum[] = rows.map((r) => ({
    field: r.name,
    level: Math.round(r.level),
  }));

  const totalDomains = rows.reduce((s, r) => s + r.domainCount, 0);
  const totalPoints = rows.reduce((s, r) => s + r.points, 0);

  return (
    <main className="site-container flex-1 py-8">
      <header className="fade-up mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-eyebrow">Knowledge Engine</p>
          <h1 className="mt-1.5 text-[19px] font-semibold tracking-tight" style={{ color: "var(--ink-0)" }}>
            Overview
          </h1>
        </div>
        <p className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {now.toISOString().slice(0, 10)} · {ideaCount} ideas tracked
        </p>
      </header>

      <section className="fade-up fade-up-1 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Proficiency Index" value={String(proficiency)} sub="Breadth-weighted across fields" />
        <StatTile label="Fields" value={String(rows.length)} sub={`${totalDomains} domains`} />
        <StatTile label="Cumulative Points" value={totalPoints.toFixed(0)} sub="All fields" />
        <StatTile
          label="Due Now"
          value={String(dueCount)}
          tone={dueCount > 0 ? "amber" : undefined}
          sub={dueCount > 0 ? "Review queue non-empty" : "Queue clear"}
        />
        <StatTile
          label="Overdue"
          value={String(overdueCount)}
          tone={overdueCount > 0 ? "red" : undefined}
          sub={overdueCount > 0 ? "Past grace period" : "None"}
        />
        <StatTile
          label="Active Days"
          value={String(streak.current)}
          unit="consec."
          tone={streak.current > 0 ? "green" : undefined}
          sub="Consecutive with activity"
        />
      </section>

      <div className="fade-up fade-up-2 mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-2">
          <h2 className="panel-title">Coverage by Field</h2>
          <p className="panel-sub">Current level per field</p>
          <FieldRadarChart data={radarData} />
        </section>

        <StreakDisplay streak={streak} />
      </div>

      <section className="card fade-up fade-up-3 mt-3">
        <div
          className="flex items-baseline justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div>
            <h2 className="panel-title">Field Detail</h2>
            <p className="panel-sub">Ranked by cumulative points</p>
          </div>
          <Link href="/taxonomy" className="no-underline" style={{ fontSize: 11, color: "var(--green)" }}>
            Manage taxonomy →
          </Link>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center" style={{ fontSize: 13, color: "var(--ink-2)" }}>
            No fields yet.{" "}
            <Link href="/taxonomy" style={{ color: "var(--green)" }}>
              Create one
            </Link>{" "}
            to begin.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col" className="num" style={{ width: 40 }}>
                    #
                  </th>
                  <th scope="col">Field</th>
                  <th scope="col" className="num">
                    Domains
                  </th>
                  <th scope="col" className="num">
                    Ideas
                  </th>
                  <th scope="col" className="num">
                    Points
                  </th>
                  <th scope="col" className="num">
                    Level
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.name}>
                    <td className="num" style={{ color: "var(--ink-3)" }}>
                      {i + 1}
                    </td>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td className="num" style={{ color: "var(--ink-1)" }}>
                      {r.domainCount}
                    </td>
                    <td className="num" style={{ color: "var(--ink-1)" }}>
                      {r.ideaCount}
                    </td>
                    <td className="num">{r.points.toFixed(1)}</td>
                    <td className="num" style={{ color: "var(--green)" }}>
                      {r.level.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
