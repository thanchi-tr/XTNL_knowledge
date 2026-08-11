"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Attribute, CollectionLabel } from "@prisma/client";
import {
  submitIdea,
  linkIdea,
  enrichIdea,
  previewIdea,
  type SubmitIdeaResult,
  type PreviewIdeaResult,
} from "@/app/actions/ideas";
import type { IdeaContent } from "@/lib/idea-payload";
import { ATTRIBUTE_META } from "@/lib/attributes";
import { themeFor } from "@/lib/attribute-themes";

export interface AddFormField {
  id: string;
  name: string;
  domains: { id: string; name: string }[];
  /** Top attribute weights this Field trains — shows what a submission here actually feeds. */
  composition: { attribute: Attribute; weight: number }[];
}

interface Props {
  fields: AddFormField[];
}

/** Glyphs already used on review cards elsewhere — same vocabulary, so a type is recognisable across screens. */
const TYPE_META = {
  SHORT: { glyph: "◆", label: "Short", hint: "Free text, graded on similarity", points: 10 },
  MULTI: { glyph: "▣", label: "Multi", hint: "Pick one option", points: 20 },
  FORMULA: { glyph: "∑", label: "Formula", hint: "Proved by algebraic equivalence", points: 30 },
} as const;

// Sentinel for the Domain <select>. "" would collide with a real empty
// value; this makes "let discovery decide" an explicit choice.
const AUTO_DOMAIN = "__auto__";

// DIAGRAM isn't offered here — authoring hotspot coordinates over an image
// needs a real editor (upload + click-to-place), which is out of scope for
// a first form. DIAGRAM Ideas can still be reviewed (SessionCard handles
// them); they just can't be created through this UI yet.
type CreatableQuestionType = "SHORT" | "MULTI" | "FORMULA";

// Control styling lives in globals.css (`.label-xs`, `.input`) so this form
// and the taxonomy manager stay identical.
const LABEL_CLASS = "label-xs mb-1.5 block";
const FIELD_CLASS = "input";

