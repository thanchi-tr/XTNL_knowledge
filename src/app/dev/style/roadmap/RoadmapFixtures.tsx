"use client";

/**
 * The roadmap's states from fixtures (lane R5; F23), for the 344/375/932/1440
 * audits: the Roadmap page (or the intake form), with the Aim card as /you
 * shows it and the week quests card as Today shows it beside it. Inert: the
 * fixtures provider answers every button with "nothing is saved on this page",
 * and no router or database is reached. A lead-only state (draft-gaps,
 * intake-gemini) is drawn with its switch on through `gates`; the build's
 * switches stay off.
 */
import Link from "next/link";
import { useLayoutEffect } from "react";
import { flushSeen, writeSeen } from "@/components/glyph/useSeen";
import type { SeenSeed } from "@/components/roadmap/roadmap-ui-model";
import { FixtureRoadmapProvider } from "@/components/roadmap/roadmap-runtime";
import { RoadmapScreen } from "@/components/roadmap/RoadmapView";
import { RoadmapForm } from "@/components/roadmap/RoadmapForm";
import { AimCard } from "@/components/roadmap/AimCard";
import { WeekQuests } from "@/components/roadmap/WeekQuests";
import { SectionHeader } from "@/components/ui/Tabs";
import { FIXTURE_STATES, REV4_STATES, roadmapFixture, type FixtureState } from "./fixtures";

/**
 * UI motion (ui-motion.md §11.7–§11.8, RZ): a SEEN state's fixture says what "this viewer last saw" (fx.seen). Its
 * seeds go into the seen store once per browser session per state, before the fixture's own hooks read it (an earlier
 * sibling's layout effect runs first), so its event plays once and then, as in the live app, never again on reload.
 * Renders nothing.
 */
function SeenSeeds({ state, seeds }: { state: FixtureState; seeds: readonly SeenSeed[] | undefined }) {
  useLayoutEffect(() => {
    if (!seeds || seeds.length === 0) return;
    const mark = `xtnl:dev:seen-seeded:roadmap:${state}`;
    try {
      if (sessionStorage.getItem(mark)) return;
      sessionStorage.setItem(mark, "1");
    } catch {
      // no session storage: seed on every load
    }
    for (const s of seeds) writeSeen(s.key, s.value);
    flushSeen();
  }, [state, seeds]);
  return null;
}

export function RoadmapFixtures({ state }: { state: FixtureState }) {
  const fx = roadmapFixture(state);
  const today = fx.view?.today ?? fx.intake?.today ?? "2027-01-28";
  return (
    <FixtureRoadmapProvider>
      <SeenSeeds state={state} seeds={fx.seen} />
      <nav className="rm-fx-nav" aria-label="Roadmap fixture states">
        {FIXTURE_STATES.filter((s) => !(REV4_STATES as readonly string[]).includes(s)).map((s) => (
          <Link key={s} className="chip btn-chip" aria-current={s === state ? "page" : undefined} href={`/dev/style/roadmap?state=${s}`}>
            {s}
          </Link>
        ))}
      </nav>
      <nav className="rm-fx-nav" aria-label="Roadmap fixture states, revision 4">
        {REV4_STATES.map((s) => (
          <Link key={s} className="chip btn-chip" aria-current={s === state ? "page" : undefined} href={`/dev/style/roadmap?state=${s}`}>
            {s}
          </Link>
        ))}
      </nav>
      <p className="t-meta" style={{ margin: "0 0 16px" }}>
        Fixtures: every figure here is made up. {fx.note}
      </p>
      {fx.view && <RoadmapScreen view={fx.view} startPreview={fx.startPreview} gates={fx.gates} />}
      {fx.intake && (
        <div style={{ marginTop: fx.view ? 24 : 0 }}>
          {fx.view && <SectionHeader title="Set an aim" aside="/you/roadmap/new" />}
          <RoadmapForm key={state} view={fx.intake} gates={fx.gates} pick={fx.intakePick} />
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
