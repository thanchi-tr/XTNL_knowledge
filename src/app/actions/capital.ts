"use server";

import { revalidatePath } from "next/cache";
import { claimDividend } from "@/lib/capital";
import { dividendRetiredOn } from "@/lib/credits";
import { todayKey } from "@/lib/life-day";
import { loadProgressionFresh } from "@/lib/skill-effects";
import { getCurrentUserId } from "@/lib/user";

export type ClaimActionResult =
  | { ok: true; amount: number; balance: number; capped: boolean }
  | { ok: false; error: string };

/** What a Claim from a page loaded before the dividend stopped hears (blueprint P17, D28). */
const RETIRED = "The dividend has stopped: credits replaced it. Your capital is kept as it was.";

/**
 * Banks the accrued dividend.
 *
 * Reads progression *fresh* rather than cached: the rate is derived from the
 * live loadout, and paying out against a stale one would credit capital for
 * emblems the player has since unequipped.
 *
 * Once the dividend is retired (blueprint P17, D28: credits replaced it) the
 * claim reads and writes nothing and says so, before progression is loaded
 * (claimDividend refuses on its own as well), and Stats is revalidated so its
 * next load shows the kept balance in place of the Claim.
 */
export async function claimCapital(): Promise<ClaimActionResult> {
  try {
    if (dividendRetiredOn(todayKey())) {
      revalidatePath("/you/stats");
      return { ok: false, error: RETIRED };
    }
    const userId = getCurrentUserId();
    const progression = await loadProgressionFresh(userId);
    const res = await claimDividend(userId, progression.activeSkills);
    if (res.status === "retired") {
      revalidatePath("/you/stats");
      return { ok: false, error: RETIRED };
    }
    if (res.status === "nothing") {
      return { ok: false, error: "Nothing has accrued yet." };
    }
    revalidatePath("/you");
    revalidatePath("/you/stats");
    return { ok: true, amount: res.amount, balance: res.balance, capped: res.capped };
  } catch {
    return { ok: false, error: "Couldn't claim just now. Try again." };
  }
}
