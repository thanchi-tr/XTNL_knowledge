/**
 * Inviting the aim, on fixed cases (roadmap-rev4.md F-R4-1, F-R4-3, F-R4-4,
 * F-R4-7): the prompt's truth table (aimPromptOf, with the fix round's
 * HIDDEN from the LATER line's 'hide:<day>'), the back-off's anchor,
 * the long-goal seed, the aim handoff, fresh-start days, Today's aim line
 * (todayAimLineOf: SET with its variants and back-off, DRAFT's three shows,
 * START's daily week and its snooze), the vague-aim hint and the capture
 * line 'aim: …'. Revision 5 (contracts §23.3, §23.5, ruling 53; lane 3):
 * the aim-line priority across goals (aimLinePickOf through
 * TodayAimLineInput.goals), SET hidden at GOALS_MAX open, the multi-entry
 * step cookie (stepCookieValueOf) and the GoalsFullCard's hold on the aim
 * handoff (holdAimHandoff).
 *
 * Pure: no database, no clock (every case passes its own day), no model.
 * scripts/_no-model.ts is imported first, like every check that imports a
 * roadmap module. Lane 0 owns it.
 *
 *   npx tsx scripts/roadmap-invite-check.ts
 */
import "./_no-model";
import { addDays, dayKeyOf, weekdayOf, zonedToInstant, LIFE_TZ, type DayKey } from "../src/lib/life-day";
import {
  AIM_AWAY_DAYS,
  AIM_BACKOFF_FRESH_DAYS,
  AIM_DONE_SHOW_DAYS,
  AIM_DRAFT_SHOWS_MAX,
  AIM_INVITE_SINCE,
  AIM_LATER_DAYS,
  AIM_PROMPT_LATER_MAX_AGE_S,
  AIM_START_DAILY_DAYS,
  AIM_STEP_COOKIE,
  AIM_STEP_COOKIE_ENTRIES_MAX,
  AIM_STEP_COOKIE_MAX_AGE_S,
  AIM_STEP_SNOOZE_DAYS,
  VAGUE_AIM_IDLE_MS,
  VAGUE_AIM_WORDS,
  aimLineCandidateOf,
  aimLineDraftHrefOf,
  aimLineStartHrefOf,
  aimPromptOf,
  askAnchorOf,
  freshStartDaysBetween,
  hideCookieValue,
  isFreshStartDay,
  laterCookieValue,
  longGoalSeedOf,
  onCookieValue,
  stepCookieValue,
  stepCookieValueOf,
  stepSnoozed,
  todayAimLineOf,
  vagueAimHint,
  type AimPrompt,
  type SeedGoal,
  type TodayAimLineInput,
} from "../src/lib/roadmap-invite";
import {
  AIM_HANDOFF_AIM_MAX,
  AIM_HANDOFF_HOLD_MS,
  AIM_HANDOFF_KEY,
  AIM_HANDOFF_TTL_MS,
  aimLineOf,
  holdAimHandoff,
  takeAimHandoff,
  writeAimHandoff,
  type AimHandoffStorage,
} from "../src/lib/roadmap-handoff";
import { AIM_MAX, AIM_PROMPT_COOKIE, GOALS_MAX, GOAL_SLOTS_MAX, type AimLineView, type AimStep, type AimStepMilestone, type GoalSlot } from "../src/lib/roadmap-types";
import type { AimLineCandidate } from "../src/lib/roadmap-goals";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const json = (v: unknown) => JSON.stringify(v);
const eq = (name: string, got: unknown, want: unknown) => check(name, json(got) === json(want), `got ${json(got)}, want ${json(want)}`);

// Fixed days in 2027, after any plausible AIM_INVITE_SINCE (asserted), so the floor never moves an anchor below.
const MON: DayKey = "2027-03-08"; // a Monday, not a 1st
const TUE = addDays(MON, 1);
const THU = addDays(MON, 3);
const FIRST: DayKey = "2027-04-01"; // a Thursday, the 1st
const EPOCH: DayKey = "2026-08-01";

console.log("— constants —");
{
  check("the fixed days are what they say (Mon 8 Mar 2027; Thu 1 Apr 2027)", weekdayOf(MON) === 1 && weekdayOf(THU) === 4 && weekdayOf(FIRST) === 4 && FIRST.endsWith("-01"));
  check("AIM_INVITE_SINCE is a day before these fixed cases (the lead sets it to the deploy day)", /^\d{4}-\d{2}-\d{2}$/.test(AIM_INVITE_SINCE) && AIM_INVITE_SINCE < "2027-01-01", AIM_INVITE_SINCE);
  // Fix round 2 (contracts §16.5): the deploy day, no longer the migration's placeholder (Fri 6 Nov 2026, which held the
  // back-off off for a month after the deploy). LEAD: on a later deploy, move the constant and this pin together.
  eq("AIM_INVITE_SINCE is the revision-4 deploy day, Tue 6 Oct 2026 (the earliest deploy; no fresh-start day before Mon 12 Oct)", [AIM_INVITE_SINCE, weekdayOf(AIM_INVITE_SINCE), freshStartDaysBetween(AIM_INVITE_SINCE, "2026-10-12")], ["2026-10-06", 2, 0]);
  eq(
    "the published values: later 28 days (cookie kept a year), away 7, back-off after 4 fresh-start days, draft 3 shows, start daily 7, done 28",
    [AIM_LATER_DAYS, AIM_PROMPT_LATER_MAX_AGE_S, AIM_AWAY_DAYS, AIM_BACKOFF_FRESH_DAYS, AIM_DRAFT_SHOWS_MAX, AIM_START_DAILY_DAYS, AIM_DONE_SHOW_DAYS],
    [28, 365 * 86400, 7, 4, 3, 7, 28]
  );
  eq("the step cookie: 'xtnl-aim-step', hidden 7 days, kept 8 days, up to 3 lines at once (revision 5)", [AIM_STEP_COOKIE, AIM_STEP_SNOOZE_DAYS, AIM_STEP_COOKIE_MAX_AGE_S, AIM_STEP_COOKIE_ENTRIES_MAX], ["xtnl-aim-step", 7, 8 * 86400, 3]);
  eq("the handoff: 'xtnl:roadmap:aim-handoff', 10 minutes, the aim cut at 500; a held one waits a day (revision 5)", [AIM_HANDOFF_KEY, AIM_HANDOFF_TTL_MS, AIM_HANDOFF_AIM_MAX, AIM_HANDOFF_HOLD_MS], ["xtnl:roadmap:aim-handoff", 600_000, 500, 86_400_000]);
  check("GOALS_MAX is 3 (ruling N15: up to 3 open goals at any time; the seats the database allows 3)", GOALS_MAX === 3 && GOAL_SLOTS_MAX === 3);
  eq("the vague words and the idle time", [VAGUE_AIM_WORDS, VAGUE_AIM_IDLE_MS], [["get better", "improve", "learn more", "be good at", "understand", "know more", "get into", "learn"], 600]);
  check("the prompt cookie is rev 3's name", AIM_PROMPT_COOKIE === "xtnl-aim-prompt");
}

