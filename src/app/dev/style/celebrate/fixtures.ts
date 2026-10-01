/**
 * /dev/style/celebrate fixtures (L3-celebrate). Labelled before/after
 * snapshots run through the REAL detectors (celebration-detect.ts), so the
 * lab shows exactly what a diff produces. Nothing here reaches a real page;
 * scripts/celebration-check.ts asserts every fixture's moments are honest.
 *
 * Pure and dependency-light (relative imports) so the check can load it.
 */
import { diffProgress, draftToEvent, type CelebrationDraft, type LevelsPart, type ProgressData } from "../../../../lib/celebration-detect";
import type { CelebrationEvent } from "../../../../lib/celebration-types";
import { SKILL_POOL } from "../../../../lib/skill-pool";

export interface Fixture {
  name: string;
  /** What the diff is, in words. */
  note: string;
  before: ProgressData;
  after: ProgressData;
  /** The dedupe keys the diff must produce (checked). Empty: it must produce nothing. */
  expect: string[];
}

const TODAY = "2026-10-01";

type FieldSpec = [id: string, name: string, level: number, domains?: [id: string, name: string, level: number][]];
function levels(fields: FieldSpec[], ultimates = 0): LevelsPart {
  return {
    fields: fields.map(([id, name, level]) => ({ id, name, level })),
    domains: fields.flatMap(([fid, , , ds]) => (ds ?? []).map(([id, name, level]) => ({ id, name, fieldId: fid, level }))),
    ultimates,
  };
}
const only = (part: keyof Omit<ProgressData, "parts">, b: unknown, a: unknown): Pick<Fixture, "before" | "after"> => ({
  before: { parts: [part], [part]: b } as ProgressData,
  after: { parts: [part], [part]: a } as ProgressData,
});

const apex = SKILL_POOL.find((s) => s.rank === "APEX")!;
const ultimate = SKILL_POOL.find((s) => s.rank === "ULTIMATE")!;

