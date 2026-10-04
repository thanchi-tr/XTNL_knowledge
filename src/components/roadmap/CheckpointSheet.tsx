"use client";

/**
 * "Log a score" for a checkpoint (F10 logCheckpoint; final-roadmap.html P).
 * Append-only under its own SELF key with a nonce per sheet, so a double
 * submit writes once. A logged score is the user's, never overwritten, sits
 * beside progress and never moves it; a log this week marks the checkpoint
 * week quest done.
 */
import { useId, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { ActionError } from "@/components/home/ActionError";
import { CHECKPOINT_KIND_WORD, labelWithClass } from "./roadmap-copy";
import { useRoadmapAction } from "./roadmap-runtime";
import { provenanceOf, type ItemDraft } from "@/lib/roadmap-types";

function newNonce(): string {
  try {
    return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 32);
  } catch {
    return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function CheckpointSheet({ open, onClose, item }: { open: boolean; onClose: () => void; item: ItemDraft }) {
  const bar = item.bar != null && item.outOf != null ? `your bar is ${item.bar} of ${item.outOf}` : "you haven't set a bar";
  return (
    <Sheet open={open} onClose={onClose} title={labelWithClass(item.label, provenanceOf(item.origin, item.decision))} description={`${item.checkpointKind ? CHECKPOINT_KIND_WORD[item.checkpointKind] : "Checkpoint"} · ${bar}`}>
      {open && <LogBody key={item.lineageId} item={item} onClose={onClose} />}
    </Sheet>
  );
}

function LogBody({ item, onClose }: { item: ItemDraft; onClose: () => void }) {
  const ids = { score: useId(), note: useId() };
  const [nonce] = useState(newNonce);
  const [score, setScore] = useState("");
  const [outOf, setOutOf] = useState(item.outOf != null ? String(item.outOf) : "");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const { run, pending, error } = useRoadmapAction();
  const s = Number(score);
  const o = Number(outOf);
  const log = () => {
    if (!score.trim() || !Number.isFinite(s) || s < 0) return setProblem("Type the score you got.");
    if (!(o > 0) || s > o) return setProblem("The score is out of a number at least as big as it.");
    setProblem(null);
    run(
      (a) => a.logCheckpoint(item.lineageId, s, o, note.trim() || null, nonce),
      () => onClose()
    );
  };
  return (
    <div className="rm-form">
      <div className="rm-step">
        <input id={ids.score} className="st-input" inputMode="decimal" aria-label="Score" value={score} onChange={(e) => setScore(e.target.value)} data-autofocus />
        <span className="t-meta">of</span>
        <input className="st-input" inputMode="decimal" aria-label="Out of" value={outOf} onChange={(e) => setOutOf(e.target.value)} />
      </div>
      <div className="rm-f">
        <label className="st-label" htmlFor={ids.note}>
          Note <span className="rm-opt">optional</span>
        </label>
        <input id={ids.note} className="st-input" placeholder="What tripped you up" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} />
      </div>
      {problem && (
        <p className="t-error" role="alert">
          {problem}
        </p>
      )}
      {error && <ActionError>{error}</ActionError>}
      <Button variant="primary" size="lg" block onClick={log} disabled={pending}>
        {pending ? "Logging…" : score.trim() && outOf.trim() ? `Log ${score} of ${outOf}` : "Log a score"}
      </Button>
      <p className="t-meta">Logged scores are yours and never overwritten. They sit beside progress and never move it. A log this week marks the checkpoint week quest done.</p>
    </div>
  );
}
