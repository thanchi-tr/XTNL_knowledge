"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import {
  addEntryCore,
  archiveMovementCore,
  confirmSetCore,
  createMovementCore,
  deleteEntryCore,
  deleteSetCore,
  discardLiftCore,
  editSetCore,
  finishLiftMomentsCore,
  logSetCore,
  startLiftCore,
  type AddedEntry,
  type ConfirmedSet,
  type EditedSet,
  type FinishedLift,
  type LoggedSet,
  type StartedLift,
  type TrainingResult,
  type UserMovementView,
} from "@/lib/training-server";
import type { JumpAnswer, RawSetInput } from "@/lib/training";
import type { CelebrationEvent } from "@/lib/celebration-types";

/**
 * Train › Exercise, Lift mode: start a lift (or Repeat one), add and take out movements, log, fix and delete sets,
 * answer a big jump's Keep, Finish (or discard) the lift, and add or archive a movement of the user's own. A RECORD,
 * never a reward (health-2026-10-27.md D12, D14): none of these pays XP or MP, ticks a streak or keeps a quest; the
 * one effect is Finish's "Counts as", which ticks the linked habit as a manual tick would and returns that tick's
 * moments as `celebrations` (training-server finishLiftMomentsCore). A PR moment is a line on the Finish summary,
 * never a celebration.
 *
 * Nothing the browser sends is trusted: each input is copied field by field (anything else is dropped), and the core
 * checks it again (training.ts cleanSetInput, training-library cleanUserMovementInput). Loads come as weightKg (as
 * stored) or as weight in the unit shown (WeightGoal.unit, which the server reads). Each answers { ok, value } or
 * { ok: false, error } and never throws; each write re-renders the current route (refresh(), a Server Action call
 * only; the cores invalidate the process cache's 'training' and 'exercise' tags). confirmLiftSet is a read and
 * re-renders nothing: no column holds an answer, so the page keeps it and sends it with finishLift (answers).
 */
async function run<T>(label: string, fn: (userId: string) => Promise<TrainingResult<T>>, opts: { refresh?: boolean } = {}): Promise<TrainingResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok && opts.refresh !== false) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object" && !Array.isArray(v);

/** The set fields a row sends, copied one by one (the rest timer's restSec only where a new set carries it). */
const SET_KEYS = ["kind", "chainOf", "weightKg", "weight", "reps", "rir", "toFailure", "amrap", "durationSec", "distanceM"] as const;
function setFieldsOf(input: Record<string, unknown>): RawSetInput {
  const out: RawSetInput = {};
  for (const k of SET_KEYS) if (input[k] !== undefined) out[k] = input[k];
  return out;
}

export interface StartLiftInput {
  /** "Push day" (1..40 characters); a Repeat keeps the repeated lift's when none is given. */
  label?: string | null;
  /** true: Repeat the newest finished lift; a session id: Repeat that one. */
  repeat?: string | true;
  /** A key the button makes once per start and sends on every retry. */
  clientId?: string;
}

export async function startLift(input: StartLiftInput): Promise<TrainingResult<StartedLift>> {
  return run("startLift", (userId) => {
    const i: Record<string, unknown> = isObject(input) ? input : {};
    return startLiftCore(userId, { label: i.label, repeat: i.repeat, clientId: i.clientId });
  });
}

export interface AddLiftEntryInput {
  sessionId: string;
  /** A library key ('bench_press') or 'u:' and the user's own movement's id. */
  movementKey: string;
  /** Its place (1..50); the next one when omitted. */
  ord?: number;
  groupNo?: number | null;
  note?: string | null;
}

export async function addLiftEntry(input: AddLiftEntryInput): Promise<TrainingResult<AddedEntry>> {
  return run("addLiftEntry", (userId) => {
    const i: Record<string, unknown> = isObject(input) ? input : {};
    return addEntryCore(userId, { sessionId: i.sessionId, movementKey: i.movementKey, ord: i.ord, groupNo: i.groupNo, note: i.note });
  });
}

export async function removeLiftEntry(entryId: string): Promise<TrainingResult<{ deleted: boolean; sets: number }>> {
  return run("removeLiftEntry", (userId) => deleteEntryCore(userId, entryId));
}

/** A set row's "Set done": strings or numbers, checked again in the core. */
export interface LogLiftSetInput {
  sessionId?: string;
  entryId: string;
  /** A key the row makes once per set and sends on every retry (the phone's queue carries its own). */
  clientId: string;
  /** Its place in the movement (1..100); the next one when omitted. */
  ord?: number;
  /** WARMUP | WORKING (the default) | DROP | MINI. */
  kind?: string;
  /** A DROP or MINI: the head set's place; the chain of the set just before it when omitted. */
  chainOf?: number | null;
  /** Kilograms as stored (EXT the total, PAIR and ONE one implement, BW the signed added load, CARRY one hand). */
  weightKg?: number | string | null;
  /** The figure in the unit shown, read when weightKg is not given. */
  weight?: number | string | null;
  reps?: number | string | null;
  /** 0..4, and 5 for "4+". */
  rir?: number | string | null;
  toFailure?: boolean;
  amrap?: boolean;
  durationSec?: number | string | null;
  distanceM?: number | string | null;
  /** The rest the timer gave it (never typed). */
  restSec?: number | null;
  /** ISO: when it was done (the phone's queue); the server's clock when omitted. */
  doneAt?: string;
}

