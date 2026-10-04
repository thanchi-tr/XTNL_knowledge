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
export type LifeResetTable = "taskInstances" | "tasks" | "restDays" | "activityEvents" | "roadmapReadings" | "roadmaps" | "lifeSettings";

/**
 * The 'life' scope's deletes, in foreign-key order (M2 F18): instances
 * before the templates they reference, then the declared rest days, the
 * ledger, the roadmap, and the settings last. The next LifeSettings row (the
 * first capture, or a capacity) is created through duty-economy.ts
 * newLifeSettingsData, so after Duty's launch the settlement cursor starts
 * at the new epoch − 1 and a reset never switches Duty off (decision 1).
 * Workout, HrBucket, StepInterval and IngestLog were M4's and are dropped.
 *
 * The roadmap (docs/life-plan/roadmap.md F16 seam 11): its readings
 * (PROFICIENCY included), then the Roadmap rows, whose delete cascades to
 * their runs, milestones, items, measures, acceptances and quest weeks. No
 * foreign key joins them to the tables above (Field, Domain, Idea and
 * TaskTemplate ids are plain text), so their place in the order is free;
 * they sit before the settings, which stay last.
 */
export const LIFE_RESET_ORDER: readonly LifeResetTable[] = [
  "taskInstances",
  "tasks",
  "restDays",
  "activityEvents",
  "roadmapReadings",
  "roadmaps",
  "lifeSettings",
];

/** The 'life' scope's roadmap tables: skipped together while the life_roadmap migration is not applied. */
export const ROADMAP_RESET_TABLES: readonly LifeResetTable[] = ["roadmapReadings", "roadmaps"];

/**
 * LIFE_RESET_ORDER, without RestDay when its table does not exist yet (a
 * deploy can land before the life_duty migration is applied, M2 F20), and
 * without the roadmap tables while life_roadmap is not applied (roadmap
 * Migration): the reset then skips them (rest-rules.ts isMissingRestDayTable,
 * roadmap-types.ts isMissingRoadmapTable) rather than failing. With both
 * flags on it is LIFE_RESET_ORDER itself.
 */
export function lifeResetOrder(withRestDays: boolean, withRoadmaps: boolean = true): readonly LifeResetTable[] {
  if (withRestDays && withRoadmaps) return LIFE_RESET_ORDER;
  return LIFE_RESET_ORDER.filter((t) => (withRestDays || t !== "restDays") && (withRoadmaps || !ROADMAP_RESET_TABLES.includes(t)));
}

/**
 * What the roadmap does under each scope (roadmap.md F16 seam 11). 'ideas'
 * and 'knowledge' take away what its measures count, so any open roadmap
 * (DRAFT or ACTIVE) is archived with RESET_ARCHIVE_NOTE; its readings, quest
 * weeks and Aim rank stay as history, no quest set is frozen for it again,
 * and an open milestone goal stays on Today reading "measures removed by a
 * reset" (no series, so g is null and it pays 0). 'life' and 'everything'
 * delete it with the life tables.
 */
export const ROADMAP_RESET_EFFECT: Record<ResetScope, "archive" | "delete"> = {
  ideas: "archive",
  knowledge: "archive",
  life: "delete",
  everything: "delete",
};

/** The note a reset-archived roadmap carries, and its open goal shows: "measures removed by a reset". */
export const RESET_ARCHIVE_NOTE = "measures removed by a reset";

/** Roadmap.archiveReason for a roadmap a reset archived: "measures removed by a reset on Mon 5 Oct". */
export function resetArchiveReason(dayLabel: string): string {
  return `${RESET_ARCHIVE_NOTE} on ${dayLabel}`;
}

/** Whether an archiveReason is a reset's (resetArchiveReason), not the user's own archive. */
export function isResetArchiveReason(reason: string | null | undefined): boolean {
  return typeof reason === "string" && reason.startsWith(RESET_ARCHIVE_NOTE);
}

export const RESET_SCOPES: Record<ResetScope, { label: string; phrase: string; blurb: string }> = {
  ideas: {
    label: "Ideas only",
    phrase: "DELETE IDEAS",
    blurb:
      "Removes every idea and its enrichments, and zeroes each domain's points and level. The reviews, new ideas, attestations and boss fights recorded in your activity history go with them. Fields and domains stay, so the structure you built is still there to file into. It archives your roadmap, since its measures count those cards; its history stays.",
  },
  knowledge: {
    label: "Ideas, domains and fields",
    phrase: "DELETE KNOWLEDGE",
    blurb:
      "The above, plus the whole taxonomy and its attribute compositions, snapshots and streaks. It archives your roadmap too. Skills, mastery points, titles and your tasks survive.",
  },
  life: {
    label: "Life only",
    phrase: "DELETE LIFE",
    blurb:
      "Removes every task, habit and goal, their completions and XP, your rest and vacation days, the whole activity history (so the daily streak starts again) and your life settings. It deletes your roadmap and its history. Ideas, the taxonomy, skills and mastery points are untouched.",
  },
  everything: {
    label: "Everything, including progression",
    phrase: "DELETE EVERYTHING",
    blurb:
      "A completely new account: the taxonomy, every idea, every task and the activity history, and all progression — unlocked skills, the mastery ledger, capital and augments, boss encounters, boons and debuffs. It deletes your roadmap too.",
  },
};
