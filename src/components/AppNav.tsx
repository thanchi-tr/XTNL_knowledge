"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { XtnlLogo } from "./Logo";
import { useStreak } from "./StreakProvider";

const LINKS = [
  { href: "/overview", label: "Overview" },
  { href: "/review", label: "Review" },
  { href: "/library", label: "Library" },
  { href: "/dashboard", label: "Analytics" },
  { href: "/taxonomy", label: "Taxonomy" },
  { href: "/skills", label: "Skills" },
];

interface AppNavProps {
  /** Rendered as a slot so an async Server Component (NavTitleBadge) can live inside this client component. */
  titleSlot?: React.ReactNode;
}

export function AppNav({ titleSlot }: AppNavProps) {
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
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className="relative whitespace-nowrap py-1 no-underline transition-colors"
                  style={{
                    fontSize: 11,
                    fontWeight: active ? 600 : 500,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: active ? "var(--green)" : "var(--ink-2)",
                  }}
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
          <Link href="/add" className="btn-primary" style={{ padding: "8px 16px" }}>
            New Idea
          </Link>
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
          const active = pathname === link.href;
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
                fontSize: 11,
                fontWeight: active ? 600 : 500,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: active ? "var(--green)" : "var(--ink-2)",
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
