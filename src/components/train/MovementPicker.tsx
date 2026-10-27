"use client";

/**
 * Add a movement to the open lift (health-brief §3.2, §3.5): search the library (57 movements, training-library.ts) and
 * the user's own by name or alias ('bench', 'ohp', 'rdl'), the ones lifted lately first; one tap adds it. Not there:
 * "New movement" makes one of the user's own (a name no library movement has, its pattern, equipment, how its load is
 * counted, its main muscles, one side at a time or not, a bodyweight share), checked as the server checks it
 * (cleanUserMovementInput) before it is sent, then added to the lift.
 */
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import {
  EQUIPMENT,
  EQUIPMENT_LABEL,
  GROUP_OF_MUSCLE,
  LOAD_KINDS,
  MOVEMENT_LIMITS,
  MUSCLES,
  MUSCLE_GROUP_LABEL,
  PATTERNS,
  PATTERN_LABEL,
  STARTER_MOVEMENTS,
  cleanUserMovementInput,
  defaultRestOf,
  findMovements,
  normNameOf,
  type LoadKind,
  type Movement,
  type Muscle,
} from "@/lib/training-library";
import type { UserMovementView } from "@/lib/training-server";
import type { CreateMovementInput } from "@/app/actions/training";

/** The new movement's form as typed. */
export interface MovementDraft {
  name: string;
  pattern: string;
  equipment: string;
  load: LoadKind;
  primary: Muscle[];
  unilateral: boolean;
  bodyFraction: string;
}

export const EMPTY_MOVEMENT: MovementDraft = { name: "", pattern: "", equipment: "", load: "EXT", primary: [], unilateral: false, bodyFraction: "" };

/** How a load is counted, in the form's words. */
const LOAD_WORDS: Readonly<Record<LoadKind, string>> = {
  EXT: "Total weight (a bar, a stack)",
  PAIR: "A pair, per dumbbell",
  ONE: "One weight",
  BW: "Body weight, plus or minus a load",
  TIME: "A hold, in seconds",
  CARRY: "A carry, per hand",
};

const LIBRARY_SHOWN = 12;
const SEARCH_SHOWN = 30;

const muscleWord = (m: Muscle): string => `${m.charAt(0).toUpperCase()}${m.slice(1)}`;

/** The user's own movement as the library's search reads it. */
function asMovement(u: UserMovementView): Movement {
  return {
    key: u.key,
    name: u.name,
    pattern: u.pattern,
    equipment: u.equipment,
    primary: u.primaryMuscles,
    secondary: u.secondaryMuscles,
    load: u.load,
    bodyFraction: u.bodyFraction,
    unilateral: u.unilateral,
    stepKg: u.stepKg,
    restSec: u.restSec ?? defaultRestOf({ pattern: u.pattern, equipment: u.equipment, primary: u.primaryMuscles }),
    aliases: [],
  };
}

/** 'Barbell · Chest · in this lift', 'Other · Shoulders · yours'. */
function subOf(m: Movement, own: boolean, inLift: boolean): string {
  const groups = [...new Set(m.primary.map((x) => GROUP_OF_MUSCLE[x]).filter((g): g is NonNullable<typeof g> => g != null))].map((g) => MUSCLE_GROUP_LABEL[g]);
  return [EQUIPMENT_LABEL[m.equipment], groups.join(", "), own ? "yours" : null, inLift ? "in this lift" : null].filter(Boolean).join(" · ");
}

