"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import {
  addCheckCore,
  archiveCheckCore,
  archiveCollectionCore,
  createCollectionCore,
  customerOrderOptionsCore,
  editCheckCore,
  editCollectionCore,
  restoreCheckCore,
  restoreCollectionCore,
  setCollectionClosedCore,
  setCustomerStatusCore,
  setFollowUpDaysCore,
  type CrmResult,
} from "@/lib/crm-server";
import type { CheckInput, CollectionInput, CollectionOrderRef, CustomerStatus } from "@/lib/crm";

/**
 * The customer list's Phase 2 (src/lib/crm.ts holds the rules, crm-server.ts the cores): the tab's follow-up alert, a
 * customer's quick status, their Check log and their task collections. Every write checks that the tab is the user's,
 * open and keeps a customer list, and that the customer is kept. Each action takes ids and a plain input, never throws,
 * and answers `{ ok, value } | { ok, error }`; `refresh: true` re-renders the current route in the same response.
 * Work, never the game: nothing here pays XP or writes the ledger.
 */

export interface CrmActionOptions {
  /** Re-render the current route in this response. */
  refresh?: boolean;
}

async function run<T>(label: string, opts: CrmActionOptions | undefined, fn: (userId: string) => Promise<CrmResult<T>>): Promise<CrmResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok && opts?.refresh === true) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}

/** The tab's follow-up alert (the tab's menu): null for Off, or 7, 14, 30, 60 or 90 days. */
export async function setFollowUpDays(boardId: string, days: number | null, opts?: CrmActionOptions): Promise<CrmResult<{ followUpDays: number | null }>> {
  return run("setFollowUpDays", opts, (userId) => setFollowUpDaysCore(userId, boardId, days));
}

/** A customer's status from their Overview: LEAD | PROSPECT | CUSTOMER | INACTIVE. */
export async function setCustomerStatus(customerId: string, status: CustomerStatus, opts?: CrmActionOptions): Promise<CrmResult<{ id: string; status: CustomerStatus }>> {
  return run("setCustomerStatus", opts, (userId) => setCustomerStatusCore(userId, customerId, status));
}

export async function addCustomerCheck(customerId: string, input: CheckInput, opts?: CrmActionOptions): Promise<CrmResult<{ id: string }>> {
  return run("addCustomerCheck", opts, (userId) => addCheckCore(userId, customerId, input));
}

export async function editCustomerCheck(checkId: string, input: CheckInput, opts?: CrmActionOptions): Promise<CrmResult<{ id: string }>> {
  return run("editCustomerCheck", opts, (userId) => editCheckCore(userId, checkId, input));
}

export async function archiveCustomerCheck(checkId: string, opts?: CrmActionOptions): Promise<CrmResult<{ id: string }>> {
  return run("archiveCustomerCheck", opts, (userId) => archiveCheckCore(userId, checkId));
}

export async function restoreCustomerCheck(checkId: string, opts?: CrmActionOptions): Promise<CrmResult<{ id: string }>> {
  return run("restoreCustomerCheck", opts, (userId) => restoreCheckCore(userId, checkId));
}

/** Starts a task collection for a customer (optionally for one of their orders). Answers it, for the sheet to pick. */
export async function createTaskCollection(customerId: string, input: CollectionInput, opts?: CrmActionOptions): Promise<CrmResult<{ id: string; name: string }>> {
  return run("createTaskCollection", opts, (userId) => createCollectionCore(userId, customerId, input));
}

export async function editTaskCollection(collectionId: string, input: CollectionInput, opts?: CrmActionOptions): Promise<CrmResult<{ id: string }>> {
  return run("editTaskCollection", opts, (userId) => editCollectionCore(userId, collectionId, input));
}

/** Closes a collection (its work done) or opens it again. */
export async function closeTaskCollection(collectionId: string, closed: boolean, opts?: CrmActionOptions): Promise<CrmResult<{ id: string; closed: boolean }>> {
  return run("closeTaskCollection", opts, (userId) => setCollectionClosedCore(userId, collectionId, closed));
}

export async function archiveTaskCollection(collectionId: string, opts?: CrmActionOptions): Promise<CrmResult<{ id: string }>> {
  return run("archiveTaskCollection", opts, (userId) => archiveCollectionCore(userId, collectionId));
}

export async function restoreTaskCollection(collectionId: string, opts?: CrmActionOptions): Promise<CrmResult<{ id: string }>> {
  return run("restoreTaskCollection", opts, (userId) => restoreCollectionCore(userId, collectionId));
}

/** The customer's orders a collection can link (read when the sheet's "New collection…" opens; never per keystroke). */
export async function customerOrderOptions(customerId: string): Promise<CrmResult<CollectionOrderRef[]>> {
  return run("customerOrderOptions", undefined, (userId) => customerOrderOptionsCore(userId, customerId));
}
