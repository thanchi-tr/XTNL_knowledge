import type { Metadata } from "next";
import { getCurrentUserId } from "@/lib/user";
import { loadMall } from "@/lib/mall-server";
import { addReward, archiveReward, buyReward, editReward, undoBuy } from "@/app/actions/mall";
import { MallBoard } from "@/components/home/MallBoard";

export const metadata: Metadata = { title: "Mall" };

// The wallet moves on every tick, and a reward listed shows at once.
export const dynamic = "force-dynamic";

/** The page's writes (blueprint P18, P19): the server actions, passed to the client board. */
const MALL_ACTIONS = { addReward, editReward, archiveReward, buyReward, undoBuy };

/**
 * You › Mall (blueprint 4.3; docs/life-plan/blueprint-plan-2026-10-22.md P18; decision D30): the rewards the user
 * lists, each with a price in credits, by category, with the wallet over them and the honour note beside them. Only
 * what the user lists is priced (the Mall starts empty); #play, rest days and sleep are never priced. P19: a reward is
 * bought with Buy, then Confirm, and a purchase can be undone for ten minutes (actions/mall buyReward, undoBuy). The
 * catalog, the purchases and the wallet are read on each load (mall-server loadMall; the wallet is credits-server's,
 * {live: false} with no read while CREDITS_LAUNCH_DAY is null, and then nothing can be bought). Its top-bar title is the
 * path's (nav.ts titleFor: You · Mall).
 */
export default async function MallPage() {
  const mall = await loadMall(getCurrentUserId());
  return (
    <div className="you-stack ml-page">
      <MallBoard
        data={{ wallet: mall.wallet, goodDay: mall.goodDay, rewards: mall.rewards, groups: mall.groups, archived: mall.archived, writesOn: mall.writesOn, ready: mall.ready, buy: mall.buy, purchases: mall.purchases }}
        actions={MALL_ACTIONS}
      />
    </div>
  );
}
