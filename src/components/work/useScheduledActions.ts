"use client";

/**
 * A scheduled task row's quick actions, shared by the Agenda and a customer's page: Done (the row's tick; Undo in the
 * dock), open again, Snooze to a preset (the dock says where it went). Each refreshes the route in its own response,
 * so the row moves to its new section at once; a refusal is one line above the list.
 */
import { useState, useTransition } from "react";
import { doneScheduledTask, reopenScheduledTask, snoozeScheduledTask } from "@/app/actions/scheduled-tasks";
import { whenLineOf, type ScheduledView, type SnoozePreset } from "@/lib/scheduled-tasks";
import { pushToast } from "@/components/ui/toast-store";
import { SCHEDULED_UNREACHABLE } from "./ScheduledTaskSheet";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
async function call<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: SCHEDULED_UNREACHABLE };
  }
}

export function useScheduledActions() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function run<T>(id: string, fn: () => Promise<Result<T>>, then: (value: T) => void) {
    setBusy(id);
    setError(null);
    start(async () => {
      const res = await call(fn);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      then(res.value);
    });
  }

  return {
    busy,
    error,
    clearError: () => setError(null),
    done(task: ScheduledView) {
      run(task.id, () => doneScheduledTask(task.id, null, { refresh: true }), () =>
        pushToast({
          key: `st-done-${task.id}`,
          title: "Done",
          body: task.title,
          holdMs: 10_000,
          action: { label: "Undo", onAction: () => void call(() => reopenScheduledTask(task.id, null, { refresh: true })) },
        })
      );
    },
    reopen(task: ScheduledView) {
      run(task.id, () => reopenScheduledTask(task.id, null, { refresh: true }), () => undefined);
    },
    snooze(task: ScheduledView, preset: SnoozePreset) {
      run(task.id, () => snoozeScheduledTask(task.id, preset, { refresh: true }), (v) =>
        pushToast({ key: `st-snooze-${task.id}`, title: "Snoozed", body: `${task.title} · ${whenLineOf({ dueAt: v.dueAt, allDay: false }, new Date())}` })
      );
    },
  };
}
