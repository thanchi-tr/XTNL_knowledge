"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import {
  addInteractionCore,
  addTaskCore,
  archiveCustomerCore,
  archiveInteractionCore,
  archiveTaskCore,
  createCustomerCore,
  customerDueCountCore,
  editCustomerCore,
  editInteractionCore,
  editTaskCore,
  restoreCustomerCore,
  restoreInteractionCore,
  restoreTaskCore,
  setCrmCore,
  setTaskDoneCore,
  type CustomerInput,
  type CustomerResult,
  type InteractionInput,
  type TaskInput,
} from "@/lib/customers-server";
import type { DueCount } from "@/lib/customers";

/**
 * A work tab's customer list (src/lib/customers.ts holds the rules,
 * customers-server.ts the cores): the tab's switch, customers, their
 * interaction log and their scheduled tasks. Every write checks that the tab
 * is the user's, open and keeps a customer list. Each action takes ids and a
 * plain input, never throws, and answers `{ ok, value } | { ok, error }`.
 * `refresh: true` re-renders the current route in the same response.
 * Work, never the game: nothing here pays XP or writes the ledger.
 */

export interface CustomerActionOptions {
  /** Re-render the current route in this response. */
  refresh?: boolean;
}

async function run<T>(label: string, opts: CustomerActionOptions | undefined, fn: (userId: string) => Promise<CustomerResult<T>>): Promise<CustomerResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok && opts?.refresh === true) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}

/** The tab's customer list on or off (the tab's menu). Off hides it; nothing is deleted. */
export async function setCrm(boardId: string, on: boolean, opts?: CustomerActionOptions): Promise<CustomerResult<{ crmOn: boolean }>> {
  return run("setCrm", opts, (userId) => setCrmCore(userId, boardId, on));
}

/** The work tab card's count: tasks due by tonight (overdue included). A read: it never refreshes. */
export async function customerDueCount(boardId: string): Promise<CustomerResult<DueCount>> {
  return run("customerDueCount", undefined, (userId) => customerDueCountCore(userId, boardId));
}

export async function createCustomer(boardId: string, input: CustomerInput, opts?: CustomerActionOptions): Promise<CustomerResult<{ id: string; number: string }>> {
  return run("createCustomer", opts, (userId) => createCustomerCore(userId, boardId, input));
}

export async function editCustomer(customerId: string, input: CustomerInput, opts?: CustomerActionOptions): Promise<CustomerResult<{ id: string }>> {
  return run("editCustomer", opts, (userId) => editCustomerCore(userId, customerId, input));
}

export async function archiveCustomer(customerId: string, opts?: CustomerActionOptions): Promise<CustomerResult<{ id: string }>> {
  return run("archiveCustomer", opts, (userId) => archiveCustomerCore(userId, customerId));
}

export async function restoreCustomer(customerId: string, opts?: CustomerActionOptions): Promise<CustomerResult<{ id: string }>> {
  return run("restoreCustomer", opts, (userId) => restoreCustomerCore(userId, customerId));
}

export async function addInteraction(customerId: string, input: InteractionInput, opts?: CustomerActionOptions): Promise<CustomerResult<{ id: string }>> {
  return run("addInteraction", opts, (userId) => addInteractionCore(userId, customerId, input));
}

export async function editInteraction(interactionId: string, input: InteractionInput, opts?: CustomerActionOptions): Promise<CustomerResult<{ id: string }>> {
  return run("editInteraction", opts, (userId) => editInteractionCore(userId, interactionId, input));
}

export async function archiveInteraction(interactionId: string, opts?: CustomerActionOptions): Promise<CustomerResult<{ id: string }>> {
  return run("archiveInteraction", opts, (userId) => archiveInteractionCore(userId, interactionId));
}

export async function restoreInteraction(interactionId: string, opts?: CustomerActionOptions): Promise<CustomerResult<{ id: string }>> {
  return run("restoreInteraction", opts, (userId) => restoreInteractionCore(userId, interactionId));
}

export async function addCustomerTask(customerId: string, input: TaskInput, opts?: CustomerActionOptions): Promise<CustomerResult<{ id: string }>> {
  return run("addCustomerTask", opts, (userId) => addTaskCore(userId, customerId, input));
}

export async function editCustomerTask(taskId: string, input: TaskInput, opts?: CustomerActionOptions): Promise<CustomerResult<{ id: string }>> {
  return run("editCustomerTask", opts, (userId) => editTaskCore(userId, taskId, input));
}

export async function setCustomerTaskDone(taskId: string, done: boolean, opts?: CustomerActionOptions): Promise<CustomerResult<{ id: string; done: boolean }>> {
  return run("setCustomerTaskDone", opts, (userId) => setTaskDoneCore(userId, taskId, done));
}

export async function archiveCustomerTask(taskId: string, opts?: CustomerActionOptions): Promise<CustomerResult<{ id: string }>> {
  return run("archiveCustomerTask", opts, (userId) => archiveTaskCore(userId, taskId));
}

export async function restoreCustomerTask(taskId: string, opts?: CustomerActionOptions): Promise<CustomerResult<{ id: string }>> {
  return run("restoreCustomerTask", opts, (userId) => restoreTaskCore(userId, taskId));
}
