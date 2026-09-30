/**
 * One-off: carries the daily streak across the switch to the life ledger.
 *
 * The streak used to be the distinct UTC days of `Idea.updatedAt`; it is now
 * the life days (04:00 local) of ActivityEvent rows. On cut-over day the
 * ledger holds nothing from before, so without this every streak would read
 * 0. This writes one LEGACY_DAY row for each local day the old signal saw in
 * the last 60 days, then — only where the change of clock opened a gap the
 * old count did not have — a "cut-over bridge" row, so the new streak is
 * never shorter than the one the player was looking at yesterday.
 *
 * LEGACY_DAY rows inherit the old signal's flaw: some of those days were kept
 * alive by the degrade cron bumping `updatedAt`, not by the player. That is
 * accepted once, here, and never again: nothing after the cut-over reads
 * `updatedAt` as activity.
 *
 * `--history` also writes the knowledge history the ledger never saw: one
 * REVIEW row per passed review (from its REVIEW_FRACTION mastery row) and one
 * IDEA_CREATE row per existing Idea. Their xp is 0: the points were credited
 * long ago and degradation has changed yields since, so the rows record that
 * the event happened, not an amount nobody can reconstruct.
 *
 * Dry run by default: prints the old and new streak and every row it would
 * write, and writes nothing. Every row carries a 'bf:' dedupe key and is
 * written with skipDuplicates, so a second `--apply` inserts 0 rows.
 *
 *   npx tsx scripts/backfill-activity.ts                     # dry run
 *   npx tsx scripts/backfill-activity.ts --apply             # write
 *   npx tsx scripts/backfill-activity.ts --apply --history   # also REVIEW / IDEA_CREATE history
 */
import "dotenv/config";
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { getCurrentUserId } from "../src/lib/user";
import { activityData } from "../src/lib/activity";
import {
  LIFE_TZ,
  addDays,
  dateColumn,
  dayKeyOf,
  dayStartOf,
  keyOfDateColumn,
  todayKey,
  type DayKey,
} from "../src/lib/life-day";
import { computeStreak, foldStreakDays, streakWindowStart } from "../src/lib/streak-curve";
import type { ActivityInput } from "../src/lib/life-types";

const APPLY = process.argv.includes("--apply");
const HISTORY = process.argv.includes("--history");

/** How far back the old streak query looked, and so how far back LEGACY days go. */
const LEGACY_WINDOW_DAYS = 60;
const CHUNK = 1000;
const MS_DAY = 86_400_000;

interface Planned {
  input: ActivityInput;
  bridge?: boolean;
}

/** The streak exactly as the old streak.ts computed it: distinct UTC days of Idea.updatedAt. */
async function oldStreak(now: Date): Promise<{ current: number; days: Set<DayKey>; today: DayKey }> {
  const rows = await prisma.$queryRaw<{ day: Date }[]>`
    SELECT DISTINCT date_trunc('day', "updatedAt") AS day
    FROM "Idea"
    WHERE "updatedAt" >= now() - interval '60 days'
  `;
  const days = new Set(rows.map((r) => new Date(r.day).toISOString().slice(0, 10)));
  const today = now.toISOString().slice(0, 10);
  // Same walk: alive through today, then consecutive days back. The data
  // only covers 60 days, so the window never binds.
  const { current } = computeStreak(days, new Set(), today, { windowDays: LEGACY_WINDOW_DAYS + 2 });
  return { current, days, today };
}

async function writeChunks(label: string, rows: Prisma.ActivityEventCreateManyInput[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { count } = await prisma.activityEvent.createMany({ data: rows.slice(i, i + CHUNK), skipDuplicates: true });
    inserted += count;
  }
  console.log(`  ${label}: ${inserted} inserted of ${rows.length} (${rows.length - inserted} already present)`);
  return inserted;
}

