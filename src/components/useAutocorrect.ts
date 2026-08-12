"use client";

import { useCallback, useRef, useState } from "react";
import { autocorrectAtCaret, isBoundaryKey, type Correction } from "@/lib/autocorrect";

/**
 * Wires `autocorrect.ts` to a text field.
 *
 * Corrections fire on the keystroke that *ends* a word, applied through the
 * element's own value so the browser keeps them in its undo stack —
 * Ctrl+Z reverts a correction exactly like any other edit, which is what
 * stops the feature feeling like something being done to you.
 *
 * The last correction is reported back so the form can say what changed.
 * Silent rewriting is the failure mode that makes autocorrect infuriating:
 * you notice the wrong word three sentences later with no idea where it
 * came from.
 */
export interface AutocorrectHandlers {
  onKeyUp: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  /** Most recent corrections, newest first. Capped for display. */
  recent: Correction[];
  clearRecent: () => void;
}

const MAX_RECENT = 3;

export function useAutocorrect(
  onChange: (next: string) => void,
  enabled = true
): AutocorrectHandlers {
  const [recent, setRecent] = useState<Correction[]>([]);
  // Undo (Ctrl+Z) restores the pre-correction text and would otherwise be
  // immediately "corrected" again by the next boundary key.
  const suppressed = useRef(false);

  const onKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!enabled) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        suppressed.current = true;
        return;
      }
      if (!isBoundaryKey(e.key)) return;
      if (suppressed.current) {
        suppressed.current = false;
        return;
      }

      const el = e.currentTarget;
      const caret = el.selectionStart ?? el.value.length;
      const result = autocorrectAtCaret(el.value, caret);
      if (result.text === el.value) return;

      el.value = result.text;
      el.setSelectionRange(result.caret, result.caret);
      onChange(result.text);

      if (result.corrections.length > 0) {
        setRecent((prev) => [...result.corrections, ...prev].slice(0, MAX_RECENT));
      }
    },
    [onChange, enabled]
  );

  const clearRecent = useCallback(() => setRecent([]), []);

  return { onKeyUp, recent, clearRecent };
}
