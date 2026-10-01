import type { NoveltyMatch, NoveltyVerdict, Relation } from "@/lib/novelty";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { Meter } from "@/components/ui/Meter";
import { formatPercent } from "@/components/ui/format";
// Its add-* rules (the compare cards, the summary, the evidence list) live with New idea's.
import "@/components/library/study.css";

/**
 * How a new-or-existing verdict reads on New idea (src/lib/novelty.ts).
 *
 * "92% similar" alone was true and no help: it could not tell a reworded
 * duplicate from a corrected figure. This shows both cards side by side
 * (Yours · Already have, with a similarity meter), says what was found in a
 * sentence, and lists the evidence, so the verdict is checked, not trusted.
 *
 * Tone follows the house rule (colour only reports a state): a conflict is
 * owed (stop and look), a distinct card is kept (go ahead), everything else
 * is ink.
 */
export function relationTone(relation: Relation): ChipTone {
  switch (relation) {
    case "CONFLICT":
    case "OPPOSITE":
      return "owed";
    case "DISTINCT":
      return "kept";
    default:
      return "quiet";
  }
}

const where = (m: Pick<NoveltyMatch, "domainName" | "fieldName">) => [m.domainName, m.fieldName].filter(Boolean).join(" · ");

/** Yours vs Already have. With no match close enough to name, the right card says so. */
export function VerdictCompare({ verdict, fieldName }: { verdict: NoveltyVerdict; /** Where it was checked, for the empty case. */ fieldName?: string }) {
  const m = verdict.match;
  const c = verdict.candidate;
  return (
    <div className="add-verdict">
      <div className="card add-vcol">
        <div className="t-eyebrow">Yours</div>
        <p>{c.prompt}</p>
        {c.answer && <p className="add-ans">{c.answer}</p>}
      </div>
      <div className="card add-vcol">
        <div className="t-eyebrow">Already have</div>
        {m ? (
          <>
            <p>{m.title ?? m.prompt}</p>
            {m.title && m.prompt && m.prompt !== m.title && <p className="add-ans">{m.prompt}</p>}
            {m.answer && <p className="add-ans">{m.answer}</p>}
            {where(m) && <p className="t-meta">in {where(m)}</p>}
            <div className="add-sim">
              <span>similar</span>
              <Meter thin value={m.similarity} label={`Similarity to “${m.title ?? m.prompt}”`} valueText={formatPercent(m.similarity)} />
              <span className="num">{formatPercent(m.similarity)}</span>
            </div>
          </>
        ) : (
          <p className="ink-2">Nothing close{fieldName ? ` in ${fieldName}` : ""}.</p>
        )}
      </div>
    </div>
  );
}

/** The sentence, the evidence and the other cards worth knowing about. */
export function VerdictDetail({ verdict }: { verdict: NoveltyVerdict }) {
  return (
    <div>
      <p className="t-body add-summary">{verdict.summary}</p>
      {verdict.evidence.length > 0 && (
        <ul className="add-evidence" aria-label="Evidence">
          {verdict.evidence.map((e) => (
            <li key={e}>
              <Chip>{e}</Chip>
            </li>
          ))}
        </ul>
      )}
      {verdict.also.length > 0 && (
        <ul className="add-also" aria-label="Also worth knowing">
          {verdict.also.map((a) => (
            <li key={a.id}>
              <Chip tone={relationTone(a.relation)}>{a.label}</Chip>
              <span className="ink-1" title={a.prompt}>
                {a.title ?? a.prompt}
              </span>
              {a.fieldName && <span>in {where(a)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
