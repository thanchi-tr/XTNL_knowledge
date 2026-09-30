"use client";

/**
 * FROZEN CONTRACT — TypedConfirm (L0-foundation): the danger voice's typed-phrase confirm.
 *
 *   <TypedConfirm phrase="reset life" action="Reset life data" onConfirm={run} pending?/>
 *
 *   The danger button stays disabled until the phrase is typed exactly
 *   (case-insensitive, trimmed). Used by Settings › Data (L5).
 */
import { useId, useState } from "react";
import { Button } from "./Button";

export function TypedConfirm({
  phrase,
  action,
  onConfirm,
  pending,
  hint,
}: {
  phrase: string;
  action: string;
  onConfirm: () => void;
  pending?: boolean;
  hint?: string;
}) {
  const [typed, setTyped] = useState("");
  const id = useId();
  const ok = typed.trim().toLowerCase() === phrase.trim().toLowerCase();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label htmlFor={id} className="t-meta">
        {hint ?? "Type"} <b className="ink-0">{phrase}</b> to confirm.
      </label>
      <input id={id} className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
      <Button variant="danger" disabled={!ok || pending} onClick={onConfirm}>
        {pending ? "Working…" : action}
      </Button>
    </div>
  );
}
