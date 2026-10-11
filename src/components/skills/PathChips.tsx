/**
 * The thirteen paths as 40 px chips: the attribute's polygon glyph in its hue
 * (the SkillLogo silhouette), the name, and a gold dot while an emblem on it
 * is ready. Links, so every path has its URL (/skills/<slug>).
 *
 * Momentum (momentum.md §B.5): once it is live, "Life" is the first chip
 * (/skills/life, the Life skill tree), the same .pchip with aria-current.
 * Before MOMENTUM_LAUNCH_DAY it is hidden, so the strip is exactly the
 * thirteen paths. The gate is the server's (this component renders there).
 */
import Link from "next/link";
import type { Attribute } from "@prisma/client";
import { ATTRIBUTES, ATTRIBUTE_META } from "@/lib/attributes";
import { attributeSlug, themeFor } from "@/lib/attribute-themes";
import { sidesFor } from "@/lib/skill-form";
import { todayKey } from "@/lib/life-day";
import { momentumLive } from "@/lib/momentum";
import { polygonPoints } from "@/components/home/sheet-math";
import { Icon } from "@/components/ui/Icon";
import type { PathSummary } from "./ladder";

/** The Life tab's route (a static segment beside /skills/[attribute]). */
export const LIFE_SKILLS_HREF = "/skills/life";

export function AttributeGlyph({ attribute, size = 14, filled = false }: { attribute: Attribute; size?: number; filled?: boolean }) {
  const hue = themeFor(attribute).color;
  return (
    <svg viewBox="0 0 14 14" width={size} height={size} aria-hidden="true" focusable="false">
      <polygon
        points={polygonPoints(sidesFor(attribute), 7, 7, 6)}
        fill={filled ? hue : "none"}
        stroke={hue}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PathChips({ current, summary, life = momentumLive(todayKey()) }: { current: Attribute | "LIFE"; summary: Record<Attribute, PathSummary>; life?: boolean }) {
  return (
    <nav aria-label="Paths">
      <ul className="pathchips">
        {life && (
          <li>
            <Link href={LIFE_SKILLS_HREF} className="pchip" aria-current={current === "LIFE" ? "page" : undefined} aria-label="Life skill tree">
              <Icon name="flame" size={14} />
              Life
            </Link>
          </li>
        )}
        {ATTRIBUTES.map((a) => {
          const ready = summary[a].ready;
          return (
            <li key={a}>
              <Link
                href={`/skills/${attributeSlug(a)}`}
                className="pchip"
                aria-current={a === current ? "page" : undefined}
                aria-label={`${ATTRIBUTE_META[a].label} path${ready > 0 ? `, ${ready} ready` : ""}`}
              >
                <AttributeGlyph attribute={a} />
                {ATTRIBUTE_META[a].label}
                {ready > 0 && <span className="rdot" aria-hidden="true" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
