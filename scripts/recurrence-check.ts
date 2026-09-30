/**
 * Recurrence rules and habit standing on fixed cases
 * (src/lib/recurrence.ts, src/lib/habit.ts).
 *
 * No database: every case is a rule, a start day and a list of instances
 * written out by hand. The property section checks the directly computed
 * nextDue against a day-by-day scan of occursOn for every rule over two
 * years, so the two can never quietly disagree.
 *
 *   npx tsx scripts/recurrence-check.ts
 */
import { addDays, dayEndOf, dayKeyOf, dayStartOf } from "../src/lib/life-day";
import {
  allowsCompulsory,
  describeRule,
  formatRule,
  nextDue,
  occurrencesBetween,
  occursOn,
  parseRule,
  periodProgress,
  scheduledPerWeek,
} from "../src/lib/recurrence";
import {
  HABIT_ALPHA,
  habitLine,
  habitStrength,
  keptToNextRung,
  perDutyStreak,
  rungOf,
  strengthAfter,
  type InstanceLike,
  type Outcome,
} from "../src/lib/habit";
import { consistencyFactor } from "../src/lib/life-grade";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const SYD = "Australia/Sydney";

console.log("— grammar —");
{
  const canon = ["DAILY", "WEEKDAYS", "DOW:1,4", "EVERY:3", "AFTER:3", "TARGET:3/W", "TARGET:2/M", "MONTHLY:15"];
  check("canonical rules round-trip", canon.every((c) => { const r = parseRule(c); return !!r && formatRule(r) === c; }));
  check("DOW days are sorted and deduplicated", formatRule(parseRule("DOW:4,1,4")!) === "DOW:1,4");
  check("WEEKENDS reads as DOW:6,7", formatRule(parseRule("WEEKENDS")!) === "DOW:6,7");
  const bad = ["DOW:8", "DOW:", "EVERY:0", "AFTER:400", "TARGET:9/W", "TARGET:0/M", "MONTHLY:32", "MONTHLY:0", "weekly", "every day", ""];
  check("malformed rules read as a one-off", bad.every((b) => parseRule(b) === null), bad.filter((b) => parseRule(b) !== null).join(","));
  check("a one-off never occurs by rule", !occursOn(null, "2026-10-01", "2026-10-01") && nextDue(null, "2026-10-01", "2026-10-01") === null);
  check("AFTER is never compulsory; fixed schedules and one-offs may be", !allowsCompulsory("AFTER:3") && allowsCompulsory("DOW:1,4") && allowsCompulsory(null));
}

console.log("— DOW:1,4 across the Sydney DST week —");
{
  // Sydney springs forward on Sunday 4 Oct 2026 at 02:00 → 03:00, inside
  // the life day that began at 04:00 on Saturday the 3rd.
  const hours = (dayEndOf("2026-10-03", SYD).getTime() - dayStartOf("2026-10-03", SYD).getTime()) / 3_600_000;
  check("life day 2026-10-03 lasts 23 h in Sydney", hours === 23, String(hours));
  const occ = occurrencesBetween("DOW:1,4", "2026-09-01", "2026-09-28", "2026-10-11");
  check("Mon and Thu either side of the change", occ.join(" ") === "2026-09-28 2026-10-01 2026-10-05 2026-10-08", occ.join(" "));
  // 03:30 AEDT on Monday 5 Oct still belongs to Sunday's life day; 04:30 is Monday.
  const before = dayKeyOf(new Date("2026-10-04T16:30:00Z"), SYD);
  const after = dayKeyOf(new Date("2026-10-04T17:30:00Z"), SYD);
  check("03:30 Monday is still Sunday's life day (not due)", before === "2026-10-04" && !occursOn("DOW:1,4", "2026-09-01", before), before);
  check("04:30 Monday is Monday (due)", after === "2026-10-05" && occursOn("DOW:1,4", "2026-09-01", after), after);
  const back = occurrencesBetween("DOW:1,4", "2027-03-01", "2027-03-29", "2027-04-11");
  check("…and across the April fall-back", back.join(" ") === "2027-03-29 2027-04-01 2027-04-05 2027-04-08", back.join(" "));
}

console.log("— MONTHLY:31 —");
{
  check("falls on 28 Feb 2027", nextDue("MONTHLY:31", "2027-01-01", "2027-02-01") === "2027-02-28");
  check("falls on 30 Apr 2027", nextDue("MONTHLY:31", "2027-01-01", "2027-04-01") === "2027-04-30");
  check("falls on 29 Feb 2028", nextDue("MONTHLY:31", "2027-01-01", "2028-02-01") === "2028-02-29");
  check("and on the 31st where there is one", nextDue("MONTHLY:31", "2027-01-01", "2027-05-01") === "2027-05-31");
  check("not on 27 Feb", !occursOn("MONTHLY:31", "2027-01-01", "2027-02-27"));
  check("MONTHLY:15 from the 16th rolls to next month", nextDue("MONTHLY:15", "2026-10-01", "2026-10-16") === "2026-11-15");
}

