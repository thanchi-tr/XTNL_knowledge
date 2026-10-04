"use server";

/**
 * FROZEN CONTRACT (M2 lane 0 signatures; lane C implements, F2, F3, F6, F8, F9)
 * — Duty's server actions. Lane D's Today board and lane E's week runner
 * call them by these signatures.
 *
 * Every action takes only a reference and the change, reads the rest on the
 * server, returns `{ok, value} | {ok, error}`, never throws, and calls
 * `refresh()` when passed `{refresh: true}` (the board's convention,
 * actions/tasks.ts). Gates (decision 2): makeUp, doMinimum, undoMakeUp and
 * acceptLoss work whenever a debtOpen instance exists, launched or not;
 * spendFreeze and settleYesterday refuse before isDutyLaunched(today);
 * declareRest, declareSick and setVacation work once DUTY_LAUNCH_DAY is set,
 * for days on or after it.
 *
 * setCompulsory, setCompulsoryOnRest and cancelPendingChange are F3's drawer
 * pills; their cores live in lib/tasks.ts (lane C), and they are declared
 * here so lane D has one frozen import.
 *
 * Cores: src/lib/duty.ts (debts, freezes, rest, the early settle) and
 * src/lib/tasks.ts (the rule pills); pure planning in src/lib/duty-plan.ts
 * and src/lib/rest-rules.ts. Lane C additions, all optional or new:
 * MakeUpResult.celebrations (the make-up's T2/T3 moments, withMoments as a
 * tick's) and .duplicate; setDebtWriteOff (Settings › Days 'Accept a loss').
 *
 * Spec: docs/life-plan/m2-refit.md; contract table: docs/life-plan/m2-contracts.md.
 */
import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import type { DayKey } from "@/lib/life-day";
import type { RestKind } from "@/lib/duty-economy";
import type { InstanceStatus, Receipt } from "@/lib/life-types";
import type { CelebrationEvent } from "@/lib/celebration-types";
import { captureSnapshot, detectCelebrations, type CaptureOptions } from "@/lib/celebrations";
import { withMoments } from "@/lib/today-board";
import {
  acceptLossCore,
  cancelRestCore,
  declareRestCore,
  declareSickCore,
  makeUpCore,
  setDebtWriteOffCore,
  setMinimumCore,
  setVacationCore,
  settleYesterdayCore,
  spendFreezeCore,
  undoMakeUpCore,
} from "@/lib/duty";
import { cancelPendingChangeCore, setCompulsoryCore, setCompulsoryOnRestCore, type LifeResult } from "@/lib/tasks";

export type DutyActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface DutyActionOptions {
  /** Re-render the current route in this response. The Today board sets it. */
  refresh?: boolean;
}

/** What a make-up (or a minimum make-up) did. The client plays makeup-paid (T0) and, when clearedLast, nothing-owed (T1). */
export interface MakeUpResult {
  instanceId: string;
  templateId: string;
  /** The missed day it made up. */
  day: DayKey;
  status: Extract<InstanceStatus, "DONE_LATE" | "DONE_MVV" | "MADE_UP">;
  /** Inside the window and budget: the per-duty streak comes back. */
  restored: boolean;
  receipt: Receipt;
  /** XP the TASK row paid (the debt's repayment is separate). */
  xp: number;
  /** The debt repaid. */
  debtXp: number;
  /** This cleared the last open debt. */
  clearedLast: boolean;
  /** Open debts left. */
  owedLeft: number;
  /** ISO instant the undo closes (10 minutes, the same life day). */
  undoUntil: string;
  /** Lane C: true when this make-up was already recorded (a double tap) and the stored one came back. */
  duplicate?: boolean;
  /** Lane C: L3's moments for the make-up (a level, a streak milestone, a habit rung), as a tick returns them. The board presents the T2/T3s. */
  celebrations?: CelebrationEvent[];
}

/** When a rule change takes effect (duty-rule.ts classifyChange). */
export interface RuleChangeResult {
  templateId: string;
  effect: "immediate" | "deferred";
  /** The day a deferred change takes effect; null when immediate. */
  effectiveDay: DayKey | null;
}

const UNSAVED = "Couldn't save that. Try again.";

async function run<T>(label: string, opts: DutyActionOptions | undefined, fn: (userId: string) => Promise<LifeResult<T>>): Promise<DutyActionResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok && opts?.refresh === true) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: UNSAVED };
  }
}

