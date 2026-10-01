/**
 * M5 launch (docs/life-plan/m5-refit.md F14). Run by the lead only, never by
 * a subagent, and only after LIFE_LAUNCH_DAY is set in src/lib/life-economy.ts
 * (or, outside production, XTNL_LIFE_LAUNCH_DAY on the rehearsal server).
 *
 *   npx tsx scripts/life-launch.ts            # dry run: reads, prints, writes nothing
 *   npx tsx scripts/life-launch.ts --apply    # writes (after the user's go-ahead)
 *
 * The dry run prints:
 *   - the datasource host (check the project ref before any --apply) and the launch day;
 *   - the WEEK plan judgeClosedWeeks({dryRun, maxWeeks}) would write: every remaining week
 *     (up to DRY_RUN_MAX_WEEKS, with a warning if more remain), backfill or not, each
 *     track's verdict and reason, and its mints (none for a week before the launch day);
 *   - open goals with no goalMp and the stated amount each will get;
 *   - the character level from Fields alone and with the tracks, and the title before and after;
 *   - each attribute's life contribution;
 *   - emblems whose attribute gates life alone newly opens;
 *   - the MP balance, the last SKILL_UNLOCK and whether decay would start.
 * Everything after the plan is computed from the ledger WITH the plan folded in
 * (life-weeks ledgerWithPlans): the WEEK rows and mints --apply is about to write,
 * so the figures approved are the figures applied (M5 review C2).
 *
 * --apply, in this order (every write is idempotent):
 *   1. judgeClosedWeeks(force, moments: false), looped until the plan is empty: every
 *      closed week, oldest first, 12 per pass, with no per-week Seals (they would claim
 *      the launch moment's track and level keys first);
 *   2. stateGoalMp: goalMp = statedGoalMp(horizon) on open goals that have none;
 *   3. the ONE launch moment: after = a fresh ['levels', 'tracks'] snapshot; before = the
 *      same with every track at 0; detectCelebrations(before, after, {cause: 'launch'}).
 *      Its dedupe keys make a second run write nothing;
 *   4. last, one zero-delta DECAY_GRACE MasteryLedgerEntry, detail 'life launch <day>'
 *      (skipped when it exists), because life can make an emblem affordable and start the
 *      5%/day decay sooner. It is also the launch-finished marker: until it exists, page
 *      loads (maybeJudgeWeeks) judge nothing, so none can pre-empt steps 1 and 3 (C4).
 * A second --apply writes 0 rows.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { getCurrentUserId } from "../src/lib/user";
import { computeAttributeScores, ATTRIBUTES, ATTRIBUTE_META, type AttributeScores } from "../src/lib/attributes";
import { characterLevel } from "../src/lib/character";
import { todayKey, weekStartKeyOf } from "../src/lib/life-day";
import { DECAY_GRACE_REASON, isLaunched, lifeLaunchDay, statedGoalMp, withoutBackfill } from "../src/lib/life-economy";
import { readLifeLedger, loadLifeTracks } from "../src/lib/life-tracks-server";
import { judgedWeekKeys, lifeContributionRows, lifeTracksView, trackStateAt, DISPLAY_ORDER, TRACK_NAME } from "../src/lib/life-tracks";
import { ledgerWithPlans } from "../src/lib/life-weeks";
import { judgeClosedWeeks, launchGraceDetail } from "../src/lib/life-weeks-server";
import { stateGoalMp } from "../src/lib/goals-server";
import { getMasteryBalanceFresh, MASTERY_DECAY_FLOOR, MASTERY_IDLE_GRACE_DAYS } from "../src/lib/mastery";
import { loadAttributeScores } from "../src/lib/skill-effects";
import { unlockBlockers } from "../src/lib/skill-gates";
import { SKILL_POOL, getSkill } from "../src/lib/skill-pool";
import { computeTitle } from "../src/lib/titles";
import { captureSnapshot, detectCelebrations } from "../src/lib/celebrations";
import type { ProgressSnapshot } from "../src/lib/celebration-types";
import type { Horizon } from "../src/lib/life-types";

const APPLY = process.argv.includes("--apply");
const HORIZONS: readonly Horizon[] = ["SHORT", "MID", "LONG"];
/** The dry run plans every remaining week, up to ten years of them. */
const DRY_RUN_MAX_WEEKS = 520;
/** --apply's judge passes (12 weeks each) before it gives up and asks for a rerun. */
const APPLY_MAX_PASSES = 100;

