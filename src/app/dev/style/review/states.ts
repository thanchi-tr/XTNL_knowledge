/** The /dev/style/review fixture states (?state=…), shared by the page and its client view. */
export const FIXTURE_STATES = ["hub", "hub-part", "empty", "question", "correct", "seal", "miss", "miss-cloze", "miss-math", "retry", "relearned", "boss", "recap", "boss-won"] as const;
export type FixtureState = (typeof FIXTURE_STATES)[number];

export const FIXTURE_LABEL: Record<FixtureState, string> = {
  hub: "Hub",
  "hub-part": "Hub · a part",
  empty: "Nothing due",
  question: "Question",
  correct: "Correct",
  seal: "Seal",
  miss: "Miss",
  "miss-cloze": "Miss · fill the blanks",
  "miss-math": "Miss · formula",
  retry: "Retry",
  relearned: "Relearned",
  boss: "Boss run",
  recap: "Recap",
  "boss-won": "Boss won",
};

/** The missed card's format in a miss state ("miss" misses a choice, which "I was right" never covers). */
export function missTypeOf(state: FixtureState): "CLOZE" | "FORMULA" | null {
  return state === "miss-cloze" ? "CLOZE" : state === "miss-math" ? "FORMULA" : null;
}

export function fixtureStateOf(raw: unknown): FixtureState {
  return (FIXTURE_STATES as readonly string[]).includes(String(raw)) ? (raw as FixtureState) : "hub";
}
