"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

/**
 * How much of the layout viewport the on-screen keyboard covers.
 *
 * The keyboard resizes only the visual viewport on iOS and on current
 * Android Chrome, so a sheet at `bottom: 0` would sit underneath it. The
 * sheet is lifted by this much instead (--kb).
 */
export function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);
  return active ? inset : 0;
}

/** A media query's current answer (false on the server and before hydration). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (fn: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener("change", fn);
      return () => mq.removeEventListener("change", fn);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && !!window.matchMedia ? window.matchMedia(query).matches : false),
    () => false
  );
}

/** Within this of the bottom counts as at the bottom. */
const BOTTOM_SLACK_PX = 24;

/**
 * Keeps a scroll region at its bottom while its content grows, unless the
 * player scrolled up to read: the chips nearest the line stay in view as
 * the region above the input fills. Typing (a new `typed` value) pins it
 * to the bottom again, since the chips for the new words are what matter
 * then. A region that unmounts (the sheet closed) starts pinned next time.
 *
 * Returns the region's onScroll handler.
 */
export function useStickToBottom(ref: RefObject<HTMLElement | null>, deps: readonly unknown[], typed: unknown): () => void {
  const pinned = useRef(true);
  const lastTyped = useRef(typed);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      pinned.current = true;
      return;
    }
    if (lastTyped.current !== typed) {
      lastTyped.current = typed;
      pinned.current = true;
    }
    if (pinned.current) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, typed]);
  return useCallback(() => {
    const el = ref.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK_PX;
  }, [ref]);
}
