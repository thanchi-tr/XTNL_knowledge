import type { Metadata } from "next";
import { SectionHeader } from "@/components/ui/Tabs";
import { TrackRow, type WeekPip } from "@/components/home/SheetSections";
import { KeptWeeks, TrackLines } from "@/components/home/TrackCharts";
import { LoadoutStrip } from "@/components/skills/LoadoutStrip";
import { SKILL_POOL } from "@/lib/skill-pool";

export const metadata: Metadata = { title: "You fixtures" };

/**
 * The M5-ready You components, drawn from FIXTURES (the numbers are made up;
 * no real page ever shows them): the four life tracks with their 8-week pips
 * and depth caps, track levels over 12 weeks, the kept-weeks heatmap, and the
 * loadout strip L2 puts on the Study hub and the runner footer.
 */

const pips = (s: string): WeekPip[] => s.split("").map((c) => (c === "k" ? "kept" : c === "h" ? "held" : "missed"));

const TRACKS = [
  { sigil: "duty" as const, name: "Duty", level: 11, banked: 0.92, now: 0.95, weeks: pips("kkkkkkhk"), cap: 0.97, line: "5,120 / 5,400 · depth cap 12 · level 12 lands if this week is kept" },
  { sigil: "craft" as const, name: "Craft", level: 8, banked: 0.79, now: 0.84, weeks: pips("kkkhkkok"), cap: 0.9, line: "2,870 / 3,610 · depth cap 9 · a finished Mid goal raises it" },
  { sigil: "body" as const, name: "Body", level: 6, banked: 0.81, now: 0.86, weeks: pips("kkkkokkk"), cap: 0.88, line: "1,960 / 2,401 · depth cap 7 · 13 more kept weeks raise it" },
  { sigil: "care" as const, name: "Care", level: 5, banked: 0.6, now: 0.63, weeks: pips("kokkookk"), cap: 0.8, line: "1,020 / 1,690 · depth cap 6 · 6 more kept weeks raise it" },
];

export default function YouFixturesPage() {
  const strip = Array.from({ length: 10 }, (_, slot) => {
    const skill = slot < 7 ? SKILL_POOL[slot * 97] ?? null : null;
    return { slot, skill, active: slot !== 3 };
  });
  return (
    <div className="page">
      <p className="t-meta" style={{ margin: "4px 0 16px" }}>
        Fixtures: every figure on this page is made up, to show the M5 components before their data exists.
      </p>
      <div className="you-grid">
        <div className="you-stack">
          <div>
            <SectionHeader title="Life tracks" aside="fixture" />
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
            <SectionHeader title="Track levels" aside="12 weeks · fixture" />
            <section className="card chart-c">
              <TrackLines
                series={[
                  { name: "Duty", points: [8, 8, 8.5, 9, 9, 9.5, 10, 10, 10.4, 10.7, 11, 11] },
                  { name: "Craft", points: [6, 6, 6.2, 6.5, 6.8, 7, 7, 7.2, 7.5, 7.7, 8, 8] },
                  { name: "Body", points: [4, 4.2, 4.5, 4.6, 4.8, 5, 5.2, 5.4, 5.6, 5.8, 6, 6] },
                  { name: "Care", points: [4, 4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 5] },
                ]}
              />
            </section>
          </div>
          <div>
            <SectionHeader title="Kept weeks" aside="fixture" />
            <section className="card pad">
              <KeptWeeks
                rows={[
                  { name: "Duty", weeks: pips("kkkkkkkkkhkk") },
                  { name: "Craft", weeks: pips("kkokkkkhkkok") },
                  { name: "Body", weeks: pips("okkkkkkhkkkk") },
                  { name: "Care", weeks: pips("kokkoookhkkk") },
                ]}
              />
              <p className="t-meta" style={{ marginTop: 10 }}>
                Filled: kept · hatched: held (vacation) · outline: not kept.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
