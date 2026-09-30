"use client";

/**
 * The top bar (56; 60 from 600; 52 when max-height is 760). Opaque, never blurred.
 *   compact: crest button (→ You) · eyebrow + display-s title · Asks bell
 *   medium:  title · the section's sub-page tabs · Asks bell
 *   wide:    title · Asks bell (the sidebar carries the sub-pages)
 * The MiniLedger docks here (absolute, fades in) once the page's ledger scrolls away.
 * Titles come from nav.titleFor(); a page overrides with <ShellTitle/>.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { todayKey } from "@/lib/life-day";
import { Crest } from "@/components/ui/Crest";
import { TabLinks } from "@/components/ui/Tabs";
import { cx } from "@/components/ui/cx";
import { AsksBell } from "./AsksSheet";
import { MiniLedger } from "./MiniLedger";
import { activeSub, sectionById, sectionOf, titleFor } from "./nav";
import { useShell } from "./shell-store";
import { crestLabel } from "./shell-types";

export function TopBar() {
  const pathname = usePathname();
  const override = useShell((s) => s.title);
  const character = useShell((s) => s.data?.character ?? null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const fallback = titleFor(pathname, todayKey());
  const eyebrow = override ? override.eyebrow ?? null : fallback.eyebrow;
  const title = override?.title ?? fallback.title;
  const section = sectionOf(pathname);
  const sub = activeSub(pathname);

  return (
    <header className={cx("topbar", scrolled && "scrolled")} data-chrome="">
      <Link className="crest-btn" href="/you" aria-label={crestLabel(character)}>
        <Crest level={character?.level ?? null} material={character?.material} size={38} />
      </Link>
      <div className="tb-title">
        {eyebrow && <span className="t-eyebrow">{eyebrow}</span>}
        <h1 suppressHydrationWarning>{title}</h1>
      </div>
      {section && (
        <TabLinks className="tb-tabs" items={sectionById(section).subs} current={sub} label={`${sectionById(section).label} pages`} />
      )}
      <div className="tb-end">
        <MiniLedger />
        <AsksBell />
      </div>
    </header>
  );
}
