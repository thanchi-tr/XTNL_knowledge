/**
 * Up to 3 goals, the pure parts (docs/life-plan/roadmap-contracts.md §23;
 * roadmap revision 5, lane 3): roadmap-goals (seats, the shares and the
 * hours' room, Today's round robin, the aim line's pick, labels, the
 * `?goal=` link and the intake's autosave key), the shares as the engine
 * reads them (the 5/1/5 h golden at the ramp floor), and constraint safety
 * across goals in the one gate (roadmap-types cueReadingOf and cueKeyOf,
 * roadmap-catalog allowedKindsFor, activityConfirmViewOf and
 * answerActivityCard: the AVOID union, the locked rows, a closed goal's
 * suggestion, the cue union and the "k3-" key).
 *
 * GOALS_MAX is 3 (ruling N15: up to 3 open goals at any time). The
 * one-goal answers are pinned at an explicit cap of 1: one seat (a 2nd open
 * goal is refused), a share of exactly 1, Today's first 3 rows, SET only
 * with no goal open, and the §19 gate, its reading and its key
 * byte-identical without other goals. The server's
 * paths (SLOT_FREE, KEY_FREE and createKey, DOMAINS_FREE, pause, resume and
 * archive, the family-X goldens) are roadmap-server-check's.
 *
 * Pure: no database, no clock, no model. scripts/_no-model.ts is imported
 * first, like every check that imports a roadmap module.
 *
 *   npx tsx scripts/roadmap-goals-check.ts
 */
import "./_no-model";
import * as RT from "../src/lib/roadmap-types";
import * as GL from "../src/lib/roadmap-goals";
import {
  ACTIVITY_NOTHING_TICKED,
  activityAsksOn,
  activityConfirmViewOf,
  activityGateOf,
  allowedKindsFor,
  answerActivityCard,
  constraintsStateOf,
  constraintsStateOfIntake,
  kindOnEveryTrack,
  type CatalogKey,
  type CatalogTrack,
} from "../src/lib/roadmap-catalog";
import { availableFor } from "../src/lib/roadmap-realism";
import { addDays, type DayKey } from "../src/lib/life-day";

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

// ═══ Fixtures ════════════════════════════════════════════════════════════════

let at = 0;
/** A goal row; each new one a minute later than the last (updatedAt orders ties and the paused list). */
function row(id: string, status: RT.RoadmapStatus, slot: number | null, o: Partial<GL.GoalRow> = {}): GL.GoalRow {
  at += 1;
  return {
    id,
    status,
    slot,
    label: null,
    fieldId: "f1",
    track: "CRAFT",
    areaName: "Business & Finance",
    hoursPerWeek: 5,
    updatedAt: `2026-10-0${1 + Math.floor(at / 60)}T00:${String(at % 60).padStart(2, "0")}:00.000Z`,
    ...o,
  };
}
const ids = (rows: readonly GL.GoalRow[]) => rows.map((r) => r.id);
const share = (roadmapId: string, status: RT.RoadmapStatus, hoursPerWeek: number, fieldId: string | null = null): GL.ShareGoal => ({ roadmapId, status, hoursPerWeek, fieldId });

// ═══ Seats (§23.1) ═══════════════════════════════════════════════════════════

console.log("— seats —");
{
  eq("GOALS_MAX is 3 (ruling N15: up to 3 open goals at any time), GOAL_SLOTS_MAX 3", [RT.GOALS_MAX, RT.GOAL_SLOTS_MAX], [3, 3]);
  eq("no goal at GOALS_MAX 3: every seat is free, not full", GL.seatsOf([]), { open: [], paused: [], free: [1, 2, 3], full: false });
  eq("no goal at a cap of 1: seat 1 is free, not full", GL.seatsOf([], 1), { open: [], paused: [], free: [1], full: false });
  const live = row("live", "ACTIVE", 1);
  const s1 = GL.seatsOf([live], 1);
  check("one live plan (seat 1, migration A's backfill) fills a cap of 1: no free seat, full", json(ids(s1.open)) === json(["live"]) && s1.free.length === 0 && s1.full);
  check("a 2nd open goal is refused at a cap of 1 (seatForNewOf null: the server answers ANOTHER_ACTIVE)", GL.seatForNewOf([live], 1) === null && GL.seatForNewOf([row("d", "DRAFT", 1)], 1) === null);
  check("…and at GOALS_MAX 3 it takes seat 2, and a 3rd seat 3 (ruling N15)", GL.seatForNewOf([live]) === 2 && GL.seatForNewOf([live, row("b", "DRAFT", 2)]) === 3 && GL.seatForNewOf([live, row("b", "DRAFT", 2), row("c", "ACTIVE", 3)]) === null);
  const unseated = row("old", "DRAFT", null);
  check(
    "ruling 24: a NULL-slot open row (saved by old code) still counts: full at a cap of 1, and at 3 it takes the lowest seat no other row holds",
    GL.seatsOf([unseated], 1).full && GL.seatForNewOf([unseated], 1) === null && json(GL.seatsOf([unseated], 3).free) === json([2, 3]) && json(GL.seatsOf([row("a", "ACTIVE", 1), unseated], 3).free) === json([3])
  );
  const mixed = [row("n", "DRAFT", null), row("c", "ACTIVE", 3), row("a", "ACTIVE", 1), row("p", "PAUSED", 2), row("x", "ARCHIVED", 2), row("z", "DONE", null)];
  const s3 = GL.seatsOf(mixed, 3);
  eq(
    "seatsOf at 3: open in slot order with a NULL slot last; PAUSED, DONE and ARCHIVED hold no seat; the NULL row takes seat 2, so none is free",
    [ids(s3.open), ids(s3.paused), s3.free, s3.full],
    [["a", "c", "n"], ["p"], [], true]
  );
  eq("…and without the unseated draft, seat 2 is free (a paused goal's stored slot sits outside the index: ruling 46)", GL.seatsOf(mixed.filter((r) => r.id !== "n"), 3).free, [2]);
  eq("seatForNewOf gives the lowest free seat (1 and 3 open → 2)", GL.seatForNewOf([row("a", "ACTIVE", 1), row("c", "DRAFT", 3)], 3), 2);
  eq("free lists only the slots 1..goalsMax (goalsMax 2 → never 3)", GL.seatsOf([], 2).free, [1, 2]);
  check("goalsMax defaults to GOALS_MAX, and a nonsense one reads it too", json(GL.seatsOf([])) === json(GL.seatsOf([], RT.GOALS_MAX)) && json(GL.seatsOf([], Number.NaN)) === json(GL.seatsOf([])));
  check("goalsMax is clamped to 1..GOAL_SLOTS_MAX (0 → 1, 9 → 3)", json(GL.seatsOf([], 0).free) === json([1]) && json(GL.seatsOf([], 9).free) === json([1, 2, 3]));
  check("a row id twice counts once", GL.seatsOf([row("a", "ACTIVE", 1), row("a", "ACTIVE", 1)], 3).open.length === 1);
}

