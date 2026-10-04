import type { Metadata } from "next";
import { SectionHeader } from "@/components/ui/Tabs";
import { CharacterHero } from "@/components/home/CharacterHero";
import { GoalLadder } from "@/components/home/GoalLadder";
import { LifeNote } from "@/components/home/LifeNote";
import { TrackRow, type WeekPip } from "@/components/home/SheetSections";
import { KeptWeeks, TrackLines } from "@/components/home/TrackCharts";
import { lifeMpCell, titleDistance } from "@/components/home/sheet-math";
import { LoadoutStrip } from "@/components/skills/LoadoutStrip";
import { statedPayoutCopy, type GoalLadder as GoalLadderData, type GoalLadderItem, type GoalPayout } from "@/lib/goals";
import { todayKey, type DayKey } from "@/lib/life-day";
import { GOAL_RULES } from "@/lib/life-economy";
import type { Horizon, Track } from "@/lib/life-types";
import { SKILL_POOL } from "@/lib/skill-pool";
import { AimCard } from "@/components/roadmap/AimCard";
import { FixtureRoadmapProvider } from "@/components/roadmap/roadmap-runtime";
import { aimCardFixtures, buildAimFixture, type AimFixture } from "./aim-fixtures";

export const metadata: Metadata = { title: "You fixtures" };

/**
 * The life parts of the You sheet and Stats, drawn from FIXTURES (the
 * numbers are made up; no real page ever shows them): the hero's purse with
 * life MP last week and the crest's track edges, the life note, the four
 * life tracks with their kept-week pips (one capped, one untouched), the
 * goal ladder with open, carried and closed goals, track levels over 12
 * judged weeks, the kept-weeks heatmap, and the loadout strip L2 puts on the
 * Study hub and the runner footer. The copy is the real copy.
 *
 * The Aim card (roadmap F19, F23) sits under the hero as on /you, in its
 * active state, and every state follows in "Aim card states", each card in
 * its own [data-aim-card] box so ui-audit can record its height per state.
 * Its fixtures (aim-fixtures.ts) are anchored on today's life day and built
 * through the roadmap's pure view builders; they never read the user's
 * roadmap. Every card sits inside FixtureRoadmapProvider, so its buttons
 * reach the inert fixture actions ("nothing is saved on this page"), never
 * the live ones: the EMPTY card's × can't set the real xtnl-aim-prompt
 * cookie from here. Each card gets the page's life day, as /you passes it.
 */

/**
 * One Aim card fixture, or the line saying which builder it still waits on.
 * `slot` names its box when the state shows twice. The fixtures provider
 * keeps every action inert (no cookie, no write, no router).
 */
function AimFixtureCard({ fixture, today, slot }: { fixture: AimFixture; today: DayKey; slot?: string }) {
  const built = buildAimFixture(fixture);
  return (
    <div data-aim-card={slot ?? fixture.key}>
      {built.view ? (
        <FixtureRoadmapProvider>
          <AimCard view={built.view} promptDismissed={false} today={today} />
        </FixtureRoadmapProvider>
      ) : (
        <p className="t-meta">Fixture waits on the roadmap: {built.waiting}</p>
      )}
    </div>
  );
}

const pips = (s: string): WeekPip[] => s.split("").map((c) => (c === "k" ? "kept" : "missed"));

// Consistent with the real rule (life-tracks.ts trackLine): Duty 4,900 XP over 25 kept weeks is
// capped at 7; Craft 2,050 XP over 31; Body 1,960 XP over 25 with a paid Long goal (depth 2);
// Care has no XP. The crest edges below are level ÷ cap.
const TRACKS = [
  { sigil: "duty" as const, name: "Duty", level: 7, banked: 1, now: 1, weeks: pips("kkkkkkok"), cap: 1, capped: true, line: "Capped at 7 · 7 more kept weeks raise it · 4,900 XP banked" },
  { sigil: "craft" as const, name: "Craft", level: 6, banked: 0.4, now: 0.45, weeks: pips("kkkokkok"), line: "2,050 / 2,401 XP · depth cap 7 · 1 more kept week raises it" },
  { sigil: "body" as const, name: "Body", level: 6, banked: 0.25, now: 0.31, weeks: pips("kkkokkkk"), line: "1,960 / 2,401 XP · depth cap 9 · 7 more kept weeks raise it" },
  { sigil: "care" as const, name: "Care", level: 0, banked: 0, now: 0, weeks: pips("oooooooo"), line: "No Care tasks yet · 49 XP reaches level 1" },
];

