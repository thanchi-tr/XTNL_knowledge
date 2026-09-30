"use client";

/**
 * Attest mastery: the one place a user writes free text that a model grades
 * for mastery points (once per life day; mastery.ts holds the rate limit, so
 * it can't be spammed into an unlock shortcut). The award is the grader's
 * exact figure, stated with its reason; nothing is rolled.
 */
import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { submitMasteryAttestation } from "@/app/actions/skills";
import { Button } from "@/components/ui/Button";
import { Amount } from "@/components/ui/Amount";

export function AttestationForm() {
  const router = useRouter();
  const id = useId();
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
    <form onSubmit={handleSubmit} className="card pad-l" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="t-body-l" style={{ margin: 0 }}>
        Attest mastery
      </h2>
      <p className="t-meta" id={`${id}-d`} style={{ marginTop: 2 }}>
        Write what you now understand. One graded attestation a day, worth up to 3 mastery points.
      </p>
      <label htmlFor={`${id}-t`} className="sr-only">
        What you now understand
      </label>
      <textarea
        id={`${id}-t`}
        aria-describedby={`${id}-d`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="att-input"
        placeholder="What clicked? Be specific: a restatement scores lower than a real insight."
        disabled={isPending}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
        <Button type="submit" variant="primary" disabled={isPending || !text.trim()}>
          {isPending ? "Grading…" : "Submit"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="t-meta" style={{ color: "var(--owed)", marginTop: 8 }}>
          {error}
        </p>
      )}
      {result && (
        <p role="status" className="t-meta ink-1" style={{ marginTop: 8 }}>
          <Amount kind="mp" value={result.points} label="MP" /> · {result.rationale}
        </p>
      )}
    </form>
  );
}
