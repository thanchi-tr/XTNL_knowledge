/**
 * The one day clock (src/lib/life-day.ts) and the knowledge sites cut over
 * to it: due.ts, format-date.ts and the per-Field streak shim.
 *
 * No database: every case is a fixed instant in a named zone, so the checks
 * mean the same thing on any machine and in any server zone. Australia/Sydney
 * has DST (it starts 4 Oct 2026 and ends 4 Apr 2027); Brisbane never does.
 *
 *   npx tsx scripts/life-day-check.ts
 */
import {
  LIFE_TZ,
  DAY_START_HOUR,
  addDays,
  dateColumn,
  dayEndOf,
  dayKeyOf,
  dayStartOf,
  daysBetween,
  keyOfDateColumn,
  weekKeyOf,
  weekStartKeyOf,
  weekStartOf,
  weekdayOf,
  zonedToInstant,
} from "../src/lib/life-day";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { dueCutoff, isDue, daysUntilDue, formatDue } from "../src/lib/due";
import { formatExpiry, formatDay } from "../src/lib/format-date";
import { fieldStreakStep, FIELD_STREAK_CUTOVER_DAY } from "../src/lib/streak-curve";
import { RESET_SCOPES, RESET_SCOPE_ORDER } from "../src/lib/reset-scopes";

const SYD = "Australia/Sydney";
const BNE = "Australia/Brisbane";
const HOUR = 3_600_000;
const MIN = 60_000;

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const iso = (d: Date) => d.toISOString();

console.log(`LIFE_TZ = ${LIFE_TZ}, DAY_START_HOUR = ${DAY_START_HOUR}\n`);

// ── The 04:00 edge ────────────────────────────────────────────────────────
for (const tz of [SYD, BNE]) {
  const four = zonedToInstant(2026, 10, 10, 4, tz);
  const before = new Date(four.getTime() - MIN);
  const a = dayKeyOf(before, tz);
  const b = dayKeyOf(four, tz);
  check(`${tz}: 03:59 and 04:00 local fall on different days`, a === "2026-10-09" && b === "2026-10-10", `${a} | ${b}`);
}
{
  // 00:40 still belongs to the evening before.
  const late = zonedToInstant(2026, 10, 10, 0, SYD);
  const k = dayKeyOf(new Date(late.getTime() + 40 * MIN), SYD);
  check("00:40 local counts for the previous evening", k === "2026-10-09", k);
}

// ── Day lengths across DST ────────────────────────────────────────────────
{
  const len = (key: string, tz: string) => (dayEndOf(key, tz).getTime() - dayStartOf(key, tz).getTime()) / HOUR;
  const start = len("2026-10-03", SYD);
  const end = len("2027-04-03", SYD);
  check("Sydney: life day 2026-10-03 lasts 23 h (DST starts)", start === 23, `${start} h`);
  check("Sydney: life day 2027-04-03 lasts 25 h (DST ends)", end === 25, `${end} h`);
  check("Sydney: an ordinary day lasts 24 h", len("2026-10-06", SYD) === 24);

  let bad = 0;
  let key = "2026-01-01";
  for (let i = 0; i < 800; i++, key = addDays(key, 1)) if (len(key, BNE) !== 24) bad++;
  check("Brisbane: every life day over 800 days lasts 24 h", bad === 0, `${bad} off`);
}

// ── Weeks ─────────────────────────────────────────────────────────────────
{
  const monday4 = zonedToInstant(2026, 10, 12, 4, SYD); // Monday 12 Oct 2026, 04:00 AEDT
  const monday359 = new Date(monday4.getTime() - MIN);
  const prevWeek = weekStartOf(monday359, SYD);
  const thisWeek = weekStartOf(monday4, SYD);
  check(
    "Monday 03:59 local belongs to the previous week",
    iso(prevWeek) === iso(dayStartOf("2026-10-05", SYD)) && weekKeyOf(dayKeyOf(monday359, SYD)) === "2026-W41",
    `${iso(prevWeek)} ${weekKeyOf(dayKeyOf(monday359, SYD))}`
  );
  check(
    "Monday 04:00 local starts a new week",
    iso(thisWeek) === iso(monday4) && weekKeyOf(dayKeyOf(monday4, SYD)) === "2026-W42",
    `${iso(thisWeek)} ${weekKeyOf(dayKeyOf(monday4, SYD))}`
  );
  check("weekdayOf: 2026-10-05 is a Monday, 2026-10-11 a Sunday", weekdayOf("2026-10-05") === 1 && weekdayOf("2026-10-11") === 7);
  check("ISO week across the year edge: 2027-01-01 is 2026-W53", weekKeyOf("2027-01-01") === "2026-W53", weekKeyOf("2027-01-01"));

  // The quota judges "the week that just closed" by stepping calendar days
  // (field-quota.ts), so a DST change inside the week cannot move its start.
  const now = zonedToInstant(2026, 10, 7, 12, SYD);
  const lastWeek = dayStartOf(addDays(weekStartKeyOf(dayKeyOf(now, SYD)), -7), SYD);
  check(
    "last week's start is Monday 04:00 local even across the DST change",
    dayKeyOf(lastWeek, SYD) === "2026-09-28" && iso(lastWeek) === iso(zonedToInstant(2026, 9, 28, 4, SYD)),
    iso(lastWeek)
  );
  const gapHours = (weekStartOf(now, SYD).getTime() - lastWeek.getTime()) / HOUR;
  check("that week really was 167 h long", gapHours === 167, `${gapHours} h`);
}

