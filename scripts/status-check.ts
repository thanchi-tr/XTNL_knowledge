/**
 * The status guard (docs/life-plan/blueprint-plan-2026-10-22.md P0): no file named avatar*,
 * competency* or status-panel* holds a ledger writer. The Status panel (P1), avatar targets (P4)
 * and competencies (P5) are readings: they are derived from the ledger and never add to it, so no
 * XP, MP or Domain point can come from them (blueprint D9: a competency's tier-up is a Seal only).
 *
 * A target is any file under src/ with a path segment that starts with avatar, competenc
 * (competency, competencies) or status-panel, read as scripts/_ledger-writers.ts isTarget does
 * (StatusPanel.tsx and an avatar/ folder count). P1 landed the first three (status-panel.ts,
 * status-panel-server.ts, StatusPanel.tsx); the rule fails the moment any target writes. A target
 * may not:
 *   - write the ledger itself: an ActivityEvent row of any sink, a MasteryLedgerEntry or a
 *     CapitalLedgerEntry (Prisma or raw SQL), or a Domain's totalPoints;
 *   - call a ledger helper (activity.ts recordActivity / activityOp / activityData, mastery.ts's
 *     mint helpers, srs.ts domainDebitOp: balance-horizon 3g's LEDGER_WRITERS names);
 *   - import a value from a writer module (_ledger-writers.ts writerModulesOf: every src file
 *     with a ledger write, found by the same scan, every "use server" action importing one, and
 *     every module importing such an action, as mobile-api-cores.ts and idea-filing.ts do).
 *     `import type` is fine.
 *
 * P1 (the Status panel; decisions D1, D2) adds its own section: each of the five rows is its source's
 * own figures (a real life view built by lifeTracksView from a fixture ledger, and knowledgeRow),
 * never a second formula; Intellect stands alone until life counts; Capital is AUD won per month
 * from Deals at stage WON only (archived, open and lost deals never count; the month is the life
 * day's, Sydney, 04:00), with no level and no XP; and the server file's one Prisma read is that
 * Deal read. The /you sheet and the phone's loadKnowledgeRow build Knowledge the same way.
 *
 * P2 (the vocabulary; decision D6, copy only) adds its section: the five Status axes are Attributes (the card's title,
 * on the web and the phone), the radar's 13 are Traits, the /skills row is Emblems (every path's title too; the routes
 * stay, /skills/life included), and the Life tree is Life perks wherever it is named (its title, the rules card, the
 * capstone's way on, the receipt's S row, the Life chip). No string under src/ still calls the emblems "Skills" or
 * the tree "the Life tree"; the Prisma enum Attribute stays and no model is named Skill (P5's table is Competency).
 *
 * P3 (the track curve; decision D5, behind TRACK_CURVE_LAUNCH_DAY) adds its section: the switch is null in code and
 * production ignores the override, so every reader stays on SQUARE; with the curve on, live-style ledgers (life launched
 * 1 October, three judged weeks by Saturday 24 October and up to five by 11 November, every kept/held/missed mix, XP
 * 0–1,500 a track) only rise, never past a kept-week cap that stays at 3 or less (4 with a paid Mid goal), their
 * attribute rows never fall, and a diff across the flip plays no moment. The curve reaches level readers only: no pay,
 * judge, mint or settle module names it, every src caller of pointsLevel, xpForLevel and trackLevel passes one, and
 * the then/now readers (the radar's ghost, the progress rate, the audit, Stats) read both ends on today's.
 *
 * P4 (avatar targets; blueprint 1.2, decisions D3 and D4; migration 20261229000000_avatar_targets) adds its section: the
 * migration is additive (one table, timestamptz, its CHECKs, one live row a lineage) and schema.prisma matches it; the
 * weight target is WeightGoal's own (no AvatarTarget row has WEIGHT); an AVATAR| reading is ignored by every existing
 * RoadmapReading reader (each listed with the key filter it reads by, and a mixed fixture through each filter) and kept
 * by the life reset; the way, the pace and the lines (the plan's "Weight 82.4 → 75 kg · 38% of the way · on pace");
 * each measured metric reads the app's own figure (the judge's effort minutes, a Field's level, WON revenue); an add
 * and an edit plan what they write; and the cores, on a fake store, are gated by the write switch, leave the archived
 * history on an edit, write MANUAL logs as SELF and the cron's readings as COMPUTED, and never write the ledger.
 *
 * P5 (skills: named competencies with hour tiers; blueprint 1.5, decisions D7, D8 and D9; migration
 * 20261230000000_competencies) adds its section: the migration is additive (one table, two nullable competencyId columns,
 * timestamptz, its CHECKs, one live skill a name and one live exercise skill) and schema.prisma matches it; the tier
 * goldens (99.9 h = T1, 100 h = T2, 2,000 h = T4) and the meter within a tier; the hours are the linked templates' live
 * tick minutes (receipt, then instance, then estimate), net of every 'undo:<id>' row, each tick toward one skill only
 * (a link credits a task's history exactly once, and an unlink takes it out), an exercise skill's walks with no tick
 * counted twice; the suggestions (families with SUGGEST_MIN_COMPLETIONS live ticks); what an add, an edit and a link may
 * write (a work tab's task and a goal are refused); the cores, on a fake store, gated by the write switch and writing
 * only skill rows and links; a tier crossed is one competency-tier Seal with no amount (no MP), a link plays none; only
 * competency files name competencyId (a template with none behaves exactly as before); the Status rows count skills.
 *
 * Text only: no database, no model, no clock (P4's cores run on a fake store, never Prisma). Exits 1 on any failure. _no-model comes first all the same:
 * the fixtures below spell imports of writer actions, and roadmap-contract-check's import walk follows
 * them to roadmap modules.
 *
 *   npx tsx scripts/status-check.ts
 */
import "./_no-model";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LEDGER_WRITES, ROOT, codeOf, excerpt, importsOf, isTarget, readCode, srcFiles, writerModulesOf } from "./_ledger-writers";
import { LIFE_PERKS_PATH, LIFE_PERKS_TITLE, PROFILE, SKILLS_PATH, activeSub, sectionById, titleFor } from "../src/components/shell/nav";
import { YOU_COPY } from "../src/components/tour/tour-steps";
import { ATTRIBUTES } from "../src/lib/attributes";
import { attributeSlug } from "../src/lib/attribute-themes";
import { addDays, weekKeyOf, type DayKey } from "../src/lib/life-day";
import { TRACK_NAME, lifeTracksView, notLaunchedView, type LifeLedger } from "../src/lib/life-tracks";
import { TRACK_CURVE_LAUNCH_DAY, effortWeightOfB, trackCurveLaunchDay, trackCurveOn, xpForLevel } from "../src/lib/life-economy";
import { SNAPSHOT_SCOPES, diffProgress, draftToEvent, type ProgressData } from "../src/lib/celebration-detect";
import { KIND_TIER, honestyProblem } from "../src/lib/celebration-types";
import { knowledgeLine, knowledgeRow } from "../src/components/home/sheet-math";
import { FIELD_TIERS } from "../src/lib/field-tier";
import {
  CAPITAL_MONTHS,
  CAPITAL_STAGE,
  STATUS_KEYS,
  STATUS_NAME,
  STATUS_SOURCE,
  STATUS_TITLE,
  capitalPanelOf,
  capitalReadingOf,
  capitalSinceDay,
  statusPanelOf,
  type CapitalDeal,
} from "../src/lib/status-panel";
import { effortMinutesOf, liveWeekRows, type WeekTaskRow } from "../src/lib/life-weeks";
import { SELF_KEY_PREFIX, cardsAtLevelKey, checkpointLogKey, checkpointLogPrefix, parseMeasureKey, practiceKeptKey, proficiencyKey } from "../src/lib/roadmap-types";
import {
  AVATAR_ATTRIBUTES,
  AVATAR_METRICS,
  AVATAR_PER_ATTRIBUTE_MAX,
  AVATAR_TARGETS_MAX,
  FIELD_LEVEL_MAX,
  NO_FACTS,
  PACE_WORDS,
  STORED_METRICS,
  WEIGHT_PLACE,
  avatarKey,
  avatarTargetsOf,
  capacityError,
  cleanTargetInput,
  computedReadingsOf,
  lastWeekOf,
  metricsFor,
  paceOf,
  parseAvatarKey,
  planTargetEdit,
  reachedOf,
  shareOfWay,
  trackMinutesOf,
  weightTargetOf,
  type AvatarFacts,
  type AvatarTargetInput,
  type AvatarTargetRow,
} from "../src/lib/avatar";
import {
  AVATAR_WRITES_OFF,
  addAvatarTargetCore,
  archiveAvatarTargetCore,
  editAvatarTargetCore,
  loadAvatar,
  logAvatarReadingCore,
  recordAvatarReadings,
  type AvatarFactReads,
  type AvatarNewRow,
  type AvatarStore,
} from "../src/lib/avatar-server";
import {
  EXERCISE_ATTRIBUTE,
  GOAL_LINK_REFUSAL,
  NO_HOURS_LINE,
  NO_SKILL_FACTS,
  SKILLS_MAX,
  SKILL_ATTRIBUTES,
  SKILL_GONE,
  SKILL_HOURS_TOP,
  SKILL_KINDS,
  SKILL_NAME_EMPTY,
  SKILL_NAME_MAX,
  SKILL_TIERS,
  SUGGEST_MAX,
  SUGGEST_MIN_COMPLETIONS,
  TICK_BASIS,
  WALKS_ARE_VITALITY,
  WALK_PAID_SOURCE,
  WORK_LINK_REFUSAL,
  cleanSkillInput,
  effectiveSkillOf,
  estimatedTicksLine,
  hoursLineOf,
  hoursText,
  linkRefusalOf,
  parseSkillSealKey,
  planSkillEdit,
  roadmapLinkRefusalOf,
  skillCountLabel,
  skillCountsOf,
  skillHoursOf,
  skillSealKey,
  skillsOf,
  suggestionsOf,
  tickMinutesOf,
  tierLineOf,
  tierMeterOf,
  tierOfHours,
  type FamilyRow,
  type SkillFacts,
  type SkillRow,
  type SkillTemplate,
  type SkillTick,
} from "../src/lib/competency";
import {
  SKILL_WRITES_OFF,
  addSkillCore,
  addSuggestedSkillCore,
  archiveSkillCore,
  editSkillCore,
  isMissingSkillSchema,
  linkRoadmapSkillCore,
  linkTemplateSkillCore,
  loadSkills,
  type LinkRoadmap,
  type LinkTemplate,
  type SkillReads,
  type SkillStore,
} from "../src/lib/competency-server";

/** avatar*, competency* and status-panel*, as isTarget reads a path segment. */
const STATUS_PREFIXES = ["avatar", "competenc", "statuspanel"] as const;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Why `code` (the file `rel`) breaks the rule; empty when it holds none. */
function offencesOf(rel: string, code: string, writers: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const write = excerpt(LEDGER_WRITES, code);
  if (write) out.push(`writes the ledger (${write})`);
  for (const i of importsOf(code, rel)) {
    if (i.names.length > 0 && i.resolved != null && writers.has(i.resolved)) out.push(`imports ${i.names.join(", ")} from the writer ${i.resolved}`);
  }
  return out;
}

const files = srcFiles();
const cache = new Map<string, string>();
const code = (rel: string) => cache.get(rel) ?? (cache.set(rel, readCode(rel)), cache.get(rel) as string);
const writers = writerModulesOf(files, code);

console.log("— the writers the scan finds —");
{
  const known = [
    "src/lib/activity.ts",
    "src/lib/mastery.ts",
    "src/lib/capital.ts",
    "src/lib/srs.ts",
    "src/lib/tasks.ts",
    "src/lib/settlement.ts",
    "src/lib/momentum-server.ts",
    "src/app/actions/ideas.ts",
    "src/app/actions/skills.ts",
    "src/app/actions/tasks.ts",
    "src/lib/mobile-api-cores.ts",
    "src/lib/idea-filing.ts",
  ];
  const missing = known.filter((f) => !writers.has(f));
  check(
    "the scan finds today's writers: activity, mastery, capital, srs, tasks, settlement, momentum-server, the idea and emblem actions, the task actions that call them, and the lib modules that carry an action (mobile-api-cores, idea-filing)",
    missing.length === 0,
    missing.length ? `missing ${missing.join(", ")}` : `${writers.size} writer modules among ${files.length} src files`
  );
}

console.log("— the matcher, on fixtures —");
{
  const FROM = "src/lib/status-panel.ts";
  const caught: [string, string][] = [
    ["a TRACK row through activityOp", `ops.push(activityOp(userId, { source: "TASK", sink: "TRACK", track: "DUTY", xp: 4 }));`],
    ["a NONE row through recordActivity (a status file writes no row at all)", `await recordActivity(userId, { source: "WEEK", sink: "NONE" });`],
    ["a direct ActivityEvent create", `await prisma.activityEvent.create({ data });`],
    ["an MP mint", `ops.push(...mintLifeMasteryOps(userId, mint));`],
    ["a MasteryLedgerEntry create", `await prisma.masteryLedgerEntry.create({ data: { userId, amount: 1 } });`],
    ["a CapitalLedgerEntry upsert", `await client.capitalLedgerEntry.upsert({ where, create, update });`],
    ["Domain points through Prisma", `await prisma.domain.update({ where: { id }, data: { totalPoints: { increment: 5 } } });`],
    ["Domain points through raw SQL", 'await prisma.$executeRaw`UPDATE "public"."Domain" SET "totalPoints" = 0 WHERE "id" = ${id}`;'],
    ["an INSERT into MasteryLedgerEntry", 'await prisma.$executeRaw`INSERT INTO "MasteryLedgerEntry" ("id") VALUES (${id})`;'],
    ["the same INSERT in lower case", 'await prisma.$executeRaw`insert into "MasteryLedgerEntry" ("id") values (${id})`;'],
    ["Domain points past a nested object", `await prisma.domain.update({ where: { id }, data: { level: { set: 2 }, totalPoints: 0 } });`],
    ["a value import from mastery.ts", `import { getMasteryBalanceFresh } from "@/lib/mastery";`],
    ["a value import from tasks.ts", `import { completeInstanceCore } from "./tasks";`],
    ["a server action that pays", `import { completeTask } from "@/app/actions/tasks";`],
    ["a lib module carrying paying actions (realMobileDeps holds completeTask, submitReview …)", `import { realMobileDeps } from "@/lib/mobile-api-cores";`],
    ["a namespace import of activity.ts", `import * as A from "@/lib/activity";`],
    ["a dynamic import of srs.ts", `const srs = await import("@/lib/srs");`],
  ];
  const clean: [string, string][] = [
    ["a type import from mastery.ts", `import type { LifeMint } from "@/lib/mastery";`],
    ["type-only names from activity.ts", `import { type ActivityInput } from "@/lib/activity";`],
    ["a read of TRACK rows", `const rows = await prisma.activityEvent.findMany({ where: { userId, sink: "TRACK" } });`],
    ["a Domain's points read into a row", `return domains.map((d) => ({ composition: d.composition, totalPoints: d.totalPoints }));`],
    ["a writer named in a comment", `// never prisma.activityEvent.create here\n/* nor mintLifeMasteryOps(userId, m) */\nexport const x = 1;`],
    ["a value import from a module that only reads", `import { lifeTracksView } from "@/lib/life-tracks";`],
  ];
  // Through codeOf, as readCode reads every real file.
  const missed = caught.filter(([, src]) => offencesOf(FROM, codeOf(src), writers).length === 0).map(([n]) => n);
  const flagged = clean.flatMap(([n, src]) => {
    const o = offencesOf(FROM, codeOf(src), writers);
    return o.length ? [`${n}: ${o.join("; ")}`] : [];
  });
  check(`the matcher catches every writer form (${caught.length} fixtures)`, missed.length === 0, missed.join(", "));
  check(`…and passes reads, types and comments (${clean.length} fixtures)`, flagged.length === 0, flagged.join(" | "));
}

