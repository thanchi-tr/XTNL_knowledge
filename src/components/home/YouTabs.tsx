"use client";

/**
 * The profile pages as tabs, on compact only (< 600 px): Character, Skills,
 * Loadout, Moments, Stats, Settings (nav.ts PROFILE, the profile menu's own
 * list). The Skills tab carries a gold dot while an emblem is ready to unlock.
 *
 * The strip is the shell's (shell/SubTabs.tsx: it scrolls the current tab
 * into view and fades the edge with more tabs past it), so the profile and
 * the three sections' strips look and behave alike. From 600 the top bar
 * carries these tabs, so this strip hides itself there (you.css).
 *
 * Only on a profile page: /you/roadmap sits under the You layout but is an
 * Ideas page (its strip is the shell's SectionTabs), so here it renders
 * nothing.
 */
import { usePathname } from "next/navigation";
import { PROFILE, activeSub, isProfilePath } from "@/components/shell/nav";
import { SubTabs } from "@/components/shell/SubTabs";
// Travels with the tabs, so /settings (L5) can render them too.
import "./you.css";

export function YouTabs({ ready = 0 }: { ready?: number }) {
  const pathname = usePathname();
  if (!isProfilePath(pathname)) return null;
  return (
    <SubTabs
      className="you-tabs"
      items={PROFILE.subs}
      current={activeSub(pathname)}
      label={PROFILE.label}
      extra={(href) => (href === "/skills" && ready > 0 ? <span className="rdot" role="img" aria-label={`${ready} ready to unlock`} /> : null)}
    />
  );
}
