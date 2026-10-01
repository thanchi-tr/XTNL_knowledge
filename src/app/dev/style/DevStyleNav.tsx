"use client";

/**
 * The strip that links every /dev/style page: the style guide and each
 * lane's fixture route (nav.DEV_STYLE_PAGES, which also gives their top-bar
 * titles). Rendered once by /dev/style/layout.tsx, so every sub-page carries
 * it without touching the lanes' own files.
 */
import { usePathname } from "next/navigation";
import { DEV_STYLE_PAGES } from "@/components/shell/nav";
import { TabLinks } from "@/components/ui/Tabs";

/** The page a path sits under (longest match), for aria-current. */
export function devStyleCurrent(pathname: string | null): string | null {
  if (!pathname) return null;
  let best: string | null = null;
  for (const p of DEV_STYLE_PAGES) {
    const under = pathname === p.href || pathname.startsWith(`${p.href}/`);
    if (under && (!best || p.href.length > best.length)) best = p.href;
  }
  return best;
}

export function DevStyleNav() {
  const pathname = usePathname();
  return (
    <div className="page" style={{ paddingBottom: 0 }}>
      <TabLinks label="Style guide pages" items={[...DEV_STYLE_PAGES]} current={devStyleCurrent(pathname)} />
    </div>
  );
}