console.log("— the Status panel (P1) —");
{
  // A real life view: lifeTracksView over a fixture ledger (launched 1 Oct, read on Friday 23 Oct 2026).
  const today: DayKey = "2026-10-23";
  const sundays = Array.from({ length: 10 }, (_, i) => addDays("2026-10-18", -7 * (9 - i)));
  const marks: Record<string, string> = { BODY: "kkkkokkkkk", DUTY: "kkkkkkkkkk", CRAFT: "okkokkokko", CARE: "oooooooooo" };
  const ledger: LifeLedger = {
    epochDay: "2026-08-01",
    xpByDay: [
      { track: "BODY", day: "2026-10-05", xp: 400 },
      { track: "BODY", day: "2026-10-20", xp: 200 },
      { track: "DUTY", day: "2026-10-02", xp: 4900 },
      { track: "CRAFT", day: "2026-10-21", xp: 310 },
    ],
    compositions: [],
    weeks: Object.entries(marks).flatMap(([track, m]) =>
      sundays.map((sunday, i) => ({ track: track as LifeLedger["weeks"][number]["track"], weekKey: weekKeyOf(sunday), sunday, kept: m[i] === "k", detail: m[i] === "k" ? "kept" : "missed" }))
    ),
    mints: [],
  };
  const life = lifeTracksView(ledger, today, "2026-10-01");
  const k = knowledgeRow(
    [
      { name: "Statistics", level: 9.4 },
      { name: "Chemistry", level: 4.2 },
    ],
    [
      { name: "Statistics", level: 9.1 },
      { name: "Chemistry", level: 4.2 },
    ]
  );
  const panel = statusPanelOf(life, k);
  check("the fixture is launched, with four track rows (Duty, Craft, Body, Care)", life.launched && life.rows.length === 4, JSON.stringify(life.rows.map((r) => [r.track, r.level])));
  check(
    "five rows in the panel's order: Vitality (Body), Intellect (Knowledge), Craft, Duty, Care",
    panel.launched && panel.rows.map((r) => `${r.key}:${r.name}`).join(",") === "VITALITY:Body,INTELLECT:Knowledge,CRAFT:Craft,DUTY:Duty,CARE:Care" && STATUS_KEYS.length === 5,
    panel.rows.map((r) => `${r.key}:${r.name}`).join(",")
  );
  const off: string[] = [];
  for (const r of panel.rows) {
    const src = STATUS_SOURCE[r.key];
    if (r.attribute !== STATUS_NAME[r.key]) off.push(`${r.key} attribute ${r.attribute}`);
    if (src === "KNOWLEDGE") {
      const want = { level: k.level, progress: k.now, banked: k.banked, cap: null, atCap: false, keptStreak: null, weeks: [], line: knowledgeLine(k), unit: "pts", name: "Knowledge" };
      const got = { level: r.level, progress: r.progress, banked: r.banked, cap: r.cap, atCap: r.atCap, keptStreak: r.keptStreak, weeks: r.weeks, line: r.line, unit: r.unit, name: r.name };
      if (JSON.stringify(got) !== JSON.stringify(want)) off.push(`INTELLECT ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
      continue;
    }
    const t = life.rows.find((x) => x.track === src);
    if (!t) {
      off.push(`${r.key} has no track row`);
      continue;
    }
    const want = { level: t.level, progress: t.now, banked: t.banked, cap: t.cap, atCap: t.atCap, keptStreak: t.keptStreak, weeks: t.weeks.slice(-8), line: t.line, unit: "xp", name: TRACK_NAME[src], sigil: t.sigil };
    const got = { level: r.level, progress: r.progress, banked: r.banked, cap: r.cap, atCap: r.atCap, keptStreak: r.keptStreak, weeks: r.weeks, line: r.line, unit: r.unit, name: r.name, sigil: r.sigil };
    if (JSON.stringify(got) !== JSON.stringify(want)) off.push(`${r.key} ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
  }
  check("each row is its source's own figures: a track's LifeTrackRow (level, meter, banked, cap, atCap, kept streak, ≤ 8 pips, line), Knowledge's KnowledgeRow and knowledgeLine", off.length === 0, off.join(" | "));
  check(
    "…and the fixture exercises them: Duty capped at its kept-week cap, Body uncapped with a kept streak and 8 pips, Care at 0 with no XP",
    (() => {
      const by = new Map(panel.rows.map((r) => [r.key, r]));
      return by.get("DUTY")?.atCap === true && by.get("VITALITY")?.atCap === false && (by.get("VITALITY")?.keptStreak ?? 0) > 0 && by.get("CARE")?.level === 0 && by.get("VITALITY")?.weeks.length === 8;
    })(),
    JSON.stringify(panel.rows.map((r) => [r.key, r.level, r.cap, r.atCap, r.keptStreak, r.weeks.length]))
  );
  const before = statusPanelOf(notLaunchedView(today), k);
  check("not launched (or a failed life read): Intellect alone, no track level claimed", !before.launched && before.rows.length === 1 && before.rows[0].key === "INTELLECT");
  check("launched with no rows in the view: Intellect alone (a row is never invented)", statusPanelOf({ launched: true, rows: [] }, k).rows.map((r) => r.key).join(",") === "INTELLECT");
  const coreSrc = readCode("src/lib/status-panel.ts");
  check(
    "never a second formula: status-panel.ts computes no level, curve, cap or character level (it passes the track's and Knowledge's own)",
    !/\b(pointsLevel|xpForLevel|trackLevel|trackDepth|depthCap|characterRaw|characterLevel|wholeLevel|fieldBreadth|moreKeptWeeks)\s*\(/.test(coreSrc) &&
      !/\bimport\b[^;]*from "[^"]*\/(prisma|life-economy|character|xp)"/.test(coreSrc)
  );

  // Capital (D1): AUD won per month, Deals at stage WON only; the month is the life day's (Sydney; the day turns at 04:00).
  const deals: CapitalDeal[] = [
    { stage: "WON", valueCents: 125_050, closedAt: "2026-10-03T01:00:00.000Z" },
    { stage: "WON", valueCents: 400_000, closedAt: new Date("2026-10-20T05:00:00.000Z") },
    // 1 Nov 03:30 Sydney (AEDT) is still the life day of 31 October: October.
    { stage: "WON", valueCents: 99, closedAt: "2026-10-31T16:30:00.000Z" },
    // 1 Nov 04:30 Sydney: November.
    { stage: "WON", valueCents: 700, closedAt: "2026-10-31T17:30:00.000Z" },
    { stage: "LOST", valueCents: 900_000, closedAt: "2026-10-10T01:00:00.000Z" },
    { stage: "QUOTED", valueCents: 900_000, closedAt: null },
    { stage: "NEW", valueCents: 900_000, closedAt: "2026-10-10T01:00:00.000Z" },
    { stage: "WON", valueCents: 900_000, closedAt: "2026-10-11T01:00:00.000Z", archivedAt: "2026-10-12T01:00:00.000Z" },
    { stage: "WON", valueCents: 900_000, closedAt: null },
    { stage: "WON", valueCents: 320_000, closedAt: "2026-09-15T01:00:00.000Z" },
  ];
  const oct = capitalReadingOf(deals, "2026-10");
  check(
    "October: the three WON deals closed in its life days, summed in whole cents ($5,251.49); lost, open, archived and undated deals never count",
    oct.wonCents === 525_149 && oct.deals === 3 && oct.won === "$5,251.49" && oct.label === "October 2026" && Number.isInteger(oct.wonCents),
    JSON.stringify(oct)
  );
  check("the life day's 04:00 turn decides the month: 03:30 on 1 November is October, 04:30 is November", capitalReadingOf(deals, "2026-11").wonCents === 700 && capitalReadingOf(deals, "2026-11").deals === 1);
  check("a month with none reads $0 and 0 deals", JSON.stringify(capitalReadingOf(deals, "2026-08")) === JSON.stringify({ month: "2026-08", label: "August 2026", wonCents: 0, won: "$0", deals: 0 }));
  const cp = capitalPanelOf(deals, "2026-10-23");
  check(
    "the Capital row: this month first, then the two before ('September $3,200 · August $0'), its words, and no level, XP or points field",
    cp !== null &&
      CAPITAL_MONTHS === 3 &&
      cp.months.map((m) => m.month).join(",") === "2026-10,2026-09,2026-08" &&
      cp.line === "3 deals won in October" &&
      cp.history === "September $3,200 · August $0" &&
      !Object.keys(cp).some((key) => /level|xp|points|mp/i.test(key)),
    JSON.stringify(cp)
  );
  check("no deal won in the window: no Capital row (null), never a '$0' row", capitalPanelOf(deals.filter((d) => d.stage !== "WON"), "2026-10-23") === null && capitalPanelOf([], "2026-10-23") === null);
  check("a quiet month with wins before it says so: 'No deal won in November yet'", capitalPanelOf(deals.filter((d) => d.valueCents !== 700), "2026-11-02")?.line === "No deal won in November yet");
  check("the window starts on the 1st of the month two before (across a year too)", capitalSinceDay("2026-10-23") === "2026-08-01" && capitalSinceDay("2027-01-05") === "2026-11-01" && capitalSinceDay("2026-10-01", 1) === "2026-10-01");
  check("the stage that counts is WON", CAPITAL_STAGE === "WON");

  // The reads: one Deal read, at stage WON, unarchived, from the window's first life day; nothing else from Prisma.
  const server = readCode("src/lib/status-panel-server.ts");
  const prismaUses = [...server.matchAll(/\bprisma\s*\.\s*(\$?\w+)(?:\s*\.\s*(\w+))?/g)].map((m) => `${m[1]}.${m[2] ?? ""}`);
  check(
    "status-panel-server.ts's one Prisma read is prisma.deal.findMany at stage WON, not archived, from capitalSinceDay's day start; no raw SQL, no other model",
    JSON.stringify(prismaUses) === JSON.stringify(["deal.findMany"]) &&
      /where: \{ userId, stage: CAPITAL_STAGE, archivedAt: null, closedAt: \{ gte: dayStartOf\(capitalSinceDay\(today\)\) \} \}/.test(server) &&
      !/\$queryRaw|\$executeRaw|\$transaction/.test(server),
    prismaUses.join(", ")
  );
  check(
    "the panel and the card import no Prisma at all (status-panel.ts, StatusPanel.tsx)",
    ["src/lib/status-panel.ts", "src/components/home/StatusPanel.tsx"].every((f) => !/from "[^"]*prisma[^"]*"|@prisma\/client/.test(readCode(f)))
  );
  // One Knowledge: /you's loadSheet and the phone's loadKnowledgeRow both run knowledgeRow over the Field tree's levels
  // and the 7-days-ago snapshot, the same mapping.
  const sheet = readCode("src/app/you/_lib/sheet.ts");
  check(
    "Knowledge is built the same way for /you (loadSheet) and the phone (loadKnowledgeRow): knowledgeRow(tree → {name, level}, ghosts of 7 days ago → {name: fieldName, level})",
    /getGhostLevelsFromDaysAgo\(7\)/.test(sheet) &&
      /const fieldRows = tree\.map\(\(f\) => \(\{ name: f\.name, level: f\.level \}\)\);/.test(sheet) &&
      /const weekAgo: FieldLevelRow\[\] = ghosts\.map\(\(g\) => \(\{ name: g\.fieldName, level: g\.level \}\)\);/.test(sheet) &&
      /knowledge: knowledgeRow\(fieldRows, weekAgo\),/.test(sheet) &&
      /Promise\.all\(\[loadFieldTree\(\), getGhostLevelsFromDaysAgo\(7\)\]\)/.test(server) &&
      /return knowledgeRow\(\s*tree\.map\(\(f\) => \(\{ name: f\.name, level: f\.level \}\)\),\s*ghosts\.map\(\(g\) => \(\{ name: g\.fieldName, level: g\.level \}\)\)\s*\);/.test(server)
  );
}

console.log("— the vocabulary (P2) —");
{
  // D6, copy only: Attributes are the five Status axes, Traits the radar's 13, the /skills row is Emblems (its route
  // stays) and the Life tree is Life perks. "Skills" is left for P5's real skills (named competencies).
  const emblems = PROFILE.subs.find((s) => s.href === "/skills");
  // Re-pinned for P5: the one row labelled Skills is the real skills' page, /you/skills (never the emblems' route).
  const skillRows = PROFILE.subs.filter((s) => /\bskills?\b/i.test(s.label));
  check(
    "the profile menu's /skills row is labelled Emblems (its tree icon kept); the only row labelled Skills is P5's /you/skills",
    emblems?.label === "Emblems" && emblems.icon === "tree" && skillRows.length === 1 && skillRows[0].href === SKILLS_PATH,
    JSON.stringify(PROFILE.subs.map((s) => s.label))
  );
  const slugs = ATTRIBUTES.map(attributeSlug);
  const paths = ["/skills", ...slugs.map((s) => `/skills/${s}`)];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  check(
    "every path's page (/skills and the 13 /skills/<slug>) is titled You · Emblems and lights the Emblems row; /skills/life is You · Life perks under it",
    slugs.length === 13 &&
      !slugs.includes("life") &&
      paths.every((p) => same(titleFor(p), { eyebrow: "You", title: "Emblems" }) && activeSub(p) === "/skills") &&
      LIFE_PERKS_PATH === "/skills/life" &&
      LIFE_PERKS_TITLE === "Life perks" &&
      same(titleFor(LIFE_PERKS_PATH), { eyebrow: "You", title: "Life perks" }) &&
      activeSub(LIFE_PERKS_PATH) === "/skills",
    JSON.stringify(paths.map((p) => titleFor(p).title).filter((t) => t !== "Emblems"))
  );
  const skillsPage = readCode("src/app/skills/page.tsx");
  const pathPage = readCode("src/app/skills/[attribute]/page.tsx");
  const lifePage = readCode("src/app/skills/life/page.tsx");
  const screen = readCode("src/components/skills/SkillsScreen.tsx");
  check(
    "the routes stay: /skills, /skills/[attribute] (every slug, generated from ATTRIBUTES) and the static /skills/life keep their pages",
    ["src/app/skills/page.tsx", "src/app/skills/[attribute]/page.tsx", "src/app/skills/life/page.tsx"].every((f) => existsSync(join(ROOT, f))) &&
      /return ATTRIBUTES\.map\(\(attribute\) => \(\{ attribute: attributeSlug\(attribute\) \}\)\);/.test(pathPage) &&
      /if \(!attribute\) notFound\(\);/.test(pathPage)
  );
  check(
    "the pages title themselves the same way (no swap after hydration): /skills's metadata and SkillsScreen's ShellTitle read Emblems, the Life page's LIFE_PERKS_TITLE",
    /export const metadata: Metadata = \{ title: "Emblems" \};/.test(skillsPage) &&
      /<ShellTitle eyebrow="You" title="Emblems" \/>/.test(screen) &&
      /export const metadata: Metadata = \{ title: LIFE_PERKS_TITLE \};/.test(lifePage) &&
      /<ShellTitle eyebrow="You" title=\{LIFE_PERKS_TITLE\} \/>/.test(lifePage) &&
      /aria-label=\{LIFE_PERKS_TITLE\}/.test(lifePage)
  );
  const sheet = readCode("src/components/home/SheetSections.tsx");
  const card = readCode("src/components/home/StatusPanel.tsx");
  check(
    "the five axes are Attributes (the Status card's title) and the 13 are Traits (the radar's heading and its image's name)",
    STATUS_TITLE === "Attributes" &&
      /<SectionHeader title=\{STATUS_TITLE\}/.test(card) &&
      /export const TRAITS_TITLE = "Traits";/.test(sheet) &&
      /<SectionHeader title=\{TRAITS_TITLE\}/.test(sheet) &&
      /aria-label=\{`Trait radar/.test(sheet) &&
      !/title="Attributes"|`Attribute radar/.test(sheet)
  );
  const rules = readCode("src/app/today/rules/page.tsx");
  const curtain = readCode("src/components/celebrate/AscensionCurtain.tsx");
  const receipt = readCode("src/components/today/ReceiptSheet.tsx");
  const chips = readCode("src/components/skills/PathChips.tsx");
  check(
    "the Life tree is Life perks wherever it is named: the rules card, the momentum aside, the capstone's way on, the receipt's S row, the Life chip's name",
    /<Card id="life-tree" title="Life perks"/.test(rules) &&
      /aside="chance, stakes and Life perks · read from the code that pays"/.test(rules) &&
      /label: "See Life perks", href: ev\.facts\.href \?\? "\/skills\/life"/.test(curtain) &&
      /\bS: "Perks",/.test(receipt) &&
      /aria-label=\{LIFE_PERKS_TITLE\}/.test(chips) &&
      /export const LIFE_SKILLS_HREF = LIFE_PERKS_PATH;/.test(chips)
  );
  check("the tour's You step names the crest's Emblems, never skills", /\bemblems\b/.test(YOU_COPY) && !/\bskills?\b/i.test(YOU_COPY) && YOU_COPY.length <= 160, `${YOU_COPY.length}: ${YOU_COPY}`);
  // No string or JSX text under src/ still calls the emblems "Skills", or the tree the Life (skill) tree.
  const STALE = /(["'`>])[^"'`<>\n]*?\b(Skills|Life skills|Life skill tree|the Life tree|See the Life tree)\b[^"'`<>\n]*?(["'`<])/g;
  const caughtCopy = [
    `{ href: "/skills", label: "Skills", icon: "tree" }`,
    `<ShellTitle eyebrow="You" title="Skills" />`,
    `<b>Skills</b>`,
    "const S = `Skills ×${m}`;",
    `return { label: "See the Life tree", href };`,
    `<section aria-label="Life skill tree">`,
    `export const metadata = { title: "Life skills" };`,
  ];
  const cleanCopy = [
    `const activeSkills = progression.activeSkills;`,
    `import { SkillsScreen } from "@/components/skills/SkillsScreen";`,
    `countOf(counts, "unlockedSkills", "emblem", "emblems")`,
    `// the Skills tab's ready dot\nexport const x = "Emblems";`,
    `const t = "Life perks";`,
  ];
  const matches = (src: string) => [...codeOf(src).matchAll(STALE)].length > 0;
  check(
    `the stale-copy matcher catches every old label (${caughtCopy.length} fixtures) and passes identifiers, comments and the new words (${cleanCopy.length})`,
    caughtCopy.every(matches) && !cleanCopy.some(matches),
    [...caughtCopy.filter((s) => !matches(s)), ...cleanCopy.filter(matches)].join(" | ")
  );
  // Re-pinned for P5: "Skills" is the named competencies' word now. It stands only in their own files (the competency
  // files and You › Skills' route), on the profile menu's /you/skills row and in the rules card's line about them;
  // anywhere else it would still be the emblems' old name.
  const lineAt = (src: string, at: number) => src.slice(src.lastIndexOf("\n", at) + 1, (src.indexOf("\n", at) + 1 || src.length + 1) - 1);
  const realSkills = (f: string, src: string, m: RegExpMatchArray) =>
    m[2] === "Skills" &&
    (isTarget(f, ["competenc"]) ||
      f.startsWith("src/app/you/skills/") ||
      (f === "src/components/shell/nav.ts" && /\{ href: "\/you\/skills", label: "Skills", icon: "clock" \}/.test(lineAt(src, m.index ?? 0))) ||
      (f === "src/app/today/rules/page.tsx" && /Skills pay nothing/.test(m[0])));
  const stale = files.flatMap((f) => [...code(f).matchAll(STALE)].filter((m) => !realSkills(f, code(f), m)).map((m) => `${f}: ${m[0].trim().slice(0, 80)}`));
  const allowed = files.flatMap((f) => [...code(f).matchAll(STALE)].filter((m) => realSkills(f, code(f), m)).map(() => f));
  check(
    "no string under src/ calls the emblems 'Skills' or the Life tree by its old name (P5's real skills keep the word in their own files, their menu row and the rules line)",
    stale.length === 0 && allowed.includes("src/components/shell/nav.ts") && allowed.includes("src/app/you/skills/page.tsx"),
    stale.join(" | ")
  );
  // The phone (it has no emblem screen): More's row and the screen are titled Attributes.
  const line = readCode("android/app/src/main/java/com/xtnl/app/core/StatusLine.kt");
  const more = readCode("android/app/src/main/java/com/xtnl/app/ui/more/MoreScreens.kt");
  const phone = readCode("android/app/src/main/java/com/xtnl/app/ui/status/StatusScreen.kt");
  check(
    "the phone's screen is Attributes: StatusLine.TITLE, More's row (StatusLine.TITLE) and the screen's header and loading words",
    /const val TITLE = "Attributes"/.test(line) &&
      /MoreRow\(Glyphs\.Status, StatusLine\.TITLE, StatusLine\.MORE_SUB, onStatus\)/.test(more) &&
      /Text\(StatusLine\.TITLE,/.test(phone) &&
      /StatusLine\.LOADING else StatusLine\.FAILED/.test(phone) &&
      !/"Status"|your status/.test(more + phone + line)
  );
  // Copy only: the data keeps its names. The Prisma enum Attribute stays; P5's table is Competency, never Skill.
  const schema = readCode("prisma/schema.prisma");
  check("copy only: the Prisma enum Attribute stays, and no model is named Skill", /^enum Attribute \{/m.test(schema) && !/^model Skill\s*\{/m.test(schema) && /^model UnlockedSkill \{/m.test(schema));
}

console.log("— the track curve (P3) —");
{
  // Inert: the code value is null and production never reads the override, so every page stays on SQUARE.
  check("TRACK_CURVE_LAUNCH_DAY is null in code (flipped only on the user's go)", TRACK_CURVE_LAUNCH_DAY === null && /export const TRACK_CURVE_LAUNCH_DAY = null as DayKey \| null;/.test(readCode("src/lib/life-economy.ts")));
  check(
    "production ignores XTNL_TRACK_CURVE_LAUNCH_DAY; outside it the override is the rehearsal's",
    trackCurveLaunchDay({ NODE_ENV: "production", XTNL_TRACK_CURVE_LAUNCH_DAY: "2026-10-24" }) === null &&
      trackCurveLaunchDay({ NODE_ENV: "development", XTNL_TRACK_CURVE_LAUNCH_DAY: "2026-10-24" }) === "2026-10-24" &&
      trackCurveOn("2099-12-31", trackCurveLaunchDay({ NODE_ENV: "production", XTNL_TRACK_CURVE_LAUNCH_DAY: "2026-10-24" })) === "SQUARE"
  );

  // Live-style ledgers: life launched 1 Oct (epoch 1 Oct), weeks W40–W44 judged by the read day, every mix of
  // kept / held / missed over them, XP 0..1,500 a track (every 100, and one either side of each level's threshold on
  // both curves). Each is read on SQUARE (the switch off) and on POWER (the override on, flipped that day).
  const LAUNCH: DayKey = "2026-10-01";
  const MARKS = ["kept", "held", "missed"] as const;
  const weekSundays: DayKey[] = ["2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25", "2026-11-01"];
  // The read day and how many weeks are judged by then (each is judged from the Wednesday after its Sunday).
  const reads: [DayKey, number][] = [
    ["2026-10-24", 3],
    ["2026-10-28", 4],
    ["2026-11-04", 5],
  ];
  const XPS = [
    ...new Set([
      ...Array.from({ length: 16 }, (_, k) => 100 * k),
      ...Array.from({ length: 12 }, (_, L) => [xpForLevel(L, "SQUARE"), xpForLevel(L, "POWER")]).flat().flatMap((x) => [x - 1, x]),
    ]),
  ]
    .filter((x) => x >= 0 && x <= 1500)
    .sort((a, b) => a - b);
  const patternOf = (i: number, n: number) => Array.from({ length: n }, (_, w) => MARKS[Math.floor(i / 3 ** w) % 3]);
  const tracks = ["BODY", "DUTY", "CRAFT", "CARE"] as const;
  const ledgerFor = (n: number, i: number, xp: number, midOn: boolean): LifeLedger => ({
    epochDay: LAUNCH,
    xpByDay: tracks.map((track, t) => ({ track, day: "2026-10-03", xp: [xp, xp + 7, 2 * xp, Math.floor(xp / 2)][t] })),
    compositions: [],
    weeks: tracks.flatMap((track, t) =>
      patternOf((i + 9 * t) % 3 ** n, n).map((mark, w) => ({
        track,
        weekKey: weekKeyOf(weekSundays[w]),
        sunday: weekSundays[w],
        kept: mark === "kept",
        detail: mark,
        ...(mark === "held" ? { held: true } : {}),
      }))
    ),
    mints: midOn ? [{ key: "mp:GOAL:live-mid", track: "CRAFT", templateId: null, day: "2026-10-22", qty: 6, reason: "GOAL_MID", why: null }] : [],
  });
  const lifeSnap = (v: ReturnType<typeof lifeTracksView>): ProgressData => ({
    parts: ["tracks", "levels"],
    tracks: { levels: { ...v.levels }, curve: v.curve },
    levels: { fields: [{ id: "f", name: "Statistics", level: 9 }], domains: [], ultimates: 0, tracks: { ...v.levels }, trackCurve: v.curve },
  });
  let ledgers = 0;
  let rose = 0;
  let maxCap = 0;
  let maxCapWithMid = 0;
  const drops: string[] = [];
  const overCap: string[] = [];
  const rowsFell: string[] = [];
  const moments: string[] = [];
  const offCurve: string[] = [];
  for (const [day, n] of reads)
    for (let i = 0; i < 3 ** n; i++)
      for (const xp of XPS)
        for (const midOn of [false, true]) {
          if (midOn && xp % 100 !== 0) continue;
          const ledger = ledgerFor(n, i, xp, midOn);
          const sq = lifeTracksView(ledger, day, LAUNCH, "SQUARE");
          const pw = lifeTracksView(ledger, day, LAUNCH, "POWER");
          ledgers += 1;
          const where = `${day} pattern ${i} xp ${xp}${midOn ? " +Mid" : ""}`;
          if (sq.curve !== "SQUARE" || pw.curve !== "POWER" || pw.rows.some((r) => r.nextXp !== xpForLevel(r.level + 1, "POWER"))) offCurve.push(where);
          for (const t of tracks) {
            const a = sq.rows.find((r) => r.track === t)!;
            const b = pw.rows.find((r) => r.track === t)!;
            if (pw.levels[t] < sq.levels[t]) drops.push(`${where} ${t} ${sq.levels[t]} → ${pw.levels[t]}`);
            if (pw.levels[t] > sq.levels[t]) rose += 1;
            if (b.level > b.cap || b.cap !== a.cap) overCap.push(`${where} ${t} level ${b.level} cap ${b.cap} (SQUARE cap ${a.cap})`);
            if (midOn) maxCapWithMid = Math.max(maxCapWithMid, b.cap);
            else maxCap = Math.max(maxCap, b.cap);
          }
          for (const c of sq.contributions) {
            const p = pw.contributions.find((x) => x.fieldName === c.fieldName);
            if (!p || p.level < c.level - 1e-9) rowsFell.push(`${where} ${c.fieldName}`);
          }
          const played = diffProgress(lifeSnap(sq), lifeSnap(pw));
          if (played.length > 0) moments.push(`${where}: ${played.map((d) => d.dedupeKey).join(",")}`);
        }
  const few = (xs: string[]) => xs.slice(0, 3).join("; ");
  check(`the live-style fixtures: ${ledgers.toLocaleString("en-GB")} ledgers read on both curves, ${rose.toLocaleString("en-GB")} track levels rise on the flip`, ledgers > 10000 && rose > 0 && offCurve.length === 0, few(offCurve));
  check("on the flip every level only rises (POWER ≥ SQUARE on every track of every fixture)", drops.length === 0, few(drops));
  check(
    `every level stays at or under its kept-week cap, the same on both curves: at most ${maxCap} with no paid goal (≤ 3), ${maxCapWithMid} with a paid Mid (≤ 4)`,
    overCap.length === 0 && maxCap <= 3 && maxCapWithMid <= 4,
    few(overCap)
  );
  check("the life attribute rows never fall on the flip (a trait only gains)", rowsFell.length === 0, few(rowsFell));
  check("no celebration plays on the flip: a diff of the SQUARE read against the POWER read is empty for every fixture", moments.length === 0, few(moments));
  // One account as it might stand today, printed: three weeks judged, Body and Craft kept every week.
  const sample = ledgerFor(3, 0, 420, false);
  const sq = lifeTracksView(sample, "2026-10-24", LAUNCH, "SQUARE");
  const pw = lifeTracksView(sample, "2026-10-24", LAUNCH, "POWER");
  console.log(`     e.g. ${tracks.map((t) => `${TRACK_NAME[t]} ${sq.rows.find((r) => r.track === t)!.xp} XP L${sq.levels[t]} → L${pw.levels[t]} (cap ${pw.rows.find((r) => r.track === t)!.cap})`).join(" · ")}`);
  check(
    "…and its lines follow the curve: SQUARE's own words with the switch off, POWER's table figures with it on",
    sq.rows.every((r) => !r.atCap && r.xp > 0 ? r.line.includes(`/ ${xpForLevel(r.level + 1).toLocaleString("en-GB")} XP`) : true) &&
      pw.rows.every((r) => !r.atCap && r.xp > 0 ? r.line.includes(`/ ${xpForLevel(r.level + 1, "POWER").toLocaleString("en-GB")} XP`) : true) &&
      sq.levels.BODY < pw.levels.BODY,
    pw.rows.map((r) => r.line).join(" | ")
  );

  // The curve reaches level readers only: no pay, judge, mint or settle module names it.
  const CURVE_WORDS = /\b(trackCurveOn|trackCurveLaunchDay|TrackCurve|TRACK_CURVE_[A-Z_]+|PRE_CURVE_TRACK_CURVE)\b|\.curve\b|\btrackCurve\b/;
  const READERS = new Set([
    "src/lib/life-economy.ts",
    "src/lib/life-tracks.ts",
    "src/lib/celebration-detect.ts",
    "src/lib/snapshot.ts",
    "src/lib/progress-rate.ts",
    "src/lib/audit-decay-server.ts",
    "src/app/you/_lib/sheet.ts",
    "src/app/you/_lib/stats.ts",
    "src/app/today/rules/page.tsx",
    "src/app/dev/style/art/you/page.tsx",
  ]);
  const naming = files.filter((f) => CURVE_WORDS.test(code(f)));
  const strays = naming.filter((f) => !READERS.has(f));
  check(
    "the curve is named only by level readers (life-economy, life-tracks, the celebration diff and its snapshot, the then/now readers, the rules card, the You fixtures)",
    strays.length === 0 && naming.length >= 8,
    strays.length ? `also in ${strays.join(", ")}` : `${naming.length} files`
  );
  const writersNaming = naming.filter((f) => writers.has(f) || LEDGER_WRITES.test(code(f)));
  check("no file that names the curve writes the ledger or is a writer module", writersNaming.length === 0, writersNaming.join(", "));
  // Every src caller of the level maths passes a curve, so no reader silently keeps SQUARE after the flip.
  const LEVEL_CALL = /\b(pointsLevel|xpForLevel|trackLevel)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
  const defaulted: string[] = [];
  for (const f of files) {
    if (f === "src/lib/life-economy.ts") continue;
    for (const m of code(f).matchAll(LEVEL_CALL)) {
      const args = m[2].split(",").filter((a) => a.trim() !== "").length;
      if (args < (m[1] === "trackLevel" ? 4 : 2)) defaulted.push(`${f}: ${m[0].slice(0, 60)}`);
    }
  }
  check("every src caller of pointsLevel, xpForLevel and trackLevel passes its curve (none rides on the SQUARE default)", defaulted.length === 0, defaulted.join("; "));
  const rules = readCode("src/app/today/rules/page.tsx");
  check(
    "the rules card's formula follows the curve in force today: trackCurveOn(today), the POWER formula from TRACK_CURVE_BASE and TRACK_CURVE_EXPONENT, the √ formula otherwise",
    /const curve = trackCurveOn\(today\);/.test(rules) &&
      /\{TRACK_CURVE_BASE\} · L\^\{TRACK_CURVE_EXPONENT\}/.test(rules) &&
      /level = min\(⌊√XP \/ \{TRACK_LEVEL_STEP\}⌋, \{TRACK_DEPTH_GRACE\} \+ ⌊depth⌋\)/.test(rules) &&
      /xpForLevel\(SAMPLE_LEVEL, curve\)/.test(rules)
  );
  check(
    "the then/now readers read both ends on one curve: the ghost and Stats on the view's, the progress rate and the audit on today's",
    /lifeRowsOn\(userId, addDays\(today, -7\), life\.curve\)/.test(readCode("src/app/you/_lib/sheet.ts")) &&
      /lifeContributionsAt\(ledger, day, curve\)/.test(readCode("src/app/you/_lib/sheet.ts")) &&
      /loadLifeStats\(userId, life\.curve\)/.test(readCode("src/app/you/_lib/stats.ts")) &&
      /levelSeries\(ledger, STATS_WEEKS, curve\)/.test(readCode("src/app/you/_lib/stats.ts")) &&
      /lifeContributionsAt\(life, keyOfDateColumn\(oldest\), curve\)/.test(readCode("src/lib/progress-rate.ts")) &&
      /lifeContributionsAt\(life, thenDay, curve\)/.test(readCode("src/lib/audit-decay-server.ts"))
  );
  check("life-economy still imports types only (pure; the curve is a constant table and one gate)", importsOf(readCode("src/lib/life-economy.ts"), "src/lib/life-economy.ts").every((i) => i.names.length === 0));

  // The lead's rehearsal on the local copy of the live account (the plan's acceptance): read only, local only, never in a chain.
  const rehearse = readCode("scripts/track-curve-rehearse.ts");
  const main = rehearse.slice(rehearse.indexOf("async function main("));
  const statics = [...rehearse.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)";|^import\s+"([^"]+)";/gm)].map((m) => (m[1] ? `type ${m[2]}` : (m[2] ?? m[3])));
  check(
    "track-curve-rehearse: its only static imports are _no-model and a type; Prisma and the cores load after guard()",
    statics.join() === "./_no-model,type ../src/lib/life-day" && main.indexOf("guard();") >= 0 && main.indexOf("guard();") < main.indexOf("await loadModules()"),
    statics.join()
  );
  check(
    "track-curve-rehearse: refuses a supabase or non-local DATABASE_URL / DIRECT_URL, NODE_ENV=production and Vercel",
    /if \(\/supabase\/i\.test\(raw\)\)/.test(rehearse) && /LOCAL_HOSTS = new Set\(\["localhost", "127\.0\.0\.1", "\[::1\]", "::1"\]\)/.test(rehearse) && /NODE_ENV === "production"/.test(rehearse) && /process\.env\.VERCEL \|\| process\.env\.VERCEL_ENV/.test(rehearse)
  );
  check(
    "track-curve-rehearse: reads only (no create, update, upsert, delete or raw write; never XTNL_LIFE_JUDGE), and no check chain runs it",
    !/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|\$executeRaw|XTNL_LIFE_JUDGE\s*=/.test(rehearse) && !LEDGER_WRITES.test(rehearse) && !/track-curve-rehearse/.test(readFileSync(join(ROOT, "package.json"), "utf8"))
  );
}

async function avatarChecks(): Promise<void> {
  console.log("— the avatar targets (P4) —");
  // Blueprint 1.2 (D3: a new AvatarTarget table, readings in RoadmapReading; D4: the numbers are entered after ship).
  const TODAY: DayKey = "2026-10-23";
  const AT = new Date("2026-10-23T01:00:00.000Z");
  const WRITES_ON = { XTNL_LIFE_JUDGE: "1" };
  const WRITES_OFF = { NODE_ENV: "development" };

  // The migration: one additive table, timestamptz, the CHECKs and the one-live-row index; nothing else touched.
  const migration = readFileSync(join(ROOT, "prisma/migrations/20261229000000_avatar_targets/migration.sql"), "utf8");
  const sql = migration.replace(/--.*$/gm, "");
  check(
    "the migration 20261229000000_avatar_targets is additive: BEGIN/COMMIT, one CREATE TABLE AvatarTarget, its CHECKs and indexes; no DROP, no other table altered, no row written",
    /^BEGIN;/m.test(sql) &&
      /COMMIT;\s*$/.test(sql) &&
      (sql.match(/CREATE TABLE/g) ?? []).length === 1 &&
      /CREATE TABLE "public"\."AvatarTarget"/.test(sql) &&
      !/\bDROP\b|\bTRUNCATE\b|\bUPDATE\b|\bDELETE\b|\bINSERT\b|RENAME/i.test(sql) &&
      [...sql.matchAll(/ALTER TABLE "public"\."(\w+)"/g)].every((m) => m[1] === "AvatarTarget") &&
      [...sql.matchAll(/ON "public"\."(\w+)"/g)].every((m) => m[1] === "AvatarTarget")
  );
  check(
    "…its timestamps are timestamptz, its days are dates, and one live row a lineage (partial unique WHERE archivedAt IS NULL)",
    /"archivedAt" TIMESTAMPTZ\(3\),/.test(sql) &&
      /"createdAt" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP,/.test(sql) &&
      /"updatedAt" TIMESTAMPTZ\(3\) NOT NULL,/.test(sql) &&
      /"baselineDay" DATE,/.test(sql) &&
      /"targetDay" DATE,/.test(sql) &&
      !/TIMESTAMP\(3\)/.test(sql) &&
      /CREATE UNIQUE INDEX "AvatarTarget_lineageId_live_key" ON "public"\."AvatarTarget"\("lineageId"\) WHERE "archivedAt" IS NULL;/.test(sql)
  );
  const metricCheck = /CHECK \("metric" IN \(([^)]*)\)\)/.exec(sql)?.[1].replace(/['\s]/g, "").split(",") ?? [];
  const attrCheck = /CHECK \("attribute" IN \(([^)]*)\)\)/.exec(sql)?.[1].replace(/['\s]/g, "").split(",") ?? [];
  check(
    "the CHECKs are the catalog's: the six attributes (the five and Capital) and the five stored metrics; WEIGHT is never a row (WeightGoal is its one copy)",
    JSON.stringify(attrCheck) === JSON.stringify(AVATAR_ATTRIBUTES) && JSON.stringify(metricCheck) === JSON.stringify(STORED_METRICS) && !metricCheck.includes("WEIGHT"),
    `${attrCheck.join(",")} / ${metricCheck.join(",")}`
  );
  const schema = readCode("prisma/schema.prisma");
  const model = /^model AvatarTarget \{([\s\S]*?)^\}/m.exec(schema)?.[1] ?? "";
  const cols = [...model.matchAll(/^\s+(\w+)\s+\S/gm)].map((m) => m[1]).filter((c) => !c.startsWith("@@"));
  const sqlCols = [...sql.matchAll(/^\s+"(\w+)" [A-Z]/gm)].map((m) => m[1]);
  check(
    "schema.prisma's AvatarTarget has the migration's columns, in its order, with timestamptz and dates",
    JSON.stringify(cols) === JSON.stringify(sqlCols) &&
      /archivedAt\s+DateTime\?\s+@db\.Timestamptz\(3\)/.test(model) &&
      /baselineDay\s+DateTime\?\s+@db\.Date/.test(model) &&
      /targetDay\s+DateTime\?\s+@db\.Date/.test(model),
    `${cols.join(",")} vs ${sqlCols.join(",")}`
  );

  // The catalog: each metric's attributes and source; the key.
  check(
    "the metric catalog: Weight and effort minutes for Vitality, a Field's level for Intellect, hours for Craft, Duty and Care, revenue for Capital, your own measure for any",
    JSON.stringify(Object.fromEntries(AVATAR_ATTRIBUTES.map((a) => [a, metricsFor(a)]))) ===
      JSON.stringify({
        VITALITY: ["EFFORT_MINUTES", "MANUAL"],
        INTELLECT: ["FIELD_LEVEL", "MANUAL"],
        CRAFT: ["TRACK_HOURS", "MANUAL"],
        DUTY: ["TRACK_HOURS", "MANUAL"],
        CARE: ["TRACK_HOURS", "MANUAL"],
        CAPITAL: ["REVENUE_MONTH", "MANUAL"],
      }) &&
      AVATAR_METRICS.WEIGHT.attributes.join() === "VITALITY" &&
      AVATAR_METRICS.MANUAL.source === "SELF" &&
      STORED_METRICS.filter((m) => m !== "MANUAL").every((m) => AVATAR_METRICS[m].source === "COMPUTED")
  );
  const key = avatarKey("lin-1");
  check(
    "the readings' key is 'AVATAR|a:<lineageId>' and parses back; any other key is not an avatar's",
    key === "AVATAR|a:lin-1" && parseAvatarKey(key) === "lin-1" && parseAvatarKey(proficiencyKey("r1")) === null && parseAvatarKey(checkpointLogKey("i1", "n1")) === null && parseAvatarKey("AVATAR|a:") === null
  );

  // An AVATAR| row is ignored by every existing RoadmapReading reader: each filters by a key it built.
  const avatarRows = [
    { measureKey: avatarKey("lin-1"), source: "COMPUTED" },
    { measureKey: avatarKey("lin-2"), source: "SELF" },
  ];
  check(
    "an avatar key is no measure key: parseMeasureKey reads none, it is outside the SELF| space and the PROFICIENCY| rows, and momentum's checkpoint-log pattern misses it",
    avatarRows.every(
      (r) => parseMeasureKey(r.measureKey) === null && !r.measureKey.startsWith(SELF_KEY_PREFIX) && !r.measureKey.startsWith("PROFICIENCY|") && !/^SELF\|CHECKPOINT\|i:([^|]+)\|n:/.test(r.measureKey) && !r.measureKey.startsWith("SELF|CHECKPOINT|")
    )
  );
  // The readers, file by file: every roadmapReading read and every raw FROM "RoadmapReading", each with the key filter it uses.
  const READERS: Record<string, { reads: number; filters: RegExp[] }> = {
    // readDayFacts, readPlanFacts, roadmapPay: SELF rows under the checkpoint-log prefix.
    "src/lib/momentum-server.ts": { reads: 3, filters: [/source: "SELF", measureKey: \{ startsWith: CHECKPOINT_LOG_PREFIX \}/] },
    // The store's readings (a measure's keys, COMPUTED) and selfLogs (checkpoint prefixes, SELF); the PROFICIENCY audit.
    "src/lib/roadmap-server.ts": { reads: 3, filters: [/measureKey: \{ in: \[\.\.\.keys\] \}, source: "COMPUTED"/, /source: "SELF", OR: prefixes\.map\(\(p\) => \(\{ measureKey: \{ startsWith: p \} \}\)\)/, /WHERE x\."measureKey" LIKE 'PROFICIENCY\|%'/] },
    // The context's latest per key (IN its keys), the clip and late reads (a measure's key), the standard's logs, the
    // Proficiency pair (proficiencyKey), the goal series (IN a goal's PAYS measures' keys).
    "src/lib/roadmap-readings.ts": {
      reads: 7,
      filters: [/"measureKey" IN \(\$\{Prisma\.join\(Array\.from\(keys\)\)\}\)/, /measureKey: w\.key/, /measureKey: \{ startsWith: checkpointLogPrefix\(standard\.item\.lineageId\) \}/, /const key = proficiencyKey\(roadmapId\)|proficiencyKey\(roadmapId\)/, /r\."measureKey" IN \(\s*SELECT me\."measureKey" FROM "RoadmapMeasure"/],
    },
    // A quest's reads by its measure's key, and a checkpoint's log days by its prefix.
    "src/lib/roadmap-quests-server.ts": { reads: 4, filters: [/where: \{ userId, measureKey, day: \{ lt: dateColumn\(day\) \} \}/, /userId_measureKey_day: \{ userId, measureKey, day: dateColumn\(day\) \}/, /where: \{ userId, measureKey, day: \{ gte: dateColumn\(from\), lte: dateColumn\(to\) \} \}/, /measureKey: \{ startsWith: prefix \}/] },
  };
  const READ_CALL = /\broadmapReading\s*\.\s*(findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|count|groupBy|aggregate)\b|\bFROM\s+"RoadmapReading"/g;
  const readerOff: string[] = [];
  for (const f of files) {
    if (isTarget(f, ["avatar"])) continue;
    const n = [...code(f).matchAll(READ_CALL)].length;
    const want = READERS[f];
    if (!want) {
      if (n > 0) readerOff.push(`${f}: ${n} unlisted read(s)`);
      continue;
    }
    if (n !== want.reads) readerOff.push(`${f}: ${n} reads, ${want.reads} listed`);
    for (const re of want.filters) if (!re.test(code(f))) readerOff.push(`${f}: no ${re.source.slice(0, 50)}`);
  }
  check(
    `every RoadmapReading reader outside the avatar is listed, each with the key filter it reads by (${Object.values(READERS).reduce((a, r) => a + r.reads, 0)} reads in ${Object.keys(READERS).length} files)`,
    readerOff.length === 0,
    readerOff.join("; ")
  );
  // A fixture through each filter: the keys each reader can be handed are a measure's (built by the roadmap's own
  // builders), a checkpoint log's prefix, or PROFICIENCY's; an AVATAR row matches none of them.
  const measureKeys = [cardsAtLevelKey(["d1", "d2"], 4, "r"), practiceKeptKey(["t1"], "2026-10-05"), proficiencyKey("r1")];
  const prefixes = [checkpointLogPrefix("i1"), "SELF|CHECKPOINT|"];
  const fixture = [...avatarRows, { measureKey: measureKeys[0], source: "COMPUTED" }, { measureKey: checkpointLogKey("i1", "n1"), source: "SELF" }, { measureKey: proficiencyKey("r1"), source: "COMPUTED" }];
  const passes = {
    "IN a measure's keys": fixture.filter((r) => measureKeys.includes(r.measureKey)),
    "a given measure key": fixture.filter((r) => measureKeys.some((k) => k === r.measureKey)),
    "SELF under a checkpoint prefix": fixture.filter((r) => r.source === "SELF" && prefixes.some((p) => r.measureKey.startsWith(p))),
    "LIKE 'PROFICIENCY|%'": fixture.filter((r) => r.measureKey.startsWith("PROFICIENCY|")),
  };
  const leaked = Object.entries(passes).flatMap(([name, rows]) => rows.filter((r) => parseAvatarKey(r.measureKey) !== null).map(() => name));
  check(
    "…and through each filter a mixed fixture keeps its roadmap rows and drops both AVATAR rows (COMPUTED and SELF)",
    leaked.length === 0 && Object.values(passes).every((rows) => rows.length > 0),
    leaked.join(", ")
  );
  const writersOfKey = files.filter((f) => /AVATAR\|/.test(code(f)));
  check("only avatar.ts spells the AVATAR| key space (every other file reaches it through avatarKey or AVATAR_KEY_PREFIX)", JSON.stringify(writersOfKey) === JSON.stringify(["src/lib/avatar.ts"]), writersOfKey.join(", "));
  const reset = readCode("src/app/actions/reset.ts");
  check(
    "the life reset keeps the avatar's readings (a record, like a weigh-in): its RoadmapReading delete leaves AVATAR_KEY_PREFIX, and nothing resets AvatarTarget",
    /prisma\.roadmapReading\.deleteMany\(\{ where: \{ userId, NOT: \{ measureKey: \{ startsWith: AVATAR_KEY_PREFIX \} \} \} \}\)/.test(reset) && !/avatarTarget/.test(reset)
  );

  // The way, the pace and the words.
  check(
    "share of the way: from the baseline toward the target, clamped to 0..1, either direction; null without a baseline or a value",
    Math.abs((shareOfWay(85, 82.4, 75, "DOWN") ?? -1) - 0.26) < 1e-9 &&
      Math.abs((shareOfWay(8, 9.4, 12, "UP") ?? -1) - 0.35) < 1e-9 &&
      shareOfWay(8, 7, 12, "UP") === 0 &&
      shareOfWay(8, 13, 12, "UP") === 1 &&
      shareOfWay(null, 9, 12, "UP") === null &&
      shareOfWay(8, null, 12, "UP") === null &&
      reachedOf(12, 12, "UP") &&
      reachedOf(74.9, 75, "DOWN") &&
      !reachedOf(75.1, 75, "DOWN")
  );
  const T = { baseline: 8, baselineDay: "2026-10-01", target: 12, targetDay: "2026-12-30", direction: "UP" as const };
  check(
    "the pace: reached; on pace when the share is at least the days gone; behind pace when not; past its day after it; none without a target day",
    paceOf(T, 12, TODAY) === "REACHED" &&
      paceOf(T, 9.4, "2026-10-31") === "ON_PACE" &&
      paceOf(T, 9.0, "2026-10-31") === "BEHIND" &&
      paceOf(T, 9.0, "2026-12-31") === "PAST" &&
      paceOf({ ...T, targetDay: null }, 9, TODAY) === null &&
      paceOf(T, null, TODAY) === null &&
      PACE_WORDS.BEHIND === "behind pace"
  );
  const weight = { unit: "kg" as const, trendKg: 82.4, progress: (87 - 82.4) / 12, goal: { unit: "kg" as const, targetKg: 75, targetDay: "2027-02-27", startKg: 87, startDay: "2026-10-01" } };
  const wt = weightTargetOf(weight, TODAY);
  check(
    "the plan's line: 'Weight 82.4 → 75 kg · 38% of the way · on pace' (Train's own goal and trend: WeightGoal, no second copy)",
    wt?.line === "Weight 82.4 → 75 kg · 38% of the way · on pace" && wt.id === "weight" && wt.source === "WEIGHT" && !wt.editable && wt.share === weight.progress,
    wt?.line
  );
  check("no weight target set on Train: no weight target here", weightTargetOf({ ...weight, goal: { ...weight.goal, targetKg: null } }, TODAY) === null && weightTargetOf(null, TODAY) === null);
  check(
    "the trend within Train's REACHED_WITHIN_KG of the target is reached, as Train says it",
    weightTargetOf({ ...weight, trendKg: 75.1, progress: 0.99 }, TODAY)?.pace === "REACHED" && weightTargetOf({ ...weight, trendKg: 75.1, progress: 0.99 }, TODAY)?.line === "Weight 75.1 → 75 kg · reached"
  );

  // The measured metrics read the app's own figures.
  const lastWeek = lastWeekOf(TODAY);
  const row = (over: Partial<WeekTaskRow>): WeekTaskRow => ({
    id: "e0",
    source: "TASK",
    dedupeKey: null,
    day: "2026-10-14",
    track: "BODY",
    templateId: "t",
    rawXp: 5,
    receipt: { v: "life-1", factors: [{ key: "B", label: "B", value: 20 }], minutes: 30, raw: 5, kneeBefore: 0, xp: 5, track: "BODY" },
    category: "EXERCISE",
    ...over,
  });
  const craft = (id: string, minutes: number, over: Partial<WeekTaskRow> = {}) =>
    row({ id, track: "CRAFT", category: "WORK", receipt: { v: "life-1", factors: [{ key: "B", label: "B", value: 10 }], minutes, raw: 4, kneeBefore: 0, xp: 4, track: "CRAFT" }, ...over });
  const WEEK_ROWS: WeekTaskRow[] = [
    row({ id: "e1" }),
    row({ id: "e2", receipt: { v: "life-1", factors: [{ key: "B", label: "B", value: 10 }], minutes: 20, raw: 3, kneeBefore: 0, xp: 3, track: "BODY" } }),
    row({ id: "u2", source: "UNDO", dedupeKey: "undo:e2", rawXp: -3, receipt: null }),
    craft("c1", 90),
    craft("c2", 60, { day: "2026-10-18" }),
    craft("c3", 45),
    row({ id: "u3", source: "UNDO", dedupeKey: "undo:c3", track: "CRAFT", rawXp: -4, receipt: null, category: "WORK" }),
    craft("c4", 600, { day: "2026-10-20" }),
  ];
  check(
    "effort minutes are the week judge's own (life-weeks effortMinutesOf: trackWeekOf over planWeeks' live rows): an undone tick counts nothing",
    effortMinutesOf(WEEK_ROWS, lastWeek.from, lastWeek.to) === Math.round(30 * effortWeightOfB(20)) &&
      lastWeek.from === "2026-10-12" &&
      lastWeek.to === "2026-10-18" &&
      /export function effortMinutesOf\(rows: readonly WeekTaskRow\[\], from: DayKey, to: DayKey\): number \{\s*return trackWeekOf\(liveWeekRows\(rows\), "BODY", from, to\)\.effortMinutes;\s*\}/.test(readCode("src/lib/life-weeks.ts")),
    String(effortMinutesOf(WEEK_ROWS, lastWeek.from, lastWeek.to))
  );
  const weeksSrc = readCode("src/lib/life-weeks.ts");
  check(
    "liveWeekRows is planWeeks' own filter (the same reversal and walk rules, word for word)",
    /for \(const r of state\.rows\) if \(isReversalRow\(r\)\) undone\.add\(r\.dedupeKey!\.slice\(5\)\);\s*const live = state\.rows\.filter\(\(r\) => \(r\.source === "TASK" \|\| isWalkRow\(r\)\) && !undone\.has\(r\.id\)\);/.test(weeksSrc) &&
      /for \(const r of rows\) if \(isReversalRow\(r\)\) undone\.add\(r\.dedupeKey!\.slice\(5\)\);\s*return rows\.filter\(\(r\) => \(r\.source === "TASK" \|\| isWalkRow\(r\)\) && !undone\.has\(r\.id\)\);/.test(weeksSrc)
  );
  const hours = trackMinutesOf(liveWeekRows(WEEK_ROWS), lastWeek.from, lastWeek.to);
  check("hours a week: last life week's live task minutes on the track (an undone tick and next week's taken off)", hours.CRAFT === 150 && hours.BODY === 30, JSON.stringify(hours));

  const target = (over: Partial<AvatarTargetRow>): AvatarTargetRow => ({
    id: "t1",
    lineageId: "t1",
    attribute: "INTELLECT",
    label: "Statistics level",
    metric: "FIELD_LEVEL",
    scope: { fieldId: "f-stats" },
    unit: "level",
    direction: "UP",
    baselineValue: 8,
    baselineDay: "2026-10-01",
    targetValue: 12,
    targetDay: "2026-12-30",
    sortOrder: 0,
    createdAt: "2026-10-01T00:00:00.000Z",
    archivedAt: null,
    ...over,
  });
  const facts: AvatarFacts = {
    fields: [{ id: "f-stats", name: "Statistics", level: 9.4 }],
    effortMinutes: effortMinutesOf(WEEK_ROWS, lastWeek.from, lastWeek.to),
    trackMinutes: hours,
    revenueCents: capitalReadingOf([{ stage: "WON", valueCents: 1_240_000, closedAt: "2026-10-12T02:00:00.000Z" }, { stage: "LOST", valueCents: 9_000_000, closedAt: "2026-10-13T02:00:00.000Z" }], "2026-10").wonCents,
    manual: { m1: { day: "2026-10-20", value: 6 } },
    weight,
  };
  const ROWS: AvatarTargetRow[] = [
    target({}),
    target({ id: "e1", lineageId: "e1", attribute: "VITALITY", label: "Effort", metric: "EFFORT_MINUTES", scope: {}, unit: "min", baselineValue: 40, targetValue: 150, targetDay: null }),
    target({ id: "h1", lineageId: "h1", attribute: "CRAFT", label: "Deep work", metric: "TRACK_HOURS", scope: {}, unit: "h", baselineValue: 1, targetValue: 10, targetDay: null }),
    target({ id: "m1", lineageId: "m1", attribute: "CARE", label: "Calls home", metric: "MANUAL", scope: {}, unit: "", baselineValue: 2, targetValue: 10, targetDay: null }),
    target({ id: "r1", lineageId: "r1", attribute: "CAPITAL", label: "Revenue", metric: "REVENUE_MONTH", scope: {}, unit: "AUD", baselineValue: 8200, targetValue: 20000, targetDay: null }),
    target({ id: "gone", lineageId: "gone", attribute: "INTELLECT", label: "Chemistry level", scope: { fieldId: "f-deleted" }, baselineValue: null, baselineDay: null, createdAt: "2026-10-02T00:00:00.000Z" }),
    target({ id: "old", lineageId: "t1", label: "Stats (old)", archivedAt: "2026-10-10T00:00:00.000Z" }),
  ];
  const views = avatarTargetsOf(ROWS, facts, TODAY);
  check(
    "the card's targets: Train's weight first under Vitality, then each live row in the panel's order; an archived version is history, never shown",
    JSON.stringify(views.map((v) => v.id)) === JSON.stringify(["weight", "e1", "t1", "gone", "h1", "m1", "r1"]),
    views.map((v) => v.id).join(",")
  );
  const lineOf = (id: string) => views.find((v) => v.id === id)?.line;
  check(
    // Re-pinned (P4 review): an hours target's value is task estimates, so its line marks it "≈" (as a skill's hours line).
    "each reads its own figure: a Field's level now, last week's effort minutes and hours (marked ≈: task estimates), this month's WON revenue (a lost deal never counts), the latest log of your own",
    lineOf("t1") === "Statistics level 9.4 → 12 · 35% of the way · on pace" &&
      lineOf("e1") === `Effort ${Math.round(30 * effortWeightOfB(20))} → 150 min a week · ${Math.floor(((Math.round(30 * effortWeightOfB(20)) - 40) / 110) * 100)}% of the way` &&
      lineOf("h1") === "Deep work ≈ 2.5 → 10 h a week · 16% of the way" &&
      lineOf("m1") === "Calls home 6 → 10 · 50% of the way · self-reported" &&
      lineOf("r1") === "Revenue $12,400 → $20,000 a month · 35% of the way",
    views.map((v) => v.line).join(" | ")
  );
  check(
    "a target with nothing to read (its Field gone, or a fact that failed) says 'no reading yet', never a 0",
    lineOf("gone") === "Chemistry level → 12 · no reading yet" &&
      avatarTargetsOf([ROWS[1]], NO_FACTS, TODAY)[0].line === "Effort → 150 min a week · no reading yet" &&
      avatarTargetsOf([ROWS[3]], NO_FACTS, TODAY)[0].line === "Calls home → 10 · no reading yet · self-reported"
  );
  check(
    "MANUAL readings are SELF and say so; measured ones are COMPUTED; the weight's are Train's",
    views.find((v) => v.id === "m1")?.source === "SELF" && ["t1", "e1", "h1", "r1"].every((id) => views.find((v) => v.id === id)?.source === "COMPUTED") && views[0].source === "WEIGHT"
  );
  const readings = computedReadingsOf(views, TODAY);
  check(
    "the cron's readings: one COMPUTED reading a measured target with a value, keyed by its lineage; never a MANUAL log's, never the weight's, never one with no value",
    JSON.stringify(readings.map((r) => [r.measureKey, r.day, r.value])) ===
      JSON.stringify([
        ["AVATAR|a:e1", TODAY, Math.round(30 * effortWeightOfB(20))],
        ["AVATAR|a:t1", TODAY, 9.4],
        ["AVATAR|a:h1", TODAY, 2.5],
        ["AVATAR|a:r1", TODAY, 12400],
      ]),
    JSON.stringify(readings)
  );

  // What an add and an edit write.
  const ctx = { today: TODAY, fields: [{ id: "f-stats", name: "Statistics" }], current: 9.4 };
  const add = (over: Partial<AvatarTargetInput>) => cleanTargetInput({ attribute: "INTELLECT", metric: "FIELD_LEVEL", fieldId: "f-stats", target: 12, ...over }, ctx);
  const ok = add({});
  check(
    "an add: a Field's level is named after its Field and starts from its level now (as Train's target starts from the trend), today's baseline day, UP",
    ok.ok && ok.value.label === "Statistics level" && ok.value.baselineValue === 9.4 && ok.value.baselineDay === TODAY && ok.value.direction === "UP" && JSON.stringify(ok.value.scope) === '{"fieldId":"f-stats"}' && ok.value.unit === "level",
    JSON.stringify(ok)
  );
  const err = (r: { ok: boolean; error?: string }) => (r.ok ? "ok" : (r as { error: string }).error);
  check(
    "…and refuses the weight (Train sets it), a measure the attribute doesn't offer, no Field, a target where you are, a past day, a bound broken, a long unit",
    err(add({ attribute: "VITALITY", metric: "WEIGHT" })) === "Weight's target is set on Body › This week." &&
      /^Pick what Intellect is measured by\./.test(err(add({ metric: "REVENUE_MONTH" }))) &&
      err(add({ fieldId: "nope" })) === "Pick a Field." &&
      err(add({ target: 9.4 })) === "That target is where you are already." &&
      err(add({ targetDay: "2026-10-23" })) === "Pick a day after today." &&
      /^A target between 0 and 100,/.test(err(add({ target: 101 }))) &&
      /^A unit of at most 12/.test(err(cleanTargetInput({ attribute: "CARE", metric: "MANUAL", label: "Calls", unit: "a very long unit word", target: 3 }, ctx)))
  );
  // The P4 review: a Field has no ceiling of its own (below twice its best Domain, whose level has none either), and
  // field-tier's Formidable and Monumental bands start at 16 and 32, so a Field's next tier is always a target it can take.
  const monumental = FIELD_TIERS[FIELD_TIERS.length - 1].from;
  const tierTargets = FIELD_TIERS.map((t) => t.from).filter((from) => from > 9.4).map((from) => add({ target: from }));
  check(
    `a Field's level target runs 0 to ${FIELD_LEVEL_MAX}, past every Field tier (Monumental from ${monumental}): each tier's start is accepted (a Field at 20.5 can aim at 32), ${FIELD_LEVEL_MAX + 1} is refused`,
    FIELD_LEVEL_MAX > monumental &&
      AVATAR_METRICS.FIELD_LEVEL.max === FIELD_LEVEL_MAX &&
      tierTargets.length >= 2 &&
      tierTargets.every((r) => r.ok) &&
      add({ target: 32 }).ok &&
      cleanTargetInput({ attribute: "INTELLECT", metric: "FIELD_LEVEL", fieldId: "f-stats", target: 32 }, { ...ctx, current: 20.5 }).ok &&
      !add({ target: FIELD_LEVEL_MAX + 1 }).ok,
    tierTargets.map(err).join(" | ")
  );
  // The P4 review: the app names no "Train › Weight"; the weight's target is on Body's weight card, Body › This week (nav.ts).
  const editor = readCode("src/components/home/AvatarEditor.tsx");
  const bodyNav = sectionById("body");
  check(
    `the weight target's place is named as the app names it: '${WEIGHT_PLACE}' (nav's Body section and its This week page), in the hint, the refusal and both of the sheet's links; no user-facing 'Train › Weight' is left`,
    WEIGHT_PLACE === `${bodyNav.label} › ${bodyNav.subs.find((x) => x.href === "/train")?.label}` &&
      AVATAR_METRICS.WEIGHT.reads === `your trend weight; its target is set on ${WEIGHT_PLACE}` &&
      /Set on \{WEIGHT_PLACE\}/.test(editor) &&
      /Set it on \{WEIGHT_PLACE\}/.test(editor) &&
      ["src/lib/avatar.ts", "src/components/home/AvatarEditor.tsx", "src/components/home/StatusPanel.tsx", "src/app/actions/avatar.ts", "src/lib/avatar-server.ts"].every((f2) => !/Train › Weight/.test(readCode(f2))),
    `${bodyNav.label} › ${bodyNav.subs.map((x) => x.label).join("/")}`
  );
  // The P4 review: an hours target reads the same receipt minutes a skill's hours do, so it says what they are.
  check(
    "an hours target says its figures are task estimates, not timed (the hint names TICK_BASIS, the line marks the value ≈), and no other metric is marked",
    AVATAR_METRICS.TRACK_HOURS.reads.includes(`(${TICK_BASIS})`) &&
      STORED_METRICS.filter((m) => AVATAR_METRICS[m].estimate).join() === "TRACK_HOURS" &&
      !AVATAR_METRICS.WEIGHT.estimate
  );
  const own = cleanTargetInput({ attribute: "CARE", metric: "MANUAL", label: "Calls home", target: 3, direction: "DOWN" }, { ...ctx, current: 7 });
  check(
    "a measure of your own needs a name, takes no baseline it wasn't given (never the 'value now' of another), and keeps the direction it was told",
    own.ok && own.value.baselineValue === null && own.value.baselineDay === null && own.value.direction === "DOWN" && err(cleanTargetInput({ attribute: "CARE", metric: "MANUAL", target: 3 }, ctx)) === "Give it a name."
  );
  const base = target({});
  const edit = planTargetEdit(base, { target: 14 }, TODAY);
  check(
    "an edit plans the lineage's next row: the attribute, metric, scope and unit stay, the baseline and its day stay unless the value changed",
    edit.ok && edit.value.metric === "FIELD_LEVEL" && edit.value.attribute === "INTELLECT" && edit.value.unit === "level" && JSON.stringify(edit.value.scope) === '{"fieldId":"f-stats"}' && edit.value.baselineDay === "2026-10-01" && edit.value.targetValue === 14
  );
  const rebased = planTargetEdit(base, { baseline: 9 }, TODAY);
  check(
    "…a new baseline value starts today; the same value keeps its day; an edit that changes nothing adds no version",
    rebased.ok && rebased.value.baselineDay === TODAY && rebased.value.baselineValue === 9 && (planTargetEdit(base, { baseline: 8 }, TODAY) as { error?: string }).error === "Nothing changed." && err(planTargetEdit(base, {}, TODAY)) === "Nothing changed."
  );
  check(
    "the caps: 3 targets an attribute (Train's weight counts under Vitality) and 12 in all",
    AVATAR_PER_ATTRIBUTE_MAX === 3 &&
      AVATAR_TARGETS_MAX === 12 &&
      capacityError([{ attribute: "VITALITY" }, { attribute: "VITALITY" }], "VITALITY", true) !== null &&
      capacityError([{ attribute: "VITALITY" }, { attribute: "VITALITY" }], "VITALITY", false) === null &&
      capacityError(Array.from({ length: 11 }, (_, i) => ({ attribute: AVATAR_ATTRIBUTES[i % 6] })), "CARE", true) !== null
  );

  // The cores, on a fake store: writes gated, an edit keeps the history, a log is SELF, the cron writes COMPUTED only.
  const fake = () => {
    const rows: AvatarTargetRow[] = [];
    const logged: { measureKey: string; day: DayKey; value: number; source: string }[] = [];
    const calls: string[] = [];
    let race = false;
    const toRow = (r: AvatarNewRow, at: Date): AvatarTargetRow => ({ ...r, scope: r.scope, createdAt: at.toISOString(), archivedAt: null });
    const store: AvatarStore = {
      live: async () => rows.filter((r) => r.archivedAt == null).map((r) => ({ ...r })),
      byId: async (_u, id) => {
        const r = rows.find((x) => x.id === id);
        return r ? { ...r } : null;
      },
      insert: async (_u, r, at) => {
        calls.push("insert");
        rows.push(toRow(r, at));
      },
      replace: async (_u, oldId, next, at) => {
        calls.push("replace");
        const old = rows.find((r) => r.id === oldId && r.archivedAt == null);
        if (!old || race) return "stale";
        old.archivedAt = at.toISOString();
        rows.push(toRow(next, at));
        return "ok";
      },
      archive: async (_u, id, at) => {
        calls.push("archive");
        const r = rows.find((x) => x.id === id && x.archivedAt == null);
        if (!r) return 0;
        r.archivedAt = at.toISOString();
        return 1;
      },
      logSelf: async (_u, r) => {
        calls.push("logSelf");
        const i = logged.findIndex((x) => x.measureKey === r.measureKey && x.day === r.day);
        if (i >= 0) logged[i] = { ...r, source: "SELF" };
        else logged.push({ ...r, source: "SELF" });
      },
      latestSelf: async (_u, keys, today) => {
        const out: Record<string, { day: DayKey; value: number }> = {};
        for (const r of [...logged].sort((a, b) => a.day.localeCompare(b.day))) if (r.source === "SELF" && keys.includes(r.measureKey) && r.day <= today) out[r.measureKey] = { day: r.day, value: r.value };
        return out;
      },
      upsertComputed: async (_u, rs) => {
        calls.push("upsertComputed");
        for (const r of rs) logged.push({ ...r, source: "COMPUTED" });
        return rs.length;
      },
    };
    let n = 0;
    const reads: AvatarFactReads = { fields: async () => facts.fields ?? [], weekRows: async () => WEEK_ROWS, deals: async () => [], weight: async () => weight };
    return { rows, logged, calls, store, reads, newId: () => `id${++n}`, race: (on: boolean) => (race = on) };
  };
  const f1 = fake();
  const deps = (env: Record<string, string>) => ({ store: f1.store, reads: f1.reads, env, now: () => AT, newId: f1.newId });
  const offs = [
    await addAvatarTargetCore("u1", { attribute: "CARE", metric: "MANUAL", label: "Calls home", target: 3 }, deps(WRITES_OFF)),
    await editAvatarTargetCore("u1", "x", { target: 4 }, deps(WRITES_OFF)),
    await archiveAvatarTargetCore("u1", "x", deps(WRITES_OFF)),
    await logAvatarReadingCore("u1", "x", 2, deps(WRITES_OFF)),
  ];
  check(
    "writes off (a dev server sharing the database): every avatar write refuses with its line and the store sees nothing",
    offs.every((r) => !r.ok && (r as { error: string }).error === AVATAR_WRITES_OFF) && f1.calls.length === 0 &&
      (await recordAvatarReadings("u1", AT, { store: f1.store, reads: f1.reads, env: WRITES_OFF })).skipped === "WRITES_OFF"
  );
  const added = await addAvatarTargetCore("u1", { attribute: "CARE", metric: "MANUAL", label: "Calls home", target: 3, baseline: 1 }, deps(WRITES_ON));
  const firstId = added.ok ? added.value.id : "";
  check("an add writes the lineage's first row (its id is its lineage) and nothing else", added.ok && f1.rows.length === 1 && f1.rows[0].id === firstId && f1.rows[0].lineageId === firstId && JSON.stringify(f1.calls) === '["insert"]');
  const logged = await logAvatarReadingCore("u1", firstId, 2, deps(WRITES_ON));
  const edited = await editAvatarTargetCore("u1", firstId, { target: 5 }, deps(WRITES_ON));
  const nextId = edited.ok ? edited.value.id : "";
  const lineage = f1.rows.filter((r) => r.lineageId === firstId);
  check(
    "an edit leaves the archived history: the old row archived, the new one live under the same lineage, the target changed",
    edited.ok && lineage.length === 2 && lineage[0].archivedAt !== null && lineage[1].archivedAt === null && lineage[1].id === nextId && lineage[1].targetValue === 5 && lineage[0].targetValue === 3,
    JSON.stringify(lineage.map((r) => [r.id, r.archivedAt, r.targetValue]))
  );
  check(
    "a log is today's SELF reading under 'AVATAR|a:<lineageId>', so it carries across the edit (the new row reads it)",
    logged.ok && f1.logged.length === 1 && f1.logged[0].source === "SELF" && f1.logged[0].measureKey === avatarKey(firstId) && f1.logged[0].day === TODAY &&
      (await loadAvatar("u1", AT, { store: f1.store, reads: f1.reads, env: WRITES_ON })).targets.find((t) => t.id === nextId)?.line === "Calls home 2 → 5 · 25% of the way · self-reported"
  );
  const staleEdit = await editAvatarTargetCore("u1", firstId, { target: 6 }, deps(WRITES_ON));
  const staleLog = await logAvatarReadingCore("u1", firstId, 3, deps(WRITES_ON));
  f1.race(true);
  const raced = await editAvatarTargetCore("u1", nextId, { target: 6 }, deps(WRITES_ON));
  f1.race(false);
  check(
    "the archived version can't be edited or logged again; a raced edit is refused, never doubled",
    !staleEdit.ok && !staleLog.ok && !raced.ok && raced.error === "That target changed meanwhile. Try again." && f1.rows.filter((r) => r.lineageId === firstId && r.archivedAt == null).length === 1
  );
  const computed = await addAvatarTargetCore("u1", { attribute: "INTELLECT", metric: "FIELD_LEVEL", fieldId: "f-stats", target: 12 }, deps(WRITES_ON));
  const compId = computed.ok ? computed.value.id : "";
  check(
    "a measured target can't be logged by hand (its readings are the app's), and a computed add starts from the value now",
    computed.ok && !(await logAvatarReadingCore("u1", compId, 11, deps(WRITES_ON))).ok && f1.rows.find((r) => r.id === compId)?.baselineValue === 9.4
  );
  const before = f1.logged.length;
  const run = await recordAvatarReadings("u1", AT, { store: f1.store, reads: f1.reads, env: WRITES_ON });
  const wrote = f1.logged.slice(before);
  check(
    "the cron's readings: one COMPUTED row for the measured target, none for the MANUAL one (its logs are the user's)",
    run.written === 1 && run.skipped === null && wrote.length === 1 && wrote[0].source === "COMPUTED" && wrote[0].measureKey === avatarKey(compId) && wrote[0].value === 9.4,
    JSON.stringify(run)
  );
  const archived = await archiveAvatarTargetCore("u1", compId, deps(WRITES_ON));
  check("an archive retires the target (gone from the card) and keeps its row and readings", archived.ok && f1.rows.some((r) => r.id === compId && r.archivedAt !== null) && f1.logged.some((r) => r.measureKey === avatarKey(compId)));
  // The failures below are meant: their log lines are held back.
  const quiet = async <R>(fn: () => Promise<R>): Promise<R> => {
    const [e, w] = [console.error, console.warn];
    console.error = () => {};
    console.warn = () => {};
    try {
      return await fn();
    } finally {
      [console.error, console.warn] = [e, w];
    }
  };
  const thrown = await recordAvatarReadings("u1", AT, {
    store: { ...f1.store, live: async () => Promise.reject(Object.assign(new Error('The table `public.AvatarTarget` does not exist in the current database.'), { code: "P2021" })) },
    reads: f1.reads,
    env: WRITES_ON,
  });
  const failed = await quiet(() => recordAvatarReadings("u1", AT, { store: { ...f1.store, live: async () => Promise.reject(new Error("pool timeout")) }, reads: f1.reads, env: WRITES_ON }));
  check("the cron's step never throws: a missing table is a skip, any other failure comes back as its error", thrown.skipped === "MISSING_TABLE" && failed.error === "pool timeout" && failed.written === 0);
  const missing = await quiet(() => loadAvatar("u1", AT, { store: { ...f1.store, live: async () => Promise.reject(new TypeError("Cannot read properties of undefined (reading 'findMany')")) }, reads: f1.reads, env: WRITES_OFF }));
  check("before the migration (or on a client that predates it) the card reads no targets, never an error page; writesOn follows the gate", missing.targets.length === 1 && missing.targets[0].id === "weight" && missing.writesOn === false);

  // The server file's Prisma: AvatarTarget and RoadmapReading (and the judge's own ActivityEvent read), never a ledger write.
  const server = readCode("src/lib/avatar-server.ts");
  const models = [...new Set([...server.matchAll(/\b(?:prisma|tx)\s*\.\s*(\$?\w+)/g)].map((m) => m[1]))].sort();
  check(
    "avatar-server's Prisma reaches AvatarTarget and RoadmapReading (and the $transaction and raw SQL they use); its one ActivityEvent read is the judge's own SELECT",
    JSON.stringify(models) === JSON.stringify(["$executeRaw", "$queryRaw", "$transaction", "avatarTarget", "roadmapReading"]) &&
      /SELECT e\."id", e\."source", e\."dedupeKey", e\."day", e\."track", e\."templateId", e\."rawXp", e\."receipt", t\."category"\s*FROM "ActivityEvent" e/.test(server) &&
      (server.match(/INSERT INTO "(\w+)"/g) ?? []).every((m) => m === 'INSERT INTO "RoadmapReading"'),
    models.join(", ")
  );
  check(
    "its COMPUTED upsert keeps the roadmap readings' rule (same source, not newer, differs), and a log replaces only a SELF row",
    /WHERE "RoadmapReading"\."source" = EXCLUDED\."source"\s*AND "RoadmapReading"\."observedAt" <= EXCLUDED\."observedAt"\s*AND \("RoadmapReading"\."value" IS DISTINCT FROM EXCLUDED\."value" OR "RoadmapReading"\."detail" IS DISTINCT FROM EXCLUDED\."detail"\)/.test(server) &&
      /'SELF', \$\{at\}, \$\{at\}\)\s*ON CONFLICT \("userId", "measureKey", "day"\) DO UPDATE\s*SET "value" = EXCLUDED\."value", "detail" = EXCLUDED\."detail", "observedAt" = EXCLUDED\."observedAt"\s*WHERE "RoadmapReading"\."source" = 'SELF'/.test(server)
  );
  check(
    "every avatar write needs life writes on: each core opens with the gate (AVATAR_WRITES_OFF), and the degrade cron's step with settlementWritesEnabled",
    (server.match(/if \(!d\.writesOn\) return \{ ok: false, error: AVATAR_WRITES_OFF \};/g) ?? []).length === 4 &&
      /if \(!d\.writesOn\) return \{ written: 0, skipped: "WRITES_OFF" \};/.test(server) &&
      /writesOn: lifeWritesEnabled\(deps\.env\),/.test(server) &&
      /export async function recordAvatarAfterDegrade\([\s\S]*?if \(!settlementWritesEnabled\(env\)\) return \{ written: 0, skipped: "WRITES_OFF" \};/.test(readCode("src/lib/settlement.ts"))
  );
  const route = readCode("src/app/api/cron/degrade/route.ts");
  check(
    "the degrade cron's roadmap step records the avatar's COMPUTED readings right after its roadmap readings, and reports them",
    route.indexOf("recordAvatarAfterDegrade(userId, new Date())") > route.indexOf("recordRoadmapAfterDegrade(userId, new Date())") &&
      route.indexOf("recordRoadmapAfterDegrade(userId, new Date())") > 0 &&
      /NextResponse\.json\(\{[^}]*\broadmap, avatar\b[^}]*\}\)/.test(route)
  );

  // The panel: each row carries its targets; a target never moves a level.
  const k = knowledgeRow([{ name: "Statistics", level: 9.4 }], [{ name: "Statistics", level: 9.1 }]);
  const lifeLedger: LifeLedger = { epochDay: "2026-10-01", xpByDay: [{ track: "BODY", day: "2026-10-05", xp: 300 }], compositions: [], weeks: [], mints: [] };
  const life = lifeTracksView(lifeLedger, TODAY, "2026-10-01");
  const bare = statusPanelOf(life, k);
  const withAvatar = statusPanelOf(life, k, { targets: views });
  const strip = (p: typeof bare) => JSON.stringify(p.rows.map((r) => ({ ...r, targets: [] })));
  check(
    "statusPanelOf(life, knowledge, avatar): each row carries its attribute's targets, Capital's go with the Capital row, and every row's own figures are unchanged",
    strip(bare) === strip(withAvatar) &&
      bare.rows.every((r) => r.targets.length === 0) &&
      JSON.stringify(withAvatar.rows.map((r) => [r.key, r.targets.map((t) => t.id)])) ===
        JSON.stringify([
          ["VITALITY", ["weight", "e1"]],
          ["INTELLECT", ["t1", "gone"]],
          ["CRAFT", ["h1"]],
          ["DUTY", []],
          ["CARE", ["m1"]],
        ]) &&
      withAvatar.capitalTargets.map((t) => t.id).join() === "r1" &&
      withAvatar.unplaced.length === 0
  );
  const early = statusPanelOf(notLaunchedView(TODAY), k, { targets: views });
  check(
    "before life counts a track's targets are kept apart (unplaced), never dropped; Intellect's stay on its row",
    early.rows.length === 1 && early.rows[0].targets.map((t) => t.id).join() === "t1,gone" && early.unplaced.map((t) => t.id).join() === "weight,e1,h1,m1" && early.capitalTargets.length === 1
  );
  const card = readCode("src/components/home/StatusPanel.tsx");
  check(
    "the card draws each row's targets under its line, Capital's under the Capital row (shown for them with no deal won), the unplaced in their own row, and the Edit avatar sheet",
    // Re-pinned for P5: the skill count joins the targets under the line. Re-pinned for P28: the row's condition note
    // (nothing at 100% or while DECAY_LAUNCH_DAY is off) comes first, straight under the line.
    /extra=\{\s*<>\s*<ConditionNote row=\{r\} \/>\s*<TargetLines targets=\{r\.targets\} \/>\s*<SkillCount count=\{r\.skills\} \/>\s*<\/>\s*\}/.test(card) &&
      /\{\(capital \|\| panel\.capitalTargets\.length > 0\) && <CapitalRow capital=\{capital\} targets=\{panel\.capitalTargets\} \/>\}/.test(card) &&
      /\{panel\.unplaced\.length > 0 && <UnplacedRow targets=\{panel\.unplaced\} \/>\}/.test(card) &&
      /<AvatarEditor view=\{avatar\.view\} today=\{avatar\.today\} actions=\{avatar\.actions\} \/>/.test(card)
  );
  const rulesFlat = readCode("src/app/today/rules/page.tsx").replace(/\s+/g, " ");
  check(
    "the rules page says targets pay nothing (Ground rules, its last line), with no number typed",
    /Avatar targets pay nothing: a target and its readings are a record of the desired self, never XP, MP or a level, and a number you log yourself is labelled self-reported\./.test(rulesFlat)
  );
  // The phone reads them through GET /status: its models and demo carry them.
  const ktModels = readCode("android/app/src/main/java/com/xtnl/app/data/Models.kt");
  const demo = readCode("android/app/src/main/java/com/xtnl/app/data/DemoApi.kt");
  check(
    "the phone: StatusPanel.targets (StatusTarget, the doc's keys) in Models.kt, and the demo sends targets",
    /val targets: List<StatusTarget>\? = null,/.test(ktModels) &&
      /data class StatusTarget\(/.test(ktModels) &&
      ["attribute", "label", "metric", "unit", "direction", "baseline", "baselineDay", "target", "targetDay", "current", "currentDay", "source", "share", "pace", "line"].every((f) => new RegExp(`\\bval ${f}: `).test(ktModels)) &&
      /StatusTarget\(/.test(demo)
  );
}

async function competencyChecks(): Promise<void> {
  console.log("— the skills (P5) —");
  // Blueprint 1.5 (D7: a Skill is a named Competency that tasks, roadmaps and walks link to; D8: Tier 4 is 2,000–10,000 h;
  // D9: a tier-up is a Seal only, no MP). Hours are derived from the ledger on read; the only writes are the skill rows
  // and the two link columns.
  const AT = new Date("2026-10-24T01:00:00.000Z");
  const WRITES_ON = { XTNL_LIFE_JUDGE: "1" };
  const WRITES_OFF = { NODE_ENV: "development" };

  // The migration: one table and two nullable columns, additive; nothing backfilled.
  const migration = readFileSync(join(ROOT, "prisma/migrations/20261230000000_competencies/migration.sql"), "utf8");
  const sql = migration.replace(/--.*$/gm, "");
  check(
    "the migration 20261230000000_competencies is additive: BEGIN/COMMIT, one CREATE TABLE Competency, its CHECKs and indexes, and two nullable competencyId columns (TaskTemplate, Roadmap) with no default; no DROP, no row written",
    /^BEGIN;/m.test(sql) &&
      /COMMIT;\s*$/.test(sql) &&
      (sql.match(/CREATE TABLE/g) ?? []).length === 1 &&
      /CREATE TABLE "public"\."Competency"/.test(sql) &&
      !/\bDROP\b|\bTRUNCATE\b|\bUPDATE\b|\bDELETE\b|\bINSERT\b|RENAME|\bTYPE\b|NOT NULL DEFAULT[^,]*competency/i.test(sql) &&
      [...sql.matchAll(/ALTER TABLE "public"\."(\w+)" (\w+ \w+)/g)].every((m) => (m[1] === "Competency" && m[2] === "ADD CONSTRAINT") || ((m[1] === "TaskTemplate" || m[1] === "Roadmap") && m[2] === "ADD COLUMN")) &&
      /ALTER TABLE "public"\."TaskTemplate" ADD COLUMN "competencyId" TEXT;/.test(sql) &&
      /ALTER TABLE "public"\."Roadmap" ADD COLUMN "competencyId" TEXT;/.test(sql) &&
      [...sql.matchAll(/ON "public"\."(\w+)"/g)].every((m) => m[1] === "Competency" || m[1] === "TaskTemplate") &&
      !/REFERENCES/.test(sql)
  );
  const attrCheck = /CHECK \("attribute" IN \(([^)]*)\)\)/.exec(sql)?.[1].replace(/['\s]/g, "").split(",") ?? [];
  const kindCheck = /CHECK \("kind" IN \(([^)]*)\)\)/.exec(sql)?.[1].replace(/['\s]/g, "").split(",") ?? [];
  check(
    "…timestamptz, the CHECKs are the catalog's (the five attributes, no Capital; PRACTICE | EXERCISE; a name of 1 to SKILL_NAME_MAX; an exercise skill is Vitality's; a Field only on Intellect), one live skill a name and one live exercise skill",
    /"archivedAt" TIMESTAMPTZ\(3\),/.test(sql) &&
      /"createdAt" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP,/.test(sql) &&
      /"updatedAt" TIMESTAMPTZ\(3\) NOT NULL,/.test(sql) &&
      !/TIMESTAMP\(3\)/.test(sql) &&
      JSON.stringify(attrCheck) === JSON.stringify(SKILL_ATTRIBUTES) &&
      !attrCheck.includes("CAPITAL") &&
      JSON.stringify(kindCheck) === JSON.stringify(SKILL_KINDS) &&
      new RegExp(`CHECK \\(char_length\\("name"\\) BETWEEN 1 AND ${SKILL_NAME_MAX}\\)`).test(sql) &&
      new RegExp(`CHECK \\("kind" <> 'EXERCISE' OR "attribute" = '${EXERCISE_ATTRIBUTE}'\\)`).test(sql) &&
      /CHECK \("fieldId" IS NULL OR "attribute" = 'INTELLECT'\)/.test(sql) &&
      /CREATE UNIQUE INDEX "Competency_userId_name_live_key" ON "public"\."Competency"\("userId", lower\("name"\)\) WHERE "archivedAt" IS NULL;/.test(sql) &&
      /CREATE UNIQUE INDEX "Competency_userId_exercise_live_key" ON "public"\."Competency"\("userId"\) WHERE "kind" = 'EXERCISE' AND "archivedAt" IS NULL;/.test(sql),
    `${attrCheck.join(",")} / ${kindCheck.join(",")}`
  );
  const schema = readCode("prisma/schema.prisma");
  const model = /^model Competency \{([\s\S]*?)^\}/m.exec(schema)?.[1] ?? "";
  const cols = [...model.matchAll(/^\s+(\w+)\s+\S/gm)].map((m) => m[1]).filter((c) => !c.startsWith("@@"));
  const sqlCols = [...sql.matchAll(/^\s+"(\w+)" [A-Z]/gm)].map((m) => m[1]);
  const tplModel = /^model TaskTemplate \{([\s\S]*?)^\}/m.exec(schema)?.[1] ?? "";
  const roadModel = /^model Roadmap \{([\s\S]*?)^\}/m.exec(schema)?.[1] ?? "";
  check(
    "schema.prisma matches: Competency has the migration's columns in its order (timestamptz), TaskTemplate.competencyId String? with its (userId, competencyId) index, Roadmap.competencyId String?; no relation, no model named Skill",
    JSON.stringify(cols) === JSON.stringify(sqlCols) &&
      /archivedAt\s+DateTime\?\s+@db\.Timestamptz\(3\)/.test(model) &&
      /^\s+competencyId\s+String\?\s*$/m.test(tplModel) &&
      /@@index\(\[userId, competencyId\]\)/.test(tplModel) &&
      /^\s+competencyId\s+String\?\s*$/m.test(roadModel) &&
      !/Competency\??\s+@relation|\bCompetency\[\]/.test(schema) &&
      !/^model Skill\b/m.test(schema),
    `${cols.join(",")} vs ${sqlCols.join(",")}`
  );

  // The tiers (D8) and their goldens: 99.9 h is Tier 1, 100 h Tier 2, 2,000 h Tier 4.
  check(
    "the tiers are the blueprint's and D8's: 0–100, 100–500, 500–2,000 and 2,000–10,000 h",
    JSON.stringify(SKILL_TIERS.map((t) => [t.tier, t.from, t.to])) === JSON.stringify([[1, 0, 100], [2, 100, 500], [3, 500, 2000], [4, 2000, 10000]]) && SKILL_HOURS_TOP === 10000
  );
  const golden: [number, number][] = [[0, 1], [99.9, 1], [99.99, 1], [100, 2], [499.9, 2], [500, 3], [1999.9, 3], [2000, 4], [9999, 4], [10000, 4], [25000, 4], [-5, 1], [Number.NaN, 1]];
  const bad = golden.filter(([h, t]) => tierOfHours(h) !== t);
  check("tier boundary goldens: 99.9 h = T1, 100 h = T2, 500 h = T3, 2,000 h = T4, and past 10,000 still T4", bad.length === 0, bad.map(([h, t]) => `${h} → ${tierOfHours(h)} (want ${t})`).join(", "));
  const m250 = tierMeterOf(250);
  const m2000 = tierMeterOf(2000);
  const mTop = tierMeterOf(12000);
  check(
    "the meter within a tier: 250 h is 37.5% through Tier 2 with 250 h to Tier 3; 2,000 h starts Tier 4 with no next; 10,000 h fills it",
    m250.tier === 2 && Math.abs(m250.progress - 0.375) < 1e-12 && m250.toNext === 250 && m2000.tier === 4 && m2000.progress === 0 && m2000.toNext === null && !m2000.top && mTop.progress === 1 && mTop.top
  );
  check(
    "the words: hours floored (99.95 h reads 99.9, never 100), the plan's '≈ 42 h (task estimates, not timed)', walks alone, no hours; the tier lines",
    hoursText(99.95) === "99.9" &&
      hoursText(100) === "100" &&
      hoursText(1234.9) === "1,234" &&
      hoursLineOf({ minutes: 42 * 60, ticks: 12, walks: 0 }) === "≈ 42 h (task estimates, not timed)" &&
      hoursLineOf({ minutes: 750, ticks: 0, walks: 9 }) === "12.5 h of walks" &&
      hoursLineOf({ minutes: 0, ticks: 0, walks: 0 }) === NO_HOURS_LINE &&
      tierLineOf(tierMeterOf(42)) === "Tier 1 · 0–100 h · 58 h to Tier 2" &&
      tierLineOf(tierMeterOf(2400)) === "Tier 4 · 2,000–10,000 h" &&
      tierLineOf(tierMeterOf(10000)) === "Tier 4 · 10,000 h reached" &&
      TICK_BASIS === "task estimates, not timed"
  );
  check(
    "the Seal's key is 'competency:<id>:t<n>' and parses back; nothing else parses as one",
    skillSealKey("sk1", 3) === "competency:sk1:t3" && JSON.stringify(parseSkillSealKey("competency:sk1:t3")) === JSON.stringify({ id: "sk1", tier: 3 }) && parseSkillSealKey("track:DUTY:3") === null && parseSkillSealKey("competency:sk1:t5") === null
  );

  // The hours, on fixtures: receipt minutes net of undo rows, then the instance's, then the estimate.
  const row = (id: string, o: Partial<SkillRow> = {}): SkillRow => ({ id, name: id, attribute: "CRAFT", kind: "PRACTICE", fieldId: null, sortOrder: 0, createdAt: "2026-10-01T00:00:00.000Z", archivedAt: null, ...o });
  const tpl = (id: string, o: Partial<SkillTemplate> = {}): SkillTemplate => ({ id, title: id, kind: "HABIT", competencyId: null, roadmapCompetencyId: null, boardId: null, estMinutes: 30, ...o });
  const tick = (id: string, templateId: string, o: Partial<SkillTick> = {}): SkillTick => ({ id, templateId, dedupeKey: `task:${templateId}:${id}`, receiptMinutes: 60, instanceMinutes: 60, instanceSource: "manual", day: "2026-10-20", undone: false, ...o });
  const hoursOf = (skills: SkillRow[], facts: Partial<SkillFacts>, id: string) => skillHoursOf(skills, { ...NO_SKILL_FACTS, ...facts }).get(id);
  const A = row("A");
  const h1 = hoursOf([A], {
    templates: [tpl("t1", { competencyId: "A" })],
    ticks: [tick("e1", "t1"), tick("e2", "t1", { receiptMinutes: null, instanceMinutes: 45 }), tick("e3", "t1", { receiptMinutes: null, instanceMinutes: null }), tick("e4", "t1", { undone: true }), tick("e5", "t1", { dedupeKey: "undo:e9", receiptMinutes: -60 })],
  }, "A");
  check(
    "a tick counts its receipt's minutes, else its instance's, else the task's estimate (counted as estimated); an undone tick and a reversal row count nothing",
    h1?.minutes === 60 + 45 + 30 && h1?.ticks === 3 && h1?.estimated === 1 && h1?.templates === 1,
    JSON.stringify(h1)
  );
  check(
    "tickMinutesOf's order: receipt, then instance, then estimate (a non-positive figure falls through)",
    JSON.stringify([tickMinutesOf({ receiptMinutes: 25, instanceMinutes: 40 }, 10), tickMinutesOf({ receiptMinutes: 0, instanceMinutes: 40 }, 10), tickMinutesOf({ receiptMinutes: null, instanceMinutes: null }, 10)]) ===
      JSON.stringify([{ minutes: 25, basis: "RECEIPT" }, { minutes: 40, basis: "INSTANCE" }, { minutes: 10, basis: "ESTIMATE" }])
  );
  const B = row("B");
  const both = { templates: [tpl("t1", { competencyId: "A", roadmapCompetencyId: "A" }), tpl("t2", { competencyId: "A", roadmapCompetencyId: "B" }), tpl("t3", { roadmapCompetencyId: "B" })], ticks: [tick("e1", "t1"), tick("e2", "t2"), tick("e3", "t3")] };
  const hb = skillHoursOf([A, B], { ...NO_SKILL_FACTS, ...both });
  check(
    "linking credits history exactly once: a practice linked to A both ways counts once; its own link beats its roadmap's; a roadmap-only practice feeds the roadmap's skill",
    hb.get("A")?.minutes === 120 && hb.get("A")?.ticks === 2 && hb.get("B")?.minutes === 60 && hb.get("B")?.templates === 1,
    JSON.stringify([...hb.entries()])
  );
  const archivedA = row("A", { archivedAt: "2026-10-20T00:00:00.000Z" });
  const fall = skillHoursOf([archivedA, B], { ...NO_SKILL_FACTS, ...both });
  check(
    "a link to an archived skill counts toward nothing (its own link falls through to its roadmap's live skill); an archived skill has no hours",
    !fall.has("A") && fall.get("B")?.minutes === 120 && fall.get("B")?.templates === 2 && effectiveSkillOf(tpl("x", { competencyId: "A" }), new Set(["B"])) === null
  );
  const noFeed = skillHoursOf([A], { ...NO_SKILL_FACTS, templates: [tpl("w", { competencyId: "A", boardId: "board-1" }), tpl("g", { competencyId: "A", kind: "GOAL" }), tpl("d", { competencyId: "A", kind: "IDEA_DRAFT" })], ticks: [tick("e1", "w"), tick("e2", "g"), tick("e3", "d")] }).get("A");
  check("a work tab's task, a goal and an idea draft feed no skill even when linked", noFeed?.minutes === 0 && noFeed?.templates === 0);
  const linkedTicks = [tick("e1", "t1"), tick("e2", "t1"), tick("e3", "t1", { undone: true })];
  const unlinked = hoursOf([A], { templates: [tpl("t1")], ticks: linkedTicks }, "A");
  const linked = hoursOf([A], { templates: [tpl("t1", { competencyId: "A" })], ticks: linkedTicks }, "A");
  check(
    "a link credits the task's whole history on read and an unlink takes it out: the same ticks, 0 h unlinked, 2 h linked, the undone one netted out",
    unlinked?.minutes === 0 && linked?.minutes === 120 && linked?.ticks === 2
  );
  const W = row("W", { kind: "EXERCISE", attribute: "VITALITY" });
  const P = row("P", { kind: "PRACTICE", attribute: "VITALITY" });
  const walkFacts: Partial<SkillFacts> = {
    templates: [tpl("walk", { competencyId: "W" }), tpl("run", { competencyId: "P" })],
    ticks: [tick("e1", "walk", { instanceSource: WALK_PAID_SOURCE }), tick("e2", "walk"), tick("e3", "run", { instanceSource: WALK_PAID_SOURCE })],
    walks: { minutes: 300, count: 6 },
  };
  const hw = skillHoursOf([W, P], { ...NO_SKILL_FACTS, ...walkFacts });
  check(
    "an exercise skill adds every logged walk; a tick a walk paid is that walk's time (not counted twice), while a practice skill still counts it",
    hw.get("W")?.minutes === 300 + 60 && hw.get("W")?.walks === 6 && hw.get("W")?.ticks === 1 && hw.get("P")?.minutes === 60 && hw.get("P")?.walks === 0,
    JSON.stringify([...hw.entries()])
  );
  const unreadWalks = skillHoursOf([W], { ...NO_SKILL_FACTS, ...walkFacts, walks: null }).get("W");
  check("walks that couldn't be read leave an exercise skill its ticks alone", unreadWalks?.minutes === 60 && unreadWalks?.walks === 0);
  // "Counts as" after a tick by hand (P5 review): the habit ticked first (source manual, its receipt's 30 minutes), then
  // a 45-minute walk logged as it. The walk tops the tick up (exercise.ts walkReceiptOf: one payment, and BODY's week
  // counts the walk's effort less the tick's), so the exercise skill counts that walk once: its own minutes alone.
  const tickedThenWalked = {
    ...NO_SKILL_FACTS,
    templates: [tpl("walk", { competencyId: "W" })],
    ticks: [tick("e1", "walk", { receiptMinutes: 30, instanceMinutes: 30, day: "2026-10-20" })],
    walks: { minutes: 45, count: 1 },
    topUps: [{ templateId: "walk", day: "2026-10-20" }],
  };
  const tw = skillHoursOf([W], tickedThenWalked).get("W");
  check(
    "ticked by hand, then a walk logged that Counts as it (the walk tops the tick up): the exercise skill's hours are the walk's minutes only, never the tick's beside them",
    tw?.minutes === 45 && tw?.ticks === 0 && tw?.walks === 1 && tw?.walkMinutes === 45,
    JSON.stringify(tw)
  );
  const twMore = skillHoursOf([W, P], {
    ...tickedThenWalked,
    templates: [tpl("walk", { competencyId: "W" }), tpl("run", { competencyId: "P" })],
    ticks: [...tickedThenWalked.ticks, tick("e2", "walk", { receiptMinutes: 30, day: "2026-10-21" }), tick("e3", "run", { receiptMinutes: 30, day: "2026-10-20" }), tick("e4", "walk", { receiptMinutes: 30, day: null })],
    topUps: [...tickedThenWalked.topUps, { templateId: "run", day: "2026-10-20" }],
  });
  const twUnread = skillHoursOf([W], { ...tickedThenWalked, walks: null }).get("W");
  check(
    "…only that template's ticks on the walk's day: another day's tick (and one of no known day) still counts, a practice skill (which counts no walk) still counts a tick a walk topped up, and with the walks unread the tick counts alone",
    twMore.get("W")?.minutes === 45 + 30 + 30 && twMore.get("W")?.ticks === 2 && twMore.get("P")?.minutes === 30 && twMore.get("P")?.ticks === 1 && twUnread?.minutes === 30 && twUnread?.ticks === 1 && twUnread?.walks === 0,
    JSON.stringify([[...twMore.entries()], twUnread])
  );
  const tiers = [5994, 6000, 120000].map((min) => skillsOf([A], { ...NO_SKILL_FACTS, templates: [tpl("t1", { competencyId: "A" })], ticks: [tick("e1", "t1", { receiptMinutes: min })] })[0]);
  check(
    "through the views: 99.9 h of ticks is Tier 1 ('≈ 99.9 h'), 100 h Tier 2 ('≈ 100 h'), 2,000 h Tier 4",
    tiers[0].tier === 1 && tiers[0].line === "≈ 99.9 h (task estimates, not timed)" && tiers[1].tier === 2 && tiers[1].line === "≈ 100 h (task estimates, not timed)" && tiers[2].tier === 4 && tiers[2].toNext === null,
    tiers.map((t) => `${t.hours} T${t.tier} ${t.line}`).join(" | ")
  );
  const order = skillsOf([row("Z"), row("Y"), row("X", { archivedAt: "2026-10-01T00:00:00.000Z" })], { ...NO_SKILL_FACTS, templates: [tpl("t1", { competencyId: "Y" })], ticks: [tick("e1", "t1")] }).map((s) => s.id);
  check("the views: live skills only, most hours first, then by name", JSON.stringify(order) === JSON.stringify(["Y", "Z"]));

  // Suggestions: normTitle families of unlinked personal tasks with SUGGEST_MIN_COMPLETIONS live ticks or more.
  const fam = (id: string, normTitle: string, completions: number, o: Partial<FamilyRow> = {}): FamilyRow => ({ id, title: normTitle, normTitle, track: "CRAFT", category: "WORK", completions, ...o });
  const sug = suggestionsOf(
    [fam("f1", "write words", 6, { title: "Write 500 words" }), fam("f2", "write words", 4, { title: "Write words" }), fam("f3", "guitar practice", SUGGEST_MIN_COMPLETIONS - 1), fam("f4", "walk", 12, { track: "BODY", category: "EXERCISE", title: "Walk" }), fam("f5", "spanish", 30, { title: "Spanish", track: "CARE" })],
    [row("S", { name: "spanish" })]
  );
  check(
    `suggestions: a family of two templates with ${SUGGEST_MIN_COMPLETIONS} ticks between them, named by its most-ticked title; below ${SUGGEST_MIN_COMPLETIONS} none; an exercise family takes the walks; a name a skill has is not suggested`,
    JSON.stringify(sug.map((s) => [s.name, s.completions, s.attribute, s.kind, s.templateIds.join("+")])) === JSON.stringify([["Walk", 12, "VITALITY", "EXERCISE", "f4"], ["Write 500 words", 10, "CRAFT", "PRACTICE", "f1+f2"]]),
    JSON.stringify(sug)
  );
  const many = suggestionsOf(Array.from({ length: 9 }, (_, i) => fam(`m${i}`, `family ${String.fromCharCode(97 + i)}`, 20 + i)), []);
  check(`at most SUGGEST_MAX (${SUGGEST_MAX}) suggestions, most ticked first`, many.length === SUGGEST_MAX && many[0].completions === 28);
  check("while a live skill takes the walks, an exercise family is suggested as practice", suggestionsOf([fam("f4", "walk", 12, { track: "BODY", category: "EXERCISE", title: "Walk" })], [row("W", { kind: "EXERCISE", attribute: "VITALITY" })])[0]?.kind === "PRACTICE");

  // What a write may write.
  const ctx = { live: [row("A", { name: "Writing" }), row("W", { name: "Walking", kind: "EXERCISE", attribute: "VITALITY" })], fields: [{ id: "f-econ", name: "Economics" }] };
  const refusals = [
    cleanSkillInput({ name: "  ", attribute: "CRAFT" }, ctx),
    cleanSkillInput({ name: "Guitar", attribute: "CAPITAL" }, ctx),
    cleanSkillInput({ name: "Rowing", attribute: "CRAFT", kind: "EXERCISE" }, ctx),
    cleanSkillInput({ name: "Rowing", attribute: "VITALITY", kind: "EXERCISE" }, ctx),
    cleanSkillInput({ name: "writing", attribute: "CARE" }, ctx),
    cleanSkillInput({ name: "Econ", attribute: "INTELLECT", fieldId: "f-gone" }, ctx),
    cleanSkillInput({ name: "Guitar", attribute: "CRAFT" }, { ...ctx, live: Array.from({ length: SKILLS_MAX }, (_, i) => row(`r${i}`)) }),
  ].map((r) => (r.ok ? "ok" : r.error));
  check(
    "an add is refused without a name, for Capital, for an exercise skill outside Vitality or a second one, for a name taken (in any case), for an unknown Field, and past SKILLS_MAX",
    JSON.stringify(refusals) ===
      JSON.stringify([SKILL_NAME_EMPTY, "Pick an attribute.", WALKS_ARE_VITALITY, "Walks already count toward Walking.", "You have a skill named Writing already.", "Pick a Field.", `There are ${SKILLS_MAX} skills already. Archive one first.`]),
    refusals.join(" | ")
  );
  const okAdd = cleanSkillInput({ name: "  Economics   reading ", attribute: "INTELLECT", fieldId: "f-econ" }, ctx);
  const fieldDropped = cleanSkillInput({ name: "Guitar", attribute: "CRAFT", fieldId: "f-econ" }, ctx);
  check(
    "an add writes a clean name, practice by default, and a Field for an Intellect skill only",
    okAdd.ok && JSON.stringify(okAdd.value) === JSON.stringify({ name: "Economics reading", attribute: "INTELLECT", kind: "PRACTICE", fieldId: "f-econ" }) && fieldDropped.ok && fieldDropped.value.fieldId === null
  );
  const edits = [
    planSkillEdit(ctx.live[0], { name: "Prose" }, ctx),
    planSkillEdit(ctx.live[1], { attribute: "CRAFT" }, ctx),
    planSkillEdit(ctx.live[0], { name: "Writing" }, ctx),
    planSkillEdit(ctx.live[0], { name: "walking" }, ctx),
  ].map((r) => (r.ok ? `ok:${r.value.name}:${r.value.attribute}` : r.error));
  check("an edit renames or moves a skill; an exercise skill stays Vitality's; a no-op and a taken name are refused", JSON.stringify(edits) === JSON.stringify(["ok:Prose:CRAFT", WALKS_ARE_VITALITY, "Nothing changed.", "You have a skill named Walking already."]), edits.join(" | "));
  check(
    "a link is refused for a work tab's task (work stays outside the game), a goal or an idea draft, and toward an archived or missing skill; clearing a link is always allowed",
    linkRefusalOf({ boardId: "b1", kind: "HABIT" }, row("A"), false) === WORK_LINK_REFUSAL &&
      linkRefusalOf({ boardId: "b1", kind: "HABIT" }, null, true) === WORK_LINK_REFUSAL &&
      linkRefusalOf({ boardId: null, kind: "GOAL" }, row("A"), false) === GOAL_LINK_REFUSAL &&
      linkRefusalOf({ boardId: null, kind: "HABIT" }, row("A", { archivedAt: "2026-10-01T00:00:00.000Z" }), false) === SKILL_GONE &&
      linkRefusalOf({ boardId: null, kind: "HABIT" }, null, false) === SKILL_GONE &&
      linkRefusalOf({ boardId: null, kind: "TASK" }, null, true) === null &&
      linkRefusalOf(null, row("A"), false) === "That task is gone." &&
      roadmapLinkRefusalOf({ status: "ARCHIVED" }, row("A"), false) === "That roadmap is archived." &&
      roadmapLinkRefusalOf({ status: "ACTIVE" }, row("A"), false) === null
  );

  // The cores, on a fake store: gated, writing only skill rows and links, never the ledger.
  const fake = () => {
    const skills: SkillRow[] = [];
    const templates: (LinkTemplate & { boardId: string | null })[] = [
      { id: "t-write", title: "Write 500 words", kind: "HABIT", boardId: null, competencyId: null },
      { id: "t-write2", title: "Write words", kind: "TASK", boardId: null, competencyId: null },
      { id: "t-work", title: "Invoice run", kind: "TASK", boardId: "board-1", competencyId: null },
      { id: "t-goal", title: "Ship the book", kind: "GOAL", boardId: null, competencyId: null },
    ];
    const roadmaps: LinkRoadmap[] = [{ id: "r1", name: "Novel", status: "ACTIVE", competencyId: null }];
    const calls: string[] = [];
    const store: SkillStore = {
      async live() {
        return skills.filter((s) => s.archivedAt == null);
      },
      async byId(_u, id) {
        return skills.find((s) => s.id === id) ?? null;
      },
      async insert(_u, r, ids) {
        calls.push(`insert:${ids.length}`);
        skills.push({ id: r.id, name: r.name, attribute: r.attribute, kind: r.kind, fieldId: r.fieldId, sortOrder: r.sortOrder, createdAt: AT.toISOString(), archivedAt: null });
        let n = 0;
        for (const t of templates) {
          if (!ids.includes(t.id) || t.boardId || t.competencyId != null || (t.kind !== "TASK" && t.kind !== "HABIT")) continue;
          t.competencyId = r.id;
          n++;
        }
        return n;
      },
      async update(_u, id, data) {
        calls.push("update");
        const s = skills.find((x) => x.id === id && x.archivedAt == null);
        if (!s) return 0;
        Object.assign(s, data);
        return 1;
      },
      async archive(_u, id, at) {
        calls.push("archive");
        const s = skills.find((x) => x.id === id && x.archivedAt == null);
        if (!s) return 0;
        s.archivedAt = at.toISOString();
        return 1;
      },
      async template(_u, id) {
        return templates.find((t) => t.id === id) ?? null;
      },
      async linkTemplate(_u, id, competencyId) {
        calls.push(`linkTemplate:${id}`);
        const t = templates.find((x) => x.id === id && !x.boardId && (x.kind === "TASK" || x.kind === "HABIT"));
        if (!t) return 0;
        t.competencyId = competencyId;
        return 1;
      },
      async roadmap(_u, id) {
        return roadmaps.find((r) => r.id === id) ?? null;
      },
      async linkRoadmap(_u, id, competencyId) {
        calls.push(`linkRoadmap:${id}`);
        const r = roadmaps.find((x) => x.id === id);
        if (!r) return 0;
        r.competencyId = competencyId;
        return 1;
      },
    };
    const reads: SkillReads = {
      templates: async () => templates.filter((t) => !t.boardId).map((t) => ({ id: t.id, title: t.title, kind: t.kind, competencyId: t.competencyId, roadmapCompetencyId: null, boardId: t.boardId, estMinutes: 30 })),
      ticks: async (_u, ids) => Array.from({ length: 12 }, (_, i) => tick(`e${i}`, i % 2 === 0 ? "t-write" : "t-write2", { receiptMinutes: 30 })).filter((t) => ids.includes(t.templateId)),
      walks: async () => ({ minutes: 0, count: 0 }),
      topUps: async () => [],
      fields: async () => [{ id: "f-econ", name: "Economics", level: 8 }],
      families: async () =>
        templates.filter((t) => !t.boardId && t.competencyId == null && (t.kind === "TASK" || t.kind === "HABIT")).map((t) => ({ id: t.id, title: t.title, normTitle: "write words", track: "CRAFT", category: "WORK", completions: 6 })),
      roadmaps: async () => roadmaps,
    };
    let n = 0;
    return { skills, templates, roadmaps, calls, store, reads, newId: () => `sk${++n}` };
  };
  const f = fake();
  const deps = (env: Record<string, string>) => ({ store: f.store, reads: f.reads, env, now: () => AT, newId: f.newId });
  const offs = [
    await addSkillCore("u1", { name: "Writing", attribute: "CRAFT" }, deps(WRITES_OFF)),
    await addSuggestedSkillCore("u1", "write words", deps(WRITES_OFF)),
    await editSkillCore("u1", "x", { name: "Y" }, deps(WRITES_OFF)),
    await archiveSkillCore("u1", "x", deps(WRITES_OFF)),
    await linkTemplateSkillCore("u1", "t-write", "x", deps(WRITES_OFF)),
    await linkRoadmapSkillCore("u1", "r1", "x", deps(WRITES_OFF)),
  ];
  check("writes off (a dev server sharing the database): every skill write refuses with its line and the store sees nothing", offs.every((r) => !r.ok && r.error === SKILL_WRITES_OFF) && f.calls.length === 0);
  const taken = await addSuggestedSkillCore("u1", "write words", deps(WRITES_ON));
  const skillId = taken.ok ? taken.value.id : "";
  const view = await loadSkills("u1", { store: f.store, reads: f.reads, env: WRITES_ON });
  check(
    "a suggestion taken is one skill with its family linked in one write (the family read again by its key), and its history counts at once: 12 ticks × 30 min = 6 h",
    taken.ok && taken.value.linked === 2 && JSON.stringify(f.calls) === '["insert:2"]' && f.templates.filter((t) => t.competencyId === skillId).length === 2 && view.skills[0]?.hours === 6 && view.skills[0]?.ticks === 12 && view.skills[0]?.templates === 2,
    JSON.stringify(view.skills[0])
  );
  check("a suggestion no longer there (its family linked) is refused", !(await addSuggestedSkillCore("u1", "write words", deps(WRITES_ON))).ok);
  const work = await linkTemplateSkillCore("u1", "t-work", skillId, deps(WRITES_ON));
  const goal = await linkTemplateSkillCore("u1", "t-goal", skillId, deps(WRITES_ON));
  check("a work tab's task and a goal are refused before any write (WORK_LINK_REFUSAL, GOAL_LINK_REFUSAL)", !work.ok && work.error === WORK_LINK_REFUSAL && !goal.ok && goal.error === GOAL_LINK_REFUSAL && !f.calls.some((c) => c.startsWith("linkTemplate")));
  const unlink = await linkTemplateSkillCore("u1", "t-write2", null, deps(WRITES_ON));
  const same = await linkTemplateSkillCore("u1", "t-write", skillId, deps(WRITES_ON));
  const after = await loadSkills("u1", { store: f.store, reads: f.reads, env: WRITES_ON });
  check(
    "an unlink takes that task's ticks back out (6 h → 3 h); re-linking to the skill it has writes nothing",
    unlink.ok && same.ok && JSON.stringify(f.calls.filter((c) => c.startsWith("linkTemplate"))) === '["linkTemplate:t-write2"]' && after.skills[0]?.hours === 3,
    JSON.stringify(after.skills[0])
  );
  const road = await linkRoadmapSkillCore("u1", "r1", skillId, deps(WRITES_ON));
  const second = await addSkillCore("u1", { name: "write 500 WORDS", attribute: "CARE" }, deps(WRITES_ON));
  const renamed = await editSkillCore("u1", skillId, { name: "Prose" }, deps(WRITES_ON));
  const archived = await archiveSkillCore("u1", skillId, deps(WRITES_ON));
  check(
    "a roadmap takes a skill; a second skill of the same name is refused; an edit renames; an archive retires it and keeps its links",
    road.ok && f.roadmaps[0].competencyId === skillId && !second.ok && renamed.ok && f.skills[0].name === "Prose" && archived.ok && f.skills[0].archivedAt !== null && f.templates.find((t) => t.id === "t-write")?.competencyId === skillId
  );
  check(
    "the cores call only the store's skill and link methods: no write of any other kind",
    f.calls.every((c) => /^(insert:\d+|update|archive|linkTemplate:[\w-]+|linkRoadmap:[\w-]+)$/.test(c)),
    f.calls.join(", ")
  );
  const quiet = async <R>(fn: () => Promise<R>): Promise<R> => {
    const [e, w] = [console.error, console.warn];
    console.error = () => {};
    console.warn = () => {};
    try {
      return await fn();
    } finally {
      [console.error, console.warn] = [e, w];
    }
  };
  const missing = await quiet(() => loadSkills("u1", { store: { ...f.store, live: async () => Promise.reject(Object.assign(new Error("The table `public.Competency` does not exist in the current database."), { code: "P2021" })) }, reads: f.reads, env: WRITES_ON }));
  const stale = await quiet(() => loadSkills("u1", { store: { ...f.store, live: async () => Promise.reject(new TypeError("Cannot read properties of undefined (reading 'findMany')")) }, reads: f.reads, env: WRITES_ON }));
  const noColumn = await quiet(() => addSkillCore("u1", { name: "Guitar", attribute: "CRAFT" }, { ...deps(WRITES_ON), store: { ...f.store, live: async () => Promise.reject(Object.assign(new Error('The column `t.competencyId` does not exist in the current database.'), { code: "P2022" })) } }));
  check(
    "before the migration (no table, no column, or a client that predates it) skills read as none and not ready, never an error page; a write says it isn't set up",
    missing.skills.length === 0 && !missing.ready && stale.skills.length === 0 && !stale.ready && !noColumn.ok && noColumn.error === "Skills aren't set up on this database yet." &&
      isMissingSkillSchema(Object.assign(new Error("relation \"public.Competency\" does not exist"), { code: "42P01" })) && !isMissingSkillSchema(new Error("pool timeout"))
  );
  // The same walk through loadSkills: the walks and their top-ups are read together for a live exercise skill.
  const walker = {
    store: { ...f.store, live: async () => [W] },
    reads: {
      ...f.reads,
      templates: async () => [tpl("walk", { competencyId: "W" })],
      ticks: async () => [tick("e1", "walk", { receiptMinutes: 30, instanceMinutes: 30, day: "2026-10-20" })],
      walks: async () => ({ minutes: 45, count: 1 }),
      topUps: async () => [{ templateId: "walk", day: "2026-10-20" }],
    },
    env: WRITES_ON,
  };
  const walked = await loadSkills("u1", walker);
  const topUpsDown = await quiet(() => loadSkills("u1", { ...walker, reads: { ...walker.reads, topUps: async () => Promise.reject(new Error("pool timeout")) } }));
  check(
    "through loadSkills: a tick by hand that a walk then topped up is the walk's 45 minutes once; a top-up read that fails reads the walks as unread too, so the tick counts alone (never the walk and the tick)",
    walked.skills[0]?.minutes === 45 && walked.skills[0]?.walks === 1 && walked.skills[0]?.ticks === 0 && topUpsDown.skills[0]?.minutes === 30 && topUpsDown.skills[0]?.walks === 0 && topUpsDown.skills[0]?.ticks === 1,
    JSON.stringify([walked.skills[0], topUpsDown.skills[0]])
  );

  // The server file: its Prisma writes are the skill rows and the two link columns, never the ledger; every write clears 'life'.
  const server = readCode("src/lib/competency-server.ts");
  const mutations = [...new Set([...server.matchAll(/\bprisma\s*\.\s*(\w+)\s*\.\s*(create|createMany|upsert|update|updateMany|delete|deleteMany)\b/g)].map((m) => `${m[1]}.${m[2]}`))].sort();
  check(
    "competency-server's Prisma writes are Competency's create and updateMany, and the link columns' updateMany on TaskTemplate and Roadmap (each data the competencyId alone); no raw write, no ledger",
    JSON.stringify(mutations) === JSON.stringify(["competency.create", "competency.updateMany", "roadmap.updateMany", "taskTemplate.updateMany"]) &&
      !/\$executeRaw|INSERT INTO|DELETE FROM/i.test(server) &&
      (server.match(/\b(?:taskTemplate|roadmap)\.updateMany\(\{[^]*?data: \{ competencyId(?:: row\.id)? \} \}\)/g) ?? []).length === 3,
    mutations.join(", ")
  );
  check(
    "every skill write is gated (SKILL_WRITES_OFF) and clears the 'life' cache tag, so a link's history never reads as a tick's tier-up",
    (server.match(/if \(!d\.writesOn\) return \{ ok: false, error: SKILL_WRITES_OFF \};/g) ?? []).length === 6 && (server.match(/invalidate\("life"\);/g) ?? []).length === 6
  );
  check(
    "the hours' reads: TASK rows of the linked templates with an 'undo:<id>' row of any source netting them out, the instance's minutes, the walks of kind WALK; the families net of undos too",
    /EXISTS \(SELECT 1 FROM "ActivityEvent" u WHERE u\."userId" = e\."userId" AND u\."dedupeKey" = 'undo:' \|\| e\."id"\) AS "undone"/.test(server) &&
      /LEFT JOIN "TaskInstance" i ON i\."id" = e\."sourceId"/.test(server) &&
      /WHERE e\."userId" = \$\{userId\} AND e\."source" = 'TASK' AND e\."templateId" = ANY\(/.test(server) &&
      /FROM "ExerciseSession" WHERE "userId" = \$\{userId\} AND "kind" = 'WALK'/.test(server) &&
      /AND NOT EXISTS \(SELECT 1 FROM "ActivityEvent" u WHERE u\."userId" = e\."userId" AND u\."dedupeKey" = 'undo:' \|\| e\."id"\)/.test(server) &&
      /t\."boardId" IS NULL AND \(t\."competencyId" IS NOT NULL OR r\."competencyId" IS NOT NULL\)/.test(server)
  );
  check(
    "the top-ups' read: WORKOUT rows whose receipt carries walk.topUp (exercise.ts walkReceiptOf's own field), joined to a walk still logged (its ExerciseSession, of kind WALK, as the walks' sum reads them); each tick carries its instance's day",
    /w\."receipt"->'walk'->'topUp'->>'templateId'/.test(server) &&
      /JOIN "ExerciseSession" s ON s\."id" = w\."sourceId" AND s\."userId" = w\."userId" AND s\."kind" = 'WALK'/.test(server) &&
      /WHERE w\."userId" = \$\{userId\} AND w\."source" = 'WORKOUT' AND w\."dedupeKey" LIKE 'workout:%'/.test(server) &&
      /COALESCE\(i\."day", e\."day"\) AS "day"/.test(server) &&
      /Promise\.all\(\[reads\.walks\(userId\), reads\.topUps\(userId\)\]\)/.test(server) &&
      /walk: \{[\s\S]*?topUp: opts\.topUp,\s*\},/.test(readCode("src/lib/exercise.ts")) &&
      /templateId: string;/.test(/export interface WalkTopUp \{([^}]*)\}/.exec(readCode("src/lib/exercise.ts"))?.[1] ?? "")
  );
  // Templates with competencyId null behave exactly as before: nothing outside the competency files reads the column.
  const readers = files.filter((f2) => /competencyId/.test(code(f2)));
  check(
    "only competency files name competencyId (tasks.ts, the board, the pricing, the judge and capture never read it), so a template with none behaves exactly as before",
    readers.length > 0 && readers.every((f2) => isTarget(f2, ["competenc"])) && !/competencyId/.test(code("src/lib/tasks.ts")) && !/competencyId/.test(code("src/lib/today-board.ts")),
    readers.join(", ")
  );

  // The Seal (D9): a tier crossed is one competency-tier Seal, no amount; a link's history plays nothing.
  const part = (hours: number, tier: number): ProgressData => ({ parts: ["competencies"], competencies: { rows: [{ id: "sk1", name: "Writing", hours, tier, line: hoursLineOf({ minutes: hours * 60, ticks: 1, walks: 0 }) }] } });
  const up = diffProgress(part(99.5, 1), part(100.25, 2));
  const jump = diffProgress(part(480, 1), part(510, 3));
  const flat = diffProgress(part(120, 2), part(121, 2));
  const drop = diffProgress(part(101, 2), part(99, 1));
  const fresh = diffProgress({ parts: ["competencies"], competencies: { rows: [] } }, part(150, 2));
  check(
    "a tick across 100 h is one Seal 'competency:<id>:t2' at the ladder's T2, numeral 1 → 2, with no amount (a tier pays no XP or MP), and honest",
    up.length === 1 && up[0].kind === "competency-tier" && up[0].dedupeKey === skillSealKey("sk1", 2) && up[0].tier === 2 && KIND_TIER["competency-tier"] === 2 &&
      (up[0].facts.amounts ?? []).length === 0 && up[0].facts.numeral?.from === 1 && up[0].facts.numeral?.to === 2 && honestyProblem(draftToEvent(up[0], "x")) === null &&
      up[0].what.some((w) => w.value === "Tier 1 → Tier 2"),
    JSON.stringify(up[0]?.facts)
  );
  check(
    "a skipped tier is claimed (T1 → T3 plays t3, claims t2); a tier held, a tier lost (an undo, an unlink) and a new skill play nothing",
    jump.length === 1 && jump[0].dedupeKey === skillSealKey("sk1", 3) && JSON.stringify(jump[0].claims) === JSON.stringify([skillSealKey("sk1", 2)]) && flat.length === 0 && drop.length === 0 && fresh.length === 0
  );
  const detect = readCode("src/lib/celebration-detect.ts");
  const snap = readCode("src/lib/snapshot.ts");
  const walkSrc = readCode("src/lib/exercise-server.ts");
  check(
    "the tick and the walk take the competencies part (and only they, with `all`); the snapshot reads competency-server's own readSkillsPart under 'life', 'activity', 'exercise' and 'roadmap'",
    (SNAPSHOT_SCOPES.tick as readonly string[]).includes("competencies") &&
      !(SNAPSHOT_SCOPES.settle as readonly string[]).includes("competencies") &&
      !(SNAPSHOT_SCOPES.review as readonly string[]).includes("competencies") &&
      /const WALK_PARTS: readonly SnapshotPart\[\] = \[[^\]]*"competencies"\];/.test(walkSrc) &&
      /const WALK_PARTS_LINKED: readonly SnapshotPart\[\] = \[[^\]]*"competencies"\];/.test(walkSrc) &&
      /competencies: \["life", "activity", "exercise", "roadmap"\],/.test(snap) &&
      /competencies: \(\) => readSkillsPart\(userId\),/.test(snap) &&
      /if \(both\("competencies"\)\) out\.push\(\.\.\.detectCompetencies\(before\.competencies!, after\.competencies!\)\);/.test(detect)
  );

  // The Status card: each attribute counts its live skills; a count moves no level.
  const launchedLife = lifeTracksView({ epochDay: "2026-10-01", xpByDay: [{ track: "CRAFT", day: "2026-10-05", xp: 300 }], compositions: [], weeks: [], mints: [] }, "2026-10-24", "2026-10-01");
  const knowledge = knowledgeRow([{ name: "Economics", level: 8 }], []);
  const counted = statusPanelOf(launchedLife, knowledge, null, [{ attribute: "CRAFT" }, { attribute: "CRAFT" }, { attribute: "INTELLECT" }, { attribute: "VITALITY" }]);
  const none = statusPanelOf(launchedLife, knowledge, null);
  const before = statusPanelOf(notLaunchedView("2026-10-24"), knowledge, null, [{ attribute: "CRAFT" }, { attribute: "INTELLECT" }]);
  const byKey = (p: typeof counted) => Object.fromEntries(p.rows.map((r) => [r.key, r.skills]));
  check(
    "statusPanelOf's fourth input counts each shown row's live skills (none without it); before life counts only Intellect's row shows, so only its skills are counted; the levels never move",
    counted.launched &&
      JSON.stringify(byKey(counted)) === JSON.stringify({ VITALITY: 1, INTELLECT: 1, CRAFT: 2, DUTY: 0, CARE: 0 }) &&
      none.rows.every((r) => r.skills === 0) &&
      JSON.stringify(byKey(before)) === JSON.stringify({ INTELLECT: 1 }) &&
      JSON.stringify(counted.rows.map((r) => r.level)) === JSON.stringify(none.rows.map((r) => r.level)) &&
      JSON.stringify(skillCountsOf([{ attribute: "CRAFT" }, { attribute: "CRAFT" }])) === JSON.stringify({ VITALITY: 0, INTELLECT: 0, CRAFT: 2, DUTY: 0, CARE: 0 }),
    JSON.stringify(byKey(counted))
  );
  const card = readCode("src/components/home/StatusPanel.tsx");
  const you = readCode("src/app/you/page.tsx");
  check(
    "the card shows each row's count under its targets ('2 skills ›', a link to You › Skills, nothing with none), and /you passes the skills it read (a failed read counts none)",
    /<TargetLines targets=\{r\.targets\} \/>\s*<SkillCount count=\{r\.skills\} \/>/.test(card) &&
      /<Link className="status-skills t-meta" href=\{SKILLS_PATH\}>/.test(card) &&
      /const skillsRead = loadSkills\(userId, \{ fields: false \}\)\.catch\(\(\) => null\);/.test(you) &&
      // Re-pinned for P28: the conditions are the panel's fifth input (null while condition decay is off).
      /const status = statusPanelOf\(s\.life, s\.knowledge, avatar, skills \? skills\.skills : null, basis \? attributeConditionsOf\(basis\) : null\);/.test(you) &&
      skillCountLabel(1) === "1 skill" && skillCountLabel(2) === "2 skills"
  );
  check(
    "You › Skills is the profile menu's second row (/you/skills, titled You · Skills), its page reads loadSkillsPage, and the drawer's link control is CompetencyLink (never on a work tab)",
    PROFILE.subs[1]?.href === SKILLS_PATH && PROFILE.subs[1]?.label === "Skills" && activeSub(SKILLS_PATH) === SKILLS_PATH && JSON.stringify(titleFor(SKILLS_PATH)) === JSON.stringify({ eyebrow: "You", title: "Skills" }) &&
      // Re-pinned for P28: the page reads the user once, for the skills and their conditions (none while decay is off).
      /const userId = getCurrentUserId\(\);[\s\S]*?const page = await loadSkillsPage\(userId\);/.test(readCode("src/app/you/skills/page.tsx")) &&
      /\{!props\.work && !props\.noMonth && <CompetencyLink key=\{t\.id\} templateId=\{t\.id\} \/>\}/.test(readCode("src/components/today/TaskDrawer.tsx"))
  );
  // The P5 review: the feeds line names what its count counts.
  const board = readCode("src/components/home/CompetencyBoard.tsx");
  check(
    "a skill's feeds line names the ticks counted at their task's estimate as ticks, and why (no size recorded), apart from the hours line's task estimates",
    estimatedTicksLine(1) === "1 tick counted at its task's current estimate (no size recorded)" &&
      estimatedTicksLine(3) === "3 ticks counted at their task's current estimate (no size recorded)" &&
      /if \(s\.estimated > 0\) parts\.push\(estimatedTicksLine\(s\.estimated\)\);/.test(board) &&
      !/at the task's estimate`/.test(board)
  );
  // The P5 review (WCAG 2.5.3, Label in Name): a button's accessible name starts with the words it shows.
  const avatarEditor = readCode("src/components/home/AvatarEditor.tsx");
  check(
    "each button whose words change says them first in its accessible name: Edit/Close, Archive/Archive it? (a skill's and a target's), Make it a skill",
    /aria-label=\{editing \? `Close \$\{s\.name\}` : `Edit \$\{s\.name\}`\}>\s*\{editing \? "Close" : "Edit"\}/.test(board) &&
      /aria-label=\{armed \? `Archive it\? \$\{s\.name\}` : `Archive \$\{s\.name\}`\}>\s*\{armed \? "Archive it\?" : "Archive"\}/.test(board) &&
      /aria-label=\{`Make it a skill: \$\{s\.name\}`\}>\s*Make it a skill\s*</.test(board) &&
      /aria-label=\{armed === t\.id \? `Archive it\? \$\{t\.label\}` : `Archive \$\{t\.label\}`\}>\s*\{armed === t\.id \? "Archive it\?" : "Archive"\}/.test(avatarEditor) &&
      ![board, avatarEditor].some((c) => /aria-label=\{`(?:Make \$\{|Archive \$\{[\w.]+\}\?)/.test(c))
  );
  // The P5 review: the two selects that write on change keep focus (never disabled while saving) and write a settled pick.
  const link = readCode("src/components/today/CompetencyLink.tsx");
  const settle = readCode("src/components/ui/useSettledPick.ts");
  check(
    "the drawer's Skill pick and the roadmaps' picks stay enabled while saving (aria-busy instead), write once a pick settles, and show only the latest pick's reply (useSettledPick)",
    /useSettledPick\(/.test(link) &&
      /<select id=\{id\} className="today-input" value=\{shown \?\? own\} onChange=\{\(e\) => choose\(e\.target\.value\)\} disabled=\{!data\.writesOn\}>/.test(link) &&
      /aria-busy=\{shown !== undefined\}/.test(link) &&
      /if \(!latest\(\)\) return;/.test(link) &&
      /useSettledPick\(/.test(board) &&
      /value=\{chosen\[r\.id\] \?\? r\.competencyId \?\? ""\} onChange=\{\(e\) => link\(r\.id, e\.target\.value\)\} disabled=\{!data\.writesOn\}>/.test(board) &&
      /aria-busy=\{chosen\[r\.id\] !== undefined\}/.test(board) &&
      /export const PICK_SETTLE_MS = \d+;/.test(settle) &&
      /setTimeout\(\(\) => \{\s*queued\.current\.delete\(key\);\s*void run\(key, value, n\);\s*\}, PICK_SETTLE_MS\);/.test(settle) &&
      /const latest = \(\) => seq\.current\.get\(key\) === n;/.test(settle) &&
      ![link, board].some((c) => /<select[^>]*disabled=\{pending/.test(c))
  );
  const rulesFlat = readCode("src/app/today/rules/page.tsx").replace(/\s+/g, " ");
  check(
    "the rules page says skills pay nothing (Ground rules, after the targets), with no number typed",
    /Skills pay nothing: a skill&apos;s hours are read from the minutes of the ticks linked to it, and a tier-up is a Seal, never XP, MP or a level\./.test(rulesFlat) &&
      rulesFlat.indexOf("Avatar targets pay nothing") < rulesFlat.indexOf("Skills pay nothing")
  );
  // The phone reads them through GET /status and POST /tasks/complete: its models and demo carry them.
  const ktModels = readCode("android/app/src/main/java/com/xtnl/app/data/Models.kt");
  const demo = readCode("android/app/src/main/java/com/xtnl/app/data/DemoApi.kt");
  check(
    "the phone: StatusPanel.skills (StatusSkill), StatusAttribute.skills, CompleteResult.competency (TickSkill) in Models.kt, and the demo sends skills and a tick's skill",
    /val skills: List<StatusSkill>\? = null,/.test(ktModels) &&
      /data class StatusSkill\(/.test(ktModels) &&
      /val skills: Int = 0,/.test(ktModels) &&
      /val competency: TickSkill\? = null,/.test(ktModels) &&
      /data class TickSkill\(/.test(ktModels) &&
      ["hours", "tier", "tierFrom", "tierTo", "progress", "toNext", "tierLine", "hoursAfter", "tierUp"].every((k) => new RegExp(`\\bval ${k}: `).test(ktModels)) &&
      /StatusSkill\(/.test(demo) &&
      /TickSkill\(/.test(demo)
  );
}

function theRule(): void {
  console.log("— the rule —");
  const targets = files.filter((f) => isTarget(f, STATUS_PREFIXES));
  const offenders = targets.flatMap((f) => offencesOf(f, code(f), writers).map((o) => `${f} ${o}`));
  check(
    "no avatar*, competency* or status-panel* file writes the ledger or imports a writer",
    offenders.length === 0,
    offenders.length ? offenders.join("; ") : targets.length ? `${targets.length} read: ${targets.join(", ")}` : "no such file yet (P1's status-panel, P4's avatar and P5's competency files land here)"
  );
}

// P4's and P5's cores are async (their fake stores), so the rule and the tally wait for them.
void (async () => {
  try {
    await avatarChecks();
  } catch (err) {
    check("the avatar section ran to the end", false, err instanceof Error ? err.stack ?? err.message : String(err));
  }
  try {
    await competencyChecks();
  } catch (err) {
    check("the skills section ran to the end", false, err instanceof Error ? err.stack ?? err.message : String(err));
  }
  theRule();
  console.log("");
  console.log(`status-check: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
