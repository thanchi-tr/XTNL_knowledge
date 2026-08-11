"use client";

import { useEffect } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { fieldColor } from "@/lib/palette";

export interface FieldBreakdownRow {
  name: string;
  level: number;
  domainCount: number;
  totalXp: number;
}

function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const spring = useSpring(value, { stiffness: 120, damping: 20 });
  const display = useTransform(spring, (v) => v.toFixed(decimals));

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span>{display}</motion.span>;
}

/**
 * Field ranking bar.
 *
 * The bar length is a *relative rank* — each field against the highest
 * field level — not progress toward a next level. Field level is
 * `floor(sum(domainLevel ^ 0.75))`, which has no single invertible
 * threshold, so a progress-style bar here would be fabricated. The home
 * page's static twin was removed; this is now the only implementation.
 */
export function AnimatedLevelBreakdown({ rows }: { rows: FieldBreakdownRow[] }) {
  const sorted = [...rows].sort((a, b) => b.level - a.level);
  const maxLevel = Math.max(1, ...sorted.map((r) => r.level));

  return (
    <ul className="space-y-3">
      {sorted.map((row, i) => {
        const accent = fieldColor(row.name);
        const pct = (row.level / maxLevel) * 100;
        return (
          <motion.li
            key={row.name}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            className="flex items-center gap-3"
          >
            <span className="mono w-4 shrink-0 text-right" style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium" style={{ fontSize: 13, color: "var(--ink-0)" }}>
                  {row.name}
                </span>
                <span className="mono shrink-0" style={{ fontSize: 11, color: "var(--ink-2)" }}>
                  {row.domainCount} domain{row.domainCount === 1 ? "" : "s"} ·{" "}
                  <AnimatedNumber value={row.totalXp} decimals={0} /> pts
                </span>
              </div>
              <div
                className="mt-1.5 h-1.5 w-full overflow-hidden"
                style={{ borderRadius: 3, background: "var(--sub)" }}
              >
                <motion.div
                  className="h-full"
                  style={{ backgroundColor: accent, borderRadius: 3 }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 14 }}
                />
              </div>
            </div>
            <span
              className="mono shrink-0 px-2 py-0.5"
              style={{
                fontSize: 11,
                borderRadius: 6,
                border: `1px solid ${accent}55`,
                color: accent,
              }}
            >
              L<AnimatedNumber value={row.level} />
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
}
