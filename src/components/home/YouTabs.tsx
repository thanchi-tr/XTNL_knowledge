"use client";

/**
 * The You section's sub-pages as tabs, on compact only (< 600 px).
 *
 * From 600 the top bar carries the section tabs (medium) and from 1280 the
 * sidebar lists them, so this strip hides itself there (you.css). The list is
 * the shell's own nav model, so the three places can never disagree. The
 * Skills tab carries a gold dot while an emblem is ready to unlock.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeSub, sectionById } from "@/components/shell/nav";
// Travels with the tabs, so /settings (L5) can render them too.
import "./you.css";

export function YouTabs({ ready = 0 }: { ready?: number }) {
  const pathname = usePathname();
  const current = activeSub(pathname);
  const subs = sectionById("you").subs;
  return (
    <nav className="tabs you-tabs" aria-label="You">
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
