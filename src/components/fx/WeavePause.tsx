"use client";

/**
 * <WeavePause/> (ui-motion.md §6.2, WCAG 2.2.2): the WAIT loop's on-page pause.
 * A 40 px GlyphButton ([m.pause]) in the waiting card's heading row (never on
 * the band), aria-label "Pause animation" (pass SHORT_PAUSE_LABEL), aria-pressed.
 * Pressing it sets `data-paused` on its `[data-wait]` card, which stops the CSS
 * breathe and the weave shader at once, and `xtnl:fx:wait-paused` in
 * sessionStorage, so every draft card stays paused for the session; pressing
 * again resumes (within the run's 90 s, while it is not stale).
 *
 * The pressed state is the session flag (an external store): the server and the
 * hydrating render read it as not paused, then the client's value takes over.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { GlyphButton } from "@/components/glyph/Glyph";
import { cx } from "@/components/ui/cx";
import { sessionGet, sessionSet } from "@/lib/shader/env";
import { FX_EVENT, WAIT_PAUSED_KEY } from "@/lib/shader/params";

const subscribe = (cb: () => void) => {
  addEventListener(FX_EVENT, cb);
  return () => removeEventListener(FX_EVENT, cb);
};
/** The flag for this page when sessionStorage is unavailable (private modes): the pause still works. */
let mem = false;
const pausedNow = () => {
  const v = sessionGet(WAIT_PAUSED_KEY);
  return v === null ? mem : v === "1";
};

export function WeavePause({ label = "Pause animation", className }: { label?: string; className?: string }) {
  const btn = useRef<HTMLButtonElement>(null);
  const paused = useSyncExternalStore(subscribe, pausedNow, () => false);
  // Keep the card's data-paused in step with the session (the CSS breathe reads it).
  useEffect(() => {
    btn.current?.closest("[data-wait]")?.toggleAttribute("data-paused", paused);
  }, [paused]);
  const toggle = () => {
    const on = !paused;
    btn.current?.closest("[data-wait]")?.toggleAttribute("data-paused", on);
    mem = on;
    sessionSet(WAIT_PAUSED_KEY, on ? "1" : "0");
    // The runtime (when loaded) and ShaderSlot's pre-gate re-gate on this event; so does this button.
    dispatchEvent(new Event(FX_EVENT));
  };
  return <GlyphButton ref={btn} glyph="m.pause" label={label} pressed={paused} size={40} className={cx("shd-pause", className)} onClick={toggle} />;
}
