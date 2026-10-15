"use client";

import { useEffect } from "react";

/**
 * /today/habits#<templateId> (the drawer's "Track record ›"): scrolls to that habit's card, opens the Ended fold when
 * the card is in it, rings the card (data-target; :target never matches after a client-side navigation) and moves
 * focus to its name. Again on every hash change. Draws nothing.
 */
export function HabitHash() {
  useEffect(() => {
    const go = () => {
      let id = "";
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      const card = id ? document.getElementById(id) : null;
      if (!card || !card.classList.contains("hh-card")) return;
      const fold = card.closest("details");
      if (fold && !fold.open) fold.open = true;
      for (const el of document.querySelectorAll(".hh-card[data-target]")) el.removeAttribute("data-target");
      card.setAttribute("data-target", "");
      card.scrollIntoView({ block: "start" });
      card.querySelector<HTMLElement>(".hh-title")?.focus({ preventScroll: true });
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, []);
  return null;
}
