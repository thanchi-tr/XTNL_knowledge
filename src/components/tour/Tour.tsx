"use client";

/**
 * The guided tour: seven short steps over the real app, re-openable any time.
 *
 *   <Tour/>   mounted once by the root layout, after <QuickCapture/> (outside
 *             <main>: its fixed layers must not sit under the @container).
 *
 * Starts by itself once per device: on /today, after hydration and a short
 * settle (SETTLE_MS), when TOUR_SEEN_KEY is unset, no dialog is open, the
 * browser is not automated and ?notour is absent (shouldAutoStart). While a
 * dialog is open it waits and tries again a few times. TOUR_START_EVENT
 * (startTour(): Settings' "Replay the tour", the '?' sheet) starts it on the
 * page the person is on, with no navigation: the capture button and the
 * section links are in the shell on every page, so those steps spotlight
 * them anywhere; a page-specific target (Today's lanes, the You hero) is used
 * where it exists, and a step whose target is absent centres its card.
 * TOUR_SEEN_KEY is set the moment the first run opens (a reload or a killed
 * app mid-tour does not bring it back), and again on finishing or skipping.
 * The query is read once, as the page view arrives: a visit that came with
 * ?capture= or ?notour never starts it, even after the capture sheet strips
 * its parameter and closes.
 *
 * A veil takes every click; the spotlight is a box-shadow cutout (aria-hidden).
 * The card is role=dialog aria-modal, takes focus, traps Tab, and answers
 * Esc (skip, through the app's one Escape stack), Left and Right (step) and
 * no other key: nothing it receives reaches the page's own shortcuts. Each
 * step change is announced in a polite live region inside the card. The
 * card's fade goes through the motion gateway (play: transform and opacity;
 * Calm drops the movement, Still shows the resting state), and the target
 * scrolls into view instantly unless motion is Full and not reduced.
 */
import "./tour.css";
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { pushEscapeLayer, trapTab } from "@/components/capture/layers";
import { SHELL_CAPTURE_EVENT } from "@/components/shell/capture-bridge";
import { DUR, motionLevel, play } from "@/lib/motion";
import { TOUR_START_EVENT } from "@/lib/tour-contract";
import { cardMaxHeight, cardWidth, placeCard, type Box } from "./tour-position";
import {
  RETRY_MAX,
  RETRY_MS,
  SETTLE_MS,
  TOUR_OFF_SESSION_KEY,
  copyText,
  hasNoTour,
  readSeen,
  shouldAutoStart,
  tourSteps,
  writeSeen,
  type Seg,
} from "./tour-steps";

/** Anything modal on screen: a kit Sheet, the capture sheet, a native dialog, the Ascension curtain. */
export const DIALOG_OPEN_SELECTOR = '[aria-modal="true"], [data-capture-sheet], dialog[open], .curtain';

function store(kind: "localStorage" | "sessionStorage"): Storage | null {
  try {
    return window[kind];
  } catch {
    return null;
  }
}

function automated(): boolean {
  try {
    return navigator.webdriver === true || /HeadlessChrome/.test(navigator.userAgent);
  } catch {
    return false;
  }
}

