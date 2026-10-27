/**
 * The phone's lift route bound to the lift logger's own cores (docs/mobile-api.md POST /lift/set; health-2026-10-27.md
 * D12, D14-D19, phase 2's SET; the handler is src/lib/mobile-api-server.ts handleLiftSet). Each dep is the core the
 * web's own action calls (actions/training.ts logLiftSet), or the page's read (Train › Exercise loadLiftView), called
 * the way the web calls it, never with `refresh`.
 *
 * Its own module, apart from mobile-api-cores.ts, on purpose (as mall-mobile-cores.ts is): that module carries the
 * paying cores (completeTask, submitReview), and a set is a record (D12): "Set done" writes the set alone, never a
 * ledger row, so the route holds the set's write and the logger's read and nothing that pays. Finish (and its "Counts
 * as") stays on the web. scripts/mobile-api-check.ts pins every binding here; only the lift route file imports it.
 */
import { getCurrentUserId } from "./user";
import { loadLiftView, logSetCore } from "./training-server";
import { MOBILE_TOKEN_ENV } from "./mobile-api";
import type { MobileLiftDeps } from "./mobile-api-server";

export const realLiftDeps: MobileLiftDeps = {
  token: () => process.env[MOBILE_TOKEN_ENV],
  userId: () => getCurrentUserId(),
  now: () => new Date(),
  // One "Set done" at the route's clock (the set's own doneAt kept inside the lift's start and now), keyed by its clientId.
  logSet: (userId, input, now) => logSetCore(userId, input, now),
  // The logger's own read after the set (cached under 'training'; the set's write cleared it): the open lift and its ghosts.
  loadLift: (userId, now) => loadLiftView(userId, now),
};