const isId = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= 64;
const isDay = (s: unknown): s is DayKey => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const noId = <T>(): DutyActionResult<T> => ({ ok: false, error: "Nothing was given." });
const noDay = <T>(): DutyActionResult<T> => ({ ok: false, error: "Pick a day." });

/**
 * A make-up's moments, as a tick's (actions/tasks.ts aroundTick): the
 * snapshot before, the write, the snapshot after with the same scope, the
 * diff. The scope names the instance's template, read once by id; a
 * repeated make-up (a double tap) takes no second snapshot.
 */
async function aroundMakeUp(userId: string, instanceId: string, write: () => Promise<LifeResult<MakeUpResult>>): Promise<LifeResult<MakeUpResult>> {
  let scope: CaptureOptions | null = null;
  const snapshot = async () => {
    if (!scope) {
      const inst = await prisma.taskInstance.findFirst({ where: { id: instanceId, userId }, select: { templateId: true } });
      scope = { scope: "tick", templateIds: inst ? [inst.templateId] : [] };
    }
    return captureSnapshot(userId, scope);
  };
  return withMoments({
    snapshot,
    detect: (before, after) => detectCelebrations(before, after, { cause: "tick" }),
    write,
    changed: (v) => !v.duplicate,
  });
}

const minutesOf = (m: unknown): number | null => (typeof m === "number" && Number.isFinite(m) ? m : null);

// ── Debts (F6) ────────────────────────────────────────────────────────────

/** Make up a missed must in full (×0.85, C 1.00). */
export async function makeUp(instanceId: string, opts?: DutyActionOptions & { minutes?: number }): Promise<DutyActionResult<MakeUpResult>> {
  if (!isId(instanceId)) return noId();
  const minutes = minutesOf(opts?.minutes);
  return run("makeUp", opts, (userId) => aroundMakeUp(userId, instanceId, () => makeUpCore(userId, instanceId, { minimum: false, minutes })));
}

/** Make up with the minimum version (×0.3 × 0.85); repays the debt in full. */
export async function doMinimum(instanceId: string, opts?: DutyActionOptions): Promise<DutyActionResult<MakeUpResult>> {
  if (!isId(instanceId)) return noId();
  return run("doMinimum", opts, (userId) => aroundMakeUp(userId, instanceId, () => makeUpCore(userId, instanceId, { minimum: true })));
}

/** Take a make-up back (10 minutes, the same life day): the debt reopens. */
export async function undoMakeUp(instanceId: string, opts?: DutyActionOptions): Promise<DutyActionResult<{ instanceId: string; debtXp: number }>> {
  if (!isId(instanceId)) return noId();
  return run("undoMakeUp", opts, async (userId) => {
    const res = await undoMakeUpCore(userId, instanceId);
    return res.ok ? { ok: true as const, value: { instanceId: res.value.instanceId, debtXp: res.value.debtXp } } : res;
  });
}

/** 'Accept the loss': only with LifeSettings.debtWriteOff on and the debt ≥ 14 days old. */
export async function acceptLoss(instanceId: string, opts?: DutyActionOptions): Promise<DutyActionResult<{ instanceId: string; debtXp: number }>> {
  if (!isId(instanceId)) return noId();
  return run("acceptLoss", opts, (userId) => acceptLossCore(userId, instanceId));
}

/** Add a minimum version (only when none exists); immediate. */
export async function setMinimum(
  templateId: string,
  text: string,
  minutes?: number | null,
  opts?: DutyActionOptions
): Promise<DutyActionResult<{ templateId: string; mvv: string; mvvMinutes: number | null }>> {
  if (!isId(templateId)) return noId();
  if (typeof text !== "string") return { ok: false, error: "Say what the minimum is ('10 pushups')." };
  return run("setMinimum", opts, (userId) => setMinimumCore(userId, templateId, text, minutesOf(minutes)));
}

// ── Freezes and early settle (F8, F5) ─────────────────────────────────────

/** 'Use a freeze for Wed': an unsettled yesterday with no activity only. */
export async function spendFreeze(opts?: DutyActionOptions): Promise<DutyActionResult<{ day: DayKey; left: number }>> {
  return run("spendFreeze", opts, (userId) => spendFreezeCore(userId));
}

