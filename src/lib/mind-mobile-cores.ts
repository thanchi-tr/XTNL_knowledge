/**
 * The phone's check-in routes bound to Mind's own cores (docs/mobile-api.md POST /checkin, POST /checkin/undo and
 * /check's `checkin`; health-2026-10-27.md D1, D2, D9, phase 2; the handlers are src/lib/mobile-api-server.ts
 * handleCheckin and handleCheckinUndo, the body's shape src/lib/mind-mobile.ts). Each dep is the core the web's own
 * action calls (actions/mind.ts logCheck and deleteCheck), called the way the action calls it, never with `refresh`.
 *
 * Its own module, apart from mobile-api-cores.ts, on purpose (as mall-mobile-cores.ts is): that module carries the
 * paying cores (completeTask, submitReview), and a check-in is a record, never a reward (D5): its routes hold Mind's
 * write and its delete alone, so a check-in from the phone reaches no ledger, as one from the web reaches none.
 *
 * Every answer is narrowed here, so no stored value ever comes back into the mobile handlers, /check or a log line:
 * logCheck hands back the row's id, life day and instant and whether it was a resend; loadCheckinRead (the one Mind read
 * the mobile API makes, bound in mobile-api-cores.ts for /check) the view's counts and switches alone: live, ready,
 * paused, todayCount and lastAt. scripts/mobile-api-check.ts and scripts/mind-check.ts pin every binding here; only the
 * two check-in route files and mobile-api-cores.ts import it.
 */
import { getCurrentUserId } from "./user";
import { deleteCheckCore, loadMindView, logCheckCore } from "./mind-server";
import { MOBILE_TOKEN_ENV, type MobileCheckinRead } from "./mobile-api";
import type { MobileMindDeps } from "./mobile-api-server";

export const realMindDeps: MobileMindDeps = {
  token: () => process.env[MOBILE_TOKEN_ENV],
  userId: () => getCurrentUserId(),
  now: () => new Date(),
  // Log one check-in at the route's clock (the phone's own `at` kept as the core allows: up to 7 days back), narrowed.
  logCheck: async (userId, body, now) => {
    const res = await logCheckCore(userId, body, now);
    return res.ok ? { ok: true, value: { id: res.value.id, day: res.value.day, at: res.value.at, replay: res.value.replay } } : { ok: false, error: res.error };
  },
  // The receipt's Undo is the check-in's Delete (Body › Mind's), which never waits for the switch.
  deleteCheck: (userId, id) => deleteCheckCore(userId, id),
};

/** /check's check-in read: Mind's own view (cached under 'mind'; nothing read before MIND_LAUNCH_DAY), its counts alone. */
export async function loadCheckinRead(userId: string, now: Date): Promise<MobileCheckinRead> {
  const v = await loadMindView(userId, now);
  return { live: v.live, ready: v.ready, paused: v.paused, todayCount: v.todayCount, lastAt: v.lastAt };
}