console.log("— pause, resume and archive from PAUSED (the seats; §23.4, rulings 46 and 56) —");
{
  const g1 = row("g1", "ACTIVE", 1, { areaName: "Guitar", track: "CRAFT", fieldId: null });
  const g2 = row("g2", "ACTIVE", 2, { areaName: "Running", track: "BODY", fieldId: null });
  const g3 = row("g3", "ACTIVE", 3, { areaName: "Japanese", fieldId: "f2" });
  check("three open goals at goalsMax 3: full, no seat for a 4th", GL.seatsOf([g1, g2, g3], 3).full && GL.seatForNewOf([g1, g2, g3], 3) === null);
  const g2p = { ...g2, status: "PAUSED" as const };
  const afterPause = [g1, g2p, g3];
  eq("pausing goal 2 frees its seat (it keeps slot 2 stored: ruling 46)", [GL.seatsOf(afterPause, 3).free, ids(GL.seatsOf(afterPause, 3).paused), g2p.slot], [[2], ["g2"], 2]);
  eq("resume prefers the paused goal's own seat while it is free", GL.seatForReopenOf(g2p, afterPause, 3), 2);
  const g4 = row("g4", "DRAFT", 2, { areaName: "Cooking", track: "CARE", fieldId: null });
  const taken = [g1, g2p, g3, g4];
  check("a new goal takes seat 2 meanwhile; resume is then refused (GOALS_FULL at 3: no seat)", GL.seatForNewOf(afterPause, 3) === 2 && GL.seatForReopenOf(g2p, taken, 3) === null);
  eq("with seat 2 taken and seat 1 free, resume takes the lowest free seat", GL.seatForReopenOf(g2p, [g2p, g3, g4], 3), 1);
  const archived = [g1, { ...g2p, status: "ARCHIVED" as const }, g3, g4];
  check(
    "archive from PAUSED (ruling 56): the goal leaves the paused list and holds nothing; the seats stay as they were",
    GL.seatsOf(archived, 3).paused.length === 0 && GL.seatsOf(archived, 3).full && json(ids(GL.seatsOf(archived, 3).open)) === json(["g1", "g4", "g3"])
  );
  check(
    "a paused goal's label still holds its name (ruling 26) and an archived one's does not",
    GL.labelClashOf("Running", afterPause, null) && !GL.labelClashOf("Running", archived, null)
  );
  // A cap of 1: pause the one goal and a new one may open; resuming it then is refused (ANOTHER_ACTIVE at 1).
  const solo = row("solo", "PAUSED", 1);
  check("at a cap of 1, a paused goal frees the seat (seatForNewOf 1) and resumes into it when no other goal is open", GL.seatForNewOf([solo], 1) === 1 && GL.seatForReopenOf(solo, [solo], 1) === 1);
  check("…and with another goal open, resume is refused (ANOTHER_ACTIVE at a cap of 1)", GL.seatForReopenOf(solo, [solo, row("new", "DRAFT", 1)], 1) === null);
  check("…while at GOALS_MAX 3 it resumes into the next free seat (ruling N15)", GL.seatForReopenOf(solo, [solo, row("new", "DRAFT", 1)]) === 2);
  check("undo-discard reopens into the row's old seat; its own row in `rows` never counts against it", GL.seatForReopenOf({ id: "d", slot: 1 }, [row("d", "DRAFT", 1)]) === 1);
  check("a stored slot outside 1..3 reads as none: the reopen takes the lowest free seat", GL.seatForReopenOf({ id: "d", slot: 7 }, [row("a", "ACTIVE", 1)], 3) === 2);
}

// ═══ One person's week (§23.3) ═══════════════════════════════════════════════

