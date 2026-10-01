"use server";

import { revalidatePath } from "next/cache";
import { setFieldInterest } from "@/lib/field-focus";
import { getCurrentUserId } from "@/lib/user";

export type FocusResult = { ok: true } | { ok: false; error: string };

/**
 * Marks a Field as of interest, or puts it into maintenance.
 *
 * Revalidates the whole tree under the root layout, because the change is
 * read everywhere: Settings › Study owns the picker, Review's Boss roster and
 * the weekly quota are drawn from the same set, and so is today's focus field,
 * which Today's Next up, New idea's projected points and the shell's Asks (on
 * every page) all show. The in-memory cache is dropped inside
 * `setFieldInterest`; this is the router's own cache, which is separate and
 * would otherwise keep serving the previous roster after a toggle. (It used
 * to name /overview, which is a redirect now.)
 */
export async function setFieldFocus(fieldId: string, interested: boolean): Promise<FocusResult> {
  // A Server Action is a public endpoint: check the shapes, not just the types.
  if (typeof fieldId !== "string" || !fieldId) return { ok: false, error: "No field given." };
  if (typeof interested !== "boolean") return { ok: false, error: "No choice given." };
  try {
    await setFieldInterest(getCurrentUserId(), fieldId, interested);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't change that field's focus. Try again." };
  }
}