export function fixtures(): Fixture[] {
  const character = (from: FieldSpec[], to: FieldSpec[]) => only("levels", levels(from), levels(to));
  return [
    {
      name: "domain-level",
      note: "Probability 5 → 6; the Statistics field stays at 4.",
      ...character(
        [["f-stats", "Statistics", 4, [["d-prob", "Probability", 5], ["d-reg", "Regression", 1]]]],
        [["f-stats", "Statistics", 4, [["d-prob", "Probability", 6], ["d-reg", "Regression", 1]]]]
      ),
      expect: ["domain:d-prob:6"],
    },
    {
      name: "field-level",
      note: "Probability 6 → 7 lifts Statistics 4 → 5 (the character stays 13): one Seal, the domain as a What-moved row.",
      ...character(
        [["f-econ", "Economics", 16], ["f-stats", "Statistics", 4, [["d-prob", "Probability", 6], ["d-reg", "Regression", 1]]], ["f-phil", "Philosophy", 3]],
        [["f-econ", "Economics", 16], ["f-stats", "Statistics", 5, [["d-prob", "Probability", 7], ["d-reg", "Regression", 1]]], ["f-phil", "Philosophy", 3]]
      ),
      expect: ["field:f-stats:5"],
    },
    {
      name: "character-level",
      note: "Ethics 3 → 4 lifts Philosophy 3 → 4 and the character 15 → 16, inside the bronze band.",
      ...character(
        [["f-econ", "Economics", 16], ["f-stats", "Statistics", 9], ["f-phil", "Philosophy", 3, [["d-eth", "Ethics", 3], ["d-log", "Logic", 2]]]],
        [["f-econ", "Economics", 16], ["f-stats", "Statistics", 9], ["f-phil", "Philosophy", 4, [["d-eth", "Ethics", 4], ["d-log", "Logic", 2]]]]
      ),
      expect: ["level:16"],
    },
    {
      name: "band",
      note: "Character 14 → 15: Practitioner and the bronze re-forge are one Ascension.",
      ...character(
        [["f-econ", "Economics", 16], ["f-stats", "Statistics", 9], ["f-phil", "Philosophy", 2, [["d-eth", "Ethics", 2], ["d-log", "Logic", 1]]]],
        [["f-econ", "Economics", 16], ["f-stats", "Statistics", 9], ["f-phil", "Philosophy", 3, [["d-eth", "Ethics", 3], ["d-log", "Logic", 1]]]]
      ),
      expect: ["band:bronze"],
    },
    {
      name: "title",
      note: "Character 9 → 10: Student becomes Adept (still iron).",
      ...character(
        [["f-stats", "Statistics", 10, [["d-prob", "Probability", 6], ["d-inf", "Inference", 6], ["d-reg", "Regression", 3], ["d-sam", "Sampling", 1]]], ["f-econ", "Economics", 7]],
        [["f-stats", "Statistics", 11, [["d-prob", "Probability", 6], ["d-inf", "Inference", 6], ["d-reg", "Regression", 4], ["d-sam", "Sampling", 1]]], ["f-econ", "Economics", 7]]
      ),
      expect: ["title:Adept"],
    },
    {
      name: "idea-mastered",
      note: "An Idea reached level 12 and minted 25 MP.",
      ...only("mastered", { ideas: {} }, { ideas: { fixtureidea0001: 25 } }),
      expect: ["mastered:fixtureidea0001"],
    },
    {
      name: "streak-milestone",
      note: "The first deed of day 30: a T1 (Day 30 kept) and the 30-day Seal.",
      ...only(
        "streak",
        { today: TODAY, current: 29, todayActive: false, held: 0 },
        { today: TODAY, current: 30, todayActive: true, held: 0 }
      ),
      expect: ["day:2026-10-01", "streak:30"],
    },
    {
      name: "habit-rung",
      note: "Morning meds crosses 60% strength: Established.",
      ...only(
        "habits",
        { rows: [{ id: "tpl-meds", title: "Morning meds", strength: 0.585, kept: 17 }] },
        { rows: [{ id: "tpl-meds", title: "Morning meds", strength: 0.607, kept: 18 }] }
      ),
      expect: ["rung:tpl-meds:Established"],
    },
    {
      name: "goal-finished",
      note: "A Short goal closed at its key result; its decision row paid the 1 MP it stated (Body, no depth).",
      ...only(
        "goals",
        { done: [] },
        { done: [{ id: "goal-5k", title: "Run a 5K", horizon: "SHORT", goalMp: 1, closedScore: 1, krTarget: 5, krUnit: "km", paid: 1, why: null, track: "BODY", depth: 0 }] }
      ),
      expect: ["goal:goal-5k"],
    },
    {
      name: "goal-long",
      note: "A Long goal finished at 90%: an Ascension. It paid 18 of the 20 MP it stated (20 × 0.9) and added Craft depth +2.",
      ...only(
        "goals",
        { done: [] },
        { done: [{ id: "goal-book", title: "Finish the statistics book", horizon: "LONG", goalMp: 20, closedScore: 0.9, krTarget: 12, krUnit: "chapters", paid: 18, why: null, track: "CRAFT", depth: 2 }] }
      ),
      expect: ["goal:goal-book"],
    },
    {
      name: "boss-won",
      note: "The Statistics boss beaten at tier 2 (pays bossMasteryReward(2) = 5 MP).",
      ...only(
        "bosses",
        { rows: [{ fieldId: "f-stats", fieldName: "Statistics", tier: 2, victories: 1, name: "The Null Hypothesis", reward: 5 }] },
        { rows: [{ fieldId: "f-stats", fieldName: "Statistics", tier: 3, victories: 2, name: "The Long Tail", reward: 6.5 }] }
      ),
      expect: ["boss:f-stats:2"],
    },
    {
      name: "week-kept",
      note: "The week judge wrote three kept WEEK rows, each paid 1.5 MP: one Seal for the week card, not three.",
      ...only(
        "ledger",
        { weeks: [], prs: [] },
        {
          weeks: ["DUTY", "CRAFT", "BODY"].map((t) => ({
            key: `week:${t}:2026-W40`,
            week: "2026-W40",
            track: t,
            day: "2026-10-04",
            xp: 0,
            qty: 1,
            detail: "Kept · 4 days · 52.0 raw XP",
            mp: 1.5,
          })),
          prs: [],
        }
      ),
      expect: ["week:2026-W40"],
    },
    {
      name: "pr",
      note: "A sensor-session personal record (M4) that paid 10 raw life XP.",
      ...only("ledger", { weeks: [], prs: [] }, { weeks: [], prs: [{ key: "pr:run_10k:wk001", track: "BODY", day: "2026-09-30", xp: 10, qty: null, detail: "10 km in 54:12" }] }),
      expect: ["pr:run_10k:wk001"],
    },
    {
      name: "track-level",
      note: "M5: Duty reaches level 12.",
      ...only("tracks", { levels: { DUTY: 11 } }, { levels: { DUTY: 12 } }),
      expect: ["track:DUTY:12"],
    },
    {
      name: "emblem-unlock",
      note: `An Apex unlocked (${apex.name}, ${apex.masteryCost} MP).`,
      ...only("skills", { owned: [], mp: apex.masteryCost + 146 }, { owned: [{ code: apex.code, paid: apex.masteryCost }], mp: 146 }),
      expect: [`unlock:${apex.code}`],
    },
    {
      name: "first-ultimate",
      note: "The first Ultimate: the Transcendent title and the astral crest ride on the one curtain.",
      before: {
        parts: ["skills", "levels"],
        skills: { owned: [], mp: ultimate.masteryCost + 40 },
        levels: levels([["f-econ", "Economics", 16], ["f-stats", "Statistics", 9]], 0),
      },
      after: {
        parts: ["skills", "levels"],
        skills: { owned: [{ code: ultimate.code, paid: ultimate.masteryCost }], mp: 40 },
        levels: levels([["f-econ", "Economics", 16], ["f-stats", "Statistics", 9]], 1),
      },
      expect: ["first-ultimate"],
    },
    {
      name: "no-diff",
      note: "The same snapshot twice (a page load): nothing.",
      ...character([["f-stats", "Statistics", 9]], [["f-stats", "Statistics", 9]]),
      expect: [],
    },
    {
      name: "level-drop",
      note: "A level that drops (degradation) never celebrates.",
      ...character(
        [["f-stats", "Statistics", 9, [["d-prob", "Probability", 7]]]],
        [["f-stats", "Statistics", 8, [["d-prob", "Probability", 6]]]]
      ),
      expect: [],
    },
  ];
}

export interface FixtureMoments {
  name: string;
  note: string;
  drafts: CelebrationDraft[];
  events: CelebrationEvent[];
}

/** Each fixture's diff, as client events with fixture ids (never sent to the server). */
export function fixtureMoments(): FixtureMoments[] {
  return fixtures().map((f) => {
    const drafts = diffProgress(f.before, f.after);
    const events = drafts.map((d, i) =>
      draftToEvent(d, `fixture:${f.name}:${i}`, { createdAt: "2026-10-01T08:05:00.000Z", shownAt: null })
    );
    return { name: f.name, note: f.note, drafts, events };
  });
}
