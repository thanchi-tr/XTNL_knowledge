import { prisma } from "@/lib/prisma";
import { domainLevelProgress, fieldLevel } from "@/lib/xp";
import { recordTodaySnapshot, getGhostLevelsFromDaysAgo } from "@/lib/snapshot";
import { FieldLevelChart, type FieldLevelDatum } from "@/components/dashboard/FieldLevelChart";
import { DomainLevelChart, type DomainLevelDatum } from "@/components/dashboard/DomainLevelChart";
import { DonutChart } from "@/components/dashboard/DonutChart";
import { LevelDistributionChart } from "@/components/dashboard/LevelDistributionChart";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { StatTile } from "@/components/dashboard/StatTile";
import { AccountLevelRing } from "@/components/dashboard/AccountLevelRing";
import { ReviewQueueWidget, type FieldDueCount } from "@/components/dashboard/ReviewQueueWidget";
import { GhostRadarChart, type GhostRadarDatum } from "@/components/dashboard/GhostRadarChart";
import { AnimatedLevelBreakdown, type FieldBreakdownRow } from "@/components/dashboard/AnimatedLevelBreakdown";
import { QUESTION_TYPE_COLORS, REVIEW_STATUS_COLORS, fieldColor } from "@/lib/palette";

// Level/XP numbers change on every review — never statically cache this.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();

  // Fire-and-forget from the page's perspective, but awaited: writes today's
  // Field snapshot so a week from now this same view has a real "7 days
  // ago" ghost to compare against instead of nothing.
  await recordTodaySnapshot();

  const [fields, ghostLevels] = await Promise.all([
    prisma.field.findMany({
      orderBy: { name: "asc" },
      include: { domains: { include: { ideas: true } } },
    }),
    getGhostLevelsFromDaysAgo(7),
  ]);

  const fieldLevelData: FieldLevelDatum[] = fields.map((f) => ({
    name: f.name,
    level: Math.round(f.level),
    domainCount: f.domains.length,
  }));

  const domainLevelData: DomainLevelDatum[] = fields.flatMap((f) =>
    f.domains.map((d) => ({ name: d.name, fieldName: f.name, level: d.level, totalPoints: d.totalPoints }))
  );

  const allIdeas = fields.flatMap((f) => f.domains.flatMap((d) => d.ideas));
  const activeIdeas = allIdeas.filter((i) => !i.isArchived);
  const dueIdeas = activeIdeas.filter((i) => i.dueDate <= now);
  const atRiskCount = activeIdeas.filter((i) => i.graceEndsAt !== null && i.graceEndsAt <= now).length;

  const dueBreakdown: FieldDueCount[] = fields
    .map((f) => ({
      name: f.name,
      count: f.domains.reduce((sum, d) => sum + d.ideas.filter((i) => !i.isArchived && i.dueDate <= now).length, 0),
    }))
    .filter((f) => f.count > 0);

  const questionTypeCounts = new Map<string, number>();
  for (const idea of activeIdeas) {
    questionTypeCounts.set(idea.questionType, (questionTypeCounts.get(idea.questionType) ?? 0) + 1);
  }
  const questionTypeData = [...questionTypeCounts.entries()].map(([name, value]) => ({
    name,
    value,
    color: QUESTION_TYPE_COLORS[name] ?? "#5a7490",
  }));

  const levelBuckets = Array.from({ length: 12 }, (_, i) => ({ level: i + 1, count: 0 }));
  for (const idea of activeIdeas) {
    levelBuckets[Math.min(11, Math.max(0, idea.level - 1))].count += 1;
  }

  let overdue = 0;
  let dueToday = 0;
  let upcoming = 0;
  const todayEnd = new Date(now);
  todayEnd.setUTCHours(23, 59, 59, 999);
  for (const idea of activeIdeas) {
    if (idea.dueDate < now) overdue += 1;
    else if (idea.dueDate <= todayEnd) dueToday += 1;
    else upcoming += 1;
  }
  const reviewStatusData = [
    { name: "Overdue", value: overdue, color: REVIEW_STATUS_COLORS.overdue },
    { name: "Due today", value: dueToday, color: REVIEW_STATUS_COLORS.dueToday },
    { name: "Upcoming", value: upcoming, color: REVIEW_STATUS_COLORS.upcoming },
  ].filter((d) => d.value > 0);

  const totalXp = fields.reduce((sum, f) => sum + f.domains.reduce((s, d) => s + d.totalPoints, 0), 0);
  const topField = [...fields].sort((a, b) => b.level - a.level)[0];
  const topDomain = domainLevelData.length ? [...domainLevelData].sort((a, b) => b.level - a.level)[0] : null;

  const closestToLevelUp = fields
    .flatMap((f) => f.domains.map((d) => ({ ...domainLevelProgress(d.totalPoints), name: d.name, fieldName: f.name })))
    .filter((d) => d.progress > 0 && d.progress < 1)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 5);

  // Account Level + the ring's progress metric — see AccountLevelRing's doc
  // comment for why this is an average of real per-Domain progress rather
  // than a fabricated "XP to next Account Level" number.
  const accountLevel = fieldLevel(fields.map((f) => f.level));
  const allDomainProgress = fields.flatMap((f) => f.domains.map((d) => domainLevelProgress(d.totalPoints).progress));
  const avgDomainProgress = allDomainProgress.length
    ? allDomainProgress.reduce((s, p) => s + p, 0) / allDomainProgress.length
    : 0;

  const ghostByField = new Map(ghostLevels.map((g) => [g.fieldName, g.level]));
  const ghostRadarData: GhostRadarDatum[] = fields.map((f) => ({
    // Full name, not `split(" ")[0]` — truncating to the first word made
    // "Algebraic Number Theory" and "Algebraic Topology" identical axes.
    field: f.name,
    current: Math.round(f.level),
    ghost: ghostByField.has(f.name) ? Math.round(ghostByField.get(f.name)!) : null,
  }));
  const hasGhost = ghostLevels.length > 0;

  const breakdownRows: FieldBreakdownRow[] = fields.map((f) => ({
    name: f.name,
    level: Math.round(f.level),
    domainCount: f.domains.length,
    totalXp: f.domains.reduce((sum, d) => sum + d.totalPoints, 0),
  }));

  return (
    <main className="site-container flex-1 py-8">
      <header className="fade-up mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-eyebrow">Knowledge Engine</p>
          <h1 className="mt-1.5 text-[19px] font-semibold tracking-tight" style={{ color: "var(--ink-0)" }}>
            Analytics
          </h1>
        </div>
        <p className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {now.toISOString().slice(0, 10)} · {activeIdeas.length} active ideas
        </p>
      </header>

      <section className="fade-up fade-up-1 mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Cumulative Points" value={totalXp.toFixed(0)} sub="All fields" />
        <StatTile label="Ideas Tracked" value={String(activeIdeas.length)} sub="Excluding archived" />
        {/* Value and qualifier are separated so a long Field name degrades
            into the caption instead of overflowing the figure — the old
            tile concatenated them into one string and clipped. */}
        <StatTile
          label="Top Field"
          value={topField ? String(Math.round(topField.level)) : "—"}
          unit={topField ? "level" : undefined}
          sub={topField?.name ?? "No fields yet"}
        />
        <StatTile
          label="Top Domain"
          value={topDomain ? String(topDomain.level) : "—"}
          unit={topDomain ? "level" : undefined}
          sub={topDomain?.name ?? "No domains yet"}
        />
      </section>

      <div className="fade-up fade-up-2 mb-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <section className="card flex flex-col items-center justify-center p-4">
          <AccountLevelRing accountLevel={accountLevel} progress={avgDomainProgress} />
        </section>
        <div className="lg:col-span-2">
          <ReviewQueueWidget totalDue={dueIdeas.length} breakdown={dueBreakdown} atRiskCount={atRiskCount} />
        </div>
      </div>

      <div className="fade-up fade-up-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard title="Coverage Growth" subtitle="Current vs. 7 days ago" className="lg:col-span-2">
          <GhostRadarChart data={ghostRadarData} hasGhost={hasGhost} />
        </ChartCard>

        <ChartCard title="Field Ranking" subtitle="By cumulative points" className="lg:col-span-2">
          <AnimatedLevelBreakdown rows={breakdownRows} />
        </ChartCard>

        <ChartCard title="Field Levels" subtitle="floor(sum(domain level ^ 0.75))">
          <FieldLevelChart data={fieldLevelData} />
        </ChartCard>

        <ChartCard title="Nearest Thresholds" subtitle="Domains closest to their next level">
          <ul className="space-y-3">
            {closestToLevelUp.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
                No domain is partway to a threshold yet.
              </p>
            )}
            {closestToLevelUp.map((d) => (
              <li key={`${d.fieldName}-${d.name}`}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate" style={{ color: "var(--ink-0)" }} title={`${d.name} · ${d.fieldName}`}>
                    {d.name}
                  </span>
                  <span className="mono shrink-0" style={{ color: "var(--ink-2)" }}>
                    L{d.level} → {Math.round(d.progress * 100)}%
                  </span>
                </div>
                <div
                  className="h-1.5 w-full overflow-hidden"
                  style={{ borderRadius: 3, background: "var(--sub)" }}
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${d.progress * 100}%`,
                      borderRadius: 3,
                      backgroundColor: fieldColor(d.fieldName),
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </ChartCard>

        <ChartCard title="Ideas by Question Type" subtitle="Active ideas">
          <DonutChart data={questionTypeData} />
        </ChartCard>

        <ChartCard title="Review Queue Status" subtitle="Active (non-archived) ideas">
          <DonutChart data={reviewStatusData} />
        </ChartCard>

        <ChartCard title="Idea Level Distribution" subtitle="Levels 1–12" className="lg:col-span-2">
          <LevelDistributionChart data={levelBuckets} />
        </ChartCard>

        {/* Subtitle was hardcoded "All 28 Domains" — it read 28 regardless of
            how many actually existed. Now counted. */}
        <ChartCard
          title="Domain Levels"
          subtitle={`${domainLevelData.length} ${domainLevelData.length === 1 ? "domain" : "domains"}, coloured by field`}
          className="lg:col-span-2"
        >
          <DomainLevelChart data={domainLevelData} />
        </ChartCard>
      </div>
    </main>
  );
}
