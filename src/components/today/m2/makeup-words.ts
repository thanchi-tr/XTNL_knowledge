/**
 * What a MakeUpCard says in each state, as a pure function (no React, no
 * CSS), so scripts/today-ui-check.ts can hold the words without rendering
 * the card. MakeUpCard.tsx renders these; Today and the weekly review pass
 * the state.
 *
 *   open         the owed chip, the card's sentence and its window line
 *   repaid       kept: 'Made up. Nothing owed.' and the make-up's own words
 *   minimum      held: 'Minimum done. Nothing owed.' and its own words
 *   written-off  quiet: 'Written off. The miss stays on the ledger.' Nothing
 *                was repaid, so it never reads 'Repaid' (M2 review)
 */

export type MakeUpState = "open" | "repaid" | "minimum" | "written-off";

export const WRITTEN_OFF_TEXT = "Written off. The miss stays on the ledger.";
/** Under a written-off card when the caller gives no words of its own. */
export const WRITTEN_OFF_SUB = "Its debt stays in Duty XP; nothing more is owed.";

export interface MakeUpWordsInput {
  text: string;
  window: string;
  /** Resolved lines (the outcome's own words). `writtenOff` absent: WRITTEN_OFF_SUB. */
  resolved?: { repaid: string; minimum: string; writtenOff?: string };
}

export interface MakeUpWords {
  /** Which chip the card wears: the owed amount, 'Repaid n' (kept), 'Held · minimum' (held) or 'Written off' (quiet). */
  chip: "owed" | "repaid" | "minimum" | "written-off";
  text: string;
  sub: string | undefined;
}

export function makeUpWordsOf(item: MakeUpWordsInput, state: MakeUpState): MakeUpWords {
  if (state === "repaid") return { chip: "repaid", text: "Made up. Nothing owed.", sub: item.resolved?.repaid };
  if (state === "minimum") return { chip: "minimum", text: "Minimum done. Nothing owed.", sub: item.resolved?.minimum };
  if (state === "written-off") return { chip: "written-off", text: WRITTEN_OFF_TEXT, sub: item.resolved?.writtenOff ?? WRITTEN_OFF_SUB };
  return { chip: "owed", text: item.text, sub: item.window };
}
