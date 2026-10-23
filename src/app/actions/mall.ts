"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import type { CelebrationEvent } from "@/lib/celebration-types";
import { isPurchaseClientId, type MallResult, type RewardInput, type RewardPatch } from "@/lib/mall";
import { addRewardCore, archiveRewardCore, buyRewardCore, editRewardCore, undoBuyCore, withMallMoments, type BuyResult, type UndoBuyResult } from "@/lib/mall-server";

/**
 * The Mall's actions (blueprint P18 and P19; decisions D30 to D32): list a reward, edit one, archive one; buy one, and
 * undo a purchase inside its ten minutes. The catalog's are a record of what the user will pay: none pays or costs XP,
 * MP, a point, capital or a credit. A purchase spends credits only: mall-server.ts writes its MALL_BUY row (sink NONE,
 * xp 0) and nothing else, and an undo its MALL_REFUND row; neither pays or costs XP, MP or a point
 * (scripts/credits-check.ts pins every write in a mall* file). A purchase's T2 Seal comes back in `celebrations`.
 *
 * Nothing the browser sends is trusted: each input's types are checked here and its values again in the core
 * (mall.ts cleanRewardInput, planRewardEdit). Every write needs life writes on (production, or the local rehearsal),
 * so a dev server sharing the database records nothing and says so. `{ refresh: true }` re-renders the route in the
 * same response: a catalog change on success; a purchase or an undo on every answer, a refusal too, since a refusal
 * ("you have 10 cr", "Your credits changed meanwhile") means the page's wallet and Buy states are behind the server's
 * (the Fold and the desktop at once), and the header must not contradict the line under the row. Each returns
 * { ok, value } or { ok: false, error } and never throws.
 */

export interface MallActionOptions {
  /** Re-render the current route in this response (the Mall page sets it). */
  refresh?: boolean;
}

/** When `{ refresh: true }` re-renders: a catalog change only once it landed; a purchase or an undo on every answer. */
type RefreshOn = "ok" | "answer";

const isText = (v: unknown): v is string => typeof v === "string";
const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
/** A price or a cooldown as typed: a number, or its digits (the cores read the value). */
const isFigure = (v: unknown): v is number | string => (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.length <= 20);
const optional = <T>(v: unknown, is: (x: unknown) => x is T): v is T | null | undefined => v === undefined || v === null || is(v);

async function run<T>(label: string, opts: MallActionOptions | undefined, fn: (userId: string) => Promise<MallResult<T>>, on: RefreshOn = "ok"): Promise<MallResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if ((res.ok || on === "answer") && opts?.refresh === true) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}

/** Lists a reward. */
export async function addReward(input: RewardInput, opts?: MallActionOptions): Promise<MallResult<{ id: string }>> {
  return run("addReward", opts, async (userId) => {
    if (!input || typeof input !== "object") return { ok: false, error: "Nothing to add." };
    if (!isText(input.title) || !isText(input.category) || !isFigure(input.price)) return { ok: false, error: "Give it a name, a category and a price." };
    if (!optional(input.note, isText) || !optional(input.cooldownDays, isFigure)) return { ok: false, error: "That isn't a reward." };
    return addRewardCore(userId, { title: input.title, category: input.category, price: input.price, note: input.note ?? null, cooldownDays: input.cooldownDays ?? null });
  });
}

/** Edits a live reward: omitted fields stay; a null note or cooldown clears it. */
export async function editReward(id: string, patch: RewardPatch, opts?: MallActionOptions): Promise<MallResult<{ id: string }>> {
  return run("editReward", opts, async (userId) => {
    if (!isId(id)) return { ok: false, error: "That reward is gone." };
    if (!patch || typeof patch !== "object") return { ok: false, error: "Nothing to change." };
    if (!optional(patch.title, isText) || !optional(patch.category, isText) || !optional(patch.price, isFigure) || !optional(patch.note, isText) || !optional(patch.cooldownDays, isFigure)) {
      return { ok: false, error: "That isn't a change." };
    }
    const clean: RewardPatch = {};
    if (patch.title != null) clean.title = patch.title;
    if (patch.category != null) clean.category = patch.category;
    if (patch.price != null) clean.price = patch.price;
    if (patch.note !== undefined) clean.note = patch.note;
    if (patch.cooldownDays !== undefined) clean.cooldownDays = patch.cooldownDays;
    return editRewardCore(userId, id, clean);
  });
}

/** Archives a reward (the row stays, listed under Archived). */
export async function archiveReward(id: string, opts?: MallActionOptions): Promise<MallResult<null>> {
  return run("archiveReward", opts, async (userId) => {
    if (!isId(id)) return { ok: false, error: "That reward is gone." };
    return archiveRewardCore(userId, id);
  });
}

/**
 * Buys a reward (P19, D31): its price in credits, never more than the balance. `clientId` is the browser's id for this
 * one purchase (a resend with it answers the first, `duplicate`); the server re-reads and re-checks everything. The
 * page re-renders on a refusal too, so its wallet and every Buy state follow what the server just said.
 */
export async function buyReward(rewardId: string, clientId: string, opts?: MallActionOptions): Promise<MallResult<BuyResult & { celebrations: CelebrationEvent[] }>> {
  return run(
    "buyReward",
    opts,
    async (userId) => {
      if (!isId(rewardId)) return { ok: false, error: "That reward is gone." };
      if (!isPurchaseClientId(clientId)) return { ok: false, error: "That purchase has no id. Try again." };
      return withMallMoments(userId, () => buyRewardCore(userId, { rewardId, clientId }), (v) => !v.duplicate);
    },
    "answer"
  );
}

/** Undoes a purchase inside its ten minutes (P19, D31): its credits come back, once (re-rendering on a refusal too). */
export async function undoBuy(purchaseId: string, opts?: MallActionOptions): Promise<MallResult<UndoBuyResult>> {
  return run(
    "undoBuy",
    opts,
    async (userId) => {
      if (!isId(purchaseId)) return { ok: false, error: "That purchase is gone." };
      return undoBuyCore(userId, { purchaseId });
    },
    "answer"
  );
}
