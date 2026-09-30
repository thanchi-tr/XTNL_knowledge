"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { XtnlLogo } from "./Logo";
import { useStreak } from "./StreakProvider";
import { openCapture } from "./capture/CaptureFab";

/**
 * The width from which a link sits in the row; below it, it is in More.
 *
 * Measured against Inter at the header's sizes, with the widest right-hand
 * cluster (title badge from lg, a 3-digit streak, 'Today 12', 'Review 123',
 * '+ Capture'; with both counts up, the plain Today and Review links step
 * aside, see DUPLICATE_CLASS):
 *
 *   md–xl  (768–1279)  Today · Review · Skills · More   needs ~651 px (~790 from lg)
 *   xl–2xl (1280–1535) + Overview · Library             needs ~1059 px
 *   2xl    (1536+)     all seven, no More               needs ~1182 px
 *
 * against content widths of 674 (768 with a 17 px scrollbar), 839 (the
 * unfolded Fold, 932), 905 (1024 with a scrollbar) and 1135 (1280 with a
 * scrollbar). All seven in the row from 1024, as before, needed ~1326 px —
 * the whole page scrolled sideways whenever both counts showed. Links fold
 * into More before anything shrinks.
 */
type RowFrom = "md" | "xl" | "2xl";

/**
 * Today leads: it is where the app opens and where every kind of work —
 * reviews, duties, habits — meets. Review and Skills stay beside it at every
 * width; the rest fold into More until there is room for them.
 */
const LINKS: { href: string; label: string; from: RowFrom }[] = [
  { href: "/today", label: "Today", from: "md" },
  { href: "/review", label: "Review", from: "md" },
  { href: "/overview", label: "Overview", from: "xl" },
  { href: "/library", label: "Library", from: "xl" },
  { href: "/skills", label: "Skills", from: "md" },
  { href: "/dashboard", label: "Analytics", from: "2xl" },
  { href: "/taxonomy", label: "Taxonomy", from: "2xl" },
];

/** Written out whole so Tailwind's scanner sees every class. */
const ROW_CLASS: Record<RowFrom, string> = {
  md: "",
  xl: "hidden xl:inline",
  "2xl": "hidden 2xl:inline",
};

/**
 * 'Today N' and 'Review N' (NavTodayLink, NavReviewLink) are links to the
 * same two pages with a count on them. While one is in the header, the plain
 * link in the row would be a second copy of it, so it steps aside; at zero
 * the button renders nothing and the plain link is back.
 */
const DUPLICATE_CLASS: Record<string, string> = {
  "/today": "group-has-[a.nav-review[href='/today']]/nav:hidden",
  "/review": "group-has-[a.nav-review[href='/review']]/nav:hidden",
};

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
      className="group/nav sticky top-0 z-20 border-b"
      style={{
        minHeight: "var(--nav-h)",
        background: "rgba(4,8,15,0.88)",
        backdropFilter: "blur(10px)",
        borderColor: "var(--line)",
      }}
    >
      <div className="site-container flex items-center justify-between gap-4" style={{ height: "var(--nav-h)" }}>
        <div className="flex items-center gap-6 xl:gap-10">
          <Link href="/" className="flex items-center gap-2.5">
            <XtnlLogo size={22} />
            {/* Under 375px (the Fold's cover screen is ~344) 'Today N' and
                'Review N' together need the word's width; the mark stays
                and the word is still read out. */}
            <span
              className="mono font-bold max-[375px]:sr-only"
              style={{ fontSize: 13, letterSpacing: "0.16em", color: "var(--ink-0)" }}
            >
              XTNL
            </span>
            {/* From xl only: between sm and xl the header needs its width. */}
            <span
              className="hidden xl:inline"
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
                  className={`relative whitespace-nowrap py-1 no-underline transition-colors ${ROW_CLASS[link.from]} ${DUPLICATE_CLASS[link.href] ?? ""}`}
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
            {/* One More per tier, each holding exactly what its row leaves
                out, so its lit state is always about the links inside it. */}
            <MoreMenu className="xl:hidden" links={LINKS.filter((l) => l.from !== "md")} pathname={pathname} />
            <MoreMenu className="hidden xl:block 2xl:hidden" links={LINKS.filter((l) => l.from === "2xl")} pathname={pathname} />
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

