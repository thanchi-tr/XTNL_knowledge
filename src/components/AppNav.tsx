"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { XtnlLogo } from "./Logo";
import { useStreak } from "./StreakProvider";
import { useTownPulse } from "./town/useTownPulse";
import { forDay, openReqs } from "@/lib/town/pulse-core";

const LINKS = [
  { href: "/overview", label: "Overview" },
  { href: "/review", label: "Review" },
  { href: "/library", label: "Library" },
  { href: "/dashboard", label: "Analytics" },
  { href: "/taxonomy", label: "Taxonomy" },
  { href: "/skills", label: "Skills" },
  { href: "/town", label: "Town" },
];

interface AppNavProps {
  /** Rendered as a slot so an async Server Component (NavTitleBadge) can live inside this client component. */
  titleSlot?: React.ReactNode;
  /** Same arrangement for the due-review shortcut, which needs a count from the database. */
  reviewSlot?: React.ReactNode;
}

/**
 * The Town link's dot: amber, and only while a stated reward waits on review
 * (today, an open requisition). Never for raids, peril or a fall, and never a
 * countdown: the nav asks for study, it does not sound the town's alarms.
 * Hidden on /town itself, where the requisitions are on the page.
 */
function TownDot() {
  return (
    <span
      aria-hidden
      className="inline-block"
      style={{ width: 6, height: 6, marginLeft: 5, borderRadius: 3, background: "var(--amber)", verticalAlign: "middle", transform: "translateY(-1px)" }}
    />
  );
}

export function AppNav({ titleSlot, reviewSlot }: AppNavProps) {
  const pathname = usePathname();
  const { streak } = useStreak();
  const town = useTownPulse();
  // `today` is this device's day; the requisitions lapse at the server's midnight, which it matches whenever the two share a zone.
  const open = town && pathname !== "/town" ? openReqs(forDay(town.pulse, town.today)) : [];
  const townNote = open.length
    ? `${open.length === 1 ? "A requisition is open" : "Requisitions are open"}: ${open.map((r) => `${r.field} ${r.got}/${r.need}`).join(", ")}`
    : null;

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
                  title={link.href === "/town" && townNote ? townNote : undefined}
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
                  {link.href === "/town" && townNote && (
                    <>
                      <TownDot />
                      <span className="sr-only"> ({townNote})</span>
                    </>
                  )}
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
          {reviewSlot}
          <Link href="/add" className="btn-primary nav-new-idea" style={{ padding: "8px 16px" }}>
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
              title={link.href === "/town" && townNote ? townNote : undefined}
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
              {link.href === "/town" && townNote && (
                <>
                  <TownDot />
                  <span className="sr-only"> ({townNote})</span>
                </>
              )}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
