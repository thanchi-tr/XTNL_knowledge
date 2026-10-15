"use client";

/**
 * The compact sub-page strip (< 600 px), one implementation for both:
 *
 *   <SectionTabs/>   (this file) under the top bar, the current section's sub-pages:
 *                    Ideas (Review · Library · New idea · Roadmap · Fields & Domains),
 *                    Tasks (Board · <work tabs> · [+] · Weekly review · Habits · Rules), Body (This week · Exercise).
 *                    The work tabs (2026-10-12) come from the shell's data (ShellData.work, nav.ts
 *                    subsOf); the '+' (AddWorkTab, "Add a work tab") follows the last of them while
 *                    a slot is free.
 *                    Rendered once by AppShell; nothing on a profile page, where
 *                    YouTabs (home/YouTabs.tsx) is the strip, nor where a section
 *                    has a single page, nor anywhere outside the three sections.
 *   <SubTabs/>       the strip itself, which YouTabs renders for the profile pages
 *                    (with the Skills tab's ready dot).
 *
 * From 600 the top bar carries the same tabs (medium) and from 1280 the
 * sidebar does, so the strip hides itself there (chrome.css, you.css). The
 * items are nav.ts's own, so the places can never disagree. It is rendered
 * on the server from the path, so nothing shifts on hydration; every tab is
 * a 44 px target and the current one is aria-current="page".
 *
 * At 344 px a strip can be wider than the 312 px of content, so it scrolls
 * sideways (the kit's .tabs). Two things keep that honest (roadmap F16 seam
 * 10, shell-check):
 *   - the current tab is scrolled into view inside the strip on every route,
 *     by moving the strip's own scrollLeft (never scrollIntoView, which could
 *     also scroll the page under a restored scroll position), at once, with
 *     no smooth scroll;
 *   - a scroll cue: the edge with more tabs past it fades out over CUE_PX
 *     (data-fade "start", "end" or "both", the capture insert row's pattern),
 *     so the last tabs never sit off-screen with nothing showing they are
 *     there. A strip that fits shows no fade.
 */
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/cx";
import { AddWorkTab } from "./AddWorkTab";
import { activeSub, addWorkTabAfter, sectionById, sectionOf, subsOf, type SubPage } from "./nav";
import { useShell } from "./shell-store";

/** The fade's width, and the room left beside the current tab when it is scrolled in. */
const CUE_PX = 24;

type Fade = "start" | "end" | "both";

const MASK: Record<Fade, string> = {
  end: `linear-gradient(to right, #000 calc(100% - ${CUE_PX}px), transparent)`,
  start: `linear-gradient(to left, #000 calc(100% - ${CUE_PX}px), transparent)`,
  both: `linear-gradient(to right, transparent, #000 ${CUE_PX}px, #000 calc(100% - ${CUE_PX}px), transparent)`,
};

/** Which edges have more tabs past them; null when the strip fits. */
function fadeOf(el: HTMLElement): Fade | null {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 1) return null;
  const atStart = el.scrollLeft <= 1;
  const atEnd = el.scrollLeft >= max - 1;
  return atStart ? "end" : atEnd ? "start" : "both";
}

export interface SubTabsProps {
  items: readonly SubPage[];
  /** The current sub-page's href (nav.ts activeSub). */
  current: string | null;
  /** The strip's accessible name ("Ideas pages", "You"). */
  label: string;
  className?: string;
  /** Something after a tab's label (YouTabs: the Skills tab's ready dot). */
  extra?: (href: string) => ReactNode;
  /** Part of the shell's chrome: hidden in focus mode, like the bars. */
  chrome?: boolean;
  /** Something drawn right after one tab (the Tasks strip's '+', after the last work tab or Board). */
  after?: { href: string; node: ReactNode } | null;
}

export function SubTabs({ items, current, label, className, extra, chrome, after }: SubTabsProps) {
  const stripRef = useRef<HTMLElement>(null);
  const [fade, setFade] = useState<Fade | null>(null);

  // The cue follows the strip's scroll and width (a rotation, a resize).
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const update = () => setFade(fadeOf(strip));
    update();
    strip.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      strip.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // The current tab, scrolled into view inside the strip on every route (the page itself never moves).
  useEffect(() => {
    const strip = stripRef.current;
    const tab = strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!strip || !tab) return;
    const s = strip.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    if (t.left < s.left + CUE_PX) strip.scrollLeft += t.left - s.left - CUE_PX;
    else if (t.right > s.right - CUE_PX) strip.scrollLeft += t.right - s.right + CUE_PX;
    setFade(fadeOf(strip));
  }, [current]);

  const style: CSSProperties | undefined = fade ? { WebkitMaskImage: MASK[fade], maskImage: MASK[fade] } : undefined;

  return (
    <nav ref={stripRef} className={cx("tabs sub-tabs", className)} aria-label={label} data-fade={fade ?? undefined} data-chrome={chrome ? "" : undefined} style={style}>
      {items.map((s) => (
        <Fragment key={s.href}>
          <Link href={s.href} className="tab-s" aria-current={s.href === current ? "page" : undefined}>
            {s.label}
            {extra?.(s.href)}
          </Link>
          {after && after.href === s.href ? after.node : null}
        </Fragment>
      ))}
    </nav>
  );
}

/**
 * The current section's sub-pages under the top bar, on phones. Nothing on a profile page (YouTabs is there) or a
 * one-page section. On Tasks the open work tabs follow Board (subsOf), then the '+' while a slot is free.
 */
export function SectionTabs() {
  const pathname = usePathname();
  const work = useShell((s) => s.data?.work ?? null);
  const id = sectionOf(pathname);
  if (!id) return null;
  const section = sectionById(id);
  if (section.subs.length < 2) return null;
  const tasks = id === "tasks";
  const add = tasks && work?.canAdd ? { href: addWorkTabAfter(work.tabs), node: <AddWorkTab /> } : null;
  return <SubTabs className="sec-tabs" items={subsOf(id, tasks ? work?.tabs : null)} current={activeSub(pathname)} label={`${section.label} pages`} after={add} chrome />;
}
