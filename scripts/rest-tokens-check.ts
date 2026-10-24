/**
 * Blueprint P21 (one Rest Token bank; decision D19; docs/life-plan/blueprint-plan-2026-10-22.md P21): the pins for the
 * phase. Pure: no database (readRestTokens runs against an in-memory stub client), no clock, no network, no model.
 * PASS/FAIL per line; exits 1 on any failure.
 *
 *   npx tsx scripts/rest-tokens-check.ts
 *
 *   §1 the bank is momentum's fold: rest-tokens.ts over a ledger is momentum-server runOf over it, byte for byte
 *      (chest freezes, Recovery and Spare flame per day), and with no FREEZE_USE and no rest day it is the fold of
 *      before P21; 2 banked at most, 3 with Spare flame, back to 2 after a respec
 *   §2 one owner: the fold and settlement on the same day spend one token, never two (an idle day of a live run, a
 *      dead run with a must missed, an active day with a must missed); at most one a day; the earned history unchanged
 *   §2b the run comes first (P21 review): a token the fold already gave a later day is not free (an empty next day,
 *      a 'Use a freeze' for yesterday), so settlement leaves it there; a capped miss takes none; the board's forecast
 *      of yesterday's musts ('free', 'if-today', 'none') is settlement's own rule
 *   §3 rest days and the edges: a rest day holds with no token; before the bank's launch there is none; the launch day
 *      opens with one; the summary's yesterday (the token it can take, the bank after it)
 *   §4 the read: readRestTokens' sources and SQL are momentum-server's own; no RestDay read and no FREEZE_USE counted
 *      while Duty is off (P21 review: the spends count from the Duty launch day, as rest days do); settlement reads
 *      the bank through yesterday; null
 *      before the launch; every reader of a freeze balance goes through it; nothing writes FREEZE_EARN any more; the
 *      bank's modules write nothing and never touch credits
 *   §5 the surfaces: the chip's words; Character's streak card draws it; Today's Daily quests chip; the rules entry is
 *      read from code; the mobile contract (streak.restTokens) and the Android app (both displays, versionCode)
 */
import "./_no-model";
import Module from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { addDays, dayEndOf, dateColumn, type DayKey } from "../src/lib/life-day";
import { DUTY_LAUNCH_DAY, validateDutyLaunchDay } from "../src/lib/duty-economy";
import { LIFE_LAUNCH_DAY } from "../src/lib/life-economy";
import { MOMENTUM, MOMENTUM_START_FREEZES, foldMomentum, momentumDays, perkRowKey } from "../src/lib/momentum";
import {
  REST_TOKENS_PER_DAY,
  REST_TOKENS_WORD,
  restTokenBefore,
  restTokenFold,
  restTokenFreeOn,
  restTokenInputsOf,
  restTokenSpendFrom,
  restTokenSummaryOf,
  restTokensText,
  withSpent,
  type RestTokenInputs,
} from "../src/lib/rest-tokens";
import { readRestTokens, type RestTokenClient } from "../src/lib/rest-tokens-server";
import { runOf, type LedgerRow, type MomentumLedger } from "../src/lib/momentum-server";
import { planSettlement, type SettlementState, type SettlementTemplate } from "../src/lib/settlement-plan";
import { streakOf } from "../src/lib/mobile-api";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}
const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const L: DayKey = "2026-10-12";
const d = (n: number): DayKey => addDays(L, n);
const lastInstant = (day: DayKey) => new Date(dayEndOf(day).getTime() - 1);
let seq = 0;
function lrow(day: DayKey, source: string, over: Partial<LedgerRow> = {}): LedgerRow {
  seq += 1;
  return { id: `r${seq}`, day, occurredAt: new Date(dayEndOf(day).getTime() - 3_600_000), source, sink: "NONE", track: null, templateId: null, sourceId: null, xp: 0, rawXp: null, qty: null, countsForStreak: false, receipt: null, detail: null, dedupeKey: null, ...over };
}
const unitsOn = (days: DayKey[]) => new Map(days.map((x) => [x, 1]));
const span = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => d(a + i));
const ledger = (o: Partial<MomentumLedger> & { units: Map<DayKey, number> }): MomentumLedger => ({ launch: L, chests: [], perkRows: [], paid: [], bodyKept: new Set(), mints: [], ...o });
const inputsOfLedger = (L0: MomentumLedger, through: DayKey) =>
  restTokenInputsOf({ launch: L0.launch, through, units: L0.units, chests: L0.chests, perkRows: L0.perkRows, bodyKept: L0.bodyKept, spent: L0.spent, rest: L0.rest });