/** The links inside an open More, in order. */
function moreItems(root: HTMLElement | null): HTMLAnchorElement[] {
  return Array.from(root?.querySelectorAll<HTMLAnchorElement>("a.nav-more-item") ?? []);
}

/** Where an arrow, Home or End key moves focus among `n` links; `i` is -1 while focus is on More itself. */
function stepFocus(key: string, i: number, n: number): number {
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  if (key === "ArrowUp") return i < 0 ? n - 1 : (i - 1 + n) % n;
  return i < 0 ? 0 : (i + 1) % n;
}

/**
 * The links the row leaves out, as a disclosure: a button that shows or
 * hides a list of ordinary links, which is the pattern for site navigation.
 * It used to announce itself as an ARIA menu without a menu's keyboard
 * model, so a screen reader promised arrow keys that did nothing.
 *
 * Keyboard: Tab walks in and out as it would through any links, and leaving
 * closes it. Down or Up on More opens it on the first or last link; the
 * arrows, Home and End then move between links. Escape closes it and, from
 * inside, puts focus back on More. A click outside or on a link closes it.
 */
function MoreMenu({
  links,
  pathname,
  className,
}: {
  links: { href: string; label: string }[];
  pathname: string;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  /** Set when a key opened the list: where focus goes once it has rendered. */
  const focusOnOpen = useRef<"first" | "last" | null>(null);
  const listId = useId();
  const active = links.some((l) => isActive(pathname, l.href));

  useEffect(() => {
    if (!open) return;
    const want = focusOnOpen.current;
    focusOnOpen.current = null;
    if (want) {
      const items = moreItems(rootRef.current);
      (want === "first" ? items[0] : items[items.length - 1])?.focus();
    }

    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      // A key another layer already took (the capture sheet, a field
      // cancelling its own edit) is not ours.
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const inside = rootRef.current?.contains(document.activeElement) ?? false;
      setOpen(false);
      if (inside) {
        // Claimed, so a sheet underneath does not close on the same press.
        e.preventDefault();
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const k = e.key;
    if (k !== "ArrowDown" && k !== "ArrowUp" && k !== "Home" && k !== "End") return;
    if (!open) {
      if (e.target !== buttonRef.current || k === "Home" || k === "End") return;
      e.preventDefault();
      focusOnOpen.current = k === "ArrowDown" ? "first" : "last";
      setOpen(true);
      return;
    }
    const items = moreItems(rootRef.current);
    if (items.length === 0) return;
    e.preventDefault();
    items[stepFocus(k, items.indexOf(document.activeElement as HTMLAnchorElement), items.length)].focus();
  }

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        // Tabbing out closes it. A null target (a click on something that
        // takes no focus, as Safari does with links) is not leaving: the
        // outside-click listener decides those.
        const next = e.relatedTarget as Node | null;
        if (open && next && !e.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="relative whitespace-nowrap py-1 transition-colors"
        style={{ ...LINK_STYLE(active), background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        More <span aria-hidden="true">▾</span>
        <span
          aria-hidden
          className="absolute -bottom-px left-0 right-0 h-px origin-left transition-transform duration-200"
          style={{ background: "var(--green)", transform: active ? "scaleX(1)" : "scaleX(0)" }}
        />
      </button>
      {open && (
        <ul id={listId} className="nav-more-menu card">
          {links.map((link) => {
            const on = isActive(pathname, link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={on ? "page" : undefined}
                  className="nav-more-item no-underline"
                  style={LINK_STYLE(on)}
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