export function MovementPicker({
  movements,
  recentKeys,
  inLift,
  busy,
  error,
  initialQuery = "",
  initialCreate = null,
  onPick,
  onCreate,
  onClose,
}: {
  /** The user's own movements (archived ones are left off the list). */
  movements: readonly UserMovementView[];
  /** Movements lifted lately, newest first: listed first. */
  recentKeys: readonly string[];
  inLift: ReadonlySet<string>;
  busy: boolean;
  error: string | null;
  initialQuery?: string;
  initialCreate?: MovementDraft | null;
  onPick: (key: string) => void;
  onCreate: (input: CreateMovementInput) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [query, setQuery] = useState(initialQuery);
  const [all, setAll] = useState(false);
  const [draft, setDraft] = useState<MovementDraft | null>(initialCreate);
  const [formError, setFormError] = useState<string | null>(null);
  const live = movements.filter((m) => !m.archived);
  const ownKeys = new Set(live.map((m) => m.key));
  const list = [...live.map(asMovement), ...STARTER_MOVEMENTS];
  const byKey = new Map(list.map((m) => [m.key, m]));
  const rank = new Map(recentKeys.map((k, i) => [k, i]));
  const recentFirst = (a: Movement, b: Movement) => (rank.get(a.key) ?? Number.POSITIVE_INFINITY) - (rank.get(b.key) ?? Number.POSITIVE_INFINITY);
  const q = query.trim();
  const recent = q === "" ? recentKeys.flatMap((k) => byKey.get(k) ?? []) : [];
  const rest = q === "" ? list.filter((m) => !rank.has(m.key)) : [];
  const hits = q === "" ? [] : findMovements(q, list, SEARCH_SHOWN).sort(recentFirst);
  const set = (patch: Partial<MovementDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const item = (m: Movement) => (
    <li key={m.key}>
      <Button variant="quiet" className="wt-lift-pick" onClick={() => onPick(m.key)} disabled={busy}>
        <span className="wt-lift-pick-n">{m.name}</span>
        <span className="wt-lift-pick-s">{subOf(m, ownKeys.has(m.key), inLift.has(m.key))}</span>
      </Button>
    </li>
  );

  function save() {
    if (!draft) return;
    const raw: CreateMovementInput = {
      name: draft.name,
      pattern: draft.pattern,
      equipment: draft.equipment,
      primary: draft.primary,
      load: draft.load,
      unilateral: draft.unilateral,
      ...(draft.load === "BW" && draft.bodyFraction.trim() !== "" ? { bodyFraction: draft.bodyFraction.trim().replace(",", ".") } : {}),
    };
    const clean = cleanUserMovementInput(raw, new Set(live.map((m) => normNameOf(m.name))));
    if (!clean.ok) {
      setFormError(clean.error);
      return;
    }
    setFormError(null);
    onCreate(raw);
  }

  return (
    <section className="wt-lift-picker" aria-labelledby={`${id}-h`}>
      <div className="wt-lift-entry-h">
        <h4 id={`${id}-h`} className="wt-lift-name">
          {draft ? "New movement" : "Add a movement"}
        </h4>
        <Button variant="quiet" onClick={onClose} disabled={busy}>
          Close
        </Button>
      </div>
      {draft ? (
        <div className="wt-ex-form">
          <label className="wt-ex-f">
            <span className="wt-label">Name</span>
            <input className="wt-input" inputMode="text" maxLength={MOVEMENT_LIMITS.NAME_MAX} placeholder="Landmine press" value={draft.name} onChange={(e) => set({ name: e.currentTarget.value })} disabled={busy} />
          </label>
          <div className="wt-ex-grid">
            <label className="wt-ex-f">
              <span className="wt-label">Pattern</span>
              <select className="wt-input" value={draft.pattern} onChange={(e) => set({ pattern: e.currentTarget.value })} disabled={busy}>
                <option value="">Pick one</option>
                {PATTERNS.map((p) => (
                  <option key={p} value={p}>
                    {PATTERN_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="wt-ex-f">
              <span className="wt-label">Equipment</span>
              <select className="wt-input" value={draft.equipment} onChange={(e) => set({ equipment: e.currentTarget.value })} disabled={busy}>
                <option value="">Pick one</option>
                {EQUIPMENT.map((x) => (
                  <option key={x} value={x}>
                    {EQUIPMENT_LABEL[x]}
                  </option>
                ))}
              </select>
            </label>
            <label className="wt-ex-f wt-ex-wide">
              <span className="wt-label">The load is</span>
              <select className="wt-input" value={draft.load} onChange={(e) => set({ load: e.currentTarget.value as LoadKind })} disabled={busy}>
                {LOAD_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {LOAD_WORDS[k]}
                  </option>
                ))}
              </select>
            </label>
            {draft.load === "BW" && (
              <label className="wt-ex-f wt-ex-wide">
                <span className="wt-label">Share of body weight (0.05 to 1, optional)</span>
                <input className="wt-input t-num" inputMode="decimal" placeholder="1" value={draft.bodyFraction} onChange={(e) => set({ bodyFraction: e.currentTarget.value })} disabled={busy} />
              </label>
            )}
          </div>
          <div className="wt-ex-f">
            <span className="wt-label" id={`${id}-mus`}>
              Main muscles (1 to {MOVEMENT_LIMITS.PRIMARY_MAX})
            </span>
            <div className="wt-ex-opts" role="group" aria-labelledby={`${id}-mus`}>
              {MUSCLES.map((x) => {
                const on = draft.primary.includes(x);
                return (
                  <ChipButton
                    key={x}
                    pressed={on}
                    onClick={() => set({ primary: on ? draft.primary.filter((y) => y !== x) : [...draft.primary, x] })}
                    disabled={busy || (!on && draft.primary.length >= MOVEMENT_LIMITS.PRIMARY_MAX)}
                  >
                    {muscleWord(x)}
                  </ChipButton>
                );
              })}
            </div>
          </div>
          <div className="wt-ex-opts" role="group" aria-label="Sides">
            <ChipButton pressed={draft.unilateral} onClick={() => set({ unilateral: !draft.unilateral })} disabled={busy}>
              One side at a time
            </ChipButton>
          </div>
          {(formError ?? error) && (
            <p className="t-meta wt-msg" role="alert">
              {formError ?? error}
            </p>
          )}
          <div className="wt-lift-acts">
            <Button variant="primary" className="wt-log" onClick={save} disabled={busy}>
              Save and add it
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setDraft(null);
                setFormError(null);
              }}
              disabled={busy}
            >
              Back to the list
            </Button>
          </div>
        </div>
      ) : (
        <>
          <label className="wt-ex-f">
            <span className="wt-label">Search by name</span>
            <input className="wt-input" type="search" inputMode="text" enterKeyHint="search" autoComplete="off" placeholder="bench, ohp, rdl" value={query} onChange={(e) => setQuery(e.currentTarget.value)} disabled={busy} />
          </label>
          {q === "" ? (
            <>
              {recent.length > 0 && (
                <div>
                  <h5 className="wt-lift-h5">Lately</h5>
                  <ul className="wt-lift-picks">{recent.map(item)}</ul>
                </div>
              )}
              <div>
                <h5 className="wt-lift-h5">{live.length > 0 ? "Yours and the library" : "The library"}</h5>
                <ul className="wt-lift-picks">{(all ? rest : rest.slice(0, LIBRARY_SHOWN)).map(item)}</ul>
              </div>
              {!all && rest.length > LIBRARY_SHOWN && (
                <Button variant="quiet" onClick={() => setAll(true)} disabled={busy}>
                  Show all {rest.length}
                </Button>
              )}
            </>
          ) : hits.length > 0 ? (
            <ul className="wt-lift-picks">{hits.map(item)}</ul>
          ) : (
            <p className="t-meta wt-lift-msg">Nothing by that name. Add it as your own below.</p>
          )}
          {error && (
            <p className="t-meta wt-msg" role="alert">
              {error}
            </p>
          )}
          <div className="wt-lift-acts">
            <Button variant="secondary" icon="plus" onClick={() => setDraft({ ...EMPTY_MOVEMENT, name: q })} disabled={busy}>
              New movement
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
