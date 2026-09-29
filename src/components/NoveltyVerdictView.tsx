import type { NoveltyMatch, NoveltyVerdict, Relation } from "@/lib/novelty";

/**
 * How a new-or-existing verdict reads on the Add form (src/lib/novelty.ts).
 *
 * The old panel said "92% similar" and nothing else, which was true and no
 * help: it could not tell a reworded duplicate from a corrected figure. This
 * says what was found in a sentence, shows both cards side by side, and
 * lists the evidence — so the user checks the verdict rather than trusting
 * a percentage.
 */

/** Colour by what the relation asks of the user: stop and look, think twice, or go ahead. */
export function relationChip(relation: Relation): string {
  switch (relation) {
    case "CONFLICT":
    case "OPPOSITE":
      return "chip-red";
    case "IDENTICAL":
      return "chip-muted";
    case "REWORDED":
    case "COVERED":
    case "EXTENDS":
    case "REFORMATTED":
    case "CLOSE":
      return "chip-amber";
    case "SIBLING":
    case "RELATED":
      return "chip-blue";
    case "DISTINCT":
      return "chip-green";
  }
}

const where = (m: NoveltyMatch) => [m.domainName, m.fieldName].filter(Boolean).join(" · ");

/** One card, as the comparison shows it. */
function CardFace({ heading, prompt, answer, note }: { heading: string; prompt: string; answer: string; note?: string }) {
  return (
    <div className="min-w-0 flex-1 px-3 py-2" style={{ borderRadius: 8, background: "var(--sub)", border: "1px solid var(--line)" }}>
      <p className="label-xs" style={{ marginBottom: 4 }}>
        {heading}
        {note && <span style={{ color: "var(--ink-3)", fontWeight: 400 }}> · {note}</span>}
      </p>
      {prompt && (
        <p style={{ fontSize: 12, color: "var(--ink-0)", lineHeight: 1.45, overflowWrap: "anywhere" }}>{prompt}</p>
      )}
      {answer && (
        <p className="mt-1" style={{ fontSize: 11.5, color: "var(--ink-1)", lineHeight: 1.45, overflowWrap: "anywhere" }}>
          → {answer}
        </p>
      )}
    </div>
  );
}

export function VerdictDetail({ verdict, compare = true }: { verdict: NoveltyVerdict; /** Show both cards side by side. */ compare?: boolean }) {
  const m = verdict.match;
  const candidate = verdict.candidate;
  const showCompare = compare && m && verdict.action !== "CREATE_NEW_NODE";
  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--ink-1)", lineHeight: 1.5 }}>{verdict.summary}</p>

      {showCompare && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <CardFace heading="Yours" prompt={candidate.prompt} answer={candidate.answer} />
          <CardFace heading="Already have" prompt={m.prompt} answer={m.answer} note={where(m)} />
        </div>
      )}

      <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Evidence">
        {verdict.evidence.map((e) => (
          <li
            key={e}
            className="mono"
            style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "var(--sub)", border: "1px solid var(--line)", color: "var(--ink-2)" }}
          >
            {e}
          </li>
        ))}
      </ul>

      {verdict.also.length > 0 && (
        <ul className="mt-2.5 space-y-1" style={{ fontSize: 11, color: "var(--ink-2)" }}>
          {verdict.also.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-1.5">
              <span className={`chip ${relationChip(a.relation)}`} style={{ fontSize: 9.5 }}>
                {a.label}
              </span>
              <span className="min-w-0 truncate" title={a.prompt}>
                {a.title ?? a.prompt}
              </span>
              {a.fieldName && <span style={{ color: "var(--ink-3)" }}>in {where(a)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