function datasource(): string {
  const raw = process.env.DATABASE_URL ?? "";
  try {
    const u = new URL(raw);
    return `${u.hostname}:${u.port || "5432"}${u.pathname} (user ${u.username || "?"})`;
  } catch {
    return "(DATABASE_URL not set or unreadable)";
  }
}

const fmt = (n: number, dp = 2) => (Math.round(n * 10 ** dp) / 10 ** dp).toLocaleString("en-GB");

/** scores a − b per attribute (to 2 dp). */
function minus(a: AttributeScores, b: AttributeScores): AttributeScores {
  const out = { ...a };
  for (const k of ATTRIBUTES) out[k] = Math.round((a[k] - b[k]) * 100) / 100;
  return out;
}
function plus(a: AttributeScores, b: AttributeScores): AttributeScores {
  const out = { ...a };
  for (const k of ATTRIBUTES) out[k] = Math.round((a[k] + b[k]) * 100) / 100;
  return out;
}

/** The same snapshot with every track level at 0: the before of the launch moment. */
function withTracksAtZero(s: ProgressSnapshot): ProgressSnapshot {
  const copy = JSON.parse(JSON.stringify(s)) as ProgressSnapshot;
  const data = copy.data as { levels?: { tracks?: Record<string, number> }; tracks?: { levels?: Record<string, number> } };
  if (data.levels?.tracks) for (const k of Object.keys(data.levels.tracks)) data.levels.tracks[k] = 0;
  if (data.tracks?.levels) for (const k of Object.keys(data.tracks.levels)) data.tracks.levels[k] = 0;
  return copy;
}

