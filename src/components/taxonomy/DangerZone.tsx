"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetKnowledgeBase, RESET_SCOPES, type ResetScope, type ResetSummary } from "@/app/actions/reset";

interface Props {
  /** Row counts, so the panel states what is actually at stake. */
  counts: Record<string, number>;
}

const SCOPE_ORDER: ResetScope[] = ["ideas", "knowledge", "everything"];

/**
 * Irreversible resets.
 *
 * Three deliberate frictions, in increasing order of how much they cost the
 * user: the scope must be chosen (there is no default), the exact phrase
 * must be typed, and the panel states real row counts rather than a vague
 * "all data" — you should know you are about to lose 55 ideas before you
 * lose them, not after.
 *
 * Kept at the bottom of Taxonomy rather than behind a settings route: this
 * is where the structure is managed, and a destructive control hidden
 * somewhere obscure is one people rediscover by accident.
 */
export function DangerZone({ counts }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ResetScope | null>(null);
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ResetSummary | null>(null);

  const spec = scope ? RESET_SCOPES[scope] : null;
  const armed = spec !== null && phrase.trim() === spec.phrase;

  function run() {
    if (!scope || !spec) return;
    setError(null);
    startTransition(async () => {
      const res = await resetKnowledgeBase(scope, phrase.trim());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(res.value);
      setScope(null);
      setPhrase("");
      router.refresh();
    });
  }

  if (done) {
    const rows = Object.entries(done.deleted).filter(([, n]) => n > 0);
    return (
      <section className="card mt-6 p-4" style={{ borderColor: "rgba(0,204,122,0.25)" }}>
        <h2 className="panel-title">Reset complete</h2>
        <p className="panel-sub">Scope: {RESET_SCOPES[done.scope].label}</p>
        <ul className="mt-3 space-y-1">
          {rows.length === 0 ? (
            <li style={{ fontSize: 12, color: "var(--ink-2)" }}>Nothing to delete — it was already empty.</li>
          ) : (
            rows.map(([k, n]) => (
              <li key={k} className="flex justify-between" style={{ fontSize: 12, color: "var(--ink-1)" }}>
                <span>{k}</span>
                <span className="mono" style={{ color: "var(--red)" }}>
                  −{n}
                </span>
              </li>
            ))
          )}
        </ul>
        <button type="button" className="btn-secondary mt-4" onClick={() => setDone(null)}>
          Done
        </button>
      </section>
    );
  }

  return (
    <section className="card mt-6 p-4" style={{ borderColor: "rgba(240,58,87,0.25)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="panel-title" style={{ color: "var(--red)" }}>
            Danger zone
          </h2>
          <p className="panel-sub">Permanent. There is no undo and no backup.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(!open);
            setScope(null);
            setPhrase("");
            setError(null);
          }}
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: open ? "var(--ink-2)" : "var(--red)",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          {open ? "Cancel" : "Start fresh"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <p className="mono" style={{ fontSize: 11, color: "var(--ink-2)" }}>
            {counts.ideas} ideas · {counts.domains} domains · {counts.fields} fields · {counts.unlockedSkills}{" "}
            skills · {counts.masteryEntries} mastery entries
          </p>

          {SCOPE_ORDER.map((s) => {
            const meta = RESET_SCOPES[s];
            const on = scope === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setScope(on ? null : s);
                  setPhrase("");
                  setError(null);
                }}
                className="block w-full p-3 text-left"
                style={{
                  borderRadius: 10,
                  border: `1px solid ${on ? "rgba(240,58,87,0.45)" : "var(--line)"}`,
                  background: on ? "var(--red-10)" : "var(--sub)",
                  cursor: "pointer",
                }}
              >
                <span
                  className="block"
                  style={{ fontSize: 12.5, fontWeight: 600, color: on ? "var(--red)" : "var(--ink-0)" }}
                >
                  {meta.label}
                </span>
                <span className="mt-1 block" style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--ink-2)" }}>
                  {meta.blurb}
                </span>
              </button>
            );
          })}

          {spec && (
            <div className="space-y-2">
              <label className="block">
                <span className="label-xs mb-1.5 block">
                  Type <span style={{ color: "var(--red)" }}>{spec.phrase}</span> to confirm
                </span>
                <input
                  type="text"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  placeholder={spec.phrase}
                  autoComplete="off"
                  spellCheck={false}
                  className="input mono"
                />
              </label>
              <button
                type="button"
                disabled={!armed || isPending}
                onClick={run}
                className="w-full"
                style={{
                  padding: "9px 16px",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  border: "1px solid rgba(240,58,87,0.5)",
                  background: armed ? "var(--red)" : "var(--red-10)",
                  color: armed ? "#0b0406" : "var(--red)",
                  opacity: armed ? 1 : 0.5,
                  cursor: armed && !isPending ? "pointer" : "not-allowed",
                }}
              >
                {isPending ? "Deleting…" : `Delete — ${RESET_SCOPES[scope!].label.toLowerCase()}`}
              </button>
            </div>
          )}

          {error && (
            <p role="alert" style={{ fontSize: 12, color: "var(--red)" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
