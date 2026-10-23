/**
 * The Android app's four Mall routes bound to the web's own cores (docs/mobile-api.md `GET /mall`, `POST /mall/rewards`,
 * `POST /mall/buy`, `POST /mall/undo`; blueprint P18 and P19, decisions D30 to D32; the handlers are
 * src/lib/mobile-api-server.ts handleMall, handleMallRewards, handleMallBuy and handleMallUndo). Each dep
 * is the function the web's page or action calls, called the way the web calls it, never with `refresh` (refresh()
 * runs only inside a Server Action, and a route has no page to re-render).
 *
 * Its own module, apart from mobile-api-cores.ts, on purpose: that module carries the paying cores (completeTask,
 * submitReview), so a Mall route that imported it would hold them. This one holds only the Mall's read, its add, its buy
 * and its undo, and scripts/credits-check.ts reads it as a mall* file: it imports no paying writer, and a purchase
 * spends credits only (never XP, MP or a point). Only the four Mall route files import it; scripts/mobile-api-check.ts
 * pins every binding here.
 */
import { getCurrentUserId } from "./user";
import { loadMall } from "./mall-server";
import { addReward, buyReward, undoBuy } from "../app/actions/mall";
import { MOBILE_TOKEN_ENV } from "./mobile-api";
import type { MobileMallDeps } from "./mobile-api-server";

export const realMallDeps: MobileMallDeps = {
  token: () => process.env[MOBILE_TOKEN_ENV],
  userId: () => getCurrentUserId(),
  now: () => new Date(),
  // You › Mall's own read at the route's clock: the catalog fresh, the wallet credits-server's ({live: false} while off).
  loadMall: (userId, now) => loadMall(userId, { now: () => now }),
  // The Add sheet's save (actions/mall.ts), as the page calls it less `refresh`.
  addReward: (input) => addReward(input),
  // Buy's Confirm and a purchase's Undo (actions/mall.ts, P19), as the page calls them less `refresh`.
  buyReward: (rewardId, clientId) => buyReward(rewardId, clientId),
  undoBuy: (purchaseId) => undoBuy(purchaseId),
};
