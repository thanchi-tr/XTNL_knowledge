/**
 * Escape and Tab for the app's stacked layers: the capture sheet, the
 * inbox sheet and a row's receipt.
 *
 * Each layer used to add its own document Escape listener, so one Escape
 * pressed in the capture sheet also closed the receipt and the inbox under
 * it. Now each open layer pushes itself onto one stack, and one listener
 * closes only the top-most. A key another handler already claimed
 * (defaultPrevented — an input cancelling its own edit, say) is left alone.
 *
 * The rules are pure (`createLayerStack`, `wrapFocus`) so the check script
 * can run them without a DOM; `pushEscapeLayer` binds the one stack the app
 * uses to the window. The window, not the document: its listeners run after
 * every document listener, so a popup that handles its own Escape and
 * claims it (the nav's More list, with focus inside it) is left to close
 * alone, and this stack only acts on a key nobody else took.
 */

export interface EscapeKeyLike {
  key: string;
  defaultPrevented: boolean;
  isComposing?: boolean;
  preventDefault: () => void;
}

export interface LayerStack {
  /** Adds a layer on top. Returns its removal. */
  push: (close: () => void) => () => void;
  /** Closes the top-most layer for an unclaimed Escape. True when it did. */
  handle: (e: EscapeKeyLike) => boolean;
  size: () => number;
}

export function createLayerStack(): LayerStack {
  const stack: { id: number; close: () => void }[] = [];
  let seq = 0;
  return {
    push(close) {
      const id = ++seq;
      stack.push({ id, close });
      return () => {
        const i = stack.findIndex((l) => l.id === id);
        if (i >= 0) stack.splice(i, 1);
      };
    },
    handle(e) {
      if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return false;
      const top = stack[stack.length - 1];
      if (!top) return false;
      e.preventDefault();
      top.close();
      return true;
    },
    size: () => stack.length,
  };
}

const appStack = createLayerStack();
let listening = false;

function onKeyDown(e: KeyboardEvent) {
  appStack.handle(e);
}

/**
 * Registers an open layer with the app's one Escape stack. Call when the
 * layer opens (in an effect) and call the returned function when it closes.
 * The newest layer is the top: it closes first.
 */
export function pushEscapeLayer(close: () => void): () => void {
  if (!listening && typeof window !== "undefined") {
    window.addEventListener("keydown", onKeyDown);
    listening = true;
  }
  const pop = appStack.push(close);
  return () => {
    pop();
    if (appStack.size() === 0 && listening && typeof window !== "undefined") {
      window.removeEventListener("keydown", onKeyDown);
      listening = false;
    }
  };
}

/**
 * Tab inside a modal: which element should take focus instead of the
 * browser's default, or null to let the default happen. Wraps from the
 * last element to the first (and back with Shift), and pulls focus back in
 * when it sits outside the list.
 */
export function wrapFocus<T>(focusables: readonly T[], active: T | null, shift: boolean): T | null {
  if (focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const i = active == null ? -1 : focusables.indexOf(active);
  if (i < 0) return shift ? last : first;
  if (shift && i === 0) return last;
  if (!shift && i === focusables.length - 1) return first;
  return null;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The DOM half of wrapFocus: keeps Tab and Shift+Tab inside `container`. */
export function trapTab(e: { key: string; shiftKey: boolean; defaultPrevented: boolean; preventDefault: () => void }, container: HTMLElement | null): void {
  if (e.key !== "Tab" || e.defaultPrevented || !container) return;
  const list = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("inert") && el.getClientRects().length > 0
  );
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const target = wrapFocus(list, active && container.contains(active) ? active : null, e.shiftKey);
  if (!target) return;
  e.preventDefault();
  target.focus();
}
