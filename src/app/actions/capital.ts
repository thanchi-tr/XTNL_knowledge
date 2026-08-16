"use server";

import { revalidatePath } from "next/cache";
import { claimDividend } from "@/lib/capital";
import { loadProgressionFresh } from "@/lib/skill-effects";
import { getCurrentUserId } from "@/lib/user";

export type ClaimActionResult =
  | { ok: true; amount: number; balance: number; capped: boolean }
  | { ok: false; error: string };

/**
 * Banks the accrued dividend.
 *
 * Reads progression *fresh* rather than cached: the rate is derived from the
 * live loadout, and paying out against a stale one would credit capital for
 * emblems the player has since unequipped.
 */
export async function claimCapital(): Promise<ClaimActionResult> {
  try {
    const userId = getCurrentUserId();
    const progression = await loadProgressionFresh(userId);
    const res = await claimDividend(userId, progression.activeSkills);
    if (res.status === "nothing") {
      return { ok: false, error: "Nothing has accrued yet." };
    }
    revalidatePath("/overview");
    return { ok: true, amount: res.amount, balance: res.balance, capped: res.capped };
  } catch {
    return { ok: false, error: "Couldn't claim just now. Try again." };
  }
}
