"use client";

/**
 * The You section's sub-pages as tabs, on compact only (< 600 px).
 *
 * From 600 the top bar carries the section tabs (medium) and from 1280 the
 * sidebar lists them, so this strip hides itself there (you.css). The list is
 * the shell's own nav model, so the three places can never disagree. The
 * Skills tab carries a gold dot while an emblem is ready to unlock.
 *
 * At 344 px the seven tabs are far wider than the 312 px of content, so the
 * strip scrolls sideways (the kit's .tabs). Two things keep that honest
 * (roadmap F16 seam 10, shell-check):
 *   - the current tab is scrolled into view inside the strip on every route,
 *     by moving the strip's own scrollLeft (never scrollIntoView, which could
 *     also scroll the page under a restored scroll position), at once, with
 *     no smooth scroll;
 *   - a scroll cue: the edge with more tabs past it fades out over CUE_PX
 *     (data-fade "start", "end" or "both", the capture insert row's pattern),
 *     so Stats and Settings never sit off-screen with nothing showing they are
 *     there. A strip that fits shows no fade.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeSub, sectionById } from "@/components/shell/nav";
// Travels with the tabs, so /settings (L5) can render them too.
import "./you.css";

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

export function YouTabs({ ready = 0 }: { ready?: number }) {
  const pathname = usePathname();
  const current = activeSub(pathname);
  const subs = sectionById("you").subs;
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
    <nav ref={stripRef} className="tabs you-tabs" aria-label="You" data-fade={fade ?? undefined} style={style}>
      {subs.map((s) => (
        <Link key={s.href} href={s.href} className="tab-s" aria-current={s.href === current ? "page" : undefined}>
          {s.label}
          {s.href === "/skills" && ready > 0 && (
            <span className="rdot" role="img" aria-label={`${ready} ready to unlock`} />
          )}
        </Link>
      ))}
    </nav>
  );
}