async function main() {
  const userId = getCurrentUserId();
  const now = new Date();
  const today = todayKey(now);

  console.log(`Life ledger backfill — ${APPLY ? "APPLY" : "DRY RUN (nothing is written; pass --apply to write)"}`);
  console.log(`User ${userId} · zone ${LIFE_TZ} · life day ${today} · history ${HISTORY ? "on" : "off (pass --history)"}\n`);

  // ── What the ledger already holds ──────────────────────────────────────
  const windowStart = streakWindowStart(today);
  const [existing, bfKeys, settings] = await Promise.all([
    prisma.activityEvent.findMany({
      where: { userId, day: { gte: dateColumn(windowStart) } },
      select: { day: true, source: true, countsForStreak: true },
    }),
    prisma.activityEvent.findMany({
      where: { userId, dedupeKey: { startsWith: "bf:" } },
      select: { dedupeKey: true },
    }),
    prisma.lifeSettings.findUnique({ where: { userId } }),
  ]);
  const doneKeys = new Set(bfKeys.map((r) => r.dedupeKey));
  const existingRows = existing.map((r) => ({ day: keyOfDateColumn(r.day), source: r.source, countsForStreak: r.countsForStreak }));
  // The cut-over: the first life day. Everything from it on is in the ledger
  // for real, so the old signal is only trusted up to it — a later re-run
  // must not turn cron-bumped days after the cut-over into streak days.
  const epoch = settings ? keyOfDateColumn(settings.epochDay) : today;

  // ── The old streak, and the local days its signal saw ──────────────────
  const old = await oldStreak(now);
  const touched = await prisma.idea.findMany({
    where: { updatedAt: { gte: new Date(now.getTime() - LEGACY_WINDOW_DAYS * MS_DAY) } },
    select: { updatedAt: true },
  });
  // The latest real instant on each local day stands as that day's time.
  const lastTouch = new Map<DayKey, Date>();
  for (const { updatedAt } of touched) {
    const key = dayKeyOf(updatedAt);
    if (key > epoch) continue;
    const seen = lastTouch.get(key);
    if (!seen || updatedAt > seen) lastTouch.set(key, updatedAt);
  }

  const planned: Planned[] = [];
  for (const [day, at] of [...lastTouch.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const dedupeKey = `bf:legacy:${day}`;
    if (doneKeys.has(dedupeKey)) continue;
    planned.push({ input: { source: "LEGACY_DAY", day, occurredAt: at, detail: "Idea.updatedAt", dedupeKey } });
  }

  // ── History (optional) ─────────────────────────────────────────────────
  const history: Planned[] = [];
  if (HISTORY) {
    // Live REVIEW rows carry no dedupe key; everything before the first one
    // is history the ledger never saw. After it, reviews are already there.
    const firstLive = await prisma.activityEvent.findFirst({
      where: { userId, source: "REVIEW", dedupeKey: null },
      orderBy: { occurredAt: "asc" },
      select: { occurredAt: true },
    });
    const [fractions, ideas, recordedIdeas] = await Promise.all([
      prisma.masteryLedgerEntry.findMany({
        where: { userId, reason: "REVIEW_FRACTION", ...(firstLive ? { createdAt: { lt: firstLive.occurredAt } } : {}) },
        select: { id: true, ideaId: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.idea.findMany({ select: { id: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
      prisma.activityEvent.findMany({
        where: { userId, source: "IDEA_CREATE", sourceId: { not: null } },
        select: { sourceId: true },
      }),
    ]);
    const hasIdeaRow = new Set(recordedIdeas.map((r) => r.sourceId));

    for (const m of fractions) {
      const dedupeKey = `bf:mle:${m.id}`;
      if (doneKeys.has(dedupeKey)) continue;
      history.push({
        input: {
          source: "REVIEW",
          sink: "DOMAIN",
          xp: 0,
          sourceId: m.ideaId,
          occurredAt: m.createdAt,
          detail: "backfill: passed review",
          dedupeKey,
        },
      });
    }
    for (const idea of ideas) {
      const dedupeKey = `bf:idea:${idea.id}`;
      if (hasIdeaRow.has(idea.id) || doneKeys.has(dedupeKey)) continue;
      history.push({
        input: {
          source: "IDEA_CREATE",
          sink: "DOMAIN",
          xp: 0,
          sourceId: idea.id,
          occurredAt: idea.createdAt,
          detail: "backfill: idea created",
          dedupeKey,
        },
      });
    }
  }

  // ── The new streak, and the bridges it needs ───────────────────────────
  const asRow = (p: Planned) => {
    const d = activityData(userId, p.input);
    return { day: keyOfDateColumn(d.day as Date), source: d.source, countsForStreak: d.countsForStreak === true };
  };
  const newStreak = () => {
    const rows = [...existingRows, ...planned.map(asRow), ...history.map(asRow)];
    const { active, held } = foldStreakDays(rows);
    return { ...computeStreak(active, held, today), active, held };
  };

  const before = (() => {
    const { active, held } = foldStreakDays(existingRows);
    return computeStreak(active, held, today).current;
  })();

  let current = newStreak();
  // Walk back from yesterday, filling only the days the change of clock left
  // empty before the cut-over, and stop as soon as the old count is matched.
  // A gap on or after the cut-over day is a real one: the ledger was live
  // then, so the walk stops there rather than bridging anything behind it.
  for (let i = 1; current.current < old.current && i <= LEGACY_WINDOW_DAYS + 1; i++) {
    const day = addDays(today, -i);
    if (current.active.has(day) || current.held.has(day)) continue;
    if (day >= epoch) break;
    const dedupeKey = `bf:legacy:${day}`;
    if (doneKeys.has(dedupeKey)) continue;
    planned.push({
      input: { source: "LEGACY_DAY", day, occurredAt: dayStartOf(day), detail: "cut-over bridge", dedupeKey },
      bridge: true,
    });
    current = newStreak();
  }

  // ── Report ─────────────────────────────────────────────────────────────
  const bridges = planned.filter((p) => p.bridge).length;
  const reviews = history.filter((p) => p.input.source === "REVIEW").length;
  const ideasCreated = history.filter((p) => p.input.source === "IDEA_CREATE").length;
  console.log(`Old streak (UTC days of Idea.updatedAt, today ${old.today}): ${old.current} day(s)`);
  console.log(`New streak (life days of the ledger):                      ${current.current}${current.capped ? "+" : ""} day(s) after backfill, ${before} before`);
  console.log(current.current >= old.current ? "  OK: new ≥ old." : "  WARNING: new streak is shorter than the old one.");
  console.log(`\nPlanned rows:`);
  console.log(`  LEGACY_DAY   ${planned.length} (${planned.length - bridges} from Idea.updatedAt, ${bridges} cut-over bridge${bridges === 1 ? "" : "s"})`);
  console.log(`  REVIEW       ${HISTORY ? reviews : "— (pass --history)"}`);
  console.log(`  IDEA_CREATE  ${HISTORY ? ideasCreated : "— (pass --history)"}`);
  console.log(
    `  LifeSettings ${settings ? `exists (epochDay ${keyOfDateColumn(settings.epochDay)})` : `${APPLY ? "will be created" : "would be created"} (epochDay ${today})`}`
  );
  if (planned.length > 0) {
    console.log(`\nLegacy days (* = bridge):`);
    console.log("  " + planned.map((p) => `${p.input.day}${p.bridge ? "*" : ""}`).sort().join(", "));
  }
  console.log(`\nLast 7 life days after backfill: ${current.last7Days.map((a) => (a ? "#" : ".")).join("")} (oldest first)`);

  if (!APPLY) {
    console.log("\nDry run: nothing written.");
    return;
  }

  // ── Write ──────────────────────────────────────────────────────────────
  console.log("\nWriting…");
  // The first life day. Nothing earlier ever pays life XP. An existing row
  // (the first capture may have made one) keeps its epoch.
  await prisma.lifeSettings.upsert({
    where: { userId },
    create: { userId, epochDay: dateColumn(today) },
    update: {},
  });
  await writeChunks("LEGACY_DAY", planned.map((p) => activityData(userId, p.input)));
  if (HISTORY) await writeChunks("history", history.map((p) => activityData(userId, p.input)));
  console.log("Done. Run it again: it should insert 0 rows.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