const TODAY = "2026-10-01";

function payout(h: Horizon, track: Track, g: number, pays: number, why: string | null, depth = 0): GoalPayout {
  const r = GOAL_RULES[h];
  return { horizon: h, track, reason: r.reason, stated: r.stated, bar: r.bar, scaled: r.binary ? (g >= 1 ? r.stated : 0) : Math.round(r.stated * g * 100) / 100, g, pays, why, depth };
}

function goal(id: string, title: string, h: Horizon, track: Track, g: number, label: string, due: string | null, extra: Partial<GoalLadderItem> = {}): GoalLadderItem {
  const stated = GOAL_RULES[h].stated;
  return { id, title, horizon: h, track, stated, copy: statedPayoutCopy(h, stated), g, progressLabel: label, dueDay: due, pastDue: false, carried: null, preview: null, closed: null, ...extra };
}

const LADDER: GoalLadderData = {
  open: [
    goal("g1", "Thesis draft, chapter 2", "LONG", "CRAFT", 0.4, "2 of 5 steps", "2026-12-18", { preview: payout("LONG", "CRAFT", 0.4, 0, "below 70%") }),
    goal("g2", "Run 10K under 55:00", "MID", "BODY", 0.62, "31 of 50 km", "2026-11-02", { preview: payout("MID", "BODY", 0.62, 0, "below 70%") }),
    goal("g3", "Clear the tax backlog", "MID", "DUTY", 0.8, "4 of 5 steps", "2026-10-20", { preview: payout("MID", "DUTY", 0.8, 4.8, null, 1) }),
    goal("g4", "Call family every week", "SHORT", "CARE", 0.55, "11 of 20 calls", "2026-09-28", {
      pastDue: true,
      carried: 0.55,
      preview: payout("SHORT", "CARE", 0.55, 0, "not finished"),
    }),
  ],
  closed: [
    goal("g5", "Sort the garage", "MID", "DUTY", 0.8, "4 of 5 steps", "2026-09-26", { closed: { paid: 4.8, depth: 1, day: "2026-09-26", why: null } }),
    goal("g6", "Book the dentist", "SHORT", "CARE", 1, "1 of 1 step", "2026-09-29", { closed: { paid: 0, depth: 0, day: "2026-09-29", why: "set 1 day ago; it pays once 3 days old" } }),
  ],
};

