/**
 * Reset scopes, their confirmation phrases and what each one destroys.
 *
 * These live outside `app/actions/reset.ts` because a `"use server"` module may
 * only export async functions — exporting this table from there compiles and
 * lints cleanly but fails the production build, since the rule is enforced by
 * the bundler rather than by TypeScript. The client panel and the server action
 * must agree on the phrases, so they share this module instead.
 */

export type ResetScope = "ideas" | "knowledge" | "life" | "everything";

/** The order the danger zone offers them in: narrowest first. */
export const RESET_SCOPE_ORDER: ResetScope[] = ["ideas", "knowledge", "life", "everything"];

export interface ResetSummary {
  scope: ResetScope;
  deleted: Record<string, number>;
  /** Rows left alone, so the report says what survived as well as what did not. */
  preserved: Record<string, number>;
}

export type ResetResult = { ok: true; value: ResetSummary } | { ok: false; error: string };

export const RESET_SCOPES: Record<ResetScope, { label: string; phrase: string; blurb: string }> = {
  ideas: {
    label: "Ideas only",
    phrase: "DELETE IDEAS",
    blurb:
      "Removes every idea and its enrichments, and zeroes each domain's points and level. The reviews, new ideas, attestations and boss fights recorded in your activity history go with them. Fields and domains stay, so the structure you built is still there to file into.",
  },
  knowledge: {
    label: "Ideas, domains and fields",
    phrase: "DELETE KNOWLEDGE",
    blurb:
      "The above, plus the whole taxonomy and its attribute compositions, snapshots and streaks. Skills, mastery points, titles and your tasks survive.",
  },
  life: {
    label: "Life only",
    phrase: "DELETE LIFE",
    blurb:
      "Removes every task, habit and goal, their completions and XP, the whole activity history (so the daily streak starts again) and your life settings. Ideas, the taxonomy, skills and mastery points are untouched.",
  },
  everything: {
    label: "Everything, including progression",
    phrase: "DELETE EVERYTHING",
    blurb:
      "A completely new account: the taxonomy, every idea, every task and the activity history, and all progression — unlocked skills, the mastery ledger, capital and augments, boss encounters, boons and debuffs.",
  },
};
