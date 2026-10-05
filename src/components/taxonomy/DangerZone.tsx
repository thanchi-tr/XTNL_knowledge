"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetKnowledgeBase } from "@/app/actions/reset";
import { RESET_ARCHIVE_NOTE, RESET_SCOPES, RESET_SCOPE_ORDER, ROADMAP_RESET_EFFECT, type ResetScope, type ResetSummary } from "@/lib/reset-scopes";
import { Button } from "@/components/ui/Button";
import { TypedConfirm } from "@/components/ui/TypedConfirm";
import { MINUS } from "@/components/ui/format";
import "@/components/library/study.css";
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
 * What the chosen scope does to the roadmap (reset-scopes ROADMAP_RESET_EFFECT;
 * roadmap.md F16 seam 11), from getResetPreview's roadmaps and openRoadmaps:
 * 'life' and 'everything' delete every roadmap with the life tables; 'ideas'
 * and 'knowledge' archive the open one (DRAFT or ACTIVE), because they take
 * away what its measures count. Null when the scope touches no roadmap, so
 * the panel never claims an effect that won't happen.
 */
export function roadmapResetLine(scope: ResetScope, counts: Record<string, number>): string | null {
  if (ROADMAP_RESET_EFFECT[scope] === "delete") {
    const all = counts.roadmaps ?? 0;
    return all > 0 ? `Also deletes ${countOf(counts, "roadmaps", "roadmap", "roadmaps")}, with their milestones, readings and Aim ranks.` : null;
  }
  const open = counts.openRoadmaps ?? 0;
  return open > 0
    ? `Also archives your open roadmap, marked "${RESET_ARCHIVE_NOTE}": its readings and Aim rank stay as history, and a milestone goal it put on Today stays and pays nothing.`
    : null;
}

/** The summary's row for a key (a table's own key otherwise); an archived roadmap is kept, so it shows no minus. */
const DONE_LABEL: Record<string, string> = { roadmapsArchived: "roadmaps archived" };
const KEPT_KEYS = new Set(["roadmapsArchived"]);

/**
 * Irreversible resets (Settings › Data; it lived at the bottom of the old
 * Taxonomy page).
 *
 * Three deliberate frictions: it sits behind Settings › Data, the scope must
 * be chosen (there is no default), and the scope's phrase must be typed
 * (the kit's TypedConfirm, the danger voice). The panel states real row
 * counts rather than a vague "all data": you should know you are about to
 * lose 55 ideas before you lose them.
 *
 * What the person typed is what the server receives. TypedConfirm arms its
 * button on a case-insensitive match and keeps the text to itself, so the
 * panel reads the field's value as it changes (React's change event bubbles
 * to the wrapper) and sends exactly that. The server is the gate: reset.ts
 * compares it, trimmed but case-sensitive, to the scope's phrase, so "delete
 * ideas" arms the button but deletes nothing, and a mis-wired prop can never
 * stand in for the phrase.
 */
export function DangerZone({ counts, onReset }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [scope, setScope] = useState<ResetScope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ResetSummary | null>(null);
  /** The confirm field's text, as typed (never the canonical phrase). */
  const [typed, setTyped] = useState("");

  const spec = scope ? RESET_SCOPES[scope] : null;
  const roadmapLine = scope ? roadmapResetLine(scope, counts) : null;

  function choose(next: ResetScope | null) {
    setScope(next);
    // TypedConfirm is keyed by scope, so its field starts empty again.
    setTyped("");
    setError(null);
  }

  function run() {
    if (!scope || !spec) return;
    const confirmation = typed;
    setError(null);
    startTransition(async () => {
      // Exactly what was typed: the action decides whether it is the phrase.
      const res = await resetKnowledgeBase(scope, confirmation);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(res.value);
      choose(null);
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
                <span>{DONE_LABEL[k] ?? k}</span>
                <span className="t-mono">
                  {KEPT_KEYS.has(k) ? "" : MINUS}
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
          countOf(counts, "roadmaps", "roadmap", "roadmaps"),
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
              onClick={() => choose(on ? null : s)}
            >
              <b>{meta.label}</b>
              <span>{meta.blurb}</span>
            </button>
          );
        })}
      </div>

      {spec && roadmapLine && <p className="t-meta">{roadmapLine}</p>}

      {spec && scope && (
        <div
          onChange={(e) => {
            if (e.target instanceof HTMLInputElement) setTyped(e.target.value);
            // A refusal ("Type DELETE IDEAS exactly…") goes once the text changes.
            setError(null);
          }}
        >
          <TypedConfirm
            key={scope}
            phrase={spec.phrase}
            action={`Delete: ${spec.label.toLowerCase()}`}
            onConfirm={run}
            pending={isPending}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="st-error">
          {error}
        </p>
      )}
    </section>
  );
}