console.log("— the shares and the hours' room —");
{
  eq("one goal gives exactly 1 and 1 (any hours, a Field or a track)", [GL.sharesOf([share("a", "ACTIVE", 7, "f1")]).a, GL.sharesOf([share("t", "DRAFT", 3)]).t], [
    { share: 1, fieldShare: 1, hours: 7, of: 7, fieldOf: 7 },
    { share: 1, fieldShare: 1, hours: 3, of: 3, fieldOf: 3 },
  ]);
  const s = GL.sharesOf([share("g1", "ACTIVE", 5, "f1"), share("g2", "ACTIVE", 1, null), share("g3", "DRAFT", 5, "f2")]);
  eq("the golden: 5, 1 and 5 h give 5/11, 1/11 and 5/11", [s.g1.share, s.g2.share, s.g3.share], [5 / 11, 1 / 11, 5 / 11]);
  check("the shares sum to 1 over the seat statuses", Math.abs(s.g1.share + s.g2.share + s.g3.share - 1) < 1e-12);
  eq("the Field pace share is within one Field only: a lone Finance goal keeps its whole Finance pace; a track goal's is 1", [s.g1.fieldShare, s.g2.fieldShare, s.g3.fieldShare], [1, 1, 1]);
  const f = GL.sharesOf([share("a", "ACTIVE", 6, "f1"), share("b", "DRAFT", 2, "f1"), share("c", "ACTIVE", 4, null)]);
  eq("two goals in one Field split its pace by their hours (6 and 2 h → 3/4 and 1/4); the of and fieldOf sums", [f.a.fieldShare, f.b.fieldShare, f.c.fieldShare, f.a.of, f.a.fieldOf, f.c.fieldOf], [0.75, 0.25, 1, 12, 8, 4]);
  const p = GL.sharesOf([share("a", "ACTIVE", 5, "f1"), share("p", "PAUSED", 5, "f1"), share("d", "DONE", 9, null)]);
  eq("a PAUSED, DONE or ARCHIVED goal gets 0 and 0 and leaves the sums (ruling 25): the open one keeps 1", [p.a.share, p.a.fieldShare, p.p.share, p.p.fieldShare, p.d.share, p.a.of], [1, 1, 0, 0, 0, 5]);
  eq("no hours to divide: the seat goals split evenly", [GL.sharesOf([share("a", "ACTIVE", 0), share("b", "DRAFT", Number.NaN)]).a.share, GL.sharesOf([share("a", "ACTIVE", 0), share("b", "DRAFT", Number.NaN)]).b.share], [0.5, 0.5]);
  check("an id like __proto__ is an own entry, never a prototype", Object.prototype.hasOwnProperty.call(GL.sharesOf([share("__proto__", "ACTIVE", 2)]), "__proto__"));

  eq("hoursRoomOf: goals of 20 and 14 h leave 6 for a new one (exceptId null)", GL.hoursRoomOf([share("a", "ACTIVE", 20), share("b", "DRAFT", 14)], null), { taken: 34, left: 6 });
  eq("…the goal being edited leaves its own hours out (exceptId)", GL.hoursRoomOf([share("a", "ACTIVE", 20), share("b", "DRAFT", 14)], "b"), { taken: 20, left: 20 });
  eq("…a PAUSED goal's hours leave the sum (ruling 25), and the room never goes below 0", [GL.hoursRoomOf([share("a", "ACTIVE", 20), share("p", "PAUSED", 14)], null), GL.hoursRoomOf([share("a", "ACTIVE", 30), share("b", "ACTIVE", 25)], null)], [
    { taken: 20, left: 20 },
    { taken: 55, left: 0 },
  ]);
  eq('hoursOverLineOf(34, 6) is "Your goals already take 34 h; this one can have up to 6 h"', GL.hoursOverLineOf(34, 6), "Your goals already take 34 h; this one can have up to 6 h");
  eq("…a half hour reads one decimal", GL.hoursOverLineOf(37.5, 2.5), "Your goals already take 37.5 h; this one can have up to 2.5 h");
  // The engine reads the shares (ruling 54): the 5/1/5 h golden at RAMP_FLOOR_MIN 120 gives about 55, 11 and 55 minutes.
  const tracked = { kind: "measured" as const, median: 60, p25: 60, weeks: 8 };
  const cal = { kind: "calibrating" as const, have: 1, need: 4 };
  const tp: RT.Throughput = {
    finalDay: "2026-10-03",
    trackedMinutes: tracked,
    geminiShare: null,
    playMinutes: cal,
    trackedByTrack: {},
    trackedByCategory: {},
    completions: cal,
    activeDays: cal,
    adherence: { kind: "calibrating", have: 0, need: 8 },
    reviewsPerDay: cal,
    passShare: { kind: "measured", value: 0.8, n: 120 },
    clearance: { kind: "calibrating", have: 0, need: 1 },
    newCards: { total: cal, byField: {}, byDomain: {} },
  };
  const mon: DayKey = "2026-10-05";
  const inputOf = (hours: number, sg: RT.RealismInput["share"]): RT.RealismInput => ({
    today: mon,
    targetDay: addDays(mon, 70),
    scopes: [],
    throughput: tp,
    hoursPerWeek: hours,
    intensity: "STEADY",
    startPoint: "NEW",
    typicalHours: null,
    typicalHoursSource: null,
    m: 1,
    heldDays: [],
    areaInMaintenance: false,
    practicesAllowed: true,
    trackArea: false,
    share: sg,
  });
  const mins = [
    ["g1", 5],
    ["g2", 1],
    ["g3", 5],
  ].map(([id, h]) => availableFor(mon, inputOf(h as number, s[id as string].share)).minutes);
  eq("the 5/1/5 h golden through availableFor at RAMP_FLOOR_MIN 120: ≈ 55, 11 and 55 minutes a week", [RT.RAMP_FLOOR_MIN, ...mins.map((m) => Math.round(m))], [120, 55, 11, 55]);
  check("…one goal's share (1) is byte-identical to no share at all (M13)", json(availableFor(mon, inputOf(5, GL.sharesOf([share("a", "ACTIVE", 5)]).a.share))) === json(availableFor(mon, inputOf(5, undefined))));
}