// ═══ The prompt (F-R4-1, F-R4-5) ════════════════════════════════════════════

console.log("— the prompt —");
{
  const p = (cookie: string | undefined, setting: boolean | null) => aimPromptOf(cookie, setting, MON);
  const table: [string, string | undefined, boolean | null, AimPrompt][] = [
    ["absent", undefined, null, "ASK"],
    ["'off' (rev 3's year-long ×)", "off", null, "OFF"],
    ["setting false, no cookie", undefined, false, "OFF"],
    ["setting false with 'later:today'", laterCookieValue(MON), false, "OFF"],
    ["setting false with 'on:today'", onCookieValue(MON), false, "OFF"],
    ["setting true with 'off' (the old cookie is still a no until the switch deletes it)", "off", true, "OFF"],
    ["'later:today'", `later:${MON}`, null, "LATER"],
    ["'later:today−27'", `later:${addDays(MON, -27)}`, null, "LATER"],
    ["'later:today−28'", `later:${addDays(MON, -28)}`, null, "ASK"],
    ["'on:today'", `on:${MON}`, true, "ASK"],
    ["'later:garbage'", "later:garbage", null, "ASK"],
    ["'later:2027-02-30' (not a day)", "later:2027-02-30", null, "ASK"],
    ["setting true, no cookie", undefined, true, "ASK"],
    // Fix round: "Not now" on the LATER line ('hide:<day>') hides every suggestion for AIM_LATER_DAYS, then the card asks again.
    ["'hide:today' (the LATER line's ×)", `hide:${MON}`, null, "HIDDEN"],
    ["'hide:today−27'", `hide:${addDays(MON, -27)}`, true, "HIDDEN"],
    ["'hide:today−28'", `hide:${addDays(MON, -28)}`, null, "ASK"],
    ["setting false with 'hide:today' (the lasting no wins)", `hide:${MON}`, false, "OFF"],
    ["'hide:garbage'", "hide:garbage", null, "ASK"],
  ];
  const bad = table.filter(([, c, s, want]) => p(c, s) !== want).map(([n, c, s, want]) => `${n}: got ${p(c, s)}, want ${want}`);
  check("aimPromptOf's truth table", bad.length === 0, bad.join("; "));
  eq("the cookie values: 'later:<day>', 'hide:<day>' and 'on:<day>'", [laterCookieValue(MON), hideCookieValue(MON), onCookieValue(MON)], [`later:${MON}`, `hide:${MON}`, `on:${MON}`]);

  const since = AIM_INVITE_SINCE;
  eq(
    "askAnchorOf: the latest of a 'later:' day + 28, an 'on:' day, the last close, the epoch and AIM_INVITE_SINCE",
    [
      askAnchorOf(undefined, null, null),
      askAnchorOf(undefined, null, EPOCH),
      askAnchorOf(`later:${MON}`, null, EPOCH),
      askAnchorOf(`on:${MON}`, addDays(MON, -3), EPOCH),
      askAnchorOf(`on:${addDays(MON, -9)}`, addDays(MON, -3), EPOCH),
      askAnchorOf("off", null, "2027-01-02"),
      askAnchorOf("later:garbage", null, null),
      askAnchorOf(`hide:${MON}`, null, EPOCH),
    ],
    [since, since > EPOCH ? since : EPOCH, addDays(MON, 28), MON, addDays(MON, -3), "2027-01-02", since, addDays(MON, 28)]
  );
  check(
    "HIDDEN quiets Today's SET line like LATER (todayAimLineOf shows SET only on ASK), and Settings still reads the switch on (only OFF is off)",
    todayAimLineOf({ step: { open: null, lastDoneDay: null, lastClosedDay: null, epochDay: EPOCH, lastOpenBefore: addDays(FIRST, -1), aimSuggestions: null }, prompt: aimPromptOf(`hide:${addDays(FIRST, -3)}`, null, FIRST), cookie: `hide:${addDays(FIRST, -3)}`, stepCookie: undefined, today: FIRST, goalsLive: true }) === null &&
      todayAimLineOf({ step: { open: null, lastDoneDay: null, lastClosedDay: null, epochDay: EPOCH, lastOpenBefore: addDays(FIRST, -1), aimSuggestions: null }, prompt: "ASK", cookie: undefined, stepCookie: undefined, today: FIRST, goalsLive: true }) !== null &&
      aimPromptOf(`hide:${MON}`, null, MON) !== "OFF"
  );
}

// ═══ The long-goal seed (F-R4-1) ════════════════════════════════════════════

