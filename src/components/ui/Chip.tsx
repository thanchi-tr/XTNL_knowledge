/**
 * FROZEN CONTRACT — Chip (L0-foundation).
 *
 *   <Chip tone="quiet|kept|owed|held|ready" icon? held? sigil?>Kept</Chip>
 *     One dialect: min-height 24, radius 8, 12/600, sentence case.
 *     held always pairs a hatch or glyph with a word; ready is the only material chip.
 *   <ChipButton pressed onClick>Filter</ChipButton>   the 40 px interactive variant
 */
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import { HeldGlyph, Icon, Sigil, type HeldKind, type IconName, type TrackSigil } from "./Icon";

export type ChipTone = "quiet" | "kept" | "owed" | "held" | "ready";

interface ChipProps {
  tone?: ChipTone;
  icon?: IconName;
  held?: HeldKind;
  sigil?: TrackSigil;
  children: ReactNode;
  className?: string;
  title?: string;
}

export function Chip({ tone = "quiet", icon, held, sigil, children, className, title }: ChipProps) {
  return (
    <span className={cx("chip", tone !== "quiet" && tone, className)} title={title}>
      {icon && <Icon name={icon} />}
      {held && <HeldGlyph kind={held} />}
      {sigil && <Sigil track={sigil} />}
      {children}
    </span>
  );
}

interface ChipButtonProps extends Omit<ComponentProps<"button">, "children"> {
  pressed?: boolean;
  children: ReactNode;
}

/** The 40 px interactive chip (filters, parse chips, RPE chips). aria-pressed carries the state. */
export function ChipButton({ pressed, children, className, type = "button", ...rest }: ChipButtonProps) {
  return (
    <button {...rest} type={type} className={cx("chip", "btn-chip", className)} aria-pressed={pressed === undefined ? undefined : pressed}>
      {children}
    </button>
  );
}
