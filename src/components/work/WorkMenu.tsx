"use client";

/**
 * A small menu under its button (the work header's New menu, a row's Snooze): role="menu" with one menuitem per
 * choice, each a 44 px target. The button says it has a popup and whether it is open; opening moves focus to the
 * first item, the arrows (and Home / End) move through them, Enter or Space picks, Escape (the app's one Escape stack,
 * capture/layers.ts) and Tab close it and focus returns to the button. A tap outside closes it. It opens below its
 * button, aligned to the button's end so it never runs off a 344 px screen.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { pushEscapeLayer } from "@/components/capture/layers";
import { cx } from "@/components/ui/cx";

export interface WorkMenuItem {
  id: string;
  label: ReactNode;
  /** The item's accessible name when its label is not plain text. */
  name?: string;
  hint?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}

export function WorkMenu({
  label,
  button,
  buttonClass,
  items,
  align = "end",
  disabled,
}: {
  /** The button's accessible name ("New", "Snooze: Call Jane"). */
  label: string;
  /** What the button shows. */
  button: ReactNode;
  buttonClass?: string;
  items: readonly WorkMenuItem[];
  align?: "start" | "end";
  disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const pop = pushEscapeLayer(() => close(true));
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && e.target instanceof Node && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    const raf = window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus());
    return () => {
      pop();
      document.removeEventListener("pointerdown", onDown);
      window.cancelAnimationFrame(raf);
    };
  }, [open]);

  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const all = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    const at = all.indexOf(document.activeElement as HTMLElement);
    let next: HTMLElement | undefined;
    if (e.key === "ArrowDown") next = all[(at + 1) % all.length];
    else if (e.key === "ArrowUp") next = all[(at - 1 + all.length) % all.length];
    else if (e.key === "Home") next = all[0];
    else if (e.key === "End") next = all[all.length - 1];
    else if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }

  return (
    <div className="wk-menu" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={buttonClass}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {button}
      </button>
      {open && (
        <div ref={menuRef} id={`${id}-menu`} className={cx("wk-menu-list", align === "start" && "start")} role="menu" aria-label={label} onKeyDown={onKey}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="wk-menu-item"
              disabled={item.disabled}
              aria-label={item.name}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
            >
              {item.icon}
              <span className="wk-menu-l">{item.label}</span>
              {item.hint && <span className="wk-menu-h">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