// ── Round trips ───────────────────────────────────────────────────────────
for (const tz of [SYD, BNE]) {
  let bad = 0;
  let key = "2026-01-01";
  for (let i = 0; i < 800; i++, key = addDays(key, 1)) {
    if (dayKeyOf(dayStartOf(key, tz), tz) !== key) bad++;
    if (dayKeyOf(new Date(dayEndOf(key, tz).getTime() - 1), tz) !== key) bad++;
  }
  check(`${tz}: dayKeyOf(dayStartOf(k)) == k for 800 consecutive keys`, bad === 0, `${bad} off`);
}
{
  let bad = 0;
  let key = "2025-12-25";
  for (let i = 0; i < 800; i++, key = addDays(key, 1)) if (keyOfDateColumn(dateColumn(key)) !== key) bad++;
  check("dateColumn and keyOfDateColumn round-trip", bad === 0);
  check("addDays / daysBetween over month and year edges", addDays("2026-12-31", 1) === "2027-01-01" && daysBetween("2026-02-27", "2026-03-02") === 3);
}

// ── Brisbane is a fixed +10:00 zone ───────────────────────────────────────
{
  let bad = 0;
  const t0 = Date.UTC(2026, 0, 1);
  // Every 37 minutes for two years: hits every hour of every day.
  for (let t = t0; t < t0 + 730 * 24 * HOUR; t += 37 * MIN) {
    const d = new Date(t);
    if (dayKeyOf(d, BNE) !== dayKeyOf(d, "Etc/GMT-10")) bad++;
  }
  check("Brisbane equals a fixed +10:00 zone", bad === 0, `${bad} disagreements`);
}

// ── Due: a card is reviewable from 04:00 local on its day ─────────────────
{
  const due = new Date("2026-10-06T21:00:00Z"); // 07:00 AEST on the 7th
  check("Brisbane: not due at 03:59:59 AEST", !isDue(due, new Date("2026-10-06T17:59:59.999Z"), BNE));
  check("Brisbane: due from 04:00 AEST (2026-10-06T18:00Z)", isDue(due, new Date("2026-10-06T18:00:00Z"), BNE));
  // Sydney is on AEDT by then, so its 04:00 comes an hour earlier.
  check("Sydney: due from 04:00 AEDT (2026-10-06T17:00Z)", isDue(due, new Date("2026-10-06T17:00:00Z"), SYD) && !isDue(due, new Date("2026-10-06T16:59:59Z"), SYD));

  const now = new Date("2026-10-06T23:30:00Z"); // 09:30 on the 7th, Brisbane
  const cutoff = dueCutoff(now, BNE);
  check(
    "dueCutoff is the last millisecond of the life day",
    cutoff.getTime() === dayEndOf("2026-10-07", BNE).getTime() - 1,
    iso(cutoff)
  );
  // A card due at 02:00 on the 8th is still the 7th's life day.
  check("a card due at 02:00 local counts for the day before", isDue(new Date("2026-10-07T16:00:00Z"), now, BNE));
  check(
    "daysUntilDue compares life days, not hours",
    daysUntilDue(new Date("2026-10-07T18:00:00Z"), now, BNE) === 1 && daysUntilDue(new Date("2026-10-05T20:00:00Z"), now, BNE) === -1,
    `${daysUntilDue(new Date("2026-10-07T18:00:00Z"), now, BNE)} / ${daysUntilDue(new Date("2026-10-05T20:00:00Z"), now, BNE)}`
  );
  check("formatDue labels by life day", formatDue(new Date("2026-10-07T12:00:00Z"), now, BNE).label === "Due today");
}

