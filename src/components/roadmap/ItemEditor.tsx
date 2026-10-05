"use client";

/**
 * One controller for every decision on a roadmap item (F9, F15, F18): the
 * draft review, the Start sheet and the living roadmap's kept items all go
 * through it, so a row means the same thing everywhere.
 *
 *   Keep            → decideItem KEPT (KEPT_SUGGESTION, never YOURS)
 *   I checked this  → decideItem CHECKED (a Domain: resolveDomain CHECK) — YOURS, "You checked this"
 *   Remove          → decideItem REMOVED (kept as a row)
 *   Edit            → the Edit sheet (closed pickers, free text for labels) — EDITED, YOURS
 *   Map to…         → the Domain picker over the user's library — EDITED
 *   Create          → an editable name, label-checked, then the similar-name prompt — EDITED or CHECKED
 *   Drop            → resolveDomain DROP
 *   Change the type → a code-worded practice, step or checkpoint swapped for
 *                     another from the app's list (revision 4, F-R4-21): EDITED
 *   Use the app's default → Gemini's choice that isn't the app's default
 *                     (contracts §20, geminiChoiceOf) swapped for the stage's
 *                     default in one tap: editItem with that type, EDITED;
 *                     when the stage already holds the default, the pick is
 *                     removed instead (decideItem REMOVED), never doubled
 *   Keep Gemini's choice → that choice, still waiting (accept waits on it):
 *                     decideItem CHECKED (R4 keeps a waiting pick so)
 *
 * The milestone's title is decided through its milestone id (decideItem and
 * editItem take it in place of an item id; R4's cores read either).
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import type { Track } from "@/lib/life-types";
import type { ItemDraft, ItemEdit, MilestoneDraft, PracticeFamily } from "@/lib/roadmap-types";
import type { CatalogKey } from "@/lib/roadmap-catalog";
import { useRoadmapAction } from "./roadmap-runtime";
import { ITEM_ACTION_WORD, geminiChoiceOf, itemClassOf, stageRunOf, type EditorRow, type ItemAction, type LibraryDomain } from "./roadmap-ui-model";
import { labelWithClass } from "./roadmap-copy";
import { EditItemSheet } from "./EditItemSheet";
import { CreateDomainSheet, MapDomainSheet } from "./DomainSheets";
import { CatalogTypeSheet } from "./CatalogSheet";

/** What the label checks and the Domain sheets read (F6's LabelContext, the Area, the library). */
export interface ItemEditorScope {
  roadmapId: string;
  aim: string;
  constraints: string | null;
  examLabel: string | null;
  areaName: string;
  /** The Area Field (null for a life-track Area: no Domains). */
  areaFieldId: string | null;
  track: Track;
  /** The user's Domains with their facts (RoadmapView.library); undefined: not loaded here (no Map to…, no Add a Domain). */
  library: readonly LibraryDomain[] | undefined;
  syllabusLines: readonly string[];
  milestoneCount: number;
  today: string;
  /** Revision 4: the types the constraints left out (DraftView.exclusions), and the ones the user allowed back ([Allow one]): the type picker reads both. */
  excluded?: readonly CatalogKey[];
  allowed?: readonly CatalogKey[];
  /** Constraint safety (contracts §19): the kinds waiting on the user's answer (PENDING rows); the picker names them as not offered yet. */
  held?: readonly CatalogKey[];
  /**
   * The practice progression (contracts §20): Gemini's picks on these rows
   * are choices among each stage's options (roadmap-ui-model
   * picksAreChoicesOf over the run that wrote them). Absent or false: a pick
   * reads as before, "picked by Gemini from the app's list".
   */
  choices?: boolean;
  /** A Field plan's practice family when the view carries the user's answer (contracts §20.11); null: the aim's prefill (stageRunOf). */
  practiceFamily?: PracticeFamily | null;
  /**
   * A plan you wrote yourself (the rows' writer is MANUAL: "Write it myself",
   * or a re-plan edited by hand). It stays yours: code never fills its
   * practices, and each stage offers "Add the app's practice" instead
   * (roadmap-ui-model appPracticeOf; the lead's ruling 6).
   */
  manual?: boolean;
}

/** The row an action is about, with its item (null for the title) and its milestone. */
export interface ActTarget {
  row: EditorRow;
  item: ItemDraft | null;
  milestone: MilestoneDraft;
}

