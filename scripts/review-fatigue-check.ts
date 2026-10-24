/**
 * Blueprint P30 (3.3b; decision D26; harm H8's safer variant): review fatigue, the cognitive breaker, behind
 * FATIGUE_LAUNCH_DAY. src/lib/review-fatigue.ts (the rule and its words), review-fatigue-server.ts (the apply after a
 * landed answer and the phone's read, through a stub client), srs.ts's hook, debuffs.ts's purge, the Review hub, the
 * rules page, the phone's replies and balance-horizon's block. Pure: no database, no network, no model; every launch
 * day is passed in, so it holds whatever FATIGUE_LAUNCH_DAY is and passes with the override on too. PASS/FAIL per line;
 * exits 1 on any failure.
 *
 *   npx tsx scripts/review-fatigue-check.ts      (npm run fatigue:check; life:check runs it after streak-mult-check)
 *
 *   §1 the switch: null in code, the XTNL_ override honoured only outside production, fatigueOn from the launch day
 *   §2 the debuff: the existing FATIGUED, unchanged (×0.5 of the combo ceiling for 18 h); the fold takes 10 to 5; the
 *      runner's label pays what it prints at that ceiling; MP's combo bonus reads the run, never the ceiling
 *   §3 the trigger: 199 answers apply nothing, 200 apply it, never twice a day, never while off
 *   §4 the apply: nothing read while off or with writes off; one wave (the day's REVIEW count and its key); exactly one
 *      row a day, its id the day's key, FATIGUED's own magnitude and 18 h; a race or any later answer writes nothing;
 *      a new day applies again; the life day turns at 04:00
 *   §5 never for a miss: a pass and a miss count alike and only as answers; a quiet or missed day applies nothing; a card
 *      forgotten while overdue (FORGET) is never counted; the only caller is a landed answer's after(); no other path
 *      applies FATIGUED; no sleep rule (no table read but the ledger and the debuffs)
 *   §6 the read and the purge: the phone's read (undefined while off, {until} | null on), fatiguedOf, the cron's purge
 *      keeping today's key
 *   §7 published: the rules page's card and the Review hub's card only while in force, every figure read from the code;
 *      the hub's note renders the rule and a count (never a target); the phone's replies (fatiguedKeyOf)
 *   §8 the economy and the package: balance-horizon's FATIGUE block only under the override and last; the scripts
 */
import "./_no-model";
import { readFileSync } from "node:fs";
import Module from "node:module";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ROOT, readCode, srcFiles } from "./_ledger-writers";
import { addDays, dateColumn, todayKey, type DayKey } from "../src/lib/life-day";
import { BREAKER_DEBUFFS, DEBUFF_META, type ActiveDebuffRow } from "../src/lib/debuff-meta";
import { NEUTRAL_MODIFIERS, foldDebuffs } from "../src/lib/skill-gates";
import { COMBO_CAP, comboMultiplier, reviewPayout } from "../src/lib/xp";
import { comboMasteryBonus } from "../src/lib/mastery";
import { comboView } from "../src/components/workspace/review-model";
import {
  FATIGUE_ANSWERS,
  FATIGUE_HOURS,
  FATIGUE_ID_PREFIX,
  FATIGUE_KIND,
  FATIGUE_LAUNCH_DAY,
  FATIGUE_LAUNCH_DAY_ENV,
  FATIGUE_MAGNITUDE,
  FATIGUE_REASON,
  fatigueCutPercent,
  fatigueDaySuffixOf,
  fatigueDueOf,
  fatigueHubCount,
  fatigueHubRule,
  fatigueIdOf,
  fatigueLaunchDay,
  fatigueOn,
  fatigueReasonOf,
  fatigueRuleLines,
  fatigueUntilOf,
  fatiguedComboCap,
  fatiguedOf,
} from "../src/lib/review-fatigue";
import { applyReviewFatigue, loadFatigue, type FatigueClient } from "../src/lib/review-fatigue-server";
import { fatiguedKeyOf } from "../src/lib/mobile-api";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const src = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

/** The fatigue's launch Monday in this check (any day: the code constant stays null until the user's go). */
const L: DayKey = "2026-10-26";
/** 10:00 Sydney (AEDT) on the launch day: well inside its life day. */
const NOW = new Date("2026-10-25T23:00:00Z");
const DAY = todayKey(NOW);

// ══ §1 the switch ═══════════════════════════════════════════════════════════

