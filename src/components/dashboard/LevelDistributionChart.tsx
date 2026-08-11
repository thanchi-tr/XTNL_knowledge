"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_THEME } from "@/lib/palette";

export interface LevelBucket {
  level: number;
  count: number;
}

export function LevelDistributionChart({ data }: { data: LevelBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: -16, right: 8 }}>
        <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
        <XAxis
          dataKey="level"
          stroke={CHART_THEME.axis}
          fontSize={11}
          tickLine={false}
          tickFormatter={(v) => `L${v}`}
        />
        <YAxis stroke={CHART_THEME.axis} fontSize={11} tickLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "rgba(155, 107, 255, 0.06)" }}
          contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 6 }}
          labelStyle={{ color: "#eef2f8" }}
          formatter={(value) => [`${value} idea${Number(value) === 1 ? "" : "s"}`, "Count"]}
          labelFormatter={(v) => `Level ${v}`}
        />
        <Bar dataKey="count" fill="#4d9cf5" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