function prefersReduced(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function keyboardDevice(): boolean {
  try {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  } catch {
    return true;
  }
}

/** The first selector's first element that is actually rendered (two of the three chromes are display:none). */
function visibleTarget(selectors: readonly string[]): HTMLElement | null {
  for (const sel of selectors) {
    let list: HTMLElement[];
    try {
      list = Array.from(document.querySelectorAll<HTMLElement>(sel));
    } catch {
      continue;
    }
    for (const el of list) {
      if (el.closest(".tour-root")) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
    }
  }
  return null;
}

/** The visual viewport (pinch zoom, the phone keyboard), in layout-viewport coordinates. */
function viewport(): Box {
  const vv = window.visualViewport;
  if (vv) return { left: vv.offsetLeft, top: vv.offsetTop, width: vv.width, height: vv.height };
  return { left: 0, top: 0, width: document.documentElement.clientWidth || window.innerWidth, height: window.innerHeight };
}

/** Scrolls the page so the target clears the sticky top bar and the tab bar: centred when it fits, its top first when it is tall. */
function bringIntoView(el: HTMLElement, behavior: ScrollBehavior): void {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const bar = (sel: string) => {
    const b = document.querySelector(sel)?.getBoundingClientRect();
    return b && b.height > 0 ? b : null;
  };
  const top = (bar(".topbar")?.bottom ?? 0) + 8;
  const tab = bar(".tabbar");
  const bottom = (tab && tab.top < vh ? tab.top : vh) - 8;
  if (r.top >= top && r.bottom <= bottom) return;
  // A target inside a bar (fixed or sticky) is always on screen: nothing to scroll.
  if (el.closest(".topbar, .tabbar, .rail, .sidebar")) return;
  const room = Math.max(0, bottom - top);
  const delta = r.height > room / 2 ? r.top - top : r.top + r.height / 2 - (top + room / 2);
  window.scrollBy({ top: delta, behavior });
}

function Body({ body }: { body: readonly Seg[] }) {
  return (
    <>
      {body.map((s, i) =>
        typeof s === "string" ? (
          <Fragment key={i}>{s}</Fragment>
        ) : (
          <Fragment key={i}>
            {s.keys.map((k, j) => (
              <Fragment key={j}>
                {j > 0 && s.sep}
                <kbd className="tour-key">{k}</kbd>
              </Fragment>
            ))}
          </Fragment>
        )
      )}
    </>
  );
}

export function Tour() {
  const pathname = usePathname();
  const [run, setRun] = useState<{ index: number; keyboard: boolean } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const spotRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);
  const openRef = useRef(false);
  const uid = useId();
  const titleId = `${uid}-tour-title`;
  const bodyId = `${uid}-tour-body`;

  const keyboard = run?.keyboard ?? true;
  const steps = useMemo(() => tourSteps({ keyboard }), [keyboard]);
  const index = run ? Math.min(run.index, steps.length - 1) : 0;
  const step = run ? steps[index] : null;
  const last = index === steps.length - 1;
  const open = run != null;

  const start = useCallback(() => {
    if (!openRef.current) openerRef.current = document.activeElement;
    setAnnouncement("");
    setRun({ index: 0, keyboard: keyboardDevice() });
  }, []);

  const finish = useCallback(() => {
    writeSeen(store("localStorage"));
    setRun(null);
    const opener = openerRef.current;
    openerRef.current = null;
    window.setTimeout(() => {
      if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
      else document.getElementById("main")?.focus({ preventScroll: true });
    }, 0);
  }, []);
  const finishRef = useRef(finish);

  useEffect(() => {
    openRef.current = open;
    finishRef.current = finish;
  }, [open, finish]);

  const go = (delta: number) => {
    if (!run) return;
    const i = index + delta;
    if (i < 0 || i >= steps.length) return;
    setRun({ ...run, index: i });
    const s = steps[i];
    setAnnouncement(`Step ${i + 1} of ${steps.length}: ${s.title}. ${copyText(s.body)}`);
  };

  // TOUR_START_EVENT: start (or restart) on the current page.
  useEffect(() => {
    window.addEventListener(TOUR_START_EVENT, start);
    return () => window.removeEventListener(TOUR_START_EVENT, start);
  }, [start]);

  // First run: once per device, on /today, after hydration and a settle.
  useEffect(() => {
    const session = store("sessionStorage");
    // The query as this page view arrived: QuickCapture strips ?capture= a
    // tick later, and every attempt must still see it.
    const initialSearch = window.location.search;
    if (hasNoTour(initialSearch)) {
      try {
        session?.setItem(TOUR_OFF_SESSION_KEY, "1");
      } catch {
        // The query itself still guards this page view.
      }
    }
    let tries = 0;
    let timer = 0;
    const attempt = () => {
      if (openRef.current) return;
      let optedOut = false;
      try {
        optedOut = session?.getItem(TOUR_OFF_SESSION_KEY) === "1";
      } catch {
        optedOut = false;
      }
      const input = {
        seen: readSeen(store("localStorage")),
        pathname: window.location.pathname,
        search: initialSearch,
        dialogOpen: document.querySelector(DIALOG_OPEN_SELECTOR) != null,
        automated: automated(),
        optedOut,
      };
      if (shouldAutoStart(input)) {
        // Shown is seen: an interrupted first run never comes back.
        writeSeen(store("localStorage"));
        start();
      } else if (input.dialogOpen && shouldAutoStart({ ...input, dialogOpen: false }) && tries++ < RETRY_MAX) timer = window.setTimeout(attempt, RETRY_MS);
    };
    timer = window.setTimeout(attempt, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [pathname, start]);

  // While open: Esc skips (the shared stack), the capture sheet opening ends
  // the tour, and focus never leaves the card.
  useEffect(() => {
    if (!open) return;
    const pop = pushEscapeLayer(() => finishRef.current());
    const onCapture = () => finishRef.current();
    const onFocusIn = (e: FocusEvent) => {
      const card = cardRef.current;
      if (card && e.target instanceof Node && !card.contains(e.target)) card.focus({ preventScroll: true });
    };
    window.addEventListener(SHELL_CAPTURE_EVENT, onCapture);
    document.addEventListener("focusin", onFocusIn);
    // A sheet still handing focus back as the tour opens: take it back.
    const settle = window.setTimeout(() => {
      const card = cardRef.current;
      if (card && !card.contains(document.activeElement)) card.focus({ preventScroll: true });
    }, 0);
    return () => {
      window.clearTimeout(settle);
      pop();
      window.removeEventListener(SHELL_CAPTURE_EVENT, onCapture);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  // Each step: find its target, bring it into view, place the card and the
  // spotlight, and keep them placed through resize, scroll and the visual
  // viewport. A layout effect, so the card is never painted unplaced.
  useLayoutEffect(() => {
    if (!step) return;
    const root = rootRef.current;
    const card = cardRef.current;
    const spot = spotRef.current;
    if (!root || !card || !spot) return;
    if (!card.contains(document.activeElement)) card.focus({ preventScroll: true });

    const target = visibleTarget(step.targets);
    if (target) bringIntoView(target, motionLevel() === "full" && !prefersReduced() ? "smooth" : "instant");

    let raf = 0;
    const layout = () => {
      raf = 0;
      const vp = viewport();
      card.style.width = `${cardWidth(vp)}px`;
      card.style.setProperty("--tour-max-h", `${cardMaxHeight(vp)}px`);
      const size = { width: card.offsetWidth, height: card.offsetHeight };
      const tr = target && target.isConnected ? target.getBoundingClientRect() : null;
      const box = tr && tr.width > 0 && tr.height > 0 ? { left: tr.left, top: tr.top, width: tr.width, height: tr.height } : null;
      const p = placeCard(box, size, vp);
      card.style.left = `${p.left}px`;
      card.style.top = `${p.top}px`;
      root.dataset.spot = p.spot ? p.side : "none";
      if (p.spot) {
        spot.style.left = `${Math.round(p.spot.left)}px`;
        spot.style.top = `${Math.round(p.spot.top)}px`;
        spot.style.width = `${Math.round(p.spot.width)}px`;
        spot.style.height = `${Math.round(p.spot.height)}px`;
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(layout);
    };
    layout();
    void play(card, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: DUR.quick });

    const vv = window.visualViewport;
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    ro?.observe(card);
    if (target) ro?.observe(target);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      ro?.disconnect();
    };
  }, [step, pathname]);

  // The spotlight fades in once, when the tour opens.
  useEffect(() => {
    if (open) void play(spotRef.current, [{ opacity: 0 }, { opacity: 1 }], { duration: DUR.base });
  }, [open]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") {
      trapTab(e, cardRef.current);
      return;
    }
    // Esc goes to the app's one Escape stack (window), which skips the tour.
    if (e.key === "Escape") return;
    // Nothing else reaches the page's shortcuts while the tour is up.
    e.stopPropagation();
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    }
  };

  if (!step || typeof document === "undefined") return null;

  return createPortal(
    <div className="tour-root" ref={rootRef} data-spot="none">
      <div
        className="tour-veil"
        aria-hidden="true"
        onMouseDown={(e) => {
          e.preventDefault();
          cardRef.current?.focus({ preventScroll: true });
        }}
      />
      <div className="tour-spot" ref={spotRef} aria-hidden="true" />
      <div
        ref={cardRef}
        className="tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <p className="tour-count">
          {index + 1} of {steps.length}
        </p>
        <h2 className="tour-title" id={titleId}>
          {step.title}
        </h2>
        <p className="tour-body" id={bodyId}>
          <Body body={step.body} />
        </p>
        <div className="tour-actions">
          {!last && (
            <Button variant="quiet" onClick={finish}>
              Skip
            </Button>
          )}
          <span className="tour-fill" aria-hidden="true" />
          {index > 0 && (
            <Button variant="secondary" onClick={() => go(-1)}>
              Back
            </Button>
          )}
          <Button variant="primary" className="tour-next" onClick={last ? finish : () => go(1)}>
            {last ? "Done" : "Next"}
          </Button>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      </div>
    </div>,
    document.body
  );
}