console.log("— §1 the switch —");
check("FATIGUE_LAUNCH_DAY is null in code: inert until the user's go", FATIGUE_LAUNCH_DAY === null);
check("the override's name", FATIGUE_LAUNCH_DAY_ENV === "XTNL_FATIGUE_LAUNCH_DAY");
check("production reads the constant only (an override there is ignored)", fatigueLaunchDay({ NODE_ENV: "production", XTNL_FATIGUE_LAUNCH_DAY: L }) === FATIGUE_LAUNCH_DAY);
check("outside production a valid override wins (trimmed)", fatigueLaunchDay({ NODE_ENV: "development", XTNL_FATIGUE_LAUNCH_DAY: ` ${L} ` }) === L);
check(
  "an invalid or blank override is ignored (the constant stands)",
  fatigueLaunchDay({ NODE_ENV: "development", XTNL_FATIGUE_LAUNCH_DAY: "2026-02-30" }) === FATIGUE_LAUNCH_DAY &&
    fatigueLaunchDay({ NODE_ENV: "development", XTNL_FATIGUE_LAUNCH_DAY: "  " }) === FATIGUE_LAUNCH_DAY &&
    fatigueLaunchDay({}) === FATIGUE_LAUNCH_DAY
);
check("fatigueOn: from its launch day only, never with none", fatigueOn(L, L) && fatigueOn(addDays(L, 30), L) && !fatigueOn(addDays(L, -1), L) && !fatigueOn(L, null));
check("the check's clock is the launch day's life day", DAY === L);

// ══ §2 the debuff ═══════════════════════════════════════════════════════════

console.log("— §2 the debuff: the existing FATIGUED, unchanged —");
const meta = DEBUFF_META.FATIGUED;
check(
  "FATIGUED's own table: magnitude 0.5 (max 0.6), 18 hours, its words say how it clears",
  meta.defaultMagnitude === 0.5 && meta.maxMagnitude === 0.6 && meta.durationHours === 18 && meta.clears === "Lifts on its own after 18 hours." && meta.effectText(0.5) === "Combo ceiling cut by 50%"
);
check("the rule reads that table: FATIGUED, ×0.5, 18 h, 200 answers", FATIGUE_KIND === "FATIGUED" && FATIGUE_MAGNITUDE === meta.defaultMagnitude && FATIGUE_HOURS === meta.durationHours && FATIGUE_ANSWERS === 200 && fatigueCutPercent() === 50);
const row = (over: Partial<ActiveDebuffRow> = {}): ActiveDebuffRow => ({ kind: "FATIGUED", magnitude: FATIGUE_MAGNITUDE, reason: fatigueReasonOf(DAY), expiresAt: fatigueUntilOf(NOW), ...over });
check(
  "the engine's fold takes the ceiling 10 → 5 (skill-gates foldDebuffs), and a raised ceiling halves too (18 → 9)",
  fatiguedComboCap() === 5 && foldDebuffs(NEUTRAL_MODIFIERS, [row()]).comboCap === 5 && fatiguedComboCap(18) === 9 && COMBO_CAP === 10
);
check(
  "a second row the same day is a refresh, never a stack: the fold keeps one worst magnitude",
  foldDebuffs(NEUTRAL_MODIFIERS, [row(), row({ expiresAt: new Date(NOW.getTime() + 1) })]).comboCap === 5
);
const labelPays = Array.from({ length: 15 }, (_, combo) => combo).every((combo) => {
  const v = comboView(combo, 5);
  return v.multiplier === reviewPayout(4, combo, 5, 1).comboMultiplier && v.multiplier === comboMultiplier(combo, 5) && v.multiplier <= comboMultiplier(5, 5);
});
check("the runner's combo label pays what it prints at the fatigued ceiling (×1.25 at most, from ×1.50)", labelPays && comboMultiplier(5, 5) === 1.25 && comboMultiplier(COMBO_CAP) === 1.5);
const srs = readCode("src/lib/srs.ts");
check(
  "MP's combo bonus reads the run, never the ceiling: comboMasteryBonus(combo) takes no cap, and srs.ts mints it from the answer's combo",
  comboMasteryBonus.length === 1 && /const fractionMultiplier = modifiers\.masteryMultiplier \* comboMasteryBonus\(combo\);/.test(srs)
);

// ══ §3 the trigger ══════════════════════════════════════════════════════════

