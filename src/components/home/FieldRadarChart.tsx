"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_THEME } from "@/lib/palette";

export interface RadarDatum {
  field: string;
  level: number;
}

/** A radar needs at least three axes to enclose an area. */
const MIN_RADAR_AXES = 3;

/**
 * Coverage by field.
 *
 * Renders as a radar only when there are enough axes to make one. With one
 * or two fields a radar degenerates — two axes draw a bare line through the
 * centre, which the previous version still rendered at full 380px height,
 * producing a tall empty panel containing a vertical stroke. Below the
 * threshold this falls back to a horizontal bar list, which is the correct
 * shape for comparing two magnitudes anyway.
 */
export function FieldRadarChart({ data }: { data: RadarDatum[] }) {
  const maxLevel = Math.max(5, ...data.map((d) => d.level));
  const fullMark = Math.ceil((maxLevel * 1.25) / 5) * 5;

  if (data.length === 0) {
    return (
      <p className="py-16 text-center" style={{ fontSize: 13, color: "var(--ink-2)" }}>
        No fields yet.
      </p>
    );
  }

  if (data.length < MIN_RADAR_AXES) {
    return (
      <div className="space-y-3 py-4">
        {data.map((d) => (
          <div key={d.field}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="truncate" style={{ fontSize: 13, color: "var(--ink-0)" }}>
                {d.field}
              </span>
              <span className="mono shrink-0" style={{ fontSize: 12, color: "var(--green)" }}>
                L{d.level}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden" style={{ borderRadius: 3, background: "var(--sub)" }}>
              <div
                className="h-full"
                style={{
                  width: `${Math.max(2, (d.level / fullMark) * 100)}%`,
                  borderRadius: 3,
                  background: "var(--green)",
                }}
              />
            </div>
          </div>
        ))}
        <p className="pt-2" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          Coverage plots as a radar once you have {MIN_RADAR_AXES} or more fields.
        </p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={340}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke={CHART_THEME.grid} />
        <PolarAngleAxis dataKey="field" tick={{ fill: "var(--ink-1)", fontSize: 11 }} />
        <PolarRadiusAxis
          angle={90}
          domain={[0, fullMark]}
          tick={{ fill: CHART_THEME.axis, fontSize: 10 }}
          tickCount={4}
        />
        <Radar
          dataKey="level"
          stroke="#00cc7a"
          fill="#00cc7a"
          fillOpacity={0.18}
          strokeWidth={2}
          dot={{ r: 2.5, fill: "#00f090", strokeWidth: 0 }}
        />
        <Tooltip
          contentStyle={{
            background: CHART_THEME.tooltipBg,
            border: `1px solid ${CHART_THEME.tooltipBorder}`,
            borderRadius: 10,
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--ink-0)" }}
          formatter={(value) => [`Level ${value}`, "Level"]}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
