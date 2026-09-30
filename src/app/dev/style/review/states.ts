/** The /dev/style/review fixture states (?state=…), shared by the page and its client view. */
export const FIXTURE_STATES = ["hub", "empty", "question", "correct", "seal", "miss", "boss", "recap", "boss-won"] as const;
export type FixtureState = (typeof FIXTURE_STATES)[number];

export const FIXTURE_LABEL: Record<FixtureState, string> = {
  hub: "Hub",
  empty: "Nothing due",
  question: "Question",
  correct: "Correct",
  seal: "Seal",
  miss: "Miss",
  boss: "Boss run",
  recap: "Recap",
  "boss-won": "Boss won",
};

export function fixtureStateOf(raw: unknown): FixtureState {
  return (FIXTURE_STATES as readonly string[]).includes(String(raw)) ? (raw as FixtureState) : "hub";
}