// ═══ Today (§23.3) ═══════════════════════════════════════════════════════════

console.log("— Today: the round robin and the aim line —");
{
  const rows = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
  const one = GL.todayRowsOf([{ slot: 1, rows: rows("a", 5) }]);
  eq("1 goal: its first 3 rows in its own order, byte-identical to today's slice(0, 3); 2 more", [one.picked.map((x) => x.row), one.more], [rows("a", 5).slice(0, RT.WEEK_QUEST_ROWS_TODAY), [{ slot: 1, count: 2 }]]);
  eq("…with 3 or fewer rows, every row and no 'more'", GL.todayRowsOf([{ slot: 1, rows: rows("a", 2) }]), { picked: [{ slot: 1, row: "a1" }, { slot: 1, row: "a2" }], more: [] });
  const two = GL.todayRowsOf([
    { slot: 2, rows: rows("b", 4) },
    { slot: 1, rows: rows("a", 4) },
  ]);
  eq("2 goals: 2 and 1, the lower seat first (whatever the input order); each goal's rows left out counted by seat", [two.picked.map((x) => `${x.slot}:${x.row}`), two.more], [["1:a1", "1:a2", "2:b1"], [{ slot: 1, count: 2 }, { slot: 2, count: 3 }]]);
  const three = GL.todayRowsOf([
    { slot: 1, rows: rows("a", 2) },
    { slot: 2, rows: rows("b", 2) },
    { slot: 3, rows: rows("c", 2) },
  ]);
  eq("3 goals: 1 each", three.picked.map((x) => `${x.slot}:${x.row}`), ["1:a1", "2:b1", "3:c1"]);
  eq(
    "a goal with fewer rows than its share gives its rest to the next seat (1 + 2; and 0 + 3)",
    [GL.todayRowsOf([{ slot: 1, rows: ["a1"] }, { slot: 2, rows: rows("b", 5) }]).picked.map((x) => x.row), GL.todayRowsOf([{ slot: 1, rows: [] }, { slot: 3, rows: rows("c", 5) }]).picked.map((x) => x.row)],
    [["a1", "b1", "b2"], ["c1", "c2", "c3"]]
  );
  eq("max is honoured (5 over 2 goals: 3 + 2), and 0 picks nothing", [GL.todayRowsOf([{ slot: 1, rows: rows("a", 9) }, { slot: 2, rows: rows("b", 9) }], 5).picked.length, GL.todayRowsOf([{ slot: 1, rows: rows("a", 9) }], 0).picked.length], [5, 0]);

  const c = (roadmapId: string, slot: RT.GoalSlot, kind: GL.AimLineCandidate["kind"], ready = true): GL.AimLineCandidate => ({ roadmapId, slot, kind, ready });
  eq("a cap of 1, no goal open: SET", GL.aimLinePickOf([c("new", 1, "SET")], 0, 1)?.kind, "SET");
  eq("a cap of 1, one goal open: SET never shows (todayAimLineOf: SET only with no goal open)", GL.aimLinePickOf([c("new", 2, "SET")], 1, 1), null);
  eq(
    "the order: a ready START (lowest seat), then a waiting DRAFT (lowest seat), then SET",
    [
      GL.aimLinePickOf([c("s3", 3, "START"), c("d1", 1, "DRAFT"), c("s2", 2, "START"), c("new", 1, "SET")], 2, 3)?.roadmapId,
      GL.aimLinePickOf([c("d3", 3, "DRAFT"), c("d2", 2, "DRAFT"), c("new", 1, "SET")], 2, 3)?.roadmapId,
      GL.aimLinePickOf([c("s1", 1, "START", false), c("new", 1, "SET")], 1, 3)?.kind,
    ],
    ["s2", "d2", "SET"]
  );
  eq("a candidate that isn't ready never shows", GL.aimLinePickOf([c("s1", 1, "START", false), c("d2", 2, "DRAFT", false)], 2, 3), null);
  eq("at goalsMax 3: SET at 2 open, hidden at 3 open (ruling 53: hidden at GOALS_MAX open)", [GL.aimLinePickOf([c("new", 3, "SET")], 2, 3)?.kind, GL.aimLinePickOf([c("new", 3, "SET")], 3, 3)], ["SET", null]);
  check("goalsMax defaults to GOALS_MAX (3: SET at 1 open, ruling N15)", json(GL.aimLinePickOf([c("new", 2, "SET")], 1)) === json(GL.aimLinePickOf([c("new", 2, "SET")], 1, RT.GOALS_MAX)) && GL.aimLinePickOf([c("new", 2, "SET")], 1)?.kind === "SET");
}

// ═══ Labels, links and keys (§23.1, §23.5) ═══════════════════════════════════

