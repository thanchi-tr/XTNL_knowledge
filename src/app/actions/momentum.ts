"use server";

/**
 * Momentum's server actions (docs/life-plan/momentum.md; lane C of §G.1). Lane E's Today card,
 * its chest and quest sheets, the Life tab (/skills/life) and Settings › Notifications call these.
 *
 * Every action takes only a reference and the change, reads the rest on the server, returns
 * `{ok, value} | {ok, error}`, never throws, and calls `refresh()` when passed `{refresh: true}`
 * (the board's convention, actions/tasks.ts). Each refuses before MOMENTUM_LAUNCH_DAY (always,
 * while it is null): the cores in src/lib/momentum-server.ts check momentumLive first and write
 * nothing otherwise.
 *
 * openChest and learnPerk run inside the moments pattern (captureSnapshot → write →
 * detectCelebrations, momentum-server momentsAround): the chest's T1/T2 and a perk's T2 Seal or
 * capstone T3 come back in `celebrations` once lane D's detectors read the new rows; a duplicate
 * (a double tap) takes no second snapshot.
 *
 * Loaders are not actions: pages call momentum-server loadMomentum, loadLifeTree and
 * settleMomentum on the server.
 */
import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import type { DayKey } from "@/lib/life-day";
import type { CelebrationEvent } from "@/lib/celebration-types";
import type { QuestSlot } from "@/lib/momentum";
import {
  buyPerkCore,
  momentsAround,
  openChestCore,
  respecCore,
  setFlameSkinCore,
  setNudgeCore,
  swapQuestCore,
  type ChestOpenResult,
  type MomentumResult,
  type PerkBuyResult,
  type RespecResult,
  type SwapResult,
} from "@/lib/momentum-server";

export type MomentumActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface MomentumActionOptions {
  /** Re-render the current route in this response. The Today board and the Life tab set it. */
  refresh?: boolean;
}

const UNSAVED = "Couldn't save that. Try again.";

async function run<T>(label: string, opts: MomentumActionOptions | undefined, fn: (userId: string) => Promise<MomentumResult<T>>): Promise<MomentumActionResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok && opts?.refresh === true) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: UNSAVED };
  }
}

const isDay = (s: unknown): s is DayKey => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isSlot = (s: unknown): s is QuestSlot => s === "PLAN" || s === "BODY" || s === "TASK";
const isCode = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= 32;

/**
 * Opens today's chest once all three quests are done (§A.2). `day` may be yesterday, for a chest
 * of a day still inside the record window that settleMomentum has not opened yet. A double tap
 * returns the stored chest with `duplicate: true`.
 */
export async function openChest(opts?: MomentumActionOptions & { day?: DayKey }): Promise<MomentumActionResult<ChestOpenResult & { celebrations: CelebrationEvent[] }>> {
  if (opts?.day !== undefined && !isDay(opts.day)) return { ok: false, error: "Pick a day." };
  const day = opts?.day;
  return run("openChest", opts, (userId) =>
    momentsAround(
      userId,
      "chest",
      () => openChestCore(userId, day ? { day } : {}),
      (v) => !v.duplicate
    )
  );
}

/** Swaps one of today's quests (§A.1): TASK once a day (twice with Second look), PLAN once with Scout, never BODY. */
export async function swapQuest(slot: QuestSlot, opts?: MomentumActionOptions): Promise<MomentumActionResult<SwapResult>> {
  if (!isSlot(slot)) return { ok: false, error: "Pick a quest to swap." };
  return run("swapQuest", opts, (userId) => swapQuestCore(userId, slot));
}

/** Learns a perk on the Life tab (§B.4). A double tap answers with the perk already owned (`duplicate: true`). */
export async function learnPerk(code: string, opts?: MomentumActionOptions): Promise<MomentumActionResult<PerkBuyResult & { celebrations: CelebrationEvent[] }>> {
  if (!isCode(code)) return { ok: false, error: "That perk doesn't exist." };
  return run("learnPerk", opts, (userId) =>
    momentsAround(
      userId,
      "perk",
      () => buyPerkCore(userId, code),
      (v) => !v.duplicate
    )
  );
}

/** Forgets every perk at once, free, once per 30 life days (§B.4). */
export async function respecPerks(opts?: MomentumActionOptions): Promise<MomentumActionResult<RespecResult>> {
  return run("respecPerks", opts, (userId) => respecCore(userId));
}

/** Shows an owned flame skin on the Momentum card (null: the default flame). Saved to UserPrefs.flameSkin. */
export async function setFlameSkin(id: string | null, opts?: MomentumActionOptions): Promise<MomentumActionResult<{ flameSkin: string | null }>> {
  if (id !== null && !isCode(id)) return { ok: false, error: "That isn't a flame." };
  return run("setFlameSkin", opts, (userId) => setFlameSkinCore(userId, id));
}

/** Settings › Notifications: the evening momentum nudge at 20:00, saved to UserPrefs.nudge ('on' | 'off'). */
export async function setMomentumNudge(on: boolean, opts?: MomentumActionOptions): Promise<MomentumActionResult<{ nudge: "on" | "off" }>> {
  if (typeof on !== "boolean") return { ok: false, error: "Pick on or off." };
  return run("setMomentumNudge", opts, (userId) => setNudgeCore(userId, on));
}