// ── §1 the bank is momentum's fold ──────────────────────────────────────
console.log("§1 the bank is momentum's fold");
{
  const chest = lrow(d(3), "CHEST", { receipt: { v: "chest-1", u1: 0.95, u2: 0.2, tier: "RARE", item: "FREEZE", xp: 0, mp: 0, freeze: true, cosmetic: null, pity: false, sinceRare: 0 } });
  const spare = lrow(d(5), "PERK", { detail: "D_SPARE", dedupeKey: perkRowKey("D_SPARE", 0) });
  const recover = lrow(d(5), "PERK", { detail: "V_RECOVER", dedupeKey: perkRowKey("V_RECOVER", 0) });
  const active = span(0, 40).filter((x) => x !== d(8) && x !== d(20) && x !== d(21));
  const L0 = ledger({ units: unitsOn(active), chests: [chest], perkRows: [spare, recover], bodyKept: new Set([d(13), d(27)]) });
  const through = d(40);
  check("rest-tokens over a ledger is momentum-server runOf over it, byte for byte (chest freeze, Spare flame, Recovery)", same(restTokenFold(inputsOfLedger(L0, through), through), runOf(L0, through)), JSON.stringify(restTokenFold(inputsOfLedger(L0, through), through)));
  // The pre-P21 fold, restated (momentum-server runOf as it stood): with no FREEZE_USE and no rest day the bank is it.
  const owned = (day: DayKey) => [spare, recover].filter((r) => r.occurredAt.getTime() <= lastInstant(day).getTime()).map((r) => r.detail);
  const before = foldMomentum(
    momentumDays(through, L),
    through,
    (x) => active.includes(x),
    (x) => (x === d(3) ? 1 : 0) + ((x === d(13) || x === d(27)) && owned(x).includes("V_RECOVER") ? 1 : 0),
    (x) => (owned(x).includes("D_SPARE") ? 3 : MOMENTUM.FREEZE_MAX),
    { startBank: MOMENTUM_START_FREEZES }
  );
  const now = restTokenFold(inputsOfLedger(L0, through), through);
  check("with no FREEZE_USE and no rest day the bank is the fold of before P21 (the earned history unchanged)", same(before, now) && now.earned === before.earned, JSON.stringify({ before, now }));
  const plain = (n: number) => restTokenFold(restTokenInputsOf({ launch: L, through: d(n), units: unitsOn(span(0, n)), chests: [], perkRows: [], bodyKept: new Set() }), d(n));
  check(`the bank is ${MOMENTUM.FREEZE_MAX}: 60 momentum days from a start of ${MOMENTUM_START_FREEZES} hold ${MOMENTUM.FREEZE_MAX}, and the earns past it are lost`, plain(60).bank === 2 && MOMENTUM.FREEZE_MAX === 2 && plain(60).earned === 1, JSON.stringify(plain(60)));
  const withSpare = restTokenFold(restTokenInputsOf({ launch: L, through: d(60), units: unitsOn(span(0, 60)), chests: [], perkRows: [{ source: "PERK", detail: "D_SPARE", occurredAt: lastInstant(d(1)) }], bodyKept: new Set() }), d(60));
  const respec = restTokenFold(
    restTokenInputsOf({ launch: L, through: d(60), units: unitsOn(span(0, 60)), chests: [], perkRows: [{ source: "PERK", detail: "D_SPARE", occurredAt: lastInstant(d(1)) }, { source: "RESPEC", detail: null, occurredAt: lastInstant(d(50)) }], bodyKept: new Set() }),
    d(60)
  );
  check("3 with Spare flame owned (it holds a third token), back to 2 from a respec", withSpare.bank === 3 && respec.bank === 2, `${withSpare.bank} ${respec.bank}`);
}