console.log("— the seed —");
{
  const goal = (id: string, title: string, horizon: "LONG" | "MID" | "SHORT", dueDay: DayKey | null, extra: Partial<SeedGoal> = {}): SeedGoal => ({ id, title, horizon, dueDay, ...extra });
  const today = MON;
  eq("no goals, or none LONG: no seed", [longGoalSeedOf(null, today), longGoalSeedOf([goal("m", "Mid one", "MID", addDays(today, 100))], today)], [null, null]);
  const seed = longGoalSeedOf(
    {
      open: [
        goal("mid", "A mid goal", "MID", addDays(today, 400)),
        goal("rm", "A roadmap goal", "LONG", addDays(today, 500), { roadmap: { ord: 1 } }),
        goal("rm2", "A roadmap goal", "LONG", addDays(today, 500), { krMetric: "ROADMAP" }),
        goal("blank", "   ", "LONG", addDays(today, 600)),
        goal("early", "Speak Japanese at work", "LONG", addDays(today, 200)),
        goal("late", "Pass the CFA level 1 exam", "LONG", addDays(today, 300)),
        goal("none", "Run a marathon", "LONG", null),
      ],
      closed: [goal("closed", "A closed long goal", "LONG", addDays(today, 900))],
    } as never,
    today
  );
  eq("MID goals, roadmap goals and blank titles are ignored; the latest due goal wins, with its due day as the date", seed, { goalId: "late", title: "Pass the CFA level 1 exam", targetDay: addDays(today, 300) });
  eq("a null due day sorts last; ties go by title", longGoalSeedOf([goal("b", "Bravo", "LONG", null), goal("a", "Alpha", "LONG", null)], today), { goalId: "a", title: "Alpha" });
  const long = longGoalSeedOf([goal("x", "y".repeat(200), "LONG", addDays(today, 100))], today);
  check("a 200-character title is clamped to 140 (AIM_MAX)", !!long && long.title.length === AIM_MAX && AIM_MAX === 140);
  eq(
    "targetDay is dropped at 20 days and at 1,200 days, kept at 35 and 1,080",
    [20, 1200, 35, 1080].map((d) => longGoalSeedOf([goal("g", "Goal", "LONG", addDays(today, d))], today)?.targetDay ?? null),
    [null, null, addDays(today, 35), addDays(today, 1080)]
  );
}

// ═══ The handoff (F-R4-1, F-R4-7, F-R4-16) ══════════════════════════════════

console.log("— the handoff —");
{
  const memory = (): AimHandoffStorage & { map: Map<string, string> } => {
    const map = new Map<string, string>();
    return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
  };
  const s = memory();
  const at = 1_800_000_000_000;
  check("write stores it", writeAimHandoff({ aim: "  Hold a conversation in Japanese  ", source: "capture", sheetText: "aim: Hold a conversation in Japanese" }, s, at) && s.map.has(AIM_HANDOFF_KEY));
  eq("take returns the entry once (trimmed), then nothing", [takeAimHandoff(at + 1000, s), takeAimHandoff(at + 2000, s)], [{ aim: "Hold a conversation in Japanese", source: "capture", sheetText: "aim: Hold a conversation in Japanese", at }, null]);
  writeAimHandoff({ aim: "Run a sub-50 10K", source: "you" }, s, at);
  check("an entry over 10 minutes old gives null (and is removed)", takeAimHandoff(at + AIM_HANDOFF_TTL_MS + 1, s) === null && !s.map.has(AIM_HANDOFF_KEY));
  s.map.set(AIM_HANDOFF_KEY, "{not json");
  check("malformed JSON gives null", takeAimHandoff(at, s) === null);
  s.map.set(AIM_HANDOFF_KEY, JSON.stringify({ aim: "x", source: "elsewhere", at }));
  check("an unknown source gives null", takeAimHandoff(at, s) === null);
  const throwing: AimHandoffStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  check("a throwing storage gives null on take and false on write, never a throw", takeAimHandoff(at, throwing) === null && writeAimHandoff({ aim: "x", source: "you" }, throwing, at) === false);
  check("no storage (null): false and null", writeAimHandoff({ aim: "x", source: "you" }, null, at) === false && takeAimHandoff(at, null) === null);
  writeAimHandoff({ aim: "z".repeat(900), source: "goal", targetDay: "2027-06-01" }, s, at);
  const cut = takeAimHandoff(at, s);
  check("the aim is cut to AIM_HANDOFF_AIM_MAX; a good targetDay is kept", !!cut && cut.aim.length === AIM_HANDOFF_AIM_MAX && cut.targetDay === "2027-06-01");
  writeAimHandoff({ aim: "Learn piano", source: "restart", areaFieldId: "fld_music", track: "CRAFT", domainIds: ["d1", "d2"], replaces: "rm_old", targetDay: "soon" }, s, at);
  eq("a restart carries its Area, track, Domains and the roadmap it replaces; a malformed field is dropped", takeAimHandoff(at, s), { aim: "Learn piano", source: "restart", areaFieldId: "fld_music", track: "CRAFT", domainIds: ["d1", "d2"], replaces: "rm_old", at });
  check("an empty aim is not written", writeAimHandoff({ aim: "   ", source: "you" }, s, at) === false);

  // Revision 5 (contracts §23.5): with every seat taken the GoalsFullCard holds the aim until a seat frees.
  const h = memory();
  writeAimHandoff({ aim: "Learn the cello", source: "capture", sheetText: "aim: Learn the cello" }, h, at);
  const held = holdAimHandoff(at + 5 * 60_000, h);
  eq(
    "hold: the card reads the aim without taking it, marks it held and stamps it now (it stays in sessionStorage)",
    [held, h.map.has(AIM_HANDOFF_KEY)],
    [{ aim: "Learn the cello", source: "capture", sheetText: "aim: Learn the cello", at: at + 5 * 60_000, held: true }, true]
  );
  eq(
    "hold: a held aim outlives the 10 minutes and is taken once a seat frees (the form's take), then nothing",
    [takeAimHandoff(at + 5 * 60_000 + AIM_HANDOFF_TTL_MS + 60_000, h)?.aim ?? null, takeAimHandoff(at + 5 * 60_000 + AIM_HANDOFF_TTL_MS + 60_000, h)],
    ["Learn the cello", null]
  );
  writeAimHandoff({ aim: "Learn the cello", source: "you" }, h, at);
  holdAimHandoff(at, h);
  holdAimHandoff(at + AIM_HANDOFF_HOLD_MS - 1, h);
  check("hold: each hold waits AIM_HANDOFF_HOLD_MS more from now", takeAimHandoff(at + 2 * AIM_HANDOFF_HOLD_MS - 2, h)?.aim === "Learn the cello");
  writeAimHandoff({ aim: "Learn the cello", source: "you" }, h, at);
  holdAimHandoff(at, h);
  check("hold: a held aim past AIM_HANDOFF_HOLD_MS is dropped (and removed)", takeAimHandoff(at + AIM_HANDOFF_HOLD_MS + 1, h) === null && !h.map.has(AIM_HANDOFF_KEY));
  writeAimHandoff({ aim: "Old", source: "you" }, h, at);
  check("hold: an aim already past its 10 minutes is not revived (null, and removed)", holdAimHandoff(at + AIM_HANDOFF_TTL_MS + 1, h) === null && !h.map.has(AIM_HANDOFF_KEY));
  writeAimHandoff({ aim: "First", source: "you" }, h, at);
  holdAimHandoff(at, h);
  writeAimHandoff({ aim: "Second", source: "capture" }, h, at + 1000);
  eq("hold: a new aim written after a hold replaces it, unheld (the latest aim wins)", takeAimHandoff(at + 2000, h), { aim: "Second", source: "capture", at: at + 1000 });
  h.map.set(AIM_HANDOFF_KEY, "{not json");
  check(
    "hold: nothing there, malformed JSON, a throwing storage or none at all give null, never a throw",
    holdAimHandoff(at, h) === null && !h.map.has(AIM_HANDOFF_KEY) && holdAimHandoff(at, memory()) === null && holdAimHandoff(at, throwing) === null && holdAimHandoff(at, null) === null
  );
  h.map.set(AIM_HANDOFF_KEY, JSON.stringify({ aim: "Forged", source: "you", at, held: "yes" }));
  check("hold: only a held: true mark waits the day (a forged mark reads as unheld)", takeAimHandoff(at + AIM_HANDOFF_TTL_MS + 1, h) === null);
}

