"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import { addSubtaskCore, removeSubtaskCore, renameSubtaskCore, type StepResult } from "@/lib/subtasks-server";
import type { Subtask } from "@/lib/subtasks";

/**
 * A task's steps, edited in its drawer (Edit → Steps): add, rename, remove. Each re-renders the route and answers
 * { ok, value } or { ok: false, error }; none throws. Ticking a step is tasks.ts tickStep (it pays).
 */
async function guard<T>(label: string, fn: (userId: string) => Promise<StepResult<T>>): Promise<StepResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: "Couldn't do that. Try again." };
  }
}

export async function addSubtask(templateId: string, title: string): Promise<StepResult<Subtask>> {
  return guard("addSubtask", (userId) => addSubtaskCore(userId, templateId, title));
}

export async function renameSubtask(stepId: string, title: string): Promise<StepResult<Subtask>> {
  return guard("renameSubtask", (userId) => renameSubtaskCore(userId, stepId, title));
}

export async function removeSubtask(stepId: string): Promise<StepResult<{ templateId: string }>> {
  return guard("removeSubtask", (userId) => removeSubtaskCore(userId, stepId));
}