// ── §2 one owner: the fold and settlement spend one token a day ────────
console.log("\n§2 one owner, one token a day");
{
  const tpl = (id: string, over: Partial<SettlementTemplate> = {}): SettlementTemplate => ({
    id, kind: "TASK", title: id, normTitle: id, track: "BODY", band: "STANDARD", bandOverride: 0, estMinutes: 15, machineMinutes: 15, intrinsic: false, mvv: null, mvvMinutes: null, autoMetric: null, autoTarget: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"), pendingChange: null, recurrence: "DAILY", startDay: "2026-10-01", dueDay: null, dueKind: null, compulsory: true, compulsoryOnRest: false, inbox: false, archivedDay: null, ...over,
  });
  const state = (today: DayKey, tokens: RestTokenInputs, over: Partial<SettlementState> = {}): SettlementState => ({
    today, now: new Date(dayEndOf(today).getTime() - 12 * 3_600_000), dutyLaunchDay: L, epochDay: "2026-10-01", cursor: d(0), templates: [tpl("stretch")], instances: [], rows: [], days: [],
    freezeEarned: 0, freezeUsed: 0, openDebts: [], restRows: [], judgedDutyWeeks: new Set(), tokens, ...over,
  });
  const inputs = (active: DayKey[], spent: DayKey[] = []): RestTokenInputs => ({ launch: L, active: new Set(active), extra: new Map(), max: new Map(), spent: new Set(spent), rest: new Set() });
  const spendsOf = (s: SettlementState) => planSettlement(s).flatMap((p) => p.ops).filter((o) => o.kind === "event" && o.input.source === "FREEZE_USE").map((o) => (o.kind === "event" ? o.input.day : ""));

  // An idle day of a live run: the fold spends it by itself; settlement writes that same token.
  const idle = inputs([d(0)]);
  const idleSpends = spendsOf(state(d(3), idle, { days: [{ day: d(0), streakUnits: 1, reviews: 0, ideas: 0, dayOpenQty: null }] }));
  const foldNo = restTokenFold(idle, d(3));
  const foldRow = restTokenFold(withSpent(idle, d(1)), d(3));
  check(
    "an idle day of a live run: settlement writes FREEZE_USE, and the fold with that row spends what it spent without it (one token, not two)",
    same(idleSpends, [d(1)]) && foldNo.used === 1 && foldRow.used === 1 && foldRow.bank === foldNo.bank && same(foldRow.heldDays, foldNo.heldDays),
    JSON.stringify({ idleSpends, foldNo, foldRow })
  );
  // A dead run with a must missed: the fold would spend nothing; settlement's row is the one spend.
  const dead = inputs([]);
  const deadSpends = spendsOf(state(d(3), dead));
  const deadFold = restTokenFold(withSpent(dead, d(1)), d(3));
  check("a dead run with a must missed: settlement spends one, and the fold counts that row once (used 1, bank 0)", same(deadSpends, [d(1)]) && restTokenFold(dead, d(3)).used === 0 && deadFold.used === 1 && deadFold.bank === 0, JSON.stringify(deadFold));
  // An active day with a must missed (D19): a token excuses it; the fold takes it and the run counts the day. Re-pinned
  // by the P21 review: the day after it is active too (judged two days on, the day after is past; see §2b).
  const act = inputs([d(0), d(1), d(2)]);
  const actSpends = spendsOf(state(d(3), act, { days: [0, 1, 2].map((n) => ({ day: d(n), streakUnits: 1, reviews: 0, ideas: 0, dayOpenQty: null })) }));
  const actFold = restTokenFold(withSpent(act, d(1)), d(3));
  check("an active day with a must missed: one FREEZE_USE, and the fold takes it from the bank while the day still counts (no held day)", same(actSpends, [d(1)]) && actFold.used === 1 && actFold.heldDays.length === 0 && actFold.bank === 0 && actFold.breaks === 0, JSON.stringify(actFold));
  // At most one a day: a written spend dated d is d's token; settlement plans no second, and withSpent twice is once.
  const rowSpent = spendsOf(
    state(d(3), withSpent(dead, d(1)), {
      rows: [{ id: "m", day: d(1), source: "FREEZE_USE", sink: "NONE", track: null, templateId: null, sourceId: null, xp: 0, rawXp: null, qty: 1, countsForStreak: false, dedupeKey: `freeze-use:${d(1)}`, receipt: null }],
      freezeUsed: 1,
    })
  );
  check(`at most ${REST_TOKENS_PER_DAY} a day: a FREEZE_USE already dated d plans no second, and the fold spends it once however often it is named`, REST_TOKENS_PER_DAY === 1 && rowSpent.length === 0 && same(withSpent(withSpent(dead, d(1)), d(1)), withSpent(dead, d(1))));
  // The earned history: adding settlement's rows to the days the fold held by itself changes no earn.
  const history = inputs(span(0, 30).filter((x) => x !== d(9) && x !== d(19)));
  const plainH = restTokenFold(history, d(31));
  const rowsH = restTokenFold(withSpent(withSpent(history, d(9)), d(19)), d(31));
  check("the earned history is unchanged: rows written on the days the fold held leave earned, used, the bank and the run as they were", same(plainH, rowsH), JSON.stringify({ plainH, rowsH }));
  // Settlement never earns: 30 active Duty days plan no FREEZE_EARN.
  const earns = planSettlement(
    state(d(32), inputs(span(0, 31)), { cursor: d(-1), templates: [], days: span(0, 31).map((x) => ({ day: x, streakUnits: 1, reviews: 0, ideas: 0, dayOpenQty: null })) })
  ).flatMap((p) => p.ops).filter((o) => o.kind === "event" && o.input.source === "FREEZE_EARN").length;
  check("settlement plans no FREEZE_EARN over 30 active days (the bank's earns are momentum's own)", earns === 0);
}