async function main() {
  const userId = getCurrentUserId();
  const now = new Date();
  const today = todayKey(now);
  const launchDay = lifeLaunchDay();

  console.log(`Datasource: ${datasource()}`);
  console.log(`Mode: ${APPLY ? "APPLY (writes)" : "dry run (writes nothing)"}`);
  if (!launchDay) {
    console.log("LIFE_LAUNCH_DAY is not set (nor a valid XTNL_LIFE_LAUNCH_DAY outside production). Nothing to do.");
    process.exitCode = 1;
    return;
  }
  const launched = isLaunched(today, launchDay);
  console.log(`Launch day: ${launchDay} · today ${today} · ${launched ? "launched" : "NOT launched yet (nothing can be written before the launch day)"}`);

  // ── The WEEK plan: every remaining week ──
  const dry = await judgeClosedWeeks(userId, now, { dryRun: true, maxWeeks: DRY_RUN_MAX_WEEKS });
  const capped = dry.plans.length >= DRY_RUN_MAX_WEEKS;
  console.log(`\nWEEK plan (${dry.plans.length} week${dry.plans.length === 1 ? "" : "s"}; --apply writes them 12 per pass, looping until none are left)`);
  if (capped) console.log(`  !! WARNING: more than ${DRY_RUN_MAX_WEEKS} weeks remain. The figures below cover the first ${DRY_RUN_MAX_WEEKS} weeks only.`);
  for (const p of dry.plans) {
    console.log(`  ${p.weekKey} (${p.monday} – ${p.sunday})${p.backfill ? " · BACKFILL: no MP, no Seal" : ""}`);
    for (const t of p.tracks) console.log(`    ${t.track.padEnd(5)} ${t.kept ? "kept    " : "not kept"}  ${withoutBackfill(t.detail)}`);
    for (const m of p.mints) console.log(`    mint  ${m.dedupeKey}  +${m.delta} MP  (${m.why ?? m.reason})`);
    if (p.backfill && p.mints.length > 0) console.log("    !! a backfill week planned mints: STOP and report");
  }

  // ── Goals with no stated amount ──
  const unstated = await prisma.taskTemplate.findMany({
    where: { userId, kind: "GOAL", goalMp: null, closedScore: null },
    select: { id: true, title: true, horizon: true, archivedAt: true },
  });
  console.log(`\nOpen goals with no goalMp: ${unstated.length}`);
  for (const g of unstated) {
    const h: Horizon = HORIZONS.includes(g.horizon as Horizon) ? (g.horizon as Horizon) : "MID";
    console.log(`  ${g.title.slice(0, 60).padEnd(60)} ${h.padEnd(5)} → goalMp ${statedGoalMp(h)}${g.archivedAt ? " (archived)" : ""}`);
  }

  // ── Character, title, attributes: from the ledger with the plan folded in ──
  const ledger = ledgerWithPlans(await readLifeLedger(userId), dry.plans);
  const states = trackStateAt(ledger, today);
  const lifeRows = lifeContributionRows(states);
  const lifeScores = computeAttributeScores(lifeRows);
  const [fields, owned, view, loaded] = await Promise.all([
    prisma.field.findMany({ select: { level: true } }),
    prisma.unlockedSkill.findMany({ where: { userId }, select: { skillCode: true } }),
    loadLifeTracks(userId, now),
    loadAttributeScores(userId),
  ]);
  // Once launched, the attribute seam already adds the life rows it reads now (before
  // this plan is written) to the loaded scores: take those off, then add the planned life.
  const fieldScores = view.launched ? minus(loaded, computeAttributeScores(view.contributions)) : loaded;
  const withLife = plus(fieldScores, lifeScores);
  const fieldLevels = fields.map((f) => f.level);
  const trackLevels = states.map((s) => s.level);
  const ultimates = owned.filter((o) => getSkill(o.skillCode)?.rank === "ULTIMATE").length;
  const before = characterLevel(fieldLevels);
  const after = characterLevel(fieldLevels, trackLevels);
  const planned = lifeTracksView(ledger, today, launchDay);
  console.log(`\nEpoch day: ${ledger.epochDay ?? "(none: this user has no LifeSettings, so nothing launches for them)"}`);
  console.log(
    `Judged weeks once the plan is written: ${judgedWeekKeys(ledger).length} · life MP in the last judged week (${planned.mpLastWeek.weekKey ?? "none"}): ${planned.mpLastWeek.used} of ${planned.mpLastWeek.cap} · this week (${weekStartKeyOf(today)}): ${planned.mpThisWeek.used}`
  );
  console.log("Tracks (with the plan written):");
  for (const t of DISPLAY_ORDER) {
    const s = states.find((x) => x.track === t)!;
    console.log(
      `  ${TRACK_NAME[t].padEnd(5)} L${s.level} (cap ${s.cap}${s.atCap ? ", at cap" : ""}) · ${fmt(s.xp, 1)} XP · ${s.keptWeeks} kept weeks (streak ${s.keptStreak}, +${fmt(s.bonusPercent, 1)}%) · goal depth ${s.goalDepth}`
    );
  }
  console.log(`Character level: Fields only ${before.level} (+${fmt(before.progress)}) → with tracks ${after.level} (+${fmt(after.progress)})`);
  const titleBefore = computeTitle(before.level, fieldScores, ultimates);
  const titleAfter = computeTitle(after.level, withLife, ultimates);
  console.log(`Title: ${titleBefore.full} → ${titleAfter.full}`);
  console.log("Life contribution per attribute (Fields-only scores are the loaded scores less life, ±0.01 rounding):");
  for (const a of ATTRIBUTES) {
    if (lifeScores[a] <= 0) continue;
    console.log(`  ${ATTRIBUTE_META[a].label.padEnd(18)} ${fmt(fieldScores[a]).padStart(7)} + ${fmt(lifeScores[a]).padStart(6)} = ${fmt(withLife[a])}`);
  }

  // ── Emblems life alone opens ──
  const ownedCodes = owned.map((o) => o.skillCode);
  const gateBlocks = (scores: AttributeScores, code: string) =>
    unlockBlockers(getSkill(code)!, scores, ownedCodes, Number.POSITIVE_INFINITY).filter((b) => b.reason === "ATTRIBUTE" || b.reason === "BREADTH").length;
  const opened = SKILL_POOL.filter((s) => !ownedCodes.includes(s.code) && gateBlocks(fieldScores, s.code) > 0 && gateBlocks(withLife, s.code) === 0);
  console.log(`\nEmblems whose attribute gates life alone opens: ${opened.length}`);
  for (const s of opened.slice(0, 40)) {
    const prereqs = s.prerequisites.filter((p) => !ownedCodes.includes(p));
    console.log(`  ${s.name.padEnd(36)} ${s.rank.padEnd(9)} ${String(s.masteryCost).padStart(6)} MP${prereqs.length ? ` · needs ${prereqs.join(", ")}` : " · prerequisites met"}`);
  }
  if (opened.length > 40) console.log(`  … and ${opened.length - 40} more`);

  // ── MP balance and decay ──
  const [balance, lastUnlock, lastClock, firstEntry, grace] = await Promise.all([
    getMasteryBalanceFresh(userId),
    prisma.masteryLedgerEntry.findFirst({ where: { userId, reason: "SKILL_UNLOCK" }, orderBy: { createdAt: "desc" }, select: { createdAt: true, detail: true } }),
    prisma.masteryLedgerEntry.findFirst({ where: { userId, reason: { in: ["SKILL_UNLOCK", "DECAY", DECAY_GRACE_REASON] } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.masteryLedgerEntry.findFirst({ where: { userId, reason: { not: "REVIEW_MISS" } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.masteryLedgerEntry.findFirst({ where: { userId, reason: DECAY_GRACE_REASON, detail: launchGraceDetail(launchDay) }, select: { id: true } }),
  ]);
  const since = lastClock?.createdAt ?? firstEntry?.createdAt ?? now;
  const idleDays = Math.floor((now.getTime() - since.getTime()) / 86_400_000);
  const affordable = SKILL_POOL.filter((s) => unlockBlockers(s, withLife, ownedCodes, balance).length === 0);
  const wouldDecay = balance > MASTERY_DECAY_FLOOR && idleDays >= MASTERY_IDLE_GRACE_DAYS && affordable.length > 0;
  console.log(`\nMP balance: ${fmt(balance)}`);
  console.log(`Last SKILL_UNLOCK: ${lastUnlock ? `${lastUnlock.createdAt.toISOString()} (${lastUnlock.detail ?? ""})` : "none"}`);
  console.log(`Decay idle clock: ${idleDays} days · affordable with life: ${affordable.length} · decay would start: ${wouldDecay ? "YES" : "no"}${grace ? " · DECAY_GRACE for this launch already written" : " · --apply writes a DECAY_GRACE row (resets the clock)"}`);

  if (!APPLY) {
    console.log("\nDry run: nothing written. Review with the user, then rerun with --apply.");
    return;
  }
  if (!launched) {
    console.log("\nNot launched yet: --apply writes nothing before the launch day.");
    process.exitCode = 1;
    return;
  }

  // ── Apply ──
  // 1. Every closed week, silently (no per-week Seals), 12 per pass until the plan is empty.
  const committed: string[] = [];
  let empty = false;
  for (let pass = 0; pass < APPLY_MAX_PASSES; pass++) {
    const judged = await judgeClosedWeeks(userId, now, { force: true, moments: false });
    committed.push(...judged.committed);
    if (judged.plans.length === 0) {
      empty = true;
      break;
    }
    // Planned but nothing written: another writer judged the first week in between. Re-read on the next pass.
    if (judged.committed.length === 0 && pass > 0) break;
  }
  console.log(`\n1. Weeks committed: ${committed.length ? committed.join(", ") : "none"}`);
  if (!empty) {
    console.log("   !! The plan is not empty yet (see above). Nothing else is written: rerun --apply.");
    process.exitCode = 1;
    return;
  }
  const stated = await stateGoalMp(userId);
  console.log(`2. Goals given their stated MP: ${stated}`);
  // 3. The one launch moment, with every track level-up folded in.
  const afterSnap = await captureSnapshot(userId, { scope: ["levels", "tracks"], fresh: true, now });
  const moments = await detectCelebrations(withTracksAtZero(afterSnap), afterSnap, { cause: "launch", now });
  console.log(`3. Launch moment: ${moments.length ? moments.map((m) => `${m.kind} (${m.facts.title})`).join("; ") : "none (already written, or no track level above 0)"}`);
  // 4. Last: the decay grace, which is also the marker that lets page loads judge weeks.
  if (grace) {
    console.log("4. DECAY_GRACE: already written for this launch day");
  } else {
    await prisma.masteryLedgerEntry.create({ data: { userId, delta: 0, reason: DECAY_GRACE_REASON, detail: launchGraceDetail(launchDay) } });
    console.log("4. DECAY_GRACE: written (0 MP; resets the decay idle clock; page loads may now judge weeks)");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
