/**
 * FROZEN CONTRACT — Button and IconButton (L0-foundation).
 *
 *   <Button variant="primary|secondary|quiet|gold|danger" size="md|lg" block? kbd="R" href?>Start review</Button>
 *     primary    ink-0 fill, page-coloured text (48 lg / 44 md). Green is no longer the call to action.
 *     secondary  line-ctl outline, 44
 *     quiet      text only, 44
 *     gold       ONLY for spending earned currency (Unlock, Equip now in a ceremony)
 *     danger     owed outline; pair with <TypedConfirm> for destructive actions
 *   With `href` it renders a Next <Link>. `kbd` shows a key hint on hover-capable devices only.
 *   `block` is full width (class `btn-block`: never the bare `block`, which is
 *   Tailwind's display:block utility and would win over .btn's inline-flex).
 *
 *   <IconButton label="Close" icon="x"/>   44×44, radius 12. `label` is required (it is the name).
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "gold" | "danger";

interface Common {
  variant?: ButtonVariant;
  size?: "md" | "lg";
  block?: boolean;
  /** Key hint ("R", "Enter"). Hidden on touch devices. */
  kbd?: string;
  icon?: IconName;
  children?: ReactNode;
  className?: string;
}

type AsButton = Common & Omit<ComponentProps<"button">, keyof Common> & { href?: undefined };
type AsLink = Common & Omit<ComponentProps<typeof Link>, keyof Common> & { href: string };

export type ButtonProps = AsButton | AsLink;

/**
 * The class list a Button renders (exported for the checks). Every kit class
 * is namespaced: a bare name that is also a Tailwind utility (`block`,
 * `inline`, `ring`, `hidden`…) loses to the utilities layer.
 */
export function buttonClass(variant: ButtonVariant, size: "md" | "lg", block: boolean | undefined, className?: string): string {
  return cx("btn", `btn-${variant}`, size === "lg" && "lg", block && "btn-block", className);
}

function Inner({ icon, kbd, children }: Pick<Common, "icon" | "kbd" | "children">) {
  return (
    <>
      {icon && <Icon name={icon} />}
      {children}
      {kbd && (
        <span className="kbd" aria-hidden="true">
          {kbd}
        </span>
      )}
    </>
  );
}

export function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    const { variant = "secondary", size = "md", block, kbd, icon, children, className, ...rest } = props as AsLink;
    return (
      <Link {...rest} className={buttonClass(variant, size, block, className)} aria-keyshortcuts={kbd ? kbdShortcut(kbd) : undefined}>
        <Inner icon={icon} kbd={kbd}>
          {children}
        </Inner>
      </Link>
    );
  }
  const { variant = "secondary", size = "md", block, kbd, icon, children, className, type = "button", ...rest } = props as AsButton;
  return (
    <button {...rest} type={type} className={buttonClass(variant, size, block, className)} aria-keyshortcuts={kbd ? kbdShortcut(kbd) : undefined}>
      <Inner icon={icon} kbd={kbd}>
        {children}
      </Inner>
    </button>
  );
}

/** "R" → "r", "Enter" → "Enter", "Ctrl+K" → "Control+K". */
function kbdShortcut(k: string): string {
  if (k.length === 1) return k.toLowerCase();
  return k.replace(/^Ctrl\+/i, "Control+");
}

interface IconButtonProps extends Omit<ComponentProps<"button">, "children"> {
  icon: IconName;
  /** The accessible name. Required: an icon alone says nothing to a screen reader. */
  label: string;
  /** An optional badge or overlay (e.g. <Badge count={3} pinned/>). */
  children?: ReactNode;
}

export function IconButton({ icon, label, className, type = "button", children, ...rest }: IconButtonProps) {
  return (
    <button {...rest} type={type} className={cx("icon-btn", className)} aria-label={label} title={rest.title ?? label}>
      <Icon name={icon} />
      {children}
    </button>
  );
}
