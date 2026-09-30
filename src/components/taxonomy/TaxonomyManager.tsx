"use client";

/**
 * Study › Fields & Domains: create a Field, add a Domain by hand, and edit a
 * Field's composition (the attribute split it trains). Re-attribute and the
 * resets live in Settings › Data.
 */
import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Attribute } from "@prisma/client";
import { createField, createDomain, updateFieldComposition } from "@/app/actions/taxonomy";
import type { TaxonomyTree } from "@/lib/taxonomy";
import { ATTRIBUTES, ATTRIBUTE_META, COMPOSITION_TOTAL, type Composition } from "@/lib/attributes";
import { Button } from "@/components/ui/Button";
import { levelText, plural } from "@/components/library/library-model";
import "@/components/library/study.css";

interface Props {
  initialTree: TaxonomyTree[];
}

export function TaxonomyManager({ initialTree }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [newFieldName, setNewFieldName] = useState("");
  // One open "add Domain" row and one open composition editor at a time.
  const [openFieldId, setOpenFieldId] = useState<string | null>(null);
  const [newDomainName, setNewDomainName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [compositionFieldId, setCompositionFieldId] = useState<string | null>(null);
  const [draftWeights, setDraftWeights] = useState<Composition | null>(null);

  function openComposition(field: TaxonomyTree) {
    setCompositionFieldId(field.id);
    setDraftWeights({ ...field.composition });
    setError(null);
  }

  function closeComposition() {
    setCompositionFieldId(null);
    setDraftWeights(null);
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
      closeComposition();
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

  const domainCount = initialTree.reduce((sum, f) => sum + f.domains.length, 0);

  return (
    <div className="st-page">
      <p className="t-meta">
        Domains are normally discovered for you: an idea that matches nothing gets a new one, named for it. Create them by
        hand when you already know how a subject should split. {plural(initialTree.length, "field")} ·{" "}
        {plural(domainCount, "domain")}.
      </p>

      <form onSubmit={handleCreateField} className="st-new">
        <label className="sr-only" htmlFor="st-new-field">
          New field name
        </label>
        <input
          id="st-new-field"
          type="text"
          className="st-input"
          value={newFieldName}
          onChange={(e) => setNewFieldName(e.target.value)}
          placeholder="New field, e.g. Real Analysis"
          autoComplete="off"
        />
        <Button type="submit" variant="primary" disabled={isPending || !newFieldName.trim()}>
          Add field
        </Button>
      </form>

      {error && (
        <p role="alert" className="st-error">
          {error}
        </p>
      )}

      {initialTree.length === 0 && (
        <p className="card lib-empty ink-1">No fields yet. Create one above to start the structure your ideas file into.</p>
      )}

      <div className="st-fields">
        {initialTree.map((field) => {
          const ideaTotal = field.domains.reduce((s, d) => s + d.ideaCount, 0);
          const composing = compositionFieldId === field.id && draftWeights !== null;
          const adding = openFieldId === field.id;
          const headingId = `st-f-${field.id}`;
          return (
            <section key={field.id} className="card" aria-labelledby={headingId}>
              <div className="st-head">
                <div className="who">
                  <h2 id={headingId}>{field.name}</h2>
                  <div className="t-meta">
                    {levelText(field.level)} · {plural(field.domains.length, "domain")} · {plural(ideaTotal, "idea")}
                  </div>
                </div>
                <div className="acts">
                  <Button
                    variant="quiet"
                    aria-expanded={composing}
                    onClick={() => (composing ? closeComposition() : openComposition(field))}
                  >
                    {composing ? "Close composition" : "Composition"}
                  </Button>
                  <Button
                    variant="quiet"
                    icon={adding ? undefined : "plus"}
                    aria-expanded={adding}
                    onClick={() => {
                      setOpenFieldId(adding ? null : field.id);
                      setNewDomainName("");
                      setError(null);
                    }}
                  >
                    {adding ? "Cancel" : "Domain"}
                  </Button>
                </div>
              </div>

              {composing && draftWeights && (
                <div className="st-panel">
                  <p className="t-meta">
                    What {field.name} trains, as a percentage split. It should sum to {COMPOSITION_TOTAL}; saving re-normalises
                    it. Now <b className={draftTotal === COMPOSITION_TOTAL ? "ink-0" : "ink-1"}>{draftTotal}</b>.
                  </p>
                  <div className="st-comp">
                    {ATTRIBUTES.map((attribute) => (
                      <label key={attribute}>
                        <span>{ATTRIBUTE_META[attribute].label}</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={100}
                          className="st-input num"
                          value={draftWeights[attribute]}
                          onChange={(e) => {
                            const value = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                            setDraftWeights((prev) => (prev ? { ...prev, [attribute as Attribute]: value } : prev));
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="st-row">
                    <Button variant="primary" onClick={() => handleSaveComposition(field.id)} disabled={isPending}>
                      Save composition
                    </Button>
                    <Button variant="quiet" onClick={closeComposition}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {adding && (
                <form onSubmit={(e) => handleCreateDomain(e, field.id)} className="st-panel">
                  <div className="st-new">
                    <label className="sr-only" htmlFor={`st-d-${field.id}`}>
                      New domain under {field.name}
                    </label>
                    <input
                      id={`st-d-${field.id}`}
                      type="text"
                      className="st-input"
                      value={newDomainName}
                      onChange={(e) => setNewDomainName(e.target.value)}
                      placeholder={`New domain under ${field.name}`}
                      autoFocus
                      autoComplete="off"
                    />
                    <Button type="submit" variant="primary" disabled={isPending || !newDomainName.trim()}>
                      Create
                    </Button>
                  </div>
                  <p className="st-hint" style={{ marginTop: 0 }}>
                    An empty domain fills when you pick it on New idea; discovery only routes to domains that already hold ideas.
                  </p>
                </form>
              )}

              {field.domains.length === 0 ? (
                <p className="st-empty t-meta">No domains yet: one opens when you add an idea that matches nothing here.</p>
              ) : (
                <table className="st-table">
                  <caption className="sr-only">Domains in {field.name}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Domain</th>
                      <th scope="col" className="n">
                        Ideas
                      </th>
                      <th scope="col" className="n">
                        Points
                      </th>
                      <th scope="col" className="n">
                        Level
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {field.domains.map((domain) => (
                      <tr key={domain.id}>
                        <td>{domain.name}</td>
                        <td className={domain.ideaCount === 0 ? "n zero" : "n"}>{domain.ideaCount}</td>
                        <td className="n">{Math.round(domain.totalPoints).toLocaleString("en-GB")}</td>
                        <td className="n">L{domain.level}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          );
        })}
      </div>

      <p className="t-meta">
        Recompute attribution and the resets are in{" "}
        <Link className="link" href="/settings#data">
          Settings › Data
        </Link>
        .
      </p>
    </div>
  );
}
