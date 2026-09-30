"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { XtnlLogo } from "./Logo";
import { useStreak } from "./StreakProvider";
import { openCapture } from "./capture/CaptureFab";

/**
 * Today leads: it is where the app opens and where every kind of work —
 * reviews, duties, habits — meets. The two screens opened once a month,
 * Analytics and Taxonomy, fold into More at medium widths so seven links
 * never crowd the row; at large widths there is room for all of them.
 */
const LINKS: { href: string; label: string; more?: boolean }[] = [
  { href: "/today", label: "Today" },
  { href: "/review", label: "Review" },
  { href: "/overview", label: "Overview" },
  { href: "/library", label: "Library" },
  { href: "/skills", label: "Skills" },
  { href: "/dashboard", label: "Analytics", more: true },
  { href: "/taxonomy", label: "Taxonomy", more: true },
];

/** Sections with sub-routes (/skills/mind, /today/rules) stay lit on their children. */
function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const LINK_STYLE = (active: boolean): React.CSSProperties => ({
  fontSize: 11,
  fontWeight: active ? 600 : 500,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: active ? "var(--green)" : "var(--ink-2)",
});

interface AppNavProps {
  /** Rendered as a slot so an async Server Component (NavTitleBadge) can live inside this client component. */
  titleSlot?: React.ReactNode;
  /** The open musts and due todos, as a link to the board — same arrangement, a count from the database. */
  todaySlot?: React.ReactNode;
  /** Same arrangement for the due-review shortcut, which needs a count from the database. */
  reviewSlot?: React.ReactNode;
}

export function AppNav({ titleSlot, todaySlot, reviewSlot }: AppNavProps) {
  const pathname = usePathname();
  const { streak } = useStreak();

  return (
    <header
      className="sticky top-0 z-20 border-b"
      style={{
        minHeight: "var(--nav-h)",
        background: "rgba(4,8,15,0.88)",
        backdropFilter: "blur(10px)",
        borderColor: "var(--line)",
      }}
    >
      <div className="site-container flex items-center justify-between gap-4" style={{ height: "var(--nav-h)" }}>
        <div className="flex items-center gap-10">
          <Link href="/" className="flex items-center gap-2.5">
            <XtnlLogo size={22} />
            <span
              className="mono font-bold"
              style={{ fontSize: 13, letterSpacing: "0.16em", color: "var(--ink-0)" }}
            >
              XTNL
            </span>
            <span
              className="hidden sm:inline"
              style={{ fontSize: 10, letterSpacing: "0.10em", color: "var(--ink-3)", textTransform: "uppercase" }}
            >
              Knowledge
            </span>
          </Link>

          <div className="hidden items-center gap-7 md:flex">
            {LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative whitespace-nowrap py-1 no-underline transition-colors ${link.more ? "hidden lg:inline" : ""}`}
                  style={LINK_STYLE(active)}
                >
                  {link.label}
                  {/* Underline rule, as in the thesis nav — present only on
                      the active item rather than an always-on pill. */}
                  <span
                    aria-hidden
                    className="absolute -bottom-px left-0 right-0 h-px origin-left transition-transform duration-200"
                    style={{
                      background: "var(--green)",
                      transform: active ? "scaleX(1)" : "scaleX(0)",
                    }}
                  />
                </Link>
              );
            })}
            <MoreMenu links={LINKS.filter((l) => l.more)} pathname={pathname} />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          {titleSlot}
          {/* Was a 🔥 emoji badge with a glowing gold numeral. The figure is
              the information; the label states what it counts. */}
          {streak > 0 && (
            <span
              className="hidden items-baseline gap-1.5 sm:flex"
              title="Consecutive days with review activity"
            >
              <span className="label-xs">Streak</span>
              <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--green)" }}>
                {streak}
              </span>
            </span>
          )}
          {todaySlot}
          {reviewSlot}
          {/* Was 'New Idea', a link to the full form. Capture now takes any
              line — a task, a habit, a goal or an idea — from any page, and
              the full idea form is one link inside the sheet. Same cloth as
              before (`nav-new-idea`), so the pair still reads 'N waiting',
              then 'add another'. Phones get the corner button instead, which
              keeps this row inside 375px. */}
          <button
            type="button"
            onClick={() => openCapture()}
            className="btn-primary nav-new-idea hidden sm:inline-flex"
            style={{ padding: "8px 16px" }}
            data-capture-ui=""
            title="Capture a task, habit, goal or idea — C or Ctrl+K"
            aria-keyshortcuts="c Control+K Meta+K"
          >
            + Capture
          </button>
        </div>
      </div>

      {/* Mobile: the links get their own horizontally scrollable strip
          rather than being hidden entirely, which is what the previous
          `hidden md:flex` did — leaving phones with no way to navigate. */}
      <div
        className="flex items-center gap-1 overflow-x-auto px-4 pb-1.5 md:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className="whitespace-nowrap no-underline"
              style={{
                // Padding, not just text. These were bare 19px-tall labels —
                // half the 44px a thumb actually needs, and the tap target of
                // every link in the app on a phone. The gap shrinks to
                // compensate so the strip still fits the same links.
                display: "inline-flex",
                alignItems: "center",
                minHeight: 40,
                padding: "0 10px",
                borderRadius: 8,
                ...LINK_STYLE(active),
                background: active ? "var(--green-10)" : "transparent",
              }}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}

/** The folded links at medium widths. Closes on a pick, a click outside, or Escape. */
function MoreMenu({ links, pathname }: { links: { href: string; label: string }[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const active = links.some((l) => isActive(pathname, l.href));

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative lg:hidden">
      <button
        type="button"
        className="relative whitespace-nowrap py-1 transition-colors"
        style={{ ...LINK_STYLE(active), background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        More ▾
        <span
          aria-hidden
          className="absolute -bottom-px left-0 right-0 h-px origin-left transition-transform duration-200"
          style={{ background: "var(--green)", transform: active ? "scaleX(1)" : "scaleX(0)" }}
        />
      </button>
      {open && (
        <div className="nav-more-menu card" role="menu">
          {links.map((link) => {
            const on = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                role="menuitem"
                aria-current={on ? "page" : undefined}
                className="nav-more-item no-underline"
                style={LINK_STYLE(on)}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