// ═══ Fresh-start days (F-R4-3) ══════════════════════════════════════════════

console.log("— fresh-start days —");
{
  const yesterday = (d: DayKey) => addDays(d, -1);
  check("a Monday is a fresh-start day; the 1st is; a Tuesday is not", isFreshStartDay(MON, yesterday(MON)) && isFreshStartDay(FIRST, yesterday(FIRST)) && !isFreshStartDay(TUE, yesterday(TUE)));
  if (LIFE_TZ === "Australia/Sydney") {
    const monday0200 = zonedToInstant(2027, 3, 8, 2);
    const lifeDay = dayKeyOf(monday0200);
    check("02:00 on a Monday is still Sunday's life day: not a fresh-start day", lifeDay === addDays(MON, -1) && !isFreshStartDay(lifeDay, addDays(lifeDay, -1)), lifeDay);
  }
  check(
    "a Thursday 8 days after the last DAY_OPEN is a fresh-start day (the first day back); 7 days after is not",
    isFreshStartDay(THU, addDays(THU, -8)) && !isFreshStartDay(THU, addDays(THU, -7)) && !isFreshStartDay(THU, null)
  );
  eq(
    "freshStartDaysBetween counts Mondays and 1sts in [a, b) by day keys; a Monday the 1st counts once; the away rule never",
    [freshStartDaysBetween(MON, addDays(MON, 7)), freshStartDaysBetween(TUE, addDays(MON, 7)), freshStartDaysBetween("2027-02-28", "2027-03-02"), freshStartDaysBetween(MON, MON)],
    [1, 0, 1, 0]
  );
}

// ═══ Today's aim line (F-R4-3) ══════════════════════════════════════════════

