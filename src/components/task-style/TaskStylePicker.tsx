"use client";

/**
 * The task drawer's icon and colour: two small buttons, [icon ▾] and [colour ▾], each opening its own small pop-up
 * that scrolls (a grid of TASK_ICONS, or of TASK_COLORS swatches, each named for screen readers and on hover). A tap
 * saves through setTaskStyle and closes the pop-up; Escape or a tap outside closes it; [Default] clears both. The board
 * re-renders with the style on the row. The pop-up is rendered on the body (a portal, fixed under its button, or above
 * it when the screen has no room below), so a lane's overflow never clips it; it follows the button on scroll.
 */
import { useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { TASK_COLORS, TASK_COLOR_NAMES, TASK_ICON_NAMES, shownStyleOf, type TaskColor, type TaskIcon as IconName, type TaskStyle } from "@/lib/task-style";
import { setTaskStyle } from "@/app/actions/task-style";
import { TaskIcon } from "./TaskIcon";

type Saver = (templateId: string, style: { icon: string | null; color: string | null }) => Promise<{ ok: true; value: TaskStyle } | { ok: false; error: string }>;
type Pop = "icon" | "color" | null;

/** "shopping-cart" → "shopping cart". */
const nameOf = (s: string) => s.replace(/-/g, " ");

export function TaskStylePicker({ templateId, style, save = setTaskStyle, open: openAtMount = null }: { templateId: string; style?: TaskStyle | null; save?: Saver; /** Fixtures: a pop-up open at mount. */ open?: Pop }) {
  const [shown, setShown] = useState<TaskStyle>({ icon: style?.icon ?? null, color: style?.color ?? null });
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Pop>(openAtMount);
  const [pending, start] = useTransition();
  const root = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const look = shownStyleOf(shown);

  // Escape or a press outside closes the pop-up (focus goes back to its button).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (root.current?.contains(t) || pop.current?.contains(t)) return;
      setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(null);
      root.current?.querySelector<HTMLButtonElement>(`[data-pop="${open}"]`)?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const apply = (next: TaskStyle) => {
    const before = shown;
    setShown(next);
    setError(null);
    setOpen(null);
    start(async () => {
      const res = await save(templateId, next);
      if (!res.ok) {
        setShown(before);
        setError(res.error);
      }
    });
  };

  return (
    <div className="tsk-pick" ref={root} aria-busy={pending}>
      <div className="tsk-pick-bar">
        <button type="button" className="tsk-trig" data-pop="icon" aria-haspopup="dialog" aria-expanded={open === "icon"} onClick={() => setOpen((o) => (o === "icon" ? null : "icon"))}>
          <TaskIcon style={shown} size={18} />
          <span>Icon</span>
          <span className="tsk-caret" aria-hidden="true" />
        </button>
        <button type="button" className="tsk-trig" data-pop="color" aria-haspopup="dialog" aria-expanded={open === "color"} onClick={() => setOpen((o) => (o === "color" ? null : "color"))}>
          <span className="tsk-dot" aria-hidden="true" style={{ ["--tsk-sw" as string]: look.hex }} />
          <span>Colour</span>
          <span className="tsk-caret" aria-hidden="true" />
        </button>
        {(shown.icon || shown.color) && (
          <button type="button" className="today-pill tsk-reset" onClick={() => apply({ icon: null, color: null })}>
            Default
          </button>
        )}
      </div>

      {open === "icon" && (
        <Popup anchor={root} refEl={pop} label="Choose an icon">
          <div className="tsk-pop-grid" role="radiogroup" aria-label="Icon">
            {TASK_ICON_NAMES.map((name: IconName) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={shown.icon === name}
                className="tsk-opt"
                title={nameOf(name)}
                aria-label={`Icon: ${nameOf(name)}`}
                onClick={() => apply({ ...shown, icon: name })}
              >
                <TaskIcon style={{ icon: name, color: shown.color }} size={18} />
              </button>
            ))}
          </div>
        </Popup>
      )}
      {open === "color" && (
        <Popup anchor={root} refEl={pop} label="Choose a colour">
          <div className="tsk-pop-grid" role="radiogroup" aria-label="Colour">
            {TASK_COLOR_NAMES.map((name: TaskColor) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={shown.color === name}
                className="tsk-opt tsk-sw"
                title={name}
                aria-label={`Colour: ${name}`}
                style={{ ["--tsk-sw" as string]: TASK_COLORS[name] }}
                onClick={() => apply({ ...shown, color: name })}
              >
                <span aria-hidden="true" />
              </button>
            ))}
          </div>
        </Popup>
      )}
      {error && (
        <p className="t-meta tsk-err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const POP_W = 288;
const POP_H = 220;

/** The pop-up on the body, fixed under the picker's buttons (above them when the screen has no room below). */
function Popup({ anchor, refEl, label, children }: { anchor: RefObject<HTMLDivElement | null>; refEl: RefObject<HTMLDivElement | null>; label: string; children: ReactNode }) {
  const [at, setAt] = useState<{ left: number; top: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const bar = anchor.current?.querySelector(".tsk-pick-bar")?.getBoundingClientRect();
      if (!bar) return;
      const width = Math.min(POP_W, window.innerWidth - 16);
      const left = Math.max(8, Math.min(bar.left, window.innerWidth - width - 8));
      // The phone's tab bar covers the bottom of the screen: the room below ends where it starts.
      const tabbar = document.querySelector<HTMLElement>("nav.tabbar")?.getBoundingClientRect();
      const floor = (tabbar && tabbar.height > 0 && tabbar.top < window.innerHeight ? tabbar.top : window.innerHeight) - 8;
      const below = bar.bottom + 6;
      const top = below + POP_H > floor && bar.top - 6 - POP_H > 8 ? bar.top - 6 - POP_H : below;
      setAt({ left, top, width });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor]);
  // Opening moves focus into the pop-up, onto the chosen option (or the first); Escape brings it back to the button.
  useEffect(() => {
    if (!at) return;
    const el = refEl.current;
    (el?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? el?.querySelector<HTMLButtonElement>("button"))?.focus({ preventScroll: true });
  }, [at !== null, refEl]); // eslint-disable-line react-hooks/exhaustive-deps
  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={refEl} className="tsk-pop" role="dialog" aria-label={label} style={at ? { left: at.left, top: at.top, width: at.width } : { visibility: "hidden" }}>
      {children}
    </div>,
    document.body
  );
}
