"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import { loadMonthDoneCore, loadTaskMonthCore, setTaskStyleCore, type StyleResult } from "@/lib/task-style-server";
import type { MonthDoneTask, MonthKey, TaskDayMark, TaskStyle } from "@/lib/task-style";
import type { DayKey } from "@/lib/life-day";

/**
 * A task's icon and colour, and the two month calendars: the drawer's (one task's done days) and the profile's (every
 * task done each day). The style save re-renders the route; the month reads write nothing. Each answers { ok, value }
 * or { ok: false, error } and never throws.
 */
async function guard<T>(label: string, fn: (userId: string) => Promise<StyleResult<T>>): Promise<StyleResult<T>> {
  try {
    return await fn(getCurrentUserId());
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: "Couldn't do that. Try again." };
  }
}

export async function setTaskStyle(templateId: string, style: { icon: string | null; color: string | null }): Promise<StyleResult<TaskStyle>> {
  return guard("setTaskStyle", async (userId) => {
    if (!style || typeof style !== "object") return { ok: false, error: "Pick an icon or a colour." };
    const res = await setTaskStyleCore(userId, templateId, { icon: style.icon ?? null, color: style.color ?? null });
    if (res.ok) refresh();
    return res;
  });
}

export async function taskMonth(templateId: string, month: MonthKey): Promise<StyleResult<{ month: MonthKey; marks: Record<DayKey, TaskDayMark> }>> {
  return guard("taskMonth", (userId) => loadTaskMonthCore(userId, templateId, month));
}

export async function monthDone(month: MonthKey): Promise<StyleResult<{ month: MonthKey; days: Record<DayKey, MonthDoneTask[]> }>> {
  return guard("monthDone", (userId) => loadMonthDoneCore(userId, month));
}