// ── The per-Field streak shim ─────────────────────────────────────────────
{
  const cut = "2026-10-05";
  check("gap 2 before the cut-over continues", fieldStreakStep("2026-10-03", "2026-10-05", cut) === "continued");
  check("gap 2 after the cut-over breaks", fieldStreakStep("2026-10-06", "2026-10-08", cut) === "broken");
  check("gap 1 always continues", fieldStreakStep("2026-10-07", "2026-10-08", cut) === "continued");
  check("gap 3 before the cut-over still breaks", fieldStreakStep("2026-10-01", "2026-10-04", cut) === "broken");
  check("same day is a no-op", fieldStreakStep("2026-10-08", "2026-10-08", cut) === "same");
  check("a UTC date ahead of the life day is a no-op, never a break", fieldStreakStep("2026-10-09", "2026-10-08", cut) === "same");
  check(
    `the shipped cut-over day is a real day key (${FIELD_STREAK_CUTOVER_DAY})`,
    /^\d{4}-\d{2}-\d{2}$/.test(FIELD_STREAK_CUTOVER_DAY) && keyOfDateColumn(dateColumn(FIELD_STREAK_CUTOVER_DAY)) === FIELD_STREAK_CUTOVER_DAY
  );
}

// ── Deterministic rendering ───────────────────────────────────────────────
{
  const d = new Date("2026-10-06T21:00:00Z");
  const a = formatExpiry(d);
  const b = formatExpiry(d, LIFE_TZ);
  check("formatExpiry: the default equals LIFE_TZ passed explicitly", a === b, `${a} | ${b}`);
  const bne = formatExpiry(d, BNE);
  check("formatExpiry renders local time, not UTC", bne.includes("7 Oct") && bne.includes("07:00"), bne);
  check("formatDay renders the local date", formatDay(d, BNE).includes("7 Oct"), formatDay(d, BNE));
}

