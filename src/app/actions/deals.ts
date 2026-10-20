"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import { archiveDealCore, createDealCore, createOrderFromDealCore, editDealCore, moveDealCore, restoreDealCore, type DealResult } from "@/lib/deals-server";
import type { DealInput, DealStage } from "@/lib/deals";
import type { WorkOrderInput } from "@/lib/work-orders";

/**
 * A work tab's deals pipeline (src/lib/deals.ts holds the rules, deals-server.ts the cores): add and edit from the
 * sheet, "Move to…", archive and its Undo, and a Won deal's "Create order" (through the order list's own core). Every
 * write checks that the tab is the user's, open and keeps its customer list. Each action takes ids and a plain input,
 * never throws, and answers `{ ok, value } | { ok, error }`; `refresh: true` re-renders the current route in the same
 * response. Work, never the game: nothing here pays XP or writes the ledger.
 */

export interface DealActionOptions {
  refresh?: boolean;
}

async function run<T>(label: string, opts: DealActionOptions | undefined, fn: (userId: string) => Promise<DealResult<T>>): Promise<DealResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok && opts?.refresh === true) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}

export async function createDeal(boardId: string, input: DealInput, opts?: DealActionOptions): Promise<DealResult<{ id: string }>> {
  return run("createDeal", opts, (userId) => createDealCore(userId, boardId, input));
}

export async function editDeal(dealId: string, input: DealInput, opts?: DealActionOptions): Promise<DealResult<{ id: string }>> {
  return run("editDeal", opts, (userId) => editDealCore(userId, dealId, input));
}

/** "Move to…": NEW | QUOTED | WON | LOST (Won and Lost stamp closedAt; back clears it). */
export async function moveDeal(dealId: string, stage: DealStage, opts?: DealActionOptions): Promise<DealResult<{ id: string; stage: DealStage; closedAt: string | null }>> {
  return run("moveDeal", opts, (userId) => moveDealCore(userId, dealId, stage));
}

export async function archiveDeal(dealId: string, opts?: DealActionOptions): Promise<DealResult<{ id: string }>> {
  return run("archiveDeal", opts, (userId) => archiveDealCore(userId, dealId));
}

export async function restoreDeal(dealId: string, opts?: DealActionOptions): Promise<DealResult<{ id: string }>> {
  return run("restoreDeal", opts, (userId) => restoreDealCore(userId, dealId));
}

/** A Won deal becomes a line on the tab's order list (the order list must be on); the deal keeps the order. */
export async function createOrderFromDeal(dealId: string, input: WorkOrderInput, opts?: DealActionOptions): Promise<DealResult<{ dealId: string; orderId: string }>> {
  return run("createOrderFromDeal", opts, (userId) => createOrderFromDealCore(userId, dealId, input));
}
