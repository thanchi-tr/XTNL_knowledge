"use client";

/**
 * The roadmap's states from fixtures (lane R5; F23), for the 344/375/932/1440
 * audits: the Roadmap page (or the intake form), with the Aim card as /you
 * shows it and the week quests card as Today shows it beside it. Inert: the
 * fixtures provider answers every button with "nothing is saved on this page",
 * and no router or database is reached.
 */
import Link from "next/link";
import { FixtureRoadmapProvider } from "@/components/roadmap/roadmap-runtime";
import { RoadmapScreen } from "@/components/roadmap/RoadmapView";
import { RoadmapForm } from "@/components/roadmap/RoadmapForm";
import { AimCard } from "@/components/roadmap/AimCard";
import { WeekQuests } from "@/components/roadmap/WeekQuests";
import { SectionHeader } from "@/components/ui/Tabs";
import { FIXTURE_STATES, roadmapFixture, type FixtureState } from "./fixtures";

export function RoadmapFixtures({ state }: { state: FixtureState }) {
  const fx = roadmapFixture(state);
  const today = fx.view?.today ?? fx.intake?.today ?? "2027-01-28";
  return (
    <FixtureRoadmapProvider>
      <nav className="rm-fx-nav" aria-label="Roadmap fixture states">
        {FIXTURE_STATES.map((s) => (
          <Link key={s} className="chip btn-chip" aria-current={s === state ? "page" : undefined} href={`/dev/style/roadmap?state=${s}`}>
            {s}
          </Link>
        ))}
      </nav>
      <p className="t-meta" style={{ margin: "0 0 16px" }}>
        Fixtures: every figure here is made up. {fx.note}
      </p>
      {fx.view && <RoadmapScreen view={fx.view} startPreview={fx.startPreview} />}
      {fx.intake && (
        <div style={{ marginTop: fx.view ? 24 : 0 }}>
          {fx.view && <SectionHeader title="Set an aim" aside="/you/roadmap/new" />}
          <RoadmapForm view={fx.intake} />
        </div>
      )}
      {(fx.aim || fx.today) && (
        <div className="you-grid" style={{ marginTop: 24 }}>
          {fx.aim && (
            <div className="you-stack">
              <p className="t-eyebrow">On /you, under the hero</p>
              <AimCard view={fx.aim} today={today} />
            </div>
          )}
          {fx.today && (
            <div className="you-stack">
              <p className="t-eyebrow">On Today, under the goals</p>
              <WeekQuests variant="today" view={fx.today} />
              <div data-compact="1">
                <p className="t-eyebrow" style={{ marginBottom: 8 }}>
                  The evening (compact)
                </p>
                <WeekQuests variant="today" view={fx.today} />
              </div>
              <p className="t-eyebrow">On the Aim card</p>
              <WeekQuests variant="aim" view={fx.today} />
            </div>
          )}
        </div>
      )}
    </FixtureRoadmapProvider>
  );
}