// ── §2b the run comes first (P21 review) ────────────────────────────────
console.log("\n§2b the run comes first");
{
  const tpl = (id: string): SettlementTemplate => ({
    id, kind: "TASK", title: id, normTitle: id, track: "BODY", band: "STANDARD", bandOverride: 0, estMinutes: 15, machineMinutes: 15, intrinsic: false, mvv: null, mvvMinutes: null, autoMetric: null, autoTarget: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"), pendingChange: null, recurrence: "DAILY", startDay: "2026-10-01", dueDay: null, dueKind: null, compulsory: true, compulsoryOnRest: false, inbox: false, archivedDay: null,
  });
  const inputs = (active: DayKey[], spent: DayKey[] = [], extra: [DayKey, number][] = []): RestTokenInputs => ({ launch: L, active: new Set(active), extra: new Map(extra), max: new Map(), spent: new Set(spent), rest: new Set() });
  const state = (today: DayKey, tokens: RestTokenInputs, over: Partial<SettlementState> = {}): SettlementState => ({
    today, now: new Date(dayEndOf(today).getTime() - 12 * 3_600_000), dutyLaunchDay: L, epochDay: "2026-10-01", cursor: d(0), templates: [tpl("meds")], instances: [], rows: [], days: [],
    freezeEarned: 0, freezeUsed: 0, openDebts: [], restRows: [], judgedDutyWeeks: new Set(), tokens, ...over,
  });
  const plans = (s: SettlementState) => planSettlement(s);
  const spendsOf = (s: SettlementState) => plans(s).flatMap((p) => p.ops).filter((o) => o.kind === "event" && o.input.source === "FREEZE_USE").map((o) => (o.kind === "event" ? o.input.day : ""));
  const debtsOf = (s: SettlementState) => plans(s).flatMap((p) => p.ops).filter((o) => o.kind === "event" && o.input.source === "DEBT").map((o) => (o.kind === "event" ? o.input.day : ""));

  // The review's run: a live run into Mon (d1, active, its must missed), Tue (d2) empty, one token. Judged on Wed (d3).
  const run = inputs(span(-7, 1));
  const before = restTokenFold(run, d(3));
  check("the fold on Wed already holds Tue with the token (the run kept, the bank empty)", same(before.heldDays, [d(2)]) && before.bank === 0 && before.breaks === 0 && before.current === 2, JSON.stringify(before));
  check("…so a token for Mon's must is not free on Wed (it would break the run after the fact)", !restTokenFreeOn(run, d(1), d(3)) && restTokenFold(withSpent(run, d(1)), d(3)).breaks === 1);
  check("…and settlement leaves it there: no FREEZE_USE for Mon, Mon's must is owed, the run still stands", same(spendsOf(state(d(3), run)), []) && same(debtsOf(state(d(3), run)), [d(1)]));
  check("with Tue active instead, the token is free and Mon's must is excused (D19)", restTokenFreeOn(inputs(span(-7, 2)), d(1), d(3)) && same(spendsOf(state(d(3), inputs(span(-7, 2)))), [d(1)]));
  check("with two banked, both: Mon's must takes one and Tue keeps the other", restTokenFreeOn(inputs(span(-7, 1), [], [[d(0), 1]]), d(1), d(3)) && same(spendsOf(state(d(3), inputs(span(-7, 1), [], [[d(0), 1]]))), [d(1)]));
  // 'Use a freeze' for yesterday (Tue) landed before settlement judged Mon: its row is the one token's.
  const manual = inputs(span(-7, 1), [d(2)]);
  check("a manual spend dated after the day is that token's: not free for the day before (one token covers one day)", !restTokenFreeOn(manual, d(1), d(3)) && same(spendsOf(state(d(3), manual)), []));
  check("an early settle of yesterday has no later day to protect: free while one is banked", restTokenFreeOn(inputs(span(-7, 1)), d(1), d(2)));
  check("never for a day already spent, before the bank's launch, or with none banked", !restTokenFreeOn(inputs([], [d(1)]), d(1), d(3)) && !restTokenFreeOn(inputs([]), d(-1), d(3)) && !restTokenFreeOn(inputs([], [d(0)]), d(1), d(3)));
  // A capped miss owes nothing: no token for it.
  const threeOpen = [1, 2, 3].map((n) => ({ instanceId: `o${n}`, templateId: "meds", day: d(-10 - n), slot: 0, debtXp: 1 }));
  check("a must whose miss the caps leave at nothing takes no token (the token stays for the run)", same(spendsOf(state(d(3), inputs([]), { openDebts: threeOpen })), []));

  // The board's forecast for yesterday's open musts, as settlement will judge them tomorrow (today then past).
  const cover = (t: RestTokenInputs, today: DayKey) => restTokenSummaryOf(t, today).yesterday.cover;
  check("forecast 'if-today': yesterday active with a must open, one token, today still empty (an empty today keeps the run with it)", cover(inputs(span(-7, 1)), d(2)) === "if-today");
  check("…'free' once today has a momentum action, or with two banked, or with no run to keep", cover(inputs(span(-7, 2)), d(2)) === "free" && cover(inputs(span(-7, 1), [], [[d(0), 1]]), d(2)) === "free" && cover(inputs([]), d(2)) === "free");
  check("…'free' for an empty yesterday of a live run (the fold's own spend)", cover(inputs(span(-7, 0)), d(2)) === "free" && restTokenSummaryOf(inputs(span(-7, 0)), d(2)).yesterday.autoSpend);
  check("…'none' with no token banked, or a spend already dated yesterday", cover(inputs(span(-7, 1), [d(0)]), d(2)) === "none" && cover(inputs(span(-7, 1), [d(1)]), d(2)) === "none");
}

