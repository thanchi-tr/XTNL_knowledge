/**
 * FROZEN CONTRACT — TabLinks, Segmented, Switch, SectionHeader, PageActions, Skeleton (L0-foundation).
 *
 *   <TabLinks items={[{ href, label }]} current="/today" label="Today pages"/>   40 px, aria-current
 *   <Segmented value="full" options={[{ value, label }]} onChange label="Motion"/>  40 px, aria-pressed
 *   <Switch checked onChange label="Rest tomorrow"/>   52×32 inside a 44 hit area, role=switch
 *   <SectionHeader title="Must" aside="0 of 3 kept" as="h2"/>   diamond + caps heading + right aside; wraps
 *   <PageActions>…buttons…</PageActions>   in-page headers carry actions only (the title lives in the top bar)
 *   <Skeleton w h r/> · <SkeletonCard lines/>   static blocks at their final geometry, no shimmer
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

export function TabLinks({
  items,
  current,
  label,
  className,
}: {
  items: { href: string; label: string }[];
  /** The href that is current (exact). */
  current: string | null;
  label: string;
  className?: string;
}) {
  return (
    <nav className={cx("tabs", className)} aria-label={label}>
      {items.map((it) => (
        <Link key={it.href} href={it.href} className="tab-s" aria-current={it.href === current ? "page" : undefined}>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={cx("segc", className)} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** The accessible name; say it in words next to the switch as well. */
  label: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx("switch-hit", className)}
      onClick={() => onChange(!checked)}
    >
      <span className="switch" aria-hidden="true" />
    </button>
  );
}

export function SectionHeader({
  title,
  aside,
  as: Tag = "h2",
  id,
  className,
  tabIndex,
}: {
  title: ReactNode;
  aside?: ReactNode;
  as?: "h2" | "h3";
  id?: string;
  className?: string;
  /** -1 makes the heading a focus target a page can move focus to (never a Tab stop). */
  tabIndex?: -1;
}) {
  return (
    <div className={cx("sec-h", className)}>
      <span className="lane-mark" aria-hidden="true" />
      <Tag id={id} tabIndex={tabIndex}>
        {title}
      </Tag>
      {aside != null && <span className="aside">{aside}</span>}
    </div>
  );
}

export function PageActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("ph", className)}>{children}</div>;
}

export function Skeleton({ w = "100%", h = 14, r = 8, className }: { w?: number | string; h?: number | string; r?: number; className?: string }) {
  return <span aria-hidden="true" className={cx("skel", className)} style={{ display: "block", width: w, height: h, borderRadius: r }} />;
}

export function SkeletonCard({ lines = 3, height, className }: { lines?: number; height?: number; className?: string }) {
  return (
    <div className={cx("skel-card", className)} aria-hidden="true" style={height ? { minHeight: height } : undefined}>
      <Skeleton w="40%" h={12} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} w={i === lines - 1 ? "70%" : "100%"} h={16} />
      ))}
    </div>
  );
}