interface EditorContextValue {
  scope: ItemEditorScope;
  act: (target: ActTarget, action: ItemAction) => void;
  more: (target: ActTarget, actions: readonly ItemAction[]) => void;
  /** The error of the last action on this row, if it failed. */
  errorFor: (rowId: string) => string | null;
  busyFor: (rowId: string) => boolean;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function useItemEditor(): EditorContextValue | null {
  return useContext(EditorContext);
}

export function ItemEditor({ scope, children }: { scope: ItemEditorScope; children: ReactNode }) {
  const { run, pending, error } = useRoadmapAction();
  const [lastId, setLastId] = useState<string | null>(null);
  const [edit, setEdit] = useState<ActTarget | null>(null);
  const [map, setMap] = useState<ActTarget | null>(null);
  const [create, setCreate] = useState<ActTarget | null>(null);
  const [type, setType] = useState<ActTarget | null>(null);
  const [overflow, setOverflow] = useState<{ target: ActTarget; actions: readonly ItemAction[] } | null>(null);

  const act = useCallback(
    (target: ActTarget, action: ItemAction) => {
      const id = target.row.id;
      setLastId(id);
      switch (action) {
        case "KEEP":
          run((a) => a.decideItem(id, "KEPT"));
          return;
        case "CHECK":
          if (target.row.kind === "DOMAIN") run((a) => a.resolveDomain(id, { kind: "CHECK" }));
          else run((a) => a.decideItem(id, "CHECKED"));
          return;
        case "REMOVE":
          run((a) => a.decideItem(id, "REMOVED"));
          return;
        case "DROP":
          run((a) => a.resolveDomain(id, { kind: "DROP" }));
          return;
        case "EDIT":
          setEdit(target);
          return;
        case "MAP":
          setMap(target);
          return;
        case "CREATE":
          setCreate(target);
          return;
        case "TYPE":
          setType(target);
          return;
        case "DEFAULT": {
          // The stage's default under the plan's gate (the options Gemini was offered, the first being code's default).
          const choice = target.item ? geminiChoiceOf(target.item, target.milestone, { ...stageRunOf(scope), choices: scope.choices === true }) : null;
          const fallback = choice && !choice.isDefault ? choice.options[0] : null;
          if (!fallback) return;
          // The stage already holds the default beside the pick (the progression placed both): the pick goes, never a second row of it.
          if (target.milestone.items.some((it) => it.id !== id && it.decision !== "REMOVED" && it.catalogKey === fallback)) {
            run((a) => a.decideItem(id, "REMOVED"));
            return;
          }
          const edit: ItemEdit = { catalogKey: fallback };
          run((a) => a.editItem(id, edit));
          return;
        }
        case "KEEP_PICK":
          // Gemini's choice, still waiting: R4's decideItem CHECKED keeps it (never a kind the gate holds; the server refuses one).
          run((a) => a.decideItem(id, "CHECKED"));
          return;
      }
    },
    [run, scope]
  );

  const value = useMemo<EditorContextValue>(
    () => ({
      scope,
      act,
      more: (target, actions) => setOverflow({ target, actions }),
      errorFor: (rowId) => (rowId === lastId ? error : null),
      busyFor: (rowId) => pending && rowId === lastId,
    }),
    [scope, act, lastId, error, pending]
  );

  return (
    <EditorContext.Provider value={value}>
      {children}
      <Sheet
        open={overflow != null}
        onClose={() => setOverflow(null)}
        title="More for this item"
        description={overflow ? labelWithClass(overflow.target.row.label, itemClassOf(overflow.target.row)) : undefined}
      >
        <div className="rm-stack" style={{ gap: 8 }}>
          {overflow?.actions.map((a) => (
            <Button
              key={a}
              block
              onClick={() => {
                const t = overflow.target;
                setOverflow(null);
                act(t, a);
              }}
            >
              {ITEM_ACTION_WORD[a]}
            </Button>
          ))}
        </div>
      </Sheet>
      <EditItemSheet target={edit} scope={scope} onClose={() => setEdit(null)} />
      <MapDomainSheet target={map} scope={scope} onClose={() => setMap(null)} />
      <CreateDomainSheet target={create} scope={scope} onClose={() => setCreate(null)} />
      <CatalogTypeSheet target={type} scope={scope} onClose={() => setType(null)} />
    </EditorContext.Provider>
  );
}
