"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Attribute } from "@prisma/client";
import { createField, createDomain, updateFieldComposition } from "@/app/actions/taxonomy";
import type { TaxonomyTree } from "@/lib/taxonomy";
import { ATTRIBUTES, ATTRIBUTE_META, COMPOSITION_TOTAL, type Composition } from "@/lib/attributes";

interface Props {
  initialTree: TaxonomyTree[];
}

export function TaxonomyManager({ initialTree }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [newFieldName, setNewFieldName] = useState("");
  // Which Field's "add Domain" row is open. Only one at a time — a page-wide
  // map of open inputs would be more flexible and harder to track visually.
  const [openFieldId, setOpenFieldId] = useState<string | null>(null);
  const [newDomainName, setNewDomainName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Composition editor — same single-open-row pattern as the Domain form
  // above, keyed separately since a field's "+ Domain" row and its
  // composition editor are independent surfaces.
  const [compositionFieldId, setCompositionFieldId] = useState<string | null>(null);
  const [draftWeights, setDraftWeights] = useState<Composition | null>(null);

  function openComposition(field: TaxonomyTree) {
    setCompositionFieldId(field.id);
    setDraftWeights({ ...field.composition });
    setError(null);
  }

  function handleSaveComposition(fieldId: string) {
    if (!draftWeights) return;
    setError(null);
    startTransition(async () => {
      const res = await updateFieldComposition(fieldId, draftWeights);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCompositionFieldId(null);
      setDraftWeights(null);
      router.refresh();
    });
  }

  const draftTotal = draftWeights ? ATTRIBUTES.reduce((sum, a) => sum + Math.max(0, draftWeights[a]), 0) : 0;

  function handleCreateField(e: FormEvent) {
    e.preventDefault();
    const name = newFieldName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const res = await createField(name);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNewFieldName("");
      router.refresh();
    });
  }

  function handleCreateDomain(e: FormEvent, fieldId: string) {
    e.preventDefault();
    const name = newDomainName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const res = await createDomain(fieldId, name);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNewDomainName("");
      setOpenFieldId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleCreateField} className="flex gap-2">
        <input
          type="text"
          value={newFieldName}
          onChange={(e) => setNewFieldName(e.target.value)}
          placeholder="New field — e.g. Real Analysis"
          className="input"
        />
        <button type="submit" disabled={isPending || !newFieldName.trim()} className="btn-primary">
          Add Field
        </button>
      </form>

      {error && (
        <p
          role="alert"
          className="px-3 py-2"
          style={{
            fontSize: 12,
            borderRadius: 10,
            background: "var(--red-10)",
            border: "1px solid rgba(240,58,87,0.20)",
            color: "var(--red)",
          }}
        >
          {error}
        </p>
      )}

      {initialTree.length === 0 && (
        <p className="card px-4 py-10 text-center" style={{ fontSize: 13, color: "var(--ink-2)" }}>
          No fields yet. Create one above to start building the taxonomy.
        </p>
      )}

      {initialTree.map((field) => {
        const ideaTotal = field.domains.reduce((s, d) => s + d.ideaCount, 0);
        return (
          <section key={field.id} className="card">
            <div
              className="flex flex-wrap items-baseline justify-between gap-3 px-4 py-3"
              style={{ borderBottom: "1px solid var(--line)" }}
            >
              <div className="flex items-baseline gap-3">
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--ink-0)" }}>
                  {field.name}
                </h2>
                <span className="mono" style={{ fontSize: 11, color: "var(--green)" }}>
                  L{field.level.toFixed(1)}
                </span>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  {field.domains.length} domain{field.domains.length === 1 ? "" : "s"} · {ideaTotal} idea
                  {ideaTotal === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    if (compositionFieldId === field.id) {
                      setCompositionFieldId(null);
                      setDraftWeights(null);
                    } else {
                      openComposition(field);
                    }
                  }}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: compositionFieldId === field.id ? "var(--ink-2)" : "var(--ink-1)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {compositionFieldId === field.id ? "Cancel" : "Composition"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenFieldId(openFieldId === field.id ? null : field.id);
                    setNewDomainName("");
                    setError(null);
                  }}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: openFieldId === field.id ? "var(--ink-2)" : "var(--green)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {openFieldId === field.id ? "Cancel" : "+ Domain"}
                </button>
              </div>
            </div>

            {compositionFieldId === field.id && draftWeights && (
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--line)", background: "var(--sub)" }}>
                <p className="mb-2" style={{ fontSize: 11, color: "var(--ink-2)" }}>
                  Attribute weights — what this Field trains, as a percentage split. Must sum to {COMPOSITION_TOTAL};
                  saving re-normalises automatically.{" "}
                  <span style={{ color: draftTotal === COMPOSITION_TOTAL ? "var(--green)" : "var(--ink-3)" }}>
                    Currently {draftTotal}.
                  </span>
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                  {ATTRIBUTES.map((attribute) => (
                    <label key={attribute} className="flex items-center justify-between gap-2" style={{ fontSize: 12 }}>
                      <span style={{ color: "var(--ink-1)" }}>{ATTRIBUTE_META[attribute].label}</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={draftWeights[attribute]}
                        onChange={(e) => {
                          const value = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                          setDraftWeights((prev) => (prev ? { ...prev, [attribute as Attribute]: value } : prev));
                        }}
                        className="input"
                        style={{ width: 60, padding: "4px 8px" }}
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveComposition(field.id)}
                  disabled={isPending}
                  className="btn-primary mt-3"
                >
                  Save composition
                </button>
              </div>
            )}

            {openFieldId === field.id && (
              <form
                onSubmit={(e) => handleCreateDomain(e, field.id)}
                className="flex gap-2 px-4 py-3"
                style={{ borderBottom: "1px solid var(--line)", background: "var(--sub)" }}
              >
                <input
                  type="text"
                  value={newDomainName}
                  onChange={(e) => setNewDomainName(e.target.value)}
                  placeholder={`New domain under ${field.name}`}
                  autoFocus
                  className="input"
                />
                <button type="submit" disabled={isPending || !newDomainName.trim()} className="btn-primary">
                  Create
                </button>
              </form>
            )}

            {field.domains.length === 0 ? (
              <p className="px-4 py-4" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                No domains yet — one is created automatically when you add an idea that matches nothing here.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Domain</th>
                      <th scope="col" className="num">
                        Ideas
                      </th>
                      <th scope="col" className="num">
                        Points
                      </th>
                      <th scope="col" className="num">
                        Level
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {field.domains.map((domain) => (
                      <tr key={domain.id}>
                        <td>{domain.name}</td>
                        <td className="num" style={{ color: domain.ideaCount === 0 ? "var(--ink-3)" : "var(--ink-1)" }}>
                          {domain.ideaCount}
                        </td>
                        <td className="num" style={{ color: "var(--ink-1)" }}>
                          {domain.totalPoints.toFixed(0)}
                        </td>
                        <td className="num" style={{ color: "var(--green)" }}>
                          {domain.level}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