/** 'Settle Wednesday now': settles any backlog, then yesterday; locks the day. */
export async function settleYesterday(opts?: DutyActionOptions): Promise<DutyActionResult<{ settledThrough: DayKey }>> {
  return run("settleYesterday", opts, (userId) => settleYesterdayCore(userId));
}

// ── Rest, sick and vacation (F9) ──────────────────────────────────────────

/** A REST day: after today, on or after DUTY_LAUNCH_DAY, at most 2 in its life week. */
export async function declareRest(day: DayKey, opts?: DutyActionOptions): Promise<DutyActionResult<{ day: DayKey; kind: RestKind }>> {
  if (!isDay(day)) return noDay();
  return run("declareRest", opts, (userId) => declareRestCore(userId, day));
}

/** Today is a SICK day (one per 14 life days). */
export async function declareSick(opts?: DutyActionOptions): Promise<DutyActionResult<{ day: DayKey; kind: RestKind }>> {
  return run("declareSick", opts, (userId) => declareSickCore(userId));
}

/** A vacation of 3 to 30 days from tomorrow at the earliest, within 30 days per rolling 365. */
export async function setVacation(
  from: DayKey,
  to: DayKey,
  opts?: DutyActionOptions
): Promise<DutyActionResult<{ from: DayKey; to: DayKey; days: number; budgetLeft: number }>> {
  if (!isDay(from) || !isDay(to)) return noDay();
  return run("setVacation", opts, (userId) => setVacationCore(userId, from, to));
}

/** Cancel future declarations (one day, or from..to); a started day cannot be cancelled. */
export async function cancelRest(from: DayKey, to?: DayKey, opts?: DutyActionOptions): Promise<DutyActionResult<{ cancelled: DayKey[] }>> {
  if (!isDay(from) || (to !== undefined && to !== null && !isDay(to))) return noDay();
  return run("cancelRest", opts, (userId) => cancelRestCore(userId, from, to ?? null));
}

// ── The drawer's rule pills (F3; cores in lib/tasks.ts) ───────────────────

/** 'Not a must': deferred 7 days once launched and past the 60-minute typo grace. */
export async function setCompulsory(templateId: string, on: false, opts?: DutyActionOptions): Promise<DutyActionResult<RuleChangeResult>> {
  if (!isId(templateId)) return noId();
  // Making something a must is capture's job ('!'); this pill only takes it away.
  if (on !== false) return { ok: false, error: "Mark a must with '!' when you capture it." };
  return run("setCompulsory", opts, (userId) => setCompulsoryCore(userId, templateId));
}

/** 'Even on rest days': on is immediate from today; off is deferred. */
export async function setCompulsoryOnRest(templateId: string, on: boolean, opts?: DutyActionOptions): Promise<DutyActionResult<RuleChangeResult>> {
  if (!isId(templateId)) return noId();
  if (typeof on !== "boolean") return { ok: false, error: "On or off?" };
  return run("setCompulsoryOnRest", opts, (userId) => setCompulsoryOnRestCore(userId, templateId, on));
}

/** 'Keep it': cancels a pending weakening (immediate). */
export async function cancelPendingChange(templateId: string, opts?: DutyActionOptions): Promise<DutyActionResult<{ templateId: string }>> {
  if (!isId(templateId)) return noId();
  return run("cancelPendingChange", opts, async (userId) => {
    const res = await cancelPendingChangeCore(userId, templateId);
    return res.ok ? { ok: true as const, value: { templateId } } : res;
  });
}

// ── Settings › Days (lane C addition) ─────────────────────────────────────

/**
 * 'Accept a loss' on debt older than 14 days (LifeSettings.debtWriteOff). Off
 * by default: debt stays until it is made up. The one writer of the setting
 * (M2 review): Settings › Days calls it, actions/rituals.ts setDebtWriteOff
 * only delegates here, and a first LifeSettings row is created through
 * newLifeSettingsData (setDebtWriteOffCore).
 */
export async function setDebtWriteOff(on: boolean, opts?: DutyActionOptions): Promise<DutyActionResult<{ debtWriteOff: boolean }>> {
  if (typeof on !== "boolean") return { ok: false, error: "On or off?" };
  return run("setDebtWriteOff", opts, (userId) => setDebtWriteOffCore(userId, on));
}
