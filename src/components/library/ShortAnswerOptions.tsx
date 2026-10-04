"use client";

/**
 * Under a SHORT answer field (Add and the Library's Edit): how the answer
 * will be graded, said as it is typed, and the "Case sensitive" switch
 * (off by default). The list syntax is explained in one line; a list that
 * can't be saved says why (shortAnswerProblem) and the form holds Save.
 */
import { shortAnswerProblem, shortAnswerRule } from "@/lib/short-answer";
import { Switch } from "@/components/ui/Tabs";

export function ShortAnswerOptions({
  answer,
  caseSensitive,
  onCaseSensitive,
}: {
  answer: string;
  caseSensitive: boolean;
  onCaseSensitive: (next: boolean) => void;
}) {
  const problem = shortAnswerProblem(answer);
  const rule = problem ? null : shortAnswerRule(answer, caseSensitive);
  return (
    <>
      {problem ? (
        <p className="st-error" role="alert">
          {problem}
        </p>
      ) : (
        <p className="st-hint">
          {rule ?? "Several parts in any order? Write [naked forex, mindfulness trading], or 2 of [red, green, blue] for any two."}
        </p>
      )}
      <div className="add-autocorrect" style={{ marginTop: 10 }}>
        <div className="n">
          <b>Case sensitive</b>
          <span className="t-meta">Off: &ldquo;paris&rdquo; passes for &ldquo;Paris&rdquo;. On: capitals must match, for symbols like Co and CO.</span>
        </div>
        <Switch checked={caseSensitive} onChange={onCaseSensitive} label="Case sensitive" />
      </div>
    </>
  );
}
