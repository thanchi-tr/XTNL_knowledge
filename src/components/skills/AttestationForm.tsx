"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { submitMasteryAttestation } from "@/app/actions/skills";

/**
 * The one place a user writes free text that a model grades for mastery
 * points — see mastery.ts's rate limit (once per UTC day) for why this
 * can't be spammed into a skill-unlock shortcut.
 */
export function AttestationForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ points: number; rationale: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await submitMasteryAttestation(null, text);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res.value);
      setText("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card px-4 py-4">
      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-0)" }}>Attest mastery</p>
      <p style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 2 }}>
        Write what you now understand — one graded attestation per day, worth up to 3 mastery points.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="input mt-3 w-full"
        placeholder="What clicked? Be specific — a shallow restatement scores lower than a real insight."
        disabled={isPending}
      />
      <button type="submit" disabled={isPending || !text.trim()} className="btn-primary mt-2">
        {isPending ? "Grading…" : "Submit"}
      </button>

      {error && (
        <p role="alert" style={{ fontSize: 11, color: "var(--red)", marginTop: 8 }}>
          {error}
        </p>
      )}
      {result && (
        <p style={{ fontSize: 11, color: "var(--green)", marginTop: 8 }}>
          +{result.points} mastery — {result.rationale}
        </p>
      )}
    </form>
  );
}
