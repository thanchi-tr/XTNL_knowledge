/**
 * M2 launch (docs/life-plan/m2-refit.md F20, decision 1). Run by the lead only, never by a subagent,
 * and only after DUTY_LAUNCH_DAY is set in src/lib/duty-economy.ts (or, on the rehearsal mirror
 * only, XTNL_DUTY_LAUNCH_DAY).
 *
 *   npx tsx scripts/duty-launch.ts --deploy=YYYY-MM-DD            # dry run: reads, prints, writes nothing
 *   npx tsx scripts/duty-launch.ts --deploy=YYYY-MM-DD --apply    # sets the cursor (after the user's go-ahead)
 *
 * --deploy is the life day this milestone reached production (F20 order, step 3). The gate
 * (duty-economy validateDutyLaunchDay) refuses --apply unless DUTY_LAUNCH_DAY is set, a Monday,
 * on or after LIFE_LAUNCH_DAY and on or after that deploy day.
 *
 * The database guard (settlement.ts launchTargetOf), before anything is read on --apply:
 *   - --apply writes only to the xtnl-idea project (DATABASE_URL, and DIRECT_URL when set, name the
 *     ref xvlkujmtdcpaoxdftgpl: db.<ref>.supabase.co or a pooler user postgres.<ref>) or to the
 *     rehearsal mirror (both localhost:55432). Anything else (XTNL_thesis, another local database,
 *     the two URLs disagreeing) is refused before a connection is made.
 *   - XTNL_DUTY_LAUNCH_DAY and XTNL_LIFE_LAUNCH_DAY are honoured on the rehearsal mirror only.
 *     Against any other database the code constants decide, as on the production server (a shell
 *     left with a rehearsal override would otherwise set a production cursor on the wrong Monday);
 *     an override that would have changed a day is printed as ignored. The dry run uses the same
 *     days, so it shows exactly what --apply will do.
 *
 * The dry run prints, for the lead to review with the user:
 *   - the target (the matched project ref, or the rehearsal mirror) and the launch days in force;
 *   - the launch day, today, the cursor (null, or already set by newLifeSettingsDays after a
 *     reset), epochDay and firstDutyDay = max(DUTY_LAUNCH_DAY, epochDay);
 *   - when --apply may run: from firstDutyDay + 1 (see below);
 *   - every compulsory template (and every template with a pending rule change) with its rule on
 *     firstDutyDay (duty-rule ruleOn), compulsoryOnRest, its minimum version, and its first expected
 *     occurrences from firstDutyDay with the debt each would carry (life-grade debtFor), so the user
 *     can un-flag or archive while that is still immediate; inbox musts are listed as 'not expected
 *     until clarified';
 *   - RestDay rows and the vacation budget used;
 *   - the freeze balance (0: there is no starter freeze);
 *   - the M5 state: the last judged week per track; every week whose Sunday is before the launch
 *     day is judged without the DUTY gate;
 *   - planSettlement from firstDutyDay onward, as settlement would plan it with the cursor at
 *     firstDutyDay − 1 (empty until 04:00 on firstDutyDay + 2).
 *
 * --apply, only with the user's go-ahead, on firstDutyDay + 1 or later (settlement.ts
 * launchApplyTooEarly): one conditional update,
 *   settledThroughDay = firstDutyDay − 1 WHERE settledThroughDay IS NULL AND epochDay is the one read.
 * Never earlier: the cursor would otherwise sit behind days still lived without stakes, and a 'life'
 * reset between --apply and the launch would create its row with a null cursor (before launch) that
 * nothing sets again. From firstDutyDay + 1 every create already falls after launch and carries its
 * own cursor. Run it on firstDutyDay + 1 so firstDutyDay settles on time (04:00 on firstDutyDay + 2);
 * run later, settlement catches up from firstDutyDay, 14 days a run.
 * Idempotent: a second run (or a run after a reset, where the cursor was created set) writes
 * nothing and says so. Nothing else is written: settlement itself runs from the cron and after()
 * on the next page loads.
 */
import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { getCurrentUserId } from "../src/lib/user";
import { addDays, dateColumn, dayStartOf, keyOfDateColumn, todayKey, type DayKey } from "../src/lib/life-day";
import { isDayKey, parseWeekRowKey } from "../src/lib/life-economy";
import {
  VACATION_BUDGET_SPAN_DAYS,
  VACATION_DAYS_PER_365,
  firstDutyDay,
  isDutyLaunched,
  validateDutyLaunchDay,
} from "../src/lib/duty-economy";
import { expectedOn, parsePendingChange, ruleOn, validRestDays, type DutyTemplate } from "../src/lib/duty-rule";
import { debtFor } from "../src/lib/life-grade";
import { describeRule, parseRule, periodOf } from "../src/lib/recurrence";
import { planSettlement } from "../src/lib/settlement-plan";
import { launchApplyTooEarly, launchDaysFor, launchTargetOf, readSettlementState } from "../src/lib/settlement";

