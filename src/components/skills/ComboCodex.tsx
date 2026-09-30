"use client";

import { SET_SHAPES } from "@/lib/loadout-sets";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";

/**
 * The reference for everything this browser has ever discovered. It has a
 * real button now (You › Loadout, "Combo codex"); the loadout bar's
 * triple-click on its label still opens it in the art previews.
 *
 * Undiscovered shapes are never named or described here, only counted. The
 * whole point of a shape revealing itself on first assembly rather than a
 * wiki page explaining the 32 shapes up front is that a player finds these
 * by trying combinations: listing "??? — merge 6 emblems of X kind" would
 * hand back exactly the answer that design is trying to withhold.
 *
 * Discoveries are kept per browser (combo-discovery.ts) until the server
 * persists them.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  seenIds: Set<string>;
  activeIds: Set<string>;
}

export function CodexSheet({ open, onClose, seenIds, activeIds }: Props) {
  const discovered = SET_SHAPES.filter((s) => seenIds.has(s.id)).sort((a, b) => {
    const activeDiff = Number(activeIds.has(b.id)) - Number(activeIds.has(a.id));
    return activeDiff !== 0 ? activeDiff : a.weight - b.weight;
  });
  const unknown = SET_SHAPES.length - discovered.length;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Combo codex"
      description={`${discovered.length} of ${SET_SHAPES.length} combinations discovered${unknown > 0 ? ` · ${unknown} still unknown` : ""}`}
    >
      {discovered.length === 0 ? (
        <p className="t-meta">
          Nothing discovered yet. Equip emblems and see what happens: the shapes reveal themselves the moment you assemble
          one, not before.
        </p>
      ) : (
        <ul className="fx-list" style={{ margin: "0 -14px" }}>
          {discovered.map((shape) => (
            <li key={shape.id}>
              <span className="grow">
                <b>{shape.name}</b>
                <span className="t-meta" style={{ display: "block" }}>
                  {shape.blurb}
                </span>
                <span className="t-body" style={{ display: "block", marginTop: 6 }}>
                  {shape.grant.effectText}
                </span>
                <span className="t-meta" style={{ display: "block", marginTop: 2 }}>
                  {shape.grant.tip}
                </span>
              </span>
              {activeIds.has(shape.id) && (
                <Chip tone="kept" icon="check">
                  Active
                </Chip>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

/** The loadout bar's name for the same sheet (art previews). */
export const ComboCodex = CodexSheet;