console.log("— labels, the ?goal= link and the autosave key —");
{
  eq("defaultGoalLabelOf: the Area name, one line (the seat glyph is a glyph, never text)", [GL.defaultGoalLabelOf({ areaName: "Business & Finance", slot: 2 }), GL.defaultGoalLabelOf({ areaName: "  Body   and mind ", slot: null })], ["Business & Finance", "Body and mind"]);
  eq("…an Area with no name reads 'Goal {k}' (or 'Goal' with no seat)", [GL.defaultGoalLabelOf({ areaName: "", slot: 3 }), GL.defaultGoalLabelOf({ areaName: " ", slot: null })], ["Goal 3", "Goal"]);
  eq(
    "goalLabelOf: yours (cleaned), else the default; never the model's",
    [GL.goalLabelOf(row("a", "ACTIVE", 1, { label: " Guitar " })), GL.goalLabelOf(row("b", "ACTIVE", 2, { label: null })), GL.goalLabelOf(row("c", "ACTIVE", 2, { label: "   " }))],
    [
      { text: "Guitar", yours: true },
      { text: "Business & Finance", yours: false },
      { text: "Business & Finance", yours: false },
    ]
  );
  eq(
    "cleanGoalLabelOf: one line of at most GOAL_LABEL_MAX (16) characters, counted as code points, or null",
    [GL.cleanGoalLabelOf("  My\nfirst   guitar  "), GL.cleanGoalLabelOf("abcdefghijklmnopqrstu"), GL.cleanGoalLabelOf("🎸🎸🎸🎸🎸🎸🎸🎸🎸🎸🎸🎸🎸🎸🎸🎸🎸"), GL.cleanGoalLabelOf(""), GL.cleanGoalLabelOf(" \t "), GL.cleanGoalLabelOf(42), GL.cleanGoalLabelOf(null)],
    ["My first guitar", "abcdefghijklmnop", "🎸".repeat(16), null, null, null, null]
  );
  check("…a cut never ends in a space", GL.cleanGoalLabelOf("abcdefghijklmno pq") === "abcdefghijklmno");
  const area1 = row("a1", "ACTIVE", 1);
  const area2 = row("a2", "DRAFT", 2);
  check("labelClashOf: two goals in one Area clash while neither has a label of its own (LABEL_CLASH, ruling 26)", GL.labelClashOf(GL.defaultGoalLabelOf(area2), [area1, area2], "a2"));
  check("…a label of its own ends the clash; the comparison ignores case, width and spacing", !GL.labelClashOf("Stats", [area1, area2], "a2") && GL.labelClashOf("  business &  FINANCE", [area1], null) && GL.labelClashOf("Ｇｕｉｔａｒ", [row("g", "PAUSED", 1, { label: "guitar" })], null));
  check("…DONE and ARCHIVED goals never clash; exceptId is never compared with itself; an empty label clashes with nothing", !GL.labelClashOf("Business & Finance", [row("d", "DONE", null), row("x", "ARCHIVED", null)], null) && !GL.labelClashOf("Business & Finance", [area1], "a1") && !GL.labelClashOf("  ", [area1], null));

  eq(
    "goalHrefOf: the goal param, a #anchor kept at the end, other params kept, an earlier goal param replaced; null → base",
    [GL.goalHrefOf("/you/roadmap", "abc"), GL.goalHrefOf("/you/roadmap#now", "abc"), GL.goalHrefOf("/you/roadmap?x=1#now", "abc"), GL.goalHrefOf("/you/roadmap?goal=old&x=1", "new"), GL.goalHrefOf("/you/roadmap#now", null), GL.goalHrefOf("/you/roadmap/new", "a b")],
    ["/you/roadmap?goal=abc", "/you/roadmap?goal=abc#now", "/you/roadmap?x=1&goal=abc#now", "/you/roadmap?x=1&goal=new", "/you/roadmap#now", "/you/roadmap/new?goal=a%20b"]
  );
  eq('GOAL_PARAM is "goal"', GL.GOAL_PARAM, "goal");
  const mine = [row("m1", "ACTIVE", 1), row("m2", "PAUSED", null)];
  eq(
    "goalOfParam: the id only when it is the user's own; a forged id (family X), an array, a number or nothing is null",
    [GL.goalOfParam("m2", mine), GL.goalOfParam("theirs", mine), GL.goalOfParam(["m1"], mine), GL.goalOfParam(1, mine), GL.goalOfParam(undefined, mine), GL.goalOfParam("", mine)],
    ["m2", null, null, null, null, null]
  );
  eq("intakeAutosaveKeyOf: per goal, and ':new' for a goal not yet saved (ruling 66)", [GL.intakeAutosaveKeyOf("ck1"), GL.intakeAutosaveKeyOf(null), GL.intakeAutosaveKeyOf("")], ["xtnl:roadmap:intake:ck1", "xtnl:roadmap:intake:new", "xtnl:roadmap:intake:new"]);
}

// ═══ Constraint safety across goals (§23.6): the one gate, its inputs user-wide ═══

