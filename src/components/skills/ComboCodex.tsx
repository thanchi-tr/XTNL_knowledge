"use client";

import { SET_SHAPES } from "@/lib/loadout-sets";

/**
 * The reference for everything this browser has ever discovered — reopened
 * by triple-clicking the footer's "Loadout" label, since a one-time popup is
 * easy to dismiss and then forget the specifics of.
 *
 * Undiscovered shapes are never named or described here, only counted. The
 * whole point of `ComboPopup` firing on first assembly rather than a wiki
 * page explaining the 32 shapes up front is that a player finds these by
 * trying combinations — listing "??? — merge 6 emblems of X kind" would hand
 * back exactly the answer that design is trying to withhold.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  seenIds: Set<string>;
  activeIds: Set<string>;
}

export function ComboCodex({ open, onClose, seenIds, activeIds }: Props) {
  if (!open) return null;

  const discovered = SET_SHAPES.filter((s) => seenIds.has(s.id)).sort((a, b) => {
    const activeDiff = Number(activeIds.has(b.id)) - Number(activeIds.has(a.id));
    return activeDiff !== 0 ? activeDiff : a.weight - b.weight;
  });
  const undiscoveredCount = SET_SHAPES.length - discovered.length;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(2,5,8,.78)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="combo-codex-title"
    >
      <div
        className="card w-[min(94vw,640px)] p-4 boss-rise"
        style={{ maxHeight: "82vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-baseline justify-between">
          <h2 id="combo-codex-title" className="panel-title">
            Combo codex
          </h2>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="panel-sub">
          {discovered.length} of {SET_SHAPES.length} combinations discovered
          {undiscoveredCount > 0 ? ` · ${undiscoveredCount} still unknown` : ""}
        </p>

        <div className="mt-3 space-y-2 overflow-y-auto" style={{ minHeight: 0 }}>
          {discovered.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.6 }}>
              Nothing discovered yet. Equip emblems into the footer and see what happens — the shapes reveal
              themselves the moment you assemble one, not before.
            </p>
          ) : (
            discovered.map((shape) => {
              const active = activeIds.has(shape.id);
              return (
                <div
                  key={shape.id}
                  className="p-3"
                  style={{
                    borderRadius: 10,
                    background: active ? "rgba(0,204,122,.08)" : "var(--sub)",
                    border: `1px solid ${active ? "rgba(0,204,122,.35)" : "var(--line)"}`,
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span style={{ fontSize: 13, fontWeight: 700, color: active ? "var(--green)" : "var(--ink-0)" }}>
                      {shape.name}
                    </span>
                    {active && (
                      <span className="mono" style={{ fontSize: 9.5, color: "var(--green)" }}>
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{shape.blurb}</p>
                  <p style={{ fontSize: 12, color: "var(--ink-1)", marginTop: 6, fontWeight: 500 }}>
                    {shape.grant.effectText}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3, lineHeight: 1.5 }}>{shape.grant.tip}</p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
