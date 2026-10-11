"use client";

/**
 * The top bar (56; 60 from 600; 52 when max-height is 760). Opaque, never blurred.
 *   compact: crest button (the profile menu) · eyebrow + display-s title · Asks bell
 *   medium:  title · the section's sub-page tabs (the profile's on a profile page) · Asks bell
 *            (Tasks: Board · <work tabs> · [+] · Weekly review · Rules; nav.ts subsOf over ShellData.work)
 *   wide:    title · Asks bell (the sidebar carries the sections' sub-pages); on a profile
 *            page the profile's tabs stay (data-group="you", chrome.css), since the
 *            sidebar lists only the sections
 * The MiniLedger docks here (absolute, fades in) once the page's ledger scrolls away.
 * Titles come from nav.titleFor(); a page overrides with <ShellTitle/>.
 */
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { todayKey } from "@/lib/life-day";
import { Crest } from "@/components/ui/Crest";
import { TabLinks } from "@/components/ui/Tabs";
import { cx } from "@/components/ui/cx";
import { AddWorkTab } from "./AddWorkTab";
import { AsksBell } from "./AsksSheet";
import { MiniLedger } from "./MiniLedger";
import { activeSub, addWorkTabAfter, groupOf, sectionById, subsOf, titleFor } from "./nav";
import { useProfileButton } from "./ProfileMenu";
import { useShell } from "./shell-store";
import { crestLabel } from "./shell-types";

export function TopBar() {
  const pathname = usePathname();
  const override = useShell((s) => s.title);
  const character = useShell((s) => s.data?.character ?? null);
  const work = useShell((s) => s.data?.work ?? null);
  const profile = useProfileButton();
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
  const group = groupOf(pathname);
  const sub = activeSub(pathname);
  const tasks = group === "tasks";
  const add = tasks && work?.canAdd ? { href: addWorkTabAfter(work.tabs), node: <AddWorkTab /> } : null;

  return (
    <header className={cx("topbar", scrolled && "scrolled")} data-chrome="" data-group={group ?? undefined}>
      <button type="button" className="crest-btn" aria-label={crestLabel(character)} data-tour="you-crest" {...profile}>
        <Crest level={character?.level ?? null} material={character?.material} size={38} />
      </button>
      <div className="tb-title">
        {eyebrow && <span className="t-eyebrow">{eyebrow}</span>}
        <h1 suppressHydrationWarning>{title}</h1>
      </div>
      {group && <TabLinks className="tb-tabs" items={subsOf(group, tasks ? work?.tabs : null)} current={sub} label={`${sectionById(group).label} pages`} after={add} />}
      <div className="tb-end">
        <MiniLedger />
        <AsksBell />
      </div>
    </header>
  );
}