console.log("— constraint safety across goals: the cue union, the k3- key, the AVOID union (§23.6) —");
{
  const DAY: DayKey = "2026-10-06";
  const texts = (aim: string, constraints: string | null = null, notes: string[] = []): RT.CueTexts => ({ constraints, aim, notes });
  const other = (roadmapId: string, slot: RT.GoalSlot | null, t: RT.CueTexts): RT.GoalCueTexts => ({ roadmapId, slot, texts: t });
  const avoids = (roadmapId: string, slot: RT.GoalSlot | null, status: RT.RoadmapStatus, track: CatalogTrack, kinds: CatalogKey[], reason = "my knee"): RT.GoalAvoids => ({
    roadmapId,
    slot,
    status,
    track,
    kinds: Object.fromEntries(kinds.map((k) => [k, { verdict: "AVOID" as const, day: "2026-10-01", reason }])),
  });
  const state = (track: CatalogTrack, t: RT.CueTexts, others?: readonly RT.GoalAvoids[]) => constraintsStateOf({ track, texts: t, others });
  const rowOf = (g: RT.ActivityGate, k: CatalogKey) => g.rows.find((r) => r.kind === k) ?? null;

  // One goal: every §19 answer byte-identical.
  const guitar = texts("Learn guitar", "my wrist aches after long sessions", ["Grade 3 exam"]);
  check(
    "one goal: cueReadingOf and cueKeyOf with others absent or empty are today's, byte for byte (the 'k2-' key)",
    json(RT.cueReadingOf({ ...guitar, others: [] })) === json(RT.cueReadingOf(guitar)) && RT.cueKeyOf({ ...guitar, others: [] }, "CRAFT") === RT.cueKeyOf(guitar, "CRAFT") && RT.cueKeyOf(guitar, "CRAFT").startsWith("k2-")
  );
  check(
    "one goal: the state, the gate and the card with others empty equal today's (no `others`, no `from`, no `locked`, no quoteGoals)",
    ["CRAFT", "BODY", "CARE", "FIELD", "DUTY"].every((tr) => {
      const a = state(tr as CatalogTrack, guitar);
      const b = state(tr as CatalogTrack, { ...guitar, others: [] }, []);
      // The state echoes the texts it was given (here with an empty `others`); everything it derives is today's.
      return (
        json({ ...a, texts: null }) === json({ ...b, texts: null }) &&
        json(allowedKindsFor(a, null)) === json(allowedKindsFor(b, null)) &&
        json(activityConfirmViewOf(a, allowedKindsFor(a, null))) === json(activityConfirmViewOf(b, allowedKindsFor(b, null)))
      );
    })
  );
  const intake: RT.Intake = {
    aim: "Run a 10K",
    fieldId: null,
    track: "BODY",
    domainIds: [],
    targetDay: "2027-03-01",
    hoursPerWeek: 4,
    newCardsPerWeek: null,
    typicalHours: null,
    typicalHoursSource: null,
    syllabus: null,
    startPoint: "NEW",
    intensity: "STEADY",
    practicesAllowed: true,
    constraints: null,
    examLabel: null,
  };
  check(
    "constraintsStateOfIntake and activityGateOf without `goals` (or with empty ones) are today's",
    json(constraintsStateOfIntake(intake, null, { texts: [], avoids: [] })) === json(constraintsStateOfIntake(intake)) && json(activityGateOf(intake, null, null)) === json(activityGateOf(intake))
  );

  // The cue union: "XG: goal 1's carpal tunnel gates goal 3's SLOW_DRILLS, RUN_THROUGHS and WITH_A_PARTNER" (the pure half).
  const wrist = texts("Rehab my wrist after carpal tunnel surgery");
  const goal3Alone = state("CRAFT", texts("Learn guitar"));
  const goal3 = state("CRAFT", { ...texts("Learn guitar"), others: [other("g1", 1, wrist)] });
  const gate3 = allowedKindsFor(goal3, null);
  const view3 = activityConfirmViewOf(goal3, gate3);
  check(
    "a cue in goal 1's words (BODY: 'rehab my wrist after carpal tunnel surgery') turns goal 3's CRAFT card on: SLOW_DRILLS, RUN_THROUGHS and WITH_A_PARTNER wait",
    !activityAsksOn(goal3Alone) && activityAsksOn(goal3) && (["SLOW_DRILLS", "RUN_THROUGHS", "WITH_A_PARTNER"] as CatalogKey[]).every((k) => gate3.blocked.includes(k) && gate3.pending.includes(k)),
    json(gate3.pending)
  );
  check(
    "…every cue from goal 1 is tagged with its goal, and the card's quote names goal 1 (quoteGoals [1])",
    goal3.reading.cues.length > 0 && goal3.reading.cues.every((c) => c.goal?.roadmapId === "g1" && c.goal.slot === 1) && json(view3.quotes) === json(["Rehab my wrist after carpal tunnel surgery"]) && json(view3.quoteGoals) === json([1]),
    json([view3.quotes, view3.quoteGoals])
  );
  const both = state("CRAFT", { ...texts("Learn guitar", "my thumb is sore"), others: [other("g1", 1, wrist)] });
  const viewBoth = activityConfirmViewOf(both, allowedKindsFor(both, null));
  check("quotes take this goal's cues first, then the others' (quoteGoals null, then 1)", json(viewBoth.quoteGoals) === json([null, 1]) && viewBoth.quotes[0] === "my thumb is sore", json([viewBoth.quotes, viewBoth.quoteGoals]));
  const pausedQuote = state("CRAFT", { ...texts("Learn guitar"), others: [other("g1", null, wrist)] });
  check("a paused goal's cue reads with no seat (ruling 55: the server passes slot null)", json(activityConfirmViewOf(pausedQuote, allowedKindsFor(pausedQuote, null)).quoteGoals) === json([null]));

  // The "k3-" key (ruling 29).
  const k3 = RT.cueKeyOf({ ...texts("Learn guitar"), others: [other("g1", 1, wrist), other("g2", 2, texts("Run a 10K"))] }, "CRAFT");
  check(
    "cueKeyOf with other goals' texts is 'k3-', independent of their order and of their seats; any goal's words change it",
    k3.startsWith("k3-") &&
      k3 === RT.cueKeyOf({ ...texts("Learn guitar"), others: [other("g2", 3, texts("Run a 10K")), other("g1", null, wrist)] }, "CRAFT") &&
      k3 !== RT.cueKeyOf({ ...texts("Learn guitar"), others: [other("g1", 1, wrist), other("g2", 2, texts("Run a half marathon"))] }, "CRAFT") &&
      k3 !== RT.cueKeyOf(texts("Learn guitar"), "CRAFT"),
    k3
  );
  const k2Answer: RT.ActivityConfirm = { key: RT.cueKeyOf(texts("Learn guitar", "my wrist"), "CRAFT"), kinds: {}, answered: { day: "2026-10-02", asked: ["SLOW_DRILLS", "RUN_THROUGHS", "WITH_A_PARTNER", "FULL_ATTEMPT", "PERFORMANCE_CHECK"], none: true } };
  const k3Card = state("CRAFT", { ...texts("Learn guitar", "my wrist"), others: [other("g1", 1, wrist)] });
  const k3Gate = allowedKindsFor(k3Card, k2Answer);
  check("a 'k2-' answer under a 'k3-' card is stale: the card asks again with the answer's day", k3Gate.answered === null && k3Gate.staleDay === "2026-10-02" && k3Gate.pending.includes("SLOW_DRILLS"), json(k3Gate));

  // The AVOID union: "XG: goal 1's AVOID of HARDER_SESSION stays locked on goal 2's card" (the pure half).
  const g1Avoid = avoids("g1", 1, "ACTIVE", "BODY", ["HARDER_SESSION"]);
  const goal2 = state("BODY", texts("Run a 10K"), [g1Avoid]);
  const gate2 = allowedKindsFor(goal2, null);
  const locked = rowOf(gate2, "HARDER_SESSION");
  eq(
    "goal 1's AVOID of HARDER_SESSION is ticked and locked on goal 2's BODY card: AVOID, blocked, from goal 1, its day and reason, class YOURS",
    [locked, gate2.blocked.includes("HARDER_SESSION"), gate2.pending.includes("HARDER_SESSION")],
    [{ kind: "HARDER_SESSION", state: "AVOID", gated: true, prefill: null, reason: "my knee", day: "2026-10-01", staleDay: null, cls: "YOURS", from: { roadmapId: "g1", slot: 1, closed: false }, locked: true }, true, false]
  );
  const none = answerActivityCard(null, goal2, { key: goal2.key, avoid: ["HARDER_SESSION"], nothingToAvoid: true }, DAY);
  check(
    "goal 2's 'Nothing to avoid' (its locked tick left on) is accepted, stores nothing of HARDER_SESSION and never lists it as asked (ruling 27)",
    none.ok && !("HARDER_SESSION" in none.value.kinds) && !!none.value.answered && !none.value.answered.asked.includes("HARDER_SESSION") && none.value.answered.asked.includes("LONGER_SESSION"),
    json(none)
  );
  const after = none.ok ? allowedKindsFor(goal2, none.value) : null;
  check(
    "…HARDER_SESSION stays blocked and locked on goal 2 while goal 1 avoids it; LONGER_SESSION is placed (FINE)",
    !!after && after.blocked.includes("HARDER_SESSION") && rowOf(after, "HARDER_SESSION")?.locked === true && rowOf(after, "LONGER_SESSION")?.state === "FINE",
    json(after?.rows)
  );
  const lifted = none.ok ? allowedKindsFor(state("BODY", texts("Run a 10K"), [avoids("g1", 1, "ACTIVE", "BODY", [])]), none.value) : null;
  check("lifting it on goal 1 makes goal 2's card ask for HARDER_SESSION again (PENDING), never a silent release", !!lifted && rowOf(lifted, "HARDER_SESSION")?.state === "PENDING" && lifted.blocked.includes("HARDER_SESSION"), json(lifted?.rows));
  const onlyLocked = answerActivityCard(null, goal2, { key: goal2.key, avoid: ["HARDER_SESSION"], nothingToAvoid: false }, DAY);
  check("a Save whose only tick is a locked row ticks nothing of goal 2's own: refused (ACTIVITY_NOTHING_TICKED)", !onlyLocked.ok && onlyLocked.error === ACTIVITY_NOTHING_TICKED);
  const ownToo = state("BODY", texts("Run a 10K"), [g1Avoid]);
  const prevOwn: RT.ActivityConfirm = { key: ownToo.key, kinds: { HARDER_SESSION: { verdict: "AVOID", day: "2026-09-30", reason: "shin splints" } }, answered: null };
  const ownRow = rowOf(allowedKindsFor(ownToo, prevOwn), "HARDER_SESSION");
  check("goal 2's own AVOID of the same kind is its own row (unlocked, its own reason); lifting its own leaves goal 1's lock", ownRow?.locked === undefined && ownRow?.reason === "shin splints" && ownRow?.state === "AVOID");
  const liftOwn = answerActivityCard(prevOwn, ownToo, { key: ownToo.key, avoid: ["LONGER_SESSION"], nothingToAvoid: false }, DAY);
  check("…and after goal 2 unticks it, the row is goal 1's, locked", liftOwn.ok && rowOf(allowedKindsFor(ownToo, liftOwn.value), "HARDER_SESSION")?.locked === true && !("HARDER_SESSION" in liftOwn.value.kinds), json(liftOwn));

  // Tracks: an AVOID holds on its own track, and on every track when the kind is on every track.
  check(
    "kindOnEveryTrack: Full attempt, Performance check, Mock test, Set up, Book the exam and Exam day; never a track's own practice",
    (["FULL_ATTEMPT", "PERFORMANCE_CHECK", "MOCK_TEST", "SET_UP", "BOOK_EXAM", "EXAM_DAY"] as CatalogKey[]).every(kindOnEveryTrack) && !kindOnEveryTrack("HARDER_SESSION") && !kindOnEveryTrack("SLOW_DRILLS") && !kindOnEveryTrack("nope")
  );
  const fieldGoal = avoids("gF", 2, "ACTIVE", "FIELD", ["FULL_ATTEMPT", "SLOW_DRILLS"]);
  const bodyCard = allowedKindsFor(state("BODY", texts("Run a 10K"), [fieldGoal]), null);
  const craftCard = allowedKindsFor(state("CRAFT", texts("Learn guitar"), [fieldGoal]), null);
  check(
    "a Field goal's AVOID of FULL_ATTEMPT (on every track) locks it on a BODY card; its SLOW_DRILLS (FIELD and CRAFT, not every track) never reaches a CRAFT card",
    rowOf(bodyCard, "FULL_ATTEMPT")?.locked === true && bodyCard.blocked.includes("FULL_ATTEMPT") && rowOf(craftCard, "FULL_ATTEMPT")?.locked === true && !craftCard.blocked.includes("SLOW_DRILLS"),
    json([bodyCard.rows, craftCard.rows])
  );
  const offGate = allowedKindsFor(state("DUTY", texts("Do my taxes"), [avoids("gD", 1, "ACTIVE", "DUTY", ["SET_TIME"])]), null);
  check("an open goal's AVOID blocks even where the gate never asks (DUTY), as this goal's own AVOID would", !offGate.on && offGate.blocked.includes("SET_TIME") && rowOf(offGate, "SET_TIME")?.locked === true);
  const pausedLock = rowOf(allowedKindsFor(state("BODY", texts("Run a 10K"), [avoids("g1", 1, "PAUSED", "BODY", ["HARDER_SESSION"])]), null), "HARDER_SESSION");
  check("a PAUSED goal's AVOID still holds (HOLD_STATUSES), shown with no seat (ruling 55)", pausedLock?.locked === true && json(pausedLock?.from) === json({ roadmapId: "g1", slot: null, closed: false }));
  const twoLocks = rowOf(allowedKindsFor(state("BODY", texts("Run a 10K"), [avoids("g3", 3, "ACTIVE", "BODY", ["HARDER_SESSION"]), avoids("g1", 1, "DRAFT", "BODY", ["HARDER_SESSION"], "back pain")]), null), "HARDER_SESSION");
  check("two goals avoiding one kind: the lowest seat's names the row", twoLocks?.from?.roadmapId === "g1" && twoLocks?.reason === "back pain");

  // A closed goal's AVOID (ruling 28): a suggestion while unanswered, unlocked, never a block by itself.
  const closed = avoids("g0", null, "ARCHIVED", "BODY", ["HARDER_SESSION"]);
  const fresh = state("BODY", texts("Run a 10K"), [closed]);
  const hint = rowOf(allowedKindsFor(fresh, null), "HARDER_SESSION");
  eq(
    "a closed goal's AVOID pre-ticks a new card's row, unlocked, 'from an earlier goal' (from.closed); it waits only because BODY asks",
    hint && [hint.state, hint.prefill, hint.locked, hint.from, hint.reason],
    ["PENDING", "AVOID", undefined, { roadmapId: "g0", slot: null, closed: true }, "my knee"]
  );
  const answered = answerActivityCard(null, fresh, { key: fresh.key, avoid: ["LONGER_SESSION"], nothingToAvoid: false }, DAY);
  const afterAnswer = answered.ok ? rowOf(allowedKindsFor(fresh, answered.value), "HARDER_SESSION") : null;
  check("…once the card is answered under its key without that tick, the suggestion is gone and the kind is placed (FINE)", afterAnswer?.state === "FINE" && afterAnswer.from === undefined, json(afterAnswer));
  const dutyHint = allowedKindsFor(state("DUTY", texts("Do my taxes"), [avoids("g0", null, "DONE", "DUTY", ["SET_TIME"])]), null);
  check("…and where the gate never asks, a closed goal's AVOID is a suggestion only (WORDS, placed)", rowOf(dutyHint, "SET_TIME")?.state === "WORDS" && dutyHint.allowed.includes("SET_TIME") && !dutyHint.blocked.includes("SET_TIME"));
}

console.log("");
if (failed > 0) {
  console.log(`roadmap-goals-check: ${passed} passed, ${failed} FAILED`);
  process.exit(1);
}
console.log(`roadmap-goals-check: ${passed} passed, 0 failed`);