console.log("— EVERY:3 phase —");
{
  const start = "2026-10-01";
  check("due on the start day and every third day", ["2026-10-01", "2026-10-04", "2026-10-07", "2026-10-31"].every((d) => occursOn("EVERY:3", start, d)));
  check("not between", !occursOn("EVERY:3", start, "2026-10-02") && !occursOn("EVERY:3", start, "2026-10-03"));
  check("the phase is from the start day, not from completion", nextDue("EVERY:3", start, "2026-10-05", "2026-10-05") === "2026-10-07");
  check("nothing before the start day", !occursOn("EVERY:3", start, "2026-09-28") && nextDue("EVERY:3", start, "2026-09-01") === start);
}

console.log("— AFTER:3 after a late completion —");
{
  const start = "2026-10-01";
  check("due from the start day until done", occursOn("AFTER:3", start, "2026-10-01") && occursOn("AFTER:3", start, "2026-10-04"));
  check("done late on 5 Oct: next due 8 Oct", nextDue("AFTER:3", start, "2026-10-06", "2026-10-05") === "2026-10-08");
  check("not due on 7 Oct", !occursOn("AFTER:3", start, "2026-10-07", "2026-10-05"));
  check("still due, and overdue, on 10 Oct", occursOn("AFTER:3", start, "2026-10-10", "2026-10-05") && nextDue("AFTER:3", start, "2026-10-10", "2026-10-05") === "2026-10-10");
}

console.log("— TARGET —");
{
  const pp = periodProgress("TARGET:3/W", "2026-10-07", ["2026-10-05", "2026-10-05", "2026-10-06", "2026-10-04"]);
  check("TARGET:3/W with two ticks on one day counts 1", pp.done === 2 && !pp.met && pp.target === 3, JSON.stringify(pp));
  check("…and counts only this life week (Mon–Sun)", pp.start === "2026-10-05" && pp.end === "2026-10-11");
  const met = periodProgress("TARGET:3/W", "2026-10-09", ["2026-10-05", "2026-10-06", "2026-10-08"]);
  check("three distinct days meet it", met.met && met.done === 3);
  const month = periodProgress("TARGET:2/M", "2027-02-10", ["2027-01-31", "2027-02-01", "2027-02-28"]);
  check("TARGET:2/M counts the calendar month", month.done === 2 && month.met && month.start === "2027-02-01" && month.end === "2027-02-28", JSON.stringify(month));
}

console.log("— property: occursOn agrees with nextDue over 730 days —");
{
  const start = "2026-10-03";
  const rules = [
    "DAILY", "WEEKDAYS", "DOW:1,4", "DOW:6,7", "DOW:3", "DOW:1,2,3,4,5,6,7", "EVERY:1", "EVERY:2", "EVERY:3", "EVERY:14", "EVERY:45",
    "AFTER:3", "TARGET:3/W", "TARGET:2/M", "MONTHLY:1", "MONTHLY:15", "MONTHLY:29", "MONTHLY:30", "MONTHLY:31",
  ];
  const lastDone = "2026-11-20";
  const bad: string[] = [];
  for (const rule of rules) {
    for (let i = -30; i < 730; i++) {
      const from = addDays(start, i);
      const last = rule.startsWith("AFTER") && i > 60 ? lastDone : null;
      const got = nextDue(rule, start, from, last);
      let want: string | null = null;
      for (let j = 0; j < 800; j++) {
        const d = addDays(from, j);
        if (occursOn(rule, start, d, last)) {
          want = d;
          break;
        }
      }
      if (got !== want) {
        bad.push(`${rule} from ${from}: ${got} vs ${want}`);
        break;
      }
    }
  }
  check(`every rule agrees (${rules.length} rules × 760 days)`, bad.length === 0, bad.slice(0, 3).join("; "));
  const every = occurrencesBetween("EVERY:14", start, start, addDays(start, 365));
  check("occurrencesBetween walks nextDue", every.length === 27 && every.every((d) => occursOn("EVERY:14", start, d)), String(every.length));
}

