import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { devStyleEnabled } from "../gate";
import { RoadmapFixtures } from "./RoadmapFixtures";
import { fixtureStateOf } from "./fixtures";
import "@/components/home/you.css";
import "@/components/roadmap/roadmap.css";

export const metadata: Metadata = { title: "Roadmap fixtures" };

// Request-time (the gate and ?state= are read per request).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /dev/style/roadmap?state=… (roadmap.md rev 3, F23): the Roadmap page, the
 * intake, the Aim card and Today's week quests card in each state the audits
 * need, from pure fixtures only. It never reads the user's roadmap. Gated like
 * every /dev/style page: open in development, or in a production build only
 * with XTNL_DEV_STYLE=1.
 */
export default async function RoadmapFixturesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!devStyleEnabled()) notFound();
  const state = fixtureStateOf((await searchParams).state);
  return (
    <div className="page cq-main">
      <RoadmapFixtures state={state} />
    </div>
  );
}