// ── Glue around the clock (source guards) ─────────────────────────────────
// notifications.ts, DangerZone.tsx and AppNav.tsx load Prisma or React, which
// a check must not, so these read the files instead of running them.
{
  const ROOT = resolve(__dirname, "..");
  const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
  /** Source without comments, so a guard never trips on prose about the old behaviour. */
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  // The feed prints LIFE_TZ times and the 04:00 edge, never UTC or midnight.
  const feed = code(read("src/lib/notifications.ts"));
  check("notifications: no time is labelled UTC (formatExpiry renders LIFE_TZ)", !/\bUTC\b/.test(feed));
  check(
    "notifications: the day's edge comes from DAY_START_HOUR, not 'midnight'",
    !/midnight/i.test(feed) && /DAY_START_HOUR/.test(feed) && (feed.match(/until \$\{DAY_EDGE\}/g) ?? []).length >= 2
  );
  check("AttestationForm: the limit is described per life day", !/UTC day/.test(read("src/components/skills/AttestationForm.tsx")));

  // Every scope the server accepts has a button, 'life' included.
  const keys = Object.keys(RESET_SCOPES).sort().join(",");
  check(
    "RESET_SCOPE_ORDER lists every reset scope exactly once",
    [...RESET_SCOPE_ORDER].sort().join(",") === keys && RESET_SCOPE_ORDER.includes("life"),
    RESET_SCOPE_ORDER.join(",")
  );
  const danger = code(read("src/components/taxonomy/DangerZone.tsx"));
  check(
    "DangerZone renders the shared RESET_SCOPE_ORDER, not a local list",
    /RESET_SCOPE_ORDER\.map\(/.test(danger) && !/\bSCOPE_ORDER\s*[:=]/.test(danger)
  );
  check(
    "DangerZone shows the life counts getResetPreview returns",
    ["tasks", "taskInstances", "activityEvents"].every((k) => danger.includes(`"${k}"`))
  );

  // The audit stays read-only, and its double-pay query can see a paid auto task.
  const sql = read("scripts/life-audit.sql").replace(/--.*$/gm, "");
  const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
  check(
    "life-audit.sql: a READ ONLY transaction, rolled back, with nothing but SELECTs inside",
    /^BEGIN TRANSACTION READ ONLY$/i.test(statements[0] ?? "") &&
      /^ROLLBACK$/i.test(statements[statements.length - 1] ?? "") &&
      statements.slice(1, -1).every((s) => /^(SELECT|WITH)\b/i.test(s)) &&
      !/\b(INSERT|UPDATE|DELETE|MERGE|ALTER|DROP|TRUNCATE|CREATE|GRANT|REVOKE|COPY|CALL)\b/i.test(sql),
    `${statements.length} statements`
  );
  const doublePay = statements.find((s) => s.includes("'shared sourceId'")) ?? "";
  check(
    "life-audit.sql: the double-pay query also flags an auto (study-linked) task that paid TRACK",
    doublePay.includes("'auto task paid'") &&
      /"autoMetric" IS NOT NULL/.test(doublePay) &&
      /e\.source = 'TASK'/.test(doublePay) &&
      /e\.sink = 'TRACK'/.test(doublePay) &&
      /COALESCE\(e\."templateId", i\."templateId"\)/.test(doublePay)
  );

  // npm run life:check runs every pure life check (M2 appends settlement, Duty, the Duty
  // actions and the rituals after character-check; the roadmap appends its seven checks
  // after the rituals, roadmap.md Acceptance; goals-close follows character (the rev-3 fix
  // round's lane L check); roadmap revision 4 appends roadmap-invite and roadmap-hostile
  // after the seven, roadmap-rev4.md Acceptance), and the backfill has its script.
  // At rev-4 integration (roadmap-contracts.md §16.6) the two checks that print PENDING
  // lines run with --strict, so a lane's open item left behind fails life:check.
  // Roadmap revision 5 (roadmap-topic-map.md, "New checks, joined to life:check"): roadmap-goals-check runs right
  // after the rituals, then roadmap-topics-check and roadmap-grounding-check (lane 6), before the roadmap checks
  // (roadmap-contract-check pins the tail from roadmap-contract on).
  const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
  const ROADMAP_LIFE_CHECKS = ["roadmap-contract", "roadmap-measures", "throughput", "roadmap-realism", "roadmap-model", "roadmap-server", "roadmap-quests", "roadmap-invite", "roadmap-hostile"];
  const STRICT_LIFE_CHECKS = new Set(["today-ui", "roadmap-contract"]);
  const names = ["life-day", "streak", "life-grade", "recurrence", "capture-parse", "board", "today-ui", "capture-server", "idea-capture", "weight", "weight-capture", "exercise-style", "subtasks", "character", "goals-close", "settle", "duty", "duty-actions", "rituals", "roadmap-goals", "roadmap-topics", "roadmap-grounding", ...ROADMAP_LIFE_CHECKS];
  const all = names.map((n) => `scripts/${n}-check.ts`);
  const lifeCheck = scripts["life:check"] ?? "";
  check(
    "package.json life:check chains every life check with &&, and each exists",
    lifeCheck === names.map((n) => `tsx scripts/${n}-check.ts${STRICT_LIFE_CHECKS.has(n) ? " --strict" : ""}`).join(" && ") && all.every((f) => existsSync(resolve(ROOT, f))),
    lifeCheck
  );
  for (const n of STRICT_LIFE_CHECKS) {
    check(
      `package.json life:check runs ${n}-check with --strict (a PENDING line fails it), and ${n}:strict runs it the same way on its own`,
      lifeCheck.includes(`tsx scripts/${n}-check.ts --strict && `) && scripts[`${n}:strict`] === `tsx scripts/${n}-check.ts --strict`,
      scripts[`${n}:strict`] ?? "missing"
    );
  }
  check("package.json today-ui:check runs scripts/today-ui-check.ts on its own too", scripts["today-ui:check"] === "tsx scripts/today-ui-check.ts", scripts["today-ui:check"] ?? "missing");
  check(
    "package.json db:backfill-activity runs the backfill script",
    scripts["db:backfill-activity"] === "tsx scripts/backfill-activity.ts" && existsSync(resolve(ROOT, "scripts/backfill-activity.ts"))
  );
  for (const [name, file] of [["goals-close:check", "goals-close"], ["settle:check", "settle"], ["duty:check", "duty"], ["duty-actions:check", "duty-actions"], ["rituals:check", "rituals"], ...ROADMAP_LIFE_CHECKS.map((n) => [`${n}:check`, n] as const)] as const) {
    check(`package.json ${name} runs scripts/${file}-check.ts on its own too`, scripts[name] === `tsx scripts/${file}-check.ts`, scripts[name] ?? "missing");
  }

  // M2 decision 1: every LifeSettings create goes through newLifeSettingsData, so a row
  // made after the Duty launch (the first write after a 'life' reset, the backfill, a
  // first capacity or 'Accept a loss' setting) starts its cursor at today − 1 and a reset
  // never switches Duty off. Check fixtures (scripts/*-check.ts) are not create sites.
  {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(resolve(ROOT, dir))) {
        const rel = `${dir}/${name}`;
        if (statSync(resolve(ROOT, rel)).isDirectory()) walk(rel);
        else if (/\.(ts|tsx|mjs)$/.test(name) && !/-check\.ts$/.test(name)) files.push(rel);
      }
    };
    walk("src");
    walk("scripts");
    const sites: { file: string; ok: boolean }[] = [];
    for (const f of files) {
      const src = code(read(f));
      for (const m of src.matchAll(/lifeSettings\.(create|upsert|createMany)\s*\(/g)) {
        // The call's argument, up to its balanced closing paren.
        let depth = 0;
        let end = m.index + m[0].length - 1;
        for (; end < src.length; end++) {
          if (src[end] === "(") depth++;
          else if (src[end] === ")" && --depth === 0) break;
        }
        const arg = src.slice(m.index, end + 1);
        const create = m[1] === "upsert" ? arg.slice(arg.search(/\bcreate\s*:/)) : arg;
        sites.push({ file: f, ok: /\.\.\.newLifeSettingsData\(/.test(create) });
      }
    }
    const bad = sites.filter((s) => !s.ok).map((s) => s.file);
    check(
      "every LifeSettings create in src/ and scripts/ spreads newLifeSettingsData (M2 decision 1)",
      sites.length >= 4 && bad.length === 0,
      bad.length ? bad.join(", ") : `${sites.length} sites`
    );
    check(
      "backfill-activity.ts: its LifeSettings create spreads newLifeSettingsData, never a bare epochDay",
      sites.some((s) => s.file === "scripts/backfill-activity.ts" && s.ok) && !/create:\s*\{\s*userId,\s*epochDay:/.test(code(read("scripts/backfill-activity.ts")))
    );
  }

  // M2 F20: duty-rehearse.ts writes, so it may only ever reach the local rehearsal database.
  // Read, never run here: it refuses any other DATABASE_URL/DIRECT_URL before Prisma loads.
  {
    const src = code(read("scripts/duty-rehearse.ts"));
    const staticImports = [...src.matchAll(/^import [^;]*? from "([^"]+)";/gm)].map((m) => m[1]);
    check(
      "duty-rehearse: its static imports are pure (life-day, duty-economy); Prisma and the cores load only after the guard",
      staticImports.length > 0 && staticImports.every((p) => p === "../src/lib/life-day" || p === "../src/lib/duty-economy"),
      staticImports.join(", ")
    );
    check("duty-rehearse: loads no .env (dotenv) of its own", !/dotenv/.test(src));
    check(
      "duty-rehearse: refuses any DATABASE_URL or DIRECT_URL that is not localhost/127.0.0.1 port 55432",
      /LOCAL_HOSTS = new Set\(\["localhost", "127\.0\.0\.1"\]\)/.test(src) &&
        /LOCAL_PORT = "55432"/.test(src) &&
        /!LOCAL_HOSTS\.has\(u\.hostname\) \|\| u\.port !== LOCAL_PORT/.test(src) &&
        /localUrlProblem\("DATABASE_URL"\), localUrlProblem\("DIRECT_URL"\)/.test(src) &&
        /process\.exit\(2\)/.test(src)
    );
    const main = src.slice(src.indexOf("async function main()"));
    check("duty-rehearse: main runs the guard before loading any module", main.indexOf("guard();") >= 0 && main.indexOf("guard();") < main.indexOf("await loadModules()"));
    check(
      "duty-rehearse: and the launch script's own guard (launchTargetOf: rehearsal only) before its first query",
      /target\.kind !== "rehearsal"/.test(main) && main.indexOf("launchTargetOf(") >= 0 && main.indexOf("launchTargetOf(") < main.indexOf("$queryRaw")
    );
    check("duty-rehearse: deletes only rows of its own tagged users", /if \(!prefix\.startsWith\(TAG\)\) throw/.test(src) && /const TAG = "rehearse-duty:"/.test(src) && /userId: \{ startsWith: prefix \}/.test(src));
    check("duty-rehearse: writes on read only through XTNL_LIFE_JUDGE in its own process, never NODE_ENV=production", /process\.env\.XTNL_LIFE_JUDGE = "1"/.test(src) && /NODE_ENV === "production"/.test(src));
  }

  // Reduced motion and the shell are gated repo-wide by scripts/shell-check.ts
  // (every keyframe and loop), since the redesign retired AppNav and the list.
}

console.log(failed ? `\n${failed} failed` : "\nall pass");
process.exit(failed ? 1 : 0);
