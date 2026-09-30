"use client";

import { useEffect, useRef } from "react";

/**
 * Carries an idea captured in one line into the full form.
 *
 * AddIdeaForm owns its fields' state and takes no initial values, so this
 * fills them the way a person would: through each element's native value
 * setter plus an input event, which is what React listens to — the same
 * technique WordComplete uses to write a completion into a controlled
 * field. It runs once, after the form has hydrated, only into the default
 * Short fields (the first question and answer boxes inside the wrapper),
 * and never over anything already typed.
 */
export function DraftPrefill({ question, answer, targetId }: { question: string; answer: string; targetId: string }) {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const root = document.getElementById(targetId);
    if (!root) return;
    const fill = (el: HTMLTextAreaElement | HTMLInputElement | null, value: string) => {
      if (!el || !value || el.value) return;
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    fill(root.querySelector("textarea"), question);
    fill(root.querySelector<HTMLInputElement>('input[type="text"]'), answer);
  }, [question, answer, targetId]);

  return null;
}
