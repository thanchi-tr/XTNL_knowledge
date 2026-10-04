"use client";

/**
 * Resolving a Domain item (F9; final-roadmap-draft.html L). Gemini never
 * creates a Domain or a Field: the user maps a proposal to one of theirs, or
 * creates it under a name they confirmed.
 *
 *   [Map to…]  a picker over the user's library (the Area Field first) → EDITED
 *   [Create]   an editable name, prefilled with Gemini's proposal and run
 *              through the label flags (Number, A name you didn't write, Claim
 *              word, Looks like a resource): a flagged name keeps Create off
 *              until it is edited. Then "Similar: … — use it?" when one of the
 *              user's Domains is close, then createDomain. EDITED when the name
 *              changed, CHECKED when it did not.
 */
import { useId, useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import { ActionError } from "@/components/home/ActionError";
import { matchDomainName, type ValidateDomain } from "@/lib/roadmap-validate";
import { PACK_NAME_MAX, type BlockingFlag } from "@/lib/roadmap-types";
import { FLAG_WORD, LIBRARY_UNCHECKED_LINE, flagReason, plural } from "./roadmap-copy";
import { useRoadmapAction } from "./roadmap-runtime";
import { deviceLabelFlags, labelContextOf } from "./roadmap-labels";
import type { ActTarget, ItemEditorScope } from "./ItemEditor";
import { libraryLoaded, type LibraryDomain } from "./roadmap-ui-model";

/**
 * The Create sheet's similarity box: the near name when one scored, "None of
 * your Domains is similar" only after the user's Domains were compared, and
 * "Your Domains weren't checked here" when they weren't on the page.
 */
export function similarLineOf(similar: { name: string; cards: number } | null, library: readonly LibraryDomain[] | undefined): string {
  if (similar) return `Similar: ${similar.name} (${plural(similar.cards, "card")}) — use it?`;
  return libraryLoaded(library) ? "None of your Domains is similar." : LIBRARY_UNCHECKED_LINE;
}

/** The flags that keep [Create] off until the name is edited. */
export const CREATE_BLOCKING: readonly BlockingFlag[] = ["NUMBER", "PROPER_NOUN", "CLAIM_WORDS", "LOOKS_LIKE_RESOURCE"];

/** Whether [Create] may go ahead: no blocking flag, or a name the user changed. */
export function createAllowed(name: string, original: string, flags: readonly BlockingFlag[]): boolean {
  const blocking = flags.filter((f) => CREATE_BLOCKING.includes(f));
  return blocking.length === 0 || name.replace(/\s+/g, " ").trim() !== original.replace(/\s+/g, " ").trim();
}

function byField(library: readonly LibraryDomain[], areaFieldId: string | null): { fieldId: string; fieldName: string; domains: LibraryDomain[] }[] {
  const groups = new Map<string, { fieldId: string; fieldName: string; domains: LibraryDomain[] }>();
  for (const d of library) {
    if (!groups.has(d.fieldId)) groups.set(d.fieldId, { fieldId: d.fieldId, fieldName: d.fieldName, domains: [] });
    groups.get(d.fieldId)!.domains.push(d);
  }
  return [...groups.values()].sort((a, b) => Number(b.fieldId === areaFieldId) - Number(a.fieldId === areaFieldId) || a.fieldName.localeCompare(b.fieldName));
}

export function MapDomainSheet({ target, scope, onClose }: { target: ActTarget | null; scope: ItemEditorScope; onClose: () => void }) {
  const { run, pending, error } = useRoadmapAction();
  const groups = byField(scope.library ?? [], scope.areaFieldId);
  return (
    <Sheet open={target != null} onClose={onClose} title="Map to one of your Domains" description={target ? `Gemini's word: "${target.row.label}"` : undefined}>
      {target && (
        <div className="rm-stack" style={{ gap: 12 }}>
          {groups.length === 0 && <p className="t-meta">{libraryLoaded(scope.library) ? "You have no Domains to map to yet." : LIBRARY_UNCHECKED_LINE}</p>}
          {groups.map((g) => (
            <div key={g.fieldId}>
              <div className="t-eyebrow rm-sheet-eyebrow" style={{ marginTop: 0 }}>
                {g.fieldName}
              </div>
              <div className="rm-pick-list">
                {g.domains.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className="rm-pick"
                    aria-pressed={target.row.domainId === d.id}
                    disabled={pending}
                    onClick={() => run((a) => a.resolveDomain(target.row.id, { kind: "MAP", domainId: d.id }), () => onClose())}
                  >
                    <span className="rm-pick-t">
                      <b>{d.name}</b>
                      <span className="t-meta">
                        {plural(d.cards, "card")} · {d.atSix} at level 6+
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {error && <ActionError>{error}</ActionError>}
        </div>
      )}
    </Sheet>
  );
}

export function CreateDomainSheet({ target, scope, onClose }: { target: ActTarget | null; scope: ItemEditorScope; onClose: () => void }) {
  return (
    <Sheet
      open={target != null}
      onClose={onClose}
      title={scope.areaName ? `Create a Domain in ${scope.areaName}` : "Create a Domain"}
      description={target ? `Milestone ${target.milestone.ord} · Gemini proposed "${target.item?.proposedName ?? target.row.label}"` : undefined}
    >
      {target && <CreateBody key={target.row.id} target={target} scope={scope} onClose={onClose} />}
    </Sheet>
  );
}

function CreateBody({ target, scope, onClose }: { target: ActTarget; scope: ItemEditorScope; onClose: () => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement | null>(null);
  const original = target.item?.proposedName ?? target.row.label;
  const [name, setName] = useState(original);
  const [blockedShown, setBlockedShown] = useState(false);
  const [similarSeen, setSimilarSeen] = useState(false);
  const { run, pending, error } = useRoadmapAction();
  const flags = useMemo(() => deviceLabelFlags(name, labelContextOf(scope, "DOMAIN", target.milestone)).filter((f) => CREATE_BLOCKING.includes(f)), [name, scope, target.milestone]);
  const allowed = createAllowed(name, original, flags);
  const similar = useMemo(() => {
    const lib: ValidateDomain[] = (scope.library ?? []).map((d) => ({ id: d.id, name: d.name, fieldId: d.fieldId, fieldName: d.fieldName, cards: d.cards }));
    if (lib.length === 0 || !name.trim()) return null;
    try {
      const m = matchDomainName(name, lib, scope.areaFieldId);
      if (m.similar) return m.similar;
      const hit = m.kind !== "NONE" && m.domainId ? lib.find((d) => d.id === m.domainId) : undefined;
      return hit ? { domainId: hit.id, name: hit.name, cards: hit.cards, score: m.score } : null;
    } catch {
      return null;
    }
  }, [name, scope.library, scope.areaFieldId]);
  const changed = name.replace(/\s+/g, " ").trim() !== original.replace(/\s+/g, " ").trim();
  const trimmed = name.replace(/\s+/g, " ").trim();

  const create = () => {
    if (!trimmed) {
      input.current?.focus();
      return;
    }
    if (!allowed) {
      setBlockedShown(true);
      input.current?.focus();
      return;
    }
    if (similar && !similarSeen) {
      setSimilarSeen(true);
      return;
    }
    if (!scope.areaFieldId) return;
    run((a) => a.resolveDomain(target.row.id, { kind: "CREATE", name: trimmed, fieldId: scope.areaFieldId! }), () => onClose());
  };

  return (
    <div className="rm-form">
      <div className="rm-f">
        <label className="st-label" htmlFor={id}>
          Name
          <span className="rm-count">
            {name.length} / {PACK_NAME_MAX}
          </span>
        </label>
        <input
          ref={input}
          id={id}
          className="st-input"
          value={name}
          maxLength={PACK_NAME_MAX}
          onChange={(e) => {
            setName(e.target.value);
            setBlockedShown(false);
            setSimilarSeen(false);
          }}
          autoComplete="off"
          data-autofocus
        />
        <p className="st-hint">Checked like any label first: a number, a name you didn&apos;t write, a claim word or a resource keeps Create off until you edit it.</p>
      </div>
      {flags.length > 0 && !changed && (
        <div className="rm-fact" role={blockedShown ? "alert" : undefined}>
          <span className="t-eyebrow">Edit the name first</span>
          {flags.map((f) => (
            <span key={f} style={{ display: "block" }}>
              <b className="ink-0">{FLAG_WORD[f]}</b> · {flagReason(f, {})}
            </span>
          ))}
        </div>
      )}
      <div className="sunk" style={{ padding: 12 }}>
        <p className="t-meta rm-ink1">{similarLineOf(similar, scope.library)}</p>
        {similar && (
          <div className="rm-acts">
            <ChipButton disabled={pending} onClick={() => run((a) => a.resolveDomain(target.row.id, { kind: "MAP", domainId: similar.domainId }), () => onClose())}>
              Use {similar.name}
            </ChipButton>
          </div>
        )}
      </div>
      {error && <ActionError>{error}</ActionError>}
      <Button variant="primary" size="lg" block onClick={create} disabled={pending}>
        {pending ? "Creating…" : similar && similarSeen ? `Create "${trimmed}" anyway` : `Create "${trimmed || "…"}"`}
      </Button>
      <p className="t-meta">{changed ? "You changed the name, so it becomes yours (edited)." : "Unchanged, it reads “You checked this”."}</p>
    </div>
  );
}