export async function logLiftSet(input: LogLiftSetInput): Promise<TrainingResult<LoggedSet>> {
  return run("logLiftSet", (userId) => {
    const i: Record<string, unknown> = isObject(input) ? input : {};
    return logSetCore(userId, { ...setFieldsOf(i), restSec: i.restSec, sessionId: i.sessionId, entryId: i.entryId, clientId: i.clientId, ord: i.ord, doneAt: i.doneAt });
  });
}

export interface ConfirmLiftSetInput {
  setId: string;
  /** KEPT: the row's Keep; CONFIRMED: the summary's Confirm. */
  answer: JumpAnswer;
}

/** Keep (or Confirm) checked against the set's big jump. A read: the page keeps the answer for finishLift. */
export async function confirmLiftSet(input: ConfirmLiftSetInput): Promise<TrainingResult<ConfirmedSet>> {
  return run(
    "confirmLiftSet",
    (userId) => {
      const i: Record<string, unknown> = isObject(input) ? input : {};
      return confirmSetCore(userId, { setId: i.setId, answer: i.answer });
    },
    { refresh: false }
  );
}

/** Fix: only the fields given change (the set's place and its rest stay). */
export type EditLiftSetInput = { setId: string } & Partial<Omit<LogLiftSetInput, "sessionId" | "entryId" | "clientId" | "ord" | "doneAt" | "restSec">>;

export async function editLiftSet(input: EditLiftSetInput): Promise<TrainingResult<EditedSet>> {
  return run("editLiftSet", (userId) => {
    const i: Record<string, unknown> = isObject(input) ? input : {};
    return editSetCore(userId, { ...setFieldsOf(i), setId: i.setId });
  });
}

export async function deleteLiftSet(setId: string): Promise<TrainingResult<{ deleted: boolean }>> {
  return run("deleteLiftSet", (userId) => deleteSetCore(userId, setId));
}

export interface FinishLiftInput {
  sessionId: string;
  /** The lift's name (kept when omitted; null clears it). */
  label?: string | null;
  /** "How hard was it?" 0..10: a record only. */
  sessionRpe?: number | null;
  /** Minutes typed at Finish, if any (the least of it and the clock's bounds counts). */
  reportedMin?: number | null;
  /** The big-jump answers the page kept, by set id. */
  answers?: Record<string, JumpAnswer>;
  /** "Counts as": the personal EXERCISE habit this lift ticks (a lift dated today), at the habit's own price. */
  countsAs?: string | null;
}

export async function finishLift(input: FinishLiftInput): Promise<TrainingResult<FinishedLift & { celebrations?: CelebrationEvent[] }>> {
  return run("finishLift", (userId) => {
    const i: Record<string, unknown> = isObject(input) ? input : {};
    const countsAs = typeof i.countsAs === "string" && i.countsAs.length > 0 && i.countsAs.length <= 64 ? i.countsAs : null;
    return finishLiftMomentsCore(userId, { sessionId: i.sessionId, label: i.label, sessionRpe: i.sessionRpe, reportedMin: i.reportedMin, answers: i.answers }, new Date(), { countsAs });
  });
}

export async function discardLift(sessionId: string): Promise<TrainingResult<{ discarded: boolean }>> {
  return run("discardLift", (userId) => discardLiftCore(userId, sessionId));
}

/** A movement of the user's own, as the form sends it (checked again by cleanUserMovementInput). */
export interface CreateMovementInput {
  name: string;
  pattern: string;
  equipment: string;
  primary: string[];
  secondary?: string[];
  /** EXT (the default) | PAIR | ONE | BW | TIME | CARRY. */
  load?: string;
  /** A BW movement's share of body weight, 0.05..1. */
  bodyFraction?: number | string | null;
  unilateral?: boolean;
  stepKg?: number | string | null;
  restSec?: number | string | null;
}

export async function createMovement(input: CreateMovementInput): Promise<TrainingResult<UserMovementView>> {
  return run("createMovement", (userId) => {
    const i: Record<string, unknown> = isObject(input) ? input : {};
    return createMovementCore(userId, {
      name: i.name,
      pattern: i.pattern,
      equipment: i.equipment,
      primary: i.primary,
      secondary: i.secondary,
      load: i.load,
      bodyFraction: i.bodyFraction,
      unilateral: i.unilateral,
      stepKg: i.stepKg,
      restSec: i.restSec,
    });
  });
}

export async function archiveMovement(id: string): Promise<TrainingResult<{ id: string; key: string; archived: true }>> {
  return run("archiveMovement", (userId) => archiveMovementCore(userId, id));
}
