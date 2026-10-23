import { NextResponse } from "next/server";
import { degradeOverdueIdeas } from "@/lib/srs";
import { recomputeAllLevels } from "@/lib/leveling";
import { decayStaleMastery } from "@/lib/mastery";
import { purgeExpiredDebuffs } from "@/lib/debuffs";
import { purgeExpiredBoons } from "@/lib/boons";
import { enforceWeeklyQuotas } from "@/lib/field-quota";
import { degradeCronRefusal, recordAvatarAfterDegrade, recordRoadmapAfterDegrade } from "@/lib/settlement";
import { getCurrentUserId } from "@/lib/user";

// Never statically cache/prerender a Cron endpoint.
export const dynamic = "force-dynamic";

/**
 * Daily 00:00 UTC maintenance job (spec section 3.4). Scheduled via
 * vercel.json's `crons` entry; Vercel calls this with
 * `Authorization: Bearer $CRON_SECRET`. Before any job, settlement.ts
 * degradeCronRefusal checks it and fails closed like /api/cron/life: in
 * production an unset CRON_SECRET answers 503 and a missing or wrong header
 * 401, and nothing runs. Outside production (local dev) a manual GET with no
 * CRON_SECRET set runs it, and that is no rehearsal: dev and prod share one
 * database, so it applies tonight's jobs to the live account early, writing
 * just as the nightly run does (only step 4 also waits for life writes,
 * XTNL_LIFE_JUDGE=1 locally). With a CRON_SECRET set, the header is required
 * there too.
 *
 * Six jobs, in order of consequence:
 *   1. Degrade Ideas whose grace period lapsed unattended.
 *   1b. Recompute every Domain and Field level (leveling.ts recomputeAllLevels): a
 *      Domain's depth counts each Idea by its retention, which falls every day
 *      an Idea sits past its grace, so a neglected Domain, then its Field, comes
 *      down before any Idea loses a level, and the drop is recorded
 *      (droppedFrom, droppedAt) for the Library and the bell. Batched; a second
 *      run the same day writes nothing.
 *   2. Erode idle mastery points (`decayStaleMastery` — no-ops entirely
 *      while the balance is being saved toward something still locked).
 *   3. Judge last week's Field contribution quotas, once per week — the
 *      job runs daily but `enforceWeeklyQuotas` no-ops for the rest of the
 *      week once it has ruled.
 *   4. Record roadmap readings (docs/life-plan/roadmap.md F16 seam 8), so a
 *      card degraded here lowers a milestone's g, its week quest's RAISE
 *      and the aim's Proficiency the same day. Only where life writes are
 *      on (settlement.ts recordRoadmapAfterDegrade); it never throws, so a
 *      roadmap failure is reported in the JSON's `roadmap` and fails nothing.
 *      Then the avatar targets' readings (blueprint P4: today's COMPUTED
 *      reading of each measured target, a Field's level among them; settlement.ts
 *      recordAvatarAfterDegrade, the same gate), reported in `avatar`. They pay
 *      nothing, and a failure fails nothing.
 *   5. Delete expired debuff rows, which are already inert by then.
 *
 * Each is independently idempotent per day, so a double-invocation cannot
 * double-charge. Quota enforcement runs *before* the purge so the Stagnation
 * row it relies on for its own weekly guard is never swept in the same pass
 * that created it.
 */
export async function GET(request: Request) {
  const refusal = degradeCronRefusal(request.headers.get("authorization"));
  if (refusal) return refusal;

  const userId = getCurrentUserId();
  const results = await degradeOverdueIdeas();
  // After the degrade, so the levels read the levels it took; before the roadmap readings, which read the levels.
  const levels = await recomputeAllLevels({ now: new Date() });
  const decay = await decayStaleMastery(userId);
  const quota = await enforceWeeklyQuotas(userId);
  // After the degrade and the quota judge: the readings see today's lowered levels.
  const roadmap = await recordRoadmapAfterDegrade(userId, new Date());
  // After the levels are recomputed: a Field's level target reads today's level.
  const avatar = await recordAvatarAfterDegrade(userId, new Date());
  const [debuffsPurged, boonsPurged] = await Promise.all([purgeExpiredBoons(), purgeExpiredDebuffs()]);

  return NextResponse.json({ degraded: results.length, results, levels, decay, quota, roadmap, avatar, debuffsPurged, boonsPurged });
}
