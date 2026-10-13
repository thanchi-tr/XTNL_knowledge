"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import { addOrderCore, archiveOrderCore, editOrderCore, orderCountCore, restoreOrderCore, setOrderedCore, setOrdersOnCore, type OrderResult } from "@/lib/work-orders-server";
import type { WorkOrderInput } from "@/lib/work-orders";

/**
 * A work tab's order list (src/lib/work-orders.ts holds the rules,
 * work-orders-server.ts the cores): the tab's switch and its lines. Every
 * write checks that the tab is the user's, open and keeps an order list.
 * Each action takes ids and a plain input, never throws, and answers
 * `{ ok, value } | { ok, error }`. `refresh: true` re-renders the current
 * route in the same response.
 * Work, never the game: nothing here pays XP or writes the ledger.
 */

export interface WorkOrderActionOptions {
  /** Re-render the current route in this response. */
  refresh?: boolean;
}

async function run<T>(label: string, opts: WorkOrderActionOptions | undefined, fn: (userId: string) => Promise<OrderResult<T>>): Promise<OrderResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok && opts?.refresh === true) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}

/** The tab's order list on or off (the tab's menu). Off hides it; nothing is deleted. */
export async function setOrdersOn(boardId: string, on: boolean, opts?: WorkOrderActionOptions): Promise<OrderResult<{ ordersOn: boolean }>> {
  return run("setOrdersOn", opts, (userId) => setOrdersOnCore(userId, boardId, on));
}

/** The work tab card's count: the lines not ordered yet. A read: it never refreshes. */
export async function workOrderCount(boardId: string): Promise<OrderResult<{ todo: number }>> {
  return run("workOrderCount", undefined, (userId) => orderCountCore(userId, boardId));
}

export async function addWorkOrder(boardId: string, input: WorkOrderInput, opts?: WorkOrderActionOptions): Promise<OrderResult<{ id: string }>> {
  return run("addWorkOrder", opts, (userId) => addOrderCore(userId, boardId, input));
}

export async function editWorkOrder(orderId: string, input: WorkOrderInput, opts?: WorkOrderActionOptions): Promise<OrderResult<{ id: string }>> {
  return run("editWorkOrder", opts, (userId) => editOrderCore(userId, orderId, input));
}

/** The ordered tick: on stamps orderedAt (and today as the date when the line had none); off clears it. */
export async function setWorkOrderOrdered(orderId: string, ordered: boolean, opts?: WorkOrderActionOptions): Promise<OrderResult<{ id: string; ordered: boolean }>> {
  return run("setWorkOrderOrdered", opts, (userId) => setOrderedCore(userId, orderId, ordered));
}

export async function archiveWorkOrder(orderId: string, opts?: WorkOrderActionOptions): Promise<OrderResult<{ id: string }>> {
  return run("archiveWorkOrder", opts, (userId) => archiveOrderCore(userId, orderId));
}

export async function restoreWorkOrder(orderId: string, opts?: WorkOrderActionOptions): Promise<OrderResult<{ id: string }>> {
  return run("restoreWorkOrder", opts, (userId) => restoreOrderCore(userId, orderId));
}