// ── §3 rest days and the edges ──────────────────────────────────────────
console.log("\n§3 rest days and the edges");
{
  const t = (o: Partial<RestTokenInputs>): RestTokenInputs => ({ launch: L, active: new Set(), extra: new Map(), max: new Map(), spent: new Set(), rest: new Set(), ...o });
  const restHeld = restTokenFold(t({ active: new Set([d(0), d(2)]), rest: new Set([d(1)]) }), d(3));
  const noRest = restTokenFold(t({ active: new Set([d(0), d(2)]) }), d(3));
  check("a rest day holds the run with no token (D19: rest days keep working); without it the fold spends one there", restHeld.used === 0 && restHeld.bank === 1 && restHeld.current === 2 && same(restHeld.restDays, [d(1)]) && noRest.used === 1 && noRest.bank === 0);
  check("before the bank's launch there is no token; the launch day opens with the starting one", restTokenBefore(t({}), d(-1)).bank === 0 && restTokenBefore(t({}), L).bank === MOMENTUM_START_FREEZES && restTokenBefore(t({}), L).run === 0);
  const live = t({ active: new Set([d(0), d(1)]) });
  const y = restTokenBefore(live, d(2));
  check("going into an idle day after a live run: the token is there and the fold spends it by itself (autoSpend)", y.bank === 1 && y.run === 2 && y.autoSpend && !y.spent);
  const sum = restTokenSummaryOf(live, d(3));
  check(
    "the summary: the bank now (after the fold's own spend on yesterday), yesterday's token, and the bank once it is spent (the same: one token)",
    sum.bank === 0 && sum.max === 2 && sum.yesterday.bank === 1 && sum.yesterday.autoSpend && sum.yesterday.leftAfter === 0,
    JSON.stringify(sum)
  );
  const deadSum = restTokenSummaryOf(t({}), d(3));
  check("with no run going into yesterday the fold spends nothing: a manual spend there would leave one less", deadSum.bank === 1 && deadSum.yesterday.bank === 1 && !deadSum.yesterday.autoSpend && deadSum.yesterday.leftAfter === 0, JSON.stringify(deadSum));
}

