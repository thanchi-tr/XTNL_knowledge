"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetKnowledgeBase } from "@/app/actions/reset";
import { RESET_SCOPES, RESET_SCOPE_ORDER, type ResetScope, type ResetSummary } from "@/lib/reset-scopes";
import { Button } from "@/components/ui/Button";
import { TypedConfirm } from "@/components/ui/TypedConfirm";
import { MINUS } from "@/components/ui/format";
import "@/components/settings/settings.css";

interface Props {
  /** Row counts, so the panel states what is actually at stake. */
  counts: Record<string, number>;
  /** After a reset succeeded (the owner re-reads the counts). */
  onReset?: () => void;
}

/** A count from getResetPreview, as '12 ideas' / '1 idea'. A missing key reads 0 rather than 'undefined'. */
function countOf(counts: Record<string, number>, key: string, one: string, many: string): string {
  const n = counts[key] ?? 0;
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}

/**
 * Irreversible resets (Settings › Data; it lived at the bottom of the old
 * Taxonomy page).
 *
 * Three deliberate frictions: it sits behind Settings › Data, the scope must
 * be chosen (there is no default), and the scope's phrase must be typed
 * (the kit's TypedConfirm, the danger voice). The panel states real row
 * counts rather than a vague "all data": you should know you are about to
 * lose 55 ideas before you lose them. The server checks the phrase again
 * (reset.ts), so a mis-wired prop can never delete anything.
 */
export function DangerZone({ counts, onReset }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [scope, setScope] = useState<ResetScope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ResetSummary | null>(null);

  const spec = scope ? RESET_SCOPES[scope] : null;

  function run() {
    if (!scope || !spec) return;
    setError(null);
    startTransition(async () => {
      // TypedConfirm only enables its button once the phrase is typed; the
      // action checks it again against the same table.
      const res = await resetKnowledgeBase(scope, spec.phrase);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(res.value);
      setScope(null);
      router.refresh();
      onReset?.();
    });
  }

  if (done) {
    const rows = Object.entries(done.deleted).filter(([, n]) => n > 0);
    return (
      <section className="dz-sec" aria-labelledby="dz-done-h" role="status">
        <h3 id="dz-done-h">Reset complete</h3>
        <p className="t-meta">Scope: {RESET_SCOPES[done.scope].label}</p>
        <ul className="dz-list">
          {rows.length === 0 ? (
            <li>Nothing to delete: it was already empty.</li>
          ) : (
            rows.map(([k, n]) => (
              <li key={k}>
                <span>{k}</span>
                <span className="t-mono">
                  {MINUS}
                  {n.toLocaleString("en-GB")}
                </span>
              </li>
            ))
          )}
        </ul>
        <div>
          <Button variant="secondary" onClick={() => setDone(null)}>
            Done
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="dz-sec danger" aria-labelledby="dz-h">
      <h3 id="dz-h">Start fresh</h3>
      <p className="t-meta">Permanent. There is no undo and no backup.</p>
      <p className="dz-counts">
        {[
          countOf(counts, "ideas", "idea", "ideas"),
          countOf(counts, "domains", "domain", "domains"),
          countOf(counts, "fields", "field", "fields"),
          countOf(counts, "unlockedSkills", "skill", "skills"),
          countOf(counts, "masteryEntries", "mastery entry", "mastery entries"),
          countOf(counts, "capitalEntries", "capital entry", "capital entries"),
          countOf(counts, "augments", "augment", "augments"),
          countOf(counts, "tasks", "task", "tasks"),
          countOf(counts, "taskInstances", "task record", "task records"),
          countOf(counts, "activityEvents", "activity event", "activity events"),
        ].join(" · ")}
      </p>

      {/* The shared order, so every scope the server accepts ('life' included) has its button here. */}
      <div className="dz-scopes" role="group" aria-label="What to delete">
        {RESET_SCOPE_ORDER.map((s) => {
          const meta = RESET_SCOPES[s];
          const on = scope === s;
          return (
            <button
              key={s}
              type="button"
              className="dz-scope"
              aria-pressed={on}
              onClick={() => {
                setScope(on ? null : s);
                setError(null);
              }}
            >
              <b>{meta.label}</b>
              <span>{meta.blurb}</span>
            </button>
          );
        })}
      </div>

      {spec && scope && (
        <TypedConfirm
          key={scope}
          phrase={spec.phrase}
          action={`Delete: ${spec.label.toLowerCase()}`}
          onConfirm={run}
          pending={isPending}
        />
      )}

      {error && (
        <p role="alert" className="t-meta" style={{ color: "var(--owed)" }}>
          {error}
        </p>
      )}
    </section>
  );
}
