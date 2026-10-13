"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unarchiveTask } from "@/app/actions/tasks";
import { SectionHeader } from "@/components/ui/Tabs";
import type { WeekDecisionsView } from "@/lib/task-decisions";

/**
 * The weekly review's "Deferred n · Aborted m" (task-decisions.ts weekDecisionsViewOf): this week's
 * defers and aborts, newest first, each with its reason. A task still open links to it on Today;
 * one aborted for good is archived, so it offers Restore instead (Archive's own unarchive, history
 * and streak intact). Rows are 56 px, the Restore 44.
 */
export function WeekDecisions({ view, weekLabel }: { view: WeekDecisionsView; weekLabel: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  /** Restores by decision: in flight, done, or the refusal. */
  const [restore, setRestore] = useState<Record<string, { state: "busy" | "done" | "error"; text?: string }>>({});

  function restoreIt(id: string, templateId: string) {
    setRestore((r) => ({ ...r, [id]: { state: "busy" } }));
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof unarchiveTask>>;
      try {
        res = await unarchiveTask(templateId);
      } catch {
        res = { ok: false, error: "Couldn't reach the server. Try again." };
      }
      setRestore((r) => ({ ...r, [id]: res.ok ? { state: "done" } : { state: "error", text: res.error } }));
      if (res.ok) router.refresh();
    });
  }

  return (
    <section aria-labelledby="wk-dec-h" className="wk-dec">
      <SectionHeader id="wk-dec-h" title={view.head} aside={weekLabel} />
      <div className="card">
        {view.items.length === 0 ? (
          <p className="wk-dec-empty">Nothing was put off or dropped this week.</p>
        ) : (
          <ul className="wk-dec-list">
            {view.items.map((i) => {
              const r = restore[i.id];
              const body = (
                <>
                  <span className="wk-dec-title">{i.title}</span>
                  <span className="wk-dec-what">
                    {i.what} · {i.day}
                  </span>
                  <span className="wk-dec-why">“{i.reason}”</span>
                  {r?.state === "error" && (
                    <span className="t-error" role="alert">
                      {r.text}
                    </span>
                  )}
                </>
              );
              return (
                <li key={i.id} className="wk-dec-item">
                  {i.href ? (
                    <Link href={i.href} className="wk-dec-link">
                      {body}
                    </Link>
                  ) : (
                    <div className="wk-dec-body">{body}</div>
                  )}
                  {i.restorable && r?.state !== "done" && (
                    <button type="button" className="wk-dec-restore" disabled={r?.state === "busy"} onClick={() => restoreIt(i.id, i.templateId)} aria-label={`Restore ${i.title}`}>
                      {r?.state === "busy" ? "Restoring…" : "Restore"}
                    </button>
                  )}
                  {r?.state === "done" && <span className="wk-dec-what">Restored</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