console.log("— describeRule —");
{
  const cases: [string | null, string][] = [
    ["DOW:1,4", "Mon · Thu"],
    ["DAILY", "Daily"],
    ["WEEKDAYS", "Weekdays"],
    ["DOW:6,7", "Weekends"],
    ["DOW:1,2,3,4,5", "Weekdays"],
    ["EVERY:2", "Every other day"],
    ["EVERY:3", "Every 3 days"],
    ["EVERY:14", "Every 2 weeks"],
    ["AFTER:1", "1 day after done"],
    ["AFTER:3", "3 days after done"],
    ["TARGET:1/W", "Once a week"],
    ["TARGET:3/W", "3× a week"],
    ["TARGET:2/M", "Twice a month"],
    ["MONTHLY:1", "Monthly on the 1st"],
    ["MONTHLY:15", "Monthly on the 15th"],
    ["MONTHLY:22", "Monthly on the 22nd"],
    ["MONTHLY:31", "Monthly on the 31st (or the last day)"],
    [null, "Once"],
  ];
  for (const [rule, want] of cases) {
    const got = describeRule(rule);
    check(`describeRule(${rule}) = '${want}'`, got === want, got);
  }
  check("a weekly EVERY names its weekday", describeRule("EVERY:7", "2026-10-01") === "Weekly · Thu", describeRule("EVERY:7", "2026-10-01"));
  check("scheduledPerWeek: DAILY 7, DOW:1,4 2, EVERY:3 7/3, MONTHLY 12/52", scheduledPerWeek("DAILY") === 7 && scheduledPerWeek("DOW:1,4") === 2 && Math.abs(scheduledPerWeek("EVERY:3") - 7 / 3) < 1e-12 && Math.abs(scheduledPerWeek("MONTHLY:1") - 12 / 52) < 1e-12);
}

// ═══ HABIT STANDING ═══════════════════════════════════════════════════════

const done = (day: string, status = "DONE"): InstanceLike => ({ day, status });

console.log("— habit strength —");
{
  const run = (n: number) => strengthAfter(Array<Outcome>(n).fill("kept"));
  check("Forming is reached from zero at 6 kept (not 5)", rungOf(run(6)) === "Forming" && rungOf(run(5)) === "Seeded", `${run(5).toFixed(4)} ${run(6).toFixed(4)}`);
  check("Established at 18 (not 17)", rungOf(run(18)) === "Established" && rungOf(run(17)) === "Forming", `${run(17).toFixed(4)} ${run(18).toFixed(4)}`);
  check("Automatic at 44 (not 43)", rungOf(run(44)) === "Automatic" && rungOf(run(43)) === "Established", `${run(43).toFixed(4)} ${run(44).toFixed(4)}`);
  check("66 kept gives 0.97", run(66).toFixed(2) === "0.97", run(66).toFixed(4));
  const s = run(30);
  const missed = strengthAfter(["missed"], s);
  check("a miss lowers S but never resets it", missed < s && missed > 0.5 * s && Math.abs(missed - s * (1 - HABIT_ALPHA)) < 1e-12, `${s.toFixed(3)} → ${missed.toFixed(3)}`);
  check("a hold leaves S unchanged", strengthAfter(["held", "pending"], s) === s);
  check("keptToNextRung(0) = 6, and matches the run", keptToNextRung(0) === 6 && keptToNextRung(run(6)) === 12 && keptToNextRung(run(18)) === 26, `${keptToNextRung(run(6))} ${keptToNextRung(run(18))}`);
  check("nothing past Automatic", keptToNextRung(run(60)) === null && habitLine(run(60)) === "Automatic");
  check("the row line: 'Forming · 4 more to Established'", habitLine(run(14)) === "Forming · 4 more to Established", habitLine(run(14)));
}

