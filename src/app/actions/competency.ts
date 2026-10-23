"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import type { SkillInput, SkillPatch, SkillResult } from "@/lib/competency";
import {
  addSkillCore,
  addSuggestedSkillCore,
  archiveSkillCore,
  editSkillCore,
  linkRoadmapSkillCore,
  linkTemplateSkillCore,
  loadSkillChoices,
  type SkillChoices,
} from "@/lib/competency-server";

/**
 * The skills' actions (blueprint P5; decisions D7, D8 and D9): add a skill (or take a suggestion: the skill and its
 * family's tasks linked in one go), edit or archive one, link a task or a roadmap to one (or clear the link), and the
 * task drawer's read of what a task feeds. A record, never a reward: none of these pays XP or MP, moves a level or a
 * price, or returns a celebration (a tier-up is a Seal a tick plays, D9), and none writes the ledger
 * (src/lib/competency-server.ts is the only writer; scripts/status-check.ts pins it).
 *
 * Nothing the browser sends is trusted: each input's types are checked here and its values again in the cores
 * (competency.ts cleanSkillInput, planSkillEdit, linkRefusalOf). Every write needs life writes on (production, or the
 * local rehearsal), so a dev server sharing the database records nothing and says so. `{ refresh: true }` re-renders
 * the route in the same response. Each returns { ok, value } or { ok: false, error } and never throws.
 */

export interface SkillActionOptions {
  /** Re-render the current route in this response (the Skills page sets it). */
  refresh?: boolean;
}

const isText = (v: unknown): v is string => typeof v === "string";
const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const optional = <T>(v: unknown, is: (x: unknown) => x is T): v is T | null | undefined => v === undefined || v === null || is(v);

async function run<T>(label: string, opts: SkillActionOptions | undefined, fn: (userId: string) => Promise<SkillResult<T>>): Promise<SkillResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok && opts?.refresh === true) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}

/** Adds a skill. */
export async function addSkill(input: SkillInput, opts?: SkillActionOptions): Promise<SkillResult<{ id: string }>> {
  return run("addSkill", opts, async (userId) => {
    if (!input || typeof input !== "object") return { ok: false, error: "Nothing to add." };
    if (!isText(input.name) || !isText(input.attribute)) return { ok: false, error: "Give it a name and an attribute." };
    if (!optional(input.kind, isText) || !optional(input.fieldId, isId)) return { ok: false, error: "That isn't a skill." };
    return addSkillCore(userId, { name: input.name, attribute: input.attribute, kind: input.kind ?? null, fieldId: input.fieldId ?? null });
  });
}

/** Takes a suggestion by its family's key: the skill, and the family's tasks linked to it. */
export async function addSuggestedSkill(key: string, opts?: SkillActionOptions): Promise<SkillResult<{ id: string; linked: number }>> {
  return run("addSuggestedSkill", opts, async (userId) => {
    if (!isText(key) || key.length === 0 || key.length > 400) return { ok: false, error: "That suggestion has gone." };
    return addSuggestedSkillCore(userId, key);
  });
}

/** Edits a skill: omitted fields stay; a null Field clears it. */
export async function editSkill(id: string, patch: SkillPatch, opts?: SkillActionOptions): Promise<SkillResult<{ id: string }>> {
  return run("editSkill", opts, async (userId) => {
    if (!isId(id)) return { ok: false, error: "That skill is gone." };
    if (!patch || typeof patch !== "object") return { ok: false, error: "Nothing to change." };
    if (!optional(patch.name, isText) || !optional(patch.attribute, isText) || !optional(patch.fieldId, isId)) return { ok: false, error: "That isn't a change." };
    const clean: SkillPatch = {};
    if (patch.name !== undefined) clean.name = patch.name;
    if (patch.attribute !== undefined) clean.attribute = patch.attribute;
    if (patch.fieldId !== undefined) clean.fieldId = patch.fieldId;
    return editSkillCore(userId, id, clean);
  });
}

/** Archives a skill (its links stay, and count toward nothing while it is archived). */
export async function archiveSkill(id: string, opts?: SkillActionOptions): Promise<SkillResult<null>> {
  return run("archiveSkill", opts, async (userId) => {
    if (!isId(id)) return { ok: false, error: "That skill is gone." };
    return archiveSkillCore(userId, id);
  });
}

/** Links a task to a skill (`competencyId` null clears it). A work tab's task and a goal are refused. */
export async function linkTemplateSkill(templateId: string, competencyId: string | null, opts?: SkillActionOptions): Promise<SkillResult<{ competencyId: string | null }>> {
  return run("linkTemplateSkill", opts, async (userId) => {
    if (!isId(templateId)) return { ok: false, error: "That task is gone." };
    if (!optional(competencyId, isId)) return { ok: false, error: "That skill is gone." };
    return linkTemplateSkillCore(userId, templateId, competencyId ?? null);
  });
}

/** Links a roadmap's practices and steps to a skill (`competencyId` null clears it). */
export async function linkRoadmapSkill(roadmapId: string, competencyId: string | null, opts?: SkillActionOptions): Promise<SkillResult<{ competencyId: string | null }>> {
  return run("linkRoadmapSkill", opts, async (userId) => {
    if (!isId(roadmapId)) return { ok: false, error: "That roadmap is gone." };
    if (!optional(competencyId, isId)) return { ok: false, error: "That skill is gone." };
    return linkRoadmapSkillCore(userId, roadmapId, competencyId ?? null);
  });
}

/** The task drawer's read: the skill a task feeds now, the skills it may take, or why it can't (nothing is written). */
export async function skillChoices(templateId: string): Promise<SkillResult<SkillChoices>> {
  if (!isId(templateId)) return { ok: false, error: "That task is gone." };
  try {
    return { ok: true, value: await loadSkillChoices(getCurrentUserId(), templateId) };
  } catch (err) {
    console.error("skillChoices failed:", err);
    return { ok: false, error: "Couldn't read the skills." };
  }
}
