"use client";

/**
 * FROZEN CONTRACT — TypedConfirm (L0-foundation): the danger voice's typed-phrase confirm.
 *
 *   <TypedConfirm phrase="reset life" action="Reset life data" onConfirm={(typed) => run(typed)} pending? exact?/>
 *
 *   The danger button stays disabled until the phrase is typed: trimmed and
 *   case-insensitive by default, or exactly (capitals included) with `exact`.
 *   onConfirm receives what the person TYPED (trimmed), never the canonical
 *   phrase, so the server can check the words itself (Settings › Data, L5).
 */
import { useId, useState } from "react";
import { Button } from "./Button";

/** Does `typed` arm the confirm? Trimmed; case-insensitive unless `exact`. Exported for the checks. */
export function phraseMatches(typed: string, phrase: string, exact = false): boolean {
  const want = phrase.trim();
  if (!want) return false;
  const got = typed.trim();
  return exact ? got === want : got.toLowerCase() === want.toLowerCase();
}

export function TypedConfirm({
  phrase,
  action,
  onConfirm,
  pending,
  hint,
  exact = false,
}: {
  phrase: string;
  action: string;
  /** Called with the trimmed text the person typed. */
  onConfirm: (typed: string) => void;
  pending?: boolean;
  hint?: string;
  /** Require the phrase exactly, capitals included (the old reset friction). */
  exact?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const id = useId();
  const ok = phraseMatches(typed, phrase, exact);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label htmlFor={id} className="t-meta">
        {hint ?? "Type"} <b className="ink-0">{phrase}</b> to confirm{exact ? ", exactly as shown" : ""}.
      </label>
      <input id={id} className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
      <Button variant="danger" disabled={!ok || pending} onClick={() => onConfirm(typed.trim())}>
        {pending ? "Working…" : action}
      </Button>
    </div>
  );
}
