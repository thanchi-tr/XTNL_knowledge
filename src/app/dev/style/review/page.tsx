import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { devStyleEnabled } from "../gate";
import { LoadoutStrip } from "@/components/skills/LoadoutStrip";
import { reviewFixtureStrip, reviewFixtures } from "./fixtures";
import { fixtureStateOf } from "./states";
import { ReviewFixtures } from "./ReviewFixtures";

export const metadata: Metadata = { title: "Review fixtures" };

/**
 * /dev/style/review (L2): the review hub, runner, result panel, Seal, miss,
 * boss run and recap, driven by labelled fixtures (?state=hub|empty|question|
 * correct|seal|miss|boss|recap|boss-won) so the browser audit can reach each
 * state without a database. Gated like /dev/style. Every figure is computed
 * by the real formulas from made-up rows (fixtures.ts); no real page shows them.
 */
export default async function ReviewFixturesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!devStyleEnabled()) notFound();
  const state = fixtureStateOf((await searchParams).state);
  return <ReviewFixtures key={state} state={state} data={reviewFixtures()} loadoutStrip={<LoadoutStrip slots={reviewFixtureStrip()} />} />;
}
