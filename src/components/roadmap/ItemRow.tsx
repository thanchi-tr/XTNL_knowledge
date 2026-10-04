"use client";

/**
 * One item (F9 "Each item"): the label line with its provenance chip, then
 * flag chips with their reasons, then the action line.
 *
 *   ≥ 380 px of main: every 40 px ChipButton ([Keep] [Edit] [Remove] [I checked this]).
 *   < 380 px: [Keep] (or [Edit] for a NUMBER item, [I checked this] for a Domain
 *   Gemini picked) plus a ⋯ overflow with the rest.
 *
 * A NUMBER item is shown as written with each unallowed number struck through
 * (<s>), never rewritten, and offers no Keep. The spans and the reasons are
 * the server's (ItemDraft.struck/reasons, MilestoneDraft.titleStruck/
 * titleReasons); only when a row arrives without them does the device re-run
 * R3's checkLabel (useDisplayLabel). DRAFT and KEPT_SUGGESTION rows always
 * carry their words (never colour alone). Without the user's Domains on the
 * page no row offers Map to….
 */
import { useMemo, type ReactNode } from "react";
import { ChipButton } from "@/components/ui/Chip";
import { StruckLabel } from "./StruckLabel";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { ActionError } from "@/components/home/ActionError";
import type { BlockingFlag, MilestoneDraft } from "@/lib/roadmap-types";
import { FlagChips, FlagReasons } from "./FlagChips";
import { ProvenanceChip } from "./ProvenanceChip";
import { useItemEditor, type ActTarget, type ItemEditorScope } from "./ItemEditor";
import { deviceLabelCheck, labelContextOf } from "./roadmap-labels";
import { ITEM_ACTION_WORD, canMapOf, displayLabelOf, itemActionsOf, itemClassOf, needsRecheckOf, rowDomId, titleItemOf, type EditorRow, type ItemAction } from "./roadmap-ui-model";

/** A row's struck spans and reasons: the server's, else the device's re-check (a fallback; the server decides the flags). */
export function useDisplayLabel(
  row: EditorRow,
  milestone: MilestoneDraft,
  scope: ItemEditorScope | null | undefined,
  method?: MilestoneDraft["items"][number]["method"]
): { struck: readonly [number, number][] | undefined; reasons: Partial<Record<BlockingFlag, string>> | undefined } {
  const recheck = useMemo(() => {
    if (!scope || !needsRecheckOf(row)) return null;
    return deviceLabelCheck(row.label, labelContextOf(scope, row.kind === "TITLE" ? "MILESTONE" : row.kind, milestone, method ?? null));
  }, [row, milestone, scope, method]);
  return displayLabelOf(row, recheck);
}

/** The label with its struck NUMBER spans (its own module, so the Aim card can use it without the editor). */
export { StruckLabel };

/** A milestone's title outside its editor row (a card's header, Now): as written, with its NUMBER spans struck. */
export function MilestoneTitleText({ milestone }: { milestone: MilestoneDraft }) {
  const editor = useItemEditor();
  const row = titleItemOf(milestone);
  const shown = useDisplayLabel(row, milestone, editor?.scope);
  return <StruckLabel label={row.label} struck={shown.struck} />;
}

export function ItemRow({
  target,
  stage,
  kindLabel,
  meta,
  why,
  chipsBefore,
  children,
  hideProvenance,
}: {
  target: ActTarget;
  stage: "draft" | "outline" | "active" | "start";
  /** The eyebrow: "Topic · Algorithmic Backtesting", "Domain · in your library". */
  kindLabel: string;
  /** The facts line under the label. */
  meta?: ReactNode;
  /** A fixed line ("Gemini picked this Domain — it sets what counts."). */
  why?: string | null;
  /** Chips before the provenance chip (a method chip, "Set the bar"). */
  chipsBefore?: ReactNode;
  /** Extra content under the label (a METHOD_HOW disclosure). */
  children?: ReactNode;
  hideProvenance?: boolean;
}) {
  const editor = useItemEditor();
  const { row, item, milestone } = target;
  const cls = itemClassOf(row);
  const actions = itemActionsOf(row, stage, { canMap: canMapOf(editor?.scope.library) });
  const removed = row.decision === "REMOVED";
  const error = editor?.errorFor(row.id) ?? null;
  const busy = editor?.busyFor(row.id) ?? false;
  const press = (a: ItemAction) => editor?.act(target, a);
  const reasonCtx = { constraints: editor?.scope.constraints ?? null, milestoneOrd: milestone.ord, milestoneCount: editor?.scope.milestoneCount };
  const shown = useDisplayLabel(row, milestone, editor?.scope, item?.method);

  if (stage === "outline") {
    return (
      <li className="rm-oi" id={rowDomId(row.id)}>
        <div className="rm-it-k">{kindLabel}</div>
        <p className="rm-it-l">
          <StruckLabel label={row.label} struck={shown.struck} />
        </p>
        <div className="rm-it-chips">
          {chipsBefore}
          <ProvenanceChip origin={row.origin} decision={row.decision} />
          <FlagChips flags={row.flags} notes={item?.notes} />
        </div>
        <FlagReasons flags={row.flags} ctx={reasonCtx} reasons={shown.reasons} />
      </li>
    );
  }

  return (
    <div
      id={rowDomId(row.id)}
      className={cx("rm-it", cls === "DRAFT" && "rm-it-draft", cls === "KEPT_SUGGESTION" && "rm-it-kept", removed && "rm-it-removed")}
      aria-busy={busy || undefined}
    >
      <div className="rm-it-k">{removed ? `${kindLabel} · removed` : kindLabel}</div>
      <p className="rm-it-l">
        <StruckLabel label={row.label} struck={shown.struck} />
      </p>
      {meta && <div className="rm-it-m">{meta}</div>}
      {children}
      {!removed && (
        <div className="rm-it-chips">
          {chipsBefore}
          {!hideProvenance && <ProvenanceChip origin={row.origin} decision={row.decision} />}
          <FlagChips flags={row.flags} notes={item?.notes} />
          {actions.wide.length === 0 && actions.narrow.more.length > 0 && (
            <ChipButton className="rm-ov" style={{ marginLeft: "auto" }} aria-label={`More: ${actions.narrow.more.map((a) => ITEM_ACTION_WORD[a]).join(", ")}`} onClick={() => editor?.more(target, actions.narrow.more)}>
              <Icon name="dot3" />
            </ChipButton>
          )}
        </div>
      )}
      {!removed && <FlagReasons flags={row.flags} ctx={reasonCtx} reasons={shown.reasons} />}
      {why && !removed && <p className="rm-it-why">{why}</p>}
      {actions.wide.length > 0 && (
        <>
          <div className="rm-acts rm-acts-w">
            {actions.wide.map((a) => (
              <ChipButton key={a} disabled={busy} onClick={() => press(a)}>
                {ITEM_ACTION_WORD[a]}
              </ChipButton>
            ))}
          </div>
          <div className="rm-acts rm-acts-n">
            {actions.narrow.shown.map((a) => (
              <ChipButton key={a} disabled={busy} onClick={() => press(a)}>
                {ITEM_ACTION_WORD[a]}
              </ChipButton>
            ))}
            {actions.narrow.more.length > 0 && (
              <ChipButton className="rm-ov" aria-label={`More: ${actions.narrow.more.map((a) => ITEM_ACTION_WORD[a]).join(", ")}`} onClick={() => editor?.more(target, actions.narrow.more)}>
                <Icon name="dot3" />
              </ChipButton>
            )}
          </div>
        </>
      )}
      {error && <ActionError>{error}</ActionError>}
    </div>
  );
}
