"use client";

import { motion } from "framer-motion";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_THEME } from "@/lib/palette";

export interface GhostRadarDatum {
  field: string;
  current: number;
  ghost: number | null;
}

/** A radar needs at least three axes to enclose an area. */
const MIN_RADAR_AXES = 3;

/**
 * Current coverage against the same measurement 7 days ago.
 *
 * Falls back to a paired bar list below three fields, for the same reason
 * as `FieldRadarChart`: two axes render as a bare line through the centre,
 * which the previous version still drew at 340px, leaving a tall panel
 * containing a single vertical stroke.
 */
export function GhostRadarChart({ data, hasGhost }: { data: GhostRadarDatum[]; hasGhost: boolean }) {
  const maxLevel = Math.max(5, ...data.map((d) => Math.max(d.current, d.ghost ?? 0)));
  const fullMark = Math.ceil((maxLevel * 1.25) / 5) * 5;

  const footnote = !hasGhost && (
    <p className="mt-3 text-center" style={{ fontSize: 11, color: "var(--ink-3)" }}>
      Historical comparison builds up over your first week — no 7-day-old snapshot yet.
    </p>
  );

  if (data.length === 0) {
    return (
      <p className="py-16 text-center" style={{ fontSize: 13, color: "var(--ink-2)" }}>
        No fields yet.
      </p>
    );
  }

  if (data.length < MIN_RADAR_AXES) {
    return (
      <div>
        <div className="space-y-4 py-2">
          {data.map((d) => {
            const delta = d.ghost === null ? null : d.current - d.ghost;
            return (
              <div key={d.field}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="truncate" style={{ fontSize: 13, color: "var(--ink-0)" }}>
                    {d.field}
                  </span>
                  <span className="mono shrink-0" style={{ fontSize: 12, color: "var(--ink-1)" }}>
                    L{d.current}
                    {delta !== null && delta !== 0 && (
                      <span style={{ color: delta > 0 ? "var(--green)" : "var(--red)" }}>
                        {" "}
                        {delta > 0 ? "+" : ""}
                        {delta}
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden" style={{ borderRadius: 3, background: "var(--sub)" }}>
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.max(2, (d.current / fullMark) * 100)}%`,
                      borderRadius: 3,
                      background: "var(--blue)",
                    }}
                  />
                </div>
                {d.ghost !== null && (
                  <div className="mt-1 h-1 w-full overflow-hidden" style={{ borderRadius: 2, background: "var(--sub)" }}>
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.max(1, (d.ghost / fullMark) * 100)}%`,
                        borderRadius: 2,
                        background: "var(--ink-3)",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="pt-1" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          Plots as a radar once you have {MIN_RADAR_AXES} or more fields.
        </p>
        {footnote}
      </div>
    );
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <ResponsiveContainer width="100%" height={340}>
          <RadarChart data={data} outerRadius="70%">
            <PolarGrid stroke={CHART_THEME.grid} />
            <PolarAngleAxis dataKey="field" tick={{ fill: "var(--ink-1)", fontSize: 11 }} />
            <PolarRadiusAxis
              angle={90}
              domain={[0, fullMark]}
              tick={{ fill: CHART_THEME.axis, fontSize: 10 }}
              tickCount={4}
            />
            {hasGhost && (
              <Radar
                dataKey="ghost"
                stroke="#5a7490"
                fill="#5a7490"
                fillOpacity={0.10}
                strokeOpacity={0.35}
                strokeDasharray="4 3"
              />
            )}
            <Radar
              dataKey="current"
              stroke="#4d9cf5"
              fill="#4d9cf5"
              fillOpacity={0.20}
              strokeWidth={2}
              dot={{ r: 2.5, fill: "#00cc7a", strokeWidth: 0 }}
              animationEasing="ease-out"
              animationDuration={900}
            />
            <Tooltip
              contentStyle={{
                background: CHART_THEME.tooltipBg,
                border: `1px solid ${CHART_THEME.tooltipBorder}`,
                borderRadius: 10,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--ink-0)" }}
              formatter={(value, name) => [`Level ${value}`, name === "ghost" ? "7 days ago" : "Now"]}
            />
          </RadarChart>
        </ResponsiveContainer>
      </motion.div>
      {footnote}
    </div>
  );
}
