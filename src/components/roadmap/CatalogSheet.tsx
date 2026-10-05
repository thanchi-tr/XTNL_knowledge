"use client";

/**
 * Change a practice, step or checkpoint's type (lane R5; roadmap-rev4.md
 * F-R4-18, F-R4-21): the app's list for the slot and the Area (roadmap-catalog
 * catalogKindsFor: the track's types, exam-only types only with an exam, never
 * the code-placed exam day, never a type the constraints left out unless the
 * user allowed it), each with its code-written name and its first "How" line.
 * The pick is the user's (decision EDITED: "you chose this"); the label is
 * re-rendered by code from the type, so it follows a renamed Domain and its
 * "How" stays. A type that performs the aim itself (lastStageOnly) is offered
 * only on the plan's last milestone.
 */
import { Sheet } from "@/components/ui/Sheet";
import { ActionError } from "@/components/home/ActionError";
import { Icon } from "@/components/ui/Icon";
import { catalogEntryOf, catalogKindsFor, catalogTrackOf, type CatalogKey, type CatalogSlot } from "@/lib/roadmap-catalog";
import type { ItemEdit } from "@/lib/roadmap-types";
import { KIND_HOW, KIND_NAME } from "./roadmap-copy";
import { useRoadmapAction } from "./roadmap-runtime";
import type { ActTarget, ItemEditorScope } from "./ItemEditor";

/** The types the picker offers for a row (pure; roadmap-ui-check pins it): never EXAM_DAY, never an excluded or exam-only type out of place. */
export function catalogChoicesOf(
  slot: CatalogSlot,
  scope: Pick<ItemEditorScope, "areaFieldId" | "track" | "examLabel" | "excluded" | "allowed">,
  opts: { lastStage: boolean }
): CatalogKey[] {
  const allowed = new Set(scope.allowed ?? []);
  const excluded = (scope.excluded ?? []).filter((k) => !allowed.has(k));
  const keys = catalogKindsFor(slot, { track: catalogTrackOf({ fieldId: scope.areaFieldId, track: scope.track }), exam: Boolean(scope.examLabel), practicesAllowed: true, excluded });
  return keys.filter((k) => {
    const e = catalogEntryOf(k);
    return e != null && !e.codeOnly && (opts.lastStage || !e.lastStageOnly);
  });
}

export function CatalogTypeSheet({ target, scope, onClose }: { target: ActTarget | null; scope: ItemEditorScope; onClose: () => void }) {
  const { run, pending, error } = useRoadmapAction();
  const kind = target?.row.kind;
  const slot: CatalogSlot | null = kind === "PRACTICE" || kind === "STEP" || kind === "CHECKPOINT" ? kind : null;
  const lastStage = target ? target.milestone.ord >= scope.milestoneCount : false;
  const choices = slot ? catalogChoicesOf(slot, scope, { lastStage }) : [];
  const current = target?.row.catalogKey ?? null;
  const pick = (key: CatalogKey) => {
    if (!target) return;
    // ItemEdit.catalogKey (the contract §15.11): R4's editItemCore re-renders the label from the type.
    const edit: ItemEdit = { catalogKey: key };
    run((a) => a.editItem(target.row.id, edit), () => onClose());
  };
  return (
    <Sheet open={target != null && slot != null} onClose={onClose} title="Change the type" description="The app's list. The app writes the name; the choice is yours.">
      <div className="rm-pick-list">
        {choices.map((k) => (
          <button key={k} type="button" className="rm-pick" aria-pressed={k === current} disabled={pending} onClick={() => pick(k)}>
            <span className="rm-pick-t">
              <b>{KIND_NAME[k]}</b>
              <span className="t-meta">{KIND_HOW[k][0] ?? ""}</span>
            </span>
            {k === current && <Icon name="check" />}
          </button>
        ))}
      </div>
      {error && <ActionError>{error}</ActionError>}
    </Sheet>
  );
}
