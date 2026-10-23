"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import type { DayKey } from "@/lib/life-day";
import type { AvatarResult, AvatarTargetInput, AvatarTargetPatch } from "@/lib/avatar";
import { addAvatarTargetCore, archiveAvatarTargetCore, editAvatarTargetCore, logAvatarReadingCore } from "@/lib/avatar-server";

/**
 * The avatar sheet's actions (blueprint P4): add a target, edit one (its row is archived and the lineage's next row
 * added), archive one, and log a reading for a target of your own. A record, never a reward: none of these pays XP or
 * MP, moves a level or returns a celebration, and none writes the ledger (src/lib/avatar-server.ts is the only writer;
 * scripts/status-check.ts pins it). The weight target is not here: Train › Weight sets it (WeightGoal).
 *
 * Nothing the browser sends is trusted: each input's types are checked here and its values again in the cores
 * (avatar.ts cleanTargetInput, planTargetEdit, cleanReading). Every write needs life writes on (production, or the
 * local rehearsal), so a dev server sharing the database records nothing and says so. `{ refresh: true }` re-renders
 * the route in the same response, as the weight actions do. Each returns { ok, value } or { ok: false, error } and
 * never throws.
 */

export interface AvatarActionOptions {
  /** Re-render the current route in this response (the sheet sets it). */
  refresh?: boolean;
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isText = (v: unknown): v is string => typeof v === "string";
const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const optional = <T>(v: unknown, is: (x: unknown) => x is T): v is T | null | undefined => v === undefined || v === null || is(v);

async function run<T>(label: string, opts: AvatarActionOptions | undefined, fn: (userId: string) => Promise<AvatarResult<T>>): Promise<AvatarResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok && opts?.refresh === true) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}

/** Adds a target for an attribute. */
export async function addAvatarTarget(input: AvatarTargetInput, opts?: AvatarActionOptions): Promise<AvatarResult<{ id: string }>> {
  return run("addAvatarTarget", opts, async (userId) => {
    if (!input || typeof input !== "object") return { ok: false, error: "Nothing to add." };
    if (!isText(input.attribute) || !isText(input.metric)) return { ok: false, error: "Pick an attribute and a measure." };
    if (!isNumber(input.target)) return { ok: false, error: "The target isn't a number." };
    if (!optional(input.baseline, isNumber)) return { ok: false, error: "The baseline isn't a number." };
    if (!optional(input.label, isText) || !optional(input.unit, isText) || !optional(input.direction, isText) || !optional(input.fieldId, isText)) return { ok: false, error: "That isn't a target." };
    if (!optional(input.targetDay, isText)) return { ok: false, error: "That isn't a date." };
    return addAvatarTargetCore(userId, {
      attribute: input.attribute,
      metric: input.metric,
      label: input.label ?? null,
      fieldId: input.fieldId ?? null,
      unit: input.unit ?? null,
      direction: input.direction ?? null,
      baseline: input.baseline ?? null,
      target: input.target,
      targetDay: (input.targetDay as DayKey | null | undefined) ?? null,
    });
  });
}

/** Edits a target: omitted fields stay; a null baseline or target day clears it. */
export async function editAvatarTarget(id: string, patch: AvatarTargetPatch, opts?: AvatarActionOptions): Promise<AvatarResult<{ id: string }>> {
  return run("editAvatarTarget", opts, async (userId) => {
    if (!isId(id)) return { ok: false, error: "That target is gone." };
    if (!patch || typeof patch !== "object") return { ok: false, error: "Nothing to change." };
    if (patch.target !== undefined && !isNumber(patch.target)) return { ok: false, error: "The target isn't a number." };
    if (!optional(patch.baseline, isNumber)) return { ok: false, error: "The baseline isn't a number." };
    if (!optional(patch.label, isText)) return { ok: false, error: "That isn't a name." };
    if (!optional(patch.targetDay, isText)) return { ok: false, error: "That isn't a date." };
    const clean: AvatarTargetPatch = {};
    if (patch.label !== undefined) clean.label = patch.label;
    if (patch.baseline !== undefined) clean.baseline = patch.baseline;
    if (patch.target !== undefined) clean.target = patch.target;
    if (patch.targetDay !== undefined) clean.targetDay = patch.targetDay;
    return editAvatarTargetCore(userId, id, clean);
  });
}

/** Archives a target (its history stays). */
export async function archiveAvatarTarget(id: string, opts?: AvatarActionOptions): Promise<AvatarResult<null>> {
  return run("archiveAvatarTarget", opts, async (userId) => {
    if (!isId(id)) return { ok: false, error: "That target is gone." };
    return archiveAvatarTargetCore(userId, id);
  });
}

/** Logs today's reading for a target of your own (logging again today replaces it). */
export async function logAvatarReading(id: string, value: number, opts?: AvatarActionOptions): Promise<AvatarResult<{ day: DayKey; value: number }>> {
  return run("logAvatarReading", opts, async (userId) => {
    if (!isId(id)) return { ok: false, error: "That target is gone." };
    if (!isNumber(value)) return { ok: false, error: "That isn't a number." };
    return logAvatarReadingCore(userId, id, value);
  });
}