console.log("— §3 the trigger: the day's answers reaching 200 —");
const due = (answers: number, applied = false, on = true) => fatigueDueOf({ on, answers, applied });
check("0 to 199 answers apply nothing", Array.from({ length: FATIGUE_ANSWERS }, (_, n) => n).every((n) => !due(n)));
check("200 apply it, and so does any count past it (a check that could not run is caught up by the next)", due(200) && due(201) && due(1000));
check("never twice a day: applied already, nothing", !due(200, true) && !due(5000, true));
check("never while off", !due(200, false, false) && !due(10_000, false, false));
check("a count that is not a number applies nothing", !due(Number.NaN) && !due(Number.POSITIVE_INFINITY));

// ══ §4 the apply ════════════════════════════════════════════════════════════

console.log("— §4 the apply: once a day, keyed by the day —");
interface Call {
  op: "count" | "findUnique" | "create" | "findFirst";
  args: Record<string, unknown>;
}
/** A stub of the two tables the server touches: a per-day answer count, the keyed rows, an optional create failure. */
function stub(o: { answers?: (day: string) => number; createError?: unknown; latest?: Date | null } = {}) {
  const calls: Call[] = [];
  const rows = new Map<string, Record<string, unknown>>();
  const client = {
    activityEvent: {
      count: async (args: { where: { day: Date } }) => {
        calls.push({ op: "count", args });
        return (o.answers ?? (() => 0))(args.where.day.toISOString().slice(0, 10));
      },
    },
    activeDebuff: {
      findUnique: async (args: { where: { id: string } }) => {
        calls.push({ op: "findUnique", args });
        return rows.has(args.where.id) ? { id: args.where.id } : null;
      },
      create: async (args: { data: Record<string, unknown> }) => {
        calls.push({ op: "create", args });
        if (o.createError) throw o.createError;
        if (rows.has(String(args.data.id))) throw Object.assign(new Error("Unique constraint failed on the fields: (`id`)"), { code: "P2002" });
        rows.set(String(args.data.id), args.data);
        return args.data;
      },
      findFirst: async (args: Record<string, unknown>) => {
        calls.push({ op: "findFirst", args });
        return o.latest ? { expiresAt: o.latest } : null;
      },
    },
  } as unknown as FatigueClient;
  return { client, calls, rows };
}
const on = (extra: { writes?: boolean } = {}) => {
  const tags: string[] = [];
  return { opts: { launch: L, writes: true, invalidate: (t: "progress") => tags.push(t), ...extra }, tags };
};

