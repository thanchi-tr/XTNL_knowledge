"use client";

/**
 * ShaderSlot (ui-motion.md §6.2): the only component that touches the shader
 * runtime. It renders
 *
 *   <div class="shd shd-{program}" aria-hidden="true" data-shd={program} data-shd-state="fallback">
 *     {fallback}   .shd-fb     the soft SVG layer (dawn / strands)
 *     {marks}      .shd-marks  horizon only: the measured SVG marks, always on top
 *   </div>
 *
 * The server and the first client render are identical (no canvas, state
 * "fallback"), so hydration always matches. After mount, a 'static' slot stops
 * there. Otherwise the pre-gate runs with what the page knows (motion level,
 * contrast, forced colours, data-fx="none", save-data, memory, the AMBIENT
 * route and budget, a stale or paused WAIT): only a slot that could loop waits
 * for a quiet page (after 'load', ≥ 50% in view, 400 ms with no scroll,
 * pointer or key event), then, in an idle slice, loads the runtime with
 * import() and attaches. Calm, still, high contrast, forced colours and
 * static never fetch it. The runtime appends the canvas (and removes it) and
 * sets data-live / data-shd-state; React never renders either.
 *
 * Unmount (and an Activity hide, which runs this effect's cleanup) detaches,
 * which releases the context at once.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { FX, FX_EVENT, type ShaderProgram, type SlotKind } from "@/lib/shader/params";
import { preGate, type SlotSpec } from "@/lib/shader/env";
import "./fx.css";

export type { ShaderProgram, SlotKind };

export interface ShaderSlotProps {
  program: ShaderProgram;
  /** Plain numbers from the params.ts mappers (the seed first). Serialisable. */
  params: number[];
  /** 'static' never loads the runtime. */
  kind: SlotKind;
  /** The soft SVG layer the canvas replaces while live (dawn / strands). */
  fallback: ReactNode;
  /** Horizon only: the measured SVG marks, always on top, never replaced. */
  marks?: ReactNode;
  className?: string;
  /** Horizon: there is a measured value (an unmeasured band never loops). */
  measured?: boolean;
  /** WAIT: the run went stale or timed out. */
  stale?: boolean;
  /** WAIT: the run's start (epoch ms), so a remount keeps its 90 s. */
  startedAt?: number;
}

interface RuntimeModule {
  attach(el: HTMLElement, spec: SlotSpec): { detach(): void };
}

let runtime: RuntimeModule | null = null;
let loading: Promise<RuntimeModule> | null = null;
const loadRuntime = () => (loading ??= import("@/lib/shader/runtime").then((m) => (runtime = m)));

const INPUTS = ["scroll", "wheel", "pointerdown", "pointermove", "keydown", "touchstart"];

/** Waits until this slot could loop, the page has loaded, the slot is ≥ 50% in view and the page has been quiet for 400 ms; then `go` in an idle slice. */
function whenQuiet(el: HTMLElement, spec: SlotSpec, go: () => void): () => void {
  let last = -1e9;
  let timer = 0;
  let seen = false;
  let off = false;
  const input = () => {
    last = performance.now();
  };
  const io = new IntersectionObserver(([e]) => {
    seen = !!e && e.intersectionRatio >= 0.5;
    check();
  }, { threshold: [0, 0.5] });
  function stop() {
    off = true;
    clearTimeout(timer);
    io.disconnect();
    for (const t of INPUTS) removeEventListener(t, input, true);
    removeEventListener("load", check);
    removeEventListener(FX_EVENT, check);
    document.removeEventListener("visibilitychange", check);
  }
  function check() {
    clearTimeout(timer);
    if (off || !seen || document.readyState !== "complete" || preGate(el, spec) !== "loop") return;
    const wait = FX.quiet - (performance.now() - last);
    if (wait > 0) {
      timer = window.setTimeout(check, wait + 1);
      return;
    }
    stop();
    if (typeof requestIdleCallback === "function") requestIdleCallback(go, { timeout: FX.idle });
    else window.setTimeout(go, 0);
  }
  for (const t of INPUTS) addEventListener(t, input, { capture: true, passive: true });
  addEventListener("load", check);
  addEventListener(FX_EVENT, check);
  document.addEventListener("visibilitychange", check);
  io.observe(el);
  return stop;
}

export function ShaderSlot({ program, params, kind, fallback, marks, className, measured = true, stale = false, startedAt }: ShaderSlotProps) {
  const own = useRef<HTMLDivElement>(null);
  const key = params.join(",");
  useEffect(() => {
    const el = own.current;
    if (!el || kind === "static" || typeof IntersectionObserver !== "function") return;
    const spec: SlotSpec = { program, kind, params: key.split(",").map(Number), measured, stale, startedAt };
    let dead = false;
    let att: { detach(): void } | null = null;
    const go = () => {
      loadRuntime().then(
        (m) => {
          if (!dead) att = m.attach(el, spec);
        },
        () => undefined
      );
    };
    // Once the runtime is here, its own conductor does the quiet start.
    const stop = runtime ? (go(), () => undefined) : whenQuiet(el, spec, go);
    return () => {
      dead = true;
      stop();
      att?.detach();
    };
  }, [program, kind, key, measured, stale, startedAt]);
  return (
    <div
      ref={own}
      className={cx("shd", `shd-${program}`, className)}
      aria-hidden="true"
      data-shd={program}
      data-shd-kind={kind}
      data-shd-state="fallback"
    >
      {fallback}
      {marks}
    </div>
  );
}
