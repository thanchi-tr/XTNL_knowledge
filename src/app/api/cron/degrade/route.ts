import { NextResponse } from "next/server";
import { degradeOverdueIdeas } from "@/lib/srs";
import { decayStaleMastery } from "@/lib/mastery";
import { purgeExpiredDebuffs } from "@/lib/debuffs";
import { purgeExpiredBoons } from "@/lib/boons";
import { enforceWeeklyQuotas } from "@/lib/field-quota";
import { getCurrentUserId } from "@/lib/user";

// Never statically cache/prerender a Cron endpoint.
export const dynamic = "force-dynamic";

/**
 * Daily 00:00 UTC maintenance job (spec section 3.4). Scheduled via
 * vercel.json's `crons` entry; Vercel calls this with
 * `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set, which is
 * what's checked below. Runs fine as a manual GET without CRON_SECRET set
 * (local dev), so long as you understand that means anyone with the URL can
 * trigger it once it's deployed.
 *
 * Three jobs, in order of consequence:
 *   1. Degrade Ideas whose grace period lapsed unattended.
 *   2. Erode idle mastery points (`decayStaleMastery` — no-ops entirely
 *      while the balance is being saved toward something still locked).
 *   3. Judge last week's Field contribution quotas, once per week — the
 *      job runs daily but `enforceWeeklyQuotas` no-ops for the rest of the
 *      week once it has ruled.
 *   4. Delete expired debuff rows, which are already inert by then.
 *
 * Each is independently idempotent per day, so a double-invocation cannot
 * double-charge. Quota enforcement runs *before* the purge so the Stagnation
 * row it relies on for its own weekly guard is never swept in the same pass
 * that created it.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const userId = getCurrentUserId();
  const results = await degradeOverdueIdeas();
  const decay = await decayStaleMastery(userId);
  const quota = await enforceWeeklyQuotas(userId);
  const [debuffsPurged, boonsPurged] = await Promise.all([purgeExpiredBoons(), purgeExpiredDebuffs()]);

  return NextResponse.json({ degraded: results.length, results, decay, quota, debuffsPurged, boonsPurged });
}
