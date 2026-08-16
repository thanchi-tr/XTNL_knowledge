"use server";

import { revalidatePath } from "next/cache";
import { setFieldInterest } from "@/lib/field-focus";
import { getCurrentUserId } from "@/lib/user";

export type FocusResult = { ok: true } | { ok: false; error: string };

/**
 * Marks a Field as of interest, or puts it into maintenance.
 *
 * `revalidatePath` on the two screens whose content actually changes: the
 * overview owns the picker, and Review's Boss roster is derived from the same
 * set. The in-memory cache is dropped inside `setFieldInterest`; this is the
 * router's own cache, which is separate and would otherwise keep serving the
 * previous roster after a toggle.
 */
export async function setFieldFocus(fieldId: string, interested: boolean): Promise<FocusResult> {
  if (!fieldId) return { ok: false, error: "No field given." };
  try {
    await setFieldInterest(getCurrentUserId(), fieldId, interested);
    revalidatePath("/overview");
    revalidatePath("/review");
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't change that field's focus. Try again." };
  }
}