const APPLY = process.argv.includes("--apply");
const DEPLOY_ARG = process.argv.find((a) => a.startsWith("--deploy="))?.slice("--deploy=".length) ?? null;
/** How far ahead the dry run lists each must's expected occurrences. */
const PREVIEW_DAYS = 14;
const PREVIEW_OCCURRENCES = 5;

async function main() {
  // ── Where this would write, and which launch days apply there (before any read) ──
  const target = launchTargetOf({ DATABASE_URL: process.env.DATABASE_URL, DIRECT_URL: process.env.DIRECT_URL });
  console.log(`Target: ${target.kind === "refused" ? "REFUSED for --apply" : target.kind} · ${target.label}`);
  for (const p of target.problems) console.log(`  !! ${p}`);
  console.log(`Mode: ${APPLY ? "APPLY (writes the cursor)" : "dry run (writes nothing)"}`);
  if (APPLY && target.kind === "refused") {
    console.log("\nRefused: --apply writes only to the xtnl-idea project or the rehearsal mirror (localhost:55432). Nothing read, nothing written.");
    process.exitCode = 1;
    return;
  }

  const days = launchDaysFor(target);
  for (const line of days.ignored) console.log(`  note: ${line}`);
  const launchDay = days.duty;
  const userId = getCurrentUserId();
  const now = new Date();
  const today = todayKey(now);
  console.log(
    `Launch day: ${launchDay ?? "(not set)"}${target.kind === "rehearsal" ? " (the rehearsal mirror: XTNL_ overrides honoured)" : ""} · LIFE_LAUNCH_DAY ${days.life ?? "(not set)"} · today ${today} · ${isDutyLaunched(today, launchDay) ? "launched" : "not launched yet"}`
  );

  const deployDay = DEPLOY_ARG && isDayKey(DEPLOY_ARG) ? DEPLOY_ARG : null;
  const gate = validateDutyLaunchDay(launchDay, { deployDay: deployDay ?? "9999-12-31", lifeLaunchDay: days.life });
  const problems = [...(deployDay ? [] : [`Pass --deploy=YYYY-MM-DD: the day M2 reached production${DEPLOY_ARG ? ` ('${DEPLOY_ARG}' is not a day)` : ""}.`]), ...gate.problems];
  const gateOk = deployDay != null && gate.valid;
  console.log(`Gate: ${gateOk ? "valid" : "REFUSED"}${deployDay ? ` (deploy day ${deployDay})` : ""}`);
  for (const p of problems) console.log(`  !! ${p}`);

  const settings = await prisma.lifeSettings.findUnique({ where: { userId }, select: { epochDay: true, settledThroughDay: true } });
  if (!settings) {
    console.log("\nNo LifeSettings row for this user: nothing to launch. (The first capture creates it, with the cursor already set once Duty is live.)");
    if (APPLY) process.exitCode = 1;
    return;
  }
  const epochDay = keyOfDateColumn(settings.epochDay);
  const cursor = settings.settledThroughDay ? keyOfDateColumn(settings.settledThroughDay) : null;
  const first = launchDay ? firstDutyDay(epochDay, launchDay) : null;
  console.log(`\nEpoch day: ${epochDay} · cursor (settledThroughDay): ${cursor ?? "null"} · firstDutyDay: ${first ?? "(no launch day)"}`);
  if (cursor) console.log(`  The cursor is already set${first && cursor === addDays(first, -1) ? " (firstDutyDay − 1: a launch or a create after launch)" : ""}: --apply will write nothing.`);
  if (!first) {
    console.log("DUTY_LAUNCH_DAY is not set (nor, on the rehearsal mirror, a valid XTNL_DUTY_LAUNCH_DAY). Nothing more to show.");
    if (APPLY) process.exitCode = 1;
    return;
  }
  const settleAt = dayStartOf(addDays(first, 2));
  const tooEarly = launchApplyTooEarly(today, first);
  console.log(`  firstDutyDay is first settled at ${settleAt.toISOString()} (04:00 on ${addDays(first, 2)}).`);
  console.log(`  --apply may run from ${addDays(first, 1)}${tooEarly ? " (not yet)" : " (now)"}; run it before ${settleAt.toISOString()} so ${first} settles on time.`);

  // ── The musts, as they will be judged from firstDutyDay ──
  const templates = await prisma.taskTemplate.findMany({
    where: { userId, kind: { in: ["TASK", "HABIT"] }, archivedAt: null, OR: [{ compulsory: true }, { pendingChange: { not: Prisma.DbNull } }] },
    select: {
      id: true,
      title: true,
      kind: true,
      recurrence: true,
      startDay: true,
      dueDay: true,
      dueKind: true,
      compulsory: true,
      compulsoryOnRest: true,
      inbox: true,
      archivedAt: true,
      pendingChange: true,
      mvv: true,
      band: true,
      bandOverride: true,
      estMinutes: true,
      machineMinutes: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const musts = templates.filter((t) => t.compulsory || parsePendingChange(t.pendingChange) != null);
  console.log(`\nMusts and pending rule changes: ${musts.length}`);
  for (const t of musts) {
    const dt: DutyTemplate & { id: string } = {
      id: t.id,
      kind: t.kind,
      recurrence: t.recurrence,
      startDay: keyOfDateColumn(t.startDay),
      dueDay: t.dueDay ? keyOfDateColumn(t.dueDay) : null,
      dueKind: t.dueKind,
      compulsory: t.compulsory,
      compulsoryOnRest: t.compulsoryOnRest,
      inbox: t.inbox,
      archivedDay: null,
      pendingChange: t.pendingChange,
    };
    const r = ruleOn(dt, first);
    const debt = debtFor(t);
    const rule = parseRule(t.recurrence);
    const flags = [r.compulsory ? "must" : "not a must", r.compulsoryOnRest ? "even on rest days" : null, t.mvv ? `minimum: ${t.mvv}` : "no minimum"].filter(Boolean).join(" · ");
    console.log(`  ${t.title.slice(0, 60).padEnd(60)} ${describeRule(t.recurrence, dt.startDay)} · ${flags} · owes ${debt} if missed`);
    const pending = parsePendingChange(t.pendingChange);
    if (pending?.next) console.log(`      pending from ${pending.next.effectiveDay}: ${JSON.stringify(pending.next)}`);
    if (t.inbox) {
      console.log("      inbox: not expected until clarified");
      continue;
    }
    if (rule?.kind === "TARGET") {
      const p = periodOf(rule, first);
      const judged = p.start >= first ? p : periodOf(rule, addDays(p.end, 1));
      console.log(`      judged per ${rule.per === "W" ? "week" : "month"}: ${rule.n} a period, when a must on its first and last day; the first judged period is ${judged.start} – ${judged.end}`);
      continue;
    }
    const due: DayKey[] = [];
    for (let x = first; x < addDays(first, PREVIEW_DAYS) && due.length < PREVIEW_OCCURRENCES; x = addDays(x, 1)) {
      const rx = ruleOn(dt, x);
      if (rx.compulsory && expectedOn(rx, x)) due.push(x);
    }
    console.log(`      first expected: ${due.length ? due.join(", ") : `none in the first ${PREVIEW_DAYS} days`}`);
  }

  // ── Rest days and the vacation budget ──
  const rest = await prisma.restDay.findMany({
    where: { userId, day: { gte: dateColumn(addDays(today, -(VACATION_BUDGET_SPAN_DAYS - 1))) } },
    select: { day: true, kind: true, declaredAt: true, cancelledAt: true },
    orderBy: { day: "asc" },
  });
  const restRows = rest.map((r) => ({ day: keyOfDateColumn(r.day), kind: r.kind, declaredAt: r.declaredAt, cancelledAt: r.cancelledAt }));
  const valid = validRestDays(restRows, "0000-01-01", "9999-12-31");
  console.log(`\nRestDay rows from ${addDays(today, -(VACATION_BUDGET_SPAN_DAYS - 1))}: ${rest.length}`);
  for (const r of restRows) {
    const state = r.cancelledAt ? "cancelled" : valid.has(r.day) ? "holds" : "declared too late (ignored)";
    console.log(`  ${r.day} ${r.kind.padEnd(8)} declared ${r.declaredAt.toISOString()} · ${state}`);
  }
  const vacation = restRows.filter((r) => r.kind === "VACATION" && !r.cancelledAt && r.day >= addDays(first, -(VACATION_BUDGET_SPAN_DAYS - 1)) && r.day <= addDays(first, VACATION_BUDGET_SPAN_DAYS - 1)).length;
  console.log(`  Vacation days declared within 365 days either side of ${first}: ${vacation} (budget ${VACATION_DAYS_PER_365} in any ${VACATION_BUDGET_SPAN_DAYS} days)`);

  // ── Freezes and the M5 weeks ──
  const [freezes, weekRows] = await Promise.all([
    prisma.activityEvent.groupBy({ by: ["source"], where: { userId, source: { in: ["FREEZE_EARN", "FREEZE_USE"] } }, _count: { _all: true } }),
    prisma.activityEvent.findMany({ where: { userId, source: "WEEK", dedupeKey: { not: null } }, select: { dedupeKey: true, day: true } }),
  ]);
  const count = (s: string) => freezes.find((f) => f.source === s)?._count._all ?? 0;
  console.log(`\nFreeze balance: ${count("FREEZE_EARN") - count("FREEZE_USE")} (earned ${count("FREEZE_EARN")}, used ${count("FREEZE_USE")}; no starter freeze, so 0 is expected)`);
  const lastByTrack = new Map<string, { weekKey: string; sunday: DayKey }>();
  for (const w of weekRows) {
    const parsed = parseWeekRowKey(w.dedupeKey);
    if (!parsed) continue;
    const sunday = keyOfDateColumn(w.day);
    const prev = lastByTrack.get(parsed.track);
    if (!prev || sunday > prev.sunday) lastByTrack.set(parsed.track, { weekKey: parsed.weekKey, sunday });
  }
  console.log("M5: the last judged week per track:");
  for (const track of ["BODY", "DUTY", "CRAFT", "CARE"]) {
    const w = lastByTrack.get(track);
    console.log(`  ${track.padEnd(5)} ${w ? `${w.weekKey} (Sunday ${w.sunday})` : "none yet"}`);
  }
  console.log(`  Every week whose Sunday is before ${launchDay} is judged without the DUTY gate; from the week of ${launchDay} on, DUTY and its full days wait for settlement.`);

  // ── What settlement will plan from firstDutyDay ──
  const read = await readSettlementState(prisma, userId, now, { launchDay, cursor: cursor ?? addDays(first, -1) });
  const plans = read ? planSettlement(read.state) : [];
  console.log(`\nSettlement plan from ${first} (cursor ${cursor ?? `${addDays(first, -1)}, as --apply will set it`}): ${plans.length} day${plans.length === 1 ? "" : "s"}${plans.length === 0 ? ` (empty until ${settleAt.toISOString()})` : ""}`);
  for (const p of plans) {
    const tally = new Map<string, number>();
    for (const op of p.ops) {
      const k = op.kind === "event" ? op.input.source : op.kind;
      tally.set(k, (tally.get(k) ?? 0) + 1);
    }
    console.log(`  ${p.day}${p.held ? " (held)" : ""}: ${[...tally].map(([k, n]) => `${k} ×${n}`).join(", ")}`);
    for (const n of p.notes) console.log(`      ${n}`);
  }

  if (!APPLY) {
    console.log("\nDry run: nothing written. Review this with the user, then run again with --apply on their go-ahead.");
    return;
  }
  if (!gateOk) {
    console.log("\nRefused: the gate above failed. Nothing written.");
    process.exitCode = 1;
    return;
  }
  if (tooEarly) {
    console.log(`\nRefused: ${tooEarly} Nothing written.`);
    process.exitCode = 1;
    return;
  }
  const targetDay = addDays(first, -1);
  const res = await prisma.lifeSettings.updateMany({
    // The epoch read: a reset in between (a new epoch, so a new firstDutyDay) writes nothing.
    where: { userId, settledThroughDay: null, epochDay: settings.epochDay },
    data: { settledThroughDay: dateColumn(targetDay) },
  });
  if (res.count === 0) {
    const after = await prisma.lifeSettings.findUnique({ where: { userId }, select: { settledThroughDay: true, epochDay: true } });
    const afterCursor = after?.settledThroughDay ? keyOfDateColumn(after.settledThroughDay) : null;
    const afterEpoch = after ? keyOfDateColumn(after.epochDay) : null;
    console.log(
      afterEpoch !== epochDay
        ? `\nThe epoch changed while this ran (now ${afterEpoch ?? "no row"}): nothing written. Run the dry run again.`
        : `\nThe cursor was already set (${afterCursor ?? "?"}): nothing written.`
    );
  } else {
    console.log(`\nCursor set: settledThroughDay = ${targetDay} on ${target.label}. ${first} is first settled at ${settleAt.toISOString()}.`);
    if (now.getTime() >= settleAt.getTime()) console.log("  Note: that moment has passed; settlement catches up from firstDutyDay on the next cron run or page load, 14 days a run.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