export default function YouFixturesPage() {
  const strip = Array.from({ length: 10 }, (_, slot) => {
    const skill = slot < 7 ? SKILL_POOL[slot * 97] ?? null : null;
    return { slot, skill, active: slot !== 3 };
  });
  // The Aim card's fixtures read today's life day, so "measured 09:12" and "new 3 Nov" read as on /you.
  const aimToday = todayKey(new Date());
  const aims = aimCardFixtures(aimToday);
  const activeAim = aims.find((f) => f.key === "active");
  const columns = [aims.filter((_, i) => i % 2 === 0), aims.filter((_, i) => i % 2 === 1)];
  return (
    <div className="page">
      <p className="t-meta" style={{ margin: "4px 0 16px" }}>
        Fixtures: every figure on this page is made up, to show the life parts of the sheet and Stats before their data exists.
      </p>
      <div className="you-grid">
        <div className="you-stack">
          <CharacterHero
            level={14}
            progress={0.86}
            title="Adept"
            epithet="of the Deep Archive"
            transcendent={false}
            dominant="MIND"
            distance={titleDistance(14.86)}
            tracks={{ body: 6 / 9, duty: 1, craft: 6 / 7, care: 0 }}
            lifeMp={lifeMpCell({ used: 5.5, cap: 8, weekKey: "2026-W39" }, TODAY)}
            balance={1346}
            mastered={38}
            owned={38}
            poolSize={SKILL_POOL.length}
            seenKey="fixture:level"
          />
          {activeAim && <AimFixtureCard fixture={activeAim} today={aimToday} slot="under-hero" />}
          <LifeNote storageKey="xtnl:dev:life-note:v1" />
          <div>
            <SectionHeader title="Life tracks" aside="levels capped by kept weeks and paid goals · fixture" />
            <section className="card">
              {TRACKS.map((t) => (
                <TrackRow key={t.name} {...t} gainKind="xp" seenKey={`fixture:track:${t.name}`} />
              ))}
              <TrackRow sigil="know" name="Knowledge" level={17} banked={0.44} now={0.52} gainKind="pts" line="6 Fields, breadth-weighted · Statistics grew most this week" seenKey="fixture:track:knowledge" />
            </section>
          </div>
          <div>
            <SectionHeader title="Loadout strip" aside="fixture" />
            <LoadoutStrip slots={strip} />
          </div>
        </div>
        <div className="you-stack">
          <div>
            <SectionHeader title="Goals and mastery" aside="goals pay MP when finished · fixture" />
            <section className="card">
              <GoalLadder
                ladder={LADDER}
                launched
                today={TODAY}
                mastered={38}
                tiers={{ established: 4, highest: "Proficient", highestField: "Statistics" }}
                rungs={{ Automatic: 1, Established: 3, Forming: 2, Seeded: 4 }}
                pays={{ points: 5, level: 10 }}
              />
            </section>
          </div>
          <div>
            <SectionHeader title="Track levels" aside="12 judged weeks · fixture" />
            <section className="card chart-c">
              <TrackLines
                series={[
                  { name: "Duty", points: [4, 4, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7] },
                  { name: "Craft", points: [3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6] },
                  { name: "Body", points: [2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6] },
                  { name: "Care", points: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
                ]}
              />
            </section>
          </div>
          <div>
            <SectionHeader title="Track levels, two weeks" aside="fixture" />
            <section className="card chart-c">
              <TrackLines
                series={[
                  { name: "Duty", points: [1, 2] },
                  { name: "Craft", points: [1, 1] },
                  { name: "Body", points: [0, 1] },
                  { name: "Care", points: [0, 0] },
                ]}
              />
            </section>
          </div>
          <div>
            <SectionHeader title="Kept weeks" aside="12 judged weeks · fixture" />
            <section className="card pad">
              <KeptWeeks
                labels={["13 Jul", "20 Jul", "27 Jul", "3 Aug", "10 Aug", "17 Aug", "24 Aug", "31 Aug", "7 Sep", "14 Sep", "21 Sep", "28 Sep"]}
                rows={[
                  { name: "Duty", weeks: pips("kkkkkkkkkkok") },
                  { name: "Craft", weeks: pips("kkokkkkokkok") },
                  { name: "Body", weeks: pips("okkkkkkokkkk") },
                  { name: "Care", weeks: pips("oooooooooooo") },
                ]}
              />
              <p className="t-meta" style={{ marginTop: 10 }}>
                Filled: kept · outline: not kept.
              </p>
            </section>
          </div>
          <div>
            <SectionHeader title="Kept weeks, three judged" aside="fixture" />
            <section className="card pad">
              <KeptWeeks
                labels={["14 Sep", "21 Sep", "28 Sep"]}
                rows={[
                  { name: "Duty", weeks: pips("kok") },
                  { name: "Craft", weeks: pips("kkk") },
                  { name: "Body", weeks: pips("okk") },
                  { name: "Care", weeks: pips("ooo") },
                ]}
              />
              <p className="t-meta" style={{ marginTop: 10 }}>
                Filled: kept · outline: not kept.
              </p>
            </section>
          </div>
        </div>
      </div>
      <section aria-labelledby="aim-states" style={{ marginTop: 24 }}>
        <SectionHeader id="aim-states" title="Aim card states" aside="fixture · each card in its column's width" />
        <div className="you-grid">
          {columns.map((list, c) => (
            <div key={c} className="you-stack">
              {list.map((f) => (
                <div key={f.key} data-aim-fixture={f.key}>
                  <p className="t-eyebrow">{f.label}</p>
                  <p className="t-meta" style={{ margin: "2px 0 8px" }}>
                    {f.note}
                  </p>
                  <AimFixtureCard fixture={f} today={aimToday} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
