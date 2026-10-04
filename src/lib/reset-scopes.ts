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

/** One table the 'life' scope empties, by the key its count is reported under. */
export type LifeResetTable = "taskInstances" | "tasks" | "restDays" | "activityEvents" | "lifeSettings";

/**
 * The 'life' scope's deletes, in foreign-key order (M2 F18): instances
 * before the templates they reference, then the declared rest days, the
 * ledger, and the settings last. The next LifeSettings row (the first
 * capture, or a capacity) is created through duty-economy.ts
 * newLifeSettingsData, so after Duty's launch the settlement cursor starts
 * at the new epoch − 1 and a reset never switches Duty off (decision 1).
 * Workout, HrBucket, StepInterval and IngestLog were M4's and are dropped.
 */
export const LIFE_RESET_ORDER: readonly LifeResetTable[] = ["taskInstances", "tasks", "restDays", "activityEvents", "lifeSettings"];

/**
 * LIFE_RESET_ORDER, without RestDay when its table does not exist yet: a
 * deploy can land before the life_duty migration is applied (M2 F20), and
 * the reset then skips the table (rest-rules.ts isMissingRestDayTable)
 * rather than failing.
 */
export function lifeResetOrder(withRestDays: boolean): readonly LifeResetTable[] {
  return withRestDays ? LIFE_RESET_ORDER : LIFE_RESET_ORDER.filter((t) => t !== "restDays");
}

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
      "Removes every task, habit and goal, their completions and XP, your rest and vacation days, the whole activity history (so the daily streak starts again) and your life settings. Ideas, the taxonomy, skills and mastery points are untouched.",
  },
  everything: {
    label: "Everything, including progression",
    phrase: "DELETE EVERYTHING",
    blurb:
      "A completely new account: the taxonomy, every idea, every task and the activity history, and all progression — unlocked skills, the mastery ledger, capital and augments, boss encounters, boons and debuffs.",
  },
};
