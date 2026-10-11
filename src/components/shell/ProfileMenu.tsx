"use client";

/**
 * The profile menu: the character's game layer and Settings, out of the
 * three tabs (nav.ts PROFILE). Rendered once by AppShell.
 *
 *   useProfileButton()     the props every profile button carries (the top bar's crest
 *                          < 600, the rail's crest 600–1279, the sidebar's character card
 *                          ≥ 1280): aria-haspopup dialog, aria-expanded, aria-controls while
 *                          open, aria-current="true" on a profile page, and the click.
 *   <ProfileMenu/>         the kit Sheet titled "You" (the level caption under it when known):
 *                          Character, Skills, Loadout, Moments, Stats, Settings, each a
 *                          48 px row with its icon; the current page is aria-current.
 *   openProfileMenu() / closeProfileMenu()
 *
 * The Sheet brings the rest: a bottom sheet < 600 and a drawer from 600, the
 * scrim, the focus trap, the app's one Escape stack, and focus back to the
 * button that opened it. A row closes the menu as it navigates (onNavigate,
 * so Ctrl+click into a new tab leaves it open); any route change closes it.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { PROFILE, activeSub, isProfilePath } from "./nav";
import { useShell } from "./shell-store";
import { levelCaption } from "./shell-types";

/** The sheet's id: every profile button's aria-controls while it is open. */
export const PROFILE_MENU_ID = "profile-menu";

let menuOpen = false;
const listeners = new Set<() => void>();

function setMenuOpen(next: boolean): void {
  if (menuOpen === next) return;
  menuOpen = next;
  for (const l of listeners) l();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function openProfileMenu(): void {
  setMenuOpen(true);
}

export function closeProfileMenu(): void {
  setMenuOpen(false);
}

export function useProfileMenuOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => menuOpen,
    () => false
  );
}

export interface ProfileButtonProps {
  "aria-haspopup": "dialog";
  "aria-expanded": boolean;
  "aria-controls": string | undefined;
  "aria-current": "true" | undefined;
  onClick: () => void;
}

/** What a profile button carries. On a profile page it is the current item (no tab is). */
export function useProfileButton(): ProfileButtonProps {
  const pathname = usePathname();
  const open = useProfileMenuOpen();
  return {
    "aria-haspopup": "dialog",
    "aria-expanded": open,
    "aria-controls": open ? PROFILE_MENU_ID : undefined,
    "aria-current": isProfilePath(pathname) ? "true" : undefined,
    onClick: openProfileMenu,
  };
}

export function ProfileMenu() {
  const pathname = usePathname();
  const open = useProfileMenuOpen();
  const character = useShell((s) => s.data?.character ?? null);
  const current = isProfilePath(pathname) ? activeSub(pathname) : null;
  const caption = character ? levelCaption(character) : null;

  // Back, forward or any other route change closes it.
  useEffect(() => {
    closeProfileMenu();
  }, [pathname]);

  return (
    <Sheet open={open} onClose={closeProfileMenu} title={PROFILE.label} description={caption ?? undefined} id={PROFILE_MENU_ID}>
      <nav aria-label={PROFILE.label}>
        <ul className="pm-list">
          {PROFILE.subs.map((p) => (
            <li key={p.href}>
              <Link className="pm-row" href={p.href} aria-current={current === p.href ? "page" : undefined} onNavigate={closeProfileMenu}>
                <Icon name={p.icon ?? PROFILE.icon} />
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Sheet>
  );
}