// ── §4 the read ─────────────────────────────────────────────────────────
console.log("\n§4 the read");
async function reads(): Promise<void> {
  const calls: string[] = [];
  const events = [
    { day: dateColumn(d(1)), source: "FREEZE_USE", receipt: null, detail: "manual", occurredAt: new Date(dayEndOf(d(1)).getTime() - 1000), qty: 1 },
    { day: dateColumn(d(0)), source: "CHEST", receipt: { v: "chest-1", u1: 0.95, u2: 0.2, tier: "RARE", item: "FREEZE", xp: 0, mp: 0, freeze: true, cosmetic: null, pity: false, sinceRare: 0 }, detail: null, occurredAt: new Date(dayEndOf(d(0)).getTime() - 1000), qty: null },
  ];
  const client = {
    $queryRaw: async (sql: { strings: readonly string[] }) => {
      calls.push(sql.strings.join("?"));
      return [{ day: dateColumn(d(0)), units: 1 }];
    },
    activityEvent: { findMany: async () => (calls.push("events"), events) },
    restDay: { findMany: async () => (calls.push("rest"), [{ day: dateColumn(d(2)), kind: "REST", declaredAt: new Date(dayEndOf(d(1)).getTime() - 3_600_000), cancelledAt: null }]) },
  } as unknown as RestTokenClient;
  const off = await readRestTokens(client, "u", d(3), { launch: L, dutyLaunch: null });
  check(
    "Duty off: no RestDay read, and no FREEZE_USE row counts (P21 review: the spends count from the Duty launch day, so the bank is momentum's fold whatever a stray row says)",
    !calls.includes("rest") && !!off && off.rest.size === 0 && off.spent.size === 0 && off.extra.get(d(0)) === 1 && off.active.has(d(0))
  );
  const on = await readRestTokens(client, "u", d(3), { launch: L, dutyLaunch: L });
  check("Duty on: the RestDay rows from its launch day, through duty-rule heldDaysOf (a valid declaration holds), and the FREEZE_USE rows from it", calls.includes("rest") && !!on && on.rest.has(d(2)) && on.spent.has(d(1)));
  const later = await readRestTokens(client, "u", d(3), { launch: L, dutyLaunch: d(2) });
  check("…a FREEZE_USE dated before the Duty launch day never counts", !!later && later.spent.size === 0);
  check("restTokenSpendFrom: the Duty launch day, or the bank's launch when later; null with no Duty launch day", restTokenSpendFrom(L, null) === null && restTokenSpendFrom(L, d(5)) === d(5) && restTokenSpendFrom(d(5), L) === d(5));
  check("before the bank's launch, or with no launch day: null, and nothing read", (await readRestTokens(client, "u", d(-1), { launch: L })) === null && (await readRestTokens(client, "u", d(3), { launch: null })) === null);
  const server = read("src/lib/momentum-server.ts");
  const own = read("src/lib/rest-tokens-server.ts");
  const unitsSql = (src: string) => /SUM\(CASE WHEN "countsForStreak" AND "source" IN \('TASK', 'WORKOUT', 'CHECKPOINT'\) THEN 1 WHEN "source" = 'UNDO' THEN -1 ELSE 0 END\)/.test(src) && /"source" IN \('TASK', 'WORKOUT', 'CHECKPOINT', 'UNDO'\)/.test(src);
  check("the units query is momentum-server's own (the same CASE, the same sources)", unitsSql(server) && unitsSql(own));
  check(
    "every fold reads the spends: momentum-server's readLedger and snapshot's read FREEZE_USE and the rest days; rest-tokens-server CHEST, PERK, RESPEC, FREEZE_USE",
    /sources: \["CHEST", "PERK", "RESPEC", "MILESTONE", "CHECKPOINT", "FREEZE_USE"\]/.test(server) &&
      /readRestHeld\(ctx\.store, userId, launch, through\)/.test(server) &&
      /sources: \["CHEST", "PERK", "RESPEC", "FREEZE_USE"\]/.test(read("src/lib/snapshot.ts")) &&
      /m\.readRestHeld\(store, userId, launch, today\)/.test(read("src/lib/snapshot.ts")) &&
      /REST_TOKEN_SOURCES = \["CHEST", "PERK", "RESPEC", "FREEZE_USE"\] as const/.test(own)
  );
  check(
    "P21 review: …and each counts a FREEZE_USE only from the Duty launch day (readLedger and snapshot through spentDaysOf, rest-tokens-server through restTokenSpendFrom)",
    /spent: spentDaysOf\(rows, launch\)/.test(server) &&
      /const from = restTokenSpendFrom\(launch, dutyLaunchDay\(\)\);/.test(server) &&
      /spent: m\.spentDaysOf\(rows, launch\)/.test(read("src/lib/snapshot.ts")) &&
      /const restFrom = restTokenSpendFrom\(launch, duty\);/.test(own) &&
      /r\.source === "FREEZE_USE" && r\.day >= restFrom/.test(own)
  );
  check(
    "every reader of a freeze balance reads the one bank: settlement (through its own client, through yesterday), the board, the streak, 'Use a freeze', the launch script",
    /readRestTokens\(client, userId, addDays\(today, -1\), \{ launch: opts\.momentumLaunch === undefined \? momentumLaunchDay\(\) : opts\.momentumLaunch, dutyLaunch: opts\.launchDay \}\)/.test(read("src/lib/settlement.ts")) &&
      /readRestTokenSummary\(prisma, userId, today\)/.test(read("src/lib/tasks.ts")) &&
      /readRestTokenSummary\(prisma, userId, today, \{ dutyLaunch: launch \}\)/.test(read("src/lib/streak.ts")) &&
      /readRestTokenSummary\(prisma, userId, today\)/.test(read("src/lib/duty.ts")) &&
      /readRestTokenSummary\(prisma, userId, today, \{ dutyLaunch: launchDay \}\)/.test(read("scripts/duty-launch.ts"))
  );
  // No writer of FREEZE_EARN is left (settlement-plan's step 7 is retired); FREEZE_USE is written by settlement and the manual spend only.
  const srcFiles: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f)) srcFiles.push(p);
    }
  };
  walk(join(ROOT, "src"));
  const earnWriters = srcFiles.filter((f) => /source: "FREEZE_EARN"/.test(readFileSync(f, "utf8"))).map((f) => relative(ROOT, f));
  const useWriters = srcFiles.filter((f) => /source: "FREEZE_USE",\s*\n?\s*sink: "NONE"/.test(readFileSync(f, "utf8"))).map((f) => relative(ROOT, f).replace(/\\/g, "/")).sort();
  check("no FREEZE_EARN writer is left in src/", earnWriters.length === 0, earnWriters.join(", "));
  check("FREEZE_USE is written by settlement's step 3 and the manual spend only", same(useWriters, ["src/lib/duty-plan.ts", "src/lib/settlement-plan.ts"]), useWriters.join(", "));
  const modules = [read("src/lib/rest-tokens.ts"), own];
  check(
    "the bank's modules write nothing and never touch credits (penalties never debit credits)",
    modules.every((m) => !/\.create\(|createMany|\$executeRaw|\.update\(|\.delete\(|credits/.test(m.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")))
  );
  // Re-pinned by blueprint P22 (as duty-check's): null until the user's go, then a valid launch Monday.
  check(
    "DUTY_LAUNCH_DAY is null in code, or a valid launch day once the lead sets it",
    DUTY_LAUNCH_DAY === null || validateDutyLaunchDay(DUTY_LAUNCH_DAY, { deployDay: DUTY_LAUNCH_DAY, lifeLaunchDay: LIFE_LAUNCH_DAY }).valid,
    String(DUTY_LAUNCH_DAY)
  );
}

// ── §5 the surfaces ─────────────────────────────────────────────────────
async function surfaces(): Promise<void> {
  console.log("\n§5 the surfaces");
  check("the chip's words: 'Rest tokens 2', 0 said as it is", restTokensText(2) === "Rest tokens 2" && restTokensText(0) === "Rest tokens 0" && restTokensText(-1) === "Rest tokens 0" && REST_TOKENS_WORD === "Rest tokens");
  (Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
    m.exports = {};
  };
  const { StreakCard } = await import("../src/components/today/DayLedger");
  const html = renderToStaticMarkup(createElement(StreakCard, { streak: { count: 9, kept: true }, caption: "Kept today.", freezes: { banked: 2 }, heldNote: null }));
  const none = renderToStaticMarkup(createElement(StreakCard, { streak: { count: 9, kept: true }, caption: "Kept today.", freezes: null, heldNote: null }));
  check("Character's streak card draws the held chip 'Rest tokens 2' (the freeze glyph and the words), none without a bank", /<div class="rest-tokens"><span class="chip held">/.test(html) && html.includes("Rest tokens 2") && !none.includes("Rest tokens"), html.slice(0, 400));
  // At 344 px the words need the streak column's width (the crystals' right edge squeezed the caption): under the caption.
  check(
    "…under the caption, inside the streak's column (not at the card's right edge)",
    html.indexOf('<div class="d-streak">') < html.indexOf('class="streak-cap"') && html.indexOf('class="streak-cap"') < html.indexOf('<div class="rest-tokens">') && /\.rest-tokens \{ margin-top: 6px; \}/.test(read("src/components/today/today.css")),
    html.slice(0, 600)
  );
  const ui = read("src/components/today/board-ui.ts");
  check(
    "Character before Duty: the chip whenever the bank is live, 0 included (dayLedgerDutyOf reads streak.restTokens)",
    /const live = p\.streak\.restTokens;\s*const freezes = live != null \? \{ banked: live \}/.test(ui)
  );
  check("Today: the Daily quests' chip is the Momentum card's run.bank, on the personal Board only", /const restTokens = !isWork && momentum\?\.live \? momentum\.run\.bank : null;/.test(read("src/components/today/TodayBoard.tsx")));
  const rules = read("src/app/today/rules/page.tsx");
  const card = rules.slice(rules.indexOf("function RestTokenRules"), rules.indexOf("function MomentumRules"));
  check(
    "the rules entry (#rest-tokens) is read from code: the start, the earn, the cap and Spare flame, one a day, D19 only once Duty is live, rest days and make-ups as before",
    /<Card id="rest-tokens" title=\{`\$\{REST_TOKENS_WORD\}: one bank`\}/.test(card) &&
      /\{MOMENTUM_START_FREEZES\}/.test(card) &&
      /\{MOMENTUM\.FREEZE_EVERY\}/.test(card) &&
      /\{MOMENTUM\.FREEZE_MAX\}/.test(card) &&
      /withPerk\("D_SPARE"\)\.freezeMax/.test(card) &&
      /\{REST_TOKENS_PER_DAY\}/.test(card) &&
      /duty\.live \?/.test(card) &&
      /The minimum version, make-ups and rest days work as before/.test(card) &&
      !/\b[23] (are )?banked\b/.test(card) &&
      /<RestTokenRules duty=\{duty\} \/>/.test(rules) &&
      !/FREEZE_EARN_ACTIVE_DAYS|FREEZE_START_BALANCE/.test(rules)
  );
  check(
    "never-shaming copy: the entry and the chip say counts and what a token does, never 'lost', 'failed' or 'penalty'",
    !/\b(lost|failed|penalt)/i.test(card.replace(/an earn beyond that is lost/g, "")) && !/\b(lost|failed|penalt)/i.test(restTokensText(0))
  );
  check(
    "mobile: /check's streak carries restTokens (the bank, null while not live) and freezes the same number",
    same(streakOf({ current: 4, last7Days: [true], bankedFreezes: 2, restTokens: 2 }), { days: 4, keptToday: true, freezes: 2, restTokens: 2 }) &&
      same(streakOf({ current: 4, last7Days: [false], bankedFreezes: 0, restTokens: null }), { days: 4, keptToday: false, freezes: 0, restTokens: null })
  );
  const models = read("android/app/src/main/java/com/xtnl/app/data/Models.kt");
  const screen = read("android/app/src/main/java/com/xtnl/app/ui/check/CheckScreen.kt");
  const gradle = read("android/app/build.gradle");
  check(
    "Android: StreakInfo.restTokens (null from an older server), the demo's 2, the line's words, and the chip in the check's header (both displays draw the header)",
    // Re-pinned by blueprint P29: StreakInfo also carries the streak multiplier (null from an older server), one field a line.
    /data class StreakInfo\(\s*val days: Int = 0,\s*val keptToday: Boolean = false,\s*val freezes: Int = 0,\s*val restTokens: Int\? = null,\s*val multiplier: StreakMultiplier\? = null,\s*\)/.test(models) &&
      /StreakInfo\(12, keptToday = false, freezes = 2, restTokens = 2, multiplier = DEMO_STREAK_MULT\)/.test(read("android/app/src/main/java/com/xtnl/app/data/DemoApi.kt")) &&
      /const val WORD = "Rest tokens"/.test(read("android/app/src/main/java/com/xtnl/app/core/RestTokenLine.kt")) &&
      /RestTokenLine\.tokens\(data\.streak\)\?\.let \{ n ->\s*Spacer\(Modifier\.height\(6\.dp\)\)\s*RestTokensChip\(n\)/.test(screen) &&
      (screen.match(/header\(data, ui, vm, spots, onOpenSettings\)/g) ?? []).length === 2 &&
      /assertExists/.test(read("android/app/src/test/java/com/xtnl/app/ui/ScreensTest.kt")) &&
      /hasText\(RestTokenLine\.chip\(2\)\)/.test(read("android/app/src/test/java/com/xtnl/app/ui/ScreensTest.kt"))
  );
  // Re-pinned by blueprint P22: the build that brought the chip (22, 2.10) or a later one (P22's make-up cards are 23, 2.11).
  const versionCode = Number(/versionCode (\d+)\b/.exec(gradle)?.[1] ?? 0);
  check("Android: versionCode 22 (2.10) or later", versionCode >= 22 && /versionName "2\.\d+"/.test(gradle), String(versionCode));
}

void (async () => {
  await reads();
  await surfaces();
  console.log(`\nrest-tokens-check: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