export function AddIdeaForm({ fields }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [fieldId, setFieldId] = useState(fields[0]?.id ?? "");
  const [domainId, setDomainId] = useState<string>(AUTO_DOMAIN);
  const [collectionLabel, setCollectionLabel] = useState<CollectionLabel>("BOOK");
  const [questionType, setQuestionType] = useState<CreatableQuestionType>("SHORT");

  const [shortQuestion, setShortQuestion] = useState("");
  const [shortAnswer, setShortAnswer] = useState("");
  const [formulaQuestion, setFormulaQuestion] = useState("");
  const [formulaAnswer, setFormulaAnswer] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);

  const [result, setResult] = useState<SubmitIdeaResult | null>(null);
  const [pendingContent, setPendingContent] = useState<IdeaContent | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const [enrichOutcome, setEnrichOutcome] = useState<"enriched" | "no_new_information" | null>(null);

  const [preview, setPreview] = useState<PreviewIdeaResult | null>(null);
  const [isPreviewing, startPreview] = useTransition();

  const selectedField = fields.find((f) => f.id === fieldId);

  function handlePreview() {
    const content = buildContent();
    if (!content || !fieldId) return;
    setPreview(null);
    startPreview(async () => {
      setPreview(await previewIdea({ fieldId, content }));
    });
  }

  function buildContent(): IdeaContent | null {
    if (questionType === "SHORT") {
      if (!shortQuestion.trim() || !shortAnswer.trim()) return null;
      return { type: "SHORT", question: shortQuestion.trim(), answer: shortAnswer.trim() };
    }
    if (questionType === "FORMULA") {
      if (!formulaQuestion.trim() || !formulaAnswer.trim()) return null;
      return { type: "FORMULA", question: formulaQuestion.trim(), answer: formulaAnswer.trim() };
    }
    const cleaned = options.map((o) => o.trim()).filter(Boolean);
    if (cleaned.length < 2 || !cleaned[correctIndex]) return null;
    return { type: "MULTI", options: cleaned, correct: cleaned[correctIndex] };
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const content = buildContent();
    if (!content || !fieldId) return;
    setPendingContent(content);
    startTransition(async () => {
      const res = await submitIdea({
        fieldId,
        collectionLabel,
        content,
        domainId: domainId === AUTO_DOMAIN ? undefined : domainId,
      });
      setResult(res);
      if (res.status === "created") {
        setAddedCount((c) => c + 1);
        router.refresh();
      }
    });
  }

  function handleLink(existingIdeaId: string) {
    if (!pendingContent) return;
    startTransition(async () => {
      await linkIdea({ content: pendingContent, collectionLabel, existingIdeaId });
      setResult(null);
      setPendingContent(null);
      router.refresh();
    });
  }

  function handleEnrich(targetIdeaId: string, similarity: number) {
    if (!pendingContent) return;
    startTransition(async () => {
      const res = await enrichIdea({ targetIdeaId, content: pendingContent, similarity });
      // "no_new_information" means the synthesis call found nothing the
      // existing node doesn't already say. Surfacing that rather than
      // silently succeeding — otherwise the user is left believing they
      // added something they didn't.
      setEnrichOutcome(res.status);
      if (res.status === "enriched") {
        setResult(null);
        setPendingContent(null);
        router.refresh();
      }
    });
  }

  function reset() {
    setResult(null);
    setPendingContent(null);
    setEnrichOutcome(null);
    setShortQuestion("");
    setShortAnswer("");
    setFormulaQuestion("");
    setFormulaAnswer("");
    setOptions(["", ""]);
    setCorrectIndex(0);
  }

  if (result?.status === "created") {
    const note =
      result.classification === "NOVELTY"
        ? "New domain created — this idea matched nothing existing."
        : result.classification === "MANUAL"
          ? "Filed in the domain you selected."
          : "Filed in the nearest matching domain.";

    return (
      <div className="card fade-up p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="chip chip-green">Created</span>
          {addedCount > 1 && (
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {addedCount} added this session
            </span>
          )}
        </div>
        <p className="mt-2.5" style={{ fontSize: 13, color: "var(--ink-1)" }}>
          {note}
        </p>
        {result.decision.node_data && (
          <p className="mt-1.5" style={{ fontSize: 12, color: "var(--ink-2)" }}>
            Indexed as &ldquo;{result.decision.node_data.title}&rdquo;
          </p>
        )}
        <button type="button" className="btn-secondary mt-4" onClick={reset}>
          Add another
        </button>
      </div>
    );
  }

  // Above the merge line the submission was folded into an existing node and
  // no Idea was created — deliberately styled as information rather than
  // success, since nothing new entered the knowledge base.
  if (result?.status === "merged") {
    return (
      <div className="card fade-up p-4">
        <span className="chip chip-muted">Merged</span>
        <p className="mt-2.5" style={{ fontSize: 13, color: "var(--ink-1)" }}>
          Already in your knowledge base at{" "}
          <span className="mono" style={{ color: "var(--ink-0)" }}>
            {(result.similarity * 100).toFixed(1)}%
          </span>{" "}
          similarity — folded into the existing idea rather than duplicated.
        </p>
        <p className="mt-2" style={{ fontSize: 11, lineHeight: 1.6, color: "var(--ink-3)" }}>
          {result.decision.deduplication_reasoning}
        </p>
        <button type="button" className="btn-secondary mt-4" onClick={reset}>
          Add another
        </button>
      </div>
    );
  }

  if (result?.status === "saturated") {
    return (
      <div className="card fade-up p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip chip-amber">Near duplicate</span>
          <span className="mono" style={{ fontSize: 12, color: "var(--ink-1)" }}>
            {(result.similarity * 100).toFixed(1)}% similar
          </span>
        </div>

        <dl className="mt-3 space-y-1.5" style={{ fontSize: 12, color: "var(--ink-2)" }}>
          <div className="flex gap-2">
            <dt style={{ color: "var(--ink-1)", fontWeight: 600, minWidth: 52 }}>Link</dt>
            <dd>Keeps this as its own idea and records the connection. Earns points.</dd>
          </div>
          <div className="flex gap-2">
            <dt style={{ color: "var(--ink-1)", fontWeight: 600, minWidth: 52 }}>Enrich</dt>
            <dd>Folds the new detail into the existing idea. No new idea, no points.</dd>
          </div>
        </dl>

        {enrichOutcome === "no_new_information" && (
          <p
            className="mt-3 px-3 py-2"
            style={{
              fontSize: 12,
              borderRadius: 10,
              background: "var(--amber-10)",
              border: "1px solid rgba(240,160,48,0.20)",
              color: "var(--amber)",
            }}
          >
            Nothing added — the existing idea already covers this. Try Link, or rewrite to sharpen the
            difference.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleLink(result.matchedIdeaId)}
            className="btn-primary"
          >
            Link Idea
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleEnrich(result.matchedIdeaId, result.similarity)}
            className="btn-secondary"
          >
            {isPending ? "Working…" : "Enrich Existing"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setResult(null)}>
            Rewrite
          </button>
        </div>
      </div>
    );
  }

  // Every Idea needs a Field, and until the Taxonomy page existed there was
  // no way to make one outside the seed script — so an empty database left
  // this form permanently unusable with no explanation.
  if (fields.length === 0) {
    return (
      <div className="card px-4 py-10 text-center">
        <p style={{ fontSize: 13, color: "var(--ink-1)" }}>You need at least one field before adding an idea.</p>
        <Link href="/taxonomy" className="btn-primary mt-4 inline-flex no-underline">
          Create a Field
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-5 p-5" style={{ fontSize: 13 }}>
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className={LABEL_CLASS}>Field</span>
          <select
            value={fieldId}
            onChange={(e) => {
              setFieldId(e.target.value);
              // Domains are scoped to a Field, so a carried-over selection
              // would point at a Domain the new Field doesn't own.
              setDomainId(AUTO_DOMAIN);
            }}
            className={FIELD_CLASS}
          >
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>Collection</span>
          <select
            value={collectionLabel}
            onChange={(e) => setCollectionLabel(e.target.value as CollectionLabel)}
            className={FIELD_CLASS}
          >
            <option value="BOOK">Book</option>
            <option value="ACTIONABLE">Actionable</option>
            <option value="PROPOSAL">Proposal</option>
          </select>
        </label>
      </div>

      <label className="block">
        <span className={LABEL_CLASS}>Domain</span>
        <select value={domainId} onChange={(e) => setDomainId(e.target.value)} className={FIELD_CLASS}>
          <option value={AUTO_DOMAIN}>Auto — discover from content</option>
          {selectedField?.domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <span className="mt-1.5 block" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {domainId === AUTO_DOMAIN
            ? "Routed by similarity to what this Field already contains; a new Domain is created if nothing matches."
            : "Filed here directly. Duplicate checking still runs."}
        </span>
      </label>

      {/* Segmented rather than a <select>: three options that each carry a
          glyph, a payout and a one-line explanation is a choice worth
          seeing all of at once. The point values are the real `XP_BASE`
          figures, so the harder format visibly pays more. */}
      <div>
        <span className={LABEL_CLASS}>Question type</span>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(TYPE_META) as CreatableQuestionType[]).map((type) => {
            const meta = TYPE_META[type];
            const on = questionType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setQuestionType(type);
                  setPreview(null);
                }}
                className="card card-hover text-left"
                style={{
                  padding: "9px 11px",
                  cursor: "pointer",
                  borderColor: on ? "rgba(0,204,122,0.45)" : "var(--line)",
                  background: on ? "var(--green-06)" : undefined,
                }}
              >
                <div className="flex items-baseline justify-between gap-1">
                  <span style={{ fontSize: 13, color: on ? "var(--green)" : "var(--ink-2)" }}>{meta.glyph}</span>
                  <span className="mono" style={{ fontSize: 10, color: on ? "var(--green)" : "var(--ink-3)" }}>
                    {meta.points}
                  </span>
                </div>
                <p style={{ fontSize: 11.5, fontWeight: 600, color: on ? "var(--ink-0)" : "var(--ink-1)", marginTop: 2 }}>
                  {meta.label}
                </p>
                <p style={{ fontSize: 9.5, color: "var(--ink-3)", lineHeight: 1.35, marginTop: 1 }}>{meta.hint}</p>
              </button>
            );
          })}
        </div>
        <span className="mt-1.5 block" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          Diagram Ideas aren&apos;t supported by this form yet — needs image/hotspot authoring.
        </span>
      </div>

      {/* What this submission feeds. Adding an idea has always quietly moved
          attribute scores through the Field's composition; this is the first
          place that connection is visible at the moment of capture. */}
      {selectedField && selectedField.composition.length > 0 && (
        <div className="px-3 py-2.5" style={{ borderRadius: 10, background: "var(--sub)", border: "1px solid var(--line)" }}>
          <p className="label-xs" style={{ fontSize: 9.5 }}>
            Feeds
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5">
            {selectedField.composition.map(({ attribute, weight }) => {
              const theme = themeFor(attribute);
              return (
                <span key={attribute} className="flex items-center gap-1.5" style={{ fontSize: 10.5 }}>
                  <span
                    style={{ width: 6, height: 6, borderRadius: 999, background: theme.color, display: "inline-block" }}
                  />
                  <span style={{ color: "var(--ink-1)" }}>{ATTRIBUTE_META[attribute].label}</span>
                  <span className="mono" style={{ color: "var(--ink-3)" }}>
                    {weight}%
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {questionType === "SHORT" && (
        <>
          <label className="block">
            <span className={LABEL_CLASS}>Question</span>
            <textarea
              value={shortQuestion}
              onChange={(e) => setShortQuestion(e.target.value)}
              rows={2}
              className={FIELD_CLASS}
            />
          </label>
          <label className="block">
            <span className={LABEL_CLASS}>Answer</span>
            <input
              type="text"
              value={shortAnswer}
              onChange={(e) => setShortAnswer(e.target.value)}
              className={FIELD_CLASS}
            />
          </label>
        </>
      )}

      {questionType === "FORMULA" && (
        <>
          <label className="block">
            <span className={LABEL_CLASS}>Prompt</span>
            <textarea
              value={formulaQuestion}
              onChange={(e) => setFormulaQuestion(e.target.value)}
              rows={2}
              className={FIELD_CLASS}
            />
          </label>
          <label className="block">
            <span className={LABEL_CLASS}>Answer expression (mathjs syntax, e.g. sqrt(x^2 + y^2))</span>
            <input
              type="text"
              value={formulaAnswer}
              onChange={(e) => setFormulaAnswer(e.target.value)}
              className={`${FIELD_CLASS} font-mono`}
            />
          </label>
        </>
      )}

      {questionType === "MULTI" && (
        <div className="space-y-2">
          <span className={LABEL_CLASS}>
            Options (select the correct one) — note this schema has no separate prompt field for MULTI, only
            the option list itself
          </span>
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct-option"
                checked={correctIndex === i}
                onChange={() => setCorrectIndex(i)}
                style={{ accentColor: "var(--green)" }}
              />
              <input
                type="text"
                value={opt}
                onChange={(e) => setOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))}
                className={`flex-1 ${FIELD_CLASS}`}
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => {
                    setOptions((prev) => prev.filter((_, idx) => idx !== i));
                    setCorrectIndex((c) => (c >= i && c > 0 ? c - 1 : c));
                  }}
                  style={{ fontSize: 11, color: "var(--ink-2)" }}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setOptions((prev) => [...prev, ""])}
            style={{ fontSize: 11, fontWeight: 600, color: "var(--green)" }}
          >
            + Add option
          </button>
        </div>
      )}

      {/* Pre-commit check. `previewIdea` writes nothing, so a near-duplicate
          can be found *before* submitting rather than reported afterwards. */}
      {preview && (
        <div
          className="fade-up px-3 py-3"
          style={{
            borderRadius: 10,
            background: preview.action === "CREATE_NEW_NODE" ? "var(--green-06)" : "var(--amber-10)",
            border: `1px solid ${preview.action === "CREATE_NEW_NODE" ? "rgba(0,204,122,0.22)" : "rgba(240,160,48,0.24)"}`,
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`chip ${preview.action === "CREATE_NEW_NODE" ? "chip-green" : "chip-amber"}`}>
              {preview.action === "CREATE_NEW_NODE"
                ? "Clear — will create"
                : preview.action === "SATURATION"
                  ? "Near duplicate"
                  : "Already known"}
            </span>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-2)" }}>
              worth {preview.projectedPoints.toFixed(1)}
              {preview.projectedPoints < preview.basePoints && (
                <span style={{ color: "var(--ink-3)" }}> of {preview.basePoints}</span>
              )}
            </span>
          </div>

          {preview.neighbours.length > 0 ? (
            <div className="mt-2.5 space-y-1.5">
              {preview.neighbours.map((n) => (
                <div key={n.id} className="flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden" style={{ borderRadius: 2, background: "var(--sub)" }}>
                    <div
                      style={{
                        // The model's cosine floor is ~0.52, never 0 — see the
                        // calibration note in xp.ts — so the bar is scaled
                        // across the range that actually occurs.
                        width: `${Math.max(0, Math.min(1, (n.similarity - 0.5) / 0.5)) * 100}%`,
                        height: "100%",
                        borderRadius: 2,
                        background: n.similarity > 0.85 ? "var(--amber)" : "var(--ink-3)",
                      }}
                    />
                  </div>
                  <span className="mono shrink-0" style={{ fontSize: 10, color: "var(--ink-2)", width: 42, textAlign: "right" }}>
                    {(n.similarity * 100).toFixed(0)}%
                  </span>
                  <span className="min-w-0 flex-[2] truncate" style={{ fontSize: 10.5, color: "var(--ink-2)" }} title={n.title ?? n.id}>
                    {n.title ?? "untitled node"}
                  </span>
                </div>
              ))}
              {preview.nSimilar > 0 && (
                <p style={{ fontSize: 9.5, color: "var(--ink-3)", marginTop: 4 }}>
                  {preview.nSimilar} close neighbour{preview.nSimilar === 1 ? "" : "s"} — payout decays with
                  saturation.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-2" style={{ fontSize: 10.5, color: "var(--ink-2)" }}>
              Nothing comparable in this field yet — it will open a new domain.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button type="submit" disabled={isPending || !fieldId} className="btn-primary">
          {isPending ? "Checking…" : "Submit"}
        </button>
        <button
          type="button"
          onClick={handlePreview}
          disabled={isPreviewing || isPending || !fieldId || !buildContent()}
          className="btn-secondary"
        >
          {isPreviewing ? "Checking…" : "Check first"}
        </button>
        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Embedded and deduplicated before write.</span>
      </div>
    </form>
  );
}