console.log("— the aim line —");
{
  const step = (over: Partial<AimStep> = {}): AimStep => ({ open: null, lastDoneDay: null, lastClosedDay: null, epochDay: EPOCH, lastOpenBefore: null, aimSuggestions: null, ...over });
  const line = (today: DayKey, s: AimStep, extra: { prompt?: AimPrompt; cookie?: string; stepCookie?: string; goalsLive?: boolean } = {}): AimLineView | null =>
    todayAimLineOf({ step: { ...s, lastOpenBefore: s.lastOpenBefore ?? addDays(today, -1) }, prompt: extra.prompt ?? "ASK", cookie: extra.cookie, stepCookie: extra.stepCookie, today, goalsLive: extra.goalsLive ?? true });
  const kind = (v: AimLineView | null) => (v ? (v.kind === "SET" ? `SET ${v.variant}` : v.kind) : null);
  const anchor3 = (d: DayKey) => `on:${addDays(d, -3)}`;

  // SET and its variants.
  eq(
    "no roadmap, ASK, the anchor 3 days ago: a Monday gives SET WEEK, the 1st MONTH, a first day back on a Thursday BACK",
    [kind(line(MON, step(), { cookie: anchor3(MON) })), kind(line(FIRST, step(), { cookie: anchor3(FIRST) })), kind(line(THU, step({ lastOpenBefore: addDays(THU, -8) }), { cookie: anchor3(THU) }))],
    ["SET WEEK", "SET MONTH", "SET BACK"]
  );
  check("SET leads to the intake form", (line(MON, step(), { cookie: anchor3(MON) }) as { href?: string } | null)?.href === "/you/roadmap/new");
  eq(
    "the back-off: the anchor 5 Mondays ago and no action gives null on a Monday, and MONTH on the next 1st",
    [kind(line(MON, step(), { cookie: `on:${addDays(MON, -35)}` })), kind(line(FIRST, step(), { cookie: `on:${addDays(MON, -35)}` }))],
    [null, "SET MONTH"]
  );
  eq(
    "a 'later:' snooze that ended yesterday makes the next Monday SET again; so does an 'on:' day last week (both behind a long-backed-off close)",
    [kind(line(MON, step({ lastClosedDay: addDays(MON, -200) }), { cookie: `later:${addDays(MON, -29)}` })), kind(line(MON, step({ lastClosedDay: addDays(MON, -200) }), { cookie: `on:${addDays(MON, -5)}` })), kind(line(MON, step({ lastClosedDay: addDays(MON, -200) }), { cookie: undefined }))],
    ["SET WEEK", "SET WEEK", null]
  );
  {
    // Fix round 2 (contracts §16.5): from the deploy day, with no action (no cookie, no close, the epoch before it), Today's
    // SET shows on the first AIM_BACKOFF_FRESH_DAYS fresh-start days after AIM_INVITE_SINCE, then only on the 1st.
    const shows: string[] = [];
    const want: string[] = [];
    let fresh = 0;
    for (let i = 0; i < 70; i++) {
      const d = addDays(AIM_INVITE_SINCE, i);
      const v = line(d, step());
      if (v) shows.push(`${d} ${kind(v)}`);
      const isFresh = weekdayOf(d) === 1 || d.endsWith("-01");
      if (isFresh && (fresh < AIM_BACKOFF_FRESH_DAYS || d.endsWith("-01"))) want.push(`${d} ${d.endsWith("-01") ? "SET MONTH" : "SET WEEK"}`);
      if (isFresh) fresh += 1;
    }
    eq("after the deploy day: SET on the first 4 fresh-start days after AIM_INVITE_SINCE, then only on the 1st (computed)", shows, want);
    eq(
      "… for Tue 6 Oct 2026: Mon 12, 19 and 26 Oct and Sun 1 Nov, then Tue 1 Dec (Mon 2 Nov and after are backed off)",
      shows,
      ["2026-10-12 SET WEEK", "2026-10-19 SET WEEK", "2026-10-26 SET WEEK", "2026-11-01 SET MONTH", "2026-12-01 SET MONTH"]
    );
  }
  eq(
    "DONE 10 days ago: NEXT on a Monday, null on a Tuesday; DONE 40 days ago with no action since: null on a Monday (backed off), MONTH on the 1st",
    [
      kind(line(MON, step({ lastDoneDay: addDays(MON, -10), lastClosedDay: addDays(MON, -10) }))),
      kind(line(TUE, step({ lastDoneDay: addDays(TUE, -10), lastClosedDay: addDays(TUE, -10) }))),
      kind(line(MON, step({ lastDoneDay: addDays(MON, -40), lastClosedDay: addDays(MON, -40) }))),
      kind(line(FIRST, step({ lastDoneDay: addDays(FIRST, -40), lastClosedDay: addDays(FIRST, -40) }))),
    ],
    ["SET NEXT", null, null, "SET MONTH"]
  );
  eq("LATER or OFF gives null; a Tuesday gives null", [kind(line(MON, step(), { prompt: "LATER", cookie: anchor3(MON) })), kind(line(MON, step(), { prompt: "OFF", cookie: anchor3(MON) })), kind(line(TUE, step(), { cookie: anchor3(TUE) }))], [null, null, null]);
  // From MON − 21: Mondays 15 Feb, 22 Feb and 1 Mar (the 1st, counted once) = 3. From MON − 28: 8 Feb as well = 4.
  check(
    "the back-off counts AIM_BACKOFF_FRESH_DAYS: 3 fresh-start days since the anchor still show, 4 don't",
    freshStartDaysBetween(addDays(MON, -21), MON) === 3 && freshStartDaysBetween(addDays(MON, -28), MON) === 4 && kind(line(MON, step(), { cookie: `on:${addDays(MON, -21)}` })) === "SET WEEK" && kind(line(MON, step(), { cookie: `on:${addDays(MON, -28)}` })) === null
  );

  // DRAFT.
  const draft = (savedDay: DayKey, running = false): AimStep => step({ open: { kind: "DRAFT", roadmapId: "rm1", savedDay, running } });
  eq(
    "DRAFT: saved today null; saved yesterday DRAFT; saved Monday, on Thursday (not fresh) null; the next Monday DRAFT; the Monday after DRAFT (third show); the Monday after that null",
    [
      kind(line(MON, draft(MON))),
      kind(line(TUE, draft(MON))),
      kind(line(THU, draft(MON))),
      kind(line(addDays(MON, 7), draft(MON))),
      kind(line(addDays(MON, 14), draft(MON))),
      kind(line(addDays(MON, 21), draft(MON))),
    ],
    [null, "DRAFT", null, "DRAFT", "DRAFT", null]
  );
  eq("RUNNING gives null; prompt OFF still allows DRAFT; a snooze hides it for a week", [kind(line(TUE, draft(MON, true))), kind(line(TUE, draft(MON), { prompt: "OFF" })), kind(line(TUE, draft(MON), { stepCookie: stepCookieValue("DRAFT", "rm1", TUE) }))], [null, "DRAFT", null]);

  // START.
  const ms = (id: string, ord: number, state: AimStepMilestone["state"], extra: Partial<AimStepMilestone> = {}): AimStepMilestone => ({
    id,
    ord,
    stage: ord === 1 ? "FOUNDATION" : ord === 2 ? "FAMILIAR" : "RETAINED",
    gateLevel: ord === 1 ? 4 : ord === 2 ? 6 : 8,
    state,
    rankIndex: ord,
    reachedDay: null,
    held: false,
    closedDay: null,
    dueDay: addDays(MON, 120),
    ...extra,
  });
  const acceptedDay = addDays(MON, -30);
  const prevClose = addDays(MON, -1); // ready day r = MON
  const active = (milestones: AimStepMilestone[], track = false): AimStep => step({ open: { kind: "ACTIVE", roadmapId: "rm1", track, acceptedDay, milestones } });
  const plan = (): AimStepMilestone[] => [ms("m1", 1, "CLOSED", { reachedDay: prevClose, closedDay: prevClose }), ms("m2", 2, "PLANNED"), ms("m3", 3, "PLANNED")];
  const daily = Array.from({ length: AIM_START_DAILY_DAYS }, (_, i) => kind(line(addDays(MON, i), active(plan()))));
  check("START on each of its first 7 ready days", daily.every((k) => k === "START"), json(daily));
  eq("null on a Wednesday 9 days in; START on the next Monday", [kind(line(addDays(MON, 9), active(plan()))), kind(line(addDays(MON, 14), active(plan())))], [null, "START"]);
  check("Wednesday 9 days in is a Wednesday", weekdayOf(addDays(MON, 9)) === 3);
  eq(
    "the START line names the stage from STAGE_NAMES and the rank it gives; it leads to /you/roadmap#now",
    line(TUE, active(plan())),
    { kind: "START", milestoneId: "m2", ord: 2, stageName: "Familiar", givesRank: "Journeyman", href: "/you/roadmap#now" }
  );
  const trackLine = line(TUE, active(plan(), true));
  check("a track plan names no stage ('Milestone 2 is ready to start.')", trackLine?.kind === "START" && trackLine.stageName === null, json(trackLine));
  check("a stage that keeps your rank gives none ('It keeps your rank.')", (line(TUE, active([ms("m1", 1, "CLOSED", { reachedDay: prevClose, closedDay: prevClose, rankIndex: 2 }), ms("m2", 2, "PLANNED", { rankIndex: 2 })])) as { givesRank?: unknown } | null)?.givesRank === null);
  eq(
    "goalsLive false gives null; PAST_DUE gives null; a STARTED milestone gives null; a previous milestone closed today gives null",
    [
      kind(line(TUE, active(plan()), { goalsLive: false })),
      kind(line(TUE, active([ms("m1", 1, "CLOSED", { closedDay: prevClose }), ms("m2", 2, "PLANNED", { dueDay: addDays(TUE, -1) })]))),
      kind(line(TUE, active([ms("m1", 1, "OPEN"), ms("m2", 2, "PLANNED")]))),
      kind(line(TUE, active([ms("m1", 1, "CLOSED", { reachedDay: TUE, closedDay: TUE }), ms("m2", 2, "PLANNED")]))),
    ],
    [null, null, null, null]
  );
  eq(
    "a held (reached at acceptance) row is skipped: the next one is ready the day after acceptance",
    line(addDays(acceptedDay, 1), active([ms("m1", 1, "PLANNED", { held: true, reachedDay: acceptedDay }), ms("m2", 2, "PLANNED")])),
    { kind: "START", milestoneId: "m2", ord: 2, stageName: "Familiar", givesRank: "Journeyman", href: "/you/roadmap#now" }
  );
  const nextMon = addDays(MON, 7); // 7 days after the ready day: shown only because it is a Monday
  eq(
    "START snoozed for the same milestone 6 days ago gives null, 7 days ago START; a snooze for another milestone START; prompt OFF still allows START",
    [
      kind(line(nextMon, active(plan()), { stepCookie: stepCookieValue("START", "m2", addDays(nextMon, -6)) })),
      kind(line(nextMon, active(plan()), { stepCookie: stepCookieValue("START", "m2", addDays(nextMon, -7)) })),
      kind(line(nextMon, active(plan()), { stepCookie: stepCookieValue("START", "m3", addDays(nextMon, -1)) })),
      kind(line(nextMon, active(plan()), { prompt: "OFF" })),
    ],
    [null, "START", "START", "START"]
  );
  eq(
    "stepSnoozed: only its kind and id, within 7 days of its day; a malformed cookie snoozes nothing",
    [stepSnoozed(`START:m2:${MON}`, "START", "m2", addDays(MON, 6)), stepSnoozed(`START:m2:${MON}`, "DRAFT", "m2", MON), stepSnoozed("START:m2:garbage", "START", "m2", MON), stepSnoozed(undefined, "START", "m2", MON)],
    [true, false, false, false]
  );
  check("no step (a missing table) gives no line", todayAimLineOf({ step: null, prompt: "ASK", cookie: undefined, stepCookie: undefined, today: MON, goalsLive: true }) === null);
  check("DRAFT's three shows are AIM_DRAFT_SHOWS_MAX", AIM_DRAFT_SHOWS_MAX === 3);

  // ═══ Revision 5: one aim line across goals (contracts §23.3, ruling 53; lane 3) ═══
  const base = (today: DayKey, s: AimStep, extra: Partial<TodayAimLineInput> = {}): TodayAimLineInput => ({
    step: { ...s, lastOpenBefore: s.lastOpenBefore ?? addDays(today, -1) },
    prompt: "ASK",
    cookie: anchor3(today),
    stepCookie: undefined,
    today,
    goalsLive: true,
    ...extra,
  });
  const goalDraft = (id: string, savedDay: DayKey): AimStep => step({ open: { kind: "DRAFT", roadmapId: id, savedDay, running: false } });
  const goalActive = (id: string, milestones: AimStepMilestone[]): AimStep => step({ open: { kind: "ACTIVE", roadmapId: id, track: false, acceptedDay, milestones } });
  const cand = (roadmapId: string, slot: GoalSlot, k: AimLineCandidate["kind"], ready: boolean): AimLineCandidate => ({ roadmapId, slot, kind: k, ready });

  // SET is hidden at GOALS_MAX open (ruling 53: the effective cap, never the fixed 3).
  const quietDraft = goalDraft("rm1", MON); // saved today: its own line does not show
  eq(
    "SET is hidden at GOALS_MAX open: at GOALS_MAX 3 (the default, ruling N15) one open goal (its line quiet) offers SET; at a cap of 1 it gives nothing, as in revision 4",
    [kind(todayAimLineOf(base(MON, quietDraft))), kind(todayAimLineOf(base(MON, quietDraft, { goalsMax: 1 }))), kind(todayAimLineOf(base(MON, quietDraft, { goalsMax: 3 })))],
    ["SET WEEK", null, "SET WEEK"]
  );
  eq(
    "SET is hidden at GOALS_MAX open (across goals): 3 open of 3 hide it, 2 of 3 offer it, and 1 of 1 hides it",
    [
      kind(todayAimLineOf(base(MON, quietDraft, { goals: [cand("rm1", 1, "DRAFT", false), cand("rm2", 2, "START", false), cand("rm3", 3, "START", false)], goalsMax: 3 }))),
      kind(todayAimLineOf(base(MON, quietDraft, { goals: [cand("rm1", 1, "DRAFT", false), cand("rm2", 2, "START", false)], goalsMax: 3 }))),
      kind(todayAimLineOf(base(MON, quietDraft, { goals: [cand("rm1", 1, "DRAFT", false)], goalsMax: 1 }))),
      kind(todayAimLineOf(base(MON, step(), { goals: [] }))),
    ],
    [null, "SET WEEK", null, "SET WEEK"]
  );
  eq(
    "ruling N15: Today passes no goals list, so step.openCount hides SET once every seat is taken (3 of 3), offers it at 2 of 3, and its absence counts the one open goal",
    [
      kind(todayAimLineOf(base(MON, { ...quietDraft, openCount: 3 }))),
      kind(todayAimLineOf(base(MON, { ...quietDraft, openCount: 2 }))),
      kind(todayAimLineOf(base(MON, quietDraft))),
      kind(todayAimLineOf(base(MON, { ...quietDraft, openCount: Number.NaN }))),
    ],
    [null, "SET WEEK", "SET WEEK", "SET WEEK"]
  );
  {
    const beside = todayAimLineOf(base(MON, { ...quietDraft, openCount: 2 }));
    const alone = todayAimLineOf(base(MON, step()));
    eq("ruling N15: SET beside an open goal opens a new goal's form (/you/roadmap/new?new=1), never the open draft; with none open, the form as before", [beside?.href, alone?.href], ["/you/roadmap/new?new=1", "/you/roadmap/new"]);
  }
  check("no open goal reads as before with or without the goals list (SET under the back-off)", json(todayAimLineOf(base(MON, step(), { goals: [] }))) === json(todayAimLineOf(base(MON, step()))) && json(todayAimLineOf(base(MON, step()))) === json(line(MON, step(), { cookie: anchor3(MON) })));

  // The priority: a ready START (lowest seat), then a waiting DRAFT (lowest seat), then SET.
  const g2 = goalActive("rm2", plan());
  const g1draft = goalDraft("rm1", MON); // on TUE: its first show
  const c1 = aimLineCandidateOf(base(TUE, g1draft), 1);
  const c2 = aimLineCandidateOf(base(TUE, g2), 2);
  eq("aimLineCandidateOf: each goal's own line as a candidate (DRAFT, or START for an ACTIVE goal), ready when it shows today", [c1, c2], [cand("rm1", 1, "DRAFT", true), cand("rm2", 2, "START", true)]);
  const both = [c1!, c2!];
  eq(
    "priority: goal 2's ready START beats goal 1's waiting DRAFT: goal 2's call gives its START (its href carries ?goal=), goal 1's call gives nothing",
    [todayAimLineOf(base(TUE, g2, { goals: both })), todayAimLineOf(base(TUE, g1draft, { goals: both }))],
    [{ kind: "START", milestoneId: "m2", ord: 2, stageName: "Familiar", givesRank: "Journeyman", href: "/you/roadmap?goal=rm2#now" }, null]
  );
  const snoozed2 = stepCookieValue("START", "m2", TUE);
  const c2snoozed = aimLineCandidateOf(base(TUE, g2, { stepCookie: snoozed2 }), 2);
  eq(
    "priority: with goal 2's START hidden for a week, goal 1's waiting DRAFT is the line (its href carries ?goal=)",
    [c2snoozed?.ready, todayAimLineOf(base(TUE, g1draft, { stepCookie: snoozed2, goals: [c1!, c2snoozed!] })), todayAimLineOf(base(TUE, g2, { stepCookie: snoozed2, goals: [c1!, c2snoozed!] }))],
    [false, { kind: "DRAFT", roadmapId: "rm1", href: "/you/roadmap?goal=rm1" }, null]
  );
  const g3 = goalActive("rm3", plan());
  eq(
    "priority: two ready STARTs, the lower seat wins (whatever order the candidates come in)",
    [kind(todayAimLineOf(base(TUE, g2, { goals: [cand("rm3", 3, "START", true), cand("rm2", 2, "START", true)] }))), kind(todayAimLineOf(base(TUE, g3, { goals: [cand("rm2", 2, "START", true), cand("rm3", 3, "START", true)] })))],
    ["START", null]
  );
  eq(
    "priority: a waiting DRAFT beats SET, and a goal whose line is quiet gives way to SET only under the cap",
    [
      kind(todayAimLineOf(base(MON, quietDraft, { goals: [cand("rm1", 1, "DRAFT", false), cand("rm2", 2, "DRAFT", true)], goalsMax: 3 }))),
      kind(todayAimLineOf(base(MON, goalDraft("rm2", addDays(MON, -1)), { goals: [cand("rm1", 1, "DRAFT", false), cand("rm2", 2, "DRAFT", true)], goalsMax: 3 }))),
    ],
    [null, "DRAFT"]
  );
  eq(
    "a SET candidate from the caller is ignored: it is no open goal (2 of 3 still offer SET) and never a line of its own (SET is this rule's: the prompt, the fresh-start day, the back-off)",
    [
      kind(todayAimLineOf(base(MON, quietDraft, { goals: [cand("rm1", 1, "DRAFT", false), cand("rm2", 2, "START", false), cand("", 3, "SET", true)], goalsMax: 3 }))),
      kind(todayAimLineOf(base(TUE, goalDraft("rm1", TUE), { goals: [cand("rm1", 1, "DRAFT", false), cand("", 2, "SET", true)], goalsMax: 3 }))),
    ],
    ["SET WEEK", null]
  );
  // With one goal: the same line as revision 4, only its href carries the goal.
  const oneGoal: [string, DayKey, AimStep, Partial<TodayAimLineInput>][] = [
    ["a DRAFT's first show", TUE, draft(MON), {}],
    ["a DRAFT saved today", MON, draft(MON), {}],
    ["a START", TUE, active(plan()), {}],
    ["a START snoozed", TUE, active(plan()), { stepCookie: stepCookieValue("START", "m2", TUE) }],
    ["a START with goals off", TUE, active(plan()), { goalsLive: false }],
    ["no goal on a Monday", MON, step(), {}],
    ["no goal on a Tuesday", TUE, step(), {}],
  ];
  const strip = (v: AimLineView | null) => (v ? { ...v, href: v.href.replace(/\?goal=[^#]*/, "") } : null);
  const oneGoalBad = oneGoal.filter(([, today, s, extra]) => {
    const input = base(today, s, extra);
    const c = aimLineCandidateOf(input, 1);
    return json(strip(todayAimLineOf({ ...input, goals: c ? [c] : [] }))) !== json(todayAimLineOf(input));
  });
  check("one goal: the goals list gives revision 4's line in every case (the DRAFT and START hrefs only gain ?goal=)", oneGoalBad.length === 0, oneGoalBad.map(([n]) => n).join(", "));
  eq(
    "the hrefs: AIM_LINE_* stay revision 4's; per goal they carry ?goal=<id>, START's anchor kept at the end",
    [aimLineDraftHrefOf(null), aimLineStartHrefOf(null), aimLineDraftHrefOf("rm1"), aimLineStartHrefOf("rm1")],
    ["/you/roadmap", "/you/roadmap#now", "/you/roadmap?goal=rm1", "/you/roadmap?goal=rm1#now"]
  );
  check("aimLineCandidateOf: no open goal (or no step) gives none", aimLineCandidateOf(base(MON, step()), 1) === null && aimLineCandidateOf({ ...base(MON, step()), step: null }, 1) === null);

  // The step cookie holds up to AIM_STEP_COOKIE_ENTRIES_MAX lines (contracts §23.3).
  const e1 = stepCookieValueOf(null, "DRAFT", "rm1", MON);
  const e2 = stepCookieValueOf(e1, "START", "m2", TUE);
  const e3 = stepCookieValueOf(e2, "START", "m9", THU);
  const e4 = stepCookieValueOf(e3, "DRAFT", "rm3", addDays(MON, 4));
  eq(
    "the step cookie: the first entry is revision 4's value byte for byte; each new one goes first; past 3 the oldest goes",
    [e1, e2, e3, e4],
    [stepCookieValue("DRAFT", "rm1", MON), `START:m2:${TUE}.DRAFT:rm1:${MON}`, `START:m9:${THU}.START:m2:${TUE}.DRAFT:rm1:${MON}`, `DRAFT:rm3:${addDays(MON, 4)}.START:m9:${THU}.START:m2:${TUE}`]
  );
  eq(
    "the step cookie: hiding the same line again moves it first with today's day (never twice); a spent or malformed entry goes",
    [stepCookieValueOf(e3, "START", "m2", addDays(THU, 1)), stepCookieValueOf(e2, "START", "m9", addDays(MON, AIM_STEP_SNOOZE_DAYS)), stepCookieValueOf(`garbage.START:m2:${TUE}.START:../x:${TUE}`, "DRAFT", "rm1", TUE), stepCookieValueOf("", "DRAFT", "rm1", TUE)],
    [`START:m2:${addDays(THU, 1)}.START:m9:${THU}.DRAFT:rm1:${MON}`, `START:m9:${addDays(MON, AIM_STEP_SNOOZE_DAYS)}.START:m2:${TUE}`, `DRAFT:rm1:${TUE}.START:m2:${TUE}`, `DRAFT:rm1:${TUE}`]
  );
  eq(
    "stepSnoozed reads every entry: each named line is hidden within its own week; a line it doesn't name, a spent entry or a malformed one hides nothing",
    [
      stepSnoozed(e3, "DRAFT", "rm1", THU),
      stepSnoozed(e3, "START", "m2", THU),
      stepSnoozed(e3, "START", "m9", THU),
      stepSnoozed(e3, "START", "m3", THU),
      stepSnoozed(e3, "DRAFT", "rm1", addDays(MON, AIM_STEP_SNOOZE_DAYS)),
      stepSnoozed(e3, "START", "m2", addDays(MON, AIM_STEP_SNOOZE_DAYS)),
      stepSnoozed(`garbage.START:m2:${TUE}`, "START", "m2", TUE),
      stepSnoozed("garbage", "START", "m2", TUE),
    ],
    [true, true, true, false, false, true, true, false]
  );
  eq(
    "the aim line reads the multi-entry cookie: two goals' lines hidden at once, each for its own week (the START shows again on the Monday after)",
    [kind(line(TUE, draft(MON), { stepCookie: e2 })), kind(line(TUE, active(plan()), { stepCookie: e2 })), kind(line(addDays(MON, 14), active(plan()), { stepCookie: e2 }))],
    [null, null, "START"]
  );
}

// ═══ The vague-aim hint (F-R4-4) ════════════════════════════════════════════

console.log("— the vague-aim hint —");
{
  const hint = ["get better at math", "Learn Japanese", "stats", "Improve my Japanese", "I want to understand statistics"];
  const none = ["Hold a 30-minute conversation in Japanese", "Pass FRM Part 1", "Run a sub-50 10K", "", "   ", "Understand how Bayesian inference works", "Learn to read music at grade 5"];
  check("'get better at math', 'Learn Japanese', 'stats' (and a vague verb with a one-word object) give the hint", hint.every((a) => vagueAimHint(a)), json(hint.filter((a) => !vagueAimHint(a))));
  check("a concrete aim, a number, a standard, an object of 2+ words and '' give none", none.every((a) => !vagueAimHint(a)), json(none.filter((a) => vagueAimHint(a))));
}

// ═══ The capture line (F-R4-7) ══════════════════════════════════════════════

console.log("— the capture line —");
{
  eq(
    "aimLineOf: 'aim: Price options' → 'Price options'; '  AIM :x' → 'x'; 'aim:', 'aimless', 'goal: aim: x' and 'idea: aim: x' → null",
    ["aim: Price options", "  AIM :x", "aim:", "aim:   ", "aimless", "aimless walk", "goal: aim: x", "idea: aim: x", "Aim: hold a conversation\nin Japanese"].map(aimLineOf),
    ["Price options", "x", null, null, null, null, null, null, "hold a conversation\nin Japanese"]
  );
}

if (failed > 0) {
  console.log(`\nroadmap-invite-check: ${passed} passed, ${failed} FAILED`);
  process.exit(1);
}
console.log(`\nroadmap-invite-check: ${passed} passed, 0 failed`);
