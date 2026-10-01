"use client";

import type { Ref } from "react";
import { CurrencyGlyph } from "@/components/ui/Icon";
import { addedRowCopy, visibleAdded, type AddedEntry } from "./capture-ui";

/**
 * 'Added here' (capture.md P1 burst capture): what this sheet saved in the
 * last ten minutes, newest first — title, where it went, the ≈ price — with
 * a quiet Edit and Undo on each row. Three rows show under 600 px and five
 * from 600; the rest wait behind '+N more'. An undone row reads 'Removed ·
 * <title>' for a few seconds, then goes. The list lives in memory for the
 * page's life (QuickCapture's addedReducer), so it is still here when the
 * sheet opens again; rows leave at ten minutes, when Edit and Undo would no
 * longer be honoured. While an edit of a row is on its way (capture-ui
 * replacingOf), its Edit and Undo are off and the row says why.
 */

interface Props {
  entries: AddedEntry[];
  wide: boolean;
  showAll: boolean;
  onShowAll: () => void;
  onEdit: (entry: AddedEntry) => void;
  onUndo: (entry: AddedEntry) => void;
  /** Template ids whose Undo is on its way to the server. */
  busy: ReadonlySet<string>;
  /** Template ids an edit is on its way to replace, with what the row says meanwhile ('Saving the edit…'). */
  locked: ReadonlyMap<string, string>;
  /** The list's own element, so 'Show' (from the dock) can bring it into view. */
  listRef?: Ref<HTMLElement>;
}

export function JustAdded({ entries, wide, showAll, onShowAll, onEdit, onUndo, busy, locked, listRef }: Props) {
  if (entries.length === 0) return null;
  const { shown, more } = visibleAdded(entries, wide, showAll);
  return (
    <section ref={listRef} className="capture-added" aria-labelledby="capture-added-h">
      <p className="t-eyebrow capture-added-h" id="capture-added-h">
        Added here
      </p>
      <ul className="capture-added-list" id="capture-added-list">
        {shown.map((e) => {
          if (e.removedAt !== undefined) {
            return (
              <li key={e.key} className="capture-added-row" data-removed="1">
                <span className="capture-added-main">
                  <span className="capture-added-meta">
                    Removed · <span className="capture-added-gone">{e.item.title}</span>
                  </span>
                </span>
              </li>
            );
          }
          const row = addedRowCopy(e.item);
          const lock = locked.get(e.item.id) ?? null;
          const pending = busy.has(e.item.id) || lock !== null;
          return (
            <li key={e.key} className="capture-added-row" data-locked={lock ? "1" : undefined}>
              <span className="capture-added-main">
                <span className="capture-added-title">{row.title}</span>
                {lock ? (
                  // The visible reason Edit and Undo are off: an edit of this line has not landed yet.
                  <span className="capture-added-meta">{lock}</span>
                ) : (
                  <span className="capture-added-meta">
                    {row.where}
                    {row.figure && (
                      <>
                        {" · "}
                        <span className="cur">
                          <CurrencyGlyph kind="xp" />
                          <span className="num">{row.figure}</span>
                        </span>
                      </>
                    )}
                  </span>
                )}
              </span>
              <span className="capture-added-acts">
                <button type="button" className="btn btn-quiet capture-row-btn" onClick={() => onEdit(e)} disabled={pending} aria-label={`Edit ${row.title}`}>
                  Edit
                </button>
                <button type="button" className="btn btn-quiet capture-row-btn" onClick={() => onUndo(e)} disabled={pending} aria-label={`Undo ${row.title}`}>
                  Undo
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {more > 0 && (
        <button type="button" className="btn btn-quiet capture-row-btn capture-added-more" aria-expanded="false" aria-controls="capture-added-list" onClick={onShowAll}>
          +{more} more
        </button>
      )}
    </section>
  );
}
