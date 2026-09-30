/**
 * The thirteen paths as 40 px chips: the attribute's polygon glyph in its hue
 * (the SkillLogo silhouette), the name, and a gold dot while an emblem on it
 * is ready. Links, so every path has its URL (/skills/<slug>).
 */
import Link from "next/link";
import type { Attribute } from "@prisma/client";
import { ATTRIBUTES, ATTRIBUTE_META } from "@/lib/attributes";
import { attributeSlug, themeFor } from "@/lib/attribute-themes";
import { sidesFor } from "@/lib/skill-form";
import { polygonPoints } from "@/components/home/sheet-math";
import type { PathSummary } from "./ladder";

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

export function PathChips({ current, summary }: { current: Attribute; summary: Record<Attribute, PathSummary> }) {
  return (
    <nav aria-label="Paths">
      <ul className="pathchips">
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