void (async () => {
  {
    const s = stub({ answers: () => 500 });
    const off = await applyReviewFatigue(s.client, "u1", NOW, { launch: null, writes: true });
    const before = await applyReviewFatigue(s.client, "u1", NOW, { launch: addDays(L, 1), writes: true });
    const shut = await applyReviewFatigue(s.client, "u1", NOW, { launch: L, writes: false });
    check("off (no launch day), before it, or with writes off: nothing read, nothing written", off.status === "off" && before.status === "off" && shut.status === "writes-off" && s.calls.length === 0);
    const asShipped = await applyReviewFatigue(s.client, "u1", NOW);
    check("as shipped (FATIGUE_LAUNCH_DAY null, no override): off, with no read", FATIGUE_LAUNCH_DAY !== null || process.env[FATIGUE_LAUNCH_DAY_ENV] !== undefined || (asShipped.status === "off" && s.calls.length === 0));
  }
  {
    const s = stub({ answers: () => FATIGUE_ANSWERS - 1 });
    const { opts, tags } = on();
    const r = await applyReviewFatigue(s.client, "u1", NOW, opts);
    check("199 answers: one wave read (the count and the key), nothing written", r.status === "under" && same(s.calls.map((c) => c.op), ["count", "findUnique"]) && s.rows.size === 0 && tags.length === 0, JSON.stringify(r));
    check(
      "the count is the day's REVIEW rows, nothing else: { userId, source: 'REVIEW', day } (no result, xp or outcome filter)",
      same(s.calls[0].args, { where: { userId: "u1", source: "REVIEW", day: dateColumn(DAY) } })
    );
  }
  {
    const s = stub({ answers: () => FATIGUE_ANSWERS });
    const { opts, tags } = on();
    const r = await applyReviewFatigue(s.client, "u1", NOW, opts);
    const created = s.calls.filter((c) => c.op === "create").map((c) => c.args.data);
    check(
      "200 answers: one FATIGUED row, its id the day's key, FATIGUED's magnitude, 18 h from the answer, the source and day as its reason",
      r.status === "applied" &&
        same(created, [{ id: `fatigue:u1:${DAY}`, userId: "u1", kind: "FATIGUED", magnitude: 0.5, reason: `REVIEW_VOLUME:${DAY}`, expiresAt: new Date(NOW.getTime() + 18 * 3_600_000) }]) &&
        fatigueIdOf("u1", DAY) === `${FATIGUE_ID_PREFIX}u1:${DAY}` &&
        fatigueReasonOf(DAY) === `${FATIGUE_REASON}:${DAY}`,
      JSON.stringify(created)
    );
    check("the progression is told once (invalidate 'progress'), so the next answer's ceiling reads it", same(tags, ["progress"]));
    const again = await Promise.all([201, 250, 300].map(() => applyReviewFatigue(s.client, "u1", new Date(NOW.getTime() + 60_000), opts)));
    check(
      "exactly once a day: every later answer's check finds the day's key and writes nothing",
      again.every((a) => a.status === "already") && s.calls.filter((c) => c.op === "create").length === 1 && s.rows.size === 1 && same(tags, ["progress"])
    );
    const tomorrow = new Date(NOW.getTime() + 24 * 3_600_000);
    const next = await applyReviewFatigue(s.client, "u1", tomorrow, opts);
    check("a new life day is a new key: it can apply again the next day, once", next.status === "applied" && s.rows.has(fatigueIdOf("u1", addDays(DAY, 1))) && s.rows.size === 2);
  }
  {
    // A day answer by answer: the count grows with each landed answer, every answer's check runs; one row, at the 200th.
    let n = 0;
    const s = stub({ answers: () => n });
    const { opts } = on();
    const statuses: string[] = [];
    for (let i = 0; i < 300; i++) {
      n += 1;
      statuses.push((await applyReviewFatigue(s.client, "u1", new Date(NOW.getTime() + i * 10_000), opts)).status);
    }
    check(
      "a day of 300 answers: nothing for the first 199, applied by the 200th, then already for every one after",
      statuses.slice(0, 199).every((x) => x === "under") && statuses[199] === "applied" && statuses.slice(200).every((x) => x === "already") && s.rows.size === 1
    );
  }
  {
    // A race: two checks both read no key; the second create fails its primary key (P2002) and writes nothing.
    const s = stub({ answers: () => FATIGUE_ANSWERS, createError: Object.assign(new Error("Unique constraint failed"), { code: "P2002" }) });
    const { opts, tags } = on();
    const r = await applyReviewFatigue(s.client, "u1", NOW, opts);
    check("a race lost on the day's key is 'already', never a throw, never a second tell", r.status === "already" && tags.length === 0);
    const boom = stub({ answers: () => FATIGUE_ANSWERS, createError: new Error("connection reset") });
    let threw = false;
    try {
      await applyReviewFatigue(boom.client, "u1", NOW, opts);
    } catch {
      threw = true;
    }
    check("any other write failure is the caller's to log (srs.ts catches it after the answer's reply)", threw);
  }
  {
    // The life day turns at 04:00: an answer at 03:59 counts for the day before, at 04:00 for the new one.
    const before4 = new Date("2026-10-26T16:59:00Z"); // 03:59 AEDT on 27 Oct
    const after4 = new Date("2026-10-26T17:00:00Z"); // 04:00 AEDT on 27 Oct
    const s = stub({ answers: () => FATIGUE_ANSWERS });
    const { opts } = on();
    await applyReviewFatigue(s.client, "u1", before4, opts);
    await applyReviewFatigue(s.client, "u1", after4, opts);
    check("keyed by the life day (04:00): 03:59 belongs to the day before, 04:00 to the new day", todayKey(before4) === "2026-10-26" && todayKey(after4) === "2026-10-27" && s.rows.has(fatigueIdOf("u1", "2026-10-26")) && s.rows.has(fatigueIdOf("u1", "2026-10-27")));
  }

  // ══ §5 never for a miss ═══════════════════════════════════════════════════

  console.log("— §5 never for a miss, a quiet day or sleep —");
  {
    const s = stub({ answers: () => 0 });
    const { opts } = on();
    const quiet = await applyReviewFatigue(s.client, "u1", NOW, opts);
    check("a quiet day (no answers) or a missed day applies nothing", quiet.status === "under" && s.rows.size === 0);
  }
  const apply = srs.slice(srs.indexOf("export async function applyReviewResult"), srs.indexOf("export async function degradeOverdueIdeas"));
  check(
    "the only call is a landed answer's after(), once its row (a pass's in the transaction, a miss's just above) is in; it takes no result",
    /after\(async \(\) => \{\s*if \(lateOutcome\) \{\s*await recordActivity\([^\n]*\);\s*\}\s*if \(landed\) \{\s*await applyReviewFatigue\(prisma, userId, now\)\.catch\(/.test(apply)
  );
  const callers = srcFiles().filter((f) => /\bapplyReviewFatigue\(/.test(readCode(f)) && f !== "src/lib/review-fatigue-server.ts");
  check("no other caller: not the degrade cron (forgotten cards), not settlement (missed musts), not a page", same(callers, ["src/lib/srs.ts"]), callers.join(", "));
  const fatiguedElsewhere = srcFiles().filter((f) => /applyDebuff\([^)]*["']FATIGUED["']/.test(readCode(f)) || (/kind: (FATIGUE_KIND|"FATIGUED")/.test(readCode(f)) && /activeDebuff\.create/.test(readCode(f)) && f !== "src/lib/review-fatigue-server.ts"));
  check("nothing else applies FATIGUED (no applyDebuff of it, no other create of the kind)", fatiguedElsewhere.length === 0, fatiguedElsewhere.join(", "));
  check(
    "a forgotten card is a FORGET row, never REVIEW: the unattended degrade writes FORGET only",
    /source: "FORGET",/.test(srs.slice(srs.indexOf("export async function degradeOverdueIdeas"))) && !/source: "REVIEW"/.test(srs.slice(srs.indexOf("export async function degradeOverdueIdeas")))
  );
  const server = readCode("src/lib/review-fatigue-server.ts");
  check(
    "no sleep rule: the fatigue reads and writes only the ledger's count and the debuff rows (no other table, no sleep or health data)",
    /export type FatigueClient = Pick<PrismaClient, "activityEvent" \| "activeDebuff">;/.test(server) && !/sleep|health|exercise|workout/i.test(server.replace(/\/\*[\s\S]*?\*\//g, ""))
  );
  check("every new write sits behind lifeWritesEnabled (dev and prod share one database)", /if \(!\(opts\.writes \?\? lifeWritesEnabled\(\)\)\) return \{ status: "writes-off" \};/.test(server));

  // ══ §6 the read and the purge ══════════════════════════════════════════════

  console.log("— §6 the phone's read, fatiguedOf and the purge —");
  {
    const s = stub({ latest: new Date(NOW.getTime() + 3_600_000) });
    const off = await loadFatigue(s.client, "u1", NOW, { launch: null });
    check("off: undefined at once, with no read", off === undefined && s.calls.length === 0);
    const lit = await loadFatigue(s.client, "u1", NOW, { launch: L });
    check(
      "on: the FATIGUED row in effect that lifts last, as {until}",
      same(lit, { until: new Date(NOW.getTime() + 3_600_000) }) && same(s.calls[0].args, { where: { userId: "u1", kind: "FATIGUED", expiresAt: { gt: NOW } }, orderBy: { expiresAt: "desc" }, select: { expiresAt: true } })
    );
    const none = await loadFatigue(stub({ latest: null }).client, "u1", NOW, { launch: L });
    check("on with none in effect: null", none === null);
  }
  check(
    "fatiguedOf: the unexpired FATIGUED row that lifts last; another kind or an expired one is none",
    same(fatiguedOf([row({ expiresAt: new Date(NOW.getTime() + 10) }), row({ expiresAt: new Date(NOW.getTime() + 99) }), { kind: "SHAKEN", magnitude: 0.25, reason: "BOSS_DEFEAT", expiresAt: new Date(NOW.getTime() + 999) }], NOW), { until: new Date(NOW.getTime() + 99) }) &&
      fatiguedOf([row({ expiresAt: NOW })], NOW) === null &&
      fatiguedOf([], NOW) === null
  );
  const debuffs = readCode("src/lib/debuffs.ts");
  check(
    "the cron's purge keeps today's fatigue row while today lasts (its id is the once-a-day key); every other expired row goes as before",
    /const today = \{ startsWith: FATIGUE_ID_PREFIX, endsWith: fatigueDaySuffixOf\(todayKey\(now\)\) \};/.test(debuffs) &&
      /deleteMany\(\{ where: \{ expiresAt: \{ lte: now \}, NOT: \{ id: today \} \} \}\)/.test(debuffs) &&
      fatigueIdOf("u1", DAY).startsWith(FATIGUE_ID_PREFIX) &&
      fatigueIdOf("u1", DAY).endsWith(fatigueDaySuffixOf(DAY)) &&
      !fatigueIdOf("u1", addDays(DAY, -1)).endsWith(fatigueDaySuffixOf(DAY))
  );
  check("a fatigue id never looks like a cuid (the purge's pattern can match no other row)", /:/.test(fatigueIdOf("u1", DAY)) && !/^c[a-z0-9]{20,}$/.test(fatigueIdOf("u1", DAY)));

  // ══ §7 published ═══════════════════════════════════════════════════════════

  console.log("— §7 the rules page, the Review hub and the phone —");
  const lines = fatigueRuleLines();
  check(
    "the rules page's lines read every figure from the code: 200 answers, 50%, 18 hours, 10 → 5, ×1.25 for ×1.50; no sleep rule; the knee stays life's",
    lines.length === 4 &&
      lines[0].includes(`reach ${FATIGUE_ANSWERS}`) &&
      lines[0].includes(`${fatigueCutPercent()}% for ${FATIGUE_HOURS} hours`) &&
      lines[0].includes(`from ${COMBO_CAP} answers in a row to ${fatiguedComboCap()}`) &&
      lines[0].includes("×1.25 instead of ×1.50") &&
      /at most once a day/.test(lines[1]) &&
      /right or wrong/.test(lines[2]) && /a miss is never the reason/.test(lines[2]) && /There is no sleep rule\./.test(lines[2]) &&
      /never a card's level or schedule, life XP, MP or a streak/.test(lines[3]) && /daily knee/.test(lines[3]),
    lines.join(" | ")
  );
  check("never-shaming words: no 'lazy', 'fail', 'should' or 'must' in the rule or the hub", !/lazy|fail|should|\bmust\b/i.test([...lines, fatigueHubRule()].join(" ")));
  const rules = src("src/app/today/rules/page.tsx");
  check(
    "the rules page renders its Fatigue card only while FATIGUE_LAUNCH_DAY is in force, its lines fatigueRuleLines()",
    /const fatigueLive = fatigueLaunch != null && fatigueOn\(today, fatigueLaunch\);/.test(rules) &&
      /\{fatigueLive && fatigueLaunch && <FatigueRules launchDay=\{fatigueLaunch\} \/>\}/.test(rules) &&
      /\{fatigueRuleLines\(\)\.map\(\(line\) => \(/.test(rules)
  );
  const fatigueCard = rules.slice(rules.indexOf("function FatigueRules("), rules.indexOf("\n}\n", rules.indexOf("function FatigueRules(")));
  check("the Fatigue card types no number by hand", fatigueCard.length > 100 && !/\d/.test(fatigueCard.replace(/\{[^}]*\}/g, "").replace(/<[^>]*>/g, "")));
  const page = src("src/app/review/page.tsx");
  check(
    "the Review hub publishes it only while in force: the page passes `fatigue` only then (today's answers, the row in effect from the progression it read)",
    /const fatigue: FatigueSummary \| null = fatigueOn\(today\) \? \{ answers: day\.reviews, until: fatiguedOf\(progression\.debuffs, now\)\?\.until \?\? null \} : null;/.test(page) &&
      /\{\.\.\.\(fatigue \? \{ fatigue \} : \{\}\)\}/.test(page)
  );
  const view = src("src/components/workspace/WorkspaceView.tsx");
  check("the hub draws its card after the effects card, and only with the prop", /<EffectsCard effects=\{effects\} \/>\s*\{fatigue && <FatigueNote fatigue=\{fatigue\} \/>\}/.test(view));
  // The hub's components reach the glyph's stylesheet: a stylesheet is nothing here.
  (Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
    m.exports = {};
  };
  const { EffectsCard, FatigueNote } = await import("../src/components/workspace/ReviewHub");
  const html = renderToStaticMarkup(createElement(FatigueNote, { fatigue: { answers: 142, until: null } }));
  const htmlOn = renderToStaticMarkup(createElement(FatigueNote, { fatigue: { answers: 214, until: new Date("2026-10-26T05:00:00Z") } }));
  check(
    "the hub's card: 'Fatigue breaker', the rule in review-fatigue's words, then a count (never 'of 200': a count is not a target)",
    html.includes("Fatigue breaker") && html.includes(fatigueHubRule().replace(/'/g, "&#x27;")) && html.includes("142 answers today.") && !/of 200/.test(html),
    html
  );
  check("in effect, the card says when it lifts (the penalty row above says the rest)", /Fatigued until 26 Oct, 16:00; answers still pay review points\./.test(htmlOn), htmlOn);
  check("the count's words: 1 answer, 0 answers, never negative", fatigueHubCount(1) === "1 answer today." && fatigueHubCount(0) === "0 answers today." && fatigueHubCount(-3) === "0 answers today.");
  // Review (H8, never shaming): Fatigued is a breaker that lifts by itself, never a thing owed, so its row in the hub's
  // effects card (and on /skills and You › Loadout) is held, with the rest glyph and its word; every other penalty keeps owed.
  const penalty = (kind: string, label: string) => ({ kind, label, effect: "e", clears: "c", until: new Date(NOW.getTime() + 3_600_000) });
  const fx = renderToStaticMarkup(createElement(EffectsCard, { effects: { lines: [], boons: [], penalties: [penalty(FATIGUE_KIND, meta.label), penalty("STAGNATION", "Stagnation")] } }));
  check(
    "the effects card draws Fatigued held (the rest glyph and its word), never in owed's colour; Stagnation stays owed",
    /<span class="chip held"><svg class="sig"[^>]*><use href="#h-rest"><\/use><\/svg>Fatigued<\/span>/.test(fx) && /<span class="chip owed">Stagnation<\/span>/.test(fx) && !/chip owed">Fatigued/.test(fx),
    fx
  );
  check(
    "Fatigued is the one breaker (debuff-meta BREAKER_DEBUFFS), read by the hub and by ActiveEffects alike",
    same([...BREAKER_DEBUFFS], ["FATIGUED"]) &&
      /BREAKER_DEBUFFS\.has\(p\.kind\) \? \(\s*<Chip tone="held" held="rest">/.test(src("src/components/workspace/ReviewHub.tsx")) &&
      /BREAKER_DEBUFFS\.has\(d\.kind\) \? \(\s*<Chip tone="held" held="rest">/.test(src("src/components/skills/ActiveEffects.tsx"))
  );
  const hub = src("src/components/workspace/ReviewHub.tsx");
  check("the hub's card uses the kit's tokens only (no colour of its own, no new tone)", /className="card rv-fatigue"/.test(hub) && (hub.match(/tone="owed"/g) ?? []).length === 1 && !/#[0-9a-f]{3,6}\b|rgb\(/i.test(src("src/components/workspace/review.css").slice(src("src/components/workspace/review.css").indexOf(".rv-fatigue"), src("src/components/workspace/review.css").indexOf(".rv-fatigue") + 200)));
  const until = new Date(NOW.getTime() + 3_600_000);
  check(
    "the phone: `fatigued` is absent while off, null with none, {until} in effect (fatiguedKeyOf)",
    same(fatiguedKeyOf(undefined), {}) && same(fatiguedKeyOf(null), { fatigued: null }) && same(fatiguedKeyOf({ until }), { fatigued: { until: until.toISOString() } })
  );

  // ══ §8 the economy and the package ═════════════════════════════════════════

  console.log("— §8 the economy and the package —");
  const bh = src("scripts/balance-horizon.ts");
  check(
    "balance-horizon: the FATIGUE block runs only under the override and prints last, so every block above reads as before",
    /const FATIGUE_ON = fatigueLaunchDay\(\) != null;/.test(bh) && /levelsBlock\(\) \+ \(FATIGUE_ON \? fatigueBlock\(total, perDay\) : 0\);/.test(bh) && /F3\. the MP horizon only lengthens/.test(bh)
  );
  const pkg = JSON.parse(src("package.json")) as { scripts: Record<string, string> };
  check("life:check runs this check right after streak-mult-check; npm run fatigue:check runs it alone", /tsx scripts\/streak-mult-check\.ts && tsx scripts\/review-fatigue-check\.ts && /.test(pkg.scripts["life:check"]) && pkg.scripts["fatigue:check"] === "tsx scripts/review-fatigue-check.ts");

  console.log(`\nreview-fatigue-check: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