console.log("— per-duty streak —");
{
  // A Mon/Thu habit kept ten times in a row up to Thu 22 Oct 2026.
  const start = "2026-09-01";
  const days = occurrencesBetween("DOW:1,4", start, "2026-09-21", "2026-10-22");
  check("ten Mon/Thu occurrences in the fixture", days.length === 10, String(days.length));
  const s = perDutyStreak("DOW:1,4", start, "2026-10-23", days.map((d) => done(d)));
  check("a Mon/Thu habit with 10 kept → 35 day-equivalents → C 1.148", s.kept === 10 && s.days === 35 && consistencyFactor(s.days).toFixed(3) === "1.148", `${s.kept} kept, ${s.days} d, C ${consistencyFactor(s.days).toFixed(3)}`);
  // Earlier occurrences with no instance break the run at the first one reached.
  check("an expected day with nothing, past the record window, breaks it", s.kept === 10 && s.lastKept === "2026-10-22");

  const daily = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"].map((d) => done(d));
  const todayOpen = perDutyStreak("DAILY", "2026-10-01", "2026-10-05", daily);
  check("today still open does not break it", todayOpen.kept === 4, String(todayOpen.kept));
  const yesterdayOpen = perDutyStreak("DAILY", "2026-10-01", "2026-10-06", daily);
  check("yesterday still open (recordable) does not break it", yesterdayOpen.kept === 4, String(yesterdayOpen.kept));
  const broken = perDutyStreak("DAILY", "2026-10-01", "2026-10-07", daily);
  check("two days back with nothing breaks it", broken.kept === 0, String(broken.kept));

  const held = perDutyStreak("DAILY", "2026-10-01", "2026-10-06", [
    done("2026-10-01"),
    done("2026-10-02", "DONE_MVV"),
    done("2026-10-03", "SKIPPED"),
    done("2026-10-04", "EXCUSED"),
    done("2026-10-05"),
  ]);
  check("MVV, SKIPPED and EXCUSED hold without counting", held.kept === 2 && held.held === 3, `${held.kept} kept, ${held.held} held`);
  const undone = perDutyStreak("DAILY", "2026-10-01", "2026-10-06", [done("2026-10-01"), done("2026-10-02"), done("2026-10-03", "UNDONE"), done("2026-10-04"), done("2026-10-05")]);
  check("an UNDONE day is as if nothing was done", undone.kept === 2, String(undone.kept));
  const slots = perDutyStreak("DAILY", "2026-10-01", "2026-10-03", [done("2026-10-01"), done("2026-10-01"), done("2026-10-02")]);
  check("'Again' slots on one day count once", slots.kept === 2 && slots.days === 2, String(slots.kept));
  const missedRow = perDutyStreak("DAILY", "2026-10-01", "2026-10-04", [done("2026-10-01"), done("2026-10-02", "MISSED"), done("2026-10-03")]);
  check("a judged MISSED breaks it even inside the window", missedRow.kept === 1, String(missedRow.kept));

  const weeks = perDutyStreak("TARGET:3/W", "2026-09-28", "2026-10-21", [
    ...["2026-09-28", "2026-09-30", "2026-10-02"].map((d) => done(d)),
    ...["2026-10-05", "2026-10-06", "2026-10-06", "2026-10-09"].map((d) => done(d)),
    ...["2026-10-12", "2026-10-14", "2026-10-16"].map((d) => done(d)),
    done("2026-10-19"),
  ]);
  check("TARGET:3/W counts kept weeks; the current week is open", weeks.kept === 3 && weeks.days === 21 && weeks.unit === "week", `${weeks.kept} weeks, ${weeks.days} d`);
  const weekMissed = perDutyStreak("TARGET:3/W", "2026-09-28", "2026-10-21", [
    ...["2026-09-28", "2026-09-30", "2026-10-02"].map((d) => done(d)),
    ...["2026-10-12", "2026-10-13"].map((d) => done(d)),
  ]);
  check("a closed week short of its target breaks it", weekMissed.kept === 0, String(weekMissed.kept));

  const after = perDutyStreak("AFTER:3", "2026-10-01", "2026-10-12", ["2026-10-01", "2026-10-04", "2026-10-07", "2026-10-10"].map((d) => done(d)));
  check("AFTER:3 done every third day keeps a run of 4", after.kept === 4 && after.days === 12, `${after.kept} kept`);
  const afterLate = perDutyStreak("AFTER:3", "2026-10-01", "2026-10-12", ["2026-10-01", "2026-10-06", "2026-10-09"].map((d) => done(d)));
  check("a late AFTER completion starts a new run", afterLate.kept === 2, String(afterLate.kept));
  const afterOverdue = perDutyStreak("AFTER:3", "2026-10-01", "2026-10-20", ["2026-10-01", "2026-10-04"].map((d) => done(d)));
  check("an AFTER overdue past the record window has no run", afterOverdue.kept === 0, String(afterOverdue.kept));
}

console.log("— strength from instances —");
{
  const start = "2026-01-01";
  const days = occurrencesBetween("DAILY", start, start, "2026-03-07");
  const all = days.map((d) => done(d));
  const s = habitStrength("DAILY", start, "2026-03-08", all);
  check("66 kept days read as 0.97", s.toFixed(2) === "0.97", s.toFixed(4));
  const withMiss = habitStrength("DAILY", start, "2026-03-08", all.filter((i) => i.day !== "2026-03-01"));
  check("one missed day lowers it a little, never to zero", withMiss < s && withMiss > 0.9, withMiss.toFixed(4));
  const pending = habitStrength("DAILY", start, "2026-03-09", all);
  check("yesterday still open is not yet a miss", Math.abs(pending - s) < 1e-12);
  check("rungOf reads it", rungOf(s) === "Automatic" && rungOf(0.3) === "Forming");
}

if (failed > 0) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("\nall passed");
